import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, STOREY, WIN, groundOutlines, insideRow, onWall, outwardRing, partTop, pointInRing, ringArea2, roofRing, roofY, wallFrame, wallOut
} from '../js/promenade-west-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { groundHeight } from '../js/terrain.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};
const IDS = ['w97292460', 'w97292407', 'w97292428', 'w97292351', 'w97292464', 'w97292427', 'w97292440', 'w219457241', 'w1530258238',
  'w122816773', 'w219457242', 'w219457240', 'w122816820', 'w122816823', 'w122816745', 'w127947038', 'w127946903', 'w127946879',
  'w127947031', 'w127946882', 'w127946963'];
const BOX = ([x, z]) => x > -1290 && x < -780 && z > 430 && z < 1090;

test('the row: its houses, each excluding its surveyed batches, none excluded twice, the held houses in their batch', () => {
  assert.deepEqual(HOUSES.map((h) => h.id).sort(), [...IDS].sort());
  const all = HOUSES.flatMap((h) => h.exclude);
  assert.equal(all.length, 33);
  for (const e of all) assert.ok(e.r === 3 && Number.isFinite(e.x) && Number.isFinite(e.z));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    // (the silos' and the terrace's batches lie close together, all of the cream house)
    assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > 3 || HOUSES.find((h) => h.exclude.includes(all[i])).exclude.includes(all[j]), 'two exclusions of different houses apart');
  }
  for (const h of HOUSES) {
    const own = osmRing(h.id);
    assert.ok(own, `${h.id} in OpenStreetMap`);
    if (h.heldBy) { assert.equal(h.exclude.length, 0); assert.ok(HOUSES.some((q) => q.id === h.heldBy && q.exclude.length)); }
    else assert.ok(h.exclude.length > 0);
    const outl = groundOutlines(h);
    for (const e of h.exclude) assert.ok(outl.some((r) => pointInRing(r, e.x, e.z)) || outl.some((r) => r.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 4)), `${h.id}: a batch far off`);
    const [cx, cz] = own.reduce(([a, b], [x, z]) => [a + x / own.length, b + z / own.length], [0, 0]);
    assert.ok(outl.some((r) => pointInRing(r, cx, cz)) || outl.some((r) => r.some(([x, z]) => Math.hypot(x - cx, z - cz) < 8)), `${h.id}: its outline away from OSM's`);
  }
});

test('the outlines: of some size, simple, the walls facing out', () => {
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    assert.ok(ring.length >= 3 && Math.abs(ringArea2(ring)) / 2 > 5, `${h.id}: an outline of some size`);
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
  // the features' walls face out of their house, and lie on one of its walls
  for (const h of HOUSES) for (const f of [...(h.balconies || []), ...(h.shops || []), ...(h.garages || []), ...(h.decals || [])]) {
    const F = wallOut(h, f.on[0], f.on[1]);
    assert.ok(!h.parts.some((p) => pointInRing(p.ring, ...onWall(F, F.len / 2, 0.5))), `${h.id}: a feature facing in`);
    assert.ok(h.parts.some((p) => p.ring.some((q) => Math.hypot(q[0] - f.on[0][0], q[1] - f.on[0][1]) < 0.05)), `${h.id}: a feature off its walls`);
    if (f.s1 !== undefined) assert.ok(f.s0 >= 0 && f.s1 <= F.len + 1e-6 && f.s1 > f.s0, `${h.id}: a feature beyond its wall`);
  }
});

test('the roofs: over their walls with an overhang, the ridge over the eaves, the walls\' tops under them', () => {
  for (const h of HOUSES) for (const R of h.roofs || []) {
    assert.ok(R.y > R.eL + 0.9 && R.y > R.eR + 0.9 && R.cL > 1 && R.cR > 1, `${h.id}: a roof's pitch`);
    const ring = roofRing(R);
    assert.ok(ring.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)));
  }
  for (const h of HOUSES) for (const p of h.parts) {
    if (p.top !== undefined) { assert.ok(p.top > h.floor + 0.5, `${h.id}: a part over its floor`); continue; }
    // (each corner under one of its roofs, its wall's top between the eaves and the ridge)
    for (const [x, z] of p.ring) {
      const rs = p.roofs.map((i) => h.roofs[i]);
      assert.ok(rs.some((R) => pointInRing(roofRing(R), x, z)), `${h.id}: a wall's corner outside its roofs`);
      const t = partTop(h, p, x, z);
      assert.ok(Number.isFinite(t) && t > h.floor + 2 * STOREY && t <= Math.max(...rs.map((R) => R.y)), `${h.id}: a wall's top of ${t}`);
      const y = Math.max(...rs.map((R) => roofY(R, x, z) ?? -Infinity));
      assert.ok(y >= Math.min(...rs.map((R) => Math.min(R.eL, R.eR))) - 1e-6);
    }
  }
});

