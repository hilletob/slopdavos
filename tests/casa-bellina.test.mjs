import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CASA_BELLINA, coveredTo, firstRow, groundOutlines, isLoggia, isWall, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame } from '../js/casa-bellina-data.js';
import { groundHeight } from '../js/terrain.js';

const S = CASA_BELLINA.storey;
/** Is a → b (either way round) a wall of the part? */
const wallOf = (p, a, b) => p.ring.some((q, i) => isWall([q, p.ring[(i + 1) % p.ring.length]], a, b));

test('the volumes: outlines of some size, five floors under each half\'s roof, the annex one floor and a parapet', () => {
  for (const p of CASA_BELLINA.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 40, `${p.id}: an outline of some size`);
    assert.ok(p.top > CASA_BELLINA.base + 5, `${p.id}: its roof over the base`);
    assert.ok(p.line <= p.top + 1e-9 && p.top - p.line < 1.0, `${p.id}: the floors end at its roof`);
    // the base under the lowest ground round it
    for (const [x, z] of p.ring) assert.ok(groundHeight(x, z) > CASA_BELLINA.base + 0.8, `${p.id}: the base under the ground at ${x} ${z}`);
  }
  for (const id of ['west', 'east']) {
    const p = part(id);
    assert.ok(Math.abs(p.line - p.foot - CASA_BELLINA.floors * S) < 1e-6, `${id}: five floors of ${S} m`);
    // the ground floor over the street's ground before the south front, but not more than a floor over it
    const F = wallFrame(...CASA_BELLINA.loggias[id === 'west' ? 1 : 4]);
    const g = groundHeight(...onWall(F, F.len / 2, 1));
    assert.ok(p.foot > g && p.foot - g < S, `${id}: the ground floor at ${p.foot} over the street at ${g.toFixed(2)}`);
  }
  assert.ok(Math.abs(part('west').foot - part('east').foot - (part('west').top - part('east').top)) < 1e-6, 'the halves step down by their roofs\' step');
  assert.equal(part('annex').foot, part('east').foot);
  assert.ok(Math.abs(part('annex').line - part('annex').foot - S) < 1e-6, 'the annex: the ground floor over the garage');
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of CASA_BELLINA.parts) {
    const ring = outwardRing(p.ring);
    let out = 0, walls = 0;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 1.5) continue;
      walls++;
      const [x, z] = onWall(F, F.len / 2, 0.2);
      if (!pointInRing(p.ring, x, z)) out++;
    }
    assert.equal(out, walls, `${p.id}: ${out} of ${walls} walls face out`);
  }
});

test('the balconies\' fronts: walls of the halves facing the street (south), open to it, wide enough for a panel', () => {
  for (const [a, b] of CASA_BELLINA.loggias) {
    const p = CASA_BELLINA.parts.find((q) => wallOf(q, a, b));
    assert.ok(p && p.id !== 'annex', `${a} → ${b} is a wall of a half`);
    const F = wallFrame(a, b);
    assert.ok(F.n[1] > 0.85, `${a} → ${b} faces south`);
    assert.ok(F.len >= 3.4 && F.len - 2 * CASA_BELLINA.loggia.pier > 2.8);
    assert.equal(coveredTo(p, a, b), -Infinity, 'nothing stands before it');
    assert.ok(isLoggia(a, b) && isLoggia(b, a));
  }
  // the floor's storey: the rail and the opening within it
  const L = CASA_BELLINA.loggia;
  assert.ok(L.slab < L.rail && L.rail < L.open && L.open < S);
});

test('the parts stand before one another: the walls inside a taller part are hidden, the step between the halves shows', () => {
  const W = part('west'), E = part('east'), A = part('annex');
  // the east half's west walls stand inside the west half (taller): hidden
  assert.equal(coveredTo(E, [464.5, -1158.5], [462.1, -1151.1]), W.top);
  // the west half's east wall over the east half: shows above its roof
  assert.equal(coveredTo(W, [467.1, -1156.6], [469.2, -1163.8]), E.top);
  // the east half's north wall over the annex: windows from over the terrace
  assert.equal(coveredTo(E, [478.5, -1161.0], [470.7, -1163.3]), A.top);
  assert.ok(firstRow(E, A.top + 0.05, CASA_BELLINA.win.lo) + CASA_BELLINA.win.lo > A.top, 'the first windows over the terrace');
  // the lowest row of windows clears the ground; a floor under the ground floor only where the part has one
  for (const hi of [4.0, 5.5, 7.0, 8.4, 9.9]) {
    for (const p of CASA_BELLINA.parts) {
      const y = firstRow(p, hi, CASA_BELLINA.win.lo);
      assert.ok(y + CASA_BELLINA.win.lo >= hi - 1e-9 && y >= p.foot - (p.cellar ? S : 0) - 1e-9);
      assert.ok(Math.abs((y - p.foot) / S - Math.round((y - p.foot) / S)) < 1e-9, 'on the floors\' grid');
    }
  }
});

