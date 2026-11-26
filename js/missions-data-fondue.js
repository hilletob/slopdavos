import { msg } from './messages.js';
import { buildCheckpoints, updateCheckpoints, pointAt, riderSpeed } from './missions-data-snow.js';
import { createCourse, runHeading, runCurvature, projectOnRun, sledgeSection, laneAt, botInput, DRIFT, SLEDGE_PARAMS, SLEDGE_OFF_PARAMS, SLEDGE_TRACK, SLEDGE_CRASH_MS } from './missions-data-sledge.js';
import { flaemmliScore } from './missions-data-gastro.js';

// js/missions-data-fondue.js
// The Fondue Night of the Drupal Mountain Camp (drupalmountaincamp.ch: 2 to 4 March 2027 in the Davos Congress Centre;
// the camp calls its fondue evening with the sledging after it "a classic Mountain Camp evening"). js/missions-data.js
// lists it, js/missions-fondue.js has its runtime: the banner and the flags at the Kongresszentrum, the table on the
// Schatzalp's terrace, the pot, the Flämmli, the torches down the run. Here: its definition and the pure logic, three.js-
// free like the other data packages (tests/missions-fondue.test.mjs drives it, a bot down the run on the real terrain
// included).
//
// The evening: meet the camp at the Kongresszentrum; up to the Schatzalp (a cut: the Schatzalpbahn's cars are scenery);
// stir the fondue in a figure of eight, drawn through the pot with the mouse or a finger; a Flämmli, with or without
// effect, the player's choice; then down the sled run to Davos Platz on a horn sledge, against the clock.
//
// The sled run: the Schatzalpstrasse, in winter the sled run from the Schatzalp down to Davos Platz (OSM w955244266,
// w37138183, w955244267, w955244268: highway=track, piste:type=sled), 2.26 km and 225 m of drop (10 %), 32 bends, the
// tightest hairpins with a radius under 7 m. The sledge and its physics are the horn sledge's (js/missions-data-sledge.js).

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);

// --- The places ----------------------------------------------------------------------------------------------------------
export const FONDUE_ID = 'fondue-night-schatzalp';
// (the Kongresszentrum's main entrance in the middle of the hall's south front, js/landmark-buildings-data.js KONGRESS:
// the door of js/missions-data-gastro.js's pizza stop; the start on the forecourt 35 m south of it, looking at it)
export const KONGRESS_DOOR = { x: 148.2, z: -505.5, r: 3 };
export const FONDUE_START = { x: 150, z: -470, heading: Math.PI };
// (where the cut sets the player down: on the terrace's east end, coming from the Schatzalpbahn's top station, 43 m
// from the table, looking along the terrace; clear of the Solarium Ost and the hotel)
export const SCHATZALP_ARRIVAL = { x: -1147, z: -569, heading: -Math.PI / 2 };
// (the table on the terrace of the Berghotel Schatzalp: js/missions-data-jetpack.js TERRACE's point)
export const FONDUE_TABLE = { x: -1190, z: -568.5, r: 3.5 };

