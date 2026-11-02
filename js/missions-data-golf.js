// js/missions-data-golf.js
// Golf at the Golf Club Davos (js/missions-data.js spreads GOLF_MISSIONS into MISSIONS; js/missions-golf.js has the
// runtime: the golfer's swing, the ball, the camera, the HUD). Like js/missions-data.js: no three.js and no DOM in here,
// so that tests/missions-golf.test.mjs drives the round with synthetic terrain. (Nothing is imported from
// js/missions-data.js: it imports this module, and a cycle would leave GOLF_MISSIONS undefined there.)
//
// A short course of three holes from the club's 18 (js/golf-data.js, OSM): the 14th (par 3, 115 m over a bunker in
// front of the green, by the clubhouse), the 15th (par 4, a dogleg left along the out-of-bounds) and the 18th (par 4,
// 396 m, the pond in front of the last green). The ball flies ballistically (gravity, drag against the air and its
// wind, lift and curve from its spin), lands on what golf-data's polygons say lies there (fairway, rough, green, tee,
// bunker, water: a penalty stroke and a drop; outside the course: stroke and distance), bounces off the slope and rolls
// down it (the terrain's height, the greens' slope a little exaggerated), and drops into the cup when it comes slow
// enough. Scored by points (scoreMode): 100 a stroke under par + 5 for the round, the birdies and eagles on top (at most
// 95, so that the medals follow the strokes): gold at par − 1 or better, silver at par + 1, bronze at par + 4.

import { GOLF } from './golf-data.js';

export const G = 9.81;
export const BALL_R = 0.0214; // m
export const HOLE_R = 0.054; // m (the cup: 108 mm across)
export const AIR_K = 0.0047; // ½ ρ C_d A / m: the drag's deceleration per (m/s)²
export const LIFT_K = 0.0188; // ½ ρ A / m: the lift (spin) per (m/s)² and unit lift coefficient
export const SPIN_DECAY_S = 6; // s: the spin's time constant in the air
export const GREEN_SLOPE_BOOST = 1.25; // the greens' break, a little exaggerated (the terrain's grid is coarse) …
export const GREEN_MAX_SLOPE = 0.06; // … but never steeper than this: a ball always comes to rest on a green
export const POWER_EXP = 0.62; // the ball speed goes with power^this: the distance about in proportion to the power
export const PUTT_MAX = 20; // m: a full putt on a flat green
export const CAPTURE_SPEED = 1.6; // m/s: the fastest a ball over the cup's centre drops (slower the further off centre)
export const TAP_IN = 0.3; // m: a ball resting this close is tapped in (one stroke)
export const PICK_UP_OVER_PAR = 5; // strokes over par: the hole is picked up with that score
export const LIE_ORDER = ['water', 'bunker', 'green', 'tee', 'fairway', 'range']; // (what lies on top wins)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** A small seeded random generator (mulberry32) */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- The surfaces: what lies under a point ---------------------------------------------------------------------------
/** The surfaces' play: restitution (the bounce's vertical part kept), keep (its tangential part kept on landing),
 *  decel (m/s² rolling resistance), and the lie's effect on the next shot (power factor, spin factor) */
export const SURFACES = {
  tee: { label: 'Tee', restitution: 0.32, keep: 0.42, decel: 2.6, power: 1, spin: 1 },
  fairway: { label: 'Fairway', restitution: 0.32, keep: 0.42, decel: 2.6, power: 1, spin: 1 },
  range: { label: 'Fairway', restitution: 0.32, keep: 0.42, decel: 2.6, power: 1, spin: 1 },
  green: { label: 'Green', restitution: 0.28, keep: 0.35, decel: 0.65, power: 1, spin: 1 },
  rough: { label: 'Rough', restitution: 0.18, keep: 0.25, decel: 5, power: 0.85, spin: 0.5 },
  bunker: { label: 'Bunker', restitution: 0.03, keep: 0.06, decel: 12, power: 0.6, spin: 0.7 },
  water: { label: 'Water', restitution: 0, keep: 0, decel: 50, power: 0, spin: 0 },
  out: { label: 'Out of bounds', restitution: 0.18, keep: 0.25, decel: 5, power: 0, spin: 0 }
};

