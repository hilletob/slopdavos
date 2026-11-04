import * as THREE from 'three/webgpu';
import { parseTerrain, gridHeight, gridNormal, subdivideTriangles, fillCuts, gridLevels, pickLevel, cutTriangles } from './terrain-grid.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { QUALITY } from './quality.js';
import { flatGeometry } from './gpu-memory.js';
import { tunnelProfile, openRuns, runRects, isDrivableTunnel } from './tunnel-profile.js';

// Zurich's relief for the engine (which was written for a flat Manhattan at y = 0).
//  - groundHeight(x, z): the bare-earth surface (swissALTI3D, data/davos-terrain.bin, with the bridgeheads raised and
//    the tunnel ramps filled below), exactly as the terrain mesh draws it (see terrain-grid.js).
//  - deckHeight(x, z): the surveyed deck of the bridge under (x, z) (tools/build-davos-geodata.mjs, roads[].ys), or NaN.
//  - surfaceHeight(x, z, nearY): what an actor at height ~nearY stands on: the deck when on a bridge, unless it is
//    clearly passing underneath on land (the Hardbrücke spans streets and the tracks; there is no going under a bridge
//    over the water).
//  - Static geometry built flat by the engine is laid onto the surface afterwards: drapeOverlay() for ground layers
//    (roads, paths, lawns, rivers: subdivided and lifted vertex by vertex), placeOnTerrain() for everything else
//    (street furniture, trees, facades, …).

const TERRAIN_URL = new URL('../data/davos-terrain.bin', import.meta.url);

// Heights of the drawn surfaces above the terrain. The engine's flat world has the roadway at 0 and raised sidewalks
// (0.22 m, city-config.js ISLAND_BOUNDS.sidewalkHeight); here the terrain itself is the sidewalk, and the roads are
// laid on it (city-grid.js: 0.06 m layer + drapeOverlay's 0.05 m lift).
export const ROAD_TOP = 0.11;
export const SIDEWALK_TOP = 0;
// The raised sidewalks along the streets (js/city-grid.js): their top over the ground, and where they lie
export const RAISED_SIDEWALK_TOP = 0.16;
const RAISED_CELL = 16;
const raisedCells = new Map();
/** Registers a raised sidewalk piece (a convex polygon, [{ x, z }]) for sidewalkRise(); `owner`: whoever built it
 *  (js/world-stream.js: a cell, whose pieces go with it, removeRaisedSidewalks) */
export function addRaisedSidewalk(poly, owner = null) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const piece = { poly, minX, maxX, minZ, maxZ, owner };
  for (let ix = Math.floor(minX / RAISED_CELL); ix <= Math.floor(maxX / RAISED_CELL); ix++) {
    for (let iz = Math.floor(minZ / RAISED_CELL); iz <= Math.floor(maxZ / RAISED_CELL); iz++) {
      const k = ix * 65536 + iz;
      if (!raisedCells.has(k)) raisedCells.set(k, []);
      raisedCells.get(k).push(piece);
    }
  }
}
/** How many raised sidewalk pieces are registered, and by how many owners (for the probes and the tests) */
export function raisedSidewalkStats() {
  const pieces = new Set(), owners = new Set();
  for (const list of raisedCells.values()) for (const piece of list) { pieces.add(piece); owners.add(piece.owner); }
  return { pieces: pieces.size, owners: owners.size };
}
/** Forgets the raised sidewalk pieces registered by `owner` (their slabs are gone) */
export function removeRaisedSidewalks(owner) {
  for (const [k, list] of raisedCells) {
    const kept = list.filter((piece) => piece.owner !== owner);
    if (kept.length === list.length) continue;
    if (kept.length) raisedCells.set(k, kept); else raisedCells.delete(k);
  }
}
/** How far the surface at (x, z) stands over the ground on a raised sidewalk (RAISED_SIDEWALK_TOP), else 0 */
export function sidewalkRise(x, z) {
  const list = raisedCells.get(Math.floor(x / RAISED_CELL) * 65536 + Math.floor(z / RAISED_CELL));
  if (!list) return 0;
  for (const { poly, minX, maxX, minZ, maxZ } of list) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    if (inside) return RAISED_SIDEWALK_TOP;
  }
  return 0;
}
const ENGINE_SIDEWALK = 0.22;
// Flat-world objects standing on the engine's sidewalks (their base at 0.15-0.3 m) stand on the terrain instead
const sidewalkDrop = (base) => (base >= 0.15 && base <= 0.3 ? ENGINE_SIDEWALK - SIDEWALK_TOP : 0);

async function loadBinary(url) {
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    const b = await readFile(url);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }
  // (a few retries: simple static servers drop a request now and then, and everything waits for the terrain)
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return await res.arrayBuffer();
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

// (parsed in a function of its own: the downloaded file, awaited in this module's top level, would stay alive with it)
const loadTerrain = async () => parseTerrain(await loadBinary(TERRAIN_URL));
export const TERRAIN = await loadTerrain();

// The rivers and the lake (DAVOS_DATA.water rings, flat [x, z, …])
const pip = (ring, x, z) => { let inside = false; for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) { if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < ((ring[j] - ring[i]) * (z - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) inside = !inside; } return inside; };
const WATER = DAVOS_DATA.water.map((w) => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < w.ring.length; i += 2) { minX = Math.min(minX, w.ring[i]); maxX = Math.max(maxX, w.ring[i]); minZ = Math.min(minZ, w.ring[i + 1]); maxZ = Math.max(maxZ, w.ring[i + 1]); }
  return { ring: w.ring, holes: w.holes || [], minX, maxX, minZ, maxZ };
});
const inWater = (x, z) => WATER.some((w) => x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ && pip(w.ring, x, z) && !w.holes.some((h) => pip(h, x, z)));

