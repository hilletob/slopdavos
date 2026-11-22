import assert from 'node:assert/strict';
import test from 'node:test';
import { signpostObstacles, signpostSpot } from '../js/signpost-sites.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { TOUR_ROUTES } from '../js/tour-routes-data.js';
import { TLM_TREES } from '../js/tlm-trees-data.js';

test('a signpost stands beside a crossing, not on it', () => {
  // two streets of 6 m crossing at the origin: the post goes into a quadrant, a verge off both carriageways
  const o = signpostObstacles({ roads: [
    { kind: 'residential', width: 6, pts: [-50, 0, 50, 0] },
    { kind: 'residential', width: 6, pts: [0, -50, 0, 50] }
  ] });
  assert.ok(o.blocked(0, 0) && o.blocked(3.5, 20) && !o.blocked(4.1, 4.1));
  const p = signpostSpot(o, 0, 0, Math.PI / 4);
  assert.ok(!o.blocked(p.x, p.z) && Math.abs(p.x) >= 4 && Math.abs(p.z) >= 4, JSON.stringify(p));
  assert.ok(Math.hypot(p.x, p.z) < 7, 'and no further out than needed');
  // a site metres off the path: the post comes up to the path's edge (half of 1.5 m and 0.6 m of verge)
  const off = signpostSpot(signpostObstacles({ roads: [{ kind: 'path', width: 1.5, pts: [0, 0, 100, 0] }] }), 50, 5, 0);
  assert.ok(Math.abs(off.x - 50) < 1e-6 && off.z >= 1.35 && off.z < 1.7, JSON.stringify(off));
  // a clear site keeps its spot
  const q = signpostSpot(signpostObstacles({}), 10, 10, 0);
  assert.deepEqual([q.x, q.z, q.moved], [10, 11.6, 0]);
  // a path: half its width and its edge
  const path = signpostObstacles({ roads: [{ kind: 'path', width: 1.5, pts: [0, 0, 100, 0] }] });
  assert.ok(path.blocked(50, 1.2) && !path.blocked(50, 1.5));
  // a mapped tree
  assert.ok(signpostObstacles({ trees: [[5, 5, 12, 0]] }).blocked(5.5, 5.5) && !signpostObstacles({ trees: [[5, 5, 12, 0]] }).blocked(7, 5));
  // a tunnel is no obstacle, a house and the track are
  const mixed = signpostObstacles({ roads: [{ kind: 'primary', width: 8, tunnel: true, pts: [0, 0, 100, 0] }], railways: [{ pts: [0, 30, 100, 30] }], buildings: [{ ring: [10, 50, 20, 50, 20, 60, 10, 60] }] });
  assert.ok(!mixed.blocked(50, 0) && mixed.blocked(50, 32) && mixed.blocked(15, 55) && !mixed.blocked(25, 55));
});

test('every hiking signpost of Davos stands clear of the ways, within some metres of its junction', () => {
  const o = signpostObstacles({ ...DAVOS_DATA, trees: [...TLM_TREES.trees, ...(TLM_TREES.shrubs || [])] });
  for (const n of TOUR_ROUTES.nodes) {
    const p = signpostSpot(o, n.x, n.z, n.a);
    assert.ok(!o.blocked(p.x, p.z), `signpost at ${n.x}, ${n.z}`);
    assert.ok(Math.hypot(p.x - n.x, p.z - n.z) <= 11, `signpost at ${n.x}, ${n.z} within 11 m`);
  }
});
