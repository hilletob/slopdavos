// js/missions-data-pfadi.js
// Pfadi Davos: a Spatz and a campfire in the Mattawald (js/missions-data.js spreads PFADI_MISSIONS into MISSIONS;
// js/missions-pfadi.js has the runtime: the trail signs, the tent, the firewood, the fireplace, the flint and steel, the
// fire). No three.js and no DOM in here (tests/missions-pfadi.test.mjs plays it with a bot).
//
//   pfadi-spatz  Summer, evening. From the Pfadiheim Davos (Eisbahnstrasse 5, Davos Platz; OSM w116881199, the house of the
//                Pfadi Battasendas Davos) on foot to the Mattawald, the forest across the Landwasser at the foot of the
//                slope south-east of Davos Platz (swisstopo: Gebiet "Mattawald", LV95 2783296 / 1185328). The way follows
//                the town's footways and streets (the shortest walk over OSM's lines, 1.5 km): along the Talstrasse, over
//                the Hertistrasse and the Mattastrasse to the Landwasser, and on the forest path along the foot of the
//                Mattawald to a level spot inside the wood (P. ~1560 m, LV95 2783340 / 1185732, slope ~5°). Pfadi trail
//                signs (Wegzeichen: sticks laid as an arrow) mark the way. ASSUMPTION: the camp spot itself is invented, a
//                plausible flat piece of the Mattawald by its path; no Pfadi Lagerplatz is on record there.
//
// The steps:
//   1. the walk: to the camp spot (any way: the target runs ~35 m ahead along the trail signs).
//   2. the Spatz, the Swiss scouts' ridge tent of buttoned cotton tarps (Zeltblachen, six for a group's Spatz: 3.8 × 3.4 m, 2.3 m high) on two wooden poles: hold
//      Space at the tent spot through five steps (lay out the six tarps, button them together, set up the poles and the
//      ridge, peg the edges, tension the guy lines). Let go and the step's progress runs back.
//   3. the firewood: eight pieces round the camp (dry twigs, kindling, logs), each picked up with Space held a moment.
//   4. the fireplace: hold Space at the fire spot (the ring of stones, the tinder nest, the kindling as a tipi, the logs).
//   5. the flint and steel (Feuerstein und Feuerstahl): the needle swings across the gauge; press Space while it is in the
//      green and the sparks land in the tinder (three make an ember; the ember fades slowly between strikes).
//   6. the breath: hold Space to blow the ember into a flame; after a long breath you have to let go and breathe in. The
//      glow full, the kindling catches and the fire grows by itself.
// Judged by time. The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z).

import { PFADIHEIM_START } from './pfadiheim-data.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);

// --- The places ------------------------------------------------------------------------------------------------------
export const PFADI_PLACES = {
  heim: { x: -316.4, z: -298.3 }, // the Pfadiheim Davos (its footprint's middle)
  start: { x: PFADIHEIM_START.x, z: PFADIHEIM_START.z }, // on the forecourt before its entrance (js/pfadiheim-data.js)
  mattawald: { x: 796.5, z: 172.4 }, // swisstopo's name of the area (on the slope)
  camp: { x: 840, z: -232 }, // the camp spot in the forest, 10 m off the path
  tent: { x: 835.6, z: -234.2 }, // the Spatz's middle
  fire: { x: 842.6, z: -229.4 } // the fireplace, 8 m in front of its door
};

// The way: the start, the town's footways and streets, the path along the foot of the Mattawald, the camp
// (the shortest walk over the OSM lines, simplified to 2.5 m)
export const PFADI_ROUTE = [
  PFADI_PLACES.start.x, PFADI_PLACES.start.z, -298.2, -287.8, -233.9, -251.5, -216.1, -273.8, -143.7, -221.1, -80.8, -287.2, -61.6, -300.6, 275.5, -493.8, 359.9, -433.4, 376.2, -416.9, 399.4, -346,
  403.3, -282, 424.7, -237.4, 488.8, -263.5, 500.2, -230.7, 497.9, -217, 506.7, -186.3, 534.1, -160.4, 542.4, -160.3, 595.5, -206.2, 637.3, -227.7,
  660.5, -234, 699.5, -226.6, 750.4, -231.6, 771.8, -218.3, 843.3, -221.9, 840, -232
];

