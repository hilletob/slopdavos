// js/missions-data-jetpack.js
// The jetpack demo of the WEF week (js/missions-data.js spreads JETPACK_MISSIONS into MISSIONS; js/missions-jetpack.js has
// its runtime: the pack on the pilot's back, its flames and steam, the gates of light, the pads and the HUD).
// No three.js and no DOM in here (tests/missions-jetpack.test.mjs flies it, a bot on the real terrain).
//
// The story: January, the World Economic Forum. A start-up from Zürich wants to show its jetpack to the investors on the
// terrace of the Berghotel Schatzalp (the sanatorium of Thomas Mann's Magic Mountain, 300 m above Davos Platz), but its test
// pilot sits in the tailback at the Wolfgang and the Schatzalpbahn is booked out by the delegations. The player, hired to
// carry the fuel cans, flies the demo: from the Kurpark by the Kongresszentrum through the gates of light over the town
// (the Kirchner Museum, the Eisstadion, low over the Natureisbahn, round the spire of St. Johann), down to the pit crew
// on the Promenade below the Schatzalpbahn for a full tank, then up along the funicular's line to the hotel's terrace.
//
// The places (js/davos-frame.js: x = E − 2782500, z = 1185500 − N, y = height − 1558): OpenStreetMap (w116881156 Kurpark,
// w116881075 St. Johann, w123384643 Schatzalpbahn Talstation, n286680672 Schatzalp, w425943705 Berghotel Schatzalp), the
// open spots for the start and the pad from js/davos-geodata.js' buildings and the terrain (the flattest ground clear of
// houses); the terrace: the level strip of the terrain in front of the hotel's south front.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
export const H0 = 1558; // m a.s.l. of y = 0

export const JP = {
  step: 1 / 60, // s per sub-step
  g: 9.81,
  // the pack's flight computer holds the height by itself: Space climbs, Q sinks, neither hovers
  climbV: 11, // m/s up at full thrust
  sinkV: 8, // m/s down with the thrust cut back (high up; slower close to the ground: flareV at touch-down)
  flareV: 2.2, flareAgl: 12, // the computer's flare: the sink eases to this over the last metres
  upAccel: 7.5, downAccel: 6.5, // m/s² the vertical speed can change by
  // forward: the body leans and the thrust pushes; the air brakes
  accel: 9, // m/s² at full lean (W)
  brake: 8, // m/s² leaning back (S)
  drag: 0.0115, // quadratic: 28 m/s (100 km/h) flat out
  rest: 0.35, // 1/s: with the stick let go the pack comes to a hover
  slip: 2.2, // 1/s: how fast the flight follows the nose in a turn
  backMax: 6, // m/s backwards at most
  yaw: 1.75, yawFast: 1.15, // rad/s of turn standing in the air and flat out
  leanMax: 0.52, leanBack: 0.3, leanTau: 0.25, // rad the body leans, and how fast
  ceiling: 280, // m over the ground: above it the thrust no longer climbs
  walk: 2.4, // m/s on the ground
  // the tank (in percent): what a second in the air costs
  burnHover: 0.75, burnClimb: 0.6, burnLean: 0.18, burnSink: 0.36,
  refuel: 30, // percent a second on a pad
  // the landings
  tumbleSpeed: 8, // m/s over the ground at touch-down: faster is a tumble (a time penalty)
  tumblePenaltyMs: 10000,
  crashSink: 12, // m/s into the ground: only a dry tank falls that fast
  bumpPenaltyMs: 3000, // into a wall
  gateR: 12 // m: the gates' radius
};

export const START = { x: 54, z: -474, heading: -1.75, name: 'Kurpark, by the Kongresszentrum' };
export const PAD = { x: -570, z: -85, r: 7, name: 'the pit crew on the Promenade' };
export const TERRACE = { x: -1190, z: -568.5, r: 8, name: 'the terrace of the Berghotel Schatzalp' };

/** The gates of light, in their order: where, how high over the ground their centre hangs. `leg` 0: over the town, before
 *  the full tank; `leg` 1: the climb along the Schatzalpbahn */
