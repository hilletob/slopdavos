import * as THREE from 'three/webgpu';
import { float, mix, vec3 } from 'three/tsl';
import { DAVOS_DATA } from './davos-geodata.js';
import { groundHeight, naturalBank, BANK } from './terrain.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, fade, worldNoise } from './building-kit.js';
import { wallFrame, onWall } from './spital-data.js';
import { isWinter, onSeasonChange, winter } from './season.js';
import { groundUnder } from './bubenbrunnen.js';
import { BUBENBRUNNEN } from './bubenbrunnen-data.js';
import {
  SEELI, bankHeight, bankStations, benchSites, boardLine, coneSites, hutOctagon, lampSites, obb, pathLines
} from './seeli-park-data.js';

export { SEELI };

// The park round the Seehof Seeli in Davos Dorf (js/seeli-park-data.js has where each thing stands and from which
// photograph). All year: the gravel path round the pond and its spur to the Promenade, the benches facing the water, the
// path lamps and the two floodlight masts on the south-west bank (their heads glow from dusk on). In winter only (a group
// switched by js/season.js onSeasonChange, as js/missions-rink.js does with its parked resurfacer): the rink's low boards
// on the ice a little in from the shore with a gate at the north-west, the shovelled snow bank round it, the white
// textile cones along the field's edge, three feather flags, and the Bubenbrunnen's timber winter case.
// The pond missions (js/missions-outdoor.js pond hockey, js/missions-rink.js the ice) lay their own ice ~1.3 m over the
// pond's surface while they run, with their own bank and lanterns: the boards here lie under that ice then, and the bank
// here under theirs. Nothing stands within reach of their starts, pins, posts, hydrant and parked machine.
// Five meshes: the path, the fittings (vertex colours), the lamps' glass; in winter the fittings and the snow.
// Colliders: the benches and the fountain's case.

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
function materials() {
  const M = {};
  // the fittings: one vertex-coloured material (the timber, the steel, the white of the cones and the flags)
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  M.wtrim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02, side: THREE.DoubleSide });
  M.glow = SIMPLE_SKINS.glow([0.55, 0.55, 0.52], 0.35, 0, [1.0, 0.86, 0.66], 3.2);
  M.bank = SIMPLE_SKINS.plain(SEELI.snow, 0.92);
  if (QUALITY.simpleMaterials) M.path = SIMPLE_SKINS.snowRoof(SEELI.gravel, 0.95);
  else {
    // gravel: blotched a little, a fine grain close by; packed snow on it in winter
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const grain = worldNoise(7).sub(0.5).mul(fade(5, 22)).mul(0.22);
    const gravel = mix(vec3(0.28, 0.25, 0.21), vec3(0.4, 0.37, 0.32), worldNoise(0.6)).mul(float(1).add(grain));
    m.colorNode = mix(gravel, vec3(0.78, 0.81, 0.86), winter.mul(0.92));
    M.path = m;
  }
  // (drawn over the park's grass and the ground's own drape)
  Object.assign(M.path, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  return M;
}

// --- Small solids ------------------------------------------------------------------------------------------------------
// A prism of `sides` round (x, z) from y0 to y1 (radius r0 at the foot, r1 at the top; 0: a cone)
function prism(B, bucket, x, z, r0, r1, y0, y1, colour, sides = 6) {
  const P = (k, r, y) => { const a = (k / sides) * Math.PI * 2; return [x + Math.cos(a) * r, y, z - Math.sin(a) * r]; };
  for (let k = 0; k < sides; k++) {
    if (r1 > 0) B.quad(bucket, P(k, r0, y0), P(k + 1, r0, y0), P(k + 1, r1, y1), P(k, r1, y1), undefined, { colour });
    else B.tri(bucket, P(k, r0, y0), P(k + 1, r0, y0), [x, y1, z], undefined, { colour });
  }
}
// A box `len` long (along u), `depth` deep (along the front n), y0–y1, round the centre (x, z) facing (fx, fz)
function frameAt(x, z, fx, fz, len) {
  const ux = fz, uz = -fx; // (wallFrame's n = (−u.z, u.x) is then the front)
  return wallFrame([x - ux * len / 2, z - uz * len / 2], [x + ux * len / 2, z + uz * len / 2]);
}

