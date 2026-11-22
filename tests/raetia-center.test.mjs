import test from 'node:test';
import assert from 'node:assert/strict';
import { RAETIA, RAETIA_ENTRANCE, SLOPE, annexFrame, dormerFrame, frontFrame, gableFrame, local, slopeHeight, toLocal } from '../js/raetia-center-data.js';
import { onWall, outwardRing, pointInRing, ringArea2, wallFrame } from '../js/spital-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { SHOPS_DATA } from '../js/shops-data.js';

const part = (id) => RAETIA.parts.find((p) => p.id === id);
const flat = (ring) => ring.map(([x, z]) => [x, z]);

test('the Rätia Center\'s volumes: outlines of some size inside OpenStreetMap\'s footprint, the plant floor the highest', () => {
  const osm = DAVOS_DATA.buildings.find((b) => b.id === RAETIA.osm);
  assert.equal(osm.name, 'Rätia Center');
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (let i = 0; i < osm.ring.length; i += 2) { lo[0] = Math.min(lo[0], osm.ring[i]); hi[0] = Math.max(hi[0], osm.ring[i]); lo[1] = Math.min(lo[1], osm.ring[i + 1]); hi[1] = Math.max(hi[1], osm.ring[i + 1]); }
  for (const p of RAETIA.parts) {
    assert.ok(Math.abs(ringArea2(p.ring)) / 2 > 12, p.id);
    for (const q of p.ring) {
      assert.ok(q[0] > lo[0] - 1.5 && q[0] < hi[0] + 1.5 && q[1] > lo[1] - 1.5 && q[1] < hi[1] + 1.5, `${p.id}: ${q} within the footprint's bounds`);
      assert.ok((q[2] ?? p.top) > RAETIA.base + 8, `${p.id}: a roof over the base`);
    }
  }
  assert.ok(part('plant').top > part('top').top && part('top').top > part('east').top);
  assert.ok(Math.hypot(RAETIA.exclude.x - RAETIA_ENTRANCE.x, RAETIA.exclude.z - RAETIA_ENTRANCE.z) < 40);
});

test('the big roof is one plane from the eaves to the flat roofs, its north strip another under it', () => {
  for (const [x, z, y] of part('slope').ring) {
    const [, r] = toLocal(x, z);
    assert.ok(Math.abs(slopeHeight(r) - y) < 0.15, `${x} ${z}: ${slopeHeight(r).toFixed(2)} for ${y}`);
  }
  assert.ok(Math.abs(slopeHeight(SLOPE.run) - RAETIA.flat) < 1e-9 && slopeHeight(0) === RAETIA.eaves);
  assert.ok(SLOPE.rise > 0.7 && SLOPE.rise < 0.95, 'some 40° steep');
  // the strip: every corner under the big roof's plane, on one plane of the same pitch
  const ring = part('slope-north').ring, at = ring.map(([x, z, y]) => [toLocal(x, z)[1], y]);
  for (const [r, y] of at) assert.ok(y < slopeHeight(r) + 0.05);
  const [r0, y0] = at[1];
  for (const [r, y] of at) assert.ok(Math.abs(y0 + (r - r0) * 0.8023 - y) < 0.15, `${r.toFixed(2)}: ${y}`);
  // the frame's two ways agree
  const [x, z] = local(7, 11), [s, r] = toLocal(x, z);
  assert.ok(Math.abs(s - 7) < 1e-9 && Math.abs(r - 11) < 1e-9);
});

test('the front faces the Promenade (west): the pavilion, the south part and the dormers; the gable faces the Postplatz', () => {
  const A = annexFrame(), G = frontFrame(), S = gableFrame();
  for (const F of [A, G]) assert.ok(F.n[0] < -0.9, 'out towards the Promenade');
  assert.ok(S.n[1] > 0.9, 'out towards the Postplatz (south)');
  // (a west front: the north end on the left)
  assert.ok(A.a[1] < RAETIA.annex.b[1] && G.a[1] < RAETIA.front.b[1]);
  // a step out of each leaves every volume
  for (const F of [A, G, S]) for (const p of RAETIA.parts) assert.ok(!pointInRing(flat(p.ring), ...onWall(F, F.len / 2, 0.6)), p.id);
  for (const p of RAETIA.parts) assert.ok(!pointInRing(flat(p.ring), RAETIA_ENTRANCE.x, RAETIA_ENTRANCE.z));
  // the south part ends where the pavilion's south side begins, the pavilion reaches back to the roof
  const [, back] = toLocal(...onWall(A, A.len / 2, -RAETIA.annex.depth));
  assert.ok(back > 0.5 && back < 2.5, `${back.toFixed(2)} m up the run`);
  assert.ok(Math.abs(toLocal(...RAETIA.annex.b)[0] - G.len) < 0.6, 'the pavilion starts at the eaves\' end');
  assert.ok(RAETIA.annex.top + RAETIA.annex.parapet > RAETIA.front.top && RAETIA.front.top > RAETIA.eaves);
  // the walls of the volumes face out
  for (const p of RAETIA.parts) {
    const ring = outwardRing(p.ring);
    ring.forEach((a, i) => {
      const F = wallFrame(a, ring[(i + 1) % ring.length]);
      if (F.len > 1) assert.ok(!pointInRing(flat(p.ring), ...onWall(F, F.len / 2, 0.05)), `${p.id}: wall ${i}`);
    });
  }
});

