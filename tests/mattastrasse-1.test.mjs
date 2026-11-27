import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, STOREY, WIN, groundOutlines, insideRow, onWall, outwardRing, partTop, pointInRing, ringArea2, roofRing, roofY, wallFrame, wallOut
} from '../js/mattastrasse-1-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { SHOPS_DATA } from '../js/shops-data.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};
const IDS = ['w1530254977', 'w124794955', 'w1530254978', 'w124794946', 'w124795046', 'w116881142', 'w126271055', 'w124794951',
  'w1530308095', 'w965237015', 'w124794959', 'w1530308093', 'w1530308092', 'w124794960', 'w1528682843', 'w124794992', 'w124874490'];
const AREA = ([x, z]) => x > -450 && x < -70 && z > 90 && z < 275;

test('the row: its seventeen houses, each excluding its surveyed batches, none excluded twice', () => {
  assert.deepEqual(HOUSES.map((h) => h.id).sort(), [...IDS].sort());
  const all = HOUSES.flatMap((h) => h.exclude);
  assert.equal(all.length, 17);
  for (const e of all) assert.ok(e.r === 3 && Number.isFinite(e.x) && Number.isFinite(e.z));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > 3, 'two exclusions apart');
  }
  // every excluded batch's centre inside the row's rebuilt outlines (what the exclusion removes is rebuilt)
  // (a batch's centre may fall in a yard between the houses it holds: within 5 m of the row's walls)
  const near = (x, z) => insideRow(x, z) || HOUSES.some((h) => groundOutlines(h).some((r) => r.some(([a, b]) => Math.hypot(a - x, b - z) < 5)));
  for (const e of all) assert.ok(near(e.x, e.z), `${e.x}, ${e.z} outside the row`);
  for (const h of HOUSES) {
    const own = osmRing(h.id);
    assert.ok(own, `${h.id} in OpenStreetMap`);
    const [cx, cz] = own.reduce(([a, b], [x, z]) => [a + x / own.length, b + z / own.length], [0, 0]);
    const outl = groundOutlines(h);
    assert.ok(outl.some((r) => pointInRing(r, cx, cz)) || outl.some((r) => r.some(([x, z]) => Math.hypot(x - cx, z - cz) < 8)), `${h.id}: its outline away from OSM's`);
  }
});

test('the outlines: of some size, simple, the walls facing out', () => {
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    assert.ok(ring.length >= 3 && Math.abs(ringArea2(ring)) / 2 > 3, `${h.id}: an outline of some size`);
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
  // the features face out of their house (a balcony over a lower roof: out of the parts higher than it)
  for (const h of HOUSES) {
    for (const f of [...(h.shops || []), ...(h.gableWindows || [])]) {
      const F = wallOut(h, f.on[0], f.on[1]);
      assert.ok(!h.parts.some((p) => pointInRing(p.ring, ...onWall(F, F.len / 2, 0.5))), `${h.id}: a shop front facing in`);
    }
    for (const Bl of h.balconies || []) {
      const F = Bl.raw ? wallFrame(Bl.on[0], Bl.on[1]) : wallOut(h, Bl.on[0], Bl.on[1]);
      const [x, z] = onWall(F, (Bl.s0 + Bl.s1) / 2, Bl.depth / 2);
      for (const hh of HOUSES) for (const p of hh.parts) {
        if (pointInRing(p.ring, x, z)) assert.ok(partTop(hh, p, x, z) < Math.min(...Bl.floors) - 0.15, `${h.id}: a balcony inside a volume`);
      }
    }
    // the lettering on its wall, face out
    for (const D of h.decals || []) {
      const F = wallFrame(D.on[0], D.on[1]);
      assert.ok(D.s0 >= 0 && D.s1 <= F.len && D.s1 > D.s0);
      assert.ok(!h.parts.some((p) => pointInRing(p.ring, ...onWall(F, (D.s0 + D.s1) / 2, 0.3))), `${h.id}: lettering facing in`);
    }
  }
});

test('the lettering stays clear of the windows', () => {
  const S = STOREY;
  for (const h of HOUSES) for (const D of h.decals || []) {
    const F = wallFrame(D.on[0], D.on[1]), mid = F.len / 2, sc = h.bay || 1;
    // rows: the lettering between two rows, or the columns clear of it
    const k = Math.floor((D.y0 - h.floor) / S), foot = h.floor + k * S;
    const rowsClear = D.y0 >= foot + WIN.hi && D.y1 <= foot + S + WIN.lo - 0.1;
    let colsClear = true;
    for (let k = -10; k <= 10; k++) {
      const c = mid + k * 2.7 * sc;
      if (Math.abs(k * 2.7) + WIN.half + 0.45 > mid / sc) continue;
      if (D.s1 > c - WIN.half - 0.1 && D.s0 < c + WIN.half + 0.1) colsClear = false;
    }
    assert.ok(rowsClear || colsClear, `${h.id}: ${D.key} over a window`);
  }
});

test('the roofs: over their walls with an overhang, the ridge over the eaves, the walls\' tops under them', () => {
  for (const h of HOUSES) for (const R of h.roofs || []) {
    assert.ok(R.y > R.eaves + 1 && R.cL > 1 && R.cR > 1);
    const ring = roofRing(R);
    assert.ok(ring.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)) && pointInRing(ring, ...[0, 1].map((i) => (R.a[i] + R.b[i]) / 2)));
  }
  for (const h of HOUSES) for (const p of h.parts) {
    if (p.top !== undefined) { assert.ok(p.top > h.floor + STOREY, `${h.id}: a part of one storey at least`); continue; }
    // every wall corner under one of its roofs, over the eaves
    for (const [x, z] of p.ring) {
      const ys = p.roofs.map((i) => roofY(h.roofs[i], x, z)).filter((y) => y !== null);
      assert.ok(ys.length, `${h.id}: a wall's corner outside its roofs`);
      const t = partTop(h, p, x, z);
      assert.ok(Number.isFinite(t) && t > h.floor + 2 * STOREY && t < 0, `${h.id}: a wall's top of ${t}`);
    }
  }
});

