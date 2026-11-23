import { MINUTES_PER_DAY, YEAR_DAYS, dayOf, minuteOfDay, seasonAt, seasonOfDay, formatClock, nextSeasonDay, realSecondsBetween, winterBlendAt } from './game-clock.js';
import { presetMinute } from './day-cycle.js';
import { sunHeight, solarNoon, CIVIL_HEIGHT } from './solar.js';
import { msg } from './messages.js';

// js/mission-windows.js
// When a mission can be started from its pin: a season (its def.season, null all year) and a state of the sun that follows
// from its def.time (and def.nightTime). By the sun, not by the hour: an evening at 18:00 is dark in winter and broad
// daylight in summer. No three.js and no DOM in here (tests/mission-windows.test.mjs runs all the missions). Wide on purpose,
// nothing is rare: outside the window the pin is grey and says when it opens, the list's "Wait until then" fast-forwards to
// it, and a link (?mission=<id>) always starts directly, moving the clock.

const NIGHT = (h) => h < CIVIL_HEIGHT;
// Each time of day's test: `h` the sun's height (deg), `m` the clock's minute, `noon` solar noon's
export const SUN_WINDOWS = {
  midday: (h) => h >= 10, // the sun well up
  golden: (h) => h >= -3 && h < 22, // low, morning and evening; winter's whole short day but for noon
  morning: (h, m, noon) => h >= CIVIL_HEIGHT && m < noon - 60, // from dawn until an hour before noon
  twilight: (h) => h >= -10 && h < 12, // dawn and dusk
  evening: (h, m, noon) => (m > noon && h < 5) || m < 120, // from just before sunset until 02:00
  predawn: (h) => h < 0, // the summer's night, until just before the sun: you set out in the dark
  midnight: NIGHT,
  night: NIGHT
};

// The sun a mission goes by: its own season's where it has one, so that its window is the same on the thaw's day
const blendFor = (def, total) => (def.season === 'winter' ? 1 : def.season === 'summer' ? 0 : winterBlendAt(total));
const seasonFits = (def, total) => !def.season || seasonAt(total) === def.season;
const dayTest = (def) => SUN_WINDOWS[def.time] || SUN_WINDOWS.golden;
const nightTest = (def) => (def.nightTime ? SUN_WINDOWS[def.nightTime] || NIGHT : null);
const passes = (test, def, total) => {
  const w = blendFor(def, total), m = minuteOfDay(total);
  return test(sunHeight(m, w), m, solarNoon(w));
};

/** { season, time, nightTime } of a mission, with the tests that apply */
export const missionWindow = (def) => ({ season: def.season || null, test: dayTest(def), nightTest: nightTest(def) });

/** The mission's night variant is what a start now would be */
export function nightVariantOpen(def, total) {
  const night = nightTest(def);
  return !!night && seasonFits(def, total) && passes(night, def, total);
}

/** The mission can be started from its pin at this time */
export function missionOpen(def, total) {
  return seasonFits(def, total) && (passes(dayTest(def), def, total) || nightVariantOpen(def, total));
}

/** When it next opens, to the game minute: `total` itself if it is open now */
export function nextOpening(def, total) {
  if (missionOpen(def, total)) return total;
  const STEP = 10;
  const end = total + (YEAR_DAYS + 1) * MINUTES_PER_DAY;
  let t = Math.floor(total), last = total;
  while (t < end) {
    // (out of season: on to the season's first day)
    if (!seasonFits(def, t)) { t = nextSeasonDay(t, def.season); last = t - 1; if (missionOpen(def, t)) return t; continue; }
    t += STEP;
    if (missionOpen(def, t)) {
      let lo = Math.max(last, t - STEP), hi = t;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (missionOpen(def, mid)) hi = mid; else lo = mid;
      }
      return hi;
    }
    last = t;
  }
  return end;
}

/** What a closed mission says: { kind: 'time', at: '18:00' } or { kind: 'season', season, days }; null when it is open */
export function closedInfo(def, total) {
  if (missionOpen(def, total)) return null;
  const next = nextOpening(def, total);
  const days = dayOf(next) - dayOf(total);
  if (def.season && (days >= 2 || seasonAt(total) !== def.season)) return { kind: 'season', season: def.season, days };
  return { kind: 'time', at: formatClock(next) };
}

