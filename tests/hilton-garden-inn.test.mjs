import test from 'node:test';
import assert from 'node:assert/strict';
import { HILTON, face, levels, loggias, onWall, outwardRing, panels, partAt, pointInRing, recess, ringArea2, wallFrame } from '../js/hilton-garden-inn-data.js';
import { SHOPS_DATA } from '../js/shops-data.js';

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
const rings = { hotel: HILTON.ring, court: HILTON.court.ring, low: HILTON.low.ring };

test('the volumes: outlines of some size, the floors adding up to the surveyed roof', () => {
  for (const [id, ring] of Object.entries(rings)) assert.ok(ring.length >= 4 && Math.abs(ringArea2(ring)) / 2 > 150, `${id}: an outline of some size`);
  // the exclusion catches the batch, not the Kongress Hotel's 45 m south
  assert.equal(HILTON.exclude.r, 3);
  assert.ok(Math.hypot(187 - HILTON.exclude.x, -618 - HILTON.exclude.z) > 40);
  // the ground floor from the street to the first floor (4–5 m), five floors of 3.1 m to the roof's slab, the parapet
  // to the surveyed roof
  const L = levels();
  assert.equal(L.length, 5);
  assert.ok(HILTON.first - HILTON.street > 4 && HILTON.first - HILTON.street < 5);
  assert.ok(Math.abs(L[4] + HILTON.storey - HILTON.roofLevel) < 1e-9);
  assert.ok(HILTON.top - HILTON.roofLevel > 0.2 && HILTON.top - HILTON.roofLevel < 0.6);
  // the footpath on the west lies at y +1 to +2.7: the first floor's windows over it, the floors under the roof four
  // and a half (as the photograph from the path shows four rows of windows over the snow)
  assert.ok(HILTON.first + 0.9 > 1 && HILTON.first + 0.9 < 3.5);
  // the low parts under the hotel's roof, the court's under the second floor's rail
  assert.ok(HILTON.court.top < L[1] + HILTON.rail && HILTON.low.top < L[2]);
});

test('the faces: every wall of the hotel\'s outline once, its way round, its outside out', () => {
  const R = outwardRing(HILTON.ring);
  assert.equal(HILTON.faces.length, R.length);
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length];
    const f = HILTON.faces.filter((q) => near(q.a, a) && near(q.b, b));
    assert.equal(f.length, 1, `the wall ${i} has one face`);
  }
  for (const [id, ring] of Object.entries(rings)) {
    const O = outwardRing(ring);
    for (let i = 0; i < O.length; i++) {
      const F = wallFrame(O[i], O[(i + 1) % O.length]);
      if (F.len < 2) continue;
      const [x, z] = onWall(F, F.len / 2, 0.3);
      assert.ok(!pointInRing(ring, x, z), `${id}: wall ${i} faces out`);
    }
  }
  // the photographs' walls: the skin on the street (south), the white east end with the name, the balconies on the west
  assert.ok(wallFrame(face('south').a, face('south').b).n[1] > 0.99);
  assert.ok(wallFrame(face('east-south').a, face('east-south').b).n[0] > 0.99 && face('east-south').name);
  assert.ok(wallFrame(face('west').a, face('west').b).n[0] < -0.99 && face('west').style === 'balcony');
});

test('the margins: within their walls, deep enough where two recessed faces meet at a convex corner', () => {
  const R = outwardRing(HILTON.ring), n = R.length;
  const at = (i) => HILTON.faces.find((q) => near(q.a, R[i]) && near(q.b, R[(i + 1) % n]));
  for (let i = 0; i < n; i++) {
    const f0 = at((i - 1 + n) % n), f1 = at(i);
    const p = R[(i - 1 + n) % n], q = R[i], r = R[(i + 1) % n];
    const convex = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) < 0;
    if (f0.style === 'plaster' || f1.style === 'plaster' || !convex) continue;
    assert.ok(f0.ends[1] >= HILTON.depth && f1.ends[0] >= HILTON.depth, `the corner ${f0.id} / ${f1.id}`);
  }
  for (const f of HILTON.faces.filter((q) => q.style !== 'plaster')) {
    const { F, e0, e1 } = recess(f);
    assert.ok(e0 >= 0 && e1 <= F.len && e1 - e0 > 2 * HILTON.bay, f.id);
  }
});

