import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_HOTEL_TOWER, floorFeet, inside, isClosed, isDeep, letteringSpan, onWall, pointInRing, ringArea2, ringWalls, volumes, wallAt, wallFrame, walls } from '../js/club-hotel-tower-data.js';
import { CLUB_HOTEL } from '../js/club-hotel-data.js';
import { groundHeight } from '../js/terrain.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const H = CLUB_HOTEL_TOWER;
const ringOf = (id) => { const b = DAVOS_DATA.buildings.find((q) => q.id === id), out = []; for (let i = 0; i < b.ring.length; i += 2) out.push([b.ring[i], b.ring[i + 1]]); return out; };
const area = (ring) => Math.abs(ringArea2(ring)) / 2;

test('the volumes: outlines of the survey\'s size, the batch\'s centre in none of them, the floors adding up', () => {
  assert.ok(Math.abs(area(H.ring) - 642) < 15, 'the tower: the survey\'s 642 m²');
  assert.ok(Math.abs(area(H.annex.ring) - 164) < 8, 'the annex: 164 m²');
  assert.ok(Math.abs(area(H.terrace.ring) - 35) < 4, 'the terrace: 35 m²');
  assert.ok(area(H.deck.ring) > 500 && area(H.deck.ring) < 590, 'the deck: the survey\'s 573 m², less what crossed the other house');
  // (the batch's centre lies between the volumes: the exclude takes the whole batch)
  assert.ok(Math.hypot(H.exclude.x + 898, H.exclude.z - 556.3) < 0.1);
  // eight storeys from the Promenade's level to the top floor's top, the parapet behind the fascia over it
  assert.ok(Math.abs(H.floor + 8 * H.storey - H.line) < 1e-9);
  assert.equal(floorFeet().length, 8);
  assert.ok(H.top - H.line > 0.6 && H.top - H.line < 1.5);
  assert.ok(Math.abs(groundHeight(-871, 545) - H.floor) < 0.3, 'the Promenade at the ground floor\'s level');
  assert.ok(groundHeight(-905, 530) - H.floor > 4.5, 'two floors under the ground at the Obere Strasse');
  assert.ok(H.win.lo > 0.3 && H.win.hi < H.storey - 0.3 && H.win.half * 2 + 0.8 < H.bay && H.narrow < H.win.half);
  // the walls reach under the lowest ground round every volume
  for (const v of volumes()) for (const [x, z] of v.ring) assert.ok(groundHeight(x, z) > H.base + 0.2, `${v.name}: the ground at ${x} ${z}`);
  assert.ok(H.annex.line + 0 < H.annex.top && H.annex.storey * 2 <= H.annex.line - groundHeight(-893, 562) + 0.5);
  assert.ok(H.deck.top > H.terrace.top && H.annex.top > H.deck.top && H.top > H.annex.top);
});

test('the walls face outwards: a step out of a wall leaves its outline', () => {
  for (const v of volumes()) {
    let out = 0, n = 0;
    for (const { F } of ringWalls(v.ring)) {
      if (F.len < 0.9) continue;
      n++;
      const [x, z] = onWall(F, F.len / 2, 0.15), [xi, zi] = onWall(F, F.len / 2, -0.15);
      if (!pointInRing(v.ring, x, z) && pointInRing(v.ring, xi, zi)) out++;
    }
    assert.equal(out, n, v.name);
  }
  assert.equal(walls().length, H.ring.length);
});

test('the colours and the closed walls: the jogs and the step back deep blue, the long faces light, the end on the Promenade half closed', () => {
  const W = walls();
  const deep = W.filter(isDeep), light = W.filter((w) => !isDeep(w));
  assert.ok(deep.length >= 12 && light.length >= 10);
  for (const w of light) assert.ok(w.F.len >= H.short);
  const step = wallAt(W, H.deep[0]);
  assert.ok(step && isDeep(step) && step.F.n[1] < -0.9, 'the step back faces north');
  const closed = W.filter(isClosed);
  assert.equal(closed.length, 1);
  assert.ok(closed[0].F.n[0] > 0.8 && closed[0].F.len > 8, 'the south half of the end on the Promenade');
  // its north half (on the Promenade too) keeps its windows
  assert.ok(W.some((w) => w.F.n[0] > 0.8 && w.F.len > 8 && !isClosed(w)));
});

