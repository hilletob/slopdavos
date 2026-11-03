// js/missions-data-care.js
// Two gentle jobs (js/missions-data.js spreads CARE_MISSIONS into MISSIONS; js/missions-care.js has their runtime). Like
// js/missions-data.js: no three.js and no DOM in here, so that tests/missions-care.test.mjs drives them with synthetic frames.
//
//  - snowshoe-junkerboden: snowshoeing on the Junkerboden, the terrace at 1545 m above Frauenkirch (OSM: Junkerbodenstrasse
//    w106409595, Junkerboden-Runde w1233421897; the marked Wildboden Trail runs over it), up its wooded slope, round a
//    Wildruhezone and down to a bench at the forest's edge, with the open terrace and the valley before it. Scored: flags, time, how much of it on the packed line; the zone and its grouse cost points.
//    (The bench and the zone are the game's: the nearest real Wildruhezone is Eggenwald, Sertig, Nr. 198.0, 1.5 km east.)
//  - cast-spital: the plaster room of the Spital Davos, Promenade 4 (OSM w93469657; the door from the federal address point,
//    LV95 2781383.5 / 1184587.1, on the courtyard side). Three skiers the Rega flew in: read the X-ray, set the angle, pad,
//    wet, wrap, smooth, sign. Scored: above all the evenness of the wrap, and the time.
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z, south).
import { seededRandom } from './missions-data-resort.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
const fmtClock = (s) => { const v = Math.max(0, Math.ceil(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const headingTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);

// =====================================================================================================================
// 1. Snowshoes on the Junkerboden
// =====================================================================================================================
const SHOE_START = { x: -1810, z: 3402 };
const FLAGS = [{ x: -1745, z: 3420 }, { x: -1722, z: 3500 }, { x: -1775, z: 3600 }];
const BENCH = { x: -1950, z: 3635 }; // (the slope's forest ends here: no tree north of it, js/trees.js)
const SHOE_FINISH = { x: -1905, z: 3555 };

export const SHOE = {
  start: { ...SHOE_START, heading: headingTo(SHOE_START, FLAGS[0]) },
  flags: FLAGS,
  flagR: 4,
  bench: { ...BENCH, r: 4, view: Math.atan2(-50, -3000) }, // (it looks north: Frauenkirch on the left, Davos Platz up the valley on the right)
  finish: SHOE_FINISH,
  // The packed line: from flag to flag, and from the last flag round the zone on its uphill side
  line: [SHOE_START, ...FLAGS, { x: -1820, z: 3672 }, { x: -1900, z: 3672 }, BENCH, SHOE_FINISH],
  lineHalf: 2.6, // m: on the packed line within this
  zone: { x: -1860, z: 3610, r: 45 }, // the straight way from the last flag to the bench runs through it
  grouse: [{ x: -1862, z: 3602 }, { x: -1835, z: 3625 }, { x: -1885, z: 3590 }],
  startleR: 22,
  // the walker
  trudge: 2.4, // m/s on the packed line, walking
  stride: 1.75, // × in the rhythm
  deep: 0.55, // × off the packed line, sinking in
  climbLoss: 0.6, // the share of the speed a full climb takes
  climbFull: 0.5, // the grade (rise / run) of a full climb
  downGain: 0.15, // × more going down
  tired: 0.6, // m/s out of breath
  accel: 3, // m/s²
  turn: 1.9, // rad/s
  back: 0.8, // m/s
  beat: 0.8, // s between two beats of the rhythm
  window: 0.11, // s off the beat: still in the rhythm
  boost: 1.1, // s a good step carries
  stamina: { walk: 0.002, stride: 0.002, climb: 0.0055, deep: 0.004, stand: 0.05, bench: 0.22, stumble: 0.02, recover: 0.15 },
  rest: { min: 3, enough: 0.9 }, // s on the bench at least; the stamina that is enough
  points: { flag: 60, timeMax: 350, timeGood: 170, timeBad: 420, lineMax: 250, zone: 150, zoneSecond: 4, grouse: 40, stumble: 2 },
  medals: { gold: 720, silver: 540, bronze: 320 }
};

/** The distance from a point to the packed line */
export function lineDistance(x, z, line = SHOE.line) {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - a.x - dx * u, z - a.z - dz * u);
    if (d < best) best = d;
  }
  return best;
}
export const onPackedLine = (x, z) => lineDistance(x, z) <= SHOE.lineHalf;
export const inWildZone = (x, z) => Math.hypot(x - SHOE.zone.x, z - SHOE.zone.z) <= SHOE.zone.r;

