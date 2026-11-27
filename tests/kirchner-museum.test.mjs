import test from 'node:test';
import assert from 'node:assert/strict';
import { KIRCHNER_MUSEUM as KM, distToRing, hallWalls, onWall, outwardRing, partAt, pointInRing, ringArea2, sameWall, strayWalls, wallFrame } from '../js/kirchner-museum-data.js';
import { KIRCHNER } from '../js/missions-data-local.js';
import { groundHeight } from '../js/terrain.js';

const cube = (id) => KM.cubes.find((c) => c.id === id);
/** Is a → b (or b → a) a wall of the ring? */
const isWall = (ring, a, b) => ring.some((q, i) => sameWall(q, ring[(i + 1) % ring.length], a, b));
const crosses = (p, q, r, s) => {
  const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
};

test('the museum\'s volumes: four cubes of some size over the hall, the skylights\' band over the hall\'s roof', () => {
  assert.equal(KM.cubes.length, 4);
  for (const c of KM.cubes) {
    const area = Math.abs(ringArea2(c.ring)) / 2;
    assert.ok(area > 120 && area < 260, `${c.id}: ${area} m²`);
    assert.ok(c.top - KM.skin.band > KM.hall.top + 1, `${c.id}: its band clear of the hall`);
    assert.ok(c.top > KM.base + 15);
  }
  const hall = KM.hall.ring;
  assert.ok(Math.abs(ringArea2(hall)) / 2 > 250);
  // (the hall's outline is a simple ring: no two of its walls cross)
  for (let i = 0; i < hall.length; i++) {
    for (let j = i + 2; j < hall.length; j++) {
      if (i === 0 && j === hall.length - 1) continue;
      assert.ok(!crosses(hall[i], hall[(i + 1) % hall.length], hall[j], hall[(j + 1) % hall.length]), `walls ${i} and ${j}`);
    }
  }
  // everything within OpenStreetMap's footprint, or within 0.7 m of its walls but the walls that get colliders
  const stray = strayWalls();
  assert.equal(stray.length, 4, 'two corners, two walls each');
  for (const ring of [hall, ...KM.cubes.map((c) => c.ring)]) {
    for (const [x, z] of ring) {
      if (pointInRing(KM.footprint, x, z) || distToRing(KM.footprint, x, z) < 0.7) continue;
      assert.ok(stray.some((w) => [w.a, w.b].some((q) => q[0] === x && q[1] === z)), `${x}, ${z}: its walls collide`);
    }
  }
  assert.ok(Math.hypot(KM.exclude.x + 222.2, KM.exclude.z + 491.6) < 3, 'the excluded batch at the footprint\'s centre');
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const ring of [KM.hall.ring, ...KM.cubes.map((c) => c.ring)]) {
    const r = outwardRing(ring);
    for (let i = 0; i < r.length; i++) {
      const F = wallFrame(r[i], r[(i + 1) % r.length]);
      if (F.len < 2) continue;
      const [x, z] = onWall(F, F.len / 2, 0.2);
      assert.ok(!pointInRing(ring, x, z), `${r[i]}: faces out`);
    }
  }
});

