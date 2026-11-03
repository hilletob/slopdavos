import {
  createRider, stepRider, riderSpeed, travelHeading, pointAt, lineLength, buildCheckpoints, updateCheckpoints,
  SKI_PARAMS, SNOW_GRAVITY
} from './missions-data-snow.js';

// js/missions-data-sledge.js
// The horn sledge race at the Rinerhorn (js/missions-data.js lists it; js/missions-sledge.js has its runtime: the
// sledge, the riders, the stakes and nets of the run, the start arch and the finish): its definition and the pure logic
// behind it, three.js-free like js/missions-data-snow.js (tests/missions-sledge.test.mjs drives it, a bot down the run
// on the real terrain included).
//
// The run: the Rinerhorn sled run (OSM w265318293, relation 3565542 "Davos Rinerhorn", piste:type=sled) from the
// Jatzmeder (the gondola's top station, 2052 m in swissALTI3D) through the hairpins of the forest road down towards
// Davos Glaris, 3.3 km in all. This race uses the original 2.04 km course, 350 m of drop (17 % on average),
// finishing at its last hairpin above the Glaris meadows (~1700 m); the landscape now continues past that point.
//
// The horn sledge (Hornschlitten): the old wooden goods sledge of the Grisons, its runners curving up in front into
// the two horns the driver holds. The driver sits in front and steers with the body and the feet (dragging a heel
// pivots it), the partner behind brakes. Physics: the rider of js/missions-data-snow.js (stepRider: gravity along the
// slope, friction, drag, the runners' grip carving the sideways speed into the way they point) with a sledge's numbers
// — little friction on the prepared run, a lot in the deep snow beside it; on top of it the sledge's own limits: too
// much lateral acceleration (too fast into a tight bend) tips it over, the nets on the outside of the bends stop it,
// far off the run it is lost. A crash costs 5 s and puts the sledge back on the run.

const TAU = Math.PI * 2;
const wrapPi = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);

// --- The run -----------------------------------------------------------------------------------------------------------
export const HORN_RUN_ID = 'w265318293';
// (the OSM way in the world frame, from the Jatzmeder down to x = -2881: its 84 nodes as they are)
export const HORN_RUN = [
  -1879.6,5743,-1896.9,5763.3,-1900,5789.3,-1891.7,5828.5,-1896.2,5840.6,-1919.1,5860.9,-1920.8,5878.9,-1901.9,5934.1,
  -1904.7,5958.5,-1912,5979.7,-1932.6,6001.2,-1971.7,6018.8,-1985.3,6038.8,-1986.4,6066.6,-1986.2,6090.8,-1996.4,6106.9,
  -2020.1,6116.6,-2042.5,6115.9,-2055.5,6103,-2059.8,6078.3,-2069.2,6066.6,-2086.4,6064.4,-2107.7,6066.1,-2117.7,6060.2,
  -2122.3,6043.7,-2123.3,5991.5,-2139.8,5960.9,-2172.4,5910.7,-2176.7,5895.1,-2180.6,5868.5,-2191.8,5822.3,-2207.7,5782.7,
  -2224.4,5753.8,-2245,5724.5,-2248.2,5708,-2250.7,5689.8,-2254.1,5683.7,-2261.8,5681.2,-2268.3,5684.9,-2274.2,5695.4,
  -2301.4,5744.7,-2337.6,5813,-2347.1,5835.4,-2358.8,5843.9,-2369.9,5846.7,-2382,5845.1,-2391,5837.2,-2397,5817.8,
  -2399.6,5770,-2399.5,5745.7,-2407.7,5734.3,-2417.4,5730,-2429.4,5731.4,-2445,5737.9,-2456.8,5745.3,-2474.5,5765.7,
  -2502.6,5802.2,-2517.8,5815.2,-2529.8,5817.5,-2538.1,5812.8,-2543.2,5799.1,-2542.5,5768,-2549.1,5756.2,-2557,5749.1,
  -2578,5747.6,-2603.1,5758.9,-2632.2,5772.9,-2660.3,5781.9,-2679.7,5781.4,-2746,5730.3,-2764.7,5723.5,-2779.2,5724.5,
  -2788.6,5729.1,-2797.8,5749,-2810.6,5769.8,-2826.2,5777.6,-2847.3,5775.5,-2862.9,5765.6,-2873.7,5752.6,-2879.6,5735.7,
  -2878.8,5718.2,-2875.9,5695.5,-2877.4,5682.8,-2881.3,5679.6
];

/** The run prepared for the race: the cumulative arc lengths, the bends (where the nets stand) */
export function createCourse(pts = HORN_RUN, { half = SLEDGE_TRACK.half } = {}) {
  const n = pts.length / 2;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  const course = { pts, cum, length: cum[n - 1], half, bends: [] };
  course.bends = findBends(course);
  return course;
}

