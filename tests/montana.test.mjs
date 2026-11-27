import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONTANA, atticStretch, bays, gableFrame, gableRoof, groundOutlines, onWall, outwardRing, part, partAt, pointInRing, ringArea2, roofHeight, wallFrame,
  wallNear, wallStretches, windowedTop
} from '../js/montana-data.js';
import { GIPFELI_HOTELS } from '../js/missions-data-local.js';
import { bioStops } from '../js/missions-data-rural.js';
import { PHARMACY } from '../js/missions-data-pharmacy.js';
import { SHOPS_DATA } from '../js/shops-data.js';

/** How far (x, z) lies from the nearest wall of a ring */
const ringDist = (ring, x, z) => Math.min(...ring.map((a, i) => {
  const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}));
/** How far (x, z) lies from the hotel (0 inside it) */
const hotelDist = (x, z) => (partAt(x, z) ? 0 : Math.min(...MONTANA.parts.map((p) => ringDist(p.ring, x, z))));

test('the Montana\'s volumes: outlines of some size, each streamed volume left out lies under one', () => {
  for (const p of MONTANA.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 40, `${p.id}: an outline of some size`);
    assert.ok(p.roof || Number.isFinite(p.top), `${p.id}: a roof`);
  }
  assert.equal(MONTANA.exclude.length, 5);
  for (const e of MONTANA.exclude) assert.ok(partAt(e.x, e.z), `the streamed volume at ${e.x}, ${e.z} lies under the rebuilt one`);
  // the heights as surveyed: the flat-topped block over the gables, the gables over the south block, the wing and the
  // annex low before them
  assert.ok(part('tower').top > part('cross').roof.ridge && part('cross').roof.ridge > part('east').roof.ridge && part('east').roof.ridge > part('west').roof.ridge);
  assert.ok(part('south').top < part('west').roof.eaves[0] && part('wing').top < 10 && part('bar').top < 11 && part('veranda').top < 6);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of MONTANA.parts) {
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

test('the gabled blocks: their frames fit the surveyed corners, the roofs reach the surveyed heights', () => {
  for (const id of ['west', 'cross', 'east']) {
    const p = part(id), Q = gableRoof(p);
    // (the fourth corner as the frame puts it, within half a metre of the survey's)
    const [cx, cz] = Q.at(Q.L, Q.W);
    assert.ok(Math.hypot(cx - p.ring[2][0], cz - p.ring[2][1]) < 0.6, `${id}: its corners square`);
    assert.ok(Q.r > 2 && Q.r < Q.W - 2, `${id}: the ridge between the eaves`);
    assert.ok(Math.abs(roofHeight(p, Q.L / 2, 0) - Q.E0) < 1e-9 && Math.abs(roofHeight(p, Q.L / 2, Q.W) - Q.E1) < 1e-9);
    assert.ok(Math.abs(roofHeight(p, Q.L / 2, Q.r) - Q.R) < 1e-9, `${id}: the ridge's height`);
    // the gables' profile: from eave to eave, never over the ridge
    assert.equal(Q.profile[0][0], 0);
    assert.ok(Math.abs(Q.profile[Q.profile.length - 1][0] - Q.W) < 1e-9);
    for (const [, y] of Q.profile) assert.ok(y <= Q.R + 1e-9 && y >= Math.min(Q.E0, Q.E1) - 1e-9);
  }
  // the north-west block's jerkinheads: the gables' flat top at 24.3 over 2.3 m or so (the survey's), the ridge 0.7 m in
  const W = gableRoof(part('west'));
  assert.ok(W.t1 - W.t0 > 1.8 && W.t1 - W.t0 < 3.0, `the jerkinhead's foot ${(W.t1 - W.t0).toFixed(2)} m`);
  assert.ok(Math.abs(roofHeight(part('west'), 0, W.r) - 24.3) < 1e-9 && Math.abs(roofHeight(part('west'), 0.7, W.r) - 25.6) < 1e-9);
  // (the cross wing's ridge runs across the north-west block's: its frame turned 90° to that one)
  const a = gableFrame(part('west')), b = gableFrame(part('cross'));
  assert.ok(Math.abs(a.u[0] * b.u[0] + a.u[1] * b.u[1]) < 0.05);
});

test('the floors add up: six to the eaves, the arched row over the bar\'s roof, the attic in the gables', () => {
  const n = (MONTANA.line - MONTANA.floor) / MONTANA.storey;
  assert.ok(Math.abs(n - 6) < 1e-9, 'six floors from the ground floor to the eaves');
  assert.equal(MONTANA.line, part('west').roof.eaves[0], 'the top floor ends at the north-west block\'s eaves');
  const arched = MONTANA.floor + MONTANA.arched * MONTANA.storey;
  assert.ok(arched > part('bar').top - 0.5 && arched + 0.85 > part('bar').top + 0.3, 'the arched windows\' sills over the bar\'s roof');
  // the highest windowed floor under each roof
  assert.equal(windowedTop(part('tower').top), MONTANA.line + 2 * MONTANA.storey);
  assert.equal(windowedTop(part('south').top), part('south').top);
  assert.equal(windowedTop(MONTANA.line), MONTANA.line);
  // the attic's window in each gable: a stretch wide enough round the gable's middle
  for (const id of ['west', 'east']) {
    const A = atticStretch(part(id)), Q = gableRoof(part(id));
    assert.ok(A && A[1] - A[0] > 2.2, `${id}: an attic stretch`);
    assert.ok(A[0] < Q.W / 2 && A[1] > Q.W / 2);
  }
  // three windows across the street gable
  const G = wallNear(part('west'), 833.6, -1520.9);
  assert.equal(bays(G.F.len, MONTANA.bay, G.F.len / 2, 0.55).length, 3);
});

test('the lettering, the door, the bar\'s window and the balconies sit on their walls', () => {
  for (const l of MONTANA.letters) {
    const W = wallNear(part(l.part), l.at[0], l.at[1]);
    assert.ok(W.d < 0.3, `${l.key}: on its wall (${W.d.toFixed(2)} m off)`);
    assert.ok(W.s - l.w / 2 > 0.2 && W.s + l.w / 2 < W.F.len - 0.2, `${l.key}: within its wall`);
    if (l.clear) {
      // (a pier free of windows under it, with arched windows beside)
      const st = wallStretches(part(l.part), W.F);
      const pier = st.find((q) => !q.windows);
      assert.ok(pier && pier.from <= W.s - l.w / 2 && pier.to >= W.s + l.w / 2);
      assert.ok(st.some((q) => q.windows && q.to - q.from > 3), 'arched windows beside the pier');
    }
  }
  // the name on the street gable (facing north-east, smaller z), between the arched row and the next floor's windows
  const name = MONTANA.letters.find((l) => l.key === 'name'), N = wallNear(part('west'), name.at[0], name.at[1]);
  assert.ok(N.F.n[0] > 0.5 && N.F.n[1] < -0.7, 'the street gable faces north-east');
  const archTop = MONTANA.floor + MONTANA.arched * MONTANA.storey + 2.6, nextSill = MONTANA.floor + (MONTANA.arched + 1) * MONTANA.storey + 0.85;
  assert.ok(name.y0 > archTop && name.y1 < nextSill);
  // the wing's front on the street faces north-west, its end south-west
  const [w1, w2] = MONTANA.letters.filter((l) => l.part === 'wing').map((l) => wallNear(part('wing'), l.at[0], l.at[1]).F);
  assert.ok(w1.n[0] < -0.7 && w1.n[1] < -0.5, 'the wing\'s front faces north-west');
  assert.ok(w2.n[0] < -0.5 && w2.n[1] > 0.7, 'the wing\'s end faces south-west');
  const D = MONTANA.door, Dw = wallNear(part(D.part), D.at[0], D.at[1]);
  assert.ok(Dw.d < 0.3 && Dw.s - D.w / 2 > 0.3 && Dw.s + D.w / 2 < Dw.F.len - 0.3);
  assert.ok(Dw.F.n[0] > 0.5 && Dw.F.n[1] < 0, 'the Stube\'s door faces the street (north-east)');
  // (the steps and the board before the door stand on open ground)
  for (const o of [0.6, 1.2]) assert.equal(partAt(...onWall(Dw.F, Dw.s, o)), null);
  assert.equal(partAt(...onWall(Dw.F, Dw.s + D.board.s, D.board.out)), null);
  const Bw = wallNear(part(MONTANA.bar.part), MONTANA.bar.at[0], MONTANA.bar.at[1]);
  assert.ok(Bw.d < 0.3 && Bw.F.len > 2 * (1.05 + 0.4), 'the bar\'s window fits its wall');
  for (const Bc of MONTANA.balconies) {
    const W = wallNear(part(Bc.part), Bc.at[0], Bc.at[1]);
    assert.ok(W.d < 0.3, `balconies on ${Bc.part}`);
    // before open ground, over every roof before them
    const [x, z] = onWall(W.F, W.s, Bc.out / 2), q = partAt(x, z);
    for (const y of Bc.floors) assert.ok(!q || (q.top ?? q.roof.ridge) < y - 0.3, `a balcony at ${y} in ${q && q.id}`);
  }
});

test('the dormers stand on their slopes, the chimneys on the ridge', () => {
  for (const D of MONTANA.dormers) {
    const Q = gableRoof(part(D.part));
    for (const s of D.at) {
      assert.ok(s > (Q.hin || 0) + 1.2 && s < Q.L - (Q.hin || 0) - 1.2, `${D.part}: a dormer within its slope`);
      // (its front over the walls: the slope's foot under it lies on the block's outline)
      const [x, z] = Q.at(s, D.side === 0 ? 1.1 : Q.W - 1.1);
      assert.ok(pointInRing(part(D.part).ring, x, z));
    }
  }
  const Q = gableRoof(part('west'));
  for (const s of MONTANA.chimneys) assert.ok(s > Q.hin + 1 && s < Q.L - Q.hin - 1);
});

test('the player\'s walls on the surveyed outlines; the missions\' places stay clear', () => {
  const rings = groundOutlines();
  assert.equal(rings.length, MONTANA.parts.length);
  for (const r of rings) for (const [x, z] of r) assert.ok(Number.isFinite(x) && Number.isFinite(z));
  // the Gipfeli's delivery on the street before the Stube (js/missions-data-local.js): its middle on open ground, a
  // bike's length off the walls
  const g = GIPFELI_HOTELS.find((h) => h.id === 'montana').road;
  assert.ok(hotelDist(g.x, g.z) > 3, `the Gipfeli's zone ${hotelDist(g.x, g.z).toFixed(1)} m off the walls`);
  // the bio barrel on the verge of the street on the north-west (js/missions-data-rural.js)
  const b = bioStops(1).find((s) => /Montana/.test(s.name));
  assert.ok(hotelDist(b.x, b.z) > 1.2, `the barrel ${hotelDist(b.x, b.z).toFixed(1)} m off the walls`);
  // the pharmacy's door and start across the street (js/missions-data-pharmacy.js)
  assert.ok(hotelDist(PHARMACY.door.x, PHARMACY.door.z) > PHARMACY.door.r + 1);
  assert.ok(hotelDist(PHARMACY.start.x, PHARMACY.start.z) > 3);
  // the shops' signs given way to its own lettering are the hotel's, the bar's and the Stube's
  for (const id of MONTANA.signs) assert.ok(/Montana/.test(SHOPS_DATA.find((s) => s.osm === id).name), id);
});

test('the building in Node: every vertex finite, six meshes, no colliders of its own', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildMontana, ATLAS } = await import('../js/montana.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  for (const id of MONTANA.signs) assert.ok(SHOP_EXCLUSIONS.has(id), 'the generic hanging signs give way');
  assert.equal(SURVEYED_FOOTPRINTS.get(MONTANA.osm).length, MONTANA.parts.length);
  // the atlas' cells apart
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'atlas cells apart');
  }
  const scene = new THREE.Scene();
  const { group, colliders } = buildMontana(scene);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Montana annex', 'Montana decal', 'Montana glass', 'Montana plaster', 'Montana roof', 'Montana trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= MONTANA.base - 0.01 && p.array[i] < 29.5, `${m.name}: a height of ${p.array[i]}`);
    for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i] > 798 && p.array[i] < 857 && p.array[i + 2] > -1530 && p.array[i + 2] < -1477, `${m.name}: a point at ${p.array[i]}, ${p.array[i + 2]}`);
    if (/plaster|annex/.test(m.name)) assert.ok(m.geometry.attributes.aHalf);
  }
  assert.deepEqual(colliders, []);
});
