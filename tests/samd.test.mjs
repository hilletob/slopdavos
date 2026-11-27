import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMD, onWall, outwardRing, partAt, pointInRing, ringArea2, wallFrame, wallStretches } from '../js/samd-data.js';
import { ROOF, DOOR, eyeAt, yardToWorld } from '../js/missions-data-samd.js';

const part = (id) => SAMD.parts.find((p) => p.id === id);
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the part? */
const isWall = (p, a, b) => p.ring.some((q, i) => { const r = p.ring[(i + 1) % p.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });

test('the SAMD\'s volumes: outlines of some size, the floors\' grid under every roof', () => {
  for (const p of SAMD.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 15, `${p.id}: an outline of some size`);
    assert.ok(p.top > SAMD.base + 5, `${p.id}: its roof over the base`);
    // the floor line lies under the roof (a parapet's height over it) or, the attic's, within a window's lintel of it
    if (p.windows !== false) assert.ok(p.line <= p.top + 0.25 && p.top - p.line < 1.6, `${p.id}: the floors end at its roof`);
  }
  // the block's six floors over the yard (y −10.7), the attic one floor over them
  const line = part('block-west').line;
  assert.equal(part('block-east').line, line);
  assert.ok(Math.abs(line - 6 * SAMD.storey - -10.7) < 0.05);
  assert.ok(Math.abs(part('attic').line - line - SAMD.storey) < 1e-9);
  assert.ok(part('attic').top > part('block-east').top && part('block-east').top > part('block-west').top);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of SAMD.parts) {
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

test('the tower\'s strip and the names lie on their walls, facing the yard, on stretches without windows', () => {
  const T = SAMD.tower, attic = part('attic');
  // the tower's north face: the attic's wall, facing north; the strip within it, from the yard up to under the head
  assert.ok(isWall(attic, T.north.a, T.north.b));
  const N = wallFrame(T.north.a, T.north.b);
  assert.ok(N.n[1] < -0.8, 'facing the yard (north)');
  assert.ok(T.north.strip.half * 2 < N.len - 0.6 && T.north.strip.y1 < attic.top && T.north.strip.y0 > -10.7);
  // the head's west face: the name over the block's roof, no window behind it
  assert.ok(isWall(attic, T.west.a, T.west.b));
  const W = wallFrame(T.west.a, T.west.b), n = T.west.name;
  assert.ok(W.n[0] < -0.8, 'facing west, over the block\'s west half');
  assert.ok(n.at >= 0 && n.at + n.w <= W.len && n.y0 > part('block-west').top && n.y1 < attic.top);
  assert.ok(wallStretches(T.west.a, T.west.b).every((s) => !s.windows) && wallStretches(T.west.b, T.west.a).every((s) => !s.windows));
  assert.ok(partAt(...onWall(W, T.flag.s, -1.0)) === attic, 'the flag\'s pole stands on the head');
  // the north wing's wall
  const wing = part('north-wing'), L = SAMD.nameWall;
  assert.ok(isWall(wing, L.a, L.b));
  const F = wallFrame(L.a, L.b);
  assert.ok(F.n[1] < -0.8 && L.name.w < F.len - 1 && L.name.y1 < wing.line - SAMD.storey + 0.5 && L.name.y0 > wing.line - 2 * SAMD.storey - 0.2, 'the name on the middle floor');
  assert.deepEqual(wallStretches(L.b, L.a).map((s) => s.windows), [false]);
  for (const [s, half] of L.windows) assert.ok(s - half > 0.5 && s + half < F.len - 0.5);
  // (and a wall with windows is cut once, in order)
  const st = wallStretches([-519.7, 92.7], [-502.1, 99.7]);
  assert.deepEqual(st.map((s) => s.windows), [true]);
});

test('the porch stands in the corner between the block and the north wing; the balconies on the block\'s south wall', () => {
  const P = SAMD.porch;
  assert.ok(Math.abs(ringArea2(P.ring)) / 2 > 20);
  assert.ok(P.ring.some((q) => part('north-wing').ring.some((r) => near(q, r))), 'it meets the wing');
  const F = wallFrame(P.front.a, P.front.b);
  assert.ok(F.n[1] < -0.8, 'its front faces the yard');
  const [x, z] = onWall(F, F.len / 2, 0.3);
  assert.ok(!pointInRing(P.ring, x, z) && !partAt(x, z));
  const B = SAMD.balconies;
  assert.ok(isWall(part('block-east'), B.a, B.b));
  const S = wallFrame(B.a, B.b);
  assert.ok(S.n[1] > 0.8 && B.from >= 0 && B.to <= S.len);
  for (const y of B.floors) assert.ok(Math.abs((part('block-east').line - y) / SAMD.storey - Math.round((part('block-east').line - y) / SAMD.storey)) < 1e-9, 'a balcony at a floor');
});

test('the mission\'s roof is the block\'s west half: the eye lies on it at the edge over the yard, the door before the porch', () => {
  const roof = part(SAMD.roof.part);
  assert.equal(roof.top, SAMD.roof.top);
  // the yard's ground at the facade, as the terrain has it (y −10.7): the eye half a metre over the roof
  const ground = () => -10.7;
  const eye = eyeAt(ground);
  // (the head out over the edge, the body on the roof behind it: with the eye behind the edge the roof fills the view)
  assert.equal(partAt(eye.x, eye.z), null, 'the head out over the yard');
  assert.ok(ROOF.eyeBack < 0 && ROOF.eyeBack > -0.5);
  { const p = yardToWorld(0, -0.5); assert.ok(partAt(p.x, p.z) === roof, 'the body on the roof'); }
  assert.ok(Math.abs(eye.y - (SAMD.roof.top + ROOF.eyeUp)) < 0.05, `the eye at ${eye.y}`);
  // a metre out over the edge there is nothing of the building, nor further out where the gobs land
  for (const v of [1, 4, 12, 30]) { const p = yardToWorld(0, v); assert.equal(partAt(p.x, p.z), null, `v ${v}`); }
  // no roof stands in the view over the yard's range: the tower's head is to the east, behind the eye's line
  for (const u of [-30, -15, 0, 15, 30]) { const p = yardToWorld(u, 8); const q = partAt(p.x, p.z); assert.ok(!q || q.top < SAMD.roof.top, `u ${u}`); }
  // the side door: outside the building and the porch, within reach of the porch's front
  assert.equal(partAt(DOOR.x, DOOR.z), null);
  assert.ok(!pointInRing(SAMD.porch.ring, DOOR.x, DOOR.z));
  const F = wallFrame(SAMD.porch.front.a, SAMD.porch.front.b), [fx, fz] = onWall(F, F.len / 2);
  assert.ok(Math.hypot(DOOR.x - fx, DOOR.z - fz) < 5);
});

test('the building in Node: every vertex finite, five meshes, no colliders of its own', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildSamd } = await import('../js/samd.js');
  const scene = new THREE.Scene();
  const { group, colliders } = buildSamd(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['SAMD decal', 'SAMD glass', 'SAMD plaster', 'SAMD roof', 'SAMD trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > SAMD.base - 3 && p.array[i] < 22, `${m.name}: a height of ${p.array[i]}`);
  }
});
