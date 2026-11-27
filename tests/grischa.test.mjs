import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRISCHA, among, canopyEdges, groundRings, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame, wallKind } from '../js/grischa-data.js';

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (in this order) a wall of the ring as wallFrame wants it? */
const isWall = (ring, a, b) => { const R = outwardRing(ring); return R.some((q, i) => near(q, a) && near(R[(i + 1) % R.length], b)); };

test('the Grischa\'s volumes: outlines of some size turned as wallFrame wants them, the floors adding up', () => {
  for (const p of [...GRISCHA.parts, { id: 'canopy', ...GRISCHA.canopy }]) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 30, `${p.id}: an outline of some size`);
    assert.equal(outwardRing(p.ring), p.ring, `${p.id}: listed as wallFrame wants it`);
  }
  const block = part('block'), attic = part('attic'), hall = part('hall');
  assert.ok(attic.top > block.top && block.top > hall.top);
  // five floors over the first floor's foot, the top floor's top under the block's roof
  assert.ok(Math.abs(GRISCHA.firstFloor + 5 * GRISCHA.storey - GRISCHA.line) < 1e-9);
  assert.equal(block.line, GRISCHA.line);
  assert.ok(block.top - block.line > 0 && block.top - block.line < 0.3);
  // the ground floor (the shops' height) over the ground on the Talstrasse (y −17.9)
  assert.ok(GRISCHA.firstFloor - -17.9 > 4 && GRISCHA.firstFloor - -17.9 < 5);
  // the attic one floor over the block, the hall's and the canopy's roof at the second floor's foot
  assert.ok(Math.abs(attic.line - block.line - GRISCHA.storey) < 1e-9 && attic.from === block.top);
  const second = GRISCHA.firstFloor + GRISCHA.storey;
  assert.ok(Math.abs(hall.top - second) < 0.15 && Math.abs(GRISCHA.canopy.top - second) < 0.15);
  for (const y of GRISCHA.balconies.floors) assert.ok(Math.abs(Math.round((y - second) / GRISCHA.storey) * GRISCHA.storey - (y - second)) < 1e-9, `a balcony at a floor's foot (${y})`);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of [...GRISCHA.parts, { id: 'canopy', ...GRISCHA.canopy }]) {
    const R = outwardRing(p.ring);
    let out = 0, walls = 0;
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 2) continue;
      walls++;
      if (!pointInRing(p.ring, ...onWall(F, F.len / 2, 0.2))) out++;
    }
    assert.equal(out, walls, `${p.id}: ${out} of ${walls} walls face out`);
  }
});

test('the fronts: the shops on the car park face north-north-east, the canopy\'s on the Talstrasse east-south-east', () => {
  const block = part('block'), hall = part('hall');
  for (const [a, b] of GRISCHA.shops.walls) {
    assert.ok(isWall(block.ring, a, b));
    assert.ok(wallFrame(a, b).n[1] < -0.8, 'facing north (smaller z)');
    assert.equal(wallKind(block, a, b), 'shop');
  }
  const [sa, sb] = GRISCHA.street.walls[0];
  assert.ok(isWall(block.ring, sa, sb) && isWall(hall.ring, ...GRISCHA.street.walls[1]));
  for (const [a, b] of GRISCHA.street.walls) assert.ok(wallFrame(a, b).n[0] > 0.8, 'facing the Talstrasse (east)');
  assert.ok(isWall(block.ring, ...GRISCHA.behindHall) && wallFrame(...GRISCHA.behindHall).n[1] > 0.8);
  // the tower's faces: walls of the block and of the attic, its front facing the car park
  for (const [a, b] of GRISCHA.tower.faces) {
    assert.ok(isWall(block.ring, a, b) && isWall(part('attic').ring, a, b));
    assert.equal(wallKind(block, a, b), 'tower');
  }
  const T = wallFrame(...GRISCHA.tower.faces[1]);
  assert.ok(T.n[1] < -0.8 && GRISCHA.tower.strip.half * 2 < T.len - 0.4 && GRISCHA.tower.strip.y1 < part('attic').top);
  // every wall of the block is one of the kinds the module builds
  const R = outwardRing(block.ring);
  for (let i = 0; i < R.length; i++) assert.ok(['tower', 'shop', 'street', 'behindHall', 'plain'].includes(wallKind(block, R[i], R[(i + 1) % R.length])));
  // the hall: its wall towards the neighbour (south-south-west) closed, its west end glazed
  assert.equal(wallKind(hall, [-713.2, 473.5], [-693.1, 486.9]), 'party');
  assert.equal(wallKind(hall, [-710.2, 469.0], [-713.2, 473.5]), 'glazed');
});

