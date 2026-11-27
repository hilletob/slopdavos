import test from 'node:test';
import assert from 'node:assert/strict';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { SCHULEN, allParts, groundOutlines, onWall, outwardRing, partAt, pointInRing, porticoRing, ringArea2, shelterRing, wallFrame, windowsFrom } from '../js/schulen-platz-data.js';
import { SAMD } from '../js/samd-data.js';
import { HARD_ROCK_HOTEL } from '../js/hard-rock-hotel-data.js';
import { groundHeight } from '../js/terrain.js';

const osm = (id) => DAVOS_DATA.buildings.find((b) => b.id === id);
const pairs = (flat) => { const out = []; for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return out; };
/** Do two outlines overlap (a corner of one inside the other, 0.3 m in)? */
function overlap(a, b) {
  const inside = (ring, [x, z]) => {
    if (!pointInRing(ring, x, z)) return false;
    // (a corner on the other's wall is touching, not overlapping: 0.3 m into the ring from it in all four directions)
    return [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].every(([dx, dz]) => pointInRing(ring, x + dx, z + dz));
  };
  return a.some((p) => inside(b, p)) || b.some((p) => inside(a, p));
}

test('the schools\' volumes: outlines of some size, the floors ending at their roofs', () => {
  for (const p of allParts()) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 15, `${p.id}: an outline of some size`);
    assert.ok(p.top > SCHULEN.base + 5, `${p.id}: its roof over the base`);
    if (p.line !== undefined) assert.ok(p.line <= p.top && p.top - p.line < 1.6, `${p.id}: the floors end at its roof`);
    if (p.foot !== undefined) {
      // (a head on a roof: its walls from under the roof it stands on, inside that roof's outline)
      const under = allParts().find((q) => q.school.id === p.school.id && q.foot === undefined && p.ring.every(([x, z]) => pointInRing(q.ring, x, z)));
      assert.ok(under && p.foot < under.top && p.foot > under.top - 1, `${p.id}: on ${under?.id}`);
    }
  }
  // the annex of the Oberstufenschulhaus on the block's grid, two floors under its line
  const oss = SCHULEN.schools[0];
  assert.ok(Math.abs(oss.parts[0].line - 3 * oss.storey - oss.parts[1].line) < 1e-9);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const ring of [...allParts().map((p) => p.ring), SCHULEN.hall.ring, shelterRing(), porticoRing()]) {
    const r = outwardRing(ring);
    for (let i = 0; i < r.length; i++) {
      const F = wallFrame(r[i], r[(i + 1) % r.length]);
      if (F.len < 1) continue;
      const [x, z] = onWall(F, F.len / 2, 0.2), [xi, zi] = onWall(F, F.len / 2, -0.2);
      assert.ok(!pointInRing(ring, x, z) && pointInRing(ring, xi, zi));
    }
  }
  // the fronts named in the data: their outside where it is said to be
  const H = SCHULEN.hall;
  assert.ok(wallFrame(H.west.a, H.west.b).n[0] < -0.8, 'the hall\'s west front faces the lane');
  assert.ok(wallFrame(H.east.a, H.east.b).n[0] > 0.8, 'the hall\'s east front faces the playground');
  assert.ok(wallFrame(SCHULEN.shelter.wall.a, SCHULEN.shelter.wall.b).n[0] < -0.8, 'the shelter on the lane side');
});

test('the windows begin over the ground: a plinth under them, the floors counted down from the line', () => {
  assert.equal(windowsFrom(2.0, 3.4, -12.0, 0.95), 2.0 - 4 * 3.4);
  assert.equal(windowsFrom(2.0, 3.4, -14.2, 0.95), 2.0 - 5 * 3.4);
  assert.equal(windowsFrom(2.0, 3.4, 5, 0.95), 2.0);
  for (const s of SCHULEN.schools) {
    for (const p of s.parts.filter((q) => q.line !== undefined)) {
      const r = outwardRing(p.ring);
      for (let i = 0; i < r.length; i++) {
        const F = wallFrame(r[i], r[(i + 1) % r.length]);
        let hi = -Infinity;
        for (let t = 0; t <= F.len; t += 1) hi = Math.max(hi, groundHeight(...onWall(F, t, 0.5)));
        const from = windowsFrom(p.line, s.storey, hi + 0.25, 0.85);
        assert.ok(from >= hi - 0.9, `${p.id}: no window's sill under the ground`);
        // (whole floors)
        assert.ok(Math.abs((p.line - from) / s.storey - Math.round((p.line - from) / s.storey)) < 1e-6);
      }
    }
  }
});