// (the four ways in the world frame, from the Schatzalp down, their 176 nodes as they are)
export const SCHLITTEL_RUN_IDS = ['w955244266', 'w37138183', 'w955244267', 'w955244268'];
export const SCHLITTEL_RUN = [
  -1410.7,-614.7,-1413.2,-608.2,-1410.3,-598.5,-1405.7,-593,-1396,-571.3,-1390.7,-561.2,-1369,-512.6,-1357.2,-500.8,
  -1352,-494.5,-1347.4,-484.3,-1341,-463.4,-1337.3,-457.2,-1329.1,-449.7,-1327.7,-445.9,-1327.8,-442.8,-1335.5,-421.6,
  -1336.3,-413.4,-1334,-401.5,-1327,-390.9,-1324.1,-385.5,-1322.6,-376.4,-1321,-370.1,-1316.1,-361.6,-1305.2,-352.5,
  -1302.6,-349.5,-1302.6,-344.6,-1304.3,-341.9,-1307.3,-339.7,-1329.6,-334.2,-1334.7,-330.9,-1337.4,-327,-1338.3,-321.9,
  -1336.9,-314.1,-1336.6,-309.6,-1338.6,-300.4,-1342.6,-294.8,-1345.3,-292.7,-1350,-292.3,-1377.9,-299.7,-1392.4,-301.8,
  -1404.8,-301.2,-1412.2,-298.6,-1418.5,-294,-1421.9,-288.2,-1423.3,-281.5,-1421.7,-265.9,-1407.8,-242.1,-1405.8,-236.9,
  -1407.8,-233.7,-1415.7,-230.7,-1426,-226.4,-1431.2,-217.3,-1430.6,-207.4,-1424.7,-198.8,-1413.2,-179,-1405.1,-161.7,
  -1398.2,-154,-1391.6,-148.2,-1389.2,-142.9,-1386.3,-132.4,-1380.6,-120.5,-1372.2,-109,-1363.8,-101,-1338.2,-86.2,
  -1330.7,-79.9,-1327.7,-72.4,-1327.1,-66.6,-1327.5,-54.6,-1330.5,-45.1,-1347,-17.5,-1357.1,-5.8,-1374.6,11.3,
  -1374.3,15.5,-1372.4,18.8,-1368.8,19.8,-1364.9,17.8,-1352.7,4.2,-1338.5,-6.7,-1319.5,-21.2,-1307.2,-32.3,
  -1302.3,-39.6,-1299.2,-57.9,-1289.5,-79.8,-1287.4,-89.1,-1287.5,-95.3,-1307.5,-135.5,-1308.7,-146.8,-1307.6,-158.1,
  -1304.6,-164,-1300.7,-167.1,-1295,-168.8,-1287.9,-167.6,-1274.8,-161.6,-1254.2,-157.5,-1235.2,-150.7,-1216.1,-138.5,
  -1197.5,-131,-1185.4,-122.8,-1175.2,-112.6,-1167.4,-110.4,-1161.8,-111.2,-1149.7,-119.8,-1145.7,-129.1,-1143.5,-133.4,
  -1140.7,-134.9,-1136.6,-133.5,-1134.6,-127.9,-1135.3,-122.2,-1139,-112.9,-1148.3,-101.5,-1157,-94.8,-1165.8,-92.3,
  -1179.2,-92.3,-1179.9,-92.5,-1204.6,-97.3,-1209.9,-95.8,-1213.9,-91.7,-1216.4,-81.4,-1217,-68.3,-1215.1,-58.5,
  -1208.6,-43.6,-1195.7,-32.4,-1191,-26.4,-1189.6,-18,-1194.6,13.1,-1206.6,39.8,-1213,51.5,-1219.4,55.8,
  -1233.8,66.1,-1241.6,82.1,-1246,88.4,-1264.5,106.4,-1267.8,114.8,-1267.4,124.7,-1256.9,156.7,-1256.9,162.9,
  -1259.7,171.4,-1273.4,185.6,-1282.7,193.6,-1290.6,193.7,-1309.5,189.1,-1328,190.7,-1339.5,189.6,-1343.8,192.9,
  -1345.9,197.1,-1345.8,200.7,-1343.9,203.3,-1340.8,205,-1316.7,205.8,-1308.4,207.1,-1287.2,226.4,-1258.8,213,
  -1229.4,216.1,-1216,215.5,-1207.8,208.9,-1202.6,188.5,-1194.3,171.9,-1182.9,161.2,-1159.7,152.1,-1151.8,146.9,
  -1144.7,139.3,-1134.5,119.7,-1128.5,112.3,-1119.4,105.7,-1100.7,95,-1092.3,88,-1088.5,86.3,-1083.7,86.2,
  -1074.5,87.6,-1068.7,87.1,-1061.9,84.1,-1053.2,78.2,-1019.2,48.4,-998.5,33.6,-976,14,-973.4,12.3
];
// The line the sledge follows: the mapped ways' corners rounded off (every 2 m, a weighted mean over ±4 m, twice), no more
// than 1.2 m from them, so that the run is drawn and ridden as a smooth line instead of a polygon of 13 m chords
export const SMOOTH = { step: 2, reach: 2, passes: 2 };
export function smoothRun(pts = SCHLITTEL_RUN, { step, reach, passes } = SMOOTH) {
  const L = createCourse(pts).length;
  let p = [];
  for (let s = 0; s < L; s += step) { const q = pointAt(pts, s); p.push([q.x, q.z]); }
  const e = pointAt(pts, L); p.push([e.x, e.z]);
  for (let k = 0; k < passes; k++) {
    const q = p.map((a) => a.slice());
    for (let i = 1; i < p.length - 1; i++) {
      let sx = 0, sz = 0, n = 0;
      for (let j = Math.max(0, i - reach); j <= Math.min(p.length - 1, i + reach); j++) { const w = reach + 1 - Math.abs(i - j); sx += p[j][0] * w; sz += p[j][1] * w; n += w; }
      q[i] = [sx / n, sz / n];
    }
    p = q;
  }
  return p.flat().map((v) => Math.round(v * 100) / 100);
}

// --- The shortcuts ----------------------------------------------------------------------------------------------------------
// Three places where the run's hairpins lie stacked in the forest, one leg 20–45 m below the other: a lane straight down
// the slope from the leg above to the leg below saves 150-200 m of hairpins (found on the smoothed run: a lane 14–45 m long
// between points 50+ m apart along the run, falling all the way, not along another leg, leaving the run within 70° of
// its way and meeting it below within 92°). Marked at the top with two flags, a packed track down through the trees,
// and at the foot a snow wall on the run's far side that catches a sledge coming across.
export const SHORTCUTS = [[753, 926], [1158, 1355], [1668, 1868]];
export const LANE = { half: 2.1, wall: [7, 10] }; // (m either side of the lane's line; the snow wall from 7 m before to 10 m after its foot)
// (the young spruces in each lane, the obstacles: [t along it, d m off its line (+ left), height m]; the forest's own trees
// stand back from the lanes, js/city-grid.js SLED_AISLES)
export const LANE_TREES = [[[0.45, 0.7, 2.6]], [[0.3, -0.8, 3.2], [0.72, 0.8, 2.4]], [[0.36, 0.9, 2.8], [0.72, -0.7, 3]]];

