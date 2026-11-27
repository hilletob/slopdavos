import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROMENADE_MANSARD as P, arcadeFrames, arcadeGround, arches, coveredTo, edgeFrame, groundOutlines, insetEdges, mansardRings, onWall, outwardIndex,
  outwardRing, part, partAt, pointInRing, ringArea2, wallFrame, windowLayout
} from '../js/promenade-mansard-data.js';
import { selfCrosses } from '../js/seehof-data.js';
import { BRISTOL } from '../js/bristol-data.js';

const near = (p, q, e = 0.06) => Math.hypot(p[0] - q[0], p[1] - q[1]) < e;
const onFloor = (y) => Math.abs((y - P.floor1) / P.storey - Math.round((y - P.floor1) / P.storey)) < 1e-9;

test('the volumes: outlines of some size, the floors adding up to the eaves, the windows ending on a floor', () => {
  for (const p of P.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 3, `${p.id}: an outline of some size`);
    assert.ok(p.top > P.base + 8, `${p.id}: its roof over the base`);
    assert.ok(!selfCrosses(p.ring), `${p.id}: a simple outline`);
    if (p.id === 'arcade') continue;
    assert.ok(onFloor(p.line) && onFloor(p.windowsTo), `${p.id}: on the floors' grid`);
    assert.ok(p.windowsTo <= p.top + 1e-9 && p.top - p.windowsTo < P.storey, `${p.id}: windows up to its last floor`);
  }
  // the ground floor up to the low wing's roof, three floors to the eaves; the survey's heights
  assert.ok(Math.abs(P.floor1 - part('arcade').top) < 0.05);
  assert.ok(Math.abs(P.floor1 + 3 * P.storey - P.eave) < 1e-9);
  assert.ok(P.street < P.band.spring && P.band.spring < P.band.top && P.band.top < part('arcade').top);
  assert.deepEqual(P.parts.map((p) => p.top), [11.21, 27.86, 23.9, 30.06, 24.35, 24.35, 27.13]);
  // the risalit rises through the eaves, under the mansard's break
  assert.ok(part('risalit').top > P.eave + P.storey && part('risalit').top < part('block').mansard.brk);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const ring of [...P.parts.map((p) => p.ring), ...groundOutlines()]) {
    const R = outwardRing(ring);
    let out = 0, walls = 0;
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1) continue;
      walls++;
      if (!pointInRing(ring, ...onWall(F, F.len / 2, 0.2))) out++;
    }
    assert.equal(out, walls);
  }
});

test('the mansard: its slopes on the north, east and west walls, the moved outlines simple and inside the block', () => {
  const b = part('block'), M = mansardRings(), m = b.mansard;
  assert.ok(P.eave < m.brk && m.brk < b.top && m.d1 < m.d2);
  for (const k of m.slope) {
    const i = outwardIndex(b.ring, k), F = wallFrame(M.R[i], M.R[(i + 1) % M.R.length]);
    assert.ok(F.n[1] < 0.3, `wall ${k} faces the street or the north (${F.n})`);
    assert.ok(near(F.a, b.ring[(k + 1) % b.ring.length]) || near(F.a, b.ring[k]));
  }
  for (const I of [M.I1, M.I2]) {
    assert.equal(I.length, M.R.length);
    assert.ok(!selfCrosses(I), 'a simple outline');
    assert.ok(Math.abs(ringArea2(I)) / 2 > 40);
    for (const q of I) assert.ok(pointInRing(b.ring, q[0], q[1]) || b.ring.some((r) => near(r, q, 0.01)) || M.R.some((r, i) => {
      const F = wallFrame(r, M.R[(i + 1) % M.R.length]), d = (q[0] - r[0]) * F.u[0] + (q[1] - r[1]) * F.u[1];
      return d >= -0.01 && d <= F.len + 0.01 && Math.abs((q[0] - r[0]) * F.n[0] + (q[1] - r[1]) * F.n[1]) < 0.01;
    }), `${q} inside the block`);
  }
  // a wall that stays (inset 0) keeps its corners; a moved one is moved by its inset
  const R = [[0, 0], [10, 0], [10, 10], [0, 10]].reverse();
  const I = insetEdges(outwardRing(R), [1, 1, 1, 1]);
  for (const q of I) assert.ok(Math.abs(Math.abs(q[0] - 5) - 4) < 1e-9 && Math.abs(Math.abs(q[1] - 5) - 4) < 1e-9);
});

