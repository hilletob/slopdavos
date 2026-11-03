// js/missions-data-sport.js
// The sport missions (js/missions-data.js lists them in MISSIONS; js/missions-sport.js has their runtime): the Davos
// Nordic cross-country race on the World Cup trails from the Bünda into the Flüelatal, minigolf at the Hotel Waldhuus,
// darts in the Irish pub The Green Wildman and a 60 s run in the Schüssla, the skate bowl in the Färich. Their
// definitions and all the pure game logic — the cross-country skier's strokes on the slope, the race field's fixed
// pace, the minigolf ball on its felt between the boards, the dartboard's fields and 301 double-out, the skateboarder in
// the bowl (transitions, airs over the coping, grinds) and the tricks' points. No three.js and no DOM in here
// (tests/missions-sport.test.mjs plays them on plain objects).
// (no import from js/missions-data.js: it imports this module, the cycle would hand us its consts uninitialised)
//
// The places (docs/missions-locations.json):
//  - Davos Nordic: the Coop FIS Cross-Country World Cup (mid December, Ski Club Davos) has its stadium on the Bünda in
//    Davos Dorf and races on the "Flüelaloipen" into the Flüelatal (~5 km course, the steep "Cologna-Stutz"). The race
//    here: 4.3 km on the OSM Loipen (DAVOS_DATA.loipen) from the Bünda along the City-Trail into the Flüelatal, out on
//    the south side to its far loop, back on the north side and down the City-Trail to the finish — baked below with
//    its height profile (tools: the Loipen joined into a graph, the loop found by shortest paths; the terrain sampled
//    every 20 m), so that the race field's times are fixed and testable.
//  - Minigolf Hotel Waldhuus (OSM n12164199579, Mattastrasse 58, leisure=miniature_golf): six procedural lanes.
//  - The Green Wildman (OSM n12919367405, amenity=pub, Irish, Promenade 119): no source says it has a dartboard; an
//    Irish pub is the plausible place for one (noted in docs/missions-locations.json).
//  - The Schüssla: the concrete bowl the Davos skaters designed, opened 2019 in the Freizeitareal / Adventure Park
//    Färich at the mouth of the Flüelatal (Südostschweiz); not in OSM: its concrete pad located on the orthophoto.

const TAU = Math.PI * 2;
const G = 9.81;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);
const fmtTime = (ms) => {
  const t = Math.max(0, ms || 0);
  const m = Math.floor(t / 60000), s = Math.floor((t % 60000) / 1000), d = Math.floor((t % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
};
const fmtGap = (s) => `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(1)} s`;
/** A small seeded random generator (mulberry32) */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
function walkTo(spot, title, label) {
  return {
    id: 'enter',
    title,
    check(ctx) {
      const d = Math.hypot(ctx.x - spot.x, ctx.z - spot.z);
      return { done: d < spot.r, progress: null, text: `${fmtDist(d)} to ${label}`, target: { ...spot, style: 'plain' }, hint: null };
    }
  };
}

// =====================================================================================================================
// 1. Davos Nordic: the race course
// =====================================================================================================================
// The course (world frame, x = E − 2782500, z = 1185500 − N): start and finish on the City-Trail beside the Bünda
// (Fussballfeld Bünda, the World Cup stadium's meadow), out along the City-Trail (w854855704, w1353008599, w1353008601)
// to the Färich, the Flüela trails' south side (w1191840997, w760027654, w760027653, w611657310, w1191841002,
// w1254994222/-223) to the far loop at the Tschuggen, back on their north side (w712976783, w606814563, w960705454,
// w1254994216, w1532751292, w712976160) to the junction above the Färich, down w1254088836 onto the City-Trail and back
// to the stadium.
export const XC_ROUTE = [1056.5, -1276.7, 1055.5, -1312, 1133.6, -1411.7, 1171.7, -1447.4, 1199, -1469.8, 1246.6, -1498.3, 1275.8, -1526.1, 1308.9, -1552.5, 1364.1, -1584.8, 1451.9, -1618.4, 1485.5, -1628.9, 1624.7, -1659.1, 1680.4, -1659.6, 1715.8, -1665.6, 1728.5, -1710.3, 1740.9, -1725, 1766.2, -1732.3, 1821.8, -1716.5, 1891.6, -1704, 1984.6, -1692.3, 2019.1, -1700.7, 2030.2, -1728.5, 2072.4, -1717.9, 2140, -1705.4, 2164.7, -1697.7, 2229.5, -1657.9, 2240.1, -1646.8, 2257.7, -1613.6, 2274.1, -1608.6, 2269.9, -1627.4, 2268.3, -1657.1, 2311.6, -1654.9, 2341, -1656.1, 2375.2, -1649.8, 2410.4, -1636.3, 2444.1, -1616.8, 2502.9, -1572, 2523.4, -1560.6, 2588.1, -1538.8, 2602.2, -1529.6, 2624.6, -1505, 2658.3, -1489.2, 2663.9, -1476, 2680.3, -1450.1, 2702, -1448.7, 2720.8, -1443.8, 2745.4, -1429.3, 2772.3, -1406.1, 2786.6, -1398.9, 2801.7, -1397.7, 2821.4, -1408.6, 2839.5, -1421.4, 2853.9, -1415.6, 2856.9, -1393, 2837.7, -1383.1, 2816.1, -1366.9, 2794.7, -1359.3, 2781.4, -1357.3, 2722.8, -1364.3, 2704.8, -1362.5, 2685.1, -1363.6, 2636.8, -1386.8, 2568.9, -1400.3, 2535.8, -1400.8, 2507.2, -1407.2, 2481, -1438.2, 2419.6, -1474.6, 2393.6, -1487.5, 2360.6, -1494.2, 2337.9, -1505.8, 2293.6, -1517.1, 2263.4, -1519.6, 2216.5, -1540, 2157.5, -1558.7, 2141.7, -1560.3, 2074.1, -1587.9, 2033.1, -1615.2, 1971, -1624.1, 1933.6, -1652.9, 1913, -1651.9, 1885.2, -1630.8, 1855.3, -1615.4, 1821.8, -1611.6, 1699.9, -1633.1, 1661.5, -1622.5, 1612.5, -1614, 1575.4, -1630.8, 1555.8, -1637.3, 1535.6, -1640.2, 1485.5, -1628.9, 1451.9, -1618.4, 1364.1, -1584.8, 1308.9, -1552.5, 1275.8, -1526.1, 1246.6, -1498.3, 1199, -1469.8, 1171.7, -1447.4, 1133.6, -1411.7, 1055.5, -1312, 1056.5, -1276.7];
// The terrain's height (m over the frame's datum, js/terrain.js groundHeight) every XC_PROFILE_STEP m along the course
// (the climb to the Flüelatal's loop is the steep bit: ~30 % for 40 m, our "Cologna-Stutz")
export const XC_PROFILE_STEP = 20;
export const XC_PROFILE = [-4.7, -4.2, -3, -2.4, -2.3, -2.3, -2, -1.7, -1.5, -0.9, -0.4, 0.2, 0.8, 1.4, 2.4, 2.9, 3.3, 4, 4.7, 4.8, 5.7, 6, 6.4, 6.7, 7.1, 7.5, 7.3, 7.9, 8.2, 8.1, 8.5, 8.7, 9.4, 9.8, 10.2, 10.8, 11.6, 12.5, 13, 14.4, 15.7, 16.9, 16.9, 16.2, 15.4, 15.3, 16.6, 16.6, 16.9, 17.9, 17.8, 18.5, 19.1, 19.7, 20.5, 21.6, 21.5, 22.2, 22.5, 21.5, 22.4, 22.9, 23.4, 24.1, 24.3, 26.1, 27.4, 27.5, 27.9, 28.5, 29.3, 29.8, 33.2, 33.9, 35.5, 41.2, 47.2, 50.1, 52.2, 53.5, 54.7, 55.9, 56.3, 57.6, 58.7, 58.4, 59, 59.8, 60.1, 61, 62.3, 63.2, 64.8, 67.8, 70.9, 70.4, 70.9, 72.1, 72.3, 72.4, 69.4, 69.5, 70, 70.3, 70.2, 68.6, 68.2, 67, 68.3, 70.2, 70.5, 70.1, 70.5, 69.8, 72.8, 75.1, 75.9, 76, 75.5, 74.3, 73.6, 73.2, 70.5, 66.8, 65.7, 67.4, 65.8, 66.8, 66.9, 66.5, 66.4, 67.3, 66.7, 66.1, 66, 66.3, 67.1, 68.5, 69.4, 69.2, 69.1, 68.8, 67.8, 67.2, 66.1, 64.1, 62.8, 62, 61.4, 60.6, 60.3, 58.1, 54.8, 52.2, 48.6, 45.5, 43, 40.3, 38.9, 38.1, 36.6, 35.3, 33.6, 32.2, 31.2, 30.7, 30.1, 28.9, 28.6, 26.8, 26.3, 24.1, 20.6, 18.8, 17.3, 16.6, 19.8, 20.9, 20, 17.5, 13.2, 10.1, 9.4, 8.9, 8.5, 8.2, 8, 7.7, 7.5, 7.5, 7.1, 6.9, 6.3, 6.1, 5.9, 4.8, 4.7, 4, 3.4, 3.5, 2.5, 1.4, 1, 0.3, -0.3, -0.9, -1.4, -1.7, -2, -2.3, -2.3, -2.2, -3, -3.4, -4.7, -4.7];
export const XC_ROUTE_IDS = ['w854855704', 'w1353008599', 'w1353008601', 'w959828050', 'w1191840997', 'w760027654', 'w760027653', 'w611657310', 'w1254994225', 'w1191841002', 'w1254994222', 'w1254994223', 'w712976783', 'w606814563', 'w960705454', 'w1254994216', 'w1532751292', 'w712976160', 'w1254088836'];

/** A polyline [x0, z0, x1, z1, ...] with its cumulative lengths: { pts, cum, length } */
export function makeLine(pts) {
  const n = pts.length / 2;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  return { pts, cum, length: cum[n - 1] };
}
export const XC_LINE = makeLine(XC_ROUTE);
export const XC_LENGTH = XC_LINE.length;

/** The point at arc length s (clamped) with the unit direction there: { x, z, dx, dz, i (the segment) } */
export function linePoint(line, s, out = {}) {
  const c = line.cum, p = line.pts;
  s = clamp(s, 0, line.length);
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const L = c[hi] - c[lo] || 1, t = (s - c[lo]) / L;
  const dx = (p[hi * 2] - p[lo * 2]) / L, dz = (p[hi * 2 + 1] - p[lo * 2 + 1]) / L;
  out.x = p[lo * 2] + dx * L * t; out.z = p[lo * 2 + 1] + dz * L * t;
  out.dx = dx; out.dz = dz; out.i = lo;
  return out;
}

/** The nearest point of the line to (x, z) among the segments that overlap [s0, s1] (the course runs out and back on
 *  the same trail near the stadium: only a window round the skier's last position counts): { s, d } */
export function projectOnLine(line, x, z, s0 = 0, s1 = Infinity) {
  const c = line.cum, p = line.pts;
  let best = { s: clamp(s0, 0, line.length), d: Infinity };
  for (let i = 1; i < c.length; i++) {
    if (c[i] < s0 || c[i - 1] > s1) continue;
    const ax = p[i * 2 - 2], az = p[i * 2 - 1], bx = p[i * 2], bz = p[i * 2 + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best.d) best = { s: c[i - 1] + t * Math.sqrt(L2), d };
  }
  return best;
}

/** The course's height (terrain) at s, from the baked profile */
export function xcHeight(s, profile = XC_PROFILE, step = XC_PROFILE_STEP) {
  const f = clamp(s / step, 0, profile.length - 1);
  const i = Math.min(profile.length - 2, Math.floor(f));
  return profile[i] + (profile[i + 1] - profile[i]) * (f - i);
}
/** The grade (rise per metre in the race's direction) at s, averaged over ±20 m, at most ±0.32 */
export const xcGrade = (s, profile = XC_PROFILE, step = XC_PROFILE_STEP) => clamp((xcHeight(s + 20, profile, step) - xcHeight(s - 20, profile, step)) / 40, -0.32, 0.32);

// --- The skier -------------------------------------------------------------------------------------------------------
// Strokes in a rhythm as on the speed-skating track (js/missions-data-ice.js stepSkater): while forward is held a stroke
// comes by itself every `period` s (diagonal stride or a V2 skate push); the kick key (Space / "Kick") late in the rhythm
// — the needle past `window` — makes it a power stroke at once, too early a stumble (no stroke, the rhythm starts over).
// A stroke adds less the faster the skier goes (1 − v/vRef). Double poling (Q held / "Double pole"): stronger strokes on
// the flat, weak ones uphill. The slope pulls (g · grade) both ways; snow friction and air drag (a tuck downhill when
// forward is let go: less drag); a crawl uphill (herringbone) never stops a skier who keeps going. Off the groomed trail
// the deep snow brakes.
export const XC_PARAMS = {
  classic: { label: 'Classic', period: 0.85, push: 0.6, power: 1.0, window: 0.8, vRef: 10, mu: 0.034, drag: 0.0045, tuckDrag: 0.0026, pole: { flat: 1.22, hill: 0.55 }, turn: 1.7, maxSpeed: 15, crawl: 1.3, brake: 4, offTrack: 3.2 },
  skate: { label: 'Skating', period: 0.8, push: 0.65, power: 0.97, window: 0.8, vRef: 11.5, mu: 0.034, drag: 0.0045, tuckDrag: 0.0026, pole: { flat: 1.06, hill: 0.55 }, turn: 1.9, maxSpeed: 15, crawl: 1.4, brake: 4, offTrack: 3.2 }
};
export const XC_FLAT = 0.03; // |grade| under this counts as flat (double poling's best)

export function createXcSkier(heading = 0) {
  return { speed: 0, heading, t: 0, side: 1, strokes: 0, power: 0, stumbles: 0, last: null, lastAge: 99, omega: 0, tech: 'stride', tuck: false, poling: false };
}
const xcPeriod = (sk, P) => P.period * (0.6 + 0.4 * Math.min(1, sk.speed / 5));
/** The rhythm needle 0..1 (1: the next stroke is due) */
export const xcNeedle = (sk, P) => clamp(sk.t / xcPeriod(sk, P), 0, 1);

/** The gain factor of double poling on this grade */
export const poleFactor = (P, grade) => (Math.abs(grade) < XC_FLAT ? P.pole.flat : grade > XC_FLAT ? P.pole.hill : 1);

/**
 * One step of the skier. `input`: { forward 0-1, back 0-1, steer -1..1 (positive: left), push (the key went down this
 * frame), pole (double poling held) }; `grade` the slope ahead (rise per metre). Returns the stroke ('normal' |
 * 'power') or null; sk.last says 'early' after a stumble.
 */
export function stepXc(sk, input, dt, P, { grade = 0, offTrack = false } = {}) {
  sk.t += dt;
  sk.lastAge += dt;
  const period = xcPeriod(sk, P);
  const fwd = input.forward || 0;
  let stroke = null;
  if (input.push) {
    if (sk.t / period >= P.window) stroke = 'power';
    else { sk.stumbles++; sk.t = 0; sk.last = 'early'; sk.lastAge = 0; }
  }
  if (!stroke && fwd > 0.2 && sk.t >= period) stroke = 'normal';
  sk.poling = !!input.pole;
  if (stroke) {
    let k = stroke === 'power' ? P.power : P.push * Math.min(1, 0.4 + fwd * 0.6);
    if (sk.poling) k *= poleFactor(P, grade);
    sk.speed += k * Math.max(0.1, 1 - sk.speed / P.vRef);
    sk.t = 0;
    sk.side = -sk.side;
    sk.strokes++;
    if (stroke === 'power') sk.power++;
    sk.last = stroke;
    sk.lastAge = 0;
  }
  sk.tuck = fwd < 0.2 && !sk.poling && grade < -0.02 && sk.speed > 3;
  const drag = (sk.tuck ? P.tuckDrag : P.drag) * sk.speed * sk.speed;
  const resist = (sk.speed > 0.05 ? P.mu * G : 0) + drag + (input.back || 0) * P.brake + (offTrack ? P.offTrack : 0);
  const before = sk.speed;
  sk.speed += (-G * grade - resist) * dt;
  // (the herringbone: a skier who keeps going never stalls on the climb, it walks up at a crawl)
  if (fwd > 0.2 && grade > 0 && sk.speed < P.crawl) sk.speed = Math.max(sk.speed, Math.min(P.crawl, before + 1.5 * dt));
  sk.speed = clamp(sk.speed, 0, P.maxSpeed);
  const steer = clamp(input.steer || 0, -1, 1);
  const omega = sk.speed < 1 ? steer * 1.5 : steer * Math.min(P.turn, 4.5 / sk.speed);
  sk.omega = omega;
  sk.heading = wrapPi(sk.heading + omega * dt);
  sk.tech = sk.tuck ? 'tuck' : sk.poling ? 'double-pole' : P === XC_PARAMS.classic ? 'diagonal' : 'v2';
  return stroke;
}

// --- The race field --------------------------------------------------------------------------------------------------
// Seven rivals with a fixed pace each (m/s on the flat, per technique), slower uphill and faster downhill the same way
// for all (aiSpeed); their times along the course are worked out up front. Fictional names: the field of a regional
// FIS race on the World Cup trails.
export const XC_FIELD = [
  { bib: 1, name: 'L. Brunner', nation: 'SUI', skate: 6.56, classic: 6.16 },
  { bib: 2, name: 'E. Halvorsen', nation: 'NOR', skate: 6.42, classic: 6.02 },
  { bib: 3, name: 'M. Rinaldi', nation: 'ITA', skate: 6.23, classic: 5.83 },
  { bib: 4, name: 'K. Lindqvist', nation: 'SWE', skate: 5.98, classic: 5.61 },
  { bib: 5, name: 'J. Moreau', nation: 'FRA', skate: 5.75, classic: 5.37 },
  { bib: 6, name: 'T. Huber', nation: 'AUT', skate: 5.39, classic: 5.07 },
  { bib: 7, name: 'S. Caflisch', nation: 'SUI', skate: 4.92, classic: 4.64 }
];
export const XC_PLAYER_BIB = 8;
export const WC_POINTS = [100, 80, 60, 50, 45, 40, 36, 32];

/** A racer's speed on a grade, from its pace on the flat */
export const aiSpeed = (base, grade) => (grade >= 0 ? Math.max(1.3, base * (1 - 4.2 * grade)) : Math.min(13, base * (1 + 5 * -grade)));

/** A racer's time (s) at every `step` m of the course: Float64Array, [0] = 0 */
export function racerTimes(base, length = XC_LENGTH, grade = xcGrade, step = 10) {
  const n = Math.ceil(length / step) + 1;
  const t = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const s = Math.min(length, i * step), ds = s - Math.min(length, (i - 1) * step);
    t[i] = t[i - 1] + ds / aiSpeed(base, grade(s - ds / 2));
  }
  return { t, step, length, total: t[n - 1] };
}
/** Where the racer is at race time `t` (s): metres along the course */
export function racerAt(tab, t) {
  const a = tab.t;
  if (t <= 0) return 0;
  if (t >= tab.total) return tab.length;
  let lo = 0, hi = a.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= t) lo = m; else hi = m; }
  return Math.min(tab.length, (lo + (t - a[lo]) / (a[hi] - a[lo] || 1)) * tab.step);
}
/** The racer's time at `s` m */
export function racerTimeAt(tab, s) {
  const f = clamp(s / tab.step, 0, tab.t.length - 1);
  const i = Math.min(tab.t.length - 2, Math.floor(f));
  return tab.t[i] + (tab.t[i + 1] - tab.t[i]) * (f - i);
}

