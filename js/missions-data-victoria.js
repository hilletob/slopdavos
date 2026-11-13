import { seededRandom } from './missions-data-local.js';
import { walkInto } from './missions-data-gastro.js';

// js/missions-data-victoria.js
// A shift behind the scenes of the Turmhotel Victoria, Alte Flüelastrasse 2, Davos Dorf (building w117012157 of
// js/davos-geodata.js, OSM n623883946). js/missions-data.js spreads VICTORIA_MISSIONS into MISSIONS; js/missions-victoria.js
// has the runtime (the three rooms on js/missions-gastro.js's indoor framework). Like the other data modules: no three.js
// and no DOM in here, so that tests/missions-victoria.test.mjs drives the three games with synthetic frames.
//
//  1. housekeeping: two rooms to turn round before their guests come back. Pick a chore (1-7 or tap), then work it with
//     alternating strokes (A/D, ←/→ or the two pads): the bed, the towels, the bath, the mirror, the bin, the minibar,
//     and a chocolate on the pillow once the bed is made. Not everything fits in the time: the big chores pay most.
//  2. kitchen: the hotel kitchen at lunch. Orders come to the pass; a burner key (1-3) puts the next one on a free
//     burner, the same key plates it. Each dish cooks at its own pace: plate it in the green, before it burns.
//  3. laundry: the Lingerie in the basement. Sort the hotel's linen into whites and colours (one red napkin in the white
//     wash and the sheets come out pink), then feed five sheets through the big mangle, steering them straight.
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z, south).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// The staff door in the middle of the south front, towards the Alte Flüelastrasse (1 m out of the wall from 955.7/-1743.1
// to 980.1/-1747.1); the start a few metres down on the forecourt, facing it.
export const VICTORIA = { door: { x: 968.1, z: -1744.1, r: 2.4 }, start: { x: 970.2, z: -1735.5 } };

const say = (g, text, points, good) => { g.seq++; g.last = { text, points: Math.round(points), good, seq: g.seq }; };
/** Inside the window: its share of the full points (half at the edge, all in the middle), or null outside */
function share(v, lo, hi) {
  if (v < lo || v > hi) return null;
  const c = (lo + hi) / 2, h = (hi - lo) / 2;
  return 0.5 + 0.5 * (1 - Math.abs(v - c) / h);
}

// =====================================================================================================================
// 1. Housekeeping
// =====================================================================================================================
export const CHORES = {
  bed: { name: 'Make the bed', strokes: 14, points: 120 },
  towels: { name: 'Fresh towels', strokes: 6, points: 60 },
  bath: { name: 'Scrub the bath', strokes: 16, points: 100 },
  mirror: { name: 'Polish the mirror', strokes: 10, points: 50 },
  bin: { name: 'Empty the bin', strokes: 4, points: 40 },
  minibar: { name: 'Fill the minibar', strokes: 8, points: 60 },
  chocolate: { name: 'Chocolate on the pillow', strokes: 2, points: 40, after: 'bed' }
};
export const CHORE_KEYS = Object.keys(CHORES); // (keys 1-7, in this order)
export const HOUSEKEEPING = {
  rooms: [
    { name: 'Room 204', guest: 'The Müllers from Basel', chores: ['bed', 'towels', 'bath', 'mirror', 'bin', 'chocolate'] },
    { name: 'The tower suite', guest: 'A Dutch family of five', chores: ['bed', 'minibar', 'bath', 'towels', 'mirror', 'bin', 'chocolate'] }
  ],
  time: [16, 18], // s until the guest comes back, a room
  timeBonus: 10, // a second left over, with every chore done
  allDone: 100,
  inspect: 1.8, // s the Gouvernante looks round between the rooms
  wrong: 0 // (a stroke to the same side twice does nothing: the cloth goes back and forth)
};

