import { msg } from './messages.js';
import { MINUTES_PER_DAY, SEASON_DAYS, YEAR_DAYS, dayOf, dayOfYear, minuteOfDay, seasonOfDay, snowfallAt, thawFlakesAt, thawWetAt } from './game-clock.js';

// js/weather.js
// The weather, from the game's clock alone: no three.js and no DOM in here (tests/weather.test.mjs drives it). Like the
// light, it follows `total` (the game minutes since day 0, 00:00), so after a reload and in a race everybody under the
// same clock has the same sky; js/main.js applies it with the light every few seconds.
//
// Every day draws a course of weather (a "regime", by a hash of the day's number, weighted by season) made of four slots of
// six hours: 00-06, 06-12, 12-18, 18-24. A slot's state sets the values below; between two slots they blend over the
// first TRANSITION minutes of the later one (so at the slot's start the earlier state still holds exactly, which keeps the
// calendar's snowfall in js/game-clock.js seamless). The calendar has its say: the evening before the first snow clouds
// over and the night it settles it snows (snowfallAt), the thaw day's föhn clears the sky (its slots are fixed), the
// first day of a new game is fine; in summer it never snows, in winter it never rains.

export const SLOT_MINUTES = 360;
export const SLOTS_PER_DAY = MINUTES_PER_DAY / SLOT_MINUTES;
export const TRANSITION = 90; // game minutes (a little over a real minute by day)

// What each state does: `cloud` the sky's cover, `overcast` how much of the sun it takes, `fog` the valley fog, `rain` /
// `snow` how hard it falls, `wind` 0 calm .. 1 a stiff breeze (the flakes' and the drops' drift), `storm` thunder and
// lightning (js/lightning.js)
export const WEATHER_STATES = {
  clear: { cloud: 0.12, overcast: 0, fog: 0, rain: 0, snow: 0, wind: 0.2, storm: 0 },
  fair: { cloud: 0.42, overcast: 0.08, fog: 0, rain: 0, snow: 0, wind: 0.3, storm: 0 },
  cloudy: { cloud: 0.72, overcast: 0.45, fog: 0, rain: 0, snow: 0, wind: 0.45, storm: 0 },
  overcast: { cloud: 0.95, overcast: 0.85, fog: 0.12, rain: 0, snow: 0, wind: 0.4, storm: 0 },
  fog: { cloud: 0.6, overcast: 0.65, fog: 1, rain: 0, snow: 0, wind: 0, storm: 0 },
  rain: { cloud: 1, overcast: 1, fog: 0.25, rain: 1, snow: 0, wind: 0.65, storm: 0 },
  snow: { cloud: 1, overcast: 1, fog: 0.3, rain: 0, snow: 1, wind: 0.4, storm: 0 },
  storm: { cloud: 1, overcast: 1, fog: 0.2, rain: 1, snow: 0, wind: 0.95, storm: 1 }
};
export const WEATHER_IDS = Object.keys(WEATHER_STATES);
const VALUES = ['cloud', 'overcast', 'fog', 'rain', 'snow', 'wind', 'storm'];

// The courses of a day: four slots each, with their weight in the season
const SUMMER = [
  [34, ['clear', 'clear', 'fair', 'clear']], // a fine day
  [12, ['fog', 'fog', 'fair', 'clear']], // fog in the valley in the morning, gone by noon
  [16, ['clear', 'fair', 'storm', 'cloudy']], // the afternoon's thunderstorm
  [16, ['fair', 'cloudy', 'fair', 'cloudy']], // changeable
  [10, ['overcast', 'rain', 'rain', 'overcast']], // a wet day
  [12, ['cloudy', 'overcast', 'cloudy', 'fair']] // grey
];
const WINTER = [
  [34, ['clear', 'clear', 'clear', 'clear']], // Kaiserwetter
  [12, ['fog', 'fog', 'fair', 'clear']], // the fog lies in the valley, the sun above it
  [18, ['snow', 'snow', 'overcast', 'cloudy']], // a snow day
  [14, ['fair', 'cloudy', 'overcast', 'snow']], // it comes in the evening
  [10, ['overcast', 'cloudy', 'overcast', 'cloudy']], // grey
  [12, ['cloudy', 'snow', 'cloudy', 'fair']] // flurries
];
const FIRST_DAY = ['clear', 'clear', 'fair', 'clear']; // (a new game: its first impression is a fine day)
const THAW = [null, 'fair', 'clear', 'fair']; // the föhn takes the snow (its night still the winter's)