// Bridgeheads: the survey lowers the ground under bridges towards the river, bridgeheads included. The data tool lists
// where the surveyed road is higher (DAVOS_DATA.terrainPatches); the ground rises smoothly to meet it there (never
// inside the rivers and the lake).
{
  const { cols, rows, cell, minX, minZ, heights } = TERRAIN;
  for (const { x, z, h, r } of DAVOS_DATA.terrainPatches || []) {
    for (let j = Math.max(0, Math.ceil((z - r - minZ) / cell)); j <= Math.min(rows - 1, Math.floor((z + r - minZ) / cell)); j++) {
      for (let i = Math.max(0, Math.ceil((x - r - minX) / cell)); i <= Math.min(cols - 1, Math.floor((x + r - minX) / cell)); i++) {
        const nx = minX + i * cell, nz = minZ + j * cell, d = Math.hypot(nx - x, nz - z);
        if (d > r || inWater(nx, nz)) continue;
        const t = 1 - d / r, w = t * t * (3 - 2 * t), k = j * cols + i;
        heights[k] = Math.max(heights[k], heights[k] + (h - heights[k]) * w);
      }
    }
  }
}
export const groundHeight = (x, z) => gridHeight(TERRAIN, x, z);
export const groundNormal = (x, z, out) => gridNormal(TERRAIN, x, z, out);

// --- Tunnels --------------------------------------------------------------------------------------------------------------
// The terrain is the surface of the mountain; the road and the track run below it on the grade of tunnel-profile.js.
// (Built on first use: the ground's fills further down this module are in by then.)
export const TUNNEL_ROOF = { road: 5.8, rail: 5.5 };
let roadTunnels = null, rhbTunnels = null, cutRects = null;
export const getRoadTunnels = () => roadTunnels || (roadTunnels = DAVOS_DATA.roads
  .filter((r) => r.tunnel && isDrivableTunnel(r.name))
  .map((r) => tunnelProfile(r, groundHeight, 5)));
export const getLandwasserTunnel = () => getRoadTunnels().find((t) => t.name === 'Landwassertunnel');
// (The tunnels of the line through the map: a way running off it, like the Vereina's, has no mouth to open.)
export const getRhBTunnels = () => {
  if (rhbTunnels) return rhbTunnels;
  const [x0, z0, x1, z1] = DAVOS_DATA.meta.bounds;
  const inside = (x, z) => x > x0 && x < x1 && z > z0 && z < z1;
  return rhbTunnels = DAVOS_DATA.railways
    .filter((r) => r.kind === 'narrow_gauge' && r.tunnel && r.pts.length >= 4 && inside(r.pts[0], r.pts[1]) && inside(r.pts.at(-2), r.pts.at(-1)))
    .map((r) => tunnelProfile(r, groundHeight, 3));
};
const allTunnels = () => [...getRoadTunnels(), ...getRhBTunnels()];
const roofOf = (profile) => getRoadTunnels().includes(profile) ? TUNNEL_ROOF.road : TUNNEL_ROOF.rail;
/** The stretches of a tunnel open to the sky (tunnel-profile.js openRuns) */
export const tunnelOpenRuns = (profile) => profile.openRuns || (profile.openRuns = openRuns(profile, groundHeight, roofOf(profile)));
const tunnelCuts = () => cutRects || (cutRects = allTunnels().flatMap((t) => runRects(t, tunnelOpenRuns(t), t.width / 2 + 0.1)));
export function railTunnelHeight(x, z) {
  for (const tunnel of getRhBTunnels()) { const p = tunnel.project(x, z, 4); if (p) return p.y; }
  return NaN;
}
/** The road tunnel at (x, z), whatever lies above it */
export function roadTunnelAt(x, z, margin = 6) {
  for (const t of getRoadTunnels()) {
    if (x < t.minX - margin || x > t.maxX + margin || z < t.minZ - margin || z > t.maxZ + margin) continue;
    const p = t.project(x, z, margin, true);
    if (p) return p;
  }
  return null;
}
const inTunnel = (x, z, nearY, margin) => {
  for (const t of allTunnels()) {
    if (x < t.minX - margin || x > t.maxX + margin || z < t.minZ - margin || z > t.maxZ + margin) continue;
    const p = t.project(x, z, t.width / 2 + margin, true);
    if (!p) continue;
    const g = groundHeight(x, z);
    // Entering at a mouth, or already down at the tunnel's level (not on the mountain above it)
    if ((g - p.y < 2 && nearY < g + 1.4) || Math.abs(nearY - p.y) < 2.5) return { p, t, g };
  }
  return null;
};
/** The floor of the tunnel someone at about `nearY` is in at (x, z), or NaN */
export function tunnelFloor(x, z, nearY) {
  if (!Number.isFinite(nearY)) return NaN;
  const hit = inTunnel(x, z, nearY, 3);
  return hit ? hit.p.y : NaN;
}
/** The ground under a camera at about `nearY`: the mountain, or the floor when it follows someone through a tunnel */
export function cameraGround(x, z, nearY) {
  const floor = tunnelFloor(x, z, nearY);
  return Number.isFinite(floor) ? floor : groundHeight(x, z);
}
/** Keeps someone between a tunnel's walls: without them, the surface beyond the wall would be the top of the mountain */
export function constrainToTunnel(position, radius = 1.2) {
  const hit = inTunnel(position.x, position.z, position.y, 3);
  if (!hit) return false;
  const limit = hit.t.width / 2 - radius, { p, g } = hit;
  if (p.distance <= limit || g - p.y < 1) return false;
  const k = limit / p.distance;
  position.x = p.x + (position.x - p.x) * k;
  position.z = p.z + (position.z - p.z) * k;
  return true;
}

// --- Bridge decks -------------------------------------------------------------------------------------------------------
const DECK_CELL = 32;
/** Half width of a bridge's deck: the carriageway plus the sidewalks city-grid.js lays along it (width / 2 + 2.8 m), a
 *  path, or a track bed. The deck slab and its parapets are drawn to this edge. */
