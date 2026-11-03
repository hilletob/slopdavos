import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS } from '../js/missions-data.js';
import { MINUTES_PER_DAY, YEAR_DAYS, seasonAt, winterBlendAt, minuteOfDay, createGameClock, fastForwardTarget } from '../js/game-clock.js';
import { sunHeight } from '../js/solar.js';
import { SUN_WINDOWS, missionWindow, missionOpen, nightVariantOpen, nextOpening, closedInfo, closedText, missionClockTime, yearShare } from '../js/mission-windows.js';

const DAY = MINUTES_PER_DAY;
const at = (day, h, m = 0) => day * DAY + h * 60 + m;
const mission = (over) => ({ id: 'x', title: 'X', time: 'midday', ...over });

test('every mission has a window, its season from def.season and its sun from def.time', () => {
  assert.ok(MISSIONS.length >= 57);
  for (const def of MISSIONS) {
    const w = missionWindow(def);
    assert.equal(w.season, def.season || null, def.id);
    assert.ok(SUN_WINDOWS[def.time || 'golden'], `${def.id}: def.time ${def.time} has a window`);
    assert.equal(!!w.nightTest, !!def.nightTime, def.id);
  }
});

test('nothing is rare: every mission is open for a decent share of the game year', () => {
  for (const def of MISSIONS) {
    const share = yearShare(def);
    assert.ok(share.real >= 0.12, `${def.id}: ${(share.real * 100).toFixed(1)} % of the real time`);
    assert.ok(share.game >= 0.1, `${def.id}: ${(share.game * 100).toFixed(1)} % of the game's minutes`);
  }
});

test('the windows go by the sun: the same hour is another thing in winter and in summer', () => {
  const summer = (time, h, m = 0) => missionOpen(mission({ time }), at(1, h, m)); // (day 1: summer)
  const winter = (time, h, m = 0) => missionOpen(mission({ time }), at(5, h, m)); // (day 5: winter)
  // An evening at 18:00 is dark in winter and daylight in summer
  assert.equal(winter('evening', 18), true);
  assert.equal(summer('evening', 18), false);
  assert.equal(summer('evening', 21), true);
  assert.equal(winter('evening', 1, 59), true);
  assert.equal(winter('evening', 3), false);
  // Night is below civil dusk
  assert.equal(winter('midnight', 18), true);
  assert.equal(summer('midnight', 18), false);
  assert.equal(summer('midnight', 22), true);
  assert.equal(summer('midnight', 6), false);
  assert.equal(winter('midnight', 7), true);
  // Midday: the sun well up
  assert.equal(summer('midday', 7, 30), true);
  assert.equal(winter('midday', 8, 30), false);
  assert.equal(winter('midday', 12, 30), true);
  assert.equal(winter('midday', 16), false);
  assert.equal(summer('midday', 19), true);
  // Golden: low; in winter nearly all the short day
  assert.equal(summer('golden', 13), false);
  assert.equal(summer('golden', 6), true);
  assert.equal(summer('golden', 20), true);
  assert.equal(winter('golden', 10), true);
  assert.equal(winter('golden', 20), false);
  // Morning: from dawn until an hour before noon
  assert.equal(summer('morning', 5, 30), true);
  assert.equal(winter('morning', 5, 30), false);
  assert.equal(winter('morning', 9), true);
  assert.equal(summer('morning', 14), false);
  // the season: day 1 is summer, day 5 winter
  assert.equal(missionOpen(mission({ season: 'summer' }), at(1, 12)), true);
  assert.equal(missionOpen(mission({ season: 'winter' }), at(1, 12)), false);
  assert.equal(missionOpen(mission({ season: 'winter' }), at(5, 12)), true);
  assert.equal(missionOpen(mission({ season: 'summer' }), at(5, 12)), false);
  assert.ok(sunHeight(18 * 60, 1) < -6 && sunHeight(18 * 60, 0) > 20);
});

test('a mission with a night variant is open by day and by night, and the night has the night variant', () => {
  const def = mission({ time: 'golden', nightTime: 'midnight' });
  assert.equal(missionOpen(def, at(1, 20)), true);
  assert.equal(nightVariantOpen(def, at(1, 20)), false);
  assert.equal(missionOpen(def, at(1, 23)), true);
  assert.equal(nightVariantOpen(def, at(1, 23)), true);
  assert.equal(missionOpen(def, at(1, 12)), false);
  assert.equal(nightVariantOpen(mission({}), at(1, 23)), false);
});

test('closed missions say when they open, in hours today and in days for the season', () => {
  const midday = mission({});
  assert.equal(closedText(midday, at(1, 12)), '', 'open');
  assert.match(closedText(midday, at(1, 22)), /^Opens at 0\d:\d\d$/);
  assert.match(closedText(midday, at(5, 6)), /^Opens at 09:\d\d$/);
  const evening = closedInfo(mission({ time: 'evening' }), at(1, 12));
  assert.equal(evening.kind, 'time');
  assert.match(evening.at, /^20:\d\d$/, 'summer: the evening comes late');
  assert.match(closedInfo(mission({ time: 'evening' }), at(5, 12)).at, /^16:\d\d$/, 'winter: early');
  assert.equal(closedText(mission({ season: 'summer' }), at(5, 12)), 'In summer: in 3 days');
  assert.equal(closedText(mission({ season: 'summer' }), at(7, 12)), 'In summer: in 1 day');
  assert.equal(closedText(mission({ season: 'winter' }), at(1, 12)), 'In winter: in 3 days');
  // The last winter evening: the next midday in winter is a long way off
  assert.equal(closedText(mission({ season: 'winter' }), at(7, 20)), 'In winter: in 5 days');
});

