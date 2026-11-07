import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPLITBOARD_MISSION, SPLITBOARD_MISSIONS, SPLIT, SPLIT_PLACES, ASCENT_ROUTE, DESCENT_ROUTE, skinPace, climbRate, kickTurnHeading,
  createSkinner, stepSkinner, glideSpeed, slopeAt, createTransition, stepTransition, transitionShare, ascentPoles, descentGates, updateGates,
  skinBot, rideBot, createTrail, addToTrail, trailEnd, trailPoint, createPartner, stepPartner, lineOffset, createRisk, stepRisk,
  burialSpot, searchView, createRescue, stepRescue
} from '../js/missions-data-splitboard.js';
import { createRider, stepRider, riderSpeed, updateCheckpoints, lineLength, BOARD_PARAMS } from '../js/missions-data-snow.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

// (js/missions-data-splitboard.js is three.js-free: the skinner and the board run on synthetic slopes here, the bots on the
// real terrain)
const DT = 1 / 60;
const DEG = Math.PI / 180;
const slope = (deg, dir = 0) => (x, z) => Math.tan(deg * DEG) * (Math.sin(dir) * x + Math.cos(dir) * z); // uphill along `dir`
const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: DT, t: 0, ...over });

test('the tour is listed, in winter, on foot, its lines within the map, from the Strelapass to the summit and down to the Stafelalp', () => {
  const m = SPLITBOARD_MISSION;
  assert.equal(getMission('choerbschhorn-splitboard'), m);
  assert.ok(MISSIONS.includes(m) && SPLITBOARD_MISSIONS.includes(m));
  assert.equal(m.mode, 'person'); assert.equal(m.season, 'winter'); assert.deepEqual(m.features, ['splitboard']);
  assert.ok(m.medals.gold < m.medals.silver && m.medals.silver < m.medals.bronze);
  assert.equal(m.icon, 'splitboard');
  const [x0, z0, x1, z1] = WORLD_BOUNDS;
  for (const line of [ASCENT_ROUTE, DESCENT_ROUTE]) for (let i = 0; i < line.length; i += 2) assert.ok(line[i] > x0 && line[i] < x1 && line[i + 1] > z0 && line[i + 1] < z1);
  const S = SPLIT_PLACES.summit;
  assert.ok(Math.hypot(ASCENT_ROUTE.at(-2) - S.x, ASCENT_ROUTE.at(-1) - S.z) < 5, 'the skin track ends on the summit');
  assert.ok(Math.hypot(DESCENT_ROUTE[0] - S.x, DESCENT_ROUTE[1] - S.z) < 6, 'the descent begins there');
  const P = SPLIT_PLACES.strelapass, A = SPLIT_PLACES.stafelalp;
  assert.ok(Math.hypot(m.start.x - P.x, m.start.z - P.z) < 40, 'the start on the Strelapass');
  assert.ok(Math.hypot(DESCENT_ROUTE.at(-2) - A.x, DESCENT_ROUTE.at(-1) - A.z) < 120, 'the finish at the Stafelalp');
  // (by the Hauptertälli on the way up, past the Chörbschhornhütte on the way down)
  const near = (line, p, r) => { for (let i = 0; i < line.length; i += 2) if (Math.hypot(line[i] - p.x, line[i + 1] - p.z) < r) return true; return false; };
  assert.ok(near(ASCENT_ROUTE, SPLIT_PLACES.hauptertaelli, 120) && near(DESCENT_ROUTE, SPLIT_PLACES.hut, 60));
  assert.ok(lineLength(ASCENT_ROUTE) > 2000 && lineLength(DESCENT_ROUTE) > 2000);
  assert.deepEqual(m.objectives.map((o) => o.id), ['transceiver', 'traverse', 'ridge', 'transition', 'ridge-down', 'stafel']);
});

test('the skins: the level pace on easy ground, the climb on steeper, a slide back past their hold; the zig-zag climbs best', () => {
  const S = SPLIT.skin;
  assert.equal(skinPace(0), S.flat);
  assert.equal(skinPace(-0.2), S.flat);
  assert.ok(skinPace(10 * DEG) < S.flat + 1e-9 && skinPace(10 * DEG) > 0);
  assert.ok(skinPace(S.slip + 0.01) < 0, 'past the hold: sliding back');
  // the height gained a second is best near the skins' hold, and straight up a 30° face gets nowhere
  const best = climbRate(S.grip);
  for (const d of [8, 12, 24, 27, 30, 34]) assert.ok(climbRate(d * DEG) < best + 1e-9, `${d}°`);
  assert.ok(climbRate(30 * DEG) <= 0);
  assert.ok(best > 0.8 && best <= S.climb + 1e-9);
});

