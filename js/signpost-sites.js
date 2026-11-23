import { inFlatRing as inRing } from './ring.js';
// Where a signpost stands: beside the ways, not on them. A hiking signpost's site is a junction of the hiking network
// (swissTLM3D), a winter trail's a point along its line; the ways of the game are OSM's with their mapped widths, and
// a junction of two 6 m streets is wider than the 1.6 m a post was set aside by. The post is moved out from its site,
// in the direction it was given or as near to it as there is room, to the nearest spot clear of every road, path and
// track (their half width and a verge), of the railway, of the buildings, of the water and of the mapped single trees
// and shrubs (a post stood in a bush at a street's corner).

const CELL = 32;
const DRIVE = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|pedestrian)/;
// (metres of verge between a way's edge and the post: a street has a kerb or a shoulder, a path only its edge)
const VERGE = { street: 1.0, path: 0.6, rail: 1.8 };
const RAIL_HALF = 1.5;
const TREE_CLEAR = 1.6;

/**
 * The obstacles of the map (DAVOS_DATA: roads, railways, buildings, water; trees: [x, z, …] of TLM_TREES) in a grid.
 * blocked(x, z): whether a post at (x, z) would stand on a way, its verge, the track, in a house or in the water.
 */
export function signpostObstacles({ roads = [], railways = [], buildings = [], water = [], trees = [] } = {}) {
  const lines = new Map(), rings = new Map(), points = new Map();
  const put = (map, cx, cz, v) => { const k = cx * 65536 + cz; let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(v); };
  const addLine = (pts, reach) => {
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const s = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3], reach];
      const x0 = Math.floor((Math.min(s[0], s[2]) - reach) / CELL), x1 = Math.floor((Math.max(s[0], s[2]) + reach) / CELL);
      const z0 = Math.floor((Math.min(s[1], s[3]) - reach) / CELL), z1 = Math.floor((Math.max(s[1], s[3]) + reach) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) put(lines, cx, cz, s);
    }
  };
  for (const r of roads) {
    if (!r.pts || r.tunnel) continue;
    const street = DRIVE.test(r.kind);
    addLine(r.pts, (r.width || (street ? 6 : 2)) / 2 + (street ? VERGE.street : VERGE.path));
  }
  for (const r of railways) if (r.pts && !r.tunnel) addLine(r.pts, RAIL_HALF + VERGE.rail);
  const addRing = (ring) => {
    if (!ring || ring.length < 6) return;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) { x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]); z0 = Math.min(z0, ring[i + 1]); z1 = Math.max(z1, ring[i + 1]); }
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) put(rings, cx, cz, ring);
  };
  for (const b of buildings) addRing(b.ring);
  for (const w of water) addRing(Array.isArray(w) ? w : w.ring || w.pts);

  for (const t of trees) {
    for (let cx = Math.floor((t[0] - TREE_CLEAR) / CELL); cx <= Math.floor((t[0] + TREE_CLEAR) / CELL); cx++) {
      for (let cz = Math.floor((t[1] - TREE_CLEAR) / CELL); cz <= Math.floor((t[1] + TREE_CLEAR) / CELL); cz++) put(points, cx, cz, t);
    }
  }

  const blocked = (x, z) => {
    const k = Math.floor(x / CELL) * 65536 + Math.floor(z / CELL);
    for (const t of points.get(k) || []) if (Math.hypot(t[0] - x, t[1] - z) < TREE_CLEAR) return true;
    for (const s of lines.get(k) || []) {
      const dx = s[2] - s[0], dz = s[3] - s[1];
      const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz || 1e-9)));
      if (Math.hypot(s[0] + dx * t - x, s[1] + dz * t - z) < s[4]) return true;
    }
    for (const ring of rings.get(k) || []) if (inRing(ring, x, z)) return true;
    return false;
  };
  // The nearest point on a way's or the railway's line within `reach` m of (x, z): { x, z, d }, or null
  const nearestLine = (x, z, reach = 12) => {
    let best = null, bd = reach;
    const seen = new Set();
    for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
      for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
        for (const s of lines.get(cx * 65536 + cz) || []) {
          if (seen.has(s)) continue;
          seen.add(s);
          const dx = s[2] - s[0], dz = s[3] - s[1];
          const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz || 1e-9)));
          const px = s[0] + dx * t, pz = s[1] + dz * t, d = Math.hypot(px - x, pz - z);
          if (d < bd) { bd = d; best = { x: px, z: pz, d }; }
        }
      }
    }
    return best;
  };
  return { blocked, nearestLine };
}

// A clear spot may lie metres off the way in the meadow (the hiking network's junction is not OSM's): the post is
// brought up to the nearest way's verge, as far as the spots on the line towards it are clear
function towardsWay(obstacles, x, z, step = 0.25) {
  const near = obstacles.nearestLine?.(x, z);
  if (!near || near.d < 1e-3) return { x, z };
  const ux = (near.x - x) / near.d, uz = (near.z - z) / near.d;
  let s = 0;
  while (s + step < near.d && !obstacles.blocked(x + ux * (s + step), z + uz * (s + step))) s += step;
  return { x: x + ux * s, z: z + uz * s };
}

/**
 * The spot for a post of the site (x, z): `start` m from it towards `a` (atan2(dx, dz)) if that is clear, else the
 * nearest clear spot further out, towards `a` rather than aside. { x, z, moved } (moved: metres beyond `start`); the
 * spot at `start` where nothing within `reach` is clear.
 */
export function signpostSpot(obstacles, x, z, a, { start = 1.6, reach = 16, step = 0.5 } = {}) {
  for (let r = start; r <= reach + 1e-6; r += step) {
    for (let k = 0; k <= 12; k++) {
      for (const sign of k === 0 || k === 12 ? [1] : [1, -1]) {
        const b = a + (sign * k * Math.PI) / 12, px = x + Math.sin(b) * r, pz = z + Math.cos(b) * r;
        if (!obstacles.blocked(px, pz)) return { ...towardsWay(obstacles, px, pz), moved: r - start };
      }
    }
  }
  return { x: x + Math.sin(a) * start, z: z + Math.cos(a) * start, moved: 0 };
}
