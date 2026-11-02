import { DETAIL_HOUSES, frame as houseFrame } from './detail-houses-data.js';

// js/missions-data-work.js
// Six missions of everyday work in the Landschaft Davos (js/missions-data.js lists them; js/missions-work.js has their
// runtime: the maps' meshes, the vehicles, the props): their definitions and the pure logic behind them, three.js-free
// like the other packages (tests/missions-work.test.mjs drives them with synthetic frames and bots).
//
//   snow-shovel    Winter. On foot with a snow pusher: the access path in front of Dischmastrasse 19 (Davos Dorf) is
//                  cleared of 30 cm of fresh snow. A height map over the path (SHOVEL_GRID), the blade scrapes the snow
//                  into its load as the player walks with Space held, a full load is thrown to the side onto a heap
//                  (into the margin of the same map: the heaps grow visibly). Gold by time.
//   snow-blower    Winter. A compact rotary snow blower (Rolba/Zaugg-like) clears the Bündastrasse in Davos Dorf after
//                  a snowfall: a snow map along the road (s along it, d across it), the blower takes what is under its
//                  auger and throws it in a high arc to the side (V turns the chute); parked cars are not to be hit
//                  nor buried. Driving too fast chokes the auger (it leaves snow behind).
//   lawn-mowing    Summer. A ride-on mower on a lawn of the Kurpark (Davos Platz): a grass map, the deck cuts the
//                  cells it passes, the cut grass shows light and dark stripes by the direction of the pass (as the
//                  groom map shows the tiller's passes); the two flower beds are not to be driven over (+2 s a trodden
//                  patch).
//   garbage-run    All year. A refuse truck's round from the Kehrichtmehrzweckanlage Davos (KMA, Clavadelerstrasse 4)
//                  through the Hof quarter of Davos Platz: ten collection points (bags, containers) to stop at — the
//                  crew loads automatically while the truck stands — and back to the KMA to unload. A point left out
//                  costs 45 s.
//   alpine-roses   Summer. Alpenrosen (Rhododendron ferrugineum) on the slope below the Strelaberg (~2050-2150 m, just
//                  above the forest): a small bouquet of 12 flowering sprigs (Space held at a flowering bush); bushes
//                  not in flower are left alone (+3 s for a damaged one); the protected area (Naturschutz) is not to be
//                  entered (+10 s each time). Back to the start.
//   mushroom-hunt  Summer/autumn. Mushrooms in the forest at the mouth of the Dischmatal: porcini, chanterelles and
//                  their look-alikes (bitter bolete, false chanterelle) and fly agarics; the HUD describes the one in
//                  front of the player, Space picks it. Ten in the basket (or five minutes), then to the mushroom
//                  control: points for the edible ones, deductions for the rest. Medals by points.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
const pct = (f) => `${Math.floor(f * 100)} %`;

/** A small deterministic PRNG (the bushes and the mushrooms stand in the same places every run) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =====================================================================================================================
// The work maps: a regular grid of cells over a local (u, v) frame, one value a cell (the snow's depth in m, the grass's
// height 0-1), a mask (0: margin, not counted; 1: the target; 2: blocked — a flower bed, a parked car) and, for the
// lawn, the direction of the pass that cut it (the stripes)
export const MASK_MARGIN = 0, MASK_TARGET = 1, MASK_BLOCKED = 2;

export function createGrid(cols, rows, cell) {
  return { cols, rows, cell, h: new Float32Array(cols * rows), mask: new Uint8Array(cols * rows), dir: new Uint8Array(cols * rows), version: 0, dirty: null };
}

/** Marks the cell range [i0..i1] × [j0..j1] changed (the mesh updates just those) */
function touch(g, i, j) {
  const d = g.dirty || (g.dirty = { i0: i, i1: i, j0: j, j1: j });
  if (i < d.i0) d.i0 = i; if (i > d.i1) d.i1 = i;
  if (j < d.j0) d.j0 = j; if (j > d.j1) d.j1 = j;
  g.version++;
}

/**
 * Calls fn(index, i, j) for every cell whose centre lies in the box centred at (cu, cv) (grid metres), its length
 * ±halfL along the unit direction (fu, fv), ±halfW across it
 */
export function forCellsInBox(g, cu, cv, fu, fv, halfL, halfW, fn) {
  const ext = Math.abs(fu) * halfL + Math.abs(fv) * halfW, exv = Math.abs(fv) * halfL + Math.abs(fu) * halfW;
  const i0 = Math.max(0, Math.floor((cu - ext) / g.cell)), i1 = Math.min(g.cols - 1, Math.floor((cu + ext) / g.cell));
  const j0 = Math.max(0, Math.floor((cv - exv) / g.cell)), j1 = Math.min(g.rows - 1, Math.floor((cv + exv) / g.cell));
  for (let j = j0; j <= j1; j++) {
    const pv = (j + 0.5) * g.cell - cv;
    for (let i = i0; i <= i1; i++) {
      const pu = (i + 0.5) * g.cell - cu;
      const along = pu * fu + pv * fv, across = pv * fu - pu * fv;
      if (Math.abs(along) <= halfL && Math.abs(across) <= halfW) fn(j * g.cols + i, i, j);
    }
  }
}

/** The share of the target cells for which test(h, index) holds */
export function gridFraction(g, test) {
  let n = 0, ok = 0;
  for (let k = 0; k < g.h.length; k++) if (g.mask[k] === MASK_TARGET) { n++; if (test(g.h[k], k)) ok++; }
  return n ? ok / n : 0;
}