test('the lettering: on the north-east face\'s first stretch, at its end by the step back, the windows clear of it', () => {
  const L = letteringSpan(), T = H.lettering;
  assert.ok(L.F.n[1] < -0.7 && L.F.n[0] > 0.4, 'facing north-east');
  assert.ok(!isDeep(L.w), 'on the light blue');
  assert.ok(L.s0 > 0 && L.s1 < L.F.len && Math.abs(L.s1 - L.s0 - T.w) < 1e-9);
  const [x, z] = onWall(L.F, L.s1 + T.inset);
  assert.ok(Math.hypot(x - T.next[0], z - T.next[1]) < 0.05, 'beside the step back');
  // a window (its half and 0.4 m of plaster each side) fits the stretch before it
  assert.ok(L.windowsTo >= 2 * (H.win.half + 0.4) && L.windowsTo < L.s0);
  // between the second floor and the top floor, under the fascia
  assert.ok(T.y0 > groundHeight(-873, 540) + 5 && T.y1 < H.line);
});

test('the housing on the roof: within the tower\'s outline, back from its walls', () => {
  const K = H.housing, F = wallFrame(K.a, K.b);
  for (const s of [0, F.len]) for (const o of [0, -K.depth]) {
    const [x, z] = onWall(F, s, o);
    assert.ok(inside(x, z));
    for (const { F: W } of walls()) {
      const dx = x - W.a[0], dz = z - W.a[1], t = Math.max(0, Math.min(W.len, dx * W.u[0] + dz * W.u[1]));
      assert.ok(Math.hypot(x - W.a[0] - W.u[0] * t, z - W.a[1] - W.u[1] * t) > 2, 'two metres from the walls');
    }
  }
});

test('the neighbours: the volumes clear of the hotel\'s other house, the fire station and the houses round them', () => {
  const pts = volumes().flatMap((v) => v.ring);
  // (the other house by its surveyed outline, js/club-hotel.js; OpenStreetMap's stands a metre off it)
  const others = [['w97292384', CLUB_HOTEL.ring], ...['w97292427', 'w123384807', 'w97292398', 'w97292388', 'w97292308', 'w97292415'].map((id) => [id, ringOf(id)])];
  for (const [id, ring] of others) {
    for (const [x, z] of pts) assert.ok(!pointInRing(ring, x, z), `${id}: a corner of ours in it (${x} ${z})`);
    for (const v of volumes()) for (const [x, z] of ring) assert.ok(!pointInRing(v.ring, x, z), `${id}: a corner of it in ${v.name}`);
  }
  // the tower and the annex stand apart, the deck between them
  for (const [x, z] of H.annex.ring) assert.ok(!inside(x, z));
});

test('the sign: beside the Promenade, off its carriageway, clear of the tower, facing the traffic from the north-east', () => {
  const pairs = (r) => (Array.isArray(r.pts[0]) ? r.pts : r.pts.flatMap((v, i) => (i % 2 ? [] : [[v, r.pts[i + 1]]])));
  const S = H.sign, road = DAVOS_DATA.roads.find((r) => r.name === 'Promenade' && pairs(r).some((p) => Math.hypot(p[0] + 867.1, p[1] - 549.1) < 0.5));
  const pts = pairs(road);
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]], F = wallFrame(a, b);
    const t = Math.max(0, Math.min(F.len, (S.x - a[0]) * F.u[0] + (S.z - a[1]) * F.u[1]));
    d = Math.min(d, Math.hypot(S.x - a[0] - F.u[0] * t, S.z - a[1] - F.u[1] * t));
  }
  assert.ok(d > road.width / 2 + 1.5, `${d.toFixed(1)} m from the road's middle`);
  assert.ok(!inside(S.x, S.z));
  assert.ok(S.facing[0] > 0.3 && S.facing[1] < -0.7);
});

