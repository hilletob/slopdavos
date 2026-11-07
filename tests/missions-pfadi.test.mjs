import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PFADI_MISSION, PFADI_MISSIONS, PFADI, PFADI_PLACES, PFADI_ROUTE, PFADI_STEPS, ROUTE_LENGTH, WOOD_NEED,
  routePoint, routeProgress, trailMarks, createSteps, stepSteps, stepsShare, stepPhase, createWood, nearestWood, woodCount,
  needle, createFlint, stepFlint, createBlow, stepBlow, stepCamp, campBot
} from '../js/missions-data-pfadi.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';
import { TLM_TREES } from '../js/tlm-trees-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

// (js/missions-data-pfadi.js is three.js-free: the steps run on synthetic frames, a bot plays the whole camp)
const DT = 1 / 60;
const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: DT, t: 0, ...over });
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const forests = TLM_TREES.areas.filter((a) => a.kind === 'forest' && a.rings[0].some((v, i) => i % 2 === 0 && Math.abs(v - 840) < 800 && Math.abs(a.rings[0][i + 1] + 232) < 800));
const inForest = (x, z) => forests.some((a) => { let c = false; for (const r of a.rings) if (inRing(r, x, z)) c = !c; return c; });

test('the mission is listed, in summer, on foot, from the Pfadiheim Davos to the Mattawald', () => {
  const m = PFADI_MISSION;
  assert.equal(getMission('pfadi-spatz'), m);
  assert.ok(MISSIONS.includes(m) && PFADI_MISSIONS.includes(m));
  assert.equal(m.mode, 'person'); assert.equal(m.season, 'summer'); assert.deepEqual(m.features, ['pfadi']);
  assert.equal(m.icon, 'tent');
  assert.match(m.logo, /^\.\/assets\/pfadi\/.+\.svg$/);
  assert.ok(m.medals.gold < m.medals.silver && m.medals.silver < m.medals.bronze && m.medals.gold === m.bonusMs);
  assert.deepEqual(m.objectives.map((o) => o.id), PFADI_STEPS);
  // the start in front of the Pfadiheim (OSM w116881199), not inside it
  const heim = DAVOS_DATA.buildings.find((b) => b.name === 'Pfadiheim Davos');
  assert.ok(heim, 'the Pfadiheim is in the map');
  assert.ok(!inRing(heim.ring, m.start.x, m.start.z), 'the start is outside the house');
  assert.ok(Math.hypot(m.start.x - PFADI_PLACES.heim.x, m.start.z - PFADI_PLACES.heim.z) < 25, 'the start at the house');
  // the way: within the map, from the start to the camp, over a kilometre
  const [x0, z0, x1, z1] = WORLD_BOUNDS;
  for (let i = 0; i < PFADI_ROUTE.length; i += 2) assert.ok(PFADI_ROUTE[i] > x0 && PFADI_ROUTE[i] < x1 && PFADI_ROUTE[i + 1] > z0 && PFADI_ROUTE[i + 1] < z1);
  assert.deepEqual([PFADI_ROUTE[0], PFADI_ROUTE[1]], [m.start.x, m.start.z]);
  assert.deepEqual(PFADI_ROUTE.slice(-2), [PFADI_PLACES.camp.x, PFADI_PLACES.camp.z]);
  assert.ok(ROUTE_LENGTH > 1200 && ROUTE_LENGTH < 1800, `${ROUTE_LENGTH.toFixed(0)} m`);
  // the camp in the forest at the foot of the Mattawald (swisstopo's area name), the tent and the fire in it
  const M = PFADI_PLACES.mattawald, C = PFADI_PLACES.camp;
  assert.ok(Math.hypot(C.x - M.x, C.z - M.z) < 500, 'the camp in the Mattawald');
  for (const p of [C, PFADI_PLACES.tent, PFADI_PLACES.fire, ...PFADI.wood.items]) assert.ok(inForest(p.x, p.z), `${p.x}, ${p.z} in the forest`);
  assert.ok(Math.hypot(PFADI_PLACES.tent.x - PFADI_PLACES.fire.x, PFADI_PLACES.tent.z - PFADI_PLACES.fire.z) > 6, 'the fire well away from the tent');
  // the trail signs along the way
  const marks = trailMarks();
  assert.ok(marks.length > 15);
  for (const k of marks) assert.ok(routeProgress(k.x, k.z, Math.max(0, k.s - 50)).off < 0.01);
});

