import test from 'node:test';
import assert from 'node:assert/strict';
import { P, SCHNEIDERS, SIDES, corners, dormer, floorFoot, groundOutlines, houseRing, onWall, outwardRing, pointInRing, reach, ridgeEnds, ringArea2, roofY, side, uw, wallFrame, windowsFrom } from '../js/schneiders-data.js';
import { POST_ROUTE } from '../js/missions-data-post.js';

const S = SCHNEIDERS;
const near = (p, q, d) => Math.hypot(p[0] - q[0], p[1] - q[1]) < d;
/** The distance from a point to a ring's walls */
function toWalls(ring, x, z) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return d;
}

test('the house stands on the surveyed walls under the surveyed roof', () => {
  const C = corners();
  // the walls' feet the survey gives (batch 21: the north and the east corners), OSM's walls within 1.2 m
  assert.ok(near(C.N, [-473.6, -272.6], 0.15) && near(C.E, [-464.6, -261.3], 0.15));
  for (const q of Object.values(C)) assert.ok(toWalls(S.footprint, ...q) < 1.2, `${q}: near OSM's outline`);
  // the eaves' corners and the ridge's ends
  const R = S.roof;
  for (const [u, w, q] of [[0, 0, [-463.6, -261.2]], [R.length, 0, [-473.5, -273.7]], [R.length, R.width, [-484.5, -264.9]], [0, R.width, [-474.6, -252.4]]]) assert.ok(near(P(u, w), q, 0.2), `eaves ${q}`);
  const [se, nw] = ridgeEnds();
  assert.ok(near(se, [-469.9, -256.1], 0.3) && near(nw, [-479.9, -268.6], 0.3));
  // the heights: the north-east eaves at 9.8–10.2, the south-west ones at 12.9, the ridge at 18.5
  assert.ok(Math.abs(roofY(uw(-473.5, -273.7)[1]) - 9.9) < 0.3 && Math.abs(roofY(uw(-484.5, -264.9)[1]) - 12.9) < 0.15);
  assert.ok(Math.abs(roofY(uw(-479.9, -268.6)[1]) - 18.5) < 0.1 && Math.abs(roofY(uw(-473.3, -262.9)[1]) - 16.8) < 0.15);
  // the dormer within 0.6 m of the surveyed one (its eaves' feet at u 4.73 and 10.43; here centred on the wall's bays)
  const D = dormer(), u0 = S.walls.u0;
  assert.ok(Math.abs(u0 + D.s0 - uw(-466.8, -264.7)[0]) < 0.6 && Math.abs(u0 + D.s1 - uw(-470.3, -269.2)[0]) < 0.6);
  assert.ok(Math.abs(D.wBack - uw(-473.1, -266.9)[1]) < 0.3, 'its eaves meet the roof where the survey has them');
  // the annex: an outline of some size before the south-east gable
  assert.ok(Math.abs(ringArea2(S.annex.ring)) / 2 > 12 && S.annex.top < S.street - 2);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const ring of [houseRing(), outwardRing(S.annex.ring)]) {
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 1) continue;
      const [x, z] = onWall(F, F.len / 2, 0.2);
      assert.ok(!pointInRing(ring, x, z), `wall ${i} faces out`);
    }
  }
  // the sides run round the house as wallFrame wants them: the gable on the Promenade faces north-west (−z, −x)
  const nw = side('nw').F;
  assert.ok(nw.n[0] < -0.5 && nw.n[1] < -0.5);
  assert.ok(side('ne').F.n[0] > 0.5 && side('se').F.n[1] > 0.5 && side('sw').F.n[0] < -0.5);
});

