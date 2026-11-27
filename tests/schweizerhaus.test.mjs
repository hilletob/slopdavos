import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SCHWEIZERHAUS as D, arcadePosts, bays, crossOutline, crossRoofY, groundOutline, insideHouse, loggiaPosts, mainRoofY, northGable, onWall, outwardRing,
  pointInRing, ringArea2, roofYAt, toLocal, toWorld, wallFrame, westFront
} from '../js/schweizerhaus-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const osmRing = (id) => {
  const b = DAVOS_DATA.buildings.find((q) => q.id === id);
  const r = [];
  for (let i = 0; i < b.ring.length; i += 2) r.push([b.ring[i], b.ring[i + 1]]);
  return r;
};

test('the outlines: of some size, the walls facing out, on the survey\'s corners, near OSM\'s footprint', () => {
  for (const ring of [...D.parts.map((p) => p.ring), groundOutline()]) {
    assert.ok(Math.abs(ringArea2(ring)) / 2 > 40, 'an outline of some size');
    const R = outwardRing(ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1) continue;
      assert.ok(!pointInRing(ring, ...onWall(F, F.len / 2, 0.2)), 'a step out of a wall leaves the outline');
      assert.ok(pointInRing(ring, ...onWall(F, F.len / 2, -0.2)));
    }
  }
  // the house 13.1 × 14.9 m and the middle's 1.4 m before the east front, as surveyed
  assert.ok(Math.abs(Math.abs(ringArea2(groundOutline())) / 2 - (13.1 * 14.92 + 1.43 * 5.3)) < 1);
  // the survey's walls at the ground (batches 6 and 10): each corner within 0.25 m of an outline's corner
  const corners = [[-35.3, -620.1], [-35.5, -624.8], [-22.4, -625.4], [-22.2, -620.7], [-22.0, -615.4], [-21.8, -610.5], [-35.0, -614.8], [-34.8, -609.9], [-20.8, -620.8], [-20.5, -615.5]];
  const pts = D.parts.flatMap((p) => p.ring);
  for (const [x, z] of corners) assert.ok(pts.some(([p, q]) => Math.hypot(p - x, q - z) < 0.25), `${x} ${z}`);
  // the frame turns both ways
  for (const [t, c] of [[0, 0], [7.3, 4.1], [13.1, 14.92]]) { const [x, z] = toWorld(t, c), [t2, c2] = toLocal(x, z); assert.ok(Math.hypot(t2 - t, c2 - c) < 1e-9); }
  // OSM's footprint: the outline's corners within 2.5 m of it (it stands north of the survey)
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
  for (const [x, z] of groundOutline()) assert.ok(dist(x, z) < 2.5, `${x} ${z} near OSM's outline`);
  // the excluded batches' centres lie inside the house, its neighbour's (the Freie Evangelische Gemeinde) far off
  for (const e of D.exclude) assert.ok(insideHouse(e.x, e.z) && e.r <= 3);
  assert.ok(!insideHouse(-71, -654));
});

test('the roofs: the saddle roof and the cross roof as surveyed, the middle\'s walls under its eaves', () => {
  // the saddle roof's eaves, ridge and verges (batch 6)
  const near = (t, c, y) => Math.abs(roofYAt(t, c) - y) < 0.2;
  assert.ok(Math.abs(mainRoofY(D.roof.west[0]) - 4.5) < 1e-9 && Math.abs(mainRoofY(D.roof.ridge[0]) - 8.9) < 1e-9 && Math.abs(mainRoofY(D.roof.east[0]) - 5.1) < 1e-9);
  for (const [x, y, z] of [[-35.0, 4.9, -614.8], [-31.2, 7.2, -620.3], [-25.3, 7.2, -620.6], [-21.2, 5.1, -615.4], [-28.5, 8.9, -625.1], [-27.8, 8.9, -610.3]]) {
    const [t] = toLocal(x, z);
    assert.ok(Math.abs(mainRoofY(t) - y) < 0.25, `${x} ${z}: ${mainRoofY(t)} for ${y}`);
  }
  // the cross roof (batch 10): its ridge and eaves; over the middle it is the higher
  for (const [x, y, z] of [[-35.1, 11.2, -617.4], [-20.6, 11.2, -618.1], [-36.0, 9.0, -613.7], [-36.3, 9.0, -621.1], [-30.9, 9.6, -615.0], [-25.3, 9.6, -620.6]]) {
    const [, c] = toLocal(x, z);
    assert.ok(Math.abs(crossRoofY(c) - y) < 0.2, `${x} ${z}: ${crossRoofY(c)} for ${y}`);
  }
  assert.ok(near(7, 7.37, 11.2) && near(1.0, 2.0, mainRoofY(1.0)));
  const X = D.middle;
  for (let t = 0.2; t < X.t1; t += 0.5) for (const c of [X.c0 + 0.1, X.c1 - 0.1]) assert.ok(pointInRing(crossOutline(), t, c), `the cross roof over the middle at ${t} ${c}`);
  // the middle's long walls end under the cross roof, over the saddle roof
  assert.ok(crossRoofY(X.c0) > 9.5 && crossRoofY(X.c1) > 9.5 && mainRoofY(D.roof.ridge[0]) < crossRoofY(X.c0) - 0.5);
  // the cross roof's eaves draw back to the walls over the saddle roof, its outline closed and simple
  const R = crossOutline();
  assert.ok(Math.abs(ringArea2(R)) / 2 > 100);
  for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5); }
});

