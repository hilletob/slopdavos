import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  BAY, EAVES, HOUSES, KINDS, NO_WALLS, STOREY, WIN, groundOutlines, insideRow, onWall, outwardRing, partTop, pointInRing, ringArea2,
  slopeY, wallFrame
} from '../js/obere-strasse-2-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  if (!b) return null;
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};
const IDS = ['w1529973395', 'w123383537', 'w123385352', 'w1529973398', 'w123384627', 'w127653851', 'w1529973400', 'w127653804', 'w127653856',
  'w127653863', 'w123384643', 'w127653849', 'w127653787', 'w122930760', 'w123384631', 'w123384616', 'w123384621', 'w1529620024', 'w123384622',
  'w121860620', 'w123384644', 'w117012195', 'w123384637', 'w123384618', 'w123384611', 'w123384630', 'w123384623', 'w123384613'];
// the neighbours whose volumes lie in the batches of the row's houses
const HELD = ['w123384639', 'w1529620023', 'w1528718535', 'w123384632', 'w127653845', 'w127653850', 'w123385329'];
const ground = () => [...groundOutlines()].flatMap(([id, rings]) => rings.map((r) => ({ id, r })));

test('the row: its twenty-eight houses, each excluding its surveyed batches near its outlines', () => {
  assert.deepEqual(HOUSES.map((h) => h.id).sort(), [...IDS].sort());
  const all = HOUSES.flatMap((h) => h.exclude);
  assert.equal(all.length, 42);
  for (const e of all) assert.ok(e.r === 3 && Number.isFinite(e.x) && Number.isFinite(e.z));
  for (const h of HOUSES) {
    assert.ok(osmRing(h.id), `${h.id} in OpenStreetMap`);
    for (const e of h.exclude) {
      assert.ok(h.parts.some((p) => pointInRing(p.eavesRing || p.ring, e.x, e.z) || p.ring.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 15)), `${h.id}: a batch far off`);
    }
    // (each house's volumes where OpenStreetMap has it)
    const own = osmRing(h.id);
    assert.ok(h.parts.some((p) => p.ring.some(([x, z]) => pointInRing(own, x, z)) || own.some(([x, z]) => pointInRing(p.ring, x, z))), `${h.id}: away from its outline`);
  }
  // the batches of other modules are not excluded here
  for (const e of all) for (const [x, z] of [[-629.6, -86.9], [-586, -37.6], [-495.8, -130.5], [-549.1, -163.1], [-569.1, -217.9], [-420.5, -356.5], [-403.5, -316.8]]) {
    assert.ok(Math.hypot(e.x - x, e.z - z) > 3, 'another module\'s batch');
  }
});

test('the outlines: of some size, simple, the walls facing out; registered for every house and the neighbours they hold', () => {
  for (const h of HOUSES) for (const p of h.parts) {
    const ring = p.ring, n = ring.length;
    assert.ok(n >= 3 && Math.abs(ringArea2(ring)) / 2 > 4, `${h.id}: an outline of some size`);
    for (const [x, z] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(z));
    const crosses = (a, b, c, d) => {
      const s = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      return s(a, b, c) * s(a, b, d) < -1e-9 && s(c, d, a) * s(c, d, b) < -1e-9;
    };
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      assert.ok(!crosses(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]), `${h.id}: an outline crossing itself`);
    }
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1.5) continue;
      assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.2)), `${h.id}: a step out of a wall leaves the outline`);
      assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.2)), `${h.id}: a step back is inside`);
    }
    // (the walls under sloped roofs inside the roof's outline)
    if (p.eavesRing) for (const [x, z] of p.ring) assert.ok(pointInRing(p.eavesRing, x, z), `${h.id}: a wall outside its eaves`);
  }
  const G = groundOutlines();
  for (const id of IDS) assert.ok(G.has(id), id);
  for (const id of HELD) assert.ok(G.get(id)?.length > 0, `${id}: its volume here`);
  for (const id of NO_WALLS) assert.deepEqual(G.get(id), []);
  // every house keeps walls somewhere (its own outlines or its neighbours')
  for (const h of HOUSES) assert.ok(h.parts.some((p) => !p.onRoof));
});

