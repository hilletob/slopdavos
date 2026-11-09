import { DAVOS_DATA } from './davos-geodata.js';
import { makeRoute, routePoint } from './missions-data-work.js';

// js/missions-data-winterroad.js
// Winter driving in the player's own VW T3 (js/missions-data.js spreads WINTERROAD_MISSIONS into MISSIONS;
// js/missions-winterroad.js is the runtime). Pure definitions and logic, three.js-free like the other packages
// (tests/missions-winterroad.test.mjs drives them with synthetic frames and a speed-profile bot on the real terrain).
//
//   summer-tyres-flueela  An early winter: the first snow lies on the Flüelapassstrasse and the van still wears its
//                         summer tyres. From the Wägerhütta (~2210 m) up to the Flüela Hospiz on the Passhöhe
//                         (2383 m), the top 2.5 km at 7-10 % with the hairpins: little grip in the bends (a little more
//                         than on Clavadel's unploughed road, TYRES.ploughed), long braking, the rear wheels
//                         spin when the throttle asks for more than the snow gives (worst when starting on the
//                         slope). Off the road and into the snowbank costs time; off it altogether, or stuck for good,
//                         ends the run.
//   snow-chains-clavadel  Pull over on the Clavadelerstrasse in Islen (Davos Platz, by the KMA), get out and put the
//                         chains on the two driven (rear) wheels: lay the chain out, pull it over the tyre (on the
//                         beat), tension it. Then over Clavadel (1664 m) and down the Sertigerstrasse to Frauenkirch
//                         with the chains' grip, under 50 km/h: faster, they strain, and they snap.
//
// The van's handling: js/controllers.js updateCar reads `car.drive` (CAR_DRIVE: grip and cornering, m/s², are the
// tyres' limits); the runtime puts a table of these tyres on the van and changes its `acceleration` every frame by
// stepTraction below (what the driven wheels can put down: the throttle eased in by a foot, a spin when it asks for
// more than the snow holds), and adds the slope's pull (the controllers know no gravity). All given back at the end.
//
// The route (OSM, DAVOS_DATA.roads): the Flüelapassstrasse from Tschuggen to the Passhöhe is one chain of ways
// (w606814579 ... w129025876). Islen to Frauenkirch has a road all the way, but not the short way: the
// Clavadelerstrasse climbs from Islen to Clavadel and on along the slope to its junction with the Sertigerstrasse
// above Schmelzboden (-247, 3949), which comes back down the other side of the Landwasser's side valley to Frauenkirch
// (the Clavadel tracks west of the Klinik are farm tracks, the Alte Sertigerstrasse a track too): 5.3 km in all.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const G = 9.81;
export const kmh = (ms) => ms * 3.6;
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);

// =====================================================================================================================
// The routes: OSM ways chained end to end
/** The ways (ids, in order) as one polyline [x0, z0, ...], each turned to continue where the last one ended */
export function chainWays(ids, roads = DAVOS_DATA.roads) {
  const ways = ids.map((id) => {
    const r = roads.find((w) => w.id === id);
    if (!r) throw new Error(`winterroad: way ${id} not in the city data`);
    return r.pts;
  });
  const near = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz) < 0.6;
  const rev = (p) => { const o = []; for (let i = p.length - 2; i >= 0; i -= 2) o.push(p[i], p[i + 1]); return o; };
  let out = ways[0].slice();
  if (ways.length > 1) {
    const n = ways[1], ex = out[out.length - 2], ez = out[out.length - 1];
    const joins = (x, z) => near(x, z, n[0], n[1]) || near(x, z, n[n.length - 2], n[n.length - 1]);
    if (!joins(ex, ez)) out = rev(out);
  }
  for (let k = 1; k < ways.length; k++) {
    let w = ways[k];
    const ex = out[out.length - 2], ez = out[out.length - 1];
    if (!near(ex, ez, w[0], w[1])) {
      if (near(ex, ez, w[w.length - 2], w[w.length - 1])) w = rev(w);
      else throw new Error(`winterroad: way ${ids[k]} does not join the one before`);
    }
    for (let i = 2; i < w.length; i += 2) out.push(w[i], w[i + 1]);
  }
  return out;
}

