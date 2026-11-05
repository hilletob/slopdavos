import { SUPABASE_URL, SUPABASE_KEY } from './account-config.js';
import { getClient, hasStoredSession } from './account.js';

// js/leaderboard.js
// The leaderboards' calls (supabase/migrations/*_leaderboards.sql). Loaded only for a signed-in player's ranked mission or
// when a guest asks to see a list. Nothing here stands in the game's way: a failed call only means a run is not counted.

const TIMEOUT = 8000; // ms

export const NAME_MIN = 3;
export const NAME_MAX = 20;
const LETTER = 'A-Za-z0-9ÄÖÜäöüÉÈÊËÀÂÇÑéèêëàâçñïîôûùß';
const NAME_SHAPE = new RegExp(`^[${LETTER}][${LETTER} _-]{${NAME_MIN - 2},${NAME_MAX - 2}}[${LETTER}]$`);

export const cleanName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');
/** The server decides; this only spares a request for what it would refuse anyway */
export const nameFits = (name) => NAME_SHAPE.test(cleanName(name));

async function rpc(name, args = {}, fetcher = fetch) {
  const headers = { apikey: SUPABASE_KEY, 'content-type': 'application/json' };
  if (hasStoredSession()) {
    const supabase = await getClient();
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetcher(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers, body: JSON.stringify(args), keepalive: true, signal: AbortSignal.timeout(TIMEOUT)
  });
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return response.json();
}

/** The run's id on the server, or null when it cannot be counted */
export const startRun = (board) => rpc('start_run', { board });

/** { accepted: true, improved, rank, players, best_ms } or { accepted: false, reason } (a penalty adds to `total`) */
export const submitRun = (run, total, penalty) => rpc('submit_run', { run, total_ms: Math.round(total), penalty_ms: Math.round(penalty) });

/** The top of a list, plus the player's own line: [{ place, name, total_ms, is_me, players }] */
export const fetchBoard = (board) => rpc('board_top', { board });

/** The player's public name (one is made up on first asking) */
export const myName = () => rpc('my_profile');

/** { name } or { error: 'invalid' | 'taken' } */
export const setName = (name) => rpc('set_player_name', { new_name: name });
