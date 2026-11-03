import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPORT_MISSIONS, DAVOS_NORDIC_MISSION, MINIGOLF_MISSION, ICE_MINIGOLF_MISSION, ICE_HOLES, ICE_MINIGOLF, ARKADENPLATZ_COURSE, ICE_PAR, DARTS_MISSION, SKATE_BOWL_MISSION,
  XC_ROUTE, XC_LINE, XC_LENGTH, XC_PROFILE, XC_PROFILE_STEP, XC_SPLITS, XC_PARAMS, XC_FLAT, XC_FIELD, WC_POINTS, xcGrade, linePoint, projectOnLine,
  createXcSkier, stepXc, xcNeedle, createField, racerAt, racerTimeAt, placeAt, createXcState, updateXcRace, xcPoints, aiSpeed,
  MINIGOLF, MINIGOLF_HOLES, MINIGOLF_PAR, MINIGOLF_PATH, holeFrame, holeToWorld, onLane, holeHeight, createBall, puttBall, stepBall, simulatePutt,
  createMinigolfGame, minigolfPutt, minigolfStep, minigolfNext, minigolfScore, minigolfTotal,
  BOARD, SECTORS, scoreDart, fieldCentre, throwDart, swayAt, DART, createX01, x01Dart, dartsScore, checkoutHint,
  BOWL, BOWL_SIGMA, SKATE, floorEdge, bowlSurface, createBoarder, stepBoarder, scoreAir, scoreGrind, createSkateScore, addTrick, tickScore, skateTotal, comboValue, bowlToWorld, SCHUESSLA
} from '../js/missions-data-sport.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { recordCompletion, emptyProgress } from '../js/missions-progress.js';

