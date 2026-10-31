import assert from 'node:assert/strict';
import test from 'node:test';
import { STREAMS } from '../js/streams-data.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

test('the streams of Davos are mapped inside the frame, downstream, with plausible widths', () => {
  const list = STREAMS.streams;
  assert.ok(list.length > 200, `${list.length} stretches`);
  const names = new Set(list.map((s) => s.name));
  for (const n of ['Dischmabach', 'Flüelabach', 'Landwasser']) assert.ok(names.has(n), n);
  const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
  for (const s of list) {
    assert.ok(s.pts.length >= 4 && s.pts.length % 2 === 0, s.id);
    for (let i = 0; i < s.pts.length; i += 2) {
      assert.ok(s.pts[i] >= minX - 0.1 && s.pts[i] <= maxX + 0.1 && s.pts[i + 1] >= minZ - 0.1 && s.pts[i + 1] <= maxZ + 0.1, `${s.id} in the frame`);
    }
    assert.ok(s.width > 0.3 && s.width < 40, `${s.id} width ${s.width}`);
  }
  assert.ok(list.find((s) => s.name === 'Dischmabach').width >= 4, 'the Dischmabach is a main stream');
});
