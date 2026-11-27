import test from 'node:test';
import assert from 'node:assert/strict';
import { SYMONDPARK, bays, floorTops, glassFoot, inside, onWall, pointInRing, ring, ringArea2, wallFrame, wallOf } from '../js/symondpark-data.js';
import { groundHeight } from '../js/terrain.js';
import { POST_BOXES } from '../js/missions-data-post.js';

const S = SYMONDPARK;
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
const isWall = (a, b) => S.ring.some((q, i) => { const r = S.ring[(i + 1) % S.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });

test('the SymondPark\'s outline: of some size, its walls facing out, the floors adding up to the surveyed roof', () => {
  assert.equal(S.ring.length, 4);
  assert.ok(Math.abs(ringArea2(S.ring)) / 2 > 600, 'an outline of some size');
  const R = ring();
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    assert.ok(F.len > 20);
    assert.ok(!pointInRing(S.ring, ...onWall(F, F.len / 2, 0.2)), 'a step out of a wall leaves the outline');
    assert.ok(pointInRing(S.ring, ...onWall(F, F.len / 2, -0.2)));
  }
  // the shop's ground floor, two upper floors, the coping over the last
  const tops = floorTops();
  assert.equal(tops.length, S.floors);
  assert.ok(Math.abs(tops[tops.length - 1] - S.screenTop) < 1e-9, 'the upper floors end under the coping');
  assert.ok(S.top - S.screenTop > 0.1 && S.top - S.screenTop < 0.5, 'a coping\'s height');
  assert.ok(S.line - S.floor > 4 && S.line - S.floor < 5.2, 'a shop\'s tall ground floor');
  assert.ok(S.floor < S.glass - S.clear && S.glass < S.line);
  assert.ok(S.base < S.floor - 1);
});

test('the named walls are walls of the outline, facing their sides; the bays fit each wall', () => {
  assert.ok(isWall(S.south.a, S.south.b) && isWall(S.west.a, S.west.b));
  const So = wallOf('south'), W = wallOf('west');
  assert.ok(So.n[1] > 0.95, 'the south front faces south (bigger z)');
  assert.ok(W.n[0] < -0.95, 'the west side faces west');
  // the same frames as the outward ring's
  const R = ring();
  for (const F of [So, W]) assert.ok(R.some((q, i) => near(q, F.a) && near(R[(i + 1) % R.length], onWall(F, F.len))));
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]), { n, w } = bays(F.len);
    assert.ok(Math.abs(n * w - F.len) < 1e-9 && w > 3.8 && w < 6, `bays of ${w} m`);
  }
  // the entrance in the south front's middle bay: its doors and canopy within it and the wall
  const { n, w } = bays(So.len), mid = So.len / 2, i = Math.floor(n / 2);
  assert.ok(n % 2 === 1 && mid - S.south.door.w / 2 > i * w && mid + S.south.door.w / 2 < (i + 1) * w);
  assert.ok(S.south.door.canopy.w < So.len - 2 && S.south.door.canopy.y1 < S.glass);
});

test('the glazing starts over the highest ground along a bay, else the screen comes down; the south front is glazed', () => {
  assert.equal(glassFoot(-5), S.floor + 0.3);
  assert.equal(glassFoot(0.0), 0.25);
  assert.equal(glassFoot(S.glass - S.clear), null);
  assert.equal(glassFoot(3.0), null);
  const along = (F, s0, s1) => { let hi = -Infinity; for (let s = s0; s <= s1 + 1e-6; s += (s1 - s0) / 8) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5))); return hi; };
  const R = ring();
  let glazed = 0;
  for (let k = 0; k < R.length; k++) {
    const F = wallFrame(R[k], R[(k + 1) % R.length]), { n, w } = bays(F.len);
    for (let i = 0; i < n; i++) {
      const hi = along(F, i * w, (i + 1) * w), foot = glassFoot(hi);
      if (foot === null) continue;
      glazed++;
      assert.ok(foot > hi + 0.1, 'no pane cut by the ground');
      assert.ok(S.glass - foot >= S.clear - 1e-9);
    }
  }
  const So = wallOf('south'), { n, w } = bays(So.len);
  for (let i = 0; i < n; i++) assert.ok(glassFoot(along(So, i * w, (i + 1) * w)) !== null, `the south front's bay ${i} glazed`);
  // (and the north side, dug into the slope, is not)
  assert.ok(glazed >= n + 2 && glazed < 4 * n);
});

