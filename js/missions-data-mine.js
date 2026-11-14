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
//   silberberg-mine — ore in the Hilfsstollen. Veins in the walls (on the scan's rock itself): galena (silver-blue),
//     sphalerite (honey-brown) and barren quartz (white, next to worthless). Hold Strike facing one to break ore into the
//     basket (20 kg); the basket empties into an ore bin (four along the rails, each under a lantern: the haulers take
//     them out). The lamp's oil lasts 6 minutes: walking out before it dies counts the basket too and adds a fifth.
//     Points: kg × value × grade. (No hunt to push: in a gallery a metre wide it was more fight than game.)
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
  lampLow: 45, // s left: the flame gutters
  basket: 20, // kg: the Kratte on the back
  strikeS: 0.7, // s a strike of the hammer
  chunk: 2.5, // kg a strike breaks loose
  reach: 1.75, // m from the miner to the ore in the wall (across the floor)
  walk: 2.5, back: 1.2, turn: 2.3, // m/s, rad/s
  radius: 0.1, // m: the miner's feet off the floor's edge (the floor of a narrow gallery is narrower still)
  step: 0.7, // m: the highest step between two places on the floor (the scan's floor has ledges of 60 cm: a miner climbs them)
  bins: [6, 92, 178, 262], // m along the rails: the ore bins (the Füllorte: the haulers take what is in them out)
  binReach: 1.9, // m from a bin: the basket empties into it
  exitBonus: 0.2, // walking out before the lamp dies: a fifth more (and the basket counts)
  ores: {
    galena: { name: 'galena', label: 'Galena', value: 12, colour: '#c9d4e2' },
    sphalerite: { name: 'sphalerite', label: 'Sphalerite', value: 8, colour: '#e0962e' },
    barren: { name: 'barren', label: 'Barren rock', value: 1, colour: '#e8e2d4' }
  },
  veins: { galena: 8, sphalerite: 9, barren: 7 },
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

// --- The rock: rays against the scan's mesh -----------------------------------------------------------------------------
/** The mesh's triangles in 2 m columns (x/z), built once per parsed adit */
function rockGrid(a) {
  if (a.rockGrid) return a.rockGrid;
  const P = a.positions, I = a.index, C = 2;
  const cols = new Map();
  for (let t = 0; t < I.length; t += 3) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) { const i = I[t + k] * 3; x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
    for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) for (let cz = Math.floor(z0 / C); cz <= Math.floor(z1 / C); cz++) {
      const key = cx * 100003 + cz;
      let l = cols.get(key);
      if (!l) cols.set(key, (l = []));
      l.push(t);
    }
  }
  return (a.rockGrid = { C, cols });
}

/**
 * The rock a ray from (ox, oy, oz) along (dx, dy, dz) (unit) meets within `far` metres: { d, x, y, z, nx, ny, nz } (the
 * normal towards the ray's origin) or null
 */
export function rayRock(a, ox, oy, oz, dx, dy, dz, far = 3) {
  const { C, cols } = rockGrid(a);
  const P = a.positions, I = a.index;
  const seen = new Set();
  let best = null;
  const steps = Math.ceil(far / (C * 0.5)) + 1;
  for (let k = 0; k <= steps; k++) {
    const q = Math.min(far, k * C * 0.5);
    const cx = Math.floor((ox + dx * q) / C), cz = Math.floor((oz + dz * q) / C);
    for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
      const l = cols.get((cx + ax) * 100003 + cz + az);
      if (!l) continue;
      for (const t of l) {
        if (seen.has(t)) continue;
        seen.add(t);
        const i0 = I[t] * 3, i1 = I[t + 1] * 3, i2 = I[t + 2] * 3;
        const e1x = P[i1] - P[i0], e1y = P[i1 + 1] - P[i0 + 1], e1z = P[i1 + 2] - P[i0 + 2];
        const e2x = P[i2] - P[i0], e2y = P[i2 + 1] - P[i0 + 1], e2z = P[i2 + 2] - P[i0 + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-9) continue;
        const inv = 1 / det;
        const sx = ox - P[i0], sy = oy - P[i0 + 1], sz = oz - P[i0 + 2];
        const u = (sx * px + sy * py + sz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (d <= 0.01 || d > far || (best && d >= best.d)) continue;
        let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
        best = { d, x: ox + dx * d, y: oy + dy * d, z: oz + dz * d, nx, ny, nz };
      }
    }
  }
  return best;
}

