import { MINUTES_PER_DAY, YEAR_DAYS, dayOf, minuteOfDay, seasonAt, seasonOfDay, formatClock, nextSeasonDay, realSecondsBetween, winterBlendAt } from './game-clock.js';
import { presetMinute } from './day-cycle.js';
import { sunHeight, solarNoon, CIVIL_HEIGHT } from './solar.js';

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

/** "Opens at 18:00" / "In summer: in 3 days" (js/i18n.js has the German); '' when it is open */
export function closedText(def, total) {
  const info = closedInfo(def, total);
  if (!info) return '';
  if (info.kind === 'time') return `Opens at ${info.at}`;
  return `In ${info.season}: in ${info.days} day${info.days === 1 ? '' : 's'}`;
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
