import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, SHOP_IDS, STOREY, WIN, featureY, groundOutlines, hips, insideRow, onWall, outwardRing, partTop, pointInRing, ringArea2, roofRing, roofY,
  storeyOf, wallFrame, wallOut
} from '../js/talstrasse-4-data.js';
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
const IDS = [
  'w126895475', 'w126895351', 'w126895424', 'w221124742', 'w221124741', 'w117012343', 'w221127689', 'w126895410', 'w117012333', 'w117012213',
  'w117012245', 'w117012169', 'w126895373', 'w126895356', 'w126895437', 'w126895488', 'w126895461', 'w117012327', 'w117012262', 'w126895450',
  'w126895471'
];
const near = ([x, z]) => x > 465 && x < 685 && z > -1285 && z < -580;
// (the distance from a point to a ring's edges)
const edgeDist = (r, x, z) => Math.min(...r.map((a, i) => {
  const b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}));
const bbox = (r) => [Math.min(...r.map((p) => p[0])), Math.max(...r.map((p) => p[0])), Math.min(...r.map((p) => p[1])), Math.max(...r.map((p) => p[1]))];

test('the row: its houses, their batches excluded once each, every house at its OSM footprint', () => {
  assert.deepEqual(HOUSES.map((h) => h.id), IDS);
  const all = HOUSES.flatMap((h) => h.exclude);
  assert.equal(all.length, 27);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(all[i].x !== all[j].x || all[i].z !== all[j].z, 'a batch twice');
  for (const e of all) assert.equal(e.r, 3);
  // (each batch's centre inside its own house; the Demont's batch holds its barn, the barn excludes nothing itself)
  for (const h of HOUSES) for (const e of h.exclude) assert.ok(groundOutlines(h).some((r) => pointInRing(r, e.x, e.z)), `${h.id}: a batch's centre outside it`);
  assert.deepEqual(HOUSES.filter((h) => !h.exclude.length).map((h) => h.id), ['w126895461']);
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
    // (OSM's footprints follow the eaves or stand a metre or two off the surveyed walls)
    assert.ok(inside / n > 0.6, `${h.id}: ${Math.round((100 * inside) / n)} % of OSM's footprint covered`);
  }
});

