// js/missions-data-snowfarm.js
// Snowfarming: the old snow spread on the Loipe with a lorry, then groomed with the snowcat (pure definitions;
// js/missions-snowfarm.js is the runtime). Like the other packages: no three.js and no DOM in here, so that
// tests/missions-snowfarm.test.mjs plays the mission with bots on plain arrays.
//
//   snowfarm-loipe  Autumn (the summer look: the meadows green, no snow anywhere but in the depot). Davos Nordic keeps
//                   last winter's snow over the summer in a depot under a thick layer of wood chips and white fleece
//                   (snowfarming) and lays it out at the end of October as the first Loipe of the season. The depot here
//                   stands in the meadow of the Färich at the mouth of the Flüela valley, between the two Loipen that the
//                   city data has there (OSM w1353008601 "City-Trail Davos" along the Bedraweg side and w1254088836 along
//                   the forest's edge), which with the track down from Oberhöfji make a round of ~755 m: the
//                   Snowfarming-Runde. (An assumption: the real depot and loop of Davos Nordic lie in the Flüela valley
//                   too, by the Langlaufzentrum; their exact place is not in the data.)
//                   1. The lorry: a three-axle tipper. At the depot a wheel loader fills its bed while it stands on the
//                      loading spot; then the snow is spread along the Loipe: Space/E held raises the bed and the snow
//                      runs out over the open tailgate as a windrow behind the truck. The layer it leaves depends on the
//                      speed: too fast and it is too thin (a gap), too slow and the snow piles up and runs short. A load
//                      lasts ~420 m at the right pace, so it takes two (or more) loads.
//                   2. The snowcat, parked beside the depot: its tiller (F) spreads the windrow over its 4.3 m and
//                      grooms it; where there is no snow it grooms nothing.
//                   Judged by points (the snow lying on the Loipe, the groomed share, the time): a time alone would reward
//                   a hurried run that leaves gaps at the edges, and the cover is the work's whole point.
//
// The Loipe is one map along its loop (js/missions-data-work.js createGrid: s along it in 0.5 m columns, d across it in
// 0.5 m rows, ±3 m): the snow's depth a cell (h, m) and whether it is groomed (`groomed`, the pass's direction in `dir`).
// A column counts as covered when the snow across it would make a layer of 20 cm over the Loipe's 3.5 m once spread.
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z, south).
import { MASK_MARGIN, MASK_TARGET, createGrid, makeRoute, routePoint, projectRoute, touch } from './missions-data-work.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pct = (f) => `${Math.floor(f * 100)} %`;
const wrapPi = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; else if (a < -Math.PI) a += Math.PI * 2; return a; };

// The loop (closed: the last point is the first), from the junction of the two Loipen west of the depot: east along the
// City-Trail (w1353008601) and w959828050 / w1191840997 to the track down from Oberhöfji, down it to the Loipe along the
// forest (w1254088836) and west along that back to the junction
export const SNOWFARM_LOOP = [
  1536, -1640, 1625, -1659, 1680, -1660, 1716, -1666, 1729, -1710, 1741, -1725, 1766, -1732, 1788, -1726, 1822, -1717,
  1838, -1713, 1852, -1698, 1850, -1678, 1835, -1640, 1822, -1612, 1700, -1633, 1662, -1623, 1613, -1614, 1575, -1631,
  1556, -1637, 1536, -1640
];

