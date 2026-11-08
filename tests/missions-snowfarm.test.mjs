import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  SNOWFARM, SNOWFARM_LOOP, SNOWFARM_MISSION, SNOWFARM_MISSIONS, createSnowfarmRoute, createSnowfarmGrid, resetSnowfarmGrid,
  forLoopCells, loopPose, createFarmState, bedCentre, onPad, stepLoading, layerAt, stepSpread, columnLayer, coveredShare,
  groomedShare, nearestGap, nearestUngroomed, stepTiller, farmScore, farmTimeBonus
} from '../js/missions-data-snowfarm.js';
import { MASK_TARGET, routePoint } from '../js/missions-data-work.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const DT = 1 / 30;
const S = SNOWFARM;
const route = createSnowfarmRoute();
const frame = (over = {}) => ({ mode: 'car', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: DT, t: 0, tillerRaised: false, tillerLift: 0, ...over });
const distSeg = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
};
const distPoly = (pts, x, z) => { let b = Infinity; for (let i = 2; i < pts.length; i += 2) b = Math.min(b, distSeg(x, z, pts[i - 2], pts[i - 1], pts[i], pts[i + 1])); return b; };

test('snowfarming: one mission in the list, a lorry and the snowcat, in the autumn (the summer look)', () => {
  assert.deepEqual(SNOWFARM_MISSIONS.map((m) => m.id), ['snowfarm-loipe']);
  assert.ok(MISSIONS.includes(SNOWFARM_MISSION));
  assert.equal(getMission('snowfarm-loipe').season, 'summer');
  assert.deepEqual(SNOWFARM_MISSION.features, ['workVehicle', 'snowfarm']);
  assert.equal(SNOWFARM_MISSION.mode, 'car');
  assert.equal(SNOWFARM_MISSION.vehicle, 'snowfarmTipper');
  const rt = readFileSync(new URL('../js/missions-snowfarm.js', import.meta.url), 'utf8');
  assert.match(rt, /VEHICLES\.snowfarmTipper = /);
  assert.match(rt, /SNOWFARM_FEATURES = \{ snowfarm \}/);
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), /case 'snowfarm'/);
  // judged by points, the medals in order
  assert.ok(SNOWFARM_MISSION.scoreMode);
  const m = SNOWFARM_MISSION.medals;
  assert.ok(m.gold > m.silver && m.silver > m.bronze && m.bronze > 0);
  assert.ok(m.gold < S.points.cover + S.points.groom + S.points.time);
  // the switches: the lorry and on foot, then the snowcat; in the snowcat's step no lorry
  const modes = Object.fromEntries(SNOWFARM_MISSION.objectives.map((o) => [o.id, o.allowModes]));
  assert.deepEqual(modes.load, ['car', 'person']);
  assert.deepEqual(modes.spread, ['car', 'person']);
  assert.ok(modes.snowcat.includes('snowcat') && modes.snowcat.includes('person'));
  assert.deepEqual(modes.groom, ['snowcat', 'person']);
});

test('the loop follows the Loipen of the Färich in the city data, ~755 m, closed', () => {
  assert.equal(SNOWFARM_LOOP[0], SNOWFARM_LOOP[SNOWFARM_LOOP.length - 2]);
  assert.equal(SNOWFARM_LOOP[1], SNOWFARM_LOOP[SNOWFARM_LOOP.length - 1]);
  assert.ok(route.length > 720 && route.length < 790, `${route.length.toFixed(0)} m`);
  // most of it on the OSM Loipen (the rest the track down from Oberhöfji)
  const loipen = DAVOS_DATA.loipen.filter((l) => ['w1353008601', 'w1254088836', 'w959828050', 'w1191840997'].includes(l.id));
  assert.equal(loipen.length, 4);
  let on = 0, n = 0;
  for (let s = 0; s < route.length; s += 5, n++) {
    const p = routePoint(route, s);
    if (Math.min(...loipen.map((l) => distPoly(l.pts, p.x, p.z))) < 3) on++;
  }
  assert.ok(on / n > 0.8, `${Math.round((100 * on) / n)} % on the Loipen`);
});

