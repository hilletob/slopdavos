import * as THREE from 'three/webgpu';
import { abs, attribute, cameraPosition, distance, dot, float, fract, max, min, mix, mx_noise_float, normalize, normalWorldGeometry, positionGeometry, positionLocal, positionWorld, smoothstep, texture, uv, vec2, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKI_PISTES } from './ski-pistes-data.js';
import { drapeOverlay, surfaceHeight } from './terrain.js';
import { winter } from './season.js';
import { chunkedMeshes } from './scene-culling.js';
import { bumpedNormal, groomSample, pisteBase, TILLER_HALF, wearSince } from './groom-map.js';

// The downhill ski runs of Davos (Parsenn, Jakobshorn, Schatzalp/Strela, Rinerhorn, Bünda; OSM piste:type=downhill,
// js/ski-pistes-data.js), groomed into the snow in winter and gone in summer (they fade with season.js's `winter`):
// - the prepared surface: a band of packed, slightly brighter snow along each run (its OSM width or 22-30 m by
//   difficulty) and the mapped piste areas, combed into the groomer's fine corduroy along the fall line, with the faint
//   seams between the machine's passes; laid on the terrain, soft at the edges;
//   worn down by the day's skiers (js/groom-map.js's snow clock: the cord goes, ski tracks, moguls, icy patches and
//   piles of pushed-off snow at the edges come), freshly groomed again where the player's groomer passes;
// - the edge markers: poles every ~45 m along both edges in the run's colour (blue, red, black; the right-hand pole,
//   seen going down, with the orange top of the Swiss marking), yellow ones along the unprepared Skirouten (freeride);
// - a board with the run's colour at the top of every numbered run.
// One merged, chunked mesh for the surface (frustum-culled per 2.5 km cell), one instanced mesh for the poles (split
// into cells by scene-culling.js) and one for the boards.

export const PISTE_COLOURS = {
  novice: [0.04, 0.24, 0.85], easy: [0.04, 0.24, 0.85], intermediate: [0.86, 0.06, 0.05],
  advanced: [0.03, 0.03, 0.035], freeride: [0.98, 0.76, 0.04]
};
const ORANGE = [1.0, 0.38, 0.02];
const POLE_SPACING = 45;
const POLE_HEIGHT = 1.8;

// Bands along the runs: indexed quad strips with mitred joins; uv.x across (-1 left edge, +1 right edge), uv.y along
// (m); pisteInfo = (half width in m, 0)
function runBands(runs) {
  const geometries = [];
  for (const r of runs) {
    const n = r.pts.length / 2, hw = r.w / 2;
    if (n < 2) continue;
    const positions = new Float32Array(n * 6), uvs = new Float32Array(n * 4), info = new Float32Array(n * 4);
    let along = 0;
    for (let k = 0; k < n; k++) {
      const x = r.pts[k * 2], z = r.pts[k * 2 + 1];
      if (k > 0) along += Math.hypot(x - r.pts[k * 2 - 2], z - r.pts[k * 2 - 1]);
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      let tx = r.pts[b * 2] - r.pts[a * 2], tz = r.pts[b * 2 + 1] - r.pts[a * 2 + 1];
      const L = Math.hypot(tx, tz) || 1;
      tx /= L; tz /= L;
      // (mitre: as wide as the band on the segment before, clamped at sharp bends)
      let scale = 1;
      if (k > 0) {
        const sx = x - r.pts[k * 2 - 2], sz = z - r.pts[k * 2 - 1], sl = Math.hypot(sx, sz) || 1;
        scale = 1 / Math.max(0.6, (tx * sx + tz * sz) / sl);
      }
      const nx = -tz * hw * scale, nz = tx * hw * scale;
      positions.set([x - nx, 0, z - nz, x + nx, 0, z + nz], k * 6);
      uvs.set([-1, along, 1, along], k * 4);
      info.set([hw, 0, hw, 0], k * 4);
    }
    const index = [];
    // (counter-clockwise seen from above: x east, z south, the left edge at -normal)
    for (let k = 0; k + 1 < n; k++) { const l0 = k * 2, r0 = l0 + 1, l1 = l0 + 2, r1 = l0 + 3; index.push(l0, r1, r0, l0, l1, r1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('pisteInfo', new THREE.BufferAttribute(info, 2));
    g.setIndex(index);
    fixWinding(g);
    geometries.push(g);
  }
  return geometries;
}

// Mapped piste areas: triangulated rings (with their holes); pisteInfo = (0, 1)
function areaGeometries(areas) {
  const geometries = [];
  const v2 = (ring) => { const out = []; for (let i = 0; i < ring.length; i += 2) out.push(new THREE.Vector2(ring[i], ring[i + 1])); return out; };
  for (const a of areas) {
    const contour = v2(a.ring), holes = (a.holes || []).map(v2);
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    if (!tris.length) continue;
    const all = contour.concat(...holes);
    const positions = new Float32Array(all.length * 3);
    all.forEach((p, i) => positions.set([p.x, 0, p.y], i * 3));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(all.length * 2), 2));
    g.setAttribute('pisteInfo', new THREE.BufferAttribute(new Float32Array(all.length * 2).map((_, i) => i % 2), 2));
    g.setIndex(tris.flat());
    fixWinding(g);
    geometries.push(g);
  }
  return geometries;
}

