import { RINK, rinkLocal, rinkWorld, rinkHeadingWorld, clampToRink } from './missions-data-ice.js';
import { forCellsInBox } from './missions-data-work.js';

// js/missions-data-zamboni.js
// The ice resurfacer in the Eisstadion's second intermission (js/missions-data.js spreads ZAMBONI_MISSIONS into MISSIONS;
// js/missions-zamboni.js has the runtime: the hall, the crowd, the scoreboard, the machine and the ice's look). Like the
// other packages: no three.js and no DOM in here, so that tests/missions-zamboni.test.mjs drives the machine with a bot.
//
//   eisstadion-zamboni  An HCD home game, after two periods. The siren goes, the players leave for the dressing rooms,
//                       and the ice they leave behind is grey, cut and scattered with snow. In the Vaillant Arena the ice
//                       crew has seventeen minutes; here the intermission is tighter. The resurfacer drives out through
//                       its gate in the west end boards; the conditioner behind it shaves the ice, the auger carries the
//                       shavings up into the snow tank, and the towel lays a film of warm water, 2.3 m wide, that
//                       freezes as smooth as glass. The ice masters' pattern: two laps along the boards first, then ovals
//                       towards the middle, each pass overlapping the last by a hand's width. Water laid on water that
//                       has not frozen yet pools into puddles; a hard knock dents the boards (and the crew's pride). The
//                       machine has to be back through the gate before the clock runs out: the teams come back on.
//
// The rink is js/missions-data-ice.js RINK (60 × 30 m, corners 8.5 m, under the arena's ridge, as the penalty shoot-out
// has it). The machine lives in the rink's local frame: x along the rink from the centre spot (the gate at the −x end,
// WNW), y across (+y to the right of someone facing +x), its heading `a` 0 along +x and growing towards +y (a turn to
// the right). The map: cells of 0.5 m over the rink's box (u = x + halfL, v = y + halfW).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pct = (f) => `${Math.floor(f * 100 + 1e-9)} %`;
const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export const ZAMBONI = {
  cell: 0.5,
  edge: 0.35, // m along the boards that are not counted (the edger's strip, done by hand before the machine comes out)
  band: 4.4, // m from the boards: the two laps along them (two widths of the conditioner, overlapped)
  bandGoal: 0.9,
  goal: 0.95, // of the ice resurfaced to finish
  // the gate in the west end boards, off the middle (the goal stood in front of the middle) but short of the corner's
  // curve (|y| ≤ halfW − corner), and the tunnel behind it
  gate: { y: 4.2, halfW: 1.9, depth: 9 },
  park: { x: -RINK.halfL - 5.2 }, // where the machine stands in the tunnel at the start (its middle)
  home: -RINK.halfL - 2.7, // its middle this far into the tunnel: the whole machine is behind the boards' line
  // the machine (a compact resurfacer as the Seehofseeli's, js/missions-rink.js; its origin the middle of the body)
  machine: {
    vMax: 15 / 3.6, // m/s: 15 km/h
    vBack: 1.4,
    accel: 1.15, // m/s² from standing (less near the top speed)
    brake: 3.6,
    coast: 0.45,
    back: 0.9, // m/s² backing up
    wheelbase: 2.4,
    rearAxle: -1.1, // m behind the origin: the steered axle (the front axle wheelbase ahead of it)
    maxSteer: 0.52, // rad at the rear wheels: a turning circle of ~4.2 m at the front axle (~10.5 m across, outside the body)
    steerRate: 1.4, // rad/s at the wheels
    // the body against the boards: two circles along the axis (the nose with the driver; the tank and the conditioner)
    circles: [{ s: 0.85, r: 1.2 }, { s: -1.45, r: 1.2 }],
    halfW: 1.2
  },
  conditioner: { back: 2.35, halfL: 0.3, halfW: 1.15, minSpeed: 0.3 }, // the blade and the towel behind the rear axle
  pass: 1.5, // s off a cell before the conditioner coming over it again counts as a new pass
  filmFreeze: 1 / 14, // the film freezes in ~14 s
  puddleFilm: 0.45, // a new pass over a film still this wet: a puddle
  waterRange: 1250, // m of laying in a full tank (~750 m covers the rink once, with no overlap at all)
  snowFull: 1.12, // the snow tank holds the shavings of 1.12 rinks (an old pass sheds a quarter of a rough one)
  bump: 1.25, // m/s into the boards: a hard knock
  timeLimitMs: 9 * 60 * 1000,
  // the points: a finished run, the ice over the goal, the clock left (a point a second), the knocks and the puddles
  points: { finish: 1000, extra: 200, bump: 40, puddle: 20 }
};

