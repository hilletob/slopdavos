import assert from 'node:assert/strict';
import test from 'node:test';
import { CROSSWALKS } from '../js/crosswalks-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

test('the marked crossings of Davos lie on drivable roads, with the road direction and width', () => {
  assert.ok(CROSSWALKS.length >= 50, `${CROSSWALKS.length} crossings`);
  for (const c of CROSSWALKS) {
    assert.ok(Math.abs(Math.hypot(c.ux, c.uz) - 1) < 0.01);
    assert.ok(c.w >= 3 && c.w <= 20, `width ${c.w}`);
  }
  // no two on top of each other
  for (let i = 0; i < CROSSWALKS.length; i++) for (let j = i + 1; j < CROSSWALKS.length; j++) {
    assert.ok(Math.hypot(CROSSWALKS[i].x - CROSSWALKS[j].x, CROSSWALKS[i].z - CROSSWALKS[j].z) > 1);
  }
  // the one on the Promenade by the Parsennbahn's valley station (OSM n321757361), on the Promenade
  const p = CROSSWALKS.find((c) => c.osm === 321757361);
  const prom = DAVOS_DATA.roads.find((r) => r.name === 'Promenade' && r.pts.some((v, i) => i % 2 === 0 && Math.hypot(v - p.x, r.pts[i + 1] - p.z) < 1));
  assert.ok(prom, 'on the Promenade');
});
