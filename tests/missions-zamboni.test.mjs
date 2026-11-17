import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  ZAMBONI, ZAMBONI_MISSION, ZAMBONI_MISSIONS, createZamboniIce, resetZamboniIce, createMachine, stepMachine, stepConditioner, stepFilm,
  iceShare, bandShare, puddleArea, boardsDistance, inTunnel, masterPath, pursue, zamboniScore, machineWorld
} from '../js/missions-data-zamboni.js';
import { RINK, rinkLocal } from '../js/missions-data-ice.js';
import { EISSTADION, pointInRing } from '../js/landmark-buildings-data.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';

const DT = 1 / 30;
const HL = RINK.halfL;

/** The bot of the calibration: the ice masters' path by pure pursuit; the conditioner off once the ice is done */
function playBot({ path = masterPath(), limit = 600, slowAtGate = 1.0 } = {}) {
  const g = createZamboniIce(), m = createMachine();
  let i = 0, t = 0, maxImpact = 0;
  m.on = true;
  while (t < limit) {
    const p = pursue(m, path, i); i = p.i;
    if (i >= path.home && iceShare(g) >= ZAMBONI.goal) m.on = false;
    const sharp = Math.abs(p.err), slow = m.x < -24 && i >= path.home ? slowAtGate : 9;
    const back = (sharp > 0.9 && m.v > 1.6) || m.v > slow ? 1 : 0;
    const r = stepMachine(m, { forward: back ? 0 : sharp < 0.35 ? 1 : sharp < 0.9 ? 0.5 : 0.25, back, steer: p.steer }, DT);
    maxImpact = Math.max(maxImpact, r.impact);
    stepConditioner(g, m, DT, t);
    stepFilm(g, DT);
    t += DT;
    if (i >= path.length - 1 && m.x <= ZAMBONI.home && inTunnel(m.x, m.y)) break;
  }
  return { g, m, t, maxImpact };
}

test('the intermission\'s ice: one mission, in the Eisstadion, an evening, by points, with its feature and module', () => {
  assert.deepEqual(ZAMBONI_MISSIONS.map((m) => m.id), ['eisstadion-zamboni']);
  assert.ok(MISSIONS.includes(ZAMBONI_MISSION));
  assert.equal(getMission('eisstadion-zamboni'), ZAMBONI_MISSION);
  assert.equal(ZAMBONI_MISSION.board, 'eisstadion-zamboni-1');
  assert.deepEqual(ZAMBONI_MISSION.features, ['zamboni']);
  assert.equal(ZAMBONI_MISSION.mode, 'person');
  assert.equal(ZAMBONI_MISSION.time, 'evening');
  assert.ok(ZAMBONI_MISSION.scoreMode);
  const m = ZAMBONI_MISSION.medals;
  assert.ok(m.gold > m.silver && m.silver > m.bronze && m.bronze > ZAMBONI.points.finish);
  // (an automatic leaderboard by score takes up to 100 000 points: the most there is, a perfect run, stays far below)
  assert.ok(ZAMBONI.points.finish + ZAMBONI.points.extra + ZAMBONI.timeLimitMs / 1000 < 100000);
  const src = readFileSync(new URL('../js/missions-zamboni.js', import.meta.url), 'utf8');
  assert.match(src, /ZAMBONI_FEATURES = \{ zamboni \}/);
  assert.match(readFileSync(new URL('../js/missions.js', import.meta.url), 'utf8'), /Object\.assign\(FEATURES, ZAMBONI_FEATURES\)/);
  const html = readFileSync(new URL('../play.html', import.meta.url), 'utf8');
  for (const f of ['missions-data-zamboni.js', 'missions-zamboni.js']) assert.ok(html.includes(`href="./js/${f}"`), f);
});

