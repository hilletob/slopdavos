import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, PARTS, PROMENADE_PLATZ, facesPromenade, groundOutlines, insideRow, onWall, outwardRing, p60South, part, partWalls, pointInRing, ringArea2
} from '../js/promenade-platz-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((x) => x.id === id);
  if (!b) return null;
  const out = [];
  for (let i = 0; i < b.ring.length; i += 2) out.push([b.ring[i], b.ring[i + 1]]);
  return out;
};
const allRings = () => [...groundOutlines().values()].flat().concat(PARTS.filter((p) => !p.osm && !p.attic).map((p) => p.ring));

test('the outlines: of some size, the walls facing out, each in its OpenStreetMap building', () => {
  for (const p of PARTS) {
    assert.ok(Math.abs(ringArea2(p.ring)) / 2 > 10, `${p.id}: an outline of some size`);
    assert.ok(p.top > p.base + 2, `${p.id}: a top over its base`);
    // a step out of each wall's middle leaves its outline, a step in is inside
    for (const F of partWalls(p)) {
      if (F.len < 0.6) continue;
      assert.ok(!pointInRing(p.ring, ...onWall(F, F.len / 2, 0.1)), `${p.id}: a wall facing in`);
      assert.ok(pointInRing(p.ring, ...onWall(F, F.len / 2, -0.1)), `${p.id}: a wall facing out`);
    }
    // its middle in OpenStreetMap's footprint (or close: the survey's walls stand off it)
    if (p.osm && !p.shaft) {
      const own = osmRing(p.osm);
      assert.ok(own, `${p.osm}: an OpenStreetMap building`);
      const [cx, cz] = p.ring.reduce((s, q) => [s[0] + q[0] / p.ring.length, s[1] + q[1] / p.ring.length], [0, 0]);
      const d = own.reduce((m, q) => Math.min(m, Math.hypot(q[0] - cx, q[1] - cz)), Infinity);
      assert.ok(pointInRing(own, cx, cz) || d < 6, `${p.id}: its middle off ${p.osm}`);
    }
  }
  // the outlines registered for the player's walls: every rebuilt OpenStreetMap building, Promenade 60's southern part
  const G = groundOutlines();
  for (const id of ['w123380413', 'w123384642', 'w123384614', 'w123384625', 'w123384636', 'w123382382', 'w225902143', 'w225902144', 'w123384640', 'w123384629', 'w123384615']) {
    assert.ok(G.get(id)?.length, `${id} registered`);
    for (const r of G.get(id)) for (const [x, z] of r) assert.ok(Number.isFinite(x) && Number.isFinite(z));
  }
  const south = p60South();
  assert.ok(south.length >= 4 && Math.abs(ringArea2(south)) / 2 > 200, 'Promenade 60\'s southern part');
  for (const q of south) assert.ok(q[1] >= -159.5, `the southern part reaches north to ${q[1]}`);
  // the attic and the hipped roof stand within Promenade 60's walls
  for (const [x, z] of part('p60attic').ring) assert.ok(pointInRing(part('p60').ring, x, z));
});

test('the floors add up: each house\'s floors over its shops to its main roof', () => {
  const main = { p60: 'p60', bike: 'bike', yellow: 'yellow', cream: 'cream', grey: 'grey', mint: 'mint', raiffeisen: 'raiffeisen', lemon: 'lemon', fortuna: 'fortuna', angn: 'angn' };
  for (const [h, id] of Object.entries(main)) {
    const H = HOUSES[h], p = part(id);
    const n = (p.top - H.parapet - H.shop) / H.storey;
    assert.ok(Math.abs(n - Math.round(n)) < 0.2 && Math.round(n) >= 3, `${h}: ${n.toFixed(2)} floors`);
    assert.ok(H.shop - H.floor > 3.5 && H.shop - H.floor < 5, `${h}: a ground floor of ${(H.shop - H.floor).toFixed(1)} m`);
    assert.ok(H.storey > 2.7 && H.storey < 3.4, `${h}: a storey of ${H.storey}`);
  }
});

test('the balconies: on their walls, over the shops, under the roof, not into a neighbouring part', async () => {
  const { namedWall } = await import('../js/promenade-platz-data.js');
  for (const b of PROMENADE_PLATZ.balconies) {
    const p = part(b.part), H = HOUSES[p.house], F = namedWall(p, b.edge);
    assert.ok(F, `${b.part} ${b.edge}: a wall`);
    const s0 = Math.max(0, b.s0 < 0 ? F.len + b.s0 : b.s0), s1 = Math.min(F.len, b.s1 < 0 ? F.len + b.s1 : b.s1);
    assert.ok(s1 - s0 >= 1, `${b.part} ${b.edge}: ${(s1 - s0).toFixed(1)} m long`);
    for (const k of b.floors) {
      const y = H.shop + (k - 1) * H.storey;
      assert.ok(k >= 1 && y + 1.0 < p.top, `${b.part}: floor ${k} under the roof`);
    }
    for (const s of [s0, (s0 + s1) / 2, s1]) {
      const [x, z] = onWall(F, s, b.depth);
      assert.ok(!PARTS.some((q) => q !== p && !q.attic && q.top > H.shop && pointInRing(q.ring, x, z)), `${b.part}: a balcony into another part`);
    }
  }
});

