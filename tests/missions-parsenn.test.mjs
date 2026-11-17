import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PARSENN_MISSION, PARSENN_MISSIONS, PB, SECTIONS, VALLEY, lineProfile, speedLimits, limitAt, nextLimit, runTime, parsennLines,
  createDrive, driveStep, driveLine, toBoard, leverStep, toggleDoors, soundHorn, emergencyBrake, setTimelapse, timelapseAllowed,
  departureScore, arrivalScore, comfortScore, driveScore, fmtError
} from '../js/missions-data-parsenn.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { missionMedals, missionPin } from '../js/missions-progress.js';

// (js/missions-data-parsenn.js is three.js-free: the lines from js/bergbahnen-data.js, the car driven with synthetic frames)

const DT = 1 / 30;

/** A machinist bot: boards, sounds the horn, leaves on the minute, keeps under the limits (braking for them in time)
 *  and creeps to the board; `stopAt` m short of the board it lets the lever go (0: the line) */
function drive({ stopAt = 0, horn = true, timelapse = false, speedUp = 0, early = 0, d = createDrive() } = {}) {
  let frames = 0;
  const want = () => {
    const line = driveLine(d);
    let v = limitAt(line.limits, d.s, line.topKmh) / 3.6 - 0.3 + speedUp;
    for (const l of line.limits) if (l.from > d.s) v = Math.min(v, Math.sqrt(Math.max(0, (l.kmh / 3.6 - 0.3 + speedUp) ** 2 + 2 * 0.5 * (l.from - d.s - 3))));
    return Math.max(0, Math.min(v, Math.sqrt(Math.max(0, 2 * 0.45 * (toBoard(d) - stopAt - 0.6)))));
  };
  while (!d.done && frames++ < 100000) {
    if (d.phase === 'boarding' && d.boardT >= PB.boarding) toggleDoors(d);
    if (d.phase === 'ready') {
      const dep = d.timetable[d.k].depart - early;
      if (horn && d.t >= dep - 5 && d.t - d.hornT > 10) soundHorn(d);
      if (d.t >= dep) d.lever = 0.1;
    }
    if (d.phase === 'run') {
      const line = driveLine(d);
      d.lever = Math.max(toBoard(d) - stopAt > 0.5 ? PB.notch : 0, Math.floor(want() / line.vmax / PB.notch) * PB.notch);
      if (toBoard(d) - stopAt < 0.25) d.lever = 0;
      if (timelapse && !d.timelapse && timelapseAllowed(d)) setTimelapse(d, true);
    }
    if (d.phase === 'halt') toggleDoors(d);
    driveStep(d, { dt: DT });
    d.events.length = 0;
  }
  return { d, frames };
}

test('the Parsennbahn machinist is listed: all year at midday, on foot, with its pin, icon, medals and preloads', () => {
  const m = PARSENN_MISSION;
  assert.equal(getMission('parsenn-maschinist'), m);
  assert.ok(MISSIONS.includes(m));
  assert.deepEqual(PARSENN_MISSIONS.map((x) => x.id), ['parsenn-maschinist']);
  assert.equal(m.mode, 'person'); assert.equal(m.season, null); assert.equal(m.time, 'midday');
  assert.deepEqual(m.features, ['parsennCab']);
  assert.equal(m.scoreMode, 'points');
  assert.equal(m.board, 'parsenn-maschinist-1');
  const l = missionMedals(m);
  assert.ok(l.gold > l.silver && l.silver > l.bronze);
  assert.equal(m.objectives.length, 2);
  assert.deepEqual(missionPin(m), VALLEY);
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), /case 'funicular'/);
  assert.match(readFileSync(new URL('../js/missions.js', import.meta.url), 'utf8'), /PARSENN_FEATURES/);
  assert.match(readFileSync(new URL('../js/bergbahnen.js', import.meta.url), 'utf8'), /export const FUNICULAR_CONTROLS/);
  const play = readFileSync(new URL('../play.html', import.meta.url), 'utf8');
  for (const f of ['missions-data-parsenn.js', 'missions-parsenn.js']) assert.ok(play.includes(`href="./js/${f}"`), f);
  // (the pin at the valley station in Davos Dorf, clear of the other missions' start circles, 20 m from the track's end)
  for (const other of MISSIONS.filter((d) => d !== m)) { const p = missionPin(other); assert.ok(Math.hypot(p.x - VALLEY.x, p.z - VALLEY.z) > 16, other.id); }
  // (the leaderboard made on demand takes scores up to 100000: a perfect run is 600)
  assert.ok(m.medals.gold <= 600);
});

test('the two sections come from js/bergbahnen-data.js: lengths, trains, top speeds, the tunnels', () => {
  const [lo, up] = SECTIONS.map(lineProfile);
  assert.ok(Math.abs(lo.pathLen - 1912) < 3 && Math.abs(up.pathLen - 2205) < 3);
  assert.equal(lo.trainLength, 25.5); assert.equal(up.trainLength, 19);
  assert.equal(lo.vmax, 10); assert.equal(up.vmax, 6.2);
  // the lower section starts under the Salzgäba slope, the upper one ends in the Weissfluhjoch's tunnel
  assert.equal(lo.tunnels[0][0], 0); assert.ok(lo.tunnels[0][1] > 200);
  assert.ok(Math.abs(up.tunnels.at(-1)[1] - up.pathLen) < 1);
});