/** Spreads `volume` (m³) over the cells round (u, v) as a heap of radius r (a cone: most in the middle) */
export function depositHeap(g, u, v, volume, r = 0.7) {
  const cells = [];
  let wsum = 0;
  const i0 = Math.max(0, Math.floor((u - r) / g.cell)), i1 = Math.min(g.cols - 1, Math.floor((u + r) / g.cell));
  const j0 = Math.max(0, Math.floor((v - r) / g.cell)), j1 = Math.min(g.rows - 1, Math.floor((v + r) / g.cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot((i + 0.5) * g.cell - u, (j + 0.5) * g.cell - v);
    if (d > r) continue;
    const w = 1 - d / r;
    cells.push([j * g.cols + i, i, j, w]);
    wsum += w;
  }
  if (!wsum) return 0;
  const area = g.cell * g.cell;
  for (const [k, i, j, w] of cells) { g.h[k] += (volume * w) / wsum / area; touch(g, i, j); }
  return volume;
}

/** A local frame: origin (ox, oz), the unit axes u (ux, uz) and v (vx, vz), the grid starting `margin` m before both */
export function makeFrame(ox, oz, ux, uz, margin = 0) {
  const vx = -uz, vz = ux; // (v: u turned a quarter to the right in the world's x-z plane... see below)
  return {
    ox, oz, ux, uz, vx, vz, margin,
    toGrid(x, z, out = {}) { const dx = x - ox, dz = z - oz; out.u = dx * ux + dz * uz + margin; out.v = dx * vx + dz * vz + margin; return out; },
    toWorld(u, v, out = {}) { const a = u - margin, b = v - margin; out.x = ox + ux * a + vx * b; out.z = oz + uz * a + vz * b; return out; },
    dirToGrid(fx, fz, out = {}) { out.u = fx * ux + fz * uz; out.v = fx * vx + fz * vz; return out; }
  };
}
// (makeFrame's v axis is (-uz, ux): in the world frame (x east, z south) that is u turned 90° clockwise seen from above)

// --- A road as a frame: s along the polyline, d across it (+ to the left of the way along) --------------------------------
export function makeRoute(pts) {
  const n = pts.length / 2;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  return { pts, cum, length: cum[n - 1] };
}

/** The point at arc length s, d m to the left: { x, z, tx, tz (the unit tangent), heading } */
export function routePoint(route, s, d = 0, out = {}) {
  const { pts, cum } = route;
  const n = pts.length / 2;
  s = clamp(s, 0, route.length);
  let i = 0;
  while (i < n - 2 && cum[i + 1] < s) i++;
  const L = cum[i + 1] - cum[i] || 1;
  const t = (s - cum[i]) / L;
  const tx = (pts[i * 2 + 2] - pts[i * 2]) / L, tz = (pts[i * 2 + 3] - pts[i * 2 + 1]) / L;
  // (left of heading h is (cos h, -sin h); the heading of (tx, tz) is atan2(tx, tz): left = (tz, -tx))
  out.x = pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * t + tz * d;
  out.z = pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * t - tx * d;
  out.tx = tx; out.tz = tz; out.heading = Math.atan2(tx, tz);
  return out;
}

/** The nearest point of the route to (x, z): { s, d, tx, tz } */
export function projectRoute(route, x, z, out = {}) {
  const { pts, cum } = route;
  let best = Infinity;
  for (let i = 0; i < pts.length / 2 - 1; i++) {
    const ax = pts[i * 2], az = pts[i * 2 + 1], dx = pts[i * 2 + 2] - ax, dz = pts[i * 2 + 3] - az;
    const L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const px = ax + dx * t, pz = az + dz * t;
    const d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < best) {
      best = d2;
      out.s = cum[i] + t * L; out.tx = dx / L; out.tz = dz / L;
      out.d = (x - px) * out.tz - (z - pz) * out.tx;
    }
  }
  return out;
}

// =====================================================================================================================
// 1. Schneeschaufeln: the access path of Dischmastrasse 19
// (the house's frame, js/detail-houses-data.js: local x along the ridge to the east gable, z to the south front with
// the lean-to; the door's outdoor stair comes down on the east side, the Dischmastrasse runs along the west gable)
const HOUSE = DETAIL_HOUSES.find((h) => h.id === 'dischmastrasse-19');
const HF = houseFrame(HOUSE);
const houseToWorld = (lx, lz) => ({ x: HF.cx + HF.u[0] * lx + HF.v[0] * lz, z: HF.cz + HF.u[1] * lx + HF.v[1] * lz });
// The path: south of the house, from inside the street fence (local x -6.4; the fence runs at ~-7.6) to past the
// stair's foot (x 7.0), 3.2 m wide
// (local z 6.3 to 9.5, clear of the lean-to's roof); the margin round it takes the heaps (not to the north: the house)
export const SHOVEL = {
  depth: 0.3, // m of fresh snow
  cell: 0.25,
  margin: 2.5,
  size: { u: 13.4, v: 3.2 },
  bladeHalfW: 0.32, bladeAhead: 0.7, bladeHalfL: 0.16, // the pusher's blade: 0.64 m wide, 0.7 m in front of the feet
  capacity: 0.16, // m³ on the blade before it has to be thrown
  throwS: 0.55, // s a throw takes (no scraping meanwhile)
  throwReach: 3.4, // m at most from the player to where the snow lands
  clearAt: 0.03, // m: a cell counts as cleared
  goal: 0.95,
  sides: { north: false, south: true, west: false, east: true } // where the heaps may go (north: the house; west: the fence and the street)
};
{
  // (the frame's u along the house's x axis; makeFrame's v = u turned clockwise = the house's z, to the south front)
  const o = houseToWorld(-6.4, 6.3);
  SHOVEL.frame = makeFrame(o.x, o.z, HF.u[0], HF.u[1], SHOVEL.margin);
}
export const SHOVEL_START = (() => { const p = houseToWorld(-5.4, 7.9); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: Math.atan2(HF.u[0], HF.u[1]) }; })();

export function createShovelGrid(S = SHOVEL) {
  const cols = Math.round((S.size.u + 2 * S.margin) / S.cell), rows = Math.round((S.size.v + 2 * S.margin) / S.cell);
  const g = createGrid(cols, rows, S.cell);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const u = (i + 0.5) * S.cell - S.margin, v = (j + 0.5) * S.cell - S.margin;
    const inside = u >= 0 && u <= S.size.u && v >= 0 && v <= S.size.v;
    const k = j * cols + i;
    g.mask[k] = inside ? MASK_TARGET : MASK_MARGIN;
    g.h[k] = S.depth; // (the margin too: the snow lies everywhere; the heaps grow on it)
  }
  return g;
}

/** Where a throw from (u, v) lands: the nearest allowed edge of the path, 0.7 m beyond it (grid metres) */
export function throwTarget(u, v, S = SHOVEL) {
  const m = S.margin, U = S.size.u + m, V = S.size.v + m;
  const opts = [];
  if (S.sides.south) opts.push({ d: V - v, u, v: V + 0.7 });
  if (S.sides.north) opts.push({ d: v - m, u, v: m - 0.7 });
  if (S.sides.west) opts.push({ d: u - m, u: m - 0.7, v });
  if (S.sides.east) opts.push({ d: U - u, u: U + 0.7, v });
  opts.sort((a, b) => a.d - b.d);
  const t = opts[0];
  // (no further than the reach: a throw from the far side of the path falls short, onto the path)
  const dx = t.u - u, dv = t.v - v, L = Math.hypot(dx, dv);
  const k = L > S.throwReach ? S.throwReach / L : 1;
  return { u: u + dx * k, v: v + dv * k };
}

export const createShovel = () => ({ load: 0, throwT: 0, throwTo: null, throwLoad: 0, throws: 0, moved: 0 });

/**
 * One step of the shovel. p: { u, v } the player in the grid, f: { u, v } its facing (unit), speed (m/s), hold (the
 * key). Returns 'throw' when a throw starts, 'land' when its snow comes down, else null.
 */
