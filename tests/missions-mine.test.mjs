import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  MINE, MINE_MISSION, TOUR_MISSION, MINE_MISSIONS, ADITS, MINE_ADIT, MINE_DOOR, TOUR_STATIONS, createMine, createShift, stepShift,
  createWalker, stepWalk, freeAt, botShiftInput, shiftScore, mineMaxScore, mineSeedOfDay, stationPoint, wayTo, rayRock, nearestBin, veinInReach,
  GUIDE, GUIDE_SCRIPT, GUIDE_QUIZ, createGuide, stepGuide, answerQuiz
} from '../js/missions-data-mine.js';
import { parseAdit, ADIT_IDS } from '../js/silberberg-asset.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

// (js/missions-data-mine.js is three.js-free: the galleries of the FHNW scans, the hammer, the ore bins and the lamp run on
// plain steps here)

const DT = 1 / 30;
const load = (id) => { const b = fs.readFileSync(new URL(`../assets/silberberg/${id}.bin`, import.meta.url)); return parseAdit(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const HILFS = load('hilfsstollen'), DALV = load('dalvazzer');
const run = (g, input, secs) => { const ev = []; for (let t = 0; t < secs && !g.over; t += DT) ev.push(...stepShift(g, input, DT)); return ev; };

test('the Silberberg missions are listed, all year, on foot; the adits within the map', () => {
  assert.equal(getMission('silberberg-mine'), MINE_MISSION);
  assert.equal(getMission('silberberg-tour'), TOUR_MISSION);
  for (const m of MINE_MISSIONS) { assert.ok(MISSIONS.includes(m)); assert.equal(m.season, null); assert.equal(m.mode, 'person'); }
  assert.ok(MINE_MISSION.scoreMode && MINE_MISSION.medals.gold > MINE_MISSION.medals.silver && MINE_MISSION.medals.silver > MINE_MISSION.medals.bronze);
  assert.ok(!TOUR_MISSION.scoreMode && TOUR_MISSION.medals.gold < TOUR_MISSION.medals.silver, 'the tour is timed');
  const [x0, z0, x1, z1] = DAVOS_DATA.meta.bounds;
  for (const a of Object.values(ADITS)) for (const p of [a, a.door]) assert.ok(p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);
  assert.equal(MINE_ADIT, ADITS.hilfsstollen);
  assert.ok(Math.hypot(MINE_MISSION.start.x - MINE_DOOR.x, MINE_MISSION.start.z - MINE_DOOR.z) < 40, 'the start near the adit');
  assert.equal(mineSeedOfDay(new Date(2026, 10, 1)), 20261101);
});

test('the scans: closed galleries with a floor, rails from the portal through the Hilfsstollen, the stations on the floor', () => {
  for (const id of ADIT_IDS) {
    const a = id === 'dalvazzer' ? DALV : HILFS;
    assert.equal(a.header.id, id);
    // the asset sits where its adit is in the world
    assert.ok(Math.abs(a.header.origin[0] - ADITS[id].x) < 0.01 && Math.abs(a.header.origin[2] - ADITS[id].z) < 0.01);
    assert.ok(a.index.length % 3 === 0 && a.index.length > 3e4);
    for (const i of a.index) assert.ok(i < a.header.mesh.vertices);
    // a closed surface: every edge is shared by two triangles (nothing to see through)
    const edges = new Map();
    for (let t = 0; t < a.index.length; t += 3) for (let e = 0; e < 3; e++) {
      const u = a.index[t + e], v = a.index[t + ((e + 1) % 3)], k = u < v ? `${u},${v}` : `${v},${u}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
    let open = 0;
    for (const c of edges.values()) if (c < 2) open++;
    assert.ok(open / edges.size < 0.002, `${id}: ${open} open edges of ${edges.size}`);
    const near = (x, z) => { for (let dx = -1; dx <= 1; dx += 0.2) for (let dz = -1; dz <= 1; dz += 0.2) if (a.floor.at(x + dx, z + dz)) return true; return false; };
    for (const [name, st] of Object.entries(a.header.stations)) assert.ok(near(st[0], st[2]), `${id}: ${name} off the floor`);
    for (const [x, , z] of a.header.rail) assert.ok(a.floor.at(x, z), `${id}: the rails on the floor`);
  }
  const len = createMine(HILFS, 1).rail.length;
  assert.ok(len > 300 && len < 380, `the Hilfsstollen's rails: ${len} m`);
});

test('the mine of a seed: the same veins for the same seed, the three kinds on the rock itself, deeper is richer', () => {
  const a = createMine(HILFS, 77), b = createMine(HILFS, 77);
  assert.deepEqual(a.veins, b.veins);
  assert.notDeepEqual(a.veins, createMine(HILFS, 78).veins);
  const kinds = a.veins.reduce((o, v) => ((o[v.kind] = (o[v.kind] || 0) + 1), o), {});
  assert.deepEqual(kinds, MINE.veins);
  for (const v of a.veins) {
    assert.ok(a.floor.at(v.sx, v.sz), 'a floor to stand on before it');
    assert.ok(Math.hypot(v.x - v.sx, v.z - v.sz) < MINE.reach - 0.3, 'within reach from there');
    assert.ok(v.depth >= 15, 'not at the portal');
    // on the wall: a ray back from the gallery meets the rock at the vein
    const hit = rayRock(HILFS, v.x + v.nx * 0.5, v.y + v.ny * 0.5, v.z + v.nz * 0.5, -v.nx, -v.ny, -v.nz, 1);
    assert.ok(hit && Math.abs(hit.d - 0.5) < 0.05, `vein ${v.id} on the rock: ${hit?.d}`);
    const f = a.floor.at(v.sx, v.sz);
    assert.ok(v.y > f.y + 0.4 && v.y < f.y + 1.9, 'at the height of a chest');
  }
  const mean = (k) => { const vs = a.veins.filter((v) => v.kind === k); return vs.reduce((s, v) => s + v.depth, 0) / vs.length; };
  assert.ok(mean('galena') > mean('barren'), 'galena lies deeper');
  // the ore bins: on the floor along the gallery, out of the way
  assert.equal(a.bins.length, MINE.bins.length);
  for (const bin of a.bins) assert.ok(a.floor.at(bin.x, bin.z) || [0.2, 0.4].some((d) => a.floor.at(bin.x + bin.nx * d, bin.z + bin.nz * d)), `bin ${bin.id} by the floor`);
});

test('the miner walks on the floor: rock is rock, the narrow gallery is walkable to its far end', () => {
  const w = createWalker(HILFS);
  assert.ok(freeAt(HILFS.floor, w.x, w.z));
  assert.ok(!freeAt(HILFS.floor, w.x + 30, w.z + 30), 'beside the gallery: rock');
  // following the way to the far end, step by step
  const mine = createMine(HILFS, 3);
  const end = stationPoint(HILFS, TOUR_STATIONS.end);
  for (let t = 0; t < 240; t += DT) {
    const way = wayTo(mine, w, end);
    if (!way || way.dist < 1) break;
    w.heading = Math.atan2(way.x - w.x, way.z - w.z);
    stepWalk(w, HILFS, { forward: 1 }, DT);
  }
  assert.ok(Math.hypot(w.x - end.x, w.z - end.z) < 2.5, `at the far end: ${w.x.toFixed(1)}, ${w.z.toFixed(1)}`);
  assert.ok(w.entered && !w.out);
});

test('the hammer breaks ore into the basket, a full basket takes no more, an ore bin takes the basket', () => {
  const m = createMine(HILFS, 11);
  const g = createShift(m);
  const v = m.veins.find((q) => q.kind === 'galena');
  g.x = v.sx; g.z = v.sz; g.y = m.floor.at(v.sx, v.sz).y; g.heading = Math.atan2(v.x - g.x, v.z - g.z);
  assert.equal(veinInReach(m, g.x, g.z, g.heading), v, 'in reach, facing it');
  assert.equal(veinInReach(m, g.x, g.z, g.heading + Math.PI), null, 'not with its back to it');
  const ev = run(g, { strike: true }, MINE.strikeS * 2 + 0.05);
  assert.equal(ev.filter((e) => e.type === 'ore').length, 2);
  assert.equal(g.basket.kg, MINE.chunk * 2);
  assert.ok(Math.abs(g.basket.pts - g.basket.kg * MINE.ores.galena.value * v.grade) < 1e-9);
  g.basket.kg = MINE.basket;
  assert.ok(run(g, { strike: true }, 1).some((e) => e.type === 'full'));
  // at a bin: the basket empties into it, and counts
  g.basket = { galena: 5, sphalerite: 0, barren: 0, kg: 5, pts: 50 };
  const bin = m.bins[1];
  g.x = bin.x + bin.nx * 0.6; g.z = bin.z + bin.nz * 0.6;
  const d = run(g, {}, DT).find((e) => e.type === 'dump');
  assert.ok(d && d.kg === 5);
  assert.equal(bin.kg, 5); assert.equal(g.basket.kg, 0); assert.equal(shiftScore(g), 50); assert.equal(g.ore.galena, 5);
  // the nearest bin on foot
  assert.equal(nearestBin(m, { x: bin.x, z: bin.z }).bin, bin);
});

test('walking out counts the basket and a fifth more; the lamp going out inside loses the basket', () => {
  const m = createMine(HILFS, 3);
  const g = createShift(m);
  g.delivered = 100;
  g.basket = { galena: 2.5, sphalerite: 0, barren: 0, kg: 2.5, pts: 30 };
  // walking out of the portal, from a few metres in
  const [ox, oz] = HILFS.header.portal.out;
  run(g, { forward: 1 }, 4);
  assert.ok(g.entered, 'in');
  const ev = [];
  for (let t = 0; t < 12 && !g.over; t += DT) {
    const way = wayTo(m, g, { x: 0, z: 0 });
    g.heading = way && way.dist > 1 ? Math.atan2(way.x - g.x, way.z - g.z) : Math.atan2(ox, oz);
    ev.push(...stepShift(g, { forward: 1 }, DT));
  }
  const e = ev.find((q) => q.type === 'exit');
  assert.ok(e, 'out');
  assert.equal(g.over, 'exit');
  assert.equal(shiftScore(g), Math.round(130 * (1 + MINE.exitBonus)));
  // the lamp
  const l = createShift(m);
  l.delivered = 80; l.basket.kg = 10; l.basket.pts = 100;
  l.lamp = MINE.lampLow + 0.5;
  const ev2 = run(l, {}, 60);
  assert.ok(ev2.some((q) => q.type === 'low'));
  assert.ok(ev2.some((q) => q.type === 'dark'));
  assert.equal(l.over, 'dark');
  assert.equal(shiftScore(l), 80, 'the basket stays inside, no bonus');
});

test('a miner who knows the mine earns a medal on most days and walks out in time, never more than the mine holds', () => {
  const scores = [];
  for (let s = 1; s <= 7; s++) {
    const m = createMine(HILFS, s * 7919 + 20261101);
    const g = createShift(m);
    for (let t = 0; t < MINE.lamp + 5 && !g.over; t += DT) stepShift(g, botShiftInput(g), DT);
    assert.equal(g.over, 'exit', `seed ${s}: out in time`);
    assert.ok(shiftScore(g) <= mineMaxScore(m) + 1);
    scores.push(shiftScore(g));
  }
  scores.sort((a, b) => a - b);
  const median = scores[3];
  assert.ok(medalFor(median, MINE_MISSION.medals, true), `median ${median} (${scores})`);
  assert.ok(median < MINE_MISSION.medals.gold, `gold is not given away: ${scores}`);
});

test('the ore mission: walk to the adit, then the shift; its summary', () => {
  const st = MINE_MISSION.createState();
  const [enter, mine] = MINE_MISSION.objectives;
  assert.equal(enter.check({ x: MINE_DOOR.x, z: MINE_DOOR.z }, st).done, true);
  assert.equal(mine.inside, 'hilfsstollen');
  assert.equal(mine.check({}, st).done, false);
  st.shift = createShift(createMine(HILFS, 2));
  st.shift.delivered = 321.4; st.shift.bonus = 64; st.shift.over = 'exit';
  const v = mine.check({}, st);
  assert.ok(v.done);
  assert.match(v.text, /^385 pts · basket 0\/20 kg/);
  assert.equal(MINE_MISSION.score(st), 385);
  assert.match(MINE_MISSION.summary(st)[0], /^Mined: /);
  assert.match(MINE_MISSION.summary(st)[1], /\+64 pts$/);
});

test('the tour: Dalvazzer to St Barbara and the stope, out, up to the Hilfsstollen, its stations to the far end', () => {
  const ids = TOUR_MISSION.objectives.map((o) => o.id);
  assert.deepEqual(ids, ['dalvazzer', 'barbara', 'stope', 'out', 'hilfsstollen', 'y1813', 'crossing', 'y1818', 'end']);
  assert.deepEqual(TOUR_MISSION.objectives.map((o) => o.inside ?? null), [null, 'dalvazzer', 'dalvazzer', 'dalvazzer', null, 'hilfsstollen', 'hilfsstollen', 'hilfsstollen', 'hilfsstollen']);
  // every station is reachable on foot from its portal
  for (const [key, st] of Object.entries(TOUR_STATIONS)) {
    const a = st.adit === 'dalvazzer' ? DALV : HILFS;
    const p = stationPoint(a, st);
    const m = createMine(a, 1);
    const w = createWalker(a);
    for (let t = 0; t < 200; t += DT) {
      const way = wayTo(m, w, p);
      if (!way || Math.hypot(w.x - p.x, w.z - p.z) < st.r * 0.8) break;
      w.heading = Math.atan2(way.x - w.x, way.z - w.z);
      stepWalk(w, a, { forward: 1 }, DT);
    }
    assert.ok(Math.hypot(w.x - p.x, w.z - p.z) < st.r, `${key}: ${Math.hypot(w.x - p.x, w.z - p.z).toFixed(1)} m short`);
  }
  // a station's check: by the walker inside its adit
  const s = TOUR_MISSION.createState();
  const barbara = TOUR_MISSION.objectives[1];
  s.walk = { adit: 'dalvazzer', ...createWalker(DALV) };
  s.points = { barbara: stationPoint(DALV, TOUR_STATIONS.barbara) };
  assert.equal(barbara.check({}, s).done, false);
  Object.assign(s.walk, s.points.barbara);
  assert.equal(barbara.check({}, s).done, true);
  // out of the Dalvazzer: back through its portal
  const w = createWalker(DALV);
  for (let t = 0; t < 12; t += DT) stepWalk(w, DALV, { forward: 1 }, DT);
  assert.ok(w.entered, 'in');
  w.heading += Math.PI;
  for (let t = 0; t < 15 && !w.out; t += DT) stepWalk(w, DALV, { forward: 1 }, DT);
  assert.ok(w.out, 'and out');
});

test('Jöri leads: ahead to the station, waiting for a visitor who lags, hurrying after one who runs ahead', () => {
  const nav = createMine(HILFS, 1);
  const goal = stationPoint(HILFS, TOUR_STATIONS.y1813);
  const g = createGuide(HILFS, nav);
  const w = createWalker(HILFS);
  // the visitor stands still: he walks on, then waits and calls
  let calls = 0;
  for (let t = 0; t < 20; t += DT) if (stepGuide(g, w, HILFS, goal, DT) === 'call') calls++;
  assert.ok(g.waiting, 'waiting for the visitor');
  assert.ok(Math.hypot(g.x - w.x, g.z - w.z) > GUIDE.wait - 1 && Math.hypot(g.x - w.x, g.z - w.z) < GUIDE.wait + 2);
  assert.equal(calls, 2, 'he calls, now and then');
  // the visitor follows: he leads all the way and stops short of the station
  for (let t = 0; t < 120; t += DT) {
    const way = wayTo(nav, w, g);
    if (way && way.dist > 2) { w.heading = Math.atan2(way.x - w.x, way.z - w.z); stepWalk(w, HILFS, { forward: 0.6 }, DT); }
    stepGuide(g, w, HILFS, goal, DT);
  }
  const d = Math.hypot(g.x - goal.x, g.z - goal.z);
  assert.ok(d < GUIDE.lead + 1, `at the station: ${d.toFixed(1)} m`);
  assert.ok(HILFS.floor.at(g.x, g.z), 'on the floor');
  // while he talks he stands, facing the visitor
  const x = g.x;
  stepGuide(g, w, HILFS, { x: 0, z: 0 }, 1, { hold: true });
  assert.equal(g.x, x);
});

test("Jöri's script and questions: a line for every station, the questions wait, a wrong answer costs 15 s", () => {
  for (const o of TOUR_MISSION.objectives) assert.ok(GUIDE_SCRIPT[o.id], `${o.id} has lines`);
  for (const [id, q] of Object.entries(GUIDE_QUIZ)) {
    assert.ok(q.answer >= 0 && q.answer < q.options.length);
    assert.ok(Object.values(GUIDE_SCRIPT).some((s) => [...(s.arrive || []), ...(s.start || [])].some((l) => l.quiz === id)), `${id} is asked`);
  }
  const events = Object.values(GUIDE_SCRIPT).flatMap((s) => [...(s.arrive || []), ...(s.start || []), ...(s.greet || [])]).map((l) => l.event).filter(Boolean);
  assert.deepEqual(events, ['rumble', 'draught', 'relight']);
  const st = TOUR_MISSION.createState();
  st.walk = { adit: 'dalvazzer', ...createWalker(DALV) };
  st.points = { stope: stationPoint(DALV, TOUR_STATIONS.stope) };
  Object.assign(st.walk, st.points.stope);
  const stope = TOUR_MISSION.objectives.find((o) => o.id === 'stope');
  assert.equal(answerQuiz(st, 0), null, 'nothing asked yet');
  st.quiz.pending = 'silver';
  const v = stope.check({}, st);
  assert.equal(v.done, false, 'the station waits for the answer');
  assert.match(v.hint, /1, 2 or 3/);
  assert.deepEqual(answerQuiz(st, 0), { id: 'silver', right: false, say: GUIDE_QUIZ.silver.wrong });
  assert.equal(st.penaltyMs, GUIDE.penaltyMs);
  assert.equal(stope.check({}, st).done, true);
  st.quiz.pending = 'people';
  assert.equal(answerQuiz(st, GUIDE_QUIZ.people.answer).right, true);
  assert.equal(st.penaltyMs, GUIDE.penaltyMs, 'a right answer costs nothing');
  assert.deepEqual(TOUR_MISSION.summary(st), ["Jöri's questions: 1 of 2 right (+15 s)"]);
});
