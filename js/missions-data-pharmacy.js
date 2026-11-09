// js/missions-data-pharmacy.js
// The medicine round by cargo bike (js/missions-data.js lists it; js/missions-pharmacy.js has its runtime: the crate on
// the bike's deck with the parcels, the markers over the doors, the toasts): its definition and the pure logic behind
// it, three.js-free like the other packages (tests/missions-pharmacy.test.mjs drives it with synthetic frames and a bot).
//
//   pharmacy-cargo-bike  All year, in the morning. The Amavita Apotheke Flüela, Bahnhofstrasse 1 in Davos Dorf (OSM
//                        n1086729131), sends its home deliveries out on the yellow cargo bike (js/controllers.js
//                        createCargoBikeEntity, the player mode `cargobike`): six parcels to six real addresses round
//                        Davos Dorf (OSM building footprints with addr:street / addr:housenumber; the doors on the
//                        street in front of them). One is insulin in a cool box: it goes first, cold for 1:30 from the
//                        start (+45 s once it is warm). Two hold glass (eye drops, a cough syrup): a kerb taken at speed
//                        or a crash knocks them (their condition drops by the jolt), at 0 % they break (+30 s each, the
//                        pharmacy sends a new one). A parcel is handed over by stopping at its door (1.5 s standing in
//                        the ring); then back to the pharmacy.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// The pharmacy: the shop (OSM node of js/shops-data.js), the ring on the Bahnhofstrasse in front of it where the round
// starts and ends, the bike facing south-east down the Bahnhofstrasse towards the Mühlestrasse
export const PHARMACY = {
  name: 'Amavita Apotheke Flüela',
  address: 'Bahnhofstrasse 1, 7260 Davos Dorf',
  shop: { x: 811.7, z: -1533.7, osm: 'n1086729131' },
  door: { x: 820.0, z: -1527.3, r: 5 },
  start: { x: 818.1, z: -1523.1, heading: 2.49 }
};

// The rules of the round
export const DELIVERY = {
  handS: 1.5, // s standing in a door's ring to hand the parcel over
  stopSpeed: 1.0, // m/s: "standing"
  coldMs: 90000, // the insulin's cool box keeps it cold this long from the start
  warmPenaltyMs: 45000,
  brokenPenaltyMs: 30000, // a broken fragile parcel: the pharmacy sends a new one
  // a bump: the bike's height jumps off the slope it was on (a kerb, the edge of a sidewalk, a bridge's joint) at speed,
  // and is back on that slope the frame after (a ramp beginning goes on climbing: no bump); its knock is jolt × speed
  bump: { minSpeed: 2.5, minJolt: 0.045, maxStep: 3, cooldown: 0.4, perSeverity: 25, min: 5, max: 25 },
  // a crash: the speed falls faster than the brakes can (js/controllers.js: a wall takes 80 %, a post 60 %)
  crash: { minSpeed: 2.5, slack: 1.5, brake: 8, perMs: 8, min: 10, max: 60 }
};

// The six parcels: the address (the OSM building with that addr:street / addr:housenumber), what is in it, its kind
// ('cold' | 'fragile' | 'normal'), the door: the street's edge in front of the house (on the street named in the
// address), and `face`: the heading from the door to the house
export const PARCELS = [
  { id: 'insulin', address: 'Mühlestrasse 10', osm: 'w117012210', house: { x: 994.3, z: -1325.5 }, content: 'Insulin (cool box)', kind: 'cold', door: { x: 1003.1, z: -1340.8, r: 5 } },
  { id: 'tablets', address: 'Museumstrasse 6', osm: 'w127034267', house: { x: 1068.0, z: -1409.6 }, content: 'Blood pressure tablets', kind: 'normal', door: { x: 1059.4, z: -1416.7, r: 5 } },
  { id: 'inhaler', address: 'Mühlestrasse 3', osm: 'w116881238', house: { x: 916.9, z: -1455.2 }, content: 'Asthma inhaler', kind: 'normal', door: { x: 899.5, z: -1444.0, r: 5 } },
  { id: 'eyedrops', address: 'Tschuggenstrasse 5', osm: 'w117138747', house: { x: 765.3, z: -1763.7 }, content: 'Eye drops (glass)', kind: 'fragile', door: { x: 774.5, z: -1761.2, r: 5 } },
  { id: 'dressings', address: 'Palüdastrasse 8', osm: 'w117138763', house: { x: 656.7, z: -1683.4 }, content: 'Wound dressings', kind: 'normal', door: { x: 663.7, z: -1665.4, r: 5 } },
  { id: 'syrup', address: 'Salzgäbastrasse 10', osm: 'w117138608', house: { x: 599.0, z: -1518.5 }, content: 'Cough syrup (glass)', kind: 'fragile', door: { x: 612.4, z: -1507.6, r: 5 } }
].map((p) => ({ ...p, face: Math.atan2(p.house.x - p.door.x, p.house.z - p.door.z) }));

