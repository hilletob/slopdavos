// js/missions-data-splitboard.js
// A splitboard tour on the Chörbschhorn (js/missions-data.js spreads SPLITBOARD_MISSIONS into MISSIONS; js/missions-splitboard.js
// has the runtime: the rider on the skins and on the board, the marker poles, the track in the snow, the board's halves at
// the transition, the cairn). No three.js and no DOM in here (tests/missions-splitboard.test.mjs climbs and rides it with bots
// on the real terrain).
//
//   choerbschhorn-splitboard  Winter, midday. The Chörbschhorn (2650 m) above Davos Platz, the summit of the ridge between the
//                    Strela and the Hauptertälli, its emergency shelter (the Chörbschhornhütte, P. 2575, OSM w307864648) on
//                    the south ridge. Up from the Strelapass (2350 m, the pass from the Schatzalp's lifts over to the Schanfigg,
//                    its restaurant OSM w25771453) south-west along the east side of the ridge, past the Hauptertälli (2409 m,
//                    the pass to Arosa) and up the ridge to the summit; down its south ridge past the hut and on south-east,
//                    the line of the summer path (the Chörbschhoraweg), to the Stafelalp (the Berghaus Stafelalp, 1894 m,
//                    LV95 2779150 / 1182503, above Davos Frauenkirch). The two lines were found on the swissALTI3D terrain of
//                    the map (shortest paths over the 12 m grid: up the quickest on skins, never steeper than 34°; down always
//                    falling, never steeper than 38°), then smoothed.
//
// The phases:
//   1. the avalanche transceiver: hold Space until it beeps (it sends) — at the start of every tour.
//   2. the ascent on skins, the board split into two skis: from marker pole to marker pole (any line between them). The skins
//      hold up to a slope (`grip`) at full pace, less and less above it, not at all past `slip` (you slide back). On the
//      gentle ground you walk at `flat` m/s; the steeper it gets, the more the pace is the climb (`climb` m of height a
//      second at most): so straight up a steep face is slow or impossible, and a zig-zag across it, at the slope the skins
//      still hold, is the quickest way up. On steep ground the turn is slow (the skis cross the fall line); a kick turn (Space)
//      turns you round onto the other diagonal in a second.
//   3. the transition on the summit: hold Space through the four steps (the skins off, one after the other; the halves
//      joined; the bindings turned to ride). Let go and the step's progress runs back.
//   4. the descent on the board (js/missions-data-snow.js stepRider, BOARD_PARAMS): through the gates of red flags in order;
//      one missed costs 8 s (there is no walking back up in deep snow).
// Judged by time. The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z).
import { lineLength, pointAt, buildCheckpoints, updateCheckpoints, crossGate } from './missions-data-snow.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);

// --- The places ------------------------------------------------------------------------------------------------------
// (swissALTI3D: the summit 2650.4 m at LV95 2777780 / 1184792; the Strelapass 2349 m at 2779935 / 1187375)
export const SPLIT_PLACES = {
  summit: { x: -4720, z: 708, ele: 2650 },
  hut: { x: -4685, z: 955 }, // the Chörbschhornhütte
  strelapass: { x: -2565, z: -1875 }, // the restaurant on the pass
  hauptertaelli: { x: -4004, z: -497 },
  stafelalp: { x: -3350, z: 2997 }, // the Berghaus Stafelalp
  start: { x: -2575, z: -1905 }
};

