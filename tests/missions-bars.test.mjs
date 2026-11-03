import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BARS_MISSIONS, NAGELN_MISSION, NAGELN, NAGELN_RIVALS, NAGELN_LINEUPS, TIJUANA, createNageln, nagelnStep, nagelnPress, nagelnGauge, nagelnScore, nagelStroke,
  BARISTA_MISSION, BARISTA, KAFI, DRINKS, RUSH, REGULARS, GOSSIP, createBarista, baristaStep, baristaAction, baristaPick, baristaGauge, baristaScore, drinkById
} from '../js/missions-data-bars.js';
import { seededRandom } from '../js/missions-data-local.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { medalFor, missionMedals, missionPin } from '../js/missions-progress.js';
import { rollHairstyle, HAIRSTYLE } from '../js/pedestrians.js';
import { readFileSync } from 'node:fs';

// (js/missions-data-bars.js is three.js-free: both games run on synthetic frames here)
const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 0.1, t: 0, ...over });
const DT = 1 / 30;
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

function inRing(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const a = ring[i + 1] > z, b = ring[j + 1] > z;
    if (a !== b && x < ((ring[j] - ring[i]) * (z - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) c = !c;
  }
  return c;
}
const inBuilding = (x, z) => DAVOS_DATA.buildings.some((b) => inRing(x, z, b.ring));

test('the bar missions are registered, by points, with their pins apart from every other mission', () => {
  assert.deepEqual(BARS_MISSIONS.map((m) => m.id), ['nageln-tijuana', 'barista-kafi-klatsch']);
  for (const m of BARS_MISSIONS) {
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
    assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), new RegExp(`case '${m.icon}'`));
  }
});

test('starts and doors lie outside every house, the start faces the door and the straight walk is free', () => {
  for (const m of BARS_MISSIONS) {
    const door = m.interior.door, s = m.start;
    assert.ok(!inBuilding(door.x, door.z), `${m.id}: the door`);
    assert.ok(!inBuilding(s.x, s.z), `${m.id}: the start`);
    const d = Math.hypot(door.x - s.x, door.z - s.z);
    assert.ok(d > 8 && d < 40, `${m.id}: a short walk (${d})`);
    assert.ok(Math.abs(s.heading - Math.atan2(door.x - s.x, door.z - s.z)) < 1e-9, `${m.id}: facing the door`);
    for (let k = 0; k <= 80; k++) {
      const u = k / 80;
      assert.ok(!inBuilding(s.x + (door.x - s.x) * u, s.z + (door.z - s.z) * u), `${m.id}: the walk at ${u}`);
    }
    const obj = m.objectives[0];
    assert.equal(obj.check(frame({ x: s.x, z: s.z }), {}).done, false);
    assert.equal(obj.check(frame({ x: door.x, z: door.z }), {}).done, true);
    assert.equal(obj.check(frame({ mode: 'car', x: door.x, z: door.z }), {}).done, false, 'not by car');
  }
});

// --- 1. Nageln -----------------------------------------------------------------------------------------------------
/** A player at the stump: aims for the middle with a reaction error of `sigma` (on the gauge) */
function playNageln(sigma, seed, gameSeed = 23) {
  const g = createNageln(gameSeed), rand = seededRandom(seed);
  let target = null, step = null, guard = 0;
  while (!g.done && guard++ < 80000) {
    nagelnStep(g, DT);
    if (g.step !== step) { step = g.step; target = null; }
    if (g.step !== 'aim' && g.step !== 'power') continue;
    const v = nagelnGauge(g);
    if (target === null) target = Math.max(0.02, Math.min(0.98, (v.lo + v.hi) / 2 + gauss(rand) * sigma));
    const prev = v.value;
    if (prev >= target) nagelnPress(g);
  }
  assert.ok(g.done, 'the evening ends');
  return g;
}
const mean = (fn, sigma) => { let sum = 0; for (let s = 1; s <= 40; s++) sum += fn(sigma, s * 101, 20 + s); return sum / 40; };