export const parcelById = (id) => PARCELS.find((p) => p.id === id) || null;

/** The round's scratch state */
export function createDelivery() {
  return {
    parcels: PARCELS.map((p) => ({ id: p.id, kind: p.kind, delivered: false, at: null, condition: p.kind === 'fragile' ? 1 : null, broken: false })),
    delivered: 0, hand: null, insulinMs: null, warm: false, bumps: 0, crashes: 0, broken: 0, penaltyMs: 0,
    ride: null, events: [], home: 0
  };
}

const fragileAboard = (state) => state.parcels.filter((p) => p.kind === 'fragile' && !p.delivered && !p.broken);

/** A knock to the fragile parcels aboard: `loss` 0-1 off each one's condition; those at 0 break */
export function knockFragile(state, loss, cause) {
  const hit = fragileAboard(state);
  if (!hit.length || loss <= 0) return [];
  const broke = [];
  for (const p of hit) {
    p.condition = Math.max(0, p.condition - loss);
    if (p.condition <= 0) { p.broken = true; state.broken++; state.penaltyMs += DELIVERY.brokenPenaltyMs; broke.push(p.id); }
  }
  const worst = Math.min(...hit.map((p) => p.condition));
  state.events.push({ type: cause, loss, condition: worst });
  for (const id of broke) state.events.push({ type: 'broken', id });
  return broke;
}

/**
 * One frame of riding: the bumps (the height jumping off the slope the bike was on, at speed) and the crashes (the speed
 * falling faster than the brakes can). `ctx`: { mode, x, y, z, speed, dt }. Returns 'bump' | 'crash' | null.
 */
export function stepRide(state, ctx, R = DELIVERY) {
  const r = state.ride;
  const speed = Math.abs(ctx.speed || 0);
  if (!r || ctx.mode !== 'cargobike') { state.ride = ctx.mode === 'cargobike' ? { x: ctx.x, y: ctx.y, z: ctx.z, speed, slope: 0, cool: 0 } : null; return null; }
  const ds = Math.hypot(ctx.x - r.x, ctx.z - r.z), dy = ctx.y - r.y;
  let ev = null;
  r.cool = Math.max(0, r.cool - (ctx.dt || 0));
  const B = R.bump;
  if (ds > B.maxStep) { r.slope = 0; r.pending = null; } // (a jump: no slope from it)
  else if (ds > 0.02) {
    const jolt = Math.abs(dy - r.slope * ds);
    if (r.pending) {
      // a step is a kerb only if the bike is back on the slope it had before it (a ramp starting goes on climbing)
      const p = r.pending;
      r.pending = null;
      if (jolt < B.minJolt / 2) {
        ev = 'bump';
        r.cool = B.cooldown;
        state.bumps++;
        knockFragile(state, clamp(p.jolt * p.speed * B.perSeverity, B.min, B.max) / 100, 'bump');
      } else r.slope = clamp(dy / ds, -1, 1);
    } else if (jolt >= B.minJolt && Math.max(speed, r.speed) >= B.minSpeed && r.cool <= 0) r.pending = { jolt, speed: Math.max(speed, r.speed) };
    else if (jolt < B.minJolt || r.cool > 0) r.slope = clamp(dy / ds, -1, 1);
  }
  const C = R.crash;
  const drop = r.speed - speed;
  if (!ev && r.speed >= C.minSpeed && drop > C.slack + C.brake * (ctx.dt || 0)) {
    ev = 'crash';
    state.crashes++;
    knockFragile(state, clamp(drop * C.perMs, C.min, C.max) / 100, 'crash');
  }
  r.x = ctx.x; r.y = ctx.y; r.z = ctx.z; r.speed = speed;
  return ev;
}

