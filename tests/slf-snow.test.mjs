import assert from 'node:assert/strict';
import test from 'node:test';
import { hasData, reduceBulletin, reducePlot, reduceSlf, reduceStation } from '../supabase/functions/slf-snow/reduce.js';
import {
  SNOW, SLF_LIVE, SNOW_MISSION, GRAINS, HARDNESS, createSnowGame, createSnowpack, dangerFor, slfNote, slfTime, slfUsable, snowpackFromSlf, snowTempAt,
  snowClose, snowDanger, snowGrain, snowPick, snowScore, snowStep, snowTap, snowTest, snowWrite
} from '../js/missions-data-expert.js';
import { missionMedals, medalFor } from '../js/missions-progress.js';
import { forgetSlfSnow, loadSlfSnow } from '../js/slf-live.js';

// The SLF's live data for the snow profile mission: the edge function's reducer (supabase/functions/slf-snow/reduce.js) on
// answers shaped like the real ones (measurement-api.slf.ch, aws.slf.ch CAAML), the pit built from them
// (js/missions-data-expert.js snowpackFromSlf) and the browser's request (js/slf-live.js). No network: all data here.

const DT = 1 / 30;

// --- The SLF's answers, shaped like the real ones (16 November 2026, with the snow of a February) -------------------------
function stationRecords({ hs = 182.4, tss = -9.3, ts = [-0.3, -2.1, -3.6, -6.2], ta = -7.8, warm = false, end = '2026-02-10T11:00:00Z' } = {}) {
  const at = Date.parse(end), out = [];
  for (let i = 7 * 48 - 1; i >= 0; i--) {
    const night = Math.cos(((i % 48) / 48) * 2 * Math.PI);
    out.push({
      station_code: 'WFJ2', measure_date: new Date(at - i * 1800000).toISOString().replace('.000Z', 'Z'),
      HS: hs, TA_30MIN_MEAN: (warm && i > 200 ? 3.5 : ta) - night * 2, RH_30MIN_MEAN: 70, TSS_30MIN_MEAN: tss - night * 3,
      TS0_30MIN_MEAN: ts[0], TS25_30MIN_MEAN: ts[1], TS50_30MIN_MEAN: ts[2], TS100_30MIN_MEAN: ts[3],
      RSWR_30MIN_MEAN: 0, VW_30MIN_MEAN: 3, VW_30MIN_MAX: 9.5, DW_30MIN_MEAN: 290, DW_30MIN_SD: null
    });
  }
  out[out.length - 1].TSS_30MIN_MEAN = tss;
  out[out.length - 1].TA_30MIN_MEAN = ta;
  return out;
}
const plotRecords = (hn = [0, 12, 9]) => hn.map((v, i) => ({ station_code: '5WJ0', measure_date: `2026-02-${String(8 + i).padStart(2, '0')}T06:00:00Z`, HS: 180, HN_1D: v, HNW_1D: 0 }))
  .concat([{ station_code: '5WJ0', measure_date: '2026-02-07T06:00:00Z', HS: 170, HN_1D: 40, HNW_1D: 0 }]); // (four days ago: not in the 72 h)