/** The field for a technique: [{ ...racer, tab, speed (m/s at the flat) }] */
const FIELD_LANES = [-1.4, -0.4, 0.6, 1.6, -0.9, 0.1, 1.1]; // m right of the course's line (the start grid's places)
const FIELD_ROWS = [0, 0, 0, 0, 2.4, 2.4, 2.4]; // m behind the line
export function createField(style = 'skate') {
  return XC_FIELD.map((r, i) => ({ ...r, base: r[style], style, offset: FIELD_LANES[i % FIELD_LANES.length], back: FIELD_ROWS[i % FIELD_ROWS.length], tab: racerTimes(r[style]) }));
}

/** The player's place (1-based) with a time `t` (s) at `s` m, among the field's times there */
export function placeAt(field, s, t) {
  let place = 1;
  for (const r of field) if (racerTimeAt(r.tab, s) < t) place++;
  return place;
}

/** The leader's time at `s` among the field and the player (null: the player's not there yet) */
export const leaderTime = (field, s) => Math.min(...field.map((r) => racerTimeAt(r.tab, s)));

export const XC_SPLITS = [1100, 2200, 3300]; // m: the timing points ("Messpunkte")
export const XC_COUNTDOWN = 3; // s from the technique's choice to the gun
const XC_OFF_COURSE = 35; // m off the course: no progress counts

export function createXcState() {
  return { style: null, field: null, countdown: XC_COUNTDOWN, raceT: 0, started: false, s: 0, prevS: 0, off: 0, splits: [], finishT: null, place: null, results: null, maxSpeed: 0, skier: null };
}

/** The race's progress from the player at (x, z) after `dt` s: the countdown, the clock, the distance along the course */
export function updateXcRace(st, x, z, dt) {
  if (!st.style) return st;
  if (!st.started) {
    st.countdown -= dt;
    if (st.countdown <= 0) { st.started = true; st.raceT = -st.countdown; st.countdown = 0; }
    return st;
  }
  if (st.finishT !== null) return st;
  st.raceT += dt;
  const p = projectOnLine(XC_LINE, x, z, st.s - 25, st.s + 60);
  st.off = p.d;
  if (p.d < XC_OFF_COURSE && p.s > st.s) {
    // (the time a split / the finish was crossed, interpolated inside the frame)
    const from = st.s, to = p.s;
    for (const mark of XC_SPLITS) {
      if (from < mark && to >= mark && !st.splits.some((sp) => sp.s === mark)) {
        const t = st.raceT - dt * (to - mark) / (to - from || 1);
        st.splits.push({ s: mark, t, place: placeAt(st.field, mark, t), gap: t - leaderTime(st.field, mark) });
      }
    }
    if (to >= XC_LENGTH - 0.5) {
      st.finishT = st.raceT - dt * (to - XC_LENGTH) / (to - from || 1);
      st.results = xcResults(st.field, st.finishT);
      st.place = st.results.findIndex((r) => r.player) + 1;
    }
    st.s = Math.min(XC_LENGTH, to);
  }
  return st;
}