test('the hall stands free only on the Promenade, at its west end and towards the Kurpark; the entrance and the name on it', () => {
  const walls = hallWalls();
  assert.equal(walls.length, 5);
  for (const { F } of walls) {
    const [x, z] = onWall(F, F.len / 2, 0.3);
    assert.equal(partAt(x, z), null, 'nothing before a free wall');
  }
  const E = KM.entrance;
  assert.ok(walls.some((w) => sameWall(w.a, w.b, E.a, E.b)), 'the entrance is a free wall');
  const EF = wallFrame(E.a, E.b);
  assert.ok(EF.n[1] < -0.8, 'facing the Promenade (north-west)');
  assert.ok(E.door * 2 + 0.3 < EF.len && E.sign.w < EF.len);
  // the door and its sign under the fascia
  const foot = groundHeight(...onWall(EF, EF.len / 2, 0.3));
  assert.ok(foot + E.sign.y1 < KM.hall.top - KM.hall.fascia, `the sign at ${foot + E.sign.y1}`);
  assert.ok(foot + E.height < foot + E.sign.y0);
  // the name along the hall's front, west of the cubes: on the glass under the fascia, over its plinth
  const L = KM.lettering, LF = wallFrame(L.a, L.b);
  assert.ok(walls.some((w) => sameWall(w.a, w.b, L.a, L.b)));
  assert.ok(LF.n[1] < -0.8, 'facing the Promenade');
  assert.ok(L.w < LF.len - 2 && L.y1 < KM.hall.top - KM.hall.fascia);
  let low = Infinity;
  for (let s = 0; s <= LF.len; s += 1) low = Math.min(low, groundHeight(...onWall(LF, s, 0.3)));
  assert.ok(L.y0 > Math.max(low + KM.hall.plinth, KM.hall.top - KM.hall.fascia - KM.hall.glass), 'on the glass');
});

test('the poster hangs on the north-east cube\'s east face, over the ground', () => {
  const Po = KM.poster, F = wallFrame(Po.a, Po.b);
  assert.ok(isWall(cube('cube-ne').ring, Po.a, Po.b));
  assert.ok(F.n[0] > 0.8, 'facing east');
  const s0 = F.len - Po.fromEnd - Po.w;
  assert.ok(s0 > 0.5 && Po.w / (Po.y1 - Po.y0) > 0.6 && Po.w / (Po.y1 - Po.y0) < 0.8);
  for (const s of [s0, F.len - Po.fromEnd]) assert.ok(Po.y0 > groundHeight(...onWall(F, s, 0.3)) + 0.8, `over the ground at ${s}`);
  assert.ok(Po.y1 < cube('cube-ne').top - KM.skin.coping);
});

test('the painting mission\'s easel and start stay outside the museum, clear of its walls', () => {
  for (const p of [KIRCHNER.easel, KIRCHNER.start]) {
    assert.equal(partAt(p.x, p.z), null);
    for (const ring of [KM.hall.ring, ...KM.cubes.map((c) => c.ring)]) assert.ok(distToRing(ring, p.x, p.z) > 1.2, `${p.x}, ${p.z}`);
  }
});

test('the building in Node: every vertex finite, five meshes, colliders on the two stray corners; the atlas\' cells apart', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildKirchnerMuseum, ATLAS } = await import('../js/kirchner-museum.js');
  const cells = Object.entries(ATLAS);
  for (const [k, [x, y, w, h]] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 1024, k);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [, a] = cells[i], [, b] = cells[j];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `${cells[i][0]} / ${cells[j][0]}`);
    }
  }
  const scene = new THREE.Scene();
  const { group, colliders } = buildKirchnerMuseum(scene);
  assert.equal(colliders.length, 4);
  for (const c of colliders) {
    assert.ok([c.minX, c.maxX, c.minZ, c.maxZ, c.baseY, c.maxY, c.obb.cx, c.obb.cz, c.obb.cs, c.obb.sn].every(Number.isFinite));
    assert.ok(c.maxY > c.baseY + 15 && Math.abs(Math.hypot(c.obb.cs, c.obb.sn) - 1) < 1e-9);
    // (the easel stays out of them)
    const dx = KIRCHNER.easel.x - c.obb.cx, dz = KIRCHNER.easel.z - c.obb.cz;
    const along = Math.abs(dx * c.obb.cs - dz * c.obb.sn), across = Math.abs(dx * c.obb.sn + dz * c.obb.cs);
    assert.ok(along > c.obb.hx + 0.5 || across > c.obb.hz + 0.5);
  }
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Kirchner Museum decal', 'Kirchner Museum glass', 'Kirchner Museum roof', 'Kirchner Museum skin', 'Kirchner Museum trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > KM.base - 3 && p.array[i] < 3.5, `${m.name}: a height of ${p.array[i]}`);
  }
});
