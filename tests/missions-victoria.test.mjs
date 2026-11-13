import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  VICTORIA_MISSIONS, VICTORIA_MISSION, VICTORIA, CHORES, CHORE_KEYS, HOUSEKEEPING, createHousekeeping, hkStep, hkPick, hkStroke, hkOpen, hkAllowed, hkProgress,
  DISHES, KITCHEN, KITCHEN_ORDERS, createKitchen, kitchenStep, kitchenPress,
  LINEN, LAUNDRY, createLaundry, laundrySort, laundryStep, sortWindow, victoriaScore
} from '../js/missions-data-victoria.js';
import { seededRandom } from '../js/missions-data-local.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { medalFor, missionMedals, missionPin } from '../js/missions-progress.js';

// (js/missions-data-victoria.js is three.js-free: the three games run on synthetic frames here)
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

// --- Bots ------------------------------------------------------------------------------------------------------------
/** Housekeeping at `rate` alternating strokes a second; `pause` s lost on each new chore */
function playHousekeeping(rate, pause = 0.3) {
  const g = createHousekeeping();
  let next = 0, side = 1, chore = null, t = 0;
  for (let i = 0; i < 4000 && !g.finished; i++) {
    t += DT;
    hkStep(g, DT);
    if (g.phase !== 'clean') continue;
    if (g.chore !== chore) { chore = g.chore; next = t + pause; }
    if (t >= next) { side = -side; hkStroke(g, side); chore = g.chore; next = t + 1 / rate; }
  }
  return g;
}
/** The kitchen: puts orders on free burners at once; plates at the doneness `aim` with a timing error of `sd` s */
function playKitchen(aim, sd, seed = 3) {
  const rand = seededRandom(seed), g = createKitchen();
  const plan = Array(KITCHEN.burners).fill(null);
  for (let i = 0; i < 4000 && !g.finished; i++) {
    kitchenStep(g, DT);
    g.pans.forEach((p, b) => {
      if (!p) { plan[b] = null; if (g.queue.length) kitchenPress(g, b); return; }
      if (plan[b] === null) plan[b] = aim + gauss(rand) * sd / p.cook;
      if (p.d >= plan[b]) { kitchenPress(g, b); plan[b] = null; }
    });
  }
  return g;
}
/** The Lingerie: sorts after `react` s, wrong with `err`; steers against the sheet's offset with gain `gain` and a lag */
function playLaundry(react, err, gain, lag, seed = 4) {
  const rand = seededRandom(seed), g = createLaundry();
  const seen = [];
  for (let i = 0; i < 6000 && !g.finished; i++) {
    if (g.phase === 'sort' && g.itemT >= react) laundrySort(g, (rand() < err) !== LINEN[g.item].white ? -1 : 1);
    seen.push(g.off);
    const o = seen[Math.max(0, seen.length - 1 - Math.round(lag / DT))];
    g.steer = g.phase === 'mangle' ? Math.max(-1, Math.min(1, -o * gain)) : 0;
    laundryStep(g, DT);
  }
  return g;
}
const shift = (hk, k, l) => victoriaScore({ hk, kitchen: k, laundry: l });

// --- The mission -----------------------------------------------------------------------------------------------------
test('the Victoria shift is registered, by points, on foot, with its pin apart from every other mission', () => {
  assert.deepEqual(VICTORIA_MISSIONS.map((m) => m.id), ['victoria-hotel']);
  const m = VICTORIA_MISSION;
  assert.equal(getMission(m.id), m);
  assert.ok(MISSIONS.includes(m));
  assert.deepEqual(m.features, ['victoria']);
  assert.ok(m.scoreMode);
  assert.equal(m.mode, 'person');
  const l = missionMedals(m);
  assert.ok(l.gold > l.silver && l.silver > l.bronze);
  assert.equal(m.score(m.createState()), 0);
  assert.deepEqual(m.objectives.map((o) => o.id), ['enter', 'housekeeping', 'kitchen', 'laundry']);
  const pin = missionPin(m);
  for (const o of MISSIONS) if (o !== m) { const p = missionPin(o); assert.ok(Math.hypot(p.x - pin.x, p.z - pin.z) > 30, `${m.id} vs ${o.id}`); }
  assert.ok(m.icon);
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), new RegExp(`case '${m.icon}'`));
  const html = readFileSync(new URL('../play.html', import.meta.url), 'utf8');
  for (const f of ['missions-data-victoria.js', 'missions-victoria.js']) assert.ok(html.includes(`./js/${f}`), f);
  const doc = JSON.parse(readFileSync(new URL('../docs/missions-locations.json', import.meta.url), 'utf8'));
  assert.ok(doc.missions.some((x) => x.id === m.id), 'listed in docs/missions-locations.json');
});

