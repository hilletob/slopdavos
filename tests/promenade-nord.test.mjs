import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, SHOP_IDS, STOREY, WIN, canopyPosts, featureY, groundOutlines, hips, insideRow, onWall, outwardRing, partTop, pointInRing, ringArea2,
  roofRing, roofY, wallFrame, wallOut
} from '../js/promenade-nord-data.js';
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
const IDS = ['w118240371', 'w116881237', 'w118240624', 'w126895319', 'w118240628'];
const near = ([x, z]) => x > 470 && x < 600 && z > -1110 && z < -840;
// (the distance from a point to a ring's edges)
const edgeDist = (r, x, z) => Math.min(...r.map((a, i) => {
  const b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}));

test('the row: its five houses, their seven batches excluded once each, every house at its OSM footprint', () => {
  assert.deepEqual(HOUSES.map((h) => h.id), IDS);
  const all = HOUSES.flatMap((h) => h.exclude);
  assert.deepEqual(all.map((e) => [e.x, e.z, e.r]), [
    [525.1, -888.4, 3], [526.2, -884.9, 3], [534.6, -928.4, 3], [507.9, -986.4, 3], [518.5, -983.3, 3], [550.8, -1005.3, 3], [535.8, -1069.5, 3]
  ]);
  // (each batch's centre inside its own house)
  for (const h of HOUSES) for (const e of h.exclude) assert.ok(groundOutlines(h).some((r) => pointInRing(r, e.x, e.z)), `${h.id}: a batch's centre outside it`);
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
    assert.ok(inside / n > 0.8, `${h.id}: ${Math.round((100 * inside) / n)} % of OSM's footprint covered`);
  }
});

