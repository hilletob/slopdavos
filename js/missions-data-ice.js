import { EISBAHN, EISSTADION } from './landmark-buildings-data.js';

// js/missions-data-ice.js
// The ice missions (js/missions-data.js lists them in MISSIONS; js/missions-ice.js has their runtime: the skates, the
// rink in the Eisstadion, the curling sheet): the 400 m speed-skating race on the Natureisbahn, the penalty shoot-out in
// the Eisstadion and a curling end on the Eisbahn's hard court. Their definitions and all the pure game logic — the
// skater's strokes, the track's lap count and its infield, the goalie and the puck, the curling stones' slide, curl,
// collisions and score. No three.js and no DOM in here (tests/missions-ice.test.mjs plays them on plain objects).
// (no import from js/missions-data.js: it imports this module, the cycle would hand us its consts uninitialised)

const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const fmtTime = (ms) => {
  const t = Math.max(0, ms || 0);
  const m = Math.floor(t / 60000), s = Math.floor((t % 60000) / 1000), d = Math.floor((t % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
/** A small seeded random generator (mulberry32): the goalie's reactions repeat for the same seed */
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

// =====================================================================================================================
// The skater: strokes in a rhythm, glide, lean into the turns, brake
// A stroke comes by itself every `period` s while forward is held (the auto rhythm); the push key (Space, the touch
// button "Push") pressed late in the rhythm — the needle past `window` — makes it a power stroke right then (and the
// rhythm a little quicker); pressed too early it is a stumble: no stroke and the rhythm starts over. The speed falls
// off with the ice's friction and the air (drag0 + drag2·v²); a stroke adds less the faster the skater goes (1 − v/vRef).
export const SKATE_PARAMS = {
  // long track: ~8 m/s on the auto rhythm, ~10-11 m/s with every stroke a power stroke
  speed: { period: 0.75, push: 0.62, power: 1.08, vRef: 16, drag0: 0.06, drag2: 0.0055, turn: 1.9, maxLat: 9, brake: 6, window: 0.72, offIce: 4 },
  // hockey: short, quick strides, sharp turns, hard stops
  hockey: { period: 0.5, push: 0.75, power: 1.05, vRef: 10, drag0: 0.15, drag2: 0.016, turn: 2.9, maxLat: 12, brake: 10, window: 0.62, offIce: 4 }
};

export function createSkater(heading = 0) {
  return { speed: 0, heading, t: 0, side: 1, lean: 0, strokes: 0, power: 0, stumbles: 0, last: null, lastAge: 99, omega: 0 };
}

/** The rhythm needle 0..1 (1: the next stroke is due) */
export const skaterNeedle = (sk, P) => clamp(sk.t / effectivePeriod(sk, P), 0, 1);
const effectivePeriod = (sk, P) => P.period * (0.6 + 0.4 * Math.min(1, sk.speed / 6)); // (quick little steps off the line)

/**
 * One step of the skater. `input`: { forward 0-1, back 0-1, steer -1..1 (positive: to the left), push (the key went
 * down this frame) }. Returns the stroke made ('normal' | 'power') or null; sk.last says 'early' after a stumble.
 */
export function stepSkater(sk, input, dt, P, { offIce = false } = {}) {
  sk.t += dt;
  sk.lastAge += dt;
  const period = effectivePeriod(sk, P);
  let stroke = null;
  if (input.push) {
    if (sk.t / period >= P.window) stroke = 'power';
    else { sk.stumbles++; sk.t = 0; sk.last = 'early'; sk.lastAge = 0; }
  }
  if (!stroke && (input.forward || 0) > 0.2 && sk.t >= period) stroke = 'normal';
  if (stroke) {
    const k = stroke === 'power' ? P.power : P.push * Math.min(1, 0.4 + (input.forward || 0) * 0.6);
    sk.speed += k * Math.max(0.12, 1 - sk.speed / P.vRef);
    sk.t = 0;
    sk.side = -sk.side;
    sk.strokes++;
    if (stroke === 'power') sk.power++;
    sk.last = stroke;
    sk.lastAge = 0;
  }
  const drag = P.drag0 + P.drag2 * sk.speed * sk.speed + (offIce ? P.offIce : 0) + (input.back || 0) * P.brake;
  sk.speed = Math.max(0, sk.speed - drag * dt);
  const steer = clamp(input.steer || 0, -1, 1);
  const omega = sk.speed < 0.6 ? steer * 1.6 : steer * Math.min(P.turn, P.maxLat / sk.speed);
  sk.omega = omega;
  sk.heading = wrapAngle(sk.heading + omega * dt);
  const lean = Math.atan2(sk.speed * omega, 9.81);
  sk.lean += (lean - sk.lean) * Math.min(1, dt * 8);
  return stroke;
}

// =====================================================================================================================
// The 400 m track (Natureisbahn, js/landmark-buildings-data.js EISBAHN.track: the ice's outline, a stadium shape round
// a spine of 2 × `half` along u). The lanes: the inner kerb INNER m from the spine, the outer edge of the outer lane
// OUTER; the 400 m are measured on LINE (2 · 89 m straights + 2 π · 35.3 m ≈ 400 m). Counter-clockwise, as raced:
// along +u on the +v side (the infield on the skater's left).
export const TRACK = EISBAHN.track;
export const TRACK_LANES = { inner: 33.5, divider: 37.5, outer: 41.5, line: 35.3, cut: 31.0, ice: TRACK.r };
export const LAP_LENGTH = 2 * (2 * TRACK.half) + 2 * Math.PI * TRACK_LANES.line;
export const RACE_LAPS = 2;
const TV = { x: -TRACK.uz, z: TRACK.ux }; // v: across the track

export const trackLocal = (x, z, t = TRACK) => {
  const dx = x - t.x, dz = z - t.z;
  return { a: dx * t.ux + dz * t.uz, b: dx * -t.uz + dz * t.ux };
};
export const trackWorld = (a, b, t = TRACK) => ({ x: t.x + t.ux * a - t.uz * b, z: t.z + t.uz * a + t.ux * b });

/** The distance (m) of (x, z) from the track's spine: 0 in the middle of the infield, LINE on the measured line */
export function spineDistance(x, z, t = TRACK) {
  const { a, b } = trackLocal(x, z, t);
  const over = Math.abs(a) - t.half;
  return over <= 0 ? Math.abs(b) : Math.hypot(over, b);
}

/** Where (x, z) lies along the lap: 0..LAP_LENGTH m on the measured line, from the start (the beginning of the
 *  straight on the +v side), counter-clockwise */
export function trackParam(x, z, t = TRACK, R = TRACK_LANES.line) {
  const { a, b } = trackLocal(x, z, t);
  const S = 2 * t.half, C = Math.PI * R;
  if (a >= -t.half && a <= t.half) return b >= 0 ? a + t.half : S + C + (t.half - a);
  if (a > t.half) { const th = Math.atan2(b, a - t.half); return S + clamp(Math.PI / 2 - th, 0, Math.PI) * R; }
  const ph = Math.atan2(b, a + t.half);
  let arc = (-Math.PI / 2 - ph) % (2 * Math.PI);
  if (arc < 0) arc += 2 * Math.PI;
  return 2 * S + C + Math.min(arc, Math.PI) * R;
}

/** The point at `s` m along the measured line (and `off` m outwards of it), with the heading of the race there */
export function trackPoint(s, off = 0, t = TRACK, R = TRACK_LANES.line) {
  const S = 2 * t.half, C = Math.PI * R, L = 2 * S + 2 * C;
  s = ((s % L) + L) % L;
  const r = R + off;
  let a, b, da, db; // local position and direction
  if (s < S) { a = -t.half + s; b = r; da = 1; db = 0; }
  else if (s < S + C) { const th = Math.PI / 2 - (s - S) / R; a = t.half + Math.cos(th) * r; b = Math.sin(th) * r; da = Math.sin(th); db = -Math.cos(th); }
  else if (s < 2 * S + C) { a = t.half - (s - S - C); b = -r; da = -1; db = 0; }
  else { const ph = -Math.PI / 2 - (s - 2 * S - C) / R; a = -t.half + Math.cos(ph) * r; b = Math.sin(ph) * r; da = Math.sin(ph); db = -Math.cos(ph); }
  const p = trackWorld(a, b, t);
  const dx = t.ux * da - t.uz * db, dz = t.uz * da + t.ux * db;
  return { x: p.x, z: p.z, heading: Math.atan2(dx, dz) };
}

export function createRaceState() {
  return { prevS: null, dist: 0, laps: 0, lapTimes: [], lastLapAt: 0, cut: false, wrongWay: 0, maxSpeed: 0, power: 0, strokes: 0, stumbles: 0 };
}

/** The race's progress from the skater's position (ctx.x, ctx.z): the distance run along the lap (backwards counts
 *  against it), the laps, the lap times (ctx.t: ms on the clock), a cut across the infield */
export function updateRace(race, x, z, tMs = 0, t = TRACK) {
  const s = trackParam(x, z, t);
  if (race.prevS === null) { race.prevS = s; race.dist = s > LAP_LENGTH / 2 ? s - LAP_LENGTH : s; return race; }
  let ds = s - race.prevS;
  if (ds > LAP_LENGTH / 2) ds -= LAP_LENGTH;
  if (ds < -LAP_LENGTH / 2) ds += LAP_LENGTH;
  race.prevS = s;
  race.dist += ds; // (from the start line: negative on the few metres before it)
  race.wrongWay = ds < -0.02 ? race.wrongWay + 1 : 0;
  if (spineDistance(x, z, t) < TRACK_LANES.cut) race.cut = true;
  const laps = Math.max(0, Math.floor(race.dist / LAP_LENGTH));
  while (race.laps < laps) {
    race.laps++;
    race.lapTimes.push(tMs - race.lastLapAt);
    race.lastLapAt = tMs;
  }
  return race;
}

const START_BACK = 4; // m: the skater lines up this far before the start line
const RACE_START = trackPoint(-START_BACK, 2.2); // (the inner lane, a little out from the line)
const lapText = (race, i) => {
  const run = Math.max(0, race.dist - i * LAP_LENGTH);
  return `${fmtDist(Math.min(LAP_LENGTH, run))} of ${LAP_LENGTH.toFixed(0)} m`;
};

export const SPEED_SKATING_MISSION = {
  id: 'speed-skating',
  title: 'Speed skating: 2 × 400 m',
  intro: 'The Natureisbahn Davos, Europe\'s largest natural ice rink: two laps of the 400 m track against the clock, counter-clockwise. Hold W (the joystick up) and the skates stroke by themselves; press Space (Push) just as the rhythm bar fills for a power stroke. A/D lean into the turns, S brakes. Stay outside the inner cones: a cut across the infield disqualifies.',
  mode: 'person',
  season: 'winter',
  time: 'golden',
  features: ['skates', 'speedTrack'],
  skates: { params: 'speed', ice: 'track' },
  bonusMs: 90 * 1000,
  medals: { gold: 90 * 1000, silver: 120 * 1000, bronze: 160 * 1000 },
  colour: '#36c5f0',
  icon: 'skate',
  finish: 'Through the finish: two laps on Europe\'s largest natural ice rink.',
  start: { x: RACE_START.x, z: RACE_START.z, heading: RACE_START.heading },
  props: [],
  createState() { return { race: createRaceState(), skater: null }; },
  update(ctx, state) {
    if (ctx.mode !== 'person') return;
    updateRace(state.race, ctx.x, ctx.z, ctx.t);
    state.race.maxSpeed = Math.max(state.race.maxSpeed, ctx.speed || 0);
  },
  summary(state) {
    const r = state.race;
    const lines = [];
    if (r.lapTimes.length) lines.push(r.lapTimes.map((t, i) => `Lap ${i + 1}: ${fmtTime(t)}`).join(' · '));
    lines.push(`Top speed ${((r.maxSpeed || 0) * 3.6).toFixed(1)} km/h · ${r.power} power strokes of ${r.strokes}${r.stumbles ? ` · ${r.stumbles} stumbles` : ''}`);
    return lines;
  },
  objectives: Array.from({ length: RACE_LAPS }, (_, i) => ({
    id: `lap${i + 1}`,
    title: i === RACE_LAPS - 1 ? `Lap ${i + 1} of ${RACE_LAPS}: to the finish` : `Lap ${i + 1} of ${RACE_LAPS}`,
    check(ctx, state) {
      const r = state.race;
      if (r.cut) return { done: false, progress: null, text: 'Disqualified: you cut across the infield', target: null, hint: null, fail: 'Disqualified: you cut across the infield inside the cones.' };
      const done = r.dist >= (i + 1) * LAP_LENGTH;
      const run = r.dist - i * LAP_LENGTH;
      // the target: the finish line (the start line, one lap on), shown on the last 150 m
      const ahead = (i + 1) * LAP_LENGTH - r.dist;
      const line = trackPoint(0, 2);
      const kmh = ((ctx.speed || 0) * 3.6).toFixed(0);
      const text = `${lapText(r, i)} · ${kmh} km/h`;
      const hint = r.wrongWay > 20 ? 'Wrong way: the race runs counter-clockwise' : spineDistance(ctx.x, ctx.z) > TRACK_LANES.ice ? 'Off the ice: back onto the track' : null;
      return { done, progress: clamp(run / LAP_LENGTH, 0, 1), text, target: ahead < 150 ? { x: line.x, z: line.z, r: 4 } : null, hint };
    }
  }))
};

// =====================================================================================================================
// The penalty shoot-out in the Eisstadion
// The rink (60 × 30 m, corners 8.5 m) inside the arena under its roof, the long axis along the main ridge (WNW-ESE,
// js/landmark-buildings-data.js EISSTADION.kinks), centred under the apex; the goal at the ESE end. Local frame: x
// along the axis from the centre spot (the goal line at +GOAL_X), y across (to the right of a skater facing the goal).
const RIDGE = EISSTADION.kinks;
const RIDGE_L = Math.hypot(RIDGE[1][0] - RIDGE[0][0], RIDGE[1][1] - RIDGE[0][1]);
export const RINK = {
  x: EISSTADION.apex.x, z: EISSTADION.apex.z,
  ux: (RIDGE[1][0] - RIDGE[0][0]) / RIDGE_L, uz: (RIDGE[1][1] - RIDGE[0][1]) / RIDGE_L,
  halfL: 30, halfW: 15, corner: 8.5
};
export const HOCKEY = {
  goalX: 26, // the goal line, 4 m from the end boards
  postY: 0.915, // half the goal's mouth (1.83 m)
  puckR: 0.038,
  goalieX: 25.15, // where the goalie stands, out of his crease
  goalieReach: 0.38, // m either side of his centre: pads, body, glove and blocker
  goalieTrack: 2.4, // m/s across while he follows the puck
  goalieDive: 3.3, // m/s across once the shot is away
  reaction: [0.12, 0.22], // s before he moves on a shot
  poke: 1.9, // m: a skater this close to him loses the puck to his poke check
  shotSpeed: 27, // m/s
  timeLimit: 15, // s per penalty
  attempts: 5,
  resultSeconds: 2.2
};
// (the rink's local frame: y = across, positive to the right of a skater facing +x)
const RV = { x: -RINK.uz, z: RINK.ux }; // the +y direction in the world... (to the skater's right? see rinkLocal)
export function rinkLocal(x, z, R = RINK) {
  const dx = x - R.x, dz = z - R.z;
  // right of a skater facing u: (-cos h, sin h) with u = (sin h, cos h): right = (-uz, ux)
  return { x: dx * R.ux + dz * R.uz, y: dx * -R.uz + dz * R.ux };
}
export const rinkWorld = (lx, ly, R = RINK) => ({ x: R.x + R.ux * lx - R.uz * ly, z: R.z + R.uz * lx + R.ux * ly });
/** The local heading (0 along +x, positive towards +y) of a world heading, and back */
export const rinkHeadingLocal = (h, R = RINK) => { const fx = Math.sin(h), fz = Math.cos(h); return Math.atan2(fx * -R.uz + fz * R.ux, fx * R.ux + fz * R.uz); };
export const rinkHeadingWorld = (a, R = RINK) => { const dx = R.ux * Math.cos(a) - R.uz * Math.sin(a), dz = R.uz * Math.cos(a) + R.ux * Math.sin(a); return Math.atan2(dx, dz); };
void RV;

/** Keeps a point (local) inside the rink's boards (a rounded rectangle, `margin` m in from them); returns whether it hit */
export function clampToRink(p, margin = 0.5, R = RINK) {
  const hx = R.halfL - margin, hy = R.halfW - margin, c = Math.max(0.1, R.corner - margin);
  let hit = false;
  const ax = Math.abs(p.x), ay = Math.abs(p.y);
  if (ax > hx - c && ay > hy - c) {
    const cx = Math.sign(p.x) * (hx - c), cy = Math.sign(p.y) * (hy - c);
    const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
    if (d > c) { p.x = cx + (dx / d) * c; p.y = cy + (dy / d) * c; hit = true; }
  } else {
    if (ax > hx) { p.x = Math.sign(p.x) * hx; hit = true; }
    if (ay > hy) { p.y = Math.sign(p.y) * hy; hit = true; }
  }
  return hit;
}

export function createPenaltyGame(seed = 7) {
  const g = { attempt: 0, goals: 0, results: [], phase: 'skate', t: 0, maxX: 0, puck: null, goalie: { y: 0, vy: 0, dive: 0, react: 0, target: 0, saved: false }, rand: seededRandom(seed), resultT: 0, result: null };
  resetAttempt(g);
  return g;
}

function resetAttempt(g) {
  g.phase = 'skate';
  g.t = 0;
  g.maxX = 0;
  g.puck = { x: 0.9, y: 0.25, vx: 0, vy: 0 };
  Object.assign(g.goalie, { y: 0, vy: 0, react: 0, target: 0, saved: false, dive: 0 });
  g.result = null;
  g.resultT = 0;
}

/** Where a puck from (x, y) heading `a` (local) crosses the line at `lineX`: its y, or null when it doesn't go there */
export function crossingY(x, y, a, lineX) {
  const c = Math.cos(a);
  if (c <= 1e-3 || lineX <= x) return null;
  return y + Math.tan(a) * (lineX - x);
}

function endAttempt(g, result) {
  g.phase = 'result';
  g.result = result;
  g.results.push(result);
  if (result === 'goal') g.goals++;
  g.resultT = 0;
}

/**
 * One step of a penalty. `carrier`: the skater { x, y, heading (local) } while the puck is on the stick; `shot`: the
 * aim (a local heading) when the skater shoots this frame, else null. Returns 'next' when the next penalty is to be
 * lined up (the caller puts the skater back on the centre spot), 'done' after the last one.
 */
export function stepPenalty(g, dt, carrier, shot = null) {
  const H = HOCKEY, gl = g.goalie;
  if (g.phase === 'done') return null;
  if (g.phase === 'result') {
    g.resultT += dt;
    if (g.resultT >= H.resultSeconds) {
      g.attempt++;
      if (g.attempt >= H.attempts) { g.phase = 'done'; return 'done'; }
      resetAttempt(g);
      return 'next';
    }
    stepGoalie(g, dt, g.puck.x, g.puck.y, H.goalieTrack);
    return null;
  }
  g.t += dt;
  if (g.phase === 'skate') {
    // the puck on the blade: in front of the skater, a little to his right
    const c = Math.cos(carrier.heading), s = Math.sin(carrier.heading);
    g.puck.x = carrier.x + c * 0.85 - s * 0.25;
    g.puck.y = carrier.y + s * 0.85 + c * 0.25;
    g.maxX = Math.max(g.maxX, g.puck.x);
    stepGoalie(g, dt, g.puck.x, g.puck.y, H.goalieTrack);
    if (Math.hypot(g.puck.x - H.goalieX, g.puck.y - gl.y) < H.poke || g.puck.x > H.goalieX - 0.3) { endAttempt(g, 'poke'); return null; }
    if (g.puck.x < g.maxX - 1.5) { endAttempt(g, 'back'); return null; }
    if (g.t > H.timeLimit) { endAttempt(g, 'time'); return null; }
    if (shot !== null && shot !== undefined) {
      g.phase = 'shot';
      g.puck.vx = Math.cos(shot) * H.shotSpeed;
      g.puck.vy = Math.sin(shot) * H.shotSpeed;
      gl.react = H.reaction[0] + g.rand() * (H.reaction[1] - H.reaction[0]);
      const cy = crossingY(g.puck.x, g.puck.y, shot, H.goalieX);
      gl.target = cy === null ? gl.y : clamp(cy, -1.6, 1.6);
      g.shotFrom = { x: g.puck.x, y: g.puck.y, a: shot };
    }
    return null;
  }
  // the shot: the puck flies, the goalie dives after his reaction; met at his line, or past the goal line
  const steps = 4, h = dt / steps;
  for (let k = 0; k < steps; k++) {
    gl.react -= h;
    if (gl.react <= 0) {
      const d = gl.target - gl.y;
      const v = Math.sign(d) * Math.min(Math.abs(d) / h, H.goalieDive);
      gl.y += v * h;
      gl.dive = Math.max(gl.dive, Math.min(1, Math.abs(gl.target) / 0.8));
    }
    const px = g.puck.x, py = g.puck.y;
    const nx = px + g.puck.vx * h, ny = py + g.puck.vy * h;
    if (px < H.goalieX && nx >= H.goalieX) {
      const f = (H.goalieX - px) / (nx - px), y = py + (ny - py) * f;
      if (Math.abs(y - gl.y) <= H.goalieReach + H.puckR) {
        g.puck.x = H.goalieX - 0.05; g.puck.y = y;
        g.puck.vx = -g.puck.vx * 0.25; g.puck.vy = (y - gl.y) * 6;
        gl.saved = true;
        endAttempt(g, 'save');
        return null;
      }
    }
    if (px < H.goalX && nx >= H.goalX) {
      const f = (H.goalX - px) / (nx - px), y = py + (ny - py) * f;
      g.puck.x = nx; g.puck.y = ny;
      endAttempt(g, Math.abs(y) <= H.postY - H.puckR ? 'goal' : Math.abs(y) <= H.postY + H.puckR ? 'post' : 'wide');
      if (g.result === 'goal') { g.puck.vx *= 0.15; g.puck.vy *= 0.15; }
      return null;
    }
    g.puck.x = nx; g.puck.y = ny;
    if (g.t > H.timeLimit + 3 || Math.abs(ny) > RINK.halfW) { endAttempt(g, 'wide'); return null; }
  }
  return null;
}

function stepGoalie(g, dt, px, py, speed) {
  const gl = g.goalie, H = HOCKEY;
  // on the line from the puck to the middle of the goal, at his depth
  const depth = Math.max(0.4, H.goalX - px);
  const want = clamp(py * (H.goalX - H.goalieX) / depth, -0.75, 0.75);
  const d = want - gl.y;
  gl.vy = Math.sign(d) * Math.min(Math.abs(d) * 8, speed);
  gl.y += gl.vy * dt;
  gl.dive = Math.max(0, gl.dive - dt * 2);
}

export const PENALTY_RESULT_TEXT = { goal: 'GOAL!', save: 'Saved by the goalie', poke: 'Poke check: the goalie took the puck', back: 'The puck went backwards: no goal', time: 'Too slow: time is up', wide: 'Wide of the goal', post: 'Off the post!' };

const HOCKEY_PIN = rinkWorld(RINK.halfL + 26, 0); // outside the ESE gable, on the car park side
const HOCKEY_START = rinkWorld(-1.5, 0);

export const HOCKEY_PENALTY_MISSION = {
  id: 'hockey-penalty',
  title: 'Penalty shoot-out in the Eisstadion',
  intro: 'The HCD\'s home ice in the Eisstadion Davos: five penalties against the goalie. Skate at him with the puck (W, A/D to steer, S to stop), aim with your direction — the red mark on the goal line shows where the shot goes — and shoot with Space (the Shoot button). Get close, but not too close: he pokes the puck off a skater within two metres. Medals by goals.',
  mode: 'person',
  season: null,
  time: 'golden',
  features: ['skates', 'hockey'],
  skates: { params: 'hockey', ice: 'rink' },
  scoreMode: true,
  score: (state) => state.game.goals,
  scoreUnit: 'goals',
  medals: { gold: 4, silver: 3, bronze: 2 },
  colour: '#e2231a',
  icon: 'hockey',
  pin: HOCKEY_PIN,
  finish: 'Shoot-out over: the Eisstadion\'s ice is yours.',
  start: { x: HOCKEY_START.x, z: HOCKEY_START.z, heading: rinkHeadingWorld(0) },
  props: [],
  createState() { return { game: createPenaltyGame(Math.floor(Math.random() * 1e9)) }; },
  update() {},
  summary(state) {
    const g = state.game;
    return [`${g.goals} of ${HOCKEY.attempts} scored: ${g.results.map((r) => (r === 'goal' ? '●' : '○')).join(' ')}`];
  },
  objectives: Array.from({ length: HOCKEY.attempts }, (_, i) => ({
    id: `penalty${i + 1}`,
    title: `Penalty ${i + 1} of ${HOCKEY.attempts}`,
    check(ctx, state) {
      const g = state.game;
      const done = g.attempt > i; // (the result shown, the next penalty lined up)
      const goalPt = rinkWorld(HOCKEY.goalX, 0);
      const last = g.results.length > i ? PENALTY_RESULT_TEXT[g.results[i]] : null;
      const text = last ? `${last} · ${g.goals} ${g.goals === 1 ? 'goal' : 'goals'}` : g.phase === 'shot' ? 'Shot!' : `${g.goals} ${g.goals === 1 ? 'goal' : 'goals'} · ${Math.max(0, HOCKEY.timeLimit - g.t).toFixed(0)} s left`;
      // (no marker over the goal: it would stand in front of the goalie; the arrow points the way)
      void goalPt;
      return { done, progress: g.phase === 'skate' ? clamp(g.maxX / (HOCKEY.goalX - 4), 0, 1) : null, text, target: null, hint: g.phase === 'skate' ? 'Shoot: Space' : null };
    }
  }))
};

// =====================================================================================================================
// Curling on the Eisbahn's hard court (js/landmark-buildings-data.js EISBAHN.court, ~39 × 59 m: one sheet down its
// long side). The sheet (WCF): 45.72 × 4.75 m; the tee lines 17.375 m either side of its middle (34.75 m apart), the
// hog lines 6.40 m inside them, the back lines 1.83 m behind them, the hacks 3.66 m behind them; the house's rings
// 0.15 (button), 0.61, 1.22 and 1.83 m. Local frame: s along the sheet (0 the middle, + towards the house played at), t
// across (positive: to the thrower's right). The stones (19.96 kg, 0.145 m radius) slide with a constant deceleration
// (less while swept), curl towards their turn (more as they slow) and meet elastically.
const COURT = EISBAHN.court;
const COURT_C = { x: COURT.reduce((s, p) => s + p[0], 0) / 4, z: COURT.reduce((s, p) => s + p[1], 0) / 4 };
const COURT_LONG = { x: COURT[3][0] - COURT[0][0], z: COURT[3][1] - COURT[0][1] };
const COURT_LONG_L = Math.hypot(COURT_LONG.x, COURT_LONG.z);
export const SHEET = {
  x: COURT_C.x, z: COURT_C.z, ux: COURT_LONG.x / COURT_LONG_L, uz: COURT_LONG.z / COURT_LONG_L,
  halfL: 22.86, halfW: 2.375,
  tee: 17.375, hog: 10.975, back: 19.205, hack: 21.035,
  rings: [0.15, 0.61, 1.22, 1.83]
};
export const CURLING = {
  stoneR: 0.145,
  stones: 8,
  release: -11.6, // s: the stone leaves the hand just before the near hog line
  decel: 0.5, // m/s² on the ice (sim units; the sim runs SIM_SPEED times real time)
  sweptDecel: 0.36,
  curl: 0.075, // the curl's sideways pull at a crawl (m/s², falls off with speed)
  sweptCurl: 0.6, // (sweeping straightens the stone a little)
  restitution: 0.9,
  minV: 4.0, maxV: 7.2, // m/s at release: power 0..1
  aimMax: 0.075, // rad either way
  simSpeed: 1.6
};
export const CURLING_POINTS = [5, 4, 2, 1]; // in the button, the 4-foot, the 8-foot, the 12-foot (touching the ring counts)

export const sheetLocal = (x, z, S = SHEET) => { const dx = x - S.x, dz = z - S.z; return { s: dx * S.ux + dz * S.uz, t: dx * -S.uz + dz * S.ux }; };
export const sheetWorld = (s, t, S = SHEET) => ({ x: S.x + S.ux * s - S.uz * t, z: S.z + S.uz * s + S.ux * t });
export const sheetHeading = (S = SHEET) => Math.atan2(S.ux, S.uz);

/** The release speed for a power 0..1 */
export const curlingSpeed = (power) => CURLING.minV + (CURLING.maxV - CURLING.minV) * clamp(power, 0, 1);

/** The points a stone at (s, t) scores: by the ring it lies in or touches; 0 outside the house */
export function stonePoints(s, t, S = SHEET) {
  const d = Math.hypot(s - S.tee, t) - CURLING.stoneR;
  for (let i = 0; i < S.rings.length; i++) if (d <= S.rings[i]) return CURLING_POINTS[i];
  return 0;
}

export function curlingScore(game) {
  let sum = 0;
  for (const st of game.stones) if (st.inPlay && !st.moving) sum += stonePoints(st.s, st.t);
  return sum;
}

export function createCurlingGame() {
  return { stones: [], phase: 'aim', aim: 0, curl: 1, power: 0, charge: 0, chargeDir: 1, current: -1, settleT: 0, log: [] };
}

/** Delivers the next stone: from the release point along `aim` (rad, positive to the right), `curl` +1 (clockwise:
 *  curls to the right) or -1, the release speed from `power` */
export function throwStone(game, power, aim, curl) {
  const v = curlingSpeed(power);
  const a = clamp(aim, -CURLING.aimMax, CURLING.aimMax);
  const st = { s: CURLING.release, t: 0, vs: Math.cos(a) * v, vt: Math.sin(a) * v, spin: Math.sign(curl) || 1, inPlay: true, moving: true, n: game.stones.length + 1, out: null };
  game.stones.push(st);
  game.current = game.stones.length - 1;
  game.phase = 'travel';
  game.settleT = 0;
  return st;
}

/** One step of the stones (dt in sim seconds); `sweep`: the current stone is swept. Returns true while any moves */
export function stepStones(game, dt, sweep = false) {
  const C = CURLING, S = SHEET, R = C.stoneR;
  const steps = Math.max(1, Math.ceil(dt / 0.01)), h = dt / steps;
  let moving = false;
  for (let k = 0; k < steps; k++) {
    moving = false;
    for (const st of game.stones) {
      if (!st.inPlay || !st.moving) continue;
      const v = Math.hypot(st.vs, st.vt);
      if (v < 0.01) { st.moving = false; st.vs = st.vt = 0; continue; }
      const swept = sweep && st === game.stones[game.current];
      const dec = swept ? C.sweptDecel : C.decel;
      const nv = Math.max(0, v - dec * h);
      // the curl: sideways to the motion, towards the turn, stronger as the stone slows
      const curl = st.spin * C.curl * (swept ? C.sweptCurl : 1) / (0.35 + v * 0.55) * h;
      const ux = st.vs / v, uy = st.vt / v;
      st.vs = ux * nv + -uy * curl;
      st.vt = uy * nv + ux * curl;
      // (the curl must not speed the stone up)
      const v2 = Math.hypot(st.vs, st.vt);
      if (v2 > nv && v2 > 0) { st.vs *= nv / v2; st.vt *= nv / v2; }
      st.s += st.vs * h;
      st.t += st.vt * h;
      if (nv <= 0) { st.moving = false; st.vs = st.vt = 0; }
      else moving = true;
      // out over the side lines or past the back line
      if (Math.abs(st.t) > S.halfW - R) { st.inPlay = false; st.moving = false; st.out = 'side'; }
      else if (st.s - R > S.back) { st.inPlay = false; st.moving = false; st.out = 'back'; }
    }
    // collisions: equal masses, along the line of centres
    const list = game.stones;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.inPlay) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.inPlay || (!a.moving && !b.moving)) continue;
        const dx = b.s - a.s, dy = b.t - a.t, d = Math.hypot(dx, dy);
        if (d >= 2 * R || d < 1e-6) continue;
        const nx = dx / d, ny = dy / d;
        const rel = (a.vs - b.vs) * nx + (a.vt - b.vt) * ny;
        // separate them
        const push = (2 * R - d) / 2;
        a.s -= nx * push; a.t -= ny * push; b.s += nx * push; b.t += ny * push;
        if (rel <= 0) continue;
        const J = rel * (1 + C.restitution) / 2;
        a.vs -= J * nx; a.vt -= J * ny; b.vs += J * nx; b.vt += J * ny;
        a.moving = b.moving = true;
        a.struck = b.struck = true;
        b.spin *= 0.3; // (a struck stone barely turns)
        game.hits = (game.hits || 0) + 1;
        moving = true;
      }
    }
  }
  return moving;
}

