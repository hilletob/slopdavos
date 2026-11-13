// js/missions-data-mine.js
// The Silberberg mine (js/missions-data.js lists its missions; js/missions-mine.js has their runtime: the adits'
// portals in the world, the galleries inside, the lamp, the sounds): the definitions and the pure game behind them,
// three.js-free (tests/missions-mine.test.mjs drives it on the real galleries, a bot included).
//
// The place: the Bergwerk Silberberg above Schmelzboden (Davos Monstein), the biggest lead and zinc mine of Switzerland:
// galena (Bleiglanz, lead with a little silver) and sphalerite (Zinkblende). Its galleries are the ones the Institut
// Geomatik FHNW laser-scanned in 2023 (tools/build-silberberg-mine.mjs turns the scans into assets/silberberg/*.bin,
// js/silberberg-asset.js parses them): the Dalvazzerstollen, a narrow, high vein with the visitors' footbridge over its
// stope, and the Hilfsstollen 53 m higher up, ~360 m of gallery with side drifts, a loop and a junction at its far end.
//
// Two missions:
//   silberberg-mine — ore in the Hilfsstollen. Glittering spots in the walls are ore: galena (silver-grey), sphalerite
//     (brown-yellow) — and barren rock that glitters much the same. Hold Strike at a spot to break ore into the basket
//     (16 kg), the basket empties into the hunt (the mine cart) next to it; the hunt runs on rails along the main
//     gallery, pushed from behind (it fills the gallery: nobody squeezes past it). Push it out to the portal to bring
//     its ore to day: only ore that came out counts. The lamp's oil lasts 6 minutes. Points: kg × value × grade.
//   silberberg-tour — a guided walk: into the Dalvazzerstollen to St Barbara and the stope, out, up the hill to the
//     Hilfsstollen and along it past the years carved in its walls to the far end. Timed.
//
// Inside, positions are metres relative to the adit's origin (its portal station), world axes (x east, z south); the
// heading is the world's (forward = (sin h, cos h)).

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
  lamp: 360, // s of oil
  lampLow: 40, // s left: the flame gutters
  basket: 16, // kg
  strikeS: 0.85, // s a strike of the hammer
  chunk: 2.5, // kg a strike breaks loose
  reach: 1.9, // m to a spot in the wall
  walk: 2.5, back: 1.2, turn: 2.3, // m/s, rad/s
  radius: 0.1, // m: the miner's feet off the floor's edge (the floor of a narrow gallery is narrower still)
  step: 0.5, // m: the highest step between two places on the floor
  huntHalf: 0.75, huntWidth: 0.42, // m: the cart, along and across the rails (half its length, half its width)
  load: 2.1, // m from the hunt: the basket empties into it
  mouthS: 1.0, // m along the rails: the hunt at the portal, unloaded
  huntStart: 3.6, // m along the rails: where the hunt waits at the start
  ores: {
    galena: { name: 'galena', label: 'Galena', value: 12, colour: '#b9c2cc' },
    sphalerite: { name: 'sphalerite', label: 'Sphalerite', value: 8, colour: '#b07a2a' },
    barren: { name: 'barren', label: 'Barren rock', value: 1, colour: '#9a8f80' }
  },
  veins: { galena: 8, sphalerite: 9, barren: 8 },
  veinGap: 6 // m between two spots at least
};

// --- The adits in the world ----------------------------------------------------------------------------------------------
// (origin: the portal station in the world frame, from the asset's header; out: the portal's outward direction, x/z)
const adit = (id, origin, out, label) => {
  const door = { x: origin[0] + out[0] * 3.4, z: origin[2] + out[1] * 3.4, r: 1.8 }; // (a small ring, out in front: on the steep slope a big one would hide the portal)
  return { id, label, x: origin[0], z: origin[2], out, heading: Math.atan2(-out[0], -out[1]), door };
};
export const ADITS = {
  dalvazzer: adit('dalvazzer', [-5917.57, -51.58, 11163.33], [-0.783, 0.622], 'the Dalvazzerstollen'),
  hilfsstollen: adit('hilfsstollen', [-5861.42, 1.54, 11081.73], [-0.6, 0.8], 'the Hilfsstollen')
};
// (the old names: the ore mission's adit, its door)
export const MINE_ADIT = ADITS.hilfsstollen;
export const MINE_DOOR = ADITS.hilfsstollen.door;