/** The part of a polyline between arc lengths s0 and s1 */
export function clipPolyline(pts, s0, s1) {
  const route = makeRoute(pts), out = [];
  const a = routePoint(route, s0), b = routePoint(route, s1);
  out.push(+a.x.toFixed(2), +a.z.toFixed(2));
  for (let i = 1; i < pts.length / 2 - 1; i++) if (route.cum[i] > s0 && route.cum[i] < s1) out.push(pts[i * 2], pts[i * 2 + 1]);
  out.push(+b.x.toFixed(2), +b.z.toFixed(2));
  return out;
}

/** The nearest point of the route to (x, z), searched only within ±`window` m of the arc length `near` (so that the
 *  other leg of a hairpin, 20 m away, is not taken for this one): { s, d (+ left of the way along), tx, tz } */
export function projectNear(route, x, z, near = null, window = 160, out = {}) {
  const { pts, cum } = route;
  let best = Infinity;
  const n = pts.length / 2;
  for (let i = 0; i < n - 1; i++) {
    if (near !== null && (cum[i + 1] < near - window || cum[i] > near + window)) continue;
    const ax = pts[i * 2], az = pts[i * 2 + 1], dx = pts[i * 2 + 2] - ax, dz = pts[i * 2 + 3] - az;
    const L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const px = ax + dx * t, pz = az + dz * t;
    const d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < best) {
      best = d2;
      out.s = cum[i] + t * L; out.tx = dx / L; out.tz = dz / L;
      out.d = (x - px) * out.tz - (z - pz) * out.tx;
    }
  }
  if (best === Infinity) return projectNear(route, x, z, null, window, out);
  return out;
}

const FLUELA_WAYS = ['w606814579', 'w960705398', 'w960705397', 'w960705395', 'w960705396', 'w129025877', 'w960705390', 'w129025876'];
const CLAVADEL_WAYS = [
  'w435437633', 'w37329958', 'w957769974', 'w37329959', 'w531784396', 'w531784397', 'w1377808866', 'w435437632', 'w435437631', // Islen up to Clavadel
  'w531784368', 'w531784377', 'w531784367', 'w629610484', 'w629610482', 'w435437630', 'w531784378', 'w26159007', // along the slope to the Sertigerstrasse
  'w1442773942', 'w37744920', 'w531784388', 'w531784389', 'w957769978', 'w1300640534', 'w37744916', 'w80341365', 'w531784399', 'w531784400' // down to Frauenkirch
];
// The places (the city data's buildings: the Gasthaus zum Tschuggen, the Wägerhus, the Wägerhütta, the Passhotel
// Flüela Hospiz; the Klinik Clavadel's road, the Frauenkirch junction)
export const PLACES = {
  tschuggen: { x: 6918, z: 761 }, waegerhus: { x: 7588, z: 1533 }, waegerhuetta: { x: 8695, z: 3059 }, hospiz: { x: 9146, z: 4757 },
  islen: { x: -1135, z: 1694 }, clavadel: { x: -1110, z: 3120 }, frauenkirch: { x: -2083, z: 3011 }
};

function buildFluela() {
  const all = chainWays(FLUELA_WAYS);
  const r = makeRoute(all);
  const s0 = projectNear(r, PLACES.tschuggen.x, PLACES.tschuggen.z).s, s1 = projectNear(r, PLACES.hospiz.x, PLACES.hospiz.z).s;
  return makeRoute(clipPolyline(all, s0 + 6, s1));
}
function buildClavadel() {
  const all = chainWays(CLAVADEL_WAYS);
  const r = makeRoute(all);
  return makeRoute(clipPolyline(all, 30, r.length - 8));
}
export const FLUELA = buildFluela(); // ~5.9 km, 1942 → 2383 m
export const CLAVADEL = buildClavadel(); // ~5.3 km, 1525 → 1664 → 1512 m
const at = (route, place) => projectNear(route, place.x, place.z).s;

// The roads' halves (OSM width / 2) and what lies beyond: the snowbank the plough left (into it: time lost, the van
// slowed), then the slope (off the road)
export const FLUELA_ROAD = { half: 5, bank: 6.6, lost: 15 };
export const CLAVADEL_ROAD = { half: 3.5, bank: 5.1, lost: 13 };

