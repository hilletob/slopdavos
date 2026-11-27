import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  COVERED_NEIGHBOURS, DISCHMA_ROW_B as D, groundOutlines, houseById, insideRow, onWall, outerWalls, outwardRing, pointInRing, profileAt, ringArea2, roofHeights,
  upperWalls, wallFrame, wallProfile
} from '../js/dischma-row-b-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const IDS = ['w1392139529', 'w126895399', 'w126895390', 'w126895445', 'w784516261', 'w1527839862', 'w126895359', 'w126895321', 'w126895479',
  'w126895483', 'w126895337', 'w126895333', 'w126895327', 'w126895403', 'w126895454', 'w126895473', 'w126895422', 'w1528041322', 'w126895316',
  'w126895472', 'w126895394', 'w126895465', 'w126895395', 'w126895484'];
const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};

test('every house of the row, each an OpenStreetMap building, its surveyed batches left out', () => {
  assert.deepEqual(D.houses.map((h) => h.id).sort(), [...IDS].sort());
  for (const h of D.houses) {
    assert.ok(osmRing(h.id), `${h.id} in OpenStreetMap`);
    assert.ok(h.exclude.length >= 1 && h.exclude.every((e) => e.r === 3 && Number.isFinite(e.x) && Number.isFinite(e.z)));
    // (each exclude near the house's outlines)
    for (const e of h.exclude) assert.ok(h.parts.some((p) => p.ring.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 30)), h.id);
  }
  // (no two houses leave out the same batch)
  const all = D.houses.flatMap((h) => h.exclude.map((e) => `${e.x},${e.z}`));
  assert.equal(new Set(all).size, all.length);
});

test('the outlines: of some size, the walls facing out, near their OpenStreetMap footprints', () => {
  for (const h of D.houses) {
    for (const ring of groundOutlines(h)) {
      assert.ok(ring.length >= 3);
      assert.ok(Math.abs(ringArea2(ring)) / 2 > 15, `${h.id}: an outline of some size`);
      for (const [x, z] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(z));
      const R = outwardRing(ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len < 1) continue;
        assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.15)), `${h.id}: a step out of a wall leaves the outline`);
        assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.15)));
      }
    }
    // (the house's middle inside its OSM footprint or within a few metres of it)
    const own = osmRing(h.id), ring = h.parts[0].ring;
    const cx = ring.reduce((s, q) => s + q[0], 0) / ring.length, cz = ring.reduce((s, q) => s + q[1], 0) / ring.length;
    const d = pointInRing(own, cx, cz) ? 0 : Math.min(...own.map(([x, z]) => Math.hypot(x - cx, z - cz)));
    assert.ok(d < 8, `${h.id} near its footprint (${d.toFixed(1)} m)`);
  }
});

test('the roofs: surveyed triangles over the outlines, the walls\' tops under them', () => {
  for (const h of D.houses) {
    for (const p of h.parts) {
      assert.ok(p.roof.length >= 1, h.id);
      for (const t of p.roof) assert.ok(t.length === 9 && t.every(Number.isFinite), h.id);
      // (the house's roofs cover its outline: a part may stand partly under another's)
      const roofs = h.parts.flatMap((q) => q.roof);
      let n = 0, hit = 0;
      const xs = p.ring.map((q) => q[0]), zs = p.ring.map((q) => q[1]);
      for (let x = Math.min(...xs); x < Math.max(...xs); x += 0.7) for (let z = Math.min(...zs); z < Math.max(...zs); z += 0.7) {
        if (!pointInRing(p.ring, x, z)) continue;
        n++;
        if (roofHeights(roofs, x, z).length) hit++;
      }
      assert.ok(n > 10 && hit / n > 0.85, `${h.id}: its roof over ${(100 * hit / n).toFixed(0)} % of its outline`);
    }
    for (const w of outerWalls(h)) {
      const prof = wallProfile(w.part.roof, w.F);
      assert.ok(prof.length >= 2 && Math.abs(prof[0][0]) < 1e-9 && Math.abs(prof[prof.length - 1][0] - w.F.len) < 1e-9);
      for (const [s, y] of prof) assert.ok(Number.isFinite(s) && Number.isFinite(y) && y > h.base + 2, `${h.id}: a wall's top over its foot`);
      // (the top under the roof's underside at the wall)
      const ys = roofHeights(w.part.roof, ...onWall(w.F, w.F.len / 2, -0.05));
      if (ys.length) assert.ok(profileAt(prof, w.F.len / 2) <= Math.max(...ys) + 0.05);
    }
    for (const u of upperWalls(h)) assert.ok(Number.isFinite(u.bottom) && u.F.len > 0.5);
    // (the walls reach under the lowest ground round the house)
    assert.ok(h.parts.every((p) => p.roof.every((t) => t[1] > h.base && t[4] > h.base && t[7] > h.base)));
  }
});

test('the looks: every house of a known kind, its colours in the palettes; only two seen in a photograph', () => {
  for (const h of D.houses) {
    const L = h.look;
    assert.ok(['chalet', 'house', 'block', 'hall'].includes(L.kind), h.id);
    assert.ok(D.plaster[L.plaster]);
    if (L.kind === 'chalet' || L.kind === 'house') assert.ok(D.wood[L.wood], h.id);
    if (L.shutters !== undefined && L.shutters !== null) assert.ok(D.shutters[L.shutters]);
    if (L.kind === 'chalet') assert.ok(L.floors >= 1 && L.floors <= 2);
  }
  // (not cloned: several kinds, timbers and shutters)
  assert.ok(new Set(D.houses.map((h) => `${h.look.kind}/${h.look.wood}/${h.look.shutters}/${h.look.plaster}`)).size >= 14);
  assert.equal(houseById('w126895399').look.garages.n, 2);
  assert.equal(houseById('w1392139529').look.kind, 'hall');
  for (const c of [...D.plaster, ...D.wood, ...D.shutters]) assert.ok(c.every((v) => v >= 0 && v <= 0.7));
  assert.ok(D.win.lo > 0.5 && D.win.hi < D.storey - 0.4);
});

