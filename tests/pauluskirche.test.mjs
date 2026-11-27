import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PAULUSKIRCHE, apseRing, apseWindows, groundOutlines, inNave, naveRing, onWall, pointInRing, ringArea2, roofAt, toLocal, toWorld, towerRing,
  turretRing, wallAt, wallFrame, walls, windowList, worldFrame
} from '../js/pauluskirche-data.js';
import { groundHeight } from '../js/terrain.js';

// OpenStreetMap's footprint (w97292342) and its neighbours round the church
const OSM = [[-783.5, 543.9], [-780.7, 545.6], [-778.8, 542.6], [-774.1, 545.6], [-775.9, 548.5], [-774.5, 549.3], [-784.6, 564.9], [-785.5, 564.3],
  [-786.5, 565], [-788.1, 565.2], [-789.8, 564.9], [-791.1, 563.3], [-791.6, 562], [-791.5, 560.5], [-793, 559.2]];
const NEIGHBOURS = [
  [[-809.1, 508], [-806.7, 509.6], [-792.8, 518.9], [-789.6, 521.1], [-800.6, 537.4], [-820.1, 524.3]],
  [[-819.8, 531.4], [-807.2, 537.9], [-812, 547.1], [-824.6, 540.6]],
  [[-763.8, 575.2], [-783.8, 597.9], [-795.1, 588], [-775.1, 565.3]],
  [[-792.8, 518.9], [-806.7, 509.6], [-793, 489.3], [-779.1, 498.6]]
];
const distToRing = (ring, x, z) => Math.min(...ring.map((q, i) => {
  const F = wallFrame(q, ring[(i + 1) % ring.length]), u = Math.max(0, Math.min(F.len, (x - q[0]) * F.u[0] + (z - q[1]) * F.u[1]));
  const [px, pz] = onWall(F, u);
  return Math.hypot(x - px, z - pz);
}));
const inChurch = (x, z) => groundOutlines().some((r) => pointInRing(r, x, z));

test('the church\'s frame: world and church coordinates round trip, the axis runs to the south-west', () => {
  for (const q of [[0, 0], [17.15, 0.15], [-2.85, 2.0], [14.8, -6.05]]) {
    const [s, t] = toLocal(toWorld(q));
    assert.ok(Math.abs(s - q[0]) < 1e-9 && Math.abs(t - q[1]) < 1e-9);
  }
  // s grows to the south-west (bigger z, smaller x), t to the west-north-west
  const o = toWorld([0, 0]), s1 = toWorld([1, 0]), t1 = toWorld([0, 1]);
  assert.ok(s1[1] > o[1] + 0.8 && s1[0] < o[0] - 0.5);
  assert.ok(t1[0] < o[0] - 0.8 && t1[1] < o[1] - 0.5);
  // the survey's corners lie on the outlines: the nave's walls at the ground, the tower's corners, the apse's tip
  for (const [x, z] of [[-775.2, 549.2], [-782.2, 560.1], [-792.1, 557.8], [-785.1, 544.9], [-783.7, 542.7], [-788.1, 565.1], [-792.6, 561.2]]) {
    const d = Math.min(...groundOutlines().map((r) => distToRing(r, x, z)));
    assert.ok(d < 0.45, `${x}, ${z}: ${d.toFixed(2)} m off the outlines`);
  }
});

test('the volumes: outlines of some size, walls facing out, the surveyed heights', () => {
  for (const ring of [naveRing(), apseRing(), towerRing(), turretRing()]) assert.ok(Math.abs(ringArea2(ring)) / 2 > 5);
  for (const w of walls()) {
    const [s, t] = onWall(w.F, w.F.len / 2, 0.2);
    const own = { nave: naveRing(), tower: towerRing(), turret: turretRing(), apse: apseRing() }[w.part];
    if (own) assert.ok(!pointInRing(own, s, t), `${w.id}: faces out`);
    for (const k of [0, 0.5, 1]) {
      const y = w.top(w.F.len * k);
      assert.ok(Number.isFinite(y) && y > PAULUSKIRCHE.base + 3 && y < 16, `${w.id}: a top at ${y}`);
    }
  }
  // the survey: the ridge 9.3, the eaves 2.1–2.2, the walls' tops 3.3–3.5; the apse's drum 1.9 and apex 4.7, its
  // ledge −3.6; the tower's top 15.7, its gables 17.1, the spire's tip 23.8
  const N = PAULUSKIRCHE.nave;
  assert.ok(Math.abs(roofAt(5, N.ridge) - 9.3) < 1e-9);
  for (const t of [N.east - N.eaves, N.west + N.eaves]) assert.ok(Math.abs(roofAt(5, t) - 2.15) < 0.1, `the eaves at ${roofAt(5, t)}`);
  for (const t of [N.east, N.west]) assert.ok(Math.abs(roofAt(5, t) - 3.4) < 0.15);
  const A = PAULUSKIRCHE.apse, T = PAULUSKIRCHE.tower;
  assert.ok(A.eaves === 1.9 && A.apex === 4.7 && A.ledge === -3.6);
  assert.ok(T.top === 15.7 && T.gable === 17.1 && T.spire.y1 === 23.8 && T.cross.y1 > T.spire.y1);
  // the tower stands out of the west wall at the entrance gable's corner; its band and openings over the nave's roof
  const ring = towerRing();
  assert.ok(ring.some(([s, t]) => inNave(s, t)) && ring.some(([s, t]) => !inNave(s, t)));
  assert.ok(T.oculus.y - T.oculus.half > roofAt(0, T.t0) + 2);
  // the apse beyond the gable, the turret against the east wall
  assert.ok(Math.max(...apseRing().map(([s]) => s)) > N.s1 + 3);
  const R = PAULUSKIRCHE.turret;
  assert.ok(Math.abs(R.centre[1] + R.r - N.east) < 0.1);
});

