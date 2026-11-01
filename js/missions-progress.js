import { readBestTimes } from './missions-data.js';

// js/missions-progress.js
// The player's progress through the missions: medals, points and where the missions start in the open world. No
// three.js and no DOM in here (tests/missions-progress.test.mjs drives it with an in-memory storage).
//
// Points: a mission's first completion earns FIRST_CLEAR_POINTS, its best medal MEDAL_POINTS on top. Only the best
// medal a mission ever earned counts (a slower run or the same medal again earns nothing: no farming); the day and night
// variants share one entry. Stored in localStorage under PROGRESS_KEY, versioned:
//   { v: 1, missions: { [id]: { medal: 'gold' | 'silver' | 'bronze' | null, bestMs, runs, at (ms since 1970) } } }
// (an older or unreadable entry starts afresh, seeded from the best times js/missions-data.js kept before points came)

export const PROGRESS_KEY = 'slopdavos-progress';
export const PROGRESS_VERSION = 1;
export const MEDALS = ['bronze', 'silver', 'gold']; // worst to best
export const MEDAL_POINTS = { bronze: 100, silver: 250, gold: 500 };
export const FIRST_CLEAR_POINTS = 250;
export const MEDAL_COLOURS = { none: '#8b93a1', bronze: '#c8814a', silver: '#cfd6df', gold: '#ffc83d' };
export const MEDAL_LABELS = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

/** 0 for no medal, 1 bronze, 2 silver, 3 gold */
export const medalRank = (medal) => MEDALS.indexOf(medal) + 1;

/** The medal a time earns against the mission's limits { gold, silver, bronze } (ms, a time up to the limit counts) */
export function medalFor(ms, medals) {
  if (!medals || !Number.isFinite(ms)) return null;
  for (const m of ['gold', 'silver', 'bronze']) if (Number.isFinite(medals[m]) && ms <= medals[m]) return m;
  return null;
}

/** The limits from a bonus time when a mission has none of its own: gold = the bonus, silver +40 %, bronze +100 %
 *  (rounded to 30 s) */
export function deriveMedals(bonusMs) {
  const r30 = (ms) => Math.round(ms / 30000) * 30000;
  return { gold: bonusMs, silver: r30(bonusMs * 1.4), bronze: r30(bonusMs * 2) };
}

export const missionMedals = (def) => def.medals || (def.bonusMs ? deriveMedals(def.bonusMs) : null);

/** The points one mission's entry is worth */
export function entryPoints(entry) {
  if (!entry) return 0;
  return FIRST_CLEAR_POINTS + (MEDAL_POINTS[entry.medal] || 0);
}

export const emptyProgress = () => ({ v: PROGRESS_VERSION, missions: {} });

export function totalPoints(progress) {
  let sum = 0;
  for (const entry of Object.values(progress?.missions || {})) sum += entryPoints(entry);
  return sum;
}

/** What all the missions together are worth (everything in gold) */
export const maxPoints = (missions) => missions.length * (FIRST_CLEAR_POINTS + MEDAL_POINTS.gold);

/** A fresh progress from the best times (slopdavos-mission-best: { [id or id@variant]: ms }) */
export function progressFromBestTimes(best, missions) {
  const progress = emptyProgress();
  for (const def of missions) {
    let ms = null;
    for (const [key, t] of Object.entries(best || {})) {
      if ((key === def.id || key.startsWith(`${def.id}@`)) && Number.isFinite(t) && (ms === null || t < ms)) ms = t;
    }
    if (ms !== null) progress.missions[def.id] = { medal: medalFor(ms, missionMedals(def)), bestMs: ms, runs: 1, at: 0 };
  }
  return progress;
}

/** The stored progress (a missing, unreadable or older one: seeded from the best times when `missions` are given) */
export function readProgress(storage, missions = null) {
  let raw = null;
  try { raw = JSON.parse(storage?.getItem(PROGRESS_KEY) || 'null'); } catch { raw = null; }
  if (raw && raw.v === PROGRESS_VERSION && raw.missions && typeof raw.missions === 'object') {
    const progress = emptyProgress();
    for (const [id, e] of Object.entries(raw.missions)) {
      if (!e || typeof e !== 'object') continue;
      progress.missions[id] = {
        medal: MEDALS.includes(e.medal) ? e.medal : null,
        bestMs: Number.isFinite(e.bestMs) ? e.bestMs : null,
        runs: Number.isFinite(e.runs) ? e.runs : 1,
        at: Number.isFinite(e.at) ? e.at : 0
      };
    }
    return progress;
  }
  return missions ? progressFromBestTimes(readBestTimes(storage), missions) : emptyProgress();
}