test('the floors add up: the ground floor and two under the north-east eaves, the attic and the top floor in the gables', () => {
  const R = S.roof, W = S.win, line = floorFoot(2);
  // the ground floor on the Promenade, 4.2 m; the first and the second floors, the frieze under the eaves
  assert.ok(Math.abs(S.foot - S.street - 4.2) < 1e-9);
  const neTop = side('ne').roofAt(0);
  assert.ok(line - S.storey + W.hi < neTop - 1.0 && line < neTop);
  assert.ok(Math.abs(neTop - 10.69) < 0.05 && Math.abs(side('sw').roofAt(0) - 13.64) < 0.05);
  // five floors on the Promenade under the ridge
  assert.equal(Math.round((R.ridge - S.street - (S.foot - S.street)) / S.storey), 4);
  for (const id of ['nw', 'se']) {
    const sd = side(id), F = sd.F;
    // the gable's apex over the bays' middle, the top floor's window there
    assert.ok(Math.abs(sd.roofAt(sd.mid) - R.ridge) < 1e-6 && sd.top.length === 1 && Math.abs(sd.top[0] - sd.mid) < 1e-9);
    // the windows' strips stand under the roof's line on both ends
    for (const [cols, y1] of [[sd.attic, line + S.storey], [sd.top, S.timber]]) {
      const a = cols[0] - reach() - 0.04, b = cols[cols.length - 1] + reach() + 0.04;
      assert.ok(a > 0.9 && b < F.len - 0.9, `${id}: within the wall, clear of the quoins`);
      assert.ok(sd.roofAt(a) > y1 + 0.2 && sd.roofAt(b) > y1 + 0.2, `${id}: the windows from ${a.toFixed(2)} to ${b.toFixed(2)} under the roof`);
    }
    // a window's head in the top floor under the timber apex
    assert.ok(line + S.storey + W.hi < S.timber - 0.2);
  }
  // every side's lower windows within its wall, clear of the quoins
  for (const id of SIDES) {
    const sd = side(id);
    if (!sd.cols.length) continue;
    assert.ok(sd.cols[0] - reach() > S.quoins.w - 0.05 && sd.cols[sd.cols.length - 1] + reach() < sd.F.len - S.quoins.w + 0.05, id);
  }
  // the dormer: over the wall's middle bay, its window's head under its eaves
  const D = dormer(), ne = side('ne');
  assert.ok(Math.abs(ne.dormer[0] - D.mid) < 1e-9 && ne.cols.some((c) => Math.abs(c - D.mid) < 1e-9));
  assert.ok(line + W.hi < S.dormer.eave - 0.5 && D.s0 < D.mid - reach() - 0.3 && D.s1 > D.mid + reach() + 0.3);
  // windows begin over the ground: the first floor's foot whose windows clear it
  for (let hi = -12; hi < 8; hi += 0.37) {
    const f = windowsFrom(hi);
    assert.ok(f + W.lo >= hi - 1e-9 && f + W.lo - S.storey < hi);
    assert.ok(Math.abs((f - S.foot) / S.storey - Math.round((f - S.foot) / S.storey)) < 1e-9);
  }
});

test('the shop front, the awning, the name and the balconies on the gable on the Promenade', () => {
  const sd = side('nw'), len = sd.F.len, Sh = S.shop, A = Sh.awning, N = Sh.name, Bl = S.balconies, W = S.win;
  // the openings within the wall, apart, the doors between the shop windows
  const open = [...Sh.windows, Sh.door].sort((p, q) => p[0] - q[0]);
  assert.ok(open[0][0] > 0.9 && open[open.length - 1][1] < len - 0.5);
  for (let i = 1; i < open.length; i++) assert.ok(open[i][0] - open[i - 1][1] >= 0.4);
  assert.ok(Sh.door[0] > Sh.windows[0][1] && Sh.door[1] < Sh.windows[1][0]);
  assert.ok(Sh.sill > S.street && Sh.head < A.y - A.drop && Sh.head < S.foot);
  // the awning over the ground floor: under the name, its valance over the passers-by's heads
  assert.ok(A.y < N.y0 && A.y > Sh.head && A.y - A.drop - A.valance > S.street + 2.5);
  // the name over it, under the first floor's grilles, clear of the quoins
  assert.ok(N.y1 < S.foot + W.lo - 0.12 && N.s0 > S.quoins.w && N.s1 < A.s1);
  // the balconies before the west bay, clear of the awning, on the floors' feet, the top one under the roof
  assert.ok(sd.cols.some((c) => c - W.half > Bl.s0 && c + W.half < Bl.s1));
  assert.ok(Bl.s0 > A.s1 && Bl.s1 < len - 0.5);
  for (const y of Bl.levels) assert.ok(Math.abs((y - S.foot) / S.storey - Math.round((y - S.foot) / S.storey)) < 1e-9 && y + 1.2 < sd.roofAt(Bl.s1));
});

