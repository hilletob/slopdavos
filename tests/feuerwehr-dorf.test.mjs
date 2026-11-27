import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  FEUERWEHR_DORF as D, annexEast, annexSouth, annexWest, groundOutlines, hallWall, insideDepot, onWall, outwardRing, pointInRing, ringArea2, roofRing, roofY,
  toLocal, toWorld, wallFrame
} from '../js/feuerwehr-dorf-data.js';
import { PARSENN } from '../js/sport-hotel-parsenn-data.js';
import { PISCHA } from '../js/pischa-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

test('the depot\'s outlines: of some size, the walls facing out, the annex against the hall', () => {
  for (const ring of groundOutlines()) {
    assert.ok(Math.abs(ringArea2(ring)) / 2 > 100, 'an outline of some size');
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 2) continue;
      assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.2)), 'a step out of a wall leaves the outline');
      assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.2)));
    }
  }
  // the hall about 12.5 m square, the annex about 151 m² as surveyed
  assert.ok(Math.abs(Math.abs(ringArea2(D.hall)) / 2 - 155) < 8);
  assert.ok(Math.abs(Math.abs(ringArea2(D.annex.ring)) / 2 - 151) < 8);
  // they share a wall: the annex's middle is not the hall's
  const [cx, cz] = toWorld(6, -3);
  assert.ok(pointInRing(D.annex.ring, cx, cz) && !pointInRing(D.hall, cx, cz));
  for (const side of ['south', 'east', 'north', 'west']) assert.ok(hallWall(side), side);
  for (const F of [annexSouth(), annexWest(), annexEast()]) assert.ok(F && F.len > 4);
});

test('the roof: the surveyed eaves and ridge, over the hall\'s walls, its walls\' tops under it', () => {
  const R = D.roof;
  assert.ok(Math.abs(roofY(R.west[0]) - 4.0) < 1e-9 && Math.abs(roofY(R.ridge[0]) - 6.6) < 1e-9 && Math.abs(roofY(R.east[0]) - 4.3) < 1e-9);
  // every corner of the hall under the roof's outline, a metre or so in from its edges
  const roof = roofRing();
  for (const [x, z] of D.hall) {
    assert.ok(pointInRing(roof, x, z));
    const [t, c] = toLocal(x, z);
    assert.ok(t - R.t0 > 0.8 && R.t1 - t > 0.8 && c - R.west[0] > 0.9 && R.east[0] - c > 0.8, 'an overhang on every side');
  }
  // the survey's ridge ends lie on the ridge, its eaves' corners on the outline
  for (const [x, z] of [[698.0, -1366.0], [706.3, -1377.8]]) assert.ok(Math.abs(toLocal(x, z)[1] - R.ridge[0]) < 0.1);
  for (const [x, z] of [[712.2, -1373.6], [703.9, -1361.8], [700.2, -1382.0], [691.9, -1370.2]]) assert.ok(roof.some(([p, q]) => Math.hypot(p - x, q - z) < 0.15));
  // the gables' boards over the upper floor, under the ridge; the long walls' tops over the upper floor
  assert.ok(D.gable > D.line && D.gable < R.ridge[1]);
  assert.ok(Math.min(roofY(toLocal(...D.hall[0])[1]), roofY(toLocal(...D.hall[1])[1])) > D.line + 0.5);
});

test('the floors add up: the engines\' floor and the upper floor under the eaves; the annex\'s roof under the upper floor\'s windows over it', () => {
  assert.ok(D.upper - D.floor > 4.2, 'a tall floor for the engines');
  assert.ok(Math.abs(D.line - D.upper - D.storey) < 1e-9);
  assert.ok(D.win.lo > 0.5 && D.win.hi < D.storey - 0.4);
  assert.ok(D.base < -4.81 - 0.3, 'the walls reach under the lowest ground');
  assert.ok(D.annex.top < D.upper + D.win.lo + 1.5);
});

