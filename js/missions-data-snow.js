import { SKI_PISTES } from './ski-pistes-data.js';

// js/missions-data-snow.js
// The mountain missions (js/missions-data.js lists them; js/missions-snow.js has their runtime: the skis, the board, the
// mountain bike, the gates, the kicker and the checkpoints in the world): their definitions and the pure logic behind
// them, three.js-free like js/missions-data.js (tests/missions-snow.test.mjs drives it with synthetic frames).
//   - ski-slalom: down the Davos Vertical (Jakobshorn, OSM w1202616660) on skis through 24 red and blue gates; a missed
//     gate costs 3 s, the fourth one disqualifies.
//   - big-air: three jumps over the kicker in the JatzPark (beside the Jatz Junior T-bar) on a snowboard, judged by the
//     points of the tricks (rotation, flip, grab, amplitude, landing): a scoreMode mission (js/missions-progress.js).
//   - mtb-race: down the Chüggelibahn and the Bolgen Trail from the Ischalp to Bolgen Plaza on the bike, through the
//     checkpoints in order (a shortcut misses one: back to it); a crash costs 5 s.
//
// The rider (stepRider): a point on the snow with a velocity and the direction of the skis or the board (`heading`, the
// controllers' convention: 0 along +z, π/2 along +x; turning left raises it). On the snow the velocity stays in the
// slope's plane: gravity along the slope, snow friction and air drag (less in a tuck), and the edges: the skis turn
// the rider at most as tight as their sidecut and the grip allow (the lateral acceleration capped), the velocity's
// sideways part is carved away into the direction of the skis (a skid loses some of it). Braking puts the skis across
// (a hockey stop). Where the snow falls away faster than the rider (the kicker's lip, a knoll) the rider flies: gravity
// only, and the board turns (spin), flips and is grabbed in the air; the landing is judged by how far the board is
// from the direction of travel (switch counts) and from upright.

export const SNOW_GRAVITY = 9.81;
const TAU = Math.PI * 2;
const wrapPi = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };

// --- Rider physics ---------------------------------------------------------------------------------------------------
export const SKI_PARAMS = {
  kind: 'ski',
  mu: 0.05, // snow friction
  drag: 0.0046, tuckDrag: 0.0028, // air drag per m (a v² term): ~28 m/s on the Davos Vertical's 23° in a tuck
  maxSpeed: 31, // m/s (~110 km/h)
  turnRate: 2.4, // rad/s at most (a tight short swing at low speed)
  maxLatG: 1.9, // the lateral acceleration the edges hold, in g (beyond it: the turn is as tight as that)
  grip: 14, // 1/s: how fast the sideways part of the velocity is carved away
  carveKeep: 0.72, // of the carved-away sideways speed, what goes into the direction of the skis
  brake: 6.5, // m/s² with the skis across (S)
  push: 2.4, pushSpeed: 5, // poling / skating with W when slow
  spinRate: 4.5, flipRate: 4, // rad/s in the air
  airLift: 0.03 // m: the snow this far below the rider's path: airborne
};

export const BOARD_PARAMS = {
  ...SKI_PARAMS,
  kind: 'board',
  mu: 0.055,
  drag: 0.0048, tuckDrag: 0.0034,
  maxSpeed: 26,
  turnRate: 2.1,
  maxLatG: 1.6,
  grip: 11,
  carveKeep: 0.68,
  brake: 6,
  push: 1.6, pushSpeed: 4,
  spinRate: 6.2, flipRate: 4.6
};

/** A rider at rest at (x, y, z), its skis or board pointing along `heading` */
export function createRider(x, y, z, heading = 0) {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, heading, airborne: false,
    lean: 0, edge: 0, brake: 0, tuck: 0, omega: 0,
    // in the air: the board's rotation about the vertical (spin, rad, signed: + to the left) and about its own
    // lateral axis (flip, rad, + forwards); the grab's time; the time in the air and the highest point over the snow
    air: null,
    landing: null, // the last landing { quality, yawError, flipError, impact, ... } (stepRider sets it, the caller takes it)
    crashT: 0 // s: down after a crash, no control
  };
}

const _n = { x: 0, y: 1, z: 0 };
/** The snow's normal at (x, z) from a height function (central differences) */
export function surfaceNormal(height, x, z, out = { x: 0, y: 1, z: 0 }, e = 0.4) {
  const hx = (height(x + e, z) - height(x - e, z)) / (2 * e);
  const hz = (height(x, z + e) - height(x, z - e)) / (2 * e);
  const L = Math.hypot(hx, 1, hz);
  out.x = -hx / L; out.y = 1 / L; out.z = -hz / L;
  return out;
}

/** The snow's normal under a rider moving along (dx, dz): the slope along the way taken from behind (so that a lip
 *  is the ramp up to its edge, not the drop beyond it), across it from both sides */
export function trackNormal(height, x, z, dx, dz, out = { x: 0, y: 1, z: 0 }, e = 0.3) {
  const L = Math.hypot(dx, dz);
  if (L < 1e-6) return surfaceNormal(height, x, z, out, e);
  const ax = dx / L, az = dz / L;
  const h0 = height(x, z);
  const sa = (h0 - height(x - ax * e, z - az * e)) / e;
  const sb = (height(x + az * e, z - ax * e) - height(x - az * e, z + ax * e)) / (2 * e);
  const gx = sa * ax + sb * az, gz = sa * az - sb * ax;
  const n = Math.hypot(gx, 1, gz);
  out.x = -gx / n; out.y = 1 / n; out.z = -gz / n;
  return out;
}

