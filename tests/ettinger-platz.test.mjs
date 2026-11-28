import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { ETTINGER_PLATZ, boardFrame, groundOutlines, inside, onWall, outwardRing, pointInRing, ringArea2, wallEnds, wallOf } from '../js/ettinger-platz-data.js';
import { groundHeight } from '../js/terrain.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const E = ETTINGER_PLATZ;

test('the house\'s outlines: of some size, the walls outward, the roof\'s slab out over them', () => {
  assert.equal(E.walls.length, E.ring.length);
  assert.ok(Math.abs(ringArea2(E.ring)) / 2 > 150, 'the walls\' outline');
  assert.deepEqual(outwardRing(E.ring), E.ring, 'the ring is outward as written');
  const roof = E.roof.ring;
  assert.ok(Math.abs(ringArea2(roof)) / 2 > Math.abs(ringArea2(E.ring)) / 2, 'the roof larger than the walls');
  for (let i = 0; i < E.ring.length; i++) {
    const F = wallOf(i);
    if (F.len < 2) continue;
    // a step out of a wall leaves the walls' outline but stays under the slab; two metres out leaves both
    const [x, z] = onWall(F, F.len / 2, 0.2);
    assert.ok(!inside(x, z), `wall ${i} faces out`);
    assert.ok(pointInRing(roof, x, z), `wall ${i}: under the slab`);
    const [fx, fz] = onWall(F, F.len / 2, 1.2);
    assert.ok(!pointInRing(roof, fx, fz), `wall ${i}: the slab less than 1.2 m out`);
  }
  // the sides as named: north faces smaller z, south bigger z, east bigger x, west smaller x
  for (let i = 0; i < E.walls.length; i++) {
    const F = wallOf(i);
    if (F.len < 2) continue;
    const want = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[E.walls[i].side];
    assert.ok(F.n[0] * want[0] + F.n[1] * want[1] > 0.9, `wall ${i} faces ${E.walls[i].side}`);
  }
  // the heights: the floor on the ground, the glazing, the band, the slab and the roof in order (the survey's 5.32/5.5)
  assert.ok(E.base < E.floor && E.floor < E.glassTop && E.glassTop <= E.band[0] && E.band[1] < E.roof.soffit);
  assert.ok(E.roof.soffit < E.roof.top && E.roof.top < E.roof.edge && Math.abs(E.roof.edge - 5.5) < 1e-9);
});

test('the shop windows, doors, posts and lettering lie on their walls; the lettering on a closed stretch', () => {
  for (let i = 0; i < E.walls.length; i++) {
    const W = E.walls[i], F = wallOf(i);
    let at = 0;
    for (const [s0, s1] of W.glass || []) {
      assert.ok(s0 >= at - 1e-9 && s1 > s0 && s1 <= F.len + 0.01, `wall ${i}: glass ${s0}–${s1} in order, within ${F.len.toFixed(2)}`);
      at = s1;
    }
    for (const [d0, d1] of W.doors || []) assert.ok((W.glass || []).some(([s0, s1]) => d0 >= s0 && d1 <= s1) && d1 - d0 > 1.2, `wall ${i}: a door in the glazing`);
    for (const s of W.posts || []) assert.ok(s >= -0.01 && s <= F.len + 0.01, `wall ${i}: a post at ${s}`);
    if (W.letters) {
      const L = W.letters;
      assert.ok(L.from >= 0 && L.to <= F.len, 'the lettering within its wall');
      for (const [s0, s1] of W.glass || []) assert.ok(L.from >= s1 || L.to <= s0, 'no glass behind the lettering');
      assert.ok(L.y0 > E.floor + 1.5 && L.y1 < E.roof.soffit, 'the lettering under the slab');
      assert.ok(Math.abs((L.to - L.from) / (L.y1 - L.y0) - 2) < 0.01, 'as wide as its atlas cell (2 : 1)');
    }
    // the glazing's foot over the highest ground before the wall: no pane cut by the ground
    if (W.glass) {
      let hi = -Infinity;
      for (let s = 0; s <= F.len; s += 0.5) { const [x, z] = onWall(F, s, 0.5); hi = Math.max(hi, groundHeight(x, z)); }
      assert.ok(hi < E.glassTop - 2.5, `wall ${i}: the glass at least 2.5 m tall`);
    }
  }
  // one shop window front on each side but the west (the lane's, closed)
  const sides = new Set(E.walls.filter((w) => w.glass).map((w) => w.side));
  assert.deepEqual([...sides].sort(), ['east', 'north', 'south']);
  assert.ok(E.walls.find((w) => w.side === 'east').awning, 'the awning along the Promenade');
});

