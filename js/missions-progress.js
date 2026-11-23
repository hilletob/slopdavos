import { readBestTimes } from './missions-data.js';
import { msg } from './messages.js';
import { KEYS } from './storage-keys.js';

// js/missions-progress.js
// The player's progress through the missions: medals, points and where the missions start in the open world. No
// three.js and no DOM in here (tests/missions-progress.test.mjs drives it with an in-memory storage).
//
// Points: a mission's first completion earns FIRST_CLEAR_POINTS, its best medal MEDAL_POINTS on top. Only the best
// medal a mission ever earned counts (a slower run or the same medal again earns nothing: no farming); the day and night
// variants share one entry. Stored in localStorage under PROGRESS_KEY, versioned:
//   { v: 1, missions: { [id]: { medal: 'gold' | 'silver' | 'bronze' | null, bestMs, bestScore?, runs, at (ms since 1970) } } }
// A mission with `scoreMode: true` is judged by its points instead (def.score(state), higher is better): its medals are
// the lowest score for each medal, its entry keeps the best score (bestScore) beside the time of that run.
// (an older or unreadable entry starts afresh, seeded from the best times js/missions-data.js kept before points came)
// Licences, beside the missions: `licences: { [id]: at (ms since 1970) }` (only there once one is held): a mission's exam
// passed (def.licence, js/missions.js finish()) opens something in the open world for good, e.g. 'paraglider': the free
// flight (js/paraglide-free.js). They go with the progress into the cloud save (js/account-merge.js) and count no points.

export const PROGRESS_KEY = KEYS.progress;
export const PROGRESS_VERSION = 1;
export const MEDALS = ['bronze', 'silver', 'gold']; // worst to best
export const MEDAL_POINTS = { bronze: 100, silver: 250, gold: 500 };
export const FIRST_CLEAR_POINTS = 250;
export const MEDAL_COLOURS = { none: '#8b93a1', bronze: '#c8814a', silver: '#cfd6df', gold: '#ffc83d' };
export const MEDAL_LABELS = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

/** 0 for no medal, 1 bronze, 2 silver, 3 gold */
export const medalRank = (medal) => MEDALS.indexOf(medal) + 1;

/** The medal a time earns against the mission's limits { gold, silver, bronze } (ms, a time up to the limit counts);
 *  `scoreMode`: a score against the lowest score for each medal (a score from the limit up counts) */
export function medalFor(ms, medals, scoreMode = false) {
  if (!medals || !Number.isFinite(ms)) return null;
  for (const m of ['gold', 'silver', 'bronze']) if (Number.isFinite(medals[m]) && (scoreMode ? ms >= medals[m] : ms <= medals[m])) return m;
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

const LICENCE_KEY = /^[a-z][a-z0-9-]{0,23}$/;
/** The licences of a stored progress, tidied (anything odd is dropped); null for none */
export function cleanLicences(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [id, at] of Object.entries(raw)) if (LICENCE_KEY.test(id) && Number.isFinite(at) && at >= 0) out[id] = at;
  return Object.keys(out).length ? out : null;
}
/** Whether the progress holds the licence `id` */
export const hasLicence = (progress, id) => Number.isFinite(progress?.licences?.[id]);
/** The licence `id` granted: { progress (new; the old one is left as it was), first (not held before) } */
export function grantLicence(progress, id, now = 0) {
  if (hasLicence(progress, id)) return { progress, first: false };
  return { progress: { ...progress, licences: { ...(progress.licences || {}), [id]: now } }, first: true };
}

export function totalPoints(progress) {
  let sum = 0;
  for (const entry of Object.values(progress?.missions || {})) sum += entryPoints(entry);
  return sum;
}

/** What all the missions together are worth (everything in gold) */
export const maxPoints = (missions) => missions.length * (FIRST_CLEAR_POINTS + MEDAL_POINTS.gold);

