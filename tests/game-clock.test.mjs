import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MINUTES_PER_DAY, REAL_SECONDS_PER_DAY, YEAR_DAYS, DAY_PROFILES, advance, realSecondsBetween, seasonAt, winterBlendAt, snowfallAt, formatClock,
  nextTimeOfDay, nextSeasonDay, nextSeasonMorning, createGameClock, applyClockSwitches, dayOfYear, minuteOfDay
} from '../js/game-clock.js';
import { TIME_PRESETS, presetMinute, createSample, sampleDay, presetAt, wearHoursAt } from '../js/day-cycle.js';
import { sunHeight, sunVector, solarNoon, minuteAtHeight, SUNRISE_HEIGHT, CIVIL_HEIGHT } from '../js/solar.js';

const DAY = MINUTES_PER_DAY;
const at = (day, h, m = 0) => day * DAY + h * 60 + m;
const fakeStorage = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ~ ${b}`);

test('every game day takes exactly 24 real minutes, in both seasons, the night running twice as fast', () => {
  assert.equal(REAL_SECONDS_PER_DAY, 24 * 60);
  for (let d = 0; d < 16; d++) near(realSecondsBetween(at(d, 0), at(d + 1, 0)), 1440, 1e-6);
  for (const start of [at(0, 9), at(3, 21), at(5, 3)]) near(advance(start, realSecondsBetween(start, start + 500)), start + 500, 1e-6);
  const summer = DAY_PROFILES[1], winter = DAY_PROFILES[5], thaw = DAY_PROFILES[7];
  for (const p of [summer, winter, thaw]) near(p.night, p.day / 2);
  near(summer.day, 1.178, 0.002);
  near(winter.day, 1.408, 0.002);
  assert.ok(thaw.day > summer.day && thaw.day < winter.day);
  assert.ok(realSecondsBetween(at(1, 8), at(1, 20)) < realSecondsBetween(at(5, 8), at(5, 20)) + 1e-6);
});

test('advance crosses the changes of rate exactly, in small steps as in big ones', () => {
  const p = DAY_PROFILES[1];
  near(advance(at(1, 0) + p.dusk - 1, p.day + p.night), at(1, 0) + p.dusk + 1, 1e-6); // (one minute at each rate)
  let t = at(3, 5, 30);
  for (let i = 0; i < 1440 * 60; i++) t = advance(t, 1 / 60); // (a real day, frame by frame, over two kinds of day)
  assert.ok(Math.abs(realSecondsBetween(at(3, 5, 30), t) - 1440) < 0.01);
  assert.equal(advance(100, 0), 100);
});

test('the sun times of Davos on the two anchor days, within two minutes of the NOAA table', () => {
  const hm = (h, m) => h * 60 + m;
  const close = (a, b) => assert.ok(Math.abs(a - b) <= 2, `${a} ~ ${b}`);
  close(minuteAtHeight(CIVIL_HEIGHT, 1, true), hm(7, 28));
  close(minuteAtHeight(SUNRISE_HEIGHT, 1, true), hm(8, 2));
  close(solarNoon(1), hm(12, 30));
  close(minuteAtHeight(SUNRISE_HEIGHT, 1, false), hm(16, 59));
  close(minuteAtHeight(CIVIL_HEIGHT, 1, false), hm(17, 33));
  close(minuteAtHeight(CIVIL_HEIGHT, 0, true), hm(5, 4));
  close(minuteAtHeight(SUNRISE_HEIGHT, 0, true), hm(5, 41));
  close(solarNoon(0), hm(13, 26));
  close(minuteAtHeight(SUNRISE_HEIGHT, 0, false), hm(21, 11));
  close(minuteAtHeight(CIVIL_HEIGHT, 0, false), hm(21, 48));
  near(sunHeight(solarNoon(1), 1), 22, 0.5);
  near(sunHeight(solarNoon(0), 0), 65, 0.5);
  // It rises in the east and sets in the west, in the south at noon, on the frame's axes (x east, z south)
  const v = { x: 0, y: 0, z: 0 };
  sunVector(hm(8, 30), 1, v); assert.ok(v.x > 0.5);
  sunVector(solarNoon(1), 1, v); near(v.x, 0, 1e-9); assert.ok(v.z > 0.9);
  sunVector(hm(16, 30), 1, v); assert.ok(v.x < -0.5);
  near(Math.hypot(v.x, v.y, v.z), 1, 1e-9);
  sunVector(600, 0.3, v);
  near(v.y, Math.sin((sunHeight(600, 0.3) * Math.PI) / 180), 1e-9);
});

test('the year: 8 days, 4 of summer, 4 of winter, changing at midnight', () => {
  assert.equal(YEAR_DAYS, 8);
  for (let d = 0; d < 16; d++) assert.equal(seasonAt(at(d, 12)), d % 8 < 4 ? 'summer' : 'winter', `day ${d}`);
  assert.equal(seasonAt(at(3, 23, 59)), 'summer');
  assert.equal(seasonAt(at(4, 0)), 'winter');
  assert.equal(seasonAt(at(7, 23, 59)), 'winter');
  assert.equal(seasonAt(at(8, 0)), 'summer');
});

test('the snow settles over the snowfall night, the thaw takes a day, nothing moves otherwise', () => {
  assert.equal(winterBlendAt(at(1, 12)), 0);
  assert.equal(winterBlendAt(at(3, 19, 59)), 0);
  near(winterBlendAt(at(3, 20)), 0);
  near(winterBlendAt(at(4, 1)), 0.5); // (halfway through the 10 hours from 20:00 to 06:00)
  assert.equal(winterBlendAt(at(4, 6)), 1);
  assert.equal(winterBlendAt(at(5, 12)), 1);
  assert.equal(winterBlendAt(at(6, 23)), 1);
  assert.equal(winterBlendAt(at(7, 5, 59)), 1);
  near(winterBlendAt(at(7, 12)), 0.5);
  assert.equal(winterBlendAt(at(7, 18)), 0);
  assert.equal(winterBlendAt(at(8, 0)), 0);
  // At the switch of the scenery (midnight) it is dark, the snow half fallen one way and long gone the other
  near(winterBlendAt(at(4, 0)), 0.4);
  // Never a jump: the blend moves by little per game minute all year
  for (let t = 0; t < 8 * DAY; t += 1) assert.ok(Math.abs(winterBlendAt(t + 1) - winterBlendAt(t)) < 0.002, `at ${t}`);
});

test('it snows from the evening before the first snow lies until the thaw begins', () => {
  assert.equal(snowfallAt(at(3, 19)), 0);
  assert.equal(snowfallAt(at(3, 21)), 1);
  assert.equal(snowfallAt(at(4, 3)), 1);
  assert.equal(snowfallAt(at(6, 12)), 1);
  assert.equal(snowfallAt(at(7, 5)), 1);
  assert.equal(snowfallAt(at(7, 7)), 0);
  assert.equal(snowfallAt(at(0, 12)), 0);
});

test('the times to fast-forward to', () => {
  assert.equal(formatClock(at(2, 7, 5)), '07:05');
  assert.equal(formatClock(at(2, 23, 59) + 0.9), '23:59');
  assert.equal(nextTimeOfDay(at(0, 6), 7 * 60), at(0, 7));
  assert.equal(nextTimeOfDay(at(0, 7), 7 * 60), at(1, 7));
  assert.equal(nextTimeOfDay(at(0, 19), 18 * 60), at(1, 18));
  assert.equal(nextSeasonDay(at(1, 12), 'winter'), at(4, 0));
  assert.equal(nextSeasonDay(at(5, 12), 'winter'), at(6, 0), '(the next day that is winter)');
  assert.equal(nextSeasonDay(at(5, 12), 'summer'), at(8, 0));
  assert.equal(dayOfYear(nextSeasonMorning(at(1, 12))), 4);
  assert.equal(dayOfYear(nextSeasonMorning(at(5, 12))), 0);
  assert.ok(sunHeight(minuteOfDay(nextSeasonMorning(at(1, 12))), 1) > 7, 'a winter morning in the light, not at 07:00 in the dark');
  assert.equal(winterBlendAt(nextSeasonMorning(at(1, 12))), 1, 'the morning after the snowfall: it lies');
  assert.equal(winterBlendAt(nextSeasonMorning(at(5, 12))), 0);
});

test('the clock: ticks, stands still when held or frozen, and remembers', () => {
  const storage = fakeStorage();
  const c = createGameClock({ storage });
  assert.equal(c.day, 0);
  assert.equal(c.season, 'summer', 'a first visit starts in summer');
  assert.equal(c.text, '09:00');
  const p = DAY_PROFILES[0];
  c.tick(p.day * 10);
  near(c.total, 9 * 60 + 10);
  c.freeze(true); c.tick(100); near(c.total, 9 * 60 + 10); c.freeze(false);
  c.takeJump();
  c.hold(at(5, 13, 30), 'winter');
  assert.equal(c.takeJump(), true);
  assert.equal(c.isWinter, true);
  c.tick(500);
  assert.equal(c.total, at(5, 13, 30), 'a mission holds the clock');
  c.release();
  assert.equal(c.takeJump(), true);
  c.tick(DAY_PROFILES[5].night * 10);
  assert.ok(c.total > at(5, 13, 30) && c.total < at(5, 13, 40.1));
  c.save();
  const again = createGameClock({ storage });
  near(again.total, c.total);
  // ... an unusable save starts afresh; storage that throws changes nothing
  assert.equal(createGameClock({ storage: fakeStorage({ 'slopdavos-clock': '{"v":1,"total":-5}' }) }).total, 9 * 60);
  assert.equal(createGameClock({ storage: fakeStorage({ 'slopdavos-clock': 'nonsense' }) }).total, 9 * 60);
  const broken = createGameClock({ storage: { getItem() { throw new Error('off'); }, setItem() { throw new Error('off'); } } });
  broken.tick(30); broken.save();
  assert.ok(broken.total > 9 * 60);
});

test('a held mission shows its season whatever the snow is doing', () => {
  const c = createGameClock();
  c.hold(at(7, 12), 'winter'); // (the thaw, half gone)
  assert.equal(c.winterBlend, 1);
  assert.equal(c.snowfall, 1);
  c.release();
  near(c.winterBlend, 0.5);
  c.hold(at(3, 23), 'summer'); // (the snowfall night)
  assert.equal(c.winterBlend, 0);
  assert.equal(c.snowfall, 0);
  c.release();
  c.hold(at(3, 23), null);
  assert.ok(c.winterBlend > 0, 'no season of its own: the calendar');
  c.release();
});

test('the URL\'s switches: ?winter, ?summer, ?time=', () => {
  const c = createGameClock();
  applyClockSwitches(c, '?winter');
  assert.equal(c.isWinter, true);
  assert.equal(c.winterBlend, 1);
  assert.equal(c.text, '09:00', 'the time of day stays');
  const t = c.total;
  applyClockSwitches(c, '?winter');
  assert.equal(c.total, t, 'already there: nothing moves');
  applyClockSwitches(c, '?summer');
  assert.equal(c.isWinter, false);
  assert.equal(c.winterBlend, 0);
  applyClockSwitches(c, '?time=midnight', presetMinute);
  assert.equal(c.text, '23:00');
  assert.equal(c.frozen, true);
  applyClockSwitches(c, '?time=06:45', presetMinute);
  assert.equal(c.text, '06:45');
  const free = createGameClock();
  applyClockSwitches(free, '?quality=mobile&mission=golf');
  assert.equal(free.frozen, false);
  assert.equal(free.total, 9 * 60);
  // on the thaw's day ?winter goes on to a full winter day
  const thaw = createGameClock(); thaw.jumpTo(at(7, 12));
  applyClockSwitches(thaw, '?winter');
  assert.equal(thaw.winterBlend, 1);
  assert.equal(dayOfYear(thaw.total), 5);
  assert.equal(minuteOfDay(thaw.total), 12 * 60);
});

// --- The light through the day --------------------------------------------------------------------------------------

// A minute of a season at which the sun stands at `height` (summer: on the way down)
const atHeight = (height, w = 0) => minuteAtHeight(height, w, false);

test('the presets remain the colour anchors, on the sun\'s height', () => {
  const s = createSample();
  for (const [id, height] of [['midnight', -12], ['twilight', -3], ['golden', 8], ['midday', 30]]) {
    const p = TIME_PRESETS[id];
    sampleDay(atHeight(height), 0, s);
    for (const k of ['hemiIntensity', 'fogDensity', 'roadWetness', 'envIntensity', 'canyonBounce', 'turbidity', 'rayleigh', 'mieCoefficient', 'skyExposure', 'nightFactor', 'exposure', 'bloom', 'threshold', 'wHaze', 'wExposure', 'wBloomGate']) near(s[k], p[k], 1e-9);
    for (const k of ['sunColor', 'hemiSky', 'hemiGround', 'skyTop', 'skyHorizon', 'fogColor']) {
      near(s[`${k}R`], ((p[k] >> 16) & 255) / 255, 1e-9);
      near(s[`${k}G`], ((p[k] >> 8) & 255) / 255, 1e-9);
      near(s[`${k}B`], (p[k] & 255) / 255, 1e-9);
    }
  }
  // The same height looks the same in either season
  const a = sampleDay(atHeight(5, 0), 0), b = sampleDay(atHeight(5, 1), 1);
  near(a.interiorGlow, b.interiorGlow, 1e-9); near(a.skyExposure, b.skyExposure, 1e-9);
  // Night holds the night preset's glow, and the midday preset's at the top of a summer day
  near(sampleDay(23 * 60, 0).interiorGlow, TIME_PRESETS.midnight.interiorGlow, 1e-9);
  near(sampleDay(solarNoon(0), 0).interiorGlow, TIME_PRESETS.midday.interiorGlow, 1e-9);
  near(sampleDay(solarNoon(0), 0).sunIntensity, TIME_PRESETS.midday.sunIntensity, 1e-9);
});

test('the light flows: no jumps through the day, the light always a unit vector above the horizon', () => {
  for (const w of [0, 0.4, 1]) {
    const a = createSample(), b = createSample();
    for (let m = 0; m < DAY; m++) {
      sampleDay(m, w, a); sampleDay((m + 1) % DAY, w, b);
      near(Math.hypot(a.sunDirX, a.sunDirY, a.sunDirZ), 1, 1e-9);
      near(Math.hypot(a.skyDirX, a.skyDirY, a.skyDirZ), 1, 1e-9);
      assert.ok(a.sunDirY > 0 && a.skyDirY > 0, `the light stays above the horizon at ${m}`);
      assert.ok(a.sunIntensity >= 0 && a.interiorGlow > 0 && a.skyExposure > 0, `at ${m}`);
      // (the one big move of the direction is the hand-over from sun to moon, with both out)
      if (a.sunIntensity > 0.01 || b.sunIntensity > 0.01) {
        const dot = a.sunDirX * b.sunDirX + a.sunDirY * b.sunDirY + a.sunDirZ * b.sunDirZ;
        assert.ok(dot > Math.cos((2 * Math.PI) / 180), `the sun jumps at ${m}: ${dot}`);
      }
      assert.ok(Math.abs(a.interiorGlow - b.interiorGlow) < 0.09, `the windows jump at ${m}`);
      assert.ok(Math.abs(a.nightFactor - b.nightFactor) < 0.02, `the sky jumps at ${m}`);
      assert.ok(Math.abs(a.sunColorR - b.sunColorR) < 0.02, `the sun's colour jumps at ${m}`);
    }
  }
  // ... nor through the season's blend, as the thaw runs at a fixed minute
  const s0 = createSample(), s1 = createSample();
  for (let w = 0; w < 1; w += 0.01) { sampleDay(13 * 60, w, s0); sampleDay(13 * 60, w + 0.01, s1); assert.ok(s0.sunDirX * s1.sunDirX + s0.sunDirY * s1.sunDirY + s0.sunDirZ * s1.sunDirZ > 0.999); }
});