test('the staff door is at the Victoria\'s south front: the door just outside the walls, the start on open ground', () => {
  const victoria = DAVOS_DATA.buildings.find((b) => b.id === 'w117012157');
  assert.ok(victoria);
  assert.ok(!inRing(VICTORIA.door.x, VICTORIA.door.z, victoria.ring));
  assert.ok(inRing(VICTORIA.door.x, VICTORIA.door.z - 2, victoria.ring), 'the wall is right behind the door');
  assert.ok(!inBuilding(VICTORIA.start.x, VICTORIA.start.z));
  // the way from the start to the door is free
  for (let k = 0; k <= 1; k += 0.05) {
    const x = VICTORIA.start.x + (VICTORIA.door.x - VICTORIA.start.x) * k, z = VICTORIA.start.z + (VICTORIA.door.z - VICTORIA.start.z) * k;
    assert.ok(!inBuilding(x, z), `free at ${k}`);
  }
});

test('the first step waits for the player on foot at the door', () => {
  const enter = VICTORIA_MISSION.objectives[0], state = VICTORIA_MISSION.createState();
  assert.equal(enter.check({ mode: 'person', ...VICTORIA.start }, state).done, false);
  assert.equal(enter.check({ mode: 'person', x: VICTORIA.door.x, z: VICTORIA.door.z }, state).done, true);
  assert.equal(enter.check({ mode: 'car', x: VICTORIA.door.x, z: VICTORIA.door.z }, state).done, false);
});

// --- Housekeeping ----------------------------------------------------------------------------------------------------
test('housekeeping: a stroke to the same side twice does nothing, the chore fills with alternating strokes', () => {
  const g = createHousekeeping();
  assert.equal(hkPick(g, 'bath'), 'pick');
  assert.equal(hkStroke(g, 1), 'stroke');
  assert.equal(hkStroke(g, 1), 'same');
  assert.equal(hkProgress(g, 'bath'), 1 / CHORES.bath.strokes);
  let side = 1, r;
  for (let i = 1; i < CHORES.bath.strokes; i++) { side = -side; r = hkStroke(g, side); }
  assert.equal(r, 'chore');
  assert.ok(g.done.includes('bath'));
  assert.equal(g.score, CHORES.bath.points);
});

test('housekeeping: the chocolate waits for the bed; a stroke with nothing picked takes the next open chore', () => {
  const g = createHousekeeping();
  assert.equal(hkPick(g, 'chocolate'), 'blocked');
  assert.equal(hkAllowed(g, 'chocolate'), false);
  assert.equal(hkPick(g, 'minibar'), null, 'no minibar in room 204');
  hkStroke(g, 1);
  assert.equal(g.chore, 'bed');
  assert.deepEqual(CHORE_KEYS, ['bed', 'towels', 'bath', 'mirror', 'bin', 'minibar', 'chocolate']);
});

test('housekeeping: when the guest comes back the room ends as it is; the next room comes after the inspection', () => {
  const g = createHousekeeping();
  for (let i = 0; i < Math.ceil(HOUSEKEEPING.time[0] / DT) + 2; i++) hkStep(g, DT);
  assert.equal(g.phase, 'inspect');
  assert.equal(g.results[0].done, 0);
  assert.equal(g.results[0].bonus, 0);
  for (let i = 0; i < Math.ceil(HOUSEKEEPING.inspect / DT) + 2; i++) hkStep(g, DT);
  assert.equal(g.room, 1);
  assert.equal(g.phase, 'clean');
  assert.deepEqual(hkOpen(g), HOUSEKEEPING.rooms[1].chores);
});

test('housekeeping: a quick hand turns both rooms round with time to spare, a slow one leaves chores undone', () => {
  const quick = playHousekeeping(7.5), slow = playHousekeeping(2.6, 0.6);
  assert.ok(quick.finished && slow.finished);
  assert.ok(quick.results.every((r) => r.done === r.of && r.bonus > HOUSEKEEPING.allDone));
  assert.ok(slow.results.some((r) => r.done < r.of));
  assert.ok(quick.score > slow.score + 300, `${quick.score} vs ${slow.score}`);
});

