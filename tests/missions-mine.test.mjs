import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  MINE, MINE_MISSION, TOUR_MISSION, MINE_MISSIONS, ADITS, MINE_ADIT, MINE_DOOR, TOUR_STATIONS, createMine, createShift, stepShift,
  createWalker, stepWalk, freeAt, railAt, botShiftInput, shiftScore, mineMaxScore, mineSeedOfDay, stationPoint, wayTo
} from '../js/missions-data-mine.js';
import { parseAdit, ADIT_IDS } from '../js/silberberg-asset.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

// (js/missions-data-mine.js is three.js-free: the galleries of the FHNW scans, the hammer, the hunt and the lamp run on
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

test('the mine of a seed: the same veins for the same seed, the three kinds on the walls, deeper is richer', () => {
  const a = createMine(HILFS, 77), b = createMine(HILFS, 77);
  assert.deepEqual(a.veins, b.veins);
  assert.notDeepEqual(a.veins, createMine(HILFS, 78).veins);
  const kinds = a.veins.reduce((o, v) => ((o[v.kind] = (o[v.kind] || 0) + 1), o), {});
  assert.deepEqual(kinds, MINE.veins);
  for (const v of a.veins) {
    assert.ok(a.floor.at(v.sx, v.sz), 'a floor to stand on before it');
    assert.ok(Math.hypot(v.x - v.sx, v.z - v.sz) < MINE.reach - 0.5, 'within reach from there');
    assert.ok(v.depth >= 12, 'not at the portal');
  }
  const mean = (k) => { const vs = a.veins.filter((v) => v.kind === k); return vs.reduce((s, v) => s + v.depth, 0) / vs.length; };
  assert.ok(mean('galena') > mean('barren'), 'galena lies deeper');
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

test('the hammer breaks ore into the basket, a full basket takes no more, the hunt takes the basket', () => {
  const m = createMine(HILFS, 11);
  const g = createShift(m);
  const v = m.veins.find((q) => q.kind === 'galena');
  g.x = v.sx; g.z = v.sz; g.y = m.floor.at(v.sx, v.sz).y; g.heading = Math.atan2(v.x - g.x, v.z - g.z);
  g.hunt.s = 200; // (out of the way)
  const ev = run(g, { strike: true }, MINE.strikeS * 2 + 0.05);
  assert.equal(ev.filter((e) => e.type === 'ore').length, 2);
  assert.equal(g.basket.kg, MINE.chunk * 2);
  assert.ok(Math.abs(g.basket.pts - g.basket.kg * MINE.ores.galena.value * v.grade) < 1e-9);
  g.basket.kg = MINE.basket;
  assert.ok(run(g, { strike: true }, 1).some((e) => e.type === 'full'));
  // next to the hunt: the basket empties into it
  g.basket = { galena: 5, sphalerite: 0, barren: 0, kg: 5, pts: 50 };
  const h = railAt(m.rail, 40);
  g.hunt.s = 40; g.x = h.x + h.tx * 1.2; g.z = h.z + h.tz * 1.2;
  assert.ok(run(g, {}, DT).some((e) => e.type === 'load'));
  assert.equal(g.hunt.kg, 5); assert.equal(g.basket.kg, 0);
});

test('pushed from behind or pulled from its portal side, the hunt brings its ore to day; the lamp going out ends it', () => {
  const m = createMine(HILFS, 3);
  for (const side of [1, -1]) {
    const g = createShift(m);
    Object.assign(g.hunt, { s: 14, kg: 10, pts: 100, galena: 10 });
    g.entered = true;
    const h = railAt(m.rail, 14 + side * (MINE.huntHalf + MINE.radius + 0.1));
    g.x = h.x; g.z = h.z;
    g.heading = side > 0 ? Math.atan2(-h.tx, -h.tz) : Math.atan2(h.tx, h.tz); // (facing the portal / the hunt)
    // (the player steers along the gallery: facing the way out, or the hunt)
    const ev = [];
    for (let t = 0; t < 40 && !g.over && !ev.some((e) => e.type === 'deliver'); t += DT) {
      const r = railAt(m.rail, g.hunt.s);
      g.heading = side > 0 ? Math.atan2(r.x - r.tx * 3 - g.x, r.z - r.tz * 3 - g.z) : Math.atan2(r.x - g.x, r.z - g.z);
      ev.push(...stepShift(g, side > 0 ? { forward: 1 } : { back: 1 }, DT));
    }
    const d = ev.find((e) => e.type === 'deliver');
    assert.ok(d, side > 0 ? 'pushed out' : 'pulled out');
    assert.equal(shiftScore(g), 100);
    assert.equal(g.ore.galena, 10);
  }
  // the hunt is in the way: no walking through it
  const g = createShift(m);
  const start = g.hunt.s;
  g.heading = Math.atan2(railAt(m.rail, 10).x - g.x, railAt(m.rail, 10).z - g.z);
  run(g, { forward: 1 }, 2);
  assert.ok(g.hunt.s > start + 1, 'walking into it pushes it');
  // the lamp
  const l = createShift(m);
  l.lamp = MINE.lampLow + 0.5;
  const ev2 = run(l, {}, 60);
  assert.ok(ev2.some((e) => e.type === 'low'));
  assert.ok(ev2.some((e) => e.type === 'dark'));
  assert.equal(l.over, 'dark');
  assert.equal(shiftScore(l), 0);
});

test('a miner who knows the mine earns a medal on most days, never more than the mine holds', () => {
  const scores = [];
  for (let s = 1; s <= 7; s++) {
    const m = createMine(HILFS, s * 7919 + 20261101);
    const g = createShift(m);
    for (let t = 0; t < MINE.lamp + 5 && !g.over; t += DT) stepShift(g, botShiftInput(g), DT);
    assert.ok(g.over);
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
  st.shift.delivered = 321.4; st.shift.over = 'exit'; st.shift.trips = 2;
  const v = mine.check({}, st);
  assert.ok(v.done);
  assert.match(v.text, /321 pts out/);
  assert.equal(MINE_MISSION.score(st), 321);
  assert.match(MINE_MISSION.summary(st)[0], /in 2 trips/);
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