test('the entrance, the gate and the piers\' heads: on their walls and roofs', () => {
  const En = CASA_BELLINA.entrance, F = wallFrame(...En.wall);
  assert.ok(wallOf(part('east'), ...En.wall) && isLoggia(...En.wall));
  const D = En.door;
  assert.ok(D.s - D.w / 2 > CASA_BELLINA.loggia.pier && D.s + D.w / 2 < En.name.s[0] && En.name.s[1] < F.len - CASA_BELLINA.loggia.pier);
  // the door and the name stand on the plinth under the ground floor
  const g = groundHeight(...onWall(F, D.s, 0.6));
  assert.ok(g + En.name.y1 < part('east').foot, 'the name under the ground floor');
  assert.equal(partAt(...onWall(F, D.s, 0.6)), null, 'the door opens onto the street');
  const G = CASA_BELLINA.gate, Gf = wallFrame(...G.wall);
  assert.ok(wallOf(part('annex'), ...G.wall));
  assert.ok(Gf.n[0] > 0.8, 'the gate faces east, to the ramp');
  assert.ok(G.s - G.w / 2 > 0.2 && G.s + G.w / 2 < Gf.len - 0.2);
  assert.ok(groundHeight(...onWall(Gf, G.s, 0.6)) + G.h < part('annex').foot, 'the gate under the ground floor');
  assert.equal(partAt(...onWall(Gf, G.s, 1)), null);
  for (const [x, z] of CASA_BELLINA.stacks.at) {
    const p = partAt(x, z);
    assert.ok(p && p.id !== 'annex', `a stack on a half's roof at ${x} ${z}`);
    // (the whole head on that roof)
    const L4 = wallFrame(...CASA_BELLINA.loggias[3]), Fs = { a: [x, z], u: L4.u, n: L4.n };
    const { w, d } = CASA_BELLINA.stacks;
    for (const [s, o] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) assert.equal(partAt(...onWall(Fs, s, o)), p, 'within its roof');
  }
});

test('the outlines the walls stand on: the three parts; OSM\'s footprint near them; no mission door on them', () => {
  const rings = groundOutlines();
  assert.equal(rings.length, 3);
  const osm = [[444.1, -1171.9], [453.8, -1168.7], [453.4, -1167.7], [468, -1162.8], [468.9, -1165.6], [470.6, -1166.2], [479.5, -1163.4], [478.5, -1159.6], [477.9, -1157.8],
    [480.7, -1156.9], [482, -1156.4], [481.2, -1154.1], [482.4, -1153.8], [479.1, -1144.1], [478.3, -1144.3], [477.8, -1142.7], [470.7, -1145], [470.3, -1143.8], [462.5, -1146.4],
    [462.8, -1147.3], [455.9, -1149.6], [456.2, -1150.6], [446.2, -1153.9], [447, -1156.3], [440.8, -1158.4], [441.3, -1159.8], [440.1, -1160.2]];
  // every corner of the parts within 2.5 m of OSM's outline or inside it (OSM cuts a notch at the north-east corner)
  const dist = (x, z) => {
    let d = Infinity;
    for (let i = 0; i < osm.length; i++) {
      const a = osm[i], b = osm[(i + 1) % osm.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    }
    return pointInRing(osm, x, z) ? 0 : d;
  };
  for (const ring of rings) for (const [x, z] of ring) assert.ok(dist(x, z) < 2.5, `${x} ${z} near OSM's outline`);
  // the missions' places (js/missions-data-*.js): none on the house, none within 2 m of it
  const places = [];
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    const src = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/x:\s*(-?\d+(?:\.\d+)?),\s*(?:y:\s*-?\d+(?:\.\d+)?,\s*)?z:\s*(-?\d+(?:\.\d+)?)/g)) places.push([+m[1], +m[2], f]);
  }
  assert.ok(places.length > 50, 'the missions\' places were read');
  for (const [x, z, f] of places) {
    if (Math.abs(x - 461) > 40 || Math.abs(z + 1157) > 40) continue;
    for (const ring of rings) {
      assert.ok(!pointInRing(ring, x, z), `${f}: ${x} ${z} inside the house`);
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) assert.ok(!pointInRing(ring, x + dx, z + dz), `${f}: ${x} ${z} within 2 m of a wall`);
    }
  }
});

// (a stand-in canvas for the build in Node)
function standInDocument() {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
}

test('the building in Node: every vertex finite, five meshes, no colliders of its own, the outlines registered', async () => {
  standInDocument();
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { buildCasaBellina } = await import('../js/casa-bellina.js');
  assert.equal(SURVEYED_FOOTPRINTS.get(CASA_BELLINA.osm).length, 3);
  const scene = new THREE.Scene();
  const { group, colliders } = buildCasaBellina(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Casa Bellina decal', 'Casa Bellina loggia', 'Casa Bellina plaster', 'Casa Bellina roof', 'Casa Bellina trim']);
  let tris = 0;
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    tris += p.count / 3;
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > CASA_BELLINA.base - 1.5 && p.array[i] < 29, `${m.name}: a height of ${p.array[i]}`);
    if (m.name.endsWith('plaster') || m.name.endsWith('loggia')) assert.ok(m.geometry.attributes.aHalf, `${m.name}: carries aHalf`);
  }
  assert.ok(tris < 20000, `${tris} triangles`);
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
    const { buildCasaBellina } = await import('../js/casa-bellina.js');
    const scene = new THREE.Scene();
    buildCasaBellina(scene);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      const decal = m.opacityNode && m.transparent && !m.emissiveNode && !m.roughnessNode && !m.normalNode;
      const procedural = m.colorNode || m.emissiveNode || m.roughnessNode || m.normalNode || m.positionNode;
      assert.ok(m.userData.simpleSkin || decal || !procedural, `${o.name}: a full shader on the phone`);
    });
  } finally {
    QUALITY.simpleMaterials = was;
    Object.assign(SIMPLE_SKINS, kept);
  }
});