const bboxOf = (ring) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < ring.length; i += 2) { b[0] = Math.min(b[0], ring[i]); b[1] = Math.min(b[1], ring[i + 1]); b[2] = Math.max(b[2], ring[i]); b[3] = Math.max(b[3], ring[i + 1]); }
  return b;
};
/** Point in a flat ring [x0, z0, x1, z1, …] */
export function pointInRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** A lookup of the surfaces from golf-data's shape ({ outline, areas }): (x, z) => 'water' | 'bunker' | 'green' |
 *  'tee' | 'fairway' | 'range' | 'rough' (inside the course) | 'out' */
export function createSurfaceLookup(data = GOLF) {
  const areas = data.areas.map((a) => ({ kind: a.kind, ring: a.ring, b: bboxOf(a.ring), rank: LIE_ORDER.indexOf(a.kind) })).filter((a) => a.rank >= 0).sort((a, b) => a.rank - b.rank);
  const outline = data.outline.map((ring) => ({ ring, b: bboxOf(ring) }));
  const inBox = (b, x, z) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];
  return (x, z) => {
    for (const a of areas) if (inBox(a.b, x, z) && pointInRing(a.ring, x, z)) return a.kind;
    for (const o of outline) if (inBox(o.b, x, z) && pointInRing(o.ring, x, z)) return 'rough';
    return 'out';
  };
}
let _lookup = null;
/** The surface under (x, z) on the Golf Club Davos */
export const surfaceAt = (x, z) => (_lookup ??= createSurfaceLookup())(x, z);

// --- The clubs ---------------------------------------------------------------------------------------------------------
/** carry: m at full power on flat ground without wind; launch: deg; lift: the backspin's lift coefficient (the higher,
 *  the higher the ball climbs and the sooner it stops: `bite` takes that much of its run out on landing); length: m
 *  of the club (the golfer's stance); curve: how much a mistimed swing bends the ball */
export const CLUBS = [
  { id: 'driver', label: 'Driver', short: '1W', carry: 205, launch: 11.5, lift: 0.17, bite: 0, length: 1.1, curve: 1.2 },
  { id: 'wood', label: '3 Wood', short: '3W', carry: 180, launch: 13, lift: 0.19, bite: 0.1, length: 1.05, curve: 1.05 },
  { id: 'iron7', label: '7 Iron', short: '7i', carry: 135, launch: 18, lift: 0.23, bite: 0.4, length: 0.95, curve: 0.85 },
  { id: 'wedge', label: 'Wedge', short: 'W', carry: 85, launch: 30, lift: 0.26, bite: 0.7, length: 0.9, curve: 0.6 },
  { id: 'putter', label: 'Putter', short: 'P', carry: PUTT_MAX, launch: 0, lift: 0, bite: 0, length: 0.86, curve: 0, putt: true }
];
export const clubById = (id) => CLUBS.find((c) => c.id === id) || CLUBS[0];

/** The club for a distance (m) from a lie: the putter on the green, else the shortest club that reaches */
export function autoClub(distance, lie = 'fairway') {
  if (lie === 'green') return 'putter';
  if (distance <= 95) return 'wedge';
  if (distance <= 145 || lie === 'bunker') return 'iron7';
  if (distance <= 185 || lie !== 'tee') return 'wood';
  return 'driver';
}

// --- The ball's flight ---------------------------------------------------------------------------------------------------
const FLAT = () => 0;

/** One step of a ball in the air: gravity, drag against the air (the wind), lift and side force from the spin */
function stepAir(b, h, wind) {
  const rx = b.vx - (wind?.x || 0), ry = b.vy, rz = b.vz - (wind?.z || 0);
  const v = Math.hypot(rx, ry, rz) || 1e-9, vh = Math.hypot(rx, rz) || 1e-9;
  const lift = LIFT_K * b.lift * v * v, side = LIFT_K * b.side * v * v;
  // lift: perpendicular to the motion in its vertical plane, upwards; side: horizontal, to the right of the motion
  const ux = (-ry * rx) / (v * vh), uy = vh / v, uz = (-ry * rz) / (v * vh);
  const sx = -rz / vh, sz = rx / vh;
  const ax = -AIR_K * v * rx + lift * ux + side * sx;
  const ay = -G - AIR_K * v * ry + lift * uy;
  const az = -AIR_K * v * rz + lift * uz + side * sz;
  b.vx += ax * h; b.vy += ay * h; b.vz += az * h;
  b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
  const k = Math.exp(-h / SPIN_DECAY_S);
  b.lift *= k; b.side *= k;
}

/** The slope (dh/dx, dh/dz) of the ground */
export function slopeAt(heightAt, x, z, e = 0.35) {
  return { x: (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), z: (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e) };
}

