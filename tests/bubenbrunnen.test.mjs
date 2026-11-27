import test from 'node:test';
import assert from 'node:assert/strict';
import { BUBENBRUNNEN, basinBox, hexagon, octagon, polygon } from '../js/bubenbrunnen-data.js';
import { wallFrame, onWall, pointInRing } from '../js/spital-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { CROSSWALKS } from '../js/crosswalks-data.js';

const S = BUBENBRUNNEN;
const flat = (ring) => ring.flat();
// (the distance from a point to a polyline [x, z, …])
const lineDistance = (pts, x, z) => {
  let d = Infinity;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], dx = pts[i] - ax, dz = pts[i + 1] - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    d = Math.min(d, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return d;
};

test('the plan: regular rings, faces looking out, the parts inside one another', () => {
  for (const [ring, n] of [[octagon(1), 8], [hexagon(1), 6], [polygon(5, 1), 5]]) {
    assert.equal(ring.length, n);
    for (let i = 0; i < n; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % n]);
      const [x, z] = onWall(F, F.len / 2, 0.05);
      assert.ok(!pointInRing(flat(ring), x, z), 'a step out of a face leaves the ring');
    }
  }
  // an octagon's apothem as asked, its faces square to the axes
  const o = octagon(S.basin.apothem), xs = o.map((p) => p[0]);
  assert.ok(Math.abs(Math.max(...xs) - S.centre[0] - S.basin.apothem) < 1e-9);
  // the steps wider than the basin, the basin wider than the block's posts, the block over the basin, the cap over it
  assert.ok(S.steps[0].apothem > S.steps[1].apothem && S.steps[1].apothem > S.basin.apothem + S.basin.rim);
  assert.ok(S.posts.radius < S.basin.apothem && S.posts.radius > S.basin.apothem - S.basin.wall - 0.05, 'the posts stand on the rim');
  assert.ok(S.block.radius + 0.06 < S.steps[1].apothem && S.cap.eaves > S.block.radius);
  assert.ok(S.basin.water < S.basin.top && S.basin.top <= S.posts.top && S.posts.top === S.block.bottom && S.block.top < S.cap.y0 && S.cap.y0 < S.cap.apex);
  assert.ok(S.cap.knob > 2.9 && S.cap.knob < 3.5, 'about 3.1 m over the ground (the photographs)');
});

test('it stands on the island between the Dorfstrasse\'s two arms, clear of their carriageways and the crossings', () => {
  const arms = DAVOS_DATA.roads.filter((r) => r.name === 'Dorfstrasse' || r.name === 'Bahnhofstrasse');
  const step = octagon(S.steps[0].apothem);
  for (const r of arms) {
    for (const [x, z] of [S.centre, ...step]) {
      const d = lineDistance(r.pts, x, z);
      assert.ok(d > r.width / 2 + 0.3, `${r.id} ${r.name}: ${d.toFixed(2)} m from its centreline`);
    }
  }
  // the crossings over the island's tip pass north of it
  for (const c of CROSSWALKS.filter((c) => Math.hypot(c.x - S.centre[0], c.z - S.centre[1]) < 8)) assert.ok(c.z < S.centre[1] - S.steps[0].apothem - 0.5);
  // before the church's west front (St. Theodul's outline: x 732.5 and more), south-west of it
  const church = DAVOS_DATA.buildings.find((b) => b.id === 'w111016808');
  assert.ok(!pointInRing(church.ring, ...S.centre) && S.centre[0] < 732);
});

test('the collider: the basin, inside the step', () => {
  const [x0, z0, x1, z1] = basinBox();
  assert.ok(x1 - x0 > 1.5 && x1 - x0 < 2 * S.basin.apothem);
  assert.ok(Math.abs((x0 + x1) / 2 - S.centre[0]) < 1e-9 && Math.abs((z0 + z1) / 2 - S.centre[1]) < 1e-9);
});

for (const simple of [false, true]) {
  test(`the fountain in Node${simple ? ' (the mobile profile)' : ''}: every vertex finite, five meshes, one collider`, async () => {
    const noop = () => {};
    const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
    let pixels = 0;
    globalThis.document = { createElement: () => { const c = { width: 0, height: 0, getContext: () => { pixels += c.width * c.height; return ctx; }, style: {} }; return c; } };
    const THREE = await import('three/webgpu');
    const { QUALITY } = await import('../js/quality.js');
    const { buildBubenbrunnen, groundUnder } = await import('../js/bubenbrunnen.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    try {
      const scene = new THREE.Scene();
      const { group, colliders } = buildBubenbrunnen(scene);
      assert.equal(group.userData.terrain, 'absolute');
      assert.deepEqual(group.children.map((m) => m.name).sort(), ['Bubenbrunnen cap', 'Bubenbrunnen decal', 'Bubenbrunnen stone', 'Bubenbrunnen top', 'Bubenbrunnen water']);
      const { hi, lo } = groundUnder();
      assert.ok(Number.isFinite(hi) && hi - lo < 0.6, `the ground under it: ${lo} to ${hi}`);
      for (const m of group.children) {
        const p = m.geometry.attributes.position;
        assert.ok(p.count > 0 && p.count % 3 === 0);
        for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
        for (let i = 0; i < p.array.length; i += 3) {
          assert.ok(Math.hypot(p.array[i] - S.centre[0], p.array[i + 2] - S.centre[1]) < 1.7, `${m.name}: within the steps`);
          assert.ok(p.array[i + 1] >= lo - 0.26 && p.array[i + 1] <= hi + S.cap.knob + 1e-6, `${m.name}: a height of ${p.array[i + 1]}`);
        }
      }
      // the water and the tops face up (snow lies on them in winter)
      for (const name of ['Bubenbrunnen water', 'Bubenbrunnen top']) {
        const n = group.children.find((m) => m.name === name).geometry.attributes.normal.array;
        for (let i = 1; i < n.length; i += 3) assert.ok(n[i] > 0.99, `${name}: a face not up`);
      }
      // the cap's faces out and up
      const cap = group.children.find((m) => m.name === 'Bubenbrunnen cap').geometry.attributes, cp = cap.position.array, cn = cap.normal.array;
      for (let i = 0; i < cp.length; i += 3) {
        const ox = cp[i] - S.centre[0], oz = cp[i + 2] - S.centre[1];
        if (Math.hypot(ox, oz) > 0.3) assert.ok(cn[i + 1] > 0.3 && cn[i] * ox + cn[i + 2] * oz > 0, 'a facet of the cap facing out');
      }
      assert.equal(colliders.length, 1);
      const c = colliders[0];
      assert.ok([c.minX, c.maxX, c.minZ, c.maxZ, c.baseY, c.minY, c.maxY].every(Number.isFinite) && c.maxY > c.baseY + 0.9 && c.maxY < c.baseY + 2);
      assert.ok(pixels <= 768 * 256, 'one small atlas');
      // on the phone only SIMPLE_SKINS' materials and the decal
      if (simple) for (const m of group.children) assert.ok(!m.material.roughnessNode && !m.material.normalNode && (m.name.endsWith('decal') || !m.material.colorNode || m.material.colorNode && m.material.color), `${m.name}: a full shader on the phone`);
    } finally {
      QUALITY.simpleMaterials = was;
    }
  });
}