// Every triangle facing up (+y)
function fixWinding(g) {
  const p = g.attributes.position.array, idx = g.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    // y of (b - a) × (c - a)
    const ny = (p[b + 2] - p[a + 2]) * (p[c] - p[a]) - (p[b] - p[a]) * (p[c + 2] - p[a + 2]);
    if (ny < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
}

function createPisteMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.72, metalness: 0, transparent: true, depthWrite: false });
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -6;
  const info = attribute('pisteInfo', 'vec2');
  const hw = info.x, isArea = info.y;
  // Groomed last: by the night shift (pisteBase, groom-map.js) or, where the player's tiller passed since, then
  const g = groomSample();
  const wear = wearSince(mix(pisteBase, max(pisteBase, g.s), g.inside));
  const fresh = smoothstep(0.35, 0.02, wear);
  // Across the fall line (m): along the band's width on the runs; on the areas, across the terrain's slope; across
  // the player's own pass where it groomed
  const fall = normalize(normalWorldGeometry.xz.add(vec2(0.0001, 0)));
  const across = mix(mix(uv().x.mul(hw), dot(positionWorld.xz, vec2(fall.y.negate(), fall.x)), isArea), g.u, g.inside);
  const dist = distance(positionWorld, cameraPosition);
  // The corduroy: fine ridges 12 cm apart (faded out with distance, before they shimmer; ridden off within ~3 h)
  const c = abs(fract(across.div(0.12)).sub(0.5)).mul(2);
  const ridges = c.mul(0.3).mul(smoothstep(40, 8, dist)).mul(fresh);
  // The groomer's passes (4.8 m wide): the seams between them, and every other pass combed a shade lighter (the
  // stripes along a fresh piste seen from afar); the edges of the player's passes
  const pass = across.div(4.8).add(0.5);
  const l = fract(pass);
  const seamFade = smoothstep(600, 60, dist).mul(smoothstep(0.7, 0.1, wear));
  const seam = smoothstep(0.035, 0, min(l, float(1).sub(l))).mul(0.28).mul(float(1).sub(g.inside)).max(
    smoothstep(0.1, 0, abs(g.au.sub(TILLER_HALF))).mul(g.cover).mul(0.32)).mul(seamFade);
  const stripe = smoothstep(0.42, 0.58, fract(pass.mul(0.5)).sub(0.5).abs().mul(2)).mul(0.07).mul(fresh);
  // The low berm the groomer leaves along the edges (the runs only); ridden into piles of pushed-off snow later
  const edgeBand = (inner, outer) => smoothstep(float(1).sub(float(inner).div(hw.max(1))), float(1).sub(float(outer).div(hw.max(1))), abs(uv().x)).mul(float(1).sub(isArea));
  const berm = edgeBand(1.6, 0.5).mul(0.3).mul(smoothstep(0.9, 0.2, wear));
  const drift = mx_noise_float(positionWorld.xz.mul(0.04)).mul(0.5).add(0.5);
  const fine = mx_noise_float(positionWorld.xz.mul(1.3)).mul(0.5).add(0.5);
  // --- Wear (the day's skiers): ski tracks and ruts along the run, then moguls, scraped icy patches and the snow
  // pushed to the edges. Coordinates along the run (m: across, along) on the runs, the world's on the areas.
  const q = mix(vec2(uv().x.mul(hw), uv().y), positionWorld.xz, isArea);
  const near = smoothstep(90, 25, dist);
  // (the skiers' lines meander: the streaks follow a slowly wandering offset across the run)
  const bend = mx_noise_float(q.mul(vec2(0.07, 0.022))).mul(4.5);
  const rutNoise = mx_noise_float(vec2(q.x.add(bend).mul(1.7), q.y.mul(0.085))).mul(0.5).add(0.5);
  const ruts = smoothstep(0.58, 0.82, rutNoise).mul(smoothstep(0.06, 0.45, wear));
  const moguls = mx_noise_float(q.mul(vec2(0.23, 0.16)).add(vec2(0, mx_noise_float(q.mul(0.05)).mul(0.8)))).mul(smoothstep(0.4, 1.15, wear));
  const pile = edgeBand(4.5, 0.8).mul(smoothstep(0.25, 1.0, wear)).mul(mx_noise_float(q.mul(vec2(0.7, 0.35))).mul(0.4).add(0.6));
  const chop = mx_noise_float(positionWorld.xz.mul(2.1)).mul(smoothstep(0.2, 1.0, wear));
  const height = moguls.mul(0.42).add(ruts.mul(0.012).mul(near)).add(pile.mul(0.3)).add(chop.mul(0.025).mul(near));
  m.normalNode = bumpedNormal(height);
  const ice = smoothstep(0.62, 0.82, mx_noise_float(q.mul(vec2(0.11, 0.05))).mul(0.5).add(0.5)).mul(smoothstep(0.6, 1.2, wear)).mul(float(1).sub(pile));
  // Packed snow: smooth and even (no drifts). The sun on the snow is exposed to the tone mapper's shoulder: powder (season.js's
  // snowyGround, albedo ~0.75-0.9) shows as white, and so would anything brighter. The piste sits just below the
  // shoulder (as white to the eye in the sun), so that its corduroy, the passes and the berms show in a hint of blue grey.
  let snow = mix(vec3(0.6, 0.62, 0.65), vec3(0.64, 0.655, 0.68), drift.mul(0.7).add(fine.mul(0.3)));
  snow = mix(snow, vec3(0.5, 0.53, 0.57), ruts.mul(0.22).mul(near)); // the tracks scraped a shade greyer
  snow = mix(snow, vec3(0.44, 0.49, 0.55), ice.mul(0.55)); // icy patches, polished
  snow = mix(snow, vec3(0.72, 0.745, 0.78), pile.mul(0.8)); // loose snow at the edges
  m.colorNode = mix(snow.mul(float(1.0).sub(stripe)), vec3(0.36, 0.41, 0.5), max(max(ridges, seam), berm));
  m.roughnessNode = mix(mix(float(0.72), float(0.4), ice), float(0.9), pile);
  // Soft edges into the snow around (the runs; the areas have their mapped edges); only in winter
  const edge = mix(smoothstep(float(1), float(1).sub(float(2.5).div(hw.max(1))), abs(uv().x)), float(1), isArea);
  m.opacityNode = edge.mul(winter).mul(0.96);
  return m;
}

