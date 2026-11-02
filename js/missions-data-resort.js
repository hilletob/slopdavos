// js/missions-data-resort.js
// Three jobs of a winter day in the resort (js/missions-data.js spreads RESORT_MISSIONS into MISSIONS; js/missions-resort.js
// has their runtime: the props, input, camera, HUD and the music). Like js/missions-data.js: no three.js and no DOM in here,
// so that tests/missions-resort.test.mjs drives the games with synthetic frames. Everything scored (scoreMode).
//
//  - tbar-attendant: the Bügellift Hauptertäli on the Parsenn (OSM w51510598, valley station n658524654, 2441 m): hand the
//    T-bar to each pair of skiers at the right moment, with a Ländler playing from the lift hut. Score: skiers sent up.
//  - wax-hofmaenner: the waxing bench at Sport Hofmänner (OSM n4068557218, Mattastrasse, Davos Platz): read the snow
//    temperature, pick the wax, iron it on evenly, scrape, brush. Score: quality of each pair.
//  - parking-marshal: the Parkplatz Jakobshornbahn (OSM w37349398, Davos Platz) on a winter morning: wave each car to a free
//    bay. Score: cars parked well, minus crooked parkers, blockers and close calls with skiers crossing.
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z, south).
import { BERGBAHNEN } from './bergbahnen-data.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
const fmtClock = (s) => { const v = Math.max(0, Math.ceil(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const round1 = (v) => Math.round(v * 10) / 10;

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
function walkTo(spot, title, label, id = 'walk') {
  return {
    id, title,
    check(ctx) {
      const d = Math.hypot(ctx.x - spot.x, ctx.z - spot.z);
      return { done: d < spot.r, progress: null, text: `${fmtDist(d)} to ${label}`, target: { ...spot, style: 'plain' }, hint: null };
    }
  };
}

// =====================================================================================================================
// 1. The T-bar attendant
// =====================================================================================================================
// The lift as js/bergbahnen.js runs it (js/bergbahnen-data.js): the up rope lies gauge / 2 to the right of the line of
// supports; the bars pass the loading point `load` m after the valley station's wheel.
export const TBAR_LIFT_ID = 'w51510598';
const lift = BERGBAHNEN.ropeways.find((r) => r.id === TBAR_LIFT_ID);
const [s0, s1] = lift.supports;
const liftLen = Math.hypot(s1.x - s0.x, s1.z - s0.z);
const ldx = (s1.x - s0.x) / liftLen, ldz = (s1.z - s0.z) / liftLen; // up the line
const lrx = -ldz, lrz = ldx; // to the right of it, as js/bergbahnen.js ropeLine offsets it
const ROPE_OFFSET = 1.3; // (GAUGE['t-bar'] / 2)
const LOAD_S = 14; // m of rope from the wheel to the loading point
export const TBAR = {
  length: 120, // s
  speed: [3, 4.6], // m/s of the rope, at the start and at the end: the morning rush, the boss turns it up
  spacing: (3 * 3600 * (lift.occupancy || 2)) / (lift.capacity || 1000), // m between two bars (js/bergbahnen.js)
  firstGap: 24, // m the first bar has to go to the loading point
  perfect: 0.14, // s off the bar's arrival: a clean hand-over
  window: 0.36, // s: still good
  fumble: 0.95, // s: within this but outside the window the bar hits a skier
  kidFactor: 0.75, // the kids' bar has to be lower: a narrower window
  queue: 7, // pairs waiting in the lane
  gap: 3.1, // m between two pairs in the lane
  shuffle: 1.7, // m/s the lane moves up
  clear: 2.2, // s a fallen pair blocks the lane
  loadS: LOAD_S,
  station: { x: s0.x, z: s0.z },
  dir: { x: ldx, z: ldz },
  right: { x: lrx, z: lrz },
  heading: Math.atan2(ldx, ldz),
  load: { x: round1(s0.x + ldx * LOAD_S + lrx * ROPE_OFFSET), z: round1(s0.z + ldz * LOAD_S + lrz * ROPE_OFFSET) },
  spot: { x: round1(s0.x + ldx * LOAD_S + lrx * (ROPE_OFFSET + 2.3)), z: round1(s0.z + ldz * LOAD_S + lrz * (ROPE_OFFSET + 2.3)), r: 2.6 },
  hut: { x: round1(s0.x + ldx * 9 - lrx * 5.5), z: round1(s0.z + ldz * 9 - lrz * 5.5) }, // across the lane from the attendant
  medals: { gold: 40, silver: 30, bronze: 16 }
};

export const tbarSpeed = (t) => TBAR.speed[0] + (TBAR.speed[1] - TBAR.speed[0]) * clamp(t / TBAR.length, 0, 1);
export const tbarBarS = (i) => TBAR.firstGap + i * TBAR.spacing;

function tbarPair(g, slot) {
  const r = g.rand();
  return { id: ++g.ids, kind: r < 0.16 ? 'kids' : r < 0.3 ? 'boarders' : 'skiers', pos: slot * TBAR.gap + TBAR.gap * 0.5 };
}

export function createTbarGame(seed = 11) {
  const g = {
    rand: seededRandom(seed), ids: 0, t: 0, s: 0, next: 0, handled: false, queue: [], sent: [], fallen: [],
    skiers: 0, pairs: 0, perfects: 0, empties: 0, knocks: 0, streak: 0, best: 0, clear: 0, last: null, events: [], done: false
  };
  for (let i = 0; i < TBAR.queue; i++) g.queue.push(tbarPair(g, i));
  g.queue[0].pos = 0;
  return g;
}

/** Seconds until the next bar reaches the loading point (below zero: just past it) */
export const tbarTimeTo = (g) => (tbarBarS(g.next) - g.s) / tbarSpeed(g.t);
export const tbarFrontReady = (g) => g.clear <= 0 && g.queue.length > 0 && g.queue[0].pos <= 0.25;

function tbarEvent(g, e) { g.last = { ...e, at: g.t }; g.events.push(g.last); return g.last; }

/** The time goes on: the rope, the lane, the bars that pass */
export function tbarStep(g, dt) {
  if (g.done || dt <= 0) return g;
  g.t += dt;
  g.s += tbarSpeed(g.t) * dt;
  g.clear = Math.max(0, g.clear - dt);
  for (const f of g.fallen) f.t += dt;
  g.fallen = g.fallen.filter((f) => f.t < 3.2);
  // the lane moves up (the front pair not while a fallen one is in the way)
  g.queue.forEach((p, i) => {
    if (g.clear > 0) return;
    p.pos = Math.max(i * TBAR.gap, p.pos - TBAR.shuffle * dt);
  });
  while (g.queue.length < TBAR.queue) g.queue.push(tbarPair(g, g.queue.length + 1));
  // a bar nobody took swings by empty
  if (tbarTimeTo(g) < -TBAR.fumble) {
    if (!g.handled) { g.empties++; g.streak = 0; tbarEvent(g, { kind: 'empty', bar: g.next }); }
    g.next++;
    g.handled = false;
  }
  if (g.t >= TBAR.length) g.done = true;
  return g;
}

/** The attendant hands over the bar (a key, a tap). Returns the event, or null when there is nothing to do */
export function tbarHandOver(g) {
  if (g.done || g.handled) return null; // (this bar is gone already)
  const dt = tbarTimeTo(g), off = Math.abs(dt);
  if (off > TBAR.fumble) return tbarEvent(g, { kind: 'air' }); // no bar in reach: a grab at the air, no harm
  if (!tbarFrontReady(g)) return tbarEvent(g, { kind: 'nobody' }); // nobody in place yet: the bar goes up empty
  const pair = g.queue[0];
  const wide = TBAR.window * (pair.kind === 'kids' ? TBAR.kidFactor : 1);
  g.handled = true;
  g.queue.shift();
  if (off <= wide) {
    const perfect = off <= TBAR.perfect;
    g.pairs++; g.skiers += 2; g.streak++; g.best = Math.max(g.best, g.streak);
    if (perfect) g.perfects++;
    g.sent.push({ id: pair.id, kind: pair.kind, s0: tbarBarS(g.next), bar: g.next });
    if (g.sent.length > 14) g.sent.shift();
    return tbarEvent(g, { kind: perfect ? 'perfect' : 'good', bar: g.next, pair });
  }
  g.knocks++; g.streak = 0; g.clear = TBAR.clear;
  g.fallen.push({ id: pair.id, kind: pair.kind, t: 0, side: dt > 0 ? 1 : -1 });
  return tbarEvent(g, { kind: 'knock', early: dt > 0, bar: g.next, pair });
}

export const TBAR_MISSION = {
  id: 'tbar-attendant',
  title: 'Lift attendant at the Hauptertäli',
  intro: 'A sunny day on the Parsenn, and the lift hut\'s radio plays a Ländler. You are the attendant of the Hauptertäli T-bar: skiers come up the lane in pairs, and you hand them the bar just as it arrives. Press Space (or tap) when the bar reaches the green mark. Too early or too late and it knocks a skier over (they laugh it off); do nothing and it swings up empty. The rush builds: the boss turns the lift up. Two minutes: how many skiers can you send up?',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['tbarAttendant'],
  scoreMode: true,
  scoreUnit: 'skiers',
  medals: TBAR.medals,
  colour: '#2a8fd8',
  icon: 'tbar',
  finish: 'The lunch break: the lane is empty, the Ländler plays on.',
  start: { x: round1(TBAR.spot.x + lrx * 13 - ldx * 9), z: round1(TBAR.spot.z + lrz * 13 - ldz * 9), heading: Math.atan2(-lrx * 13 + ldx * 9, -lrz * 13 + ldz * 9) },
  props: [],
  createState() { return { game: null }; },
  score: (state) => state.game?.skiers ?? 0,
  summary(state) {
    const g = state.game;
    return g ? [`${g.pairs} pairs up · ${g.perfects} perfect hand-overs · best run ${g.best} · ${g.knocks} knocked over · ${g.empties} empty bars`] : [];
  },
  objectives: [
    walkTo(TBAR.spot, 'Go to the loading point', 'the loading point'),
    {
      id: 'operate',
      title: 'Send them up (2 min)',
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'The lift is starting …', target: null, hint: null };
        return { done: g.done, progress: g.t / TBAR.length, text: `${g.skiers} skiers up · ${fmtClock(TBAR.length - g.t)}${g.streak > 2 ? ` · run of ${g.streak}` : ''}`, target: null, hint: 'Space / tap: hand over the bar' };
      }
    }
  ]
};

// --- The Ländler -------------------------------------------------------------------------------------------------------
// A short Swiss Ländler in G, 3/4, the form AABB: the Schwyzerörgeli (accordion) has the tune, the clarinet joins a third
// below on the repeats, the bass and the chords go oom-pah-pah. js/missions-resort.js synthesises it.
const CHORD_TONES = { G: [7, 11, 2], C: [0, 4, 7], D: [2, 6, 9, 0] }; // pitch classes (D: D7)
const CHORD_BASS = { G: 43, C: 48, D: 38 }; // MIDI: the bass note of each chord
export const LAENDLER_TEMPO = 150; // crotchets a minute
const LAENDLER_A = [
  ['G', 'B4:.5 D5:.5 G5:1 D5:.5 B4:.5'],
  ['G', 'D5:.5 B4:.5 A4:.5 B4:.5 G4:1'],
  ['D', 'A4:.5 C5:.5 F#5:1 E5:.5 D5:.5'],
  ['D', 'C5:.5 D5:.5 A4:1 F#4:1'],
  ['D', 'A4:.5 D5:.5 F#5:.5 A5:.5 F#5:.5 D5:.5'],
  ['D', 'C5:.5 A4:.5 D5:.5 C5:.5 A4:1'],
  ['G', 'B4:.5 G5:.5 F#5:.5 E5:.5 D5:.5 B4:.5'],
  ['G', 'G4:1 G5:1 -:1']
];
const LAENDLER_B = [
  ['C', 'E5:.5 G5:.5 C6:1 G5:.5 E5:.5'],
  ['C', 'E5:.5 F5:.5 E5:.5 D5:.5 C5:1'],
  ['G', 'D5:.5 G5:.5 B5:1 G5:.5 D5:.5'],
  ['G', 'D5:.5 E5:.5 D5:.5 C5:.5 B4:1'],
  ['D', 'A4:.5 D5:.5 F#5:1 A5:.5 F#5:.5'],
  ['D', 'F#5:.5 G5:.5 F#5:.5 E5:.5 D5:1'],
  ['G', 'B4:.5 D5:.5 G5:.5 F#5:.5 E5:.5 D5:.5'],
  ['G', 'G5:1 D5:.5 B4:.5 G4:1']
];
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'F#5' → MIDI */
export function noteMidi(name) {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  return m ? (Number(m[3]) + 1) * 12 + SEMI[m[1]] + (m[2] ? 1 : 0) : null;
}
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const G_MAJOR = [7, 9, 11, 0, 2, 4, 6];
/** The diatonic third below in G major */
export function thirdBelow(midi) {
  const i = G_MAJOR.indexOf(((midi % 12) + 12) % 12);
  if (i < 0) return midi - 3;
  const pc = G_MAJOR[(i + 5) % 7];
  return midi - (((midi % 12) - pc + 12) % 12);
}
const parseBar = ([chord, tune], clarinet) => ({
  chord, bass: CHORD_BASS[chord], tones: CHORD_TONES[chord], clarinet,
  notes: tune.split(' ').map((n) => { const [name, beats] = n.split(':'); return { midi: name === '-' ? null : noteMidi(name), beats: Number(beats) }; })
});
/** The whole loop, bar by bar: { chord, bass, tones, clarinet, notes: [{ midi | null, beats }] } */
export const LAENDLER = [
  ...LAENDLER_A.map((b) => parseBar(b, false)), ...LAENDLER_A.map((b) => parseBar(b, true)),
  ...LAENDLER_B.map((b) => parseBar(b, false)), ...LAENDLER_B.map((b) => parseBar(b, true))
];
/** Reduced by distance from the hut (m): 1 beside it, silent past 220 m */
export const laendlerLevel = (d) => { const k = clamp(1 - d / 220, 0, 1); return k * k; };

// =====================================================================================================================
// 2. Waxing at Hofmänner
// =====================================================================================================================
// Sport Hofmänner: OSM n4068557218 (shop=sports), in the big building on the Mattastrasse; the door on its south side.
export const HOFMAENNER = { door: { x: -240.6, z: 199.5, r: 2.6 }, start: { x: -252.6, z: 203.6, heading: 1.2 } };
// The glide waxes (colour-coded by the snow's temperature, as the makers' ranges), warm to cold
export const WAXES = [
  { id: 'yellow', name: 'Yellow', colour: '#f6d60c', from: 5, to: -1 },
  { id: 'red', name: 'Red', colour: '#df2f35', from: -1, to: -4 },
  { id: 'violet', name: 'Violet', colour: '#8a3fc7', from: -4, to: -8 },
  { id: 'blue', name: 'Blue', colour: '#2274d8', from: -8, to: -14 },
  { id: 'green', name: 'Green', colour: '#22a35a', from: -14, to: -30 }
];
export const WAX = {
  length: 150, // s at the bench
  cells: 20, // a ski's length in cells
  iron: { width: 0.16, rate: 3.4, melt: 1, burn: 2.2, cool: 0.25, need: 0.9, accel: 0.8, friction: 1, vmax: 0.9, contactV: 0.12 },
  hotRange: [0.85, 1.2], // the old iron's thermostat hunts
  huntPeriod: 11, // s
  scrape: { pass: 0.55, chatter: 0.25, tooFast: 1.5, minV: 0.15, rate: 2.4, vmax: 1.1 },
  brush: { pass: 0.34 },
  points: { wax: 40, near: 18, iron: 40, burn: 4, finish: 20, chatter: 3, quick: 10, quickT: 16 },
  medals: { gold: 800, silver: 550, bronze: 300 }
};
export const WAX_CUSTOMERS = ['Frau Ambühl', 'Herr Buol', 'Frau Meisser', 'Herr Flury', 'Frau Accola', 'Herr Branger', 'Frau Hew', 'Herr Valär', 'Frau Gadmer', 'Herr Ruosch', 'Frau Michel', 'Herr Sprecher'];
export const WAX_LOIPEN = ['Flüela', 'Dischma', 'Sertig', 'Clavadel', 'Frauenkirch', 'Davosersee', 'Monstein'];

/** The wax for a snow temperature (°C): `from` ≥ t > `to` */
export const waxFor = (temp) => WAXES.find((w) => temp <= w.from && temp > w.to) || (temp > WAXES[0].from ? WAXES[0] : WAXES[WAXES.length - 1]);
/** How far off the choice is: 0 right, 1 next to it, 2 and more plain wrong */
export const waxOff = (temp, id) => Math.abs(WAXES.indexOf(waxFor(temp)) - WAXES.findIndex((w) => w.id === id));
export const ironHeat = (t) => WAX.hotRange[0] + (WAX.hotRange[1] - WAX.hotRange[0]) * (0.5 + 0.5 * Math.sin((t / WAX.huntPeriod) * Math.PI * 2));

/** The speed band (ski lengths a second) that melts without burning at this iron heat */
export function ironBand(heat) {
  const I = WAX.iron, per = I.rate * heat * I.width;
  return [per / I.burn, per / I.melt];
}

const newCells = () => Array.from({ length: WAX.cells }, () => ({ heat: 0, melted: false, burnt: false }));
function waxPair(b) {
  // (a temperature well inside a colour's range, never on the edge between two)
  const w = WAXES[Math.floor(b.rand() * WAXES.length)];
  const lo = Math.max(w.to, -22), hi = Math.min(w.from, 2);
  const temp = Math.round(lo + 0.5 + b.rand() * Math.max(0, hi - lo - 1));
  return {
    id: ++b.ids, customer: WAX_CUSTOMERS[b.ids % WAX_CUSTOMERS.length], loipe: WAX_LOIPEN[Math.floor(b.rand() * WAX_LOIPEN.length)], temp,
    wax: null, off: null, stage: 'wax', ski: 0, skis: [newCells(), newCells()], u: 0, v: 0, contact: false, excess: 1, shine: 0, chatter: 0, pass: 0, t: 0, points: 0, quality: null
  };
}
export function createWaxBench(seed = 5) {
  const b = { rand: seededRandom(seed), ids: 0, t: 0, done: false, score: 0, pairs: [], pair: null, last: null, events: [] };
  b.pair = waxPair(b);
  return b;
}

/** The player picks a wax: on to the iron */
export function waxPick(b, id) {
  const p = b.pair;
  if (b.done || !p || p.stage !== 'wax' || !WAXES.some((w) => w.id === id)) return false;
  p.wax = id;
  p.off = waxOff(p.temp, id);
  p.stage = 'iron';
  p.u = 0; p.v = 0;
  b.events.push({ kind: p.off === 0 ? 'wax-right' : 'wax-wrong', off: p.off });
  return true;
}

export const skiMelted = (cells) => cells.filter((c) => c.melted && !c.burnt).length / cells.length;
export const skiBurnt = (cells) => cells.filter((c) => c.burnt).length;

function moveTool(p, input, dt, vmax, friction, accel) {
  if (input.u != null) {
    // the finger takes the tool where it goes; its pace (smoothed) is what is judged
    const v = (input.u - p.u) / Math.max(dt, 1e-3);
    p.v += (v - p.v) * Math.min(1, dt / 0.08);
    p.u = clamp(input.u, 0, 1);
    p.contact = true;
    return;
  }
  if (input.push) { p.v = clamp(p.v + input.push * accel * dt, -vmax, vmax); p.contact = true; } else {
    p.v -= Math.sign(p.v) * Math.min(Math.abs(p.v), friction * dt);
    p.contact = Math.abs(p.v) > WAX.iron.contactV;
  }
  p.u = clamp(p.u + p.v * dt, 0, 1);
}

/** The time goes on. input: { u: the finger's place on the ski (0-1) or null, push: -1 | 0 | 1 (the keys) } */
export function waxStep(b, input = {}, dt = 0) {
  if (b.done || dt <= 0) return b;
  b.t += dt;
  if (b.t >= WAX.length) { b.done = true; return b; }
  const p = b.pair;
  p.t += dt;
  if (p.stage === 'iron') {
    const I = WAX.iron, cells = p.skis[p.ski];
    moveTool(p, input, dt, I.vmax, I.friction, I.accel);
    const heat = ironHeat(b.t);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], at = (i + 0.5) / cells.length;
      if (p.contact && Math.abs(at - p.u) <= I.width / 2) c.heat += I.rate * heat * dt;
      else c.heat *= Math.exp(-I.cool * dt);
      if (c.heat >= I.melt) c.melted = true;
      if (c.heat >= I.burn && !c.burnt) { c.burnt = true; b.events.push({ kind: 'burn' }); }
    }
    if ((skiMelted(cells) * cells.length + skiBurnt(cells)) / cells.length >= I.need) {
      // this ski is done: the other, or the scraper
      p.u = 0; p.v = 0; p.contact = false;
      if (p.ski === 0) { p.ski = 1; b.events.push({ kind: 'ski-done' }); }
      else { p.stage = 'scrape'; p.pass = 0; b.events.push({ kind: 'ironed' }); }
    }
  } else if (p.stage === 'scrape' || p.stage === 'brush') {
    const S = WAX.scrape, before = p.u;
    moveTool(p, input, dt, S.vmax, 6, S.rate);
    // a stroke counts when it runs the ski's length, tip to tail
    if (p.contact && p.v > S.minV && p.u > before) p.pass += p.u - before;
    if (p.u >= 0.995) {
      if (p.pass >= 0.6) {
        const fast = Math.abs(p.v) > S.tooFast;
        if (fast) p.chatter++;
        if (p.stage === 'scrape') {
          p.excess = Math.max(0, p.excess - (fast ? S.chatter : S.pass));
          b.events.push({ kind: 'scrape' });
          if (p.excess < 0.05) { p.stage = 'brush'; b.events.push({ kind: 'scraped' }); }
        } else {
          p.shine = Math.min(1, p.shine + WAX.brush.pass);
          b.events.push({ kind: 'brush' });
          if (p.shine >= 0.99) { waxFinish(b); return b; }
        }
      }
      p.pass = 0;
      if (input.u == null) { p.u = 0; p.v = 0; } // (the keys: the tool back at the tip)
    }
    if (input.u != null && p.u < 0.08) p.pass = 0; // (the finger back at the tip)
  }
  return b;
}