test('the neighbours: the row stays clear of the first row and the other buildings round it', () => {
  const mine = new Set(IDS);
  const rows = D.houses.flatMap((h) => h.parts.map((p) => p.ring));
  const xs = rows.flat().map((q) => q[0]), zs = rows.flat().map((q) => q[1]);
  const box = [Math.min(...xs) - 20, Math.max(...xs) + 20, Math.min(...zs) - 20, Math.max(...zs) + 20];
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id) && b.ring[0] > box[0] && b.ring[0] < box[1] && b.ring[1] > box[2] && b.ring[1] < box[3]).map((b) => osmRing(b.id));
  assert.ok(others.length > 10);
  for (const t of others) {
    // (a neighbour's corners outside our outlines, by more than the survey's half metre)
    for (const [x, z] of t) for (const r of rows) {
      if (!pointInRing(r, x, z)) continue;
      const R = outwardRing(r);
      let d = Infinity;
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        const s = Math.max(0, Math.min(F.len, (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1]));
        const [px, pz] = onWall(F, s);
        d = Math.min(d, Math.hypot(px - x, pz - z));
      }
      assert.ok(d < 1.6, `a neighbour's corner ${x}, ${z} ${d.toFixed(1)} m inside the row`);
    }
  }
  // (the first row's houses are not ours)
  for (const id of ['w219436322', 'w1527724574', 'w117012218', 'w126895355', 'w126895491', 'w126895443', 'w126895487']) assert.ok(!mine.has(id));
});

test('the missions\' places near the row stay outside it, a step from its walls', async () => {
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
  // (the post box by w126895359 and the post round's start by w126895333 among them)
  assert.ok(points.some(([x, z]) => Math.hypot(x - 925, z + 763) < 1));
  for (const [x, z] of points) {
    assert.ok(!insideRow(x, z), `a mission's place ${x}, ${z} inside the row`);
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) if (Math.abs(dx) + Math.abs(dz) === 1) {
      // (a metre round it is free too, where it was free of the generic blocks)
      if (Math.hypot(x - 925, z + 763) < 1) assert.ok(!insideRow(x + dx, z + dz));
    }
  }
});

test('the row builds in Node: few meshes, every vertex finite, the phone\'s materials all simple', async () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const mod = await import('../js/dischma-row-b.js');
  for (const id of IDS) assert.ok(SURVEYED_FOOTPRINTS.get(id)?.length >= 1, `${id} registered`);
  for (const id of COVERED_NEIGHBOURS) assert.deepEqual(SURVEYED_FOOTPRINTS.get(id), [], `${id}'s generic walls dropped`);
  const check = (simple) => {
    const scene = new THREE.Scene();
    const { group, colliders } = mod.buildDischmaRowB(scene);
    assert.ok(Array.isArray(colliders));
    for (const c of colliders) assert.ok([c.minX, c.maxX, c.minZ, c.maxZ, c.minY, c.maxY, c.baseY].every(Number.isFinite));
    assert.equal(group.userData.terrain, 'absolute');
    let meshes = 0, tris = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const p = o.geometry.attributes.position;
      tris += p.count / 3;
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${o.name}: a vertex not finite`);
      for (const name of ['normal', 'uv', 'color', 'aHalf', 'aShut']) {
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
    assert.ok(tris < 60000, `${tris} triangles`);
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

test('the player\'s walls: pushed out behind every outer wall, a free metre before it (no overlapping rings, no walls inside)', () => {
  const mine = new Set([...IDS, ...COVERED_NEIGHBOURS]);
  const all = D.houses.flatMap((h) => groundOutlines(h));
  const xs = all.flat().map((q) => q[0]), zs = all.flat().map((q) => q[1]);
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id) && b.ring[0] > Math.min(...xs) - 30 && b.ring[0] < Math.max(...xs) + 30 &&
    b.ring[1] > Math.min(...zs) - 30 && b.ring[1] < Math.max(...zs) + 30).map((b) => osmRing(b.id));
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
  assert.ok(walls > 100);
  // (the houses' outlines do not reach into each other)
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
      assert.ok(d < 0.3, `${h.id}'s corner ${x}, ${z} ${d.toFixed(2)} m inside ${o.id}`);
    }
  }
  // (the neighbours whose walls are dropped lie mostly inside the row)
  for (const id of COVERED_NEIGHBOURS) {
    const R = osmRing(id);
    let n = 0, inn = 0;
    const rx = R.map((q) => q[0]), rz = R.map((q) => q[1]);
    for (let x = Math.min(...rx); x < Math.max(...rx); x += 0.4) for (let z = Math.min(...rz); z < Math.max(...rz); z += 0.4) {
      if (!pointInRing(R, x, z)) continue;
      n++;
      if (insideRow(x, z)) inn++;
    }
    assert.ok(n > 20 && inn / n > 0.6, `${id} ${(100 * inn / n).toFixed(0)} % inside the row`);
  }
});
