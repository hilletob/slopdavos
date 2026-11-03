import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS } from '../js/missions-data.js';
import { MINUTES_PER_DAY, YEAR_DAYS, seasonAt, winterBlendAt, minuteOfDay, createGameClock, fastForwardTarget } from '../js/game-clock.js';
import { TIME_WINDOWS, missionWindow, missionOpen, nightVariantOpen, nextOpening, closedInfo, closedText, missionClockTime, yearShare } from '../js/mission-windows.js';

const DAY = MINUTES_PER_DAY;
const at = (day, h, m = 0) => day * DAY + h * 60 + m;
const mission = (over) => ({ id: 'x', title: 'X', time: 'midday', ...over });

test('every mission has a window, its season from def.season and its hours from def.time', () => {
  assert.ok(MISSIONS.length >= 57);
  for (const def of MISSIONS) {
    const w = missionWindow(def);
    assert.equal(w.season, def.season || null, def.id);
    assert.ok(TIME_WINDOWS[def.time || 'golden'], `${def.id}: def.time ${def.time} has hours`);
    assert.ok(w.hours.length >= 1, def.id);
    if (def.nightTime) assert.ok(w.nightHours.length >= 1, def.id);
  }
});

test('nothing is rare: every mission is open for a decent share of the game year', () => {
  for (const def of MISSIONS) {
    const share = yearShare(def);
    assert.ok(share.real >= 0.14, `${def.id}: ${(share.real * 100).toFixed(1)} % of the real time`);
    assert.ok(share.game >= 0.12, `${def.id}: ${(share.game * 100).toFixed(1)} % of the game's minutes`);
  }
});

test('the windows of each time of day', () => {
  const open = (time, h, m = 0, season = null) => missionOpen(mission({ time, season }), at(1, h, m));
  assert.equal(open('midday', 7, 59), false); assert.equal(open('midday', 8), true); assert.equal(open('midday', 17, 59), true); assert.equal(open('midday', 18), false);
  assert.equal(open('golden', 6), true); assert.equal(open('golden', 12), false); assert.equal(open('golden', 16), true); assert.equal(open('golden', 21), false);
  assert.equal(open('evening', 18), true); assert.equal(open('evening', 1, 59), true); assert.equal(open('evening', 2), false);
  assert.equal(open('midnight', 20), true); assert.equal(open('midnight', 4), true); assert.equal(open('midnight', 5), false);
  assert.equal(open('morning', 5), true); assert.equal(open('morning', 11), false);
  // the season: day 1 is summer, day 5 winter
  assert.equal(missionOpen(mission({ season: 'summer' }), at(1, 12)), true);
  assert.equal(missionOpen(mission({ season: 'winter' }), at(1, 12)), false);
  assert.equal(missionOpen(mission({ season: 'winter' }), at(5, 12)), true);
  assert.equal(missionOpen(mission({ season: 'summer' }), at(5, 12)), false);
});

test('a mission with a night variant is open by day and by night, and the night has the night variant', () => {
  const def = mission({ time: 'golden', nightTime: 'midnight' });
  assert.equal(missionOpen(def, at(1, 17)), true);
  assert.equal(nightVariantOpen(def, at(1, 17)), false);
  assert.equal(missionOpen(def, at(1, 23)), true);
  assert.equal(nightVariantOpen(def, at(1, 23)), true);
  assert.equal(missionOpen(def, at(1, 12)), false);
  assert.equal(nightVariantOpen(mission({}), at(1, 23)), false);
});

test('closed missions say when they open, in hours today and in days for the season', () => {
  const midday = mission({});
  assert.equal(closedText(midday, at(1, 12)), '', 'open');
  assert.equal(closedText(midday, at(1, 19)), 'Opens at 08:00');
  assert.equal(closedText(midday, at(1, 6)), 'Opens at 08:00');
  assert.deepEqual(closedInfo(mission({ time: 'evening' }), at(1, 12)), { kind: 'time', at: '18:00' });
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
  clock.jumpTo(at(1, 6));
  assert.equal(missionOpen(golf, clock.total), false);
  clock.jumpTo(nextOpening(golf, clock.total)); // ("wait until then")
  assert.equal(minuteOfDay(clock.total), 8 * 60);
  assert.equal(missionOpen(golf, clock.total), true);
  clock.hold(missionClockTime(golf, false, clock.total), golf.season);
  clock.tick(600);
  assert.equal(minuteOfDay(clock.total), 13.5 * 60, 'the mission\'s time, standing still');
  clock.release();
  clock.tick(12);
  assert.equal(minuteOfDay(clock.total), 13.5 * 60 + 10, 'and on from there');
  // ?mission= straight into another season
  clock.hold(missionClockTime(slalom, false, clock.total), slalom.season);
  assert.equal(clock.isWinter, true);
  assert.equal(clock.winterBlend, 1);
  clock.release();
  assert.ok(winterBlendAt(clock.total) === 1, 'the first winter day at midday: the snow lies');
});

test('the fast-forward\'s targets', () => {
  assert.equal(fastForwardTarget('morning', at(1, 6)), at(1, 7));
  assert.equal(fastForwardTarget('morning', at(1, 9)), at(2, 7));
  assert.equal(fastForwardTarget('evening', at(1, 9)), at(1, 18));
  assert.equal(fastForwardTarget('evening', at(1, 19)), at(2, 18));
  assert.equal(fastForwardTarget('season', at(1, 9)), at(4, 7));
  assert.equal(fastForwardTarget('season', at(5, 9)), at(8, 7));
});