export const PFADI = {
  walkSpeed: 8.2, // m/s: the pedestrian's top speed (js/controllers.js updatePerson)
  campRadius: 9, // m round the camp spot: arrived
  ahead: 35, // m: the walk's target runs this far ahead along the way
  tentReach: 5.5, // m from the tent's middle: working on it
  fireReach: 2.6, // m from the fireplace
  // the Spatz: its ridge's heading (the door at its front end, towards the fireplace), the ridge's length and height, the
  // half width at the ground (m)
  tent: { yaw: Math.atan2(PFADI_PLACES.fire.x - PFADI_PLACES.tent.x, PFADI_PLACES.fire.z - PFADI_PLACES.tent.z), length: 3.8, height: 2.3, half: 1.7 }, // (a group's Spatz of six Blachen)
  tentSteps: [
    { id: 'lay', label: 'Lay out the six tarps', hold: 1.6 },
    { id: 'button', label: 'Button the tarps together', hold: 1.8 },
    { id: 'poles', label: 'Set up the poles and the ridge', hold: 1.5 },
    { id: 'pegs', label: 'Peg the edges', hold: 1.6 },
    { id: 'guys', label: 'Tension the guy lines', hold: 1.2 }
  ],
  wood: {
    reach: 1.8, pickS: 0.35,
    // (placed once by a seeded draw round the camp, 9-23 m out, on ground no steeper than 16°)
    items: [
      { kind: 'twigs', x: 822.1, z: -238.1 }, { kind: 'twigs', x: 821.6, z: -226 }, { kind: 'twigs', x: 833.8, z: -244 },
      { kind: 'kindling', x: 838.8, z: -250 }, { kind: 'kindling', x: 827.7, z: -242.9 },
      { kind: 'log', x: 853.1, z: -232.9 }, { kind: 'log', x: 855.9, z: -225.3 }, { kind: 'log', x: 850.6, z: -246.5 }
    ]
  },
  ringSteps: [
    { id: 'stones', label: 'Lay the stones in a ring', hold: 1.4 },
    { id: 'tinder', label: 'Tinder nest in the middle', hold: 0.8 },
    { id: 'kindling', label: 'Kindling as a tipi', hold: 1.0 },
    { id: 'logs', label: 'Logs round it', hold: 1.0 }
  ],
  // flint and steel: the needle sweeps 0 → 1 → 0 in `period` s; a strike in [lo, hi] throws its sparks into the tinder
  strike: { period: 1.3, lo: 0.64, hi: 0.82, cooldown: 0.3, need: 3, ember: 0.36, fade: 0.04 },
  // the breath: holding blows (`rate` of glow a second) for `breath` s at most, then let go to breathe in (`recover`× as fast)
  blow: { glow: 0.2, rate: 0.35, breath: 2.0, recover: 1.6, fade: 0.1 }, // (one breath is not enough: let go once)
  catchS: 2.4, // s from the flame catching to the fire burning
  marks: { spacing: 60, first: 25 }, // the trail signs along the way
  timeLimitMs: 15 * 60 * 1000
};
export const WOOD_NAMES = { twigs: 'dry twigs', kindling: 'kindling', log: 'a log' };
export const WOOD_NEED = { twigs: 3, kindling: 2, log: 3 };

// --- The way ---------------------------------------------------------------------------------------------------------
const cumOf = (pts) => { const c = [0]; for (let i = 2; i < pts.length; i += 2) c.push(c[c.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])); return c; };
const ROUTE_CUM = cumOf(PFADI_ROUTE);
export const ROUTE_LENGTH = ROUTE_CUM[ROUTE_CUM.length - 1];
/** The point `s` m along the way, its heading */
export function routePoint(s, out = {}) {
  const P = PFADI_ROUTE, C = ROUTE_CUM, n = C.length - 1;
  s = clamp(s, 0, C[n]);
  let i = 1;
  while (i < n && C[i] < s) i++;
  const f = (s - C[i - 1]) / ((C[i] - C[i - 1]) || 1);
  const ax = P[i * 2 - 2], az = P[i * 2 - 1], bx = P[i * 2], bz = P[i * 2 + 1];
  out.x = ax + (bx - ax) * f; out.z = az + (bz - az) * f; out.heading = Math.atan2(bx - ax, bz - az); out.s = s;
  return out;
}
/** How far along the way (x, z) is: the nearest point of the way, never more than `from`+300 m on (no skipping by a
 *  loop of the way passing near) */
