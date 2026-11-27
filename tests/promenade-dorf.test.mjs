import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, SHOP_IDS, STOREY, WIN, featureY, groundOutlines, hips, insideRow, onWall, outwardRing, partTop, pointInRing, ringArea2, roofRing, roofY,
  wallFrame, wallOut
} from '../js/promenade-dorf-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { SHOPS_DATA } from '../js/shops-data.js';
import { groundHeight } from '../js/terrain.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};
const IDS = ['w117012246', 'w117012272', 'w117012250', 'w117012353', 'w118240647'];
const near = ([x, z]) => x > 540 && x < 680 && z > -1380 && z < -1200;

test('the row: its six houses, the three surveyed batches excluded once each, every house at its OSM footprint', () => {
  assert.deepEqual(HOUSES.map((h) => h.id).filter(Boolean).sort(), [...IDS].sort());
  // (the bank's house: no building in OpenStreetMap, its walls the module's colliders)
  const bank = HOUSES.find((h) => !h.id);
  assert.ok(bank.key === 'gkb-dorf' && bank.colliders && !DAVOS_DATA.buildings.some((b) => osmRing(b.id).some(([x, z]) => pointInRing(bank.parts[0].ring, x, z))));
  const all = HOUSES.flatMap((h) => h.exclude);
  // (batch 15 of tile 11/1752/1021 holds the three houses east of the street, batch 17 the two west of it, batch 13 of
  // 11/1752/1022 the bank's)
  assert.deepEqual(all.map((e) => [e.x, e.z, e.r]), [[612.6, -1276.2, 3], [589.4, -1322.5, 3], [608.1, -1363.2, 3]]);
  for (const h of HOUSES.filter((q) => q.id)) {
    const own = osmRing(h.id);
    assert.ok(own, `${h.id} in OpenStreetMap`);
    const [cx, cz] = own.reduce(([a, b], [x, z]) => [a + x / own.length, b + z / own.length], [0, 0]);
    assert.ok(groundOutlines(h).some((r) => pointInRing(r, cx, cz)), `${h.id}: its outlines away from OSM's`);
    // (most of OSM's footprint under the surveyed outlines)
    let inside = 0, n = 0;
    for (let x = Math.min(...own.map((p) => p[0])); x < Math.max(...own.map((p) => p[0])); x += 1) {
      for (let z = Math.min(...own.map((p) => p[1])); z < Math.max(...own.map((p) => p[1])); z += 1) {
        if (!pointInRing(own, x, z)) continue;
        n++;
        if (groundOutlines(h).some((r) => pointInRing(r, x, z))) inside++;
      }
    }
    assert.ok(inside / n > 0.8, `${h.id}: ${Math.round((100 * inside) / n)} % of OSM's footprint covered`);
  }
});

test('the outlines: of some size, simple, the walls facing out, the parts not overlapping', () => {
  const parts = [];
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    parts.push(ring);
    assert.ok(ring.length >= 3 && Math.abs(ringArea2(ring)) / 2 > 8, `${h.id}: an outline of some size`);
    const n = ring.length;
    const cross = (p, q, r, s) => {
      const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      return d(p, q, r) * d(p, q, s) < -1e-9 && d(r, s, p) * d(r, s, q) < -1e-9;
    };
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      assert.ok(!cross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]), `${h.id}: an outline crossing itself`);
    }
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1.5) continue;
      assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.2)), `${h.id}: a step out of a wall leaves the outline`);
      assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.2)), `${h.id}: a step back is inside`);
    }
  }
  // (no two parts on the same ground: a grid over the row, each point in one part at most, the survey's walls shared
  // within 0.2 m)
  const edgeDist = (r, x, z) => Math.min(...r.map((a, i) => {
    const b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  }));
  for (let x = 570.037; x < 640; x += 0.7) for (let z = -1350.023; z < -1240; z += 0.7) {
    const deep = parts.filter((r) => pointInRing(r, x, z) && edgeDist(r, x, z) > 0.2);
    assert.ok(deep.length <= 1, `two parts at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
  // the features' walls face out of their house at their height
  for (const h of HOUSES) for (const f of [...(h.balconies || []), ...(h.shops || []), ...(h.letters || []), ...(h.bays || [])]) {
    const F = wallOut(h, f.on[0], f.on[1], featureY(f));
    const [x, z] = onWall(F, F.len / 2, 0.5);
    assert.ok(!h.parts.some((p) => pointInRing(p.ring, x, z) && partTop(h, p, x, z) > featureY(f)), `${h.id}: a feature facing in`);
    assert.ok(f.s0 >= 0 && f.s1 <= F.len + 1e-6 && f.s1 > f.s0, `${h.id}: a feature off its wall`);
  }
});

test('the roofs: hipped over their walls with an overhang, the walls\' tops under them at the surveyed heights', () => {
  for (const h of HOUSES) for (const R of h.roofs || []) {
    assert.ok(R.y > R.eaves + 1 && R.cL > 1 && R.cR > 1);
    const [h0, h1] = hips(R);
    assert.ok(h0 > 0 && h1 > 0);
    const ring = roofRing(R);
    for (const p of h.parts.filter((q) => q.roofs)) {
      for (const [x, z] of p.ring) {
        assert.ok(pointInRing(ring, x, z), `${h.id}: a wall's corner outside its roof`);
        const y = roofY(R, x, z);
        assert.ok(y !== null && y > R.eaves && y < R.y);
        // (the wall's top within a few decimetres of the survey's flat roof)
        const t = partTop(h, p, x, z);
        assert.ok(Math.abs(t - (h.id === 'w117012246' ? 13.35 : 16.04)) < 0.5, `${h.id}: a wall's top of ${t.toFixed(2)}`);
      }
    }
  }
});