/** The pair's points out of 100 (+ a tip for a quick job) */
export function waxQuality(p) {
  const P = WAX.points;
  const wax = p.off === 0 ? P.wax : p.off === 1 ? P.near : 0;
  const melted = (skiMelted(p.skis[0]) + skiMelted(p.skis[1])) / 2;
  const burnt = skiBurnt(p.skis[0]) + skiBurnt(p.skis[1]);
  const iron = clamp(P.iron * Math.min(1, melted / 0.9) - burnt * P.burn, 0, P.iron);
  const finish = clamp(P.finish - p.chatter * P.chatter, 0, P.finish);
  const quick = p.t <= P.quickT ? P.quick : 0;
  return { wax, iron: Math.round(iron), finish, quick, burnt, total: Math.round(wax + iron + finish + quick) };
}

function waxFinish(b) {
  const p = b.pair;
  p.stage = 'done';
  p.quality = waxQuality(p);
  p.points = p.quality.total;
  b.score += p.points;
  b.pairs.push(p);
  b.last = { points: p.points, quality: p.quality, customer: p.customer, at: b.t };
  b.events.push({ kind: 'pair', points: p.points });
  b.pair = waxPair(b);
}

export const WAX_MISSION = {
  id: 'wax-hofmaenner',
  title: 'Waxing skis at Hofmänner',
  intro: 'Saturday morning at Sport Hofmänner on the Mattastrasse: the cross-country skiers want their Langlaufski waxed. Read the snow temperature on the board and pick the wax by its colour (keys 1-5 or tap). Iron it on in one even stroke per ski, tip to tail: drag the iron, or hold → / D and keep the pace in the green band. Too slow, or a hot iron held still, burns the base. Then scrape and brush, tip to tail (drag, or hold →). Two and a half minutes: quality counts, and so does the number of pairs.',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['waxBench'],
  scoreMode: true,
  medals: WAX.medals,
  colour: '#1b4f8a',
  icon: 'wax',
  finish: 'Closing time at the bench: the whole shop smells of wax.',
  start: { ...HOFMAENNER.start },
  props: [],
  createState() { return { bench: null }; },
  score: (state) => state.bench?.score ?? 0,
  summary(state) {
    const b = state.bench;
    return b ? [`${b.pairs.length} pairs waxed · ${b.pairs.map((p) => p.points).join(' · ') || 'no pair finished'}`] : [];
  },
  objectives: [
    walkTo(HOFMAENNER.door, 'Go into Sport Hofmänner', 'Hofmänner', 'enter'),
    {
      id: 'bench',
      title: 'Wax Langlaufski (2:30)',
      check(ctx, state) {
        const b = state.bench;
        if (!b) return { done: false, progress: 0, text: 'The iron is heating up …', target: null, hint: null };
        return { done: b.done, progress: b.t / WAX.length, text: `${b.score} pts · ${b.pairs.length} pairs · ${fmtClock(WAX.length - b.t)}`, target: null, hint: null };
      }
    }
  ]
};

