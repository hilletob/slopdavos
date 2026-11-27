import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GKB_PLATZ, LINE, STOREY, floorFoot, groundOutlines, offsetRing, onWall, outwardRing, pointInRing, ringArea2, wallFrame, wallOf } from '../js/gkb-platz-data.js';
import { ARKADEN } from '../js/landmark-buildings-data.js';

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (or b → a) a wall of the outline? */
const isWall = (ring, a, b) => ring.some((q, i) => { const r = ring[(i + 1) % ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
const pairs = (flat) => { const out = []; for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return out; };

test('the bank\'s block: its outline, the floors adding up to the surveyed roof', () => {
  const R = GKB_PLATZ.ring;
  assert.equal(R.length, 5);
  assert.ok(Math.abs(Math.abs(ringArea2(R)) / 2 - 431) < 5, 'the survey\'s 431 m²');
  // the ground floor on the Promenade (y −1.6) and seven floors over it to the slab under the roof
  const G = GKB_PLATZ.ground;
  assert.ok(G.floor < G.glass && G.glass < G.fascia && G.fascia - G.floor > 4.5 && G.fascia - G.floor < 5.5);
  assert.ok(STOREY > 2.9 && STOREY < 3.4, `a storey of ${STOREY}`);
  assert.ok(Math.abs(floorFoot(GKB_PLATZ.floors + 1) - LINE) < 1e-9);
  assert.ok(GKB_PLATZ.top - LINE > 0.4 && GKB_PLATZ.top - LINE < 1.0, 'the slab over the top floor');
  assert.equal(GKB_PLATZ.top, 26.0);
  // every wall named once, each a wall of the outline
  const W = GKB_PLATZ.walls;
  assert.equal(Object.keys(W).length, R.length);
  for (const [name, w] of Object.entries(W)) assert.ok(isWall(R, w.a, w.b), name);
});

test('the walls face outwards, to their compass sides', () => {
  for (const name of Object.keys(GKB_PLATZ.walls)) {
    const F = wallOf(name), [x, z] = onWall(F, F.len / 2, 0.2);
    assert.ok(!pointInRing(GKB_PLATZ.ring, x, z), `${name} faces out`);
    const [x1, z1] = onWall(F, F.len / 2, -0.2);
    assert.ok(pointInRing(GKB_PLATZ.ring, x1, z1), `${name}: inside behind it`);
  }
  // (x east, z south)
  assert.ok(wallOf('west').n[0] < -0.9, 'the west front on the Promenade');
  assert.ok(wallOf('south').n[1] > 0.9, 'the south front on the lane');
  assert.ok(wallOf('north').n[1] < -0.9, 'the north wall over the Arkaden');
  assert.ok(wallOf('east').n[0] > 0.9);
  const se = wallOf('southEast').n;
  assert.ok(se[0] > 0.5 && se[1] > 0.5);
  // the outward ring runs as wallFrame wants it
  const R = outwardRing(GKB_PLATZ.ring);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]), [x, z] = onWall(F, F.len / 2, 0.3);
    assert.ok(!pointInRing(GKB_PLATZ.ring, x, z));
  }
});

test('the roof\'s overhang: a ring as far out of every wall', () => {
  const O = offsetRing(GKB_PLATZ.ring, GKB_PLATZ.eaves.out), R = outwardRing(GKB_PLATZ.ring);
  assert.equal(O.length, R.length);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    for (const p of [O[i], O[(i + 1) % O.length]]) {
      const d = (p[0] - F.a[0]) * F.n[0] + (p[1] - F.a[1]) * F.n[1];
      assert.ok(Math.abs(d - GKB_PLATZ.eaves.out) < 1e-6, `wall ${i}: ${d}`);
    }
  }
  assert.ok(Math.abs(ringArea2(O)) > Math.abs(ringArea2(R)));
});

test('the lettering, the door and the balconies lie on their walls', () => {
  const N = GKB_PLATZ.names, G = GKB_PLATZ.ground;
  for (const [name, n] of Object.entries(N)) {
    const F = wallOf(name);
    assert.ok(n.from >= 0 && n.to <= F.len && n.from < n.to, name);
    // as wide as the atlas' cell (8 : 1), not stretched
    assert.ok(Math.abs((n.to - n.from) / (n.y1 - n.y0) - 8) < 0.15, `${name}: ${(n.to - n.from) / (n.y1 - n.y0)}`);
  }
  for (const name of ['west', 'south']) assert.ok(N[name].y0 > G.glass + 0.12 && N[name].y1 < G.fascia - 0.08, `${name}: on the fascia`);
  assert.ok(N.north.y0 > floorFoot(GKB_PLATZ.floors) && N.north.y1 < GKB_PLATZ.eaves.y, 'under the roof, on the top floor');
  for (const s of GKB_PLATZ.vents.at) assert.ok((s + 0.86 < N.north.from || s > N.north.to) && s + 0.86 < wallOf('north').len);
  const D = GKB_PLATZ.door, Wf = wallOf('west');
  assert.ok(D.s - D.w / 2 > 1 && D.s + D.w / 2 < N.west.from, 'the door clear of the name');
  assert.ok(D.s + D.w / 2 < Wf.len - 1);
  const Bc = GKB_PLATZ.balconies, S = wallOf('south');
  assert.ok(Bc.from >= 0 && Bc.to <= S.len && Bc.floors.every((k) => k >= 1 && k <= GKB_PLATZ.floors));
  // over the lane: their slabs well over its ground
  assert.ok(floorFoot(Math.min(...Bc.floors)) > 4);
});

