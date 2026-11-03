import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HORN_SLEDGE_MISSION, SLEDGE_MISSIONS, HORN_RUN, SLEDGE_TRACK, SLEDGE_CRASH_MS, createCourse, findBends, projectOnRun,
  runCurvature, createSledge, stepSledge, resetSledge, botInput, hornCheckpoints,
  TOBOGGAN, TOBOGGAN_MISSION, TROUGH_RUN, createTrough, createToboggan, stepToboggan, createFamily, stepFamily, tobogganBot, tiltLean, troughY, troughCurve
} from '../js/missions-data-sledge.js';
import { riderSpeed, pointAt } from '../js/missions-data-snow.js';
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
  assert.ok(SLEDGE_MISSIONS.includes(HORN_SLEDGE_MISSION));
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

// --- The Sommerrodelbahn on the Schatzalp --------------------------------------------------------------------------------
const inRing = (r, x, z) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > z) !== (r[j + 1] > z) && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
  return c;
};
const inBuilding = (x, z) => DAVOS_DATA.buildings.some((b) => Math.abs(b.ring[0] - x) < 200 && Math.abs(b.ring[1] - z) < 200 && inRing(b.ring, x, z));
/** A run down the real trough: the bot (or `input`), the family on the track; { ms, bumps, rams, sl } */
function rideTrough(tr, drive, { family = true, limit = 300 } = {}) {
  const sl = createToboggan(TOBOGGAN.startS), fam = family ? createFamily() : null;
  let t = 0;
  while (t < limit && sl.s < tr.length - TOBOGGAN.finishAt) {
    if (fam) stepFamily(fam, DT, tr);
    stepToboggan(sl, drive(sl, fam), DT, tr, fam);
    t += DT;
  }
  return { ms: t * 1000 + sl.bumps * TOBOGGAN.bumpMs + sl.rams * TOBOGGAN.ramMs, bumps: sl.bumps, rams: sl.rams, sl, finished: sl.s >= tr.length - TOBOGGAN.finishAt };
}

test('the Sommerrodelbahn is listed, in summer, on foot, and starts and pins outside every building', () => {
  const m = TOBOGGAN_MISSION;
  assert.equal(getMission('sommerrodelbahn-schatzalp'), m);
  assert.ok(MISSIONS.includes(m) && SLEDGE_MISSIONS.includes(m));
  assert.equal(m.mode, 'person'); assert.equal(m.season, 'summer'); assert.deepEqual(m.features, ['tobogganRun']);
  assert.ok(m.medals.gold < m.medals.silver && m.medals.silver < m.medals.bronze);
  const s = m.start;
  assert.ok(!inBuilding(s.x, s.z), 'the start is not inside a building');
  assert.ok(!inBuilding(m.pin.x, m.pin.z), 'the pin is not inside a building');
  assert.ok(Number.isFinite(s.heading));
  // (facing down the run: the point a few metres on lies ahead)
  const c = createCourse(TROUGH_RUN, { half: TOBOGGAN.half });
  const ahead = pointAt(c.pts, TOBOGGAN.startS + 8);
  assert.ok(Math.sin(s.heading) * (ahead.x - s.x) + Math.cos(s.heading) * (ahead.z - s.z) > 0, 'facing down the run');
  // the course is the mapped way (456 m), no node of it in a building
  assert.ok(c.length > 450 && c.length < 460, `${c.length}`);
  for (let i = 0; i < TROUGH_RUN.length; i += 2) assert.ok(!inBuilding(TROUGH_RUN[i], TROUGH_RUN[i + 1]), `node ${i / 2}`);
  assert.equal(createTrough(() => 0).length, c.length);
});

