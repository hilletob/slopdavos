import assert from 'node:assert/strict';
import test from 'node:test';
import { AIR_OBSTACLES } from '../js/air-obstacles-data.js';
import { airObstacleField, airObstacleContact, KIND } from '../js/air-obstacle-field.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const inMap = (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;
const flat = () => 0; // (a level ground at the frame's zero)

test('the registered air navigation obstacles of Davos (BAZL ch.bazl.luftfahrthindernis), inside the map', () => {
  const { masts, spans, source, kinds } = AIR_OBSTACLES;
  assert.match(source, /BAZL/);
  assert.deepEqual(kinds, ['power', 'cable', 'pole']);
  assert.ok(masts.length >= 150 && spans.length >= 120, `${masts.length} masts, ${spans.length} spans`);
  for (const [x, z, top, agl, kind] of masts) {
    assert.ok(inMap(x, z) && Number.isFinite(top) && agl >= 0 && agl < 200 && kind >= 0 && kind <= 2);
  }
  for (const [x0, z0, t0, x1, z1, t1, kind] of spans) {
    assert.ok(inMap(x0, z0) && inMap(x1, z1) && Number.isFinite(t0) && Number.isFinite(t1) && kind <= 1);
    assert.ok(Math.hypot(x1 - x0, z1 - z0) < 1200, 'no span over 1.2 km');
  }
  // The high line down the Landwasser valley (masts around 50 m) and single aerial masts
  assert.ok(masts.filter((m) => m[4] === 0 && m[3] >= 40).length >= 15, 'high pylons');
  assert.ok(masts.filter((m) => m[4] === 2).length >= 5, 'aerial masts');
  assert.ok(spans.some((s) => s[6] === 1 && Math.hypot(s[3] - s[0], s[4] - s[1]) > 500), 'a long cable span');
});

test('a body flying into a mast or a conductor is pushed out of it', () => {
  const f = airObstacleField(flat);
  assert.equal(f.masts.length, AIR_OBSTACLES.masts.length);
  const mast = f.masts.find((m) => m.kind === KIND.pole);
  // beside the mast, half way up: touched, pushed away from its axis
  const hit = airObstacleContact(flat, mast.x + 2, mast.h / 2, mast.z, 5);
  assert.equal(hit.kind, 'mast');
  assert.ok(hit.nx > 0.99 && hit.depth > 3 && hit.depth < 4);
  // above its top and far beside it: clear
  assert.equal(airObstacleContact(flat, mast.x, mast.top + 12, mast.z, 5), null);
  assert.equal(airObstacleContact(flat, mast.x + 40, mast.h / 2, mast.z, 5), null);
  // on a cable, in the middle of its longest span: touched; 30 m above it: clear
  const wire = f.wires.filter((w) => w.kind === KIND.cable).sort((a, b) => b.len - a.len)[0];
  const i = Math.floor(wire.pts.length / 6) * 3;
  const [x, y, z] = [wire.pts[i], wire.pts[i + 1], wire.pts[i + 2]];
  const onWire = airObstacleContact(flat, x, y + 2, z, 5);
  assert.equal(onWire.kind, 'wire');
  assert.ok(onWire.ny > 0.9 && Math.abs(onWire.depth - 3) < 0.5, `${onWire.ny} ${onWire.depth}`);
  assert.equal(airObstacleContact(flat, x, y + 30, z, 5), null);
  // every conductor stays clear of the ground and sags below the straight line between its ends
  for (const w of f.wires) {
    const n = w.pts.length / 3 - 1, m = Math.floor(n / 2) * 3;
    assert.ok(w.pts[m + 1] <= (w.pts[1] + w.pts[n * 3 + 1]) / 2 + 1e-3);
  }
});