// --- The kitchen -----------------------------------------------------------------------------------------------------
test('kitchen: a burner key puts the next order on, the same key plates it; the green pays most, too long burns', () => {
  const g = createKitchen();
  kitchenStep(g, DT);
  assert.equal(g.queue.length, 1);
  assert.equal(kitchenPress(g, 1), 'place');
  assert.equal(kitchenPress(g, 0), null, 'nothing waiting');
  const pan = g.pans[1];
  while (pan.d < 1) kitchenStep(g, DT);
  assert.equal(kitchenPress(g, 1), 'plate');
  assert.ok(g.served[0].points > KITCHEN.points.dish * 0.85);
  // a pan left alone burns and is cleared
  for (let i = 0; i < 200 && !g.queue.length; i++) kitchenStep(g, DT);
  kitchenPress(g, 2);
  const before = g.score;
  for (let i = 0; i < 600 && g.pans[2]; i++) kitchenStep(g, DT);
  assert.equal(g.pans[2], null);
  assert.equal(g.burnt, 1);
  assert.ok(g.score < before);
});

test('kitchen: every order comes; plated early is raw, plated late is dark', () => {
  assert.ok(KITCHEN_ORDERS.every((o) => DISHES[o.dish]));
  const g = createKitchen();
  kitchenStep(g, DT);
  kitchenPress(g, 0);
  for (let i = 0; i < 30; i++) kitchenStep(g, DT);
  kitchenPress(g, 0);
  assert.equal(g.served[0].points, KITCHEN.points.raw);
  const steady = playKitchen(1.01, 0.15), late = playKitchen(1.25, 0.2);
  assert.ok(steady.finished && late.finished);
  assert.equal(steady.served.length, KITCHEN_ORDERS.length);
  assert.ok(steady.score > late.score + 300, `${steady.score} vs ${late.score}`);
});

// --- The Lingerie ----------------------------------------------------------------------------------------------------
test('laundry: whites left, colours right; a coloured thing in the whites turns the sheets pink, a dawdle drops it', () => {
  const g = createLaundry();
  assert.equal(laundrySort(g, -1), 'right'); // the bed sheet
  assert.equal(laundrySort(g, -1), 'pink'); // the red napkin
  assert.ok(g.pink);
  assert.equal(laundrySort(g, 1), 'grey'); // the pillowcase
  const before = g.sorted.length;
  for (let i = 0; i < Math.ceil(sortWindow(g) / DT) + 2; i++) laundryStep(g, DT);
  assert.equal(g.sorted.length, before + 1);
  assert.equal(g.sorted.at(-1).points, LAUNDRY.points.drop);
});

test('laundry: an unsteered sheet runs into the rollers, a steady hand feeds them crisp', () => {
  const lazy = playLaundry(0.6, 0, 0, 0), steady = playLaundry(0.5, 0, 8, 0.1);
  assert.ok(lazy.finished && steady.finished);
  assert.equal(lazy.sheets.length, LAUNDRY.sheets);
  assert.ok(lazy.sheets.some((s) => s.jam));
  assert.ok(steady.sheets.every((s) => !s.jam && s.quality > 0.9), JSON.stringify(steady.sheets));
  assert.ok(!steady.pink);
});

// --- The medals ------------------------------------------------------------------------------------------------------
test('the medals: a quick and steady hand gold, a fair one silver, a slow one bronze', () => {
  const m = VICTORIA_MISSION;
  const gold = shift(playHousekeeping(7, 0.3), playKitchen(1.01, 0.2), playLaundry(0.5, 0, 8, 0.1));
  const silver = shift(playHousekeeping(4.5, 0.45), playKitchen(1.0, 0.7), playLaundry(0.9, 0.08, 4, 0.25));
  const bronze = shift(playHousekeeping(3, 0.6), playKitchen(1.05, 1.3), playLaundry(1.3, 0.15, 1.6, 0.35));
  console.log('victoria bots', { gold, silver, bronze });
  assert.equal(medalFor(gold, m.medals, true), 'gold', `${gold}`);
  assert.equal(medalFor(silver, m.medals, true), 'silver', `${silver}`);
  assert.equal(medalFor(bronze, m.medals, true), 'bronze', `${bronze}`);
});
