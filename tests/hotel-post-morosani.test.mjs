import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HOTEL_POST_MOROSANI as H, groundOutlines, isRestaurantFront, oldFloors, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame, wallStretches } from '../js/hotel-post-morosani-data.js';
import { RAETIA } from '../js/raetia-center-data.js';
import { groundHeight } from '../js/terrain.js';

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the part? */
const isWall = (p, a, b) => p.ring.some((q, i) => { const r = p.ring[(i + 1) % p.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });

test('the volumes: outlines of some size, the floors adding up to the surveyed heights', () => {
  for (const p of H.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 10, `${p.id}: an outline of some size`);
    assert.ok(p.top > H.base + 10, `${p.id}: its roof over the base`);
    if (p.line !== undefined) {
      assert.ok(p.line < p.top && p.top - p.line < 1.0, `${p.id}: the top floor ends under the roof`);
      // the roughcast floors share one grid (their tops on 0.6 + k × storey)
      const k = (p.line - 0.6) / H.rough.storey;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-9, `${p.id}: on the rear's grid`);
    }
  }
  // the old block: a tall ground floor over the Promenade (y −0.5) and three floors to the attic band, the eaves on top
  const O = H.old, main = part('main');
  assert.ok(Math.abs(O.gf - -0.5 - 4.3) < 0.05, 'the ground floor 4.3 m tall');
  assert.ok(Math.abs(O.gf + 3 * O.storey - O.line) < 1e-9);
  assert.deepEqual(oldFloors().at(-1), O.line);
  assert.ok(main.top - O.line > 1.2 && main.top - O.line < 2, 'the attic band with the frieze under the eaves');
  assert.ok(O.line - O.storey + O.win.hi < O.line + 0.3, 'the top floor\'s windows under the frieze');
  assert.ok(H.eaves.y0 > O.line + 0.9 && H.eaves.y1 > main.top);
  // the old block towers over every other part
  for (const p of H.parts) if (p !== main) assert.ok(p.top < main.top - 5);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of H.parts) {
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

test('the parts do not overlap each other nor the Rätia Center next door', () => {
  // a grid over the hotel: no point lies in two parts (a few cm along the shared walls aside)
  for (let x = -640; x <= -602; x += 0.5) {
    for (let z = 179; z <= 226; z += 0.5) {
      const inside = H.parts.filter((p) => pointInRing(p.ring, x, z));
      if (inside.length < 2) continue;
      // (allowed only within 0.6 m of a shared edge: the survey's rings meet with a little slack)
      const ok = [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]].some(([dx, dz]) => H.parts.filter((p) => pointInRing(p.ring, x + dx, z + dz)).length < 2);
      assert.ok(ok, `${inside.map((p) => p.id)} overlap at ${x} ${z}`);
    }
  }
  for (const p of H.parts) {
    for (const [x, z] of p.ring) {
      assert.ok(z < 225, `${p.id} stays north of the Rätia Center`);
      for (const q of RAETIA.parts) assert.ok(!pointInRing(q.ring.map(([a, b]) => [a, b]), x, z));
    }
  }
  // the eaves and the balconies too: the Rätia Center's northernmost wall lies at z 229.3
  const S = H.south, F = wallFrame(S.balcony.a, S.balcony.b);
  for (const s of [0, F.len]) assert.ok(onWall(F, s, S.balcony.out)[1] < 226);
});

test('the restaurant\'s fronts face the street; the lettering lies on its walls and on the old block\'s', () => {
  const r = part('restaurant');
  const N = wallFrame(H.north.a, H.north.b), W = wallFrame(H.west.a, H.west.b);
  assert.ok(isWall(r, H.north.a, H.north.b) && isWall(r, H.west.a, H.west.b));
  assert.ok(N.n[1] < -0.9, 'the north front faces north');
  assert.ok(W.n[0] < -0.9, 'the west front faces the Promenade (west)');
  assert.ok(isRestaurantFront(H.north.a, H.north.b) && isRestaurantFront(H.west.b, H.west.a));
  // only those two are the restaurant's front
  const ring = outwardRing(r.ring);
  const fronts = ring.filter((a, i) => isRestaurantFront(a, ring[(i + 1) % ring.length]));
  assert.equal(fronts.length, 2);
  const [f0, f1] = H.restaurant.fascia;
  assert.ok(f0 > H.restaurant.glassTo && f1 < r.top - 0.5);
  const D = H.west.doors, K = H.west.canopy;
  assert.ok(D.s - D.w / 2 > 1 && D.s + D.w / 2 < W.len - 1 && K.s - K.w / 2 > 0 && K.s + K.w / 2 < W.len && K.y < f0);
  // the name panel on the old block's north face, over the restaurant's roof, on a stretch free of windows
  const main = part('main'), P = H.nameWall;
  assert.ok(isWall(main, P.a, P.b));
  const F = wallFrame(P.a, P.b);
  assert.ok(F.n[1] < -0.9);
  assert.ok(P.clear[0] >= 0 && P.clear[1] <= F.len && P.panel.y0 > r.top + 0.3 && P.panel.y1 < H.old.line);
  assert.deepEqual(wallStretches(P.a, P.b).map((s) => s.windows), [true, false, true]);
  assert.deepEqual(wallStretches(P.b, P.a).filter((s) => !s.windows).map((s) => [+(F.len - s.to).toFixed(3), +(F.len - s.from).toFixed(3)]), [P.clear]);
});

