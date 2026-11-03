// js/missions-data-hike.js
// Two hikes in the east of the map (js/missions-data.js spreads HIKE_MISSIONS into MISSIONS; js/missions-hike.js has their
// runtime: the waymarks, the clock and the HUD). No three.js and no DOM in here (tests/missions-hike.test.mjs).
//
//  - schwarzhorn-sunrise: up the Flüela Schwarzhorn (3146 m) before the sun, on the tour the user recorded in the swisstopo
//    app, from the road below the Flüelapass (2333 m). The one mission whose clock moves: the dawn advances with the climb and
//    with the time taken, whichever is further, and the sun comes up when it comes up. On the summit first: you watch it rise.
//  - joeriseen: from the Wägerhus over the Jöriflüelafurgga to the Jöriseen, on the OSM paths, in daylight.
// Both score 1800 points less the seconds taken and the seconds spent off the path. The world frame is js/davos-frame.js.
import { SCHWARZHORN_ROUTE, JOERISEEN_ROUTE } from './missions-hike-routes.js';
import { minuteAtHeight, SUNRISE_HEIGHT } from './solar.js';

const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
const headingTo = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);

export const HIKE = {
  full: 1800, // the points of a hike taking no time at all
  offTrail: 22, // m from the line: off the path
  stages: 7, // waypoints along the line
  reach: 14, // m: a waypoint is reached this close
  look: 90 // m along the line searched for where the walker is
};

/** The line's cumulative lengths */
export function lineLengths(route) {
  const s = [0];
  for (let i = 1; i < route.length; i++) s.push(s[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  return s;
}
/** The point at `along` m on the line */
export function pointAt(route, lengths, along) {
  const a = Math.max(0, Math.min(lengths[lengths.length - 1], along));
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < a) i++;
  const t = (a - lengths[i - 1]) / ((lengths[i] - lengths[i - 1]) || 1);
  return { x: route[i - 1][0] + (route[i][0] - route[i - 1][0]) * t, z: route[i - 1][1] + (route[i][1] - route[i - 1][1]) * t };
}
/** Where on the line the walker at (x, z) stands, searching from `from` m forward and back: { along, off } */
export function locate(route, lengths, x, z, from = 0, look = HIKE.look) {
  let best = Infinity, along = from;
  for (let i = 1; i < route.length; i++) {
    if (lengths[i] < from - look || lengths[i - 1] > from + look) continue;
    const [ax, az] = route[i - 1], dx = route[i][0] - ax, dz = route[i][1] - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best) { best = d; along = lengths[i - 1] + (lengths[i] - lengths[i - 1]) * t; }
  }
  return { along, off: best };
}

/** The hike's state: what has been walked, the time and the time off the path */
export function createHike(route) {
  const lengths = lineLengths(route);
  return { route, lengths, total: lengths[lengths.length - 1], along: 0, furthest: 0, off: 0, offTime: 0, time: 0, arrivedAt: null, photos: 0 };
}
export function stepHike(h, x, z, dt) {
  if (h.arrivedAt !== null) return;
  h.time += dt;
  const { along, off } = locate(h.route, h.lengths, x, z, h.furthest);
  h.along = along; h.off = off;
  if (off <= HIKE.offTrail) h.furthest = Math.max(h.furthest, along);
  else h.offTime += dt;
}
export const hikeScore = (h) => Math.max(0, Math.round(HIKE.full - (h.arrivedAt ?? h.time) - h.offTime));
export const hikeProgress = (h) => h.furthest / (h.total || 1);

// --- The dawn ------------------------------------------------------------------------------------------------------
export const DAWN = {
  startHeight: -12, // deg: the sun's height at the start (the stars still out)
  climb: 480, // s of hiking from the start's dark to the sunrise, if the climb doesn't get there first
  afterglow: 12, // game minutes the clock runs on past the sunrise
  watch: 14 // s from the summit to the sunrise, when you are there before it
};
export const dawnStart = () => minuteAtHeight(DAWN.startHeight, 0, true);
export const sunriseMinute = () => minuteAtHeight(SUNRISE_HEIGHT, 0, true);
/** The clock's minute of the hike: as far on as the climb got, or as the time taken, whichever is further; the climb itself leaves a little of the night to the summit */
export function dawnMinute(h) {
  const start = dawnStart(), rise = sunriseMinute();
  const f = Math.max(hikeProgress(h) * 0.92, h.time / DAWN.climb);
  return start + (rise - start) * f;
}