const HL = RINK.halfL, HW = RINK.halfW;
const COLS = Math.round((2 * HL) / ZAMBONI.cell), ROWS = Math.round((2 * HW) / ZAMBONI.cell);

/** The distance of a local point inside the rink from its boards (negative outside) */
export function boardsDistance(x, y, R = RINK) {
  const ax = Math.abs(x), ay = Math.abs(y), hx = R.halfL, hy = R.halfW, c = R.corner;
  if (ax > hx - c && ay > hy - c) return c - Math.hypot(ax - (hx - c), ay - (hy - c));
  return Math.min(hx - ax, hy - ay);
}

/** The gate's tunnel (local): from the boards back `depth` m, `halfW` either side of its middle */
export const inTunnel = (x, y, G = ZAMBONI.gate) => x <= -HL + 0.01 && x >= -HL - G.depth && Math.abs(y - G.y) <= G.halfW;

/**
 * The ice map: { cols, rows, cell, mask (1 counted), band (1 within ZAMBONI.band of the boards), done (resurfaced),
 * film (its warm water, 1 just laid), last (s: when the conditioner last came over), puddle, counts }
 */
export function createZamboniIce(Z = ZAMBONI) {
  const cols = COLS, rows = ROWS, n = cols * rows, cell = Z.cell;
  const g = {
    cols, rows, cell, mask: new Uint8Array(n), band: new Uint8Array(n), done: new Uint8Array(n), film: new Float32Array(n),
    last: new Float32Array(n).fill(-1e9), puddle: new Uint8Array(n), target: 0, bandTarget: 0, doneCount: 0, bandDone: 0,
    puddles: 0, dirty: null, version: 0
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, d = boardsDistance(-HL + (i + 0.5) * cell, -HW + (j + 0.5) * cell);
    if (d < Z.edge) continue;
    g.mask[k] = 1; g.target++;
    if (d < Z.band) { g.band[k] = 1; g.bandTarget++; }
  }
  return g;
}

export function resetZamboniIce(g) {
  g.done.fill(0); g.film.fill(0); g.last.fill(-1e9); g.puddle.fill(0);
  g.doneCount = g.bandDone = g.puddles = 0;
  g.dirty = { i0: 0, i1: g.cols - 1, j0: 0, j1: g.rows - 1 };
  g.version++;
}

function touch(g, i, j) {
  const d = g.dirty;
  if (!d) g.dirty = { i0: i, i1: i, j0: j, j1: j };
  else { if (i < d.i0) d.i0 = i; if (i > d.i1) d.i1 = i; if (j < d.j0) d.j0 = j; if (j > d.j1) d.j1 = j; }
}

export const iceShare = (g) => (g.target ? g.doneCount / g.target : 0);
export const bandShare = (g) => (g.bandTarget ? g.bandDone / g.bandTarget : 0);
export const puddleArea = (g) => g.puddles * g.cell * g.cell;

// --- The machine ------------------------------------------------------------------------------------------------------
export function createMachine(Z = ZAMBONI) {
  return { x: Z.park.x, y: Z.gate.y, a: 0, v: 0, steer: 0, on: false, water: 1, snow: 0, contact: false, bumps: 0, knock: 0, laid: 0 };
}

/**
 * One step of the machine. `input`: { forward 0-1, back 0-1 (brakes, then backs up), steer −1..1 (positive: to the left) }.
 * Kinematic: the front axle runs along the heading, the rear wheels turn it (the tail swings out); then the boards (and the gate's tunnel)
 * keep the body in. Returns { hit, impact } (impact: m/s into the boards when it touched them this step).
 */