export const riderSpeed = (r) => Math.hypot(r.vx, r.vy, r.vz);
export const travelHeading = (r, fallback = r.heading) => (Math.hypot(r.vx, r.vz) > 0.3 ? Math.atan2(r.vx, r.vz) : fallback);

/**
 * One step of the rider (dt <= ~1/60 s; js/missions-snow.js steps at 1/120). `input`: { steer (-1..1, + left), tuck
 * (0..1, W), brake (0..1, S), spin (-1..1, + left), flip (-1..1, + forwards), grab (bool) }; `height(x, z)`: the snow.
 * Returns the landing when this step landed (r.landing), else null.
 */
export function stepRider(r, input, dt, height, P = SKI_PARAMS) {
  const g = SNOW_GRAVITY;
  r.landing = null;
  if (r.crashT > 0) {
    r.crashT = Math.max(0, r.crashT - dt);
    input = { steer: 0, tuck: 0, brake: 1, spin: 0, flip: 0, grab: false };
  }
  if (r.airborne) {
    const a = r.air;
    r.vy -= g * dt;
    const sp = riderSpeed(r), k = 1 / (1 + P.drag * 0.6 * sp * dt);
    r.vx *= k; r.vy *= k; r.vz *= k;
    r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
    a.time += dt;
    const spinIn = Math.max(-1, Math.min(1, input.spin || 0)), flipIn = Math.max(-1, Math.min(1, input.flip || 0));
    // (the rotation builds up quickly and runs on a little after the key is let go: ~40° more at full spin)
    a.spinRate += (spinIn * P.spinRate - a.spinRate) * Math.min(1, dt * (spinIn ? 7 : 9));
    a.flipRate += (flipIn * P.flipRate - a.flipRate) * Math.min(1, dt * (flipIn ? 7 : 9));
    a.spin += a.spinRate * dt;
    a.flip += a.flipRate * dt;
    r.heading += a.spinRate * dt;
    if (input.grab) a.grab += dt;
    const ground = height(r.x, r.z);
    a.peak = Math.max(a.peak, r.y - ground);
    if (r.y <= ground) land(r, ground, height, P);
    return r.landing;
  }

  // On the snow
  const n = Math.hypot(r.vx, r.vz) > 0.5 ? trackNormal(height, r.x, r.z, r.vx, r.vz, _n) : surfaceNormal(height, r.x, r.z, _n);
  // (the velocity as it came, along the snow it was on: what the rider carries off a lip)
  const pvx = r.vx, pvy = r.vy - g * dt, pvz = r.vz;
  // the velocity in the slope's plane
  let vn = r.vx * n.x + r.vy * n.y + r.vz * n.z;
  r.vx -= vn * n.x; r.vy -= vn * n.y; r.vz -= vn * n.z;
  // gravity along the slope
  r.vx += g * n.y * n.x * dt; r.vy += (-g + g * n.y * n.y) * dt; r.vz += g * n.y * n.z * dt;
  let speed = riderSpeed(r);
  // steering: the turn as tight as the edges hold (at speed) or a pivot (slow)
  const steer = Math.max(-1, Math.min(1, input.steer || 0));
  const brake = Math.max(0, Math.min(1, input.brake || 0));
  const tuck = Math.max(0, Math.min(1, input.tuck || 0));
  const maxOmega = Math.min(P.turnRate, Math.max(P.turnRate * 0.55, (P.maxLatG * g) / Math.max(0.5, speed)));
  r.omega = steer * maxOmega;
  r.heading += r.omega * dt;
  // the direction of the skis in the slope's plane
  const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
  const fy = -(n.x * fx + n.z * fz) / n.y;
  const fl = Math.hypot(fx, fy, fz);
  const dx = fx / fl, dy = fy / fl, dz = fz / fl;
  // forward or backward along them (a rider going backwards rides switch)
  let par = r.vx * dx + r.vy * dy + r.vz * dz;
  let lx = r.vx - par * dx, ly = r.vy - par * dy, lz = r.vz - par * dz;
  const lat = Math.hypot(lx, ly, lz);
  // braking: the skis across, the sideways part kept as a skid and a strong friction; else carving
  const grip = P.grip * (1 - 0.75 * brake);
  const keep = Math.exp(-grip * dt);
  const lost = lat * (1 - keep);
  lx *= keep; ly *= keep; lz *= keep;
  if (par >= 0) par += lost * P.carveKeep; else par -= lost * P.carveKeep;
  r.vx = par * dx + lx; r.vy = par * dy + ly; r.vz = par * dz + lz;
  // friction, drag, brake; poling when slow
  speed = riderSpeed(r);
  if (speed > 1e-6) {
    const decel = P.mu * g * n.y + (P.drag + (P.tuckDrag - P.drag) * tuck) * speed * speed + P.brake * brake;
    const s2 = Math.max(0, speed - decel * dt);
    const k = s2 / speed;
    r.vx *= k; r.vy *= k; r.vz *= k;
    speed = s2;
  }
  if (tuck > 0 && speed < P.pushSpeed && !brake) {
    const a = P.push * tuck * dt * (par >= -0.1 ? 1 : -1);
    r.vx += dx * a; r.vy += dy * a; r.vz += dz * a;
    speed = riderSpeed(r);
  }
  if (speed > P.maxSpeed) { const k = P.maxSpeed / speed; r.vx *= k; r.vy *= k; r.vz *= k; speed = P.maxSpeed; }
  // the lean into the turn (atan(a / g)), the edge angle, the stance
  const latAcc = r.omega * speed;
  r.lean += (Math.max(-1.1, Math.min(1.1, Math.atan(latAcc / g))) - r.lean) * Math.min(1, dt * 10);
  r.brake += (brake - r.brake) * Math.min(1, dt * 8);
  r.tuck += (tuck - r.tuck) * Math.min(1, dt * 6);
  // on along the slope; airborne where the snow falls away
  const y0 = r.y;
  r.x += r.vx * dt; r.z += r.vz * dt;
  const ground = height(r.x, r.z);
  const free = y0 + pvy * dt;
  if (free > ground + P.airLift && Math.hypot(pvx, pvy, pvz) > 2) {
    // the snow falls away faster than the rider: off the lip with the velocity it came with
    const k = speed / Math.max(1e-6, Math.hypot(pvx, pvy, pvz));
    r.vx = pvx * k; r.vy = pvy * k; r.vz = pvz * k;
    r.y = free;
    r.airborne = true;
    r.air = { time: 0, spin: 0, flip: 0, spinRate: 0, flipRate: 0, grab: 0, peak: 0, x: r.x, z: r.z, speed, heading: travelHeading(r) };
  } else {
    r.y = ground;
  }
  return null;
}

