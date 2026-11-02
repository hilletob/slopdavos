import assert from 'node:assert/strict';
import test from 'node:test';
import { MISSIONS, getMission, BEST_TIMES_KEY } from '../js/missions-data.js';
import { MissionManager, missionStartInReach, setMissionStartInReach } from '../js/missions-manager.js';
import {
  PROGRESS_KEY, PROGRESS_VERSION, MEDAL_POINTS, FIRST_CLEAR_POINTS, medalFor, medalRank, deriveMedals, missionMedals,
  entryPoints, totalPoints, maxPoints, emptyProgress, readProgress, saveProgress, recordCompletion, createProgressStore,
  progressFromBestTimes, missionPin, canStartIn, missionInReach, pinsNear, START_RADIUS
} from '../js/missions-progress.js';

// (js/missions-progress.js is three.js-free: medals, points and the pins' reach run on plain objects here)

const memoryStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
};
const MIN = 60000;
const def = { id: 'test', mode: 'car', medals: { gold: 3 * MIN, silver: 4 * MIN, bronze: 6 * MIN } };

test('every mission has medal limits, gold faster than silver faster than bronze, gold at its bonus time', () => {
  for (const m of MISSIONS) {
    const l = m.medals;
    assert.ok(l, `${m.id} has medals`);
    if (m.scoreMode) assert.ok(l.gold > l.silver && l.silver > l.bronze && l.bronze > 0, `${m.id}: gold > silver > bronze points`);
    else {
      assert.ok(l.gold < l.silver && l.silver < l.bronze, `${m.id}: gold < silver < bronze`);
      assert.equal(l.gold, m.bonusMs, `${m.id}: gold is the bonus time`);
    }
    assert.match(m.colour, /^#[0-9a-f]{6}$/i);
    assert.equal(typeof m.icon, 'string', `${m.id} has an icon`);
  }
});

test('medalFor: the limits are inclusive, slower than bronze earns none', () => {
  assert.equal(medalFor(2 * MIN, def.medals), 'gold');
  assert.equal(medalFor(3 * MIN, def.medals), 'gold');
  assert.equal(medalFor(3 * MIN + 1, def.medals), 'silver');
  assert.equal(medalFor(5 * MIN, def.medals), 'bronze');
  assert.equal(medalFor(6 * MIN + 1, def.medals), null);
  assert.equal(medalFor(NaN, def.medals), null);
  assert.equal(medalFor(MIN, null), null);
  assert.deepEqual([null, 'bronze', 'silver', 'gold'].map(medalRank), [0, 1, 2, 3]);
});

test('deriveMedals: gold at the bonus, silver and bronze slower, rounded to 30 s', () => {
  assert.deepEqual(deriveMedals(3 * MIN), { gold: 3 * MIN, silver: 4 * MIN, bronze: 6 * MIN });
  assert.deepEqual(missionMedals({ bonusMs: 2 * MIN }), deriveMedals(2 * MIN));
  assert.equal(missionMedals({}), null);
});

test('points: the first completion and the best medal, nothing for a worse or equal run (no farming)', () => {
  let p = emptyProgress();
  // first run, slower than bronze: the completion bonus only
  let r = recordCompletion(p, def, 7 * MIN);
  assert.equal(r.award.points, FIRST_CLEAR_POINTS);
  assert.equal(r.award.medal, null);
  assert.ok(r.award.firstClear);
  assert.deepEqual(p, emptyProgress(), 'the old progress is left as it was');
  p = r.progress;
  // bronze: its points on top
  r = recordCompletion(p, def, 5 * MIN);
  assert.equal(r.award.points, MEDAL_POINTS.bronze);
  assert.ok(r.award.medalUp && !r.award.firstClear);
  p = r.progress;
  // bronze again: nothing
  r = recordCompletion(p, def, 5.5 * MIN);
  assert.equal(r.award.points, 0);
  assert.equal(r.award.bestMedal, 'bronze');
  p = r.progress;
  // gold: the difference to bronze
  r = recordCompletion(p, def, 2.5 * MIN);
  assert.equal(r.award.points, MEDAL_POINTS.gold - MEDAL_POINTS.bronze);
  p = r.progress;
  // a slow run after gold: nothing, the gold stays, the best time stays
  r = recordCompletion(p, def, 10 * MIN);
  assert.equal(r.award.points, 0);
  assert.equal(r.progress.missions.test.medal, 'gold');
  assert.equal(r.progress.missions.test.bestMs, 2.5 * MIN);
  assert.equal(r.progress.missions.test.runs, 5);
  assert.equal(totalPoints(r.progress), FIRST_CLEAR_POINTS + MEDAL_POINTS.gold);
});

test('gold straight away earns the completion and the gold at once', () => {
  const { award, progress } = recordCompletion(emptyProgress(), def, MIN);
  assert.equal(award.points, FIRST_CLEAR_POINTS + MEDAL_POINTS.gold);
  assert.equal(entryPoints(progress.missions.test), award.points);
  assert.equal(maxPoints(MISSIONS), MISSIONS.length * (FIRST_CLEAR_POINTS + MEDAL_POINTS.gold));
});

test('storage: versioned, read back, a broken or older entry starts afresh from the best times', () => {
  const storage = memoryStorage();
  const { progress } = recordCompletion(emptyProgress(), def, 3.5 * MIN, 1234);
  assert.ok(saveProgress(storage, progress));
  const raw = JSON.parse(storage.getItem(PROGRESS_KEY));
  assert.equal(raw.v, PROGRESS_VERSION);
  assert.deepEqual(readProgress(storage), progress);
  // broken JSON, a wrong version: empty, or seeded from the best times
  assert.deepEqual(readProgress(memoryStorage({ [PROGRESS_KEY]: '{oops' })), emptyProgress());
  const old = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ v: 0, missions: { x: {} } }), [BEST_TIMES_KEY]: JSON.stringify({ 'rega-rettung@night': 200000, 'rega-rettung': 170000 }) });
  const seeded = readProgress(old, MISSIONS);
  assert.equal(seeded.missions['rega-rettung'].medal, 'gold', 'the faster of day and night');
  assert.equal(seeded.missions['rega-rettung'].bestMs, 170000);
  assert.equal(Object.keys(seeded.missions).length, 1);
  // junk in an entry is cleaned
  const junk = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ v: 1, missions: { a: { medal: 'platinum', bestMs: 'x' }, b: null } }) });
  assert.deepEqual(readProgress(junk).missions, { a: { medal: null, bestMs: null, runs: 1, at: 0 } });
  // no storage at all
  assert.deepEqual(readProgress(null), emptyProgress());
  assert.equal(saveProgress({ setItem() { throw new Error('quota'); } }, progress), false);
});