test('the speed limits: out of the station, through the loop and the tunnel, into the station; the next one ahead', () => {
  const [lo, up] = parsennLines();
  assert.equal(lo.topKmh, 36); assert.equal(up.topKmh, 22);
  assert.equal(limitAt(lo.limits, 10, 36), 15);
  assert.equal(limitAt(lo.limits, 500, 36), 36);
  // the loop is half-way: the limit from the front's entry to the rear's exit
  const mid = lo.pathLen / 2;
  assert.equal(limitAt(lo.limits, mid - 95 - lo.trainLength - 0.3 + 1, 36), 25);
  assert.equal(limitAt(lo.limits, mid + 95 - 0.3 - 1, 36), 25);
  assert.equal(limitAt(lo.limits, mid + 95 + 5, 36), 36);
  assert.equal(limitAt(lo.limits, 1200, 36), 30); // (the tunnel at 1192-1270 m)
  assert.equal(limitAt(lo.limits, lo.runLen - 100, 36), 20);
  assert.equal(limitAt(lo.limits, lo.runLen - 5, 36), 8);
  assert.equal(limitAt(up.limits, up.pathLen / 2 - 0.3 - up.trainLength / 2, 22), 15);
  assert.equal(limitAt(up.limits, up.runLen - 5, 22), 8);
  const n = nextLimit(lo.limits, 500, 36);
  assert.equal(n.kmh, 25); assert.equal(n.name, 'Passing loop');
  assert.equal(nextLimit(lo.limits, lo.runLen - 10, 36), null);
});

test('the timetable: the fastest run with a margin, the change at Höhenweg', () => {
  const lines = parsennLines();
  const d = createDrive(lines);
  const [a, b] = d.timetable;
  assert.equal(a.depart, PB.firstDeparture);
  assert.equal(b.depart, a.arrive + PB.change);
  for (const [k, t] of d.timetable.entries()) {
    const fastest = runTime(lines[k].limits, lines[k].runLen, lines[k].topKmh);
    assert.ok(t.arrive - t.depart >= fastest, `section ${k}`);
    assert.equal(t.arrive % 5, 0);
  }
  // (both sections at their top speed would take at least their length over it)
  assert.ok(a.arrive - a.depart > lines[0].runLen / 10 && b.arrive - b.depart > lines[1].runLen / 6.2);
});

test('the scores: departure, horn, arrival on time and at the board (cm), the ride', () => {
  assert.deepEqual(departureScore({ late: 3, horn: true }), { depart: 40, horn: 10 });
  assert.deepEqual(departureScore({ late: -2, horn: false }), { depart: 0, horn: 0 });
  assert.equal(departureScore({ late: 35, horn: true }).depart, 20);
  assert.deepEqual(arrivalScore({ delay: -8, error: 0.07 }), { punctual: 100, precise: 100 });
  assert.equal(arrivalScore({ delay: 0, error: 0.5 }).precise, 80);
  assert.equal(arrivalScore({ delay: 0, error: -1.1 }).precise, 50);
  assert.equal(arrivalScore({ delay: 0, error: 3 }).precise, 0);
  assert.equal(arrivalScore({ delay: 0, error: 0, buffer: true }).precise, 0);
  assert.equal(arrivalScore({ delay: 30, error: 0 }).punctual, 60);
  assert.equal(comfortScore({ hardS: 0, emergencies: 0 }), 50);
  assert.equal(comfortScore({ hardS: 0, emergencies: 1 }), 25);
  assert.equal(comfortScore({ hardS: 4, emergencies: 0 }), 0);
  assert.equal(fmtError(0.123), '+12 cm'); assert.equal(fmtError(-1.34), '−1.3 m');
});