test('the floors add up: the storeys\' windows under the roofs, the balconies on storeys\' feet, shops under their tops', () => {
  assert.ok(WIN.lo > 0.5 && WIN.hi < STOREY - 0.4);
  for (const h of HOUSES) {
    assert.ok(h.base < h.floor + 0.01 && Number.isFinite(h.floor), `${h.id}: the walls reach under the floor`);
    for (const Bl of h.balconies || []) for (const y of Bl.floors) {
      const k = (y - h.floor) / STOREY;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6 && k > 1 - 1e-6, `${h.id}: a balcony at ${y} off the storeys`);
    }
    for (const s of h.shops || []) assert.ok(s.s1 - s.s0 > 1 && s.top < Math.max(...h.parts.map((p) => p.top ?? -99)));
  }
});

test('the neighbours: nothing of the row inside a house it does not rebuild', () => {
  const mine = new Set(IDS);
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id)).map((b) => osmRing(b.id)).filter((r) => r.some(AREA));
  assert.ok(others.length > 10);
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1) continue;
      const [x, z] = onWall(F, F.len / 2, -1.5);
      for (const o of others) assert.ok(!pointInRing(o, x, z), `${h.id} at ${x.toFixed(1)}, ${z.toFixed(1)} inside a neighbour`);
    }
  }
  // the hand-built house of Sport Hofmänner (its centre) and the Eisstadion lie outside
  for (const [x, z] of [[-242.3, 159.8], [-240, -300]]) assert.ok(!insideRow(x, z));
});

test('the missions\' places near the row stay outside it, Sport Hofmänner\'s door reachable', async () => {
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
  for (const [x, z] of points.filter(AREA)) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
  // the street stays clear
  for (const [x, z] of [[-396.3, 126.8], [-370.9, 130.8], [-345.1, 143.3], [-303.5, 178], [-268.6, 196.1], [-226.1, 209.1], [-180, 219.4], [-141.4, 206.9], [-109.4, 188.8]]) {
    assert.ok(!insideRow(x, z), `the street at ${x}, ${z}`);
  }
});

test('the shops\' generic signs sit on the row\'s walls', () => {
  const ids = new Set(IDS);
  const drawn = new Set(HOUSES.flatMap((h) => h.shopIds || []));
  assert.deepEqual([...drawn].sort(), ['n12164161200', 'n12164186601', 'n13052134735']);
  const shops = SHOPS_DATA.filter((s) => ['n12164161200', 'n3198310468', 'n13052134735', 'n12164186601'].includes(s.osm) && !drawn.has(s.osm));
  assert.equal(shops.length, 1);
  for (const s of shops) {
    // the nearest OSM wall (js/shops.js nearestWall), the board 0.14 m before it
    let best = null;
    for (const b of DAVOS_DATA.buildings) {
      const r = b.ring;
      if (Math.hypot(r[0] - s.x, r[1] - s.z) > 80) continue;
      let cx = 0, cz = 0;
      for (let i = 0; i < r.length; i += 2) { cx += r[i]; cz += r[i + 1]; }
      cx /= r.length / 2; cz /= r.length / 2;
      for (let i = 0; i < r.length; i += 2) {
        const ax = r[i], az = r[i + 1], bx = r[(i + 2) % r.length], bz = r[(i + 3) % r.length];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
        if (L2 < 4) continue;
        const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / L2));
        const px = ax + t * dx, pz = az + t * dz, d = Math.hypot(px - s.x, pz - s.z);
        if (best && d >= best.d) continue;
        const L = Math.sqrt(L2);
        let nx = -dz / L, nz = dx / L;
        if ((px + nx - cx) ** 2 + (pz + nz - cz) ** 2 < (px - nx - cx) ** 2 + (pz - nz - cz) ** 2) { nx = -nx; nz = -nz; }
        best = { id: b.id, px, pz, nx, nz, d };
      }
    }
    assert.ok(ids.has(best.id), `${s.name} on ${best.id}`);
    const bx = best.px + best.nx * 0.14, bz = best.pz + best.nz * 0.14;
    assert.ok(!insideRow(bx, bz), `${s.name}: its board inside the walls`);
    assert.ok(insideRow(best.px - best.nx * 0.8, best.pz - best.nz * 0.8), `${s.name}: its board standing off the walls`);
  }
});

test('the row in Node: every vertex finite, five meshes, the phone\'s materials plain, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildMattastrasse1, ATLAS } = await import('../js/mattastrasse-1.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.ok(SHOP_EXCLUSIONS.has('n12164161200') && SHOP_EXCLUSIONS.has('n13052134735') && SHOP_EXCLUSIONS.has('n12164186601'));
  for (const h of HOUSES) assert.equal(SURVEYED_FOOTPRINTS.get(h.id).length, groundOutlines(h).length);
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 256);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'atlas cells overlapping');
  }
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildMattastrasse1(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Mattastrasse 1 ', '')).sort();
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
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -25 && p.array[i] < 1.5, `${m.name}: a height of ${p.array[i]}`);
    }
    assert.ok(tris < 15000, `${tris} triangles`);
    if (!simple) console.log(`# Mattastrasse 1: ${group.children.length} meshes, ${tris} triangles`);
  }
});