test('the trough on the real terrain: always falling, always over the ground, eight hairpins', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const tr = createTrough(groundHeight);
  for (let i = 1; i < tr.n; i++) {
    assert.ok(tr.ys[i] <= tr.ys[i - 1] + 1e-3, `falls at ${i}`);
    assert.ok(tr.ys[i] >= tr.grounds[i] + 0.1, `over the ground at ${i}: ${tr.ys[i] - tr.grounds[i]}`);
    assert.ok(tr.ys[i] - tr.grounds[i] < 6, `posts of a plausible height at ${i}: ${tr.ys[i] - tr.grounds[i]}`);
  }
  // (a bend: a run of one sign turning more than a radian; up to the line, the way then only curls round to the tow line)
  let hairpins = 0, side = 0, turn = 0;
  for (let s = 0; s <= tr.length - TOBOGGAN.finishAt; s += 1) {
    const k = troughCurve(tr, s), sign = Math.abs(k) < 0.005 ? 0 : Math.sign(k);
    if (sign && sign !== side) { if (Math.abs(turn) > 1) hairpins++; turn = 0; side = sign; }
    turn += k;
  }
  if (Math.abs(turn) > 1) hairpins++;
  assert.equal(hairpins, 8, 'the eight bends of graubuenden.ch');
  assert.ok(tr.ys[0] - tr.ys[tr.n - 1] > 20 && tr.ys[0] - tr.ys[tr.n - 1] < 45, 'its ~30 m of drop');
});

test('on the rails: let go and it flies, the lever holds it, the lean helps round a bend', () => {
  const T = TOBOGGAN;
  const straight = createTrough((x, z) => -0.07 * z, [0, 0, 0, 900]);
  const go = (input, secs) => { const sl = createToboggan(0); for (let t = 0; t < secs; t += DT) stepToboggan(sl, input, DT, straight); return sl; };
  const free = go({}, 20), held = go({ brake: 1 }, 20);
  assert.ok(free.v > 11 && free.v < 15, `flat out ${free.v}`);
  assert.ok(held.v < 0.01 && held.s < 1, 'the lever holds it');
  // a hairpin of 6 m radius: at a speed under the lean's limit, the lean into it keeps it off the wall; out of it, over
  const pts = [0, 0, 0, 60];
  for (let a = 0; a <= Math.PI + 1e-9; a += Math.PI / 24) pts.push(6 - 6 * Math.cos(a), 60 + 6 * Math.sin(a));
  pts.push(12, 0);
  const bend = createTrough((x, z) => 0, pts);
  const through = (lean, v0) => {
    const sl = createToboggan(30);
    sl.v = v0;
    let peak = 0, ev = null;
    while (sl.s < 95 && !ev) {
      sl.v = v0;
      ev = stepToboggan(sl, { lean: lean * Math.sign(troughCurve(bend, sl.s)) }, DT, bend);
      peak = Math.max(peak, sl.wall);
    }
    return { peak, ev, sl };
  };
  assert.ok(through(0, 6).peak < 0.02, 'slowly, no climb');
  const warn = through(0, 9.2);
  assert.ok(warn.peak > 0.15 && !warn.ev, `too fast: up the wall, no bump (${warn.peak})`);
  assert.ok(through(1, 9.2).peak < warn.peak, 'the lean into the bend takes it down');
  assert.ok(through(-1, 9.2).peak > warn.peak, 'the lean out of it makes it worse');
  // way too fast: the comic bump, it stands, then rolls on
  const crash = through(0, 13);
  assert.equal(crash.ev, 'bump');
  assert.equal(crash.sl.last, 'bump');
  assert.equal(crash.sl.v, 0);
  assert.ok(crash.sl.stopT > 0 && crash.sl.bumps === 1);
  const s0 = crash.sl.s;
  for (let t = 0; t < T.stopS - 0.1; t += DT) stepToboggan(crash.sl, {}, DT, bend);
  assert.ok(crash.sl.s === s0 && crash.sl.v === 0, 'it stands');
  for (let t = 0; t < 2; t += DT) stepToboggan(crash.sl, {}, DT, bend);
  assert.ok(crash.sl.s > s0, 'and rolls on');
});