export const GATES = [
  { id: 'kurpark', name: 'Kurpark', x: -63, z: -452, agl: 24, leg: 0 },
  { id: 'kirchner', name: 'Kirchner Museum', x: -220, z: -493, agl: 32, leg: 0 },
  { id: 'eisstadion', name: 'Eisstadion', x: -242, z: -315, agl: 46, leg: 0 },
  { id: 'natureisbahn', name: 'Natureisbahn', x: -271, z: -162, agl: 11, leg: 0 },
  { id: 'platz', name: 'Davos Platz', x: -420, z: 80, agl: 42, leg: 0 },
  { id: 'st-johann', name: 'the spire of St. Johann', x: -538, z: 279, agl: 66, leg: 0 },
  { id: 'funicular-1', name: 'Schatzalpbahn, the lower section', x: -730, z: -259, agl: 34, leg: 1 },
  { id: 'funicular-2', name: 'Schatzalpbahn, the passing loop', x: -847, z: -370, agl: 34, leg: 1 },
  { id: 'funicular-3', name: 'Schatzalpbahn, below the hotel', x: -995, z: -500, agl: 34, leg: 1 }
];
export const TOWN_GATES = GATES.filter((g) => g.leg === 0).length;

/** A gate's centre in the world: { x, y, z } */
export function gatePoint(gate, groundAt, out = { x: 0, y: 0, z: 0 }) {
  out.x = gate.x; out.z = gate.z; out.y = groundAt(gate.x, gate.z) + gate.agl;
  return out;
}
/** The course's waypoints in order (the start, the gates, the pad between the legs, the terrace): [{ x, z, agl, kind }] */
export function coursePoints() {
  const pts = [{ ...START, agl: 0, kind: 'start' }];
  GATES.forEach((g, i) => {
    if (i === TOWN_GATES) pts.push({ ...PAD, agl: 0, kind: 'pad' });
    pts.push({ ...g, kind: 'gate' });
  });
  pts.push({ ...TERRACE, agl: 0, kind: 'terrace' });
  return pts;
}
/** The course's length over the ground, m */
export function courseLength() {
  const p = coursePoints();
  let d = 0;
  for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
  return d;
}

// --- The flight -----------------------------------------------------------------------------------------------------------
export function createJet(start = START) {
  return {
    phase: 'ground', // ground | air | crashed
    x: start.x, y: null, z: start.z, heading: start.heading, vx: 0, vy: 0, vz: 0, lean: 0, turn: 0, thrust: 0, speed: 0, agl: 0, ground: 0,
    fuel: 100, gate: 0, gateY: null, refuelled: false, refuelling: false, onPad: false, landed: false, dry: false,
    airtime: 0, t: 0, acc: 0, burned: 0, tumbles: 0, bumps: 0, penaltyMs: 0, landing: null, events: []
  };
}

const onSpot = (f, spot) => Math.hypot(f.x - spot.x, f.z - spot.z) <= spot.r;
const START_PAD = { x: START.x, z: START.z, r: 6 };

/**
 * One frame of the flight. `input`: { pitch (-1..1, + forward), turn (-1..1, + left), up (0-1, climb), down (0-1, sink) },
 * `dt` the game's seconds, `groundAt(x, z, y)` the ground under (x, z) for someone at the height y (the terrain; the
 * runtime adds the roofs below the pilot), `solidAt(x, y, z)` whether a wall stands there (the runtime: the houses).
 */
export function stepJet(f, input, dt, groundAt, solidAt = null) {
  if (f.y === null) { f.y = f.ground = groundAt(f.x, f.z, Infinity); }
  if (f.phase === 'crashed') return f;
  f.acc += Math.min(dt, 0.25);
  while (f.acc >= JP.step) {
    f.acc -= JP.step;
    sub(f, input, JP.step, groundAt, solidAt);
    if (f.phase === 'crashed') { f.acc = 0; break; }
  }
  return f;
}

