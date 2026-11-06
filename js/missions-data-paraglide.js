// js/missions-data-paraglide.js
// A paraglider flight from the Rinerhorn (js/missions-data.js spreads PARAGLIDE_MISSIONS into MISSIONS; js/missions-paraglide.js
// has its runtime: the wing, the pilot in the harness, the clouds and birds over the thermals, the vario and the HUD).
// No three.js and no DOM in here (tests/missions-paraglide.test.mjs flies it, a bot in the thermals on the real terrain).
//
// The launch: a meadow on the west flank of the Rinerhorn ridge, ~2520 m, above the Jatzmeder (the Rinerhornbahn's top
// station); the landing field: the meadow on the valley floor at Glaris, beside the Rinerhornbahn's valley station (1450 m).
// The thermals: eight bubbles over sunny, steep faces (found in the terrain: facing south to west, a grade over 0.4), a cumulus
// on top of each at the cloud base. The world frame is js/davos-frame.js (x = E − 2782500, z = 1185500 − N, y = height − 1558).
//
// The flight runs on its own clock, PG.timeScale times the game's: a real paraglider glides a 1000 m drop in a quarter of an
// hour at 36 km/h, which is a long time to hold a key. All the numbers the pilot sees (speed, vario, airtime) are the
// flight's own, so they read like a real instrument's.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
export const H0 = 1558; // m a.s.l. of y = 0

export const PG = {
  timeScale: 2, // the flight's seconds per second of the game
  step: 1 / 30, // s of flight per sub-step
  g: 9.81,
  // the polar: sink = minSink + polarK (v - minSinkV)^2, more below the minimum-sink speed (the brakes deep, near the stall)
  trimV: 10, // m/s airspeed hands up: 36 km/h, sink 1.15 m/s, glide 8.7
  minV: 7.2, // full brakes
  maxV: 14, // full speed bar: 50 km/h, sink 2.2 m/s
  minSinkV: 7.8, minSink: 1.0, polarK: 0.031, stallK: 2.2,
  speedTau: 1.4, // s to settle on a new speed
  bankMax: 0.6, // rad of bank at full steering: a 15 m circle at trim
  spiralBank: 1.15, // rad: steering held all the way for `spiralAfter` s winds up into a spiral dive
  spiralAfter: 2.5,
  bankTau: 0.6,
  // the launch
  inflate: 2.6, // s from laid out to the wing overhead
  runAccel: 2.4, // m/s² of the run, the wing pulling
  runMax: 6.6, // m/s: running flat out on level ground
  takeoffV: 7.4, // m/s of airspeed to lift off (the run and the wing's own pull)
  // the landing
  flareAgl: 3.5, // m: under this the brakes flare the wing
  softSink: 2.4, // m/s into the ground at most for a landing (more: a crash)
  softSpeed: 13, // m/s over the ground at most
  steepGrade: 0.75, // ground steeper than this: no landing, a tumble
  // the air
  cloudBase: 3100 - H0, // y of the cumulus' bases: the thermals stop under them
  slopeLift: 0.45, // m/s at most of the sun's breeze up a sunny face, close to it
  fadeFrom: 1000, fadeTo: 1500, // s of flight: the afternoon's thermals tire between these
  // the score
  timeCap: 1200, // s of airtime counted at most (twenty minutes of flight, ten of the game)
  perSecond: 0.5, // pts a second of airtime
  perMetre: 0.1, // pts a metre of the furthest distance from the launch
  fieldBonus: 200, precisionBonus: 200, softBonus: 50, crashPenalty: 150,
  bounds: [-9500, -4300, 11500, 11900], // js/davos-frame.js WORLD_BOUNDS (the terrain's extent)
  boundsMargin: 600 // m: closer to the edge and the glider turns back by itself
};