// =====================================================================================================================
// The tyres. drive: js/controllers.js's table (m/s, m/s²); traction: what the driven (rear) wheels put down before they
// spin, m/s² of the van (μ on the snow × the share of the weight on the rear axle, the T3's engine sits over it:
// ~0.62 × g × μ); kinetic: the share left while they spin, dig: how much less at a standing start (the wheels polish
// a hollow); spinGrip: the share of the lateral grip a full spin costs (the tail steps out); engine: the T3's pull,
// m/s² at low speed and the power limit (m²/s³: accel × speed)
export const TYRES = {
  summer: {
    label: 'Summer tyres',
    drive: { speed: 19, reverseSpeed: 4, acceleration: 2.6, powerSpeed: 0, rolling: 0.22, drag: 0.0012, coast: 0.45, brake: 1.9, wheelbase: 2.46, grip: 2.5, cornering: 2.7 },
    traction: 2.0, kinetic: 0.66, dig: 0.2, spinGrip: 0.45, engine: { low: 3.6, power: 26 }
  },
  // the same summer tyres on the Flüela's snow, which the plough has been through and packed: a little more grip than
  // on the untouched road to Islen (+15 % sideways and on the brakes, a less sudden spin), still well short of chains
  ploughed: {
    label: 'Summer tyres',
    drive: { speed: 19, reverseSpeed: 4, acceleration: 2.6, powerSpeed: 0, rolling: 0.22, drag: 0.0012, coast: 0.45, brake: 2.3, wheelbase: 2.46, grip: 2.9, cornering: 3.1 },
    traction: 2.3, kinetic: 0.7, dig: 0.2, spinGrip: 0.38, engine: { low: 3.6, power: 26 }
  },
  chains: {
    label: 'Snow chains',
    drive: { speed: 17, reverseSpeed: 3.5, acceleration: 2.8, powerSpeed: 0, rolling: 0.35, drag: 0.0012, coast: 0.6, brake: 4.4, wheelbase: 2.46, grip: 5.2, cornering: 5.6 },
    traction: 3.4, kinetic: 0.82, dig: 0.05, spinGrip: 0.2, engine: { low: 3.6, power: 26 }
  }
};
export const FOOT = { rise: 1.1, fall: 2.0 }; // the throttle foot: how fast it presses in and lets go (of full travel a second)
export const SPIN = { build: 2.5, recover: 3.2, show: 0.25 }; // how fast a spin builds (by the excess) and dies away; shown from

export const createTraction = () => ({ foot: 0, spin: 0, force: 0, pull: 0, grade: 0, spinTime: 0 });

/** The slope's pull along the way (m/s², + holding the van back) on a grade (rise over run) */
export const slopePull = (grade) => (G * grade) / Math.sqrt(1 + grade * grade);

/**
 * One frame of the driven wheels. input: { throttle (the key: + forward, − reverse, 0..1 each), speed (m/s along the
 * heading), grade (rise over run ahead), lateral (m/s² the tyres hold sideways now) }. Returns the state with
 * `force` (m/s² the wheels push the van with, along the throttle) and `spin` (0..1)
 */
export function stepTraction(tr, input, T, dt) {
  const want = Math.abs(input.throttle || 0);
  tr.foot += want > tr.foot ? Math.min(want - tr.foot, FOOT.rise * dt) : -Math.min(tr.foot - want, FOOT.fall * dt);
  const v = Math.abs(input.speed || 0);
  const engine = Math.min(T.engine.low, T.engine.power / Math.max(1, v));
  const demand = tr.foot * engine;
  // (the friction circle: what the tyres hold sideways is not there to push with)
  const side = clamp(Math.abs(input.lateral || 0) / T.drive.grip, 0, 0.95);
  const holds = T.traction * Math.sqrt(1 - side * side);
  if (demand > holds && want > 0) tr.spin = Math.min(1, tr.spin + SPIN.build * ((demand - holds) / holds) * dt);
  else tr.spin = Math.max(0, tr.spin - SPIN.recover * dt);
  const dig = T.dig * (1 - Math.min(1, v / 2));
  const spinning = holds * (T.kinetic - dig);
  const can = holds + (spinning - holds) * tr.spin;
  tr.force = Math.min(demand, can);
  tr.grade = input.grade || 0;
  tr.pull = slopePull(tr.grade);
  if (tr.spin > SPIN.show) tr.spinTime += dt;
  return tr;
}