export function stepMachine(m, input, dt, Z = ZAMBONI) {
  const M = Z.machine, fwd = input.forward || 0, bk = input.back || 0;
  if (fwd > 0 && m.v > -0.05) m.v = Math.min(M.vMax, m.v + M.accel * fwd * (1 - 0.55 * (m.v / M.vMax)) * dt);
  else if (fwd > 0) m.v = Math.min(0, m.v + M.brake * fwd * dt); // (forward while backing: a stop first)
  else if (bk > 0 && m.v > 0.05) m.v = Math.max(0, m.v - M.brake * bk * dt);
  else if (bk > 0) m.v = Math.max(-M.vBack, m.v - M.back * bk * dt);
  else m.v = m.v > 0 ? Math.max(0, m.v - M.coast * dt) : Math.min(0, m.v + M.coast * dt);
  const want = clamp(input.steer || 0, -1, 1) * M.maxSteer;
  m.steer += clamp(want - m.steer, -M.steerRate * dt, M.steerRate * dt);
  // steered at the rear axle, like the real machines: the front axle runs along the heading, the rear wheels (turned
  // against the steer) swing the tail out; the heading turns by v·tan(δ)/L (a steer to the left: towards −y, a smaller a)
  const fa = M.rearAxle + M.wheelbase;
  let fx = m.x + Math.cos(m.a) * fa, fy = m.y + Math.sin(m.a) * fa;
  fx += Math.cos(m.a) * m.v * dt; fy += Math.sin(m.a) * m.v * dt;
  m.a -= (m.v * Math.tan(m.steer) / M.wheelbase) * dt;
  m.x = fx - Math.cos(m.a) * fa; m.y = fy - Math.sin(m.a) * fa;
  return containMachine(m, Z);
}

/** The nearest allowed spot of a circle's middle: on the ice `r` in from the boards, or in the gate's tunnel */
function allowed(p, r, Z) {
  const G = Z.gate;
  // the tunnel: its walls `r` in, its back wall, and its mouth open onto the ice
  const ty = clamp(p.y, G.y - G.halfW + r, G.y + G.halfW - r);
  const inMouth = Math.abs(p.y - G.y) <= G.halfW - r + 1e-6;
  if (p.x < -HL + r && inMouth && p.x >= -HL - G.depth + r) return { x: p.x, y: p.y };
  const q = { x: p.x, y: p.y };
  clampToRink(q, r);
  const t = { x: clamp(p.x, -HL - G.depth + r, -HL + r), y: ty };
  return Math.hypot(t.x - p.x, t.y - p.y) < Math.hypot(q.x - p.x, q.y - p.y) ? t : q;
}

export function containMachine(m, Z = ZAMBONI) {
  let hit = false, nx = 0, ny = 0;
  for (let it = 0; it < 2; it++) {
    for (const c of Z.machine.circles) {
      const p = { x: m.x + Math.cos(m.a) * c.s, y: m.y + Math.sin(m.a) * c.s };
      const q = allowed(p, c.r, Z);
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      m.x += dx; m.y += dy;
      nx += dx / d; ny += dy / d;
      hit = true;
    }
  }
  let impact = 0;
  if (hit) {
    // into the boards: the speed along the push's normal; the machine stops (its rubber bumpers take the rest)
    const L = Math.hypot(nx, ny) || 1, into = -(Math.cos(m.a) * nx + Math.sin(m.a) * ny) / L * m.v;
    if (into > 0.05) { if (!m.contact) impact = into; m.v *= 0.15; }
  }
  m.contact = hit;
  if (impact >= Z.bump) { m.bumps++; m.knock = impact; }
  return { hit, impact };
}

/** The machine's middle in the world, and its world heading */
export const machineWorld = (m) => ({ ...rinkWorld(m.x, m.y), heading: rinkHeadingWorld(m.a) });