export const deckHalfWidth = (r) => (r.width ? r.width / 2 + (/^(footway|path|steps|cycleway|pedestrian)$/.test(r.kind) ? 0.6 : 3.2) : 3);
const deckCells = new Map();
let deckSegments = 0;
for (const list of [DAVOS_DATA.roads, DAVOS_DATA.railways]) {
  for (const r of list) {
    if (!r.bridge || r.tunnel || !r.ys) continue;
    const half = deckHalfWidth(r);
    for (let i = 0; i + 1 < r.ys.length; i++) {
      const s = { ax: r.pts[i * 2], az: r.pts[i * 2 + 1], bx: r.pts[i * 2 + 2], bz: r.pts[i * 2 + 3], ya: r.ys[i], yb: r.ys[i + 1], half, road: r };
      const ix0 = Math.floor((Math.min(s.ax, s.bx) - half) / DECK_CELL), ix1 = Math.floor((Math.max(s.ax, s.bx) + half) / DECK_CELL);
      const iz0 = Math.floor((Math.min(s.az, s.bz) - half) / DECK_CELL), iz1 = Math.floor((Math.max(s.az, s.bz) + half) / DECK_CELL);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const k = ix * 65536 + iz;
        if (!deckCells.has(k)) deckCells.set(k, []);
        deckCells.get(k).push(s);
      }
      deckSegments++;
    }
  }
}

// The lids of the road underpasses (tools/underpass.mjs), rectangles one can stand and drive on: the segment runs across
// the road, half way through the underpass, and `half` is half its length along the road
for (const u of DAVOS_DATA.underpasses || []) {
  const mx = u.ax + u.ux * u.len / 2, mz = u.az + u.uz * u.len / 2;
  const s = { ax: mx + u.uz * u.left, az: mz - u.ux * u.left, bx: mx - u.uz * u.right, bz: mz + u.ux * u.right, ya: u.y, yb: u.y, half: u.len / 2, road: null, lid: true };
  const ix0 = Math.floor((Math.min(s.ax, s.bx) - s.half) / DECK_CELL), ix1 = Math.floor((Math.max(s.ax, s.bx) + s.half) / DECK_CELL);
  const iz0 = Math.floor((Math.min(s.az, s.bz) - s.half) / DECK_CELL), iz1 = Math.floor((Math.max(s.az, s.bz) + s.half) / DECK_CELL);
  for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
    const k = ix * 65536 + iz;
    if (!deckCells.has(k)) deckCells.set(k, []);
    deckCells.get(k).push(s);
  }
}

/** Registers a landing platform: a disc of radius `r` round (x, z) whose surface lies at `y`. It counts as a deck for
 *  surfaceHeight(), so the helicopter sets down on it (js/controllers.js: the floor is the surface) — the Rega pad on
 *  the roof of the Spital Davos (js/helipad.js) */
export function addPlatform(x, z, r, y) {
  const s = { ax: x, az: z, bx: x, bz: z, ya: y, yb: y, half: r, road: null };
  for (let ix = Math.floor((x - r) / DECK_CELL); ix <= Math.floor((x + r) / DECK_CELL); ix++) {
    for (let iz = Math.floor((z - r) / DECK_CELL); iz <= Math.floor((z + r) / DECK_CELL); iz++) {
      const k = ix * 65536 + iz;
      if (!deckCells.has(k)) deckCells.set(k, []);
      deckCells.get(k).push(s);
    }
  }
}

/** Height of the bridge deck under (x, z) (nearest bridge centreline within its half width), or NaN */
export function deckHeight(x, z) {
  const list = deckCells.get(Math.floor(x / DECK_CELL) * 65536 + Math.floor(z / DECK_CELL));
  if (!list) return NaN;
  let best = Infinity, h = NaN;
  for (const s of list) {
    const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1e-9;
    const raw = ((x - s.ax) * dx + (z - s.az) * dz) / L2;
    if (s.lid && (raw < 0 || raw > 1)) continue; // (a rectangle, no round ends: its long sides fall away into the cut)
    const t = Math.max(0, Math.min(1, raw));
    const d = Math.hypot(s.ax + t * dx - x, s.az + t * dz - z);
    if (d <= s.half && d < best) { best = d; h = s.ya + t * (s.yb - s.ya); }
  }
  return h;
}

/** The surface at (x, z) for something at about `nearY`: a bridge deck, or the ground under a bridge (never the water) */
export function surfaceHeight(x, z, nearY) {
  const g = groundHeight(x, z);
  // (a tunnel's floor lies beneath the surveyed mountain: only for someone entering a mouth or already down there)
  const floor = tunnelFloor(x, z, nearY);
  if (floor === floor) return floor;
  const d = deckHeight(x, z);
  if (!(d === d)) return g;
  if (nearY === undefined || d - g < 2) return d > g ? d : g;
  return Math.abs(nearY - d) <= Math.abs(nearY - g) || inWater(x, z) ? d : g;
}

// Streets on the ground, kept clear of the bridges' piers (city-grid.js stands one every ~24 m along a span: the
// Lindenhofstrasse's would land in the middle of the Uraniastrasse under it). Only the streets crossing under a bridge
// count: the lanes running beneath a viaduct along it (the Hardstrasse under the Hardbrücke) keep its piers.
const STREET_CELL = 48;
const streetCells = new Map();
for (const r of DAVOS_DATA.roads) {
  if (r.bridge || r.tunnel || !/^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(residential|unclassified|living_street|service)$/.test(r.kind)) continue;
  const half = (r.width || 6) / 2;
  for (let i = 0; i + 2 < r.pts.length; i += 2) {
    const s = { ax: r.pts[i], az: r.pts[i + 1], bx: r.pts[i + 2], bz: r.pts[i + 3], half };
    s.len = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1e-9;
    for (let ix = Math.floor((Math.min(s.ax, s.bx) - half) / STREET_CELL); ix <= Math.floor((Math.max(s.ax, s.bx) + half) / STREET_CELL); ix++) {
      for (let iz = Math.floor((Math.min(s.az, s.bz) - half) / STREET_CELL); iz <= Math.floor((Math.max(s.az, s.bz) + half) / STREET_CELL); iz++) {
        const k = ix * 65536 + iz;
        if (!streetCells.has(k)) streetCells.set(k, []);
        streetCells.get(k).push(s);
      }
    }
  }
}

