import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, PARTS, PROMENADE_PLATZ_2, facesPromenade, groundOutlines, hipCorners, insideRow, onWall, part, partWalls, pointInRing, ringArea2
} from '../js/promenade-platz-2-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((x) => x.id === id);
  if (!b) return null;
  const out = [];
  for (let i = 0; i < b.ring.length; i += 2) out.push([b.ring[i], b.ring[i + 1]]);
  return out;
};
const stubDocument = () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
};

test('the outlines: of some size, the walls facing out, each in its OpenStreetMap building', () => {
  for (const p of PARTS) {
    assert.ok(p.ring.length >= 3, `${p.id}: an outline`);
    assert.ok(Math.abs(ringArea2(p.ring)) / 2 > 3, `${p.id}: an outline of some size`);
    assert.ok(p.top > p.base + 2, `${p.id}: a top over its base`);
    // a step out of each wall's middle leaves its outline, a step in is inside
    for (const F of partWalls(p)) {
      if (F.len < 0.6) continue;
      assert.ok(!pointInRing(p.ring, ...onWall(F, F.len / 2, 0.1)), `${p.id}: a wall facing in`);
      assert.ok(pointInRing(p.ring, ...onWall(F, F.len / 2, -0.1)), `${p.id}: a wall facing out`);
    }
    // its middle in OpenStreetMap's footprint (or close: the survey's walls stand off it)
    if (p.osm) {
      const own = osmRing(p.osm);
      assert.ok(own, `${p.osm}: an OpenStreetMap building`);
      const [cx, cz] = p.ring.reduce((s, q) => [s[0] + q[0] / p.ring.length, s[1] + q[1] / p.ring.length], [0, 0]);
      const d = own.reduce((m, q) => Math.min(m, Math.hypot(q[0] - cx, q[1] - cz)), Infinity);
      assert.ok(pointInRing(own, cx, cz) || d < 6, `${p.id}: its middle off ${p.osm}`);
    }
  }
  // the outlines registered for the player's walls: every rebuilt OpenStreetMap building, also those the batches hold
  const G = groundOutlines();
  for (const id of ['w117012139', 'w117012319', 'w116881261', 'w116881242', 'w123382365', 'w123382393', 'w123382392', 'w1529620021',
    'w1529620020', 'w219449796', 'w219449799']) {
    assert.ok(G.get(id)?.length, `${id} registered`);
    for (const r of G.get(id)) for (const [x, z] of r) assert.ok(Number.isFinite(x) && Number.isFinite(z));
  }
  // the Haus Trauffer's batch cut in two on the party wall: both halves of some size, together the whole
  const a = Math.abs(ringArea2(part('trauffer').ring)) / 2, b = Math.abs(ringArea2(part('traufferWest').ring)) / 2;
  assert.ok(a > 100 && b > 100);
  assert.ok(Math.abs(a + b - 381) < 8, `the halves: ${a.toFixed(0)} + ${b.toFixed(0)} m²`);
});

test('the hipped roofs: the ridge over the outline, the foot out of the walls, below the ridge', () => {
  for (const p of PARTS.filter((q) => q.hip)) {
    assert.equal(p.ring.length, 4, `${p.id}: a quadrilateral`);
    const { foot, ridge } = hipCorners(p, HOUSES[p.house].eave.out);
    for (const r of ridge) {
      assert.ok(pointInRing(p.ring, r[0], r[2]), `${p.id}: the ridge over the house`);
      assert.ok(Math.abs(r[1] - (p.top + p.hip)) < 1e-9);
    }
    for (const f of foot) {
      assert.ok(!pointInRing(p.ring, f[0], f[2]), `${p.id}: the foot out of the walls`);
      assert.ok(f[1] < p.top && f[1] > p.top - 1.0, `${p.id}: the foot at ${f[1]}`);
      const d = p.ring.reduce((m, q) => Math.min(m, Math.hypot(q[0] - f[0], q[1] - f[2])), Infinity);
      assert.ok(d < 2.5, `${p.id}: the foot ${d.toFixed(2)} m from its corner`);
    }
  }
});

