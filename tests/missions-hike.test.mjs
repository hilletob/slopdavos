import assert from 'node:assert/strict';
import test from 'node:test';
import { HIKE, HIKE_MISSIONS, SCHWARZHORN_MISSION, JOERISEEN_MISSION, DAWN, createHike, stepHike, hikeScore, hikeProgress, locate, lineLengths, dawnMinute, dawnStart, sunriseMinute, LAMP, lampVertexCount, lampStrength, lampPool, WILD, createWildlife, resetWildlife, stepWildlife } from '../js/missions-data-hike.js';
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

const pool = (height) => {
  const pos = new Float32Array(lampVertexCount() * 3), lit = new Float32Array(lampVertexCount());
  lampPool(0, 1.7, 0, 0, height, pos, lit);
  return { pos, lit, at: (ray, ring) => lit[ray * LAMP.rings + ring] };
};
test('the headlamp lights the ground ahead, fades towards its edges and is gone by the sunrise', () => {
  const { pos, at } = pool(() => 0), mid = (LAMP.rays - 1) / 2;
  assert.ok(pos[3 * (mid * LAMP.rings + 5) + 2] > 0, 'ahead along the heading');
  assert.ok(at(mid, 4) > 0.1);
  assert.ok(at(mid, 4) > at(0, 4), 'brighter in the middle of the beam');
  assert.ok(at(mid, 4) > at(mid, LAMP.rings - 3), 'brighter close by');
  assert.equal(lampStrength(dawnStart()), 1);
  assert.equal(lampStrength(sunriseMinute()), 0);
});
test('a rise throws the ground behind it into shadow, and a slope facing the lamp takes more light', () => {
  const mid = (LAMP.rays - 1) / 2;
  const ridge = pool((x, z) => (z > 8 && z < 10 ? 6 : 0));
  assert.ok(ridge.at(mid, LAMP.rings - 4) < 0.005, 'behind the ridge');
  const flat = pool(() => 0), climb = pool((x, z) => Math.max(0, z - 5) * 0.6); // (a slope ahead, not one through the walker's feet)
  assert.ok(climb.at(mid, 6) > flat.at(mid, 6) * 1.2, `${climb.at(mid, 6)} on the slope, ${flat.at(mid, 6)} on the flat`);
});

const herdOf = (bands) => createWildlife([[0, 0], [1000, 0]], bands);
test('both hikes have chamois and ibex, off the line', () => {
  for (const m of HIKE_MISSIONS) {
    const route = m.createState().hike.route, { animals } = createWildlife(route, m.wildlife);
    assert.deepEqual([...new Set(animals.map((a) => a.kind))].sort(), ['chamois', 'ibex'], m.id);
    for (const a of animals) assert.ok(locate(route, lineLengths(route), a.x, a.z, 0, 1e6).off > 6, `${m.id}: on the path at ${a.x},${a.z}`);
  }
});
test('an animal stays near home until you come too close, the chamois sooner than the ibex', () => {
  const w = herdOf([{ kind: 'chamois', at: 0.5, side: 0, count: 1 }, { kind: 'ibex', at: 0.5, side: 0, count: 1 }]);
  const [chamois, ibex] = w.animals, ax = chamois.x, az = chamois.z;
  for (let i = 0; i < 2000; i++) stepWildlife(w, 0.1, 5000, 5000);
  assert.equal(chamois.x, ax, 'too far from the walker to be simulated');
  assert.equal(chamois.z, az);
  for (let i = 0; i < 1200; i++) stepWildlife(w, 0.1, chamois.x + 300, chamois.z);
  assert.ok(Math.hypot(chamois.x - chamois.hx, chamois.z - chamois.hz) <= WILD.stray * 1.5);
  resetWildlife(w);
  ibex.x = chamois.x; ibex.z = chamois.z;
  const px = chamois.x + 25, pz = chamois.z;
  stepWildlife(w, 0.05, px, pz);
  assert.equal(chamois.state, 'flee');
  assert.notEqual(ibex.state, 'flee', 'the ibex lets you nearer');
  const d0 = Math.hypot(chamois.x - px, chamois.z - pz);
  for (let i = 0; i < 40; i++) stepWildlife(w, 0.05, px, pz);
  assert.ok(Math.hypot(chamois.x - px, chamois.z - pz) > d0 + 8, 'it is off');
});
test('no animal goes into the water', () => {
  const w = herdOf([{ kind: 'chamois', at: 0.5, side: 0, count: 6 }]), wet = (x) => x > 505;
  for (const a of w.animals) a.x = Math.min(a.x, 504);
  for (let i = 0; i < 3000; i++) stepWildlife(w, 0.05, 480 + (i % 200) / 10, 0, wet);
  for (const a of w.animals) assert.ok(a.x <= 505.01, `${a.x}`);
});
