import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, STOREY, WIN, VIEWS, groundOutlines, hips, insideRow, onWall, outwardRing, partTop, pointInRing, ringArea2, roofRing, roofY, wallFrame, wallOut
} from '../js/talstrasse-2-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { SHOPS_DATA } from '../js/shops-data.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};
// the houses of the stretch with a surveyed batch, and the neighbours their batches hold
const IDS = ['w97292393', 'w965237020', 'w97292400', 'w97292419', 'w221110631', 'w221111398', 'w221111397', 'w457694791',
  'w221111395', 'w116881212', 'w123380420', 'w124794941', 'w124795057', 'w116881286', 'w124795028', 'w117012290',
  'w1530254979', 'w124794982', 'w124795043', 'w124794978', 'w124795047', 'w221123483'];
const NEIGHBOURS = ['w221110634', 'w221110628', 'w123380418', 'w1530254980', 'w116881289', 'w116881155'];
// the houses with no batch, left to js/buildings.js
const LEFT = ['w712452961', 'w124795055'];

test('the row: every house with a batch, the neighbours in their batches, each batch excluded once', () => {
  assert.deepEqual(HOUSES.map((h) => h.id).sort(), [...IDS, ...NEIGHBOURS].sort());
  for (const id of LEFT) assert.ok(!HOUSES.some((h) => h.id === id));
  const all = HOUSES.flatMap((h) => h.exclude);
  assert.equal(all.length, 26);
  for (const e of all) assert.ok(e.r === 3 && Number.isFinite(e.x) && Number.isFinite(e.z));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > 3, 'two exclusions apart');
  }
  // each house's batches within its own footprint's reach, its footprint in OpenStreetMap at its outlines
  for (const h of HOUSES) {
    const own = osmRing(h.id);
    assert.ok(own, `${h.id} in OpenStreetMap`);
    for (const e of h.exclude) assert.ok(h.parts.some((p) => pointInRing(p.ring, e.x, e.z)) || own.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 15), `${h.id}: a batch far off`);
    const [cx, cz] = own.reduce(([a, b], [x, z]) => [a + x / own.length, b + z / own.length], [0, 0]);
    assert.ok(h.parts.some((p) => pointInRing(p.ring, cx, cz)) || h.parts.some((p) => p.ring.some(([x, z]) => Math.hypot(x - cx, z - cz) < 10)), `${h.id}: its outline away from OSM's`);
  }
});

