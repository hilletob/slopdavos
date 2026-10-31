import * as THREE from 'three/webgpu';
import { attribute, float, fract, mix, mx_noise_float, positionWorld, smoothstep, time, uv, vec2, vec3 } from 'three/tsl';
import { STREAMS } from './streams-data.js';
import { groundHeight } from './terrain.js';
import { winter } from './season.js';

// The streams of Davos (js/streams-data.js, tools/fetch-streams.mjs: OSM waterways): the Landwasser where its bed isn't
// mapped as an area, the Dischmabach, Flüelabach and Sertigbach, the side creeks and ditches. Each is a ribbon of
// running water along its line, in the direction it flows, between two banks of wet gravel draped on the terrain.
// The water's surface follows the ground downhill but never climbs (a bump of the 8 m grid leaves it up to 30 cm
// below the ground, in its bed): the ripples run downstream at a speed set by the slope, and the steep stretches
// (over ~8%) foam white. In winter (season.js) the banks lie under snow, ice creeps in from the edges and the open
// water narrows and darkens.

const STEP = 3; // metres between the ribbon's cross-sections on the larger streams (5 m on the small ones)
const LIFT = 0.06; // the water over the ground
const BANK = 0.25; // extra bank width either side, as a share of the water's width (plus 0.4 m)
const BANK_STEP = 6; // metres between the banks' cross-sections (a narrow strip on the ground: coarser than the water's)
const CELL = 800; // the ribbons are cut into square cells of this size, culled by the view
const MIN_PX = 1; // a strip is drawn as long as it stays about this many pixels wide

// The water ribbon of one stream and its two banks: cross-sections every few metres, the water's level kept from
// climbing downstream, the banks on the ground. Water attributes: uv (u across 0..1, v along in metres), aFlow (slope,
// for the speed and the foam); banks: uv (u 0 at the water, 1 outside)
function ribbon(s, out, bankOut) {
  const pts = [];
  for (let i = 0; i < s.pts.length; i += 2) pts.push({ x: s.pts[i], z: s.pts[i + 1] });
  const dense = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / (s.width >= 3 ? STEP : 5)));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  if (dense.length < 2) return;
  // Level: the ground, never higher than upstream, at most 30 cm below the ground
  let level = Infinity, along = 0;
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i], g = groundHeight(p.x, p.z) + LIFT;
    level = Math.max(g - 0.3, Math.min(level, g));
    p.y = level;
    if (i) along += Math.hypot(p.x - dense[i - 1].x, p.z - dense[i - 1].z);
    p.s = along;
  }
  // Slope over ±12 m (the drop downstream per metre)
  for (let i = 0; i < dense.length; i++) {
    let j0 = i, j1 = i;
    while (j0 > 0 && dense[i].s - dense[j0].s < 12) j0--;
    while (j1 < dense.length - 1 && dense[j1].s - dense[i].s < 12) j1++;
    dense[i].slope = Math.max(0, (dense[j0].y - dense[j1].y) / Math.max(1, dense[j1].s - dense[j0].s));
  }
  const half = s.width / 2;
  const { position, uv: uvs, flow } = out;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1e-6;
    // (the side normal of the segment; joints overlap a little, which the water hides)
    const nx = -dz / L, nz = dx / L;
    // (the level, but never under the ground at the vertex itself: on a cross-slope the water follows its bed's side)
    const P = (p, side) => { const x = p.x + nx * half * side, z = p.z + nz * half * side; return [x, Math.max(p.y, groundHeight(x, z) + 0.02), z]; };
    const quad = [[a, -1], [b, 1], [b, -1], [a, -1], [a, 1], [b, 1]]; // counter-clockwise seen from above
    for (const [p, side] of quad) {
      position.push(...P(p, side));
      uvs.push((side + 1) / 2, p.s);
      flow.push(p.slope);
      out.size.push(s.width);
    }
  }
  if (!bankOut) return;
  // Banks: from just under the water's edge outwards, each vertex on the ground, a cross-section every BANK_STEP m (a
  // vertex is raised where the ground would bulge through the chord to the next one)
  const w = s.width * BANK + 0.4, r0 = half - 0.15, r1 = half + w;
  const stride = Math.max(1, Math.round(BANK_STEP / (s.width >= 3 ? STEP : 5)));
  const sections = [];
  for (let i = 0; i < dense.length; i += stride) sections.push(dense[i]);
  if (sections[sections.length - 1] !== dense[dense.length - 1]) sections.push(dense[dense.length - 1]);
  const lift = 0.035;
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1], b = sections[i];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1e-6;
    const nx = -dz / L, nz = dx / L;
    for (const sideSign of [-1, 1]) {
      const at = (p, r) => [p.x + nx * r * sideSign, p.z + nz * r * sideSign];
      const B = {};
      for (const [p, key] of [[a, 'a'], [b, 'b']]) for (const r of [r0, r1]) { const [x, z] = at(p, r); B[key + r] = [x, groundHeight(x, z) + lift, z]; }
      // (the chords along both edges: raise their ends by what the ground at a third and two thirds pokes above them)
      for (const r of [r0, r1]) {
        const p = B['a' + r], q = B['b' + r];
        let over = 0;
        for (const t of [1 / 3, 0.5, 2 / 3]) {
          const x = p[0] + (q[0] - p[0]) * t, z = p[2] + (q[2] - p[2]) * t;
          over = Math.max(over, groundHeight(x, z) + lift - (p[1] + (q[1] - p[1]) * t));
        }
        p[1] += over; q[1] += over;
      }
      // counter-clockwise from above on either side
      const cells = sideSign > 0 ? [[a, r0], [b, r1], [b, r0], [a, r0], [a, r1], [b, r1]] : [[a, r1], [b, r0], [b, r1], [a, r1], [a, r0], [b, r0]];
      for (const [p, r] of cells) {
        bankOut.position.push(...B[(p === a ? 'a' : 'b') + r]);
        bankOut.uv.push(r === r0 ? 0 : 1, p.s);
        bankOut.size.push(w);
      }
    }
  }
}

