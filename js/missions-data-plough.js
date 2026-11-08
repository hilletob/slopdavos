import { makeRoute, routePoint, projectRoute } from './missions-data-work.js';

// js/missions-data-plough.js
// The snow plough over the Wolfgang (js/missions-data.js lists it; js/missions-plough.js is its runtime): the definition
// and the pure logic, three.js-free like the other packages (tests/missions-plough.test.mjs drives it with a bot).
//
//   wolfgang-plough  Winter, before dawn, while it snows. The Kanton's plough lorry (orange, the blade in front, the salt
//                    spreader behind, two amber beacons) comes out of the Seegalerie by the Davosersee and clears the
//                    Prättigauerstrasse (Hauptstrasse 28) up to the Wolfgang Passhöhe (1631 m, by the Hotel Kulm), then
//                    turns and clears the other lane back down to the gallery: 2 x 2.14 km.
//                    A snow map along the road (s along it, d across it, + to the left going up): the blade clears a strip
//                    of its swept width and the snow slides off its trailing end into a wall beside the strip. V swings
//                    the blade (the throw side), F lifts and lowers it.
//                    Scored by time, with penalties (the reasons in the comments at PLOUGH):
//                      a snow pole knocked down +3 s; a car of the traffic hit +10 s; snow thrown onto the road (the blade
//                      swung the wrong way) +1 s a second; faster than 30 km/h with the blade down where houses stand by
//                      the road +1 s a second (the snow flies over the verge onto the pavement); the bridge joints of the
//                      Totalpbach bridge hit with the blade down +8 s; a side road's mouth buried under the wall +5 s.
// The road: OSM's Prättigauerstrasse (primary, 10 m) from the gallery's north portal (the gallery itself, OSM's unnamed
// tunnel along the lake, is not a road of the game) to the junction of the Stützalpstrasse at the Passhöhe. The heights
// along it (swissALTI3D): 1568 m at the portal, flat along the lake for 1 km, then up to 1631 m at the pass.
// The Werkhof itself is not in OSM (the Kanton's Strassenunterhalt has its base in Davos, but no mapped yard): the run
// starts where the work starts, at the gallery's end, the lorry having come through the gallery from Davos Dorf.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 10) * 10)} m`);
const pct = (f) => `${Math.floor(f * 100)} %`;