export const LAUNCH = { x: -820, z: 6780, heading: -86 * Math.PI / 180, name: 'Rinerhorn launch' };
export const FIELD = { x: -3710, z: 5745, r: 60, out: 0, name: 'Glaris landing field' }; // (out: the way down the valley, open for a circuit)
/** The thermals: where, how wide (the core's radius, m), how strong (m/s in the core); they wander a little round their spot */
export const THERMALS = [
  { id: 'rinerhorn', name: 'Rinerhorn west face', x: -1250, z: 6750, r: 60, w: 3.6, phase: 0.3 },
  { id: 'nuellisch', name: 'Below the Nüllischgrat', x: -1500, z: 7500, r: 65, w: 4.0, phase: 1.7 },
  { id: 'chummer', name: 'Above Glaris', x: -2000, z: 6500, r: 55, w: 3.4, phase: 4.1 },
  { id: 'leidbach', name: 'Leidbachhorn', x: -2000, z: 9000, r: 60, w: 3.8, phase: 2.6 },
  { id: 'monstein', name: 'Above Monstein', x: -3250, z: 8500, r: 55, w: 3.4, phase: 5.2 },
  { id: 'baerentaler', name: 'Bärentaler Alp', x: -4850, z: 5100, r: 60, w: 3.5, phase: 0.9 },
  { id: 'sertig', name: 'Sertig flank', x: 1750, z: 6500, r: 60, w: 3.7, phase: 3.4 },
  { id: 'clavadel', name: 'Clavadeler Alp', x: 1000, z: 4250, r: 60, w: 3.7, phase: 2.1 }
];
export const DRIFT = { amp: 28, period: 260 }; // m and s of a thermal's wander

/** Where the thermal stands at the flight's time `t` (s) */
export function thermalCentre(th, t, out = { x: 0, z: 0 }) {
  const a = (t / DRIFT.period) * Math.PI * 2 + th.phase;
  out.x = th.x + Math.sin(a) * DRIFT.amp;
  out.z = th.z + Math.cos(a * 0.7) * DRIFT.amp * 0.7;
  return out;
}
/** How strong the thermals are at the flight's time (the afternoon tires) */
export const thermalStrength = (t) => 1 - 0.65 * clamp((t - PG.fadeFrom) / (PG.fadeTo - PG.fadeFrom), 0, 1);

const _c = { x: 0, z: 0 };
/** The air's rise (m/s, negative: sink) of one thermal at (x, y, z), `agl` m over the ground, at the time t: the core, its rim of sink */
export function thermalLift(th, x, y, z, agl, t) {
  thermalCentre(th, t, _c);
  const d = Math.hypot(x - _c.x, z - _c.z), r = th.r;
  if (d > r * 2.6) return 0;
  const top = clamp((PG.cloudBase - y) / 140, 0, 1); // fades out under the cloud
  if (top <= 0) return 0;
  const low = clamp(0.35 + agl / 90, 0.35, 1); // still weak right over the ground
  const k = d / r;
  const core = Math.exp(-k * k * 1.6);
  const rim = -0.32 * Math.exp(-(((k - 1.55) / 0.45) ** 2));
  return th.w * thermalStrength(t) * (core + rim) * top * low;
}

/** The sun's breeze up a face turned to it (midday: the sun in the south, +z), close over the ground */
export function slopeLift(gradX, gradZ, agl) {
  const grade = Math.hypot(gradX, gradZ);
  if (grade < 0.08 || agl > 90) return 0;
  // the downhill direction against the sun's: 1 for a face looking straight south
  const facing = clamp(-gradZ / grade, 0, 1);
  return PG.slopeLift * facing * clamp(grade / 0.5, 0, 1) * clamp(1 - agl / 90, 0, 1);
}

/** The air at (x, y, z): { lift (m/s), best (the strongest thermal's id within reach, or null) } */
export function airAt(x, y, z, agl, t, gradX = 0, gradZ = 0, thermals = THERMALS) {
  let lift = slopeLift(gradX, gradZ, agl), best = null, bw = 0.3;
  for (const th of thermals) {
    const w = thermalLift(th, x, y, z, agl, t);
    lift += w;
    if (w > bw) { bw = w; best = th.id; }
  }
  return { lift, best };
}

/** The sink rate (m/s, positive down) flying straight at the airspeed v */
export function polarSink(v) {
  const s = PG.minSink + PG.polarK * (v - PG.minSinkV) ** 2;
  return v < PG.minSinkV ? s + PG.stallK * (PG.minSinkV - v) ** 2 : s;
}
/** The airspeed the controls ask for: the bar (0-1) speeds up, the brakes (0-1) slow down */
export const targetSpeed = (accel, brake) => (accel > 0 ? PG.trimV + (PG.maxV - PG.trimV) * accel : PG.trimV - (PG.trimV - PG.minV) * brake);