test('the rink, the gate and the start are inside the Eisstadion; the gate is in the end boards, short of the corner', () => {
  const ring = EISSTADION.outline.map((p) => [p.x, p.z]);
  for (const p of [ZAMBONI_MISSION.start, machineWorld(createMachine())]) assert.ok(pointInRing(ring, p.x, p.z), 'the start in the hall');
  assert.ok(!pointInRing(ring, ZAMBONI_MISSION.pin.x, ZAMBONI_MISSION.pin.z), 'the pin outside it');
  const G = ZAMBONI.gate;
  assert.ok(Math.abs(G.y) + G.halfW <= RINK.halfW - RINK.corner, 'the gate on the straight end boards');
  assert.ok(boardsDistance(-HL, G.y) === 0 && boardsDistance(0, 0) === RINK.halfW);
  assert.ok(inTunnel(ZAMBONI.park.x, G.y) && !inTunnel(0, 0) && !inTunnel(-HL - 1, G.y + G.halfW + 0.5));
  // the map: the ice inside the edger's strip, ~1660 m²; the band along the boards about a third of it
  const g = createZamboniIce();
  const area = g.target * g.cell * g.cell;
  assert.ok(area > 1650 && area < 1760, `${area} m²`);
  assert.ok(g.bandTarget > g.target * 0.3 && g.bandTarget < g.target * 0.45);
  assert.equal(iceShare(g), 0);
});

test('the machine: 15 km/h at most, a wide turn, the steer to the left turns it left; S brakes, then backs up', () => {
  const m = createMachine();
  Object.assign(m, { x: -25, y: 0, a: 0 });
  for (let i = 0; i < 30 * 8; i++) stepMachine(m, { forward: 1 }, DT);
  assert.ok(Math.abs(m.v - 15 / 3.6) < 0.01, `${m.v * 3.6} km/h`);
  assert.ok(m.x > -5 && m.x < 10);
  // full lock to the left at a crawl: a circle; the heading falls (towards −y: left of a driver facing +x)
  Object.assign(m, { x: 0, y: 0, a: 0, v: 1.5, steer: 0 });
  const xs = [], ys = [];
  for (let i = 0; i < 30 * 12; i++) { stepMachine(m, { forward: 0.3, steer: 1 }, DT); m.v = 1.5; xs.push(m.x); ys.push(m.y); }
  assert.ok(Math.min(...ys) < -6 && Math.max(...ys) <= 0.01, 'turned to the left (−y)');
  const across = Math.max(...ys) - Math.min(...ys);
  assert.ok(across > 8 && across < 13, `a turning circle of ${across.toFixed(1)} m (the body's middle)`);
  // braking, then backing up slowly
  Object.assign(m, { x: 0, y: 0, a: 0, v: 4, steer: 0 });
  let t = 0;
  while (m.v > 0) { stepMachine(m, { back: 1 }, DT); t += DT; }
  assert.ok(t < 1.5, `stops in ${t.toFixed(2)} s`);
  for (let i = 0; i < 30 * 6; i++) stepMachine(m, { back: 1 }, DT);
  assert.ok(m.v < 0 && m.v >= -ZAMBONI.machine.vBack - 1e-9);
});

test('the boards: a slow touch stops the machine, a hard knock counts; the gate lets it through, its posts do not', () => {
  const m = createMachine();
  // straight at the east end boards at full speed: one hard knock, and it stays inside
  Object.assign(m, { x: 20, y: 0, a: 0, v: ZAMBONI.machine.vMax });
  let knocks = 0;
  for (let i = 0; i < 30 * 5; i++) { const r = stepMachine(m, { forward: 1 }, DT); if (r.impact >= ZAMBONI.bump) knocks++; }
  assert.equal(knocks, 1);
  assert.equal(m.bumps, 1);
  assert.ok(m.x + 0.85 + 1.2 <= HL + 1e-6, 'the nose inside the boards');
  // creeping into them: no knock
  Object.assign(m, { x: HL - 3, y: 0, a: 0, v: 0.6, bumps: 0, contact: false });
  for (let i = 0; i < 30 * 4; i++) stepMachine(m, { forward: 0.05 }, DT);
  assert.ok(m.contact, 'up against them');
  assert.equal(m.bumps, 0);
  // out of the tunnel and back in along the gate's line
  Object.assign(m, createMachine());
  for (let i = 0; i < 30 * 6; i++) stepMachine(m, { forward: 0.6 }, DT);
  assert.ok(m.x > -HL + 3 && m.bumps === 0 && Math.abs(m.y - ZAMBONI.gate.y) < 0.05, 'out onto the ice');
  // against the end boards beside the gate: held there
  Object.assign(m, { x: -HL + 4, y: ZAMBONI.gate.y + 4, a: Math.PI, v: 1, contact: false });
  for (let i = 0; i < 30 * 8; i++) stepMachine(m, { forward: 0.3 }, DT);
  assert.ok(m.x >= -HL + 1.2 - 1e-6, 'not through the boards beside the gate');
});