/** The direction of the run at arc length s (rad, the controllers' heading), smoothed over ±span m */
export function runHeading(course, s, span = 6) {
  const a = pointAt(course.pts, clamp(s - span, 0, course.length)), b = pointAt(course.pts, clamp(s + span, 0, course.length));
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/** The turn of the run round s: its curvature (1/m, + to the left) over a window of ±span m */
export function runCurvature(course, s, span = 10) {
  const s0 = clamp(s - span, 0, course.length), s1 = clamp(s + span, 0, course.length);
  if (s1 - s0 < 1) return 0;
  return wrapPi(runHeading(course, s1, 4) - runHeading(course, s0, 4)) / (s1 - s0);
}

/**
 * The bends of the run: stretches of `minLength` m or more turning tighter than `radius` m. [{ s0, s1, side (+1: the
 * net on the left, outside a right-hand bend; -1: on the right), radius (the tightest) }]
 */
export function findBends(course, { radius = 40, step = 2, pad = 6, minLength = 6 } = {}) {
  const out = [];
  let cur = null;
  for (let s = 0; s <= course.length; s += step) {
    const k = runCurvature(course, s);
    const tight = Math.abs(k) > 1 / radius;
    const side = k > 0 ? -1 : 1; // (a left-hand bend throws the sledge out to the right)
    if (tight && cur && cur.side === side) { cur.s1 = s; cur.radius = Math.min(cur.radius, 1 / Math.abs(k)); continue; }
    if (cur) { out.push(cur); cur = null; }
    if (tight) cur = { s0: s, s1: s, side, radius: 1 / Math.abs(k) };
  }
  if (cur) out.push(cur);
  const padded = out.filter((b) => b.s1 - b.s0 >= minLength - step).map((b) => ({ ...b, s0: Math.max(0, b.s0 - pad), s1: Math.min(course.length, b.s1 + pad) }));
  // (one bend into the next on the same side: one net)
  const merged = [];
  for (const b of padded) {
    const prev = merged[merged.length - 1];
    if (prev && prev.side === b.side && b.s0 <= prev.s1 + 2) { prev.s1 = b.s1; prev.radius = Math.min(prev.radius, b.radius); } else merged.push(b);
  }
  return merged;
}

/**
 * The point of the run nearest (x, z): { s, d (m off the centre line, + left), x, z, tx, tz, i (its segment) }.
 * `hint`: the segment found last time (the search stays near it, the run doubles back on itself in the hairpins)
 */
export function projectOnRun(course, x, z, hint = -1, out = {}) {
  const { pts, cum } = course;
  const n = pts.length / 2;
  let from = 0, to = n - 1;
  if (hint >= 0) { from = Math.max(0, hint - 6); to = Math.min(n - 1, hint + 7); }
  let best = Infinity;
  for (let i = from; i < to; i++) {
    const ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[i * 2 + 2], bz = pts[i * 2 + 3];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const px = ax + dx * t, pz = az + dz * t;
    const d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < best) {
      best = d2;
      const L = Math.sqrt(L2);
      out.i = i; out.x = px; out.z = pz; out.tx = dx / L; out.tz = dz / L; out.s = cum[i] + t * L;
    }
  }
  // (+ left of the way down: the left of heading h is h + π/2, i.e. (tz, -tx))
  out.d = (x - out.x) * out.tz - (z - out.z) * out.tx;
  return out;
}

/** The bend at arc length s (or null) */
export const bendAt = (course, s) => course.bends.find((b) => s >= b.s0 && s <= b.s1) || null;

// --- The sledge --------------------------------------------------------------------------------------------------------
// (stepRider's numbers for two on a wooden horn sledge: ~180 kg, iron-shod runners; ~70 km/h flat out on the steep bits)
export const SLEDGE_PARAMS = {
  ...SKI_PARAMS,
  kind: 'sledge',
  mu: 0.045, // iron on the prepared run
  drag: 0.0034, tuckDrag: 0.0027, // per m (a v² term): ducked low, W
  maxSpeed: 22,
  turnRate: 1.15, // rad/s at most (the horns pulled, a heel dragged)
  maxLatG: 1.15, // what the runners hold before they slide (more than the sledge stands: SLEDGE_TRACK.tipG)
  grip: 7,
  carveKeep: 0.55,
  brake: 3.4, // m/s²: the heels and the brake chain (S)
  push: 1.4, pushSpeed: 3, // pushing off with the hands at the start (W)
  spinRate: 0, flipRate: 0,
  airLift: 0.18
};
// (in the deep snow beside the run)
export const SLEDGE_OFF_PARAMS = { ...SLEDGE_PARAMS, mu: 0.2, drag: 0.012, tuckDrag: 0.011, grip: 4, push: 0.5 };

export const SLEDGE_TRACK = {
  half: 2.6, // m: the prepared run either side of its line
  netGap: 1.4, // m past the run's edge: the nets on the outside of the bends
  lostAt: 14, // m off the line: lost, back onto the run
  tipG: 0.8, // the lateral acceleration (in g) the sledge stands; beyond it, it starts to tip
  tipRate: 5, // how fast it tips per g over (1 = over)
  netCrash: 7, // m/s into a net: a crash (slower: it stops and bounces back)
  heelTurn: 0.75, // rad/s: steering with a heel dragged (S with A/D)
  crashS: 1.6 // s on the snow before the sledge is back on the run
};
export const SLEDGE_CRASH_MS = 5000;

