import assert from 'node:assert/strict';
import test from 'node:test';
import { PARKING_DATA } from '../js/parking-data.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

test('the car parks of Davos: surface lots and street-side parking with closed rings in the map', () => {
  assert.ok(PARKING_DATA.length > 50, `${PARKING_DATA.length} lots`);
  assert.ok(PARKING_DATA.some((l) => l.kind === 'surface') && PARKING_DATA.some((l) => l.kind === 'street'));
  const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
  for (const lot of PARKING_DATA) {
    assert.ok(lot.ring.length >= 8 && lot.ring.length % 2 === 0, lot.id);
    const xs = lot.ring.filter((_, i) => i % 2 === 0), zs = lot.ring.filter((_, i) => i % 2 === 1);
    assert.ok(Math.max(...xs) >= minX && Math.min(...xs) <= maxX && Math.max(...zs) >= minZ && Math.min(...zs) <= maxZ, `${lot.id} in the map`);
  }
});

test('the bays painted in the aerial photo: plausible sizes inside their lots, the example lot by the Talstrasse read', () => {
  const read = PARKING_DATA.filter((l) => l.bays?.length);
  assert.ok(read.length >= 3, `${read.length} lots with painted bays`);
  for (const lot of read) {
    const xs = lot.ring.filter((_, i) => i % 2 === 0), zs = lot.ring.filter((_, i) => i % 2 === 1);
    for (const [x, z, angle, w, l, occupied] of lot.bays) {
      assert.ok(Number.isFinite(angle) && w >= 2 && w <= 3.6 && l >= 3.5 && l <= 6.6, `${lot.id}: ${w} × ${l}`);
      assert.ok(x > Math.min(...xs) - 3 && x < Math.max(...xs) + 3 && z > Math.min(...zs) - 3 && z < Math.max(...zs) + 3, `${lot.id} bay inside`);
      assert.ok(occupied === 0 || occupied === 1);
    }
  }
  // Davos Dorf, east of the Talstrasse-side buildings (LV95 2783158 / 1186802): four rows of angled bays
  const example = PARKING_DATA.find((l) => l.id === 'w218787358');
  assert.ok(example?.bays?.length >= 25, `${example?.bays?.length} bays`);
});
