import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SLALOM_MISSION, BIG_AIR_MISSION, MTB_MISSION, SNOW_MISSIONS, BIG_AIR, MTB_TRAIL, SLALOM_GATES, SLALOM_MISS_MS,
  buildSlalomGates, crossGate, updateSlalom, buildCheckpoints, updateCheckpoints, scoreJump, judgeLanding, yawError,
  recordBigAirJump, bigAirTotal, offTheKicker, bigAirProfile, createRider, stepRider, riderSpeed, lineLength, SKI_PARAMS,
  BOARD_PARAMS
} from '../js/missions-data-snow.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor, recordCompletion, emptyProgress } from '../js/missions-progress.js';

// (js/missions-data-snow.js is three.js-free: the gates, the tricks and the checkpoints run on synthetic moves here)

const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 0.1, t: 0, ...over });

test('the three mountain missions are listed, complete and in their seasons', () => {
  for (const m of SNOW_MISSIONS) {
    assert.equal(getMission(m.id), m);
    assert.ok(MISSIONS.includes(m));
    const s = m.start;
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.heading), `${m.id} has a start`);
    assert.ok(m.objectives.length >= 2);
  }
  assert.deepEqual(SNOW_MISSIONS.map((m) => [m.id, m.mode, m.season, m.features[0]]), [
    ['ski-slalom', 'person', 'winter', 'skis'], ['big-air', 'person', 'winter', 'board'], ['mtb-race', 'cyclist', 'summer', 'mtb']
  ]);
  assert.ok(BIG_AIR_MISSION.scoreMode && BIG_AIR_MISSION.medals.gold > BIG_AIR_MISSION.medals.bronze);
});

// --- Gates ----------------------------------------------------------------------------------------------------------
test('slalom gates alternate red and blue, left and right of the run line, evenly along it', () => {
  const pts = [0, 0, 0, 1000]; // straight down +z
  const gates = buildSlalomGates(pts, { count: 10, from: 50, to: 50, offset: 4, half: 3 });
  assert.equal(gates.length, 10);
  assert.deepEqual(gates.slice(0, 3).map((g) => g.colour), ['red', 'blue', 'red']);
  // the left of +z is +x in this frame (heading π/2 is +x, turning left raises the heading)
  assert.equal(gates[0].x, 4); assert.equal(gates[1].x, -4);
  assert.equal(gates[0].z, 50); assert.equal(gates[9].z, 950);
  assert.equal(SLALOM_MISSION.createState().gates.length, SLALOM_GATES);
});

test('a gate is passed between its poles, missed beside them, and only crossed in the way down', () => {
  const g = { x: 0, z: 100, tx: 0, tz: 1, nx: 1, nz: 0, half: 3 };
  assert.deepEqual(crossGate(g, 1, 99, 1, 101), { pass: true, offset: 1 });
  assert.equal(crossGate(g, 5, 99, 5, 101).pass, false); // outside the poles (3 m + 0.4 m tolerance)
  assert.equal(crossGate(g, 3.3, 99, 3.3, 101).pass, true); // just inside the tolerance
  assert.equal(crossGate(g, 1, 101, 1, 99), null); // uphill
  assert.equal(crossGate(g, 1, 90, 1, 95), null); // not there yet
  assert.equal(crossGate(g, 80, 99, 80, 101), null); // far off: not this gate's business
});

test('the slalom counts passes and misses in order, a skipped gate is missed, a miss costs 3 s', () => {
  const state = { gates: buildSlalomGates([0, 0, 0, 400], { count: 4, from: 50, to: 50, offset: 4, half: 3 }), next: 0, passed: 0, missed: 0, penaltyMs: 0, results: [null, null, null, null] };
  const ride = (x0, z0, x1, z1) => updateSlalom(state, x0, z0, x1, z1, SLALOM_MISS_MS);
  assert.deepEqual(ride(4, 45, 4, 55), [{ i: 0, pass: true }]); // through gate 1 (x = 4)
  assert.deepEqual(ride(10, 145, 10, 155), [{ i: 1, pass: false }]); // beside gate 2 (x = -4)
  // gate 3 skipped entirely: gate 4 crossed straight away
  const ev = ride(-4, 345, -4, 355);
  assert.deepEqual(ev, [{ i: 2, pass: false }, { i: 3, pass: true }]);
  assert.deepEqual(state.results, ['pass', 'miss', 'miss', 'pass']);
  assert.equal(state.passed, 2); assert.equal(state.missed, 2); assert.equal(state.penaltyMs, 6000);
  assert.equal(state.next, 4);
});

