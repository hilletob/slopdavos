import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameGuard, watchDeviceLost, FRAME_ERROR_KEY, LOST_KEY, SHOW_AFTER, RELOAD_GAP } from '../js/frame-guard.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };

test('a frame that throws is still drawn, kept for the next start and told after a while', () => {
  const storage = memory(), told = [], realError = console.error;
  console.error = () => {};
  try {
    const guard = createFrameGuard({ storage, notify: (t) => told.push(t) });
    let draws = 0;
    for (let i = 0; i < SHOW_AFTER - 1; i++) guard.run(() => { throw new Error('boom'); }, () => draws++, i);
    assert.equal(draws, SHOW_AFTER - 1);
    assert.equal(told.length, 0, 'one bad frame says nothing yet');
    guard.run(() => { throw new Error('boom'); }, () => draws++, 0);
    guard.run(() => { throw new Error('boom'); }, () => draws++, 0);
    assert.equal(told.length, 1, 'told once');
    assert.match(told[0], /boom/);
    assert.match(storage.getItem(FRAME_ERROR_KEY), /boom/);
    guard.run(() => {}, () => { throw new Error('not drawn twice'); }, 0);
    assert.equal(guard.failing, 0, 'a good frame clears the row');
  } finally { console.error = realError; }
});

test('a fault in the drawing as well does not escape the frame', () => {
  const realError = console.error;
  console.error = () => {};
  try {
    const guard = createFrameGuard();
    assert.doesNotThrow(() => guard.run(() => { throw new Error('a'); }, () => { throw new Error('b'); }, 0));
  } finally { console.error = realError; }
});

test('a lost device saves and reloads once, a second loss at once only tells, destroying it ourselves is no loss', async () => {
  const storage = memory();
  const calls = [];
  const opts = { storage, save: () => calls.push('save'), reload: () => calls.push('reload'), notify: () => calls.push('notify'), now: () => 1000000 };
  assert.equal(await watchDeviceLost({ lost: Promise.resolve({ reason: 'destroyed' }) }, opts), 'destroyed');
  assert.deepEqual(calls, []);
  assert.equal(await watchDeviceLost({ lost: Promise.resolve({ reason: 'unknown', message: 'x' }) }, opts), 'reloaded');
  assert.deepEqual(calls, ['save', 'reload']);
  assert.equal(storage.getItem(LOST_KEY), '1000000');
  assert.equal(await watchDeviceLost({ lost: Promise.resolve({ reason: 'unknown' }) }, { ...opts, now: () => 1000000 + RELOAD_GAP - 1 }), 'notified');
  assert.deepEqual(calls, ['save', 'reload', 'notify']);
  assert.equal(await watchDeviceLost({ lost: Promise.resolve({ reason: 'unknown' }) }, { ...opts, now: () => 1000000 + RELOAD_GAP + 1 }), 'reloaded');
});
