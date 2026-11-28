import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, PARTS, PROMENADE_PLATZ_NORD, groundOutlines, insideRow, onWall, outwardRing, part, partWalls, pointInRing, ringArea2
} from '../js/promenade-platz-nord-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { groundHeight } from '../js/terrain.js';

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

test('the outlines: of some size, the walls facing out, each in or by its OpenStreetMap building', () => {
  for (const p of PARTS) {
    assert.ok(HOUSES[p.house], `${p.id}: a house`);
    assert.ok(Math.abs(ringArea2(p.ring)) / 2 > 5, `${p.id}: an outline of some size`);
    assert.ok(p.top > p.base + 2, `${p.id}: a top over its base`);
    // a step out of each wall's middle leaves its outline, a step in is inside
    for (const F of partWalls(p)) {
      if (F.len < 0.6) continue;
      assert.ok(!pointInRing(p.ring, ...onWall(F, F.len / 2, 0.1)), `${p.id}: a wall facing in`);
      assert.ok(pointInRing(p.ring, ...onWall(F, F.len / 2, -0.1)), `${p.id}: a wall facing out`);
    }
    // its middle in OpenStreetMap's footprint or close to it (the survey's walls stand off it; the low parts beyond it)
    if (p.osm) {
      const own = osmRing(p.osm);
      assert.ok(own, `${p.osm}: an OpenStreetMap building`);
      const [cx, cz] = p.ring.reduce((s, q) => [s[0] + q[0] / p.ring.length, s[1] + q[1] / p.ring.length], [0, 0]);
      const d = own.reduce((m, q) => Math.min(m, Math.hypot(q[0] - cx, q[1] - cz)), Infinity);
      assert.ok(pointInRing(own, cx, cz) || d < 12, `${p.id}: its middle ${d.toFixed(1)} m off ${p.osm}`);
    }
    // the base under the ground all round, the housings on a roof standing on it
    if (p.over) {
      const host = PARTS.find((q) => q !== p && !q.over && p.ring.every(([x, z]) => pointInRing(q.ring, x, z) || q.ring.some((r) => Math.hypot(r[0] - x, r[1] - z) < 1.5)));
      assert.ok(host && p.base <= host.top && p.base > host.top - 1, `${p.id}: on a roof`);
    }
  }
  // the outlines registered for the player's walls: every rebuilt OpenStreetMap building
  const G = groundOutlines();
  for (const id of ['w123384617', 'w116881287', 'w1529620014', 'w123383538', 'w123383530', 'w123383540', 'w1529973396', 'w123383534',
    'w1529981155', 'w97292369', 'w97292312', 'w97292354', 'w1529981154', 'w123385321', 'w301616234']) {
    assert.ok(G.get(id)?.length, `${id} registered`);
    for (const r of G.get(id)) for (const [x, z] of r) assert.ok(Number.isFinite(x) && Number.isFinite(z));
  }
  // the houses without a batch stay with js/buildings.js
  for (const id of ['w123380397', 'w219449797', 'w219454706']) assert.ok(!G.has(id), `${id} left alone`);
});

test('the floors add up: each house\'s floors over its ground floor to its main roof', () => {
  const main = {
    casty: 'casty', white: 'white', raif: 'raif', peak: 'peak', gentiana: 'gentiana', ochre: 'ochre', shopRow: 'shopRow', fifty: 'fifty',
    galerie: 'galerie', kaffee: 'kaffee', coiffure: 'coiffure', slopeSouth: 'slopeSouth', aldi: 'aldi'
  };
  for (const [h, id] of Object.entries(main)) {
    const H = HOUSES[h], p = part(id);
    const n = (p.top - (p.parapet ?? H.parapet) - H.shop) / H.storey;
    assert.ok(Math.abs(n - Math.round(n)) < 0.2 && Math.round(n) >= 1, `${h}: ${n.toFixed(2)} floors`);
    assert.ok(H.shop - H.floor > 2.9 && H.shop - H.floor < 5, `${h}: a ground floor of ${(H.shop - H.floor).toFixed(1)} m`);
    assert.ok(H.storey > 2.7 && H.storey < 3.7, `${h}: a storey of ${H.storey}`);
    // the ground floor's foot within the ground round the house, the base under it
    const g = partWalls(p).flatMap((F) => [0.1, 0.5, 0.9].map((t) => groundHeight(...onWall(F, F.len * t, 0.5))));
    assert.ok(H.floor > Math.min(...g) - 0.6 && H.floor < Math.max(...g) + 0.6, `${h}: a floor at ${H.floor} on ground ${Math.min(...g).toFixed(1)}–${Math.max(...g).toFixed(1)}`);
  }
  for (const p of PARTS) {
    if (p.over) continue;
    const g = partWalls(p).flatMap((F) => [0, 0.5, 1].map((t) => groundHeight(...onWall(F, F.len * t, 0.3))));
    assert.ok(p.base < Math.min(...g) - 0.1, `${p.id}: its base ${p.base} over the ground ${Math.min(...g).toFixed(2)}`);
  }
});