/** A sledge at rest on the run at arc length s */
export function createSledge(course, height, s = 0) {
  const p = pointAt(course.pts, s);
  const heading = runHeading(course, s);
  const r = createRider(p.x, height(p.x, p.z), p.z, heading);
  return { rider: r, tip: 0, latG: 0, crashT: 0, crashes: 0, nets: 0, offT: 0, proj: projectOnRun(course, p.x, p.z), last: null };
}

/** Puts the sledge back on the run at arc length s, at rest, along the run */
export function resetSledge(sl, course, height, s) {
  const p = pointAt(course.pts, clamp(s, 0, course.length));
  const r = sl.rider;
  r.x = p.x; r.z = p.z; r.y = height(p.x, p.z);
  r.vx = r.vy = r.vz = 0;
  r.heading = runHeading(course, s);
  r.airborne = false; r.air = null; r.crashT = 0; r.lean = 0; r.brake = 0; r.tuck = 0; r.omega = 0;
  sl.tip = 0; sl.latG = 0; sl.crashT = 0;
  projectOnRun(course, p.x, p.z, -1, sl.proj);
}

/**
 * One step of the sledge (dt <= ~1/60 s). input: { steer (-1..1, + left), tuck (0..1, W: duck / push off), brake (0..1,
 * S) }. Returns the event of the step: null | 'crash' (tipped over, into a net too fast, lost) | 'net' (stopped by a
 * net) | 'back' (on the run again after a crash); sl.last says why.
 */
export function stepSledge(sl, input, dt, height, course, T = SLEDGE_TRACK) {
  const r = sl.rider;
  if (sl.crashT > 0) {
    // on the snow: the sledge slides to a stop, then back onto the run a little above where it left it
    sl.crashT -= dt;
    const k = Math.exp(-dt * 4);
    r.vx *= k; r.vy *= k; r.vz *= k;
    r.x += r.vx * dt; r.z += r.vz * dt; r.y = height(r.x, r.z);
    if (sl.crashT <= 0) { resetSledge(sl, course, height, sl.proj.s - 6); return 'back'; }
    return null;
  }
  const proj = projectOnRun(course, r.x, r.z, sl.proj.i ?? -1, sl.proj);
  const off = Math.abs(proj.d) > T.half;
  sl.offT = off ? sl.offT + dt : 0;
  const steer = clamp(input.steer || 0, -1, 1), brake = clamp(input.brake || 0, 0, 1), tuck = clamp(input.tuck || 0, 0, 1);
  const landing = stepRider(r, { steer, tuck, brake, spin: 0, flip: 0, grab: false }, dt, height, off ? SLEDGE_OFF_PARAMS : SLEDGE_PARAMS);
  // a heel dragged in the snow: the sledge pivots round it (slow, and it brakes: stepRider has the brake)
  if (!r.airborne && brake > 0 && steer) r.heading += steer * brake * T.heelTurn * dt;
  if (landing && landing.quality === 'crash') { r.crashT = 0; return crash(sl, 'landing'); }
  // tipping: the lateral acceleration of the turn over what the sledge stands
  const speed = riderSpeed(r);
  sl.latG = r.airborne ? 0 : (r.omega * speed) / SNOW_GRAVITY;
  const over = Math.abs(sl.latG) - T.tipG;
  sl.tip = over > 0 ? sl.tip + over * T.tipRate * dt : Math.max(0, sl.tip - dt * 1.5);
  sl.tipSide = Math.sign(sl.latG) || sl.tipSide || 1;
  if (sl.tip >= 1) return crash(sl, 'tip');
  // the nets on the outside of the bends
  const p2 = projectOnRun(course, r.x, r.z, proj.i, sl.proj);
  const bend = bendAt(course, p2.s);
  if (bend && p2.d * bend.side > T.half + T.netGap) {
    // (the speed into the net: across the run)
    const vAcross = Math.abs(r.vx * p2.tz - r.vz * p2.tx);
    if (vAcross > T.netCrash) return crash(sl, 'net');
    // stopped by the net: back against it, the speed along the run kept in part
    const edge = bend.side * (T.half + T.netGap - 0.05);
    r.x = p2.x + p2.tz * edge; r.z = p2.z - p2.tx * edge; r.y = height(r.x, r.z);
    const along = r.vx * p2.tx + r.vz * p2.tz;
    r.vx = p2.tx * along * 0.6; r.vz = p2.tz * along * 0.6; r.vy = 0;
    r.heading = Math.atan2(p2.tx, p2.tz);
    sl.nets++;
    sl.last = 'net';
    return 'net';
  }
  if (Math.abs(p2.d) > T.lostAt) return crash(sl, 'lost');
  return null;
}

function crash(sl, why) {
  sl.crashT = SLEDGE_TRACK.crashS;
  sl.crashes++;
  sl.last = why;
  sl.tip = 0;
  const r = sl.rider;
  r.vx *= 0.35; r.vy *= 0.35; r.vz *= 0.35;
  return 'crash';
}

// --- A bot down the run (the medals' calibration, the tests) -----------------------------------------------------------
/**
 * The input of a driver who looks ahead: steers for a point on the run `look` m ahead, brakes for the bends to the
 * speed the sledge stands in them (the tightest radius ahead × `margin` of the tip limit), ducks where it can go.
 */
