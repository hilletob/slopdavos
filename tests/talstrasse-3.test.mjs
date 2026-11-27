import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  ATLAS, ATLAS_SIZE, EXCLUDE, HOUSES, allParts, baseOf, faceWall, faceWalls, groundOutlines, insideRow, lookFor, onWall, outwardRing,
  pointInRing, ringArea2, roofRingOf, saddleFrame, saddleY, wallFrame, wallTopOf, wallsOf
} from '../js/talstrasse-3-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { KONGRESS } from '../js/landmark-buildings-data.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};
// how far a point lies from a ring's edges, and how far inside it (0 outside)
const edgeDistance = (ring, x, z) => {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    const t = Math.max(0, Math.min(F.len, (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1]));
    const [px, pz] = onWall(F, t);
    d = Math.min(d, Math.hypot(x - px, z - pz));
  }
  return d;
};
const depthIn = (ring, x, z) => (pointInRing(ring, x, z) ? edgeDistance(ring, x, z) : 0);
const OSM_IDS = [...new Set(HOUSES.map((h) => h.osm))];

test('the outlines: of some size, the walls facing out, one set an OpenStreetMap building', () => {
  const G = groundOutlines();
  assert.equal(G.size, 14);
  for (const id of OSM_IDS) assert.ok(osmRing(id), `${id} is an OpenStreetMap building`);
  for (const [id, rings] of G) {
    assert.ok(rings.length >= 1, id);
    for (const ring of rings) {
      assert.ok(Math.abs(ringArea2(ring)) / 2 > 10, `${id}: an outline of some size`);
      for (const [x, z] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(z));
      const R = outwardRing(ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len < 1.5) continue;
        assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.15)), `${id}: a step out of a wall leaves the outline`);
        assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.15)), `${id}: a step back is inside`);
      }
      // (near the OpenStreetMap outline it stands in for)
      const own = osmRing(id), [cx, cz] = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
      assert.ok(pointInRing(own, cx, cz) || depthIn(ring, own[0][0], own[0][1]) > 0 || Math.hypot(cx - own[0][0], cz - own[0][1]) < 40, `${id}: near its footprint`);
    }
  }
  // the survey's corners (a few of each house) on the outlines
  const corners = {
    w1388767245: [[49.2, -331.4], [37.7, -345.6], [21.4, -337.8]], w121860616: [[64.3, -360.1], [50.7, -352.5]],
    w126271037: [[108.0, -383.9], [95.6, -374.6], [104.9, -362.3]], w116881208: [[164.7, -420.0], [140.4, -405.8], [161.0, -370.5]],
    w121860622: [[254.9, -470.2], [237.4, -442.0], [266.7, -457.4]], w124874508: [[298.5, -489.4], [322.0, -477.9]],
    w124874480: [[397.5, -509.9], [370.6, -530.7], [363.7, -524.4]], w124874496: [[326.4, -500.7], [354.1, -476.7]],
    w117012334: [[285.8, -531.4], [310.9, -524.2]], w117012170: [[340.7, -537.5], [315.2, -549.3]],
    w117012164: [[360.4, -564.1], [371.1, -550.4]], w117012140: [[445.6, -544.7], [404.3, -543.1]]
  };
  for (const [id, pts] of Object.entries(corners)) for (const [x, z] of pts) assert.ok(G.get(id).some((r) => r.some(([p, q]) => Math.hypot(p - x, q - z) < 0.15)), `${id}: ${x}, ${z}`);
});

