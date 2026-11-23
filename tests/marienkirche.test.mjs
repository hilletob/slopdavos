import test from 'node:test';
import assert from 'node:assert/strict';
import { MARIENKIRCHE as K, decals, halfWidths, rectRing, rectWalls, roofHeight, toWorld, towerRect } from '../js/marienkirche-data.js';
import { onWall, pointInRing } from '../js/spital-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const PARTS = { tower: towerRect(), nave: K.nave.rect, transept: K.transept.rect, choir: K.choir.rect, sacristy: K.sacristy.rect };

test('the Marienkirche: its parts stand on the church\'s footprint, their walls facing out', () => {
  const osm = DAVOS_DATA.buildings.find((b) => b.id === K.osm);
  const ring = []; for (let i = 0; i < osm.ring.length; i += 2) ring.push([osm.ring[i], osm.ring[i + 1]]);
  assert.ok(Math.abs(Math.hypot(...K.east) - 1) < 0.002);
  for (const [name, rect] of Object.entries(PARTS)) {
    const [a0, a1, b0, b1] = rect, corners = rectRing(rect);
    assert.ok(a1 - a0 > 2 && b1 - b0 > 2, `${name} is of some size`);
    // (the sacristy stands outside OpenStreetMap's footprint: it brings its own colliders)
    assert.equal(pointInRing(ring, ...toWorld((a0 + a1) / 2, (b0 + b1) / 2)), name !== 'sacristy', `${name}'s middle and OpenStreetMap's footprint`);
    const walls = rectWalls(rect);
    assert.deepEqual(Object.keys(walls), ['north', 'west', 'south', 'east']);
    for (const F of Object.values(walls)) {
      assert.ok(!pointInRing(corners, ...onWall(F, F.len / 2, 0.3)), `a step out of ${name}'s ${F.side} wall leaves it`);
      assert.ok(pointInRing(corners, ...onWall(F, F.len / 2, -0.3)));
    }
    // a north wall looks north (smaller z), an east wall east
    assert.ok(walls.north.n[1] < -0.9 && walls.south.n[1] > 0.9 && walls.east.n[0] > 0.9 && walls.west.n[0] < -0.9);
  }
  // the surveyed buildings left out of the streamed tiles lie in the church
  for (const e of K.exclude) assert.ok(Object.values(PARTS).some((r) => pointInRing(rectRing(r), e.x, e.z)) && e.r <= 2);
});

test('the heights: the tower\'s storeys under the belfry, the roof up to the spire, the nave\'s roofs under the ovals', () => {
  const T = K.tower, HW = halfWidths();
  assert.equal(T.courses[0], K.plinth);
  for (let i = 1; i < T.courses.length; i++) assert.ok(T.courses[i] > T.courses[i - 1] + 6);
  assert.ok(T.courses.at(-1) < T.oval.y - T.oval.h / 2 - 1 && T.oval.y + T.oval.h / 2 < T.masonry - 0.8);
  assert.ok(T.roof[0].half > T.half + 1 && T.roof[0].y < T.walls, 'the eaves stand out and the walls reach into the roof');
  for (let i = 1; i < T.roof.length; i++) assert.ok(T.roof[i].y > T.roof[i - 1].y && T.roof[i].half < T.roof[i - 1].half);
  assert.ok(T.spire.from < T.roof.at(-1).y && T.spire.radius >= T.roof.at(-1).half && T.spire.tip > T.spire.from + 10);
  assert.ok(T.ball.y - T.ball.r <= T.spire.tip + 0.1 && T.cross.arm > T.ball.y + T.ball.r && T.cross.top > T.cross.arm);
  // the roofs: the eaves at the overhang's edge, the ridge over the middle; the walls end under them
  for (const [part, hw] of [[K.nave, HW.nave], [K.transept, HW.transept], [K.choir, HW.choir]]) {
    assert.equal(roofHeight(part, hw, 0), part.ridge);
    assert.ok(Math.abs(roofHeight(part, hw, hw + part.over) - part.eaves) < 1e-9);
    const wallTop = roofHeight(part, hw, hw);
    assert.ok(wallTop > part.eaves && wallTop < part.eaves + 1.6);
  }
  assert.ok(K.nave.ridge < T.oval.y - T.oval.h / 2, 'the ovals look over the nave\'s ridge');
  assert.ok(K.choir.ridge < K.nave.ridge && K.transept.ridge <= K.nave.ridge && K.sacristy.top < K.nave.eaves - 5);
});