export function stepShovel(sh, g, p, f, speed, hold, dt, S = SHOVEL) {
  let ev = null;
  if (sh.throwT > 0) {
    const before = sh.throwT;
    sh.throwT -= dt;
    if (before > S.throwS * 0.35 && sh.throwT <= S.throwS * 0.35) { depositHeap(g, sh.throwTo.u, sh.throwTo.v, sh.throwLoad, 0.75); ev = 'land'; }
    if (sh.throwT > 0) return ev;
    sh.throwT = 0;
  }
  if (hold && speed > 0.15) {
    const area = g.cell * g.cell;
    forCellsInBox(g, p.u + f.u * S.bladeAhead, p.v + f.v * S.bladeAhead, f.u, f.v, S.bladeHalfL, S.bladeHalfW, (k, i, j) => {
      const room = (S.capacity - sh.load) / area;
      if (room <= 0 || g.h[k] <= 0) return;
      const take = Math.min(g.h[k], room);
      g.h[k] -= take;
      sh.load += take * area;
      touch(g, i, j);
    });
  }
  if (sh.load >= S.capacity - 1e-6 || (!hold && sh.load > 0.004)) {
    sh.throwTo = throwTarget(p.u, p.v, S);
    sh.throwLoad = sh.load;
    sh.load = 0;
    sh.throwT = S.throwS;
    sh.throws++;
    ev = 'throw';
  }
  return ev;
}

export const shovelCleared = (g, S = SHOVEL) => gridFraction(g, (h) => h <= S.clearAt);

/** A bot along the path in rows (the calibration, the tests): the waypoints in grid metres */
export function shovelBotPath(S = SHOVEL) {
  const m = S.margin, pts = [];
  const rows = Math.ceil(S.size.v / (S.bladeHalfW * 2 - 0.08));
  for (let r = 0; r < rows; r++) {
    const v = m + Math.min(S.size.v - S.bladeHalfW + 0.04, S.bladeHalfW - 0.04 + r * (S.bladeHalfW * 2 - 0.08));
    const a = m - S.bladeAhead + 0.1, b = m + S.size.u - S.bladeAhead + 0.3;
    pts.push(r % 2 ? [b, v, a, v] : [a, v, b, v]);
  }
  return pts;
}

const SHOVEL_ID = 'snow-shovel';
export const SNOW_SHOVEL_MISSION = {
  id: SHOVEL_ID,
  title: 'Snow shovelling at Dischmastrasse',
  intro: 'Thirty centimetres of fresh snow overnight in Davos Dorf. Clear the access path of the larch chalet at Dischmastrasse 19, from the street to the stair at the door. Hold Space (or the Shovel button) and walk: the pusher scrapes the snow up; when it is full you throw it aside onto a heap in the garden (it happens by itself, and when you let go). At least 95 % of the path has to be clear.',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['shovel'],
  props: [],
  colour: '#5aa9e6',
  icon: 'shovel',
  // (an ideal bot along the path in rows at 1.6 m/s: ~2:00, shovelBotPath; the scripted run in the game with its
  // sweeping up of the last patches 3:15)
  bonusMs: 165000,
  medals: { gold: 165000, silver: 225000, bronze: 330000 },
  timeLimitMs: 600000,
  finish: 'The path is clear down to the gravel, the heaps stand in the garden. A coffee in the Stube is earned.',
  start: SHOVEL_START,
  createState() { return { cleared: 0, load: 0, throws: 0, penaltyMs: 0 }; },
  objectives: [0.5, SHOVEL.goal].map((goal, k) => ({
    id: k ? 'all' : 'half',
    title: k ? 'Clear the whole path' : 'Clear half of the path',
    check(ctx, state) {
      if (ctx.t > SNOW_SHOVEL_MISSION.timeLimitMs) return { done: false, fail: 'Too slow: the postman has already slipped on the path.', text: '', progress: state.cleared, target: null, hint: null };
      const loadBar = state.load > 0 ? ` · blade ${Math.round((state.load / SHOVEL.capacity) * 100)} %` : '';
      return {
        done: state.cleared >= goal,
        progress: state.cleared / SHOVEL.goal,
        text: `Path cleared ${pct(state.cleared)} of ${pct(SHOVEL.goal)}${loadBar}`,
        target: null,
        hint: ctx.mode !== 'person' ? 'On foot!' : state.load === 0 && state.cleared < 0.02 ? 'Hold Space and walk along the path' : null
      };
    }
  })),
  summary(state) { return [`${state.throws} shovels thrown onto the heaps · ${pct(state.cleared)} of the path cleared`]; }
};

// =====================================================================================================================
// 2. Schneeschleuder: the Bündastrasse in Davos Dorf (OSM w26127856, residential, 6 m), its first 300 m from the
// Dischmastrasse to the east
export const BUENDA_ROAD = [744, -1121.9, 779.7, -1125.2, 784.1, -1126.2, 857.9, -1152.6, 867.9, -1155, 870.2, -1155.4, 875.2, -1156, 878.9, -1156, 963.9, -1147.9, 999.8, -1144.5, 1054.1, -1139.5];
export const BLOWER = {
  length: 300, // m of the road to clear
  cell: 0.5,
  half: 3, // m: the road either side of its line
  clearHalf: 2.4, // m: the band that has to be cleared (the kerbs stay)
  depth: 0.4,
  workHalf: 1.4, // the auger: 2.8 m wide
  ahead: 2.0, halfL: 0.35, // the auger 2 m in front of the blower's centre
  chokeSpeed: 3.6, // m/s: faster, the auger chokes and leaves snow behind
  clearAt: 0.05,
  goal: 0.95,
  throwSide: 9, throwAhead: 3, // m: where the chute's snow lands (to the side, a little ahead)
  buryRadius: 3.2, // m round a parked car: snow landing there buries it
  buryRate: 2, // s of penalty a second of burying
  hitMs: 10000,
  body: { halfW: 1.25, halfL: 2.6 } // the blower with its auger, for the collisions with the parked cars
};
// (three cars parked half on the kerb: on the right going out, on the left, on the right again)
export const BLOWER_CARS = [
  { s: 92, d: -2.3, colour: [0.55, 0.06, 0.06] },
  { s: 168, d: 2.3, colour: [0.16, 0.22, 0.4] },
  { s: 238, d: -2.3, colour: [0.75, 0.75, 0.72] }
];
export const CAR_HALF = { w: 0.9, l: 2.25 };

export function createBlowerRoute(B = BLOWER) {
  // (cut at B.length)
  const full = makeRoute(BUENDA_ROAD);
  const pts = [];
  for (let i = 0; i < BUENDA_ROAD.length / 2; i++) {
    if (full.cum[i] >= B.length) { const p = routePoint(full, B.length); pts.push(+p.x.toFixed(2), +p.z.toFixed(2)); break; }
    pts.push(BUENDA_ROAD[i * 2], BUENDA_ROAD[i * 2 + 1]);
  }
  return makeRoute(pts);
}

