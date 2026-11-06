import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RINK, RINK_MISSION, RINK_MISSIONS, createRinkIce, resetRinkIce, onIce, ringDistance, stepFreeze, stepSpray, stepBoots, stepConditioner,
  floodedShare, polishedShare, printCount, wetAt, rinkLanes
} from '../js/missions-data-rink.js';
import { POND, POND_RING, inPond } from '../js/missions-data-outdoor.js';
import { MASK_TARGET } from '../js/missions-data-work.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { readFileSync } from 'node:fs';

const DT = 1 / 30;
const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: DT, t: 0, ...over });
const cellOf = (g, x, z) => { const p = RINK.frame.toGrid(x, z); return Math.floor(p.v / g.cell) * g.cols + Math.floor(p.u / g.cell); };

test('fresh ice: one mission in the list, on the Seehof Seeli, in winter, with its feature and vehicle', () => {
  assert.deepEqual(RINK_MISSIONS.map((m) => m.id), ['seehofseeli-ice']);
  assert.ok(MISSIONS.includes(RINK_MISSION));
  assert.equal(getMission('seehofseeli-ice').season, 'winter');
  assert.deepEqual(RINK_MISSION.features, ['workVehicle', 'rinkIce']);
  assert.equal(RINK_MISSION.vehicle, 'zamboni');
  const rink = readFileSync(new URL('../js/missions-rink.js', import.meta.url), 'utf8');
  assert.match(rink, /VEHICLES\.zamboni = /);
  assert.match(rink, /RINK_FEATURES = \{ rinkIce \}/);
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), /case 'zamboni'/);
  // the medals in order, the bonus the gold
  const m = RINK_MISSION.medals;
  assert.ok(m.gold < m.silver && m.silver < m.bronze && m.bronze < RINK.timeLimitMs);
  assert.equal(RINK_MISSION.bonusMs, m.gold);
});

test('the pond is the city\'s Seehof Seeli; the hydrant, the start and the parked machine on its north bank, dry', () => {
  const water = DAVOS_DATA.water.find((w) => w.name === 'Seehof Seeli');
  assert.ok(water, 'the pond in the city data');
  assert.ok(inPond(POND.centre.x, POND.centre.z));
  for (const p of [RINK.hydrant, RINK.start, RINK.pin, RINK.machine]) {
    assert.ok(!inPond(p.x, p.z), `${p.x}, ${p.z} not in the water`);
    assert.ok(ringDistance(p.x, p.z) < 16, `by the pond (${ringDistance(p.x, p.z).toFixed(1)} m)`);
  }
  // the machine faces the ice: a few metres ahead of it is the pond
  const ahead = { x: RINK.machine.x + Math.sin(RINK.machine.heading) * 12, z: RINK.machine.z + Math.cos(RINK.machine.heading) * 12 };
  assert.ok(onIce(ahead.x, ahead.z));
  // the map covers the whole ring
  for (let i = 0; i < POND_RING.length; i += 2) {
    const p = RINK.frame.toGrid(POND_RING[i], POND_RING[i + 1]);
    assert.ok(p.u > 1 && p.v > 1 && p.u < RINK.size.u - 1 && p.v < RINK.size.v - 1);
  }
  assert.ok(onIce(727, -1419) && !onIce(690, -1419));
});

test('the map: the counted cells are the ice inside the bank; a fresh one has nothing done', () => {
  const g = createRinkIce();
  const target = [...g.mask].filter((m) => m === MASK_TARGET).length;
  const area = target * g.cell * g.cell;
  assert.ok(area > 1800 && area < 2100, `${area} m²`);
  assert.equal(floodedShare(g), 0);
  assert.equal(polishedShare(g), 0);
  assert.equal(printCount(g), 0);
});

test('the jet wets the fan ahead, the water freezes into a coat, and boots in wet water leave prints', () => {
  const g = createRinkIce();
  const feet = RINK.frame.toGrid(727, -1430), f = { u: 0, v: 1 };
  for (let i = 0; i < 30; i++) stepSpray(g, feet, f, DT);
  const aim = { x: 727, z: -1430 + RINK.hose.reach };
  assert.ok(wetAt(g, aim.x, aim.z) > 0.5, 'wet where the jet comes down');
  assert.equal(wetAt(g, 727, -1430), 0, 'dry at the feet');
  // walking into it: prints, and the layer there is gone
  const into = RINK.frame.toGrid(aim.x, aim.z);
  assert.ok(stepBoots(g, into, true) > 0);
  assert.ok(g.prints[cellOf(g, aim.x, aim.z)]);
  assert.equal(stepBoots(g, into, false), 0, 'standing still prints nothing new');
  // the rest freezes into a coat in a few seconds, and then the boots leave nothing
  for (let i = 0; i < 30 * 8; i++) stepFreeze(g, DT);
  const k = cellOf(g, aim.x + 1.2, aim.z);
  assert.equal(g.wet[k], 0);
  assert.ok(g.h[k] >= RINK.coat);
  assert.equal(stepBoots(g, RINK.frame.toGrid(aim.x + 1.2, aim.z), true), 0);
  // the print is flooded again by the jet
  for (let i = 0; i < 20; i++) stepSpray(g, RINK.frame.toGrid(aim.x, aim.z - RINK.hose.reach), f, DT);
  assert.equal(g.prints[cellOf(g, aim.x, aim.z)], 0);
  // a restart
  resetRinkIce(g, createRinkIce());
  assert.equal(g.h[k], 0);
});

