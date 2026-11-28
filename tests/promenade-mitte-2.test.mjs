import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  ATLAS, ATLAS_SIZE, BOARDS, DOORS, EXCLUDE, HOUSES, LOOKS, SHOPFRONTS, SHOP_NODES, allOutlines, groundOutlines, houseOf, insideRow,
  lookOf, nearestWall, onWall, outerWalls, outwardRing, pointInRing, ringArea2, roofHeights, shopWall, upperWalls, wallFrame
} from '../js/promenade-mitte-2-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { groundHeight } from '../js/terrain.js';
import { SHOPS_DATA } from '../js/shops-data.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};
const centroid = (ring) => ring.reduce((a, [x, z]) => [a[0] + x / ring.length, a[1] + z / ring.length], [0, 0]);
// the distance from a point to a ring's walls
const toWalls = (ring, x, z) => {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const W = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (W.len < 1e-6) continue;
    const s = Math.max(0, Math.min(W.len, (x - W.a[0]) * W.u[0] + (z - W.a[1]) * W.u[1]));
    const [px, pz] = onWall(W, s);
    d = Math.min(d, Math.hypot(px - x, pz - z));
  }
  return d;
};

test('the outlines: of some size, the walls facing out, each house on its own OpenStreetMap footprint', () => {
  assert.equal(HOUSES.length, 9);
  for (const h of HOUSES) {
    const own = osmRing(h.osm);
    assert.ok(own, `${h.osm} is an OpenStreetMap building`);
    const outlines = groundOutlines(h.osm);
    assert.ok(outlines.length >= 1);
    for (const ring of outlines) {
      assert.ok(Math.abs(ringArea2(ring)) / 2 > 40, `${h.osm}: an outline of some size`);
      const R = outwardRing(ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len < 1) continue;
        assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.1)), `${h.osm}: a step out of a wall leaves the outline`);
        assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.1)));
      }
      for (const [x, z] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(z));
    }
    // the biggest outline's middle within its OSM footprint
    const big = outlines.reduce((a, b) => (Math.abs(ringArea2(b)) > Math.abs(ringArea2(a)) ? b : a));
    assert.ok(pointInRing(own, ...centroid(big)), `${h.osm}: its outline on its footprint`);
    // the OSM buildings the survey's outline covers lie under it
    for (const id of h.covers || []) assert.ok(pointInRing(big, ...centroid(osmRing(id))), `${id} under ${h.osm}'s outline`);
  }
  // the surveyed sizes: Gourmet Käch's 329 m², the anthracite block's 841 m², the taupe corner house's 309 m²
  const area = (osm) => groundOutlines(osm).reduce((s, r) => s + Math.abs(ringArea2(r)) / 2, 0);
  assert.ok(Math.abs(area('w116881198') - 325) < 12);
  assert.ok(Math.abs(area('w219439370') - 841) < 15);
  assert.ok(Math.abs(area('w219440394') - 300) < 15);
});

test('the roofs: surveyed triangles over the outlines, at the surveyed heights; the walls on lower roofs standing on them', () => {
  const top = { w116881198: 13.03, w117012145: 12.85, w117012150: 6.83, w116881221: 13.81, w219440394: 22.51, w219439370: 24.26 };
  for (const h of HOUSES) {
    for (const p of h.parts) {
      assert.ok(p.roof.length >= 2, `${h.osm}: a roof`);
      for (const t of p.roof) { assert.equal(t.length, 9); for (const v of t) assert.ok(Number.isFinite(v)); }
      // the roof covers the outline's middle
      const [cx, cz] = centroid(p.ring);
      assert.ok(roofHeights(p.roof, cx, cz).length >= 1, `${h.osm}: the roof over its middle`);
    }
    if (top[h.osm]) assert.ok(Math.abs(Math.max(...h.parts[0].roof.flatMap((t) => [t[1], t[4], t[7]])) - top[h.osm]) < 0.1, h.osm);
    // (a wall on a lower roof: a higher roof behind it than before it)
    const all = h.parts.flatMap((p) => p.roof), topAt = (x, z) => Math.max(-Infinity, ...roofHeights(all, x, z));
    for (const u of upperWalls(h)) {
      const o = Math.min(0.4, u.F.len / 3);
      assert.ok(topAt(...onWall(u.F, u.F.len / 2, -o)) > topAt(...onWall(u.F, u.F.len / 2, o)) + 0.3, `${h.osm}: a wall on a lower roof`);
      assert.ok(topAt(...onWall(u.F, u.F.len / 2, -o)) > u.bottom + 0.5, `${h.osm}: the wall under a roof over its foot`);
    }
  }
  // the Villa Silvana: the mansard, the tower's bell roof up to its spire at 23 m, the turret's cone
  const villa = houseOf('w127653800').parts[0].roof;
  assert.ok(villa.length > 150);
  assert.ok(Math.abs(Math.max(...villa.flatMap((t) => [t[1], t[4], t[7]])) - 23.08) < 0.1);
  assert.ok(Math.max(...roofHeights(villa, 356.9, -711.9)) > 22.5, "the tower's spire");
  assert.ok(Math.max(...roofHeights(villa, 350.1, -697.9)) > 19.5, "the turret's cone");
  // the Green Wildman: the higher part's walls on the lower's roof
  assert.equal(upperWalls(houseOf('w118240606')).length, 2);
});

