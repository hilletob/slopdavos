import test from 'node:test';
import assert from 'node:assert/strict';
import { WEBER, annexRing, clearStretches, facesBack, frontOn, groundOutlines, onWall, outwardRing, partAt, pointInRing, ringArea2, wallFrame, wallStretches } from '../js/weber-data.js';
import { WEBER as MISSION } from '../js/missions-data-local.js';
import { groundHeight } from '../js/terrain.js';

const part = (id) => WEBER.parts.find((p) => p.id === id);
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the ring? */
const isWall = (ring, a, b) => ring.some((q, i) => { const r = ring[(i + 1) % ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
/** The distance of a point from a segment */
function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
/** A point's distance from the nearest wall of the rings */
const wallDist = (rings, x, z) => Math.min(...rings.flatMap((r) => r.map((a, i) => segDist(x, z, a, r[(i + 1) % r.length]))));

test('the house\'s volumes: outlines of some size, the floors adding up to the surveyed heights', () => {
  for (const p of WEBER.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 20, `${p.id}: an outline of some size`);
    assert.ok(p.top > WEBER.base + 7, `${p.id}: its roof over the base`);
    assert.ok(p.line <= p.top && p.top - p.line < 1.0, `${p.id}: the floors end under its roof`);
    assert.ok(['pink', 'white'].includes(p.skin));
  }
  // the block: five floors over the Promenade (ground at −3.4), the ground floor at least 3.5 m, the parapet under the eave
  const block = part('block'), ground = groundHeight(639.6, -1376.6);
  assert.ok(Math.abs(ground - -3.4) < 0.3, `the Promenade at ${ground}`);
  const groundTop = block.line - 4 * WEBER.storey;
  assert.ok(groundTop - ground > 3.5 && groundTop - ground < 4.3, `the ground floor ${groundTop - ground} m`);
  assert.ok(WEBER.eave.y0 < block.top && WEBER.eave.y1 > block.top && WEBER.frieze.y0 > block.line);
  // the wing: the café and one floor over it
  const wing = part('wing');
  assert.ok(wing.line - WEBER.storey - groundHeight(630, -1360) > 3.5);
  assert.ok(block.top > wing.top && wing.top > part('garage').top);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of WEBER.parts) {
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

test('the shop fronts lie on their walls as the outward rings run them, facing the Promenade and the lane', () => {
  for (const f of WEBER.fronts) {
    const p = WEBER.parts.find((q) => isWall(q.ring, f.a, f.b));
    assert.ok(p, `${f.id}: a wall of a volume`);
    const ring = outwardRing(p.ring);
    assert.ok(ring.some((q, i) => near(q, f.a) && near(ring[(i + 1) % ring.length], f.b)), `${f.id}: a on the left`);
    assert.equal(frontOn(f.a, f.b), f);
    assert.equal(frontOn(f.b, f.a), null);
    assert.ok(f.y1 < p.line - WEBER.storey, `${f.id}: the glazing under the first floor`);
    if (f.fascia) assert.ok(f.fascia[0] > f.y1 && f.fascia[1] < p.line - WEBER.storey + 0.01);
  }
  // the bakery's and the café's face the Promenade (west-north-west), the garage's the lane (east-south-east)
  const n = (id) => { const f = WEBER.fronts.find((q) => q.id === id); return wallFrame(f.a, f.b).n; };
  assert.ok(n('bakery')[0] < -0.7 && n('cafe')[0] < -0.7 && n('garage')[0] > 0.7);
});

test('the painting lies on the block\'s front towards the Parsenn, on its stretch without windows, over the annex', () => {
  const M = WEBER.mural, block = part('block');
  assert.ok(isWall(block.ring, M.a, M.b));
  const F = wallFrame(M.a, M.b);
  assert.ok(F.n[1] < -0.7 && F.n[0] > 0.4, 'facing north-north-east');
  assert.ok(M.s0 >= M.clear[0] && M.s1 <= M.clear[1] && M.clear[1] <= F.len + 0.01);
  assert.ok(M.y1 < WEBER.frieze.y0 && M.y0 > groundHeight(...onWall(F, F.len - 1, 1)) + WEBER.annex.height);
  // (its stretch carries no windows, either way round; the rest of the wall does)
  assert.deepEqual(wallStretches(M.a, M.b).map((s) => s.windows), [true, false]);
  assert.deepEqual(wallStretches(M.b, M.a).map((s) => s.windows), [false, true]);
  // the stretch with windows holds three bays of the grid (a window and its surround 0.4 m clear of the stretch's end)
  const half = M.clear[0] / 2;
  assert.ok(WEBER.bay + WEBER.win.half + 0.12 + 0.4 <= half);
  assert.deepEqual(clearStretches([0, 0], [1, 0]), []);
  // the painting's aspect is its atlas cell's (320 × 712)
  assert.ok(Math.abs((M.s1 - M.s0) / (M.y1 - M.y0) - 320 / 712) < 0.01);
});

test('the back is white with balconies: the block\'s south-west walls, the balconies on them over the low parts', () => {
  const block = part('block'), ring = outwardRing(block.ring);
  const back = ring.map((a, i) => wallFrame(a, ring[(i + 1) % ring.length])).filter((F) => F.len > 2 && facesBack(F));
  assert.equal(back.length, 2);
  for (const F of back) assert.ok(F.n[1] > 0.7);
  const Bc = WEBER.balconies, F = wallFrame(Bc.a, Bc.b);
  assert.ok(facesBack(F) && Bc.from >= 0 && Bc.to <= F.len);
  for (const y of Bc.floors) {
    const k = (block.line - y) / WEBER.storey;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-9 && y > part('wing').top, 'a balcony at a floor\'s foot, over the wing');
  }
});

test('the annex stands before the block\'s front, clear of the Promenade\'s door and of the lane', () => {
  const ring = annexRing();
  assert.ok(Math.abs(ringArea2(ring)) / 2 > 20);
  // its middle outside the house
  const cx = ring.reduce((s, q) => s + q[0], 0) / 4, cz = ring.reduce((s, q) => s + q[1], 0) / 4;
  assert.equal(partAt(cx, cz), null);
  // the lane to the Parsennbahn (OSM's service road through (643, −1390) and (666, −1370)) keeps 3 m free
  for (const [x, z] of ring) assert.ok(segDist(x, z, [643, -1390], [666, -1370]) > 3, `${x}, ${z}`);
});

test('the mission\'s door and bike stay reachable: outside every volume, the door at the bakery\'s front, nothing in the way', async () => {
  assert.deepEqual(WEBER.door, MISSION.door);
  assert.equal(WEBER.bike.x, MISSION.bike.x);
  assert.equal(WEBER.bike.z, MISSION.bike.z);
  const rings = [...groundOutlines(), annexRing()];
  const { x, z } = MISSION.door;
  for (const r of rings) assert.ok(!pointInRing(r, x, z), 'the door outside');
  // the door's spot within a metre of the bakery's front, at its door
  const f = WEBER.fronts.find((q) => q.id === 'bakery'), F = wallFrame(f.a, f.b);
  const s = (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1], o = (x - F.a[0]) * F.n[0] + (z - F.a[1]) * F.n[1];
  assert.ok(o > 0 && o < 1, `the door's spot ${o} m before the front`);
  assert.ok(Math.abs(s - f.door) < f.doorHalf, 'before the door');
  // the walk to it from the bike: every point of the way more than 0.4 m from a wall
  const b = MISSION.bike, door = onWall(F, f.door, 0.8);
  for (let t = 0; t <= 1; t += 0.02) {
    const px = b.x + (door[0] - b.x) * t, pz = b.z + (door[1] - b.z) * t;
    assert.ok(wallDist(rings, px, pz) > 0.4, `the way at ${px.toFixed(1)}, ${pz.toFixed(1)}`);
    for (const r of rings) assert.ok(!pointInRing(r, px, pz));
  }
  // the module's colliders keep away from both
  const { colliders } = await build();
  for (const c of colliders) {
    for (const [px, pz] of [[x, z], [b.x, b.z]]) {
      const dx = Math.max(c.minX - px, 0, px - c.maxX), dz = Math.max(c.minZ - pz, 0, pz - c.maxZ);
      assert.ok(Math.hypot(dx, dz) > 2.5, 'a collider by the door or the bike');
    }
  }
});

let built = null;
async function build() {
  if (built) return built;
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildWeber } = await import('../js/weber.js');
  const scene = new THREE.Scene();
  built = buildWeber(scene);
  return built;
}

test('the building in Node: every vertex finite, six meshes, the annex\'s colliders', async () => {
  const { group, colliders } = await build();
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Weber decal', 'Weber glass', 'Weber pink', 'Weber roof', 'Weber trim', 'Weber white']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > WEBER.base - 1 && p.array[i] < 14, `${m.name}: a height of ${p.array[i]}`);
  }
  // the annex's three free walls, at world heights
  assert.equal(colliders.length, 3);
  for (const c of colliders) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > c.baseY + 3 && c.baseY < -3);
    assert.ok(Math.abs(Math.hypot(c.obb.cs, c.obb.sn) - 1) < 1e-9);
  }
  // the player's walls on the surveyed outlines (js/landmarks.js), the shops' generic signs left out (js/shops.js)
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  assert.equal(SURVEYED_FOOTPRINTS.get(WEBER.osm).length, WEBER.parts.length);
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  for (const id of WEBER.shops) assert.ok(SHOP_EXCLUSIONS.has(id));
});

test('the phone\'s profile: plain skins, no full shader but the decals\'', async () => {
  const { QUALITY } = await import('../js/quality.js');
  const THREE = await import('three/webgpu');
  const { buildWeber } = await import('../js/weber.js');
  await build();
  const was = QUALITY.simpleMaterials;
  QUALITY.simpleMaterials = true;
  try {
    const scene = new THREE.Scene();
    const { group } = buildWeber(scene);
    for (const m of group.children) {
      const mat = m.material;
      if (m.name === 'Weber decal') { assert.ok(mat.transparent && mat.opacityNode && !mat.emissiveNode); continue; }
      if (m.name === 'Weber trim') { assert.ok(!mat.colorNode && mat.vertexColors); continue; }
      assert.ok(!mat.roughnessNode && !mat.normalNode, `${m.name}: a plain skin`);
    }
  } finally {
    QUALITY.simpleMaterials = was;
  }
});