// =====================================================================================================================
// 3. The parking marshal
// =====================================================================================================================
// The Parkplatz Jakobshornbahn (OSM w37349398), the long lot along the Brämabüelstrasse below the valley station: the bays
// js/parking.js lays out (two rows either side of one 6 m aisle), the free ones js/parking.js lotBays hands out. Along the
// aisle `a` runs from the marshal in the cars' direction (south-west, in from the lot's north-east end), `lat` to their right.
export const MARSHAL = {
  length: 120, // s
  lot: 'w37349398',
  // the marshal on the aisle's line (the lot's frame: d along its longest edge, the aisle at v = -183.4; u = -640); the
  // Chalet Bello (w965237018) closes the aisle at u = -747, so the stream runs towards it, the far end of the job
  frame: { x: -487.92, z: 452.95, dx: -0.517095, dz: 0.855928 },
  heading: Math.atan2(-0.517095, 0.855928),
  spawnA: -52, // m: where the cars come in
  window: 24, // m before the line: the driver sees the gesture from here
  late: 3.5, // m before the line: too late to park straight
  holdA: -3.8, // m: where a held car stops (its nose short of the line)
  marshalLat: -2.7, // m: the marshal stands at the aisle's edge, the cars pass him
  cruise: 4.6, // m/s
  gapM: 8.2, // m from car to car
  interval: [6.4, 4.2], // s between two cars: the start, the rush
  nearA: 60, // m: bays nearer than this are "left" and "right", the rest "straight on"
  bayLat: [4, 7], // m off the aisle: the two rows beside it
  firstA: 6,
  maxA: 106,
  turn: 2.8, // s into the bay
  turnBlock: 1.6, // s the turning car still holds the aisle up
  patience: 10, // s a held car waits before the driver goes on alone
  blockT: 14, // s a blocker stands in the aisle
  cross: { first: 16, every: [17, 26], warn: 3, time: 5.5, at: 2.5, r: 3.2 },
  points: { good: 100, crooked: 40, blocker: -80, close: -40 },
  medals: { gold: 1600, silver: 1150, bronze: 600 }
};
export const ZONES = ['left', 'straight', 'right'];