test('the slalom mission: through the gates, disqualified after the 4th miss, done over the finish line', () => {
  const m = SLALOM_MISSION, state = m.createState();
  const [gates, check] = [state.gates, m.objectives[0].check];
  // straight down the middle of every gate
  for (const g of gates) {
    m.update(frame({ x: g.x - g.tx * 2, z: g.z - g.tz * 2 }), state);
    m.update(frame({ x: g.x + g.tx * 2, z: g.z + g.tz * 2 }), state);
  }
  assert.equal(state.passed, SLALOM_GATES);
  const view = check(frame(), state);
  assert.equal(view.done, true); assert.equal(view.fail, null);
  const f = state.finishLine;
  m.update(frame({ x: f.x - f.tx * 3, z: f.z - f.tz * 3 }), state);
  m.update(frame({ x: f.x + f.tx * 3, z: f.z + f.tz * 3 }), state);
  assert.equal(m.objectives[1].check(frame(), state).done, true);
  // four misses: out
  const s2 = m.createState();
  for (const g of s2.gates.slice(0, 4)) {
    m.update(frame({ x: g.x + g.nx * 8 - g.tx * 2, z: g.z + g.nz * 8 - g.tz * 2 }), s2);
    m.update(frame({ x: g.x + g.nx * 8 + g.tx * 2, z: g.z + g.nz * 8 + g.tz * 2 }), s2);
  }
  assert.equal(s2.missed, 4);
  assert.match(check(frame(), s2).fail, /Disqualified/);
  assert.equal(s2.penaltyMs, 4 * SLALOM_MISS_MS);
});

// --- Tricks ---------------------------------------------------------------------------------------------------------
test('a jump scores its rotation, flips, grab and air; a sketchy landing 60 %, a crash nothing', () => {
  const straight = scoreJump({ time: 2, spin: 0.2, flip: 0, grab: 0, quality: 'clean', peak: 6 });
  assert.equal(straight.name, 'Straight air'); assert.equal(straight.points, 10 + 5);
  const j = scoreJump({ time: 2, spin: Math.PI * 4 + 0.3, flip: 0, grab: 0.75, quality: 'clean', peak: 3 });
  assert.equal(j.spinDeg, 720); assert.equal(j.grabbed, true);
  assert.equal(j.name, 'Backside 720 Grab');
  assert.equal(j.points, Math.round(48 + 10 + 6 + 10 + 3));
  const sketchy = scoreJump({ time: 2, spin: Math.PI * 4, grab: 0.75, quality: 'sketchy', peak: 3 });
  assert.equal(sketchy.points, Math.round((48 + 16 + 10 + 3) * 0.6));
  assert.equal(scoreJump({ time: 2, spin: Math.PI * 4, quality: 'crash' }).points, 0);
  const flip = scoreJump({ time: 2, spin: -Math.PI, flip: -Math.PI * 2, quality: 'clean' });
  assert.equal(flip.name, 'Backflip Frontside 180'); assert.equal(flip.flips, 1);
  // a 540 rounds from 500°, a 360 from 300°
  assert.equal(scoreJump({ spin: (500 * Math.PI) / 180 }).spinDeg, 540);
  assert.equal(scoreJump({ spin: (300 * Math.PI) / 180 }).spinDeg, 360);
});

test('the landing: the board along the way (switch counts) and upright', () => {
  assert.equal(judgeLanding(0.1, 0.1), 'clean');
  assert.equal(judgeLanding(0.6, 0.1), 'sketchy');
  assert.equal(judgeLanding(1.2, 0), 'crash');
  assert.equal(judgeLanding(0, 1.2), 'crash');
  // a 180: the board backwards is fine for a snowboard, not for skis
  assert.ok(Math.abs(yawError(Math.PI + 0.1, 0, true) - 0.1) < 1e-9);
  assert.ok(Math.abs(yawError(Math.PI + 0.1, 0, false)) > 3);
  // a board 90° across: a crash either way
  assert.equal(judgeLanding(yawError(Math.PI / 2, 0, true), 0), 'crash');
});

