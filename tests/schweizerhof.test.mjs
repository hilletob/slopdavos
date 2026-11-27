import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHWEIZERHOF, arcadePieces, outOfFront, onWall, outwardRing, part, partAt, pointInRing, ringArea2, selfCrosses, wallFrame } from '../js/schweizerhof-data.js';
import { SAMD } from '../js/samd-data.js';

const S = SCHWEIZERHOF;
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the part? */
const isWall = (p, a, b) => p.ring.some((q, i) => { const r = p.ring[(i + 1) % p.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
/** The distance of a point from a ring's walls */
const distToRing = (ring, [x, z]) => Math.min(...ring.map((a, i) => {
  const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}));
const inFootprints = (q, tol) => Object.values(S.footprints).some((r) => pointInRing(r, q[0], q[1]) || distToRing(r, q) < tol);

test('the volumes: simple outlines of some size, the floors\' grids under their roofs', () => {
  for (const p of S.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 30, `${p.id}: an outline of some size`);
    assert.ok(!selfCrosses(p.ring), `${p.id}: no wall crosses another`);
    assert.ok(p.top > S.base + 10, `${p.id}: its roof over the base`);
    assert.ok(p.line <= p.top + 0.25 && p.top - p.line < 0.6, `${p.id}: the floors end at its roof`);
    if (p.shop) assert.ok(p.shop > 3 && p.shop < p.line && p.style === 'modern');
  }
  // the exclusion catches the one batch, not the SAMD's 70 m east
  assert.equal(S.exclude.r, 3);
  assert.ok(Math.hypot(SAMD.exclude.x - S.exclude.x, SAMD.exclude.z - S.exclude.z) > 60);
  // the tall block: seven floors over the Promenade (y −1.1), its ground floor's foot within a metre of the street
  const h = S.storey.hotel, tower = part('tower');
  assert.ok(Math.abs(tower.line - 7 * h - -1.1) < 1.0);
  // the north wing: the ground floor and two over it; the front's band two floors under the terrace, the body's
  // second floor over it
  assert.ok(Math.abs(part('north-wing').line - 3 * h - -1.2) < 0.2);
  assert.ok(Math.abs(part('body').line - part('band').line - h) < 0.01);
  // the south house: the glazed ground floor and three over it
  assert.ok(Math.abs(part('south').line - 3 * S.storey.modern - part('south').shop) < 0.01);
  assert.ok(part('head').top > tower.top && part('head').windows === false);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of [...S.parts, { id: 'porch', ring: S.porch.ring }]) {
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

test('what stands outside OpenStreetMap\'s footprints is a collider or over the pavement\'s head height; nothing reaches the SAMD', () => {
  const A = S.arcade;
  for (const p of S.parts) {
    if (p.collide) continue;
    for (const q of p.ring) {
      const arcade = p.id === A.part && outOfFront(q) > 0.3;
      // (or walled in by the colliders' parts: the tall block's sliver over the west annex)
      const walled = S.parts.some((c) => c.collide && distToRing(c.ring, q) < 0.1);
      assert.ok(arcade || walled || inFootprints(q, 1.0), `${p.id}: the corner ${q} within OpenStreetMap's footprints`);
    }
  }
  // the parts outside them are colliders (most of their outline out of the footprints)
  for (const p of S.parts.filter((q) => q.collide)) assert.ok(p.ring.some((q) => !inFootprints(q, 0.3)), `${p.id}: really outside`);
  // the porch stands inside the hotel's footprint (its east side reaching into the west block)
  for (const q of S.porch.ring) assert.ok(pointInRing(S.footprints.hotel, q[0], q[1]) || distToRing(S.footprints.hotel, q) < 0.3);
  assert.equal(partAt(...S.porch.ring[0]), part('west-block'));
  // the SAMD (js/samd.js) lies east of every corner of ours, and none of its corners in our parts
  const ours = S.parts.flatMap((p) => p.ring), its = SAMD.parts.flatMap((p) => p.ring);
  assert.ok(Math.max(...ours.map((q) => q[0])) + 3 < Math.min(...its.map((q) => q[0])));
  for (const q of its) assert.equal(partAt(q[0], q[1]), null);
});

test('the arcade: the band\'s west wall over the pavement, the shops\' front on OpenStreetMap\'s wall under the soffit', () => {
  const A = S.arcade, band = part(A.part);
  assert.ok(isWall(band, A.wall[0], A.wall[1]));
  const W = wallFrame(...A.wall), Fr = wallFrame(...A.front);
  assert.ok(W.n[0] < -0.9 && Fr.n[0] < -0.9, 'both face the Promenade (west)');
  // the wall stands 1–2.5 m out of the front its whole length
  for (const q of A.wall) assert.ok(outOfFront(q) > 1.0 && outOfFront(q) < 2.5);
  assert.deepEqual(arcadePieces(...A.wall).map((p) => p.open), [true]);
  // the front is OpenStreetMap's west wall (w123380406), within a few decimetres
  for (const q of A.front) assert.ok(distToRing(S.footprints.hotel, q) < 0.4, `the front's end ${q}`);
  // the band's south wall: open over the pavement, closed behind the front
  const R = outwardRing(band.ring), i = R.findIndex((q) => near(q, [-628.0, 125.5]));
  const pcs = arcadePieces(R[i], R[(i + 1) % R.length]);
  assert.equal(pcs.length, 2);
  assert.ok(pcs.find((p) => p.open).to - pcs.find((p) => p.open).from < 2.5);
  // js/shops.js' boards on the hotel's footprint (Angerer Sport, the Amavita): 4.5 m over the street, 0.62 m high,
  // they hang on the fascia, under the soffit and before the glass
  assert.ok(A.fascia < A.street + 4.5 && A.soffit > A.street + 4.5 + 0.62 + 0.2);
  for (const [x, z] of [[-619.4, 97.1], [-619.9, 119.2]]) {
    // (their wall: the footprint's west wall; the board 0.14 m out of it)
    const F = wallFrame([-621.3, 72.4], [-626.8, 125.3]), t = ((x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1]);
    const board = onWall(F, t, 0.14);
    assert.ok(outOfFront(board) > 0 && outOfFront(board) < 0.4, `a board at ${outOfFront(board)} m before the shops`);
  }
});

test('the porch, the balconies, the names and the board lie on their walls', () => {
  const P = S.porch, F = wallFrame(...P.front);
  assert.ok(F.n[0] < -0.9, 'the porch\'s front faces the Promenade');
  assert.ok(P.door.w < F.len - 1 && P.name.w < F.len && P.name.y0 > P.fascia && P.name.y1 < P.top && P.y0 + 0.15 + P.door.h < P.fascia);
  // before the doors: the pavement, no part of the building
  { const [x, z] = onWall(F, F.len / 2, 1.5); assert.equal(partAt(x, z), null); assert.ok(!pointInRing(P.ring, x, z)); }
  // the balconies on the tall block's south face, at its floors' feet, over the yard and the east link
  const Bc = S.balconies, tower = part('tower'), Bf = wallFrame(Bc.a, Bc.b);
  assert.ok(isWall(tower, Bc.a, Bc.b) && Bf.n[1] > 0.9);
  for (const run of Bc.runs) {
    assert.ok(run.s0 >= 0 && run.s1 <= Bf.len && run.s1 - run.s0 > 8);
    for (const y of run.floors) {
      const k = (tower.line - y) / S.storey.hotel;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6 && y < tower.top - 2, `a balcony at ${y}`);
      // nothing of the hotel under a balcony's front edge reaches up to it
      for (const s of [run.s0 + 0.5, (run.s0 + run.s1) / 2, run.s1 - 0.5]) {
        const [x, z] = onWall(Bf, s, Bc.out - 0.2), q = partAt(x, z);
        assert.ok(!q || q.top < y - 0.2, `the balcony at ${y}, ${s} m: ${q?.id}`);
      }
    }
  }
  for (const N of S.names) {
    const p = part(N.part), W = wallFrame(N.a, N.b);
    assert.ok(isWall(p, N.a, N.b) && N.w < W.len - 1);
    for (const s of [(W.len - N.w) / 2, (W.len + N.w) / 2]) assert.equal(partAt(...onWall(W, s, -N.back - 0.1)), p, `${N.part}: the letters on its roof`);
  }
  assert.ok(wallFrame(S.names[0].a, S.names[0].b).n[0] < -0.9, 'the west block\'s name to the Promenade');
  const D = S.board, south = part('south');
  assert.ok(isWall(south, D.a, D.b) && wallFrame(D.a, D.b).n[0] < -0.9);
  assert.ok(D.s0 + D.w < wallFrame(D.a, D.b).len && D.y0 > south.shop && D.y0 + D.h < south.shop + S.storey.modern);
});

test('the atlas: cells inside it, none overlapping', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const { ATLAS } = await import('../js/schweizerhof.js');
  const cells = Object.entries(ATLAS);
  for (const [k, c] of cells) assert.ok(c[0] >= 0 && c[1] >= 0 && c[0] + c[2] <= 1024 && c[1] + c[3] <= 512, k);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [, a] = cells[i], [, b] = cells[j];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `${cells[i][0]} and ${cells[j][0]}`);
    }
  }
  // the letters' cells as wide as the letters on the walls (within a tenth)
  const aspect = (k) => ATLAS[k][2] / ATLAS[k][3];
  for (const N of S.names) assert.ok(Math.abs(aspect('name') / (N.w / N.h) - 1) < 0.1);
  assert.ok(Math.abs(aspect('porch') / (S.porch.name.w / (S.porch.name.y1 - S.porch.name.y0)) - 1) < 0.1);
  assert.ok(Math.abs(aspect('board') / (S.board.w / S.board.h) - 1) < 0.1);
  assert.ok(Math.abs(aspect('door') / (S.porch.door.w / S.porch.door.h) - 1) < 0.1);
});