/** The mine of the day: new veins every day (the same all day: a best score to beat) */
export const mineSeedOfDay = (date = new Date()) => date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

// --- The galleries: the floor, the rails ------------------------------------------------------------------------------------
/** The rails of a parsed adit: { pts: [{ x, y, z, s }], length } (s: metres from the portal end) */
export function railOf(a) {
  const pts = [];
  let s = 0;
  for (const [x, y, z] of a.header.rail) {
    if (pts.length) { const p = pts[pts.length - 1]; s += Math.hypot(x - p.x, z - p.z); }
    pts.push({ x, y, z, s });
  }
  return { pts, length: s };
}

/** A point on the rails at s: { x, y, z, tx, tz (the direction, inwards) } */
export function railAt(rail, s) {
  const P = rail.pts;
  s = clamp(s, 0, rail.length);
  let i = 0;
  while (i < P.length - 2 && P[i + 1].s < s) i++;
  const a = P[i], b = P[i + 1] || a;
  const len = Math.max(1e-6, b.s - a.s), t = clamp((s - a.s) / len, 0, 1);
  const dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz) || 1;
  return { x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t, tx: dx / dl, tz: dz / dl };
}

/** The rail's nearest point to (x, z): { s, along (signed, inwards), lat } — a search near the last s */
export function railProject(rail, x, z) {
  let best = null;
  const P = rail.pts;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
    const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { d, s: a.s + (b.s - a.s) * t };
  }
  return best;
}

/** Whether a miner of radius r stands at (x, z) on the floor, with no step over `step` from y0 (when given) */
export function freeAt(floor, x, z, r = MINE.radius, y0 = null) {
  const c = floor.at(x, z);
  if (!c) return false;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const f = floor.at(x + Math.cos(a) * r, z + Math.sin(a) * r);
    if (!f || Math.abs(f.y - c.y) > MINE.step) return false;
  }
  return y0 == null || Math.abs(c.y - y0) <= MINE.step;
}

/** The floor's cells as a graph: neighbours, the walking distance from the portal (m) */
function floorGraph(floor) {
  const pts = floor.points();
  const byKey = new Map();
  pts.forEach((p, i) => byKey.set(`${p.iu},${p.iw}`, i));
  const nbr = pts.map((p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => byKey.get(`${p.iu + a},${p.iw + b}`) ?? -1));
  return { pts, byKey, nbr };
}

/** Distances (in cells) from a set of cells over the floor graph (BFS) */
function bfs(graph, from) {
  const d = new Float32Array(graph.pts.length).fill(Infinity);
  const q = [];
  for (const i of from) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (const n of graph.nbr[i]) if (n >= 0 && d[n] === Infinity && Math.abs(graph.pts[n].y - graph.pts[i].y) <= MINE.step) { d[n] = d[i] + 1; q.push(n); }
  }
  return d;
}

/** The floor's cell at (x, z), or the nearest one within a metre (a point beside the floor: on the rails, at a wall) */
const cellIndex = (graph, floor, x, z) => {
  const [iu, iw] = floor.cellOf(x, z);
  const at = graph.byKey.get(`${iu},${iw}`);
  if (at != null) return at;
  for (let r = 1; r <= 5; r++) {
    let best = -1, bd = Infinity;
    for (let dw = -r; dw <= r; dw++) for (let du = -r; du <= r; du++) {
      if (Math.max(Math.abs(du), Math.abs(dw)) !== r) continue;
      const i = graph.byKey.get(`${iu + du},${iw + dw}`);
      if (i != null && du * du + dw * dw < bd) { bd = du * du + dw * dw; best = i; }
    }
    if (best >= 0) return best;
  }
  return -1;
};

/**
 * The mine of a seed on a parsed adit: the floor, the rails, the veins in the walls (deeper, richer: galena weighted by
 * the walk from the portal). { adit, floor, rail, graph, depth, veins, seed }
 */
