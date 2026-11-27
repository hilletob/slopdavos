import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  HOUSES, STOREY, WIN, dedupe, groundOutlines, hips, insideRow, onWall, outwardRing, partTop, pointInRing, ringArea2, roofRing, roofY, wallFrame, wallOut
} from '../js/obere-strasse-1-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { CLUB_HOTEL } from '../js/club-hotel-data.js';
import { CLUB_HOTEL_TOWER } from '../js/club-hotel-tower-data.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};
const IDS = ['w123384794', 'w122816778', 'w97292456', 'w123384807', 'w97292398', 'w97292378', 'w97292308', 'w97292323', 'w97292472',
  'w117012149', 'w123385325', 'w1529977470', 'w127671912', 'w123385338', 'w1529974852', 'w965238323', 'w127671945', 'w1529974854'];
// (the houses of the stretch without a batch of their own: left to js/buildings.js)
const LEFT = ['w97292364', 'w97292348', 'w97292337', 'w123385309', 'w127671917'];

test('the row: its eighteen houses, each excluding its surveyed batches, none excluded twice', () => {
  assert.deepEqual(HOUSES.map((h) => h.id).sort(), [...IDS].sort());
  for (const id of LEFT) assert.ok(!IDS.includes(id));
  const all = HOUSES.flatMap((h) => h.exclude);
  assert.equal(all.length, 21);
  for (const e of all) assert.ok(e.r === 3 && Number.isFinite(e.x) && Number.isFinite(e.z));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > 3, 'two exclusions apart');
  }
  // each house's batches within its outlines' reach, its footprint in OpenStreetMap at its outlines
  for (const h of HOUSES) {
    const own = osmRing(h.id);
    assert.ok(own, `${h.id} in OpenStreetMap`);
    const outl = groundOutlines(h);
    for (const e of h.exclude) assert.ok(outl.some((r) => pointInRing(r, e.x, e.z) || r.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 12)), `${h.id}: a batch far off`);
    const [cx, cz] = own.reduce(([a, b], [x, z]) => [a + x / own.length, b + z / own.length], [0, 0]);
    assert.ok(outl.some((r) => pointInRing(r, cx, cz)) || outl.some((r) => r.some(([x, z]) => Math.hypot(x - cx, z - cz) < 8)), `${h.id}: its outline away from OSM's`);
  }
});

test('the outlines: of some size, simple, the walls facing out', () => {
  assert.equal(dedupe([[0, 0], [0.1, 0], [5, 0], [5, 5], [0, 5], [0.05, 0.1]]).length, 4);
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    assert.ok(ring.length >= 3 && Math.abs(ringArea2(ring)) / 2 > 7, `${h.id}: an outline of some size`);
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
  // the balconies' walls face out of their house (over the low parts before them), and lie on its outline
  for (const h of HOUSES) for (const Bl of h.balconies || []) {
    const y = Math.min(...Bl.floors), F = wallOut(h, Bl.on[0], Bl.on[1], y);
    const over = h.parts.filter((p) => p.top === undefined || p.top > y);
    assert.ok(!over.some((p) => pointInRing(p.ring, ...onWall(F, (Bl.s0 + Bl.s1) / 2, 0.5))), `${h.id}: a balcony facing in`);
    assert.ok(Bl.s0 >= 0 && Bl.s1 <= F.len + 1e-6 && Bl.s1 - Bl.s0 > 2, `${h.id}: a balcony off its wall`);
    assert.ok(groundOutlines(h).some((r) => r.some(([x, z]) => Math.hypot(x - Bl.on[0][0], z - Bl.on[0][1]) < 0.05)), `${h.id}: a balcony's wall not on the outline`);
  }
});

test('the roofs: over their walls with an overhang, the ridge over the eaves, the walls\' tops under them', () => {
  for (const h of HOUSES) for (const R of h.roofs || []) {
    assert.ok(R.y > R.eaves + 1 && R.cL > 1 && R.cR > 1);
    const [h0, h1] = hips(R);
    assert.ok(h0 >= 0 && h1 >= 0);
    const ring = roofRing(R), k = h.roofs.indexOf(R);
    for (const p of h.parts.filter((q) => q.roofs && q.roofs[0] === k)) {
      for (const [x, z] of p.ring) {
        assert.ok(pointInRing(ring, x, z), `${h.id}: a wall's corner outside its roof`);
        const y = roofY(R, x, z);
        assert.ok(y !== null && y > R.eaves && y < R.y);
      }
    }
    assert.ok(ring.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)) && pointInRing(ring, ...[0, 1].map((i) => (R.a[i] + R.b[i]) / 2)));
  }
  // the cream villa: its eaves at 9.0 where the survey's stair tower meets the house, its gable on the north-west
  const villa = HOUSES.find((h) => h.id === 'w122816778');
  assert.ok(Math.abs(roofY(villa.roofs[0], -938.5, 653.9) - 9.0) < 0.2 && Math.abs(roofY(villa.roofs[0], -936.0, 657.2) - 9.0) < 0.2);
  assert.ok(Math.abs(villa.roofs[1].y - 13.0) < 1e-9);
  // the walls' tops: flat parts at their roofs, pitched ones under them and over their top floors' windows
  for (const h of HOUSES) for (const p of h.parts) {
    if (p.top !== undefined) { assert.ok(p.top > h.floor + STOREY, `${h.id}: a part of one storey at least`); continue; }
    for (const [x, z] of p.ring) {
      const t = partTop(h, p, x, z);
      assert.ok(Number.isFinite(t) && t > h.floor + 2 * STOREY && t < 40, `${h.id}: a wall's top of ${t}`);
    }
  }
  // the turret's cone on its round walls
  const white = HOUSES.find((h) => h.id === 'w123384794'), [cn] = white.cones, turret = white.parts[3];
  assert.ok(turret.ring.every(([x, z]) => Math.hypot(x - cn.c[0], z - cn.c[1]) < cn.r) && cn.y0 < turret.top && cn.y1 > turret.top + 1);
});