test('nageln: strokes: the middle at the sweet power is perfect, off the head misses, overdone bends', () => {
  const never = () => 0.999, always = () => 0;
  const nail = { left: 5, bent: false };
  const best = nagelStroke(never, nail, 0.5, 0.76);
  assert.equal(best.kind, 'perfect');
  assert.ok(Math.abs(best.drive - NAGELN.maxDrive) < 1e-6);
  assert.equal(nagelStroke(never, nail, 0.05, 0.76).kind, 'miss');
  assert.equal(nagelStroke(never, nail, 0.05, 0.76).drive, 0);
  assert.equal(nagelStroke(always, nail, 0.5, 0.99).kind, 'bent', 'too hard');
  const glance = nagelStroke(never, nail, 0.5 + NAGELN.aimGlance / 2 + 0.05, 0.76);
  assert.equal(glance.kind, 'glance');
  assert.ok(glance.drive < best.drive * 0.5);
  assert.ok(nagelStroke(never, nail, 0.5, 0.3).drive < best.drive * 0.5, 'too soft goes in less');
  const straighten = nagelStroke(never, { left: 5, bent: true }, 0.5, 0.76);
  assert.equal(straighten.kind, 'straighten');
  assert.ok(straighten.drive < best.drive);
});

test('nageln: the swing is aim then power, one press each, nothing while someone else swings; a miss costs the turn', () => {
  const g = createNageln(5);
  assert.equal(g.step, 'call');
  assert.equal(nagelnPress(g), null);
  while (g.step === 'call') nagelnStep(g, DT);
  assert.equal(g.step, 'aim', 'you start the first game');
  while (nagelnGauge(g).value > 0.03 || g.stepT < 0.01) nagelnStep(g, 0.001);
  assert.equal(nagelnPress(g), 'aim');
  assert.equal(g.step, 'power');
  for (let i = 0; i < 12; i++) nagelnStep(g, DT);
  assert.equal(nagelnPress(g), 'strike');
  assert.equal(g.swing.kind, 'miss');
  assert.equal(g.players[0].left, NAGELN.nail, 'the nail stays');
  assert.equal(g.misses, 1);
  assert.equal(g.step, 'after');
  assert.equal(nagelnPress(g), null);
  while (g.step === 'after') nagelnStep(g, DT);
  assert.equal(g.step, 'windup', 'the next one is a rival');
  assert.equal(g.players[g.turn].you, false);
});

test('nageln: three games with 3, 3 and 4 rivals of different skill; a drink speeds up the swing', () => {
  assert.deepEqual(NAGELN_LINEUPS.map((l) => l.length), [3, 3, 4]);
  const aims = Object.values(NAGELN_RIVALS).map((r) => r.aim);
  assert.equal(new Set(aims).size, aims.length, 'each aims differently');
  // the better the skill, the more games they win over many evenings when you just can't hit
  const wins = {};
  for (let s = 1; s <= 30; s++) {
    const g = playNageln(0.5, s, s);
    assert.equal(g.log.length, NAGELN.games);
    for (const l of g.log) wins[l.winner] = (wins[l.winner] || 0) + 1;
  }
  assert.ok((wins.seraina || 0) > (wins.mirko || 0), JSON.stringify(wins));
  assert.ok((wins.flurin || 0) > (wins.mirko || 0), JSON.stringify(wins));
});

test('nageln: bent nails happen to the crowd too, the crowd chats, and a game always ends', () => {
  let bent = 0, chats = 0;
  for (let s = 1; s <= 10; s++) {
    const g = createNageln(s);
    let swing = 0, guard = 0, seen = 0;
    while (!g.done && guard++ < 80000) {
      nagelnStep(g, DT);
      if (g.step === 'aim') nagelnPress(g);
      else if (g.step === 'power' && nagelnGauge(g).value > 0.7) nagelnPress(g);
      if (g.swing && g.swing.seq !== swing) { swing = g.swing.seq; if (g.swing.kind === 'bent' && g.swing.who !== 'you') bent++; }
      if (g.chatSeq !== seen) { chats += g.chatSeq - seen; seen = g.chatSeq; }
    }
    assert.ok(g.done);
  }
  assert.ok(bent > 0, 'rivals bend nails');
  assert.ok(chats > 20, 'they talk');
});

