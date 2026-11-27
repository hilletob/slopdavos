import test from 'node:test';
import assert from 'node:assert/strict';
import { MIGROS_DORF, glassFoot, groundStretches, onWall, outwardRing, panes, partAt, pointInRing, ringArea2, roofOutline, roofPlanes, roofTop, sharedWith, soffit, toFront, wallFrame, wallKey, wallOf } from '../js/migros-dorf-data.js';
import { groundHeight } from '../js/terrain.js';
import { POST_ROUTE } from '../js/missions-data-post.js';
import { BIO_ROUTE } from '../js/missions-data-rural.js';

const S = MIGROS_DORF, R = S.roof;
const part = (id) => S.parts.find((p) => p.id === id);
const along = (F, s0, s1) => { let hi = -Infinity; for (let s = s0; s <= s1 + 1e-6; s += (s1 - s0) / 12) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5))); return hi; };

test('the volumes: outlines of some size, walls facing out; the two parts meet along two walls', () => {
  for (const p of S.parts) {
    assert.ok(Math.abs(ringArea2(p.ring)) / 2 > 150, `${p.id}: an outline of some size`);
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
  const ring = part('east').ring;
  assert.equal(ring.filter((q, i) => sharedWith(part('east'), q, ring[(i + 1) % ring.length]) === part('main')).length, 2);
});

test('the named walls are walls of the outlines, facing their sides', () => {
  const owners = (key) => S.parts.filter((p) => { const r = outwardRing(p.ring); return r.some((q, i) => wallKey(q, r[(i + 1) % r.length]) === key); });
  for (const key of Object.keys(S.walls)) {
    const o = owners(key);
    assert.equal(o.length, 1, `${key}: a wall of one outline, running as its outward ring`);
    assert.equal(sharedWith(o[0], S.walls[key].a, S.walls[key].b), null);
  }
  assert.ok(wallOf('west').n[0] < -0.85, 'the Promenade\'s front faces west (north-west)');
  assert.ok(wallOf('north').n[1] < -0.85, 'the north side faces north (smaller z)');
  assert.ok(wallOf('south').n[1] > 0.85, 'the south side faces south (bigger z)');
  assert.ok(wallOf('east').n[0] > 0.85, 'the car park\'s side faces east');
});

test('one tall storey under a flat roof: the eaves over the Promenade', () => {
  const W = wallOf('west');
  for (const s of [1, 13, 25]) assert.ok(Math.abs(groundHeight(...onWall(W, s, 1)) - S.floor) < 0.4, 'the floor on the Promenade\'s level');
  // the soffit over the front 4.5–5 m over the Promenade, the eaves' edge out over the pavement at least 4 m up
  const street = -3.6;
  assert.ok(soffit(0) - street > 4.5 && soffit(0) - street < 5.2, `the soffit at ${soffit(0)}`);
  assert.ok(soffit(R.eaves.front) - street > 4.0);
  assert.ok(S.glass < soffit(0) && S.glass - S.floor > 4, 'a shop\'s tall storey of glass');
  assert.ok(S.floor + S.transom < S.glass - 1);
  // flat: the same top over the front and the back
  assert.equal(R.pitch, 0);
  assert.equal(roofTop(0), roofTop(R.back));
  assert.ok(R.ridgeO < R.back / 3 && R.ridgeO > (2 * R.back) / 3);
  // the roof's outline covers every wall with its eaves
  const W2 = wallOf('west'), O = roofOutline().map(([s, o]) => onWall(W2, s, o));
  for (const p of S.parts) for (const q of p.ring) {
    assert.ok(pointInRing(O, ...q), 'a corner under the roof');
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(pointInRing(O, q[0] + d[0], q[1] + d[1]), 'the eaves a metre out at least');
    assert.ok(soffit(toFront(...q)[1]) > groundHeight(...q) + 4.5, 'the walls at least 4.5 m high');
  }
  // the planes split the outline at the ridge
  const P = roofPlanes();
  assert.ok(P.front.every(([, o]) => o >= R.ridgeO - 1e-9) && P.back.every(([, o]) => o <= R.ridgeO + 1e-9));
  assert.ok(Math.abs(Math.abs(ringArea2(P.front)) + Math.abs(ringArea2(P.back)) - Math.abs(ringArea2(roofOutline()))) < 1e-6);
});

test('the glazing lies between the stone piers and starts over the highest ground', () => {
  assert.equal(glassFoot(-6), S.floor);
  assert.equal(glassFoot(S.glass), null);
  const W = wallOf('west'), [[g0, g1]] = S.glazed.west;
  assert.ok(Math.abs(g0 - S.piers.north[1]) < 1e-9 && Math.abs(g1 - S.piers.south[0]) < 1e-9, 'the glazing between the piers');
  assert.ok(S.piers.north[0] === 0 && Math.abs(S.piers.south[1] - W.len) < 0.01);
  assert.ok(g1 - g0 > 20, 'the whole front glazed');
  assert.deepEqual(Object.keys(S.glazed), ['west'], 'the other sides closed');
  for (const st of groundStretches(W.a, onWall(W, W.len)).filter((x) => x.glazed)) {
    const hi = along(W, st.from, st.to), foot = glassFoot(hi);
    assert.ok(foot !== null && foot > hi + 0.1, 'no pane cut by the ground');
    const { n, w } = panes(st.to - st.from);
    assert.ok(n >= 6 && w > 2.5 && w < 3.5);
  }
});

test('the entrance in the left third, the name over it; the doors and the gate on their walls', () => {
  const E = S.entrance, W = wallOf(E.wall), [[g0, g1]] = S.glazed.west;
  assert.ok(E.s - E.w / 2 > g0 + 0.5 && E.s + E.w / 2 < g1 && E.s < W.len / 3, 'the doors in the glazing\'s left third (the north)');
  assert.ok(S.floor + E.h + 0.14 < S.floor + S.transom + 0.2);
  const L = S.lettering[0];
  assert.equal(L.wall, 'west');
  assert.ok(Math.abs((L.s0 + L.s1) / 2 - E.s) < 0.05, 'centred over the doors');
  assert.ok(L.y0 > S.floor + S.transom && L.y1 < S.glass, 'on the panes over the transom');
  assert.ok(L.out > 0 && L.out < 0.2);
  const D = S.staffDoor, So = wallOf(D.wall);
  assert.ok(D.s - D.w / 2 > 1.5 && D.s + D.w / 2 < So.len - 0.3);
  const G = S.gate, Ea = wallOf(G.wall);
  assert.ok(G.s0 > 0.5 && G.s1 < Ea.len - 0.5);
  assert.ok(along(Ea, G.s0, G.s1) + G.h < soffit(toFront(...onWall(Ea, G.s0))[1]) - 0.5, 'the gate under the eaves');
});

test('the routes along the Promenade pass free of the house and of its entrance', () => {
  const W = wallOf('west'), E = S.entrance;
  const pts = [S.walls.west.a, S.walls.west.b, onWall(W, E.s - E.w / 2 - 0.4, 0.9), onWall(W, E.s + E.w / 2 + 0.4, 0.9)];
  const seg = (p, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
  };
  for (const route of [POST_ROUTE, BIO_ROUTE]) {
    let checked = 0;
    for (let i = 0; i + 3 < route.length; i += 2) {
      const a = [route[i], route[i + 1]], b = [route[i + 2], route[i + 3]];
      if (Math.min(Math.hypot(a[0] - 625, a[1] + 1325), Math.hypot(b[0] - 625, b[1] + 1325)) > 80) continue;
      checked++;
      for (let t = 0; t <= 1; t += 0.05) assert.equal(partAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), null);
      for (const p of pts) assert.ok(seg(p, a, b) > 2.0, `a route ${seg(p, a, b).toFixed(1)} m from the house`);
    }
    assert.ok(checked > 0);
  }
});

