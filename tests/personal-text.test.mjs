import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_TEXT_KEY, aiTextOn, cacheKey, noteMission, pageLanguage, personalText, requestBody, sessionFacts, setAiText } from '../js/personal-text.js';
import { CHARACTER_KEY, CHARACTER_MAX, cleanCharacter, readCharacter, rememberCharacter } from '../js/player-character.js';
import { createPlayStats, currentSession } from '../js/play-stats.js';
import { WORLD_KEYS } from '../js/account-merge.js';
import { cleanRequest } from '../supabase/functions/mission-text/prompt.js';

const memory = (init = {}) => {
  const map = new Map(Object.entries(init));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};
const def = { id: 'ski-slalom', title: 'Slalom on the Davos Vertical', medals: { gold: 58000, silver: 75000, bronze: 105000 } };
const briefing = 'Steer with A/D, W to tuck, S to brake.';
const entry = { runs: 3, medal: 'bronze', bestMs: 85450, at: 1 };
const signedIn = (more = {}) => memory({ 'slopdavos-session': '{}', ...more });
const ok = (text) => async () => ({ ok: true, json: async () => ({ text }) });
const noSession = () => ({ minutes: 0, minute: null, season: null, day: null, touch: false, modes: [], events: [] });

test('only for a signed-in player who has not switched it off', () => {
  assert.equal(aiTextOn(memory()), false);
  const storage = signedIn();
  assert.equal(aiTextOn(storage), true);
  setAiText(false, storage);
  assert.equal(storage.getItem(AI_TEXT_KEY), 'off');
  assert.equal(aiTextOn(storage), false);
  setAiText(true, storage);
  assert.equal(aiTextOn(storage), true);
});

test('a guest or a switched-off player never reaches the network', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return { ok: true, json: async () => ({ text: 'x' }) }; };
  const ask = (storage) => personalText({ def, briefing, moment: 'intro', lang: 'de' }, { fetcher, storage, cache: memory(), token: async () => 't', session: noSession });
  assert.equal(await ask(memory()), null);
  assert.equal(await ask(signedIn({ [AI_TEXT_KEY]: 'off' })), null);
  assert.equal(await personalText({ def, briefing: '', moment: 'intro', lang: 'de' }, { fetcher, storage: signedIn(), cache: memory(), token: async () => 't', session: noSession }), null, 'nothing to rewrite');
  assert.equal(calls, 0);
});

test('the request carries the token, the texts, the character and this visit, as the function accepts them', async () => {
  let seen = null;
  const fetcher = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ text: 'Dritter Anlauf.' }) }; };
  const storage = signedIn({ [CHARACTER_KEY]: JSON.stringify('Pensionierter Skilehrer aus Klosters') });
  const session = () => ({ minutes: 47, minute: 870, season: 'winter', day: 3, touch: false, modes: [{ kind: 'ski', minutes: 30, km: 12.3 }], events: [{ mission: 'ski-slalom', outcome: 'failed', seconds: 41, medal: null }] });
  const text = await personalText({ def, title: 'Slalom auf der Davos Vertical', briefing, moment: 'intro', entry, figure: 'Kapuzenpulli', lang: 'de' }, { fetcher, storage, cache: memory(), token: async () => 'tok', session });
  assert.equal(text, 'Dritter Anlauf.');
  assert.match(seen.url, /\/functions\/v1\/mission-text$/);
  assert.equal(seen.init.headers.authorization, 'Bearer tok');
  const req = cleanRequest(JSON.parse(seen.init.body));
  assert.equal(req.mission, 'ski-slalom');
  assert.equal(req.title, 'Slalom auf der Davos Vertical');
  assert.equal(req.briefing, briefing);
  assert.equal(req.character, 'Pensionierter Skilehrer aus Klosters');
  assert.equal(req.figure, 'Kapuzenpulli');
  assert.deepEqual(req.entry, { runs: 3, medal: 'bronze', bestMs: 85450, bestScore: null });
  assert.deepEqual(req.session, session());
});

test('a result goes with its numbers and extra lines and is accepted by the function', () => {
  const body = requestBody({ def, briefing: 'Done.', summary: ['2 gates missed'], moment: 'finish', lang: 'en', entry, result: { total: 74000.4, score: null, previous: 85450, improved: true, award: { medal: 'silver', firstClear: false } } });
  const req = cleanRequest(JSON.parse(JSON.stringify(body)));
  assert.deepEqual(req.result, { total: 74000, score: null, previous: 85450, medal: 'silver', improved: true, firstClear: false });
  assert.deepEqual(req.summary, ['2 gates missed']);
});