/** The final standings: the field and the player by time */
export function xcResults(field, playerT) {
  const list = field.map((r) => ({ bib: r.bib, name: r.name, nation: r.nation, t: r.tab.total, player: false }));
  list.push({ bib: XC_PLAYER_BIB, name: 'You', nation: 'DAV', t: playerT, player: true });
  return list.sort((a, b) => a.t - b.t);
}
export const xcPoints = (place) => (place >= 1 && place <= WC_POINTS.length ? WC_POINTS[place - 1] : 0);

// (the player's place on the grid: the front row, on the right; the race's distance counts from the line all the same)
const XC_START = (() => { const p = linePoint(XC_LINE, 0.5); return { x: p.x - p.dz * 2.5, z: p.z + p.dx * 2.5, heading: Math.atan2(p.dx, p.dz) }; })();
// The stadium: the start / finish line at the course's start (the City-Trail beside the Bünda meadow)
export const XC_STADIUM = (() => { const p = linePoint(XC_LINE, 0); return { x: p.x, z: p.z, heading: Math.atan2(p.dx, p.dz) }; })();

export const DAVOS_NORDIC_MISSION = {
  id: 'davos-nordic',
  title: 'Davos Nordic: 4.3 km race',
  intro: 'Davos Nordic, the World Cup weekend on the Flüela trails: start number 8 on the start line at the Bünda. Choose classic (1) or skating (2), then 4.3 km out to the Flüelatal and back against seven racers at their fixed pace. Hold W and the skis stroke by themselves; press Space (Kick) just as the rhythm bar fills for a power stroke. Hold Q (Double pole) on the flat, let go of W downhill to tuck. A/D steer, S brakes. Split times at 1.1, 2.2 and 3.3 km; World Cup points by your place: a podium earns a medal.',
  mode: 'person',
  season: 'winter',
  time: 'golden',
  features: ['xcSkis', 'xcRace'],
  scoreMode: true,
  scoreUnit: 'WC pts',
  medals: { gold: 100, silver: 80, bronze: 60 },
  colour: '#e3262f',
  icon: 'xcski',
  finish: 'Across the line in the Bünda stadium: the crowd rings its cowbells.',
  start: { x: XC_START.x, z: XC_START.z, heading: XC_START.heading },
  props: [],
  createState() { return { race: createXcState() }; },
  update(ctx, state) {
    if (ctx.mode !== 'person') return;
    updateXcRace(state.race, ctx.x, ctx.z, ctx.dt || 0);
    if (state.race.started) state.race.maxSpeed = Math.max(state.race.maxSpeed, ctx.speed || 0);
  },
  score: (state) => (state.race.place ? xcPoints(state.race.place) : 0),
  summary(state) {
    const r = state.race;
    const lines = [];
    if (r.results) lines.push(r.results.map((e, i) => `${i + 1}. ${e.name}${e.player ? '' : ` (${e.nation})`} ${fmtTime(e.t * 1000)}`).join(' · '));
    if (r.splits.length) lines.push(r.splits.map((sp) => `${fmtDist(sp.s)}: ${fmtTime(sp.t * 1000)} (${ordinal(sp.place)}, ${fmtGap(sp.gap)})`).join(' · '));
    const sk = r.skier;
    if (sk) lines.push(`${XC_PARAMS[r.style]?.label || ''} · top speed ${((r.maxSpeed || 0) * 3.6).toFixed(1)} km/h · ${sk.power} power strokes of ${sk.strokes}${sk.stumbles ? ` · ${sk.stumbles} stumbles` : ''}`);
    return lines;
  },
  objectives: [
    {
      id: 'technique',
      title: 'Choose your technique',
      check(ctx, state) {
        return { done: !!state.race.style, progress: null, text: '1: Classic (diagonal stride in the tracks) · 2: Skating (V2 skate)', target: null, hint: 'Press 1 or 2, or tap a button' };
      }
    },
    {
      id: 'gun',
      title: 'On the start line',
      check(ctx, state) {
        const r = state.race;
        return { done: r.started, progress: 1 - r.countdown / XC_COUNTDOWN, text: r.started ? 'Go!' : `Start in ${Math.ceil(r.countdown)} …`, target: null, hint: null };
      }
    },
    ...XC_SPLITS.map((mark, i) => ({
      id: `split${i + 1}`,
      title: `Split ${i + 1} at ${fmtDist(mark)}`,
      check(ctx, state) { return xcView(ctx, state, mark, `Split ${i + 1}`); }
    })),
    {
      id: 'finish',
      title: 'To the finish in the Bünda',
      check(ctx, state) { return xcView(ctx, state, XC_LENGTH, 'Finish'); }
    }
  ]
};

function xcView(ctx, state, mark, label) {
  const r = state.race;
  const done = r.s >= mark - 0.5;
  const prevMark = [0, ...XC_SPLITS].filter((m) => m < mark).pop() || 0;
  const target = linePoint(XC_LINE, Math.min(XC_LENGTH, r.s + 40));
  const ahead = mark - r.s;
  const last = r.splits[r.splits.length - 1];
  const text = `${fmtDist(r.s)} of ${fmtDist(XC_LENGTH)} · ${label} in ${fmtDist(Math.max(0, ahead))} · ${((ctx.speed || 0) * 3.6).toFixed(0)} km/h${last ? ` · last split ${ordinal(last.place)} ${fmtGap(last.gap)}` : ''}`;
  const hint = r.off > XC_OFF_COURSE ? 'Off the course: back onto the trail' : r.off > 4 ? 'Deep snow: back into the tracks' : null;
  return { done, progress: clamp((r.s - prevMark) / (mark - prevMark || 1), 0, 1), text, target: { x: target.x, z: target.z }, hint };
}

// =====================================================================================================================
// 2. Minigolf at the Hotel Waldhuus
// =====================================================================================================================
// The course as the SWISSIMAGE orthophoto shows it (data/hires/swissimage/384-512.webp, 0.25 m; the user's aerial
// view): south of the hotel, on the meadow above the wood, a light paved path in a U (35 × 10 m, open to the west) with
// nine red Eternit lanes on it — three along its north leg west to east, one down its east leg, three along its south
// leg east to west, an L at its south-west corner and one on the short spur in the middle of the west side. Each lane
// in its own frame (x across, to the right of a player at the tee looking down the lane; y along, from the back board):
// 0.9 m of felt between low boards, the target circle (1.4 m across) round the cup at its end, the obstacles of the
// Eternit lane types: a hill, a tube, a ramp up to the target, a loop, a centre island, a round island, two posts, an
// angle and a bridge over a ditch. Lengths and directions measured on the orthophoto (± 0.5 m).
// The ball rolls on the felt (rolling friction), up and down the ramps and the hill (5/7 g · slope: a rolling ball),
// off the boards and the islands; it drops when it crosses the cup slow enough.
export const MINIGOLF = {
  ballR: 0.021, cupR: 0.054, sink: 1.35, // m/s: faster over the cup it hops across
  roll: 0.62, // m/s² rolling friction on the felt
  rollV: 0.06, // 1/s: a little more the faster it goes
  bounce: 0.72, // restitution off the boards
  minShot: 0.25, maxShot: 4.6, // m/s
  maxStrokes: 7, // per hole: then it is picked up with 7
  stop: 0.035, // m/s: at rest
  slope: 5 / 7, // a rolling ball takes 5/7 g along the slope (a sliding puck takes all of it)
  loopMin: 1.75, // m/s into the loop to make it round
  loopTime: 0.9 // s the ball takes round the loop
};

const LW = 0.45; // half the lane's width
const TR = 0.7; // the target circle's radius
/** An arc of points round (cx, cy), from angle a0 to a1 (rad, 0 along +x, counter-clockwise), n steps */
const arc = (cx, cy, r, a0, a1, n = 14) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const ring = (pts) => pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return [p[0], p[1], q[0], q[1]]; });
/** A straight Eternit lane: the back board at y = 0, the cup at (0, cup) in the middle of the target circle */
function keyhole(cup, lw = LW, tr = TR) {
  const j = Math.sqrt(tr * tr - lw * lw), ja = Math.asin(lw / tr);
  // round the circle from the lane's right side (x = +lw) the long way to its left side
  const outline = [[-lw, 0], [lw, 0], [lw, cup - j], ...arc(0, cup, tr, -Math.PI / 2 + ja, Math.PI * 1.5 - ja, 24).slice(1, -1), [-lw, cup - j]];
  return { outline, walls: ring(outline), length: cup + tr, width: 2 * tr, cup: [0, cup], tee: [0, 0.45] };
}
/** The angle: along y to the corner, then aside (`leg2` right, negative left) into the target circle at (cx, cup) */
function angleLane(leg1, leg2, lw = LW, tr = TR) {
  const cy = leg1, cx = leg2, s = Math.sign(leg2) || 1;
  const j = Math.sqrt(tr * tr - lw * lw) * s, ja = Math.asin(lw / tr);
  // the corner's outer wall is chamfered so that nothing can wedge in it
  // round the target circle the long way, on the side away from the lane
  const a0 = s > 0 ? -Math.PI + ja : -ja, a1 = s > 0 ? Math.PI - ja : ja - 2 * Math.PI;
  const outline = [[-s * lw, 0], [s * lw, 0], [s * lw, cy - lw], [cx - j, cy - lw], ...arc(cx, cy, tr, a0, a1, 24).slice(1, -1), [cx - j, cy + lw], [-s * (lw - 0.25), cy + lw], [-s * lw, cy + lw - 0.25]];
  return { outline, walls: ring(outline), length: cy + lw, width: Math.abs(cx) + tr + lw, cup: [cx, cy], tee: [0, 0.45] };
}
const lane = (base, extra) => ({ ...base, ...extra, walls: [...base.walls, ...(extra.walls || [])] });
/** The lanes in the order played, with where they lie: `place` the back board's middle (world) and the heading */
export const MINIGOLF_HOLES = [
  lane(keyhole(5.6), { name: 'The hill', par: 2, place: { x: 393.8, z: -173.25, heading: 1.582 }, ramps: [{ y0: 2.0, y1: 2.7, h0: 0, h1: 0.07 }, { y0: 2.7, y1: 3.4, h0: 0.07, h1: 0 }] }),
  lane(keyhole(5.5), { name: 'The tube', par: 2, place: { x: 402.5, z: -173.15, heading: 1.580 }, walls: [[-LW, 2.1, -0.11, 2.45], [LW, 2.1, 0.11, 2.45], [-0.11, 2.45, -0.11, 3.25], [0.11, 2.45, 0.11, 3.25]], tube: { y0: 2.45, y1: 3.25, r: 0.11 } }),
  lane(keyhole(5.75), { name: 'The ramp', par: 2, place: { x: 411.2, z: -173.9, heading: 1.724 }, ramps: [{ y0: 2.4, y1: 3.6, h0: 0, h1: 0.2 }, { y0: 3.6, y1: 6.6, h0: 0.2, h1: 0.2 }] }),
  lane(keyhole(5.4), { name: 'The loop', par: 2, place: { x: 422.2, z: -174.75, heading: 0.081 }, walls: [[-LW, 1.9, -0.2, 2.2], [LW, 1.9, 0.2, 2.2]], loop: { y: 2.2, x0: -0.2, x1: 0.2, exitY: 3.4 } }),
  lane(keyhole(5.35), { name: 'The centre island', par: 2, place: { x: 419.2, z: -169.35, heading: -1.468 }, walls: ring([[-0.17, 2.0], [0.17, 2.0], [0.17, 3.3], [-0.17, 3.3]]) }),
  lane(keyhole(6.2), { name: 'The round island', par: 2, place: { x: 411.2, z: -167.9, heading: -1.474 }, posts: [{ x: 0, y: 3.0, r: 0.28 }] }),
  lane(keyhole(5.75), { name: 'Two posts', par: 2, place: { x: 402.0, z: -166.85, heading: -1.514 }, posts: [{ x: -0.18, y: 2.3, r: 0.12 }, { x: 0.2, y: 3.6, r: 0.12 }] }),
  lane(angleLane(3.4, 1.85), { name: 'The angle', par: 3, place: { x: 392.65, z: -166.05, heading: -1.571 }, walls: [[-LW + 0.25, 3.4 + LW, -LW, 3.4 + LW - 0.25]] }),
  lane(keyhole(6.15), { name: 'The bridge', par: 2, place: { x: 396.55, z: -170.2, heading: -1.571 }, bridge: { y0: 2.3, y1: 3.7, half: 0.17, rise: 0.06 } })
];
for (const h of MINIGOLF_HOLES) h.posts ??= [];
// The paved path the lanes stand on (world quads, corners in order), from the orthophoto
export const MINIGOLF_PATH = [
  [[388.25, -174.34], [420.63, -176.15], [420.63, -173.82], [388.25, -172.01]],
  [[420.63, -182.11], [423.73, -182.11], [423.73, -168.64], [420.63, -169.4]],
  [[388.25, -167.09], [423.73, -169.68], [423.73, -168.64], [388.25, -164.76]].reverse(),
  [[388.25, -174.34], [390.58, -174.34], [390.58, -164.76], [388.25, -164.76]],
  [[388.25, -171.23], [397.31, -171.23], [397.31, -168.9], [388.25, -168.9]]
];
export const MINIGOLF_PAR = MINIGOLF_HOLES.reduce((a, h) => a + h.par, 0);

