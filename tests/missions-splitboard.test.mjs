import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPLITBOARD_MISSION, SPLITBOARD_MISSIONS, SPLIT, SPLIT_PLACES, ASCENT_ROUTE, DESCENT_ROUTE, skinPace, climbRate, kickTurnHeading,
  createSkinner, stepSkinner, slopeAt, createTransition, stepTransition, transitionShare, ascentPoles, descentGates, updateGates,
  skinBot, rideBot
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

test('the transition: four holds, letting go runs the step back', () => {
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
  st.lvs = SPLIT.transceiver; st.beeped = true;
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
  assert.equal(step('stafel').check(frame(), st).done, true);
  assert.equal(st.penaltyMs, 0);
  assert.equal(m.summary(st).length, 2);
});

test('bots on the real terrain: up on skins zig-zagging the steep steps, the transition, down through every gate: inside the medals', async () => {
  const { groundHeight: g } = await import('../js/terrain.js');
  const m = SPLITBOARD_MISSION, st = m.createState();
  let t = SPLIT.transceiver + 0.1;
  const s0 = m.start, sk = createSkinner(s0.x, s0.z, s0.heading, g);
  let maxSteep = 0;
  while (st.up.next < st.up.cps.length && t < 3000) {
    stepSkinner(sk, skinBot(sk, st.up.cps[st.up.next], g), DT, g);
    updateCheckpoints(st.up, sk.x, sk.z, SPLIT.up.radius);
    maxSteep = Math.max(maxSteep, slopeAt(g, sk.x, sk.z).slope);
    t += DT;
  }
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
    t += DT;
  }
  assert.equal(st.down.next, gates.length, 'at the Stafelalp');
  assert.equal(st.down.missed, 0);
  assert.equal(crashes, 0);
  assert.ok(riderSpeed(r) > 3, 'still riding at the finish: no flat to push across');
  const total = t * 1000 + st.down.penaltyMs;
  assert.ok(medalFor(total, m.medals), `a medal at ${(total / 60000).toFixed(2)} min (up ${(up / 60).toFixed(2)} min, down ${((t - t0) / 60).toFixed(2)} min)`);
  assert.ok(total > m.medals.gold * 0.85, 'gold leaves room to be quicker than the bot, not much more');
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
  assert.equal(t('Join the halves (3/4)'), 'Die Hälften zusammenfügen (3/4)');
  assert.equal(t('2 kick turns · 5 s slipping'), '2 Spitzkehren · 5 s gerutscht');
  assert.equal(t('16 of 18 gates · 2 missed (+16 s) · top speed 80 km/h'), '16 von 18 Toren · 2 verpasst (+16 s) · Höchsttempo 80 km/h');
  assert.notEqual(t(m.finish), m.finish);
  setLanguage('en');
});
