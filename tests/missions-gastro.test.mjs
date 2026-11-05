import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GASTRO_MISSIONS, SHOTS_MISSION, SHOTS, createShots, shotsStep, shotsAction, shotsGauge, shotsZone, shotsSway, shotsWobble, shotsScore, EX_BAR,
  FLAEMMLI_MISSION, FLAEMMLI, createFlaemmli, flaemmliStep, flaemmliPress, flaemmliRelease, flaemmliGauge, flaemmliSugar, flaemmliScore, ROT_LIECHTLI,
  PIZZA_MISSION, PIZZA, PIZZA_HEAVEN, PIZZA_STOPS, PIZZA_ORDERS, TOPPINGS, createPizzaShop, pizzaShopStep, pizzaPick, pizzaPoints, createPizzaRun, pizzaHeatStep, pizzaCarryStep, pizzaDeliveryPoints, pizzaScore
} from '../js/missions-data-gastro.js';
import { BEER, BEER_STOPS, seededRandom } from '../js/missions-data-local.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { medalFor, missionMedals, missionPin } from '../js/missions-progress.js';

// (js/missions-data-gastro.js is three.js-free: both games run on synthetic frames here)
const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 0.1, t: 0, ...over });
const DT = 1 / 30;

/** A player of the bar: aims for the middle of each window with a reaction error of `sigma` (on the gauge, gaussian) */
function playShots(sigma, seed) {
  const g = createShots(11), rand = seededRandom(seed);
  const noise = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()) * sigma;
  let aim = null, guard = 0, prevStep = null;
  while (!g.done && guard++ < 60000) {
    shotsStep(g, DT);
    if (g.step !== prevStep) { aim = null; prevStep = g.step; }
    if (g.step === 'order') { shotsAction(g); continue; }
    const v = shotsGauge(g);
    if (v.value === null) continue;
    if (aim === null) aim = clamp01((v.lo + v.hi) / 2 + noise());
    if (v.value >= aim) { shotsAction(g); aim = null; }
  }
  assert.ok(g.done, 'the evening ends');
  return g;
}
const clamp01 = (v) => Math.max(0.02, Math.min(0.97, v));
const meanShots = (sigma) => { let sum = 0; for (let s = 1; s <= 40; s++) sum += shotsScore(playShots(sigma, s * 101)); return sum / 40; };

