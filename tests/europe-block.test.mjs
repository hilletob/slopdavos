import test from 'node:test';
import assert from 'node:assert/strict';
import { EUROPE_BLOCK, coveredAt, floorFeet, groundOutlines, onWall, outwardFrame, outwardRing, part, partAt, pointInRing, ringArea2, side, wallFrame } from '../js/europe-block-data.js';
import { MEERKAEMPER } from '../js/missions-data-expert.js';
import { EX_BAR } from '../js/missions-data-gastro.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { ARKADEN } from '../js/landmark-buildings-data.js';

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (in this order) a wall of the part's outward outline? */
const isWall = (p, a, b) => { const r = outwardRing(p.ring); return r.some((q, i) => near(q, a) && near(r[(i + 1) % r.length], b)); };
const flat = (ring) => { const out = []; for (let i = 0; i < ring.length; i += 2) out.push([ring[i], ring[i + 1]]); return out; };
const osmRing = (id) => flat(DAVOS_DATA.buildings.find((b) => b.id === id).ring);
// does segment p–q cross segment r–s?
const crosses = (p, q, r, s) => {
  const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
};

test('the block\'s volumes: simple outlines of some size, the floors adding up under every roof', () => {
  for (const p of EUROPE_BLOCK.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 35, `${p.id}: an outline of some size`);
    const n = p.ring.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      assert.ok(!crosses(p.ring[i], p.ring[(i + 1) % n], p.ring[j], p.ring[(j + 1) % n]), `${p.id}: edges ${i} and ${j} cross`);
    }
    assert.ok(p.top > EUROPE_BLOCK.base + 8, `${p.id}: its roof over the base`);
    assert.ok(p.line <= p.top && p.top - p.line < 1.6, `${p.id}: the floors end under its roof, a parapet over them`);
    assert.ok(EUROPE_BLOCK.skins[p.skin] && (!p.east || EUROPE_BLOCK.skins[p.east]), `${p.id}: its plaster`);
  }
  // the parts on the Promenade: the shops' floor and the hotel floors over it on one grid (the ground floor's top at
  // the shops' fascia), the attic one floor over the hotel's block
  for (const id of ['europe', 'shops', 'bay', 'hotel']) {
    const p = part(id);
    assert.ok(floorFeet(p, EUROPE_BLOCK.base).some((y) => Math.abs(y - EUROPE_BLOCK.shop.top) < 1e-6), `${id}: a floor's foot on the fascia's top`);
  }
  assert.equal(floorFeet(part('europe'), EUROPE_BLOCK.shop.top).length, 5, 'five hotel floors over the shops');
  assert.equal(floorFeet(part('hotel'), EUROPE_BLOCK.shop.top).length, 6, 'six on the older front');
  assert.ok(Math.abs(part('europe-attic').line - part('europe').line - part('europe').storey) < 1e-9);
  assert.ok(part('europe-attic').top > part('europe').top);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of EUROPE_BLOCK.parts) {
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

test('the fronts the details hang on are walls of their parts, facing their sides', () => {
  const L = EUROPE_BLOCK.loggias;
  assert.ok(isWall(part(L.part), L.a, L.b));
  const F = wallFrame(L.a, L.b);
  assert.equal(side(F), 'east', 'the loggias on the Promenade');
  assert.ok(L.a[1] > L.b[1], 'its left end the south one');
  for (const k of L.bays) assert.ok(Math.abs(k * 2.9) + 0.62 + 0.4 < F.len / 2, `bay ${k} within the wall`);
  const R = EUROPE_BLOCK.roofName;
  assert.ok(isWall(part(R.part), R.a, R.b));
  const S = wallFrame(R.a, R.b);
  assert.equal(side(S), 'south', 'HOTEL EUROPE faces the Kulturplatz');
  assert.ok(R.w < S.len - 2 && R.flags.every((s) => s > 0.5 && s < S.len - 0.5));
  // the board and the poles stand on the wing's roof, nothing higher over them
  for (const s of [(S.len - R.w) / 2, (S.len + R.w) / 2]) assert.equal(partAt(...onWall(S, s, -R.back)), part(R.part));
  for (const s of R.flags) assert.equal(partAt(...onWall(S, s, -2.4)), part(R.part));
  const D = EUROPE_BLOCK.doorName;
  assert.ok(isWall(part(D.part), D.a, D.b));
  const E = wallFrame(D.a, D.b);
  assert.equal(side(E), 'east');
  assert.ok(D.door[0] > 0 && D.door[1] < E.len && D.w <= E.len - 1);
  assert.equal(part(D.part).east, 'salmon', 'the older front in salmon');
  // the Casino's chord spans its rounded corner; the gate and the café on the south
  const N = EUROPE_BLOCK.casinoName, cas = part(N.part);
  assert.ok(cas.ring.some((q) => near(q, N.a)) && cas.ring.some((q) => near(q, N.b)));
  assert.ok(N.w < wallFrame(N.a, N.b).len + 0.5);
  for (const key of ['gate', 'cafe']) {
    const G = EUROPE_BLOCK[key];
    assert.ok(isWall(part(G.part), G.a, G.b), key);
    assert.equal(side(outwardFrame(part(G.part).ring, G.a, G.b)), 'south', key);
  }
  assert.ok(EUROPE_BLOCK.gate.w < wallFrame(EUROPE_BLOCK.gate.a, EUROPE_BLOCK.gate.b).len - 1);
});

test('the outlines given to the player\'s walls: every OSM building of the batch, near its own footprint', () => {
  const g = groundOutlines();
  assert.deepEqual([...g.keys()].sort(), ['w123384638', 'w1529973402', 'w1529973403', 'w1529973404', 'w1529973405']);
  for (const [id, rings] of g) {
    const osm = osmRing(id);
    // each OSM footprint's middle lies in one of its outlines or a metre from one
    const cx = osm.reduce((s, q) => s + q[0], 0) / osm.length, cz = osm.reduce((s, q) => s + q[1], 0) / osm.length;
    const d = Math.min(...rings.flat().map((q) => Math.hypot(q[0] - cx, q[1] - cz)));
    assert.ok(d < 40, `${id}: its outlines by its footprint`);
  }
  // the attic stands inside the hotel's block
  for (const [x, z] of part('europe-attic').ring) assert.ok(pointInRing(part('europe').ring, x, z) || part('europe').ring.some((q) => near(q, [x, z])));
});

test('it keeps clear of the Schatzalpbahn, the Arkaden and the street', () => {
  // the funicular's valley station and its track (the ways' first points: the station's tunnel)
  const station = osmRing('w123384643');
  const track = DAVOS_DATA.railways.filter((r) => /Schatzalp/.test(r.name || '')).map((r) => flat(r.pts));
  for (const p of EUROPE_BLOCK.parts) {
    for (const [x, z] of p.ring) {
      assert.ok(!pointInRing(station, x, z), `${p.id}: outside the station`);
      for (const pts of track) for (const q of pts) assert.ok(Math.hypot(q[0] - x, q[1] - z) > 4, `${p.id}: clear of the track`);
    }
    for (const [x, z] of station) assert.ok(!pointInRing(p.ring, x, z), `${p.id}: the station's corners outside it`);
    // the Arkaden's wings across the Promenade
    for (const w of ARKADEN.wings) for (const [x, z] of flat(w.ring)) assert.ok(!pointInRing(p.ring, x, z), `${p.id}: off the Arkaden`);
    for (const [x, z] of p.ring) for (const w of ARKADEN.wings) assert.ok(!pointInRing(flat(w.ring), x, z), `${p.id}: off the Arkaden`);
  }
});

test('the mission doors stay reachable: the Meerkämper\'s and the Ex Bar\'s outside every volume, a step to the street', () => {
  for (const door of [MEERKAEMPER.door, EX_BAR.door]) {
    assert.equal(partAt(door.x, door.z), null);
    // nothing of the block within a metre of the door, and the start on the Promenade in the open too
    for (let a = 0; a < 6.28; a += 0.4) assert.ok(!coveredAt(door.x + Math.cos(a), door.z + Math.sin(a), -10), 'free round the door');
  }
  assert.equal(partAt(MEERKAEMPER.start.x, MEERKAEMPER.start.z), null);
  assert.equal(partAt(EX_BAR.start.x, EX_BAR.start.z), null);
  // the Meerkämper's door before the shops' block (Promenade 63, w1529973404), a few metres off its front
  let d = Infinity;
  for (const id of ['shops', 'bay']) {
    const r = outwardRing(part(id).ring);
    for (let i = 0; i < r.length; i++) {
      const F = wallFrame(r[i], r[(i + 1) % r.length]);
      const dx = MEERKAEMPER.door.x - F.a[0], dz = MEERKAEMPER.door.z - F.a[1], s = Math.max(0, Math.min(F.len, dx * F.u[0] + dz * F.u[1]));
      const [x, z] = onWall(F, s);
      d = Math.min(d, Math.hypot(MEERKAEMPER.door.x - x, MEERKAEMPER.door.z - z));
    }
  }
  assert.ok(d < 5, `the door ${d.toFixed(1)} m before the shops' front`);
});

test('the building in Node: every vertex finite, five meshes, the café\'s posts as colliders off the doors', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { buildEuropeBlock } = await import('../js/europe-block.js');
  assert.ok(SHOP_EXCLUSIONS.has('w123384638'));
  for (const id of groundOutlines().keys()) assert.ok(SURVEYED_FOOTPRINTS.has(id), id);
  const scene = new THREE.Scene();
  const { group, colliders } = buildEuropeBlock(scene);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Europe block decal', 'Europe block glass', 'Europe block roof', 'Europe block trim', 'Europe block walls']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > EUROPE_BLOCK.base - 1 && p.array[i] < 32, `${m.name}: a height of ${p.array[i]}`);
  }
  const walls = group.children.find((m) => m.name.endsWith('walls')).geometry;
  assert.equal(walls.attributes.color.count, walls.attributes.position.count, 'every wall vertex coloured');
  assert.ok(walls.attributes.aHalf);
  assert.equal(colliders.length, 3);
  for (const c of colliders) {
    for (const v of [c.minX, c.maxX, c.minZ, c.maxZ, c.baseY, c.maxY]) assert.ok(Number.isFinite(v));
    assert.ok(c.maxY - c.baseY > 2 && c.maxY - c.baseY < 7);
    // outside the volumes, clear of the doors
    assert.equal(partAt(c.obb.cx, c.obb.cz), null);
    for (const door of [MEERKAEMPER.door, EX_BAR.door]) assert.ok(Math.hypot(c.obb.cx - door.x, c.obb.cz - door.z) > door.r + 1);
  }
});

test('the phone\'s profile: SIMPLE_SKINS only, the walls\' colours from the vertices', async () => {
  const { QUALITY } = await import('../js/quality.js');
  const THREE = await import('three/webgpu');
  const { buildEuropeBlock } = await import('../js/europe-block.js');
  const was = QUALITY.simpleMaterials;
  QUALITY.simpleMaterials = true;
  try {
    const scene = new THREE.Scene();
    const { group } = buildEuropeBlock(scene);
    for (const m of group.children) {
      const mat = m.material;
      const decal = mat.opacityNode && mat.transparent && !mat.emissiveNode && !mat.roughnessNode;
      const trim = !mat.colorNode && !mat.emissiveNode && !mat.roughnessNode && mat.vertexColors;
      assert.ok(decal || trim || m.name.endsWith('roof') || m.name.endsWith('glass') || m.name.endsWith('walls'), m.name);
      assert.ok(!mat.roughnessNode && !mat.normalNode && !mat.positionNode, `${m.name}: no full shader`);
    }
    assert.ok(group.children.find((m) => m.name.endsWith('walls')).material.vertexColors);
  } finally { QUALITY.simpleMaterials = was; }
});
