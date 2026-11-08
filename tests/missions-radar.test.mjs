import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  RADAR, RADAR_MISSION, RADAR_MISSIONS, FINES, RADAR_ROAD, ROAD_LENGTH, LASER_SPOT, TRIPOD, STOP_S, STOP_POINT, PATROL_BAY, RADAR_START, AIM_HEADING,
  roadFrame, roadPoint, radialSpeed, readingKmh, excessOf, fineFor, laserTarget, chooseDriver, createCheck, stepCheck, brakeSpeed, stopCandidate,
  createStream, stepStream, STREAM
} from '../js/missions-data-radar.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor, missionMedals } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const DT = 1 / 30;
const EYE = { x: LASER_SPOT.x, z: LASER_SPOT.z };

test('the speed check: one mission in the list, a patrol car, scored by points', () => {
  assert.deepEqual(RADAR_MISSIONS.map((m) => m.id), ['radar-talstrasse']);
  assert.ok(MISSIONS.includes(RADAR_MISSION));
  assert.equal(getMission('radar-talstrasse'), RADAR_MISSION);
  assert.deepEqual(RADAR_MISSION.features, ['policeCar', 'radarCheck']);
  assert.equal(RADAR_MISSION.mode, 'car');
  assert.ok(RADAR_MISSION.scoreMode);
  const m = missionMedals(RADAR_MISSION);
  assert.ok(m.gold > m.silver && m.silver > m.bronze && m.bronze > 0);
  assert.equal(RADAR_MISSION.score(RADAR_MISSION.createState()), 0, 'nothing done, nothing scored');
  const runtime = readFileSync(new URL('../js/missions-radar.js', import.meta.url), 'utf8');
  assert.match(runtime, /RADAR_FEATURES = \{ radarCheck \}/);
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), /case 'radar'/);
});

test('the road is the Talstrasse from the OSM data, the laser on its verge, the stop past it', () => {
  const tal = DAVOS_DATA.roads.find((r) => r.id === 'w127415531');
  assert.equal(tal.name, 'Talstrasse');
  assert.ok(tal.oneway && tal.lanes === 2);
  // the straight's points are the road's own
  for (let i = 0; i < tal.pts.length; i += 2) assert.ok(roadFrame(tal.pts[i], tal.pts[i + 1]).off < 0.01);
  // the straight: 200 m before the laser, 150 m after it, the axis within a metre of the line through its ends
  const a = roadPoint(RADAR.siteS - 200), b = roadPoint(RADAR.siteS + 150);
  for (let s = RADAR.siteS - 200; s <= RADAR.siteS + 150; s += 10) {
    const p = roadPoint(s);
    const cross = Math.abs((p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x)) / Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(cross < 1, `${s}: ${cross.toFixed(2)} m off the straight`);
  }
  const f = roadFrame(LASER_SPOT.x, LASER_SPOT.z);
  assert.ok(Math.abs(f.s - RADAR.siteS) < 0.01 && f.lat > tal.width / 2 + 1.5, 'the laser on the verge, right of the cars');
  assert.ok(Math.abs(roadFrame(STOP_POINT.x, STOP_POINT.z).lat - RADAR.stopLat) < 0.01);
  assert.ok(roadFrame(PATROL_BAY.x, PATROL_BAY.z).lat - 0.95 > tal.width / 2, 'the patrol car off the road');
  assert.ok(roadFrame(PATROL_BAY.x, PATROL_BAY.z).s - 2.4 > RADAR.siteS + 1 && roadFrame(PATROL_BAY.x, PATROL_BAY.z).s + 2.4 < STOP_S - 2.4, 'between the laser and the stopped car');
  // the laser faces the oncoming cars, the tripod a step ahead
  const up = roadPoint(RADAR.siteS - 150);
  assert.ok(Math.abs(Math.atan2(up.x - EYE.x, up.z - EYE.z) - AIM_HEADING) < 0.06);
  assert.ok(Math.hypot(TRIPOD.x - EYE.x, TRIPOD.z - EYE.z) < 1);
  // no building on the spots
  const inside = (x, z) => DAVOS_DATA.buildings.some((bd) => {
    const r = bd.ring; let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > z) !== (r[j + 1] > z) && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
    return c;
  });
  for (const p of [LASER_SPOT, PATROL_BAY, STOP_POINT, RADAR_START]) assert.ok(!inside(p.x, p.z), `${p.x}, ${p.z}`);
  // the start: on the Talstrasse below, the road ahead
  const start = DAVOS_DATA.roads.find((r) => r.id === 'w531784374');
  assert.equal(start.name, 'Talstrasse');
  assert.ok(Math.hypot(RADAR_START.x - PATROL_BAY.x, RADAR_START.z - PATROL_BAY.z) < 700);
});