export function createShoer(heading = 0) {
  return { heading, speed: 0, stamina: 1, blown: false, boost: 0, t: 0, last: null, stumbles: 0, goodSteps: 0, travelled: 0 };
}

/** Where the rhythm stands: the seconds to the nearest beat (below 0: just past it) */
export function beatOffset(s) {
  const P = SHOE.beat, r = ((s.t % P) + P) % P;
  return r > P / 2 ? P - r : -r;
}
/** The needle on the meter: 0.5 on the beat, swinging from side to side between two beats */
export const beatNeedle = (s) => 0.5 + 0.5 * Math.sin((s.t / SHOE.beat) * Math.PI);

/** A tap of the rhythm (Space, the touch button): in the window a good step, out of it a stumble */
export function shoeTap(s) {
  if (s.blown) return (s.last = null);
  if (Math.abs(beatOffset(s)) <= SHOE.window) {
    s.boost = SHOE.boost;
    s.goodSteps++;
    return (s.last = 'step');
  }
  s.boost = 0;
  s.stumbles++;
  s.stamina = Math.max(0, s.stamina - SHOE.stamina.stumble);
  return (s.last = 'stumble');
}

/** The target speed: env { grade: rise / run ahead, packed: on the line } */
export function shoeSpeed(s, forward, env) {
  if (!forward) return 0;
  if (s.blown) return SHOE.tired * Math.min(1, forward);
  let v = SHOE.trudge * Math.min(1, forward);
  if (s.boost > 0) v *= SHOE.stride;
  if (!env.packed) v *= SHOE.deep;
  const g = env.grade || 0;
  v *= g > 0 ? 1 - SHOE.climbLoss * clamp(g / SHOE.climbFull, 0, 1) : 1 + SHOE.downGain * clamp(-g / SHOE.climbFull, 0, 1);
  return v;
}

/** A step of time: input { forward: 0..1, back, steer: -1..1 }, env { grade, packed } */
export function shoeStep(s, input, dt, env) {
  s.t += dt;
  s.heading += (input.steer || 0) * SHOE.turn * dt;
  const target = input.back && !input.forward ? -SHOE.back * Math.min(1, input.back) : shoeSpeed(s, input.forward || 0, env);
  s.speed += clamp(target - s.speed, -SHOE.accel * dt * 2, SHOE.accel * dt);
  s.boost = Math.max(0, s.boost - dt);
  const St = SHOE.stamina;
  if (Math.abs(s.speed) > 0.15) {
    let drain = St.walk + (s.boost > 0 ? St.stride : 0) + (env.packed ? 0 : St.deep);
    if (env.grade > 0) drain += St.climb * clamp(env.grade / SHOE.climbFull, 0, 1);
    s.stamina = Math.max(0, s.stamina - drain * dt * (s.blown ? 0.3 : 1));
  } else s.stamina = Math.min(1, s.stamina + St.stand * dt);
  if (s.stamina <= 0) { s.blown = true; s.boost = 0; }
  if (s.blown && s.stamina >= St.recover) s.blown = false;
  s.travelled += Math.abs(s.speed) * dt;
  return s;
}

/** On the bench: the breath comes back */
export function shoeRest(s, dt) {
  s.speed = 0;
  s.boost = 0;
  s.t += dt;
  s.stamina = Math.min(1, s.stamina + SHOE.stamina.bench * dt);
  if (s.blown && s.stamina >= SHOE.stamina.recover) s.blown = false;
  return s;
}

