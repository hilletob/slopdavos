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
//   0. the partner, Reto, on the whole tour: in your track behind you (your track as breadcrumbs, he follows along it), 4 m
//      back, 11 m where the slope reaches 30° (the spacing that takes the load off the snowpack), beside you at the
//      transition, 24 m behind on the way down; too far back (80 m) and you wait for him. He is not counted at the gates.
//   1. the group check of the transceivers: hold Space while his, on search, finds yours sending; then the other way round.
//   2. the ascent on skins, the board split into two skis: from marker pole to marker pole (any line between them). The skins
//      hold up to a slope (`grip`) at full pace, less and less above it, not at all past `slip` (you slide back). On the
//      gentle ground you walk at `flat` m/s; the steeper it gets, the more the pace is the climb (`climb` m of height a
//      second at most): so straight up a steep face is slow or impossible, and a zig-zag across it, at the slope the skins
//      still hold, is the quickest way up. On steep ground the turn is slow (the skis cross the fall line); a kick turn (Space)
//      turns you round onto the other diagonal in a second.
//   3. the transition on the summit: hold Space through the six steps (the skins off, one half after the other: peeled from
//      the tail, folded glue to glue, stowed; the halves slid together, the hooks in; the clips closed; the bindings across
//      onto the pucks, the pins in; stepped in, the straps closed). Let go and the step's progress runs back.
//   4. the descent on the board (js/missions-data-snow.js stepRider, BOARD_PARAMS): through the gates of red flags in order;
//      one missed costs 8 s (there is no walking back up in deep snow).
//   Avalanches: never on the marked line (the tests ride it). Off it, in a slope of 35° and more (the steepest slope at the
//   spot), and on the board only when crossing such a slope, the load builds; the HUD warns, and after ~3 s the slab goes:
//   its crown above you, the powder cloud, Reto buried 55 m down the fall line. Then the rescue: the transceiver on search
//   (the signal from 50 m: the arrow and the distance), the fine search under 3 m, the probe (hold Space), the shovel
//   (hold Space), +30 s. A second avalanche ends the tour.
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
    flat: 5.5, // m/s on the level, ~20 km/h: quicker than life, the tour is long (downhill they run: `glide`)
    climb: 2.2, // m of height a second at most (the legs: on skins at `grip` the pace holds them under it)
    grip: 19 * DEG, // the skins hold at full pace up to this slope along the skis
    slip: 29 * DEG, // and not at all from this one: you slide back
    slideBack: 1.6, // m/s back down at most
    back: 0.9, // m/s, a step back (S)
    turn: 1.5, // rad/s on easy ground
    steepTurn: 0.45, // rad/s where the slope (the fall line) is steeper than `steep`
    steep: 22 * DEG,
    kick: 0.9, // s a kick turn takes
    stride: 1.25, // m a stride (the poles and the bob)
    // downhill the skis run on their skins: gravity against the skins' drag (a friction share, and more with the speed), so
    // they run from about 6° on, ~28 km/h at 10°, ~44 km/h at 15°, and no faster than `max` (the board in ride mode: far more)
    glide: { mu: 0.1, drag: 0.012, max: 13 }
  },
  up: { spacing: 120, first: 70, radius: 22 }, // the marker poles
  down: { spacing: 135, first: 90, half: 22, reach: 90, missMs: 8000 }, // the gates of flags
  // the group check at the start: first Reto's transceiver on search finds yours sending, then the other way round
  groupCheck: [
    { id: 'send', label: 'Send check: Reto searches, you send', hold: 1.3 },
    { id: 'receive', label: 'Receive check: you search, Reto sends', hold: 1.3 }
  ],
  // the touring partner: in your track behind you, the whole tour
  partner: {
    name: 'Reto',
    gap: 4, // m behind you in the track on easy ground
    steepGap: 11, // m apart where the slope reaches `steepFrom` (the spacing that takes the load off the snowpack)
    steepFrom: 30 * DEG,
    downGap: 24, // m behind you on the way down, one at a time
    upSpeed: 6.2, downSpeed: 24, // m/s at most (a little quicker than you: he catches up)
    beside: 2.4, // m beside you at the transition
    waitAt: 80 // m behind: wait for him
  },
  // avalanches: only off the marked line in very steep ground (the marked line keeps out of it, as a sound choice of route does)
  avalanche: {
    steep: 35 * DEG, // the steepest slope at the spot from which a slab can go
    offUp: 55, offDown: 50, // m from the marked line (up, down) from which it counts as off it
    load: 3.2, // s of load in such a slope before it goes
    decay: 0.5, // of the load a second, back on safe ground
    traverse: 45 * DEG // on the board: across the slope (the way off the fall line) from this
  },
  rescue: {
    range: 50, // m: the transceiver's reach
    fine: 3, // m: the fine search
    probe: 1.5, dig: 3, // s held: the probe's hit, the shovelling
    burial: 55, // m down the fall line from where he was caught
    penaltyMs: 30000
  },
  // the transition on the summit (js/missions-splitboard.js poseBoard shows each step as it is held): each skin peeled from
  // the tail to the tip, folded glue to glue and into the jacket; the halves slid together under the hooks; the clips
  // closed; the bindings across the board onto the pucks, the pins in; stepped in, the straps closed
  transition: [
    { id: 'skin1', label: 'Skin off the first half', hold: 1.3 },
    { id: 'skin2', label: 'Skin off the second half', hold: 1.3 },
    { id: 'join', label: 'Halves together, hooks in', hold: 1.0 },
    { id: 'clips', label: 'Close the clips', hold: 0.6 },
    { id: 'bind', label: 'Bindings across, pins in', hold: 1.0 },
    { id: 'strap', label: 'Step in, straps tight', hold: 0.8 }
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

/** The skins' run downhill: the acceleration along the skis (m/s²) at a slope `theta` along them (rad, + uphill) and `v` */
export function glideAccel(theta, v, S = SPLIT.skin) {
  const G = S.glide;
  return -9.81 * Math.sin(theta) - G.mu * 9.81 * Math.cos(theta) - G.drag * v * v;
}
/** The speed the skins run at in the end, `theta` downhill along them (rad, + downhill): 0 where they don't run */
export function glideSpeed(theta, S = SPLIT.skin) {
  const a = glideAccel(-theta, 0, S);
  return a <= 0 ? 0 : Math.min(S.glide.max, Math.sqrt(a / S.glide.drag));
}

/** A kick turn: the heading mirrored about the fall line (onto the other diagonal; straight up: onto one of 40°) */
export function kickTurnHeading(heading, up) {
  const d = wrapPi(heading - up);
  if (Math.abs(d) < 0.7) return up - (d >= 0 ? 1 : -1) * 0.7;
  return up - d;
}

// --- The skinner -------------------------------------------------------------------------------------------------------
export function createSkinner(x, z, heading, height) {
  return { x, z, y: height(x, z), heading, speed: 0, kickT: 0, kickFrom: 0, kickTo: 0, kicks: 0, slipping: false, gliding: false, slipT: 0, stride: 0, theta: 0, slope: 0, moved: 0 };
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
    s.gliding = false;
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
  const walk = s.speed + clamp(target - s.speed, -5 * dt, 3.5 * dt);
  // downhill (or still running from it) the skis glide quicker than the legs go: gravity carries them, the skins brake, and
  // on the flat or the next rise the run dies away into the stride again (S, a step back, stops it; at the stride's pace on
  // ground where they don't run, letting go of W stops you as it always did)
  const run = back > 0 || s.speed < 0 ? -Infinity : Math.min(S.glide.max, s.speed + glideAccel(theta, s.speed, S) * dt);
  s.gliding = run > target && run > walk && (s.speed > S.flat || glideAccel(theta, 0, S) > 0);
  s.speed = s.gliding ? run : walk;
  const step = s.speed * dt;
  s.x += Math.sin(s.heading) * step;
  s.z += Math.cos(s.heading) * step;
  s.y = height(s.x, s.z);
  if (!s.gliding) s.stride += Math.abs(step) / S.stride;
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

// --- The track and the partner ---------------------------------------------------------------------------------------
/** Your track: a point every `step` m (and one behind the start, where the partner stands for the group check) */
export function createTrail(x, z, heading, step = 1.5) {
  const bx = x - Math.sin(heading) * 3.5, bz = z - Math.cos(heading) * 3.5;
  return { xs: [bx, x], zs: [bz, z], cum: [0, 3.5], step };
}
export function addToTrail(t, x, z) {
  const n = t.xs.length - 1, d = Math.hypot(x - t.xs[n], z - t.zs[n]);
  if (d < t.step) return false;
  t.xs.push(x); t.zs.push(z); t.cum.push(t.cum[n] + d);
  return true;
}
/** How far along the track (x, z) is: its end plus the bit from its last point */
export const trailEnd = (t, x, z) => { const n = t.xs.length - 1; return t.cum[n] + Math.hypot(x - t.xs[n], z - t.zs[n]); };
/** The point at `s` m along the track and its heading */
export function trailPoint(t, s, out = {}) {
  const c = t.cum, n = c.length - 1;
  if (s >= c[n]) { out.x = t.xs[n]; out.z = t.zs[n]; out.heading = Math.atan2(t.xs[n] - t.xs[n - 1], t.zs[n] - t.zs[n - 1]); return out; }
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const f = Math.max(0, (s - c[lo]) / ((c[hi] - c[lo]) || 1));
  out.x = t.xs[lo] + (t.xs[hi] - t.xs[lo]) * f; out.z = t.zs[lo] + (t.zs[hi] - t.zs[lo]) * f;
  out.heading = Math.atan2(t.xs[hi] - t.xs[lo], t.zs[hi] - t.zs[lo]);
  return out;
}
export const createPartner = () => ({ s: 0, x: 0, z: 0, heading: 0, speed: 0, gap: SPLIT.partner.gap, spaced: false, behind: 0, stride: 0, buried: false });
/**
 * The partner one step along your track: as far behind you as the ground asks (`gap`; `steepGap` where it is steep, at his
 * spot or yours, on the way up; `downGap` on the way down; beside you at the transition), never quicker than he can go.
 * stage: 'up' | 'trans' | 'down'; lead: where you are along the track (trailEnd)
 */
export function stepPartner(p, t, lead, dt, height, stage, P = SPLIT.partner) {
  if (p.buried) return p;
  const here = trailPoint(t, p.s, p);
  const steep = stage === 'up' && Math.max(slopeAt(height, here.x, here.z, _s).slope, slopeAt(height, t.xs[t.xs.length - 1], t.zs[t.zs.length - 1], _s).slope) >= P.steepFrom;
  p.spaced = steep;
  p.gap = stage === 'down' ? P.downGap : stage === 'trans' ? P.beside : steep ? P.steepGap : P.gap;
  // (on skins downhill he runs on them as you do)
  const vmax = stage === 'down' ? P.downSpeed : Math.max(P.upSpeed, 1.15 * glideSpeed(-slopeAlong(slopeAt(height, here.x, here.z, _s), here.heading)));
  const target = Math.max(0, lead - p.gap);
  const want = clamp((target - p.s) * 1.2, 0, vmax);
  p.speed += clamp(want - p.speed, -6 * dt, 4 * dt);
  p.s = Math.min(target + 0.5, p.s + p.speed * dt);
  trailPoint(t, p.s, p);
  p.stride += (p.speed * dt) / SPLIT.skin.stride;
  p.behind = lead - p.s;
  return p;
}

// --- Avalanches and the rescue ----------------------------------------------------------------------------------------
/** The distance from (x, z) to a flat polyline [x0, z0, x1, z1, …] */
export function lineOffset(pts, x, z) {
  let best = Infinity;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], dx = pts[i] - ax, dz = pts[i + 1] - az, L2 = dx * dx + dz * dz || 1;
    const f = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    best = Math.min(best, Math.hypot(ax + dx * f - x, az + dz * f - z));
  }
  return best;
}
export const createRisk = () => ({ load: 0, exposed: false, releases: 0 });
/**
 * The load on the snowpack under you: it builds where the slope reaches `steep` and you are off the marked line (on the way
 * down: only when crossing such a slope, not riding its fall line), and goes again on safe ground. Returns true on the step
 * the slab goes. at: { slope (rad, the steepest at the spot), off (m from the line), down (bool), travel (heading), up (heading uphill) }
 */