/** Whether a bridge pier at (x, z), across the deck (direction ux, uz) of half width `half`, keeps off the streets
 *  crossing under it (at more than 30° to the deck) */
export function pierClear(x, z, ux, uz, half) {
  const nx = -uz, nz = ux, across = half * 0.6 + 0.5;
  for (let k = -4; k <= 4; k++) {
    const px = x + nx * across * k / 4, pz = z + nz * across * k / 4;
    for (const s of streetCells.get(Math.floor(px / STREET_CELL) * 65536 + Math.floor(pz / STREET_CELL)) || []) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      if (Math.abs(ux * dz - uz * dx) < 0.5 * s.len) continue;
      const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / (s.len * s.len)));
      if (Math.hypot(s.ax + t * dx - px, s.az + t * dz - pz) < s.half + 1.1) return false;
    }
  }
  return true;
}

// --- Tunnel approaches: the ramps down to the road tunnels' mouths are filled to the street ------------------------------
// Most road tunnels are not drawn (js/tunnels.js has those of the Landwasser road) and their mouths are filled by the data tool, but the open
// ramps leading down to them stay in the bare-earth survey as trenches between retaining walls, which the 4 m grid
// turns into lumpy slopes (the Ulmbergtunnel's ramps on the Tunnelstrasse, the Letten tunnel's on the
// Wasserwerkstrasse). The trench along the streets within APPROACH m of a road tunnel's mouth, from the mouth on, is
// filled from the ground around it (terrain-grid.js fillCuts), so the street stays level and ends at the hill. Only the
// drivable streets lead there: real cuttings (the Rämistrasse under the Hohe Promenade, the Seebahn's trench) stay.
{
  const APPROACH = 150;
  const DRIVABLE = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(residential|unclassified|living_street)$/;
  const streets = DAVOS_DATA.roads.filter((r) => DRIVABLE.test(r.kind));
  const key = (x, z) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
  const at = new Map(); // point -> [street, point index] of the open streets through it
  for (const r of streets) {
    if (r.tunnel || r.bridge) continue;
    for (let i = 0; i < r.pts.length; i += 2) {
      const k = key(r.pts[i], r.pts[i + 1]);
      if (!at.has(k)) at.set(k, []);
      at.get(k).push([r, i / 2]);
    }
  }
  // Mouths: tunnel ends where an open street continues. Walk the open streets from them, up to APPROACH m away.
  const seeds = [], queue = [], left = new Map(), reached = new Map();
  for (const r of streets) {
    if (!r.tunnel) continue;
    for (const i of [0, r.pts.length - 2]) {
      const k = key(r.pts[i], r.pts[i + 1]);
      if (at.has(k)) { seeds.push({ x: r.pts[i], z: r.pts[i + 1], r: 12 }); queue.push([k, APPROACH]); }
    }
  }
  while (queue.length) {
    const [k, budget] = queue.pop();
    for (const [r, i] of at.get(k)) {
      for (const step of [-1, 1]) {
        let b = budget;
        for (let j = i; b > 0 && j + step >= 0 && j + step < r.pts.length / 2; j += step) {
          if (!reached.has(r)) reached.set(r, new Set());
          reached.get(r).add(Math.min(j, j + step));
          b -= Math.hypot(r.pts[(j + step) * 2] - r.pts[j * 2], r.pts[(j + step) * 2 + 1] - r.pts[j * 2 + 1]);
          const nk = key(r.pts[(j + step) * 2], r.pts[(j + step) * 2 + 1]);
          if (b > 0 && (left.get(nk) ?? 0) < b) { left.set(nk, b); queue.push([nk, b]); }
        }
      }
    }
  }
  const corridors = [];
  for (const [r, segments] of reached) for (const s of segments) corridors.push({ pts: r.pts.slice(s * 2, s * 2 + 4), half: r.width / 2 + 3 });
  fillCuts(TERRAIN, corridors, { seeds, skip: (x, z) => inWater(x, z) || deckHeight(x, z) === deckHeight(x, z) });
}

// --- Water level: the river and lake surfaces are the lowest ground within ~12 m (banks and quays rise above) --------
// (built when first asked for, and let go after the city is built, releaseWaterLevel: 8 MB only the build reads)
let WATER_LEVEL = null;
const waterLevel = () => WATER_LEVEL || (WATER_LEVEL = (() => {
  const { cols, rows, heights } = TERRAIN, R = 3;
  const tmp = new Float32Array(heights.length), out = new Float32Array(heights.length);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let m = Infinity;
    for (let d = Math.max(0, i - R); d <= Math.min(cols - 1, i + R); d++) m = Math.min(m, heights[j * cols + d]);
    tmp[j * cols + i] = m;
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let m = Infinity;
    for (let d = Math.max(0, j - R); d <= Math.min(rows - 1, j + R); d++) m = Math.min(m, tmp[d * cols + i]);
    out[j * cols + i] = m;
  }
  return { ...TERRAIN, heights: out };
})());
export const waterSurfaceHeight = (x, z) => gridHeight(waterLevel(), x, z);
export const releaseWaterLevel = () => { WATER_LEVEL = null; };

