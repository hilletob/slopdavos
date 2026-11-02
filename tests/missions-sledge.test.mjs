import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HORN_SLEDGE_MISSION, SLEDGE_MISSIONS, HORN_RUN, SLEDGE_TRACK, SLEDGE_CRASH_MS, createCourse, findBends, projectOnRun,
  runCurvature, createSledge, stepSledge, resetSledge, botInput, hornCheckpoints
} from '../js/missions-data-sledge.js';
import { riderSpeed } from '../js/missions-data-snow.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

// (js/missions-data-sledge.js is three.js-free: the sledge runs on synthetic slopes here, the bot on the real terrain)

const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 0.1, t: 0, ...over });
const slope = (grade) => (x, z) => -grade * z; // downhill along +z
const DT = 1 / 120;

test('the horn sledge race is listed, in winter, on foot, and its run lies within the map', () => {
  assert.equal(getMission('horn-sledge-rinerhorn'), HORN_SLEDGE_MISSION);
  assert.ok(MISSIONS.includes(HORN_SLEDGE_MISSION));
  assert.deepEqual(SLEDGE_MISSIONS, [HORN_SLEDGE_MISSION]);
  const m = HORN_SLEDGE_MISSION;
  assert.equal(m.mode, 'person'); assert.equal(m.season, 'winter'); assert.deepEqual(m.features, ['hornSledge']);
  assert.ok(m.medals.gold < m.medals.silver && m.medals.silver < m.medals.bronze);
  const [x0, z0, x1, z1] = DAVOS_DATA.meta.bounds;
  for (let i = 0; i < HORN_RUN.length; i += 2) {
    assert.ok(HORN_RUN[i] > x0 && HORN_RUN[i] < x1 && HORN_RUN[i + 1] > z0 && HORN_RUN[i + 1] < z1, `node ${i / 2} inside`);
  }
  const s = m.start;
  assert.ok(Math.hypot(s.x - HORN_RUN[0], s.z - HORN_RUN[1]) < 1 && Number.isFinite(s.heading));
  assert.ok(Math.hypot(m.pin.x - s.x, m.pin.z - s.z) < 15, 'the pin at the start');
  const course = createCourse();
  assert.ok(course.length > 1950 && course.length < 2100, `the run ${course.length} m`);
});

test('the run is projected: arc length and the side, also in the hairpins', () => {
  const course = createCourse([0, 0, 0, 100, 50, 100]); // down +z, then a right angle to +x
  const p = projectOnRun(course, 3, 40);
  assert.ok(Math.abs(p.s - 40) < 1e-9);
  // heading +z: the left is +x
  assert.ok(Math.abs(p.d - 3) < 1e-9);
  assert.ok(Math.abs(projectOnRun(course, 20, 104).s - 120) < 1e-9);
  // the hint keeps the search local
  const q = projectOnRun(course, 25, 101, 1);
  assert.equal(q.i, 1);
});

test('bends: the tight turns are found with the net on their outside', () => {
  // a straight, a left-hand quarter circle of radius 20 m, a straight
  const pts = [0, 0, 0, 60];
  for (let a = 0; a <= Math.PI / 2 + 1e-9; a += Math.PI / 32) pts.push(20 - 20 * Math.cos(a), 60 + 20 * Math.sin(a));
  pts.push(100, 80);
  const course = createCourse(pts);
  assert.ok(runCurvature(course, 70) > 0, 'a left-hand bend curves positive');
  const bends = findBends(course);
  assert.equal(bends.length, 1);
  assert.equal(bends[0].side, -1, 'the net on the right, outside the left-hand bend');
  assert.ok(bends[0].s0 < 65 && bends[0].s1 > 85);
  assert.ok(createCourse().bends.length >= 8, 'the Rinerhorn run has its hairpins');
});

test('the sledge runs down a slope, faster on the run than in the deep snow beside it, and brakes', () => {
  const course = createCourse([0, 0, 0, 2000]);
  const h = slope(0.15);
  const run = (x, input, secs = 12) => {
    const sl = createSledge(course, h, 0);
    sl.rider.x = x;
    for (let t = 0; t < secs; t += DT) stepSledge(sl, input, DT, h, course);
    return sl;
  };
  const onRun = run(0, {}), deep = run(6, {}), braking = run(0, { brake: 1 }), ducked = run(0, { tuck: 1 });
  assert.ok(riderSpeed(onRun.rider) > 9, `on the run ${riderSpeed(onRun.rider)}`);
  assert.ok(riderSpeed(deep.rider) < riderSpeed(onRun.rider) * 0.7, 'the deep snow holds it back');
  assert.ok(riderSpeed(braking.rider) < 3, 'the brake holds it');
  assert.ok(riderSpeed(ducked.rider) > riderSpeed(onRun.rider), 'ducked: less drag');
  assert.equal(onRun.crashes, 0);
});

