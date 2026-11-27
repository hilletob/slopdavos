import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TINZENBLICK, clearStretches, curveLength, curvePieces, curvePoint, curveSegments, footY, onCurve, onWall, outwardRing, partAt, pointInRing,
  ringArea2, stackPosts, stackRanges, wallFrame, wallStretches
} from '../js/tinzenblick-data.js';

const T = TINZENBLICK;
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the ring? */
const isWall = (ring, a, b) => ring.some((q, i) => { const r = ring[(i + 1) % ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });

test('the Tinzenblick\'s volumes: outlines of some size, four floors under the roof, the entrance under them', () => {
  assert.ok(Math.abs(ringArea2(T.house.ring)) / 2 > 600, 'the house');
  assert.ok(Math.abs(ringArea2(T.entrance.ring)) / 2 > 40, 'the entrance');
  // the floors add up: the ground floor's foot on the round side's ground in the south-west (−23.6), the top floor's
  // top under the roof, a parapet's height between
  assert.ok(Math.abs(footY() + T.floors * T.storey - T.house.line) < 1e-9);
  assert.ok(footY() > -24 && footY() < -22.8, `the ground floor at ${footY()}`);
  assert.ok(T.house.top > T.house.line && T.house.top - T.house.line < 1.6);
  assert.ok(T.base < -25.2, 'the walls reach under the ground of the round side');
  // the entrance's roof a floor over the slope's ground, under the first floor's windows
  assert.ok(T.entrance.top > footY() + T.storey && T.entrance.top < footY() + 2 * T.storey);
  // the entrance fills the notch: every point of its outline lies on the house's
  for (const q of T.entrance.ring) assert.ok(T.house.ring.some((r) => near(q, r)));
  assert.ok(isWall(T.entrance.ring, T.entrance.front.a, T.entrance.front.b) && !isWall(T.house.ring, T.entrance.front.a, T.entrance.front.b));
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const [id, r] of [['house', T.house.ring], ['entrance', T.entrance.ring]]) {
    const ring = outwardRing(r);
    let out = 0, walls = 0;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 2) continue;
      walls++;
      const [x, z] = onWall(F, F.len / 2, 0.2);
      if (!pointInRing(r, x, z)) out++;
    }
    assert.equal(out, walls, `${id}: ${out} of ${walls} walls face out`);
  }
  // the entrance's front and the wings face the slope (north-north-west, smaller z)
  for (const W of [T.entrance.front, T.westWing, T.eastWing]) {
    const F = wallFrame(W.a, W.b);
    assert.ok(F.n[1] < -0.8 && F.n[0] < -0.4, 'facing north-north-west');
    const [x, z] = onWall(F, F.len / 2, 0.5);
    assert.equal(partAt(x, z), null);
  }
  for (const W of [T.westWing, T.eastWing]) assert.ok(isWall(T.house.ring, W.a, W.b));
});

test('the curve: the round side\'s walls in order, facing the valley, cut at the stacks', () => {
  const C = T.curve;
  for (let i = 0; i + 1 < C.length; i++) assert.ok(isWall(T.house.ring, C[i], C[i + 1]) && onCurve(C[i], C[i + 1]), `segment ${i}`);
  assert.ok(!onCurve(T.westWing.a, T.westWing.b));
  const segs = curveSegments(), L = curveLength();
  assert.ok(L > 60 && L < 66, `the curve's length ${L}`);
  for (const g of segs) {
    const [x, z] = onWall(g.F, g.F.len / 2, 0.3);
    assert.equal(partAt(x, z), null, `segment ${g.i} faces out`);
  }
  // the points along it lie on the outline's walls; out of it, off the house (a corner's mitre too)
  for (let a = 0; a <= L; a += 0.7) {
    assert.equal(partAt(...curvePoint(a, 0.4)), null, `${a} m along`);
    assert.ok(partAt(...curvePoint(a, -0.4)) === 'house', `${a} m along, inside`);
  }
  // the stacks: inside the curve, apart, the middle one on its middle
  const R = stackRanges();
  assert.equal(R.length, T.stacks.count);
  for (let k = 0; k < R.length; k++) {
    assert.ok(R[k].from >= 0 && R[k].to <= L + 1e-9 && R[k].to - R[k].from > 5);
    if (k) assert.ok(R[k].from > R[k - 1].to + 5, 'a stretch of windows between two stacks');
  }
  assert.ok(Math.abs((R[2].from + R[2].to) / 2 - L / 2) < 1e-9);
  // the pieces cover the curve once, door pieces exactly the stacks
  const P = curvePieces();
  const total = P.reduce((n, p) => n + p.s1 - p.s0, 0), doors = P.filter((p) => p.door).reduce((n, p) => n + p.s1 - p.s0, 0);
  assert.ok(Math.abs(total - L) < 1e-6);
  assert.ok(Math.abs(doors - R.reduce((n, r) => n + r.to - r.from, 0)) < 1e-6);
  for (const p of P) assert.ok(p.s0 >= -1e-9 && p.s1 <= p.F.len + 1e-9 && p.s1 > p.s0);
});

