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
import { seededRandom } from './missions-data-expert.js';

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
  startHeight: -8, // deg: the sun's height at the start (the first grey in the east: any darker and a phone shows nothing of the path)
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

// --- The headlamp --------------------------------------------------------------------------------------------------
// No light in the scene: on a phone (js/quality.js, no clustered lights) one more light would rebuild every lit shader, so
// the beam is worked out here and drawn as a sheet laid over the ground, the same on every device.
export const LAMP = {
  rays: 15, rings: 14,
  near: 0.8, far: 34, // m
  spread: 0.46, // rad either side of the heading
  off: 22 // game minutes before the sunrise at which it has faded out
};
export const lampVertexCount = () => LAMP.rays * LAMP.rings;
/** How bright the lamp is at this minute of the day: full in the dark, gone by the time you don't need it */
export const lampStrength = (minute) => Math.max(0, Math.min(1, (sunriseMinute() - minute) / LAMP.off));
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * The pool of light of a lamp at (x, y, z) looking along `heading`, on the ground `heightAt` gives: a fan of rays, each walked
 * outward so that a rise throws the ground behind it into shadow, and a slope facing the lamp takes more light than one
 * turned away. `pos` gets the sheet's vertices, `lit` its brightness (0-1), both by ray and ring.
 */
export function lampPool(x, y, z, heading, heightAt, pos, lit, lift = 0.24) {
  const { rays, rings, near, far, spread } = LAMP;
  for (let a = 0; a < rays; a++) {
    const u = a / (rays - 1) * 2 - 1, ang = heading + u * spread, sx = Math.sin(ang), cx = Math.cos(ang);
    let horizon = -Infinity, prevY = null, prevR = 0;
    for (let i = 0; i < rings; i++) {
      const f = i / (rings - 1), r = near + (far - near) * f * Math.sqrt(f), px = x + sx * r, pz = z + cx * r, h = heightAt(px, pz);
      const k = 3 * (a * rings + i);
      pos[k] = px; pos[k + 1] = h + lift; pos[k + 2] = pz;
      // seen from the lamp: above everything nearer on this ray, or behind it
      const slope = (h - y) / r, seen = smooth(-0.03, 0.03, slope - horizon);
      horizon = Math.max(horizon, slope);
      // the ground's tilt along the ray against the beam's: 1 where it faces the lamp, less the flatter the beam grazes it
      const rise = prevY === null ? 0 : (h - prevY) / Math.max(0.1, r - prevR), facing = Math.max(0.12, Math.min(1, ((y - h) / r + rise) * 1.15 + 0.3));
      prevY = h; prevR = r;
      const cone = 1 - smooth(0.12, 1, Math.abs(u)), reach = 1 / (1 + (r / 8) ** 2), edge = 1 - smooth(0.4, 1, f), foot = smooth(0, 0.1, f);
      lit[a * rings + i] = seen * facing * cone * reach * edge * foot;
    }
  }
}

