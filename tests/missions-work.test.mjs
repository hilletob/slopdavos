import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORK_MISSIONS, mulberry32, createGrid, forCellsInBox, gridFraction, depositHeap, makeFrame, makeRoute, routePoint, projectRoute,
  MASK_TARGET, MASK_BLOCKED,
  SHOVEL, SHOVEL_START, createShovelGrid, createShovel, stepShovel, shovelCleared, throwTarget, shovelBotPath,
  BLOWER, BLOWER_CARS, createBlowerRoute, createBlowerGrid, stepBlower, blowerCleared, blowerHitsCar, chuteLanding, augerTake,
  MOWER, createLawnGrid, stepMower, lawnMown, mowerBotPath,
  GARBAGE, GARBAGE_MISSION, garbageStops, stepGarbage,
  ROSES, ROSES_START, ALPINE_ROSES_MISSION, createRoseBushes, nearestBush, stepPicking,
  MUSHROOMS, MUSHROOM_KINDS, MUSHROOM_MISSION, createMushrooms, nearestMushroom, mushroomControl
} from '../js/missions-data-work.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor, missionMedals } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

// (js/missions-data-work.js is three.js-free: the maps, the vehicles' work and the bots run on synthetic frames here)

const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 0.1, t: 0, ...over });
const DT = 1 / 30;
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const inBuilding = (x, z) => DAVOS_DATA.buildings.some((b) => Math.abs(b.ring[0] - x) < 200 && Math.abs(b.ring[1] - z) < 200 && inRing(b.ring, x, z));

test('the six work missions are registered, complete, their medals in order', () => {
  assert.deepEqual(WORK_MISSIONS.map((m) => m.id), ['snow-shovel', 'snow-blower', 'lawn-mowing', 'garbage-run', 'alpine-roses', 'mushroom-hunt']);
  for (const m of WORK_MISSIONS) {
    assert.equal(getMission(m.id), m);
    assert.ok(MISSIONS.includes(m));
    assert.ok(m.icon && m.colour, `${m.id}: a pin`);
    const med = missionMedals(m);
    if (m.scoreMode) assert.ok(med.gold > med.silver && med.silver > med.bronze && med.bronze > 0);
    else assert.ok(med.gold < med.silver && med.silver < med.bronze);
    const s = m.start;
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.heading));
    assert.ok(!inBuilding(s.x, s.z), `${m.id}: the start is not inside a building`);
    const state = m.createState();
    for (const o of m.objectives) {
      const v = o.check(frame({ mode: m.mode, x: s.x, z: s.z }), state);
      assert.equal(typeof v.done, 'boolean');
      assert.equal(typeof v.text, 'string');
    }
  }
  assert.equal(getMission('snow-shovel').season, 'winter');
  assert.equal(getMission('lawn-mowing').season, 'summer');
  assert.equal(getMission('garbage-run').season, null); // (all year)
});

test('the grid: boxes, fractions, heaps keep their volume', () => {
  const g = createGrid(10, 10, 0.5);
  let n = 0;
  forCellsInBox(g, 2.5, 2.5, 1, 0, 0.5, 1, () => n++);
  assert.equal(n, 2 * 4); // (1 m along, 2 m across: 2 x 4 cells of 0.5 m)
  n = 0;
  forCellsInBox(g, 2.5, 2.5, 0, 1, 0.5, 1, () => n++); // (turned a quarter: 4 x 2)
  assert.equal(n, 8);
  g.mask.fill(MASK_TARGET);
  assert.equal(gridFraction(g, (h) => h <= 0), 1);
  depositHeap(g, 2.5, 2.5, 0.3, 0.8);
  const vol = g.h.reduce((a, h) => a + h, 0) * 0.25;
  assert.ok(Math.abs(vol - 0.3) < 1e-6, `the heap holds the snow thrown on it (${vol})`);
  assert.ok(g.h[5 * 10 + 5] > g.h[5 * 10 + 7]);
  assert.ok(g.dirty && g.dirty.i0 <= 5 && g.dirty.i1 >= 5);
  // a frame: world <-> grid
  const F = makeFrame(10, 20, 0.6, 0.8, 1);
  const p = F.toGrid(10 + 0.6 * 3, 20 + 0.8 * 3);
  assert.ok(Math.abs(p.u - 4) < 1e-9 && Math.abs(p.v - 1) < 1e-9);
  const w = F.toWorld(p.u, p.v);
  assert.ok(Math.abs(w.x - 11.8) < 1e-9 && Math.abs(w.z - 22.4) < 1e-9);
  const rnd = mulberry32(1), rnd2 = mulberry32(1);
  assert.equal(rnd(), rnd2());
});