test('the balconies: on their walls, over the ground floor, under the roof, over any part below them', async () => {
  stubDocument();
  const { balconyPlaces } = await import('../js/promenade-platz-nord.js');
  const places = balconyPlaces();
  assert.equal(places.length, PROMENADE_PLATZ_NORD.balconies.length, 'every balcony on a wall');
  for (const { b, p, F, s0, s1, ys } of places) {
    assert.ok(s1 - s0 >= 1, `${b.part} ${b.edge}: ${(s1 - s0).toFixed(1)} m long`);
    for (const y of ys) {
      assert.ok(y > HOUSES[p.house].shop - 0.1 && y + 1.0 < p.top, `${b.part}: a floor at ${y.toFixed(1)} under the roof`);
      for (const s of [s0, (s0 + s1) / 2, s1]) {
        const [x, z] = onWall(F, s, b.depth);
        for (const q of PARTS) if (q !== p && pointInRing(q.ring, x, z)) assert.ok(q.top < y - 0.2, `${b.part}: a balcony at ${y.toFixed(1)} into ${q.id}`);
      }
    }
  }
});

test('the shops: their fronts facing the street, every business lettered within its reach on the row\'s walls', async () => {
  stubDocument();
  const { SHOPS, ATLAS, shopFronts, signPlaces } = await import('../js/promenade-platz-nord.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.equal(SHOPS.length, PROMENADE_PLATZ_NORD.shops.length, 'every business found in js/shops-data.js');
  for (const id of PROMENADE_PLATZ_NORD.shops) assert.ok(SHOP_EXCLUSIONS.has(id));
  const fronts = shopFronts();
  assert.ok(fronts.length >= 15, `${fronts.length} shop fronts`);
  // each named front chosen
  for (const p of PARTS) if (p.fronts) for (const i of p.fronts) assert.ok(fronts.some((f) => f.p === p && f.i === i), `${p.id} ${i}: a shop front`);
  const places = signPlaces(fronts);
  assert.equal(places.length, SHOPS.length, 'a board for each business');
  for (const q of places) {
    assert.ok(q.d < 12, `${q.s.name}: ${q.d.toFixed(1)} m from its wall`);
    assert.ok(q.at - q.w / 2 >= -0.05 && q.at + q.w / 2 <= q.F.len + 0.05, `${q.s.name}: within its wall`);
    assert.ok(q.y1 > q.y0 && q.y1 < q.p.top, `${q.s.name}: under the roof`);
  }
  // the shops on the Promenade on its fronts, the hotel's board off them
  for (const q of places) if (q.s.osm !== 'w123383534') assert.ok(q.front, `${q.s.name}: on a shop front`);
  // (boards on one wall side by side)
  for (const a of places) for (const b of places) if (a !== b && a.F === b.F) assert.ok(Math.abs(a.at - b.at) >= (a.w + b.w) / 2, `${a.s.name} and ${b.s.name} overlap`);
  // the atlas' cells within it, not overlapping
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'atlas cells overlap');
  }
});

