// tools/fetch-ski-pistes.mjs — writes js/ski-pistes-data.js: the downhill ski runs of Davos for js/ski-pistes.js and
// js/winter-sports.js. From OpenStreetMap (tools/data/q_davos_ski_pistes.overpassql): piste:type=downhill ways (the
// runs' centre lines) and areas (closed ways, area=yes, multipolygons: nursery slopes, wide open bowls), with
// piste:difficulty (novice / easy = blue, intermediate = red, advanced = black, freeride = the unprepared Skirouten),
// ref and name. swisstopo publishes no vector layer of the pistes (only the raster winter map,
// ch.swisstopo.pixelkarte-farbe-winter; checked in api3.geo.admin.ch SearchServer / MapServer and the STAC catalogue).
//
// Runs are clipped to the map, simplified, oriented downhill (on the swissALTI3D grid, data/davos-terrain.bin), sorted
// into their ski area (Parsenn, Jakobshorn, Schatzalp/Strela, Rinerhorn, Bünda, Pischa) and linked: `next` lists where a skier
// arriving at a run's foot can carry on ([run index, vertex index] of the runs passing within 30 m, further down).
// usage: node tools/fetch-ski-pistes.mjs   (re-download: delete tools/data/cache/osm_davos_ski_pistes.json)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORLD_BOUNDS } from '../js/davos-frame.js';
import { parseTerrain, gridHeight } from '../js/terrain-grid.js';
import { geomPts, flat, rdp, polygons, clipToFrame, cleanRing, ringArea } from './osm-geometry.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, 'data', 'cache', 'osm_davos_ski_pistes.json');
const OUT = path.join(DIR, '..', 'js', 'ski-pistes-data.js');
const log = (...a) => console.log('[ski-pistes]', ...a);

if (!fs.existsSync(CACHE)) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  execFileSync('bash', [path.join(DIR, 'overpass.sh'), CACHE, path.join(DIR, 'data', 'q_davos_ski_pistes.overpassql')], { stdio: 'inherit' });
}
const osm = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const terrainFile = fs.readFileSync(path.join(DIR, '..', 'data', 'davos-terrain.bin'));
const TERRAIN = parseTerrain(terrainFile.buffer.slice(terrainFile.byteOffset, terrainFile.byteOffset + terrainFile.byteLength));
const height = (x, z) => gridHeight(TERRAIN, x, z);
const [MIN_X, MIN_Z, MAX_X, MAX_Z] = WORLD_BOUNDS;
const INSET = 10;
const inside = ([x, z]) => x >= MIN_X + INSET && x <= MAX_X - INSET && z >= MIN_Z + INSET && z <= MAX_Z - INSET;
const DIFFICULTIES = ['novice', 'easy', 'intermediate', 'advanced', 'freeride'];
// Prepared widths (m) by difficulty; runs along roads and tracks (Schlittel- and Talabfahrten on the Alp roads) are
// as wide as the road
const WIDTH = { novice: 30, easy: 26, intermediate: 26, advanced: 22, freeride: 14 };

// The ski area a point belongs to (world frame; the areas lie far enough apart for boxes)
function region(x, z) {
  if (x > 3000 && z < 1000) return 'pischa'; // (Pischa and the Flüela side: only a freeride route reaches the map)
  if (x < -300 && z > -1800 && z < 300) return 'schatzalp';
  if (z < -1500 && x < 3000) return 'parsenn';
  if (x > 800 && z >= -1500 && z < 0) return 'bunda';
  if (z > 4300 && x < 0) return 'rinerhorn';
  if (x > -1200 && z >= -300 && z < 5000) return 'jakobshorn';
  return 'davos';
}

const pathLength = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
// The stretches of a line inside the map (clipped at the frame, crossing points interpolated)
function clipLine(pts) {
  const pieces = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], inP = inside(p);
    if (i > 0 && inside(pts[i - 1]) !== inP) {
      // (the crossing, found by bisection: the frame is a box)
      let a = pts[i - 1], b = p;
      for (let k = 0; k < 24; k++) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (inside(m) === inside(a)) a = m; else b = m; }
      cur.push(inP ? b : a);
      if (!inP) { pieces.push(cur); cur = []; }
    }
    if (inP) cur.push(p);
  }
  if (cur.length) pieces.push(cur);
  return pieces.filter((q) => q.length >= 2 && pathLength(q) >= 40);
}