/** The landing's verdict: the board's yaw off the direction of travel (rad; `switchOk`: either end first) and how far
 *  it is from upright after the flips -> 'clean' | 'sketchy' | 'crash' */
export function judgeLanding(yawError, flipError) {
  const y = Math.abs(yawError), f = Math.abs(flipError);
  if (y <= 0.45 && f <= 0.5) return 'clean'; // ±26°, ±29°
  if (y <= 0.85 && f <= 0.85) return 'sketchy'; // ±49°
  return 'crash';
}

/** The yaw error of a board pointing along `heading` against the travel direction (`switchOk`: backwards counts too) */
export function yawError(heading, travel, switchOk = true) {
  const d = wrapPi(heading - travel);
  if (!switchOk) return d;
  return Math.abs(d) > Math.PI / 2 ? wrapPi(d - Math.PI) : d;
}

function land(r, ground, height, P) {
  const a = r.air;
  const n = surfaceNormal(height, r.x, r.z, _n);
  const vn = r.vx * n.x + r.vy * n.y + r.vz * n.z;
  r.vx -= vn * n.x; r.vy -= vn * n.y; r.vz -= vn * n.z;
  r.y = ground;
  r.airborne = false;
  const travel = travelHeading(r);
  const switchOk = P.kind === 'board';
  const yawErr = yawError(r.heading, travel, switchOk);
  const flipErr = wrapPi(a.flip);
  const quality = a.time < 0.25 ? 'clean' : judgeLanding(yawErr, flipErr);
  const switchLanding = switchOk && Math.abs(wrapPi(r.heading - travel)) > Math.PI / 2;
  if (quality === 'crash') {
    r.vx *= 0.25; r.vy *= 0.25; r.vz *= 0.25;
    r.crashT = 1.6;
  } else {
    // the board snaps into the direction of travel (or the other end first: riding switch)
    r.heading = switchLanding ? travel + Math.PI : travel;
    if (quality === 'sketchy') { r.vx *= 0.8; r.vy *= 0.8; r.vz *= 0.8; }
  }
  r.landing = { quality, yawError: yawErr, flipError: flipErr, impact: -vn, time: a.time, spin: a.spin, flip: a.flip, grab: a.grab, peak: a.peak, takeoff: { x: a.x, z: a.z, speed: a.speed, heading: a.heading }, switchLanding };
  r.air = null;
}

// --- Tricks ----------------------------------------------------------------------------------------------------------
const SPIN_NAMES = { 180: '180', 360: '360', 540: '540', 720: '720', 900: '900', 1080: '1080', 1260: '1260', 1440: '1440' };

/**
 * The points of a jump: { time (s in the air), spin (rad, signed), flip (rad, signed), grab (s held), quality, peak (m) }
 * -> { points, name, spinDeg, flips, grabbed, quality }. The rotation counts in whole halves (180°) and the flips in
 * whole turns; a crash scores nothing, a sketchy landing 60 %.
 */
