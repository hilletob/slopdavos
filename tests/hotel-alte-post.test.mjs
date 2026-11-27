import test from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_ALTE_POST as H, firstWindowFloor, floorFeet, groundOutlines, isEdge, isShared, isTimber, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame } from '../js/hotel-alte-post-data.js';
import { groundHeight } from '../js/terrain.js';

// (a stand-in document: the atlas draws into nothing in Node)
function standInDocument() {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
}

test('the volumes: outlines of some size, the floors adding up to the surveyed heights', () => {
  for (const p of H.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 50, `${p.id}: an outline of some size`);
    assert.ok(p.top > H.line && p.top - H.line < 1.5, `${p.id}: the top floor ends under its roof`);
    for (const [x, z] of p.ring) assert.ok(groundHeight(x, z) > H.base + 0.5, `${p.id}: the base under the ground at ${x} ${z}`);
  }
  assert.ok(part('east').top > part('west').top);
  // six floors from the survey's lowest floor (−12.88) up, the fourth from the top on the lane's level (−6.3 to −6.6)
  const feet = floorFeet();
  assert.equal(feet.length, 6);
  assert.ok(Math.abs(feet[0] - -12.88) < 0.3, `the lowest floor at ${feet[0]}`);
  assert.ok(Math.abs(feet[2] - -6.45) < 0.2, `the lane's floor at ${feet[2]}`);
  assert.ok(Math.abs(feet.at(-1) + H.storey - H.line) < 1e-9);
  // the windows' floor over the ground: a wall standing on the lane starts on the lane's floor
  assert.equal(firstWindowFloor(-6.05, H.win.pink.lo), feet[2]);
  assert.equal(firstWindowFloor(H.line + 1, H.win.pink.lo), null);
  for (const W of Object.values(H.win)) assert.ok(W.lo > 0.5 && W.hi < H.storey - 0.4 && W.half > 0.3);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of H.parts) {
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

test('the two volumes meet along shared walls; the timber wing\'s walls are the west volume\'s, at its south end', () => {
  const W = part('west'), E = part('east');
  let shared = 0;
  for (let i = 0; i < E.ring.length; i++) if (isShared(E.ring[i], E.ring[(i + 1) % E.ring.length])) shared++;
  assert.equal(shared, 3);
  for (const [a, b] of H.timber) {
    assert.ok(isEdge(W.ring, a, b), 'a wall of the west volume');
    assert.ok(isTimber(b, a));
    assert.ok((a[1] + b[1]) / 2 > 310, 'at the south end');
  }
  // the pink house's front and the lane's wall are plaster
  assert.ok(!isTimber(H.front.a, H.front.b) && !isTimber(H.door.a, H.door.b));
});

test('the narrow front faces south-west, the door the lane (north-west), the letters stand on the wing\'s roof', () => {
  const W = part('west');
  const Fr = wallFrame(H.front.a, H.front.b);
  assert.ok(isEdge(W.ring, H.front.a, H.front.b) && Fr.n[0] < -0.6 && Fr.n[1] > 0.5, 'south-west');
  assert.ok(Fr.len > 4 && Fr.len < 6);
  // the pediment over a floor's window, under the next floor's
  const f = H.front.pediment;
  assert.ok(floorFeet().some((y) => Math.abs(y - f) < 1e-9));
  assert.ok(f + H.win.pink.hi + 0.67 < f + H.storey + H.win.pink.lo);
  // the door: on the north-west wall, in a window's bay, on the ground of the lane
  const D = H.door, F = wallFrame(D.a, D.b);
  assert.ok(isEdge(W.ring, D.a, D.b) && F.n[0] < -0.6 && F.n[1] < -0.6, 'north-west');
  const mid = F.len / 2, k = (D.s - mid) / H.bay.pink;
  assert.ok(Math.abs(k - Math.round(k)) * H.bay.pink < 0.05, 'over a window\'s bay (the door hides its window)');
  assert.ok(D.s - D.w / 2 - 0.6 > 0 && D.s + D.w / 2 + 0.6 < F.len);
  const g = groundHeight(...onWall(F, D.s, 0.8));
  assert.ok(Math.abs(g - floorFeet()[2]) < 0.6, `the lane at the door at ${g}`);
  assert.equal(partAt(...onWall(F, D.s, 1.5)), null, 'the way to the door free');
  // the canopy under the board, the board under the next floor's sills
  assert.ok(D.canopy.y + 0.14 < D.board.y0 && D.h < D.canopy.y);
  assert.ok(g + 0.12 + D.board.y1 < floorFeet()[3] + H.win.pink.lo - 0.16);
  // the letters: along the timber wing's south-west front, on its roof
  const S = H.sign, Sf = wallFrame(S.a, S.b);
  assert.ok(isTimber(S.a, S.b) && Sf.n[0] < -0.6 && Sf.n[1] > 0.5);
  assert.ok(S.s0 >= 0 && S.s1 <= Sf.len && S.y0 > W.top + 0.5 && S.y1 - S.y0 > 0.8);
  for (const s of [S.s0, S.s1]) for (const o of [S.o, S.o - 1.3]) assert.equal(partAt(...onWall(Sf, s, o)), W, 'the frame on the roof');
  for (const [x, z, r] of H.chimneys) for (const [dx, dz] of [[-r, -r], [r, -r], [r, r], [-r, r]]) assert.equal(partAt(x + dx, z + dz), W);
});

test('the player\'s walls: the surveyed outlines, registered at load; no mission\'s door inside them', async () => {
  const outlines = groundOutlines();
  assert.equal(outlines.length, 2);
  const fs = await import('node:fs');
  // every door or start of a mission round the hotel lies outside the outlines
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter((n) => /^missions-data.*\.js$/.test(n))) {
    const src = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/x:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+)/g)) {
      const x = +m[1], z = +m[2];
      if (Math.hypot(x - H.exclude.x, z - H.exclude.z) > 40) continue;
      for (const r of outlines) assert.ok(!pointInRing(r, x, z), `${f}: ${x} ${z} inside the hotel`);
    }
  }
});

