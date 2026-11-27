import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ST_THEODUL, groundOutlines, innerWall, localRing, onWall, part, partAt, pointInRing, ringArea2, roofAt, roofFacets, toLocal, toWorld, towerSides,
  wallAt, wallFrame, wallTops
} from '../js/st-theodul-data.js';
import { SEEHOF } from '../js/seehof-data.js';
import { groundHeight } from '../js/terrain.js';

test('the church\'s frame: world and church coordinates round trip, the axis runs east', () => {
  for (const q of [[0, 0], [21.55, -1.2], [6.3, -8.0], [3.9, 8.3]]) {
    const [s, t] = toLocal(toWorld(q));
    assert.ok(Math.abs(s - q[0]) < 1e-9 && Math.abs(t - q[1]) < 1e-9);
  }
  // t grows to the south (bigger z), s to the east
  assert.ok(toWorld([0, 1])[1] > toWorld([0, 0])[1] + 0.99);
  assert.ok(toWorld([1, 0])[0] > toWorld([0, 0])[0] + 0.99);
  // the survey's corners lie on the outlines: the apse's east face, the lean-to's north-east corner, the wing's south-west
  for (const [x, z] of [[754.6, -1509.9], [751.6, -1519.0], [733.5, -1502.6], [747.2, -1502.3]]) {
    const [s, t] = toLocal([x, z]);
    const d = Math.min(...ST_THEODUL.parts.flatMap((p) => localRing(p).map((a, i, r) => {
      const F = wallFrame(a, r[(i + 1) % r.length]), u = Math.max(0, Math.min(F.len, (s - a[0]) * F.u[0] + (t - a[1]) * F.u[1]));
      const [ps, pt] = onWall(F, u);
      return Math.hypot(s - ps, t - pt);
    })));
    assert.ok(d < 0.4, `${x}, ${z}: ${d.toFixed(2)} m off the outlines`);
  }
});

test('the volumes: outlines of some size, walls facing out, roofs over the walls at the surveyed heights', () => {
  for (const p of ST_THEODUL.parts) {
    assert.ok(Math.abs(ringArea2(p.ring)) / 2 > 15, `${p.id}: an outline of some size`);
    const ring = localRing(p);
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      const [s, t] = onWall(F, F.len / 2, 0.2);
      assert.ok(!pointInRing(p.ring, s, t), `${p.id}: wall ${i} faces out`);
      for (const q of wallTops(p, ring[i], ring[(i + 1) % ring.length])) assert.ok(q.y > 7 && q.y < 19.3, `${p.id}: a wall's top at ${q.y}`);
    }
    // every facet of the roof lies on its plane and under the ridge
    const facets = roofFacets(p);
    assert.equal(facets.length, p.planes.length, `${p.id}: a facet per plane`);
    for (const f of facets) for (const [s, t] of f.poly) assert.ok(f.plane[0] + f.plane[1] * s + f.plane[2] * t < 19.21);
  }
  // the survey: the ridge 19.2 over the nave, the eaves 11.3 north and 12.6 south, the lean-to's 7.5, the aisle's 9.6
  const nave = part('nave');
  assert.ok(Math.abs(roofAt(nave, 10, 0) - 19.2) < 1e-6);
  assert.ok(Math.abs(roofAt(nave, 10, -3.9) - 11.3) < 1e-6 && Math.abs(roofAt(nave, 10, 3.6) - 12.6) < 1e-6);
  assert.ok(Math.abs(roofAt(part('north'), 10, -8) - 7.5) < 1e-6 && Math.abs(roofAt(part('aisle'), 10, 8.4) - 9.6) < 1e-6);
  // the west front's gable: its peak under the ridge
  const tops = wallTops(nave, [0.2, -3.9], [0.2, 3.6]);
  assert.ok(Math.max(...tops.map((q) => q.y)) > 19.19);
  // the tower within the nave and the lean-to, rising out of their roofs
  for (const L of towerSides()) {
    const [s, t] = L.a;
    assert.ok(ST_THEODUL.parts.some((p) => pointInRing(p.ring, s, t)), 'a corner of the tower inside the church');
  }
  assert.ok(ST_THEODUL.tower.dial.y - ST_THEODUL.tower.dial.half > roofAt(nave, ...ST_THEODUL.tower.centre) + 1);
  assert.ok(ST_THEODUL.tower.cross.y1 > 31.9 && ST_THEODUL.tower.onion[0][1] > ST_THEODUL.tower.stage.top);
});