test('the verge is nearly level where the laser and the patrol car stand', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  for (const p of [LASER_SPOT, PATROL_BAY]) {
    const h = [[-3, 0], [3, 0], [0, -3], [0, 3]].map(([dx, dz]) => groundHeight(p.x + dx, p.z + dz));
    assert.ok(Math.max(...h) - Math.min(...h) < 1.2, `${p.x}, ${p.z}: ${h.map((v) => v.toFixed(2))}`);
  }
});

test('the reading: the closing speed, cut to whole km/h; the tolerance and the fines', () => {
  const car = { x: EYE.x, z: EYE.z - 100, tx: 0, tz: 1, speed: 60 / 3.6 };
  assert.equal(readingKmh(radialSpeed(car, EYE.x, EYE.z)), 60);
  assert.equal(readingKmh(59.9 / 3.6), 59, 'cut, never rounded up');
  const side = { ...car, x: EYE.x - 5.6, z: EYE.z - 30 }; // the cosine at 30 m, 5.6 m beside the line
  assert.ok(readingKmh(radialSpeed(side, EYE.x, EYE.z)) < 60);
  assert.ok(radialSpeed({ ...car, tz: -1 }, EYE.x, EYE.z) < 0, 'driving away');
  assert.equal(excessOf(53), 0);
  assert.equal(excessOf(54), 1);
  assert.deepEqual([0, 1, 5, 6, 10, 11, 15, 16, 40].map(fineFor), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(FINES.map((f) => f.label), ['CHF 40', 'CHF 120', 'CHF 250', 'Report']);
});

test('the laser locks onto the car nearest the crosshair, in its cone only', () => {
  const a = { id: 1, ...roadPoint(RADAR.siteS - 120, -1.6), tx: 0, tz: 0, speed: 0 }, b = { id: 2, ...roadPoint(RADAR.siteS - 140, 1.6), tx: 0, tz: 0, speed: 0 };
  const at = (c) => Math.atan2(c.x - EYE.x, c.z - EYE.z);
  assert.equal(laserTarget([a, b], EYE, at(a)).car.id, 1);
  assert.equal(laserTarget([a, b], EYE, at(b)).car.id, 2);
  assert.equal(laserTarget([a, b], EYE, at(a) + 0.5), null);
});

// --- The commuters' stream as the traffic (js/missions-data-radar.js stepStream: the runtime drives the same) ---------------
/** A clean officer: measures each car as it comes in good range, stops a speeder when there is time, runs to the car,
 *  hands out the right fine and runs back to the laser */
function playCheck({ seed = 1, wrongFines = false, stopAll = false, runSpeed = 7, react = 0.4 } = {}) {
  const check = createCheck(), stream = createStream(seed);
  const traffic = { cars: stream.cars };
  const player = { x: EYE.x, z: EYE.z, mode: 'person' };
  let aim = AIM_HEADING, wait = 0, t = 0;
  while (!check.over && t < 400) {
    stepStream(stream, check, DT, []);
    const atLaser = Math.hypot(player.x - EYE.x, player.z - EYE.z) < 0.5;
    const input = { measure: false, stop: false, fine: null };
    const st = check.stop;
    wait = Math.max(0, wait - DT);
    if (st?.phase === 'stopped') {
      const car = traffic.cars.find((c) => c.id === st.id);
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (st.atCar && wait === 0) {
        const right = st.excess == null ? 0 : fineFor(st.excess);
        input.fine = wrongFines && right ? (right % 4) + 1 : right;
      } else if (d > 1) { player.x += ((car.x - player.x) / d) * Math.min(d - 0.9, runSpeed * DT); player.z += ((car.z - player.z) / d) * Math.min(d - 0.9, runSpeed * DT); }
      if (d <= RADAR.fineReach && !wait) wait = 0;
    } else if (!atLaser) {
      const d = Math.hypot(EYE.x - player.x, EYE.z - player.z);
      const k = Math.min(d, runSpeed * DT) / d;
      player.x += (EYE.x - player.x) * k; player.z += (EYE.z - player.z) * k;
      wait = react;
    } else if (wait === 0) {
      const L = check.laser;
      if (L.phase !== 'lock') {
        // a reading of a speeder still coming: the stop sign
        const last = L.phase === 'shown' ? check.readings.get(L.carId) : null;
        const cand = stopCandidate(check, { cars: traffic.cars, eye: EYE });
        if (!st && last && (last.excess >= 1 || stopAll) && cand?.car.id === L.carId) {
          const room = STOP_S - cand.s;
          if (room > 25 && (cand.car.speed ** 2) / (2 * room) < RADAR.maxDecel) { input.stop = true; wait = react; }
        }
        // the next unmeasured car in good range
        if (!input.stop) {
          const next = traffic.cars.filter((c) => !check.readings.has(c.id)).map((c) => ({ c, d: Math.hypot(c.x - EYE.x, c.z - EYE.z), s: roadFrame(c.x, c.z).s }))
            .filter((o) => o.s < RADAR.siteS - 40 && o.d > 70 && o.d < 220).sort((p, q) => p.d - q.d)[0];
          if (next) { aim = Math.atan2(next.c.x - EYE.x, next.c.z - EYE.z); input.measure = true; wait = react; }
        }
      }
    }
    stepCheck(check, { eye: EYE, aim, laserOn: atLaser, player, cars: traffic.cars, input }, DT);
    t += DT;
  }
  return check;
}

test('a stopped car brakes evenly to the stop point', () => {
  const st = { decel: 4 };
  assert.equal(brakeSpeed(st, STOP_S), 0);
  assert.ok(Math.abs(brakeSpeed(st, STOP_S - 50) - 20) < 1e-9);
});

test('the check: a measured speeder stopped and fined right scores, a wrong fine or an innocent stopped costs', () => {
  const check = createCheck();
  const car = { id: 7, ...roadPoint(RADAR.siteS - 130, 1.6), tx: 0, tz: 0, speed: 66 / 3.6 };
  const p = roadPoint(RADAR.siteS - 130);
  car.tx = p.dx; car.tz = p.dz;
  const frame = (input = {}, player = { ...EYE, mode: 'person' }) => ({ eye: EYE, aim: Math.atan2(car.x - EYE.x, car.z - EYE.z), laserOn: true, player, cars: [car], input: { measure: false, stop: false, fine: null, ...input } });
  stepCheck(check, frame({ measure: true }), DT);
  assert.equal(check.laser.phase, 'lock');
  for (let i = 0; i < 20; i++) stepCheck(check, frame(), DT);
  assert.equal(check.laser.phase, 'shown');
  const kmh = check.laser.kmh;
  assert.ok(kmh >= 64 && kmh <= 65, `${kmh}`);
  stepCheck(check, frame({ stop: true }), DT);
  assert.equal(check.stop.id, 7);
  assert.equal(check.score, RADAR.points.stop);
  // it pulls in: stopped at the kerb
  car.speed = 0;
  Object.assign(car, roadPoint(STOP_S, RADAR.stopLat));
  stepCheck(check, frame(), DT);
  assert.equal(check.stop.phase, 'stopped');
  assert.equal(check.stop.atCar, false, 'the officer is still at the laser');
  stepCheck(check, frame({ fine: 3 }, { x: car.x + 2, z: car.z, mode: 'person' }), DT);
  const right = fineFor(excessOf(kmh));
  assert.equal(right, 3);
  assert.equal(check.score, RADAR.points.stop + RADAR.points.fine);
  assert.equal(check.stop, null);
  // a car without a reading stopped: a deduction
  const other = { ...car, id: 8, ...roadPoint(RADAR.siteS - 100, -1.6), speed: 12 };
  const before = check.score;
  stepCheck(check, { ...frame({ stop: true }), cars: [other] }, DT);
  assert.equal(check.score, before + RADAR.points.stopBlind);
});

test('out of range or nothing in the cone: an error on the display, no reading', () => {
  const check = createCheck();
  const far = { id: 1, ...roadPoint(RADAR.siteS - 340, 1.6), tx: 0, tz: -1, speed: 14 };
  stepCheck(check, { eye: EYE, aim: Math.atan2(far.x - EYE.x, far.z - EYE.z), laserOn: true, cars: [far], input: { measure: true } }, DT);
  assert.equal(check.laser.error, 'RANGE');
  stepCheck(check, { eye: EYE, aim: AIM_HEADING + 1, laserOn: true, cars: [far], input: { measure: true } }, DT);
  assert.equal(check.laser.error, 'NO TARGET');
  assert.equal(check.readings.size, 0);
});

test('the drivers: a speeder at least every few seconds, the speeds over the limit spread over the fines', () => {
  const check = createCheck();
  const kinds = [];
  for (let i = 0; i < 40; i++) { check.t = i * 3; kinds.push(chooseDriver(check, () => 0.9)?.kind || 'normal'); }
  const speeders = kinds.filter((k) => k === 'speeder').length;
  assert.ok(speeders >= 8 && speeders <= 12, `${speeders}`);
  const fines = new Set(RADAR.speeders.map((k) => fineFor(excessOf(k - 1))));
  assert.deepEqual([...fines].sort(), [1, 2, 3, 4]);
  for (const k of RADAR.borderline) assert.equal(fineFor(excessOf(k - 1)), 0, `${k} km/h reads within the tolerance`);
});

test('a clean officer earns gold, a careless one less; the medals calibrated on the bot', () => {
  const scores = [1, 2, 3, 4, 5].map((seed) => playCheck({ seed }).score);
  const sloppy = [1, 2, 3].map((seed) => playCheck({ seed, wrongFines: true }).score);
  const eager = [1, 2, 3].map((seed) => playCheck({ seed, stopAll: true }).score);
  const slow = [1, 2, 3].map((seed) => playCheck({ seed, runSpeed: 3.5, react: 1.5 }).score);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log('radar bot scores', { clean: scores, sloppy, eager, slow });
  const m = RADAR.medals;
  for (const s of scores) assert.equal(medalFor(s, m, true), 'gold', `${s}`);
  assert.ok(mean(slow) >= m.bronze, `${mean(slow)}`);
  assert.ok(mean(sloppy) < m.silver, `${mean(sloppy)}`);
  assert.ok(mean(eager) < mean(scores));
  const check = playCheck({ seed: 1 });
  assert.ok(check.over && check.t >= RADAR.length && check.t <= RADAR.length + RADAR.overtime + 0.1);
  assert.ok(check.counts.rightFines >= 6, `${check.counts.rightFines} fines`);
  assert.equal(check.counts.wrongStops, 0);
});

test('the mission steps: park on the verge, set up the laser on foot, then the check until the time is up', () => {
  const m = RADAR_MISSION, state = m.createState();
  const ctx = (o) => ({ mode: 'car', x: 0, z: 0, speed: 0, dt: 0.5, ...o });
  const [drive, setup, check] = m.objectives;
  assert.equal(drive.check(ctx({ x: RADAR_START.x, z: RADAR_START.z }), state).done, false);
  let v;
  for (let i = 0; i < 4; i++) v = drive.check(ctx({ x: PATROL_BAY.x, z: PATROL_BAY.z }), state);
  assert.ok(v.done);
  assert.equal(setup.check(ctx({ x: LASER_SPOT.x, z: LASER_SPOT.z }), state).done, false, 'in the car');
  for (let i = 0; i < 7; i++) v = setup.check(ctx({ mode: 'person', x: LASER_SPOT.x, z: LASER_SPOT.z }), state);
  assert.ok(v.done);
  for (let i = 0; i < (RADAR.length + 1) / 0.5; i++) m.update(ctx({ mode: 'person', radarStep: 'check' }), state);
  assert.ok(check.check(ctx({}), state).done);
  assert.match(m.summary(state)[0], /^0 readings/);
});

test('every text of the mission has its German', async () => {
  // (the page as tests/i18n.test.mjs stubs it)
  globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document = {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'de-CH' }, configurable: true });
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.window = { dispatchEvent() {} };
  const { t, setLanguage } = await import('../js/i18n.js');
  setLanguage('de');
  const m = RADAR_MISSION, texts = [m.title, m.intro, m.finish];
  const state = m.createState();
  for (const o of m.objectives) {
    texts.push(o.title);
    for (const c of [{ mode: 'car' }, { mode: 'person' }, { mode: 'person', x: LASER_SPOT.x, z: LASER_SPOT.z }]) {
      const v = o.check({ x: 0, z: 0, speed: 0, dt: 0, ...c }, state);
      texts.push(v.text);
      if (v.hint) texts.push(v.hint);
    }
  }
  texts.push('At the car: choose the fine (1-4) or let the driver go (0)', 'Walk to the stopped car', 'The car is pulling over …', 'Time is up',
    'Measure', 'Stop sign', 'Aim', 'Points', 'Stopped', 'Traffic stop', 'Reading', 'limit', 'tolerance', 'No reading for this car', 'Let go', 'no offence', 'Report');
  for (const s of texts) assert.notEqual(t(s), s, `German for: ${s}`);
  // (the texts with numbers come in German straight from the data, by the page's language)
  assert.match(document.documentElement.lang, /^de/);
  assert.match(m.summary(state)[0], /^0 Messungen/);
});