test('the floors add up: each house\'s floors over its shops to its main roof', () => {
  const main = { grey: 'grey', cream: 'cream', white: 'white', panel: 'panel', trauffer: 'trauffer', traufferWest: 'traufferWest', argo: 'argo', grad: 'grad', akt: 'akt', meng: 'meng' };
  for (const [h, id] of Object.entries(main)) {
    const H = HOUSES[h], p = part(id);
    const n = (p.top - H.parapet - H.shop) / H.storey;
    assert.ok(Math.abs(n - Math.round(n)) < 0.2 && Math.round(n) >= 1, `${h}: ${n.toFixed(2)} floors`);
    assert.ok(H.shop - H.floor > 2.9 && H.shop - H.floor < 4.5, `${h}: a ground floor of ${(H.shop - H.floor).toFixed(1)} m`);
    assert.ok(H.storey > 2.4 && H.storey < 3.4, `${h}: a storey of ${H.storey}`);
  }
  // every part's base under the ground along its walls
  return import('../js/terrain.js').then(({ groundHeight }) => {
    for (const p of PARTS) for (const F of partWalls(p)) {
      for (let s = 0; s <= F.len; s += 0.5) assert.ok(groundHeight(...onWall(F, s, 0.3)) > p.base + 0.2, `${p.id}: its base over the ground`);
    }
  });
});

test('the balconies: on their walls, under the roof, not into a neighbouring part', async () => {
  stubDocument();
  const { balconyPlaces } = await import('../js/promenade-platz-2.js');
  const places = balconyPlaces();
  assert.equal(places.length, PROMENADE_PLATZ_2.balconies.length, 'every balcony on a wall');
  const { groundHeight } = await import('../js/terrain.js');
  for (const { b, p, F, s0, s1 } of places) {
    assert.ok(s1 - s0 >= 1, `${b.part}: ${(s1 - s0).toFixed(1)} m long`);
    for (const y of b.ys) {
      assert.ok(y + 1.0 < p.top, `${b.part}: a balcony at ${y} under the roof`);
      for (const s of [s0, (s0 + s1) / 2, s1]) {
        const [x, z] = onWall(F, s, b.depth);
        assert.ok(!PARTS.some((q) => q !== p && q.top > y && pointInRing(q.ring, x, z)), `${b.part}: a balcony at ${y} into another part`);
        assert.ok(groundHeight(...onWall(F, s, b.depth * 0.5)) < y - 0.5, `${b.part}: a balcony at ${y} in the ground`);
      }
    }
  }
});

test('the shops: their fronts on the walls facing the Promenade, every business lettered within its reach', async () => {
  stubDocument();
  const { SHOPS, ATLAS, shopFronts, signPlaces } = await import('../js/promenade-platz-2.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.equal(SHOPS.length, PROMENADE_PLATZ_2.shops.length, 'every business found in js/shops-data.js');
  for (const id of PROMENADE_PLATZ_2.shops) assert.ok(SHOP_EXCLUSIONS.has(id));
  const fronts = shopFronts();
  assert.ok(fronts.length >= 10, `${fronts.length} shop fronts`);
  for (const f of fronts) assert.ok(facesPromenade(f.F));
  const places = signPlaces(fronts);
  assert.equal(places.length, SHOPS.length, 'a board for each business');
  for (const q of places) {
    assert.ok(q.d < 10, `${q.s.name}: ${q.d.toFixed(1)} m from its wall`);
    assert.ok(q.at - q.w / 2 >= -0.05 && q.at + q.w / 2 <= q.F.len + 0.05, `${q.s.name}: within its wall`);
  }
  for (const a of places) for (const b of places) if (a !== b && a.F === b.F) assert.ok(Math.abs(a.at - b.at) >= (a.w + b.w) / 2, `${a.s.name} and ${b.s.name} overlap`);
  // the atlas' cells within it, not overlapping
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'atlas cells overlap');
  }
});

