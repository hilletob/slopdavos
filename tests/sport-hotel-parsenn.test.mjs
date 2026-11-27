import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARSENN, clearStretches, cutStretches, frontApex, groundOutlines, inside, onWall, outwardRing, planeY, pointInRing, ringArea2, roofAt, toLocal, toWorld, wallFrame,
  windowLine
} from '../js/sport-hotel-parsenn-data.js';
import { bioStops } from '../js/missions-data-rural.js';
import { WEBER } from '../js/missions-data-local.js';

const roof = (id) => PARSENN.roofs.find((r) => r.id === id);

test('the outlines: of some size, their walls facing out', () => {
  for (const ring of groundOutlines()) {
    assert.ok(ring.length >= 4 && Math.abs(ringArea2(ring)) / 2 > 25, 'an outline of some size');
    const R = outwardRing(ring);
    let out = 0, walls = 0;
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1.5) continue;
      walls++;
      const [x, z] = onWall(F, F.len / 2, 0.2);
      if (!pointInRing(ring, x, z)) out++;
    }
    assert.equal(out, walls, `${out} of ${walls} walls face out`);
  }
  // the hotel's ground plan: some 470 m², the restaurant and the wing in the yard outside it
  assert.ok(Math.abs(Math.abs(ringArea2(PARSENN.hotel)) / 2 - 470) < 30);
  for (const r of [PARSENN.restaurant.ring, PARSENN.yardWing]) {
    const cx = r.reduce((s, q) => s + q[0], 0) / r.length, cz = r.reduce((s, q) => s + q[1], 0) / r.length;
    assert.ok(!pointInRing(PARSENN.hotel, cx, cz));
  }
});

test('the frame: t along the ridge, c across it; world and frame agree', () => {
  for (const [t, c] of [[0, 0], [27.9, 0], [5.3, 11.2], [-3, -9]]) {
    const [x, z] = toWorld(t, c), [t2, c2] = toLocal(x, z);
    assert.ok(Math.abs(t - t2) < 1e-9 && Math.abs(c - c2) < 1e-9);
  }
  // the ridge's ends on the two gables, the west and the south corner's walls along t
  assert.ok(Math.abs(toLocal(682.3, -1380.65)[1]) < 0.1, 'the ridge ends on the south-east gable');
  assert.ok(Math.abs(toLocal(677.5, -1374.9)[0] - 27.46) < 0.05);
});

test('the roofs keep to the survey: ridges, eaves and the wings\' slopes', () => {
  const survey = [
    [659.8, -1397.2, 17.0], [682.3, -1380.65, 17.0], // the ridge's ends
    [686.0, -1386.5, 13.3], [674.0, -1395.3, 13.3], // the north-east eaves
    [677.5, -1374.9, 13.6], // the south-west eaves
    [665.5, -1405.3, 12.9], [670.7, -1412.5, 9.4], // the narrow wing's slope to its point
    [663.0, -1392.0, 17.0], // the cross wing's ridge (its end in the survey at 17.5)
    [655.8, -1391.5, 14.7], [663.6, -1382.6, 14.5], // its eaves on the Promenade and over the restaurant
    [681.2, -1400.5, 10.7], [683.6, -1403.8, 9.1] // the wing in the yard
  ];
  for (const [x, z, y] of survey) {
    const r = roofAt(x, z);
    assert.ok(r, `a roof over ${x} ${z}`);
    assert.ok(Math.abs(r.y - y) < 0.55, `${x} ${z}: ${r.y.toFixed(2)} for ${y}`);
  }
  // the saddle roof: one ridge over both slopes, the cross wing's over it
  assert.equal(planeY(roof('south-west'), 10, 0), planeY(roof('north-east'), 10, 0));
  assert.ok(roof('cross-north-west').at[2] > roof('south-west').at[2]);
  // no roof over the courtyard, nor out over the Promenade where the barrel stands
  assert.equal(roofAt(...toWorld(9, 9.5)), null);
});

test('the floors add up: the ground floor and four of 3.1 m to the line under the eaves', () => {
  assert.ok(Math.abs(PARSENN.ground + 4 * PARSENN.storey - PARSENN.line) < 1e-9);
  assert.ok(PARSENN.line < 13.3 && PARSENN.line > 12.5, 'the top floor just under the lowest eaves');
  // the restaurant's roof just under the hotel's first floor
  assert.ok(PARSENN.restaurant.top < PARSENN.ground && PARSENN.restaurant.top > PARSENN.ground - 0.5);
  // a top floor's windows fit under the eaves on every eave wall, none in the attic
  assert.equal(windowLine(13.3), PARSENN.line);
  assert.equal(windowLine(17.0), PARSENN.line);
  // ... and where the narrow wing's slope comes down to its point (9.4) two floors fewer
  assert.equal(windowLine(9.4), +(PARSENN.ground + 2 * PARSENN.storey).toFixed(2));
  const { lo, hi } = PARSENN.win;
  assert.ok(hi - lo > 1.2 && hi < PARSENN.storey - 0.5);
});

