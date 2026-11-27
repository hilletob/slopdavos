import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALET, backRing, coverAt, doorAt, groundOutlines, isCafe, loggia, onWall, orielRing, outwardRing, part, pointInRing, ringArea2, sAt, uw, vFrame, wallFrame, wallStretches, windowsFrom, windowsTo } from '../js/schneiders-chalet-data.js';
import { SCHNEIDERS, houseRing } from '../js/schneiders-data.js';
import { POST_ROUTE } from '../js/missions-data-post.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const S = CHALET;
/** The distance from a point to a ring's walls */
function toWalls(ring, x, z) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return d;
}
const osmRing = () => {
  const r = DAVOS_DATA.buildings.find((b) => b.id === S.osm).ring, out = [];
  for (let i = 0; i < r.length; i += 2) out.push([r[i], r[i + 1]]);
  return out;
};

test('the volumes: the surveyed roofs and heights, the block on OSM\'s footprint, the verandas against Schneider\'s', () => {
  // five outlines of some size, the heights as surveyed
  assert.deepEqual(S.parts.map((p) => [p.id, p.top]), [['garden', 2.87], ['terrace', -0.06], ['veranda', 12.28], ['annex-north', -3.53], ['annex-east', -1.22]]);
  for (const p of S.parts) assert.ok(Math.abs(ringArea2(p.ring)) / 2 > 18, p.id);
  // the block stands on OSM's footprint: its corners within 1.2 m of OSM's walls
  const osm = osmRing();
  for (const [x, z] of part('garden').ring) assert.ok(toWalls(osm, x, z) < 1.2 || pointInRing(osm, x, z), `${x} ${z} near OSM's footprint`);
  // the verandas: from Schneider's south-west wall (w 13.3) out to the block's roof edge, along its length, none of it
  // inside Schneider's house
  const V = S.veranda;
  assert.ok(V.w0 >= SCHNEIDERS.walls.w1 && V.w0 - SCHNEIDERS.walls.w1 < 0.1);
  for (const [x, z] of part('veranda').ring) assert.ok(!pointInRing(houseRing(), x, z) && toWalls(houseRing(), x, z) < 0.8 + V.front - V.w0);
  for (const [x, z] of part('veranda').ring) assert.ok(uw(x, z)[1] >= SCHNEIDERS.walls.w1);
  // its outer corners where the block's roof steps (the survey's −476.1 −251.6 and −485.4 −263.3)
  const [, , c, d] = part('veranda').ring;
  assert.ok(Math.hypot(c[0] + 485.4, c[1] + 263.3) < 0.15 && Math.hypot(d[0] + 476.1, d[1] + 251.6) < 0.15);
  // the verandas' roof under Schneider's south-west eaves
  assert.ok(part('veranda').top < SCHNEIDERS.roof.eaveSW - 0.4);
});

test('the walls face outwards and show only where nothing covers them', () => {
  for (const ring of [...groundOutlines(), backRing(), orielRing()]) {
    const r = outwardRing(ring);
    for (let i = 0; i < r.length; i++) {
      const F = wallFrame(r[i], r[(i + 1) % r.length]);
      if (F.len < 1) continue;
      assert.ok(!pointInRing(r, ...onWall(F, F.len / 2, 0.1)), `wall ${i} faces out`);
    }
  }
  // the verandas' wall against Schneider's and the block's walls under the verandas are left out; the winter garden's
  // walls on the lane show from the terrace up
  assert.ok(!wallStretches(part('veranda')).some((st) => pointInRing(houseRing(), ...onWall(st.F, (st.s0 + st.s1) / 2, 0.15))));
  const garden = wallStretches(part('garden'));
  assert.ok(garden.filter((st) => st.from === part('terrace').top).reduce((a, st) => a + st.s1 - st.s0, 0) > 50);
  for (const st of garden) assert.ok(!(st.from >= part('garden').top));
  // a point on the terrace is covered to its top, one on the street is open
  assert.equal(coverAt(-497.0, -246.0), part('terrace').top);
  assert.equal(coverAt(-492.0, -268.0), -Infinity);
});