test('the lettering lies on its walls, the atlas\' cells apart', async () => {
  for (const L of S.lettering) {
    const F = wallOf(L.wall);
    assert.ok(L.s0 >= 0.3 && L.s1 <= F.len - 0.3 && L.s1 > L.s0, `${L.key} along its wall`);
    assert.ok(L.y1 <= S.screenTop && L.y0 > S.floor, `${L.key} on the wall`);
    assert.ok(L.out > 0 && L.out < 0.2);
  }
  const fascia = S.lettering.find((l) => l.key === 'restaurant');
  assert.ok(fascia.y0 >= S.glass && fascia.y1 <= S.line, 'the restaurant\'s name on the fascia');
  const migros = S.lettering.find((l) => l.key === 'migros');
  assert.ok(migros.y0 > S.line && Math.abs((migros.s0 + migros.s1) / 2 - wallOf('south').len / 2) < 0.3, 'the shop\'s name over the entrance');
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const { ATLAS } = await import('../js/symondpark.js');
  const cells = Object.values(ATLAS);
  for (let i = 0; i < cells.length; i++) {
    const [x, y, w, h] = cells[i];
    assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
    for (let j = i + 1; j < cells.length; j++) {
      const [x2, y2, w2, h2] = cells[j];
      assert.ok(x + w <= x2 || x2 + w2 <= x || y + h <= y2 || y2 + h2 <= y, 'cells apart');
    }
  }
  for (const L of S.lettering) assert.ok(ATLAS[L.key]);
});

test('the post box at the Promenade/Richtstattweg stays outside the building and its canopy, free a metre round', () => {
  const box = POST_BOXES.find((b) => b.id === 'n10302584689');
  assert.ok(box);
  assert.ok(!inside(box.x, box.z));
  const So = wallOf('south'), mid = So.len / 2, cn = S.south.door.canopy;
  const [ax, az] = onWall(So, mid - cn.w / 2), [bx, bz] = onWall(So, mid + cn.w / 2, cn.out);
  const [cx, cz] = onWall(So, mid + cn.w / 2), [dx, dz] = onWall(So, mid - cn.w / 2, cn.out);
  assert.ok(!pointInRing([[ax, az], [cx, cz], [bx, bz], [dx, dz]], box.x, box.z));
  // a metre round it is free of the building
  for (let a = 0; a < 6.28; a += 0.5) assert.ok(!inside(box.x + Math.cos(a), box.z + Math.sin(a)));
});

test('the building in Node: every vertex finite, five meshes, the surveyed outline registered, no colliders of its own', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildSymondPark } = await import('../js/symondpark.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const scene = new THREE.Scene();
  const { group, colliders } = buildSymondPark(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(S.osm), [S.ring]);
  for (const id of [S.osm, ...S.shops]) assert.ok(SHOP_EXCLUSIONS.has(id));
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['SymondPark decal', 'SymondPark glass', 'SymondPark roof', 'SymondPark screen', 'SymondPark trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > S.base - 1 && p.array[i] < S.top + 0.5, `${m.name}: a height of ${p.array[i]}`);
  }
  // (the screen's and the glass' bay widths ride on aHalf)
  for (const name of ['SymondPark screen', 'SymondPark glass']) {
    const h = group.children.find((m) => m.name === name).geometry.attributes.aHalf;
    assert.ok(h && [...h.array].every((v) => v > 3.8 && v < 6));
  }
});
