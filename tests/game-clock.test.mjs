import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MINUTES_PER_DAY, REAL_SECONDS_PER_DAY, YEAR_DAYS, advance, realSecondsBetween, seasonAt, winterBlendAt, snowfallAt, formatClock,
  nextTimeOfDay, nextSeasonDay, nextSeasonMorning, createGameClock, applyClockSwitches, dayOfYear, minuteOfDay
} from '../js/game-clock.js';
import { TIME_PRESETS, TIME_MINUTES, createSample, sampleDay, presetAt, wearHoursAt } from '../js/day-cycle.js';

const DAY = MINUTES_PER_DAY;
const at = (day, h, m = 0) => day * DAY + h * 60 + m;
const fakeStorage = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ~ ${b}`);

test('a game day takes exactly 24 real minutes, the night running twice as fast', () => {
  assert.equal(REAL_SECONDS_PER_DAY, 24 * 60);
  for (const start of [0, 359, 360, 540, 1319, 1320, 1439.5]) near(realSecondsBetween(start, start + DAY), 1440, 1e-6);
  near(advance(at(0, 9), 1440), at(1, 9), 1e-6);
  near(advance(at(0, 12), 12), at(0, 12, 10)); // (by day: 1.2 s a game minute)
  near(advance(at(0, 23), 12), at(0, 23, 20)); // (by night: 0.6 s a game minute)
  near(realSecondsBetween(at(0, 6), at(0, 22)), 19.2 * 60, 1e-6);
  near(realSecondsBetween(at(0, 22), at(1, 6)), 4.8 * 60, 1e-6);
});

test('advance crosses the changes of rate exactly, in small steps as in big ones', () => {
  near(advance(at(0, 21, 59), 1.2 + 0.6), at(0, 22, 1), 1e-9); // (one minute at each rate)
  let t = at(3, 5, 30);
  for (let i = 0; i < 1440 * 60; i++) t = advance(t, 1 / 60); // (a real day, frame by frame)
  near(t, at(4, 5, 30), 1e-4);
  assert.equal(advance(100, 0), 100);
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
  assert.equal(nextSeasonMorning(at(1, 12)), at(4, 7));
  assert.equal(nextSeasonMorning(at(5, 12)), at(8, 7));
  assert.equal(winterBlendAt(nextSeasonMorning(at(1, 12))), 1, 'the morning after the snowfall: it lies');
  assert.equal(winterBlendAt(nextSeasonMorning(at(5, 12))), 0);
});

test('the clock: ticks, stands still when held or frozen, and remembers', () => {
  const storage = fakeStorage();
  const c = createGameClock({ storage });
  assert.equal(c.day, 0);
  assert.equal(c.season, 'summer', 'a first visit starts in summer');
  assert.equal(c.text, '09:00');
  c.tick(12);
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
  c.tick(12);
  near(c.total, at(5, 13, 40));
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
  applyClockSwitches(c, '?time=midnight', TIME_MINUTES);
  assert.equal(c.text, '23:00');
  assert.equal(c.frozen, true);
  applyClockSwitches(c, '?time=06:45', TIME_MINUTES);
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

test('the presets remain the anchors: at their times the sample is the preset', () => {
  const s = createSample();
  for (const id of ['golden', 'midday', 'twilight', 'midnight']) {
    const p = TIME_PRESETS[id];
    sampleDay(TIME_MINUTES[id], s);
    for (const k of ['sunIntensity', 'hemiIntensity', 'fogDensity', 'interiorGlow', 'roadWetness', 'envIntensity', 'canyonBounce', 'turbidity', 'rayleigh', 'mieCoefficient', 'skyExposure', 'nightFactor', 'exposure', 'bloom', 'threshold', 'wHaze', 'wExposure', 'wBloomGate']) near(s[k], p[k], 1e-12);
    near(s.sunDirX, p.sunDir[0], 1e-9); near(s.sunDirY, p.sunDir[1], 1e-9); near(s.sunDirZ, p.sunDir[2], 1e-9);
    for (const k of ['sunColor', 'hemiSky', 'hemiGround', 'skyTop', 'skyHorizon', 'fogColor']) {
      near(s[`${k}R`], ((p[k] >> 16) & 255) / 255, 1e-12);
      near(s[`${k}G`], ((p[k] >> 8) & 255) / 255, 1e-12);
      near(s[`${k}B`], (p[k] & 255) / 255, 1e-12);
    }
    assert.equal(s.presetId, id);
  }
});

test('the light flows: no jumps through the day, the sun always a unit vector, no value out of range', () => {
  const a = createSample(), b = createSample();
  for (let m = 0; m < DAY; m++) {
    sampleDay(m, a); sampleDay((m + 1) % DAY, b);
    near(Math.hypot(a.sunDirX, a.sunDirY, a.sunDirZ), 1, 1e-9);
    assert.ok(a.sunDirY > 0, `the light stays above the horizon at ${m}`);
    assert.ok(a.sunIntensity >= 0 && a.interiorGlow > 0 && a.skyExposure > 0, `at ${m}`);
    // (the one big move of the direction is the hand-over from sun to moon, at intensity 0)
    if (a.sunIntensity > 0.01 || b.sunIntensity > 0.01) {
      const dot = a.sunDirX * b.sunDirX + a.sunDirY * b.sunDirY + a.sunDirZ * b.sunDirZ;
      assert.ok(dot > Math.cos((2 * Math.PI) / 180), `the sun jumps at ${m}: ${dot}`);
    }
    assert.ok(Math.abs(a.interiorGlow - b.interiorGlow) < 0.02, `the windows jump at ${m}`);
    assert.ok(Math.abs(a.nightFactor - b.nightFactor) < 0.02, `the sky jumps at ${m}`);
    assert.ok(Math.abs(a.sunColorR - b.sunColorR) < 0.02, `the sun's colour jumps at ${m}`);
  }
});

test('the lamps and windows come on at dusk and go off in the morning', () => {
  const glow = (h, m = 0) => sampleDay(h * 60 + m).interiorGlow;
  assert.ok(glow(13, 30) < 0.4, 'off at midday');
  assert.ok(glow(17, 45) < 0.6, 'off in the golden hour');
  assert.ok(glow(19, 15) > 1.1, 'on at dusk');
  assert.ok(glow(23) > 1.4, 'on at night');
  assert.ok(glow(3) > 1.4, 'on before dawn');
  assert.ok(glow(9) < 0.6, 'off in the morning');
  assert.equal(presetAt(23 * 60), 'midnight');
  assert.equal(presetAt(2 * 60), 'midnight');
  assert.equal(presetAt(12 * 60), 'midday');
});

test('the sun rises in the east and sets in the west', () => {
  assert.ok(sampleDay(6.5 * 60).sunDirX > 0.3);
  assert.ok(sampleDay(8 * 60).sunDirX > 0.3);
  assert.ok(sampleDay(19.25 * 60).sunDirX < -0.3);
  let last = Infinity;
  for (let m = 5.5 * 60; m <= 20.9 * 60; m += 15) { const x = sampleDay(m).sunDirX; assert.ok(x <= last + 0.05, `at ${m}`); last = x; }
});

test('the pistes\' wear goes through the old presets\' values', () => {
  near(wearHoursAt(TIME_MINUTES.midday), 4.5);
  near(wearHoursAt(TIME_MINUTES.golden), 7.5);
  near(wearHoursAt(TIME_MINUTES.twilight), 8);
  near(wearHoursAt(TIME_MINUTES.midnight), 0);
  near(wearHoursAt(5 * 60), 0);
});