export function routeProgress(x, z, from = 0) {
  const P = PFADI_ROUTE, C = ROUTE_CUM;
  let best = Infinity, bs = from;
  for (let i = 2; i < P.length; i += 2) {
    const k = i / 2;
    if (C[k - 1] > from + 300) break;
    const ax = P[i - 2], az = P[i - 1], dx = P[i] - ax, dz = P[i + 1] - az, L2 = dx * dx + dz * dz || 1;
    const f = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const d = Math.hypot(ax + dx * f - x, az + dz * f - z);
    if (d < best) { best = d; bs = C[k - 1] + f * (C[k] - C[k - 1]); }
  }
  return { s: Math.max(from, bs), off: best };
}
/** The trail signs: [{ x, z, heading, s }] every `spacing` m along the way (not in the camp) */
export function trailMarks(M = PFADI.marks) {
  const out = [];
  for (let s = M.first; s < ROUTE_LENGTH - 20; s += M.spacing) { const p = routePoint(s); out.push({ x: p.x, z: p.z, heading: p.heading, s }); }
  return out;
}

// --- Steps held with Space (the tent, the fireplace) ----------------------------------------------------------------
export const createSteps = () => ({ step: 0, t: 0, done: false });
/** Holding fills the step; let go and it runs back twice as fast. Returns the step just finished, or null */
export function stepSteps(st, holding, dt, steps) {
  if (st.done) return null;
  const s = steps[st.step];
  st.t = holding ? st.t + dt : Math.max(0, st.t - 2 * dt);
  if (st.t < s.hold) return null;
  st.step++; st.t = 0;
  if (st.step >= steps.length) st.done = true;
  return s;
}
/** The steps as one share (0-1) */
export function stepsShare(st, steps) {
  if (st.done) return 1;
  const total = steps.reduce((a, s) => a + s.hold, 0);
  return (steps.slice(0, st.step).reduce((a, s) => a + s.hold, 0) + Math.min(st.t, steps[st.step].hold)) / total;
}
/** Where a step stands: { step, f (0-1 of it) } (done: past the last) */
export const stepPhase = (st, steps) => (st.done ? { step: steps.length, f: 1 } : { step: st.step, f: clamp(st.t / steps[st.step].hold, 0, 1) });

// --- The firewood ----------------------------------------------------------------------------------------------------
export const createWood = (W = PFADI.wood) => W.items.map((w, i) => ({ i, ...w, picked: false }));
export function nearestWood(items, x, z, reach = Infinity) {
  let best = null, bd = reach;
  for (const w of items) {
    if (w.picked) continue;
    const d = Math.hypot(w.x - x, w.z - z);
    if (d < bd) { bd = d; best = w; }
  }
  return best;
}
export const woodCount = (items) => {
  const c = { twigs: 0, kindling: 0, log: 0, all: 0 };
  for (const w of items) if (w.picked) { c[w.kind]++; c.all++; }
  return c;
};

// --- Flint and steel, the breath, the fire ---------------------------------------------------------------------------
/** The gauge's needle at time t (s): 0 → 1 → 0 every `period` s */
export function needle(t, S = PFADI.strike) {
  const u = (t / S.period) % 1;
  return u < 0.5 ? 2 * u : 2 - 2 * u;
}
export const createFlint = () => ({ t: 0, cool: 0, good: 0, misses: 0, ember: 0, lit: false });
/**
 * One frame of the flint and steel: the needle runs, the ember fades; `press` strikes. Returns 'good' | 'miss' | null
 * (good: its sparks into the tinder; the ember lit at `need` good strikes close together)
 */