// Running water: dark and clear in the deep middle, lighter over the shallow edges, ripples drifting downstream,
// white foam on the steep stretches; transparent at the edges. Winter: ice and snow in from the edges, darker water.
function createStreamMaterial() {
  // (physical: its specular can be turned down — a shallow stream over stones mirrors much less sky than a lake)
  const m = new THREE.MeshPhysicalNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.2, metalness: 0 });
  const across = uv().x, along = uv().y, slope = attribute('aFlow', 'float');
  const speed = slope.mul(18).add(0.35).min(3.2);
  const flowing = vec2(across.mul(3.1), along.mul(0.55).sub(time.mul(speed)));
  const ripple = mx_noise_float(vec3(flowing.x, flowing.y, time.mul(0.3))).mul(0.5).add(0.5);
  const fine = mx_noise_float(vec3(flowing.x.mul(4), flowing.y.mul(3), time.mul(0.8))).mul(0.5).add(0.5);
  const centre = float(1).sub(across.sub(0.5).abs().mul(2)); // 1 mid-stream, 0 at the banks
  const deep = vec3(0.006, 0.02, 0.02), shallow = vec3(0.045, 0.055, 0.04);
  let colour = mix(shallow, deep, smoothstep(0.1, 0.8, centre));
  colour = colour.add(vec3(0.05, 0.07, 0.08).mul(ripple.mul(fine)));
  // Foam: on the steep stretches, in streaks along the flow, at the edges first
  const steep = smoothstep(0.06, 0.16, slope);
  const streaks = smoothstep(0.55, 0.85, mx_noise_float(vec3(flowing.x.mul(2.2), flowing.y.mul(1.6), 0.0)).mul(0.5).add(0.5).add(fine.mul(0.3)));
  const foam = steep.mul(streaks.add(float(1).sub(centre).mul(0.35))).min(1);
  colour = mix(colour, vec3(0.82, 0.86, 0.88), foam);
  // Winter: ice and snow in from the edges, the open water darker
  const ice = winter.mul(smoothstep(0.62, 0.3, centre.add(fine.mul(0.12))));
  colour = mix(colour.mul(float(1).sub(winter.mul(0.35))), mix(vec3(0.62, 0.68, 0.76), vec3(0.85, 0.88, 0.93), fine), ice);
  m.colorNode = colour;
  // (rough enough not to mirror the whole sky: a shallow, broken mountain stream)
  m.roughnessNode = mix(mix(float(0.16).add(ripple.mul(0.1)), float(0.6), foam), float(0.45), ice);
  m.specularIntensityNode = mix(float(0.22), float(0.6), foam.max(ice));
  m.opacityNode = smoothstep(0.0, 0.18, centre).mul(mix(float(0.88), float(1), foam.max(ice)));
  return m;
}

