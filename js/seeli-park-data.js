// The park round the Seehof Seeli in Davos Dorf (js/seeli-park.js): where its things stand, and the frame maths for them.
// Pure data, no three.js: the tests import it.
//
// After Mapillary's street views (CC BY-SA, all of them winter, 2013–2019), each placed by its camera and bearing:
// - from the north (297507348634191, 3116433261908658, 3952306584835204, 2013, camera ~705/−1475 looking 141–173°):
//   the frozen field, white textile cones ~3 m high along its edges, three tall feather flags in a group on the north
//   bank, low dark benches standing free on the snow facing the ice;
// - from the north-west (143732144427234, 2019, ~705/−1453 looking 134°): a path shovelled between banks of snow a
//   metre high onto the rink, its low boards with a yellow rail, cones beyond, a floodlight mast on the far bank;
// - from the north-east (471622590814011, 956657208482371, 2014, ~748/−1438 looking 230–234°): the two floodlight masts
//   (~11 m, two heads each) on the south-west bank before the Sport Hotel Parsenn, at ~212° and ~234° (where those
//   bearings meet the open strip between the shore and the service road w29257353), the snow banks, the ice;
// - from the north (2890782604543107, 2014, 728/−1506 looking 186°): the "timber hut with the pointed roof" is the
//   Bubenbrunnen (js/bubenbrunnen.js, 722.8/−1495.8, 21° right of that view, 11 m off) in its winter housing: an
//   octagonal timber case with carved panels and a low pyramid roof on the sandstone basin. Built here as that, in
//   winter only; in summer the fountain stands open.
// - from the south (925934388190179, 207851777532779, 2013): cones along the south edge by the bus stop, flags far off
//   before the Hotel Seehof.
// OSM maps no path in the park (w37389727): the path round the pond is laid here as an offset of the shore, ending where
// it meets the service roads (the south-west side has the service road w29257353 for its path), with a spur to the
// Promenade's pavement at the north-west where the 2019 photograph's path comes in. Nothing in the photographs shows the
// summer: the benches, the path lamps and the path's line are guesses in the photographs' spirit.
// World frame (js/davos-frame.js): x east, z south, y = m a.s.l. − 1558.
import { DAVOS_DATA } from './davos-geodata.js';
import { TLM_TREES } from './tlm-trees-data.js';
import { POND, POND_POSTS } from './missions-data-outdoor.js';
import { RINK } from './missions-data-rink.js';
import { BUBENBRUNNEN } from './bubenbrunnen-data.js';

export const SEELI = {
  osm: 'w37389726',
  level: null, // (js/seeli-park.js: the water's surveyed level, js/terrain.js naturalBank)
  path: { offset: 4.6, half: 1.1, step: 1.2, lift: 0.09 },
  // the spur from the loop to the Promenade's pavement at the north-west (the 2019 photograph's way in)
  spur: [[706.5, -1449.5], [700, -1457.5], [696.5, -1463]],
  boards: { inset: 0.45, height: 0.42, thick: 0.06, rail: 0.07, gate: 3.2 },
  bank: { from: 0.1, to: 3.4, peak: 0.75, at: 1.4 }, // the snow bank: m out from the shore, its top
  cones: { offset: 7.6, every: 9.5, r: 0.42, h: 3.0 },
  benches: { len: 1.8, depth: 0.55, seat: 0.45, back: 0.85, out: 0.7 }, // `out`: m beyond the path's edge
  lamps: { h: 4.2, out: 0.5 },
  floodlights: [ // the masts on the south-west bank (the north-east photographs' bearings ~212° and ~234°)
    { x: 720.4, z: -1393.9 },
    { x: 705.9, z: -1407.4 }
  ],
  flood: { h: 11 },
  flags: [[697.6, -1450.2], [698.7, -1451.4], [699.8, -1452.6]], // a group of three on the north-west bank
  flag: { h: 5.6, w: 0.75, sail: [1.3, 5.4] },
  hut: { apothem: 1.22, wallTop: 2.95, eaves: 1.45, apex: 3.85 }, // the fountain's winter case, over the fountain's own heights
  // linear colours
  timber: [0.3, 0.16, 0.07], darkTimber: [0.12, 0.06, 0.03], white: [0.6, 0.6, 0.58], snow: [0.8, 0.83, 0.88],
  gravel: [0.34, 0.31, 0.27], steel: [0.36, 0.37, 0.38], anthracite: [0.05, 0.055, 0.06], yellow: [0.75, 0.52, 0.04],
  blue: [0.02, 0.12, 0.42], benchWood: [0.09, 0.06, 0.045], roofDark: [0.07, 0.065, 0.065]
};

