import { createRhythm, createHeadbang, headbangTap, headbangAdvance } from './missions-data-fun.js';

// js/missions-data-wef.js
// The two missions of the World Economic Forum's week in January (js/missions-wef.js has their runtime; no three.js and
// no DOM in here, tests/missions-wef.test.mjs drives them on synthetic frames). The delegation and everybody else are
// fictional: no real person, leader or company is named.
//  - wef-escort: the patrol car leads a fictional delegation's motorcade from the Bahnhof Davos Dorf to the
//    Kongresszentrum: Promenade, the Scalettastrasse (the detour you radio in), the Kurgartenstrasse and the Talstrasse,
//    in the streets' real one-way direction. Three limousines and a chase car drive the player's recorded trail.
//  - anti-wef-demo: on foot, megaphone in hand, at the head of a registered march down the Promenade: a peaceful and comic
//    affair, a chant in call and response, a police liaison to talk to, a rally point short of the security fence.
// Both share the trail (createTrail ...) and its followers (stepFollowers), and the way the traffic gives way
// (js/missions-wef.js holds the cars near the convoy back and lets them pull over, yieldStep).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// (js/missions-data.js formatDistance: that module imports this one, and the texts here are built at run time only)
const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

// --- The trail: where the leader went, for everybody behind to follow ---------------------------------------------------
/** A trail from a seed polyline [x0, z0, x1, z1, ...]: the way the followers come from, then the leader's points */
export function createTrail(seed = [], step = 2) {
  const trail = { step, xs: [], zs: [], ss: [] };
  for (let i = 0; i < seed.length; i += 2) appendPoint(trail, seed[i], seed[i + 1]);
  return trail;
}
function appendPoint(trail, x, z) {
  const n = trail.xs.length;
  trail.ss.push(n ? trail.ss[n - 1] + Math.hypot(x - trail.xs[n - 1], z - trail.zs[n - 1]) : 0);
  trail.xs.push(x);
  trail.zs.push(z);
}
export const trailLength = (trail) => (trail.ss.length ? trail.ss[trail.ss.length - 1] : 0);

/** The leader at (x, z): a new point every `step` m. Backing up over the last points takes them off again (no loop for
 *  the followers to drive), though never back past arc length `minS`, where the first follower is */
export function trailPush(trail, x, z, minS = 0) {
  const n = trail.xs.length;
  if (!n) { appendPoint(trail, x, z); return true; }
  for (let k = n - 2; k >= Math.max(0, n - 14); k--) {
    if (trail.ss[k] < minS) break;
    if (Math.hypot(x - trail.xs[k], z - trail.zs[k]) < trail.step * 0.75) {
      trail.xs.length = trail.zs.length = trail.ss.length = k + 1;
      return false;
    }
  }
  if (Math.hypot(x - trail.xs[n - 1], z - trail.zs[n - 1]) < trail.step) return false;
  appendPoint(trail, x, z);
  return true;
}

/** The point at arc length s on the trail (clamped to its ends) with the unit direction of travel there */
export function trailAt(trail, s, out = { x: 0, z: 0, dx: 0, dz: 1 }) {
  const { xs, zs, ss } = trail, n = xs.length;
  if (n === 0) return out;
  if (n === 1) { out.x = xs[0]; out.z = zs[0]; return out; }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
  const L = ss[hi] - ss[lo] || 1e-6, k = clamp((s - ss[lo]) / L, 0, 1);
  out.dx = (xs[hi] - xs[lo]) / L;
  out.dz = (zs[hi] - zs[lo]) / L;
  out.x = xs[lo] + (xs[hi] - xs[lo]) * k;
  out.z = zs[lo] + (zs[hi] - zs[lo]) * k;
  return out;
}

const _a = { x: 0, z: 0, dx: 0, dz: 1 }, _b = { x: 0, z: 0, dx: 0, dz: 1 };
/** How sharply the trail bends just ahead of s: the turn over the next `reach` m per metre (1/m) */
export function trailBend(trail, s, reach = 14) {
  trailAt(trail, s + 2, _a);
  trailAt(trail, s + reach, _b);
  const cross = _a.dx * _b.dz - _a.dz * _b.dx, dot = _a.dx * _b.dx + _a.dz * _b.dz;
  return Math.abs(Math.atan2(cross, dot)) / reach;
}

/** A follower: where it is on the trail, its speed; `gap` m + `headway` s × speed behind the one ahead */
export const createFollower = (s, o = {}) => ({ s, v: 0, gap: 8, headway: 0.4, vmax: 15, accel: 2.6, brake: 6, aLat: 2.5, x: 0, z: 0, dx: 0, dz: 1, ...o });

/** One step of a column of followers behind the leader at arc length `leadS`: each drives on to its distance behind the
 *  one ahead, no faster than its top speed and than the bend ahead allows, with limited acceleration: a leader who
 *  drives away from them simply leaves them behind. It writes each one's position and direction */
