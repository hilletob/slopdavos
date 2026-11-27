import test from 'node:test';
import assert from 'node:assert/strict';
import { MEIERHOF, columns, entranceAt, frontFrame, gableHalf, gableSpan, groundOutlines, onWall, outwardRing, part, partAt, pointInRing, ridge, ringArea2, wallFrame } from '../js/meierhof-data.js';
import { bioStops } from '../js/missions-data-rural.js';

const onGrid = (y) => Math.abs((y - MEIERHOF.foot) / MEIERHOF.storey - Math.round((y - MEIERHOF.foot) / MEIERHOF.storey)) < 1e-9;
/** The distance from a point to a ring's walls */
function toWalls(ring, x, z) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return d;
}

test('the volumes: outlines of some size, the floors\' grid under every roof', () => {
  for (const p of MEIERHOF.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 15, `${p.id}: an outline of some size`);
    assert.ok(p.top > MEIERHOF.base + 5, `${p.id}: its roof over the base`);
    assert.ok(onGrid(p.line), `${p.id}: its floors on the grid`);
    assert.ok(p.line <= p.top + 1e-9 && (p.windows === false || p.top - p.line < 0.7), `${p.id}: the floors end at its roof`);
  }
  // the old house: the ground floor and five floors up to the flat strips, the gable's eaves and ridge over them
  const house = part('house');
  assert.equal(Math.round((house.line - MEIERHOF.foot) / MEIERHOF.storey), 6);
  assert.ok(MEIERHOF.gable.eave > house.top && MEIERHOF.gable.ridge - MEIERHOF.gable.eave > 4);
  assert.equal(Math.round((part('west').line - MEIERHOF.foot) / MEIERHOF.storey), 3);
  assert.equal(Math.round((part('wing').line - MEIERHOF.foot) / MEIERHOF.storey), 2);
  // the surveyed batch reaches from the Promenade (north) 40 m south into the garden
  const zs = MEIERHOF.parts.flatMap((p) => p.ring.map((q) => q[1]));
  assert.ok(Math.min(...zs) < -1177 && Math.max(...zs) > -1138);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of MEIERHOF.parts) {
    const ring = outwardRing(p.ring);
    let out = 0, walls = 0;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 2) continue;
      walls++;
      const [x, z] = onWall(F, F.len / 2, 0.2);
      if (!pointInRing(p.ring, x, z)) out++;
    }
    assert.equal(out, walls, `${p.id}: ${out} of ${walls} walls face out`);
  }
});

test('the front is the old house\'s north wall on the Promenade; the gable rises over its middle', () => {
  const F = frontFrame(), house = outwardRing(part('house').ring);
  assert.ok(F.n[1] < -0.95, 'the front faces north (smaller z)');
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05;
  assert.ok(house.some((q, i) => near(q, MEIERHOF.front.a) && near(house[(i + 1) % house.length], MEIERHOF.front.b)), 'one of the house\'s walls, a → b');
  const span = gableSpan(MEIERHOF.front.a, MEIERHOF.front.b);
  assert.ok(span && span[0] > 3 && span[1] < F.len - 3, 'the gable stands within the front');
  // the ridge runs north–south over the middle of the gable
  const [rn, rs] = ridge();
  assert.ok(Math.abs(rs[1] - rn[1]) > 12 && Math.abs(rs[0] - rn[0]) < 3);
  assert.ok(Math.abs(gableHalf(MEIERHOF.gable.eave) * 2 - (span[1] - span[0])) < 0.1);
  assert.equal(gableHalf(MEIERHOF.gable.ridge), 0);
  // the doors in the gable's middle, in a window's column
  const s = entranceAt();
  assert.ok(Math.abs(s - (span[0] + span[1]) / 2) < 0.5);
  assert.ok(columns(F.len).some((c) => Math.abs(c - s) < 1e-9));
});