test('the floors add up: Schneider\'s grid, the windows over the ground and under the roofs', () => {
  const W = S.win;
  assert.equal(S.foot, SCHNEIDERS.foot);
  assert.equal(S.storey, SCHNEIDERS.storey);
  // the verandas' two storeys on Schneider's first and second floors' feet, the second's windows under the roof
  for (const y of S.veranda.floors) assert.ok(Math.abs((y - S.foot) / S.storey - Math.round((y - S.foot) / S.storey)) < 1e-9);
  assert.ok(S.veranda.floors[1] + W.hi < part('veranda').top - S.veranda.beam);
  assert.equal(windowsFrom(S.veranda.floors[0] + 0.1), S.veranda.floors[0]);
  assert.equal(windowsTo(part('veranda').top), part('veranda').top);
  for (let hi = -12; hi < 12; hi += 0.37) {
    const f = windowsFrom(hi);
    assert.ok(f + W.lo >= hi - 1e-9 && f + W.lo - S.storey < hi);
    const t = windowsTo(hi + 3);
    assert.ok(t <= hi + 3 + 1e-9 && t - S.storey + W.hi <= hi + 3 - 0.25 + 1e-9);
  }
  // the tea-room on the Promenade (one floor under the terrace's top), the winter garden over it up to the block's roof
  assert.ok(part('terrace').top - S.street > 3 && part('garden').top - part('terrace').top > 2.6);
  assert.ok(S.terrace.head > S.street + 2.2 && S.terrace.head + 0.17 + S.terrace.name.h < part('terrace').top);
  // the low annex: its windows begin over the ground on the south-east and fit under its roof
  assert.ok(windowsTo(part('annex-north').top) > windowsFrom(-8.2) + 1);
});

test('the verandas: the loggias between the south-east end and the oriel, the posts within them', () => {
  const L = loggia(), V = S.veranda;
  assert.ok(Math.abs(L.F.len - (V.u1 - V.u0)) < 0.05);
  // the front faces away from Schneider's, the lane's way (west, south)
  assert.ok(L.F.n[0] < -0.5 && L.F.n[1] > 0.5);
  assert.ok(L.s1 - L.s0 > 11 && L.oriel[1] - L.oriel[0] > 2 && (Math.abs(L.oriel[0] - L.s1) < 1e-6 || Math.abs(L.oriel[1] - L.s0) < 1e-6));
  // the oriel at the north-west end (towards the Promenade)
  const [x, z] = onWall(L.F, (L.oriel[0] + L.oriel[1]) / 2);
  assert.ok(uw(x, z)[0] > V.oriel);
  const se = sAt(L.F, V.u0), dir = Math.sign(sAt(L.F, V.oriel) - se);
  const posts = V.posts.map((d) => se + dir * d);
  assert.ok(posts.every((s) => s >= L.s0 - 0.01 && s <= L.s1 + 0.01));
  // the back wall behind the loggias, the oriel out to the front
  assert.ok(vFrame(V.back).n[0] < -0.5 && V.front - V.back > 1.2);
  assert.ok(Math.abs(ringArea2(orielRing())) / 2 > 4 && Math.abs(ringArea2(backRing())) / 2 > 10);
});

test('the terrace: the tea-room\'s front on the Promenade, stone walls down the slope, the door towards Schneider\'s', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const st = wallStretches(part('terrace')).map((x) => {
    let lo = Infinity;
    for (let s = x.s0; s <= x.s1 + 1e-6; s += Math.max(0.1, (x.s1 - x.s0) / 8)) lo = Math.min(lo, groundHeight(...onWall(x.F, s, 0.5)));
    return { ...x, lo };
  });
  const cafe = st.filter((x) => isCafe(x.lo)), stone = st.filter((x) => !isCafe(x.lo));
  // the front on the Promenade (facing north-west, about 20 m) is the tea-room's; the walls on the south-east stone
  const front = cafe.reduce((a, b) => (b.s1 - b.s0 > a.s1 - a.s0 ? b : a));
  assert.ok(front.s1 - front.s0 > 18 && front.F.n[0] < -0.5 && front.F.n[1] < -0.5);
  assert.ok(stone.some((x) => x.F.n[1] > 0.5 && x.s1 - x.s0 > 20));
  // the door 1.7 m in from the end by Schneider's
  const dc = doorAt(front.F, front.s0, front.s1), [x, z] = onWall(front.F, dc);
  assert.ok(Math.hypot(x + 485.6, z + 265.1) < 2.5);
});