export function stepFollowers(list, leadS, trail, dt) {
  let ahead = leadS;
  const end = trailLength(trail);
  for (const f of list) {
    const bend = trailBend(trail, f.s);
    const limit = Math.min(f.vmax, bend > 1e-3 ? Math.sqrt(f.aLat / bend) : Infinity);
    const free = ahead - f.s - f.gap - f.headway * f.v;
    const want = clamp(free / 0.9, 0, limit);
    f.v += clamp(want - f.v, -f.brake * dt, f.accel * dt);
    f.s = Math.max(f.s, Math.min(f.s + f.v * dt, ahead - f.gap * 0.5, end));
    trailAt(trail, f.s, f);
    ahead = f.s;
  }
  return list;
}

// --- A route: projection onto a polyline, and the point to steer for ------------------------------------------------------
/** The route as a trail: routeOf([x0, z0, ...]) */
export const routeOf = (pts) => createTrail(pts);

/** Where (x, z) projects onto the route near arc length `from` (within [from - back, from + ahead]): { s, d (m off it) } */
export function projectRoute(route, x, z, from = 0, back = 40, ahead = 120, out = { s: 0, d: 0 }) {
  const { xs, zs, ss } = route;
  let best = Infinity;
  for (let i = 1; i < xs.length; i++) {
    if (ss[i] < from - back || ss[i - 1] > from + ahead) continue;
    const ax = xs[i - 1], az = zs[i - 1], dx = xs[i] - ax, dz = zs[i] - az, L2 = dx * dx + dz * dz || 1e-6;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const qx = ax + dx * t - x, qz = az + dz * t - z, d = qx * qx + qz * qz;
    if (d < best) { best = d; out.s = ss[i - 1] + (ss[i] - ss[i - 1]) * t; }
  }
  out.d = Math.sqrt(best);
  return out;
}

/** The point the marker stands on: a stretch ahead on the route, never past the objective at arc length `until` */
export function routeAhead(route, s, reach = 70, until = Infinity) {
  const p = trailAt(route, Math.min(s + reach, until), { x: 0, z: 0, dx: 0, dz: 1 });
  return { x: p.x, z: p.z };
}
const arcOf = (route, p) => projectRoute(route, p.x, p.z, 0, 0, 1e9).s;

// --- The traffic gives way -----------------------------------------------------------------------------------------------
/** A vehicle holding back for the convoy, one step: `speed` braked towards a stop; `side` eased out to the kerb (m right of
 *  its lane). (js/missions-wef.js applies it to js/traffic.js's vehicles near the convoy.) */
export function yieldStep(speed, side, dt, { brake = 6, kerb = 2.3, rate = 1.6 } = {}) {
  return { speed: Math.max(0, speed - brake * dt), side: Math.min(kerb, side + rate * dt) };
}

// =========================================================================================================================
// 1. The escort
export const ESCORT_START = { x: 943.5, z: -1675.5, heading: -0.739 };
export const PICKUP = { x: 848.4, z: -1562.2, r: 7, name: 'the Bahnhof Davos Dorf' };
// The service lane in front of the station, the limousines waiting on it (OSM), to its mouth on the Bahnhofstrasse
export const ESCORT_SEED = [919, -1631.1, 878, -1574.9, 875.5, -1572.5, 871, -1570.7, 866.5, -1571.4, 860.8, -1574.6];
// Bahnhofstrasse, Promenade, Scalettastrasse, Promenade, Kurgartenstrasse, Talstrasse, the drive to the Kongresszentrum:
// the road axes of js/davos-geodata.js, simplified to 0.8 m
export const ESCORT_ROUTE_PTS = [860.8, -1574.6, 785.2, -1476.9, 777.9, -1470.6, 771.3, -1467.9, 759.6, -1468.8, 751.9, -1472.7, 735.2, -1484.7, 728, -1487.4, 719.3, -1487.8, 709.9, -1484.6, 690, -1458.8, 628.6, -1368.8, 608.4, -1325.1, 590.8, -1277.8, 578.6, -1217.6, 558.6, -1101.5, 544.3, -1029, 515.2, -915.3, 489.3, -827.1, 479.5, -807.9, 462.4, -785.4, 437.7, -764.3, 424.4, -775.7, 418.4, -778, 409.7, -779.1, 32, -757.1, 14.4, -755.2, 5.7, -748.1, -40.3, -700.8, -43.7, -693, -42.7, -686.7, -35.3, -668.8, -35.9, -661.9, -40.9, -653.2, -58.6, -636.4, -60.6, -629.5, -70.9, -628.5, -93.1, -623.3, -105.3, -619.3, -122.3, -611.6, -144.2, -598.9, -154.4, -590.4, -163.3, -579.3, -177.1, -554.3, -170.4, -548.8, -166.5, -542.6, -165.9, -532.4, -169.2, -522.3, -190.7, -490.7, -224, -455.7, -228.7, -445.5, -228.7, -435.4, -226.1, -429.6, -149.5, -315.9, -105.1, -260.6, -79, -288.9, -25.5, -323.1, 72, -374.6, 188.8, -443.1, 184.2, -455.9, 178.5, -483.7];
export const ESCORT_ROUTE = routeOf(ESCORT_ROUTE_PTS);
export const ESCORT_LENGTH = trailLength(ESCORT_ROUTE);
export const WEF_GATES = [
  { id: 'gate-promenade', x: 565.5, z: -1141.5, r: 11, name: 'the Promenade gate', title: 'Security gate on the Promenade' },
  { id: 'gate-scaletta', x: 210, z: -767.4, r: 11, name: 'the Scalettastrasse gate', title: 'Security gate on the Scalettastrasse' },
  { id: 'gate-kurgarten', x: -180, z: -361.3, r: 11, name: 'the Kurgartenstrasse gate', title: 'Security gate on the Kurgartenstrasse' },
  { id: 'gate-talstrasse', x: 72, z: -374.6, r: 11, name: 'the Talstrasse gate', title: 'Security gate on the Talstrasse' }
];
export const DROPOFF = { x: 181, z: -471.5, r: 8, name: 'the Kongresszentrum' };
// The Promenade in front of the Kongresszentrum is shut: a snow blower has broken down at the barrier. The turn into the
// Scalettastrasse is the last way round.
export const ROADBLOCK = { x: 385, z: -719.6, r: 7 };
export const DETOUR_TURN = { x: 432, z: -770, r: 18, name: 'the Scalettastrasse' };

