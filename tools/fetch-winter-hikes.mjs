// tools/fetch-winter-hikes.mjs — writes js/winter-hikes-data.js: the signposted winter hiking trails (Winterwanderwege)
// of Davos for js/winter-hikes.js. From the Federal Roads Office FEDRO/ASTRA's open dataset ch.astra.winterwanderwege
// on api3.geo.admin.ch (the SchweizMobil best-of selection plus the other signposted trails of the canton of Graubünden;
// opendata.swiss terms "open use, must provide the source": © ASTRA / swisstopo, SchweizMobil). It is the authority on
// the trails that are actually signposted and rolled each winter; OSM's piste:type=hike is patchier in Davos (and the
// Overpass servers were not answering when this was written). The snowshoe trails (ch.astra.schneeschuhwanderwege) are
// unprepared tracks through deep snow and are left out.
//
// Each trail is clipped to the map, resampled every ~4 m and flagged per segment where it runs on a carriageway or a
// bridge (`road`: a string of '0'/'1' per segment): the rolled strip is drawn only off the streets (on the meadows,
// the paths and the tracks), the walkers follow the whole line. Simplified to 0.5 m within each stretch.
// usage: node tools/fetch-winter-hikes.mjs   (re-download: delete tools/data/cache/astra_winterwanderwege.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME, WORLD_BOUNDS, lv95ToWorld } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { rdp, flat } from './osm-geometry.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, 'data', 'cache', 'astra_winterwanderwege.json');
const OUT = path.join(DIR, '..', 'js', 'winter-hikes-data.js');
const log = (...a) => console.log('[winter-hikes]', ...a);
const LAYER = 'ch.astra.winterwanderwege';

if (!fs.existsSync(CACHE)) {
  const box = FRAME.lv95.join(',');
  const url = `https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryEnvelope&geometry=${box}` +
    `&imageDisplay=1000,1000,96&mapExtent=${box}&tolerance=0&layers=all:${LAYER}&sr=2056&geometryFormat=geojson&limit=200`;
  log('fetching', url);
  const res = await fetch(url, { headers: { 'User-Agent': 'slop-davos data tool (three.js simulation)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json.results)) throw new Error('unexpected response');
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(json));
}
const { results } = JSON.parse(fs.readFileSync(CACHE, 'utf8'));

const [MIN_X, MIN_Z, MAX_X, MAX_Z] = WORLD_BOUNDS;
const INSET = 10;
const inside = ([x, z]) => x >= MIN_X + INSET && x <= MAX_X - INSET && z >= MIN_Z + INSET && z <= MAX_Z - INSET;
const pathLength = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };

// The stretches of a line inside the map (crossings found by bisection)
function clipLine(pts) {
  const pieces = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], inP = inside(p);
    if (i > 0 && inside(pts[i - 1]) !== inP) {
      let a = pts[i - 1], b = p;
      for (let k = 0; k < 24; k++) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (inside(m) === inside(a)) a = m; else b = m; }
      cur.push(inP ? b : a);
      if (!inP) { pieces.push(cur); cur = []; }
    }
    if (inP) cur.push(p);
  }
  if (cur.length) pieces.push(cur);
  return pieces.filter((q) => q.length >= 2 && pathLength(q) >= 60);
}

// Carriageways (and every bridge) in a 32 m grid
const CARRIAGEWAY = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(residential|unclassified|living_street|service)$/;
const CELL = 32;
const cells = new Map();
for (const r of DAVOS_DATA.roads) {
  if (r.tunnel || !(CARRIAGEWAY.test(r.kind) || r.bridge)) continue;
  const half = (r.width || 5) / 2 + 0.8;
  for (let i = 0; i + 3 < r.pts.length; i += 2) {
    const s = { ax: r.pts[i], az: r.pts[i + 1], bx: r.pts[i + 2], bz: r.pts[i + 3], half };
    for (let ix = Math.floor((Math.min(s.ax, s.bx) - half) / CELL); ix <= Math.floor((Math.max(s.ax, s.bx) + half) / CELL); ix++) {
      for (let iz = Math.floor((Math.min(s.az, s.bz) - half) / CELL); iz <= Math.floor((Math.max(s.az, s.bz) + half) / CELL); iz++) {
        const k = ix * 65536 + iz;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(s);
      }
    }
  }
}
function onRoad(x, z) {
  for (const s of cells.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL)) || []) {
    const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
    if (Math.hypot(s.ax + t * dx - x, s.az + t * dz - z) <= s.half) return true;
  }
  return false;
}

