import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ETTINGER_SPORT as E, balconyFrame, frontFrame, groundOutlines, isWall, offsetRing, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame
} from '../js/ettinger-sport-data.js';
import { VALLEY } from '../js/missions-data-parsenn.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

test('the volumes: outlines of some size, the floors adding up to the surveyed roofs', () => {
  for (const p of E.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 0.8, `${p.id}: an outline`);
    assert.ok(p.top > E.street + 3, `${p.id}: its roof over the street`);
  }
  const block = part('block'), wing = part('wing');
  assert.ok(Math.abs(ringArea2(block.ring)) / 2 > 300 && Math.abs(ringArea2(wing.ring)) / 2 > 600);
  // the block: the shop floor (street to its fascia's top) and two floors over it, the roof slab on top
  assert.ok(Math.abs(block.line - block.ground - 2 * E.storey) < 1e-9);
  assert.ok(block.ground - E.street > 4 && block.ground - E.street < 5, 'a tall shop floor');
  assert.ok(block.top > block.line && block.top - block.line < 0.5);
  // the wing: the shop floor's glazing, the awning and the fascia under its roof
  const S = E.shopFront;
  assert.ok(S.glassTop + S.awning.rise < S.cornice[0] - 1.2, 'room for the lettering on the fascia');
  assert.ok(Math.abs(S.cornice[1] - wing.top) < 1e-9);
  for (const L of S.letters) assert.ok(L.y0 > S.glassTop + S.awning.rise && L.y1 < S.cornice[0], L.key);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of E.parts) {
    const ring = outwardRing(p.ring);
    let out = 0, walls = 0;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 2) continue;
      walls++;
      if (!pointInRing(p.ring, ...onWall(F, F.len / 2, 0.2))) out++;
    }
    assert.equal(out, walls, `${p.id}: ${out} of ${walls} walls face out`);
  }
});

test('the fronts lie on their parts\' walls and face where the photographs saw them', () => {
  // the Promenade before the house runs south-west to north-east on its south-east side (bigger x, bigger z)
  for (const k of ['wing', 'blockSE', 'tower']) {
    const F = frontFrame(E.fronts[k]);
    assert.ok(F, k);
    assert.ok(F.n[0] > 0.7 && F.n[1] > 0.4, `${k} faces south-east`);
  }
  // the block's end up the street faces south-south-west
  const W = frontFrame(E.fronts.blockSSW);
  assert.ok(W.n[1] > 0.7 && W.n[0] < -0.4);
  // the lettering within the wing's front, the two names apart
  const F = frontFrame(E.fronts.wing), [a, b] = E.shopFront.letters;
  assert.ok(a.from > 0.5 && b.to < F.len - 0.5 && a.to < b.from);
  // the arch within the tower's face, its apex under the painting, the painting under the lamps
  const T = frontFrame(E.fronts.tower), A = E.arch;
  assert.ok(A.width < T.len - 1.6 && A.mural.w < T.len - 1);
  assert.ok(A.spring + A.width / 2 < A.mural.y0 && A.mural.y1 < part('block').top - 1);
  assert.ok(A.spring - E.street > 2.5, 'the springing over a head');
  // the railing's end wall is the wing's
  const ring = part('wing').ring;
  assert.ok(ring.some((q, i) => isWall(E.railing.end, q, ring[(i + 1) % ring.length])));
});

test('the balcony stands before the block\'s front beside the tower, under its slab', () => {
  const { F, from, to, out } = balconyFrame();
  assert.ok(to - from > 3 && to - from < 4 && out > 0.7 && out < 1);
  assert.ok(to > F.len - 0.1, 'it reaches the tower');
  const [x, z] = onWall(F, (from + to) / 2, out / 2);
  assert.ok(pointInRing(E.balcony.ring, x, z) && partAt(x, z) === null);
  assert.ok(E.balcony.floor > E.street + 4 && E.balcony.roof[1] === part('wing').top);
});

test('the roof slab\'s edge stands out of every wall', () => {
  const ring = outwardRing(part('block').ring), slab = offsetRing(ring, E.eaves);
  for (let i = 0; i < ring.length; i++) {
    const d = Math.hypot(slab[i][0] - ring[i][0], slab[i][1] - ring[i][1]);
    assert.ok(d > E.eaves - 0.01 && d < 1.6, `corner ${i}: ${d}`);
  }
});

test('the player\'s walls: the surveyed outlines at the ground, the balcony left out; the station\'s pin stays free', () => {
  const rings = groundOutlines();
  assert.equal(rings.length, E.parts.length);
  assert.ok(!rings.includes(E.balcony.ring));
  // the Parsenn mission's pin at the valley station (js/missions-data-parsenn.js) lies outside the house
  assert.equal(partAt(VALLEY.x, VALLEY.z), null);
  for (const p of E.parts) {
    const ring = outwardRing(p.ring);
    let d = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      const dx = VALLEY.x - F.a[0], dz = VALLEY.z - F.a[1], s = Math.max(0, Math.min(F.len, dx * F.u[0] + dz * F.u[1]));
      const [qx, qz] = onWall(F, s);
      d = Math.min(d, Math.hypot(VALLEY.x - qx, VALLEY.z - qz));
    }
    assert.ok(d > 1, `${p.id}: ${d.toFixed(1)} m from the pin`);
  }
});