test('the dormers sit on the mansard\'s walls, clear of their corners and of the risalit', () => {
  const b = part('block'), M = mansardRings(), D = P.dormers;
  const frame = (k) => { const i = outwardIndex(b.ring, k); return wallFrame(M.R[i], M.R[(i + 1) % M.R.length]); };
  const r = part('risalit'), front = edgeFrame(r.ring, [495.8, -908.5], [500.7, -907.1]);
  const e0 = frame(0);
  const rs = r.ring.map((q) => (q[0] - e0.a[0]) * e0.u[0] + (q[1] - e0.a[1]) * e0.u[1]);
  for (const [k, s] of D.lower) {
    assert.ok(b.mansard.slope.includes(k));
    const F = frame(k);
    assert.ok(s - D.half > 0.9 && s + D.half < F.len - 0.9, `wall ${k} at ${s}`);
    if (k === 0) assert.ok(s + D.half < Math.min(...rs) - 0.4 || s - D.half > Math.max(...rs) + 0.4, `clear of the risalit at ${s}`);
  }
  for (const [k, s] of D.upper) assert.ok(s - D.upperHalf > 2 && s + D.upperHalf < frame(k).len - 2);
  // on the steep slope: the dormers' fronts before it at their foot, their backs behind it at their top
  const m = b.mansard, slopeAt = (y) => -(m.d1 * (y - P.eave)) / (m.brk - P.eave);
  assert.ok(D.front > slopeAt(D.from) && D.back < slopeAt(D.to + D.half * 0.75));
  assert.ok(D.from > P.eave + 0.3 && D.to + D.half < m.brk && D.upperFrom > m.brk && D.upperTo + D.upperHalf < b.top);
  // the risalit's front faces north, 0.8–0.9 m before the block's front
  assert.ok(front.n[1] < -0.9);
  const proud = (front.a[0] - e0.a[0]) * e0.n[0] + (front.a[1] - e0.a[1]) * e0.n[1];
  assert.ok(proud > 0.75 && proud < 0.95, `proud ${proud}`);
});

test('the windows: centred or paired on a wall, all of them within it', () => {
  for (const len of [0.8, 2.0, 3.1, 4.4, 5.1, 7.48, 12.35, 20]) {
    const L = windowLayout(len);
    for (const s of L.at) assert.ok(s - P.win.half - 0.4 > -1e-9 && s + P.win.half + 0.4 < len + 1e-9, `${len}: ${s}`);
    for (let k = 1; k < L.at.length; k++) assert.ok(Math.abs(L.at[k] - L.at[k - 1] - P.bay) < 1e-9);
  }
  assert.equal(windowLayout(0.8).count, 0);
  // the risalit's front: a pair either side of its middle
  const front = edgeFrame(part('risalit').ring, [495.8, -908.5], [500.7, -907.1]);
  assert.deepEqual([windowLayout(front.len).even, windowLayout(front.len).count], [true, 2]);
});