export function scoreJump({ time = 0, spin = 0, flip = 0, grab = 0, quality = 'clean', peak = 0 }) {
  const spinDeg = Math.round(Math.abs(spin) / Math.PI) * 180;
  const flips = Math.round(Math.abs(flip) / TAU);
  const grabbed = grab >= 0.25;
  let points = (spinDeg / 180) * 12 + flips * 30;
  if (grabbed) points += 10 + Math.min(10, (grab - 0.25) * 12);
  points += Math.min(15, time * 5) + Math.min(5, peak);
  const factor = quality === 'clean' ? 1 : quality === 'sketchy' ? 0.6 : 0;
  points = Math.round(points * factor);
  const parts = [];
  if (flips) parts.push(`${flips > 1 ? `${flips}x ` : ''}${flip > 0 ? 'Front' : 'Back'}flip`);
  if (spinDeg) parts.push(`${spin > 0 ? 'Backside' : 'Frontside'} ${SPIN_NAMES[spinDeg] || spinDeg}`);
  if (grabbed) parts.push('Grab');
  const name = parts.length ? parts.join(' ') : 'Straight air';
  return { points, name, spinDeg, flips, grabbed, quality };
}

// --- Gates and checkpoints -------------------------------------------------------------------------------------------
/** The point and the unit tangent at arc length `s` along a flat polyline [x0, z0, x1, z1, ...] */
export function pointAt(pts, s) {
  let acc = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-9) continue;
    if (acc + L >= s || i === pts.length - 2) {
      const t = Math.max(0, Math.min(1, (s - acc) / L));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / L, tz: (bz - az) * 1 / L, s };
    }
    acc += L;
  }
  return { x: pts[0], z: pts[1], tx: 0, tz: 1, s: 0 };
}

export function lineLength(pts) {
  let L = 0;
  for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return L;
}

/** The smoothed direction of the polyline round arc length s (over ±span m): { tx, tz } */
function smoothTangent(pts, s, span = 15) {
  const a = pointAt(pts, Math.max(0, s - span)), b = pointAt(pts, s + span);
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { tx: (b.x - a.x) / L, tz: (b.z - a.z) / L };
}

/**
 * The slalom gates along a run: `count` gates from `from` m to `length - to` m, their centres alternately `offset` m
 * left and right of the run's line, `half` m from the centre to each pole. A gate: { i, x, z, tx, tz (the way
 * through), nx, nz (its left), half, colour ('red' | 'blue'), side (+1 left, -1 right), s }
 */
export function buildSlalomGates(pts, { count = 24, from = 45, to = 45, offset = 4, half = 3 } = {}) {
  const L = lineLength(pts);
  const gates = [];
  for (let i = 0; i < count; i++) {
    const s = from + ((L - from - to) * i) / Math.max(1, count - 1);
    const p = pointAt(pts, s);
    const { tx, tz } = smoothTangent(pts, s);
    const nx = tz, nz = -tx; // (the left of the direction of travel: heading + π/2 is the left in this frame)
    const side = i % 2 ? -1 : 1;
    gates.push({ i, x: p.x + nx * offset * side, z: p.z + nz * offset * side, tx, tz, nx, nz, half, colour: i % 2 ? 'blue' : 'red', side, s });
  }
  return gates;
}

/**
 * Whether the move a -> b crosses the line of the gate (its way through): null (not crossed, or far beside it: more
 * than `reach` m), else { pass: |offset| <= half + tolerance, offset (m, + left) }
 */
export function crossGate(gate, ax, az, bx, bz, { tolerance = 0.4, reach = 35 } = {}) {
  const d0 = (ax - gate.x) * gate.tx + (az - gate.z) * gate.tz;
  const d1 = (bx - gate.x) * gate.tx + (bz - gate.z) * gate.tz;
  if (!(d0 < 0 && d1 >= 0)) return null;
  const t = d0 / (d0 - d1);
  const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
  const offset = (px - gate.x) * gate.nx + (pz - gate.z) * gate.nz;
  if (Math.abs(offset) > reach) return null;
  return { pass: Math.abs(offset) <= gate.half + tolerance, offset };
}

/**
 * The slalom's bookkeeping for a move a -> b: the next gate (and any later one crossed meanwhile, the ones before it
 * missed) passed or missed. state: { gates, next, passed, missed, penaltyMs, results: ['pass' | 'miss' | null] }.
 * Returns the events [{ i, pass }]
 */
export function updateSlalom(state, ax, az, bx, bz, penaltyMs = 3000) {
  const events = [];
  for (let k = state.next; k < Math.min(state.gates.length, state.next + 3); k++) {
    const hit = crossGate(state.gates[k], ax, az, bx, bz);
    if (!hit) continue;
    // the gates skipped on the way: missed
    for (let j = state.next; j < k; j++) { state.results[j] = 'miss'; state.missed++; state.penaltyMs += penaltyMs; events.push({ i: j, pass: false }); }
    state.results[k] = hit.pass ? 'pass' : 'miss';
    if (hit.pass) state.passed++; else { state.missed++; state.penaltyMs += penaltyMs; }
    events.push({ i: k, pass: hit.pass });
    state.next = k + 1;
    break;
  }
  return events;
}

/** Checkpoints every ~`spacing` m along a polyline (the last one at its end): [{ i, x, z, tx, tz, s }] */
export function buildCheckpoints(pts, spacing = 110, first = 60) {
  const L = lineLength(pts);
  const n = Math.max(1, Math.round((L - first) / spacing));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const s = Math.min(L, first + ((L - first) * i) / n);
    const p = pointAt(pts, s);
    const { tx, tz } = smoothTangent(pts, s, 6);
    out.push({ i, x: p.x, z: p.z, tx, tz, s });
  }
  return out;
}