/** The felt's height at (x, y) on a hole (the ramps, the bridge's arch) and its slope along y */
export function holeHeight(hole, x, y) {
  for (const r of hole.ramps || []) {
    if (y >= r.y0 && y <= r.y1) { const f = (y - r.y0) / (r.y1 - r.y0); return { h: r.h0 + (r.h1 - r.h0) * f, dy: (r.h1 - r.h0) / (r.y1 - r.y0) }; }
  }
  const b = hole.bridge;
  if (b && y > b.y0 && y < b.y1 && Math.abs(x) <= b.half) {
    const f = (y - b.y0) / (b.y1 - b.y0);
    return { h: b.rise * Math.sin(Math.PI * f), dy: (b.rise * Math.PI * Math.cos(Math.PI * f)) / (b.y1 - b.y0) };
  }
  return { h: 0, dy: 0 };
}

/** The windmill's rotor angle at time t (rad) and whether a blade blocks the tunnel now */
export function windmillBlocked(wm, t) {
  const a = (t / wm.period) * TAU;
  for (let k = 0; k < wm.blades; k++) {
    const blade = wrapPi(a + (k * TAU) / wm.blades); // 0: pointing straight down
    if (Math.abs(blade) < wm.block) return true;
  }
  return false;
}
export const windmillAngle = (wm, t) => (t / wm.period) * TAU;

export function createBall(hole) {
  return { x: hole.tee[0], y: hole.tee[1], vx: 0, vy: 0, moving: false, holed: false, loopT: 0, inLoop: false, wet: false, lastX: hole.tee[0], lastY: hole.tee[1], h: 0 };
}

/** Putts the ball: `aim` (rad, 0 straight down the lane +y, positive to the left: −x), `power` 0..1 */
export function puttBall(ball, aim, power, M = MINIGOLF) {
  const v = M.minShot + (M.maxShot - M.minShot) * clamp(power, 0, 1);
  ball.lastX = ball.x; ball.lastY = ball.y;
  ball.vx = -Math.sin(aim) * v;
  ball.vy = Math.cos(aim) * v;
  ball.moving = true;
  ball.wet = false;
}

function collideSegment(ball, [ax, ay, bx, by], R, e) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  const t = clamp(((ball.x - ax) * dx + (ball.y - ay) * dy) / L2, 0, 1);
  const qx = ax + dx * t, qy = ay + dy * t;
  let nx = ball.x - qx, ny = ball.y - qy;
  const d = Math.hypot(nx, ny);
  if (d >= R || d < 1e-9) return false;
  nx /= d; ny /= d;
  ball.x = qx + nx * R; ball.y = qy + ny * R;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) { ball.vx -= (1 + e) * vn * nx; ball.vy -= (1 + e) * vn * ny; }
  return true;
}
function collideCircle(ball, c, R, e) {
  let nx = ball.x - c.x, ny = ball.y - c.y;
  const d = Math.hypot(nx, ny), min = c.r + R;
  if (d >= min || d < 1e-9) return false;
  nx /= d; ny /= d;
  ball.x = c.x + nx * min; ball.y = c.y + ny * min;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) { ball.vx -= (1 + e) * vn * nx; ball.vy -= (1 + e) * vn * ny; }
  return true;
}

/**
 * One step of the ball on the hole at time `t` (s, the windmill's clock). Returns the events of the step:
 * ['wall' | 'post' | 'blade' | 'loop' | 'water' | 'cup' | 'lip' | 'stop'].
 */
export function stepBall(ball, hole, dt, t = 0, M = MINIGOLF) {
  const ev = [];
  if (!ball.moving || ball.holed) return ev;
  if (ball.inLoop) {
    ball.loopT += dt;
    if (ball.loopT >= M.loopTime) { ball.inLoop = false; ball.y = hole.loop.exitY; ball.x = 0; ev.push('loop'); }
    return ev;
  }
  const px = ball.x, py = ball.y;
  // the slope (a rolling ball: 5/7 g, a sliding puck: all of it), the surface's friction
  const { h, dy } = holeHeight(hole, ball.x, ball.y);
  ball.h = h;
  ball.vy -= (M.slope ?? 5 / 7) * G * (dy / Math.sqrt(1 + dy * dy)) * dt;
  const v = Math.hypot(ball.vx, ball.vy);
  const dec = (M.roll + M.rollV * v) * dt;
  if (v <= dec || v < 1e-6) { ball.vx = ball.vy = 0; }
  else { ball.vx *= (v - dec) / v; ball.vy *= (v - dec) / v; }
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  // the loop: in at its mouth fast enough, else back out
  const lp = hole.loop;
  if (lp && py < lp.y && ball.y >= lp.y && ball.x > lp.x0 && ball.x < lp.x1) {
    if (ball.vy >= M.loopMin) { ball.inLoop = true; ball.loopT = 0; ball.vy *= 0.78; ball.vx = 0; ball.x = 0; ball.y = lp.y; return ev; }
    ball.y = lp.y - 0.001; ball.vy = -Math.abs(ball.vy) * 0.5;
    ev.push('wall');
  }
  // the windmill: a blade in front of the tunnel knocks the ball back
  const wm = hole.windmill;
  if (wm && py < wm.y && ball.y >= wm.y - M.ballR && Math.abs(ball.x) < wm.gap && windmillBlocked(wm, t)) {
    ball.y = wm.y - M.ballR - 0.001; ball.vy = -Math.abs(ball.vy) * 0.55; ball.vx += (Math.random() - 0.5) * 0.1;
    ev.push('blade');
  }
  for (const w of hole.walls) if (collideSegment(ball, w, M.ballR, M.bounce)) ev.push('wall');
  for (const c of hole.posts || []) if (collideCircle(ball, c, M.ballR, M.bounce * 0.9)) ev.push('post');
  // the bridge: off its edge into the water (a stroke's penalty, back to where it was hit)
  const b = hole.bridge;
  if (b && ball.y > b.y0 + 0.02 && ball.y < b.y1 - 0.02 && Math.abs(ball.x) > b.half) {
    ball.wet = true; ball.moving = false; ball.vx = ball.vy = 0;
    ball.x = ball.lastX; ball.y = ball.lastY;
    ev.push('water');
    return ev;
  }
  // the cup
  const cdx = ball.x - hole.cup[0], cdy = ball.y - hole.cup[1];
  const cd = Math.hypot(cdx, cdy);
  if (cd < M.cupR - M.ballR * 0.3) {
    const vv = Math.hypot(ball.vx, ball.vy);
    if (vv < M.sink) { ball.holed = true; ball.moving = false; ball.x = hole.cup[0]; ball.y = hole.cup[1]; ball.vx = ball.vy = 0; ev.push('cup'); return ev; }
    // too fast: over the cup, slowed a little once as it hops across
    if (!ball.overCup) { ball.overCup = true; ball.vx *= 0.9; ball.vy *= 0.9; ev.push('lip'); }
  } else ball.overCup = false;
  if (Math.hypot(ball.vx, ball.vy) < M.stop && Math.abs(dy) < 0.02) { ball.vx = ball.vy = 0; ball.moving = false; ev.push('stop'); }
  // (resting on a slope: it rolls back on its own; at the foot it stops)
  if (!ball.moving && Math.abs(dy) >= 0.02) ball.moving = true;
  return ev;
}

/** Steps the ball until it stops (or `maxT` s): the tests' and the aim preview's simulation */
export function simulatePutt(hole, from, aim, power, { dt = 1 / 240, maxT = 20, t0 = 0, phys = MINIGOLF } = {}) {
  const ball = createBall(hole);
  ball.x = from[0]; ball.y = from[1];
  puttBall(ball, aim, power, phys);
  let t = 0;
  const events = [];
  while ((ball.moving || ball.inLoop) && t < maxT) { for (const e of stepBall(ball, hole, dt, t0 + t, phys)) events.push(e); t += dt; if (ball.y > 0 && Math.abs(ball.vy) < 0.05 && Math.abs(ball.vx) < 0.05 && holeHeight(hole, ball.x, ball.y).dy > 0.02 && t > 15) break; }
  return { ball, t, events };
}

export function createMinigolfGame(course = WALDHUUS_COURSE) {
  return { course, hole: 0, strokes: course.holes.map(() => 0), done: false, ball: createBall(course.holes[0]), clock: 0, holedAt: null, history: [] };
}
/** A putt on the current hole (counts a stroke) */
export function minigolfPutt(g, aim, power) {
  if (g.done || g.ball.moving || g.ball.holed) return false;
  g.strokes[g.hole]++;
  puttBall(g.ball, aim, power, g.course.phys);
  return true;
}
/** One step of the game: the ball, a water penalty, the cup, the stroke limit. Returns the step's events */
export function minigolfStep(g, dt) {
  g.clock += dt;
  const { holes, phys } = g.course;
  const hole = holes[g.hole];
  const ev = stepBall(g.ball, hole, dt, g.clock, phys);
  if (ev.includes('water')) g.strokes[g.hole]++; // (the penalty stroke)
  if (!g.ball.holed && !g.ball.moving && !g.ball.inLoop && g.strokes[g.hole] >= phys.maxStrokes) {
    g.strokes[g.hole] = phys.maxStrokes; // (picked up)
    g.ball.holed = true;
    ev.push('pickup');
  }
  if (g.ball.holed && g.holedAt === null) g.holedAt = g.clock;
  return ev;
}
/** On to the next hole (after the holed ball's pause): false after the last */
export function minigolfNext(g) {
  g.history.push({ hole: g.hole, strokes: g.strokes[g.hole] });
  if (g.hole >= g.course.holes.length - 1) { g.done = true; return false; }
  g.hole++;
  g.ball = createBall(g.course.holes[g.hole]);
  g.holedAt = null;
  return true;
}
export const minigolfTotal = (g) => g.strokes.reduce((a, b) => a + b, 0);
/** The points: 7 a hole minus its strokes (a hole in one 6), over the holes played */
export const minigolfScore = (g) => g.history.reduce((a, h) => a + (g.course.phys.maxStrokes - h.strokes), 0);
export const strokeName = (strokes, par) => (strokes === 1 ? 'Hole in one!' : ['Albatross', 'Eagle', 'Birdie', 'Par', 'Bogey', 'Double bogey'][strokes - par + 3] || `${strokes} strokes`);

