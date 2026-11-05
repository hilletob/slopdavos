import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { cleanName, nameFits, NAME_MAX } from '../js/leaderboard.js';
import { SESSION_KEY } from '../js/account.js';
import { MISSIONS } from '../js/missions-data.js';
import { missionMedals } from '../js/missions-progress.js';

const dir = new URL('../supabase/migrations/', import.meta.url);
const file = readdirSync(dir).find((f) => f.endsWith('_leaderboards.sql'));
const sql = readFileSync(new URL(file, dir), 'utf8');
const boards = new Map([...sql.matchAll(/\('([\w-]+)', '([\w-]+)', (\d+), (\d+)\)/g)].map(([, id, mission, min, max]) => [id, { mission, min: +min, max: +max }]));

test('every ranked mission has its list on the server, with limits its medals fit inside', () => {
  const ranked = MISSIONS.filter((m) => m.board);
  assert.deepEqual(ranked.map((m) => m.board).sort(), [...boards.keys()].sort());
  for (const m of ranked) {
    const b = boards.get(m.board), medals = missionMedals(m);
    assert.equal(b.mission, m.id);
    assert.ok(!m.scoreMode, `${m.id}: only times are ranked so far`);
    assert.ok(!m.nightTime, `${m.id}: a night variant would need its own list`);
    assert.ok(b.min < medals.gold && medals.bronze < b.max, `${m.id}: ${b.min} < ${medals.gold}, ${medals.bronze} < ${b.max}`);
  }
});

test('a name is tidied and checked like on the server', () => {
  assert.equal(cleanName('  Güggel   Hans '), 'Güggel Hans');
  for (const good of ['Bob', 'Güggel Hans', 'Arve-2444', 'x_y', 'a'.repeat(NAME_MAX)]) assert.ok(nameFits(good), good);
  for (const bad of ['ab', 'a'.repeat(NAME_MAX + 1), '<b>x</b>', '-abc', 'abc_', 'a​bc', '']) assert.ok(!nameFits(bad), bad);
  const letters = /LETTER = '([^']+)'/.exec(readFileSync(new URL('../js/leaderboard.js', import.meta.url), 'utf8'))[1];
  assert.ok(sql.includes(`[${letters} _-]{1,18}[${letters}]`), 'the same letters as the check on the table');
});

test('the tables stay closed: the browser only reaches the checking functions', () => {
  assert.match(sql, /revoke all on table public\.boards, public\.profiles, public\.run_starts, public\.scores from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.ensure_profile\(uuid\) from public, anon, authenticated/);
  assert.equal([...sql.matchAll(/security definer set search_path = ''/g)].length, [...sql.matchAll(/create function/g)].length);
});

test('the missions recognise a signed-in player by the account\'s own session key, without loading the account for a guest', () => {
  const missions = readFileSync(new URL('../js/missions.js', import.meta.url), 'utf8');
  assert.ok(missions.includes(`getItem('${SESSION_KEY}')`));
  assert.doesNotMatch(missions, /from '\.\/(account|leaderboard)/);
});