function sub(f, input, h, groundAt, solidAt) {
  const pitch = clamp(input.pitch || 0, -1, 1), turn = clamp(input.turn || 0, -1, 1);
  const up = clamp(+input.up || 0, 0, 1), down = up > 0 ? 0 : clamp(+input.down || 0, 0, 1);
  f.t += h;
  f.turn = turn;
  if (f.phase === 'ground') {
    // on foot with the pack on the back: a few steps, the tank filled on a pad, Space lifts off
    f.heading = wrap(f.heading + turn * 2.2 * h);
    const v = pitch * JP.walk;
    const nx = f.x + Math.sin(f.heading) * v * h, nz = f.z + Math.cos(f.heading) * v * h;
    if (!solidAt || !solidAt(nx, f.y + 0.3, nz)) { f.x = nx; f.z = nz; }
    f.y = f.ground = groundAt(f.x, f.z, f.y + 0.5);
    f.vx = f.vz = f.vy = 0; f.speed = Math.abs(v); f.agl = 0; f.thrust = 0;
    f.lean += (0 - f.lean) * Math.min(1, h / JP.leanTau);
    f.onPad = onSpot(f, PAD) || onSpot(f, START_PAD);
    f.refuelling = f.onPad && f.fuel < 100;
    if (f.refuelling) f.fuel = Math.min(100, f.fuel + JP.refuel * h);
    if (f.fuel >= 100 && f.gate >= TOWN_GATES && onSpot(f, PAD) && !f.refuelled) { f.refuelled = true; f.events.push('refuelled'); }
    f.dry = f.fuel <= 0 && !f.onPad && !onTerrace(f);
    if (up > 0 && f.fuel > 0) { f.phase = 'air'; f.vy = 1.5; f.y += 0.02; f.landed = false; f.events.push('liftoff'); }
    return;
  }
  // --- in the air ---
  const powered = f.fuel > 0;
  const ground0 = groundAt(f.x, f.z, f.y);
  const agl0 = f.y - ground0;
  // the nose, slower at speed
  const hs0 = Math.hypot(f.vx, f.vz);
  f.heading = wrap(f.heading + turn * (JP.yaw + (JP.yawFast - JP.yaw) * clamp(hs0 / 26, 0, 1)) * h);
  const sx = Math.sin(f.heading), sz = Math.cos(f.heading);
  // the lean and its push
  const leanWant = powered ? (pitch >= 0 ? pitch * JP.leanMax : pitch * JP.leanBack) : 0;
  f.lean += (leanWant - f.lean) * Math.min(1, h / JP.leanTau);
  let along = f.vx * sx + f.vz * sz, side = f.vx * sz - f.vz * sx;
  if (powered) {
    along += (pitch >= 0 ? pitch * JP.accel : pitch * JP.brake) * h;
    if (pitch === 0) along -= along * Math.min(1, JP.rest * h);
    if (along < -JP.backMax) along = -JP.backMax;
  }
  side -= side * Math.min(1, JP.slip * h);
  const hs = Math.hypot(along, side);
  const k = Math.max(0, 1 - JP.drag * hs * h);
  along *= k; side *= k;
  f.vx = along * sx + side * sz; f.vz = along * sz - side * sx;
  // the height: the computer flies the vertical speed the keys ask for
  if (powered) {
    const sink = JP.flareV + (JP.sinkV - JP.flareV) * clamp(agl0 / JP.flareAgl, 0, 1);
    const want = up > 0 ? (agl0 > JP.ceiling ? 0 : JP.climbV * up) : down > 0 ? -sink * down : 0;
    f.vy += clamp(want - f.vy, -JP.downAccel * h, JP.upAccel * h);
    const burn = JP.burnHover + JP.burnClimb * up + JP.burnLean * Math.abs(pitch) - (JP.burnHover - JP.burnSink) * down;
    f.fuel = Math.max(0, f.fuel - burn * h);
    f.burned += burn * h;
    f.thrust += ((0.55 + 0.45 * up - 0.3 * down + 0.15 * Math.abs(pitch)) - f.thrust) * Math.min(1, h * 8);
    if (f.fuel <= 0) f.events.push('dry');
  } else {
    f.vy = Math.max(-22, f.vy - JP.g * h);
    f.thrust += (0 - f.thrust) * Math.min(1, h * 8);
  }
  // the move: a wall in the way stops it (and costs a few seconds)
  let nx = f.x + f.vx * h, nz = f.z + f.vz * h;
  if (solidAt && solidAt(nx, f.y, nz)) {
    if (Math.hypot(f.vx, f.vz) > 4) { f.bumps++; f.penaltyMs += JP.bumpPenaltyMs; f.events.push('bump'); }
    f.vx *= -0.35; f.vz *= -0.35;
    nx = f.x; nz = f.z;
  }
  f.x = nx; f.z = nz;
  f.y += f.vy * h;
  f.airtime += h;
  const ground = f.ground = groundAt(f.x, f.z, f.y);
  f.agl = f.y - ground;
  f.speed = Math.hypot(f.vx, f.vz);
  // the gates, in their order (the climb's only with the full tank)
  const gate = GATES[f.gate];
  if (gate && (gate.leg === 0 || f.refuelled)) {
    const gy = f.gateY = groundAt(gate.x, gate.z, Infinity) + gate.agl;
    if (Math.hypot(f.x - gate.x, f.y + 1 - gy, f.z - gate.z) <= JP.gateR) { f.gate++; f.events.push('gate'); }
  }
  // the ground
  if (f.y <= ground && f.vy <= 0) {
    const sink = -f.vy, speed = f.speed;
    f.y = ground; f.agl = 0;
    f.landing = { sink, speed, tumble: speed > JP.tumbleSpeed, crash: sink > JP.crashSink };
    if (f.landing.crash) { f.phase = 'crashed'; f.events.push('crash'); f.vx = f.vy = f.vz = 0; f.speed = 0; f.thrust = 0; return; }
    if (f.landing.tumble) { f.tumbles++; f.penaltyMs += JP.tumblePenaltyMs; f.events.push('tumble'); } else f.events.push('landed');
    f.phase = 'ground'; f.landed = true;
    f.vx = f.vy = f.vz = 0; f.speed = 0; f.thrust = 0;
  }
}

