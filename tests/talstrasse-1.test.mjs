import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  BAY, HOUSES, KINDS, STOREY, WIN, alsoOutlines, groundOutlines, hips, insideRow, onWall, outwardRing, partTop, pointInRing, ringArea2,
  roofRing, upperFloors, wallFrame, wallOut
} from '../js/talstrasse-1-data.js';
import { EISSTADION } from '../js/landmark-buildings-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};
const IDS = ['w126271051', 'w126271056', 'w126271008', 'w124795016', 'w1529537273', 'w126271050', 'w126271016', 'w37221745', 'w110590693',
  'w221123482', 'w221123489', 'w126271018', 'w116881268', 'w126271046', 'w116881236'];
const ALSO = ['w124795036', 'w1529534136'];
const allOutlines = (h) => [...groundOutlines(h), ...Object.values(alsoOutlines(h)).flat()];

test('the row: its fifteen houses, each excluding its surveyed batches, none excluded twice', () => {
  assert.deepEqual(HOUSES.map((h) => h.id).sort(), [...IDS].sort());
  assert.deepEqual(HOUSES.flatMap((h) => (h.also || []).map((a) => a.id)).sort(), [...ALSO].sort());
  const all = HOUSES.flatMap((h) => h.exclude);
  // (the balconied block's batch holds the pavilion too: the pavilion excludes none of its own)
  assert.equal(all.length, 16);
  for (const e of all) assert.ok(e.r === 3 && Number.isFinite(e.x) && Number.isFinite(e.z));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > 3, 'two exclusions apart');
  }
  // each batch's centre inside the outlines it stands for (or by its slab), each house at its footprint in OpenStreetMap
  for (const h of HOUSES) {
    const own = osmRing(h.id);
    assert.ok(own, `${h.id} in OpenStreetMap`);
    const outl = allOutlines(h);
    const near = (e) => outl.some((r) => pointInRing(r, e.x, e.z)) || [...outl, ...(h.slab ? [h.slab.ring] : []), ...h.parts.map((p) => p.ring)]
      .some((r) => r.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 12));
    for (const e of h.exclude) assert.ok(near(e), `${h.id}: a batch far off`);
    const [cx, cz] = own.reduce(([a, b], [x, z]) => [a + x / own.length, b + z / own.length], [0, 0]);
    assert.ok(h.parts.some((p) => pointInRing(p.ring, cx, cz)), `${h.id}: its outline away from OSM's`);
  }
});

test('the outlines: of some size, simple, the walls facing out, the parts not overlapping', () => {
  const rings = HOUSES.flatMap((h) => [...h.parts.map((p) => [h.id, p.ring]), ...(h.also || []).flatMap((a) => (a.parts || []).map((p) => [a.id, p.ring]))]);
  for (const [id, ring] of rings) {
    assert.ok(ring.length >= 3 && Math.abs(ringArea2(ring)) / 2 > 8, `${id}: an outline of some size`);
    const n = ring.length;
    const crosses = (p, q, r, s) => {
      const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      return d(p, q, r) * d(p, q, s) < -1e-9 && d(r, s, p) * d(r, s, q) < -1e-9;
    };
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      assert.ok(!crosses(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]), `${id}: an outline crossing itself`);
    }
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1.5) continue;
      assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.2)), `${id}: a step out of a wall leaves the outline`);
      assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.2)), `${id}: a step back is inside`);
    }
  }
  // the parts standing on the ground do not overlap (a point 0.6 m into one part lies in no other), but the stair heads
  const ground = HOUSES.flatMap((h) => allOutlines(h).map((r) => ({ id: h.id, r })));
  for (const a of ground) {
    const R = outwardRing(a.r);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 2) continue;
      const [x, z] = onWall(F, F.len / 2, -0.6);
      for (const b of ground) if (b !== a) assert.ok(!pointInRing(b.r, x, z), `${a.id} at ${x.toFixed(1)}, ${z.toFixed(1)} inside another part`);
    }
  }
  // the features' walls face out of their house
  for (const h of HOUSES) for (const f of [...(h.balconies || []), ...(h.shops || []), ...(h.doors || []), ...(h.canopies || []), ...(h.signs || [])]) {
    const F = wallOut(h, f.on[0], f.on[1]);
    assert.ok(!groundOutlines(h).some((r) => pointInRing(r, ...onWall(F, F.len / 2, 0.5))), `${h.id}: a feature facing in`);
    if (f.s0 !== undefined) assert.ok(f.s0 >= -0.01 && f.s1 <= F.len + 0.01 && f.s1 > f.s0, `${h.id}: a feature off its wall`);
    if (f.s !== undefined) assert.ok(f.s - (f.w || 0) / 2 >= 0 && f.s + (f.w || 0) / 2 <= F.len, `${h.id}: a door or sign off its wall`);
  }
  // the timber box's ground floor set back under its overhang on the street, the ground floor inside the floors over it
  const box = HOUSES.find((h) => h.id === 'w110590693');
  const [up, gr] = box.parts;
  assert.equal(groundOutlines(box).length, 1);
  assert.ok(Math.abs(ringArea2(gr.ring)) < Math.abs(ringArea2(up.ring)) - 100);
  const [mx, mz] = gr.ring.reduce(([a, b], [x, z]) => [a + x / gr.ring.length, b + z / gr.ring.length], [0, 0]);
  for (const [x, z] of gr.ring) {
    const d = Math.hypot(mx - x, mz - z);
    assert.ok(pointInRing(up.ring, x + ((mx - x) * 0.1) / d, z + ((mz - z) * 0.1) / d), 'the ground floor under the floors over it');
  }
});