export function botInput(sl, course, { margin = 0.82, ahead = 2.4 } = {}) {
  const r = sl.rider, sp = riderSpeed(r), s = sl.proj.s;
  const look = Math.max(7, sp * 0.9);
  const tgt = pointAt(course.pts, Math.min(course.length, s + look));
  // (steering back towards the line too: the target a little to the other side of where the sledge is)
  const want = Math.atan2(tgt.x - r.x, tgt.z - r.z);
  const err = wrapPi(want - travelHeading(r, r.heading));
  const steer = clamp(err * 2.6, -1, 1);
  // the slowest bend within the braking distance ahead
  let vMax = SLEDGE_PARAMS.maxSpeed;
  const reach = Math.max(25, sp * sp / (2 * 2.2) + sp * ahead);
  for (let d = 0; d <= reach; d += 4) {
    const k = Math.abs(runCurvature(course, Math.min(course.length, s + d), 8));
    if (k < 1e-4) continue;
    const v = Math.sqrt((margin * SLEDGE_TRACK.tipG * SNOW_GRAVITY) / k);
    // (a bend further on can be met faster now: what braking still takes off before it)
    vMax = Math.min(vMax, Math.sqrt(v * v + 2 * 2.2 * Math.max(0, d - sp * 0.5)));
  }
  const brake = sp > vMax + 0.3 ? clamp((sp - vMax) / 2, 0.3, 1) : 0;
  const tuck = !brake && sp < vMax - 1.5 ? 1 : 0;
  return { steer, tuck, brake };
}

// --- The mission -------------------------------------------------------------------------------------------------------
export const HORN_SLEDGE_ID = 'horn-sledge-rinerhorn';
export const hornCheckpoints = (course = createCourse()) => buildCheckpoints(course.pts, 160, 90);
// (the race's three parts: the Jatzmeder's first bends, the hairpins in the forest, the last steep stretch to Glaris)
const SECTIONS = [
  { id: 'jatzmeder', title: 'Down from the Jatzmeder', toS: 640 },
  { id: 'hairpins', title: 'The hairpins in the forest', toS: 1460 },
  { id: 'finish', title: 'Down to the finish', toS: Infinity }
];

const sledgeSection = ({ id, title, toS }) => ({
  id,
  title,
  check(ctx, state) {
    const last = state.cps.reduce((k, c, i) => (c.s <= toS + 1 ? i : k), 0);
    const cp = state.cps[state.next];
    const n = state.cps.length;
    const skipped = state.skipped != null ? state.cps[state.skipped] : null;
    const pen = state.crashes ? ` · ${state.crashes} ${state.crashes === 1 ? 'crash' : 'crashes'} (+${(state.crashes * SLEDGE_CRASH_MS) / 1000} s)` : '';
    const text = skipped ? `Checkpoint ${skipped.i + 1} missed: back up to it` : `Checkpoint ${Math.min(n, state.next + 1)}/${n} · ${cp ? fmtDist(Math.hypot(cp.x - ctx.x, cp.z - ctx.z)) : ''}${pen}`;
    const hint = state.crashT > 0 ? (state.why === 'net' ? `Into the net! +${SLEDGE_CRASH_MS / 1000} s` : state.why === 'lost' ? `Off the run! +${SLEDGE_CRASH_MS / 1000} s` : `Tipped over! +${SLEDGE_CRASH_MS / 1000} s`)
      : state.tip > 0.25 ? 'Too fast for this bend: brake (S)!'
      : state.off ? 'Deep snow: back onto the run'
      : ctx.mode !== 'person' ? 'Back on the sledge' : null;
    return { done: state.next > last, progress: state.next / n, text, target: cp ? { x: cp.x, z: cp.z, r: 6, style: skipped ? 'hazard' : 'plain' } : null, hint };
  }
});

export const HORN_SLEDGE_MISSION = {
  id: HORN_SLEDGE_ID,
  title: 'Horn sledge race at the Rinerhorn',
  intro: 'The horn sledge race of the winter: two on an old Grisons horn sledge, down the Rinerhorn sled run from the Jatzmeder through the hairpins of the forest towards Glaris, 2 km and 350 m of drop. You sit in front and steer: A/D pull the horns and lean, S digs in the heels and the brake chain (with A/D: a heel dragged, the tight turn), W ducks low or pushes off. Too fast into a tight bend and the sledge tips over; the nets on the outside of the bends catch you. Each crash costs 5 s.',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['hornSledge'],
  // (calibrated with botInput down the run: js/missions-data-sledge.js, tests/missions-sledge.test.mjs)
  // (a careful clean bot run 2:20, a bold one 2:04 plus a tip-over; a human on the keys a little slower)
  bonusMs: 140 * 1000,
  medals: { gold: 140000, silver: 170000, bronze: 215000 },
  colour: '#b5652b',
  icon: 'sledge',
  finish: 'Glaris in sight: the sledge glides out, the partner behind lets go of the brake chain. A hot Bündner Nusstorte at the Rinerhorn hut is earned.',
  pin: { x: -1872, z: 5752 },
  get start() {
    return { x: HORN_RUN[0], z: HORN_RUN[1], heading: runHeading(createCourse(), 4, 4) };
  },
  props: [],
  createState() {
    return { cps: hornCheckpoints(), next: 0, skipped: null, crashes: 0, nets: 0, penaltyMs: 0, crashT: 0, why: null, tip: 0, off: false, topSpeed: 0 };
  },
  update(ctx, state) {
    if (ctx.mode === 'person') updateCheckpoints(state, ctx.x, ctx.z, 9);
  },
  summary(state) {
    return [
      `${state.crashes} ${state.crashes === 1 ? 'crash' : 'crashes'}${state.crashes ? ` (+${(state.crashes * SLEDGE_CRASH_MS) / 1000} s)` : ''} · ${state.nets} ${state.nets === 1 ? 'net' : 'nets'} touched · top speed ${Math.round(state.topSpeed * 3.6)} km/h`
    ];
  },
  objectives: SECTIONS.map(sledgeSection)
};