export const ESCORT = {
  boardS: 4, // s at the station
  dropS: 3, // s at the door
  gateLimit: 8.9, // m/s (32 km/h): a security gate is passed at a walk: 30 km/h and a little grace
  gateRushed: 8, // composure a rushed gate costs
  gapGood: 45, // m to the first limousine: the formation holds up to here
  gapWarn: 70,
  gapLost: 260, // the convoy has lost sight of you: the mission fails
  crash: 12, // composure a crash costs
  contact: 6, // composure touching your own convoy costs
  stopAfter: 5, // s standing still until it costs composure
  stopRate: 1.5, // composure a second
  noRadio: 10, // composure taking the turn without radioing it in costs
  blocked: 15, // composure hitting the roadblock costs
  parS: 240, // s from the pick-up to the door: the schedule, ~10 m/s with the gates
  timePenalty: 8 // points a second behind schedule
};

export function createEscort() {
  const trail = createTrail(ESCORT_SEED);
  const L = trailLength(trail);
  const slot = (s, vmax, gap) => {
    const f = createFollower(s, { vmax, gap });
    trailAt(trail, s, f);
    return f;
  };
  return {
    trail,
    // three limousines and the chase car, parked nose to tail on the lane in front of the station
    convoy: [slot(L - 8, 15.5, 11), slot(L - 17, 15.5, 8), slot(L - 26, 15.5, 8), slot(L - 35, 16, 9)],
    boarded: false, boardT: 0, dropT: 0, arrived: false, leadS: L,
    gap: 0, composure: 100, crashes: 0, contacts: 0, rushed: 0, formT: 0, escortT: 0, stoppedT: 0,
    radioed: false, radioAt: -1, unannounced: false, blockHits: 0, routeS: 0, routeD: 0,
    t: 0, prevSpeed: 0, hitCooldown: 0, contactCooldown: 0, gateSeen: {}, last: null, lastAt: -1e9, lost: false
  };
}

const _proj = { s: 0, d: 0 };
/** A crash: the car lost speed faster than any brake could */
export const isCrash = (prev, speed, dt) => Math.abs(prev) > 3 && Math.abs(prev) - Math.abs(speed) > Math.max(1.6, 16 * dt);

/** Composure lost, with a word for the HUD */
function lose(st, points, what, ctx) {
  st.composure = Math.max(0, st.composure - points);
  if (what) { st.last = what; st.lastAt = ctx.t; }
}

/** The leader's arc length on its trail: the trail's end and the bit since its last point */
function leaderS(trail, x, z) {
  const n = trail.xs.length - 1;
  return trail.ss[n] + Math.min(trail.step, Math.hypot(x - trail.xs[n], z - trail.zs[n]));
}

/** A frame of the escort: the trail, the convoy, the gap, the composure */
export function escortStep(st, ctx) {
  const dt = ctx.dt;
  st.t = ctx.t;
  st.hitCooldown = Math.max(0, st.hitCooldown - dt);
  st.contactCooldown = Math.max(0, st.contactCooldown - dt);
  const speed = Math.abs(ctx.speed);
  if (!st.boarded) { st.prevSpeed = ctx.speed; st.gap = 0; return st; }
  trailPush(st.trail, ctx.x, ctx.z, st.convoy[0].s + 2);
  st.leadS = leaderS(st.trail, ctx.x, ctx.z);
  stepFollowers(st.convoy, st.leadS, st.trail, dt);
  st.gap = st.leadS - st.convoy[0].s;
  projectRoute(ESCORT_ROUTE, ctx.x, ctx.z, st.routeS, 40, 90, _proj);
  st.routeS = _proj.s; st.routeD = _proj.d;
  if (st.arrived) { st.prevSpeed = ctx.speed; return st; }
  st.escortT += dt;
  if (st.gap <= ESCORT.gapGood) st.formT += dt;
  if (isCrash(st.prevSpeed, ctx.speed, dt) && !st.hitCooldown) {
    st.crashes++;
    st.hitCooldown = 1.5;
    lose(st, ESCORT.crash, 'Crash! The delegation spills its coffee', ctx);
  }
  // touching your own convoy (backing up into it)
  for (const f of st.convoy) {
    if (!st.contactCooldown && dist2d(f, ctx) < 3.1 && f.v + speed > 0.5) {
      st.contacts++;
      st.contactCooldown = 2;
      lose(st, ESCORT.contact, 'Into your own convoy!', ctx);
    }
  }
  // standing about
  st.stoppedT = speed < 0.5 ? st.stoppedT + dt : 0;
  if (st.stoppedT > ESCORT.stopAfter) lose(st, ESCORT.stopRate * dt, null, ctx);
  st.prevSpeed = ctx.speed;
  if (st.gap > ESCORT.gapLost) st.lost = true;
  return st;
}