/** A fresh progress from the best times (KEYS.bestTimes: { [id or id@variant]: ms }) */
export function progressFromBestTimes(best, missions) {
  const progress = emptyProgress();
  for (const def of missions) {
    if (def.scoreMode) continue; // (judged by points: no best time to seed from)
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
        ...(Number.isFinite(e.bestScore) ? { bestScore: e.bestScore } : {}),
        runs: Number.isFinite(e.runs) ? e.runs : 1,
        at: Number.isFinite(e.at) ? e.at : 0
      };
    }
    const licences = cleanLicences(raw.licences);
    if (licences) progress.licences = licences;
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
 * (a scoreMode mission: `score` is what the medal goes by, the run's time is kept as bestMs alongside)
 */
export function recordCompletion(progress, def, ms, now = 0, score = null) {
  const prev = progress.missions[def.id] || null;
  const scored = !!def.scoreMode && Number.isFinite(score);
  const medal = scored ? medalFor(score, missionMedals(def), true) : def.scoreMode ? null : medalFor(ms, missionMedals(def));
  const bestMedal = medalRank(medal) > medalRank(prev?.medal) ? medal : (prev?.medal ?? null);
  const entry = {
    medal: bestMedal,
    bestMs: prev && Number.isFinite(prev.bestMs) ? Math.min(prev.bestMs, ms) : ms,
    runs: (prev?.runs || 0) + 1,
    at: now
  };
  if (scored || Number.isFinite(prev?.bestScore)) entry.bestScore = Math.max(scored ? score : -Infinity, prev?.bestScore ?? -Infinity);
  const next = { v: PROGRESS_VERSION, missions: { ...progress.missions, [def.id]: entry } };
  if (progress.licences) next.licences = progress.licences;
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
    record(def, ms, now = Date.now(), score = null) {
      const { progress: next, award } = recordCompletion(progress, def, ms, now, score);
      progress = next;
      saveProgress(storage, progress);
      for (const fn of listeners) fn(progress, award, def);
      return award;
    },
    /** Whether the licence `id` is held (also one a cloud save has written into storage since the start) */
    hasLicence(id) {
      if (hasLicence(progress, id)) return true;
      const stored = readProgress(storage);
      if (!hasLicence(stored, id)) return false;
      progress = { ...progress, licences: { ...(progress.licences || {}), ...stored.licences } };
      return true;
    },
    /** The licence `id` earned: kept and saved; { first } (false: held before) */
    grantLicence(id, now = Date.now()) {
      if (this.hasLicence(id)) return { first: false };
      ({ progress } = grantLicence(progress, id, now));
      saveProgress(storage, progress);
      for (const fn of listeners) fn(progress, null, null);
      return { first: true };
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

// --- The words of the medals, the points and the bests in the missions' dialogs and pins (with their German,
// js/messages.js); `kind` is 'time' or 'score', the values as js/missions.js writes them out
export const medalText = (medal) => msg('{medal} medal', (p, tr) => `${tr(p.medal)}medaille`, { medal: MEDAL_LABELS[medal] });
export const medalLimitText = (medal, limit) => msg('{medal} {limit}', '{medal|t} {limit|t}', { medal: MEDAL_LABELS[medal], limit });
export const bestMedalText = (medal) => msg('{medal} · best medal', '{medal|t} · beste Medaille', { medal: MEDAL_LABELS[medal] });
export const noMedalYetText = () => msg('Completed · no medal yet', 'Abgeschlossen · noch keine Medaille');
export const pointsOfText = (n) => msg('of {n} points', 'von {n} Punkten', { n });
export const stepsText = (n) => msg('{n} steps', '{n} Schritte', { n });
export const timeText = (v) => msg('Time {v}', 'Zeit {v}', { v });
export const bestText = (kind, v) => (kind === 'time' ? msg('Best time {v}', 'Bestzeit {v}', { v }) : msg('Best score {v}', 'Bestwert {v|t}', { v }));
export const firstBestText = (kind) => msg('First best {kind}', (p) => (p.kind === 'time' ? 'Erster Zeitwert' : 'Erster Punktestand'), { kind });
export const newBestText = (kind, v, old) => msg('New best {kind} {v} (was {old})', (p, tr) => `${p.kind === 'time' ? 'Neuer Zeitrekord' : 'Neuer Punkterekord'} ${tr(p.v)} (vorher ${tr(p.old)})`, { kind, v, old });
/** The end panel's line under the medal: "first completion +250 · Silver +300", or why there are no new points */
export function awardNotesText(award) {
  const notes = [];
  if (award.firstClear) notes.push(msg('first completion +{n}', 'erster Abschluss +{n}', { n: FIRST_CLEAR_POINTS }));
  if (award.medalUp && award.medal) notes.push(msg('{medal} +{n}', '{medal|t} +{n}', { medal: MEDAL_LABELS[award.medal], n: MEDAL_POINTS[award.medal] - (MEDAL_POINTS[award.previousMedal] || 0) }));
  if (!award.points) notes.push(award.bestMedal ? msg('you hold {medal}: no new points', '{medal|t} bleibt dein Bestwert: keine neuen Punkte', { medal: MEDAL_LABELS[award.bestMedal] }) : 'no new points');
  // (one part: that one; several: one line of their Germans, which must not be made under the text of a part itself)
  return notes.length === 1 ? notes[0] : msg(notes.join(' · '), (p, tr) => p.notes.map(tr).join(' · '), { notes });
}