// The Prättigauerstrasse from the Seegalerie's north portal to the Passhöhe (OSM ways w30419868 ... w532399153, joined)
export const WOLFGANG_ROAD = [
  1248.6, -2509.1, 1324.8, -2563.1, 1368.4, -2596.6, 1371.5, -2599.2, 1374.5, -2602, 1396.1, -2623.8, 1399.1, -2627.2, 1401.9, -2630.7,
  1422.7, -2659.2, 1431.7, -2673.9, 1434.4, -2679, 1436.7, -2684.2, 1441.7, -2697.7, 1450, -2726, 1454.8, -2748.9, 1458.6, -2781,
  1460.5, -2838.9, 1462.1, -2857.5, 1466.9, -2882.4, 1500, -2989.4, 1506.8, -3010.2, 1513.7, -3031, 1520.2, -3044.7, 1523.2, -3051.2,
  1525.4, -3055.3, 1527.8, -3059.3, 1540, -3077.4, 1552.4, -3091.4, 1588.6, -3119, 1608.9, -3132.9, 1629.9, -3149.7, 1654.3, -3175.9,
  1667.5, -3193.3, 1676, -3206.4, 1728.1, -3288.3, 1736.7, -3303.5, 1749.8, -3324.8, 1792.9, -3391.3, 1794, -3392.8, 1798.8, -3400.6,
  1820.1, -3436.9, 1844.8, -3475.6, 1883, -3532.4, 1888.7, -3541.3, 1925.1, -3602.9, 1940.5, -3629, 1954.7, -3653.6, 1963.6, -3668.8,
  1970.5, -3680.4, 1974.5, -3687, 1987.9, -3709, 2017, -3756.7, 2022.5, -3766.9, 2025.3, -3772.5, 2027.3, -3776.9, 2028.9, -3781.5,
  2030.7, -3787.4, 2031.8, -3791.3, 2032.6, -3795.4, 2033.8, -3803.1, 2034.5, -3810.5, 2034.8, -3816.7, 2034.2, -3827.5, 2033.1, -3834.8,
  2031.7, -3841.7, 2027.2, -3856.3, 2024.7, -3862.7, 2018.3, -3875.1, 2011.1, -3886.1, 2004.2, -3894.7, 1997.4, -3901.5, 1887.3, -4001.6,
  1877.6, -4009.9, 1868.7, -4016.6, 1857.3, -4023.5, 1850.1, -4027.1, 1844.3, -4029.5, 1831.3, -4033.5, 1823.3, -4035.2, 1786.3, -4041.1,
  1780.8, -4042.6, 1776, -4044.1, 1771.3, -4046, 1770, -4046.6, 1763.4, -4050.1, 1760, -4052.2, 1756.3, -4054.7, 1752.7, -4057.4,
  1752, -4058, 1744.7, -4065.4, 1741, -4069.8, 1735.8, -4077.5, 1733.3, -4082, 1728.6, -4093, 1726.9, -4098.1, 1724.4, -4110,
  1722.7, -4125.1, 1722.5, -4130.2, 1722.9, -4140.5, 1724.4, -4151.1, 1725.7, -4157.2, 1733.1, -4189.8, 1735, -4196.8, 1738.4, -4206.9,
  1745.1, -4221.2
];

export const PLOUGH = {
  depth: 0.22, // m of fresh snow overnight
  residual: 0.012, // what the steel edge leaves on the asphalt
  clearAt: 0.06, // a cell this shallow counts as cleared
  cs: 1.0, cd: 0.5, // the snow map's cells: 1 m along the road, 0.5 m across
  half: 8.5, // the map reaches 8.5 m to each side of the axis: the 10 m road, the verges, the walls
  laneIn: 0.6, laneOut: 4.2, // a lane's strip that counts: 0.6 to 4.2 m off the axis (the crown and the shoulder do not)
  goal: 0.8, // of a lane's strip, cleared
  // the blade: a 3.9 m reversible blade (Schmidt / Kahlbacher class on a 2-axle lorry), angled 22° each way: 3.6 m swept
  bladeAhead: 3.85, bladeHalf: 1.95, bladeAngle: 0.384,
  // the wall: off the blade's trailing end, beyond the swept strip; faster, the snow is thrown further
  wallGap: 0.0, wallHalf: 0.85, throwFar: 0.3, throwMax: 1.8, // (m further a m/s over zoneSpeed, at most)
  maxTake: 15.5, // m/s: above this the blade rides up on the snow and leaves some
  // the snow poles (Schneestangen, orange and black, on both verges every 25 m outside the villages)
  poleD: 5.6, poleEvery: 25, poleMs: 3000,
  // villages: houses and the pavement close to the road; above 30 km/h the wall lands on them
  zoneSpeed: 8.4, zoneRate: 1.0,
  roadRate: 1.0, // s a second of snow thrown onto the road (the blade swung the wrong way)
  jointSpeed: 4.2, jointMs: 8000, // the Totalpbach bridge's two expansion joints: crawl over them or lift the blade
  buryMs: 5000, junctionHalf: 4.5, // a side road's mouth on the throw side, buried by the wall
  hitMs: 10000, // a car of the traffic hit
  body: { halfW: 1.25, halfL: 2.95, front: 3.0 }, // the lorry's footprint (centre, half width, half length), the blade beyond
  passS: 2118, // the Passhöhe: the lorry's centre this far up counts as there
  homeS: 16, // and back at the gallery
  startS: 9, startD: -2.4,
  timeLimitMs: 1500000
};

