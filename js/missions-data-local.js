// js/missions-data-local.js
// Eight missions at real places of Davos (js/missions-data.js spreads LOCAL_MISSIONS into MISSIONS; js/missions-local.js
// has their runtime: the props, the mini games' input, camera, HUD). Like js/missions-data.js: no three.js and no DOM in
// here, so that tests/missions-local.test.mjs drives the games' logic with synthetic frames. (Nothing is imported from
// js/missions-data.js: it imports this module, and a cycle would leave LOCAL_MISSIONS undefined there.)
//
//  - beer-delivery: crates of the Davoser Craft Beer GmbH (Bolgenstrasse 1, Davos Platz) loaded into the VW T3 and
//    carried into five bars of Davos (Rot Liechtli, Ex Bar, La Onda, Dorfkeller, BOX). By time.
//  - gipfeli-weber: the Bäckerei-Konditorei Weber (Promenade 148, Davos Dorf): roll five Gipfeli (a gesture at the
//    right pace), then deliver them by bike to three hotels before 7 o'clock. By points.
//  - raclette-kaech: Gourmet Käch (Promenade 98, Davos Platz): scrape raclette off the half wheel under the grill, at
//    the right melt for each order (normal / extra crispy). By points.
//  - ibex-hunt: the Bündner Hochjagd on the steep flank above the Schatzalp, towards the Strela: stalk, read the wind,
//    take only an old buck with long horns (a clean shot behind the shoulder). By points.
//  - squirrel-trail: the Seepromenade at the Davosersee with its "Eichhörnliplatz" (OSM n8518492990): stand still,
//    hold out a nut, the squirrels come down from the trees. 3 minutes, by points.
//  - tennis-hall: a tiebreak against the club's coach in the Sporthalle Färbi (Clavadelerstrasse 5). By points.
//  - waterslide-race: the eau-là-là's slide, ridden against the clock: lean into the bends (too high on the wall
//    brakes). By time.
//  - paint-kirchner: an easel in front of the Kirchner Museum: paint the view in the expressionist palette, 3 minutes;
//    scored by likeness to a posterised template, colour and contours. By points.
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z, south).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
const fmtClock = (s) => { const v = Math.max(0, Math.ceil(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const LOCAL_SCORE_MODE = 'points';

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

/** The "walk to the door" step */
function walkTo(spot, title, label, id = 'enter') {
  return {
    id,
    title,
    allowModes: ['person'],
    check(ctx) {
      const d = Math.hypot(ctx.x - spot.x, ctx.z - spot.z);
      const onFoot = ctx.mode === 'person';
      return { done: onFoot && d < spot.r, progress: null, text: onFoot ? `${fmtDist(d)} to ${label}` : 'Get off (F) and walk in', target: { ...spot, style: 'plain' }, hint: onFoot ? null : 'F: get off' };
    }
  };
}

// =====================================================================================================================
// 1. Beer delivery for the Davoser Craft Beer
// =====================================================================================================================
// The brewery: OSM n10834095305 "Davoser Craft Beer GmbH" (shop=beverages), Bolgenstrasse 1. Its door on the lane
// west of the building, the van on that lane. The bars: OSM (js/shops-data.js), each door where its wall faces the
// nearest road, the parking zone on that road.
export const BREWERY = { name: 'Davoser Craft Beer', door: { x: -681.7, z: 635.8, r: 2.2 }, facing: -0.68, van: { x: -685.3, z: 646.5, heading: Math.PI - 0.07 } };
export const BEER_STOPS = [
  { id: 'rotliechtli', name: 'Rot Liechtli', door: { x: -588.8, z: 284.9 }, road: { x: -586.1, z: 282.3 } },
  { id: 'exbar', name: 'Ex Bar', door: { x: -582.0, z: -139.6 }, road: { x: -581.5, z: -140.4 } },
  { id: 'laonda', name: 'Bar La Onda', door: { x: -486.7, z: -308.9 }, road: { x: -484.7, z: -304.2 } },
  { id: 'dorfkeller', name: 'Dorfkeller', door: { x: 561.2, z: -1020.3 }, road: { x: 561.6, z: -1020.6 } },
  { id: 'box', name: 'BOX Davos', door: { x: 1014.4, z: -1830.1 }, road: { x: 1016.8, z: -1829.9 } }
];
export const BEER = {
  loads: 2, // trips from the brewery's door to the van (two stacks of crates)
  doorR: 2.4, // m: the delivery spot at a door
  vanR: 3.6, // m: close enough to the van to take or stow a crate
  carryMax: 45, // m: the van must stand within this of the door (no carrying crates across town)
  handover: 1.0 // s at the door (the landlord signs)
};

export const createBeerState = () => ({ phase: 'load', loaded: 0, carrying: false, delivered: 0, doorT: 0, van: null, log: [] });

/** One frame of the crate handling: ctx (player), van { x, z } (the T3, js/missions-local.js writes it), the current
 *  stop (null while loading). Returns what happened: 'pick' | 'stow' | 'deliver' | null */
export function beerStep(st, ctx, van, stop) {
  const onFoot = ctx.mode === 'person';
  if (!onFoot || !van) { st.doorT = 0; return null; }
  const p = { x: ctx.x, z: ctx.z };
  const nearVan = dist(p, van) < BEER.vanR;
  if (st.phase === 'load') {
    if (!st.carrying && dist(p, BREWERY.door) < BREWERY.door.r + 0.6) { st.carrying = true; return 'pick'; }
    if (st.carrying && nearVan) { st.carrying = false; st.loaded++; if (st.loaded >= BEER.loads) st.phase = 'deliver'; return 'stow'; }
    return null;
  }
  if (!stop) return null;
  if (!st.carrying && nearVan && dist(van, stop.door) < BEER.carryMax) { st.carrying = true; return 'pick'; }
  if (st.carrying && dist(p, stop.door) < BEER.doorR) {
    st.doorT += ctx.dt || 0;
    if (st.doorT >= BEER.handover) { st.carrying = false; st.doorT = 0; st.delivered++; st.log.push({ id: stop.id, t: ctx.t || 0 }); return 'deliver'; }
  } else st.doorT = 0;
  return null;
}

function beerDeliverObjective(stop, i) {
  return {
    id: `deliver-${stop.id}`,
    title: `Deliver to ${stop.name}`,
    allowModes: ['car', 'person'],
    check(ctx, state) {
      const st = state.beer;
      const done = st.delivered > i;
      const van = st.van;
      const vanD = van ? dist(van, stop.door) : Infinity;
      let text, target, hint = null;
      if (ctx.mode === 'car') {
        text = vanD < BEER.carryMax ? `Park here and get out (F) · ${stop.name}` : `${fmtDist(dist(ctx, stop.road))} to ${stop.name}`;
        target = vanD < BEER.carryMax ? { ...stop.door, r: BEER.doorR, style: 'plain' } : { ...stop.road, r: 8, style: 'plain' };
        if (vanD < BEER.carryMax && Math.abs(ctx.speed) < 0.6) hint = 'F: get out';
      } else if (vanD > BEER.carryMax) {
        text = `The van is ${fmtDist(vanD)} away: drive closer to ${stop.name}`;
        target = van ? { ...van, r: BEER.vanR, style: 'plain' } : null;
        hint = 'F: get in';
      } else if (!st.carrying) {
        text = 'Take a crate from the back of the van';
        target = van ? { ...van, r: BEER.vanR, style: 'plain' } : null;
      } else {
        text = st.doorT > 0 ? `Handing over … ${stop.name}` : `Carry the crate in · ${fmtDist(dist(ctx, stop.door))}`;
        target = { ...stop.door, r: BEER.doorR, style: 'plain' };
      }
      return { done, progress: st.doorT > 0 ? st.doorT / BEER.handover : null, text, target, hint };
    }
  };
}

export const BEER_MISSION = {
  id: 'beer-delivery',
  title: 'Beer run for the Davoser Craft Beer',
  intro: 'The Davoser Craft Beer on the Bolgenstrasse has a round to deliver. Get out of the VW T3 (F), carry two stacks of crates from the brewery door into the van, then drive to five bars across Davos: Rot Liechtli, Ex Bar, La Onda, Dorfkeller and the BOX. At each one park close by, get out, take a crate from the back and carry it to the door. The clock is running: the bars are thirsty.',
  mode: 'car',
  allowModes: ['car', 'person'],
  season: 'summer',
  time: 'golden',
  features: ['beerVan'],
  bonusMs: 8.5 * 60000,
  medals: { gold: 8.5 * 60000, silver: 11 * 60000, bronze: 15 * 60000 },
  colour: '#f5c518',
  icon: 'beer',
  finish: 'The last crate is in the BOX: the brewers raise a glass to you.',
  start: { ...BREWERY.van },
  pin: { x: -679.5, z: 641.5 },
  props: [],
  createState() { return { beer: createBeerState() }; },
  update() {},
  summary(state) {
    const b = state.beer;
    return [`${b.delivered} of ${BEER_STOPS.length} bars served`];
  },
  objectives: [
    {
      id: 'load',
      title: 'Load the crates at the brewery',
      allowModes: ['car', 'person'],
      check(ctx, state) {
        const st = state.beer;
        let text, target;
        if (ctx.mode !== 'person') { text = 'Get out (F) and load the crates'; target = { ...BREWERY.door, style: 'plain' }; }
        else if (!st.carrying) { text = `Fetch crates at the brewery door (${st.loaded}/${BEER.loads})`; target = { ...BREWERY.door, style: 'plain' }; }
        else { text = `Stow them in the back of the van (${st.loaded}/${BEER.loads})`; target = st.van ? { ...st.van, r: BEER.vanR, style: 'plain' } : null; }
        return { done: st.phase !== 'load', progress: st.loaded / BEER.loads, text, target, hint: ctx.mode === 'person' ? null : 'F: get out' };
      }
    },
    ...BEER_STOPS.map(beerDeliverObjective)
  ]
};

// =====================================================================================================================
// 2. The Weber Gipfeli challenge
// =====================================================================================================================
// The Bäckerei-Konditorei Weber, Promenade 148, Davos Dorf (OSM n13316557621), opposite the Parsennbahn. Its door to
// the Promenade; the bike on the Promenade in front. The hotels: OSM (js/shops-data.js), the zone on the road in front.
// (the bike on the Promenade 12 m up the street, the bakery's front ahead on the right: never against a facade)
export const WEBER = { door: { x: 639.6, z: -1376.1, r: 2.2 }, bike: { x: 628.6, z: -1369.0, heading: 2.55 } };
export const GIPFELI_HOTELS = [
  { id: 'seehof', name: 'Hotel Seehof', road: { x: 712.5, z: -1497.5, r: 7 } },
  { id: 'montana', name: 'Hotel Montana', road: { x: 846.8, z: -1518.9, r: 7 } },
  { id: 'victoria', name: 'Turmhotel Victoria', road: { x: 974.5, z: -1725.0, r: 7 } }
];
export const GIPFELI = {
  count: 5,
  band: [0.9, 1.9], // progress a second: a whole roll in 0.55-1.1 s is right
  tear: 3.4, // faster than this the dough tears
  push: 0.55, // a key tap's push (progress / s)
  decay: 2.6, // 1/s: the push fades
  clockStart: 6 * 60 + 40, // the oven is done at 6:40
  clockRate: 1 / 6, // game minutes per second
  deadline: 7 * 60,
  points: { roll: 100, delivery: 100, perMinute: 10, late: 30 }
};

export const createRoll = () => ({ p: 0, v: 0, tIn: 0, tAll: 0, tears: 0, fast: 0, slow: 0, done: false, quality: 0 });

/** One step of a roll: `dp` progress made this frame by a drag (or null), `push` key taps this frame */
export function rollStep(r, { dp = null, push = 0 } = {}, dt) {
  if (r.done || dt <= 0) return r;
  let step;
  if (dp !== null) {
    // the finger rolls the dough where it goes; its pace (smoothed over the pointer's events) is what is judged
    step = Math.max(0, dp);
    r.v = r.p === 0 && dp > 0 ? dp / dt : Math.max(0, r.v + (dp / dt - r.v) * Math.min(1, dt / 0.15));
  } else {
    r.v += push * GIPFELI.push * 2.2; r.v *= Math.exp(-GIPFELI.decay * dt);
    r.v = Math.max(0, r.v);
    step = r.v * dt;
  }
  if (step > 0 || r.p > 0) {
    r.tAll += dt;
    if (r.v >= GIPFELI.band[0] && r.v <= GIPFELI.band[1]) r.tIn += dt;
    else if (r.v > GIPFELI.band[1]) r.fast += dt;
    else r.slow += dt;
    if (r.v > GIPFELI.tear) r.tears++;
  }
  r.p = Math.min(1, r.p + step);
  if (r.p >= 1) { r.done = true; r.quality = rollQuality(r); }
  return r;
}

export const rollQuality = (r) => clamp((r.tAll > 0 ? r.tIn / r.tAll : 0) - Math.min(0.5, r.tears * 0.04), 0, 1);
export const rollPoints = (r) => Math.round(GIPFELI.points.roll * r.quality);
export const rollVerdict = (r) => (r.quality >= 0.85 ? 'Perfect Gipfeli!' : r.quality >= 0.6 ? 'Nice and even' : r.tears > 3 ? 'Torn: too fast' : r.slow > r.fast ? 'Too slow: it got sticky' : 'Too fast: a bit loose');

/** The bakery clock (minutes since midnight) `s` seconds after the oven */
export const gipfeliClock = (s) => GIPFELI.clockStart + s * GIPFELI.clockRate;
export const fmtDayClock = (min) => `${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, '0')}`;
export const deliveryPoints = (clockMin) => (clockMin <= GIPFELI.deadline ? GIPFELI.points.delivery + Math.floor(GIPFELI.deadline - clockMin) * GIPFELI.points.perMinute : GIPFELI.points.late);

export function createGipfeli() { return { rolls: [], current: createRoll(), formed: false, rideStart: null, deliveries: [], stop: 0 }; }
export const gipfeliScore = (g) => (g ? g.rolls.reduce((a, r) => a + rollPoints(r), 0) + g.deliveries.reduce((a, d) => a + d.points, 0) : 0);

/** Finishes the current roll when done: the next one, or the batch formed */
export function gipfeliNext(g) {
  if (!g.current.done) return false;
  g.rolls.push(g.current);
  if (g.rolls.length >= GIPFELI.count) { g.formed = true; g.current = null; return true; }
  g.current = createRoll();
  return true;
}

function gipfeliHotelObjective(h, i) {
  return {
    id: `hotel-${h.id}`,
    title: `Deliver to the ${h.name}`,
    allowModes: ['cyclist', 'person'],
    check(ctx, state) {
      const g = state.gipfeli;
      if (!g) return { done: false, progress: null, text: '…', target: null, hint: null };
      if (g.rideStart === null) g.rideStart = ctx.t || 0;
      const s = ((ctx.t || 0) - g.rideStart) / 1000;
      const clock = gipfeliClock(s);
      const d = dist(ctx, h.road);
      const there = ctx.mode === 'cyclist' && d < h.road.r && Math.abs(ctx.speed) < 1.2;
      if (there && g.deliveries.length === i) g.deliveries.push({ id: h.id, clock, points: deliveryPoints(clock) });
      const late = clock > GIPFELI.deadline;
      const text = ctx.mode !== 'cyclist' ? 'Get on the bike (F) in front of the bakery' : `${fmtDayClock(clock)}${late ? ' · late!' : ` · ${Math.ceil(GIPFELI.deadline - clock)} min to 7:00`} · ${fmtDist(d)} to the ${h.name}`;
      return { done: g.deliveries.length > i, progress: null, text, target: { ...h.road, style: 'plain' }, hint: ctx.mode === 'cyclist' ? (d < h.road.r ? 'Stop at the door' : null) : 'F: get on the bike' };
    }
  };
}

export const GIPFELI_MISSION = {
  id: 'gipfeli-weber',
  title: 'The Weber Gipfeli challenge',
  intro: 'Early shift at the Bäckerei Weber on the Promenade in Davos Dorf. Go in and roll five Gipfeli: drag down over the dough triangle (or tap S / ↓ in a steady rhythm) at an even pace, not too fast, not too slow. Then get on the bike and bring the warm Gipfeli to the Seehof, the Montana and the Turmhotel Victoria before 7 o\'clock: stop at each one.',
  mode: 'cyclist',
  allowModes: ['cyclist', 'person'],
  season: 'summer',
  time: 'golden',
  features: ['gipfeli'],
  scoreMode: LOCAL_SCORE_MODE,
  medals: { gold: 850, silver: 650, bronze: 420 },
  colour: '#d98b2b',
  icon: 'croissant',
  finish: 'Breakfast is served: three hotels with Weber Gipfeli on the table.',
  start: { ...WEBER.bike },
  props: [],
  createState() { return { gipfeli: createGipfeli() }; },
  score: (state) => gipfeliScore(state.gipfeli),
  summary(state) {
    const g = state.gipfeli;
    const lines = [`Gipfeli: ${g.rolls.map((r) => rollPoints(r)).join(' · ') || '–'}`];
    if (g.deliveries.length) lines.push(g.deliveries.map((d) => `${GIPFELI_HOTELS.find((h) => h.id === d.id).name} ${fmtDayClock(d.clock)} +${d.points}`).join(' · '));
    return lines;
  },
  objectives: [
    walkTo(WEBER.door, 'Go into the Bäckerei Weber', 'the bakery'),
    {
      id: 'form',
      title: `Roll ${GIPFELI.count} Gipfeli`,
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.gipfeli;
        const n = g.rolls.length;
        return { done: g.formed, progress: n / GIPFELI.count, text: `${n} of ${GIPFELI.count} rolled · ${gipfeliScore(g)} pts`, target: null, hint: 'Drag down over the dough · or tap S / ↓ steadily' };
      }
    },
    ...GIPFELI_HOTELS.map(gipfeliHotelObjective)
  ]
};

// =====================================================================================================================
// 3. Raclette at Käch
// =====================================================================================================================
// Gourmet Käch GmbH, Promenade 98, Davos Platz (OSM n5324586821, shop=cheese; listed as gastronomy by Graubünden
// Ferien): the cheese counter. The game: the half wheel under the grill; the melt climbs; a scrape (a swipe across the
// cheese, or Space) puts the melted layer on a plate for the first guest in the queue.
export const KAECH = { door: { x: 326.0, z: -664.9, r: 2.2 }, start: { x: 322.6, z: -669.0, heading: 0.69 } };
export const RACLETTE = {
  length: 90, // s of service
  melt: 0.13, // a second under the grill
  fresh: 0.08, // the melt after a scrape (the new face of the cheese)
  zones: { raw: 0.5, normal: [0.55, 0.76], crispy: [0.78, 0.93], burnt: 0.95 },
  arrive: 5.5, // s between two guests
  patience: 24, // s a guest waits
  queue: 4,
  points: { hit: 100, near: 40, raw: 10, burnt: -30, left: -50, quick: 30 }
};

export const meltGrade = (m) => {
  const z = RACLETTE.zones;
  if (m >= z.burnt) return 'burnt';
  if (m >= z.crispy[0]) return m <= z.crispy[1] ? 'crispy' : 'scorched';
  if (m >= z.normal[0]) return m <= z.normal[1] ? 'normal' : 'between';
  return m >= z.raw ? 'soft' : 'raw';
};

export function createRaclette(seed = 7) {
  const g = { t: 0, melt: RACLETTE.fresh, queue: [], nextGuest: 0.5, served: 0, perfect: 0, left: 0, burnt: 0, score: 0, last: null, done: false, rand: seededRandom(seed), guests: 0 };
  return g;
}

/** The time goes on: the melt, the guests arriving and running out of patience */
export function racletteStep(g, dt) {
  if (g.done) return g;
  g.t += dt;
  g.melt = Math.min(1.05, g.melt + RACLETTE.melt * dt);
  g.nextGuest -= dt;
  if (g.nextGuest <= 0 && g.t < RACLETTE.length - 4) {
    if (g.queue.length < RACLETTE.queue) g.queue.push({ id: ++g.guests, kind: g.rand() < 0.38 ? 'crispy' : 'normal', wait: 0 });
    g.nextGuest = RACLETTE.arrive * (0.75 + g.rand() * 0.5);
  }
  for (const q of g.queue) q.wait += dt;
  while (g.queue.length && g.queue[0].wait > RACLETTE.patience) {
    g.queue.shift(); g.left++; g.score += RACLETTE.points.left; g.last = { grade: 'left', points: RACLETTE.points.left, at: g.t };
  }
  if (g.t >= RACLETTE.length) g.done = true;
  return g;
}

/** A scrape: the plate goes to the first guest. Returns { grade, order, points } (null: nobody waiting) */
export function racletteScrape(g) {
  if (g.done) return null;
  const grade = meltGrade(g.melt);
  g.melt = RACLETTE.fresh;
  const guest = g.queue.shift();
  if (!guest) { g.last = { grade, order: null, points: 0, at: g.t }; return g.last; }
  const P = RACLETTE.points;
  let points;
  if (grade === 'burnt') { points = P.burnt; g.burnt++; }
  else if (grade === guest.kind) points = P.hit + Math.max(0, Math.round(P.quick * (1 - guest.wait / RACLETTE.patience)));
  else if ((grade === 'normal' || grade === 'crispy' || grade === 'between' || grade === 'scorched')) points = P.near;
  else points = P.raw;
  if (grade === guest.kind) g.perfect++;
  g.served++;
  g.score += points;
  g.last = { grade, order: guest.kind, points, at: g.t };
  return g.last;
}

export const RACLETTE_MISSION = {
  id: 'raclette-kaech',
  title: 'Raclette at Käch',
  intro: 'Rush hour at Gourmet Käch on the Promenade: the guests want raclette. The half wheel sits under the grill and melts; scrape the layer off onto the plate (swipe across the cheese, or Space) at the right moment: golden and soft for a normal order, bubbling brown for "extra crispy". Too early it is raw, too late it burns. Serve the queue for 90 seconds.',
  mode: 'person',
  season: null,
  time: 'twilight',
  features: ['raclette'],
  scoreMode: LOCAL_SCORE_MODE,
  medals: { gold: 1500, silver: 1050, bronze: 600 },
  colour: '#ffb627',
  icon: 'cheese',
  finish: 'The last plate is out: the guests ask for the potatoes.',
  start: { ...KAECH.start },
  props: [],
  createState() { return { game: null }; },
  score: (state) => Math.max(0, state.game?.score ?? 0),
  summary(state) {
    const g = state.game;
    return g ? [`${g.served} plates · ${g.perfect} just right · ${g.burnt} burnt · ${g.left} guests left hungry`] : [];
  },
  objectives: [
    walkTo(KAECH.door, 'Go into Gourmet Käch', 'Käch'),
    {
      id: 'serve',
      title: 'Serve raclette for 90 s',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'The grill is heating up …', target: null, hint: null };
        return { done: g.done, progress: g.t / RACLETTE.length, text: `${Math.max(0, g.score)} pts · ${g.served} plates · ${fmtClock(RACLETTE.length - g.t)}`, target: null, hint: 'Swipe across the cheese / Space: scrape' };
      }
    }
  ]
};

