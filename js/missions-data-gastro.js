import { BEER, BEER_STOPS, beerStep, createBeerState, seededRandom } from './missions-data-local.js';

// js/missions-data-gastro.js
// Three missions behind the counters of Davos Platz (js/missions-data.js spreads GASTRO_MISSIONS into MISSIONS;
// js/missions-gastro.js has their runtime). Like the other data modules: no three.js and no DOM in here, so that
// tests/missions-gastro.test.mjs drives the games with synthetic frames.
//
//  - shots-ex-bar: the Ex Bar (the beer run's second stop). A flaming shot: a glass of spirit set alight, blown out and
//    downed. Order, light, blow, drink over six rounds; each drink narrows the windows and sways the view. By points.
//  - flaemmli-rot-liechtli: the Rot Liechtli (OSM n599407075, the beer run's first stop). A Flämmli: espresso with
//    sugar, drunk off the sugar; a Williams onto the sugar, flambéed until it caramelises without the flame going out;
//    poured burning into the shot glass, smothered with the palm and downed. Three rounds. By points.
//  - pizza-heaven: Pizza Heaven, the Pizzakurier at Promenade 60, Davos Platz (davos.ch, graubuenden.ch; the address from
//    the Gebäudeadressverzeichnis). Top four pizzas in the order on the ticket, then carry them to four addresses with
//    the beer run's mechanics (js/missions-data-local.js beerStep: park, take from the back of the van, carry to the
//    door); a heat bar falls from the moment the pizzas leave the shop. By points.
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z, south).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);

/** The "walk to the door" step */
export function walkInto(spot, title, label, allowModes = ['person']) {
  return {
    id: 'enter',
    title,
    allowModes,
    check(ctx) {
      const onFoot = ctx.mode === 'person';
      const d = Math.hypot(ctx.x - spot.x, ctx.z - spot.z);
      return { done: onFoot && d < spot.r, progress: null, text: onFoot ? `${fmtDist(d)} to ${label}` : `Get out (F) and walk into ${label}`, target: { ...spot, style: 'plain' }, hint: onFoot ? null : 'F: get out' };
    }
  };
}

// =====================================================================================================================
// 1. Flaming shots in the Ex Bar
// =====================================================================================================================
const EX = BEER_STOPS.find((s) => s.id === 'exbar');
export const EX_BAR = { door: { ...EX.door, r: 2.4 }, start: { x: -572.0, z: -139.6 } };
export const SHOTS = {
  rounds: 6,
  strikes: 3, // this many mishaps and the barkeeper calls time
  pour: 0.7, // s the barkeeper pours
  pause: 1.15, // s between two rounds
  sweep: 1.3, // s of the lighter's swing across the bar, one way
  rise: 0.24, // of the flame's life a second (±15 %, a round's own)
  coolRate: 0.42, // of the glass's cooling a second
  // the windows (0-1 on the gauge), at no drink yet
  zones: { light: [0.38, 0.62], burn: [0.55, 0.72], cool: [0.45, 0.7] },
  lightTries: 3, // the lighter's misses until the fingers are singed
  narrow: 0.07, // a window loses this share of its width with each drink …
  narrowMin: 0.55, // … down to this
  wobble: 0.012, // how far the gauge's needle strays, a drink
  sway: { roll: 0.03, pos: 0.006, look: 0.012 }, // the view with each drink (rad, m, m)
  points: { light: 50, flame: 100, drink: 50, round: 40, allRounds: 150, near: 0.25, lightMiss: -10, lip: -15, strike: -40 }
};
export const SHOTS_STEPS = {
  order: { label: 'At the bar', button: 'Order a shot' },
  pour: { label: 'Pouring …', button: null },
  light: { label: 'Light it: bring the lighter over the glass', button: 'Light it' },
  burn: { label: 'The flame: blow it out in the green', button: 'Blow it out' },
  cool: { label: 'The glass: down it when the rim is warm, not hot', button: 'Down it' },
  pause: { label: 'Next round …', button: null }
};

export function createShots(seed = 11) {
  const rand = seededRandom(seed);
  return {
    t: 0, round: 1, step: 'order', stepT: 0, level: 0, cool: 0, sweepT: 0, rise: SHOTS.rise * (0.85 + rand() * 0.3), rand,
    tries: 0, drinks: 0, strikes: 0, score: 0, perfect: 0, roundPts: 0, log: [], last: null, seq: 0, done: false, cutOff: false
  };
}

/** A window after `drinks` drinks: { lo, hi } round its middle */
export function shotsZone(base, drinks) {
  const f = Math.max(SHOTS.narrowMin, 1 - SHOTS.narrow * drinks);
  const c = (base[0] + base[1]) / 2, h = ((base[1] - base[0]) / 2) * f;
  return { lo: c - h, hi: c + h };
}
/** The needle's stray at time t after `drinks` drinks */
export const shotsWobble = (t, drinks) => SHOTS.wobble * drinks * (Math.sin(t * 5.3) + 0.6 * Math.sin(t * 8.9 + 1));
/** What the view does at time t after `drinks` drinks: { roll (rad), x, y (m), lookX, lookY (m) } */
export function shotsSway(t, drinks) {
  const S = SHOTS.sway, d = drinks;
  return {
    roll: S.roll * d * (Math.sin(t * 0.9) + 0.45 * Math.sin(t * 2.3 + 0.7)),
    x: S.pos * d * Math.sin(t * 0.7 + 1.1), y: S.pos * d * 0.6 * Math.sin(t * 1.3),
    lookX: S.look * d * Math.sin(t * 0.6), lookY: S.look * d * 0.5 * Math.sin(t * 1.1 + 0.4)
  };
}
const triangle = (t, period) => { const p = (t / period) % 2; return p < 1 ? p : 2 - p; };

