// supabase/functions/slf-snow/reduce.js
// What the snow profile mission (js/missions-data-expert.js snowpackFromSlf) needs of the SLF's live data, boiled down from
// three answers to a few hundred bytes. No Deno and no network in here (tests/slf-snow.test.mjs drives it with Node).
//
// The SLF (WSL Institute for Snow and Avalanche Research, Davos) publishes its measurements and the avalanche bulletin
// under CC BY 4.0 (www.slf.ch); the game names it with a link wherever the data shows. The three sources:
//  - the automatic station WFJ2 on the Weissfluhjoch (IMIS network, measurement-api.slf.ch: half-hourly records), right
//    beside the measuring field: the snow height HS, the air TA, the snow surface TSS (infrared) and the four temperature
//    sensors TS0/25/50/100 on a mast, 0, 25, 50 and 100 cm above the ground (a sensor the snow has not covered yet
//    measures the air: the mission reads only those under the surface);
//  - the measuring field itself, the study plot 5WJ0 (2536 m), where an observer reads the new snow board every morning at
//    06:00 (HN_1D, cm): the last day and the last three summed;
//  - the bulletin (aws.slf.ch, CAAML JSON), for the warning region Davos (CH-5123): the danger level that holds at the
//    field's 2536 m (the worse of a day split into earlier and later) and the avalanche problems with their aspects and
//    elevations.

export const STATION = 'WFJ2';
export const FIELD = '5WJ0';
export const FIELD_ELEVATION = 2536; // m
export const REGION = 'CH-5123'; // the warning region Davos
export const SLF_LINK = 'https://www.slf.ch';
export const DANGER_VALUES = { low: 1, moderate: 2, considerable: 3, high: 4, very_high: 5 };
export const PROBLEMS = ['new_snow', 'wind_slab', 'persistent_weak_layers', 'wet_snow', 'gliding_snow', 'favourable_situation'];
export const SENSORS = [0, 25, 50, 100]; // cm above the ground (TS0_30MIN_MEAN …)

const H = 3600000; // ms
const num = (v, digits = 1) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : null);
const time = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
const bound = (v) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null; };
/** An elevation band { lowerBound, upperBound } (CAAML, metres as strings; 'treeline' counts as no bound) holds the field */
const holdsField = (e) => {
  const lo = bound(e?.lowerBound), hi = bound(e?.upperBound);
  return (lo == null || FIELD_ELEVATION >= lo) && (hi == null || FIELD_ELEVATION <= hi);
};
const extreme = (list, key, pick) => {
  const values = list.map((r) => r[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  return values.length ? num(pick(...values)) : null;
};

/** The station's records (the API's list, oldest first or not): the latest reading and the last day's and week's extremes */
export function reduceStation(records) {
  const list = (Array.isArray(records) ? records : [])
    .filter((r) => r && time(r.measure_date) != null)
    .sort((a, b) => time(a.measure_date) - time(b.measure_date));
  const latest = [...list].reverse().find((r) => typeof r.HS === 'number');
  if (!latest) return null;
  const at = time(latest.measure_date);
  const day = list.filter((r) => time(r.measure_date) > at - 24 * H);
  const ts = {};
  for (const h of SENSORS) ts[h] = num(latest[`TS${h}_30MIN_MEAN`]);
  return {
    measured: new Date(at).toISOString(),
    hs: num(latest.HS),
    ta: num(latest.TA_30MIN_MEAN),
    tss: num(latest.TSS_30MIN_MEAN),
    ts,
    // (a warm spell leaves a melt-freeze crust: the day's and the week's warmest air, the day's warmest snow surface)
    ta24min: extreme(day, 'TA_30MIN_MEAN', Math.min),
    ta24max: extreme(day, 'TA_30MIN_MEAN', Math.max),
    tss24max: extreme(day, 'TSS_30MIN_MEAN', Math.max),
    ta7max: extreme(list, 'TA_30MIN_MEAN', Math.max),
    wind24max: extreme(day, 'VW_30MIN_MAX', Math.max) // m/s
  };
}

/** The measuring field's morning readings: the new snow of the last day and of the last three */
export function reducePlot(records) {
  const list = (Array.isArray(records) ? records : [])
    .filter((r) => r && time(r.measure_date) != null)
    .sort((a, b) => time(a.measure_date) - time(b.measure_date));
  const latest = list[list.length - 1];
  if (!latest) return null;
  const at = time(latest.measure_date);
  const hn = (r) => (typeof r.HN_1D === 'number' && r.HN_1D > 0 ? r.HN_1D : 0);
  const days3 = list.filter((r) => time(r.measure_date) > at - 72 * H + H);
  return {
    date: new Date(at).toISOString(),
    h24: num(hn(latest)),
    h72: num(days3.reduce((sum, r) => sum + hn(r), 0)),
    hs: num(latest.HS)
  };
}

/** The bulletin for Davos: the level at the field and the problems (null when the region is not in it, or has no rating) */
export function reduceBulletin(caaml, region = REGION) {
  const bulletins = Array.isArray(caaml?.bulletins) ? caaml.bulletins : [];
  const b = bulletins.find((x) => Array.isArray(x?.regions) && x.regions.some((r) => r?.regionID === region));
  if (!b) return null;
  const name = b.regions.find((r) => r.regionID === region)?.name ?? null;
  // the worse rating that holds at 2536 m (a day can be split: 'earlier' and 'later', for the wet snow of the afternoon)
  let level = null, subdivision = null;
  for (const d of Array.isArray(b.dangerRatings) ? b.dangerRatings : []) {
    const v = DANGER_VALUES[d?.mainValue];
    if (!v || !holdsField(d.elevation)) continue;
    if (level == null || v > level) { level = v; subdivision = d.customData?.CH?.subdivision ?? null; }
  }
  const problems = (Array.isArray(b.avalancheProblems) ? b.avalancheProblems : [])
    .filter((p) => PROBLEMS.includes(p?.problemType))
    .map((p) => ({
      type: p.problemType,
      level: DANGER_VALUES[p.dangerRatingValue] ?? null,
      lower: bound(p.elevation?.lowerBound),
      upper: bound(p.elevation?.upperBound),
      aspects: Array.isArray(p.aspects) ? p.aspects.filter((a) => typeof a === 'string').slice(0, 8) : [],
      period: p.validTimePeriod ?? 'all_day',
      atField: holdsField(p.elevation)
    }));
  return {
    region, name, level, subdivision, problems,
    valid: { start: b.validTime?.startTime ?? null, end: b.validTime?.endTime ?? null },
    published: b.publicationTime ?? null
  };
}

/** The answer of the function: each part null when its source failed. `now`: a Date or ms */
export function reduceSlf({ records = null, plot = null, caaml = null } = {}, now = Date.now()) {
  let station = null, field = null, bulletin = null;
  try { station = reduceStation(records); } catch { /* (a source that answered nonsense is a missing one) */ }
  try { field = reducePlot(plot); } catch { /* */ }
  try { bulletin = reduceBulletin(caaml); } catch { /* */ }
  return {
    v: 1,
    source: 'SLF', link: SLF_LINK, licence: 'CC BY 4.0',
    fetched: new Date(now).toISOString(),
    station: STATION, field: FIELD, elevation: FIELD_ELEVATION,
    ...(station || { measured: null, hs: null }),
    newSnow: field,
    bulletin
  };
}

/** Whether an answer holds anything worth keeping (all three sources down: no) */
export const hasData = (live) => !!live && (live.hs != null || live.bulletin != null || live.newSnow != null);
