import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ICE_MISSIONS, SPEED_SKATING_MISSION, HOCKEY_PENALTY_MISSION, CURLING_MISSION,
  SKATE_PARAMS, createSkater, stepSkater, skaterNeedle,
  TRACK, TRACK_LANES, LAP_LENGTH, trackParam, trackPoint, spineDistance, createRaceState, updateRace,
  RINK, HOCKEY, rinkLocal, rinkWorld, rinkHeadingLocal, rinkHeadingWorld, clampToRink, createPenaltyGame, stepPenalty, crossingY,
  SHEET, CURLING, CURLING_POINTS, sheetLocal, sheetWorld, stonePoints, curlingScore, createCurlingGame, throwStone, stepStones, settleStones, previewStone
} from '../js/missions-data-ice.js';
import { MISSIONS, getMission, relativeBearing } from '../js/missions-data.js';
import { medalFor, recordCompletion, emptyProgress } from '../js/missions-progress.js';

// tests/missions-ice.test.mjs — the ice missions' pure logic (js/missions-data-ice.js): the skater, the 400 m track's
// lap count and its infield, the penalty's goalie, the curling stones and their score. No three.js.

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≈ ${b} ± ${eps}`);
const frame = (o = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, verticalSpeed: 0, agl: 0, dt: 1 / 60, t: 0, night: false, ...o });

test('the ice missions are listed, complete and on the ice', () => {
  for (const m of ICE_MISSIONS) {
    assert.ok(MISSIONS.includes(m), `${m.id} is in MISSIONS`);
    assert.equal(getMission(m.id), m);
    assert.equal(m.mode, 'person');
    assert.ok(m.objectives.length >= 2);
    const state = m.createState();
    for (const o of m.objectives) {
      const v = o.check(frame({ x: m.start.x, z: m.start.z }), state);
      assert.equal(typeof v.done, 'boolean');
      assert.equal(v.done, false, `${m.id}/${o.id} is not done before anything happened`);
    }
  }
  assert.deepEqual(ICE_MISSIONS.map((m) => m.id), ['speed-skating', 'hockey-penalty', 'curling']);
  // the starts: on the track's inner lane, on the rink's centre spot, at the hack
  const s = SPEED_SKATING_MISSION.start;
  const d = spineDistance(s.x, s.z);
  assert.ok(d > TRACK_LANES.inner && d < TRACK_LANES.outer, 'the race starts in the lanes');
  const h = rinkLocal(HOCKEY_PENALTY_MISSION.start.x, HOCKEY_PENALTY_MISSION.start.z);
  near(h.x, -1.5, 1e-6); near(h.y, 0, 1e-6);
  const c = sheetLocal(CURLING_MISSION.start.x, CURLING_MISSION.start.z);
  near(c.s, -SHEET.hack, 1e-6); near(c.t, 0, 1e-6);
  // the hockey pin stands outside the arena (the rink is inside), the others at their start
  const pin = rinkLocal(HOCKEY_PENALTY_MISSION.pin.x, HOCKEY_PENALTY_MISSION.pin.z);
  assert.ok(pin.x > RINK.halfL + 20);
});

test('the skater: the auto rhythm, power strokes in the green, stumbles, brakes and turns', () => {
  const P = SKATE_PARAMS.speed;
  const sk = createSkater(0);
  for (let i = 0; i < 60 * 30; i++) stepSkater(sk, { forward: 1 }, 1 / 60, P);
  const auto = sk.speed;
  assert.ok(auto > 7 && auto < 9, `cruise on the auto rhythm ${auto}`);
  // a push early in the rhythm is a stumble: no stroke, the rhythm starts over
  sk.t = 0.1;
  const before = sk.strokes;
  assert.equal(stepSkater(sk, { forward: 1, push: true }, 1 / 60, P), null);
  assert.equal(sk.last, 'early');
  assert.equal(sk.strokes, before);
  assert.ok(sk.t < 0.05);
  // pushes in the green zone: power strokes, a higher top speed
  const pw = createSkater(0);
  let held = false;
  for (let i = 0; i < 60 * 30; i++) {
    const n = skaterNeedle(pw, P);
    const push = !held && n >= P.window + 0.03;
    held = push || (held && n > 0.2);
    stepSkater(pw, { forward: 1, push }, 1 / 60, P);
  }
  assert.ok(pw.power > 20 && pw.speed > auto + 1.5, `power strokes ${pw.power}, ${pw.speed} m/s`);
  // the brake
  for (let i = 0; i < 60; i++) stepSkater(pw, { back: 1 }, 1 / 60, P);
  assert.ok(pw.speed < 5);
  // turning left: the heading grows, the skater leans in (positive)
  const t = createSkater(0); t.speed = 8;
  for (let i = 0; i < 30; i++) stepSkater(t, { steer: 1 }, 1 / 60, P);
  assert.ok(t.heading > 0.3 && t.lean > 0.1);
  // off the ice: the snow stops the skater
  const o = createSkater(0); o.speed = 8;
  for (let i = 0; i < 120; i++) stepSkater(o, {}, 1 / 60, P, { offIce: true });
  assert.ok(o.speed < 1);
});

test('the 400 m track: the measured line is 400 m, positions map along it, counter-clockwise with the infield on the left', () => {
  near(LAP_LENGTH, 400, 0.5, 'lap');
  for (const s of [0, 30, 89, 120, 200, 260, 330, 399]) {
    const p = trackPoint(s);
    const ds = trackParam(p.x, p.z) - s;
    near(Math.abs(ds - Math.round(ds / LAP_LENGTH) * LAP_LENGTH), 0, 0.05, `param at ${s}`);
    near(spineDistance(p.x, p.z), TRACK_LANES.line, 0.1); // (u is unit to 4 digits)
    // the infield (the track's centre) lies on the skater's left everywhere
    const p2 = trackPoint(s + 0.5);
    const h = Math.atan2(p2.x - p.x, p2.z - p.z);
    near(Math.abs(((h - p.heading + Math.PI) % (2 * Math.PI)) - Math.PI), 0, 0.05, `heading at ${s}`);
    if (s % 89 > 5) assert.ok(relativeBearing(p.x, p.z, p.heading, TRACK.x, TRACK.z) > 0, `the infield on the left at ${s}`);
  }
  // the outer lane maps to the same metre
  const o = trackPoint(150, 4);
  near(trackParam(o.x, o.z), 150, 6);
});

/** Skates the race along the track (a target point ahead, `power`: pushes in the green), returns the time and race */
function skateRace({ power = false, cutAt = null, off = 2.2 } = {}) {
  const P = SKATE_PARAMS.speed;
  const race = createRaceState();
  const s0 = SPEED_SKATING_MISSION.start;
  let x = s0.x, z = s0.z, t = 0, held = false;
  const sk = createSkater(s0.heading);
  const dt = 1 / 60;
  updateRace(race, x, z, 0);
  while (race.dist < 800 && t < 400 && !race.cut) {
    const s = trackParam(x, z);
    const target = cutAt !== null && race.dist > cutAt ? { x: TRACK.x, z: TRACK.z } : trackPoint(s + 8, off);
    let rel = Math.atan2(target.x - x, target.z - z) - sk.heading;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const n = skaterNeedle(sk, P);
    const push = power && !held && n >= P.window + 0.03;
    held = push || (held && n > 0.2);
    stepSkater(sk, { forward: 1, steer: Math.max(-1, Math.min(1, rel * 3)), push }, dt, P);
    x += Math.sin(sk.heading) * sk.speed * dt;
    z += Math.cos(sk.heading) * sk.speed * dt;
    t += dt;
    updateRace(race, x, z, t * 1000);
  }
  return { t, race };
}

test('the race: two laps counted with their times; the medals are within reach (gold only with power strokes)', () => {
  const m = SPEED_SKATING_MISSION;
  const auto = skateRace();
  assert.equal(auto.race.laps, 2);
  assert.equal(auto.race.lapTimes.length, 2);
  assert.ok(auto.race.lapTimes[1] < auto.race.lapTimes[0], 'the flying lap is quicker than the one from the standing start');
  near(auto.race.lapTimes[0] + auto.race.lapTimes[1], auto.t * 1000, 50);
  const fast = skateRace({ power: true });
  const ms = (r) => r.t * 1000;
  assert.equal(medalFor(ms(fast), m.medals), 'gold', `power strokes: ${fast.t.toFixed(1)} s`);
  assert.equal(medalFor(ms(auto), m.medals), 'silver', `the auto rhythm: ${auto.t.toFixed(1)} s`);
  assert.ok(m.medals.gold === 90000 && m.medals.bronze > ms(auto));
  // the objectives follow the race: lap 1 done after 400 m, lap 2 after 800 m
  const state = { race: auto.race };
  assert.equal(m.objectives[0].check(frame(), state).done, true);
  assert.equal(m.objectives[1].check(frame(), state).done, true);
  const half = createRaceState();
  half.dist = 250;
  const v = m.objectives[0].check(frame(), { race: half });
  assert.equal(v.done, false);
  near(v.progress, 250 / LAP_LENGTH, 1e-9);
});

test('the race: a cut across the infield disqualifies, going backwards does not count', () => {
  const cut = skateRace({ cutAt: 120 });
  assert.equal(cut.race.cut, true);
  const v = SPEED_SKATING_MISSION.objectives[0].check(frame(), { race: cut.race });
  assert.match(v.fail, /Disqualified/);
  // the outer lane is fine
  const outer = skateRace({ off: 5.5 });
  assert.equal(outer.race.cut, false);
  assert.equal(outer.race.laps, 2);
  // backwards: the distance shrinks
  const race = createRaceState();
  const a = trackPoint(50), b = trackPoint(40);
  updateRace(race, a.x, a.z, 0);
  updateRace(race, b.x, b.z, 100);
  near(race.dist, 40, 0.1);
  // through the start line (the wrap of the parameter) the distance runs on
  const r2 = createRaceState();
  for (let s = 380; s <= 420; s += 2) { const p = trackPoint(s); updateRace(r2, p.x, p.z, s * 100); }
  near(r2.dist, 420 - LAP_LENGTH, 0.2, 'from 20 m before the line to 20 m past it');
  assert.equal(r2.laps, 0);
});

test('the rink: frames, headings and the boards', () => {
  for (const [x, y] of [[0, 0], [10, -3], [-25, 12]]) {
    const w = rinkWorld(x, y);
    const l = rinkLocal(w.x, w.z);
    near(l.x, x, 1e-9); near(l.y, y, 1e-9);
  }
  for (const a of [0, 0.4, -1.2, 2.5]) near(rinkHeadingLocal(rinkHeadingWorld(a)), a, 1e-9);
  // +y is to the right of a skater facing the goal (+x)
  const h = rinkHeadingWorld(0), w = rinkWorld(0, 5);
  assert.ok(relativeBearing(RINK.x, RINK.z, h, w.x, w.z) < 0);
  const p = { x: 40, y: 0 };
  assert.equal(clampToRink(p, 0.5), true);
  near(p.x, RINK.halfL - 0.5, 1e-9);
  const c = { x: 29, y: 14 };
  assert.equal(clampToRink(c, 0.5), true);
  assert.ok(c.x < 29 && c.y < 14, 'the rounded corner');
  const inside = { x: 5, y: 5 };
  assert.equal(clampToRink(inside), false);
  near(crossingY(20, 0, Math.atan2(0.5, 6), 26), 0.5, 1e-9);
  assert.equal(crossingY(20, 0, Math.PI, 26), null);
});

/** One penalty: skate straight from (0, y0) to x = shootX, aim at `aimY` on the goal line */
function penalty(g, { y0 = 0, shootX = 21, aimY = 0.7, speed = 7, power, stopAfter } = {}) {
  const c = { x: -1.5, y: y0, heading: 0 }, dt = 1 / 60;
  let shot = false;
  for (let k = 0; k < 2000; k++) {
    if (stopAfter && g.phase === stopAfter) return null;
    if (!shot && g.phase === 'skate' && g.puck.x >= shootX) {
      const a = Math.atan2(aimY - g.puck.y, HOCKEY.goalX - g.puck.x);
      I.step(g, dt, c, power === undefined ? a : { a, power });
      shot = true;
      continue;
    }
    if (g.phase === 'skate') c.x += speed * dt;
    const r = I.step(g, dt, c, null);
    if (r) return r;
  }
  return null;
}
const I = { step: stepPenalty };

test('penalties: close shots into the corners beat the goalie, shots at him or from far are saved', () => {
  const tally = (opts) => { const out = {}; for (let s = 1; s <= 20; s++) { const g = createPenaltyGame(s); penalty(g, opts); out[g.results[0]] = (out[g.results[0]] || 0) + 1; } return out; };
  assert.ok(tally({ shootX: 21.5, aimY: 0.75 }).goal >= 17, 'from 5 m into the corner (unless he guessed that side)');
  assert.equal(tally({ shootX: 21.5, aimY: 0.85 }).goal, 20, 'from 5 m tight inside the post');
  assert.equal(tally({ shootX: 21.5, aimY: 0 }).save, 20, 'straight at the goalie');
  assert.equal(tally({ shootX: 12, aimY: 0.75 }).save, 20, 'from 14 m he has time');
  assert.equal(tally({ shootX: 21.5, aimY: 1.4 }).wide, 20, 'wide of the post');
  // too close: the poke check; too slow: the time runs out; backwards: no goal
  let g = createPenaltyGame(3);
  penalty(g, { shootX: 99 });
  assert.equal(g.results[0], 'poke');
  g = createPenaltyGame(3);
  penalty(g, { shootX: 99, speed: 0.5 });
  assert.equal(g.results[0], 'time');
  g = createPenaltyGame(3);
  const c = { x: 5, y: 0, heading: 0 };
  stepPenalty(g, 0.1, c, null);
  c.x = 2;
  stepPenalty(g, 0.1, c, null);
  assert.equal(g.results[0], 'back');
});

test('penalties: the wind-up, the goalie out to cut the angle, the puck in the net, the poke check', () => {
  const tally = (opts) => { const out = {}; for (let s = 1; s <= 40; s++) { const g = createPenaltyGame(s); penalty(g, opts); out[g.results[0]] = (out[g.results[0]] || 0) + 1; } return out; };
  // from 9 m a wrist shot is saved, the full wind-up into the corner beats him often
  const wrist = tally({ shootX: 17, aimY: 0.85, power: 0 }).goal || 0, slap = tally({ shootX: 17, aimY: 0.85, power: 1 }).goal || 0;
  assert.ok(slap > wrist + 10, `the wind-up pays from range (${wrist} vs ${slap} of 40)`);
  // he stands out of his crease while the skater is far, back on his line once he is close
  const g = createPenaltyGame(5);
  stepPenalty(g, 1 / 60, { x: 0, y: 0, heading: 0 }, null);
  near(g.goalie.x, HOCKEY.goalieOut, 0.05);
  for (let k = 0; k < 120; k++) stepPenalty(g, 1 / 60, { x: 20, y: 0, heading: 0 }, null);
  near(g.goalie.x, HOCKEY.goalieX, 0.05);
  // a goal: the puck ends up inside the net, at rest
  const h = createPenaltyGame(2);
  penalty(h, { shootX: 21.5, aimY: 0.85, power: 0.5, stopAfter: 'result' });
  assert.equal(h.results[0], 'goal');
  for (let k = 0; k < 90; k++) stepPenalty(h, 1 / 60, null, null);
  assert.ok(h.puck.x > HOCKEY.goalX && h.puck.x < HOCKEY.goalX + HOCKEY.netDepth && Math.abs(h.puck.y) < HOCKEY.postY, 'in the net');
  assert.ok(Math.hypot(h.puck.vx, h.puck.vy) < 0.5, 'at rest');
  assert.ok(h.fx.net > 0, 'it hit the back of the net');
  // the poke check sends the puck back up the ice
  const p = createPenaltyGame(3);
  penalty(p, { shootX: 99, stopAfter: 'result' });
  assert.equal(p.results[0], 'poke');
  const x0 = p.puck.x;
  for (let k = 0; k < 30; k++) stepPenalty(p, 1 / 60, null, null);
  assert.ok(p.puck.x < x0 - 1, 'the puck slides away from him');
});

test('the shoot-out: five penalties, the goals counted, the objectives step on, the medal by goals', () => {
  const m = HOCKEY_PENALTY_MISSION;
  const state = { game: createPenaltyGame(11) };
  const plan = [0.75, 0, -0.75, 0.75, -0.72]; // corner, at him, corner, corner, corner
  let r = null;
  for (let i = 0; i < HOCKEY.attempts; i++) {
    assert.equal(m.objectives[i].check(frame(), state).done, false, `penalty ${i + 1} not done before it is taken`);
    r = penalty(state.game, { shootX: 21.5, aimY: plan[i], y0: i % 2 ? 1 : -1 });
    assert.equal(m.objectives[i].check(frame(), state).done, true, `penalty ${i + 1} done`);
  }
  assert.equal(r, 'done');
  assert.equal(state.game.phase, 'done');
  assert.equal(state.game.results.length, 5);
  assert.equal(state.game.goals, 4);
  assert.equal(m.score(state), 4);
  assert.equal(medalFor(m.score(state), m.medals, true), 'gold');
  assert.equal(medalFor(3, m.medals, true), 'silver');
  assert.equal(medalFor(2, m.medals, true), 'bronze');
  assert.equal(medalFor(1, m.medals, true), null);
  // the progress keeps the goals as the best score
  const { progress, award } = recordCompletion(emptyProgress(), m, 60000, 0, 4);
  assert.equal(award.medal, 'gold');
  assert.equal(progress.missions[m.id].bestScore, 4);
  assert.match(m.summary(state)[0], /4 of 5/);
});

test('curling: the sheet, the rings and the points', () => {
  const w = sheetWorld(SHEET.tee, 0.5), l = sheetLocal(w.x, w.z);
  near(l.s, SHEET.tee, 1e-9); near(l.t, 0.5, 1e-9);
  near(SHEET.tee - SHEET.hog, 6.4, 1e-9);
  near(2 * SHEET.hog, 21.95, 1e-9);
  // the sheet lies on the hard court beside the track
  assert.ok(spineDistance(SHEET.x, SHEET.z) > TRACK.r + 5);
  assert.equal(stonePoints(SHEET.tee, 0), CURLING_POINTS[0]);
  assert.equal(stonePoints(SHEET.tee + 0.4, 0), CURLING_POINTS[1]);
  assert.equal(stonePoints(SHEET.tee, 1.0), CURLING_POINTS[2]);
  assert.equal(stonePoints(SHEET.tee - 1.9, 0), CURLING_POINTS[3], 'touching the 12-foot counts');
  assert.equal(stonePoints(SHEET.tee - 2.1, 0), 0);
  const g = { stones: [{ s: SHEET.tee, t: 0, inPlay: true, moving: false }, { s: SHEET.tee + 1, t: 0, inPlay: true, moving: false }, { s: SHEET.tee, t: 0, inPlay: false, moving: false }] };
  assert.equal(curlingScore(g), CURLING_POINTS[0] + CURLING_POINTS[2]);
});

test('curling: the slide — the weight for the house, the curl to its side, sweeping runs further and straighter', () => {
  // a draw: a power that stops in the house; the curl takes it ~1 m towards its turn
  let draw = null;
  for (let p = 0.3; p <= 0.6; p += 0.005) { const r = previewStone(p, 0, 1); if (r.inPlay && Math.abs(r.s - SHEET.tee) < 0.3) { draw = { p, r }; break; } }
  assert.ok(draw, 'some power draws to the tee');
  assert.ok(draw.r.t > 0.5 && draw.r.t < 1.6, `clockwise curls right ${draw.r.t}`);
  const ccw = previewStone(draw.p, 0, -1);
  near(ccw.t, -draw.r.t, 1e-6, 'counter-clockwise mirrors it');
  // aimed a little left, the curl brings it back to the button
  const aimed = previewStone(draw.p, -Math.atan2(draw.r.t, SHEET.tee - CURLING.release), 1);
  assert.ok(stonePoints(aimed.s, aimed.t) >= CURLING_POINTS[1], `aimed for the button: ${aimed.s.toFixed(2)}, ${aimed.t.toFixed(2)}`);
  const swept = previewStone(draw.p, 0, 1, true);
  assert.ok(swept.s > draw.r.s + 1.5, 'sweeping carries it further');
  // too light: short of the hog line (removed on settling); too heavy: through the house and out the back
  assert.ok(previewStone(0, 0, 1).s < SHEET.hog);
  const heavy = previewStone(1, 0, 1);
  assert.equal(heavy.inPlay, false);
  assert.equal(heavy.out, 'back');
  // real time on the sheet: a draw takes a few seconds (the sim runs simSpeed times real time)
  const secs = draw.r.time / CURLING.simSpeed;
  assert.ok(secs > 4 && secs < 10, `${secs.toFixed(1)} s`);
});

test('curling: stones collide — a takeout knocks a stone out of the house', () => {
  const g = createCurlingGame();
  // a stone on the button
  g.stones.push({ s: SHEET.tee, t: 0, vs: 0, vt: 0, spin: 1, inPlay: true, moving: false, n: 1 });
  throwStone(g, 0.95, 0, 1);
  // (straight at it: no curl to miss with)
  g.stones[1].spin = 0;
  for (let i = 0; i < 2000 && stepStones(g, 0.02); i++);
  assert.ok(g.hits >= 1, 'they met');
  const [a, b] = g.stones;
  assert.ok(!a.inPlay || a.s > SHEET.tee + 1.5, 'the stone on the button is driven back');
  assert.ok(b.inPlay && Math.abs(b.s - SHEET.tee) < 1.5, 'the shooter stays near where it struck');
  // momentum along the sheet is (nearly) passed on: the struck stone slid further than the shooter
  assert.ok(a.s > b.s);
});

test('curling: an end of eight stones, the hog line rule, the objectives and the medal by points', () => {
  const m = CURLING_MISSION;
  const state = m.createState();
  const g = state.game;
  // find the draw weight
  let p0 = 0.3;
  while (previewStone(p0, 0, 1).s < SHEET.tee && p0 < 1) p0 += 0.005;
  const shots = [[p0, -0.035, 1], [p0, 0.035, -1], [0.05, 0, 1], [p0 - 0.01, -0.04, 1], [p0, 0.03, -1], [p0 + 0.01, -0.03, 1], [p0, 0.04, -1], [p0, -0.035, 1]];
  for (let i = 0; i < shots.length; i++) {
    if (i === 4) assert.equal(m.objectives[0].check(frame(), state).done, true, 'stones 1-4 done');
    assert.equal(m.objectives[1].check(frame(), state).done, false);
    throwStone(g, ...shots[i]);
    assert.equal(m.objectives[i < 4 ? 0 : 1].check(frame(), state).done, false, 'not while a stone slides');
    for (let k = 0; k < 4000 && stepStones(g, 0.02); k++);
    const phase = settleStones(g);
    if (i === 2) assert.equal(g.stones[2].out, 'hog', 'the light one is hogged');
    assert.equal(phase, i === shots.length - 1 ? 'done' : 'aim');
  }
  assert.equal(m.objectives[1].check(frame(), state).done, true);
  const score = m.score(state);
  assert.equal(score, curlingScore(g));
  assert.ok(score >= m.medals.bronze, `a decent end scores: ${score}`);
  assert.equal(medalFor(16, m.medals, true), 'gold');
  assert.equal(medalFor(9, m.medals, true), 'silver');
  assert.equal(medalFor(5, m.medals, true), 'bronze');
  assert.equal(medalFor(3, m.medals, true), null);
  assert.match(m.summary(state)[0], /in the house/);
});