test('the camp spot is level enough for a tent on the real terrain', async () => {
  const { groundHeight: g } = await import('../js/terrain.js');
  const slope = (x, z, e = 2) => Math.atan(Math.hypot((g(x + e, z) - g(x - e, z)) / (2 * e), (g(x, z + e) - g(x, z - e)) / (2 * e))) * 180 / Math.PI;
  for (const p of [PFADI_PLACES.tent, PFADI_PLACES.fire]) assert.ok(slope(p.x, p.z) < 9, `${slope(p.x, p.z).toFixed(1)}°`);
  for (const w of PFADI.wood.items) assert.ok(slope(w.x, w.z) < 17);
});

test('the way: progress along it, never skipping ahead, the point ahead on it', () => {
  assert.equal(routeProgress(PFADI_ROUTE[0], PFADI_ROUTE[1]).s, 0);
  const mid = routePoint(600);
  const p = routeProgress(mid.x, mid.z, 400);
  assert.ok(Math.abs(p.s - 600) < 0.5 && p.off < 0.01);
  // from the start, a point far along the way is out of reach (no jump by a loop of the way)
  const far = routePoint(1300);
  assert.ok(routeProgress(far.x, far.z, 0).s < 400);
  assert.ok(routeProgress(0, 0, 900).s >= 900, 'never back');
});

test('the held steps: Space fills them, letting go runs them back, the share and the phase', () => {
  const S = PFADI.tentSteps, st = createSteps();
  for (let t = 0; t < S[0].hold * 0.5; t += DT) stepSteps(st, true, DT, S);
  const half = st.t;
  for (let i = 0; i < 6; i++) stepSteps(st, false, DT, S);
  assert.ok(st.t < half - 0.15, 'let go: it runs back');
  let done = [];
  for (let i = 0; i < 2000 && !st.done; i++) { const d = stepSteps(st, true, DT, S); if (d) done.push(d.id); }
  assert.deepEqual(done, S.map((s) => s.id));
  assert.equal(stepsShare(st, S), 1);
  assert.deepEqual(stepPhase(st, S), { step: S.length, f: 1 });
  const fresh = createSteps();
  stepSteps(fresh, true, S[0].hold / 2, S);
  assert.ok(Math.abs(stepPhase(fresh, S).f - 0.5) < 1e-9);
});

test('the firewood: eight pieces, picked by holding Space close by, counted by kind', () => {
  const items = createWood();
  assert.equal(items.length, 8);
  const want = {};
  for (const w of items) want[w.kind] = (want[w.kind] || 0) + 1;
  assert.deepEqual(want, WOOD_NEED);
  const st = PFADI_MISSION.createState(), w = st.wood[0];
  // too far: nothing; close and held: picked after pickS
  stepCamp(st, 'wood', { x: w.x + 3, z: w.z, hold: true, press: false }, 1);
  assert.equal(w.picked, false);
  let ev = [];
  for (let t = 0; t <= PFADI.wood.pickS + DT; t += DT) ev = ev.concat(stepCamp(st, 'wood', { x: w.x + 1, z: w.z, hold: true, press: false }, DT));
  assert.equal(w.picked, true);
  assert.deepEqual(ev.map((e) => e.type), ['picked']);
  assert.equal(woodCount(st.wood).all, 1);
  assert.notEqual(nearestWood(st.wood, w.x, w.z), w);
});

test('flint and steel: the needle sweeps, a strike in the green throws sparks, three make the ember', () => {
  const S = PFADI.strike;
  assert.equal(needle(0), 0); assert.ok(Math.abs(needle(S.period / 2) - 1) < 1e-9); assert.ok(Math.abs(needle(S.period / 4) - 0.5) < 1e-9);
  const f = createFlint();
  // a strike at the wrong moment misses
  assert.equal(stepFlint(f, true, 0.01), 'miss');
  // the cooldown: a second press at once does nothing
  assert.equal(stepFlint(f, true, 0.01), null);
  let goods = 0;
  for (let i = 0; i < 2000 && !f.lit; i++) {
    const n = needle(f.t + DT);
    if (stepFlint(f, n > S.lo + 0.02 && n < S.hi - 0.02, DT) === 'good') goods++;
  }
  assert.ok(f.lit && goods === S.need, `${goods} good strikes`);
  assert.equal(f.misses, 1);
});

test('the breath: blowing feeds the ember until the breath runs out, then it catches and the fire grows', () => {
  const B = PFADI.blow, b = createBlow();
  let out = false, t = 0;
  while (!b.out && t < 10) { out = stepBlow(b, true, DT) === 'out' || out; t += DT; }
  assert.ok(out && Math.abs(t - B.breath) < 0.05, 'out of breath after a long breath');
  assert.ok(!b.caught && b.glow < 1, 'one breath is not enough');
  const g = b.glow;
  stepBlow(b, true, 0.5);
  assert.ok(b.glow <= g, 'holding on without breath: nothing');
  let caught = false;
  for (let i = 0; i < 3000 && !caught; i++) caught = stepBlow(b, i % 150 < 110, DT) === 'caught';
  assert.ok(caught && b.caught);
  for (let i = 0; i < PFADI.catchS / DT + 2; i++) stepBlow(b, false, DT);
  assert.equal(b.fire, 1);
});