const leftOf = (c, s, x, z) => { const p = pointAt(c.pts, s), h = runHeading(c, s, 3); return Math.sign((x - p.x) * Math.cos(h) - (z - p.z) * Math.sin(h)) || 1; };
/** The bends' nets cut away over [a, b] on `side` (the gap where a lane leaves or arrives) */
function cutNets(bends, a, b, side) {
  const out = [];
  for (const bd of bends) {
    if (bd.side !== side || bd.s1 < a || bd.s0 > b) { out.push(bd); continue; }
    if (bd.s0 < a - 2) out.push({ ...bd, s1: a });
    if (bd.s1 > b + 2) out.push({ ...bd, s0: b });
  }
  return out;
}
/** The lanes of `SHORTCUTS` on the course, its bends with the gaps and snow walls they need */
function addLanes(c) {
  c.lanes = SHORTCUTS.map(([s0, s1], i) => {
    const a = pointAt(c.pts, s0), b = pointAt(c.pts, s1), len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    // (a trunk's radius by its height: 0.2 m and more)
    const trees = LANE_TREES[i].map(([t, d, h]) => [a.x + ux * t * len + uz * d, a.z + uz * t * len - ux * d, 0.12 + 0.04 * h, h]);
    return { s0, s1, ax: a.x, az: a.z, bx: b.x, bz: b.z, len, ux, uz, half: LANE.half, trees };
  });
  let bends = c.bends;
  for (const L of c.lanes) {
    // (the side of the run the lane leaves on, and the side it comes in from below)
    const out = leftOf(c, L.s0, L.ax + L.ux * 6, L.az + L.uz * 6), from = leftOf(c, L.s1, L.ax, L.az);
    bends = cutNets(bends, L.s0 - 10, L.s0 + 12, out);
    bends = cutNets(bends, L.s1 - LANE.wall[0] - 4, L.s1 + LANE.wall[1] + 4, from);
    bends = cutNets(bends, L.s1 - LANE.wall[0], L.s1 + LANE.wall[1], -from);
    // the snow wall: a bend with no net (js/missions-data-sledge.js: it takes any speed)
    bends.push({ s0: L.s1 - LANE.wall[0], s1: L.s1 + LANE.wall[1], side: -from, radius: Infinity, berm: true });
    L.side = out; L.from = from;
  }
  c.bends = bends.sort((p, q) => p.s0 - q.s0);
  return c;
}
let course = null;
/** The sled run prepared like the horn sledge's (its arc lengths, its bends), on the smoothed line, with its shortcuts */
export const schlittelCourse = () => (course ??= addLanes(createCourse(smoothRun(), { half: 2.2 })));
export const schlittelCheckpoints = () => buildCheckpoints(schlittelCourse().pts, 150, 90);

// --- Stirring: the figure of eight -----------------------------------------------------------------------------------------
// What tells an eight from a circle is the sign of the turn: round a circle the stroke turns one way for ever, through an
// eight it turns one way round one loop and the other way round the next, changing at the crossing. So the stroke's
// turning angle is summed up, and each time the sum turns back a loop ends. Two loops one after the other, each of them
// most of a full turn and with some room inside, lying on either side of where the stroke crossed, are an eight —
// whichever way it lies in the pot, however big it is. Stirring on round one way is a circle (the cheese splits), a
// stroke back and forth encloses nothing, a small wiggle turns too little.
export const STIR = {
  goal: 8, // eights until the fondue is ready
  step: 0.09, // (pot radii) the stroke is taken up again every so far: the pointer's jitter stays out
  flip: 25 * DEG, // the turn back that ends a loop (less is a wobble of the hand)
  loop: [190 * DEG, 385 * DEG], // what a loop of an eight turns (a lying eight 270°, two rings touching 360°)
  circle: 400 * DEG, // turning on past this the same way: a circle
  area: 0.02, // (pot radii²) the least a loop encloses
  tempo: [0.8, 3.4], // s for one eight: faster splashes, slower lets it catch
  rise: 0.07, // per s: the pot catches by itself
  idle: 0.16, idleAfter: 0.6, // per s once the fork has stood still this long
  eight: 0.22, // what an eight takes off again
  circleBurn: 0.2, // a circle: the cheese splits
  burnMs: 8000 // caught on the bottom: scraping it loose costs this
};

export function createStir() {
  return { pts: [], dir: null, acc: 0, sign: 0, ext: 0, extI: 0, base: 0, prev: null, eights: 0, burn: 0, strikes: 0, circles: 0, idleT: 0, t: 0, started: false, last: null, seq: 0 };
}

/** What the stroke's points from index a to b enclose (the shoelace's area, closed by the chord) and their centre */
function loopShape(pts, a, b) {
  let area = 0, cx = 0, cz = 0;
  for (let i = a; i <= b; i++) {
    const p = pts[i], q = pts[i === b ? a : i + 1];
    area += p.u * q.v - q.u * p.v;
    cx += p.u; cz += p.v;
  }
  const n = b - a + 1;
  return { area: Math.abs(area) / 2, u: cx / n, v: cz / n };
}

const say = (g, what) => { g.last = what; g.seq++; return what; };

/** A loop ended at the stroke's point `k` (where it began to turn the other way): is it one of an eight, and the second? */
function closeLoop(g, k) {
  const turn = Math.abs(g.ext - g.base);
  const pts = g.pts, a = pts[0], b = pts[k];
  const shape = loopShape(pts, 0, k);
  const loop = { turn, t0: a.t, t1: b.t, u: shape.u, v: shape.v, area: shape.area, end: { u: b.u, v: b.v } };
  const valid = turn >= STIR.loop[0] && turn <= STIR.loop[1] && shape.area >= STIR.area;
  // (the stroke from the crossing on is the next loop's)
  g.pts = pts.slice(k);
  g.base = g.ext;
  if (!valid) { g.prev = null; return null; }
  const first = g.prev;
  if (!first) { g.prev = loop; return null; }
  // the two loops on either side of the crossing between them
  const x = first.end;
  const opposite = (first.u - x.u) * (loop.u - x.u) + (first.v - x.v) * (loop.v - x.v) < 0;
  if (!opposite) { g.prev = loop; return null; }
  g.prev = null;
  const took = loop.t1 - first.t0;
  if (took < STIR.tempo[0]) return say(g, 'splash');
  if (took > STIR.tempo[1]) return say(g, 'slow');
  g.eights++;
  g.burn = Math.max(0, g.burn - STIR.eight);
  return say(g, 'eight');
}

/**
 * The fork at (u, v) in the pot (its centre 0/0, its rim at radius 1) at time t (s). Returns what the stroke just made:
 * null | 'eight' | 'circle' (stirred round and round: the cheese splits) | 'splash' (too fast) | 'slow'
 */