const runs = [], areas = [];
const skipped = { abandoned: 0, outside: 0, tiny: 0 };
for (const e of osm.elements) {
  const t = e.tags || {};
  if (t['piste:type'] !== 'downhill') continue;
  if (t.abandoned === 'yes' || t['piste:abandoned'] === 'yes' || t['abandoned:piste:type']) { skipped.abandoned++; continue; }
  const d = DIFFICULTIES.includes(t['piste:difficulty']) ? t['piste:difficulty'] : t['piste:difficulty'] === 'expert' ? 'advanced' : 'easy';
  const ref = t['piste:ref'] || t.ref || '';
  const name = t['piste:name'] || t.name || '';
  const groomed = d !== 'freeride' && !/backcountry|mogul/.test(t['piste:grooming'] || '');
  const g = e.type === 'way' ? geomPts(e.geometry) : [];
  const isClosed = g.length > 3 && Math.hypot(g[0][0] - g.at(-1)[0], g[0][1] - g.at(-1)[1]) < 0.3;
  if (e.type === 'relation' || t.area === 'yes' || (isClosed && t.area !== 'no' && !t.highway)) {
    for (const poly of polygons(e)) {
      const ring = clipToFrame(cleanRing(poly.ring, 1), -INSET);
      if (ring.length < 3) { skipped.outside++; continue; }
      if (Math.abs(ringArea(ring)) < 200) { skipped.tiny++; continue; }
      const ccw = ringArea(ring) > 0 ? ring : ring.slice().reverse();
      const cx = ccw.reduce((s, p) => s + p[0], 0) / ccw.length, cz = ccw.reduce((s, p) => s + p[1], 0) / ccw.length;
      areas.push({
        id: `${e.type[0]}${e.id}`, d, ref, name, region: region(cx, cz), groomed,
        ring: flat(ccw),
        holes: poly.holes.map((h) => clipToFrame(cleanRing(h, 1), -INSET)).filter((h) => h.length >= 3).map(flat)
      });
    }
    continue;
  }
  if (g.length < 2) continue;
  const roadWidth = Number.parseFloat(t.width);
  const w = t.highway ? Math.min(14, Math.max(6, Number.isFinite(roadWidth) ? roadWidth + 2 : 8)) : WIDTH[d];
  const pieces = clipLine(rdp(g, 1));
  if (!pieces.length) { skipped.outside++; continue; }
  for (const piece of pieces) {
    // Downhill: the start higher than the end (OSM draws most runs top to bottom, not all)
    const p = height(...piece[0]) >= height(...piece.at(-1)) ? piece : piece.slice().reverse();
    const mid = p[Math.floor(p.length / 2)];
    runs.push({ id: `w${e.id}`, d, ref, name, region: region(mid[0], mid[1]), groomed, w, road: t.highway ? 1 : 0, len: Math.round(pathLength(p)), drop: Math.round(height(...p[0]) - height(...p.at(-1))), pts: flat(p) });
  }
}

// Links: from each run's foot, the runs that carry on (passing within 30 m, at a vertex lower than the foot)
for (const [ri, r] of runs.entries()) {
  const ex = r.pts.at(-2), ez = r.pts.at(-1), ey = height(ex, ez);
  const next = [];
  for (const [oi, o] of runs.entries()) {
    if (oi === ri) continue;
    let best = -1, bd = 30;
    for (let i = 0; i + 2 < o.pts.length; i += 2) {
      const dd = Math.hypot(o.pts[i] - ex, o.pts[i + 1] - ez);
      if (dd < bd && height(o.pts[i], o.pts[i + 1]) <= ey + 3) { bd = dd; best = i / 2; }
    }
    if (best >= 0) next.push([oi, best]);
  }
  r.next = next;
}

const data = {
  source: 'OpenStreetMap contributors (ODbL), piste:type=downhill',
  fetched: new Date().toISOString().slice(0, 10),
  difficulties: DIFFICULTIES,
  runs,
  areas
};
fs.writeFileSync(OUT, `// js/ski-pistes-data.js — GENERATED by tools/fetch-ski-pistes.mjs, do not edit by hand.\n// The downhill ski runs of Davos (world frame of js/davos-frame.js). © OpenStreetMap contributors (ODbL).\nexport const SKI_PISTES = ${JSON.stringify(data)};\n`);
const byRegion = {};
for (const r of runs) byRegion[r.region] = (byRegion[r.region] || 0) + 1;
const byD = {};
for (const r of runs) byD[r.d] = (byD[r.d] || 0) + 1;
log(`${runs.length} runs (${Math.round(runs.reduce((s, r) => s + r.len, 0) / 100) / 10} km; ${JSON.stringify(byD)}; ${JSON.stringify(byRegion)}), ${areas.length} areas; ${runs.filter((r) => r.next.length).length} runs linked onwards; skipped ${JSON.stringify(skipped)}`);
log(`wrote ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes)`);