/**
 * The checkpoints in order: the next one within `radius` m is taken; standing at a later one (a shortcut) takes
 * nothing and reports the one missed. state: { cps, next, skipped (index | null) }. Returns 'next' | 'skipped' | null
 */
export function updateCheckpoints(state, x, z, radius = 8) {
  const cp = state.cps[state.next];
  if (!cp) return null;
  if (Math.hypot(cp.x - x, cp.z - z) <= radius) { state.next++; state.skipped = null; return 'next'; }
  for (let k = state.next + 1; k < state.cps.length; k++) {
    const c = state.cps[k];
    if (Math.hypot(c.x - x, c.z - z) <= radius) { state.skipped = state.next; return 'skipped'; }
  }
  return null;
}

// --- The places ------------------------------------------------------------------------------------------------------
// The Davos Vertical (OSM w1202616660): 987 m and 423 m of drop from below the Jakobshorn's Brämabüel side down to the
// Bolgen meadows, 22 m wide; the start house at its top (228.8, 2003.3), the finish at its foot (-445.5, 1356.5)
export const SLALOM_RUN_ID = 'w1202616660';
const SLALOM_FALLBACK = [228.8, 2003.3, 130, 1857.2, -428.8, 1363.1, -445.5, 1356.5];
export const slalomRun = (runs = SKI_PISTES.runs) => runs.find((r) => r.id === SLALOM_RUN_ID)?.pts || SLALOM_FALLBACK;
export const SLALOM_GATES = 24;
export const SLALOM_MISS_MS = 3000;
export const SLALOM_MAX_MISSES = 3;

// The JatzPark's big air (beside the Jatz Junior T-bar, below the Jatzhütte): the in-run from the top of the park
// down the fall line (~18° there) to the kicker; the kicker 3.6 m high, its lip 35° up from the slope; a table and the
// landing hill beyond it (js/missions-snow.js builds them and adds them to the snow's height: bigAirProfile)
export const BIG_AIR = {
  start: { x: 1646, z: 3107 },
  kicker: { x: 1572, z: 3118, heading: -1.42 }, // the foot of the kicker, its axis down the in-run
  kickerLength: 11.5, kickerHeight: 3.6, kickerWidth: 7,
  table: 9, landingDrop: 0.14, landingWidth: 22 // m of table past the lip; extra height lost per m past it; width
};
export const BIG_AIR_JUMPS = 3;

/**
 * The extra snow of the kicker, its table and the landing hill over the terrain at (x, z) (m, 0 elsewhere):
 * along the axis u (from the kicker's foot), across it v
 */
export function bigAirProfile(x, z, park = BIG_AIR) {
  const k = park.kicker;
  const ax = Math.sin(k.heading), az = Math.cos(k.heading);
  const dx = x - k.x, dz = z - k.z;
  const u = dx * ax + dz * az, v = dx * az - dz * ax;
  const L = park.kickerLength, H = park.kickerHeight;
  if (u < -2 || u > L + park.table + H / park.landingDrop + 4) return 0;
  const R = (L * L + H * H) / (2 * H); // the transition's radius through the foot and the lip
  const side = (half, edge) => { const a = Math.abs(v); return a <= half ? 1 : a >= half + edge ? 0 : 0.5 + 0.5 * Math.cos(((a - half) / edge) * Math.PI); };
  if (u <= L) {
    if (u < 0) return 0;
    const h = R - Math.sqrt(Math.max(0, R * R - u * u));
    return h * side(park.kickerWidth / 2, 1.5);
  }
  // the gap down to the table, then the table, then the landing falling away
  const tableH = H * 0.75;
  const w = side(park.landingWidth / 2, 4);
  if (u <= L + 1.5) return Math.max(tableH, H - (u - L) * 0.5) * Math.max(w, side(park.kickerWidth / 2, 1.5));
  if (u <= L + park.table) return tableH * w;
  return Math.max(0, tableH - (u - L - park.table) * park.landingDrop) * w;
}

/** Along the big air's axis: u of (x, z) from the kicker's foot (the lip at kickerLength) */
export function bigAirU(x, z, park = BIG_AIR) {
  const k = park.kicker;
  return (x - k.x) * Math.sin(k.heading) + (z - k.z) * Math.cos(k.heading);
}