test('the hall meets the house behind it: its back on that house\'s OSM walls, none of it inside them', () => {
  // (js/buildings.js raises the house's walls from OSM: inside the hall they made a strip between two walls, each
  // pushing a player back through the other)
  const b = DAVOS_DATA.buildings.find((q) => q.id === E.hallBack);
  const house = [];
  for (let i = 0; i < b.ring.length; i += 2) house.push([b.ring[i], b.ring[i + 1]]);
  const wing = part('wing').ring;
  const distToRing = (ring, x, z) => {
    let d = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      const s = Math.max(0, Math.min(F.len, (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1]));
      const [qx, qz] = onWall(F, s);
      d = Math.min(d, Math.hypot(x - qx, z - qz));
    }
    return d;
  };
  // no stretch of the hall within the house (a 0.25 m grid, the shared walls left aside)
  let inside = 0;
  for (let x = 605; x < 660; x += 0.25) {
    for (let z = -1440; z < -1395; z += 0.25) {
      if (pointInRing(wing, x, z) && pointInRing(house, x, z) && distToRing(house, x, z) > 0.05) inside++;
    }
  }
  assert.equal(inside, 0, `${inside} points of the hall inside the house`);
  // the hall's back on the house's walls: ten of its corners and the two crossings
  const onHouse = wing.filter(([x, z]) => distToRing(house, x, z) < 0.02);
  assert.ok(onHouse.length >= 12, `${onHouse.length} corners on the house's walls`);
  // a player 0.6 m inside a wall of the hall's back is pushed out of it, not held between two walls
  const wall = (a, c) => { const F = wallFrame(a, c); return F.len < 0.3 ? null : F; };
  const walls = [...wing.map((a, i) => wall(a, wing[(i + 1) % wing.length])), ...house.map((a, i) => wall(a, house[(i + 1) % house.length]))].filter(Boolean);
  const push = (x, z, list, r = 0.48) => {
    for (const F of list) {
      const s = Math.max(0, Math.min(F.len, (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1]));
      const off = (x - F.a[0]) * F.n[0] + (z - F.a[1]) * F.n[1];
      if (s <= 0 || s >= F.len || Math.abs(off) >= r + 0.22) continue;
      const depth = r + 0.22 - Math.abs(off), sg = Math.sign(off) || 1;
      x += F.n[0] * sg * depth; z += F.n[1] * sg * depth;
    }
    return [x, z];
  };
  const ring = outwardRing(wing);
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    const [mx, mz] = onWall(F, F.len / 2);
    if (F.len < 2 || distToRing(house, mx, mz) > 0.02) continue;
    const [x, z] = onWall(F, F.len / 2, -0.6);
    for (const list of [walls, [...walls].reverse()]) {
      const [px, pz] = push(x, z, list);
      assert.ok(Math.hypot(px - x, pz - z) > 0.05, `a wall of the hall's back at ${mx.toFixed(1)}/${mz.toFixed(1)}`);
    }
  }
});

test('the building in Node, full and mobile: every vertex finite, six meshes, no colliders, plain skins on the phone', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { buildEttingerSport, ATLAS } = await import('../js/ettinger-sport.js');
  assert.ok(SHOP_EXCLUSIONS.has(E.shop));
  assert.equal(SURVEYED_FOOTPRINTS.get(E.osm).length, E.parts.length);
  // the atlas' cells apart
  const cells = Object.values(ATLAS);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [ax, ay, aw, ah] = cells[i], [bx, by, bw, bh] = cells[j];
      assert.ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `cells ${i} and ${j}`);
    }
    assert.ok(cells[i][0] + cells[i][2] <= 1024 && cells[i][1] + cells[i][3] <= 512);
  }
  // (SIMPLE_SKINS' materials marked as they are made, as mobile-check.mjs does)
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const skins = { ...SIMPLE_SKINS };
  for (const k of Object.keys(skins)) SIMPLE_SKINS[k] = (...a) => { const m = skins[k](...a); m.userData.simpleSkin = k; return m; };
  const was = QUALITY.simpleMaterials;
  try {
    for (const simple of [false, true]) {
      QUALITY.simpleMaterials = simple;
      const scene = new THREE.Scene();
      const { group, colliders } = buildEttingerSport(scene);
      assert.equal(colliders.length, 0);
      assert.equal(group.userData.terrain, 'absolute');
      const names = group.children.map((m) => m.name).sort();
      assert.deepEqual(names, ['Ettinger Sport decal', 'Ettinger Sport glass', 'Ettinger Sport plaster', 'Ettinger Sport roof', 'Ettinger Sport timber', 'Ettinger Sport trim']);
      for (const m of group.children) {
        const p = m.geometry.attributes.position;
        assert.ok(p.count > 0);
        for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
        for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= E.base - 0.01 && p.array[i] < 9, `${m.name}: a height of ${p.array[i]}`);
        if (simple && !m.name.endsWith('decal')) {
          const mat = m.material;
          const procedural = mat.colorNode || mat.emissiveNode || mat.roughnessNode || mat.normalNode || mat.positionNode;
          assert.ok(mat.userData.simpleSkin || !procedural, `${m.name}: a plain skin on the phone`);
        }
      }
    }
  } finally {
    QUALITY.simpleMaterials = was;
    Object.assign(SIMPLE_SKINS, skins);
  }
});