/**
 * Per-node depths by which the drawn terrain sinks under the ground layers laid on it: the survey has kerb- and
 * rail-sized bumps that a road surface following it vertex by vertex every few metres would let poke through.
 * `strips`: [{ a: {x, z}, b: {x, z}, half }] (nodes within `half` of the centreline sink by `depth`).
 */
export function carveDepths(strips, depth = 0.3) {
  const { cols, rows, cell, minX, minZ } = TERRAIN;
  const depths = new Float32Array(cols * rows);
  for (const { a, b, half } of strips) {
    if (half <= 0) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x) - half - minX) / cell)), i1 = Math.min(cols - 1, Math.floor((Math.max(a.x, b.x) + half - minX) / cell));
    const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z) - half - minZ) / cell)), j1 = Math.min(rows - 1, Math.floor((Math.max(a.z, b.z) + half - minZ) / cell));
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = minX + i * cell, z = minZ + j * cell;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      if (Math.hypot(a.x + t * dx - x, a.z + t * dz - z) <= half) depths[j * cols + i] = Math.max(depths[j * cols + i], depth);
    }
  }
  return depths;
}

// The roads' carving as it changes while playing (js/world-stream.js builds and removes the streets cell by cell): per
// node, how many strips sink it (ROAD_CARVE m while any does); the chunks touched are rebuilt (refreshTerrainChunks)
const ROAD_CARVE_MM = 300;
let roadCarve = null; // Uint8Array(cols * rows), made on first use
const dirtyChunks = new Set(); // "i0/j0" keys of the chunks whose nodes' carving changed since they were last built
const CHUNK = QUALITY.terrainChunk || 64; // nodes a chunk side (buildTerrainMeshes; js/quality.js: 128 on a phone)
/**
 * Sinks the drawn terrain under the given road strips ([{ a: {x, z}, b: {x, z}, half }]; `sign` 1), or lets it come up
 * again where they are removed (`sign` -1, the very same strips). The terrain chunks touched are rebuilt as
 * streamTerrain() gets to them (or refreshTerrainChunks({ all: true }) at once).
 */
export function carveRoads(strips, sign = 1) {
  const { cols, rows, cell, minX, minZ } = TERRAIN;
  if (!roadCarve) roadCarve = new Uint8Array(cols * rows);
  let changed = 0;
  for (const { a, b, half } of strips) {
    if (half <= 0) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x) - half - minX) / cell)), i1 = Math.min(cols - 1, Math.floor((Math.max(a.x, b.x) + half - minX) / cell));
    const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z) - half - minZ) / cell)), j1 = Math.min(rows - 1, Math.floor((Math.max(a.z, b.z) + half - minZ) / cell));
    if (i0 > i1 || j0 > j1) continue;
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
    let touched = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = minX + i * cell, z = minZ + j * cell;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      if (Math.hypot(a.x + t * dx - x, a.z + t * dz - z) > half) continue;
      const k = j * cols + i, was = roadCarve[k];
      roadCarve[k] = sign > 0 ? Math.min(255, was + 1) : Math.max(0, was - 1);
      if ((was > 0) !== (roadCarve[k] > 0)) { touched = true; changed++; }
    }
    if (!touched) continue;
    // (a node on a chunk's border belongs to the chunk before it too)
    for (let cj = Math.floor((j0 - 1) / CHUNK); cj <= Math.floor(j1 / CHUNK); cj++) for (let ci = Math.floor((i0 - 1) / CHUNK); ci <= Math.floor(i1 / CHUNK); ci++) {
      if (ci >= 0 && cj >= 0 && ci * CHUNK < cols - 1 && cj * CHUNK < rows - 1) dirtyChunks.add(`${ci * CHUNK}/${cj * CHUNK}`);
    }
  }
  return changed;
}
/** The carving at node k (mm): the ground layers' (buildTerrainMeshes `carve`, `depths`) or the roads' */
const cutAt = (k) => Math.max(baseCut ? baseCut[k] : 0, roadCarve && roadCarve[k] ? ROAD_CARVE_MM : 0);
let baseCut = null;

// --- Terrain mesh (same triangulation as gridHeight), in square chunks for culling ---------------------------------------
const LOD_STEPS = [1, 2, 4, 8];
const LOD_TOLERANCE = 1; // px

/** Mesh.onBeforeRender of a block drawn in levels of detail (userData.lodLevels, terrain-grid.js gridLevels): picks the
 *  level for this view's camera (the shadow cascades' keep the view's). */
export function drawLevel(renderer, scene, camera, geometry) {
  if (camera.isOrthographicCamera) return;
  // (the levels of the geometry being drawn: right after a chunk swaps between coarse and full, the renderer may still
  // draw the other one, whose index ranges differ: the mesh's levels would point past its index buffer)
  const levels = geometry.userData.lodLevels || this.userData.lodLevels;
  if (!levels) return;
  const l = levels[pickLevel(levels, geometry.boundingBox, camera, renderer.domElement?.clientHeight || 800, this.userData.lodTolerance ?? LOD_TOLERANCE)];
  geometry.drawRange.start = l.start; geometry.drawRange.count = l.count;
}