test('the depot, the loading spot, the snowcat and the start: on the meadow, off the Loipe and out of each other\'s way', () => {
  const D = S.depot;
  const clear = (p, r) => distPoly(SNOWFARM_LOOP, p.x, p.z) > r;
  // the heap clear of the Loipe on all sides
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) assert.ok(clear({ x: D.x + dx * D.halfL, z: D.z + dz * D.halfW }, 5), `heap corner ${dx},${dz}`);
  assert.ok(clear(S.pad, 8), 'the loading spot');
  assert.ok(clear(S.snowcat, 5), 'the snowcat');
  assert.ok(Math.hypot(S.snowcat.x - S.pad.x, S.snowcat.z - S.pad.z) > 15, 'the snowcat away from the lorry');
  // the loading spot by the heap's west face, the loader between the two
  assert.ok(S.pad.x < D.x - D.halfL && D.x - D.halfL - S.pad.x < 20);
  assert.ok(S.loader.x > S.pad.x && S.loader.x < D.x - D.halfL);
  // no building on any of them
  const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const near = DAVOS_DATA.buildings.filter((b) => Math.abs(b.ring[0] - D.x) < 200 && Math.abs(b.ring[1] - D.z) < 200);
  for (const p of [S.pad, S.snowcat, S.start, S.loader, D, { x: D.x - D.halfL, z: D.z }, { x: D.x + D.halfL, z: D.z }]) {
    for (const b of near) assert.ok(!inRing(b.ring, p.x, p.z), `${p.x}, ${p.z} in building ${b.id}`);
  }
  // the lorry starts facing the depot, a short way off
  const ahead = { x: S.start.x + Math.sin(S.start.heading) * 25, z: S.start.z + Math.cos(S.start.heading) * 25 };
  assert.ok(Math.hypot(ahead.x - S.pad.x, ahead.z - S.pad.z) < 5);
});

test('the map: the Loipe\'s 3.5 m counted, the columns fill the loop; nothing on it at first', () => {
  const g = createSnowfarmGrid(route);
  assert.ok(Math.abs(g.cols * g.cell - route.length) < 1e-6);
  const target = [...g.mask].filter((m) => m === MASK_TARGET).length;
  assert.equal(target / g.cols, 8); // (the rows whose middle is within 1.75 m: 4 m of Loipe)
  assert.equal(coveredShare(g), 0);
  assert.equal(groomedShare(g), 0);
  // a box over the seam reaches both ends
  const cols = new Set();
  forLoopCells(g, 0.2, 0, 1, 0, 1, 0.3, (_k, i) => cols.add(i));
  assert.ok(cols.has(0) && cols.has(g.cols - 1));
});

test('loading: only on the spot, standing, with the bed down; a full bed in ~16 s', () => {
  const st = createFarmState();
  const bed = { x: S.pad.x, z: S.pad.z };
  const h = 0, tx = bed.x + Math.sin(h) * S.truck.bedBack, tz = bed.z + Math.cos(h) * S.truck.bedBack;
  assert.deepEqual(bedCentre(tx, tz, h), { x: bed.x, z: bed.z });
  assert.ok(onPad(tx, tz, h, 0));
  assert.ok(!onPad(tx, tz, h, 2), 'not while moving');
  assert.ok(!onPad(tx + 10, tz, h, 0), 'not beside it');
  let t = 0;
  while (st.loads < 1 && t < 60) { stepLoading(st, true, DT); t += DT; }
  assert.ok(Math.abs(t - S.loadS) < 0.2, `${t.toFixed(1)} s`);
  assert.equal(st.load, S.capacity);
  assert.equal(stepLoading(st, true, DT), 0, 'full');
});