// Where houses stand close by the road (OSM buildings within ~12 m of the edge): Wolfgang the last
export const PLOUGH_ZONES = [
  { s0: 40, s1: 170, name: 'the houses by the lake' },
  { s0: 1100, s1: 1270, name: 'the houses at the Totalpbach' },
  { s0: 1950, s1: 2139, name: 'Wolfgang' }
];
// The Totalpbach bridge (OSM w111089510): its two joints
export const PLOUGH_JOINTS = [1080, 1089];
// The side roads whose mouths are not to be buried: s, the side (+1 left going up), the name
export const PLOUGH_JUNCTIONS = [
  { s: 232, side: -1, name: 'Meierhofstrasse' },
  { s: 672, side: 1, name: 'the old Prättigauerstrasse' },
  { s: 1132, side: 1, name: 'Totalpbachstrasse' },
  { s: 1246, side: -1, name: 'Höhwaldstrasse' },
  { s: 1405, side: 1, name: 'Herman-Burchard-Strasse' },
  { s: 2068, side: 1, name: 'the filling station' },
  { s: 2110, side: 1, name: 'the filling station' }
];
// (every OSM way joining the road: no snow pole stands in its mouth)
const MOUTHS = [[232, -1], [574, -1], [672, 1], [844, -1], [860, 1], [975, -1], [1079, 1], [1085, -1], [1132, 1], [1178, 1], [1246, -1], [1257, 1], [1405, 1], [1426, -1], [1571, 1], [2004, 1], [2040, 1], [2055, -1], [2068, 1], [2082, 1], [2095, 1], [2110, 1]];

export const zoneAt = (s) => PLOUGH_ZONES.find((z) => s >= z.s0 && s <= z.s1) || null;

export function createPloughRoute() { return makeRoute(WOLFGANG_ROAD); }

/** The snow poles along both verges: [{ s, d, hit }] */
export function createPoles(route, P = PLOUGH) {
  const out = [];
  for (let s = 20; s < route.length - 10; s += P.poleEvery) {
    if (zoneAt(s)) continue;
    for (const side of [-1, 1]) {
      if (MOUTHS.some(([m, ms]) => ms === side && Math.abs(m - s) < 12)) continue;
      if (PLOUGH_JOINTS.some((j) => Math.abs(j - s) < 8)) continue;
      out.push({ s, d: side * P.poleD, side, hit: false });
    }
  }
  return out;
}

// --- The snow map: cols along the road (cs), rows across (cd), from d = -half ---------------------------------------
// mask: 0 the margin (the crown, the shoulders, the verges), 1 the lane going up (d < 0), 2 the lane coming down
export function createPloughGrid(route, P = PLOUGH) {
  const cols = Math.ceil(route.length / P.cs), rows = Math.round((2 * P.half) / P.cd);
  const n = cols * rows;
  const g = { cols, rows, cs: P.cs, cd: P.cd, half: P.half, h: new Float32Array(n), mask: new Uint8Array(n), total: [0, 0, 0], cleared: [0, 0, 0], dirty: null, version: 0 };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, s = (i + 0.5) * P.cs, d = (j + 0.5) * P.cd - P.half, ad = Math.abs(d);
    g.h[k] = P.depth;
    const lane = s > 4 && s < route.length - 4 && ad >= P.laneIn && ad <= P.laneOut ? (d < 0 ? 1 : 2) : 0;
    g.mask[k] = lane;
    g.total[lane]++;
  }
  return g;
}
export function resetPloughGrid(g, P = PLOUGH) {
  g.h.fill(P.depth);
  g.cleared = [0, 0, 0];
  g.dirty = { i0: 0, i1: g.cols - 1, j0: 0, j1: g.rows - 1 };
  g.version++;
}
/** The share of a lane's strip (1 up, 2 down) that is cleared */
export const laneShare = (g, lane) => (g.total[lane] ? g.cleared[lane] / g.total[lane] : 0);

