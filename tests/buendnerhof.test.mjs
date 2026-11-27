import test from 'node:test';
import assert from 'node:assert/strict';
import { BUENDNERHOF, balconiesOf, groundOutlines, isBalconyWall, isEntrance, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame, wallStretches } from '../js/buendnerhof-data.js';
import { groundHeight } from '../js/terrain.js';
import { PFADIHEIM_DOOR, PFADIHEIM_START } from '../js/pfadiheim-data.js';

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the part? */
const isWall = (p, a, b) => p.ring.some((q, i) => { const r = p.ring[(i + 1) % p.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
/** The wall a → b as the part's outward ring runs it */
const frameOf = (p, a, b) => {
  const R = outwardRing(p.ring);
  const i = R.findIndex((q, k) => { const r = R[(k + 1) % R.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
  return wallFrame(R[i], R[(i + 1) % R.length]);
};
/** Is (x, z) within `d` m of a wall of the ring? */
const nearRing = (ring, x, z, d) => ring.some((a, i) => {
  const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < d;
});

test('the Bündnerhof\'s volumes: outlines of some size, the floors adding up to the surveyed roofs', () => {
  const S = BUENDNERHOF.storey;
  for (const p of BUENDNERHOF.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 40, `${p.id}: an outline of some size`);
    assert.ok(p.top > p.line && p.top - p.line < 1.6, `${p.id}: the floors end under its roof, a band under the eave`);
    assert.ok(p.from > BUENDNERHOF.base, `${p.id}: its floors over the base`);
  }
  // the main block: a ground floor and five floors (20.8 m from its lowest foot to the roof); the wings two floors each;
  // the hall one tall floor
  const n = (p) => (p.line - p.from) / S;
  assert.ok(Math.abs(n(part('main')) - 6) < 1e-9);
  assert.ok(Math.abs(n(part('wing-east')) - 2) < 1e-9 && Math.abs(n(part('wing-south')) - 2) < 1e-9);
  assert.ok(part('hall').glazed && part('hall').line - part('hall').from > 3.5);
  assert.ok(part('main').top > part('hall').top && part('hall').top > part('wing-east').top);
  assert.equal(BUENDNERHOF.exclude.length, 4);
  for (const e of BUENDNERHOF.exclude) assert.ok(partAt(e.x, e.z), 'each streamed volume left out lies under the rebuilt one');
  // (the outlines the player's walls stand on: every part)
  assert.equal(groundOutlines().length, BUENDNERHOF.parts.length);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of BUENDNERHOF.parts) {
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

test('the entrance front: the main block\'s middle facing north-north-east, the name over the wide windows', () => {
  const En = BUENDNERHOF.entrance, main = part('main'), S = BUENDNERHOF.storey;
  assert.ok(isWall(main, En.a, En.b) && isEntrance(En.b, En.a));
  const F = frameOf(main, En.a, En.b);
  assert.ok(F.n[1] < -0.7 && F.n[0] > 0.4, 'facing north-north-east (smaller z)');
  assert.ok(near(F.a, En.a), 'a on the left for someone before it');
  const mid = F.len / 2;
  // the canopy, the low windows and the wide windows within the wall and apart
  assert.ok(En.canopy.w / 2 < mid - 0.3 && En.low.at + En.low.half < mid - 0.3 && En.wide.at + En.wide.half < mid - 0.3);
  assert.ok(En.low.at - En.low.half > En.door.w / 2 + 0.2, 'the low windows clear of the doors');
  assert.ok(En.wide.at - En.wide.half > 0.2, 'the two wide windows apart');
  assert.ok(En.name.w < F.len - 1);
  const wideTop = main.from + Math.max(...En.wide.floors) * S + En.wide.hi;
  const nextSill = main.from + En.floors * S + BUENDNERHOF.win.lo;
  assert.ok(En.name.y0 > wideTop && En.name.y1 < nextSill, 'the name between the wide windows and the windows over them');
  assert.ok(Math.max(...En.wide.floors) < En.floors);
  // a step before the doors is out of every part, on the ground under the ground floor's foot + a step
  const [x, z] = onWall(F, mid, 1.5);
  assert.equal(partAt(x, z), null);
  assert.ok(Math.abs(groundHeight(x, z) - main.from) < 1.2, 'the doors on the path\'s level');
});

test('the windows clear the ground and the lower roofs before them', () => {
  for (const p of BUENDNERHOF.parts) {
    if (p.glazed) continue;
    const R = outwardRing(p.ring);
    for (let i = 0; i < R.length; i++) {
      const a = R[i], b = R[(i + 1) % R.length], F = wallFrame(a, b);
      if (F.len < 2.4) continue;
      const win = isBalconyWall(a, b) ? BUENDNERHOF.door : BUENDNERHOF.win;
      const st = wallStretches(p, F, groundHeight, win);
      assert.ok(Math.abs(st[0].s0) < 1e-9 && Math.abs(st[st.length - 1].s1 - F.len) < 1e-9, 'the stretches cover the wall');
      for (const t of st) {
        const k = (t.fromY - p.from) / BUENDNERHOF.storey;
        assert.ok(Math.abs(k - Math.round(k)) < 1e-9 && k >= 0, 'on the floors\' grid');
        for (let s = t.s0; s <= t.s1; s += 0.5) {
          const [x, z] = onWall(F, s, 0.5), q = partAt(x, z, p);
          const under = Math.max(groundHeight(x, z), q ? q.top : -Infinity);
          assert.ok(t.fromY + win.lo >= under + 0.1 - 1e-9, `${p.id} wall ${i}: a sill at ${t.fromY + win.lo} over ${under}`);
        }
      }
    }
  }
  // the west half of the north-north-east front stands on rising ground: its lowest floor closed there
  const main = part('main'), F = frameOf(main, [-363.6, -299.6], [-374.7, -307.3]);
  const st = wallStretches(main, F, groundHeight);
  assert.ok(st.some((t) => t.fromY > main.from));
});

test('the balconies hang before the west end and the south-south-west faces, clear of what stands under them', () => {
  const main = part('main'), Bc = BUENDNERHOF.balconies;
  let n = 0;
  for (const [a, b] of Bc.walls) {
    assert.ok(isWall(main, a, b) && isBalconyWall(b, a));
    const F = frameOf(main, a, b);
    assert.ok(F.n[1] > 0.5 || F.n[0] < -0.75, 'facing south-south-west or west-north-west');
    for (const q of balconiesOf(main, F, groundHeight)) {
      n++;
      assert.ok(q.s0 > 0 && q.s1 < F.len, 'within the wall');
      const k = (q.y - main.from) / BUENDNERHOF.storey;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-9 && k >= 1 && k <= 5, 'at a floor\'s foot, the first to the top floor');
      for (const s of [q.s0, (q.s0 + q.s1) / 2, q.s1]) {
        const [x, z] = onWall(F, s, Bc.out);
        const p = partAt(x, z, main);
        assert.ok(q.y - Math.max(groundHeight(x, z), p ? p.top : -Infinity) >= Bc.clear - 1e-9, `a balcony at ${q.y} over the ground or a roof`);
      }
    }
  }
  assert.ok(n > 40, `${n} balconies`);
  // none before the entrance front
  const En = BUENDNERHOF.entrance;
  assert.ok(!isBalconyWall(En.a, En.b));
});

test('the Pfadiheim next door and its mission\'s start stay clear', () => {
  for (const pt of [PFADIHEIM_DOOR, PFADIHEIM_START]) {
    for (const p of BUENDNERHOF.parts) assert.ok(!pointInRing(p.ring, pt.x, pt.z) && !nearRing(p.ring, pt.x, pt.z, 3), `${p.id}`);
  }
});

test('the building in Node: every vertex finite, six meshes, no colliders of its own', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildBuendnerhof, ATLAS } = await import('../js/buendnerhof.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  assert.ok(SHOP_EXCLUSIONS.has(BUENDNERHOF.osm), 'the generic hanging sign gives way');
  assert.equal(SURVEYED_FOOTPRINTS.get(BUENDNERHOF.osm).length, BUENDNERHOF.parts.length);
  for (const [x, y, w, h] of Object.values(ATLAS)) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 256);
  const scene = new THREE.Scene();
  const { group, colliders } = buildBuendnerhof(scene);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Bündnerhof decal', 'Bündnerhof glass', 'Bündnerhof loggia', 'Bündnerhof plaster', 'Bündnerhof roof', 'Bündnerhof trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= BUENDNERHOF.base - 0.01 && p.array[i] < 2.0, `${m.name}: a height of ${p.array[i]}`);
    for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i] > -398 && p.array[i] < -336 && p.array[i + 2] > -310 && p.array[i + 2] < -253, `${m.name}: a point at ${p.array[i]}, ${p.array[i + 2]}`);
    if (/plaster|loggia/.test(m.name)) assert.ok(m.geometry.attributes.aHalf);
  }
  assert.deepEqual(colliders, []);
});