// The skin track: from the Strelapass south-west along the east side of the ridge, past the Hauptertälli and up the ridge to
// the summit (3.5 km, 540 m up and 240 m down on the way)
export const ASCENT_ROUTE = [
  -2576,-1909,-2605.2,-1850.5,-2623.2,-1824.6,-2645.7,-1782.6,-2659.2,-1774.7,-2668.1,-1760.5,-2671.8,-1745.5,-2672,-1715.5,-2674.8,-1700.5,-2690.7,-1655.5,
  -2699.7,-1641.4,-3047.7,-1293.2,-3061.1,-1282.7,-3149.4,-1237.7,-3198.3,-1191.2,-3225.7,-1171.9,-3233.2,-1158.1,-3242.7,-1127.5,-3253.1,-1115.3,-3266.9,-1106.7,
  -3295.2,-1069.7,-3449.7,-914.7,-3467.7,-885.4,-3851.7,-501.2,-3865.1,-490.7,-3907.6,-468.2,-3953.7,-422.7,-4014.1,-303.6,-4016,-273.2,-4019.9,-257.3,
  -4027.2,-243.6,-4049.7,-218.7,-4058.7,-203.5,-4193.7,65.9,-4204.4,79.3,-4218.5,88.3,-4277.4,118.3,-4301.7,141.3,-4325.7,185.9,-4336.2,199.3,
  -4384.2,247.4,-4400.7,274.6,-4457.7,333.3,-4519.2,452.4,-4542.3,476.8,-4571.6,494.8,-4582.2,508.1,-4604.7,550.6,-4637.7,585.3,-4666.2,628.1,
  -4696.4,687.3,-4707.7,698.6,-4720,708
];
// The line down: from the summit down the south ridge past the Chörbschhornhütte, then south-east down the slopes of the
// Chörbschhoraweg's valley to the Stafelalp (2.6 km, 730 m down)
export const DESCENT_ROUTE = [
  -4720,712,-4717.2,725.1,-4710.8,738.9,-4708,754.3,-4707.4,799.5,-4702.7,814.5,-4687.9,844.5,-4684.2,859.5,-4683.4,919.5,-4678.7,934.5,
  -4656.2,979.5,-4629.2,1021.5,-4624,1037.3,-4623.8,1084.5,-4620.1,1099.5,-4605.2,1129.5,-4600.6,1144.5,-4598.1,1189.5,-4591.7,1204.3,-4570.7,1229.3,
  -4551.6,1257.4,-4483.7,1304.4,-4465.4,1331.6,-4438.7,1349.3,-4390.7,1397.3,-4380.2,1411.7,-4363.7,1456.3,-4332.2,1495.7,-4302.2,1554.9,-4291.7,1568.3,
  -4243.7,1616.4,-4234.7,1630.5,-4099.9,1900.3,-4096,1914.8,-4094.1,1945.5,-4087.7,1960.3,-4078.7,1973.3,-3730.7,2321.3,-3720.2,2335.7,-3424,2928
];

export const SPLIT = {
  skin: {
    flat: 2.8, // m/s on the level, ~10 km/h (and downhill: the skins brake)
    climb: 1.2, // m of height a second at most (the legs: on skins at `grip` the pace holds them under it)
    grip: 19 * DEG, // the skins hold at full pace up to this slope along the skis
    slip: 29 * DEG, // and not at all from this one: you slide back
    slideBack: 1.6, // m/s back down at most
    back: 0.9, // m/s, a step back (S)
    turn: 1.5, // rad/s on easy ground
    steepTurn: 0.45, // rad/s where the slope (the fall line) is steeper than `steep`
    steep: 22 * DEG,
    kick: 0.9, // s a kick turn takes
    stride: 1.25 // m a stride (the poles and the bob)
  },
  up: { spacing: 120, first: 70, radius: 22 }, // the marker poles
  down: { spacing: 135, first: 90, half: 22, reach: 90, missMs: 8000 }, // the gates of flags
  transceiver: 1.2, // s held: it beeps, it sends
  transition: [
    { id: 'skinL', label: 'Skin off the left half', hold: 1.1 },
    { id: 'skinR', label: 'Skin off the right half', hold: 1.1 },
    { id: 'join', label: 'Join the halves', hold: 1.5 },
    { id: 'bind', label: 'Bindings to ride mode', hold: 1.2 }
  ],
  timeLimitMs: 50 * 60 * 1000
};

// --- The slope -------------------------------------------------------------------------------------------------------
/** The ground's gradient at (x, z): { gx, gz (dh/dx, dh/dz), slope (rad, the fall line), up (the heading uphill) } */
export function slopeAt(height, x, z, out = {}, e = 4) {
  const gx = (height(x + e, z) - height(x - e, z)) / (2 * e), gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
  out.gx = gx; out.gz = gz;
  out.slope = Math.atan(Math.hypot(gx, gz));
  out.up = Math.atan2(gx, gz);
  return out;
}
/** The slope along a heading (rad, + uphill) */
export const slopeAlong = (s, heading) => Math.atan(s.gx * Math.sin(heading) + s.gz * Math.cos(heading));

