import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameGuard, watchDeviceLost, deviceGone, FRAME_ERROR_KEY, LOST_KEY, SHOW_AFTER, RELOAD_GAP } from '../js/frame-guard.js';

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

test('Safari\'s dead GPU process counts as a lost device: saved and reloaded at once, once, with what was going on', () => {
  const gone = [], notes = [], storage = new Map(), store = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  const guard = createFrameGuard({ storage: store, notify: (t) => notes.push(t), gone: (t) => gone.push(t), context: () => '[up 30 s]' });
  let draws = 0;
  for (let i = 0; i < 40; i++) guard.run(() => { throw new Error('GPUDevice.createCommandEncoder: Unable to make command encoder.'); }, () => { draws++; }, i);
  assert.equal(gone.length, 1);
  assert.match(gone[0], /GPU process gone.*\[up 30 s\]/);
  assert.equal(notes.length, 0, 'no message over the reload');
  assert.equal(draws, 0, 'no drawing with a dead device');
  assert.match(storage.get(FRAME_ERROR_KEY), /\[up 30 s\]/);
});

test('deviceGone reloads once and tells the player when it happens again at once', () => {
  const storage = new Map(), store = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  let t = 1000000, saved = 0, reloads = 0; const notes = [];
  const opts = { storage: store, save: () => saved++, reload: () => reloads++, notify: (x) => notes.push(x), now: () => t };
  assert.equal(deviceGone('gone', opts), 'reloaded');
  t += 30000;
  assert.equal(deviceGone('gone', opts), 'notified');
  assert.deepEqual([saved, reloads, notes.length], [1, 1, 1]);
  t += RELOAD_GAP;
  assert.equal(deviceGone('gone', opts), 'reloaded');
});