/** What the gauge shows now: { label, button, value (0-1, the needle as judged; null without a gauge), lo, hi } */
export function shotsGauge(g) {
  const info = SHOTS_STEPS[g.step];
  let base = null, v = 0;
  if (g.step === 'light') { base = SHOTS.zones.light; v = triangle(g.sweepT, SHOTS.sweep); }
  else if (g.step === 'burn') { base = SHOTS.zones.burn; v = g.level; }
  else if (g.step === 'cool') { base = SHOTS.zones.cool; v = g.cool; }
  if (!base) return { ...info, value: null, lo: 0, hi: 0 };
  const z = shotsZone(base, g.drinks);
  return { ...info, value: clamp(v + shotsWobble(g.t, g.drinks), 0, 1), lo: z.lo, hi: z.hi };
}

const say = (g, text, points, good) => { g.seq++; g.last = { text, points: Math.round(points), good, seq: g.seq }; };
const add = (g, pts) => { g.score += pts; g.roundPts += pts; };
function toStep(g, step) { g.step = step; g.stepT = 0; }
function endRound(g, drank) {
  g.log.push({ round: g.round, points: Math.round(g.roundPts), drank });
  toStep(g, 'pause');
}
function strike(g, text) {
  g.strikes++;
  add(g, SHOTS.points.strike);
  say(g, text, SHOTS.points.strike, false);
  endRound(g, false);
}
function drink(g) {
  g.drinks++;
  add(g, SHOTS.points.round);
  endRound(g, true);
}
/** Inside the window: its share of the full points (half at the edge, all in the middle), or null outside */
function hitShare(v, z) {
  if (v < z.lo || v > z.hi) return null;
  const c = (z.lo + z.hi) / 2, h = (z.hi - z.lo) / 2;
  return 0.5 + 0.5 * (1 - Math.abs(v - c) / h);
}

/** The time goes on: the pouring, the lighter's swing, the flame and the cooling; the pause into the next round */
export function shotsStep(g, dt) {
  if (g.done || dt <= 0) return g;
  g.t += dt; g.stepT += dt;
  const F = SHOTS;
  if (g.step === 'pour') { if (g.stepT >= F.pour) { g.sweepT = 0; toStep(g, 'light'); } }
  else if (g.step === 'light') g.sweepT += dt;
  else if (g.step === 'burn') {
    g.level += g.rise * dt;
    if (g.level >= 1) strike(g, 'Too long: the glass cracks!');
  } else if (g.step === 'cool') {
    g.cool += F.coolRate * dt;
    if (g.cool >= 1) { say(g, 'Stone cold: a sad sip', 0, false); drink(g); }
  } else if (g.step === 'pause' && g.stepT >= F.pause) {
    if (g.strikes >= F.strikes) { g.cutOff = true; g.done = true; }
    else if (g.round >= F.rounds) {
      if (g.drinks >= F.rounds) { g.score += F.points.allRounds; say(g, `All ${F.rounds} down!`, F.points.allRounds, true); }
      g.done = true;
    } else {
      g.round++; g.level = 0; g.cool = 0; g.tries = 0; g.roundPts = 0;
      g.rise = F.rise * (0.85 + g.rand() * 0.3);
      toStep(g, 'order');
    }
  }
  return g;
}

/** The one button: orders, lights, blows, drinks, by the step. Returns what the press did ('order' | 'light' | 'miss' |
 *  'blow' | 'drink'), null when it does nothing now */
export function shotsAction(g) {
  if (g.done) return null;
  const F = SHOTS, P = F.points;
  const gauge = shotsGauge(g);
  if (g.step === 'order') { toStep(g, 'pour'); return 'order'; }
  if (g.step === 'light') {
    const share = hitShare(gauge.value, gauge);
    if (share === null) {
      g.tries++;
      if (g.tries >= F.lightTries) { strike(g, 'Ouch: singed fingers!'); return 'miss'; }
      add(g, P.lightMiss);
      say(g, 'Missed the glass', P.lightMiss, false);
      return 'miss';
    }
    const pts = P.light * share;
    add(g, pts);
    if (share > 0.85) g.perfect++;
    say(g, share > 0.85 ? 'It catches at once!' : 'Alight', pts, true);
    g.level = 0;
    toStep(g, 'burn');
    return 'light';
  }
  if (g.step === 'burn') {
    const share = hitShare(gauge.value, gauge);
    let pts;
    if (share !== null) {
      pts = P.flame * share;
      if (share > 0.85) g.perfect++;
      say(g, share > 0.85 ? 'Perfect flame!' : 'Nice flame', pts, true);
    } else if (gauge.value < gauge.lo) {
      pts = gauge.value < 0.3 ? 0 : P.flame * P.near;
      say(g, 'Too early: it never got warm', pts, false);
    } else {
      pts = P.flame * P.near;
      say(g, 'Late: that rim is hot', pts, false);
    }
    add(g, pts);
    g.cool = 0;
    toStep(g, 'cool');
    return 'blow';
  }
  if (g.step === 'cool') {
    const share = hitShare(gauge.value, gauge);
    if (share !== null) {
      const pts = P.drink * share;
      add(g, pts);
      if (share > 0.85) g.perfect++;
      say(g, share > 0.85 ? 'Down in one. Hopp!' : 'Down it goes', pts, true);
    } else if (gauge.value < gauge.lo) {
      add(g, P.lip);
      say(g, 'Hot! The lip remembers that', P.lip, false);
    } else {
      const pts = P.drink * P.near;
      add(g, pts);
      say(g, 'Lukewarm by now', pts, false);
    }
    drink(g);
    return 'drink';
  }
  return null;
}
export const shotsScore = (g) => (g ? Math.max(0, Math.round(g.score)) : 0);

