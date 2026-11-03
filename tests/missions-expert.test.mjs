import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPERT_MISSIONS, EYE_MISSION, EYE, MEERKAEMPER, createEyeTest, eyeCustomer, eyeShown, eyeKernel, eyeAnswer, eyeLine, eyeSetDial, eyeSetStep, eyeFlip, eyeTake, eyeKeep, eyeScold, eyePar, eyeQuality, eyePrescribe, eyeStep, fmtDioptre,
  SNOW_MISSION, SNOW, SLF, HARDNESS, GRAINS, DANGER, toolGoesIn, createSnowpack, dangerFor, snowTempAt, snowDepths, createSnowGame, snowTest, snowWrite, snowGrain, snowTap, snowPick, snowDanger, snowClose, snowStep, snowScore
} from '../js/missions-data-expert.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { PARKING_DATA } from '../js/parking-data.js';
import { WORLD_BOUNDS, lonLatToWorld, lv95ToWorld, FRAME } from '../js/davos-frame.js';
import { groundHeight } from '../js/terrain.js';
import { medalFor, missionMedals, missionPin } from '../js/missions-progress.js';

// (js/missions-data-expert.js is three.js-free: the two games run on synthetic frames here)
const DT = 1 / 30;
const inRing = (x, z, r) => {
  let c = false;
  for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
    const ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
  }
  return c;
};
const inBuilding = (x, z) => DAVOS_DATA.buildings.find((b) => inRing(x, z, b.ring));
/** The straight line from a to b is free of buildings, and the heading looks along it */
function assertWalkable(a, b, label) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  for (let s = 0; s <= d; s += 0.5) {
    const x = a.x + ((b.x - a.x) * s) / d, z = a.z + ((b.z - a.z) * s) / d;
    assert.ok(!inBuilding(x, z), `${label}: (${x.toFixed(1)}, ${z.toFixed(1)}) is free of buildings`);
    // (js/parking.js parks cars in the lots, and a parked car stops a walker: the SLF's first door stood in one)
    const lot = PARKING_DATA.find((l) => l.ring && inRing(x, z, l.ring));
    assert.ok(!lot, `${label}: (${x.toFixed(1)}, ${z.toFixed(1)}) is out of the car park ${lot?.id}`);
  }
  const off = Math.atan2(Math.sin(a.heading - Math.atan2(b.x - a.x, b.z - a.z)), Math.cos(a.heading - Math.atan2(b.x - a.x, b.z - a.z)));
  assert.ok(Math.abs(off) < 0.02, `${label}: the start faces its target`);
}

test('the two expert missions are registered, scored, with their pins apart', () => {
  assert.deepEqual(EXPERT_MISSIONS.map((m) => m.id), ['sehtest-meerkaemper', 'schneeprofil-slf']);
  const pins = MISSIONS.map((m) => ({ id: m.id, ...missionPin(m) }));
  for (const m of EXPERT_MISSIONS) {
    assert.equal(getMission(m.id), m);
    assert.ok(MISSIONS.includes(m));
    assert.equal(m.features.length, 1);
    assert.ok(m.scoreMode);
    const l = missionMedals(m);
    assert.ok(l.gold > l.silver && l.silver > l.bronze);
    assert.equal(m.score(m.createState()), 0, 'nothing done, nothing scored');
    assert.deepEqual(m.summary(m.createState()), []);
    const a = pins.find((p) => p.id === m.id);
    for (const b of pins) if (a.id !== b.id) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 30, `${a.id} vs ${b.id}`);
  }
});