test('the player\'s walls: the house\'s outline and the annex\'s', () => {
  const rings = groundOutlines();
  assert.equal(rings.length, 2);
  for (const ring of rings) for (const [x, z] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(z));
  // the annex against the house's south-east gable (its inner corners on the wall)
  const se = side('se').F;
  const onSe = S.annex.ring.filter(([x, z]) => {
    const dx = x - se.a[0], dz = z - se.a[1];
    return Math.abs(dx * se.n[0] + dz * se.n[1]) < 0.15;
  });
  assert.ok(onSe.length >= 3);
});

test('the post van\'s way along the Promenade (js/missions-data-post.js) passes clear of the house, its awning and its balconies', () => {
  const nw = side('nw').F, out = Math.max(S.shop.awning.out, S.balconies.out);
  let best = Infinity, bestFront = Infinity;
  for (let i = 0; i + 3 < POST_ROUTE.length; i += 2) {
    const a = [POST_ROUTE[i], POST_ROUTE[i + 1]], b = [POST_ROUTE[i + 2], POST_ROUTE[i + 3]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.5));
    if (Math.min(Math.hypot(a[0] + 474, a[1] + 263), Math.hypot(b[0] + 474, b[1] + 263)) > L + 40) continue;
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
      for (const ring of groundOutlines()) {
        assert.ok(!pointInRing(ring, x, z));
        best = Math.min(best, toWalls(ring, x, z));
      }
      // (before the gable: m out of it)
      const dx = x - nw.a[0], dz = z - nw.a[1], s = dx * nw.u[0] + dz * nw.u[1];
      if (s > 0 && s < nw.len) bestFront = Math.min(bestFront, dx * nw.n[0] + dz * nw.n[1]);
    }
  }
  assert.ok(best > 2.5, `the van passes ${best.toFixed(2)} m from a wall`);
  assert.ok(bestFront === Infinity || bestFront > out + 1.0, `and ${bestFront.toFixed(2)} m before the gable`);
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
  const { buildSchneiders, ATLAS } = await import('../js/schneiders.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(S.osm), groundOutlines());
  // the atlas' cells inside it (1024 × 816), not overlapping
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 816);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `cells ${i} and ${j}`);
    }
  }
  const scene = new THREE.Scene();
  const { group, colliders } = buildSchneiders(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Schneiders decal', 'Schneiders glass', 'Schneiders plaster', 'Schneiders roof', 'Schneiders trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > S.base - 1 && p.array[i] < 20.5, `${m.name}: a height of ${p.array[i]}`);
    for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i] > -490 && p.array[i] < -458 && p.array[i + 2] > -279 && p.array[i + 2] < -247, `${m.name}: within the plot`);
  }
  // the walls carry their half lengths, the roof reaches the ridge
  assert.ok(group.children.find((m) => m.name === 'Schneiders plaster').geometry.attributes.aHalf);
  const roof = group.children.find((m) => m.name === 'Schneiders roof').geometry.attributes.position.array;
  let top = -Infinity;
  for (let i = 1; i < roof.length; i += 3) top = Math.max(top, roof[i]);
  assert.ok(Math.abs(top - S.roof.ridge) < 0.05);
  // the decals stand on the house (within 1.6 m of its walls: the balconies' and the awning's out from it)
  const dec = group.children.find((m) => m.name === 'Schneiders decal').geometry.attributes.position.array;
  for (let i = 0; i < dec.length; i += 3) {
    const x = dec[i], z = dec[i + 2];
    assert.ok(pointInRing(houseRing(), x, z) || toWalls(houseRing(), x, z) < 1.6, `a decal's corner at ${x.toFixed(1)} ${z.toFixed(1)}`);
  }
});

test('the phone\'s build: only SIMPLE_SKINS\' materials, the trim and the decals', async () => {
  await stubCanvas();
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { buildSchneiders } = await import('../js/schneiders.js');
  const saved = { ...SIMPLE_SKINS }, was = QUALITY.simpleMaterials;
  for (const k of Object.keys(saved)) SIMPLE_SKINS[k] = (...a) => { const m = saved[k](...a); m.userData.simpleSkin = k; return m; };
  QUALITY.simpleMaterials = true;
  try {
    const { group } = buildSchneiders(new THREE.Scene());
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
