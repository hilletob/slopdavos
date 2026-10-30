import assert from 'node:assert/strict';
import test from 'node:test';
import { VBD_DATA } from '../js/vbd-data.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

test('the VBD lines run their mapped routes through Davos, with named stops in order', () => {
  const refs = new Set(VBD_DATA.variants.map((v) => v.ref));
  for (const ref of ['301', '303', '304', '308', '312', '313']) assert.ok(refs.has(ref), `line ${ref}`);
  const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
  for (const v of VBD_DATA.variants) {
    assert.match(v.colour, /^#[0-9A-F]{6}$/, `${v.ref} colour`);
    assert.ok(v.to && v.from, `${v.ref} from / to`);
    for (let i = 0; i < v.pts.length; i += 2) {
      assert.ok(v.pts[i] >= minX - 6 && v.pts[i] <= maxX + 6 && v.pts[i + 1] >= minZ - 6 && v.pts[i + 1] <= maxZ + 6, `${v.ref} inside the map`);
    }
    assert.ok(v.stops.length >= 2, `${v.ref} ${v.to}: stops`);
    for (let k = 1; k < v.stops.length; k++) assert.ok(v.stops[k].s > v.stops[k - 1].s, `${v.ref}: stops in driving order`);
    assert.ok(v.stops.every((s) => s.name && s.s >= 0 && s.s <= v.len + 0.1), `${v.ref}: named stops on the route`);
  }
  // The town line serves both stations
  const main = VBD_DATA.variants.filter((v) => v.ref === '301').flatMap((v) => v.stops.map((s) => s.name));
  assert.ok(main.some((n) => /Davos Platz/.test(n)) && main.some((n) => /Davos Dorf/.test(n)), 'line 301 serves Platz and Dorf');
});