test('the storeys and roofs: storeys of 2.6–3.5 m filling each house, the sloped roofs over their walls', () => {
  assert.ok(WIN.lo > 0.5 && WIN.hi < STOREY - 0.4 && BAY > 2 * WIN.half + 0.8 && EAVES > 0);
  for (const h of HOUSES) {
    assert.ok(h.storey >= 2.6 && h.storey <= 3.5, `${h.id}: a storey of ${h.storey}`);
    assert.ok(h.base < h.floor && Object.values(KINDS).includes(h.kind));
    for (const p of h.parts) {
      const R = outwardRing(p.ring);
      for (const [x, z] of R) {
        const t = partTop(h, p, x, z);
        assert.ok(Number.isFinite(t) && t > h.floor + 2, `${h.id}: a wall's top of ${t}`);
      }
      if (p.tris) for (const [x, z] of p.ring) assert.ok(slopeY(h, x, z, p.tris) !== null, `${h.id}: a wall's corner outside its roof`);
    }
  }
});

test('the neighbours: nothing of the row in the hand-built houses around it, nor in the houses it does not rebuild', async () => {
  const mods = [];
  const { PARTS: PP } = await import('../js/promenade-platz-data.js');
  mods.push(...PP.map((p) => ({ name: `promenade-platz ${p.id}`, r: p.ring })));
  const { EUROPE_BLOCK } = await import('../js/europe-block-data.js');
  mods.push(...EUROPE_BLOCK.parts.map((p) => ({ name: `europe-block ${p.id}`, r: p.ring })));
  for (const f of ['hard-rock-hotel-data.js', 'post-coop-data.js', 'gkb-platz-data.js']) {
    const m = await import(`../js/${f}`);
    for (const v of Object.values(m)) if (v && Array.isArray(v.parts)) mods.push(...v.parts.filter((p) => Array.isArray(p.ring)).map((p) => ({ name: f, r: p.ring })));
  }
  assert.ok(mods.length > 40);
  for (const { id, r } of ground()) {
    const R = outwardRing(r);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1) continue;
      const [x, z] = onWall(F, F.len / 2, -1.5);
      // (w123384637's house stands over the podium js/promenade-platz.js builds before it on the Promenade; the Europe's
      // west terrace and w1529973400's block, two surveys of the same wall, overlap by some 2 m)
      const shared = (m) => (id === 'w123384637' && m.name === 'promenade-platz podium') || (id === 'w1529973400' && m.name === 'europe-block terrace-west');
      for (const m of mods) if (!shared(m)) assert.ok(!pointInRing(m.r, x, z), `${id} at ${x.toFixed(1)}, ${z.toFixed(1)} inside ${m.name}`);
    }
  }
  // the houses it leaves to js/buildings.js and its other neighbours: none of its walls 1.5 m into them
  const mine = new Set([...groundOutlines().keys(), 'w1528797228', 'w1528797229', 'w1528797230', 'w1528797231', 'w1528797232']);
  const others = DAVOS_DATA.buildings.filter((b) => !mine.has(b.id)).map((b) => ({ id: b.id, r: osmRing(b.id) }))
    .filter(({ r }) => r.some(([x, z]) => x > -800 && x < -320 && z > -500 && z < 250));
  assert.ok(others.length > 50);
  for (const { id, r } of ground()) {
    const R = outwardRing(r);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1) continue;
      const [x, z] = onWall(F, F.len / 2, -1.5);
      for (const o of others) assert.ok(!pointInRing(o.r, x, z), `${id} at ${x.toFixed(1)}, ${z.toFixed(1)} inside ${o.id}`);
    }
  }
});

test('the missions\' places stay outside the row; the jetpack\'s pad and the shops\' signs', async () => {
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
  const near = points.filter(([x, z]) => x > -800 && x < -320 && z > -500 && z < 250);
  assert.ok(near.length > 10, 'the missions\' places read');
  // (the small foosball table's pin, js/missions-data-fun.js FOOSBALL_MINI_MISSION, stood inside w123384644 before: inside
  // OpenStreetMap's outline as in the survey's)
  const known = (x, z) => Math.hypot(x + 468.2, z + 310.4) < 0.1;
  assert.ok(pointInRing(osmRing('w123384644'), -468.2, -310.4));
  for (const [x, z] of near) if (!known(x, z)) assert.ok(!insideRow(x, z), `a mission's place at ${x}, ${z} inside the row`);
  const { PAD } = await import('../js/missions-data-jetpack.js');
  for (let a = 0; a < 6.3; a += 0.5) assert.ok(!insideRow(PAD.x + Math.cos(a) * PAD.r, PAD.z + Math.sin(a) * PAD.r), 'the jetpack\'s pad');
  // the Bar LaOnda's doors (js/promenade-platz-data.js) outside the walls
  const { PROMENADE_PLATZ } = await import('../js/promenade-platz-data.js');
  for (const [x, z] of PROMENADE_PLATZ.doors) assert.ok(!insideRow(x, z), `a door at ${x}, ${z}`);
  // the businesses in the houses (js/shops.js' boards) within 3 m of their walls
  const { SHOPS_DATA } = await import('../js/shops-data.js');
  for (const id of ['n1653595918', 'n599406857', 'n12109173096', 'n12075455760']) {
    const s = SHOPS_DATA.find((q) => q.osm === id);
    assert.ok(s, id);
    const d = Math.min(...ground().flatMap(({ r }) => r.map((p, i) => {
      const q = r[(i + 1) % r.length], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((s.x - p[0]) * dx + (s.z - p[1]) * dz) / L2));
      return Math.hypot(p[0] + dx * t - s.x, p[1] + dz * t - s.z);
    })));
    assert.ok(d < 3.5, `${id}: ${d.toFixed(1)} m from the walls`);
  }
});