export const SNOWFARM = {
  cell: 0.5,
  half: 3, // m: the map either side of the Loipe's line
  trailHalf: 1.75, // m: the Loipe counted (3.5 m: classic and a skating lane, early season)
  countHalf: 2.25, // m: the snow a column counts (what the tiller reaches with the snowcat on the line)
  coverDepth: 0.2, // m: the layer over the Loipe from which a column is covered
  // the depot: the heap under its wood chips and fleece, long along x, between the two Loipen
  depot: { x: 1712, z: -1648, halfL: 16, halfW: 6.5, height: 4.6 },
  // the loading spot: where the middle of the bed stands while the loader fills it, beside the heap's open west face
  pad: { x: 1680, z: -1648, r: 4 },
  loader: { x: 1692.5, z: -1648, heading: Math.PI / 2 }, // the wheel loader at the face, its bucket in the snow
  snowcat: { x: 1655, z: -1645, heading: Math.PI / 2 }, // parked on the meadow west of the depot, facing it
  start: { x: 1680, z: -1675, heading: 0 }, // the lorry north of the City-Trail, facing the depot
  pin: { x: 1680, z: -1678 },
  // the tipper: its bed's middle `bedBack` m behind the truck's centre; the windrow drops `dropBack` m behind the centre,
  // as wide as the bed
  truck: { halfW: 1.25, halfL: 4.35, bedBack: 1.2, dropBack: 4.9, dropHalfL: 0.5, dropHalfW: 1.15, speed: 9.5 },
  flow: 6.1, // m³ a second out of the raised bed (the right pace, 5 m/s, lays 35 cm over the Loipe once spread)
  capacity: 512, // m³ in a full bed (the old snow, not to scale: a real load is ~15 m³; ~420 m of Loipe at the right pace)
  loadS: 16, // s for the loader to fill the bed
  raiseS: 1.1, // s to raise the bed; the snow runs from `runFrom` of it
  runFrom: 0.55,
  minSpreadSpeed: 0.8, // m/s: slower, the snow piles up behind the truck
  heapR: 1.6, // m: such a pile's radius
  spreadGoal: 0.9, // of the Loipe's columns covered before the snowcat
  // the snowcat's tiller (js/groom-map.js: 4.3 m wide, 3.3 m behind the centre); it evens the snow under it
  tiller: { back: 3.3, half: 2.15, halfL: 0.45, minSpeed: 0.3, maxLift: 0.03 },
  groomDepth: 0.16, // m: a groomed cell with less is grass with a dusting, not Loipe (the cover's 20 cm spread over the tiller's 4.3 m)
  groomGoal: 0.85, // of the Loipe's cells
  limitMs: 30 * 60 * 1000,
  // (the bots of tests/missions-snowfarm.test.mjs: two loads at 5-6 m/s, the snowcat on the line at 5 m/s: ~7:00; the time
  // weighs most, so that a crawl with a third load is no gold)
  points: { cover: 350, groom: 250, time: 400, coverFrom: 0.85, groomFrom: 0.8, fastS: 400, slowS: 1000 }
};

export const createSnowfarmRoute = () => makeRoute(SNOWFARM_LOOP);

/** The Loipe's map: createGrid's along the loop (u = s, v = d + half); the Loipe's own cells MASK_TARGET; nothing on it */
export function createSnowfarmGrid(route = createSnowfarmRoute(), S = SNOWFARM) {
  const cols = Math.round(route.length / S.cell), rows = Math.round((2 * S.half) / S.cell);
  const g = createGrid(cols, rows, S.cell);
  g.cell = route.length / cols; // (the columns fill the loop exactly: the last meets the first)
  g.cellD = S.cell;
  g.groomed = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const d = (j + 0.5) * S.cell - S.half;
    g.mask[j * cols + i] = Math.abs(d) <= S.trailHalf ? MASK_TARGET : MASK_MARGIN;
  }
  return g;
}

/** Copies a fresh map into the run's (a restart) */
export function resetSnowfarmGrid(g, fresh) {
  g.h.set(fresh.h); g.mask.set(fresh.mask); g.dir.set(fresh.dir); g.groomed.set(fresh.groomed);
  g.dirty = { i0: 0, i1: g.cols - 1, j0: 0, j1: g.rows - 1 };
  g.version++;
}

/**
 * Calls fn(index, i, j, du, dv (the cell's offset from the box's centre)) for the cells whose centres lie in the box centred at (s, d) on the loop, ±halfL along the unit
 * direction (fu, fv) in (s, d), ±halfW across it; the columns wrap round the loop's seam
 */