test('the sky: its sun where the sun is, no sun in the night sky, and no jumps as it rises', () => {
  for (const w of [0, 1]) {
    const a = createSample(), b = createSample();
    for (let m = 0; m < DAY; m++) {
      sampleDay(m, w, a); sampleDay((m + 1) % DAY, w, b);
      // True height from 1 deg up, on the true bearing below it
      if (a.height >= 1) near(Math.asin(a.skyDirY) * 180 / Math.PI, a.height, 1e-6);
      else near(Math.asin(a.skyDirY) * 180 / Math.PI, 1, 1e-6);
      // Once it has gone: no disc, soon no glow; and a sky with no sun in it at night
      if (a.height <= 0) assert.equal(a.sunDisc, 0);
      if (a.height <= -6) assert.equal(a.skyMie, 0);
      if (a.height >= 2) assert.equal(a.sunDisc, 1);
      // A step of the clock changes the sky's exposure by little (it is steepest at dusk)
      assert.ok(Math.abs(a.skyExposure - b.skyExposure) < 0.03, `the sky's exposure jumps at ${m}`);
      assert.ok(Math.abs(a.skyMie - b.skyMie) < 0.02, `the sky's glow jumps at ${m}`);
      assert.ok(Math.abs(a.envIntensity - b.envIntensity) < 0.02, `the environment jumps at ${m}`);
      assert.ok(Math.abs(a.twilightBlue - b.twilightBlue) < 0.03, `the twilight's blue jumps at ${m}`);
      // The light on a wall facing it and on the ground stays where the materials keep their shade
      if (a.height > 0) {
        const r = a.height * Math.PI / 180;
        assert.ok(a.sunIntensity * Math.cos(r) <= 3, `walls burn out at ${m}`);
        assert.ok(a.sunIntensity * Math.sin(r) <= 4.6, `the ground burns out at ${m}`);
      }
    }
  }
});

