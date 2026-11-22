import test from 'node:test';
import assert from 'node:assert/strict';
import { SPITAL, SPITAL_ENTRANCE, hallFrame, onWall, outwardRing, pointInRing, ringArea2, wallFrame, wallStretches } from '../js/spital-data.js';
import { HELIPAD } from '../js/helipad.js';
import { SPITAL as CAST } from '../js/missions-data-care.js';

const part = (id) => SPITAL.parts.find((p) => p.id === id);

test('the Spital\'s volumes: simple outlines, the floors\' grid, the Rega pad on the west wing\'s roof', () => {
  for (const p of SPITAL.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 60, `${p.id}: an outline of some size`);
    assert.ok(p.top > SPITAL.base + 5, `${p.id}: its roof over the base`);
  }
  // the wing's roof three floors under the ward block's, the rim one
  const { top, storey } = SPITAL.floors;
  assert.equal(part('ward-block').top, top);
  assert.ok(Math.abs(part('west-wing').top - (top - 3 * storey)) < 0.01);
  assert.ok(Math.abs(part('rim').top - (top - storey)) < 0.01);
  // the pad (js/helipad.js) stands on the wing, 2 m over its roof
  assert.ok(pointInRing(part('west-wing').ring, HELIPAD.x, HELIPAD.z));
  assert.ok(Math.abs(HELIPAD.y - part('west-wing').top - 2.05) < 0.1);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of SPITAL.parts) {
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

test('the reliefs lie on walls of the ward block, on stretches without windows', () => {
  const block = outwardRing(part('ward-block').ring);
  for (const m of SPITAL.murals) {
    const i = block.findIndex((p, k) => { const q = block[(k + 1) % block.length]; return Math.hypot(p[0] - m.a[0], p[1] - m.a[1]) < 0.05 && Math.hypot(q[0] - m.b[0], q[1] - m.b[1]) < 0.05; });
    assert.ok(i >= 0, `${m.key}: its wall is one of the block's, running the block's way`);
    const F = wallFrame(m.a, m.b);
    assert.ok(m.at >= 0 && m.at + m.w <= F.len, `${m.key}: within the wall's length`);
    assert.ok(m.y + m.h <= SPITAL.floors.top, `${m.key}: under the roof`);
    const closed = wallStretches(m.a, m.b).filter((s) => !s.windows);
    assert.ok(closed.some((s) => s.from <= m.at + 0.01 && s.to >= m.at + m.w - 0.01), `${m.key}: no window behind it`);
  }
  // (and the stretches cover a wall once, in order)
  const st = wallStretches([-1104.2, 893.7], [-1099.1, 923.8]);
  assert.deepEqual(st.map((s) => s.windows), [false, true, false]);
  assert.ok(Math.abs(st.at(-1).to - Math.hypot(5.1, 30.1)) < 0.01);
  for (let i = 1; i < st.length; i++) assert.equal(st[i].from, st[i - 1].to);
});

test('the entrance hall stands before the west wing on the forecourt, its doors at the plaster room\'s door', () => {
  const H = SPITAL.hall, F = hallFrame(), wing = part('west-wing').ring;
  // the wall it stands on is the wing's, and it stands outside of it
  assert.ok(wing.some((p) => Math.hypot(p[0] - H.a[0], p[1] - H.a[1]) < 0.05) && wing.some((p) => Math.hypot(p[0] - H.b[0], p[1] - H.b[1]) < 0.05));
  assert.ok(H.to <= F.len && H.from >= 0);
  for (const s of [H.from + 0.5, H.door, H.to - 0.5]) {
    assert.ok(!SPITAL.parts.some((p) => pointInRing(p.ring, ...onWall(F, s, H.depth / 2))), `the hall at ${s} m is clear of the house`);
    assert.ok(pointInRing(wing, ...onWall(F, s, -1)), 'the wing behind it');
  }
  assert.ok(H.canopy.from < H.door - H.doorWidth / 2 && H.canopy.to > H.door + H.doorWidth / 2, 'the canopy over the doors');
  assert.ok(H.top < part('west-wing').top + 7 + 0.01, 'under the wing\'s roof (the forecourt lies ~7 m under the frame\'s zero)');
  // the mission's door (cast-spital) is reached from before the hall's doors
  assert.ok(Math.hypot(SPITAL_ENTRANCE.x - CAST.door.x, SPITAL_ENTRANCE.z - CAST.door.z) < CAST.door.r - 0.5);
  const reach = onWall(F, H.door, H.depth + 0.4); // (as near as the hall's wall lets the player)
  assert.ok(Math.hypot(reach[0] - CAST.door.x, reach[1] - CAST.door.z) < CAST.door.r);
});

test('every vertex of the Spital is finite, the meshes are few, the colliders have their heights', async () => {
  const doc = globalThis.document;
  // (no canvas in Node: the atlas is drawn into a stand-in)
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : typeof k === 'string' ? (t[k] ??= () => {}) : undefined), set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
  try {
    const { buildSpital } = await import('../js/spital.js');
    const { group, colliders } = buildSpital({ add() {} });
    let meshes = 0;
    group.traverse((o) => {
      if (!o.geometry) return;
      meshes++;
      const p = o.geometry.attributes.position.array;
      assert.ok(p.length > 0 && p.length % 9 === 0, `${o.name}: whole triangles`);
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${o.name}: vertex ${Math.floor(i / 3)} is not finite`);
    });
    assert.equal(meshes, 5, 'walls, roofs, glass, trim, decals');
    assert.ok(colliders.length >= 10);
    for (const c of colliders) {
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'minY', 'maxY', 'baseY']) assert.ok(Number.isFinite(c[k]));
      assert.ok(c.maxY > c.minY && c.maxX > c.minX && c.maxZ > c.minZ);
    }
  } finally {
    globalThis.document = doc;
  }
});

test('a wall under the Rega pad is measured from the ground, not from the pad (no wall over the pad)', async () => {
  const { addPlatform, liftColliders, groundHeight, surfaceHeight } = await import('../js/terrain.js');
  const { x, z, radius, y } = HELIPAD;
  addPlatform(x, z, radius, y);
  assert.ok(Math.abs(surfaceHeight(x, z) - y) < 0.01, 'the pad is a surface to land on');
  const [c] = liftColliders([{ minX: x - 5, maxX: x + 5, minZ: z - 0.2, maxZ: z + 0.2, maxY: 9 }]);
  const ground = Math.max(...[-5, 0, 5].flatMap((dx) => [-0.2, 0, 0.2].map((dz) => groundHeight(x + dx, z + dz))));
  assert.ok(c.maxY <= ground + 9.5, `the wall's top ${c.maxY.toFixed(1)} is 9 m over the ground (${ground.toFixed(1)}), not over the pad (${y})`);
});