export function createHousekeeping() {
  return { room: 0, left: HOUSEKEEPING.time[0], phase: 'clean', phaseT: 0, chore: null, side: 0, prog: {}, done: [], strokes: 0, score: 0, results: [], perfect: 0, last: null, seq: 0, finished: false };
}
export const hkRoom = (g) => HOUSEKEEPING.rooms[Math.min(g.room, HOUSEKEEPING.rooms.length - 1)];
/** The chores still to do in this room (in the room's order) */
export const hkOpen = (g) => hkRoom(g).chores.filter((c) => !g.done.includes(c));
/** May this chore be worked now? (the chocolate waits for the bed) */
export const hkAllowed = (g, id) => hkRoom(g).chores.includes(id) && !g.done.includes(id) && (!CHORES[id].after || g.done.includes(CHORES[id].after));

/** Pick a chore. Returns 'pick' | 'blocked' (the chocolate before the bed) | null (nothing to pick here) */
export function hkPick(g, id) {
  if (g.finished || g.phase !== 'clean' || !hkRoom(g).chores.includes(id) || g.done.includes(id)) return null;
  if (!hkAllowed(g, id)) { say(g, 'Make the bed first', 0, false); return 'blocked'; }
  if (g.chore !== id) { g.chore = id; g.side = 0; }
  return 'pick';
}
/** One stroke of the cloth, to the left (-1) or right (1). Returns 'stroke' | 'same' (the same side twice: no use) |
 *  'chore' (the chore is done) | null */
export function hkStroke(g, side) {
  if (g.finished || g.phase !== 'clean') return null;
  if (!g.chore || !hkAllowed(g, g.chore)) { g.chore = hkOpen(g).find((c) => hkAllowed(g, c)) || null; g.side = 0; }
  if (!g.chore) return null;
  if (side === g.side) return 'same';
  g.side = side;
  g.strokes++;
  const c = CHORES[g.chore];
  g.prog[`${g.room}:${g.chore}`] = (g.prog[`${g.room}:${g.chore}`] || 0) + 1;
  if (g.prog[`${g.room}:${g.chore}`] < c.strokes) return 'stroke';
  g.done.push(g.chore);
  g.score += c.points;
  say(g, `${c.name}: done`, c.points, true);
  g.chore = hkOpen(g).find((x) => hkAllowed(g, x)) || null;
  g.side = 0;
  if (!hkOpen(g).length) endRoom(g);
  return 'chore';
}
/** A chore's progress 0-1 in the room now */
export const hkProgress = (g, id, room = g.room) => clamp((g.prog[`${room}:${id}`] || 0) / CHORES[id].strokes, 0, 1);

function endRoom(g) {
  const H = HOUSEKEEPING, open = hkOpen(g);
  let bonus = 0;
  if (!open.length) { bonus = H.allDone + Math.round(H.timeBonus * Math.max(0, g.left)); g.perfect++; }
  g.score += bonus;
  g.results.push({ room: hkRoom(g).name, done: g.done.length, of: hkRoom(g).chores.length, left: Math.max(0, g.left), bonus });
  if (open.length) say(g, `The guest is back: ${open.length} ${open.length === 1 ? 'chore' : 'chores'} undone`, 0, false);
  else say(g, `Spotless! ${Math.round(Math.max(0, g.left))} s to spare`, bonus, true);
  g.phase = 'inspect'; g.phaseT = 0; g.chore = null;
}
export function hkStep(g, dt) {
  if (g.finished || dt <= 0) return g;
  g.phaseT += dt;
  if (g.phase === 'clean') {
    g.left -= dt;
    if (g.left <= 0) { g.left = 0; endRoom(g); }
  } else if (g.phase === 'inspect' && g.phaseT >= HOUSEKEEPING.inspect) {
    if (g.room + 1 >= HOUSEKEEPING.rooms.length) { g.finished = true; return g; }
    g.room++; g.done = []; g.chore = null; g.side = 0;
    g.left = HOUSEKEEPING.time[g.room]; g.phase = 'clean'; g.phaseT = 0;
  }
  return g;
}