export const SHOTS_MISSION = {
  id: 'shots-ex-bar',
  title: 'Flaming shots in the Ex Bar',
  intro: 'Late night in the Ex Bar in Davos Platz, and the bar does what its name says: ex, bottoms up. A flaming shot is set alight, blown out and downed in one. Walk in and take your place at the bar, then six rounds with one button (Space, Enter or a tap): order, light it when the lighter is over the glass, blow it out while the flame is in the green, down it when the rim has cooled. Every shot narrows the windows and sways the room. Three mishaps and the barkeeper calls time. You are walking home tonight, by the way.',
  mode: 'person',
  season: null,
  time: 'midnight',
  features: ['shots'],
  scoreMode: true,
  // (calibrated on the bots in tests/missions-gastro.test.mjs: a steady hand gold, a fair one silver, a shaky one bronze)
  medals: { gold: 1150, silver: 900, bronze: 500 },
  colour: '#2f6fd6',
  icon: 'flame',
  finish: 'Last orders at the Ex Bar. Take the Rufbus home: nobody is driving tonight.',
  interior: { door: EX_BAR.door },
  start: { ...EX_BAR.start, heading: Math.atan2(EX_BAR.door.x - EX_BAR.start.x, EX_BAR.door.z - EX_BAR.start.z) },
  pin: { x: EX_BAR.door.x, z: EX_BAR.door.z },
  props: [],
  createState() { return { game: null, inside: false }; },
  score: (state) => shotsScore(state.game),
  summary(state) {
    const g = state.game;
    if (!g) return [];
    const lines = [`${g.drinks} of ${SHOTS.rounds} shots down · ${g.perfect} perfect moments · ${g.strikes} ${g.strikes === 1 ? 'mishap' : 'mishaps'}`];
    if (g.log.length) lines.push(g.log.map((l) => (l.drank ? `${l.points}` : 'x')).join(' · '));
    if (g.cutOff) lines.push('The barkeeper called time');
    return lines;
  },
  objectives: [
    walkInto(EX_BAR.door, 'Go into the Ex Bar', 'the Ex Bar'),
    {
      id: 'shots',
      title: `${SHOTS.rounds} rounds of flaming shots`,
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'Finding a place at the bar …', target: null, hint: null };
        return { done: g.done, progress: g.log.length / SHOTS.rounds, text: `Round ${g.round} of ${SHOTS.rounds} · ${shotsScore(g)} pts · ${g.strikes}/${SHOTS.strikes} mishaps`, target: null, hint: 'Space or the button' };
      }
    }
  ]
};

// =====================================================================================================================
// 2. Flämmli in the Rot Liechtli
// =====================================================================================================================
// A Flämmli the Bündner way: an espresso with a good heap of sugar, drunk off so that the sugar stays in the cup; a
// Williams poured onto the sugar and set alight, the cup swirled until the sugar caramelises; then the burning Williams
// into the shot glass, the flame smothered with the palm (the glass sticks to it), and down it goes. The challenge: the
// flame must not go out while the caramel comes. Hold steps (sugar, sip, pour) fill while the button is held and are
// judged when it is let go; tap steps act on the press.
const ROT = BEER_STOPS.find((s) => s.id === 'rotliechtli');
export const ROT_LIECHTLI = { door: { ...ROT.door, r: 2.4 }, start: { x: -573.4, z: 288.2 } };
export const FLAEMMLI = {
  rounds: 3,
  strikes: 3, // this many mishaps and the landlord calls time
  serve: 0.9, // s the landlord puts down the espresso, the sugar and the Williams
  pause: 1.4, // s between two rounds
  // the hold steps: how fast the gauge climbs while held (a second) and its window
  hold: {
    sugar: { rate: 0.36, zone: [0.5, 0.72] }, // a heap of sugar into the espresso
    sip: { rate: 0.4, zone: [0.74, 0.9] }, // the espresso drunk off the sugar: stop before the sugar comes
    williams: { rate: 0.38, zone: [0.5, 0.7] } // the Williams onto the sugar
  },
  sweep: 1.3, // s of the lighter's swing over the cup, one way
  lightZone: [0.38, 0.62],
  lightTries: 3,
  flame: {
    start: 0.66, // where the flame stands when it catches
    zone: [0.42, 0.8], // the green: a steady flame that caramelises
    decay: 0.12, // of the flame a second it sinks by itself …
    wet: 2.2, // … more with espresso left in the cup (× the share left) …
    dry: 1.1, // … and more as the Williams burns off (× the share gone)
    swirl: 0.17, // one swirl of the cup feeds it this much
    calm: 0.62, // where a flame that sloshed over settles
    fuel: [5, 16], // s the Williams burns: the first plus the second × the gauge's pour
    gust: { every: [2.4, 4.4], drop: 0.24, len: 0.4 }, // the door opens: a draught every few seconds
    relights: 1, // the flame may go out this often and be lit again
    pourMin: 0.22 // a weaker flame dies in the pour
  },
  caramel: { rate: 0.12, outside: 0.4 }, // a second in the green (≈ 8 s), the share of it outside the green
  smother: { rate: 0.42, zone: [0.36, 0.64] }, // the shot glass heats while it burns
  narrow: 0.1, narrowMin: 0.55, wobble: 0.014, // the windows and the needle, a drink
  sway: { roll: 0.045, pos: 0.009, look: 0.018 },
  points: { sugar: 30, sip: 30, williams: 30, light: 30, flambe: 160, pour: 40, smother: 60, round: 40, allRounds: 150, near: 0.3, spill: -10, lightMiss: -10, wild: -20, relight: -30, hot: -15, strike: -40 }
};
export const FLAEMMLI_STEPS = {
  order: { label: 'At the bar', button: 'Order a Flämmli' },
  serve: { label: 'Espresso, sugar and Williams are coming …', button: null },
  sugar: { label: 'Sugar into the espresso: hold, let go in the green', button: 'Hold: sugar', hold: true },
  sip: { label: 'Drink the espresso, leave the sugar: hold, let go in the green', button: 'Hold: sip', hold: true },
  williams: { label: 'Williams onto the sugar: hold, let go in the green', button: 'Hold: pour', hold: true },
  light: { label: 'Light it: bring the lighter over the cup', button: 'Light it' },
  flambe: { label: 'Keep it burning: swirl when the flame sinks, not too wild', button: 'Swirl' },
  ready: { label: 'Golden caramel: pour it into the shot glass, still burning!', button: 'Pour it over' },
  smother: { label: 'Smother it with your palm: when the glass is warm, not hot', button: 'Hand on the glass' },
  drink: { label: 'Hopp: down it!', button: 'Down it' },
  pause: { label: 'Next round …', button: null }
};