function inRing(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const a = ring[i + 1] > z, b = ring[j + 1] > z;
    if (a !== b && x < ((ring[j] - ring[i]) * (z - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) c = !c;
  }
  return c;
}
const inBuilding = (x, z) => DAVOS_DATA.buildings.some((b) => inRing(x, z, b.ring));

test('the gastro missions are registered, by points, with their pins apart from every other mission', () => {
  assert.deepEqual(GASTRO_MISSIONS.map((m) => m.id), ['shots-ex-bar', 'flaemmli-rot-liechtli', 'pizza-heaven']);
  for (const m of GASTRO_MISSIONS) {
    assert.equal(getMission(m.id), m);
    assert.ok(MISSIONS.includes(m));
    assert.equal(m.features.length, 1);
    assert.ok(m.scoreMode);
    const l = missionMedals(m);
    assert.ok(l.gold > l.silver && l.silver > l.bronze);
    assert.equal(m.score(m.createState()), 0);
    const pin = missionPin(m);
    for (const o of MISSIONS) if (o !== m) { const p = missionPin(o); assert.ok(Math.hypot(p.x - pin.x, p.z - pin.z) > 30, `${m.id} vs ${o.id}`); }
    assert.ok(m.icon);
  }
});

// --- 1. Flaming shots in the Ex Bar -----------------------------------------------------------------------------------------------------
test('shots: the Ex Bar is the beer run\'s door, the start clear of the houses', () => {
  const stop = BEER_STOPS.find((s) => s.id === 'exbar');
  assert.equal(EX_BAR.door.x, stop.door.x);
  assert.equal(EX_BAR.door.z, stop.door.z);
  assert.ok(!inBuilding(EX_BAR.start.x, EX_BAR.start.z));
  const obj = SHOTS_MISSION.objectives[0];
  assert.equal(obj.check(frame({ ...EX_BAR.start }), {}).done, false);
  assert.equal(obj.check(frame({ x: EX_BAR.door.x, z: EX_BAR.door.z }), {}).done, true);
  assert.equal(obj.check(frame({ mode: 'car', x: EX_BAR.door.x, z: EX_BAR.door.z }), {}).done, false, 'not by car');
});

test('shots: a round goes order, pour, light, burn, cool and down; the button does nothing while pouring', () => {
  const g = createShots(11);
  assert.equal(g.step, 'order');
  assert.equal(shotsAction(g), 'order');
  assert.equal(g.step, 'pour');
  assert.equal(shotsAction(g), null, 'the landlord is pouring');
  shotsStep(g, SHOTS.pour + 0.01);
  assert.equal(g.step, 'light');
  // the lighter swings to the glass: half a sweep away
  shotsStep(g, SHOTS.sweep * 0.5);
  assert.equal(shotsAction(g), 'light');
  assert.equal(g.step, 'burn');
  while (shotsGauge(g).value < 0.63) shotsStep(g, DT);
  assert.equal(shotsAction(g), 'blow');
  assert.ok(g.last.good && g.last.points > 75, `a flame in the middle pays: ${g.last.points}`);
  assert.equal(g.step, 'cool');
  while (shotsGauge(g).value < 0.57) shotsStep(g, DT);
  assert.equal(shotsAction(g), 'drink');
  assert.equal(g.drinks, 1);
  assert.equal(g.step, 'pause');
  assert.equal(g.log.length, 1);
  shotsStep(g, SHOTS.pause + 0.01);
  assert.equal(g.round, 2);
  assert.equal(g.step, 'order');
});

test('shots: a flame left burning cracks the glass (a mishap, no drink), three mishaps and the landlord calls time', () => {
  const g = createShots(11);
  for (let k = 0; k < SHOTS.strikes; k++) {
    shotsAction(g);
    shotsStep(g, SHOTS.pour + 0.01);
    shotsStep(g, SHOTS.sweep * 0.5);
    assert.equal(shotsAction(g), 'light');
    while (g.step === 'burn') shotsStep(g, 0.1);
    assert.equal(g.step, 'pause');
    assert.equal(g.strikes, k + 1);
    shotsStep(g, SHOTS.pause + 0.01);
  }
  assert.ok(g.done && g.cutOff);
  assert.equal(g.drinks, 0);
  assert.equal(g.round, SHOTS.strikes);
  assert.equal(shotsAction(g), null);
});

test('shots: three misses with the lighter singe the fingers; too early and too late pay less than the window', () => {
  const g = createShots(11);
  shotsAction(g);
  shotsStep(g, SHOTS.pour + 0.01);
  assert.equal(shotsAction(g), 'miss');
  assert.equal(g.step, 'light');
  assert.equal(shotsAction(g), 'miss');
  assert.equal(shotsAction(g), 'miss');
  assert.equal(g.step, 'pause');
  assert.equal(g.strikes, 1);

  const burnAt = (level) => {
    const h = createShots(11);
    shotsAction(h);
    shotsStep(h, SHOTS.pour + 0.01);
    shotsStep(h, SHOTS.sweep * 0.5);
    shotsAction(h);
    h.level = level;
    shotsAction(h);
    return h.last.points;
  };
  assert.ok(burnAt(0.635) > 90);
  assert.equal(burnAt(0.1), 0, 'blown out at once: nothing');
  assert.equal(burnAt(0.45), SHOTS.points.flame * SHOTS.points.near);
  assert.equal(burnAt(0.9), SHOTS.points.flame * SHOTS.points.near);
  // a glass left too long goes down cold
  const c = createShots(11);
  shotsAction(c); shotsStep(c, SHOTS.pour + 0.01); shotsStep(c, SHOTS.sweep * 0.5); shotsAction(c);
  c.level = 0.6; shotsAction(c);
  for (let i = 0; i < 60 && c.step === 'cool'; i++) shotsStep(c, 0.1);
  assert.equal(c.step, 'pause');
  assert.equal(c.drinks, 1);
});

test('shots: every drink sways the view more, strays the needle and narrows the window', () => {
  const peak = (d) => { let m = 0; for (let t = 0; t < 30; t += 0.05) m = Math.max(m, Math.abs(shotsSway(t, d).roll)); return m; };
  assert.equal(peak(0), 0);
  assert.ok(peak(1) > 0.02 && peak(3) > peak(1) * 2.5 && peak(6) > peak(3) * 1.5);
  assert.ok(peak(SHOTS.rounds) < 0.3, 'tipsy, not upside down');
  assert.equal(shotsWobble(3, 0), 0);
  const w = (d) => shotsZone(SHOTS.zones.burn, d);
  assert.ok(w(5).hi - w(5).lo < w(0).hi - w(0).lo);
  assert.ok(Math.abs((w(5).lo + w(5).hi) - (w(0).lo + w(0).hi)) < 1e-9, 'round the same middle');
  assert.ok(w(40).hi - w(40).lo >= (w(0).hi - w(0).lo) * SHOTS.narrowMin - 1e-9);
});

test('shots: all six down earn the bonus; the medals sort the bots', () => {
  const steady = playShots(0.005, 7);
  assert.equal(steady.drinks, SHOTS.rounds);
  assert.equal(steady.strikes, 0);
  assert.ok(steady.log.length === SHOTS.rounds);
  const def = SHOTS_MISSION, medals = missionMedals(def);
  assert.equal(def.score({ game: steady }), shotsScore(steady));
  assert.ok(def.summary({ game: steady })[0].includes('6 of 6'));
  const scores = { steady: meanShots(0.02), fair: meanShots(0.07), shaky: meanShots(0.13) };
  assert.equal(medalFor(scores.steady, medals, true), 'gold', `steady ${scores.steady}`);
  assert.equal(medalFor(scores.fair, medals, true), 'silver', `fair ${scores.fair}`);
  assert.equal(medalFor(scores.shaky, medals, true), 'bronze', `shaky ${scores.shaky}`);
});

test('shots: the mission\'s step waits for the bar, then ends with the game', () => {
  const obj = SHOTS_MISSION.objectives[1];
  const state = SHOTS_MISSION.createState();
  assert.equal(obj.check(frame(), state).done, false);
  state.game = createShots(11);
  assert.equal(obj.check(frame(), state).done, false);
  state.game.done = true;
  assert.equal(obj.check(frame(), state).done, true);
});

// --- 2. Flämmli in the Rot Liechtli ------------------------------------------------------------------------------
/** A Flämmli drinker: holds and lets go, lights and smothers aiming for the middle of each window with an error of
 *  `sigma`; swirls when the flame sinks under the green's lower edge plus a margin (missed by `sigma`); pours late by
 *  a reaction time */
function playFlaemmli(sigma, seed) {
  const g = createFlaemmli(11), rand = seededRandom(seed);
  const noise = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()) * sigma;
  let aim = null, prev = null, guard = 0, wait = 0;
  while (!g.done && guard++ < 100000) {
    flaemmliStep(g, DT);
    if (g.step !== prev) { aim = null; prev = g.step; wait = 0.25 + Math.abs(noise()) * 3; }
    const v = flaemmliGauge(g);
    if (g.step === 'order' || g.step === 'drink') { flaemmliPress(g); continue; }
    if (v.hold) {
      if (!g.holding) { flaemmliPress(g); continue; }
      if (aim === null) aim = (v.lo + v.hi) / 2 + noise();
      if (v.value >= aim) flaemmliRelease(g);
      continue;
    }
    if (g.step === 'flambe') {
      if (aim === null) aim = v.lo + 0.08 + noise();
      if (v.value < aim) { flaemmliPress(g); aim = null; }
      continue;
    }
    if (g.step === 'ready') { wait -= DT; if (wait <= 0) flaemmliPress(g); continue; }
    if (v.value === null) continue;
    if (aim === null) aim = clamp01((v.lo + v.hi) / 2 + noise());
    if (v.value >= aim) { flaemmliPress(g); aim = null; }
  }
  assert.ok(g.done, 'the evening ends');
  return g;
}
const meanFlaemmli = (sigma) => { let sum = 0; for (let s = 1; s <= 40; s++) sum += flaemmliScore(playFlaemmli(sigma, s * 101)); return sum / 40; };
/** Through a round's held steps to the flambé, each let go in the middle of its window */
function toFlambe(g) {
  assert.equal(flaemmliPress(g), 'order');
  flaemmliStep(g, FLAEMMLI.serve + 0.01);
  for (const step of ['sugar', 'sip', 'williams']) {
    assert.equal(g.step, step);
    assert.equal(flaemmliPress(g), 'hold');
    const v = flaemmliGauge(g), mid = (v.lo + v.hi) / 2;
    while (flaemmliGauge(g).value < mid) flaemmliStep(g, DT);
    assert.equal(flaemmliRelease(g), step);
  }
  assert.equal(g.step, 'light');
  flaemmliStep(g, FLAEMMLI.sweep * 0.5);
  assert.equal(flaemmliPress(g), 'light');
  assert.equal(g.step, 'flambe');
}