test('the name and the stairs on the wings, on stretches kept free of windows', () => {
  const W = wallFrame(T.westWing.a, T.westWing.b), n = T.name;
  assert.ok(n.s0 >= n.clear[0] && n.s1 <= n.clear[1] && n.clear[1] <= W.len);
  assert.ok(Math.abs((n.s1 - n.s0) / (n.y1 - n.y0) - 1024 / 384) < 0.1, 'the atlas cell\'s proportions');
  // between the top floor's windows and the next floor's
  assert.ok(n.y0 > footY() + 2 * T.storey + 1.9 && n.y1 < T.house.line);
  const st = wallStretches(T.westWing.a, T.westWing.b);
  assert.ok(st.some((s) => !s.windows && s.from <= n.s0 && s.to >= n.s1));
  // either way round, the same stretches
  const len = W.len, back = clearStretches(T.westWing.b, T.westWing.a);
  assert.deepEqual(back.map(([p, q]) => [+(len - q).toFixed(6), +(len - p).toFixed(6)]).reverse(), clearStretches(T.westWing.a, T.westWing.b).map(([p, q]) => [+p.toFixed(6), +q.toFixed(6)]));
  for (const [Wg, s] of [[T.westWing, T.stairs.west], [T.eastWing, T.stairs.east]]) {
    const F = wallFrame(Wg.a, Wg.b);
    assert.ok(s - T.stairs.half > 0.3 && s + T.stairs.half < F.len - 0.3);
    assert.ok(wallStretches(Wg.a, Wg.b).some((q) => !q.windows && q.from <= s - T.stairs.half && q.to >= s + T.stairs.half));
  }
  // stretches in order, covering the wall
  for (const Wg of [T.westWing, T.eastWing]) {
    const S = wallStretches(Wg.a, Wg.b), F = wallFrame(Wg.a, Wg.b);
    assert.ok(Math.abs(S[0].from) < 1e-9 && Math.abs(S[S.length - 1].to - F.len) < 1e-9);
    for (let i = 1; i < S.length; i++) assert.ok(Math.abs(S[i].from - S[i - 1].to) < 1e-9);
  }
});

test('the posts stand out of the house, on the ground before the stacks; no mission\'s spot lies on the house', () => {
  const posts = stackPosts();
  assert.equal(posts.length, 3 * T.stacks.count);
  for (const [x, z] of posts) assert.equal(partAt(x, z), null);
  // (js/missions-data-*.js: none names the house; no spot of theirs lies in it or by a post)
  const dir = new URL('../js/', import.meta.url);
  let spots = 0;
  for (const f of fs.readdirSync(dir).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!src.includes(T.osm) && !/Tinzenblick/i.test(src), f);
    for (const m of src.matchAll(/x:\s*(-?\d+(?:\.\d+)?),\s*z:\s*(-?\d+(?:\.\d+)?)/g)) {
      const x = +m[1], z = +m[2];
      spots++;
      assert.equal(partAt(x, z), null, `${f}: ${x}, ${z}`);
      for (const [px, pz] of posts) assert.ok(Math.hypot(px - x, pz - z) > 1, `${f}: ${x}, ${z} by a post`);
    }
  }
  assert.ok(spots > 50);
});

async function build(simple) {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const was = QUALITY.simpleMaterials;
  QUALITY.simpleMaterials = simple;
  try {
    const { buildTinzenblick } = await import('../js/tinzenblick.js');
    const scene = new THREE.Scene();
    return { scene, ...buildTinzenblick(scene) };
  } finally { QUALITY.simpleMaterials = was; }
}

test('the building in Node: every vertex finite and near the house, six meshes, the posts as colliders', async () => {
  const { group, colliders } = await build(false);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Tinzenblick clad', 'Tinzenblick decal', 'Tinzenblick glass', 'Tinzenblick plaster', 'Tinzenblick roof', 'Tinzenblick trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 0; i < p.array.length; i += 3) {
      assert.ok(p.array[i + 1] >= T.base - 0.01 && p.array[i + 1] < T.house.top + 2, `${m.name}: a height of ${p.array[i + 1]}`);
      assert.ok(p.array[i] > -499 && p.array[i] < -453 && p.array[i + 2] > 309 && p.array[i + 2] < 348, `${m.name}: a point at ${p.array[i]}, ${p.array[i + 2]}`);
    }
    if (/plaster|clad/.test(m.name)) assert.ok(m.geometry.attributes.aHalf);
  }
  assert.equal(colliders.length, stackPosts().length);
  for (const c of colliders) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > c.minY + 8 && c.baseY === c.minY && c.obb);
  }
  // the player's walls on the surveyed outlines
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(T.osm), [T.house.ring, T.entrance.ring]);
});

test('the phone\'s profile: SIMPLE_SKINS and the decal only', async () => {
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { scene } = await build(true);
  const mats = new Set();
  scene.traverse((o) => { if (o.isMesh) mats.add(o.material); });
  for (const m of mats) {
    const decal = m.opacityNode && m.transparent && !m.emissiveNode && !m.roughnessNode;
    const plain = !m.roughnessNode && !m.normalNode && !m.positionNode && !m.metalnessNode;
    assert.ok(decal || plain, `${m.name || m.type}: no full shader on the phone`);
  }
  assert.ok(SIMPLE_SKINS);
});