test('the building in Node: every vertex finite, six meshes, the hotel\'s sign left to its own lettering, the colliders', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildSchweizerhof } = await import('../js/schweizerhof.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.ok(SHOP_EXCLUSIONS.has(S.osm));
  const scene = new THREE.Scene();
  const { group, colliders } = buildSchweizerhof(scene);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Hotel Schweizerhof decal', 'Hotel Schweizerhof glass', 'Hotel Schweizerhof hotel', 'Hotel Schweizerhof modern', 'Hotel Schweizerhof roof', 'Hotel Schweizerhof trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > S.base - 0.5 && p.array[i] < 23.5, `${m.name}: a height of ${p.array[i]}`);
    // every vertex within the survey's extent (x −629.9 to −562.7, z 38 to 149.8), a little more for the trim
    for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i] > -631.5 && p.array[i] < -561.5 && p.array[i + 2] > 37 && p.array[i + 2] < 151, `${m.name}: a point at ${p.array[i]}, ${p.array[i + 2]}`);
    if (/hotel$|modern$/.test(m.name)) assert.ok(m.geometry.attributes.aHalf, `${m.name}: the walls carry their bays' half`);
  }
  const n = S.parts.filter((p) => p.collide).reduce((s, p) => s + p.ring.length, 0);
  assert.equal(colliders.length, n);
  for (const c of colliders) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > c.minY + 10 && c.minY === S.base && c.obb && Math.abs(Math.hypot(c.obb.cs, c.obb.sn) - 1) < 1e-9);
  }
});