test('flämmli: the Rot Liechtli is the beer run\'s door, the start clear of the houses', () => {
  const stop = BEER_STOPS.find((s) => s.id === 'rotliechtli');
  assert.equal(ROT_LIECHTLI.door.x, stop.door.x);
  assert.equal(ROT_LIECHTLI.door.z, stop.door.z);
  assert.ok(!inBuilding(ROT_LIECHTLI.start.x, ROT_LIECHTLI.start.z));
  const obj = FLAEMMLI_MISSION.objectives[0];
  assert.equal(obj.check(frame({ ...ROT_LIECHTLI.start }), {}).done, false);
  assert.equal(obj.check(frame({ x: ROT_LIECHTLI.door.x, z: ROT_LIECHTLI.door.z }), {}).done, true);
});

test('flämmli: sugar, sip and Williams are held and judged when let go; the button does nothing while serving', () => {
  const g = createFlaemmli(11);
  assert.equal(flaemmliPress(g), 'order');
  assert.equal(g.step, 'serve');
  assert.equal(flaemmliPress(g), null, 'the landlord is serving');
  flaemmliStep(g, FLAEMMLI.serve + 0.01);
  assert.equal(g.step, 'sugar');
  assert.equal(flaemmliRelease(g), null, 'nothing held yet');
  flaemmliPress(g);
  flaemmliStep(g, 0.1);
  assert.equal(flaemmliRelease(g), 'sugar');
  assert.ok(!g.last.good, 'a pinch is too little');
  assert.equal(g.step, 'sip');
  // held too long: the gauge runs over and is judged by itself
  flaemmliPress(g);
  for (let i = 0; i < 200 && g.step === 'sip'; i++) flaemmliStep(g, 0.05);
  assert.equal(g.step, 'williams');
  assert.equal(g.sip, 1);
  assert.match(g.last.text, /spills/);
});