function caaml({ level = 'considerable', problems = ['wind_slab', 'persistent_weak_layers'], split = false } = {}) {
  const problem = (type) => ({ problemType: type, dangerRatingValue: level, validTimePeriod: 'all_day', elevation: { lowerBound: '2200' }, aspects: ['NW', 'N', 'NE', 'E'], comment: '…' });
  return {
    bulletins: [
      { bulletinID: 'a', regions: [{ regionID: 'CH-5122', name: 'Schanfigg' }], dangerRatings: [{ mainValue: 'high', validTimePeriod: 'all_day' }], avalancheProblems: [] },
      {
        bulletinID: 'b', validTime: { startTime: '2026-02-09T16:00:00Z', endTime: '2026-02-10T16:00:00Z' }, publicationTime: '2026-02-09T16:00:00Z',
        regions: [{ regionID: 'CH-5121', name: 'Arosa' }, { regionID: 'CH-5123', name: 'Davos' }],
        dangerRatings: split
          ? [{ mainValue: 'moderate', validTimePeriod: 'all_day', elevation: { upperBound: '2000' } }, { mainValue: level, validTimePeriod: 'all_day', elevation: { lowerBound: '2000' }, customData: { CH: { subdivision: 'plus' } } }]
          : [{ mainValue: level, validTimePeriod: 'all_day', customData: { CH: { subdivision: 'minus' } } }],
        avalancheProblems: [...problems.map(problem), { problemType: 'wet_snow', dangerRatingValue: 'low', elevation: { upperBound: '1800' }, aspects: ['S'], validTimePeriod: 'later' }]
      }
    ]
  };
}
const NOW = Date.parse('2026-02-10T12:10:00Z');
const live = (over = {}, input = {}) => ({ ...reduceSlf({ records: stationRecords(over), plot: plotRecords(over.hn), caaml: caaml(over), ...input }, NOW) });

// --- The edge function's reducer ---------------------------------------------------------------------------------------
test('the reducer boils the three answers down to the pit\'s facts', () => {
  const l = live();
  assert.equal(l.source, 'SLF');
  assert.equal(l.link, 'https://www.slf.ch');
  assert.equal(l.licence, 'CC BY 4.0');
  assert.equal(l.station, 'WFJ2');
  assert.equal(l.field, '5WJ0');
  assert.equal(l.fetched, '2026-02-10T12:10:00.000Z');
  assert.equal(l.measured, '2026-02-10T11:00:00.000Z', 'the latest record');
  assert.equal(l.hs, 182.4);
  assert.equal(l.tss, -9.3);
  assert.equal(l.ta, -7.8);
  assert.deepEqual(l.ts, { 0: -0.3, 25: -2.1, 50: -3.6, 100: -6.2 });
  assert.ok(l.ta24max > l.ta24min && l.ta7max >= l.ta24max);
  assert.deepEqual(l.newSnow, { date: '2026-02-10T06:00:00.000Z', h24: 9, h72: 21, hs: 180 }, 'the last three mornings, not the fourth');
  assert.equal(l.bulletin.name, 'Davos');
  assert.equal(l.bulletin.region, 'CH-5123');
  assert.equal(l.bulletin.level, 3);
  assert.equal(l.bulletin.subdivision, 'minus');
  assert.deepEqual(l.bulletin.problems.map((p) => [p.type, p.atField]), [['wind_slab', true], ['persistent_weak_layers', true], ['wet_snow', false]]);
  assert.deepEqual(l.bulletin.problems[0].aspects, ['NW', 'N', 'NE', 'E']);
  assert.equal(l.bulletin.problems[0].lower, 2200);
  assert.deepEqual(l.bulletin.valid, { start: '2026-02-09T16:00:00Z', end: '2026-02-10T16:00:00Z' });
  assert.ok(JSON.stringify(l).length < 1500, 'small');
});

test('the reducer: the level that holds at 2536 m, missing sources as null', () => {
  assert.equal(live({ level: 'high', split: true }).bulletin.level, 4, 'the band above 2000 m, not the valleys');
  assert.equal(live({ split: true }).bulletin.subdivision, 'plus');
  assert.equal(reduceBulletin({ bulletins: [{ regions: [{ regionID: 'CH-5123', name: 'Davos' }], avalancheProblems: [] }] }).level, null, 'no rating');
  assert.equal(reduceBulletin({ bulletins: [] }), null);
  assert.equal(reduceBulletin(null), null);
  assert.equal(reduceStation([]), null);
  assert.equal(reduceStation([{ measure_date: 'x', HS: 3 }]), null);
  assert.equal(reducePlot(null), null);
  const partial = reduceSlf({ records: null, plot: { detail: 'nonsense' }, caaml: caaml() }, NOW);
  assert.equal(partial.hs, null);
  assert.equal(partial.measured, null);
  assert.equal(partial.newSnow, null);
  assert.equal(partial.bulletin.level, 3);
  assert.ok(hasData(partial));
  assert.ok(!hasData(reduceSlf({}, NOW)), 'nothing at all');
});