/** The free bays split into the marshal's three zones: { left: [...], straight: [...], right: [...] }, nearest first.
 *  bays: js/parking.js lotBays ({ x, z, ux, uz, w, l, occupied }) */
export function marshalZones(bays, frame = MARSHAL.frame) {
  const zones = { left: [], straight: [], right: [] };
  const rx = -frame.dz, rz = frame.dx;
  for (const b of bays) {
    if (b.occupied) continue;
    const a = (b.x - frame.x) * frame.dx + (b.z - frame.z) * frame.dz, lat = (b.x - frame.x) * rx + (b.z - frame.z) * rz;
    if (a < MARSHAL.firstA || a > MARSHAL.maxA || Math.abs(lat) < MARSHAL.bayLat[0] || Math.abs(lat) > MARSHAL.bayLat[1]) continue;
    const z = a >= MARSHAL.nearA ? 'straight' : lat < 0 ? 'left' : 'right';
    zones[z].push({ a, lat, x: b.x, z: b.z, ux: b.ux, uz: b.uz, taken: false, zone: z });
  }
  for (const k of ZONES) zones[k].sort((p, q) => p.a - q.a);
  return zones;
}
export const zoneFree = (z) => z.filter((b) => !b.taken).length;

export function createMarshal(zones, seed = 9) {
  const g = {
    rand: seededRandom(seed), zones, cars: [], ids: 0, t: 0, nextCar: 1.2, done: false, score: 0,
    good: 0, crooked: 0, blockers: 0, closes: 0, last: null, events: [],
    cross: { state: 'idle', t: MARSHAL.cross.first, hit: false, n: 0 }
  };
  return g;
}
export const marshalInterval = (t) => MARSHAL.interval[0] + (MARSHAL.interval[1] - MARSHAL.interval[0]) * clamp(t / MARSHAL.length, 0, 1);
export const crossingOn = (g) => g.cross.state === 'on';