// The trail: the Chüggelibahn (OSM w1424744532, w1427914213, w424165931) from the Ischalp middle station's meadow and
// the Bolgen Trail (w973018088) down to Bolgen Plaza, 2.75 km, ~390 m of drop, simplified to 1.2 m
// (tools/data/cache/osm_davos.json; the Ischalptrail above the Ischalp would be its upper part)
export const MTB_TRAIL = [
  270.2,924.2,278.3,917.2,278.8,912.9,268.6,909.4,256.4,910.8,251.7,908.5,252.9,903.4,261.7,899.7,262.9,896.6,253.7,
  894.4,250.1,895.9,245.5,901.4,242.8,901.8,240,899.5,243,887,249.4,882,258.1,881,259.5,879.2,258.3,876.3,247.7,874,
  236.1,880.8,228.2,882.5,227.3,880.4,229.6,876.6,235.4,871.5,241.4,869.7,243,866,239.2,865,223.1,869.3,219.9,867.3,
  219.7,862.4,231.1,855.6,237.2,855.3,237.5,852.9,232.4,849.9,208.4,845.8,220.7,836.9,230.5,834,229.7,831.5,225.5,
  830.2,211.3,832,208.1,829.9,207.8,821.6,212.8,816.7,207.2,812.1,207.6,809.7,215.8,806.8,229.7,809.6,233,808.3,228.8,
  803.6,216.5,798,215.2,793.5,219.6,792.8,234.3,800.7,240.2,799.9,239.4,796.8,232,790.6,224.7,780.2,198,772.2,182.3,
  775.4,172.7,781.5,142.1,792,139.9,797,142.9,809.2,140.3,815.4,135.3,820.3,128.9,823,123.9,822.7,123.1,819.7,126.9,
  812.8,126,810.8,122.8,810.8,112.4,824.1,101.8,829.2,94.2,835.7,85.6,836.7,78.7,840.2,73.9,839.2,44,851.1,46.4,838.3,
  53,826.5,76.1,808.8,71.9,805.5,57.7,810.6,41.2,812.7,4.7,833.1,2.7,844.7,-6.7,868.3,-25.6,888,-38.3,907.8,-52.2,923,
  -68.7,949.9,-75.3,964.9,-78,992.7,-77.5,1003.7,-68,1027.5,-68.9,1033.7,-71.4,1034,-80.9,1026.3,-95.3,999.9,-101.1,
  971.9,-95.1,942.8,-95.9,939.7,-99.6,939.3,-102.7,944.6,-109.6,963.4,-113.2,987.2,-121.8,993.2,-128.9,982.8,-133.4,
  966.8,-131.4,919.7,-127,908.2,-125.9,893.6,-119.1,879.9,-118.7,874.2,-121.8,867.5,-122.4,859.6,-111,835.4,-113.2,
  824.2,-109.9,811.1,-104.1,805.6,-100.5,797.7,-100.2,787.3,-92.3,762.9,-87.4,752.6,-73.1,739.8,-63.7,725.9,-51.8,
  714.3,-48.8,677.5,-43.3,659.5,-31.2,640.8,-20.6,617.9,-18.4,609.1,-11.1,598.9,-12.6,596.8,-15.6,597.6,-46.2,628.3,
  -61.5,637.4,-77.3,656.1,-96,686.1,-108.3,694,-117.8,705.7,-130.4,715.2,-153.8,746,-156.7,747.4,-159,746.5,-159.1,
  743.1,-139.7,700.6,-133.1,675.9,-124.1,652.6,-123.8,625.7,-116.6,598.4,-119.2,597.4,-143.5,622.1,-149.1,632.5,-150.4,
  648.5,-181,695.1,-190.2,704.2,-193.6,703.6,-194.2,701.6,-192.6,696.4,-194.2,690.8,-202.6,690.4,-208.7,686.1,-211.5,
  674.7,-207.5,662.5,-209.6,658.7,-215.1,660.5,-223.3,670.5,-227.9,671.1,-230.1,667.6,-227.2,653.8,-230.6,650.7,-237.3,
  657.2,-248.1,660.7,-254.4,669.2,-257.5,668.4,-251.9,650.7,-246,642.6,-247.1,640,-258.7,644.3,-264.9,644.5,-282.9,
  659.4,-287.6,670.9,-289.4,668.7,-284.5,656.3,-287.6,655.3,-296.4,666.3,-329.1,689.3,-342.1,701.8,-344.1,697.3,-341,
  685,-342.8,681.6,-361.3,691.8,-363.7,691.6,-364.8,689.3,-360.3,677.5,-361.4,674.6,-370.6,677.6,-378.4,682.5,-382.8,
  682.8,-382.5,676.1,-374.6,664.1,-376.3,659.7,-379.8,659.5,-401.7,672.4,-403.4,668.9,-395.9,657.7,-397.2,655.3,-413.6,
  659.7,-423.1,660.4,-458.7,642.2,-476.3,644,-489.4,640.9,-498.5,629.4
];

// --- The missions ----------------------------------------------------------------------------------------------------
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const headingAlong = (pts, s = 0, ahead = 12) => { const a = pointAt(pts, s), b = pointAt(pts, s + ahead); return Math.atan2(b.x - a.x, b.z - a.z); };

/** A line across the end of a polyline (the finish), as a gate `half` m wide each side */
function finishLine(pts, half) {
  const L = lineLength(pts);
  const p = pointAt(pts, L);
  const { tx, tz } = smoothTangent(pts, L - 10, 10);
  return { i: -1, x: p.x, z: p.z, tx, tz, nx: tz, nz: -tx, half, s: L };
}