// The course's middle (the pin) and each lane's frame in the world
export const MINIGOLF_SITE = { x: 406.0, z: -170.6 };
// A course is all a minigolf game needs: its physics, its lanes and the ground they stand on. The runtime
// (js/missions-sport.js minigolfFeature) builds and plays whichever course the mission hands it — the felt at the
// Waldhuus or the ice on the Arkadenplatz.
export const WALDHUUS_COURSE = { id: 'waldhuus', phys: MINIGOLF, holes: MINIGOLF_HOLES, path: MINIGOLF_PATH, site: MINIGOLF_SITE, par: MINIGOLF_PAR };
/** A hole's frame in the world: its back board's middle (origin) and the lane's direction (heading: the world angle of
 *  +y); +x to the right of a player at the tee looking down the lane */
export function holeFrame(i, course = WALDHUUS_COURSE) {
  const pl = course.holes[i].place, h = pl.heading;
  const rx = -Math.cos(h), rz = Math.sin(h); // (right of a player facing along h: (−cos h, sin h); its left is (cos h, −sin h))
  const fx = Math.sin(h), fz = Math.cos(h);
  return { x: pl.x, z: pl.z, heading: h, rx, rz, fx, fz };
}
/** Local (x across, y along) to world */
export const holeToWorld = (f, x, y) => ({ x: f.x + f.rx * x + f.fx * y, z: f.z + f.rz * x + f.fz * y });
/** Whether a local point lies on the lane's felt (inside its outline) */
export function onLane(hole, x, y) {
  const o = hole.outline;
  let inside = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const [xi, yi] = o[i], [xj, yj] = o[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const MINIGOLF_MISSION = {
  id: 'minigolf-waldhaus',
  title: 'Minigolf at the Hotel Waldhuus',
  intro: 'The nine red Eternit lanes on the paved path below the Hotel Waldhuus, next to the Golf Club Davos: the hill, the tube, the ramp, the loop, the centre island, the round island, two posts, the angle and the bridge. Aim with A/D or the mouse, hold Space to fill the power bar and let go to putt; on a phone drag back from the ball like a slingshot and let go. Off the bridge into the ditch costs a stroke. Seven strokes at most a hole. Score: 7 a hole minus your strokes (63 minus the total): 20 strokes or fewer is gold (par 19).',
  mode: 'person',
  season: 'summer',
  time: 'golden',
  features: ['minigolf'],
  scoreMode: true,
  scoreUnit: 'pts',
  medals: { gold: 63 - 20, silver: 63 - 25, bronze: 63 - 32 },
  colour: '#4cbb47',
  icon: 'minigolf',
  finish: 'Putter and ball back to the reception: an ice cream from the kiosk is on the house.',
  get start() { const f = holeFrame(0), p = holeToWorld(f, -0.75, -0.8); return { x: p.x, z: p.z, heading: f.heading }; },
  pin: { x: MINIGOLF_SITE.x, z: MINIGOLF_SITE.z },
  props: [],
  createState() { return { game: createMinigolfGame(WALDHUUS_COURSE) }; },
  score: (state) => minigolfScore(state.game),
  summary(state) {
    const g = state.game;
    const total = minigolfTotal(g);
    return [MINIGOLF_HOLES.map((h, i) => `${i + 1}: ${g.strokes[i]}`).join(' · ') + ` — ${total} strokes (par ${MINIGOLF_PAR}, ${total - MINIGOLF_PAR >= 0 ? '+' : ''}${total - MINIGOLF_PAR})`];
  },
  objectives: MINIGOLF_HOLES.map((hole, i) => ({
    id: `hole${i + 1}`,
    title: `Hole ${i + 1}: ${hole.name} (par ${hole.par})`,
    allowModes: ['person'],
    check(ctx, state) {
      const g = state.game;
      const done = g.history.length > i;
      const n = g.strokes[i];
      const text = `Stroke ${n}${g.ball.moving ? ' · rolling …' : ''} · total ${minigolfTotal(g)} (par ${MINIGOLF_PAR})`;
      return { done, progress: null, text, target: null, hint: g.ball.holed && !done ? strokeName(n, hole.par) : null };
    }
  }))
};

// =====================================================================================================================
// 2b. Eis-Minigolf on the Arkadenplatz
// =====================================================================================================================
// Davos plays minigolf on ice in winter (davos.ch/aktivitaeten/eissport/eis-minigolf, eisminigolf.ch): 18 lanes on the
// Arkadenplatz, open daily 10:00-18:00, played with a hockey stick and a puck instead of a putter and a ball, the puck
// "ins Loch" at the end of the lane, seven strokes at most a hole — "eiskalte Millimeterarbeit".
// The square (OSM w110590701 "Arkadenplatz", loc_name "Roter Arkadenplatz", highway=pedestrian, place=square,
// surface=concrete, 1894 m²) is a parallelogram between the Promenade and the Kulturplatz; its corners in the world
// frame: north (−572.9, −112.2), east (−538.1, −96.9), south (−549.9, −55.5), west (−586.7, −63.3). The lanes are laid
// out in the square's own frame: `a` along it (from the north corner down towards the south, parallel to the
// Promenade) and `b` across it (towards the Kulturplatz). Six rows of three lanes played as a serpentine — row 1
// eastwards, row 2 back westwards — on the southern two thirds, which leaves the fountain at (a 9.5, b 20.4) and the
// north corner free for the hut.
// The puck slides instead of rolling: a tenth of the felt's friction, the whole of g on the slopes, and a wider hole
// (23 cm) that only swallows it below 1 m/s. No loop and no ditch on the ice.
export const ICE_MINIGOLF = {
  ballR: 0.038, // the puck: 76 mm across, 25 mm thick
  cupR: 0.115, sink: 1.0, // m/s: faster over the hole it skims across
  roll: 0.34, // m/s² on outdoor rink ice (µ ≈ 0.035: a puck slides far)
  rollV: 0.02, // 1/s: a little more the faster it goes
  bounce: 0.74, // restitution off the wooden boards
  minShot: 0.2, maxShot: 3.6, // m/s
  maxStrokes: 7, // per hole: then it is picked up with 7 (the house rule on eisminigolf.ch)
  stop: 0.03, // m/s: at rest
  slope: 1, // a sliding puck takes the whole of g along the slope
  loopMin: Infinity, loopTime: 0.9 // (no loop on the ice)
};

const ILW = 0.6; // half an ice lane's width (wider than the felt lanes: a puck and a stick need room)
const ITR = 0.85; // the target circle round the hole
const iceKeyhole = (cup) => keyhole(cup, ILW, ITR);
// The square's frame: the origin at its north corner, `a` along it (towards the south corner), `b` across it
const ICE_ORIGIN = { x: -572.89, z: -112.17 };
const ICE_U = { x: -0.27185, z: 0.96234 }; // along: the north corner to the south corner (50.8 m)
const ICE_V = { x: 0.96234, z: 0.27185 }; // across: towards the Kulturplatz (37.6 m)
export const ICE_HEADING = Math.atan2(ICE_U.x, ICE_U.z); // the world heading of +a
/** A point of the square's frame (a along, b across) in the world */
export const iceToWorld = (a, b) => ({ x: ICE_ORIGIN.x + ICE_U.x * a + ICE_V.x * b, z: ICE_ORIGIN.z + ICE_U.z * a + ICE_V.z * b });
const ICE_ROW_A = 14.0, ICE_ROW_PITCH = 5.8; // the six rows along the square
const ICE_SLOT_B = [4.5, 14.5, 24.5]; // the three lanes across it: where each lane's ice begins

// The lanes in the order played. The obstacles are the Eternit kinds in winter clothing: a snow bank, the boards, a
// face-off dot to go round, the players' tunnel, a ramp up to the hole.
const ICE_LANE_DEFS = [
  lane(iceKeyhole(4.4), { name: 'Face-off', par: 2 }),
  lane(iceKeyhole(4.8), { name: 'The blue line', par: 2, walls: ring([[-0.22, 1.9], [0.22, 1.9], [0.22, 3.0], [-0.22, 3.0]]) }),
  lane(iceKeyhole(5.0), { name: 'The snow bank', par: 2, ramps: [{ y0: 1.9, y1: 2.6, h0: 0, h1: 0.08 }, { y0: 2.6, y1: 3.3, h0: 0.08, h1: 0 }] }),
  lane(iceKeyhole(5.0), { name: 'The penalty box', par: 2, posts: [{ x: -0.26, y: 2.2, r: 0.15 }, { x: 0.28, y: 3.4, r: 0.15 }] }),
  lane(iceKeyhole(5.2), { name: 'The players\u2019 tunnel', par: 2, walls: [[-ILW, 2.1, -0.16, 2.5], [ILW, 2.1, 0.16, 2.5], [-0.16, 2.5, -0.16, 3.4], [0.16, 2.5, 0.16, 3.4]], tube: { y0: 2.5, y1: 3.4, r: 0.16 } }),
  lane(angleLane(3.2, 1.9, ILW, ITR), { name: 'The boards', par: 3 }),
  lane(iceKeyhole(5.4), { name: 'The goal crease', par: 2, posts: [{ x: 0, y: 3.0, r: 0.34 }] }),
  lane(iceKeyhole(5.6), { name: 'The grandstand', par: 2, ramps: [{ y0: 2.4, y1: 3.5, h0: 0, h1: 0.18 }, { y0: 3.5, y1: 6.45, h0: 0.18, h1: 0.18 }] }),
  lane(iceKeyhole(6.2), { name: 'The icing line', par: 2, walls: [[-ILW, 4.5, -0.24, 4.9], [ILW, 4.5, 0.24, 4.9]] }),
  lane(iceKeyhole(5.6), { name: 'The hat-trick', par: 3, posts: [{ x: -0.28, y: 2.2, r: 0.14 }, { x: 0.28, y: 3.2, r: 0.14 }, { x: -0.28, y: 4.2, r: 0.14 }] }),
  lane(iceKeyhole(5.2), { name: 'The Zamboni', par: 2, ramps: [{ y0: 1.8, y1: 2.5, h0: 0, h1: 0.11 }, { y0: 2.5, y1: 3.2, h0: 0.11, h1: 0 }] }),
  lane(angleLane(3.0, -1.9, ILW, ITR), { name: 'The short side', par: 3 }),
  lane(iceKeyhole(6.2), { name: 'The slapshot', par: 2, ramps: [{ y0: 1.6, y1: 2.4, h0: 0, h1: 0.12 }, { y0: 2.4, y1: 3.2, h0: 0.12, h1: 0 }] }),
  lane(iceKeyhole(5.4), { name: 'The power play', par: 3, walls: ring([[-0.2, 2.3], [0.2, 2.3], [0.2, 3.4], [-0.2, 3.4]]), posts: [{ x: -0.36, y: 4.3, r: 0.11 }, { x: 0.36, y: 4.3, r: 0.11 }] }),
  lane(iceKeyhole(5.4), { name: 'The one-timer', par: 2, walls: [[-ILW, 1.8, -0.16, 2.2], [ILW, 1.8, 0.16, 2.2], [-0.16, 2.2, -0.16, 2.9], [0.16, 2.2, 0.16, 2.9]], tube: { y0: 2.2, y1: 2.9, r: 0.16 }, ramps: [{ y0: 3.1, y1: 3.9, h0: 0, h1: 0.14 }, { y0: 3.9, y1: 6.25, h0: 0.14, h1: 0.14 }] }),
  lane(iceKeyhole(5.0), { name: 'The spin-o-rama', par: 2, posts: [{ x: 0.3, y: 2.1, r: 0.17 }, { x: -0.3, y: 3.5, r: 0.17 }] }),
  lane(iceKeyhole(5.6), { name: 'Overtime', par: 3, ramps: [{ y0: 2.0, y1: 2.7, h0: 0, h1: 0.09 }, { y0: 2.7, y1: 3.4, h0: 0.09, h1: 0 }], posts: [{ x: -0.3, y: 4.3, r: 0.13 }, { x: 0.3, y: 4.3, r: 0.13 }] }),
  lane(iceKeyhole(6.2), { name: 'The Spengler Cup', par: 3, walls: ring([[-0.22, 2.2], [0.22, 2.2], [0.22, 3.3], [-0.22, 3.3]]), ramps: [{ y0: 4.0, y1: 4.9, h0: 0, h1: 0.16 }, { y0: 4.9, y1: 7.05, h0: 0.16, h1: 0.16 }] })
];

/**
 * The 18 lanes with their place on the square: six rows of three, the serpentine turning at the end of every row, so
 * that the hole of one lane is next to the tee of the next. An even row runs towards the Kulturplatz (+b), an odd row
 * back towards the Promenade (−b); within a row the lanes keep their slots across the square.
 */
export const ICE_HOLES = ICE_LANE_DEFS.map((def, i) => {
  const row = Math.floor(i / 3), east = row % 2 === 0;
  const slot = ICE_SLOT_B[east ? i % 3 : 2 - (i % 3)];
  const a = ICE_ROW_A + row * ICE_ROW_PITCH;
  // an eastward lane's ice starts at its slot, a westward one's back board sits at the far end of the same strip
  const b = east ? slot : slot + def.length;
  const p = iceToWorld(a, b);
  return { ...def, posts: def.posts || [], local: { a, b }, place: { x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: ICE_HEADING + (east ? Math.PI / 2 : -Math.PI / 2) } };
});
export const ICE_PAR = ICE_HOLES.reduce((a, h) => a + h.par, 0);
// The sheet of ice the lanes stand on (one quad, the square's frame inset from its edges)
export const ICE_RINK = [[[10.5, 3], [10.5, 33.5], [46, 33.5], [46, 3]].map(([a, b]) => { const p = iceToWorld(a, b); return [+p.x.toFixed(2), +p.z.toFixed(2)]; })];
export const ICE_SITE = (() => { const p = iceToWorld(28.5, 18); return { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }; })();
export const ARKADENPLATZ_COURSE = { id: 'arkadenplatz', phys: ICE_MINIGOLF, holes: ICE_HOLES, path: ICE_RINK, site: ICE_SITE, par: ICE_PAR };

export const ICE_MINIGOLF_MISSION = {
  id: 'ice-minigolf',
  title: 'Ice minigolf on the Arkadenplatz',
  intro: 'Eighteen lanes of ice on the Arkadenplatz, between the Promenade and the Kulturplatz, played with a hockey stick and a puck: the snow bank, the players’ tunnel, the face-off dot, the boards, the ramp up to the grandstand. Aim with A/D or the mouse, hold Space to fill the power bar and let go to shoot; on a phone drag back from the puck like a slingshot and let go. The puck slides much further than a ball rolls, so a light touch wins. Seven strokes at most a hole. Score: 7 a hole minus your strokes (126 minus the total): 45 strokes or fewer is gold (par 42).',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  features: ['iceMinigolf'],
  scoreMode: true,
  scoreUnit: 'pts',
  medals: { gold: 126 - 45, silver: 126 - 54, bronze: 126 - 64 },
  colour: '#49a7e0',
  icon: 'ice-minigolf',
  finish: 'Stick and puck back to the hut: a Punsch on the Arkadenplatz warms the fingers again.',
  get start() { const f = holeFrame(0, ARKADENPLATZ_COURSE), p = holeToWorld(f, -0.95, -0.9); return { x: p.x, z: p.z, heading: f.heading }; },
  pin: { x: ICE_SITE.x, z: ICE_SITE.z },
  props: [],
  createState() { return { game: createMinigolfGame(ARKADENPLATZ_COURSE) }; },
  score: (state) => minigolfScore(state.game),
  summary(state) {
    const g = state.game;
    const total = minigolfTotal(g);
    return [ICE_HOLES.map((h, i) => `${i + 1}: ${g.strokes[i]}`).join(' · ') + ` — ${total} strokes (par ${ICE_PAR}, ${total - ICE_PAR >= 0 ? '+' : ''}${total - ICE_PAR})`];
  },
  objectives: ICE_HOLES.map((hole, i) => ({
    id: `hole${i + 1}`,
    title: `Hole ${i + 1}: ${hole.name} (par ${hole.par})`,
    allowModes: ['person'],
    check(ctx, state) {
      const g = state.game;
      const done = g.history.length > i;
      const n = g.strokes[i];
      const text = `Stroke ${n}${g.ball.moving ? ' · sliding …' : ''} · total ${minigolfTotal(g)} (par ${ICE_PAR})`;
      return { done, progress: null, text, target: null, hint: g.ball.holed && !done ? strokeName(n, hole.par) : null };
    }
  }))
};

// =====================================================================================================================
// 3. Darts in The Green Wildman: 301 double out
// =====================================================================================================================
// The board (m, a regulation bristle board): the bull 12.7 mm across (50), the outer bull 31.8 mm (25), the treble ring
// 99-107 mm from the centre, the double ring 162-170 mm. The numbers clockwise from the top. Hung at 1.73 m, the oche
// 2.37 m from its face.
export const BOARD = { bull: 0.00635, outerBull: 0.0159, trebleIn: 0.099, trebleOut: 0.107, doubleIn: 0.162, doubleOut: 0.170, height: 1.73, oche: 2.37 };
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

/** The field at (x, y) on the board (m from its centre, y up): { score, mult, num, label, double } */
export function scoreDart(x, y, B = BOARD) {
  const r = Math.hypot(x, y);
  if (r <= B.bull) return { score: 50, mult: 2, num: 25, label: 'Bullseye', double: true };
  if (r <= B.outerBull) return { score: 25, mult: 1, num: 25, label: 'Bull 25', double: false };
  if (r > B.doubleOut) return { score: 0, mult: 0, num: 0, label: 'Miss', double: false };
  let deg = (Math.atan2(x, y) * 180) / Math.PI; // clockwise from the top
  deg = (deg + 9 + 360) % 360;
  const num = SECTORS[Math.floor(deg / 18) % 20];
  if (r >= B.doubleIn) return { score: 2 * num, mult: 2, num, label: `Double ${num}`, double: true };
  if (r >= B.trebleIn && r <= B.trebleOut) return { score: 3 * num, mult: 3, num, label: `Treble ${num}`, double: false };
  return { score: num, mult: 1, num, label: `${num}`, double: false };
}
/** The centre of a field (for the tests and the aim helpers): mult 1 (the outer single), 2, 3 or the bull (num 25) */
export function fieldCentre(num, mult = 1, B = BOARD) {
  if (num === 25) return { x: 0, y: mult === 2 ? 0 : (B.bull + B.outerBull) / 2 };
  const i = SECTORS.indexOf(num);
  const a = (i * 18 * Math.PI) / 180;
  const r = mult === 3 ? (B.trebleIn + B.trebleOut) / 2 : mult === 2 ? (B.doubleIn + B.doubleOut) / 2 : (B.trebleOut + B.doubleIn) / 2;
  return { x: Math.sin(a) * r, y: Math.cos(a) * r };
}

// The throw: the aim point wanders (the arm's sway: two slow sines and a quick tremor), the power decides the height:
// the ideal throw lands where it aims, a weak one drops, a hard one climbs; a small scatter on top
export const DART = { sway: 0.011, tremor: 0.0025, ideal: 0.72, band: 0.07, drop: 0.32, scatter: 0.003, maxDarts: 45 };
/** The sway offset (m) at time t (s), for a thrower with `steady` 0..1 (holding still a moment calms it) */
export function swayAt(t, steady = 0, D = DART) {
  const k = D.sway * (1 - 0.55 * clamp(steady, 0, 1));
  return {
    x: k * (Math.sin(t * 1.7) * 0.8 + Math.sin(t * 2.9 + 1.3) * 0.35) + D.tremor * Math.sin(t * 13.1),
    y: k * (Math.sin(t * 1.3 + 0.7) * 0.75 + Math.sin(t * 3.4 + 2.1) * 0.3) + D.tremor * Math.sin(t * 11.3 + 0.4)
  };
}
/** Where a dart lands: the aim point (m on the board), the sway at release, the power 0..1, a random source */
export function throwDart(aim, sway, power, rand = Math.random, D = DART) {
  const off = power - D.ideal;
  const miss = Math.abs(off) <= D.band / 2 ? 0 : (off - Math.sign(off) * D.band / 2) * D.drop;
  const g = () => (rand() + rand() + rand() - 1.5) * 1.15; // ~N(0, 1/2)
  return { x: aim.x + sway.x + g() * D.scatter, y: aim.y + sway.y + miss + g() * D.scatter };
}

/** 301 double out: { remaining, darts, turn: [hits], turnStart, busts, done, log } */
export function createX01(start = 301) {
  return { start, remaining: start, darts: 0, turn: [], turnStart: start, busts: 0, done: false, log: [], best: 0 };
}
/**
 * A dart in the game: the hit (scoreDart) -> { result: 'score' | 'bust' | 'checkout', turnOver }. A turn is three
 * darts; a bust (below zero, one left, or zero not on a double) takes the score back to where the turn began.
 */
export function x01Dart(g, hit) {
  if (g.done) return null;
  g.darts++;
  g.turn.push(hit);
  const rest = g.remaining - hit.score;
  let result = 'score';
  if (rest < 0 || rest === 1 || (rest === 0 && !hit.double)) {
    result = 'bust';
    g.busts++;
    g.remaining = g.turnStart;
  } else {
    g.remaining = rest;
    if (rest === 0) { result = 'checkout'; g.done = true; }
  }
  const turnOver = result !== 'score' || g.turn.length >= 3;
  if (turnOver) {
    const total = result === 'bust' ? 0 : g.turnStart - g.remaining;
    g.best = Math.max(g.best, total);
    g.log.push({ darts: g.turn.map((h) => h.label), total, bust: result === 'bust' });
    g.turn = [];
    g.turnStart = g.remaining;
  }
  return { result, turnOver };
}
/** The points of a finished leg: fewer darts score more (a nine-darter is out of reach on 301: six is the minimum) */
export const dartsScore = (g) => (g.done ? Math.max(0, 600 - 10 * g.darts) : 0);

// A checkout suggestion for the remaining score (the double to aim for when it can be finished with one dart)
export function checkoutHint(rest) {
  if (rest === 50) return 'Bullseye';
  if (rest <= 40 && rest % 2 === 0 && rest > 0) return `Double ${rest / 2}`;
  if (rest <= 60 && rest > 1) { const odd = rest % 2 ? 1 : 0; const d = Math.min(20, Math.floor((rest - odd - 2) / 2)); const single = rest - 2 * d; if (single >= 1 && single <= 20) return `${single}, then Double ${d}`; }
  return null;
}

// The pub: The Green Wildman (OSM n12919367405 at 469.4 / −819.4, inside its building) on the Promenade; the door on
// its north-west facade towards the Bobbahnstrasse corner (the building's outline: 0.8 m outside it)
export const WILDMAN_DOOR = { x: 466.8, z: -816.1, r: 2.2 };
const WILDMAN_START = { x: 462.6, z: -810.8 };

export const DARTS_MISSION = {
  id: 'darts-bar',
  title: 'Darts at The Green Wildman',
  intro: 'The Green Wildman, the Irish pub on the Promenade, has a dartboard by the window. Play 301 double out in as few darts as you can: aim with the mouse or W/A/S/D (the crosshair sways a little, it steadies while you keep still), hold Space or the mouse button to wind up the throw and let go in the green for a straight dart (too weak drops, too hard climbs). On a phone: touch the board to aim, swipe up to throw (the swipe\'s speed is the power). The leg must end on a double (or the bullseye); a bust takes the turn back. 45 darts at most.',
  mode: 'person',
  season: null,
  time: 'evening',
  features: ['darts'],
  scoreMode: true,
  scoreUnit: 'pts',
  medals: { gold: 600 - 10 * 18, silver: 600 - 10 * 27, bronze: 600 - 10 * 39 },
  colour: '#1e9e4a',
  icon: 'darts',
  finish: 'Game shot! The regulars slide a pint of stout along the bar.',
  interior: { door: WILDMAN_DOOR },
  start: { x: WILDMAN_START.x, z: WILDMAN_START.z, heading: Math.atan2(WILDMAN_DOOR.x - WILDMAN_START.x, WILDMAN_DOOR.z - WILDMAN_START.z) },
  props: [],
  createState() { return { game: null, inside: false }; },
  score: (state) => (state.game ? dartsScore(state.game) : 0),
  summary(state) {
    const g = state.game;
    if (!g) return [];
    return [`301 checked out in ${g.darts} darts · best turn ${g.best} · ${g.busts} ${g.busts === 1 ? 'bust' : 'busts'}`, g.log.map((l) => (l.bust ? 'bust' : l.total)).join(' · ')];
  },
  objectives: [
    walkTo(WILDMAN_DOOR, 'Go into The Green Wildman', 'The Green Wildman'),
    {
      id: 'leg',
      title: 'Check out 301 (double out)',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'Chalking the scoreboard …', target: null, hint: null };
        const fail = !g.done && g.darts >= DART.maxDarts ? `Out of darts: ${g.remaining} left after ${g.darts} darts.` : null;
        const hint = checkoutHint(g.remaining);
        return { done: g.done, fail, progress: 1 - g.remaining / g.start, text: `${g.remaining} left · dart ${g.darts + 1} · turn ${Math.floor(g.darts / 3) + 1}${g.turn.length ? ` · this turn ${g.turnStart - g.remaining}` : ''}`, target: null, hint: hint ? `Checkout: ${hint}` : null };
      }
    }
  ]
};

