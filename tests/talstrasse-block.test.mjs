import test from 'node:test';
import assert from 'node:assert/strict';
import { TALSTRASSE_BLOCK, groundOutlines, isInner, onWall, outwardRing, part, partAt, pointInRing, rampY, ringArea2, wallFrame } from '../js/talstrasse-block-data.js';
import { WEBER } from '../js/weber-data.js';
import { groundHeight } from '../js/terrain.js';

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the part? */
const isWall = (p, a, b) => p.ring.some((q, i) => { const r = p.ring[(i + 1) % p.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
const wallOf = (a, b) => TALSTRASSE_BLOCK.parts.find((p) => isWall(p, a, b));

test('the volumes: outlines of some size, the floors adding up to the surveyed heights', () => {
  for (const p of TALSTRASSE_BLOCK.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 60, `${p.id}: an outline of some size`);
    assert.ok(p.top > TALSTRASSE_BLOCK.base + 8, `${p.id}: its roof over the base`);
  }
  const { line, storey, groundFloor } = TALSTRASSE_BLOCK;
  // six floors over the ground floor, the roof's edge half a metre over the top floor
  assert.ok(Math.abs(line - 6 * storey - groundFloor) < 1e-9);
  assert.ok(part('block').top - line > 0.3 && part('block').top - line < 0.8);
  // the ground floor 3.9–4.7 m over the ground round the house (−4.5 to −5.5)
  for (const y of [-4.5, -5.5]) assert.ok(groundFloor - y > 3.8 && groundFloor - y < 5.0);
  // the garage's roof a parapet over its first floor's top
  const p = part('garage').top - (groundFloor + storey);
  assert.ok(p > 0.2 && p < 0.6);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of TALSTRASSE_BLOCK.parts) {
    const ring = outwardRing(p.ring);
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 1) continue;
      assert.ok(!pointInRing(p.ring, ...onWall(F, F.len / 2, 0.2)), `${p.id}: wall ${i}`);
    }
  }
  // the block's walls behind the garage's L are inner (the front and the north-west side), the rest stand free
  const block = part('block'), ring = outwardRing(block.ring);
  const inner = ring.filter((a, i) => isInner(block, a, ring[(i + 1) % ring.length])).length;
  assert.equal(inner, 2);
});

test('the front faces the forecourt (south-west); its balconies at floors over the garage\'s roof', () => {
  const Fr = TALSTRASSE_BLOCK.front, F = wallFrame(Fr.a, Fr.b);
  assert.ok(isWall(part('block'), Fr.a, Fr.b));
  assert.ok(F.n[0] < -0.4 && F.n[1] > 0.7, 'facing south-west');
  assert.ok(!pointInRing(part('block').ring, ...onWall(F, F.len / 2, 0.3)));
  for (const y of Fr.balconies) {
    const k = (TALSTRASSE_BLOCK.line - y) / TALSTRASSE_BLOCK.storey;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-9, `a balcony at a floor (${y})`);
    assert.ok(y - 0.3 > part('garage').top && y + Fr.rail < part('block').top);
  }
  assert.ok(Fr.from + Fr.end < F.len / 2 && Fr.out < 2);
});

test('the shop and the openings lie within their walls, on the ground floor, not overlapping', () => {
  const S = TALSTRASSE_BLOCK.shop, F = wallFrame(S.a, S.b);
  assert.ok(isWall(part('garage'), S.a, S.b) && F.n[1] > 0.7, 'the shop on the garage\'s front, facing the forecourt');
  assert.ok(S.s0 > 0.5 && S.s1 < F.len - 0.5 && S.door > S.s0 + 1 && S.door < S.s1 - 1);
  const g = Math.max(...[0, 0.25, 0.5, 0.75, 1].map((t) => groundHeight(...onWall(F, t * F.len, 0.5))));
  assert.ok(g + S.head + S.fascia < TALSTRASSE_BLOCK.groundFloor, 'the shop under the first floor');
  for (const o of TALSTRASSE_BLOCK.openings) {
    const W = wallFrame(o.a, o.b);
    const p = wallOf(o.a, o.b);
    assert.ok(p, `${o.id}: a wall of the house`);
    assert.ok(!pointInRing(p.ring, ...onWall(W, W.len / 2, 0.3)), `${o.id}: a → b runs with the outside on its right`);
    const spans = [...o.windows.map(([s, w]) => [s - w / 2, s + w / 2]), ...o.doors.map(([s, w]) => [s - w / 2, s + w / 2])].sort((x, y) => x[0] - y[0]);
    for (const [s0, s1] of spans) assert.ok(s0 > 0.3 && s1 < W.len - 0.3, `${o.id}: within its wall`);
    for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] > spans[i - 1][1], `${o.id}: not overlapping`);
    const gw = groundHeight(...onWall(W, W.len / 2, 0.5));
    assert.ok(gw + o.head < TALSTRASSE_BLOCK.groundFloor && o.doors.every(([, , h]) => gw + h < TALSTRASSE_BLOCK.groundFloor));
    // (the ramp leaves the gate free: the slab ends before it)
    for (const [s, w] of o.doors) {
      const [x, z] = onWall(W, s - w / 2 - 0.3, 0.5);
      assert.ok(!pointInRing(TALSTRASSE_BLOCK.ramp.ring, x, z), `${o.id}: its door free of the ramp`);
    }
  }
});