test('the outlines: of some size, simple, the walls facing out, the parts not overlapping', () => {
  const parts = [];
  // (the room on the Jäggi Schneider house's roof stands on it, not beside it)
  assert.deepEqual(HOUSES.flatMap((h) => h.parts.filter((p) => p.onRoof).map(() => h.id)), ['w221127689']);
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    parts.push({ ring, box: bbox(ring) });
    assert.ok(ring.length >= 3 && Math.abs(ringArea2(ring)) / 2 > 4, `${h.id}: an outline of some size`);
    for (const [x, z] of ring) assert.ok(near([x, z]) && Number.isFinite(x) && Number.isFinite(z));
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
  for (const { ring, box } of parts) {
    for (let x = box[0] + 0.037; x < box[1]; x += 0.7) for (let z = box[2] + 0.023; z < box[3]; z += 0.7) {
      if (!pointInRing(ring, x, z) || edgeDist(ring, x, z) < 0.2) continue;
      const deep = parts.filter((p) => p.ring !== ring && x > p.box[0] && x < p.box[1] && z > p.box[2] && z < p.box[3] && pointInRing(p.ring, x, z) && edgeDist(p.ring, x, z) > 0.2);
      assert.equal(deep.length, 0, `two parts at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
  }
  // the features' walls face out of their house at their height, as written (left to right seen from outside)
  for (const h of HOUSES) for (const f of [...(h.shops || []), ...(h.letters || []), ...(h.balconies || []), ...(h.doors || [])]) {
    const F = wallOut(h, f.on[0], f.on[1], featureY(f));
    assert.ok(F.a === f.on[0], `${h.id}: a feature's wall written the wrong way round`);
    // (out of the wall nothing of the row stands as high: the balconies over the garage before w126895437 are clear)
    const [x, z] = onWall(F, F.len / 2, 0.5);
    assert.ok(!HOUSES.some((q) => q.parts.some((p) => pointInRing(p.ring, x, z) && partTop(q, p, x, z) > featureY(f))), `${h.id}: a feature facing in`);
    const s0 = f.s0 ?? f.s - f.w / 2, s1 = f.s1 ?? f.s + f.w / 2;
    assert.ok(s0 >= 0 && s1 <= F.len + 1e-6 && s1 > s0, `${h.id}: a feature off its wall`);
    // (on a wall of the house's outlines)
    assert.ok(groundOutlines(h).some((r) => r.some((p) => p === f.on[0] || (p[0] === f.on[0][0] && p[1] === f.on[0][1]))), `${h.id}: a feature off the outlines`);
  }
});

test('the roofs: over their walls, near the surveyed heights; the flat roofs at theirs', () => {
  // the survey's ridges (the pitched ones) and the flat roofs the hips stand for (their eaves)
  const ridges = { w117012343: [7.6, 8.6], w117012245: [13.7], w126895488: [5.6], w126895461: [3.2], w117012327: [8.7] };
  const eaves = { w126895475: -2.64, w126895424: 2.52, w221124742: -0.94, w126895410: 3.32 };
  for (const h of HOUSES) (h.roofs || []).forEach((R, ri) => {
    assert.ok(R.y > R.eaves + 0.8 && R.cL > 1 && R.cR > 1, `${h.id}: a roof's shape`);
    for (const e of [R.eavesL, R.eavesR]) if (e !== undefined) assert.ok(e < R.y - 0.8);
    if (ridges[h.id]) {
      assert.ok(Math.abs(R.y - ridges[h.id][ri]) < 0.05, `${h.id}: a ridge at ${R.y}`);
      assert.deepEqual(hips(R), [0, 0], `${h.id}: gables`);
    } else {
      assert.ok(Math.abs(R.eaves - eaves[h.id]) < 1e-9, `${h.id}: the eaves at the surveyed top`);
      const [h0, h1] = hips(R);
      assert.ok(h0 > 0 && h1 > 0, `${h.id}: hips`);
      // (a shallow hip: its ridge within 2.8 m over the survey's flat roof)
      assert.ok(R.y - R.eaves < 2.8, `${h.id}: a ridge at ${R.y}`);
    }
    const ring = roofRing(R);
    for (const p of h.parts.filter((q) => q.roofs && q.roofs.includes(ri))) {
      for (const [x, z] of p.ring) {
        const t = partTop(h, p, x, z);
        const low = Math.min(...p.roofs.map((i) => h.roofs[i]).map((Q) => Math.min(Q.eaves, Q.eavesL ?? Q.eaves, Q.eavesR ?? Q.eaves)));
        assert.ok(t >= low - 0.1 && t <= Math.max(...p.roofs.map((i) => h.roofs[i].y)), `${h.id}: a wall's top of ${t.toFixed(2)}`);
        // (every corner under one of its part's roofs; the Talgarage's east corner at the hip's flush end)
        if (h.id === 'w221124742' && x === 536.6) continue;
        assert.ok(p.roofs.some((i) => roofY(h.roofs[i], x, z) !== null), `${h.id}: a wall's corner at ${x}, ${z} outside its roofs`);
      }
    }
    assert.ok(ring.every(([x, z]) => near([x, z])));
  });
  const flats = HOUSES.flatMap((h) => h.parts.filter((p) => p.top !== undefined).map((p) => p.top));
  assert.deepEqual(flats, [
    0.68, -4.91, -9.99, -6.77, 4.49, 3.09, 5.48, -1.24, 8.41, 5.8, 6.2, 10.63, 12.68, 10.26, 12.4, 7.94, 12.89, 10.23, 1.28, 5.0, 1.47, -1.32, -2.28, 0.82, -2.82
  ]);
});

test('the floors add up: windows under the roofs, walls under the ground, balconies on storeys\' feet, the shop\'s glass over the ground', () => {
  assert.ok(WIN.lo > 0.5 && WIN.hi < STOREY - 0.4);
  for (const h of HOUSES) {
    const st = storeyOf(h);
    assert.ok(st >= 2.7 && st <= 3.7, `${h.id}: a storey of ${st}`);
    assert.ok(h.base < h.floor - 0.5 && Number.isFinite(h.floor), `${h.id}: the walls reach under the floor`);
    for (const p of h.parts) {
      const R = outwardRing(p.ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        for (let s = 0; s <= F.len; s += 0.5) assert.ok(groundHeight(...onWall(F, s, 0.3)) > h.base + 0.2, `${h.id}: the ground under its walls' foot`);
      }
      // (the floors' grid starts at the lowest ground round the house, within a storey)
      let lo = Infinity;
      for (const [x, z] of p.ring) lo = Math.min(lo, groundHeight(x, z));
      if (h.parts.indexOf(p) === 0) assert.ok(Math.abs(h.floor - lo) < st, `${h.id}: its floors at ${h.floor}, the ground at ${lo.toFixed(2)}`);
    }
    for (const Bc of h.balconies || []) {
      const F = wallOut(h, Bc.on[0], Bc.on[1], featureY(Bc));
      let g = -Infinity, top = Infinity;
      for (let k = 0; k <= 20; k++) {
        const s = Bc.s0 + ((Bc.s1 - Bc.s0) * k) / 20;
        g = Math.max(g, groundHeight(...onWall(F, s, Bc.depth)));
        top = Math.min(top, ...h.parts.filter((p) => pointInRing(p.ring, ...onWall(F, s, -0.2))).map((p) => partTop(h, p, ...onWall(F, s, -0.2))));
      }
      for (const y of Bc.floors) {
        const k = (y - h.floor) / st;
        assert.ok(Math.abs(k - Math.round(k)) < 0.02 && k > 0.98, `${h.id}: a balcony at ${y} off the storeys`);
        assert.ok(y - 0.2 > g + 1.8, `${h.id}: a balcony at ${y} over the ground at ${g.toFixed(2)}`);
        assert.ok(y + 1.05 < top, `${h.id}: a balcony at ${y} over its wall's top ${top.toFixed(2)}`);
      }
      assert.ok(Bc.depth >= 1 && Bc.depth <= 1.6);
    }
    for (const Sp of h.shops || []) {
      const F = wallOut(h, Sp.on[0], Sp.on[1], featureY(Sp));
      let g = -Infinity;
      for (let k = 0; k <= 40; k++) g = Math.max(g, groundHeight(...onWall(F, Sp.s0 + ((Sp.s1 - Sp.s0) * k) / 40, 0.5)));
      assert.ok(Sp.top - (Sp.fascia ?? 0.6) - (g + 0.35) >= 1.8, `${h.id}: a shop's glass cut by the ground`);
      // (the first storey over the shop: its windows clear of the fascia)
      const k = Math.ceil((Sp.top + 0.1 - (WIN.lo * st) / STOREY - h.floor) / st - 1e-9);
      assert.ok(h.floor + k * st + (WIN.lo * st) / STOREY > Sp.top && h.floor + k * st - Sp.top < 0.5, `${h.id}: a shop's top off the storeys`);
    }
    for (const L of [...(h.letters || [])]) {
      const F = wallOut(h, L.on[0], L.on[1], featureY(L));
      for (const s of [L.s0, L.s1]) assert.ok(groundHeight(...onWall(F, s, 0.5)) < L.y0 - 0.3, `${h.id}: ${L.key} in the ground`);
    }
  }
  // the storeys the photographs show: four over the Bünda corner's ground, five of the dark block, the Talgarage's
  // garage doors and two storeys over them, six of the white block towards the street
  const count = (h, top, from) => { let n = 0; const st = storeyOf(h); for (let y = h.floor; y + (WIN.hi * st) / STOREY + 0.2 <= top; y += st) if (y >= from - 0.01) n++; return n; };
  const H = Object.fromEntries(HOUSES.map((h) => [h.id, h]));
  assert.equal(count(H.w126895351, 0.68, -100), 4);
  assert.equal(count(H.w221124741, 4.49, -100), 5);
  assert.equal(count(H.w221124742, -0.94 + 0.3, -9.5), 2);
  assert.equal(count(H.w126895373, 12.68, -100), 6);
});

test('the neighbours: nothing of the row inside a house it does not rebuild, the hand-built ones nearby clear', async () => {
  const mine = new Set(IDS);
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id)).map((b) => ({ id: b.id, ring: osmRing(b.id) }))
    .filter((o) => o.ring.some(near));
  assert.ok(others.length > 30);
  // (OSM's outlines stand up to a metre off the surveyed walls where houses touch: a corner that far in is let be. The
  // Talgarage's wing stands over the edge of the forecourt w1528476306 (ground-level in the survey); OSM's white block
  // w1528476307 runs a metre into the survey's dark block)
  const lax = { w1528476306: Infinity, w1528476307: 1.3 };
  for (const h of HOUSES) {
    for (const ring of groundOutlines(h)) {
      for (const [x, z] of ring) for (const o of others) {
        if (pointInRing(o.ring, x, z)) assert.ok(edgeDist(o.ring, x, z) < (lax[o.id] ?? 0.8), `${h.id} at ${x}, ${z} inside ${o.id}`);
      }
      for (const o of others) for (const [x, z] of o.ring) {
        if (pointInRing(ring, x, z)) assert.ok(edgeDist(ring, x, z) < (lax[o.id] ?? 0.8), `${o.id} at ${x}, ${z} inside ${h.id}`);
      }
    }
  }
  // the hand-built rows and houses round it: their outlines clear of the row's (the northern Promenade row, the
  // Dischmastrasse's first row, the Promenade Dorf; the Seehof, the Grischa, the Talstrasse block and chalet and the
  // Migros Dorf by their OSM footprints)
  const rows = [await import('../js/promenade-nord-data.js'), await import('../js/dischma-row-a-data.js'), await import('../js/promenade-dorf-data.js')];
  const theirs = rows.flatMap((m) => m.HOUSES.flatMap((h) => m.groundOutlines(h)));
  for (const id of ['w117012182', 'w99094508', 'w117012205', 'w117012255', 'w117012298']) theirs.push(osmRing(id));
  assert.ok(theirs.length > 20 && theirs.every(Boolean));
  for (const h of HOUSES) for (const ring of [...groundOutlines(h), ...(h.roofs || []).map(roofRing)]) for (const t of theirs) {
    for (const [x, z] of ring) assert.ok(!pointInRing(t, x, z), `${h.id} at ${x}, ${z} inside a hand-built house`);
    for (const [x, z] of t) assert.ok(!pointInRing(ring, x, z), `a hand-built house at ${x}, ${z} inside ${h.id}`);
  }
});

