import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HAUS_FROHSINN as H, bayCentres, floorY, groundOutlines, inAnnex, onWall, outwardRing, pointInRing, ringArea2, roofRing, soffitY, wallFrame, walls } from '../js/haus-frohsinn-data.js';
import { groundHeight } from '../js/terrain.js';

/** The highest ground along a wall, half a metre out of it */
const groundAlong = (F) => { let hi = -Infinity; for (let s = 0; s <= F.len; s += 0.5) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5))); return hi; };

test('the outlines: of some size, the walls facing out, the compass sides as named', () => {
  for (const ring of [H.ring, H.annex.ring, walls().house, roofRing()]) {
    assert.ok(Math.abs(ringArea2(ring)) / 2 > 25, 'an outline of some size');
    const r = outwardRing(ring);
    for (let i = 0; i < r.length; i++) {
      const F = wallFrame(r[i], r[(i + 1) % r.length]);
      if (F.len < 1) continue;
      assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.2)), 'a step out of a wall leaves the outline');
      assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.2)), 'a step in enters it');
    }
  }
  // the block as surveyed: 26.5 × 12.7 m, its area some 336 m²
  assert.ok(Math.abs(Math.abs(ringArea2(H.ring)) / 2 - 336) < 6);
  const W = walls();
  // (x east, z south: north is the smaller z)
  assert.ok(W.west.n[0] < -0.85, 'the west end faces west');
  assert.ok(W.east.n[0] > 0.85, 'the east end faces east');
  assert.ok(W.north.n[1] < -0.85, 'the north side faces north');
  assert.ok(W.south.n[1] > 0.85 && W.front.n[1] > 0.85, 'the balconies face south');
  // the walls of the block are the ring's own (a step out of each leaves it)
  for (const F of [W.west, W.east, W.north, W.front]) assert.ok(!pointInRing(H.ring, ...onWall(F, F.len / 2, 0.2)));
  // the south wall stands the balconies' depth behind their rails, parallel to them
  const [x, z] = onWall(W.south, W.south.len / 2, H.balconies.depth);
  assert.ok(Math.hypot(x - onWall(W.front, W.front.len / 2)[0], z - onWall(W.front, W.front.len / 2)[1]) < 0.1);
  assert.ok(Math.abs(W.south.len - W.front.len) < 0.2);
  // the roof reaches the eaves over every wall
  for (const [px, pz] of H.ring) assert.ok(pointInRing(roofRing(), px, pz));
});

test('the floors: five over the plinth, ending under the roof\'s edge; the windows clear the ground along every wall', () => {
  assert.equal(H.floors, 5);
  assert.ok(Math.abs(floorY(H.floors) - soffitY()) < 1e-9, 'the top floor ends at the soffit');
  assert.ok(H.top - soffitY() <= 0.6);
  const W = walls();
  for (const [name, F] of Object.entries({ west: W.west, east: W.east, north: W.north, front: W.front })) {
    const g = groundAlong(F);
    assert.ok(H.foot > g + 0.3, `${name}: the ground floor's foot over the ground (${g.toFixed(2)})`);
    assert.ok(H.foot + H.win.lo > g + 1.0, `${name}: the lowest sills well over the ground`);
    assert.ok(H.base < g - 0.5, `${name}: the walls reach under the ground`);
  }
  // the plinth grows down the slope: a storey's height at the east end
  assert.ok(H.foot - groundAlong(W.east) > 2.5);
});

test('the windows, the name and the balconies stay on their walls and clear of each other', () => {
  const W = walls(), d = H.balconies.depth;
  // the ends' columns stand on the closed walls, out of the balconies' depth at their south end
  for (const s of H.ends.west.cols) assert.ok(s - 0.6 > 0.3 && s + 0.6 < W.west.len - d);
  for (const s of H.ends.east.cols) assert.ok(s - 0.6 > d && s + 0.6 < W.east.len - 0.3);
  // the name: on the west end, beside the window column, clear of the balconies, on the second floor
  const n = H.name;
  assert.ok(n.s0 > H.ends.west.cols[0] + 0.6 && n.s1 < W.west.len - d);
  assert.ok(n.y0 > floorY(2) + H.win.lo - 0.3 && n.y1 < floorY(3));
  // the long sides' windows: fitting their walls, clear of the partitions
  const bays = bayCentres(W.south.len);
  assert.ok(bays.length >= 7);
  for (const f of H.balconies.partitions) {
    const u = W.south.len * f - W.south.len / 2;
    for (const b of bays) assert.ok(Math.abs(u - b) > H.win.half + 0.15, `a partition at ${u.toFixed(2)} clear of the window at ${b}`);
  }
  assert.ok(bays.includes(H.entrance.bay * H.bay), 'the entrance in a bay');
  // the annex: one floor, against the block's east end and north side
  assert.ok(H.annex.top < floorY(1) && H.annex.top > floorY(0));
  assert.ok(H.annex.ring.some(([x, z]) => Math.hypot(x - H.ring[3][0], z - H.ring[3][1]) < 0.3), 'it meets the block\'s north-east corner');
  assert.ok(inAnnex(...onWall(W.east, W.east.len - 1, 0.5)) && !inAnnex(...onWall(W.east, 1, 0.5)));
});

