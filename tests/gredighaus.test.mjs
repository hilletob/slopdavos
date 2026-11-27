import test from 'node:test';
import assert from 'node:assert/strict';
import { GREDIGHAUS, bayAt, bayOpen, firstFloor, groundOutlines, onWall, outwardRing, part, pointInRing, ringArea2, wallFrame, wallSpec } from '../js/gredighaus-data.js';

const G = GREDIGHAUS;
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b a wall of the part, running as wallFrame wants it (outside on its left-hand normal)? */
const isWall = (p, a, b) => { const r = outwardRing(p.ring); return r.some((q, i) => near(q, a) && near(r[(i + 1) % r.length], b)); };
const spec = (id) => G.walls.find((w) => w.id === id);

test('the Gredighaus\' volumes: outlines of some size, the floors adding up to the surveyed height', () => {
  for (const p of G.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 30, `${p.id}: an outline of some size`);
    assert.ok(p.top > G.base + 6 && p.windowTop <= p.top);
  }
  assert.ok(Math.abs(Math.abs(ringArea2(part('house').ring)) / 2 - 213) < 6, 'the house: the survey\'s 213 m²');
  // the shops' floor from the street (y 1.3) to the first floor; four floors to the frieze, the eave over it at the roof
  assert.ok(Math.abs(G.floor1 + G.floors * G.storey - G.frieze) < 1e-9);
  assert.ok(G.floor1 - 1.3 > 3.5 && G.floor1 - 1.3 < 4.5);
  assert.ok(G.eave.y0 > G.frieze && G.eave.y1 >= part('house').top && G.eave.y1 - part('house').top < 0.1);
  // the canopy over the shops' glazing, under the first floor's sills
  assert.ok(G.canopy[0] > G.shopTop && G.canopy[1] <= G.floor1 + G.window.lo);
  // the wing's windows' grid: a floor's foot on the street, its top under its roof
  const w = part('wing');
  assert.ok(w.grid > 1.0 && w.grid < 1.5 && w.grid + 2 * G.storey < w.top);
  // the house's grid: its storey's feet at multiples of the storey from `grid`
  assert.equal(part('house').grid, G.floor1);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of G.parts) {
    const ring = outwardRing(p.ring);
    let out = 0, walls = 0;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 1) continue;
      walls++;
      const [x, z] = onWall(F, F.len / 2, 0.2);
      if (!pointInRing(p.ring, x, z)) out++;
    }
    assert.equal(out, walls, `${p.id}: ${out} of ${walls} walls face out`);
  }
});

test('the walls with things of their own lie on the outlines and face the sides the photographs show', () => {
  const house = part('house');
  for (const w of G.walls) {
    const p = isWall(house, w.a, w.b) ? house : part('wing');
    assert.ok(isWall(p, w.a, w.b), `${w.id}: a wall of a part`);
    assert.equal(wallSpec(w.a, w.b), w);
    const F = wallFrame(w.a, w.b);
    if (w.shop) assert.ok(w.shop[0] >= 0 && w.shop[1] <= F.len + 0.05 && w.columns.every((s) => s >= 0 && s <= F.len + 0.05));
    for (const k of w.strips || []) assert.ok(bayOpen(F.len, k), `${w.id}: bay ${k} opens`);
    for (const [q0, q1] of w.quoins || []) {
      assert.ok(q0 >= 0 && q1 <= F.len + 0.05);
      // (no window under a quoin)
      for (let k = -3; k <= 3; k++) if (bayOpen(F.len, k)) { const c = bayAt(F.len, k); assert.ok(c + G.window.half < q0 || c - G.window.half > q1, `${w.id}: bay ${k} free of the quoin`); }
    }
  }
  // compass sides (x east, z south): the square's front faces south-west, the street's south-east, the wing's north-east
  const n = (id) => { const s = spec(id); return wallFrame(s.a, s.b).n; };
  assert.ok(n('south-west')[0] < -0.5 && n('south-west')[1] > 0.5);
  assert.ok(n('south-east')[0] > 0.5 && n('south-east')[1] > 0.5);
  assert.ok(n('north-east')[0] > 0.5 && n('north-east')[1] < -0.5);
  // the square's front: three window columns, the middle one in the strip; the street front five, all in strips
  const sw = wallFrame(spec('south-west').a, spec('south-west').b), se = wallFrame(spec('south-east').a, spec('south-east').b);
  assert.deepEqual([-2, -1, 0, 1, 2].filter((k) => bayOpen(sw.len, k)), [-1, 0, 1]);
  assert.deepEqual([-3, -2, -1, 0, 1, 2, 3].filter((k) => bayOpen(se.len, k)), [-2, -1, 0, 1, 2]);
});