/** "Opens at 18:00" / "In summer: in 3 days" (with their German, js/messages.js); '' when it is open */
export function closedText(def, total) {
  const info = closedInfo(def, total);
  if (!info) return '';
  if (info.kind === 'time') return msg('Opens at {at}', 'Öffnet um {at}', { at: info.at });
  return msg('In {season}: in {days} day{s}', (p) => `Im ${p.season === 'winter' ? 'Winter' : 'Sommer'}: in ${p.days} ${p.days === 1 ? 'Tag' : 'Tagen'}`,
    { season: info.season, days: info.days, s: info.days === 1 ? '' : 's' });
}

/**
 * Where the clock stands for a run of the mission: its own time of day (def.time, the night variant's def.nightTime, by the
 * sun of that season) on the nearest day of its season, which may be a little back (the mission's look comes first; the
 * clock goes on from there).
 */
export function missionClockTime(def, night, total) {
  const id = night && def.nightTime ? def.nightTime : def.time;
  const minuteOn = (d) => {
    const dayStart = d * MINUTES_PER_DAY;
    // (without a season of its own the mission has the sun of that moment, which on the thaw's day depends on the moment)
    let m = presetMinute(id, blendFor(def, dayStart + 720)) ?? presetMinute('golden', blendFor(def, dayStart + 720));
    if (!def.season) for (let i = 0; i < 4; i++) m = presetMinute(id, winterBlendAt(dayStart + m)) ?? presetMinute('golden', winterBlendAt(dayStart + m));
    return m;
  };
  const today = dayOf(total);
  const fits = (d) => !def.season || seasonOfDay(((d % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS) === def.season;
  let best = null;
  for (const d of [today, today + 1, today - 1]) {
    if (d < 0 || !fits(d)) continue;
    const t = d * MINUTES_PER_DAY + minuteOn(d);
    if (d < today && total - t > MINUTES_PER_DAY / 2) continue; // (back a few hours, not into yesterday's other season)
    if (best === null || Math.abs(t - total) < Math.abs(best - total)) best = t;
  }
  if (best !== null) return best;
  const next = nextSeasonDay(total, def.season);
  return next + minuteOn(dayOf(next));
}

/** The share of a game year the mission is open, by the clock's minutes (`game`) and in real time (`real`: the night is quicker) */
export function yearShare(def) {
  let game = 0, real = 0;
  const year = YEAR_DAYS * MINUTES_PER_DAY;
  for (let t = 0; t < year; t += 5) {
    if (!missionOpen(def, t)) continue;
    game += 5;
    real += realSecondsBetween(t, t + 5);
  }
  return { game: game / year, real: real / (YEAR_DAYS * 1440) };
}

/**
 * The list's order (js/missions.js): what is still to do and open now first, then what is still to do but needs the clock
 * moved (the soonest first), last what is done (what is open now before the rest). `isDone(def)`: the mission is
 * completed; `distance(def)` (m, optional): within a group, and among those that open at the same time, the nearest
 * first — without it the missions keep their order
 */
export function listGroups(missions, total, isDone, distance = null) {
  const now = [], later = [], done = [];
  for (const def of missions) {
    const open = missionOpen(def, total);
    const row = { def, open, opens: open ? total : nextOpening(def, total), distance: distance ? distance(def) : 0 };
    (isDone(def) ? done : open ? now : later).push(row);
  }
  const near = (a, b) => a.distance - b.distance;
  now.sort(near);
  later.sort((a, b) => a.opens - b.opens || near(a, b));
  done.sort((a, b) => (b.open ? 1 : 0) - (a.open ? 1 : 0) || near(a, b));
  return { now, later, done };
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** The search of the list: every word of `query` is in one of `texts` (case and accents don't count: "flamm" finds Flämmli) */
export function searchMatches(query, texts) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = texts.map(fold).join(' \n ');
  return words.every((w) => hay.includes(w));
}