// === The Sommerrodelbahn on the Schatzalp =================================================================================
// (js/missions-sledge.js tobogganRun has its runtime: the trough, the posts, the gallery, the sledges, the family)
//
// The course: OSM w99952116 (attraction=summer_toboggan, sport=toboggan, traced from Bing) from the top of the tow line
// down to its foot, 456 m, 8 hairpins, as they are: graubuenden.ch counts "acht Kurven und einen Tunnel" and "über
// 500 m" (OSM's tracing runs a little shorter). swissALTI3D has only ~30 m of drop along it (6.6 %).
// The tunnel: OSM has w99952128 tunnel=yes on the TOW line where it crosses the run at s ~ 320; the tourist text has the
// run go through one. Nobody says more, so the run gets a short gallery on the straight round that crossing.
// The handling is on rails, not stepRider: one number along the course (s, v), the brake lever, the lean. A real run this
// flat is a slow affair, so `gravity` and `pull` are game numbers: ~45 km/h flat out, which is what the bends need to bite.
export const TOBOGGAN_ID = 'sommerrodelbahn-schatzalp';
export const TROUGH_RUN_ID = 'w99952116';
export const TROUGH_RUN = [
  -1151.3,-781.2,-1152.7,-782.5,-1154.3,-782.8,-1155.7,-782.7,-1156.9,-782,-1158,-780.9,-1162.1,-771.6,-1162.7,-771.1,
  -1163.5,-770.2,-1191.5,-744.7,-1193,-742.7,-1193.9,-740.9,-1194.2,-739,-1194.3,-737.2,-1194.2,-734.9,-1193.3,-732.7,
  -1192.1,-730.9,-1190,-729.1,-1187.6,-727.8,-1185.2,-727.3,-1182.8,-727.5,-1180.9,-728.3,-1179,-729.5,-1177.1,-731.3,
  -1175.7,-732.9,-1167.7,-746,-1166.3,-747.7,-1164.8,-749.2,-1162.8,-750.3,-1160.1,-751.1,-1157.4,-751.3,-1155.4,-750.8,
  -1153.4,-749.9,-1151.8,-748.4,-1150.5,-746.7,-1149.6,-744.6,-1149.4,-742.5,-1149.4,-740.7,-1149.7,-738.8,-1150.3,-736.6,
  -1151.1,-735.4,-1152.5,-733.9,-1182,-709.9,-1183.6,-708.5,-1185,-706.8,-1185.9,-705,-1186.4,-703,-1186.5,-700.8,
  -1186.4,-698.9,-1185.9,-697.3,-1185.1,-696,-1184,-694.4,-1182.5,-693,-1180.6,-692,-1178.7,-691.4,-1176.5,-691.2,
  -1174,-691.7,-1171.8,-692.6,-1151.1,-707.7,-1148.7,-708.6,-1146.4,-708.9,-1144.1,-708.8,-1142.3,-708.3,-1140.4,-707.2,
  -1138.9,-705.8,-1137.7,-704.2,-1136.9,-702.5,-1136.5,-700.6,-1136.5,-698.6,-1136.7,-696.7,-1137.4,-694.8,-1138.2,-692.9,
  -1139.3,-691.6,-1141.1,-690.1,-1148.3,-684.9,-1149.5,-683.5,-1150.5,-681.9,-1151.4,-679.6,-1151.7,-677.6,-1151.7,-675.7,
  -1151.4,-674.2,-1150.8,-672.6,-1149.8,-671,-1148.4,-669.6,-1146.1,-668.1,-1144,-667.3,-1141.8,-667.1,-1139.8,-667.4,
  -1137.8,-667.9,-1135.9,-669,-1134.5,-670.1,-1122.4,-683.3,-1120.6,-685,-1118.3,-686.7,-1115.6,-688.5,-1112.5,-689.7,
  -1109.5,-690.5,-1106.4,-691,-1086.5,-693.4,-1084.1,-693.2,-1081.8,-692.5,-1079.9,-691.2,-1078.5,-689.7,-1077.4,-687.8,
  -1076.6,-685.6,-1076.5,-683.4,-1076.6,-681.3,-1077,-679.1,-1077.9,-677.1,-1079,-675.5,-1080.4,-674.2,-1081.9,-673.2,
  -1084.1,-672.3,-1085.9,-672,-1087.3,-672,-1094.7,-672.9,-1097.1,-672.9,-1099.8,-672.3,-1102.1,-671.2,-1103.5,-670.2,
  -1104.8,-668.8,-1105.9,-667.3,-1107.2,-664.8,-1108.4,-662,-1108.9,-660.2,-1109.3,-658.3,-1112.8,-640.2,-1113.4,-638.6,
  -1114.6,-637.6,-1116.1,-637.5,-1117.3,-637.8,-1118.4,-638.9
];
// (the tow line up, w99952134 + w99952128 (in the tunnel) + w99952101: foot, tunnel mouths, top)
export const TROUGH_LIFT = [-1118.4, -638.9, -1124.7, -666.1, -1133.7, -705.2, -1151.3, -781.2];