// Resampled every ~4 m, flagged per segment (its midpoint and both ends on a road), short flips smoothed out, then
// simplified per stretch of the same flag
function trailOf(piece) {
  const dense = [piece[0]];
  for (let i = 1; i < piece.length; i++) {
    const [ax, az] = piece[i - 1], [bx, bz] = piece[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
    for (let k = 1; k <= n; k++) dense.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  const flags = [];
  for (let i = 1; i < dense.length; i++) {
    const [ax, az] = dense[i - 1], [bx, bz] = dense[i];
    flags.push(onRoad(ax, az) && onRoad(bx, bz) && onRoad((ax + bx) / 2, (az + bz) / 2) ? 1 : 0);
  }
  // (stretches under ~12 m are noise: a road crossing, a path squeezing past a lane)
  for (let pass = 0; pass < 2; pass++) {
    let i = 0;
    while (i < flags.length) {
      let j = i;
      while (j < flags.length && flags[j] === flags[i]) j++;
      if (j - i < 3 && i > 0 && j < flags.length) for (let k = i; k < j; k++) flags[k] = flags[i - 1];
      i = j;
    }
  }
  const pts = [dense[0]], road = [];
  let i = 0;
  while (i < flags.length) {
    let j = i;
    while (j < flags.length && flags[j] === flags[i]) j++;
    // (in halves: a loop's ends meet, which would collapse it to a point)
    const mid = Math.floor((i + j) / 2);
    const run = j - i > 4 ? [...rdp(dense.slice(i, mid + 1), 0.5), ...rdp(dense.slice(mid, j + 1), 0.5).slice(1)] : dense.slice(i, j + 1);
    for (let k = 1; k < run.length; k++) { pts.push(run[k]); road.push(flags[i]); }
    i = j;
  }
  return { pts, road: road.join('') };
}

const trails = [];
for (const f of results) {
  const p = f.properties || {};
  const lines = f.geometry?.type === 'MultiLineString' ? f.geometry.coordinates : f.geometry?.type === 'LineString' ? [f.geometry.coordinates] : [];
  for (const line of lines) {
    const world = line.map(([E, N]) => { const w = lv95ToWorld(E, N); return [w.x, w.z]; });
    for (const piece of clipLine(world)) {
      const { pts, road } = trailOf(piece);
      trails.push({
        id: `astra${f.id}`,
        name: p.namer || p.label || '',
        ref: p.nrr || '',
        km: p.laenger ?? null, // the whole trail's official length
        mobil: p.chmurl_de ? 1 : 0, // a SchweizMobil route (the thick lines on the map)
        len: Math.round(pathLength(pts)),
        pts: flat(pts),
        road
      });
    }
  }
}

const data = {
  source: 'Bundesamt für Strassen ASTRA / swisstopo, ch.astra.winterwanderwege (SchweizMobil, Kanton Graubünden), opendata.swiss terms of use (open use, must provide the source)',
  fetched: new Date().toISOString().slice(0, 10),
  trails
};
fs.writeFileSync(OUT, `// js/winter-hikes-data.js — GENERATED by tools/fetch-winter-hikes.mjs, do not edit by hand.\n// The signposted winter hiking trails of Davos (world frame of js/davos-frame.js). © ASTRA / swisstopo, SchweizMobil.\nexport const WINTER_HIKES = ${JSON.stringify(data)};\n`);
const total = trails.reduce((s, t) => s + t.len, 0);
const offRoad = trails.reduce((s, t) => { let L = 0; for (let i = 0; i < t.road.length; i++) if (t.road[i] === '0') L += Math.hypot(t.pts[i * 2 + 2] - t.pts[i * 2], t.pts[i * 2 + 3] - t.pts[i * 2 + 1]); return s + L; }, 0);
log(`${trails.length} trails from ${results.length} features: ${(total / 1000).toFixed(1)} km in the map, ${(offRoad / 1000).toFixed(1)} km off the streets (rolled strip)`);
for (const t of trails) log(`  ${t.id} ${t.name}: ${t.len} m, ${t.pts.length / 2} vertices`);
log(`wrote ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes)`);
