// tools/fetch-tlm-trees.mjs — writes js/tlm-trees-data.js: the trees of the national map, from swisstopo's open data
//  - swissTLM3D single trees (the green dots of the Landeskarte) and wooded areas, from the swisstopo base vector tiles
//    (vectortiles.geo.admin.ch, ch.swisstopo.base.vt, zoom 14: layer landcover_pt class tree; layer landcover class
//    wood: forest = Wald, loose_forest = Wald offen, scrub = Gebüschwald, woody_plant = Gehölzfläche);
//  - their heights and leaf type from the BAFU/WSL habitat map's woody plants outside the forest
//    (ch.bafu.lebensraumkarte-schweiz_gehoelze via the geo.admin identify service: single trees and shrubs as crown
//    polygons with max_hght, crown_area and evergreen), matched to the TLM trees within 4 m; its shrubs are added.
// © swisstopo (swissTLM3D, OGD), © BAFU/WSL (Lebensraumkarte der Schweiz, OGD). Raw responses are cached in
// tools/data/cache/tlm/ (not committed).
// usage: node tools/fetch-tlm-trees.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME, WORLD_BOUNDS, lonLatToWorld } from '../js/davos-frame.js';
import { lv95ToWgs84 } from '../js/swiss-projection.js';
import { decodeTile } from './mvt.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, 'data', 'cache', 'tlm');
const OUT = path.join(DIR, '..', 'js', 'tlm-trees-data.js');
const TILES = 'https://vectortiles0.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0';
const IDENTIFY = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify';
const Z = 14, CONCURRENCY = 6;
const log = (...a) => console.log('[tlm-trees]', ...a);
fs.mkdirSync(CACHE, { recursive: true });
const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const inFrame = (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;
const r1 = (v) => Math.round(v * 10) / 10;

async function fetchRetry(url, as = 'buffer') {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (res.status === 204 || res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status}`);
      return as === 'json' ? await res.json() : Buffer.from(await res.arrayBuffer());
    } catch (error) {
      if (attempt >= 4) throw new Error(`${url}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}
async function pool(items, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (next < items.length) await fn(items[next++]); }));
}

// --- swissTLM3D from the base vector tiles ---------------------------------------------------------------------------------
const corners = [[FRAME.lv95[0], FRAME.lv95[1]], [FRAME.lv95[2], FRAME.lv95[3]], [FRAME.lv95[0], FRAME.lv95[3]], [FRAME.lv95[2], FRAME.lv95[1]]]
  .map(([e, n]) => lv95ToWgs84(e, n));
const n = 2 ** Z;
const tileX = (lon) => Math.floor(((lon + 180) / 360) * n);
const tileY = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
const x0 = Math.min(...corners.map((c) => tileX(c.lon))), x1 = Math.max(...corners.map((c) => tileX(c.lon)));
const y0 = Math.min(...corners.map((c) => tileY(c.lat))), y1 = Math.max(...corners.map((c) => tileY(c.lat)));
const tiles = [];
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ x, y });
log(`${tiles.length} vector tiles at z${Z}`);
// Tile pixel -> world
const toWorld = (t, extent, px, py) => {
  const lon = ((t.x + px / extent) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (t.y + py / extent)) / n))) * 180) / Math.PI;
  return lonLatToWorld(lon, lat);
};

const tlmTrees = new Map(); // dedupe across tile buffers by 0.5 m cell
const woods = []; // { kind, rings: [flat [x, z, …]] }: the outer ring first, then its holes (clearings)
const WOOD = { forest: 'forest', loose_forest: 'open', scrub: 'scrub', woody_plant: 'woody' };
await pool(tiles, async (t) => {
  const file = path.join(CACHE, `base-${Z}-${t.x}-${t.y}.pbf`);
  let raw = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (!raw) { raw = await fetchRetry(`${TILES}/${Z}/${t.x}/${t.y}.pbf`); if (raw) fs.writeFileSync(file, raw); }
  if (!raw) return;
  const layers = decodeTile(raw);
  const pts = layers.landcover_pt;
  if (pts) for (const f of pts.features) {
    if (f.props.class !== 'tree') continue;
    for (const ring of f.rings) for (const [px, py] of ring) {
      if (px < 0 || py < 0 || px > pts.extent || py > pts.extent) continue; // (the tile's buffer: the neighbour has it)
      const w = toWorld(t, pts.extent, px, py);
      if (!inFrame(w.x, w.z)) continue;
      tlmTrees.set(`${Math.round(w.x * 2)},${Math.round(w.z * 2)}`, { x: r1(w.x), z: r1(w.z) });
    }
  }
  const cover = layers.landcover;
  if (cover) for (const f of cover.features) {
    const kind = f.props.class === 'wood' && WOOD[f.props.subclass];
    if (!kind || f.type !== 3) continue;
    // MVT: an outer ring has a positive area (surveyor's formula in tile coordinates), its holes follow it
    let poly = null;
    for (const ring of f.rings) {
      let a = 0;
      for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      const flat = [];
      for (const [px, py] of ring) { const w = toWorld(t, cover.extent, px, py); flat.push(r1(w.x), r1(w.z)); }
      if (flat.length < 8) continue;
      if (a > 0 || !poly) { poly = { kind, rings: [flat] }; woods.push(poly); } else poly.rings.push(flat);
    }
  }
});
log(`swissTLM3D: ${tlmTrees.size} single trees, ${woods.length} wooded ring pieces`);