test('downhill the skins run: from standstill on a steep enough slope, quicker than the stride, slower than the board; it dies away on the flat', () => {
  const S = SPLIT.skin, G = S.glide;
  assert.equal(glideSpeed(3 * DEG), 0, 'a gentle slope: the skins hold');
  assert.ok(glideSpeed(10 * DEG) > S.flat && glideSpeed(15 * DEG) > glideSpeed(10 * DEG) && glideSpeed(30 * DEG) === G.max);
  // 12° down along +z, no key pressed: it runs to its speed, the legs still
  const down = slope(12, Math.PI), sk = createSkinner(0, 0, 0, down);
  for (let i = 0; i < 60 * 20; i++) stepSkinner(sk, {}, DT, down);
  assert.ok(sk.gliding && sk.stride === 0);
  assert.ok(Math.abs(sk.speed - glideSpeed(12 * DEG)) < 0.2 && sk.speed > 1.5 * S.flat, `${sk.speed.toFixed(1)} m/s`);
  // W on: no quicker than the run (the stride adds nothing to it), and onto the flat it dies away into the stride, smoothly
  const flat = slope(0);
  let prev = sk.speed, maxDrop = 0;
  for (let i = 0; i < 60 * 15; i++) { stepSkinner(sk, { forward: 1 }, DT, flat); maxDrop = Math.max(maxDrop, prev - sk.speed); prev = sk.speed; }
  assert.ok(!sk.gliding && Math.abs(sk.speed - S.flat) < 1e-6 && maxDrop < 3 * DT, `the run dies away (${(maxDrop / DT).toFixed(1)} m/s² at most)`);
  // S stops it
  const sk2 = createSkinner(0, 0, 0, down);
  for (let i = 0; i < 60 * 10; i++) stepSkinner(sk2, {}, DT, down);
  for (let i = 0; i < 60 * 4; i++) stepSkinner(sk2, { back: 1 }, DT, down);
  assert.ok(sk2.speed <= 0);
});

test('a kick turn mirrors the heading about the fall line and takes its second; the turn is slow on steep ground', () => {
  // uphill along +z (heading 0): heading 1 rad left of it goes to 1 rad right
  assert.ok(Math.abs(kickTurnHeading(1, 0) + 1) < 1e-9);
  assert.ok(Math.abs(kickTurnHeading(-0.9, 0) - 0.9) < 1e-9);
  assert.ok(Math.abs(Math.abs(kickTurnHeading(0.1, 0)) - 0.7) < 1e-9, 'straight up: onto a diagonal');
  const h = slope(28);
  const s = createSkinner(0, 0, 1, h);
  stepSkinner(s, { kick: true }, DT, h);
  assert.equal(s.kicks, 1);
  let t = 0;
  while (s.kickT > 0) { stepSkinner(s, { forward: 1, steer: 1 }, DT, h); t += DT; }
  assert.ok(Math.abs(t - SPLIT.skin.kick) < 0.05);
  assert.ok(Math.abs(s.heading + 1) < 1e-6);
  assert.ok(Math.hypot(s.x, s.z) < 1e-9, 'no step during the kick turn');
  // the turn: slow where the fall line is steep, quick on easy ground
  const steep = createSkinner(0, 0, 1, h), easy = createSkinner(0, 0, 1, slope(8));
  for (let i = 0; i < 60; i++) { stepSkinner(steep, { steer: 1 }, DT, h); stepSkinner(easy, { steer: 1 }, DT, slope(8)); }
  assert.ok(Math.abs(steep.heading - 1 - SPLIT.skin.steepTurn) < 0.02 && Math.abs(easy.heading - 1 - SPLIT.skin.turn) < 0.02);
});

test('straight up a 32° slope the skins slip back; across it, on a diagonal, they climb', () => {
  const h = slope(32);
  const up = createSkinner(0, 0, 0, h), across = createSkinner(0, 0, 1.15, h);
  for (let i = 0; i < 600; i++) { stepSkinner(up, { forward: 1 }, DT, h); stepSkinner(across, { forward: 1 }, DT, h); }
  assert.ok(up.y < 0 && up.slipping, 'slid back down');
  assert.ok(across.y > 5, `the diagonal climbed ${across.y.toFixed(1)} m`);
});

