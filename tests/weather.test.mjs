import test from 'node:test';
import assert from 'node:assert/strict';
import { MINUTES_PER_DAY, YEAR_DAYS, SEASON_DAYS, seasonAt } from '../js/game-clock.js';
import { weatherAt, fixedWeather, createWeather, createWeatherSample, slotState, weatherSwitch, WEATHER_IDS, WEATHER_STATES } from '../js/weather.js';

const DAY = MINUTES_PER_DAY;
const at = (day, h, m = 0) => day * DAY + h * 60 + m;

test('the same moment has the same weather (no randomness), and one object is reused', () => {
  const a = createWeatherSample(), b = createWeatherSample();
  for (const t of [at(1, 14), at(5, 8, 30), at(123, 17)]) assert.deepEqual(weatherAt(t, a), weatherAt(t, b));
  const out = createWeatherSample();
  assert.equal(weatherAt(at(2, 3), out), out);
});

test('the weather changes smoothly: no jumps from one game minute to the next', () => {
  const a = createWeatherSample(), b = createWeatherSample();
  for (let t = 0; t < 6 * YEAR_DAYS * DAY; t += 1) {
    weatherAt(t, a); weatherAt(t + 1, b);
    for (const k of ['cloud', 'overcast', 'fog', 'rain', 'snow', 'wet', 'storm']) assert.ok(Math.abs(b[k] - a[k]) < 0.06, `${k} at ${t}: ${a[k]} -> ${b[k]}`);
  }
});

test('no snow in summer, no rain in winter, but always snow the night the first snow settles', () => {
  const w = createWeatherSample();
  for (let t = 0; t < 12 * YEAR_DAYS * DAY; t += 10) {
    weatherAt(t, w);
    const d = Math.floor(t / DAY) % YEAR_DAYS, m = t % DAY;
    const firstSnow = (d === SEASON_DAYS - 1 && m >= 20 * 60) || (d === SEASON_DAYS && m < 6 * 60);
    if (seasonAt(t) === 'summer' && !firstSnow) assert.equal(w.snow, 0, `snow in summer at ${t}`);
    if (seasonAt(t) === 'winter') assert.equal(w.rain, 0, `rain in winter at ${t}`);
    if (firstSnow && (d === SEASON_DAYS || m >= 20 * 60 + 30)) assert.equal(w.snow, 1, `the first snow at ${t}`);
    if (d === YEAR_DAYS - 1 && m >= 7 * 60) assert.equal(w.snow, 0, `snow in the thaw at ${t}`);
  }
});

test('a new game starts on a fine day; over the years every state comes, the fine ones most', () => {
  assert.equal(weatherAt(at(0, 9)).id, 'clear');
  const count = Object.fromEntries(WEATHER_IDS.map((id) => [id, 0]));
  for (let day = 1; day < 4000; day++) for (let s = 0; s < 4; s++) count[slotState(day, s)]++;
  for (const id of WEATHER_IDS) assert.ok(count[id] > 0, id);
  const all = 3999 * 4;
  assert.ok((count.clear + count.fair) / all > 0.4, `fine ${(count.clear + count.fair) / all}`);
  assert.ok((count.rain + count.snow + count.storm) / all < 0.25, `wet ${(count.rain + count.snow + count.storm) / all}`);
});

test('thunderstorms come in summer only, in the afternoon, with rain and wind', () => {
  let storms = 0;
  for (let day = 1; day < 4000; day++) for (let s = 0; s < 4; s++) {
    if (slotState(day, s) !== 'storm') continue;
    storms++;
    assert.equal(seasonAt(day * DAY), 'summer', `day ${day}`);
    assert.equal(s, 2, 'the afternoon');
  }
  assert.ok(storms > 100);
  const w = fixedWeather('storm');
  assert.equal(w.storm, 1);
  assert.equal(w.rain, 1);
  assert.ok(w.wind > WEATHER_STATES.rain.wind);
});

test('the roads stay wet for a while after the rain, and with the melt of the thaw', () => {
  let found = false;
  const w = createWeatherSample();
  for (let t = 60; t < 40 * YEAR_DAYS * DAY && !found; t += 30) {
    weatherAt(t, w);
    if (w.rain === 0 && w.wet > 0.3) found = true;
  }
  assert.ok(found, 'wet roads after the rain has stopped');
  assert.ok(weatherAt(at(7, 15)).wet > 0.5, 'the thaw');
  assert.ok(weatherAt(at(0, 9)).wet === 0);
});

test('a held state is what it says; ?weather= and the page weather', () => {
  for (const id of WEATHER_IDS) {
    const w = fixedWeather(id);
    assert.equal(w.id, id);
    assert.equal(w.overcast, WEATHER_STATES[id].overcast);
  }
  assert.equal(fixedWeather('nonsense').id, 'clear');
  assert.equal(weatherSwitch('?weather=fog&winter'), 'fog');
  assert.equal(weatherSwitch('?weather=hail'), null);
  const page = createWeather();
  page.hold('rain');
  assert.equal(page.at(at(5, 12)).rain, 1, 'held, even in winter (a debug switch)');
  page.release();
  assert.equal(page.at(at(5, 12)).rain, 0);
  page.hold(null);
  assert.equal(page.held, null);
});

test('the weather in the free flight: thermals with the sun, more wind in rain, no launch in a thunderstorm', async () => {
  const { weatherAir, freeThermals, windAt, FREE_THERMALS, STORM_LAUNCH } = await import('../js/missions-data-paraglide.js');
  const air = (id) => weatherAir(fixedWeather(id));
  assert.deepEqual(weatherAir(null), { sun: 1, windScale: 1, downdraft: 0, storm: false });
  assert.ok(air('clear').sun > 0.95 && air('fair').sun > 0.8, 'sun on the faces');
  assert.ok(air('cloudy').sun < 0.5 && air('overcast').sun < 0.1);
  for (const id of ['fog', 'rain', 'storm']) assert.equal(air(id).sun, 0, id);
  assert.equal(freeThermals(14 * 60, false, FREE_THERMALS, air('rain').sun).length, 0, 'no thermals in the rain');
  assert.equal(freeThermals(14 * 60, false, FREE_THERMALS, air('clear').sun).length, FREE_THERMALS.length);
  const speed = (id) => windAt(0, 300, undefined, air(id).windScale).speed;
  assert.ok(speed('clear') < 3 && speed('rain') > 3.5 && speed('storm') > 5, `${speed('clear')} ${speed('rain')} ${speed('storm')}`);
  assert.equal(air('rain').storm, false, 'rain: one may fly');
  assert.equal(air('storm').storm, true);
  assert.ok(air('storm').downdraft > 2);
  assert.ok(STORM_LAUNCH > 0 && STORM_LAUNCH < 1);
});
