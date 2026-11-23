import { msg } from './messages.js';
import { buildCheckpoints, updateCheckpoints, pointAt } from './missions-data-snow.js';
import { createCourse, runHeading, projectOnRun, sledgeSection, SLEDGE_PARAMS, SLEDGE_OFF_PARAMS, SLEDGE_TRACK, SLEDGE_CRASH_MS } from './missions-data-sledge.js';

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
let course = null;
/** The sled run prepared like the horn sledge's (its arc lengths, its bends) */
export const schlittelCourse = () => (course ??= createCourse(SCHLITTEL_RUN, { half: 2.2 }));
export const schlittelCheckpoints = () => buildCheckpoints(SCHLITTEL_RUN, 150, 90);

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

// --- The Flämmli: with or without effect -----------------------------------------------------------------------------------
// A Kafi with a schnapps lit on top. With effect the two on the sledge are bolder and the head is not quite clear: the
// sledge runs faster (ducked lower, the heels lighter on the snow) and answers late, drifting to one side and the other,
// and the view sways. A time credit would not do: the leaderboard takes no time under the measured one
// (supabase/migrations/*_all_leaderboards.sql submit_run), so the effect has to be won on the run.
export const TIPSY = {
  lag: 0.15, // s: how late the horns answer
  brakeLag: 0.1, // s: the heels too
  drift: [0.1, 0.9, 0.05, 2.3], // the pull to one side: two slow swings (amplitude, rad/s)
  roll: 0.085 // rad: how far the view sways
};
// (bolder: ducked lower and the heels lighter on the snow, the two hanging further out in the bends)
export const TIPSY_PARAMS = { ...SLEDGE_PARAMS, mu: 0.034, drag: 0.0028, tuckDrag: 0.0021, maxSpeed: 26 };
// (the run is a 3 m track laid as a bench in the slope, js/path-bench.js: narrower than the horn sledge's 5 m run, with
// the ground falling away behind it. So the run is narrower here and its nets stand closer; a sledge at a net is set back
// onto the run and slides along the net, js/missions-data-sledge.js netSlide)
export const SCHLITTEL_TRACK = { ...SLEDGE_TRACK, half: 2.2, netGap: 0.8, netSlide: true };
export const TIPSY_TRACK = { ...SCHLITTEL_TRACK, tipG: 0.95 };
/** The sledge's numbers on this run after the Flämmli: { on, off, track } for stepSledge */
export const flaemmliParams = (choice) => (choice === 'tipsy' ? { on: TIPSY_PARAMS, off: SLEDGE_OFF_PARAMS, track: TIPSY_TRACK } : { on: SLEDGE_PARAMS, off: SLEDGE_OFF_PARAMS, track: SCHLITTEL_TRACK });
// (the ride begins a few metres down the way, on the bench: its first metre is a step up from the ground before it)
export const SCHLITTEL_START_S = 4;
export const SCHLITTEL_SNOW = { flat: 2, bank: 0.5 };
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
  // (and the bench's own ledges, a metre down within two, eased over ±4 m: a sledge would take off at each)
  for (let i = 0; i < n; i++) { let sum = 0, k = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { sum += filled[j]; k++; } line[i] = sum / k; }
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

export function chooseFlaemmli(state, withEffect) {
  if (state.choice) return false;
  state.choice = withEffect ? 'tipsy' : 'sober';
  return true;
}

export const createTipsy = () => ({ steer: 0, brake: 0, t: 0 });
/** What reaches the sledge of the driver's input after a Flämmli with effect (mem: createTipsy()) */
export function tipsyInput(input, dt, mem) {
  mem.t += dt;
  const [a1, w1, a2, w2] = TIPSY.drift;
  mem.steer += ((input.steer || 0) - mem.steer) * (1 - Math.exp(-dt / TIPSY.lag));
  mem.brake += ((input.brake || 0) - mem.brake) * (1 - Math.exp(-dt / TIPSY.brakeLag));
  const drift = a1 * Math.sin(mem.t * w1) + a2 * Math.sin(mem.t * w2 + 0.7);
  // (the heels fully off the snow once they are let go: a trace of brake left for ever would keep the sledge from being
  // pushed off again, js/missions-data-snow.js stepRider pushes only with no brake at all)
  return { steer: clamp(mem.steer + drift, -1, 1), tuck: input.tuck || 0, brake: mem.brake < 0.03 ? 0 : clamp(mem.brake, 0, 1) };
}
/** The view's roll (rad) t s into the ride */
export const tipsyRoll = (t) => TIPSY.roll * (Math.sin(t * 0.9) + 0.45 * Math.sin(t * 2.3 + 0.7));

