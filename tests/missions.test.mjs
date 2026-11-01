import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MISSIONS, getMission, DISCHMA_MISSION, REGA_MISSION, LAWINEN_MISSION, TOEFF_MISSION, TOEFF_POLIZEI_MISSION, SPITAL_PAD,
  samplePolyline, polylineLength, markGroomed, doneFraction, nearestUndone, relativeBearing, formatTime, formatDistance,
  simulateShot, inZone, findLoipe, pointOnRun, recordBestTime, readBestTimes, bestTimeKey, BEST_TIMES_KEY, SAMPLE_STEP
} from '../js/missions-data.js';

// (js/missions-data.js is three.js-free: the definitions and the progress logic run on synthetic frames here)

const frame = (over = {}) => ({
  mode: 'snowcat', x: 0, y: 0, z: 0, heading: 0, speed: 0, verticalSpeed: 0, agl: 0, tillerRaised: false, tillerLift: 0,
  segs: { array: new Float32Array(0), count: 0 }, highBeam: false, blueLight: false, night: false, dt: 0.1, t: 0, shooter: null, rega: null, ...over
});
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('every mission is complete: id, title, intro, mode, start and checkable objectives', () => {
  assert.equal(MISSIONS.length, 5);
  const ids = new Set();
  for (const m of MISSIONS) {
    assert.match(m.id, /^[a-z-]+$/);
    assert.ok(!ids.has(m.id), 'ids are unique');
    ids.add(m.id);
    assert.ok(m.title.length > 3 && m.intro.length > 40, `${m.id} has a title and an intro`);
    assert.ok(['snowcat', 'helicopter', 'person', 'car'].includes(m.mode));
    const s = m.start;
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.heading), `${m.id} has a start`);
    assert.ok(m.objectives.length >= 2);
    const state = m.createState();
    for (const o of m.objectives) {
      assert.ok(o.id && o.title);
      const view = o.check(frame({ mode: m.mode }), state);
      assert.equal(typeof view.done, 'boolean');
      assert.equal(typeof view.text, 'string');
      if (view.target) assert.ok(Number.isFinite(view.target.x) && Number.isFinite(view.target.z));
    }
    for (const p of m.props) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && p.type, `${m.id} prop ${p.id}`);
    assert.equal(getMission(m.id), m);
  }
  assert.equal(getMission('nope'), null);
});

test('a polyline is sampled every 10 m, its end included', () => {
  const pts = [0, 0, 100, 0, 100, 36];
  assert.equal(polylineLength(pts), 136);
  const s = samplePolyline(pts, SAMPLE_STEP);
  assert.equal(s.length, 15); // 0, 10, ... 130 and the end at 136
  assert.deepEqual([s[0].x, s[0].z], [0, 0]);
  assert.deepEqual([Math.round(s[10].x), Math.round(s[10].z)], [100, 0]);
  assert.deepEqual([s.at(-1).x, s.at(-1).z, s.at(-1).s], [100, 36, 136]);
  assert.deepEqual(samplePolyline([1, 2]), []);
});

test('groom segments mark the samples within 2.5 m, and only the new segments are looked at', () => {
  const samples = samplePolyline([0, 0, 100, 0]);
  // a pass 1 m beside the track from x = 0 to 45, in 0.5 m steps (the groom map's STEP)
  const segs = [];
  for (let x = 0; x < 45; x += 0.5) segs.push(x, 1, x + 0.5, 1, 12, 1);
  const array = new Float32Array(segs), count = segs.length / 6;
  assert.equal(markGroomed(samples, array, 0, count), 5); // x = 0, 10, 20, 30, 40
  assert.equal(markGroomed(samples, array, 0, count), 0, 'nothing new');
  assert.ok(Math.abs(doneFraction(samples) - 5 / 11) < 1e-9);
  // a pass 3 m off the track grooms nothing
  const far = new Float32Array([50, 3, 60, 3, 12, 1]);
  assert.equal(markGroomed(samples, far, 0, 1), 0);
  assert.deepEqual([nearestUndone(samples, 44, 0).x, nearestUndone(samples, 1000, 0).x], [50, 100]);
});