test('the lettering and the doors lie within their walls, between the floors\' windows', () => {
  const S = GRISCHA.shops, St = GRISCHA.street, W = GRISCHA.win, H = GRISCHA.storey;
  const F = wallFrame(...S.walls[0]);
  assert.ok(S.name.s - S.name.w / 2 > 0.3 && S.name.s + S.name.w / 2 < F.len - 0.3);
  // the name between the second floor's windows and the third's
  const second = GRISCHA.firstFloor + H;
  assert.ok(S.name.y0 > second + W.hi && S.name.y1 < second + H + W.lo);
  assert.ok(S.restaurant.y0 >= S.fascia[0] && S.restaurant.y1 <= S.fascia[1] && S.restaurant.s + S.restaurant.w / 2 < F.len);
  const G = wallFrame(...St.walls[0]);
  assert.ok(St.name.s >= 0 && St.name.s + St.name.w < St.doors.s - St.doors.w / 2, 'the name beside the doors');
  assert.ok(St.doors.s + St.doors.w / 2 < G.len - 0.3);
  assert.ok(St.name.y0 >= St.band[0] && St.name.y1 <= St.band[1] && St.band[1] < St.glassTop);
});

test('the canopy: its outer edges over the pavement, open ground beneath it; the player\'s walls on the block and the hall', () => {
  const edges = canopyEdges();
  assert.ok(edges.length >= 3);
  const longest = Math.max(...edges.map(([a, b]) => wallFrame(a, b).len));
  assert.ok(longest > 20, 'its front along the Talstrasse');
  // a point under the canopy lies in none of the outlines the player's walls stand on
  const [x, z] = onWall(wallFrame(...GRISCHA.street.walls[0]), 8, 1.5);
  assert.ok(pointInRing(GRISCHA.canopy.ring, x, z));
  assert.ok(groundRings().every((r) => !pointInRing(r, x, z)));
  assert.equal(partAt(x, z), null);
  assert.equal(groundRings().length, 2);
});

test('no mission door or shop of another house stands in the hotel or under its canopy', () => {
  const rings = [...groundRings(), GRISCHA.canopy.ring];
  const inside = (x, z) => rings.some((r) => pointInRing(r, x, z) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => pointInRing(r, x + dx * 1.2, z + dz * 1.2)));
  const files = fs.readdirSync(new URL('../js/', import.meta.url)).filter((f) => /^missions.*\.js$/.test(f));
  let n = 0;
  for (const f of files) {
    const src = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/x:\s*(-?\d+(?:\.\d+)?)\s*,\s*(?:y:\s*-?\d+(?:\.\d+)?\s*,\s*)?z:\s*(-?\d+(?:\.\d+)?)/g)) {
      n++;
      assert.ok(!inside(+m[1], +m[2]), `${f}: ${m[0]}`);
    }
  }
  assert.ok(n > 50, 'the missions\' places were read');
  assert.ok(among(GRISCHA.shops.walls, GRISCHA.shops.walls[1][1], GRISCHA.shops.walls[1][0]));
});

test('the building in Node: every vertex finite, six meshes, no colliders of its own, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { QUALITY } = await import('../js/quality.js');
  const { buildGrischa, ATLAS } = await import('../js/grischa.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(GRISCHA.osm), groundRings());
  assert.ok(SHOP_EXCLUSIONS.has(GRISCHA.osm));
  // the atlas' cells do not overlap and fit in 1024 × 512
  const cells = Object.values(ATLAS);
  for (const [i, a] of cells.entries()) {
    assert.ok(a[0] >= 0 && a[1] >= 0 && a[0] + a[2] <= 1024 && a[1] + a[3] <= 512);
    for (const b of cells.slice(i + 1)) assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);
  }
  for (const simple of [false, true]) {
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildGrischa(scene);
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    assert.deepEqual(group.children.map((m) => m.name).sort(), ['Grischa attic', 'Grischa decal', 'Grischa glass', 'Grischa plaster', 'Grischa roof', 'Grischa trim']);
    for (const m of group.children) {
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= GRISCHA.base - 0.01 && p.array[i] < 5.5, `${m.name}: a height of ${p.array[i]}`);
    }
    if (simple) {
      // (the phone's walls: SIMPLE_SKINS.windowed, no roughness or emissive nodes of their own)
      for (const name of ['Grischa plaster', 'Grischa attic', 'Grischa glass']) assert.ok(!group.children.find((m) => m.name === name).material.roughnessNode, name);
    }
  }
  QUALITY.simpleMaterials = false;
});
