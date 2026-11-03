import { BEER, BEER_STOPS, beerStep, createBeerState, seededRandom } from './missions-data-local.js';

// js/missions-data-gastro.js
// Two missions behind the counters of Davos Platz (js/missions-data.js spreads GASTRO_MISSIONS into MISSIONS;
// js/missions-gastro.js has their runtime). Like the other data modules: no three.js and no DOM in here, so that
// tests/missions-gastro.test.mjs drives the games with synthetic frames.
//
//  - flaemmli-rot-liechtli: the Rot Liechtli (OSM n599407075, the beer run's first stop). A Flämmli is a Swiss shot: a
//    glass of spirit set alight, blown out and downed. Order, light, blow, drink over six rounds; each drink narrows the
//    windows and sways the view. By points.
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
// 1. Flämmli in the Rot Liechtli
// =====================================================================================================================
const ROT = BEER_STOPS.find((s) => s.id === 'rotliechtli');
export const ROT_LIECHTLI = { door: { ...ROT.door, r: 2.4 }, start: { x: -573.4, z: 288.2 } };
export const FLAEMMLI = {
  rounds: 6,
  strikes: 3, // this many mishaps and the landlord calls time
  pour: 0.7, // s the landlord pours
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
export const FLAEMMLI_STEPS = {
  order: { label: 'At the bar', button: 'Order a Flämmli' },
  pour: { label: 'Pouring …', button: null },
  light: { label: 'Light it: bring the lighter over the glass', button: 'Light it' },
  burn: { label: 'The flame: blow it out in the green', button: 'Blow it out' },
  cool: { label: 'The glass: down it when the rim is warm, not hot', button: 'Down it' },
  pause: { label: 'Next round …', button: null }
};

export function createFlaemmli(seed = 11) {
  const rand = seededRandom(seed);
  return {
    t: 0, round: 1, step: 'order', stepT: 0, level: 0, cool: 0, sweepT: 0, rise: FLAEMMLI.rise * (0.85 + rand() * 0.3), rand,
    tries: 0, drinks: 0, strikes: 0, score: 0, perfect: 0, roundPts: 0, log: [], last: null, seq: 0, done: false, cutOff: false
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
const triangle = (t, period) => { const p = (t / period) % 2; return p < 1 ? p : 2 - p; };

/** What the gauge shows now: { label, button, value (0-1, the needle as judged; null without a gauge), lo, hi } */
export function flaemmliGauge(g) {
  const info = FLAEMMLI_STEPS[g.step];
  let base = null, v = 0;
  if (g.step === 'light') { base = FLAEMMLI.zones.light; v = triangle(g.sweepT, FLAEMMLI.sweep); }
  else if (g.step === 'burn') { base = FLAEMMLI.zones.burn; v = g.level; }
  else if (g.step === 'cool') { base = FLAEMMLI.zones.cool; v = g.cool; }
  if (!base) return { ...info, value: null, lo: 0, hi: 0 };
  const z = flaemmliZone(base, g.drinks);
  return { ...info, value: clamp(v + flaemmliWobble(g.t, g.drinks), 0, 1), lo: z.lo, hi: z.hi };
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
  add(g, FLAEMMLI.points.strike);
  say(g, text, FLAEMMLI.points.strike, false);
  endRound(g, false);
}
function drink(g) {
  g.drinks++;
  add(g, FLAEMMLI.points.round);
  endRound(g, true);
}
/** Inside the window: its share of the full points (half at the edge, all in the middle), or null outside */
function hitShare(v, z) {
  if (v < z.lo || v > z.hi) return null;
  const c = (z.lo + z.hi) / 2, h = (z.hi - z.lo) / 2;
  return 0.5 + 0.5 * (1 - Math.abs(v - c) / h);
}

/** The time goes on: the pouring, the lighter's swing, the flame and the cooling; the pause into the next round */
export function flaemmliStep(g, dt) {
  if (g.done || dt <= 0) return g;
  g.t += dt; g.stepT += dt;
  const F = FLAEMMLI;
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
export function flaemmliAction(g) {
  if (g.done) return null;
  const F = FLAEMMLI, P = F.points;
  const gauge = flaemmliGauge(g);
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
export const flaemmliScore = (g) => (g ? Math.max(0, Math.round(g.score)) : 0);

export const FLAEMMLI_MISSION = {
  id: 'flaemmli-rot-liechtli',
  title: 'Flämmli in the Rot Liechtli',
  intro: 'Evening in the Rot Liechtli, the little pub in Davos Platz. A Flämmli is a Swiss shot: a glass of spirit set alight, blown out and downed. Walk in and take your place at the bar, then six rounds with one button (Space, Enter or a tap): order, light it when the lighter is over the glass, blow it out while the flame is in the green, down it when the rim has cooled. Every drink narrows the windows and sways the room. Three mishaps and the landlord calls time. You are walking home tonight, by the way.',
  mode: 'person',
  season: null,
  time: 'evening',
  features: ['flaemmli'],
  scoreMode: true,
  // (calibrated on the bots in tests/missions-gastro.test.mjs: a steady hand gold, a fair one silver, a shaky one bronze)
  medals: { gold: 1150, silver: 900, bronze: 500 },
  colour: '#d7263d',
  icon: 'flame',
  finish: 'The red lamp turns gently. Take the Rufbus home: nobody is driving tonight.',
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
// 2. Pizza Heaven
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

export const GASTRO_MISSIONS = [FLAEMMLI_MISSION, PIZZA_MISSION];
