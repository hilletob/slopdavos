import test from 'node:test';
import assert from 'node:assert/strict';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { OSM_IDS, SCHULE_BUENDA, canopyRing, coverRuns, groundOutlines, groundParts, newOpenings, onWall, outwardRing, pointInRing, ringArea2, wallFrame, windowsFrom } from '../js/schule-buenda-data.js';
import { groundHeight } from '../js/terrain.js';

const osm = (id) => DAVOS_DATA.buildings.find((b) => b.id === id);
const pairs = (flat) => { const out = []; for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return out; };
const walls = (ring) => { const r = outwardRing(ring); return r.map((a, i) => wallFrame(a, r[(i + 1) % r.length])); };
/** Do two outlines overlap (a corner of one inside the other, 0.3 m in)? */
function overlap(a, b) {
  const inside = (ring, [x, z]) => pointInRing(ring, x, z) && [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].every(([dx, dz]) => pointInRing(ring, x + dx, z + dz));
  return a.some((p) => inside(b, p)) || b.some((p) => inside(a, p));
}
const P = SCHULE_BUENDA.parts, canopies = SCHULE_BUENDA.canopies.map(canopyRing);

test('the volumes: outlines of some size, their roofs over the ground, the floors ending at the roofs', () => {
  for (const p of P) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 5, `${p.id}: an outline of some size`);
    const [x, z] = p.ring[0];
    assert.ok(p.top > groundHeight(x, z) + 5, `${p.id}: its roof over the ground`);
    if (p.line !== undefined) assert.ok(p.line < p.top && p.top - p.line < 1, `${p.id}: the floors end at its roof`);
    if (p.foot !== undefined) assert.ok(p.ring.every(([px, pz]) => pointInRing(P[0].ring, px, pz)) && p.foot < P[0].top, `${p.id}: on the new building's roof`);
  }
  // the new building's floors: a tall ground floor and three more up to the roof's parapet
  const N = SCHULE_BUENDA.neu, f3 = N.foot + N.ground + 3 * N.storey;
  assert.ok(f3 < P[0].top && P[0].top - f3 < 1);
  assert.ok(N.foot + N.ground + N.storey < P.find((p) => p.id === 'aula').top, 'the wing: the ground floor and the first');
  // (its grid as the openings take it)
  const O = SCHULE_BUENDA.open, f1 = N.foot + N.ground;
  assert.ok(O.f1[0] > f1 && O.f1[1] < f1 + N.storey && O.f23[0] > f1 + N.storey && O.f23[1] < f3);
  assert.ok(O.spandrel[0] < f1 + 2 * N.storey && O.spandrel[1] > f1 + 2 * N.storey);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const ring of [...P.map((p) => p.ring), ...canopies]) {
    for (const F of walls(ring)) {
      if (F.len < 1) continue;
      const [x, z] = onWall(F, F.len / 2, 0.2), [xi, zi] = onWall(F, F.len / 2, -0.2);
      assert.ok(!pointInRing(ring, x, z) && pointInRing(ring, xi, zi));
    }
  }
  // the canopies before the walls they are named for: the hall's south-west front, the entrance hall's west front
  for (const c of SCHULE_BUENDA.canopies) {
    const F = wallFrame(c.wall.a, c.wall.b);
    assert.ok(F.n[0] < -0.4 && (c.id === 'vorplatz' ? F.n[0] < -0.8 : F.n[1] > 0.8), c.id);
  }
});

