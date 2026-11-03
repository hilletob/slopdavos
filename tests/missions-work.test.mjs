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
  MUSHROOMS, MUSHROOM_KINDS, MUSHROOM_MISSION, createMushrooms, nearestMushroom, mushroomControl,
  CRANE, CRANE_WING, CRANE_HOTEL, CRANE_LOADS, CRANE_MISSION, createCraneSite, craneSurface, stepPendulum, swingOf, craneWind, createCrane, craneTrolley, stepCrane,
  createCraneState, craneLoadHits, craneLanding, craneScore, stepCraneLoad, craneHookAction,
  LOADER, SNOW_ROUTE, TIP_SPOT, SNOW_HAUL_MISSION, createLoaderRoute, createLoaderGrid, createLoaderTruck, stepLoaderTruck, truckPace, onBed, stepChute, shedInBend,
  tipPose, stepTip, snowScore, createSnowState, nextOnRoute, blowerHitsTruck, inRingXZ
} from '../js/missions-data-work.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor, missionMedals } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { PARKING_DATA } from '../js/parking-data.js';

// (js/missions-data-work.js is three.js-free: the maps, the vehicles' work and the bots run on synthetic frames here)

const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 0.1, t: 0, ...over });
const DT = 1 / 30;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp1 = (v, a, b) => (v < a ? a : v > b ? b : v);
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const inBuilding = (x, z) => DAVOS_DATA.buildings.some((b) => Math.abs(b.ring[0] - x) < 200 && Math.abs(b.ring[1] - z) < 200 && inRing(b.ring, x, z));

