import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  TALSTRASSE_CHALET as D, groundOutlines, houseWall, insideHouse, namedWall, onWall, outwardRing, pointInRing, ringArea2, roofRing, roofY, toLocal,
  wallFrame, wingWall
} from '../js/talstrasse-chalet-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};

test('the chalet\'s outlines: of some size, the walls facing out, the wing against the house', () => {
  for (const ring of groundOutlines()) {
    assert.ok(Math.abs(ringArea2(ring)) / 2 > 40, 'an outline of some size');
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1) continue;
      assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.2)), 'a step out of a wall leaves the outline');
      assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.2)));
    }
  }
  // the house 10.7 × 9.8 m as surveyed, the wing about 50 m² as its flat roof
  assert.ok(Math.abs(Math.abs(ringArea2(D.house)) / 2 - 104) < 4);
  assert.ok(Math.abs(Math.abs(ringArea2(D.wing.ring)) / 2 - 50) < 6);
  // the survey's walls at the ground: its corners within 0.15 m of the outlines' corners
  for (const [x, z] of [[675.6, -1337.6], [684.0, -1331.0], [669.6, -1329.9], [678.0, -1323.3]]) assert.ok(D.house.some(([p, q]) => Math.hypot(p - x, q - z) < 0.15));
  for (const [x, z] of [[674.7, -1324.2], [686.6, -1324.7], [681.8, -1318.6], [682.0, -1328.4]]) assert.ok(D.wing.ring.some(([p, q]) => Math.hypot(p - x, q - z) < 0.15));
  // the wing's middle is not the house's
  const [cx, cz] = [683.5, -1322.5];
  assert.ok(pointInRing(D.wing.ring, cx, cz) && !pointInRing(D.house, cx, cz));
  // the walls by their names face where they say (z south)
  const south = houseWall('south'), north = houseWall('north'), east = houseWall('east'), west = houseWall('west');
  assert.ok(south.n[0] < 0 && south.n[1] > 0, 'the car park\'s gable faces south-west');
  assert.ok(north.n[0] > 0 && north.n[1] < 0, 'the other gable faces north-east');
  assert.ok(east.n[0] > 0 && east.n[1] > 0 && west.n[0] < 0 && west.n[1] < 0);
  for (const side of ['south', 'east', 'north']) assert.ok(wingWall(side) && wingWall(side).len > 4, side);
  // the wing's front 1.4 m before the gable
  assert.ok(Math.abs(toLocal(...wingWall('south').a)[0] + 1.37) < 0.05);
});

test('the roof: the surveyed eaves and ridge, over the walls with an overhang on every side', () => {
  const R = D.roof;
  assert.ok(Math.abs(roofY(R.west[0]) - 4.1) < 1e-9 && Math.abs(roofY(R.ridge[0]) - 7.2) < 1e-9 && Math.abs(roofY(R.east[0]) - 4.1) < 1e-9);
  const roof = roofRing();
  for (const [x, z] of D.house) {
    assert.ok(pointInRing(roof, x, z));
    const [t, c] = toLocal(x, z);
    assert.ok(t - R.t0 > 1.2 && R.t1 - t > 1.2 && c - R.west[0] > 1.2 && R.east[0] - c > 1.2, 'an overhang on every side');
  }
  // the survey's ridge ends lie on the ridge, its eaves' corners on the outline
  for (const [x, z] of [[672.6, -1325.6], [680.5, -1335.7]]) assert.ok(Math.abs(toLocal(x, z)[1] - R.ridge[0]) < 0.1);
  for (const [x, z] of [[678.2, -1321.2], [667.5, -1329.7], [675.4, -1339.7], [686.1, -1331.2]]) assert.ok(roof.some(([p, q]) => Math.hypot(p - x, q - z) < 0.15));
  // the eaves' walls reach over the top floor's windows; the wing's roof under them
  for (const c of [0, D.wid]) assert.ok(roofY(c) - 0.06 > D.floor + 3 * D.storey + D.win.hi + 0.2);
  assert.ok(D.wing.top < roofY(D.wid) - 2);
  // the chimney on the roof, over it
  assert.ok(D.chimney.top > roofY(D.chimney.c - D.chimney.half) + 0.6 && D.chimney.c > D.roof.ridge[0]);
});