test('the Dischma mission reads the groom map frame by frame and finishes at 90 %', () => {
  const m = DISCHMA_MISSION;
  const state = m.createState();
  assert.ok(state.loipe, 'the Dischma Loipe exists in the geodata');
  assert.match(state.loipe.name, /Dischma/);
  assert.ok(state.length > 1500 && state.length < 3000, `a 2-3 km stretch, not ${state.length}`);
  assert.ok(state.samples.length > 150);
  assert.ok(m.start.x > 700, 'starts in the Dischma valley');
  // nothing groomed yet, the tiller up: the hint
  let view = m.objectives[0].check(frame({ tillerRaised: true }), state);
  assert.equal(view.done, false);
  assert.equal(view.hint, 'Fräse absenken [F]');
  assert.ok(view.target && Math.hypot(view.target.x - state.samples[0].x, view.target.z - state.samples[0].z) < 1e-9);
  // the groomer drives the whole track: one segment per sample pair, exactly on the line
  const pts = state.loipe.pts;
  const segs = [];
  for (let i = 2; i < pts.length; i += 2) segs.push(pts[i - 2], pts[i - 1], pts[i], pts[i + 1], 12, 1);
  const array = new Float32Array(segs);
  // the first third only
  const third = Math.floor(segs.length / 6 / 3);
  m.update(frame({ segs: { array, count: third } }), state);
  view = m.objectives[0].check(frame(), state);
  assert.equal(view.done, true);
  view = m.objectives[1].check(frame(), state);
  assert.equal(view.done, false);
  assert.match(view.text, /^Loipe \d+ % präpariert/);
  assert.ok(view.progress > 0.2 && view.progress < 0.6);
  assert.ok(view.target, 'the arrow points to the next unprepared section');
  // the rest
  m.update(frame({ segs: { array, count: segs.length / 6 } }), state);
  view = m.objectives[1].check(frame(), state);
  assert.equal(view.done, true);
  assert.equal(view.progress, 1);
  assert.equal(view.target, null);
});

test('the Rega rescue: approach, five steady seconds low over the patient, three seconds down on the pad', () => {
  const m = REGA_MISSION;
  const state = m.createState();
  const p = state.patient;
  assert.ok(p.x > 400 && p.x < 1100 && p.z > 2000 && p.z < 2700, 'the patient lies on the Jakobshorn Standard');
  assert.equal(m.props.find((q) => q.type === 'patient').hideAfter, 'pickup');
  assert.deepEqual([m.start.x, m.start.z, m.start.onGround], [SPITAL_PAD.x, SPITAL_PAD.z, true]);
  let view = m.objectives[0].check(frame({ mode: 'helicopter', x: p.x - 500, z: p.z, agl: 80 }), state);
  assert.equal(view.done, false);
  assert.match(view.text, /500 m/);
  assert.equal(m.objectives[0].check(frame({ x: p.x - 20, z: p.z, agl: 30 }), state).done, true);
  // the night variant wants the searchlight
  assert.equal(m.objectives[0].check(frame({ x: p.x, z: p.z, agl: 30, night: true }), state).hint, 'Suchscheinwerfer einschalten [L]');
  assert.equal(m.objectives[0].check(frame({ x: p.x, z: p.z, agl: 30, night: true, highBeam: true }), state).hint, null);
  // hovering: 2 m over the snow, 3 m off, 0.5 s steps
  for (let i = 0; i < 9; i++) view = m.objectives[1].check(frame({ x: p.x + 3, z: p.z, agl: 2, dt: 0.5 }), state);
  assert.equal(view.done, false);
  assert.match(view.text, /Bergung läuft/);
  assert.ok(view.progress > 0.85);
  // drifting up resets the count
  view = m.objectives[1].check(frame({ x: p.x + 3, z: p.z, agl: 6, dt: 0.5 }), state);
  assert.equal(state.hover, 0);
  for (let i = 0; i < 11; i++) view = m.objectives[1].check(frame({ x: p.x + 3, z: p.z, agl: 2, dt: 0.5 }), state);
  assert.equal(view.done, true);
  // landing on the pad
  const ret = m.objectives[2];
  view = ret.check(frame({ x: SPITAL_PAD.x + 2, z: SPITAL_PAD.z, agl: 0.3, dt: 1 }), state);
  assert.equal(view.done, false);
  view = ret.check(frame({ x: SPITAL_PAD.x + 2, z: SPITAL_PAD.z, agl: 0.3, dt: 1 }), state);
  view = ret.check(frame({ x: SPITAL_PAD.x + 2, z: SPITAL_PAD.z, agl: 0.3, dt: 1.1 }), state);
  assert.equal(view.done, true);
  assert.equal(view.target.style, 'pad');
});