/** The roadblock: where (x, z) ends up pushed out of it, { x, z, hit } */
export function roadblockPush(x, z, b = ROADBLOCK) {
  const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz);
  if (d >= b.r) return { x, z, hit: false };
  if (d < 1e-3) return { x: b.x + b.r, z, hit: true };
  return { x: b.x + (dx / d) * b.r, z: b.z + (dz / d) * b.r, hit: true };
}

/** The car ran into the roadblock (js/missions-wef.js stops it there) */
export function escortBlocked(st, ctx) {
  if (st.hitCooldown) return;
  st.blockHits++;
  st.hitCooldown = 2;
  lose(st, ESCORT.blocked, 'The road is shut: the Scalettastrasse is the way round', ctx);
}

/** J: the detour radioed in */
export function escortRadio(st, ctx) {
  if (st.radioed || !st.boarded) return false;
  st.radioed = true;
  st.radioAt = ctx.t;
  st.last = 'Control: detour via the Scalettastrasse, the gates are told';
  st.lastAt = ctx.t;
  return true;
}

/** How far behind the schedule the convoy is, s (negative: ahead), at route arc length st.routeS */
export const escortDelay = (st) => st.escortT - (st.routeS / ESCORT_LENGTH) * ESCORT.parS;

export const cohesionShare = (st) => (st.escortT > 0 ? clamp(st.formT / st.escortT, 0, 1) : 0);

export function escortScore(st) {
  const time = st.arrived ? clamp(1000 - Math.max(0, st.escortT - ESCORT.parS) * ESCORT.timePenalty, 0, 1000) : 0;
  return Math.round(time + 1000 * cohesionShare(st) + 10 * st.composure);
}

const blueHint = (ctx) => (ctx.blueLight ? null : 'Blue light and siren: K (the traffic gives way)');
const failOf = (st) => (st.lost ? 'The motorcade has lost you: the delegation arrives by bus.' : st.composure <= 0 ? 'Composure gone: the delegation asks for another driver.' : null);

function gateObjective(gate) {
  const until = arcOf(ESCORT_ROUTE, gate);
  return {
    id: gate.id,
    title: gate.title,
    check(ctx, state) {
      const st = state.escort, d = dist2d(ctx, gate), inside = d <= gate.r;
      if (inside && !st.gateSeen[gate.id]) {
        st.gateSeen[gate.id] = true;
        if (Math.abs(ctx.speed) > ESCORT.gateLimit) { st.rushed++; lose(st, ESCORT.gateRushed, 'Too fast at the gate: 30 km/h at the barrier', ctx); }
        else { st.last = 'Gate open, the soldiers salute'; st.lastAt = ctx.t; }
      }
      const fail = failOf(st);
      const text = `${formatDistance(d)} to ${gate.name} · under 30 km/h`;
      const target = d < 130 ? { x: gate.x, z: gate.z, r: gate.r, style: 'hazard' } : routeAhead(ESCORT_ROUTE, st.routeS, 70, until);
      return { done: inside && !fail, progress: null, text, target, hint: blueHint(ctx), fail };
    }
  };
}