export const TOBOGGAN = {
  half: 0.46, wallH: 0.34, // m: the steel trough, half its width and how high its walls stand
  clearance: 0.35, minGrade: 0.03, // m over the ground at least; it always falls at least this much
  pull: 1.05, gravity: 1.6, // m/s² on the level and the multiple of the real slope's pull (game numbers, see above)
  drag: 0.0125, // per m (a v² term): ~13 m/s flat out
  brake: 7.5, // m/s²: the lever pulled right back
  warnG: 1.0, bumpG: 1.5, // the lateral g where the sledge starts up the wall, and where it would be right over the top
  leanGain: 0.22, // leaning into the bend takes this share off the lateral g (leaning out adds it)
  wallRate: 6, wallDrag: 3, // how fast the sledge climbs (1/s), what the climb costs (m/s² at the top of the wall)
  bumpAt: 0.94, // this far up the wall: over it comes, the comic bump
  stopS: 1.8, bumpMs: 3000, // s standing with the sledge bumping back, and the time on top of that
  ramMs: 4000, ramClosing: 1.2, gap: 2.6, // the family: the penalty, the closing speed (m/s) that counts as a ram, sledge to sledge (m)
  family: { headStart: 95, speed: 7.5, bendG: 0.75, spacing: 3.2, sledges: 3, clearAt: 22, clearSpeed: 9 },
  tunnel: { s0: 311, s1: 326 },
  startS: 8, // m down the way: the rider starts clear of the tow's top pylon, which stands on the way's first node
  finishAt: 12 // m before the course's end: the line (past it the way only curls round to the tow line)
};

/**
 * The run ready to ride: createCourse's course plus, every metre, the trough's height (`ys`: always over the ground and
 * always falling, the posts stand where the ground falls away), the ground under it (`grounds`), the curvature (`ks`,
 * 1/m, + left) and the banking of the bends (`banks`, rad, + raised on the right).
 */
export function createTrough(height, pts = TROUGH_RUN, T = TOBOGGAN) {
  const course = createCourse(pts, { half: T.half });
  const n = Math.ceil(course.length) + 1;
  const ys = new Float32Array(n), grounds = new Float32Array(n), ks = new Float32Array(n), banks = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.min(course.length, i), p = pointAt(pts, s);
    grounds[i] = height(p.x, p.z);
    const s0 = Math.max(0, s - 3), s1 = Math.min(course.length, s + 3);
    ks[i] = s1 > s0 ? wrapPi(runHeading(course, s1, 1.5) - runHeading(course, s0, 1.5)) / (s1 - s0) : 0;
  }
  const fall = () => { // (from the bottom up: over the ground, and over the next metre by the least fall)
    for (let i = n - 1; i >= 0; i--) ys[i] = Math.max(grounds[i] + T.clearance, i < n - 1 ? ys[i + 1] + T.minGrade : -Infinity);
  };
  fall();
  // (the terrain's cells show as steps: smoothed, then lifted back over the ground where that cut into it)
  for (let pass = 0; pass < 4; pass++) {
    const prev = ys.slice();
    for (let i = 1; i < n - 1; i++) ys[i] = prev[i - 1] * 0.25 + prev[i] * 0.5 + prev[i + 1] * 0.25;
  }
  for (let i = n - 1; i >= 0; i--) ys[i] = Math.max(ys[i], grounds[i] + T.clearance * 0.6, i < n - 1 ? ys[i + 1] + T.minGrade * 0.5 : -Infinity);
  for (let i = 0; i < n; i++) banks[i] = clamp(ks[i] * 3.2, -0.55, 0.55);
  return { course, ys, grounds, ks, banks, n, length: course.length, T };
}

const sampled = (arr, n, s) => {
  const f = clamp(s, 0, n - 1.001), i = Math.floor(f);
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
};
export const troughY = (tr, s) => sampled(tr.ys, tr.n, s);
export const troughCurve = (tr, s) => sampled(tr.ks, tr.n, s);
export const troughBank = (tr, s) => sampled(tr.banks, tr.n, s);
export const troughGrade = (tr, s) => sampled(tr.ys, tr.n, s - 1.5) - sampled(tr.ys, tr.n, s + 1.5) > 0 ? (sampled(tr.ys, tr.n, s - 1.5) - sampled(tr.ys, tr.n, s + 1.5)) / 3 : 0;

