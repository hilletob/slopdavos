// tools/geoadmin.mjs — every feature of a geo.admin.ch layer inside an LV95 box, through api3's identify service.
// identify answers with at most 200 features, so a box that comes back full is split in four and asked again
// (features are deduplicated by their id). The answer is cached in tools/data/cache/<name>.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LIMIT = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(layer, box) {
  const b = box.join(',');
  const url = `https://api3.geo.admin.ch/rest/services/all/MapServer/identify?geometryType=esriGeometryEnvelope&geometry=${b}` +
    `&imageDisplay=1000,1000,96&mapExtent=${b}&tolerance=0&layers=all:${layer}&sr=2056&geometryFormat=geojson&limit=${LIMIT}&lang=de`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'geodata fetch tool' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.results)) throw new Error('unexpected response');
      return json.results;
    } catch (e) {
      if (attempt >= 4) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
}

/**
 * The features (GeoJSON geometry in LV95, `properties`, `id`) of `layer` in `box` [minE, minN, maxE, maxN].
 * `minSize`: boxes are not split below this edge length (m); a full box that small is taken as it is.
 */
export async function layerFeatures(layer, box, { cache, refresh = false, minSize = 250, log = () => {} } = {}) {
  const file = cache && path.join(DIR, 'data', 'cache', `${cache}.json`);
  if (file && !refresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).results;
  const byId = new Map();
  const queue = [box];
  let asked = 0, full = 0;
  while (queue.length) {
    const b = queue.pop();
    const results = await ask(layer, b);
    asked++;
    const w = b[2] - b[0], h = b[3] - b[1];
    if (results.length >= LIMIT && Math.max(w, h) > minSize) {
      const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
      queue.push([b[0], b[1], mx, my], [mx, b[1], b[2], my], [b[0], my, mx, b[3]], [mx, my, b[2], b[3]]);
      continue;
    }
    if (results.length >= LIMIT) full++;
    for (const f of results) byId.set(String(f.id ?? f.featureId), f);
    if (asked % 20 === 0) log(`${layer}: ${asked} boxes asked, ${byId.size} features`);
  }
  const results = [...byId.values()];
  log(`${layer}: ${results.length} features from ${asked} boxes${full ? ` (${full} boxes still full at ${minSize} m)` : ''}`);
  if (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ layer, box, fetched: new Date().toISOString().slice(0, 10), results }));
  }
  return results;
}

/** The lines of a feature as arrays of [E, N(, H)] */
export function linesOf(f) {
  const g = f.geometry;
  if (!g) return [];
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  return [];
}
