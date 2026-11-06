import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVEL_CROSSINGS } from '../js/level-crossings-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { buildLine, routePoint } from '../js/rhb-route.js';
import { crossingFrame } from '../js/level-crossings.js';

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

test('the barrier line of a crossing runs along the track, also where the road crosses obliquely', () => {
  const list = LEVEL_CROSSINGS.crossings;
  // The Flüelastrasse in Davos Dorf crosses at about 42 degrees
  const flueela = list.find((c) => c.road === 'Flüelastrasse');
  assert.ok(Math.abs(flueela.dx * flueela.rdx + flueela.dz * flueela.rdz) > 0.5, 'Flüelastrasse crosses obliquely');
  for (const c of list) {
    const { at, sin, cos } = crossingFrame(c);
    assert.ok(Number.isFinite(sin) && Number.isFinite(cos) && sin > 0 && sin <= 1, `${c.id} angle`);
    const half = c.width / 2;
    for (const d of [-3.4, 3.4]) {
      // Both posts of one side (left and right of the road) lie on a line parallel to the rails
      const a = at(d, -(half + 0.7)), b = at(d, half + 0.7), L = Math.hypot(b.x - a.x, b.z - a.z);
      if (sin > 0.35 + 1e-9) assert.ok(Math.abs(((b.x - a.x) * c.rdx + (b.z - a.z) * c.rdz) / L) > 0.999, `${c.id} barrier line along the track`);
      // … at the given distance (square) from the track, and the given distance (square) from the road's centre line
      const p = at(d, half);
      const fromTrack = (p.x - c.x) * -c.rdz + (p.z - c.z) * c.rdx, fromRoad = (p.x - c.x) * -c.dz + (p.z - c.z) * c.dx;
      if (sin > 0.35 + 1e-9) assert.ok(Math.abs(Math.abs(fromTrack) - 3.4) < 0.02, `${c.id} distance from the track`);
      assert.ok(Math.abs(fromRoad - half) < 0.02, `${c.id} at the right edge of the road`);
      // … and the side d > 0 is the side the road heads to (on its centre line)
      const m = at(d, 0);
      assert.ok(((m.x - c.x) * c.dx + (m.z - c.z) * c.dz) * d > 0, `${c.id} side`);
    }
  }
});