test('the avalanche mission: four zones in turn, a miss costs a shell, no shells left fails it', () => {
  const m = LAWINEN_MISSION;
  assert.equal(m.zones.length, 4);
  assert.deepEqual(m.features, ['shooter']);
  for (const z of m.zones) assert.ok(z.r >= 15 && z.r <= 25);
  const state = m.createState();
  assert.equal(state.ammo, 12);
  let view = m.objectives[0].check(frame({ mode: 'person' }), state);
  assert.equal(view.done, false);
  assert.equal(view.target.style, 'hazard');
  assert.equal(view.fail, null);
  // the runtime reports the shooter through the frame
  m.update(frame({ shooter: { shots: 3, hits: 1, misses: 2, ammo: 9, inFlight: false } }), state);
  assert.equal(m.objectives[0].check(frame(), state).done, true);
  view = m.objectives[1].check(frame(), state);
  assert.equal(view.done, false);
  assert.match(view.text, /9 Schuss übrig · 2 daneben/);
  m.update(frame({ shooter: { shots: 12, hits: 2, misses: 10, ammo: 0, inFlight: true } }), state);
  assert.equal(m.objectives[2].check(frame(), state).fail, null, 'the last shell is still flying');
  m.update(frame({ shooter: { shots: 12, hits: 2, misses: 10, ammo: 0, inFlight: false } }), state);
  assert.equal(m.objectives[2].check(frame(), state).fail, 'Munition verschossen');
  assert.deepEqual(m.summary(state), ['12 Schuss · 2 Treffer · 10 daneben']);
});

test('a shell falls on the ground where gravity takes it', () => {
  const flat = () => 0;
  const hit = simulateShot({ x: 0, y: 0, z: 0 }, { x: 0, y: 50, z: 50 }, flat, { dt: 0.01 });
  // range of a 45° shot at 70.7 m/s: v² sin(2a) / g = 5000 / 9.81 = 509.7 m, flight 2 v_y / g = 10.19 s
  assert.ok(Math.abs(hit.z - 509.7) < 3, `range ${hit.z}`);
  assert.ok(Math.abs(hit.t - 10.19) < 0.05);
  assert.equal(hit.x, 0);
  // a slope rising 1:1 ahead (20 m below the muzzle at the start) stops it after 4.9 t² = 20: t = 2.02 s, z = 101 m
  const slope = (x, z) => z - 20;
  const onSlope = simulateShot({ x: 0, y: 0, z: 0 }, { x: 0, y: 50, z: 50 }, slope, { dt: 0.01 });
  assert.ok(Math.abs(onSlope.z - 101) < 2, `on the slope at ${onSlope.z}`);
  assert.ok(Math.abs(onSlope.y - (onSlope.z - 20)) < 0.5);
  assert.equal(simulateShot({ x: 0, y: 1000, z: 0 }, { x: 0, y: 500, z: 0 }, flat, { maxT: 1 }), null);
  assert.equal(inZone({ x: 10, z: 10, r: 5 }, 13, 13), true);
  assert.equal(inZone({ x: 10, z: 10, r: 5 }, 14, 14), false);
});

test('the motorbike accident: land in the meadow, eight seconds of care, back to the pad', () => {
  const m = TOEFF_MISSION;
  const state = m.createState();
  const site = m.objectives[0].check(frame({ mode: 'helicopter', x: 0, z: 0, agl: 50 }), state).target;
  assert.ok(site.x > 4800 && site.x < 5200, 'on the Flüelapassstrasse above the Tschuggen');
  assert.ok(m.props.some((p) => p.type === 'motorbike') && m.props.some((p) => p.type === 'policeCar' && p.block));
  const lz = m.objectives[1].check(frame({ x: 0, z: 0 }), state).target;
  assert.ok(lz.r === 12 && lz.style === 'pad');
  assert.ok(Math.hypot(lz.x - site.x, lz.z - site.z) > 15 && Math.hypot(lz.x - site.x, lz.z - site.z) < 90, 'the landing zone is beside the road');
  let view;
  for (let i = 0; i < 3; i++) view = m.objectives[1].check(frame({ x: lz.x + 3, z: lz.z - 2, agl: 0.4, dt: 0.8 }), state);
  assert.equal(view.done, true);
  for (let i = 0; i < 7; i++) view = m.objectives[2].check(frame({ x: lz.x + 3, z: lz.z - 2, agl: 0.4, dt: 1 }), state);
  assert.equal(view.done, false);
  assert.match(view.text, /Patient wird versorgt … 1 s/);
  view = m.objectives[2].check(frame({ x: lz.x + 3, z: lz.z - 2, agl: 5, dt: 1 }), state);
  assert.equal(state.treat, 0, 'lifting off resets the care');
  for (let i = 0; i < 9; i++) view = m.objectives[2].check(frame({ x: lz.x + 3, z: lz.z - 2, agl: 0.4, dt: 1 }), state);
  assert.equal(view.done, true);
  assert.equal(m.objectives[3].id, 'return');
});