// --- The pit from the data ---------------------------------------------------------------------------------------------
function checkStack(s) {
  assert.equal(s.layers[0].top, s.H);
  assert.equal(s.layers[s.layers.length - 1].bottom, 0);
  for (let i = 1; i < s.layers.length; i++) assert.equal(s.layers[i].top, s.layers[i - 1].bottom);
  for (const l of s.layers) {
    assert.ok(l.top - l.bottom >= 3, `a layer of ${l.top - l.bottom} cm`);
    assert.ok(Number.isInteger(l.hard) && l.hard >= 0 && l.hard < HARDNESS.length);
    assert.ok(GRAINS.some((g) => g.id === l.grain));
  }
  assert.ok(s.layers.length >= 3 && s.layers.length <= 6, 'six at most: the pick buttons and the keys 1-6');
  assert.equal(s.danger, dangerFor(s));
}

test('a deep winter with a persistent weak layer: the depth from the station, the weak layer, the bulletin\'s level', () => {
  for (let seed = 1; seed < 60; seed++) {
    const s = snowpackFromSlf(live(), seed);
    checkStack(s);
    assert.equal(s.source.kind, 'slf');
    assert.equal(s.H, 182, 'HS');
    assert.equal(s.newSnow, 17, 'the three days\' 21 cm, settled');
    assert.equal(s.layers[0].grain, 'PP');
    assert.equal(s.layers[0].top - s.layers[0].bottom, 17);
    const weak = s.layers[s.weak];
    assert.ok(weak.weak && weak.hard <= 1 && ['FC', 'DH'].includes(weak.grain), 'facets or depth hoar, soft');
    assert.ok(s.layers[s.weak - 1].hard > weak.hard || s.layers[s.weak - 1].grain === 'PP', 'under something stiffer');
    assert.ok(s.weak === s.layers.length - 1 || s.layers[s.weak + 1].grain === 'MF', 'at the base, or on the crust');
    assert.ok(s.ct >= 11 && s.ct <= 20, 'from the elbow');
    assert.equal(s.danger, 3, 'what the bulletin says');
    assert.equal(s.bulletin, 3);
  }
  assert.deepEqual(snowpackFromSlf(live(), 5), snowpackFromSlf(live(), 5), 'by the seed');
  assert.notDeepEqual(snowpackFromSlf(live(), 5).layers, snowpackFromSlf(live(), 6).layers);
});

test('the temperatures are the measured ones: surface, the covered mast sensors, the ground', () => {
  const s = snowpackFromSlf(live(), 3);
  assert.equal(snowTempAt(s, 0), -9.3, 'TSS');
  assert.equal(snowTempAt(s, s.H - 100), -6.2, 'TS100');
  assert.equal(snowTempAt(s, s.H - 50), -3.6, 'TS50');
  assert.equal(snowTempAt(s, s.H - 25), -2.1, 'TS25');
  assert.equal(snowTempAt(s, s.H), -0.3, 'TS0, the ground');
  assert.equal(snowTempAt(s, (s.H - 100) / 2), Math.round(((-9.3 - 6.2) / 2) * 10) / 10, 'straight between');
  // a mast sensor the snow has not reached measures the air: left out; a reading above 0 °C is melting snow
  const shallow = snowpackFromSlf(live({ hs: 90, ts: [0.4, -1, -2, -14], tss: 0.6 }), 3);
  assert.deepEqual(shallow.temps.map((p) => p.h), [0, 25, 50, 90]);
  assert.equal(snowTempAt(shallow, 0), 0);
  assert.equal(snowTempAt(shallow, 90), 0);
  assert.equal(shallow.surfaceT, 0);
});