export function stirPoint(g, u, v, t) {
  const pts = g.pts, lastP = pts[pts.length - 1];
  if (!lastP) { pts.push({ u, v, t }); g.started = true; return null; }
  const du = u - lastP.u, dv = v - lastP.v;
  if (du * du + dv * dv < STIR.step * STIR.step) return null;
  g.idleT = 0;
  const dir = Math.atan2(dv, du);
  pts.push({ u, v, t });
  if (g.dir === null) { g.dir = dir; return null; }
  g.acc += wrapPi(dir - g.dir);
  g.dir = dir;
  // the sum of the turn and its furthest point the way it is going
  if (!g.sign) {
    if (Math.abs(g.acc - g.base) > STIR.flip) { g.sign = Math.sign(g.acc - g.base); g.ext = g.acc; g.extI = pts.length - 1; }
    return null;
  }
  if ((g.acc - g.ext) * g.sign >= 0) {
    g.ext = g.acc; g.extI = pts.length - 1;
    if (Math.abs(g.ext - g.base) > STIR.circle) {
      // round and round: a circle. The count starts afresh from here, another turn on is another circle
      g.base = g.ext; g.pts = pts.slice(-2); g.extI = 1; g.prev = null;
      g.circles++;
      g.burn = Math.min(1, g.burn + STIR.circleBurn);
      return say(g, 'circle');
    }
    return null;
  }
  if (Math.abs(g.acc - g.ext) < STIR.flip) return null;
  // turned back: the loop ended at the furthest point, the next one turns the other way
  const k = g.extI;
  const made = closeLoop(g, k);
  g.sign = -g.sign;
  g.ext = g.acc; g.extI = g.pts.length - 1;
  return made;
}

/** The fork lifted: the stroke ends, the next one begins anew (no eight across a gap) */
export function stirLift(g) {
  g.pts = []; g.dir = null; g.sign = 0; g.acc = 0; g.ext = 0; g.extI = 0; g.base = 0; g.prev = null;
}

/** The pot over the flame for dt s: it catches by itself, faster while nobody stirs. Returns 'burnt' when it caught */
export function stirStep(g, dt) {
  if (!g.started || g.eights >= STIR.goal) return null;
  g.t += dt;
  g.idleT += dt;
  g.burn += (g.idleT > STIR.idleAfter ? STIR.idle : STIR.rise) * dt;
  if (g.burn < 1) return null;
  g.strikes++;
  g.burn = 0.3; // (scraped loose: some room again)
  return say(g, 'burnt');
}

const STIR_HINTS = {
  eight: 'Smooth and creamy: keep the eight going',
  circle: 'Round in circles: the cheese splits! Cross through the middle',
  splash: 'Too wild: it splashes over the rim',
  slow: 'Too slow: it catches on the bottom',
  burnt: `Caught on the bottom! Scraping it loose: +${STIR.burnMs / 1000} s`
};
/** The HUD's line and hint for the pot */
export function stirGauge(g) {
  return {
    text: msg('Figure eights {n}/{of}{caught}', (p) => `Achten ${p.n}/${p.of}${p.c ? ` · ${p.c}× angebrannt (+${p.s} s)` : ''}`,
      { n: Math.min(g.eights, STIR.goal), of: STIR.goal, caught: g.strikes ? ` · caught ${g.strikes}× (+${(g.strikes * STIR.burnMs) / 1000} s)` : '', c: g.strikes, s: (g.strikes * STIR.burnMs) / 1000 }),
    hint: (g.last && STIR_HINTS[g.last]) || 'Draw a figure of eight through the pot with the mouse or your finger',
    burn: clamp(g.burn, 0, 1)
  };
}

/** A frame of the stirring on the mission's state: the pot's own time, the penalty when it caught */
export function fondueStir(state, dt) {
  const ev = stirStep(state.stir, dt);
  if (ev === 'burnt') state.penaltyMs += STIR.burnMs;
  return ev;
}

// (strokes for the tests and the calibration: `n` eights or circles of `period` s as the pointer would bring them)
/** A lying eight (Gerono's lemniscate) through the pot's middle: [{ u, v, t }] */
export function lemniscate(n, period, { tilt = 0, scale = 0.7, offset = [0, 0], jitter = 0, rate = 60, t0 = 0, seed = 1 } = {}) {
  const out = [], c = Math.cos(tilt), s = Math.sin(tilt);
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647 - 0.5; };
  for (let i = 0; i <= n * period * rate; i++) {
    const t = i / rate, a = (t / period) * TAU;
    const x = Math.sin(a) * scale + rnd() * jitter, y = Math.sin(a) * Math.cos(a) * scale + rnd() * jitter;
    out.push({ u: offset[0] + x * c - y * s, v: offset[1] + x * s + y * c, t: t0 + t });
  }
  return out;
}
/** Round and round: [{ u, v, t }] */
export function circleStroke(n, period, { scale = 0.6, rate = 60, t0 = 0 } = {}) {
  const out = [];
  for (let i = 0; i <= n * period * rate; i++) {
    const t = i / rate, a = (t / period) * TAU;
    out.push({ u: Math.cos(a) * scale, v: Math.sin(a) * scale, t: t0 + t });
  }
  return out;
}