// =====================================================================================================================
// 4. The Schüssla: a 60 s run in the skate bowl
// =====================================================================================================================
// The bowl in its own frame (x along its long axis, z across, y up from the deck): a flat floor (a rounded rectangle,
// half sizes fa × fb, corner radius fc), round it the transition — a quarter circle of radius R from the floor up to the
// vertical at the coping, R below the deck. The skater lives in the floor's plane "unrolled": beyond the floor's edge
// the distance σ along the transition's arc counts as if flat (σ = 0 at the floor's edge, σmax = πR/2 at the coping);
// the slope pulls back down the arc (g · sin θ, θ = σ/R). At the coping: fast enough out of the bowl -> an air
// (straight up, along the coping while in the air, spin and grab; land facing back in, or fakie); slow up but quick
// along the coping -> a grind (balance it with A/D); else the skater stalls and drops back in.
export const BOWL = { fa: 4.4, fb: 2.4, fc: 2.2, R: 2.2, deck: 0.9, coping: 0.06 };
export const BOWL_SIGMA = (Math.PI * BOWL.R) / 2;
export const SKATE = {
  friction: 0.16, drag: 0.006, // m/s², 1/m
  pump: 5, pumpUp: 0.6, // m/s² pumping down a transition (W), its cost going up
  push: 1.6, pushMax: 3.2, // pushing on the flat when slow
  brake: 3,
  turn: 2.3, // rad/s at most when carving
  airMin: 1.4, // m/s out of the coping: an air
  grindMin: 1.8, // m/s along the coping (and slower out of it): a grind
  spinRate: 5.4, // rad/s in the air (A/D)
  landTol: 0.62, // rad the landing may be off
  grindDrift: 2.4, grindPull: 1.5, grindFix: 3.4, grindDecay: 0.35,
  bailTime: 1.3, // s on the floor after a bail
  comboGap: 2.6, comboMax: 5,
  runTime: 60
};