test('Meerkämper: the door by the OSM node, start and door out of every building, the walk free', () => {
  const shop = lonLatToWorld(9.8216461, 46.7965736); // OSM n12109173090
  assert.ok(Math.hypot(MEERKAEMPER.door.x - shop.x, MEERKAEMPER.door.z - shop.z) < 3);
  assert.ok(!inBuilding(MEERKAEMPER.door.x, MEERKAEMPER.door.z));
  assert.ok(!inBuilding(MEERKAEMPER.start.x, MEERKAEMPER.start.z));
  assertWalkable(MEERKAEMPER.start, MEERKAEMPER.door, 'Meerkämper');
  const to = Math.hypot(MEERKAEMPER.door.x - MEERKAEMPER.start.x, MEERKAEMPER.door.z - MEERKAEMPER.start.z);
  assert.ok(to > MEERKAEMPER.door.r + 5 && to < 30, 'a short walk');
  assert.deepEqual({ x: EYE_MISSION.start.x, z: EYE_MISSION.start.z }, { x: MEERKAEMPER.start.x, z: MEERKAEMPER.start.z });
});

test('the SLF: its footprint, the door outside it, the field on the Weissfluhjoch in the world at its real height', () => {
  const slf = DAVOS_DATA.buildings.find((b) => b.id === 'w1178596285');
  assert.match(slf.name, /SLF/);
  for (const p of [SLF.door, SLF.start]) assert.ok(!inBuilding(p.x, p.z), 'outside the buildings');
  assertWalkable(SLF.start, SLF.door, 'the SLF');
  let nearest = Infinity;
  for (let i = 0; i < slf.ring.length; i += 2) nearest = Math.min(nearest, Math.hypot(slf.ring[i] - SLF.door.x, slf.ring[i + 1] - SLF.door.z));
  assert.ok(nearest < 25, 'the door at the institute');
  // the field: the SLF's own coordinates for 5WJ0, inside the world, and the terrain agrees with its 2536 m
  const f = lv95ToWorld(SLF.fieldLv95.E, SLF.fieldLv95.N);
  assert.deepEqual({ x: f.x, z: f.z }, { x: SLF.field.x, z: SLF.field.z });
  const [x0, z0, x1, z1] = WORLD_BOUNDS;
  assert.ok(f.x > x0 && f.x < x1 && f.z > z0 && f.z < z1);
  assert.ok(Math.abs(groundHeight(f.x, f.z) + FRAME.H0 - SLF.fieldLv95.H) < 3, 'the terrain at the field');
  for (const p of [SLF.field, SLF.arrival]) assert.ok(!inBuilding(p.x, p.z), 'outside the buildings up there');
  assertWalkable(SLF.arrival, SLF.field, 'the field');
});

// --- The eye test ----------------------------------------------------------------------------------------------------
/** Plays one question to its answer */
function ask(g) {
  eyeFlip(g); eyeFlip(g);
  for (let i = 0; i < 40 && !g.cmp.answer; i++) eyeStep(g, DT);
  return g.cmp.answer;
}
/** A good optician: big steps until the answer turns, then quarter steps until "the same" */
function testDial(g, dial) {
  eyeSetDial(g, dial);
  let step = 1, prev = null;
  eyeSetStep(g, step);
  for (let n = 0; n < 24; n++) {
    let a = ask(g);
    if (a === 'sharp') { eyeScold(g); a = ask(g); }
    if (a === 'same') {
      eyeKeep(g);
      if (step === 0.25) return;
      step = 0.25; prev = null; eyeSetStep(g, step);
      continue;
    }
    if (step === 1 && prev && prev !== a) { eyeKeep(g); step = 0.25; prev = null; eyeSetStep(g, step); continue; }
    eyeTake(g, a === 'one' ? 1 : 2);
    prev = a;
  }
}
const finishPause = (g) => { while (g.pause > 0) eyeStep(g, DT); };

test('the chart blurs with the lens error: nothing at the prescription, smeared along the axis by the cylinder', () => {
  const c = { S: -2, C: -1, axis: 30 };
  assert.deepEqual(eyeKernel(c, { sph: -2, cyl: -1 }).rx, 0);
  assert.deepEqual(eyeKernel(c, { sph: -2, cyl: -1 }).ry, 0);
  const sph = eyeKernel(c, { sph: -1, cyl: -1 });
  assert.equal(sph.rx, sph.ry, 'the sphere: a round blur');
  const cyl = eyeKernel(c, { sph: -2, cyl: 0 });
  assert.ok(cyl.rx > 0 && cyl.ry === 0, 'the cylinder: along its axis only');
  assert.ok(Math.abs(cyl.rot - (30 * Math.PI) / 180) < 1e-9);
  assert.ok(eyeKernel(c, { sph: 0, cyl: 0 }, true).rx < eyeKernel(c, { sph: 0, cyl: 0 }).rx, 'a squint sharpens it');
  assert.ok(eyeKernel(c, { sph: 40, cyl: 0 }).rx <= EYE.blur.max);
  assert.equal(fmtDioptre(1.25), '+1.25'); assert.equal(fmtDioptre(-0.75), '−0.75'); assert.equal(fmtDioptre(0), '±0.00');
});