test('only a jump off the kicker counts, three at most, and the score is their sum', () => {
  const k = BIG_AIR.kicker, ax = Math.sin(k.heading), az = Math.cos(k.heading);
  const lip = { x: k.x + ax * BIG_AIR.kickerLength, z: k.z + az * BIG_AIR.kickerLength };
  assert.equal(offTheKicker(lip), true);
  assert.equal(offTheKicker({ x: k.x - ax * 30, z: k.z - az * 30 }), false); // a bump on the in-run
  assert.equal(offTheKicker({ x: lip.x + az * 12, z: lip.z - ax * 12 }), false); // beside it
  const state = BIG_AIR_MISSION.createState();
  const landing = (spin) => ({ time: 2, spin, flip: 0, grab: 0.6, quality: 'clean', peak: 5, takeoff: lip });
  assert.equal(recordBigAirJump(state, { ...landing(0), takeoff: { x: k.x - ax * 30, z: k.z - az * 30 } }), null);
  for (const spin of [Math.PI * 2, Math.PI * 4, Math.PI]) assert.ok(recordBigAirJump(state, landing(spin)));
  assert.equal(recordBigAirJump(state, landing(0)), null); // a fourth: no
  assert.equal(state.jumps.length, 3);
  assert.equal(bigAirTotal(state), state.jumps.reduce((a, j) => a + j.points, 0));
  assert.equal(BIG_AIR_MISSION.score(state), bigAirTotal(state));
  const checks = BIG_AIR_MISSION.objectives.map((o) => o.check(frame(), state).done);
  assert.deepEqual(checks, [true, true, true]);
});

test('the big air medals go by points (scoreMode): more is better, the best score is kept', () => {
  const m = BIG_AIR_MISSION;
  assert.equal(medalFor(m.medals.gold, m.medals, true), 'gold');
  assert.equal(medalFor(m.medals.silver + 1, m.medals, true), 'silver');
  assert.equal(medalFor(m.medals.bronze - 1, m.medals, true), null);
  let { progress, award } = recordCompletion(emptyProgress(), m, 40000, 1, m.medals.silver);
  assert.equal(award.medal, 'silver'); assert.equal(progress.missions[m.id].bestScore, m.medals.silver);
  ({ progress, award } = recordCompletion(progress, m, 30000, 2, 10));
  assert.equal(award.medal, null); assert.equal(progress.missions[m.id].medal, 'silver');
  assert.equal(progress.missions[m.id].bestScore, m.medals.silver);
});

test('the kicker: a ramp up to its lip, a table and a landing falling away, nothing beside or before it', () => {
  const k = BIG_AIR.kicker, ax = Math.sin(k.heading), az = Math.cos(k.heading);
  const at = (u, v = 0) => bigAirProfile(k.x + ax * u + az * v, k.z + az * u - ax * v);
  assert.equal(at(-5), 0);
  assert.ok(at(3) < at(8) && at(8) < at(BIG_AIR.kickerLength - 0.1));
  assert.ok(Math.abs(at(BIG_AIR.kickerLength) - BIG_AIR.kickerHeight) < 0.05);
  assert.ok(at(BIG_AIR.kickerLength + 5) < BIG_AIR.kickerHeight);
  assert.ok(at(BIG_AIR.kickerLength + 20) < at(BIG_AIR.kickerLength + 12));
  assert.equal(at(5, 20), 0);
  assert.equal(at(200), 0);
});

