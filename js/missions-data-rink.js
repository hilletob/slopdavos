// js/missions-data-rink.js
// The ice of the Seehof Seeli (js/missions-data.js spreads RINK_MISSIONS into MISSIONS; js/missions-rink.js has the runtime:
// the ice as a mesh, the hose, the ice resurfacer). Like the other packages: no three.js and no DOM in here, so that
// tests/missions-rink.test.mjs floods and resurfaces the pond with bots on plain arrays.
//
//   seehofseeli-ice  Winter, at dusk. The little pond by the Hotel Seehof in Davos Dorf (OSM w37389726, the same ring as the
//                    pond hockey's) is made ready for the evening: first on foot with the hose from the hydrant on the north
//                    bank, the water sprayed in thin layers over the rough, scratched ice. Fresh water needs a few seconds
//                    to freeze; whoever walks into it leaves footprints that have to be flooded again (so the trick is the
//                    one of the real ice masters: walk backwards and spray ahead). Then onto the ice resurfacer: its
//                    conditioner at the back shaves the ice and lays a film of warm water that freezes smooth. Judged by time.
//
// The ice is one map over the pond: a cell of 0.5 m, its frozen layer (h: 0 the old rough ice, 1 a full new coat), the
// water still liquid on it (wet), the footprints, and the resurfaced cells (polish, with the film still wet on them).
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z, south).
import { POND, POND_RING, inPond } from './missions-data-outdoor.js';
import { MASK_MARGIN, MASK_TARGET, createGrid, forCellsInBox, gridFraction, makeFrame, touch } from './missions-data-work.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pct = (f) => `${Math.floor(f * 100)} %`;

export const RINK = {
  x0: 692, z0: -1452, size: { u: 69, v: 66 }, cell: 0.5, // (the pond's box: x 696.5-756.8, z -1448.4 to -1389.8)
  edge: 0.7, // m along the bank that are not counted (the snow bank, where neither the jet's edge nor the machine gets)
  // the hydrant and the hose reel on the north bank (open snow between the pond and the Hotel Seehof's garden)
  hydrant: { x: 712, z: -1452.5 },
  start: { x: 709.5, z: -1455 },
  pin: { x: 706, z: -1456 },
  hose: {
    reach: 6.2, // m from the feet to the middle of where the jet comes down
    radius: 4.2, // m: the fan of the jet on the ice
    rate: 3.0, // coats a second in the middle of the fan (falling off to its edge)
    wetMax: 1.5, // more stands as a puddle and runs off
    walk: 2.8, back: 2.8, turn: 2.1, // m/s and rad/s with the hose in the hands
    length: 75 // m of hose on the reel
  },
  freeze: 0.24, // coats a second that freeze (a night at the pond: -12 °C, quicker than life)
  coat: 0.95, // a cell's layer counts as flooded from this
  printWet: 0.14, // water on a cell from which a boot leaves a print in it
  footR: 0.34,
  floodGoal: 0.88,
  // the ice resurfacer, parked on the north bank facing the pond
  machine: { x: 721, z: -1457.5, heading: 0 },
  conditioner: { back: 2.35, halfL: 0.3, halfW: 1.6, minSpeed: 0.3 }, // the shaving blade and the towel behind the rear axle
  filmFreeze: 0.4, // the warm film, frozen in ~2.5 s
  polishGoal: 0.88,
  timeLimitMs: 15 * 60 * 1000
};
RINK.frame = makeFrame(RINK.x0, RINK.z0, 1, 0, 0); // (u = x − x0, v = z − z0)