export function createShoeState() {
  return {
    shoer: null, flags: 0, t: 0, walked: 0, packed: 0, inZone: false, zoneEntries: 0, zoneSeconds: 0,
    birds: SHOE.grouse.map((g) => ({ ...g, startled: false })), startled: 0, rest: 0, seated: false, finished: false, events: [], px: null, pz: null
  };
}

/** The frame's bookkeeping: the clean line, the zone, the birds */
export function shoeWatch(ctx, state) {
  if (ctx.t > 0) state.t = ctx.t / 1000;
  if (state.px !== null) {
    const d = Math.hypot(ctx.x - state.px, ctx.z - state.pz);
    if (d > 0 && d < 5) {
      state.walked += d;
      if (onPackedLine(ctx.x, ctx.z)) state.packed += d;
    }
  }
  state.px = ctx.x; state.pz = ctx.z;
  const zone = inWildZone(ctx.x, ctx.z);
  if (zone && !state.inZone) { state.zoneEntries++; state.events.push({ kind: 'zone' }); }
  if (zone) state.zoneSeconds += ctx.dt || 0;
  state.inZone = zone;
  for (const b of state.birds) {
    if (!b.startled && Math.hypot(ctx.x - b.x, ctx.z - b.z) < SHOE.startleR) {
      b.startled = true;
      state.startled++;
      state.events.push({ kind: 'grouse', bird: b });
    }
  }
  return state;
}

export const packedShare = (state) => (state.walked > 0 ? state.packed / state.walked : 0);

export function shoeScore(state) {
  const P = SHOE.points;
  let score = state.flags * P.flag;
  if (state.finished) {
    score += P.timeMax * clamp((P.timeBad - state.t) / (P.timeBad - P.timeGood), 0, 1);
    score += P.lineMax * clamp(packedShare(state), 0, 1);
  }
  score -= state.zoneEntries * P.zone + state.zoneSeconds * P.zoneSecond + state.startled * P.grouse + (state.shoer?.stumbles || 0) * P.stumble;
  return Math.max(0, Math.round(score));
}

function shoeFlag(id, spot, title, finished = false) {
  const flag = { x: spot.x, z: spot.z, r: SHOE.flagR };
  return {
    id, title,
    check(ctx, state) {
      const d = Math.hypot(ctx.x - flag.x, ctx.z - flag.z), done = d < flag.r;
      if (done) { state.flags++; state.events.push({ kind: 'flag' }); if (finished) state.finished = true; }
      const blown = state.shoer?.blown;
      return {
        done, progress: null, text: `${fmtDist(d)} to the flag`,
        target: { ...flag, style: 'plain' },
        hint: state.inZone ? 'You are in the Wildruhezone: get out!' : blown ? 'Out of breath: stop for a moment' : null
      };
    }
  };
}

export const SNOWSHOE_MISSION = {
  id: 'snowshoe-junkerboden',
  title: 'Snowshoeing on the Junkerboden',
  intro: 'Fresh snow on the Junkerboden, the terrace above Frauenkirch, and nobody has been out yet. Strap on the snowshoes and follow the flags up the slope, then down to the bench and on to the Junkerbodenstrasse. W walks, A/D steer. Tap Space on the beat (the needle in the green, touch: Step) for a long stride. Off the packed line you sink in and slow down; steep climbs eat your stamina. Sit on the bench: your breath comes back and the view is free. The fenced Wildruhezone on the slope is the grouse’s winter home: go round it on the line. Crossing it costs points. Time, a clean line and quiet birds make the score.',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['snowshoes'],
  scoreMode: true,
  medals: SHOE.medals,
  colour: '#3e8e9e',
  icon: 'snowshoe',
  finish: 'Back on the Junkerbodenstrasse: your track up the slope is the only one in the snow.',
  start: { ...SHOE.start },
  props: [],
  createState: createShoeState,
  score: shoeScore,
  update: shoeWatch,
  summary(state) {
    return [`${Math.round(packedShare(state) * 100)} % on the packed line · ${state.zoneEntries} times in the Wildruhezone · ${state.startled} grouse startled · ${state.shoer?.stumbles || 0} stumbles`];
  },
  objectives: [
    shoeFlag('flag1', SHOE.flags[0], 'Over the Junkerboden'),
    shoeFlag('flag2', SHOE.flags[1], 'To the foot of the slope'),
    shoeFlag('flag3', SHOE.flags[2], 'Up the slope'),
    {
      id: 'bench',
      title: 'Round the Wildruhezone to the bench',
      check(ctx, state) {
        const B = SHOE.bench, d = Math.hypot(ctx.x - B.x, ctx.z - B.z), s = state.shoer;
        if (d < B.r) state.seated = true;
        if (state.seated) {
          state.rest += ctx.dt || 0;
          const done = state.rest >= SHOE.rest.min && (s ? s.stamina >= SHOE.rest.enough : true);
          if (done) { state.seated = false; state.flags++; state.events.push({ kind: 'flag' }); }
          return { done, progress: s ? s.stamina : 1, text: 'Catching your breath: Frauenkirch on the left, Davos Platz up the valley', target: null, hint: null };
        }
        return { done: false, progress: null, text: `${fmtDist(d)} to the bench`, target: { x: B.x, z: B.z, r: B.r, style: 'plain' }, hint: state.shoer?.blown ? 'Out of breath: stop for a moment' : null };
      }
    },
    shoeFlag('finish', SHOE.finish, 'To the Junkerbodenstrasse', true)
  ]
};