function touch(g, i, j) {
  const d = g.dirty || (g.dirty = { i0: i, i1: i, j0: j, j1: j });
  if (i < d.i0) d.i0 = i; if (i > d.i1) d.i1 = i;
  if (j < d.j0) d.j0 = j; if (j > d.j1) d.j1 = j;
}
function setCell(g, k, i, j, h, clearAt) {
  const was = g.h[k] <= clearAt, now = h <= clearAt, lane = g.mask[k];
  if (was !== now) g.cleared[lane] += now ? 1 : -1;
  g.h[k] = h;
  touch(g, i, j);
}

/** Calls fn(k, i, j, along, across) for the cells whose centre lies in the box centred at (cs, cd) in (s, d), ±halfL
 *  along the unit direction (fu, fv), ±halfW across it */
export function forCellsInBox(g, cs, cd, fu, fv, halfL, halfW, fn) {
  const es = Math.abs(fu) * halfL + Math.abs(fv) * halfW, ed = Math.abs(fv) * halfL + Math.abs(fu) * halfW;
  const i0 = Math.max(0, Math.floor((cs - es) / g.cs)), i1 = Math.min(g.cols - 1, Math.floor((cs + es) / g.cs));
  const j0 = Math.max(0, Math.floor((cd + g.half - ed) / g.cd)), j1 = Math.min(g.rows - 1, Math.floor((cd + g.half + ed) / g.cd));
  for (let j = j0; j <= j1; j++) {
    const pd = (j + 0.5) * g.cd - g.half - cd;
    for (let i = i0; i <= i1; i++) {
      const ps = (i + 0.5) * g.cs - cs;
      const along = ps * fu + pd * fv, across = pd * fu - ps * fv;
      if (Math.abs(along) <= halfL && Math.abs(across) <= halfW) fn(j * g.cols + i, i, j, along, across);
    }
  }
}

/** The blade in (s, d) for the lorry at p = { s, d } facing a off the road's direction, throwing to `side` (+1 the
 *  lorry's left): its middle, the trailing end (where the snow leaves it) and the leading end */
export function bladeGeometry(p, a, side, P = PLOUGH) {
  const fu = Math.cos(a), fv = Math.sin(a), lu = -fv, lv = fu; // forward and left in (s, d)
  const c = { s: p.s + fu * P.bladeAhead, d: p.d + fv * P.bladeAhead };
  const across = P.bladeHalf * Math.cos(P.bladeAngle), back = P.bladeHalf * Math.sin(P.bladeAngle);
  const trail = { s: c.s + lu * side * across - fu * back, d: c.d + lv * side * across - fv * back };
  const lead = { s: c.s - lu * side * across + fu * back, d: c.d - lv * side * across + fv * back };
  return { c, trail, lead, fu, fv, lu, lv, across };
}

/**
 * One step of the plough: the lorry at p = { s, d } (its centre), facing a off the road, `speed` m/s (forward +), the
 * blade `lowered`, throwing to `side`; dt s. Clears the strip the blade swept since the last step and builds the wall
 * beside it. Returns { vol (m³ moved), onRoad (m³ that landed on the carriageway), far (m the wall went out further), wall { s, d } }
 */
