// js/game-clock.js
// The game's own time: the day number and the time of day, and from them the season. No three.js and no DOM in here
// (tests/game-clock.test.mjs drives it); js/main.js ticks it every frame and hands what it says on to the light and the
// season every few seconds (a tick is a few float operations and allocates nothing).
//
// The time is one number: `total`, the game minutes since day 0, 00:00.
//
// The mapping: one game day takes exactly 24 real minutes (1440 s), the night (22:00-06:00) running twice as fast as the
// day. "1 game minute = 1 s by day, 0.5 s by night" alone would make a day of 960 s + 240 s = 20 min, so both rates are
// stretched by 1.2: a game minute takes 1.2 s by day (16 game hours = 19.2 min) and 0.6 s by night (8 game hours = 4.8 min).
//
// The year has 8 game days, the real calendar plays no part: days 0-3 are summer, days 4-7 winter, and the season changes
// at midnight, in the dark, which is when what only exists in one season is switched (`seasonAt`). What the eye sees is a
// separate, slow blend (`winterBlendAt`): the first snow falls and settles from 20:00 on the last summer day to 06:00 on
// the first winter day, the thaw takes the last winter day from 06:00 to 18:00.

export const MINUTES_PER_DAY = 1440;
export const NIGHT_START = 22 * 60;
export const NIGHT_END = 6 * 60;
export const DAY_SECONDS_PER_MINUTE = 1.2;
export const NIGHT_SECONDS_PER_MINUTE = 0.6;
export const REAL_SECONDS_PER_DAY = 1440;
export const YEAR_DAYS = 8;
export const SEASON_DAYS = 4;
export const YEAR_MINUTES = YEAR_DAYS * MINUTES_PER_DAY;

const SNOW_START = 20 * 60; // the last summer day: the first flakes, and the snow starts to settle
const SNOW_END = 6 * 60; // the first winter day: it lies
const THAW_START = 6 * 60; // the last winter day
const THAW_END = 18 * 60;
const FIRST_FLAKES = 30; // game minutes for the snowfall to set in, ...
const LAST_FLAKES = 60; // ... and to stop on the morning of the thaw