test('the shops\' signs: the Talgarage\'s lettered here on its own wall, the Cresta\'s left to js/shops.js', () => {
  assert.deepEqual(SHOP_IDS, ['n7330243567']);
  const s = SHOPS_DATA.find((q) => q.osm === 'n7330243567');
  assert.ok(s && s.name === 'Talgarage Davos');
  const h = HOUSES.find((q) => (q.shopIds || []).includes(s.osm));
  assert.equal(h.id, 'w221124742');
  const d = Math.min(...groundOutlines(h).map((r) => (pointInRing(r, s.x, s.z) ? 0 : edgeDist(r, s.x, s.z))));
  assert.ok(d < 3, `${s.name} ${d.toFixed(1)} m off its house`);
  // (the Hotel Cresta w221127692 has no batch of its own and stays js/buildings.js': its sign too)
  const cresta = SHOPS_DATA.find((q) => q.osm === 'n982616241');
  assert.ok(cresta && !SHOP_IDS.includes(cresta.osm) && !insideRow(cresta.x, cresta.z));
  assert.ok(!IDS.includes('w221127692'));
});

test('the missions\' places near the row stay outside it; the Talstrasse clear', async () => {
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
  for (const [x, z] of close) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
  // the radar mission's spots on the Talstrasse by the house over the garage: a few metres clear of it
  const { LASER_SPOT, PATROL_BAY, STOP_POINT } = await import('../js/missions-data-radar.js');
  for (const p of [LASER_SPOT, PATROL_BAY, STOP_POINT]) {
    const [x, z] = Array.isArray(p) ? [p[0], p.length === 3 ? p[2] : p[1]] : [p.x, p.z];
    for (const h of HOUSES) for (const r of groundOutlines(h)) assert.ok(edgeDist(r, x, z) > 5, `a radar spot ${edgeDist(r, x, z).toFixed(1)} m from ${h.id}`);
  }
  // the street itself stays clear
  const street = DAVOS_DATA.roads.filter((r) => r.name === 'Talstrasse');
  let probed = 0;
  for (const r of street) for (let i = 0; i + 3 < r.pts.length; i += 2) {
    for (let f = 0; f <= 1; f += 0.1) {
      const x = r.pts[i] + (r.pts[i + 2] - r.pts[i]) * f, z = r.pts[i + 1] + (r.pts[i + 3] - r.pts[i + 1]) * f;
      if (!near([x, z])) continue;
      probed++;
      assert.ok(!insideRow(x, z), `the Talstrasse at ${x.toFixed(1)}, ${z.toFixed(1)} inside the row`);
      for (const h of HOUSES) for (const ring of groundOutlines(h)) assert.ok(edgeDist(ring, x, z) > 3, `the Talstrasse at ${x.toFixed(1)}, ${z.toFixed(1)} within 3 m of ${h.id}`);
    }
  }
  assert.ok(probed > 50);
});