export function forLoopCells(g, s, d, fu, fv, halfL, halfW, fn, S = SNOWFARM) {
  const cu = s, cv = d + S.half, cs = g.cell, cd = g.cellD;
  const ext = Math.abs(fu) * halfL + Math.abs(fv) * halfW, exv = Math.abs(fv) * halfL + Math.abs(fu) * halfW;
  const i0 = Math.floor((cu - ext) / cs), i1 = Math.floor((cu + ext) / cs);
  const j0 = Math.max(0, Math.floor((cv - exv) / cd)), j1 = Math.min(g.rows - 1, Math.floor((cv + exv) / cd));
  for (let j = j0; j <= j1; j++) {
    for (let iu = i0; iu <= i1; iu++) {
      const du = (iu + 0.5) * cs - cu, dv = (j + 0.5) * cd - cv;
      if (Math.abs(du * fu + dv * fv) > halfL || Math.abs(-du * fv + dv * fu) > halfW) continue;
      const i = ((iu % g.cols) + g.cols) % g.cols;
      fn(j * g.cols + i, i, j, du, dv);
    }
  }
}

/** Where a vehicle at (x, z) facing `heading` is on the loop: { s, d, a (its heading off the loop's), fu, fv } */
export function loopPose(route, x, z, heading, out = {}) {
  const p = projectRoute(route, x, z, out);
  out.a = wrapPi(heading - Math.atan2(p.tx, p.tz));
  out.fu = Math.cos(out.a); out.fv = Math.sin(out.a);
  return out;
}

// --- The lorry ------------------------------------------------------------------------------------------------------------
export const createFarmState = () => ({
  load: 0, raise: 0, loads: 0, onPad: false, loading: false, spreading: false, piling: false, layer: 0,
  out: 0, onLoipe: 0, wasted: 0, covered: 0, groomed: 0, t: 0, catDist: 0, gap: null, ungroomed: null, tillerDown: false
});

/** The bed's middle for the truck at (x, z) facing heading */
export const bedCentre = (x, z, heading, S = SNOWFARM) => ({ x: x - Math.sin(heading) * S.truck.bedBack, z: z - Math.cos(heading) * S.truck.bedBack });

/** On the loading spot (the bed by the heap's face), standing */
export function onPad(x, z, heading, speed, S = SNOWFARM) {
  const b = bedCentre(x, z, heading, S);
  return Math.hypot(b.x - S.pad.x, b.z - S.pad.z) <= S.pad.r && Math.abs(speed) < 0.4;
}

/** The loader fills a standing truck on the spot; returns the m³ loaded this step */
export function stepLoading(st, ok, dt, S = SNOWFARM) {
  st.onPad = ok;
  st.loading = ok && st.load < S.capacity && st.raise <= 0.01;
  if (!st.loading) return 0;
  const add = Math.min(S.capacity - st.load, (S.capacity / S.loadS) * dt);
  st.load += add;
  if (st.load >= S.capacity - 1e-6) { st.load = S.capacity; st.loads++; st.loading = false; }
  return add;
}

/** The layer (m, over the Loipe's width, once spread) the snow running out lays at `speed` */
export const layerAt = (speed, S = SNOWFARM) => S.flow / (2 * S.trailHalf * Math.max(Math.abs(speed), 0.01));

/**
 * One step of the bed: held, it rises and the snow runs out over the tailgate behind the truck at `pose` (loopPose) going
 * `speed`; let go, it comes down. The snow lands as a windrow (moving) or a pile (standing) on the map; what falls beside
 * the map is wasted. Returns the m³ that ran out.
 */