// =====================================================================================================================
// 2. A plaster cast at the Spital Davos
// =====================================================================================================================
const CAST_DOOR = { x: -1116.5, z: 907.5, r: 2.6 };
const CAST_START = { x: -1172, z: 878 };
export const SPITAL = { door: CAST_DOOR, start: { ...CAST_START, heading: headingTo(CAST_START, CAST_DOOR) } };

export const CAST_STAGES = ['xray', 'angle', 'pad', 'wet', 'wrap', 'smooth', 'sign'];
export const CAST = {
  cells: 24, // the cast's length in cells
  pace: [1, 1.25, 1.55], // each patient quicker than the one before
  limit: [80, 65, 52], // s: inside this the patient's time bonus counts down from full to none
  angle: { short: { min: 60, max: 120, target: 90 }, long: { min: 0, max: 45, target: 20 }, rate: 28, tolerance: 15 },
  pad: { width: 0.14, rate: 5, need: 0.9, lump: 2.6 },
  wet: { centre: 4, half: 0.9, fall: 1.5, overflow: 3 },
  wrap: { width: 0.16, speed: 0.2, gap: 1.2, lump: 3, accel: 0.9, friction: 2, vmax: 0.8 },
  smooth: { set: 10, width: 0.2, rate: 7, accel: 3, vmax: 1.4 },
  points: { xray: 40, wrongLeg: 20, wrongLength: 15, angle: 30, pad: 20, wet: 30, wrap: 80, smooth: 40, sign: 5, quick: 15 },
  medals: { gold: 620, silver: 460, bronze: 260 }
};
export const CAST_PATIENTS = [
  { name: 'Herr Buol', from: 'the Parsenn, red run', quip: 'The Rega pilot says hello. Lovely view from up there, by the way.' },
  { name: 'Frau Meisser', from: 'the Jakobshorn, a mogul', quip: 'Will it match my ski suit? No? Then sign it nicely.' },
  { name: 'Herr Flury', from: 'the Pischa, the beginners’ slope', quip: 'It was the snow’s fault. Write that on the cast.' }
];

const newCell = () => ({ pad: 0, layers: 0, smooth: 0 });

function castPatient(g, i) {
  const base = CAST_PATIENTS[i];
  const long = g.rand() < 0.5; // short: broken by the ankle; long: up by the knee
  const a = CAST.angle[long ? 'long' : 'short'];
  const off = (10 + g.rand() * 12) * (g.rand() < 0.5 ? -1 : 1);
  return {
    ...base, i, leg: g.rand() < 0.5 ? 'left' : 'right', length: long ? 'long' : 'short', at: long ? 0.2 + g.rand() * 0.12 : 0.74 + g.rand() * 0.12,
    pace: CAST.pace[i], stage: 'xray', pickedLeg: null, wrongLeg: 0, wrongLength: 0,
    angle: clamp(a.target + off, a.min, a.max), angleErr: null,
    cells: Array.from({ length: CAST.cells }, newCell), u: 0, v: 0, contact: false, pass: 0,
    wet: 0, wetting: false, wetErr: null, set: 0, ink: 0, t: 0, parts: null, points: 0
  };
}