/** The normal (b − a) × (c − a) of a triangle [a, b, c] */
export function cross([a, b, c]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

// --- The path ----------------------------------------------------------------------------------------------------------
function buildPath(B) {
  const P = SEELI.path;
  for (const run of pathLines().runs) {
    const edges = run.map((p, i) => {
      const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      const l = [p[0] + nx * P.half, p[1] + nz * P.half], r = [p[0] - nx * P.half, p[1] - nz * P.half];
      return [[l[0], groundHeight(l[0], l[1]) + P.lift, l[1]], [r[0], groundHeight(r[0], r[1]) + P.lift, r[1]]];
    });
    for (let i = 0; i + 1 < edges.length; i++) {
      const [l0, r0] = edges[i], [l1, r1] = edges[i + 1];
      // (facing up: the quad's normal (b − a) × (d − a) must have y > 0)
      let q = [r0, l0, l1, r1];
      const ny = (q[1][2] - q[0][2]) * (q[3][0] - q[0][0]) - (q[1][0] - q[0][0]) * (q[3][2] - q[0][2]);
      if (ny < 0) q = [r1, l1, l0, r0];
      B.quad('path', ...q, q.map((v) => [v[0], v[2]]));
    }
  }
}

// --- Benches, lamps, floodlights ---------------------------------------------------------------------------------------
function buildBenches(B, colliders) {
  const S = SEELI.benches, wood = SEELI.benchWood, iron = SEELI.anthracite;
  for (const b of benchSites()) {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), F = frameAt(b.x, b.z, fx, fz, S.len);
    const ends = [onWall(F, 0), onWall(F, S.len)].map(([x, z]) => groundHeight(x, z));
    const g = Math.max(...ends), lo = Math.min(...ends) - 0.15, d = S.depth / 2;
    // two cast-iron side frames, the seat's slats and the backrest leaning back
    for (const s of [0.12, S.len - 0.12]) {
      B.box('trim', F, s - 0.03, s + 0.03, -d + 0.04, d - 0.04, lo, g + S.seat - 0.04, iron);
      B.box('trim', F, s - 0.03, s + 0.03, -d - 0.02, -d + 0.05, g + S.seat - 0.04, g + S.back, iron);
    }
    for (let k = 0; k < 4; k++) { const o0 = -d + 0.04 + k * 0.125; B.box('trim', F, 0, S.len, o0, o0 + 0.1, g + S.seat - 0.04, g + S.seat, wood); }
    for (let k = 0; k < 3; k++) { const y0 = g + S.seat + 0.12 + k * 0.11; B.box('trim', F, 0, S.len, -d - 0.04 + k * 0.01, -d + 0.0 + k * 0.01, y0, y0 + 0.08, wood); }
    colliders.push(obb(onWall(F, 0), onWall(F, S.len), S.depth, lo, g + S.back));
  }
}
function buildLamps(B) {
  const L = SEELI.lamps, iron = SEELI.anthracite;
  for (const p of lampSites()) {
    const g = groundHeight(p.x, p.z);
    prism(B, 'trim', p.x, p.z, 0.09, 0.09, g - 0.3, g + 0.5, iron, 6);
    prism(B, 'trim', p.x, p.z, 0.05, 0.04, g + 0.5, g + L.h - 0.4, iron, 6);
    // the lantern: a base, the glass, a pointed cap
    prism(B, 'trim', p.x, p.z, 0.12, 0.17, g + L.h - 0.4, g + L.h - 0.32, iron, 6);
    prism(B, 'glow', p.x, p.z, 0.15, 0.19, g + L.h - 0.32, g + L.h, null, 6);
    prism(B, 'trim', p.x, p.z, 0.25, 0, g + L.h, g + L.h + 0.22, iron, 6);
  }
}
function buildFloodlights(B) {
  const H = SEELI.flood.h, steel = SEELI.steel, centre = [727, -1419];
  for (const f of SEELI.floodlights) {
    const g = groundHeight(f.x, f.z);
    prism(B, 'trim', f.x, f.z, 0.16, 0.16, g - 0.3, g + 0.4, steel, 8);
    prism(B, 'trim', f.x, f.z, 0.11, 0.07, g + 0.4, g + H, steel, 8);
    // a cross arm square to the pond and a head at each end, tilted down towards the ice
    let fx = centre[0] - f.x, fz = centre[1] - f.z;
    const l = Math.hypot(fx, fz); fx /= l; fz /= l;
    const F = frameAt(f.x, f.z, fx, fz, 1.6);
    B.box('trim', F, 0, 1.6, -0.04, 0.04, g + H - 0.1, g + H - 0.02, steel);
    for (const s of [0.05, 1.05]) {
      B.box('trim', F, s, s + 0.5, 0.06, 0.3, g + H - 0.15, g + H + 0.25, [0.2, 0.21, 0.22]);
      // the lens on its front, facing the pond and a little down
      const a = onWall(F, s + 0.04, 0.31), b = onWall(F, s + 0.46, 0.31), a2 = onWall(F, s + 0.04, 0.2), b2 = onWall(F, s + 0.46, 0.2);
      B.quad('glow', [a[0], g + H - 0.11, a[1]], [b[0], g + H - 0.11, b[1]], [b2[0], g + H + 0.21, b2[1]], [a2[0], g + H + 0.21, a2[1]]);
    }
  }
}

