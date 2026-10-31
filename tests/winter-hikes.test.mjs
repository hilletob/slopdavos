import assert from 'node:assert/strict';
import test from 'node:test';
import { WINTER_HIKES } from '../js/winter-hikes-data.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const inMap = (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;

test('the signposted winter hiking trails of Davos (ASTRA ch.astra.winterwanderwege), inside the map', () => {
  const { trails, source } = WINTER_HIKES;
  assert.match(source, /ASTRA/);
  assert.ok(trails.length >= 8, `${trails.length} trails`);
  for (const t of trails) {
    assert.ok(t.pts.length >= 4 && t.pts.length % 2 === 0, t.id);
    for (let i = 0; i < t.pts.length; i += 2) assert.ok(inMap(t.pts[i], t.pts[i + 1]), `${t.id} inside the map`);
    // one street flag per segment
    assert.equal(t.road.length, t.pts.length / 2 - 1, `${t.id} road flags`);
    assert.match(t.road, /^[01]+$/);
    let len = 0;
    for (let i = 2; i < t.pts.length; i += 2) {
      const d = Math.hypot(t.pts[i] - t.pts[i - 2], t.pts[i + 1] - t.pts[i - 1]);
      assert.ok(d < 1000, `${t.id}: no jumps (${d} m)`);
      len += d;
    }
    assert.ok(Math.abs(len - t.len) < 2, `${t.id} length`);
    assert.ok(t.len >= 60, `${t.id} ${t.len} m`);
  }
  const km = trails.reduce((s, t) => s + t.len, 0) / 1000;
  assert.ok(km > 25 && km < 80, `${km} km`);
  // Most of it off the streets (over the meadows, the paths and the forest tracks): drawn as a rolled strip
  let open = 0;
  for (const t of trails) for (let i = 0; i < t.road.length; i++) if (t.road[i] === '0') open += Math.hypot(t.pts[i * 2 + 2] - t.pts[i * 2], t.pts[i * 2 + 3] - t.pts[i * 2 + 1]);
  assert.ok(open / 1000 > km * 0.5, `${open} m off the streets`);
  // The well-known ones
  for (const name of [/Landwasser/, /Hohe Promenade/, /Schatzalp/, /Dischma/]) assert.ok(trails.some((t) => name.test(t.name)), String(name));
});