export function stepFlint(f, press, dt, S = PFADI.strike) {
  if (f.lit) return null;
  f.t += dt;
  f.cool = Math.max(0, f.cool - dt);
  f.ember = Math.max(0, f.ember - S.fade * dt);
  if (!press || f.cool > 0) return null;
  f.cool = S.cooldown;
  const n = needle(f.t, S);
  if (n < S.lo || n > S.hi) { f.misses++; return 'miss'; }
  f.good++;
  f.ember = Math.min(1, f.ember + S.ember);
  if (f.ember >= 0.98) { f.ember = 1; f.lit = true; }
  return 'good';
}
export const createBlow = () => ({ glow: PFADI.blow.glow, breath: PFADI.blow.breath, out: false, blowing: false, fire: 0, caught: false });
/** One frame of the breath: blowing (held) feeds the glow while there is breath; the glow full, the flame catches and the
 *  fire grows to 1 by itself. Returns 'caught' on the frame it catches, 'out' when the breath runs out, else null */
export function stepBlow(b, holding, dt, B = PFADI.blow, catchS = PFADI.catchS) {
  let ev = null;
  if (b.caught) { b.fire = Math.min(1, b.fire + dt / catchS); b.blowing = false; return null; }
  if (b.out && !holding) b.out = false;
  b.blowing = holding && !b.out && b.breath > 0;
  if (b.blowing) {
    b.breath = Math.max(0, b.breath - dt);
    b.glow = Math.min(1, b.glow + B.rate * dt);
    if (b.breath <= 0) { b.out = true; ev = 'out'; }
  } else {
    b.breath = Math.min(B.breath, b.breath + B.recover * dt);
    b.glow = Math.max(0.15, b.glow - B.fade * dt);
  }
  if (b.glow >= 1) { b.caught = true; b.fire = 0.15; ev = 'caught'; }
  return ev;
}

// --- The camp, one frame -----------------------------------------------------------------------------------------------
/** Which step the run is in (the objectives in order) */
export const PFADI_STEPS = ['walk', 'tent', 'wood', 'ring', 'spark', 'blow'];
/**
 * One frame of the camp's work for the step `step`: input { x, z, hold (Space held), press (Space pressed this frame) }.
 * Returns the events for the runtime: [{ type: 'step' | 'picked' | 'strike' | 'lit' | 'out' | 'caught', … }]
 */
export function stepCamp(state, step, input, dt, P = PFADI) {
  const ev = [];
  const { x, z, hold, press } = input;
  const dTent = Math.hypot(x - PFADI_PLACES.tent.x, z - PFADI_PLACES.tent.z);
  const dFire = Math.hypot(x - PFADI_PLACES.fire.x, z - PFADI_PLACES.fire.z);
  state.nearTent = dTent <= P.tentReach;
  state.nearFire = dFire <= P.fireReach;
  if (step === 'walk') state.routeS = routeProgress(x, z, state.routeS).s;
  else if (step === 'tent') {
    const done = stepSteps(state.tent, hold && state.nearTent, dt, P.tentSteps);
    if (done) ev.push({ type: 'step', id: done.id, last: state.tent.done });
  } else if (step === 'wood') {
    const w = nearestWood(state.wood, x, z, P.wood.reach);
    if (!hold || !w) state.picking = null;
    else {
      if (state.picking?.item !== w.i) state.picking = { item: w.i, t: 0 };
      state.picking.t += dt;
      if (state.picking.t >= P.wood.pickS) { w.picked = true; state.picking = null; ev.push({ type: 'picked', kind: w.kind, i: w.i }); }
    }
  } else if (step === 'ring') {
    const done = stepSteps(state.ring, hold && state.nearFire, dt, P.ringSteps);
    if (done) ev.push({ type: 'step', id: done.id, last: state.ring.done });
  } else if (step === 'spark') {
    const r = stepFlint(state.flint, press && state.nearFire, dt, P.strike);
    if (r) ev.push({ type: 'strike', good: r === 'good' });
    if (r && state.flint.lit) ev.push({ type: 'lit' });
  } else if (step === 'blow') {
    const r = stepBlow(state.blow, hold && state.nearFire, dt, P.blow, P.catchS);
    if (r) ev.push({ type: r });
  }
  return ev;
}