test('the customers answer: nearer lens better, the same when equal, the squinter finds everything sharp', () => {
  const never = () => 0.99, always = () => 0;
  const c = { kind: 'honest', S: -2, C: -1, squint: false };
  assert.equal(eyeAnswer(c, { dial: 'sph', one: -3, two: -1 }, never), 'same');
  assert.equal(eyeAnswer(c, { dial: 'sph', one: -2.5, two: -1 }, never), 'one');
  assert.equal(eyeAnswer(c, { dial: 'cyl', one: -3, two: -1 }, never), 'two');
  const u = { ...c, kind: 'unsure' };
  assert.equal(eyeAnswer(u, { dial: 'sph', one: -2.25, two: -1.75 }, always), 'same', 'the same stays the same');
  assert.equal(eyeAnswer(u, { dial: 'sph', one: -2.5, two: -2 }, always), 'one', 'a close call the wrong way');
  assert.equal(eyeAnswer(u, { dial: 'sph', one: -2.5, two: -2 }, never), 'two');
  assert.equal(eyeAnswer(u, { dial: 'sph', one: -2.75, two: -2.25 }, always), 'one', 'wrong way round');
  assert.equal(eyeAnswer(u, { dial: 'sph', one: -5, two: -2 }, always), 'two', 'a wide gap never');
  assert.equal(eyeLine(u, 'one'), 'Hmm … one? Yes, one.');
  assert.equal(eyeAnswer({ ...c, squint: true }, { dial: 'sph', one: -9, two: 9 }, never), 'sharp');
});

test('an answer only comes once both lenses were seen; taking and keeping settle the question', () => {
  const g = createEyeTest(3);
  const c = eyeCustomer(g);
  const before = c.lens.sph;
  assert.ok(!eyeTake(g, 1), 'nothing to take yet');
  eyeFlip(g);
  assert.equal(c.steps, 1);
  assert.equal(eyeShown(g).sph, before - 1);
  for (let i = 0; i < 60; i++) eyeStep(g, DT);
  assert.equal(g.cmp.answer, null, 'only lens one seen');
  eyeFlip(g);
  assert.equal(eyeShown(g).sph, before + 1);
  for (let i = 0; i < 20; i++) eyeStep(g, DT);
  assert.ok(g.cmp.answer);
  eyeFlip(g);
  assert.equal(c.steps, 1, 'flipping back is no new question');
  assert.ok(eyeTake(g, 2));
  assert.equal(c.lens.sph, before + 1);
  eyeFlip(g); assert.ok(eyeKeep(g));
  assert.equal(c.lens.sph, before + 1);
  assert.equal(g.cmp, null);
});

test('the squinter is caught, tells the truth for two questions, then squints again', () => {
  const g = createEyeTest(3);
  g.index = g.customers.findIndex((c) => c.kind === 'squinter');
  const c = eyeCustomer(g);
  assert.ok(c.squint);
  assert.equal(ask(g), 'sharp');
  eyeKeep(g);
  assert.ok(eyeScold(g));
  assert.ok(!eyeScold(g), 'nothing to tell off now');
  assert.notEqual(ask(g), 'sharp'); eyeKeep(g);
  assert.ok(!c.squint);
  assert.notEqual(ask(g), 'sharp'); eyeKeep(g);
  assert.ok(c.squint, 'and again');
  assert.equal(ask(g), 'sharp'); eyeKeep(g);
});