// --- The conditioner ---------------------------------------------------------------------------------------------------
/**
 * The conditioner behind the machine at time `t` (s), driving forwards over the map: rough cells resurfaced, the warm
 * film laid; a new pass over a film still wet leaves a puddle. Uses water (the distance laid) and fills the snow tank.
 * Returns { laid (cells newly resurfaced), puddles (new puddle cells) }.
 */
export function stepConditioner(g, m, dt, t, Z = ZAMBONI) {
  const C = Z.conditioner, out = { laid: 0, puddles: 0 };
  if (!m.on || m.v < C.minSpeed || m.water <= 0) return out;
  const fx = Math.cos(m.a), fy = Math.sin(m.a);
  const cu = m.x - fx * C.back + HL, cv = m.y - fy * C.back + HW;
  const area = g.cell * g.cell, rink = g.target * area;
  let shaved = 0;
  forCellsInBox(g, cu, cv, fx, fy, C.halfL, C.halfW, (k, i, j) => {
    if (!g.mask[k]) return;
    const fresh = t - g.last[k] > Z.pass;
    if (fresh && g.film[k] > Z.puddleFilm && !g.puddle[k]) { g.puddle[k] = 1; g.puddles++; out.puddles++; }
    if (!g.done[k]) {
      g.done[k] = 1; g.doneCount++; out.laid++;
      if (g.band[k]) g.bandDone++;
      shaved += area;
    } else if (fresh) shaved += area * 0.25;
    g.film[k] = 1;
    g.last[k] = t;
    touch(g, i, j);
  });
  const d = m.v * dt;
  m.laid += d;
  m.water = Math.max(0, m.water - d / Z.waterRange);
  m.snow = Math.min(1, m.snow + shaved / (rink * Z.snowFull));
  return out;
}

/** The warm water freezes (every cell with film on it: marked changed) */
export function stepFilm(g, dt, Z = ZAMBONI) {
  const f = Z.filmFreeze * dt;
  for (let k = 0; k < g.film.length; k++) {
    if (g.film[k] <= 0) continue;
    g.film[k] = Math.max(0, g.film[k] - f);
    touch(g, k % g.cols, (k / g.cols) | 0);
  }
}

// --- The score --------------------------------------------------------------------------------------------------------
/** The points: a finished run, the ice over 95 %, a point for each second left on the clock, less the knocks and the
 *  puddles (never below zero; 0 for a run not finished) */
export function zamboniScore(state, Z = ZAMBONI) {
  if (!state.finished) return 0;
  const P = Z.points;
  const extra = clamp((state.ice - Z.goal) / (1 - Z.goal), 0, 1) * P.extra;
  const left = Math.max(0, Z.timeLimitMs - (state.tMs || 0)) / 1000;
  return Math.max(0, Math.round(P.finish + extra + left - state.bumps * P.bump - state.puddleM2 * P.puddle));
}

// --- Bots (the calibration, the tests) --------------------------------------------------------------------------------
/**
 * The ice masters' pattern as a path for a bot: out of the gate, laps round the rink `first` m from the boards (the
 * machine's middle), each next one `step` m further in; then the middle in long lanes, looping round at their ends
 * over the ice of the laps; then back into the tunnel. Points [{ x, y }] about 1 m apart; `home`: where the way back
 * begins.
 */
