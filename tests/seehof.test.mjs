import test from 'node:test';
import assert from 'node:assert/strict';
import { SEEHOF, bays, facesStreet, insetRing, onWall, outwardRing, part, partAt, pointInRing, ringArea2, selfCrosses, wallFrame } from '../js/seehof-data.js';
import { PIZZA_STOPS } from '../js/missions-data-gastro.js';

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the part? */
const isWall = (p, a, b) => p.ring.some((q, i) => { const r = p.ring[(i + 1) % p.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
/** Do the segments p–q and r–s cross? */
const crosses = (p, q, r, s) => {
  const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0;
};

test('the Seehof\'s volumes: simple outlines of some size, the floors\' grids under their roofs', () => {
  for (const p of SEEHOF.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 40, `${p.id}: an outline of some size`);
    assert.ok(!selfCrosses(p.ring), `${p.id}: no wall crosses another`);
    assert.ok(p.top > SEEHOF.base + 8, `${p.id}: its roof over the base`);
    const roof = p.mansard ? p.mansard.eave : p.top;
    if (p.style !== 'shop') assert.ok(p.line <= roof + 0.25 && roof - p.line < 1.0, `${p.id}: the floors end at its roof (or its eaves)`);
    if (p.mansard) assert.equal(p.line, p.mansard.eave);
  }
  // the exclusion catches the hotel's batch, not St. Theodul's 48 m east
  assert.equal(SEEHOF.exclude.r, 3);
  assert.ok(Math.hypot(744 - SEEHOF.exclude.x, -1510 - SEEHOF.exclude.z) > 40);
  // the new wing: five floors of 2.7 m over the hall, the attic one more
  const h = SEEHOF.storey.modern;
  assert.ok(Math.abs(part('wing').line - 5 * h - part('hall').top) < 0.01);
  assert.ok(Math.abs(part('attic').line - part('wing').line - h) < 0.01);
  // the old hotel: its ground floor's top and three floors to the cornice, the north-east wing one floor lower, the
  // tower seven floors over the ground floor, all on one grid of 3.3 m
  const o = SEEHOF.storey.old, onGrid = (y) => Math.abs((y - SEEHOF.plinth) / o - Math.round((y - SEEHOF.plinth) / o)) < 1e-6;
  assert.ok(onGrid(part('old').line) && Math.round((part('old').line - SEEHOF.plinth) / o) === 3);
  assert.ok(onGrid(part('old-east').line) && Math.round((part('old-east').line - SEEHOF.plinth) / o) === 2);
  assert.ok(onGrid(part('tower').line) && Math.round((part('tower').line - SEEHOF.plinth) / o) === 6);
  // the street before the hotel lies at y −1 to +1: the ground floor's top 4–6 m over it
  assert.ok(SEEHOF.plinth > 3.5 && SEEHOF.plinth < 6);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of SEEHOF.parts) {
    const ring = outwardRing(p.ring);
    let out = 0, walls = 0;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 2) continue;
      walls++;
      const [x, z] = onWall(F, F.len / 2, 0.2);
      if (!pointInRing(p.ring, x, z)) out++;
    }
    assert.equal(out, walls, `${p.id}: ${out} of ${walls} walls face out`);
  }
});

test('the mansards: their tops inside their walls, no wall turned round, the name over the front by the tower', () => {
  for (const p of SEEHOF.parts.filter((q) => q.mansard)) {
    const R = outwardRing(p.ring), I = insetRing(p.ring, p.mansard.inset);
    assert.equal(I.length, R.length);
    assert.ok(!selfCrosses(I), `${p.id}: the mansard's top a simple outline`);
    for (let i = 0; i < R.length; i++) {
      const a = R[i], b = R[(i + 1) % R.length], c = I[i], d = I[(i + 1) % R.length];
      assert.ok((b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1]) > 0, `${p.id}: wall ${i} keeps its way round`);
      assert.ok(pointInRing(p.ring, c[0], c[1]), `${p.id}: corner ${i} of the top inside`);
    }
    // steep, as a mansard is (60° and more)
    assert.ok((p.top - p.mansard.eave) / p.mansard.inset > Math.tan(Math.PI / 3));
  }
  const N = SEEHOF.name, old = part(N.part);
  assert.ok(isWall(old, [N.wall[0], N.wall[1]], [N.wall[2], N.wall[3]]));
  const F = wallFrame([N.wall[0], N.wall[1]], [N.wall[2], N.wall[3]]);
  assert.ok(facesStreet(F, 0.9), 'the name faces the Promenade');
  assert.ok(N.w < F.len - 2 * old.mansard.inset - 1, 'the name fits the mansard\'s top edge');
});