export function createFlaemmli(seed = 11) {
  const rand = seededRandom(seed);
  return {
    t: 0, round: 1, step: 'order', stepT: 0, rand, holding: false, value: 0, sweepT: 0, tries: 0,
    // the round's cup: sugar, sip and pour as judged on their gauges; the flambé
    sugar: 0, sip: 0, williams: 0, flame: 0, fuel: 1, fuelS: 10, caramel: 0, lit: false, relit: 0, gustIn: 3, gustT: 0, greenT: 0, burnT: 0, heat: 0,
    drinks: 0, strikes: 0, score: 0, perfect: 0, roundPts: 0, log: [], last: null, seq: 0, done: false, cutOff: false
  };
}

/** A window after `drinks` drinks: { lo, hi } round its middle */
export function flaemmliZone(base, drinks) {
  const f = Math.max(FLAEMMLI.narrowMin, 1 - FLAEMMLI.narrow * drinks);
  const c = (base[0] + base[1]) / 2, h = ((base[1] - base[0]) / 2) * f;
  return { lo: c - h, hi: c + h };
}
/** The needle's stray at time t after `drinks` drinks */
export const flaemmliWobble = (t, drinks) => FLAEMMLI.wobble * drinks * (Math.sin(t * 5.3) + 0.6 * Math.sin(t * 8.9 + 1));
/** What the view does at time t after `drinks` drinks: { roll (rad), x, y (m), lookX, lookY (m) } */
export function flaemmliSway(t, drinks) {
  const S = FLAEMMLI.sway, d = drinks;
  return {
    roll: S.roll * d * (Math.sin(t * 0.9) + 0.45 * Math.sin(t * 2.3 + 0.7)),
    x: S.pos * d * Math.sin(t * 0.7 + 1.1), y: S.pos * d * 0.6 * Math.sin(t * 1.3),
    lookX: S.look * d * Math.sin(t * 0.6), lookY: S.look * d * 0.5 * Math.sin(t * 1.1 + 0.4)
  };
}

/** The flame's window: the green is not narrowed by the drinks (the swirling is hard enough) */
const flameZone = () => ({ lo: FLAEMMLI.flame.zone[0], hi: FLAEMMLI.flame.zone[1] });

/** What the HUD shows now: { label, button, hold, value (0-1, as judged; null without a gauge), lo, hi, caramel (0-1,
 *  null outside the flambé) } */
export function flaemmliGauge(g) {
  const F = FLAEMMLI, info = FLAEMMLI_STEPS[g.step];
  const out = { ...info, hold: !!info.hold, value: null, lo: 0, hi: 0, caramel: null };
  if (F.hold[g.step]) {
    const z = flaemmliZone(F.hold[g.step].zone, g.drinks);
    return { ...out, value: clamp(g.value + (g.holding ? flaemmliWobble(g.t, g.drinks) : 0), 0, 1), lo: z.lo, hi: z.hi };
  }
  if (g.step === 'light') {
    const z = flaemmliZone(F.lightZone, g.drinks);
    return { ...out, value: clamp(triangle(g.sweepT, F.sweep) + flaemmliWobble(g.t, g.drinks), 0, 1), lo: z.lo, hi: z.hi };
  }
  if (g.step === 'flambe' || g.step === 'ready') return { ...out, value: clamp(g.flame, 0, 1), ...flameZone(), caramel: clamp(g.caramel, 0, 1) };
  if (g.step === 'smother') {
    const z = flaemmliZone(F.smother.zone, g.drinks);
    return { ...out, value: clamp(g.heat + flaemmliWobble(g.t, g.drinks), 0, 1), lo: z.lo, hi: z.hi };
  }
  return out;
}

const fSay = (g, text, points, good) => { g.seq++; g.last = { text, points: Math.round(points), good, seq: g.seq }; };
const fAdd = (g, pts) => { g.score += pts; g.roundPts += pts; };
function fTo(g, step) { g.step = step; g.stepT = 0; g.value = 0; g.holding = false; }
function fEndRound(g, drank) {
  g.log.push({ round: g.round, points: Math.round(g.roundPts), drank });
  fTo(g, 'pause');
}
function fStrike(g, text) {
  g.strikes++;
  fAdd(g, FLAEMMLI.points.strike);
  fSay(g, text, FLAEMMLI.points.strike, false);
  fEndRound(g, false);
}
/** The flambé starts: the flame catches; the Williams's burn and the espresso left in the cup set its life */
function startFlambe(g) {
  const F = FLAEMMLI.flame;
  g.flame = F.start;
  if (!g.lit) { g.lit = true; g.fuel = 1; g.fuelS = F.fuel[0] + F.fuel[1] * g.williams; g.caramel = 0; g.greenT = 0; g.burnT = 0; }
  g.gustIn = F.gust.every[0] + g.rand() * (F.gust.every[1] - F.gust.every[0]);
  g.gustT = 0;
  fTo(g, 'flambe');
}
/** The flame is out: lit again once, or the round is lost; out after the caramel: a cold Flämmli */
function flameOut(g, why) {
  const F = FLAEMMLI;
  if (g.step === 'ready') {
    fSay(g, `${why}: a cold Flämmli`, 0, false);
    fTo(g, 'drink');
    return;
  }
  if (g.relit < F.flame.relights && g.fuel > 0.15) {
    g.relit++;
    fAdd(g, F.points.relight);
    fSay(g, `${why}: light it again!`, F.points.relight, false);
    g.tries = 0; g.sweepT = 0;
    fTo(g, 'light');
    return;
  }
  fStrike(g, `${why}: it won't burn again`);
}
/** The sugar's share that makes it to the caramel (some is swallowed with a sip too long) */
export const flaemmliSugar = (g) => {
  const hi = FLAEMMLI.hold.sip.zone[1];
  return g.sugar * (g.sip > hi ? clamp(1 - (g.sip - hi) * 5, 0.25, 1) : 1);
};