export function masterPath({ first = 1.45, step = 2.0, laps = 5, lanes = [-3.45, 3.45, -1.15, 1.15] } = {}, Z = ZAMBONI) {
  const pts = [];
  const seg = (out, ax, ay, bx, by) => { const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L)); for (let i = 0; i < n; i++) out.push({ x: ax + ((bx - ax) * i) / n, y: ay + ((by - ay) * i) / n }); };
  seg(pts, Z.park.x, Z.gate.y, -HL + 6, Z.gate.y);
  pts.push({ x: -22, y: 0.5 }, { x: -21, y: -6 }); // (a swing to the left out of the gate, then right onto the first lap)
  for (let l = 0; l < laps; l++) {
    const d = first + l * step, hx = HL - d, hy = HW - d;
    const r = Math.max(4.3, RINK.corner - d);
    // round from the south-west corner along the south side (−y) eastwards, a turn to the right at each corner (the
    // machine leaves the gate, swings left and right onto it); each lap ends where the next, further in, begins
    const arc = (cx, cy, a0) => { const n = Math.max(2, Math.round((Math.PI / 2) * r)); for (let i = 0; i < n; i++) { const a = a0 + ((Math.PI / 2) * i) / n; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } };
    seg(pts, -hx + r, -hy, hx - r, -hy); arc(hx - r, -hy + r, -Math.PI / 2);
    seg(pts, hx, -hy + r, hx, hy - r); arc(hx - r, hy - r, 0);
    seg(pts, hx - r, hy, -hx + r, hy); arc(-hx + r, hy - r, Math.PI / 2);
    seg(pts, -hx, hy - r, -hx, -hy + r); arc(-hx + r, -hy + r, Math.PI);
  }
  // the middle: lanes along the rink, east and west in turn (the loops at their ends are the pursuit's)
  const end = HL - 5.5;
  lanes.forEach((y, i) => (i % 2 ? seg(pts, end, y, -end, y) : seg(pts, -end, y, end, y)));
  pts.home = pts.length;
  pts.push({ x: -HL + 6, y: Z.gate.y - 0.5 });
  seg(pts, -HL + 3, Z.gate.y, Z.home - 2, Z.gate.y);
  return pts;
}

/** Pure pursuit along `path` from index `i`: the steer for the machine and the index reached */
export function pursue(m, path, i, look = 5) {
  // (from the front axle: it runs along the heading, the rear-steered tail follows)
  const fa = ZAMBONI.machine.rearAxle + ZAMBONI.machine.wheelbase, ox = m.x + Math.cos(m.a) * fa, oy = m.y + Math.sin(m.a) * fa;
  while (i < path.length - 1 && Math.hypot(path[i].x - ox, path[i].y - oy) < look) i++;
  const p = path[i], dx = p.x - ox, dy = p.y - oy;
  let err = Math.atan2(dy, dx) - m.a;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  // (a turn to the right is a larger a: the steer's sign is the other way)
  return { steer: clamp(-err * 2.2, -1, 1), i, err };
}

// =====================================================================================================================
const ZAMBONI_ID = 'eisstadion-zamboni';
const GATE_POINT = rinkWorld(-HL - 2, ZAMBONI.gate.y);
const PARK = rinkWorld(ZAMBONI.park.x, ZAMBONI.gate.y);
const PIN = rinkWorld(-HL - 26, -14); // outside the WNW gable (the shoot-out's pin is outside the ESE one)

/** The machine's local spot from a frame's world position */
const localOf = (ctx) => rinkLocal(ctx.x, ctx.z);
const timeLeft = (ctx) => ZAMBONI.timeLimitMs - (ctx.t || 0);
function overTime(ctx) {
  if (timeLeft(ctx) > 0) return null;
  return { done: false, fail: 'The intermission is over: the teams are back at the boards and the ice is not ready. The referee waves the machine off.', text: '', progress: null, target: null, hint: null };
}
function dry(state) {
  if (!state.dry || state.ice >= ZAMBONI.goal) return null;
  return { done: false, fail: 'The water tank is empty and the ice is only half done: the crew has to finish it with the hose, and the game starts late.', text: '', progress: null, target: null, hint: null };
}
const offHint = (state) => (state.on ? null : 'Space: conditioner on');