/** A new ball at (x, y, z) lying on `lie` (y: the turf under it) */
export function createBall(x, z, y = 0, lie = 'tee') {
  return { x, y: y + BALL_R, z, vx: 0, vy: 0, vz: 0, lift: 0, side: 0, lift0: 0, state: 'rest', lie, t: 0, bounces: 0, carry: null, path: [], from: { x, z }, holedAt: null, lipOuts: 0 };
}

/**
 * Hits the ball: `club` (an entry of CLUBS or its id), `power` 0-1 (the swing's), `accuracy` -1…1 (0 a clean strike;
 * > 0 early: a hook, curving left; < 0 late: a slice, curving right), `heading` (the aim, rad: 0 along +z, π/2 along
 * +x). The lie takes its toll (the rough, the bunker; the wedge gets out of the sand best). Returns the ball, airborne
 * (or rolling: the putter)
 */
export function strike(ball, { club, power, accuracy = 0, heading }) {
  const c = typeof club === 'string' ? clubById(club) : club;
  const lie = SURFACES[ball.lie] || SURFACES.fairway;
  const p = clamp(power, 0, 1);
  const acc = clamp(accuracy, -1, 1);
  ball.from = { x: ball.x, z: ball.z, lie: ball.lie };
  ball.path = [{ x: ball.x, y: ball.y, z: ball.z }];
  ball.t = 0; ball.bounces = 0; ball.carry = null; ball.holedAt = null; ball.lipOuts = 0;
  if (c.putt) {
    // the putter: rolls, the speed for the distance on a flat green; a mistimed stroke pushes or pulls it
    const h = heading + acc * 0.03;
    const v = Math.sqrt(2 * SURFACES.green.decel * PUTT_MAX * p) * (ball.lie === 'green' || ball.lie === 'fairway' || ball.lie === 'tee' ? 1 : 0.8);
    Object.assign(ball, { vx: Math.sin(h) * v, vy: 0, vz: Math.cos(h) * v, lift: 0, side: 0, lift0: 0, state: 'roll' });
    return ball;
  }
  let factor = lie.power;
  if (ball.lie === 'bunker' && c.id === 'wedge') factor = 0.88;
  if (ball.lie !== 'tee' && c.id === 'driver') factor *= 0.88; // (off the deck)
  const v = clubSpeed(c) * Math.pow(p, POWER_EXP) * Math.sqrt(factor);
  const h = heading + acc * 0.03; // (a hook starts a little left, a slice a little right)
  const la = (c.launch * Math.PI) / 180;
  const spin = lie.spin ?? 1;
  Object.assign(ball, {
    vx: Math.sin(h) * Math.cos(la) * v, vy: Math.sin(la) * v, vz: Math.cos(h) * Math.cos(la) * v,
    lift: c.lift * spin, lift0: c.lift * spin, side: -acc * 0.09 * c.curve, state: 'air', bite: c.bite * spin
  });
  return ball;
}

const _speeds = new Map();
/** The club head's ball speed (m/s) that carries the ball `club.carry` m on flat ground without wind (calibrated by
 *  bisection on the flight model, once a club) */
export function clubSpeed(club) {
  const c = typeof club === 'string' ? clubById(club) : club;
  if (c.putt) return Math.sqrt(2 * SURFACES.green.decel * PUTT_MAX);
  if (_speeds.has(c.id)) return _speeds.get(c.id);
  const carry = (v) => {
    const la = (c.launch * Math.PI) / 180;
    const b = { x: 0, y: 0, z: 0, vx: 0, vy: Math.sin(la) * v, vz: Math.cos(la) * v, lift: c.lift, side: 0 };
    for (let t = 0; t < 20; t += 1 / 120) { stepAir(b, 1 / 120, null); if (b.y <= 0 && b.vy < 0) return b.z; }
    return b.z;
  };
  let lo = 5, hi = 120;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (carry(m) < c.carry) lo = m; else hi = m; }
  const v = (lo + hi) / 2;
  _speeds.set(c.id, v);
  return v;
}

/**
 * One step (dt s) of the ball. env: { heightAt(x, z) (the turf's top), surfaceAt(x, z), wind { x, z } (m/s),
 * pin { x, z }, greenBoost }. The ball's state goes 'air' → 'roll' → 'rest' | 'holed' | 'water' | 'out'. Returns it.
 */