test('without a persistent weak layer the column breaks in the slab, or not at all', () => {
  for (let seed = 1; seed < 30; seed++) {
    const slab = snowpackFromSlf(live({ problems: ['wind_slab'], level: 'moderate' }), seed);
    checkStack(slab);
    assert.ok(!slab.layers.some((l) => l.weak), 'no weak layer');
    assert.equal(slab.weak, 1, 'under the top layer: the new snow\'s base');
    assert.ok(slab.ct >= 21 && slab.ct <= 28, 'from the shoulder: moderate');
    assert.equal(slab.danger, 2);
    const calm = snowpackFromSlf(live({ problems: [], level: 'low', hn: [0, 0, 1] }), seed);
    checkStack(calm);
    assert.equal(calm.ct, null, 'CTN');
    assert.equal(calm.weak, -1);
    assert.equal(calm.newSnow, 0, 'no new snow layer');
    assert.equal(calm.danger, 1);
  }
  // heavy new snow: the rule's extra level is part of the bulletin's
  const fresh = snowpackFromSlf(live({ problems: ['new_snow'], level: 'high', hn: [20, 15, 10] }), 4);
  assert.equal(fresh.newSnow, 36);
  assert.ok(fresh.ct >= 11 && fresh.ct <= 20);
  assert.equal(fresh.danger, 4);
  // a warm week leaves a melt-freeze crust on top of the old snow
  const warm = snowpackFromSlf(live({ problems: ['wind_slab'], level: 'moderate', warm: true }), 2);
  assert.equal(warm.layers[1].grain, 'MF');
});

test('too little snow, old or no data: the training profile, and why', () => {
  const today = live({ hs: 14.8 });
  assert.deepEqual(slfUsable(today), { ok: false, reason: 'shallow', hs: 14.8 });
  const s = snowpackFromSlf(today, 9);
  assert.deepEqual({ ...s, bulletin: undefined, source: undefined }, { ...createSnowpack(9), bulletin: undefined, source: undefined });
  assert.deepEqual(s.source, { kind: 'training', reason: 'shallow', hs: 14.8, measured: '2026-02-10T11:00:00.000Z' });
  assert.equal(slfNote(s).text, 'SLF: only 14.8 cm on the Weissfluhjoch today: a training profile');
  assert.equal(slfNote(s).link, SLF_LIVE.link);
  assert.equal(snowpackFromSlf(null, 9).source.reason, 'none');
  assert.equal(slfNote(snowpackFromSlf(null, 9)).text, 'No SLF data today: a training profile');
  assert.equal(slfNote(snowpackFromSlf(null, 9)).link, null);
  assert.equal(snowpackFromSlf({ source: 'SLF', hs: null }, 9).source.reason, 'none');
  const old = { ...live(), fetched: '2026-02-12T12:00:00.000Z' };
  assert.equal(snowpackFromSlf(old, 9).source.reason, 'stale');
  assert.equal(createSnowGame(9, null).snow.source.reason, 'none');
  assert.equal(createSnowGame(9).snow.source, undefined, 'without the live argument: the training profile alone');
});

test('the source line names the SLF and the measuring time, in Davos\' time', () => {
  assert.equal(slfTime('2026-02-10T11:00:00Z'), '10.02. 12:00');
  assert.equal(slfTime('2026-07-10T11:00:00Z'), '10.07. 13:00', 'summer time');
  assert.equal(slfTime('nonsense'), '');
  const note = slfNote(snowpackFromSlf(live(), 1));
  assert.equal(note.text, 'Weissfluhjoch 10.02. 12:00 · 182.4 cm of snow · bulletin level 3');
  assert.equal(note.link, 'https://www.slf.ch');
});