/** The time goes on: the serving, the held gauges, the lighter's swing, the flame, the caramel and the shot glass */
export function flaemmliStep(g, dt) {
  if (g.done || dt <= 0) return g;
  g.t += dt; g.stepT += dt;
  const F = FLAEMMLI;
  if (g.step === 'serve') { if (g.stepT >= F.serve) fTo(g, 'sugar'); }
  else if (F.hold[g.step]) {
    if (g.holding) {
      g.value += F.hold[g.step].rate * dt;
      if (g.value >= 1) { g.value = 1; flaemmliRelease(g); }
    }
  } else if (g.step === 'light') g.sweepT += dt;
  else if (g.step === 'flambe' || g.step === 'ready') {
    const L = F.flame, z = flameZone();
    const wet = clamp(F.hold.sip.zone[0] - g.sip, 0, 1);
    g.fuel -= dt / g.fuelS;
    g.flame -= L.decay * (1 + L.wet * wet + L.dry * (1 - clamp(g.fuel, 0, 1))) * dt;
    g.gustIn -= dt;
    if (g.gustIn <= 0) {
      g.gustT = L.gust.len;
      g.gustIn = L.gust.every[0] + g.rand() * (L.gust.every[1] - L.gust.every[0]);
      fSay(g, 'A draught from the door!', 0, false);
    }
    if (g.gustT > 0) { const k = Math.min(dt, g.gustT); g.gustT -= k; g.flame -= (L.gust.drop / L.gust.len) * k; }
    const green = g.flame >= z.lo && g.flame <= z.hi;
    if (g.step === 'flambe') {
      g.burnT += dt;
      if (green) g.greenT += dt;
      if (g.flame > 0) g.caramel += F.caramel.rate * (green ? 1 : F.caramel.outside) * clamp(0.45 + flaemmliSugar(g), 0.6, 1.25) * dt;
      if (g.caramel >= 1) { g.caramel = 1; g.step = 'ready'; g.stepT = 0; fSay(g, 'Golden caramel: pour it over!', 0, true); }
    }
    if (g.fuel <= 0) flameOut(g, 'The Williams has burnt off');
    else if (g.flame <= 0) { g.flame = 0; flameOut(g, 'Out'); }
  } else if (g.step === 'smother') {
    g.heat += F.smother.rate * dt;
    if (g.heat >= 1) { g.heat = 1; fStrike(g, 'Too long: the shot glass cracks!'); }
  } else if (g.step === 'pause' && g.stepT >= F.pause) {
    if (g.strikes >= F.strikes) { g.cutOff = true; g.done = true; }
    else if (g.round >= F.rounds) {
      if (g.drinks >= F.rounds) { g.score += F.points.allRounds; fSay(g, `All ${F.rounds} down!`, F.points.allRounds, true); }
      g.done = true;
    } else {
      g.round++;
      Object.assign(g, { sugar: 0, sip: 0, williams: 0, flame: 0, fuel: 1, caramel: 0, lit: false, relit: 0, greenT: 0, burnT: 0, heat: 0, tries: 0, sweepT: 0, roundPts: 0 });
      fTo(g, 'order');
    }
  }
  return g;
}

/** Inside the window: its share of the full points (half at the edge, all in the middle), or null outside */
function fShare(v, z) {
  if (v < z.lo || v > z.hi) return null;
  const c = (z.lo + z.hi) / 2, h = (z.hi - z.lo) / 2;
  return 0.5 + 0.5 * (1 - Math.abs(v - c) / h);
}
const HOLD_SAY = {
  sugar: { good: 'A proper heap', perfect: 'Perfect heap of sugar!', low: 'A bit stingy with the sugar', high: 'A sugar mountain' },
  sip: { good: 'Espresso down, sugar stays', perfect: 'Just the sugar left!', low: 'Coffee left in the cup: the flame will struggle', high: 'Swallowed half the sugar' },
  williams: { good: 'A good splash', perfect: 'Exactly two centilitres!', low: 'Not much Williams: it burns off fast', high: 'Generous: it will burn wild' }
};

/** The button goes down: orders, starts a held gauge, lights, swirls, pours, smothers or downs it, by the step.
 *  Returns what it did ('order' | 'hold' | 'light' | 'miss' | 'swirl' | 'wild' | 'pour' | 'smother' | 'drink'), null
 *  when it does nothing now */