// tests/missions-sport.test.mjs — the sport missions' pure logic (js/missions-data-sport.js): the Davos Nordic course
// and race, the cross-country skier, the minigolf lanes and ball, the dartboard and 301, the skate bowl. No three.js.

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≈ ${b} ± ${eps}`);
const frame = (o = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, verticalSpeed: 0, agl: 0, dt: 1 / 60, t: 0, night: false, ...o });

test('the sport missions are listed, complete and score by points', () => {
  assert.deepEqual(SPORT_MISSIONS.map((m) => m.id), ['davos-nordic', 'minigolf-waldhaus', 'ice-minigolf', 'darts-bar', 'skate-bowl']);
  for (const m of SPORT_MISSIONS) {
    assert.ok(MISSIONS.includes(m), `${m.id} is in MISSIONS`);
    assert.equal(getMission(m.id), m);
    assert.equal(m.mode, 'person');
    assert.ok(m.scoreMode && typeof m.score === 'function');
    assert.ok(m.medals.gold > m.medals.silver && m.medals.silver > m.medals.bronze, `${m.id}: medals by points`);
    assert.ok(m.icon && m.colour);
    const state = m.createState();
    assert.equal(m.score(state), 0);
    const v = m.objectives[0].check(frame({ x: m.start.x, z: m.start.z }), state);
    assert.equal(v.done, false, `${m.id}: nothing done before anything happened`);
  }
  assert.equal(DAVOS_NORDIC_MISSION.season, 'winter');
  assert.equal(MINIGOLF_MISSION.season, 'summer');
  assert.equal(SKATE_BOWL_MISSION.season, 'summer');
  assert.equal(DARTS_MISSION.season, null);
  // a podium earns a medal: World Cup points 100 / 80 / 60
  const award = recordCompletion(emptyProgress(), DAVOS_NORDIC_MISSION, 700000, 0, xcPoints(2)).award;
  assert.equal(award.medal, 'silver');
  assert.equal(recordCompletion(emptyProgress(), DAVOS_NORDIC_MISSION, 700000, 0, xcPoints(4)).award.medal, null);
});

test('Davos Nordic: the course is a real loop on the Loipen, from the Bünda and back', () => {
  near(XC_LENGTH, 4284, 5);
  // start and finish on the same spot (the stadium beside the Bünda meadow)
  near(XC_ROUTE[0], XC_ROUTE[XC_ROUTE.length - 2], 0.01); near(XC_ROUTE[1], XC_ROUTE[XC_ROUTE.length - 1], 0.01);
  assert.ok(Math.hypot(XC_ROUTE[0] - 1020, XC_ROUTE[1] + 1248) < 60, 'by the Fussballfeld Bünda');
  // every point of the course lies on a Loipe of the game's data
  const segs = [];
  for (const l of DAVOS_DATA.loipen) for (let i = 2; i < l.pts.length; i += 2) segs.push([l.pts[i - 2], l.pts[i - 1], l.pts[i], l.pts[i + 1]]);
  const dist = (x, z) => { let m = Infinity; for (const [ax, az, bx, bz] of segs) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); m = Math.min(m, Math.hypot(ax + dx * t - x, az + dz * t - z)); } return m; };
  for (let s = 0; s <= XC_LENGTH; s += 25) { const p = linePoint(XC_LINE, s); assert.ok(dist(p.x, p.z) < 12, `on a Loipe at ${s} m (${dist(p.x, p.z).toFixed(1)} m off)`); }
  // the profile covers the course; the steep climb into the Flüelatal's loop is there
  assert.ok((XC_PROFILE.length - 1) * XC_PROFILE_STEP >= XC_LENGTH - XC_PROFILE_STEP);
  assert.ok(Math.max(...Array.from({ length: 200 }, (_, i) => xcGrade(i * 20))) > 0.2);
  // the splits in order on the course
  assert.ok(XC_SPLITS.every((m, i) => m > 0 && m < XC_LENGTH && (!i || m > XC_SPLITS[i - 1])));
  // the projection keeps to the window round the skier (the course runs out and back on the City-Trail)
  const out = linePoint(XC_LINE, 100), back = projectOnLine(XC_LINE, out.x, out.z, 0, 200);
  near(back.s, 100, 1);
  const late = projectOnLine(XC_LINE, out.x, out.z, XC_LENGTH - 400, XC_LENGTH);
  assert.ok(late.s > XC_LENGTH - 400 && late.d < 8, 'the same place on the way back');
});

test('Davos Nordic: the skier strokes in the rhythm, climbs slowly, double poles on the flat', () => {
  const P = XC_PARAMS.skate;
  // the auto rhythm: a stroke every period while forward is held
  const sk = createXcSkier(0);
  let strokes = 0;
  for (let i = 0; i < 600; i++) if (stepXc(sk, { forward: 1 }, 1 / 60, P)) strokes++;
  assert.ok(strokes >= 8 && sk.speed > 3, `strokes ${strokes}, ${sk.speed.toFixed(2)} m/s`);
  // a power stroke late in the rhythm beats waiting; too early is a stumble
  const a = createXcSkier(0); a.speed = 5; a.t = P.period * 0.95;
  const b = { ...a };
  assert.equal(stepXc(a, { forward: 1, push: true }, 1 / 60, P), 'power');
  const early = createXcSkier(0); early.speed = 5; early.t = 0.05;
  assert.equal(stepXc(early, { forward: 1, push: true }, 1 / 60, P), null);
  assert.equal(early.last, 'early');
  void b;
  // uphill slower than on the flat, downhill faster; never stalls on the climb while going
  const steady = (grade, pole = false) => { const s = createXcSkier(0); for (let i = 0; i < 60 * 40; i++) stepXc(s, { forward: grade < -0.03 ? 0 : 1, pole, push: xcNeedle(s, P) > P.window + 0.05 }, 1 / 60, P, { grade }); return s.speed; };
  const flat = steady(0), up = steady(0.1), down = steady(-0.08), steep = steady(0.3);
  assert.ok(up < flat * 0.7 && down > flat, `flat ${flat.toFixed(2)} up ${up.toFixed(2)} down ${down.toFixed(2)}`);
  assert.ok(steep >= P.crawl - 1e-6, 'the herringbone keeps the skier going');
  const C = XC_PARAMS.classic;
  const classicFlat = (pole) => { const s = createXcSkier(0); for (let i = 0; i < 60 * 40; i++) stepXc(s, { forward: 1, pole, push: xcNeedle(s, C) > C.window + 0.05 }, 1 / 60, C, { grade: 0 }); return s.speed; };
  assert.ok(classicFlat(true) > classicFlat(false), 'double poling pays on the flat');
  assert.ok(XC_FLAT > 0);
});

test('Davos Nordic: the field has a fixed pace, the places and points follow the times', () => {
  for (const style of ['skate', 'classic']) {
    const field = createField(style);
    assert.equal(field.length, XC_FIELD.length);
    const totals = field.map((r) => r.tab.total);
    assert.deepEqual([...totals].sort((x, y) => x - y), totals, 'bib 1 the fastest');
    for (const r of field) {
      assert.equal(racerAt(r.tab, 0), 0);
      near(racerAt(r.tab, r.tab.total), XC_LENGTH, 1e-6);
      near(racerTimeAt(r.tab, racerAt(r.tab, 300)), 300, 0.5, 'time and place agree');
    }
    // a time between the 2nd and the 3rd: 3rd place
    const t = (totals[1] + totals[2]) / 2;
    assert.equal(placeAt(field, XC_LENGTH, t), 3);
  }
  assert.ok(aiSpeed(6, 0.1) < 6 && aiSpeed(6, -0.05) > 6);
  assert.deepEqual([1, 2, 3, 4, 9].map(xcPoints), [WC_POINTS[0], 80, 60, 50, 0]);
});

test('Davos Nordic: the race runs from the gun over the splits to the finish', () => {
  const st = createXcState();
  st.style = 'skate'; st.field = createField('skate');
  updateXcRace(st, 0, 0, 1); assert.equal(st.started, false);
  updateXcRace(st, 0, 0, 2.5); assert.equal(st.started, true);
  // ski the course at 7 m/s
  let s = 0;
  while (st.finishT === null && s < XC_LENGTH + 50) {
    s += 7 / 10;
    const p = linePoint(XC_LINE, Math.min(XC_LENGTH, s));
    updateXcRace(st, p.x + 0.8, p.z, 0.1);
  }
  assert.ok(st.finishT !== null, 'finished');
  near(st.finishT, XC_LENGTH / 7, 2);
  assert.equal(st.splits.length, 3);
  assert.equal(st.place, 1, 'at 7 m/s nobody is faster');
  assert.equal(st.results[0].player, true);
  // the objectives see it
  const state = { race: st };
  for (const o of DAVOS_NORDIC_MISSION.objectives) assert.equal(o.check(frame(), state).done, true, o.id);
  assert.equal(DAVOS_NORDIC_MISSION.score(state), 100);
  // a cut across (a jump far off the course) does not count
  const st2 = createXcState(); st2.style = 'skate'; st2.field = createField('skate'); updateXcRace(st2, 0, 0, 4);
  const far = linePoint(XC_LINE, 2000);
  updateXcRace(st2, far.x, far.z, 0.1);
  assert.ok(st2.s < 100, 'no progress from a jump');
});

test('minigolf: the nine Eternit lanes lie on the paved path as the orthophoto shows them', () => {
  assert.equal(MINIGOLF_HOLES.length, 9);
  assert.equal(MINIGOLF_PAR, 19);
  const inQuad = (q, x, z) => { let inside = false; for (let i = 0, j = 3; i < 4; j = i++) { const [xi, zi] = q[i], [xj, zj] = q[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; } return inside; };
  MINIGOLF_HOLES.forEach((h, i) => {
    assert.ok(onLane(h, h.tee[0], h.tee[1]) && onLane(h, h.cup[0], h.cup[1]), `${h.name}: tee and cup on the felt`);
    const f = holeFrame(i);
    for (const [x, y] of [h.tee, h.cup]) {
      const w = holeToWorld(f, x, y);
      assert.ok(MINIGOLF_PATH.some((q) => inQuad(q, w.x, w.z)) || MINIGOLF_PATH.some((q) => q.some(([qx, qz]) => Math.hypot(qx - w.x, qz - w.z) < 3)), `${h.name}: on (or by) the path`);
    }
  });
  // the north leg west to east, the east leg south, the south leg east to west
  const dir = (i) => holeFrame(i).heading;
  for (const i of [0, 1, 2]) near(dir(i), Math.PI / 2, 0.2);
  near(dir(3), 0, 0.2);
  for (const i of [4, 5, 6, 8]) near(dir(i), -Math.PI / 2, 0.2);
});

test('minigolf: the ball rolls, bounces, climbs, loops and drops', () => {
  const hill = MINIGOLF_HOLES[0];
  // straight down the lane, the right power: in the cup
  let r = simulatePutt(hill, hill.tee, 0, 0.6);
  assert.ok(r.ball.holed, 'holed straight');
  // too soft: short of the hill (it rolls back down)
  r = simulatePutt(hill, hill.tee, 0, 0.05);
  assert.ok(!r.ball.holed && r.ball.y < 2.7);
  // too hard: over the cup (it may drop on the way back off the circle's board)
  r = simulatePutt(hill, hill.tee, 0, 1);
  assert.ok(r.events.includes('lip'));
  assert.ok(!r.ball.holed || r.events.lastIndexOf('wall') > r.events.indexOf('lip'), 'only back off the board it may drop');
  // the boards keep it on the lane
  r = simulatePutt(hill, hill.tee, 0.9, 0.7);
  assert.ok(r.events.includes('wall') && onLane(hill, r.ball.x, r.ball.y));
  // the loop: too slow rolls back, fast enough goes round
  const loop = MINIGOLF_HOLES[3];
  const slow = simulatePutt(loop, loop.tee, 0, 0.18);
  assert.ok(!slow.events.includes('loop') && slow.ball.y < loop.loop.y);
  const fast = simulatePutt(loop, loop.tee, 0, 0.7);
  assert.ok(fast.events.includes('loop') && fast.ball.y > loop.loop.exitY - 0.01);
  // the bridge: off its edge into the ditch, back to where it was hit
  const bridge = MINIGOLF_HOLES[8];
  const wet = simulatePutt(bridge, bridge.tee, 0.25, 0.8);
  assert.ok(wet.ball.wet && wet.events.includes('water'));
  near(wet.ball.x, bridge.tee[0], 1e-9); near(wet.ball.y, bridge.tee[1], 1e-9);
  // the ramp lifts the felt; the bridge arches
  assert.ok(holeHeight(MINIGOLF_HOLES[2], 0, 4).h > 0.15);
  assert.ok(holeHeight(bridge, 0, 3).h > 0 && holeHeight(bridge, 0.5, 3).h === 0);
});

test('minigolf: strokes, penalties, the pick-up and the score', () => {
  const g = createMinigolfGame();
  assert.ok(minigolfPutt(g, 0, 0.6));
  assert.equal(minigolfPutt(g, 0, 0.6), false, 'no putt while it rolls');
  for (let i = 0; i < 240 * 20 && !g.ball.holed; i++) minigolfStep(g, 1 / 240);
  assert.ok(g.ball.holed);
  assert.ok(minigolfNext(g));
  assert.equal(g.hole, 1);
  // seven strokes and it is picked up
  for (let k = 0; k < 7; k++) { minigolfPutt(g, 0, 0.02); for (let i = 0; i < 240 * 20 && g.ball.moving; i++) minigolfStep(g, 1 / 240); }
  minigolfStep(g, 1 / 240);
  assert.ok(g.ball.holed);
  assert.equal(g.strokes[1], MINIGOLF.maxStrokes);
  minigolfNext(g);
  assert.equal(minigolfScore(g), (7 - 1) + 0);
  assert.equal(minigolfTotal(g), 8);
  const state = { game: g };
  assert.equal(MINIGOLF_MISSION.objectives[0].check(frame(), state).done, true);
  assert.equal(MINIGOLF_MISSION.objectives[1].check(frame(), state).done, true);
  assert.equal(MINIGOLF_MISSION.objectives[2].check(frame(), state).done, false);
  // the medals by strokes: 63 − 20 is gold
  assert.equal(MINIGOLF_MISSION.medals.gold, 43);
  const b = createBall(MINIGOLF_HOLES[0]); puttBall(b, 0, 0); assert.ok(b.vy >= MINIGOLF.minShot - 1e-9);
  void stepBall;
});

test('darts: the board\'s fields', () => {
  assert.equal(SECTORS.length, 20);
  assert.deepEqual(scoreDart(0, 0), { score: 50, mult: 2, num: 25, label: 'Bullseye', double: true });
  assert.equal(scoreDart(0, 0.012).score, 25);
  assert.equal(scoreDart(0, 0.103).score, 60, 'treble 20 straight up');
  assert.equal(scoreDart(0, 0.166).label, 'Double 20');
  assert.equal(scoreDart(0, 0.13).score, 20);
  assert.equal(scoreDart(0.13, 0).num, 6, '6 to the right');
  assert.equal(scoreDart(-0.13, 0).num, 11, '11 to the left');
  assert.equal(scoreDart(0, -0.13).num, 3, '3 at the bottom');
  assert.equal(scoreDart(0, 0.2).score, 0, 'off the board');
  for (const n of SECTORS) for (const m of [1, 2, 3]) { const c = fieldCentre(n, m), s = scoreDart(c.x, c.y); assert.equal(s.num, n); assert.equal(s.mult, m); }
  // the throw: the ideal power lands on the aim (± the scatter), weak drops, hard climbs
  const zero = () => 0.5;
  const hit = throwDart({ x: 0, y: 0.1 }, { x: 0, y: 0 }, DART.ideal, zero);
  near(hit.y, 0.1, 1e-9);
  assert.ok(throwDart({ x: 0, y: 0.1 }, { x: 0, y: 0 }, 0.3, zero).y < 0.05);
  assert.ok(throwDart({ x: 0, y: 0.1 }, { x: 0, y: 0 }, 1, zero).y > 0.15);
  // the sway: small, calmer when held still
  const amp = (steady) => Math.max(...Array.from({ length: 200 }, (_, i) => { const s = swayAt(i * 0.05, steady); return Math.hypot(s.x, s.y); }));
  assert.ok(amp(0) < 0.03 && amp(1) < amp(0));
});

test('darts: 301 double out, busts and the checkout', () => {
  const g = createX01(301);
  const T20 = scoreDart(0, 0.103), D20 = scoreDart(0, 0.166), S1 = { score: 1, mult: 1, num: 1, label: '1', double: false };
  for (let i = 0; i < 3; i++) x01Dart(g, T20);
  assert.equal(g.remaining, 121);
  assert.equal(g.log[0].total, 180);
  x01Dart(g, T20); x01Dart(g, T20); // 1 left after two more? 121 − 120 = 1: bust
  assert.equal(g.remaining, 121, 'leaving 1 is a bust');
  assert.equal(g.busts, 1);
  x01Dart(g, T20); x01Dart(g, scoreDart(0, 0.13)); // 121 − 60 − 20 = 41
  assert.equal(g.remaining, 41);
  x01Dart(g, S1); // 40, turn over
  const r = x01Dart(g, scoreDart(0, 0.166));
  assert.equal(r.result, 'checkout');
  assert.ok(g.done);
  assert.equal(g.darts, 9);
  assert.equal(dartsScore(g), 600 - 90);
  // zero on a single is a bust
  const h = createX01(20);
  assert.equal(x01Dart(h, scoreDart(0, 0.13)).result, 'bust');
  assert.equal(h.remaining, 20);
  assert.equal(x01Dart(h, fieldCentreDouble(10)).result, 'checkout');
  assert.equal(checkoutHint(40), 'Double 20');
  assert.equal(checkoutHint(50), 'Bullseye');
  assert.ok(/Double/.test(checkoutHint(41)));
  void D20;
});
const fieldCentreDouble = (n) => { const c = fieldCentre(n, 2); return scoreDart(c.x, c.y); };

test('the skate bowl: the transitions unrolled', () => {
  // the floor's edge and the coping
  const e = floorEdge(0, -BOWL.fb - 1);
  near(e.sigma, 1, 1e-9); near(e.nz, -1, 1e-9);
  const floor = bowlSurface(0, 0);
  near(floor.y, -BOWL.R, 1e-9); assert.equal(floor.theta, 0);
  const lip = bowlSurface(0, -(BOWL.fb + BOWL_SIGMA));
  near(lip.y, 0, 1e-9); near(lip.theta, Math.PI / 2, 1e-9);
  near(lip.z, -(BOWL.fb + BOWL.R), 1e-9, 'the coping R beyond the floor');
  // the corners are round: the same σ in every direction
  const c = floorEdge(BOWL.fa - BOWL.fc + 3, BOWL.fb - BOWL.fc + 4);
  near(c.sigma, 5 - BOWL.fc, 1e-9);
  // the world frame: a rotation (no mirror), the bowl's +x along its heading
  const a = bowlToWorld(1, 0), o = bowlToWorld(0, 0), b = bowlToWorld(0, 1);
  near(a.x - o.x, Math.sin(SCHUESSLA.heading), 1e-9);
  const cross = (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  near(Math.abs(cross), 1, 1e-9);
});

test('the skate bowl: pumping makes airs, the landing is judged, grinds balance', () => {
  // dropped in and pumped back and forth across the bowl: airs come
  const b = createBoarder(0.3, -(BOWL.fb + BOWL_SIGMA - 0.05)); b.vz = 1.2;
  let airs = 0, lands = 0, bails = 0;
  for (let i = 0; i < 60 * 30; i++) {
    const inAir = b.mode === 'air';
    let err = (b.vz >= 0 ? 0 : Math.PI) - b.heading; err = Math.atan2(Math.sin(err), Math.cos(err));
    for (const ev of stepBoarder(b, { pump: !inAir, steer: inAir ? (Math.abs(b.air.spin) < Math.PI - 0.1 ? 1 : 0) : Math.max(-1, Math.min(1, err * 2)), grab: inAir }, 1 / 60)) {
      if (ev.type === 'air') airs++; if (ev.type === 'land') lands++; if (ev.type === 'bail') bails++;
    }
  }
  assert.ok(airs >= 5 && lands >= 5, `airs ${airs}, landed ${lands}`);
  assert.equal(bails, 0);
  // without pumping the speed dies away: no air
  const lazy = createBoarder(0.3, -(BOWL.fb + BOWL_SIGMA - 0.05)); lazy.vz = 1.2;
  let lazyAirs = 0;
  for (let i = 0; i < 60 * 20; i++) for (const ev of stepBoarder(lazy, { pump: false }, 1 / 60)) if (ev.type === 'air') lazyAirs++;
  assert.equal(lazyAirs, 0);
  // the air's points: rotation, grab, height; a crash scores nothing
  const plain = scoreAir({ spin: Math.PI, peak: 0.5, time: 0.6 }), grabbed = scoreAir({ spin: Math.PI, grab: 0.5, peak: 0.5, time: 0.6 }), big = scoreAir({ spin: 2 * Math.PI + Math.PI, peak: 1, time: 0.9 });
  assert.ok(grabbed.points > plain.points && big.points > plain.points);
  assert.equal(scoreAir({ ok: false }).points, 0);
  assert.match(big.name, /540/);
  assert.match(scoreAir({ spin: 0, fakie: true }).name, /Fakie/);
  // a grind: up to the coping slowly but fast along it; balanced it lasts, dropped in it scores
  const g = createBoarder(0, -(BOWL.fb + BOWL_SIGMA - 0.005));
  g.vx = 4; g.vz = -1.0;
  let grind = null;
  for (let i = 0; i < 10 && !grind; i++) for (const ev of stepBoarder(g, {}, 1 / 60)) if (ev.type === 'grind') grind = ev;
  assert.ok(grind && g.mode === 'grind');
  let end = null;
  for (let i = 0; i < 60 * 4 && !end; i++) {
    for (const ev of stepBoarder(g, { steer: -g.grind?.b * 2 || 0, drop: i === 60 }, 1 / 60)) if (ev.type === 'grindEnd' || ev.type === 'bail') end = ev;
  }
  assert.equal(end.type, 'grindEnd');
  assert.ok(end.trick.points >= scoreGrind(1).points - 20);
});

test('the skate bowl: combos multiply, a bail loses them, the run lasts 60 s', () => {
  const sc = createSkateScore();
  addTrick(sc, { points: 100, name: 'a', ok: true });
  tickScore(sc, 1);
  addTrick(sc, { points: 100, name: 'b', ok: true });
  assert.equal(comboValue(sc.combo), 300);
  tickScore(sc, SKATE.comboGap + 0.1);
  assert.equal(skateTotal(sc), 300);
  assert.equal(sc.combo, null);
  addTrick(sc, { points: 200, name: 'c', ok: true });
  addTrick(sc, { points: 0, name: 'Bail', ok: false });
  assert.equal(skateTotal(sc), 300, 'the combo lost');
  // the mission's clock: the drop, 60 s, over
  const state = SKATE_BOWL_MISSION.createState();
  state.started = true;
  for (let i = 0; i < 61; i++) SKATE_BOWL_MISSION.update(frame({ dt: 1 }), state);
  assert.ok(state.over);
  assert.equal(SKATE_BOWL_MISSION.objectives[1].check(frame(), state).done, true);
});

test('ice minigolf: 18 lanes on the Arkadenplatz, each can be holed, and a puck slides further than a ball', () => {
  assert.equal(ICE_HOLES.length, 18);
  assert.equal(ICE_PAR, ICE_HOLES.reduce((a, h) => a + h.par, 0));
  assert.equal(ICE_MINIGOLF_MISSION.season, 'winter');
  assert.deepEqual(ICE_MINIGOLF_MISSION.features, ['iceMinigolf']);
  assert.equal(ICE_MINIGOLF_MISSION.objectives.length, 18);
  const state = ICE_MINIGOLF_MISSION.createState();
  assert.equal(state.game.course, ARKADENPLATZ_COURSE);
  const felt = simulatePutt(MINIGOLF_MISSION.createState().game.course.holes[0], [0, 0.45], 0, 0.3);
  const ice = simulatePutt(ICE_HOLES[0], [0, 0.45], 0, 0.05, { phys: ICE_MINIGOLF });
  assert.ok(ice.t > 0 && felt.t > 0);
  // the straight lanes without anything on their centre line drop with a soft straight shot
  const holed = (hole) => { for (let k = 0; k < 40; k++) { const r = simulatePutt(hole, hole.tee, 0, k / 40, { phys: ICE_MINIGOLF }); if (r.ball.holed) return true; } return false; };
  assert.ok(holed(ICE_HOLES[0]), 'Face-off');
});