test('the floors fit under the roofs, the shops under the floors\' grid', () => {
  for (const L of Object.values(LOOKS)) assert.ok(L.lo > 0.4 && L.hi < L.storey - 0.4 && L.half > 0.4 && L.bay > 2 * L.half + 0.6);
  // the shop fronts' tops under their house's grid's origin (so no window row cuts their fascias)
  for (const S of SHOPFRONTS) {
    const { F, s0, s1 } = shopWall(S);
    let g = -Infinity;
    for (let k = 0; k <= 20; k++) g = Math.max(g, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / 20, 0.5)));
    assert.ok(g + S.h <= lookOf(houseOf(S.house)).floor0 + 0.05, `${S.house}: its shop front (${(g + S.h).toFixed(2)}) under its floors' grid`);
    assert.ok(g + S.h > lookOf(houseOf(S.house)).floor0 - 0.6, `${S.house}: and not far under it`);
  }
  // Gourmet Käch: its three floors' windows under the cornice; the anthracite block's five over Escher's
  const k = LOOKS.kaech;
  assert.ok(k.floor0 + 2 * k.storey + k.hi + 0.3 < 13.03 - 0.35 + 0.1 && k.floor0 + 3 * k.storey + k.hi > 13.03);
  const a = LOOKS.anthracite;
  assert.ok(a.floor0 + 4 * a.storey + a.hi + 0.3 < 24.26 && a.floor0 + 5 * a.storey + a.hi > 24.26);
});

test('the shop fronts, doors and boards on their walls; the lettering within them; the atlas\' cells apart', () => {
  for (const S of SHOPFRONTS) {
    const w = shopWall(S);
    assert.ok(w, `${S.house}: its shop front on a wall of its outline`);
    assert.ok(w.s1 - w.s0 > 3);
    assert.ok(!insideRow(...onWall(w.F, (w.s0 + w.s1) / 2, 0.3)), `${S.house}: the front faces out`);
    for (const sg of S.signs || []) assert.ok(sg.w + 0.4 < w.s1 - w.s0, `${sg.key} within its front`);
  }
  for (const d of DOORS) {
    const w = nearestWall(houseOf(d.house), d.at);
    assert.ok(w && w.d < 1.2 && w.F.len > 2.2, `${d.house}: a door on a wall`);
  }
  for (const b of BOARDS) {
    const w = nearestWall(houseOf(b.house), b.near);
    assert.ok(w && w.d < 1.2 && b.w + 0.4 < w.F.len, `${b.key} on its wall`);
  }
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= ATLAS_SIZE[0] && y + h <= ATLAS_SIZE[1]);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'cells apart');
  }
  // the lettered businesses: each within 8 m of its house's walls
  for (const n of SHOP_NODES) {
    const s = SHOPS_DATA.find((q) => q.osm === n);
    assert.ok(s, n);
    assert.ok(HOUSES.some((h) => groundOutlines(h.osm).some((r) => pointInRing(r, s.x, s.z) || toWalls(r, s.x, s.z) < 8)), `${s.name} at its house`);
  }
});

test('the excluded survey batches lie under the houses rebuilt', () => {
  assert.equal(EXCLUDE.length, 11);
  for (const e of EXCLUDE) {
    assert.ok(HOUSES.some((h) => groundOutlines(h.osm).some((r) => pointInRing(r, e.x, e.z))), `the batch at ${e.x}, ${e.z} under a house of the row`);
    assert.equal(e.r, 3);
  }
});

