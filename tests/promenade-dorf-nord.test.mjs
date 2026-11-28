import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, SHOP_IDS, STOREY, WIN, featureY, groundOutlines, hips, insideRow, onBoards, onWall, outwardRing, partTop, pointInRing, ringArea2,
  roofRing, roofY, wallFrame, wallOut, winHi, winLo
} from '../js/promenade-dorf-nord-data.js';
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
const IDS = ['w118240615', 'w118240614', 'w118240603', 'w126895388', 'w126895495', 'w117012269', 'w117012153'];
const near = ([x, z]) => x > 495 && x < 610 && z > -1165 && z < -990;
// (the distance from a point to a ring's edges)
const edgeDist = (r, x, z) => Math.min(...r.map((a, i) => {
  const b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}));
const allParts = () => HOUSES.flatMap((h) => groundOutlines(h).map((ring) => ({ h, ring })));

test('the row: its seven houses, their thirteen batches excluded once each, every house at its OSM footprint', () => {
  assert.deepEqual(HOUSES.map((h) => h.id), IDS);
  const all = HOUSES.flatMap((h) => h.exclude);
  assert.deepEqual(all.map((e) => [e.x, e.z, e.r]), [
    [523.2, -1020.6, 3], [534.1, -1049.5, 3], [568.2, -1037.3, 3], [572.1, -1043.4, 3], [565.1, -1032.7, 3], [576.4, -1041.5, 3],
    [569.9, -1070.7, 3], [570.5, -1064.3, 3], [578.1, -1101.9, 3], [577.2, -1094.5, 3], [582.6, -1140.9, 3], [580.8, -1135.8, 3], [581.3, -1134.8, 3]
  ]);
  // (each batch's centre inside its own house, or within 2 m of it: the forecourts' flat batches at the ground)
  for (const h of HOUSES) for (const e of h.exclude) {
    const d = Math.min(...groundOutlines(h).map((r) => (pointInRing(r, e.x, e.z) ? 0 : edgeDist(r, e.x, e.z))));
    assert.ok(d < 2, `${h.id}: a batch's centre ${d.toFixed(1)} m outside it`);
  }
  // (no two exclusions catching each other's batches twice: the centres apart)
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > 1);
  for (const h of HOUSES) {
    const own = osmRing(h.id);
    assert.ok(own, `${h.id} in OpenStreetMap`);
    let inside = 0, n = 0;
    for (let x = Math.min(...own.map((p) => p[0])); x < Math.max(...own.map((p) => p[0])); x += 0.5) {
      for (let z = Math.min(...own.map((p) => p[1])); z < Math.max(...own.map((p) => p[1])); z += 0.5) {
        if (!pointInRing(own, x, z)) continue;
        n++;
        if (groundOutlines(h).some((r) => pointInRing(r, x, z))) inside++;
      }
    }
    assert.ok(inside / n > 0.7, `${h.id}: ${Math.round((100 * inside) / n)} % of OSM's footprint covered`);
  }
});

