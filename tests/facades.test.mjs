import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { FACADES } from '../js/facades-data.js';

test('the Mapillary facade colours are keyed by surveyed building centres, compact, and carry no credentials', () => {
  const entries = Object.entries(FACADES.buildings);
  assert.ok(entries.length > 300, `${entries.length} buildings`);
  for (const [key, v] of entries) {
    assert.match(key, /^46\.\d{6},9\.\d{6}$/, key);
    assert.equal(v.length, 5);
    for (const c of v) assert.ok(Number.isInteger(c) && c >= 0 && c <= 255, `${key}: ${v}`);
    assert.ok(v[3] <= 100 && v[4] <= 100);
  }
  assert.match(FACADES.license, /CC BY-SA 4\.0/);
  const text = fs.readFileSync(new URL('../js/facades-data.js', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /MLY\|/, 'no Mapillary token in the shipped data');
  assert.ok(text.length < 64 * 1024, `${text.length} bytes`);
});