// =====================================================================================================================
// 4. The ibex hunt (Bündner Hochjagd)
// =====================================================================================================================
// The flank between the Strela and the Schiahorn above the Schatzalp, ~2470 m: a shoulder (8°, the stand) looking east
// across at a face of 33-42° (checked on the terrain grid: js/terrain.js), 150-230 m off, in clear sight.
export const IBEX = {
  stand: { x: -1720, z: -2160, r: 4 },
  start: { x: -1790, z: -2148, heading: 1.6 },
  herd: { x: -1545, z: -2165, rx: 45, rz: 50 },
  ammo: 4,
  legalHorn: 0.75, // m: a buck from this horn length may be taken
  muzzle: 820, // m/s
  zero: 200, // m: the scope is zeroed here
  drift: 0.55, // the share of the wind's cross speed the bullet takes on
  spook: { run: 3.2, runR: 200, nearR: 110, scentR: 260, scentCone: 0.6 },
  points: { clean: 150, body: 50, forbidden: -150, miss: -20, distance: 0.4 }
};

/** The herd: two old bucks (legal), a young buck, three nannies and two kids (protected) */
export function createHerd(seed = 3) {
  const rand = seededRandom(seed);
  const H = IBEX.herd;
  const kinds = [
    { sex: 'm', age: 'old', horn: 0.92 }, { sex: 'm', age: 'old', horn: 0.84 }, { sex: 'm', age: 'young', horn: 0.42 },
    { sex: 'f', age: 'adult', horn: 0.26 }, { sex: 'f', age: 'adult', horn: 0.24 }, { sex: 'f', age: 'adult', horn: 0.28 },
    { sex: 'f', age: 'kid', horn: 0.06 }, { sex: 'm', age: 'kid', horn: 0.08 }
  ];
  return kinds.map((k, i) => ({
    id: i, ...k,
    x: H.x + (rand() * 2 - 1) * H.rx * 0.8, z: H.z + (rand() * 2 - 1) * H.rz * 0.8, y: 0,
    heading: rand() * Math.PI * 2, state: 'graze', t: rand() * 4, tx: null, tz: null, down: 0, hit: null
  }));
}
export const legalIbex = (a) => a.sex === 'm' && a.age === 'old' && a.horn >= IBEX.legalHorn;
export const ibexLabel = (a) => (a.age === 'kid' ? 'kid' : a.sex === 'f' ? 'nanny (female)' : a.age === 'young' ? 'young buck' : 'old buck');
export const ibexScale = (a) => (a.age === 'kid' ? 0.55 : a.sex === 'f' ? 0.82 : a.age === 'young' ? 0.88 : 1);