test('the survey\'s batches left out, the outlines registered, nothing on the neighbours, the paths free', () => {
  assert.equal(SCHULE_BUENDA.excludes.length, 6);
  const mine = OSM_IDS.map((id) => pairs(osm(id).ring));
  for (const e of SCHULE_BUENDA.excludes) {
    assert.ok(e.r <= 3 && Number.isFinite(e.x) && Number.isFinite(e.z));
    assert.ok(mine.some((r) => pointInRing(r, e.x, e.z)) || P.some((p) => pointInRing(p.ring, e.x, e.z)), `${e.x}, ${e.z}`);
    for (const b of DAVOS_DATA.buildings) if (!OSM_IDS.includes(b.id) && Math.hypot(b.ring[0] - e.x, b.ring[1] - e.z) < 120) assert.ok(!pointInRing(pairs(b.ring), e.x, e.z), `${b.id} under ${e.x}, ${e.z}`);
  }
  assert.deepEqual(OSM_IDS.sort(), ['w110590677', 'w110590706', 'w1527437006', 'w1527437007']);
  for (const id of OSM_IDS) {
    const rings = groundOutlines(id), o = osm(id);
    assert.ok(rings.length >= 1 && rings.every((r) => r.length >= 4));
    // near OSM's footprint: every corner within 2 m of it or inside it
    const ring = pairs(o.ring), F = walls(ring);
    const dist = ([x, z]) => Math.min(...F.map((W) => { const dx = x - W.a[0], dz = z - W.a[1], t = Math.max(0, Math.min(W.len, dx * W.u[0] + dz * W.u[1])); return Math.hypot(dx - W.u[0] * t, dz - W.u[1] * t); }));
    for (const r of rings) for (const q of r) assert.ok(pointInRing(ring, ...q) || dist(q) < 2.5, `${id}: ${q} near OSM's outline`);
  }
  // the lift's head is not registered (it stands on the roof)
  assert.ok(!groundOutlines('w110590706').some((r) => r === P.find((p) => p.id === 'neu-head').ring));
  // the parts apart from each other (touching where they meet) and from the neighbours, the canopies on the ground free
  const ground = groundParts();
  for (let i = 0; i < ground.length; i++) for (let j = i + 1; j < ground.length; j++) assert.ok(!overlap(ground[i].ring, ground[j].ring), `${ground[i].id} / ${ground[j].id}`);
  const neighbours = DAVOS_DATA.buildings.filter((b) => !OSM_IDS.includes(b.id) && Math.hypot(b.ring[0] - 905, b.ring[1] + 1290) < 160).map((b) => pairs(b.ring));
  assert.ok(neighbours.length >= 3);
  for (const a of [...ground.map((p) => p.ring), ...canopies]) for (const b of neighbours) assert.ok(!overlap(a, b), 'apart from a neighbour');
  for (const c of canopies) for (const p of ground) assert.ok(!overlap(c, p.ring), 'a canopy outside the walls');
  // the paths and lanes round the school: their middles outside every wall and canopy
  let checked = 0;
  for (const r of DAVOS_DATA.roads) {
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const [ax, az, bx, bz] = r.pts.slice(i, i + 4), len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= len; t += 0.5) {
        const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
        if (Math.hypot(x - 905, z + 1290) > 90) continue;
        checked++;
        for (const ring of [...ground.map((p) => p.ring), ...canopies]) assert.ok(!pointInRing(ring, x, z), `${r.name ?? r.kind} at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      }
    }
  }
  assert.ok(checked > 50, 'the paths round the school looked at');
});

test('the old school\'s windows begin over the ground: a plinth under them, whole floors counted down from the line', () => {
  assert.equal(windowsFrom(5.81, 3.6, -4.18, 0.95), 5.81 - 3 * 3.6);
  assert.equal(windowsFrom(5.81, 3.6, 7, 0.95), 5.81);
  for (const p of P.filter((q) => q.kind === 'alt')) {
    const lo = 0.95 * p.storey / 3.6;
    let windowed = 0;
    for (const F of walls(p.ring)) {
      if (F.len < 2.4) continue;
      for (const r of coverRuns(p, F)) {
        if (r.cover >= p.top) continue;
        let hi = r.cover;
        for (let s = r.s0; s <= r.s1; s += 1) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
        const from = windowsFrom(p.line, p.storey, hi + 0.25, lo);
        assert.ok(from + lo >= hi, `${p.id}: no window's sill under the ground`);
        assert.ok(Math.abs((p.line - from) / p.storey - Math.round((p.line - from) / p.storey)) < 1e-6);
        if (p.line - from > p.storey * 1.5 && r.s1 - r.s0 > 8) windowed++;
      }
    }
    assert.ok(windowed >= 1, `${p.id}: a windowed wall (${windowed})`);
  }
});

