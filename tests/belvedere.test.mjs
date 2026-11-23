import test from 'node:test';
import assert from 'node:assert/strict';
import { BELVEDERE, FRONT, balconyBays, clearStretches, facesFront, isOldFront, oldLocal, part, toOld, wallStretches } from '../js/belvedere-data.js';
import { onWall, outwardRing, pointInRing, ringArea2, wallFrame } from '../js/spital-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { SHOPS_DATA } from '../js/shops-data.js';

const flat = (ring) => ring.map(([x, z]) => [x, z]);
const edgeOf = (ring, a, b) => ring.some((p, i) => {
  const q = ring[(i + 1) % ring.length], near = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 0.05;
  return (near(p, a) && near(q, b)) || (near(p, b) && near(q, a));
});

test('the Belvédère\'s volumes: outlines of some size within OpenStreetMap\'s footprint, the long wing the highest hotel roof', () => {
  const osm = DAVOS_DATA.buildings.find((b) => b.id === BELVEDERE.osm);
  assert.equal(osm.name, 'Grandhotel Belvédère');
  assert.ok(SHOPS_DATA.some((s) => s.osm === BELVEDERE.osm), 'the hotel has a fascia board to give way to the name on the roof');
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (let i = 0; i < osm.ring.length; i += 2) { lo[0] = Math.min(lo[0], osm.ring[i]); hi[0] = Math.max(hi[0], osm.ring[i]); lo[1] = Math.min(lo[1], osm.ring[i + 1]); hi[1] = Math.max(hi[1], osm.ring[i + 1]); }
  for (const p of BELVEDERE.parts) {
    assert.ok(Math.abs(ringArea2(p.ring)) / 2 > 10, p.id);
    assert.ok(p.top > BELVEDERE.base + 8, `${p.id}: a roof over the base`);
    // (the low part at the east end reaches 4 m past OpenStreetMap's footprint: the survey's batch has it)
    for (const q of p.ring) assert.ok(q[0] > lo[0] - 2 && q[0] < hi[0] + 4.5 && q[1] > lo[1] - 2 && q[1] < hi[1] + 2, `${p.id}: ${q} within the footprint's bounds`);
  }
  const hotel = BELVEDERE.parts.filter((p) => p.walls === 'hotel');
  assert.equal(Math.max(...hotel.map((p) => p.top)), part('long-wing').top);
  assert.ok(part('old-dome').dome.top > part('old-west').top + 5 && part('old-hip').peak > part('old-hip').top);
  // every batch left out lies within the footprint, none twice
  for (const e of BELVEDERE.exclude) assert.ok(e.x > lo[0] && e.x < hi[0] && e.z > lo[1] && e.z < hi[1]);
});

test('the walls face out and the floors add up', () => {
  for (const p of BELVEDERE.parts) {
    const ring = outwardRing(p.ring);
    ring.forEach((a, i) => {
      const F = wallFrame(a, ring[(i + 1) % ring.length]);
      if (F.len > 1) assert.ok(!pointInRing(flat(p.ring), ...onWall(F, F.len / 2, 0.05)), `${p.id}: wall ${i}`);
    });
  }
  // the long wing: six floors of balconies over a ground floor of some 3.5 m above the car park (y −2.4)
  const { storey, balcony } = BELVEDERE, first = part('long-wing').top - balcony.floors * storey;
  assert.ok(Math.abs(first - BELVEDERE.canopy.y) < 1e-9, 'the canopy under the first balconies');
  assert.ok(first - -2.45 > 3.2 && first - -2.45 < 4.2, `a ground floor of ${(first + 2.45).toFixed(2)} m`);
  assert.ok(storey > 2.7 && storey < 3.2);
  // the loggias: four floors from the lower front's terrace up to the east block's roof
  const L = BELVEDERE.loggia;
  assert.equal(L.y0, part('east-front').top);
  assert.equal(L.y1, part('east-block').top);
  assert.ok((L.y1 - L.y0) / L.floors > 2.7 && (L.y1 - L.y0) / L.floors < 3.3);
});