test('nageln: the medals: a steady hand gold, a fair one silver, a shaky one bronze; never for nothing', () => {
  const score = (sigma, seed, gameSeed) => nagelnScore(playNageln(sigma, seed, gameSeed));
  const steady = mean(score, 0.02), fair = mean(score, 0.07), shaky = mean(score, 0.16);
  const M = NAGELN_MISSION.medals;
  assert.ok(steady > fair && fair > shaky, `${steady} ${fair} ${shaky}`);
  assert.equal(medalFor(steady, M, true), 'gold', `steady ${steady}`);
  assert.equal(medalFor(fair, M, true), 'silver', `fair ${fair}`);
  assert.equal(medalFor(shaky, M, true), 'bronze', `shaky ${shaky}`);
  assert.equal(medalFor(0, M, true), null);
  const g = playNageln(0.02, 7);
  const text = NAGELN_MISSION.summary({ game: g });
  assert.match(text[0], /games won/);
});

test('nageln: a mixed crowd of hairstyles', () => {
  const styles = new Set(Object.values(NAGELN_RIVALS).map((r) => rollHairstyle(r.hairRoll, r.female).hairstyle));
  assert.ok(styles.has(HAIRSTYLE.MOHAWK) && styles.has(HAIRSTYLE.DREADS) && styles.has(HAIRSTYLE.PLAIN), [...styles].join());
});

// --- 2. Barista ----------------------------------------------------------------------------------------------------
/** Runs the rush with a player: reaction error `sigma`, memory of the usuals, `delay` s to serve or pick */
function playBarista(sigma, seed, { memory = true, delay = 0.25 } = {}) {
  const g = createBarista(31), rand = seededRandom(seed);
  let target = null, step = null, guard = 0, wait = 0;
  while (!g.done && guard++ < 200000) {
    baristaStep(g, DT);
    if (g.step !== step) { step = g.step; target = null; wait = delay; }
    if (g.step === 'wait') continue;
    wait -= DT;
    if (g.step === 'pick') { if (wait <= 0) baristaPick(g, memory ? g.work.guest.drink : 'ask'); continue; }
    if (g.step === 'serve') { if (wait <= 0) baristaAction(g); continue; }
    if (g.stepT < BARISTA.lead) continue;
    const v = baristaGauge(g);
    if (target === null) target = Math.max(0.02, Math.min(0.98, (v.lo + v.hi) / 2 + gauss(rand) * sigma));
    if (v.value >= target) baristaAction(g);
  }
  assert.ok(g.done, 'the rush ends');
  return g;
}
const meanBarista = (sigma, opts) => { let sum = 0; for (let s = 1; s <= 30; s++) sum += baristaScore(playBarista(sigma, s * 71, opts)); return sum / 30; };

test('barista: the five drinks of the brief, milk drinks have two stations more, each with its window', () => {
  assert.deepEqual(DRINKS.map((d) => d.name).sort(), ['Cappuccino', 'Café crème', 'Espresso', 'Latte Macchiato', 'Schale'].sort());
  for (const d of DRINKS) {
    assert.equal(d.stations[0], 'grind');
    assert.equal(d.stations.at(-1), 'serve');
    assert.equal(d.stations.includes('steam'), !!d.steam);
  }
  assert.ok(drinkById('creme').pull[0] > drinkById('espresso').pull[1], 'a crème runs longer than an espresso');
});

test('barista: only the station at work takes the press, and a late grinder runs over', () => {
  const g = createBarista(3);
  baristaStep(g, RUSH[0].arriveT + DT);
  assert.equal(g.step, 'grind');
  assert.equal(baristaAction(g, 'pull'), false, 'not the machine yet');
  assert.equal(baristaAction(g, 'grind'), true);
  assert.equal(g.step, 'tamp');
  baristaAction(g, 'tamp');
  assert.equal(g.step, 'pull');
  for (let i = 0; i < 70; i++) baristaStep(g, DT);
  assert.equal(g.step, 'serve', 'the cup ran over on its own');
  assert.equal(g.work.shares.at(-1), 0);
  assert.equal(baristaAction(g, 'serve'), true);
  assert.equal(g.served, 1);
  assert.ok(g.log[0].quality < 0.5);
});

