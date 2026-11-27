import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  MATTASTRASSE_2 as D, clipBand, frameOf, groundOutlines, insideRow, onWall, outwardRing, pointInRing, ringArea2, roofHeights, wallFrame,
  wallMeasures, wallTriangles
} from '../js/mattastrasse-2-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const IDS = ['w124794988', 'w124795019', 'w124795035', 'w124795040', 'w124794957', 'w124794958', 'w124794989', 'w124874513', 'w124874472',
  'w1159013586', 'w124874489', 'w124874497', 'w124874503', 'w124874495', 'w124874482', 'w124874483', 'w124874466', 'w37390893', 'w111019897',
  'w124874502', 'w126895312'];
// (no batch of their own: left to js/buildings.js; w1159013594's only batch is the minigolf's building site)
const LEFT = ['w1528681120', 'w124794947', 'w1159013594', 'w1159013612', 'w126895476'];
const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};

test('every house of the row, each an OpenStreetMap building, its surveyed batches left out', () => {
  assert.deepEqual(D.houses.map((h) => h.id).sort(), [...IDS].sort());
  for (const id of LEFT) assert.ok(!D.houses.some((h) => h.id === id), `${id} left alone`);
  for (const h of D.houses) {
    assert.ok(osmRing(h.id), `${h.id} in OpenStreetMap`);
    assert.ok(h.exclude.length >= 1 && h.exclude.every((e) => e.r === 3 && Number.isFinite(e.x) && Number.isFinite(e.z)));
    for (const e of h.exclude) assert.ok(h.rings.flat().some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 30), h.id);
  }
  const all = D.houses.flatMap((h) => h.exclude.map((e) => `${e.x},${e.z}`));
  assert.equal(new Set(all).size, all.length, 'no batch left out twice');
  // (the minigolf's building site, js/missions-data-sport.js MINIGOLF_EXCLUDE, is not ours)
  for (const h of D.houses) for (const e of h.exclude) assert.ok(Math.hypot(e.x - 374.5, e.z + 162.4) > 6);
});

test('the outlines: of some size, the walls facing out, near their OpenStreetMap footprints', () => {
  for (const h of D.houses) {
    assert.ok(groundOutlines(h).length >= 1, h.id);
    let area = 0;
    for (const ring of groundOutlines(h)) {
      assert.ok(ring.length >= 3);
      for (const [x, z] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(z));
      area += Math.abs(ringArea2(ring)) / 2;
      const R = outwardRing(ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len < 1) continue;
        assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.15)), `${h.id}: a step out of a wall leaves the outline`);
        assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.15)));
      }
    }
    assert.ok(area > 60, `${h.id}: outlines of some size (${area.toFixed(0)} m²)`);
    // (the outlines cover most of the house's OSM footprint, or the footprint most of them)
    const own = osmRing(h.id);
    let n = 0, both = 0;
    const xs = own.map((q) => q[0]), zs = own.map((q) => q[1]);
    for (let x = Math.min(...xs); x < Math.max(...xs); x += 0.5) for (let z = Math.min(...zs); z < Math.max(...zs); z += 0.5) {
      if (!pointInRing(own, x, z)) continue;
      n++;
      if (groundOutlines(h).some((r) => pointInRing(r, x, z))) both++;
    }
    // (w124794988's and w124794989's footprints reach over yards the survey has no building on: 339 and 970 m² mapped,
    // 131 and 359 m² surveyed)
    assert.ok(both / n > (['w124794988', 'w124794989'].includes(h.id) ? 0.3 : 0.5), `${h.id}: ${(100 * both / n).toFixed(0)} % of its footprint inside its outlines`);
  }
});