// Edge poles: per instance poleColour (shaft) and poleTop (top 25 cm); scaled to nothing in summer
function createPoleMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0 });
  const top = smoothstep(POLE_HEIGHT - 0.27, POLE_HEIGHT - 0.25, positionGeometry.y);
  m.colorNode = mix(attribute('poleColour', 'vec3'), attribute('poleTop', 'vec3'), top);
  m.positionNode = positionLocal.mul(winter);
  return m;
}

function buildPoles(runs) {
  const sites = [];
  let seed = 7;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 1) >>> 0) / 4294967296;
  for (const r of runs) {
    const colour = PISTE_COLOURS[r.d] || PISTE_COLOURS.easy;
    const freeride = !r.groomed;
    const spacing = freeride ? 70 : POLE_SPACING;
    let next = 8 + rand() * 15, along = 0, k = 0;
    for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], bx = r.pts[i], bz = r.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      while (L > 0 && next <= along + L) {
        const t = (next - along) / L, ux = (bx - ax) / L, uz = (bz - az) / L;
        // Both edges, staggered (going down: +side is the right, the run runs from its first point to its last);
        // the Skirouten along their centre line
        const side = freeride ? 0 : k % 2 ? 1 : -1, off = r.w / 2 + 0.4;
        const x = ax + (bx - ax) * t - uz * off * side, z = az + (bz - az) * t + ux * off * side;
        // (facing down the run along (ux, uz), the right hand lies towards (-uz, ux))
        sites.push({ x, z, colour, top: side === 1 ? ORANGE : colour, lean: (rand() - 0.5) * 0.08, yaw: rand() * 6.3 });
        next += spacing * (0.85 + rand() * 0.3);
        k++;
      }
      along += L;
    }
  }
  if (!sites.length) return null;
  const geometry = new THREE.CylinderGeometry(0.02, 0.025, POLE_HEIGHT, 5, 1);
  geometry.translate(0, POLE_HEIGHT / 2, 0);
  const n = sites.length;
  const colours = new Float32Array(n * 3), tops = new Float32Array(n * 3);
  sites.forEach((s, i) => { colours.set(s.colour, i * 3); tops.set(s.top, i * 3); });
  geometry.setAttribute('poleColour', new THREE.InstancedBufferAttribute(colours, 3));
  geometry.setAttribute('poleTop', new THREE.InstancedBufferAttribute(tops, 3));
  const mesh = new THREE.InstancedMesh(geometry, createPoleMaterial(), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  sites.forEach((s, i) => mesh.setMatrixAt(i, m.compose(p.set(s.x, surfaceHeight(s.x, s.z) - 0.3, s.z), q.setFromEuler(e.set(s.lean, s.yaw, -s.lean * 0.5)), one)));
  mesh.name = 'Ski piste poles';
  mesh.castShadow = true; mesh.receiveShadow = false;
  return mesh;
}

