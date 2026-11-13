// tools/build-davos-terrain.mjs — writes data/davos-terrain.bin from swisstopo swissALTI3D (2 m cloud-optimised GeoTIFFs)
// The digital terrain model (bare earth: no buildings, no bridges) is resampled onto the world frame's terrain grid
// (js/davos-frame.js: FRAME.terrainCell metres) and stored as heights above FRAME.H0 in decimetres (int16: ±3.2 km around the lake, enough for the Alps).
//
// The bare-earth model keeps the open cuts that lead underground (the Bahnhofquai underpass, the ramps to the HB's
// underground stations and car parks, ShopVille's stairs): narrow trenches between retaining walls that a 4 m grid
// turns into lumps under the streets drawn over them. The engine has no underground, so these pits are filled from the
// ground around them (OSM ways in tunnels or below ground, tools/data/cache/osm_davos.json).
//
// File layout (little endian): 'ZTR1', uint16 cols, uint16 rows, float32 cell (m), float32 minX, float32 minZ,
// float32 scale (m per unit), then int16 heights row-major, row j at z = minZ + j * cell, column i at x = minX + i * cell.
// usage: node tools/build-davos-terrain.mjs [out.bin]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromArrayBuffer } from 'geotiff';
import { FRAME, WORLD_BOUNDS, worldToLv95, lonLatToWorld } from '../js/davos-frame.js';
import { polygons, bbox as ringBox } from './osm-geometry.mjs';
import { lv95ToWgs84 } from '../js/swiss-projection.js';
import { buildLine, routePoint } from '../js/rhb-route.js';
import { findUnderpasses, approachFrom } from './underpass.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(DIR, '..', 'data', 'davos-terrain.bin');
const CACHE = path.join(DIR, 'data', 'cache', 'swissalti3d');
const STAC = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d/items';
const log = (...a) => console.log('[davos-terrain]', ...a);
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// --- 1 km tiles covering the frame (latest acquisition of each), 2 m resolution ----------------------------------------
const [minE, minN, maxE, maxN] = FRAME.lv95;
// Bilinear sampling at an exact kilometre boundary needs the previous tile's last pixel.
const corners = [[minE - 2, minN - 2], [maxE + 2, minN - 2], [minE - 2, maxN + 2], [maxE + 2, maxN + 2]].map(([e, n]) => lv95ToWgs84(e, n));
const bbox = [
  Math.min(...corners.map((c) => c.lon)), Math.min(...corners.map((c) => c.lat)),
  Math.max(...corners.map((c) => c.lon)), Math.max(...corners.map((c) => c.lat))
].join(',');
const latest = new Map();
for (let url = `${STAC}?bbox=${bbox}&limit=100`; url;) {
  const page = await (await fetch(url)).json();
  for (const f of page.features) {
    const m = /_(\d{4})_(\d{4})-(\d{4})$/.exec(f.id);
    if (!m) continue;
    const [, year, e, n] = m;
    if (+e * 1000 + 1000 < minE || +e * 1000 > maxE || +n * 1000 + 1000 < minN || +n * 1000 > maxN) continue;
    const asset = Object.entries(f.assets).find(([k]) => /_2_2056_5728\.tif$/.test(k));
    const key = `${e}-${n}`;
    if (asset && (!latest.has(key) || latest.get(key).year < +year)) latest.set(key, { year: +year, e: +e, n: +n, href: asset[1].href });
  }
  url = page.links?.find((l) => l.rel === 'next')?.href;
}
log(`${latest.size} tiles:`, [...latest].map(([k, t]) => `${k}@${t.year}`).join(' '));

