import assert from 'node:assert/strict';
import test from 'node:test';
import { createBenches, isBenched, benchHalf } from '../js/path-bench.js';
import { gridHeight } from '../js/terrain-grid.js';

// A hillside falling to the east at 50 %, with a hollow in it (so that the profile is not one even grade)
const cols = 40, rows = 40, cell = 8;
const heights = new Float32Array(cols * rows);
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) heights[j * cols + i] = 200 - i * cell * 0.5 - 6 * Math.exp(-((i - 20) ** 2 + (j - 20) ** 2) / 30);
const grid = { cols, rows, cell, minX: 0, minZ: 0, maxX: (cols - 1) * cell, maxZ: (rows - 1) * cell, heights };
const way = (kind, pts, more = {}) => ({ id: kind, kind, pts, width: 1.2, bridge: false, tunnel: false, ...more });
const path = way('path', [100, 40, 104, 120, 96, 200, 120, 260]); // along the slope, across its fall
const spur = way('track', [140, 118, 104, 120], { width: 2.6 }); // down the slope, ending on the path
const roads = [path, spur, way('residential', [10, 10, 300, 10], { width: 6 }), way('footway', [10, 20, 300, 20], { bridge: true }), way('footway', [10, 30, 300, 30], { sidewalkWay: 1 })];

test('the ways on foot and the tracks are benched, off the bridges and the sidewalks', () => {
  assert.deepEqual(roads.map(isBenched), [true, true, false, false, false]);
  assert.equal(benchHalf(path), 0.6);
  assert.equal(createBenches(roads, grid).count, 2);
});

test('a bench lies level across, on the highest ground under it', () => {
  const B = createBenches(roads, grid), P = B.profile(path);
  assert.ok(P.n >= 4);
  for (let m = 0; m < P.n; m++) {
    const left = gridHeight(grid, P.x[m] + P.nx[m] * P.half, P.z[m] + P.nz[m] * P.half);
    const right = gridHeight(grid, P.x[m] - P.nx[m] * P.half, P.z[m] - P.nz[m] * P.half);
    // (the uphill edge on the slope — or a little in it at a mitered bend — and the downhill one on its fill)
    assert.ok(P.h[m] >= Math.max(left, right) - 0.12, `sample ${m}: ${P.h[m]} under ${Math.max(left, right)}`);
    assert.ok(P.h[m] - Math.min(left, right) > 0.3, `sample ${m} has no fill on a 50 % slope`);
    assert.ok(P.h[m] - Math.min(left, right) <= 0.3 + 0.32 * 1.2 + 0.25, 'and no wall');
  }
  // Between the kept samples the ground along the centre line never comes through by more than the tolerance
  for (let m = 1; m < P.n; m++) for (let f = 0.1; f < 1; f += 0.2) {
    const x = P.x[m - 1] + (P.x[m] - P.x[m - 1]) * f, z = P.z[m - 1] + (P.z[m] - P.z[m - 1]) * f;
    assert.ok(gridHeight(grid, x, z) <= P.h[m - 1] + (P.h[m] - P.h[m - 1]) * f + 0.045);
    assert.ok(P.s[m] - P.s[m - 1] <= 8.01);
  }
});

test('heightAt gives the bench under a point, across its whole width, and nothing beside it', () => {
  const B = createBenches(roads, grid);
  const centre = B.heightAt(102, 80);
  assert.ok(Number.isFinite(centre));
  assert.ok(Math.abs(B.heightAt(102.5, 80) - centre) < 0.05, 'level across');
  assert.ok(Math.abs(B.heightAt(101.5, 80) - centre) < 0.05, 'level across');
  assert.ok(centre >= gridHeight(grid, 102, 80));
  assert.ok(Number.isNaN(B.heightAt(104, 80)), 'beside the bench');
  assert.ok(Number.isFinite(B.heightAt(103.5, 80, 1.5)), 'within the pad asked for');
  assert.ok(Number.isNaN(B.heightAt(250, 300)));
  assert.equal(B.profile(roads[2]), null);
});

test('a way ending on another takes its bench height there', () => {
  const B = createBenches(roads, grid), P = B.profile(spur), end = P.n - 1;
  const onPath = B.heightAt(P.x[end], P.z[end]);
  assert.ok(P.h[end] >= onPath - 0.02, `${P.h[end]} under the path's ${onPath}`);
});