// --- BAFU/WSL woody plants outside the forest (heights, leaf type, shrubs) ------------------------------------------------
// identify returns at most 200 features a call: 500 m squares, paged with offset
const bafu = new Map();
const squares = [];
for (let e = FRAME.lv95[0]; e < FRAME.lv95[2]; e += 500) for (let nn = FRAME.lv95[1]; nn < FRAME.lv95[3]; nn += 500) squares.push([e, nn, e + 500, nn + 500]);
await pool(squares, async (b) => {
  const file = path.join(CACHE, `gehoelze-${b[0]}-${b[1]}.json`);
  let features = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (!features) {
    features = [];
    for (let offset = 0; ; offset += 200) {
      const q = new URLSearchParams({ geometryType: 'esriGeometryEnvelope', geometry: b.join(','), sr: '2056', layers: 'all:ch.bafu.lebensraumkarte-schweiz_gehoelze',
        tolerance: '0', mapExtent: b.join(','), imageDisplay: '500,500,96', returnGeometry: 'true', geometryFormat: 'geojson', limit: '200', offset: String(offset) });
      const page = (await fetchRetry(`${IDENTIFY}?${q}`, 'json'))?.results || [];
      for (const r of page) {
        // Crown centre (mean of the polygon's outer ring), metres in LV95
        const ring = r.geometry?.coordinates?.[0]?.[0] || [];
        if (!ring.length) continue;
        let E = 0, N = 0;
        for (const [ee, nn2] of ring) { E += ee; N += nn2; }
        const p = r.properties;
        features.push({ id: p.polyid, E: E / ring.length, N: N / ring.length, type: /^6000/.test(p.typoch_de) ? 'tree' : 'shrub', h: p.max_hght ?? null, crown: p.crown_area ?? null, evergreen: p.evergreen_de === 'Ja' });
      }
      if (page.length < 200) break;
    }
    fs.writeFileSync(file, JSON.stringify(features));
  }
  for (const f of features) bafu.set(f.id, f);
});
log(`BAFU woody plants: ${bafu.size}`);

// Match: the TLM tree takes the nearest BAFU tree within 4 m; the BAFU shrubs come as shrubs
const CELL = 8, grid = new Map();
const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
const bafuWorld = [...bafu.values()].map((f) => ({ ...f, x: f.E - FRAME.E0, z: FRAME.N0 - f.N }));
for (const f of bafuWorld) { const k = cellKey(f.x, f.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(f); }
const near = (x, z, r, type) => {
  let best = null, bd = r;
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const f of grid.get(`${cx + i},${cz + j}`) || []) {
    if (type && f.type !== type) continue;
    const d = Math.hypot(f.x - x, f.z - z);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
};
const trees = [];
let matched = 0;
for (const t of tlmTrees.values()) {
  const f = near(t.x, t.z, 4, 'tree');
  if (f) { matched++; f.used = true; }
  // [x, z, height (m, 0 unknown), evergreen (1 / 0 / -1 unknown)]
  trees.push([t.x, t.z, f?.h > 0 && f.h < 60 ? r1(f.h) : 0, f ? (f.evergreen ? 1 : 0) : -1]);
}
const shrubs = [];
for (const f of bafuWorld) if (f.type === 'shrub' && inFrame(f.x, f.z)) shrubs.push([r1(f.x), r1(f.z), f.h ? r1(f.h) : 2.5, f.evergreen ? 1 : 0]);
log(`${matched} of ${trees.length} TLM trees with a BAFU height, ${shrubs.length} shrubs`);

// Wooded areas: simplified rings (RDP 1.5 m), clipped coarsely to the frame by dropping pieces fully outside it
function rdp(flat, eps) {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bd = eps;
    const [ax, az] = pts[a], [bx, bz] = pts[b], L = Math.hypot(bx - ax, bz - az);
    for (let i = a + 1; i < b; i++) {
      // (a closed ring starts and ends on the same point: there the distance to that point)
      const d = L < 1e-6 ? Math.hypot(pts[i][0] - ax, pts[i][1] - az) : Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L;
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]).flat();
}
const areas = [];
for (const w of woods) {
  let inside = false;
  for (let i = 0; i < w.rings[0].length; i += 2) if (inFrame(w.rings[0][i], w.rings[0][i + 1])) { inside = true; break; }
  if (!inside) continue;
  const rings = w.rings.map((r) => rdp(r, 1.5)).filter((r) => r.length >= 8);
  if (rings.length) areas.push({ kind: w.kind, rings });
}
const kinds = {};
for (const a of areas) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
log('wooded areas:', JSON.stringify(kinds));

const data = {
  source: 'swisstopo swissTLM3D (base vector tiles, OGD) — single trees and wooded areas; BAFU/WSL Lebensraumkarte der Schweiz, Gehölze (OGD) — heights, leaf type, shrubs',
  fetched: new Date().toISOString().slice(0, 10),
  trees, shrubs, areas
};
fs.writeFileSync(OUT, `// js/tlm-trees-data.js — GENERATED by tools/fetch-tlm-trees.mjs, do not edit by hand.\n// © swisstopo (swissTLM3D), © BAFU/WSL (Lebensraumkarte der Schweiz). trees/shrubs: [x, z, height m (0 unknown), evergreen 1/0/-1]\nexport const TLM_TREES = ${JSON.stringify(data)};\n`);
log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB)`);
