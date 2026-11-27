import test from 'node:test';
import assert from 'node:assert/strict';
import { AMERON, bays, colliderWalls, isClosed, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame } from '../js/ameron-data.js';
import { ROADBLOCK } from '../js/missions-data-wef.js';

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the part? */
const isWall = (p, a, b) => p.ring.some((q, i) => { const r = p.ring[(i + 1) % p.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
/** Is (x, z) within `d` m of a wall of the ring? */
const nearRing = (ring, x, z, d) => ring.some((a, i) => {
  const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < d;
});

test('the AMERON\'s volumes: outlines of some size, the floors adding up to the surveyed roofs', () => {
  for (const p of AMERON.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 150, `${p.id}: an outline of some size`);
    assert.ok(p.top > p.line && p.top - p.line < 1.6, `${p.id}: the floors end under its roof, a parapet over them`);
    assert.ok(p.floor > AMERON.base && p.from > p.floor, `${p.id}: the hotel's floors over its foot`);
    const n = (p.line - p.from) / AMERON.storey;
    assert.ok(Math.abs(n - Math.round(n)) < 1e-9, `${p.id}: whole floors`);
  }
  // the east wing: the shop's ground floor and five floors; the middle block one more; the south-west wing three
  assert.equal(Math.round((part('east').line - part('east').from) / AMERON.storey), 5);
  assert.equal(Math.round((part('middle').line - part('middle').from) / AMERON.storey), 6);
  assert.equal(Math.round((part('south-west').line - part('south-west').from) / AMERON.storey), 3);
  assert.equal(part('east').from, part('middle').from, 'one grid of floors through the east wing and the middle block');
  assert.ok(part('middle').top > part('east').top && part('east').top > part('south-west').top);
  assert.equal(AMERON.exclude.length, 3);
  for (const e of AMERON.exclude) assert.ok(partAt(e.x, e.z), 'each streamed volume left out lies under the rebuilt one');
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of AMERON.parts) {
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

test('the named walls: the east face over the east wing, the street face, the Promenade, the glazed wall', () => {
  const W = AMERON.nameWall, F = wallFrame(W.a, W.b);
  assert.ok(isWall(part('middle'), W.a, W.b) && isClosed(W.b, W.a));
  assert.ok(F.n[0] > 0.9, 'the name faces east, the Promenade');
  assert.ok(W.name.w < F.len - 2 && W.name.y0 > part('east').top + 0.3 && W.name.y1 < part('middle').top - 0.2, 'over the east wing\'s roof');
  const S = AMERON.street, G = wallFrame(S.a, S.b);
  assert.ok(isWall(part('middle'), S.a, S.b));
  assert.ok(G.n[1] > 0.9, 'the street face faces south (bigger z)');
  // the entrance and the name over it where no wing stands before the face
  for (const s of [S.entrance.s - S.entrance.canopy.w / 2, S.entrance.s + S.entrance.canopy.w / 2]) {
    const [x, z] = onWall(G, s, 1.0);
    assert.equal(partAt(x, z), null, `the canopy clear of the wings at ${s}`);
  }
  assert.ok(S.parapet.y0 > part('middle').line && S.parapet.y1 < part('middle').top);
  assert.ok(S.entrance.canopy.y > S.entrance.y1 && S.entrance.y1 <= part('middle').shop.fascia[0] + 1e-9);
  const P = AMERON.promenade, E = wallFrame(P.a, P.b);
  assert.ok(isWall(part('east'), P.a, P.b) && E.n[0] > 0.9, 'the Promenade front faces east');
  const spans = [[P.doors.s - P.doors.canopy.w / 2, P.doors.s + P.doors.canopy.w / 2], [P.gate.s - P.gate.w / 2, P.gate.s + P.gate.w / 2]];
  for (const [s0, s1] of spans) assert.ok(s0 > 0.3 && s1 < E.len - 0.3, 'within the front');
  assert.ok(spans[0][0] > spans[1][1] || spans[1][0] > spans[0][1], 'the shop\'s doors and the gate apart');
  assert.ok(P.sign.y0 >= part('east').shop.fascia[0] && P.sign.y1 <= part('east').shop.fascia[1], 'the shop\'s name on its fascia');
  // (the service lane enters by the gate)
  const [gx, gz] = onWall(E, P.gate.s);
  assert.ok(Math.hypot(gx - 389, gz - -737) < 2);
  const sw = part('south-west');
  assert.ok(isWall(sw, sw.glazed.a, sw.glazed.b) && sw.glazed.y1 > sw.from + 3 && sw.glazed.y1 < sw.line - 2);
});

test('the balconies stand before windows of the south faces, under the top floor, clear of the south-west wing', () => {
  const Bc = AMERON.balconies;
  let n = 0;
  for (const W of Bc.walls) {
    const p = part(W.part), F = wallFrame(W.a, W.b);
    assert.ok(isWall(p, W.a, W.b) && F.n[1] > 0.9, `${W.part}: a wall facing the valley`);
    const list = bays(F.len, AMERON.bay, F.len / 2, AMERON.open);
    assert.ok(list.length > 5);
    for (const s of list) {
      assert.ok(s - Bc.w / 2 > 0 && s + Bc.w / 2 < F.len, 'within the wall');
      for (const y of Bc.floors) {
        const k = (y - p.from) / AMERON.storey;
        assert.ok(Math.abs(k - Math.round(k)) < 1e-9 && k >= 1, 'at a floor\'s foot over the ground floor');
        const [x, z] = onWall(F, s, Bc.out / 2);
        if (y > p.line - AMERON.storey + 0.01 || (x > Bc.low[0] && x < Bc.low[1] && y < Bc.lowFrom)) continue;
        n++;
        // (none in a wing: the south-west wing's roof lies under every balcony before it)
        const q = partAt(x, z);
        assert.ok(!q || q.top < y - 0.3, `a balcony at ${x.toFixed(1)}, ${y} in ${q && q.id}`);
      }
    }
  }
  assert.ok(n > 80, `${n} balconies`);
  const Pl = AMERON.plant, S = wallFrame(AMERON.street.a, AMERON.street.b);
  for (const s of Pl.s) for (const o of Pl.o) assert.equal(partAt(...onWall(S, s, o)), part('middle'), 'the machine room on the middle block\'s roof');
});

test('the colliders: the walls outside OpenStreetMap\'s footprint; the WEF\'s roadblock stays clear', () => {
  const C = colliderWalls();
  assert.ok(C.length >= 2);
  for (const c of C) {
    assert.ok(Number.isFinite(c.y0) && c.y1 > c.y0 + 15);
    // a wall facing open ground (not another part)
    const F = wallFrame(c.a, c.b), [x, z] = onWall(F, F.len / 2, 0.5);
    assert.equal(partAt(x, z), null);
  }
  // the south faces (2.4 m out of the footprint's) are colliders
  assert.ok(C.some((c) => near(c.a, AMERON.street.a) && near(c.b, AMERON.street.b)));
  // js/missions-data-wef.js: the roadblock on the Symondsstrasse by the Promenade, its circle off the walls
  for (const p of AMERON.parts) {
    assert.ok(!pointInRing(p.ring, ROADBLOCK.x, ROADBLOCK.z) && !nearRing(p.ring, ROADBLOCK.x, ROADBLOCK.z, ROADBLOCK.r + 1), `${p.id}`);
  }
  // the hotel's entrance: a step before it is out of every part and in reach from the street
  const G = wallFrame(AMERON.street.a, AMERON.street.b), [ex, ez] = onWall(G, AMERON.street.entrance.s, 1.5);
  assert.equal(partAt(ex, ez), null);
  assert.ok(!pointInRing(AMERON.footprint, ex, ez));
});

test('the building in Node: every vertex finite, five meshes, the colliders at world heights', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildAmeron } = await import('../js/ameron.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.ok(SHOP_EXCLUSIONS.has(AMERON.osm), 'the generic hanging sign gives way');
  const scene = new THREE.Scene();
  const { group, colliders } = buildAmeron(scene);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['AMERON decal', 'AMERON glass', 'AMERON plaster', 'AMERON roof', 'AMERON trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= AMERON.base - 0.01 && p.array[i] < 30.5, `${m.name}: a height of ${p.array[i]}`);
    // every vertex within a few metres of the surveyed volumes' extent
    for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i] > 276 && p.array[i] < 392 && p.array[i + 2] > -755 && p.array[i + 2] < -704, `${m.name}: a point at ${p.array[i]}, ${p.array[i + 2]}`);
    if (/plaster/.test(m.name)) assert.ok(m.geometry.attributes.aHalf);
  }
  assert.equal(colliders.length, colliderWalls().length);
  for (const c of colliders) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > c.minY + 15 && c.minY === AMERON.base && c.obb);
  }
});
