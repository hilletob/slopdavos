import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  ATLAS, ATLAS_SIZE, EXCLUDE, HOUSES, LOOKS, SHOPFRONTS, SHOP_NODES, allOutlines, at350, bandRing, gableRing, gableRoofRing, groundOutlines,
  houseOf, insideRow, local350, lookOf, onWall, outerFrame, outwardRing, partOf, partRing, pointInRing, ringArea2, wallFrame
} from '../js/promenade-mitte-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};
const centroid = (ring) => ring.reduce((a, [x, z]) => [a[0] + x / ring.length, a[1] + z / ring.length], [0, 0]);

test('the outlines: of some size, the walls facing out, each house on its own OpenStreetMap footprint', () => {
  assert.equal(HOUSES.length, 7);
  for (const h of HOUSES) {
    const own = osmRing(h.osm);
    assert.ok(own, `${h.osm} is an OpenStreetMap building`);
    const outlines = groundOutlines(h.osm);
    assert.ok(outlines.length >= 1);
    for (const ring of outlines) {
      assert.ok(Math.abs(ringArea2(ring)) / 2 > 5, `${h.osm}: an outline of some size`);
      const R = outwardRing(ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len < 1) continue;
        assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.1)), `${h.osm}: a step out of a wall leaves the outline`);
        assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.1)));
      }
      for (const [x, z] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(z));
    }
    // the biggest outline's middle within its OSM footprint (or within 3 m of it: OSM stands off the survey)
    const big = outlines.reduce((a, b) => (Math.abs(ringArea2(b)) > Math.abs(ringArea2(a)) ? b : a));
    const [cx, cz] = centroid(big);
    const near = pointInRing(own, cx, cz) || own.some(([x, z]) => Math.hypot(x - cx, z - cz) < 8);
    assert.ok(near, `${h.osm}: its outline on its footprint`);
  }
  // the surveyed sizes: the west block 492 m², the pink house 500 m², the twin blocks 452 m² each
  const area = (osm, i = 0) => Math.abs(ringArea2(groundOutlines(osm)[i])) / 2;
  assert.ok(Math.abs(area('w117012321') - 492) < 5);
  assert.ok(Math.abs(area('w127653793') - 500) < 5);
  assert.ok(Math.abs(area('w127653818') - 452) < 5 && Math.abs(area('w127653819') - 451) < 5);
});

test("the pale blue house: its frame, the survey's roof corners and ridge, the cross gables against the main roof", () => {
  const main = partOf(houseOf('w117012350'), 'main').gable;
  // the frame turns both ways
  const [t, c] = local350(...at350(7.5, -3.2));
  assert.ok(Math.abs(t - 7.5) < 0.02 && Math.abs(c + 3.2) < 0.02);
  // the roof's corners as surveyed (eaves at 20.3), the ridge's ends at 29.8
  const roof = gableRoofRing(main);
  for (const [x, z] of [[476.8, -759.5], [461.7, -777.3], [473.1, -787.0], [488.2, -769.2]]) assert.ok(roof.some(([p, q]) => Math.hypot(p - x, q - z) < 0.5), `a roof corner at ${x}, ${z}`);
  const k = (main.top - main.eave) / main.half;
  assert.ok(Math.abs(main.eave - main.ov * k - 20.3) < 0.1, 'the eaves at 20.3');
  // the survey's walls: the north-west gable from 463/−777 to 473/−785.5, the south-east one through 477/−761
  const walls = gableRing(main);
  for (const [x, z] of [[463.0, -777.0], [473.0, -785.5]]) assert.ok(walls.some(([p, q]) => Math.hypot(p - x, q - z) < 0.3));
  // the cross gables' ridges under the main roof where they meet it, their faces out of the main walls
  for (const id of ['crossSW', 'crossNE']) {
    const g = partOf(houseOf('w117012350'), id).gable;
    const [, cBack] = local350(...g.ridge[1]);
    const mainAt = main.top - (Math.abs(cBack + 0.1) * (main.top - main.eave)) / main.half;
    assert.ok(g.top < mainAt, `${id}: its ridge under the main roof where it meets it`);
    const [, cFace] = local350(...g.ridge[0]);
    assert.ok(Math.abs(cFace + 0.1) > main.half + 0.5, `${id}: its face out of the main walls`);
  }
  // the wing against the main walls and the south-west cross gable, as surveyed
  const wing = partOf(houseOf('w117012350'), 'wing');
  assert.ok(Math.abs(Math.abs(ringArea2(wing.ring)) / 2 - 203) < 10);
});