// =====================================================================================================================
// 2. The kitchen
// =====================================================================================================================
export const DISHES = {
  roesti: { name: 'Rösti', cook: 8.5, colour: '#e0b04a' },
  wurst: { name: 'Kalbsbratwurst', cook: 6.5, colour: '#c98a5a' },
  suppe: { name: 'Gerstensuppe', cook: 7.5, colour: '#d9c48e' },
  magronen: { name: 'Älplermagronen', cook: 10, colour: '#f0d27a' },
  capuns: { name: 'Capuns', cook: 11, colour: '#6f8f3a' }
};
// (the lunch service: the dish and when its ticket comes to the pass, s)
export const KITCHEN_ORDERS = [
  { dish: 'roesti', at: 0, table: 3 }, { dish: 'wurst', at: 1.2, table: 7 }, { dish: 'suppe', at: 4, table: 1 },
  { dish: 'capuns', at: 8, table: 5 }, { dish: 'magronen', at: 11, table: 2 }, { dish: 'wurst', at: 14, table: 9 },
  { dish: 'roesti', at: 17, table: 4 }, { dish: 'suppe', at: 20, table: 8 }
];
export const KITCHEN = {
  burners: 3,
  window: [0.9, 1.12], // the doneness that is right: plate it in here
  burnt: 1.4, // and here it is charcoal
  vary: 0.15, // a dish's own pace: ± this share of its time
  par: 52, // s for the whole service: quicker pays a bonus
  points: { dish: 120, under: 40, over: 45, raw: 0, burnt: -40, quick: 4 }
};

export function createKitchen(seed = 7) {
  const rand = seededRandom(seed);
  return { t: 0, rand, arrived: 0, queue: [], pans: Array(KITCHEN.burners).fill(null), served: [], score: 0, perfect: 0, burnt: 0, last: null, seq: 0, finished: false };
}
export function kitchenStep(g, dt) {
  if (g.finished || dt <= 0) return g;
  g.t += dt;
  while (g.arrived < KITCHEN_ORDERS.length && KITCHEN_ORDERS[g.arrived].at <= g.t) g.queue.push(g.arrived++);
  g.pans.forEach((p, i) => {
    if (!p) return;
    p.d += dt / p.cook;
    if (p.d >= KITCHEN.burnt) {
      g.score += KITCHEN.points.burnt; g.burnt++;
      g.served.push({ order: p.order, d: p.d, points: KITCHEN.points.burnt, burnt: true });
      say(g, `${DISHES[KITCHEN_ORDERS[p.order].dish].name}: burnt!`, KITCHEN.points.burnt, false);
      g.pans[i] = null;
    }
  });
  if (g.served.length >= KITCHEN_ORDERS.length) {
    const bonus = Math.max(0, Math.round((KITCHEN.par - g.t) * KITCHEN.points.quick));
    g.score += bonus;
    if (bonus) say(g, 'Service! A quick lunch', bonus, true);
    g.finished = true;
  }
  return g;
}
/** A burner's key: puts the next order on a free burner, plates what is on it. Returns 'place' | 'plate' | 'burnt'
 *  (never: burnt pans are cleared by the step) | null (an empty burner and nothing waiting) */
export function kitchenPress(g, i) {
  if (g.finished || i < 0 || i >= KITCHEN.burners) return null;
  const p = g.pans[i];
  if (!p) {
    if (!g.queue.length) return null;
    const order = g.queue.shift(), dish = DISHES[KITCHEN_ORDERS[order].dish];
    g.pans[i] = { order, d: 0, cook: dish.cook * (1 - KITCHEN.vary + 2 * KITCHEN.vary * g.rand()) };
    return 'place';
  }
  const K = KITCHEN, P = K.points, name = DISHES[KITCHEN_ORDERS[p.order].dish].name;
  const s = share(p.d, K.window[0], K.window[1]);
  let points;
  if (s !== null) {
    points = P.dish * s;
    if (s > 0.85) g.perfect++;
    say(g, s > 0.85 ? `${name}: perfect!` : `${name}: nicely done`, points, true);
  } else if (p.d < K.window[0]) {
    points = p.d < 0.6 ? P.raw : P.under * clamp((p.d - 0.6) / (K.window[0] - 0.6), 0, 1);
    say(g, p.d < 0.6 ? `${name}: still raw!` : `${name}: a touch underdone`, points, false);
  } else {
    points = P.over * clamp(1 - (p.d - K.window[1]) / (K.burnt - K.window[1]), 0, 1);
    say(g, `${name}: rather dark`, points, false);
  }
  g.score += points;
  g.served.push({ order: p.order, d: p.d, points: Math.round(points), burnt: false });
  g.pans[i] = null;
  return 'plate';
}