test('the neighbours: nothing of the row inside the houses around it or the hand-built ones', async () => {
  const mine = new Set(HOUSES.flatMap((h) => [h.osm, ...(h.covers || [])]));
  const around = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id) && b.ring[0] > 250 && b.ring[0] < 520 && b.ring[1] > -880 && b.ring[1] < -580);
  assert.ok(around.length > 15);
  for (const b of around) {
    const theirs = osmRing(b.id);
    for (const ring of allOutlines()) {
      // (a corner of ours deep in theirs: OSM may stand a metre off)
      for (const [x, z] of ring) if (pointInRing(theirs, x, z)) assert.ok(toWalls(theirs, x, z) < 1.2, `the row at ${x}, ${z} inside ${b.id}`);
      for (const [x, z] of theirs) if (pointInRing(ring, x, z)) assert.ok(toWalls(ring, x, z) < 1.2, `${b.id} at ${x}, ${z} inside the row`);
    }
  }
  // the hand-built rows and houses nearby: their outlines apart from ours
  const others = [];
  const pm = await import('../js/promenade-mitte-data.js');
  others.push(...pm.allOutlines());
  const am = await import('../js/ameron-data.js');
  others.push(...am.AMERON.parts.map((p) => p.ring));
  for (const name of ['bristol', 'promenade-mansard', 'talstrasse-3']) {
    const m = await import(`../js/${name}-data.js`);
    for (const v of Object.values(m)) {
      if (typeof v !== 'object' || !v) continue;
      for (const p of v.parts || []) if (Array.isArray(p.ring)) others.push(p.ring);
      for (const h of v.houses || []) for (const p of h.parts || []) if (Array.isArray(p.ring)) others.push(p.ring);
    }
  }
  assert.ok(others.length > 10);
  for (const t of others) for (const ring of allOutlines()) {
    for (const [x, z] of ring) assert.ok(!pointInRing(t, x, z) || toWalls(t, x, z) < 0.3, `the row at ${x}, ${z} inside a hand-built house`);
    for (const [x, z] of t) assert.ok(!pointInRing(ring, x, z) || toWalls(ring, x, z) < 0.3, `a hand-built house at ${x}, ${z} inside the row`);
  }
});

test("the missions' doors and starts near the row stay outside it, the Green Wildman's and Gourmet Käch's doors at their walls", async () => {
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
  assert.ok(points.length > 20, "the missions' places read");
  const near = points.filter(([x, z]) => x > 280 && x < 480 && z > -845 && z < -600);
  assert.ok(near.length >= 4, "the Wildman's and Käch's doors and starts among them");
  for (const [x, z] of near) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
  const { WILDMAN_DOOR } = await import('../js/missions-data-sport.js');
  const { KAECH } = await import('../js/missions-data-local.js');
  for (const [osm, d] of [['w118240606', WILDMAN_DOOR], ['w116881198', KAECH.door]]) {
    const dist = Math.min(...groundOutlines(osm).map((r) => toWalls(r, d.x, d.z)));
    assert.ok(dist < d.r + 0.5, `${osm}: its mission's door within reach of its walls (${dist.toFixed(2)} m)`);
  }
});

test('the row in Node: every vertex finite, six meshes, the phone build only SIMPLE_SKINS, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildPromenadeMitte2 } = await import('../js/promenade-mitte-2.js');
  for (const h of HOUSES) {
    assert.equal(SURVEYED_FOOTPRINTS.get(h.osm).length, groundOutlines(h.osm).length, h.osm);
    for (const id of h.covers || []) assert.deepEqual(SURVEYED_FOOTPRINTS.get(id), [], id);
  }
  for (const n of SHOP_NODES) assert.ok(SHOP_EXCLUSIONS.has(n));
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildPromenadeMitte2(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Promenade Mitte 2 ', '')).sort();
    assert.deepEqual(names, ['decal', 'flat', 'glass', 'roof', 'trim', 'walls']);
    let tris = 0;
    for (const m of group.children) {
      const M = m.material;
      assert.ok(M, `${m.name}: a material`);
      if (simple) {
        const decal = M.opacityNode && M.transparent && !M.emissiveNode && !M.roughnessNode;
        const procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
        assert.ok(M.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
      }
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      tris += p.count / 3;
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -8 && p.array[i] < 25, `${m.name}: a height of ${p.array[i]}`);
      for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i] > 280 && p.array[i] < 480 && p.array[i + 2] > -845 && p.array[i + 2] < -605, `${m.name}: a vertex out of the row`);
      if (m.name.endsWith('walls')) {
        for (const a of ['aWin', 'aWin2', 'aFrame', 'aHalf', 'color']) assert.ok(m.geometry.attributes[a], a);
        // (the walls' uv: v a whole storey count or closed, never NaN)
        const uvs = m.geometry.attributes.uv.array;
        for (let i = 0; i < uvs.length; i++) assert.ok(Number.isFinite(uvs[i]));
      }
    }
    assert.ok(tris < 15000, `${tris} triangles`);
  }
  // every outline's walls drawn (a vertex of the walls within 0.3 m of each corner)
  const walls = buildPromenadeMitte2(new THREE.Scene()).group.children.find((m) => m.name.endsWith('walls')).geometry.attributes.position.array;
  for (const h of HOUSES) for (const { F } of outerWalls(h)) {
    if (F.len < 1) continue;
    let hit = false;
    for (let i = 0; i < walls.length && !hit; i += 3) hit = Math.hypot(walls[i] - F.a[0], walls[i + 2] - F.a[1]) < 0.3;
    assert.ok(hit, `${h.osm}: the wall at ${F.a} drawn`);
  }
});
