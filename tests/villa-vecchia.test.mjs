import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  VILLA_VECCHIA, columnsOf, groundOutlines, innerWall, onWall, outwardRing, part, partAt, pointInRing, ringArea2, roofAt, sAlong, wallFrame,
  wallNamed, wallTopAt, wallsOf, windowRects
} from '../js/villa-vecchia-data.js';
import { groundHeight } from '../js/terrain.js';

const V = VILLA_VECCHIA;
const close = (a, b, e = 0.06) => Math.abs(a - b) < e;

test('the volumes: outlines of some size, walls facing out, the roofs at the surveyed heights', () => {
  for (const p of V.parts) {
    assert.ok(Math.abs(ringArea2(p.ring)) / 2 > 9, `${p.id}: an outline of some size`);
    const ring = outwardRing(p.ring);
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      const [x, z] = onWall(F, F.len / 2, 0.2);
      assert.ok(!pointInRing(p.ring, x, z), `${p.id}: wall ${i} faces out`);
    }
  }
  // the survey: the main ridge 22.2 at z −1105, the eaves 17.4 at the roof's edges; the bay's cross gable 19.6 over
  // eaves of 17.7; the wing's ridge 19.9 over eaves of 17.9
  const main = part('main'), bay = part('bay'), wing = part('wing');
  assert.ok(close(roofAt(main, 516, -1105), 22.2) && close(roofAt(main, 516, -1112.7), 17.4) && close(roofAt(main, 516, -1096.9), 17.4));
  assert.ok(close(roofAt(bay, 516.75, -1114), 19.6) && close(roofAt(bay, 513.7, -1114), 17.7) && close(roofAt(bay, 519.8, -1114), 17.7));
  assert.ok(close(roofAt(wing, 507, -1100), 19.9) && close(roofAt(wing, 507, -1102.5), 17.9) && close(roofAt(wing, 507, -1097.4), 17.9));
  // the inner walls: the bay's south wall and the wing's east wall stand in the main house; the main house's all outside
  const inner = (p) => wallsOf(p).filter((w) => innerWall(p, w.a, w.b)).map((w) => w.key);
  assert.deepEqual(inner(main), []);
  assert.deepEqual(inner(bay), ['bay:south']);
  assert.deepEqual(inner(wing), ['wing:east']);
  // the sides as the compass has them: the east front at the bigger x, the south wall at the bigger z
  const E = wallNamed('main:east'), S = wallNamed('main:south');
  assert.ok(E.F.a[0] > 524 && E.F.n[0] > 0.99 && S.F.a[1] > -1098 && S.F.n[1] > 0.99);
  // (an east front's left end, for someone standing before it, is its south end)
  assert.ok(E.F.a[1] > E.F.a[1] + E.F.u[1] * E.F.len);
});

test('the floors add up to the eaves; every window over the ground, under its wall\'s top, within its wall', () => {
  const main = part('main');
  // the raised ground floor and three over it end at the eaves (the walls' top under the roof at the long walls)
  const eaves = wallTopAt(main, 516, -1112.2) + V.thick;
  assert.ok(Math.abs(V.ground + V.floors * V.storey - eaves) < 0.5, `the floors end at ${V.ground + V.floors * V.storey}, the eaves at ${eaves}`);
  // the ground floor over the plinth, the plinth over the east front's ground
  const east = wallNamed('main:east');
  let hi = -Infinity;
  for (let s = 0; s <= east.F.len; s += 1) hi = Math.max(hi, groundHeight(...onWall(east.F, s, 0.5)));
  assert.ok(V.plinth > hi + 0.2 && V.ground > V.plinth + 0.5, `the east ground up to ${hi.toFixed(2)}`);
  for (const p of V.parts) {
    for (const w of wallsOf(p)) {
      const cols = columnsOf(p, w, groundHeight);
      if (!cols.length) continue;
      assert.ok(!innerWall(p, w.a, w.b), `${w.key}: windows on an outer wall`);
      const sorted = [...cols].sort((a, b) => a.s - b.s);
      sorted.forEach((c, i) => {
        assert.ok(c.s - V.column >= -0.01 && c.s + V.column <= w.F.len + 0.01, `${w.key}: a column within its wall`);
        if (i) assert.ok(c.s - sorted[i - 1].s >= 2 * V.column - 0.01, `${w.key}: columns apart`);
        // the lowest window's sill over the highest ground before it
        let g = -Infinity;
        for (const u of [-V.column, 0, V.column]) g = Math.max(g, groundHeight(...onWall(w.F, c.s + u, 0.5)));
        assert.ok(c.from + V.win.lo > g + 0.25, `${w.key} ${c.at}: a sill at ${c.from + V.win.lo} over the ground at ${g.toFixed(2)}`);
        // the highest window under the wall's top over the whole column
        const top = Math.min(...[-V.column, 0, V.column].map((u) => wallTopAt(p, ...onWall(w.F, c.s + u))));
        const last = c.from + Math.floor((c.to - c.from - V.win.hi) / V.storey + 1e-9) * V.storey + V.win.hi;
        assert.ok(last < top - 0.2, `${w.key} ${c.at}: the top window to ${last}, the wall to ${top.toFixed(2)}`);
      });
    }
  }
  // the east front: three columns, an attic window in its gable over the middle one; a door in the south front's middle
  const ec = columnsOf(main, east, groundHeight);
  assert.equal(ec.length, 3);
  assert.equal(ec.filter((c) => c.to > V.ground + V.floors * V.storey).length, 1);
  assert.ok(ec.every((c) => c.from === V.ground), 'the ground floor\'s windows on the east front');
  const sc = columnsOf(main, wallNamed('main:south'), groundHeight);
  assert.deepEqual(sc.map((c) => c.door), [false, true, false]);
});