test('the windows and the painted openings lie on outer walls, under their tops, over the ground, apart', () => {
  const list = walls();
  const things = [];
  for (const w of [...windowList(), ...apseWindows()]) {
    const W = wallAt(w.at, list);
    assert.ok(W, `${w.at}: on a wall`);
    assert.ok(W.s - w.half > 0.2 && W.s + w.half < W.wall.F.len - 0.2, `${w.at}: within its wall`);
    const top = Math.min(...[-w.half, 0, w.half].map((u) => W.wall.top(W.s + u)));
    assert.ok(w.sill + w.h < top - 0.6, `${w.at}: under the wall's top`);
    const F = worldFrame(W.wall.F);
    let ground = -Infinity;
    for (const u of [-w.half, 0, w.half]) ground = Math.max(ground, groundHeight(...onWall(F, W.s + u, 0.5)));
    assert.ok(w.sill > ground + 1.0, `${w.at}: the sill ${w.sill} over the ground ${ground.toFixed(2)}`);
    things.push({ id: W.wall.id, s: W.s, w: 2 * w.half, y0: w.sill - 0.15, y1: w.sill + w.h });
  }
  for (const o of PAULUSKIRCHE.openings) {
    const W = wallAt(o.at, list);
    assert.ok(W && W.s - o.w / 2 > 0.1 && W.s + o.w / 2 < W.wall.F.len - 0.1, `${o.key}: within its wall`);
    const F = worldFrame(W.wall.F);
    const y0 = o.y ?? Math.max(...[-o.w / 2, 0, o.w / 2].map((u) => groundHeight(...onWall(F, W.s + u, 0.5)))) + o.ground;
    assert.ok(y0 + o.h < Math.min(W.wall.top(W.s - o.w / 2), W.wall.top(W.s + o.w / 2), W.wall.top(W.s)) - 0.2, `${o.key}: under the top`);
    things.push({ id: W.wall.id, s: W.s, w: o.w, y0, y1: y0 + o.h });
  }
  for (const b of PAULUSKIRCHE.buttresses) {
    const W = wallAt(b.at, list);
    assert.ok(W && W.wall.part === 'nave', `${b.at}: a buttress on the nave`);
    things.push({ id: W.wall.id, s: W.s, w: 2 * b.half, y0: -Infinity, y1: b.top + 0.12 });
  }
  for (let i = 0; i < things.length; i++) {
    for (let j = i + 1; j < things.length; j++) {
      const a = things[i], b = things[j];
      if (a.id !== b.id) continue;
      const apart = Math.abs(a.s - b.s) > (a.w + b.w) / 2 || a.y1 < b.y0 || b.y1 < a.y0;
      assert.ok(apart, `${a.id}: ${a.s.toFixed(2)} and ${b.s.toFixed(2)} overlap`);
    }
  }
  // the rose over the porch's ridge, on the entrance gable; the doorway on the porch's front
  const rose = PAULUSKIRCHE.openings.find((o) => o.key === 'rose');
  assert.equal(wallAt(rose.at).wall.id, 'entrance');
  assert.ok(rose.y > PAULUSKIRCHE.porch.ridgeY + 0.5);
  assert.equal(wallAt(PAULUSKIRCHE.openings.find((o) => o.key === 'door').at).wall.part, 'porch');
  // nothing stands against the turret
  for (const w of windowList()) {
    const [s, t] = w.at, R = PAULUSKIRCHE.turret;
    if (Math.abs(t - PAULUSKIRCHE.nave.east) < 0.1) assert.ok(Math.abs(s - R.centre[0]) > R.r + w.half || w.sill > R.apex, `${w.at}: behind the turret`);
  }
});