/**
 * The mine of a seed on a parsed adit: the floor, the rails, the veins in the walls (deeper, richer: galena weighted by
 * the walk from the portal; each on the scan's rock itself, found by a ray from the floor beside it), the ore bins.
 * { adit, floor, rail, graph, depth, veins, bins, seed }
 */
const EYE = 1.15; // m: the miner's eye over the floor, in the scan's metres (js/missions-mine.js draws it higher)

export function createMine(a, seed = 1, M = MINE) {
  const rand = mineRandom(seed);
  const floor = a.floor, rail = railOf(a);
  const graph = floorGraph(floor);
  const start = cellIndex(graph, floor, rail.pts[0].x, rail.pts[0].z);
  const depth = bfs(graph, [start]);
  // the walls: the floor's cells beside the rock, facing into the gallery (the rock's side in u/w → x/z)
  const F = a.header.floor;
  const faces = [];
  graph.pts.forEach((p, i) => {
    if (!Number.isFinite(depth[i]) || depth[i] * floor.cell < 15) return;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([du, dw], k) => {
      if (graph.nbr[i][k] >= 0) return;
      const ex = du * F.cos - dw * F.sin, ez = -(du * F.sin + dw * F.cos); // (towards the rock, x/z)
      faces.push({ i, ex, ez, sx: p.x, sz: p.z, floor: p.y, ceil: p.ceil, depth: depth[i] * floor.cell });
    });
  });
  const veins = [];
  const far = (f) => veins.every((v) => Math.hypot(v.sx - f.sx, v.sz - f.sz) >= M.veinGap);
  const pick = (weight) => {
    const cand = faces.filter((f) => !f.spent && far(f));
    let total = 0;
    for (const f of cand) total += weight(f);
    let r = rand() * total;
    for (const f of cand) { r -= weight(f); if (r <= 0) return f; }
    return cand[cand.length - 1] || null;
  };
  const add = (kind, weight) => {
    // (a face whose rock a ray from the floor beside it meets within reach, at the height of a chest)
    for (let tries = 0; tries < 12; tries++) {
      const f = pick(weight);
      if (!f) return;
      const room = f.ceil - f.floor;
      const h = clamp(0.7 + rand() * 0.6, 0.5, Math.max(0.5, room - 0.35));
      const hit = rayRock(a, f.sx, f.floor + h, f.sz, f.ex, 0, f.ez, 1.4);
      if (!hit || Math.abs(hit.ny) > 0.75) { f.spent = true; continue; } // (no wall there: the face is spent)
      // (seen from where one stands before it, a step back into the gallery, at the eye's height: no rock between)
      const hl = Math.hypot(hit.nx, hit.nz) || 1;
      let stand = null;
      for (const back of [0.9, 0.7, 0.5]) {
        const sx = hit.x + (hit.nx / hl) * back, sz = hit.z + (hit.nz / hl) * back, sf = floor.at(sx, sz);
        if (!sf || Math.abs(sf.y - f.floor) > 0.6) continue;
        const ey = sf.y + EYE, dx = hit.x - sx, dy = hit.y - ey, dz = hit.z - sz, dl = Math.hypot(dx, dy, dz);
        const see = rayRock(a, sx, ey, sz, dx / dl, dy / dl, dz / dl, dl + 0.2);
        if (see && see.d > dl - 0.06) { stand = { x: sx, z: sz }; break; }
      }
      if (!stand) { f.spent = true; continue; }
      veins.push({
        id: veins.length, kind, x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz, sx: stand.x, sz: stand.z,
        depth: f.depth,
        grade: kind === 'barren' ? 1 : Math.round((0.6 + rand() * 0.4) * 100) / 100,
        kg: kind === 'barren' ? 7.5 : 10 + Math.round(rand() * 3) * 2.5, mined: 0
      });
      return;
    }
  };
  for (let n = 0; n < M.veins.galena; n++) add('galena', (f) => f.depth ** 1.6);
  for (let n = 0; n < M.veins.sphalerite; n++) add('sphalerite', (f) => f.depth);
  for (let n = 0; n < M.veins.barren; n++) add('barren', () => 1);
  // the ore bins: against the nearer wall beside the rails, a lantern over each
  const bins = M.bins.filter((s) => s < rail.length - 2).map((s, id) => {
    const p = railAt(rail, s);
    const fy = floor.at(p.x, p.z)?.y ?? p.y;
    let best = null;
    for (const side of [1, -1]) {
      const nx = -p.tz * side, nz = p.tx * side;
      const hit = rayRock(a, p.x, fy + 0.5, p.z, nx, 0, nz, 2.5);
      if (hit && (!best || hit.d < best.hit.d)) best = { hit, nx, nz };
    }
    const off = best ? Math.max(0.25, best.hit.d - 0.32) : 0.5;
    const nx = best ? best.nx : -p.tz, nz = best ? best.nz : p.tx;
    return { id, s, x: p.x + nx * off, y: fy, z: p.z + nz * off, nx: -nx, nz: -nz, kg: 0, pts: 0 };
  });
  return { adit: a, floor, rail, graph, depth, veins, bins, seed };
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

