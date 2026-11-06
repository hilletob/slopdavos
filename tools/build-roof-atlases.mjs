// tools/build-roof-atlases.mjs — writes data/roofs/: sharp SWISSIMAGE crops of the roofs, one atlas per swissBUILDINGS3D
// tile, for the browser to drape on the roofs of the tiles near the camera (the terrain orthophotos, data/swissimage/,
// stay at 0.5-2 m). Per tile, the buildings' centres come from the b3dm batch tables (Latitude, Longitude); each takes
// the bounding box of the OSM footprint it stands in (js/davos-geodata.js), or 24 m square, plus 2 m, snapped to the
// RES grid; overlapping boxes merge. The imagery of a tile is read in one WMS GetMap (wms.geo.admin.ch, layer
// ch.swisstopo.swissimage, open government data) over the union of its boxes, or several when that exceeds 4000 px;
// the crops are shelf-packed into atlas pages of at most 2048 px (tools/roof-atlas.py composes them with PIL, WebP 70).
// Writes data/roofs/index.json:
//   { source, res, fetched, tiles: { <b3dm tile u>: [{ f, w, h, rects: [[x0, z0, x1, z1, px, py, pw, ph], ...] }] } }
// rects in world coordinates (z0 the north edge), [px, py, pw, ph] their pixel box (top-left, the top row north).
// Raw JPEGs are cached in tools/data/cache/roofs/.
// Also writes `ground: { <b3dm tile u>: [batch index, ...] }`: the buildings whose patch of orthophoto looks like ground
// (tools/roof-ground.py: mostly meadow, garden or trees inside the OSM footprint the building's centre stands in, else a
// disc of GROUND_DISC m round it): buildings newer than the photo, or ones it misses. Their roofs keep the procedural
// roof colour instead of a lawn (js/swissbuildings3d.js).
// usage: node tools/build-roof-atlases.mjs [--hires] [--ground]   (needs python3 with PIL)
// --hires: 0.1 m crops into data/hires/roofs/ (not committed; the browser prefers them when present, js/swissbuildings3d.js)
// --ground: only (re)computes `ground` from the cached images into the existing index.json (no download, no atlases)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORLD_BOUNDS, worldToLv95, lonLatToWorld } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..');
const BUILDINGS = path.join(ROOT, 'data', 'swissbuildings3d');
const HIRES = process.argv.includes('--hires'), GROUND_ONLY = process.argv.includes('--ground');
const OUT = path.join(ROOT, 'data', ...(HIRES ? ['hires', 'roofs'] : ['roofs']));
const CACHE = path.join(DIR, 'data', 'cache', 'roofs');
const WMS = 'https://wms.geo.admin.ch/';
const RES = HIRES ? 0.1 : 0.125, MARGIN = 2, DEFAULT = 24, MAX_REQUEST = 4000, PAGE = 2048, QUALITY = 70, CONCURRENCY = 6;
// A building counts as ground when at least GROUND_SHARE of its patch is vegetation (and the patch has 200+ pixels)
const GROUND_SHARE = 0.5, GROUND_DISC = 4;
const log = (...a) => console.log('[roofs]', ...a);
fs.mkdirSync(CACHE, { recursive: true });
const started = Date.now();