export function stepPlough(g, p, a, speed, lowered, side, dt, P = PLOUGH) {
  const out = { vol: 0, onRoad: 0, far: 0, wall: null };
  if (!lowered || speed < 0.3) return out;
  const b = bladeGeometry(p, a, side, P);
  const travel = speed * dt;
  const take = speed <= P.maxTake ? 1 : Math.max(0.5, 1 - (speed - P.maxTake) / 6);
  const area = g.cs * g.cd;
  const keep = P.residual;
  forCellsInBox(g, b.c.s - b.fu * travel * 0.5, b.c.d - b.fv * travel * 0.5, b.fu, b.fv, 0.3 + travel * 0.5, b.across, (k, i, j) => {
    const h = g.h[k];
    if (h <= keep) return;
    const left = keep + (h - keep) * (1 - take);
    out.vol += (h - left) * area;
    setCell(g, k, i, j, left, P.clearAt);
  });
  if (out.vol <= 0) return out;
  // the wall: beside the swept strip on the throw side, a little behind the blade's trailing end
  out.far = Math.min(P.throwMax, Math.max(0, speed - P.zoneSpeed) * P.throwFar);
  const off = b.across + P.wallGap + P.wallHalf + out.far;
  const ws = b.c.s - b.fu * (travel * 0.5 + 0.6) + b.lu * side * off, wd = b.c.d - b.fv * (travel * 0.5 + 0.6) + b.lv * side * off;
  out.wall = { s: ws, d: wd };
  const cells = [];
  let wsum = 0;
  forCellsInBox(g, ws, wd, b.fu, b.fv, travel * 0.5 + 0.5, P.wallHalf, (k, i, j, along, across) => {
    const w = 1 - Math.abs(across) / (P.wallHalf + 0.05);
    cells.push(k, i, j, w);
    wsum += w;
  });
  if (!wsum) return out;
  for (let q = 0; q < cells.length; q += 4) {
    const k = cells[q], add = (out.vol * cells[q + 3]) / wsum;
    if (Math.abs((cells[q + 2] + 0.5) * g.cd - g.half) < P.laneOut) out.onRoad += add; // (the lanes and the crown between them)
    setCell(g, k, cells[q + 1], cells[q + 2], g.h[k] + add / area, P.clearAt);
  }
  return out;
}

/** Is the point (s, d) within `pad` of the box centred at c, ±halfL along (fu, fv), ±halfW across? */
function inBox(s, d, cs, cd, fu, fv, halfL, halfW, pad = 0) {
  const ps = s - cs, pd = d - cd;
  return Math.abs(ps * fu + pd * fv) <= halfL + pad && Math.abs(pd * fu - ps * fv) <= halfW + pad;
}

/** The poles the lorry (its body or its blade, lowered or not) knocks down at p facing a: marks and returns them */
export function poleHits(poles, p, a, side, travel = 0, P = PLOUGH) {
  const hits = [];
  const b = bladeGeometry(p, a, side, P);
  for (const pole of poles) {
    if (pole.hit || Math.abs(pole.s - p.s) > 9) continue;
    const body = inBox(pole.s, pole.d, p.s, p.d, b.fu, b.fv, P.body.halfL, P.body.halfW, 0.05);
    const blade = inBox(pole.s, pole.d, b.c.s - b.fu * travel * 0.5, b.c.d - b.fv * travel * 0.5, b.fu, b.fv, 0.35 + travel * 0.5, b.across + 0.05);
    if (body || blade) { pole.hit = true; hits.push(pole); }
  }
  return hits;
}

/** Did the blade (lowered) cross one of the bridge joints between the blade's s `from` and `to`? Returns the joint or null */
export function jointCrossed(from, to, joints = PLOUGH_JOINTS) {
  const a = Math.min(from, to), b = Math.max(from, to);
  for (const j of joints) if (j > a && j <= b) return j;
  return null;
}

/** A side road's mouth the wall at (s, d) buries (the wall on its side, within its half width), or null */
export function buriedJunction(wall, junctions = PLOUGH_JUNCTIONS, P = PLOUGH) {
  if (!wall) return null;
  for (const j of junctions) if (Math.abs(wall.s - j.s) <= P.junctionHalf && Math.sign(wall.d) === j.side && Math.abs(wall.d) > P.laneOut) return j;
  return null;
}