/** The sledge at arc length s, held */
export const createToboggan = (s = 0) => ({ s, v: 0, lean: 0, brake: 0, wall: 0, wallSide: 1, latG: 0, stopT: 0, bumps: 0, rams: 0, ramCool: 0, last: null });

/**
 * One step on the rails (dt <= ~1/60 s). input: { brake (0..1), lean (-1..1, + left) }; lead: the family's last sledge
 * ({ s, v, gone }) or null. Returns the step's event: null | 'bump' (over the wall, it stops) | 'ram' (into the family).
 */
export function stepToboggan(sl, input, dt, tr, lead = null, T = tr.T) {
  sl.ramCool = Math.max(0, sl.ramCool - dt);
  if (sl.stopT > 0) { // (standing, the sledge bumping back into the trough)
    sl.stopT -= dt;
    sl.v = 0;
    sl.wall *= Math.exp(-dt * 3);
    sl.latG = 0;
    return null;
  }
  const brake = clamp(input.brake || 0, 0, 1), lean = clamp(input.lean || 0, -1, 1);
  sl.brake += (brake - sl.brake) * Math.min(1, dt * 14);
  sl.lean += (lean - sl.lean) * Math.min(1, dt * 7);
  const a = T.pull + SNOW_GRAVITY * troughGrade(tr, sl.s) * T.gravity - T.drag * sl.v * sl.v - T.brake * sl.brake - T.wallDrag * sl.wall;
  sl.v = Math.max(0, sl.v + a * dt);
  sl.s = Math.min(tr.length, sl.s + sl.v * dt);
  // up the wall: the lateral g of the bend past what the trough's banking takes, less the lean into it
  const k = troughCurve(tr, sl.s);
  const lat = (sl.v * sl.v * Math.abs(k)) / SNOW_GRAVITY;
  sl.latG = lat * (1 - T.leanGain * sl.lean * Math.sign(k));
  const target = clamp((sl.latG - T.warnG) / (T.bumpG - T.warnG), 0, 1);
  sl.wall += (target - sl.wall) * Math.min(1, dt * T.wallRate);
  if (Math.abs(k) > 0.01) sl.wallSide = -Math.sign(k); // (a left-hand bend throws it up the right-hand wall)
  if (sl.wall >= T.bumpAt) {
    sl.v = 0; sl.stopT = T.stopS; sl.bumps++; sl.last = 'bump';
    return 'bump';
  }
  // the family ahead: there is no way past in a trough
  if (lead && !lead.gone) {
    const gap = lead.s - sl.s;
    if (gap < T.gap) {
      const closing = sl.v - lead.v;
      sl.s = lead.s - T.gap;
      if (closing > T.ramClosing && sl.ramCool <= 0) {
        sl.v = Math.max(0, lead.v * 0.6);
        sl.rams++; sl.ramCool = 1.5; sl.last = 'ram';
        lead.jolt = 1;
        return 'ram';
      }
      sl.v = Math.min(sl.v, lead.v);
    }
  }
  return null;
}

/** The family: three sledges at a Sunday pace (s: the last of them) */
export function createFamily(T = TOBOGGAN) {
  return { s: T.family.headStart, v: 0, gone: false, jolt: 0 };
}

export function stepFamily(f, dt, tr, T = tr.T) {
  if (f.gone) return;
  const F = T.family;
  const front = f.s + F.spacing * (F.sledges - 1);
  let want = f.s > tr.length - F.clearAt - F.spacing * (F.sledges - 1) ? F.clearSpeed : F.speed;
  for (let d = 0; d <= 8; d += 2) {
    const k = Math.abs(troughCurve(tr, Math.min(tr.length, front + d)));
    if (k > 1e-3 && want < F.clearSpeed) want = Math.min(want, Math.sqrt((F.bendG * SNOW_GRAVITY) / k));
  }
  f.v += clamp(want - f.v, -3 * dt, 1.5 * dt);
  f.s += f.v * dt;
  f.jolt = Math.max(0, f.jolt - dt * 2);
  if (f.s >= tr.length) f.gone = true; // (off at the foot of the run, out of the way)
}

/** A driver who looks ahead (the medals' calibration, the tests): brakes to `margin` of the wall's limit and for the family */
export function tobogganBot(sl, tr, lead = null, { margin = 0.9, lean = 1 } = {}) {
  const T = tr.T;
  const limit = (d) => {
    const k = Math.abs(troughCurve(tr, Math.min(tr.length, sl.s + d)));
    return k < 1e-3 ? Infinity : Math.sqrt((margin * T.warnG * SNOW_GRAVITY) / (k * (1 - T.leanGain * lean)));
  };
  let vMax = Infinity;
  for (let d = 0; d <= 30; d += 2) vMax = Math.min(vMax, Math.sqrt(limit(d) ** 2 + 2 * T.brake * 0.55 * d));
  let brake = sl.v > vMax ? clamp((sl.v - vMax) * 1.5 + 0.2, 0, 1) : 0;
  if (lead && !lead.gone) {
    const gap = lead.s - sl.s - T.gap, closing = sl.v - lead.v;
    if (closing > 0 && gap < (closing * closing) / (2 * T.brake * 0.5) + 1.5) brake = 1;
    else if (gap < 1 && sl.v >= lead.v) brake = Math.max(brake, 0.5);
  }
  const k = troughCurve(tr, Math.min(tr.length, sl.s + 3));
  return { brake, lean: Math.abs(k) > 0.02 ? Math.sign(k) * lean : 0 };
}