test('the lettering on the gable over the Promenade, under the ridge\'s end, on a stretch without windows', () => {
  const Fr = PARSENN.front, { F, s } = frontApex();
  assert.ok(F.n[0] < -0.7 && F.n[1] < -0.4, 'the front faces the Promenade (north-west)');
  assert.ok(Math.abs(F.len - 29.05) < 0.1 && Math.abs(s - 19.37) < 0.1);
  const at = onWall(F, s);
  assert.ok(Math.abs(toLocal(...at)[1]) < 0.05, 'the ridge\'s end');
  // a wall of the hotel's outline
  const R = PARSENN.hotel, k = R.findIndex((q) => Math.hypot(q[0] - Fr.a[0], q[1] - Fr.a[1]) < 0.06);
  assert.ok(k >= 0 && Math.hypot(R[(k + 1) % R.length][0] - Fr.b[0], R[(k + 1) % R.length][1] - Fr.b[1]) < 0.06);
  // the name within its clear stretch, under the gable's top, over the second floor's windows
  const N = Fr.name, clear = clearStretches(Fr.a, Fr.b);
  assert.ok(N.w / 2 <= Fr.clear + 0.01);
  const st = cutStretches(F.len, clear.upper);
  assert.deepEqual(st.map((q) => q.windows), [true, false, true]);
  assert.ok(st[1].from <= s - N.w / 2 + 0.01 && st[1].to >= s + N.w / 2 - 0.01);
  assert.ok(N.y1 < PARSENN.line && N.y0 > PARSENN.ground + PARSENN.storey);
  // either way round the same stretch
  const back = clearStretches(Fr.b, Fr.a).upper[0];
  assert.ok(Math.abs(back[0] - (F.len - clear.upper[0][1])) < 1e-9);
  // the door in the cross wing's part, the ground floor kept free round it
  const D = Fr.door;
  assert.ok(D.s - D.clear > s + Fr.clear && D.s + D.clear < F.len - 0.8);
  assert.ok(toLocal(...onWall(F, D.s))[1] < -2, 'in the cross wing');
  // (the other walls: no clear stretches)
  assert.deepEqual(clearStretches(PARSENN.hotel[4], PARSENN.hotel[5]), { upper: [], ground: [] });
});

test('the balconies on the gable towards the fire station', () => {
  const Bc = PARSENN.balconies, F = wallFrame(Bc.a, Bc.b);
  assert.ok(F.n[0] > 0.7, 'facing east-south-east');
  assert.ok(!inside(...onWall(F, F.len / 2, 0.5)) && inside(...onWall(F, F.len / 2, -0.5)));
  assert.ok(Bc.w < F.len - 2);
  for (const y of Bc.floors) { const k = (y - PARSENN.ground) / PARSENN.storey; assert.ok(Math.abs(k - Math.round(k)) < 1e-9 && k > 0.5, 'at a floor\'s foot'); }
});

test('the delivery barrel on the Promenade and the bakery\'s door stay clear of the hotel and its roofs', () => {
  const stop = bioStops(1).find((q) => q.name === 'Sport Hotel Parsenn');
  const spots = [[stop.x, stop.z], [WEBER.door.x, WEBER.door.z], [691, -1421] /* the outdoor mission's pin */];
  for (const [x, z] of spots) {
    assert.ok(!inside(x, z), `${x} ${z} outside the walls`);
    for (const ring of groundOutlines()) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
        assert.ok(Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) > 3, `${x} ${z} a few metres off the walls`);
      }
    }
    assert.equal(roofAt(x, z), null, `${x} ${z} under no roof`);
  }
  // (the door's step and canopy reach 1 m out of the front: the barrel stands 5 m out)
  const { F } = frontApex(), [t] = toLocal(stop.x, stop.z);
  assert.ok(t < -4 && Math.abs(toLocal(...onWall(F, 0))[0]) < 0.5);
});

test('the building in Node: every vertex finite, its meshes, the outlines registered, no colliders of its own', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildSportHotelParsenn } = await import('../js/sport-hotel-parsenn.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.equal(SURVEYED_FOOTPRINTS.get(PARSENN.osm).length, 3);
  assert.ok(SHOP_EXCLUSIONS.has(PARSENN.osm));
  const scene = new THREE.Scene();
  const { group, colliders } = buildSportHotelParsenn(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name.replace('Sport Hotel Parsenn ', '')).sort();
  assert.deepEqual(names, ['decal', 'glass', 'plaster', 'roof', 'trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > PARSENN.base - 0.01 && p.array[i] < 17.6, `${m.name}: a height of ${p.array[i]}`);
    if (m.name.endsWith('plaster')) assert.ok(m.geometry.attributes.aHalf, 'the walls carry their half lengths');
    // every uv finite (the windows' grid)
    const uvA = m.geometry.attributes.uv;
    for (let i = 0; i < uvA.array.length; i++) assert.ok(Number.isFinite(uvA.array[i]));
  }
  // the decals' uv within the atlas
  const d = group.children.find((m) => m.name.endsWith('decal')).geometry.attributes.uv.array;
  for (const v of d) assert.ok(v >= -1e-6 && v <= 1 + 1e-6);
  // nothing of it stands on the barrel's spot (no triangle under 3 m within 1.2 m of it, seen from above)
  const stop = bioStops(1).find((q) => q.name === 'Sport Hotel Parsenn');
  const segDist = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((stop.x - ax) * dx + (stop.z - az) * dz) / L));
    return Math.hypot(stop.x - ax - t * dx, stop.z - az - t * dz);
  };
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const q = [0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]);
      if (Math.min(...q.map((v) => v[1])) > 3) continue;
      const tri = q.map((v) => [v[0], v[2]]);
      const d = pointInRing(tri, stop.x, stop.z) ? 0 : Math.min(...[0, 1, 2].map((k) => segDist(...tri[k], ...tri[(k + 1) % 3])));
      assert.ok(d > 1.2, `${m.name} at the barrel`);
    }
  }
});