test('the doors and the lettering on the forecourt\'s gable: within it, apart, between the doors\' tops and the windows', () => {
  const F = hallWall('south'), Dr = D.doors;
  assert.ok(F.n[1] > 0.7, 'the forecourt\'s gable faces south');
  const spans = Dr.at.map((s) => [s - Dr.w / 2, s + Dr.w / 2]).sort((p, q) => p[0] - q[0]);
  assert.ok(spans[0][0] > 0.4 && spans.at(-1)[1] < F.len - 0.4);
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] - spans[i - 1][1] > 1.0, 'a pier between the doors');
  assert.ok(Dr.top - D.floor > 3.5 && Dr.top + 0.3 < D.name.y0, 'the lettering over the doors\' lintels');
  assert.ok(D.name.y1 < D.upper + D.win.lo, 'under the upper floor\'s windows');
  assert.ok(D.name.w < F.len - 2);
  // the annex's door on its forecourt side
  const S = annexSouth();
  assert.ok(S.n[1] > 0.7 && D.annexDoor.s1 < S.len - 1 && D.annexDoor.top < D.annex.top - D.annex.fascia);
  // the openings within their walls
  for (const [F2, list] of [[hallWall('east'), D.openings.east], [hallWall('north'), D.openings.north], [annexWest(), D.openings.annexWest], [annexEast(), D.openings.annexEast]]) {
    for (const o of list) assert.ok(o.s - o.w / 2 > 0.3 && o.s + o.w / 2 < F2.len - 0.3);
  }
});

test('the neighbours: nothing of the depot overlaps the Sport Hotel Parsenn, the Pischa kiosk or the boxes beside it', async () => {
  const theirs = [PARSENN.hotel, PARSENN.restaurant.ring, PARSENN.yardWing, PISCHA.ring].filter(Boolean);
  const osm = (id) => { const b = DAVOS_DATA.buildings.find((q) => q.id === id); if (!b) return null; const r = []; for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]); return r; };
  for (const id of ['w1527538701', 'w1527538702']) { const r = osm(id); if (r) theirs.push(r); }
  const mine = [...groundOutlines(), roofRing()];
  // (each ring's points and the points along its edges, a few centimetres inside)
  const samples = (ring) => {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25));
      for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return out.map(([x, z]) => { const d = Math.hypot(cx - x, cz - z) || 1; return [x + ((cx - x) / d) * 0.08, z + ((cz - z) / d) * 0.08]; });
  };
  for (const m of mine) for (const t of theirs) {
    for (const [x, z] of samples(m)) assert.ok(!pointInRing(t, x, z), `the depot at ${x.toFixed(1)}, ${z.toFixed(1)} inside a neighbour`);
    for (const [x, z] of samples(t)) assert.ok(!pointInRing(m, x, z), `a neighbour at ${x.toFixed(1)}, ${z.toFixed(1)} inside the depot`);
  }
});

test('the missions\' doors and starts near the depot stay outside it', async () => {
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
  assert.ok(points.length > 20, 'the missions\' places read');
  const near = points.filter(([x, z]) => Math.hypot(x - 696, z + 1374) < 40);
  for (const [x, z] of near) assert.ok(!insideDepot(x, z), `a mission's place at ${x}, ${z} inside the depot`);
});

test('the depot in Node: every vertex finite, five meshes, no colliders of its own, the outlines registered', async () => {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const THREE = await import('three/webgpu');
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { buildFeuerwehrDorf, ATLAS } = await import('../js/feuerwehr-dorf.js');
  assert.equal(SURVEYED_FOOTPRINTS.get(D.osm).length, 2);
  // the atlas' cells apart and within it
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'cells apart');
  }
  // (SIMPLE_SKINS' materials marked as they are made: on the phone every material is one of them, the trim's vertex
  // colours or the decals' plain texture, as .claude/skills/gebaeude-nach-foto/scripts/mobile-check.mjs checks)
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
  for (const simple of [false, true]) {
    const { QUALITY } = await import('../js/quality.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    const scene = new THREE.Scene();
    const { group, colliders } = buildFeuerwehrDorf(scene);
    QUALITY.simpleMaterials = was;
    assert.equal(colliders.length, 0);
    assert.equal(group.userData.terrain, 'absolute');
    const names = group.children.map((m) => m.name.replace('Feuerwehrdepot Dorf ', '')).sort();
    assert.deepEqual(names, ['annex', 'decal', 'plaster', 'roof', 'trim']);
    for (const m of group.children) {
      assert.ok(m.material, `${m.name}: a material`);
      if (simple) {
        const M = m.material, decal = M.opacityNode && M.transparent && !M.emissiveNode && !M.roughnessNode;
        const procedural = M.colorNode || M.emissiveNode || M.roughnessNode || M.normalNode || M.positionNode;
        assert.ok(M.userData.simpleSkin || decal || !procedural, `${m.name}: a full shader on the phone`);
      }
      const p = m.geometry.attributes.position;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
      for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > D.base - 0.5 && p.array[i] < 7.2, `${m.name}: a height of ${p.array[i]}`);
    }
  }
});