test('the decals lie on their walls, clear of the windows and of each other, over the ground', () => {
  const ATLAS_KEYS = ['name', 'crest', 'attic', 'door', 'zehn', 'stand', 'eidg'];
  const placed = V.decals.map((d) => {
    const w = wallNamed(d.wall);
    assert.ok(w, `${d.key}: on ${d.wall}`);
    assert.ok(ATLAS_KEYS.includes(d.key));
    const s = sAlong(w.F, d.at), p = part(d.wall.split(':')[0]);
    assert.ok(s - d.w / 2 > 0.05 && s + d.w / 2 < w.F.len - 0.05, `${d.key}: within ${d.wall}`);
    // under the wall's top, over the ground before it
    const top = Math.min(...[-d.w / 2, 0, d.w / 2].map((u) => wallTopAt(p, ...onWall(w.F, s + u))));
    assert.ok(d.y1 < top - 0.2, `${d.key}: under the roof`);
    let g = -Infinity;
    for (const u of [-d.w / 2, 0, d.w / 2]) g = Math.max(g, groundHeight(...onWall(w.F, s + u, 0.5)));
    assert.ok(d.y0 > g + (d.key === 'door' ? 0.0 : 0.5), `${d.key}: over the ground (${g.toFixed(2)})`);
    if (d.key !== 'door') {
      for (const r of windowRects(p, w, groundHeight)) {
        const apart = s + d.w / 2 <= r.s0 || s - d.w / 2 >= r.s1 || d.y1 <= r.y0 || d.y0 >= r.y1;
        assert.ok(apart, `${d.key} at ${d.at} over a window of ${d.wall} (${r.s0.toFixed(2)}–${r.s1.toFixed(2)}, ${r.y0.toFixed(2)}–${r.y1.toFixed(2)})`);
      }
    }
    return { ...d, s0: s - d.w / 2, s1: s + d.w / 2 };
  });
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      if (a.wall !== b.wall) continue;
      assert.ok(a.s1 <= b.s0 || b.s1 <= a.s0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${a.key} and ${b.key} overlap`);
    }
  }
  // the painted front in the photographs' order from the south: the name, the Zehngerichtenbund, the Stand, the
  // Eidgenossenschaft (the porch beyond, at the north end)
  const order = placed.filter((d) => d.wall === 'main:east' && d.key !== 'crest').sort((a, b) => a.s0 - b.s0).map((d) => d.key);
  assert.deepEqual(order, ['name', 'zehn', 'stand', 'eidg']);
  // the door in the porch on the bay's east wall, within the porch
  const door = V.decals.find((d) => d.wall === 'bay:east');
  assert.ok(pointInRing(V.porch.ring, 520.0, door.at));
});

test('the player\'s walls: the three volumes and the porch, near OpenStreetMap\'s footprint', () => {
  const rings = groundOutlines();
  assert.equal(rings.length, 4);
  const osm = [[520.1, -1111.5], [524.6, -1111.5], [524.5, -1096.5], [509.5, -1096.5], [506, -1096.5], [506, -1097.6], [506, -1101.3], [509.6, -1101.3],
    [509.5, -1111.6], [510.2, -1111.6], [513.8, -1111.6], [513.8, -1113.8], [520.1, -1113.7]];
  rings.forEach((ring, k) => ring.forEach(([x, z]) => {
    assert.ok(Number.isFinite(x) && Number.isFinite(z));
    const d = Math.min(...osm.map((q, i) => {
      const r = osm[(i + 1) % osm.length], F = wallFrame(q, r), u = Math.max(0, Math.min(F.len, (x - q[0]) * F.u[0] + (z - q[1]) * F.u[1]));
      const [px, pz] = onWall(F, u);
      return Math.hypot(x - px, z - pz);
    }));
    // (OSM leaves out the porch: up to 3 m there)
    const allowed = k === 3 ? 3.0 : 1.5;
    assert.ok(pointInRing(osm, x, z) || d < allowed, `${x}, ${z}: ${d.toFixed(2)} m off OSM's footprint`);
  }));
  // the exclusions' centres fall inside the volumes they stand for
  assert.ok(V.exclude.every((e) => partAt(e.x, e.z)));
});