test('the transition: six holds (js/missions-splitboard.js poseBoard shows them by these ids), letting go runs the step back', () => {
  assert.deepEqual(SPLIT.transition.map((s) => s.id), ['skin1', 'skin2', 'join', 'clips', 'bind', 'strap']);
  const tr = createTransition();
  let t = 0;
  while (!tr.done && t < 20) { stepTransition(tr, true, DT); t += DT; }
  const total = SPLIT.transition.reduce((a, s) => a + s.hold, 0);
  assert.ok(tr.done && Math.abs(t - total) < 0.1);
  assert.equal(transitionShare(tr), 1);
  const b = createTransition();
  for (let i = 0; i < 30; i++) stepTransition(b, true, DT);
  const held = b.t;
  for (let i = 0; i < 10; i++) stepTransition(b, false, DT);
  assert.ok(b.step === 0 && b.t < held - 0.3);
});

test('the gates: through one between its flags, one beside it missed (+8 s), one skipped missed too', () => {
  const gates = [0, 1, 2].map((i) => ({ i, x: 0, z: i * 100, tx: 0, tz: 1, nx: 1, nz: 0, half: 20, s: i * 100 }));
  const d = { gates, next: 0, passed: 0, missed: 0, penaltyMs: 0, results: [null, null, null] };
  updateGates(d, 5, -1, 5, 1);
  assert.equal(d.next, 1); assert.equal(d.passed, 1);
  updateGates(d, 30, 99, 30, 101);
  assert.equal(d.missed, 1); assert.equal(d.penaltyMs, SPLIT.down.missMs);
  const fresh = { gates, next: 0, passed: 0, missed: 0, penaltyMs: 0, results: [null, null, null] };
  updateGates(fresh, 0, 199, 0, 201);
  assert.deepEqual(fresh.results, ['miss', 'miss', 'pass']);
});

test('the mission\'s steps: the transceiver, the poles, the transition, the gates', () => {
  const m = SPLITBOARD_MISSION, st = m.createState();
  const step = (id) => m.objectives.find((o) => o.id === id);
  assert.equal(step('transceiver').check(frame(), st).done, false);
  assert.match(step('transceiver').check(frame(), st).text, /^Send check: Reto searches/);
  while (!st.check.done) stepTransition(st.check, true, DT, SPLIT.groupCheck);
  assert.equal(step('transceiver').check(frame(), st).done, true);
  // the poles: taken in order (only after the transceiver), a later one skipped is reported
  const poles = st.up.cps;
  m.update(frame({ x: poles[2].x, z: poles[2].z }), st);
  assert.equal(st.up.next, 0);
  assert.match(step('traverse').check(frame(), st).text, /^Marker pole 1 missed/);
  for (const p of poles) m.update(frame({ x: p.x, z: p.z }), st);
  assert.equal(st.up.next, poles.length);
  for (const id of ['traverse', 'ridge']) assert.equal(step(id).check(frame(), st).done, true);
  assert.equal(step('transition').check(frame(), st).done, false);
  st.trans.done = true;
  const gates = st.down.gates;
  let prev = { x: SPLIT_PLACES.summit.x, z: SPLIT_PLACES.summit.z };
  m.update(frame(prev), st);
  for (const g of gates) {
    const a = { x: g.x - g.tx * 3, z: g.z - g.tz * 3 }, b = { x: g.x + g.tx * 3, z: g.z + g.tz * 3 };
    m.update(frame(a), st); m.update(frame(b), st);
    prev = b;
  }
  assert.equal(st.down.passed, gates.length);
  // (at the finish together: with Reto still far behind, it waits for him)
  st.retoBehind = 200;
  assert.equal(step('stafel').check(frame(), st).done, false);
  assert.match(step('stafel').check(frame(), st).text, /^Wait for Reto/);
  st.retoBehind = SPLIT.partner.downGap;
  assert.equal(step('stafel').check(frame(), st).done, true);
  assert.equal(st.penaltyMs, 0);
  assert.equal(m.summary(st).length, 2);
});