test('the Kapo variant: blue light, the car across the road, cones on foot, the Rega by script', () => {
  const m = TOEFF_POLIZEI_MISSION;
  assert.equal(m.mode, 'car');
  assert.deepEqual(m.features, ['policeCar', 'regaScript']);
  assert.equal(m.start.teleport, 'promenade');
  const state = m.createState();
  let view = m.objectives[0].check(frame({ mode: 'car', x: 0, z: 0 }), state);
  assert.equal(view.hint, 'Blaulicht einschalten [K]');
  assert.equal(m.objectives[0].check(frame({ mode: 'car', x: 0, z: 0, blueLight: true }), state).hint, null);
  const zone = m.objectives[1].check(frame({ mode: 'car' }), state).target;
  assert.equal(zone.style, 'hazard');
  for (let i = 0; i < 4; i++) view = m.objectives[1].check(frame({ mode: 'car', x: zone.x, z: zone.z, blueLight: true, dt: 1 }), state);
  assert.equal(view.done, true);
  // the cones want the pedestrian
  const cone = m.objectives[2];
  assert.deepEqual(cone.allowModes, ['car', 'person']);
  view = cone.check(frame({ mode: 'car', x: 0, z: 0 }), state);
  assert.equal(view.hint, 'Zu Fuss [1]');
  const c = view.target;
  for (let i = 0; i < 3; i++) view = cone.check(frame({ mode: 'person', x: c.x + 1, z: c.z, dt: 1 }), state);
  assert.equal(view.done, true);
  assert.ok(m.props.some((p) => p.type === 'cone' && p.showAfter === 'cone1'));
  // the Rega phase comes from the runtime
  const rega = m.objectives.at(-1);
  assert.equal(rega.check(frame({ mode: 'person' }), state).done, false);
  m.update(frame({ rega: { phase: 'gone' } }), state);
  assert.equal(rega.check(frame({ mode: 'person' }), state).done, true);
});

test('time and distance formats, the bearing for the arrow', () => {
  assert.equal(formatTime(0), '00:00.0');
  assert.equal(formatTime(252340), '04:12.3');
  assert.equal(formatTime(3599999), '59:59.9');
  assert.equal(formatDistance(42.4), '42 m');
  assert.equal(formatDistance(1234), '1.2 km');
  // heading 0 looks along +z (south), heading grows turning left (the controllers' A key): a target at +x (east) is
  // a quarter turn to the left, positive
  assert.ok(Math.abs(relativeBearing(0, 0, 0, 10, 0) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(relativeBearing(0, 0, 0, 0, 10)) < 1e-9);
  assert.ok(Math.abs(relativeBearing(0, 0, Math.PI / 2, 10, 0)) < 1e-9, 'facing +x, the target ahead');
  assert.ok(Math.abs(Math.abs(relativeBearing(0, 0, 0, 0, -10)) - Math.PI) < 1e-9);
});

test('best times are kept per mission and variant, and only improve', () => {
  const storage = memoryStorage();
  assert.deepEqual(readBestTimes(storage), {});
  const key = bestTimeKey('rega-rettung', 'night');
  assert.equal(key, 'rega-rettung@night');
  assert.equal(bestTimeKey('rega-rettung'), 'rega-rettung');
  let r = recordBestTime(storage, key, 250000);
  assert.deepEqual(r, { best: 250000, previous: null, improved: true });
  r = recordBestTime(storage, key, 260000);
  assert.deepEqual(r, { best: 250000, previous: 250000, improved: false });
  r = recordBestTime(storage, key, 240000);
  assert.deepEqual(r, { best: 240000, previous: 250000, improved: true });
  assert.deepEqual(JSON.parse(storage.getItem(BEST_TIMES_KEY)), { [key]: 240000 });
  assert.deepEqual(readBestTimes(null), {});
});

test('the geodata lookups find the Loipe and a point on a run', () => {
  const l = findLoipe({ ids: ['w1034080622'] });
  assert.equal(l.id, 'w1034080622');
  assert.ok(findLoipe({ ids: ['nope'], namePattern: /Dischma/, xMin: 700 }).length > 500);
  assert.equal(findLoipe({ ids: ['nope'], namePattern: /no such loipe/ }), null);
  const a = pointOnRun('w29262638', 0), b = pointOnRun('w29262638', 1), mid = pointOnRun('w29262638', 0.5);
  assert.ok(a && b && mid);
  assert.ok(Math.hypot(mid.x - a.x, mid.z - a.z) > 100 && Math.hypot(mid.x - b.x, mid.z - b.z) > 100);
  assert.equal(pointOnRun('nope', 0.5), null);
});