test('the outlines: of some size, simple, the walls facing out, the houses not overlapping at the ground', () => {
  for (const { h, ring } of allParts()) {
    assert.ok(ring.length >= 3 && Math.abs(ringArea2(ring)) / 2 > 4, `${h.id}: an outline of some size`);
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
  // (every part's volume over its outline at the ground)
  for (const h of HOUSES) for (const p of h.parts) if (p.ground) for (const [x, z] of p.ground) assert.ok(pointInRing(p.ring, x, z) || edgeDist(p.ring, x, z) < 0.05);
  const parts = allParts().map((q) => q.ring);
  for (let x = 505.037; x < 600; x += 0.6) for (let z = -1155.023; z < -995; z += 0.6) {
    const deep = parts.filter((r) => pointInRing(r, x, z) && edgeDist(r, x, z) > 0.2);
    assert.ok(deep.length <= 1, `two parts at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
  // the features' walls face out of their house at their height, as written (left to right seen from outside)
  for (const h of HOUSES) for (const f of [...(h.shops || []), ...(h.letters || []), ...(h.bays || []), ...(h.balconies || []), ...(h.gableWins || [])]) {
    const F = wallOut(h, f.on[0], f.on[1], featureY(f));
    assert.ok(F.a === f.on[0], `${h.id}: a feature's wall written the wrong way round`);
    const [x, z] = onWall(F, F.len / 2, 0.5);
    assert.ok(!insideRow(x, z), `${h.id}: a feature facing in`);
    const s0 = f.s0 ?? f.s - (f.w ?? 0) / 2, s1 = f.s1 ?? f.s + (f.w ?? 0) / 2;
    assert.ok(s0 >= -1e-6 && s1 <= F.len + 1e-6 && s1 >= s0, `${h.id}: a feature off its wall`);
  }
  // the larch boards: on the flats' street sides and the galleries' front, on walls of their outlines
  for (const h of HOUSES) for (const [a, b] of h.boards || []) {
    assert.ok(onBoards(h, a, b));
    assert.ok(h.parts.some((p) => p.ring.some((q) => Math.hypot(q[0] - a[0], q[1] - a[1]) < 0.05) && p.ring.some((q) => Math.hypot(q[0] - b[0], q[1] - b[1]) < 0.05)), `${h.id}: boards off its walls`);
  }
});

test('the roofs: saddles over their walls near the surveyed ridges and eaves; the flat roofs at the survey\'s', () => {
  // (the survey's ridges, and its eaves at the walls)
  const ridges = { w126895388: [22.0, 19.5, 21.93], w117012153: [19.12, 19.86] };
  const eavesAtWalls = { w126895388: [17.78, 17.45, 20.6], w117012153: [13.9, 17.0] };
  for (const h of HOUSES) (h.roofs || []).forEach((R, ri) => {
    assert.ok(R.y > R.eaves + 1 && R.cL > 1.5 && R.cR > 1.5);
    assert.equal(R.y, ridges[h.id][ri], `${h.id}: a ridge at ${R.y}`);
    const [h0, h1] = hips(R);
    assert.ok(h0 >= 0 && h1 >= 0);
    const ring = roofRing(R);
    for (const p of h.parts.filter((q) => q.roofs && q.roofs.includes(ri))) {
      for (const [x, z] of p.ground || p.ring) {
        assert.ok(pointInRing(ring, x, z), `${h.id}: a wall's corner outside its roof`);
        const y = roofY(R, x, z);
        assert.ok(y !== null && y > R.eaves && y <= R.y);
      }
      // the walls' tops at the outer corners within 0.6 m of the survey's
      const outer = (p.ground || p.ring).filter(([x, z]) => partTop(h, p, x, z) < R.y - 0.5);
      for (const [x, z] of outer) {
        const t = partTop(h, p, x, z);
        assert.ok(Math.abs(t - eavesAtWalls[h.id][ri]) < 0.6, `${h.id}: a wall's top of ${t.toFixed(2)} under roof ${ri}`);
      }
    }
  });
  const flats = HOUSES.flatMap((h) => h.parts.filter((p) => p.top !== undefined).map((p) => p.top));
  assert.deepEqual(flats, [12.92, 16.12, 16.5, 7.27, 16.34, 15.22, 12.74, 16.44, 16.44]);
});

test('the floors add up: windows under the roofs, the shops\' glass over the ground, oriels and galleries on storeys\' feet', () => {
  assert.ok(WIN.lo > 0.5 && WIN.hi < STOREY - 0.4);
  for (const h of HOUSES) {
    assert.ok(h.storey > 2.4 && h.storey < 3.4 && winHi(h) < h.storey - 0.35 && winLo(h) > 0.6, `${h.id}: its storey`);
    assert.ok(Number.isFinite(h.floor) && Number.isFinite(h.base), h.id);
    for (const p of h.parts) {
      const R = outwardRing(p.ground || p.ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        for (let s = 0; s <= F.len; s += 0.5) assert.ok(groundHeight(...onWall(F, s, 0.3)) > h.base + 0.2, `${h.id}: the ground under its walls' foot`);
      }
    }
    // the street's ground floor: the shops' glass over the ground, the first storey over each shop clear of its fascia
    for (const Sp of h.shops || []) {
      const F = wallOut(h, Sp.on[0], Sp.on[1], featureY(Sp));
      let g = -Infinity;
      for (let k = 0; k <= 40; k++) g = Math.max(g, groundHeight(...onWall(F, Sp.s0 + ((Sp.s1 - Sp.s0) * k) / 40, 0.5)));
      assert.ok(Sp.top - (Sp.fascia ?? 0.6) - (g + 0.35) >= 1.2, `${h.id}: a shop's glass cut by the ground`);
      assert.ok(g > h.floor - 0.7 || Sp.top - g > 2.8, `${h.id}: a shop's ground floor too low`);
      const k = Math.ceil((Sp.top + 0.1 - winLo(h) - h.floor) / h.storey - 1e-9);
      assert.ok(h.floor + k * h.storey + winLo(h) > Sp.top && h.floor + k * h.storey - Sp.top < 0.5, `${h.id}: a shop's top off the storeys`);
    }
    for (const Bw of h.bays || []) for (const y of Bw.floors) {
      const k = (y - h.floor) / h.storey;
      assert.ok(Math.abs(k - Math.round(k)) < 0.05 && k >= 1, `${h.id}: an oriel at ${y} off the storeys`);
    }
    for (const G of h.balconies || []) for (const y of G.ys) {
      const k = (y - h.floor) / h.storey;
      assert.ok(Math.abs(k - Math.round(k)) < 0.05 && k >= 1, `${h.id}: a gallery at ${y} off the storeys`);
      const F = wallOut(h, G.on[0], G.on[1], featureY(G));
      for (let s = G.s0; s <= G.s1; s += 0.5) assert.ok(groundHeight(...onWall(F, s, G.depth)) < y - 2.2, `${h.id}: a gallery's floor low over the ground`);
    }
    for (const L of h.letters || []) {
      const F = wallOut(h, L.on[0], L.on[1], featureY(L));
      for (const s of [L.s0, L.s1]) assert.ok(groundHeight(...onWall(F, s, 0.5)) < L.y0 - 0.3, `${h.id}: ${L.key} in the ground`);
    }
    // the windows in the gables under their roofs
    for (const W of h.gableWins || []) {
      const F = wallOut(h, W.on[0], W.on[1], W.y0);
      const p = h.parts.find((q) => q.roofs && pointInRing(q.ring, ...onWall(F, W.s, -0.3)));
      assert.ok(p, `${h.id}: a gable window off its gable`);
      for (const s of [W.s - W.w / 2, W.s + W.w / 2]) assert.ok(partTop(h, p, ...onWall(F, s, -0.05)) > W.y1 + 0.2, `${h.id}: a gable window over its wall`);
    }
  }
  // the rows of windows the photographs show over the street: two over the Bergsport's shop, four over the cream
  // house's, three over the gabled house's ground floor up to its eaves, five on the flats
  const rows = (h, from, top) => { let n = 0; for (let y = h.floor; y + winHi(h) + 0.2 <= top; y += h.storey) if (y >= from - 0.05) n++; return n; };
  assert.equal(rows(HOUSES[0], 7.0, 12.92), 2);
  assert.equal(rows(HOUSES[2], 6.4, 16.5), 4);
  assert.equal(rows(HOUSES[3], HOUSES[3].floor + HOUSES[3].storey, 17.78), 3);
  assert.equal(rows(HOUSES[4], HOUSES[4].floor, 16.34), 5);
  assert.equal(rows(HOUSES[5], HOUSES[5].floor, 15.22), 5);
});

test('the neighbours: nothing of the row inside a house it does not rebuild, the hand-built ones nearby clear', () => {
  const mine = new Set(IDS);
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id)).map((b) => ({ id: b.id, ring: osmRing(b.id) }))
    .filter((o) => o.ring.some(near));
  assert.ok(others.length > 10);
  for (const { h, ring } of allParts()) {
    // (w126895480 shares the gabled house's east wall: a corner on that line is not inside it)
    for (const [x, z] of ring) for (const o of others) assert.ok(!pointInRing(o.ring, x, z) || edgeDist(o.ring, x, z) < 0.6, `${h.id} at ${x}, ${z} inside ${o.id}`);
    for (const o of others) for (const [x, z] of o.ring) assert.ok(!pointInRing(ring, x, z) || edgeDist(ring, x, z) < 0.6, `${o.id} at ${x}, ${z} inside ${h.id}`);
  }
  for (const h of HOUSES) for (const R of h.roofs || []) for (const [x, z] of roofRing(R)) for (const o of others) {
    assert.ok(!pointInRing(o.ring, x, z) || edgeDist(o.ring, x, z) < 1.0, `${h.id}'s roof at ${x.toFixed(1)}, ${z.toFixed(1)} over ${o.id}`);
  }
  // the hand-built houses round it: the Freitag's, the Hotel Dischma, the Meierhof, the Villa Vecchia, the red-striped
  // house of the Dischmastrasse row and Talstrasse-4's (their OSM footprints) at least 2 m from every outline of the row
  for (const id of ['w118240628', 'w126895319', 'w118240624', 'w118240455', 'w118240327', 'w117012336', 'w126895437', 'w117012327', 'w126895488']) {
    const o = osmRing(id);
    assert.ok(o, id);
    for (const { h, ring } of allParts()) {
      for (const [x, z] of o) assert.ok(edgeDist(ring, x, z) > 2 && !pointInRing(ring, x, z), `${id} near ${h.id}`);
      for (const [x, z] of ring) assert.ok(edgeDist(o, x, z) > 2 && !pointInRing(o, x, z), `${h.id} within 2 m of ${id}`);
    }
  }
});