// --- The places the missions need (js/missions-data-outdoor.js, js/missions-data-rink.js) ----------------------------
// r: m kept free of anything standing (the hockey's start and spot lie on the ice; the resurfacer parked all winter)
export const MISSION_SPOTS = [
  { id: 'hockey start', x: POND.start.x, z: POND.start.z, r: 2.5 },
  { id: 'hockey pin', x: POND.pin.x, z: POND.pin.z, r: 3 },
  { id: 'hockey spot', x: POND.spot.x, z: POND.spot.z, r: POND.spot.r + 1 },
  ...POND_POSTS.map((p, i) => ({ id: `hockey post ${i}`, x: p.x, z: p.z, r: 1.5 })),
  { id: 'rink hydrant', x: RINK.hydrant.x, z: RINK.hydrant.z, r: 3 },
  { id: 'rink start', x: RINK.start.x, z: RINK.start.z, r: 2.5 },
  { id: 'rink pin', x: RINK.pin.x, z: RINK.pin.z, r: 3 },
  { id: 'rink machine', x: RINK.machine.x, z: RINK.machine.z, r: 4.5 }
];

// --- Rings and lines -------------------------------------------------------------------------------------------------
/** The shore as [[x, z], …], turned so that its area is negative (wallFrame's outside on (−u.z, u.x) is then out) */
export function shoreRing() {
  const w = DAVOS_DATA.water.find((q) => q.name === 'Seehof Seeli');
  const ring = [];
  for (let i = 0; i < w.ring.length; i += 2) ring.push([w.ring[i], w.ring[i + 1]]);
  return area2(ring) < 0 ? ring : ring.reverse();
}
export function area2(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s;
}
export function inRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}
/** The distance from (x, z) to a polyline [[x, z], …] (closed: back to the first point) */
export function lineDistance(pts, x, z, closed = false) {
  let d = Infinity;
  const n = pts.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    d = Math.min(d, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return d;
}
/** The nearest point on a polyline (closed) */
export function nearestOn(pts, x, z, closed = true) {
  let best = null, bd = Infinity;
  const n = pts.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(qx - x, qz - z);
    if (d < bd) { bd = d; best = [qx, qz]; }
  }
  return best;
}
export const shoreDistance = (x, z) => lineDistance(shoreRing(), x, z, true);

/** Each vertex of a ring (area < 0) moved `d` m out (in, d < 0) along its corner's mitred normal */
export function offsetRing(ring, d) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i + n - 1) % n], q = ring[i], r = ring[(i + 1) % n];
    const e1 = norm([q[0] - p[0], q[1] - p[1]]), e2 = norm([r[0] - q[0], r[1] - q[1]]);
    const n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]]; // (out, for a ring of negative area: wallFrame's n)
    let m = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    if (!Number.isFinite(m[0])) m = n2;
    const k = Math.min(2.5, 1 / Math.max(0.4, m[0] * n2[0] + m[1] * n2[1]));
    out.push([q[0] + m[0] * d * k, q[1] + m[1] * d * k]);
  }
  return out;
}
/**
 * A smooth line `d` m out from the shore: the mitred offset, its points that came nearer the shore than they should (the
 * loops an offset throws in a concave notch) dropped, corners cut
 */