test('a good optician earns gold on any seed: every prescription exact', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 77, 1234]) {
    const g = createEyeTest(seed);
    while (eyeCustomer(g) && !g.done) {
      const c = eyeCustomer(g);
      testDial(g, 'sph');
      testDial(g, 'cyl');
      if (c.kind !== 'unsure') {
        assert.equal(c.lens.sph, c.S, `seed ${seed} ${c.name}: the sphere`);
        assert.equal(c.lens.cyl, c.C, `seed ${seed} ${c.name}: the cylinder`);
      }
      eyePrescribe(g);
      finishPause(g);
    }
    assert.ok(g.done && g.results.length === 4, 'all four done');
    assert.ok(g.score >= EYE.medals.silver, `seed ${seed}: ${g.score}`);
    if (g.results.every((r) => r.quality.err < 0.01)) assert.equal(medalFor(g.score, missionMedals(EYE_MISSION), true), 'gold', `seed ${seed}: ${g.score}`);
    assert.equal(EYE_MISSION.score({ game: g }), g.score);
    assert.match(EYE_MISSION.summary({ game: g })[0], /^4 of 4 customers · \d exact · /);
  }
});

test('waving them through earns no medal: the bonuses hang on the accuracy', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = createEyeTest(seed);
    while (eyeCustomer(g) && !g.done) { eyePrescribe(g); finishPause(g); }
    assert.equal(g.results.length, 4);
    assert.equal(medalFor(g.score, missionMedals(EYE_MISSION), true), null, `seed ${seed}: ${g.score}`);
  }
  // near enough scores in between, the quality falls with the error and with too many questions
  const c = { S: -2, C: -1, lens: { sph: -2, cyl: -1 }, start: { sph: 0, cyl: 0 }, steps: 3, t: 10, caught: 0, kind: 'honest' };
  const exact = eyeQuality(c);
  assert.equal(exact.total, EYE.points.accuracy + EYE.points.steps + EYE.points.quick);
  assert.equal(eyePar(c), 7);
  assert.ok(eyeQuality({ ...c, lens: { sph: -1.75, cyl: -1 } }).total < exact.total);
  assert.ok(eyeQuality({ ...c, steps: 12 }).total < exact.total);
  assert.ok(eyeQuality({ ...c, t: 40 }).total < exact.total);
  assert.equal(eyeQuality({ ...c, lens: { sph: 3, cyl: 0 } }).total, 0);
});

test('the clock ends the morning, and stands still while the verdict is up', () => {
  const g = createEyeTest(3);
  eyePrescribe(g);
  const t0 = g.t;
  eyeStep(g, 1);
  assert.equal(g.t, t0);
  assert.ok(!eyeFlip(g) && !eyePrescribe(g), 'nothing to do meanwhile');
  finishPause(g);
  assert.equal(g.index, 1);
  for (let i = 0; i < 60 * EYE.length && !g.done; i++) eyeStep(g, 1 / 60);
  assert.ok(g.done);
  assert.equal(g.results.length, 1);
});

// --- The snow profile ------------------------------------------------------------------------------------------------
test('the snowpack: layers stack to the surface, one hidden weak layer on the crust, under a slab', () => {
  for (let seed = 1; seed < 80; seed++) {
    const s = createSnowpack(seed);
    assert.equal(s.layers[0].top, s.H);
    assert.equal(s.layers[s.layers.length - 1].bottom, 0);
    for (let i = 1; i < s.layers.length; i++) assert.equal(s.layers[i].top, s.layers[i - 1].bottom);
    assert.equal(s.layers.filter((l) => l.weak).length, 1);
    const weak = s.layers[s.weak];
    assert.ok(weak.hard <= 1 && ['FC', 'DH'].includes(weak.grain));
    assert.ok(s.layers[s.weak - 1].hard > weak.hard, 'a stiffer slab over it');
    assert.equal(s.layers[s.weak + 1].grain, 'MF', 'on the crust');
    assert.ok(s.ct >= 6 && s.ct <= SNOW.tap.max);
    assert.ok(s.H >= 90 && s.H <= 180);
    assert.ok(s.danger >= 2 && s.danger <= 5);
    assert.equal(s.danger, dangerFor(s));
    assert.ok(snowTempAt(s, 0) === Math.round(s.surfaceT * 10) / 10);
    assert.ok(snowTempAt(s, s.H) === -0.4);
    const ds = snowDepths(s);
    for (let i = 1; i < ds.length; i++) {
      assert.equal(ds[i] - ds[i - 1], 10);
      assert.ok(snowTempAt(s, ds[i]) >= snowTempAt(s, ds[i - 1]), 'warmer towards the ground');
    }
  }
  assert.deepEqual(createSnowpack(5), createSnowpack(5), 'by the seed');
  assert.notDeepEqual(createSnowpack(5), createSnowpack(6));
});