// --- The two missions ------------------------------------------------------------------------------------------------
function stages(route, count, titles) {
  const lengths = lineLengths(route), total = lengths[lengths.length - 1];
  return Array.from({ length: count }, (_, k) => {
    const along = (total * (k + 1)) / count;
    return { along, ...pointAt(route, lengths, along), title: titles[k] };
  });
}
function stageObjective(stage, i, count) {
  return {
    id: `stage${i + 1}`,
    title: stage.title,
    allowModes: ['person'],
    check(ctx, state) {
      const h = state.hike, d = Math.hypot(ctx.x - stage.x, ctx.z - stage.z);
      const done = d < HIKE.reach && h.furthest >= stage.along - HIKE.look;
      if (done && i === count - 1 && h.arrivedAt === null) h.arrivedAt = h.time;
      return {
        done,
        progress: hikeProgress(h),
        text: `${fmtDist(h.total - h.furthest)} to go · stage ${i + 1} of ${count}`,
        target: { x: stage.x, z: stage.z, r: HIKE.reach, style: 'plain' },
        hint: h.off > HIKE.offTrail ? 'Off the path: back to the waymarks' : null
      };
    }
  };
}

export const SCHWARZHORN_STAGES = stages(SCHWARZHORN_ROUTE, HIKE.stages, [
  'Up from the Flüelastrasse', 'Into the scree', 'On up the valley', 'Up towards the ridge',
  'Along the ridge', 'Over the last rocks', 'To the summit of the Schwarzhorn'
]);
const SH_START = SCHWARZHORN_ROUTE[0];
// Gold: on top before the sun; the medals then fall with the minutes after it
export const SCHWARZHORN_MISSION = {
  id: 'schwarzhorn-sunrise',
  title: 'Sunrise on the Flüela Schwarzhorn',
  intro: 'Four in the morning on the road below the Flüelapass, 2333 m, and 800 metres of climbing to the summit of the Schwarzhorn at 3146 m. The sky goes on getting lighter while you climb, and it won’t wait for you. Follow the red and white waymarks. Up there before the sun: gold.',
  mode: 'person',
  season: 'summer',
  time: 'predawn',
  features: ['hikeTrail', 'sunriseClock'],
  scoreMode: true,
  scoreUnit: 'pts',
  medals: { gold: HIKE.full - DAWN.climb, silver: HIKE.full - DAWN.climb - 120, bronze: HIKE.full - DAWN.climb - 360 },
  colour: '#e0703a',
  icon: 'summit',
  finish: 'The sun over the ridges, the valleys still in shadow, and a very cold thermos.',
  start: { x: SH_START[0], z: SH_START[1], heading: headingTo(SCHWARZHORN_ROUTE[0], SCHWARZHORN_ROUTE[3]) },
  props: [],
  createState() { return { hike: createHike(SCHWARZHORN_ROUTE), watched: false }; },
  score: (state) => hikeScore(state.hike),
  summary(state) {
    const h = state.hike, t = Math.round(h.arrivedAt ?? h.time);
    return [`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} to the summit · ${Math.round(h.offTime)} s off the path · ${h.arrivedAt !== null && h.arrivedAt <= DAWN.climb ? 'before the sun' : 'after the sun'}`];
  },
  objectives: [
    ...SCHWARZHORN_STAGES.map((s, i) => stageObjective(s, i, SCHWARZHORN_STAGES.length)),
    {
      id: 'watch',
      title: 'Watch the sun come up',
      allowModes: ['person'],
      check(ctx, state) {
        return { done: state.watched, progress: null, text: 'Turn to the east', target: null, hint: null };
      }
    }
  ]
};

export const JOERISEEN_STAGES = stages(JOERISEEN_ROUTE, 5, [
  'Up from the Wägerhus', 'Into the Winterlücke', 'On up the slope', 'Over the Jöriflüelafurgga', 'Down to the Jöriseen'
]);
const JO_START = JOERISEEN_ROUTE[0];
export const JOERISEEN_MISSION = {
  id: 'joeriseen',
  title: 'The hike to the Jöriseen',
  intro: 'A clear day at the Wägerhus on the Flüelastrasse, and the whole Jöri basin waiting behind the ridge: a score of small lakes under the Jörigletscher. Follow the red and white waymarks up and over. Stay on the path; the quicker you are, the more you score.',
  mode: 'person',
  season: 'summer',
  time: 'midday',
  features: ['hikeTrail'],
  scoreMode: true,
  scoreUnit: 'pts',
  medals: { gold: HIKE.full - 640, silver: HIKE.full - 820, bronze: HIKE.full - 1100 },
  colour: '#3aa0c8',
  icon: 'lake',
  finish: 'Boots off at the Jöriseen: the water is as cold as it looks.',
  start: { x: JO_START[0], z: JO_START[1], heading: headingTo(JOERISEEN_ROUTE[0], JOERISEEN_ROUTE[Math.min(3, JOERISEEN_ROUTE.length - 1)]) },
  props: [],
  createState() { return { hike: createHike(JOERISEEN_ROUTE) }; },
  score: (state) => hikeScore(state.hike),
  summary(state) {
    const h = state.hike, t = Math.round(h.arrivedAt ?? h.time);
    return [`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} for ${fmtDist(h.total)} · ${Math.round(h.offTime)} s off the path`];
  },
  objectives: JOERISEEN_STAGES.map((s, i) => stageObjective(s, i, JOERISEEN_STAGES.length))
};

export const HIKE_MISSIONS = [SCHWARZHORN_MISSION, JOERISEEN_MISSION];