/** The phone's tilt as the lean (+ left): gamma upright, beta on its side, ±5° dead, full at 25° */
export function tiltLean(gamma, beta, angle = 0) {
  const a = ((angle % 360) + 360) % 360;
  const right = a === 90 ? beta : a === 270 ? -beta : gamma;
  if (!Number.isFinite(right) || Math.abs(right) < 5) return 0;
  return clamp(-(right - Math.sign(right) * 5) / 20, -1, 1);
}

const TOBOGGAN_SECTIONS = [
  { id: 'top', title: 'The first hairpins', toS: 180 },
  { id: 'tunnel', title: 'Through the tunnel', toS: 345 },
  { id: 'foot', title: 'Down to the foot of the lift', toS: Infinity }
];
const TOBOGGAN_LENGTH = 455.6;

const penaltyText = (state) => {
  const parts = [];
  if (state.bumps) parts.push(`${state.bumps} ${state.bumps === 1 ? 'bump' : 'bumps'}`);
  if (state.rams) parts.push(`${state.rams} ${state.rams === 1 ? 'ram' : 'rams'}`);
  return parts.length ? ` · ${parts.join(' · ')} (+${state.penaltyMs / 1000} s)` : '';
};

const tobogganSection = ({ id, title, toS }) => ({
  id,
  title,
  check(ctx, state) {
    const end = Math.min(toS, state.length - TOBOGGAN.finishAt);
    const hint = state.stopT > 0 ? `Over the wall! +${TOBOGGAN.bumpMs / 1000} s`
      : state.wall > 0.08 ? 'Too fast for this bend: brake (S) and lean!'
      : state.familyGap < 16 ? 'A family ahead: do not ram them, brake (S)!'
      : ctx.mode !== 'person' ? 'Back on the sledge' : null;
    return {
      done: state.s >= end,
      progress: clamp(state.s / state.length, 0, 1),
      text: `${fmtDist(state.length - state.s)} to the finish${penaltyText(state)}`,
      target: state.finish && toS === Infinity ? { x: state.finish.x, z: state.finish.z, r: 4, style: 'plain' } : null,
      hint
    };
  }
});

export const TOBOGGAN_MISSION = {
  id: TOBOGGAN_ID,
  title: 'Sommerrodelbahn on the Schatzalp',
  intro: 'Up on the Schatzalp, above the old sanatorium, a stainless steel trough winds down the meadow: eight hairpins and a tunnel over 450 m. You are on rails: W pushes off and the clock starts. The only control is the brake lever: hold S to brake, let go to fly. Lean into the bends with A/D (or tilt the phone). Too fast out of a bend and the sledge rides up the trough wall and shakes; way too fast and it stops with a bump, and that costs time. A family is on the run ahead at a Sunday pace: there is no way past, so do not ram them.',
  mode: 'person',
  season: 'summer',
  time: 'midday',
  features: ['tobogganRun'],
  // (calibrated with tobogganBot on the real terrain, tests/missions-sledge.test.mjs: every clean run ends up behind the
  // family, which reach the line after 49 s, whatever the driver's nerve: gold is a clean run right up behind them.
  // A careful one, braking early and not leaning, 53 s: silver. Never touching the lever, six rams, 73 s: bronze.)
  bonusMs: 51000,
  medals: { gold: 51000, silver: 58000, bronze: 75000 },
  colour: '#c43b2e',
  icon: 'sledge',
  finish: 'The trough levels out at the foot of the lift, the tow hook clicks on. Hands still shaking, time for an ice cream on the Schatzalp terrace.',
  pin: { x: -1104, z: -645 }, // (at the foot of the run, a few steps up from the Schatzalpbahn's top station)
  get start() {
    const p = pointAt(TROUGH_RUN, TOBOGGAN.startS);
    return { x: p.x, z: p.z, heading: runHeading(createCourse(TROUGH_RUN, { half: TOBOGGAN.half }), TOBOGGAN.startS + 4, 4) };
  },
  props: [],
  createState() {
    const p = pointAt(TROUGH_RUN, TOBOGGAN_LENGTH);
    return { s: TOBOGGAN.startS, length: TOBOGGAN_LENGTH, finish: { x: p.x, z: p.z }, wall: 0, stopT: 0, bumps: 0, rams: 0, penaltyMs: 0, familyGap: Infinity, topSpeed: 0 };
  },
  summary(state) {
    return [`${state.bumps} ${state.bumps === 1 ? 'bump' : 'bumps'} · ${state.rams} ${state.rams === 1 ? 'ram' : 'rams'} · top speed ${Math.round(state.topSpeed * 3.6)} km/h`];
  },
  objectives: TOBOGGAN_SECTIONS.map(tobogganSection)
};

export const SLEDGE_MISSIONS = [HORN_SLEDGE_MISSION, TOBOGGAN_MISSION];
export { lineLength };