export function stepBall(b, dt, env) {
  const heightAt = env.heightAt || FLAT, surf = env.surfaceAt || (() => 'fairway');
  const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
  for (let k = 0; k < steps; k++) {
    if (b.state === 'air') {
      stepAir(b, h, env.wind);
      b.t += h;
      const ground = heightAt(b.x, b.z) + BALL_R;
      if (b.y <= ground) {
        b.y = ground;
        const s = surf(b.x, b.z);
        if (b.carry === null) b.carry = { x: b.x, z: b.z, d: Math.hypot(b.x - b.from.x, b.z - b.from.z), surface: s };
        if (s === 'water') { b.state = 'water'; b.lie = 'water'; b.vx = b.vy = b.vz = 0; break; }
        if (s === 'out') { b.state = 'out'; b.lie = 'out'; b.vx = b.vy = b.vz = 0; break; }
        // a dunk: down into the cup on the fly, if not too fast
        if (env.pin && Math.hypot(b.x - env.pin.x, b.z - env.pin.z) < HOLE_R && Math.hypot(b.vx, b.vz) < 4) { holeOut(b, env.pin); break; }
        bounce(b, s, heightAt);
      }
    } else if (b.state === 'roll') {
      roll(b, h, env, heightAt, surf);
      b.t += h;
    } else break;
    if (b.t > 60 && (b.state === 'air' || b.state === 'roll')) { b.state = 'rest'; b.vx = b.vy = b.vz = 0; }
  }
  const last = b.path[b.path.length - 1];
  if (!last || Math.hypot(b.x - last.x, b.y - last.y, b.z - last.z) > 0.6 || b.state !== 'air') {
    if (!last || last.x !== b.x || last.z !== b.z) b.path.push({ x: b.x, y: b.y, z: b.z });
  }
  return b;
}

/** Landing: the velocity split along the ground's normal; the normal part bounces back (restitution), the tangential
 *  part keeps what the surface and the backspin leave of it. Too little bounce left: it rolls */
function bounce(b, s, heightAt) {
  const S = SURFACES[s] || SURFACES.fairway;
  const sl = slopeAt(heightAt, b.x, b.z);
  let nx = -sl.x, ny = 1, nz = -sl.z;
  const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  const tx = b.vx - vn * nx, ty = b.vy - vn * ny, tz = b.vz - vn * nz;
  const bite = b.bounces === 0 ? 1 - (b.bite || 0) * (b.lift0 ? b.lift / b.lift0 : 0) : 1;
  const keep = S.keep * bite;
  const out = -vn * S.restitution;
  b.vx = tx * keep + nx * out; b.vy = ty * keep + ny * out; b.vz = tz * keep + nz * out;
  b.bounces++;
  b.lie = s;
  b.lift *= 0.3; b.side = 0;
  if (out < 1.0) { b.state = 'roll'; b.vy = 0; }
}

/** Rolling: down the slope (5/7 g for a rolling ball, the green's exaggerated), against the surface's resistance; the
 *  cup takes it when it is slow enough over it, else it lips out */
function roll(b, h, env, heightAt, surf) {
  const s = surf(b.x, b.z);
  b.lie = s;
  if (s === 'water' || s === 'out') { b.state = s; b.vx = b.vz = 0; return; }
  const S = SURFACES[s] || SURFACES.fairway;
  const sl = slopeAt(heightAt, b.x, b.z);
  let boost = 1;
  if (s === 'green') {
    boost = env.greenBoost ?? GREEN_SLOPE_BOOST;
    const m = Math.hypot(sl.x, sl.z) * boost;
    if (m > GREEN_MAX_SLOPE) boost *= GREEN_MAX_SLOPE / m;
  }
  const gx = (-5 / 7) * G * sl.x * boost, gz = (-5 / 7) * G * sl.z * boost;
  const v = Math.hypot(b.vx, b.vz);
  if (v < 0.03 && Math.hypot(gx, gz) < S.decel * 0.9) { b.vx = b.vz = 0; b.state = 'rest'; b.y = heightAt(b.x, b.z) + BALL_R; return; }
  let ax = gx, az = gz;
  if (v > 1e-6) { ax -= (S.decel * b.vx) / v; az -= (S.decel * b.vz) / v; }
  const px = b.x, pz = b.z;
  const nvx = b.vx + ax * h, nvz = b.vz + az * h;
  // (the resistance stops the ball, it does not turn it round)
  if (v > 1e-6 && nvx * b.vx + nvz * b.vz < 0 && Math.hypot(gx, gz) < S.decel) { b.vx = b.vz = 0; }
  else { b.vx = nvx; b.vz = nvz; }
  b.x += b.vx * h; b.z += b.vz * h;
  b.y = heightAt(b.x, b.z) + BALL_R;
  b.vy = 0;
  if (env.pin) cupCheck(b, px, pz, env.pin);
}