/** How far (m, up to `max`) the floor runs free from the walker along a heading */
function freeRun(floor, w, heading, max) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  let y = w.y;
  for (let d = 0.2; d <= max; d += 0.2) {
    const x = w.x + fx * d, z = w.z + fz * d;
    if (!freeAt(floor, x, z, MINE.radius, y)) return d - 0.2;
    y = floor.at(x, z).y;
  }
  return max;
}

/**
 * One step of walking: input { forward, back (0..1), turn (-1..1, + left) }; `blocked(nx, nz, dx, dz)` may veto a
 * step (the hunt). Leaving through the portal (beyond its plane, having been in) sets w.out.
 */
export function stepWalk(w, a, input, dt, { speed = 1, blocked = null, assist = false } = {}) {
  const M = MINE;
  w.heading = wrapPi(w.heading + clamp(input.turn || 0, -1, 1) * M.turn * dt);
  const v = (clamp(input.forward || 0, 0, 1) * M.walk - clamp(input.back || 0, 0, 1) * M.back) * speed;
  // (walking on without turning where the gallery bends: the eyes follow it round, not scraping along the rock)
  const [pox, poz] = a.header.portal.out;
  if (assist && v > 0 && !input.turn && w.x * pox + w.z * poz < -4) { // (not at the portal: there the floor ends in daylight)
    const ahead = freeRun(a.floor, w, w.heading, 2.4);
    if (ahead < 2.0) {
      let best = 0, run = ahead;
      for (const d of [0.2, -0.2, 0.4, -0.4, 0.6, -0.6, 0.8, -0.8]) {
        const r = freeRun(a.floor, w, w.heading + d, 2.4);
        if (r > run + 0.3) { run = r; best = d; }
      }
      if (best) w.heading = wrapPi(w.heading + Math.sign(best) * Math.min(Math.abs(best), 1.6 * dt));
    }
  }
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
/** A shift in the mine: the miner just inside the portal, the basket empty, the lamp full */
export function createShift(mine, M = MINE) {
  const w = createWalker(mine.adit);
  return {
    mine, ...w,
    basket: { galena: 0, sphalerite: 0, barren: 0, kg: 0, pts: 0 },
    lamp: M.lamp,
    delivered: 0, deliveredKg: 0, trips: 0, bonus: 0,
    ore: { galena: 0, sphalerite: 0, barren: 0 }, // kg mined and brought to a bin (or carried out)
    mining: null, target: null, bin: null, over: null, warned: false, fullWarnT: 0, swing: 0
  };
}

/** The ore of the basket counted (into a bin, or carried out): returns its kg and points */
function bank(g) {
  const b = g.basket, kg = b.kg, pts = b.pts;
  for (const k of ['galena', 'sphalerite', 'barren']) { g.ore[k] += b[k]; b[k] = 0; }
  g.delivered += pts; g.deliveredKg += kg;
  b.kg = 0; b.pts = 0;
  return { kg, pts };
}

/** The vein a miner at (x, z) facing `heading` can strike: in front, within reach, with ore left — or null */
export function veinInReach(mine, x, z, heading, M = MINE) {
  let best = null, bd = Infinity;
  for (const vn of mine.veins) {
    if (vn.kg - vn.mined <= 1e-6) continue;
    const dx = vn.x - x, dz = vn.z - z, d = Math.hypot(dx, dz);
    if (d > M.reach || d >= bd) continue;
    if (Math.abs(wrapPi(Math.atan2(dx, dz) - heading)) > 1.05) continue;
    bd = d; best = vn;
  }
  return best;
}

/** The nearest ore bin on foot: { bin, dist } (dist: metres of the walk) */
export function nearestBin(mine, from) {
  let best = null;
  for (const b of mine.bins) {
    const w = wayTo(mine, from, b);
    const d = w ? Math.max(w.dist, Math.hypot(b.x - from.x, b.z - from.z)) : Infinity;
    if (!best || d < best.dist) best = { bin: b, dist: d };
  }
  return best;
}

/**
 * One step of the shift. input: { forward (0..1), back (0..1), turn (-1..1, + left), strike (bool, held), assist (the
 * player's: the way round the bends, stepWalk) }.
 * Returns the step's events: [{ type: 'ore' | 'empty' | 'full' | 'dump' | 'low' | 'dark' | 'exit', ... }]
 */
export function stepShift(g, input, dt, M = MINE) {
  const ev = [];
  if (g.over) return ev;
  const mine = g.mine;
  g.lamp -= dt;
  if (g.lamp <= M.lampLow && !g.warned) { g.warned = true; ev.push({ type: 'low' }); }
  if (g.lamp <= 0) {
    g.lamp = 0; g.over = 'dark';
    ev.push({ type: 'dark', kg: g.basket.kg });
    return ev;
  }
  g.swing += dt;
  g.fullWarnT = Math.max(0, g.fullWarnT - dt);
  const striking = !!input.strike;
  const heavy = g.basket.kg > M.basket * 0.5 ? 0.85 : 1;
  stepWalk(g, mine.adit, input, dt, { speed: (striking && g.target ? 0 : 1) * heavy, assist: !!input.assist });
  if (g.out) {
    // out on his own feet: the basket counts, and a fifth more for all of it
    const b = bank(g);
    g.bonus = Math.round(g.delivered * M.exitBonus);
    g.over = 'exit';
    ev.push({ type: 'exit', kg: b.kg, pts: b.pts, bonus: g.bonus });
    return ev;
  }
  // a bin within reach: the basket empties into it
  g.bin = null;
  for (const b of mine.bins) if (Math.hypot(g.x - b.x, g.z - b.z) < M.binReach) g.bin = b;
  if (g.bin && g.basket.kg > 0) {
    const b = bank(g);
    g.bin.kg += b.kg; g.bin.pts += b.pts; g.trips++;
    ev.push({ type: 'dump', kg: b.kg, pts: b.pts, bin: g.bin.id });
  }
  // the hammer
  g.target = veinInReach(mine, g.x, g.z, g.heading, M);
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
        if (g.basket.kg >= M.basket - 1e-6) ev.push({ type: 'full' });
      }
    }
  } else g.mining = null;
  return ev;
}

