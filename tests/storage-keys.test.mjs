import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { STORAGE, KEYS, WORLD_KEYS, CLOUD_KEYS, readJson, writeJson } from '../js/storage-keys.js';
import { clearLocalSave, readWorld } from '../js/account-merge.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const memory = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};
const known = new Set(Object.values(KEYS));
const KEY_TEXT = /(['"`])((?:slopdavos-[a-z0-9-]+)|nyc-sound|davos-radio(?:-off)?)\1/g;
// The strings kept on purpose: js/start.js imports nothing (a guest's start loads no other module), and js/missions.js
// tells a signed-in player by the session key without loading the account (tests/leaderboard.test.mjs)
const ALLOWED = { 'js/storage-keys.js': null, 'js/start.js': null, 'js/missions.js': ['slopdavos-session'] };
const modules = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);

test('every key is named once, says what it holds and what the cloud save does with it', () => {
  assert.equal(known.size, Object.keys(STORAGE).length, 'no key twice');
  for (const [name, e] of Object.entries(STORAGE)) {
    assert.ok(typeof e.what === 'string' && e.what.length > 10, name);
    assert.ok(e.cloud === null || /^(world\.[a-z]+|progress|bestTimes|worldAt|stats)$/.test(e.cloud), name);
  }
});

test('the cloud save carries the same keys under the same names as before', () => {
  // (the names are the fields of the `world` column in the saves of existing players: they must not change)
  assert.deepEqual(Object.entries(WORLD_KEYS), [['player', 'slopdavos-player-state'], ['gta', 'slopdavos-gta'], ['clock', 'slopdavos-clock'],
    ['figure', 'slopdavos-figure'], ['character', 'slopdavos-character']]);
  assert.deepEqual([...CLOUD_KEYS].sort(), ['slopdavos-character', 'slopdavos-clock', 'slopdavos-figure', 'slopdavos-gta', 'slopdavos-mission-best',
    'slopdavos-player-state', 'slopdavos-progress', 'slopdavos-stats', 'slopdavos-world-at']);
  // forgetting the save takes every key the cloud carries, and leaves the device's own
  const s = memory(Object.fromEntries([...known].map((k) => [k, '1'])));
  clearLocalSave(s);
  assert.deepEqual([...s.map.keys()].sort(), [...known].filter((k) => !CLOUD_KEYS.includes(k)).sort());
  assert.deepEqual(readWorld(memory({ [KEYS.clock]: '{"v":1,"total":5}', [KEYS.language]: '"de"' })), { clock: { v: 1, total: 5 } });
});

test('no module keeps a key of its own: each comes from js/storage-keys.js', () => {
  for (const path of modules) {
    const src = read(path);
    for (const [, , key] of src.matchAll(KEY_TEXT)) {
      assert.ok(known.has(key), `${path}: '${key}' is not in js/storage-keys.js`);
      if (!(path in ALLOWED)) assert.fail(`${path}: '${key}' written out, take it from js/storage-keys.js KEYS`);
      else if (ALLOWED[path]) assert.ok(ALLOWED[path].includes(key), `${path}: '${key}'`);
    }
    if (!(path in ALLOWED)) assert.doesNotMatch(src, /(?:get|set|remove)Item\(\s*['"`]/, `${path}: a storage key written out`);
  }
  assert.doesNotMatch(read('js/storage-keys.js'), /^import /m, 'the registry imports nothing');
  // js/start.js reads the keys under which the save and the start's choice are kept
  for (const key of read('js/start.js').matchAll(KEY_TEXT)) assert.ok(known.has(key[2]), key[2]);
});

test('the pages read the keys the game writes', () => {
  for (const path of ['index.html', 'play.html', 'heatmap.html', 'auth/callback.html']) {
    for (const [, , key] of read(path).matchAll(KEY_TEXT)) assert.ok(known.has(key), `${path}: '${key}'`);
  }
  assert.match(read('play.html'), /<link rel="modulepreload" href="\.\/js\/storage-keys\.js" \/>/);
});

test('readJson and writeJson: a fallback for nothing, garbage and a storage that is off', () => {
  const s = memory({ a: '{"x":1}', b: 'nonsense', c: 'null' });
  assert.deepEqual(readJson('a', null, s), { x: 1 });
  assert.equal(readJson('b', 7, s), 7);
  assert.equal(readJson('c', 7, s), 7);
  assert.deepEqual(readJson('missing', [], s), []);
  const off = { getItem() { throw new Error('off'); }, setItem() { throw new Error('full'); } };
  assert.equal(readJson('a', 3, off), 3);
  assert.equal(writeJson('a', { y: 2 }, off), false);
  assert.equal(writeJson('d', { y: 2 }, s), true);
  assert.equal(s.getItem('d'), '{"y":2}');
});