export function createBlowerGrid(route, B = BLOWER, cars = BLOWER_CARS) {
  const cols = Math.round(route.length / B.cell), rows = Math.round((2 * B.half) / B.cell);
  const g = createGrid(cols, rows, B.cell);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const s = (i + 0.5) * B.cell, d = (j + 0.5) * B.cell - B.half;
    const k = j * cols + i;
    g.h[k] = B.depth;
    g.mask[k] = Math.abs(d) <= B.clearHalf && s > 1 ? MASK_TARGET : MASK_MARGIN;
    for (const c of cars) if (Math.abs(s - c.s) <= CAR_HALF.l + 0.4 && Math.abs(d - c.d) <= CAR_HALF.w + 0.35) g.mask[k] = MASK_BLOCKED;
  }
  return g;
}

/** The fraction of the snow the auger takes at this speed (1 up to the choke speed, less above) */
export const augerTake = (speed, B = BLOWER) => (Math.abs(speed) <= B.chokeSpeed ? 1 : Math.max(0.3, 1 - (Math.abs(speed) - B.chokeSpeed) / 3.5));

/**
 * One step of the blower on the road grid: p = { s, d } its centre, f = { u, v } its facing in (s, d), speed. Takes the
 * snow under the auger (forward only); returns the volume blown (m³)
 */
export function stepBlower(g, p, f, speed, B = BLOWER) {
  if (speed < 0.2) return 0;
  const k = augerTake(speed, B), area = g.cell * g.cell;
  let vol = 0;
  forCellsInBox(g, p.s + f.u * B.ahead, p.d + B.half + f.v * B.ahead, f.u, f.v, B.halfL, B.workHalf, (idx, i, j) => {
    if (g.h[idx] <= 0) return;
    const take = g.h[idx] * k;
    g.h[idx] -= take;
    vol += take * area;
    touch(g, i, j);
  });
  return vol;
}

export const blowerCleared = (g, B = BLOWER) => gridFraction(g, (h) => h <= B.clearAt);

/** Does the blower's box (centre s, d; facing angle a off the road's direction) overlap the parked car c? */
export function blowerHitsCar(p, a, c, B = BLOWER) {
  // (separating axes of two boxes in the (s, d) plane: the blower's turned by a, the car's along the road)
  const ca = Math.cos(a), sa = Math.sin(a);
  const ds = c.s - p.s, dd = c.d - p.d;
  const axes = [[1, 0], [0, 1], [ca, sa], [-sa, ca]];
  for (const [ax, ay] of axes) {
    const dist = Math.abs(ds * ax + dd * ay);
    const rCar = CAR_HALF.l * Math.abs(ax) + CAR_HALF.w * Math.abs(ay);
    const rBl = B.body.halfL * Math.abs(ca * ax + sa * ay) + B.body.halfW * Math.abs(-sa * ax + ca * ay);
    if (dist > rCar + rBl) return false;
  }
  return true;
}

/** Where the chute's snow lands (s, d) for the blower at p facing a off the road, the chute on `side` (+1 left) */
export function chuteLanding(p, a, side, B = BLOWER) {
  const ca = Math.cos(a), sa = Math.sin(a);
  return { s: p.s + ca * B.throwAhead - sa * side * B.throwSide, d: p.d + sa * B.throwAhead + ca * side * B.throwSide };
}

const BLOWER_ID = 'snow-blower';
export const SNOW_BLOWER_MISSION = {
  id: BLOWER_ID,
  title: 'Snow blower on the Bündastrasse',
  intro: 'Forty centimetres overnight: the Werkhof sends you out with the rotary snow blower. Clear the Bündastrasse in Davos Dorf, 300 m from the Dischmastrasse, kerb to kerb: up one side, turn, back down the other. The auger is 2.8 m wide and chokes when you drive faster than 13 km/h. Mind the parked cars: hitting one costs 10 s, and the chute (V turns it to the other side) must not bury them.',
  mode: 'car',
  season: 'winter',
  time: 'midday',
  features: ['workVehicle', 'snowBlower'],
  props: [],
  vehicle: 'blower',
  colour: '#f28c28',
  icon: 'snowblower',
  // (two passes of 300 m at ~3.5 m/s and a turn: ~3:20 by bot; a human swerving round the cars a little more)
  bonusMs: 225000,
  medals: { gold: 225000, silver: 300000, bronze: 420000 },
  timeLimitMs: 900000,
  finish: 'The Bündastrasse is black again, the snow lies in the gardens and not on the cars. The first post bus can come.',
  get start() { const p = routePoint(createBlowerRoute(), 6, -1.2); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: p.heading }; },
  createState() { return { cleared: 0, hits: 0, buried: 0, penaltyMs: 0, choke: false, chute: -1, s: 0 }; },
  objectives: [0.5, BLOWER.goal].map((goal, k) => ({
    id: k ? 'all' : 'half',
    title: k ? 'Clear the whole road' : 'Clear the first half',
    check(ctx, state) {
      if (ctx.t > SNOW_BLOWER_MISSION.timeLimitMs) return { done: false, fail: 'The morning traffic is stuck in the snow: too slow.', text: '', progress: state.cleared, target: null, hint: null };
      const pen = state.hits || state.buried > 0.5 ? ` · ${state.hits} hit${state.hits === 1 ? '' : 's'}${state.buried > 0.5 ? `, cars buried ${Math.round(state.buried)} s` : ''}` : '';
      const hint = ctx.mode !== 'car' ? 'Back into the blower' : state.burying ? 'You are burying a parked car: V turns the chute!' : state.choke ? 'Too fast: the auger chokes and leaves snow' : null;
      return { done: state.cleared >= goal, progress: state.cleared / BLOWER.goal, text: `Road cleared ${pct(state.cleared)} of ${pct(BLOWER.goal)}${pen}`, target: null, hint };
    }
  })),
  summary(state) { return [`${state.hits} parked car${state.hits === 1 ? '' : 's'} hit (+${(state.hits * BLOWER.hitMs) / 1000} s) · cars buried for ${Math.round(state.buried)} s (+${Math.round(state.buried * BLOWER.buryRate)} s)`]; }
};

// =====================================================================================================================
// 3. Rasenmähen: a lawn in the Kurpark (Davos Platz), between the trees of the park's west wood and the spruces by
// the Carl-Dorno-Weg (OSM park "Kurpark"; the open lawn x -74..-52, z -459..-445)
export const MOWER = {
  x0: -74, z0: -459, size: { u: 22, v: 14 },
  cell: 0.5,
  deckHalfW: 0.65, deckAhead: 0.15, deckHalfL: 0.42, // the cutting deck: 1.3 m wide, under the middle of the mower
  bodyHalfW: 0.55, bodyHalfL: 0.95, // the wheels' footprint (the beds)
  beds: [{ x: -67.5, z: -453.5, r: 1.6 }, { x: -57.5, z: -449.5, r: 1.3 }],
  bedMs: 2000, // a trodden patch of a bed
  goal: 0.93
};
MOWER.frame = makeFrame(MOWER.x0, MOWER.z0, 1, 0, 0);
// (makeFrame's v = u turned clockwise: for u = +x that is (0, 1)... (-uz, ux) = (0, 1): +z, south)