test('the name sits over the canopy between the first and the second floor\'s windows, under the column by the street', () => {
  const s = spec('south-west'), L = s.letters, F = wallFrame(s.a, s.b), c = bayAt(F.len, L.bay);
  assert.ok(bayOpen(F.len, L.bay) && c - L.w / 2 > s.quoins[0][1] && c + L.w / 2 < s.quoins[1][0]);
  assert.ok(L.y0 > G.floor1 + G.window.hi + 0.1 && L.y1 < G.floor1 + G.storey + G.window.lo - 0.2);
  // the door and the small windows west of the shops, clear of the quoin and the column
  for (const [x, hw] of s.windows) assert.ok(x - hw > s.quoins[0][1] && x + hw < s.door[0]);
  assert.ok(s.door[1] < s.shop[0] - 0.4);
  // (the floors whose windows clear the ground: the square's first, behind the wing the second)
  assert.equal(firstFloor(1.55), 0);
  assert.equal(firstFloor(G.parts[1].top + 0.25), 1);
});

test('the surveyed outlines the player\'s walls stand on, and the canopy over the pavement outside them', () => {
  const rings = groundOutlines();
  assert.equal(rings.length, 2);
  const s = spec('south-east'), F = wallFrame(s.a, s.b);
  const [x, z] = onWall(F, F.len / 2, s.canopy[2] - 0.2);
  assert.ok(!rings.some((r) => pointInRing(r, x, z)), 'the pavement under the canopy is free');
  // OpenStreetMap's outline lies within a metre or so of the survey's
  const osm = [[892, -1628.4], [882.1, -1615.9], [872.1, -1623.8], [874.8, -1627.2], [874, -1627.9], [877.8, -1632.7], [878.7, -1632], [881, -1635], [882, -1636.2], [884.1, -1634.6]];
  for (const [ox, oz] of osm) {
    let best = Infinity;
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((ox - a[0]) * dx + (oz - a[1]) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(ox - a[0] - t * dx, oz - a[1] - t * dz));
    }
    assert.ok(best < 1.2, `OSM's corner ${ox}, ${oz}: ${best.toFixed(2)} m off`);
  }
});

test('the building in Node: every vertex finite, five meshes, its outlines registered, no colliders of its own', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { QUALITY } = await import('../js/quality.js');
  const { buildGredighaus, ATLAS } = await import('../js/gredighaus.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(G.osm), groundOutlines());
  // the atlas' cells do not overlap
  const cells = Object.values(ATLAS);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);
  }
  for (const simple of [false, true]) {
    const before = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildGredighaus(scene);
    QUALITY.simpleMaterials = before;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name).sort();
    assert.deepEqual(names, ['Gredighaus decal', 'Gredighaus glass', 'Gredighaus plaster', 'Gredighaus roof', 'Gredighaus trim']);
    for (const m of group.children) {
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= G.base - 0.6 && p.array[i] < 19, `${m.name}: a height of ${p.array[i]}`);
      // the phone's profile: no full shader but the decals'
      if (simple && m.name !== 'Gredighaus decal' && m.name !== 'Gredighaus trim') assert.ok(!m.material.roughnessNode && !m.material.normalNode, `${m.name}: a simple skin`);
    }
    // everything within a few metres of the outlines
    const box = new THREE.Box3().setFromObject(group);
    assert.ok(box.min.x > 865 && box.max.x < 900 && box.min.z > -1645 && box.max.z < -1610);
  }
});