test('the shops\' signs: lettered here on their own houses\' walls, left out of js/shops.js', () => {
  assert.deepEqual(SHOP_IDS, ['n3287588702', 'n6184778521']);
  for (const id of SHOP_IDS) {
    const s = SHOPS_DATA.find((q) => q.osm === id);
    assert.ok(s, `${id} in js/shops-data.js`);
    const h = HOUSES.find((q) => (q.shopIds || []).includes(id));
    const d = Math.min(...groundOutlines(h).map((r) => (pointInRing(r, s.x, s.z) ? 0 : edgeDist(r, s.x, s.z))));
    assert.ok(d < 3, `${s.name} ${d.toFixed(1)} m off its house`);
  }
  // the neighbours' shops stay js/shops.js': the Freitag's (Promenade Nord), the Dischma, the Dorfkeller, EP:Bernhard
  for (const name of ['Freitag Store Davos', 'Dischma', 'Dorfkeller', 'EP:Bernhard', 'Jarno']) {
    const s = SHOPS_DATA.find((q) => q.name === name);
    assert.ok(s && !SHOP_IDS.includes(s.osm), name);
  }
});

test('the missions\' places near the row stay outside it; the Dorfkeller\'s door, the WEF gate and the Promenade clear', async () => {
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
  assert.ok(close.length > 0);
  for (const [x, z] of close) {
    assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
    for (const { h, ring } of allParts()) assert.ok(edgeDist(ring, x, z) > 1.5, `a mission's place at ${x.toFixed(1)}, ${z.toFixed(1)} by ${h.id}`);
  }
  // the Craft Beer round's Dorfkeller (on the Dischma) and the WEF march's gate on the Promenade
  const { BEER_STOPS } = await import('../js/missions-data-local.js');
  const stop = BEER_STOPS.find((b) => b.id === 'dorfkeller');
  for (const { x, z } of [stop.door, stop.road]) assert.ok(!insideRow(x, z));
  const { WEF_GATES } = await import('../js/missions-data-wef.js');
  for (const g of WEF_GATES.filter((q) => near(q.x !== undefined ? [q.x, q.z] : [q[0], q[q.length === 3 ? 2 : 1]]))) {
    const [x, z] = g.x !== undefined ? [g.x, g.z] : [g[0], g[g.length === 3 ? 2 : 1]];
    for (const { h, ring } of allParts()) assert.ok(edgeDist(ring, x, z) > 4, `the WEF gate at ${x}, ${z} by ${h.id}`);
  }
  // the street itself stays clear, with a pavement's width before the walls
  const street = DAVOS_DATA.roads.filter((r) => r.name === 'Promenade');
  const line = street.flatMap((r) => { const q = []; for (let i = 0; i + 3 < r.pts.length; i += 2) q.push([[r.pts[i], r.pts[i + 1]], [r.pts[i + 2], r.pts[i + 3]]]); return q; });
  let probed = 0;
  for (const [a, b] of line) for (let k = 0; k <= 20; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / 20, z = a[1] + ((b[1] - a[1]) * k) / 20;
    if (!near([x, z])) continue;
    probed++;
    assert.ok(!insideRow(x, z), `the Promenade at ${x.toFixed(1)}, ${z.toFixed(1)} inside the row`);
    for (const { h, ring } of allParts()) assert.ok(edgeDist(ring, x, z) > 4, `the Promenade's middle at ${x.toFixed(1)}, ${z.toFixed(1)} within 4 m of ${h.id}`);
  }
  assert.ok(probed > 20);
});