test('the player\'s walls: the bank\'s outline and the rest of OSM\'s footprint, the Arkaden\'s', async () => {
  const { DAVOS_DATA } = await import('../js/davos-geodata.js');
  const osm = DAVOS_DATA.buildings.find((b) => b.id === GKB_PLATZ.osm);
  assert.ok(osm, 'OSM\'s building');
  const [bank, rest] = groundOutlines();
  assert.equal(bank, GKB_PLATZ.ring);
  // the rest meets the bank's north wall and lies outside it; it holds the Arkaden's third wing
  const Fn = wallOf('north');
  for (const p of rest.slice(0, 2)) {
    const d = (p[0] - Fn.a[0]) * Fn.n[0] + (p[1] - Fn.a[1]) * Fn.n[1];
    assert.ok(Math.abs(d) < 0.1, 'on the north wall');
  }
  const third = pairs(ARKADEN.wings[2].ring);
  const [cx, cz] = third.reduce((s, q) => [s[0] + q[0] / third.length, s[1] + q[1] / third.length], [0, 0]);
  assert.ok(pointInRing(rest, cx, cz) && !pointInRing(bank, cx, cz));
  // the bank's corners within 1.1 m of OSM's walls
  const ring = pairs(osm.ring);
  const dist = (p) => Math.min(...ring.map((q, i) => { const r = ring[(i + 1) % ring.length], F = wallFrame(q, r), t = Math.max(0, Math.min(F.len, (p[0] - q[0]) * F.u[0] + (p[1] - q[1]) * F.u[1])); return Math.hypot(p[0] - q[0] - F.u[0] * t, p[1] - q[1] - F.u[1] * t); }));
  for (const p of bank) assert.ok(dist(p) < 1.1, `${p}: ${dist(p)}`);
});

test('no mission\'s place stands in the bank', () => {
  // (every pair of numbers in the missions' data and the city's teleports that could be a place: none inside the block
  // or a metre round it)
  const O = offsetRing(GKB_PLATZ.ring, 1.0);
  const files = fs.readdirSync('js').filter((f) => /^missions-data.*\.js$|^city-config\.js$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(`js/${f}`, 'utf8');
    const nums = [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    for (let i = 0; i + 1 < nums.length; i++) {
      for (const [x, z] of [[nums[i], nums[i + 1]], [nums[i], nums[i + 2]]]) {
        if (!Number.isFinite(z) || Math.abs(x + 586) > 30 || Math.abs(z + 38) > 30) continue;
        assert.ok(!pointInRing(O, x, z), `${f}: ${x}, ${z} inside the bank`);
      }
    }
  }
});

test('the building in Node: every vertex finite, five meshes, no colliders of its own', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  const { buildGkbPlatz } = await import('../js/gkb-platz.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(GKB_PLATZ.osm), groundOutlines());
  assert.ok(SHOP_EXCLUSIONS.has('n599060217'));
  const { SHOPS_DATA } = await import('../js/shops-data.js');
  assert.ok(SHOPS_DATA.some((s) => s.osm === GKB_PLATZ.shop && /Kantonalbank/.test(s.name)));
  const scene = new THREE.Scene();
  const { group, colliders } = buildGkbPlatz(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['GKB Platz decal', 'GKB Platz glass', 'GKB Platz plaster', 'GKB Platz roof', 'GKB Platz trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= GKB_PLATZ.base - 0.7 && p.array[i] <= GKB_PLATZ.top + 1e-6, `${m.name}: a height of ${p.array[i]}`);
  }
  // the roof faces up, the soffit down
  const roof = group.children.find((m) => m.name.endsWith('roof')).geometry.attributes.normal;
  for (let i = 1; i < roof.array.length; i += 3) assert.ok(roof.array[i] > 0.99);
  // the phone's profile: the plain skins
  const { QUALITY } = await import('../js/quality.js');
  const was = QUALITY.simpleMaterials;
  QUALITY.simpleMaterials = true;
  try {
    const s2 = new THREE.Scene();
    const b2 = buildGkbPlatz(s2);
    for (const m of b2.group.children) {
      if (m.name.endsWith('decal') || m.name.endsWith('trim')) continue;
      assert.ok(!m.material.roughnessNode && !m.material.normalNode, `${m.name}: a plain skin`);
    }
  } finally { QUALITY.simpleMaterials = was; }
});