test('the survey\'s batches left out, the outlines registered, nothing on the neighbours', () => {
  assert.equal(SCHULEN.excludes.length, 5);
  for (const e of SCHULEN.excludes) assert.ok(e.r <= 3 && Number.isFinite(e.x) && Number.isFinite(e.z));
  // each centre near its building (or the slabs between them), none on a neighbour's footprint
  const ids = ['w121860619', 'w126271049', 'w225912220', 'w1529537263'];
  const mine = ids.map((id) => pairs(osm(id).ring));
  for (const e of SCHULEN.excludes) {
    assert.ok(mine.some((r) => pointInRing(r, e.x, e.z)) || allParts().some((p) => pointInRing(p.ring, e.x, e.z)) || Math.hypot(e.x + 459.5, e.z + 86) < 1, `${e.x}, ${e.z}`);
    for (const b of DAVOS_DATA.buildings) if (!ids.includes(b.id) && Math.hypot(b.ring[0] - e.x, b.ring[1] - e.z) < 120) assert.ok(!pointInRing(pairs(b.ring), e.x, e.z), `${b.id} under ${e.x}, ${e.z}`);
  }
  for (const s of SCHULEN.schools) {
    const rings = groundOutlines(s.osm);
    assert.ok(rings.length >= 1 && rings.every((r) => r.length >= 4));
    // (the heads on the roofs left out)
    assert.equal(rings.length, s.parts.filter((p) => p.foot === undefined).length);
    // near OSM's footprint
    const o = osm(s.osm);
    assert.ok(o && rings.every((r) => r.every(([x, z]) => Math.hypot(x - o.ring[0], z - o.ring[1]) < 80)));
  }
  // the neighbours built by hand and the kindergarten: not overlapped by anything built here
  const built = [...allParts().map((p) => p.ring), SCHULEN.hall.ring, shelterRing(), porticoRing()];
  const neighbours = [...SAMD.parts.map((p) => p.ring), ...HARD_ROCK_HOTEL.parts.map((p) => p.ring),
    ...['w124794977', 'w225913310', 'w225912216', 'w126271007', 'w123380401', 'w1390001583'].map(osm).filter(Boolean).map((b) => pairs(b.ring))];
  for (const a of built) for (const b of neighbours) assert.ok(!overlap(a, b), 'apart from a neighbour');
  // the schools apart from each other but where they meet the hall
  const parts = allParts().filter((p) => p.foot === undefined);
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) assert.ok(!overlap(parts[i].ring, parts[j].ring), `${parts[i].id} / ${parts[j].id}`);
  for (const p of parts) for (const r of [SCHULEN.hall.ring, shelterRing(), porticoRing()]) assert.ok(!overlap(p.ring, r), `${p.id}`);
  assert.ok(!overlap(SCHULEN.hall.ring, shelterRing()) && !overlap(SCHULEN.hall.ring, porticoRing()));
});