test('the tower: its hipped roof on its walls, the ridge across the street\'s line, the entrance on its front', () => {
  const T = part('tower'), R = SEEHOF.towerRoof, [A, B, C, D] = T.ring;
  assert.equal(T.top, R.eave);
  // the ridge's ends near the middles of the short ends (A–D and B–C), inside the walls
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  assert.ok(Math.hypot(R.ridge[0][0] - mid(A, D)[0], R.ridge[0][1] - mid(A, D)[1]) < 3.5);
  assert.ok(Math.hypot(R.ridge[1][0] - mid(B, C)[0], R.ridge[1][1] - mid(B, C)[1]) < 3.5);
  for (const q of R.ridge) assert.ok(pointInRing(T.ring, q[0], q[1]));
  assert.ok(R.top > R.eave + 2 && R.top > part('attic').top);
  // the entrance: the tower's short end, facing the Promenade, in front of every other volume
  const E = SEEHOF.entrance, F = wallFrame(E.a, E.b);
  assert.ok(isWall(T, E.a, E.b) && near(E.a, B) && near(E.b, C));
  assert.ok(facesStreet(F, 0.9));
  assert.ok(E.door.s - E.door.w / 2 > 0 && E.door.s + E.door.w / 2 < F.len && E.door.y1 < E.canopy.y && E.canopy.y + 1.2 < SEEHOF.plinth + 0.5);
  { const [x, z] = onWall(F, F.len / 2, 0.3); assert.equal(partAt(x, z), null, 'nothing stands before the entrance'); }
});

test('the pizza run\'s door at the Seehof stays outside the hotel and within reach of the street, under the canopy', () => {
  const stop = PIZZA_STOPS.find((s) => s.id === 'seehof'), { door, road } = stop;
  assert.equal(partAt(door.x, door.z), null);
  // the way from the road to the door crosses no wall of the shops or the hall (their walls are colliders)
  for (const p of SEEHOF.parts.filter((q) => q.collide)) {
    p.ring.forEach((a, i) => assert.ok(!crosses([road.x, road.z], [door.x, door.z], a, p.ring[(i + 1) % p.ring.length]), `${p.id}: wall ${i}`));
    assert.ok(!pointInRing(p.ring, road.x, road.z));
  }
  // before the doors: along the front within them, out from it within the canopy
  const E = SEEHOF.entrance, F = wallFrame(E.a, E.b);
  const s = (door.x - F.a[0]) * F.u[0] + (door.z - F.a[1]) * F.u[1], o = (door.x - F.a[0]) * F.n[0] + (door.z - F.a[1]) * F.n[1];
  assert.ok(Math.abs(s - E.door.s) < E.door.w, `the door ${s.toFixed(2)} m along the front`);
  assert.ok(o > 0.3 && o < E.canopy.out, `${o.toFixed(2)} m before it`);
});

test('the balconies and the dormers of the new wing lie along its front, between each other', () => {
  const Bc = SEEHOF.balconies, F = wallFrame(Bc.a, Bc.b), wing = part('wing');
  assert.ok(isWall(wing, Bc.a, Bc.b) && facesStreet(F, 0.9));
  const spans = Bc.stacks.map(([c, w]) => [c - w / 2, c + w / 2]);
  for (const [s0, s1] of spans) assert.ok(s0 >= 0 && s1 <= F.len);
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] > spans[i - 1][1] + 2, 'room for windows between the stacks');
  // the slabs at the floors' tops, the highest at the eaves
  const h = SEEHOF.storey.modern;
  assert.ok(Math.abs(Bc.y0 - part('hall').top - h) < 0.01 && Math.abs(Bc.y0 + (Bc.floors - 1) * h - wing.top) < 0.01);
  const D = SEEHOF.dormers;
  for (const s of D.at) {
    assert.ok(s - D.half >= 0 && s + D.half <= F.len);
    assert.ok(spans.every(([s0, s1]) => s + D.half <= s0 + 0.01 || s - D.half >= s1 - 0.01), `the dormer at ${s} clear of the stacks`);
  }
  // (and the windows' bays of a wall lie inside it, clear of its ends)
  for (const s of bays(16, SEEHOF.bay.old, 8 - SEEHOF.quoin)) assert.ok(s > SEEHOF.quoin + 0.9 && s < 16 - SEEHOF.quoin - 0.9);
});

test('the atlas\' cells lie in it without overlapping', async () => {
  const { ATLAS } = await import('../js/seehof.js');
  const cells = Object.entries(ATLAS);
  for (const [k, [x, y, w, h]] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512, k);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [, a] = cells[i], [, b] = cells[j];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `${cells[i][0]} and ${cells[j][0]}`);
    }
  }
});

test('the building in Node: every vertex finite, six meshes, the walls of the shops and the hall as colliders', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildSeehof } = await import('../js/seehof.js');
  const scene = new THREE.Scene();
  const { group, colliders } = buildSeehof(scene);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Hotel Seehof decal', 'Hotel Seehof glass', 'Hotel Seehof modern', 'Hotel Seehof old', 'Hotel Seehof roof', 'Hotel Seehof trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > SEEHOF.base - 0.5 && p.array[i] < 31, `${m.name}: a height of ${p.array[i]}`);
    // every vertex within a few metres of OpenStreetMap's footprint's extent
    for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i] > 648 && p.array[i] < 745 && p.array[i + 2] > -1560 && p.array[i + 2] < -1460, `${m.name}: a point at ${p.array[i]}, ${p.array[i + 2]}`);
    // the walls carry their bays' half
    if (/modern|old/.test(m.name)) assert.ok(m.geometry.attributes.aHalf);
  }
  const n = SEEHOF.parts.filter((p) => p.collide).reduce((s, p) => s + p.ring.length, 0);
  assert.equal(colliders.length, n);
  for (const c of colliders) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > c.minY + 5 && c.minY === SEEHOF.base);
  }
});