/** The zones of an animal (spheres, world): the vitals behind the shoulder, the body, the head */
export function ibexZones(a) {
  const s = ibexScale(a), fx = Math.sin(a.heading), fz = Math.cos(a.heading);
  const at = (f, up, r) => ({ x: a.x + fx * f * s, y: a.y + up * s, z: a.z + fz * f * s, r: r * s });
  return [
    { zone: 'vitals', ...at(0.28, 0.72, 0.17) },
    { zone: 'body', ...at(0.32, 0.8, 0.34) },
    { zone: 'body', ...at(-0.3, 0.8, 0.34) },
    { zone: 'head', ...at(0.95, 1.18, 0.16) }
  ];
}

/** The ray (o, d normalised) against the herd: the nearest hit { animal, zone, t } or null */
export function ibexRayHit(herd, o, d) {
  let best = null;
  for (const a of herd) {
    if (a.state === 'down' || a.state === 'gone') continue;
    let tMin = Infinity, vitals = false, head = false;
    for (const z of ibexZones(a)) {
      const ox = o.x - z.x, oy = o.y - z.y, oz = o.z - z.z;
      const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - z.r * z.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t <= 0) continue;
      tMin = Math.min(tMin, t);
      if (z.zone === 'vitals') vitals = true;
      if (z.zone === 'head') head = true;
    }
    // (the vitals sit inside the body sphere: a line through them is a clean shot behind the shoulder)
    if (tMin < Infinity && (!best || tMin < best.t)) best = { animal: a, zone: vitals ? 'vitals' : head ? 'head' : 'body', t: tMin };
  }
  return best;
}

/** The bullet's deviation at `range` m: { side (m, to the right of the line), drop (m below the line) } for the wind
 *  (direction it blows towards, rad; speed m/s) and the shot's heading */
export function ballistics(range, wind, heading) {
  const tof = range / IBEX.muzzle, tz = IBEX.zero / IBEX.muzzle;
  const cross = wind.speed * Math.sin(wind.dir - heading); // positive: blowing to the shooter's left (heading frame)
  return { side: -cross * IBEX.drift * tof, drop: 0.5 * 9.81 * (tof * tof - tz * tz) };
}

/** The verdict on a hit (or a miss: hit null): points and a line */
export function ibexShotResult(hit, range) {
  const P = IBEX.points;
  if (!hit) return { kind: 'miss', points: P.miss, text: 'Missed: the herd bolts up the slope' };
  const a = hit.animal;
  if (!legalIbex(a)) return { kind: 'forbidden', points: P.forbidden, text: `Not allowed: a ${ibexLabel(a)}! Fine and penalty` };
  if (hit.zone === 'vitals') return { kind: 'clean', points: P.clean + Math.round(Math.max(0, range - 120) * P.distance), text: `Clean shot on the buck (${Math.round(a.horn * 100)} cm horns) at ${Math.round(range)} m` };
  return { kind: 'body', points: P.body, text: 'Hit, but not clean: aim behind the shoulder' };
}

/** The herd's alertness from the hunter: { add (per second), why } — running near them, too close, or the wind
 *  carrying the scent (it blows towards them) */
export function ibexAlarm(herd, hunter, wind) {
  const S = IBEX.spook;
  const c = herdCentre(herd);
  const d = Math.hypot(c.x - hunter.x, c.z - hunter.z);
  if (d < S.nearR) return { add: 0.8, why: 'too close' };
  if (hunter.speed > S.run && d < S.runR) return { add: 0.6, why: 'you are running' };
  const toHerd = Math.atan2(c.x - hunter.x, c.z - hunter.z);
  if (d < S.scentR && Math.abs(wrapAngle(wind.dir - toHerd)) < S.scentCone && wind.speed > 0.5) return { add: 0.25, why: 'the wind carries your scent' };
  return { add: -0.15, why: null };
}

export function herdCentre(herd) {
  let x = 0, z = 0, n = 0;
  for (const a of herd) if (a.state !== 'down' && a.state !== 'gone') { x += a.x; z += a.z; n++; }
  return n ? { x: x / n, z: z / n } : { x: IBEX.herd.x, z: IBEX.herd.z };
}

