import assert from 'node:assert/strict';
import test from 'node:test';
import { HIKE, HIKE_MISSIONS, SCHWARZHORN_MISSION, JOERISEEN_MISSION, DAWN, createHike, stepHike, hikeScore, hikeProgress, locate, lineLengths, dawnMinute, dawnStart, sunriseMinute } from '../js/missions-data-hike.js';
import { MISSIONS } from '../js/missions-data.js';
import { missionOpen } from '../js/mission-windows.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

test('the hikes are registered and their lines lie inside the map', () => {
  for (const m of HIKE_MISSIONS) {
    assert.ok(MISSIONS.includes(m));
    const h = m.createState().hike;
    assert.ok(h.total > 2000, `${m.id}: ${h.total} m`);
    for (const [x, z] of h.route) assert.ok(x > WORLD_BOUNDS[0] && x < WORLD_BOUNDS[2] && z > WORLD_BOUNDS[1] && z < WORLD_BOUNDS[3], `${m.id} at ${x},${z}`);
    assert.ok(m.medals.gold > m.medals.silver && m.medals.silver > m.medals.bronze);
  }
  // the summit at E 2791281 N 1179113, the Jöriseen's shore at E 2793204 N 1184092
  const end = (m) => m.createState().hike.route.at(-1);
  assert.ok(Math.hypot(end(SCHWARZHORN_MISSION)[0] - 8781, end(SCHWARZHORN_MISSION)[1] - 6387) < 15);
  assert.ok(Math.hypot(end(JOERISEEN_MISSION)[0] - 10704, end(JOERISEEN_MISSION)[1] - 1408) < 15);
});

test('walking the line advances the hike, leaving it costs time and does not', () => {
  const h = createHike([[0, 0], [100, 0], [200, 0]]);
  stepHike(h, 50, 2, 10);
  assert.equal(h.furthest, 50);
  assert.equal(h.offTime, 0);
  stepHike(h, 120, 40, 5);
  assert.equal(h.offTime, 5);
  assert.equal(h.furthest, 50, 'off the path gets you no further');
  assert.equal(hikeScore(h), HIKE.full - 15 - 5);
  h.arrivedAt = 15;
  stepHike(h, 200, 0, 100);
  assert.equal(h.time, 15, 'the time stops on arrival');
  assert.deepEqual(locate(h.route, lineLengths(h.route), 150, 3, 150), { along: 150, off: 3 });
});

test('the dawn moves on with the climb or with the time, and the sunrise is at gold time', () => {
  const h = createHike([[0, 0], [1000, 0]]);
  assert.equal(dawnMinute(h), dawnStart());
  h.furthest = 500;
  const climbed = dawnMinute(h);
  assert.ok(climbed > dawnStart() && climbed < sunriseMinute());
  h.furthest = 1000;
  assert.ok(dawnMinute(h) < sunriseMinute(), 'the climb alone leaves the sunrise for the summit');
  h.time = DAWN.climb;
  assert.equal(dawnMinute(h), sunriseMinute());
  assert.equal(SCHWARZHORN_MISSION.medals.gold, HIKE.full - DAWN.climb);
});

test('the Schwarzhorn opens before dawn in summer, the Jöriseen by day', () => {
  const summerDay = (() => { for (let d = 0; d < 40; d++) if (missionOpen(JOERISEEN_MISSION, d * 1440 + 720)) return d; return -1; })();
  assert.ok(summerDay >= 0);
  assert.equal(missionOpen(SCHWARZHORN_MISSION, summerDay * 1440 + 4 * 60), true);
  assert.equal(missionOpen(SCHWARZHORN_MISSION, summerDay * 1440 + 12 * 60), false);
  assert.equal(missionOpen(JOERISEEN_MISSION, summerDay * 1440 + 60), false);
});
