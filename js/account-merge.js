import { STATS_KEY } from './play-stats.js';
// js/account-merge.js
// What a cloud save is and how two of them become one. No DOM and no network (tests/account-merge.test.mjs).
// - The missions' progress and best times only ever get better, so they merge entry by entry: it does not matter in which
//   order, or how often, two devices meet.
// - The world (where the player stands, the parked vehicles, the clock, the player's figure) cannot be merged: the newer one wins, as a whole
//   (without its GTA state a player's save starts afresh, js/main.js FRESH_GTA).
// Not in a save: the Kirchner gallery (too big), the language and the sound (they belong to the device), diagnostics.

export const PROGRESS_KEY = 'slopdavos-progress';
export const BEST_KEY = 'slopdavos-mission-best';
export const WORLD_KEYS = { player: 'slopdavos-player-state', gta: 'slopdavos-gta', clock: 'slopdavos-clock', figure: 'slopdavos-figure', character: 'slopdavos-character' };
export const WORLD_AT_KEY = 'slopdavos-world-at';
export const OWNER_KEY = 'slopdavos-account-owner';

const MEDALS = ['bronze', 'silver', 'gold'];
const PROGRESS_VERSION = 1;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const isObject = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

function cleanEntry(e) {
  if (!isObject(e)) return null;
  return {
    medal: MEDALS.includes(e.medal) ? e.medal : null,
    bestMs: finite(e.bestMs) ? e.bestMs : null,
    ...(finite(e.bestScore) ? { bestScore: e.bestScore } : {}),
    runs: finite(e.runs) ? e.runs : 1,
    at: finite(e.at) ? e.at : 0
  };
}

const least = (a, b) => (a === null ? b : b === null ? a : Math.min(a, b));

function mergeEntry(a, b) {
  const entry = {
    medal: MEDALS.indexOf(b.medal) > MEDALS.indexOf(a.medal) ? b.medal : a.medal,
    bestMs: least(a.bestMs, b.bestMs),
    runs: Math.max(a.runs, b.runs), // (the most on one device, not the sum: every sync would count the runs again)
    at: Math.max(a.at, b.at)
  };
  if (finite(a.bestScore) || finite(b.bestScore)) entry.bestScore = Math.max(a.bestScore ?? -Infinity, b.bestScore ?? -Infinity);
  return entry;
}

/** Progress in the shape js/missions-progress.js stores; anything else (another version, garbage) counts as empty */
export function cleanProgress(raw) {
  const missions = {};
  if (isObject(raw) && raw.v === PROGRESS_VERSION && isObject(raw.missions)) {
    for (const [id, e] of Object.entries(raw.missions)) {
      const entry = cleanEntry(e);
      if (entry) missions[id] = entry;
    }
  }
  const licences = cleanLicences(raw?.licences);
  return licences ? { v: PROGRESS_VERSION, missions, licences } : { v: PROGRESS_VERSION, missions };
}

/** The licences (js/missions-progress.js: { [id]: at }), tidied; null for none */
function cleanLicences(raw) {
  if (!isObject(raw)) return null;
  const out = {};
  for (const [id, at] of Object.entries(raw)) if (/^[a-z][a-z0-9-]{0,23}$/.test(id) && finite(at) && at >= 0) out[id] = at;
  return Object.keys(out).length ? out : null;
}

export function mergeProgress(a, b) {
  const one = cleanProgress(a), other = cleanProgress(b);
  const missions = { ...one.missions };
  for (const [id, entry] of Object.entries(other.missions)) missions[id] = missions[id] ? mergeEntry(missions[id], entry) : entry;
  // a licence once earned on any device is held (since the earliest)
  const licences = { ...(one.licences || {}) };
  for (const [id, at] of Object.entries(other.licences || {})) licences[id] = id in licences ? Math.min(licences[id], at) : at;
  return Object.keys(licences).length ? { v: PROGRESS_VERSION, missions, licences } : { v: PROGRESS_VERSION, missions };
}

export function mergeBestTimes(a, b) {
  const best = {};
  for (const source of [a, b]) {
    if (!isObject(source)) continue;
    for (const [key, ms] of Object.entries(source)) if (finite(ms)) best[key] = key in best ? Math.min(best[key], ms) : ms;
  }
  return best;
}

/** The same content whatever the order of the keys (jsonb keeps its own) */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

function readJson(storage, key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
}

/** The world on this device: { player, gta, clock, figure } (whichever exist), or null */
export function readWorld(storage) {
  const world = {};
  for (const [name, key] of Object.entries(WORLD_KEYS)) {
    const value = readJson(storage, key);
    if (value !== null) world[name] = value;
  }
  return Object.keys(world).length ? world : null;
}

export function readLocalSave(storage) {
  const at = Number(readJson(storage, WORLD_AT_KEY));
  return {
    progress: cleanProgress(readJson(storage, PROGRESS_KEY)),
    bestTimes: mergeBestTimes(readJson(storage, BEST_KEY), null),
    world: readWorld(storage),
    worldAt: Number.isFinite(at) ? at : 0
  };
}

export const fromRow = (row) => row ? {
  progress: row.progress, bestTimes: row.best_times, world: row.world ?? null, worldAt: Number(row.world_at) || 0, rev: row.rev
} : null;

/**
 * This device's save with the one from the cloud (null: there is none yet).
 * `worldFrom`: 'remote' when the cloud's world is the newer, and so has to be written here. A guest's world carries no
 * time, so an account's existing world wins over it.
 */
export function mergeSaves(local, remote) {
  const remoteNewer = !!remote?.world && (remote.worldAt > local.worldAt || !local.world);
  return {
    progress: mergeProgress(local.progress, remote?.progress),
    bestTimes: mergeBestTimes(local.bestTimes, remote?.bestTimes),
    world: remoteNewer ? remote.world : local.world,
    worldAt: remoteNewer ? remote.worldAt : local.worldAt,
    worldFrom: remoteNewer ? 'remote' : 'local'
  };
}

function writeJson(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* (storage full or off) */ }
}

/** Into this device's storage, before the game reads it. An empty progress is not written: the game seeds a missing one */
export function applySave(storage, save) {
  if (Object.keys(save.progress.missions).length) writeJson(storage, PROGRESS_KEY, save.progress);
  if (Object.keys(save.bestTimes).length) writeJson(storage, BEST_KEY, save.bestTimes);
  if (save.worldFrom !== 'remote') return;
  for (const [name, key] of Object.entries(WORLD_KEYS)) {
    try {
      if (name in save.world) storage.setItem(key, JSON.stringify(save.world[name]));
      else storage.removeItem(key);
    } catch { /* (storage full or off) */ }
  }
  writeJson(storage, WORLD_AT_KEY, save.worldAt);
}

/** The local save belongs to another account: it must not be mixed into this one */
export function ownedByOther(storage, userId) {
  let owner = null;
  try { owner = storage.getItem(OWNER_KEY); } catch { /* */ }
  return !!owner && owner !== userId;
}

/** Forgets the save on this device (it stays in its own account's cloud save) */
export function clearLocalSave(storage) {
  for (const key of [PROGRESS_KEY, BEST_KEY, WORLD_AT_KEY, STATS_KEY, ...Object.values(WORLD_KEYS)]) {
    try { storage.removeItem(key); } catch { /* */ }
  }
}
