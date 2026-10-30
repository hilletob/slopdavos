import assert from 'node:assert/strict';
import test from 'node:test';
import { SHOPS_DATA } from '../js/shops-data.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

test('the businesses of Davos come with sign styles, inside the map', () => {
  assert.ok(SHOPS_DATA.length > 200, `${SHOPS_DATA.length} businesses`);
  const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
  for (const s of SHOPS_DATA) {
    assert.ok(s.x >= minX && s.x <= maxX && s.z >= minZ && s.z <= maxZ, s.name);
    assert.ok(s.brand.text && /^#[0-9a-f]{6}$/i.test(s.brand.colour) && /^#[0-9a-f]{6}$/i.test(s.brand.background), s.name);
  }
});

test('the chains and local businesses have their researched lettering and colours', () => {
  const find = (re) => SHOPS_DATA.filter((s) => re.test(s.name));
  for (const [re, text, colour] of [[/^Migros$/, 'MIGROS', '#ff6600'], [/^Coop$/, 'coop', '#e8601c'], [/^Denner/, 'DENNER', '#ffffff'],
    [/^Bäckerei Weber/, 'Weber', '#f3e3c3'], [/^Molkerei Davos/, 'Molkerei Davos', '#ffffff'], [/^k kiosk/, 'kiosk', '#ffffff']]) {
    const list = find(re);
    assert.ok(list.length, `${re} in the data`);
    for (const s of list) { assert.equal(s.brand.text, text, s.name); assert.equal(s.brand.colour, colour, s.name); }
  }
});