// --- The animals on the way --------------------------------------------------------------------------------------------
// Bands of chamois and ibex a little off the line. They graze and take a few steps; come too near and they are off, the
// chamois in long bounds and much sooner than the ibex, which has seen hikers before, then they stand and look back.
export const WILD = {
  chamois: { scare: 34, flee: 8.5, hop: 0.5, scale: 0.92 },
  ibex: { scare: 15, flee: 4.5, hop: 0.22, scale: 1 },
  stray: 26, // m from home on a quiet day
  range: 95 // m from home at most, fleeing
};
/** `bands`: { kind, at (share of the line), side (m to the right of it), count } */
export function createWildlife(route, bands, seed = 5) {
  const rand = seededRandom(seed), lengths = lineLengths(route), total = lengths[lengths.length - 1], animals = [];
  for (const b of bands) {
    const p = pointAt(route, lengths, total * b.at), q = pointAt(route, lengths, total * b.at + 4), dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    const hx = p.x + (dz / L) * b.side, hz = p.z - (dx / L) * b.side;
    for (let i = 0; i < b.count; i++) {
      const ang = rand() * Math.PI * 2, r = 2 + rand() * 9;
      const x = hx + Math.cos(ang) * r, z = hz + Math.sin(ang) * r;
      animals.push({
        kind: b.kind, young: rand() < 0.3, x, z, hx, hz, heading: rand() * Math.PI * 2, state: 'graze', t: rand() * 8, tx: null, tz: null, air: 0, phase: rand() * 6,
        startX: x, startZ: z
      });
    }
  }
  return { animals, rand };
}
export function resetWildlife(w) {
  for (const a of w.animals) { a.x = a.startX; a.z = a.startZ; a.state = 'graze'; a.t = w.rand() * 8; a.tx = a.tz = null; a.air = 0; }
}
const turnTo = (from, to, by) => { const d = Math.atan2(Math.sin(to - from), Math.cos(to - from)); return from + Math.sign(d) * Math.min(Math.abs(d), by); };
/** One step of every animal near the walker; `wet(x, z)`: where none of them goes */
export function stepWildlife(w, dt, px, pz, wet = () => false) {
  const { rand, animals } = w;
  for (const a of animals) {
    const pd = Math.hypot(a.x - px, a.z - pz);
    if (pd > 450) continue;
    const spec = WILD[a.kind];
    a.t -= dt;
    if (pd < spec.scare && a.state !== 'flee') {
      // away from the walker, a bit to the side, and not out of its own country
      let ang = Math.atan2(a.x - px, a.z - pz) + (rand() - 0.5) * 0.9;
      let tx = a.x + Math.sin(ang) * spec.scare * 1.5, tz = a.z + Math.cos(ang) * spec.scare * 1.5;
      for (let k = 0; k < 6 && (wet(tx, tz) || Math.hypot(tx - a.hx, tz - a.hz) > WILD.range); k++) {
        ang += (k % 2 ? 1 : -1) * (k + 1) * 0.5;
        tx = a.x + Math.sin(ang) * spec.scare * 1.5; tz = a.z + Math.cos(ang) * spec.scare * 1.5;
      }
      a.state = 'flee'; a.t = 8; a.tx = tx; a.tz = tz;
    }
    if (a.state === 'graze' && a.t <= 0) {
      const tx = a.hx + (rand() - 0.5) * 2 * WILD.stray, tz = a.hz + (rand() - 0.5) * 2 * WILD.stray;
      if (wet(tx, tz)) a.t = 2;
      else { a.state = 'walk'; a.t = 12; a.tx = a.x + (tx - a.x) * 0.2; a.tz = a.z + (tz - a.z) * 0.2; }
    }
    if (a.state === 'walk' || a.state === 'flee') {
      const fleeing = a.state === 'flee', dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.3) {
        a.heading = turnTo(a.heading, Math.atan2(dx, dz), dt * (fleeing ? 7 : 2.5));
        const s = Math.min(d, (fleeing ? spec.flee : 0.7) * dt);
        const nx = a.x + (dx / d) * s, nz = a.z + (dz / d) * s;
        if (!wet(nx, nz)) { a.x = nx; a.z = nz; } else a.t = 0;
      }
      if (d <= 0.3 || a.t <= 0) {
        a.state = fleeing ? 'stand' : 'graze'; a.t = fleeing ? 5 + rand() * 5 : 4 + rand() * 7; a.tx = a.tz = null;
      }
    }
    if (a.state === 'stand') {
      a.heading = turnTo(a.heading, Math.atan2(px - a.x, pz - a.z), dt * 3);
      if (a.t <= 0) { a.state = 'graze'; a.t = 4 + rand() * 7; }
    }
    // the height of its bound, eased in and out with the flight
    a.air += ((a.state === 'flee' ? 1 : 0) - a.air) * Math.min(1, dt * 6);
    a.phase += dt * (a.state === 'flee' ? 8 : 0);
  }
}
export const wildHop = (a) => Math.abs(Math.sin(a.phase)) * WILD[a.kind].hop * a.air;

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
  intro: 'Before five in the morning on the road below the Flüelapass, 2333 m, and 800 metres of climbing to the summit of the Schwarzhorn at 3146 m. You have a headlamp for the first of it. The sky goes on getting lighter while you climb, and it won’t wait for you. Follow the red and white waymarks. Up there before the sun: gold.',
  mode: 'person',
  season: 'summer',
  time: 'predawn',
  features: ['hikeTrail', 'sunriseClock', 'headlamp', 'wildlife'],
  wildlife: [
    { kind: 'chamois', at: 0.2, side: 38, count: 4 }, { kind: 'ibex', at: 0.42, side: -24, count: 3 },
    { kind: 'chamois', at: 0.63, side: -42, count: 3 }, { kind: 'ibex', at: 0.86, side: 22, count: 4 }
  ],
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
  features: ['hikeTrail', 'wildlife'],
  wildlife: [
    { kind: 'chamois', at: 0.28, side: 40, count: 4 }, { kind: 'ibex', at: 0.56, side: -24, count: 4 }, { kind: 'chamois', at: 0.78, side: 36, count: 3 }
  ],
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