export const WEF_ESCORT_MISSION = {
  id: 'wef-escort',
  title: 'Escort at the WEF',
  intro: 'January, the World Economic Forum, and Davos is a fortress. You drive the police lead car of a fictional delegation. Fetch the three black limousines and the chase car at the Bahnhof Davos Dorf, then lead them along the Promenade and the Talstrasse to the Kongresszentrum. Blue light and siren (K) clear the traffic ahead. The convoy drives your trail: too fast and it breaks up, too slow and the schedule slips, a stop or a crash costs composure. At the security gates, under 30 km/h. Listen to the radio: J radios a detour. Score: time, cohesion, composure.',
  mode: 'car',
  season: 'winter',
  time: 'midday',
  scoreMode: true,
  features: ['policeCar', 'wefEscort'],
  medals: { gold: 2500, silver: 2000, bronze: 1400 },
  score: (state) => escortScore(state.escort),
  colour: '#27457a',
  icon: 'motorcade',
  finish: 'The delegation steps out at the Kongresszentrum and asks whether Davos always has this much snow. Well driven.',
  start: { ...ESCORT_START },
  props: [],
  createState() { return { escort: createEscort() }; },
  update(ctx, state) { escortStep(state.escort, ctx); },
  summary(state) {
    const s = state.escort;
    return [`Cohesion ${Math.round(100 * cohesionShare(s))} % · composure ${Math.round(s.composure)} · ${s.crashes} crashes · ${s.rushed} gates rushed`];
  },
  objectives: [
    {
      id: 'pickup',
      title: 'Pick up the delegation at the Bahnhof Davos Dorf',
      check(ctx, state) {
        const st = state.escort, d = dist2d(ctx, PICKUP);
        const here = d <= PICKUP.r && Math.abs(ctx.speed) < 0.5 && ctx.blueLight;
        st.boardT = here ? st.boardT + ctx.dt : Math.max(0, st.boardT - ctx.dt);
        const done = st.boardT >= ESCORT.boardS;
        if (done) st.boarded = true;
        const text = d > PICKUP.r ? `${formatDistance(d)} to ${PICKUP.name} · stop ahead of the limousines`
          : !ctx.blueLight ? 'Blue light on (K) for the delegation' : Math.abs(ctx.speed) >= 0.5 ? 'Stop here' : `The delegation is boarding … ${Math.ceil(ESCORT.boardS - st.boardT)} s`;
        return { done, progress: clamp(st.boardT / ESCORT.boardS, 0, 1), text, target: { x: PICKUP.x, z: PICKUP.z, r: PICKUP.r, style: 'pad' }, hint: blueHint(ctx) };
      }
    },
    gateObjective(WEF_GATES[0]),
    {
      id: 'radio',
      title: 'Radio the detour',
      check(ctx, state) {
        const st = state.escort, d = dist2d(ctx, DETOUR_TURN), at = d <= DETOUR_TURN.r;
        if (at && !st.radioed && !st.unannounced) {
          st.unannounced = true;
          lose(st, ESCORT.noRadio, 'Unannounced at the turn: the gates scramble', ctx);
        }
        const text = st.radioed ? `${formatDistance(d)} to ${DETOUR_TURN.name}` : 'Control: a snow blower has broken down at the Kongress. Radio the detour: J';
        const fail = failOf(st);
        return { done: at && !fail, progress: null, text, target: d < 130 ? { x: DETOUR_TURN.x, z: DETOUR_TURN.z, r: DETOUR_TURN.r, style: 'hazard' } : routeAhead(ESCORT_ROUTE, st.routeS, 70), hint: st.radioed ? blueHint(ctx) : 'Radio: J', fail };
      }
    },
    ...WEF_GATES.slice(1).map(gateObjective),
    {
      id: 'dropoff',
      title: 'Set the delegation down at the Kongresszentrum',
      check(ctx, state) {
        const st = state.escort, d = dist2d(ctx, DROPOFF);
        const here = d <= DROPOFF.r && Math.abs(ctx.speed) < 0.5;
        const closed = st.gap <= ESCORT.gapGood;
        st.dropT = here && closed ? st.dropT + ctx.dt : Math.max(0, st.dropT - ctx.dt);
        const done = st.dropT >= ESCORT.dropS;
        if (done) st.arrived = true;
        const fail = failOf(st);
        const text = d > DROPOFF.r ? `${formatDistance(d)} to ${DROPOFF.name}` : !closed ? 'Wait for the limousines' : Math.abs(ctx.speed) >= 0.5 ? 'Stop at the door' : `The door opens … ${Math.ceil(ESCORT.dropS - st.dropT)} s`;
        return { done: done && !fail, progress: clamp(st.dropT / ESCORT.dropS, 0, 1), text, target: { x: DROPOFF.x, z: DROPOFF.z, r: DROPOFF.r, style: 'pad' }, hint: blueHint(ctx), fail };
      }
    }
  ]
};

// =========================================================================================================================
// 2. The march
// (the registered route: the Promenade towards the Kongresszentrum, in its one-way direction, from the junction at the
// Salzgäbastrasse to the corner of the Scalettastrasse, some 45 m short of the security fence)
export const MARCH_ROUTE_PTS = [574, -1190, 553.1, -1071.4, 544.3, -1029, 533.9, -985.5, 515.2, -915.3, 501.9, -871.9, 491, -831.8, 485.4, -818.5, 479.5, -807.9, 471.1, -795.7, 462.4, -785.4, 447.5, -772.6];
export const MARCH_ROUTE = routeOf(MARCH_ROUTE_PTS);
export const MARCH_LENGTH = trailLength(MARCH_ROUTE);
// The way the crowd comes from: up the Promenade behind the start
export const MARCH_SEED = [590.8, -1277.8, 578.6, -1217.6, 574, -1190];
export const MARCH_START = { x: 574, z: -1190, heading: Math.atan2(553.1 - 574, -1071.4 + 1190) };
export const LIAISON = { x: 501.9, z: -871.9, r: 10, standX: 508.5, standZ: -874.4 };
export const RALLY = { x: 447.5, z: -772.6, r: 10, name: 'the rally point' };
export const FENCE = { x: 414, z: -744.4, r: 9 };
export const MARCH = {
  playerMax: 4.4, // m/s: nobody runs with a megaphone (the runtime holds the walker to it)
  crowdPace: 3, // m/s: the march's best pace, W held down outruns it
  startCount: 30, maxCount: 60, minCount: 10,
  gapGood: 22, // m ahead of the crowd: further and the crowd thins
  fastEvery: 4, // s: one marcher lost for this long too far ahead
  growEvery: 4, // hits in a row for one more marcher
  missStreak: 4, // misses in a row: one marcher gone
  routeOk: 9, // m off the route: still on it
  strayAt: 13, // m off the route for strayFor s, or near the fence: the liaison steps in
  strayFor: 2,
  warnings: 3, // ... a third time: the permit is folded up
  speechS: 5,
  stopS: 5, sitS: 12, sitGain: 4, backGoodwill: 100, stopGoodwill: 50
};
export const MARCH_SLOGANS = [
  ['What do we want?', 'Clean air!'],
  ['When do we want it?', 'Before the next ski season!'],
  ['Whose town is this?', 'Davos for the Davosers!'],
  ['Fair taxes!', 'For everyone, even the fondue!'],
  ['Snow for all!', 'Not just for helicopters!']
];
// A call of three beats, the crowd's answer in the next bar
const MARCH_SONG = Array.from({ length: 32 }, (_, i) => (i % 2 ? { name: 'Response', bars: 1, beats: [] } : { name: 'Call', bars: 1, beats: [1, 2, 3] }));
export const MARCH_RHYTHM = createRhythm(MARCH_SONG, { bpm: 84, countIn: 4, tail: (60 / 84) * 6 });