test('no mission door, teleport or helipad within the volumes or by the sign', async () => {
  const fs = await import('node:fs');
  const files = fs.readdirSync(new URL('../js/', import.meta.url)).filter((f) => /^missions-data-.*\.js$|^city-config\.js$|^helipad\.js$/.test(f));
  const pairs = [];
  for (const f of files) {
    const src = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/x:\s*(-?\d+(?:\.\d+)?)[^}]{0,60}?z:\s*(-?\d+(?:\.\d+)?)/g)) pairs.push([+m[1], +m[2], f]);
    for (const m of src.matchAll(/\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g)) pairs.push([+m[1], +m[2], f]);
  }
  assert.ok(pairs.length > 100, 'the doors read');
  for (const [x, z, f] of pairs) {
    for (const v of volumes()) assert.ok(!pointInRing(v.ring, x, z), `${f}: ${x} ${z} in the ${v.name}`);
    assert.ok(Math.hypot(x - H.sign.x, z - H.sign.z) > 1.5, `${f}: ${x} ${z} by the sign`);
  }
});

let mod = null;
async function loadModule() {
  if (mod) return mod;
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  mod = await import('../js/club-hotel-tower.js');
  return mod;
}

test('the garage\'s door: in the deck\'s wall facing the lane, on the lane\'s level, within the wall', async () => {
  const { garageDoor } = await loadModule();
  const { F, s0, s1, foot } = garageDoor();
  assert.ok(F.n[0] > 0.8, 'facing east into the lane');
  assert.ok(s0 > 0.5 && s1 < F.len - 0.5);
  assert.ok(foot < -2.5 && foot + H.garage.h + 0.5 < H.deck.top, 'under the deck\'s top');
  const [x, z] = onWall(F, (s0 + s1) / 2, 2);
  for (const v of volumes()) assert.ok(!pointInRing(v.ring, x, z), 'the lane before it free');
});

test('the deck\'s and the terrace\'s free walls: none inside another volume, none along the other house', async () => {
  const { lowWalls } = await loadModule();
  const L = lowWalls();
  assert.ok(L.length >= 6);
  for (const { F, from, top } of L) {
    const [x, z] = onWall(F, F.len / 2, 0.3);
    assert.ok(!pointInRing(CLUB_HOTEL.ring, x, z) && !inside(x, z) && !pointInRing(H.annex.ring, x, z));
    assert.ok(from < top);
  }
});

for (const simple of [false, true]) {
  test(`the building in Node${simple ? ' (the phone\'s materials)' : ''}: every vertex finite, six meshes, the outlines registered, the colliders`, async () => {
    const { QUALITY } = await import('../js/quality.js');
    const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
    const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    try {
      const THREE = await import('three/webgpu');
      const { buildClubHotelTower } = await loadModule();
      const scene = new THREE.Scene();
      const { group, colliders } = buildClubHotelTower(scene);
      assert.equal(group.userData.terrain, 'absolute');
      assert.deepEqual(SURVEYED_FOOTPRINTS.get(H.osm), [H.ring]);
      assert.deepEqual(SURVEYED_FOOTPRINTS.get(H.annex.osm), [H.annex.ring]);
      assert.ok(SHOP_EXCLUSIONS.has(H.osm) && !SHOP_EXCLUSIONS.has(CLUB_HOTEL.osm), 'our lettering for the generic sign; the other house keeps its');
      const names = group.children.map((m) => m.name.replace('Club Hotel tower ', '')).sort();
      assert.deepEqual(names, ['decal', 'deep', 'light', 'roof', 'trim', 'white']);
      for (const m of group.children) {
        const p = m.geometry.attributes.position;
        assert.ok(p.count > 0);
        for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
        for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= H.base - 0.3 && p.array[i] < H.top + H.housing.h + 0.5, `${m.name}: a height of ${p.array[i]}`);
      }
      // (the phone: no procedural shader but SIMPLE_SKINS', the vertex-coloured trim and the decal)
      if (simple) for (const m of group.children) if (!/trim|decal/.test(m.name)) assert.ok(!m.material.roughnessNode && !m.material.normalNode, `${m.name}: a stock material`);
      // the colliders: the deck's and the terrace's free walls and the sign, thin boxes at finite world heights
      assert.ok(colliders.length >= 7);
      for (const c of colliders) {
        assert.ok([c.baseY, c.maxY, c.obb.cx, c.obb.cz, c.obb.hx].every(Number.isFinite));
        assert.ok(c.maxY > c.baseY && c.baseY === c.minY && c.obb.hz <= 0.25);
      }
    } finally {
      QUALITY.simpleMaterials = was;
    }
  });
}