export function createMine(a, seed = 1, M = MINE) {
  const rand = mineRandom(seed);
  const floor = a.floor, rail = railOf(a);
  const graph = floorGraph(floor);
  const start = cellIndex(graph, floor, rail.pts[0].x, rail.pts[0].z);
  const depth = bfs(graph, [start]);
  const cell = floor.cell;
  // the walls: the floor's cells beside the rock, facing into the gallery (the rock's side in u/w → x/z)
  const F = a.header.floor;
  const faces = [];
  graph.pts.forEach((p, i) => {
    if (!Number.isFinite(depth[i]) || depth[i] * cell < 12) return;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([du, dw], k) => {
      if (graph.nbr[i][k] >= 0) return;
      // (only a straight stretch of wall: the cells beside along it are walls too)
      const ex = du * F.cos - dw * F.sin, ez = -(du * F.sin + dw * F.cos); // (towards the rock, x/z)
      faces.push({ i, x: p.x + ex * cell * 0.75, z: p.z + ez * cell * 0.75, nx: -ex, nz: -ez, sx: p.x, sz: p.z, floor: p.y, ceil: p.ceil, depth: depth[i] * cell });
    });
  });
  const veins = [];
  const far = (f) => veins.every((v) => Math.hypot(v.x - f.x, v.z - f.z) >= M.veinGap);
  const pick = (weight) => {
    const cand = faces.filter(far);
    let total = 0;
    for (const f of cand) total += weight(f);
    let r = rand() * total;
    for (const f of cand) { r -= weight(f); if (r <= 0) return f; }
    return cand[cand.length - 1];
  };
  const add = (kind, weight) => {
    const f = pick(weight);
    if (!f) return;
    const top = Math.min(1.7, f.ceil - f.floor - 0.35);
    veins.push({
      id: veins.length, kind, x: f.x, z: f.z, y: f.floor + 0.6 + rand() * Math.max(0.2, top - 0.6), nx: f.nx, nz: f.nz, sx: f.sx, sz: f.sz,
      depth: f.depth,
      grade: kind === 'barren' ? 1 : Math.round((0.6 + rand() * 0.4) * 100) / 100,
      kg: kind === 'barren' ? 7.5 : 10 + Math.round(rand() * 3) * 2.5, mined: 0
    });
  };
  for (let n = 0; n < M.veins.galena; n++) add('galena', (f) => f.depth ** 1.6);
  for (let n = 0; n < M.veins.sphalerite; n++) add('sphalerite', (f) => f.depth);
  for (let n = 0; n < M.veins.barren; n++) add('barren', () => 1);
  return { adit: a, floor, rail, graph, depth, veins, seed };
}

// --- Walking --------------------------------------------------------------------------------------------------------------
/** A walker just inside the portal, facing in */
export function createWalker(a) {
  const rail = railOf(a);
  const p = railAt(rail, 0);
  return { x: p.x, z: p.z, y: a.floor.at(p.x, p.z)?.y ?? p.y, heading: Math.atan2(p.tx, p.tz), moving: 0, entered: false, out: false, walked: 0 };
}

/** The ceiling over the walker (for the eye: it ducks under a low roof) */
export const ceilingAt = (floor, x, z) => floor.at(x, z)?.ceil ?? null;

/**
 * One step of walking: input { forward, back (0..1), turn (-1..1, + left) }; `blocked(nx, nz, dx, dz)` may veto a
 * step (the hunt). Leaving through the portal (beyond its plane, having been in) sets w.out.
 */