export function stepRisk(r, at, dt, A = SPLIT.avalanche) {
  const across = at.down ? Math.abs(Math.sin(wrapPi(at.travel - at.up))) >= Math.sin(A.traverse) : true;
  r.exposed = at.slope >= A.steep && at.off > (at.down ? A.offDown : A.offUp) && across;
  r.load = r.exposed ? r.load + dt / A.load : Math.max(0, r.load - A.decay * dt);
  if (r.load < 1) return false;
  r.load = 0; r.releases++;
  return true;
}
/** Where the snow buries him: `burial` m down the fall line from (x, z), in 5 m steps (less where it flattens out) */
export function burialSpot(height, x, z, len = SPLIT.rescue.burial) {
  let px = x, pz = z;
  for (let d = 0; d < len; d += 5) {
    const sl = slopeAt(height, px, pz, _s);
    if (sl.slope < 8 * DEG && d > 20) break;
    px -= Math.sin(sl.up) * 5; pz -= Math.cos(sl.up) * 5;
  }
  return { x: px, z: pz };
}
/** The transceiver on search: { mode: 'none' | 'coarse' | 'fine', dist (m), arrow (rad, + left of where you look) } */
export function searchView(x, z, heading, bx, bz, R = SPLIT.rescue) {
  const dist = Math.hypot(bx - x, bz - z);
  if (dist > R.range) return { mode: 'none', dist, arrow: 0 };
  return { mode: dist <= R.fine ? 'fine' : 'coarse', dist, arrow: wrapPi(Math.atan2(bx - x, bz - z) - heading) };
}
/** The rescue: { x, z (where he lies), stage: 'search' | 'probe' | 'dig' | 'out', t (s held) } */
export const createRescue = (x, z) => ({ x, z, stage: 'search', t: 0, startedAt: null });
/** One step of the rescue at (px, pz), Space held or not; returns the stage just finished, or null */
export function stepRescue(rs, px, pz, holding, dt, R = SPLIT.rescue) {
  if (rs.stage === 'out') return null;
  const near = Math.hypot(rs.x - px, rs.z - pz) <= R.fine;
  if (rs.stage === 'search') { if (near) { rs.stage = 'probe'; rs.t = 0; return 'search'; } return null; }
  if (!near) { rs.t = Math.max(0, rs.t - 2 * dt); return null; }
  rs.t = holding ? rs.t + dt : Math.max(0, rs.t - dt);
  if (rs.stage === 'probe' && rs.t >= R.probe) { rs.stage = 'dig'; rs.t = 0; return 'probe'; }
  if (rs.stage === 'dig' && rs.t >= R.dig) { rs.stage = 'out'; rs.t = 0; return 'dig'; }
  return null;
}

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