/** After all stones stopped: the hog-line rule (a delivered stone must come to rest past the far hog line, unless it
 *  struck another), and the next stone or the end */
export function settleStones(game) {
  const cur = game.stones[game.current];
  if (cur && cur.inPlay && cur.s + CURLING.stoneR < SHEET.hog && !cur.struck) { cur.inPlay = false; cur.out = 'hog'; }
  game.log.push({ n: game.current + 1, out: cur?.out || null, score: curlingScore(game) });
  game.phase = game.stones.length >= CURLING.stones ? 'done' : 'aim';
  return game.phase;
}

/** The whole slide of a stone with nothing in its way (tests, the aim's preview): { s, t, time } where it stops */
export function previewStone(power, aim, curl, sweep = false, stones = []) {
  const g = { stones: stones.map((s) => ({ ...s })), current: 0 };
  throwStone(g, power, aim, curl);
  let time = 0;
  while (stepStones(g, 0.05, sweep) && time < 120) time += 0.05;
  const st = g.stones[g.current];
  return { s: st.s, t: st.t, time, inPlay: st.inPlay, out: st.out };
}

const CURL_HACK = sheetWorld(-SHEET.hack, 0);

export const CURLING_MISSION = {
  id: 'curling',
  title: 'Curling on the Eisbahn',
  intro: 'A sheet on the hard court beside the 400 m track at the Natureisbahn: eight stones for the house at the far end. Aim with A/D (or drag), pick the curl with W/S (clockwise curls right), hold Space (Throw) for the power bar and let go to deliver. While the stone slides, hold Space to sweep: it runs further and straighter. Points by the ring each stone ends in: button 5, 4-foot 4, 8-foot 2, 12-foot 1.',
  mode: 'person',
  season: 'winter',
  time: 'golden',
  features: ['curling'],
  scoreMode: true,
  score: (state) => curlingScore(state.game),
  scoreUnit: 'points',
  medals: { gold: 14, silver: 8, bronze: 4 },
  colour: '#8f6bff',
  icon: 'curling',
  finish: 'End complete: the stones are counted.',
  start: { x: CURL_HACK.x, z: CURL_HACK.z, heading: sheetHeading() },
  props: [],
  createState() { return { game: createCurlingGame() }; },
  update() {},
  summary(state) {
    const g = state.game;
    const ins = g.stones.filter((s) => s.inPlay && stonePoints(s.s, s.t) > 0).length;
    return [`${ins} of ${CURLING.stones} stones in the house · ${curlingScore(g)} points`];
  },
  objectives: [0, 1].map((half) => ({
    id: half ? 'stones-5-8' : 'stones-1-4',
    title: half ? 'Stones 5 to 8' : 'Stones 1 to 4',
    check(ctx, state) {
      const g = state.game;
      const settled = g.phase === 'done' ? g.stones.length : g.stones.length - (g.phase === 'travel' ? 1 : 0);
      const need = half ? CURLING.stones : CURLING.stones / 2;
      const n = Math.min(CURLING.stones, g.stones.length + (g.phase === 'aim' ? 1 : 0));
      const text = `Stone ${n} of ${CURLING.stones} · ${curlingScore(g)} points`;
      return { done: settled >= need && g.phase !== 'travel', progress: clamp((settled - (half ? 4 : 0)) / 4, 0, 1), text, target: null, hint: g.phase === 'travel' ? 'Sweep: hold Space' : g.phase === 'aim' ? 'Hold Space, let go to throw' : null };
    }
  }))
};

export const ICE_MISSIONS = [SPEED_SKATING_MISSION, HOCKEY_PENALTY_MISSION, CURLING_MISSION];