// --- A bot (the tests, the medal times) --------------------------------------------------------------------------------
/** The bot's wish this frame: { to: { x, z } | null (walk there), hold, press } */
export function campBot(state, step, me, P = PFADI) {
  const at = (p, r) => Math.hypot(me.x - p.x, me.z - p.z) <= r;
  if (step === 'walk') { const p = routePoint(state.routeS + 12); return { to: p, hold: false, press: false }; }
  if (step === 'tent') return at(PFADI_PLACES.tent, P.tentReach - 0.5) ? { to: null, hold: true, press: false } : { to: PFADI_PLACES.tent, hold: false, press: false };
  if (step === 'wood') {
    const w = nearestWood(state.wood, me.x, me.z);
    if (!w) return { to: null, hold: false, press: false };
    return at(w, P.wood.reach - 0.4) ? { to: null, hold: true, press: false } : { to: w, hold: false, press: false };
  }
  if (!at(PFADI_PLACES.fire, P.fireReach - 0.5)) return { to: PFADI_PLACES.fire, hold: false, press: false };
  if (step === 'ring') return { to: null, hold: true, press: false };
  if (step === 'spark') { const n = needle(state.flint.t, P.strike); return { to: null, hold: false, press: n > P.strike.lo + 0.03 && n < P.strike.hi - 0.03 }; }
  return { to: null, hold: !state.blow.out && state.blow.breath > 0.1, press: false };
}

// =====================================================================================================================
const ID = 'pfadi-spatz';
const near = (ctx, p, r) => Math.hypot(ctx.x - p.x, ctx.z - p.z) <= r;
const toPlace = (ctx, p) => fmtDist(Math.hypot(ctx.x - p.x, ctx.z - p.z));

