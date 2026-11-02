// js/missions-data-mine.js
// The Silberberg mine (js/missions-data.js lists it; js/missions-mine.js has its runtime: the adit's portal in the
// world, the gallery inside, the lamp, the sounds): its definition and the pure game behind it, three.js-free
// (tests/missions-sledge.test.mjs drives it, a bot included).
//
// The place: the Bergwerk Silberberg above Schmelzboden (Davos Monstein; OSM node 519783936, the Dalvazzer adit
// node 11123596662, the Bergbaumuseum Graubünden at Schmelzboden), the biggest lead and zinc mine of Switzerland,
// worked from the late 14th century to 1848: galena (Bleiglanz, lead with a little silver) and sphalerite (Zinkblende).
// It lies at x ≈ -5920, z ≈ 11160 in the world frame, 3 km beyond the map's south-west corner (js/davos-geodata.js
// meta.bounds: x >= -2900, z <= 8700). The mission's adit is therefore set where the Landwassertal leaves the map
// towards Schmelzboden: at the foot of the slope south of the Landwasserstrasse below the Höfji (x -2850, z 4700,
// ~1547 m), the portal facing north into the valley — a stand-in, documented in docs/missions-locations.json.
//
// The game: inside, a gallery with timbering and the rails of the hunt (the mine cart), side drifts off it (3–5,
// from a seed: the mine of the day). Glittering spots in the walls are ore: galena (silver-grey), sphalerite
// (brown-yellow) — and barren rock that glitters much the same (pyrite and quartz, next to worthless). Hold Strike at a
// spot to break ore into the basket (16 kg), the basket empties into the hunt by itself next to it; push the hunt out
// to the portal to bring its ore to day: only ore that came out counts. The lamp's oil lasts 4 minutes: in the dark
// the shift is over (what is still inside stays inside). Walking out of the portal ends the shift early.
// Points: kg × the ore's value × the vein's grade.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; else if (a < -Math.PI) a += Math.PI * 2; return a; };
const fmtClock = (s) => { const v = Math.max(0, Math.ceil(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };

/** A small seeded random generator (mulberry32) */
export function mineRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MINE = {
  cell: 2.4, // m: the grid of the galleries (a gallery is one cell wide), 2.3 m high
  height: 2.3,
  mainCells: 20, // the main gallery: 48 m into the mountain
  branches: [3, 5], // side drifts
  lamp: 240, // s of oil
  lampLow: 30, // s left: the flame gutters
  basket: 16, // kg
  strikeS: 0.85, // s a strike of the hammer
  chunk: 2.5, // kg a strike breaks loose
  reach: 1.9, // m to a spot in the wall
  walk: 2.5, back: 1.2, turn: 2.3, // m/s, rad/s
  radius: 0.32, // the miner's
  huntHalf: 0.8, huntWidth: 0.42, // m: the cart, along and across the rails (half its length, half its width)
  railX: -0.42, // the rails along the left of the main gallery (the walkway beside them on the right)
  load: 2.1, // m from the hunt: the basket empties into it
  mouthZ: 1.0, // the hunt at the portal (its centre this far in): unloaded
  huntOut: -1.0, // as far out as the rails go (onto the dump before the portal)
  ores: {
    galena: { name: 'galena', label: 'Galena', value: 12, colour: '#b9c2cc' },
    sphalerite: { name: 'sphalerite', label: 'Sphalerite', value: 8, colour: '#b07a2a' },
    barren: { name: 'barren', label: 'Barren rock', value: 1, colour: '#9a8f80' }
  },
  veins: { galena: 5, sphalerite: 6, barren: 6 }
};

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, -x, -z (cell steps)
const key = (i, k) => `${i},${k}`;

/**
 * The mine of a seed: the carved cells (i across, k into the mountain; the portal at k = 0, i = 0), the side drifts,
 * the veins in their walls. { cells: Set of 'i,k', list: [[i, k]], branches, veins, mainCells, seed }
 */
export function generateMine(seed = 1, M = MINE) {
  const rand = mineRandom(seed);
  const cells = new Set();
  const list = [];
  const carve = (i, k) => { if (!cells.has(key(i, k))) { cells.add(key(i, k)); list.push([i, k]); } };
  for (let k = 0; k < M.mainCells; k++) carve(0, k);
  const free = (i, k, from) => {
    if (k < 1 || cells.has(key(i, k))) return false;
    for (const [di, dk] of DIRS) { const n = key(i + di, k + dk); if (n !== from && cells.has(n)) return false; }
    return true;
  };
  const nBranch = M.branches[0] + Math.floor(rand() * (M.branches[1] - M.branches[0] + 1));
  const branches = [];
  const used = [];
  for (let b = 0; b < 200 && branches.length < nBranch; b++) {
    const k0 = 3 + Math.floor(rand() * (M.mainCells - 5));
    if (used.some((u) => Math.abs(u - k0) < 3)) continue;
    const side = rand() < 0.5 ? 1 : -1;
    const cellsB = [];
    let i = 0, k = k0, prev = key(0, k0);
    const len1 = 3 + Math.floor(rand() * 5);
    const turn = rand() < 0.7 ? (rand() < 0.5 ? 1 : -1) : 0;
    const len2 = turn ? 2 + Math.floor(rand() * 4) : 0;
    const steps = [];
    for (let s = 0; s < len1; s++) steps.push([side, 0]);
    for (let s = 0; s < len2; s++) steps.push([0, turn]);
    for (const [di, dk] of steps) {
      const ni = i + di, nk = k + dk;
      if (!free(ni, nk, prev)) break;
      carve(ni, nk);
      cellsB.push([ni, nk]);
      prev = key(ni, nk); i = ni; k = nk;
    }
    if (cellsB.length >= 2) { branches.push({ k0, side, cells: cellsB }); used.push(k0); }
    else for (const [ci, ck] of cellsB) { cells.delete(key(ci, ck)); list.splice(list.findIndex(([a, c]) => a === ci && c === ck), 1); }
  }
  const mine = { seed, cells, list, branches, mainCells: M.mainCells, veins: [] };
  mine.veins = placeVeins(mine, rand, M);
  return mine;
}

export const isCarved = (mine, i, k) => mine.cells.has(key(i, k));
/** The cell of a point (mine-local metres: the portal's centre at x = 0, z = 0, the gallery along +z) */
export const cellOf = (x, z, M = MINE) => [Math.round(x / M.cell), Math.floor(z / M.cell)];
export const cellCentre = (i, k, M = MINE) => ({ x: i * M.cell, z: (k + 0.5) * M.cell });

/** The walls: every face between a carved cell and the rock [{ i, k, d (DIRS index) }] (not the portal's opening) */
export function wallFaces(mine) {
  const out = [];
  for (const [i, k] of mine.list) {
    DIRS.forEach(([di, dk], d) => {
      if (isCarved(mine, i + di, k + dk)) return;
      if (i === 0 && k === 0 && d === 3) return; // (the portal)
      out.push({ i, k, d });
    });
  }
  return out;
}

function placeVeins(mine, rand, M) {
  const faces = wallFaces(mine).filter((f) => f.k >= 2);
  // (the deeper and the further into a drift, the richer: galena weighted by its distance from the portal)
  const depth = (f) => f.k + Math.abs(f.i) * 1.3;
  const taken = new Set();
  const veins = [];
  const pick = (weight) => {
    let total = 0;
    const cand = faces.filter((f) => !taken.has(key(f.i, f.k)));
    for (const f of cand) total += weight(f);
    let r = rand() * total;
    for (const f of cand) { r -= weight(f); if (r <= 0) return f; }
    return cand[cand.length - 1];
  };
  const add = (kind, weight) => {
    const f = pick(weight);
    if (!f) return;
    taken.add(key(f.i, f.k));
    const c = cellCentre(f.i, f.k, M);
    const [di, dk] = DIRS[f.d];
    const along = (rand() - 0.5) * M.cell * 0.5;
    veins.push({
      id: veins.length, kind, i: f.i, k: f.k, d: f.d,
      x: c.x + di * M.cell * 0.5 + (dk ? along : 0), z: c.z + dk * M.cell * 0.5 + (di ? along : 0), y: 0.7 + rand() * 0.9,
      nx: -di, nz: -dk, // (out of the wall, into the gallery)
      grade: kind === 'barren' ? 1 : Math.round((0.6 + rand() * 0.4) * 100) / 100,
      kg: kind === 'barren' ? 7.5 : 10 + Math.round(rand() * 3) * 2.5, mined: 0
    });
  };
  for (let n = 0; n < M.veins.galena; n++) add('galena', (f) => depth(f) ** 1.6);
  for (let n = 0; n < M.veins.sphalerite; n++) add('sphalerite', (f) => depth(f));
  for (let n = 0; n < M.veins.barren; n++) add('barren', () => 1);
  return veins;
}

// --- The shift ---------------------------------------------------------------------------------------------------------
/** A shift in the mine: the miner just inside the portal, the hunt (the cart) on the rails ahead of it */
export function createShift(mine, M = MINE) {
  return {
    mine,
    x: 0.55, z: 0.8, heading: 0, // (+z: into the mountain; the walkway right of the rails)
    entered: false,
    basket: { galena: 0, sphalerite: 0, barren: 0, kg: 0, pts: 0 },
    hunt: { z: 3.4, kg: 0, pts: 0, moving: 0 },
    lamp: M.lamp,
    delivered: 0, deliveredKg: 0, trips: 0,
    ore: { galena: 0, sphalerite: 0, barren: 0 }, // kg brought out
    mining: null, // { vein, t }
    target: null, // the vein in reach
    over: null, // 'dark' | 'exit'
    warned: false, fullWarnT: 0,
    swing: 0 // s since the last strike (the hammer's animation)
  };
}

/** Whether a circle of radius r at (x, z) stays within the carved cells */
export function freeAt(mine, x, z, r = MINE.radius, M = MINE) {
  const [i0, k0] = cellOf(x - r, z - r, M), [i1, k1] = cellOf(x + r, z + r, M);
  if (z - r < 0 && Math.abs(x) <= M.cell / 2 - r) return z > -1.2; // (out through the portal: a step outside)
  for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) if (!isCarved(mine, i, k)) return false;
  return true;
}

const huntHits = (g, x, z, M) => Math.abs(x - M.railX) < M.huntWidth + M.radius && Math.abs(z - g.hunt.z) < M.huntHalf + M.radius;
const huntMax = (g, M) => g.mine.mainCells * M.cell - M.huntHalf - 0.2;

/**
 * One step of the shift. input: { forward (0..1), back (0..1), turn (-1..1, + left), strike (bool, held) }.
 * Returns the step's events: [{ type: 'strike' | 'ore' | 'empty' | 'full' | 'load' | 'deliver' | 'low' | 'dark' |
 * 'exit', ... }]
 */
export function stepShift(g, input, dt, M = MINE) {
  const ev = [];
  if (g.over) return ev;
  const mine = g.mine;
  // the lamp
  g.lamp -= dt;
  if (g.lamp <= M.lampLow && !g.warned) { g.warned = true; ev.push({ type: 'low' }); }
  if (g.lamp <= 0) { g.lamp = 0; g.over = 'dark'; ev.push({ type: 'dark' }); return ev; }
  g.swing += dt;
  g.fullWarnT = Math.max(0, g.fullWarnT - dt);
  // walking and turning (no walking while the hammer swings)
  const turn = clamp(input.turn || 0, -1, 1);
  g.heading = wrapPi(g.heading + turn * M.turn * dt);
  const striking = !!input.strike;
  const fwd = clamp(input.forward || 0, 0, 1), back = clamp(input.back || 0, 0, 1);
  let v = striking && g.target ? 0 : fwd * M.walk - back * M.back;
  if (g.basket.kg > M.basket * 0.5) v *= 0.85;
  g.hunt.moving = 0;
  if (v) {
    const fx = Math.sin(g.heading), fz = Math.cos(g.heading);
    const step = (dx, dz) => {
      const nx = g.x + dx, nz = g.z + dz;
      if (!freeAt(mine, nx, nz, M.radius, M)) return false;
      if (huntHits(g, nx, nz, M)) {
        // pushing the hunt along its rails (only along them: from the side it is in the way)
        if (Math.abs(dz) < 1e-6 || Math.abs(nx - M.railX) > M.huntWidth + 0.1) return false;
        const want = dz < 0 ? nz - (M.huntHalf + M.radius) - 0.01 : nz + (M.huntHalf + M.radius) + 0.01;
        if ((dz < 0 && nz < g.hunt.z) || (dz > 0 && nz > g.hunt.z)) return false; // (on the wrong side of it)
        const hz = clamp(want, M.huntOut, huntMax(g, M));
        if (Math.abs(hz - want) > 1e-6) return false; // (against the end of the rails)
        g.hunt.moving = hz - g.hunt.z;
        g.hunt.z = hz;
      }
      g.x = nx; g.z = nz;
      return true;
    };
    const pushing = huntHits(g, g.x + fx * v * dt * 3, g.z + fz * v * dt * 3, M) ? (g.hunt.kg > 40 ? 0.6 : 0.8) : 1;
    step(fx * v * dt * pushing, 0);
    step(0, fz * v * dt * pushing);
  }
  if (g.z > 4) g.entered = true;
  if (g.entered && g.z < 0.4) { g.over = 'exit'; ev.push({ type: 'exit' }); return ev; }
  // the hunt at the portal: its ore comes to day
  if (g.hunt.z <= M.mouthZ && g.hunt.kg > 0) {
    const h = g.hunt;
    ev.push({ type: 'deliver', kg: h.kg, pts: h.pts });
    g.delivered += h.pts; g.deliveredKg += h.kg; g.trips++;
    for (const k of Object.keys(g.ore)) { g.ore[k] += h[k] || 0; h[k] = 0; }
    h.kg = 0; h.pts = 0;
  }
  // the basket into the hunt, next to it
  if (g.basket.kg > 0 && Math.hypot(g.x - M.railX, g.z - g.hunt.z) < M.load) {
    const b = g.basket, h = g.hunt;
    ev.push({ type: 'load', kg: b.kg, pts: b.pts });
    for (const k of ['galena', 'sphalerite', 'barren']) { h[k] = (h[k] || 0) + b[k]; b[k] = 0; }
    h.kg += b.kg; h.pts += b.pts; b.kg = 0; b.pts = 0;
  }
  // the spot in reach: in front, the nearest with ore left
  g.target = null;
  let best = Infinity;
  for (const vn of mine.veins) {
    if (vn.kg - vn.mined <= 1e-6) continue;
    const dx = vn.x - g.x, dz = vn.z - g.z, d = Math.hypot(dx, dz);
    if (d > M.reach || d >= best) continue;
    if (Math.abs(wrapPi(Math.atan2(dx, dz) - g.heading)) > 1.15) continue;
    best = d; g.target = vn;
  }
  // the hammer
  if (striking && g.target) {
    if (g.basket.kg >= M.basket - 1e-6) {
      if (!g.fullWarnT) { ev.push({ type: 'full' }); g.fullWarnT = 2; }
      g.mining = null;
    } else {
      if (!g.mining || g.mining.vein !== g.target) g.mining = { vein: g.target, t: 0 };
      g.mining.t += dt;
      if (g.mining.t >= M.strikeS) {
        g.mining.t -= M.strikeS;
        g.swing = 0;
        const vn = g.target;
        const kg = Math.min(M.chunk, vn.kg - vn.mined, M.basket - g.basket.kg);
        vn.mined += kg;
        const pts = kg * M.ores[vn.kind].value * vn.grade;
        g.basket[vn.kind] += kg; g.basket.kg += kg; g.basket.pts += pts;
        ev.push({ type: 'ore', kind: vn.kind, kg, pts, vein: vn.id, left: vn.kg - vn.mined });
        if (vn.kg - vn.mined <= 1e-6) ev.push({ type: 'empty', vein: vn.id });
      }
    }
  } else g.mining = null;
  return ev;
}

export const shiftScore = (g) => Math.round(g?.delivered || 0);
/** The most a mine holds (all its ore out) */
export const mineMaxScore = (mine, M = MINE) => mine.veins.reduce((a, v) => a + v.kg * M.ores[v.kind].value * v.grade, 0);

// --- A bot (the medals' calibration, the tests) ------------------------------------------------------------------------
/** The cell path (BFS) from cell a to cell b: [[i, k], ...] without a, with b */
export function cellPath(mine, a, b) {
  const start = key(a[0], a[1]), goal = key(b[0], b[1]);
  const prev = new Map([[start, null]]);
  const queue = [a];
  while (queue.length) {
    const [i, k] = queue.shift();
    if (key(i, k) === goal) break;
    for (const [di, dk] of DIRS) {
      const n = key(i + di, k + dk);
      if (prev.has(n) || !isCarved(mine, i + di, k + dk)) continue;
      prev.set(n, key(i, k));
      queue.push([i + di, k + dk]);
    }
  }
  if (!prev.has(goal)) return null;
  const out = [];
  for (let c = goal; c && c !== start; c = prev.get(c)) out.unshift(c.split(',').map(Number));
  return out;
}

/**
 * A miner who knows the mine: the richest spot for the walk first (its ore's value over the way there), the basket to
 * the hunt (pushed along deeper while there is time), the hunt out before the oil runs low (`reserve` s), then out.
 */
export function botShiftInput(g, M = MINE, { reserve = 45 } = {}) {
  const mine = g.mine;
  const here = cellOf(g.x, g.z, M);
  const goTo = (x, z, slack = 0.3) => {
    const c = cellOf(x, z, M);
    const path = here[0] === c[0] && here[1] === c[1] ? [] : cellPath(mine, here, c) || [];
    // (in the main gallery: along the walkway, beside the rails)
    const p = path.length ? cellCentre(path[0][0], path[0][1], M) : { x, z };
    if (path.length && path[0][0] === 0 && (path.length > 1 || here[0] === 0)) p.x = 0.6;
    const want = Math.atan2(p.x - g.x, p.z - g.z);
    const err = wrapPi(want - g.heading);
    const d = Math.hypot(p.x - g.x, p.z - g.z) + (path.length ? path.length * M.cell : 0);
    return { turn: clamp(err * 3, -1, 1), forward: Math.abs(err) < 0.6 && d > slack ? 1 : 0, d };
  };
  const out = g.hunt.z <= M.mouthZ + 0.05 && !g.hunt.kg;
  // time to bring the hunt out: the walk to its back and the push to the portal
  const toHunt = Math.hypot(g.x - M.railX, g.z - g.hunt.z) / M.walk;
  const pushOut = (g.hunt.z / (M.walk * 0.6)) + toHunt + 8;
  if (g.lamp < pushOut + reserve * 0.2 || (g.lamp < reserve + pushOut && !g.basket.kg)) {
    if (g.basket.kg) return { ...goTo(0.6, g.hunt.z), strike: false };
    if (out || !g.hunt.kg) return { ...goTo(0, -1), strike: false };
    // behind the hunt, then towards the portal
    if (g.z < g.hunt.z + M.huntHalf + M.radius - 0.05) return { ...goTo(0.6, g.hunt.z + M.huntHalf + 1.2, 0.15), strike: false };
    if (Math.abs(g.x - M.railX) > 0.12) return { ...goTo(M.railX, g.z, 0.08), strike: false };
    const err = wrapPi(Math.PI - g.heading);
    return { turn: clamp(err * 3, -1, 1), forward: Math.abs(err) < 0.3 ? 1 : 0, strike: false };
  }
  if (g.basket.kg >= M.basket - 0.1) return { ...goTo(0.6, g.hunt.z), strike: false };
  // the best spot: value over (the walk there and back to the hunt)
  let best = null, bestV = 0;
  for (const vn of mine.veins) {
    const left = vn.kg - vn.mined;
    if (left <= 1e-6 || vn.kind === 'barren') continue;
    const path = cellPath(mine, here, [vn.i, vn.k]);
    const walk = (path ? path.length : 0) * M.cell + Math.abs(vn.k - g.hunt.z / M.cell) * M.cell;
    const val = (M.ores[vn.kind].value * vn.grade * Math.min(left, M.basket)) / (walk / M.walk + (Math.min(left, M.basket) / M.chunk) * M.strikeS + 3);
    if (val > bestV) { bestV = val; best = vn; }
  }
  if (!best) return g.basket.kg ? { ...goTo(0.6, g.hunt.z), strike: false } : { turn: 0, forward: 0, strike: false };
  // stand in front of it, facing it
  const sx = best.x + best.nx * 0.9, sz = best.z + best.nz * 0.9;
  const m = goTo(sx, sz, 0.35);
  if (m.d > 0.5) return { ...m, strike: false };
  const err = wrapPi(Math.atan2(best.x - g.x, best.z - g.z) - g.heading);
  return { turn: clamp(err * 3, -1, 1), forward: 0, strike: Math.abs(err) < 0.5 };
}

// --- The mission -------------------------------------------------------------------------------------------------------
// (the portal: its centre at the foot of the slope, the gallery heading into it along +z (south); the miner arrives on
// the farm road below)
export const MINE_ADIT = { x: -2850, z: 4700, heading: 0 }; // heading: into the mountain
export const MINE_DOOR = { x: -2850, z: 4697.2, r: 2.4 };
/** The mine of the day: a new layout every day (the same all day: a best score to beat) */
export const mineSeedOfDay = (date = new Date()) => date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

const walkTo = (spot, title, label) => ({
  id: 'enter',
  title,
  check(ctx) {
    const d = Math.hypot(ctx.x - spot.x, ctx.z - spot.z);
    return { done: d < spot.r, progress: null, text: `${Math.max(0, Math.round(d))} m to ${label}`, target: { ...spot, style: 'plain' }, hint: null };
  }
});

export const MINE_MISSION = {
  id: 'silberberg-mine',
  title: 'Ore in the Silberberg mine',
  intro: 'The Silberberg above Schmelzboden was the richest lead and zinc mine of Switzerland, worked until 1848. Take the oil lamp and the hammer into the adit: find the glittering ore in the walls, galena (silver-grey) and sphalerite (brown-yellow) — the barren rock glitters too, but is next to worthless. Hold Strike (E / Space) to break it out, the basket (16 kg) empties into the hunt next to it; push the hunt out to the portal: only ore that comes to day counts. The oil lasts 4 minutes. W/S walk, A/D turn.',
  mode: 'person',
  season: null, // all year round
  time: 'golden',
  features: ['mine'],
  scoreMode: true,
  score: (state) => shiftScore(state.shift),
  // (calibrated with botShiftInput, a miner who knows where the ore is: ~550 pts over 40 seeds (390-720); a player has
  // to find it first)
  medals: { gold: 550, silver: 380, bronze: 200 },
  bonusMs: 4 * 60 * 1000,
  colour: '#8f7a5a',
  icon: 'mine',
  finish: 'Back in daylight, black with dust: the ore goes down to the smelter at Schmelzboden.',
  interior: { door: MINE_DOOR },
  start: { x: -2858, z: 4634, heading: 0 },
  props: [],
  createState() { return { shift: null, seed: null }; },
  summary(state) {
    const g = state.shift;
    if (!g) return [];
    const kg = (v) => `${Math.round(v * 10) / 10} kg`;
    return [
      `Brought out: ${kg(g.ore.galena)} galena · ${kg(g.ore.sphalerite)} sphalerite · ${kg(g.ore.barren)} barren rock in ${g.trips} ${g.trips === 1 ? 'trip' : 'trips'}`,
      g.over === 'dark' ? `The lamp went out${g.hunt.kg || g.basket.kg ? `: ${kg(g.hunt.kg + g.basket.kg)} of ore stayed inside` : ''}.` : `Out with ${fmtClock(g.lamp)} of oil left.`
    ];
  },
  objectives: [
    walkTo(MINE_DOOR, 'Go to the adit of the Silberberg', 'the adit'),
    {
      id: 'mine',
      title: 'Mine the ore and bring it to day',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.shift;
        if (!g) return { done: false, progress: 0, text: 'Lighting the lamp …', target: null, hint: null };
        const text = `${shiftScore(g)} pts out · basket ${Math.round(g.basket.kg)}/${MINE.basket} kg · hunt ${Math.round(g.hunt.kg)} kg · lamp ${fmtClock(g.lamp)}`;
        const hint = g.lamp < MINE.lampLow ? 'The lamp is running low: push the hunt out!'
          : g.basket.kg >= MINE.basket - 1e-6 ? 'The basket is full: to the hunt'
          : g.target ? 'Hold Strike (E / Space) to break the ore'
          : null;
        return { done: !!g.over, progress: g.lamp / MINE.lamp, text, target: null, hint };
      }
    }
  ]
};

export const MINE_MISSIONS = [MINE_MISSION];
