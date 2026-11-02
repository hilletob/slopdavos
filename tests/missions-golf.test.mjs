import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOLF_MISSIONS, GOLF_MISSION, GOLF_HOLES, COURSE_PAR, CLUBS, clubById, clubSpeed, autoClub, SURFACES, surfaceAt, createSurfaceLookup,
  createBall, strike, stepBall, simulateBall, previewFlight, waterDrop, captureSpeed, HOLE_R, BALL_R, PUTT_MAX, TAP_IN,
  createRound, beginShot, endShot, nextHole, distanceToPin, toPar, roundScore, holeBonus, scoreName, GOLF_MEDALS, medalForToPar,
  createMeter, meterStart, meterPower, meterAccuracy, meterStep, METER, windFor, teeAim, formatToPar, PICK_UP_OVER_PAR
} from '../js/missions-data-golf.js';
import { GOLF } from '../js/golf-data.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor, recordCompletion, emptyProgress } from '../js/missions-progress.js';

// tests/missions-golf.test.mjs — the golf mission's pure logic (js/missions-data-golf.js): the surfaces from the OSM
// polygons, the ball's flight, bounce and roll on synthetic ground, the putt and the cup, the round and its score.

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≈ ${b} ± ${eps}`);
const frame = (o = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, verticalSpeed: 0, agl: 0, dt: 1 / 60, t: 0, night: false, ...o });
const flat = { heightAt: () => 0, surfaceAt: () => 'fairway' };
const shot = (club, power, o = {}, env = flat) => {
  const b = createBall(0, 0, 0, o.lie || 'tee');
  strike(b, { club, power, heading: 0, accuracy: o.accuracy || 0 });
  return simulateBall(b, env);
};

test('the golf mission is listed and complete: three holes, a par 3, par 4s, summer, scored by points', () => {
  assert.ok(MISSIONS.includes(GOLF_MISSION));
  assert.equal(getMission('golf'), GOLF_MISSION);
  assert.deepEqual(GOLF_MISSIONS, [GOLF_MISSION]);
  assert.equal(GOLF_MISSION.season, 'summer');
  assert.equal(GOLF_MISSION.mode, 'person');
  assert.ok(GOLF_MISSION.scoreMode);
  assert.deepEqual(GOLF_HOLES.map((h) => h.ref), [14, 15, 18]);
  assert.deepEqual(GOLF_HOLES.map((h) => h.par), [3, 4, 4]);
  assert.equal(COURSE_PAR, 11);
  // the pin by the clubhouse (docs/missions-locations.json)
  near(GOLF_MISSION.pin.x, 814.2, 0.5); near(GOLF_MISSION.pin.z, -369.8, 0.5); // (10 m south of the clubhouse, outside it)
  const state = GOLF_MISSION.createState();
  for (const o of GOLF_MISSION.objectives) {
    const v = o.check(frame(), state);
    assert.equal(v.done, false);
    assert.equal(typeof v.text, 'string');
  }
  // the holes from golf-data: tee and pin where OSM has them, the pin on the green
  for (const h of GOLF_HOLES) {
    const src = GOLF.holes.find((x) => x.ref === h.ref);
    assert.deepEqual([h.tee.x, h.tee.z], src.pts.slice(0, 2));
    assert.deepEqual([h.pin.x, h.pin.z], src.pin);
    assert.equal(surfaceAt(h.pin.x, h.pin.z), 'green', `hole ${h.ref}: the pin is on the green`);
    assert.equal(surfaceAt(h.tee.x, h.tee.z), 'tee', `hole ${h.ref}: the tee`);
  }
});

test('the surfaces: water over bunker over green over tee over fairway, the rough inside the course, out beyond it', () => {
  const sq = (x, z, r) => [x - r, z - r, x + r, z - r, x + r, z + r, x - r, z + r];
  const lookup = createSurfaceLookup({
    outline: [sq(0, 0, 100)],
    areas: [{ kind: 'fairway', ring: sq(0, 0, 40) }, { kind: 'green', ring: sq(30, 0, 8) }, { kind: 'bunker', ring: sq(20, 0, 3) }, { kind: 'water', ring: sq(-30, 0, 6) }, { kind: 'tee', ring: sq(0, 35, 3) }]
  });
  assert.equal(lookup(0, 0), 'fairway');
  assert.equal(lookup(30, 0), 'green');
  assert.equal(lookup(20, 0), 'bunker');
  assert.equal(lookup(-30, 0), 'water');
  assert.equal(lookup(0, 35), 'tee');
  assert.equal(lookup(60, 60), 'rough');
  assert.equal(lookup(200, 0), 'out');
  // on the real course: the 18th's pond in front of the green, the 14th's bunker, out of bounds right of the 15th
  const h18 = GOLF_HOLES[2], h14 = GOLF_HOLES[0];
  let water = false, bunker = false;
  for (let t = 0.5; t < 1; t += 0.005) {
    const x = h18.line[2] + (h18.pin.x - h18.line[2]) * t, z = h18.line[3] + (h18.pin.z - h18.line[3]) * t;
    if (surfaceAt(x, z) === 'water') water = true;
  }
  for (let t = 0.6; t < 1; t += 0.01) if (surfaceAt(h14.tee.x + (h14.pin.x - h14.tee.x) * t, h14.tee.z + (h14.pin.z - h14.tee.z) * t) === 'bunker') bunker = true;
  assert.ok(water, 'the 18th plays over water');
  assert.ok(bunker, 'the 14th plays over a bunker');
  assert.equal(surfaceAt(0, 2000), 'out');
});

test('the clubs carry their distance on the flat; less power, less carry; the driver longest, the wedge highest', () => {
  for (const c of CLUBS.filter((c) => !c.putt)) {
    const b = shot(c, 1);
    near(b.carry.d, c.carry, c.carry * 0.02, `${c.id} carry`);
    assert.ok(b.z >= b.carry.d, `${c.id} rolls on after landing`);
    assert.ok(b.z - b.carry.d < 0.15 * c.carry, `${c.id} does not roll far`);
    const half = shot(c, 0.5);
    assert.ok(half.carry.d < 0.6 * c.carry && half.carry.d > 0.35 * c.carry, `${c.id} at half power`);
  }
  const apex = (id) => Math.max(...shot(id, 1).path.map((p) => p.y));
  assert.ok(apex('wedge') / clubById('wedge').carry > apex('driver') / clubById('driver').carry, 'the wedge flies steeper');
  assert.ok(clubSpeed('driver') > clubSpeed('wood') && clubSpeed('wood') > clubSpeed('iron7') && clubSpeed('iron7') > clubSpeed('wedge'));
  assert.equal(autoClub(1, 'green'), 'putter');
  assert.equal(autoClub(80, 'fairway'), 'wedge');
  assert.equal(autoClub(130, 'rough'), 'iron7');
  assert.equal(autoClub(300, 'tee'), 'driver');
  assert.equal(autoClub(300, 'fairway'), 'wood');
});

test('the flight: a hook curves left, a slice right; the wind carries the ball; the rough and the bunker cost distance', () => {
  // heading 0 flies along +z: its left is +x
  const hook = shot('iron7', 1, { accuracy: 0.8 }), slice = shot('iron7', 1, { accuracy: -0.8 }), straight = shot('iron7', 1);
  assert.ok(hook.x > 5, `a hook ends left ${hook.x}`);
  assert.ok(slice.x < -5, `a slice ends right ${slice.x}`);
  near(straight.x, 0, 1e-6);
  const windy = (w) => { const b = createBall(0, 0, 0, 'tee'); strike(b, { club: 'driver', power: 1, heading: 0 }); return simulateBall(b, { ...flat, wind: w }); };
  assert.ok(windy({ x: 4, z: 0 }).x > 4, 'a crosswind drifts the ball');
  assert.ok(windy({ x: 0, z: 4 }).carry.d > windy({ x: 0, z: -4 }).carry.d + 10, 'downwind carries further than into the wind');
  const fromRough = shot('iron7', 1, { lie: 'rough' }), fromBunker = shot('iron7', 1, { lie: 'bunker' });
  assert.ok(fromRough.carry.d < straight.carry.d * 0.95);
  assert.ok(fromBunker.carry.d < fromRough.carry.d);
  const wedgeSand = shot('wedge', 1, { lie: 'bunker' });
  assert.ok(wedgeSand.carry.d > 0.8 * clubById('wedge').carry, 'the wedge gets out of the sand');
  // the preview's landing is where the real flight first lands (no spin error, the same wind)
  const p = previewFlight({ x: 0, z: 0 }, { club: 'wood', power: 1, heading: 0, lie: 'tee' }, flat);
  near(p.landing.z, shot('wood', 1).carry.z, 3);
});

test('landing and rolling depend on the surface; the slope rolls the ball downhill; water and out end the shot', () => {
  const on = (surface) => shot('iron7', 1, {}, { heightAt: () => 0, surfaceAt: () => surface });
  const fair = on('fairway'), green = on('green'), rough = on('rough'), bunker = on('bunker');
  const runOf = (b) => b.z - b.carry.d;
  assert.ok(runOf(rough) < runOf(fair), 'the rough holds the ball');
  assert.ok(runOf(bunker) < 0.5, 'the bunker stops it dead');
  assert.ok(green.state === 'rest' && fair.state === 'rest');
  assert.equal(on('water').state, 'water');
  assert.equal(on('out').state, 'out');
  // a ball laid on a steep slope rolls down it (a 40 % bank of fairway towards +x); on a green it always comes to rest
  const b = createBall(0, 0, 0, 'fairway');
  b.state = 'roll';
  simulateBall(b, { heightAt: (x) => -0.4 * x, surfaceAt: () => 'fairway' }, { maxT: 3 });
  assert.ok(b.x > 0.5, `the ball rolls downhill ${b.x}`);
  const g = createBall(0, 0, 0, 'green');
  g.state = 'roll';
  simulateBall(g, { heightAt: (x) => -0.15 * x, surfaceAt: () => 'green' }, { maxT: 30 });
  assert.equal(g.state, 'rest', 'a green holds the ball (its slope is capped)');
  // the same putt runs further downhill than uphill
  const along = (fall) => { const p = createBall(0, 0, 0, 'green'); strike(p, { club: 'putter', power: 0.3, heading: 0 }); return simulateBall(p, { heightAt: (x, z) => -fall * z, surfaceAt: () => 'green', greenBoost: 1 }).z; };
  assert.ok(along(0.03) > PUTT_MAX * 0.3 + 1 && along(-0.03) < PUTT_MAX * 0.3 - 1, 'downhill longer, uphill shorter');
  // a putt across the slope breaks downhill; with the green's boost more
  const putt = (boost) => { const p = createBall(0, 0, 0, 'green'); strike(p, { club: 'putter', power: 0.4, heading: 0 }); return simulateBall(p, { heightAt: (x) => -0.015 * x, surfaceAt: () => 'green', greenBoost: boost }); };
  assert.ok(putt(1).x > 0.1, 'the putt breaks downhill');
  assert.ok(putt(1.25).x > putt(1).x, 'the boost exaggerates the break');
});

test('putting: the distance follows the power on a flat green; the cup takes a slow ball, a fast one lips out', () => {
  const green = { heightAt: () => 0, surfaceAt: () => 'green' };
  for (const p of [0.25, 0.5, 1]) {
    const b = createBall(0, 0, 0, 'green');
    strike(b, { club: 'putter', power: p, heading: 0 });
    simulateBall(b, green);
    near(b.z, PUTT_MAX * p, 0.25, `putt at ${p}`);
  }
  // 3 m to the cup: the right speed drops it
  const pin = { x: 0, z: 3 };
  const roll = (power, aimX = 0) => { const b = createBall(aimX, 0, 0, 'green'); strike(b, { club: 'putter', power, heading: 0 }); return simulateBall(b, { ...green, pin }); };
  const good = roll(3.4 / PUTT_MAX);
  assert.equal(good.state, 'holed');
  near(good.x, 0, 1e-9); near(good.z, 3, 1e-9);
  const hard = roll(1);
  assert.notEqual(hard.state, 'holed', 'a putt racing over the cup does not drop');
  assert.ok(hard.lipOuts >= 1);
  const wide = roll(3.4 / PUTT_MAX, 0.2);
  assert.equal(wide.state, 'rest', 'a putt 20 cm wide misses');
  // the capture speed: highest over the centre, nothing at the edge
  assert.ok(captureSpeed(0) > 1.2 && captureSpeed(HOLE_R) === 0 && captureSpeed(HOLE_R / 2) < captureSpeed(0));
  assert.ok(BALL_R < HOLE_R);
});

test('the swing meter: power on the second press (or letting go), accuracy on the line; the top and late strikes', () => {
  const m = createMeter();
  assert.ok(meterStart(m));
  meterStep(m, 0.55);
  assert.ok(meterPower(m));
  near(m.power, 0.5, 0.01);
  assert.equal(m.phase, 'accuracy');
  meterStep(m, m.power / METER.fall); // (back down on the line)
  assert.ok(meterAccuracy(m));
  assert.equal(m.accuracy, 0, 'on the line: a clean strike');
  assert.equal(m.phase, 'done');
  // too early: a hook (> 0); missed altogether: the slice at the bottom
  const e = createMeter(); meterStart(e); meterStep(e, 0.9); meterPower(e); meterStep(e, 0.2); meterAccuracy(e);
  assert.ok(e.accuracy > 0.5);
  const late = createMeter(); meterStart(late); meterStep(late, 5); // (the top locks the power)
  assert.equal(late.power, 1);
  meterStep(late, 5);
  assert.equal(late.phase, 'done');
  assert.equal(late.accuracy, -1);
});

test('the round: strokes, penalties (water: a drop, out: stroke and distance), tap-ins, the pick-up and the next hole', () => {
  const round = createRound(GOLF_HOLES, 3);
  const h = GOLF_HOLES[0];
  assert.equal(round.i, 0);
  assert.deepEqual([round.ball.x, round.ball.z], [h.tee.x, h.tee.z]);
  near(round.aim, teeAim(h), 1e-12);
  assert.equal(round.club, 'iron7', 'a par 3 of 115 m: the 7 iron');
  // a shot out of bounds: back to the tee, two strokes
  beginShot(round);
  let ev = endShot(round, { state: 'out', x: 0, z: 0, path: [], from: { x: h.tee.x, z: h.tee.z } });
  assert.equal(ev.kind, 'out');
  assert.equal(round.strokes, 2);
  assert.deepEqual([round.ball.x, round.ball.z], [h.tee.x, h.tee.z]);
  // a shot into water: a penalty stroke and a drop clear of it
  const pond = { outline: GOLF.outline, areas: [{ kind: 'water', ring: [0, 0, 10, 0, 10, 10, 0, 10] }] };
  const look = createSurfaceLookup(pond);
  const drop = waterDrop({ x: 5, z: 5, path: [], from: { x: 5, z: -30, lie: 'tee' } }, look);
  assert.notEqual(look(drop.x, drop.z), 'water');
  assert.ok(drop.z < 0 && drop.z > -3, `dropped just short of the water ${drop.z}`);
  // on the green 20 cm from the cup: the tap-in finishes the hole
  beginShot(round);
  ev = endShot(round, { state: 'rest', x: h.pin.x + 0.2, z: h.pin.z, lie: 'green', path: [] });
  assert.equal(ev.kind, 'tapin');
  assert.equal(ev.result.strokes, 4);
  assert.equal(ev.result.name, 'Bogey');
  assert.ok(nextHole(round));
  assert.equal(round.i, 1);
  assert.equal(round.strokes, 0);
  assert.equal(round.club, 'driver');
  // the pick-up at par + 5
  for (let k = 0; k < 12; k++) { beginShot(round); ev = endShot(round, { state: 'rest', x: round.ball.x + 1, z: round.ball.z, lie: 'rough', path: [] }); if (ev.result) break; }
  assert.equal(ev.kind, 'pickup');
  assert.equal(ev.result.strokes, 4 + PICK_UP_OVER_PAR);
  assert.ok(nextHole(round));
  beginShot(round);
  ev = endShot(round, { state: 'holed', x: 0, z: 0, path: [] });
  assert.equal(ev.result.name, 'Hole in one!');
  assert.equal(nextHole(round), false);
  assert.ok(round.done);
  assert.equal(toPar(round), 1 + 5 - 3);
  assert.ok(TAP_IN < 0.5);
  assert.equal(distanceToPin({ ...round, i: 0, ball: { x: h.pin.x + 3, z: h.pin.z } }), 3);
});

test('the score: strokes against par, birdie and eagle bonuses; the medals follow the strokes', () => {
  const res = (s) => s.map((strokes, i) => ({ strokes, par: GOLF_HOLES[i].par }));
  assert.equal(roundScore(res([3, 4, 4])), 500, 'level par');
  assert.equal(roundScore(res([2, 4, 4])), 620, 'a birdie: a stroke under and its bonus');
  assert.equal(roundScore(res([1, 4, 4])), 780, 'a hole in one');
  assert.equal(roundScore(res([3, 2, 4])), 750, 'an eagle');
  assert.equal(roundScore(res([9, 9, 9])), 0);
  assert.equal(scoreName(3, 4), 'Birdie');
  assert.equal(scoreName(2, 4), 'Eagle');
  assert.equal(scoreName(6, 4), 'Double bogey');
  assert.equal(holeBonus(4, 4), 0);
  assert.equal(formatToPar(0), 'E');
  assert.equal(formatToPar(2), '+2');
  // gold at par − 1 or better, silver to par + 1, bronze to par + 4: for every way to get there
  const combos = [];
  for (let a = 1; a <= 8; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) combos.push([a, b, c]);
  for (const s of combos) {
    const total = s[0] + s[1] + s[2];
    const score = roundScore(res(s));
    assert.equal(medalFor(score, GOLF_MEDALS, true), medalForToPar(total - 11), `${s} (${score} pts)`);
  }
  assert.ok(GOLF_MISSION.medals.gold > GOLF_MISSION.medals.silver && GOLF_MISSION.medals.silver > GOLF_MISSION.medals.bronze);
  // the progress keeps the medal of the score
  const { award } = recordCompletion(emptyProgress(), GOLF_MISSION, 600000, 0, roundScore(res([2, 4, 4])));
  assert.equal(award.medal, 'gold');
  // the mission's score and its objectives over a round played through
  const state = GOLF_MISSION.createState();
  state.round.results.push({ ref: 14, par: 3, strokes: 2 });
  assert.equal(GOLF_MISSION.objectives[0].check(frame(), state).done, true);
  assert.equal(GOLF_MISSION.objectives[1].check(frame(), state).done, false);
  assert.equal(GOLF_MISSION.score(state), roundScore(state.round.results));
});

test('the wind: a breeze of 0.5-4.5 m/s, the same for the same seed', () => {
  for (let i = 0; i < 20; i++) {
    const w = windFor(i, i % 3);
    assert.ok(w.speed >= 0.5 && w.speed <= 4.5);
    near(Math.hypot(w.x, w.z), w.speed, 1e-9);
  }
  assert.deepEqual(windFor(7, 1), windFor(7, 1));
  assert.ok(SURFACES.green.decel < SURFACES.fairway.decel && SURFACES.fairway.decel < SURFACES.rough.decel);
  // stepBall in small frames gives the same as one long simulation
  const a = createBall(0, 0, 0, 'tee'), b = createBall(0, 0, 0, 'tee');
  strike(a, { club: 'wedge', power: 0.8, heading: 0.3 }); strike(b, { club: 'wedge', power: 0.8, heading: 0.3 });
  simulateBall(a, flat);
  for (let t = 0; t < 30 && (b.state === 'air' || b.state === 'roll'); t += 1 / 60) stepBall(b, 1 / 60, flat);
  near(a.x, b.x, 0.3); near(a.z, b.z, 0.3);
});