// --- The flight ---------------------------------------------------------------------------------------------------------
/** A flight laid out at the launch: the wing on the ground behind the pilot */
export function createFlight(start = LAUNCH) {
  return {
    phase: 'ready', // ready | inflate | run | air | landed | crashed
    x: start.x, y: null, z: start.z, heading: start.heading, x0: start.x, z0: start.z, y0: null,
    v: 0, ground: 0, bank: 0, spiral: 0, held: 0, inflate: 0, sink: 0, vy: 0, vario: 0, lift: 0, thermal: null,
    airtime: 0, maxDist: 0, maxY: null, t: 0, acc: 0, agl: 0, steer: 0, brake: 0, accel: 0, turned: 0,
    outside: false, landing: null, events: []
  };
}

const groundGrad = (groundAt, x, z, out) => {
  out.gx = (groundAt(x + 4, z) - groundAt(x - 4, z)) / 8;
  out.gz = (groundAt(x, z + 4) - groundAt(x, z - 4)) / 8;
  return out;
};
const _g = { gx: 0, gz: 0 };

/** The landing: soft or a crash, on the field or out; its bonus */
export function judgeLanding(f, groundAt) {
  const sx = Math.sin(f.heading), sz = Math.cos(f.heading);
  const rise = (groundAt(f.x + sx * 4, f.z + sz * 4) - groundAt(f.x - sx * 4, f.z - sz * 4)) / 8; // the ground's rise ahead, per m
  groundGrad(groundAt, f.x, f.z, _g);
  const grade = Math.hypot(_g.gx, _g.gz);
  const into = Math.max(0, -f.vy) + f.v * Math.max(0, rise - 0.04); // m/s into the ground (a meadow's bumps are no slope)
  const d = Math.hypot(f.x - FIELD.x, f.z - FIELD.z);
  const crash = into > PG.softSink || f.v > PG.softSpeed || grade > PG.steepGrade;
  const reason = !crash ? null : grade > PG.steepGrade ? 'steep' : f.v > PG.softSpeed ? 'fast' : rise > 0.15 ? 'slope' : 'hard';
  const onField = !crash && d <= FIELD.r;
  const bonus = crash ? -PG.crashPenalty : onField ? PG.softBonus + PG.fieldBonus + Math.round(PG.precisionBonus * (1 - d / FIELD.r)) : PG.softBonus;
  return { crash, reason, onField, distance: d, impact: into, bonus };
}

/**
 * One frame of the flight: `input` { steer (-1..1, + left), accel (0-1, the speed bar), brake (0-1), go (start the launch) },
 * `dt` the game's seconds (the flight runs PG.timeScale times faster, in fixed sub-steps), `groundAt(x, z)` the terrain.
 */
export function stepFlight(f, input, dt, groundAt, thermals = THERMALS) {
  if (f.y === null) { f.y = f.y0 = f.maxY = groundAt(f.x, f.z); }
  if (f.phase === 'landed' || f.phase === 'crashed') return f;
  if (f.phase === 'ready') {
    if (!input.go) return f;
    f.phase = 'inflate';
    f.events.push('inflate');
  }
  f.acc += dt * (f.phase === 'air' ? PG.timeScale : 1); // (the launch on the game's own clock: a run at a runner's pace)
  while (f.acc >= PG.step) {
    f.acc -= PG.step;
    sub(f, input, PG.step, groundAt, thermals);
    if (f.phase === 'landed' || f.phase === 'crashed') { f.acc = 0; break; }
  }
  return f;
}