test('bots on the real terrain: up on skins zig-zagging the steep steps, the transition, down through every gate: inside the medals', async () => {
  const { groundHeight: g } = await import('../js/terrain.js');
  const m = SPLITBOARD_MISSION, st = m.createState();
  let t = 0;
  while (!st.check.done) { stepTransition(st.check, true, DT, SPLIT.groupCheck); t += DT; }
  const s0 = m.start, sk = createSkinner(s0.x, s0.z, s0.heading, g);
  const trail = createTrail(s0.x, s0.z, s0.heading), P = createPartner(), risk = createRisk();
  let maxSteep = 0, maxLoad = 0, spaced = 0, maxBehind = 0;
  // (the load on the snowpack where the bot goes: it keeps to the marked line, so none may build)
  const load = (x, z, down, travel) => { const sl = slopeAt(g, x, z); stepRisk(risk, { slope: sl.slope, off: lineOffset(down ? DESCENT_ROUTE : ASCENT_ROUTE, x, z), down, travel, up: sl.up }, DT); maxLoad = Math.max(maxLoad, risk.load); };
  while (st.up.next < st.up.cps.length && t < 3000) {
    stepSkinner(sk, skinBot(sk, st.up.cps[st.up.next], g), DT, g);
    updateCheckpoints(st.up, sk.x, sk.z, SPLIT.up.radius);
    maxSteep = Math.max(maxSteep, slopeAt(g, sk.x, sk.z).slope);
    addToTrail(trail, sk.x, sk.z);
    stepPartner(P, trail, trailEnd(trail, sk.x, sk.z), DT, g, 'up');
    if (P.spaced) spaced += DT;
    maxBehind = Math.max(maxBehind, P.behind);
    load(sk.x, sk.z, false, sk.heading);
    t += DT;
  }
  assert.equal(maxLoad, 0, 'the marked line up builds no load on the snowpack');
  assert.ok(spaced > 30, `Reto kept his spacing in the steep for ${spaced.toFixed(0)} s`);
  assert.ok(maxBehind < SPLIT.partner.waitAt, `Reto never more than ${maxBehind.toFixed(0)} m behind on the way up`);
  // on the summit: Reto comes up beside you before the transition
  while (stepPartner(P, trail, trailEnd(trail, sk.x, sk.z), DT, g, 'trans').behind > SPLIT.partner.beside + 8) t += DT;
  assert.equal(st.up.next, st.up.cps.length, 'on the summit');
  assert.ok(sk.kicks >= 1, `${sk.kicks} kick turns`);
  assert.ok(maxSteep > SPLIT.skin.slip, 'there is ground too steep to go straight up');
  const up = t;
  const tr = createTransition();
  while (!tr.done) { stepTransition(tr, true, DT); t += DT; }
  const gates = st.down.gates;
  const r = createRider(sk.x, g(sk.x, sk.z), sk.z, Math.atan2(gates[0].x - sk.x, gates[0].z - sk.z));
  let prev = { x: r.x, z: r.z }, crashes = 0;
  const t0 = t;
  while (st.down.next < gates.length && t - t0 < 600) {
    const input = rideBot(r, gates, st.down.next);
    for (let k = 0; k < 2; k++) { const l = stepRider(r, input, DT / 2, g, BOARD_PARAMS); if (l?.quality === 'crash') crashes++; }
    updateGates(st.down, prev.x, prev.z, r.x, r.z);
    prev = { x: r.x, z: r.z };
    addToTrail(trail, r.x, r.z);
    stepPartner(P, trail, trailEnd(trail, r.x, r.z), DT, g, 'down');
    load(r.x, r.z, true, Math.atan2(r.vx, r.vz));
    t += DT;
  }
  assert.equal(risk.releases, 0);
  assert.equal(maxLoad, 0, 'the line down through the gates builds no load either');
  assert.equal(st.down.next, gates.length, 'at the Stafelalp');
  assert.ok(P.behind < SPLIT.partner.downGap + 40, `Reto ${P.behind.toFixed(0)} m behind at the finish`);
  assert.equal(st.down.missed, 0);
  assert.equal(crashes, 0);
  assert.ok(riderSpeed(r) > 3, 'still riding at the finish: no flat to push across');
  const total = t * 1000 + st.down.penaltyMs;
  assert.ok(medalFor(total, m.medals), `a medal at ${(total / 60000).toFixed(2)} min (up ${(up / 60).toFixed(2)} min, down ${((t - t0) / 60).toFixed(2)} min)`);
  assert.ok(total > m.medals.gold * 0.85, `gold leaves room to be quicker than the bot, not much more (bot ${(total / 60000).toFixed(2)} min, up ${(up / 60).toFixed(2)} min)`);
});

