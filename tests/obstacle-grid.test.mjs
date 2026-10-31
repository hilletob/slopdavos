import assert from 'node:assert/strict';
import test from 'node:test';
import { createObstacleGrid } from '../js/obstacle-grid.js';

// A bus at the origin heading +x (east), its lane's corridor 1.6 m either side
const corridor = (g, out) => g.nearestAhead(0, 0, 1, 0, 60, 1.6, 0, out);

test('the obstacle grid finds the nearest car ahead in the corridor, with its gap and speed along it', () => {
  const g = createObstacleGrid();
  g.add(40, 0.5, 0, 1, 0, 2.2, 0.9, 5, 'car', 'far');
  g.add(20, -0.3, 0, 1, 0, 2.2, 0.9, 3, 'car', 'near');
  const out = {};
  assert.equal(corridor(g, out), 20 - 2.2);
  assert.equal(out.ref, 'near');
  assert.equal(out.speed, 3);
});

test('oncoming cars in the other lane, and cars beside the corridor or beyond the range, are no obstacle', () => {
  const g = createObstacleGrid();
  g.add(25, 3.4, 0, -1, 0, 2.2, 0.9, 8, 'car', 'other lane'); // the opposite lane of a one-way street driven against
  g.add(15, 2.3, 0, -1, 0, 2.2, 0.9, 6, 'car', 'oncoming, grazing the corridor'); // keeps to its lane
  g.add(30, 4.5, 0, 1, 0, 2.2, 0.9, 0, 'car', 'parked beside');
  g.add(90, 0, 0, 1, 0, 2.2, 0.9, 0, 'car', 'beyond the range');
  g.add(-10, 0, 0, 1, 0, 2.2, 0.9, 0, 'car', 'behind');
  g.add(20, 0, 9, 1, 0, 2.2, 0.9, 0, 'car', 'on a bridge above');
  assert.equal(corridor(g), Infinity);
  // ...but one standing head-on in it (in a junction, say) is in the way
  g.add(35, 0.4, 0, -1, 0, 2.2, 0.9, 0, 'car', 'head-on');
  const out = {};
  assert.equal(corridor(g, out), 35 - 2.2);
  assert.equal(out.ref, 'head-on');
  assert.equal(out.speed, 0);
});

test('crossing cars and pedestrians on a crosswalk in the corridor count; the grid empties on clear()', () => {
  const g = createObstacleGrid();
  g.add(30, 1.5, 0, 0, 1, 2.2, 0.9, 6, 'car', 'crossing'); // reaches into the corridor sideways
  g.add(12, 1.8, undefined, 0, 0, 0.3, 0.3, 0, 'ped', 'walker'); // round, its edge just inside the corridor
  const out = {};
  assert.equal(corridor(g, out), 11.7);
  assert.equal(out.kind, 'ped');
  g.clear();
  assert.equal(g.count, 0);
  assert.equal(corridor(g), Infinity);
  g.add(30, 1.5, 0, 0, 1, 2.2, 0.9, 6, 'car', 'crossing');
  assert.equal(corridor(g, out), 30 - 0.9);
  assert.equal(out.speed, 0); // moving across: no speed along the corridor
});