test('the row in Node: every vertex finite, five meshes, no colliders, the outlines registered, the phone\'s materials', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { buildPromenadeDorfNord, ATLAS } = await import('../js/promenade-dorf-nord.js');
  for (const h of HOUSES) {
    const rings = SURVEYED_FOOTPRINTS.get(h.id);
    assert.equal(rings.length, h.parts.length);
    rings.forEach((r, i) => assert.equal(r, h.parts[i].ground || h.parts[i].ring));
  }
  for (const id of SHOP_IDS) assert.ok(SHOP_EXCLUSIONS.has(id));
  // the atlas' cells apart and within it; every key used is a cell
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 128);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'cells apart');
  }
  for (const h of HOUSES) for (const k of [...(h.shops || []).flatMap((s) => (s.signs || []).map((g) => g.key)), ...(h.letters || []).map((l) => l.key)]) assert.ok(ATLAS[k], k);
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { QUALITY } = await import('../js/quality.js');
  for (const simple of [false, true]) {
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildPromenadeDorfNord(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Promenade Dorf Nord ', '')).sort();
    assert.deepEqual(names, ['decal', 'glass', 'roof', 'trim', 'walls']);
    assert.deepEqual(colliders, []);
    let tris = 0;
    for (const m of group.children) {
      assert.ok(m.material, `${m.name}: a material`);
      if (simple) {
        const M = m.material, decal = M.opacityNode && M.transparent && !M.emissiveNode && !M.roughnessNode;
        const procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
        assert.ok(M.userData.simpleSkin || decal || (M.vertexColors && !procedural), `${m.name}: a full shader on the phone`);
      }
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      tris += p.count / 3;
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -3 && p.array[i] < 22.5, `${m.name}: a height of ${p.array[i]}`);
      for (let i = 0; i < p.array.length; i += 3) assert.ok(near([p.array[i], p.array[i + 2]]), `${m.name}: a vertex out at ${p.array[i]}, ${p.array[i + 2]}`);
      // the walls: colours on every vertex, aHalf decoding to a house of the row, a style of three bits, a half length
      if (m.name.endsWith('walls')) {
        const c = m.geometry.attributes.color, a = m.geometry.attributes.aHalf;
        assert.ok(c && c.count === p.count && a && a.count === p.count);
        const styles = new Set();
        for (let i = 0; i < a.count; i++) {
          const v = a.array[i], hi = Math.floor((v + 0.5) / 10000), rest = v - hi * 10000, st = Math.floor((rest + 0.5) / 1000), half = rest - st * 1000;
          assert.ok(hi < HOUSES.length && st < 8 && half >= -1e-3 && half < 60, `a wall's code ${v}`);
          styles.add(st);
        }
        assert.deepEqual([...styles].sort(), [0, 1, 4, 6]);
      }
    }
    assert.ok(tris < 15000, `${tris} triangles`);
  }
});