test('a route: points along it, d to the left, projection back', () => {
  const r = makeRoute([0, 0, 100, 0]);
  const p = routePoint(r, 30, 2);
  // (along +x the left of the way is -z: x east, z south)
  assert.ok(Math.abs(p.x - 30) < 1e-9 && Math.abs(p.z + 2) < 1e-9);
  const q = projectRoute(r, 30, -2);
  assert.ok(Math.abs(q.s - 30) < 1e-9 && Math.abs(q.d - 2) < 1e-9);
});

test('snow shovel: the path at Dischmastrasse 19, the blade fills, throws go onto heaps beside the path', () => {
  const g = createShovelGrid();
  assert.ok(Math.abs(shovelCleared(g)) < 1e-9);
  const target = [...g.mask].filter((m) => m === MASK_TARGET).length;
  assert.ok(Math.abs(target * SHOVEL.cell ** 2 - SHOVEL.size.u * SHOVEL.size.v) < 1.5, 'the target is the path');
  // the path lies south of the house (the frame's v points away from it)
  const mid = SHOVEL.frame.toWorld(SHOVEL.margin + SHOVEL.size.u / 2, SHOVEL.margin + SHOVEL.size.v / 2);
  assert.ok(mid.z > -1050 && Math.hypot(mid.x - 789.3, mid.z + 1050) < 15);
  assert.ok(!inBuilding(mid.x, mid.z));
  assert.ok(Math.hypot(SHOVEL_START.x - mid.x, SHOVEL_START.z - mid.z) < 9);
  // the heaps never go north (onto the house)
  for (const [u, v] of [[5, 2.6], [10, 3], [3, 5.4], [18, 4]]) assert.ok(throwTarget(u, v).v >= v - 1e-9 || throwTarget(u, v).u !== u);
  // walking with the key held fills the blade, a full blade is thrown
  const sh = createShovel();
  let throws = 0;
  for (let k = 0; k < 120; k++) if (stepShovel(sh, g, { u: SHOVEL.margin + 0.2 + k * 0.05, v: SHOVEL.margin + 1.5 }, { u: 1, v: 0 }, 1.5, true, DT) === 'throw') throws++;
  assert.ok(throws >= 1, 'a full blade is thrown');
  // nothing is scraped without the key
  const before = g.h.reduce((a, h) => a + h, 0);
  const sh2 = createShovel();
  for (let k = 0; k < 30; k++) stepShovel(sh2, g, { u: SHOVEL.margin + 8, v: SHOVEL.margin + 1 }, { u: 1, v: 0 }, 1.5, false, DT);
  assert.equal(g.h.reduce((a, h) => a + h, 0), before);
});

test('snow shovel: a bot along the path clears 95 % within the gold time', () => {
  const g = createShovelGrid(), sh = createShovel();
  let t = 0;
  for (const [a, v, b] of shovelBotPath()) {
    const dir = Math.sign(b - a);
    let u = a;
    t += 1.2; // (turning round)
    while ((b - u) * dir > 0) { const mv = sh.throwT > 0 ? 0 : 1.6; u += dir * mv * DT; t += DT; stepShovel(sh, g, { u, v }, { u: dir, v: 0 }, mv, true, DT); }
    for (let k = 0; k < 30; k++) { t += DT; stepShovel(sh, g, { u, v }, { u: dir, v: 0 }, 0, false, DT); }
  }
  assert.ok(shovelCleared(g) >= SHOVEL.goal, `cleared ${shovelCleared(g)}`);
  const m = getMission('snow-shovel');
  assert.equal(medalFor(t * 1000, m.medals), 'gold', `${t.toFixed(0)} s`);
  // the snow went onto the heaps, not away
  const margin = [...g.h].reduce((a, h, k) => a + (g.mask[k] === MASK_TARGET ? 0 : h - SHOVEL.depth), 0);
  assert.ok(margin * SHOVEL.cell ** 2 > SHOVEL.size.u * SHOVEL.size.v * SHOVEL.depth * 0.9);
  const st = m.createState();
  st.cleared = 0.96;
  assert.ok(m.objectives[1].check(frame({ t: 1000 }), st).done);
  assert.ok(m.objectives[1].check(frame({ t: m.timeLimitMs + 1 }), { ...st, cleared: 0.5 }).fail);
});