test('the outlines: of some size, simple, the walls facing out', () => {
  for (const h of HOUSES) for (const p of h.parts) {
    const ring = p.ring;
    assert.ok(ring.length >= 3 && Math.abs(ringArea2(ring)) / 2 > 5, `${h.id}: an outline of some size`);
    for (const [x, z] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(z));
    const n = ring.length;
    const cross = (p0, q, r, s) => {
      const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      return d(p0, q, r) * d(p0, q, s) < -1e-9 && d(r, s, p0) * d(r, s, q) < -1e-9;
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
  // the features' walls face out of their house, their stretches on their walls
  for (const h of HOUSES) for (const f of [...(h.balconies || []), ...(h.shops || []), ...(h.canopies || []), ...(h.claddings || []), ...(h.doors || [])]) {
    const F = wallOut(h, f.on[0], f.on[1]);
    // (a balcony may stand over a lower part before its wall)
    const lowest = f.floors ? Math.min(...f.floors) : -Infinity;
    assert.ok(!h.parts.some((p) => (p.top ?? Infinity) > lowest && pointInRing(p.ring, ...onWall(F, F.len / 2, 0.5))), `${h.id}: a feature facing in`);
    assert.ok(h.parts.some((p) => p.ring.some((q) => Math.hypot(q[0] - f.on[0][0], q[1] - f.on[0][1]) < 0.01)), `${h.id}: a feature off its outline`);
    if (f.s0 !== undefined) assert.ok(f.s0 >= 0 && f.s1 <= F.len + 0.01 && f.s1 - f.s0 > 1, `${h.id}: a feature's stretch ${f.s0}–${f.s1} on a wall of ${F.len.toFixed(1)}`);
  }
});

test('the roofs: over their walls with an overhang, the ridge over the eaves, the walls\' tops under them', () => {
  const pitched = HOUSES.filter((h) => h.roofs);
  assert.deepEqual(pitched.map((h) => h.id).sort(), ['w124795028', 'w221123483', 'w97292400']);
  for (const h of pitched) for (const R of h.roofs) {
    assert.ok(R.y > R.eaves + 1 && R.y > (R.eavesR ?? R.eaves) + 1 && R.cL > 1 && R.cR > 1);
    const [h0, h1] = hips(R);
    assert.ok(h0 >= 0 && h1 >= 0);
    const ring = roofRing(R);
    for (const p of h.parts.filter((q) => q.roofs)) {
      for (const [x, z] of p.ring) {
        assert.ok(pointInRing(ring, x, z), `${h.id}: a wall's corner outside its roof`);
        const y = roofY(R, x, z);
        assert.ok(y !== null && y > Math.min(R.eaves, R.eavesR ?? R.eaves) && y < R.y, `${h.id}: a corner's roof at ${y}`);
      }
    }
  }
  // the walls' tops: flat parts at their roofs, a storey over the floor at least; pitched ones over two storeys
  for (const h of HOUSES) for (const p of h.parts) {
    if (p.top !== undefined) { assert.ok(p.top > h.floor + STOREY, `${h.id}: a part of one storey at least`); continue; }
    for (const [x, z] of p.ring) {
      const t = partTop(h, p, x, z);
      assert.ok(Number.isFinite(t) && t > h.floor + 2 * STOREY && t < h.roofs[0].y, `${h.id}: a wall's top of ${t}`);
    }
  }
});

test('the floors add up: the balconies on storeys\' feet, the shops under their houses\' tops, the floors on the ground', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  assert.ok(WIN.lo > 0.5 && WIN.hi < STOREY - 0.4);
  for (const h of HOUSES) {
    assert.ok(h.base < h.floor + 0.01 && Number.isFinite(h.floor), `${h.id}: the walls reach under the floor`);
    // the walls reach under the lowest ground round the house, the floor within a storey of it
    let lo = Infinity;
    for (const ring of groundOutlines(h)) for (const [x, z] of ring) lo = Math.min(lo, groundHeight(x, z));
    assert.ok(h.base <= lo + 0.05, `${h.id}: its walls' foot ${h.base} over the ground ${lo.toFixed(2)}`);
    assert.ok(Math.abs(h.floor - lo) < STOREY, `${h.id}: its floor ${h.floor} far from the ground ${lo.toFixed(2)}`);
    for (const Bl of h.balconies || []) for (const y of Bl.floors) {
      const k = (y - h.floor) / STOREY;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6 && k > 1 - 1e-6, `${h.id}: a balcony at ${y} off the storeys`);
      assert.ok(y < Math.max(...h.parts.map((p) => p.top ?? h.roofs[0].eaves)) - 1, `${h.id}: a balcony over the roof`);
    }
    for (const s of h.shops || []) assert.ok(s.top > h.floor + 2 && s.top < Math.max(...h.parts.map((p) => p.top ?? -Infinity), h.floor + 10), `${h.id}: a shop's top at ${s.top}`);
    for (const c of h.canopies || []) assert.ok((h.shops || []).some((s) => Math.abs(s.top - c.y) < 0.01), `${h.id}: a canopy over no shop`);
  }
});

test('the neighbours: nothing of the row inside a house it does not rebuild, nor inside the hand-built ones nearby', async () => {
  const mine = new Set(HOUSES.map((h) => h.id));
  // (the parts in no OSM building and w116881155's back stand where OSM has other outlines round them)
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id) && b.id !== 'w123380399' && b.id !== 'w1530254981').map((b) => osmRing(b.id))
    .filter((r) => r.some(([x, z]) => x > -830 && x < -360 && z > 20 && z < 660));
  assert.ok(others.length > 20);
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    // (a step 1.5 m into the outline: OpenStreetMap's neighbours stand up to a metre off the survey's walls)
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1.5) continue;
      const [x, z] = onWall(F, F.len / 2, -1.5);
      if (!pointInRing(ring, x, z)) continue;
      for (const o of others) assert.ok(!pointInRing(o, x, z), `${h.id} at ${x.toFixed(1)}, ${z.toFixed(1)} inside a neighbour`);
    }
  }
  // the hand-built ones nearby: their excluded batches' centres outside the row
  const near = [[-781.1, 562.1], [-783.3, 544.5], [-783.6, 554.7], [-787.9, 560.6], // the Pauluskirche
    [-693.3, 467.6], [-695.3, 467.7], [-695.7, 478.7], // the Grischa
    [-649.6, 402.5], [-651.2, 355.6], [-652, 328.3], [-687, 419.4], // the Post and the Coop
    [-571, 308.6], [-549.9, 279.6], [-476.3, 328.6], [-527.9, 97.2], [-596.5, 93.4]]; // Hotel Alte Post, St. Johann, Tinzenblick, SAMD, Schweizerhof
  for (const [x, z] of near) assert.ok(!insideRow(x, z), `${x}, ${z}`);
  // the houses left to js/buildings.js: no part of the row in them
  for (const id of LEFT) {
    const o = osmRing(id);
    for (const h of HOUSES) for (const p of h.parts) {
      const [cx, cz] = p.ring.reduce(([a, b], [x, z]) => [a + x / p.ring.length, b + z / p.ring.length], [0, 0]);
      assert.ok(!pointInRing(o, cx, cz), `${h.id} inside ${id}`);
    }
  }
});

