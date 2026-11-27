import test from 'node:test';
import assert from 'node:assert/strict';
import { PISCHA, flagPole, floorOf, onWall, outwardRing, pointInRing, ringArea2, roofOutline, sideFrame, wallFrame } from '../js/pischa-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { UNSURVEYED_BUILDINGS } from '../js/unsurveyed-buildings-data.js';
import { groundHeight } from '../js/terrain.js';
import { POND } from '../js/missions-data-outdoor.js';

const near = (p, q, e = 0.06) => Math.hypot(p[0] - q[0], p[1] - q[1]) < e;
/** Is a → b (or b → a) a wall of the outline? */
const isWall = (a, b) => PISCHA.ring.some((q, i) => { const r = PISCHA.ring[(i + 1) % PISCHA.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });

test('the outline is OpenStreetMap\'s, a building swisstopo\'s survey lacks, of a kiosk\'s size', () => {
  const b = DAVOS_DATA.buildings.find((x) => x.id === PISCHA.osm);
  assert.ok(b, 'in DAVOS_DATA');
  const flat = PISCHA.ring.flat();
  assert.equal(b.ring.length, flat.length);
  b.ring.forEach((v, i) => assert.ok(Math.abs(v - flat[i]) < 1e-9));
  assert.ok(UNSURVEYED_BUILDINGS.has(PISCHA.osm) && UNSURVEYED_BUILDINGS.has(PISCHA.neighbour));
  const area = Math.abs(ringArea2(PISCHA.ring)) / 2;
  assert.ok(area > 25 && area < 40, `${area} m²`);
  // the neighbour on the north-west shares the kiosk's north-west wall
  const n = DAVOS_DATA.buildings.find((x) => x.id === PISCHA.neighbour).ring;
  const S = PISCHA.sides.northwest, pts = [];
  for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  assert.ok(pts.some((p) => near(p, S.a)) && pts.some((p) => near(p, S.b)));
});

test('the sides are walls of the outline, facing as named (z south), a step out of each leaves it', () => {
  const facing = { front: [1, -1], northwest: [-1, -1], southwest: [-1, 1], southeast: [1, 1] };
  for (const [k, s] of Object.entries(PISCHA.sides)) {
    assert.ok(isWall(s.a, s.b), `${k}: a wall`);
    const F = sideFrame(k);
    assert.ok(Math.sign(F.n[0]) === facing[k][0] && Math.sign(F.n[1]) === facing[k][1], `${k}: facing ${F.n}`);
    assert.ok(Math.abs(F.n[0]) > 0.5 && Math.abs(F.n[1]) > 0.5);
    const [x, z] = onWall(F, F.len / 2, 0.2);
    assert.ok(!pointInRing(PISCHA.ring, x, z), `${k}: faces out`);
    const [xi, zi] = onWall(F, F.len / 2, -0.2);
    assert.ok(pointInRing(PISCHA.ring, xi, zi), `${k}: the inside behind it`);
  }
  // the ring as the walls are built: every wall faces out
  const ring = outwardRing(PISCHA.ring);
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    assert.ok(!pointInRing(PISCHA.ring, ...onWall(F, F.len / 2, 0.1)));
  }
});

test('the heights: about three metres, the fascia over the walls; the floor over the ground', () => {
  assert.ok(PISCHA.wall > 2.6 && PISCHA.wall < 3.4 && PISCHA.roof - PISCHA.wall > 0.3 && PISCHA.roof < 4);
  const { floor, low } = floorOf(groundHeight);
  assert.ok(Number.isFinite(floor) && Number.isFinite(low));
  assert.ok(floor > low && floor - low < 1.5, `floor ${floor}, lowest ground ${low}`);
  for (const [x, z] of PISCHA.ring) assert.ok(groundHeight(x, z) <= floor, 'no ground over the floor at a corner');
  // (the ground here, y −3.3 to −2.7: ground.json of the survey's extraction)
  assert.ok(floor > -4 && floor < -2);
  assert.ok(PISCHA.plinth < PISCHA.window.y0 && PISCHA.plinth < PISCHA.poster.y0);
});

test('the roof covers the outline, reaching out by each side\'s eave', () => {
  const roof = roofOutline();
  assert.equal(roof.length, 4);
  for (const [x, z] of PISCHA.ring) assert.ok(pointInRing(roof, x, z), `${x}, ${z} under the roof`);
  for (const [k, s] of Object.entries(PISCHA.sides)) {
    const F = sideFrame(k);
    // the roof's edge over this side: the distance out of the wall of the roof's points, the largest
    const out = Math.max(...roof.map(([x, z]) => (x - F.a[0]) * F.n[0] + (z - F.a[1]) * F.n[1]));
    assert.ok(Math.abs(out - s.eave) < 0.05, `${k}: ${out} out, not ${s.eave}`);
  }
  assert.ok(Math.abs(ringArea2(roof)) / 2 < 60);
});