/**
 * The pace on skins along the ground (m/s; negative: sliding back) for a slope `theta` along the skis (rad, + uphill):
 * the level pace on easy ground, the legs' climb rate on steeper, the skins' hold above `grip`, nothing (a slide back) past `slip`
 */
export function skinPace(theta, S = SPLIT.skin) {
  if (theta <= 0) return S.flat;
  if (theta >= S.slip) return -S.slideBack * clamp((theta - S.slip) / (6 * DEG) + 0.35, 0, 1);
  const legs = Math.min(S.flat, S.climb / Math.sin(theta));
  const hold = theta <= S.grip ? 1 : 1 - ((theta - S.grip) / (S.slip - S.grip)) ** 2;
  return legs * hold;
}
/** The height gained a second at a slope along the skis (the zig-zag's case: the best of it at about `grip`) */
export const climbRate = (theta, S = SPLIT.skin) => skinPace(theta, S) * Math.sin(theta);

/** A kick turn: the heading mirrored about the fall line (onto the other diagonal; straight up: onto one of 40°) */
export function kickTurnHeading(heading, up) {
  const d = wrapPi(heading - up);
  if (Math.abs(d) < 0.7) return up - (d >= 0 ? 1 : -1) * 0.7;
  return up - d;
}

// --- The skinner -------------------------------------------------------------------------------------------------------
export function createSkinner(x, z, heading, height) {
  return { x, z, y: height(x, z), heading, speed: 0, kickT: 0, kickFrom: 0, kickTo: 0, kicks: 0, slipping: false, slipT: 0, stride: 0, theta: 0, slope: 0, moved: 0 };
}

const _s = {};
/**
 * One step on skins. input: { forward (0-1, W), back (0-1, S), steer (-1..1, + left), kick (true on the frame Space was
 * pressed) }. While a kick turn lasts there is no other input.
 */
export function stepSkinner(s, input, dt, height, S = SPLIT.skin) {
  const sl = slopeAt(height, s.x, s.z, _s);
  s.slope = sl.slope;
  if (s.kickT > 0) {
    s.kickT = Math.max(0, s.kickT - dt);
    const f = 1 - s.kickT / S.kick, e = f * f * (3 - 2 * f);
    s.heading = s.kickFrom + wrapPi(s.kickTo - s.kickFrom) * e;
    s.speed = 0;
    s.slipping = false;
    s.y = height(s.x, s.z);
    return s;
  }
  if (input.kick) {
    s.kickFrom = s.heading;
    s.kickTo = kickTurnHeading(s.heading, sl.up);
    s.kickT = S.kick;
    s.kicks++;
    s.speed = 0;
    return s;
  }
  const steer = clamp(input.steer || 0, -1, 1);
  s.heading += steer * (sl.slope > S.steep ? S.steepTurn : S.turn) * dt;
  const theta = slopeAlong(sl, s.heading);
  s.theta = theta;
  const fwd = clamp(input.forward || 0, 0, 1), back = clamp(input.back || 0, 0, 1);
  let target = 0;
  if (fwd > 0) target = skinPace(theta, S) * fwd * (1 - 0.2 * Math.abs(steer));
  else if (back > 0) target = -S.back * back;
  // (standing pointing up a face too steep for the skins: they don't hold that either)
  if (!fwd && theta >= S.slip) target = skinPace(theta, S);
  s.slipping = theta >= S.slip && target < 0 && !back;
  if (s.slipping) s.slipT += dt;
  s.speed += clamp(target - s.speed, -5 * dt, 3.5 * dt);
  const step = s.speed * dt;
  s.x += Math.sin(s.heading) * step;
  s.z += Math.cos(s.heading) * step;
  s.y = height(s.x, s.z);
  s.stride += Math.abs(step) / S.stride;
  s.moved += Math.abs(step);
  return s;
}