test('the missions\' doors and starts near the row stay outside it, the Tijuana\'s door before the hotel', async () => {
  const dir = new URL('../js/', import.meta.url);
  const points = [];
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 5) return;
    if (typeof v.x === 'number' && typeof v.z === 'number' && v.agl === undefined) points.push([v.x, v.z]);
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  for (const f of readdirSync(dir).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    let mod;
    try { mod = await import(new URL(f, dir)); } catch { continue; }
    for (const k of Object.keys(mod)) if (typeof mod[k] === 'object') walk(mod[k], 0);
  }
  assert.ok(points.length > 20, 'the missions\' places read');
  const here = points.filter(([x, z]) => x > -830 && x < -360 && z > 20 && z < 660);
  assert.ok(here.length > 10);
  for (const [x, z] of here) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
  // the Tijuana's door: 1–4 m before the hotel's street front
  const hotel = HOUSES.find((h) => h.id === 'w221111395');
  const F = wallOut(hotel, [-541.6, 330.2], [-518.3, 314.4]);
  const d = (-530.2 - F.a[0]) * F.n[0] + (325.2 - F.a[1]) * F.n[1];
  assert.ok(d > 1 && d < 4, `the door ${d.toFixed(2)} m before the wall`);
});

test('the shops\' signs: the OSM wall js/shops.js hangs each on lies on its house\'s walls', () => {
  const signs = { n4538085420: 'w97292400', n5400928138: 'w123380420', n1597755065: 'w124794982', n13327890990: 'w124795043', n792946627: 'w1530254980', n6148450114: 'w116881289', n4538120994: 'w221110634' };
  const near = (p, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
    return [a[0] + t * dx, a[1] + t * dz];
  };
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const rings = DAVOS_DATA.buildings.map((b) => osmRing(b.id));
  for (const [osm, id] of Object.entries(signs)) {
    const s = SHOPS_DATA.find((q) => q.osm === osm), h = HOUSES.find((q) => q.id === id);
    assert.ok(s && h, osm);
    // (the nearest OSM wall, as js/shops.js finds it)
    let wall = null;
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const q = near([s.x, s.z], r[i], r[(i + 1) % r.length]);
      if (!wall || dist(q, [s.x, s.z]) < wall.d) wall = { d: dist(q, [s.x, s.z]), q };
    }
    let best = Infinity;
    for (const ring of groundOutlines(h)) for (let i = 0; i < ring.length; i++) best = Math.min(best, dist(wall.q, near(wall.q, ring[i], ring[(i + 1) % ring.length])));
    assert.ok(best < 2, `${s.name}: its wall ${best.toFixed(1)} m from ${h.name}'s`);
  }
});

test('the camera spots: finite, looking along the street', () => {
  for (const v of Object.values(VIEWS)) {
    assert.equal(v.length, 6);
    assert.ok(v.every(Number.isFinite));
    assert.ok(!insideRow(v[0], v[2]), 'a camera inside a house');
  }
});