/** The herd's moves: grazing about, a flight up the slope when spooked (`flee`: away from `from`) */
export function stepHerd(herd, dt, rand, { flee = null } = {}) {
  const H = IBEX.herd;
  for (const a of herd) {
    if (a.state === 'down') { a.down += dt; if (a.down > 4) a.state = 'gone'; continue; }
    if (a.state === 'gone') continue;
    if (flee && a.state !== 'flee') {
      const ang = Math.atan2(a.x - flee.x, a.z - flee.z) + (rand() - 0.5) * 0.8;
      a.state = 'flee'; a.t = 5 + rand() * 2;
      a.tx = clamp(a.x + Math.sin(ang) * 40, H.x - H.rx, H.x + H.rx); a.tz = clamp(a.z + Math.cos(ang) * 40, H.z - H.rz, H.z + H.rz);
    }
    a.t -= dt;
    if (a.state === 'graze' && a.t <= 0) {
      a.state = 'walk'; a.t = 1.5 + rand() * 2.5;
      a.tx = clamp(a.x + (rand() - 0.5) * 10, H.x - H.rx, H.x + H.rx); a.tz = clamp(a.z + (rand() - 0.5) * 10, H.z - H.rz, H.z + H.rz);
    }
    if ((a.state === 'walk' || a.state === 'flee') && a.tx !== null) {
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      const v = a.state === 'flee' ? 7 : 0.35; // (grazing: a step now and then)
      if (d > 0.2) {
        a.heading = Math.atan2(dx, dz);
        const s = Math.min(d, v * dt);
        a.x += (dx / d) * s; a.z += (dz / d) * s;
      }
      if (a.t <= 0 || d <= 0.2) { a.state = 'graze'; a.t = 4 + rand() * 6; a.tx = a.tz = null; }
    }
  }
}

export function createHunt(seed = 3) {
  const rand = seededRandom(seed * 7 + 1);
  return { herd: createHerd(seed), rand, ammo: IBEX.ammo, shots: [], score: 0, alarm: 0, alarmWhy: null, flees: 0, wind: { dir: 2.2 + rand() * 0.8, speed: 2 + rand() * 3 }, done: false };
}
export const huntLegalLeft = (h) => h.herd.filter((a) => legalIbex(a) && a.state !== 'down' && a.state !== 'gone').length;

/** A shot from o along d (the scope's line, the deviations already applied by the caller): the hit, the result */
export function huntShoot(h, o, d) {
  if (h.ammo <= 0 || h.done) return null;
  h.ammo--;
  const hit = ibexRayHit(h.herd, o, d);
  const range = hit ? hit.t : Math.hypot(herdCentre(h.herd).x - o.x, herdCentre(h.herd).z - o.z);
  const res = ibexShotResult(hit, range);
  h.score += res.points;
  h.shots.push({ ...res, range: Math.round(range) });
  if (hit && (res.kind === 'clean' || res.kind === 'body' || res.kind === 'forbidden')) { hit.animal.state = 'down'; hit.animal.down = 0; hit.animal.hit = res.kind; }
  if (res.kind !== 'clean') { stepHerd(h.herd, 0, h.rand, { flee: o }); h.flees++; }
  if (huntLegalLeft(h) === 0 || h.ammo <= 0) h.done = true;
  return res;
}

export const IBEX_MISSION = {
  id: 'ibex-hunt',
  title: 'Ibex hunt: the Bündner Hochjagd',
  intro: 'September, the Bündner Hochjagd: an ibex herd stands on the steep flank above the Schatzalp towards the Strela. Walk slowly to the stand (running or the wind at your back gives you away), then aim with the scope: drag to aim, right click / Z / the Scope button zooms, Shift or "Breath" steadies it. Only an old buck with long horns (75 cm and more) may be taken: nannies, kids and young bucks are protected. A clean shot goes behind the shoulder; the wind drifts the bullet. Four rounds.',
  mode: 'person',
  season: 'summer',
  time: 'golden',
  features: ['ibexHunt'],
  scoreMode: LOCAL_SCORE_MODE,
  medals: { gold: 400, silver: 260, bronze: 120 },
  colour: '#8b5a2b',
  icon: 'ibex',
  finish: 'Weidmannsheil! The game warden notes the trophies in your permit.',
  start: { ...IBEX.start },
  props: [],
  createState() { return { hunt: createHunt(3) }; },
  score: (state) => Math.max(0, state.hunt.score),
  summary(state) {
    const h = state.hunt;
    return h.shots.length ? h.shots.map((s) => `${s.text} (${s.points >= 0 ? '+' : ''}${s.points})`) : ['No shot fired'];
  },
  objectives: [
    {
      id: 'stalk',
      title: 'Stalk to the stand',
      check(ctx, state) {
        const h = state.hunt;
        const d = dist(ctx, IBEX.stand);
        return { done: d < IBEX.stand.r, progress: null, text: `${fmtDist(d)} to the stand${h.alarmWhy ? ` · the herd is uneasy: ${h.alarmWhy}` : ''}`, target: { ...IBEX.stand, style: 'plain' }, hint: 'Walk, do not run' };
      }
    },
    {
      id: 'hunt',
      title: 'Take an old buck',
      check(ctx, state) {
        const h = state.hunt;
        const c = herdCentre(h.herd);
        return { done: h.done, progress: null, text: `${h.ammo} ${h.ammo === 1 ? 'round' : 'rounds'} · ${Math.max(0, h.score)} pts · herd ${fmtDist(dist(ctx, c))}`, target: null, hint: 'Z / right click: scope · Shift: hold breath · Space / click: fire' };
      }
    }
  ]
};

// =====================================================================================================================
// 5. Feeding the squirrels on the Seepromenade
// =====================================================================================================================
// Davos has no "Eichhörnliweg" of that name (the famous one is in Arosa); its squirrels are fed on the Seepromenade
// along the east shore of the Davosersee, where OSM marks the "Eichhörnliplatz" (n8518492990, tourism=attraction),
// and on the Hohe Promenade. The trail: OSM w64282569 "Seepromenade" (1 km through the larch wood).
export const SEEPROMENADE = [1693.1, -2281.4, 1682.8, -2315.4, 1684.2, -2326.7, 1687.7, -2339.1, 1693.5, -2347.7, 1708.3, -2362.2, 1724.2, -2372.9, 1741.3, -2383, 1762.9, -2398.1, 1787.9, -2415.6, 1809.8, -2415.9, 1828.8, -2430.4, 1836.5, -2446, 1841.2, -2454.9, 1864.5, -2497.9, 1870.9, -2503.5, 1876.3, -2504.7, 1891.8, -2492.4, 1901.4, -2487.6, 1947.1, -2513.2, 1958.3, -2557, 1978.4, -2582.2, 1988.9, -2595.4, 1996.4, -2606.7, 2003.6, -2616, 2015.9, -2632.5, 2027.4, -2658.8, 2046.6, -2686.1, 2061.3, -2715.8, 2072.6, -2736.6, 2081.6, -2753.6, 2092.2, -2768.8, 2141.5, -2837.6, 2157.3, -2857.1, 2177.2, -2871.3, 2197.7, -2893.3, 2212, -2903.6, 2215.6, -2906.2, 2233.4, -2925.9, 2254, -2963, 2263.8, -2987, 2264.6, -2998, 2261.5, -3006.5];
export const EICHHOERNLIPLATZ = { x: 1966.7, z: -2550.8 };
export const SQUIRREL = {
  length: 180, // s
  maxActive: 3,
  spawnNear: 6, spawnFar: 26, // m from the player
  lure: 19, // m: a squirrel on the ground notices the nut
  still: 0.35, // m/s: standing still
  nervous: 1.4, // m/s: moving this fast scares an approaching squirrel
  panic: 3.4, // m/s: running scares every squirrel within panicR
  panicR: 12,
  take: 1.1, // s at the hand
  reach: 0.75, // m
  hop: 1.6, // m/s on the ground
  climb: 1.8, // m/s down the trunk
  cooldown: 30, // s a tree rests after its squirrel left or fled
  points: { fed: 100, streak: 25, maxStreak: 5 }
};

/** Spots for squirrels: points every `step` m, alternately 5-8 m left and right of the trail (`trees`, when given,
 *  [{x, z}] near the trail, are preferred: the runtime passes the trees of js/tlm-trees-data.js) */
export function squirrelSpots(pts = SEEPROMENADE, step = 14, trees = null, rand = seededRandom(11)) {
  const out = [];
  let s = 0, next = step * 0.5, side = 1;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    while (next <= s + L) {
      const t = next - s;
      const off = 5 + rand() * 3;
      let x = ax + ux * t + uz * off * side, z = az + uz * t - ux * off * side;
      if (trees && trees.length) {
        let best = null, bd = 9;
        for (const tr of trees) { const d = Math.hypot(tr.x - x, tr.z - z); if (d < bd) { bd = d; best = tr; } }
        if (best) { x = best.x; z = best.z; }
      }
      out.push({ x, z, s: next, cool: 0, used: false });
      side = -side;
      next += step;
    }
    s += L;
  }
  return out;
}

export function createSquirrelGame(spots) {
  return { spots, squirrels: [], t: 0, fed: 0, fled: 0, streak: 0, best: 0, score: 0, done: false, ids: 0, last: null };
}

/**
 * One step: the player { x, z, speed, offering }; squirrels come down near the player, notice a held-out nut, hop
 * closer while the player stays still, take the nut; any haste scares them back up.
 */