test('spreading: the layer by the pace; a windrow on the line behind the truck; a pile when standing; lost beside the Loipe', () => {
  assert.ok(Math.abs(layerAt(5) - 0.35) < 0.01);
  assert.ok(layerAt(S.truck.speed) < S.coverDepth, 'flat out leaves gaps');
  assert.ok(layerAt(8) >= S.coverDepth);
  const g = createSnowfarmGrid(route), st = createFarmState();
  st.load = S.capacity;
  // the truck at s = 100 on the line, going 5 m/s: nothing until the bed is up
  const pose = { s: 100, d: 0, a: 0, fu: 1, fv: 0 };
  assert.equal(stepSpread(g, st, pose, 5, true, DT), 0);
  for (let t = 0; t < 2; t += DT) { stepSpread(g, st, pose, 5, true, DT); pose.s += 5 * DT; }
  assert.ok(st.out > 0 && st.spreading);
  // behind the truck, not in front of it
  const col = (s) => Math.floor(s / g.cell);
  assert.ok(columnLayer(g, col(pose.s - S.truck.dropBack - 1)) > S.coverDepth);
  assert.equal(columnLayer(g, col(pose.s + 1)), 0);
  assert.ok(st.wasted < 1e-6, 'on the line nothing is lost');
  // let go: the bed comes down, nothing more
  const out = st.out;
  for (let t = 0; t < 2; t += DT) stepSpread(g, st, pose, 5, false, DT);
  assert.ok(st.out - out < S.flow * 0.6 && st.raise === 0);
  // standing: a pile
  const st2 = createFarmState(); st2.load = S.capacity;
  const g2 = createSnowfarmGrid(route);
  for (let t = 0; t < 4; t += DT) stepSpread(g2, st2, { s: 300, d: 0, a: 0, fu: 1, fv: 0 }, 0, true, DT);
  assert.ok(st2.piling);
  const k = Math.floor((S.half) / S.cell) * g2.cols + col(300 - S.truck.dropBack);
  assert.ok(g2.h[k] > 2, `pile ${g2.h[k].toFixed(1)} m`);
  // driving beside the Loipe: the snow is lost
  const st3 = createFarmState(); st3.load = S.capacity;
  const g3 = createSnowfarmGrid(route);
  const off = { s: 200, d: 4.5, a: 0, fu: 1, fv: 0 };
  for (let t = 0; t < 3; t += DT) { stepSpread(g3, st3, off, 5, true, DT); off.s += 5 * DT; }
  assert.ok(st3.wasted / st3.out > 0.9);
  assert.ok(coveredShare(g3) < 0.005);
});

test('the snowcat: the tiller evens the windrow over its width and grooms it; no snow, nothing groomed; raised, nothing', () => {
  const g = createSnowfarmGrid(route), st = createFarmState();
  st.load = S.capacity;
  const pose = { s: 50, d: 0, a: 0, fu: 1, fv: 0 };
  for (let t = 0; t < 30; t += DT) { stepSpread(g, st, pose, 5, true, DT); pose.s += 5 * DT; }
  const before = g.h.reduce((a, b) => a + b, 0);
  // raised: nothing
  assert.equal(stepTiller(g, { s: 120, d: 0, a: 0, fu: 1, fv: 0 }, 4, 1), 0);
  const cat = { s: 20, d: 0, a: 0, fu: 1, fv: 0 };
  for (let t = 0; t < 40; t += DT) { stepTiller(g, cat, 5, 0); cat.s += 5 * DT; }
  const after = g.h.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(after - before) / before < 1e-6, 'the snow is kept');
  // groomed where the snow was: the windrow spread over the Loipe's width
  const i = Math.floor(120 / g.cell);
  for (let j = 0; j < g.rows; j++) {
    const d = (j + 0.5) * S.cell - S.half, k = j * g.cols + i;
    if (Math.abs(d) <= S.trailHalf) { assert.ok(g.groomed[k], `row ${j}`); assert.ok(g.h[k] > 0.25 && g.h[k] < 0.45, `${g.h[k]}`); }
  }
  // not where there was none
  const bare = Math.floor(220 / g.cell);
  assert.ok(!g.groomed[(g.rows >> 1) * g.cols + bare]);
});

test('the hints: the nearest gap and the nearest stretch not groomed, both ways round the loop', () => {
  const g = createSnowfarmGrid(route);
  for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) { const k = j * g.cols + i; g.h[k] = 0.4; g.groomed[k] = 1; }
  assert.equal(nearestGap(g, 100), null);
  assert.equal(nearestUngroomed(g, 100), null);
  const i = Math.floor(30 / g.cell);
  for (let j = 0; j < g.rows; j++) { g.h[j * g.cols + i] = 0; g.groomed[j * g.cols + i] = 0; }
  assert.ok(Math.abs(nearestGap(g, 700) - 30) < 1);
  assert.ok(Math.abs(nearestUngroomed(g, 50) - 30) < 1);
  // a reset clears it all
  resetSnowfarmGrid(g, createSnowfarmGrid(route));
  assert.equal(coveredShare(g), 0);
});