test('the neighbours: the rows stay clear of the hand-built houses beside them', async () => {
  stubDocument();
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  for (const m of ['promenade-platz', 'post-coop', 'hard-rock-hotel', 'central-sporthotel', 'obere-strasse-2', 'kirchner-museum']) await import(`../js/${m}.js`);
  const ours = new Set(groundOutlines().keys());
  const theirs = [...SURVEYED_FOOTPRINTS].filter(([id]) => !ours.has(id)).flatMap(([, rings]) => rings);
  assert.ok(theirs.length > 10);
  const near = (r) => r.some(([x, z]) => (x > -200 && x < -60 && z > -680 && z < -560) || (x > -580 && x < -360 && z > -400 && z < -170));
  const close = theirs.filter(near);
  assert.ok(close.length >= 3, 'the neighbours\' outlines read');
  for (const t of close) for (const p of PARTS) {
    for (const [x, z] of p.ring) assert.ok(!pointInRing(t, x, z), `${p.id} at ${x}, ${z} inside a neighbour`);
    for (const [x, z] of t) assert.ok(!pointInRing(p.ring, x, z), `a neighbour at ${x}, ${z} inside ${p.id}`);
  }
});

test('the missions\' places near the rows stay outside them', async () => {
  const dir = new URL('../js/', import.meta.url);
  const points = [];
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 5) return;
    if (typeof v.x === 'number' && typeof v.z === 'number') points.push([v.x, v.z]);
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  for (const f of readdirSync(dir).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    let mod;
    try { mod = await import(new URL(f, dir)); } catch { continue; }
    for (const k of Object.keys(mod)) if (typeof mod[k] === 'object') walk(mod[k], 0);
  }
  assert.ok(points.length > 20, 'the missions\' places read');
  for (const [x, z] of points) {
    assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the rows`);
    for (let a = 0; a < 8; a++) if (Math.hypot(x + 520, z + 260) < 400) assert.ok(!insideRow(x + 0.5 * Math.cos(a), z + 0.5 * Math.sin(a)), `a mission's place at ${x}, ${z} against a wall`);
  }
});

test('the rows in Node: every vertex finite, five meshes, the phone\'s materials light, its colliders', async () => {
  stubDocument();
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { buildPromenadePlatz2 } = await import('../js/promenade-platz-2.js');
  for (const [id, rings] of groundOutlines()) assert.deepEqual(SURVEYED_FOOTPRINTS.get(id), rings, `${id} registered`);
  // (SIMPLE_SKINS' materials marked as they are made: on the phone every material is one of them, the trim's vertex
  // colours or the decals')
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const boxes = [[-180, -80, -665, -565], [-560, -365, -380, -195]];
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildPromenadePlatz2(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Promenade Platz 2 ', '')).sort();
    assert.deepEqual(names, ['decal', 'glass', 'roof', 'trim', 'walls']);
    let tris = 0;
    for (const m of group.children) {
      if (simple) {
        const M = m.material, decal = M.opacityNode && M.transparent && !M.emissiveNode && !M.roughnessNode;
        const procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
        assert.ok(M.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
      }
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      tris += p.count / 3;
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 0; i < p.array.length; i += 3) {
        const [x, y, z] = [p.array[i], p.array[i + 1], p.array[i + 2]];
        assert.ok(y > -15.5 && y < 15.5, `${m.name}: a height of ${y}`);
        assert.ok(boxes.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1), `${m.name}: a vertex out at ${x}, ${z}`);
      }
      // the walls carry each house's colour, the walls' grid its half lengths
      if (m.name.endsWith('walls')) { assert.ok(m.geometry.attributes.color); assert.ok(m.geometry.attributes.aHalf); }
      if (m.name.endsWith('trim')) assert.equal(m.geometry.attributes.color.count, p.count);
    }
    assert.ok(tris < 15000, `${tris} triangles`);
    // the colliders: der Frisör's pavilion's walls, at world heights
    assert.ok(colliders.length >= 6);
    for (const c of colliders) {
      for (const v of [c.minX, c.maxX, c.minZ, c.maxZ, c.baseY, c.maxY, c.obb.cx, c.obb.cz, c.obb.hx]) assert.ok(Number.isFinite(v));
      assert.ok(c.maxY > c.baseY);
    }
  }
});

test('the excluded batches: each a rebuilt part\'s, none another\'s', () => {
  for (const e of PROMENADE_PLATZ_2.exclude) {
    assert.ok(PARTS.some((p) => pointInRing(p.ring, e.x, e.z) || p.ring.some((q) => Math.hypot(q[0] - e.x, q[1] - e.z) < 12)), `${e.x}, ${e.z}`);
    for (const f of PROMENADE_PLATZ_2.exclude) if (f !== e) assert.ok(Math.hypot(f.x - e.x, f.z - e.z) > e.r + f.r - 0.5);
  }
});