export function stepSquirrels(g, p, dt, rand) {
  if (g.done) return g;
  g.t += dt;
  if (g.t >= SQUIRREL.length) g.done = true;
  for (const sp of g.spots) sp.cool = Math.max(0, sp.cool - dt);
  // new squirrels at free trees near the player
  const active = g.squirrels.filter((s) => s.state !== 'gone');
  if (active.length < SQUIRREL.maxActive && !g.done) {
    const free = g.spots.filter((sp) => !sp.used && sp.cool <= 0 && (() => { const d = Math.hypot(sp.x - p.x, sp.z - p.z); return d > SQUIRREL.spawnNear && d < SQUIRREL.spawnFar; })());
    if (free.length && rand() < dt * 1.5) {
      const sp = free[Math.floor(rand() * free.length)];
      sp.used = true;
      g.squirrels.push({ id: ++g.ids, spot: sp, x: sp.x, z: sp.z, y: 4 + rand() * 3, state: 'down', t: 0, heading: rand() * 6.28, hop: 0, sit: 6 + rand() * 6 });
    }
  }
  const panic = p.speed > SQUIRREL.panic;
  for (const s of g.squirrels) {
    if (s.state === 'gone') continue;
    const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
    s.t += dt;
    const scare = () => { s.state = 'flee'; s.t = 0; g.fled++; g.streak = 0; g.last = { kind: 'fled', at: g.t }; };
    if ((s.state === 'ground' || s.state === 'approach' || s.state === 'eat') && panic && d < SQUIRREL.panicR) scare();
    switch (s.state) {
      case 'down': // down the trunk
        s.y = Math.max(0, s.y - SQUIRREL.climb * dt);
        if (s.y <= 0) { s.state = 'ground'; s.t = 0; }
        break;
      case 'ground': // sits, looks about; a nut held out within reach of its nose brings it over
        if (p.offering && d < SQUIRREL.lure && p.speed < SQUIRREL.still) { s.state = 'approach'; s.t = 0; }
        else if (s.t > s.sit) { s.state = 'up'; s.t = 0; }
        break;
      case 'approach': {
        if (p.speed > SQUIRREL.nervous || !p.offering) { if (p.speed > SQUIRREL.nervous) scare(); else { s.state = 'ground'; s.t = 0; } break; }
        s.heading = Math.atan2(dx, dz);
        if (d > SQUIRREL.reach) {
          const step = Math.min(d - SQUIRREL.reach * 0.8, SQUIRREL.hop * dt * (0.6 + 0.8 * Math.abs(Math.sin(s.t * 6))));
          s.x += (dx / d) * step; s.z += (dz / d) * step;
          s.hop = Math.abs(Math.sin(s.t * 9)) * 0.18;
        } else { s.state = 'eat'; s.t = 0; s.hop = 0; }
        break;
      }
      case 'eat':
        if (p.speed > SQUIRREL.nervous) { scare(); break; }
        if (!p.offering) { s.state = 'ground'; s.t = 0; break; }
        if (s.t >= SQUIRREL.take) {
          g.fed++; g.streak++; g.best = Math.max(g.best, g.streak);
          const pts = SQUIRREL.points.fed + SQUIRREL.points.streak * Math.min(SQUIRREL.points.maxStreak, g.streak - 1);
          g.score += pts;
          g.last = { kind: 'fed', points: pts, at: g.t };
          s.state = 'leave'; s.t = 0;
        }
        break;
      case 'leave': case 'flee': case 'up': {
        // back to its tree and up
        const tx = s.spot.x - s.x, tz = s.spot.z - s.z, td = Math.hypot(tx, tz);
        const v = s.state === 'flee' ? 5 : 2.2;
        if (td > 0.2) { s.heading = Math.atan2(tx, tz); const st = Math.min(td, v * dt); s.x += (tx / td) * st; s.z += (tz / td) * st; s.hop = Math.abs(Math.sin(s.t * 12)) * 0.2; }
        else { s.y += SQUIRREL.climb * 2 * dt; s.hop = 0; if (s.y > 5) { s.state = 'gone'; s.spot.used = false; s.spot.cool = SQUIRREL.cooldown; } }
        break;
      }
    }
  }
  g.squirrels = g.squirrels.filter((s) => s.state !== 'gone');
  return g;
}

/** The point on the trail nearest (x, z) and the arc length there */
export function nearestOnTrail(x, z, pts = SEEPROMENADE) {
  let best = null, s = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
    const t = L2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1) : 0;
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { x: px, z: pz, d, s: s + L * t, heading: Math.atan2(dx, dz) };
    s += L;
  }
  return best;
}

const SQUIRREL_START = { x: 1930.5, z: -2504.5 };
const SQUIRREL_SPOT = { x: 1956.5, z: -2547.5, r: 3 }; // on the path at the Eichhörnliplatz
export const SQUIRREL_MISSION = {
  id: 'squirrel-trail',
  title: 'Feeding the squirrels at the Davosersee',
  intro: 'The squirrels of the Seepromenade at the Davosersee (by the Eichhörnliplatz) are famously tame. Walk the lakeside path through the larch wood; when a squirrel comes down a trunk, stand still and hold out a hazelnut (hold E or the Nut button). Do not move while it hops over, or it is gone up the tree again; running scares them all. Three minutes: feed as many as you can.',
  mode: 'person',
  season: 'summer',
  time: 'golden',
  features: ['squirrels'],
  scoreMode: LOCAL_SCORE_MODE,
  medals: { gold: 1600, silver: 1100, bronze: 600 },
  colour: '#c0602b',
  icon: 'squirrel',
  finish: 'Out of nuts: the squirrels will remember you.',
  start: { x: SQUIRREL_START.x, z: SQUIRREL_START.z, heading: 2.6 },
  props: [],
  createState() { return { game: createSquirrelGame(squirrelSpots()) }; },
  score: (state) => state.game.score,
  summary(state) {
    const g = state.game;
    return [`${g.fed} squirrels fed · best streak ${g.best} · ${g.fled} scared away`];
  },
  objectives: [
    walkTo(SQUIRREL_SPOT, 'Walk to the Eichhörnliplatz', 'the Eichhörnliplatz', 'path'),
    {
      id: 'feed',
      title: 'Feed the squirrels (3 min)',
      check(ctx, state) {
        const g = state.game;
        const on = nearestOnTrail(ctx.x, ctx.z);
        const off = on && on.d > 18;
        return {
          done: g.done, progress: g.t / SQUIRREL.length,
          text: `${g.fed} fed · ${g.score} pts · ${fmtClock(SQUIRREL.length - g.t)}${g.streak > 1 ? ` · streak ${g.streak}` : ''}`,
          target: off ? { x: on.x, z: on.z } : null,
          hint: off ? 'Back to the lakeside path' : 'Stand still, hold E (Nut)'
        };
      }
    },
  ]
};

// =====================================================================================================================
// 6. Tennis in the Sporthalle Färbi
// =====================================================================================================================
// The Sporthalle Färbi, Clavadelerstrasse 5, Davos Platz (OSM w110598078: leisure=sports_hall, sport=tennis;…), the
// tennis halls of Davos Klosters (davos.ch). The court in metres: x across (singles sidelines ±4.115), z along (the
// player's baseline at +11.885, the coach's at −11.885), y up; the net 0.914 m in the middle.
export const FAERBI = { door: { x: -1206.5, z: 1387.9, r: 2.4 }, start: { x: -1209.8, z: 1393.0, heading: 0.55 } };
export const COURT = { halfW: 4.115, halfL: 11.885, service: 6.40, net: 0.914, ball: 0.033 };
export const TENNIS = {
  g: 9.81, bounce: 0.74, roll: 0.8, drag: 0.012,
  reach: 1.55, ideal: 0.85, height: [0.15, 2.4],
  run: 5.4, aiRun: 4.6,
  speed: [17, 27], // m/s of a stroke, by its quality
  serveSpeed: 24,
  winBy: 2, target: 7
};

export function createTennis(seed = 5) {
  const t = {
    rand: seededRandom(seed),
    p: { x: 0.5, z: COURT.halfL + 0.8, swing: 0, swingAt: -9 }, a: { x: -0.5, z: -COURT.halfL - 0.8, swing: 0, react: 0 },
    ball: { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, live: false, bounces: 0, side: 0, lastHit: null, served: false },
    score: { p: 0, a: 0 }, server: 'p', fault: 0, phase: 'serve', toss: null, wait: 0, t: 0, done: false, winner: null,
    rally: 0, last: null, points: [], aces: 0, winners: 0, errors: 0
  };
  placeServe(t);
  return t;
}

/** Who serves the n-th point of a tiebreak (0-based): the first serves one, then two each */
export const tiebreakServer = (n, first = 'p') => { const k = Math.floor((n + 1) / 2) % 2; return k === 0 ? first : first === 'p' ? 'a' : 'p'; };

function placeServe(t) {
  const n = t.score.p + t.score.a;
  t.server = tiebreakServer(n);
  const deuce = n % 2 === 0; // the deuce court (right of the server) on even points
  const sx = (deuce ? 1 : -1) * 0.8;
  if (t.server === 'p') { t.p.x = sx; t.p.z = COURT.halfL + 0.3; t.a.x = -sx * 2.5; t.a.z = -COURT.halfL - 0.5; }
  else { t.a.x = -sx; t.a.z = -COURT.halfL - 0.3; t.p.x = sx * 2.5; t.p.z = COURT.halfL + 0.5; }
  const b = t.ball;
  Object.assign(b, { live: false, bounces: 0, side: 0, lastHit: null, served: false, vx: 0, vy: 0, vz: 0 });
  t.phase = 'serve'; t.toss = null; t.wait = t.server === 'a' ? 1.2 : 0;
  syncBallToServer(t);
}
function syncBallToServer(t) {
  const s = t.server === 'p' ? t.p : t.a;
  Object.assign(t.ball, { x: s.x + 0.3, y: 1.0, z: s.z + (t.server === 'p' ? -0.2 : 0.2) });
}

/** The landing target and the velocity to get there in a flight of the given horizontal speed, clearing the net */
export function aimShot(from, to, speed, { net = COURT.net + 0.25, g = TENNIS.g } = {}) {
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz) || 1;
  let T = L / speed;
  let vy = 0;
  for (let k = 0; k < 12; k++) {
    vy = (0.03 - from.y + 0.5 * g * T * T) / T;
    // height at the net
    const tn = from.z !== 0 && Math.sign(from.z) !== Math.sign(to.z) ? (Math.abs(from.z) / Math.abs(dz)) * T : -1;
    const yn = tn > 0 ? from.y + vy * tn - 0.5 * g * tn * tn : Infinity;
    if (yn >= net) break;
    T *= 1.12; // slower and higher
  }
  return { vx: dx / T, vy, vz: dz / T };
}