// --- A bot plays it: the lorry on the line (with a sway), two loads, the walk, the snowcat round the loop ------------------
function playBot({ speed = 5, sway = 0.5, catSpeed = 5, catSway = 0.4, transit = 6, turn = 10 } = {}) {
  const g = createSnowfarmGrid(route), st = createFarmState();
  let t = 0;
  // to the spot (25 m) and loading
  t += 25 / transit + 3;
  while (st.loads < 1) { stepLoading(st, true, DT); t += DT; }
  // onto the City-Trail north of the spot, round the loop with the bed held
  const s0 = loopPose(route, S.pad.x, S.pad.z - 12, Math.PI / 2).s;
  t += 15 / transit + turn;
  let s = s0, loads = 1;
  const end = s0 + route.length + 2;
  while (s < end) {
    if (st.load <= 0) {
      // back to the depot and out again to where the snow ran out
      const p = routePoint(route, s % route.length);
      const far = Math.hypot(p.x - S.pad.x, p.z - S.pad.z) * 1.25;
      t += (2 * far) / transit + 2 * turn;
      st.raise = 0;
      while (st.load < S.capacity) { stepLoading(st, true, DT); t += DT; }
      loads++;
    }
    const pose = loopPose(route, ...(() => { const q = routePoint(route, s % route.length, sway * Math.sin(s / 23)); return [q.x, q.z, q.heading]; })());
    stepSpread(g, st, pose, speed, true, DT);
    s += speed * DT; t += DT;
  }
  st.covered = coveredShare(g);
  const spreadT = t;
  // out of the lorry, to the snowcat (~25 m), the tiller down
  t += 25 / 2.5 + 3;
  t += 20 / transit + turn;
  let c = s0;
  while (c < s0 + route.length + 5) {
    const q = routePoint(route, c % route.length, catSway * Math.sin(c / 31));
    stepTiller(g, loopPose(route, q.x, q.z, q.heading), catSpeed, 0);
    c += catSpeed * DT; t += DT;
  }
  st.groomed = groomedShare(g);
  st.covered = coveredShare(g);
  st.t = t * 1000;
  return { st, t, spreadT, loads, score: farmScore(st) };
}

test('a clean run (two loads at the right pace) makes the gold; a hurried one leaves gaps; a slow one needs a third load', () => {
  const clean = playBot();
  assert.equal(clean.loads, 2);
  assert.ok(clean.st.covered >= S.spreadGoal, `covered ${clean.st.covered.toFixed(3)}`);
  assert.ok(clean.st.groomed >= S.groomGoal, `groomed ${clean.st.groomed.toFixed(3)}`);
  assert.ok(clean.st.wasted / clean.st.out < 0.05);
  assert.equal(medalFor(clean.score, SNOWFARM_MISSION.medals, true), 'gold', `${clean.score} pts in ${clean.t.toFixed(0)} s`);
  // flat out: gaps everywhere
  const fast = playBot({ speed: S.truck.speed });
  assert.ok(fast.st.covered < S.spreadGoal, `covered ${fast.st.covered.toFixed(3)}`);
  // crawling: the loads run short (a third)
  const slow = playBot({ speed: 3 });
  assert.ok(slow.loads >= 3);
  assert.notEqual(medalFor(slow.score, SNOWFARM_MISSION.medals, true), 'gold', `${slow.score} pts`);
  // a sloppy snowcat (a metre off the line): not all groomed in one round
  const sloppy = playBot({ catSway: 1.4 });
  assert.ok(sloppy.st.groomed < clean.st.groomed);
});

test('the time bonus and the score', () => {
  const P = S.points;
  assert.equal(farmTimeBonus(P.fastS), P.time);
  assert.equal(farmTimeBonus(P.slowS), 0);
  assert.equal(farmScore({ covered: 1, groomed: 1, t: P.fastS * 1000 }), P.cover + P.groom + P.time);
  assert.equal(farmScore({ covered: 0.5, groomed: 0.5, t: 1e9 }), 0);
});