// --- The Flämmli: its effect on the ride ------------------------------------------------------------------------------------
// The Flämmli is made in the Schatzalp's Stübli as in the Rot Liechtli (js/missions-data-gastro.js, one round: sugar, the
// espresso off the sugar, the Williams, alight, swirled to caramel, into the glass, smothered, down). What it does to the
// ride is the Williams poured: a little and the head stays nearly clear; a good splash and the two on the sledge are
// bolder (it runs faster: ducked lower, the heels lighter on the snow) but the head is not quite clear (the horns answer
// late, the sledge pulls to one side and the other, the view sways); a generous one and all of that more. A Flämmli not
// drunk (the round lost) does nothing. A time credit would not do: the leaderboard takes no time under the measured one
// (supabase/migrations/*_all_leaderboards.sql submit_run), so the effect has to be won on the run.
export const TIPSY = {
  lag: 0.15, // s: how late the horns answer (at full effect)
  brakeLag: 0.1, // s: the heels too
  drift: [0.1, 0.9, 0.05, 2.3], // the pull to one side: two slow swings (amplitude, rad/s)
  roll: 0.085 // rad: how far the view sways
};
/** The effect (0-1) of the Flämmli made: by the Williams poured (its gauge 0-1, the green 0.5-0.7), none if not drunk */
export function flaemmliEffect(g) {
  if (!g || !g.drinks) return 0;
  return clamp(0.15 + (g.williams - 0.2) * 1.25, 0.15, 1);
}
/** A word for the effect: 'none' | 'mild' | 'good' | 'strong' */
export const effectWord = (k) => (k <= 0 ? 'none' : k < 0.45 ? 'mild' : k < 0.8 ? 'good' : 'strong');
const lerp = (a, b, k) => a + (b - a) * k;
// (the run is a 3 m track laid as a bench in the slope, js/path-bench.js: narrower than the horn sledge's 5 m run, with
// the ground falling away behind it. So the run is narrower here and its nets stand closer; a sledge at a net is set back
// onto the run and slides along the net, js/missions-data-sledge.js netSlide)
// It is forgiving: soft snow banks along all of it (walls: no leaving the run but at a shortcut), a sledge that stands
// more before it tips, nets that catch rather than throw (a crash only far over 40 km/h straight into one)
export const SCHLITTEL_TRACK = { ...SLEDGE_TRACK, half: 2.8, netGap: 0.6, netSlide: true, walls: true, netCrash: 12, tipG: 1.05, tipRate: 1.2, tipWarn: 0.3 };
// (the shortcuts' packed track through the forest: slower than the run, far faster than the deep snow beside it)
export const LANE_PARAMS = { ...SLEDGE_PARAMS, mu: 0.085, drag: 0.004, tuckDrag: 0.0032, grip: 6 };
const paramsCache = new Map();
/** The sledge's numbers on this run after a Flämmli of effect k (0-1): { on, off, lane, drift, track } for stepSledge.
 *  At full effect: less friction and drag, 26 m/s at most instead of 22, a sledge that stands 1.2 g instead of 1.05 */
export function flaemmliParams(k = 0) {
  const key = Math.round(clamp(k, 0, 1) * 20);
  if (paramsCache.has(key)) return paramsCache.get(key);
  const e = key / 20;
  const on = { ...SLEDGE_PARAMS, mu: lerp(SLEDGE_PARAMS.mu, 0.034, e), drag: lerp(SLEDGE_PARAMS.drag, 0.0028, e), tuckDrag: lerp(SLEDGE_PARAMS.tuckDrag, 0.0021, e), maxSpeed: lerp(SLEDGE_PARAMS.maxSpeed, 26, e) };
  const P = { on, off: SLEDGE_OFF_PARAMS, lane: { ...LANE_PARAMS, maxSpeed: on.maxSpeed }, drift: DRIFT, track: { ...SCHLITTEL_TRACK, tipG: lerp(SCHLITTEL_TRACK.tipG, 1.2, e) } };
  paramsCache.set(key, P);
  return P;
}
// (the ride begins a few metres down the way, on the bench: its first metre is a step up from the ground before it)
export const SCHLITTEL_START_S = 4;
export const SCHLITTEL_SNOW = { flat: 3, bank: 0.5 };
/**
 * The snow the sledge runs on: the run's bench (level across: `trodHeight` along the run's line, sampled every 2 m),
 * `flat` m to either side, and from there a bank of snow falling away at `bank` m per m until it meets the ground — no
 * step at the bench's edge to fall off or to be caught under. Where the slope stands higher it is the ground.
 * The bench has gaps where one OSM way ends and the next begins (a pit down to the ground, 1.7 m deep at s = 1852, and
 * the step at the very start): a sample lower than both its sides is lifted to the lower of them.
 */
export function schlittelHeight(trodHeight, groundHeight, c = schlittelCourse()) {
  const STEP = 2, n = Math.ceil(c.length / STEP) + 1, raw = new Float64Array(n), line = new Float64Array(n);
  for (let i = 0; i < n; i++) { const p = pointAt(c.pts, Math.min(c.length, i * STEP)); raw[i] = trodHeight(p.x, p.z, 0); }
  const top = (from, to) => { let m = -Infinity; for (let i = Math.max(0, from); i <= Math.min(n - 1, to); i++) m = Math.max(m, raw[i]); return m; };
  const filled = new Float64Array(n);
  for (let i = 0; i < n; i++) filled[i] = Math.max(raw[i], Math.min(i ? top(i - 3, i - 1) : Infinity, i < n - 1 ? top(i + 1, i + 3) : Infinity));
  // (and the bench's ledges and dips eased: a mean over ±6 m, held over the bench (the bench never stands out of the
  // snow), again and again until it settles: the hollows fill, the crests stay where the bench has them)
  line.set(filled);
  const tmp = new Float64Array(n);
  for (let pass = 0; pass < 40; pass++) {
    for (let i = 0; i < n; i++) { let sum = 0, k = 0; for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { sum += line[j]; k++; } tmp[i] = Math.max(filled[i], sum / k); }
    line.set(tmp);
  }
  // (a last mean over ±2 m without the hold: the crests rounded by a few centimetres)
  for (let i = 0; i < n; i++) { let sum = 0, k = 0; for (let j = Math.max(0, i - 1); j <= Math.min(n - 1, i + 1); j++) { sum += line[j]; k++; } tmp[i] = sum / k; }
  line.set(tmp);
  const proj = {};
  return (x, z) => {
    const g = groundHeight(x, z);
    projectOnRun(c, x, z, -1, proj);
    const d = Math.abs(proj.d);
    if (d > 12) return g;
    const k = Math.min(n - 1.001, Math.max(0, proj.s / STEP)), i = Math.floor(k);
    const h = line[i] + (line[i + 1] - line[i]) * (k - i) - Math.max(0, d - SCHLITTEL_SNOW.flat) * SCHLITTEL_SNOW.bank;
    return h > g ? h : g;
  };
}