function sub(f, input, h, groundAt, thermals) {
  const steer = clamp(input.steer || 0, -1, 1), accel = clamp(input.accel || 0, 0, 1), brake = clamp(input.brake || 0, 0, 1);
  f.steer = steer; f.accel = accel; f.brake = brake;
  f.t += h;
  if (f.phase === 'inflate' || f.phase === 'run') {
    // running down the slope with the wing coming up overhead; a little steering
    f.inflate = Math.min(1, f.inflate + h / PG.inflate);
    const ground = groundAt(f.x, f.z), ahead = groundAt(f.x + Math.sin(f.heading) * 6, f.z + Math.cos(f.heading) * 6);
    const falling = ground - ahead > 1; // the ground falls away ahead: the wing can carry
    const pull = f.inflate >= 1 ? PG.runAccel : 0.8;
    const top = f.inflate >= 1 ? (falling ? PG.takeoffV + 0.5 : PG.runMax) : 2.2;
    f.v = Math.min(top, f.v + pull * h);
    if (f.inflate >= 1 && f.phase === 'inflate') { f.phase = 'run'; f.events.push('run'); }
    f.heading = wrap(f.heading + steer * 0.6 * h);
    f.x += Math.sin(f.heading) * f.v * h;
    f.z += Math.cos(f.heading) * f.v * h;
    f.y = groundAt(f.x, f.z);
    f.ground = f.y;
    if (f.phase === 'run' && f.v >= PG.takeoffV && falling) {
      f.phase = 'air';
      f.y += 0.05;
      f.events.push('takeoff');
    }
    return;
  }
  // --- in the air ---
  // the bank: what the steering asks, wound up into a spiral when held all the way
  f.held = Math.abs(steer) > 0.92 ? f.held + h : 0;
  const spiralWant = f.held > PG.spiralAfter ? Math.min(1, (f.held - PG.spiralAfter) / 2) : 0;
  f.spiral += (spiralWant - f.spiral) * Math.min(1, h / (spiralWant > f.spiral ? 1.2 : 0.8));
  let steerUse = steer;
  // near the edge of the world: the glider turns back on its own
  const [x0, z0, x1, z1] = PG.bounds, m = PG.boundsMargin;
  f.outside = f.x < x0 + m || f.x > x1 - m || f.z < z0 + m || f.z > z1 - m;
  if (f.outside) {
    const want = Math.atan2((x0 + x1) / 2 - f.x, (z0 + z1) / 2 - f.z);
    steerUse = clamp(wrap(want - f.heading) * 2, -1, 1);
  }
  const bankWant = steerUse * (PG.bankMax + (PG.spiralBank - PG.bankMax) * f.spiral * (Math.abs(steer) > 0.92 ? 1 : 0));
  f.bank += (bankWant - f.bank) * Math.min(1, h / PG.bankTau);
  // the speed, settled towards what the controls ask
  const vt = targetSpeed(accel, brake);
  f.v += (vt - f.v) * Math.min(1, h / PG.speedTau);
  const cb = Math.cos(f.bank), vTurn = f.v / Math.sqrt(cb);
  let sink = polarSink(f.v) / cb ** 1.5 + f.spiral * 4.5;
  // the ground and the air
  const ground = groundAt(f.x, f.z);
  const agl = f.y - ground;
  groundGrad(groundAt, f.x, f.z, _g);
  const air = airAt(f.x, f.y, f.z, agl, f.t, _g.gx, _g.gz, thermals);
  // the flare: the brakes close over the ground trade the speed for a soft touch-down (no stall that close: the wing's swing)
  if (agl < PG.flareAgl && brake > 0.3) {
    sink = Math.max(0.55, polarSink(Math.max(f.v, PG.minSinkV)) / cb ** 1.5 - brake * 0.9 * clamp((f.v - 5) / 3, 0, 1));
    f.v = Math.max(4.5, f.v - brake * 3 * h);
  }
  const omega = (PG.g * Math.tan(f.bank)) / Math.max(4, vTurn);
  f.heading = wrap(f.heading + omega * h);
  f.turned += omega * h;
  f.x += Math.sin(f.heading) * vTurn * h;
  f.z += Math.cos(f.heading) * vTurn * h;
  f.vy = air.lift - sink;
  f.y += f.vy * h;
  f.sink = sink; f.lift = air.lift; f.thermal = air.best;
  f.vario += (f.vy - f.vario) * Math.min(1, h / 0.5);
  f.airtime += h;
  f.maxDist = Math.max(f.maxDist, Math.hypot(f.x - f.x0, f.z - f.z0));
  f.maxY = Math.max(f.maxY, f.y);
  const g = groundAt(f.x, f.z);
  f.ground = g;
  f.agl = f.y - g;
  if (f.y <= g) {
    f.y = g;
    f.landing = judgeLanding(f, groundAt);
    f.phase = f.landing.crash ? 'crashed' : 'landed';
    f.events.push(f.phase);
    f.vario = 0;
  }
}

/** The flight's points: the airtime (to half an hour), the furthest distance from the launch, the landing */
export function flightScore(f) {
  const time = Math.min(PG.timeCap, f.airtime) * PG.perSecond;
  const dist = f.maxDist * PG.perMetre;
  return Math.max(0, Math.round(time + dist + (f.landing?.bonus || 0)));
}
export const flying = (f) => f.phase === 'air';
export const onGround = (f) => f.phase === 'landed' || f.phase === 'crashed';

