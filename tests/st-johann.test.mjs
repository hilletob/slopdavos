import test from 'node:test';
import assert from 'node:assert/strict';
import { ST_JOHANN as T, spireRing, towerCorners, towerSides } from '../js/st-johann-data.js';
import { onWall, pointInRing } from '../js/spital-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

test('the tower of St. Johann: a square shaft inside the church\'s footprint, its sides facing out', () => {
  const corners = towerCorners();
  const osm = DAVOS_DATA.buildings.find((b) => b.id === T.osm);
  const ring = []; for (let i = 0; i < osm.ring.length; i += 2) ring.push([osm.ring[i], osm.ring[i + 1]]);
  assert.ok(pointInRing(ring, ...T.centre), 'the tower stands in the church');
  for (const F of towerSides()) {
    assert.ok(Math.abs(F.len - T.half * 2) < 0.01);
    assert.ok(!pointInRing(corners, ...onWall(F, F.len / 2, 0.3)), 'a step out of a side leaves the shaft');
  }
  assert.ok(Math.abs(Math.hypot(...T.along) - 1) < 0.002);
});

test('the heights: the dial under the eaves, the gables over them, the spire from inside the roof to its tip', () => {
  assert.ok(T.dial.y + T.dial.r < T.eaves - 0.5 && T.dial.r < T.half);
  assert.ok(T.slit.y + T.slit.h < T.dial.y - T.dial.r);
  assert.ok(T.gable > T.eaves + 5);
  // the openings fit in the gable: at their top the gable is still wider than they are
  const widthAt = (y) => T.half * 2 * (T.gable - y) / (T.gable - T.eaves);
  assert.ok(T.openings.y > T.eaves && widthAt(T.openings.y + T.openings.h) > T.openings.w * 0.9, `${widthAt(T.openings.y + T.openings.h).toFixed(2)} m of gable at their top`);
  assert.ok(T.spire.from < T.gable && T.spire.radius < T.half && T.spire.tip > T.gable + 25);
  assert.ok(T.ball.y > T.spire.tip && T.ball.rod > T.ball.y + T.ball.r);
});

test('the spire turns an eighth of a turn and narrows to its tip', () => {
  const first = spireRing(0), last = spireRing(T.spire.rings);
  assert.equal(first.y, T.spire.from);
  assert.ok(Math.abs(last.y - T.spire.tip) < 1e-9 && last.r < 1e-9);
  assert.ok(Math.abs(last.turn - Math.PI / 4) < 1e-9);
  for (let k = 1; k <= T.spire.rings; k++) {
    const a = spireRing(k - 1), b = spireRing(k);
    assert.ok(b.y > a.y && b.r < a.r && b.turn > a.turn);
  }
});

test('every vertex of the tower is finite; the shingles face out and up', async () => {
  const doc = globalThis.document;
  const ctx = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? (t[k] ??= () => {}) : undefined), set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
  try {
    const { buildStJohann } = await import('../js/st-johann.js');
    const { buildStJohann: _b, handAngles } = await import('../js/st-johann.js');
    const { group, colliders, setTime } = buildStJohann({ add() {} });
    // the dials' hands: clockwise from twelve; at three the hour hand a quarter round, the minute hand at twelve
    const close = (a, b) => Math.abs(a - b) < 1e-9;
    assert.ok(close(handAngles(180)[0], Math.PI / 2) && close(handAngles(180)[1], 0));
    assert.ok(close(handAngles(15 * 60 + 30)[0], (3.5 / 12) * Math.PI * 2) && close(handAngles(15 * 60 + 30)[1], Math.PI), 'half past three in the afternoon');
    assert.ok(close(handAngles(0)[0], 0) && close(handAngles(720)[0], 0), 'midnight and noon at twelve');
    assert.doesNotThrow(() => setTime(555));
    assert.deepEqual(colliders, []);
    let meshes = 0;
    group.traverse((o) => {
      if (!o.geometry) return;
      meshes++;
      const p = o.geometry.attributes.position.array, n = o.geometry.attributes.normal.array;
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${o.name}: vertex ${Math.floor(i / 3)} is not finite`);
      if (!o.name.endsWith('shingles')) return;
      for (let i = 0; i < p.length; i += 3) {
        const out = (p[i] - T.centre[0]) * n[i] + (p[i + 2] - T.centre[1]) * n[i + 2];
        // (the verges' faces lean along their side, not out of the tower: a metre's worth of slack)
        assert.ok(n[i + 1] > 0.05 && out > -1, `a shingle face at ${p[i].toFixed(1)}, ${p[i + 1].toFixed(1)}, ${p[i + 2].toFixed(1)} faces in or down`);
      }
    });
    assert.equal(meshes, 6, 'masonry, shingles, decals, the hands, the ball, its rod');
    const hands = group.children.find((o) => o.name.endsWith('hands'));
    assert.equal(hands.geometry.attributes.position.count, 4 * 2 * 6, 'two hands of two triangles on each of the four dials');
  } finally {
    globalThis.document = doc;
  }
});