test('the floors add up: the balconies on storeys\' feet over the ground, the walls under the ground', () => {
  assert.ok(WIN.lo > 0.5 && WIN.hi < STOREY - 0.4);
  for (const h of HOUSES) {
    assert.ok(h.base < h.floor + 0.01 && Number.isFinite(h.floor), `${h.id}: the walls reach under the floor`);
    // (the walls' foot under the ground all round)
    for (const ring of groundOutlines(h)) for (const [x, z] of ring) assert.ok(groundHeight(x, z) > h.base - 0.05, `${h.id}: a corner's ground ${groundHeight(x, z).toFixed(2)} under its base ${h.base}`);
    for (const Bl of h.balconies || []) for (const y of Bl.floors) {
      const k = (y - h.floor) / STOREY;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6 && k > 1 - 1e-6, `${h.id}: a balcony at ${y} off the storeys`);
      const F = wallOut(h, Bl.on[0], Bl.on[1]);
      const g = Math.max(...[Bl.s0, Bl.s1].map((s) => groundHeight(...onWall(F, s, Bl.depth))));
      assert.ok(y > g + 1.5, `${h.id}: a balcony at ${y} on the ground (${g.toFixed(1)})`);
    }
  }
  // the fire station's doors on the road
  assert.equal(HOUSES.find((h) => h.id === 'w97292427').garages.reduce((a, g) => a + g.n, 0), 4);
});

test('the neighbours: nothing of the row inside a house it does not rebuild, nor inside the hand-built ones nearby', async () => {
  const mine = new Set(IDS);
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id)).map((b) => osmRing(b.id)).filter((r) => r.some(BOX));
  assert.ok(others.length > 20);
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    // (a step 1.5 m into the outline: OpenStreetMap's neighbours stand up to a metre off the survey's walls)
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1) continue;
      const [x, z] = onWall(F, F.len / 2, -1.5);
      for (const o of others) assert.ok(!pointInRing(o, x, z), `${h.id} at ${x.toFixed(1)}, ${z.toFixed(1)} inside a neighbour`);
    }
  }
  // the hand-built houses nearby: the Club Hotel and its tower, the Obere Strasse's row, the Pauluskirche, the
  // Talstrasse's row, the Spital: their exclusions outside the row and theirs not among ours
  const { CLUB_HOTEL } = await import('../js/club-hotel-data.js').catch(() => ({}));
  const near = [[-916.6, 587.8], [-898, 556.3], [-869.3, 540.4], [-861.6, 487.1], [-868.3, 484.5], [-864.8, 459.8], [-874.6, 502.4],
    [-787.9, 560.6], [-783.6, 554.7], [-794, 625.1], [-1109.8, 918.5]];
  for (const [x, z] of near) assert.ok(!insideRow(x, z), `${x}, ${z} inside the row`);
  for (const h of HOUSES) for (const e of h.exclude) for (const [x, z] of near) assert.ok(Math.hypot(e.x - x, e.z - z) > 6, `${h.id}: an exclusion beside a hand-built house's`);
  if (CLUB_HOTEL?.osm) assert.ok(!mine.has(CLUB_HOTEL.osm));
});

test('the missions\' doors and starts near the row stay outside it, the shops\' places by their walls', async () => {
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
  for (const [x, z] of points.filter(BOX)) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
  // the two shops lettered here stand inside their houses, by the wall their front is on
  const { SHOPS_DATA } = await import('../js/shops-data.js');
  for (const h of HOUSES.filter((q) => q.shopIds)) for (const id of h.shopIds) {
    const s = SHOPS_DATA.find((q) => q.osm === id);
    assert.ok(s && groundOutlines(h).some((r) => pointInRing(r, s.x, s.z)), `${id} in ${h.id}`);
    const F = wallOut(h, h.shops[0].on[0], h.shops[0].on[1]);
    const d = (s.x - F.a[0]) * F.n[0] + (s.z - F.a[1]) * F.n[1];
    assert.ok(d < 0 && d > -6, `${id}: ${d.toFixed(1)} m behind its front`);
  }
});

test('the row in Node: every vertex finite, six meshes, the phone\'s materials plain, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildPromenadeWest, ATLAS } = await import('../js/promenade-west.js');
  for (const h of HOUSES) assert.equal(SURVEYED_FOOTPRINTS.get(h.id).length, groundOutlines(h).length);
  assert.ok(SHOP_EXCLUSIONS.has('n13052134734') && SHOP_EXCLUSIONS.has('n1126920107'));
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 512 && y + h <= 256);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'atlas cells overlapping');
  }
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildPromenadeWest(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Promenade west ', '')).sort();
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
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -15 && p.array[i] < 17, `${m.name}: a height of ${p.array[i]}`);
    }
    assert.ok(tris < 15000, `${tris} triangles`);
  }
});