test('the floors add up: windows under the roofs, the balconies on storeys\' feet, the shops\' glass over the ground', () => {
  assert.ok(WIN.lo > 0.5 && WIN.hi < STOREY - 0.4);
  for (const h of HOUSES) {
    assert.ok(h.base < h.floor + 0.01 && Number.isFinite(h.floor), `${h.id}: the walls reach under the floor`);
    for (const p of h.parts) for (const [x, z] of p.ring) assert.ok(groundHeight(x, z) > h.base + 0.2, `${h.id}: the ground under its walls' foot`);
    for (const Bl of h.balconies || []) for (const y of Bl.floors) {
      const k = (y - h.floor) / STOREY;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6 && k >= 1, `${h.id}: a balcony at ${y} off the storeys`);
    }
    // a shop's fascia under its house's top, its glass 1.2 m high at least over the ground along it
    const topMost = Math.max(...h.parts.map((p) => (p.top !== undefined ? p.top : 13)));
    for (const s of h.shops || []) {
      assert.ok(s.top < topMost, `${h.id}: a shop over its house`);
      const F = wallOut(h, s.on[0], s.on[1], featureY(s));
      let g = -Infinity;
      for (let k = 0; k <= 40; k++) g = Math.max(g, groundHeight(...onWall(F, s.s0 + ((s.s1 - s.s0) * k) / 40, 0.5)));
      assert.ok(s.top - (s.fascia ?? 0.6) - (g + 0.35) >= 1.2, `${h.id}: a shop's glass cut by the ground`);
    }
    // lettering on a wall: over the ground, under the wall's top
    for (const L of h.letters || []) {
      const F = wallOut(h, L.on[0], L.on[1], featureY(L));
      for (const s of [L.s0, L.s1]) assert.ok(groundHeight(...onWall(F, s, 0.5)) < L.y0 - 0.3, `${h.id}: ${L.key} in the ground`);
    }
  }
  // the kiosk is one storey, as the photographs show it (the survey has 7 m)
  assert.ok(HOUSES[0].parts[1].top < 0.5);
});

test('the neighbours: nothing of the row inside a house it does not rebuild, the hand-built ones nearby clear', () => {
  const mine = new Set(IDS);
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id)).map((b) => ({ id: b.id, ring: osmRing(b.id) }))
    .filter((o) => o.ring.some(near));
  assert.ok(others.length > 10);
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1) continue;
      const [x, z] = onWall(F, F.len / 2, -1.0);
      for (const o of others) assert.ok(!pointInRing(o.ring, x, z), `${h.id} at ${x.toFixed(1)}, ${z.toFixed(1)} inside ${o.id}`);
    }
  }
  // the Migros Dorf (js/migros-dorf.js), the Peter Frei chalet (js/dischma-row-a.js), the Weber, the small hut east of
  // the Falclas stay outside
  for (const [x, z] of [[627.6, -1324.9], [632.8, -1315.7], [597.5, -1226.8], [599.1, -1233.6], [642.1, -1352.9], [629.5, -1267.5]]) assert.ok(!insideRow(x, z), `${x}, ${z}`);
});

test('the shops\' signs: lettered here on their own houses\' walls, left out of js/shops.js', () => {
  assert.equal(SHOP_IDS.length, 5);
  for (const id of SHOP_IDS) {
    const s = SHOPS_DATA.find((q) => q.osm === id);
    assert.ok(s, `${id} in js/shops-data.js`);
    // (its house the one whose outlines are nearest)
    const h = HOUSES.find((q) => (q.shopIds || []).includes(id));
    const d = Math.min(...groundOutlines(h).flatMap((r) => outwardRing(r).map((a, i, R) => {
      const F = wallFrame(a, R[(i + 1) % R.length]), [t, c] = [(s.x - F.a[0]) * F.u[0] + (s.z - F.a[1]) * F.u[1], (s.x - F.a[0]) * F.n[0] + (s.z - F.a[1]) * F.n[1]];
      return t >= 0 && t <= F.len ? Math.abs(c) : Math.min(Math.hypot(s.x - a[0], s.z - a[1]));
    })));
    assert.ok(d < 8, `${s.name} ${d.toFixed(1)} m off its house`);
  }
});