test('the lettering, the doors, the boards and the posters lie on their walls', () => {
  const A = RAETIA.annex, F = annexFrame();
  assert.ok(A.name.from >= A.dark + 0.3 && A.name.from + A.name.w <= F.len - 0.3, 'the lettering on the copper');
  assert.ok(A.doors[0] > A.dark && A.doors.at(-1) < F.len - 1 && A.doors[0] >= A.name.from && A.doors.at(-1) <= A.name.from + A.name.w, 'the doors under the lettering');
  assert.ok(A.ghost.from + A.ghost.w < A.doors[0] && A.ghost.from > 0.5);
  for (const s of A.flags) assert.ok(s > 0 && s + 0.6 < A.dark + 0.1, 'the flags before the dark band');
  const W = RAETIA.front, G = frontFrame();
  for (const b of [W.board, W.posters]) assert.ok(b.from > W.glassTo + 0.3 && b.from + b.w < G.len - 0.3 && b.y + b.h < W.top);
  assert.ok(W.posters.y + W.posters.h < W.board.y && W.posters.y > 0.7);
  // the gable's board under the roof's edge at both its ends
  const gb = RAETIA.gable.board;
  for (const s of [gb.from, gb.from + gb.w]) {
    const [, r] = toLocal(...onWall(gableFrame(), s));
    assert.ok(gb.y + gb.h + 0.4 < slopeHeight(r), `${s} m along the gable`);
  }
  // the house's businesses: all of OpenStreetMap's within its footprint
  const osm = DAVOS_DATA.buildings.find((b) => b.id === RAETIA.osm), ring = [];
  for (let i = 0; i < osm.ring.length; i += 2) ring.push([osm.ring[i], osm.ring[i + 1]]);
  const inside = SHOPS_DATA.filter((s) => pointInRing(ring, s.x, s.z)).map((s) => s.osm).sort();
  assert.deepEqual([...RAETIA.shops].sort(), inside);
});

test('four dormers on the big roof, clear of each other and of its edges', () => {
  const ds = RAETIA.dormers;
  assert.equal(ds.length, 4);
  const width = toLocal(-618.3, 239.9)[0];
  ds.forEach((d, i) => {
    const { F, foot, top, back } = dormerFrame(d);
    assert.ok(F.n[0] < -0.9 && Math.abs(F.len - d.w) < 1e-9);
    assert.ok(d.s - d.w / 2 > 1 && d.s + d.w / 2 < width - 1 && d.r > 2 && d.r + back < SLOPE.run - 0.5, `dormer ${i} on the roof`);
    assert.ok(Math.abs(slopeHeight(d.r + back) - top) < 1e-9 && top < RAETIA.flat && foot > RAETIA.annex.top + RAETIA.annex.parapet);
    if (i) assert.ok(ds[i - 1].s - d.s > d.w + 0.5, 'from north to south, a gap between two');
  });
  assert.ok(ds[3].r > ds[0].r + 2, 'the southernmost higher on the roof');
});

test('every vertex of the Rätia Center is finite, six meshes, the atlas\' cells apart', async () => {
  const doc = globalThis.document;
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : typeof k === 'string' ? (t[k] ??= () => {}) : undefined), set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
  try {
    const { buildRaetiaCenter, ATLAS } = await import('../js/raetia-center.js');
    const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
    const { group, colliders } = buildRaetiaCenter({ add() {} });
    const names = [];
    group.traverse((o) => {
      if (!o.geometry) return;
      names.push(o.name.replace('Rätia Center ', ''));
      const p = o.geometry.attributes.position.array;
      assert.ok(p.length > 0 && p.length % 9 === 0);
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${o.name}: vertex ${Math.floor(i / 3)} is not finite`);
      if (o.name.endsWith(' sheet')) assert.equal(o.geometry.attributes.color.count, o.geometry.attributes.position.count, 'every sheet has its colour');
      if (o.name.endsWith(' roof')) assert.ok(!o.geometry.attributes.color);
    });
    assert.deepEqual(names.sort(), ['decal', 'glass', 'roof', 'sheet', 'trim', 'wall']);
    const cells = Object.entries(ATLAS);
    for (const [a, [ax, ay, aw, ah]] of cells) for (const [b, [bx, by, bw, bh]] of cells) {
      if (a < b) assert.ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `${a} and ${b} overlap`);
    }
    for (const [, [x, y, w, h]] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 840);
    assert.deepEqual(colliders, []);
    for (const osm of RAETIA.shops) assert.ok(SHOP_EXCLUSIONS.has(osm));
  } finally {
    globalThis.document = doc;
  }
});