test('the sign stands on the old block\'s roof, the balconies on its south front, the garage on the yard', () => {
  const main = part('main'), S = H.south, R0 = wallFrame(S.a, S.b), Sg = S.sign;
  assert.ok(R0.n[1] > 0.9, 'the south front faces south');
  for (const s of [Sg.s0, Sg.s1, Sg.horn.s]) for (const o of [Sg.o, Sg.o - 0.32, Sg.o - 1.4]) assert.equal(partAt(...onWall(R0, s, o)), main, `the frame at ${s} ${o} on the roof`);
  assert.ok(Sg.y0 > main.top && Sg.horn.y0 > Sg.y1);
  const Bc = S.balcony;
  assert.ok(isWall(main, Bc.a, Bc.b));
  for (const y of Bc.floors) assert.ok(oldFloors().some((f) => Math.abs(f - y) < 0.25), `a balcony at a floor (${y})`);
  const G = H.garage, F = wallFrame(G.a, G.b);
  assert.ok(isWall(part('rear'), G.a, G.b) && F.n[0] > 0.9, 'the garage faces the yard (east)');
  assert.ok(G.s - G.w / 2 > 0.5 && G.s + G.w / 2 < F.len - 0.5);
  // its mouth on the yard's ground, under the rear wing's lowest windows (one floor under 0.6)
  const y = groundHeight(...onWall(F, G.s, 0.5));
  assert.ok(y < -3 && y + G.h < 0.6 - H.rough.storey + H.rough.win.lo + 0.5, `the garage on the yard at ${y}`);
});

test('the outlines for the player\'s walls are every volume\'s, near OpenStreetMap\'s footprint', async () => {
  const outlines = groundOutlines();
  assert.equal(outlines.length, H.parts.length);
  const { DAVOS_DATA } = await import('../js/davos-geodata.js');
  const b = DAVOS_DATA.buildings.find((x) => x.id === H.osm);
  assert.ok(b, 'an OpenStreetMap building');
  const fp = []; for (let i = 0; i < b.ring.length; i += 2) fp.push([b.ring[i], b.ring[i + 1]]);
  // the main volumes stand within 1.2 m of OSM's outline (each corner inside it or near one of its walls)
  const dist = (x, z) => {
    if (pointInRing(fp, x, z)) return 0;
    let d = Infinity;
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i], c = fp[(i + 1) % fp.length], dx = c[0] - a[0], dz = c[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    }
    return d;
  };
  for (const p of H.parts) if (p.id !== 'annex') for (const [x, z] of p.ring) assert.ok(dist(x, z) < 1.6, `${p.id} ${x} ${z}: ${dist(x, z).toFixed(2)} m off`);
});

test('no mission\'s spot lies in the hotel: its doors stay reachable', async () => {
  const files = fs.readdirSync(new URL('../js/', import.meta.url)).filter((f) => /^missions-data.*\.js$/.test(f));
  assert.ok(files.length > 5);
  for (const f of files) {
    const m = await import(`../js/${f}`);
    const visited = new Set();
    const walk = (o, path) => {
      if (!o || typeof o !== 'object' || visited.has(o)) return;
      visited.add(o);
      let x, z;
      if (typeof o.x === 'number' && typeof o.z === 'number') [x, z] = [o.x, o.z];
      else if (Array.isArray(o) && o.length >= 2 && o.length <= 4 && typeof o[0] === 'number' && typeof o[1] === 'number') [x, z] = o;
      if (x !== undefined && Math.abs(x - -620) < 60 && Math.abs(z - 202) < 60) {
        // (a spot a step before a wall is fine; inside, or within 0.5 m of a wall, is not)
        for (const [dx, dz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) assert.equal(partAt(x + dx, z + dz), null, `${f} ${path} at ${x} ${z}`);
      }
      for (const k of Object.keys(o)) walk(o[k], `${path}.${k}`);
    };
    for (const [k, v] of Object.entries(m)) walk(v, k);
  }
});

test('the atlas\' cells lie in it and do not overlap', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const { ATLAS } = await import('../js/hotel-post-morosani.js');
  const cells = Object.entries(ATLAS);
  for (const [k, [x, y, w, h]] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 1024, k);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, [ax, ay, aw, ah]] = cells[i], [b, [bx, by, bw, bh]] = cells[j];
      assert.ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `${a} and ${b} overlap`);
    }
  }
});

test('the building in Node: every vertex finite, six meshes, its outlines registered, no colliders of its own', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { buildHotelPostMorosani } = await import('../js/hotel-post-morosani.js');
  assert.equal(SURVEYED_FOOTPRINTS.get(H.osm).length, H.parts.length);
  for (const id of H.shops) assert.ok(SHOP_EXCLUSIONS.has(id));
  const scene = new THREE.Scene();
  const { group, colliders } = buildHotelPostMorosani(scene);
  assert.deepEqual(colliders, []);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name.replace('Hotel Post Morosani ', '')).sort();
  assert.deepEqual(names, ['decal', 'glass', 'old', 'roof', 'rough', 'trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= H.base - 0.01 && p.array[i] < 19.5, `${m.name}: a height of ${p.array[i]}`);
    for (let i = 0; i < p.array.length; i += 3) assert.ok(p.array[i + 2] < 227, `${m.name}: south of the hotel at z ${p.array[i + 2]}`);
  }
});