export const shiftScore = (g) => Math.round((g?.delivered || 0) + (g?.bonus || 0));
/** The most a mine holds (all its ore out, and out in time) */
export const mineMaxScore = (mine, M = MINE) => mine.veins.reduce((a, v) => a + v.kg * M.ores[v.kind].value * v.grade, 0) * (1 + M.exitBonus);

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
    i = next;
  }
  const p = graph.pts[i];
  return { x: d[here] ? p.x : to.x, z: d[here] ? p.z : to.z, dist: d[here] * floor.cell };
}

/**
 * A miner who knows the mine: the best spot for the walk first (its ore over the way there and on to a bin), a full
 * basket to the nearest bin, out through the portal before the oil runs low (`reserve` s).
 */
export function botShiftInput(g, M = MINE, { reserve = 12 } = {}) {
  const mine = g.mine;
  const go = (to, slack = 0.3) => {
    const w = wayTo(mine, g, to);
    if (!w) return { turn: 0, forward: 0, d: Infinity };
    const want = Math.atan2(w.x - g.x, w.z - g.z);
    const err = wrapPi(want - g.heading);
    const d = Math.max(w.dist, Math.hypot(to.x - g.x, to.z - g.z));
    return { turn: clamp(err * 3, -1, 1), forward: Math.abs(err) < 0.7 && d > slack ? 1 : 0, d };
  };
  const portal = { x: 0, z: 0 };
  const out = wayTo(mine, g, portal)?.dist ?? 0;
  const leave = () => {
    if (out > 1.5) return { ...go(portal, 0), strike: false };
    // (at the portal: on out through it, into the daylight)
    const [ox, oz] = mine.adit.header.portal.out;
    const err = wrapPi(Math.atan2(ox, oz) - g.heading);
    return { turn: clamp(err * 3, -1, 1), forward: Math.abs(err) < 0.8 ? 1 : 0, strike: false };
  };
  if (g.lamp < out / (M.walk * 0.85) + reserve) return leave();
  if (g.basket.kg >= M.basket - 0.1) return { ...go(nearestBin(mine, g).bin, 0.5), strike: false };
  const binDist = (v) => (v.binDist ??= nearestBin(mine, { x: v.sx, z: v.sz }).dist);
  let best = null, bestV = 0;
  for (const vn of mine.veins) {
    const left = vn.kg - vn.mined;
    if (left <= 1e-6 || vn.kind === 'barren') continue;
    const take = Math.min(left, M.basket - g.basket.kg);
    if (take <= 0) continue;
    const there = wayTo(mine, g, { x: vn.sx, z: vn.sz })?.dist ?? Infinity;
    const val = (M.ores[vn.kind].value * vn.grade * take) / ((there + binDist(vn) * (take / M.basket)) / M.walk + (take / M.chunk) * M.strikeS + 2);
    if (val > bestV) { bestV = val; best = vn; }
  }
  if (!best) return g.basket.kg ? { ...go(nearestBin(mine, g).bin, 0.5), strike: false } : leave();
  // stand on the floor before it, facing it; within reach: strike
  if (veinInReach(mine, g.x, g.z, g.heading, M) === best) return { turn: 0, forward: 0, strike: true };
  const m = go({ x: best.sx, z: best.sz }, 0.15);
  if (m.d > 0.3) return { ...m, strike: false };
  const err = wrapPi(Math.atan2(best.x - g.x, best.z - g.z) - g.heading);
  return { turn: clamp(err * 3, -1, 1), forward: 0, strike: false };
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
  intro: 'The Silberberg above Schmelzboden was the richest lead and zinc mine of Switzerland. Take the oil lamp and the hammer into the Hilfsstollen, its galleries as the FHNW surveyors scanned them. Ore glitters in the walls where your lamp falls: galena (silver-blue cubes) and sphalerite (honey-brown) — white quartz is barren rock, next to worthless. Face a vein and hold Strike (E / Space) to break it into your basket (20 kg). A full basket goes into one of the ore bins along the rails, each under a lantern. The oil lasts 6 minutes: walk out before it is gone, and what you carry counts, with a fifth more for everything. W/S walk, A/D turn.',
  mode: 'person',
  season: null, // all year round
  time: 'golden',
  features: ['mine'],
  mine: { kind: 'ore', adit: 'hilfsstollen' },
  scoreMode: true,
  board: 'silberberg-mine-2', // (rebalanced 2026-11-13 without the hunt: a new list, supabase/migrations/20261113120000_silberberg_mine_2.sql)
  score: (state) => shiftScore(state.shift),
  // (calibrated with botShiftInput, a miner who knows where the ore is; a player has to find it first)
  medals: { gold: 1300, silver: 800, bronze: 400 },
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
      `Mined: ${kg(g.ore.galena)} galena · ${kg(g.ore.sphalerite)} sphalerite · ${kg(g.ore.barren)} barren rock`,
      g.over === 'dark' ? `The lamp went out inside${g.basket.kg ? `: ${kg(g.basket.kg)} in the basket stayed with you` : ''}.` : g.bonus ? `Out with ${fmtClock(g.lamp)} of oil left: +${g.bonus} pts` : `Out with ${fmtClock(g.lamp)} of oil left.`
    ];
  },
  objectives: [
    walkTo(MINE_DOOR, 'Go to the Hilfsstollen of the Silberberg', 'the adit'),
    {
      id: 'mine',
      title: 'Mine the ore and get out before the lamp dies',
      allowModes: ['person'],
      inside: 'hilfsstollen',
      check(ctx, state) {
        const g = state.shift;
        if (!g) return { done: false, progress: 0, text: 'Lighting the lamp …', target: null, hint: null };
        const text = `${shiftScore(g)} pts · basket ${Math.round(g.basket.kg * 10) / 10}/${MINE.basket} kg · lamp ${fmtClock(g.lamp)}`;
        const hint = g.lamp < MINE.lampLow ? 'The lamp is running low: get out!'
          : g.basket.kg >= MINE.basket - 1e-6 ? 'The basket is full: to an ore bin (under a lantern)'
          : g.target ? 'Hold Strike (E / Space) to break the ore'
          : null;
        return { done: !!g.over, progress: g.lamp / MINE.lamp, text, target: null, hint };
      }
    }
  ]
};