export function stepSpread(g, st, pose, speed, hold, dt, S = SNOWFARM) {
  st.raise = hold && st.load > 0 ? Math.min(1, st.raise + dt / S.raiseS) : Math.max(0, st.raise - dt / S.raiseS);
  st.spreading = false; st.piling = false; st.layer = 0;
  if (st.raise < S.runFrom || st.load <= 0) return 0;
  const out = Math.min(st.load, S.flow * dt);
  st.load -= out; st.out += out;
  st.spreading = true;
  const T = S.truck;
  // (the tail in the loop's frame: behind along the vehicle's own direction)
  const ds = pose.s - pose.fu * T.dropBack, dd = pose.d - pose.fv * T.dropBack;
  const moving = Math.abs(speed) >= S.minSpreadSpeed;
  st.layer = moving ? layerAt(speed, S) : Infinity;
  st.piling = !moving;
  const cells = [];
  let wsum = 0;
  if (moving) forLoopCells(g, ds, dd, pose.fu, pose.fv, T.dropHalfL, T.dropHalfW, (k, i, j) => { cells.push(k, i, j, 1); wsum += 1; }, S);
  else forLoopCells(g, ds, dd, 1, 0, S.heapR, S.heapR, (k, i, j, du, dv) => {
    const w = 1 - Math.hypot(du, dv) / S.heapR; // (a cone)
    if (w > 0) { cells.push(k, i, j, w); wsum += w; }
  }, S);
  // (the share of the drop's width that is on the map at all: beside it, the snow is lost in the grass)
  const w = moving ? T.dropHalfW : S.heapR;
  const onMap = wsum > 0 ? clamp((Math.min(S.half, dd + w) - Math.max(-S.half, dd - w)) / (2 * w), 0, 1) : 0;
  const cellA = g.cell * g.cellD;
  let beside = out * (1 - onMap);
  if (wsum > 0) {
    for (let n = 0; n < cells.length; n += 4) {
      const k = cells[n], j = cells[n + 2], add = (out * onMap * cells[n + 3]) / wsum / cellA;
      g.h[k] += add;
      if (Math.abs((j + 0.5) * g.cellD - S.half) > S.countHalf) beside += add * cellA; // (in the grass beside the Loipe)
      if (g.groomed[k]) g.groomed[k] = 0; // (fresh snow on groomed Loipe: to be groomed again)
      touch(g, cells[n + 1], j);
    }
  }
  st.onLoipe += out - beside;
  st.wasted += beside;
  return out;
}

/** The snow across column i, as the layer it makes over the Loipe's width once spread (m) */
export function columnLayer(g, i, S = SNOWFARM) {
  let v = 0;
  for (let j = 0; j < g.rows; j++) {
    const d = (j + 0.5) * g.cellD - S.half;
    if (Math.abs(d) <= S.countHalf) v += g.h[j * g.cols + i];
  }
  return (v * g.cellD) / (2 * S.trailHalf);
}

/** The share of the loop's columns with snow enough */
export function coveredShare(g, S = SNOWFARM) {
  let n = 0;
  for (let i = 0; i < g.cols; i++) if (columnLayer(g, i, S) >= S.coverDepth) n++;
  return n / g.cols;
}

/** The share of the Loipe's cells groomed with snow under them */
export function groomedShare(g, S = SNOWFARM) {
  let n = 0, ok = 0;
  for (let k = 0; k < g.h.length; k++) if (g.mask[k] === MASK_TARGET) { n++; if (g.groomed[k] && g.h[k] >= S.groomDepth) ok++; }
  return n ? ok / n : 0;
}

/** The middle of the nearest stretch (s) whose column test fails, looking from s0 both ways round the loop; or null */
export function nearestColumn(g, s0, test) {
  const n = g.cols, i0 = ((Math.floor(s0 / g.cell) % n) + n) % n;
  for (let r = 0; r < n / 2; r++) {
    for (const i of [(i0 + r) % n, (i0 - r + n) % n]) if (test(i)) return (i + 0.5) * g.cell;
  }
  return null;
}
export const nearestGap = (g, s0, S = SNOWFARM) => nearestColumn(g, s0, (i) => columnLayer(g, i, S) < S.coverDepth);
export function nearestUngroomed(g, s0, S = SNOWFARM) {
  return nearestColumn(g, s0, (i) => {
    let bad = 0;
    for (let j = 0; j < g.rows; j++) { const k = j * g.cols + i; if (g.mask[k] === MASK_TARGET && !(g.groomed[k] && g.h[k] >= S.groomDepth)) bad++; }
    return bad >= 2;
  });
}

// --- The snowcat ---------------------------------------------------------------------------------------------------------
/**
 * The tiller down, the snowcat at `pose` going forwards at `speed`: the snow under the tiller is evened out over its
 * width (its volume kept) and groomed, wherever there is enough of it. Returns the cells newly groomed.
 */