test('the heights: the surveyed roofs, the floors adding up under them, the windows within their storeys', () => {
  const tops = {
    hall: [-13.5, -0.21], chalet: [0.64], block39: [-2.74], office: [-5.29], stiffler: [-3.0], pink: [-0.59, 1.36, 1.46],
    garages: [-10.22], garages2: [-10.99], herti: [-2.91], cresta: [-10.52, -10.02, -2.73, -9.21], yellow: [1.15, 3.46], loggia: [1.62],
    bungalow: [-8.3], annex: [-1.51]
  };
  for (const h of HOUSES) {
    assert.deepEqual(h.parts.map((p) => p.top), tops[h.id], h.id);
    for (const p of h.parts) {
      const L = lookFor(h, p), wt = wallTopOf(h, p);
      assert.ok(wt > h.floor + 3 && wt <= p.top + 1e-9, `${h.id}: the walls' top under the roof`);
      assert.ok(L.win[1] > 0.05 && L.win[2] < 0.95 && L.win[1] < L.win[2] && L.win[0] > 0.1 && L.win[0] <= 0.5, `${h.id}: a window within its storey and bay`);
      if (!L.floors || p.from !== undefined || L.closed) continue;
      // the storeys up to the walls' top, a band of at most a metre and a half over the last
      const over = wt - (h.floor + L.floors * L.storey);
      assert.ok(over > -1e-6 && over < 1.5, `${h.id}: ${L.floors} storeys of ${L.storey} m under ${wt.toFixed(2)} (${over.toFixed(2)})`);
    }
    assert.ok(baseOf(h) < h.floor - 0.5, 'the walls reach under the ground');
  }
  // the chalet's saddle roof: the ridge at the survey's top, the eaves over the fifth storey, an overhang all round
  const ch = HOUSES.find((h) => h.id === 'chalet'), part = ch.parts[0], S = saddleFrame(part);
  assert.ok(Math.abs(saddleY(part, S, S.cr) - 0.64) < 1e-9 && Math.abs(saddleY(part, S, S.w0) - part.roof.eaves) < 1e-9);
  assert.ok(Math.abs(ch.floor + 5 * ch.look.storey - part.roof.eaves) < 0.01);
  for (const [x, z] of part.ring) {
    const [t, c] = S.loc([x, z]);
    assert.ok(t > S.t0 + 0.5 && t < S.t1 - 0.5 && c > S.c0 + 0.5 && c < S.c1 - 0.5);
  }
  assert.ok(ch.chimney.top > 0.64 + 0.5 && pointInRing(part.ring, ...ch.chimney.at));
  // the hipped roof's eaves outline round its walls
  const b = HOUSES.find((h) => h.id === 'block39').parts[0];
  for (const [x, z] of b.ring) assert.ok(pointInRing(b.roof.ring, x, z));
  // every roof outline covers its walls' corners (the eaves stand out or flush)
  for (const { house, part: p } of allParts()) {
    const R = roofRingOf(p);
    // (or under another part's roof: the stair towers over the salmon block's entrances)
    const under = (Q, x, z) => pointInRing(Q, x, z) || edgeDistance(Q, x, z) < 0.3;
    for (const [x, z] of p.ring) assert.ok(under(R, x, z) || house.parts.some((q) => q !== p && under(roofRingOf(q), x, z)), `${house.id}: ${x}, ${z} under the roof`);
  }
});

test('the faces named for balconies, doors, garage doors and signs exist, everything within its wall', () => {
  for (const h of HOUSES) {
    for (const spec of [...(h.balconies || []), ...(h.doors || []), ...(h.gates || []), ...[h.sign, h.billboard, h.canopy].filter(Boolean)]) {
      const part = h.parts[spec.part];
      assert.ok(part, `${h.id}: part ${spec.part}`);
      const F = faceWall(part.ring, spec.deg, spec.tol ?? 40);
      assert.ok(F && F.len > 3, `${h.id}: a wall facing ${spec.deg}°`);
      if (spec.all) assert.ok(faceWalls(part.ring, spec.deg, spec.tol ?? 40).length >= 1);
      if ('at' in spec) assert.ok(spec.at * F.len - spec.w / 2 > 0.3 && spec.at * F.len + spec.w / 2 < F.len - 0.3, `${h.id}: a door within its wall`);
      if ('from' in spec) assert.ok(spec.from >= 0 && spec.to <= 1 && spec.from < spec.to);
      if ('floors' in spec) for (const k of spec.floors) assert.ok(k >= 1 && k < lookFor(h, part).floors, `${h.id}: a balcony on a storey of the house`);
    }
  }
  // the hotel's name between the second and the third floor's windows, over the low wing's roof
  const cr = HOUSES.find((h) => h.id === 'cresta'), L = lookFor(cr, cr.parts[2]);
  assert.ok(cr.sign.y0 > 2 * L.storey + L.win[2] * L.storey + 0.05 && cr.sign.y1 < 3 * L.storey + L.win[1] * L.storey - 0.05);
  assert.ok(cr.floor + cr.sign.y0 > cr.parts[0].top);
  // the billboard on the Stiffler hall's front, down the Talstrasse (west-south-west), under its roof
  const st = HOUSES.find((h) => h.id === 'stiffler');
  assert.ok(st.floor + st.billboard.y1 < st.parts[0].top - 0.5 && st.billboard.y0 > st.canopy.y + 0.5);
});

test('the neighbours: nothing of the row in another building, the Kongresszentrum\'s or the Promenade\'s', async () => {
  const mine = new Set(OSM_IDS);
  const outlines = [...groundOutlines().values()].flat();
  const near = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id) && b.ring[0] > -60 && b.ring[0] < 520 && b.ring[1] > -680 && b.ring[1] < -240);
  assert.ok(near.length > 20);
  for (const b of near) {
    const r = osmRing(b.id);
    for (const ring of outlines) {
      // (OpenStreetMap's outlines stand up to a metre off the survey's: deeper than 1.2 m is an overlap)
      for (const [x, z] of ring) assert.ok(depthIn(r, x, z) < 1.2, `the row at ${x}, ${z} inside ${b.id}`);
      for (const [x, z] of r) assert.ok(depthIn(ring, x, z) < 1.2, `${b.id} at ${x}, ${z} inside the row`);
    }
  }
  // the hand-built Kongresszentrum and Kongress Hotel
  for (const p of KONGRESS.parts) {
    const r = [];
    for (let i = 0; i < p.ring.length; i += 2) r.push([p.ring[i], p.ring[i + 1]]);
    for (const ring of outlines) {
      for (const [x, z] of ring) assert.ok(!pointInRing(r, x, z));
      for (const [x, z] of r) assert.ok(!pointInRing(ring, x, z));
    }
  }
  // the middle Promenade row and the other Talstrasse stretches, where they are there
  const others = readdirSync(new URL('../js/', import.meta.url)).filter((n) => /^(promenade-mitte|talstrasse-(?!3-)[\w-]+)-data\.js$/.test(n));
  for (const f of others) {
    const mod = await import(new URL(`../js/${f}`, import.meta.url));
    // (a row's every outline, or a house's)
    const got = typeof mod.allOutlines === 'function' ? mod.allOutlines() : typeof mod.groundOutlines === 'function' && mod.groundOutlines.length === 0 ? mod.groundOutlines() : [];
    const rings = got instanceof Map ? [...got.values()].flat() : got;
    for (const r of rings) for (const [x, z] of r) assert.ok(!insideRow(x, z), `${f}: ${x}, ${z} inside the row`);
  }
});