export const minuteOfDay = (total) => ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
export const dayOf = (total) => Math.floor(total / MINUTES_PER_DAY);
const yearDay = (day) => ((day % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
export const dayOfYear = (total) => yearDay(dayOf(total));
export const isNightMinute = (minute) => minute >= NIGHT_START || minute < NIGHT_END;
export const seasonOfDay = (dayInYear) => (dayInYear < SEASON_DAYS ? 'summer' : 'winter');
export const seasonAt = (total) => seasonOfDay(dayOfYear(total));

// (the game minutes from `m` to the next change of rate)
const toRateEdge = (m) => (isNightMinute(m) ? (m >= NIGHT_START ? MINUTES_PER_DAY - m + NIGHT_END : NIGHT_END - m) : NIGHT_START - m);

/** Where the clock stands `seconds` of real time after `total` (the rate changes at 06:00 and 22:00) */
export function advance(total, seconds) {
  let t = total, left = seconds;
  while (left > 0) {
    const m = minuteOfDay(t);
    const perMinute = isNightMinute(m) ? NIGHT_SECONDS_PER_MINUTE : DAY_SECONDS_PER_MINUTE;
    const edge = toRateEdge(m);
    const need = edge * perMinute;
    if (left < need) return t + left / perMinute;
    t += edge;
    left -= need;
  }
  return t;
}

/** The real seconds the clock takes from `from` to `to` (to >= from) */
export function realSecondsBetween(from, to) {
  let t = from, s = 0;
  while (t < to) {
    const m = minuteOfDay(t);
    const step = Math.min(toRateEdge(m), to - t);
    s += step * (isNightMinute(m) ? NIGHT_SECONDS_PER_MINUTE : DAY_SECONDS_PER_MINUTE);
    t += step;
  }
  return s;
}

/** How much snow lies (the shared `winter` uniform): 0 summer .. 1 winter, moving only during the snowfall and the thaw */
export function winterBlendAt(total) {
  const d = dayOfYear(total), m = minuteOfDay(total);
  const span = MINUTES_PER_DAY - SNOW_START + SNOW_END;
  if (d === SEASON_DAYS - 1) return m < SNOW_START ? 0 : (m - SNOW_START) / span;
  if (d === SEASON_DAYS) return m < SNOW_END ? (MINUTES_PER_DAY - SNOW_START + m) / span : 1;
  if (d === YEAR_DAYS - 1) return m < THAW_START ? 1 : m >= THAW_END ? 0 : 1 - (m - THAW_START) / (THAW_END - THAW_START);
  return d > SEASON_DAYS ? 1 : 0;
}

/** How hard it snows (js/snowfall.js): from the evening before the snow settles, all winter, until the thaw begins */
export function snowfallAt(total) {
  const d = dayOfYear(total), m = minuteOfDay(total);
  if (d === SEASON_DAYS - 1) return m < SNOW_START ? 0 : Math.min(1, (m - SNOW_START) / FIRST_FLAKES);
  if (d === YEAR_DAYS - 1) return m < THAW_START ? 1 : Math.max(0, 1 - (m - THAW_START) / LAST_FLAKES);
  return d >= SEASON_DAYS ? 1 : 0;
}

/** "07:05" */
export function formatClock(total) {
  const m = Math.floor(minuteOfDay(total));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** The next time the clock shows `minute`, strictly after `total` */
export function nextTimeOfDay(total, minute) {
  const t = dayOf(total) * MINUTES_PER_DAY + minute;
  return t > total ? t : t + MINUTES_PER_DAY;
}

/** The start (00:00) of the next day that lies in `season`, strictly after today */
export function nextSeasonDay(total, season) {
  let d = dayOf(total) + 1;
  while (seasonOfDay(yearDay(d)) !== season) d++;
  return d * MINUTES_PER_DAY;
}

/** The fast-forward's "next season": the morning (07:00) after the other season has begun */
export function nextSeasonMorning(total) {
  return nextSeasonDay(total, seasonAt(total) === 'winter' ? 'summer' : 'winter') + 7 * 60;
}

/** The fast-forward's menu: the next morning (07:00), the next evening (18:00), the next season's first morning */
export function fastForwardTarget(kind, total) {
  if (kind === 'morning') return nextTimeOfDay(total, 7 * 60);
  if (kind === 'evening') return nextTimeOfDay(total, 18 * 60);
  return nextSeasonMorning(total);
}

const STORAGE_KEY = 'slopdavos-clock';
const STORAGE_VERSION = 1;
const SAVE_EVERY = 10; // real seconds
// A first visit starts on the first summer day in the morning: the longest way to the first snow, which on the mobile
// profile also means building the winter scenery only when it is needed (js/quality.js lazyWinter)
export const FIRST_VISIT = 9 * 60;

export function createGameClock({ storage = null, key = STORAGE_KEY } = {}) {
  let total = FIRST_VISIT;
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? 'null');
    if (saved?.v === STORAGE_VERSION && Number.isFinite(saved.total) && saved.total >= 0) total = saved.total;
  } catch { /* (a first visit, or no storage) */ }
  let frozen = false; // (?time=, __slopdavos.time(): the debug switches hold the time of day)
  let held = false; // (a mission holds the clock at its time)
  let heldWinter = null; // ... and the look of its season (null: as the calendar has it)
  let dirty = true; // the time jumped: js/main.js applies it to the light at once, not at the next step
  let sinceSave = 0;

  const clock = {
    get total() { return total; },
    get minute() { return minuteOfDay(total); },
    get day() { return dayOf(total); },
    get season() { return seasonAt(total); },
    get isWinter() { return seasonAt(total) === 'winter'; },
    get winterBlend() { return heldWinter === null ? winterBlendAt(total) : heldWinter ? 1 : 0; },
    get snowfall() { return heldWinter === null ? snowfallAt(total) : heldWinter ? 1 : 0; },
    get frozen() { return frozen; },
    get held() { return held; },
    get text() { return formatClock(total); },
    /** Every frame: `seconds` of real time pass */
    tick(seconds) {
      if (frozen || held) return;
      total = advance(total, seconds);
      sinceSave += seconds;
      if (sinceSave >= SAVE_EVERY) clock.save();
    },
    /** The time jumps (the fast-forward, a mission, the debug switches) */
    jumpTo(t) {
      if (!Number.isFinite(t) || t < 0) return;
      total = t;
      dirty = true;
      clock.save();
    },
    /** The time of day, on the same day */
    setMinute(minute) { clock.jumpTo(dayOf(total) * MINUTES_PER_DAY + minute); },
    freeze(on = true) { frozen = !!on; },
    /** A mission: the clock stands still at `t`, showing its season's look ('winter' | 'summer' | null: the calendar's) */
    hold(t, season = null) {
      held = true;
      heldWinter = season === 'winter' ? true : season === 'summer' ? false : null;
      clock.jumpTo(t);
    },
    /** The mission is over: the clock goes on from where it stood */
    release() {
      if (!held) return;
      held = false;
      heldWinter = null;
      dirty = true;
    },
    /** Whether the time jumped since the last call */
    takeJump() { const d = dirty; dirty = false; return d; },
    save() {
      sinceSave = 0;
      try { storage?.setItem(key, JSON.stringify({ v: STORAGE_VERSION, total })); } catch { /* (storage full or off) */ }
    }
  };
  return clock;
}

/** The URL's debug switches: ?winter / ?summer a full day of that season (same time of day), ?time=<HH:MM|preset> holds the time */
export function applyClockSwitches(clock, search, presetMinutes = {}) {
  const q = new URLSearchParams(search || '');
  const wantWinter = q.has('winter');
  if (wantWinter || q.has('summer')) {
    const settled = clock.isWinter === wantWinter && winterBlendAt(clock.total) === (wantWinter ? 1 : 0);
    if (!settled) {
      const fullDay = wantWinter ? SEASON_DAYS + 1 : 1;
      const ahead = (fullDay - dayOfYear(clock.total) + YEAR_DAYS) % YEAR_DAYS || YEAR_DAYS;
      clock.jumpTo((clock.day + ahead) * MINUTES_PER_DAY + clock.minute);
    }
  }
  const time = q.get('time');
  if (time) {
    const hm = /^(\d{1,2}):(\d{2})$/.exec(time);
    const minute = hm ? Math.min(23, +hm[1]) * 60 + Math.min(59, +hm[2]) : presetMinutes[time];
    if (Number.isFinite(minute)) { clock.setMinute(minute); clock.freeze(true); }
  }
}

/** The clock of the page (the tests build their own with createGameClock) */
export const gameClock = createGameClock({ storage: (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })() });