test('the player\'s walls: the outlines within reach of OpenStreetMap\'s footprint, the neighbours apart, the exclusions inside', () => {
  const rings = groundOutlines();
  assert.equal(rings.length, 2);
  rings.forEach((ring, k) => ring.forEach(([x, z]) => {
    assert.ok(Number.isFinite(x) && Number.isFinite(z));
    // (OSM leaves out the stair turret and the tower's step out of the west wall)
    const d = distToRing(OSM, x, z);
    assert.ok(pointInRing(OSM, x, z) || d < (k === 1 ? 3.3 : 1.5), `${x.toFixed(1)}, ${z.toFixed(1)}: ${d.toFixed(2)} m outside OSM's footprint`);
  }));
  for (const e of PAULUSKIRCHE.exclude) assert.ok(inChurch(e.x, e.z), `the exclusion at ${e.x}, ${e.z} inside the church`);
  for (const nb of NEIGHBOURS) {
    for (const [x, z] of nb) assert.ok(!inChurch(x, z));
    for (const ring of rings) for (const [x, z] of ring) {
      assert.ok(!pointInRing(nb, x, z));
      assert.ok(distToRing(nb, x, z) > 5, 'five metres from the neighbours at least');
    }
    for (const e of PAULUSKIRCHE.exclude) for (const [x, z] of nb) assert.ok(Math.hypot(x - e.x, z - e.z) > e.r + 3);
  }
});

test('the missions\' doors near the church stay outside it and reachable', () => {
  const near = [];
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    const src = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/x:\s*(-?\d+(?:\.\d+)?),\s*(?:y:\s*-?\d+(?:\.\d+)?,\s*)?z:\s*(-?\d+(?:\.\d+)?)/g)) {
      const x = +m[1], z = +m[2];
      if (Math.hypot(x + 784.6, z - 556.3) < 60) near.push([f, x, z]);
    }
  }
  for (const [f, x, z] of near) {
    assert.ok(!inChurch(x, z), `${f}: ${x}, ${z} inside the church`);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; assert.ok(!inChurch(x + Math.cos(a), z + Math.sin(a)), `${f}: ${x}, ${z} against the church`); }
  }
});

const stubDocument = () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
};

test('the atlas\' cells do not overlap and fit the canvas', async () => {
  stubDocument();
  const { ATLAS } = await import('../js/pauluskirche.js');
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `cells ${i} and ${j}`);
    }
  }
  for (const o of PAULUSKIRCHE.openings) assert.ok(ATLAS[o.key], `${o.key}: a cell`);
});

for (const simple of [false, true]) {
  test(`the church in Node${simple ? ' (the mobile profile)' : ''}: every vertex finite, five meshes, no colliders of its own`, async () => {
    stubDocument();
    const THREE = await import('three/webgpu');
    const { QUALITY } = await import('../js/quality.js');
    const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
    const { buildPauluskirche } = await import('../js/pauluskirche.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    try {
      const scene = new THREE.Scene();
      const { group, colliders } = buildPauluskirche(scene);
      assert.equal(colliders.length, 0);
      assert.equal(group.userData.terrain, 'absolute');
      assert.equal(SURVEYED_FOOTPRINTS.get(PAULUSKIRCHE.osm).length, 2);
      const names = group.children.map((m) => m.name).sort();
      assert.deepEqual(names, ['Pauluskirche decal', 'Pauluskirche glass', 'Pauluskirche plaster', 'Pauluskirche roof', 'Pauluskirche trim']);
      for (const m of group.children) {
        const p = m.geometry.attributes.position;
        assert.ok(p.count > 0);
        for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
        for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= PAULUSKIRCHE.base - 0.01 && p.array[i] < 25.1, `${m.name}: a height of ${p.array[i]}`);
        if (m.name.endsWith('glass')) assert.ok(m.geometry.attributes.aHalf, 'the glass carries the windows\' half widths');
        // every triangle of the roofs faces up or out (the spire's steep ones too)
        if (m.name.endsWith('roof')) {
          const n = m.geometry.attributes.normal;
          for (let i = 1; i < n.array.length; i += 3) assert.ok(n.array[i] > 0.05 || Math.abs(n.array[i]) < 1e-6, `${m.name}: a normal facing down`);
        }
      }
      // on the phone only SIMPLE_SKINS' materials, the trim and the decals
      if (simple) for (const m of group.children) assert.ok(!m.material.roughnessNode && !m.material.normalNode, `${m.name}: a full shader on the phone`);
    } finally {
      QUALITY.simpleMaterials = was;
    }
  });
}