test('snow blower: the Bündastrasse, two passes clear it, the parked cars are blocked out and can be hit', () => {
  const r = createBlowerRoute();
  assert.ok(Math.abs(r.length - BLOWER.length) < 0.5);
  const road = DAVOS_DATA.roads.find((x) => x.name === 'Bündastrasse');
  assert.ok(road && road.pts[0] === r.pts[0] && road.pts[1] === r.pts[1], 'it starts at the Dischmastrasse');
  const g = createBlowerGrid(r);
  assert.ok([...g.mask].some((m) => m === MASK_BLOCKED), 'the parked cars block their cells');
  let t = 0;
  for (const [d, dir] of [[-1.15, 1], [1.15, -1]]) {
    let s = dir > 0 ? 0 : r.length;
    t += dir < 0 ? 25 : 0; // (the turn)
    while (dir > 0 ? s < r.length : s > 0) { s += dir * 3.4 * DT; t += DT; stepBlower(g, { s, d }, { u: dir, v: 0 }, 3.4); }
  }
  assert.ok(blowerCleared(g) >= BLOWER.goal, `${blowerCleared(g)}`);
  assert.equal(medalFor(t * 1000, getMission('snow-blower').medals), 'gold', `${t.toFixed(0)} s`);
  // too fast: the auger chokes and leaves snow
  assert.equal(augerTake(3), 1);
  assert.ok(augerTake(6) < 0.5);
  const g2 = createBlowerGrid(r);
  for (let s = 0; s < 100; s += 6 * DT) stepBlower(g2, { s, d: -1.15 }, { u: 1, v: 0 }, 6);
  assert.ok(g2.h.some((h, k) => g2.mask[k] === MASK_TARGET && h > BLOWER.clearAt && h < BLOWER.depth));
  // the cars: hit straight on, missed beside them
  const c = BLOWER_CARS[0];
  assert.ok(blowerHitsCar({ s: c.s - 4.5, d: c.d }, 0, c));
  assert.ok(!blowerHitsCar({ s: c.s - 4.5, d: c.d + 3.6 }, 0, c));
  assert.ok(!blowerHitsCar({ s: c.s, d: c.d + 3.6 }, 0, c));
  // the chute throws to its side
  const land = chuteLanding({ s: 50, d: 0 }, 0, -1);
  assert.ok(land.d < -8 && land.s > 50);
});

test('lawn mowing: the Kurpark lawn, stripes by the pass, the beds cost time', () => {
  const g = createLawnGrid();
  const c = MOWER.frame.toWorld(MOWER.size.u / 2, MOWER.size.v / 2);
  const park = DAVOS_DATA.parks.find((p) => p.name === 'Kurpark');
  assert.ok(inRing(park.ring, c.x, c.z), 'the lawn lies in the Kurpark');
  assert.ok([...g.mask].filter((m) => m === MASK_BLOCKED).length > 20, 'two beds');
  stepMower(g, { u: 3, v: 3 }, { u: 1, v: 0 }, 2);
  const a = g.dir[Math.floor(3 / g.cell) * g.cols + Math.floor(3 / g.cell)];
  stepMower(g, { u: 3, v: 6 }, { u: -1, v: 0 }, 2);
  const b = g.dir[Math.floor(6 / g.cell) * g.cols + Math.floor(3 / g.cell)];
  assert.ok(a && b && a !== b, 'the two directions leave different stripes');
  // over a bed: trodden cells
  const bed = MOWER.frame.toGrid(MOWER.beds[0].x, MOWER.beds[0].z);
  assert.ok(stepMower(g, bed, { u: 1, v: 0 }, 2) > 0);
  // the bot in lanes
  const g2 = createLawnGrid();
  let t = 0;
  for (const [a0, v, b0] of mowerBotPath()) {
    const dir = Math.sign(b0 - a0);
    let u = a0;
    t += 6;
    while ((b0 - u) * dir > 0) { u += dir * 2.6 * DT; t += DT; stepMower(g2, { u, v }, { u: dir, v: 0 }, 2.6); }
  }
  assert.ok(lawnMown(g2) >= MOWER.goal);
  assert.equal(medalFor(t * 1000, getMission('lawn-mowing').medals), 'gold', `${t.toFixed(0)} s`);
});