// --- Decode every tile into one 2 m mosaic (pixel centres at odd metres) -----------------------------------------------
const tiles = new Map();
for (const [key, t] of latest) {
  const file = path.join(CACHE, path.basename(new URL(t.href).pathname));
  if (!fs.existsSync(file)) {
    const res = await fetch(t.href);
    if (!res.ok) throw new Error(`${t.href}: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.readFileSync(file);
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const image = await tiff.getImage();
  const [x0, y0, x1, y1] = image.getBoundingBox();
  const [raster] = await image.readRasters();
  tiles.set(key, { x0, y0, x1, y1, w: image.getWidth(), h: image.getHeight(), raster, nodata: image.getGDALNoData() });
}
function sample2m(e, n) {
  const t = tiles.get(`${Math.floor(e / 1000)}-${Math.floor(n / 1000)}`);
  if (!t) return NaN;
  const res = (t.x1 - t.x0) / t.w;
  const i = Math.min(t.w - 1, Math.max(0, Math.floor((e - t.x0) / res)));
  const j = Math.min(t.h - 1, Math.max(0, Math.floor((t.y1 - n) / res)));
  const v = t.raster[j * t.w + i];
  return v === t.nodata || v < -1000 ? NaN : v;
}
// Bilinear between the four nearest 2 m pixel centres
function heightAt(e, n) {
  const fe = e - 1, fn = n - 1;
  const e0 = Math.floor(fe / 2) * 2 + 1, n0 = Math.floor(fn / 2) * 2 + 1;
  const te = (e - e0) / 2, tn = (n - n0) / 2;
  const h00 = sample2m(e0, n0), h10 = sample2m(e0 + 2, n0), h01 = sample2m(e0, n0 + 2), h11 = sample2m(e0 + 2, n0 + 2);
  return (h00 * (1 - te) + h10 * te) * (1 - tn) + (h01 * (1 - te) + h11 * te) * tn;
}

// --- Resample onto the world grid ----------------------------------------------------------------------------------------
const cell = FRAME.terrainCell, scale = 0.1;
const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const cols = Math.round((maxX - minX) / cell) + 1, rows = Math.round((maxZ - minZ) / cell) + 1;
const H = new Float64Array(cols * rows);
let lo = Infinity, hi = -Infinity, missing = 0;
for (let j = 0; j < rows; j++) {
  for (let i = 0; i < cols; i++) {
    const { E, N } = worldToLv95(minX + i * cell, minZ + j * cell);
    let h = heightAt(E, N);
    if (!Number.isFinite(h)) { missing++; h = FRAME.H0; }
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    H[j * cols + i] = h;
  }
}
// (TERRAIN_STAGES=dir: the grid after each step as a terrain file, for tools/check-road-smoothness.mjs to tell which
// step made a bump)
const writeGrid = (file, src) => {
  const heights = new Int16Array(cols * rows);
  for (let k = 0; k < heights.length; k++) heights[k] = Math.round((src[k] - FRAME.H0) / scale);
  const header = Buffer.alloc(24);
  header.write('ZTR1', 0, 'ascii');
  header.writeUInt16LE(cols, 4); header.writeUInt16LE(rows, 6);
  header.writeFloatLE(cell, 8); header.writeFloatLE(minX, 12); header.writeFloatLE(minZ, 16); header.writeFloatLE(scale, 20);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.from(heights.buffer)]));
};
const stage = (name) => { if (process.env.TERRAIN_STAGES) writeGrid(path.join(process.env.TERRAIN_STAGES, `${name}.bin`), H); };
stage('0-model');

// --- Fill the open cuts to the underground ----------------------------------------------------------------------------------
// Candidates: nodes within a few metres of a way in a tunnel or below ground, outside the rivers and the lake (the
// S-Bahn runs under the Sihl and the Limmat). A candidate is a pit when it lies 0.8 m or more under the median of the
// ground 12-24 m around it (so the hills over real tunnels stay); pits are filled by harmonic interpolation from the
// ground around them.
const osm = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'cache', 'osm_davos.json'), 'utf8'));
const water = [];
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type === 'node' || !(t.natural === 'water' || /^(riverbank|dock)$/.test(t.waterway || ''))) continue;
  for (const p of polygons(e)) water.push({ ...p, box: ringBox(p.ring) });
}
const pip = (ring, x, z) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if ((ring[i][1] > z) !== (ring[j][1] > z) && x < ((ring[j][0] - ring[i][0]) * (z - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) inside = !inside;
  }
  return inside;
};
const inWater = (x, z) => water.some((w) => x >= w.box.x0 && x <= w.box.x1 && z >= w.box.z0 && z <= w.box.z1 &&
  pip(w.ring, x, z) && !w.holes.some((h) => pip(h, x, z)));
const candidate = new Uint8Array(cols * rows);
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type !== 'way' || !e.geometry || !(t.highway || t.railway)) continue;
  const below = (t.tunnel && t.tunnel !== 'no') || t.covered === 'yes' || t.location === 'underground' || parseFloat(t.layer) < 0;
  if (!below || (t.bridge && t.bridge !== 'no')) continue;
  const half = (parseFloat(t.width) || (t.railway ? 6 : t.highway === 'steps' || t.highway === 'footway' ? 3 : 8)) / 2 + 3;
  const pts = e.geometry.map((p) => lonLatToWorld(p.lon, p.lat));
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
    const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x) - half - minX) / cell)), i1 = Math.min(cols - 1, Math.floor((Math.max(a.x, b.x) + half - minX) / cell));
    const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z) - half - minZ) / cell)), j1 = Math.min(rows - 1, Math.floor((Math.max(a.z, b.z) + half - minZ) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = minX + i * cell, z = minZ + j * cell, f = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      if (!candidate[j * cols + i] && Math.hypot(a.x + f * dx - x, a.z + f * dz - z) <= half && !inWater(x, z)) candidate[j * cols + i] = 1;
    }
  }
}
const pit = new Uint8Array(cols * rows);
let pits = 0;
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
  const k = j * cols + i;
  if (!candidate[k]) continue;
  const ring = [];
  for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) {
    const r = Math.hypot(di, dj) * cell, ii = i + di, jj = j + dj;
    if (r >= 12 && r <= 24 && ii >= 0 && jj >= 0 && ii < cols && jj < rows && !candidate[jj * cols + ii]) ring.push(H[jj * cols + ii]);
  }
  if (ring.length < 8) continue;
  ring.sort((p, q) => p - q);
  if (H[k] < ring[ring.length >> 1] - 0.8) { pit[k] = 1; pits++; }
}
// Grow the pits by a node so that their slopes go too, then fill them
const fill = Uint8Array.from(pit);
for (let j = 1; j < rows - 1; j++) for (let i = 1; i < cols - 1; i++) {
  const k = j * cols + i;
  if (!pit[k] && candidate[k] && (pit[k - 1] || pit[k + 1] || pit[k - cols] || pit[k + cols])) fill[k] = 1;
}
const filled = [];
for (let k = 0; k < fill.length; k++) if (fill[k]) filled.push(k);
for (let iter = 0; iter < 400; iter++) {
  for (const k of filled) {
    const i = k % cols, j = (k - i) / cols;
    let sum = 0, n = 0;
    for (const nk of [i > 0 ? k - 1 : -1, i < cols - 1 ? k + 1 : -1, j > 0 ? k - cols : -1, j < rows - 1 ? k + cols : -1]) if (nk >= 0) { sum += H[nk]; n++; }
    H[k] = Math.max(H[k], sum / n);
  }
}
log(`filled ${filled.length} nodes of open cuts to the underground (${pits} pits)`);
stage('1-cuts');

// --- A smooth bed for the rivers ------------------------------------------------------------------------------------------
// The Landwasser and the Flüelabach (OSM waterway=river, drawn by js/streams.js on the ground) lie in a channel that the
// 2 m model and the 8 m grid break into steps and bumps. Along each river way, in its direction of flow, the bed takes
// the lowest ground across the channel every 4 m, never rising downstream, Gaussian-smoothed over ~±40 m and made
// monotonic again; the ground is lowered to it (never raised) across the channel and eased up the banks. Done before
// the railway bed, which keeps the last word where the line runs along the bank.
{
  const STEP = 4, SIGMA = 40, BANK = 7, MAX_CUT = 2.5;
  const isOn = (v) => !!v && v !== 'no';
  const widthOf = (t) => parseFloat(t.width) || (t.name === 'Landwasser' ? 10 : 6);
  const groundAt = (x, z) => { const { E, N } = worldToLv95(x, z); return heightAt(E, N); };
  const corridor = new Float64Array(cols * rows).fill(Infinity), target = new Float64Array(cols * rows), halfAt = new Float64Array(cols * rows);
  let rivers = 0, carved = 0;
  for (const e of osm.elements) {
    const t = e.tags || {};
    if (e.type !== 'way' || !e.geometry || t.waterway !== 'river' || isOn(t.tunnel)) continue;
    const half = widthOf(t) / 2;
    const pts = e.geometry.map((p) => lonLatToWorld(p.lon, p.lat)), S = [];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
      for (let m = k === 1 ? 0 : 1; m <= n; m++) S.push({ x: a.x + ((b.x - a.x) * m) / n, z: a.z + ((b.z - a.z) * m) / n });
    }
    // Only the part over the map (some river ways run on far beyond it)
    for (let k = S.length - 1; k >= 0; k--) if (S[k].x < minX || S[k].x > maxX || S[k].z < minZ || S[k].z > maxZ) S.splice(k, 1);
    if (S.length < 3) continue;
    // The lowest ground across the channel at each sample
    for (let k = 0; k < S.length; k++) {
      const a = S[Math.max(0, k - 1)], b = S[Math.min(S.length - 1, k + 1)], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
      let lo = Infinity;
      for (let o = -half; o <= half; o += 1) { const h = groundAt(S[k].x + nx * o, S[k].z + nz * o); if (Number.isFinite(h)) lo = Math.min(lo, h); }
      S[k].h = lo;
    }
    if (!S.every((p) => Number.isFinite(p.h))) continue;
    // Downstream: the way's own direction when its end lies lower (OSM draws rivers with the flow, but not always)
    const ends = (k0, k1) => { let a = 0; for (let k = k0; k < k1; k++) a += S[k].h; return a / (k1 - k0); };
    const span = Math.min(10, S.length >> 1);
    if (ends(0, span) < ends(S.length - span, S.length)) S.reverse();
    const monotone = (arr) => { for (let k = 1; k < arr.length; k++) arr[k] = Math.min(arr[k], arr[k - 1]); return arr; };
    const raw = monotone(S.map((p) => p.h));
    const smooth = raw.map((_, k) => {
      let sum = 0, wsum = 0;
      for (let m = Math.max(0, k - (3 * SIGMA) / STEP | 0); m < Math.min(raw.length, k + (3 * SIGMA) / STEP + 1); m++) {
        const d = (m - k) * STEP, w = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
        sum += raw[m] * w; wsum += w;
      }
      return Math.min(raw[k] + 0.05, sum / wsum); // (never above the channel's lowest ground, so only cutting)
    });
    // Monotonic again, but never more than MAX_CUT under the channel's lowest ground (a rock step stays a cascade)
    const prof = monotone(smooth).map((h, k) => Math.max(h, S[k].h - MAX_CUT));
    const reach = half + BANK;
    for (let k = 1; k < S.length; k++) {
      const a = S[k - 1], b = S[k], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
      const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x) - reach - minX) / cell)), i1 = Math.min(cols - 1, Math.floor((Math.max(a.x, b.x) + reach - minX) / cell));
      const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z) - reach - minZ) / cell)), j1 = Math.min(rows - 1, Math.floor((Math.max(a.z, b.z) + reach - minZ) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = minX + i * cell, z = minZ + j * cell, f = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
        const d = Math.hypot(a.x + f * dx - x, a.z + f * dz - z), q = j * cols + i;
        if (d < corridor[q]) { corridor[q] = d; target[q] = prof[k - 1] + (prof[k] - prof[k - 1]) * f; halfAt[q] = half; }
      }
    }
    rivers++;
  }
  for (let q = 0; q < H.length; q++) {
    const d = corridor[q], half = halfAt[q];
    if (!(d < half + BANK)) continue;
    // Full depth across the channel (a node within ~half a cell of it), then up the bank
    const u = Math.max(0, Math.min(1, (d - Math.max(half, cell * 0.7)) / BANK)), w = 1 - u * u * (3 - 2 * u);
    // (and no node more than MAX_CUT below its own ground: the channel's lowest 2 m sample may lie well under a node
    // of the 8 m grid that sits on the bank)
    const lowered = Math.max(H[q] + (target[q] - H[q]) * w, H[q] - MAX_CUT);
    if (lowered < H[q]) { H[q] = lowered; carved++; }
  }
  log(`river beds: ${rivers} river ways smoothed (Landwasser, Flüelabach), ${carved} grid nodes lowered`);
}
stage('2-rivers');

// --- A smooth bed for the railway ----------------------------------------------------------------------------------------
// Rails climb in even gradients, but the 8 m grid gives the RhB's tracks the bumps of the ground beside them. The line
// through the valley (js/rhb-route.js: the tracks joined end to end, Wolfgang to Frauenkirch) takes one long profile: the
// ground sampled every 4 m from the 2 m model, off the bridges and tunnels, Gaussian-averaged over ~±75 m. Every
// metre-gauge track off the bridges and tunnels then takes that profile where it runs beside the line (the station
// tracks), else its own smoothed profile; the ground is set to it within 8 m of the track (the grid nodes of the
// triangles under it) and eased back to the terrain over the next 8 m. The drawn track, the trains and the overhead
// line follow it (js/terrain.js). Laid before the streets: the grid nodes of the triangles under the track itself
// (±TRACK m) are held there, the streets lay their beds around them (a level crossing takes the rails' height, a street
// beside the line keeps its own beyond the ballast); the rest of the 8 m strip is the streets' where they want it. (A
// node under both a track's and a carriageway's triangles stays the track's: given to the nearer centre line, the
// streets gained a tenth of their rough metres and the tracks got five times as many.)
const railHeld = new Uint8Array(cols * rows);
{
  const STEP = 4, SIGMA = 25, CORE = 8, EASE = 8, NEAR_LINE = 12, TRACK = 2;
  const flatPts = (e) => e.geometry.flatMap((p) => { const w = lonLatToWorld(p.lon, p.lat); return [w.x, w.z]; });
  const isOn = (v) => !!v && v !== 'no';
  const railWays = osm.elements.filter((e) => e.type === 'way' && e.geometry && e.tags?.railway === 'narrow_gauge');
  const railways = railWays.map((e) => ({ kind: 'narrow_gauge', pts: flatPts(e), tunnel: isOn(e.tags.tunnel), bridge: isOn(e.tags.bridge) }));
  const stations = osm.elements.filter((e) => e.type === 'node' && /^(station|halt)$/.test(e.tags?.railway || ''))
    .map((e) => ({ ...lonLatToWorld(e.lon, e.lat), name: e.tags.name || '', kind: e.tags.railway }));
  const smooth = (samples) => samples.map((p, k) => {
    // Gaussian average of the ground samples (bridges and tunnels left out: the valley under a span is not the bed)
    let sum = 0, wsum = 0;
    for (let m = Math.max(0, k - 3 * SIGMA / STEP | 0); m < Math.min(samples.length, k + 3 * SIGMA / STEP + 1); m++) {
      if (!samples[m].ground) continue;
      const d = (m - k) * STEP, w = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
      sum += samples[m].h * w; wsum += w;
    }
    return wsum ? sum / wsum : p.h;
  });
  const groundAt = (x, z) => { const { E, N } = worldToLv95(x, z); return heightAt(E, N); };
  // The line's profile
  const line = buildLine(railways, stations, WORLD_BOUNDS);
  const lineSamples = [];
  if (line) for (let s = 0; s <= line.south.len; s += STEP) {
    const p = routePoint(line.south, s), q = line.south.pts[Math.min(line.south.pts.length - 1, Math.round(s / 4))];
    const h = groundAt(p.x, p.z);
    lineSamples.push({ x: p.x, z: p.z, h, ground: Number.isFinite(h) && !p.tunnel && !q.bridge });
  }
  const lineProfile = smooth(lineSamples);
  const LINE_CELL = 32, lineCells = new Map();
  lineSamples.forEach((p, k) => {
    const key = `${Math.floor(p.x / LINE_CELL)},${Math.floor(p.z / LINE_CELL)}`;
    if (!lineCells.has(key)) lineCells.set(key, []);
    lineCells.get(key).push(k);
  });
  const nearLine = (x, z) => {
    let best = -1, bd = NEAR_LINE;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const k of lineCells.get(`${Math.floor(x / LINE_CELL) + i},${Math.floor(z / LINE_CELL) + j}`) || []) {
        const d = Math.hypot(lineSamples[k].x - x, lineSamples[k].z - z);
        if (d < bd) { bd = d; best = k; }
      }
    }
    return best;
  };

  const corridor = new Float64Array(cols * rows).fill(Infinity), target = new Float64Array(cols * rows);
  let tracks = 0;
  for (const e of railWays) {
    const t = e.tags;
    if (isOn(t.bridge) || isOn(t.tunnel) || (parseFloat(t.layer) || 0) < 0) continue;
    const pts = e.geometry.map((p) => lonLatToWorld(p.lon, p.lat)), S = [];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
      for (let m = k === 1 ? 0 : 1; m <= n; m++) S.push({ x: a.x + ((b.x - a.x) * m) / n, z: a.z + ((b.z - a.z) * m) / n });
    }
    if (S.length < 2) continue;
    for (const p of S) { p.h = groundAt(p.x, p.z); p.ground = Number.isFinite(p.h); }
    if (!S.every((p) => p.ground)) continue;
    const own = smooth(S);
    const prof = S.map((p, k) => { const l = nearLine(p.x, p.z); return l >= 0 ? lineProfile[l] : own[k]; });
    const reach = CORE + EASE;
    for (let k = 1; k < S.length; k++) {
      const a = S[k - 1], b = S[k], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
      const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x) - reach - minX) / cell)), i1 = Math.min(cols - 1, Math.floor((Math.max(a.x, b.x) + reach - minX) / cell));
      const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z) - reach - minZ) / cell)), j1 = Math.min(rows - 1, Math.floor((Math.max(a.z, b.z) + reach - minZ) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = minX + i * cell, z = minZ + j * cell, f = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
        const d = Math.hypot(a.x + f * dx - x, a.z + f * dz - z), q = j * cols + i;
        if (d < corridor[q]) { corridor[q] = d; target[q] = prof[k - 1] + (prof[k] - prof[k - 1]) * f; }
      }
    }
    // (the nodes of the triangles under the track, every metre along it)
    for (let k = 1; k < S.length; k++) {
      const a = S[k - 1], b = S[k], L = Math.hypot(b.x - a.x, b.z - a.z) || 1e-9, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      for (let f = 0; f < L; f += 1) for (let o = -TRACK; o <= TRACK + 1e-6; o += 1) {
        const u = (a.x + ux * f - uz * o - minX) / cell, v = (a.z + uz * f + ux * o - minZ) / cell, i = Math.floor(u), j = Math.floor(v);
        if (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) continue;
        const q = j * cols + i;
        railHeld[q] = railHeld[q + cols + 1] = railHeld[u - i >= v - j ? q + 1 : q + cols] = 1;
      }
    }
    tracks++;
  }
  let set = 0;
  for (let q = 0; q < H.length; q++) {
    const d = corridor[q];
    if (d >= CORE + EASE) continue;
    const u = Math.max(0, Math.min(1, (d - CORE) / EASE)), w = 1 - u * u * (3 - 2 * u);
    H[q] += (target[q] - H[q]) * w;
    set++;
  }
  log(`railway bed: the line ${line ? Math.round(line.south.len) : 0} m, ${tracks} tracks laid on it or smoothed, ${set} grid nodes set`);
}
stage('3-railway');

// --- A smooth bed for the streets ----------------------------------------------------------------------------------------
// The streets are draped on the 8 m grid (js/terrain.js drapeOverlay), so on a hillside a carriageway takes the tilt of
// the 8 m triangles under it: the uphill node of a cell lies metres above the road, the downhill one metres below
// (retaining walls and embankments), and the street rolls and leans from cell to cell (the Obere Strasse above the
// Promenade, the Buol- and Schatzalpstrasse). Along every drivable way off the bridges and tunnels, the road's height is
// sampled every STEP m from the 2 m model (the median across the carriageway) and smoothed by a Gaussian-weighted local
// line over ~±2 SIGMA (a local line, not a plain average: no bias at the ends of a way on a grade, so ways meeting at a
// junction agree). Every grid node of a triangle under the carriageway (plus BANK) is set to that profile, level across;
// the nodes beyond are eased back to the terrain over EASE m (the embankment). Where streets meet, the nodes take the
// targets of the streets near them weighted by closeness to their carriageways (a street's over a service way's).
// Done after the railway bed, whose nodes under the track it leaves as they are (level crossings follow the rails),
// and never in the rivers or the lake. A node moves at most MAX_MOVE m, and at most MAX_CONFLICT m where it lies under
// streets more than CONFLICT m apart in height (the hairpins stacked on a steep slope, where an 8 m cell spans two legs
// of the road, keep some tilt rather than a cliff cut into the hill); the ground under a building rises by MAX_BUILDING m
// and falls by MAX_BUILDING_CUT m at most (js/swissbuildings3d.js sinks a house's floor to the ground under it, but not
// by more than a few metres: further, the house would float; raised much, the ground would bury it).
//
// Those limits are what is left of the bumps: in the built-up centre the nodes under a carriageway are the nodes under
// the houses on the kerb, so a street there cannot have the bed it wants, and the triangle it could not raise leaves a
// notch in the road (the Obere Strasse over the Promenade, where the houses stand in the wall between the two levels).
// Two things against that. A node under a carriageway may be cut to the full MAX_MOVE even under a house, because
// cutting costs a house nothing: swissBUILDINGS3D sets it on the HIGHEST ground under its floor, so the ground giving
// way on the street side only shows more of its plinth, while filling buries it — the fill stays tight (MAX_ROAD_FILL
// under a carriageway, MAX_BUILDING elsewhere). And the bed is laid ROUNDS times: after the first round a street is
// levelled against the ground it actually got rather than against the model, so where a node is held the profile gives
// way with it and is cut into the slope instead, which the ground can follow. Never more than MAX_GIVE m off the
// surveyed road (medianly the streets end up where they lie: half of them within 0.3 m, none more than 3 m off).
{
  const STEP = 2, SIGMA = 6, BANK = 1.5, EASE = 4, MAX_MOVE = 8, MAX_CONFLICT = 2.5, CONFLICT = 1.5, MAX_BUILDING = 2.5, MAX_BUILDING_CUT = 3;
  const ROUNDS = 16, MAX_GIVE = 3, MAX_ROAD_FILL = 4;
  const KINDS = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(residential|unclassified|living_street|service)$/;
  const WIDTH = { motorway: 14, trunk: 12, primary: 10, secondary: 8, tertiary: 7, residential: 6, unclassified: 6, living_street: 5, service: 3.5 };
  const LANES = { motorway: 4, trunk: 4, primary: 2, secondary: 2, tertiary: 2, residential: 2, unclassified: 2, living_street: 1, service: 1 };
  const isOn = (v) => !!v && v !== 'no';
  const groundAt = (x, z) => { const { E, N } = worldToLv95(x, z); return heightAt(E, N); };
  const n = cols * rows;
  // (per node: the targets of the streets it lies under, else those of the streets whose embankment it is in)
  const blend = new Float32Array(n), tsum = new Float64Array(n), asum = new Float64Array(n), csum = new Float64Array(n), ccount = new Float64Array(n), crank = new Int8Array(n);
  const clo = new Float32Array(n).fill(Infinity), chi = new Float32Array(n).fill(-Infinity);
  const rankOf = (base) => (base === 'service' ? 1 : 2);
  // Under the buildings (OSM footprints, sampled every 2 m): per node, its largest share in the ground height at a point
  // of a footprint (the barycentric weight in the triangle there), so that the ground there moves by little
  const underBuilding = new Float32Array(n);
  for (const e of osm.elements) {
    if (e.type === 'node' || !e.tags?.building) continue;
    for (const { ring } of polygons(e)) {
      const b = ringBox(ring);
      if (b.x1 < minX || b.x0 > maxX || b.z1 < minZ || b.z0 > maxZ) continue;
      const markAt = (x, z) => {
        const u = (x - minX) / cell, v = (z - minZ) / cell, i = Math.floor(u), j = Math.floor(v);
        if (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) return;
        const k = j * cols + i, fu = u - i, fv = v - j;
        const share = (q, w) => { if (w > underBuilding[q]) underBuilding[q] = w; };
        if (fu >= fv) { share(k, 1 - fu); share(k + 1, fu - fv); share(k + cols + 1, fv); }
        else { share(k, 1 - fv); share(k + cols, fv - fu); share(k + cols + 1, fu); }
      };
      for (let x = b.x0; x <= b.x1; x += 2) for (let z = b.z0; z <= b.z1; z += 2) if (pip(ring, x, z)) markAt(x, z);
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k], c = ring[(k + 1) % ring.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        for (let f = 0; f <= L; f += 2) markAt(a[0] + ((c[0] - a[0]) * f) / Math.max(L, 1e-9), a[1] + ((c[1] - a[1]) * f) / Math.max(L, 1e-9));
      }
    }
  }
  // The ground before the streets: every round lays the bed from it anew, so the rounds cannot pile up
  const H0 = Float64Array.from(H);
  // (per way the surveyed road height at its samples — the 2 m model does not change between the rounds)
  const surveyed = new Map();
  const HELD = { rail: 1, water: 2, stacked: 3, house: 4, limit: 5, junction: 6 }, held = new Uint8Array(n);
  let ways = 0, set = 0, cut = 0, fillUp = 0, big = 0;
  for (let round = 0; round < ROUNDS; round++) {
    ways = 0;
    blend.fill(0); tsum.fill(0); asum.fill(0); csum.fill(0); ccount.fill(0); crank.fill(0); clo.fill(Infinity); chi.fill(-Infinity);
    // The height of the ground laid so far at (x, z) — the same surface as js/terrain-grid.js gridHeight
    const laid = (x, z) => {
      const u = (x - minX) / cell, v = (z - minZ) / cell, i = Math.floor(u), j = Math.floor(v);
      if (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) return NaN;
      const fu = u - i, fv = v - j, k = j * cols + i;
      return fu >= fv ? H[k] + fu * (H[k + 1] - H[k]) + fv * (H[k + cols + 1] - H[k + 1])
                      : H[k] + fv * (H[k + cols] - H[k]) + fu * (H[k + cols + 1] - H[k + cols]);
    };
    for (const e of osm.elements) {
      const t = e.tags || {};
      if (e.type !== 'way' || !e.geometry || !KINDS.test(t.highway || '') || t.area === 'yes') continue;
      if (isOn(t.bridge) || (isOn(t.tunnel) && t.tunnel !== 'building_passage') || t.covered === 'yes' || (parseFloat(t.layer) || 0) < 0) continue;
      const base = t.highway.replace(/_link$/, '');
      const width = parseFloat(t.width) || Math.max(WIDTH[base] ?? 3, (parseFloat(t.lanes) || LANES[base] || 1) * 3);
      const half = width / 2, rank = rankOf(base);
      const pts = e.geometry.map((p) => lonLatToWorld(p.lon, p.lat)), S = [];
      let s = 0;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], L = Math.hypot(b.x - a.x, b.z - a.z), m1 = Math.max(1, Math.ceil(L / STEP));
        if (L < 1e-3) continue;
        for (let m = S.length ? 1 : 0; m <= m1; m++) S.push({ x: a.x + ((b.x - a.x) * m) / m1, z: a.z + ((b.z - a.z) * m) / m1, s: s + (L * m) / m1, ux: (b.x - a.x) / L, uz: (b.z - a.z) / L });
        s += L;
      }
      if (S.length < 2 || S.every((p) => p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ)) continue;
      // The road's height at each sample: the median of the 2 m model across the carriageway
      let model = surveyed.get(e.id);
      if (!model) {
        model = S.map((p) => {
          const q = half * 0.6, hs = [-q, -q / 2, 0, q / 2, q].map((o) => groundAt(p.x - p.uz * o, p.z + p.ux * o)).filter(Number.isFinite).sort((u, v) => u - v);
          return hs.length ? hs[hs.length >> 1] : NaN;
        });
        surveyed.set(e.id, model);
      }
      // After the first round, the ground the street actually got, so that the profile gives way where a node is held
      for (let k = 0; k < S.length; k++) {
        const got = round ? laid(S[k].x, S[k].z) : NaN;
        S[k].h = Number.isFinite(got) ? Math.max(model[k] - MAX_GIVE, Math.min(model[k] + MAX_GIVE, got)) : model[k];
      }
      if (!S.every((p) => Number.isFinite(p.h))) continue;
      // Gaussian-weighted local line through the samples
      let first = 0;
      const prof = S.map((p) => {
        let w0 = 0, w1 = 0, w2 = 0, h0 = 0, h1 = 0;
        while (S[first].s < p.s - 3 * SIGMA) first++;
        for (let m = first; m < S.length; m++) {
          const d = S[m].s - p.s;
          if (d > 3 * SIGMA) break;
          const w = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
          w0 += w; w1 += w * d; w2 += w * d * d; h0 += w * S[m].h; h1 += w * d * S[m].h;
        }
        const det = w0 * w2 - w1 * w1;
        return det > 1e-6 ? (h0 * w2 - h1 * w1) / det : h0 / w0;
      });
      // Nodes of the triangles under the carriageway (the strip's points every metre, triangulated as terrain-grid.js)
      const core = new Set();
      const mark = (x, z) => {
        const u = (x - minX) / cell, v = (z - minZ) / cell, i = Math.floor(u), j = Math.floor(v);
        if (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) return;
        const k = j * cols + i;
        core.add(k); core.add(k + cols + 1); core.add(u - i >= v - j ? k + 1 : k + cols);
      };
      const reachCore = half + BANK;
      for (let k = 1; k < S.length; k++) {
        const a = S[k - 1], b = S[k], L = Math.hypot(b.x - a.x, b.z - a.z);
        for (let f = 0; f < L; f += 1) {
          const x = a.x + (b.x - a.x) * f / L, z = a.z + (b.z - a.z) * f / L;
          for (let o = -reachCore; o <= reachCore + 1e-6; o += 1) mark(x - b.uz * o, z + b.ux * o);
        }
      }
      // Each node near the way: its distance and the profile at its foot on the way
      const reach = half + BANK + cell * 1.5 + EASE;
      const near = new Map();
      for (let k = 1; k < S.length; k++) {
        const a = S[k - 1], b = S[k], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
        const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x) - reach - minX) / cell)), i1 = Math.min(cols - 1, Math.floor((Math.max(a.x, b.x) + reach - minX) / cell));
        const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z) - reach - minZ) / cell)), j1 = Math.min(rows - 1, Math.floor((Math.max(a.z, b.z) + reach - minZ) / cell));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = minX + i * cell, z = minZ + j * cell, f = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
          const d = Math.hypot(a.x + f * dx - x, a.z + f * dz - z), q = j * cols + i;
          if (d < reach && !(near.get(q)?.d <= d)) near.set(q, { d, t: prof[k - 1] + (prof[k] - prof[k - 1]) * f });
        }
      }
      for (const [q, { d, t: target }] of near) {
        const u = Math.max(0, Math.min(1, (d - half - BANK) / (cell + EASE)));
        const w = core.has(q) ? 1 : 1 - u * u * (3 - 2 * u);
        if (w <= 0) continue;
        const e2 = (1 + Math.max(0, d - half)) ** 2, a = w / (e2 * e2);
        // (under a street and a drive, the street's level: the drive meets the street at its level)
        if (w === 1 && core.has(q)) { clo[q] = Math.min(clo[q], target); chi[q] = Math.max(chi[q], target); }
        if (w === 1 && core.has(q) && rank >= crank[q]) {
          if (rank > crank[q]) { crank[q] = rank; csum[q] = 0; ccount[q] = 0; }
          csum[q] += a * target; ccount[q] += a;
        }
        blend[q] = Math.max(blend[q], w); tsum[q] += a * target; asum[q] += a;
      }
      ways++;
    }
    set = 0; cut = 0; fillUp = 0; big = 0;
    held.fill(0);
    for (let q = 0; q < n; q++) {
      if (!(blend[q] > 0) || !(asum[q] > 0)) continue;
      const i = q % cols, j = (q - i) / cols;
      if (railHeld[q]) { held[q] = HELD.rail; continue; }
      if (inWater(minX + i * cell, minZ + j * cell)) { held[q] = HELD.water; continue; }
      const cap = chi[q] - clo[q] > CONFLICT ? MAX_CONFLICT : MAX_MOVE;
      const house = Math.max(underBuilding[q], 1e-3);
      // Under a carriageway the street's bed wins over the house over it, downward without reserve and upward to
      // MAX_ROAD_FILL (cutting shows a house's plinth, filling buries it); beside one, the house keeps its ground.
      const down = ccount[q] > 0 ? Math.min(cap, MAX_MOVE) : Math.min(cap, MAX_BUILDING_CUT / house);
      const up = ccount[q] > 0 ? Math.max(Math.min(cap, MAX_BUILDING / house), Math.min(MAX_ROAD_FILL, MAX_MOVE)) : Math.min(cap, MAX_BUILDING / house);
      const want = ccount[q] > 0 ? csum[q] / ccount[q] : H0[q] + (tsum[q] / asum[q] - H0[q]) * blend[q];
      const dh = Math.max(-down, Math.min(up, want - H0[q]));
      H[q] = H0[q] + dh; set++;
      if (dh < 0) cut -= dh; else fillUp += dh;
      if (dh <= -down || dh >= up) {
        big++;
        held[q] = cap === MAX_CONFLICT && (dh <= -cap || (dh >= cap && up === cap)) ? HELD.stacked : ccount[q] > 0 ? HELD.limit : underBuilding[q] > 0.05 ? HELD.house : HELD.limit;
      }
      if (!held[q] && chi[q] - clo[q] > CONFLICT) held[q] = HELD.junction;
    }
  }
  // (TERRAIN_STAGES: why a node near a street is not where the streets want it, for tools/check-road-smoothness.mjs)
  if (process.env.TERRAIN_STAGES) fs.writeFileSync(path.join(process.env.TERRAIN_STAGES, 'held.bin'), held);
  log(`street beds: ${ways} ways in ${ROUNDS} rounds, ${set} grid nodes set (mean cut ${(cut / set).toFixed(2)} m, fill ${(fillUp / set).toFixed(2)} m, ${big} held at their limit)`);
}
stage('4-streets');

// --- The trenches of the road underpasses -------------------------------------------------------------------------------
// tools/underpass.mjs. The 2 m model keeps the ramps and bridges the tunnel itself with the yard above. Done last: the
// pit filling and the railway bed have laid the ground over it. The road's height: the model along the ramps, a line
// between the two mouths through the tunnel, smoothed; the nodes under the carriageway sink to it (and never rise) —
// but not a node nearer a main road (tertiary and up) than the underpass's own way (the Hofstrasse's ramp runs 8 m
// beside the Tanzbühlstrasse, whose carriageway the trench pulled metres down with it: the main road keeps its bed,
// the wall between the two is a steep bank of a cell; the side streets meeting the ramp go down with it).
{
  const STEP = 2, SIGMA = 4, BANK = 1, APPROACH = 30, MOUTH = 6;
  const isOnTag = (v) => !!v && v !== 'no';
  const groundAt = (x, z) => { const { E, N } = worldToLv95(x, z); return heightAt(E, N); };
  for (const u of findUnderpasses(osm)) {
    const nodes = u.way.nodes, S = [];
    const lay = (pts, s0, sign) => {
      const out = [];
      let s = 0;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / STEP));
        for (let m = 1; m <= n; m++) out.push({ x: a.x + ((b.x - a.x) * m) / n, z: a.z + ((b.z - a.z) * m) / n, s: s0 + sign * (s + (L * m) / n) });
        s += L;
      }
      return out;
    };
    const before = lay(approachFrom(osm, u, nodes[0], APPROACH), 0, -1).reverse();
    const after = lay(approachFrom(osm, u, nodes[nodes.length - 1], APPROACH), u.len, 1);
    S.push(...before, { x: u.a.x, z: u.a.z, s: 0 }, ...lay([u.a, u.b], 0, 1), ...after);
    for (const p of S) p.h = groundAt(p.x, p.z);
    const lowest = (s0, s1) => Math.min(...S.filter((p) => p.s >= s0 && p.s <= s1).map((p) => p.h));
    const floorA = lowest(-4, MOUTH), floorB = lowest(u.len - MOUTH, u.len + 4);
    for (const p of S) if (p.s >= -2 && p.s <= u.len + 2) p.h = floorA + (floorB - floorA) * Math.max(0, Math.min(1, p.s / u.len));
    const prof = S.map((p) => {
      let sum = 0, w = 0;
      for (const q of S) { const d = q.s - p.s, g = Math.exp(-(d * d) / (2 * SIGMA * SIGMA)); sum += q.h * g; w += g; }
      return sum / w;
    });
    let set = 0;
    const done = new Set();
    const reach = u.half + BANK;
    // (the other drivable ways near the trench, as segments, and the distance of a point to the nearest of them and to
    // the trench's own line)
    const R = APPROACH + u.len + 40, cx = (u.a.x + u.b.x) / 2, cz = (u.a.z + u.b.z) / 2, others = [];
    for (const e of osm.elements) {
      const t = e.tags || {};
      if (e.type !== 'way' || !e.geometry || e === u.way || t.name === u.way.tags.name || !/^(motorway|trunk|primary|secondary|tertiary)(_link)?$/.test(t.highway || '')) continue;
      if (isOnTag(t.bridge) || isOnTag(t.tunnel)) continue;
      const pts = e.geometry.map((p) => lonLatToWorld(p.lon, p.lat));
      for (let k = 1; k < pts.length; k++) if (Math.hypot(pts[k].x - cx, pts[k].z - cz) < R || Math.hypot(pts[k - 1].x - cx, pts[k - 1].z - cz) < R) others.push([pts[k - 1], pts[k]]);
    }
    const segDist = (x, z, a, b) => {
      const dx = b.x - a.x, dz = b.z - a.z, f = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1e-9)));
      return Math.hypot(a.x + f * dx - x, a.z + f * dz - z);
    };
    const nearerOther = (q) => {
      const i = q % cols, x = minX + i * cell, z = minZ + ((q - i) / cols) * cell;
      let own = Infinity, other = Infinity;
      for (let k = 1; k < S.length; k++) own = Math.min(own, segDist(x, z, S[k - 1], S[k]));
      for (const [a, b] of others) other = Math.min(other, segDist(x, z, a, b));
      return other < own;
    };
    const kept = new Map();
    const sink = (x, z, target) => {
      const fu = (x - minX) / cell, fv = (z - minZ) / cell, i = Math.floor(fu), j = Math.floor(fv);
      if (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) return;
      const k = j * cols + i;
      for (const q of [k, k + cols + 1, fu - i >= fv - j ? k + 1 : k + cols]) {
        if (!kept.has(q)) kept.set(q, nearerOther(q));
        if (kept.get(q)) continue;
        if (H[q] > target) { H[q] = target; if (!done.has(q)) { done.add(q); set++; } }
      }
    };
    for (let k = 1; k < S.length; k++) {
      const a = S[k - 1], b = S[k], L = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      for (let f = 0; f < L; f += 1) for (let o = -reach; o <= reach + 1e-6; o += 1) {
        sink(a.x + ux * f - uz * o, a.z + uz * f + ux * o, prof[k - 1] + ((prof[k] - prof[k - 1]) * f) / L);
      }
    }
    log(`underpass ${u.way.tags.name || u.way.id}: floor ${floorA.toFixed(1)}-${floorB.toFixed(1)} m a.s.l., ${set} grid nodes sunk, ${[...kept.values()].filter(Boolean).length} left to the main roads beside`);
  }
}

writeGrid(OUT, H);
log(`wrote ${OUT}: ${cols}x${rows} @ ${cell} m, ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB, ` +
  `heights ${lo.toFixed(1)}..${hi.toFixed(1)} m a.s.l., ${missing} missing`);