export const SLALOM_MISSION = {
  id: 'ski-slalom',
  board: 'ski-slalom-1', // (js/leaderboard.js; supabase/migrations holds its limits)
  title: 'Slalom on the Davos Vertical',
  intro: `Race day on the Jakobshorn: the Davos Vertical is set with ${SLALOM_GATES} slalom gates, red and blue. Ski down through every gate (between its two poles) and over the finish line. Steer A/D, tuck W, skis across to brake S. A missed gate costs ${SLALOM_MISS_MS / 1000} s, the ${SLALOM_MAX_MISSES + 1}th disqualifies.`,
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['skis'],
  course: 'slalom', // (js/missions-snow.js sets the gates, the start house and the finish)
  bonusMs: 58 * 1000,
  medals: { gold: 58000, silver: 75000, bronze: 105000 },
  colour: '#e3262e',
  icon: 'ski',
  finish: 'In the finish area of the Davos Vertical: the crowd cheers, the skis come off.',
  pin: { x: -452, z: 1372 },
  get start() {
    const pts = slalomRun();
    return { x: pts[0], z: pts[1], heading: headingAlong(pts, 0, 25) };
  },
  props: [],
  createState() {
    const pts = slalomRun();
    const gates = buildSlalomGates(pts, { count: SLALOM_GATES });
    return { pts, gates, finishLine: finishLine(pts, 16), next: 0, passed: 0, missed: 0, penaltyMs: 0, results: gates.map(() => null), prev: null, finished: false, last: null };
  },
  update(ctx, state) {
    if (ctx.mode !== 'person') { state.prev = null; return; }
    const p = state.prev;
    if (p && Math.hypot(ctx.x - p.x, ctx.z - p.z) < 40) {
      const events = updateSlalom(state, p.x, p.z, ctx.x, ctx.z, SLALOM_MISS_MS);
      if (events.length) state.last = { ...events[events.length - 1], t: ctx.t };
      if (state.next >= state.gates.length && crossGate(state.finishLine, p.x, p.z, ctx.x, ctx.z, { reach: 40 })) state.finished = true;
    }
    state.prev = { x: ctx.x, z: ctx.z };
  },
  summary(state) {
    return [`${state.passed} of ${state.gates.length} gates clean · ${state.missed} missed${state.missed ? ` (+${(state.missed * SLALOM_MISS_MS) / 1000} s)` : ''}`];
  },
  objectives: [
    {
      id: 'gates',
      title: `Through the ${SLALOM_GATES} gates`,
      check(ctx, state) {
        const n = state.gates.length, g = state.gates[state.next];
        const fail = state.missed > SLALOM_MAX_MISSES ? `Disqualified: ${state.missed} gates missed.` : null;
        const text = `Gate ${Math.min(n, state.next + 1)}/${n} · ${state.passed} clean${state.missed ? ` · ${state.missed} missed (+${(state.missed * SLALOM_MISS_MS) / 1000} s)` : ''}`;
        const last = state.last;
        const hint = last && !last.pass && ctx.t - last.t < 2500 ? `Gate ${last.i + 1} missed: +${SLALOM_MISS_MS / 1000} s` : null;
        return { done: state.next >= n, progress: state.next / n, text, target: g ? { x: g.x, z: g.z, r: g.half, style: 'plain' } : null, hint, fail };
      }
    },
    {
      id: 'finish',
      title: 'Over the finish line',
      check(ctx, state) {
        const f = state.finishLine;
        return { done: state.finished, progress: null, text: `${fmtDist(Math.hypot(f.x - ctx.x, f.z - ctx.z))} to the finish`, target: { x: f.x, z: f.z }, hint: null };
      }
    }
  ]
};

/** Whether a take-off was the kicker's (off its lip, not a bump beside it) */
export function offTheKicker(takeoff, park = BIG_AIR) {
  if (!takeoff) return false;
  const k = park.kicker;
  const ax = Math.sin(k.heading), az = Math.cos(k.heading);
  const dx = takeoff.x - k.x, dz = takeoff.z - k.z;
  const u = dx * ax + dz * az, v = dx * az - dz * ax;
  return u > park.kickerLength - 4 && u < park.kickerLength + 2.5 && Math.abs(v) < park.kickerWidth / 2 + 1.5;
}

/** A landing of the board scored into the big air's state (only a jump off the kicker counts); returns the jump or null */
export function recordBigAirJump(state, landing, park = BIG_AIR) {
  if (!landing || state.jumps.length >= BIG_AIR_JUMPS || !offTheKicker(landing.takeoff, park)) return null;
  const jump = { ...scoreJump(landing), time: landing.time };
  state.jumps.push(jump);
  return jump;
}

export const bigAirTotal = (state) => state.jumps.reduce((a, j) => a + j.points, 0);

