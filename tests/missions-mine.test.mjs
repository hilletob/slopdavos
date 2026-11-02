import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MINE, MINE_MISSION, MINE_MISSIONS, MINE_ADIT, MINE_DOOR, generateMine, wallFaces, isCarved, createShift, stepShift, freeAt,
  botShiftInput, shiftScore, mineMaxScore, cellPath, mineSeedOfDay
} from '../js/missions-data-mine.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

// (js/missions-data-mine.js is three.js-free: the maze, the hammer, the hunt and the lamp run on plain steps here)

const DT = 1 / 30;
const run = (g, input, secs) => { const ev = []; for (let t = 0; t < secs && !g.over; t += DT) ev.push(...stepShift(g, input, DT)); return ev; };

test('the Silberberg mine is listed, all year, on foot, scored by points; its adit within the map', () => {
  assert.equal(getMission('silberberg-mine'), MINE_MISSION);
  assert.ok(MISSIONS.includes(MINE_MISSION));
  assert.deepEqual(MINE_MISSIONS, [MINE_MISSION]);
  assert.equal(MINE_MISSION.season, null);
  assert.equal(MINE_MISSION.mode, 'person');
  assert.ok(MINE_MISSION.scoreMode && MINE_MISSION.medals.gold > MINE_MISSION.medals.silver && MINE_MISSION.medals.silver > MINE_MISSION.medals.bronze);
  const [x0, z0, x1, z1] = DAVOS_DATA.meta.bounds;
  for (const p of [MINE_ADIT, MINE_DOOR, MINE_MISSION.start]) assert.ok(p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);
  assert.ok(Math.hypot(MINE_MISSION.start.x - MINE_DOOR.x, MINE_MISSION.start.z - MINE_DOOR.z) < 90, 'the start near the adit');
  assert.equal(mineSeedOfDay(new Date(2026, 10, 1)), 20261101);
});

test('the mine of a seed: the same layout for the same seed, 3–5 side drifts, veins of the three kinds in its walls', () => {
  const a = generateMine(77), b = generateMine(77);
  assert.deepEqual(a.list, b.list);
  assert.deepEqual(a.veins, b.veins);
  for (let seed = 1; seed < 60; seed++) {
    const m = generateMine(seed);
    assert.ok(m.branches.length >= 3 && m.branches.length <= 5, `seed ${seed}: ${m.branches.length} drifts`);
    for (let k = 0; k < MINE.mainCells; k++) assert.ok(isCarved(m, 0, k));
    // every cell is reachable from the portal
    for (const [i, k] of m.list) assert.ok(i === 0 && k === 0 || cellPath(m, [0, 0], [i, k]), `seed ${seed}: ${i},${k} reachable`);
    const kinds = m.veins.reduce((o, v) => ((o[v.kind] = (o[v.kind] || 0) + 1), o), {});
    assert.deepEqual(kinds, MINE.veins);
    // the veins sit on walls (a carved cell beside the rock), each on its own cell
    const faces = new Set(wallFaces(m).map((f) => `${f.i},${f.k},${f.d}`));
    for (const v of m.veins) assert.ok(faces.has(`${v.i},${v.k},${v.d}`));
    assert.equal(new Set(m.veins.map((v) => `${v.i},${v.k}`)).size, m.veins.length);
  }
});

test('the miner stays in the galleries: rock is rock', () => {
  const m = generateMine(5);
  const g = createShift(m);
  assert.ok(freeAt(m, g.x, g.z));
  assert.ok(!freeAt(m, 3.5, 6), 'beside the main gallery: rock (unless a drift)');
  g.heading = Math.PI / 2; // (towards +x: into the wall)
  g.z = 1.2 * MINE.cell; g.x = 0.5;
  run(g, { forward: 1 }, 2);
  assert.ok(g.x < MINE.cell / 2, 'stopped at the wall');
});

