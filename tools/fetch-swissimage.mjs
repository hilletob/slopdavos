// tools/fetch-swissimage.mjs — writes data/swissimage/: the swisstopo SWISSIMAGE orthophoto mosaic draped on the terrain,
// one image per terrain mesh chunk (js/terrain.js buildTerrainMeshes: 64 cells of FRAME.terrainCell metres), read from the
// federal WMS (wms.geo.admin.ch, layer ch.swisstopo.swissimage, open government data) and re-encoded as WebP (cwebp).
// The resolution follows the lowest ground of the chunk: 0.5 m on the valley floor (where one walks and drives), 1 m on
// the lower slopes, 2 m above ~1900 m. Each image reaches MARGIN metres beyond its chunk, so that a roof straddling two
// chunks (js/swissbuildings3d.js drapes the roofs with the image of the chunk under their centre) stays inside one image.
// Writes data/swissimage/index.json ({ chunk, margin, tiles: [{ f, i0, j0, x0, z0, x1, z1, res }] }: the image extents in
// world coordinates, margin included) and
// data/swissimage/<i0>-<j0>.webp. Raw JPEGs are cached in tools/data/cache/swissimage/.
// usage: node tools/fetch-swissimage.mjs [--hires]   (needs cwebp: brew install webp)
// --hires: the high-resolution profile, generated locally and not committed (data/hires/ is ignored by git): 0.25 m on
// the valley floor, 0.5 m on the lower slopes, 1 m higher up, into data/hires/swissimage/. The browser prefers it near
// the camera when it is there (js/swissimage.js) and falls back to data/swissimage/ otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FRAME, worldToLv95 } from '../js/davos-frame.js';
import { parseTerrain } from '../js/terrain-grid.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HIRES = process.argv.includes('--hires');
const OUT = path.join(DIR, '..', 'data', ...(HIRES ? ['hires', 'swissimage'] : ['swissimage']));
const CACHE = path.join(DIR, 'data', 'cache', 'swissimage');
const WMS = 'https://wms.geo.admin.ch/';
const CHUNK = 64, MARGIN = 32, QUALITY = 65, CONCURRENCY = 6;
const log = (...a) => console.log('[swissimage]', ...a);
fs.mkdirSync(CACHE, { recursive: true });

const file = fs.readFileSync(path.join(DIR, '..', 'data', 'davos-terrain.bin'));
const T = parseTerrain(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

// The same chunks as buildTerrainMeshes
const tiles = [];
for (let j0 = 0; j0 < T.rows - 1; j0 += CHUNK) for (let i0 = 0; i0 < T.cols - 1; i0 += CHUNK) {
  const i1 = Math.min(i0 + CHUNK, T.cols - 1), j1 = Math.min(j0 + CHUNK, T.rows - 1);
  let lo = Infinity;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) lo = Math.min(lo, T.heights[j * T.cols + i] + FRAME.H0);
  const res = (lo < 1650 ? 0.5 : lo < 1900 ? 1 : 2) / (HIRES ? 2 : 1);
  tiles.push({ f: `${i0}-${j0}.webp`, i0, j0, x0: T.minX + i0 * T.cell - MARGIN, z0: T.minZ + j0 * T.cell - MARGIN, x1: T.minX + i1 * T.cell + MARGIN, z1: T.minZ + j1 * T.cell + MARGIN, res });
}
log(`${tiles.length} chunks:`, (HIRES ? ['0.25', '0.5', '1'] : ['0.5', '1', '2']).map((r) => `${tiles.filter((t) => String(t.res) === r).length} at ${r} m`).join(', '));

async function fetchRetry(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url).catch((error) => ({ ok: false, status: error.message }));
    if (res.ok && /^image\//.test(res.headers.get('content-type') || '')) return Buffer.from(await res.arrayBuffer());
    if (attempt === 4) throw new Error(`${url}: ${res.status}`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

// Download into a staging directory, then swap it in
const staging = `${OUT}.staging`;
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
let next = 0, done = 0, bytes = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < tiles.length) {
    const t = tiles[next++];
    // World z grows to the south: the chunk's north edge is z0
    const sw = worldToLv95(t.x0, t.z1), ne = worldToLv95(t.x1, t.z0);
    const w = Math.round((t.x1 - t.x0) / t.res), h = Math.round((t.z1 - t.z0) / t.res);
    const jpg = path.join(CACHE, `${t.i0}-${t.j0}-${t.res}-m${MARGIN}.jpg`);
    if (!fs.existsSync(jpg)) {
      const params = new URLSearchParams({
        SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'ch.swisstopo.swissimage', STYLES: '', CRS: 'EPSG:2056',
        BBOX: `${sw.E},${sw.N},${ne.E},${ne.N}`, WIDTH: String(w), HEIGHT: String(h), FORMAT: 'image/jpeg'
      });
      fs.writeFileSync(jpg, await fetchRetry(`${WMS}?${params}`));
    }
    const webp = path.join(staging, t.f);
    execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), '-m', '6', jpg, '-o', webp]);
    bytes += fs.statSync(webp).size;
    if (++done % 50 === 0) log(`${done}/${tiles.length}`);
  }
}));
fs.writeFileSync(path.join(staging, 'index.json'), JSON.stringify({
  source: 'swisstopo SWISSIMAGE (WMS ch.swisstopo.swissimage)', fetched: new Date().toISOString().slice(0, 10), chunk: CHUNK, margin: MARGIN, tiles
}));
fs.rmSync(OUT, { recursive: true, force: true });
fs.renameSync(staging, OUT);
log(`stored ${tiles.length} images, ${(bytes / 1048576).toFixed(1)} MB -> ${OUT}`);