test('the walls: their triangles face out of their frames, stand on the house\'s base, under its roofs', () => {
  let walls = 0;
  for (const h of D.houses) {
    let top = -Infinity;
    for (const t of h.roof) { assert.ok(t.length === 9 && t.every(Number.isFinite), h.id); top = Math.max(top, t[1], t[4], t[7]); }
    for (const w of h.walls) {
      const F = frameOf(w), m = wallMeasures(w);
      assert.ok(F.len > 0.05 && Number.isFinite(m.minTop) && m.foot >= h.base - 0.05 && m.maxTop <= top + 0.05, h.id);
      for (const T of wallTriangles(w)) {
        // (counter-clockwise seen from before the wall: the face's normal along F.n)
        const P = T.map(([s, y]) => { const [x, z] = onWall(F, s); return [x, y, z]; });
        const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], v = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[0] * v[1] - u[1] * v[0]];
        // (n[0] the x of the normal, n[1] its z: u × v = (uy vz − uz vy, …, ux vy − uy vx))
        const nl = Math.hypot(n[0], n[1]);
        if (nl < 1e-4) continue;
        assert.ok((n[0] * F.n[0] + n[1] * F.n[1]) / nl > 0.99, `${h.id}: a wall triangle facing in`);
        for (const [s] of T) assert.ok(s > -0.05 && s < F.len + 0.05);
      }
      walls++;
    }
    // (every outline's walls under the house's roof: its middle 0.3 m in from each long wall is roofed)
    for (const ring of groundOutlines(h)) {
      const R = outwardRing(ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len < 3) continue;
        assert.ok(roofHeights(h, ...onWall(F, F.len / 2, -0.4)).length > 0, `${h.id}: an outline's wall under no roof at ${onWall(F, F.len / 2).map((v) => v.toFixed(1))}`);
      }
    }
  }
  assert.ok(walls > 300);
  // (a band of a triangle)
  assert.deepEqual(clipBand([[0, 0], [2, 0], [0, 2]], 0.5, 1).length, 4);
  assert.deepEqual(clipBand([[0, 0], [2, 0], [0, 2]], 3, 4), []);
});

test('the looks: every house of a known kind, its colours in the palettes, every guess said so', () => {
  for (const h of D.houses) {
    const L = h.look;
    assert.ok(['house', 'chalet', 'block', 'hall'].includes(L.kind), h.id);
    assert.ok(D.plaster[L.plaster] && D.wood[L.wood], h.id);
    assert.ok(Array.isArray(L.door) && L.door.length === 2);
    if (L.balconies) assert.ok(L.balconies.n >= 1 && L.balconies.facing.length === 2);
  }
  for (const pal of [D.plaster, D.wood]) for (const c of pal) assert.ok(c.every((v) => v > 0 && v <= 0.62));
});

test('the missions\' places near the row stay outside it', async () => {
  const dir = new URL('../js/', import.meta.url);
  const points = [];
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 6) return;
    if (typeof v.x === 'number' && typeof v.z === 'number') points.push([v.x, v.z]);
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  for (const f of readdirSync(dir).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    let mod;
    try { mod = await import(new URL(f, dir)); } catch { continue; }
    for (const k of Object.keys(mod)) if (typeof mod[k] === 'object') walk(mod[k], 0);
  }
  assert.ok(points.length > 20, 'the missions\' places read');
  // (the golf mission's pin by the clubhouse and the minigolf's start by the Waldhuus among them)
  assert.ok(points.some(([x, z]) => Math.hypot(x - 814.2, z + 369.8) < 0.5));
  assert.ok(points.some(([x, z]) => Math.hypot(x - 393, z + 174) < 1));
  for (const [x, z] of points) assert.ok(!insideRow(x, z), `a mission's place ${x}, ${z} inside the row`);
  // (the clubhouse's pin a step from its walls)
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(!insideRow(814.2 + dx, -369.8 + dz));
});

test('the shops\' signs: AVIA\'s and the Hotel Waldhuus\' on OSM walls within a metre and a half of the surveyed ones, the Golf Club\'s lettered here', async () => {
  const { SHOPS_DATA } = await import('../js/shops-data.js');
  const golf = D.houses.find((h) => h.id === 'w37390893').look.sign;
  assert.ok(SHOPS_DATA.some((q) => q.osm === golf.shop && q.name === 'Golf Club Davos'));
  for (const name of ['AVIA', 'Hotel Waldhuus']) {
    const s = SHOPS_DATA.find((q) => q.name === name && q.x > -60 && q.x < 1110 && q.z > -410 && q.z < 130);
    assert.ok(s, name);
    // (the OSM wall nearest to it, as js/shops.js nearestWall finds it)
    let best = null;
    for (const b of DAVOS_DATA.buildings) {
      if (Math.hypot(b.ring[0] - s.x, b.ring[1] - s.z) > 120) continue;
      const r = b.ring;
      for (let i = 0; i < r.length; i += 2) {
        const ax = r[i], az = r[i + 1], bx = r[(i + 2) % r.length], bz = r[(i + 3) % r.length];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
        if (L2 < 4) continue;
        const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / L2));
        const px = ax + t * dx, pz = az + t * dz, d = Math.hypot(px - s.x, pz - s.z);
        if (!best || d < best.d) best = { px, pz, d, id: b.id };
      }
    }
    const h = D.houses.find((q) => q.id === best.id);
    if (!h) continue;
    let d = Infinity;
    for (const ring of groundOutlines(h)) for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      const s2 = Math.max(0, Math.min(F.len, (best.px - F.a[0]) * F.u[0] + (best.pz - F.a[1]) * F.u[1]));
      const [qx, qz] = onWall(F, s2);
      d = Math.min(d, Math.hypot(qx - best.px, qz - best.pz));
    }
    assert.ok(d < 1.5, `${name}'s sign ${d.toFixed(2)} m off ${h.id}'s walls`);
  }
});