test('the missions\' places near the house stay outside it and a metre clear of it', () => {
  const near = [];
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    const src = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/x:\s*(-?\d+(?:\.\d+)?),\s*(?:y:\s*-?\d+(?:\.\d+)?,\s*)?z:\s*(-?\d+(?:\.\d+)?)/g)) {
      const x = +m[1], z = +m[2];
      if (Math.hypot(x - 516, z + 1106) < 60) near.push([f, x, z]);
    }
  }
  for (const [f, x, z] of near) {
    assert.equal(partAt(x, z), null, `${f}: ${x}, ${z} inside the house`);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; assert.equal(partAt(x + Math.cos(a), z + Math.sin(a)), null, `${f}: ${x}, ${z} against the house`); }
  }
});

const stubDocument = () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
};

test('the atlas\' cells do not overlap and fit the canvas', async () => {
  stubDocument();
  const { ATLAS } = await import('../js/villa-vecchia.js');
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `cells ${i} and ${j}`);
    }
  }
  // every decal's cell keeps the shape it is drawn at (within 15 %)
  for (const d of V.decals) {
    const [, , w, h] = ATLAS[d.key], r = (w / h) / (d.w / (d.y1 - d.y0));
    assert.ok(r > 0.85 && r < 1.15, `${d.key}: ${r.toFixed(2)}`);
  }
});

for (const simple of [false, true]) {
  test(`the house in Node${simple ? ' (the mobile profile)' : ''}: every vertex finite, five meshes, no colliders of its own`, async () => {
    stubDocument();
    const THREE = await import('three/webgpu');
    const { QUALITY } = await import('../js/quality.js');
    const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
    const { buildVillaVecchia } = await import('../js/villa-vecchia.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    try {
      const scene = new THREE.Scene();
      const { group, colliders } = buildVillaVecchia(scene);
      assert.equal(colliders.length, 0);
      assert.equal(group.userData.terrain, 'absolute');
      assert.equal(SURVEYED_FOOTPRINTS.get(V.osm).length, 4);
      const names = group.children.map((m) => m.name).sort();
      assert.deepEqual(names, ['Villa Vecchia decal', 'Villa Vecchia glass', 'Villa Vecchia plaster', 'Villa Vecchia roof', 'Villa Vecchia trim']);
      for (const m of group.children) {
        const p = m.geometry.attributes.position;
        assert.ok(p.count > 0);
        for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
        for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= V.base - 0.01 && p.array[i] < 23.2, `${m.name}: a height of ${p.array[i]}`);
        if (m.name.endsWith('plaster')) assert.ok(m.geometry.attributes.aHalf, 'the walls carry their columns\' half widths');
      }
      // nothing of it reaches out of the survey's footprint by more than the roofs' eaves, the porch's and the steps
      const box = new THREE.Box3().setFromObject(group);
      assert.ok(box.min.x > 505.4 && box.max.x < 525.6 && box.min.z > -1115.0 && box.max.z < -1096.0, `${box.min.x} ${box.max.x} ${box.min.z} ${box.max.z}`);
      // on the phone only SIMPLE_SKINS' materials, the trim and the decals
      if (simple) for (const m of group.children) assert.ok(!m.material.roughnessNode && !m.material.normalNode, `${m.name}: a full shader on the phone`);
    } finally {
      QUALITY.simpleMaterials = was;
    }
  });
}