test('the new building\'s openings: in their walls, apart, over the ground and nothing before them', () => {
  const O = SCHULE_BUENDA.open;
  const count = { group: 0, glaze: 0, door: 0 };
  let westGroups = 0, endStrips = 0;
  for (const p of P.filter((q) => ['neu', 'aula', 'head'].includes(q.kind))) {
    for (const F of walls(p.ring)) {
      const runs = coverRuns(p, F);
      let hi = -Infinity;
      for (let s = 0; s <= F.len; s += 1) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
      const foot = Math.max(SCHULE_BUENDA.neu.foot, hi + 0.05), list = newOpenings(p, F, runs, foot);
      for (const h of list) {
        count[h.kind]++;
        assert.ok(h.s0 >= O.margin - 1e-6 && h.s1 <= F.len - O.margin + 1e-6 && h.s1 - h.s0 > 1, `${p.id}: inside its wall`);
        assert.ok(h.y0 >= hi - 1e-6 && h.y1 < p.top - 0.5, `${p.id}: over the ground and under the roof`);
        for (let s = h.s0; s <= h.s1; s += 0.5) assert.ok(groundHeight(...onWall(F, s, 0.5)) < h.y0 + 0.01, `${p.id}: no ground over a sill`);
        for (const r of runs) if (r.s1 > h.s0 && r.s0 < h.s1) assert.ok(r.cover < h.y0, `${p.id}: nothing built before an opening`);
        if (h.kind === 'group' && h.panes === 3 && p.id === 'neu' && F.n[0] < -0.7) westGroups++;
        if (h.kind === 'group' && h.panes === 1) endStrips++;
      }
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const [a, b] = [list[i], list[j]];
          assert.ok(a.s1 <= b.s0 || b.s1 <= a.s0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${p.id}: openings apart`);
        }
      }
    }
  }
  // the west front: three groups on the first floor and three over the top two; a strip up each end; doors, glazing
  assert.equal(westGroups, 6);
  assert.equal(endStrips, 4);
  assert.ok(count.glaze >= 3 && count.door >= 2, JSON.stringify(count));
});

test('the school in Node: every vertex finite, six meshes, the canopies\' posts; the phone\'s plain skins', async () => {
  const THREE = await import('three/webgpu');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  // (SIMPLE_SKINS' materials marked as they are made, as the skill's mobile-check.mjs does)
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  const { buildSchuleBuenda } = await import('../js/schule-buenda.js');
  const { QUALITY } = await import('../js/quality.js');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  for (const id of OSM_IDS) assert.deepEqual(SURVEYED_FOOTPRINTS.get(id), groundOutlines(id));
  for (const simple of [false, true]) {
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildSchuleBuenda(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name).sort();
    assert.deepEqual(names, ['alt', 'glass', 'halle', 'neu', 'roof', 'trim'].map((n) => `Schule Bünda ${n}`));
    for (const m of group.children) {
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] >= SCHULE_BUENDA.base - 0.01 && p.array[i] < 13.5, `${m.name}: a height of ${p.array[i]}`);
      for (const k of ['uv', 'normal']) for (const v of m.geometry.attributes[k].array) assert.ok(Number.isFinite(v));
      const mat = m.material;
      if (simple) {
        // (the phone: SIMPLE_SKINS' stock materials or the plain vertex-coloured trim; no procedural shader)
        if (m.name.endsWith('trim')) assert.ok(!mat.colorNode && !mat.emissiveNode && !mat.roughnessNode && mat.vertexColors);
        else assert.ok(mat.userData.simpleSkin, `${m.name}: one of SIMPLE_SKINS' on the phone`);
        assert.ok(!mat.roughnessNode && !mat.metalnessNode && !mat.normalNode && !mat.positionNode, `${m.name}: a plain skin on the phone`);
      } else if (!m.name.endsWith('trim') && !m.name.endsWith('roof')) assert.ok(mat.colorNode, `${m.name}: its procedural skin`);
    }
    // the windowed walls carry their windows' half lengths
    for (const k of ['alt', 'halle']) assert.ok(group.children.find((m) => m.name.endsWith(k)).geometry.attributes.aHalf);
    // the canopies' posts: thin boxes at world heights on the ground, outside every outline, apart from the paths
    assert.equal(colliders.length, SCHULE_BUENDA.canopies.reduce((n, c) => n + c.posts.length, 0));
    for (const c of colliders) {
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
      assert.ok(c.maxY > c.baseY + 2.8 && Math.max(c.obb.hx, c.obb.hz) < 0.15);
      assert.ok(Math.abs(c.baseY - groundHeight(c.obb.cx, c.obb.cz)) < 0.5, 'standing on the ground');
      assert.ok(!groundParts().some((p) => pointInRing(p.ring, c.obb.cx, c.obb.cz)));
    }
    // (between the posts and the wall a player passes: 2.5 m or more under the canopy)
    for (const c of SCHULE_BUENDA.canopies) assert.ok(c.postOut - SCHULE_BUENDA.post / 2 > 2.5 && c.height > 2.8);
  }
});