test('the floors add up to the surveyed heights', () => {
  const L = LOOKS;
  // the twin blocks: a shop floor to 5.1, five floors of 3 m to the walls' top at 20.2, the attic's floor over it
  assert.ok(Math.abs(L.tan.floor0 + L.tan.storey - 5.1) < 1e-9);
  assert.ok(Math.abs(L.tan.floor0 + 6 * L.tan.storey - 20.2) < 0.15);
  assert.ok(L.tan.floor0 + 6 * L.tan.storey + L.tan.hi + 0.3 < 23.25, "the attic's windows under its roof");
  // the pink house: the ground floor and three floors of tall windows under the cornice at 16.4
  assert.ok(L.pink.floor0 + 3 * L.pink.storey + L.pink.hi + 0.3 < 16.4 - 0.45);
  assert.ok(L.pink.floor0 + 4 * L.pink.storey + L.pink.hi + 0.3 > 16.4, 'no fifth row');
  // the west block: seven rows from the lowest ground (−5.2) under its roof at 17.63
  assert.ok(L.ribbon.floor0 + 6 * L.ribbon.storey + L.ribbon.hi + 0.3 < 17.63);
  assert.ok(L.ribbon.floor0 < -5.0 + 0.01 && L.ribbon.floor0 > -5.3);
  // the pale blue house: the shop floor to 8.3 on the Promenade side (its ground 4.0), four floors to the eaves at 20.3
  assert.ok(Math.abs(L.blue.floor0 + 2 * L.blue.storey - 8.3) < 1e-9 && Math.abs(L.blue.floor0 + 6 * L.blue.storey - 20.3) < 1e-9);
  for (const look of Object.values(L)) assert.ok(look.lo > 0.5 && look.hi < look.storey - 0.4 && look.half > 0.4);
});

test('the shop fronts on their walls, the lettering within them; the atlas\' cells apart', () => {
  for (const S of SHOPFRONTS) {
    const h = houseOf(S.house);
    assert.ok(h, S.house);
    if (S.band) {
      const band = bandRing(h);
      assert.ok(band && Math.abs(Math.abs(ringArea2(band.ring)) / 2 - band.F.len * h.band.depth) < 0.5);
      // the band before the block's front, outside the block
      const [x, z] = centroid(band.ring);
      assert.ok(!pointInRing(partRing(partOf(h, h.band.part)), x, z));
      // OSM's outline holds the band
      assert.ok(pointInRing(osmRing(h.osm), x, z), `${h.osm}: its shops' band within OSM's outline`);
      continue;
    }
    const ring = partRing(partOf(h, S.part));
    const F = outerFrame(ring, S.a, S.b);
    for (const q of [S.a, S.b]) {
      // on a wall of the part's outline
      const R = outwardRing(ring);
      let best = Infinity;
      for (let i = 0; i < R.length; i++) {
        const W = wallFrame(R[i], R[(i + 1) % R.length]);
        const s = (q[0] - W.a[0]) * W.u[0] + (q[1] - W.a[1]) * W.u[1], o = (q[0] - W.a[0]) * W.n[0] + (q[1] - W.a[1]) * W.n[1];
        if (s > -0.1 && s < W.len + 0.1) best = Math.min(best, Math.abs(o));
      }
      assert.ok(best < 0.15, `${S.house} ${S.part}: a shop front's end on a wall (${best})`);
    }
    assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.3)), 'the front faces out');
    assert.ok(S.top > 3.5 && S.top < 9);
    for (const sg of S.signs || []) {
      const [, , aw, ah] = ATLAS[sg.key];
      assert.ok(sg.w + 0.4 < F.len, `${sg.key} within its front`);
      if (sg.y) assert.ok(sg.y + (sg.w * ah) / aw / 2 < partOf(h, S.part).top, `${sg.key} under the roof`);
    }
  }
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= ATLAS_SIZE[0] && y + h <= ATLAS_SIZE[1]);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'cells apart');
  }
  assert.equal(SHOP_NODES.length, 4);
});

test('the excluded survey batches lie under the houses rebuilt', () => {
  for (const e of EXCLUDE) {
    const inside = HOUSES.some((h) => h.parts.some((p) => pointInRing(partRing(p), e.x, e.z)) || groundOutlines(h.osm).some((r) => r.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 12)));
    assert.ok(inside, `the batch at ${e.x}, ${e.z} under a house of the row`);
    assert.equal(e.r, 3);
  }
});