test('the row in Node: every vertex finite, four meshes, the phone\'s materials plain, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildTalstrasse2 } = await import('../js/talstrasse-2.js');
  for (const h of HOUSES) {
    if (h.register === false) assert.ok(!SURVEYED_FOOTPRINTS.has(h.id), `${h.id} keeps its OSM walls`);
    else assert.equal(SURVEYED_FOOTPRINTS.get(h.id).length, groundOutlines(h).length);
  }
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildTalstrasse2(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Talstrasse row 2 ', '')).sort();
    assert.deepEqual(names, ['glass', 'roof', 'trim', 'walls']);
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
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -25 && p.array[i] < 6.5, `${m.name}: a height of ${p.array[i]}`);
    }
    assert.ok(tris < 15000, `${tris} triangles`);
  }
});

// The player's walls as js/buildings.js raises them on registered outlines (a box 0.44 m thick on every edge) and on the
// OpenStreetMap outlines of the buildings round the row nobody registered; a walker (radius 0.48) pushed out of them one
// after the other as js/controllers.js resolveHorizontalCollision does (the in-game probe's replay)
const wallBoxes = (rings) => rings.flatMap((r) => r.map((a, i) => {
  const c = r[(i + 1) % r.length], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
  if (L < 0.3) return null;
  const ry = -Math.atan2(dz, dx);
  return { cx: (a[0] + c[0]) / 2, cz: (a[1] + c[1]) / 2, hx: L / 2, hz: 0.22, cs: Math.cos(ry), sn: Math.sin(ry) };
}).filter(Boolean));
function pushed(boxes, x, z, r = 0.48) {
  let px = x, pz = z;
  for (const b of boxes) {
    const dx = px - b.cx, dz = pz - b.cz, lx = dx * b.cs - dz * b.sn, lz = dx * b.sn + dz * b.cs;
    const qx = lx - Math.max(-b.hx, Math.min(b.hx, lx)), qz = lz - Math.max(-b.hz, Math.min(b.hz, lz)), d = Math.hypot(qx, qz);
    if (d >= r) continue;
    let nx = 0, nz = 0, depth;
    if (d > 0) { nx = qx / d; nz = qz / d; depth = r - d; } else if (b.hx - Math.abs(lx) <= b.hz - Math.abs(lz)) { nx = lx <= 0 ? -1 : 1; depth = b.hx - Math.abs(lx) + r; } else { nz = lz <= 0 ? -1 : 1; depth = b.hz - Math.abs(lz) + r; }
    px += (nx * b.cs + nz * b.sn) * depth; pz += (-nx * b.sn + nz * b.cs) * depth;
  }
  return Math.hypot(px - x, pz - z) > 0.05;
}
// (each outer wall of 2 m or more, as the in-game probe walks them: its outward side the one not inside the house)
function probeWalls(rings, each) {
  for (const ring of rings) {
    const sg = Math.sign(ring.reduce((t, a, i) => { const b = ring[(i + 1) % ring.length]; return t + a[0] * b[1] - b[0] * a[1]; }, 0));
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 2) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      let nx = ((b[1] - a[1]) / L) * sg, nz = (-(b[0] - a[0]) / L) * sg;
      const inside = (d) => rings.some((r) => pointInRing(r, mx + nx * d, mz + nz * d));
      if (inside(0.5)) { nx = -nx; nz = -nz; }
      if (inside(0.5)) continue;
      each(mx, mz, nx, nz);
    }
  }
}

test('the player\'s walls: pushed out behind every outer wall, a free metre before it (the in-game probe replayed)', () => {
  const reg = HOUSES.filter((h) => h.register !== false);
  const mine = new Set(reg.map((h) => h.id));
  const all = reg.flatMap((h) => groundOutlines(h));
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id) && b.ring[0] > -840 && b.ring[0] < -350 && b.ring[1] > 10 && b.ring[1] < 670).map((b) => osmRing(b.id));
  const every = wallBoxes([...all, ...others]);
  let walls = 0;
  const bad = [];
  for (const h of reg) {
    const own = wallBoxes(groundOutlines(h));
    probeWalls(groundOutlines(h), (mx, mz, nx, nz) => {
      walls++;
      if (!pushed(every, mx - nx * 0.6, mz - nz * 0.6)) bad.push(`${h.id}: free 0.6 m behind its wall at ${mx.toFixed(1)}, ${mz.toFixed(1)}`);
      if (pushed(own, mx + nx, mz + nz)) bad.push(`${h.id}: its own walls 1 m before its wall at ${mx.toFixed(1)}, ${mz.toFixed(1)}`);
    });
  }
  assert.ok(walls > 100);
  assert.deepEqual(bad, []);
});
