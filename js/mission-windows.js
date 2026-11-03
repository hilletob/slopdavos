import { MINUTES_PER_DAY, YEAR_DAYS, dayOf, minuteOfDay, seasonAt, seasonOfDay, formatClock, nextSeasonDay, realSecondsBetween } from './game-clock.js';
import { TIME_MINUTES } from './day-cycle.js';

// js/mission-windows.js
// When a mission can be started from its pin: a season (its def.season, null all year) and hours of the day that follow from
// its def.time (and def.nightTime). No three.js and no DOM in here (tests/mission-windows.test.mjs runs all the missions).
// Wide on purpose, nothing is rare: outside the window the pin is grey and says when it opens, the list's "Wait until then"
// fast-forwards to it, and a link (?mission=<id>) always starts directly, moving the clock.

// The hours of each time of day: [from, to), `to` below `from` running past midnight
export const TIME_WINDOWS = {
  midday: [[8, 18]],
  golden: [[6, 10], [16, 21]],
  morning: [[5, 11]],
  twilight: [[16, 22]],
  evening: [[18, 2]],
  midnight: [[20, 5]],
  night: [[20, 5]]
};

const inHours = (ranges, minute) => {
  for (let i = 0; i < ranges.length; i++) {
    const from = ranges[i][0] * 60, to = ranges[i][1] * 60;
    if (from < to ? minute >= from && minute < to : minute >= from || minute < to) return true;
  }
  return false;
};
const seasonFits = (def, total) => !def.season || seasonAt(total) === def.season;
const dayHours = (def) => TIME_WINDOWS[def.time] || TIME_WINDOWS.golden;
const nightHours = (def) => (def.nightTime ? TIME_WINDOWS[def.nightTime] || TIME_WINDOWS.midnight : null);

/** { season, hours, nightHours } of a mission */
export const missionWindow = (def) => ({ season: def.season || null, hours: dayHours(def), nightHours: nightHours(def) });

/** The mission's night variant is what a start now would be */
export function nightVariantOpen(def, total) {
  const night = nightHours(def);
  return !!night && seasonFits(def, total) && inHours(night, minuteOfDay(total));
}

/** The mission can be started from its pin at this time */
export function missionOpen(def, total) {
  if (!seasonFits(def, total)) return false;
  const m = minuteOfDay(total);
  return inHours(dayHours(def), m) || nightVariantOpen(def, total);
}

/** When it next opens: `total` itself if it is open now */
export function nextOpening(def, total) {
  if (missionOpen(def, total)) return total;
  const ranges = [...dayHours(def), ...(nightHours(def) || [])];
  let best = Infinity;
  for (let d = dayOf(total); d <= dayOf(total) + YEAR_DAYS + 1; d++) {
    for (const start of [0, ...ranges.map((r) => r[0] * 60)]) { // (00:00: a window running past midnight into the right season)
      const t = d * MINUTES_PER_DAY + start;
      if (t > total && t < best && missionOpen(def, t)) best = t;
    }
    if (best !== Infinity) break;
  }
  return best;
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
 * Where the clock stands for a run of the mission: its own time of day (def.time, the night variant's def.nightTime) on the
 * nearest day of its season, which may be a little back (the mission's look comes first; the clock goes on from there).
 */
export function missionClockTime(def, night, total) {
  const minute = TIME_MINUTES[night && def.nightTime ? def.nightTime : def.time] ?? TIME_MINUTES.golden;
  const today = dayOf(total);
  const fits = (d) => !def.season || seasonOfDay(((d % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS) === def.season;
  let best = null;
  for (const d of [today, today + 1, today - 1]) {
    if (d < 0 || !fits(d)) continue;
    const t = d * MINUTES_PER_DAY + minute;
    if (d < today && total - t > MINUTES_PER_DAY / 2) continue; // (back a few hours, not into yesterday's other season)
    if (best === null || Math.abs(t - total) < Math.abs(best - total)) best = t;
  }
  return best ?? nextSeasonDay(total, def.season) + minute;
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