export const inAir = (f) => f.phase === 'air';
export const onTerrace = (f) => f.phase === 'ground' && f.gate >= GATES.length && onSpot(f, TERRACE);

// --- A pilot for the tests: gate after gate, the pad, the terrace --------------------------------------------------------
/**
 * The bot's input: it flies at the next waypoint (a gate's centre, or 14 m over a landing spot), holds the line's height
 * (and the ground's plus `clear` m at least), slows down before a landing, sinks onto the spot and waits for the tank.
 */
export function botInput(f, groundAt, { cruise = 1, clear = 14 } = {}) {
  let target, landing = false;
  const gate = GATES[f.gate];
  if (gate && (gate.leg === 0 || f.refuelled)) target = { x: gate.x, z: gate.z, y: groundAt(gate.x, gate.z, Infinity) + gate.agl - 1 };
  else { const s = gate ? PAD : TERRACE; landing = true; target = { x: s.x, z: s.z, y: groundAt(s.x, s.z, Infinity) }; }
  const dx = target.x - f.x, dz = target.z - f.z, d = Math.hypot(dx, dz);
  if (f.phase === 'ground') {
    if (landing && d <= 3) return {}; // on the spot: the tank fills, or the flight is over
    return { up: 1 };
  }
  const want = Math.atan2(dx, dz), diff = wrap(want - f.heading);
  const turn = clamp(diff * 3, -1, 1);
  const along = f.vx * Math.sin(want) + f.vz * Math.cos(want);
  let pitch, wantY;
  if (landing) {
    // the approach: the speed a braking distance allows, the height held over the spot until right above it
    const vWant = d < 1.2 ? 0 : Math.min(26 * cruise, Math.sqrt(2 * 5 * Math.max(0, d - 1)) + 0.6);
    pitch = Math.abs(diff) > 0.7 && d > 4 ? -0.3 : clamp((vWant - along) * 0.6, -1, 1);
    wantY = d < 2.2 && f.speed < 2.5 ? -Infinity : target.y + Math.min(40, 6 + d * 0.35);
  } else {
    pitch = Math.abs(diff) > 0.9 ? 0 : cruise;
    // (a turn the flight cannot make at this speed: slower)
    if (Math.abs(diff) > 0.45 && f.speed > 12) pitch = -0.6;
    wantY = target.y;
  }
  wantY = Math.max(wantY, landing && d < 6 ? -Infinity : f.ground + (d < 30 ? 2 : clear));
  if (wantY === -Infinity) return { pitch, turn, down: 1 };
  const dy = wantY - (f.y + (landing ? 0 : 1)), vyWant = clamp(dy * 1.2, -JP.sinkV, JP.climbV);
  const up = vyWant > f.vy + 0.4 && vyWant > 0.3 ? clamp(vyWant / JP.climbV + 0.15, 0.2, 1) : 0;
  const down = !up && vyWant < -0.6 ? clamp(-vyWant / JP.sinkV, 0.15, 1) : 0;
  return { pitch, turn, up, down };
}