// =====================================================================================================================
// The drive along a route: how far up it the van has come, the snowbank, off the road, stuck
export const STUCK_S = 40; // s without 4 m more of the road: stuck for good
export const BANK_PENALTY_MS = 5000;
export const CRASH_PENALTY_MS = 8000;

export const createDrive = () => ({ s: 0, best: 0, d: 0, bestAt: 0, idle: 0, banks: 0, inBank: false, crashes: 0, lastSpeed: 0, crashT: 0, lost: false, stuck: false, top: 0, p: {} });

/** One frame: the van at (x, z) with `speed`; returns 'bank' | 'crash' | null (what to show), sets lost / stuck
 *  (`watch`: the stuck clock runs: not while the van stands for the chains) */
export function stepDrive(dr, route, road, ctx, state, watch = true) {
  const p = projectNear(route, ctx.x, ctx.z, dr.s, 160, dr.p);
  dr.s = p.s; dr.d = p.d;
  const dt = ctx.dt || 0;
  let ev = null;
  dr.best = Math.max(dr.best, p.s);
  if (p.s > dr.bestAt + 4 || !watch) { dr.bestAt = Math.max(dr.bestAt, p.s); dr.idle = 0; } else dr.idle += dt;
  if (ctx.t > 0 && dr.idle > STUCK_S) dr.stuck = true;
  const off = Math.abs(p.d);
  if (off > road.lost) dr.lost = true;
  if (off > road.bank) {
    if (!dr.inBank) { dr.inBank = true; dr.banks++; if (ctx.t > 0) state.penaltyMs = (state.penaltyMs || 0) + BANK_PENALTY_MS; ev = 'bank'; }
  } else if (off < road.bank - 0.8) dr.inBank = false;
  // a crash: the speed gone at once (a wall, a car), not by the brakes (at most ~5 m/s² here)
  const v = Math.abs(ctx.speed || 0);
  dr.crashT = Math.max(0, dr.crashT - dt);
  if (dt > 0 && dr.lastSpeed - v > Math.max(3.5, 12 * dt) && dr.crashT === 0) {
    dr.crashes++; dr.crashT = 1.5; ev = 'crash';
    if (ctx.t > 0) state.penaltyMs = (state.penaltyMs || 0) + CRASH_PENALTY_MS;
  }
  dr.lastSpeed = v;
  dr.top = Math.max(dr.top, v);
  return ev;
}

// =====================================================================================================================
// The chains: put on the two rear wheels (the T3 drives them), three steps each
export const CHAIN_STEPS = ['lay', 'pull', 'tension'];
export const CHAINS = {
  layS: 1.4, // s of Space held: the chain laid out behind the wheel
  pullPeriod: 1.5, zone: [0.4, 0.62], // the needle swings across in a period; Space with it in the zone pulls it over
  slipMs: 2500, // a pull off the beat: the chain slips off, time lost
  tap: 0.2, slack: 0.32, // a tap of Space tensions it so much; it slackens so much a second
  reach: 1.3, // m from the work spot by the wheel
  axle: -1.319, track: 1.55, // the rear axle behind the van's middle, the spot beside the wheel (m)
  maxKmh: 50, warnKmh: 45, snapS: 2.5 // over 50 km/h the chains strain (s, by how much over); they snap at snapS
};
export const createChains = () => ({ wheels: [{ side: 'left', step: 0, t: 0, tension: 0, done: false }, { side: 'right', step: 0, t: 0, tension: 0, done: false }], at: -1, slips: 0, fitted: 0, strain: 0, snapped: false, overT: 0 });

/** The work spot beside the rear wheel on `side` of the van at (x, z, heading) */
export function chainSpot(car, side, C = CHAINS) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading), lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
  const k = side === 'left' ? C.track : -C.track;
  return { x: car.x + fx * C.axle + lx * k, z: car.z + fz * C.axle + lz * k };
}

/** The needle of the pull, 0..1 and back, `t` s into the step */
export const needleAt = (t, C = CHAINS) => { const p = (t / C.pullPeriod) % 1; return p < 0.5 ? p * 2 : 2 - p * 2; };

/**
 * One frame of the chains. input: { person: { x, z } | null (on foot), car: { x, z, heading }, hold (Space held),
 * presses (Space pressed since the last frame) }. Returns 'step' | 'slip' | 'wheel' | 'all' | null
 */
