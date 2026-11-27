import test from 'node:test';
import assert from 'node:assert/strict';
import { TURMHOTEL_VICTORIA, floorsOf, groundOutlines, inTower, isConvex, offsetRing, onWall, outwardRing, part, partAt, pointInRing, ringArea2, staffDoor, towerBay, towerRing, towerU, wallFrame } from '../js/turmhotel-victoria-data.js';
import { VICTORIA } from '../js/missions-data-victoria.js';

const V = TURMHOTEL_VICTORIA, T = V.tower;
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the ring? */
const isWall = (ring, a, b) => ring.some((q, i) => { const r = ring[(i + 1) % ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });

test('the volumes: outlines of some size, the floors adding up to the surveyed roofs', () => {
  for (const p of V.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 15, `${p.id}: an outline of some size`);
    assert.ok(p.line <= p.top && p.top - p.line < 1.0, `${p.id}: the floors end under its roof`);
  }
  // the front: five floors from the forecourt's ground floor (y 2.9) up to the terrace; the wing one more, the attic
  assert.deepEqual(floorsOf(part('front')), [2.9, 5.8, 8.7, 11.6, 14.5]);
  assert.deepEqual(floorsOf(part('wing')), [2.9, 5.8, 8.7, 11.6, 14.5, 17.4]);
  assert.ok(part('wing').top > part('front').top + V.storey);
  // the tower: its top floor's windows under the cornice, the helm from the wall's top to the surveyed tip
  assert.ok(T.floor + (T.levels - 1) * T.storey + T.win.hi < T.cornice[0] - 0.5 && T.cornice[1] < T.wall);
  assert.ok(T.flare.y === T.wall && T.eave.y > T.flare.y && T.flare.r > T.eave.r && T.tip === 26.0);
  // the wing's roof: convex, so that its top can be moved in; the top inside the walls
  assert.ok(isConvex(part('wing').ring));
  for (const [x, z] of offsetRing(part('wing').ring, -V.wingRoof.inset)) assert.ok(pointInRing(part('wing').ring, x, z));
  for (const [x, z] of offsetRing(part('wing').ring, V.wingRoof.overhang)) assert.ok(!pointInRing(part('wing').ring, x, z));
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of V.parts) {
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

test('the tower: on the surveyed circle, the front\'s chords inside it, the windows towards the street', () => {
  // the survey's points of the tower's wall (y 21.4) lie on its circle
  for (const [x, z] of [[984.7, -1751.1], [981.9, -1748.1], [978.7, -1751.5], [981.9, -1754.1]]) assert.ok(Math.abs(Math.hypot(x - T.c[0], z - T.c[1]) - T.r) < 0.12);
  // the front's corners at the tower lie within it (its walls there are hidden)
  for (const q of [[979.0, -1751.1], [982.3, -1754.0], [981.3, -1748.2]]) assert.ok(Math.hypot(q[0] - T.c[0], q[1] - T.c[1]) < T.r * Math.cos(Math.PI / T.segments), `${q}`);
  // the window groups facing east, north-east and south-east stand free of the hotel
  for (const b of [30, 90, 150]) {
    assert.ok(Math.abs(towerU(b) / towerBay() - Math.round(towerU(b) / towerBay())) < 1e-9, 'a group in the middle of its bay');
    const t = (b * Math.PI) / 180, [x, z] = [T.c[0] + (T.r + 0.4) * Math.sin(t), T.c[1] - (T.r + 0.4) * Math.cos(t)];
    assert.equal(partAt(x, z), null, `bearing ${b}`);
  }
  // a group's windows and shutters fit within its bay
  assert.ok(T.shutter.at + T.shutter.half < towerBay() / 2 - 0.2);
});

test('the lettering on the tower: on its free side, between the windows\' rows', () => {
  const O = V.oval, half = (O.w / 2 / T.r) * (180 / Math.PI);
  for (const b of [O.bearing - half, O.bearing + half, V.stuebli.from, V.stuebli.to]) {
    const t = (b * Math.PI) / 180, [x, z] = [T.c[0] + (T.r + 0.3) * Math.sin(t), T.c[1] - (T.r + 0.3) * Math.cos(t)];
    assert.equal(partAt(x, z), null, `bearing ${b}: in front of the hotel`);
  }
  // the oval between the first floor's windows' heads and the second's sills
  assert.ok(O.y0 > T.floor + T.storey + T.win.hi && O.y1 < T.floor + 2 * T.storey + T.win.lo);
  // "Turm Stübli" over the ground floor's arches, under the first floor's band
  assert.ok(V.stuebli.y0 > T.floor + T.arch.hi && V.stuebli.y1 < T.floor + T.storey - 0.12);
});

test('the atlas\' cells do not overlap and fit the canvas', async () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const { ATLAS } = await import('../js/turmhotel-victoria.js');
  const cells = Object.entries(ATLAS);
  for (const [k, [x, y, w, h]] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512, k);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [, a] = cells[i], [, b] = cells[j];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `${cells[i][0]} / ${cells[j][0]}`);
  }
});