test('the roofs: over their walls with an overhang, the ridge over the eaves', () => {
  for (const h of HOUSES) for (const R of h.roofs || []) {
    assert.ok(R.y > R.eaves + 1 && R.cL > 1 && R.cR > 1);
    const [h0, h1] = hips(R);
    assert.ok(h0 >= 0 && h1 >= 0);
    const ring = roofRing(R);
    assert.ok(ring.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)));
  }
  // the main roof of each pitched house over every corner of its walls
  for (const h of HOUSES.filter((q) => q.roofs)) for (const [x, z] of h.parts[0].ring) {
    assert.ok(pointInRing(roofRing(h.roofs[0]), x, z), `${h.id}: a wall's corner outside its roof`);
    const t = partTop(h, h.parts[0], x, z);
    assert.ok(t > h.roofs[0].eaves && t < h.roofs[0].y, `${h.id}: a wall's top of ${t}`);
    assert.ok(t > h.floor + 2 * h.storey);
  }
  // the white house's cross gables rise over its long walls' middles
  const white = HOUSES.find((h) => h.id === 'w116881236');
  const F = wallFrame([-10.7, -323.6], [-2.6, -314.5]);
  assert.ok(partTop(white, white.parts[0], ...onWall(F, F.len / 2, -0.05)) > partTop(white, white.parts[0], ...onWall(F, 0.5, -0.05)) + 1);
});

test('the floors add up: storeys under the roofs, the balconies on storeys\' feet, the pavilion one storey', () => {
  assert.ok(WIN.lo > 0.5 && WIN.hi < STOREY - 0.4 && BAY > 2 * WIN.half + 0.8);
  for (const h of HOUSES) {
    assert.ok(h.base < h.floor && Number.isFinite(h.floor) && h.storey > 2.5 && h.storey < 4, `${h.id}: its floors`);
    assert.ok(Object.values(KINDS).includes(h.kind));
    for (const p of h.parts) {
      if (p.top === undefined) continue;
      assert.ok(p.top > h.floor + h.storey, `${h.id}: a part of one storey at least`);
      // (the top storey's windows under the roof: whole storeys and a parapet of under 2 m)
      const n = Math.floor((p.top - h.floor + 0.05) / h.storey);
      if (!p.closed) assert.ok(p.top - h.floor - n * h.storey < 2.0 + h.storey * 0.2, `${h.id}: ${n} storeys under ${p.top}`);
    }
    for (const Bl of h.balconies || []) {
      const ys = Bl.floors ? Bl.floors.map((k) => h.floor + k * h.storey) : upperFloors(h, Math.max(...h.parts.map((p) => p.top ?? -Infinity)), Bl.from || 1);
      assert.ok(ys.length > 0);
      for (const y of ys) assert.ok(y > h.floor + 2 && y < Math.max(...h.parts.map((p) => p.top ?? h.roofs?.[0].eaves ?? -Infinity)) - 2, `${h.id}: a balcony at ${y}`);
    }
    for (const s of h.shops || []) assert.ok(s.top > h.floor + 2.5 && s.top <= Math.max(...h.parts.map((p) => p.top ?? -Infinity)) + 1e-6, `${h.id}: a shop's fascia`);
  }
  const pav = HOUSES.find((h) => h.id === 'w1529537273');
  assert.ok(pav.parts[0].top - pav.floor < 5, 'the pavilion one tall storey, as the photographs show it');
});