export function stepChains(ch, input, dt, state, C = CHAINS) {
  ch.at = -1;
  if (!input.person || !input.car) return null;
  let wi = -1, best = C.reach;
  ch.wheels.forEach((w, i) => {
    if (w.done) return;
    const p = chainSpot(input.car, w.side, C), d = Math.hypot(p.x - input.person.x, p.z - input.person.z);
    if (d <= best) { best = d; wi = i; }
  });
  if (wi < 0) return null;
  ch.at = wi;
  const w = ch.wheels[wi], step = CHAIN_STEPS[w.step];
  let ev = null;
  if (step === 'lay') {
    if (input.hold) { w.t += dt; if (w.t >= C.layS) { w.step = 1; w.t = 0; ev = 'step'; } }
  } else if (step === 'pull') {
    w.t += dt;
    if (input.presses > 0) {
      const n = needleAt(w.t, C);
      if (n >= C.zone[0] && n <= C.zone[1]) { w.step = 2; w.t = 0; ev = 'step'; }
      else { ch.slips++; state.penaltyMs = (state.penaltyMs || 0) + C.slipMs; w.t = 0; ev = 'slip'; }
    }
  } else {
    w.tension = Math.max(0, w.tension - C.slack * dt) + C.tap * (input.presses || 0);
    if (w.tension >= 1) {
      w.tension = 1; w.done = true; ch.fitted++; ev = ch.fitted >= ch.wheels.length ? 'all' : 'wheel';
    }
  }
  return ev;
}

/** The chains' strain over 50 km/h (faster: more), easing off below 45; returns 'warn' | 'snap' | null */
export function stepChainStrain(ch, speed, dt, C = CHAINS) {
  const v = kmh(Math.abs(speed));
  if (v > C.maxKmh) ch.strain += dt * (1 + (v - C.maxKmh) / 8);
  else if (v < C.warnKmh) ch.strain = Math.max(0, ch.strain - dt * 0.35);
  if (v > C.maxKmh) ch.overT += dt;
  if (ch.strain >= C.snapS) { ch.snapped = true; return 'snap'; }
  return v > C.warnKmh ? 'warn' : null;
}

// =====================================================================================================================
// The clean run's time: a speed profile along the route (the bends' limit from the lateral grip, the climb's from the
// traction the wheels hold, braking ahead of the bends) — the medals are set from it (tests/missions-winterroad.test.mjs
// checks them on the real terrain)
export function profileTime(route, heightAt, T, { vmax = T.drive.speed, step = 5, share = 0.85, from = 0, to = route.length, v0 = 0 } = {}) {
  const S = [], H = [];
  for (let s = from; s <= to; s += step) { const p = routePoint(route, s); S.push(p); H.push(heightAt(p.x, p.z)); }
  const n = S.length, R = new Float64Array(n), gr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 2)], b = S[i], c = S[Math.min(n - 1, i + 2)];
    const A = Math.hypot(b.x - a.x, b.z - a.z), B = Math.hypot(c.x - b.x, c.z - b.z), Cc = Math.hypot(c.x - a.x, c.z - a.z);
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
    R[i] = area > 1e-6 ? (A * B * Cc) / (4 * area) : 1e9;
    gr[i] = (H[Math.min(n - 1, i + 2)] - H[Math.max(0, i - 2)]) / (step * (Math.min(n - 1, i + 2) - Math.max(0, i - 2)) || 1);
  }
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(vmax, Math.sqrt(T.drive.grip * share * R[i]));
  // up the road: what the wheels hold (no spin: a clean foot), less the slope, the rolling and the air
  v[0] = Math.min(v[0], v0);
  for (let i = 1; i < n; i++) {
    const u = v[i - 1];
    const push = Math.min(T.traction, Math.min(T.engine.low, T.engine.power / Math.max(1, u)));
    const a = push - slopePull(gr[i]) - T.drive.rolling - T.drive.drag * u * u;
    v[i] = Math.min(v[i], Math.sqrt(Math.max(0.25, u * u + 2 * a * step)));
  }
  // and back: braking ahead of the bends (the slope helps uphill, pulls downhill)
  for (let i = n - 2; i >= 0; i--) {
    const b = T.drive.brake + slopePull(gr[i]) + T.drive.rolling;
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * Math.max(0.3, b) * step));
  }
  let t = 0;
  for (let i = 1; i < n; i++) t += step / Math.max(0.5, (v[i] + v[i - 1]) / 2);
  return { ms: Math.round(t * 1000), v, grade: gr, radius: R };
}