/** The distance from (x, z) to the pond's ring */
export function ringDistance(x, z, ring = POND_RING) {
  let best = Infinity;
  for (let i = 0, n = ring.length / 2, j = n - 1; i < n; j = i++) {
    const ax = ring[j * 2], az = ring[j * 2 + 1], dx = ring[i * 2] - ax, dz = ring[i * 2 + 1] - az;
    const L2 = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

/** On the ice (the pond's ring, a box test first: the controllers ask this for every step on the ground) */
export const onIce = (x, z) => x > 696 && x < 757.5 && z > -1449 && z < -1389 && inPond(x, z);

/**
 * The ice map: createGrid's (h: the new frozen layer, mask: the counted cells) and the water on it (wet), the footprints
 * (prints) and the resurfacer's work (polish 0/1, film: its warm water, 1 just laid, 0 frozen)
 */
export function createRinkIce(R = RINK) {
  const cols = Math.round(R.size.u / R.cell), rows = Math.round(R.size.v / R.cell);
  const g = createGrid(cols, rows, R.cell);
  g.wet = new Float32Array(cols * rows);
  g.polish = new Float32Array(cols * rows);
  g.film = new Float32Array(cols * rows);
  g.prints = new Uint8Array(cols * rows);
  g.inside = new Uint8Array(cols * rows); // (on the ice at all: the mesh draws the snow of the bank round the rest)
  g.wetCount = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, w = R.frame.toWorld((i + 0.5) * R.cell, (j + 0.5) * R.cell);
    const inside = inPond(w.x, w.z);
    g.inside[k] = inside ? 1 : 0;
    g.mask[k] = inside && ringDistance(w.x, w.z) >= R.edge ? MASK_TARGET : MASK_MARGIN;
  }
  return g;
}

/** Copies a fresh map into the run's (a restart) */
export function resetRinkIce(g, fresh) {
  g.h.set(fresh.h); g.mask.set(fresh.mask); g.wet.set(fresh.wet); g.polish.set(fresh.polish); g.film.set(fresh.film); g.prints.set(fresh.prints);
  g.wetCount = 0;
  g.dirty = { i0: 0, i1: g.cols - 1, j0: 0, j1: g.rows - 1 };
  g.version++;
}

/** The water freezes, the resurfacer's film too (every cell that has any: marked changed) */
export function stepFreeze(g, dt, R = RINK) {
  let wet = 0;
  const fw = R.freeze * dt, ff = R.filmFreeze * dt;
  for (let k = 0; k < g.wet.length; k++) {
    const w = g.wet[k], f = g.film[k];
    if (w <= 0 && f <= 0) continue;
    if (w > 0) {
      const d = Math.min(w, fw);
      g.wet[k] = w - d;
      if (g.inside[k]) g.h[k] = Math.min(1.6, g.h[k] + d);
      if (g.wet[k] > 0) wet++;
    }
    if (f > 0) g.film[k] = Math.max(0, f - ff);
    touch(g, k % g.cols, (k / g.cols) | 0);
  }
  g.wetCount = wet;
  return wet;
}

/**
 * The jet: water onto the cells of the fan `reach` m ahead of the feet p { u, v } in the direction f (unit, grid). Returns
 * the water laid (coat·m², for the sound and the spray). A footprint under it is filled again.
 */
export function stepSpray(g, p, f, dt, R = RINK) {
  const H = R.hose, cu = p.u + f.u * H.reach, cv = p.v + f.v * H.reach, r = H.radius;
  const i0 = Math.max(0, Math.floor((cu - r) / g.cell)), i1 = Math.min(g.cols - 1, Math.floor((cu + r) / g.cell));
  const j0 = Math.max(0, Math.floor((cv - r) / g.cell)), j1 = Math.min(g.rows - 1, Math.floor((cv + r) / g.cell));
  let laid = 0;
  const area = g.cell * g.cell;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot((i + 0.5) * g.cell - cu, (j + 0.5) * g.cell - cv);
    if (d > r) continue;
    const k = j * g.cols + i;
    if (!g.inside[k]) continue;
    const add = Math.min(H.rate * (1 - (d / r) ** 2) * dt, H.wetMax - g.wet[k]);
    if (add <= 0) continue;
    g.wet[k] += add;
    if (g.prints[k] && g.wet[k] > 0.3) g.prints[k] = 0;
    // (new water on resurfaced ice: that cell is to be resurfaced again)
    if (g.polish[k]) g.polish[k] = 0;
    laid += add * area;
    touch(g, i, j);
  }
  return laid;
}

