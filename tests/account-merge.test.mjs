import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MEDALS, PROGRESS_KEY as GAME_PROGRESS_KEY, readProgress } from '../js/missions-progress.js';
import { mergeProgress, mergeBestTimes, mergeSaves, applySave, readLocalSave, canonical, ownedByOther, clearLocalSave, fromRow, cleanProgress, PROGRESS_KEY, WORLD_KEYS, WORLD_AT_KEY, OWNER_KEY } from '../js/account-merge.js';

const storage = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
};
const p = (missions) => ({ v: 1, missions });
const a = p({ ski: { medal: 'silver', bestMs: 70000, runs: 3, at: 10 }, hike: { medal: null, bestMs: 900, bestScore: 40, runs: 1, at: 5 } });
const b = p({ ski: { medal: 'bronze', bestMs: 60000, runs: 5, at: 20 }, hike: { medal: 'gold', bestMs: 1000, bestScore: 90, runs: 2, at: 1 }, mine: { medal: 'gold', bestMs: 5, runs: 1, at: 2 } });
const c = p({ ski: { medal: 'gold', bestMs: 65000, runs: 1, at: 30 } });

test('merging progress keeps the best of everything, and does not count runs again', () => {
  const m = mergeProgress(a, b);
  assert.deepEqual(m.missions.ski, { medal: 'silver', bestMs: 60000, runs: 5, at: 20 });
  assert.deepEqual(m.missions.hike, { medal: 'gold', bestMs: 900, bestScore: 90, runs: 2, at: 5 });
  assert.equal(m.missions.mine.medal, 'gold');
});

test('the order and the number of syncs do not matter', () => {
  const same = (x, y) => assert.equal(canonical(x), canonical(y));
  same(mergeProgress(a, b), mergeProgress(b, a));
  same(mergeProgress(mergeProgress(a, b), c), mergeProgress(a, mergeProgress(b, c)));
  same(mergeProgress(mergeProgress(a, b), b), mergeProgress(a, b));
  same(mergeBestTimes({ x: 3, y: 1 }, { x: 2 }), mergeBestTimes({ x: 2 }, { y: 1, x: 3 }));
});

test('a missing or strange save counts as empty, and garbage does not get in', () => {
  assert.deepEqual(mergeProgress(null, undefined), p({}));
  assert.deepEqual(mergeProgress(a, { v: 99, missions: { ski: { medal: 'gold' } } }).missions.ski.medal, 'silver');
  assert.equal(cleanProgress(p({ ski: { medal: 'platinum', bestMs: 'fast' } })).missions.ski.medal, null);
  assert.equal(cleanProgress(p({ ski: { medal: 'platinum', bestMs: 'fast' } })).missions.ski.bestMs, null);
  assert.deepEqual(mergeBestTimes({ x: 'soon', y: 4 }, null), { y: 4 });
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

test('what a save holds is what the game reads', () => {
  assert.equal(PROGRESS_KEY, GAME_PROGRESS_KEY);
  assert.deepEqual([...MEDALS], ['bronze', 'silver', 'gold']);
  const s = storage();
  applySave(s, { progress: mergeProgress(a, b), bestTimes: {}, worldFrom: 'local' });
  assert.equal(readProgress(s).missions.ski.bestMs, 60000);
});

test('the newer world wins as a whole, and a guest\'s world gives way to the account\'s', () => {
  const remote = (worldAt) => ({ progress: p({}), bestTimes: {}, world: { player: 'there' }, worldAt });
  const local = (worldAt, world = { player: 'here', gta: 'g' }) => ({ progress: p({}), bestTimes: {}, world, worldAt });
  assert.equal(mergeSaves(local(5), remote(9)).worldFrom, 'remote');
  assert.equal(mergeSaves(local(9), remote(5)).worldFrom, 'local');
  assert.equal(mergeSaves(local(5), remote(5)).worldFrom, 'local');
  assert.equal(mergeSaves(local(0), remote(1)).worldFrom, 'remote');
  assert.equal(mergeSaves(local(0, null), remote(0)).worldFrom, 'remote');
  assert.equal(mergeSaves(local(5), null).worldFrom, 'local');
  assert.equal(mergeSaves(local(5), { ...remote(9), world: null }).worldFrom, 'local');

  const s = storage({ [WORLD_KEYS.gta]: '{"version":1}', [WORLD_KEYS.player]: '{"old":1}' });
  applySave(s, mergeSaves(readLocalSave(s), remote(9)));
  assert.equal(s.getItem(WORLD_KEYS.player), '"there"');
  assert.equal(s.getItem(WORLD_KEYS.gta), null, 'the whole world: the old GTA state does not stay with a new player');
  assert.equal(s.getItem(WORLD_AT_KEY), '9');
});

test('an empty save writes nothing: the game seeds a missing progress from its best times', () => {
  const s = storage();
  applySave(s, mergeSaves(readLocalSave(s), null));
  assert.equal(s.map.size, 0);
});

test('a row of the database reads as a save', () => {
  assert.equal(fromRow(null), null);
  assert.deepEqual(fromRow({ progress: a, best_times: { x: 1 }, world: null, world_at: '12', rev: 3 }), { progress: a, bestTimes: { x: 1 }, world: null, worldAt: 12, rev: 3 });
});

test('another account\'s save is told apart, and forgetting it leaves the settings', () => {
  const s = storage({ [OWNER_KEY]: 'anna', [PROGRESS_KEY]: '{}', [WORLD_KEYS.clock]: '{}', 'slopdavos-language': 'de', 'nyc-sound': 'off', 'slopdavos-kirchner-gallery': '[]' });
  assert.equal(ownedByOther(s, 'anna'), false);
  assert.equal(ownedByOther(s, 'ben'), true);
  assert.equal(ownedByOther(storage(), 'ben'), false, 'a guest\'s save belongs to no one');
  clearLocalSave(s);
  assert.deepEqual([...s.map.keys()].sort(), [OWNER_KEY, 'nyc-sound', 'slopdavos-kirchner-gallery', 'slopdavos-language'].sort());
});

test('the migration protects the saves', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261104120000_saves.sql', import.meta.url), 'utf8');
  assert.match(sql, /alter table public\.saves enable row level security/);
  assert.match(sql, /on delete cascade/);
  assert.match(sql, /revoke all on function public\.delete_account\(\) from public, anon/);
  assert.doesNotMatch(sql, /to anon/);
});

test('js/start.js reads the session where js/account.js keeps it, and the page starts through it', () => {
  const start = readFileSync(new URL('../js/start.js', import.meta.url), 'utf8');
  const account = readFileSync(new URL('../js/account.js', import.meta.url), 'utf8');
  const key = /SESSION_KEY = '([^']+)'/;
  assert.equal(start.match(key)[1], account.match(key)[1]);
  assert.match(start, /late\.abort\(\)/, 'a late answer writes nothing into a running game');
  assert.doesNotMatch(start, /^import /m, 'a guest loads nothing else');
});