test('the floors add up: the houses on the surveyed ground, the balconies on storeys\' feet', () => {
  assert.ok(WIN.lo > 0.5 && WIN.hi < STOREY - 0.4);
  for (const h of HOUSES) {
    assert.ok(h.base < h.floor + 0.01 && Number.isFinite(h.floor), `${h.id}: the walls reach under the floor`);
    for (const Bl of h.balconies || []) for (const y of Bl.floors) {
      const k = (y - h.floor) / STOREY;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6 && k > 1 - 1e-6, `${h.id}: a balcony at ${y} off the storeys`);
      // (under its part's roof)
      const top = Math.max(...h.parts.filter((p) => p.top !== undefined).map((p) => p.top));
      assert.ok(y + 1.0 < top, `${h.id}: a balcony over the roof`);
    }
  }
});

test('the neighbours: nothing of the row inside a house it does not rebuild, nor inside the hand-built ones nearby', () => {
  const mine = new Set(IDS);
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id)).map((b) => osmRing(b.id))
    .filter((r) => r.some(([x, z]) => x > -1000 && x < -740 && z > 20 && z < 700));
  assert.ok(others.length > 20);
  for (const h of HOUSES) for (const ring of groundOutlines(h)) {
    // (a step 1.5 m into the outline: OpenStreetMap's neighbours stand up to a metre or two off the survey's walls)
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1.5) continue;
      const [x, z] = onWall(F, F.len / 2, -1.5);
      for (const o of others) assert.ok(!pointInRing(o, x, z), `${h.id} at ${x.toFixed(1)}, ${z.toFixed(1)} inside a neighbour`);
    }
  }
  // the Club Hotel, its tower and annex, the Pauluskirche, the houses left to js/buildings.js: none of their corners in
  // the row, none of the row's corners in them
  const hand = [CLUB_HOTEL.ring, CLUB_HOTEL_TOWER.ring, CLUB_HOTEL_TOWER.annex.ring, osmRing('w97292342'), ...LEFT.map(osmRing)];
  for (const r of hand) {
    assert.ok(r && r.length >= 3);
    for (const [x, z] of r) assert.ok(!insideRow(x, z), `${x}, ${z} of a neighbour inside the row`);
    for (const h of HOUSES) for (const ring of groundOutlines(h)) for (const [x, z] of ring) assert.ok(!pointInRing(r, x, z), `${h.id}: a corner inside a neighbour`);
  }
});

test('the missions\' doors and starts near the row stay outside it, and the street stays clear', async () => {
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
  for (const [x, z] of points.filter(([x, z]) => x > -1000 && x < -740 && z > 20 && z < 700)) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
  // the Obere Strasse's line (OpenStreetMap) outside every house
  const roads = DAVOS_DATA.roads.filter((r) => r.name === 'Obere Strasse');
  let n = 0;
  for (const r of roads) {
    const p = r.points || r.pts || r.ring || r.line;
    if (!Array.isArray(p)) continue;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const [x0, z0, x1, z1] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
      for (let k = 0; k <= 10; k++) {
        const x = x0 + ((x1 - x0) * k) / 10, z = z0 + ((z1 - z0) * k) / 10;
        if (x < -1000 || x > -740 || z < 20 || z > 700) continue;
        n++;
        assert.ok(!insideRow(x, z), `the street at ${x.toFixed(1)}, ${z.toFixed(1)} inside the row`);
      }
    }
  }
  assert.ok(n > 50, 'the street sampled');
});

test('the row in Node: every vertex finite, four meshes, the phone\'s materials plain, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildObereStrasse1, VIEWS } = await import('../js/obere-strasse-1.js');
  for (const h of HOUSES) assert.equal(SURVEYED_FOOTPRINTS.get(h.id).length, groundOutlines(h).length);
  for (const v of Object.values(VIEWS)) {
    assert.ok(v.length === 6 && v.every(Number.isFinite));
    assert.ok(!insideRow(v[0], v[2]), 'a camera spot inside a house');
  }
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildObereStrasse1(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Obere Strasse 1 ', '')).sort();
    assert.deepEqual(names, ['glass', 'roof', 'trim', 'walls']);
    let tris = 0;
    for (const m of group.children) {
      const M = m.material;
      assert.ok(M, `${m.name}: a material`);
      if (simple) {
        const decal = M.opacityNode && M.transparent && !M.emissiveNode && !M.roughnessNode;
        const procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
        assert.ok(M.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
        if (m.name.endsWith('walls')) assert.ok(M.vertexColors, 'the walls\' colours from the vertices');
      }
      const g = m.geometry, p = g.attributes.position;
      assert.ok(p.count > 0);
      tris += p.count / 3;
      for (const name of Object.keys(g.attributes)) {
        const a = g.attributes[name].array;
        for (let i = 0; i < a.length; i++) assert.ok(Number.isFinite(a[i]), `${m.name}: a ${name} not finite`);
        if (name === 'color' || name === 'aHalf') assert.equal(g.attributes[name].count, p.count);
      }
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -8 && p.array[i] < 37, `${m.name}: a height of ${p.array[i]}`);
    }
    assert.ok(tris < 15000, `${tris} triangles`);
  }
});