/**
 * The boots at p { u, v }, walking (moving): in water that has not frozen yet they leave prints: the layer there is broken
 * (h back to nothing) and has to be flooded again. Returns the cells newly printed.
 */
export function stepBoots(g, p, moving, R = RINK) {
  if (!moving) return 0;
  let n = 0;
  forCellsInBox(g, p.u, p.v, 1, 0, R.footR, R.footR, (k, i, j) => {
    if (!g.inside[k] || g.wet[k] < R.printWet || g.prints[k]) return;
    g.prints[k] = 1; g.h[k] = 0; g.wet[k] = Math.min(g.wet[k], 0.05); g.polish[k] = 0;
    n++;
    touch(g, i, j);
  });
  return n;
}

/**
 * The resurfacer at p { u, v } facing f (unit, grid), driving at `speed` (m/s, + forwards): the conditioner behind it
 * shaves the cells under it and lays the warm film; prints are gone with it. Returns the cells newly resurfaced.
 */
export function stepConditioner(g, p, f, speed, R = RINK) {
  const C = R.conditioner;
  if (speed < C.minSpeed) return 0;
  let n = 0;
  forCellsInBox(g, p.u - f.u * C.back, p.v - f.v * C.back, f.u, f.v, C.halfL, C.halfW, (k, i, j) => {
    if (!g.inside[k]) return;
    if (!g.polish[k]) n++;
    g.polish[k] = 1; g.film[k] = 1; g.prints[k] = 0; g.wet[k] = 0;
    touch(g, i, j);
  });
  return n;
}

export const floodedShare = (g, R = RINK) => gridFraction(g, (h) => h >= R.coat);
export const polishedShare = (g) => gridFraction(g, (_h, k) => g.polish[k] > 0);
export const printCount = (g) => { let n = 0; for (let k = 0; k < g.prints.length; k++) n += g.prints[k]; return n; };

/** The grid cell of world (x, z) under water still liquid (the boots' hint) */
export function wetAt(g, x, z, R = RINK) {
  const p = R.frame.toGrid(x, z), i = Math.floor(p.u / g.cell), j = Math.floor(p.v / g.cell);
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return 0;
  return g.wet[j * g.cols + i];
}

// --- Bots (the calibration, the tests) --------------------------------------------------------------------------------
// The pond in lanes along x (u), `spacing` apart: [u0, v, u1, v] in grid metres, the part of each lane over the ice
export function rinkLanes(spacing, inset = 0, R = RINK) {
  const lanes = [];
  let r = 0;
  for (let v = 4 + inset; v < R.size.v - 3; v += spacing, r++) {
    let a = Infinity, b = -Infinity;
    for (let u = 0; u < R.size.u; u += 0.25) {
      const w = R.frame.toWorld(u, v);
      if (inPond(w.x, w.z) && ringDistance(w.x, w.z) > 0.4) { a = Math.min(a, u); b = Math.max(b, u); }
    }
    if (a < b) lanes.push(r % 2 ? [b, v, a, v] : [a, v, b, v]);
  }
  return lanes;
}

// =====================================================================================================================
const RINK_ID = 'seehofseeli-ice';
const fmtHint = (st) => (st.onWet ? 'Off the wet ice! Walk backwards (S) and spray ahead' : null);