test('the gates and the poles are spaced along their lines, the last gate at the Stafelalp', () => {
  const poles = ascentPoles(), gates = descentGates();
  assert.ok(poles.length >= 15 && gates.length >= 14);
  for (let i = 1; i < poles.length; i++) assert.ok(poles[i].s > poles[i - 1].s);
  const last = gates.at(-1), A = SPLIT_PLACES.stafelalp;
  assert.ok(Math.hypot(last.x - A.x, last.z - A.z) < 120);
  // (rideBot steers for a point past the next gate's middle)
  const r = createRider(gates[0].x - gates[0].tx * 30, 0, gates[0].z - gates[0].tz * 30, Math.atan2(gates[0].tx, gates[0].tz));
  assert.ok(Math.abs(rideBot(r, gates, 0).steer) < 1);
});

test('German: the names, the intro, the steps and the running texts', async () => {
  const saved = new Map();
  globalThis.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter ??= { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document ??= {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  globalThis.localStorage ??= { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) };
  globalThis.window ??= { dispatchEvent() {} };
  const { setLanguage, t } = await import('../js/i18n.js');
  setLanguage('de');
  const m = SPLITBOARD_MISSION;
  assert.equal(t(m.title), 'Splitboardtour aufs Chörbschhorn');
  assert.match(t(m.intro), /^Ein klarer Wintertag auf dem Strelapass/);
  for (const o of m.objectives) assert.notEqual(t(o.title), o.title, o.title);
  assert.equal(t('Marker pole 3/20 · 120 m'), 'Markierstange 3/20 · 120 m');
  assert.equal(t('Gate 3/18 · 2 missed (+16 s)'), 'Tor 3/18 · 2 verpasst (+16 s)');
  assert.equal(t('Close the clips (4/6)'), 'Clips schliessen (4/6)');
  for (const st of SPLIT.transition) assert.notEqual(t(`${st.label} (1/6)`), `${st.label} (1/6)`, st.label);
  assert.match(t(m.intro), /Wo die Spur abfällt, gleiten die Felle/);
  assert.equal(t('2 kick turns · 5 s slipping'), '2 Spitzkehren · 5 s gerutscht');
  assert.equal(t('2 kick turns · 5 s slipping · Reto dug out of an avalanche (+30 s)'), '2 Spitzkehren · 5 s gerutscht · Reto aus einer Lawine ausgegraben (+30 s)');
  assert.equal(t('Send check: Reto searches, you send (1/2)'), 'Sendecheck: Reto sucht, du sendest (1/2)');
  assert.equal(t('Reto is buried! Signal: 23.4 m'), 'Reto ist verschüttet! Signal: 23,4 m');
  assert.equal(t('Wait for Reto: 85 m behind'), 'Auf Reto warten: 85 m zurück');
  assert.equal(t('Steep slope above 35°: avalanche danger – back to the track'), 'Steilhang über 35°: Lawinengefahr – zurück in die Spur');
  assert.equal(t('16 of 18 gates · 2 missed (+16 s) · top speed 80 km/h'), '16 von 18 Toren · 2 verpasst (+16 s) · Höchsttempo 80 km/h');
  assert.notEqual(t(m.finish), m.finish);
  setLanguage('en');
});

test('Reto in your track: 4 m behind on easy ground, 11 m where it reaches 30°, beside you at the transition, 24 m on the way down', () => {
  const run = (deg, stage, metres = 200) => {
    const h = slope(deg, Math.PI); // (uphill along -z: the walker below goes +… here: along -z)
    const t = createTrail(0, 0, Math.PI), P = createPartner();
    let x = 0, z = 0;
    for (let i = 0; i < metres * 10; i++) { z -= 0.1; addToTrail(t, x, z); stepPartner(P, t, trailEnd(t, x, z), 0.1 / 3, h, stage); }
    for (let i = 0; i < 200; i++) stepPartner(P, t, trailEnd(t, x, z), DT, h, stage);
    return P;
  };
  assert.ok(Math.abs(run(10, 'up').behind - SPLIT.partner.gap) < 1);
  const steep = run(32, 'up');
  assert.ok(steep.spaced && Math.abs(steep.behind - SPLIT.partner.steepGap) < 1);
  assert.ok(Math.abs(run(32, 'trans').behind - SPLIT.partner.beside) < 1);
  assert.ok(Math.abs(run(25, 'down').behind - SPLIT.partner.downGap) < 1.5);
  // he goes no quicker than he can: left 300 m behind, he closes in at his own pace
  const t = createTrail(0, 0, 0), P = createPartner();
  for (let z = 0; z <= 300; z += 1) addToTrail(t, 0, z);
  stepPartner(P, t, trailEnd(t, 0, 300), 1, slope(0), 'up');
  assert.ok(P.behind > SPLIT.partner.waitAt, 'far behind: wait for him');
  const p0 = P.s;
  for (let i = 0; i < 60; i++) stepPartner(P, t, trailEnd(t, 0, 300), DT, slope(0), 'up');
  assert.ok(P.s - p0 <= SPLIT.partner.upSpeed * 1 + 0.01);
  assert.equal(Math.round(trailPoint(t, 153.5).z), 150); // (the track begins 3.5 m behind the start)
});

test('avalanches: never on the marked line; off it in 35° and more the load builds, the HUD warns, and the slab goes', () => {
  const A = SPLIT.avalanche;
  const on = createRisk(), off = createRisk(), mild = createRisk();
  let warned = false, went = 0;
  for (let i = 0; i < 600; i++) {
    stepRisk(on, { slope: 40 * DEG, off: 10, down: false, travel: 0, up: 0 }, DT);
    stepRisk(mild, { slope: 31 * DEG, off: 200, down: false, travel: 0, up: 0 }, DT);
    if (stepRisk(off, { slope: 38 * DEG, off: A.offUp + 20, down: false, travel: 0, up: 0 }, DT)) { went = i * DT; break; }
    warned ||= off.exposed;
  }
  assert.equal(on.load, 0, 'on the line: nothing');
  assert.equal(mild.load, 0, 'under 35°: nothing');
  assert.ok(warned && Math.abs(went - A.load) < 0.1, `the slab after ${went.toFixed(2)} s`);
  assert.equal(off.releases, 1);
  // on the board: riding the fall line of such a slope does not load it, crossing it does
  const fall = createRisk(), cross = createRisk();
  for (let i = 0; i < 120; i++) {
    stepRisk(fall, { slope: 38 * DEG, off: 80, down: true, travel: Math.PI, up: 0 }, DT);
    stepRisk(cross, { slope: 38 * DEG, off: 80, down: true, travel: Math.PI / 2, up: 0 }, DT);
  }
  assert.equal(fall.load, 0); assert.ok(cross.load > 0.5);
  // back on safe ground the load goes again
  for (let i = 0; i < 600; i++) stepRisk(cross, { slope: 20 * DEG, off: 0, down: true, travel: 0, up: 0 }, DT);
  assert.equal(cross.load, 0);
  assert.ok(lineOffset([0, 0, 100, 0], 50, 30) === 30);
});

test('the rescue: buried down the fall line, the signal from 50 m, the fine search, probe and shovel with Space', () => {
  const h = slope(35, 0); // uphill along +z: down is -z
  const b = burialSpot(h, 0, 0);
  assert.ok(b.z < -50 && Math.abs(b.x) < 1e-6, `buried ${(-b.z).toFixed(0)} m down the fall line`);
  assert.equal(searchView(0, 0, 0, 0, -80).mode, 'none');
  const v = searchView(0, 0, 0, 30, 10);
  assert.equal(v.mode, 'coarse');
  assert.ok(v.arrow > 0, 'the arrow to the left (+x is the left of heading 0)');
  assert.equal(searchView(0, 0, 0, 1, 1).mode, 'fine');
  const rs = createRescue(0, -55);
  assert.equal(stepRescue(rs, 0, 0, true, DT), null);
  assert.equal(stepRescue(rs, 0, -54, false, DT), 'search');
  let t = 0, got;
  while (rs.stage !== 'out' && t < 10) { got = stepRescue(rs, 0, -54, true, DT) || got; t += DT; }
  assert.equal(rs.stage, 'out'); assert.equal(got, 'dig');
  assert.ok(Math.abs(t - SPLIT.rescue.probe - SPLIT.rescue.dig) < 0.1);
  // while he is buried every step shows the rescue, and a second avalanche ends the tour
  const m = SPLITBOARD_MISSION, st = m.createState();
  st.rescue = createRescue(10, 10);
  const view = m.objectives[1].check(frame(), st);
  assert.match(view.text, /^Reto is buried!/);
  assert.equal(view.done, false);
  st.failed = 'A second avalanche';
  assert.ok(m.objectives[2].check(frame(), st).fail);
});