export function shoreOffset(d, rounds = 3) {
  const ring = shoreRing(), pts = resample(offsetRing(ring, d), 1).filter(([x, z]) => lineDistance(ring, x, z, true) > d * 0.92);
  return chaikin(pts, rounds);
}
function norm(v) { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }
/** Chaikin's corner cutting, `times` rounds */
export function chaikin(pts, times = 2, closed = true) {
  let p = pts;
  for (let t = 0; t < times; t++) {
    const out = [], n = p.length, m = closed ? n : n - 1;
    if (!closed) out.push(p[0]);
    for (let i = 0; i < m; i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}
/** Points every `step` m of arc length along a polyline (closed: round to the first point again, which is not repeated) */
export function resample(pts, step, closed = true) {
  const n = pts.length, m = closed ? n : n - 1, out = [pts[0]];
  let need = step;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let at = 0;
    while (L - at >= need) { at += need; out.push([a[0] + (b[0] - a[0]) * at / L, a[1] + (b[1] - a[1]) * at / L]); need = step; }
    need -= L - at;
  }
  if (closed) { const l = out[out.length - 1]; if (Math.hypot(l[0] - pts[0][0], l[1] - pts[0][1]) < step * 0.5) out.pop(); } else if (need < step - 1e-6) out.push(pts[n - 1]);
  return out;
}

// --- What is around: the roads, the trees, the buildings -------------------------------------------------------------
const BOX = [650, -1530, 810, -1340];
const inBox = (x, z, pad = 0) => x > BOX[0] - pad && x < BOX[2] + pad && z > BOX[1] - pad && z < BOX[3] + pad;
let roadsCache = null, treesCache = null, buildingsCache = null, footCache = null;
/** The footways near the pond (the one to the Sport Hotel Parsenn): { pts, half } */
export function nearFootways() {
  if (footCache) return footCache;
  footCache = [];
  for (const r of DAVOS_DATA.roads) {
    if (r.tunnel || !/^(footway|path|steps|pedestrian)$/.test(r.kind)) continue;
    const pts = [];
    for (let i = 0; i < r.pts.length; i += 2) pts.push([r.pts[i], r.pts[i + 1]]);
    if (pts.some(([x, z]) => inBox(x, z, 10))) footCache.push({ id: r.id, pts, half: r.width / 2 });
  }
  return footCache;
}
/** m from (x, z) to the nearest footway's edge */
export const footwayClearance = (x, z) => Math.min(Infinity, ...nearFootways().map((r) => lineDistance(r.pts, x, z) - r.half));
/** The roads the cars, the buses and the cyclist use near the pond (not the footways): { pts: [[x, z], …], half, walk } */
export function nearRoads() {
  if (roadsCache) return roadsCache;
  roadsCache = [];
  for (const r of DAVOS_DATA.roads) {
    if (r.tunnel || /^(footway|path|steps|pedestrian|track|cycleway)$/.test(r.kind)) continue;
    let near = false;
    for (let i = 0; i < r.pts.length; i += 2) if (inBox(r.pts[i], r.pts[i + 1], 20)) near = true;
    if (!near) continue;
    const pts = [];
    for (let i = 0; i < r.pts.length; i += 2) pts.push([r.pts[i], r.pts[i + 1]]);
    const sidewalk = Math.max(0, ...(r.sidewalk || [0]));
    roadsCache.push({ id: r.id, name: r.name, pts, half: r.width / 2, walk: r.width / 2 + sidewalk });
  }
  return roadsCache;
}
/** The trees standing near the pond (swissTLM3D single trees and OSM's): [x, z] */
export function nearTrees() {
  if (treesCache) return treesCache;
  treesCache = [];
  for (const t of TLM_TREES?.trees || []) if (inBox(t[0], t[1])) treesCache.push([t[0], t[1]]);
  for (const t of DAVOS_DATA.trees || []) if (inBox(t.x, t.z)) treesCache.push([t.x, t.z]);
  return treesCache;
}
export function nearBuildings() {
  if (buildingsCache) return buildingsCache;
  buildingsCache = [];
  for (const b of DAVOS_DATA.buildings) {
    const ring = [];
    let near = false;
    for (let i = 0; i < b.ring.length; i += 2) { ring.push([b.ring[i], b.ring[i + 1]]); if (inBox(b.ring[i], b.ring[i + 1], 10)) near = true; }
    if (near) buildingsCache.push({ id: b.id, ring });
  }
  return buildingsCache;
}
/** m from (x, z) to the nearest road's carriageway edge (`walk`: its pavement's outer edge) */
export function roadClearance(x, z, walk = false) {
  let d = Infinity;
  for (const r of nearRoads()) d = Math.min(d, lineDistance(r.pts, x, z) - (walk ? r.walk : r.half));
  return d;
}
export const treeDistance = (x, z) => Math.min(Infinity, ...nearTrees().map(([tx, tz]) => Math.hypot(tx - x, tz - z)));
export const inBuilding = (x, z, pad = 0) => nearBuildings().some((b) => inRing(b.ring, x, z) || (pad > 0 && lineDistance(b.ring, x, z, true) < pad));
export const spotDistance = (x, z) => Math.min(...MISSION_SPOTS.map((s) => Math.hypot(s.x - x, s.z - z) - s.r));

// --- The path ----------------------------------------------------------------------------------------------------------
let pathCache = null;
/**
 * The path round the pond and its spur: { loop: the full offset line (closed, before cutting), runs: [[[x, z], …], …]
 * (the stretches drawn, open, cut where they would meet a carriageway or a building) }. Where a tree would stand on it,
 * the line swings out round it (up to 2 m).
 */
export function pathLines() {
  if (pathCache) return pathCache;
  const P = SEELI.path;
  let loop = resample(shoreOffset(P.offset), 2.5);
  // round the trees: each point pushed out (from the shore, or in a little) until the nearest trunk is clear of the
  // path's edge, then smoothed again; twice, as the smoothing pulls the line back a little
  const clear = P.half + 0.9;
  for (let round = 0; round < 3; round++) {
    loop = loop.map(([x, z]) => {
      if (treeDistance(x, z) >= clear) return [x, z];
      const q = nearestOn(shoreRing(), x, z), d = Math.hypot(x - q[0], z - q[1]), ox = (x - q[0]) / d, oz = (z - q[1]) / d;
      let best = [x, z], bd = treeDistance(x, z);
      for (const extra of [0.5, -0.5, 1, -1, 1.5, 2, 2.5, 3]) {
        const px = x + ox * extra, pz = z + oz * extra, td = treeDistance(px, pz);
        if (d + extra < P.half + 1.4) continue;
        if (td >= clear + 0.3) return [px, pz];
        if (td > bd) { bd = td; best = [px, pz]; }
      }
      return best;
    });
    loop = resample(chaikin(loop, 1), 2);
  }
  loop = resample(chaikin(loop, 2), P.step);
  const ok = ([x, z]) => roadClearance(x, z) > P.half + 0.3 && !inBuilding(x, z, P.half + 0.3) && shoreDistance(x, z) > P.half + 1.2;
  const runs = [];
  // (the loop cut open where it is not ok, starting from a point that is, so a run never wraps over the seam)
  const n = loop.length, s0 = loop.findIndex((p) => !ok(p));
  let run = [];
  for (let k = 0; k <= n; k++) {
    const p = loop[(s0 + k) % n];
    if (ok(p)) run.push(p);
    else { if (run.length > 4) runs.push(run); run = []; }
  }
  if (run.length > 4) runs.push(run);
  // the spur: from the loop's nearest point to the pavement
  const start = nearestOn(loop, ...SEELI.spur[0]);
  const spur = resample([start, ...SEELI.spur], P.step, false).filter(ok);
  if (spur.length > 2) runs.push(spur);
  pathCache = { loop, runs };
  return pathCache;
}
/** m from (x, z) to the nearest drawn path's middle */
export const pathDistance = (x, z) => Math.min(...pathLines().runs.map((r) => lineDistance(r, x, z)));

/** The point and the unit tangent `s` m along an open polyline */
export function along(pts, s) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L || i === pts.length - 2) { const t = Math.min(1, s / (L || 1)); return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / (L || 1), uz: (b[1] - a[1]) / (L || 1) }; }
    s -= L;
  }
  return null;
}
export const lineLength = (pts) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/** A free place for a thing beside the path: clear of the roads' pavements, the trees, the buildings, the missions' spots */
const freeSite = (x, z, r) => roadClearance(x, z, true) > r + 0.8 && footwayClearance(x, z) > r + 0.3 && treeDistance(x, z) > r + 1.2 && !inBuilding(x, z, r + 0.5) && spotDistance(x, z) > r;