const RETO = SPLIT.partner.name;
/** The views that come before any step's own: the mission failed, the rescue under way */
function override(ctx, state) {
  if (state.failed) return { done: false, fail: state.failed, text: '', progress: null, target: null, hint: null };
  const rs = state.rescue;
  if (!rs || rs.stage === 'out') return null;
  const d = Math.hypot(rs.x - ctx.x, rs.z - ctx.z), R = SPLIT.rescue;
  const text = rs.stage === 'search'
    ? (d > R.range ? `${RETO} is buried! Search: no signal yet, go down the avalanche` : `${RETO} is buried! Signal: ${d.toFixed(1)} m`)
    : rs.stage === 'probe' ? 'Fine search: probe (hold Space)' : 'Probe hit: dig him out (hold Space)';
  const hint = rs.stage === 'search' ? (d > R.range ? 'Transceiver on search: down the fall line in strips' : d > 10 ? 'Coarse search: follow the arrow' : 'Close: slow down, fine search') : null;
  return { done: false, progress: rs.stage === 'search' ? null : rs.t / (rs.stage === 'probe' ? R.probe : R.dig), text, target: null, hint };
}
/** The partner's line in the HUD (way behind; keeping his spacing; the warning before a slab) */
function partnerHint(state) {
  if (state.risk?.exposed) return 'Steep slope above 35°: avalanche danger – back to the track';
  if (state.retoBehind > SPLIT.partner.waitAt) return `Wait for ${RETO}: ${Math.round(state.retoBehind)} m behind`;
  if (state.retoSpaced) return `Over 30°: ${RETO} keeps 10 m spacing behind you`;
  return null;
}