test('the family ahead: closing fast is a ram, closing slowly is not, and there is no way past', () => {
  const T = TOBOGGAN;
  const tr = createTrough((x, z) => -0.07 * z, [0, 0, 0, 900]);
  const ram = createToboggan(100); ram.v = 12;
  const lead = { s: 104, v: 6, gone: false, jolt: 0 };
  let ev = null;
  for (let t = 0; t < 1 && !ev; t += DT) { lead.s += lead.v * DT; ev = stepToboggan(ram, {}, DT, tr, lead); }
  assert.equal(ev, 'ram');
  assert.equal(ram.rams, 1);
  assert.ok(ram.v <= lead.v && ram.s <= lead.s - T.gap + 1e-6);
  const soft = createToboggan(100); soft.v = 6.5;
  const lead2 = { s: 100 + T.gap + 0.1, v: 6, gone: false, jolt: 0 };
  for (let t = 0; t < 6; t += DT) { lead2.s += lead2.v * DT; assert.notEqual(stepToboggan(soft, {}, DT, tr, lead2), 'ram'); }
  assert.ok(soft.s <= lead2.s - T.gap + 1e-6, 'held behind them');
  assert.equal(soft.rams, 0);
  // the family gets off at the foot of the run
  const real = createTrough((x, z) => -0.07 * z, [0, 0, 0, 200]);
  const f = createFamily(); f.s = 190;
  for (let t = 0; t < 10; t += DT) stepFamily(f, DT, real);
  assert.ok(f.gone);
});

test('the section checks, the hints and the summary', () => {
  const m = TOBOGGAN_MISSION;
  const st = m.createState();
  assert.ok(st.length > 450);
  const obj = m.objectives;
  assert.equal(obj.length, 3);
  assert.equal(obj[0].check(frame(), st).done, false);
  st.s = 181;
  assert.equal(obj[0].check(frame(), st).done, true);
  st.s = st.length - TOBOGGAN.finishAt;
  assert.equal(obj[2].check(frame(), st).done, true);
  st.s = 100; st.wall = 0.3;
  assert.match(obj[0].check(frame(), st).hint, /brake \(S\)/);
  st.wall = 0; st.familyGap = 8;
  assert.match(obj[0].check(frame(), st).hint, /family/);
  Object.assign(st, { bumps: 1, rams: 2, penaltyMs: 11000, familyGap: Infinity });
  assert.match(obj[0].check(frame(), st).text, /1 bump · 2 rams \(\+11 s\)/);
  assert.match(m.summary(st)[0], /1 bump · 2 rams/);
});

test('the phone tilt leans: upright with gamma, on its side with beta', () => {
  assert.equal(tiltLean(0, 0, 0), 0);
  assert.equal(tiltLean(4, 0, 0), 0);
  assert.equal(tiltLean(null, null, 0), 0);
  assert.equal(tiltLean(25, 0, 0), -1, 'tilted right: leans right');
  assert.equal(tiltLean(-25, 0, 0), 1);
  assert.equal(tiltLean(0, 25, 90), -1);
  assert.equal(tiltLean(0, 25, 270), 1);
});

test('bots down the real trough: the medals', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const tr = createTrough(groundHeight);
  const m = TOBOGGAN_MISSION.medals;
  const bold = rideTrough(tr, (sl, fam) => tobogganBot(sl, tr, fam, { margin: 1.25, lean: 1 }));
  const clean = rideTrough(tr, (sl, fam) => tobogganBot(sl, tr, fam, { margin: 0.95, lean: 1 }));
  const careful = rideTrough(tr, (sl, fam) => tobogganBot(sl, tr, fam, { margin: 0.55, lean: 0 }));
  const dumb = rideTrough(tr, () => ({}));
  const alone = rideTrough(tr, () => ({}), { family: false });
  const line = (r) => `${(r.ms / 1000).toFixed(1)} s, ${r.bumps} bumps, ${r.rams} rams`;
  console.log(`# trough bots: bold ${line(bold)} | clean ${line(clean)} | careful ${line(careful)} | no brake ${line(dumb)} | no brake, no family ${line(alone)}`);
  for (const r of [bold, clean, careful, dumb, alone]) assert.ok(r.finished);
  assert.equal(clean.bumps, 0); assert.equal(clean.rams, 0);
  assert.equal(careful.bumps, 0); assert.equal(careful.rams, 0);
  assert.equal(medalFor(clean.ms, m), 'gold', `a clean, leaning run: ${line(clean)}`);
  assert.equal(medalFor(careful.ms, m), 'silver', `a careful one without the lean: ${line(careful)}`);
  assert.equal(medalFor(dumb.ms, m), 'bronze', `never braking: ${line(dumb)}`);
  assert.ok(dumb.rams >= 3, `never braking rams the family: ${line(dumb)}`);
  assert.ok(alone.bumps >= 1, `even with the run to itself it goes over a wall: ${line(alone)}`);
});