// --- The transition ----------------------------------------------------------------------------------------------------
export const createTransition = () => ({ step: 0, t: 0, done: false });
/** Holding (Space) fills the step; let go and it runs back twice as fast. Returns the step just finished, or null */
export function stepTransition(tr, holding, dt, steps = SPLIT.transition) {
  if (tr.done) return null;
  const st = steps[tr.step];
  tr.t = holding ? tr.t + dt : Math.max(0, tr.t - 2 * dt);
  if (tr.t < st.hold) return null;
  tr.step++; tr.t = 0;
  if (tr.step >= steps.length) tr.done = true;
  return st;
}
/** The transition as one share (0-1) */
export const transitionShare = (tr, steps = SPLIT.transition) => {
  if (tr.done) return 1;
  const total = steps.reduce((a, s) => a + s.hold, 0);
  return (steps.slice(0, tr.step).reduce((a, s) => a + s.hold, 0) + Math.min(tr.t, steps[tr.step].hold)) / total;
};

// --- The marker poles and the gates ----------------------------------------------------------------------------------
export const ascentPoles = () => buildCheckpoints(ASCENT_ROUTE, SPLIT.up.spacing, SPLIT.up.first);
/** The gates down: [{ i, x, z, tx, tz, nx, nz, half, s }] (the last one the finish at the Stafelalp) */
export function descentGates() {
  return buildCheckpoints(DESCENT_ROUTE, SPLIT.down.spacing, SPLIT.down.first).map((c) => ({ ...c, nx: c.tz, nz: -c.tx, half: SPLIT.down.half }));
}
/**
 * The gates for a move a -> b: the next one crossed between its flags (or a later one, the ones before it missed), or crossed
 * beside them (missed). down: { gates, next, passed, missed, penaltyMs, results }. Returns the events [{ i, pass }]
 */
export function updateGates(down, ax, az, bx, bz, D = SPLIT.down) {
  const events = [];
  for (let k = down.next; k < Math.min(down.gates.length, down.next + 3); k++) {
    const hit = crossGate(down.gates[k], ax, az, bx, bz, { tolerance: 0, reach: D.reach });
    if (!hit) continue;
    for (let j = down.next; j < k; j++) { down.results[j] = 'miss'; down.missed++; down.penaltyMs += D.missMs; events.push({ i: j, pass: false }); }
    down.results[k] = hit.pass ? 'pass' : 'miss';
    if (hit.pass) down.passed++; else { down.missed++; down.penaltyMs += D.missMs; }
    events.push({ i: k, pass: hit.pass });
    down.next = k + 1;
    break;
  }
  return events;
}

// --- Bots (the calibration, the tests) --------------------------------------------------------------------------------
/**
 * The skinner's input towards the next pole: straight at it where that is no steeper than `grip`, else a diagonal at
 * `aim` across the fall line, on the side of the pole, with a kick turn when the pole has gone over to the other side
 * by more than `width` m of the line to it
 */
export function skinBot(s, target, height, { aim = SPLIT.skin.grip * 0.97, width = 26 } = {}, S = SPLIT.skin) {
  if (s.kickT > 0) return { forward: 0, steer: 0, kick: false };
  const sl = slopeAt(height, s.x, s.z, _s);
  const bearing = Math.atan2(target.x - s.x, target.z - s.z);
  let want = bearing;
  const direct = slopeAlong(sl, bearing);
  if (direct > aim && sl.slope > aim) {
    // the diagonals that climb at `aim`: tan(aim) = tan(slope)·cos(α)
    const a = Math.acos(clamp(Math.tan(aim) / Math.tan(sl.slope), -1, 1));
    const side = Math.sign(wrapPi(bearing - sl.up)) || 1;
    const cur = Math.sign(wrapPi(s.heading - sl.up)) || side;
    // across from the line to the pole: how far over it the bot is
    const off = (target.x - s.x) * Math.cos(sl.up) - (target.z - s.z) * Math.sin(sl.up);
    let use = cur;
    if (cur !== side && Math.abs(off) > width) use = side;
    want = sl.up + use * a;
    if (use !== cur && Math.abs(wrapPi(s.heading - want)) > 0.9 && sl.slope > S.steep * 0.8) return { forward: 0, steer: 0, kick: true };
  }
  const err = wrapPi(want - s.heading);
  return { forward: 1, steer: clamp(err * 3, -1, 1), kick: false };
}