/** The serve: into the diagonal service box, with an error by `quality` (0-1) */
function serveBall(t, who, quality) {
  const n = t.score.p + t.score.a, deuce = n % 2 === 0;
  const dirZ = who === 'p' ? -1 : 1;
  // the receiver's service box: diagonal from the server
  const boxX = (who === 'p' ? (deuce ? -1 : 1) : (deuce ? 1 : -1)) * COURT.halfW * 0.5;
  const err = (1 - quality) * 2.4;
  const target = { x: boxX + (t.rand() - 0.5) * err * 1.6, z: dirZ * (COURT.service - 1.0 + (t.rand() - 0.3) * err) };
  const b = t.ball;
  Object.assign(b, aimShot(b, target, TENNIS.serveSpeed * (0.8 + 0.25 * quality), { net: COURT.net + 0.12 }));
  b.live = true; b.bounces = 0; b.side = 0; b.lastHit = who; b.served = true;
  t.phase = 'rally'; t.rally = 0;
}

/** A stroke by `who` at quality q (0-1) towards the other side; `steer` -1..1 picks the side (player), else random */
function strokeBall(t, who, q, steer = null) {
  const dirZ = who === 'p' ? -1 : 1;
  const side = steer !== null ? steer : (t.rand() * 2 - 1);
  const err = (1 - q) * 3.2;
  const target = {
    x: clamp(side * COURT.halfW * 0.72, -COURT.halfW, COURT.halfW) + (t.rand() - 0.5) * err,
    z: dirZ * (COURT.halfL * (0.62 + 0.25 * q) + (t.rand() - 0.5) * err * 1.2)
  };
  const speed = TENNIS.speed[0] + (TENNIS.speed[1] - TENNIS.speed[0]) * q;
  const b = t.ball;
  if (b.y < 0.4) b.y = 0.4;
  Object.assign(b, aimShot(b, target, speed, { net: COURT.net + 0.15 + (1 - q) * 0.2 }));
  // a mistimed stroke: the net or long
  if (q < 0.25) { b.vy *= 0.55 + t.rand() * 0.9; }
  b.bounces = 0; b.side = 0; b.lastHit = who;
  t.rally++;
}

/** Where the ball is relative to a player: { ahead (m in front, towards the net), side, height, d } */
export function contact(t, who) {
  const s = who === 'p' ? t.p : t.a, b = t.ball, f = who === 'p' ? -1 : 1;
  return { ahead: (b.z - s.z) * f, side: b.x - s.x, height: b.y, d: Math.hypot(b.x - s.x, b.z - s.z) };
}

/** The quality of a swing now (0 = a miss): the ball in reach, in front, at a hittable height */
export function swingQuality(t, who) {
  const b = t.ball;
  if (!b.live || b.lastHit === who) return 0;
  const c = contact(t, who);
  if (c.d > TENNIS.reach || c.height < TENNIS.height[0] || c.height > TENNIS.height[1]) return 0;
  if (b.bounces === 0 && b.served) return 0; // (a serve must bounce first)
  const dIdeal = Math.abs(c.d - TENNIS.ideal) / TENNIS.reach;
  const front = clamp((c.ahead + 0.4) / 0.9, 0, 1);
  return clamp(1 - dIdeal * 1.4, 0, 1) * (0.45 + 0.55 * front);
}

function pointTo(t, who, why) {
  t.score[who]++;
  t.points.push({ who, why });
  t.last = { who, why, at: t.t };
  if (why === 'ace' && who === 'p') t.aces++;
  if (why === 'winner' && who === 'p') t.winners++;
  if (who === 'a' && (why === 'net' || why === 'out' || why === 'double fault')) t.errors++;
  const { p, a } = t.score;
  if ((p >= TENNIS.target || a >= TENNIS.target) && Math.abs(p - a) >= TENNIS.winBy) { t.done = true; t.winner = p > a ? 'p' : 'a'; t.phase = 'over'; return; }
  t.phase = 'between'; t.wait = 1.6;
}

/**
 * One step of the game. `input`: { x, z (-1..1: the player's move, z negative towards the net), swing (pressed this
 * frame), steer (-1..1 at the swing) }
 */
export function stepTennis(t, input, dt) {
  if (t.done) return t;
  t.t += dt;
  const P = t.p, A = t.a, b = t.ball;
  // the player runs on their half
  const mx = clamp(input.x || 0, -1, 1), mz = clamp(input.z || 0, -1, 1), ml = Math.hypot(mx, mz) || 1;
  const k = Math.min(1, ml);
  if (t.phase !== 'serve' || t.server !== 'p') {
    P.x = clamp(P.x + (mx / ml) * k * TENNIS.run * dt, -COURT.halfW - 3, COURT.halfW + 3);
    P.z = clamp(P.z + (mz / ml) * k * TENNIS.run * dt, 1.2, COURT.halfL + 4);
  }
  P.swing = Math.max(0, P.swing - dt); A.swing = Math.max(0, A.swing - dt);
  if (t.phase === 'between') { t.wait -= dt; if (t.wait <= 0) placeServe(t); return t; }
  if (t.phase === 'serve') {
    if (t.server === 'p') {
      if (input.swing && !t.toss) { t.toss = { t: 0 }; b.vy = 5.2; b.y = 1.2; }
      else if (t.toss) {
        t.toss.t += dt;
        b.vy -= TENNIS.g * dt; b.y += b.vy * dt;
        if (input.swing && t.toss.t > 0.15) {
          // best at the top of the toss (~0.53 s)
          const q = clamp(1 - Math.abs(t.toss.t - 0.53) * 2.2, 0.05, 1);
          P.swing = 0.3;
          serveBall(t, 'p', q);
          return t;
        }
        if (b.y < 0.6) { t.toss = null; syncBallToServer(t); } // (let it drop: toss again)
      }
      return t;
    }
    t.wait -= dt;
    if (t.wait <= 0) { A.swing = 0.3; b.y = 2.5; serveBall(t, 'a', 0.55 + t.rand() * 0.4); }
    return t;
  }
  // the rally: the ball flies, bounces, meets the net
  const prevZ = b.z;
  b.vy -= TENNIS.g * dt;
  b.vx *= 1 - TENNIS.drag * dt; b.vz *= 1 - TENNIS.drag * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  if (Math.sign(prevZ) !== Math.sign(b.z) && prevZ !== 0) {
    if (b.y < COURT.net) { b.vz *= -0.15; b.vx *= 0.3; b.z = prevZ; pointTo(t, b.lastHit === 'p' ? 'a' : 'p', 'net'); return t; }
  }
  if (b.y <= COURT.ball) {
    b.y = COURT.ball;
    b.vy = -b.vy * TENNIS.bounce; b.vx *= TENNIS.roll; b.vz *= TENNIS.roll;
    const sideHit = b.z > 0 ? 'p' : 'a';
    const hitter = b.lastHit;
    if (b.bounces === 0) {
      // the first bounce: in?
      let inside = Math.abs(b.x) <= COURT.halfW + 0.03 && Math.abs(b.z) <= COURT.halfL + 0.03 && sideHit !== hitter;
      if (b.served && t.rally === 0) {
        const n = t.score.p + t.score.a, deuce = n % 2 === 0;
        const boxSign = hitter === 'p' ? (deuce ? -1 : 1) : (deuce ? 1 : -1);
        inside = sideHit !== hitter && Math.abs(b.z) <= COURT.service + 0.03 && Math.sign(b.x || boxSign) === boxSign && Math.abs(b.x) <= COURT.halfW + 0.03;
        if (!inside) {
          t.fault++;
          if (t.fault >= 2) { t.fault = 0; pointTo(t, hitter === 'p' ? 'a' : 'p', 'double fault'); return t; }
          t.last = { who: null, why: 'fault', at: t.t };
          const keep = t.server; placeServe(t); t.server = keep; t.wait = keep === 'a' ? 1.0 : 0; return t;
        }
      }
      if (!inside) { pointTo(t, hitter === 'p' ? 'a' : 'p', 'out'); return t; }
      b.bounces = 1; b.side = sideHit;
    } else {
      // a second bounce: the hitter wins the point
      t.fault = 0;
      pointTo(t, hitter, b.served && t.rally === 0 ? 'ace' : 'winner');
      return t;
    }
  }
  if (Math.abs(b.z) > COURT.halfL + 9 || Math.abs(b.x) > COURT.halfW + 9) {
    pointTo(t, b.bounces ? b.lastHit : (b.lastHit === 'p' ? 'a' : 'p'), b.bounces ? 'winner' : 'out');
    return t;
  }
  // the player's swing
  if (input.swing && P.swing <= 0) {
    P.swing = 0.35;
    const q = swingQuality(t, 'p');
    if (q > 0) { t.fault = 0; strokeBall(t, 'p', q, clamp(input.steer ?? (contact(t, 'p').side > 0 ? -0.6 : 0.6), -1, 1)); }
  }
  // the coach: runs to where the ball will come down on his side and plays it
  if (b.lastHit === 'p' && b.vz < 0) {
    const pred = predictBall(b, -COURT.halfL * 0.85);
    const tx = pred ? pred.x : b.x, tz = clamp(pred ? pred.z - 0.3 : -COURT.halfL, -COURT.halfL - 3, -3);
    const dx = tx - A.x, dz = tz - A.z, d = Math.hypot(dx, dz);
    if (d > 0.1) { const s = Math.min(d, TENNIS.aiRun * dt); A.x += (dx / d) * s; A.z += (dz / d) * s; }
    if (b.bounces === 1 && A.swing <= 0) {
      const q = swingQuality(t, 'a');
      if (q > 0.35 || (q > 0 && contact(t, 'a').ahead < 0.1)) { A.swing = 0.35; t.fault = 0; strokeBall(t, 'a', clamp(q * (0.6 + t.rand() * 0.5), 0.1, 0.95)); }
    }
  } else {
    // back to the middle of the baseline
    const dx = -A.x * 0.6, dz = -COURT.halfL - 0.8 - A.z, d = Math.hypot(dx, dz);
    if (d > 0.1) { const s = Math.min(d, TENNIS.aiRun * 0.6 * dt); A.x += (dx / d) * s; A.z += (dz / d) * s; }
  }
  return t;
}