test('the ramp: its slab through the surveyed corners, against the block and the garage', () => {
  const R = TALSTRASSE_BLOCK.ramp;
  for (const [x, z, y] of R.corners) assert.ok(Math.abs(rampY(x, z) - y) < 0.15, `${x}/${z}: ${rampY(x, z)} for ${y}`);
  // (it stands against the house, not in it: half a metre from each corner towards its middle lies outside both parts)
  const [cx, cz] = R.ring.reduce((s, q) => [s[0] + q[0] / R.ring.length, s[1] + q[1] / R.ring.length], [0, 0]);
  assert.equal(partAt(cx, cz), null);
  for (const [x, z] of R.ring) {
    const d = Math.hypot(cx - x, cz - z);
    assert.equal(partAt(x + ((cx - x) / d) * 0.5, z + ((cz - z) / d) * 0.5), null);
  }
  // (its south-west and north-west sides meet the garage's end and the block's south-east wall)
  const F = wallFrame([663.6, -1336.7], [672.2, -1349.9]);
  assert.ok(isWall(part('block'), F.a, onWall(F, F.len)));
  const t = (R.ring[3][0] - F.a[0]) * F.u[0] + (R.ring[3][1] - F.a[1]) * F.u[1];
  assert.ok(near(onWall(F, t), R.ring[3]), 'its north corner on the block\'s wall');
});

test('the excludes: this house\'s batches only, not the Weber\'s nor the chalet\'s next door', () => {
  const ours = [[661.3, -1347.6], [653.7, -1348.0], [667.6, -1338.9]];
  // (the chalet w117012255's batches 16, 5, 4, 0 and 21 of tile 11/1752/1021, the Weber's two)
  const others = [[676.8, -1330.5], [680.7, -1323.5], [688.2, -1321.0], [685.9, -1315.7], ...WEBER.exclude.map((e) => [e.x, e.z])];
  for (const e of TALSTRASSE_BLOCK.exclude) {
    assert.ok(ours.some(([x, z]) => Math.hypot(e.x - x, e.z - z) < 0.05));
    for (const [x, z] of others) assert.ok(Math.hypot(e.x - x, e.z - z) > e.r + 1, `${e.x}/${e.z} off ${x}/${z}`);
  }
  for (const w of WEBER.exclude) for (const e of TALSTRASSE_BLOCK.exclude) assert.ok(Math.hypot(e.x - w.x, e.z - w.z) > w.r + 1);
});

test('the player\'s walls: the block\'s and the garage\'s outlines, near OpenStreetMap\'s footprint', async () => {
  const { DAVOS_DATA } = await import('../js/davos-geodata.js');
  const b = DAVOS_DATA.buildings.find((x) => x.id === TALSTRASSE_BLOCK.osm);
  assert.ok(b);
  const rings = groundOutlines();
  assert.equal(rings.length, 2);
  // the block's corners within 1.5 m of OpenStreetMap's walls' corners
  const osm = [];
  for (let i = 0; i < b.ring.length; i += 2) osm.push([b.ring[i], b.ring[i + 1]]);
  for (const [x, z] of [[663.6, -1336.7], [672.2, -1349.9]]) assert.ok(osm.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 1.5));
});

test('the building in Node: every vertex finite, five meshes, the ramp\'s colliders at world heights', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  // (SIMPLE_SKINS' materials marked as they are made, as .claude/skills/gebaeude-nach-foto/scripts/mobile-check.mjs does)
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildTalstrasseBlock } = await import('../js/talstrasse-block.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(TALSTRASSE_BLOCK.osm), groundOutlines());
  for (const simple of [false, true]) {
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildTalstrasseBlock(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name).sort();
    assert.deepEqual(names, ['AVIA garage front', 'AVIA garage glass', 'AVIA garage plaster', 'AVIA garage roof', 'AVIA garage trim']);
    for (const m of group.children) {
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= TALSTRASSE_BLOCK.base - 1.1 && p.array[i] < 17.5, `${m.name}: a height of ${p.array[i]}`);
      // (the phone's profile: SIMPLE_SKINS' materials or plain ones, no node shader of the house's own)
      const M = m.material, procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
      if (simple) assert.ok(M.userData.simpleSkin || !procedural, `${m.name}: a simple skin on the phone`);
      else if (m.name !== 'AVIA garage roof' && m.name !== 'AVIA garage trim') assert.ok(!M.userData.simpleSkin, `${m.name}: its own material`);
    }
    assert.ok(colliders.length >= 3);
    for (const c of colliders) {
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
      assert.ok(c.maxY - c.baseY > 1 && c.maxY < -2);
      // (outside the outlines the walls stand on)
      assert.ok(!groundOutlines().some((r) => pointInRing(r, c.obb.cx, c.obb.cz)));
    }
  }
});