/** Do two boxes (x, z, heading, halfW, halfL) in the world overlap? (separating axes) */
export function boxesOverlap(A, B) {
  const axes = [[Math.sin(A.h), Math.cos(A.h)], [Math.cos(A.h), -Math.sin(A.h)], [Math.sin(B.h), Math.cos(B.h)], [Math.cos(B.h), -Math.sin(B.h)]];
  const dx = B.x - A.x, dz = B.z - A.z;
  const ext = (o, ax, az) => o.halfL * Math.abs(Math.sin(o.h) * ax + Math.cos(o.h) * az) + o.halfW * Math.abs(Math.cos(o.h) * ax - Math.sin(o.h) * az);
  for (const [ax, az] of axes) if (Math.abs(dx * ax + dz * az) > ext(A, ax, az) + ext(B, ax, az)) return false;
  return true;
}

/** Where on the road the lorry is: { s, d, a (its heading off the road's way up, -π..π), up (going up the pass) } */
export function roadPose(route, x, z, heading, out = {}) {
  const pr = projectRoute(route, x, z, out);
  let a = heading - Math.atan2(pr.tx, pr.tz);
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  out.a = a;
  out.up = Math.cos(a) >= 0;
  return out;
}

// =====================================================================================================================
const ID = 'wolfgang-plough';
const route = createPloughRoute();
const PASS = routePoint(route, route.length);
const HOME = routePoint(route, 0);

function laneText(state, lane, where, dist) {
  return `${where}: ${fmtDist(dist)} · lane cleared ${pct(lane === 1 ? state.north : state.south)} of ${pct(PLOUGH.goal)}`;
}
function hintFor(ctx, state, lane) {
  if (ctx.mode !== 'car') return 'Back into the plough';
  if (state.roadThrow) return 'You are throwing the snow onto the road: V swings the blade';
  if (state.zoneFast) return `Houses by the road: below 30 km/h, or the snow flies onto the pavement`;
  if (state.jointAhead) return 'Bridge joints ahead: F lifts the blade (or crawl over them)';
  if (state.junctionAhead) return `${state.junctionAhead} ahead on your throw side: F lifts the blade past it`;
  if (!state.lowered && state.moving) return 'The blade is up: F lowers it';
  if (state.offLane && state.lowered && state.moving) return lane === 1 ? 'Keep to the right lane: the blade clears 3.6 m' : 'Keep to the right lane on the way down';
  return null;
}