export function saveProgress(storage, progress) {
  try { storage?.setItem(PROGRESS_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

/**
 * A completed run of `def` in `ms`: the new progress (the old one is left as it was) and what it earned:
 * { progress, award: { points, medal (this run's), bestMedal, previousMedal, firstClear, medalUp } }
 */
export function recordCompletion(progress, def, ms, now = 0) {
  const prev = progress.missions[def.id] || null;
  const medal = medalFor(ms, missionMedals(def));
  const bestMedal = medalRank(medal) > medalRank(prev?.medal) ? medal : (prev?.medal ?? null);
  const entry = {
    medal: bestMedal,
    bestMs: prev && Number.isFinite(prev.bestMs) ? Math.min(prev.bestMs, ms) : ms,
    runs: (prev?.runs || 0) + 1,
    at: now
  };
  const next = { v: PROGRESS_VERSION, missions: { ...progress.missions, [def.id]: entry } };
  const points = entryPoints(entry) - entryPoints(prev);
  return {
    progress: next,
    award: { points, medal, bestMedal, previousMedal: prev?.medal ?? null, firstClear: !prev, medalUp: medalRank(bestMedal) > medalRank(prev?.medal) }
  };
}

/** The progress kept in `storage`, with listeners (the HUD's score, the map's pins, the markers' medal rings) */
export function createProgressStore(storage, missions) {
  let progress = readProgress(storage, missions);
  const listeners = new Set();
  return {
    get progress() { return progress; },
    get points() { return totalPoints(progress); },
    get maxPoints() { return maxPoints(missions); },
    entry(id) { return progress.missions[id] || null; },
    medal(id) { return progress.missions[id]?.medal ?? null; },
    record(def, ms, now = Date.now()) {
      const { progress: next, award } = recordCompletion(progress, def, ms, now);
      progress = next;
      saveProgress(storage, progress);
      for (const fn of listeners) fn(progress, award, def);
      return award;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}

// --- Where the missions start in the world --------------------------------------------------------------------------
export const START_RADIUS = 8; // m: the start circle round a mission's pin
export const START_HEIGHT = 20; // m: a helicopter higher above the pin than this is passing over, not arriving

/** The pin of a mission in the world: its `pin`, else where it starts (a start by teleport is resolved by `teleports`) */
export function missionPin(def, teleports = null) {
  if (def.pin) return { x: def.pin.x, z: def.pin.z };
  const s = def.start;
  const t = s.teleport && teleports ? teleports[s.teleport] : null;
  return t ? { x: t.x, z: t.z } : { x: s.x, z: s.z };
}

/** Whether the player may start `def` from its pin in the given mode: on foot, or in the vehicle the mission is about */
export const canStartIn = (def, mode) => mode === 'person' || mode === def.mode;

/**
 * The mission whose start circle the player stands in: { def, pin, d } of the nearest, or null.
 * `pins` is [{ def, x, z, y? }], `p` the player { x, z, y?, mode }; a pin with y is out of reach START_HEIGHT above it
 */
export function missionInReach(pins, p, radius = START_RADIUS) {
  let best = null;
  for (const pin of pins) {
    if (!canStartIn(pin.def, p.mode)) continue;
    const d = Math.hypot(pin.x - p.x, pin.z - p.z);
    if (d > radius) continue;
    if (Number.isFinite(pin.y) && Number.isFinite(p.y) && Math.abs(p.y - pin.y) > START_HEIGHT) continue;
    if (!best || d < best.d) best = { def: pin.def, pin, d };
  }
  return best;
}

/** The pins within `radius` of (x, z), nearest first (the markers drawn in the world, the radar's pins) */
export function pinsNear(pins, x, z, radius) {
  const out = [];
  for (const pin of pins) {
    const d = Math.hypot(pin.x - x, pin.z - z);
    if (d <= radius) out.push({ pin, d });
  }
  return out.sort((a, b) => a.d - b.d);
}