export function flaemmliPress(g) {
  if (g.done) return null;
  const F = FLAEMMLI, P = F.points;
  if (g.step === 'order') { fTo(g, 'serve'); return 'order'; }
  if (F.hold[g.step]) { if (g.holding) return null; g.holding = true; g.value = 0; return 'hold'; }
  if (g.step === 'light') {
    const gauge = flaemmliGauge(g), share = fShare(gauge.value, gauge);
    if (share === null) {
      g.tries++;
      if (g.tries >= F.lightTries) { fStrike(g, 'Ouch: singed fingers!'); return 'miss'; }
      fAdd(g, P.lightMiss);
      fSay(g, 'Missed the cup', P.lightMiss, false);
      return 'miss';
    }
    const relight = g.lit;
    const pts = relight ? 0 : P.light * share;
    fAdd(g, pts);
    if (!relight && share > 0.85) g.perfect++;
    fSay(g, relight ? 'Burning again' : share > 0.85 ? 'It catches at once!' : 'Alight', pts, true);
    startFlambe(g);
    return 'light';
  }
  if (g.step === 'flambe') {
    g.flame += F.flame.swirl;
    if (g.flame > 1) {
      fAdd(g, P.wild);
      fSay(g, 'Too wild: it sloshes over your fingers!', P.wild, false);
      g.flame = F.flame.calm;
      return 'wild';
    }
    return 'swirl';
  }
  if (g.step === 'ready') {
    // the flambé's points: its share of time in the green
    const q = g.burnT > 0 ? clamp(g.greenT / g.burnT, 0, 1) : 0;
    const flambe = P.flambe * q;
    if (q > 0.85) g.perfect++;
    if (g.flame < F.flame.pourMin) {
      fAdd(g, flambe);
      fSay(g, 'It dies in the pour: a cold Flämmli', flambe, false);
      fTo(g, 'drink');
      return 'pour';
    }
    const pts = flambe + P.pour * clamp(g.flame / 0.6, 0, 1);
    fAdd(g, pts);
    fSay(g, q > 0.85 ? 'Lovely caramel, still burning!' : 'Into the shot glass, still burning', pts, true);
    g.heat = 0;
    fTo(g, 'smother');
    return 'pour';
  }
  if (g.step === 'smother') {
    const gauge = flaemmliGauge(g), share = fShare(gauge.value, gauge);
    if (share !== null) {
      const pts = P.smother * share;
      fAdd(g, pts);
      if (share > 0.85) g.perfect++;
      fSay(g, share > 0.85 ? 'Plop! The glass sticks to your palm' : 'Out, and the glass sticks', pts, true);
    } else if (gauge.value < gauge.lo) {
      const pts = P.smother * P.near;
      fAdd(g, pts);
      fSay(g, 'Too soon: the glass won\'t stick', pts, false);
    } else {
      fAdd(g, P.hot);
      fSay(g, 'Ouch, hot glass!', P.hot, false);
    }
    fTo(g, 'drink');
    return 'smother';
  }
  if (g.step === 'drink') {
    g.drinks++;
    fAdd(g, P.round);
    fSay(g, 'Hopp! Down it goes', P.round, true);
    fEndRound(g, true);
    return 'drink';
  }
  return null;
}

/** The button comes up: judges a held gauge (sugar, sip, pour). Returns the step it judged, null otherwise */
export function flaemmliRelease(g) {
  const F = FLAEMMLI, P = F.points, step = g.step;
  if (g.done || !F.hold[step] || !g.holding) return null;
  const gauge = flaemmliGauge(g), v = gauge.value, share = fShare(v, gauge), s = HOLD_SAY[step];
  g.holding = false;
  g[step] = g.value;
  if (share !== null) {
    const pts = P[step] * share;
    fAdd(g, pts);
    if (share > 0.85) g.perfect++;
    fSay(g, share > 0.85 ? s.perfect : s.good, pts, true);
  } else if (v < gauge.lo) {
    const pts = v < 0.15 ? 0 : P[step] * P.near;
    fAdd(g, pts);
    fSay(g, s.low, pts, false);
  } else {
    const pts = v >= 1 ? P.spill : P[step] * P.near;
    fAdd(g, pts);
    fSay(g, v >= 1 ? `${s.high}: it spills!` : s.high, pts, false);
  }
  const next = { sugar: 'sip', sip: 'williams', williams: 'light' }[step];
  if (next === 'light') { g.tries = 0; g.sweepT = 0; }
  fTo(g, next);
  return step;
}
export const flaemmliScore = (g) => (g ? Math.max(0, Math.round(g.score)) : 0);

export const FLAEMMLI_MISSION = {
  id: 'flaemmli-rot-liechtli',
  title: 'Flämmli in the Rot Liechtli',
  intro: 'Evening in the Rot Liechtli, the little pub in Davos Platz, and time for a real Flämmli. Walk in and take your place at the bar. Then three rounds, all with one button (Space, Enter or a tap; hold it where it says hold): heap sugar into the espresso, drink the espresso off but leave the sugar in the cup, pour a Williams onto the sugar and light it. Now swirl the cup to keep it burning while the sugar caramelises: the flame sinks by itself and every draught from the door knocks it down, but swirl too hard and it sloshes over your fingers. Once the caramel is golden, pour it into the shot glass still burning, smother the flame with your palm before the glass gets hot, and down it. Every Flämmli narrows the windows and sways the room. Three mishaps and the landlord calls time.',
  mode: 'person',
  season: null,
  time: 'evening',
  features: ['flaemmli'],
  scoreMode: true,
  // (calibrated on the bots in tests/missions-gastro.test.mjs: a steady hand gold, a fair one silver, a shaky one bronze)
  medals: { gold: 1250, silver: 950, bronze: 550 },
  colour: '#d7263d',
  icon: 'flaemmli',
  finish: 'The red lamp turns gently and the caramel is still on your lips. Take the Rufbus home: nobody is driving tonight.',
  interior: { door: ROT_LIECHTLI.door },
  start: { ...ROT_LIECHTLI.start, heading: Math.atan2(ROT_LIECHTLI.door.x - ROT_LIECHTLI.start.x, ROT_LIECHTLI.door.z - ROT_LIECHTLI.start.z) },
  pin: { x: ROT_LIECHTLI.door.x, z: ROT_LIECHTLI.door.z },
  props: [],
  createState() { return { game: null, inside: false }; },
  score: (state) => flaemmliScore(state.game),
  summary(state) {
    const g = state.game;
    if (!g) return [];
    const lines = [`${g.drinks} of ${FLAEMMLI.rounds} Flämmli down · ${g.perfect} perfect moments · ${g.strikes} ${g.strikes === 1 ? 'mishap' : 'mishaps'}`];
    if (g.log.length) lines.push(g.log.map((l) => (l.drank ? `${l.points}` : 'x')).join(' · '));
    if (g.cutOff) lines.push('The landlord called time');
    return lines;
  },
  objectives: [
    walkInto(ROT_LIECHTLI.door, 'Go into the Rot Liechtli', 'the Rot Liechtli'),
    {
      id: 'flaemmli',
      title: `${FLAEMMLI.rounds} rounds of Flämmli`,
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'Finding a place at the bar …', target: null, hint: null };
        return { done: g.done, progress: g.log.length / FLAEMMLI.rounds, text: `Round ${g.round} of ${FLAEMMLI.rounds} · ${flaemmliScore(g)} pts · ${g.strikes}/${FLAEMMLI.strikes} mishaps`, target: null, hint: 'Space or the button' };
      }
    }
  ]
};