// --- Winter: the rink's boards, the snow bank, the cones, the flags, the fountain's case -------------------------------
function buildBoards(B, level) {
  const K = SEELI.boards, line = boardLine(), white = SEELI.white, yellow = SEELI.yellow, t = K.thick / 2;
  const y0 = level - 0.06, y1 = level + K.height;
  for (let i = 0; i + 1 < line.length; i++) {
    const F = wallFrame(line[i], line[i + 1]), e = 0.02;
    B.box('wtrim', F, -e, F.len + e, -t, t, y0, y1 - K.rail, white);
    B.box('wtrim', F, -e, F.len + e, -t - 0.01, t + 0.01, y1 - K.rail, y1, yellow);
  }
}
function buildBank(B, level) {
  const stations = bankStations(), D = [-0.15, 0.35, 0.8, 1.4, 2.0, 2.7, 3.4];
  const lumps = (i) => 1 + 0.18 * Math.sin(i * 0.9) + 0.12 * Math.sin(i * 2.3 + 1);
  const at = (s, i, d) => {
    const x = s.x + s.nx * d, z = s.z + s.nz * d;
    const base = d <= 0 ? level + 0.03 : Math.max(groundHeight(x, z), level + 0.02);
    return [x, d >= 3.4 ? base - 0.06 : base + bankHeight(d) * lumps(i), z];
  };
  for (let i = 0; i < stations.length; i++) {
    const a = stations[i], b = stations[(i + 1) % stations.length];
    if (a.gap || b.gap) continue;
    for (let k = 0; k + 1 < D.length; k++) {
      // (from the shore out: a, b along it, then back on the outer line, which faces up for a ring of negative area)
      let q = [at(a, i, D[k]), at(b, i + 1, D[k]), at(b, i + 1, D[k + 1]), at(a, i, D[k + 1])];
      const ny = (q[1][2] - q[0][2]) * (q[3][0] - q[0][0]) - (q[1][0] - q[0][0]) * (q[3][2] - q[0][2]);
      if (ny < 0) q = [q[0], q[3], q[2], q[1]];
      B.quad('bank', ...q);
    }
  }
}
function buildCones(B) {
  const C = SEELI.cones, white = SEELI.white;
  for (const c of coneSites()) {
    const g = groundHeight(c.x, c.z);
    prism(B, 'wtrim', c.x, c.z, C.r, C.r * 0.9, g - 0.2, g + 0.25, white, 10);
    prism(B, 'wtrim', c.x, c.z, C.r * 0.9, 0, g + 0.25, g + C.h, white, 10);
  }
}
function buildFlags(B) {
  const G = SEELI.flag, steel = SEELI.steel;
  // the sails' plane: across the view from the north-west, square to the line to the pond's middle
  for (const [x, z] of SEELI.flags) {
    const g = groundHeight(x, z);
    prism(B, 'wtrim', x, z, 0.03, 0.02, g - 0.3, g + G.h, steel, 5);
    let fx = 727 - x, fz = -1419 - z;
    const l = Math.hypot(fx, fz); fx /= l; fz /= l;
    const ux = fz, uz = -fx; // (the sail runs off the pole this way)
    const P = (s, y) => [x + ux * s, g + y, z + uz * s];
    const [y0, y1] = G.sail, w = G.w;
    // the sail in bands (white, a yellow stripe, the blue foot), its top curving down from the pole's tip
    const bands = [[y0, y0 + 0.9, SEELI.blue], [y0 + 0.9, y0 + 1.05, SEELI.yellow], [y0 + 1.05, y1 - 0.9, SEELI.white]];
    for (const [a, b, colour] of bands) B.quad('wtrim', P(0.03, a), P(w, a), P(w, b), P(0.03, b), undefined, { colour });
    B.quad('wtrim', P(0.03, y1 - 0.9), P(w, y1 - 0.9), P(w * 0.8, y1 - 0.2), P(0.03, y1 + 0.15), undefined, { colour: SEELI.white });
  }
}
function buildHut(B, colliders) {
  const H = SEELI.hut, { hi, lo } = groundUnder(), y = (h) => hi + h, bs = BUBENBRUNNEN.basin;
  const walls = hutOctagon(H.apothem), eaves = hutOctagon(H.eaves), [cx, cz] = BUBENBRUNNEN.centre;
  const timber = SEELI.timber, dark = SEELI.darkTimber, y0 = y(bs.top - 0.06), y1 = y(H.wallTop);
  for (let i = 0; i < 8; i++) {
    const a = walls[i], b = walls[(i + 1) % 8], F = wallFrame(a, b);
    // the face: a sill, the dark carved panel set back, a rail over it, the corner posts and the plate on top
    B.box('wtrim', F, 0, F.len, -0.08, 0, y0, y0 + 0.14, timber);
    B.box('wtrim', F, 0.06, F.len - 0.06, -0.08, -0.03, y0 + 0.14, y1 - 0.14, dark);
    B.box('wtrim', F, 0, F.len, -0.08, 0.01, y0 + (y1 - y0) * 0.55, y0 + (y1 - y0) * 0.55 + 0.1, timber);
    for (const k of [0.3, 0.7]) { const s = F.len * k; B.box('wtrim', F, s - 0.035, s + 0.035, -0.08, 0, y0 + 0.14, y1 - 0.14, timber); }
    B.box('wtrim', F, -0.04, 0.08, -0.1, 0.03, y0, y1, timber);
    B.box('wtrim', F, 0, F.len, -0.08, 0.02, y1 - 0.14, y1, timber);
  }
  // the underside of the case over the basin's rim, the eaves' soffit, the roof (dark: the snow slides off it)
  const ring = (r, h, down) => { for (let i = 0; i < 8; i++) { const a = r.outer[i], b = r.outer[(i + 1) % 8], c = r.inner[(i + 1) % 8], d = r.inner[i]; const q = [[a[0], h, a[1]], [b[0], h, b[1]], [c[0], h, c[1]], [d[0], h, d[1]]]; const ny = (q[1][2] - q[0][2]) * (q[3][0] - q[0][0]) - (q[1][0] - q[0][0]) * (q[3][2] - q[0][2]); B.quad('wtrim', ...((ny > 0) === down ? [q[0], q[3], q[2], q[1]] : q), undefined, { colour: dark }); } };
  ring({ outer: walls, inner: hutOctagon(bs.apothem + bs.rim - 0.02) }, y0, true);
  ring({ outer: eaves, inner: walls }, y1, true);
  const apex = [cx, y(H.apex), cz];
  for (let i = 0; i < 8; i++) {
    const a = eaves[i], b = eaves[(i + 1) % 8];
    // (facing out and up: the triangle turned so that its normal points away from the axis)
    let t = [[a[0], y1, a[1]], [b[0], y1, b[1]], apex];
    const n = cross(t), mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
    if (n[0] * mx + n[2] * mz < 0) t = [t[0], t[2], t[1]];
    B.tri('wtrim', ...t, undefined, { colour: SEELI.roofDark });
    B.box('wtrim', wallFrame(a, b), -0.02, Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.02, -0.04, 0.02, y1 - 0.1, y1 + 0.02, dark);
  }
  prism(B, 'wtrim', cx, cz, 0.05, 0.02, y(H.apex) - 0.05, y(H.apex) + 0.35, dark, 6);
  // (one box round it: the case's faces, a hand's breadth in at its corners)
  const h = H.apothem - 0.07;
  colliders.push(obb([cx - h, cz], [cx + h, cz], 2 * h, lo - 0.25, y1));
}