export function stepTiller(g, pose, speed, lift, S = SNOWFARM) {
  const T = S.tiller;
  if (speed < T.minSpeed || lift > T.maxLift) return 0;
  const cs = pose.s - pose.fu * T.back, cd = pose.d - pose.fv * T.back;
  const cells = [];
  let sum = 0;
  forLoopCells(g, cs, cd, pose.fu, pose.fv, T.halfL, T.half, (k, i, j) => { cells.push(k, i, j); sum += g.h[k]; }, S);
  if (!cells.length) return 0;
  const avg = sum / (cells.length / 3);
  const dir = Math.cos(pose.a) >= 0 ? 0 : 1;
  let n = 0;
  for (let c = 0; c < cells.length; c += 3) {
    const k = cells[c];
    g.h[k] = avg;
    const ok = avg >= S.groomDepth;
    if (ok && !g.groomed[k]) n++;
    g.groomed[k] = ok ? 1 : 0;
    g.dir[k] = dir;
    touch(g, cells[c + 1], cells[c + 2]);
  }
  return n;
}

// --- The score ------------------------------------------------------------------------------------------------------------
export const farmTimeBonus = (s, P = SNOWFARM.points) => P.time * clamp((P.slowS - s) / (P.slowS - P.fastS), 0, 1);
export function farmScore(st, S = SNOWFARM) {
  const P = S.points;
  const cover = P.cover * clamp((st.covered - P.coverFrom) / (1 - P.coverFrom), 0, 1);
  const groom = P.groom * clamp((st.groomed - P.groomFrom) / (1 - P.groomFrom), 0, 1);
  return Math.max(0, Math.round(cover + groom + farmTimeBonus(st.t / 1000, P)));
}

// =====================================================================================================================
const ROUTE = createSnowfarmRoute();
const layerText = (m) => `${Math.round(m * 100)} cm`;
const targetAt = (s, r = 5) => { const p = routePoint(ROUTE, s); return { x: p.x, z: p.z, r }; };
const tooLate = (ctx) => ctx.t > SNOWFARM.limitMs;
const LATE = 'The first cross-country skiers are waiting at the Loipe, and it is still green: too slow.';