/** The rider's input towards the gates: steer at a point beyond the next gate's middle, check the speed under `vmax` */
export function rideBot(r, gates, next, { vmax = 15, lead = 0.35 } = {}) {
  const g = gates[Math.min(next, gates.length - 1)], h = gates[Math.min(next + 1, gates.length - 1)];
  const tx = g.x + (h.x - g.x) * lead, tz = g.z + (h.z - g.z) * lead;
  const travel = Math.hypot(r.vx, r.vz) > 0.5 ? Math.atan2(r.vx, r.vz) : r.heading;
  const err = wrapPi(Math.atan2(tx - r.x, tz - r.z) - travel);
  const sp = Math.hypot(r.vx, r.vy, r.vz);
  return { steer: clamp(err * 2.2, -1, 1), tuck: sp < vmax * 0.6 ? 1 : 0, brake: sp > vmax ? clamp((sp - vmax) / 4, 0, 1) : 0, spin: 0, flip: 0, grab: false };
}

// =====================================================================================================================
const ID = 'choerbschhorn-splitboard';
const POLES = ascentPoles();
const GATES = descentGates();
const UP_LEN = lineLength(ASCENT_ROUTE);
// the ascent's two parts (to the Hauptertälli, the ridge), the descent's two (the south ridge, the slopes to the alp)
const UP_PARTS = [['traverse', 'Along the ridge to the Hauptertälli', 2064], ['ridge', 'Up the ridge to the summit', Infinity]];
const DOWN_PARTS = [['ridge-down', 'Down the south ridge past the hut', 700], ['stafel', 'Down to the Stafelalp', Infinity]];

function upObjective([id, title, toS]) {
  const last = POLES.reduce((k, c, i) => (c.s <= toS + 1 ? i : k), 0);
  return {
    id,
    title,
    allowModes: ['person'],
    check(ctx, state) {
      if (ctx.t > SPLIT.timeLimitMs) return { done: false, fail: 'The sun has turned the snow to mush: too late for the descent today.', text: '', progress: null, target: null };
      const up = state.up, cp = up.cps[up.next], n = up.cps.length, sk = up.skipped != null ? up.cps[up.skipped] : null;
      const text = sk ? `Marker pole ${sk.i + 1} missed: back to it` : `Marker pole ${Math.min(n, up.next + 1)}/${n} · ${cp ? fmtDist(Math.hypot(cp.x - ctx.x, cp.z - ctx.z)) : ''}`;
      const hint = state.slipping ? 'Too steep: the skins slip! Zig-zag across the slope' : state.steepHint ? 'Steep: zig-zag, Space for a kick turn' : null;
      return { done: up.next > last, progress: Math.min(1, (up.next ? up.cps[up.next - 1].s : 0) / UP_LEN), text, target: cp ? { x: cp.x, z: cp.z, r: SPLIT.up.radius, style: sk ? 'hazard' : 'plain' } : null, hint };
    }
  };
}
function downObjective([id, title, toS]) {
  const last = GATES.reduce((k, c, i) => (c.s <= toS + 1 ? i : k), 0);
  return {
    id,
    title,
    allowModes: ['person'],
    check(ctx, state) {
      const d = state.down, g = d.gates[d.next], n = d.gates.length;
      const text = `Gate ${Math.min(n, d.next + 1)}/${n}${d.missed ? ` · ${d.missed} missed (+${(d.missed * SPLIT.down.missMs) / 1000} s)` : ''}`;
      const lastEv = state.lastGate;
      const hint = lastEv && !lastEv.pass && ctx.t - lastEv.t < 2500 ? `Gate missed: +${SPLIT.down.missMs / 1000} s` : null;
      return { done: d.next > last, progress: d.next / n, text, target: g ? { x: g.x, z: g.z, r: g.half, style: 'plain' } : null, hint };
    }
  };
}