test('the exclusions: one a surveyed batch, each in a house of the row', () => {
  assert.equal(EXCLUDE.length, 12);
  const outlines = [...groundOutlines().values()].flat();
  for (const e of EXCLUDE) {
    assert.equal(e.r, 3);
    assert.ok(outlines.some((r) => pointInRing(r, e.x, e.z) || r.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 12)), `${e.x}, ${e.z}`);
  }
  for (let i = 0; i < EXCLUDE.length; i++) for (let j = i + 1; j < EXCLUDE.length; j++) assert.ok(Math.hypot(EXCLUDE[i].x - EXCLUDE[j].x, EXCLUDE[i].z - EXCLUDE[j].z) > 6);
});

test('the missions\' doors and starts near the row stay outside it', async () => {
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
  assert.ok(points.length > 20, 'the missions\' places read');
  const near = points.filter(([x, z]) => x > -20 && x < 470 && z > -620 && z < -280);
  assert.ok(near.length >= 3);
  for (const [x, z] of near) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
  // the radar mission starts on the Talstrasse before the Hotel Cresta Sun, 1.5 m clear of its walls at least
  for (const ring of [...groundOutlines().values()].flat()) assert.ok(depthIn(ring, 360.8, -530.8) === 0);
});

test('the row in Node: every vertex finite, four meshes, the phone\'s materials, no colliders of its own, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { buildTalstrasse3 } = await import('../js/talstrasse-3.js');
  for (const [id, rings] of groundOutlines()) assert.deepEqual(SURVEYED_FOOTPRINTS.get(id), rings, id);
  // the atlas' cells apart and within it
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= ATLAS_SIZE[0] && y + h <= ATLAS_SIZE[1]);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'cells apart');
  }
  // (SIMPLE_SKINS' materials marked as they are made: on the phone every material is one of them, the trim's vertex
  // colours or the decals' plain texture, as .claude/skills/gebaeude-nach-foto/scripts/mobile-check.mjs checks)
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const lowest = Math.min(...HOUSES.map(baseOf)), highest = Math.max(...allParts().map(({ part }) => part.top));
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildTalstrasse3(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Talstrasse 3 ', '')).sort();
    assert.deepEqual(names, ['decal', 'roof', 'trim', 'walls']);
    let tris = 0;
    for (const m of group.children) {
      assert.ok(m.material, `${m.name}: a material`);
      if (simple) {
        const M = m.material, decal = M.opacityNode && M.transparent && !M.emissiveNode && !M.roughnessNode;
        const procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
        assert.ok(M.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
      }
      const g = m.geometry, p = g.attributes.position;
      assert.ok(p.count > 0);
      tris += p.count / 3;
      for (const a of Object.values(g.attributes)) {
        assert.equal(a.count, p.count, `${m.name}: an attribute of every vertex`);
        for (let i = 0; i < a.array.length; i++) assert.ok(Number.isFinite(a.array[i]), `${m.name}: a value`);
      }
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > lowest - 0.5 && p.array[i] < highest + 1.0, `${m.name}: a height of ${p.array[i]}`);
      // everything near a house of the row (its roof's overhang, a balcony's or a canopy's reach)
      for (let i = 0; i < p.array.length; i += 3) {
        const x = p.array[i], z = p.array[i + 2];
        assert.ok(allParts().some(({ part }) => pointInRing(roofRingOf(part), x, z) || wallsOf(roofRingOf(part)).some((F) => {
          const t = (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1], o = (x - F.a[0]) * F.n[0] + (z - F.a[1]) * F.n[1];
          return t > -1.5 && t < F.len + 1.5 && o > -0.5 && o < 4.3;
        })), `${m.name}: a vertex out at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      }
    }
    assert.ok(tris < 15000, `${tris} triangles`);
    if (simple) assert.ok(group.children.find((m) => m.name.endsWith('walls')).material.vertexColors, 'the phone\'s walls in their own colours');
  }
});