export function createLawnGrid(M = MOWER) {
  const cols = Math.round(M.size.u / M.cell), rows = Math.round(M.size.v / M.cell);
  const g = createGrid(cols, rows, M.cell);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i;
    const w = M.frame.toWorld((i + 0.5) * M.cell, (j + 0.5) * M.cell);
    g.h[k] = 1;
    const d = Math.min(...M.beds.map((b) => Math.hypot(w.x - b.x, w.z - b.z) - b.r));
    // (the bed itself; a ring of 0.5 m round it the deck cannot reach without the wheels on the bed: not counted)
    g.mask[k] = d <= 0.15 ? MASK_BLOCKED : d <= 0.65 ? MASK_MARGIN : MASK_TARGET;
  }
  return g;
}

/**
 * One step of the mower: p = { u, v } its centre in the grid, f = { u, v } its facing, speed. Cuts the grass under the
 * deck (the stripe by the pass's direction); returns the bed cells newly trodden
 */
export function stepMower(g, p, f, speed, M = MOWER) {
  if (Math.abs(speed) < 0.1) return 0;
  // (the stripe: the pass's direction along the lawn's long axis, or across it when the pass runs that way)
  const stripe = Math.abs(f.u) >= Math.abs(f.v) ? (f.u >= 0 ? 1 : 2) : (f.v >= 0 ? 3 : 4);
  // (a cell whose middle is within a hand's breadth of the deck's edge counts: the blades' wind lays the edge down)
  forCellsInBox(g, p.u + f.u * M.deckAhead, p.v + f.v * M.deckAhead, f.u, f.v, M.deckHalfL, M.deckHalfW + 0.12, (k, i, j) => {
    if (g.mask[k] === MASK_BLOCKED) return;
    if (g.h[k] > 0 || g.dir[k] !== stripe) { g.h[k] = 0; g.dir[k] = stripe; touch(g, i, j); }
  });
  let trodden = 0;
  forCellsInBox(g, p.u, p.v, f.u, f.v, M.bodyHalfL, M.bodyHalfW, (k, i, j) => {
    if (g.mask[k] === MASK_BLOCKED && g.h[k] > 0) { g.h[k] = 0; trodden++; touch(g, i, j); }
  });
  return trodden;
}

export const lawnMown = (g) => gridFraction(g, (h) => h <= 0);

/** A bot's passes over the lawn (the calibration): rows along u, `spacing` m apart */
export function mowerBotPath(M = MOWER, spacing = 1.1) {
  const pts = [];
  const rows = Math.ceil(M.size.v / spacing);
  for (let r = 0; r < rows; r++) {
    const v = Math.min(M.size.v - M.deckHalfW + 0.05, M.deckHalfW - 0.05 + r * spacing);
    pts.push(r % 2 ? [M.size.u + 0.6, v, -0.6, v] : [-0.6, v, M.size.u + 0.6, v]);
  }
  return pts;
}

const LAWN_ID = 'lawn-mowing';
export const LAWN_MISSION = {
  id: LAWN_ID,
  title: 'Mowing the Kurpark lawn',
  intro: 'The Kurpark in Davos Platz has a concert on Sunday: the lawn by the Carl-Dorno-Weg needs cutting. Drive the ride-on mower over it in lanes (the cut grass shows its stripes) until 93 % are short. The two flower beds of the Stadtgärtnerei stay as they are: every trodden patch costs 2 s.',
  mode: 'car',
  season: 'summer',
  time: 'midday',
  features: ['workVehicle', 'mower'],
  props: [],
  vehicle: 'mower',
  colour: '#4caf50',
  icon: 'mower',
  // (lanes 1.1 m apart at the mower's 2.6 m/s and a turn at each end: ~3:15 by an ideal bot; the scripted run in the
  // game, clumsy at the turns, 4:25 plus the beds it drove through)
  bonusMs: 240000,
  medals: { gold: 240000, silver: 330000, bronze: 450000 },
  timeLimitMs: 900000,
  finish: 'The lawn lies in neat stripes, the beds are whole. The band can come.',
  start: { x: -76.5, z: -452, heading: Math.PI / 2 },
  createState() { return { mown: 0, trodden: 0, penaltyMs: 0 }; },
  objectives: [0.5, MOWER.goal].map((goal, k) => ({
    id: k ? 'all' : 'half',
    title: k ? 'Mow the whole lawn' : 'Mow half of the lawn',
    check(ctx, state) {
      if (ctx.t > LAWN_MISSION.timeLimitMs) return { done: false, fail: 'The concert starts and the grass is still high.', text: '', progress: state.mown, target: null, hint: null };
      const beds = state.trodden ? ` · beds trodden ${state.trodden} (+${(state.trodden * MOWER.bedMs) / 1000} s)` : '';
      const c = MOWER.frame.toWorld(MOWER.size.u / 2, MOWER.size.v / 2);
      const far = Math.hypot(ctx.x - c.x, ctx.z - c.z) > 22;
      return {
        done: state.mown >= goal, progress: state.mown / MOWER.goal, text: `Lawn mown ${pct(state.mown)} of ${pct(MOWER.goal)}${beds}`,
        target: far ? { x: c.x, z: c.z, r: 4 } : null,
        hint: ctx.mode !== 'car' ? 'Back onto the mower' : state.onBed ? 'Off the flower bed!' : null
      };
    }
  })),
  summary(state) { return [`${state.trodden} bed patch${state.trodden === 1 ? '' : 'es'} trodden (+${(state.trodden * MOWER.bedMs) / 1000} s)`]; }
};

