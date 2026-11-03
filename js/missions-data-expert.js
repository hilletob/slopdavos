// js/missions-data-expert.js
// Two jobs for people who know their trade (js/missions-data.js spreads EXPERT_MISSIONS into MISSIONS; js/missions-expert.js
// has their runtime: the canvases, input and sounds). Like the other data modules: no three.js and no DOM in here, so that
// tests/missions-expert.test.mjs plays the games with synthetic frames. Everything scored (scoreMode).
//
//  - sehtest-meerkaemper: an eye test at Meerkämper Optik, Promenade 63, Davos Platz (OSM n12109173090, shop=optician; the
//    address from the commercial register). You are the optician at the phoropter: "better with one or two?".
//  - schneeprofil-slf: a snow profile for the WSL Institute for Snow and Avalanche Research SLF, Flüelastrasse 11a, Davos Dorf
//    (OSM w1178596285): from the institute up to its measuring field on the Weissfluhjoch (5WJ0, LV95 2780845 / 1189230,
//    2536 m, stationdocu.slf.ch), where you dig a pit and take the profile the way it is really done.
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z, south).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
const fmtClock = (s) => { const v = Math.max(0, Math.ceil(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const headingTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);

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

/** The "walk there" step */
function walkTo(spot, title, label, id) {
  return {
    id, title,
    check(ctx) {
      const d = Math.hypot(ctx.x - spot.x, ctx.z - spot.z);
      return { done: d < spot.r, progress: null, text: `${fmtDist(d)} to ${label}`, target: { ...spot, style: 'plain' }, hint: null };
    }
  };
}

// =====================================================================================================================
// 1. The eye test
// =====================================================================================================================
// The shop's OSM node sits on the east wall of Promenade 63 (w1529973404), facing the Promenade: the door just out from it.
const EYE_DOOR = { x: -595.4, z: -85.1, r: 2.6 };
const EYE_START = { x: -582.1, z: -80.8 };
export const MEERKAEMPER = { door: EYE_DOOR, start: { ...EYE_START, heading: headingTo(EYE_START, EYE_DOOR) } };

export const EYE = {
  length: 180, // s for all the customers
  pause: 3.2, // s the verdict stays up before the next one sits down (the clock stands still)
  answerDelay: 0.35, // s the customer thinks once both lenses were seen
  relapse: 2, // questions until a squinter who was told off squints again
  unsure: { within: 0.5, wrong: 0.2 }, // the unsure one: this close (D), this often the wrong way round
  // The game's optics, deliberately simpler than a real eye's: the remaining sphere blurs evenly, the remaining cylinder
  // smears along its axis, and the two do not interact (px of blur per dioptre)
  blur: { sph: 4.5, cyl: 5.5, max: 26, squint: 0.35 },
  points: { accuracy: 70, zero: 1, steps: 20, quick: 10, quickT: [20, 60], caught: 5, caughtMax: 2 },
  medals: { gold: 320, silver: 230, bronze: 120 }
};

const EYE_PEOPLE = [
  { name: 'Frau Accola', job: 'Hotelier', kind: 'honest', sph: [-4, -1.5], cyl: [-1, -0.25], axis: 20, old: true, hair: '#6b4a2b', hello: 'My old glasses are from the Spengler Cup of 1998.' },
  { name: 'Herr Buol', job: 'Farmer', kind: 'unsure', sph: [0.75, 2.5], cyl: [-1.5, -0.5], axis: 90, old: false, hair: '#b9b9b9', hello: 'I only came because of the cow. She looked blurry.' },
  { name: 'Herr Flury', job: 'Ski instructor', kind: 'squinter', sph: [-3, -1], cyl: [-1.25, -0.5], axis: 160, old: false, hair: '#d8b45a', hello: 'I see perfectly. Your chart is blurry.' },
  { name: 'Frau Meisser', job: 'Teacher', kind: 'honest', sph: [-1.5, 1.5], cyl: [-2.5, -1], axis: 45, old: false, hair: '#2b2622', hello: 'Everything has a shadow. Even the Seehorn.' }
];
const quarter = (v) => Math.round(v * 4) / 4 + 0; // (+ 0: never −0)
const within = (rand, [a, b]) => quarter(a + rand() * (b - a));

/** A dioptre value as the optician writes it: +1.25, −0.75 */
export const fmtDioptre = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(2)}`;

export function createEyeTest(seed = 3) {
  const rand = seededRandom(seed);
  const customers = EYE_PEOPLE.map((p) => {
    const S = within(rand, p.sph), C = within(rand, p.cyl);
    // (the old glasses: off by a little, in a direction of their own; no glasses: the phoropter starts on plano)
    const lens = p.old ? { sph: quarter(S + (rand() < 0.5 ? -1 : 1) * (1 + rand())), cyl: Math.min(0, quarter(C + 0.5)) } : { sph: 0, cyl: 0 };
    return { ...p, S, C, lens, start: { ...lens }, steps: 0, t: 0, squint: p.kind === 'squinter', calm: 0, caught: 0 };
  });
  return { rand, customers, index: 0, t: 0, done: false, score: 0, dial: 'sph', step: 1, cmp: null, pause: 0, results: [], last: null, events: [] };
}

export const eyeCustomer = (g) => g.customers[g.index] || null;
const dialTarget = (c, dial) => (dial === 'sph' ? c.S : c.C);

/** The lens in front of the customer's eye: the one on the dials, or the one flipped in */
export function eyeShown(g) {
  const c = eyeCustomer(g);
  if (!c) return null;
  if (!g.cmp) return { ...c.lens };
  return { ...c.lens, [g.cmp.dial]: g.cmp.shown === 1 ? g.cmp.one : g.cmp.two };
}

/** The blur of a lens as an ellipse: { rx (along the axis), ry, rot } in px. A squint narrows it: the pinhole effect */
export function eyeKernel(c, lens, squint = false) {
  const B = EYE.blur, k = squint ? B.squint : 1;
  const rs = Math.abs(c.S - lens.sph), rc = Math.abs(c.C - lens.cyl);
  return { rx: Math.min(B.max, (rs * B.sph + rc * B.cyl) * k), ry: Math.min(B.max, rs * B.sph * k), rot: (c.axis * Math.PI) / 180 };
}

/** What the customer says of a comparison: 'one' | 'two' | 'same' | 'sharp' (a squinter: everything is sharp) */
export function eyeAnswer(c, cmp, rand) {
  if (c.squint) return 'sharp';
  const target = dialTarget(c, cmp.dial), e1 = Math.abs(target - cmp.one), e2 = Math.abs(target - cmp.two), diff = Math.abs(e1 - e2);
  if (diff < 0.01) return 'same';
  const better = e1 < e2 ? 'one' : 'two';
  if (c.kind === 'unsure' && diff <= EYE.unsure.within && rand() < EYE.unsure.wrong) return better === 'one' ? 'two' : 'one';
  return better;
}

/** The lines they say. By answer, an unsure customer has his own */
export const EYE_LINES = {
  one: 'Number one.', two: 'Number two.', same: 'About the same.', sharp: 'Both razor-sharp!',
  unsureOne: 'Hmm … one? Yes, one.', unsureTwo: 'Hmm … two? Yes, two.', caught: 'Me? Squinting? Never.', relapse: 'He is squinting again!'
};
export const eyeLine = (c, answer) => {
  if (c.kind === 'unsure' && answer === 'one') return EYE_LINES.unsureOne;
  if (c.kind === 'unsure' && answer === 'two') return EYE_LINES.unsureTwo;
  return EYE_LINES[answer];
};
export const EYE_REACTIONS = ['Oh! The Seehorn has trees!', 'Much better, thank you.', 'Is the floor meant to slope?', 'Who moved the Promenade?'];
export const eyeReaction = (err) => EYE_REACTIONS[err < 0.01 ? 0 : err <= 0.3 ? 1 : err <= 0.8 ? 2 : 3];

/** Which dial, which step: a question not yet settled is dropped */
export function eyeSetDial(g, dial) { if (g.pause <= 0 && !g.done && (dial === 'sph' || dial === 'cyl')) { g.dial = dial; g.cmp = null; } }
export function eyeSetStep(g, step) { if (g.pause <= 0 && !g.done && (step === 1 || step === 0.25)) { g.step = step; g.cmp = null; } }

/** "One … or two?": the first flip asks the question (a step), the next ones swap the lenses. Both seen: the answer comes */
export function eyeFlip(g) {
  const c = eyeCustomer(g);
  if (!c || g.done || g.pause > 0) return false;
  if (!g.cmp) {
    const v = c.lens[g.dial];
    g.cmp = { dial: g.dial, step: g.step, one: v - g.step, two: v + g.step, shown: 1, seen: 1, answer: null, wait: 0 };
    c.steps++;
    return true;
  }
  g.cmp.shown = g.cmp.shown === 1 ? 2 : 1;
  if (g.cmp.seen === 1) { g.cmp.seen = 2; g.cmp.wait = EYE.answerDelay; }
  return true;
}

/** Puts lens 1 or 2 on the dials */
export function eyeTake(g, which) {
  const c = eyeCustomer(g);
  if (!c || !g.cmp || g.done || g.pause > 0 || (which !== 1 && which !== 2)) return false;
  c.lens[g.cmp.dial] = which === 1 ? g.cmp.one : g.cmp.two;
  g.cmp = null;
  return true;
}
/** Neither: the dials stay */
export function eyeKeep(g) { if (!g.cmp || g.pause > 0) return false; g.cmp = null; return true; }

/** "Eyes open, please!": a squinter caught earns a little, and his answers mean something for a while */
export function eyeScold(g) {
  const c = eyeCustomer(g);
  if (!c || g.done || g.pause > 0 || !c.squint) return false;
  c.squint = false; c.calm = 0; c.caught++;
  if (g.cmp) { g.cmp.answer = null; g.cmp.seen = 1; g.cmp.shown = 1; }
  g.events.push({ kind: 'caught' });
  return true;
}

/** The number of questions a good optician needs from where this customer started */
export function eyePar(c) {
  return Math.ceil(Math.abs(c.S - c.start.sph)) + Math.ceil(Math.abs(c.C - c.start.cyl)) + 4 + (c.kind === 'squinter' ? 2 : 0);
}

/** The customer's points. The bonuses for few steps and for speed count only as far as the glasses are right */
export function eyeQuality(c) {
  const P = EYE.points, err = Math.hypot(c.S - c.lens.sph, c.C - c.lens.cyl);
  const k = clamp(1 - err / P.zero, 0, 1), par = eyePar(c);
  const accuracy = P.accuracy * k;
  const steps = P.steps * k * (c.steps <= par ? 1 : clamp(1 - (c.steps - par) / par, 0, 1));
  const quick = P.quick * k * clamp((P.quickT[1] - c.t) / (P.quickT[1] - P.quickT[0]), 0, 1);
  const caught = Math.min(c.caught, P.caughtMax) * P.caught;
  return { err, par, accuracy: Math.round(accuracy), steps: Math.round(steps), quick: Math.round(quick), caught, total: Math.round(accuracy + steps + quick) + caught };
}

/** The prescription is written: the verdict, then the next customer */
export function eyePrescribe(g) {
  const c = eyeCustomer(g);
  if (!c || g.done || g.pause > 0) return false;
  const q = eyeQuality(c);
  g.score += q.total;
  g.results.push({ name: c.name, S: c.S, C: c.C, lens: { ...c.lens }, steps: c.steps, t: c.t, quality: q });
  g.last = { name: c.name, S: c.S, C: c.C, lens: { ...c.lens }, quality: q, reaction: eyeReaction(q.err) };
  g.cmp = null;
  g.pause = EYE.pause;
  g.events.push({ kind: 'prescribed', points: q.total, err: q.err });
  return true;
}

/** The time goes on */
export function eyeStep(g, dt) {
  if (g.done || dt <= 0) return g;
  if (g.pause > 0) {
    g.pause -= dt;
    if (g.pause <= 0) {
      g.pause = 0; g.index++; g.dial = 'sph'; g.step = 1; g.last = null;
      if (g.index >= g.customers.length) g.done = true;
    }
    return g;
  }
  g.t += dt;
  const c = eyeCustomer(g);
  c.t += dt;
  const q = g.cmp;
  if (q && q.seen === 2 && !q.answer) {
    q.wait -= dt;
    if (q.wait <= 0) {
      q.answer = eyeAnswer(c, q, g.rand);
      g.events.push({ kind: 'answer', answer: q.answer });
      // told off, he holds out for a question or two, then the eyes narrow again
      if (c.kind === 'squinter' && !c.squint && c.caught > 0 && ++c.calm >= EYE.relapse) { c.squint = true; g.events.push({ kind: 'relapse' }); }
    }
  }
  if (g.t >= EYE.length) g.done = true;
  return g;
}

export const EYE_MISSION = {
  id: 'sehtest-meerkaemper',
  title: 'Eye test at Meerkämper Optik',
  intro: 'A busy morning at Meerkämper Optik on the Promenade, and you are the optician at the phoropter. Each customer has a hidden sphere and cylinder. Pick a dial, pick the step, flip the lenses and ask: better with one or two? Then take the lens they prefer. The chart blurs as they see it, so you can judge for yourself. When both lenses look the same at ±0.25, that dial is right. Write the prescription: accuracy counts most, then few questions and speed. And one of them squints. Three minutes for four customers.',
  mode: 'person',
  season: null,
  time: 'midday',
  features: ['eyeTest'],
  scoreMode: true,
  medals: EYE.medals,
  colour: '#1d7f8c',
  icon: 'eyechart',
  finish: 'Closing time: everybody on the Promenade sees sharp, for now.',
  start: { ...MEERKAEMPER.start },
  props: [],
  createState() { return { game: null }; },
  score: (state) => state.game?.score ?? 0,
  summary(state) {
    const g = state.game;
    if (!g) return [];
    const exact = g.results.filter((r) => r.quality.err < 0.01).length;
    return [`${g.results.length} of ${g.customers.length} customers · ${exact} exact · ${g.results.map((r) => r.quality.total).join(' · ') || 'none finished'}`];
  },
  objectives: [
    walkTo(MEERKAEMPER.door, 'Go into Meerkämper Optik', 'Meerkämper Optik', 'enter'),
    {
      id: 'eyetest',
      title: 'Test four customers (3:00)',
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'The first customer sits down …', target: null, hint: null };
        return { done: g.done, progress: g.t / EYE.length, text: `${g.score} pts · ${g.results.length} of ${g.customers.length} customers · ${fmtClock(EYE.length - g.t)}`, target: null, hint: null };
      }
    }
  ]
};

// =====================================================================================================================
// 2. The snow profile
// =====================================================================================================================
// The SLF's west and east sides are car parks (OSM w493054126, w493054130: js/parking.js parks cars there, which block a
// walker), so the door is on its south wall (its place estimated), in the free alley to the service road on the west. The
// field: the coordinates of the SLF's own station sheet. The climb of 980 m over 3.6 km is the Parsennbahn's job: a cut, then
// the last metres on foot from the Joch's side.
const SLF_DOOR = { x: 1273, z: -1874, r: 2.6 };
const SLF_START = { x: 1260.5, z: -1873.4 };
const FIELD = { x: -1655, z: -3730, r: 3.5 };
const FIELD_ARRIVAL = { x: -1690, z: -3745 };
export const SLF = {
  door: SLF_DOOR,
  start: { ...SLF_START, heading: headingTo(SLF_START, SLF_DOOR) },
  field: FIELD,
  arrival: { ...FIELD_ARRIVAL, heading: headingTo(FIELD_ARRIVAL, FIELD) },
  fieldLv95: { E: 2780845, N: 1189230, H: 2536 }
};

/** The hand hardness test, softest to hardest: a tool goes in when the layer is no harder than the tool is thin */
export const HARDNESS = [
  { id: 'F', name: 'Fist' }, { id: '4F', name: 'Four fingers' }, { id: '1F', name: 'One finger' }, { id: 'P', name: 'Pencil' }, { id: 'K', name: 'Knife' }
];
export const toolGoesIn = (layerHard, tool) => tool >= layerHard;
/** The grain shapes with their symbols of the international classification (Fierz et al., 2009) */
export const GRAINS = [
  { id: 'PP', symbol: '+', name: 'Fresh snow' }, { id: 'DF', symbol: '/', name: 'Decomposing' }, { id: 'RG', symbol: '●', name: 'Rounded' },
  { id: 'FC', symbol: '□', name: 'Faceted' }, { id: 'DH', symbol: '∧', name: 'Depth hoar' }, { id: 'MF', symbol: '○', name: 'Melt-freeze' }
];
/** The European avalanche danger scale */
export const DANGER = [
  { level: 1, name: 'Low', colour: '#ccff66' }, { level: 2, name: 'Moderate', colour: '#ffff00' }, { level: 3, name: 'Considerable', colour: '#ff9900' },
  { level: 4, name: 'High', colour: '#ff0000' }, { level: 5, name: 'Very high', colour: '#990000' }
];

export const SNOW = {
  digTime: 6, // s of digging to the ground
  testTime: 0.35, // s a push into the wall takes
  tempStep: 10, // cm between two readings
  temp: { handWarm: 5, tau: 0.22 }, // °C the thermometer is off when it goes in (warm from the pocket), s it settles by
  tap: { cooldown: 0.12, max: 30 }, // the compression test: 10 from the wrist, 10 from the elbow, 10 from the shoulder
  newSnowCm: 30, // this much fresh snow adds a danger level
  points: { hardness: 200, grain: 200, temp: 150, ct: 100, danger: 200, time: 150, dangerNear: 80, tempExact: 0.3, tempZero: 2, timeT: [80, 200] },
  medals: { gold: 800, silver: 600, bronze: 350 }
};

/** A winter's snowpack, the top layer first: { H (cm), layers: [{ top, bottom (cm above the ground), hard, grain, weak }],
 *  weak (its index), ct (the tap it breaks at), surfaceT (°C), newSnow (cm), danger } */
export function createSnowpack(seed = 7) {
  const rand = seededRandom(seed);
  const span = (a, b) => Math.round(a + rand() * (b - a));
  const pick = (list) => list[Math.floor(rand() * list.length)];
  // from the ground up: depth hoar, old rounded snow, the autumn's crust with the weak layer on it, the slab, the new snow
  const stack = [
    { d: span(14, 24), hard: 1, grain: 'DH', weak: false },
    { d: span(28, 44), hard: pick([2, 3]), grain: 'RG', weak: false },
    { d: span(8, 12), hard: pick([3, 4]), grain: 'MF', weak: false },
    { d: span(8, 14), hard: pick([0, 1]), grain: pick(['FC', 'DH']), weak: true },
    { d: span(24, 42), hard: 2, grain: pick(['RG', 'DF']), weak: false },
    { d: span(10, 42), hard: 0, grain: 'PP', weak: false }
  ];
  const layers = [];
  let h = 0;
  for (const l of stack) { layers.unshift({ bottom: h, top: h + l.d, hard: l.hard, grain: l.grain, weak: l.weak }); h += l.d; }
  const snow = { H: h, layers, weak: layers.findIndex((l) => l.weak), ct: span(6, 28), surfaceT: -span(6, 14), newSnow: layers[0].top - layers[0].bottom, seed };
  snow.danger = dangerFor(snow);
  return snow;
}

/** The danger level this profile speaks for. (Very much the game's rule of thumb: the real bulletin weighs many profiles,
 *  the weather and the observers' reports for a whole region.) */
export function dangerFor(snow) {
  const base = snow.ct <= 10 ? 4 : snow.ct <= 20 ? 3 : 2;
  return clamp(base + (snow.newSnow >= SNOW.newSnowCm ? 1 : 0), 1, 5);
}

/** The temperature at a depth (cm under the surface), °C to a tenth: near 0 at the ground, curving to the cold surface */
export function snowTempAt(snow, depth) {
  const k = clamp((snow.H - depth) / snow.H, 0, 1);
  return Math.round((-0.4 + (snow.surfaceT + 0.4) * k ** 1.3) * 10) / 10;
}
/** The depths of the readings: from the surface every 10 cm */
export const snowDepths = (snow) => { const out = []; for (let d = 0; d <= snow.H; d += SNOW.tempStep) out.push(d); return out; };

export function createSnowGame(seed = 7) {
  const snow = createSnowpack(seed);
  return {
    snow, stage: 'dig', t: 0, done: false, dug: 0,
    layer: 0, sub: 'hard', tests: [], selected: null, busy: 0,
    depths: snowDepths(snow), temp: { i: 0, holding: false, value: null, held: 0 },
    ct: { taps: 0, cool: 0, broke: false },
    record: { hard: [], grain: [], temps: [], ctLayer: null, ctTap: null, danger: null },
    result: null, events: []
  };
}

/** Pushes a tool into the wall of the layer in hand: the answer after a moment */
export function snowTest(g, tool) {
  if (g.stage !== 'layers' || g.sub !== 'hard' || g.busy > 0 || !HARDNESS[tool]) return false;
  g.busy = SNOW.testTime;
  g.selected = tool;
  g.tests = g.tests.filter((r) => r.tool !== tool);
  g.tests.push({ tool, in: null });
  return true;
}
/** Writes the tool last tried on the sheet as the layer's hardness */
export function snowWrite(g) {
  if (g.stage !== 'layers' || g.sub !== 'hard' || g.busy > 0 || g.selected == null) return false;
  g.record.hard[g.layer] = g.selected;
  g.sub = 'grain'; g.tests = []; g.selected = null;
  return true;
}
/** The grain under the loupe: on to the next layer, or to the thermometer */
export function snowGrain(g, id) {
  if (g.stage !== 'layers' || g.sub !== 'grain' || !GRAINS.some((v) => v.id === id)) return false;
  g.record.grain[g.layer] = id;
  g.layer++;
  g.sub = 'hard';
  if (g.layer >= g.snow.layers.length) { g.layer = 0; g.stage = 'temp'; g.events.push({ kind: 'stage', stage: 'temp' }); }
  return true;
}
/** A tap on the shovel on top of the column */
export function snowTap(g) {
  if (g.stage !== 'ct' || g.ct.cool > 0) return false;
  g.ct.cool = SNOW.tap.cooldown;
  g.ct.taps++;
  g.events.push({ kind: 'tap', n: g.ct.taps });
  if (g.ct.taps >= g.snow.ct) {
    g.ct.broke = true; g.record.ctTap = g.ct.taps; g.stage = 'pick';
    g.events.push({ kind: 'break', n: g.ct.taps });
  }
  return true;
}
/** Where the column broke: the player marks the layer */
export function snowPick(g, layer) {
  if (g.stage !== 'pick' || !g.snow.layers[layer]) return false;
  g.record.ctLayer = layer;
  g.stage = 'danger';
  return true;
}
/** The level for the bulletin: the sheet comes back against the truth */
export function snowDanger(g, level) {
  if (g.stage !== 'danger' || !DANGER.some((d) => d.level === level)) return false;
  g.record.danger = level;
  g.result = snowScore(g);
  g.stage = 'sheet';
  g.events.push({ kind: 'result', total: g.result.total });
  return true;
}
/** The sheet is read: the end */
export function snowClose(g) { if (g.stage !== 'sheet') return false; g.done = true; return true; }

/** The time goes on. input: { dig: held, hold: the thermometer held in the wall } */
export function snowStep(g, input = {}, dt = 0) {
  if (g.done || dt <= 0 || g.stage === 'sheet') return g;
  g.t += dt;
  g.ct.cool = Math.max(0, g.ct.cool - dt);
  if (g.stage === 'dig') {
    if (input.dig) {
      g.dug = Math.min(1, g.dug + dt / SNOW.digTime);
      if (g.dug >= 1) { g.stage = 'layers'; g.events.push({ kind: 'stage', stage: 'layers' }); }
    }
  } else if (g.stage === 'layers' && g.busy > 0) {
    g.busy -= dt;
    if (g.busy <= 0) {
      g.busy = 0;
      const test = g.tests[g.tests.length - 1];
      test.in = toolGoesIn(g.snow.layers[g.layer].hard, test.tool);
      g.events.push({ kind: test.in ? 'in' : 'stopped' });
    }
  } else if (g.stage === 'temp') {
    const T = g.temp, truth = snowTempAt(g.snow, g.depths[T.i]);
    if (input.hold) {
      if (!T.holding) { T.holding = true; T.held = 0; T.value = truth + SNOW.temp.handWarm; }
      T.held += dt;
      T.value = truth + (T.value - truth) * Math.exp(-dt / SNOW.temp.tau);
    } else if (T.holding) {
      // out of the wall: what it shows is what goes on the sheet
      T.holding = false;
      g.record.temps[T.i] = Math.round(T.value * 10) / 10;
      T.i++;
      T.value = null;
      g.events.push({ kind: 'reading' });
      if (T.i >= g.depths.length) { g.stage = 'ct'; g.events.push({ kind: 'stage', stage: 'ct' }); }
    }
  }
  return g;
}

/** How the sheet compares with the truth, out of 1000 */
export function snowScore(g) {
  const P = SNOW.points, { snow, record: r } = g, n = snow.layers.length;
  let hard = 0, grain = 0;
  snow.layers.forEach((l, i) => {
    const off = r.hard[i] == null ? 9 : Math.abs(r.hard[i] - l.hard);
    hard += off === 0 ? 1 : off === 1 ? 0.5 : 0;
    if (r.grain[i] === l.grain) grain++;
  });
  const temps = g.depths.reduce((sum, d, i) => {
    if (r.temps[i] == null) return sum;
    const e = Math.abs(r.temps[i] - snowTempAt(snow, d));
    return sum + clamp(1 - (e - P.tempExact) / (P.tempZero - P.tempExact), 0, 1);
  }, 0) / g.depths.length;
  const dangerOff = r.danger == null ? 9 : Math.abs(r.danger - snow.danger);
  const parts = {
    hardness: Math.round((P.hardness * hard) / n),
    grain: Math.round((P.grain * grain) / n),
    temp: Math.round(P.temp * temps),
    ct: r.ctLayer === snow.weak ? P.ct : 0,
    danger: dangerOff === 0 ? P.danger : dangerOff === 1 ? P.dangerNear : 0,
    time: Math.round(P.time * clamp((P.timeT[1] - g.t) / (P.timeT[1] - P.timeT[0]), 0, 1))
  };
  return { ...parts, total: parts.hardness + parts.grain + parts.temp + parts.ct + parts.danger + parts.time };
}

export const SNOW_STAGE_TEXT = {
  dig: 'Dig down to the ground', layers: 'Test the layers', temp: 'Take the temperatures', ct: 'Compression test', pick: 'Where did it break?', danger: 'Set the danger level', sheet: 'The sheet against the truth'
};

export const SNOW_MISSION = {
  id: 'schneeprofil-slf',
  title: 'Snow profile for the SLF',
  intro: 'At the SLF in Davos Dorf the avalanche forecasters want a fresh profile from the measuring field on the Weissfluhjoch, 2536 m. Fetch the kit at the institute, ride up, then do it as it is really done. Hold to dig to the ground. Layer by layer: try fist, four fingers, one finger, pencil, knife, and write down the largest that still goes in; look at the grain under the loupe. Hold the thermometer in the wall every 10 cm until it settles. Tap the compression test: where does it break? Then set the danger level for the bulletin. Your sheet is compared with the truth, and the quicker the better. About three minutes.',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['snowProfile'],
  scoreMode: true,
  medals: SNOW.medals,
  colour: '#3a6fb0',
  icon: 'snowprofile',
  finish: 'The profile is on its way to the forecasters in Davos Dorf.',
  start: { ...SLF.start },
  props: [],
  createState() { return { game: null, arrived: false }; },
  score: (state) => state.game?.result?.total ?? 0,
  summary(state) {
    const r = state.game?.result;
    if (!r) return [];
    return [`Hardness ${r.hardness} · grain ${r.grain} · temperature ${r.temp} · break ${r.ct} · danger ${r.danger} · time ${r.time}`];
  },
  objectives: [
    walkTo(SLF.door, 'Fetch the kit at the SLF', 'the SLF', 'kit'),
    {
      id: 'ride',
      title: 'Up with the Parsennbahn',
      check(ctx, state) { return { done: !!state.arrived, progress: null, text: 'Up to the Weissfluhjoch …', target: null, hint: null }; }
    },
    walkTo(SLF.field, 'Go to the measuring field', 'the measuring field', 'field'),
    {
      id: 'profile',
      title: 'Take the profile',
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'Unpacking the kit …', target: null, hint: null };
        return { done: g.done, progress: null, text: `${SNOW_STAGE_TEXT[g.stage]} · ${fmtClock(g.t)}`, target: null, hint: null };
      }
    }
  ]
};

export const EXPERT_MISSIONS = [EYE_MISSION, SNOW_MISSION];
