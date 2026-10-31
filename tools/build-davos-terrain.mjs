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

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(DIR, '..', 'data', 'davos-terrain.bin');
const CACHE = path.join(DIR, 'data', 'cache', 'swissalti3d');
const STAC = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d/items';
const log = (...a) => console.log('[davos-terrain]', ...a);
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// --- 1 km tiles covering the frame (latest acquisition of each), 2 m resolution ----------------------------------------
const [minE, minN, maxE, maxN] = FRAME.lv95;
const corners = [[minE, minN], [maxE, minN], [minE, maxN], [maxE, maxN]].map(([e, n]) => lv95ToWgs84(e, n));
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
    if (+e * 1000 + 1000 <= minE || +e * 1000 >= maxE || +n * 1000 + 1000 <= minN || +n * 1000 >= maxN) continue;
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

// --- A smooth bed for the railway ----------------------------------------------------------------------------------------
// Rails climb in even gradients, but the 8 m grid gives the RhB's tracks the bumps of the ground beside them. The line
// through the valley (js/rhb-route.js: the tracks joined end to end, Wolfgang to Frauenkirch) takes one long profile: the
// ground sampled every 4 m from the 2 m model, off the bridges and tunnels, Gaussian-averaged over ~±75 m. Every
// metre-gauge track off the bridges and tunnels then takes that profile where it runs beside the line (the station
// tracks), else its own smoothed profile; the ground is set to it within 8 m of the track (the grid nodes of the
// triangles under it) and eased back to the terrain over the next 8 m. The drawn track, the trains and the overhead
// line follow it (js/terrain.js).
{
  const STEP = 4, SIGMA = 25, CORE = 8, EASE = 8, NEAR_LINE = 12;
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

const heights = new Int16Array(cols * rows);
for (let k = 0; k < heights.length; k++) heights[k] = Math.round((H[k] - FRAME.H0) / scale);
const header = Buffer.alloc(24);
header.write('ZTR1', 0, 'ascii');
header.writeUInt16LE(cols, 4); header.writeUInt16LE(rows, 6);
header.writeFloatLE(cell, 8); header.writeFloatLE(minX, 12); header.writeFloatLE(minZ, 16); header.writeFloatLE(scale, 20);
fs.writeFileSync(OUT, Buffer.concat([header, Buffer.from(heights.buffer)]));
log(`wrote ${OUT}: ${cols}x${rows} @ ${cell} m, ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB, ` +
  `heights ${lo.toFixed(1)}..${hi.toFixed(1)} m a.s.l., ${missing} missing`);