/**
 * Builds the park into `scene`. Returns { group, colliders, setSeason(on) } (the winter things switch with the
 * season by themselves; setSeason forces them).
 */
export function buildSeeliPark(scene) {
  const root = new THREE.Group();
  root.name = 'SeeliPark';
  root.userData.terrain = 'absolute'; // its heights are the ground's (main.js placeOnTerrain leaves it be)
  const M = materials(), colliders = [];
  const water = DAVOS_DATA.water.find((w) => w.name === 'Seehof Seeli');
  const bank = naturalBank(water, groundHeight), level = (bank ? bank.level : groundHeight(727, -1419)) + BANK.lift;
  // all year
  const A = new Builder({ name: 'SeeliPark' });
  buildPath(A);
  buildBenches(A, colliders);
  buildLamps(A);
  buildFloodlights(A);
  root.add(...A.meshes(M));
  // winter
  const W = new Builder({ name: 'SeeliPark winter' });
  buildBoards(W, level);
  buildBank(W, level);
  buildCones(W);
  buildFlags(W);
  buildHut(W, colliders);
  const cold = new THREE.Group();
  cold.name = 'SeeliPark winter';
  cold.add(...W.meshes(M));
  for (const m of [...root.children, ...cold.children]) {
    if (/path|bank/.test(m.name)) m.castShadow = false;
  }
  root.add(cold);
  scene.add(root);
  const setSeason = (on) => { cold.visible = !!on; };
  setSeason(isWinter());
  onSeasonChange(setSeason);
  return { group: root, colliders, setSeason };
}