test('the neighbours: nothing of the row inside the houses around it, the AMERON and the hand-built ones', async () => {
  const mine = new Set(HOUSES.map((h) => h.osm));
  const around = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id) && b.ring[0] > 200 && b.ring[0] < 540 && b.ring[1] > -860 && b.ring[1] < -560);
  assert.ok(around.length > 10);
  for (const b of around) {
    const theirs = osmRing(b.id);
    for (const ring of allOutlines()) {
      // (a corner of ours deep in theirs, or theirs deep in ours: OSM may stand a metre off)
      for (const [x, z] of ring) {
        if (!pointInRing(theirs, x, z)) continue;
        const R = outwardRing(theirs);
        let d = Infinity;
        for (let i = 0; i < R.length; i++) {
          const W = wallFrame(R[i], R[(i + 1) % R.length]);
          const s = Math.max(0, Math.min(W.len, (x - W.a[0]) * W.u[0] + (z - W.a[1]) * W.u[1]));
          const [px, pz] = onWall(W, s);
          d = Math.min(d, Math.hypot(px - x, pz - z));
        }
        assert.ok(d < 1.2, `the row at ${x}, ${z} ${d.toFixed(1)} m inside ${b.id}`);
      }
    }
  }
  // the AMERON's own outlines (js/ameron-data.js)
  const { AMERON } = await import('../js/ameron-data.js');
  const theirs = AMERON.parts.map((p) => p.ring);
  assert.ok(theirs.length >= 2);
  for (const t of theirs) for (const ring of allOutlines()) {
    for (const [x, z] of ring) assert.ok(!pointInRing(t, x, z), `the row at ${x}, ${z} inside the AMERON`);
    for (const [x, z] of t) assert.ok(!pointInRing(ring, x, z), `the AMERON at ${x}, ${z} inside the row`);
  }
});

test("the missions' doors and starts near the row stay outside it", async () => {
  const dir = new URL('../js/', import.meta.url);
  const points = [];
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 5) return;
    if (typeof v.x === 'number' && typeof v.z === 'number') points.push([v.x, v.z]);
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  for (const f of readdirSync(dir).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    let mod;
    try { mod = await import(new URL(f, dir)); } catch { continue; }
    for (const k of Object.keys(mod)) if (typeof mod[k] === 'object') walk(mod[k], 0);
  }
  assert.ok(points.length > 20, "the missions' places read");
  const near = points.filter(([x, z]) => x > 240 && x < 500 && z > -800 && z < -590);
  assert.ok(near.length >= 2, "the Gourmet Käch mission's door and start among them");
  for (const [x, z] of near) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
});

test('the row in Node: every vertex finite, six meshes, the phone build only SIMPLE_SKINS, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildPromenadeMitte } = await import('../js/promenade-mitte.js');
  for (const h of HOUSES) assert.equal(SURVEYED_FOOTPRINTS.get(h.osm).length, groundOutlines(h.osm).length, h.osm);
  for (const n of SHOP_NODES) assert.ok(SHOP_EXCLUSIONS.has(n));
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildPromenadeMitte(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Promenade Mitte ', '')).sort();
    assert.deepEqual(names, ['decal', 'flat', 'glass', 'roof', 'trim', 'walls']);
    let tris = 0;
    for (const m of group.children) {
      const M = m.material;
      assert.ok(M, `${m.name}: a material`);
      if (simple) {
        const decal = M.opacityNode && M.transparent && !M.emissiveNode && !M.roughnessNode;
        const procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
        assert.ok(M.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
      }
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      tris += p.count / 3;
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -7 && p.array[i] < 31.5, `${m.name}: a height of ${p.array[i]}`);
      for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i] > 240 && p.array[i] < 500 && p.array[i + 2] > -800 && p.array[i + 2] < -590, `${m.name}: a vertex out of the row`);
      // the walls carry their looks
      if (m.name.endsWith('walls')) for (const a of ['aWin', 'aWin2', 'aFrame', 'aHalf', 'color']) assert.ok(m.geometry.attributes[a], a);
    }
    assert.ok(tris < 40000, `${tris} triangles`);
  }
  // every part of the row draws walls (a vertex of the walls within a metre of each outline's wall)
  const scene = new THREE.Scene();
  const walls = buildPromenadeMitte(scene).group.children.find((m) => m.name.endsWith('walls')).geometry.attributes.position.array;
  for (const h of HOUSES) for (const p of h.parts) {
    const ring = partRing(p);
    let hit = false;
    for (let i = 0; i < walls.length && !hit; i += 3) hit = ring.some(([x, z]) => Math.hypot(walls[i] - x, walls[i + 2] - z) < 1);
    assert.ok(hit, `${h.osm} ${p.id}: walls drawn`);
  }
  assert.ok(lookOf(houseOf('w127653819'), partOf(houseOf('w127653819'), 'block')) === LOOKS.tan);
});