export function createMarch() {
  const trail = createTrail(MARCH_SEED);
  const L = trailLength(trail);
  const crowd = createFollower(L - 5, { vmax: MARCH.crowdPace, gap: 3, headway: 0.5, accel: 1.4, brake: 3, aLat: 6 });
  const tail = createFollower(L - 26, { vmax: MARCH.crowdPace + 1, gap: 9, headway: 0.3, accel: 1.4, brake: 4 });
  trailAt(trail, crowd.s, crowd);
  trailAt(trail, tail.s, tail);
  return {
    trail, crowd, tail, leadS: L, count: MARCH.startCount, morale: 70,
    game: createHeadbang(MARCH_RHYTHM), songT: 0, hits: 0, perfect: 0, good: 0, miss: 0, stray: 0, prevMiss: 0, missRun: 0, growRun: 0, lastHit: null, lastHitAt: -1e9,
    gap: 0, fastT: 0, routeS: 0, routeD: 0, onT: 0, totalT: 0, strayT: 0, warnings: 0, cooldown: 0, goodwill: 0,
    dialog: null, action: null, liaisonDone: false, speechT: 0, arrived: false, permit: false, dissolved: false, t: 0, grown: 0, lost: 0, say: null, sayAt: -1e9
  };
}

const say = (st, text, ctx) => { st.say = text; st.sayAt = ctx.t; };
/** The number of marchers changes */
function gainMarchers(st, n, ctx, why) {
  const before = st.count;
  st.count = clamp(st.count + n, 0, MARCH.maxCount);
  if (n > 0) st.grown += st.count - before; else st.lost += before - st.count;
  if (why && st.count !== before) say(st, why, ctx);
}

/** The chant's share in the score, 0..1 */
export function chantQuality(st) {
  const total = st.perfect + st.good + st.miss;
  return total ? clamp((st.perfect + 0.8 * st.good) / total, 0, 1) : 0;
}
/** On the route's share, 0..1 */
export const routeShare = (st) => (st.totalT > 0 ? clamp(st.onT / st.totalT, 0, 1) : 1);

/** The call: Space or the button, on the beat */
export function marchCall(st, ctx = { t: 0 }, since = 0) {
  if (st.dialog) return null;
  const r = headbangTap(st.game, st.songT + since); // (since: s since the last frame, a tap between two frames)
  if (r.grade === 'perfect' || r.grade === 'good') {
    st[r.grade]++;
    st.hits++;
    st.missRun = 0;
    st.growRun++;
    st.morale = clamp(st.morale + (r.grade === 'perfect' ? 3 : 2), 0, 100);
    if (st.growRun >= MARCH.growEvery) { st.growRun = 0; gainMarchers(st, 1, ctx, 'A bystander joins the march'); }
    st.lastHit = r.grade; st.lastHitAt = ctx.t;
  } else {
    st.stray++;
    st.growRun = 0;
    st.lastHit = 'off'; st.lastHitAt = ctx.t;
  }
  return r;
}

function openDialog(st, reason, ctx) {
  st.dialog = { reason };
  st.warnings += reason === 'stray' ? 1 : 0;
  st.strayT = 0;
  say(st, reason === 'stray' ? 'Liaison: off the registered route, please' : 'Liaison: a word, please, the crowd wants to go on to the fence', ctx);
}

/** The calm answers to the police liaison: 'stop' | 'sit' | 'back' */
export function marchChoose(st, choice, ctx = { t: 0 }) {
  if (!st.dialog || !['stop', 'sit', 'back'].includes(choice)) return false;
  const reason = st.dialog.reason;
  st.dialog = null;
  if (choice === 'stop') st.action = { kind: 'stop', left: MARCH.stopS, reason };
  else if (choice === 'sit') st.action = { kind: 'sit', left: MARCH.sitS, reason };
  else {
    // back to the agreed route: a little behind where the march is, on the route itself
    const to = routeAhead(MARCH_ROUTE, Math.max(0, st.routeS - 12), 0);
    st.action = { kind: 'back', x: to.x, z: to.z, reason };
  }
  say(st, choice === 'stop' ? 'Everybody stops. Liaison: much obliged' : choice === 'sit' ? 'A sit-in, in the snow. Somebody hands round tea' : 'Back to the agreed route. Liaison: very civil of you', ctx);
  return true;
}

