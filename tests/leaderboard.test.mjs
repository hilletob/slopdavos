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

// --- The overview (js/leaderboard-overview.js, supabase/migrations/*_leaderboard_overview.sql) ------------------------
const overviewFile = readdirSync(dir).find((f) => f.endsWith('_leaderboard_overview.sql'));
const overviewSql = readFileSync(new URL(overviewFile, dir), 'utf8');

test('the overall list counts the points like the game, capped at what all the missions are worth', async () => {
  const { maxPoints, FIRST_CLEAR_POINTS, MEDAL_POINTS } = await import('../js/missions-progress.js');
  // (a cap above the missions' worth costs nothing, one below it would cut real players: a new mission raises it)
  const cap = +/least\((\d+), coalesce\(sum/.exec(overviewSql)[1];
  assert.ok(cap >= maxPoints(MISSIONS), `the cap ${cap} is at least ${maxPoints(MISSIONS)}: raise it in a new migration`);
  assert.ok(overviewSql.includes(`sum(${FIRST_CLEAR_POINTS} + case e.value->>'medal' when 'gold' then ${MEDAL_POINTS.gold} when 'silver' then ${MEDAL_POINTS.silver} when 'bronze' then ${MEDAL_POINTS.bronze} else 0 end)`));
});

test('the overview\'s inner functions stay closed, the lists are open to guests', () => {
  assert.match(overviewSql, /revoke all on function public\.save_points\(jsonb\) from public, anon, authenticated/);
  assert.match(overviewSql, /revoke all on function public\.saves_profile\(\) from public, anon, authenticated/);
  assert.match(overviewSql, /grant execute on function public\.board_view\(text, integer, integer\) to anon, authenticated/);
  assert.match(overviewSql, /grant execute on function public\.points_view\(integer, integer\) to anon, authenticated/);
  assert.equal([...overviewSql.matchAll(/security definer set search_path = ''/g)].length, [...overviewSql.matchAll(/create function/g)].length);
});

test('the comparison: the lead, the gap to the line above and to the leader', async () => {
  const { compareText, timeGap, pointsGap } = await import('../js/leaderboard-ui.js');
  const { formatTime } = await import('../js/missions-data.js');
  const times = { value: (r) => r.total_ms, gap: (ms) => timeGap(ms, formatTime) };
  const row = (place, total_ms, is_me = false) => ({ place, name: `p${place}`, total_ms, is_me, players: 23 });
  assert.equal(compareText([row(1, 30000, true), row(2, 33200)], times), 'You lead, 3.2 s ahead of place 2');
  assert.equal(compareText([row(1, 30000, true)], times), 'You lead');
  assert.equal(compareText([row(1, 30000), row(2, 31000, true), row(3, 32000)], times), 'Place 2 of 23 · 1.0 s behind place 1');
  assert.equal(compareText([row(1, 30000), row(6, 95000), row(7, 99100, true)], times), 'Place 7 of 23 · 4.1 s behind place 6 · 01:09.1 behind the leader');
  assert.equal(compareText([row(1, 30000)], times), null);
  const pts = { value: (r) => r.points, gap: pointsGap };
  assert.equal(compareText([{ place: 1, points: 9000, players: 3 }, { place: 2, points: 8250, is_me: true, players: 3 }], pts), 'Place 2 of 3 · 750 points behind place 1');
});

test('every ranked mission is a tab of the overview, after the overall points', async () => {
  const { overviewTabs } = await import('../js/leaderboard-overview.js');
  assert.deepEqual(overviewTabs().map((t) => t.id), ['points', ...MISSIONS.filter((m) => m.board).map((m) => m.board)]);
});

test('an email and a code are checked before anything is sent', async () => {
  const { emailFits, codeFits, cleanCode } = await import('../js/account.js');
  for (const good of ['a@b.ch', ' hans.muster@example.com ']) assert.ok(emailFits(good), good);
  for (const bad of ['', 'a@b', 'a b@c.ch', '@b.ch', `${'a'.repeat(250)}@b.ch`]) assert.ok(!emailFits(bad), bad);
  assert.equal(cleanCode(' 123 456 '), '123456');
  assert.ok(codeFits('123 456') && codeFits('12345678'));
  assert.ok(!codeFits('12345') && !codeFits('abcdef'));
});