// --- The tour ----------------------------------------------------------------------------------------------------------------
// Jöri, a miner of the Silberberg, leads it: he waits at the Dalvazzerstollen, walks ahead through the galleries with his
// lantern, waits for the visitor, tells his story at every station (the lines below; the facts from silberberg-davos.ch
// and the literature: the vein, the Pochhaus, the Hilfsstollen 1810–1828, Hitz's lease and bankruptcy, the ~200 people
// of 1810, lead to 1848) and asks two questions — a wrong answer costs 15 s. In the stope the mountain rumbles, at the
// crossing the draught blows the visitor's lamp out until Jöri lights it again.

// (the stations: the asset's, by name; r: how near counts; title: the plaque's)
export const TOUR_STATIONS = {
  barbara: { adit: 'dalvazzer', station: 'barbara', r: 1.6, label: 'St Barbara', title: 'St Barbara' },
  stope: { adit: 'dalvazzer', station: 'end', r: 2.0, label: 'the stope', title: 'The stope' },
  y1813: { adit: 'hilfsstollen', station: 'y1813', r: 2.0, label: 'the year 1813', title: '1813' },
  crossing: { adit: 'hilfsstollen', station: 'crossing', r: 2.4, label: 'the crossing', title: 'The crossing' },
  y1818: { adit: 'hilfsstollen', station: 'y1818', r: 2.0, label: 'the year 1818', title: '1818' },
  end: { adit: 'hilfsstollen', station: 'end', r: 2.4, label: 'the far end', title: 'The far end' }
};