// --- The mission -----------------------------------------------------------------------------------------------------------
export const JETPACK_ID = 'jetpack-schatzalp';
const failOf = (f) => (f.phase === 'crashed' ? 'The tank ran dry in the air and the jetpack came down like a stone. The investors look away.'
  : f.dry ? 'The tank is dry, and the pit crew is somewhere else. The demo ends on foot.' : null);
const gateText = (f) => {
  const g = GATES[f.gate];
  if (!g) return '';
  const d = Math.hypot(g.x - f.x, g.z - f.z), dy = Math.round((f.gateY ?? f.y) - f.y);
  const height = Math.abs(dy) < 6 ? 'level' : dy > 0 ? `${dy} m up` : `${-dy} m down`;
  return `Gate ${f.gate + 1}/${GATES.length}: ${g.name} · ${fmtDist(d)} · ${height}`;
};

export const JETPACK_MISSION = {
  id: JETPACK_ID,
  title: 'Jetpack demo: from the Kongress to the Schatzalp',
  intro: 'January, the World Economic Forum. A start-up from Zürich wants to show its jetpack to the investors waiting on the terrace of the Berghotel Schatzalp, the old sanatorium of the Magic Mountain. But the test pilot is stuck in the tailback at the Wolfgang, and the Schatzalpbahn is booked out by delegations. You were hired to carry the fuel cans. Now you wear the thing. Fly the demo: from the Kurpark by the Kongresszentrum through the gates of light over the town, low over the Natureisbahn and round the spire of St. Johann. Then land at the pit crew on the Promenade for a full tank, climb along the Schatzalpbahn and land on the hotel\'s terrace. Space climbs, Q sinks, with neither the pack hovers by itself; W leans forward, S brakes, A/D turn. On a phone the stick steers and the buttons climb and sink. Watch the tank: every second in the air burns fuel, climbing most. Touch down slower than 30 km/h or you tumble (+10 s); a wall costs 3 s.',
  mode: 'person',
  season: 'winter',
  time: 'golden',
  features: ['jetpack'],
  props: [],
  colour: '#ff6a1f',
  icon: 'jetpack',
  // (the bot, tests/missions-jetpack.test.mjs: 2.3 km over the ground and 320 m up, the gates on the line, the two
  // landings: 1:52, 60 % of the first tank and 47 % of the second. Gold with room over it, bronze for a flight that
  // wanders and hovers; the tank ends a leg after about two minutes in the air)
  bonusMs: 135000,
  medals: { gold: 135000, silver: 170000, bronze: 225000 },
  finish: 'You touch down between the deck chairs of the Magic Mountain. The investors spill their champagne, the start-up has its funding round before the steam has cleared, and the test pilot, still at the Wolfgang, is out of a job. It is yours now.',
  start: { x: START.x, z: START.z, heading: START.heading },
  createState() { return { flight: createJet(), get penaltyMs() { return this.flight.penaltyMs; } }; },
  summary(state) {
    const f = state.flight, t = Math.round(f.airtime);
    const pen = f.tumbles || f.bumps ? `${f.tumbles} tumble${f.tumbles === 1 ? '' : 's'} · ${f.bumps} wall${f.bumps === 1 ? '' : 's'} (+${Math.round(f.penaltyMs / 1000)} s)` : 'a clean flight: no penalties';
    return [`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} in the air · ${Math.round(f.burned)} % of a tank burned · ${pen}`];
  },
  objectives: [
    {
      id: 'town',
      title: 'Fly the gates over the town',
      allowModes: ['person'],
      check(ctx, state) {
        const f = state.flight, g = GATES[Math.min(f.gate, TOWN_GATES - 1)];
        return {
          done: f.gate >= TOWN_GATES, fail: failOf(f),
          progress: f.gate / TOWN_GATES,
          text: f.phase === 'ground' && f.gate === 0 ? 'Space: lift off' : gateText(f),
          target: { x: g.x, z: g.z, r: JP.gateR, style: 'plain' },
          hint: f.fuel < 20 ? 'The tank is nearly dry!' : null
        };
      }
    },
    {
      id: 'refuel',
      title: 'Land at the pit crew for a full tank',
      allowModes: ['person'],
      check(ctx, state) {
        const f = state.flight, d = Math.hypot(f.x - PAD.x, f.z - PAD.z);
        return {
          done: f.refuelled, fail: failOf(f),
          progress: f.refuelling || (f.onPad && f.phase === 'ground') ? f.fuel / 100 : null,
          text: f.refuelling ? `Refuelling … ${Math.round(f.fuel)} %` : `${fmtDist(d)} to ${PAD.name} · tank ${Math.round(f.fuel)} %`,
          // (standing on the pad: its column of light out of the way of the pilot and the crew's drums)
          target: f.phase === 'ground' && f.onPad ? null : { x: PAD.x, z: PAD.z, r: PAD.r, style: 'pad' },
          hint: f.phase === 'ground' && !f.onPad ? 'Not on the pad: Space, and hop over' : f.fuel < 20 ? 'The tank is nearly dry!' : d < 60 && f.speed > JP.tumbleSpeed ? 'Slow down for the landing: S' : null
        };
      }
    },
    {
      id: 'climb',
      title: 'Climb along the Schatzalpbahn',
      allowModes: ['person'],
      check(ctx, state) {
        const f = state.flight, g = GATES[Math.min(f.gate, GATES.length - 1)];
        return {
          done: f.gate >= GATES.length, fail: failOf(f),
          progress: (f.gate - TOWN_GATES) / (GATES.length - TOWN_GATES),
          text: f.phase === 'ground' ? 'Space: lift off' : gateText(f),
          target: { x: g.x, z: g.z, r: JP.gateR, style: 'plain' },
          hint: f.fuel < 20 ? 'The tank is nearly dry!' : null
        };
      }
    },
    {
      id: 'land',
      title: 'Land on the terrace of the Berghotel Schatzalp',
      allowModes: ['person'],
      check(ctx, state) {
        const f = state.flight, d = Math.hypot(f.x - TERRACE.x, f.z - TERRACE.z);
        return {
          done: onTerrace(f), fail: failOf(f),
          progress: null,
          text: `${fmtDist(d)} to the terrace · tank ${Math.round(f.fuel)} %`,
          target: { x: TERRACE.x, z: TERRACE.z, r: TERRACE.r, style: 'pad' },
          hint: f.phase === 'ground' ? 'Not on the terrace: Space, and hop over' : f.fuel < 20 ? 'The tank is nearly dry!' : d < 60 && f.speed > JP.tumbleSpeed ? 'Slow down for the landing: S' : null
        };
      }
    }
  ]
};

export const JETPACK_MISSIONS = [JETPACK_MISSION];