// Run boards at the top of each numbered run: a small square sign on a post, in the run's colour with its number
function buildBoards(runs) {
  // The first stretch of each ref (its highest start) gets a board
  const best = new Map();
  for (const r of runs) {
    if (!r.ref || !r.groomed || r.ref.length > 3) continue;
    const key = `${r.region}:${r.ref}`;
    const y = surfaceHeight(r.pts[0], r.pts[1]);
    if (!best.has(key) || best.get(key).y < y) best.set(key, { r, y });
  }
  const list = [...best.values()];
  if (!list.length) return null;
  const refs = [...new Set(list.map((b) => b.r.ref))];
  // The numbers in a canvas atlas (white on transparent, 8 × 8 cells)
  const cols = 8, cellPx = 64, rows = Math.ceil(refs.length / cols);
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let atlas = null;
  if (canvas) {
    canvas.width = cols * cellPx; canvas.height = Math.max(1, rows) * cellPx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    refs.forEach((ref, i) => {
      ctx.font = `bold ${ref.length > 2 ? 26 : 36}px system-ui, sans-serif`;
      ctx.fillText(ref, (i % cols + 0.5) * cellPx, (Math.floor(i / cols) + 0.54) * cellPx);
    });
    atlas = new THREE.CanvasTexture(canvas);
    atlas.anisotropy = 4;
  }
  // Board 0.6 × 0.6 m on a 1.6 m post, facing up the run
  const board = new THREE.BoxGeometry(0.6, 0.6, 0.04);
  board.translate(0, 1.9, 0);
  const post = new THREE.CylinderGeometry(0.035, 0.035, 1.9, 5);
  post.translate(0, 0.95, -0.03);
  // (the post's uv in an empty corner of the atlas: no text on it)
  const postUv = post.attributes.uv;
  for (let i = 0; i < postUv.count; i++) postUv.setXY(i, -1, -1);
  const geometry = mergeGeometries([board.toNonIndexed(), post.toNonIndexed()], false);
  const n = list.length;
  const colours = new Float32Array(n * 3), cells = new Float32Array(n * 2);
  list.forEach((b, i) => {
    colours.set(PISTE_COLOURS[b.r.d] || PISTE_COLOURS.easy, i * 3);
    const c = refs.indexOf(b.r.ref);
    cells.set([c % cols, Math.floor(c / cols)], i * 2);
  });
  geometry.setAttribute('boardColour', new THREE.InstancedBufferAttribute(colours, 3));
  geometry.setAttribute('boardCell', new THREE.InstancedBufferAttribute(cells, 2));
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.1 });
  let colour = attribute('boardColour', 'vec3');
  const isPost = smoothstep(-0.5, -0.6, uv().x);
  if (atlas) {
    const cell = attribute('boardCell', 'vec2');
    // (the box's front and back faces carry the full uv square; the narrow sides show a sliver of it, harmless)
    const tuv = vec2(cell.x.add(uv().x).div(cols), float(1).sub(cell.y.add(float(1).sub(uv().y)).div(Math.max(1, rows))));
    const text = texture(atlas, tuv).a;
    colour = mix(colour, vec3(1, 1, 1), text.mul(float(1).sub(isPost)));
  }
  material.colorNode = mix(colour, vec3(0.45, 0.46, 0.48), isPost);
  material.positionNode = positionLocal.mul(winter);
  const mesh = new THREE.InstancedMesh(geometry, material, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  list.forEach(({ r }, i) => {
    // At the left edge of the run's first metres, facing back up the run (towards the arriving skiers)
    const ux = r.pts[2] - r.pts[0], uz = r.pts[3] - r.pts[1], L = Math.hypot(ux, uz) || 1;
    const off = r.w / 2 + 1.5;
    const x = r.pts[0] + (ux / L) * 6 + (uz / L) * off, z = r.pts[1] + (uz / L) * 6 - (ux / L) * off;
    mesh.setMatrixAt(i, m.compose(p.set(x, surfaceHeight(x, z) - 0.3, z), q.setFromAxisAngle(up, Math.atan2(-ux, -uz)), one));
  });
  mesh.name = 'Ski piste boards';
  mesh.castShadow = true;
  return mesh;
}