/** The parcel whose door ring (x, z) stands in, not yet delivered (the nearest when rings overlap), or null */
export function doorAt(state, x, z) {
  let best = null, bd = Infinity;
  for (const s of state.parcels) {
    if (s.delivered) continue;
    const p = parcelById(s.id), d = Math.hypot(p.door.x - x, p.door.z - z);
    if (d <= p.door.r && d < bd) { bd = d; best = s; }
  }
  return best;
}

/** One frame at the doors: standing in a ring hands that parcel over after handS. Returns the parcel delivered, or null */
export function stepHandover(state, ctx, R = DELIVERY) {
  const s = ctx.mode === 'cargobike' ? doorAt(state, ctx.x, ctx.z) : null;
  const still = Math.abs(ctx.speed || 0) < R.stopSpeed;
  if (!s || !still) { state.hand = s ? { id: s.id, t: 0 } : null; return null; }
  if (state.hand?.id !== s.id) state.hand = { id: s.id, t: 0 };
  state.hand.t += ctx.dt || 0;
  if (state.hand.t < R.handS) return null;
  s.delivered = true;
  s.at = ctx.t || 0;
  state.delivered++;
  state.hand = null;
  if (s.kind === 'cold') state.insulinMs = s.at;
  state.events.push({ type: 'delivered', id: s.id, condition: s.condition, broken: s.broken });
  return s;
}

/** The cool box: warm once the clock passes coldMs with the insulin still aboard (the penalty once) */
export function stepCold(state, ctx, R = DELIVERY) {
  const ins = state.parcels.find((p) => p.kind === 'cold');
  if (!ins || ins.delivered || state.warm) return false;
  if ((ctx.t || 0) > R.coldMs) { state.warm = true; state.penaltyMs += R.warmPenaltyMs; state.events.push({ type: 'warm' }); return true; }
  return false;
}

/** The nearest parcel not yet delivered to (x, z), with its distance: { parcel, state, d } or null */
export function nextParcel(state, x, z) {
  let best = null;
  for (const s of state.parcels) {
    if (s.delivered) continue;
    const p = parcelById(s.id), d = Math.hypot(p.door.x - x, p.door.z - z);
    if (!best || d < best.d) best = { parcel: p, state: s, d };
  }
  return best;
}

const fragileText = (state) => {
  const f = fragileAboard(state);
  if (!f.length) return '';
  const worst = Math.min(...f.map((p) => p.condition));
  return worst < 1 ? ` · fragile ${Math.round(worst * 100)} %` : '';
};
const handHint = (state) => (state.hand && state.hand.t > 0 ? `Handing over … ${Math.round(clamp(state.hand.t / DELIVERY.handS, 0, 1) * 100)} %` : null);
const rideHint = (ctx, state, target, d) => {
  if (ctx.mode !== 'cargobike') return 'Back onto the cargo bike';
  const h = handHint(state);
  if (h) return h;
  if (target && d <= target.r) return 'Stop at the door to hand the parcel over';
  if (fragileAboard(state).length && Math.abs(ctx.speed || 0) > 6) return 'Glass aboard: slow down over kerbs';
  return null;
};

