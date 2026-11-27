import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BRISTOL, bays, groundOutlines, isEdge, isShared, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame } from '../js/bristol-data.js';

test('the Bristol\'s volumes: outlines of some size, the floors adding up to the surveyed heights', () => {
  for (const p of BRISTOL.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 100, `${p.id}: an outline of some size`);
    assert.ok(p.top > BRISTOL.base + 5 && p.line < p.top && p.top - p.line < 1.0, `${p.id}: the floors end under its roof`);
  }
  const block = part('block'), podium = part('podium');
  // the block: six floors from its foot, the survey's lowest floor (y 4.37) a little under it
  assert.ok(Math.abs(block.line - 6 * BRISTOL.storey - block.floor) < 1e-9);
  assert.ok(Math.abs(block.floor - 4.37) < 0.4);
  // the podium: two floors on the same grid, its roof the terrace at the block's third floor
  assert.ok(Math.abs(podium.line - 2 * BRISTOL.storey - podium.floor) < 1e-9);
  assert.ok(Math.abs((block.line - podium.line) / BRISTOL.storey - 4) < 1e-9);
  assert.ok(podium.top < block.line - 3 * BRISTOL.storey + BRISTOL.win.lo + 0.1, 'the terrace floor\'s windows clear the parapet');
  // the survey's batch centre lies in the house
  assert.ok(partAt(BRISTOL.exclude.x, BRISTOL.exclude.z));
  // the outlines registered for the player's walls are the two volumes
  assert.deepEqual(groundOutlines(), [block.ring, podium.ring]);
});

test('the walls face outwards; the block and the podium share the walls behind the podium', () => {
  for (const p of BRISTOL.parts) {
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
  // the podium's shared walls: a step out of them lies in the block
  const ring = part('podium').ring;
  let shared = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (!isShared(a, b)) continue;
    shared++;
    const F = wallFrame(a, b);
    if (F.len < 1.5) continue;
    const [x, z] = onWall(F, F.len / 2, 0.3), [x2, z2] = onWall(F, F.len / 2, -0.3);
    assert.ok(pointInRing(part('block').ring, x, z) || pointInRing(part('block').ring, x2, z2));
  }
  assert.ok(shared > 15, `${shared} shared walls`);
  // the outer walls are not shared
  assert.ok(!isShared(BRISTOL.front.a, BRISTOL.front.b) && !isShared(BRISTOL.gate.a, BRISTOL.gate.b));
});

test('the front faces the Promenade (east), the gate the lane (north); the name, the doors and the gate within them', () => {
  const podium = part('podium');
  const Fr = BRISTOL.front, F = wallFrame(Fr.a, Fr.b);
  assert.ok(isEdge(podium.ring, Fr.a, Fr.b));
  assert.ok(F.n[0] > 0.9, 'facing east');
  assert.ok(Fr.name.w < F.len - 2);
  for (const D of Fr.doors) assert.ok(D.s - D.w / 2 > 0.5 && D.s + D.w / 2 < F.len - 0.5 && Math.abs(D.s - F.len / 2) > Fr.name.w / 2 - 3);
  const G = BRISTOL.gate, W = wallFrame(G.a, G.b);
  assert.ok(isEdge(podium.ring, G.a, G.b));
  assert.ok(W.n[1] < -0.9, 'facing north (smaller z)');
  assert.ok(G.s - G.w / 2 > 0.5 && G.s + G.w / 2 < W.len - 0.5 && G.h < podium.line - podium.floor - BRISTOL.storey);
  // the bays from the wall's middle, a window's width and a margin from each end
  for (const len of [2, 5.6, 18.7]) {
    for (const s of bays(len)) assert.ok(s - BRISTOL.win.half >= 0.39 && s + BRISTOL.win.half <= len - 0.39);
  }
  assert.deepEqual(bays(1.5), []);
});

test('nothing of the house stands on a mission\'s place', async () => {
  const dir = new URL('../js/', import.meta.url);
  const points = [];
  const walk = (v, path, depth = 0, seen = new Set()) => {
    if (!v || typeof v !== 'object' || depth > 8 || seen.has(v)) return;
    seen.add(v);
    if (typeof v.x === 'number' && typeof v.z === 'number') points.push([path, v.x, v.z]);
    for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`, depth + 1, seen);
  };
  for (const f of fs.readdirSync(dir).filter((n) => /^missions-data-.*\.js$/.test(n))) walk(await import(new URL(f, dir)), f);
  assert.ok(points.length > 100, 'the missions\' places read');
  for (const [path, x, z] of points) {
    // (and a metre round each: a door stays reachable)
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) assert.equal(partAt(x + dx, z + dz), null, `${path} at ${x}, ${z}`);
  }
  // the nearest ones: the WEF mission's liaison and props on the Promenade before the house
  assert.ok(points.some(([p, x, z]) => p.includes('LIAISON') && Math.hypot(x - 480, z + 876) < 30));
});

test('the house in Node: every vertex finite, five meshes, the phone\'s materials, no colliders of its own', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { buildBristol, ATLAS } = await import('../js/bristol.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(BRISTOL.osm), groundOutlines());
  assert.ok(SHOP_EXCLUSIONS.has(BRISTOL.osm));
  // the atlas' cells do not overlap and fit in 1024 × 256
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 256);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);
    }
  }
  const was = QUALITY.simpleMaterials;
  for (const simple of [false, true]) {
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildBristol(scene);
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name).sort();
    assert.deepEqual(names, ['Bristol decal', 'Bristol glass', 'Bristol plaster', 'Bristol roof', 'Bristol trim']);
    for (const m of group.children) {
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > BRISTOL.base - 1 && p.array[i] < 24.2, `${m.name}: a height of ${p.array[i]}`);
      if (simple) {
        // the phone: plain skins (no procedural colour but the snow roof's and the windowed bands'), the trim's vertex
        // colours, the decal's texture
        const mat = m.material;
        assert.ok(!mat.roughnessNode && !mat.normalNode && !mat.positionNode, `${m.name}: a short shader`);
      }
    }
  }
  QUALITY.simpleMaterials = was;
});