test('the work missions are registered, complete, their medals in order', () => {
  assert.deepEqual(WORK_MISSIONS.map((m) => m.id), ['snow-shovel', 'snow-blower', 'lawn-mowing', 'garbage-run', 'alpine-roses', 'mushroom-hunt', 'derby-crane', 'snow-haul']);
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

// --- The crane at the Hotel Derby ---------------------------------------------------------------------------------------
const onLot = (x, z) => PARKING_DATA.some((l) => inRingXZ(l.ring, x, z));
/** A start with its first objective: outside every footprint and car park, the straight line clear, facing it */
function assertClearWalk(from, to, label) {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  for (let k = 0; k <= Math.ceil(d); k++) {
    const x = from.x + ((to.x - from.x) * k) / Math.ceil(d), z = from.z + ((to.z - from.z) * k) / Math.ceil(d);
    assert.ok(!inBuilding(x, z), `${label}: (${x.toFixed(1)}, ${z.toFixed(1)}) lies in a building`);
    assert.ok(!onLot(x, z), `${label}: (${x.toFixed(1)}, ${z.toFixed(1)}) lies on a car park`);
  }
}

const inHotel = (x, z) => CRANE_HOTEL.some((h) => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1);

test('the crane: the start, the ladder and the walk between them are clear, the start faces the ladder', () => {
  const m = CRANE_MISSION, L = CRANE.ladder;
  assertClearWalk(m.start, L, 'derby-crane');
  const want = Math.atan2(L.x - m.start.x, L.z - m.start.z);
  assert.ok(Math.abs(m.start.heading - want) < 1e-6);
  assert.ok(Math.hypot(L.x - m.start.x, L.z - m.start.z) < 60, 'a short walk');
  // (the hotel itself is drawn from swissBUILDINGS3D, not in DAVOS_DATA: the walk keeps off it too)
  for (const p of [m.start, L, CRANE.tower]) assert.ok(!inHotel(p.x, p.z), 'off the hotel');
  // the ladder at the mast, outside the mast's own box
  assert.ok(Math.max(Math.abs(L.x - CRANE.tower.x), Math.abs(L.z - CRANE.tower.z)) > CRANE.mastHalf);
  // the address of the Hotel Derby lies in the hotel's block, the site next to it
  assert.ok(inHotel(523.5, -1295));
  assert.ok(Math.hypot(523.5 - CRANE.tower.x, -1295 - CRANE.tower.z) < 60);
});

test('the crane: the site stands on free ground, every load and spot within the jib', () => {
  const W = CRANE_WING;
  for (let x = W.x0; x <= W.x1; x += 1) for (let z = W.z0; z <= W.z1; z += 1) assert.ok(!inBuilding(x, z) && !inHotel(x, z), `the wing at (${x}, ${z})`);
  assert.ok(!inBuilding(CRANE.tower.x, CRANE.tower.z));
  const site = createCraneSite();
  site.decks.forEach((y, i) => assert.ok(Math.abs(y - 3.2 * (i + 1)) < 1e-9));
  for (const l of site.loads) {
    for (const p of [l.yard, l.pad]) {
      const r = Math.hypot(p.x - CRANE.tower.x, p.z - CRANE.tower.z);
      assert.ok(r > CRANE.rMin && r < CRANE.rMax, `${l.id}: ${r.toFixed(1)} m from the tower`);
    }
    assert.ok(!inBuilding(l.yard.x, l.yard.z) && !inHotel(l.yard.x, l.yard.z));
    assert.equal(craneSurface(site, l.pad.x, l.pad.z), l.padY, `${l.id}: the spot lies on its deck`);
    assert.equal(craneLoadHits(site, l.half, l.pad.x, l.padY, l.pad.z), null, `${l.id}: it fits on its spot`);
    assert.equal(craneLoadHits(site, l.half, l.yard.x, l.restY, l.yard.z), null, `${l.id}: it stands free in the yard`);
  }
  // the terraces' walls are obstacles: a load driven into the step above a deck hits
  assert.ok(craneLoadHits(site, site.loads[0].half, 539, 4, -1251));
  assert.equal(craneLoadHits(site, site.loads[0].half, 547.5, 5, -1251), null);
  assert.ok(craneLoadHits(site, site.loads[0].half, 520, 10, -1280), 'the hotel is in the way');
  // a neighbour's house counts as an obstacle
  const near = createCraneSite(() => 0, [{ ring: [580, -1280, 585, -1280, 585, -1275, 580, -1275], h: 9 }]);
  assert.ok(craneLoadHits(near, site.loads[0].half, 582, 2, -1277));
  assert.equal(createCraneSite(() => 0, [{ ring: [800, -1280, 805, -1280, 805, -1275, 800, -1275], h: 9 }]).obstacles.length, site.obstacles.length);
});

test('the pendulum: the right period, it dies away slowly, the suspension starts it', () => {
  const L = 20, sw = { x: 1, z: 0, vx: 0, vz: 0 }, h = 1 / 240;
  let t = 0, last = 1, crossings = [];
  for (let k = 0; k < 240 * 40; k++) {
    stepPendulum(sw, 0, 0, L, h);
    t += h;
    if (last > 0 && sw.x <= 0) crossings.push(t);
    last = sw.x;
  }
  const period = (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
  const want = 2 * Math.PI * Math.sqrt(L / CRANE.g);
  assert.ok(Math.abs(period - want) < 0.05, `T ${period.toFixed(2)} s, wanted ${want.toFixed(2)} s`);
  // the damping: amplitude e^(-c t / 2) after 40 s, c = 0.05
  const amp = Math.hypot(sw.x, sw.vx * Math.sqrt(L / CRANE.g));
  assert.ok(Math.abs(amp - Math.exp((-CRANE.damp * 40) / 2)) < 0.03, `amplitude ${amp.toFixed(3)}`);
  // an accelerating suspension leaves the load behind, the wind pushes it along
  const a = stepPendulum({ x: 0, z: 0, vx: 0, vz: 0 }, 1, 0, L, 0.1);
  assert.ok(a.vx < 0);
  const b = stepPendulum({ x: 0, z: 0, vx: 0, vz: 0 }, 0, 0, L, 0.1, { wz: 1 });
  assert.ok(b.vz > 0 && b.vx === 0);
});

test('the crane: a hard stop leaves a swing, a counter-move takes it out', () => {
  const site = createCraneSite();
  const run = (counter) => {
    const c = createCrane(site);
    c.rope = 20;
    stepCrane(c, { trolley: 0 }, 0.05);
    // the trolley out at full speed for 5 s and to a stop: a swing is left on the rope
    for (let k = 0; k < 150; k++) stepCrane(c, { trolley: 1 }, 1 / 30);
    for (let k = 0; k < 90; k++) stepCrane(c, {}, 1 / 30);
    const amp = () => Math.hypot(swingOf(c.swing), Math.hypot(c.swing.vx, c.swing.vz) * Math.sqrt(c.rope / CRANE.g)); // (the swing whatever its phase)
    const left = amp();
    // ... and for the next 25 s the driver either watches, or moves with the swing: the trolley follows the hook
    for (let k = 0; k < 750; k++) {
      const out = Math.sin(c.theta) * c.swing.x + Math.cos(c.theta) * c.swing.z; // (the swing along the jib)
      stepCrane(c, counter ? { trolley: clamp1(out * 0.5, -1, 1) } : {}, 1 / 30);
    }
    return { left, end: amp() };
  };
  const idle = run(false), countered = run(true);
  assert.ok(idle.left > 0.5, `the stop leaves a swing (${idle.left.toFixed(2)} m)`);
  assert.ok(idle.end > idle.left * 0.2, `left alone it hangs on (${idle.end.toFixed(2)} m of ${idle.left.toFixed(2)} m)`);
  assert.ok(countered.end < idle.end * 0.3, `the counter-move takes it out: ${countered.end.toFixed(2)} against ${idle.end.toFixed(2)} m`);
});

test('the crane: the axes keep to their limits, the wind only blows in gusts', () => {
  const site = createCraneSite(), c = createCrane(site);
  for (let k = 0; k < 900; k++) stepCrane(c, { trolley: 1, hoist: 1, slew: 1 }, 1 / 30);
  assert.equal(c.r, CRANE.rMax);
  assert.equal(c.rope, CRANE.ropeMin);
  assert.ok(Math.abs(c.slewV - CRANE.slewMax) < 1e-9);
  // the way down is limited by maxRope
  for (let k = 0; k < 900; k++) stepCrane(c, { hoist: -1 }, 1 / 30, null, 20);
  assert.equal(c.rope, 20);
  let peak = 0, zero = 0;
  const w = {};
  for (let t = 0; t < 200; t += 0.25) { const m = Math.hypot(...Object.values(craneWind(t, 0.3, w))); peak = Math.max(peak, m); if (m < 0.05) zero++; }
  assert.ok(peak > 0.25 && peak <= 0.3 * 1.71, `gusts up to ${peak}`);
  assert.ok(zero > 0, 'and lulls');
});

test('the crane: the score of a landing, taking a load, setting it down', () => {
  assert.equal(craneLanding(0, 0.1).points, CRANE.points.precision + CRANE.points.gentle);
  assert.ok(craneLanding(1.5, 0.1).precision === CRANE.points.precision / 2);
  const hard = craneLanding(0, 2);
  assert.ok(hard.hard && hard.gentle === 0 && hard.points === CRANE.points.precision - CRANE.points.hard);
  assert.equal(craneLanding(0, 2, 2).points, CRANE.points.precision - 2 * CRANE.points.hard); // (the jacuzzi cracks)
  const site = createCraneSite(), st = createCraneState(), c = createCrane(site), load = site.loads[0];
  // too far from the load
  c.theta = -1;
  assert.equal(craneHookAction(c, site, st), 'far');
  // over the load, at the sling's height: taken
  c.r = Math.hypot(load.yard.x - CRANE.tower.x, load.yard.z - CRANE.tower.z);
  c.theta = Math.atan2(load.yard.x - CRANE.tower.x, load.yard.z - CRANE.tower.z);
  c.rope = site.jibY - (load.restY + load.half.y * 2 + CRANE.sling);
  assert.equal(craneHookAction(c, site, st), 'hooked');
  assert.ok(st.carried && st.seated);
  // lifted, the load follows; in the air it cannot be let go
  c.rope -= 2;
  stepCraneLoad(c, site, st, 0.05);
  assert.ok(!st.seated && st.lifted);
  assert.ok(st.ly > load.restY + 1);
  assert.equal(craneHookAction(c, site, st), 'not-down');
  // set down in the yard: not on its spot
  c.rope = site.jibY - (load.restY + load.half.y * 2 + CRANE.sling) + 0.5;
  assert.equal(stepCraneLoad(c, site, st, 0.05), 'seated');
  assert.equal(craneHookAction(c, site, st), 'off-spot');
  assert.equal(craneScore(st), 0);
  // a hit costs points once a cooldown, and the swing turns back
  const s2 = createCraneState(), c2 = createCrane(site);
  Object.assign(s2, { carried: true, seated: false });
  c2.r = Math.hypot(539 - CRANE.tower.x, -1251 - CRANE.tower.z);
  c2.theta = Math.atan2(539 - CRANE.tower.x, -1251 - CRANE.tower.z);
  c2.rope = site.jibY - (4 + load.half.y * 2 + CRANE.sling);
  c2.swing.vx = 1;
  assert.equal(stepCraneLoad(c2, site, s2, 0.05), 'hit');
  assert.ok(c2.swing.vx < 0);
  assert.equal(stepCraneLoad(c2, site, s2, 0.05), null);
  assert.equal(s2.hits, 1);
});

/**
 * A crane driver on synthetic time. skill 1: steady and precise, the swing taken out by following the hook; less: it
 * settles for a wider swing, lands off the mark and comes down faster, and it takes longer about it
 */
function craneBot(skill = 1, maxSec = 900) {
  const site = createCraneSite(), st = createCraneState(), c = createCrane(site), dt = 1 / 30;
  st.cab = true;
  const swingOk = 0.2 / skill, off = (1 - skill) * 2.4, wind = {};
  let t = 0;
  const wrap = (a) => { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a; };
  const trolleyAt = () => craneTrolley(c);
  const drive = (target, wantRope = null) => {
    const dx = target.x + off - CRANE.tower.x, dz = target.z - CRANE.tower.z;
    const th = Math.atan2(dx, dz), r = Math.hypot(dx, dz);
    const s = Math.sin(c.theta), co = Math.cos(c.theta), along = s * c.swing.x + co * c.swing.z, across = co * c.swing.x - s * c.swing.z;
    return {
      // (the error at the hook, not at the trolley: the gusts push the hook, and the bot follows the swing to damp it)
      slew: clamp1((0.4 * (wrap(th - c.theta) * Math.max(c.r, 8) - across) + 0.8 * across) / (Math.max(c.r, 8) * CRANE.slewMax), -1, 1),
      trolley: clamp1((0.4 * (r - c.r - along) + 0.8 * along) / CRANE.trolleyMax, -1, 1),
      hoist: wantRope == null ? 0 : clamp1((c.rope - wantRope) * 0.8 / CRANE.hoistMax, -1, 1)
    };
  };
  const tick = (input, maxRope = CRANE.ropeMax) => {
    const load = site.loads[st.index];
    const w = st.carried && load?.gust ? craneWind(t, load.gust, wind) : null;
    stepCrane(c, input, dt, w, maxRope);
    stepCraneLoad(c, site, st, dt);
    t += dt;
    st.t = t * 1000;
  };
  const distTo = (p) => { const q = trolleyAt(); return Math.hypot(q.x + c.swing.x - p.x - off, q.z + c.swing.z - p.z); };
  const settled = () => swingOf(c.swing) <= swingOk && Math.hypot(c.slewV * c.r, c.trolleyV) < 0.3;
  while (st.index < site.loads.length && t < maxSec) {
    const load = site.loads[st.index];
    const clearRope = site.jibY - (site.decks[2] + 3 + load.half.y * 2 + CRANE.sling); // (over the top terrace)
    const hookRope = site.jibY - (load.restY + load.half.y * 2 + CRANE.sling);
    // over the yard at a safe height, down to the load (the bot takes it dead over, whatever its skill)
    const yard = { x: load.yard.x - off, z: load.yard.z };
    while (t < maxSec && (distTo(yard) > 0.5 || !settled())) tick(drive(yard, clearRope));
    while (t < maxSec && c.rope < hookRope - 0.2) tick(drive(yard, hookRope));
    if (craneHookAction(c, site, st) !== 'hooked') { tick({}); continue; }
    // up, across, down: fast to 2 m above the deck, then gently
    while (t < maxSec && c.rope > clearRope + 0.3) tick({ hoist: 1 });
    while (t < maxSec && (distTo(load.pad) > 0.25 / skill || !settled())) tick(drive(load.pad, clearRope));
    while (t < maxSec && !st.seated && st.ly - load.padY > 1.5) tick({ ...drive(load.pad), hoist: st.ly - load.padY > 3 ? -1 : -0.5 });
    const gentle = skill >= 1 ? -0.08 : -0.08 / (skill * skill);
    // (the last half metre only with the load over the mark: it hangs on in a gust)
    while (t < maxSec && !st.seated) {
      const low = st.ly - load.padY < 0.5;
      tick({ ...drive(load.pad), hoist: low && distTo(load.pad) > 0.4 / skill ? 0 : gentle });
    }
    tick({});
    const r = craneHookAction(c, site, st);
    if (r !== 'released') return { st, site, t, stuck: r, c };
    for (let k = 0; k < 30; k++) tick({ hoist: 1 }); // (the hook clear of the load)
  }
  return { st, site, t };
}

test('the crane: a steady bot sets all three loads on their spots, its medal by skill', () => {
  const m = CRANE_MISSION;
  const good = craneBot(1), loose = craneBot(0.5);
  assert.equal(good.st.results.length, 3, `all down (${good.stuck ?? ''}, ${good.t.toFixed(0)} s)`);
  assert.equal(loose.st.results.length, 3, `the looser one too (${loose.stuck ?? ''}, ${loose.t.toFixed(0)} s)`);
  assert.ok(good.st.results.every((r) => r.err < 0.6 && !r.hard));
  const a = craneScore(good.st), b = craneScore(loose.st);
  assert.equal(medalFor(a, m.medals, true), 'gold', `steady: ${a} in ${good.t.toFixed(0)} s`);
  assert.ok(['silver', 'bronze', 'gold'].includes(medalFor(b, m.medals, true)), `looser: ${b} in ${loose.t.toFixed(0)} s`);
  assert.ok(b < a);
  assert.ok(good.t * 1000 < CRANE.limitMs);
  // no medal for a slapdash run: three loads off the mark, with hard landings and hits, slowly
  const bad = createCraneState();
  bad.results.push(craneLanding(2.6, 1.3), craneLanding(2.6, 1.3), craneLanding(2.6, 1.3, 2));
  bad.hits = 3; bad.t = 700000;
  assert.equal(medalFor(craneScore(bad), m.medals, true), null, `${craneScore(bad)}`);
});

test('the crane mission: the walker reaches the ladder, the steps follow the loads', () => {
  const m = CRANE_MISSION, st = m.createState();
  m.update(frame({ mode: 'person', x: m.start.x, z: m.start.z }), st);
  assert.ok(!st.cab);
  let v = m.objectives[0].check(frame({ mode: 'person', x: m.start.x, z: m.start.z }), st);
  assert.ok(!v.done && v.target && /to the crane ladder/.test(v.text));
  m.update(frame({ mode: 'person', x: CRANE.ladder.x, z: CRANE.ladder.z }), st);
  assert.ok(st.cab);
  assert.ok(m.objectives[0].check(frame(), st).done);
  st.view = { dist: 3.2, above: 1, swing: 2, wind: 0, ready: false };
  v = m.objectives[1].check(frame(), st);
  assert.ok(!v.done && /Take the concrete bucket: 3.2 m off/.test(v.text) && /meet the swing/.test(v.hint));
  st.index = 1;
  assert.ok(m.objectives[1].check(frame(), st).done);
  assert.ok(m.objectives[1].check(frame({ t: CRANE.limitMs + 1 }), st).fail);
  assert.equal(m.objectives.length, 1 + CRANE_LOADS.length);
  assert.ok(m.summary(st).length === 2);
});

// --- Carting the snow ----------------------------------------------------------------------------------------------------
test('snow haul: the start and the truck on the Bündastrasse are clear of buildings and car parks, facing along the road', () => {
  const m = SNOW_HAUL_MISSION, route = createLoaderRoute();
  assert.ok(Math.abs(route.length - LOADER.length) < 1);
  for (let s = 0; s <= route.length; s += 2) for (const d of [LOADER.blowerD, LOADER.truckD]) {
    const p = routePoint(route, s, d);
    assert.ok(!inBuilding(p.x, p.z), `s ${s}, d ${d}: a building`);
    assert.ok(!onLot(p.x, p.z), `s ${s}, d ${d}: a car park`);
  }
  const q = projectRoute(route, m.start.x, m.start.z);
  assert.ok(Math.abs(q.s - 8) < 0.5 && Math.abs(q.d - LOADER.blowerD) < 0.1);
  assert.ok(Math.abs(m.start.heading - Math.atan2(q.tx, q.tz)) < 1e-2);
  // the two lanes fit on the road side by side
  assert.ok(!blowerHitsTruck({ s: 10, d: LOADER.blowerD }, 0, { s: 10, d: LOADER.truckD + 0.22 }));
  assert.ok(blowerHitsTruck({ s: 10, d: 0.5 }, 0, { s: 10, d: LOADER.truckD }));
  assert.ok(!blowerHitsTruck({ s: 10, d: LOADER.blowerD }, 0.2, { s: 10, d: LOADER.truckD }), 'a little turned, still clear');
  // the low throw lands on the bed from the blower's lane
  const land = chuteLanding({ s: 50, d: LOADER.blowerD }, 0, 1, LOADER);
  assert.ok(onBed(land, createLoaderTruck(50)), 'level with the truck, the stream lands on the bed');
  assert.ok(!onBed(chuteLanding({ s: 50, d: LOADER.blowerD }, 0, -1, LOADER), createLoaderTruck(50)), 'the chute the other way: beside it');
  assert.ok(!onBed(land, { s: 62, d: LOADER.truckD }), 'too far behind: on the road');
});

test('snow haul: the route to the lake runs over mapped drivable roads, the end by the shore', () => {
  const pts = SNOW_ROUTE;
  const edges = new Set();
  for (const r of DAVOS_DATA.roads) {
    if (r.tunnel || ['footway', 'path', 'steps', 'cycleway', 'pedestrian'].includes(r.kind)) continue;
    for (let i = 0; i + 3 < r.pts.length; i += 2) { const a = `${r.pts[i]},${r.pts[i + 1]}`, b = `${r.pts[i + 2]},${r.pts[i + 3]}`; edges.add(`${a}|${b}`); edges.add(`${b}|${a}`); }
  }
  for (let i = 0; i + 3 < pts.length; i += 2) assert.ok(edges.has(`${pts[i]},${pts[i + 1]}|${pts[i + 2]},${pts[i + 3]}`), `the leg from (${pts[i]}, ${pts[i + 1]}) is a road`);
  // it picks the truck up wherever it stopped: from the earliest a clean run can fill the bed to the end of the stretch
  const road = createLoaderRoute(), way = makeRoute(pts);
  const earliest = 8 + LOADER.capacity / (LOADER.packing * BLOWER.workHalf * 2 * BLOWER.depth);
  for (const s of [earliest, 170, LOADER.length]) {
    const p = routePoint(road, s), q = projectRoute(way, p.x, p.z);
    assert.ok(Math.abs(q.d) < 0.5 && q.s > 0 && q.s < 120, `s ${s}: ${q.s.toFixed(0)} m along the way, ${q.d.toFixed(1)} m off it`);
  }
  // no building on the way (the corner of a street may cut no footprint)
  const route = makeRoute(pts);
  for (let s = 0; s <= route.length; s += 2) { const p = routePoint(route, s); assert.ok(!inBuilding(p.x, p.z), `s ${s}: a building`); }
  assert.ok(route.length > 1100 && route.length < 1500, `${route.length.toFixed(0)} m`);
  const lake = DAVOS_DATA.water.find((w) => w.name === 'Davosersee');
  // the spot on the shore: dry, the water close behind the tail, the truck in position standing on dry ground outside the car park
  const S = TIP_SPOT, fx = Math.sin(S.heading), fz = Math.cos(S.heading);
  assert.ok(!inRingXZ(lake.ring, S.x, S.z), 'the tail on land');
  assert.ok(inRingXZ(lake.ring, S.x - fx * 6, S.z - fz * 6), 'the water behind it');
  const cx = S.x + fx * LOADER.truckBody.halfL, cz = S.z + fz * LOADER.truckBody.halfL;
  assert.ok(!inRingXZ(lake.ring, cx, cz) && !inBuilding(cx, cz));
  assert.ok(!onLot(S.x, S.z), 'the mark is off the car park');
  assert.ok(Math.hypot(cx - pts[pts.length - 2], cz - pts[pts.length - 1]) < 10, 'beside the road');
});

test('snow haul: the chute fills the bed, what misses is waste, a full bed runs over', () => {
  const st = createSnowState(), T = createLoaderTruck(30), onIt = { s: T.s - LOADER.bed.back, d: T.d }, off = { s: T.s + 20, d: T.d };
  assert.equal(stepChute(st, 10, onIt, T), 0);
  assert.ok(Math.abs(st.load - 10 * LOADER.packing) < 1e-9 && st.onBed);
  const w = stepChute(st, 10, off, T);
  assert.ok(Math.abs(w - 10 * LOADER.packing) < 1e-9 && !st.onBed);
  assert.ok(Math.abs(st.spilled - w) < 1e-9);
  st.load = LOADER.capacity - 0.01;
  assert.ok(stepChute(st, 10, onIt, T) > 0);
  assert.equal(st.load, LOADER.capacity);
  // bends: a slow one keeps the load, a fast one sheds it
  const b = createSnowState();
  b.load = 10;
  assert.equal(shedInBend(b, 5, 0.3, 0.1), 0);
  assert.ok(shedInBend(b, 12, 0.5, 0.1) > 0 && b.load < 10 && b.shed > 0);
});

test('snow haul: the tipper waits for the blower and keeps its own rhythm', () => {
  const T = createLoaderTruck(8), s0 = T.s;
  for (let k = 0; k < 60; k++) stepLoaderTruck(T, 8, false, DT);
  assert.equal(T.s, s0, 'it waits for the first move');
  // the blower drives on: the truck keeps about its pace; the blower stops: it waits
  let s = 8;
  const seen = [];
  for (let k = 0; k < 1500; k++) { s = Math.min(LOADER.length, s + 2.8 * DT); stepLoaderTruck(T, s, true, DT); seen.push(T.v); assert.ok(T.s - s < 8, `${T.s} ${s}`); }
  assert.ok(Math.max(...seen.slice(300)) - Math.min(...seen.slice(300)) > 0.3, 'its pace changes');
  const parked = T.s;
  for (let k = 0; k < 600; k++) stepLoaderTruck(T, s, true, DT);
  assert.ok(T.s - parked < 8, 'it does not drive off');
  // a full truck stops
  T.full = true;
  for (let k = 0; k < 120; k++) stepLoaderTruck(T, s, true, DT);
  assert.equal(T.v, 0);
});

test('snow haul: the tipping pose, the bed up and the load out only with the key at the spot', () => {
  const S = TIP_SPOT, hl = LOADER.truckBody.halfL, fx = Math.sin(S.heading), fz = Math.cos(S.heading);
  const x = S.x + fx * hl, z = S.z + fz * hl;
  assert.ok(tipPose(x, z, S.heading, 0).ok);
  assert.ok(!tipPose(x, z, S.heading, 2).ok && tipPose(x, z, S.heading, 2).placed, 'still rolling');
  assert.ok(!tipPose(x, z, S.heading + Math.PI, 0).ok, 'nose first');
  assert.ok(!tipPose(x + 8, z, S.heading, 0).ok, 'too far off');
  const st = createSnowState();
  st.load = 10;
  for (let k = 0; k < 60; k++) stepTip(st, false, true, DT);
  assert.equal(st.tipped, 0, 'not at the spot');
  let t = 0;
  while (st.load > 0 && t < 20) { stepTip(st, true, true, DT); t += DT; }
  assert.ok(Math.abs(st.tipped - 10) < 1e-6 && t < 6, `${t.toFixed(1)} s`);
  for (let k = 0; k < 120; k++) stepTip(st, true, false, DT);
  assert.equal(st.raise, 0, 'let go: the bed comes down');
});

/** The mission's steps on synthetic frames: a bot on the road, its s and d steered by `aimD`, then the drive and the tip */
function snowBot({ aimD = LOADER.blowerD, wobble = 0, pace = 1, driveV = 8.5, bends = 0 } = {}) {
  const m = SNOW_HAUL_MISSION, st = m.createState(), route = createLoaderRoute(), grid = createLoaderGrid(route), T = createLoaderTruck(8);
  let s = 8, t = 0, started = false, v = 0;
  const f = (o = {}) => frame({ mode: 'car', t: t * 1000, ...o });
  while (!m.objectives[0].check(f(), st).done && t < 800) {
    t += DT;
    // keeps level with the truck's bed
    const gap = T.s - LOADER.bed.back - LOADER.throwAhead - s;
    const target = clamp01(0.5 + gap * 0.5) * 3.6 * pace;
    v += clamp1(target - v, -1.5 * DT, 1.7 * DT);
    s += v * DT;
    if (v > 0.2) started = true;
    st.s = s;
    stepLoaderTruck(T, s, started, DT);
    const d = aimD + wobble * Math.sin(t * 0.9);
    const vol = stepBlower(grid, { s, d }, { u: 1, v: 0 }, v);
    if (vol > 0) { const land = chuteLanding({ s, d }, 0, st.chute, LOADER); stepChute(st, vol, land, T); }
  }
  const atLoad = st.load;
  t += 4; // (climbing across)
  st.inTruck = true;
  // the road to the lake at its pace
  const way = makeRoute(SNOW_ROUTE);
  t += way.length / driveV;
  st.shed += Math.min(st.load, bends);
  st.load -= Math.min(st.load, bends);
  t += 45; // (backing up to the mark)
  while (st.load > 0) { stepTip(st, true, true, DT); t += DT; }
  st.t = t * 1000;
  return { st, t, atLoad, score: snowScore(st) };
}

test('snow haul: bots earn their medals by load, spillage and time', () => {
  const m = SNOW_HAUL_MISSION;
  const clean = snowBot();
  assert.ok(clean.atLoad >= LOADER.capacity - 0.01, `a clean run fills the bed (${clean.atLoad.toFixed(1)} m³)`);
  assert.equal(medalFor(clean.score, m.medals, true), 'gold', `clean: ${clean.score}, ${clean.t.toFixed(0)} s, ${clean.st.spilled.toFixed(2)} m³ spilled`);
  // drifting a metre and a half to and fro misses the bed a good part of the time
  const wobbly = snowBot({ wobble: 1.9 });
  assert.ok(wobbly.st.spilled > 2, `${wobbly.st.spilled.toFixed(1)}`);
  assert.ok(wobbly.score < clean.score, `wobbly: ${wobbly.score}`);
  assert.ok(['silver', 'bronze'].includes(medalFor(wobbly.score, m.medals, true)), `wobbly: ${wobbly.score}, ${wobbly.atLoad.toFixed(1)} m³`);
  const far = snowBot({ aimD: LOADER.blowerD - 1.3 });
  assert.ok(far.atLoad < LOADER.capacity * LOADER.minLoad, `off the bed all along: ${far.atLoad.toFixed(1)} m³`);
  const v = m.objectives[0].check(frame({ mode: 'car', t: 1000 }), { ...createSnowState(), s: LOADER.length, load: 1 });
  assert.ok(v.fail, 'a nearly empty truck at the end of the road: failed');
  // a slow, shedding run takes less
  const slow = snowBot({ driveV: 3.5, bends: 4 });
  assert.ok(slow.score < clean.score);
  assert.ok(medalFor(slow.score, m.medals, true) !== 'gold', `slow: ${slow.score}`);
  // the steps
  const st = m.createState();
  st.pose = tipPose(0, 0, 0, 0);
  assert.ok(m.objectives[3].check(frame(), { ...st, load: 3 }).hint.startsWith('Tail to the mark'));
  assert.ok(m.objectives[3].check(frame(), { ...st, inLake: true }).fail);
  assert.ok(m.objectives[1].check(frame(), { ...st, truckDist: 30 }).hint.startsWith('Drive closer'));
  assert.ok(!m.objectives[2].check(frame({ x: 964, z: -1150 }), st).done);
  assert.ok(m.objectives[2].check(frame({ x: 1238, z: -2156 }), st).done);
  // the guide runs along the road, not across the town, and never goes back
  const g = createSnowState();
  const a = nextOnRoute(g, 965, -1160);
  assert.ok(a.z < -1180 && g.routeS > 5);
  const keep = g.routeS;
  nextOnRoute(g, 1240, -2150); // (a jump along the road is not taken on trust)
  assert.equal(g.routeS, keep);
});