export const SNOWFARM_MISSION = {
  id: 'snowfarm-loipe',
  title: 'The snowfarming Loipe',
  intro: 'End of October in the Färich: the meadows are still green, but under the wood chips and the white fleece of the depot lies last winter\'s snow, kept over the summer. Today it becomes the first Loipe of the season. Drive the tipper to the loading spot at the depot and let the wheel loader fill it. Then spread the snow along the marked round: hold Space to raise the bed, and the snow runs out behind the truck. Your pace sets the layer: too fast leaves gaps, too slow piles the snow up and the load runs short. When the round is white, walk over to the snowcat and groom it with the tiller lowered (F): it spreads the windrow over its whole width, and where there is no snow there is nothing to groom.',
  mode: 'car',
  season: 'summer', // (late autumn: the green of the meadows, no snow but the depot's)
  time: 'golden',
  features: ['workVehicle', 'snowfarm'],
  vehicle: 'snowfarmTipper',
  props: [],
  colour: '#c08a4a',
  icon: 'snowfarm',
  pin: SNOWFARM.pin,
  scoreMode: true,
  scoreUnit: 'pts',
  // (the bots: ~965 points for a clean run in ~7:00, ~920 with slower turns; crawling at 3-4 m/s with a third load ~830-870;
  // the snowcat a metre off the line ~750; the gold a clean run of ~8 min, the silver ~+40 %, the bronze ~double or gaps)
  medals: { gold: 900, silver: 760, bronze: 600 },
  finish: 'The round lies white and groomed in the green meadow of the Färich, the corduroy shining in the low sun. Tomorrow the first skiers of the season are on it.',
  start: { x: SNOWFARM.start.x, z: SNOWFARM.start.z, heading: SNOWFARM.start.heading },
  createState: createFarmState,
  update(ctx, state) { state.t = ctx.t; },
  score: (state) => farmScore(state),
  objectives: [
    {
      id: 'load',
      title: 'Load the snow at the depot',
      allowModes: ['car', 'person'],
      check(ctx, state) {
        if (tooLate(ctx)) return { done: false, fail: LATE, text: '', progress: null, target: null, hint: null };
        const P = SNOWFARM.pad;
        const hint = ctx.mode !== 'car' ? 'Back into the tipper' : state.loading ? 'The loader is filling the bed: stay put' : state.onPad ? null : 'Stop with the bed beside the heap';
        return { done: state.loads >= 1, progress: state.load / SNOWFARM.capacity, text: `Bed ${pct(state.load / SNOWFARM.capacity)} full`, target: state.onPad ? null : { x: P.x, z: P.z, r: P.r, style: 'pad' }, hint };
      }
    },
    {
      id: 'spread',
      title: 'Spread the snow along the Loipe',
      allowModes: ['car', 'person'],
      check(ctx, state) {
        if (tooLate(ctx)) return { done: false, fail: LATE, text: '', progress: null, target: null, hint: null };
        const empty = state.load <= 0.5;
        const P = SNOWFARM.pad;
        let hint = null;
        if (ctx.mode !== 'car') hint = 'Back into the tipper';
        else if (state.loading) hint = 'The loader is filling the bed: stay put';
        else if (empty) hint = 'The bed is empty: back to the depot for another load';
        else if (state.piling) hint = 'Standing still: the snow piles up behind you';
        else if (state.spreading && state.layer < SNOWFARM.coverDepth) hint = `Too fast: ${layerText(state.layer)}, that leaves a gap`;
        else if (state.spreading && state.layer > 0.6) hint = `Too slow: ${layerText(state.layer)}, the load will run short`;
        else if (!state.spreading) hint = 'Hold Space: spread';
        // (the next gap: not the one right under the truck, where the marker would stand in the way)
        const gap = state.gap != null ? targetAt(state.gap) : null;
        const target = empty ? (state.onPad ? null : { x: P.x, z: P.z, r: P.r, style: 'pad' }) : gap && Math.hypot(gap.x - ctx.x, gap.z - ctx.z) > 25 ? gap : null;
        const layer = state.spreading && Number.isFinite(state.layer) ? ` · layer ${layerText(state.layer)}` : '';
        return { done: state.covered >= SNOWFARM.spreadGoal, progress: state.covered / SNOWFARM.spreadGoal, text: `Loipe covered ${pct(state.covered)} of ${pct(SNOWFARM.spreadGoal)} · bed ${pct(state.load / SNOWFARM.capacity)}${layer}`, target, hint };
      }
    },
    {
      id: 'snowcat',
      title: 'Walk over to the snowcat',
      allowModes: ['car', 'person', 'snowcat'],
      check(ctx, state) {
        const C = SNOWFARM.snowcat;
        const hint = ctx.mode === 'car' ? 'F: get out of the tipper' : state.catDist < 6 ? 'F: get in' : null;
        return { done: ctx.mode === 'snowcat', progress: null, text: `${Math.round(state.catDist)} m to the snowcat`, target: { x: C.x, z: C.z, r: 4 }, hint };
      }
    },
    {
      id: 'groom',
      title: 'Groom the Loipe',
      allowModes: ['snowcat', 'person'],
      check(ctx, state) {
        if (tooLate(ctx)) return { done: false, fail: LATE, text: '', progress: null, target: null, hint: null };
        const hint = ctx.mode !== 'snowcat' ? 'Back into the snowcat' : ctx.tillerRaised || ctx.tillerLift > SNOWFARM.tiller.maxLift ? 'Lower the tiller [F]' : null;
        return { done: state.groomed >= SNOWFARM.groomGoal, progress: state.groomed / SNOWFARM.groomGoal, text: `Loipe groomed ${pct(state.groomed)} of ${pct(SNOWFARM.groomGoal)}`, target: (() => { const u = state.ungroomed != null ? targetAt(state.ungroomed) : null; return u && Math.hypot(u.x - ctx.x, u.z - ctx.z) > 25 ? u : null; })(), hint };
      }
    }
  ],
  summary(state) {
    const loads = `${state.loads} load${state.loads === 1 ? '' : 's'}`;
    return [`${loads} · Loipe covered ${pct(state.covered)} · groomed ${pct(state.groomed)}`, `${Math.round((100 * state.wasted) / Math.max(1, state.out))} % of the snow beside the Loipe`];
  }
};

export const SNOWFARM_MISSIONS = [SNOWFARM_MISSION];