/** Where the ball will be after its next bounce when it is about `z` along: a rough look ahead */
export function predictBall(b, z) {
  let { x, y, vx, vy } = b, zz = b.z, vz = b.vz, bounces = b.bounces;
  for (let i = 0; i < 300; i++) {
    const h = 1 / 60;
    vy -= TENNIS.g * h; x += vx * h; y += vy * h; zz += vz * h;
    if (y <= COURT.ball) { y = COURT.ball; vy = -vy * TENNIS.bounce; vx *= TENNIS.roll; vz *= TENNIS.roll; bounces++; }
    if (bounces >= 1 && y > 0.5 && y < 1.4 && vy < 0) return { x, z: zz };
    if ((vz < 0 && zz < z) || (vz > 0 && zz > z)) { if (bounces >= 1) return { x, z: zz }; }
  }
  return { x, z: zz };
}

export const tennisScore = (t) => {
  if (!t) return 0;
  const { p, a } = t.score;
  if (t.winner === 'p') return Math.max(400, 1000 - 80 * a);
  return Math.min(300, 50 * p);
};

export const TENNIS_MISSION = {
  id: 'tennis-hall',
  title: 'Tiebreak in the Färbi tennis hall',
  intro: 'The coach of the tennis club challenges you to a tiebreak in the Sporthalle Färbi: first to seven points, two clear. Move with W A S D (the joystick), swing with Space, a click or the Swing button when the ball is beside you, after its bounce; A/D held at the swing aim it left or right. To serve: Space tosses the ball, Space again at the top of the toss hits it.',
  mode: 'person',
  season: null,
  time: 'midday',
  features: ['tennis'],
  scoreMode: LOCAL_SCORE_MODE,
  medals: { gold: 760, silver: 600, bronze: 400 },
  colour: '#c6e33b',
  icon: 'tennis',
  finish: 'Game, set … well, tiebreak. The coach shakes your hand at the net.',
  start: { ...FAERBI.start },
  props: [],
  createState() { return { game: null }; },
  score: (state) => tennisScore(state.game),
  summary(state) {
    const g = state.game;
    return g ? [`Tiebreak ${g.score.p} : ${g.score.a} · ${g.aces} aces · ${g.winners} winners`] : [];
  },
  objectives: [
    walkTo(FAERBI.door, 'Go into the Sporthalle Färbi', 'the tennis hall'),
    {
      id: 'tiebreak',
      title: 'Play the tiebreak (first to 7)',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'Warming up …', target: null, hint: null };
        return { done: g.done, progress: Math.max(g.score.p, g.score.a) / TENNIS.target, text: `You ${g.score.p} : ${g.score.a} Coach${g.phase === 'serve' ? (g.server === 'p' ? ' · your serve' : ' · coach serves') : ''}`, target: null, hint: 'WASD: run · Space / click: swing · A/D at the swing: aim' };
      }
    }
  ]
};

// =====================================================================================================================
// 7. The eau-là-là slide, against the clock
// =====================================================================================================================
// The eau-là-là (Promenade 90): the slide's tower beside the pool hall (js/landmark-buildings-data.js KONGRESS.slide).
// The ride: a tube of segments { len (m), curve (1/m, + to the left), slope (drop per m) } — the "Black Hole", longer
// than the helix seen from outside (most of it runs through the hall). The rider sits at angle θ in the tube (0 at the
// bottom, + up the outer wall of a bend): the bend pushes him up the wall to θeq = atan(v²κ/g); leaning (steer) holds
// him lower (a shorter line) or lets him climb. Too high on the wall rubs and brakes; flat across a bend is a jolt.
// (the start on the pool terrace, the slide's entrance by the pool: both clear of the hall's walls)
export const EAU = { stairs: { x: 103, z: -514, r: 2.6 }, start: { x: 95, z: -507, heading: 2.29 }, slide: { x: 119.5, z: -515.5 } };
export const SLIDE = {
  tube: 0.65, g: 9.81, mu: 0.035, drag: 0.012,
  lean: 0.35, // rad the rider's lean shifts θ (a key held: all of it)
  over: 1.3, // left alone, the rider's momentum carries him this much past θeq
  follow: 4, // 1/s: θ settles this fast
  rub: 14, // braking per rad² above θeq + rubFree
  rubFree: 0.08,
  jolt: 8, // braking per rad² below θeq − joltFree
  joltFree: 0.3,
  flip: 1.45, // rad: higher than this the rider flips (a big brake)
  segments: [
    { len: 8, curve: 0, slope: 0.22 },
    { len: 24, curve: 1 / 5, slope: 0.12 },
    { len: 10, curve: 0, slope: 0.16 },
    { len: 20, curve: -1 / 6, slope: 0.11 },
    { len: 14, curve: 1 / 4.5, slope: 0.12 },
    { len: 12, curve: 0, slope: 0.18 },
    { len: 26, curve: -1 / 5, slope: 0.1 },
    { len: 10, curve: 1 / 7, slope: 0.12 },
    { len: 18, curve: -1 / 4, slope: 0.13 },
    { len: 12, curve: 0, slope: 0.2 },
    { len: 22, curve: 1 / 5.5, slope: 0.1 },
    { len: 8, curve: 0, slope: 0.06 }
  ]
};
export const slideLength = (segs = SLIDE.segments) => segs.reduce((a, s) => a + s.len, 0);
export function slideAt(s, segs = SLIDE.segments) {
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (s < acc + segs[i].len || i === segs.length - 1) return { ...segs[i], i, along: s - acc };
    acc += segs[i].len;
  }
  return { ...segs[segs.length - 1], i: segs.length - 1, along: 0 };
}
/** The tube's centreline as points every `step` m: { x, y, z, heading } from (0, 0, 0) heading 0 (local frame) */
export function slideCenterline(step = 1, segs = SLIDE.segments) {
  const out = [];
  let x = 0, y = 0, z = 0, h = 0;
  const L = slideLength(segs);
  for (let s = 0; s <= L + 1e-6; s += step) {
    out.push({ x, y, z, heading: h, s });
    const seg = slideAt(s, segs);
    const run = step / Math.sqrt(1 + seg.slope * seg.slope);
    h += seg.curve * step;
    x += Math.sin(h) * run; z += Math.cos(h) * run; y -= seg.slope * run;
  }
  return out;
}

export const createRider = () => ({ s: 0, v: 1.2, theta: 0, t: 0, done: false, rubT: 0, joltT: 0, flips: 0, top: 0 });

/** The equilibrium angle on the wall for speed v in a bend of curvature κ (signed: + up the outer wall of a left bend) */
export const thetaEq = (v, curve) => Math.atan((v * v * curve) / SLIDE.g);

/** One step of the ride; steer −1..1 (positive: lean to the left, i.e. down the wall of a left bend's outer side) */
export function stepRider(r, steer, dt, segs = SLIDE.segments) {
  if (r.done) return r;
  r.t += dt;
  const seg = slideAt(r.s, segs);
  const eq = thetaEq(r.v, seg.curve);
  // leaning to the inside of the bend holds the rider lower: steer in the bend's direction lowers |θ|
  const target = eq * SLIDE.over - clamp(steer, -1, 1) * SLIDE.lean * (seg.curve === 0 ? 0.6 : 1);
  r.theta += (target - r.theta) * Math.min(1, dt * SLIDE.follow);
  const dev = (r.theta - eq) * Math.sign(seg.curve || 1);
  let brake = 0;
  if (seg.curve !== 0) {
    if (dev > SLIDE.rubFree) { brake += SLIDE.rub * (dev - SLIDE.rubFree) ** 2 * r.v; r.rubT += dt; }
    if (dev < -SLIDE.joltFree && steer * seg.curve > 0) { brake += SLIDE.jolt * (-dev - SLIDE.joltFree) ** 2 * r.v; r.joltT += dt; } // (leant too far in: the bumps of the inner wall)
  } else if (Math.abs(r.theta) > 0.6) brake += 0.5 * (Math.abs(r.theta) - 0.6) * r.v;
  if (Math.abs(r.theta) > SLIDE.flip) { brake += 3 * r.v; r.flips += dt; }
  const slope = seg.slope / Math.sqrt(1 + seg.slope * seg.slope);
  const normal = Math.hypot(SLIDE.g, r.v * r.v * seg.curve); // (the bend presses the rider into the tube)
  const acc = SLIDE.g * slope - SLIDE.mu * normal - SLIDE.drag * r.v * r.v - brake;
  r.v = Math.max(0.6, r.v + acc * dt);
  r.top = Math.max(r.top, r.v);
  // the line: high on the outer wall is longer than the centreline (radius R + tube·sin θ)
  const k = seg.curve;
  const lineFactor = k !== 0 ? 1 + Math.abs(k) * SLIDE.tube * Math.sin(Math.abs(r.theta)) * Math.sign(r.theta * k) : 1;
  r.s += (r.v * dt) / Math.max(0.6, lineFactor);
  if (r.s >= slideLength(segs)) { r.s = slideLength(segs); r.done = true; }
  return r;
}

/** A good rider: leans just enough to stay a little below the equilibrium */
export function idealSteer(r, segs = SLIDE.segments) {
  const seg = slideAt(r.s, segs);
  if (seg.curve === 0) return clamp(r.theta * 2, -1, 1);
  const eq = thetaEq(r.v, seg.curve);
  return clamp((eq * (SLIDE.over - 1) + 0.04 * Math.sign(seg.curve)) / SLIDE.lean, -1, 1);
}