export function createCastGame(seed = 7) {
  const g = { rand: seededRandom(seed), t: 0, done: false, score: 0, i: 0, patient: null, patients: [], last: null, events: [] };
  g.patient = castPatient(g, 0);
  return g;
}

const nextStage = (g, p) => {
  p.stage = CAST_STAGES[CAST_STAGES.indexOf(p.stage) + 1];
  p.u = 0; p.v = 0; p.contact = false;
  g.events.push({ kind: 'stage', stage: p.stage });
};

/** The X-ray: which leg */
export function castPickLeg(g, leg) {
  const p = g.patient;
  if (g.done || p.stage !== 'xray' || p.pickedLeg) return false;
  if (leg !== p.leg) { p.wrongLeg++; g.events.push({ kind: 'wrong-leg' }); return false; }
  p.pickedLeg = leg;
  g.events.push({ kind: 'right-leg' });
  return true;
}
/** The X-ray: how long a cast */
export function castPickLength(g, length) {
  const p = g.patient;
  if (g.done || p.stage !== 'xray' || !p.pickedLeg) return false;
  if (length !== p.length) { p.wrongLength++; g.events.push({ kind: 'wrong-length' }); return false; }
  nextStage(g, p);
  return true;
}
/** Space or the button: the angle is set, or the name is on the cast */
export function castConfirm(g) {
  const p = g.patient;
  if (g.done) return false;
  if (p.stage === 'angle') {
    p.angleErr = Math.abs(p.angle - CAST.angle[p.length].target);
    g.events.push({ kind: 'angle', err: p.angleErr });
    nextStage(g, p);
    return true;
  }
  if (p.stage === 'sign') { castFinishPatient(g); return true; }
  return false;
}
/** A stroke of the pen on the cast (its length in canvas units) */
export function castInk(g, length) {
  if (!g.done && g.patient.stage === 'sign') g.patient.ink += length;
}

function moveTool(p, input, dt, accel, friction, vmax) {
  if (input.u != null) {
    const v = (input.u - p.u) / Math.max(dt, 1e-3);
    p.v += (v - p.v) * Math.min(1, dt / 0.08);
    p.u = clamp(input.u, 0, 1);
    p.contact = true;
    return;
  }
  if (input.push) { p.v = clamp(p.v + input.push * accel * dt, -vmax, vmax); p.contact = true; } else {
    p.v -= Math.sign(p.v) * Math.min(Math.abs(p.v), friction * dt);
    p.contact = Math.abs(p.v) > 0.03;
  }
  p.u = clamp(p.u + p.v * dt, 0, 1);
}

/** The bandage: the cells with a gap in them, with a lump; the cotton wool: the share laid */
export const castGaps = (p) => p.cells.filter((c) => c.layers < CAST.wrap.gap).length;
export const castLumps = (p) => p.cells.filter((c) => c.layers > CAST.wrap.lump).length;
export const padShare = (p) => p.cells.filter((c) => c.pad >= 1).length / p.cells.length;
/** The speed (cast lengths a second) at which one pass lays one even layer */
export const wrapSpeed = (p) => CAST.wrap.speed * p.pace;
/** The seconds in the bucket */
export const wetWindow = (p) => { const c = CAST.wet.centre / p.pace, h = CAST.wet.half / p.pace; return [c - h, c + h]; };
export const setSeconds = (p) => CAST.smooth.set / p.pace;

/** How even the wrap is: 1 for two layers everywhere */
export function wrapEvenness(p) {
  let dev = 0;
  for (const c of p.cells) dev += Math.abs(c.layers - 2);
  return clamp(1 - dev / p.cells.length, 0, 1);
}