test('the loggias step along the street front, two rooms wide, inside its margins and apart', () => {
  const f = face('south'), { e0, e1 } = recess(f);
  const all = levels().map((_, i) => loggias(f, i));
  for (const [i, list] of all.entries()) {
    assert.ok(list.length >= 3, `floor ${i}: ${list.length} loggias`);
    for (const [s0, s1] of list) {
      assert.ok(s0 >= e0 && s1 <= e1);
      assert.ok(Math.abs(s1 - s0 - (2 * HILTON.bay - 0.3)) < 1e-9);
    }
    for (let k = 1; k < list.length; k++) assert.ok(list[k][0] - list[k - 1][1] > HILTON.bay, 'battens between them');
  }
  // floor to floor they move one bay along
  const firsts = all.map((list) => list.map(([s0]) => s0));
  for (let i = 1; i < firsts.length; i++) assert.ok(firsts[i].some((s) => firsts[i - 1].some((t) => Math.abs(s - t - HILTON.bay) < 1e-6)), `floor ${i}`);
  // the ground floor's stretches cover the front without gaps
  const F = wallFrame(f.a, f.b), G = HILTON.ground;
  assert.equal(G[0][0], 0);
  for (let i = 1; i < G.length; i++) assert.equal(G[i][0], G[i - 1][1]);
  assert.ok(Math.abs(G[G.length - 1][1] - F.len) < 0.05);
  // the entrance before the doors: outside every volume (a step out of its recess' back)
  const ent = G.find((g) => g[2] === 'entrance');
  const [x, z] = onWall(F, (ent[0] + ent[1]) / 2, -ent[3] + 0.5);
  assert.ok(Math.abs(x) > 0 && !pointInRing(HILTON.low.ring, x, z) && !pointInRing(HILTON.court.ring, x, z));
});

test('the balconies\' panels: a bay each, on every floor of every face, inside the wall', () => {
  for (const f of HILTON.faces.filter((q) => q.style === 'balcony')) {
    const { F } = recess(f);
    levels().forEach((_, i) => {
      for (const [s0, s1] of panels(f, i)) assert.ok(s0 > -0.01 && s1 < F.len + 0.01 && Math.abs(s1 - s0 - HILTON.bay + 0.1) < 1e-9);
    });
  }
});

test('the shops: the hotel\'s generic board and the butcher\'s are dropped for the lettering drawn here', () => {
  const hotel = SHOPS_DATA.find((s) => s.osm === HILTON.osm), metzg = SHOPS_DATA.find((s) => s.osm === 'n2503295134');
  assert.ok(hotel && metzg);
  assert.equal(partAt(metzg.x, metzg.z), 'low');
  assert.ok(Math.abs(metzg.x - HILTON.shop.metzg.x) < 0.5);
  const R = outwardRing(HILTON.low.ring), F = R.map((a, i) => wallFrame(a, R[(i + 1) % R.length])).find((q) => q.n[1] > 0.9);
  const s = (HILTON.shop.metzg.x - F.a[0]) / F.u[0];
  assert.ok(s - HILTON.shop.metzg.w / 2 > 0.5 && s + HILTON.shop.metzg.w / 2 < F.len - 0.5);
});

test('the atlas\' cells lie in it without overlapping', async () => {
  const { ATLAS } = await import('../js/hilton-garden-inn.js');
  const cells = Object.entries(ATLAS);
  for (const [k, [x, y, w, h]] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 640, k);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [, a] = cells[i], [, b] = cells[j];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `${cells[i][0]} and ${cells[j][0]}`);
    }
  }
  // the names keep the cell's proportions on their walls
  const name = ATLAS.name[2] / ATLAS.name[3];
  for (const f of HILTON.faces.filter((q) => q.name)) {
    assert.ok(Math.abs(f.name.w / f.name.h - name) < 0.2, f.id);
    assert.ok(f.name.w < wallFrame(f.a, f.b).len - 1 && f.name.y + f.name.h < HILTON.top - 2);
  }
});

test('the building in Node: every vertex finite and near the outlines, seven meshes, colliders along the walls', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildHiltonGardenInn } = await import('../js/hilton-garden-inn.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.ok(SHOP_EXCLUSIONS.has(HILTON.osm) && SHOP_EXCLUSIONS.has('n2503295134'));
  const scene = new THREE.Scene();
  const { group, colliders } = buildHiltonGardenInn(scene);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name.replace('Hilton Garden Inn ', '')).sort();
  assert.deepEqual(names, ['decal', 'glass', 'panel', 'plaster', 'roof', 'timber', 'trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0 && p.count % 3 === 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 0; i < p.array.length; i += 3) {
      const [x, y, z] = [p.array[i], p.array[i + 1], p.array[i + 2]];
      assert.ok(y >= HILTON.base - 0.01 && y < HILTON.top + 3, `${m.name}: a height of ${y}`);
      assert.ok(x > 91 && x < 202 && z > -678 && z < -643.5, `${m.name}: a point at ${x}, ${z}`);
    }
    for (const k of Object.keys(m.geometry.attributes)) assert.equal(m.geometry.attributes[k].count, p.count, `${m.name}: ${k}`);
    if (/plaster$/.test(m.name)) assert.ok(m.geometry.attributes.aHalf);
    if (/trim$/.test(m.name)) assert.ok(m.geometry.attributes.color);
  }
  assert.ok(colliders.length >= HILTON.faces.length + 8);
  for (const c of colliders) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > c.minY + 4 && c.minY === HILTON.base);
    // within the outlines' reach
    assert.ok(c.minX > 90 && c.maxX < 202.5 && c.minZ > -678 && c.maxZ < -643);
  }
});
