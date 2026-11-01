import assert from 'node:assert/strict';
import test from 'node:test';
import { WORLD_CELL, cellKey, cellDistance, cellsAround, cellsToDrop } from '../js/world-cells.js';
import { rectRegion, REGION_ALL } from '../js/quality.js';

test('the streamed world: the cells within reach of the player, nearest first', () => {
  const cells = cellsAround(250, 250, 10);
  assert.deepEqual(cells.map((c) => cellKey(c.i, c.j)), ['0/0'], 'a player in the middle of a cell with little reach: that cell');
  const near = cellsAround(-471, -285, 1300);
  assert.ok(near.length >= 28 && near.length <= 40, `~ pi r^2 / cell^2 cells plus the edge ones: ${near.length}`);
  assert.equal(near[0].d, 0, 'the player\'s own cell first');
  for (let k = 1; k < near.length; k++) assert.ok(near[k].d >= near[k - 1].d, 'sorted by distance');
  assert.ok(near.every((c) => c.d <= 1300));
  assert.ok(near.some((c) => c.i === Math.floor(-471 / WORLD_CELL) && c.j === Math.floor(-285 / WORLD_CELL)));
  // a cell's distance is to its square, not its centre
  assert.equal(cellDistance(0, 0, 250, 250), 0);
  assert.equal(cellDistance(0, 0, 600, 250), 100);
  assert.equal(Math.round(cellDistance(0, 0, -300, -400)), 500);
});

test('the streamed world: cells are dropped with hysteresis, never torn down at the edge of reach', () => {
  const live = cellsAround(0, 0, 1300).map((c) => cellKey(c.i, c.j));
  assert.deepEqual(cellsToDrop(live, 0, 0, 1300, 250), [], 'nothing to drop where they were chosen');
  assert.deepEqual(cellsToDrop(live, 200, 0, 1300, 250), [], 'a short walk drops nothing');
  const dropped = cellsToDrop(live, 2000, 0, 1300, 250);
  assert.ok(dropped.length > 0 && dropped.length < live.length, 'after 2 km the far cells go, the near ones stay');
  for (const key of dropped) {
    const [i, j] = key.split('/').map(Number);
    assert.ok(cellDistance(i, j, 2000, 0) > 1550);
  }
  const wanted = new Set(cellsAround(2000, 0, 1300).map((c) => cellKey(c.i, c.j)));
  for (const key of live) if (!dropped.includes(key)) {
    const [i, j] = key.split('/').map(Number);
    const d = cellDistance(i, j, 2000, 0);
    assert.ok(wanted.has(key) || (d > 1300 && d <= 1550), `${key}: kept only while within reach + hysteresis`);
  }
});

test('regions: a cell owns its half-open square, sees a little beyond it, and everything is in REGION_ALL', () => {
  const r = rectRegion(0, 500, 0, 500);
  assert.ok(r.owns(0, 0) && r.owns(499.9, 499.9));
  assert.ok(!r.owns(500, 100) && !r.owns(-0.1, 100), 'the far edges belong to the neighbours: no piece is built twice');
  assert.ok(r.ownsSegment(-100, 250, 300, 250), 'a segment belongs to the cell its middle lies in');
  assert.ok(!r.ownsSegment(400, 250, 700, 250));
  assert.ok(r.point(520, 250, 30) && !r.point(540, 250, 30));
  assert.ok(r.box(600, 700, 100, 200, 100) && !r.box(601, 700, 100, 200, 100));
  assert.ok(r.segment(-100, 250, 1000, 250), 'a segment crossing the square');
  assert.ok(r.segment(-100, 600, 600, 600, 100) && !r.segment(-100, 601, 600, 601, 100), 'within the pad');
  assert.ok(!r.segment(-100, -100, -50, 700), 'passing beside it');
  assert.ok(r.segment(-100, -100, 700, 700), 'the diagonal');
  assert.ok(REGION_ALL.all && REGION_ALL.owns(1e6, -1e6) && REGION_ALL.ownsSegment(0, 0, 1, 1) && REGION_ALL.segment(0, 0, 1, 1));
});