test('the outlines: of some size, simple, the walls facing out, the parts not overlapping', () => {
  const parts = [];
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    parts.push(ring);
    assert.ok(ring.length >= 3 && Math.abs(ringArea2(ring)) / 2 > 15, `${h.id}: an outline of some size`);
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
  for (let x = 500.037; x < 562; x += 0.7) for (let z = -1080.023; z < -866; z += 0.7) {
    const deep = parts.filter((r) => pointInRing(r, x, z) && edgeDist(r, x, z) > 0.2);
    assert.ok(deep.length <= 1, `two parts at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
  // the features' walls face out of their house at their height, as written (left to right seen from outside)
  for (const h of HOUSES) for (const f of [...(h.shops || []), ...(h.letters || []), ...(h.bays || []), ...(h.doors || [])]) {
    const F = wallOut(h, f.on[0], f.on[1], featureY(f));
    assert.ok(F.a === f.on[0], `${h.id}: a feature's wall written the wrong way round`);
    const [x, z] = onWall(F, F.len / 2, 0.5);
    assert.ok(!insideRow(x, z), `${h.id}: a feature facing in`);
    const s0 = f.s0 ?? f.s - f.w / 2, s1 = f.s1 ?? f.s + f.w / 2;
    assert.ok(s0 >= 0 && s1 <= F.len + 1e-6 && s1 > s0, `${h.id}: a feature off its wall`);
  }
});

test('the roofs: hipped over their walls with an overhang, near the surveyed heights; the flat roofs at theirs', () => {
  const surveyed = { w116881237: [14.22], w126895319: [17.81, 14.98] };
  for (const h of HOUSES) (h.roofs || []).forEach((R, ri) => {
    assert.ok(R.y > R.eaves + 0.8 && R.cL > 1 && R.cR > 1);
    const [h0, h1] = hips(R);
    assert.ok(h0 > 0 && h1 > 0);
    const ring = roofRing(R);
    for (const p of h.parts.filter((q) => q.roofs && q.roofs.includes(ri))) {
      for (const [x, z] of p.ring) {
        assert.ok(pointInRing(ring, x, z), `${h.id}: a wall's corner outside its roof`);
        const y = roofY(R, x, z);
        assert.ok(y !== null && y > R.eaves && y < R.y);
        const t = partTop(h, p, x, z);
        assert.ok(Math.abs(t - surveyed[h.id][ri]) < 0.8, `${h.id}: a wall's top of ${t.toFixed(2)}`);
      }
    }
    // the ridge within 1.5 m over the survey's flat roof
    assert.ok(R.y - surveyed[h.id][ri] < 1.5, `${h.id}: a ridge at ${R.y.toFixed(2)}`);
  });
  const flats = HOUSES.flatMap((h) => h.parts.filter((p) => p.top !== undefined).map((p) => p.top));
  assert.deepEqual(flats, [17.02, 21.75, 7.69, 19.68, 20.15, 11.38, 12.19]);
});

test('the floors add up: windows under the roofs, the shops\' glass over the ground, the bays on storeys\' feet', () => {
  assert.ok(WIN.lo > 0.5 && WIN.hi < STOREY - 0.4);
  for (const h of HOUSES) {
    assert.ok(h.base < h.floor - 0.5 && Number.isFinite(h.floor), `${h.id}: the walls reach under the floor`);
    for (const p of h.parts) {
      const R = outwardRing(p.ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        for (let s = 0; s <= F.len; s += 0.5) assert.ok(groundHeight(...onWall(F, s, 0.3)) > h.base + 0.2, `${h.id}: the ground under its walls' foot`);
      }
    }
    // the street's ground floor: its storeys' grid starts within half a metre of the street
    for (const Sp of h.shops || []) {
      const F = wallOut(h, Sp.on[0], Sp.on[1], featureY(Sp));
      let g = -Infinity;
      for (let k = 0; k <= 40; k++) g = Math.max(g, groundHeight(...onWall(F, Sp.s0 + ((Sp.s1 - Sp.s0) * k) / 40, 0.5)));
      assert.ok(Sp.top - (Sp.fascia ?? 0.6) - (g + 0.35) >= 1.2, `${h.id}: a shop's glass cut by the ground`);
      // (the first storey over the shop: its windows clear of the fascia)
      const k = Math.ceil((Sp.top + 0.1 - WIN.lo - h.floor) / STOREY - 1e-9);
      assert.ok(h.floor + k * STOREY + WIN.lo > Sp.top && h.floor + k * STOREY - Sp.top < 0.5, `${h.id}: a shop's top off the storeys`);
    }
    for (const Bw of h.bays || []) for (const y of Bw.floors) {
      const k = (y - h.floor) / STOREY;
      assert.ok(Math.abs(k - Math.round(k)) < 0.05 && k >= 1, `${h.id}: a bay at ${y} off the storeys`);
    }
    for (const L of h.letters || []) {
      const F = wallOut(h, L.on[0], L.on[1], featureY(L));
      for (const s of [L.s0, L.s1]) assert.ok(groundHeight(...onWall(F, s, 0.5)) < L.y0 - 0.3, `${h.id}: ${L.key} in the ground`);
    }
  }
  // the floors the photographs show over the street: three over the Excellent's restaurant (and the core's), two over
  // the Kuoni's shops, four over the Pflanzenbrocki's, two over the Freitag's
  const over = (h, top) => { let n = 0; for (let y = h.floor; y + WIN.hi + 0.2 <= top; y += STOREY) if (y >= h.shops[0].top - 0.3) n++; return n; };
  assert.equal(over(HOUSES[0], 17.02), 3);
  assert.equal(over(HOUSES[0], 21.75), 5);
  assert.equal(over(HOUSES[1], partTop(HOUSES[1], HOUSES[1].parts[0], 523.9, -915.7)), 2);
  assert.equal(over(HOUSES[2], 19.68), 4);
  assert.equal(over(HOUSES[4], 12.19), 2);
});

test('the neighbours: nothing of the row inside a house it does not rebuild, the hand-built ones nearby clear', () => {
  const mine = new Set(IDS);
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id)).map((b) => ({ id: b.id, ring: osmRing(b.id) }))
    .filter((o) => o.ring.some(near));
  assert.ok(others.length > 10);
  for (const h of HOUSES) {
    const rings = [...groundOutlines(h), ...(h.roofs || []).map(roofRing)];
    for (const ring of rings) {
      for (const [x, z] of ring) for (const o of others) assert.ok(!pointInRing(o.ring, x, z), `${h.id} at ${x}, ${z} inside ${o.id}`);
      for (const o of others) for (const [x, z] of o.ring) assert.ok(!pointInRing(ring, x, z), `${o.id} at ${x}, ${z} inside ${h.id}`);
    }
  }
  // the hand-built houses round it: the Bristol, the house with the mansard, the Seehof, the Meierhof, the Montana and
  // the Grischa (their OSM footprints) at least 4 m from every outline of the row
  for (const id of ['w118240447', 'w118240343', 'w117012182', 'w118240455', 'w117012156', 'w99094508']) {
    const o = osmRing(id);
    assert.ok(o, id);
    for (const h of HOUSES) for (const ring of groundOutlines(h)) {
      for (const [x, z] of o) assert.ok(edgeDist(ring, x, z) > 4 || !pointInRing(ring, x, z), `${id} near ${h.id}`);
      for (const [x, z] of ring) assert.ok(edgeDist(o, x, z) > 4, `${h.id} within 4 m of ${id}`);
    }
  }
});