/** Things set at `every` m along the path's runs, `out` m from its middle on the side away from the pond, facing it */
function besidePath(every, out, r, first = every / 2) {
  const sites = [];
  for (const run of pathLines().runs.slice(0, -1)) { // (not on the spur)
    const L = lineLength(run);
    for (let s = first; s < L - 2; s += every) {
      const p = along(run, s);
      // the side away from the pond
      let nx = -p.uz, nz = p.ux;
      if (shoreDistance(p.x + nx, p.z + nz) < shoreDistance(p.x - nx, p.z - nz)) { nx = -nx; nz = -nz; }
      const x = p.x + nx * out, z = p.z + nz * out;
      if (!freeSite(x, z, r) || pathDistance(x, z) < out - 0.05) continue;
      // facing the pond: yaw such that the thing's local +z (its front) points to −n
      sites.push({ x: round(x), z: round(z), yaw: Math.atan2(-nx, -nz), nx, nz });
    }
  }
  return sites;
}
const sitesCache = {};
const round = (v) => Math.round(v * 100) / 100;

/** The benches along the path, facing the pond: { x, z, yaw } (local +z the front, the seat's side) */
export function benchSites() {
  const B = SEELI.benches;
  return sitesCache.benches ??= besidePath(24, SEELI.path.half + B.out + B.depth / 2, 1.1, 9);
}
/** The path lamps: { x, z, yaw } */
export function lampSites() {
  return sitesCache.lamps ??= besidePath(26, SEELI.path.half + SEELI.lamps.out, 0.3, 21).filter((l) => benchSites().every((b) => Math.hypot(b.x - l.x, b.z - l.z) > 3));
}
/** The white cones along the field's edge (winter): { x, z } on a line `offset` m out from the shore */
export function coneSites() {
  if (sitesCache.cones) return sitesCache.cones;
  const C = SEELI.cones, line = resample(shoreOffset(C.offset), 0.5);
  const sites = [];
  let acc = C.every / 2;
  for (let i = 0; i < line.length; i++) {
    const a = line[i], b = line[(i + 1) % line.length];
    acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc < C.every) continue;
    const [x, z] = a;
    if (!freeSite(x, z, C.r) || pathDistance(x, z) < SEELI.path.half + C.r + 0.3) continue;
    if ([...SEELI.floodlights, ...benchSites(), ...lampSites()].some((f) => Math.hypot(f.x - x, f.z - z) < 2.5)) continue;
    sites.push({ x: round(x), z: round(z) });
    acc = 0;
  }
  return (sitesCache.cones = sites);
}