export const SPLITBOARD_MISSION = {
  id: ID,
  title: 'Splitboard tour on the Chörbschhorn',
  intro: 'A clear winter day on the Strelapass, the Schatzalp below you and the Chörbschhorn (2650 m) at the end of the ridge to the south-west. First check your avalanche transceiver: hold Space until it beeps. Then on skins, the board split in two, past the Hauptertälli and up the ridge: from marker pole to marker pole, any line you like. W walks, A/D turns. The skins hold on moderate slopes; straight up a steep one they slip and you slide back, so zig-zag across it, and press Space for a kick turn onto the other diagonal. On the summit hold Space to pull the skins and join the board. Then ride down the south ridge, past the Chörbschhornhütte, through the red flags to the Stafelalp above Frauenkirch: A/D carve, W tuck, S brake. A missed gate costs 8 s.',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['splitboard'],
  props: [],
  colour: '#e2553a',
  icon: 'splitboard',
  pin: { x: SPLIT_PLACES.start.x, z: SPLIT_PLACES.start.z },
  // (the bots of tests/missions-splitboard.test.mjs: up in ~21:30 at ~10 km/h on the level, on the diagonal where it gets
  // steep, the transition 5 s, down in ~2:50 at 15 m/s at most: ~24:25; a player cutting the corners at the poles, and
  // letting the board run, is quicker)
  bonusMs: 1440000,
  medals: { gold: 1440000, silver: 1680000, bronze: 2100000 },
  timeLimitMs: SPLIT.timeLimitMs,
  finish: 'At the Stafelalp, a long line down from the Chörbschhorn behind you, and the Berghaus has a table in the sun.',
  get start() {
    const a = pointAt(ASCENT_ROUTE, 0), b = pointAt(ASCENT_ROUTE, 25);
    return { x: a.x, z: a.z, heading: Math.atan2(b.x - a.x, b.z - a.z) };
  },
  createState() {
    return {
      lvs: 0, beeped: false,
      up: { cps: ascentPoles(), next: 0, skipped: null },
      trans: createTransition(),
      down: { gates: descentGates(), next: 0, passed: 0, missed: 0, penaltyMs: 0, results: GATES.map(() => null) },
      penaltyMs: 0, prev: null, lastGate: null, slipping: false, steepHint: false, kicks: 0, slipT: 0, topSpeed: 0
    };
  },
  update(ctx, state) {
    if (ctx.mode !== 'person') { state.prev = null; return; }
    if (state.beeped && !state.trans.done) updateCheckpoints(state.up, ctx.x, ctx.z, SPLIT.up.radius);
    if (state.trans.done) {
      const p = state.prev;
      if (p && Math.hypot(ctx.x - p.x, ctx.z - p.z) < 60) {
        const ev = updateGates(state.down, p.x, p.z, ctx.x, ctx.z);
        if (ev.length) state.lastGate = { ...ev[ev.length - 1], t: ctx.t };
        state.penaltyMs = state.down.penaltyMs;
      }
      state.prev = { x: ctx.x, z: ctx.z };
    }
  },
  summary(state) {
    const d = state.down;
    return [
      `${state.kicks} kick turn${state.kicks === 1 ? '' : 's'} · ${Math.round(state.slipT)} s slipping`,
      `${d.passed} of ${d.gates.length} gates · ${d.missed} missed${d.missed ? ` (+${(d.missed * SPLIT.down.missMs) / 1000} s)` : ''} · top speed ${Math.round(state.topSpeed * 3.6)} km/h`
    ];
  },
  objectives: [
    {
      id: 'transceiver',
      title: 'Check your avalanche transceiver',
      allowModes: ['person'],
      check(ctx, state) {
        return { done: state.beeped, progress: state.lvs / SPLIT.transceiver, text: state.lvs > 0 ? 'Checking …' : 'Hold Space: transceiver on, sending', target: null, hint: null };
      }
    },
    ...UP_PARTS.map(upObjective),
    {
      id: 'transition',
      title: 'Transition: skins off, board together',
      allowModes: ['person'],
      check(ctx, state) {
        const tr = state.trans, st = SPLIT.transition[Math.min(tr.step, SPLIT.transition.length - 1)];
        return { done: tr.done, progress: transitionShare(tr), text: tr.done ? 'Ready to ride' : `${st.label} (${tr.step + 1}/${SPLIT.transition.length})`, target: null, hint: 'Hold Space' };
      }
    },
    ...DOWN_PARTS.map(downObjective)
  ]
};

export const SPLITBOARD_MISSIONS = [SPLITBOARD_MISSION];