// --- OSM footprints, bucketed for lookup ------------------------------------------------------------------------------------
const CELL = 64, footprints = new Map();
for (const b of DAVOS_DATA.buildings) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < b.ring.length; i += 2) {
    x0 = Math.min(x0, b.ring[i]); x1 = Math.max(x1, b.ring[i]); z0 = Math.min(z0, b.ring[i + 1]); z1 = Math.max(z1, b.ring[i + 1]);
  }
  const f = { ring: b.ring, box: [x0, z0, x1, z1] };
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
    const k = `${i},${j}`;
    if (!footprints.has(k)) footprints.set(k, []);
    footprints.get(k).push(f);
  }
}
const inRing = (ring, x, z) => {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
function footprintBox(x, z) {
  const list = footprints.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || [];
  const hit = list.find((f) => inRing(f.ring, x, z)) || list.find((f) => x >= f.box[0] && x <= f.box[2] && z >= f.box[1] && z <= f.box[3]);
  return hit || null;
}

// --- Per tile: building boxes, merged ----------------------------------------------------------------------------------------
function batchTable(file) {
  const b = fs.readFileSync(file);
  const ftj = b.readUInt32LE(12), ftb = b.readUInt32LE(16), btj = b.readUInt32LE(20);
  return btj ? JSON.parse(b.toString('utf8', 28 + ftj + ftb, 28 + ftj + ftb + btj)) : {};
}
const snap = (v, up) => (up ? Math.ceil(v / RES) : Math.floor(v / RES)) * RES;
const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

const index = JSON.parse(fs.readFileSync(path.join(BUILDINGS, 'index.json'), 'utf8'));
const jobs = [], patches = []; // patches: { u, b, x, z, ring } (world), for the ground test
let buildings = 0, skipped = 0;
for (const t of index.tiles) {
  const bt = batchTable(path.join(BUILDINGS, index.base, t.u));
  const lat = bt.Latitude, lon = bt.Longitude;
  if (!Array.isArray(lat) || !Array.isArray(lon)) { skipped++; continue; }
  let rects = [];
  for (let i = 0; i < lat.length; i++) {
    if (!Number.isFinite(lat[i]) || !Number.isFinite(lon[i])) continue;
    const { x, z } = lonLatToWorld(lon[i], lat[i]);
    const hit = footprintBox(x, z);
    const [x0, z0, x1, z1] = hit ? hit.box : [x - DEFAULT / 2, z - DEFAULT / 2, x + DEFAULT / 2, z + DEFAULT / 2];
    const disc = [];
    for (let k = 0; k < 16; k++) disc.push(x + GROUND_DISC * Math.cos(k * Math.PI / 8), z + GROUND_DISC * Math.sin(k * Math.PI / 8));
    patches.push({ u: t.u, b: i, x, z, ring: hit && inRing(hit.ring, x, z) ? hit.ring : disc });
    const r = [snap(Math.max(minX, x0 - MARGIN)), snap(Math.max(minZ, z0 - MARGIN)), snap(Math.min(maxX, x1 + MARGIN), true), snap(Math.min(maxZ, z1 + MARGIN), true)];
    if (r[2] <= r[0] || r[3] <= r[1]) continue;
    rects.push(r);
    buildings++;
  }
  // Merge overlapping boxes until none overlap
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < rects.length && !merged; i++) for (let j = i + 1; j < rects.length; j++) {
      if (!overlap(rects[i], rects[j])) continue;
      const a = rects[i], b = rects[j];
      rects[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
      rects.splice(j, 1);
      merged = true;
      break;
    }
  }
  if (rects.length) jobs.push({ u: t.u, rects });
}
log(`${jobs.length} tiles with roofs, ${buildings} buildings (${skipped} tiles without Latitude/Longitude)`);