test('the staff door of the mission: on the south front, at the mission\'s door, the way to it from the start free', () => {
  assert.deepEqual(V.mission.door, VICTORIA.door);
  assert.deepEqual(V.mission.start, VICTORIA.start);
  const { F, at, before } = staffDoor();
  assert.ok(isWall(part('front').ring, V.south.a, V.south.b));
  assert.ok(F.n[1] > 0.9, 'the front faces south (towards bigger z)');
  // the door's middle within a metre of the mission's door, and that point outside the walls but within the door's reach
  assert.ok(Math.hypot(at[0] - VICTORIA.door.x, at[1] - VICTORIA.door.z) < 1.0);
  assert.equal(partAt(VICTORIA.door.x, VICTORIA.door.z), null);
  assert.ok(!inTower(VICTORIA.door.x, VICTORIA.door.z));
  for (const ring of groundOutlines()) assert.ok(!pointInRing(ring, VICTORIA.door.x, VICTORIA.door.z), 'outside every wall of the player\'s');
  // (how far the mission's door point stands out of the wall: a little, within its radius)
  const off = (VICTORIA.door.x - F.a[0]) * F.n[0] + (VICTORIA.door.z - F.a[1]) * F.n[1];
  assert.ok(off > 0.2 && off < VICTORIA.door.r, `${off}`);
  assert.ok(Math.hypot(before[0] - VICTORIA.door.x, before[1] - VICTORIA.door.z) < VICTORIA.door.r);
  // nothing of the hotel between the start and the door
  for (let k = 0; k <= 20; k++) {
    const x = VICTORIA.start.x + ((VICTORIA.door.x - VICTORIA.start.x) * k) / 20, z = VICTORIA.start.z + ((VICTORIA.door.z - VICTORIA.start.z) * k) / 20;
    assert.equal(partAt(x, z), null, `${k}`);
    assert.ok(!inTower(x, z));
  }
});

test('the outlines for the player\'s walls: the hotel\'s two volumes and the tower, near OSM\'s footprint', () => {
  const rings = groundOutlines();
  assert.equal(rings.length, 3);
  assert.deepEqual(rings[2], towerRing());
  // every corner of them within 1.5 m of OSM's footprint or inside it (the tower's west half in the hotel)
  const fp = V.footprint;
  const dist = (x, z) => {
    if (pointInRing(fp, x, z)) return 0;
    let d = Infinity;
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i], b = fp[(i + 1) % fp.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    }
    return d;
  };
  for (const ring of rings) for (const [x, z] of ring) assert.ok(dist(x, z) < 1.5, `${x} ${z}: ${dist(x, z)}`);
});

const stubCanvas = () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
};

test('the building in Node: every vertex finite, six meshes, no colliders of its own, the outlines registered', async () => {
  stubCanvas();
  const THREE = await import('three/webgpu');
  const { buildTurmhotelVictoria } = await import('../js/turmhotel-victoria.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(V.osm), groundOutlines());
  assert.ok(SHOP_EXCLUSIONS.has(V.shop));
  const scene = new THREE.Scene();
  const { group, colliders } = buildTurmhotelVictoria(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name.replace('Turmhotel Victoria ', '')).sort();
  assert.deepEqual(names, ['decal', 'helm', 'plaster', 'roof', 'tower', 'trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > V.base - 1 && p.array[i] < 30, `${m.name}: a height of ${p.array[i]}`);
  }
  // nothing of it stands between the mission's start and its door, over a man's height (the canopy and balconies above)
  const box = new THREE.Box3();
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      box.makeEmpty();
      for (let k = 0; k < 3; k++) box.expandByPoint(new THREE.Vector3(p.getX(i + k), p.getY(i + k), p.getZ(i + k)));
      for (let k = 1; k < 10; k++) {
        const x = VICTORIA.start.x + ((VICTORIA.door.x - VICTORIA.start.x) * k) / 10, z = VICTORIA.start.z + ((VICTORIA.door.z - VICTORIA.start.z) * k) / 10;
        const y = 3.0 + 1.0; // (the forecourt at y ~3, a body's middle)
        const hit = box.min.x <= x && x <= box.max.x && box.min.z <= z && z <= box.max.z && box.min.y <= y && y <= box.max.y && box.max.x - box.min.x < 0.5 && box.max.z - box.min.z < 0.5;
        assert.ok(!hit, `${m.name} at ${x.toFixed(1)} ${z.toFixed(1)}`);
      }
    }
  }
});

test('the phone\'s profile: only SIMPLE_SKINS\' materials, the trim\'s vertex colours and the decal', async () => {
  stubCanvas();
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { buildTurmhotelVictoria } = await import('../js/turmhotel-victoria.js');
  // (SIMPLE_SKINS' materials marked as they are made, as .claude/skills/gebaeude-nach-foto/scripts/mobile-check.mjs does)
  const kept = { ...SIMPLE_SKINS }, was = QUALITY.simpleMaterials;
  for (const k of Object.keys(kept)) SIMPLE_SKINS[k] = (...a) => { const m = kept[k](...a); m.userData.simpleSkin = k; return m; };
  QUALITY.simpleMaterials = true;
  try {
    const scene = new THREE.Scene();
    const { group } = buildTurmhotelVictoria(scene);
    for (const m of group.children) {
      const mat = m.material;
      const decal = mat.opacityNode && mat.transparent && !mat.emissiveNode && !mat.roughnessNode && !mat.normalNode;
      const plain = !mat.colorNode && !mat.emissiveNode && !mat.roughnessNode && !mat.normalNode && !mat.positionNode;
      assert.ok(mat.userData.simpleSkin || decal || plain, `${m.name}: a full shader on the phone`);
    }
    assert.equal(group.children.find((m) => m.name.endsWith('tower')).material.userData.simpleSkin, 'windowed');
  } finally {
    Object.assign(SIMPLE_SKINS, kept);
    QUALITY.simpleMaterials = was;
  }
});