test('the desk: the lever in notches, the doors interlocked with the boarding and the motion, the drive held while they are open', () => {
  const d = createDrive();
  assert.equal(d.phase, 'boarding'); assert.equal(d.doors, 'open');
  leverStep(d, 1);
  assert.equal(d.lever, PB.notch);
  assert.ok(d.events.some((e) => e.type === 'interlock'));
  for (let i = 0; i < 30; i++) driveStep(d, { dt: DT });
  assert.equal(d.v, 0, 'the doors open hold the car');
  assert.equal(toggleDoors(d), false, 'not before everyone is aboard');
  for (let i = 0; i < 400; i++) driveStep(d, { dt: DT });
  assert.equal(d.aboard, SECTIONS[0].passengers);
  assert.equal(toggleDoors(d), true);
  assert.equal(d.phase, 'ready');
  for (let i = 0; i < 20; i++) leverStep(d, 1);
  assert.equal(d.lever, 1);
  for (let i = 0; i < 90; i++) driveStep(d, { dt: DT });
  assert.equal(d.phase, 'run');
  assert.ok(d.v > 0.5 && d.v < 1.5, `the winch pulls away gently: ${d.v}`);
  assert.ok(d.a <= PB.driveAccel + 1e-9);
  assert.equal(toggleDoors(d), false, 'no doors while it moves');
  assert.ok(d.results.length === 0 && d.legs[0].departT > 0);
  // the lever's speed is held (no overshoot), the service brake slows within what standing people take
  for (let i = 0; i < 1500; i++) driveStep(d, { dt: DT });
  assert.ok(Math.abs(d.v - 10) < 1e-6, `the top speed: ${d.v}`);
  for (let i = 0; i < 90; i++) driveStep(d, { dt: DT, brake: true });
  assert.ok(d.a >= -PB.brake - 1e-9 && d.v < 10);
  assert.equal(d.legs[0].hardS, 0);
  // the emergency brake: hard, counted, the lever back to 0, released at a standstill
  assert.equal(emergencyBrake(d), true);
  assert.equal(d.lever, 0);
  for (let i = 0; i < 300 && d.v > 0; i++) driveStep(d, { dt: DT });
  assert.equal(d.v, 0); assert.equal(d.emergency, false);
  assert.equal(d.legs[0].emergencies, 1); assert.ok(d.legs[0].hardS > 2);
  assert.equal(toggleDoors(d), false, 'out on the line the doors stay shut');
  assert.ok(d.events.some((e) => e.type === 'not-here'));
});

test('overspeed costs points by the second; the limit switch and the buffer stop past the board', () => {
  const fast = drive({ speedUp: 2.5 }).d;
  assert.ok(fast.overspeed > 30 && fast.overspeedPenalty > 0 && fast.maxOver > PB.tolerance);
  // creeping past the board: the switch trips the emergency brake
  const d = createDrive();
  const line = driveLine(d);
  Object.assign(d, { phase: 'run', doors: 'closed', s: line.runLen - 3, v: 2, lever: 0.2 });
  for (let i = 0; i < 300; i++) { driveStep(d, { dt: DT }); if (d.legs[0].overrun) break; }
  assert.ok(d.legs[0].overrun && d.legs[0].emergencies === 1);
  for (let i = 0; i < 120; i++) driveStep(d, { dt: DT });
  assert.ok(-toBoard(d) < PB.buffer && d.v === 0);
  // too fast into it: the buffer
  const e = createDrive();
  Object.assign(e, { phase: 'run', doors: 'closed', s: line.runLen - 1, v: 4, lever: 0.4 });
  for (let i = 0; i < 60; i++) driveStep(e, { dt: DT });
  assert.ok(e.legs[0].buffer); assert.equal(e.s, line.runLen + PB.buffer); assert.equal(e.v, 0);
});

test('a clean run up both sections: on time, at the board within centimetres, gold', () => {
  const { d } = drive();
  assert.ok(d.done);
  assert.equal(d.results.length, 2);
  for (const r of d.results) {
    assert.ok(Math.abs(r.error) < 0.25, `${r.to}: ${r.error}`);
    assert.equal(r.depart, 40); assert.equal(r.horn, 10); assert.equal(r.punctual, 100); assert.equal(r.comfort, 50);
  }
  assert.equal(d.overspeed, 0);
  assert.ok(driveScore(d) >= PARSENN_MISSION.medals.gold, `score ${driveScore(d)}`);
  // the steps: done one after the other, with their texts and the summary
  for (const o of PARSENN_MISSION.objectives) assert.equal(o.check({}, { drive: d }).done, true);
  assert.equal(PARSENN_MISSION.summary({ drive: d }).length, 2);
});

test('the time-lapse: ×4 on the open line, off ahead of the next limit and the station; the same drive', () => {
  const plain = drive();
  const fast = drive({ timelapse: true });
  assert.ok(fast.frames < plain.frames * 0.75, `${fast.frames} frames against ${plain.frames}`);
  assert.equal(fast.d.overspeed, 0);
  assert.ok(Math.abs(driveScore(fast.d) - driveScore(plain.d)) <= 10);
  // not out of the station, nor close to the loop
  const d = createDrive();
  assert.equal(setTimelapse(d, true), false);
  const lo = driveLine(d);
  Object.assign(d, { phase: 'run', doors: 'closed', s: 300, v: 10, lever: 1 });
  assert.equal(timelapseAllowed(d), true);
  Object.assign(d, { s: lo.pathLen / 2 - 95 - lo.trainLength - 0.3 - 100 });
  assert.equal(timelapseAllowed(d), false);
});

test('a sloppy machinist: early away, no horn, stopping 1.5 m short — fewer points, but up there', () => {
  const { d } = drive({ stopAt: 1.5, horn: false, early: 6 });
  assert.ok(d.done);
  for (const r of d.results) { assert.equal(r.depart, 0); assert.equal(r.horn, 0); assert.ok(r.precise < 40 && r.precise > 0); }
  const score = driveScore(d);
  assert.ok(score < PARSENN_MISSION.medals.silver && score >= PARSENN_MISSION.medals.bronze, `score ${score}`);
});