// =====================================================================================================================
// 4. Kehrichtentsorgung: from the KMA (Kehrichtmehrzweckanlage Davos, Clavadelerstrasse 4, OSM w127946886) through the
// Hof quarter: up the Hofstrasse, the Maienstrasse, down the Obere Hofstrasse and the Hofstrasse back
export const GARBAGE_LOOP = [-1188.9, 1605.8, -1163.5, 1589.6, -1161.5, 1588.1, -1145, 1574.2, -1143.2, 1572.5, -1128.3, 1555.8, -1126.6, 1553.6, -1112.5, 1531.8, -1097.2, 1502.7, -1059.8, 1431.7, -1049.7, 1406.8, -1031.3, 1361.3, -1013.6, 1312.9, -996.5, 1255.1, -937.4, 1276.7, -994.2, 1419, -1049.7, 1406.8];
export const GARBAGE = {
  kma: { x: -1213, z: 1612, r: 9 }, // the forecourt by the KMA's east front (the Brüchweg)
  stopRadius: 5.5, // m from the truck's tail to the point
  stopSpeed: 0.8, // m/s: standing
  loadS: 3.2, // s the crew needs at a point
  unloadS: 4,
  missMs: 45000,
  rear: 3.6 // m from the truck's centre to its tail
};
// (the points: arc length along GARBAGE_LOOP and the side, 4.3 m off the line: on the verge, clear of the houses)
const STOP_PLACES = [[45, -1, 'bags'], [100, -1, 'container'], [215, -1, 'bags'], [290, -1, 'container'], [345, -1, 'bags'], [440, 1, 'container'], [500, -1, 'bags'], [545, -1, 'container'], [600, -1, 'bags'], [650, -1, 'container']];
export function garbageStops(loop = makeRoute(GARBAGE_LOOP)) {
  return STOP_PLACES.map(([s, side, kind], i) => {
    const p = routePoint(loop, s, side * 4.3);
    return { i, x: +p.x.toFixed(1), z: +p.z.toFixed(1), heading: p.heading, kind, n: kind === 'bags' ? 3 + (i % 3) : 1 };
  });
}

/** One step of the round: the truck { x, z, heading, speed }; the state's stops loaded where the truck stands still */
export function stepGarbage(state, truck, dt, G = GARBAGE) {
  const tx = truck.x - Math.sin(truck.heading) * G.rear, tz = truck.z - Math.cos(truck.heading) * G.rear;
  const still = Math.abs(truck.speed) < G.stopSpeed;
  state.loading = null;
  for (const st of state.stops) {
    if (st.done) continue;
    const near = Math.hypot(st.x - tx, st.z - tz) <= G.stopRadius;
    if (near && still) {
      st.t = (st.t || 0) + dt;
      state.loading = st;
      if (st.t >= G.loadS) { st.done = true; state.collected++; return 'loaded'; }
    } else if (near) state.nearMoving = true;
  }
  return null;
}

const GARBAGE_ID = 'garbage-run';
export const GARBAGE_MISSION = {
  id: GARBAGE_ID,
  title: 'Refuse round in Davos Platz',
  intro: 'Tuesday is refuse day in the Hof quarter. Take the refuse truck from the KMA on the Clavadelerstrasse up the Hofstrasse, round by the Maienstrasse and the Obere Hofstrasse and back: stop with the tail at each of the ten collection points (the crew loads the bags and empties the containers while you stand), then unload at the KMA. Every point left out costs 45 s.',
  mode: 'car',
  season: null,
  time: 'midday',
  features: ['workVehicle', 'garbageRound'],
  props: [],
  vehicle: 'garbage',
  colour: '#7c8b3a',
  icon: 'garbage',
  // (the loop is 680 m and as much back down: ~1.1 km at ~7 m/s with ten stops of 3.2 s: ~3:30 by a careful bot)
  bonusMs: 240000,
  medals: { gold: 240000, silver: 330000, bronze: 480000 },
  finish: 'The press has swallowed the quarter\'s rubbish, the truck tips its load in the KMA. The Hof quarter is tidy for another week.',
  start: { x: -1203.5, z: 1611.5, heading: Math.atan2(-1188.9 + 1203.5, 1605.8 - 1611.5) },
  createState() {
    return { stops: garbageStops().map((s) => ({ ...s, done: false, t: 0 })), collected: 0, missed: 0, penaltyMs: 0, loading: null, unloadT: 0, atKma: false };
  },
  update(ctx, state) {
    state.atKma = Math.hypot(ctx.x - GARBAGE.kma.x, ctx.z - GARBAGE.kma.z) <= GARBAGE.kma.r;
  },
  objectives: [
    {
      id: 'collect',
      title: 'Empty the collection points',
      check(ctx, state) {
        const left = state.stops.filter((s) => !s.done);
        // back at the KMA with points left out: the round is over, each one missed costs its 45 s
        if (state.atKma && state.collected > 0 && left.length && Math.abs(ctx.speed) < 1) {
          state.missed = left.length;
          state.penaltyMs = state.missed * GARBAGE.missMs;
          return { done: true, progress: 1, text: `${left.length} point${left.length === 1 ? '' : 's'} left out (+${(left.length * GARBAGE.missMs) / 1000} s)`, target: null, hint: null };
        }
        let next = null, bd = Infinity;
        for (const s of left) { const d = Math.hypot(s.x - ctx.x, s.z - ctx.z); if (d < bd) { bd = d; next = s; } }
        const loading = state.loading;
        const text = `Collected ${state.collected}/${state.stops.length}${next ? ` · next ${fmtDist(bd)}` : ''}`;
        const hint = ctx.mode !== 'car' ? 'Back into the truck' : loading ? `Loading … ${Math.round((loading.t / GARBAGE.loadS) * 100)} %` : next && bd < 14 ? 'Stop with the tail at the bins' : null;
        return { done: !left.length, progress: state.collected / state.stops.length, text, target: next ? { x: next.x, z: next.z, r: 2.5 } : null, hint };
      }
    },
    {
      id: 'unload',
      title: 'Unload at the KMA',
      check(ctx, state) {
        if (state.atKma && Math.abs(ctx.speed) < GARBAGE.stopSpeed) state.unloadT += ctx.dt;
        const d = Math.hypot(ctx.x - GARBAGE.kma.x, ctx.z - GARBAGE.kma.z);
        return {
          done: state.unloadT >= GARBAGE.unloadS, progress: state.unloadT / GARBAGE.unloadS,
          text: state.atKma ? `Unloading … ${Math.round((state.unloadT / GARBAGE.unloadS) * 100)} %` : `To the KMA · ${fmtDist(d)}`,
          target: { x: GARBAGE.kma.x, z: GARBAGE.kma.z, r: GARBAGE.kma.r, style: 'pad' }, hint: state.atKma ? 'Stand still while the press empties' : null
        };
      }
    }
  ],
  summary(state) { return [`${state.collected} of ${state.stops.length} collection points emptied${state.missed ? ` · ${state.missed} left out (+${(state.missed * GARBAGE.missMs) / 1000} s)` : ''}`]; }
};

// =====================================================================================================================
// 5. Alpenrosen: the open slope below the Strelaberg (Schatzalp-Strela), just above the forest's edge (swissTLM3D:
// forest from x > -1450 at z -1050 and below z -1000), 2040-2150 m
export const ROSES = {
  field: { x0: -1745, x1: -1575, z0: -1175, z1: -1078 },
  count: 170,
  bloomShare: 0.36,
  reach: 1.4, // m from the bush
  pickS: 0.8, // s held
  goal: 12,
  damageMs: 3000,
  zone: { x: -1690, z: -1148, r: 22 }, // the protected area (Naturschutz): the lushest flowering bushes inside it
  zoneMs: 10000,
  seed: 0x5a7e1a
};
export const ROSES_START = { x: -1590, z: -1068, heading: Math.atan2(-1640 + 1590, -1120 + 1068) };