/** The nearest point on the floor's edge to the unrolled point (px, pz) and how far beyond it (σ; < 0 inside) */
export function floorEdge(px, pz, B = BOWL) {
  const ax = B.fa - B.fc, az = B.fb - B.fc;
  const sx = Math.sign(px) || 1, sz = Math.sign(pz) || 1;
  const qx = Math.abs(px), qz = Math.abs(pz);
  // the rounded rectangle's signed distance and the outward normal
  const dx = qx - ax, dz = qz - az;
  let nx, nz, d;
  if (dx > 0 && dz > 0) { const L = Math.hypot(dx, dz); nx = dx / L; nz = dz / L; d = L - B.fc; }
  else if (dx > dz) { nx = 1; nz = 0; d = dx - B.fc; }
  else { nx = 0; nz = 1; d = dz - B.fc; }
  nx *= sx; nz *= sz;
  return { sigma: d, nx, nz, ex: px - nx * d, ez: pz - nz * d };
}

/** The bowl's surface at the unrolled point: { x, y, z (bowl frame, y from the deck), nx, ny, nz (the surface's
 *  normal), theta (0 on the floor, π/2 at the coping), sigma } */
export function bowlSurface(px, pz, B = BOWL) {
  const e = floorEdge(px, pz, B);
  const sig = clamp(e.sigma, 0, BOWL_SIGMA);
  if (e.sigma <= 0) return { x: px, y: -B.R, z: pz, nx: 0, ny: 1, nz: 0, theta: 0, sigma: e.sigma, ox: e.nx, oz: e.nz };
  const th = sig / B.R;
  const w = B.R * Math.sin(th), y = B.R * (1 - Math.cos(th)) - B.R;
  return { x: e.ex + e.nx * w, y, z: e.ez + e.nz * w, nx: -e.nx * Math.sin(th), ny: Math.cos(th), nz: -e.nz * Math.sin(th), theta: th, sigma: e.sigma, ox: e.nx, oz: e.nz };
}

export function createBoarder(px = 0, pz = -(BOWL.fb + BOWL_SIGMA - 0.05)) {
  return { px, pz, vx: 0, vz: 0, heading: 0, mode: 'ride', air: null, grind: null, bailT: 0, y: 0, airs: 0, grinds: 0, bails: 0, rand: seededRandom(11) };
}
export const boarderSpeed = (b) => Math.hypot(b.vx, b.vz);

/** Pulls the unrolled point back onto the coping's line (σ = σmax), keeping its place along the edge */
function onCoping(b) {
  const e = floorEdge(b.px, b.pz);
  b.px = e.ex + e.nx * BOWL_SIGMA; b.pz = e.ez + e.nz * BOWL_SIGMA;
  return e;
}

/**
 * One step of the skater. `input`: { pump (W), back (S), steer -1..1 (positive: left), grab (Space held), drop (Space
 * went down) }. Returns the events: { type: 'air' | 'land' | 'grind' | 'grindEnd' | 'bail' | 'stall', trick? }.
 */