test('the objectives: load, spread, the snowcat, groom; the hints follow the work', () => {
  const st = createFarmState();
  const [load, spread, cat, groom] = SNOWFARM_MISSION.objectives;
  let v = load.check(frame(), st);
  assert.ok(!v.done && v.target?.style === 'pad');
  st.onPad = true; st.loading = true; st.load = 100;
  v = load.check(frame(), st);
  assert.match(v.hint, /stay put/);
  st.loads = 1; st.load = S.capacity; st.loading = false;
  assert.ok(load.check(frame(), st).done);
  v = spread.check(frame(), st);
  assert.equal(v.hint, 'Hold Space: spread');
  st.spreading = true; st.layer = 0.12;
  assert.match(spread.check(frame(), st).hint, /^Too fast: 12 cm/);
  st.layer = 0.35;
  assert.equal(spread.check(frame(), st).hint, null);
  st.load = 0; st.spreading = false;
  assert.match(spread.check(frame(), st).hint, /back to the depot/);
  st.covered = 0.92;
  assert.ok(spread.check(frame(), st).done);
  assert.ok(!cat.check(frame({ mode: 'person' }), st).done);
  assert.ok(cat.check(frame({ mode: 'snowcat' }), st).done);
  assert.match(groom.check(frame({ mode: 'snowcat', tillerRaised: true }), st).hint, /Lower the tiller/);
  st.groomed = 0.9;
  assert.ok(groom.check(frame({ mode: 'snowcat' }), st).done);
  // too late
  assert.ok(groom.check(frame({ t: S.limitMs + 1 }), st).fail);
  assert.equal(SNOWFARM_MISSION.summary({ ...st, loads: 2, out: 100, wasted: 3 }).length, 2);
});

test('the snowfarming Loipe speaks German: its title, intro, steps, hints and the generated texts', async () => {
  globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document = {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  globalThis.localStorage = { getItem() { return null; }, setItem() {} };
  globalThis.window = { dispatchEvent() {} };
  const { setLanguage, t } = await import('../js/i18n.js');
  setLanguage('de');
  const M = SNOWFARM_MISSION;
  for (const text of [M.title, M.intro, M.finish, ...M.objectives.map((o) => o.title)]) assert.notEqual(t(text), text, text);
  assert.match(t(M.intro), /^Ende Oktober im Färich/);
  const st = { ...createFarmState(), loads: 1, load: S.capacity, spreading: true, layer: 0.12 };
  const views = [M.objectives[0].check(frame(), { ...createFarmState(), onPad: true, loading: true, load: 200 }), M.objectives[1].check(frame(), st), M.objectives[1].check(frame(), { ...st, layer: 0.8 }),
    M.objectives[1].check(frame(), { ...st, spreading: false }), M.objectives[1].check(frame(), { ...st, load: 0, spreading: false }), M.objectives[1].check(frame(), { ...st, spreading: false, piling: true }),
    M.objectives[2].check(frame({ mode: 'person' }), { ...st, catDist: 4 }), M.objectives[2].check(frame(), { ...st, catDist: 30 }), M.objectives[3].check(frame({ mode: 'snowcat', tillerRaised: true }), st), M.objectives[3].check(frame({ mode: 'person' }), st)];
  for (const v of views) for (const text of [v.text, v.hint].filter(Boolean)) assert.notEqual(t(text), text, text);
  assert.equal(t('Bed 39 % full'), 'Brücke zu 39 % voll');
  assert.equal(t('Loipe covered 45 % of 90 % · bed 60 % · layer 35 cm'), 'Loipe bedeckt: 45 % von 90 % · Brücke 60 % · Schicht 35 cm');
  assert.equal(t('Too fast: 12 cm, that leaves a gap'), 'Zu schnell: 12 cm, das gibt eine Lücke');
  for (const line of M.summary({ ...st, loads: 2, covered: 0.97, groomed: 0.93, out: 100, wasted: 2 })) assert.notEqual(t(line), line, line);
  for (const text of ['Spread', 'Full: off to the Loipe', 'Empty: back to the depot', 'Tipper', M.objectives[0].check(frame({ t: S.limitMs + 1 }), st).fail]) assert.notEqual(t(text), text, text);
});