/** The Flämmli is down (or lost): its effect on the ride, once */
export function settleFlaemmli(state) {
  if (state.effect !== null || !state.game?.done) return false;
  state.effect = flaemmliEffect(state.game);
  return true;
}

export const createTipsy = (k = 1) => ({ steer: 0, brake: 0, t: 0, k });
/** What reaches the sledge of the driver's input after a Flämmli of effect mem.k (mem: createTipsy(k)) */
export function tipsyInput(input, dt, mem) {
  mem.t += dt;
  const k = mem.k, [a1, w1, a2, w2] = TIPSY.drift;
  mem.steer += ((input.steer || 0) - mem.steer) * (1 - Math.exp(-dt / Math.max(0.01, TIPSY.lag * k)));
  mem.brake += ((input.brake || 0) - mem.brake) * (1 - Math.exp(-dt / Math.max(0.01, TIPSY.brakeLag * k)));
  const drift = k * (a1 * Math.sin(mem.t * w1) + a2 * Math.sin(mem.t * w2 + 0.7));
  // (the heels fully off the snow once they are let go: a trace of brake left for ever would keep the sledge from being
  // pushed off again, js/missions-data-snow.js stepRider pushes only with no brake at all)
  return { steer: clamp(mem.steer + drift, -1, 1), tuck: input.tuck || 0, brake: mem.brake < 0.03 ? 0 : clamp(mem.brake, 0, 1), drift: !!input.drift };
}
/** The view's roll (rad) t s into the ride after a Flämmli of effect k */
export const tipsyRoll = (t, k = 1) => k * TIPSY.roll * (Math.sin(t * 0.9) + 0.45 * Math.sin(t * 2.3 + 0.7));
/**
 * The steering assist: with no key the sledge follows the run by itself (to a point on the run ahead, as the bots do);
 * a key steers, the assist adds a little; a key near a shortcut's top, on a shortcut and in a drift the driver alone.
 */
export const ASSIST = { free: 0.9, keyed: 0.3, look: [6, 0.8], margin: 1.1, brake: 0.7 };
export function assistInput(input, sl, c) {
  if (!sl || sl.crashT > 0 || sl.drift || input.drift) return input;
  const s = sl.proj.s, own = input.steer || 0;
  // (on a shortcut, with no key: down its line)
  if (sl.lane) {
    if (Math.abs(own) >= 0.05) return input;
    const L = sl.lane, r = sl.rider, p = laneAt(L, r.x, r.z), t = Math.min(1.1, p.t + 6 / L.len);
    const want = Math.atan2(L.ax + L.ux * t * L.len - r.x, L.az + L.uz * t * L.len - r.z);
    return { ...input, steer: clamp(Math.atan2(Math.sin(want - r.heading), Math.cos(want - r.heading)) * 2.4, -1, 1) * ASSIST.free };
  }
  // (before a shortcut's top a key is the driver's own: to take it, or not)
  if (Math.abs(own) >= 0.05 && c.lanes?.some((L) => s > L.s0 - 25 && s < L.s0 + 6)) return input;
  const r = sl.rider, sp = riderSpeed(r), tgt = pointAt(c.pts, Math.min(c.length, s + Math.max(ASSIST.look[0], sp * ASSIST.look[1])));
  const err = Math.atan2(Math.sin(Math.atan2(tgt.x - r.x, tgt.z - r.z) - r.heading), Math.cos(Math.atan2(tgt.x - r.x, tgt.z - r.z) - r.heading));
  const help = clamp(err * 2.4, -1, 1);
  // (and the brake: far too fast for the bend ahead and not braking, the heels go down a little by themselves)
  const brake = input.brake ? input.brake : botInput(sl, c, { margin: ASSIST.margin, tipG: SCHLITTEL_TRACK.tipG }).brake * ASSIST.brake;
  return { ...input, brake, steer: Math.abs(own) < 0.05 ? help * ASSIST.free : clamp(own + help * ASSIST.keyed, -1, 1) };
}
/** The keys' drift: the brake held down with the horns pulled (S with A/D; the touch stick down and to a side) */
export const driftInput = (input) => ({ ...input, drift: input.drift ?? ((input.brake || 0) >= 0.6 && Math.abs(input.steer || 0) >= 0.4) });

/**
 * A driver who drifts the hairpins (the tests: the drift is worth it): into a bend tighter than 14 m at speed it pulls the
 * horns and holds the brake until the sledge points down the run again, then lets go for the push; else laneBot.
 */
export function driftBot(sl, c, opts = {}) {
  const base = laneBot(sl, c, opts);
  if (sl.lane || sl.crashT > 0 || (opts.lanes !== false && c.lanes.some((l) => sl.proj.s > l.s0 - 16 && sl.proj.s < l.s0 + 3))) return base;
  const r = sl.rider, sp = riderSpeed(r), s = sl.proj.s;
  let k = 0;
  for (let d = 0; d <= 12; d += 2) { const q = runCurvature(c, Math.min(c.length, s + d), 6); if (Math.abs(q) > Math.abs(k)) k = q; }
  const err = Math.atan2(Math.sin(runHeading(c, Math.min(c.length, s + 7), 3) - r.heading), Math.cos(runHeading(c, Math.min(c.length, s + 7), 3) - r.heading));
  if (sl.drift) return Math.abs(err) < (opts.exit ?? 0.3) || sp < DRIFT.minSpeed * 0.7 ? { steer: 0, tuck: 0, brake: 0, drift: false } : { steer: Math.sign(err), tuck: 0, brake: 1, drift: true };
  if (sp > DRIFT.minSpeed + 0.5 && Math.abs(k) > 1 / 16 && (base.brake > 0 || Math.abs(err) > (opts.entry ?? 0.35))) return { steer: Math.sign(k), tuck: 0, brake: 1, drift: true };
  return { ...base, drift: false };
}

