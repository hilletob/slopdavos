import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FEG_DAVOS as D, bays, choirFaces, choirRoofY, groundOutlines, insideChurch, naveRoofY, naveWall, onWall, outwardRing, parts, pointInRing, porchRoofY,
  ringArea2, roofAt, sacristyRoofY, toLocal, toWorld, wallFrame
} from '../js/feg-davos-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};

test('the outlines: of some size, the walls facing out, on the survey\'s corners, near OSM\'s footprint', () => {
  for (const ring of groundOutlines()) {
    assert.ok(Math.abs(ringArea2(ring)) / 2 > 7, 'an outline of some size');
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1) continue;
      assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.2)), 'a step out of a wall leaves the outline');
      assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.2)));
    }
  }
  // the nave 16.2 × 12.3 m, the choir ~ 63 m², as surveyed
  const area = (id) => Math.abs(ringArea2(parts().find((p) => p.id === id).ring)) / 2;
  assert.ok(Math.abs(area('nave') - 16.2 * 12.3) < 1);
  assert.ok(Math.abs(area('choir') - 60) < 6 && area('porch') > 25 && area('sacristy') > 7);
  // the survey's walls at the ground (batches 4, 7, 0, 5): each corner within 0.25 m of an outline's corner
  const corners = [[-64.4, -648.3], [-79.2, -641.6], [-84.3, -652.8], [-69.5, -659.5], [-60.4, -652.8], [-59.1, -656.0], [-60.2, -658.5], [-63.7, -660.4],
    [-66.0, -661.6], [-65.2, -659.8], [-82.2, -640.9], [-86.2, -649.7], [-83.4, -650.9], [-79.5, -642.2]];
  const pts = groundOutlines().flat();
  for (const [x, z] of corners) assert.ok(pts.some(([p, q]) => Math.hypot(p - x, q - z) < 0.3), `${x} ${z}`);
  // the frame turns both ways
  for (const [t, c] of [[0, 0], [7.3, 4.1], [16.2, 12.3]]) { const [x, z] = toWorld(t, c), [t2, c2] = toLocal(x, z); assert.ok(Math.hypot(t2 - t, c2 - c) < 1e-9); }
  // OSM's footprint: every outline's corner within 2 m of it
  const osm = osmRing(D.osm);
  const dist = (x, z) => {
    if (pointInRing(osm, x, z)) return 0;
    let d = Infinity;
    for (let i = 0; i < osm.length; i++) {
      const a = osm[i], b = osm[(i + 1) % osm.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    }
    return d;
  };
  for (const [x, z] of pts) assert.ok(dist(x, z) < 2, `${x} ${z} near OSM's outline`);
  // the excluded batches' centres inside the church; the Schweizerhaus and the congregation's house w117012148 outside
  for (const e of D.exclude) assert.ok(insideChurch(e.x, e.z), `${e.x} ${e.z}`);
  assert.ok(!insideChurch(-28, -619) && !insideChurch(-63, -678));
  // the parts do not overlap (each one's middle in none of the others)
  for (const p of parts()) {
    const n = p.ring.length, m = p.ring.reduce((s, q) => [s[0] + q[0] / n, s[1] + q[1] / n], [0, 0]);
    for (const q of parts()) if (q.id !== p.id) assert.ok(!pointInRing(q.ring, ...m), `${p.id} in ${q.id}`);
  }
});

test('the roofs as surveyed: the nave\'s saddle, the choir\'s hips, the lean-tos', () => {
  // the nave (batch 4): ridge y 10.4, eaves y 3.6
  for (const [x, y, z] of [[-67.0, 10.4, -653.9], [-81.7, 10.4, -647.2], [-63.5, 3.6, -647.9], [-79.6, 3.6, -640.6], [-85.3, 3.6, -653.2], [-69.1, 3.6, -660.5]]) {
    assert.ok(Math.abs(naveRoofY(toLocal(x, z)[1]) - y) < 0.15, `${x} ${z}`);
  }
  // the choir (batch 7): its ridge at y 8.6, its eaves and the tops of its walls
  for (const [x, y, z] of [[-62.0, 8.6, -656.1], [-65.2, 4.2, -649.9], [-59.9, 4.2, -652.3], [-58.3, 4.2, -656.0], [-59.6, 4.2, -659.0], [-63.7, 4.2, -661.3],
    [-60.3, 5.2, -653.1], [-59.1, 5.2, -656.0], [-60.1, 5.2, -658.4], [-63.4, 5.1, -660.2]]) {
    assert.ok(Math.abs(choirRoofY(...toLocal(x, z)) - y) < 0.3, `${x} ${z}: ${choirRoofY(...toLocal(x, z))} for ${y}`);
  }
  // each face planar and facing up, the choir's ridge under the nave's
  for (const f of choirFaces()) for (const p of f) assert.ok(Math.abs(choirRoofY(p[0], p[1]) - p[2]) < 1e-6);
  assert.ok(D.choirRoof.ridge[1] < D.roof.ridge[1] - 1);
  // the sacristy's lean-to (batch 0) and the porch's (batch 5)
  assert.ok(Math.abs(sacristyRoofY(toLocal(-65.6, -662.6)[1]) - 4.1) < 0.2);
  for (const [x, y, z] of [[-80.0, 3.8, -643.5], [-82.8, 3.8, -649.6], [-87.1, 2.7, -650.1], [-82.6, 2.7, -639.9], [-81.7, 3.1, -641.1], [-85.6, 3.1, -649.9]]) {
    assert.ok(Math.abs(porchRoofY(...toLocal(x, z)) - y) < 0.25, `${x} ${z}: ${porchRoofY(...toLocal(x, z))} for ${y}`);
  }
  // the highest roof over a point: the nave's ridge, the choir's
  assert.ok(Math.abs(roofAt(-74.3, -650.6) - 10.4) < 0.3);
  assert.ok(Math.abs(roofAt(-62.5, -656) - choirRoofY(...toLocal(-62.5, -656))) < 1e-9);
  assert.equal(roofAt(-40, -640), null);
});