function marshalEvent(g, e) { g.last = { ...e, at: g.t }; g.events.push(g.last); return g.last; }

/** The car the marshal's gesture is for: the first still before the line and in sight without an order, or held */
export function marshalActive(g) {
  let best = null;
  for (const c of g.cars) {
    if (c.phase !== 'approach' || c.a < -MARSHAL.window) continue;
    if (c.order && !c.held) continue;
    if (!best || c.a > best.a) best = c;
  }
  return best;
}

function allot(g, car, zone, quality) {
  const free = g.zones[zone].find((b) => !b.taken);
  car.order = zone;
  car.held = false;
  if (free) { free.taken = true; car.bay = free; car.quality = quality; car.badAngle = quality === 'crooked' ? (g.rand() < 0.5 ? -1 : 1) : 0; return true; }
  // nothing free there: it ends up across the aisle
  car.bay = null; car.quality = 'blocker';
  const list = g.zones[zone];
  car.stopA = list.length ? list[list.length - 1].a : (zone === 'straight' ? MARSHAL.nearA + 8 : MARSHAL.nearA - 16);
  return false;
}

/** A gesture: 'left' | 'straight' | 'right' for the car in hand, 'stop' holds it. Returns the car or null */
export function marshalGesture(g, what) {
  if (g.done) return null;
  if (what === 'stop') {
    // (a car already told where to go can be held too, as long as it is before the line)
    let car = null;
    for (const c of g.cars) if (c.phase === 'approach' && !c.held && c.a >= -MARSHAL.window && (!car || c.a > car.a)) car = c;
    if (!car) return null;
    if (car.bay) { car.bay.taken = false; car.bay = null; }
    car.order = null; car.quality = null; car.held = true; car.wasHeld = true; car.waited = 0;
    marshalEvent(g, { kind: 'hold', car: car.id });
    return car;
  }
  if (!ZONES.includes(what)) return null;
  const car = marshalActive(g);
  if (!car) { marshalEvent(g, { kind: 'nocar' }); return null; }
  // (a car held at the line is never late: it was stopped in time)
  const late = !car.wasHeld && car.a > -MARSHAL.late;
  allot(g, car, what, late ? 'crooked' : 'good');
  marshalEvent(g, { kind: late ? 'late' : car.quality === 'blocker' ? 'full' : 'sent', car: car.id, zone: what });
  return car;
}