test('the conditioner: lays a 2.3 m strip behind the machine, only while on and moving, and water on wet ice pools', () => {
  const g = createZamboniIce(), m = createMachine();
  Object.assign(m, { x: -15, y: 0, a: 0, v: 3, on: false });
  assert.equal(stepConditioner(g, m, DT, 0).laid, 0, 'off: nothing');
  m.on = true; m.v = 0.1;
  assert.equal(stepConditioner(g, m, DT, 0).laid, 0, 'standing: nothing');
  m.v = 3;
  let t = 0;
  for (let i = 0; i < 30 * 8; i++) { stepMachine(m, { forward: 0.72 }, DT); stepConditioner(g, m, DT, t); stepFilm(g, DT); t += DT; }
  // across the strip at x = 0: 2.3 m wide (±1.15, cells of 0.5 m: 4 or 5 of them)
  const col = Math.floor((0 + HL) / g.cell);
  const rows = [];
  for (let j = 0; j < g.rows; j++) if (g.done[j * g.cols + col]) rows.push(j);
  assert.ok(rows.length >= 4 && rows.length <= 5, `${rows.length} cells across`);
  assert.ok(g.film[Math.floor(RINK.halfW / g.cell) * g.cols + col] > 0.2, 'still wet a few seconds later');
  assert.equal(puddleArea(g), 0);
  assert.ok(m.water < 1 && m.snow > 0);
  // straight back over the still wet strip (turned round on the spot): puddles
  Object.assign(m, { x: 8, y: 0, a: Math.PI, v: 3 });
  for (let i = 0; i < 30 * 3; i++) { stepMachine(m, { forward: 0.72 }, DT); stepConditioner(g, m, DT, t); t += DT; }
  assert.ok(puddleArea(g) > 2, `${puddleArea(g)} m² of puddles`);
  // the film freezes in ~14 s
  for (let i = 0; i < 30 * 16; i++) stepFilm(g, DT);
  assert.ok(g.film.every((f) => f === 0));
  resetZamboniIce(g);
  assert.equal(iceShare(g), 0);
  assert.equal(puddleArea(g), 0);
});

test('the water runs out after ~1250 m of laying; dry, the conditioner lays nothing', () => {
  const g = createZamboniIce(), m = createMachine();
  Object.assign(m, { x: 0, y: 0, a: 0, v: 3, on: true, water: 0.001 });
  stepConditioner(g, m, 1, 0);
  assert.equal(m.water, 0);
  assert.equal(stepConditioner(g, m, DT, 5).laid, 0);
});

test('the ice masters\' pattern: laps, then the middle, ≥ 95 % in about four minutes, nothing knocked, no puddles', () => {
  const { g, m, t } = playBot();
  assert.ok(iceShare(g) >= ZAMBONI.goal, `${(iceShare(g) * 100).toFixed(1)} %`);
  assert.ok(bandShare(g) >= ZAMBONI.bandGoal);
  assert.equal(m.bumps, 0);
  assert.equal(puddleArea(g), 0);
  assert.ok(m.water > 0.15, `water left ${m.water.toFixed(2)}`);
  assert.ok(m.snow > 0.6 && m.snow <= 1);
  assert.ok(m.x <= ZAMBONI.home && inTunnel(m.x, m.y), 'back in the tunnel');
  assert.ok(t > 180 && t < 330, `${t.toFixed(0)} s`);
  // its score: gold, a little over the line (a player by hand is slower)
  const state = { ice: iceShare(g), bumps: m.bumps, puddleM2: puddleArea(g), finished: true, tMs: t * 1000 };
  const score = zamboniScore(state);
  assert.equal(medalFor(score, ZAMBONI_MISSION.medals, true), 'gold', `${score}`);
  assert.ok(score < ZAMBONI_MISSION.medals.gold + 120);
});