export const GUIDE = {
  name: 'Jöri',
  speed: 1.5, hurry: 2.4, // m/s: leading; catching up when the visitor is ahead
  lead: 2.2, // m: he stops this far short of a station (the visitor steps up to it)
  wait: 7, // m: farther behind than this, he waits and calls
  callEvery: 14, // s between his calls
  penaltyMs: 15000, // a wrong answer
  lineS: (text) => Math.max(3.2, Math.min(9, text.length * 0.065)) // s a line stays
};

/**
 * What Jöri says: per objective, `start` (when the objective begins) and `arrive` (when it is done). A line is
 * { text } or { text, event: 'rumble' | 'draught' | 'relight' } or { quiz } (the question waits for an answer).
 */
export const GUIDE_SCRIPT = {
  dalvazzer: {
    greet: [
      { text: 'Glück auf! I am Jöri, miner here on the Silberberg. Today I show you our mine.' },
      { text: 'Stay close to my lantern. Down there the mountain decides, not us.' }
    ]
  },
  barbara: {
    start: [{ text: 'In we go. Mind your head: the Dalvazzer was cut for smaller men than you.' }],
    arrive: [
      { text: 'St Barbara keeps watch over us. A miner who forgets her greeting forgets his luck.' },
      { text: 'Out by the portal stood the Pochhaus: there we crushed and washed the ore before it went down to Schmelzboden.' }
    ]
  },
  stope: {
    start: [{ text: 'Now over the footbridge. Do not look down. Or do, if you dare.' }],
    arrive: [
      { text: 'Here the vein ran, a few fingers thick, straight up and down through the dolomite. We followed it with hammer and chisel.' },
      { text: 'Hear that?', event: 'rumble' },
      { text: '… Only the mountain settling. It never sleeps. Below this bridge the shaft drops a hundred metres.' },
      { quiz: 'silver' }
    ]
  },
  out: {
    start: [{ text: 'Back to the daylight now. Then up the hill to the Hilfsstollen. I know a shorter way: I will wait for you up there.' }]
  },
  hilfsstollen: {
    arrive: [{ text: 'There you are! The Hilfsstollen, the “Langer Michael”: 356 metres into the mountain.' }]
  },
  y1813: {
    start: [{ text: 'We cut it from 1810 to 1828, mostly through barren rock, to reach the vein from below.' }],
    arrive: [
      { text: '1813, chiselled by the surveyor. Each year he marked how far we had come.' },
      { text: 'A few centimetres a day. Hammer, chisel and black powder, and the smoke to breathe afterwards.' }
    ]
  },
  crossing: {
    start: [{ text: 'Keep up. And keep your lamp out of the draught.' }],
    arrive: [
      { text: 'Here the drifts branch off. Feel the air moving? That is the Wetterzug, the mountain breathing …' },
      { text: 'Your flame!', event: 'draught' },
      { text: 'Stand still. Do not take a step in the dark.' },
      { text: 'There. Lit again.', event: 'relight' },
      { text: 'A miner without a light is the worst that can happen down here. In 2023 the surveyors of the FHNW set up their laser scanner at this very crossing: every stone you see, they measured.' }
    ]
  },
  y1818: {
    start: [{ text: 'On, deeper into the mountain.' }],
    arrive: [
      { text: '1818. That year Johannes Hitz leased the mine. Eleven years later he was bankrupt and left for America.' },
      { quiz: 'people' }
    ]
  },
  end: {
    start: [{ text: 'The last stretch. Not far now.' }]
  }
};