export function stepWalk(w, a, input, dt, { speed = 1, blocked = null } = {}) {
  const M = MINE;
  w.heading = wrapPi(w.heading + clamp(input.turn || 0, -1, 1) * M.turn * dt);
  const v = (clamp(input.forward || 0, 0, 1) * M.walk - clamp(input.back || 0, 0, 1) * M.back) * speed;
  w.moving = v;
  if (v) {
    const fx = Math.sin(w.heading), fz = Math.cos(w.heading);
    const step = (dx, dz) => {
      const nx = w.x + dx, nz = w.z + dz;
      if (!freeAt(a.floor, nx, nz, M.radius, w.y)) return false;
      if (blocked && blocked(nx, nz, dx, dz)) return false;
      w.x = nx; w.z = nz;
      w.walked += Math.hypot(dx, dz);
      return true;
    };
    // (blocked: turned a little, then more, either way — the walker slides along the rough walls instead of sticking)
    let moved = false;
    for (const da of [0, 0.45, -0.45, 0.9, -0.9, 1.3, -1.3]) {
      const c = Math.cos(da), sn = Math.sin(da);
      const k = v * dt * c;
      if (step((fx * c + fz * sn) * k, (fz * c - fx * sn) * k)) { moved = true; break; }
    }
    // (still stuck in a jagged corner: the free spot nearest where the step would go, if it is a step forward)
    if (!moved) {
      const tx = w.x + fx * v * dt, tz = w.z + fz * v * dt;
      let best = null, bd = Infinity;
      // (the feet's margin first, then none: a narrow neck of the floor is still a way through)
      for (const margin of [M.radius, 0]) {
        for (const r of [0, 0.06, 0.12, 0.18]) for (let k = 0; k < (r ? 12 : 1); k++) {
          const an = (k / 12) * Math.PI * 2, cx = tx + Math.cos(an) * r, cz = tz + Math.sin(an) * r;
          const d = Math.hypot(cx - tx, cz - tz);
          if (d >= bd || ((cx - w.x) * fx + (cz - w.z) * fz) * Math.sign(v) <= 0.002) continue;
          if (freeAt(a.floor, cx, cz, margin, w.y) && !(blocked && blocked(cx, cz, cx - w.x, cz - w.z))) { bd = d; best = [cx, cz]; }
        }
        if (best) break;
      }
      if (best) { w.walked += Math.hypot(best[0] - w.x, best[1] - w.z); w.x = best[0]; w.z = best[1]; }
    }
  }
  const f = a.floor.at(w.x, w.z);
  if (f) w.y += (f.y - w.y) * Math.min(1, dt * 12);
  // in and out: the portal's plane (its outward direction from the origin)
  const [ox, oz] = a.header.portal.out;
  const outward = w.x * ox + w.z * oz;
  if (outward < -5) w.entered = true;
  if (w.entered && outward > 0.25) w.out = true;
  return w;
}

// --- The shift ---------------------------------------------------------------------------------------------------------
/** A shift in the mine: the miner just inside the portal, the hunt on the rails ahead of it */
export function createShift(mine, M = MINE) {
  const w = createWalker(mine.adit);
  return {
    mine, ...w,
    basket: { galena: 0, sphalerite: 0, barren: 0, kg: 0, pts: 0 },
    hunt: { s: M.huntStart, kg: 0, pts: 0, moving: 0 },
    lamp: M.lamp,
    delivered: 0, deliveredKg: 0, trips: 0,
    ore: { galena: 0, sphalerite: 0, barren: 0 }, // kg brought out
    mining: null, target: null, over: null, warned: false, fullWarnT: 0, swing: 0
  };
}

const huntFrame = (g, M) => {
  const p = railAt(g.mine.rail, g.hunt.s);
  return p;
};
/** Where (x, z) is against the hunt: { along (+ inwards), lat } */
const relHunt = (g, x, z, M) => {
  const h = huntFrame(g, M);
  const dx = x - h.x, dz = z - h.z;
  return { along: dx * h.tx + dz * h.tz, lat: -dx * h.tz + dz * h.tx, h };
};
const huntMax = (g, M) => g.mine.rail.length - M.huntHalf - 0.3;

/**
 * One step of the shift. input: { forward (0..1), back (0..1), turn (-1..1, + left), strike (bool, held) }.
 * Returns the step's events: [{ type: 'strike' | 'ore' | 'empty' | 'full' | 'load' | 'deliver' | 'low' | 'dark' |
 * 'exit', ... }]
 */
