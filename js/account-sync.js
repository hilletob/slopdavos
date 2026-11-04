import { SUPABASE_URL, SUPABASE_KEY } from './account-config.js';
import { getClient, SESSION_KEY } from './account.js';
import { readLocalSave, readWorld, mergeSaves, mergeProgress, mergeBestTimes, applySave, canonical, fromRow, ownedByOther, OWNER_KEY, WORLD_AT_KEY } from './account-merge.js';

// js/account-sync.js
// The cloud save of a signed-in player, loaded only for one. Nothing here may stand in the game's way: every failure ends
// in the game going on from this device's storage, and the next sync picks up what is missing.
// - Before the start (js/start.js): the cloud's save goes into localStorage, where the game reads it.
// - While playing: progress soon after it changes (only ever a merge, guarded by the row's `rev`), the world every minute
//   and when the page goes away, never during a mission (it holds the clock at its own time).

const COLUMNS = 'progress,best_times,world,world_at,rev';
const WORLD_EVERY = 60000; // ms
const PROGRESS_DELAY = 3000; // ms
const WRITE_TRIES = 3;
const KEEPALIVE_LIMIT = 60000; // bytes (browsers refuse more)
// (these debug switches move the clock; such a session's world is not the player's)
const DEBUG_SWITCHES = /[?&](time|winter|summer|mission)\b/;

async function sessionUser() {
  const supabase = await getClient();
  const { data } = await supabase.auth.getSession();
  return { supabase, user: data.session?.user ?? null };
}

const fetchRow = async (supabase, userId) => {
  const { data, error } = await supabase.from('saves').select(COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
};

/** Progress and best times of this device into the cloud's row (a first row takes the world along too) */
async function writeSave(supabase, userId, storage = localStorage) {
  for (let i = 0; i < WRITE_TRIES; i++) {
    const row = await fetchRow(supabase, userId);
    const local = readLocalSave(storage);
    const progress = mergeProgress(local.progress, row?.progress);
    const bestTimes = mergeBestTimes(local.bestTimes, row?.best_times);
    applySave(storage, { progress, bestTimes, worldFrom: 'local' });
    if (!row) {
      const at = local.world ? (local.worldAt || Date.now()) : null;
      const { error } = await supabase.from('saves').insert({ user_id: userId, progress, best_times: bestTimes, world: local.world, world_at: at });
      if (!error) {
        if (at) storage.setItem(WORLD_AT_KEY, JSON.stringify(at));
        return fromRow({ world_at: at });
      }
      if (error.code !== '23505') throw error; // (another device made the row just now: once more)
      continue;
    }
    if (canonical(progress) === canonical(mergeProgress(row.progress, null)) && canonical(bestTimes) === canonical(mergeBestTimes(row.best_times, null))) return fromRow(row);
    const { data, error } = await supabase.from('saves').update({ progress, best_times: bestTimes, rev: row.rev + 1 })
      .eq('user_id', userId).eq('rev', row.rev).select('rev');
    if (error) throw error;
    if (data.length) return fromRow(row);
  }
  throw new Error('the save kept changing');
}

/** js/start.js: the cloud's save into this device's storage. Nothing is written once `signal` has aborted: the game has started */
export async function pullBeforeStart(signal) {
  const { supabase, user } = await sessionUser();
  if (!user || ownedByOther(localStorage, user.id)) return;
  const row = await fetchRow(supabase, user.id);
  if (signal?.aborted) return;
  applySave(localStorage, mergeSaves(readLocalSave(localStorage), fromRow(row)));
  localStorage.setItem(OWNER_KEY, user.id);
}

function pushWorld(userId) {
  const world = readWorld(localStorage);
  let token = null;
  try { token = JSON.parse(localStorage.getItem(SESSION_KEY))?.access_token; } catch { /* */ }
  if (!world || !token) return Promise.resolve(false);
  const at = Date.now();
  const body = JSON.stringify({ world, world_at: at });
  localStorage.setItem(WORLD_AT_KEY, JSON.stringify(at));
  // A plain request: the page may be on its way out, and the SDK would first wait for its locks. The filter leaves a newer
  // world from another device in place.
  const query = `user_id=eq.${encodeURIComponent(userId)}&or=(world_at.lt.${at},world_at.is.null)`;
  return fetch(`${SUPABASE_URL}/rest/v1/saves?${query}`, {
    method: 'PATCH',
    keepalive: body.length < KEEPALIVE_LIMIT,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body
  }).then((response) => response.ok, () => false);
}

/**
 * The sync while playing.
 * @param {object} o
 * @param {() => void} o.save writes the player and the clock to localStorage
 * @param {() => boolean} o.missionActive
 * @param {{ subscribe: (fn: () => void) => () => void }} o.progress
 * @param {(state: 'saved' | 'failed') => void} o.onStatus
 * @returns {Promise<{ flush: () => Promise<void>, stop: () => void } | null>}
 */
export async function startSync({ save, missionActive, progress, onStatus }) {
  const { supabase, user } = await sessionUser();
  if (!user || ownedByOther(localStorage, user.id)) return null;
  const userId = user.id;
  let timer = null;
  // The start did not wait for a slow network, and another device has played since: this device's world must not overwrite
  // that one. The next start loads it.
  let worldHeld = false;

  const syncSave = () => writeSave(supabase, userId).then((remote) => {
    if (remote && remote.worldAt > readLocalSave(localStorage).worldAt) worldHeld = true;
    onStatus('saved');
  }, () => onStatus('failed'));

  const syncWorld = async () => {
    if (worldHeld || missionActive() || DEBUG_SWITCHES.test(location.search)) return;
    try { save(); } catch { /* (the last saved state goes then) */ }
    onStatus(await pushWorld(userId) ? 'saved' : 'failed');
  };

  await syncSave();
  localStorage.setItem(OWNER_KEY, userId);

  const unsubscribe = progress?.subscribe?.(() => {
    clearTimeout(timer);
    timer = setTimeout(syncSave, PROGRESS_DELAY);
  });
  const interval = setInterval(syncWorld, WORLD_EVERY);
  const onHidden = () => { if (document.hidden) syncWorld(); };
  document.addEventListener('visibilitychange', onHidden);
  addEventListener('pagehide', syncWorld);

  return {
    flush: async () => { clearTimeout(timer); await syncWorld(); await syncSave(); },
    stop: () => {
      clearTimeout(timer);
      clearInterval(interval);
      unsubscribe?.();
      document.removeEventListener('visibilitychange', onHidden);
      removeEventListener('pagehide', syncWorld);
    }
  };
}