// --- A pilot for the tests: climbs in the thermals, glides on, comes home -------------------------------------------------
/** The steering that flies the heading `want`, turning at most `rate` rad/s */
function steerFor(f, want, rate = 0.5) {
  const diff = wrap(want - f.heading);
  const omega = clamp(diff * 0.9, -rate, rate);
  const bank = Math.atan((omega * Math.max(6, f.v)) / PG.g);
  return clamp(bank / PG.bankMax, -0.9, 0.9);
}
/**
 * The bot's input. `plan`: the thermals' ids to climb in, in order, then home to the field. `bot` keeps its own state
 * ({ leg, ... }; start with {}). It circles round where the lift is (a thermal's drifting centre, which a pilot finds by feel
 * and by the birds), leaves at `leaveAt` m under the cloud base, glides at trim, and over the field circles down and flares.
 */
export function botInput(f, bot, plan = [], { leaveAt = 160, groundAt = null, circle = 28 } = {}) {
  if (f.phase === 'ready') return { go: true };
  if (f.phase !== 'air') return { steer: 0 };
  if (f.airtime < 12) return { steer: 0 }; // straight out from the slope first
  bot.leg ??= 0;
  const th = THERMALS.find((t) => t.id === plan[bot.leg]);
  if (th) {
    const c = thermalCentre(th, f.t, { x: 0, z: 0 }), d = Math.hypot(f.x - c.x, f.z - c.z);
    const homeAgl = (f.y - (groundAt ? groundAt(FIELD.x, FIELD.z) : 0));
    // given up: too low to work it (the valley's floor too near), or topped out
    // topped out, or out of reach: too low to get there with height to spare
    const reach = groundAt ? f.y - groundAt(c.x, c.z) - Math.max(0, d - th.r) / 7 : Infinity;
    // (and a thermal that has stopped working: a minute of the vario under +0.3 while circling)
    const since = f.t - (bot.lastT ?? f.t);
    bot.lastT = f.t;
    bot.weak = bot.circling && f.vario < 0.3 ? (bot.weak || 0) + since : 0;
    if ((f.y > PG.cloudBase - leaveAt && d < th.r * 1.5) || (reach < 40 && d > th.r) || bot.weak > 60) {
      bot.weak = 0;
      bot.leg++; bot.circling = false; bot.lastD = null;
      return botInput(f, bot, plan, { leaveAt, groundAt, circle });
    }
    if (d > circle * 2.2) {
      bot.circling = false;
      // too low to reach it with height to spare: home instead
      if (groundAt && homeAgl < Math.hypot(FIELD.x - f.x, FIELD.z - f.z) / 7 + 60 && bot.leg > 0) { bot.leg = plan.length; }
      return { steer: steerFor(f, Math.atan2(c.x - f.x, c.z - f.z)) };
    }
    // a left-hand circle round the centre: the bank of a circle that size, more when drifting out, less when cutting in
    const dr = bot.circling && since > 0 ? (d - bot.lastD) / since : 0;
    bot.circling = true; bot.lastD = d;
    const base = Math.atan((f.v * f.v) / (PG.g * circle)) / PG.bankMax;
    return { steer: clamp(base + 0.9 * (d - circle) / circle + 0.25 * dr, 0.3, 0.92), brake: 0.2 };
  }
  // home: glide to the field, burn off the height circling over it, out down the valley and back in, the flare
  const d = Math.hypot(f.x - FIELD.x, f.z - FIELD.z), fieldY = groundAt ? groundAt(FIELD.x, FIELD.z) : 0, over = f.y - fieldY;
  if (f.agl < PG.flareAgl) return { steer: 0, brake: f.agl < 2.5 ? 1 : 0.6 };
  const toField = Math.atan2(FIELD.x - f.x, FIELD.z - f.z);
  bot.home ??= 'glide';
  if (bot.home === 'glide' && d < 120) bot.home = over > 120 ? 'burn' : 'out';
  if (bot.home === 'burn') {
    if (over < 110) bot.home = 'out';
    return { steer: steerFor(f, toField - Math.PI / 2 + clamp((d - 60) / 60, -0.8, 0.8), 0.75) };
  }
  if (bot.home === 'out') {
    if (over < d / 8 + 14 && d > 150) bot.home = 'final';
    return { steer: steerFor(f, FIELD.out, 0.5) };
  }
  return { steer: steerFor(f, toField, 0.4), brake: bot.home === 'final' && over > (d - 25) / 9 + 3 ? clamp((over - (d - 25) / 9) / 12, 0.3, 1) : 0 };
}