test('progressFromBestTimes: medals by the stored times', () => {
  const p = progressFromBestTimes({ 'lawinen-sprengen': 4 * MIN, 'dischma-loipe': 20 * MIN }, MISSIONS);
  assert.equal(p.missions['lawinen-sprengen'].medal, 'bronze');
  assert.equal(p.missions['dischma-loipe'].medal, null);
  assert.equal(totalPoints(p), 2 * FIRST_CLEAR_POINTS + MEDAL_POINTS.bronze);
});

test('the store records, saves and tells its listeners', () => {
  const storage = memoryStorage();
  const store = createProgressStore(storage, MISSIONS);
  const heard = [];
  store.subscribe((progress, award, d) => heard.push([d.id, award.points]));
  const lawinen = getMission('lawinen-sprengen');
  assert.equal(store.points, 0);
  const award = store.record(lawinen, 100000);
  assert.equal(award.medal, 'gold');
  assert.equal(store.points, FIRST_CLEAR_POINTS + MEDAL_POINTS.gold);
  assert.equal(store.medal('lawinen-sprengen'), 'gold');
  assert.deepEqual(heard, [['lawinen-sprengen', 750]]);
  assert.equal(createProgressStore(storage, MISSIONS).points, 750, 'kept across a reload');
});

test('pins: the start, or `pin` where the marker stands elsewhere (the Rega missions by the Spital, apart)', () => {
  const dischma = getMission('dischma-loipe');
  assert.deepEqual(missionPin(dischma), { x: dischma.start.x, z: dischma.start.z });
  const rega = missionPin(getMission('rega-rettung')), toeff = missionPin(getMission('toeff-unfall'));
  assert.ok(Math.hypot(rega.x - toeff.x, rega.z - toeff.z) > START_RADIUS * 2, 'the two Rega pins do not overlap');
  assert.ok(Math.hypot(rega.x + 1139, rega.z - 924.5) < 60, 'by the Spital pad');
  const police = getMission('toeff-unfall-polizei');
  assert.deepEqual(missionPin(police, { promenade: { x: -580, z: 70 } }), { x: -580, z: 70 }, 'a teleport start resolves');
  assert.deepEqual(missionPin(police), { x: -600, z: 60 });
});

test('reach: on foot or in the mission vehicle, inside the circle, the nearest wins, not from high above', () => {
  const heli = { id: 'h', mode: 'helicopter' }, cat = { id: 'c', mode: 'snowcat' };
  const pins = [{ def: heli, x: 0, z: 0, y: 10 }, { def: cat, x: 6, z: 0, y: 10 }];
  assert.ok(canStartIn(heli, 'person') && canStartIn(heli, 'helicopter') && !canStartIn(heli, 'car'));
  assert.equal(missionInReach(pins, { x: 1, z: 0, y: 10, mode: 'person' }).def.id, 'h');
  assert.equal(missionInReach(pins, { x: 5, z: 0, y: 10, mode: 'person' }).def.id, 'c');
  assert.equal(missionInReach(pins, { x: 1, z: 0, y: 10, mode: 'snowcat' }).def.id, 'c', 'only the snowcat mission takes the snowcat');
  assert.equal(missionInReach(pins, { x: 1, z: 0, y: 10, mode: 'car' }), null);
  assert.equal(missionInReach(pins, { x: 30, z: 0, y: 10, mode: 'person' }), null);
  assert.equal(missionInReach(pins, { x: 0, z: 0, y: 80, mode: 'helicopter' }), null, 'flying over');
  assert.deepEqual(pinsNear(pins, 100, 0, 100).map((n) => n.pin.def.id), ['c', 'h']);
  assert.equal(pinsNear(pins, 1000, 0, 100).length, 0);
});

test('the manager calls onFrame every frame, a mission running or not; the start in reach is shared', () => {
  const frames = [];
  const manager = new MissionManager({ getMission, createRun: () => ({ update() {}, dispose() {} }), onFrame: (active, dt) => frames.push([active, dt]) });
  manager.update(0.1);
  manager.start('rega-rettung');
  manager.update(0.2);
  manager.stop();
  manager.update(0.3);
  assert.deepEqual(frames, [[false, 0.1], [true, 0.2], [false, 0.3]]);
  assert.equal(missionStartInReach(), null);
  setMissionStartInReach('rega-rettung');
  assert.equal(missionStartInReach(), 'rega-rettung');
  setMissionStartInReach(null);
  assert.equal(missionStartInReach(), null);
});
