import test from 'node:test';
import assert from 'node:assert/strict';
import { POST_COOP, canopyInner, inCoopGlass, partTop, postRoofY, shopfrontFrame } from '../js/post-coop-data.js';
import { onWall, outwardRing, pointInRing, ringArea2, wallFrame } from '../js/spital-data.js';
import { POST_OFFICE, POST_BOXES, POST_ROUTE } from '../js/missions-data-post.js';

const part = (id) => POST_COOP.parts.find((p) => p.id === id);

test('the post and Coop block: outlines of some size, roofs over the square, the floors adding up', () => {
  for (const p of POST_COOP.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 20, `${p.id}: an outline of some size`);
    for (const [x, z] of p.ring) assert.ok(partTop(p, x, z) > POST_COOP.square + 6, `${p.id}: its roof well over the square`);
  }
  // the shops' floors from the forecourt make the square
  const { forecourt, square, shop } = POST_COOP;
  assert.ok(Math.abs(forecourt + 3 * shop.storey - square) < 0.01, 'three shop floors under the square');
  // two floors of the post office over the square under its flat roof, under the band's lettering
  assert.ok(part('post-rear').top - square >= 2 * POST_COOP.upper.storey);
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of POST_COOP.parts) {
    const ring = outwardRing(p.ring);
    let out = 0, walls = 0;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 2) continue;
      walls++;
      if (!pointInRing(p.ring, ...onWall(F, F.len / 2, 0.2))) out++;
    }
    assert.equal(out, walls, `${p.id}: ${out} of ${walls} walls face out`);
  }
});

test('the post office\'s roof: low on the square, rising in a curve to the flat at the back, as surveyed', () => {
  // (the survey's points on the curve: x, z, y)
  for (const [x, z, y] of [[-663.0, 413.6, 2.2], [-664.6, 416.2, 3.1], [-666.3, 418.9, 4.8], [-668.4, 422.1, 6.2], [-673.6, 431.4, 7.5]]) {
    assert.ok(Math.abs(postRoofY(x, z) - y) < 0.45, `${y} at ${x}, ${z}: ${postRoofY(x, z).toFixed(2)}`);
  }
  let last = -Infinity;
  for (let d = 0; d <= 25; d += 0.5) {
    const F = wallFrame(...POST_COOP.postRoof.front), [x, z] = onWall(F, 10, -d), y = postRoofY(x, z);
    assert.ok(y >= last - 1e-9, 'never falling towards the back');
    last = y;
  }
});

test('the fronts in the photographs face their streets: the post office and the shopfront the forecourt, the Coop the Bahnhofstrasse', () => {
  const east = wallFrame(POST_COOP.postEast.a, POST_COOP.postEast.joint);
  assert.ok(east.n[0] > 0.8, 'the post office\'s front faces east');
  const S = shopfrontFrame();
  assert.ok(S.n[0] > 0.8, 'the shopfront faces east');
  const W = wallFrame(POST_COOP.coopWest.a, POST_COOP.coopWest.b);
  assert.ok(W.n[0] < -0.9, 'the Coop\'s west wall faces west');
  // the decals within their walls
  for (const [s, d] of POST_COOP.coopWest.portholes) assert.ok(s - d / 2 > 0 && s + d / 2 < W.len);
  assert.ok(POST_COOP.coopWest.sign[1] < W.len && POST_COOP.postEast.shopping[1] < east.len);
  const [ws, , wd] = POST_COOP.postEast.window;
  assert.ok(ws + wd / 2 < east.len && POST_COOP.postEast.window[1] + wd / 2 < part('post-rear').top, 'the round window under the roof');
  // the west wall is one of the Coop's, and so is the post office's front
  assert.ok(part('coop-hall').ring.some((p) => Math.hypot(p[0] - POST_COOP.coopWest.b[0], p[1] - POST_COOP.coopWest.b[1]) < 0.05));
  for (const [p, q] of [['post-rear', 'a'], ['post-rear', 'joint'], ['post-front', 'joint'], ['post-front', 'b']]) {
    assert.ok(part(p).ring.some((r) => Math.hypot(r[0] - POST_COOP.postEast[q][0], r[1] - POST_COOP.postEast[q][1]) < 0.05), `${p} has the front's ${q}`);
  }
});

