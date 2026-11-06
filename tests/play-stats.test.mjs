import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { travelKind, mergeDevices, totals, createPlayStats, readStats, TRAVEL_KINDS, STATS_KEY, MAX_DEVICES } from '../js/play-stats.js';
import { durationText, distanceText, travelLines } from '../js/play-stats-ui.js';
import { clearLocalSave } from '../js/account-merge.js';
import { MISSIONS } from '../js/missions-data.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};
const events = () => {
  const on = {};
  return { addEventListener: (type, fn) => (on[type] ??= []).push(fn), fire: (type) => on[type]?.forEach((fn) => fn()) };
};

test('the way of travel follows the mode, the vehicle and the mission', () => {
  assert.equal(travelKind({ mode: 'person' }), 'walk');
  assert.equal(travelKind({ mode: 'car' }), 'car');
  assert.equal(travelKind({ mode: 'car', body: { kind: 'bus' } }), 'bus');
  assert.equal(travelKind({ mode: 'car', body: { kind: 'traffic' } }), 'car');
  assert.equal(travelKind({ mode: 'cyclist' }), 'bike');
  assert.equal(travelKind({ mode: 'rhb' }), 'train-driver');
  assert.equal(travelKind({ mode: 'rhb', passenger: true }), 'train-passenger');
  const def = (id) => MISSIONS.find((m) => m.id === id);
  assert.equal(travelKind({ mode: 'person', mission: def('ski-slalom'), rider: 'ski' }), 'ski');
  assert.equal(travelKind({ mode: 'person', mission: def('big-air'), rider: 'board' }), 'snowboard');
  assert.equal(travelKind({ mode: 'person', mission: def('paraglider-rinerhorn') }), 'paraglider');
  assert.equal(travelKind({ mode: 'person', mission: def('golf') }), 'walk');
  assert.equal(travelKind({ mode: 'car', mission: def('snow-blower') }), 'snow-blower');
  assert.equal(travelKind({ mode: 'helicopter', mission: def('rega-rettung') }), 'helicopter');
  // every mission ends up on a way of travel with a label
  for (const m of MISSIONS) {
    const kind = travelKind({ mode: m.mode || 'person', mission: m });
    assert.ok(TRAVEL_KINDS[kind], `${m.id}: ${kind}`);
  }
});

test('the time counts while the player is there, the distance while moving', () => {
  const storage = memory(), target = events();
  let t = 1000;
  const stats = createPlayStats({ storage, now: () => t, target });
  for (let i = 0; i < 100; i++) { t += 100; stats.tick(0.1, 'car', { x: i * 2, y: 0, z: 0 }); } // 20 m/s for 10 s
  t += 1000;
  stats.tick(0.1, 'walk', { x: 5000, y: 0, z: 0 }); // (a change of player: no distance)
  let s = totals(stats.current());
  assert.equal(s.sessions, 1);
  assert.equal(s.modes[0].kind, 'car');
  assert.ok(Math.abs(s.modes[0].ms - 10000) < 2, s.modes[0].ms);
  assert.ok(Math.abs(s.modes[0].m - 198) < 2, s.modes[0].m);
  assert.equal(s.modes.find((m) => m.kind === 'walk').m, 0);
  // standing about without input for longer than two minutes: no time
  t += 130000;
  const before = s.playMs;
  for (let i = 0; i < 10; i++) { t += 100; stats.tick(0.1, 'walk', { x: 5000, y: 0, z: 0 }); }
  assert.equal(totals(stats.current()).playMs, before);
  // riding a train without input still counts (the player moves)
  for (let i = 0; i < 10; i++) { t += 100; stats.tick(0.1, 'train-passenger', { x: 5000 + i * 3, y: 0, z: 0 }); }
  s = totals(stats.current());
  assert.ok(s.playMs > before);
  // an input wakes it up again
  t += 1000;
  target.fire('keydown');
  stats.tick(1, 'walk', { x: 5027, y: 0, z: 0 });
  assert.ok(totals(stats.current()).playMs >= s.playMs + 999);
  // a teleport is no distance
  stats.tick(0.1, 'walk', { x: 9000, y: 0, z: 0 });
  assert.ok(totals(stats.current()).modes.find((m) => m.kind === 'walk').m < 5);
});