// --- The mission ----------------------------------------------------------------------------------------------------------
export const PARAGLIDE_ID = 'paraglider-rinerhorn';
export const PARAGLIDE_MISSION = {
  id: PARAGLIDE_ID,
  title: 'Paraglider flight from the Rinerhorn',
  intro: 'A summer afternoon on the Rinerhorn, 2520 m, the wing laid out on the meadow behind you and cumulus building over the ridges. Press W or Space to pull it up and run down the slope. In the air A/D steer, W is the speed bar, S the brakes (and the flare just before you touch down); on a phone the stick steers, up is the bar, down the brakes, and the button flares. Find the thermals: the vario beeps, choughs circle in them and a small cloud sits on top. Stay up as long as you can, go as far as you can, and land on the field at Glaris by the valley station. The flight runs twice as fast as the clock.',
  mode: 'person',
  season: 'summer',
  time: 'midday',
  features: ['paraglider'],
  scoreMode: true,
  scoreUnit: 'pts',
  medals: { gold: 1400, silver: 1250, bronze: 1000 }, // (the bots, tests/missions-paraglide.test.mjs: a glide to the field ~1150, one thermal ~1290, out to the Bärentaler Alp and back ~1410)
  colour: '#f0a020',
  icon: 'paraglider',
  finish: 'The wing folded on the meadow at Glaris, a Rivella at the valley station, and already looking up for the next cloud.',
  start: { x: LAUNCH.x, z: LAUNCH.z, heading: LAUNCH.heading },
  props: [],
  createState() { return { flight: createFlight() }; },
  score: (state) => flightScore(state.flight),
  summary(state) {
    const f = state.flight, t = Math.round(f.airtime), l = f.landing;
    const how = !l ? 'still in the air' : l.crash ? 'crash landing' : l.onField ? `on the field, ${Math.round(l.distance)} m from the cross` : 'landed out';
    return [`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} in the air · ${fmtDist(f.maxDist)} from the launch · ${Math.round(f.maxY + H0)} m highest · ${how}`];
  },
  objectives: [
    {
      id: 'launch',
      title: 'Take off: run down the slope',
      allowModes: ['person'],
      check(ctx, state) {
        const f = state.flight;
        const ahead = { x: LAUNCH.x + Math.sin(LAUNCH.heading) * 45, z: LAUNCH.z + Math.cos(LAUNCH.heading) * 45 };
        return {
          done: f.phase === 'air' || onGround(f),
          progress: f.phase === 'ready' ? 0 : f.phase === 'inflate' ? f.inflate * 0.5 : 0.5 + 0.5 * clamp(f.v / PG.takeoffV, 0, 1),
          text: f.phase === 'ready' ? 'W or Space: pull up the wing' : f.phase === 'inflate' ? 'The wing comes up …' : 'Run! Keep going downhill',
          target: { x: ahead.x, z: ahead.z, r: 6, style: 'plain' },
          hint: null
        };
      }
    },
    {
      id: 'fly',
      title: 'Fly: thermals, distance, the landing at Glaris',
      allowModes: ['person'],
      check(ctx, state) {
        const f = state.flight;
        const d = Math.hypot(f.x - FIELD.x, f.z - FIELD.z);
        return {
          done: onGround(f),
          progress: clamp(f.airtime / PG.timeCap, 0, 1),
          text: `${flightScore(f)} pts · ${fmtDist(f.maxDist)} from the launch · field ${fmtDist(d)}`,
          target: { x: FIELD.x, z: FIELD.z, r: FIELD.r, style: 'pad' },
          hint: f.outside ? 'The edge of the map: turning back' : f.agl < PG.flareAgl * 3 && f.agl > 0.5 ? 'Flare now!' : f.vario > 0.8 ? 'Lift! Circle in it' : null
        };
      }
    }
  ]
};

export const PARAGLIDE_MISSIONS = [PARAGLIDE_MISSION];