test('the danger: the easier it breaks, the higher; fresh snow adds a level', () => {
  assert.equal(dangerFor({ ct: 8, newSnow: 10 }), 4);
  assert.equal(dangerFor({ ct: 15, newSnow: 10 }), 3);
  assert.equal(dangerFor({ ct: 25, newSnow: 10 }), 2);
  assert.equal(dangerFor({ ct: 25, newSnow: 35 }), 3);
  assert.equal(dangerFor({ ct: 8, newSnow: 35 }), 5);
});

test('the hand test: a tool goes in when it is at least as thin as the layer is hard', () => {
  assert.deepEqual(HARDNESS.map((h) => h.id), ['F', '4F', '1F', 'P', 'K']);
  assert.ok(toolGoesIn(0, 0) && toolGoesIn(1, 1) && toolGoesIn(1, 4));
  assert.ok(!toolGoesIn(1, 0) && !toolGoesIn(4, 3));
});

/** Plays the game: `play` says how well */
function playSnow(seed, { hardOff = 0, grainWrong = false, holdS = 1.2, level = null, pickWeak = true, wait = 0 } = {}) {
  const g = createSnowGame(seed), s = g.snow;
  for (let i = 0; i < 30 * 60 && g.stage === 'dig'; i++) snowStep(g, { dig: true }, DT);
  assert.equal(g.stage, 'layers');
  for (let w = 0; w < wait * 30; w++) snowStep(g, {}, DT);
  while (g.stage === 'layers') {
    const l = s.layers[g.layer], tool = Math.min(HARDNESS.length - 1, l.hard + hardOff);
    assert.ok(!snowWrite(g), 'nothing tested yet');
    assert.ok(snowTest(g, tool));
    assert.ok(!snowWrite(g), 'not while the push is under way');
    for (let i = 0; i < 30 && g.busy > 0; i++) snowStep(g, {}, DT);
    assert.equal(g.tests[0].in, true);
    assert.ok(snowWrite(g));
    assert.ok(!snowGrain(g, 'nonsense'));
    assert.ok(snowGrain(g, grainWrong ? GRAINS.find((v) => v.id !== l.grain).id : l.grain));
  }
  assert.equal(g.stage, 'temp');
  while (g.stage === 'temp') {
    for (let t = 0; t < holdS; t += DT) snowStep(g, { hold: true }, DT);
    snowStep(g, {}, DT);
  }
  assert.equal(g.record.temps.length, g.depths.length);
  assert.equal(g.stage, 'ct');
  let taps = 0;
  while (g.stage === 'ct') { if (snowTap(g)) taps++; snowStep(g, {}, DT); }
  assert.equal(taps, s.ct);
  assert.equal(g.record.ctTap, s.ct);
  assert.equal(g.stage, 'pick');
  assert.ok(snowPick(g, pickWeak ? s.weak : (s.weak + 1) % s.layers.length));
  assert.ok(!snowDanger(g, 9));
  assert.ok(snowDanger(g, level ?? s.danger));
  assert.equal(g.stage, 'sheet');
  const t = g.t;
  snowStep(g, {}, 5);
  assert.equal(g.t, t, 'the clock stops at the sheet');
  assert.ok(!g.done);
  assert.ok(snowClose(g));
  assert.ok(g.done);
  return g;
}