export const WATERSLIDE_MISSION = {
  id: 'waterslide-race',
  title: 'Slide race at the eau-là-là',
  intro: 'The eau-là-là\'s slide against the clock. Climb the tower and go: in the bends the speed pushes you up the wall; lean with A / D (← / →, or the joystick) to hold the ideal line just below that. Too high on the wall rubs and brakes, too low jolts you. Splash down in the pool as fast as you can.',
  mode: 'person',
  season: 'summer',
  time: 'midday',
  features: ['waterslide'],
  bonusMs: 41 * 1000,
  medals: { gold: 41 * 1000, silver: 46 * 1000, bronze: 57 * 1000 },
  colour: '#2fd0e0',
  icon: 'slide',
  finish: 'Splash! Into the pool at full speed.',
  start: { ...EAU.start },
  props: [],
  createState() { return { rider: null }; },
  summary(state) {
    const r = state.rider;
    return r ? [`Top speed ${(r.top * 3.6).toFixed(0)} km/h · on the wall ${r.rubT.toFixed(1)} s · jolts ${r.joltT.toFixed(1)} s`] : [];
  },
  objectives: [
    walkTo(EAU.stairs, 'Up the slide tower', 'the slide tower'),
    {
      id: 'slide',
      title: 'Slide down!',
      allowModes: ['person'],
      check(ctx, state) {
        const r = state.rider;
        if (!r) return { done: false, progress: 0, text: 'Sit down at the top …', target: null, hint: null };
        return { done: r.done, progress: r.s / slideLength(), text: `${(r.v * 3.6).toFixed(0)} km/h · ${fmtDist(slideLength() - r.s)} to the pool`, target: null, hint: 'A / D or ← / →: lean into the bends' };
      }
    }
  ]
};

// =====================================================================================================================
// 8. Paint a Kirchner
// =====================================================================================================================
// Ernst Ludwig Kirchner lived in Davos from 1917 to his death in 1938 and painted its mountains and villages in strong,
// flat colours with black outlines. The Kirchner Museum (Promenade 82, Davos Platz; js/city-config.js teleport
// 'kirchner'): an easel on the forecourt facing the valley. The painting is judged on a coarse grid: its colours against
// a posterised template of the view (the renderer's picture mapped to the palette), how much strong colour it has, and
// whether the template's edges got a black contour. (Only the palette and the style: no artwork is reproduced.)
export const KIRCHNER = {
  easel: { x: -231.4, z: -504.8, r: 2.4 },
  start: { x: -235.6, z: -511.8, heading: 0.7 },
  view: { heading: -0.3, pitch: 0.02, height: 22 }, // the view from above the museum: down the valley to the south, the Jakobshorn on the left, the Schatzalp side on the right
  length: 180,
  grid: [24, 16],
  points: { likeness: 600, colour: 200, contour: 200 }
};
export const KIRCHNER_PALETTE = [
  { id: 'ultramarine', name: 'Ultramarine', hex: '#1f3fbf', family: 'blue' },
  { id: 'cobalt', name: 'Cobalt', hex: '#2f86d6', family: 'blue' },
  { id: 'emerald', name: 'Emerald', hex: '#13a36b', family: 'green' },
  { id: 'vermilion', name: 'Vermilion', hex: '#e2401f', family: 'red' },
  { id: 'pink', name: 'Pink', hex: '#ef7fb4', family: 'red' },
  { id: 'yellow', name: 'Yellow', hex: '#f5cf1d', family: 'warm' },
  { id: 'violet', name: 'Violet', hex: '#7a3fa6', family: 'dark' },
  { id: 'black', name: 'Black', hex: '#141014', family: 'dark' }
];
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const PALETTE_RGB = KIRCHNER_PALETTE.map((p) => hexRgb(p.hex));

/** RGB (0-255) → HSV (h 0-360, s and v 0-1) */
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return { h, s: mx > 0 ? d / mx : 0, v: mx };
}

/** A pixel of the view (the renderer's picture) as Kirchner might paint it: the palette index (stylised: the sky
 *  ultramarine / cobalt, the meadows and woods emerald, the shadows violet, the light yellow / pink, roofs vermilion) */
export function kirchnerIndex(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (v < 0.08) return 7; // black
  if (h >= 70 && h < 190 && s > 0.2 && v >= 0.12) return v > 0.75 && h < 95 ? 5 : 2; // the woods, dark as they are: emerald
  if (v < 0.25) return 6; // violet shadow
  if (s < 0.14) return v > 0.82 ? 4 : v > 0.55 ? 1 : 6; // snow and cloud pink, grey cobalt, dark violet
  if (h >= 190 && h < 255) return v > 0.7 ? 1 : 0;
  if (h >= 255 && h < 320) return 6;
  if (h >= 70 && h < 190) return v > 0.75 && h < 95 ? 5 : 2;
  if (h >= 40 && h < 70) return 5;
  if (h >= 320 || h < 15) return v > 0.75 && s < 0.5 ? 4 : 3;
  return v > 0.65 ? 5 : 3; // 15-40: orange: yellow in the light, vermilion else
}

/** The nearest palette colour of a painted pixel (the painting only has palette colours, blended at the edges) */
export function nearestPalette(r, g, b) {
  let best = 0, bd = Infinity;
  PALETTE_RGB.forEach(([pr, pg, pb], i) => { const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

/** How alike two palette colours are: 1 the same, 0.5 the same family, 0 else */
export function paletteMatch(a, b) {
  if (a < 0 || b < 0) return 0;
  if (a === b) return 1;
  return KIRCHNER_PALETTE[a].family === KIRCHNER_PALETTE[b].family ? 0.5 : 0;
}

/**
 * Scores a painting: `template` and `painted` are { cells: Int8Array (palette index a cell, −1 empty), edges:
 * Uint8Array (1: an edge / a black contour in the cell) } on the same grid. Returns { likeness, colour, contour,
 * coverage (0-1 each), points }
 */
export function scorePainting(template, painted) {
  const n = template.cells.length;
  let like = 0, filled = 0, strong = 0, edgeCells = 0, contoured = 0;
  for (let i = 0; i < n; i++) {
    const p = painted.cells[i];
    if (p >= 0) { filled++; if (p !== 7) strong++; }
    like += paletteMatch(template.cells[i], p);
    if (template.edges[i]) { edgeCells++; if (painted.edges[i] || p === 7) contoured++; }
  }
  const coverage = filled / n;
  const likeness = like / n;
  const colour = filled ? (strong / filled) * coverage : 0;
  const contour = edgeCells ? Math.min(1, (contoured / edgeCells) * 1.25) : 0;
  // (contours drawn over an empty canvas earn nothing: the outlines count with the painting under them)
  const P = KIRCHNER.points;
  const points = Math.round(P.likeness * likeness + P.colour * colour + P.contour * contour * Math.min(1, coverage * 1.5));
  return { likeness, colour, contour, coverage, points };
}

/** The template's edges: a cell is an edge when its colour differs from its right or lower neighbour's family */
export function templateEdges(cells, cols, rows) {
  const e = new Uint8Array(cells.length);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x, c = cells[i];
    if (x + 1 < cols && paletteMatch(c, cells[i + 1]) < 1 && KIRCHNER_PALETTE[c].family !== KIRCHNER_PALETTE[cells[i + 1]].family) e[i] = 1;
    if (y + 1 < rows && KIRCHNER_PALETTE[c].family !== KIRCHNER_PALETTE[cells[i + cols]].family) e[i] = 1;
  }
  return e;
}

/** The dominant value of each grid cell of an index image (w × h, values −1..7) */
export function gridMode(img, w, h, cols, rows, { ignore = -1 } = {}) {
  const out = new Int8Array(cols * rows).fill(-1);
  const counts = new Uint32Array(9);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    counts.fill(0);
    const x0 = Math.floor((cx * w) / cols), x1 = Math.floor(((cx + 1) * w) / cols), y0 = Math.floor((cy * h) / rows), y1 = Math.floor(((cy + 1) * h) / rows);
    let total = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = img[y * w + x]; counts[v + 1]++; total++; }
    let best = -1, bc = 0;
    for (let v = 0; v < 8; v++) if (counts[v + 1] > bc) { bc = counts[v + 1]; best = v; }
    // a cell counts as painted once a quarter of it is
    out[cy * cols + cx] = bc >= Math.max(1, total * 0.25) || ignore !== -1 ? best : -1;
  }
  return out;
}

export const KIRCHNER_MISSION = {
  id: 'paint-kirchner',
  title: 'Paint a Kirchner',
  intro: 'Ernst Ludwig Kirchner painted Davos in blazing colours: blue mountains, green slopes, pink snow, black outlines. Set up the easel in front of the Kirchner Museum and paint the view in his palette: pick a colour and a brush and paint with the mouse or a finger, outline with black. "Template" lays a posterised version of the view over the canvas. Three minutes; the likeness, the strong colours and the contours count. Your picture can be saved.',
  mode: 'person',
  season: 'summer',
  time: 'golden',
  features: ['kirchner'],
  scoreMode: LOCAL_SCORE_MODE,
  medals: { gold: 620, silver: 450, bronze: 280 },
  colour: '#e2401f',
  icon: 'brush',
  finish: 'The paint is still wet: an expressionist view of Davos.',
  start: { ...KIRCHNER.start },
  props: [],
  createState() { return { paint: null }; },
  score: (state) => state.paint?.result?.points ?? 0,
  summary(state) {
    const r = state.paint?.result;
    return r ? [`Likeness ${Math.round(r.likeness * 100)} % · colour ${Math.round(r.colour * 100)} % · contours ${Math.round(r.contour * 100)} %`] : [];
  },
  objectives: [
    walkTo(KIRCHNER.easel, 'Go to the easel at the Kirchner Museum', 'the easel'),
    {
      id: 'paint',
      title: 'Paint the view (3 min)',
      allowModes: ['person'],
      check(ctx, state) {
        const p = state.paint;
        if (!p) return { done: false, progress: 0, text: 'Setting up the easel …', target: null, hint: null };
        return { done: !!p.result, progress: Math.min(1, p.t / KIRCHNER.length), text: p.result ? 'Finished' : `${fmtClock(KIRCHNER.length - p.t)} left`, target: null, hint: 'Paint with the mouse / a finger · Done when you are happy' };
      }
    }
  ]
};

export const LOCAL_MISSIONS = [BEER_MISSION, GIPFELI_MISSION, RACLETTE_MISSION, IBEX_MISSION, SQUIRREL_MISSION, TENNIS_MISSION, WATERSLIDE_MISSION, KIRCHNER_MISSION];
