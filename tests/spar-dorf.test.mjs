import test from 'node:test';
import assert from 'node:assert/strict';
import { SPAR_DORF, front, frontOn, gridOf, isWall, onWall, outwardRing, part, partAt, pointInRing, ringArea2, surveyedFootprints, wallCover, wallFrame, windowsFrom } from '../js/spar-dorf-data.js';
import { PHARMACY } from '../js/missions-data-pharmacy.js';
import { POST_BOXES } from '../js/missions-data-post.js';

const S = SPAR_DORF;
/** Is (x, z) within `d` m of a wall of the ring? */
const nearRing = (ring, x, z, d) => ring.some((a, i) => {
  const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < d;
});
/** The walls of a part as wallFrame wants them */
const walls = (p) => { const r = outwardRing(p.ring); return r.map((a, i) => [a, r[(i + 1) % r.length]]); };

test('the volumes: outlines of some size, the floors adding up to the surveyed roofs', () => {
  for (const p of S.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 15, `${p.id}: an outline of some size`);
    assert.ok(p.top > p.floor + 4 && p.floor > S.base, `${p.id}: its roof over its foot, the walls reaching under it`);
    if (p.from === undefined) continue;
    const g = gridOf(p);
    assert.ok(p.from - p.floor >= 2.9, `${p.id}: a ground floor of some height`);
    const n = (p.line - p.from) / g.storey;
    assert.ok(Math.abs(n - Math.round(n)) < 1e-9, `${p.id}: whole floors`);
    assert.ok(p.top - p.line > 0.1 && p.top - p.line < 2.0, `${p.id}: a parapet (the tower: its head) over the floors`);
  }
  // the front houses: the shops' floor and two; the north block: the shop and two; the tower: a ground floor and two;
  // the west slab: a ground floor and three
  const floors = (id) => Math.round((part(id).line - part(id).from) / gridOf(part(id)).storey);
  assert.deepEqual(['corner', 'east', 'north', 'tower', 'west'].map(floors), [2, 2, 2, 2, 3]);
  assert.equal(part('corner').from, part('east').from, 'one grid of floors along the street');
  assert.ok(part('west').top > part('tower').top && part('tower').top > part('corner').top && part('corner').top > part('north').top && part('north').top > part('hall').top);
  assert.equal(S.exclude.length, 6);
  for (const e of S.exclude) assert.ok(partAt(e.x, e.z), 'each streamed volume left out lies under the rebuilt one');
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of S.parts) {
    let out = 0, n = 0;
    for (const [a, b] of walls(p)) {
      const F = wallFrame(a, b);
      if (F.len < 2) continue;
      n++;
      if (!pointInRing(p.ring, ...onWall(F, F.len / 2, 0.2))) out++;
    }
    assert.equal(out, n, `${p.id}: ${out} of ${n} walls face out`);
  }
});

test('the walls against the others are closed, windows only over their roofs', () => {
  for (const p of S.parts) for (const [a, b] of walls(p)) {
    const cover = wallCover(p, a, b), from = windowsFrom(p, cover);
    if (p.from === undefined) { assert.equal(from, null, `${p.id}: closed`); continue; }
    if (cover === -Infinity) assert.equal(from, p.from);
    if (from !== null) assert.ok(from >= cover - 1e-9 && from < p.line, `${p.id}: the windows over what stands against the wall`);
  }
  // the north block against the east house: closed; over the hall's roof: its top floor's windows
  const N = part('north');
  assert.equal(windowsFrom(N, wallCover(N, [802.1, -1538.0], [807.8, -1545.5])), null);
  assert.equal(windowsFrom(N, wallCover(N, [793.1, -1545.0], [802.1, -1538.0])), N.from + S.back.storey);
  // the corner and the east house against each other: closed
  assert.equal(windowsFrom(part('corner'), wallCover(part('corner'), [805.7, -1521.6], [795.3, -1529.3])), null);
  // the west slab over w1527538706: its top two floors' windows
  const W = part('west');
  assert.ok(Math.abs(windowsFrom(W, wallCover(W, [788.2, -1538.7], [769.2, -1553.3])) - (W.line - 2 * S.back.storey)) < 1e-9);
});