test('the oriel, the names and the monogram stand on the front, clear of its windows', () => {
  const F = frontFrame(), cols = columns(F.len), W = MEIERHOF.win, house = part('house');
  const clear = (s0, s1) => cols.every((c) => c + W.half < s0 - 0.1 || c - W.half > s1 + 0.1);
  const O = MEIERHOF.oriel, L = MEIERHOF.letters, Mo = MEIERHOF.monogram, N = MEIERHOF.name;
  // the oriel on the top floor at the corner, within the stretch kept free of windows
  assert.ok(O.s - O.w / 2 > 0.2 && O.s + O.w / 2 < MEIERHOF.topClear && Math.abs(O.y0 - (house.line - MEIERHOF.storey)) < 1e-9);
  assert.ok(O.corbel < O.y0 && O.corbel > L.y1);
  // the name down the wall under it, beside the windows' first column
  assert.ok(Math.abs(L.s - O.s) < 0.1 && clear(L.s - L.w / 2, L.s + L.w / 2) && L.y0 > MEIERHOF.foot + MEIERHOF.storey);
  // the monogram beside the oriel on the top floor, no window there
  assert.ok(Mo.s - Mo.w / 2 > O.s + O.w / 2 && Mo.s + Mo.w / 2 < MEIERHOF.topClear);
  assert.ok(Mo.y0 > house.line - MEIERHOF.storey && Mo.y1 < house.line);
  assert.ok(cols.every((c) => c - W.half > MEIERHOF.topClear + 0.1 || c + W.half < MEIERHOF.topClear - 0.1), 'no window of the top floor cut by the clear stretch');
  // the name across the front between two rows of windows
  const lo = (k) => MEIERHOF.foot + k * MEIERHOF.storey;
  assert.ok([...Array(6).keys()].some((k) => N.y0 > lo(k) + W.hi + 0.1 && N.y1 < lo(k + 1) + W.lo - 0.1));
  assert.ok(N.s0 > 0 && N.s1 < F.len);
});

test('the player\'s walls: every part\'s outline, near OpenStreetMap\'s footprint', () => {
  const rings = groundOutlines();
  assert.equal(rings.length, MEIERHOF.parts.length);
  const fp = MEIERHOF.footprint;
  // the old house's corners on the Promenade within 2 m of OSM's rectangle's walls
  for (const [x, z] of part('house').ring.filter((q) => q[1] < -1170)) assert.ok(toWalls(fp, x, z) < 2, `${x} ${z}`);
  for (const ring of rings) for (const [x, z] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(z));
});

test('the bio-waste barrel before the hotel (js/missions-data-rural.js) stays reachable', () => {
  for (const seed of [1, 2, 3]) {
    const b = bioStops(seed).find((s) => s.name === 'Hotel Meierhof');
    assert.ok(b);
    assert.equal(partAt(b.x, b.z), null, 'not inside the hotel');
    for (const ring of groundOutlines()) assert.ok(pointInRing(ring, b.x, b.z) === false && toWalls(ring, b.x, b.z) > 1.5, 'clear of its walls');
    // nothing of the entrance stands near it (the doors are on the north front)
    const [ex, ez] = onWall(frontFrame(), entranceAt(), 1.0);
    assert.ok(Math.hypot(ex - b.x, ez - b.z) > 10);
  }
});

test('the building in Node: every vertex finite, five meshes, no colliders of its own, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { buildMeierhof, ATLAS } = await import('../js/meierhof.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(MEIERHOF.osm), groundOutlines());
  assert.ok(SHOP_EXCLUSIONS.has(MEIERHOF.osm));
  // the atlas' cells inside it, not overlapping
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 1024);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `cells ${i} and ${j}`);
    }
  }
  const scene = new THREE.Scene();
  const { group, colliders } = buildMeierhof(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Meierhof decal', 'Meierhof glass', 'Meierhof plaster', 'Meierhof roof', 'Meierhof trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > MEIERHOF.base - 1 && p.array[i] < 33, `${m.name}: a height of ${p.array[i]}`);
    for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i] > 520 && p.array[i] < 572 && p.array[i + 2] > -1184 && p.array[i + 2] < -1130, `${m.name}: within the hotel's plot`);
  }
  // the walls carry their half lengths, the roof reaches the ridge
  assert.ok(group.children.find((m) => m.name === 'Meierhof plaster').geometry.attributes.aHalf);
  const roof = group.children.find((m) => m.name === 'Meierhof roof').geometry.attributes.position.array;
  let top = -Infinity;
  for (let i = 1; i < roof.length; i += 3) top = Math.max(top, roof[i]);
  assert.ok(Math.abs(top - MEIERHOF.gable.ridge) < 0.05);
});