test('the windows and the painted openings lie on outer walls, under the roof, over the ground', () => {
  for (const w of ST_THEODUL.windows) {
    const W = wallAt(w.at);
    assert.ok(W, `${w.at}: on a wall`);
    assert.ok(W.s - w.half > 0.3 && W.s + w.half < W.F.len - 0.3, `${w.at}: within its wall`);
    const top = Math.min(...[-w.half, 0, w.half].map((u) => { const [s, t] = onWall(W.F, W.s + u); return roofAt(W.part, s, t); }));
    assert.ok(w.sill + w.h < top - 0.6, `${w.at}: under the eaves`);
    // the sill over the highest ground before it
    let ground = -Infinity;
    for (const u of [-w.half, 0, w.half]) ground = Math.max(ground, groundHeight(...toWorld(onWall(W.F, W.s + u, 0.5))));
    assert.ok(w.sill > ground + 1.0, `${w.at}: the sill ${w.sill} over the ground ${ground.toFixed(2)}`);
  }
  for (const o of ST_THEODUL.openings) {
    const W = wallAt(o.at);
    assert.ok(W && W.s - o.w / 2 > 0.1 && W.s + o.w / 2 < W.F.len - 0.1, `${o.key}: within its wall`);
  }
  // on one wall nothing overlaps: the porch under the west window, the window under the round window
  const things = [
    ...ST_THEODUL.windows.map((w) => ({ at: w.at, w: 2 * w.half, y0: w.sill - 0.15, y1: w.sill + w.h })),
    ...ST_THEODUL.openings.map((o) => {
      const W = wallAt(o.at), y0 = o.y ?? Math.max(...[-o.w / 2, 0, o.w / 2].map((u) => groundHeight(...toWorld(onWall(W.F, W.s + u, 0.5))))) + o.ground;
      return { at: o.at, w: o.w, y0, y1: y0 + o.h };
    })
  ].map((x) => ({ ...x, W: wallAt(x.at) }));
  for (let i = 0; i < things.length; i++) {
    for (let j = i + 1; j < things.length; j++) {
      const a = things[i], b = things[j];
      if (a.W.part !== b.W.part || a.W.F.a !== b.W.F.a) continue;
      const apart = Math.abs(a.W.s - b.W.s) > (a.w + b.w) / 2 || a.y1 < b.y0 || b.y1 < a.y0;
      assert.ok(apart, `${a.at} and ${b.at} overlap`);
    }
  }
  // the porch's arches fit the west front between its corners
  const arcade = ST_THEODUL.openings.find((o) => o.key === 'arcade'), W = wallAt(arcade.at);
  assert.ok(W.part.id === 'nave' && W.F.n[0] < -0.99, 'the porch on the west front');
});