function wetOut(g, p) {
  const [lo, hi] = wetWindow(p);
  p.wetErr = p.wet < lo ? lo - p.wet : p.wet > hi ? p.wet - hi : 0;
  g.events.push({ kind: 'wet', err: p.wetErr, soggy: p.wet > hi });
  nextStage(g, p);
}

/** The time goes on. input: { u: the finger on the cast (0-1) or null, push: -1 | 0 | 1, adjust: -1 | 0 | 1, hold: the bandage in the bucket } */
export function castStep(g, input = {}, dt = 0) {
  if (g.done || dt <= 0) return g;
  g.t += dt;
  const p = g.patient;
  p.t += dt;
  if (p.stage === 'angle') {
    const a = CAST.angle[p.length];
    if (input.u != null) p.angle = a.min + (a.max - a.min) * clamp(input.u, 0, 1);
    else if (input.adjust) p.angle = clamp(p.angle + input.adjust * CAST.angle.rate * dt, a.min, a.max);
  } else if (p.stage === 'pad') {
    const P = CAST.pad, before = p.u;
    moveTool(p, input, dt, 1.2, 3, 0.9);
    if (p.contact && p.u !== before) {
      for (let i = 0; i < p.cells.length; i++) if (Math.abs((i + 0.5) / p.cells.length - p.u) <= P.width / 2) p.cells[i].pad += P.rate * dt;
    }
    if (input.u == null && p.u >= 0.995 && padShare(p) < P.need) { p.u = 0; p.v = 0; } // (the keys: again from the toes)
    if (padShare(p) >= P.need) nextStage(g, p);
  } else if (p.stage === 'wet') {
    if (input.hold) { p.wetting = true; p.wet += dt; }
    if (p.wetting && (!input.hold || p.wet > wetWindow(p)[1] + CAST.wet.overflow)) wetOut(g, p);
  } else if (p.stage === 'wrap') {
    const W = CAST.wrap, rate = wrapSpeed(p) / W.width;
    moveTool(p, input, dt, W.accel, W.friction, W.vmax);
    if (p.contact) for (let i = 0; i < p.cells.length; i++) if (Math.abs((i + 0.5) / p.cells.length - p.u) <= W.width / 2) p.cells[i].layers += rate * dt;
    if (p.pass === 0 && p.u >= 0.99) { p.pass = 1; p.v = 0; g.events.push({ kind: 'turn' }); }
    else if (p.pass === 1 && p.u <= 0.01) {
      g.events.push({ kind: 'wrapped', gaps: castGaps(p), lumps: castLumps(p) });
      nextStage(g, p);
    }
  } else if (p.stage === 'smooth') {
    const S = CAST.smooth;
    p.set = Math.min(1, p.set + dt / setSeconds(p));
    if (input.u == null && input.push) {
      // (the keys: the hand goes up and down the cast by itself while the key is held)
      p.dir = p.dir || 1;
      if (p.u >= 0.995) p.dir = -1; else if (p.u <= 0.005) p.dir = 1;
      moveTool(p, { push: p.dir }, dt, S.accel, S.accel, S.vmax);
    } else moveTool(p, input, dt, S.accel, S.accel, S.vmax);
    const move = Math.abs(p.v);
    if (p.contact && move > 0.05) {
      for (let i = 0; i < p.cells.length; i++) if (Math.abs((i + 0.5) / p.cells.length - p.u) <= S.width / 2) p.cells[i].smooth = Math.min(1, p.cells[i].smooth + S.rate * Math.min(move, 1) * dt);
    }
    const all = p.cells.every((c) => c.smooth >= 0.99);
    if (all || p.set >= 1) { g.events.push({ kind: all ? 'smoothed' : 'hardened' }); nextStage(g, p); }
  }
  return g;
}