// `carve(x, z)`: metres to sink the drawn node by; `depths`: per-node sinking (carveDepths), both optional.
// The chunks stream (streamTerrain): within TERRAIN_FULL of the camera a chunk holds every node and all four levels; farther
// off only the coarse levels (STEPS_FAR; every node along its border still, so neighbours meet without cracks), a tenth
// of the vertices. The full geometry is rebuilt from the grid when the camera comes near again (the carving is kept per
// node, in millimetres) and disposed (GPU memory) when it leaves: the terrain's 572 chunks in full took ~115 MB of GPU
// memory once all had been seen.
const TERRAIN_FULL = QUALITY.mobile ? [900, 1200] : [1500, 2000]; // full within, coarse beyond (hysteresis)
const STEPS_FAR = QUALITY.mobile ? [4, 8] : [2, 4, 8];
const scratchBuffers = {};
const scratch = (name, Type, n) => {
  const b = scratchBuffers[name];
  return b && b.length >= n ? b.subarray(0, n) : (scratchBuffers[name] = new Type(n));
};
const terrainChunks = [];
const chunkByKey = new Map(); // "i0/j0" -> its record in terrainChunks
const _n = { x: 0, y: 1, z: 0 };
// One chunk's geometry: every node (`steps` null) or only those the given coarse levels use, renumbered
function chunkGeometry(i0, j0, nc, nr, steps = null) {
  const { cols, rows, cell, minX, minZ, heights } = TERRAIN;
  const n = _n;
  // (normals as normalized bytes: a third of the memory, shading only; a coarse chunk's full grid only passes through,
  // in scratch buffers kept between chunks)
  const positions = steps ? scratch('positions', Float32Array, nc * nr * 3) : new Float32Array(nc * nr * 3);
  const normals = steps ? scratch('normals', Int8Array, nc * nr * 3) : new Int8Array(nc * nr * 3);
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const i = i0 + c, j = j0 + r, v = (r * nc + c) * 3;
    positions[v] = minX + i * cell; positions[v + 2] = minZ + j * cell;
    positions[v + 1] = heights[j * cols + i] - cutAt(j * cols + i) / 1000;
    // Vertex normal: the average slope around the node (shading only; the surface itself stays planar per triangle)
    const hl = heights[j * cols + Math.max(0, i - 1)], hr = heights[j * cols + Math.min(cols - 1, i + 1)];
    const hu = heights[Math.max(0, j - 1) * cols + i], hd = heights[Math.min(rows - 1, j + 1) * cols + i];
    n.x = (hl - hr) / (2 * cell); n.z = (hu - hd) / (2 * cell); n.y = 1;
    const len = Math.hypot(n.x, n.y, n.z);
    normals[v] = Math.round(n.x / len * 127); normals[v + 1] = Math.round(n.y / len * 127); normals[v + 2] = Math.round(n.z / len * 127);
  }
  // Levels of detail (terrain-grid.js gridLevels): every node near by, every 2nd, 4th or 8th further off as long as
  // the surface stays within a pixel of the full grid (the carved road and river beds count, so they stay in detail
  // wherever they show); the chunk's border keeps every node, so neighbours at any levels meet without cracks.
  const ys = scratch('ys', Float32Array, nc * nr);
  for (let v = 0; v < ys.length; v++) ys[v] = positions[v * 3 + 1];
  let { index, levels } = gridLevels(nc - 1, nr - 1, ys, LOD_STEPS, { view: !!steps });
  const g = new THREE.BufferGeometry();
  const box = new THREE.Box3().setFromArray(positions), sphere = box.getBoundingSphere(new THREE.Sphere());
  let pos = positions, nor = normals;
  if (!steps) {
    // A tunnel's mouth in this chunk: the surface is cut open there, in full detail at every distance (only the coarse
    // geometry, beyond TERRAIN_FULL, stays closed)
    const x0 = minX + i0 * cell, z0 = minZ + j0 * cell, x1 = x0 + (nc - 1) * cell, z1 = z0 + (nr - 1) * cell;
    const cuts = tunnelCuts().filter((r) => Math.max(r.ax, r.bx) + r.half >= x0 && Math.min(r.ax, r.bx) - r.half <= x1 && Math.max(r.az, r.bz) + r.half >= z0 && Math.min(r.az, r.bz) - r.half <= z1);
    if (cuts.length) {
      const cut = cutTriangles(positions, normals, index, levels[0].start, levels[0].count, cuts);
      pos = cut.positions; nor = cut.normals; index = cut.index;
      levels = [{ ...levels[0], start: 0, count: index.length }];
    }
  }
  if (steps) {
    // The coarse levels' triangles only, their nodes renumbered
    const keep = levels.filter((l) => steps.includes(l.step));
    // (typed buffers: the ~570 chunks' coarse geometry is built at the start)
    const map = scratch('map', Int32Array, nc * nr).fill(-1);
    let total = 0;
    for (const l of keep) total += l.count;
    const out = scratch('out', Uint32Array, total), used = scratch('used', Uint32Array, nc * nr);
    let no = 0, nu = 0;
    const kept = keep.map((l) => {
      const start = no;
      for (let t = l.start; t < l.start + l.count; t++) {
        const a = index[t];
        if (map[a] < 0) { map[a] = nu; used[nu++] = a; }
        out[no++] = map[a];
      }
      return { ...l, start, count: no - start };
    });
    pos = new Float32Array(nu * 3); nor = new Int8Array(nu * 3);
    for (let k = 0; k < nu; k++) {
      const a = used[k] * 3;
      pos[k * 3] = positions[a]; pos[k * 3 + 1] = positions[a + 1]; pos[k * 3 + 2] = positions[a + 2];
      nor[k * 3] = normals[a]; nor[k * 3 + 1] = normals[a + 1]; nor[k * 3 + 2] = normals[a + 2];
    }
    index = nu > 65535 ? out.slice(0, no) : Uint16Array.from(out.subarray(0, no));
    levels = kept;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.setDrawRange(levels[0].start, levels[0].count);
  g.boundingBox = box; g.boundingSphere = sphere; // (the full chunk's, for either)
  g.userData.lodLevels = levels;
  // (the flat-draws profile: the corners written out in index order, a level's range draws the same triangles)
  return QUALITY.flatDraws ? flatGeometry(g) : g;
}
export function buildTerrainMeshes(material, { chunk = CHUNK, carve = null, depths = null } = {}) {
  const { cols, rows, cell, minX, minZ } = TERRAIN;
  baseCut = new Uint16Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, d = Math.max(carve ? carve(minX + i * cell, minZ + j * cell) : 0, depths ? depths[k] : 0);
    if (d > 0) baseCut[k] = Math.min(65535, Math.round(d * 1000));
  }
  const meshes = [];
  for (let j0 = 0; j0 < rows - 1; j0 += chunk) for (let i0 = 0; i0 < cols - 1; i0 += chunk) {
    const nc = Math.min(chunk, cols - 1 - i0) + 1, nr = Math.min(chunk, rows - 1 - j0) + 1;
    const coarse = chunkGeometry(i0, j0, nc, nr, STEPS_FAR);
    const mesh = new THREE.Mesh(coarse, material);
    mesh.userData.lodLevels = coarse.userData.lodLevels;
    mesh.onBeforeRender = drawLevel;
    mesh.receiveShadow = true;
    mesh.name = `terrain ${i0}/${j0}`;
    mesh.userData.chunk = { i0, j0, n: chunk }; // its orthophoto(s) (swissimage.js: tiles of 64 nodes)
    const c = coarse.boundingSphere.center;
    const record = { mesh, coarse, full: null, x: c.x, z: c.z, build: () => chunkGeometry(i0, j0, nc, nr), rebuildCoarse: () => chunkGeometry(i0, j0, nc, nr, STEPS_FAR) };
    terrainChunks.push(record);
    chunkByKey.set(`${i0}/${j0}`, record);
    meshes.push(mesh);
  }
  dirtyChunks.clear(); // (whatever was carved before the meshes existed is in them)
  return meshes;
}