/** The questions: the right answer's index; what Jöri says to it */
export const GUIDE_QUIZ = {
  silver: {
    question: 'Tell me: how much silver is there in our galena?',
    options: ['A tenth of it', 'A few percent', 'Hardly any'],
    answer: 2,
    right: 'Right! Less than two hundredths of a percent. The name promised more than the mountain gave.',
    wrong: 'No. Hardly any: less than two hundredths of a percent. The name promised more than the mountain gave.'
  },
  people: {
    question: 'How many people worked for the mine around 1810, do you think?',
    options: ['About 20', 'About 200', 'About 2000'],
    answer: 1,
    right: 'Right, about two hundred, most of them from Davos and Klosters.',
    wrong: 'About two hundred, most of them from Davos and Klosters. A lot of mouths for a mountain this stingy.'
  }
};

export const GUIDE_CALLS = ['Over here! Follow my lantern.', 'Do not wander off: the old drifts are not safe.', 'This way!'];

/** An answer to the pending question: whether it was right (a wrong one adds the penalty); null when none is pending */
export function answerQuiz(state, choice) {
  const id = state.quiz?.pending;
  if (!id) return null;
  const q = GUIDE_QUIZ[id];
  const right = choice === q.answer;
  state.quiz.pending = null;
  state.quiz.answers[id] = right;
  if (!right) state.penaltyMs = (state.penaltyMs || 0) + GUIDE.penaltyMs;
  return { id, right, say: right ? q.right : q.wrong };
}

/** A guide at (x, z) on an adit's floor */
export function createGuide(a, nav, ahead = 4) {
  const r = railOf(a);
  const p = railAt(r, Math.min(r.length, ahead));
  return { x: p.x, z: p.z, y: a.floor.at(p.x, p.z)?.y ?? p.y, heading: Math.atan2(p.tx, p.tz), moving: 0, waiting: false, callT: 0, nav, walked: 0, entered: false, out: false };
}