function upObjective([id, title, toS]) {
  const last = POLES.reduce((k, c, i) => (c.s <= toS + 1 ? i : k), 0);
  return {
    id,
    title,
    allowModes: ['person'],
    check(ctx, state) {
      const o = override(ctx, state);
      if (o) return o;
      if (ctx.t > SPLIT.timeLimitMs) return { done: false, fail: 'The sun has turned the snow to mush: too late for the descent today.', text: '', progress: null, target: null };
      const up = state.up, cp = up.cps[up.next], n = up.cps.length, sk = up.skipped != null ? up.cps[up.skipped] : null;
      const text = sk ? `Marker pole ${sk.i + 1} missed: back to it` : `Marker pole ${Math.min(n, up.next + 1)}/${n} · ${cp ? fmtDist(Math.hypot(cp.x - ctx.x, cp.z - ctx.z)) : ''}`;
      const hint = partnerHint(state) || (state.slipping ? 'Too steep: the skins slip! Zig-zag across the slope' : state.steepHint ? 'Steep: zig-zag, Space for a kick turn' : null);
      return { done: up.next > last, progress: Math.min(1, (up.next ? up.cps[up.next - 1].s : 0) / UP_LEN), text, target: cp ? { x: cp.x, z: cp.z, r: SPLIT.up.radius, style: sk ? 'hazard' : 'plain' } : null, hint };
    }
  };
}
function downObjective([id, title, toS]) {
  const last = GATES.reduce((k, c, i) => (c.s <= toS + 1 ? i : k), 0);
  const end = toS === Infinity;
  return {
    id,
    title,
    allowModes: ['person'],
    check(ctx, state) {
      const o = override(ctx, state);
      if (o) return o;
      const d = state.down, g = d.gates[d.next], n = d.gates.length;
      // (at the Stafelalp: together, or it isn't done)
      if (end && d.next > last && state.retoBehind > SPLIT.partner.downGap + 12) return { done: false, progress: 1, text: `Wait for ${RETO}`, target: null, hint: `${RETO}: ${Math.round(state.retoBehind)} m behind` };
      const text = `Gate ${Math.min(n, d.next + 1)}/${n}${d.missed ? ` · ${d.missed} missed (+${(d.missed * SPLIT.down.missMs) / 1000} s)` : ''}`;
      const lastEv = state.lastGate;
      const hint = (lastEv && !lastEv.pass && ctx.t - lastEv.t < 2500 ? `Gate missed: +${SPLIT.down.missMs / 1000} s` : null) || partnerHint(state);
      return { done: d.next > last, progress: d.next / n, text, target: g ? { x: g.x, z: g.z, r: g.half, style: 'plain' } : null, hint };
    }
  };
}