test('the row in Node: every vertex finite, five meshes, no colliders, the outlines registered, the phone\'s materials', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { buildTalstrasse4, ATLAS } = await import('../js/talstrasse-4.js');
  for (const h of HOUSES) assert.equal(SURVEYED_FOOTPRINTS.get(h.id).length, h.parts.filter((p) => !p.onRoof).length);
  for (const id of SHOP_IDS) assert.ok(SHOP_EXCLUSIONS.has(id));
  // the atlas' cells apart and within it; every key used is a cell
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 256);
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
    const { group, colliders } = buildTalstrasse4(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    assert.equal(colliders.length, 0);
    const names = group.children.map((m) => m.name.replace('Talstrasse 4 ', '')).sort();
    assert.deepEqual(names, ['decal', 'glass', 'roof', 'trim', 'walls']);
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
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -15 && p.array[i] < 15, `${m.name}: a height of ${p.array[i]}`);
      for (let i = 0; i < p.array.length; i += 3) assert.ok(near([p.array[i], p.array[i + 2]]), `${m.name}: a vertex out at ${p.array[i]}, ${p.array[i + 2]}`);
      // the walls: colours on every vertex, aHalf decoding to a house of the row, a style and a half length
      if (m.name.endsWith('walls')) {
        const c = m.geometry.attributes.color, a = m.geometry.attributes.aHalf;
        assert.ok(c && c.count === p.count && a && a.count === p.count);
        for (let i = 0; i < a.count; i++) {
          const v = a.array[i], hi = Math.floor(v / 10000), rest = v - hi * 10000, rest2 = rest >= 4999.5 ? rest - 5000 : rest;
          assert.ok(hi < HOUSES.length && rest2 >= 0 && rest2 < 5000 && rest2 % 1000 < 60);
        }
      }
    }
    assert.ok(tris < 15000, `${tris} triangles`);
  }
});