test('a briefing opened again asks no second time, until the history or the character changes; a result always asks', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return { ok: true, json: async () => ({ text: `text ${calls}` }) }; };
  const storage = signedIn();
  const deps = { fetcher, storage, cache: memory(), token: async () => 't', session: noSession };
  const ask = (over = {}) => personalText({ def, briefing, moment: 'intro', entry, lang: 'de', ...over }, deps);
  assert.equal(await ask(), 'text 1');
  assert.equal(await ask(), 'text 1');
  assert.equal(await ask({ lang: 'en' }), 'text 2');
  assert.equal(await ask({ entry: { ...entry, runs: 4 } }), 'text 3');
  rememberCharacter('Bergführerin', storage);
  assert.equal(await ask(), 'text 4');
  assert.equal(cacheKey({ def, moment: 'finish', lang: 'de', entry }), null);
  assert.equal(calls, 4);
});

test('anything that goes wrong is no text', async () => {
  const deps = (fetcher, token = async () => 't') => ({ fetcher, storage: signedIn(), cache: memory(), token, session: noSession });
  const ask = (d) => personalText({ def, briefing, moment: 'intro', entry, lang: 'de' }, d);
  assert.equal(await ask(deps(async () => ({ ok: false, status: 429 }))), null);
  assert.equal(await ask(deps(async () => { throw new Error('offline'); })), null);
  assert.equal(await ask(deps(ok(''))), null);
  assert.equal(await ask(deps(ok(42))), null);
  assert.equal(await ask(deps(ok('x'), async () => null)), null);
  assert.equal(await ask(deps(ok('x'), async () => { throw new Error('sdk'); })), null);
});

test('this visit: the ways of travel by time and the last missions', () => {
  for (let i = 0; i < 10; i++) noteMission(`mission-${i}`, i % 2 ? 'finished' : 'failed', 41500, i % 2 ? 'gold' : null);
  const visit = { startedAt: 0, playMs: 47 * 60000, modes: { walk: { ms: 120000, m: 150 }, ski: { ms: 1800000, m: 12340 } } };
  const s = sessionFacts({ session: visit, clock: { minute: 870.6, season: 'winter', day: 3 }, touch: true });
  assert.equal(s.minutes, 47);
  assert.equal(s.minute, 870, 'the game\'s clock');
  assert.equal(s.season, 'winter');
  assert.equal(s.hour, undefined, 'the wall clock is not sent');
  assert.equal(s.touch, true);
  assert.deepEqual(s.modes, [{ kind: 'ski', minutes: 30, km: 12.3 }, { kind: 'walk', minutes: 2, km: 0.2 }]);
  assert.equal(s.events.length, 8);
  assert.deepEqual(s.events.at(-1), { mission: 'mission-9', outcome: 'finished', seconds: 42, medal: 'gold' });
  assert.deepEqual(cleanRequest({ mission: 'a', title: 't', briefing: 'b', lang: 'de', moment: 'intro', session: s }).session, s, 'as the function takes it');
});

test('the game counts this visit beside the device\'s totals', () => {
  let t = 1000;
  const stats = createPlayStats({ storage: memory(), now: () => t, target: {} });
  stats.tick(1, 'ski', { x: 0, y: 0, z: 0 });
  t += 1000;
  stats.tick(1, 'ski', { x: 10, y: 0, z: 0 });
  const visit = currentSession();
  assert.equal(visit.playMs, 2000);
  assert.equal(Math.round(visit.modes.ski.m), 10);
  assert.equal(visit.startedAt, 1000);
});

test('the character: the player\'s own words, short, with the figure in the cloud save', () => {
  const storage = memory();
  assert.equal(readCharacter(storage), '');
  assert.equal(rememberCharacter('  Pensionierter\nSkilehrer   aus Klosters ', storage), 'Pensionierter Skilehrer aus Klosters');
  assert.equal(storage.getItem(CHARACTER_KEY), '"Pensionierter Skilehrer aus Klosters"');
  assert.equal(readCharacter(storage), 'Pensionierter Skilehrer aus Klosters');
  assert.equal(cleanCharacter('x'.repeat(500)).length, CHARACTER_MAX);
  rememberCharacter('', storage);
  assert.equal(storage.getItem(CHARACTER_KEY), null);
  assert.equal(readCharacter(memory({ [CHARACTER_KEY]: 'not json' })), '');
  assert.equal(WORLD_KEYS.character, CHARACTER_KEY);
});

test('the language is the page\'s', () => {
  assert.equal(pageLanguage({ documentElement: { lang: 'de-CH' } }), 'de');
  assert.equal(pageLanguage({ documentElement: { lang: 'en' } }), 'en');
  assert.equal(pageLanguage(null), 'en');
});
