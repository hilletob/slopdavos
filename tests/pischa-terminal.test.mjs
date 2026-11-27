import test from 'node:test';
import assert from 'node:assert/strict';
import { PISCHA_TERMINAL as T, floorOf, groundOutline, onWall, outwardRing, pointInRing, ringArea2, roofOutline, sideFrame, vitrines, wallFrame } from '../js/pischa-terminal-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { PARKING_DATA } from '../js/parking-data.js';
import { groundHeight } from '../js/terrain.js';
import { POND } from '../js/missions-data-outdoor.js';
import { RINK } from '../js/missions-data-rink.js';

const near = (p, q, e = 0.06) => Math.hypot(p[0] - q[0], p[1] - q[1]) < e;
/** The distance from p to the segment a–b */
function segDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}
/** The distance between a ring and a polyline (0 if they cross or the polyline runs inside) */
function ringToLine(ring, line) {
  let d = Infinity;
  for (const p of line) { if (pointInRing(ring, p[0], p[1])) return 0; }
  for (let i = 0; i < ring.length; i++) for (let j = 0; j + 1 < line.length; j++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], c = line[j], e = line[j + 1];
    // (crossing segments)
    const s1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), s2 = (b[0] - a[0]) * (e[1] - a[1]) - (b[1] - a[1]) * (e[0] - a[0]);
    const s3 = (e[0] - c[0]) * (a[1] - c[1]) - (e[1] - c[1]) * (a[0] - c[0]), s4 = (e[0] - c[0]) * (b[1] - c[1]) - (e[1] - c[1]) * (b[0] - c[0]);
    if (s1 * s2 < 0 && s3 * s4 < 0) return 0;
    d = Math.min(d, segDist(a, c, e), segDist(b, c, e), segDist(c, a, b), segDist(e, a, b));
  }
  return d;
}
const road = (id) => { const r = DAVOS_DATA.roads.find((x) => x.id === id); const p = []; for (let i = 0; i < r.pts.length; i += 2) p.push([r.pts[i], r.pts[i + 1]]); return { ...r, line: p }; };

test('the outline is the survey\'s walls, a pavilion of 3.7 × 8.1 m, no OpenStreetMap building on it', () => {
  const area = Math.abs(ringArea2(T.ring)) / 2;
  assert.ok(area > 26 && area < 34, `${area} m²`);
  // the survey's centre (its exclusion) inside
  assert.ok(pointInRing(T.ring, T.exclude[0].x, T.exclude[0].z));
  for (const b of DAVOS_DATA.buildings) {
    const p = [];
    for (let i = 0; i < b.ring.length; i += 2) p.push([b.ring[i], b.ring[i + 1]]);
    assert.ok(!p.some(([x, z]) => pointInRing(T.ring, x, z)) && !T.ring.some(([x, z]) => pointInRing(p, x, z)), `${b.id} overlaps`);
  }
});

test('the sides are walls of the outline, facing as named (z south), a step out of each leaves it', () => {
  const facing = { southwest: [-1, 1], southeast: [1, 1], northeast: [1, -1], northwest: [-1, -1] };
  for (const [k, s] of Object.entries(T.sides)) {
    const i = T.ring.findIndex((q) => near(q, s.a));
    assert.ok(i >= 0 && near(T.ring[(i + 1) % 4], s.b), `${k}: a wall, a → b round the ring`);
    const F = sideFrame(k);
    assert.ok(Math.sign(F.n[0]) === facing[k][0] && Math.sign(F.n[1]) === facing[k][1], `${k}: facing ${F.n}`);
    assert.ok(!pointInRing(T.ring, ...onWall(F, F.len / 2, 0.2)), `${k}: faces out`);
    assert.ok(pointInRing(T.ring, ...onWall(F, F.len / 2, -0.2)), `${k}: the inside behind it`);
  }
  const ring = outwardRing(T.ring);
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    assert.ok(!pointInRing(T.ring, ...onWall(F, F.len / 2, 0.1)));
  }
  // the ends short, the long sides long
  assert.ok(sideFrame('southwest').len < 4 && sideFrame('southeast').len > 7.5 && sideFrame('northwest').len > 7.5);
});

test('the roof reaches out as the survey\'s does, each side by its eave', () => {
  const roof = roofOutline();
  assert.equal(roof.length, 4);
  for (const [x, z] of T.ring) assert.ok(pointInRing(roof, x, z));
  for (const q of T.surveyRoof) assert.ok(roof.some((r) => near(r, q, 0.25)), `the survey's corner ${q}`);
  for (const [k, s] of Object.entries(T.sides)) {
    const F = sideFrame(k);
    const out = Math.max(...roof.map(([x, z]) => (x - F.a[0]) * F.n[0] + (z - F.a[1]) * F.n[1]));
    assert.ok(Math.abs(out - s.eave) < 0.05, `${k}: ${out} out, not ${s.eave}`);
  }
});