export function buildSkiPistes(scene) {
  const group = new THREE.Group();
  group.name = 'Ski pistes';
  group.userData.terrain = 'absolute'; // draped above
  const runs = SKI_PISTES.runs || [], areas = SKI_PISTES.areas || [];
  const groomed = runs.filter((r) => r.groomed);
  const flatGeometries = [...runBands(groomed), ...areaGeometries(areas.filter((a) => a.groomed))];
  const draped = flatGeometries.map((g) => { const d = drapeOverlay(g, { maxEdge: 8, lift: 0.22 }); g.dispose(); return d; });
  let triangles = 0;
  if (draped.length) {
    const merged = mergeGeometries(draped, false);
    draped.forEach((g) => g.dispose());
    triangles = merged.attributes.position.count / 3;
    group.add(...chunkedMeshes(merged, createPisteMaterial(), { cell: 2500, setup: (mesh) => {
      mesh.name = 'Ski piste surface';
      mesh.receiveShadow = true;
      mesh.renderOrder = 2;
    } }));
  }
  const poles = buildPoles(runs);
  if (poles) group.add(poles);
  const boards = buildBoards(runs);
  if (boards) group.add(boards);
  group.userData.stats = { runs: runs.length, areas: areas.length, triangles, poles: poles ? poles.count : 0, boards: boards ? boards.count : 0 };
  // Not drawn at all in summer; drawn while the loading screen compiles the shaders (main.js sets __slopdavos.ready
  // afterwards), so that switching to winter doesn't stall on them (as js/loipen.js)
  Object.defineProperty(group, 'visible', {
    get: () => winter.value > 0 || !(typeof window !== 'undefined' && window.__slopdavos?.ready),
    set() {}
  });
  scene.add(group);
  return group;
}