/**
 * One step of the guide: towards `goal` (stopping GUIDE.lead short of it), waiting for the walker when it falls behind,
 * hurrying when it is ahead; standing still (facing the walker) while `hold` (he talks). Returns 'call' when he calls.
 */
export function stepGuide(g, w, a, goal, dt, { hold = false } = {}) {
  const G = GUIDE;
  g.callT = Math.max(0, g.callT - dt);
  g.moving = 0;
  const toW = Math.hypot(w.x - g.x, w.z - g.z);
  const face = (x, z) => { g.heading = Math.atan2(x - g.x, z - g.z); };
  let out = null;
  if (!goal || hold) { face(w.x, w.z); return out; }
  const left = wayTo(g.nav, g, goal);
  const mine = left ? left.dist : Infinity;
  const theirs = wayTo(g.nav, w, goal)?.dist ?? Infinity;
  g.waiting = toW > G.wait && theirs > mine;
  if (g.waiting) {
    face(w.x, w.z);
    if (!g.callT) { g.callT = G.callEvery; out = 'call'; }
    return out;
  }
  if (!left || mine <= G.lead) { face(w.x, w.z); return out; }
  const v = theirs < mine - 1 ? G.hurry : G.speed;
  // (walking as the visitor walks: along the rough walls, not through them)
  g.heading = Math.atan2(left.x - g.x, left.z - g.z);
  const x0 = g.x, z0 = g.z;
  stepWalk(g, a, { forward: Math.min(1, v / MINE.walk) }, dt);
  g.moving = Math.hypot(g.x - x0, g.z - z0) > 1e-4 ? v : 0;
  return out;
}

/** A tour station's place (adit-local) from the parsed adit */
export const stationPoint = (a, st) => { const [x, y, z] = a.header.stations[st.station]; return { x, y, z }; };

const waitQuiz = (state) => (state.quiz?.pending ? { done: false, progress: null, text: `${GUIDE.name} is waiting for your answer`, target: null, hint: 'Answer Jöri: press 1, 2 or 3' } : null);

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
      const q = waitQuiz(state);
      if (q) return q;
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      return { done: d < st.r, progress: null, text: `${Math.max(0, Math.round(d))} m to ${st.label}`, target: null, hint: null };
    }
  };
};

export const TOUR_MISSION = {
  id: 'silberberg-tour',
  title: 'Through the Silberberg mine',
  intro: 'A guided walk through the Silberberg mine with Jöri, a miner of the old days, through its galleries as the FHNW surveyors laser-scanned them: into the Dalvazzerstollen to St Barbara and over the footbridge in its stope, out and up the hill to the Hilfsstollen, past the years the miners carved into the rock to its far end. Follow his lantern and listen: he will ask you two questions (keys 1–3), and a wrong answer costs 15 seconds. W/S walk, A/D turn.',
  mode: 'person',
  season: null,
  time: 'golden',
  features: ['mine'],
  mine: { kind: 'tour' },
  medals: { gold: 6 * 60000, silver: 8 * 60000, bronze: 11 * 60000 },
  bonusMs: 6 * 60000,
  colour: '#a08a62',
  icon: 'mine',
  finish: 'Glück auf! Jöri sends you back into the daylight. The Bergbaumuseum at Schmelzboden tells the rest of the story.',
  start: { x: ADITS.dalvazzer.door.x - 10, z: ADITS.dalvazzer.door.z + 6, heading: Math.PI * 0.6 },
  props: [],
  createState() { return { walk: null, points: null, quiz: { pending: null, answers: {} }, penaltyMs: 0 }; },
  summary(state) {
    const a = Object.values(state.quiz?.answers || {});
    if (!a.length) return [];
    const right = a.filter(Boolean).length;
    return [`Jöri's questions: ${right} of ${a.length} right${right < a.length ? ` (+${(a.length - right) * GUIDE.penaltyMs / 1000} s)` : ''}`];
  },
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
        const q = waitQuiz(state);
        if (q && !w.out) return q;
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