test('the shops\' signs: lettered here on their own houses\' walls, left out of js/shops.js', () => {
  assert.equal(SHOP_IDS.length, 9);
  for (const id of SHOP_IDS) {
    const s = SHOPS_DATA.find((q) => q.osm === id);
    assert.ok(s, `${id} in js/shops-data.js`);
    const h = HOUSES.find((q) => (q.shopIds || []).includes(id));
    const d = Math.min(...groundOutlines(h).map((r) => (pointInRing(r, s.x, s.z) ? 0 : edgeDist(r, s.x, s.z))));
    assert.ok(d < 3, `${s.name} ${d.toFixed(1)} m off its house`);
  }
  // the shops of the neighbours stay js/shops.js': Go Vertical, Rainbow, finnis.ch, Free-Style, EP:Bernhard, the Concordia
  for (const name of ['Go Vertical Davos', 'Rainbow Kinder-Secondhand', 'finnis.ch', 'Free-Style', 'EP:Bernhard', 'Hotel Concordia']) {
    const s = SHOPS_DATA.find((q) => q.name === name);
    assert.ok(s && !SHOP_IDS.includes(s.osm), name);
  }
});

test('the missions\' places near the row stay outside it; the Dorfkeller\'s door and the Promenade clear', async () => {
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
  // the Craft Beer round's Dorfkeller: its door and the van's stop outside, a metre clear of every wall
  const { BEER_STOPS } = await import('../js/missions-data-local.js');
  const stop = BEER_STOPS.find((b) => b.id === 'dorfkeller');
  const dk = [stop.door, stop.road];
  for (const { x, z } of dk) {
    assert.ok(!insideRow(x, z));
    for (const h of HOUSES) for (const r of groundOutlines(h)) assert.ok(edgeDist(r, x, z) > 1.0, `the Dorfkeller's door ${edgeDist(r, x, z).toFixed(2)} m from ${h.id}`);
  }
  // the WEF march's liaison stand on the Promenade by the Excellent
  assert.ok(!insideRow(508.5, -874.4));
  // the street itself stays clear, and the canopy's posts stand on the pavement, not on it
  const street = DAVOS_DATA.roads.filter((r) => r.name === 'Promenade');
  let probed = 0;
  for (const r of street) for (let i = 0; i < r.pts.length; i += 2) {
    if (!near([r.pts[i], r.pts[i + 1]])) continue;
    probed++;
    assert.ok(!insideRow(r.pts[i], r.pts[i + 1]), `the Promenade at ${r.pts[i]}, ${r.pts[i + 1]} inside the row`);
  }
  assert.ok(probed > 3);
  const line = street.flatMap((r) => { const q = []; for (let i = 0; i + 3 < r.pts.length; i += 2) q.push([[r.pts[i], r.pts[i + 1]], [r.pts[i + 2], r.pts[i + 3]]]); return q; });
  const toStreet = (x, z) => Math.min(...line.map(([a, b]) => edgeDist([a, b], x, z)));
  for (const h of HOUSES) for (const Sp of h.shops || []) for (const [x, z] of canopyPosts(h, Sp)) {
    assert.ok(!insideRow(x, z) && toStreet(x, z) > 4, `a post at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
});

test('the row in Node: every vertex finite, five meshes, the posts\' colliders, the outlines registered, the phone\'s materials', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { buildPromenadeNord, ATLAS } = await import('../js/promenade-nord.js');
  for (const h of HOUSES) assert.equal(SURVEYED_FOOTPRINTS.get(h.id).length, h.parts.length);
  for (const id of SHOP_IDS) assert.ok(SHOP_EXCLUSIONS.has(id));
  // the atlas' cells apart and within it; every key used is a cell
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
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
    const { group, colliders } = buildPromenadeNord(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Promenade Nord ', '')).sort();
    assert.deepEqual(names, ['decal', 'glass', 'roof', 'trim', 'walls']);
    // the canopy's posts: thin boxes on the ground, outside the houses
    const posts = HOUSES.flatMap((h) => (h.shops || []).flatMap((s) => canopyPosts(h, s)));
    assert.equal(colliders.length, posts.length);
    assert.ok(posts.length >= 3);
    for (const c of colliders) {
      assert.ok(Number.isFinite(c.baseY) && c.maxY > c.baseY + 2 && c.obb && c.obb.hx < 0.2);
      assert.ok(!insideRow(c.obb.cx, c.obb.cz));
      assert.ok(Math.abs(c.baseY - (groundHeight(c.obb.cx, c.obb.cz) - 0.3)) < 0.01);
    }
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
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > 0.5 && p.array[i] < 23.5, `${m.name}: a height of ${p.array[i]}`);
      for (let i = 0; i < p.array.length; i += 3) assert.ok(near([p.array[i], p.array[i + 2]]), `${m.name}: a vertex out at ${p.array[i]}, ${p.array[i + 2]}`);
      // the walls: colours on every vertex, aHalf decoding to a house of the row
      if (m.name.endsWith('walls')) {
        const c = m.geometry.attributes.color, a = m.geometry.attributes.aHalf;
        assert.ok(c && c.count === p.count && a && a.count === p.count);
        for (let i = 0; i < a.count; i++) assert.ok(Math.floor(a.array[i] / 10000) < HOUSES.length);
      }
    }
    assert.ok(tris < 40000, `${tris} triangles`);
  }
});