export const RINK_MISSION = {
  id: RINK_ID,
  title: 'Fresh ice for the Seehofseeli',
  intro: 'A cold evening at the Seehof Seeli, the little pond by the Hotel Seehof in Davos Dorf: the ice is grey and scratched from the day, and tonight the locals want to skate. Take the hose at the hydrant on the north bank and flood the ice, hold Space to spray. The water freezes in a few seconds; walk into it before that and your boots leave prints that have to be flooded again, so do it the way the ice masters do: walk backwards and spray ahead. Then get on the ice resurfacer and drive it over the whole pond in lanes: the conditioner at its back shaves the ice and leaves a film of warm water that freezes as smooth as glass.',
  mode: 'person',
  season: 'winter',
  time: 'twilight',
  features: ['workVehicle', 'rinkIce'],
  vehicle: 'zamboni',
  props: [],
  colour: '#5fb4e8',
  icon: 'zamboni',
  pin: RINK.pin,
  // (the bots of tests/missions-rink.test.mjs: flooding in 7.4 m lanes ~2:00, resurfacing in lanes with a 4.5 s turn at
  // each end and the way to the machine ~3:10; a player sweeping the jet floods quicker, but is less tidy with the machine)
  bonusMs: 345000,
  medals: { gold: 345000, silver: 450000, bronze: 600000 },
  timeLimitMs: RINK.timeLimitMs,
  finish: 'The ice shines like glass under the lanterns, and the first skaters are already lacing up on the bank.',
  start: { x: RINK.start.x, z: RINK.start.z, heading: Math.atan2(RINK.hydrant.x - RINK.start.x, RINK.hydrant.z - RINK.start.z) },
  createState() { return { flooded: 0, polished: 0, prints: 0, printed: 0, onWet: false, spraying: false, hose: false }; },
  summary(state) {
    return [`${state.printed} footprint${state.printed === 1 ? '' : 's'} flooded again · ${pct(state.polished)} resurfaced`];
  },
  objectives: [
    {
      id: 'hose',
      title: 'Take the hose at the hydrant',
      allowModes: ['person'],
      check(ctx) {
        const d = Math.hypot(ctx.x - RINK.hydrant.x, ctx.z - RINK.hydrant.z);
        return { done: d <= 2.2, progress: null, text: `${Math.round(d)} m to the hydrant`, target: { x: RINK.hydrant.x, z: RINK.hydrant.z, r: 1.6 }, hint: null };
      }
    },
    {
      id: 'flood',
      title: 'Flood the ice',
      allowModes: ['person'],
      check(ctx, state) {
        if (ctx.t > RINK.timeLimitMs) return { done: false, fail: 'Too late: the skaters are here and the ice is still rough.', text: '', progress: state.flooded, target: null, hint: null };
        const prints = state.prints ? ` · ${state.prints} footprint cells` : '';
        const far = Math.hypot(ctx.x - POND.centre.x, ctx.z - POND.centre.z) > 40;
        return {
          done: state.flooded >= RINK.floodGoal, progress: state.flooded / RINK.floodGoal,
          text: `Ice flooded ${pct(state.flooded)} of ${pct(RINK.floodGoal)}${prints}`,
          target: far ? { x: POND.centre.x, z: POND.centre.z, r: 6 } : null,
          hint: fmtHint(state) || (state.spraying ? null : 'Hold Space: spray')
        };
      }
    },
    {
      id: 'machine',
      title: 'Get on the ice resurfacer',
      allowModes: ['person', 'car'],
      check(ctx, state) {
        const m = state.machineAt || RINK.machine;
        const d = Math.hypot(ctx.x - m.x, ctx.z - m.z);
        return { done: ctx.mode === 'car', progress: null, text: `${Math.round(d)} m to the machine`, target: { x: m.x, z: m.z, r: 2.5 }, hint: d < 5 ? 'F: get on' : null };
      }
    },
    {
      id: 'resurface',
      title: 'Resurface the ice',
      allowModes: ['car', 'person'],
      check(ctx, state) {
        if (ctx.t > RINK.timeLimitMs) return { done: false, fail: 'Too late: the skaters are here and the ice is still rough.', text: '', progress: state.polished, target: null, hint: null };
        const far = Math.hypot(ctx.x - POND.centre.x, ctx.z - POND.centre.z) > 40;
        return {
          done: state.polished >= RINK.polishGoal, progress: state.polished / RINK.polishGoal,
          text: `Ice resurfaced ${pct(state.polished)} of ${pct(RINK.polishGoal)}`,
          target: far ? { x: POND.centre.x, z: POND.centre.z, r: 6 } : null,
          hint: ctx.mode !== 'car' ? 'Back onto the machine' : null
        };
      }
    }
  ]
};

export const RINK_MISSIONS = [RINK_MISSION];