test('the hammer breaks ore into the basket, a full basket takes no more, the hunt takes the basket', () => {
  const m = generateMine(11);
  const g = createShift(m);
  const v = m.veins.find((q) => q.kind === 'galena');
  // in front of the spot, facing it
  g.x = v.x + v.nx * 0.9; g.z = v.z + v.nz * 0.9; g.heading = Math.atan2(v.x - g.x, v.z - g.z);
  g.entered = true;
  const ev = run(g, { strike: true }, MINE.strikeS * 2 + 0.05);
  const ore = ev.filter((e) => e.type === 'ore');
  assert.equal(ore.length, 2);
  assert.equal(g.basket.kg, MINE.chunk * 2);
  assert.ok(Math.abs(g.basket.pts - g.basket.kg * MINE.ores.galena.value * v.grade) < 1e-9);
  // full: the 16 kg basket
  g.basket.kg = MINE.basket;
  assert.ok(run(g, { strike: true }, 1).some((e) => e.type === 'full'));
  // next to the hunt: the basket empties into it
  g.basket = { galena: 5, sphalerite: 0, barren: 0, kg: 5, pts: 50 };
  g.x = 0.5; g.z = g.hunt.z + 1.2;
  const load = run(g, {}, DT);
  assert.ok(load.some((e) => e.type === 'load'));
  assert.equal(g.hunt.kg, 5); assert.equal(g.basket.kg, 0);
});

test('pushing the hunt out to the portal brings its ore to day; the lamp going out ends the shift', () => {
  const m = generateMine(3);
  const g = createShift(m);
  Object.assign(g.hunt, { z: 8, kg: 10, pts: 100, galena: 10 });
  g.entered = true;
  g.x = MINE.railX; g.z = 8 + MINE.huntHalf + MINE.radius + 0.05; g.heading = Math.PI; // (behind it, facing the portal)
  const ev = run(g, { forward: 1 }, 10);
  const d = ev.find((e) => e.type === 'deliver');
  assert.ok(d, 'delivered');
  assert.equal(d.pts, 100);
  assert.equal(shiftScore(g), 100);
  assert.equal(g.ore.galena, 10);
  assert.equal(g.over, 'exit', 'and out through the portal behind it');
  // the lamp
  const h = createShift(m);
  h.lamp = MINE.lampLow + 0.5;
  const ev2 = run(h, {}, 40);
  assert.ok(ev2.some((e) => e.type === 'low'));
  assert.ok(ev2.some((e) => e.type === 'dark'));
  assert.equal(h.over, 'dark');
  assert.equal(shiftScore(h), 0);
});

test('a miner who knows the mine earns a medal on most days, never more than the mine holds', () => {
  const scores = [];
  for (let s = 1; s <= 8; s++) {
    const m = generateMine(s * 7919 + 20261101);
    const g = createShift(m);
    for (let t = 0; t < 400 && !g.over; t += DT) stepShift(g, botShiftInput(g), DT);
    assert.ok(g.over);
    assert.ok(shiftScore(g) <= mineMaxScore(m) + 1);
    scores.push(shiftScore(g));
  }
  scores.sort((a, b) => a - b);
  const median = scores[4];
  assert.ok(medalFor(median, MINE_MISSION.medals, true), `median ${median}`);
  assert.ok(median < MINE_MISSION.medals.gold * 1.5, 'gold is not given away');
});

test('the mission: walk to the adit, then the shift; its summary', () => {
  const st = MINE_MISSION.createState();
  const [enter, mine] = MINE_MISSION.objectives;
  assert.equal(enter.check({ x: MINE_DOOR.x, z: MINE_DOOR.z }, st).done, true);
  assert.equal(mine.check({}, st).done, false);
  st.shift = createShift(generateMine(2));
  st.shift.delivered = 321.4; st.shift.over = 'exit'; st.shift.trips = 2;
  const v = mine.check({}, st);
  assert.ok(v.done);
  assert.match(v.text, /321 pts out/);
  assert.equal(MINE_MISSION.score(st), 321);
  assert.match(MINE_MISSION.summary(st)[0], /in 2 trips/);
});