/** The driver goes on his own: he picks a bay as he likes (crooked), or stops across the aisle */
function driverGuess(g, car) {
  const zone = ZONES[Math.floor(g.rand() * 3)];
  const wild = g.rand() < 0.45;
  allot(g, car, zone, wild ? 'blocker' : 'crooked');
  if (wild) {
    if (car.bay) { car.bay.taken = false; car.bay = null; }
    car.quality = 'blocker'; car.stopA = 6 + g.rand() * 18;
  }
  marshalEvent(g, { kind: 'guess', car: car.id, zone });
}

function scoreCar(g, car) {
  const P = MARSHAL.points;
  if (car.quality === 'good') { g.good++; g.score += P.good; } else if (car.quality === 'crooked') { g.crooked++; g.score += P.crooked; } else { g.blockers++; g.score += P.blocker; }
  marshalEvent(g, { kind: car.quality, car: car.id });
}

/** The time goes on: the stream of cars, the aisle, the skiers crossing */
export function marshalStep(g, dt) {
  if (g.done || dt <= 0) return g;
  g.t += dt;
  const M = MARSHAL;
  if (g.t >= M.length) {
    // (the cars already on their way to a bay count: the whistle ends the shift, not their parking)
    for (const c of g.cars) if (c.bay && c.phase !== 'parked') { c.phase = 'parked'; scoreCar(g, c); }
    g.done = true;
    return g;
  }
  // a new car
  g.nextCar -= dt;
  if (g.nextCar <= 0) {
    const tail = g.cars.reduce((m, c) => (c.phase === 'approach' ? Math.min(m, c.a) : m), 0);
    if (tail > M.spawnA + M.gapM) {
      g.cars.push({ id: ++g.ids, a: M.spawnA, v: M.cruise, phase: 'approach', order: null, bay: null, quality: null, held: false, wasHeld: false, waited: 0, t: 0, badAngle: 0, stopA: 0, suv: g.rand() < 0.42, paint: Math.floor(g.rand() * 1000) });
      g.nextCar = marshalInterval(g.t);
    } else g.nextCar = 0.3;
  }
  // the skiers crossing at the line
  const X = g.cross, C = M.cross;
  X.t -= dt;
  if (X.t <= 0) {
    if (X.state === 'idle') { X.state = 'warn'; X.t = C.warn; marshalEvent(g, { kind: 'cross-warn' }); }
    else if (X.state === 'warn') { X.state = 'on'; X.t = C.time; X.hit = false; X.n++; }
    else { X.state = 'idle'; X.t = C.every[0] + g.rand() * (C.every[1] - C.every[0]); }
  }
  // the cars, front to back along the aisle (the turning ones still in it for a moment)
  const inAisle = g.cars.filter((c) => c.phase === 'approach' || c.phase === 'aisle' || c.phase === 'blocked' || (c.phase === 'turn' && c.t < M.turnBlock)).sort((p, q) => q.a - p.a);
  for (let i = 0; i < inAisle.length; i++) {
    const c = inAisle[i], lead = inAisle[i - 1];
    if (c.phase === 'turn' || c.phase === 'blocked') continue;
    let target = M.cruise;
    if (lead && lead.a - c.a < M.gapM + 6) target *= clamp((lead.a - c.a - M.gapM) / 6, 0, 1);
    if (c.phase === 'approach' && c.held) {
      target = Math.min(target, clamp((M.holdA - c.a) * 1.2, 0, M.cruise));
      c.waited += dt;
      if (c.waited >= M.patience) { c.held = false; driverGuess(g, c); marshalEvent(g, { kind: 'impatient', car: c.id }); }
    }
    c.v += clamp(target - c.v, -7 * dt, 2.5 * dt);
    c.a += Math.max(0, c.v) * dt;
    // the line
    if (c.phase === 'approach' && c.a >= 0 && !c.held) {
      if (!c.order) driverGuess(g, c);
      c.phase = 'aisle';
    }
    if (X.state === 'on' && !X.hit && c.a > C.at - C.r && c.a < C.at + C.r && c.v > 1) {
      X.hit = true; g.closes++; g.score += M.points.close;
      marshalEvent(g, { kind: 'close', car: c.id });
    }
    if (c.phase === 'aisle') {
      if (c.bay && c.a >= c.bay.a - 3.5) { c.phase = 'turn'; c.t = 0; } else if (!c.bay && c.a >= c.stopA) { c.phase = 'blocked'; c.t = 0; c.v = 0; scoreCar(g, c); }
    }
  }
  for (const c of g.cars) {
    if (c.phase === 'turn') { c.t += dt; if (c.t >= M.turn) { c.phase = 'parked'; c.v = 0; scoreCar(g, c); } } else if (c.phase === 'blocked') { c.t += dt; if (c.t >= M.blockT) { c.phase = 'gone'; marshalEvent(g, { kind: 'cleared', car: c.id }); } }
  }
  g.cars = g.cars.filter((c) => c.phase !== 'gone');
  return g;
}