// --- The rink (winter): the boards, the gate, the snow bank ------------------------------------------------------------
/** The gate in the boards and the bank: the shore's point nearest the spur's start */
export function gatePoint() { return nearestOn(shoreRing(), ...SEELI.spur[0]); }
/**
 * The boards' line: the shore moved `inset` m in, open at the gate (one polyline from one side of the gate round to the
 * other)
 */
export function boardLine() {
  const B = SEELI.boards, line = resample(offsetRing(shoreRing(), -B.inset), 1.0), [gx, gz] = gatePoint();
  const n = line.length;
  const open = (p) => Math.hypot(p[0] - gx, p[1] - gz) < B.gate / 2 + B.inset;
  const s0 = line.findIndex(open);
  const out = [];
  let started = false;
  for (let k = 0; k < n; k++) {
    const p = line[(s0 + k) % n];
    if (open(p)) { if (started) break; continue; }
    started = true;
    out.push(p);
  }
  return out;
}
/** The snow bank's height over the ground `d` m out from the shore */
export function bankHeight(d) {
  const K = SEELI.bank;
  if (d <= K.from || d >= K.to) return 0;
  if (d < K.at) return K.peak * Math.sin(((d - K.from) / (K.at - K.from)) * Math.PI / 2);
  return K.peak * 0.5 * (1 + Math.cos(((d - K.at) / (K.to - K.at)) * Math.PI));
}
/** The shore's points every ~1.2 m with the way out (for the bank's sections), the gate and the mission spots left out */
export function bankStations() {
  const ring = resample(shoreRing(), 1.2), [gx, gz] = gatePoint(), out = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[(i + ring.length - 1) % ring.length], q = ring[i], r = ring[(i + 1) % ring.length];
    const e = norm([r[0] - p[0], r[1] - p[1]]);
    let nx = -e[1], nz = e[0];
    if (inRing(shoreRing(), q[0] + nx * 0.3, q[1] + nz * 0.3)) { nx = -nx; nz = -nz; }
    const gap = Math.hypot(q[0] - gx, q[1] - gz) < SEELI.boards.gate / 2 + 0.6;
    out.push({ x: q[0], z: q[1], nx, nz, gap });
  }
  return out;
}

// --- The fountain's winter case ----------------------------------------------------------------------------------------
/** An octagon round the fountain, its faces square to the axes (BUBENBRUNNEN's), clockwise seen from above */
export function hutOctagon(apothem) {
  const [cx, cz] = BUBENBRUNNEN.centre, r = apothem / Math.cos(Math.PI / 8), out = [];
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 - (i / 8) * Math.PI * 2; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}

// --- Colliders ---------------------------------------------------------------------------------------------------------
/** A thin oriented box between two points (world x, z), `thick` m across, at world heights (baseY set) */
export function obb(a, b, thick, y0, y1) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), u = [dx / len, dz / len];
  const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = len / 2, hz = thick / 2;
  const cs = u[0], sn = -u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } };
}