test('the post van\'s way along the Promenade (js/missions-data-post.js) passes clear of every part and the canopy', () => {
  let best = Infinity;
  for (let i = 0; i + 3 < POST_ROUTE.length; i += 2) {
    const a = [POST_ROUTE[i], POST_ROUTE[i + 1]], b = [POST_ROUTE[i + 2], POST_ROUTE[i + 3]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.5));
    if (Math.min(Math.hypot(a[0] + 485, a[1] + 252), Math.hypot(b[0] + 485, b[1] + 252)) > L + 40) continue;
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
      for (const ring of groundOutlines()) {
        assert.ok(!pointInRing(ring, x, z));
        best = Math.min(best, toWalls(ring, x, z));
      }
    }
  }
  assert.ok(best > S.terrace.canopy + 2, `the van passes ${best.toFixed(2)} m from a wall`);
});

async function stubCanvas() {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
}

test('the building in Node: every vertex finite, six meshes, no colliders of its own, the outlines registered', async () => {
  await stubCanvas();
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { buildSchneidersChalet, ATLAS } = await import('../js/schneiders-chalet.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(S.osm), groundOutlines());
  assert.ok(SHOP_EXCLUSIONS.has(S.shop));
  // the atlas' cells inside it (1024 × 512), not overlapping
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `cells ${i} and ${j}`);
    }
  }
  const scene = new THREE.Scene();
  const { group, colliders } = buildSchneidersChalet(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Schneiders chalet decal', 'Schneiders chalet glass', 'Schneiders chalet plaster', 'Schneiders chalet roof', 'Schneiders chalet stone', 'Schneiders chalet trim']);
  const all = groundOutlines();
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > S.base - 0.01 && p.array[i] < 12.5, `${m.name}: a height of ${p.array[i]}`);
    // everything on or within 1.6 m of a part (the canopy, the awning, the coping)
    for (let i = 0; i < p.array.length; i += 3) {
      const x = p.array[i], z = p.array[i + 2];
      assert.ok(all.some((r) => pointInRing(r, x, z) || toWalls(r, x, z) < 1.6), `${m.name}: a corner at ${x.toFixed(1)} ${z.toFixed(1)}`);
      // and nothing inside Schneider's house (the east annex's surveyed corner touches its east corner: 0.3 m)
      assert.ok(!pointInRing(houseRing(), x, z) || toWalls(houseRing(), x, z) < 0.35, `${m.name}: inside Schneider's at ${x.toFixed(1)} ${z.toFixed(1)}`);
    }
  }
  // the walls carry their half lengths, the roofs reach the verandas' top
  assert.ok(group.children.find((m) => m.name === 'Schneiders chalet plaster').geometry.attributes.aHalf);
  const roof = group.children.find((m) => m.name === 'Schneiders chalet roof').geometry.attributes.position.array;
  let top = -Infinity;
  for (let i = 1; i < roof.length; i += 3) top = Math.max(top, roof[i]);
  assert.ok(Math.abs(top - part('veranda').top) < 0.05);
});

test('the phone\'s build: only SIMPLE_SKINS\' materials, the trim and the decals', async () => {
  await stubCanvas();
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { buildSchneidersChalet } = await import('../js/schneiders-chalet.js');
  const saved = { ...SIMPLE_SKINS }, was = QUALITY.simpleMaterials;
  for (const k of Object.keys(saved)) SIMPLE_SKINS[k] = (...a) => { const m = saved[k](...a); m.userData.simpleSkin = k; return m; };
  QUALITY.simpleMaterials = true;
  try {
    const { group } = buildSchneidersChalet(new THREE.Scene());
    for (const m of group.children) {
      const mat = m.material;
      const decal = mat.opacityNode && mat.transparent && !mat.emissiveNode && !mat.roughnessNode;
      const procedural = mat.colorNode || mat.emissiveNode || mat.roughnessNode || mat.normalNode || mat.positionNode;
      assert.ok(mat.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
    }
  } finally {
    Object.assign(SIMPLE_SKINS, saved);
    QUALITY.simpleMaterials = was;
  }
});
