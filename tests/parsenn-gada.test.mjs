import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARSENN_GADA, annexRoofY, blockDoor, blockRoofY, groundOutlines, inside, onWall, outwardRing, pointInRing, ringArea2, roofRing, splitAtT, toLocal,
  towerRoofY, wallFrame, windowLine
} from '../js/parsenn-gada-data.js';
import { PARSENN, groundOutlines as hotelOutlines } from '../js/sport-hotel-parsenn-data.js';
import { POND } from '../js/missions-data-outdoor.js';

const P = PARSENN_GADA;
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;

test('the outlines: of some size, the walls facing out, keeping off the hotel\'s', () => {
  for (const ring of groundOutlines()) {
    assert.ok(Math.abs(ringArea2(ring)) / 2 > 25, 'an outline of some size');
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 2) continue;
      assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.2)), 'a step out of a wall leaves the outline');
      assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.2)), 'a step in stays in it');
    }
  }
  // the block and the annex keep off the hotel's outlines (its narrow wing, its wing across the yard): a point inside
  // them lies in none of the hotel's
  for (const ring of [P.block.ring, P.annex.ring]) {
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 2) continue;
      const q = onWall(F, F.len / 2, -0.3);
      assert.ok(!hotelOutlines().some((h) => pointInRing(h, ...q)), `a point within ${R[i]} → ${R[(i + 1) % R.length]}`);
    }
  }
  // (the block's walls on the hotel's: the narrow wing's corner and point, the yard wing's corners)
  for (const q of [P.block.ring[0], P.block.ring[P.block.ring.length - 1]]) assert.ok(PARSENN.hotel.some((h) => near(h, q)));
  const yw = PARSENN.yardWing;
  assert.ok(P.block.ring.filter((q) => yw.some((h) => near(h, q))).length === 2);
});

test('the roofs: the block\'s ridge at 14.0 with its eaves at 10.5, the tower\'s hipped roof, the annex under the block\'s eaves', () => {
  const R = P.block.ridge;
  assert.ok(Math.abs(blockRoofY(R.t) - 14.0) < 1e-9);
  assert.ok(Math.abs(blockRoofY(-0.7) - 10.5) < 0.05 && Math.abs(blockRoofY(17.53) - 10.5) < 0.05);
  // (the survey's points on the slopes: 670.7 10.7 −1412.4 and 682.4 11.2 −1402.1)
  assert.ok(Math.abs(blockRoofY(toLocal(670.7, -1412.4)[0]) - 10.7) < 0.15);
  assert.ok(Math.abs(blockRoofY(toLocal(682.4, -1402.1)[0]) - 11.2) < 0.15);
  // the roof's outline covers the block's walls but stays off the hotel's wing across the yard
  for (const q of P.block.ring) {
    const [t, c] = toLocal(...q);
    assert.ok(pointInRing(P.block.roof, t, c) || P.block.roof.some((r) => Math.hypot(r[0] - t, r[1] - c) < 1.2) || t < 0.3, `under the roof: ${q}`);
  }
  const yw = PARSENN.roofs.find((r) => r.id === 'yard-wing');
  const [ct, cc] = [(yw.poly[0][0] + yw.poly[2][0]) / 2, (yw.poly[0][1] + yw.poly[2][1]) / 2];
  assert.ok(!pointInRing(P.block.roof, ct, cc), 'the yard wing\'s roof is the hotel\'s');
  // split at the ridge: two halves of the same area
  const [lo, hi] = splitAtT(P.block.roof, R.t);
  assert.ok(lo && hi);
  assert.ok(Math.abs(Math.abs(ringArea2(lo)) + Math.abs(ringArea2(hi)) - Math.abs(ringArea2(P.block.roof))) < 1e-6);
  // the tower: its eaves and ridge, its walls' top under the roof at the walls
  const T = P.tower;
  for (const q of T.eaves.ring) assert.ok(Math.abs(towerRoofY(...q) - T.eaves.y) < 0.02);
  assert.ok(Math.abs(towerRoofY(...T.ridge.a) - T.ridge.y) < 0.02);
  for (const q of T.ring) assert.ok(towerRoofY(...q) >= T.top - 0.12 && towerRoofY(...q) < T.top + 0.25, `the roof over the corner ${q}`);
  assert.ok(T.top > blockRoofY(R.t) + 4, 'the tower over the block\'s ridge');
  // the annex: its ridge at 5.0, its eaves at 3.5, well under the block's eaves
  assert.ok(Math.abs(annexRoofY(P.annex.ridge.c) - 5.0) < 1e-9);
  assert.ok(Math.abs(annexRoofY(19.35) - 3.5) < 0.05 && Math.abs(annexRoofY(27.2) - 3.5) < 0.05);
  for (const q of roofRing(P.annex.roof)) assert.ok(annexRoofY(toLocal(...q)[1]) < 5.01);
});