export function stepBoarder(b, input, dt, S = SKATE) {
  const ev = [];
  const steer = clamp(input.steer || 0, -1, 1);
  if (b.mode === 'bail') {
    b.bailT -= dt;
    const v = boarderSpeed(b), dec = Math.min(v, 4 * dt);
    if (v > 0) { b.vx *= (v - dec) / v; b.vz *= (v - dec) / v; }
    rideMove(b, dt);
    if (b.bailT <= 0) b.mode = 'ride';
    return ev;
  }
  if (b.mode === 'air') {
    const a = b.air;
    a.t += dt;
    a.y += a.vy * dt; a.vy -= G * dt;
    a.peak = Math.max(a.peak, a.y);
    a.spin += steer * S.spinRate * dt;
    if (input.grab) a.grab += dt;
    // along the coping
    b.px += a.tx * a.vt * dt; b.pz += a.tz * a.vt * dt;
    const e = onCoping(b);
    a.tx = -e.nz; a.tz = e.nx;
    if (a.vt < 0) { /* (keeps its sign: the tangent flips with the edge's direction only at the ends, not here) */ }
    b.y = a.y;
    if (a.y <= 0 && a.vy < 0) {
      // the landing: facing back into the bowl (half a turn) or fakie (none)
      const r = a.spin;
      const forward = Math.abs(wrapPi(r - Math.PI)) < S.landTol || Math.abs(wrapPi(r + Math.PI)) < S.landTol;
      const fakie = Math.abs(wrapPi(r)) < S.landTol;
      const ok = forward || fakie;
      const trick = scoreAir({ spin: r, grab: a.grab, peak: a.peak, time: a.t, fakie: fakie && !forward, ok });
      // back in: down the wall, the speed along the coping kept
      const e2 = floorEdge(b.px, b.pz);
      const back = Math.abs(a.vy) * (ok ? 0.92 : 0.4);
      b.px = e2.ex + e2.nx * (BOWL_SIGMA - 0.02); b.pz = e2.ez + e2.nz * (BOWL_SIGMA - 0.02);
      b.vx = -e2.nx * back + a.tx * a.vt * (ok ? 1 : 0.4);
      b.vz = -e2.nz * back + a.tz * a.vt * (ok ? 1 : 0.4);
      b.mode = ok ? 'ride' : 'bail';
      if (!ok) { b.bailT = S.bailTime; b.bails++; }
      b.air = null; b.y = 0;
      ev.push({ type: ok ? 'land' : 'bail', trick });
    }
    return ev;
  }
  if (b.mode === 'grind') {
    const gr = b.grind;
    gr.t += dt;
    gr.bv += ((b.rand() * 2 - 1) * S.grindDrift + gr.b * S.grindPull - steer * S.grindFix) * dt;
    gr.bv *= 1 - Math.min(1, dt * 1.2);
    gr.b += gr.bv * dt;
    gr.v = Math.max(0, gr.v - S.grindDecay * dt);
    b.px += gr.tx * gr.v * dt; b.pz += gr.tz * gr.v * dt;
    const e = onCoping(b);
    gr.tx = -e.nz * Math.sign(gr.dir); gr.tz = e.nx * Math.sign(gr.dir);
    b.heading = Math.atan2(gr.tx, gr.tz);
    if (Math.abs(gr.b) > 1) {
      // off balance: down into the bowl
      b.mode = 'bail'; b.bailT = S.bailTime; b.bails++;
      b.px = e.ex + e.nx * (BOWL_SIGMA - 0.05); b.pz = e.ez + e.nz * (BOWL_SIGMA - 0.05);
      b.vx = -e.nx * 1.5; b.vz = -e.nz * 1.5;
      b.grind = null;
      ev.push({ type: 'bail', trick: { points: 0, name: 'Slipped off the coping', ok: false } });
      return ev;
    }
    if (input.drop || gr.v < 0.8) {
      b.mode = 'ride';
      b.px = e.ex + e.nx * (BOWL_SIGMA - 0.03); b.pz = e.ez + e.nz * (BOWL_SIGMA - 0.03);
      b.vx = gr.tx * gr.v - e.nx * 1.2; b.vz = gr.tz * gr.v - e.nz * 1.2;
      const trick = scoreGrind(gr.t, gr.dist);
      b.grind = null;
      ev.push({ type: 'grindEnd', trick });
      return ev;
    }
    gr.dist += gr.v * dt;
    return ev;
  }
  // --- riding: the floor and the transitions ---
  const e = floorEdge(b.px, b.pz);
  const v = boarderSpeed(b);
  let ax = 0, az = 0;
  if (e.sigma > 0) {
    const th = Math.min(e.sigma, BOWL_SIGMA) / BOWL.R, s = Math.sin(th);
    ax -= e.nx * G * s; az -= e.nz * G * s;
    // pumping: down the wall adds speed along the way, up it costs a little
    const vout = b.vx * e.nx + b.vz * e.nz;
    if (input.pump && v > 0.3) {
      const k = vout < 0 ? S.pump * s : -S.pumpUp * s;
      ax += (b.vx / v) * k; az += (b.vz / v) * k;
    }
  } else if (input.pump && v < S.pushMax) {
    const hx = Math.sin(b.heading), hz = Math.cos(b.heading);
    ax += hx * S.push; az += hz * S.push;
  }
  const res = (v > 0.05 ? S.friction : 0) + S.drag * v * v + (input.back || 0) * S.brake;
  if (v > 1e-6) { ax -= (b.vx / v) * res; az -= (b.vz / v) * res; }
  b.vx += ax * dt; b.vz += az * dt;
  // carving: the velocity turns with the board
  const v2 = boarderSpeed(b);
  if (v2 > 0.2 && steer) {
    const w = steer * Math.min(S.turn, 7 / Math.max(1, v2)) * dt;
    const c = Math.cos(w), s = Math.sin(w);
    // (heading convention: x = sin h, z = cos h; turning left raises h)
    const nvx = b.vx * c + b.vz * s, nvz = -b.vx * s + b.vz * c;
    b.vx = nvx; b.vz = nvz;
  }
  if (v2 > 0.3) b.heading = Math.atan2(b.vx, b.vz);
  else if (steer) b.heading = wrapPi(b.heading + steer * 1.5 * dt);
  rideMove(b, dt);
  // the coping
  const e2 = floorEdge(b.px, b.pz);
  if (e2.sigma >= BOWL_SIGMA) {
    const vout = b.vx * e2.nx + b.vz * e2.nz;
    const tx = -e2.nz, tz = e2.nx;
    const vt = b.vx * tx + b.vz * tz;
    onCoping(b);
    if (vout >= S.airMin) {
      b.mode = 'air';
      b.air = { y: 0, vy: vout, vt, tx, tz, spin: 0, grab: 0, t: 0, peak: 0 };
      b.airs++;
      ev.push({ type: 'air' });
    } else if (Math.abs(vt) >= S.grindMin) {
      b.mode = 'grind';
      const dir = Math.sign(vt);
      b.grind = { b: 0, bv: 0, t: 0, v: Math.abs(vt), dir, tx: tx * dir, tz: tz * dir, dist: 0 };
      b.grinds++;
      ev.push({ type: 'grind' });
    } else {
      // a stall: the speed out of the bowl is gone, back down
      b.vx -= e2.nx * Math.max(0, vout); b.vz -= e2.nz * Math.max(0, vout);
      ev.push({ type: 'stall' });
    }
  }
  return ev;
}
function rideMove(b, dt) {
  b.px += b.vx * dt; b.pz += b.vz * dt;
  const e = floorEdge(b.px, b.pz);
  if (e.sigma > BOWL_SIGMA) { b.px = e.ex + e.nx * BOWL_SIGMA; b.pz = e.ez + e.nz * BOWL_SIGMA; }
}

const GRABS = ['Indy', 'Melon', 'Stalefish', 'Mute'];
/** The points of an air: { spin (rad), grab (s), peak (m over the coping), time, fakie, ok } */
export function scoreAir({ spin = 0, grab = 0, peak = 0, time = 0, fakie = false, ok = true }) {
  if (!ok) return { points: 0, name: 'Bail', ok: false, rot: 0 };
  // the rotation in half turns (the basic air turns 180° to come back in forward)
  const rot = Math.round(Math.abs(spin) / Math.PI) * 180;
  const grabbed = grab >= 0.22;
  let points = 60 + Math.round(peak * 45) + Math.round(time * 20);
  points += Math.max(0, rot - 180) / 180 * 90 + (fakie ? 40 : 0);
  if (grabbed) points += 50 + Math.round(Math.min(0.6, grab - 0.22) * 80);
  const side = spin >= 0 ? 'Frontside' : 'Backside';
  const parts = [];
  if (fakie) parts.push(rot ? `Fakie ${rot}` : 'Fakie air');
  else parts.push(rot <= 180 ? `${side} air` : `${side} ${rot}`);
  if (grabbed) parts.push(GRABS[Math.min(GRABS.length - 1, Math.floor(grab * 3))]);
  return { points: Math.round(points), name: parts.join(' '), ok: true, rot };
}
/** The points of a grind: a second on the coping and its length */
export function scoreGrind(t, dist = 0) {
  const points = Math.round(40 + t * 70 + dist * 4);
  return { points, name: t > 1.5 ? 'Long 50-50 grind' : '50-50 grind', ok: true };
}

/** The run's score: tricks chained within SKATE.comboGap s build a combo, its points × (1 + ½ a trick after the first),
 *  banked at SKATE.comboMax tricks (×3) or when the chain breaks; a bail loses the combo */
export function createSkateScore() { return { total: 0, combo: null, tricks: [], best: null, sinceTrick: 99 }; }
export function addTrick(sc, trick) {
  if (!trick || !trick.ok) { sc.combo = null; return null; }
  sc.tricks.push(trick);
  if (!sc.best || trick.points > sc.best.points) sc.best = trick;
  if (sc.combo && sc.sinceTrick <= SKATE.comboGap) { sc.combo.count++; sc.combo.base += trick.points; sc.combo.names.push(trick.name); }
  else { bankCombo(sc); sc.combo = { count: 1, base: trick.points, names: [trick.name] }; }
  sc.sinceTrick = 0;
  const combo = sc.combo;
  if (combo.count >= SKATE.comboMax) bankCombo(sc);
  return combo;
}
export const comboMultiplier = (c) => (c ? 1 + 0.5 * (Math.min(SKATE.comboMax, c.count) - 1) : 1);
export const comboValue = (c) => (c ? Math.round(c.base * comboMultiplier(c)) : 0);
export function bankCombo(sc) { if (sc.combo) { sc.total += comboValue(sc.combo); sc.combo = null; } }
/** The clock between tricks: a combo left alone too long is banked */
export function tickScore(sc, dt, busy = false) {
  if (busy) return;
  sc.sinceTrick += dt;
  if (sc.combo && sc.sinceTrick > SKATE.comboGap) bankCombo(sc);
}
export const skateTotal = (sc) => sc.total + comboValue(sc.combo);

// The place: the Freizeitareal Färich at the mouth of the Flüelatal, beside the Adventure Park Färich (OSM w1386979568).
// The Schüssla itself is not in OSM; the SWISSIMAGE orthophoto (data/hires/swissimage/576-320.webp) shows its concrete
// pad, ~14 × 10 m with the round bowl in it, west of the pump track: centred there, its long axis east-west.
export const SCHUESSLA = { x: 1936.5, z: -1731.4, heading: Math.PI / 2 };
/** Bowl frame (x along, z across, y from the deck) to world (y: the deck's height to add) */
export function bowlToWorld(x, z, site = SCHUESSLA) {
  const c = Math.cos(site.heading), s = Math.sin(site.heading);
  // the bowl's +x along the heading (sin h, cos h), +z to its right (−cos h, sin h): a rotation, no mirror
  return { x: site.x + s * x - c * z, z: site.z + c * x + s * z };
}
export const bowlHeadingToWorld = (h, site = SCHUESSLA) => wrapPi(h + site.heading - Math.PI / 2);

export const SKATE_BOWL_MISSION = {
  id: 'skate-bowl',
  title: 'Skating the Schüssla',
  intro: 'The Schüssla in the Färich, the concrete bowl Davos\' skaters designed themselves. You drop in for a 60 s run: W pumps down the walls for speed (and pushes on the flat), A/D carve. Out over the coping fast enough and you are in the air: A/D spin, hold Space to grab; come back in facing down the wall (half a turn) or fakie. Ride up slowly but fast along the rim and you lock into a grind: balance it with A/D, Space drops back in. Tricks within 2.6 s of each other build a combo (×1.5 … ×3 at five tricks); a bail loses it.',
  mode: 'person',
  season: 'summer',
  time: 'golden',
  features: ['skateBowl'],
  scoreMode: true,
  scoreUnit: 'pts',
  medals: { gold: 6000, silver: 3500, bronze: 1500 },
  colour: '#9b5cff',
  icon: 'skateboard',
  finish: 'Session over: the locals on the deck bang their boards on the coping.',
  get start() { const p = bowlToWorld(0, -(BOWL.fb + BOWL.R + 1.2)); return { x: p.x, z: p.z, heading: bowlHeadingToWorld(0) }; },
  props: [],
  createState() { return { boarder: null, score: createSkateScore(), t: 0, started: false, over: false, last: null }; },
  update(ctx, state) {
    if (state.started && !state.over) {
      state.t += ctx.dt || 0;
      tickScore(state.score, ctx.dt || 0, state.boarder && state.boarder.mode !== 'ride');
      if (state.t >= SKATE.runTime && (!state.boarder || state.boarder.mode === 'ride' || state.boarder.mode === 'bail')) { state.over = true; bankCombo(state.score); }
    }
  },
  score: (state) => skateTotal(state.score),
  summary(state) {
    const sc = state.score, b = state.boarder;
    const lines = [`${sc.tricks.length} tricks${sc.best ? ` · best: ${sc.best.name} (${sc.best.points})` : ''}`];
    if (b) lines.push(`${b.airs} airs · ${b.grinds} grinds · ${b.bails} ${b.bails === 1 ? 'bail' : 'bails'}`);
    return lines;
  },
  objectives: [
    {
      id: 'drop',
      title: 'Drop in',
      check(ctx, state) { return { done: state.started, progress: null, text: 'Press W (or Space) to drop into the bowl', target: null, hint: null }; }
    },
    {
      id: 'run',
      title: '60 s run',
      check(ctx, state) {
        const sc = state.score;
        const left = Math.max(0, SKATE.runTime - state.t);
        const combo = sc.combo ? ` · combo ×${comboMultiplier(sc.combo)} (${comboValue(sc.combo)})` : '';
        return { done: state.over, progress: Math.min(1, state.t / SKATE.runTime), text: `${Math.ceil(left)} s · ${skateTotal(sc)} pts${combo}`, target: null, hint: state.last ? `${state.last.name}${state.last.points ? ` +${state.last.points}` : ''}` : null };
      }
    }
  ]
};

export const SPORT_MISSIONS = [DAVOS_NORDIC_MISSION, MINIGOLF_MISSION, DARTS_MISSION, SKATE_BOWL_MISSION];