test('too tight a turn at speed tips the sledge over: a crash, then back on the run', () => {
  const course = createCourse([0, 0, 0, 3000]);
  const h = slope(0.3);
  const sl = createSledge(course, h, 0);
  for (let t = 0; t < 12; t += DT) stepSledge(sl, { tuck: 1 }, DT, h, course);
  assert.ok(riderSpeed(sl.rider) > 14, `${riderSpeed(sl.rider)}`);
  let ev = null;
  for (let t = 0; t < 2 && ev !== 'crash'; t += DT) ev = stepSledge(sl, { steer: 1 }, DT, h, course);
  assert.equal(ev, 'crash');
  assert.equal(sl.last, 'tip');
  assert.equal(sl.crashes, 1);
  let back = null;
  for (let t = 0; t < 3 && back !== 'back'; t += DT) back = stepSledge(sl, {}, DT, h, course);
  assert.equal(back, 'back');
  assert.ok(Math.abs(sl.proj.d) < 0.01 && riderSpeed(sl.rider) === 0, 'on the line, at rest');
  // the same turn slowly: no crash (the tip limit is a lateral acceleration)
  const slow = createSledge(course, (x, z) => 0, 0);
  slow.rider.vz = 4;
  for (let t = 0; t < 1; t += DT) assert.notEqual(stepSledge(slow, { steer: 1 }, DT, (x, z) => 0, course), 'crash');
});

test('the net on the outside of a bend stops a slow sledge and throws a fast one', () => {
  const pts = [0, 0, 0, 60];
  for (let a = 0; a <= Math.PI / 2 + 1e-9; a += Math.PI / 32) pts.push(20 - 20 * Math.cos(a), 60 + 20 * Math.sin(a));
  pts.push(100, 80);
  const course = createCourse(pts);
  const flat = () => 0;
  const into = (v) => {
    const sl = createSledge(course, flat, 0);
    resetSledge(sl, course, flat, 70);
    const r = sl.rider;
    r.x = sl.proj.x - sl.proj.tz * (SLEDGE_TRACK.half + SLEDGE_TRACK.netGap - 0.1); // (just inside the net, on the right)
    r.z = sl.proj.z + sl.proj.tx * (SLEDGE_TRACK.half + SLEDGE_TRACK.netGap - 0.1);
    r.vx = -sl.proj.tz * v; r.vz = sl.proj.tx * v; // (straight at it)
    r.heading = Math.atan2(r.vx, r.vz);
    let ev = null;
    for (let t = 0; t < 0.5 && !ev; t += DT) ev = stepSledge(sl, {}, DT, flat, course);
    return { ev, sl };
  };
  assert.equal(into(3).ev, 'net');
  const fast = into(SLEDGE_TRACK.netCrash + 3);
  assert.equal(fast.ev, 'crash');
  assert.equal(fast.sl.last, 'net');
});

test('the checkpoints, the sections and the penalties', () => {
  const m = HORN_SLEDGE_MISSION;
  const state = m.createState();
  assert.deepEqual(state.cps, hornCheckpoints());
  assert.ok(state.cps.length >= 10);
  // through every checkpoint in order: the three sections are done
  let done = 0;
  for (const cp of state.cps) {
    m.update(frame({ x: cp.x, z: cp.z }), state);
    while (done < m.objectives.length && m.objectives[done].check(frame({ x: cp.x, z: cp.z }), state).done) done++;
  }
  assert.equal(done, m.objectives.length);
  // a crash in the state shows as the hint and in the summary
  const s2 = m.createState();
  Object.assign(s2, { crashT: 1, why: 'tip', crashes: 2 });
  const v = m.objectives[0].check(frame({ x: s2.cps[0].x, z: s2.cps[0].z - 50 }), s2);
  assert.match(v.hint, /Tipped over/);
  assert.match(v.text, /2 crashes \(\+10 s\)/);
  assert.match(m.summary(s2)[0], /2 crashes \(\+10 s\)/);
  assert.equal(SLEDGE_CRASH_MS, 5000);
});

test('a bot down the Rinerhorn run on the real terrain: finished, inside the medals', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const course = createCourse();
  const sl = createSledge(course, groundHeight, 0);
  let t = 0;
  while (t < 400 && sl.proj.s < course.length - 3) {
    stepSledge(sl, sl.crashT > 0 ? {} : botInput(sl, course, { margin: 0.6 }), DT, groundHeight, course);
    t += DT;
  }
  const total = t * 1000 + sl.crashes * SLEDGE_CRASH_MS;
  assert.ok(sl.proj.s >= course.length - 3, 'at the finish');
  assert.ok(total > 100000, `not implausibly fast: ${total}`);
  assert.ok(medalFor(total, HORN_SLEDGE_MISSION.medals), `a careful bot earns a medal: ${(total / 1000).toFixed(1)} s`);
});