// =====================================================================================================================
// 3. The Lingerie: sorting, then the mangle
// =====================================================================================================================
export const LINEN = [
  { name: 'Bed sheet', white: true, colour: '#f6f6f2' }, { name: 'Red napkin', white: false, colour: '#c4262e' },
  { name: 'Pillowcase', white: true, colour: '#f1f0ea' }, { name: 'Bath towel', white: true, colour: '#fbfbf7' },
  { name: 'Blue tablecloth', white: false, colour: '#2f5ea8' }, { name: 'Duvet cover', white: true, colour: '#f3f2ec' },
  { name: 'A guest\'s red sock', white: false, colour: '#d42a2a' }, { name: 'Chef\'s jacket', white: true, colour: '#fafaf6' },
  { name: 'Green apron', white: false, colour: '#3c7d46' }, { name: 'Bath robe', white: true, colour: '#f4f1ea' },
  { name: 'Checked napkin', white: false, colour: '#b0413e' }, { name: 'Bed sheet', white: true, colour: '#f6f6f2' }
];
export const LAUNDRY = {
  sortTime: [2.6, 1.3], // s an item waits for its basket: the first … the last
  wash: 2.4, // s the drum turns
  sheets: 5,
  sheetTime: 6, // s a sheet takes through the rollers
  gap: 1.1, // s between two sheets
  steer: 0.75, // how fast the hands pull the sheet aside (of the width, a second)
  drift: [0.12, 0.26], // how hard the sheet wavers: the first sheet … the last
  pull: [0.07, 0.13], // and how hard it pulls steadily to one side (a sheet's own side)
  green: 0.08, // this close to the middle: smooth
  ok: 0.18, // this close: a crease or two
  jam: 0.46, // this far out: caught in the rollers
  points: { sort: 20, quick: 10, grey: -10, pink: -40, drop: -10, sheet: 100, crisp: 25, jam: -40 }
};
export function createLaundry(seed = 5) {
  const rand = seededRandom(seed);
  return {
    rand, phase: 'sort', phaseT: 0, item: 0, itemT: 0, sorted: [], pink: false, steer: 0,
    sheet: 0, off: 0, sheetT: 0, phaseA: rand() * 6, phaseB: rand() * 6, smooth: 0, crease: 0, sheets: [],
    score: 0, perfect: 0, last: null, seq: 0, finished: false
  };
}
/** The time the current item may wait */
export const sortWindow = (g) => { const [a, b] = LAUNDRY.sortTime; return a + (b - a) * (g.item / Math.max(1, LINEN.length - 1)); };
/** Into a basket: whites left (-1), colours right (1). Returns 'right' | 'grey' | 'pink' | null */
export function laundrySort(g, side) {
  if (g.finished || g.phase !== 'sort') return null;
  const L = LAUNDRY, P = L.points, it = LINEN[g.item];
  const white = side < 0;
  let points, what;
  if (white === it.white) {
    points = P.sort + P.quick * clamp(1 - g.itemT / sortWindow(g), 0, 1);
    what = 'right';
    say(g, white ? 'Whites' : 'Colours', points, true);
  } else if (it.white) {
    points = P.grey; what = 'grey';
    say(g, `${it.name} in the colours: it comes out grey`, points, false);
  } else {
    points = P.pink; what = 'pink'; g.pink = true;
    say(g, `${it.name} in the whites: pink sheets!`, points, false);
  }
  g.score += points;
  g.sorted.push({ item: g.item, ok: what === 'right', points: Math.round(points) });
  nextItem(g);
  return what;
}
function nextItem(g) {
  g.item++; g.itemT = 0;
  if (g.item >= LINEN.length) { g.phase = 'wash'; g.phaseT = 0; }
}
/** The sheet's sideways pull at time t of the `n`th sheet (of the width, a second) */
export function sheetDrift(g, t, n) {
  const k = n / Math.max(1, LAUNDRY.sheets - 1), [a, b] = LAUNDRY.drift, [c, d] = LAUNDRY.pull;
  const amp = a + (b - a) * k, pull = (c + (d - c) * k) * (Math.sin(g.phaseA * 7 + n * 2.3) < 0 ? -1 : 1);
  return pull + amp * (Math.sin(t * 1.3 + g.phaseA + n) + 0.7 * Math.sin(t * 2.9 + g.phaseB + 2 * n));
}
export function laundryStep(g, dt) {
  if (g.finished || dt <= 0) return g;
  const L = LAUNDRY, P = L.points;
  g.phaseT += dt;
  if (g.phase === 'sort') {
    g.itemT += dt;
    if (g.itemT >= sortWindow(g)) {
      g.score += P.drop;
      g.sorted.push({ item: g.item, ok: false, points: P.drop });
      say(g, `${LINEN[g.item].name}: on the floor`, P.drop, false);
      nextItem(g);
    }
  } else if (g.phase === 'wash') {
    if (g.phaseT >= L.wash) { g.phase = 'gap'; g.phaseT = 0; }
  } else if (g.phase === 'gap') {
    if (g.phaseT >= L.gap) {
      if (g.sheet >= L.sheets) { g.finished = true; return g; }
      g.phase = 'mangle'; g.phaseT = 0; g.off = 0; g.sheetT = 0; g.smooth = 0; g.crease = 0;
    }
  } else if (g.phase === 'mangle') {
    g.sheetT += dt;
    g.off += (sheetDrift(g, g.sheetT, g.sheet) + L.steer * g.steer) * dt;
    const a = Math.abs(g.off);
    if (a <= L.green) g.smooth += dt; else if (a <= L.ok) g.crease += dt;
    if (a >= L.jam) {
      g.score += P.jam;
      g.sheets.push({ quality: 0, jam: true, points: P.jam });
      say(g, 'Caught in the rollers!', P.jam, false);
      g.sheet++; g.phase = 'gap'; g.phaseT = 0;
    } else if (g.sheetT >= L.sheetTime) {
      const q = clamp((g.smooth + 0.5 * g.crease) / L.sheetTime, 0, 1);
      let points = P.sheet * q;
      if (q > 0.9) { points += P.crisp; g.perfect++; }
      if (g.pink) points *= 0.6; // (pink sheets go to the staff rooms)
      g.score += points;
      g.sheets.push({ quality: q, jam: false, points: Math.round(points) });
      say(g, q > 0.9 ? (g.pink ? 'Crisp, if pink' : 'Crisp and smooth!') : q > 0.6 ? 'A crease or two' : 'Creased all over', points, q > 0.6);
      g.sheet++; g.phase = 'gap'; g.phaseT = 0;
    }
  }
  return g;
}