/** A patient's points */
export function castQuality(p) {
  const P = CAST.points;
  const xray = Math.max(0, P.xray - p.wrongLeg * P.wrongLeg - p.wrongLength * P.wrongLength);
  const angle = P.angle * clamp(1 - (p.angleErr ?? CAST.angle.tolerance) / CAST.angle.tolerance, 0, 1);
  const lumpsOfPad = p.cells.filter((c) => c.pad > CAST.pad.lump).length;
  const pad = clamp(P.pad * padShare(p) - lumpsOfPad * 0.5, 0, P.pad);
  const wet = P.wet * clamp(1 - (p.wetErr ?? CAST.wet.fall) / CAST.wet.fall, 0, 1);
  const wrap = P.wrap * wrapEvenness(p);
  const smooth = P.smooth * (p.cells.reduce((a, c) => a + c.smooth, 0) / p.cells.length);
  const sign = p.ink > 0 ? P.sign : 0;
  const limit = CAST.limit[p.i];
  const quick = P.quick * clamp((1 - p.t / limit) * 2, 0, 1); // (full up to half the limit)
  const total = xray + angle + pad + wet + wrap + smooth + sign + quick;
  return { xray, angle: Math.round(angle), pad: Math.round(pad), wet: Math.round(wet), wrap: Math.round(wrap), smooth: Math.round(smooth), sign, quick: Math.round(quick), gaps: castGaps(p), lumps: castLumps(p), total: Math.round(total) };
}

function castFinishPatient(g) {
  const p = g.patient;
  p.stage = 'done';
  p.parts = castQuality(p);
  p.points = p.parts.total;
  g.score += p.points;
  g.patients.push(p);
  g.last = { name: p.name, quip: p.quip, points: p.points, parts: p.parts, at: g.t };
  g.events.push({ kind: 'patient', points: p.points });
  g.i++;
  if (g.i >= CAST_PATIENTS.length) { g.done = true; return; }
  g.patient = castPatient(g, g.i);
}

export const CAST_MISSION = {
  id: 'cast-spital',
  title: 'A plaster cast at the Spital',
  intro: 'A busy day in the plaster room of the Spital Davos: the Rega keeps flying skiers in from the pistes, and you are the plaster technician. Walk to the door on the courtyard side. Then, for three patients, each quicker than the last: read the X-ray and pick the leg and the length of the cast (keys 1 and 2 or tap). Set the angle (A/D or drag, Space to fix it). Pad with cotton wool, then hold the bandage in the bucket for the right time (hold Space or the bucket). Wrap up the leg and back down in even turns (hold D or drag in the green pace): too fast leaves gaps, too slow makes lumps. Smooth it before the plaster sets, then sign the cast. An even cast and a quick job make the score.',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['castRoom'],
  scoreMode: true,
  medals: CAST.medals,
  colour: '#c8423b',
  icon: 'cast',
  finish: 'Three skiers in neat white casts, three signatures, and the Rega is already on its way back with the next one.',
  start: { ...SPITAL.start },
  props: [],
  createState() { return { room: null }; },
  score: (state) => state.room?.score ?? 0,
  summary(state) {
    const g = state.room;
    return g ? [`${g.patients.length} casts · ${g.patients.map((p) => p.points).join(' · ') || 'no cast finished'} · ${g.patients.reduce((a, p) => a + p.parts.gaps, 0)} gaps · ${g.patients.reduce((a, p) => a + p.parts.lumps, 0)} lumps`] : [];
  },
  objectives: [
    {
      id: 'enter',
      title: 'Go into the Spital Davos',
      check(ctx) {
        const d = Math.hypot(ctx.x - CAST_DOOR.x, ctx.z - CAST_DOOR.z);
        return { done: d < CAST_DOOR.r, progress: null, text: `${fmtDist(d)} to the Spital Davos`, target: { ...CAST_DOOR, style: 'plain' }, hint: null };
      }
    },
    {
      id: 'room',
      title: 'Plaster three legs',
      check(ctx, state) {
        const g = state.room;
        if (!g) return { done: false, progress: 0, text: 'Mixing the plaster …', target: null, hint: null };
        return { done: g.done, progress: g.i / CAST_PATIENTS.length, text: `Patient ${Math.min(g.i + 1, CAST_PATIENTS.length)} of ${CAST_PATIENTS.length} · ${g.score} pts · ${fmtClock(g.t)}`, target: null, hint: null };
      }
    }
  ]
};

export const CARE_MISSIONS = [SNOWSHOE_MISSION, CAST_MISSION];