/**
 * Rebuilds the terrain chunks whose carving changed (carveRoads), nearest to `position` first, until `until`
 * (performance.now() ms; `all` every one at once). Returns how many were rebuilt.
 */
export function refreshTerrainChunks({ all = false, until = Infinity, position = null } = {}) {
  if (!dirtyChunks.size || !terrainChunks.length) return 0;
  let keys = [...dirtyChunks];
  if (position && !all) {
    const dist = (k) => { const t = chunkByKey.get(k); return t ? Math.hypot(t.x - position.x, t.z - position.z) : Infinity; };
    keys.sort((p, q) => dist(p) - dist(q));
  }
  let n = 0;
  for (const key of keys) {
    if (!all && performance.now() >= until) break;
    dirtyChunks.delete(key);
    const t = chunkByKey.get(key);
    if (!t) continue;
    const wasFull = !!t.full;
    t.coarse.dispose(); t.coarse = t.rebuildCoarse();
    if (wasFull) { t.full.dispose(); t.full = t.build(); }
    setChunkGeometry(t, t.full || t.coarse);
    n++;
  }
  return n;
}
/** How many terrain chunks still wait to be rebuilt after a change of carving (for the tests and the probes) */
export const dirtyTerrainChunks = () => dirtyChunks.size;

const setChunkGeometry = (t, g) => { t.mesh.geometry = g; t.mesh.userData.lodLevels = g.userData.lodLevels; };
let lastStream = -Infinity, pending = [];
/**
 * Swaps the terrain chunks between their full and coarse geometry by the distance from `position` (call every frame:
 * it looks every 0.3 s, and builds the chunks due, nearest first, within ~4 ms a frame); `all` brings every chunk in
 * range up to date at once (before the first frame).
 */
export function streamTerrain(position, { all = false } = {}) {
  const now = performance.now();
  if (all || now - lastStream > 300) {
    lastStream = now;
    const [near, far] = TERRAIN_FULL;
    pending = [];
    for (const t of terrainChunks) {
      const d = Math.hypot(t.x - position.x, t.z - position.z);
      if (t.full && d > far) { setChunkGeometry(t, t.coarse); t.full.dispose(); t.full = null; } // (frees its GPU buffers)
      else if (!t.full && d < near) pending.push({ t, d });
    }
    pending.sort((a, b) => b.d - a.d); // (nearest last: popped first)
  }
  const until = all ? Infinity : now + 4;
  while (pending.length && performance.now() < until) {
    const { t } = pending.pop();
    t.full = t.build();
    setChunkGeometry(t, t.full);
  }
  // (and the chunks whose carving changed, js/world-stream.js, in what is left of the budget)
  if (dirtyChunks.size) refreshTerrainChunks({ all, until, position });
}
/** How many terrain chunks hold their full geometry (for the tests and the HUD) */
export const fullTerrainChunks = () => terrainChunks.filter((t) => t.full).length;

// --- Laying flat engine geometry onto the surface -------------------------------------------------------------------------
function interpolateAttribute(attr, weights, sources) {
  const size = attr.itemSize, src = attr.array, n = sources.length;
  const out = new (attr.normalized ? src.constructor : Float32Array)(n * size);
  for (let v = 0; v < n; v++) {
    const base = sources[v] * 3;
    for (let c = 0; c < size; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += weights[v * 3 + k] * src[(base + k) * size + c];
      out[v * size + c] = attr.normalized ? Math.round(s) : s;
    }
  }
  return new THREE.BufferAttribute(out, size, attr.normalized);
}

/**
 * A flat ground layer (built at a small y offset over a flat world) laid on the terrain: subdivided until no edge is
 * longer than `maxEdge` (the city's streets are smooth at that scale), every vertex lifted onto the surface plus `lift`
 * (so that the chords between vertices stay above the ground), with the terrain's normals.
 * `deck`: the layer belongs to a bridge and follows its deck. `surface`: 'ground' (default) or 'water'.
 */