test('after sunset the light comes from the moon in the moon\'s colour', () => {
  const m = TIME_PRESETS.midnight.sunColor;
  for (const w of [0, 1]) {
    const dusk = minuteAtHeight(-3, w, false), s = sampleDay(dusk, w);
    near(s.lightColorR, ((m >> 16) & 255) / 255, 1e-9);
    near(s.lightColorB, (m & 255) / 255, 1e-9);
    assert.ok(s.sunColorR > s.sunColorB, 'the sky\'s colours stay warm at dusk');
    const day = sampleDay(solarNoon(w), w);
    near(day.lightColorR, day.sunColorR, 1e-9);
  }
});

test('the lamps and windows switch just before the season\'s sunset and after its sunrise, not at fixed hours', () => {
  const lamp = (minute, w) => { const x = Math.max(0, Math.min(1, (sampleDay(minute, w).interiorGlow - 0.4) / 0.7)); return x * x * (3 - 2 * x); };
  for (const w of [0, 1]) {
    const dusk = minuteAtHeight(8.3, w, false), dawn = minuteAtHeight(8.3, w, true);
    near(lamp(dusk, w), 0.5, 0.1);
    near(lamp(dawn, w), 0.5, 0.1);
    assert.ok(lamp(dusk - 45, w) < 0.1, 'still off before dusk');
    assert.ok(lamp(dusk + 45, w) > 0.9, 'on after dusk');
    assert.ok(lamp(dawn - 45, w) > 0.9, 'on before dawn');
    assert.ok(lamp(dawn + 45, w) < 0.1, 'off after dawn');
  }
  // 18:30: on in winter, off in summer
  assert.ok(lamp(18.5 * 60, 1) > 0.9);
  assert.ok(lamp(18.5 * 60, 0) < 0.1);
  // ... at 07:00: on in winter, off in summer
  assert.ok(lamp(7 * 60, 1) > 0.5);
  assert.ok(lamp(7 * 60, 0) < 0.1);
  assert.equal(presetAt(-30), 'midnight');
  assert.equal(presetAt(50), 'midday');
});

test('a winter day is short and low, a summer day long and high', () => {
  assert.ok(sampleDay(solarNoon(1), 1).height < 23);
  assert.ok(sampleDay(solarNoon(0), 0).height > 64);
  assert.ok(sampleDay(10 * 60, 1).sunDirY < sampleDay(10 * 60, 0).sunDirY);
  assert.equal(sampleDay(6 * 60, 1).presetId, 'midnight');
  assert.notEqual(sampleDay(6.5 * 60, 0).presetId, 'midnight');
  assert.equal(sampleDay(20 * 60, 1).presetId, 'midnight');
  assert.notEqual(sampleDay(20 * 60, 0).presetId, 'midnight');
});

test('the pistes\' wear goes through the old presets\' values', () => {
  near(wearHoursAt(13.5 * 60), 4.5);
  near(wearHoursAt(17.75 * 60), 7.5);
  near(wearHoursAt(19.25 * 60), 8);
  near(wearHoursAt(23 * 60), 0);
  near(wearHoursAt(5 * 60), 0);
});