test('refuse round: ten points on the verges of the Hof quarter, loaded standing, the KMA at the end', () => {
  const stops = garbageStops();
  assert.ok(stops.length >= 8 && stops.length <= 12);
  for (const s of stops) assert.ok(!inBuilding(s.x, s.z), `stop ${s.i} not inside a house`);
  const kma = DAVOS_DATA.buildings.find((b) => b.id === 'w127946886');
  assert.ok(kma, 'the KMA building');
  assert.ok(!inBuilding(GARBAGE.kma.x, GARBAGE.kma.z));
  let cx = 0, cz = 0;
  for (let i = 0; i < kma.ring.length; i += 2) { cx += kma.ring[i]; cz += kma.ring[i + 1]; }
  assert.ok(Math.hypot(cx / (kma.ring.length / 2) - GARBAGE.kma.x, cz / (kma.ring.length / 2) - GARBAGE.kma.z) < 30);
  const m = GARBAGE_MISSION;
  const st = m.createState();
  const s0 = st.stops[0];
  // the truck standing with its tail at the stop: loaded after loadS
  const truck = { x: s0.x + Math.sin(s0.heading) * GARBAGE.rear, z: s0.z + Math.cos(s0.heading) * GARBAGE.rear, heading: s0.heading, speed: 0 };
  let ev = null;
  for (let t = 0; t < GARBAGE.loadS + 0.2 && !ev; t += DT) ev = stepGarbage(st, truck, DT);
  assert.equal(ev, 'loaded');
  assert.equal(st.collected, 1);
  // driving past does not load
  const st2 = m.createState();
  for (let t = 0; t < 5; t += DT) stepGarbage(st2, { ...truck, speed: 5 }, DT);
  assert.equal(st2.collected, 0);
  // back at the KMA with points left: the round ends, each one missed costs its time
  m.update(frame({ mode: 'car', x: GARBAGE.kma.x, z: GARBAGE.kma.z }), st);
  const v = m.objectives[0].check(frame({ mode: 'car', x: GARBAGE.kma.x, z: GARBAGE.kma.z }), st);
  assert.ok(v.done);
  assert.equal(st.penaltyMs, (stops.length - 1) * GARBAGE.missMs);
  let u = null;
  for (let t = 0; t < GARBAGE.unloadS + 0.5; t += 0.1) u = m.objectives[1].check(frame({ mode: 'car', x: GARBAGE.kma.x, z: GARBAGE.kma.z, dt: 0.1 }), st);
  assert.ok(u.done);
});