test('the row in Node: every vertex finite, five meshes, the phone\'s materials plain, the hall kept open, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildObereStrasse2, ATLAS, HALL_BOXES, inHall, shopWalls, balconyWalls } = await import('../js/obere-strasse-2.js');
  for (const [id, rings] of groundOutlines()) assert.equal(SURVEYED_FOOTPRINTS.get(id).length, rings.length, id);
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'atlas cells overlapping');
  }
  // the shops' glazing where the shops are, balconies where the photographs show them
  for (const id of ['w123384613', 'w123384622', 'w123384644', 'w122930760', 'w127653863', 'w123384643', 'w1529973395']) assert.ok(shopWalls(HOUSES.find((h) => h.id === id)).length > 0, `${id}: its shops`);
  for (const id of ['w123384623', 'w123384611', 'w121860620', 'w123384622', 'w127653849']) assert.ok(balconyWalls(HOUSES.find((h) => h.id === id)).length > 0, `${id}: its balconies`);
  // the lettering on its walls: each sign within its wall's length
  const { wallNear } = await import('../js/obere-strasse-2-data.js');
  for (const h of HOUSES) for (const Sg of h.signs || []) {
    const w = wallNear(h, Sg.at, Sg.face);
    assert.ok(w && w.d < 4 && w.F.len >= Sg.w, `${h.id}: the sign ${Sg.key} on a wall long enough`);
    assert.ok(Sg.y1 < Math.max(...h.parts.map((p) => p.top ?? -Infinity)), `${h.id}: the sign ${Sg.key} under the roof`);
  }
  // the Schatzalpbahn's hall: its boxes over the track's start, in the station's outline
  assert.ok(HALL_BOXES.length >= 8);
  const station = groundOutlines().get('w123384643');
  assert.ok(HALL_BOXES.some((b) => station.some((r) => pointInRing(r, b.x, b.z))), 'the hall in the station');
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const { group, colliders } = buildObereStrasse2(new THREE.Scene());
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    assert.deepEqual(colliders, []);
    const names = group.children.map((m) => m.name.replace('Obere Strasse 2 ', '')).sort();
    assert.deepEqual(names, ['decal', 'glass', 'roof', 'trim', 'walls']);
    let tris = 0;
    for (const m of group.children) {
      const M = m.material;
      assert.ok(M, `${m.name}: a material`);
      if (simple) {
        const decal = M.opacityNode && M.transparent && !M.emissiveNode && !M.roughnessNode;
        const procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
        assert.ok(M.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
      }
      const g = m.geometry, p = g.attributes.position;
      assert.ok(p.count > 0);
      tris += p.count / 3;
      for (const name of Object.keys(g.attributes)) {
        const a = g.attributes[name].array;
        for (let i = 0; i < a.length; i++) assert.ok(Number.isFinite(a[i]), `${m.name}: a ${name} not finite`);
        if (name === 'color' || name === 'aHalf') assert.equal(g.attributes[name].count, p.count);
      }
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -12 && p.array[i] < 47, `${m.name}: a height of ${p.array[i]}`);
      // no wall, roof or trim in the hall's box (the funicular runs in there)
      if (m.name.endsWith('walls') || m.name.endsWith('trim') || m.name.endsWith('roof')) {
        const a = p.array;
        for (let i = 0; i < a.length; i += 9) {
          const c = [(a[i] + a[i + 3] + a[i + 6]) / 3, (a[i + 1] + a[i + 4] + a[i + 7]) / 3, (a[i + 2] + a[i + 5] + a[i + 8]) / 3];
          assert.ok(!inHall(c[0], c[1], c[2], -0.15), `${m.name}: a triangle in the funicular's hall at ${c.map((v) => v.toFixed(1))}`);
        }
      }
    }
    assert.ok(tris < 15000, `${tris} triangles`);
  }
});