// --- The mission -----------------------------------------------------------------------------------------------------------
const near = (ctx, p, r = p.r) => Math.hypot(ctx.x - p.x, ctx.z - p.z) <= r;
// (the run's two parts: the hairpins below the Schatzalp, the forest road down to the village)
const SECTIONS = [
  { id: 'upper', title: 'The upper hairpins', toS: 1100, tip: 'Brake (S) before a hairpin, then steer through it with A/D' },
  { id: 'village', title: 'Down to Davos Platz', toS: Infinity, tip: 'Duck low (W) on the straights, brake for the bends' }
];
/** A part of the run, waiting for the sledge while the player still stands on the terrace */
const rideSection = (spec) => {
  const section = sledgeSection(spec);
  return {
    ...section,
    check(ctx, state) {
      if (!state.riding) return { done: false, progress: 0, text: 'To the sledges at the top of the run …', target: null, hint: null };
      return section.check(ctx, state);
    }
  };
};

export const FONDUE_MISSION = {
  id: FONDUE_ID,
  title: 'Fondue Night on the Schatzalp',
  intro: 'Drupal Mountain Camp, open source on top of the world, and tonight is the classic: Fondue Night. Meet the camp at the Kongresszentrum, ride up to the Schatzalp and stir the fondue: draw a figure of eight through the pot with the mouse or your finger. Round in circles and the cheese splits, dawdle and it catches on the bottom. Then a Flämmli, with or without effect, your choice: with it the sledge runs faster, but the horns answer late and the valley sways. And then down the sled run to Davos Platz on a horn sledge, 2.3 km of hairpins by torchlight, against the clock. Each crash costs 5 s.',
  mode: 'person',
  season: 'winter',
  time: 'evening',
  features: ['fondueNight'],
  props: [],
  colour: '#0678be',
  icon: 'fondue',
  logo: './assets/logos/drupal-mountain-camp.webp',
  // (the evening before the ride takes some 40 s: 35 m to the door, the cut, 43 m to the table, eight eights at two
  // seconds each, the choice, the cut; a script doing each step at once got to the sledge in 28 s. The ride, botInput
  // down the real run on its bench (tests/missions-fondue.test.mjs): without effect a careful clean one 3:08-3:18, a bold
  // one 2:58; with effect 2:48-3:02, 10-16 s faster for the same care. A bot on the keys, full lock or nothing ten times
  // a second, 3:03-3:28 either way)
  bonusMs: 230 * 1000,
  medals: { gold: 230000, silver: 265000, bronze: 340000 },
  finish: 'Davos Platz, the runners scrape over the last ice. The fondue held, the Flämmli is still warm in your belly. See you at the next session, on top of the world.',
  start: FONDUE_START,
  pin: { x: FONDUE_START.x, z: FONDUE_START.z },
  createState() {
    return {
      arrived: false, stir: createStir(), choice: null, riding: false,
      cps: schlittelCheckpoints(), next: 0, skipped: null, crashes: 0, nets: 0, penaltyMs: 0, crashT: 0, why: null, tip: 0, off: false, topSpeed: 0
    };
  },
  update(ctx, state) {
    if (state.riding && ctx.mode === 'person') updateCheckpoints(state, ctx.x, ctx.z, 9);
  },
  summary(state) {
    const g = state.stir;
    return [
      msg('{n} figure eights{caught}{circles}',
        (p) => `${p.n} Achten · ${p.c ? `${p.c}× angebrannt (+${p.s} s)` : 'nichts angebrannt'}${p.k ? ` · ${p.k}-mal im Kreis gerührt` : ''}`,
        { n: g.eights, caught: g.strikes ? ` · caught on the bottom ${g.strikes}× (+${(g.strikes * STIR.burnMs) / 1000} s)` : ' · nothing caught',
          circles: g.circles ? ` · ${g.circles} ${g.circles === 1 ? 'circle' : 'circles'}` : '', c: g.strikes, s: (g.strikes * STIR.burnMs) / 1000, k: g.circles }),
      msg('Flämmli {effect} · {n} {crashes}{pen} · top speed {v} km/h',
        (p) => `Flämmli ${p.tipsy ? 'mit' : 'ohne'} Wirkung · ${p.n} ${p.n === 1 ? 'Sturz' : 'Stürze'}${p.pen} · Höchsttempo ${p.v} km/h`,
        { effect: state.choice === 'tipsy' ? 'with effect' : 'without effect', tipsy: state.choice === 'tipsy', n: state.crashes, crashes: state.crashes === 1 ? 'crash' : 'crashes',
          pen: state.crashes ? ` (+${(state.crashes * SLEDGE_CRASH_MS) / 1000} s)` : '', v: Math.round(state.topSpeed * 3.6) })
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
      title: 'A Flämmli: with or without effect?',
      check(ctx, state) {
        return { done: state.choice !== null, progress: null, text: 'With effect: a faster sledge, late horns, a swaying valley', target: null, hint: 'Choose your Flämmli' };
      }
    },
    ...SECTIONS.map(rideSection)
  ]
};

export const FONDUE_MISSIONS = [FONDUE_MISSION];
export { runHeading };