test('the missions\' places near the row stay outside it', async () => {
  const dir = new URL('../js/', import.meta.url);
  const points = [];
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 6) return;
    if (typeof v.x === 'number' && typeof v.z === 'number') points.push([v.x, v.z]);
    if (Array.isArray(v) && v.length >= 2 && v.length <= 3 && v.every((q) => typeof q === 'number')) points.push(v.length === 3 ? [v[0], v[2]] : [v[0], v[1]]);
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  for (const f of readdirSync(dir).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    let mod;
    try { mod = await import(new URL(f, dir)); } catch { continue; }
    for (const k of Object.keys(mod)) if (typeof mod[k] === 'object') walk(mod[k], 0);
  }
  assert.ok(points.length > 20, 'the missions\' places read');
  const close = points.filter(near);
  assert.ok(close.length > 0, 'some near the row (the building site\'s start on the Promenade\'s kerb)');
  for (const [x, z] of close) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
  // the street itself stays clear: the Promenade's middle from the Peter Frei chalet to the Migros' square
  const street = DAVOS_DATA.roads.filter((r) => r.name === 'Promenade');
  let probed = 0;
  for (const r of street) for (let i = 0; i < r.pts.length; i += 2) {
    if (!near([r.pts[i], r.pts[i + 1]])) continue;
    probed++;
    assert.ok(!insideRow(r.pts[i], r.pts[i + 1]), `the Promenade at ${r.pts[i]}, ${r.pts[i + 1]} inside the row`);
  }
  assert.ok(probed > 2);
});

test('the row in Node: every vertex finite, five meshes, the phone\'s materials plain, the outlines registered, the bank\'s colliders', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildPromenadeDorf, ATLAS, aspectOf } = await import('../js/promenade-dorf.js');
  for (const h of HOUSES.filter((q) => q.id)) assert.equal(SURVEYED_FOOTPRINTS.get(h.id).length, groundOutlines(h).length);
  assert.ok(!SURVEYED_FOOTPRINTS.has(null) && !SURVEYED_FOOTPRINTS.has(undefined));
  for (const id of SHOP_IDS) assert.ok(SHOP_EXCLUSIONS.has(id));
  // the atlas' cells inside it, none overlapping; every key used drawn
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 256);
  // (the bank's name once: on its fascia, nowhere else in the row, no sign of it in js/shops-data.js near)
  assert.equal(HOUSES.flatMap((h) => [...(h.shops || []).map((q) => q.sign), ...(h.letters || []).map((q) => q.key)]).filter((k) => k === 'gkb').length, 1);
  assert.ok(!SHOPS_DATA.some((q) => /kantonalbank|gkb/i.test(q.name) && q.x > 580 && q.x < 640 && q.z > -1390 && q.z < -1340));
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'two cells overlapping');
  }
  for (const h of HOUSES) {
    for (const s of h.shops || []) if (s.sign) assert.ok(ATLAS[s.sign], s.sign);
    // lettering on a wall: within its stretch
    for (const L of h.letters || []) {
      assert.ok(ATLAS[L.key], L.key);
      const w = Math.min((L.y1 - L.y0) * aspectOf(L.key), L.s1 - L.s0), F = wallOut(h, L.on[0], L.on[1], featureY(L)), m = (L.s0 + L.s1) / 2;
      assert.ok(m - w / 2 >= 0 && m + w / 2 <= F.len, `${L.key} off its wall`);
    }
  }
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildPromenadeDorf(scene);
    QUALITY.simpleMaterials = was;
    // the bank's walls: one thin box along each, at world heights, from under the ground to its roofs
    const bank = HOUSES.find((h) => !h.id);
    assert.equal(colliders.length, bank.parts.reduce((n, p) => n + p.ring.length, 0));
    for (const c of colliders) {
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
      assert.ok(c.baseY === bank.base && c.maxY > c.baseY + 6 && c.obb.hx > 0.1 && Math.abs(Math.hypot(c.obb.cs, c.obb.sn) - 1) < 1e-9);
      assert.ok(groundHeight(c.obb.cx, c.obb.cz) > c.baseY, 'a collider over the ground');
    }
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Promenade Dorf ', '')).sort();
    assert.deepEqual(names, ['decal', 'glass', 'roof', 'trim', 'walls']);
    let tris = 0;
    for (const m of group.children) {
      const M = m.material;
      assert.ok(M, `${m.name}: a material`);
      if (simple) {
        const decal = M.opacityNode && M.transparent && !M.emissiveNode && !M.roughnessNode;
        const procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
        assert.ok(M.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
      }
      const g = m.geometry, p = g.attributes.position;
      assert.ok(p.count > 0);
      tris += p.count / 3;
      for (const name of Object.keys(g.attributes)) {
        const a = g.attributes[name].array;
        for (let i = 0; i < a.length; i++) assert.ok(Number.isFinite(a[i]), `${m.name}: a ${name} not finite`);
        if (name === 'color' || name === 'aHalf') assert.equal(g.attributes[name].count, p.count);
      }
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -7.5 && p.array[i] < 18.5, `${m.name}: a height of ${p.array[i]}`);
    }
    assert.ok(tris < 20000, `${tris} triangles`);
  }
});