// --- Requests: the union of a tile's boxes, or groups of them on a 500 m grid ----------------------------------------------
const union = (rs) => [Math.min(...rs.map((r) => r[0])), Math.min(...rs.map((r) => r[1])), Math.max(...rs.map((r) => r[2])), Math.max(...rs.map((r) => r[3]))];
const fits = (b) => (b[2] - b[0]) / RES <= MAX_REQUEST && (b[3] - b[1]) / RES <= MAX_REQUEST;
const requests = []; // { file, box, rects }
for (const job of jobs) {
  let groups = [job.rects];
  if (!fits(union(job.rects))) {
    const cells = new Map(), span = MAX_REQUEST * RES * 0.9;
    for (const r of job.rects) {
      const k = `${Math.floor((r[0] + r[2]) / 2 / span)},${Math.floor((r[1] + r[3]) / 2 / span)}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(r);
    }
    groups = [];
    for (const g of cells.values()) if (fits(union(g))) groups.push(g); else for (const r of g) groups.push([r]);
  }
  job.requests = groups.map((g, i) => {
    const box = union(g), id = job.u.replace(/\.b3dm$/, '').replace(/[/]/g, '-');
    const req = { file: path.join(CACHE, `${id}-${i}${HIRES ? '-hires' : ''}.jpg`), box, rects: g };
    requests.push(req);
    return req;
  });
}

// --- Ground test: per building, the vegetation share of its patch in the request image that holds its centre --------------
const requestsOf = new Map(jobs.map((j) => [j.u, j.requests]));
function groundTest() {
  const tests = [];
  for (const p of patches) {
    const req = requestsOf.get(p.u)?.find((r) => p.x >= r.box[0] && p.x <= r.box[2] && p.z >= r.box[1] && p.z <= r.box[3]);
    if (!req || !fs.existsSync(req.file)) continue;
    const ring = [];
    for (let i = 0; i < p.ring.length; i += 2) ring.push((p.ring[i] - req.box[0]) / RES, (p.ring[i + 1] - req.box[1]) / RES);
    tests.push({ p, job: { src: req.file, ring } });
  }
  const ground = {};
  let count = 0;
  for (let i = 0; i < tests.length; i += 2000) {
    const batch = tests.slice(i, i + 2000);
    const res = spawnSync('python3', [path.join(DIR, 'roof-ground.py')], { input: JSON.stringify(batch.map((t) => t.job)), maxBuffer: 1 << 26 });
    if (res.status !== 0) throw new Error(`roof-ground.py: ${res.stderr}`);
    JSON.parse(res.stdout).forEach(([share, pixels], k) => {
      if (share < GROUND_SHARE || pixels < 200) return;
      const { u, b } = batch[k].p;
      (ground[u] ??= []).push(b);
      count++;
    });
  }
  log(`ground test: ${count} of ${tests.length} buildings look like ground in the orthophoto (procedural roofs)`);
  return ground;
}
if (GROUND_ONLY) {
  const file = path.join(OUT, 'index.json'), out = JSON.parse(fs.readFileSync(file, 'utf8'));
  out.ground = groundTest();
  fs.writeFileSync(file, JSON.stringify(out));
  process.exit(0);
}

async function fetchRetry(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url).catch((error) => ({ ok: false, status: error.message }));
    if (res.ok && /^image\//.test(res.headers.get('content-type') || '')) return Buffer.from(await res.arrayBuffer());
    if (attempt === 4) throw new Error(`${url}: ${res.status}`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < requests.length) {
    const req = requests[next++];
    if (!fs.existsSync(req.file)) {
      const [x0, z0, x1, z1] = req.box, sw = worldToLv95(x0, z1), ne = worldToLv95(x1, z0);
      const params = new URLSearchParams({
        SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'ch.swisstopo.swissimage', STYLES: '', CRS: 'EPSG:2056',
        BBOX: `${sw.E},${sw.N},${ne.E},${ne.N}`, WIDTH: String(Math.round((x1 - x0) / RES)), HEIGHT: String(Math.round((z1 - z0) / RES)), FORMAT: 'image/jpeg'
      });
      fs.writeFileSync(req.file, await fetchRetry(`${WMS}?${params}`));
    }
    if (++done % 100 === 0) log(`fetched ${done}/${requests.length}`);
  }
}));
log(`${requests.length} WMS images`);

// --- Shelf packing into pages ---------------------------------------------------------------------------------------------------
const staging = `${OUT}.staging`;
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
const tiles = {}, composeJobs = [];
let pages = 0, shrunk = 0;
for (const job of jobs) {
  const items = [];
  for (const req of job.requests) for (const r of req.rects) {
    let pw = Math.round((r[2] - r[0]) / RES), ph = Math.round((r[3] - r[1]) / RES);
    // A box wider than a page (a very large building) is scaled down to fit
    const k = Math.min(1, (PAGE - 2) / pw, (PAGE - 2) / ph);
    if (k < 1) { pw = Math.floor(pw * k); ph = Math.floor(ph * k); shrunk++; }
    items.push({ r, req, pw, ph });
  }
  items.sort((a, b) => b.ph - a.ph);
  const id = job.u.replace(/\.b3dm$/, '').replace(/[/]/g, '-');
  const out = [];
  let page = null;
  const open = () => { page = { items: [], x: 0, y: 0, shelf: 0, w: 0, h: 0 }; out.push(page); };
  open();
  for (const it of items) {
    const sw = it.pw + 2, sh = it.ph + 2;
    if (page.x + sw > PAGE) { page.y += page.shelf; page.x = 0; page.shelf = 0; }
    if (page.y + sh > PAGE) open();
    it.px = page.x + 1; it.py = page.y + 1;
    page.x += sw; page.shelf = Math.max(page.shelf, sh);
    page.w = Math.max(page.w, page.x); page.h = Math.max(page.h, page.y + page.shelf);
    page.items.push(it);
  }
  tiles[job.u] = out.map((p, n) => {
    const f = `${id}-${n}.webp`;
    pages++;
    composeJobs.push({
      out: path.join(staging, f), w: p.w, h: p.h, quality: QUALITY,
      items: p.items.map((it) => {
        // Source pixels: the rect plus one RES pixel each side, in the request's image
        const [bx0, bz0] = it.req.box, s = 1 / RES;
        return { src: it.req.file, box: [Math.round((it.r[0] - bx0) * s) - 1, Math.round((it.r[1] - bz0) * s) - 1, Math.round((it.r[2] - bx0) * s) + 1, Math.round((it.r[3] - bz0) * s) + 1], at: [it.px - 1, it.py - 1], size: [it.pw + 2, it.ph + 2] };
      })
    });
    return { f, w: p.w, h: p.h, rects: p.items.map((it) => [...it.r.map((v) => Math.round(v * 1000) / 1000), it.px, it.py, it.pw, it.ph]) };
  });
}
// Compose in batches (PIL)
for (let i = 0; i < composeJobs.length; i += 100) {
  const res = spawnSync('python3', [path.join(DIR, 'roof-atlas.py')], { input: JSON.stringify(composeJobs.slice(i, i + 100)), maxBuffer: 1 << 26 });
  if (res.status !== 0) throw new Error(`roof-atlas.py: ${res.stderr}`);
  log(`composed ${Math.min(i + 100, composeJobs.length)}/${composeJobs.length} pages`);
}
fs.writeFileSync(path.join(staging, 'index.json'), JSON.stringify({
  source: 'swisstopo SWISSIMAGE (WMS), roof crops', res: RES, fetched: new Date().toISOString().slice(0, 10), tiles, ground: groundTest()
}));
fs.rmSync(OUT, { recursive: true, force: true });
fs.renameSync(staging, OUT);
const bytes = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
log(`stored ${pages} atlas pages for ${Object.keys(tiles).length} tiles (${buildings} buildings, ${shrunk} boxes scaled down), ` +
  `${(bytes / 1048576).toFixed(1)} MB -> ${OUT} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