test('flämmli: the flame sinks by itself and with the draughts; swirling keeps it, too much sloshes over; out once, lit again', () => {
  const g = createFlaemmli(11);
  toFlambe(g);
  const f0 = g.flame;
  flaemmliStep(g, 1);
  assert.ok(g.flame < f0, 'it sinks');
  assert.equal(flaemmliPress(g), 'swirl');
  // swirl it over the top
  let what;
  for (let i = 0; i < 10 && what !== 'wild'; i++) what = flaemmliPress(g);
  assert.equal(what, 'wild');
  assert.equal(g.flame, FLAEMMLI.flame.calm);
  // left alone it goes out: lit again once ...
  for (let i = 0; i < 400 && g.step === 'flambe'; i++) flaemmliStep(g, DT);
  assert.equal(g.step, 'light');
  assert.equal(g.relit, 1);
  flaemmliStep(g, FLAEMMLI.sweep * 0.5 - (g.sweepT % (2 * FLAEMMLI.sweep)));
  assert.equal(flaemmliPress(g), 'light');
  assert.equal(g.step, 'flambe');
  // ... and the second time it is a mishap
  for (let i = 0; i < 400 && g.step === 'flambe'; i++) flaemmliStep(g, DT);
  assert.equal(g.step, 'pause');
  assert.equal(g.strikes, 1);
  assert.equal(g.drinks, 0);
});