// A day's number to 0..1 (an integer hash: the same everywhere, no Math.random)
function hash01(n) {
  let h = Math.imul(n ^ 0x5bd1e995, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function pick(list, u) {
  let sum = 0;
  for (const [w] of list) sum += w;
  let x = u * sum;
  for (const [w, slots] of list) { if (x < w) return slots; x -= w; }
  return list[list.length - 1][1];
}

/** The state of slot `slot` (0..3) of the game's day `day` (absolute, may be negative) */
export function slotState(day, slot) {
  const d = ((day % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
  if (day === 0) return FIRST_DAY[slot];
  if (d === SEASON_DAYS - 1 && slot === 3) return 'overcast'; // (it clouds over before the first snow)
  if (d === SEASON_DAYS && slot === 0) return 'snow'; // (the night the snow settles)
  if (d === YEAR_DAYS - 1 && THAW[slot]) return THAW[slot];
  return pick(seasonOfDay(d) === 'winter' ? WINTER : SUMMER, hash01(day))[slot];
}

/** A weather sample's object, to be reused (nothing is allocated per call) */
export function createWeatherSample() {
  return { id: 'clear', cloud: 0, overcast: 0, fog: 0, rain: 0, snow: 0, wet: 0, wind: 0, storm: 0 };
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// The blend of the slots alone (no calendar, no wetness)
function blendAt(total, out) {
  const day = dayOf(total), m = minuteOfDay(total);
  const slot = Math.min(SLOTS_PER_DAY - 1, Math.floor(m / SLOT_MINUTES));
  const cur = slotState(day, slot);
  const prev = slot > 0 ? slotState(day, slot - 1) : slotState(day - 1, SLOTS_PER_DAY - 1);
  const k = smooth((m - slot * SLOT_MINUTES) / TRANSITION);
  const a = WEATHER_STATES[prev], b = WEATHER_STATES[cur];
  for (const v of VALUES) out[v] = a[v] + (b[v] - a[v]) * k;
  out.id = k < 0.5 ? prev : cur;
  return out;
}

// The roads dry within this many game minutes after the rain, looked back on in steps of WET_STEP
const DRY_MINUTES = 180, WET_STEP = 15;
const _past = createWeatherSample();

/** The weather at `total` into `out` */
export function weatherAt(total, out = createWeatherSample()) {
  blendAt(total, out);
  // The calendar's snowfall (the night the first snow settles) and the thaw (no flakes once it has begun)
  const forced = snowfallAt(total);
  if (forced > out.snow) {
    out.snow = forced;
    out.cloud = Math.max(out.cloud, forced);
    out.overcast = Math.max(out.overcast, forced);
    out.fog = Math.max(out.fog, WEATHER_STATES.snow.fog * forced);
    if (forced >= 0.5) out.id = 'snow';
  }
  out.snow *= thawFlakesAt(total);
  if (out.id === 'snow' && out.snow < 0.5 && forced < 0.5) out.id = out.overcast > 0.6 ? 'overcast' : 'cloudy';
  // Wet roads: the rain of the last hours, drying as it goes; and the melt on the thaw's day
  let wet = out.rain;
  for (let back = WET_STEP; back < DRY_MINUTES && wet < 1; back += WET_STEP) {
    if (total - back < 0) break;
    const r = blendAt(total - back, _past).rain * (1 - back / DRY_MINUTES);
    if (r > wet) wet = r;
  }
  out.wet = Math.max(wet, thawWetAt(total));
  return out;
}

/** A state held as it is (the debug switches, a mission's weather): no course and no calendar */
export function fixedWeather(id, out = createWeatherSample()) {
  const s = WEATHER_STATES[id] || WEATHER_STATES.clear;
  for (const v of VALUES) out[v] = s[v];
  out.id = WEATHER_STATES[id] ? id : 'clear';
  out.wet = s.rain;
  return out;
}

/**
 * The page's weather: the clock's course, or a state held (`hold`: a mission, ?weather=, __slopdavos.weather()).
 * `at(total)` returns the same object every call.
 */
export function createWeather() {
  let held = null;
  const out = createWeatherSample();
  return {
    get held() { return held; },
    /** Hold a state (an unknown id or null lets the course go on) */
    hold(id) { held = id && WEATHER_STATES[id] ? id : null; },
    release() { held = null; },
    at(total) { return held ? fixedWeather(held, out) : weatherAt(total, out); }
  };
}

// The word for each state (the HUD's clock, js/main.js)
const WORDS = {
  clear: ['Clear', 'Klar'],
  fair: ['Fair', 'Schön'],
  cloudy: ['Cloudy', 'Bewölkt'],
  overcast: ['Overcast', 'Bedeckt'],
  fog: ['Fog', 'Nebel'],
  rain: ['Rain', 'Regen'],
  snow: ['Snow', 'Schnee'],
  storm: ['Thunderstorm', 'Gewitter']
};
/** "Rain" (with its German, js/messages.js) */
export function weatherText(id) {
  const w = WORDS[id] || WORDS.clear;
  return msg(w[0], w[1]);
}

/** ?weather=<id> (a state held) */
export function weatherSwitch(search) {
  const id = new URLSearchParams(search || '').get('weather');
  return id && WEATHER_STATES[id] ? id : null;
}