test('the house in Node: every vertex finite, six meshes, no colliders of its own; the phone\'s skins', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildMigrosDorf } = await import('../js/migros-dorf.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.equal(SURVEYED_FOOTPRINTS.get(S.osm).length, 2);
  assert.ok(SHOP_EXCLUSIONS.has('n797682885'));
  const check = (group) => {
    const names = group.children.map((m) => m.name).sort();
    assert.deepEqual(names, ['decal', 'glass', 'plaster', 'roof', 'stone', 'trim'].map((n) => `Migros Davos Dorf ${n}`));
    for (const m of group.children) {
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > S.base - 1 && p.array[i] < R.ridge + 0.1, `${m.name}: a height of ${p.array[i]}`);
    }
    // the roof's top faces up, the soffit down
    const roof = group.children.find((m) => m.name.endsWith('roof')).geometry.attributes.normal;
    for (let i = 1; i < roof.array.length; i += 3) assert.ok(roof.array[i] > 0.9);
  };
  const { group, colliders } = buildMigrosDorf(new THREE.Scene());
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  check(group);
  // the phone's profile: SIMPLE_SKINS' materials, the trim and the decal
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const was = QUALITY.simpleMaterials;
  const skins = new Set();
  const orig = {};
  for (const k of Object.keys(SIMPLE_SKINS)) { orig[k] = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = orig[k](...a); skins.add(m); return m; }; }
  try {
    QUALITY.simpleMaterials = true;
    const mobile = buildMigrosDorf(new THREE.Scene()).group;
    check(mobile);
    for (const m of mobile.children) {
      const mat = m.material, kind = m.name.split(' ').pop();
      if (kind === 'decal') assert.ok(mat.transparent && mat.opacityNode && !mat.emissiveNode);
      else if (kind === 'trim') assert.ok(!mat.colorNode && !mat.emissiveNode && mat.vertexColors);
      else assert.ok(skins.has(mat), `${kind}: a simple skin on the phone`);
    }
  } finally {
    QUALITY.simpleMaterials = was;
    Object.assign(SIMPLE_SKINS, orig);
  }
});