function endAction(st, ctx) {
  const a = st.action;
  st.action = null;
  st.cooldown = 8;
  if (a.reason === 'liaison') st.liaisonDone = true;
  if (a.kind === 'sit') gainMarchers(st, MARCH.sitGain, ctx, 'The sit-in made the evening news: more people come');
  else {
    st.goodwill += a.kind === 'back' ? MARCH.backGoodwill : MARCH.stopGoodwill;
    say(st, 'Liaison: thank you, carry on to the rally point', ctx);
  }
}

/** A frame of the march */
export function marchStep(st, ctx) {
  const dt = ctx.dt;
  st.t = ctx.t;
  st.cooldown = Math.max(0, st.cooldown - dt);
  const held = !!st.dialog || !!(st.action && st.action.kind !== 'back');
  // the chant: its clock stands still while you talk to the liaison; it loops over the march
  if (!st.dialog && ctx.t > 0) {
    st.songT += dt;
    headbangAdvance(st.game, st.songT);
    const missed = st.game.miss - st.prevMiss;
    if (missed > 0) {
      st.miss += missed;
      st.morale = clamp(st.morale - 4 * missed, 0, 100);
      st.growRun = 0;
      st.missRun += missed;
      if (st.missRun >= MARCH.missStreak) { st.missRun = 0; gainMarchers(st, -1, ctx, 'The chant falters: somebody goes for a hot chocolate'); }
    }
    st.prevMiss = st.game.miss;
    if (st.game.done) { st.game = createHeadbang(MARCH_RHYTHM); st.songT = 0; st.prevMiss = 0; }
  }
  // the trail and the crowd behind it
  trailPush(st.trail, ctx.x, ctx.z, st.crowd.s + 2);
  st.leadS = leaderS(st.trail, ctx.x, ctx.z);
  if (held) { st.crowd.v = Math.max(0, st.crowd.v - 3 * dt); st.crowd.s += st.crowd.v * dt; trailAt(st.trail, st.crowd.s, st.crowd); }
  else stepFollowers([st.crowd], st.leadS, st.trail, dt);
  // (the liaison's car at the tail of the march, as far behind as the crowd is long)
  st.tail.gap = 9 + Math.ceil(st.count / 5) * 1.5;
  stepFollowers([st.tail], st.crowd.s, st.trail, dt);
  st.gap = st.leadS - st.crowd.s;
  // the route
  projectRoute(MARCH_ROUTE, ctx.x, ctx.z, st.routeS, 30, 60, _proj);
  st.routeS = _proj.s; st.routeD = _proj.d;
  if (st.arrived) return st;
  st.totalT += dt;
  if (st.routeD <= MARCH.routeOk) st.onT += dt;
  // too far ahead of them
  if (!held && st.gap > MARCH.gapGood) {
    st.fastT += dt;
    st.morale = clamp(st.morale - 2 * dt, 0, 100);
    if (st.fastT >= MARCH.fastEvery) { st.fastT = 0; gainMarchers(st, -1, ctx, 'Too fast: the crowd cannot keep up, and somebody stays behind'); }
  } else st.fastT = 0;
  if (st.morale <= 0) { st.morale = 20; gainMarchers(st, -1, ctx, 'Morale is low: people drift off'); }
  if (st.count < MARCH.minCount) st.dissolved = true;
  // the answers to the liaison run their course
  if (st.action) {
    const a = st.action;
    if (a.kind === 'back') { if (Math.hypot(ctx.x - a.x, ctx.z - a.z) < 5) endAction(st, ctx); }
    else if (Math.abs(ctx.speed) < 0.5) { a.left -= dt; if (a.left <= 0) endAction(st, ctx); }
    return st;
  }
  // straying off the route, or on to the fence
  if (!st.dialog && !st.cooldown) {
    const off = st.routeD > MARCH.strayAt;
    st.strayT = off ? st.strayT + dt : 0;
    if (st.strayT >= MARCH.strayFor) {
      if (st.warnings + 1 >= MARCH.warnings) st.permit = true;
      else openDialog(st, 'stray', ctx);
    }
  }
  if (dist2d(ctx, FENCE) < FENCE.r) st.permit = true;
  return st;
}

export function marchScore(st) {
  const size = st.count * 15;
  const chant = chantQuality(st) * 800;
  const route = routeShare(st) * 500;
  const rally = st.arrived ? 300 : 0;
  return Math.round(size + chant + route + rally + st.goodwill);
}

const marchFail = (st) => (st.permit ? 'The liaison politely folds up your permit: the march ends here, and everybody goes for a coffee.' : st.dissolved ? 'The march has melted away into the Konditorei. The cake is said to be excellent.' : null);
const marchHint = (st) => (st.action ? null : st.gap > MARCH.gapGood ? 'Too fast: wait for the crowd' : 'Space on the beat: call, and the crowd answers');
const marchText = (st, text) => {
  if (st.dialog) return 'The police liaison wants a word';
  if (st.action?.kind === 'stop') return `Everybody stands still … ${Math.ceil(st.action.left)} s`;
  if (st.action?.kind === 'sit') return `Sit-in … ${Math.ceil(st.action.left)} s`;
  if (st.action?.kind === 'back') return 'Back to the agreed route';
  return text;
};