const PHARMACY_ID = 'pharmacy-cargo-bike';
export const PHARMACY_MISSION = {
  id: PHARMACY_ID,
  title: 'Medicine round by cargo bike',
  intro: 'The morning round of the Amavita Apotheke Flüela at the Bahnhofstrasse in Davos Dorf: six parcels in the crate of the yellow cargo bike, for six addresses round the village. The insulin in the cool box goes first, it stays cold for 1:30 (+45 s if it gets warm). Two parcels hold glass: take the kerbs slowly and do not crash, or they break (+30 s each). Stop at each door to hand a parcel over, then ride back to the pharmacy.',
  mode: 'cargobike',
  season: null,
  time: 'morning',
  features: ['pharmacyRound'],
  props: [],
  colour: '#2e9d47',
  icon: 'rega', // (the cross: the pharmacy's green cross)
  // (the shortest round on the streets and footpaths, js/davos-geodata.js roads: 2.3 km, 1.5 km as the crow flies;
  // the cargo bike at ~8 m/s with the turns and the junctions: 4:50, six handovers with their braking and setting off
  // again: +35 s. A bot in straight lines at 8 m/s: 3:08, tests/missions-pharmacy.test.mjs)
  bonusMs: 330000,
  medals: { gold: 330000, silver: 450000, bronze: 660000 },
  finish: 'The crate is empty and the cargo bike back at the Bahnhofstrasse. Six homes in Davos Dorf have their medicine.',
  start: { ...PHARMACY.start },
  createState() { return createDelivery(); },
  update(ctx, state) {
    if (!state.parcels) return;
    stepRide(state, ctx);
    if (ctx.t > 0) stepCold(state, ctx);
    stepHandover(state, ctx);
    state.home = Math.hypot(ctx.x - PHARMACY.door.x, ctx.z - PHARMACY.door.z);
  },
  objectives: [
    {
      id: 'insulin',
      title: 'The insulin to Mühlestrasse 10',
      check(ctx, state) {
        const p = PARCELS[0], s = state.parcels[0];
        const d = Math.hypot(p.door.x - ctx.x, p.door.z - ctx.z);
        const cold = state.warm ? 'The insulin is warm (+45 s)' : `Insulin cold for ${fmtClock(DELIVERY.coldMs - (ctx.t || 0))}`;
        return {
          done: s.delivered, progress: state.warm ? null : clamp(1 - (ctx.t || 0) / DELIVERY.coldMs, 0, 1),
          text: `${cold} · ${fmtDist(d)} to ${p.address}`,
          target: { ...p.door, style: 'plain' }, hint: rideHint(ctx, state, p.door, d)
        };
      }
    },
    {
      id: 'deliver',
      title: 'Deliver the other parcels',
      check(ctx, state) {
        const n = nextParcel(state, ctx.x, ctx.z);
        const total = state.parcels.length;
        const text = n ? `Delivered ${state.delivered}/${total} · next ${n.parcel.address}, ${fmtDist(n.d)}${fragileText(state)}` : `Delivered ${total}/${total}`;
        return { done: !n, progress: state.delivered / total, text, target: n ? { ...n.parcel.door, style: 'plain' } : null, hint: rideHint(ctx, state, n?.parcel.door, n?.d ?? Infinity) };
      }
    },
    {
      id: 'back',
      title: 'Back to the pharmacy',
      check(ctx, state) {
        const D = PHARMACY.door, d = Math.hypot(ctx.x - D.x, ctx.z - D.z);
        const there = d <= D.r && Math.abs(ctx.speed || 0) < DELIVERY.stopSpeed && ctx.mode === 'cargobike';
        return { done: there, progress: null, text: `Crate empty · ${fmtDist(d)} to the pharmacy`, target: { ...D, style: 'pad' }, hint: ctx.mode !== 'cargobike' ? 'Back onto the cargo bike' : d <= D.r ? 'Stop in front of the pharmacy' : null };
      }
    }
  ],
  summary(state) {
    const lines = [`${state.delivered} of ${state.parcels.length} parcels delivered · insulin ${state.insulinMs != null ? `after ${fmtClock(state.insulinMs)}` : 'not delivered'}${state.warm ? ' (warm, +45 s)' : ''}`];
    lines.push(`${state.bumps} bump${state.bumps === 1 ? '' : 's'} · ${state.crashes} crash${state.crashes === 1 ? '' : 'es'} · ${state.broken ? `${state.broken} broken (+${(state.broken * DELIVERY.brokenPenaltyMs) / 1000} s)` : 'the glass arrived whole'}`);
    return lines;
  }
};

export const PHARMACY_MISSIONS = [PHARMACY_MISSION];