test('flämmli: the caramel comes in the green; poured burning, smothered, downed', () => {
  const g = createFlaemmli(11);
  toFlambe(g);
  for (let i = 0; i < 2000 && g.step === 'flambe'; i++) { flaemmliStep(g, DT); if (g.flame < 0.55) flaemmliPress(g); }
  assert.equal(g.step, 'ready');
  assert.ok(g.burnT > 6 && g.burnT < 14, `the caramel takes ${g.burnT.toFixed(1)} s`);
  assert.equal(flaemmliPress(g), 'pour');
  assert.ok(g.last.good);
  assert.equal(g.step, 'smother');
  const mid = (flaemmliGauge(g).lo + flaemmliGauge(g).hi) / 2;
  while (flaemmliGauge(g).value < mid) flaemmliStep(g, DT);
  assert.equal(flaemmliPress(g), 'smother');
  assert.match(g.last.text, /sticks/);
  assert.equal(flaemmliPress(g), 'drink');
  assert.equal(g.drinks, 1);
  assert.equal(g.step, 'pause');
  // a shot glass left burning cracks
  const h = createFlaemmli(11);
  toFlambe(h);
  for (let i = 0; i < 2000 && h.step === 'flambe'; i++) { flaemmliStep(h, DT); if (h.flame < 0.55) flaemmliPress(h); }
  flaemmliPress(h);
  for (let i = 0; i < 200 && h.step === 'smother'; i++) flaemmliStep(h, 0.05);
  assert.equal(h.strikes, 1);
});

test('flämmli: a sip too long swallows the sugar and slows the caramel', () => {
  const g = { sugar: 0.6, sip: 0.8 }, h = { sugar: 0.6, sip: 1 };
  assert.equal(flaemmliSugar(g), 0.6);
  assert.ok(flaemmliSugar(h) < 0.6 * 0.6);
});

test('flämmli: all three down earn the bonus; the medals sort the bots', () => {
  const steady = playFlaemmli(0.005, 7);
  assert.equal(steady.drinks, FLAEMMLI.rounds);
  assert.equal(steady.strikes, 0);
  const def = FLAEMMLI_MISSION, medals = missionMedals(def);
  assert.equal(def.score({ game: steady }), flaemmliScore(steady));
  assert.ok(def.summary({ game: steady })[0].includes('3 of 3'));
  const scores = { steady: meanFlaemmli(0.02), fair: meanFlaemmli(0.07), shaky: meanFlaemmli(0.13) };
  assert.equal(medalFor(scores.steady, medals, true), 'gold', `steady ${scores.steady}`);
  assert.equal(medalFor(scores.fair, medals, true), 'silver', `fair ${scores.fair}`);
  assert.equal(medalFor(scores.shaky, medals, true), 'bronze', `shaky ${scores.shaky}`);
});

