// tools/ground-aerial.mjs — the aerial crops tools/trace-ground.mjs reads: a rectangle of the federal WMS
// (ch.swisstopo.swissimage, EPSG:2056) at 0.1 m (coarser for very large ones), cached as JPEG in
// tools/data/cache/ground-aerial/, with the helpers between world and pixel coordinates.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { worldToLv95 } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const CACHE = path.join(DIR, 'data', 'cache', 'ground-aerial');
const WMS = 'https://wms.geo.admin.ch/';
const RES = 0.1, MAX_PX = 3800, CONCURRENCY = 4;
fs.mkdirSync(CACHE, { recursive: true });

export const bboxOf = (ring) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < ring.length; i += 2) { b[0] = Math.min(b[0], ring[i]); b[1] = Math.min(b[1], ring[i + 1]); b[2] = Math.max(b[2], ring[i]); b[3] = Math.max(b[3], ring[i + 1]); }
  return b;
};

async function fetchRetry(url, file) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url).catch((error) => ({ ok: false, status: error.message }));
    if (res.ok && /^image\//.test(res.headers.get('content-type') || '')) { fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); return; }
    if (attempt === 4) throw new Error(`${url}: ${res.status}`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

/** The crop of [x0, z0, x1, z1] for `id`: { id, img, cls, res, x0, z0, w, h, buildings (px), px(flat ring), url } */
export function cropJob(id, [x0, z0, x1, z1], { res: wanted = RES } = {}) {
  const res = Math.max(wanted, (x1 - x0) / MAX_PX, (z1 - z0) / MAX_PX);
  const w = Math.round((x1 - x0) / res), h = Math.round((z1 - z0) / res);
  const sw = worldToLv95(x0, z1), ne = worldToLv95(x1, z0); // world z grows to the south
  const key = `${x0}_${z0}_${x1}_${z1}`.replace(/\./g, 'p');
  const img = path.join(CACHE, `${id}-${key}-${res.toFixed(3)}.jpg`);
  const px = (ring) => { const out = []; for (let i = 0; i < ring.length; i += 2) out.push([(ring[i] - x0) / res, (ring[i + 1] - z0) / res]); return out; };
  const buildings = DAVOS_DATA.buildings.filter((b) => { const bb = bboxOf(b.ring); return bb[2] > x0 && bb[0] < x1 && bb[3] > z0 && bb[1] < z1; }).map((b) => px(b.ring));
  return {
    id, img, cls: img.replace(/\.jpg$/, '.cls'), res, x0, z0, w, h, buildings, px,
    url: `${WMS}?${new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'ch.swisstopo.swissimage', STYLES: '', CRS: 'EPSG:2056',
      BBOX: `${sw.E},${sw.N},${ne.E},${ne.N}`, WIDTH: String(w), HEIGHT: String(h), FORMAT: 'image/jpeg'
    })}`
  };
}

/** Fetches the crops not cached yet, a few at a time */
export async function fetchCrops(jobs, log = () => {}) {
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      if (!fs.existsSync(j.img)) { await fetchRetry(j.url, j.img); log('fetched', path.basename(j.img)); }
    }
  }));
}