test('the fronts lie on walls of their parts; the glazing, the doors, the canopies and the boards within them', () => {
  for (const f of S.fronts) {
    const p = S.parts.find((q) => walls(q).some(([a, b]) => frontOn(a, b) === f));
    assert.ok(p, `${f.id}: on a wall as outwardRing runs`);
    const F = wallFrame(f.a, f.b), [w] = walls(p).filter(([a, b]) => isWall(f, a, b));
    const free = wallCover(p, ...w) === -Infinity;
    if (f.glazing || f.doors || f.board) assert.ok(free, `${f.id}: on a free wall`);
    const top = p.from ?? p.top;
    for (const g of f.glazing || []) assert.ok(g.s0 >= 0.25 && g.s1 <= F.len - 0.25 && g.s1 > g.s0 && f.top < top - 0.3, `${f.id}: glazing`);
    for (const D of f.doors || []) {
      assert.ok(D.s - D.w / 2 > 0.2 && D.s + D.w / 2 < F.len - 0.2, `${f.id}: a door within the wall`);
      if (!D.solid) assert.ok(f.glazing.some((g) => D.s - D.w / 2 > g.s0 && D.s + D.w / 2 < g.s1), `${f.id}: a door in the glazing`);
    }
    if (f.canopy) assert.ok(f.canopy.s0 >= 0 && f.canopy.s1 <= F.len + 1e-9);
    if (f.board) {
      const Bd = f.board;
      assert.ok(Bd.s - Bd.w / 2 >= 0 && Bd.s + Bd.w / 2 <= F.len, `${f.id}: the board within the wall`);
      assert.ok(Bd.y0 > (f.top ?? 0) && Bd.y1 < p.top, `${f.id}: the board over the glazing, under the roof`);
      if (p.from !== undefined) {
        assert.ok(f.clear && Bd.s - Bd.w / 2 >= f.clear[0] - 1e-9 && Bd.s + Bd.w / 2 <= f.clear[1] + 1e-9, `${f.id}: no window behind the board`);
        assert.ok(Bd.y0 > p.from - 0.01);
      }
    }
  }
  // the photographs' sides: the street fronts face south-east, the board on the car park north-east, the porch's
  // south-west (towards the junction at the Bahnhofstrasse's bend)
  const n = (id) => wallFrame(front(id).a, front(id).b).n;
  for (const id of ['corner-street', 'east-street']) assert.ok(n(id)[0] > 0.6 && n(id)[1] > 0.4, id);
  assert.ok(n('east-car-park')[0] > 0.4 && n('east-car-park')[1] < -0.4);
  assert.ok(n('porch-west')[0] < -0.4 && n('porch-west')[1] > 0.4);
  // the boards: on the corner's porch and the east house's front on the car park, none on the middle house
  const boarded = S.fronts.filter((f) => f.board).map((f) => f.id).sort();
  assert.deepEqual(boarded, ['east-car-park', 'porch-west']);
});

test('the outlines the player\'s walls stand on: the middle house\'s and the corner house\'s, every part on the ground', () => {
  const fp = surveyedFootprints();
  assert.deepEqual([...fp.keys()].sort(), ['w1527538707', 'w1527538708']);
  assert.equal(fp.get('w1527538708').length, 2);
  assert.equal(fp.get('w1527538707').length, 5);
});

test('the block keeps off St. Theodul and the Montana, and the missions\' doors stay free', () => {
  const theodul = [[732.5, -1514.9], [746.3, -1515.4], [746.3, -1517.9], [751.1, -1517.9], [751.1, -1515.4], [753.5, -1515.5], [753.9, -1501.2], [732.9, -1500.6]];
  const montana = [[816.5, -1506.8], [829, -1524], [838.8, -1517], [836.7, -1514.1], [851.1, -1503.8], [850.3, -1502.6], [853.5, -1500.3], [850.8, -1496.6],
    [850.7, -1496.7], [843.3, -1486.5], [824.8, -1499.7], [810.6, -1481.1], [801.7, -1487.8]];
  for (const p of S.parts) for (const other of [theodul, montana]) {
    for (const q of p.ring) assert.ok(!pointInRing(other, ...q) && !nearRing(other, ...q, 5), `${p.id}: a corner clear of the neighbour`);
    for (const q of other) assert.ok(!pointInRing(p.ring, ...q));
  }
  // the pharmacy's door and its start (js/missions-data-pharmacy.js), the letterbox on the Bahnhofstrasse
  const spots = [PHARMACY.door, PHARMACY.start, POST_BOXES.find((b) => b.id === 'n13524186494')];
  for (const s of spots) {
    assert.equal(partAt(s.x, s.z), null);
    // (out of the canopies' reach too: they stand 1.9 m out)
    for (const p of S.parts) assert.ok(!nearRing(p.ring, s.x, s.z, 3), `${p.id}: clear of (${s.x}, ${s.z})`);
  }
});

async function build(simple) {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const canvases = [];
  globalThis.document = { createElement: () => { const c = { width: 0, height: 0, getContext: () => ctx, style: {} }; canvases.push(c); return c; } };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  QUALITY.simpleMaterials = simple;
  const { buildSparDorf } = await import('../js/spar-dorf.js');
  const scene = new THREE.Scene();
  return { ...buildSparDorf(scene), canvases };
}

test('the building in Node: every vertex finite, five meshes, its outlines registered, no colliders of its own', async () => {
  const { group, colliders, canvases } = await build(false);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  assert.deepEqual(group.children.map((m) => m.name).sort(), ['bands', 'decal', 'glass', 'punched', 'roof', 'trim'].map((n) => `Spar Davos Dorf ${n}`));
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= S.base - 0.01 && p.array[i] < 18.5, `${m.name}: a height of ${p.array[i]}`);
  }
  assert.ok(canvases.every((c) => c.width * c.height <= 1024 * 1024), 'one small atlas');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  for (const [id, rings] of surveyedFootprints()) assert.deepEqual(SURVEYED_FOOTPRINTS.get(id), rings);
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.ok(SHOP_EXCLUSIONS.has(S.shop));
});

test('the phone\'s profile: only SIMPLE_SKINS\' materials and the decal', async () => {
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const made = new Set();
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); made.add(m); return m; }; }
  const { group } = await build(true);
  for (const m of group.children) {
    const mat = m.material;
    const decal = mat.opacityNode && mat.transparent && !mat.emissiveNode && !mat.roughnessNode;
    const procedural = mat.colorNode || mat.emissiveNode || mat.roughnessNode || mat.normalNode || mat.positionNode;
    assert.ok(made.has(mat) || decal || !procedural, `${m.name}: a full shader on the phone`);
  }
});