export const BIG_AIR_MISSION = {
  id: 'big-air',
  title: 'Snowboard Big Air in the JatzPark',
  intro: 'The JatzPark has built its big air kicker. Three jumps, judged by the tricks: ride down the in-run onto the kicker, then in the air spin with A/D, flip with W/S and hold Space to grab. Land with the board along the way you are going (switch counts) and upright. The points of all three jumps count.',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['board'],
  park: BIG_AIR, // (js/missions-snow.js builds the kicker and adds it to the snow)
  scoreMode: true,
  score: (state) => bigAirTotal(state),
  bonusMs: 3 * 60 * 1000,
  medals: { gold: 200, silver: 120, bronze: 50 },
  colour: '#8a4dff',
  icon: 'snowboard',
  finish: 'Three jumps in the JatzPark: the judges have their scores.',
  get start() {
    const s = BIG_AIR.start, k = BIG_AIR.kicker;
    return { x: s.x, z: s.z, heading: Math.atan2(k.x - s.x, k.z - s.z) };
  },
  props: [],
  createState() { return { jumps: [], penaltyMs: 0, airborne: false, note: null }; },
  update() {},
  summary(state) { return state.jumps.map((j, i) => `Jump ${i + 1}: ${j.name} · ${j.quality} landing · ${j.points} pts`); },
  objectives: Array.from({ length: BIG_AIR_JUMPS }, (_, i) => ({
    id: `jump${i + 1}`,
    title: `Jump ${i + 1} of ${BIG_AIR_JUMPS}`,
    check(ctx, state) {
      const k = BIG_AIR.kicker, last = state.jumps[state.jumps.length - 1];
      const lip = { x: k.x + Math.sin(k.heading) * BIG_AIR.kickerLength, z: k.z + Math.cos(k.heading) * BIG_AIR.kickerLength };
      const text = last ? `${last.name}: ${last.points} pts · total ${bigAirTotal(state)}` : `${fmtDist(Math.hypot(lip.x - ctx.x, lip.z - ctx.z))} to the kicker`;
      const hint = state.airborne ? 'Spin A/D · flip W/S · grab Space' : state.note;
      return { done: state.jumps.length > i, progress: null, text, target: state.airborne ? null : { x: lip.x, z: lip.z }, hint };
    }
  }))
};

// The race: start on the Ischalp's meadow, checkpoints every ~110 m, the finish on Bolgen Plaza
export const MTB_CRASH_MS = 5000;
const MTB_BOLGEN_TRAIL_S = lineLength(MTB_TRAIL) - 580; // (where the Chüggelibahn ends and the Bolgen Trail begins)
export const mtbCheckpoints = () => buildCheckpoints(MTB_TRAIL, 110, 60);

/** A section of the race: done with the checkpoints up to (not past) arc length `toS` */
const mtbSection = (id, title, toS) => ({
  id,
  title,
  check(ctx, state) {
    const last = state.cps.reduce((k, c, i) => (c.s <= toS + 1 ? i : k), 0);
    const cp = state.cps[state.next];
    const n = state.cps.length;
    const skipped = state.skipped != null ? state.cps[state.skipped] : null;
    const text = skipped ? `Checkpoint ${skipped.i + 1} missed: ride back to it` : `Checkpoint ${Math.min(n, state.next + 1)}/${n} · ${cp ? fmtDist(Math.hypot(cp.x - ctx.x, cp.z - ctx.z)) : ''}${state.crashes ? ` · ${state.crashes} ${state.crashes === 1 ? 'crash' : 'crashes'} (+${(state.crashes * MTB_CRASH_MS) / 1000} s)` : ''}`;
    const hint = skipped ? 'Shortcut: a checkpoint was missed' : state.crashT > 0 ? `Crash! +${MTB_CRASH_MS / 1000} s` : state.wobble > 0 ? 'Too fast for this turn: brake (S)!' : ctx.mode !== 'cyclist' ? 'Back on the bike' : null;
    return { done: state.next > last, progress: state.next / n, text, target: cp ? { x: cp.x, z: cp.z, r: 6, style: skipped ? 'hazard' : 'plain' } : null, hint };
  }
});

export const MTB_MISSION = {
  id: 'mtb-race',
  board: 'mtb-race-1',
  title: 'Downhill race: Ischalp to Bolgen',
  intro: 'The bike race of the summer: from the Ischalp down the Chüggelibahn flow trail and the Bolgen Trail to Bolgen Plaza, 2.7 km and almost 400 m of drop. Ride through every checkpoint in order (a shortcut misses one: ride back to it). Too tight a turn at speed throws you off: +5 s.',
  mode: 'cyclist',
  season: 'summer',
  time: 'golden',
  features: ['mtb'],
  // (a clean, careful run ~7:30 in a simulation with the bike's physics; the hairpins of the Chüggelibahn set the pace)
  bonusMs: 7 * 60 * 1000,
  medals: { gold: 7 * 60000, silver: 9 * 60000, bronze: 12 * 60000 },
  colour: '#2fb344',
  icon: 'bike',
  finish: 'Bolgen Plaza: dusty, muddy, done. The bike gets a wash.',
  pin: { x: -486, z: 618 },
  get start() {
    return { x: MTB_TRAIL[0], z: MTB_TRAIL[1], heading: headingAlong(MTB_TRAIL, 0, 10) };
  },
  props: [],
  createState() { return { cps: mtbCheckpoints(), next: 0, skipped: null, crashes: 0, penaltyMs: 0, crashT: 0 }; },
  update(ctx, state) {
    if (ctx.mode === 'cyclist') updateCheckpoints(state, ctx.x, ctx.z, 8);
  },
  summary(state) { return [`${state.crashes} ${state.crashes === 1 ? 'crash' : 'crashes'}${state.crashes ? ` (+${(state.crashes * MTB_CRASH_MS) / 1000} s)` : ''}`]; },
  objectives: [
    mtbSection('chueggelibahn', 'Down the Chüggelibahn', MTB_BOLGEN_TRAIL_S),
    mtbSection('bolgen', 'Bolgen Trail to the finish', Infinity)
  ]
};

export const SNOW_MISSIONS = [SLALOM_MISSION, BIG_AIR_MISSION, MTB_MISSION];