test('the photograph\'s side: the old house\'s fronts, the loggias, the stair and the name face the Promenade', () => {
  for (const f of BELVEDERE.oldFront) {
    const F = wallFrame(f.a, f.b);
    assert.ok(facesFront(F, 0.99), `${f.key} faces south-south-east`);
    assert.ok(F.a[0] < f.b[0], `${f.key}: the west end on the left`);
    assert.ok(BELVEDERE.parts.some((p) => edgeOf(p.ring, f.a, f.b)), `${f.key} is a wall of a volume`);
    assert.ok(isOldFront(f.a, f.b) && isOldFront(f.b, f.a));
  }
  for (const l of [...BELVEDERE.loggias, BELVEDERE.stair]) {
    const F = wallFrame(l.a, l.b);
    assert.ok(facesFront(F, 0.95));
    assert.ok(l.from >= 0 && l.to <= F.len + 1e-9 && l.to - l.from > 3);
    assert.ok(BELVEDERE.parts.some((p) => edgeOf(p.ring, l.a, l.b)));
    // the stretch is kept free of windows, either way round
    const st = wallStretches(l.a, l.b), back = clearStretches(l.b, l.a);
    assert.ok(st.some((s) => !s.windows && Math.abs(s.from - l.from) < 1e-9 && Math.abs(s.to - l.to) < 1e-9));
    assert.ok(Math.abs(back[0][0] - (F.len - l.to)) < 1e-9);
  }
  for (const l of BELVEDERE.loggias) assert.ok(edgeOf(part('east-block').ring, l.a, l.b), 'on the east block');
  const N = BELVEDERE.name, F = wallFrame(N.a, N.b);
  assert.ok(N.from > BELVEDERE.stair.to && N.from + N.w < F.len);
  for (const s of [N.from, N.from + N.w]) assert.ok(pointInRing(part('long-wing').ring, ...onWall(F, s, -N.back - 0.6)), 'standing on the long wing\'s roof');
  // the old house's frame both ways, its front line through the fronts
  const [x, z] = oldLocal(50, -3), [s, o] = toOld(x, z);
  assert.ok(Math.abs(s - 50) < 0.01 && Math.abs(o + 3) < 0.01);
  for (const f of BELVEDERE.oldFront) assert.ok(Math.abs(toOld(...f.a)[1]) < 3, f.key);
  assert.ok(Math.hypot(...FRONT) > 0.999 && Math.hypot(...FRONT) < 1.001);
});

test('the dome stands over the porch\'s projection, the porch before it is clear of the house', () => {
  const R = BELVEDERE.oldFront.find((f) => f.risalit), F = wallFrame(R.a, R.b);
  const mid = toOld(...onWall(F, F.len / 2))[0], dome = part('old-dome').ring.map((q) => toOld(...q)[0]);
  assert.ok(Math.abs((Math.min(...dome) + Math.max(...dome)) / 2 - mid) < 0.6, 'the dome over the projection\'s middle');
  const P = BELVEDERE.porch;
  assert.ok(P.from > 0.5 && P.to < F.len - 0.5 && P.top < part('old-link').top);
  for (const s of [P.from + 0.3, (P.from + P.to) / 2, P.to - 0.3]) {
    assert.ok(!BELVEDERE.parts.some((p) => pointInRing(flat(p.ring), ...onWall(F, s, P.depth / 2))), `the porch at ${s} m is clear of the house`);
  }
  assert.ok(BELVEDERE.dormers.at.every((a) => a - BELVEDERE.dormers.w / 2 > 0.5) && Math.max(...BELVEDERE.dormers.at) + 1 < wallFrame(...outwardRing(part('old-dome').ring).slice(0, 2)).len + 4);
});

test('the balconies: bays inside their wall, clear of the stair', () => {
  const S = BELVEDERE.stair, len = wallFrame(S.a, S.b).len, hw = (BELVEDERE.bay - BELVEDERE.balcony.gap) / 2;
  const bays = balconyBays(len, clearStretches(S.a, S.b));
  assert.ok(bays.length >= 7);
  for (const s of bays) {
    assert.ok(s - hw >= 0.4 && s + hw <= len - 0.4);
    assert.ok(s - hw > S.to || s + hw < S.from, `${s}: clear of the stair`);
  }
  // (laid out from the wall's middle, as the wall's material lays out its windows)
  for (const s of bays) assert.ok(Math.abs(((s - len / 2) / BELVEDERE.bay) - Math.round((s - len / 2) / BELVEDERE.bay)) < 1e-9);
});

test('every vertex of the Belvédère is finite, the meshes are few, the colliders have their heights', async () => {
  const doc = globalThis.document;
  // (no canvas in Node: the atlas is drawn into a stand-in)
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : typeof k === 'string' ? (t[k] ??= () => {}) : undefined), set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
  try {
    const { buildBelvedere, ATLAS } = await import('../js/belvedere.js');
    // the atlas' cells do not overlap and fit the canvas
    const cells = Object.entries(ATLAS);
    for (const [k, [x, y, w, h]] of cells) {
      assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 760 && w > 20 && h > 20, k);
      for (const [k2, [x2, y2, w2, h2]] of cells) if (k2 !== k) assert.ok(x + w <= x2 || x2 + w2 <= x || y + h <= y2 || y2 + h2 <= y, `${k} and ${k2}`);
    }
    const { group, colliders } = buildBelvedere({ add() {} });
    let meshes = 0;
    group.traverse((o) => {
      if (!o.geometry) return;
      meshes++;
      const p = o.geometry.attributes.position.array;
      assert.ok(p.length > 0 && p.length % 9 === 0, `${o.name}: whole triangles`);
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${o.name}: vertex ${Math.floor(i / 3)} is not finite`);
    });
    assert.equal(meshes, 7, 'the hotel\'s walls, the old house\'s, the flat roofs, the slate, the glass, the trim, the decals');
    assert.ok(colliders.length >= 4);
    for (const c of colliders) {
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'minY', 'maxY', 'baseY']) assert.ok(Number.isFinite(c[k]));
      assert.ok(c.maxY > c.minY && c.maxX > c.minX && c.maxZ > c.minZ);
    }
  } finally {
    globalThis.document = doc;
  }
});