// =====================================================================================================================
// The missions
const placeName = { waegerhus: 'the Wägerhus', waegerhuetta: 'the Wägerhütta', hospiz: 'the Flüela Hospiz', islen: 'Islen', clavadel: 'Clavadel', frauenkirch: 'Frauenkirch' };
export const SPIN_HINT = 'Wheels spinning: ease off the throttle (tap W)';
export const BANK_HINT = 'In the snowbank: back onto the road';

/** The drive to a point of the route: done past its arc length; the HUD's distance (to `place` at the arc length `to`,
 *  for a split short of it), the speed, the hints */
function driveTo(id, title, route, road, place, sEnd, { chains = false, to = sEnd } = {}) {
  return {
    id, title,
    check(ctx, state) {
      const dr = state.drive;
      if (dr.lost) return { done: false, fail: chains ? 'Off the road: the van slid off the Clavadelerstrasse into the snow-covered meadow.' : 'Off the road: the van slid off the Flüelapassstrasse and down the slope.', text: '', progress: null, target: null, hint: null };
      if (dr.stuck) return { done: false, fail: `Stuck: the van has not got any further up the road for ${STUCK_S} s.`, text: '', progress: null, target: null, hint: null };
      if (chains && state.chains?.snapped) return { done: false, fail: 'A chain snapped: snow chains are good for 50 km/h at most.', text: '', progress: null, target: null, hint: null };
      const left = Math.max(0, to - dr.best);
      const v = Math.round(kmh(Math.abs(ctx.speed || 0)));
      let text = `${fmtDist(left)} to ${placeName[place]} · ${v} km/h`;
      if (dr.banks) text += ` · ${dr.banks} ${dr.banks === 1 ? 'time' : 'times'} in the snowbank`;
      const p = routePoint(route, Math.min(route.length, dr.best + 60));
      const hint = chains && state.chainWarn ? `Chains rattling at ${v} km/h: slow down below 50!` : dr.inBank ? BANK_HINT : (state.traction?.spin || 0) > SPIN.show ? SPIN_HINT : null;
      return { done: dr.best >= sEnd - 2, progress: clamp(dr.best / sEnd, 0, 1), text, target: { x: p.x, z: p.z, r: road.half + 1, style: 'plain' }, hint };
    }
  };
}

const startOn = (route, s, d = -2.2) => { const p = routePoint(route, s, d); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: +p.heading.toFixed(4) }; };

export const FLUELA_S = { waegerhus: at(FLUELA, PLACES.waegerhus), waegerhuetta: at(FLUELA, PLACES.waegerhuetta), end: FLUELA.length };
// The mission's part of it: from the Wägerhütta to the pass (~2.5 km, 2209 → 2383 m), the split past the two hairpins
// halfway up (radius ~18 m at 1.29 km, ~29 m at 1.43 km)
export const FLUELA_TOP = makeRoute(clipPolyline(FLUELA.pts, FLUELA_S.waegerhuetta, FLUELA.length));
export const FLUELA_HAIRPINS = 1480;