test('a careful, quick observer earns gold on any snowpack', () => {
  for (const seed of [1, 2, 3, 7, 11, 23, 99, 2024]) {
    const g = playSnow(seed);
    const r = g.result;
    assert.equal(r.hardness, SNOW.points.hardness);
    assert.equal(r.grain, SNOW.points.grain);
    assert.equal(r.temp, SNOW.points.temp);
    assert.equal(r.ct, SNOW.points.ct);
    assert.equal(r.danger, SNOW.points.danger);
    assert.equal(medalFor(r.total, missionMedals(SNOW_MISSION), true), 'gold', `seed ${seed}: ${r.total}, ${g.t.toFixed(0)} s`);
    assert.ok(g.t < 120, 'well inside the time');
    assert.equal(SNOW_MISSION.score({ game: g }), r.total);
    assert.match(SNOW_MISSION.summary({ game: g })[0], /^Hardness 200 · grain 200 · temperature 150 · break 100 · danger 200 · time \d+$/);
  }
});

test('the sheet is compared with the truth: each kind of sloppiness costs its share', () => {
  const seed = 11, good = playSnow(seed).result;
  assert.equal(playSnow(seed, { hardOff: 4 }).result.hardness < good.hardness, true, 'the wrong tool');
  const near = createSnowGame(seed);
  near.record.hard = near.snow.layers.map((l) => (l.hard === 4 ? 3 : l.hard + 1));
  assert.equal(snowScore(near).hardness, SNOW.points.hardness / 2, 'one step off: half');
  assert.equal(playSnow(seed, { grainWrong: true }).result.grain, 0);
  assert.ok(playSnow(seed, { holdS: 0.15 }).result.temp < good.temp / 3, 'the thermometer out before it settled');
  assert.equal(playSnow(seed, { pickWeak: false }).result.ct, 0);
  const lv = createSnowpack(seed).danger;
  assert.equal(playSnow(seed, { level: lv === 5 ? 4 : lv + 1 }).result.danger, SNOW.points.dangerNear);
  assert.equal(playSnow(seed, { level: lv <= 2 ? 5 : 1 }).result.danger, 0);
  assert.ok(playSnow(seed, { wait: 200 }).result.time === 0, 'and the time');
  const sloppy = playSnow(seed, { hardOff: 4, grainWrong: true, holdS: 0.1, pickWeak: false, level: lv <= 2 ? 5 : 1, wait: 200 }).result.total;
  assert.equal(medalFor(sloppy, missionMedals(SNOW_MISSION), true), null, `all at once: ${sloppy}`);
});

test('the danger scale and the kit are the real ones', () => {
  assert.deepEqual(DANGER.map((d) => d.level), [1, 2, 3, 4, 5]);
  assert.deepEqual(GRAINS.map((v) => v.id), ['PP', 'DF', 'RG', 'FC', 'DH', 'MF']);
  assert.equal(SNOW.tempStep, 10);
  assert.equal(SNOW.tap.max, 30);
  const sum = ['hardness', 'grain', 'temp', 'ct', 'danger', 'time'].reduce((n, k) => n + SNOW.points[k], 0);
  assert.equal(sum, 1000);
});

test('the snow mission walks its steps: kit, the ride, the field, the profile', () => {
  const m = SNOW_MISSION, state = m.createState();
  assert.deepEqual(m.objectives.map((o) => o.id), ['kit', 'ride', 'field', 'profile']);
  assert.equal(m.season, 'winter');
  assert.ok(!m.objectives[0].check({ x: SLF.start.x, z: SLF.start.z }, state).done);
  assert.ok(m.objectives[0].check({ x: SLF.door.x, z: SLF.door.z }, state).done);
  assert.ok(!m.objectives[1].check({}, state).done);
  state.arrived = true;
  assert.ok(m.objectives[1].check({}, state).done);
  assert.ok(m.objectives[2].check({ x: SLF.field.x, z: SLF.field.z }, state).done);
  assert.ok(!m.objectives[3].check({}, state).done);
  state.game = createSnowGame(3);
  assert.match(m.objectives[3].check({}, state).text, /^Dig down to the ground · 0:00$/);
});
