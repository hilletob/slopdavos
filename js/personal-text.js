import { SUPABASE_URL, SUPABASE_KEY } from './account-config.js';
import { getClient, hasStoredSession } from './account.js';
import { missionMedals } from './missions-progress.js';
import { currentSession } from './play-stats.js';
import { readCharacter } from './player-character.js';

// js/personal-text.js
// A mission's briefing and its closing words, written for this player by a language model
// (supabase/functions/mission-text) from the mission's own text. Only for a signed-in player who has not switched it off
// in the account menu, and loaded only then (js/missions.js imports it on demand). Nothing here stands in the game's way:
// the dialog shows the mission's own text, and the personal one takes its place when it arrives in time.
//
// The browser sends the mission's texts and numbers, this visit (how long, how the player got about, which missions) and
// the character the player wrote for themselves (js/player-character.js); the player's name, the game as a whole and the
// writer's notes about the player are read by the function from the database. The text comes back in the language asked
// for, so it is kept out of the translation (js/i18n.js: .ai-text).

export const AI_TEXT_KEY = 'slopdavos-ai-text'; // 'off': switched off in the account menu
const CACHE_KEY = 'slopdavos-ai-texts'; // (sessionStorage: a briefing opened again asks no second time)
const CACHE_MAX = 24;
const TIMEOUT = 15000; // ms
const EVENTS_MAX = 8;

/** The language the page shows (js/i18n.js sets it on the document; not imported: that module needs a DOM) */
export const pageLanguage = (doc = globalThis.document) => (String(doc?.documentElement?.lang || '').startsWith('de') ? 'de' : 'en');

export function aiTextOn(storage = globalThis.localStorage) {
  if (!SUPABASE_URL || !hasStoredSession(storage)) return false;
  try { return storage.getItem(AI_TEXT_KEY) !== 'off'; } catch { return false; }
}
export function setAiText(on, storage = globalThis.localStorage) {
  try { if (on) storage.removeItem(AI_TEXT_KEY); else storage.setItem(AI_TEXT_KEY, 'off'); } catch { /* (private mode) */ }
}

// The missions of this visit (js/missions.js notes each end): what the writer knows of the day so far
const events = [];
/** `outcome`: 'finished' | 'failed' | 'aborted', `ms`: the run's time, `medal`: the medal a finished run earned */
export function noteMission(id, outcome, ms = null, medal = null) {
  events.push({ mission: id, outcome, seconds: Number.isFinite(ms) ? Math.round(ms / 1000) : null, medal });
  if (events.length > EVENTS_MAX) events.shift();
}

/** This visit for the request: minutes played, the ways of travel by time, the missions so far */
export function sessionFacts({ session = currentSession(), now = Date.now(), log = events, touch = !!globalThis.document?.body?.classList?.contains('touch-enabled') } = {}) {
  const modes = Object.entries(session?.modes || {})
    .map(([kind, m]) => ({ kind, minutes: Math.round(m.ms / 6000) / 10, km: Math.round(m.m / 100) / 10 }))
    .sort((a, b) => b.minutes - a.minutes).slice(0, 6);
  return {
    minutes: Math.round((session?.playMs || 0) / 60000),
    hour: new Date(now).getHours(),
    touch,
    modes,
    events: log.slice(-EVENTS_MAX)
  };
}

/** A briefing's text is kept until the player's history with the mission or their character changes; a result's never */
export function cacheKey({ def, moment, lang, entry, character = '' }) {
  if (moment !== 'intro') return null;
  return [def.id, lang, entry?.runs || 0, entry?.medal || '-', Math.round(entry?.bestMs ?? -1), Math.round(entry?.bestScore ?? -1), character].join('|');
}

/** What the function is asked. `briefing`: the mission's own text as the page shows it, `summary`: the result's extra lines */
export function requestBody({ def, title = def.title, briefing, summary = [], moment, lang, entry = null, result = null, character = '', figure = '', session = null }) {
  const body = { mission: def.id, title, briefing, lang, moment, scoreMode: !!def.scoreMode, medals: missionMedals(def) || {} };
  if (entry) body.entry = { runs: entry.runs, medal: entry.medal, bestMs: entry.bestMs, bestScore: entry.bestScore ?? null };
  if (moment === 'finish' && result) {
    body.result = {
      total: Math.round(result.total), score: Number.isFinite(result.score) ? result.score : null,
      previous: Number.isFinite(result.previous) ? result.previous : null,
      medal: result.award?.medal ?? null, improved: !!result.improved, firstClear: !!result.award?.firstClear
    };
    if (summary.length) body.summary = summary;
  }
  if (character) body.character = character;
  if (figure) body.figure = figure;
  if (session) body.session = session;
  return body;
}

const readCache = (storage) => { try { return JSON.parse(storage?.getItem(CACHE_KEY) || '{}') || {}; } catch { return {}; } };
function writeCache(storage, key, text) {
  const cache = readCache(storage);
  delete cache[key];
  cache[key] = text;
  const keys = Object.keys(cache);
  for (const old of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete cache[old];
  try { storage?.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* (full or private) */ }
}

async function sessionToken() {
  const supabase = await getClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

/**
 * The text for `def` at `moment` ('intro' | 'finish'), or null: switched off, signed out, over the day's allowance, the
 * function out of reach, or an answer it would not pass on. `title`, `briefing`, `summary`, `figure`: the mission's own
 * texts and the figure's label as the page shows them; `entry`: the player's progress entry of the mission; `result`:
 * MissionRun.result at the end.
 */
export async function personalText({ def, title = def.title, briefing, summary = [], moment, entry = null, result = null, figure = '', lang = pageLanguage() },
  { fetcher = fetch, storage = globalThis.localStorage, cache = globalThis.sessionStorage, token = sessionToken, session = sessionFacts } = {}) {
  if (!aiTextOn(storage) || !briefing) return null;
  const character = readCharacter(storage);
  const key = cacheKey({ def, moment, lang, entry, character });
  if (key) { const kept = readCache(cache)[key]; if (kept) return kept; }
  try {
    const access = await token();
    if (!access) return null;
    const response = await fetcher(`${SUPABASE_URL}/functions/v1/mission-text`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify(requestBody({ def, title, briefing, summary, moment, lang, entry, result, character, figure, session: session() })),
      signal: AbortSignal.timeout(TIMEOUT)
    });
    if (!response.ok) return null;
    const { text } = await response.json();
    if (typeof text !== 'string' || !text.trim()) return null;
    if (key) writeCache(cache, key, text);
    return text;
  } catch { return null; }
}