test('the shops: their fronts on the walls facing the Promenade, every business lettered within its reach', async () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const { SHOPS, ATLAS, shopFronts, signPlaces } = await import('../js/promenade-platz.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.equal(SHOPS.length, PROMENADE_PLATZ.shops.length, 'every business found in js/shops-data.js');
  for (const id of PROMENADE_PLATZ.shops) assert.ok(SHOP_EXCLUSIONS.has(id));
  const fronts = shopFronts();
  assert.ok(fronts.length >= 12);
  for (const f of fronts) assert.ok(facesPromenade(f.F));
  const places = signPlaces(fronts);
  assert.equal(places.length, SHOPS.length, 'a board for each business');
  for (const q of places) {
    assert.ok(q.d < 12, `${q.s.name}: ${q.d.toFixed(1)} m from its wall`);
    assert.ok(q.at - q.w / 2 >= -0.05 && q.at + q.w / 2 <= q.F.len + 0.05, `${q.s.name}: within its wall`);
  }
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

test('the neighbours: the row stays clear of the hand-built houses beside it', async () => {
  // the Hard Rock Hotel's, the Central Sporthotel's and Schneider's outlines, the Post's
  const theirs = ['w225910169', 'w123382367', 'w110590690', 'w123382386', 'w1529620022'].map(osmRing).filter(Boolean);
  assert.ok(theirs.length >= 4);
  for (const t of theirs) for (const r of allRings()) {
    for (const [x, z] of r) assert.ok(!pointInRing(t, x, z), `the row at ${x}, ${z} inside a neighbour`);
  }
});

test('the missions\' doors and starts near the row stay outside it, with room before them', async () => {
  for (const [x, z] of PROMENADE_PLATZ.doors) {
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
  const near = points.filter(([x, z]) => x > -600 && x < -350 && z > -420 && z < -120);
  assert.ok(near.length >= 3);
  for (const [x, z] of near) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
});

test('the row in Node: every vertex finite, five meshes, the phone\'s materials light, its colliders', async () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { buildPromenadePlatz } = await import('../js/promenade-platz.js');
  for (const [id, rings] of groundOutlines()) assert.equal(SURVEYED_FOOTPRINTS.get(id)?.length, rings.length, `${id} registered`);
  // (SIMPLE_SKINS' materials marked as they are made: on the phone every material is one of them, the trim's vertex
  // colours or the decals')
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const xs = allRings().flat();
  const box = { x0: Math.min(...xs.map((q) => q[0])) - 3, x1: Math.max(...xs.map((q) => q[0])) + 3, z0: Math.min(...xs.map((q) => q[1])) - 3, z1: Math.max(...xs.map((q) => q[1])) + 3 };
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildPromenadePlatz(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Promenade Platz ', '')).sort();
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
        assert.ok(y > -14 && y < 22.5, `${m.name}: a height of ${y}`);
        assert.ok(x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1, `${m.name}: a vertex out at ${x}, ${z}`);
      }
      // the walls carry each house's colour, the walls' grid its half lengths
      if (m.name.endsWith('walls')) { assert.ok(m.geometry.attributes.color); assert.ok(m.geometry.attributes.aHalf); }
      if (m.name.endsWith('trim')) assert.equal(m.geometry.attributes.color.count, p.count);
    }
    assert.ok(tris < 40000, `${tris} triangles`);
    // the colliders: the low part's walls before w123384637, at world heights
    assert.ok(colliders.length >= 5);
    for (const c of colliders) {
      for (const v of [c.minX, c.maxX, c.minZ, c.maxZ, c.baseY, c.maxY, c.obb.cx, c.obb.cz, c.obb.hx]) assert.ok(Number.isFinite(v));
      assert.ok(c.maxY > c.baseY);
    }
  }
});

test('the excluded batches: each a rebuilt part\'s, none another\'s', () => {
  for (const e of PROMENADE_PLATZ.exclude) {
    assert.ok(PARTS.some((p) => pointInRing(p.ring, e.x, e.z) || p.ring.some((q) => Math.hypot(q[0] - e.x, q[1] - e.z) < 12)), `${e.x}, ${e.z}`);
    for (const f of PROMENADE_PLATZ.exclude) if (f !== e) assert.ok(Math.hypot(f.x - e.x, f.z - e.z) > e.r + f.r - 0.5);
  }
  for (const p of PARTS) assert.ok(outwardRing(p.ring).length === p.ring.length);
});