test('the row builds in Node: few meshes, every vertex finite, the phone\'s materials all simple', async () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const mod = await import('../js/mattastrasse-2.js');
  for (const id of IDS) assert.ok(SURVEYED_FOOTPRINTS.get(id)?.length >= 1, `${id} registered`);
  for (const id of LEFT) assert.ok(!SURVEYED_FOOTPRINTS.has(id) || SURVEYED_FOOTPRINTS.get(id).length, `${id} not dropped`);
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.ok(SHOP_EXCLUSIONS.has('n13922984763'), 'the Golf Club\'s generic sign dropped');
  const check = (simple) => {
    const scene = new THREE.Scene();
    const { group, colliders } = mod.buildMattastrasse2(scene);
    assert.ok(Array.isArray(colliders));
    for (const c of colliders) assert.ok([c.minX, c.maxX, c.minZ, c.maxZ, c.maxY, c.baseY].every(Number.isFinite));
    assert.equal(group.userData.terrain, 'absolute');
    let meshes = 0, tris = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const p = o.geometry.attributes.position;
      tris += p.count / 3;
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${o.name}: a vertex not finite`);
      for (const name of ['normal', 'uv', 'color', 'aHalf']) {
        const a = o.geometry.attributes[name];
        if (!a) continue;
        assert.equal(a.count, p.count, `${o.name} ${name}`);
        for (let i = 0; i < a.array.length; i++) assert.ok(Number.isFinite(a.array[i]), `${o.name} ${name}`);
      }
      if (simple) {
        const m = o.material;
        const decal = m.opacityNode && m.transparent && !m.emissiveNode && !m.roughnessNode;
        assert.ok(m.userData.simpleSkin || decal || (!m.colorNode && !m.emissiveNode && !m.roughnessNode), `${o.name}: a full shader on the phone`);
      }
    });
    assert.ok(meshes >= 5 && meshes <= 8, `${meshes} meshes`);
    assert.ok(tris < 15000, `${tris} triangles`);
    return tris;
  };
  check(false);
  QUALITY.simpleMaterials = true;
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  try { check(true); } finally { QUALITY.simpleMaterials = false; }
});

// The player's walls as js/buildings.js raises them on registered outlines (a box 0.44 m thick on every edge) and on the
// OpenStreetMap outlines of the buildings round the row nobody registered; a walker (radius 0.48) pushed out of them one
// after the other as js/controllers.js resolveHorizontalCollision does
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
// (each outer wall of 2 m or more: its outward side the one not inside the house)
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

test('the player\'s walls: pushed out behind every outer wall, a free metre before it (no rings reaching into each other)', () => {
  const mine = new Set(IDS);
  const all = D.houses.flatMap((h) => groundOutlines(h));
  const near = (b) => all.some((r) => r.some(([x, z]) => Math.hypot(x - b.ring[0], z - b.ring[1]) < 60));
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id) && near(b)).map((b) => osmRing(b.id));
  const every = wallBoxes([...all, ...others]);
  let walls = 0;
  for (const h of D.houses) {
    const own = wallBoxes(groundOutlines(h));
    probeWalls(groundOutlines(h), (mx, mz, nx, nz) => {
      walls++;
      assert.ok(pushed(every, mx - nx * 0.6, mz - nz * 0.6), `${h.id}: free 0.6 m behind its wall at ${mx.toFixed(1)}, ${mz.toFixed(1)}`);
      assert.ok(!pushed(own, mx + nx, mz + nz), `${h.id}: its own walls 1 m before its wall at ${mx.toFixed(1)}, ${mz.toFixed(1)}`);
    });
  }
  assert.ok(walls > 100, `${walls} walls`);
  for (const h of D.houses) for (const o of D.houses) {
    if (o === h) continue;
    for (const r of groundOutlines(h)) for (const [x, z] of r) for (const t of groundOutlines(o)) {
      if (!pointInRing(t, x, z)) continue;
      const R = outwardRing(t);
      let d = Infinity;
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        const s = Math.max(0, Math.min(F.len, (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1]));
        const [px, pz] = onWall(F, s);
        d = Math.min(d, Math.hypot(px - x, pz - z));
      }
      assert.ok(d < 0.4, `${h.id}'s corner ${x}, ${z} ${d.toFixed(2)} m inside ${o.id}`);
    }
  }
});