test('all missions, all year: the next opening is open, soon enough, and not before now', () => {
  for (const def of MISSIONS) {
    for (let t = 0; t < YEAR_DAYS * DAY; t += 37) {
      const next = nextOpening(def, t);
      assert.ok(next >= t, def.id);
      assert.ok(next - t <= (YEAR_DAYS / 2 + 1) * DAY, `${def.id}: waits ${next - t} from ${t}`);
      assert.equal(missionOpen(def, next), true, `${def.id} at ${next}`);
      assert.equal(next === t, missionOpen(def, t));
      if (next > t) { assert.ok(closedText(def, t).length > 0, def.id); assert.equal(missionOpen(def, next - 1), false, `${def.id}: opens exactly then`); } else assert.equal(closedText(def, t), '');
    }
  }
});

test('all missions: a run holds the clock at the mission\'s own time, in its season, within its window', () => {
  for (const def of MISSIONS) {
    for (const night of def.nightTime ? [false, true] : [false]) {
      for (let t = 0; t < YEAR_DAYS * DAY; t += 113) {
        const hold = missionClockTime(def, night, t);
        assert.ok(hold >= 0);
        if (def.season) assert.equal(seasonAt(hold), def.season, def.id);
        assert.equal(missionOpen(def, hold), true, `${def.id} (night ${night}) from ${t}: ${hold}`);
        // (in season it doesn't go far; out of season it goes ahead to the season)
        if (!def.season || seasonAt(t) === def.season) assert.ok(Math.abs(hold - t) <= DAY, `${def.id}: ${hold - t}`);
        else assert.ok(hold > t || t - hold <= DAY / 2, def.id); // (just past midnight into the other season: the evening before)
      }
    }
  }
});

test('what a start from the pin, then the wait button, then a link do to the clock', () => {
  const clock = createGameClock();
  const golf = MISSIONS.find((m) => m.season === 'summer' && m.time === 'midday');
  const slalom = MISSIONS.find((m) => m.season === 'winter' && m.time === 'midday');
  clock.jumpTo(at(1, 3));
  assert.equal(missionOpen(golf, clock.total), false);
  clock.jumpTo(nextOpening(golf, clock.total)); // ("wait until then")
  assert.equal(missionOpen(golf, clock.total), true);
  clock.hold(missionClockTime(golf, false, clock.total), golf.season);
  const held = clock.total;
  clock.tick(600);
  assert.equal(clock.total, held, 'the mission\'s time, standing still');
  assert.ok(sunHeight(minuteOfDay(held), 0) > 50, 'the summer sun high up');
  clock.release();
  clock.tick(12);
  assert.ok(clock.total > held, 'and on from there');
  // ?mission= straight into another season
  clock.hold(missionClockTime(slalom, false, clock.total), slalom.season);
  assert.equal(clock.isWinter, true);
  assert.equal(clock.winterBlend, 1);
  assert.ok(sunHeight(minuteOfDay(clock.total), 1) < 23, 'the winter sun low');
  clock.release();
  assert.ok(winterBlendAt(clock.total) === 1, 'the first winter day at midday: the snow lies');
});

test('the fast-forward\'s targets go by the sun of their day', () => {
  const inMinutes = (t) => minuteOfDay(t);
  const summerMorning = fastForwardTarget('morning', at(1, 3));
  assert.equal(Math.floor(summerMorning / DAY), 1);
  assert.ok(inMinutes(summerMorning) > 6 * 60 && inMinutes(summerMorning) < 7 * 60, 'a summer morning is early');
  assert.equal(Math.floor(fastForwardTarget('morning', at(1, 9)) / DAY), 2);
  const winterMorning = fastForwardTarget('morning', at(5, 3));
  assert.ok(inMinutes(winterMorning) > 9 * 60, 'a winter morning is late');
  const summerEvening = fastForwardTarget('evening', at(1, 9));
  assert.ok(inMinutes(summerEvening) > 20 * 60 && Math.floor(summerEvening / DAY) === 1);
  const winterEvening = fastForwardTarget('evening', at(5, 9));
  assert.ok(inMinutes(winterEvening) < 16.5 * 60 && Math.floor(winterEvening / DAY) === 5);
  assert.equal(Math.floor(fastForwardTarget('evening', at(5, 18)) / DAY), 6);
  assert.equal(Math.floor(fastForwardTarget('season', at(1, 9)) / DAY), 4);
  assert.equal(Math.floor(fastForwardTarget('season', at(5, 9)) / DAY), 8);
  assert.equal(winterBlendAt(fastForwardTarget('season', at(1, 9))), 1);
  assert.equal(winterBlendAt(fastForwardTarget('season', at(5, 9))), 0);
});