const LIAISON_ARC = arcOf(MARCH_ROUTE, LIAISON);
const WP1_ARC = LIAISON_ARC * 0.55;
export const MARCH_WP1 = (() => { const p = routeAhead(MARCH_ROUTE, WP1_ARC, 0); return { x: p.x, z: p.z, r: 10 }; })();

export const ANTI_WEF_MISSION = {
  id: 'anti-wef-demo',
  title: 'Lead the anti-WEF march',
  intro: 'The Forum is in town, and so is the registered counter-march. Megaphone in hand, you walk at the head of it down the Promenade: thirty people, three placards and a thermos. Call on the beat (Space or the button), the crowd answers: good chants bring bystanders along, a lost beat or walking away from them (W held down outruns them) sends them off for hot chocolate. Stay on the registered route and talk calmly to the police liaison. The rally point lies short of the fence. Score: the crowd, the chant, the route and the rally.',
  mode: 'person',
  season: 'winter',
  time: 'midday',
  scoreMode: true,
  features: ['wefMarch'],
  medals: { gold: 2100, silver: 1650, bronze: 1100 },
  score: (state) => marchScore(state.march),
  colour: '#d4552e',
  icon: 'megaphone',
  finish: 'The speeches are short, the tea is hot, and the liaison asks for a placard for the station wall. Nobody was hurt, nothing was broken, and the snow stayed white.',
  start: { ...MARCH_START },
  props: [
    { id: 'liaison', type: 'helper', x: LIAISON.standX, z: LIAISON.standZ, face: { x: LIAISON.x, z: LIAISON.z } },
    { id: 'liaison-car', type: 'policeCar', x: LIAISON.standX + 3.5, z: LIAISON.standZ - 7, heading: 2.85, blueLight: true }
  ],
  createState() { return { march: createMarch() }; },
  update(ctx, state) { marchStep(state.march, ctx); },
  summary(state) {
    const s = state.march;
    return [`${s.count} marchers · chant ${Math.round(chantQuality(s) * 100)} % · on the route ${Math.round(routeShare(s) * 100)} % · goodwill ${s.goodwill}`];
  },
  objectives: [
    {
      id: 'march',
      title: 'March down the Promenade',
      check(ctx, state) {
        const st = state.march, d = dist2d(ctx, MARCH_WP1), fail = marchFail(st);
        return { done: d <= MARCH_WP1.r && !fail, progress: clamp(st.routeS / WP1_ARC, 0, 1), text: marchText(st, `${st.count} marchers · ${formatDistance(d)} on the Promenade`), target: routeAhead(MARCH_ROUTE, st.routeS, 30, WP1_ARC), hint: marchHint(st), fail };
      }
    },
    {
      id: 'liaison',
      title: 'Talk to the police liaison',
      check(ctx, state) {
        const st = state.march, d = dist2d(ctx, LIAISON), fail = marchFail(st);
        if (d <= LIAISON.r && !st.dialog && !st.action && !st.liaisonDone) openDialog(st, 'liaison', ctx);
        return { done: st.liaisonDone && !fail, progress: null, text: marchText(st, `${st.count} marchers · ${formatDistance(d)} to the police liaison`), target: { x: LIAISON.x, z: LIAISON.z, r: LIAISON.r, style: 'hazard' }, hint: marchHint(st), fail };
      }
    },
    {
      id: 'rally',
      title: 'On to the rally point',
      check(ctx, state) {
        const st = state.march, d = dist2d(ctx, RALLY), fail = marchFail(st);
        return { done: d <= RALLY.r && !fail, progress: null, text: marchText(st, `${st.count} marchers · ${formatDistance(d)} to ${RALLY.name}`), target: d < 60 ? { x: RALLY.x, z: RALLY.z, r: RALLY.r, style: 'pad' } : routeAhead(MARCH_ROUTE, st.routeS, 30), hint: marchHint(st), fail };
      }
    },
    {
      id: 'speech',
      title: 'Hold the rally',
      check(ctx, state) {
        const st = state.march, here = dist2d(ctx, RALLY) <= RALLY.r + 4 && Math.abs(ctx.speed) < 0.5, fail = marchFail(st);
        const closed = st.gap <= MARCH.gapGood;
        st.speechT = here && closed ? st.speechT + ctx.dt : Math.max(0, st.speechT - ctx.dt * 0.5);
        const done = st.speechT >= MARCH.speechS && !fail;
        if (done) st.arrived = true;
        const text = !here ? 'Stand on the rally point' : !closed ? 'Wait for the crowd' : `The closing speech … ${Math.ceil(MARCH.speechS - st.speechT)} s`;
        return { done, progress: clamp(st.speechT / MARCH.speechS, 0, 1), text: marchText(st, text), target: { x: RALLY.x, z: RALLY.z, r: RALLY.r, style: 'pad' }, hint: marchHint(st), fail };
      }
    }
  ]
};

export const WEF_MISSIONS = [WEF_ESCORT_MISSION, ANTI_WEF_MISSION];