/** The cup: the closest the step came to its centre; slow enough for that line, the ball drops; else it lips out */
function cupCheck(b, px, pz, pin) {
  const dx = b.x - px, dz = b.z - pz, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? clamp(((pin.x - px) * dx + (pin.z - pz) * dz) / L2, 0, 1) : 0;
  const cx = px + dx * t, cz = pz + dz * t;
  const d = Math.hypot(pin.x - cx, pin.z - cz);
  if (d >= HOLE_R) return;
  const v = Math.hypot(b.vx, b.vz);
  if (v <= captureSpeed(d)) { holeOut(b, pin); return; }
  if (b.t < (b.lipUntil ?? -1)) return;
  // a lip-out: turned off the cup's edge, slowed (once on its way over)
  b.lipOuts++;
  b.lipUntil = b.t + (2 * HOLE_R) / Math.max(0.2, v * 0.7) + 0.02;
  const side = Math.sign((pin.x - cx) * b.vz - (pin.z - cz) * b.vx) || 1;
  const turn = -side * (0.25 + 0.5 * (1 - d / HOLE_R));
  const c = Math.cos(turn), s = Math.sin(turn);
  const vx = b.vx * c + b.vz * s, vz = -b.vx * s + b.vz * c;
  b.vx = vx * 0.7; b.vz = vz * 0.7;
}

/** The fastest a ball passing `d` m from the cup's centre drops in */
export const captureSpeed = (d) => CAPTURE_SPEED * Math.sqrt(Math.max(0, 1 - (d / HOLE_R) ** 2));

function holeOut(b, pin) {
  b.state = 'holed';
  b.holedAt = { x: b.x, z: b.z };
  b.x = pin.x; b.z = pin.z;
  b.vx = b.vy = b.vz = 0;
  b.lie = 'cup';
}

/** The whole shot to its end (tests, the aim's preview): the ball as it ends */
export function simulateBall(b, env, { dt = 1 / 120, maxT = 60 } = {}) {
  for (let t = 0; t < maxT && (b.state === 'air' || b.state === 'roll'); t += dt) stepBall(b, dt, env);
  return b;
}

/** The flight of a shot until it first touches the ground (the aim's preview arc): { points, landing } */
export function previewFlight(from, { club, power = 1, heading, lie = 'fairway' }, env, { dt = 1 / 30 } = {}) {
  const b = createBall(from.x, from.z, (env.heightAt || FLAT)(from.x, from.z), lie);
  strike(b, { club, power, heading });
  const points = [{ x: b.x, y: b.y, z: b.z }];
  if (b.state !== 'air') {
    // the putter: the line it starts on, as far as it would roll on the flat
    const d = PUTT_MAX * power;
    return { points: [points[0], { x: b.x + Math.sin(heading) * d, y: b.y, z: b.z + Math.cos(heading) * d }], landing: null };
  }
  const heightAt = env.heightAt || FLAT;
  for (let t = 0; t < 20; t += dt) {
    for (let k = 0; k < 4; k++) stepAir(b, dt / 4, env.wind);
    points.push({ x: b.x, y: b.y, z: b.z });
    if (b.y <= heightAt(b.x, b.z) + BALL_R && b.vy < 0) break;
  }
  const end = points[points.length - 1];
  return { points, landing: { x: end.x, z: end.z, surface: (env.surfaceAt || (() => 'fairway'))(end.x, end.z) } };
}

/** Where the ball is dropped after the water: back along its line from where it went in, the first spot clear of the
 *  water and inside the course (2 m further back), else where it was played from */
export function waterDrop(b, surf = surfaceAt) {
  const path = b.path.length ? b.path : [{ x: b.from.x, z: b.from.z }];
  const fx = b.from.x, fz = b.from.z;
  let ex = b.x, ez = b.z; // (where it went in: walked back from the end until it is dry)
  const dx = fx - ex, dz = fz - ez, L = Math.hypot(dx, dz);
  if (L < 0.5) return { x: fx, z: fz, lie: b.from.lie || surf(fx, fz) };
  const ux = dx / L, uz = dz / L;
  for (let s = 0; s <= L; s += 0.5) {
    const x = ex + ux * s, z = ez + uz * s, k = surf(x, z);
    if (k !== 'water' && k !== 'out') {
      const s2 = Math.min(L, s + 2);
      const dropX = ex + ux * s2, dropZ = ez + uz * s2, lie = surf(dropX, dropZ);
      if (lie !== 'water' && lie !== 'out') return { x: dropX, z: dropZ, lie };
      return { x, z, lie: k };
    }
  }
  void path;
  return { x: fx, z: fz, lie: b.from.lie || surf(fx, fz) };
}

