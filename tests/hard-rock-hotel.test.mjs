import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HARD_ROCK_HOTEL, alongRun, cafeRuns, groundOutlines, isCafeFront, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame } from '../js/hard-rock-hotel-data.js';
import { ARKADEN } from '../js/landmark-buildings-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const H = HARD_ROCK_HOTEL;
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the part? */
const isWall = (p, a, b) => p.ring.some((q, i) => { const r = p.ring[(i + 1) % p.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
const area = (ring) => Math.abs(ringArea2(ring)) / 2;
/** The distance from (x, z) to a polyline of flat [x, z, …] */
const toLine = (pts, x, z) => {
  let d = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], dx = pts[i + 2] - ax, dz = pts[i + 3] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return d;
};
const insideAny = (x, z) => H.parts.some((p) => pointInRing(p.ring, x, z)) || pointInRing(H.porch.ring, x, z);

test('the volumes: outlines of some size, the floors ending under their roofs, one grid of floors through the hotel', () => {
  for (const p of H.parts) {
    assert.ok(p.ring.length >= 3 && area(p.ring) > 10, `${p.id}: an outline of some size`);
    assert.ok(p.top > H.base + 5, `${p.id}: its roof over the base`);
    assert.ok(['old', 'modern', 'cafe'].includes(p.style));
    if (p.style !== 'old') assert.ok(['white', 'concrete'].includes(p.tint), `${p.id}: a tint`);
    // the floor line under the roof: a parapet over it, or a stair's closed head
    if (p.windows !== false) assert.ok(p.line <= p.top + 0.01 && p.top - p.line < 3.0, `${p.id}: the floors end at its roof`);
  }
  // the hotel's blocks on one grid of 3.3 m floors: the main blocks', the lower blocks' a floor under them, the east
  // block's two
  const S = H.grid.old.storey, line = part('main').line;
  for (const p of H.parts.filter((q) => q.style === 'old' && q.id !== 'tower')) {
    const k = (line - p.line) / S;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-9, `${p.id}: on the hotel's grid`);
  }
  assert.equal(part('south').line, line);
  assert.ok(Math.abs(part('east-wing').line - (line - S)) < 1e-9);
  assert.ok(Math.abs(part('east-block').line - (line - 2 * S)) < 1e-9);
  // six storeys over the Tobelmühlestrasse (y −9 under the north front): the ground floor's foot a little over it
  assert.ok(Math.abs(line - 6 * S - -8.5) < 1e-9);
  // the tallest volumes as the survey has them: the pyramid's tip over the tower, the tower over the blocks
  assert.ok(H.pyramid.tip[1] > part('tower').top + 5 && part('tower').top > part('south').top && part('south').top > part('main').top);
  assert.ok(pointInRing(part('tower').ring, H.pyramid.tip[0], H.pyramid.tip[2]), 'the tip over the square');
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of [...H.parts, { id: 'porch', ring: H.porch.ring }]) {
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

test('the streamed volume left out lies amid the rebuilt one; the English Church and the Arkaden stay', () => {
  // (the batch's centre is its box's: it falls in the lane between the café and the link, a few metres from both)
  const xs = H.parts.flatMap((p) => p.ring.map((q) => q[0])), zs = H.parts.flatMap((p) => p.ring.map((q) => q[1]));
  assert.ok(Math.abs(H.exclude.x - (Math.min(...xs) + Math.max(...xs)) / 2) < 1 && Math.abs(H.exclude.z - (Math.min(...zs) + Math.max(...zs)) / 2) < 1);
  assert.ok(partAt(H.exclude.x - 2, H.exclude.z) && partAt(H.exclude.x + 9, H.exclude.z));
  // the church's batch (tile 11/1745/1011, batch 1, its centre) is not caught
  assert.ok(Math.hypot(-527.3 - H.exclude.x, -156.4 - H.exclude.z) > H.exclude.r + 20);
  // no corner of the rebuilt volumes in the Arkaden's wings on the Kulturplatz, nor theirs in ours
  for (const w of ARKADEN.wings) {
    const ring = [];
    for (let i = 0; i < w.ring.length; i += 2) ring.push([w.ring[i], w.ring[i + 1]]);
    for (const p of H.parts) {
      for (const [x, z] of p.ring) assert.ok(!pointInRing(ring, x, z), `${p.id} clear of the Arkaden`);
      for (const [x, z] of ring) assert.ok(!pointInRing(p.ring, x, z), `the Arkaden clear of ${p.id}`);
    }
  }
});

test('the outlines for the player\'s walls: one entry per OpenStreetMap building of the complex, near its footprint', () => {
  const G = groundOutlines();
  assert.deepEqual([...G.keys()].sort(), ['w123380401', 'w1529620019', 'w225910169', 'w225910172', 'w225910176']);
  assert.ok(!G.has('w225910175'), 'the church keeps its own walls');
  for (const [id, rings] of G) {
    const b = DAVOS_DATA.buildings.find((q) => q.id === id);
    assert.ok(b, id);
    let cx = 0, cz = 0;
    for (let i = 0; i < b.ring.length; i += 2) { cx += b.ring[i]; cz += b.ring[i + 1]; }
    cx /= b.ring.length / 2; cz /= b.ring.length / 2;
    for (const ring of rings) {
      const mx = ring.reduce((a, q) => a + q[0], 0) / ring.length, mz = ring.reduce((a, q) => a + q[1], 0) / ring.length;
      assert.ok(Math.hypot(mx - cx, mz - cz) < 30, `${id}: an outline near its footprint`);
    }
  }
  assert.ok(G.get(H.osm).includes(H.porch.ring));
});

test('the café\'s front faces the square: its runs, the piers and tiles, the sign on the band', () => {
  const K = H.cafe;
  const runs = cafeRuns(part('kurhaus'));
  assert.ok(runs.length >= 1 && runs[0].length >= 6, 'the curved corner and the front on the square');
  for (const id of ['kurhaus', 'cafe-east']) {
    for (const run of cafeRuns(part(id))) for (const F of run) assert.ok(F.n[1] > K.facing && isCafeFront(part(id), F));
  }
  assert.equal(cafeRuns(part('cafe-east')).length, 1);
  // the west wall towards the lane is not on the front
  const W = wallFrame([-526.6, -146.9], [-532.1, -128.7]);
  assert.ok(!isCafeFront(part('kurhaus'), W) && !isCafeFront(part('kurhaus'), wallFrame([-532.1, -128.7], [-526.6, -146.9])));
  // piers at both ends of a run and between, tiles between them, each within its wall
  for (const run of runs) {
    const total = run.reduce((a, F) => a + F.len, 0), piers = alongRun(run, K.pier), tiles = alongRun(run, K.pier, true);
    assert.equal(piers.length, tiles.length + 1);
    assert.ok(Math.abs(total / tiles.length - K.pier) < K.pier / 2);
    for (const { F, s } of [...piers, ...tiles]) assert.ok(s >= 0 && s <= F.len + 1e-9);
  }
  assert.ok(K.frieze + K.parapet - 0.2 > K.tile.h, 'the tiles fit the frieze');
  // the sign: on the curved block's front, facing the square (south), within its wall
  const S = wallFrame(K.sign.a, K.sign.b);
  assert.ok(isWall(part('kurhaus'), K.sign.a, K.sign.b));
  assert.ok(S.n[1] > 0.9 && S.len > K.sign.w + 0.3);
  const [x, z] = onWall(S, S.len / 2, 0.3);
  assert.ok(!pointInRing(part('kurhaus').ring, x, z), 'the sign\'s side is the outside');
});

test('the porch: on the north front by the church, its back in the block, clear of the lane', () => {
  const P = H.porch;
  assert.ok(area(P.ring) > 12);
  assert.ok(P.ring.some(([x, z]) => pointInRing(part('north').ring, x, z)), 'its back in the lower block');
  const R = outwardRing(P.ring);
  const fronts = R.map((a, i) => wallFrame(a, R[(i + 1) % R.length])).filter((F) => F.n[1] < -0.8);
  assert.equal(fronts.length, 1, 'one face to the lane (north)');
  const [x, z] = onWall(fronts[0], fronts[0].len / 2, 0.5);
  assert.ok(!insideAny(x, z));
  // the Tobelmühlestrasse's axis (OSM) 4 m and more before it
  const lane = DAVOS_DATA.roads.find((r) => r.name === 'Tobelmühlestrasse' && r.pts?.length && toLine(r.pts, -510, -168) < 10) ??
    { pts: [-450, -159, -461, -162, -531, -173, -563, -180] };
  for (const [px, pz] of P.ring) assert.ok(toLine(lane.pts, px, pz) > 4, `the lane clear at ${px}, ${pz}`);
});

test('the residence\'s balconies face south; the mission places nearby stay free', () => {
  const R = outwardRing(part('residence').ring);
  const south = R.map((a, i) => wallFrame(a, R[(i + 1) % R.length])).filter((F) => F.n[1] > H.balconies.facing && F.len >= H.balconies.minLen);
  assert.ok(south.length >= 2, 'its long walls to the south');
  // every place a mission names (x, z) lies outside the rebuilt volumes and the porch
  const files = fs.readdirSync(new URL('../js/', import.meta.url)).filter((f) => /^missions-data.*\.js$/.test(f));
  let seen = 0;
  for (const f of files) {
    const text = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of text.matchAll(/\bx:\s*(-?\d+(?:\.\d+)?),\s*z:\s*(-?\d+(?:\.\d+)?)/g)) {
      const x = +m[1], z = +m[2];
      seen++;
      assert.ok(!insideAny(x, z), `${f}: ${x}, ${z}`);
    }
  }
  assert.ok(seen > 100);
});

test('the complex in Node: every vertex finite, six meshes, the piers\' colliders; the phone\'s plain skins', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildHardRockHotel, ATLAS } = await import('../js/hard-rock-hotel.js');
  const { QUALITY } = await import('../js/quality.js');
  // the atlas' cells inside it, none overlapping
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 512 && y + h <= 256);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'atlas cells apart');
    }
  }
  for (const simple of [false, true]) {
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildHardRockHotel(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name).sort();
    assert.deepEqual(names, ['Hard Rock Hotel decal', 'Hard Rock Hotel glass', 'Hard Rock Hotel modern', 'Hard Rock Hotel old', 'Hard Rock Hotel roof', 'Hard Rock Hotel trim']);
    for (const m of group.children) {
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > H.base - 3 && p.array[i] < 22, `${m.name}: a height of ${p.array[i]}`);
      // (the phone: no procedural shader but the decal's; SIMPLE_SKINS set no roughness node)
      if (simple) assert.ok(!m.material.roughnessNode && !m.material.normalNode, `${m.name}: a plain skin on the phone`);
    }
    // the piers standing out on the square: thin boxes at world heights, outside every volume
    assert.ok(colliders.length >= 6);
    for (const c of colliders) {
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
      assert.ok(c.maxY > c.baseY + 3 && c.obb.hx < 0.5 && c.obb.hz < 0.5);
      assert.ok(!H.parts.some((p) => pointInRing(p.ring, c.obb.cx, c.obb.cz)));
    }
  }
});