export const PLOUGH_MISSION = {
  id: ID,
  title: 'Snow plough over the Wolfgang',
  intro: 'Five in the morning, and it has snowed twenty centimetres since midnight. The Kanton\'s plough lorry comes out of the Seegalerie by the Davosersee: clear the Prättigauerstrasse up to the Wolfgang Passhöhe (1631 m) on the right lane, turn at the pass and clear the other lane back down to the gallery, before the first post bus. The blade sweeps 3.6 m and throws the snow off its trailing end into a wall: V swings it to the other side, F lifts and lowers it. Mind the snow poles on the verges, the oncoming traffic, the houses by the road (below 30 km/h there, or the snow lands on the pavement), the joints of the Totalpbach bridge and the side roads, whose mouths the wall must not bury.',
  mode: 'car',
  season: 'winter',
  time: 'predawn',
  features: ['workVehicle', 'plough'],
  props: [],
  vehicle: 'plough',
  colour: '#f07d1a',
  icon: 'plough',
  // (the bot of tests/missions-plough.test.mjs: 54 km/h on the open road, 29 km/h by the houses, 14 km/h over the joints,
  // the blade lifted past the side roads, 35 s for the turn at the pass: 6:22 without accelerating; a clean run with the
  // lorry's acceleration and the bends ~6:50. Silver +40 %, bronze about double)
  bonusMs: 410000,
  medals: { gold: 410000, silver: 570000, bronze: 810000 },
  timeLimitMs: PLOUGH.timeLimitMs,
  finish: 'The Prättigauerstrasse is black from the Davosersee to the Wolfgang, the walls stand along the verges, and the first post bus to Klosters comes over the pass on time.',
  get start() { const p = routePoint(route, PLOUGH.startS, PLOUGH.startD); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: p.heading }; },
  pin: { x: +HOME.x.toFixed(1), z: +HOME.z.toFixed(1) },
  createState() {
    return {
      north: 0, south: 0, s: PLOUGH.startS, d: PLOUGH.startD, up: true, lowered: true, side: -1, moving: false, offLane: false,
      poles: 0, hits: 0, roadSec: 0, zoneSec: 0, joints: 0, buried: 0, penaltyMs: 0,
      roadThrow: false, zoneFast: false, jointAhead: false, junctionAhead: null, atPass: false
    };
  },
  objectives: [
    {
      id: 'up',
      title: 'Clear the lane up to the Wolfgang Passhöhe',
      check(ctx, state) {
        if (ctx.t > PLOUGH.timeLimitMs) return { done: false, fail: 'The morning traffic is stuck in the snow on the Wolfgang: too slow.', text: '', progress: state.north, target: null, hint: null };
        if (state.s >= PLOUGH.passS) state.atPass = true;
        const done = state.atPass && state.north >= PLOUGH.goal;
        const dist = route.length - state.s;
        const hint = state.atPass && state.north < PLOUGH.goal ? 'Too much snow left on the lane: go back and clear it' : hintFor(ctx, state, 1);
        return { done, progress: Math.min(state.north / PLOUGH.goal, state.s / PLOUGH.passS), text: laneText(state, 1, 'To the Passhöhe', dist), target: { x: PASS.x, z: PASS.z, r: 9 }, hint };
      }
    },
    {
      id: 'down',
      title: 'Turn at the pass, clear the other lane back down',
      check(ctx, state) {
        if (ctx.t > PLOUGH.timeLimitMs) return { done: false, fail: 'The morning traffic is stuck in the snow on the Wolfgang: too slow.', text: '', progress: state.south, target: null, hint: null };
        const home = state.s <= PLOUGH.homeS;
        const done = home && state.south >= PLOUGH.goal && state.north >= PLOUGH.goal;
        let hint = hintFor(ctx, state, 2);
        if (state.north < PLOUGH.goal) hint = 'Snow thrown back onto the lane you cleared: it needs clearing again';
        else if (home && state.south < PLOUGH.goal) hint = 'Too much snow left on the lane: go back and clear it';
        else if (!hint && state.up && state.s > PLOUGH.passS - 40) hint = 'Turn round: the lane down is on the other side';
        return { done, progress: state.south / PLOUGH.goal, text: laneText(state, 2, 'To the Seegalerie', state.s), target: { x: HOME.x, z: HOME.z, r: 9 }, hint };
      }
    }
  ],
  summary(state) {
    const P = PLOUGH;
    const lines = [`Up ${pct(state.north)} · down ${pct(state.south)} cleared`];
    const pen = [];
    if (state.poles) pen.push(`${state.poles} snow pole${state.poles === 1 ? '' : 's'} (+${(state.poles * P.poleMs) / 1000} s)`);
    if (state.hits) pen.push(`${state.hits} car${state.hits === 1 ? '' : 's'} hit (+${(state.hits * P.hitMs) / 1000} s)`);
    if (state.joints) pen.push(`${state.joints} bridge joint${state.joints === 1 ? '' : 's'} (+${(state.joints * P.jointMs) / 1000} s)`);
    if (state.buried) pen.push(`${state.buried} side road${state.buried === 1 ? '' : 's'} buried (+${(state.buried * P.buryMs) / 1000} s)`);
    if (state.roadSec >= 0.5) pen.push(`snow on the road ${Math.round(state.roadSec)} s (+${Math.round(state.roadSec * P.roadRate)} s)`);
    if (state.zoneSec >= 0.5) pen.push(`too fast by the houses ${Math.round(state.zoneSec)} s (+${Math.round(state.zoneSec * P.zoneRate)} s)`);
    lines.push(pen.length ? pen.join(' · ') : 'A clean run: no penalties');
    return lines;
  }
};

export const PLOUGH_MISSIONS = [PLOUGH_MISSION];