test('the floors add up: the street\'s ground floor, the storeys under the eaves and the middle\'s roof', () => {
  // the ground floor a little over the street on the north (y −6.0), the lower floor's windows over the ground on the south
  assert.ok(D.floor > -6.0 && D.floor < -5.0);
  // the wings' first floor ends under their eaves, the second floor's windows lie in the gables under the roof
  assert.ok(D.attic.wing < mainRoofY(0) - 1.5 && Math.abs(D.attic.wing - (D.floor + 2 * D.storey)) < 1e-9);
  // three window rows on the middle's gables, its walls up to the eaves at y 9.5
  assert.ok(Math.abs(D.attic.middle - (D.floor + 3 * D.storey)) < 1e-9 && D.attic.middle < crossRoofY(D.middle.c0) - 1.5);
  // the second floor's windows on the gables (their shutters and hoods too) under the roof
  const N = northGable(), m = N.len / 2;
  const top = (u) => mainRoofY(toLocal(...onWall(N, m + u))[0]) - 0.06, second = D.floor + 2 * D.storey;
  for (const b of bays(N.len)) {
    const casing = b.ext - D.win.shutter;
    // (the shutters' outer edges up to the window's head, the hood a little wider than the casing over it)
    for (const u of [b.u - b.ext, b.u + b.ext]) assert.ok(top(u) > second + D.win.hi, `a shutter at ${u} under the roof`);
    for (const u of [b.u - casing - 0.1, b.u + casing + 0.1]) assert.ok(top(u) > second + D.win.hi + 0.2, `a hood at ${u} under the roof`);
  }
  // the bays: three on the gables (the middle one a pair), one pair on the wings' sides, three on the middle's gables
  assert.deepEqual(bays(N.len).map((b) => b.kind), ['single', 'pair', 'single']);
  assert.deepEqual(bays(4.7).map((b) => b.kind), ['pair']);
  assert.deepEqual(bays(5.3, true).map((b) => b.kind), ['single', 'pair', 'single']);
  for (const len of [N.len, 4.7, 4.92]) for (const b of bays(len)) assert.ok(Math.abs(b.u) + b.ext + 0.3 <= len / 2);
});

test('the north gable\'s paintings and boards lie on its wall, clear of the windows and under the roof', () => {
  const N = northGable(), m = N.len / 2, G = D.north;
  assert.ok(N.n[1] < -0.95, 'the gable faces the street (north)');
  const B = bays(N.len), W = D.win;
  // (is a rectangle u0–u1, y0–y1 clear of every window with its shutters, sill and hood?)
  const clear = (u0, u1, y0, y1) => {
    for (let k = -1; k <= 2; k++) {
      const f = D.floor + k * D.storey;
      for (const b of B) {
        const overU = u1 > b.u - b.ext - 0.05 && u0 < b.u + b.ext + 0.05, overY = y1 > f + W.lo - 0.1 && y0 < f + W.hi + 0.22;
        if (overU && overY) return false;
      }
    }
    return true;
  };
  for (const f of G.figures) assert.ok(clear(f.u - f.w / 2, f.u + f.w / 2, G.figureY[0], G.figureY[1]), `the figure at ${f.u}`);
  assert.ok(clear(-G.shields.w / 2, G.shields.w / 2, G.shields.y0, G.shields.y1));
  assert.ok(clear(G.corner.u0, G.corner.u1, G.corner.y0, G.corner.y1));
  assert.ok(clear(G.sign.u0, G.sign.u1, G.sign.y0, G.sign.y1));
  for (const u of [G.corner.u1, G.sign.u1, ...G.figures.map((f) => f.u + f.w / 2)]) assert.ok(Math.abs(u) < m - 0.05, 'within the wall');
  // the figures and the hood under the roof's slope
  for (const f of G.figures) for (const u of [f.u - f.w / 2, f.u + f.w / 2]) assert.ok(mainRoofY(toLocal(...onWall(N, m + u))[0]) > G.figureY[1] + 0.3);
  for (const u of [-G.hood.w / 2, G.hood.w / 2]) assert.ok(mainRoofY(toLocal(...onWall(N, m + u))[0]) > G.hood.y1 + 0.3);
  // the hood sits on the pair's casing
  assert.ok(Math.abs(G.hood.y0 - (D.floor + 2 * D.storey + W.hi)) < 0.05 && G.hood.w > 2 * W.pair);
});

