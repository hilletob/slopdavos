import * as THREE from 'three/webgpu';
import { abs, attribute, cameraPosition, color, distance, dot, float, floor, fract, max, mix, mx_noise_float, positionGeometry, positionLocal, positionWorld, sin, smoothstep, uv, vec2, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WINTER_HIKES } from './winter-hikes-data.js';
import { drapeOverlay, groundHeight } from './terrain.js';
import { winter } from './season.js';
import { chunkedMeshes } from './scene-culling.js';

// The signposted winter hiking trails of Davos (Winterwanderwege: the Landwasser Winterwanderweg over the meadows of
// the valley floor, the Hohe Promenade, Schatzalp - Strela, the Dischma, Rinerhorn, Pischa...; ASTRA / SchweizMobil
// data in js/winter-hikes-data.js), rolled into the snow in winter and gone in summer (they fade with season.js's
// `winter`):
// - the trail: a 4 m strip of rolled, trodden snow (a groomer's width), smoother and a little greyer than the powder
//   around it, worn darker along the two walking lanes and stamped with boot prints; only off the streets (where a trail follows a street, the street's
//   own winter surface is the trail);
// - the Swiss winter hiking marking: pink stakes along the edges every 30-45 m and pink-signed posts (Wegweiser) at
//   the trails' ends, where they leave the streets and every ~700 m.
// One merged, chunked mesh for the trails (frustum-culled per 1.5 km cell, gone beyond 2.5 km), one instanced mesh each for the stakes
// and the signposts. The walkers on them: js/winter-hikers.js.

export const TRAIL_WIDTH = 4.0; // m: rolled one groomer's width, room for both directions side by side
export const TRAIL_LIFT = 0.2; // m above the terrain (draped; the walkers' feet stand in it)
export const PINK = 0xe2187f; // the Swiss winter hiking pink
const STAKE_SPACING = [30, 45];
const SIGN_SPACING = 700;

/** The trails with their arc lengths: { id, name, pts, road, cum (metres at each vertex), len } */
export function winterTrails() {
  return WINTER_HIKES.trails.filter((t) => t.pts.length >= 4).map((t) => {
    const n = t.pts.length / 2, cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(t.pts[i * 2] - t.pts[i * 2 - 2], t.pts[i * 2 + 1] - t.pts[i * 2 - 1]);
    return { ...t, cum, len: cum[n - 1] };
  });
}

// The stretches of a trail off the streets: [first vertex, last vertex] pairs
function openStretches(t) {
  const out = [];
  let i = 0;
  while (i < t.road.length) {
    if (t.road[i] === '1') { i++; continue; }
    let j = i;
    while (j < t.road.length && t.road[j] === '0') j++;
    out.push([i, j]);
    i = j;
  }
  return out;
}