test('the floors add up: four under the block\'s eaves, six in the tower, two in the annex', () => {
  const { storey, line, foot } = P;
  assert.ok(Math.abs(line - storey - foot) < 1e-9);
  assert.equal(windowLine(blockRoofY(-0.4)), line + 3 * storey);
  assert.equal(windowLine(blockRoofY(16.5)), line + 3 * storey);
  assert.equal(windowLine(P.tower.top), line + 6 * storey);
  assert.equal(windowLine(annexRoofY(20.1)), line + storey);
  // (the ground floor's foot over the ground round the house: y −2.6 at the highest)
  assert.ok(foot < -2.55);
  // the balcony at the tower's top floor's foot, over the hotel's roof
  assert.ok(Math.abs(P.tower.balcony.y - (line + 5 * storey)) < 1e-9);
  assert.ok(P.tower.balcony.y > PARSENN.roofs.find((r) => r.id === 'north-east').at[2] - 2);
});

test('the doors: on their walls, facing the Seeli; the tower\'s balcony on its face towards the yard', () => {
  const { F, s } = blockDoor(), d = P.block.door;
  assert.ok(F.n[1] < -0.7, 'the gable faces north-north-east');
  assert.ok(s - d.w / 2 > 1 && s + d.w / 2 < F.len - 1);
  assert.ok(!inside(...onWall(F, s, 0.6)) && inside(...onWall(F, s, -0.3)));
  const A = wallFrame(P.annex.door.a, P.annex.door.b);
  assert.ok(A.n[1] < -0.7 && P.annex.door.w < A.len - 1);
  assert.ok(!inside(...onWall(A, A.len / 2, 0.6)) && pointInRing(P.annex.ring, ...onWall(A, A.len / 2, -0.3)));
  const Bc = P.tower.balcony, T = wallFrame(Bc.a, Bc.b);
  assert.ok(T.n[0] > 0.7, 'facing the yard (east-south-east)');
  assert.ok(!pointInRing(P.tower.ring, ...onWall(T, T.len / 2, 0.5)) && Bc.w < T.len - 1);
});

test('nothing of the house stands on the missions\' places nearby', () => {
  const spots = [];
  // (the pond hockey's on the Seeli: its start, its pin by the gable, its spot)
  for (const k of ['start', 'pin', 'spot']) if (POND[k] && Math.hypot(POND[k].x - 680, POND[k].z + 1405) < 60) spots.push(POND[k]);
  assert.ok(spots.length > 0, 'the hockey\'s pin by the Seeli');
  for (const p of spots) {
    assert.ok(!inside(p.x, p.z));
    for (const ring of groundOutlines()) {
      const R = outwardRing(ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]), dx = p.x - F.a[0], dz = p.z - F.a[1];
        const s = Math.max(0, Math.min(F.len, dx * F.u[0] + dz * F.u[1])), [x, z] = onWall(F, s);
        assert.ok(Math.hypot(p.x - x, p.z - z) > 1.5, 'a step clear of the walls');
      }
    }
  }
  // (the Parsenn Gada bar's sign is on the hotel's narrow wing: not in this house)
  assert.ok(!inside(664.9, -1401.9));
});

test('the house in Node: every vertex finite, four meshes, no colliders of its own; the phone\'s plain skins', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  // (SIMPLE_SKINS' materials marked, as the skill's mobile-check.mjs does)
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildParsennGada } = await import('../js/parsenn-gada.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  assert.equal(SURVEYED_FOOTPRINTS.get(P.osm).length, 3);
  for (const simple of [false, true]) {
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildParsennGada(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name).sort();
    assert.deepEqual(names, ['Parsenn Gada decal', 'Parsenn Gada plaster', 'Parsenn Gada roof', 'Parsenn Gada trim']);
    for (const m of group.children) {
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > P.base - 1.5 && p.array[i] < 20.5, `${m.name}: a height of ${p.array[i]}`);
      for (let i = 0; i < p.array.length; i += 3) assert.ok(Math.hypot(p.array[i] - 679, p.array[i + 2] + 1405) < 25, `${m.name}: near the house`);
      if (simple) {
        // (the phone: SIMPLE_SKINS' materials, the plain vertex-coloured trim, the decal)
        const mat = m.material;
        const decal = mat.opacityNode && mat.transparent && !mat.emissiveNode && !mat.roughnessNode;
        const procedural = mat.colorNode || mat.emissiveNode || mat.roughnessNode || mat.normalNode || mat.positionNode;
        assert.ok(mat.userData.simpleSkin || decal || !procedural || mat.map, `${m.name}: a full shader on the phone`);
      }
    }
  }
});