// (the clean run, tests/missions-winterroad.test.mjs profileTime: ~3:21 for the 2.5 km at a perfect foot and under
// 60 km/h on the ploughed snow; a player spins now and then, and the bends cost more than the profile's: gold 3:50,
// silver +40 %, bronze double)
export const SUMMER_TYRES_MISSION = {
  id: 'summer-tyres-flueela',
  title: 'Summer tyres on the Flüela',
  intro: 'An early winter has come overnight: 20 cm of fresh snow on the Flüelapassstrasse, the plough has been through once, and your van still wears its summer tyres. Drive the last 2.5 km from the Wägerhütta up through the hairpins to the Flüela Hospiz on the pass, 2383 m. The tyres hardly grip: brake early and gently, take the bends slowly, and ease into the throttle; too much and the rear wheels spin, worst of all from a standstill on the slope. Into the snowbank costs 5 s; off the road, or stuck for good, and the climb is over.',
  mode: 'car',
  season: 'winter',
  time: 'golden',
  features: ['winterDrive'],
  tyres: 'ploughed',
  route: 'fluela',
  props: [],
  colour: '#7fa7c9',
  icon: 'snowtyre',
  bonusMs: 230000,
  medals: { gold: 230000, silver: 322000, bronze: 460000 },
  finish: 'At the Hospiz the engine ticks as it cools. Winter tyres before the drive down, though.',
  start: startOn(FLUELA_TOP, 4),
  pin: startOn(FLUELA_TOP, 4, -7),
  createState() { return { drive: createDrive(), traction: createTraction(), penaltyMs: 0 }; },
  update(ctx, state) {
    if (ctx.mode !== 'car') return;
    const ev = stepDrive(state.drive, FLUELA_TOP, FLUELA_ROAD, ctx, state);
    if (ev) state.event = ev;
  },
  summary(state) {
    const d = state.drive, tr = state.traction;
    return [`Wheelspin ${Math.round(tr.spinTime)} s · ${d.banks} ${d.banks === 1 ? 'time' : 'times'} in the snowbank · ${d.crashes} ${d.crashes === 1 ? 'crash' : 'crashes'}`];
  },
  objectives: [
    driveTo('hairpins', 'Up through the hairpins', FLUELA_TOP, FLUELA_ROAD, 'hospiz', FLUELA_HAIRPINS, { to: FLUELA_TOP.length }),
    driveTo('hospiz', 'Up to the Flüela Hospiz', FLUELA_TOP, FLUELA_ROAD, 'hospiz', FLUELA_TOP.length)
  ]
};

// The pull-in in Islen: on the right of the Clavadelerstrasse, past the KMA, before the climb
export const ISLEN_S = at(CLAVADEL, PLACES.islen);
export const PULLOVER = (() => { const p = routePoint(CLAVADEL, ISLEN_S, -3.0); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: 5, heading: p.heading }; })();
export const CLAVADEL_S = { islen: ISLEN_S, clavadel: at(CLAVADEL, PLACES.clavadel), end: CLAVADEL.length };