test('the player\'s walls: the four volumes at the ground, within reach of OpenStreetMap\'s footprint; the Seehof apart', () => {
  const rings = groundOutlines();
  assert.equal(rings.length, 4);
  const osm = [[732.5, -1514.9], [746.3, -1515.4], [746.3, -1517.9], [751.1, -1517.9], [751.1, -1515.4], [753.5, -1515.5], [753.9, -1501.2], [732.9, -1500.6]];
  // (OSM leaves out the lean-to's west half, which the survey and the photograph from the north show: 3.2 m there)
  rings.forEach((ring, k) => ring.forEach(([x, z]) => {
    assert.ok(Number.isFinite(x) && Number.isFinite(z));
    const allowed = ST_THEODUL.parts[k].id === 'north' ? 3.5 : 1.5;
    const d = Math.min(...osm.map((q, i) => { const r = osm[(i + 1) % osm.length], F = wallFrame(q, r), u = Math.max(0, Math.min(F.len, (x - q[0]) * F.u[0] + (z - q[1]) * F.u[1])); const [px, pz] = onWall(F, u); return Math.hypot(x - px, z - pz); }));
    assert.ok(pointInRing(osm, x, z) || d < allowed, `${x}, ${z}: ${d.toFixed(2)} m outside OSM's footprint`);
  }));
  // the exclusion catches the church's batch (its centre inside the nave), not the Seehof's 48 m west
  assert.ok(partAt(ST_THEODUL.exclude.x, ST_THEODUL.exclude.z));
  assert.ok(Math.hypot(SEEHOF.exclude.x - ST_THEODUL.exclude.x, SEEHOF.exclude.z - ST_THEODUL.exclude.z) > 40);
  // no corner of either inside the other, and two metres between them at least
  for (const sp of SEEHOF.parts) {
    for (const [x, z] of sp.ring) assert.equal(partAt(x, z), null, `the Seehof's ${sp.id} inside the church`);
    for (const ring of rings) for (const [x, z] of ring) {
      assert.ok(!pointInRing(sp.ring, x, z), `the church inside the Seehof's ${sp.id}`);
      const d = Math.min(...sp.ring.map((q) => Math.hypot(q[0] - x, q[1] - z)));
      assert.ok(d > 2, `${d.toFixed(2)} m from the Seehof's ${sp.id}`);
    }
  }
});

test('the missions\' doors near the church stay outside it and reachable', () => {
  const near = [];
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    const src = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/x:\s*(-?\d+(?:\.\d+)?),\s*(?:y:\s*-?\d+(?:\.\d+)?,\s*)?z:\s*(-?\d+(?:\.\d+)?)/g)) {
      const x = +m[1], z = +m[2];
      if (Math.hypot(x - 744, z + 1510) < 60) near.push([f, x, z]);
    }
  }
  for (const [f, x, z] of near) {
    assert.equal(partAt(x, z), null, `${f}: ${x}, ${z} inside the church`);
    // a metre round it free
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; assert.equal(partAt(x + Math.cos(a), z + Math.sin(a)), null, `${f}: ${x}, ${z} against the church`); }
  }
});

test('the atlas\' cells do not overlap and fit the canvas', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const { ATLAS } = await import('../js/st-theodul.js');
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `cells ${i} and ${j}`);
    }
  }
});

for (const simple of [false, true]) {
  test(`the church in Node${simple ? ' (the mobile profile)' : ''}: every vertex finite, six meshes, no colliders of its own`, async () => {
    const noop = () => {};
    const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
    const THREE = await import('three/webgpu');
    const { QUALITY } = await import('../js/quality.js');
    const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
    const { buildStTheodul } = await import('../js/st-theodul.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    try {
      const scene = new THREE.Scene();
      const { group, colliders } = buildStTheodul(scene);
      assert.equal(colliders.length, 0);
      assert.equal(group.userData.terrain, 'absolute');
      assert.equal(SURVEYED_FOOTPRINTS.get(ST_THEODUL.osm).length, 4);
      const names = group.children.map((m) => m.name).sort();
      assert.deepEqual(names, ['St. Theodul copper', 'St. Theodul decal', 'St. Theodul glass', 'St. Theodul plaster', 'St. Theodul roof', 'St. Theodul trim']);
      for (const m of group.children) {
        const p = m.geometry.attributes.position;
        assert.ok(p.count > 0);
        for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
        for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= ST_THEODUL.base - 0.01 && p.array[i] < 33.1, `${m.name}: a height of ${p.array[i]}`);
        if (m.name.endsWith('glass')) assert.ok(m.geometry.attributes.aHalf, 'the glass carries the windows\' half widths');
      }
      // on the phone only SIMPLE_SKINS' materials, the trim and the decals
      if (simple) for (const m of group.children) assert.ok(!m.material.roughnessNode && !m.material.normalNode, `${m.name}: a full shader on the phone`);
    } finally {
      QUALITY.simpleMaterials = was;
    }
  });
}

// (innerWall: the walls between the volumes carry no plinth and no overhang)
test('the walls between the volumes are inner ones', () => {
  const nave = part('nave'), ring = localRing(nave);
  const inner = ring.map((a, i) => innerWall(nave, a, ring[(i + 1) % ring.length]));
  assert.equal(inner.filter(Boolean).length, 2, 'the nave against the lean-to and the aisle');
});