test('Alpenrosen: bushes above the forest, flowering ones picked, the reserve costs time', async () => {
  const bushes = createRoseBushes();
  assert.equal(bushes.length, ROSES.count);
  assert.deepEqual(createRoseBushes().map((b) => b.x), bushes.map((b) => b.x), 'deterministic');
  const out = bushes.filter((b) => b.bloom && !b.inZone);
  assert.ok(out.length >= ROSES.goal * 2, 'enough flowering bushes outside the reserve');
  assert.ok(bushes.some((b) => b.inZone && b.bloom));
  const { groundHeight } = await import('../js/terrain.js');
  const f = ROSES.field;
  for (const [x, z] of [[f.x0, f.z0], [f.x1, f.z1], [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2]]) {
    const h = groundHeight(x, z) + 1558;
    assert.ok(h > 1950 && h < 2300, `${x}, ${z}: ${h.toFixed(0)} m`);
  }
  const m = ALPINE_ROSES_MISSION;
  const st = m.createState();
  const b = st.bushes.find((x) => x.bloom && !x.inZone);
  assert.equal(nearestBush(st.bushes, b.x + 0.5, b.z), b);
  let r = null;
  for (let t = 0; t < ROSES.pickS + 0.1 && !r; t += DT) r = stepPicking(st, b, true, DT, ROSES.pickS);
  assert.equal(r, 'done');
  // letting go starts again
  stepPicking(st, b, true, 0.3, ROSES.pickS);
  stepPicking(st, b, false, DT, ROSES.pickS);
  assert.equal(st.picking, null);
  // into the reserve: once per entry
  m.update(frame({ x: ROSES.zone.x, z: ROSES.zone.z, t: 5000 }), st);
  m.update(frame({ x: ROSES.zone.x + 1, z: ROSES.zone.z, t: 5100 }), st);
  assert.equal(st.entries, 1);
  assert.equal(st.penaltyMs, ROSES.zoneMs);
  m.update(frame({ x: ROSES_START.x, z: ROSES_START.z, t: 6000 }), st);
  m.update(frame({ x: ROSES.zone.x, z: ROSES.zone.z, t: 7000 }), st);
  assert.equal(st.entries, 2);
  st.picked = ROSES.goal;
  assert.ok(m.objectives[0].check(frame({ x: -1650, z: -1120, t: 9000 }), st).done);
  assert.ok(m.objectives[1].check(frame({ x: ROSES_START.x, z: ROSES_START.z }), st).done);
});

test('mushrooms: in the forest of the Dischma, look-alikes and fly agarics, the control scores the basket', () => {
  const all = createMushrooms();
  const n = Object.values(MUSHROOMS.counts).reduce((a, b) => a + b, 0);
  assert.equal(all.length, n);
  const half = createMushrooms((x) => x < 1640);
  assert.ok(half.every((m) => m.x < 1640), 'only where the caller says it is forest');
  for (const k of Object.keys(MUSHROOMS.counts)) assert.ok(MUSHROOM_KINDS[k].desc.length > 20);
  // look-alikes: the bolete's and the funnel's doubles are not edible
  assert.ok(MUSHROOM_KINDS.porcini.edible && !MUSHROOM_KINDS.bitter.edible);
  assert.ok(MUSHROOM_KINDS.chanterelle.edible && !MUSHROOM_KINDS.falseChanterelle.edible);
  assert.ok(MUSHROOM_KINDS.flyAgaric.points < MUSHROOM_KINDS.bitter.points);
  const r = mushroomControl(['porcini', 'porcini', 'chanterelle', 'flyAgaric', 'bitter']);
  assert.equal(r.score, 15 + 15 + 8 - 25 - 10);
  assert.equal(r.edible, 3);
  assert.equal(r.poisonous, 1);
  const m = MUSHROOM_MISSION;
  assert.ok(m.scoreMode);
  assert.equal(medalFor(mushroomControl(Array(10).fill('porcini')).score, m.medals, true), 'gold');
  assert.equal(medalFor(mushroomControl([...Array(6).fill('chanterelle'), ...Array(4).fill('porcini')]).score, m.medals, true), 'silver');
  assert.equal(medalFor(mushroomControl(Array(10).fill('flyAgaric')).score, m.medals, true), null);
  const st = m.createState();
  st.items = all.map((x) => ({ ...x }));
  const p = st.items[0];
  assert.equal(nearestMushroom(st.items, p.x + 0.3, p.z, 1), p);
  // the basket full: then the control scores it
  st.basket = Array(MUSHROOMS.basket).fill('chanterelle');
  assert.ok(m.objectives[0].check(frame({ x: p.x, z: p.z, t: 1000 }), st).done);
  assert.ok(m.objectives[0].check(frame({ x: p.x, z: p.z, t: MUSHROOMS.timeMs }), { ...st, basket: [] }).done, 'time up');
  const c = MUSHROOMS.control;
  assert.ok(m.objectives[1].check(frame({ x: c.x, z: c.z }), st).done);
  assert.equal(m.score(st), 80);
  assert.ok(m.summary(st).join(' ').includes('Eierschwamm'));
});