export function stepShift(g, input, dt, M = MINE) {
  const ev = [];
  if (g.over) return ev;
  const mine = g.mine;
  g.lamp -= dt;
  if (g.lamp <= M.lampLow && !g.warned) { g.warned = true; ev.push({ type: 'low' }); }
  if (g.lamp <= 0) { g.lamp = 0; g.over = 'dark'; ev.push({ type: 'dark' }); return ev; }
  g.swing += dt;
  g.fullWarnT = Math.max(0, g.fullWarnT - dt);
  const striking = !!input.strike;
  g.hunt.moving = 0;
  // the hunt: in the way, or pushed along its rails (from behind, along them)
  const reach = M.huntHalf + M.radius;
  const blocked = (nx, nz, dx, dz) => {
    const r = relHunt(g, nx, nz, M);
    if (Math.abs(r.lat) >= M.huntWidth + M.radius || Math.abs(r.along) >= reach) return false;
    const push = dx * r.h.tx + dz * r.h.tz; // (the step along the rails)
    const side = Math.sign(relHunt(g, g.x, g.z, M).along) || -1; // (which end of it the miner is at)
    if (!push || Math.sign(push) === side) return true; // (sideways, or away from it while inside its box)
    const want = clamp(g.hunt.s + (r.along - side * reach) * 1, 0, huntMax(g, M));
    const moved = want - g.hunt.s;
    if (Math.abs(moved) < Math.abs(push) * 0.5 && Math.abs(push) > 1e-4) return true; // (against the end of the rails)
    g.hunt.s = want; g.hunt.moving += moved;
    return false;
  };
  const pushing = Math.abs(relHunt(g, g.x + Math.sin(g.heading) * 0.4, g.z + Math.cos(g.heading) * 0.4, M).along) < reach + 0.1
    && Math.abs(relHunt(g, g.x, g.z, M).lat) < M.huntWidth + M.radius;
  const speed = (striking && g.target ? 0 : 1) * (g.basket.kg > M.basket * 0.5 ? 0.85 : 1) * (pushing ? (g.hunt.kg > 40 ? 0.6 : 0.8) : 1);
  // pulling: at an end of the hunt, facing it, walking backwards — it follows (the way to get it out from its portal
  // side, the gallery being too narrow to get round it)
  const r0 = relHunt(g, g.x, g.z, M);
  const facing = Math.cos(Math.atan2(r0.h.x - g.x, r0.h.z - g.z) - g.heading) > 0.5;
  const pull = (input.back || 0) > 0 && !(input.forward > 0) && facing && Math.abs(r0.lat) < M.huntWidth + 0.5
    && Math.abs(r0.along) < reach + 0.5 ? Math.sign(r0.along) : 0;
  if (pull) {
    // (the miner walks backwards along the rails, the hunt after it)
    w_turn(g, input, dt, M);
    const v = M.back * (input.back || 0) * (g.hunt.kg > 40 ? 0.75 : 0.9);
    const want = clamp(g.hunt.s + pull * v * dt, 0, huntMax(g, M));
    const at = railAt(mine.rail, want + pull * (reach + 0.05));
    if (want !== g.hunt.s && freeAt(mine.floor, at.x, at.z, 0)) {
      g.hunt.moving += want - g.hunt.s; g.hunt.s = want;
      g.walked += Math.hypot(at.x - g.x, at.z - g.z);
      g.x = at.x; g.z = at.z;
      const f = mine.floor.at(g.x, g.z);
      if (f) g.y += (f.y - g.y) * Math.min(1, dt * 12);
    }
    g.moving = -v;
  } else stepWalk(g, mine.adit, input, dt, { speed, blocked });
  if (g.out) { g.over = 'exit'; ev.push({ type: 'exit' }); return ev; }
  // the hunt at the portal: its ore comes to day
  if (g.hunt.s <= M.mouthS && g.hunt.kg > 0) {
    const h = g.hunt;
    ev.push({ type: 'deliver', kg: h.kg, pts: h.pts });
    g.delivered += h.pts; g.deliveredKg += h.kg; g.trips++;
    for (const k of Object.keys(g.ore)) { g.ore[k] += h[k] || 0; h[k] = 0; }
    h.kg = 0; h.pts = 0;
  }
  // the basket into the hunt, next to it
  const hp = huntFrame(g, M);
  if (g.basket.kg > 0 && Math.hypot(g.x - hp.x, g.z - hp.z) < M.load) {
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

function w_turn(w, input, dt, M) { w.heading = wrapPi(w.heading + clamp(input.turn || 0, -1, 1) * M.turn * dt); }

export const shiftScore = (g) => Math.round(g?.delivered || 0);
/** The most a mine holds (all its ore out) */
export const mineMaxScore = (mine, M = MINE) => mine.veins.reduce((a, v) => a + v.kg * M.ores[v.kind].value * v.grade, 0);

// --- A bot (the medals' calibration, the tests) ------------------------------------------------------------------------
/** The way over the floor towards (x, z): the next cell's centre, and the distance (m) — a BFS field per goal, cached */
export function wayTo(mine, from, to) {
  const { graph, floor } = mine;
  const goal = cellIndex(graph, floor, to.x, to.z);
  const here = cellIndex(graph, floor, from.x, from.z);
  if (goal < 0 || here < 0) return null;
  mine.fields ??= new Map();
  let d = mine.fields.get(goal);
  if (!d) { d = bfs(graph, [goal]); mine.fields.set(goal, d); if (mine.fields.size > 64) mine.fields.delete(mine.fields.keys().next().value); }
  if (!Number.isFinite(d[here])) return null;
  // (a few cells ahead down the field: a smoother line than the next cell)
  let i = here;
  for (let k = 0; k < 4 && d[i] > 0; k++) {
    let next = i;
    for (const n of graph.nbr[i]) if (n >= 0 && d[n] < d[next]) next = n;
    // (stay off the walls: prefer the neighbour of the same distance farther from the rock)
    i = next;
  }
  const p = graph.pts[i];
  return { x: d[here] ? p.x : to.x, z: d[here] ? p.z : to.z, dist: d[here] * floor.cell };
}

/**
 * A miner who knows the mine: the richest spot for the walk first, the basket to the hunt (pushed along deeper while
 * there is time), the hunt out before the oil runs low (`reserve` s), then out.
 */
export function botShiftInput(g, M = MINE, { reserve = 20 } = {}) {
  const mine = g.mine;
  const go = (to, slack = 0.3) => {
    const w = wayTo(mine, g, to);
    if (!w) return { turn: 0, forward: 0, d: Infinity };
    const want = Math.atan2(w.x - g.x, w.z - g.z);
    const err = wrapPi(want - g.heading);
    const d = Math.max(w.dist, Math.hypot(to.x - g.x, to.z - g.z));
    return { turn: clamp(err * 3, -1, 1), forward: Math.abs(err) < 0.7 && d > slack ? 1 : 0, d };
  };
  const hp = railAt(mine.rail, g.hunt.s);
  const me = railProject(mine.rail, g.x, g.z);
  // time to bring the hunt out: to its far end, then pushed to the portal
  const portalSide = me.s < g.hunt.s;
  const toHunt = Math.abs(me.s - (g.hunt.s + (portalSide ? -1 : 1) * (M.huntHalf + 1))) / M.walk;
  const pushOut = g.hunt.s / (portalSide ? M.back * 0.75 : M.walk * (g.hunt.kg > 40 ? 0.6 : 0.8)) + toHunt + 6;
  const goingOut = g.lamp < pushOut + reserve || (g.lamp < pushOut + reserve + 25 && !g.basket.kg && g.hunt.kg);
  if (goingOut) {
    if (g.basket.kg) return { ...go(hp), strike: false };
    if (!g.hunt.kg || g.hunt.s <= M.mouthS) return { ...go({ x: 0, z: 0 }, 0), strike: false };
    const rel = relHunt(g, g.x, g.z, M);
    // on its portal side: pulled out, walking backwards
    if (rel.along < 0) {
      if (rel.along < -(M.huntHalf + M.radius + 0.3)) return { ...go(railAt(mine.rail, g.hunt.s - M.huntHalf - M.radius - 0.15), 0.12), strike: false };
      const err = wrapPi(Math.atan2(hp.x - g.x, hp.z - g.z) - g.heading);
      return { turn: clamp(err * 3, -1, 1), forward: 0, back: Math.abs(err) < 0.6 ? 1 : 0, strike: false };
    }
    // behind the hunt (deeper), then along the rails to the portal
    const behind = railAt(mine.rail, g.hunt.s + M.huntHalf + M.radius + 0.25);
    if (rel.along < M.huntHalf + M.radius - 0.05 || Math.abs(rel.lat) > 0.45) return { ...go(behind, 0.15), strike: false };
    const err = wrapPi(Math.atan2(-hp.tx, -hp.tz) - g.heading);
    return { turn: clamp(err * 3, -1, 1), forward: Math.abs(err) < 0.4 ? 1 : 0, strike: false };
  }
  if (g.basket.kg >= M.basket - 0.1) return { ...go(hp), strike: false };
  // the best spot: value over (the walk there and back to the hunt)
  let best = null, bestV = 0;
  for (const vn of mine.veins) {
    const left = vn.kg - vn.mined;
    if (left <= 1e-6 || vn.kind === 'barren') continue;
    const there = Math.hypot(vn.x - g.x, vn.z - g.z) + Math.abs(vn.depth - me.s) * 0.5;
    const back = Math.abs(railProject(mine.rail, vn.x, vn.z).s - g.hunt.s);
    const val = (M.ores[vn.kind].value * vn.grade * Math.min(left, M.basket)) / ((there + back) / M.walk + (Math.min(left, M.basket) / M.chunk) * M.strikeS + 3);
    if (val > bestV) { bestV = val; best = vn; }
  }
  if (!best) return g.basket.kg ? { ...go(hp), strike: false } : { turn: 0, forward: 0, strike: false };
  // the hunt along, deeper, while the miner is on its portal side and the spot lies well beyond it
  const bestS = railProject(mine.rail, best.x, best.z).s;
  const rel = relHunt(g, g.x, g.z, M);
  if (bestS - g.hunt.s > 12 && rel.along < 0 && g.hunt.s < huntMax(g, M) - 1) {
    if (rel.along < -(M.huntHalf + M.radius + 0.6) || Math.abs(rel.lat) > 0.3) return { ...go(railAt(mine.rail, g.hunt.s - M.huntHalf - M.radius - 0.2), 0.15), strike: false };
    const err = wrapPi(Math.atan2(hp.tx, hp.tz) - g.heading);
    return { turn: clamp(err * 3, -1, 1), forward: Math.abs(err) < 0.4 ? 1 : 0, strike: false };
  }
  // stand in front of it, facing it
  // (the floor's cell beside it; near enough already: strike)
  const near = Math.hypot(best.x - g.x, best.z - g.z) < M.reach - 0.4;
  const m = go({ x: best.sx, z: best.sz }, 0.15);
  if (!near && m.d > 0.3) return { ...m, strike: false };
  const err = wrapPi(Math.atan2(best.x - g.x, best.z - g.z) - g.heading);
  return { turn: clamp(err * 3, -1, 1), forward: 0, strike: Math.abs(err) < 0.5 };
}

// --- The missions --------------------------------------------------------------------------------------------------------
const walkTo = (spot, title, label, id = 'enter') => ({
  id,
  title,
  check(ctx) {
    const d = Math.hypot(ctx.x - spot.x, ctx.z - spot.z);
    return { done: d < spot.r, progress: null, text: `${Math.max(0, Math.round(d))} m to ${label}`, target: { ...spot, style: 'plain' }, hint: null };
  }
});

export const MINE_MISSION = {
  id: 'silberberg-mine',
  title: 'Ore in the Silberberg mine',
  intro: 'The Silberberg above Schmelzboden was the richest lead and zinc mine of Switzerland. Take the oil lamp and the hammer into the Hilfsstollen, its galleries as the FHNW surveyors scanned them: find the glittering ore in the walls, galena (silver-grey) and sphalerite (brown-yellow) — the barren rock glitters too, but is next to worthless. Hold Strike (E / Space) to break it out, the basket (16 kg) empties into the hunt next to it. Push the hunt from behind along its rails out to the portal: only ore that comes to day counts. The oil lasts 6 minutes. W/S walk, A/D turn.',
  mode: 'person',
  season: null, // all year round
  time: 'golden',
  features: ['mine'],
  mine: { kind: 'ore', adit: 'hilfsstollen' },
  scoreMode: true,
  score: (state) => shiftScore(state.shift),
  // (calibrated with botShiftInput, a miner who knows where the ore is; a player has to find it first)
  medals: { gold: 650, silver: 420, bronze: 220 },
  bonusMs: 6 * 60 * 1000,
  colour: '#8f7a5a',
  icon: 'mine',
  finish: 'Back in daylight, black with dust: the ore goes down to the smelter at Schmelzboden.',
  interior: { door: MINE_DOOR },
  start: { x: MINE_DOOR.x - 6, z: MINE_DOOR.z + 12, heading: Math.PI * 0.8 },
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
    walkTo(MINE_DOOR, 'Go to the Hilfsstollen of the Silberberg', 'the adit'),
    {
      id: 'mine',
      title: 'Mine the ore and bring it to day',
      allowModes: ['person'],
      inside: 'hilfsstollen',
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

// --- The tour ----------------------------------------------------------------------------------------------------------------
// (the stations: the asset's, by name; r: how near counts; card: what the guide says there)
export const TOUR_STATIONS = {
  barbara: {
    adit: 'dalvazzer', station: 'barbara', r: 1.6, label: 'St Barbara',
    title: 'St Barbara',
    text: 'A figure of St Barbara, the patron saint of miners, watches over the Dalvazzerstollen. The miners greeted each other with “Glück auf!” — may the vein open up. Outside the portal stood the Pochhaus, where the ore was crushed and washed.'
  },
  stope: {
    adit: 'dalvazzer', station: 'end', r: 2.0, label: 'the stope',
    title: 'The stope',
    text: 'Look up and down: the miners followed the steep vein, only a few centimetres thick, up and down through the dolomite and left this narrow cleft; below the footbridge the Dalvazzer shaft drops some 100 m. Galena (lead, hardly any silver despite the name) and sphalerite (zinc) sat in the vein.'
  },
  y1813: {
    adit: 'hilfsstollen', station: 'y1813', r: 2.0, label: 'the year 1813',
    title: '1813',
    text: 'A year chiselled into the rock: the surveyors marked how far the Hilfsstollen, the “Langer Michael”, had been driven. It was cut from 1810 to 1828, mostly through barren rock, to reach the vein from below.'
  },
  crossing: {
    adit: 'hilfsstollen', station: 'crossing', r: 2.4, label: 'the crossing',
    title: 'The crossing',
    text: 'Here drifts branch off the gallery. The Geomatik students of the FHNW set up their laser scanner at this crossing in 2023: the galleries you are walking through are their scan.'
  },
  y1818: {
    adit: 'hilfsstollen', station: 'y1818', r: 2.0, label: 'the year 1818',
    title: '1818',
    text: 'Another year in the wall, some 60 metres further on. Around 1810 about 200 people worked for the mine, most of them from Davos and Klosters; the ore went down the Erzweg to the smelter at Schmelzboden.'
  },
  end: {
    adit: 'hilfsstollen', station: 'end', r: 2.4, label: 'the far end',
    title: 'The far end',
    text: 'The end of the Hilfsstollen, 356 m of gallery behind you. Zinc mining stopped in 1847, lead in 1848; the old administration building at Schmelzboden is today the Bergbaumuseum Graubünden. Glück auf!'
  }
};

/** A tour station's place (adit-local) from the parsed adit */
export const stationPoint = (a, st) => { const [x, y, z] = a.header.stations[st.station]; return { x, y, z }; };

const station = (key) => {
  const st = TOUR_STATIONS[key];
  return {
    id: key,
    title: `Find ${st.label}`,
    allowModes: ['person'],
    inside: st.adit,
    station: key,
    check(ctx, state) {
      const w = state.walk;
      const p = state.points?.[key];
      if (!w || w.adit !== st.adit || !p) return { done: false, progress: null, text: 'Lighting the lamp …', target: null, hint: null };
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      return { done: d < st.r, progress: null, text: `${Math.max(0, Math.round(d))} m to ${st.label}`, target: null, hint: null };
    }
  };
};

export const TOUR_MISSION = {
  id: 'silberberg-tour',
  title: 'Through the Silberberg mine',
  intro: 'A guided walk through the Silberberg mine, its galleries as the FHNW surveyors laser-scanned them: into the Dalvazzerstollen to St Barbara and over the footbridge in its stope, back out and up the hill to the Hilfsstollen, along it past the years the miners carved into the rock to its far end. Your lamp shows the way; the HUD the distance to the next station. W/S walk, A/D turn.',
  mode: 'person',
  season: null,
  time: 'golden',
  features: ['mine'],
  mine: { kind: 'tour' },
  medals: { gold: 6 * 60000, silver: 8 * 60000, bronze: 11 * 60000 },
  bonusMs: 6 * 60000,
  colour: '#a08a62',
  icon: 'mine',
  finish: 'Glück auf! The Bergbaumuseum at Schmelzboden tells the rest of the story.',
  start: { x: ADITS.dalvazzer.door.x - 10, z: ADITS.dalvazzer.door.z + 6, heading: Math.PI * 0.6 },
  props: [],
  createState() { return { walk: null, points: null }; },
  objectives: [
    walkTo(ADITS.dalvazzer.door, 'Go to the Dalvazzerstollen', 'the Dalvazzerstollen', 'dalvazzer'),
    station('barbara'),
    station('stope'),
    {
      id: 'out',
      title: 'Back out into the daylight',
      allowModes: ['person'],
      inside: 'dalvazzer',
      check(ctx, state) {
        const w = state.walk;
        if (!w) return { done: false, progress: null, text: '', target: null, hint: null };
        const d = Math.hypot(w.x, w.z);
        return { done: !!w.out, progress: null, text: `${Math.max(0, Math.round(d))} m to the portal`, target: null, hint: null };
      }
    },
    walkTo(ADITS.hilfsstollen.door, 'Climb up to the Hilfsstollen', 'the Hilfsstollen', 'hilfsstollen'),
    station('y1813'),
    station('crossing'),
    station('y1818'),
    station('end')
  ]
};

export const MINE_MISSIONS = [MINE_MISSION, TOUR_MISSION];