// --- The holes ---------------------------------------------------------------------------------------------------------
export const COURSE_REFS = [14, 15, 18];

/** A hole from golf-data: { ref, par, name, tee, pin, line (the hole's polyline), length } */
export function holeFromData(ref, data = GOLF) {
  const h = data.holes.find((x) => x.ref === ref);
  if (!h) throw new Error(`golf hole ${ref} is missing`);
  let length = 0;
  for (let i = 2; i < h.pts.length; i += 2) length += Math.hypot(h.pts[i] - h.pts[i - 2], h.pts[i + 1] - h.pts[i - 1]);
  const pin = h.pin ? { x: h.pin[0], z: h.pin[1] } : { x: h.pts[h.pts.length - 2], z: h.pts[h.pts.length - 1] };
  return { ref, par: h.par, name: `Hole ${ref}`, tee: { x: h.pts[0], z: h.pts[1] }, pin, line: h.pts.slice(), length };
}
export const GOLF_HOLES = COURSE_REFS.map((r) => holeFromData(r));
export const COURSE_PAR = GOLF_HOLES.reduce((s, h) => s + h.par, 0);

/** The aim from the tee: along the hole's line to its first turn (the dogleg's corner) when that is in reach, else the pin */
export function teeAim(hole) {
  const L = hole.line;
  const tx = L.length > 4 ? L[2] : hole.pin.x, tz = L.length > 4 ? L[3] : hole.pin.z;
  return Math.atan2(tx - hole.tee.x, tz - hole.tee.z);
}

/** The wind on a hole: a steady breeze of 0.5-4.5 m/s from a seeded direction (`dir`: the heading it blows towards) */
export function windFor(seed, i) {
  const r = seededRandom(seed * 7919 + i * 104729 + 13);
  const speed = 0.5 + r() * 4;
  const dir = r() * Math.PI * 2;
  return { speed, dir, x: Math.sin(dir) * speed, z: Math.cos(dir) * speed };
}

/** The name of a score on a hole */
export function scoreName(strokes, par) {
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  return d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : d === 3 ? 'Triple bogey' : `+${d}`;
}

/** The bonus for a score on a hole (birdie 20, eagle 50, a hole in one or an albatross 80) */
export function holeBonus(strokes, par) {
  const d = strokes - par;
  if (strokes === 1 || d <= -3) return 80;
  return d === -2 ? 50 : d === -1 ? 20 : 0;
}
export const BONUS_CAP = 95;

/** The round's points: 100 a stroke under the course's par + 5 (the holes played: their par), the bonuses on top
 *  (capped below a stroke's worth, so that the medals follow the strokes) */
export function roundScore(results, holes = GOLF_HOLES) {
  const n = results.length;
  const par = holes.slice(0, n).reduce((s, h) => s + h.par, 0) + (holes.length - n) * 0; // (the holes played)
  const strokes = results.reduce((s, r) => s + r.strokes, 0);
  const bonus = Math.min(BONUS_CAP, results.reduce((s, r) => s + holeBonus(r.strokes, r.par), 0));
  return Math.max(0, 100 * (par + 5 - strokes)) + bonus;
}

/** The medals' lowest scores: gold at par − 1 (600), silver at par + 1 (400), bronze at par + 4 (100) */
export const GOLF_MEDALS = { gold: 600, silver: 400, bronze: 100 };
/** The medal for a round's strokes over par (the same as medalFor(roundScore) gives) */
export const medalForToPar = (toPar) => (toPar <= -1 ? 'gold' : toPar <= 1 ? 'silver' : toPar <= 4 ? 'bronze' : null);