test('the decals lie inside their walls, clear of the quoins and of one another', () => {
  const frames = Object.fromEntries(Object.entries(PARTS).map(([k, r]) => [k, rectWalls(r)]));
  const HW = halfWidths(), list = decals();
  const tops = { tower: K.tower.walls, nave: roofHeight(K.nave, HW.nave, HW.nave), transept: roofHeight(K.transept, HW.transept, HW.transept), sacristy: K.sacristy.top };
  assert.ok(list.length > 30);
  for (const d of list) {
    const F = frames[d.part][d.side], what = `${d.key} on the ${d.part}'s ${d.side} wall`;
    assert.ok(d.s0 >= 0 && d.s1 <= F.len && d.s1 > d.s0 && d.y1 > d.y0, `${what} lies on the wall`);
    // (a gable's round window sits over the walls' top)
    if (d.key !== 'oculus') assert.ok(d.y1 <= tops[d.part] + 1e-9, `${what} ends under the wall's top`);
    else assert.ok(d.y1 < K.transept.ridge - 2);
    if (d.key !== 'belfry') assert.ok(d.s0 >= 0.9 && d.s1 <= F.len - 0.9, `${what} is clear of the quoins`);
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i], q = list[j];
      if (p.part !== q.part || p.side !== q.side) continue;
      const apart = p.s1 <= q.s0 || q.s1 <= p.s0 || p.y1 <= q.y0 || q.y1 <= p.y0;
      assert.ok(apart, `${p.key} and ${q.key} overlap on the ${p.part}'s ${p.side} wall`);
    }
  }
  // the transept's and the nave's windows stand on walls the other parts leave free
  const [na0, na1, , ] = K.nave.rect, [ta0, ta1, tb0, tb1] = K.transept.rect;
  for (const d of list.filter((d) => d.part === 'transept' && (d.side === 'north' || d.side === 'south'))) {
    const F = frames.transept[d.side];
    for (const s of [d.s0, d.s1]) {
      const [x, z] = onWall(F, s, 0), inNave = pointInRing(rectRing(K.nave.rect), x, z);
      assert.ok(!inNave, `a window in the transept's ${d.side} wall lies inside the nave`);
    }
  }
  for (const d of list.filter((d) => d.part === 'nave' && (d.side === 'west' || d.side === 'east'))) {
    const F = frames.nave[d.side];
    for (const s of [d.s0, d.s1]) {
      const [x, z] = onWall(F, s, 0);
      assert.ok(!pointInRing(rectRing(K.transept.rect), x, z), `a window in the nave's ${d.side} wall lies inside the transept`);
      assert.ok(!pointInRing(rectRing(towerRect()), x, z));
    }
  }
  assert.ok(na0 > ta0 && na1 < ta1 && tb0 < tb1);
});

test('the atlas\' cells do not overlap; every vertex is finite; the roofs face up', async () => {
  const doc = globalThis.document;
  const ctx = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? (t[k] ??= () => {}) : undefined), set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
  try {
    const { buildMarienkirche, ATLAS } = await import('../js/marienkirche.js');
    const cells = Object.entries(ATLAS);
    for (const [k, [x, y, w, h]] of cells) {
      assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512, `${k} lies in the atlas`);
      for (const [k2, [x2, y2, w2, h2]] of cells) {
        if (k2 !== k) assert.ok(x + w <= x2 || x2 + w2 <= x || y + h <= y2 || y2 + h2 <= y, `${k} and ${k2} overlap`);
      }
    }
    for (const d of decals()) assert.ok(ATLAS[d.key], `${d.key} is in the atlas`);
    const { group, colliders } = buildMarienkirche({ add() {} });
    assert.equal(colliders.length, 3, 'the sacristy\'s three free walls');
    for (const c of colliders) {
      for (const v of [c.minX, c.maxX, c.minZ, c.maxZ, c.baseY, c.minY, c.maxY, c.obb.cx, c.obb.cz, c.obb.hx, c.obb.hz]) assert.ok(Number.isFinite(v));
      assert.ok(c.maxY === K.sacristy.top && c.minY < 28 && Math.abs(Math.hypot(c.obb.cs, c.obb.sn) - 1) < 1e-9);
      assert.ok(!pointInRing(rectRing(K.nave.rect), c.obb.cx, c.obb.cz));
    }
    assert.equal(group.userData.terrain, 'absolute');
    let meshes = 0, tris = 0;
    group.traverse((o) => {
      if (!o.geometry) return;
      meshes++;
      const p = o.geometry.attributes.position.array, n = o.geometry.attributes.normal.array;
      tris += p.length / 9;
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]) && Number.isFinite(n[i]), `${o.name}: vertex ${Math.floor(i / 3)} is not finite`);
      if (o.name.endsWith('roof')) for (let i = 1; i < n.length; i += 3) assert.ok(n[i] > 0.3, `${o.name}: a face looks down or sideways`);
      if (o.name.endsWith('trim')) assert.equal(o.geometry.attributes.color.count, o.geometry.attributes.position.count);
    });
    assert.equal(meshes, 3, 'masonry and timber, roofs, decals');
    assert.ok(tris < 4000, `${tris} triangles`);
  } finally {
    globalThis.document = doc;
  }
});