test('the arcade: its shops\' fronts the walls at the ground, the pavement under it open, the pillars on its front', () => {
  const A = P.arcade, { east: E, north: N } = arcadeFrames();
  assert.ok(E.n[0] > 0.9, 'the arcade faces the Promenade (east)');
  assert.ok(E.a[1] > onWall(E, E.len)[1], 'its frame runs from its south end');
  assert.ok(N.n[1] < -0.9 && near(N.a, A.b), 'its north end faces north');
  const G = arcadeGround();
  assert.equal(G.length, part('arcade').ring.length);
  const row = arches(E.len, A.n, A.pillar);
  assert.equal(row.pillars.length, A.n + 1);
  assert.ok(row.open > 1.6 && row.open < 2.6 && Math.abs(row.pillars[A.n][1] - E.len) < 1e-9);
  for (const [s0, s1] of row.openings) {
    // under every arch, a metre in from its front: outside every ground outline, inside the survey's
    const q = onWall(E, (s0 + s1) / 2, -1.0);
    assert.ok(groundOutlines().every((r) => !pointInRing(r, q[0], q[1])), 'open under the arch');
    assert.ok(pointInRing(part('arcade').ring, q[0], q[1]));
    // and 0.3 m behind the shops' fronts the house
    const w = onWall(E, (s0 + s1) / 2, -A.depth - 0.3);
    assert.ok(pointInRing(G, w[0], w[1]));
  }
  // the north end opens in its arch
  const q = onWall(N, (A.band + A.depth) / 2, -0.3);
  assert.ok(groundOutlines().every((r) => !pointInRing(r, q[0], q[1])));
  // finnis.ch's board over the southern arch, the boards on their walls
  const [o0, o1] = row.openings[P.boards.finnis.bay];
  assert.ok(onWall(E, (o0 + o1) / 2)[1] > onWall(E, E.len / 2)[1], 'the southern arch');
  assert.ok(o1 - o0 > P.boards.finnis.w - 0.2 && P.boards.finnis.y0 > P.band.spring + row.open / 2 && P.boards.finnis.y1 < P.band.top);
  const bumpN = edgeFrame(part('arcade').ring, P.bump.north.a, P.bump.north.b), bumpE = edgeFrame(part('arcade').ring, P.bump.east.a, P.bump.east.b);
  assert.ok(bumpN.n[1] < -0.9 && bumpE.n[0] > 0.9);
  for (const [b, F] of [[P.boards.parking, bumpN], [P.boards.freestyle, bumpE]]) {
    assert.ok(b.s - b.w / 2 > 0.3 && b.s + b.w / 2 < F.len - 0.3 && b.y0 > P.street + 1.5 && b.y1 < P.band.top);
  }
  // the blind arches stand on walls of their parts along the Promenade
  for (const bl of P.blind) {
    const F = edgeFrame(part(bl.part).ring, bl.a, bl.b);
    assert.ok(F && F.n[0] > 0.9, bl.part);
    assert.ok(arches(F.len, bl.n).open > 1.4);
  }
});

test('the parts cover each other where they meet: the low wing hides the block\'s ground floor, the west block its wall', () => {
  const b = part('block'), R = outwardRing(b.ring);
  const F0 = wallFrame(R[outwardIndex(b.ring, 0)], R[(outwardIndex(b.ring, 0) + 1) % R.length]);
  assert.ok(Math.abs(coveredTo(b, F0) - part('arcade').top) < 1e-9);
  const i = outwardIndex(b.ring, 14), F = wallFrame(R[i], R[(i + 1) % R.length]);
  assert.equal(coveredTo(b, F), part('west').top);
  // the east front: not covered (the Promenade)
  const i1 = outwardIndex(b.ring, 1);
  assert.equal(coveredTo(b, wallFrame(R[i1], R[(i1 + 1) % R.length])), -Infinity);
  assert.equal(partAt(490, -902.5).id, 'west');
  assert.equal(partAt(500, -915).id, 'arcade');
});

