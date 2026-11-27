import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_HOTEL, balconyWalls, entranceWall, floorFeet, inside, onWall, outwardRing, pointInRing, ringArea2, wallFrame, walls } from '../js/club-hotel-data.js';
import { groundHeight } from '../js/terrain.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const H = CLUB_HOTEL;
const ringOf = (id) => { const b = DAVOS_DATA.buildings.find((q) => q.id === id), out = []; for (let i = 0; i < b.ring.length; i += 2) out.push([b.ring[i], b.ring[i + 1]]); return out; };

test('the Club Hotel\'s volume: an outline of some size, its roof over the ground, the floors adding up', () => {
  assert.ok(H.ring.length >= 4 && Math.abs(ringArea2(H.ring)) / 2 > 300, 'the survey\'s 355 m²');
  assert.ok(Math.abs(Math.abs(ringArea2(H.ring)) / 2 - 355) < 15);
  assert.ok(inside(H.exclude.x, H.exclude.z), 'the excluded batch\'s centre lies in it');
  // the ground floor from the survey's floor, five storeys over it ending under the coping
  assert.ok(Math.abs(H.ground + 5 * H.storey - H.line) < 1e-9);
  assert.deepEqual(floorFeet(), [0.9, 3.7, 6.5, 9.3, 12.1]);
  assert.ok(H.top - H.line > 0 && H.top - H.line < 0.5, 'the coping over the top floor');
  assert.ok(H.ground - H.floor >= H.storey && H.ground - H.floor < 3.8, 'a taller ground floor');
  // six floors over the Promenade (the south-east corner), the ground there at the survey's floor
  assert.ok(Math.abs(groundHeight(-911, 600) - H.floor) < 0.3);
  // the walls reach under the lowest ground round the house
  for (const [x, z] of H.ring) assert.ok(groundHeight(x, z) > H.base + 0.5, `the ground at ${x} ${z}`);
  assert.ok(WIN_FITS(), 'a window fits a storey');
});
const WIN_FITS = () => H.win.lo > 0.3 && H.win.hi < H.storey - 0.3 && H.win.half * 2 + 0.8 < H.bay;

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  const R = outwardRing(H.ring);
  let out = 0, n = 0;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.9) continue;
    n++;
    const [x, z] = onWall(F, F.len / 2, 0.2), [xi, zi] = onWall(F, F.len / 2, -0.2);
    if (!pointInRing(H.ring, x, z) && pointInRing(H.ring, xi, zi)) out++;
  }
  assert.equal(out, n);
  assert.equal(walls().length, H.ring.length);
});

test('the balconies: before the stepped south front, high enough over the ground, outside the house', async () => {
  const { balconyFloors } = await loadModule();
  const B = balconyWalls();
  assert.equal(B.length, 5, 'four steps and the corner on the Promenade');
  for (const { F } of B) {
    assert.ok(F.n[1] > 0.5, 'facing south');
    const fl = balconyFloors(F);
    assert.ok(fl.length >= 4, 'at least four floors of balconies');
    for (const y of fl) {
      assert.ok(floorFeet().includes(y));
      for (let s = 0; s <= F.len; s += F.len / 4) {
        const [x, z] = onWall(F, s, H.balconies.out);
        assert.ok(y - H.balconies.slab - groundHeight(x, z) >= H.balconies.clear - 1e-6, 'one walks under it');
        const [mx, mz] = onWall(F, Math.min(Math.max(s, 0.3), F.len - 0.3), H.balconies.out / 2);
        assert.ok(!pointInRing(H.ring, mx, mz), 'out of the walls');
      }
    }
  }
});

test('the entrance: on the east face over the Promenade, its glazing and canopy within the wall', () => {
  const E = entranceWall();
  assert.ok(E && E.F.n[0] > 0.8 && E.F.len > 12, 'the long east face');
  assert.ok(H.entrance.glazing < E.F.len - 4 && H.entrance.canopy.w < H.entrance.glazing && H.entrance.doors < H.entrance.canopy.w);
  const [x, z] = onWall(E.F, E.F.len / 2, 2.5);
  assert.ok(Math.abs(groundHeight(x, z) - H.floor) < 0.5, 'the ground before it at the ground floor\'s level');
  assert.ok(H.entrance.canopy.y > 2.6 && H.entrance.canopy.y + H.entrance.canopy.thick < H.ground - H.floor + 0.6);
});

test('the neighbours: the house and its balconies and canopy clear of the fire station and the other houses round it', () => {
  const pts = [...H.ring];
  for (const { F } of balconyWalls()) for (const s of [0, F.len]) pts.push(onWall(F, s, H.balconies.out));
  const E = entranceWall(), K = H.entrance.canopy, m = E.F.len / 2;
  for (const s of [m - K.w / 2, m + K.w / 2]) pts.push(onWall(E.F, s, K.out));
  for (const id of ['w97292427', 'w97292440', 'w1529981152', 'w97292456', 'w123384794', 'w97292468']) {
    const ring = ringOf(id);
    for (const [x, z] of pts) assert.ok(!pointInRing(ring, x, z), `${id}: a point of the hotel in it`);
    for (const [x, z] of ring) assert.ok(!pointInRing(H.ring, x, z), `${id}: a corner of it in the hotel`);
  }
});

let mod = null;
async function loadModule() {
  if (mod) return mod;
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  mod = await import('../js/club-hotel.js');
  return mod;
}

for (const simple of [false, true]) {
  test(`the building in Node${simple ? ' (the phone\'s materials)' : ''}: every vertex finite, four meshes, the outline registered, no colliders`, async () => {
    const { QUALITY } = await import('../js/quality.js');
    const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    try {
      const THREE = await import('three/webgpu');
      const { buildClubHotel } = await loadModule();
      const scene = new THREE.Scene();
      const { group, colliders } = buildClubHotel(scene);
      assert.equal(colliders.length, 0);
      assert.equal(group.userData.terrain, 'absolute');
      assert.deepEqual(SURVEYED_FOOTPRINTS.get(H.osm), [H.ring]);
      const names = group.children.map((m) => m.name).sort();
      assert.deepEqual(names, ['Club Hotel glass', 'Club Hotel plaster', 'Club Hotel roof', 'Club Hotel trim']);
      for (const m of group.children) {
        const p = m.geometry.attributes.position;
        assert.ok(p.count > 0);
        for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
        for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= H.base - 0.01 && p.array[i] < H.top + 0.5, `${m.name}: a height of ${p.array[i]}`);
      }
      // (the phone: no procedural shader but SIMPLE_SKINS' and the vertex-coloured trim)
      if (simple) for (const m of group.children) if (m.name !== 'Club Hotel trim') assert.ok(!m.material.roughnessNode && !m.material.normalNode, `${m.name}: a stock material`);
    } finally {
      QUALITY.simpleMaterials = was;
    }
  });
}