// =====================================================================================================================
// 3. Pizza Heaven
// =====================================================================================================================
// Promenade 60, the wall facing the Promenade (building w123380413); the van a few metres up the road. The addresses:
// the Gebäudeadressverzeichnis's points, each door 1 m out of its wall towards the nearest road (checked on the
// footprints of js/davos-geodata.js: the way from the road to the door is free).
export const PIZZA_HEAVEN = { name: 'Pizza Heaven', door: { x: -559.1, z: -173.4, r: 2.4 }, van: { x: -561.3, z: -180.4, heading: -0.263 } };
export const PIZZA_STOPS = [
  { id: 'eisstadion', name: 'the Eisstadion, Talstrasse 41', short: 'Eisstadion', door: { x: -195.5, z: -252.3 }, road: { x: -183.4, z: -267.2 } },
  { id: 'kongress', name: 'the Kongresszentrum, Talstrasse 49a', short: 'Kongresszentrum', door: { x: 148.2, z: -505.5 }, road: { x: 154.0, z: -505.3 } },
  { id: 'seehof', name: 'the Hotel Seehof, Promenade 159', short: 'Hotel Seehof', door: { x: 707.1, z: -1505.6 }, road: { x: 717.5, z: -1497.0 } },
  { id: 'museumstrasse', name: 'Museumstrasse 2, Davos Dorf', short: 'Museumstrasse 2', door: { x: 1012.2, z: -1362.1 }, road: { x: 1010.9, z: -1363.0 } }
];
export const TOPPINGS = [
  { id: 'tomato', name: 'Tomato', colour: '#c8301e' },
  { id: 'mozzarella', name: 'Mozzarella', colour: '#f7efd2' },
  { id: 'basil', name: 'Basil', colour: '#2f8a3a' },
  { id: 'ham', name: 'Ham', colour: '#e79a9a' },
  { id: 'mushroom', name: 'Mushrooms', colour: '#b9987a' },
  { id: 'salami', name: 'Salami', colour: '#9c2a24' },
  { id: 'pineapple', name: 'Pineapple', colour: '#f2cf3f' },
  { id: 'buendner', name: 'Bündnerfleisch', colour: '#5a1f22' }
];
// (an order a stop, in delivery order)
export const PIZZA_ORDERS = [
  { stop: 'eisstadion', name: 'Margherita', tops: ['tomato', 'mozzarella', 'basil'] },
  { stop: 'kongress', name: 'Prosciutto e Funghi', tops: ['tomato', 'mozzarella', 'ham', 'mushroom'] },
  { stop: 'seehof', name: 'Hawaii', tops: ['tomato', 'mozzarella', 'ham', 'pineapple'] },
  { stop: 'museumstrasse', name: 'Davoser', tops: ['tomato', 'mozzarella', 'buendner', 'mushroom', 'salami'] }
];
export const PIZZA = {
  next: 0.55, // s the finished pizza takes to the oven
  parTop: 0.9, // s a topping: at this pace a pizza earns its whole speed bonus, at double it none
  points: { pizza: 100, speed: 60, wrong: -25, min: 10, delivery: 50, heat: 200, hot: 25 },
  heatSeconds: 360, // the bar runs out in this time
  hotAt: 0.7 // from this heat: still piping hot, a tip
};

export const createPizzaShop = () => ({ order: 0, picked: 0, mistakes: 0, t: 0, wait: 0, results: [], score: 0, last: null, seq: 0, done: false });

/** The points of a finished pizza: `t` s for its `n` toppings with `mistakes` wrong picks */
export function pizzaPoints(n, t, mistakes) {
  const P = PIZZA.points, par = PIZZA.parTop * n;
  const speed = P.speed * clamp(2 - t / par, 0, 1);
  return Math.max(P.min, Math.round(P.pizza + speed + P.wrong * mistakes));
}
export function pizzaShopStep(s, dt) {
  if (s.done || dt <= 0) return s;
  if (s.wait > 0) {
    s.wait -= dt;
    if (s.wait <= 0) {
      s.wait = 0; s.order++; s.picked = 0; s.mistakes = 0; s.t = 0;
      if (s.order >= PIZZA_ORDERS.length) s.done = true;
    }
    return s;
  }
  s.t += dt;
  return s;
}
/** The player picks a topping. Returns 'ok' | 'wrong' | 'pizza' (the last topping on: its points in s.last), null when
 *  nothing is on the counter just now */
export function pizzaPick(s, id) {
  if (s.done || s.wait > 0) return null;
  const order = PIZZA_ORDERS[s.order];
  if (order.tops[s.picked] !== id) {
    s.mistakes++;
    s.seq++; s.last = { text: `Not yet: ${TOPPINGS.find((t) => t.id === order.tops[s.picked]).name} next`, points: PIZZA.points.wrong, good: false, seq: s.seq };
    return 'wrong';
  }
  s.picked++;
  if (s.picked < order.tops.length) return 'ok';
  const points = pizzaPoints(order.tops.length, s.t, s.mistakes);
  s.results.push({ name: order.name, t: s.t, mistakes: s.mistakes, points });
  s.score += points;
  s.seq++; s.last = { text: s.mistakes ? `${order.name}: in the oven` : `${order.name}: flawless!`, points, good: true, seq: s.seq };
  s.wait = PIZZA.next;
  return 'pizza';
}