/** "+2", "E", "−1" */
export const formatToPar = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`);

// --- The round: the holes, the strokes, the ball between the shots (the runtime plays the shots) ------------------------
export function createRound(holes = GOLF_HOLES, seed = 1) {
  const round = { holes, seed, i: 0, results: [], strokes: 0, penalties: 0, ball: null, wind: null, club: 'driver', aim: 0, done: false, log: [], shots: 0 };
  startHole(round);
  return round;
}

/** The ball on the hole's tee, the club for the distance, the aim along the hole */
export function startHole(round) {
  const hole = round.holes[round.i];
  if (!hole) { round.done = true; return null; }
  round.strokes = 0;
  round.penalties = 0;
  round.ball = { x: hole.tee.x, z: hole.tee.z, lie: 'tee' };
  round.last = { ...round.ball };
  round.wind = windFor(round.seed, round.i);
  round.aim = teeAim(hole);
  round.club = autoClub(hole.length, 'tee');
  if (hole.par === 3) round.club = autoClub(hole.length + 5, 'fairway');
  return hole;
}

export const currentHole = (round) => round.holes[round.i] || null;
export const toPar = (round) => round.results.reduce((s, r) => s + r.strokes - r.par, 0);
export const distanceToPin = (round) => { const h = currentHole(round); return h && round.ball ? Math.hypot(h.pin.x - round.ball.x, h.pin.z - round.ball.z) : 0; };

/** The aim at the pin from where the ball lies, the club for the distance */
export function aimAtPin(round) {
  const h = currentHole(round);
  round.aim = Math.atan2(h.pin.x - round.ball.x, h.pin.z - round.ball.z);
  round.club = autoClub(distanceToPin(round), round.ball.lie);
  return round.aim;
}

/** A stroke is played (counted before the ball flies) */
export function beginShot(round) {
  round.strokes++;
  round.shots++;
  round.last = { ...round.ball };
}

/**
 * The ball has come to its end (simulateBall / stepBall): the next lie, the penalty, the hole's end. Returns the event
 * { kind: 'rest' | 'holed' | 'tapin' | 'water' | 'out' | 'pickup', text, strokes, result? }
 */
export function endShot(round, b, surf = surfaceAt) {
  const hole = currentHole(round);
  let kind = 'rest', text = '';
  if (b.state === 'holed') { kind = 'holed'; }
  else if (b.state === 'water') {
    round.strokes++; round.penalties++;
    const drop = waterDrop(b, surf);
    round.ball = { x: drop.x, z: drop.z, lie: drop.lie };
    kind = 'water'; text = 'In the water: a penalty stroke, drop';
  } else if (b.state === 'out') {
    round.strokes++; round.penalties++;
    round.ball = { ...round.last };
    kind = 'out'; text = 'Out of bounds: stroke and distance';
  } else {
    round.ball = { x: b.x, z: b.z, lie: b.lie === 'cup' ? 'green' : b.lie };
    if (Math.hypot(hole.pin.x - b.x, hole.pin.z - b.z) <= TAP_IN) { round.strokes++; kind = 'tapin'; }
    else text = `${SURFACES[round.ball.lie]?.label || 'Rough'} · ${Math.round(distanceToPin(round))} m to the pin`;
  }
  let result = null;
  if (kind === 'holed' || kind === 'tapin') {
    result = finishHole(round);
    text = kind === 'tapin' ? `Tapped in: ${result.name}` : result.name;
  } else if (round.strokes >= hole.par + PICK_UP_OVER_PAR) {
    round.strokes = hole.par + PICK_UP_OVER_PAR;
    result = finishHole(round);
    kind = 'pickup';
    text = `Picked up: ${result.name}`;
  } else aimAtPin(round);
  const ev = { kind, text, strokes: round.strokes, result, hole: hole.ref };
  round.log.push(ev);
  return ev;
}

function finishHole(round) {
  const hole = currentHole(round);
  const result = { ref: hole.ref, par: hole.par, strokes: round.strokes, penalties: round.penalties, name: scoreName(round.strokes, hole.par), bonus: holeBonus(round.strokes, hole.par) };
  round.results.push(result);
  round.holeDone = true;
  return result;
}

/** On to the next hole (after the hole's end); false at the end of the round */
export function nextHole(round) {
  round.holeDone = false;
  round.i++;
  if (round.i >= round.holes.length) { round.done = true; return false; }
  startHole(round);
  return true;
}

// --- The swing meter (two clicks: the power, then the accuracy) --------------------------------------------------------
export const METER = { rise: 1 / 1.1, fall: 1 / 0.85, below: -0.25, perfect: 0.04, span: 0.25 };

export function createMeter() { return { phase: 'idle', value: 0, power: 0, accuracy: 0, held: 0 }; }

/** The swing begins (the first press): the needle rises */
export function meterStart(m) { if (m.phase !== 'idle') return false; Object.assign(m, { phase: 'power', value: 0, power: 0, accuracy: 0, held: 0 }); return true; }

/** The power is set (the second press, or letting go after holding): the needle falls back towards the line */
export function meterPower(m) { if (m.phase !== 'power') return false; m.power = clamp(m.value, 0.02, 1); m.phase = 'accuracy'; return true; }

/** The accuracy is set (the last press): -1…1, 0 on the line; returns true when the swing is complete */
export function meterAccuracy(m) {
  if (m.phase !== 'accuracy') return false;
  const e = m.value;
  m.accuracy = Math.abs(e) <= METER.perfect ? 0 : clamp(e / METER.span, -1, 1);
  m.phase = 'done';
  return true;
}

/** The needle's run; at the top it locks the power itself, below the line it is a late (sliced) strike */
export function meterStep(m, dt) {
  if (m.phase === 'power') {
    m.value += METER.rise * dt;
    if (m.value >= 1) { m.value = 1; meterPower(m); }
  } else if (m.phase === 'accuracy') {
    m.value -= METER.fall * dt;
    if (m.value <= METER.below) { m.value = METER.below; meterAccuracy(m); }
  }
  return m.phase;
}

/** "Perfect", "Hook", "Slice", … for a strike's accuracy */
export const accuracyLabel = (a) => (a === 0 ? 'Perfect strike' : Math.abs(a) < 0.35 ? (a > 0 ? 'Slight draw' : 'Slight fade') : a > 0 ? 'Hook' : 'Slice');

// --- The mission -------------------------------------------------------------------------------------------------------
const H0 = GOLF_HOLES[0];
// (the mission's marker 10 m south of the clubhouse's OSM point, which lies inside the building)
const CLUBHOUSE = { x: GOLF.clubhouse[0], z: GOLF.clubhouse[1] + 10 };

export const GOLF_MISSION = {
  id: 'golf',
  title: 'Golf at the Golf Club Davos',
  intro: `Three holes on the course between Davos Dorf and the Landwasser: the 14th (par 3 over a bunker), the 15th (par 4, a dogleg left along the out of bounds) and the 18th (par 4, the pond in front of the last green): par ${COURSE_PAR}. Pick a club with W/S or 1-5, aim with A/D (or drag), then Space (Swing): the first press starts the swing, the second sets the power, the third on the line strikes the ball (early: hook, late: slice). On touch: hold Swing for the power, let go, tap on the line. Mind the wind. After each shot, walk to your ball (or press C for the cart). On the green the arrows show the slope.`,
  mode: 'person',
  season: 'summer',
  time: 'midday',
  features: ['golf'],
  scoreMode: true,
  score: (state) => roundScore(state.round.results, state.round.holes),
  scoreUnit: 'pts',
  medals: GOLF_MEDALS,
  colour: '#3aa655',
  icon: 'golf',
  finish: 'The round is in: the card is signed at the clubhouse.',
  start: { x: H0.tee.x, z: H0.tee.z, heading: teeAim(H0) },
  pin: CLUBHOUSE,
  props: [],
  createState() { return { round: createRound(GOLF_HOLES, 1 + Math.floor(Math.random() * 1000)) }; },
  update() {},
  summary(state) {
    const r = state.round;
    const strokes = r.results.reduce((s, x) => s + x.strokes, 0);
    const par = r.results.reduce((s, x) => s + x.par, 0);
    const card = r.results.map((x) => `${x.ref}: ${x.strokes} (${x.name})`).join(' · ');
    return [`${strokes} strokes, par ${par}: ${formatToPar(strokes - par)}`, card];
  },
  objectives: GOLF_HOLES.map((hole, k) => ({
    id: `hole-${hole.ref}`,
    title: `Hole ${hole.ref} · Par ${hole.par}`,
    check(ctx, state) {
      const r = state.round;
      const done = r.results.length > k;
      const playing = r.i === k && !done;
      const d = playing ? distanceToPin(r) : hole.length;
      const text = done ? `${r.results[k].name}` : `Stroke ${r.strokes + (state.inFlight ? 0 : 1)} · ${Math.round(d)} m to the pin · ${SURFACES[r.ball?.lie]?.label || 'Tee'}`;
      const walking = state.walkTo && playing;
      const target = walking ? { x: state.walkTo.x, z: state.walkTo.z, r: 2.5 } : null;
      return { done, progress: null, text, target, hint: playing ? state.hint || null : null };
    }
  }))
};
void lerp;

export const GOLF_MISSIONS = [GOLF_MISSION];