test('the tower stands before the shopfront, the van\'s yard and the post box stay clear of the new walls', () => {
  const T = POST_COOP.tower, S = shopfrontFrame();
  const out = (T.x - S.a[0]) * S.n[0] + (T.z - S.a[1]) * S.n[1];
  assert.ok(out > 0 && out < T.drum, 'the tower touches the shopfront from the forecourt');
  // the post mission's yard, its route's end and its box: in front of the shopfront and off the tower
  const clear = (x, z) => {
    const o = (x - S.a[0]) * S.n[0] + (z - S.a[1]) * S.n[1];
    return o > 1 && Math.hypot(x - T.x, z - T.z) > T.drum + 0.5;
  };
  assert.ok(clear(POST_OFFICE.x, POST_OFFICE.z));
  // the car park's way out beside the tower (not behind it), where the service road meets the front, clear of the
  // shops' entrance
  const { garage, entrance } = POST_COOP.shopfront, ts = (T.x - S.a[0]) * S.u[0] + (T.z - S.a[1]) * S.u[1];
  assert.ok(garage[1] < ts - T.drum + 1 && garage[0] > 0 && garage[1] < entrance[0]);
  const end = [-658, 406], es = (end[0] - S.a[0]) * S.u[0] + (end[1] - S.a[1]) * S.u[1];
  assert.ok(es > garage[0] && es < garage[1], `the service road ends at the way out (${es.toFixed(1)} m along)`);
  assert.ok(clear(POST_ROUTE.at(-2), POST_ROUTE.at(-1)));
  const box = POST_BOXES.find((b) => b.where === 'Post Davos Platz');
  assert.ok(clear(box.x, box.z) && !POST_COOP.parts.some((p) => pointInRing(p.ring, box.x, box.z)));
});

test('the Coop\'s corner tower: glazed towards the north-west, panels towards the street, the canopy round it', () => {
  assert.ok(inCoopGlass(-0.5, -0.87) && inCoopGlass(0, -1) && !inCoopGlass(-1, 0.3) && !inCoopGlass(1, 0));
  const T = POST_COOP.coopTower, inner = canopyInner();
  assert.equal(inner.length, T.canopy.edge.length);
  inner.forEach(([x, z], i) => {
    const [ox, oz] = T.canopy.edge[i], depth = Math.hypot(ox - x, oz - z);
    assert.ok(depth > 0.5 && depth < 6, `the canopy ${depth.toFixed(1)} m deep at ${i}`);
    assert.ok(Math.hypot(x - T.x, z - T.z) <= Math.hypot(ox - T.x, oz - T.z), 'its inner edge nearer the tower');
  });
});

test('every vertex of the post and Coop block is finite, the meshes are few, the colliders have their heights', async () => {
  const doc = globalThis.document;
  // (no canvas in Node: the atlas is drawn into a stand-in)
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : typeof k === 'string' ? (t[k] ??= () => {}) : undefined), set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
  try {
    const { buildPostCoop } = await import('../js/post-coop.js');
    const { group, colliders } = buildPostCoop({ add() {} });
    const names = [];
    group.traverse((o) => {
      if (!o.geometry) return;
      names.push(o.name);
      const p = o.geometry.attributes.position.array;
      assert.ok(p.length > 0 && p.length % 9 === 0, `${o.name}: whole triangles`);
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${o.name}: vertex ${Math.floor(i / 3)} is not finite`);
    });
    assert.equal(names.length, 7, `panels, plaster, concrete, glass, roofs, trim, decals: ${names.join(', ')}`);
    assert.equal(colliders.length, 2);
    for (const c of colliders) {
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'minY', 'maxY', 'baseY']) assert.ok(Number.isFinite(c[k]));
      assert.ok(c.maxY > c.minY && c.maxX > c.minX && c.maxZ > c.minZ);
    }
  } finally {
    globalThis.document = doc;
  }
});

test('the forecourt runs level up to the shopfront: the nodes before it and under the slab lowered, the square behind kept', async () => {
  const { lowerForecourt } = await import('../js/post-coop-data.js');
  // a grid of 8 m like the terrain's, the square's step ramped over the cell before the front
  const S = shopfrontFrame(), cell = 8, minX = -720, minZ = 340, cols = 15, rows = 15, heights = new Float32Array(cols * rows);
  const out = (i, j) => (minX + i * cell - S.a[0]) * S.n[0] + (minZ + j * cell - S.a[1]) * S.n[1];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) heights[j * cols + i] = out(i, j) > 4 ? POST_COOP.forecourt : POST_COOP.square;
  const T = { cols, rows, cell, minX, minZ, heights };
  assert.ok(lowerForecourt(T) > 2);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const o = out(i, j), s = (minX + i * cell - S.a[0]) * S.u[0] + (minZ + j * cell - S.a[1]) * S.u[1];
    if (o > -6 && o < 9 && s > 0 && s < S.len) assert.ok(heights[j * cols + i] < POST_COOP.forecourt + 0.2, `the node ${o.toFixed(1)} m before the front`);
    if (o < -7) assert.ok(Math.abs(heights[j * cols + i] - POST_COOP.square) < 1e-5, 'the square behind the slab kept');
  }
  assert.ok(POST_COOP.shopfront.depth > 6.5 + 4, 'the lowered nodes lie well under the slab');
  // the Silvrettaplatz is a way of the data, left without a level bench
  const { DAVOS_DATA } = await import('../js/davos-geodata.js');
  const { isBenched } = await import('../js/path-bench.js');
  const way = DAVOS_DATA.roads.find((r) => r.id === POST_COOP.squareWay);
  assert.ok(way && /^(pedestrian|footway)$/.test(way.kind));
  assert.equal(isBenched({ ...way, noBench: true }), false);
});