// --- The rider ------------------------------------------------------------------------------------------------------
test('the rider: down a slope gravity wins, the brake holds, a lip throws it into the air', () => {
  const slope = Math.tan((20 * Math.PI) / 180);
  const plane = (x, z) => -z * slope; // falling along +z
  const r = createRider(0, 0, 0, 0);
  for (let i = 0; i < 240; i++) stepRider(r, { steer: 0 }, 1 / 120, plane, SKI_PARAMS);
  const v2 = riderSpeed(r);
  assert.ok(v2 > 4 && v2 < 9, `${v2} m/s after 2 s on 20°`);
  for (let i = 0; i < 240; i++) stepRider(r, { brake: 1 }, 1 / 120, plane, SKI_PARAMS);
  assert.ok(riderSpeed(r) < v2, 'braking slows down');
  // a turn to the left raises the heading and carries the velocity round
  const t = createRider(0, 0, 0, 0); t.vz = 10;
  for (let i = 0; i < 60; i++) stepRider(t, { steer: 1 }, 1 / 120, () => 0, SKI_PARAMS);
  assert.ok(t.heading > 0.3 && Math.atan2(t.vx, t.vz) > 0.2);
  // a step down 1 m at z = 10: airborne, then down again with a landing
  const step = (x, z) => (z < 10 ? 1 : 0);
  const a = createRider(0, 1, 0, 0); a.vz = 12;
  let landing = null;
  for (let i = 0; i < 240 && !landing; i++) landing = stepRider(a, { spin: a.airborne ? 1 : 0 }, 1 / 120, step, BOARD_PARAMS);
  assert.ok(landing, 'it landed');
  assert.ok(landing.time > 0.2 && landing.spin > 0.5);
  assert.equal(landing.takeoff.z > 9, true);
});

// --- Checkpoints ----------------------------------------------------------------------------------------------------
test('checkpoints along the trail, every ~110 m, the last at the finish', () => {
  const cps = buildCheckpoints([0, 0, 0, 1000], 100, 50);
  assert.equal(cps.length, 11);
  assert.equal(cps[0].z, 50); assert.equal(cps.at(-1).z, 1000);
  const trail = MTB_MISSION.createState().cps;
  assert.ok(trail.length >= 20 && trail.length <= 30, `${trail.length} checkpoints`);
  assert.ok(Math.abs(trail.at(-1).s - lineLength(MTB_TRAIL)) < 1e-6);
  assert.ok(lineLength(MTB_TRAIL) > 2500);
});

test('the checkpoints count in order only: a shortcut to a later one takes nothing and says which was missed', () => {
  const state = { cps: buildCheckpoints([0, 0, 0, 400], 100, 100), next: 0, skipped: null };
  assert.equal(updateCheckpoints(state, 0, 100), 'next');
  assert.equal(updateCheckpoints(state, 0, 300), 'skipped'); // cut past 200
  assert.equal(state.next, 1); assert.equal(state.skipped, 1);
  assert.equal(updateCheckpoints(state, 30, 150), null); // between them: nothing
  assert.equal(updateCheckpoints(state, 2, 200), 'next'); // back to the missed one
  assert.equal(state.skipped, null);
  assert.equal(updateCheckpoints(state, 0, 300), 'next');
  assert.equal(updateCheckpoints(state, 0, 400), 'next');
  assert.equal(state.next, 4);
  assert.equal(updateCheckpoints(state, 0, 400), null); // all done
});

test('the race: two sections, the hint on a shortcut, crashes cost time', () => {
  const m = MTB_MISSION, state = m.createState();
  const [upper, lower] = m.objectives;
  const ride = (cp, st = state) => m.update(frame({ mode: 'cyclist', x: cp.x, z: cp.z }), st);
  // a shortcut from the start straight to checkpoint 3
  ride(state.cps[2]);
  const v = upper.check(frame({ mode: 'cyclist', x: state.cps[2].x, z: state.cps[2].z }), state);
  assert.equal(v.done, false);
  assert.match(v.text, /Checkpoint 1 missed/);
  assert.equal(v.target.style, 'hazard');
  for (const cp of state.cps) ride(cp);
  assert.equal(state.next, state.cps.length);
  assert.equal(upper.check(frame({ mode: 'cyclist' }), state).done, true);
  assert.equal(lower.check(frame({ mode: 'cyclist' }), state).done, true);
  // the upper section ends where the Bolgen Trail begins (some checkpoints left for the lower one)
  const s2 = m.createState();
  let k = 0;
  while (!upper.check(frame({ mode: 'cyclist' }), s2).done) ride(s2.cps[k++], s2);
  assert.ok(k > 10 && k < s2.cps.length - 2, `the Chüggelibahn ends after ${k} checkpoints`);
  s2.crashes = 2; s2.penaltyMs = 10000;
  assert.match(lower.check(frame({ mode: 'cyclist' }), s2).text, /2 crashes \(\+10 s\)/);
});