/** The bushes: [{ i, x, z, size, bloom, inZone, picked }] (deterministic) */
export function createRoseBushes(R = ROSES) {
  const rnd = mulberry32(R.seed);
  const out = [];
  let tries = 0;
  while (out.length < R.count && tries++ < R.count * 20) {
    // (in clumps: a centre, then a few round it, as the rhododendron grows)
    const cx = R.field.x0 + rnd() * (R.field.x1 - R.field.x0), cz = R.field.z0 + rnd() * (R.field.z1 - R.field.z0);
    const n = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < n && out.length < R.count; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 4;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (x < R.field.x0 || x > R.field.x1 || z < R.field.z0 || z > R.field.z1) continue;
      if (out.some((b) => Math.hypot(b.x - x, b.z - z) < 2.3)) continue;
      const inZone = Math.hypot(x - R.zone.x, z - R.zone.z) <= R.zone.r;
      out.push({ i: out.length, x: +x.toFixed(2), z: +z.toFixed(2), size: 0.7 + rnd() * 0.6, bloom: rnd() < (inZone ? 0.75 : R.bloomShare), inZone, picked: false, damaged: false });
    }
  }
  return out;
}

/** The nearest bush not yet touched within reach of (x, z), or null */
export function nearestBush(bushes, x, z, reach = ROSES.reach) {
  let best = null, bd = reach;
  for (const b of bushes) {
    if (b.picked || b.damaged) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** Holding the key at a bush: { bush, t } in state.picking; returns 'picked' | 'damaged' | null */
export function stepPicking(state, bush, hold, dt, pickS) {
  if (!hold || !bush) { state.picking = null; return null; }
  if (state.picking?.item !== bush) state.picking = { item: bush, t: 0 };
  state.picking.t += dt;
  if (state.picking.t < pickS) return null;
  state.picking = null;
  return 'done';
}

const ROSES_ID = 'alpine-roses';
export const ALPINE_ROSES_MISSION = {
  id: ROSES_ID,
  title: 'Alpine roses below the Strelaberg',
  intro: 'July, and the Alpenrosen are out on the slopes below the Strelaberg, just above the forest. Pick a small bouquet of 12 flowering sprigs: walk up to a bush in flower and hold Space (or Pick). Leave the bushes without flowers alone (+3 s for a damaged one), and keep out of the fenced nature reserve, however red it is in there (+10 s each time you step in). Then back down to where you started.',
  mode: 'person',
  season: 'summer',
  time: 'golden',
  features: ['alpineRoses'],
  props: [],
  colour: '#e0457b',
  icon: 'flower',
  // (a scripted run in the game from bush to bush, the nearest flowering one outside the reserve each time: 1:24)
  bonusMs: 120000,
  medals: { gold: 120000, silver: 165000, bronze: 240000 },
  timeLimitMs: 600000,
  finish: 'A bouquet of Alpenrosen, deep pink against the grey of the Strela. It goes into a jar on the table of the Schatzalp hut.',
  start: ROSES_START,
  createState() { return { bushes: createRoseBushes(), picked: 0, damaged: 0, entries: 0, inZone: false, picking: null, penaltyMs: 0 }; },
  update(ctx, state) {
    const z = ROSES.zone;
    const inside = Math.hypot(ctx.x - z.x, ctx.z - z.z) <= z.r;
    if (inside && !state.inZone && ctx.t > 0) { state.entries++; state.penaltyMs += ROSES.zoneMs; }
    state.inZone = inside;
  },
  objectives: [
    {
      id: 'pick',
      title: 'Pick 12 flowering sprigs',
      check(ctx, state) {
        if (ctx.t > ALPINE_ROSES_MISSION.timeLimitMs) return { done: false, fail: 'The sun is down behind the Strela: too slow.', text: '', progress: state.picked / ROSES.goal, target: null, hint: null };
        const b = nearestBush(state.bushes, ctx.x, ctx.z, 3.5);
        const pen = state.entries || state.damaged ? ` · ${state.entries ? `reserve ${state.entries}× (+${(state.entries * ROSES.zoneMs) / 1000} s)` : ''}${state.entries && state.damaged ? ', ' : ''}${state.damaged ? `${state.damaged} damaged (+${(state.damaged * ROSES.damageMs) / 1000} s)` : ''}` : '';
        const hint = state.inZone ? 'Nature reserve: out of here!' : state.picking ? `Picking … ${Math.round((state.picking.t / ROSES.pickS) * 100)} %`
          : b && Math.hypot(b.x - ctx.x, b.z - ctx.z) <= ROSES.reach ? (b.bloom ? 'In flower: hold Space to pick' : 'No flowers on this one: leave it') : null;
        // (the way to the field from afar)
        const f = ROSES.field, cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
        const far = ctx.x < f.x0 - 10 || ctx.x > f.x1 + 10 || ctx.z < f.z0 - 10 || ctx.z > f.z1 + 10;
        return { done: state.picked >= ROSES.goal, progress: state.picked / ROSES.goal, text: `Bouquet ${state.picked}/${ROSES.goal}${pen}`, target: far ? { x: cx, z: cz, r: 6 } : null, hint };
      }
    },
    {
      id: 'back',
      title: 'Back down to the start',
      check(ctx, state) {
        const d = Math.hypot(ctx.x - ROSES_START.x, ctx.z - ROSES_START.z);
        return { done: d <= 4, progress: null, text: `Bouquet of ${state.picked} · ${fmtDist(d)} to go`, target: { x: ROSES_START.x, z: ROSES_START.z, r: 4 }, hint: state.inZone ? 'Nature reserve: out of here!' : null };
      }
    }
  ],
  summary(state) { return [`${state.picked} sprigs · ${state.damaged} bush${state.damaged === 1 ? '' : 'es'} damaged · into the reserve ${state.entries}×`]; }
};

// =====================================================================================================================
// 6. Pilzeln: the spruce forest at the mouth of the Dischmatal, between the Dischmastrasse and the Dischmabach
// (swissTLM3D forest, 1590-1640 m, gently rising to the south)
export const MUSHROOM_KINDS = {
  porcini: { name: 'Steinpilz (porcini)', points: 15, edible: true, desc: 'Fat brown cap, white to yellowish pores underneath, a stout pale stem with a fine white net' },
  bitter: { name: 'Gallenröhrling (bitter bolete)', points: -10, edible: false, desc: 'Brown cap, pinkish pores underneath, a stem with a coarse dark net' },
  chanterelle: { name: 'Eierschwamm (chanterelle)', points: 8, edible: true, desc: 'Egg-yellow funnel, blunt forking ridges running down the stem, firm, smells of apricot' },
  falseChanterelle: { name: 'Falscher Eierschwamm (false chanterelle)', points: -10, edible: false, desc: 'Orange funnel with thin, crowded true gills, soft, hardly any smell' },
  flyAgaric: { name: 'Fliegenpilz (fly agaric)', points: -25, edible: false, desc: 'Bright red cap with white flakes, white gills, a ring on the stem' }
};
export const MUSHROOMS = {
  field: { x0: 1560, x1: 1720, z0: -55, z1: 100 },
  counts: { porcini: 13, bitter: 10, chanterelle: 16, falseChanterelle: 10, flyAgaric: 10 },
  basket: 10,
  reach: 1.7, pickS: 0.6,
  timeMs: 300000,
  describeAt: 2.6, // m: the HUD describes the mushroom in front
  control: { x: 1592, z: -78 }, // the mushroom control at the forest's edge (by the Dischmastrasse)
  seed: 0x9117
};
export const MUSHROOM_START = { x: 1590, z: -84, heading: 0.15 };

/**
 * The mushrooms: [{ i, kind, x, z, size, yaw, picked }] in the forest of the field (inForest(x, z): the caller's test,
 * the tests pass a stub; null: anywhere in the field)
 */
export function createMushrooms(inForest = null, M = MUSHROOMS) {
  const rnd = mulberry32(M.seed);
  const out = [];
  for (const [kind, n] of Object.entries(M.counts)) {
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 60) {
      const x = M.field.x0 + rnd() * (M.field.x1 - M.field.x0), z = M.field.z0 + rnd() * (M.field.z1 - M.field.z0);
      if (inForest && !inForest(x, z)) continue;
      if (out.some((m) => Math.hypot(m.x - x, m.z - z) < 2.2)) continue;
      out.push({ i: out.length, kind, x: +x.toFixed(2), z: +z.toFixed(2), size: 0.8 + rnd() * 0.5, yaw: rnd() * Math.PI * 2, picked: false });
      placed++;
    }
  }
  return out;
}

export function nearestMushroom(list, x, z, reach) {
  let best = null, bd = reach;
  for (const m of list) {
    if (m.picked) continue;
    const d = Math.hypot(m.x - x, m.z - z);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

/** The control's verdict on a basket: { score, edible, rejected, poisonous } */
export function mushroomControl(basket) {
  let score = 0, edible = 0, rejected = 0, poisonous = 0;
  for (const kind of basket) {
    const k = MUSHROOM_KINDS[kind];
    score += k.points;
    if (k.edible) edible++; else { rejected++; if (kind === 'flyAgaric') poisonous++; }
  }
  return { score, edible, rejected, poisonous };
}

const MUSHROOM_ID = 'mushroom-hunt';
export const MUSHROOM_MISSION = {
  id: MUSHROOM_ID,
  title: 'Mushroom hunt in the Dischma forest',
  intro: 'Late summer rain, and the forest at the mouth of the Dischmatal is full of mushrooms. Fill your basket with ten (or five minutes): porcini and chanterelles are wanted; their look-alikes, the bitter bolete and the false chanterelle, spoil the dish, and the fly agaric is poisonous. Look closely, the HUD describes the mushroom in front of you; hold Space (or Pick) to take it. Then bring the basket to the mushroom control at the forest\'s edge.',
  mode: 'person',
  season: 'summer',
  time: 'golden',
  features: ['mushrooms'],
  colour: '#a0522d',
  icon: 'mushroom',
  scoreMode: true,
  scoreUnit: 'pts',
  // (10 in the basket: all porcini 150; a good basket of porcini and chanterelles 110-130)
  medals: { gold: 120, silver: 85, bronze: 50 },
  finish: 'The control sorts your basket on its table. What is left goes into the pan with butter and parsley.',
  start: MUSHROOM_START,
  props: [{ id: 'inspector', type: 'helper', x: MUSHROOMS.control.x + 1.2, z: MUSHROOMS.control.z - 1.5, face: { x: MUSHROOM_START.x, z: MUSHROOM_START.z + 6 } }],
  createState() { return { items: null, basket: [], picking: null, result: null, penaltyMs: 0 }; },
  score(state) { return state.result ? state.result.score : mushroomControl(state.basket).score; },
  objectives: [
    {
      id: 'collect',
      title: 'Fill the basket',
      check(ctx, state) {
        const n = state.basket.length;
        const timeUp = ctx.t >= MUSHROOMS.timeMs;
        const left = Math.max(0, MUSHROOMS.timeMs - ctx.t);
        const m = state.items ? nearestMushroom(state.items, ctx.x, ctx.z, MUSHROOMS.describeAt) : null;
        const hint = state.picking ? `Picking … ${Math.round((state.picking.t / MUSHROOMS.pickS) * 100)} %` : m ? `${MUSHROOM_KINDS[m.kind].desc}${Math.hypot(m.x - ctx.x, m.z - ctx.z) <= MUSHROOMS.reach ? ' · Space: into the basket' : ''}` : null;
        const f = MUSHROOMS.field;
        const far = ctx.x < f.x0 - 15 || ctx.x > f.x1 + 15 || ctx.z < f.z0 - 15 || ctx.z > f.z1 + 15;
        return {
          done: n >= MUSHROOMS.basket || timeUp, progress: n / MUSHROOMS.basket,
          text: `Basket ${n}/${MUSHROOMS.basket} · ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')} left`,
          target: far ? { x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2, r: 8 } : null, hint
        };
      }
    },
    {
      id: 'control',
      title: 'To the mushroom control',
      check(ctx, state) {
        const c = MUSHROOMS.control;
        const d = Math.hypot(ctx.x - c.x, ctx.z - c.z);
        const done = d <= 3.5;
        if (done && !state.result) state.result = mushroomControl(state.basket);
        return { done, progress: null, text: `Basket of ${state.basket.length} · control ${fmtDist(d)}`, target: { x: c.x, z: c.z, r: 3.5 }, hint: null };
      }
    }
  ],
  summary(state) {
    const r = state.result || mushroomControl(state.basket);
    const count = {};
    for (const k of state.basket) count[k] = (count[k] || 0) + 1;
    const lines = Object.entries(count).map(([k, n]) => `${n}× ${MUSHROOM_KINDS[k].name} ${MUSHROOM_KINDS[k].points > 0 ? '+' : ''}${MUSHROOM_KINDS[k].points * n}`);
    return [lines.join(' · ') || 'An empty basket', `${r.edible} edible · ${r.rejected} thrown out${r.poisonous ? ` (${r.poisonous} poisonous!)` : ''}`];
  }
};

export const WORK_MISSIONS = [SNOW_SHOVEL_MISSION, SNOW_BLOWER_MISSION, LAWN_MISSION, GARBAGE_MISSION, ALPINE_ROSES_MISSION, MUSHROOM_MISSION];