/** Where a car stands: { x, z, yaw } */
export function marshalCarPose(c, frame = MARSHAL.frame, out = {}) {
  const dx = frame.dx, dz = frame.dz, rx = -dz, rz = dx, base = Math.atan2(dx, dz);
  // (a yaw `angle` to the car's right of the aisle: a turn towards +lat; heading h has its right at h - pi/2)
  const put = (a, lat, angle) => { out.x = frame.x + dx * a + rx * lat; out.z = frame.z + dz * a + rz * lat; out.yaw = base - angle; return out; };
  if (c.phase === 'approach' || c.phase === 'aisle' || !c.bay && c.phase !== 'blocked') return put(c.a, 0, 0);
  if (c.phase === 'blocked') { const s = c.id % 2 ? 1 : -1; return put(c.a, Math.min(1.4, c.t * 1.2) * s, Math.min(0.75, c.t * 0.7) * s); }
  // into the bay: a curve from the aisle (crooked: it stops at an angle, over the line)
  const b = c.bay, side = Math.sign(b.lat), bad = c.quality === 'crooked' ? c.badAngle : 0;
  const endA = b.a + bad * 0.8, endLat = side * (Math.abs(b.lat) - (bad ? 0.9 : 0));
  const k = c.phase === 'parked' ? 1 : clamp(c.t / MARSHAL.turn, 0, 1), s = k * k * (3 - 2 * k), m = 1 - s;
  const a0 = b.a - 3.5, a1 = b.a + 0.5, a2 = endA, lat2 = side * 2.5;
  const a = m * m * m * a0 + 3 * m * m * s * a1 + 3 * m * s * s * a2 + s * s * s * endA;
  const lat = 3 * m * s * s * lat2 + s * s * s * endLat;
  if (k >= 1) return put(a, lat, side * Math.PI / 2 + bad * 0.3);
  const ta = 3 * m * m * (a1 - a0) + 6 * m * s * (a2 - a1) + 3 * s * s * (endA - a2);
  const tl = 6 * m * s * lat2 + 3 * s * s * (endLat - lat2);
  return put(a, lat, Math.atan2(tl, ta) + bad * 0.3 * s);
}