// Indexed strips with mitred joins along the open stretches; uv.x across (-1 left edge .. +1 right edge), uv.y along (m)
function trailStrips(trails) {
  const geometries = [];
  const hw = TRAIL_WIDTH / 2;
  for (const t of trails) {
    for (const [a, b] of openStretches(t)) {
      const n = b - a + 1;
      if (n < 2) continue;
      const P = (k) => [t.pts[(a + k) * 2], t.pts[(a + k) * 2 + 1]];
      const positions = new Float32Array(n * 6), uvs = new Float32Array(n * 4);
      for (let k = 0; k < n; k++) {
        const [x, z] = P(k);
        const [px, pz] = P(Math.max(0, k - 1)), [nx2, nz2] = P(Math.min(n - 1, k + 1));
        let tx = nx2 - px, tz = nz2 - pz;
        const L = Math.hypot(tx, tz) || 1;
        tx /= L; tz /= L;
        let scale = 1;
        if (k > 0) {
          const sx = x - px, sz = z - pz, sl = Math.hypot(sx, sz) || 1;
          scale = 1 / Math.max(0.6, (tx * sx + tz * sz) / sl);
        }
        const ox = -tz * hw * scale, oz = tx * hw * scale;
        positions.set([x - ox, 0, z - oz, x + ox, 0, z + oz], k * 6);
        const along = t.cum[a + k];
        uvs.set([-1, along, 1, along], k * 4);
      }
      const index = [];
      // (counter-clockwise seen from above, facing up: x east, z south, the left edge north of an eastward trail)
      for (let k = 0; k + 1 < n; k++) { const l0 = k * 2, r0 = l0 + 1, l1 = l0 + 2, r1 = l0 + 3; index.push(l0, r0, r1, l0, r1, l1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      g.setIndex(index);
      geometries.push(drapeOverlay(g, { maxEdge: 3, lift: TRAIL_LIFT }));
      g.dispose();
    }
  }
  return geometries.length ? mergeGeometries(geometries, false) : null;
}

// Rolled, trodden snow: greyer and smoother than the powder, worn down the middle, boot prints scattered over it
function createTrailMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0, transparent: true, depthWrite: false });
  const across = uv().x.mul(TRAIL_WIDTH / 2); // m from the centre line
  const along = uv().y;
  const fine = mx_noise_float(positionWorld.xz.mul(3.1)).mul(0.5).add(0.5);
  const blotch = mx_noise_float(positionWorld.xz.mul(0.35)).mul(0.5).add(0.5);
  let snow = mix(vec3(0.5, 0.53, 0.58), vec3(0.6, 0.63, 0.68), fine.mul(0.6).add(blotch.mul(0.4)));
  // two lanes, one each way (keeping right), where most feet go: packed harder and a shade darker
  const worn = smoothstep(0.75, 0.15, abs(abs(across).sub(0.9))).mul(0.08);
  // Boot prints: two scattered layers of ellipses (~28 x 11 cm), each cell a print or not
  const hash = (p) => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));
  const prints = (cellA, cellL, offset) => {
    const p = vec2(across.div(cellA), along.div(cellL).add(offset));
    const cell = floor(p);
    const h1 = hash(cell), h2 = hash(cell.add(17.3)), h3 = hash(cell.add(41.7));
    const local = fract(p).sub(vec2(h1.mul(0.5).add(0.25), h2.mul(0.5).add(0.25))).mul(vec2(cellA, cellL));
    const d = local.x.div(0.055).pow(2).add(local.y.div(0.14).pow(2));
    return smoothstep(1.0, 0.55, d).mul(smoothstep(0.35, 0.4, h3));
  };
  const near = smoothstep(70, 25, distance(positionWorld, cameraPosition)); // (the prints alias farther away)
  const stamped = max(prints(0.26, 0.36, 0), prints(0.31, 0.42, 0.5).mul(0.7)).mul(near).mul(smoothstep(0.95, 0.75, abs(uv().x)));
  const shade = max(worn, stamped.mul(0.3));
  snow = mix(snow, vec3(0.36, 0.41, 0.52), shade);
  m.colorNode = snow;
  m.roughnessNode = mix(float(0.42), float(0.7), stamped); // (rolled smooth, the prints rougher)
  // soft edges into the powder; only in winter
  m.opacityNode = smoothstep(1.0, 0.8, abs(uv().x)).mul(winter);
  return m;
}

// Stakes (1.6 m above the snow, pink with a white reflector band) and signposts (a galvanised post with two pink arrow
// signs pointing along the trail, a white location plate): sites along the trails
function markerSites(trails) {
  const stakes = [], signs = [];
  let seed = 7;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 1) >>> 0) / 4294967296;
  const at = (t, s) => {
    let i = 1;
    while (i < t.cum.length - 1 && t.cum[i] < s) i++;
    const ax = t.pts[i * 2 - 2], az = t.pts[i * 2 - 1], bx = t.pts[i * 2], bz = t.pts[i * 2 + 1];
    const L = Math.hypot(bx - ax, bz - az) || 1, f = Math.max(0, Math.min(1, (s - t.cum[i - 1]) / L));
    return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, hx: (bx - ax) / L, hz: (bz - az) / L };
  };
  for (const t of trails) {
    for (const [a, b] of openStretches(t)) {
      const s0 = t.cum[a], s1 = t.cum[b];
      if (s1 - s0 < 25) continue;
      let side = rand() < 0.5 ? 1 : -1;
      for (let s = s0 + 8 + rand() * 15; s < s1 - 5; s += STAKE_SPACING[0] + rand() * (STAKE_SPACING[1] - STAKE_SPACING[0])) {
        const p = at(t, s), off = TRAIL_WIDTH / 2 + 0.35;
        stakes.push({ x: p.x - p.hz * off * side, z: p.z + p.hx * off * side, yaw: rand() * Math.PI });
        side = -side;
      }
      // a signpost where the stretch begins and ends (a trail's end, or where it leaves a street) and every ~700 m
      const posts = [s0 + 3, s1 - 3];
      for (let s = s0 + SIGN_SPACING; s < s1 - SIGN_SPACING / 2; s += SIGN_SPACING) posts.push(s);
      for (const s of posts) {
        const p = at(t, s), off = TRAIL_WIDTH / 2 + 0.6, sd = rand() < 0.5 ? 1 : -1;
        signs.push({ x: p.x - p.hz * off * sd, z: p.z + p.hx * off * sd, yaw: Math.atan2(p.hx, p.hz) });
      }
    }
  }
  return { stakes, signs };
}