// --- Played on today's snow: the scoring keeps its range -----------------------------------------------------------------
function play(g) {
  const s = g.snow;
  while (g.stage === 'dig') snowStep(g, { dig: true }, DT);
  while (g.stage === 'layers') {
    snowTest(g, s.layers[g.layer].hard);
    while (g.busy > 0) snowStep(g, {}, DT);
    snowWrite(g);
    snowGrain(g, s.layers[g.layer].grain);
  }
  while (g.stage === 'temp') {
    for (let t = 0; t < 1.2; t += DT) snowStep(g, { hold: true }, DT);
    snowStep(g, {}, DT);
  }
  while (g.stage === 'ct') { snowTap(g); snowStep(g, {}, DT); }
  if (g.stage === 'pick') snowPick(g, s.weak);
  assert.ok(snowDanger(g, s.danger));
  assert.ok(snowClose(g));
  return g;
}

test('a careful, quick observer earns gold on the live pits too, the column that will not break included', () => {
  const cases = [live(), live({ problems: ['wind_slab'], level: 'moderate' }), live({ problems: [], level: 'low', hn: [0, 0, 0] }), live({ hs: 330, level: 'high', hn: [30, 20, 10] })];
  for (const l of cases) {
    for (const seed of [1, 7, 23]) {
      const g = play(createSnowGame(seed, l)), r = g.result;
      assert.equal(r.hardness + r.grain + r.temp + r.ct + r.danger, 850, `${l.hs} cm, seed ${seed}`);
      assert.ok(r.total <= 1000);
      assert.equal(medalFor(r.total, missionMedals(SNOW_MISSION), true), 'gold', `${l.hs} cm: ${r.total}, ${g.t.toFixed(0)} s`);
      if (g.snow.ct == null) {
        assert.equal(g.record.ctTap, null);
        assert.equal(g.record.ctLayer, -1);
      }
    }
  }
});

test('a deep pit\'s extra readings are given their time back', () => {
  const g = createSnowGame(3, live({ hs: 330 }));
  assert.equal(g.depths.length, 34);
  g.record.danger = g.snow.danger;
  g.t = SNOW.points.timeT[0] + (34 - SNOW.readingsFree) * SNOW.readingTime;
  assert.equal(snowScore(g).time, SNOW.points.time);
  const t = createSnowGame(3);
  t.t = SNOW.points.timeT[0];
  assert.equal(snowScore(t).time, SNOW.points.time, 'the training pit as before');
  t.t = SNOW.points.timeT[0] + 1;
  assert.ok(snowScore(t).time < SNOW.points.time);
});

// --- The browser's request ----------------------------------------------------------------------------------------------
test('the browser asks the function once per half hour, and anything amiss is null', async () => {
  forgetSlfSnow();
  const asked = [];
  const ok = (body) => async (url) => { asked.push(url); return { ok: true, json: async () => body }; };
  const data = live();
  assert.deepEqual(await loadSlfSnow({ fetcher: ok(data), url: 'https://x.test/functions/v1/slf-snow', now: 0 }), data);
  assert.deepEqual(await loadSlfSnow({ fetcher: ok(null), url: 'https://x.test/functions/v1/slf-snow', now: 60000 }), data, 'kept');
  assert.equal(asked.length, 1);
  forgetSlfSnow();
  assert.equal(await loadSlfSnow({ fetcher: async () => ({ ok: false, status: 503 }), url: 'u', now: 0 }), null);
  assert.equal(await loadSlfSnow({ fetcher: ok({ error: 'slf' }), url: 'u', now: 1 }), null, 'a failure is not kept');
  assert.equal(await loadSlfSnow({ fetcher: async () => { throw new TypeError('offline'); }, url: 'u', now: 2 }), null);
  assert.equal(await loadSlfSnow({ fetcher: ok(data), url: '', now: 3 }), null, 'no backend');
  forgetSlfSnow();
});