// --- 3. Pizza Heaven ------------------------------------------------------------------------------------------------
test('pizza: every order is for a stop, in delivery order, of known toppings; the places are clear of the houses', () => {
  assert.deepEqual(PIZZA_ORDERS.map((o) => o.stop), PIZZA_STOPS.map((s) => s.id));
  assert.ok(PIZZA_STOPS.length >= 3 && PIZZA_STOPS.length <= 4);
  assert.ok(TOPPINGS.length <= 8, 'keys 1-8');
  for (const o of PIZZA_ORDERS) for (const id of o.tops) assert.ok(TOPPINGS.some((t) => t.id === id), id);
  for (const s of PIZZA_STOPS) {
    assert.ok(!inBuilding(s.door.x, s.door.z), `${s.id} door`);
    assert.ok(!inBuilding(s.road.x, s.road.z), `${s.id} road`);
    assert.ok(Math.hypot(s.door.x - s.road.x, s.door.z - s.road.z) < BEER.carryMax, `${s.id}: the van reaches the door`);
  }
  assert.ok(!inBuilding(PIZZA_HEAVEN.door.x, PIZZA_HEAVEN.door.z));
  assert.ok(!inBuilding(PIZZA_HEAVEN.van.x, PIZZA_HEAVEN.van.z));
  const route = [PIZZA_HEAVEN, ...PIZZA_STOPS];
  let km = 0;
  for (let i = 1; i < route.length; i++) km += Math.hypot(route[i].door.x - route[i - 1].door.x, route[i].door.z - route[i - 1].door.z) / 1000;
  assert.ok(km > 1.5 && km < 3.5, `${km} km as the crow flies`);
});

test('pizza: toppings go on in the ticket\'s order; a wrong pick costs; speed pays; the next order follows', () => {
  const s = createPizzaShop();
  const first = PIZZA_ORDERS[0];
  assert.equal(pizzaPick(s, first.tops[1]), 'wrong');
  assert.equal(s.picked, 0);
  assert.equal(s.mistakes, 1);
  pizzaShopStep(s, 1);
  for (let i = 0; i < first.tops.length - 1; i++) assert.equal(pizzaPick(s, first.tops[i]), 'ok');
  assert.equal(pizzaPick(s, first.tops[first.tops.length - 1]), 'pizza');
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0].mistakes, 1);
  assert.equal(s.score, pizzaPoints(first.tops.length, 1, 1));
  assert.equal(pizzaPick(s, 'tomato'), null, 'on its way to the oven');
  pizzaShopStep(s, PIZZA.next + 0.01);
  assert.equal(s.order, 1);
  assert.equal(s.picked, 0);
  assert.equal(s.mistakes, 0, 'a fresh ticket');
  const n = 4;
  assert.equal(pizzaPoints(n, PIZZA.parTop * n * 0.5, 0), PIZZA.points.pizza + PIZZA.points.speed);
  assert.equal(pizzaPoints(n, PIZZA.parTop * n * 2, 0), PIZZA.points.pizza);
  assert.equal(pizzaPoints(n, 100, 40), PIZZA.points.min);
  assert.ok(pizzaPoints(n, 1.5 * PIZZA.parTop * n, 0) < PIZZA.points.pizza + PIZZA.points.speed);
});

test('pizza: the whole shop done, the mission\'s step follows it', () => {
  const state = PIZZA_MISSION.createState();
  const step = PIZZA_MISSION.objectives[1];
  assert.equal(step.check(frame(), state).done, false);
  state.shop = createPizzaShop();
  for (const o of PIZZA_ORDERS) {
    for (const t of o.tops) { pizzaShopStep(state.shop, 0.3); pizzaPick(state.shop, t); }
    pizzaShopStep(state.shop, PIZZA.next + 0.01);
  }
  assert.ok(state.shop.done);
  assert.equal(step.check(frame(), state).done, true);
  assert.equal(state.shop.results.length, PIZZA_ORDERS.length);
  assert.equal(pizzaScore(state), state.shop.score);
  assert.ok(PIZZA_MISSION.summary(state)[0].includes('Margherita'));
});

test('pizza: the walk in starts from the van, on foot', () => {
  const obj = PIZZA_MISSION.objectives[0];
  assert.deepEqual(obj.allowModes, ['car', 'person']);
  assert.equal(obj.check(frame({ mode: 'car', ...PIZZA_HEAVEN.door }), {}).done, false);
  assert.equal(obj.check(frame({ ...PIZZA_HEAVEN.door }), {}).done, true);
});