// (the clean run: ~0:50 to Islen on the summer tyres, ~1:10 for the chains done well with the walk round the van,
// profileTime ~6:20 for the 5 km over Clavadel to Frauenkirch under 48 km/h: gold 7:40, silver +40 %, bronze double)
export const SNOW_CHAINS_MISSION = {
  id: 'snow-chains-clavadel',
  title: 'Snow chains over Clavadel',
  intro: 'Snow down to the valley floor, and your van on summer tyres has to get to Frauenkirch, the long way round over Clavadel. In Islen, past the KMA on the Clavadelerstrasse, pull over on the right and stop. Get out (F) and put the chains on the two rear wheels, the ones that drive: hold Space to lay the chain out, press Space when the needle is in the green to pull it over the tyre, then tap Space to tension it. Back behind the wheel, up to Clavadel and down the Sertigerstrasse to Frauenkirch. The chains grip, and they rattle, but they are good for 50 km/h at most: any faster and they strain until one snaps.',
  mode: 'car',
  allowModes: ['car'],
  season: 'winter',
  time: 'midday',
  features: ['winterDrive', 'snowChains'],
  tyres: 'summer',
  route: 'clavadel',
  props: [],
  colour: '#9aa3ad',
  icon: 'snowchain',
  bonusMs: 460000,
  medals: { gold: 460000, silver: 645000, bronze: 920000 },
  finish: 'Frauenkirch: the chains come off again by the church, cold, wet and rattling.',
  start: startOn(CLAVADEL, 12, -1.8),
  pin: startOn(CLAVADEL, 12, -7.5),
  createState() { return { drive: createDrive(), traction: createTraction(), chains: createChains(), tyres: 'summer', input: null, penaltyMs: 0, chainWarn: false }; },
  update(ctx, state) {
    if (state.input) {
      const ev = stepChains(state.chains, state.input, ctx.dt || 0, state);
      if (ev) state.event = ev;
      state.input.presses = 0;
    }
    if (state.chains.fitted >= 2) state.tyres = 'chains';
    if (ctx.mode !== 'car') return;
    const ev = stepDrive(state.drive, CLAVADEL, CLAVADEL_ROAD, ctx, state, state.tyres === 'chains');
    if (ev) state.event = ev;
    if (state.tyres === 'chains') {
      const w = stepChainStrain(state.chains, ctx.speed || 0, ctx.dt || 0);
      state.chainWarn = w === 'warn';
    }
  },
  summary(state) {
    const d = state.drive, c = state.chains;
    return [`${c.slips} ${c.slips === 1 ? 'chain slipped' : 'chains slipped'} · top speed ${Math.round(kmh(d.top))} km/h · ${d.banks} ${d.banks === 1 ? 'time' : 'times'} in the snowbank`];
  },
  objectives: [
    {
      id: 'pullover',
      title: 'Pull over in Islen',
      check(ctx, state) {
        const d = Math.hypot(ctx.x - PULLOVER.x, ctx.z - PULLOVER.z);
        const stopped = Math.abs(ctx.speed || 0) < 0.5;
        const here = d <= PULLOVER.r;
        return {
          done: ctx.mode === 'car' && here && stopped,
          progress: null,
          text: here ? 'Stop here, on the right' : `${fmtDist(d)} to Islen · ${Math.round(kmh(Math.abs(ctx.speed || 0)))} km/h`,
          target: { x: PULLOVER.x, z: PULLOVER.z, r: PULLOVER.r, style: 'pad' },
          hint: here && !stopped ? 'Brake (S) to a stop' : (state.traction?.spin || 0) > SPIN.show ? SPIN_HINT : null
        };
      }
    },
    {
      id: 'chains',
      title: 'Put the chains on the rear wheels',
      allowModes: ['car', 'person'],
      check(ctx, state) {
        const c = state.chains, car = state.input?.car;
        const fitted = c.fitted;
        if (ctx.mode === 'car') {
          const moved = car ? Math.hypot(car.x - PULLOVER.x, car.z - PULLOVER.z) > PULLOVER.r + 3 : false;
          return { done: false, progress: fitted / 2, text: `Chains on ${fitted} of 2 wheels`, target: moved ? { x: PULLOVER.x, z: PULLOVER.z, r: PULLOVER.r, style: 'pad' } : null, hint: moved ? 'Back to the pull-in' : 'F: get out' };
        }
        let target = null, text, hint = null;
        const w = c.at >= 0 ? c.wheels[c.at] : null;
        if (!w) {
          const next = c.wheels.find((q) => !q.done);
          if (next && car) { const p = chainSpot(car, next.side); target = { x: p.x, z: p.z, r: 0.7, style: 'plain' }; }
          text = next ? `Chains on ${fitted} of 2 wheels · go to the ${next.side} rear wheel` : 'Chains on';
        } else {
          const side = w.side === 'left' ? 'Left' : 'Right';
          const step = CHAIN_STEPS[w.step];
          text = step === 'lay' ? `${side} rear wheel: lay the chain out` : step === 'pull' ? `${side} rear wheel: pull it over the tyre` : `${side} rear wheel: tension the chain`;
          hint = step === 'lay' ? 'Hold Space' : step === 'pull' ? 'Space when the needle is in the green' : 'Tap Space quickly';
        }
        return { done: fitted >= 2, progress: (fitted + (w ? (w.step + (w.step === 0 ? w.t / CHAINS.layS : w.step === 2 ? w.tension : 0)) / 3 : 0)) / 2, text, target, hint };
      }
    },
    {
      id: 'getin',
      title: 'Back behind the wheel',
      allowModes: ['car', 'person'],
      check(ctx, state) {
        const car = state.input?.car;
        return { done: ctx.mode === 'car', progress: null, text: 'Get back into the van', target: car ? { x: car.x, z: car.z, r: 2.5, style: 'plain' } : null, hint: 'F: get in' };
      }
    },
    driveTo('clavadel', 'Up to Clavadel', CLAVADEL, CLAVADEL_ROAD, 'clavadel', CLAVADEL_S.clavadel, { chains: true }),
    driveTo('frauenkirch', 'Down to Frauenkirch', CLAVADEL, CLAVADEL_ROAD, 'frauenkirch', CLAVADEL_S.end, { chains: true })
  ]
};

export const WINTERROAD_MISSIONS = [SUMMER_TYRES_MISSION, SNOW_CHAINS_MISSION];