const AISLE_BACK = -24;
export const MARSHAL_MISSION = {
  id: 'parking-marshal',
  title: 'Parking marshal at the Jakobshornbahn',
  intro: 'A bluebird winter morning and half of Davos wants up the Jakobshorn. In your hi-vis vest you direct the Parkplatz Jakobshornbahn: each car rolls up the aisle towards you, and you wave it left, right or straight on (← → ↑, or the buttons) to where the green arrows show free bays. Wave in time and it parks straight; too late and it parks crooked; no gesture and the driver does as he likes, maybe right across the aisle. When skiers cross at your feet, hold the car (↓ / Space) and wave it on after them. Two minutes.',
  mode: 'person',
  season: 'winter',
  time: 'golden',
  features: ['parkingMarshal'],
  scoreMode: true,
  medals: MARSHAL.medals,
  colour: '#f07c1e',
  icon: 'parking',
  finish: 'The lot is full, the first cabin is long gone: the marshal gets a coffee.',
  start: { x: round1(MARSHAL.frame.x + MARSHAL.frame.dx * AISLE_BACK), z: round1(MARSHAL.frame.z + MARSHAL.frame.dz * AISLE_BACK), heading: MARSHAL.heading },
  props: [],
  createState() { return { game: null }; },
  score: (state) => Math.max(0, state.game?.score ?? 0),
  summary(state) {
    const g = state.game;
    return g ? [`${g.good} cars parked well · ${g.crooked} crooked · ${g.blockers} blockers · ${g.closes} close calls`] : [];
  },
  objectives: [
    walkTo({ x: MARSHAL.frame.x, z: MARSHAL.frame.z, r: 2.6 }, 'Take your place in the aisle', 'your place'),
    {
      id: 'marshal',
      title: 'Direct the cars (2 min)',
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'The first cars are turning in …', target: null, hint: null };
        return { done: g.done, progress: g.t / MARSHAL.length, text: `${Math.max(0, g.score)} pts · ${g.good + g.crooked} parked · ${fmtClock(MARSHAL.length - g.t)}`, target: null, hint: null };
      }
    }
  ]
};

export const RESORT_MISSIONS = [TBAR_MISSION, WAX_MISSION, MARSHAL_MISSION];