test('a bot walks the way and pitches, gathers, builds and lights: inside the gold time, and every step shown', () => {
  const m = PFADI_MISSION, st = m.createState();
  const me = { x: m.start.x, z: m.start.z };
  let t = 0, index = 0, presses = 0;
  const views = [];
  while (index < m.objectives.length && t < 900) {
    const step = PFADI_STEPS[index];
    const wish = campBot(st, step, me);
    if (wish.to) {
      const dx = wish.to.x - me.x, dz = wish.to.z - me.z, d = Math.hypot(dx, dz), v = Math.min(d, PFADI.walkSpeed * DT);
      if (d > 1e-6) { me.x += (dx / d) * v; me.z += (dz / d) * v; }
    }
    const press = wish.press && !st.wasPress;
    st.wasPress = wish.press;
    if (press) presses++;
    stepCamp(st, step, { x: me.x, z: me.z, hold: wish.hold, press }, DT);
    const view = m.objectives[index].check(frame({ x: me.x, z: me.z, t: t * 1000 }), st);
    assert.ok(!view.fail, view.fail);
    assert.equal(typeof view.text, 'string');
    if (!views[index]) views[index] = view.text;
    if (view.done) index++;
    t += DT;
  }
  assert.equal(index, m.objectives.length, `stuck at ${PFADI_STEPS[index]}`);
  const ms = t * 1000;
  assert.equal(medalFor(ms, m.medals), 'gold', `${(ms / 1000).toFixed(1)} s`);
  // (the bot never waits at the level crossing: gold allows ~50 s for a train standing over it)
  assert.ok(ms > m.medals.gold * 0.72, `the gold time is not too generous: bot ${(ms / 1000).toFixed(1)} s`);
  assert.ok(st.tent.done && st.ring.done && st.flint.lit && st.blow.fire >= 1);
  assert.match(views[0], /to the camp in the Mattawald$/);
  assert.match(m.summary(st)[0], /good strikes? · \d+ missed the steel$/);
});

test('the texts have their German', async () => {
  globalThis.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter ??= { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document ??= {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  const saved = new Map();
  globalThis.localStorage ??= { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) };
  globalThis.window ??= { dispatchEvent() {} };
  const { setLanguage, t } = await import('../js/i18n.js');
  setLanguage('de');
  const m = PFADI_MISSION;
  assert.equal(t(m.title), 'Pfadi Davos: Spatz und Lagerfeuer');
  assert.match(t(m.intro), /^Abend beim Pfadiheim Davos/);
  assert.match(t(m.intro), /Mattawald/);
  assert.notEqual(t(m.finish), m.finish);
  for (const o of m.objectives) assert.notEqual(t(o.title), o.title, o.title);
  for (const s of [...PFADI.tentSteps, ...PFADI.ringSteps]) assert.notEqual(t(`${s.label} (1/5)`), `${s.label} (1/5)`, s.label);
  assert.equal(t('Peg the edges (4/5)'), 'Ränder verhäringen (4/5)');
  assert.equal(t('1.2 km to the camp in the Mattawald'), '1,2 km bis zum Lagerplatz im Mattawald');
  assert.equal(t('Firewood 3/8 · twigs 1/3 · kindling 0/2 · logs 2/3'), 'Feuerholz 3/8 · Reisig 1/3 · Anfeuerholz 0/2 · Scheiter 2/3');
  assert.equal(t('Hold Space: pick up a log'), 'Space halten: ein Scheit aufheben');
  assert.equal(t('Sparks in the tinder 2/3'), 'Funken im Zunder 2/3');
  assert.equal(t('Ember 45 %'), 'Glut 45 %');
  assert.equal(t('To the fireplace: 12 m'), 'Zur Feuerstelle: 12 m');
  assert.equal(t('To the tent spot: 12 m'), 'Zum Zeltplatz: 12 m');
  assert.equal(t('3 good strikes · 2 missed the steel'), '3 gute Schläge · 2 am Stahl vorbei');
  for (const s of ['Follow the trail signs: sticks laid as arrows', 'Space when the needle is in the green', 'Out of breath: let go and breathe in', 'Hold Space: blow gently', 'It catches! The fire grows', 'The Spatz stands', 'Ready to light', 'Picking up …', 'Strike', 'Blow']) assert.notEqual(t(s), s, s);
  setLanguage('en');
});
