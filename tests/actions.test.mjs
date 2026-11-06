import assert from 'node:assert/strict';
import test from 'node:test';
import { ActionRegistry, bindKeyboard, keyName, PAD_SLOTS } from '../js/actions.js';

// js/actions.js: the one register of what the player does besides moving: layers, keys, hints, holds

const key = (code, extra = {}) => ({ code, target: { tagName: 'BODY' }, ...extra });

test('layers stack, a replacing layer hides those under it, and each one is removed by what layer() returns', () => {
  const r = new ActionRegistry();
  let mode = 'car';
  r.layer('car', [{ id: 'horn', label: 'Horn', keys: ['KeyB'], when: () => mode === 'car', run() {} }]);
  const off = r.layer('mission', [{ id: 'chute', label: 'Chute', keys: ['KeyV'], run() {} }]);
  assert.deepEqual(r.list().map((a) => a.id), ['horn', 'chute']);
  mode = 'person';
  assert.deepEqual(r.list().map((a) => a.id), ['chute'], 'when() filters');
  mode = 'car';
  let cab = true;
  const offCab = r.layer('cab', [{ id: 'hook', label: 'Hook', keys: ['KeyF'], run() {} }], { replace: () => cab });
  assert.deepEqual(r.list().map((a) => a.id), ['hook'], 'the cab replaces everything below');
  cab = false;
  assert.deepEqual(r.list().map((a) => a.id), ['horn', 'chute', 'hook']);
  offCab();
  off();
  assert.deepEqual(r.list().map((a) => a.id), ['horn']);
  off(); // (twice is harmless)
  assert.deepEqual(r.list().map((a) => a.id), ['horn']);
  const offMission = r.layer('mission', [{ id: 'swing', label: 'Swing', run() {} }], { rank: 10 });
  r.layer('look', [{ kind: 'hint', kbd: ['Drag'], label: 'Orbit' }]);
  assert.deepEqual(r.list().map((a) => a.id || a.label), ['horn', 'Orbit', 'swing'], 'a ranked layer stays on top of what comes after it');
  offMission();
  assert.deepEqual(r.list().map((a) => a.id || a.label), ['horn', 'Orbit']);
});

test('the keyboard runs taps, toggles and holds, top layer first, and leaves fields and modifiers alone', () => {
  const r = new ActionRegistry();
  const log = [];
  let beam = false;
  r.layer('vehicle', [
    { id: 'horn', label: 'Horn', keys: ['KeyB'], run: () => log.push('horn') },
    { id: 'highBeam', label: 'High beam', keys: ['KeyL'], kind: 'toggle', state: () => beam, run: () => { beam = !beam; } },
    { id: 'shovel', label: 'Shovel', keys: ['Space', 'KeyE'], kind: 'hold', run: (on) => log.push(`shovel:${on}`) }
  ]);
  r.layer('mission', [{ id: 'use', label: 'Use', keys: ['KeyB'], run: () => { log.push('use'); return false; } }]);
  assert.equal(r.key(key('KeyB'), true), true, 'the mission\'s B did nothing: the horn below takes it');
  assert.deepEqual(log, ['use', 'horn']);
  assert.equal(r.key(key('KeyB', { repeat: true }), true), true, 'a repeat is swallowed, not run again');
  assert.deepEqual(log, ['use', 'horn']);
  assert.equal(r.key(key('KeyB'), false), true, 'the keyup of a tap is taken too');
  r.key(key('KeyL'), true);
  assert.equal(beam, true);
  assert.deepEqual(r.hints().find((h) => h.action.id === 'highBeam').on, true);
  assert.equal(r.key(key('KeyL', { metaKey: true }), true), false, 'Cmd+L is the browser\'s');
  assert.equal(r.key(key('KeyB', { target: { tagName: 'INPUT' } }), true), false);
  r.key(key('Space'), true);
  r.key(key('Space', { repeat: true }), true);
  r.key(key('KeyE'), true);
  assert.deepEqual(log.slice(2), ['shovel:true'], 'held once however many keys press it');
  assert.equal(r.held(r.find('shovel')), true);
  r.key(key('Space'), false);
  assert.deepEqual(log.slice(2), ['shovel:true', 'shovel:false']);
  r.key(key('KeyN'), true);
  assert.equal(r.key(key('KeyN'), true), false, 'an unbound key is nobody\'s');
});

test('keyboard: false lists a key in the bar only; relabel renames or hides; hints derive their kbd', () => {
  const r = new ActionRegistry();
  const log = [];
  r.layer('person', [
    { id: 'up', label: 'Jump', keys: ['Space'], kind: 'hold', keyboard: false, run: (on) => log.push(on) },
    { kind: 'hint', kbd: ['W', 'S'], label: 'Walk' },
    { id: 'drive', label: 'Drive', keys: ['KeyT'], hint: false, run() {} }
  ]);
  assert.equal(r.key(key('Space'), true), false, 'the controllers own Space');
  assert.deepEqual(r.hints().map((h) => [h.kbd, h.label]), [[['Space'], 'Jump'], [['W', 'S'], 'Walk']]);
  r.relabel('up', 'Swing');
  assert.equal(r.hints()[0].label, 'Swing');
  assert.equal(r.label(r.find('up')), 'Swing');
  r.relabel('up', null);
  assert.equal(r.hidden('up'), true);
  assert.deepEqual(r.hints().map((h) => h.label), ['Walk']);
  r.relabel('up');
  assert.equal(r.hints()[0].label, 'Jump');
  assert.equal(keyName('KeyL'), 'L');
  assert.equal(keyName('Digit3'), '3');
  assert.equal(keyName('ArrowUp'), '↑');
  assert.equal(PAD_SLOTS.x, 2);
});

test('press and hold from a button: a hold is let go when its layer goes or the window blurs; listeners hear changes', () => {
  const r = new ActionRegistry();
  let changes = 0;
  r.subscribe(() => changes++);
  const log = [];
  const off = r.layer('work', [{ id: 'pick', label: 'Pick', kind: 'hold', run: (on) => log.push(on) }, { id: 'chute', label: 'Chute', run: () => log.push('chute') }]);
  assert.equal(r.press('chute'), true);
  assert.equal(r.press('pick'), false, 'a hold is not pressed');
  r.hold('pick', true);
  r.hold('pick', true);
  off();
  assert.deepEqual(log, ['chute', true, false]);
  const listeners = [];
  const target = { addEventListener: (type, fn) => listeners.push([type, fn]) };
  let blocked = false;
  bindKeyboard(r, { target, blocked: () => blocked });
  r.layer('work', [{ id: 'pick', label: 'Pick', kind: 'hold', keys: ['Space'], run: (on) => log.push(on) }]);
  const fire = (type, e) => listeners.filter(([t]) => t === type).forEach(([, fn]) => fn(e));
  let prevented = 0;
  fire('keydown', key('Space', { preventDefault: () => prevented++ }));
  assert.deepEqual(log.slice(3), [true]);
  assert.equal(prevented, 1);
  fire('blur', {});
  assert.deepEqual(log.slice(3), [true, false]);
  blocked = true;
  fire('keydown', key('Space', { preventDefault: () => prevented++ }));
  assert.deepEqual(log.slice(3), [true, false], 'blocked: the map is open');
  assert.ok(changes >= 6);
});