test('the lane and the playground\'s court stay free', () => {
  const free = [...allParts().map((p) => p.ring), SCHULEN.hall.ring, shelterRing(), porticoRing()];
  // the Schulstrasse (6 m wide): its middle and both its edges
  for (const r of DAVOS_DATA.roads.filter((x) => x.name === 'Schulstrasse')) {
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const [ax, az, bx, bz] = r.pts.slice(i, i + 4), len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= len; t += 1) {
        const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len, nx = -(bz - az) / len, nz = (bx - ax) / len;
        for (const o of [-r.width / 2, 0, r.width / 2]) for (const ring of free) assert.ok(!pointInRing(ring, x + nx * o, z + nz * o), `the lane at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      }
    }
  }
  // the court on the playground (js/ground-sports-data.js "Schulhaus Davos Platz")
  for (const [x, z] of [[-453, -42], [-449.5, -51.1], [-456.1, -33.5], [-459.5, -40.9]]) {
    assert.equal(partAt(x, z), null);
    for (const ring of free) assert.ok(!pointInRing(ring, x, z));
  }
});

test('the atlas, the decals inside their walls', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const { ATLAS, glassBlocks } = await import('../js/schulen-platz.js');
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'atlas cells apart');
    }
  }
  // the poster in the hall's west front, the name on the portico's beam
  const H = SCHULEN.hall, F = wallFrame(H.west.a, H.west.b);
  assert.ok(H.poster.s > 0.3 && H.poster.s + H.poster.w < F.len - 0.3 && H.poster.y1 < -8 - -14.5);
  const P = SCHULEN.portico;
  assert.ok(P.name.w < P.to - P.from && P.name.h < P.beam);
  assert.ok(H.door.s - H.door.w / 2 > 0 && H.door.s + H.door.w / 2 < wallFrame(H.east.a, H.east.b).len);
  // the glass blocks: on the towers' lane faces, over the ground and under their roofs, inside the face
  for (const t of SCHULEN.schools[1].parts.filter((p) => p.tower)) {
    const r = outwardRing(t.ring);
    let faces = 0;
    for (let i = 0; i < r.length; i++) {
      const W = wallFrame(r[i], r[(i + 1) % r.length]);
      if (W.n[0] > -0.7) continue;
      faces++;
      const ground = groundHeight(...onWall(W, W.len / 2, 0.5));
      const list = glassBlocks(W, SCHULEN.schools[1].parts[0].line, SCHULEN.schools[1].storey, t.top, ground);
      assert.ok(list.length >= 3, `${t.id}: ${list.length} windows`);
      for (const w of list) assert.ok(w.s0 > 0 && w.s1 < W.len && w.y0 > ground && w.y1 < t.top);
    }
    assert.equal(faces, 1, `${t.id}: one face on the lane`);
  }
});

test('the schools in Node: every vertex finite, seven meshes, the posts\' colliders; the phone\'s plain skins', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { buildSchulenPlatz } = await import('../js/schulen-platz.js');
  const { QUALITY } = await import('../js/quality.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  for (const s of SCHULEN.schools) assert.deepEqual(SURVEYED_FOOTPRINTS.get(s.osm), groundOutlines(s.osm));
  for (const simple of [false, true]) {
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildSchulenPlatz(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name).sort();
    assert.deepEqual(names, ['decal', 'glass', 'mid', 'oss', 'prim', 'roof', 'trim'].map((n) => `Schulen Platz ${n}`));
    for (const m of group.children) {
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= SCHULEN.base - 0.01 && p.array[i] < 13, `${m.name}: a height of ${p.array[i]}`);
      for (const k of ['uv', 'normal']) for (const v of m.geometry.attributes[k].array) assert.ok(Number.isFinite(v));
      if (simple) {
        // (the phone: SIMPLE_SKINS' stock materials, the plain vertex-coloured trim, the decal: no procedural shader)
        const mat = m.material;
        assert.ok(!mat.roughnessNode && !mat.metalnessNode && !mat.normalNode && !mat.positionNode, `${m.name}: a plain skin on the phone`);
        if (m.name.endsWith('trim')) assert.ok(!mat.colorNode && !mat.emissiveNode && mat.vertexColors);
        if (m.name.endsWith('decal')) assert.ok(mat.transparent && mat.opacityNode && !mat.emissiveNode);
      }
    }
    // the walls carry their windows' half lengths
    for (const k of ['oss', 'mid', 'prim']) assert.ok(group.children.find((m) => m.name.endsWith(k)).geometry.attributes.aHalf);
    // the portico's posts and the shelter's: thin boxes at world heights, outside every school's outline and the hall's
    assert.equal(colliders.length, SCHULEN.portico.posts.length + SCHULEN.shelter.posts.length + 1);
    for (const c of colliders) {
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
      assert.ok(c.maxY > c.baseY + 2.5 && Math.min(c.obb.hx, c.obb.hz) < 0.3);
      assert.ok(Math.abs(c.baseY - groundHeight(c.obb.cx, c.obb.cz)) < 1.5, 'standing on the ground');
      assert.ok(!allParts().some((p) => pointInRing(p.ring, c.obb.cx, c.obb.cz)) && !pointInRing(SCHULEN.hall.ring, c.obb.cx, c.obb.cz));
    }
  }
});