test('the building in Node: every vertex finite, five meshes, no colliders of its own, its outlines and sign registered', async () => {
  standInDocument();
  const THREE = await import('three/webgpu');
  const { buildHotelAltePost, ATLAS } = await import('../js/hotel-alte-post.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.equal(SURVEYED_FOOTPRINTS.get(H.osm).length, 2);
  assert.ok(SHOP_EXCLUSIONS.has(H.osm));
  // the atlas' cells within it, not overlapping
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 256);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'cells overlap');
  }
  const scene = new THREE.Scene();
  const { group, colliders } = buildHotelAltePost(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Hotel Alte Post decal', 'Hotel Alte Post pink', 'Hotel Alte Post roof', 'Hotel Alte Post timber', 'Hotel Alte Post trim']);
  let tris = 0;
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    tris += p.count / 3;
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > H.base - 1 && p.array[i] < 10, `${m.name}: a height of ${p.array[i]}`);
    if (m.name.endsWith('pink') || m.name.endsWith('timber')) assert.ok(m.geometry.attributes.aHalf, `${m.name}: carries aHalf`);
  }
  assert.ok(tris < 5000, `${tris} triangles`);
});

test('the phone\'s profile: only SIMPLE_SKINS\' materials, a decal and the vertex-coloured trim', async () => {
  standInDocument();
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const kept = { ...SIMPLE_SKINS };
  for (const k of Object.keys(kept)) SIMPLE_SKINS[k] = (...a) => { const m = kept[k](...a); m.userData.simpleSkin = k; return m; };
  const was = QUALITY.simpleMaterials;
  QUALITY.simpleMaterials = true;
  try {
    const { buildHotelAltePost } = await import('../js/hotel-alte-post.js');
    const scene = new THREE.Scene();
    buildHotelAltePost(scene);
    let meshes = 0;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const m = o.material;
      const decal = m.opacityNode && m.transparent && !m.emissiveNode && !m.roughnessNode && !m.normalNode;
      const procedural = m.colorNode || m.emissiveNode || m.roughnessNode || m.normalNode || m.positionNode;
      assert.ok(m.userData.simpleSkin || decal || !procedural, `${o.name}: a full shader on the phone`);
    });
    assert.equal(meshes, 5);
  } finally {
    QUALITY.simpleMaterials = was;
    Object.assign(SIMPLE_SKINS, kept);
  }
});