// Wet gravel and stones along the water, drier and greener outwards; snowed over in winter
function createBankMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.85, metalness: 0 });
  const out = uv().x; // 0 at the water, 1 outside
  const stones = mx_noise_float(positionWorld.xz.mul(2.6)).mul(0.5).add(0.5);
  const grit = mx_noise_float(positionWorld.xz.mul(11)).mul(0.5).add(0.5);
  const wet = smoothstep(0.55, 0.0, out);
  let colour = mix(vec3(0.05, 0.047, 0.042), vec3(0.12, 0.113, 0.1), stones.mul(0.7).add(grit.mul(0.3)));
  colour = mix(colour, colour.mul(0.55), wet);
  // moss and grass creeping in from the outer edge
  colour = mix(colour, vec3(0.06, 0.085, 0.035), smoothstep(0.45, 0.95, out).mul(stones.add(0.3).min(1)));
  const snow = winter.mul(smoothstep(0.15, 0.45, out.add(grit.mul(0.15))));
  m.colorNode = mix(colour, mix(vec3(0.74, 0.79, 0.88), vec3(0.9, 0.93, 0.98), grit), snow);
  m.roughnessNode = mix(float(0.88), float(0.35), wet.mul(float(1).sub(snow)));
  m.opacityNode = smoothstep(1.0, 0.55, out.add(grit.mul(0.15)));
  return m;
}

// The ribbons' triangles (flat lists, 3 vertices each) cut into square cells, each cell a mesh culled by the view and
// hidden beyond the distance at which its widest strip (`size`, per vertex) shrinks under a pixel
function cellMeshes(attrs, size, material, name) {
  const cells = new Map();
  const pos = attrs.position;
  for (let t = 0; t < pos.length / 9; t++) {
    const x = (pos[t * 9] + pos[t * 9 + 3] + pos[t * 9 + 6]) / 3, z = (pos[t * 9 + 2] + pos[t * 9 + 5] + pos[t * 9 + 8]) / 3;
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(t);
  }
  const meshes = [];
  for (const tris of cells.values()) {
    const g = new THREE.BufferGeometry();
    let widest = 0;
    for (const [attr, itemSize] of Object.entries({ position: 3, uv: 2, ...(attrs.flow ? { aFlow: 1 } : {}) })) {
      const src = attr === 'aFlow' ? attrs.flow : attrs[attr], out = new Float32Array(tris.length * 3 * itemSize);
      tris.forEach((t, k) => out.set(src.slice(t * 3 * itemSize, (t + 1) * 3 * itemSize), k * 3 * itemSize));
      g.setAttribute(attr, new THREE.BufferAttribute(out, itemSize));
    }
    for (const t of tris) widest = Math.max(widest, size[t * 3]);
    const normals = new Float32Array(tris.length * 9);
    for (let k = 1; k < normals.length; k += 3) normals[k] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.userData.width = widest;
    if (meshes.length) mesh.userData.sharesPipelineWith = meshes[0];
    meshes.push(mesh);
  }
  return meshes;
}

export function buildStreams(scene) {
  const group = new THREE.Group();
  group.name = 'Streams';
  group.userData.terrain = 'absolute';
  const list = STREAMS?.streams || [];
  const water = { position: [], uv: [], flow: [], size: [] }, bank = { position: [], uv: [], size: [] };
  for (const s of list) ribbon(s, water, s.kind !== 'ditch' && s.kind !== 'drain' ? bank : null);
  let triangles = 0;
  const cells = [];
  if (water.position.length) {
    const material = createStreamMaterial();
    for (const mesh of cellMeshes(water, water.size, material, 'Stream water')) { mesh.renderOrder = 3; cells.push(mesh); }
    triangles += water.position.length / 9;
  }
  if (bank.position.length) {
    const material = createBankMaterial();
    for (const mesh of cellMeshes(bank, bank.size, material, 'Stream banks')) { mesh.renderOrder = 2; cells.push(mesh); }
    triangles += bank.position.length / 9;
  }
  if (cells.length) group.add(...cells);
  // Hide the cells too far off for their strips to show, from the view camera of every scene render (the shadow
  // cascades are orthographic and keep the view's)
  const prevBeforeRender = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, scn, camera, target) {
    prevBeforeRender.call(this, renderer, scn, camera, target);
    if (camera.isOrthographicCamera === true || camera.isArrayCamera === true) return;
    const e = camera.matrixWorld.elements, cx = e[12], cy = e[13], cz = e[14];
    const k = camera.projectionMatrix.elements[5] * (renderer.domElement?.clientHeight || 800) / 2 / MIN_PX; // px per metre at 1 m
    for (const mesh of cells) {
      const { min, max } = mesh.geometry.boundingBox;
      const dx = Math.max(min.x - cx, 0, cx - max.x), dy = Math.max(min.y - cy, 0, cy - max.y), dz = Math.max(min.z - cz, 0, cz - max.z);
      mesh.visible = dx * dx + dy * dy + dz * dz <= (mesh.userData.width * k) ** 2;
    }
  };
  group.userData.stats = { streams: list.length, triangles: Math.round(triangles), cells: cells.length };
  scene.add(group);
  return group;
}