/**
 * A driver down the run who takes the shortcuts (the medals' calibration, the tests): botInput on the run; near a lane's
 * top it heads for the lane, on the lane it steers down its line round the trees, and brakes for the run at its foot.
 */
export function laneBot(sl, c, opts = {}) {
  const r = sl.rider, sp = riderSpeed(r), s = sl.proj.s;
  const L = sl.lane || (opts.lanes !== false ? c.lanes.find((l) => s > l.s0 - 16 && s < l.s0 + 3) : null);
  if (!L) return { ...botInput(sl, c, opts), drift: false }; // (it brakes for the bends: driftBot drifts them)
  const p = laneAt(L, r.x, r.z);
  // (the line to follow: past the next tree ahead on the side with more room)
  let off = 0, nextT = Infinity;
  for (const [x, z, rad] of L.trees) { const q = laneAt(L, x, z); if (q.t > p.t - (rad + 0.5) / L.len && q.t < p.t + 14 / L.len && q.t < nextT) { nextT = q.t; off = q.d > 0 ? -1.2 : 1.2; } }
  const t = Math.min(1.15, Math.max(p.t, -0.1) + Math.max(5, sp * 0.6) / L.len);
  const tx = L.ax + L.ux * t * L.len + L.uz * off, tz = L.az + L.uz * t * L.len - L.ux * off;
  const want = Math.atan2(tx - r.x, tz - r.z);
  const err = Math.atan2(Math.sin(want - r.heading), Math.cos(want - r.heading));
  // (slow enough at the foot to turn onto the run below, and through the trees)
  const left = (1 - p.t) * L.len, tree = opts.treeSpeed ?? 8;
  const vMax = Math.min(nextT < Infinity || p.t < 0.1 ? tree + (p.t < 0.1 ? 2 : 0) : Infinity, Math.sqrt((opts.footSpeed ?? 6) ** 2 + 2 * 3 * Math.max(0, left - 3)));
  const brake = sp > vMax ? 1 : 0;
  return { steer: clamp(err * 2.4, -1, 1), tuck: brake ? 0 : 1, brake, drift: false };
}

// --- The mission -----------------------------------------------------------------------------------------------------------
const near = (ctx, p, r = p.r) => Math.hypot(ctx.x - p.x, ctx.z - p.z) <= r;
// (the run's two parts: the hairpins below the Schatzalp, the forest road down to the village)
const SECTIONS = [
  { id: 'upper', title: 'The upper hairpins', toS: 1100, tip: 'Hairpins: hold S with A/D to drift, let go of S for a push' },
  { id: 'village', title: 'Down to Davos Platz', toS: Infinity, tip: 'Duck low (W) on the straights, drift through the hairpins' }
];
const SHORTCUT_HINT = 'A shortcut: leave the run between the flags, down through the trees';
/** A part of the run, waiting for the sledge while the player still stands on the terrace; on the way the shortcuts' hints */
const rideSection = (spec) => {
  const section = sledgeSection(spec);
  return {
    ...section,
    check(ctx, state) {
      if (!state.riding) return { done: false, progress: 0, text: 'To the sledges at the top of the run …', target: null, hint: null };
      const v = section.check(ctx, state);
      if (state.crashT > 0 && state.why === 'tree') v.hint = msg('Into a tree! +{s} s, back on the run', 'In einen Baum! +{s} s, zurück auf die Bahn', { s: SLEDGE_CRASH_MS / 1000 });
      else if (state.crashT <= 0 && state.onLane) v.hint = 'Through the trees: brake (S) before the run below';
      else if (state.crashT <= 0 && !state.skipped && state.laneAhead) v.hint = SHORTCUT_HINT;
      return v;
    }
  };
};
/** After a shortcut: the checkpoints it cut out count as passed (the run's below its foot) */
export function passShortcut(state, s1) {
  while (state.cps[state.next] && state.cps[state.next].s <= s1 + 2) state.next++;
  state.skipped = null;
}
const EFFECT_DE = { none: 'keine', mild: 'leicht', good: 'gut', strong: 'stark' };
const flaemmliLine = (state) => {
  const k = state.effect;
  if (k === null) return msg('A Flämmli in the Stübli · {pts} pts', 'Ein Flämmli im Stübli · {pts} Pkt.', { pts: flaemmliScore(state.game) });
  return msg('Flämmli {pts} pts · effect {w}', (p) => `Flämmli ${p.pts} Pkt. · Wirkung ${EFFECT_DE[p.w]}`, { pts: flaemmliScore(state.game), w: effectWord(k) });
};