test('the player\'s walls: the block with its terrace and the annex; no mission\'s place inside them', () => {
  assert.deepEqual(groundOutlines(), [H.ring, H.annex.ring]);
  // the places the missions name (x, z pairs in js/missions-data-*.js) near the house stay outside it
  let near = 0;
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.startsWith('missions-data'))) {
    const src = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/x:\s*(-?[\d.]+),\s*(?:y:\s*-?[\d.]+,\s*)?z:\s*(-?[\d.]+)/g)) {
      const x = +m[1], z = +m[2];
      if (Math.hypot(x + 429, z + 163) > 60) continue;
      near++;
      for (const ring of groundOutlines()) assert.ok(!pointInRing(ring, x, z), `${f}: ${x}, ${z}`);
    }
  }
  assert.ok(near >= 0);
});

async function stubCanvas() {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
}

test('the building in Node: every vertex finite, five meshes, no colliders of its own, the outlines registered', async () => {
  await stubCanvas();
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { buildHausFrohsinn, ATLAS } = await import('../js/haus-frohsinn.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(H.osm), groundOutlines());
  for (const [x, y, w, h] of Object.values(ATLAS)) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 128);
  const scene = new THREE.Scene();
  const { group, colliders } = buildHausFrohsinn(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Haus Frohsinn decal', 'Haus Frohsinn glass', 'Haus Frohsinn plaster', 'Haus Frohsinn roof', 'Haus Frohsinn trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= H.base - 0.01 && p.array[i] < H.top + 1.5, `${m.name}: a height of ${p.array[i]}`);
    for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i] > -445 && p.array[i] < -410 && p.array[i + 2] > -176 && p.array[i + 2] < -150, `${m.name}: within the plot`);
  }
  assert.ok(group.children.find((m) => m.name === 'Haus Frohsinn plaster').geometry.attributes.aHalf);
  // the roof faces up at its top; the trim holds the soffit facing down under it
  const roof = group.children.find((m) => m.name === 'Haus Frohsinn roof').geometry.attributes;
  let top = -Infinity;
  for (let i = 0; i < roof.position.count; i++) { top = Math.max(top, roof.position.getY(i)); assert.ok(roof.normal.getY(i) > 0.99); }
  assert.ok(Math.abs(top - H.top) < 0.01);
  const trim = group.children.find((m) => m.name === 'Haus Frohsinn trim').geometry.attributes;
  let down = 0;
  for (let i = 0; i < trim.position.count; i++) if (Math.abs(trim.position.getY(i) - soffitY()) < 1e-4 && trim.normal.getY(i) < -0.99) down++;
  assert.ok(down >= 6, 'the soffit faces down');
  // the name stands on the west end
  const dec = group.children.find((m) => m.name === 'Haus Frohsinn decal').geometry.attributes.position;
  const W = walls().west;
  for (let i = 0; i < dec.count; i++) {
    const dx = dec.getX(i) - W.a[0], dz = dec.getZ(i) - W.a[1];
    const s = dx * W.u[0] + dz * W.u[1], o = dx * W.n[0] + dz * W.n[1];
    assert.ok(s >= H.name.s0 - 0.01 && s <= H.name.s1 + 0.01 && o > 0 && o < 0.05);
  }
});

test('the phone\'s build: only SIMPLE_SKINS\' materials, the trim and the decals', async () => {
  await stubCanvas();
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { buildHausFrohsinn } = await import('../js/haus-frohsinn.js');
  const saved = { ...SIMPLE_SKINS }, was = QUALITY.simpleMaterials;
  for (const k of Object.keys(saved)) SIMPLE_SKINS[k] = (...a) => { const m = saved[k](...a); m.userData.simpleSkin = k; return m; };
  QUALITY.simpleMaterials = true;
  try {
    const { group } = buildHausFrohsinn(new THREE.Scene());
    assert.equal(group.children.length, 5);
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