test('the heights: the photographs\' pavilion (under four metres), the floor on the ground', () => {
  assert.ok(T.wall > 2.8 && T.roof - T.wall > 0.4 && T.roof < 4.5);
  const { floor, low } = floorOf(groundHeight);
  assert.ok(Number.isFinite(floor) && floor > low && floor - low < 1);
  // (the survey's floor at y −3.05)
  assert.ok(Math.abs(floor - -3.05) < 0.6, `floor ${floor}`);
  for (const [x, z] of T.ring) assert.ok(groundHeight(x, z) <= floor);
});

test('the stair head: the landing and the stairwell inside the walls, the steps of OpenStreetMap under the pavilion', () => {
  const H = T.hall, g = groundOutline();
  assert.ok(H.landing > 0.8 && H.depth > H.landing + 1 && H.depth < sideFrame('southeast').len - 2);
  // the walls' outline: the open end replaced by the landing's edge, inside the walls
  assert.equal(g.length, 4);
  for (const [x, z] of g) assert.ok(pointInRing(T.ring, x, z) || T.ring.some((q, i) => segDist([x, z], q, T.ring[(i + 1) % 4]) < 0.02));
  const F = sideFrame('southwest');
  for (const p of [g[0], g[3]]) assert.ok(Math.abs(-((p[0] - F.a[0]) * F.n[0] + (p[1] - F.a[1]) * F.n[1]) - H.landing) < 0.02);
  assert.ok(Math.abs(ringArea2(g)) / 2 > 20);
  // the rail across the opening's left half, the board on the back wall
  assert.ok(H.frontRail[0] >= H.post && H.frontRail[1] < F.len / 2 + 0.3);
  assert.ok(T.board.s0 > T.thick && T.board.s1 < F.len - T.thick && T.board.y1 < T.wall);
  // the steps w854855706 start in the open end and run down north-east along the pavilion (their foot, where the
  // footway under the road goes on, a few decimetres past the north-east wall as OSM maps it)
  const [foot, top] = road('w854855706').line; // (OSM draws them upwards)
  const back = (p) => -((p[0] - F.a[0]) * F.n[0] + (p[1] - F.a[1]) * F.n[1]);
  assert.ok(pointInRing(T.ring, ...top) && back(top) < H.depth);
  const NE = sideFrame('northeast');
  assert.ok(back(foot) > 7 && (foot[0] - NE.a[0]) * NE.n[0] + (foot[1] - NE.a[1]) * NE.n[1] < 0.5);
});

test('the vitrines fit the south-east side between the piers; the door fits the north-west side', () => {
  const F = sideFrame('southeast'), list = vitrines();
  assert.equal(list.length, T.vitrine.posters.length);
  assert.ok(list[0].s0 >= T.piers.end - 1e-9 && list[list.length - 1].s1 <= F.len - T.piers.end + 1e-9);
  for (let i = 1; i < list.length; i++) assert.ok(list[i].s0 - list[i - 1].s1 >= T.piers.post - 1e-9);
  for (const v of list) assert.ok(v.s1 - v.s0 > 1.5);
  assert.ok(T.vitrine.y0 >= T.plinth && T.vitrine.y1 < T.wall);
  // (the stair head's inner face behind the first vitrine: the vitrines lie on the closed wall's outside only)
  const N = sideFrame('northwest');
  assert.ok(T.door.s0 > 0.3 && T.door.s1 < N.len - T.hall.depth - 0.5 && T.door.y1 < T.wall);
});

test('the Talstrasse, the service roads, the footways and the parking bays stay clear', () => {
  const roof = roofOutline();
  for (const r of DAVOS_DATA.roads) {
    if (r.layer < 0 || r.tunnel) continue;
    const { line } = road(r.id);
    if (!line.some(([x, z]) => Math.hypot(x - 729, z + 1364) < 80)) continue;
    // the carriageways clear of the roof by a metre, the footways' middles outside the closed walls (the footway from
    // the stair head starts on its landing)
    const d = ringToLine(r.kind === 'footway' || r.kind === 'path' ? groundOutline() : roof, line);
    const need = r.kind === 'footway' || r.kind === 'path' ? 0.2 : r.width / 2 + 1;
    assert.ok(d > need, `${r.id} ${r.name} (${r.kind}) ${d.toFixed(2)} m off`);
  }
  // the Talstrasse well away (the parked cars between it and the pavilion in the photographs)
  assert.ok(ringToLine(roof, road('w317013395').line) > 5);
  for (const lot of PARKING_DATA) for (const b of lot.bays || []) {
    if (Math.hypot(b[0] - 729, b[1] + 1364) > 30) continue;
    const half = Math.hypot(b[3], b[4]) / 2;
    assert.ok(!pointInRing(roof, b[0], b[1]) && Math.min(...roof.map((a, i) => segDist([b[0], b[1]], a, roof[(i + 1) % 4]))) > half, `bay ${b}`);
  }
});