test('the Bristol next door: no overlap, the lane to its garage gate open', () => {
  for (const p of P.parts) {
    for (const q of p.ring) for (const bp of BRISTOL.parts) assert.ok(!pointInRing(bp.ring, q[0], q[1]), `${p.id} ${q}`);
    for (const bp of BRISTOL.parts) for (const q of bp.ring) assert.ok(!pointInRing(p.ring, q[0], q[1]), `${bp.id} ${q}`);
  }
  const G = BRISTOL.gate, F = wallFrame(G.a, G.b);
  const n = F.n[1] < 0 ? 1 : -1; // (out of the Bristol's podium, north into the lane)
  for (const out of [0.5, 1.5, 3, 4.5]) {
    const q = onWall(F, G.s, out * n);
    assert.equal(partAt(q[0], q[1]), null, `before the gate, ${out} m`);
  }
  // the lane from the gate east to the Promenade
  for (let x = 482; x <= 508; x += 1) assert.equal(partAt(x, -888.4), null, `the lane at ${x}`);
});

test('no mission\'s door or spot stands in the house or on the arcade\'s pillars', async () => {
  const files = fs.readdirSync(new URL('../js/', import.meta.url)).filter((f) => /^missions-data-.*\.js$/.test(f));
  const spots = [];
  const walk = (v, depth = 0) => {
    if (!v || typeof v !== 'object' || depth > 6) return;
    if (Number.isFinite(v.x) && Number.isFinite(v.z)) spots.push(v);
    for (const w of Array.isArray(v) ? v : Object.values(v)) walk(w, depth + 1);
  };
  for (const f of files) {
    const m = await import(`../js/${f}`);
    for (const v of Object.values(m)) walk(v);
  }
  assert.ok(spots.length > 50);
  const nearby = spots.filter((s) => Math.hypot(s.x - 496, s.z + 906) < 25);
  for (const s of nearby) assert.equal(partAt(s.x, s.z), null, `${JSON.stringify(s).slice(0, 80)}`);
});

const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };

test('the house in Node: every vertex finite, five meshes, the pillars\' colliders, its outlines and the shops registered', async () => {
  const THREE = await import('three/webgpu');
  const { buildPromenadeMansard } = await import('../js/promenade-mansard.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { group, colliders } = buildPromenadeMansard(new THREE.Scene());
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name.replace('Promenade mansard house ', '')).sort();
  assert.deepEqual(names, ['decal', 'glass', 'plaster', 'roof', 'trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= P.base - 0.01 && p.array[i] < 30.3, `${m.name}: a height of ${p.array[i]}`);
  }
  assert.equal(colliders.length, P.arcade.n + 1);
  for (const c of colliders) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > c.baseY + 7 && Math.abs(c.obb.cs ** 2 + c.obb.sn ** 2 - 1) < 1e-9);
    // (out of the ground outlines, in the survey's)
    assert.ok(groundOutlines().every((r) => !pointInRing(r, c.obb.cx, c.obb.cz)));
    assert.ok(pointInRing(part('arcade').ring, c.obb.cx, c.obb.cz));
  }
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(P.osm), groundOutlines());
  for (const id of P.shops) assert.ok(SHOP_EXCLUSIONS.has(id));
});

test('the phone\'s profile: only the simple skins, the trim\'s vertex colours and the decal', async () => {
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { buildPromenadeMansard } = await import('../js/promenade-mansard.js');
  const saved = { ...SIMPLE_SKINS }, was = QUALITY.simpleMaterials;
  for (const k of Object.keys(SIMPLE_SKINS)) SIMPLE_SKINS[k] = (...a) => { const m = saved[k](...a); m.userData.simpleSkin = k; return m; };
  QUALITY.simpleMaterials = true;
  try {
    const { group } = buildPromenadeMansard(new THREE.Scene());
    for (const m of group.children) {
      const mat = m.material, decal = mat.opacityNode && mat.transparent && !mat.emissiveNode && !mat.roughnessNode;
      const procedural = mat.colorNode || mat.emissiveNode || mat.roughnessNode || mat.normalNode || mat.positionNode;
      assert.ok(mat.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
    }
  } finally {
    Object.assign(SIMPLE_SKINS, saved);
    QUALITY.simpleMaterials = was;
  }
});