export const ZAMBONI_MISSION = {
  id: ZAMBONI_ID,
  title: 'The ice resurfacer in the intermission',
  intro: 'HC Davos against the ZSC Lions, 2 : 1 after two periods, and the Eisstadion is sold out. The siren has gone, the players are in the dressing rooms, and the ice they left behind is grey and cut up. You drive the ice resurfacer: out through its gate in the west end boards and over the whole rink before the teams come back. The conditioner behind the machine shaves the ice and lays a film of warm water, 2.3 m wide, that freezes as smooth as glass. Do it the way the ice masters do: first two laps along the boards, then ovals towards the middle, each pass overlapping the last by a hand\'s width. W drives, S brakes and backs up, A/D steer: it is a heavy machine with a wide turning circle, so turn early. Space switches the conditioner on and off, V shows the ice from above. Water laid on water that has not frozen yet pools into puddles, a hard knock against the boards costs points, and the water tank does not last for ever. At least 95 % of the ice, then back through the gate before the intermission clock runs out. Points for the ice, the time left and a clean run.',
  mode: 'person',
  season: null,
  time: 'evening', // (an evening game: the second intermission at about half past nine)
  features: ['zamboni'],
  props: [],
  colour: '#1d3f8f',
  icon: 'zamboni',
  pin: PIN,
  scoreMode: true,
  scoreUnit: 'pts',
  // (the bot of tests/missions-zamboni.test.mjs: five laps and four lanes down the middle, back in the tunnel after
  // ~4:05 with nothing knocked: ~1300; gold wants a run nearly as tidy, silver one of ~6:20, bronze finishing at all
  // with a minute or so to spare)
  medals: { gold: 1250, silver: 1150, bronze: 1050 },
  timeLimitMs: ZAMBONI.timeLimitMs,
  finish: 'The ice shines under the floodlights, the gate closes behind the machine, and the teams step back onto a sheet like glass. The Eisstadion applauds the ice crew.',
  start: { x: PARK.x, z: PARK.z, heading: rinkHeadingWorld(0) },
  createState() { return { ice: 0, band: 0, water: 1, snow: 0, on: false, dry: false, bumps: 0, puddleM2: 0, finished: false, tMs: 0, inTunnel: true }; },
  update(ctx, state) { if (!state.finished) state.tMs = ctx.t || 0; },
  score(state) { return zamboniScore(state); },
  summary(state) {
    const m2 = Math.round(state.puddleM2);
    return [`${pct(state.ice)} of the ice resurfaced · ${state.bumps} hard knock${state.bumps === 1 ? '' : 's'} · ${m2} m² of puddles · water left ${pct(state.water)}`];
  },
  objectives: [
    {
      id: 'boards',
      title: 'Two laps along the boards',
      check(ctx, state) {
        const fail = overTime(ctx) || dry(state);
        if (fail) return fail;
        const l = localOf(ctx);
        const inside = l.x < -HL + 1;
        return {
          done: state.band >= ZAMBONI.bandGoal, progress: state.band / ZAMBONI.bandGoal,
          text: `Along the boards ${pct(state.band)} of ${pct(ZAMBONI.bandGoal)} · ${fmtClock(timeLeft(ctx))} left`,
          target: null,
          hint: offHint(state) || (inside ? 'W: out through the gate onto the ice' : 'First two laps along the boards, close to them')
        };
      }
    },
    {
      id: 'middle',
      title: 'Ovals towards the middle',
      check(ctx, state) {
        const fail = overTime(ctx) || dry(state);
        if (fail) return fail;
        return {
          done: state.ice >= ZAMBONI.goal, progress: state.ice / ZAMBONI.goal,
          text: `Ice ${pct(state.ice)} of ${pct(ZAMBONI.goal)} · water ${pct(state.water)} · ${fmtClock(timeLeft(ctx))} left`,
          target: null,
          hint: offHint(state) || (state.water < 0.15 ? 'The water is running low: no passes twice' : 'Now the middle: overlap your last pass by a hand\'s width')
        };
      }
    },
    {
      id: 'gate',
      title: 'Back through the gate',
      check(ctx, state) {
        const fail = overTime(ctx);
        if (fail) return fail;
        const l = localOf(ctx);
        const done = l.x <= ZAMBONI.home && inTunnel(l.x, l.y);
        if (done) state.finished = true;
        const d = Math.max(0, Math.hypot(l.x - ZAMBONI.home, l.y - ZAMBONI.gate.y));
        return {
          done, progress: null,
          text: `${Math.round(d)} m to the gate · ${fmtClock(timeLeft(ctx))} left`,
          target: { x: GATE_POINT.x, z: GATE_POINT.z, r: 2.2 },
          hint: state.on ? 'Space: conditioner off, then into the gate' : 'Into the gate: the teams are waiting'
        };
      }
    }
  ]
};

export const ZAMBONI_MISSIONS = [ZAMBONI_MISSION];