export function drapeOverlay(geometry, { deck = false, surface = 'ground', maxEdge = 8, lift = 0.05 } = {}) {
  // (the mobile profile, js/quality.js, splits the finer overlays less: up to twice the edge, never past the terrain's
  // own 8 m cells, under which the chords keep to the ground)
  if (QUALITY.drapeScale > 1 && maxEdge < 8) maxEdge = Math.min(8, maxEdge * QUALITY.drapeScale);
  const heightAt = deck ? (x, z) => surfaceHeight(x, z) : surface === 'water' ? waterSurfaceHeight : groundHeight;
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const { positions, weights, sources } = subdivideTriangles(g.attributes.position.array, maxEdge);
  const normals = new Float32Array(positions.length);
  const n = { x: 0, y: 1, z: 0 };
  for (let v = 0; v < positions.length; v += 3) {
    const x = positions[v], z = positions[v + 2];
    positions[v + 1] += heightAt(x, z) + lift;
    groundNormal(x, z, n);
    normals[v] = n.x; normals[v + 1] = n.y; normals[v + 2] = n.z;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  for (const [name, attr] of Object.entries(g.attributes)) {
    if (name !== 'position' && name !== 'normal') out.setAttribute(name, interpolateAttribute(attr, weights, sources));
  }
  out.computeBoundingSphere(); out.computeBoundingBox();
  if (g !== geometry) g.dispose();
  return out;
}

/** Lifts every vertex by the surface height under it (small solids: curbs, walls; `deck` follows bridge decks) */
export function displaceGeometry(geometry, { deck = false } = {}) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, p.getY(i) + (deck ? surfaceHeight(x, z) : groundHeight(x, z)));
  }
  p.needsUpdate = true;
  geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  return geometry;
}

const RIGID_RADIUS = 20;
const _box = new THREE.Box3(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const isIdentity = (m) => m.equals(_m.identity());

/**
 * Lays an engine-built static subtree (built for a flat world) onto the terrain:
 *  - small objects (< 20 m) and groups of them move rigidly by the surface height under their centre, staying upright;
 *  - instanced meshes move each instance the same way;
 *  - both come down from the engine's raised sidewalks onto the terrain (sidewalkDrop);
 *  - large flat meshes (ground decals: road paint, plazas) are draped; other large merged meshes are displaced per vertex.
 * Subtrees whose userData.terrain is 'absolute' (already in world heights) are left alone.
 */
export function placeOnTerrain(root, stats = { rigid: 0, instances: 0, draped: 0, displaced: 0 }) {
  root.updateMatrixWorld(true);
  const visit = (obj) => {
    if (obj.userData.terrain === 'absolute' || obj.userData.terrainPlaced) return;
    obj.userData.terrainPlaced = true;
    if (obj.isInstancedMesh) {
      if (obj.instanceMatrix.usage === THREE.DynamicDrawUsage) return; // driven every frame by its owner
      _inv.copy(obj.matrixWorld).invert();
      const lifted = new THREE.Vector3();
      for (let i = 0; i < obj.count; i++) {
        obj.getMatrixAt(i, _m);
        _v.setFromMatrixPosition(_m).applyMatrix4(obj.matrixWorld);
        // The world-space lift expressed in the mesh's own frame
        lifted.copy(_v).setY(_v.y + surfaceHeight(_v.x, _v.z) - sidewalkDrop(_v.y)).applyMatrix4(_inv);
        _m.elements[12] = lifted.x; _m.elements[13] = lifted.y; _m.elements[14] = lifted.z;
        obj.setMatrixAt(i, _m);
      }
      obj.instanceMatrix.needsUpdate = true;
      obj.computeBoundingSphere?.(); obj.computeBoundingBox?.();
      stats.instances += obj.count;
      return;
    }
    {
      _box.setFromObject(obj, true);
      const size = _box.isEmpty() ? null : _box.getSize(new THREE.Vector3());
      const radius = size ? Math.hypot(size.x, size.z) / 2 : 0;
      if (!size || radius <= RIGID_RADIUS) {
        const c = size ? _box.getCenter(new THREE.Vector3()) : _v.setFromMatrixPosition(obj.matrixWorld);
        const dy = surfaceHeight(c.x, c.z) - (size ? sidewalkDrop(_box.min.y) : 0);
        // Rigid lift in the parent's frame (parents here are plain, unrotated groups)
        obj.position.y += dy;
        obj.updateMatrixWorld(true);
        stats.rigid++;
        return;
      }
      if ((obj.isMesh || obj.isLine || obj.isPoints) && obj.geometry?.attributes?.position) {
        if (!isIdentity(obj.matrixWorld)) {
          obj.geometry.applyMatrix4(obj.matrixWorld);
          obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.set(1, 1, 1);
          if (obj.parent) { obj.applyMatrix4(_inv.copy(obj.parent.matrixWorld).invert()); }
          obj.updateMatrixWorld(true);
        }
        const flat = size.y < 0.6 && obj.isMesh;
        if (flat) { const g = drapeOverlay(obj.geometry, { deck: !!obj.userData.deck, maxEdge: 16 }); if (g !== obj.geometry) { obj.geometry.dispose(); obj.geometry = g; } stats.draped++; }
        else { displaceGeometry(obj.geometry, { deck: true }); stats.displaced++; }
      }
      for (const child of [...obj.children]) visit(child);
    }
  };
  visit(root);
  return stats;
}

export const TERRAIN_INFO = { cols: TERRAIN.cols, rows: TERRAIN.rows, cell: TERRAIN.cell, deckSegments };

/** Shifts flat-world colliders ({ minX, maxX, minZ, maxZ, minY?, maxY }) onto the terrain: from the lowest ground under
 * the footprint up to the height above the highest. `baseY` keeps the shift (heights relative to the ground: maxY - baseY). */
export function liftColliders(colliders) {
  for (const c of colliders) {
    if (c.baseY !== undefined) continue;
    let lo = Infinity, hi = -Infinity;
    for (const x of [c.minX, (c.minX + c.maxX) / 2, c.maxX]) for (const z of [c.minZ, (c.minZ + c.maxZ) / 2, c.maxZ]) {
      const h = surfaceHeight(x, z);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    c.baseY = lo;
    c.minY = (c.minY ?? 0) + lo;
    c.maxY = (c.maxY ?? 0) + hi;
  }
  return colliders;
}