test('barista: a guest who waits too long walks out; the order at work goes with them', () => {
  const g = createBarista(3);
  baristaStep(g, RUSH[0].arriveT + DT);
  assert.equal(g.work.guest.id, 0);
  for (let i = 0; i < (BARISTA.patience + 1) / DT; i++) baristaStep(g, DT);
  assert.ok(g.lost >= 1);
  assert.notEqual(g.work?.guest?.id, 0);
  assert.equal(g.log[0].lost, true);
  assert.ok(g.score < 0);
  assert.equal(baristaScore(g), 0, 'never below nothing');
});

test('barista: the usual: a regular tells it once; the right pick earns the bonus, a wrong one costs, asking gets no bonus', () => {
  const visits = RUSH.filter((g) => g.regular);
  for (const id of Object.keys(REGULARS)) {
    const mine = visits.filter((g) => g.regular === id);
    assert.equal(mine.length, 2);
    assert.ok(!mine[0].usual && mine[1].usual);
    assert.equal(mine[0].drink, mine[1].drink);
  }
  const pickFor = (id) => {
    const g = createBarista(3);
    g.t = RUSH[7].arriveT; g.arrived = 7;
    baristaStep(g, DT);
    assert.equal(g.step, 'pick');
    assert.equal(baristaAction(g), false, 'the stations wait for the pick');
    return [g, baristaPick(g, id)];
  };
  const [right, r] = pickFor('schale');
  assert.equal(r, 'right');
  assert.equal(right.step, 'grind');
  assert.equal(right.work.bonus, true);
  const [wrong, w] = pickFor('espresso');
  assert.equal(w, 'wrong');
  assert.equal(wrong.step, 'pick');
  assert.equal(wrong.work.bonus, false);
  assert.ok(wrong.score < 0);
  const [asked, a] = pickFor('ask');
  assert.equal(a, 'ask');
  assert.equal(asked.step, 'grind');
  assert.equal(asked.work.bonus, false);
  assert.equal(asked.asked, 1);
  assert.ok(meanBarista(0.04) > meanBarista(0.04, { memory: false }) + 100, 'remembering pays');
});

test('barista: the regulars gossip while you work', () => {
  const g = createBarista(3);
  for (let i = 0; i < 400; i++) baristaStep(g, DT);
  const who = new Set(g.chats.map((c) => c.who));
  assert.ok(g.chatSeq >= 3);
  assert.ok(who.size >= 2);
  assert.ok(GOSSIP.every(([id]) => id in REGULARS || id === 'margrith'), 'all from the tables');
});

test('barista: the medals: a steady hand gold, a fair one silver, a shaky one bronze', () => {
  const M = BARISTA_MISSION.medals;
  const steady = meanBarista(0.02), fair = meanBarista(0.06), shaky = meanBarista(0.13, { delay: 0.8, memory: false });
  assert.ok(steady > fair && fair > shaky, `${steady} ${fair} ${shaky}`);
  assert.equal(medalFor(steady, M, true), 'gold', `steady ${steady}`);
  assert.equal(medalFor(fair, M, true), 'silver', `fair ${fair}`);
  assert.equal(medalFor(shaky, M, true), 'bronze', `shaky ${shaky}`);
  assert.equal(medalFor(0, M, true), null);
  const done = playBarista(0.02, 9);
  assert.equal(done.served + done.lost, RUSH.length);
  assert.match(BARISTA_MISSION.summary({ game: done })[0], /orders served/);
});

test('the locations file names both places', () => {
  const doc = JSON.parse(readFileSync(new URL('../docs/missions-locations.json', import.meta.url), 'utf8'));
  for (const [id, spot] of [['nageln-tijuana', TIJUANA], ['barista-kafi-klatsch', KAFI]]) {
    const m = doc.missions.find((x) => x.id === id);
    assert.ok(m, id);
    assert.ok(Math.hypot(m.ort.x - spot.door.x, m.ort.z - spot.door.z) < 1);
    assert.ok(m.unsicherheit);
  }
});