test('the neighbours: the row stays clear of the hand-built houses and the houses it leaves', async () => {
  // the Ettinger pavilion, the Schweizerhof and the UBS's house, Obere Strasse's houses near, the Alte Post, the Post
  // and the Coop, the small house by the Kaffeeklatsch (js/unsurveyed-buildings-data.js), the houses left alone
  const ids = ['w116881169', 'w123380406', 'w123380397', 'w1529973400', 'w123385325', 'w123385309', 'w117012149', 'w97292337', 'w1529977469',
    'w1530032380', 'w97292375', 'w1530032377', 'w219449797', 'w219454706', 'w219451497', 'w99094506', 'w1416686971', 'w123383543'];
  const theirs = ids.map(osmRing).filter(Boolean);
  assert.ok(theirs.length >= 15);
  for (const t of theirs) for (const p of PARTS) {
    for (const [x, z] of p.ring) assert.ok(!pointInRing(t, x, z), `${p.id} at ${x}, ${z} inside a neighbour`);
  }
  // the surveyed outlines of the hand-built neighbours: the Schweizerhof's and the UBS's (js/schweizerhof-data.js), the
  // Ettinger pavilion's (js/ettinger-platz-data.js)
  const { groundOutlines: schweizerhof } = await import('../js/schweizerhof-data.js');
  const { groundOutlines: ettinger } = await import('../js/ettinger-platz-data.js');
  for (const t of [...schweizerhof(), ...ettinger()]) for (const p of PARTS) {
    for (const [x, z] of p.ring) assert.ok(!pointInRing(t, x, z), `${p.id} at ${x}, ${z} inside a neighbour's survey`);
    for (const [x, z] of t) assert.ok(!pointInRing(p.ring, x, z), `a neighbour's survey at ${x}, ${z} inside ${p.id}`);
  }
  // the batches left out are the row's: none of the neighbours' (js/ettinger-platz.js, js/schweizerhof.js, …) near
  for (const e of PROMENADE_PLATZ_NORD.exclude) for (const t of theirs) assert.ok(!pointInRing(t, e.x, e.z), `${e.x}, ${e.z} in a neighbour`);
});

test('the missions\' doors and starts near the row stay outside it, with room before them', async () => {
  for (const [x, z] of [...PROMENADE_PLATZ_NORD.doors, ...PROMENADE_PLATZ_NORD.starts]) {
    assert.ok(!insideRow(x, z), `a door at ${x}, ${z} inside the row`);
    for (let a = 0; a < 8; a++) assert.ok(!insideRow(x + 0.5 * Math.cos(a), z + 0.5 * Math.sin(a)), `a door at ${x}, ${z} against a wall`);
  }
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
  const near = points.filter(([x, z]) => x > -800 && x < -570 && z > -30 && z < 450);
  assert.ok(near.length >= 2);
  for (const [x, z] of near) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
});

test('the row in Node: every vertex finite, five meshes, the phone\'s materials light, no colliders of its own', async () => {
  stubDocument();
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { buildPromenadePlatzNord } = await import('../js/promenade-platz-nord.js');
  for (const [id, rings] of groundOutlines()) assert.equal(SURVEYED_FOOTPRINTS.get(id)?.length, rings.length, `${id} registered`);
  // (SIMPLE_SKINS' materials marked as they are made: on the phone every material is one of them, the trim's vertex
  // colours or the decals')
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const xs = PARTS.flatMap((p) => p.ring);
  const box = { x0: Math.min(...xs.map((q) => q[0])) - 4, x1: Math.max(...xs.map((q) => q[0])) + 4, z0: Math.min(...xs.map((q) => q[1])) - 4, z1: Math.max(...xs.map((q) => q[1])) + 4 };
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildPromenadePlatzNord(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Promenade Platz Nord ', '')).sort();
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
        assert.ok(y > -9.5 && y < 24.5, `${m.name}: a height of ${y}`);
        assert.ok(x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1, `${m.name}: a vertex out at ${x}, ${z}`);
      }
      // the walls carry each house's colour (the lozenges' flag on the desktop only), the walls' grid its half lengths
      if (m.name.endsWith('walls')) {
        const c = m.geometry.attributes.color;
        assert.ok(c && m.geometry.attributes.aHalf);
        let flagged = 0;
        for (let i = 0; i < c.count; i++) if (c.getX(i) > 1.5) flagged++;
        assert.ok(simple ? flagged === 0 : flagged > 0, `${flagged} vertices with the lozenges`);
      }
      if (m.name.endsWith('trim')) assert.equal(m.geometry.attributes.color.count, p.count);
    }
    assert.ok(tris < 15000, `${tris} triangles`);
    assert.deepEqual(colliders, []);
  }
});

test('the excluded batches: each a rebuilt part\'s, none another\'s', () => {
  for (const e of PROMENADE_PLATZ_NORD.exclude) {
    assert.ok(PARTS.some((p) => pointInRing(p.ring, e.x, e.z) || p.ring.some((q) => Math.hypot(q[0] - e.x, q[1] - e.z) < 12)), `${e.x}, ${e.z}`);
    for (const f of PROMENADE_PLATZ_NORD.exclude) if (f !== e) assert.ok(Math.hypot(f.x - e.x, f.z - e.z) > e.r + f.r - 0.5);
  }
  for (const p of PARTS) assert.ok(outwardRing(p.ring).length === p.ring.length);
});