export const PFADI_MISSION = {
  id: ID,
  title: 'Pfadi Davos: Spatz and campfire',
  intro: 'Evening at the Pfadiheim Davos on the Eisbahnstrasse, and tonight the Pfadi Davos sleep out. Walk to the Mattawald, the forest across the Landwasser: follow the trail signs, sticks laid as arrows. At the camp spot pitch the Spatz, the scouts\' group tent of six cotton tarps: hold Space at the tent spot to lay out the tarps, button them together, set up the two wooden poles, peg the edges and tension the guy lines. Let go and the step slips back. Then gather firewood round the camp (dry twigs, kindling and logs: hold Space to pick each one up), build the fireplace (hold Space: the ring of stones, the tinder nest, the kindling as a tipi, the logs) and light it the old way, with flint and steel: press Space when the needle is in the green, and three good strikes give an ember in the tinder. Then hold Space to blow it into a flame, and let go now and then to breathe in. When the tent stands and the fire burns, you are done.',
  mode: 'person',
  season: 'summer',
  time: 'golden', // (the low evening sun through the spruces; a summer's dusk alone would open the pin too rarely)
  features: ['pfadi'],
  props: [],
  colour: '#e55447',
  icon: 'tent',
  logo: './assets/pfadi/pfadi-davos-logo.svg',
  // (tests/missions-pfadi.test.mjs: the bot walks the way at the pedestrian's top speed and does each step at once: ~3:37;
  // gold a little above it, a real walk round the corners and a strike or two missed)
  bonusMs: 230000,
  medals: { gold: 230000, silver: 310000, bronze: 460000 },
  timeLimitMs: PFADI.timeLimitMs,
  finish: 'The Spatz stands taut between the spruces of the Mattawald, the fire crackles, and the first cervelats are on their sticks. Allzeit bereit!',
  start: { x: PFADI_PLACES.start.x, z: PFADI_PLACES.start.z, heading: PFADIHEIM_START.heading }, // (looking at the Pfadiheim's door)
  pin: { x: PFADI_PLACES.start.x, z: PFADI_PLACES.start.z },
  createState() {
    return {
      routeS: 0, tent: createSteps(), wood: createWood(), picking: null, ring: createSteps(), flint: createFlint(), blow: createBlow(),
      nearTent: false, nearFire: false, penaltyMs: 0
    };
  },
  summary(state) {
    const f = state.flint;
    return [`${f.good} good strike${f.good === 1 ? '' : 's'} · ${f.misses} missed the steel`];
  },
  objectives: [
    {
      id: 'walk',
      title: 'Follow the trail signs to the Mattawald',
      check(ctx, state) {
        if (ctx.t > PFADI.timeLimitMs) return { done: false, fail: 'It is dark in the Mattawald, and the others have pitched their tents without you.', text: '', progress: null, target: null, hint: null };
        const C = PFADI_PLACES.camp;
        const left = Math.max(ROUTE_LENGTH - state.routeS, Math.hypot(ctx.x - C.x, ctx.z - C.z));
        const p = routePoint(state.routeS + PFADI.ahead);
        const close = left < 60;
        return {
          done: near(ctx, C, PFADI.campRadius), progress: clamp(state.routeS / ROUTE_LENGTH, 0, 1),
          text: `${fmtDist(left)} to the camp in the Mattawald`,
          target: close ? { x: C.x, z: C.z, r: PFADI.campRadius } : { x: p.x, z: p.z, r: 6 },
          hint: state.routeS < 40 ? 'Follow the trail signs: sticks laid as arrows' : null
        };
      }
    },
    {
      id: 'tent',
      title: 'Pitch the Spatz',
      check(ctx, state) {
        const S = PFADI.tentSteps, st = state.tent, s = S[Math.min(st.step, S.length - 1)];
        return {
          done: st.done, progress: stepsShare(st, S), text: st.done ? 'The Spatz stands' : `${s.label} (${st.step + 1}/${S.length})`,
          target: state.nearTent ? null : { x: PFADI_PLACES.tent.x, z: PFADI_PLACES.tent.z, r: 2.4 },
          hint: state.nearTent ? 'Hold Space' : `To the tent spot: ${toPlace(ctx, PFADI_PLACES.tent)}`
        };
      }
    },
    {
      id: 'wood',
      title: 'Gather firewood',
      check(ctx, state) {
        const c = woodCount(state.wood), n = state.wood.length;
        const w = nearestWood(state.wood, ctx.x, ctx.z);
        const close = w && Math.hypot(w.x - ctx.x, w.z - ctx.z) <= PFADI.wood.reach;
        return {
          done: c.all >= n, progress: c.all / n,
          text: `Firewood ${c.all}/${n} · twigs ${c.twigs}/${WOOD_NEED.twigs} · kindling ${c.kindling}/${WOOD_NEED.kindling} · logs ${c.log}/${WOOD_NEED.log}`,
          target: w ? { x: w.x, z: w.z, r: 1.4 } : null,
          hint: state.picking ? 'Picking up …' : close ? `Hold Space: pick up ${WOOD_NAMES[w.kind]}` : null
        };
      }
    },
    {
      id: 'ring',
      title: 'Build the fireplace',
      check(ctx, state) {
        const S = PFADI.ringSteps, st = state.ring, s = S[Math.min(st.step, S.length - 1)];
        return {
          done: st.done, progress: stepsShare(st, S), text: st.done ? 'Ready to light' : `${s.label} (${st.step + 1}/${S.length})`,
          target: state.nearFire ? null : { x: PFADI_PLACES.fire.x, z: PFADI_PLACES.fire.z, r: 1.6 },
          hint: state.nearFire ? 'Hold Space' : `To the fireplace: ${toPlace(ctx, PFADI_PLACES.fire)}`
        };
      }
    },
    {
      id: 'spark',
      title: 'Strike a spark with flint and steel',
      check(ctx, state) {
        const f = state.flint, S = PFADI.strike;
        return {
          done: f.lit, progress: f.ember, text: `Sparks in the tinder ${f.lit ? S.need : Math.min(S.need - 1, Math.round(f.ember / S.ember))}/${S.need}`,
          target: state.nearFire ? null : { x: PFADI_PLACES.fire.x, z: PFADI_PLACES.fire.z, r: 1.6 },
          hint: state.nearFire ? 'Space when the needle is in the green' : `To the fireplace: ${toPlace(ctx, PFADI_PLACES.fire)}`
        };
      }
    },
    {
      id: 'blow',
      title: 'Blow the ember into a flame',
      check(ctx, state) {
        const b = state.blow;
        return {
          done: b.caught && b.fire >= 1, progress: b.caught ? b.fire : b.glow,
          text: b.caught ? 'It catches! The fire grows' : `Ember ${Math.round(b.glow * 100)} %`,
          target: state.nearFire ? null : { x: PFADI_PLACES.fire.x, z: PFADI_PLACES.fire.z, r: 1.6 },
          hint: !state.nearFire ? `To the fireplace: ${toPlace(ctx, PFADI_PLACES.fire)}` : b.caught ? null : b.out ? 'Out of breath: let go and breathe in' : 'Hold Space: blow gently'
        };
      }
    }
  ]
};

export const PFADI_MISSIONS = [PFADI_MISSION];