test('the score: a point a second left, the extra ice, less knocks and puddles; nothing for an unfinished run', () => {
  const base = { ice: 0.95, bumps: 0, puddleM2: 0, finished: true, tMs: ZAMBONI.timeLimitMs - 100000 };
  assert.equal(zamboniScore(base), 1100);
  assert.equal(zamboniScore({ ...base, ice: 1 }), 1300);
  assert.equal(zamboniScore({ ...base, bumps: 2 }), 1020);
  assert.equal(zamboniScore({ ...base, puddleM2: 1.5 }), 1070);
  assert.equal(zamboniScore({ ...base, finished: false }), 0);
  assert.equal(zamboniScore({ ...base, bumps: 100 }), 0, 'never below zero');
  assert.equal(medalFor(zamboniScore({ ...base, tMs: ZAMBONI.timeLimitMs - 30000 }), ZAMBONI_MISSION.medals, true), null, 'finishing at the last second: no medal');
});

test('the steps: their texts, the hints, the gate, and the fails (time, dry tank)', () => {
  const M = ZAMBONI_MISSION, st = M.createState();
  const at = (x, y, t = 0) => { const w = machineWorld({ ...createMachine(), x, y }); return { mode: 'person', x: w.x, y: 0, z: w.z, heading: 0, speed: 0, dt: DT, t }; };
  const [boards, middle, gate] = M.objectives;
  let v = boards.check(at(ZAMBONI.park.x, ZAMBONI.gate.y), st);
  assert.equal(v.hint, 'Space: conditioner on');
  assert.equal(v.text, 'Along the boards 0 % of 90 % · 9:00 left');
  st.on = true;
  assert.equal(boards.check(at(ZAMBONI.park.x, ZAMBONI.gate.y), st).hint, 'W: out through the gate onto the ice');
  assert.equal(boards.check(at(0, 0, 61000), st).text, 'Along the boards 0 % of 90 % · 7:59 left');
  st.band = 0.91;
  assert.ok(boards.check(at(0, 0), st).done);
  st.ice = 0.5; st.water = 0.42;
  v = middle.check(at(0, 0, 120000), st);
  assert.equal(v.text, 'Ice 50 % of 95 % · water 42 % · 7:00 left');
  assert.ok(!v.done && v.hint.startsWith('Now the middle'));
  assert.ok(middle.check(at(0, 0, ZAMBONI.timeLimitMs + 1), st).fail, 'the intermission is over');
  assert.ok(middle.check(at(0, 0), { ...st, dry: true }).fail, 'dry before the ice is done');
  st.ice = 0.96;
  assert.ok(middle.check(at(0, 0), { ...st, dry: true }).done, 'dry after it: fine');
  v = gate.check(at(0, ZAMBONI.gate.y, 200000), st);
  assert.ok(!v.done && /^\d+ m to the gate · 5:40 left$/.test(v.text) && v.target);
  assert.ok(!st.finished);
  assert.ok(gate.check(at(ZAMBONI.home - 0.5, ZAMBONI.gate.y, 200000), st).done);
  assert.ok(st.finished);
  assert.match(M.summary({ ...st, bumps: 1, puddleM2: 2.25, water: 0.31 })[0], /^96 % of the ice resurfaced · 1 hard knock · 2 m² of puddles · water left 31 %$/);
  // the world frame round trip: the gate's tunnel is where the steps think it is
  const l = rinkLocal(M.start.x, M.start.z);
  assert.ok(inTunnel(l.x, l.y));
});
