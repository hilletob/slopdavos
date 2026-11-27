import test from 'node:test';
import assert from 'node:assert/strict';
import { CENTRAL, coverAt, isClosed, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame, wallStretches } from '../js/central-sporthotel-data.js';

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the part? */
const isWall = (p, a, b) => p.ring.some((q, i) => { const r = p.ring[(i + 1) % p.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
const onGrid = (p, y) => { const k = (p.line - y) / CENTRAL.storey; return Math.abs(k - Math.round(k)) < 1e-9; };

test('the hotel\'s volumes: outlines of some size, the floors adding up to the surveyed heights', () => {
  for (const p of CENTRAL.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 15, `${p.id}: an outline of some size`);
    assert.ok(p.top > CENTRAL.base + 5, `${p.id}: its roof over the base`);
  }
  const S = CENTRAL.storey, P = CENTRAL.podium, podium = part('podium'), tower = part('tower');
  // the podium: the arched storey on the lane's level (y −7.5), the band over it up to the terrace
  assert.ok(Math.abs(P.floor - -7.5) < 0.3);
  assert.ok(P.band > P.floor + 3.95 && podium.top - P.band > 1.5 && podium.top - P.band < 2.6);
  assert.ok(Math.abs(P.floor - P.storey - -12.0) < 0.1, 'the lower floor down to the car park on the east');
  // the tower: five floors over the terrace, its roof a parapet over the last
  assert.ok(Math.abs(tower.line - 5 * S - podium.top) < 0.3);
  assert.ok(tower.top - tower.line > 0 && tower.top - tower.line < 1);
  // the north wing a floor lower on the same grid, seven floors over the Centralweg (y −9.7)
  const wing = part('north-wing');
  assert.equal(wing.line, tower.line - S);
  assert.ok(Math.abs(wing.line - 7 * S - -9.7) < 0.3 && wing.top - wing.line > 0 && wing.top - wing.line < 1.2);
  // the glazed storey on the podium: its floor at the terrace, its roof within a storey of it
  const pav = part('pavilion');
  assert.ok(Math.abs(pav.line - S - podium.top) < 0.4 && pav.top - podium.top < S);
  assert.ok(part('machine-room').top > tower.top && part('skylight').top > pav.top);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of CENTRAL.parts) {
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

test('the named walls: on their parts, facing their streets; the lettering on the band, the emblems on closed stretches', () => {
  const W = CENTRAL.walls, podium = part('podium'), tower = part('tower');
  const facing = { lane: [-1, 0], street: [0, 1], crest: [1, 0], banner: [-1, 0] };
  for (const [key, [nx, nz]] of Object.entries(facing)) {
    const F = wallFrame(W[key].a, W[key].b);
    assert.ok(isWall(key === 'lane' || key === 'street' ? podium : tower, W[key].a, W[key].b), `${key}: a wall of its part`);
    assert.ok(F.n[0] * nx + F.n[1] * nz > 0.9, `${key}: facing its way`);
  }
  // the lane and the street open: nothing of the hotel before them
  for (const key of ['lane', 'street']) { const F = wallFrame(W[key].a, W[key].b), [x, z] = onWall(F, F.len / 2, 0.5); assert.equal(partAt(x, z), null); }
  for (const s of CENTRAL.signs) {
    const F = wallFrame(W[s.wall].a, W[s.wall].b);
    assert.ok(s.from >= 0 && s.to <= F.len && s.y0 > CENTRAL.podium.band && s.y1 < podium.top, `${s.key}: on the band`);
  }
  const lane = CENTRAL.signs.filter((s) => s.wall === 'lane').sort((p, q) => p.from - q.from);
  for (let i = 1; i < lane.length; i++) assert.ok(lane[i].from >= lane[i - 1].to, 'the lane\'s signs side by side');
  // the crest: on the closed east face, over the glazed storey and under the roof
  const K = wallFrame(W.crest.a, W.crest.b), c = CENTRAL.crest;
  assert.ok(isClosed(W.crest.a, W.crest.b) && isClosed(W.crest.b, W.crest.a));
  assert.ok(c.w < K.len - 0.5 && c.y0 > part('pavilion').top + 3 && c.y1 < tower.top);
  // the banner: on its wall's stretch without windows, either way round
  const N = wallFrame(W.banner.a, W.banner.b), b = CENTRAL.banner;
  assert.ok(b.clear[0] <= b.from && b.clear[1] >= b.to && b.clear[1] < N.len && b.y1 < tower.top && b.y0 > podium.top);
  assert.deepEqual(wallStretches(W.banner.a, W.banner.b).map((s) => s.windows), [true, false, true].slice(b.clear[0] > 0.01 ? 0 : 1));
  const back = wallStretches(W.banner.b, W.banner.a), closed = back.find((s) => !s.windows);
  assert.ok(Math.abs(closed.from - (N.len - b.clear[1])) < 1e-9 && Math.abs(closed.to - (N.len - b.clear[0])) < 1e-9);
  // the entrance on the lane, its door's foot on the lane's level
  assert.ok(CENTRAL.entrance.at > 0 && CENTRAL.entrance.at < wallFrame(W.lane.a, W.lane.b).len && Math.abs(CENTRAL.entrance.foot - CENTRAL.podium.floor) < 0.4);
});

test('the balconies: on the tower\'s and the north wing\'s walls, at its floors, over nothing of the hotel higher than them', () => {
  const D = CENTRAL.balcony;
  for (const bal of CENTRAL.balconies) {
    const owner = ['tower', 'north-wing'].map(part).find((p) => isWall(p, bal.a, bal.b));
    assert.ok(owner, `a wall of the tower or the wing: ${bal.a}`);
    const F = wallFrame(bal.a, bal.b), end = Math.min(bal.to ?? F.len, F.len);
    assert.ok(!pointInRing(owner.ring, ...onWall(F, F.len / 2, 0.3)), 'facing out');
    for (const y of bal.floors) {
      assert.ok(onGrid(owner, y), `a floor's foot at ${y}`);
      assert.ok(y + D.rail < owner.top, 'under the roof');
      for (const t of [D.inset, end / 2, end - D.inset]) {
        for (const o of [0.3, D.out]) {
          const [x, z] = onWall(F, t, o), under = coverAt(owner, x, z);
          assert.ok(under < y - 0.3, `nothing of the hotel up to the balcony at ${y} (${under})`);
        }
      }
    }
  }
});

test('the building in Node: every vertex finite, six meshes, the atlas\' cells apart, no colliders of its own', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildCentralSporthotel, ATLAS } = await import('../js/central-sporthotel.js');
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 1024);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'cells apart');
    }
  }
  const scene = new THREE.Scene();
  const { group, colliders } = buildCentralSporthotel(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name.replace('Central Sporthotel ', '')).sort();
  assert.deepEqual(names, ['decal', 'glass', 'hotel', 'podium', 'roof', 'trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > CENTRAL.base - 1 && p.array[i] < 17.7, `${m.name}: a height of ${p.array[i]}`);
  }
});