test('the west front: its arcade, balcony and loggias before the walls, under the eaves, the door in the middle', () => {
  const F = westFront(), A = D.front;
  assert.ok(F.n[0] < -0.95, 'the front faces west');
  assert.ok(Math.abs(F.len - D.len) < 1e-6);
  const posts = arcadePosts();
  assert.equal(posts.length, A.posts + 1);
  for (let i = 1; i < posts.length; i++) assert.ok(posts[i] - posts[i - 1] > 1.2 && posts[i] - posts[i - 1] < 2.0);
  for (const c of [...posts, ...loggiaPosts()]) {
    const [x, z] = onWall(F, c, A.depth - 0.1);
    assert.ok(!insideHouse(x, z), 'a post stands before the wall');
    assert.ok(c >= A.c0 - 1e-9 && c <= A.c1 + 1e-9);
  }
  // the loggias on the wings, not before the middle's gable; their head under the saddle roof's eaves
  for (const [c0, c1] of A.loggias) assert.ok(c1 <= D.middle.c0 || c0 >= D.middle.c1);
  assert.ok(A.head + 0.18 < mainRoofY(0) && Math.abs(A.balcony - (D.floor + D.storey)) < 1e-9 && A.terrace === D.floor);
  // the door in the middle's gable on the ground floor, clear of the arcade's posts
  const d = D.door;
  assert.ok(d.c - d.w / 2 > D.middle.c0 + 0.3 && d.c + d.w / 2 < D.middle.c1 - 0.3);
  assert.ok(d.h < A.balcony - A.slab - D.floor - A.arch + 0.5);
  // the attic pair under the west gable's apex
  const P = D.atticPair, half = P.gap / 2 + 2 * P.half;
  for (const c of [(D.middle.c0 + D.middle.c1) / 2 - half, (D.middle.c0 + D.middle.c1) / 2 + half]) assert.ok(crossRoofY(c) - 0.06 > P.y1 + 0.2);
  assert.ok(P.y0 > D.attic.middle + 0.3);
});

test('no mission place on the house or within 2 m of its walls', () => {
  const places = [];
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter((n) => /^missions-data-.*\.js$/.test(n))) {
    const src = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/x:\s*(-?\d+(?:\.\d+)?),\s*(?:y:\s*-?\d+(?:\.\d+)?,\s*)?z:\s*(-?\d+(?:\.\d+)?)/g)) places.push([+m[1], +m[2], f]);
  }
  assert.ok(places.length > 50, 'the missions\' places were read');
  for (const [x, z, f] of places) {
    assert.ok(!insideHouse(x, z), `${f}: ${x} ${z} inside the house`);
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) assert.ok(!insideHouse(x + dx, z + dz), `${f}: ${x} ${z} within 2 m of a wall`);
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
    const { buildSchweizerhaus } = await import('../js/schweizerhaus.js');
    const scene = new THREE.Scene();
    return { THREE, ...buildSchweizerhaus(scene) };
  } finally {
    QUALITY.simpleMaterials = was;
  }
}

test('the building in Node: every vertex finite, six meshes, the outline registered, the arcade\'s posts as colliders', async () => {
  const { group, colliders } = await build(false);
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  assert.deepEqual(SURVEYED_FOOTPRINTS.get(D.osm), [groundOutline()]);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Schweizerhaus decal', 'Schweizerhaus gables', 'Schweizerhaus roof', 'Schweizerhaus trim', 'Schweizerhaus walls']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > D.base - 3 && p.array[i] < 12, `${m.name}: a height of ${p.array[i]}`);
    if (m.name.endsWith('walls') || m.name.endsWith('gables')) assert.ok(m.geometry.attributes.aHalf, `${m.name}: its windows' grid`);
  }
  // the posts: one each, thin, from under the ground up to the balcony, outside the house
  assert.equal(colliders.length, arcadePosts().length);
  for (const c of colliders) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'baseY', 'maxY']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.maxY > c.baseY + 3 && c.baseY === c.minY && c.obb.hx < 0.2 && c.obb.hz < 0.2);
    assert.ok(!insideHouse(c.obb.cx, c.obb.cz));
  }
});

test('the phone\'s profile: only SIMPLE_SKINS\' materials and the decal', async () => {
  const { group } = await build(true);
  for (const m of group.children) {
    const mat = m.material;
    const decal = mat.opacityNode && mat.transparent && !mat.emissiveNode && !mat.roughnessNode;
    const plainTrim = !mat.colorNode && !mat.emissiveNode && !mat.roughnessNode && !mat.normalNode;
    assert.ok(decal || plainTrim || (!mat.roughnessNode && !mat.normalNode && !mat.positionNode), `${m.name}: a simple material`);
    assert.ok(!mat.roughnessNode && !mat.metalnessNode, `${m.name}: no procedural shader`);
  }
});