test('every page load is a session on the same device; the lines of other devices stay', () => {
  const storage = memory();
  let t = 0;
  const first = createPlayStats({ storage, now: () => t, target: events() });
  first.tick(1, 'walk', { x: 0, y: 0, z: 0 });
  const device = readStats(storage).device;
  // (another device's line, from the cloud)
  const s = readStats(storage);
  storage.setItem(STATS_KEY, JSON.stringify({ ...s, devices: { ...s.devices, otherdevice1: { at: 5, playMs: 60000, sessions: 3, modes: { car: { ms: 60000, m: 900 } } } } }));
  first.tick(1, 'walk', { x: 1, y: 0, z: 0 });
  first.save();
  const second = createPlayStats({ storage, now: () => t, target: events() });
  const all = totals(second.current());
  assert.equal(readStats(storage).device, device);
  assert.equal(all.devices, 2);
  assert.equal(all.sessions, 2 + 3);
  assert.ok(all.playMs >= 62000);
});

test('another account taking the device over starts the counts afresh', () => {
  const storage = memory();
  const stats = createPlayStats({ storage, now: () => 0, target: events() });
  stats.tick(5, 'walk', { x: 0, y: 0, z: 0 });
  stats.save();
  clearLocalSave(storage);
  stats.tick(1, 'walk', { x: 0, y: 0, z: 0 });
  stats.save();
  const after = totals(readStats(storage));
  assert.ok(after.playMs <= 1000, after.playMs);
});

test('device lines merge: per device the fuller one, junk left out, at most MAX_DEVICES', () => {
  const merged = mergeDevices(
    { aaaaaaaa1: { at: 1, playMs: 100, sessions: 1, modes: { walk: { ms: 100, m: 5 } } }, 'BAD id': { playMs: 9 } },
    { aaaaaaaa1: { at: 2, playMs: 50, sessions: 9, modes: {} }, bbbbbbbb2: { at: 3, playMs: 'x', sessions: -4, modes: { 'Not ok': { ms: 1 }, car: { ms: 1e20, m: -3 } } } }
  );
  assert.deepEqual(Object.keys(merged).sort(), ['aaaaaaaa1', 'bbbbbbbb2']);
  assert.equal(merged.aaaaaaaa1.sessions, 1);
  assert.deepEqual(merged.bbbbbbbb2, { at: 3, playMs: 0, sessions: 0, modes: { car: { ms: 1e15, m: 0 } } });
  assert.equal(mergeDevices({ aaaaaaaa1: { at: 1762430000000, playMs: 1 } }, null).aaaaaaaa1.at, 1762430000000, 'a date fits');
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`device${String(i).padStart(4, '0')}`, { at: i, playMs: 1 }]));
  const kept = mergeDevices(many, null);
  assert.equal(Object.keys(kept).length, MAX_DEVICES);
  assert.ok(kept.device0029 && !kept.device0000, 'the devices played on last');
});

test('the dialog writes times and distances', () => {
  assert.equal(durationText(45000), '45 s');
  assert.equal(durationText(12 * 60000 + 5000), '12 min');
  assert.equal(durationText(3 * 3600000 + 5 * 60000), '3 h 05 min');
  assert.equal(distanceText(349.6), '350 m');
  assert.equal(distanceText(4240), '4.2 km');
  assert.equal(distanceText(128400), '128 km');
  const lines = travelLines({ modes: [{ kind: 'car', ms: 60000, m: 1000 }, { kind: 'walk', ms: 30000, m: 50 }, { kind: 'bus', ms: 200, m: 1 }] });
  assert.deepEqual(lines.map((l) => [l.label, l.share]), [['Car', 1], ['On foot', 0.5]]);
});

test('the server keeps the statistics closed: only merge_stats, for a signed-in player', () => {
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const sql = readFileSync(new URL(readdirSync(dir).find((f) => f.endsWith('_play_stats.sql')), dir), 'utf8');
  assert.match(sql, /grant execute on function public\.merge_stats\(jsonb\) to authenticated;/);
  assert.match(sql, /revoke all on function public\.merge_stats\(jsonb\) from public, anon;/);
  for (const fn of ['stats_line\\(jsonb\\)', 'stats_count\\(jsonb\\)', 'stats_merge\\(jsonb, jsonb\\)']) assert.match(sql, new RegExp(`revoke all on function public\\.${fn} from public, anon, authenticated;`));
  assert.match(sql, /revoke all on public\.player_stats, public\.player_travel, public\.travel_totals from public, anon, authenticated;/);
  assert.equal([...sql.matchAll(/security definer set search_path = ''/g)].length, [...sql.matchAll(/create function/g)].length);
  assert.ok(sql.includes(`limit ${MAX_DEVICES}`), 'as many devices as the browser keeps');
});
