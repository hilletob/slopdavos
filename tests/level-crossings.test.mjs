import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVEL_CROSSINGS } from '../js/level-crossings-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { buildLine, routePoint } from '../js/rhb-route.js';

test('the level crossings lie on the RhB line, with a road direction across it', () => {
  const list = LEVEL_CROSSINGS.crossings;
  assert.ok(list.length >= 10, `${list.length} crossings`);
  const line = buildLine(DAVOS_DATA.railways, DAVOS_DATA.stations, DAVOS_DATA.meta.bounds);
  for (const c of list) {
    const p = routePoint(line.south, c.south, {});
    assert.ok(Math.hypot(p.x - c.x, p.z - c.z) < 1, `${c.id} on the southbound route`);
    assert.ok(c.north >= 0 && c.north <= line.north.len + 1, `${c.id} on the northbound route`);
    assert.ok(Math.abs(Math.hypot(c.dx, c.dz) - 1) < 0.01, `${c.id} road direction`);
    // Roads cross the track, they don't run along it
    assert.ok(Math.abs(c.dx * c.rdx + c.dz * c.rdz) < 0.9, `${c.id} crosses the track`);
  }
  // The main road crossings of Davos Dorf are protected
  const named = Object.fromEntries(list.map((c) => [c.road, c]));
  for (const road of ['Flüelastrasse', 'Dischmastrasse', 'Sandstrasse']) {
    assert.ok(named[road], road);
    assert.notEqual(named[road].barrier, 'no', `${road} has barriers`);
  }
});