// =====================================================================================================================
// The mission
// =====================================================================================================================
export const victoriaScore = (state) => Math.max(0, Math.round((state.hk?.score || 0) + (state.kitchen?.score || 0) + (state.laundry?.score || 0)));

export const VICTORIA_MISSION = {
  id: 'victoria-hotel',
  title: 'A shift at the Turmhotel Victoria',
  intro: 'A busy day at the Turmhotel Victoria in Davos Dorf, and half the staff is down with the flu. Walk in through the staff door and help out wherever they need you. First housekeeping: two rooms to turn round before their guests come back. Pick a chore (keys 1-7 or tap), then work it with alternating strokes (A and D, the arrow keys or the two pads); the chocolate goes on the pillow once the bed is made. Then the kitchen at lunch: a burner key (1-3) puts the next order on the stove, the same key plates it in the green, before it burns. Last the Lingerie in the basement: sort the linen into whites (left) and colours (right), then steer five sheets straight through the big mangle.',
  mode: 'person',
  season: null,
  time: 'morning',
  features: ['victoria'],
  scoreMode: true,
  // (calibrated on the bots in tests/missions-victoria.test.mjs: a quick and steady hand gold, a fair one silver, a slow one bronze)
  medals: { gold: 2750, silver: 2000, bronze: 1150 },
  colour: '#7b4fa0',
  icon: 'bed',
  finish: 'The shift is over. The Gouvernante nods once, which at the Victoria counts as a medal.',
  interior: { door: VICTORIA.door },
  start: { ...VICTORIA.start, heading: Math.atan2(VICTORIA.door.x - VICTORIA.start.x, VICTORIA.door.z - VICTORIA.start.z) },
  pin: { x: VICTORIA.door.x, z: VICTORIA.door.z },
  props: [],
  createState() { return { hk: null, kitchen: null, laundry: null, inside: false }; },
  score: victoriaScore,
  summary(state) {
    const lines = [];
    if (state.hk?.results.length) lines.push(state.hk.results.map((r) => `${r.room}: ${r.done} of ${r.of} chores`).join(' · '));
    const k = state.kitchen;
    if (k?.served.length) lines.push(`${k.served.filter((s) => !s.burnt).length} of ${KITCHEN_ORDERS.length} dishes served · ${k.perfect} perfect · ${k.burnt} burnt`);
    const l = state.laundry;
    if (l?.sorted.length) lines.push(`${l.sorted.filter((s) => s.ok).length} of ${LINEN.length} sorted right · ${l.sheets.filter((s) => s.quality > 0.9).length} of ${LAUNDRY.sheets} sheets crisp${l.pink ? ' · pink sheets' : ''}`);
    return lines;
  },
  objectives: [
    walkInto(VICTORIA.door, 'Go into the Turmhotel Victoria', 'the Turmhotel Victoria'),
    {
      id: 'housekeeping',
      title: 'Turn round two rooms',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.hk;
        if (!g) return { done: false, progress: 0, text: 'Taking the trolley …', target: null, hint: null };
        return { done: g.finished, progress: (g.results.length + (g.finished ? 0 : hkRoom(g).chores.length ? g.done.length / hkRoom(g).chores.length : 0)) / HOUSEKEEPING.rooms.length, text: `${hkRoom(g).name} · ${Math.ceil(g.left)} s · ${Math.round(g.score)} pts`, target: null, hint: '1-7: chore · A/D: scrub' };
      }
    },
    {
      id: 'kitchen',
      title: 'Cook the lunch service',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.kitchen;
        if (!g) return { done: false, progress: 0, text: 'Down to the kitchen …', target: null, hint: null };
        return { done: g.finished, progress: g.served.length / KITCHEN_ORDERS.length, text: `${g.served.length} of ${KITCHEN_ORDERS.length} dishes · ${Math.round(g.score)} pts`, target: null, hint: '1-3: burner' };
      }
    },
    {
      id: 'laundry',
      title: 'Wash and mangle the linen',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.laundry;
        if (!g) return { done: false, progress: 0, text: 'Down to the Lingerie …', target: null, hint: null };
        const p = g.phase === 'sort' ? 0.4 * g.item / LINEN.length : 0.4 + 0.6 * g.sheet / LAUNDRY.sheets;
        return { done: g.finished, progress: p, text: g.phase === 'sort' ? `Item ${g.item + 1} of ${LINEN.length} · ${Math.round(g.score)} pts` : `Sheet ${Math.min(g.sheet + 1, LAUNDRY.sheets)} of ${LAUNDRY.sheets} · ${Math.round(g.score)} pts`, target: null, hint: '←/→' };
      }
    }
  ]
};

export const VICTORIA_MISSIONS = [VICTORIA_MISSION];