test('the board stands free by the north-east corner, outside the walls and the slab', () => {
  const { x, z, F } = boardFrame();
  assert.ok(!inside(x, z) && !pointInRing(E.roof.ring, x, z));
  for (const s of [0, E.board.w]) { const [bx, bz] = onWall(F, s); assert.ok(!pointInRing(E.roof.ring, bx, bz)); }
  const [nx, nz] = wallEnds(0)[0];
  assert.ok(Math.hypot(x - nx, z - nz) < 3, 'by the north-east corner');
  assert.ok(E.board.y0 > groundHeight(x, z) + 2.2, 'over the heads');
});

test('the outlines for the player\'s walls: the walls at the ground, near OSM\'s footprint', () => {
  const outlines = groundOutlines();
  assert.equal(outlines.length, 1);
  const b = DAVOS_DATA.buildings.find((q) => q.id === E.osm);
  assert.ok(b, 'the OpenStreetMap building');
  const osm = [];
  for (let i = 0; i < b.ring.length; i += 2) osm.push([b.ring[i], b.ring[i + 1]]);
  // every corner of the walls within 1.2 m of OSM's outline (which traced the slab)
  const dist = (x, z) => Math.min(...osm.map((p, i) => {
    const q = osm[(i + 1) % osm.length], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / L2));
    return Math.hypot(p[0] + dx * t - x, p[1] + dz * t - z);
  }));
  for (const [x, z] of outlines[0]) assert.ok(dist(x, z) < 1.2, `${x}, ${z}: ${dist(x, z).toFixed(2)} m off OSM`);
  // the exclude's centre lies in the house
  assert.ok(inside(E.exclude.x, E.exclude.z));
});

test('the missions\' places stay outside the house and its board; the shop\'s node at its walls', async () => {
  const dir = new URL('../js/', import.meta.url);
  const points = [];
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 5) return;
    if (typeof v.x === 'number' && typeof v.z === 'number') points.push([v.x, v.z]);
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  for (const f of readdirSync(dir).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    let mod;
    try { mod = await import(new URL(f, dir)); } catch { continue; }
    for (const k of Object.keys(mod)) if (typeof mod[k] === 'object') walk(mod[k], 0);
  }
  assert.ok(points.length > 50, 'the missions\' places read');
  const { x: bx, z: by } = boardFrame();
  for (const [x, z] of points) {
    assert.ok(!pointInRing(E.roof.ring, x, z), `a mission's place at ${x}, ${z} under the house`);
    assert.ok(Math.hypot(x - bx, z - by) > 0.8, `a mission's place at ${x}, ${z} on the board's post`);
  }
  const { SHOPS_DATA } = await import('../js/shops-data.js');
  const s = SHOPS_DATA.find((q) => q.osm === E.shop);
  assert.ok(s && /ettinger/i.test(s.name));
  assert.ok(Math.hypot(s.x - E.exclude.x, s.z - E.exclude.z) < 10);
});

test('the house in Node: every vertex finite, five meshes, the board\'s post its only collider, the shop\'s sign excluded', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { buildEttingerPlatz, ATLAS } = await import('../js/ettinger-platz.js');
  assert.ok(SHOP_EXCLUSIONS.has(E.shop));
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(E.osm), groundOutlines());
  // the atlas' cells within it, not overlapping
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 256);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'cells apart');
  }
  for (const simple of [false, true]) {
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildEttingerPlatz(scene);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name).sort();
    assert.deepEqual(names, ['Ettinger Platz decal', 'Ettinger Platz glass', 'Ettinger Platz plaster', 'Ettinger Platz roof', 'Ettinger Platz trim']);
    for (const m of group.children) {
      assert.ok(m.material, `${m.name}: a material`);
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= E.base - 0.5 && p.array[i] <= E.roof.edge + 0.01, `${m.name}: a height of ${p.array[i]}`);
    }
    assert.equal(colliders.length, 1);
    for (const c of colliders) {
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
      assert.ok(c.maxY > c.baseY + 3 && c.obb.hx < 0.2 && c.obb.hz < 0.2, 'a thin post');
      assert.ok(!inside(c.obb.cx, c.obb.cz));
    }
  }
  QUALITY.simpleMaterials = false;
});