const tagged = (geo, part) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.setAttribute('part', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(part), 1));
  return g;
};

function stakeGeometry() {
  const pole = new THREE.CylinderGeometry(0.022, 0.026, 2.0, 6, 1);
  pole.translate(0, 1.0, 0); // 0.4 m of it in the snow
  return tagged(pole, 0);
}

function signGeometry() {
  const parts = [];
  const post = new THREE.CylinderGeometry(0.035, 0.035, 2.75, 8, 1);
  post.translate(0, 1.375, 0);
  parts.push(tagged(post, 2));
  // two arrow signs, one each way along the trail (the trail runs along +z of the instance)
  for (const [y, dir] of [[2.3, 1], [2.05, -1]]) {
    const shape = new THREE.Shape();
    const L = 0.62, H = 0.15, tip = 0.1;
    shape.moveTo(0, -H / 2); shape.lineTo(L - tip, -H / 2); shape.lineTo(L, 0); shape.lineTo(L - tip, H / 2); shape.lineTo(0, H / 2); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false });
    g.translate(0.04, 0, -0.009);
    g.rotateY(-Math.PI / 2 * dir); // the arrow pointing along +z or -z
    g.translate(0, y, 0);
    parts.push(tagged(g, 1));
  }
  const plate = new THREE.BoxGeometry(0.16, 0.12, 0.012);
  plate.rotateY(Math.PI / 2);
  plate.translate(0.045, 2.55, 0);
  parts.push(tagged(plate, 3));
  return mergeGeometries(parts, false);
}

function createMarkerMaterial({ stake }) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0 });
  const part = attribute('part', 'float');
  const pink = color(PINK);
  if (stake) {
    // pink, a white reflector band below the top, a black cap
    const y = positionGeometry.y;
    const band = smoothstep(1.62, 1.625, y).mul(smoothstep(1.76, 1.755, y));
    const cap = smoothstep(1.96, 1.965, y);
    m.colorNode = mix(mix(pink, color(0xf2f2ee), band), color(0x16161a), cap);
  } else {
    // part 1: the pink signs, 2: the galvanised post, 3: the white location plate
    const isPart = (id) => smoothstep(0.3, 0.2, abs(part.sub(id)));
    const grey = color(0x8d9094), white = color(0xeeeeea);
    m.colorNode = mix(mix(pink, grey, isPart(2)), white, isPart(3));
    m.metalnessNode = isPart(2).mul(0.6);
  }
  m.positionNode = positionLocal.mul(winter); // they come out with the snow
  return m;
}

function markerMesh(geometry, material, sites, name, sink) {
  const mesh = new THREE.InstancedMesh(geometry, material, sites.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  sites.forEach((s, i) => mesh.setMatrixAt(i, m.compose(p.set(s.x, groundHeight(s.x, s.z) - sink, s.z), q.setFromAxisAngle(up, s.yaw), one)));
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function buildWinterHikes(scene) {
  const group = new THREE.Group();
  group.name = 'WinterHikes';
  group.userData.terrain = 'absolute'; // draped above
  const trails = winterTrails();
  const geometry = trailStrips(trails);
  if (geometry) {
    // (1.5 km cells, each dropped beyond 2.5 km, where the 4 m strip is under a pixel wide)
    group.add(...chunkedMeshes(geometry, createTrailMaterial(), { cell: 1500, maxDistance: 2500, setup: (mesh) => {
      mesh.name = 'Winterwanderwege';
      mesh.receiveShadow = true;
      mesh.renderOrder = 2;
    } }));
  }
  const { stakes, signs } = markerSites(trails);
  if (stakes.length) group.add(markerMesh(stakeGeometry(), createMarkerMaterial({ stake: true }), stakes, 'Winterwanderweg stakes', 0.4));
  if (signs.length) group.add(markerMesh(signGeometry(), createMarkerMaterial({ stake: false }), signs, 'Winterwanderweg signposts', 0.3));
  group.userData.stats = { trails: trails.length, km: Math.round(trails.reduce((s, t) => s + t.len, 0) / 100) / 10, stakes: stakes.length, signs: signs.length };
  // Not drawn at all in summer; drawn while the loading screen compiles the shaders (main.js sets __slopdavos.ready
  // afterwards), so that switching to winter doesn't stall on them
  Object.defineProperty(group, 'visible', {
    get: () => winter.value > 0 || !(typeof window !== 'undefined' && window.__slopdavos?.ready),
    set() {}
  });
  scene.add(group);
  return group;
}