test('the missions\' and the cyclist\'s spots are far off', async () => {
  const { PLAYER_STARTS } = await import('../js/controllers.js');
  const spots = [POND.start, POND.centre, RINK.start, RINK.hydrant, RINK.pin, RINK.machine, PLAYER_STARTS.cyclist];
  for (const p of spots) assert.ok(Math.min(...roofOutline().map(([x, z]) => Math.hypot(x - p.x, z - p.z))) > 15, `${p.x}, ${p.z}`);
});

test('the atlas\' cells lie in it and do not overlap', async () => {
  globalThis.document ??= { createElement: () => ({}) };
  const { ATLAS } = await import('../js/pischa-terminal.js');
  const cells = Object.entries(ATLAS);
  for (const [k, [x, y, w, h]] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512, k);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [, a] = cells[i], [, b] = cells[j];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `${cells[i][0]} and ${cells[j][0]}`);
  }
  for (const k of [...T.vitrine.posters, 'board', 'sign']) assert.ok(ATLAS[k], k);
});

async function build(simple) {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { buildPischaTerminal } = await import('../js/pischa-terminal.js');
  const was = QUALITY.simpleMaterials;
  QUALITY.simpleMaterials = simple;
  try {
    return { ...buildPischaTerminal(new THREE.Scene()), SIMPLE_SKINS };
  } finally {
    QUALITY.simpleMaterials = was;
  }
}

test('the pavilion in Node: six meshes, every vertex finite, its outline registered, the walls\' colliders', async () => {
  const { group, colliders } = await build(false);
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(T.key), [groundOutline()]);
  assert.equal(group.userData.terrain, 'absolute');
  assert.deepEqual(group.children.map((m) => m.name).sort(), ['decal', 'glass', 'lamp', 'roof', 'timber', 'trim'].map((k) => `Pischa terminal ${k}`));
  const { floor } = floorOf(groundHeight), roofY = floor + T.roof;
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > floor - 2 && p.array[i] <= roofY + T.sign.y1 + 0.01, `${m.name}: a height of ${p.array[i]}`);
  }
  // the roof faces up, all of it over the roof's outline
  const r = group.children.find((m) => m.name.endsWith('roof')).geometry.attributes;
  for (let i = 1; i < r.normal.array.length; i += 3) assert.ok(r.normal.array[i] > 0.99);
  // a collider on every side of the walls' outline, at world heights
  const g = groundOutline();
  assert.equal(colliders.length, g.length);
  g.forEach((a, i) => {
    const b = g[(i + 1) % g.length], c = colliders[i];
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > floor + T.wall && c.baseY < floor);
    assert.ok(Math.abs(c.obb.cs ** 2 + c.obb.sn ** 2 - 1) < 1e-9);
    assert.ok(near([c.obb.cx, c.obb.cz], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 0.01) && Math.abs(c.obb.hx * 2 - Math.hypot(b[0] - a[0], b[1] - a[1])) < 0.01);
    assert.ok(Math.abs(c.obb.cs * (b[0] - a[0]) - c.obb.sn * (b[1] - a[1])) / (c.obb.hx * 2) > 0.999);
  });
});

test('the phone\'s profile: only SIMPLE_SKINS\' materials, the vertex-coloured trim and the decal', async () => {
  const { group } = await build(true);
  for (const m of group.children) {
    const mat = m.material;
    const decal = mat.opacityNode && mat.transparent && !mat.emissiveNode && !mat.roughnessNode;
    const plainish = !mat.roughnessNode && !mat.normalNode && !mat.positionNode;
    assert.ok(decal || plainish, `${m.name}: a full shader on the phone`);
    if (m.name.endsWith('timber')) assert.ok(!mat.colorNode, 'plain timber');
    if (m.name.endsWith('glass') || m.name.endsWith('lamp')) assert.ok(mat.emissive && mat.emissive.r > 0, `${m.name}: glows`);
  }
});