export const createPizzaRun = () => ({ ...createBeerState(), phase: 'deliver', heat: 1, score: 0, drops: [] });
/** A delivery's points at this heat (0-1) */
export const pizzaDeliveryPoints = (heat) => Math.round(PIZZA.points.delivery + PIZZA.points.heat * clamp(heat, 0, 1) + (heat >= PIZZA.hotAt ? PIZZA.points.hot : 0));
/** The boxes go cold, from the moment they leave the shop */
export function pizzaHeatStep(d, dt) { d.heat = Math.max(0, d.heat - dt / PIZZA.heatSeconds); return d; }
/** One frame of the carrying (js/missions-data-local.js beerStep: from the van parked close by to the door). Returns
 *  'pick' | 'deliver' | null; a delivery is booked at the heat of this moment */
export function pizzaCarryStep(d, ctx, van, stop) {
  const what = beerStep(d, ctx, van, stop);
  if (what === 'deliver') {
    const points = pizzaDeliveryPoints(d.heat);
    d.score += points;
    d.drops.push({ id: stop.id, heat: d.heat, points });
  }
  return what;
}
export const pizzaScore = (state) => (state.shop?.score || 0) + (state.run?.score || 0);

function pizzaDeliverObjective(stop, i) {
  return {
    id: `deliver-${stop.id}`,
    title: `Deliver to ${stop.short}`,
    allowModes: ['car', 'person'],
    check(ctx, state) {
      const st = state.run;
      const done = st.delivered > i;
      const van = st.van;
      const vanD = van ? dist(van, stop.door) : Infinity;
      const heat = `${Math.round(st.heat * 100)} % hot`;
      let text, target, hint = null;
      if (ctx.mode === 'car') {
        text = vanD < BEER.carryMax ? `Park here and get out (F) · ${stop.short}` : `${fmtDist(dist(ctx, stop.road))} to ${stop.name} · ${heat}`;
        target = vanD < BEER.carryMax ? { ...stop.door, r: BEER.doorR, style: 'plain' } : { ...stop.road, r: 8, style: 'plain' };
        if (vanD < BEER.carryMax && Math.abs(ctx.speed) < 0.6) hint = 'F: get out';
      } else if (vanD > BEER.carryMax) {
        text = `The van is ${fmtDist(vanD)} away: drive closer · ${heat}`;
        target = van ? { ...van, r: BEER.vanR, style: 'plain' } : null;
        hint = 'F: get in';
      } else if (!st.carrying) {
        text = `Take the box from the back of the van · ${heat}`;
        target = van ? { ...van, r: BEER.vanR, style: 'plain' } : null;
      } else {
        text = st.doorT > 0 ? `Handing over … ${stop.short}` : `Carry the box to the door · ${fmtDist(dist(ctx, stop.door))} · ${heat}`;
        target = { ...stop.door, r: BEER.doorR, style: 'plain' };
      }
      return { done, progress: st.doorT > 0 ? st.doorT / BEER.handover : null, text, target, hint };
    }
  };
}

export const PIZZA_MISSION = {
  id: 'pizza-heaven',
  title: 'The Pizza Heaven rush',
  intro: 'Friday night at Pizza Heaven, the Pizzakurier on the Promenade, and the courier has called in sick. Get out of the van (F) and walk into the shop: top four pizzas with the toppings on the ticket, in their order (keys 1-8 or tap), quickly and without a wrong pick. Then take them to four addresses from the Eisstadion to Davos Dorf: park, take the box from the back of the van, carry it to the door. The heat bar falls from the moment the pizzas leave the shop, and hot pizzas pay.',
  mode: 'car',
  allowModes: ['car', 'person'],
  season: null,
  time: 'evening',
  features: ['pizzaRun'],
  scoreMode: true,
  // (toppings from the bots in tests/missions-gastro.test.mjs; the route estimated: ~2.8 km at the beer run's pace, 4:20)
  medals: { gold: 1100, silver: 850, bronze: 500 },
  colour: '#e4572e',
  icon: 'pizza',
  finish: 'The last box is at the door, and somebody tips in Rappen.',
  start: { ...PIZZA_HEAVEN.van },
  pin: { x: PIZZA_HEAVEN.door.x, z: PIZZA_HEAVEN.door.z },
  interior: { door: PIZZA_HEAVEN.door },
  props: [],
  createState() { return { shop: null, inside: false, run: createPizzaRun() }; },
  score: pizzaScore,
  summary(state) {
    const lines = [];
    if (state.shop?.results.length) lines.push(state.shop.results.map((r) => `${r.name} ${r.points}`).join(' · '));
    if (state.run.drops.length) lines.push(state.run.drops.map((d) => `${PIZZA_STOPS.find((s) => s.id === d.id).short} ${Math.round(d.heat * 100)} % +${d.points}`).join(' · '));
    return lines;
  },
  objectives: [
    walkInto(PIZZA_HEAVEN.door, 'Go into Pizza Heaven', 'Pizza Heaven', ['car', 'person']),
    {
      id: 'toppings',
      title: `Top ${PIZZA_ORDERS.length} pizzas`,
      allowModes: ['person'],
      check(ctx, state) {
        const s = state.shop;
        if (!s) return { done: false, progress: 0, text: 'Aprons on …', target: null, hint: null };
        return { done: s.done, progress: s.results.length / PIZZA_ORDERS.length, text: `Pizza ${Math.min(s.order + 1, PIZZA_ORDERS.length)} of ${PIZZA_ORDERS.length} · ${s.score} pts`, target: null, hint: 'Keys 1-8 or tap the toppings, in the ticket\'s order' };
      }
    },
    ...PIZZA_STOPS.map(pizzaDeliverObjective)
  ]
};

export const GASTRO_MISSIONS = [SHOTS_MISSION, FLAEMMLI_MISSION, PIZZA_MISSION];