export const FONDUE_MISSION = {
  id: FONDUE_ID,
  title: 'Fondue Night on the Schatzalp',
  intro: 'Drupal Mountain Camp, open source on top of the world, and tonight is the classic: Fondue Night. Meet the camp at the Kongresszentrum, ride up to the Schatzalp and stir the fondue: draw a figure of eight through the pot with the mouse or your finger. Round in circles and the cheese splits, dawdle and it catches on the bottom. Then a Flämmli in the Stübli, made the Bündner way with one button: the more Williams you pour, the bolder the ride: the sledge runs faster, but the horns answer late and the valley sways. And then down the sled run to Davos Platz on a horn sledge, 2.2 km of hairpins by torchlight, against the clock: hold S with A/D to drift through a hairpin and let go of S for a push, and where the flags stand, cut down through the forest. Each crash costs 5 s.',
  mode: 'person',
  season: 'winter',
  time: 'evening',
  features: ['fondueNight', 'flaemmli'],
  // (the Flämmli: js/missions-gastro.js's, one round in the Berghotel's Stübli, the room gone with the next objective)
  flaemmli: { look: 'schatzalp', rounds: 1, leave: true },
  interior: { door: FONDUE_TABLE },
  props: [],
  colour: '#0678be',
  icon: 'fondue',
  logo: './assets/logos/drupal-mountain-camp.webp',
  // (the evening before the ride takes some 70 s: 35 m to the door, the cut, 43 m to the table, eight eights at two
  // seconds each, the Flämmli's round (some 30 s), the cut)
  // (the evening before the ride some 70 s. The ride, tests/missions-fondue.test.mjs's bots on the real run: on the run
  // alone, braking for the bends, 2:58-3:00; drifting them 2:45; with the three shortcuts, slowing for their spruces,
  // 2:30; W held alone and the assist steering and braking, 2:31; the shortcuts with the assist, 2:07-2:13. Gold wants
  // the shortcuts, a clean ride on the assist alone is silver)
  bonusMs: 205 * 1000,
  medals: { gold: 205000, silver: 240000, bronze: 340000 },
  finish: 'Davos Platz, the runners scrape over the last ice. The fondue held, the Flämmli is still warm in your belly. See you at the next session, on top of the world.',
  start: FONDUE_START,
  pin: { x: FONDUE_START.x, z: FONDUE_START.z },
  createState() {
    return {
      arrived: false, stir: createStir(), game: null, inside: false, effect: null, riding: false, onLane: false, laneAhead: false, shortcuts: 0, boosts: 0, trees: 0,
      cps: schlittelCheckpoints(), next: 0, skipped: null, crashes: 0, nets: 0, penaltyMs: 0, crashT: 0, why: null, tip: 0, off: false, topSpeed: 0
    };
  },
  update(ctx, state) {
    settleFlaemmli(state);
    if (state.riding && ctx.mode === 'person' && !state.onLane) updateCheckpoints(state, ctx.x, ctx.z, 9);
  },
  summary(state) {
    const g = state.stir;
    return [
      msg('{n} figure eights{caught}{circles}',
        (p) => `${p.n} Achten · ${p.c ? `${p.c}× angebrannt (+${p.s} s)` : 'nichts angebrannt'}${p.k ? ` · ${p.k}-mal im Kreis gerührt` : ''}`,
        { n: g.eights, caught: g.strikes ? ` · caught on the bottom ${g.strikes}× (+${(g.strikes * STIR.burnMs) / 1000} s)` : ' · nothing caught',
          circles: g.circles ? ` · ${g.circles} ${g.circles === 1 ? 'circle' : 'circles'}` : '', c: g.strikes, s: (g.strikes * STIR.burnMs) / 1000, k: g.circles }),
      flaemmliLine(state),
      msg('{n} {crashes}{pen} · {c} of {of} shortcuts · {b} {boosts} · top speed {v} km/h',
        (p) => `${p.n} ${p.n === 1 ? 'Sturz' : 'Stürze'}${p.pen} · ${p.c} von ${p.of} Abkürzungen · ${p.b} ${p.b === 1 ? 'Drift-Schub' : 'Drift-Schübe'} · Höchsttempo ${p.v} km/h`,
        { n: state.crashes, crashes: state.crashes === 1 ? 'crash' : 'crashes', pen: state.crashes ? ` (+${(state.crashes * SLEDGE_CRASH_MS) / 1000} s)` : '',
          c: state.shortcuts, of: SHORTCUTS.length, b: state.boosts, boosts: state.boosts === 1 ? 'drift boost' : 'drift boosts', v: Math.round(state.topSpeed * 3.6) })
    ];
  },
  objectives: [
    {
      id: 'meet',
      title: 'Meet the camp at the Kongress',
      check(ctx) {
        const d = Math.hypot(ctx.x - KONGRESS_DOOR.x, ctx.z - KONGRESS_DOOR.z);
        return { done: d <= KONGRESS_DOOR.r, progress: null, text: msg('The camp waits at the entrance · {d}', 'Das Camp wartet beim Eingang · {d}', { d: fmtDist(d) }), target: { ...KONGRESS_DOOR, style: 'plain' }, hint: 'Walk to the entrance between the flags' };
      }
    },
    {
      id: 'up',
      title: 'Up to the Schatzalp',
      check(ctx, state) {
        const d = Math.hypot(ctx.x - FONDUE_TABLE.x, ctx.z - FONDUE_TABLE.z);
        // (still down in the town: the Schatzalpbahn is on its way, js/missions-fondue.js cuts)
        if (d > 400 && !state.arrived) return { done: false, progress: null, text: 'With the Schatzalpbahn up to the Schatzalp …', target: null, hint: null };
        return { done: near(ctx, FONDUE_TABLE), progress: null, text: msg('The fondue table on the terrace · {d}', 'Der Fonduetisch auf der Terrasse · {d}', { d: fmtDist(d) }), target: { ...FONDUE_TABLE, style: 'plain' }, hint: 'The caquelon is on the flame: to the table' };
      }
    },
    {
      id: 'stir',
      title: 'Stir the fondue in a figure of eight',
      check(ctx, state) {
        const g = state.stir, v = stirGauge(g);
        return { done: g.eights >= STIR.goal, progress: Math.min(1, g.eights / STIR.goal), text: v.text, target: null, hint: v.hint };
      }
    },
    {
      id: 'flaemmli',
      title: 'A Flämmli in the Stübli',
      allowModes: ['person'],
      check(ctx, state) {
        if (!state.game) return { done: false, progress: 0, text: 'Into the Stübli …', target: null, hint: null };
        return { done: state.effect !== null, progress: state.game.done ? 1 : 0, text: flaemmliLine(state), target: null, hint: 'More Williams, a bolder ride: faster, but late horns and a swaying valley' };
      }
    },
    ...SECTIONS.map(rideSection)
  ]
};

export const FONDUE_MISSIONS = [FONDUE_MISSION];
export { runHeading };