test('the turret on the ridge near the west gable, its spire well over the roof', () => {
  const T = D.turret;
  assert.ok(T.t - T.half > 0.5 && T.t + T.half < D.len / 2, 'on the ridge, in the nave\'s western half');
  assert.ok(T.belfry > D.roof.ridge[1] + 1.5 && T.spire > T.belfry + 5 && T.cross > T.spire);
});

test('the windows: on the long walls between the buttresses, over the ground, under the corbel table', () => {
  const S = naveWall('south'), N = naveWall('north');
  assert.ok(S.n[1] > 0.85 && S.n[0] > 0.3, 'the long wall on the Promenade faces south-south-west');
  assert.ok(N.n[1] < -0.85, 'the other faces the hillside');
  const u = bays(S.len);
  assert.equal(u.length, 5);
  // the buttresses between them, clear of each window
  for (const t of D.buttress.at) for (const w of u) assert.ok(Math.abs(t - (S.len / 2 + w)) > D.win.half + D.buttress.half + 0.2);
  // the windows' heads under the corbel table on the long walls
  const head = D.nave.floor + D.win.spring + D.win.half + 0.16;
  assert.ok(head < naveRoofY(0) - 0.06 - D.corbel - 0.1);
  // the rose over the porch's roof and under the gable's slopes
  const R = D.rose;
  assert.ok(R.y - R.r > D.porchRoof.top[2] + 0.3);
  for (const dc of [-R.r, R.r]) assert.ok(naveRoofY(R.c + dc) > R.y + 0.3);
  // the porch's end wide enough for its door
  const P = D.porch.ring, F = wallFrame(toWorld(...P[0]), toWorld(...P[1]));
  assert.ok(F.len > D.door.w + 0.8 && F.n[1] > 0.85, 'the porch\'s end faces the Promenade');
  assert.ok(porchRoofY(-1.5, 0.63) > D.porch.floor + D.door.h + 1);
});

test('no mission place on the church or within 2 m of its walls', () => {
  const places = [];
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    const src = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/x:\s*(-?\d+(?:\.\d+)?),\s*(?:y:\s*-?\d+(?:\.\d+)?,\s*)?z:\s*(-?\d+(?:\.\d+)?)/g)) places.push([+m[1], +m[2], f]);
  }
  assert.ok(places.length > 50, 'the missions\' places were read');
  for (const [x, z, f] of places) {
    assert.ok(!insideChurch(x, z), `${f}: ${x} ${z} inside the church`);
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) assert.ok(!insideChurch(x + dx, z + dz), `${f}: ${x} ${z} within 2 m of a wall`);
  }
});

// (a stand-in canvas for the build in Node)
function standInDocument() {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
}
async function build(simple) {
  standInDocument();
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const was = QUALITY.simpleMaterials;
  QUALITY.simpleMaterials = simple;
  try {
    const { buildFegDavos } = await import('../js/feg-davos.js');
    return buildFegDavos(new THREE.Scene());
  } finally {
    QUALITY.simpleMaterials = was;
  }
}

test('the building in Node: every vertex finite, four meshes, the outlines registered, the buttresses as colliders', async () => {
  const { group, colliders } = await build(false);
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(D.osm), groundOutlines());
  assert.equal(group.userData.terrain, 'absolute');
  assert.deepEqual(group.children.map((m) => m.name).sort(), ['FEG Davos decal', 'FEG Davos roof', 'FEG Davos trim', 'FEG Davos walls']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > D.base - 3 && p.array[i] < D.turret.cross + 0.1, `${m.name}: a height of ${p.array[i]}`);
  }
  assert.ok(group.children.find((m) => m.name.endsWith('walls')).geometry.attributes.aHalf, 'the walls carry the windows\' grid');
  // the buttresses: eight, each before its wall (outside the nave), from under the ground up to its cap
  assert.equal(colliders.length, 2 * D.buttress.at.length);
  for (const c of colliders) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > c.baseY + 3 && c.baseY === c.minY && c.obb.hz < 0.4 && c.obb.hx < 0.4);
    assert.ok(!insideChurch(c.obb.cx, c.obb.cz));
  }
});

test('the phone\'s profile: no procedural shader but the decal\'s', async () => {
  const { group } = await build(true);
  for (const m of group.children) assert.ok(!m.material.roughnessNode && !m.material.metalnessNode && !m.material.normalNode, `${m.name}: a simple material`);
});