test('the conditioner works behind the machine, driving forwards only', () => {
  const g = createRinkIce();
  const p = RINK.frame.toGrid(727, -1419), f = { u: 1, v: 0 };
  assert.equal(stepConditioner(g, p, f, 0), 0);
  assert.equal(stepConditioner(g, p, f, -2), 0);
  assert.ok(stepConditioner(g, p, f, 4) > 0);
  assert.ok(g.polish[cellOf(g, 727 - RINK.conditioner.back, -1419)]);
  assert.ok(!g.polish[cellOf(g, 727 + 1, -1419)], 'not under the front');
  assert.equal(g.film[cellOf(g, 727 - RINK.conditioner.back, -1419)], 1);
  stepFreeze(g, 5);
  assert.equal(g.film[cellOf(g, 727 - RINK.conditioner.back, -1419)], 0, 'the film freezes');
});

test('the objectives: the hydrant, the flood, onto the machine, resurfaced; too late fails', () => {
  const st = RINK_MISSION.createState();
  const [hose, flood, machine, resurface] = RINK_MISSION.objectives;
  assert.ok(!hose.check(frame({ x: RINK.start.x, z: RINK.start.z }), st).done);
  assert.ok(hose.check(frame({ x: RINK.hydrant.x + 1, z: RINK.hydrant.z }), st).done);
  assert.deepEqual(flood.allowModes, ['person']);
  st.flooded = RINK.floodGoal - 0.01;
  assert.ok(!flood.check(frame({ x: 727, z: -1419 }), st).done);
  st.flooded = RINK.floodGoal;
  assert.ok(flood.check(frame({ x: 727, z: -1419 }), st).done);
  st.onWet = true;
  assert.match(st.onWet && flood.check(frame({ x: 727, z: -1419 }), { ...st, flooded: 0 }).hint, /backwards/);
  assert.ok(machine.allowModes.includes('car'));
  assert.ok(!machine.check(frame(), st).done);
  assert.ok(machine.check(frame({ mode: 'car' }), st).done);
  st.polished = RINK.polishGoal;
  assert.ok(resurface.check(frame({ mode: 'car', x: 727, z: -1419 }), st).done);
  assert.equal(resurface.check(frame({ mode: 'person', x: 727, z: -1419 }), { ...st, polished: 0 }).hint, 'Back onto the machine');
  assert.ok(resurface.check(frame({ mode: 'car', t: RINK.timeLimitMs + 1 }), { ...st, polished: 0 }).fail);
});

test('bots: flooding walking backwards in lanes and resurfacing in lanes make gold, without a single print', () => {
  const g = createRinkIce();
  let t = 20, tFlood = 0, tPolish = 0; // (from the start to the hydrant and onto the ice)
  for (const [a, v, b] of rinkLanes(7.4)) {
    const dir = Math.sign(b - a);
    let u = a;
    t += 3; // (a turn)
    const end = b + dir * RINK.hose.reach;
    while ((end - u) * dir > 0 && !tFlood) {
      u += dir * RINK.hose.back * DT; t += DT;
      // facing against the walk: the jet comes down where the feet were
      stepSpray(g, { u, v }, { u: -dir, v: 0 }, DT);
      stepBoots(g, { u, v }, true);
      stepFreeze(g, DT);
      if (floodedShare(g) >= RINK.floodGoal) tFlood = t;
    }
  }
  assert.ok(tFlood, `flooded ${floodedShare(g)}`);
  assert.equal(printCount(g), 0);
  t += 20; // to the machine, onto the ice
  const L = RINK.conditioner.halfW * 2 * 0.92;
  for (const [a, v, b] of rinkLanes(L)) {
    const dir = Math.sign(b - a);
    let u = a - dir;
    t += 4.5;
    const end = b + dir * (RINK.conditioner.back + 0.5);
    while ((end - u) * dir > 0 && !tPolish) {
      u += dir * 6.5 * DT; t += DT;
      stepConditioner(g, { u, v }, { u: dir, v: 0 }, 6.5);
      if (polishedShare(g) >= RINK.polishGoal) tPolish = t;
    }
  }
  assert.ok(tPolish, `resurfaced ${polishedShare(g)}`);
  assert.equal(medalFor(tPolish * 1000, RINK_MISSION.medals), 'gold', `${(tPolish / 60).toFixed(2)} min`);
  assert.ok(tPolish * 1000 > RINK_MISSION.medals.gold * 0.8, 'gold is not given away');
});