export const SPLITBOARD_MISSION = {
  id: ID,
  title: 'Splitboard tour on the Chörbschhorn',
  intro: 'A clear winter day on the Strelapass, the Schatzalp below you and the Chörbschhorn (2650 m) at the end of the ridge to the south-west. You don\'t go alone: Reto comes with you, in your track. First the group check of the avalanche transceivers: hold Space while Reto\'s searches for yours, then while yours finds his. Then on skins, the board split in two, past the Hauptertälli and up the ridge: from marker pole to marker pole, any line you like. W walks, A/D turns. Where the track drops, the skins glide: you run downhill and pick up speed. The skins hold on moderate slopes; straight up a steep one they slip and you slide back, so zig-zag across it, and press Space for a kick turn onto the other diagonal. Where it gets steeper than 30° Reto keeps 10 m back. Stay near the marked line: off it, in slopes of 35° and more, the snowpack can go, and then you dig Reto out with your transceiver, probe and shovel. On the summit wait for him and hold Space to pull the skins and join the board. Then ride down the south ridge, past the Chörbschhornhütte, through the red flags to the Stafelalp above Frauenkirch: A/D carve, W tuck, S brake. A missed gate costs 8 s.',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['splitboard'],
  props: [],
  colour: '#e2553a',
  icon: 'splitboard',
  pin: { x: SPLIT_PLACES.start.x, z: SPLIT_PLACES.start.z },
  // (the bots of tests/missions-splitboard.test.mjs: up in ~10:00 at ~20 km/h on the level, running on the skins where it
  // goes down, on the diagonal where it gets steep, Reto in the track behind, the transition 6 s, down in ~2:50 at 15 m/s at
  // most: ~12:55; a player cutting the corners at the poles, and letting the board run, is quicker)
  bonusMs: 755000,
  medals: { gold: 755000, silver: 910000, bronze: 1155000 },
  timeLimitMs: SPLIT.timeLimitMs,
  finish: 'At the Stafelalp, a long line down from the Chörbschhorn behind you, and the Berghaus has a table in the sun.',
  get start() {
    const a = pointAt(ASCENT_ROUTE, 0), b = pointAt(ASCENT_ROUTE, 25);
    return { x: a.x, z: a.z, heading: Math.atan2(b.x - a.x, b.z - a.z) };
  },
  createState() {
    return {
      check: createTransition(),
      risk: createRisk(), rescue: null, rescues: 0, extraMs: 0, failed: null, retoBehind: 0, retoSpaced: false,
      up: { cps: ascentPoles(), next: 0, skipped: null },
      trans: createTransition(),
      down: { gates: descentGates(), next: 0, passed: 0, missed: 0, penaltyMs: 0, results: GATES.map(() => null) },
      penaltyMs: 0, prev: null, lastGate: null, slipping: false, steepHint: false, kicks: 0, slipT: 0, topSpeed: 0
    };
  },
  update(ctx, state) {
    if (ctx.mode !== 'person') { state.prev = null; return; }
    if (state.rescue && state.rescue.stage !== 'out') { state.prev = null; return; }
    if (state.check.done && !state.trans.done) updateCheckpoints(state.up, ctx.x, ctx.z, SPLIT.up.radius);
    if (state.trans.done) {
      const p = state.prev;
      if (p && Math.hypot(ctx.x - p.x, ctx.z - p.z) < 60) {
        const ev = updateGates(state.down, p.x, p.z, ctx.x, ctx.z);
        if (ev.length) state.lastGate = { ...ev[ev.length - 1], t: ctx.t };
        state.penaltyMs = state.down.penaltyMs + state.extraMs;
      }
      state.prev = { x: ctx.x, z: ctx.z };
    }
  },
  summary(state) {
    const d = state.down;
    return [
      `${state.kicks} kick turn${state.kicks === 1 ? '' : 's'} · ${Math.round(state.slipT)} s slipping${state.rescues ? ` · ${RETO} dug out of an avalanche (+${SPLIT.rescue.penaltyMs / 1000} s)` : ''}`,
      `${d.passed} of ${d.gates.length} gates · ${d.missed} missed${d.missed ? ` (+${(d.missed * SPLIT.down.missMs) / 1000} s)` : ''} · top speed ${Math.round(state.topSpeed * 3.6)} km/h`
    ];
  },
  objectives: [
    {
      id: 'transceiver',
      title: 'Group check: transceivers',
      allowModes: ['person'],
      check(ctx, state) {
        const c = state.check, st = SPLIT.groupCheck[Math.min(c.step, SPLIT.groupCheck.length - 1)];
        return { done: c.done, progress: transitionShare(c, SPLIT.groupCheck), text: `${st.label} (${c.step + 1}/${SPLIT.groupCheck.length})`, target: null, hint: 'Hold Space' };
      }
    },
    ...UP_PARTS.map(upObjective),
    {
      id: 'transition',
      title: 'Transition: skins off, board together',
      allowModes: ['person'],
      check(ctx, state) {
        const o = override(ctx, state);
        if (o) return o;
        const tr = state.trans, st = SPLIT.transition[Math.min(tr.step, SPLIT.transition.length - 1)];
        const wait = state.retoBehind > SPLIT.partner.beside + 8;
        return { done: tr.done, progress: transitionShare(tr), text: tr.done ? 'Ready to ride' : `${st.label} (${tr.step + 1}/${SPLIT.transition.length})`, target: null, hint: wait ? `Wait for ${RETO}: ${Math.round(state.retoBehind)} m behind` : 'Hold Space' };
      }
    },
    ...DOWN_PARTS.map(downObjective)
  ]
};

export const SPLITBOARD_MISSIONS = [SPLITBOARD_MISSION];