test('the floors add up: four floors under the eaves, the logs over the plastered ground floor, the wing three floors under its roof', () => {
  assert.ok(Math.abs(D.timber - D.floor - D.storey) < 1e-9);
  assert.ok(Math.abs(D.attic - D.floor - 4 * D.storey) < 1e-9);
  assert.ok(D.attic < D.roof.ridge[1] - 1.5 && D.attic > roofY(0) - 0.1);
  assert.ok(D.win.lo > 0.5 && D.win.hi < D.storey - 0.4);
  assert.ok(D.base < -6.35 - 0.3, 'the walls reach under the lowest ground');
  assert.ok(D.wing.top > D.floor + 2 * D.storey + D.win.hi, 'the wing\'s top floor\'s windows under its roof');
  // the balconies' floors on storeys' feet; the top one's slab on the wing's roof where it passes over it
  for (const b of [...D.balconies, D.wing.balcony]) {
    const k = (b.y - D.floor) / D.storey;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-6 && k >= 1);
  }
  assert.ok(D.balconies.every((b) => b.y - 0.18 >= D.wing.top - 1e-6 || b.s1 < 7.5 - 0.1), 'nothing of a balcony inside the wing');
  assert.ok(D.balconies.every((b) => b.wall !== 'south' || b.depth < 1.37));
});

test('the balconies, doors and windows within their walls', () => {
  for (const b of D.balconies) {
    const F = houseWall(b.wall);
    assert.ok(b.s0 > 0.2 && b.s1 < F.len - 0.2 && b.depth < 1.6);
  }
  const Wb = D.wing.balcony, WF = wingWall('south');
  assert.ok(Wb.s0 > 0.2 && Wb.s1 < WF.len - 0.2);
  for (const d of D.doors) {
    const F = namedWall(d.wall);
    assert.ok(F, d.wall);
    assert.ok(d.s - d.w / 2 > 0.4 && d.s + d.w / 2 < F.len - 0.4);
    // clear of the windows' bays laid out from the wall's middle (D.bay apart, D.win.half each side, the frame)
    const mid = F.len / 2;
    for (let k = -4; k <= 4; k++) {
      const s = mid + k * D.bay;
      if (Math.abs(k * D.bay) + D.win.half + 0.4 > mid) continue;
      assert.ok(Math.abs(s - d.s) > d.w / 2 + 0.1 + D.win.half, `a door over a window on ${d.wall}`);
    }
  }
});

test('the neighbours: nothing of the chalet overlaps the AVIA garage house, the Migros or the fire station', () => {
  const theirs = ['w117012205', 'w117012298', 'w117012220', 'w1387458859'].map(osmRing).filter(Boolean);
  assert.ok(theirs.length >= 3);
  const mine = [...groundOutlines(), roofRing()];
  for (const m of mine) for (const t of theirs) {
    for (const [x, z] of m) assert.ok(!pointInRing(t, x, z), `the chalet at ${x}, ${z} inside a neighbour`);
    for (const [x, z] of t) assert.ok(!pointInRing(m, x, z), `a neighbour at ${x}, ${z} inside the chalet`);
  }
  // its own footprint in OpenStreetMap covers the house
  const own = osmRing(D.osm);
  assert.ok(own);
  assert.ok(pointInRing(own, 676.8, -1330.5));
});

test('the missions\' doors and starts near the chalet stay outside it', async () => {
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
  for (const [x, z] of points.filter(([x, z]) => Math.hypot(x - 679, z + 1327) < 40)) assert.ok(!insideHouse(x, z), `a mission's place at ${x}, ${z} inside the chalet`);
});

test('the chalet in Node: every vertex finite, four meshes, no colliders of its own, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { buildTalstrasseChalet, ATLAS } = await import('../js/talstrasse-chalet.js');
  assert.equal(SURVEYED_FOOTPRINTS.get(D.osm).length, 2);
  // the atlas' cells apart and within it
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 512 && y + h <= 256);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'cells apart');
  }
  // (SIMPLE_SKINS' materials marked as they are made: on the phone every material is one of them, the trim's vertex
  // colours or the decals' plain texture, as .claude/skills/gebaeude-nach-foto/scripts/mobile-check.mjs checks)
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildTalstrasseChalet(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Chalet Talstrasse ', '')).sort();
    assert.deepEqual(names, ['decal', 'roof', 'trim', 'walls']);
    let tris = 0;
    for (const m of group.children) {
      assert.ok(m.material, `${m.name}: a material`);
      if (simple) {
        const M = m.material, decal = M.opacityNode && M.transparent && !M.emissiveNode && !M.roughnessNode;
        const procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
        assert.ok(M.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
      }
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      tris += p.count / 3;
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > D.base - 0.5 && p.array[i] < 8.2, `${m.name}: a height of ${p.array[i]}`);
      // everything within the roof's outline and the wing's, a balcony's or a step's reach
      for (let i = 0; i < p.array.length; i += 3) {
        const [t, c] = toLocal(p.array[i], p.array[i + 2]);
        assert.ok(t > D.roof.t0 - 1.3 && t < D.roof.t1 + 0.1 && c > D.roof.west[0] - 0.1 && c < 16.6 + 0.8, `${m.name}: a vertex out at ${t.toFixed(2)}, ${c.toFixed(2)}`);
      }
    }
    assert.ok(tris < 20000, `${tris} triangles`);
  }
});