test('the front\'s door, panel, poster and lettering, the south-east side\'s window, board and posters fit their walls', () => {
  const F = sideFrame('front'), D = PISCHA.door, Mu = PISCHA.mural, Po = PISCHA.poster;
  assert.ok(D.s0 > 0.3 && D.s1 < Mu.s0 && Mu.s1 < F.len && Po.s0 >= Mu.s0 && Po.s1 <= Mu.s1);
  assert.ok(Po.y0 > Mu.y1 && Po.y1 < PISCHA.wall && D.y1 < PISCHA.wall);
  assert.ok(PISCHA.lettering.w < F.len + PISCHA.sides.southeast.eave && PISCHA.lettering.y0 > PISCHA.wall && PISCHA.lettering.y1 < PISCHA.roof);
  const S = sideFrame('southeast'), list = [PISCHA.window, PISCHA.notice, ...PISCHA.sidePosters].sort((a, b) => a.s0 - b.s0);
  assert.ok(list[0].s0 > 0.3 && list[list.length - 1].s1 < S.len - 0.05);
  for (let i = 1; i < list.length; i++) assert.ok(list[i].s0 > list[i - 1].s1, 'no overlap');
  for (const p of list) assert.ok(p.y0 > PISCHA.plinth - 0.2 && p.y1 < PISCHA.wall);
});

test('the flag pole stands outside the walls and the eave; the pond\'s game starts clear of the kiosk', () => {
  const [x, z] = flagPole(), roof = roofOutline();
  assert.ok(!pointInRing(PISCHA.ring, x, z) && !pointInRing(roof, x, z));
  assert.ok(PISCHA.flag.out > PISCHA.sides.front.eave + 0.1);
  // the nearest mission (pond hockey on the Seehofseeli, js/missions-data-outdoor.js): its start and its rink far off
  for (const p of [POND.start, POND.centre]) {
    assert.ok(!pointInRing(roof, p.x, p.z));
    assert.ok(Math.min(...roof.map(([rx, rz]) => Math.hypot(rx - p.x, rz - p.z))) > 20, 'well away from the kiosk');
  }
});

test('the atlas\' cells lie in it and do not overlap', async () => {
  globalThis.document ??= { createElement: () => ({}) };
  const { ATLAS } = await import('../js/pischa.js');
  const cells = Object.entries(ATLAS);
  for (const [k, [x, y, w, h]] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512, k);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [, a] = cells[i], [, b] = cells[j];
    const apart = a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1];
    assert.ok(apart, `${cells[i][0]} and ${cells[j][0]}`);
  }
});

async function build(simple) {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { buildPischa } = await import('../js/pischa.js');
  const was = QUALITY.simpleMaterials;
  QUALITY.simpleMaterials = simple;
  try {
    const scene = new THREE.Scene();
    return { ...buildPischa(scene), THREE, SIMPLE_SKINS };
  } finally {
    QUALITY.simpleMaterials = was;
  }
}

test('the kiosk in Node: five meshes, every vertex finite, js/buildings.js leaves its outline alone, its walls\' colliders', async () => {
  const { group, colliders } = await build(false);
  const { LANDMARK_SOURCE_EXCLUSIONS, SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  assert.ok(LANDMARK_SOURCE_EXCLUSIONS.has(PISCHA.osm));
  assert.ok(!LANDMARK_SOURCE_EXCLUSIONS.has(PISCHA.neighbour) && !SURVEYED_FOOTPRINTS.has(PISCHA.osm));
  assert.equal(group.userData.terrain, 'absolute');
  assert.deepEqual(group.children.map((m) => m.name).sort(), ['Pischa decal', 'Pischa glass', 'Pischa roof', 'Pischa timber', 'Pischa trim']);
  const { floor } = floorOf(groundHeight);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > floor - 3 && p.array[i] < floor + PISCHA.flag.height + 0.1, `${m.name}: a height of ${p.array[i]}`);
  }
  // a collider on every wall of the outline, and the pole's
  const ring = outwardRing(PISCHA.ring);
  assert.equal(colliders.length, ring.length + 1);
  for (const c of colliders) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > c.baseY + 3 && c.baseY < floor);
    assert.ok(Math.abs(c.obb.cs ** 2 + c.obb.sn ** 2 - 1) < 1e-9);
  }
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], c = colliders[i];
    assert.ok(near([c.obb.cx, c.obb.cz], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 0.01) && Math.abs(c.obb.hx * 2 - Math.hypot(b[0] - a[0], b[1] - a[1])) < 0.01);
    // (the box's long axis along the wall)
    assert.ok(Math.abs(c.obb.cs * (b[0] - a[0]) - c.obb.sn * (b[1] - a[1])) / (c.obb.hx * 2) > 0.999);
  });
});

test('the phone\'s profile: only SIMPLE_SKINS\' materials, the vertex-coloured trim and the decal', async () => {
  const { group, SIMPLE_SKINS } = await build(true);
  assert.ok(SIMPLE_SKINS);
  for (const m of group.children) {
    const mat = m.material;
    const decal = mat.opacityNode && mat.transparent && !mat.emissiveNode && !mat.roughnessNode;
    const plainish = !mat.roughnessNode && !mat.normalNode && !mat.positionNode;
    assert.ok(decal || plainish, `${m.name}: a full shader on the phone`);
    // (SIMPLE_SKINS' colour nodes read the material's colour; no procedural walls)
    if (m.name === 'Pischa timber') assert.ok(!mat.colorNode, 'plain timber');
  }
});