test('the neighbours: nothing of the row inside a house it does not rebuild, nor in the Eisstadion', () => {
  const mine = new Set([...IDS, ...ALSO]);
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id)).map((b) => ({ id: b.id, r: osmRing(b.id) }))
    .filter(({ r }) => r.some(([x, z]) => x > -400 && x < 30 && z > -370 && z < 60));
  assert.ok(others.length > 30);
  for (const h of HOUSES) for (const ring of allOutlines(h)) {
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1) continue;
      const [x, z] = onWall(F, F.len / 2, -1.5);
      for (const o of others) assert.ok(!pointInRing(o.r, x, z), `${h.id} at ${x.toFixed(1)}, ${z.toFixed(1)} inside ${o.id}`);
    }
  }
  // the Eisstadion's outline and the Sportzentrum: apart (the hall's north corner a metre off the stand's wall)
  const stadium = EISSTADION.outline.map((p) => [p.x, p.z]);
  for (const h of HOUSES) for (const p of [...h.parts, ...(h.arcade ? [h.arcade] : [])]) {
    for (const [x, z] of p.ring) assert.ok(!pointInRing(stadium, x, z), `${h.id}: a corner in the Eisstadion`);
    for (const [x, z] of stadium) assert.ok(!pointInRing(p.ring, x, z), `${h.id}: the Eisstadion's corner inside`);
  }
  // the hand-built houses nearby lie far off: the schools of Davos Platz, the Hard Rock Hotel, the SAMD, the Kirchner Museum
  for (const [x, z] of [[-484.5, -11.0], [-433.3, -94.8], [-495.8, -130.5], [-527.9, 97.2], [-220, -492.3]]) {
    assert.ok(!insideRow(x, z));
    for (const h of HOUSES) for (const r of allOutlines(h)) assert.ok(r.every(([a, b]) => Math.hypot(a - x, b - z) > 25));
  }
});

test('the missions\' doors and places near the row stay outside it; the Eisstadion\'s pizza door under the arcade', async () => {
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
  const near = points.filter(([x, z]) => x > -400 && x < 30 && z > -370 && z < 60);
  assert.ok(near.some(([x, z]) => Math.hypot(x + 195.5, z + 252.3) < 0.1), 'the Eisstadion\'s door read');
  for (const [x, z] of near) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
  // the door 1.4 m before the hall's wall, under the arcade's roof, its way to the road between the posts
  const sz = HOUSES.find((h) => h.id === 'w37221745');
  assert.ok(pointInRing(sz.arcade.ring, -195.5, -252.3) && !pointInRing(sz.parts[0].ring, -195.5, -252.3));
  const F = wallFrame([-156.6, -226.6], [-198.8, -260.6]);
  const n = Math.max(1, Math.round(F.len / sz.arcade.posts)), gap = F.len / n;
  assert.ok(gap > 4, 'the posts some metres apart');
});

test('the row in Node: every vertex finite, five meshes, the phone\'s materials plain, the outlines registered, the colliders', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildTalstrasse1, ATLAS } = await import('../js/talstrasse-1.js');
  for (const h of HOUSES) assert.equal(SURVEYED_FOOTPRINTS.get(h.id).length, groundOutlines(h).length);
  assert.deepEqual(SURVEYED_FOOTPRINTS.get('w124795036'), []);
  assert.equal(SURVEYED_FOOTPRINTS.get('w1529534136').length, 2);
  for (const id of ['n9949249917', 'n928545586', 'n9931694417', 'n8696405565', 'n4617931685']) assert.ok(SHOP_EXCLUSIONS.has(id), id);
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'atlas cells overlapping');
  }
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildTalstrasse1(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Talstrasse 1 ', '')).sort();
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
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -23 && p.array[i] < 0, `${m.name}: a height of ${p.array[i]}`);
    }
    assert.ok(tris < 15000, `${tris} triangles`);
    // the colliders: the arcade's posts, the timber box's, the canopy's columns and the pump islands, at world heights
    assert.ok(colliders.length >= 20);
    for (const c of colliders) {
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
      assert.ok(c.maxY > c.baseY && c.maxX - c.minX < 6 && c.maxZ - c.minZ < 6 && c.obb.hx > 0 && c.obb.hz > 0);
      // none on the Eisstadion's pizza door or its way out to the road
      for (let t = 0; t <= 1; t += 0.05) {
        const x = -195.5 + (-183.4 + 195.5) * t, z = -252.3 + (-267.2 + 252.3) * t;
        assert.ok(!(x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3), 'a post on the way to the door');
      }
    }
  }
});