test('pizza: the heat falls with the time and a hotter box pays more', () => {
  const d = createPizzaRun();
  assert.equal(d.heat, 1);
  assert.equal(d.phase, 'deliver', 'no crates to load');
  pizzaHeatStep(d, PIZZA.heatSeconds / 2);
  assert.ok(Math.abs(d.heat - 0.5) < 1e-9);
  pizzaHeatStep(d, PIZZA.heatSeconds);
  assert.equal(d.heat, 0);
  assert.equal(pizzaDeliveryPoints(0), PIZZA.points.delivery, 'a cold pizza still earns the fare');
  assert.equal(pizzaDeliveryPoints(1), PIZZA.points.delivery + PIZZA.points.heat + PIZZA.points.hot);
  assert.ok(pizzaDeliveryPoints(0.8) > pizzaDeliveryPoints(0.6) + 40, 'piping hot: a tip on top');
});

test('pizza: the beer run\'s carrying: park close by, take the box, hand it over at the door, booked at its heat', () => {
  const stop = PIZZA_STOPS[0];
  const d = createPizzaRun();
  const near = { x: stop.road.x, z: stop.road.z };
  const far = { x: stop.door.x + BEER.carryMax + 50, z: stop.door.z };
  assert.equal(pizzaCarryStep(d, frame({ mode: 'car', ...near }), near, stop), null, 'nothing from the driver\'s seat');
  assert.equal(pizzaCarryStep(d, frame(far), far, stop), null, 'the van is too far');
  assert.equal(pizzaCarryStep(d, frame(near), near, stop), 'pick');
  assert.ok(d.carrying);
  pizzaHeatStep(d, PIZZA.heatSeconds * 0.25);
  assert.equal(pizzaCarryStep(d, frame({ ...stop.door, dt: BEER.handover * 0.6 }), near, stop), null);
  assert.equal(pizzaCarryStep(d, frame({ ...stop.door, dt: BEER.handover * 0.6 }), near, stop), 'deliver');
  assert.equal(d.delivered, 1);
  assert.equal(d.drops[0].id, stop.id);
  assert.equal(d.drops[0].points, pizzaDeliveryPoints(0.75));
  assert.equal(d.score, d.drops[0].points);
});

test('pizza: the delivery steps guide the driver, then the walker; the medals fit a good and a slow run', () => {
  const state = PIZZA_MISSION.createState();
  const step = PIZZA_MISSION.objectives[2];
  const stop = PIZZA_STOPS[0];
  state.run.van = { x: 0, z: 0 };
  assert.match(step.check(frame({ mode: 'car' }), state).text, /Eisstadion/);
  assert.deepEqual([step.check(frame({ mode: 'car' }), state).target.x], [stop.road.x]);
  state.run.van = { ...stop.road };
  assert.match(step.check(frame({ mode: 'car', ...stop.road }), state).text, /Park here/);
  assert.match(step.check(frame({ ...stop.road }), state).text, /Take the box/);
  state.run.carrying = true;
  assert.match(step.check(frame({ ...stop.road }), state).text, /Carry the box/);
  state.run.delivered = 1;
  assert.equal(step.check(frame(), state).done, true);

  // (a quick hand: 3 s a pizza, clean; a run of 4:20 with even legs. A slow one: 8 s a pizza, 3 mistakes, 8 minutes)
  const run = (perPizza, mistakes, seconds) => {
    let shop = 0;
    for (const o of PIZZA_ORDERS) shop += pizzaPoints(o.tops.length, perPizza, mistakes);
    let drive = 0;
    const legs = [0.15, 0.32, 0.78, 1];
    for (const l of legs) drive += pizzaDeliveryPoints(1 - (seconds * l) / PIZZA.heatSeconds);
    return shop + drive;
  };
  const medals = missionMedals(PIZZA_MISSION);
  assert.equal(medalFor(run(3, 0, 260), medals, true), 'gold');
  assert.equal(medalFor(run(5, 1, 360), medals, true), 'silver');
  assert.equal(medalFor(run(8, 3, 480), medals, true), 'bronze');
});
