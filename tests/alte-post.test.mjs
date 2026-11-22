import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTE_POST, ALTE_POST_ENTRANCE, frontFrame, frontWindows } from '../js/alte-post-data.js';
import { onWall, outwardRing, pointInRing, ringArea2, wallFrame } from '../js/spital-data.js';

const part = (id) => ALTE_POST.parts.find((p) => p.id === id);

test('the Alte Post\'s blocks: outlines of some size, the front block the tallest, its floors adding up', () => {
  for (const p of ALTE_POST.parts) assert.ok(Math.abs(ringArea2(p.ring)) / 2 > 150 && p.top > ALTE_POST.base + 8, p.id);
  assert.ok(part('front').top > part('rear').top && part('rear').top > part('wings').top);
  // the ground floor and four storeys under the front block's roof
  const h = part('front').top - ALTE_POST.ground;
  assert.ok(Math.abs(h - (ALTE_POST.groundFloor + 4 * ALTE_POST.storey)) < 0.1, `${h.toFixed(2)} m`);
});

test('the front is the front block\'s wall on the Promenade, facing east', () => {
  const F = frontFrame(), ring = outwardRing(part('front').ring);
  const i = ring.findIndex((p, k) => { const q = ring[(k + 1) % ring.length]; return Math.hypot(p[0] - F.a[0], p[1] - F.a[1]) < 0.05 && Math.hypot(q[0] - ALTE_POST.front.b[0], q[1] - ALTE_POST.front.b[1]) < 0.05; });
  assert.ok(i >= 0, 'one of the block\'s walls, running the block\'s way');
  assert.ok(F.n[0] > 0.9, 'out towards the Promenade (east)');
  assert.ok(!pointInRing(part('front').ring, ...onWall(F, F.len / 2, 0.3)));
  for (const p of ALTE_POST.parts) assert.ok(!pointInRing(p.ring, ALTE_POST_ENTRANCE.x, ALTE_POST_ENTRANCE.z), 'the spot before the steps is outside');
});

test('five windows a floor on the front, three of them in the sgraffito field over the portal', () => {
  const F = frontFrame(), fd = ALTE_POST.field, P = ALTE_POST.portal, w = ALTE_POST.window;
  for (const k of [0, 1, 2, 3]) {
    const row = frontWindows(k);
    assert.equal(row.length, 5);
    assert.ok(row[0].s - w.half > 0.3 && row.at(-1).s + w.half < F.len - 0.3);
    assert.equal(row.filter((q) => q.s - w.half > fd.from && q.s + w.half < fd.to).length, 3);
    assert.ok(Math.abs(row[2].s - (P.from + P.to) / 2) < 0.1, 'the middle window over the portal\'s middle');
  }
  // the field: over the portal, its friezes' floors inside it, the firs' band on the third floor's windows
  const portalTop = P.floor + P.opening + P.entablature;
  assert.ok(fd.lo > portalTop && fd.lo - portalTop < 0.6, 'the field starts on the portal\'s slab');
  assert.ok(frontWindows(1)[0].hi < fd.hi && frontWindows(2)[0].lo > fd.hi - 0.3);
  const fr = ALTE_POST.firs, third = frontWindows(2)[0];
  assert.ok(fr.lo <= third.lo - 0.1 && fr.hi >= third.hi + 0.1 && fr.lo >= fd.hi - 0.01);
});

test('the portal: piers, pilasters and openings fill its width without a gap', () => {
  const P = ALTE_POST.portal;
  const spans = [...P.piers, ...P.pilasters, ...P.openings.map((o) => o.s)].sort((a, b) => a[0] - b[0]);
  assert.equal(spans[0][0], P.from);
  assert.equal(spans.at(-1)[1], P.to);
  for (let i = 1; i < spans.length; i++) assert.ok(Math.abs(spans[i][0] - spans[i - 1][1]) < 1e-9, `a gap or an overlap at ${spans[i][0]}`);
  assert.ok(P.to <= frontFrame().len && P.from >= 0);
});

test('every vertex of the Alte Post is finite, four meshes, the portal\'s collider before the front', async () => {
  const doc = globalThis.document;
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => grad : typeof k === 'string' ? (t[k] ??= () => {}) : undefined), set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
  try {
    const { buildAltePost, ATLAS } = await import('../js/alte-post.js');
    const { group, colliders } = buildAltePost({ add() {} });
    let meshes = 0;
    group.traverse((o) => {
      if (!o.geometry) return;
      meshes++;
      const p = o.geometry.attributes.position.array;
      assert.ok(p.length > 0 && p.length % 9 === 0);
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${o.name}: vertex ${Math.floor(i / 3)} is not finite`);
    });
    assert.equal(meshes, 4, 'walls, roofs, trim, decals');
    // the atlas' cells keep clear of each other
    const cells = Object.entries(ATLAS);
    for (const [a, [ax, ay, aw, ah]] of cells) for (const [b, [bx, by, bw, bh]] of cells) {
      if (a < b) assert.ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `${a} and ${b} overlap`);
    }
    assert.equal(colliders.length, 1);
    const c = colliders[0], F = frontFrame();
    const [mx, mz] = onWall(F, F.len / 2, 1);
    assert.ok(mx > c.minX && mx < c.maxX && mz > c.minZ && mz < c.maxZ && c.maxY > c.minY && Number.isFinite(c.baseY));
    assert.ok(Math.hypot(ALTE_POST_ENTRANCE.x - c.obb.cx, ALTE_POST_ENTRANCE.z - c.obb.cz) > c.obb.hz + 1, 'the spot before the steps is clear of it');
  } finally {
    globalThis.document = doc;
  }
});
