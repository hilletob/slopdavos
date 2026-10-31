import assert from 'node:assert/strict';
import test from 'node:test';
import { TLM_TREES } from '../js/tlm-trees-data.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const inFrame = ([x, z]) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;

test('the national map\'s single trees, shrubs and woods are in the frame', () => {
  assert.ok(TLM_TREES.trees.length > 10000, `${TLM_TREES.trees.length} single trees`);
  assert.ok(TLM_TREES.trees.every(inFrame));
  assert.ok(TLM_TREES.shrubs.every(inFrame));
  // Most single trees carry a surveyed height and leaf type from the habitat map
  const measured = TLM_TREES.trees.filter((t) => t[2] > 0).length;
  assert.ok(measured / TLM_TREES.trees.length > 0.5, `${measured} with heights`);
  assert.ok(TLM_TREES.trees.every((t) => t[2] >= 0 && t[2] < 60 && [-1, 0, 1].includes(t[3])));
  // Woods of every kind, each an outer ring (and maybe clearings) of at least 4 points
  for (const kind of ['forest', 'open', 'woody', 'scrub']) assert.ok(TLM_TREES.areas.some((a) => a.kind === kind), kind);
  assert.ok(TLM_TREES.areas.every((a) => a.rings.length >= 1 && a.rings.every((r) => r.length >= 8 && r.length % 2 === 0)));
});

test('the single trees around Davos Dorf match the map (Dischmastrasse / Landwasser)', () => {
  // The user's map excerpt: dozens of trees between the Talstrasse and the Landwasser
  const near = TLM_TREES.trees.filter(([x, z]) => x > 600 && x < 1100 && z > -1400 && z < -900);
  assert.ok(near.length > 50, `${near.length} trees in the excerpt`);
});
