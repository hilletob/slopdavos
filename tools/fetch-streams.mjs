// tools/fetch-streams.mjs — writes js/streams-data.js: the streams of the mapped area (OSM waterway=river / stream /
// canal / ditch / drain lines, tools/data/q_davos_streams.overpassql): the Landwasser, the Dischmabach, Flüelabach and
// Sertigbach, the side creeks and ditches, as simplified polylines in the world frame, in the direction they flow (OSM
// draws waterways downstream). Left out: the stretches in culverts and tunnels (under the roads), those inside the
// water areas already drawn (DAVOS_DATA.water: the lakes, the Landwasser's mapped riverbed) and those beyond the map.
// Widths: OSM width, else by kind and name (js/streams.js draws them).
// usage: node tools/fetch-streams.mjs   (re-download: delete tools/data/cache/osm_davos_streams.json)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORLD_BOUNDS, lonLatToWorld } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, 'data', 'cache', 'osm_davos_streams.json');
const OUT = path.join(DIR, '..', 'js', 'streams-data.js');
const log = (...a) => console.log('[streams]', ...a);

if (!fs.existsSync(CACHE)) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  execFileSync('bash', [path.join(DIR, 'overpass.sh'), CACHE, path.join(DIR, 'data', 'q_davos_streams.overpassql')], { stdio: 'inherit' });
}
const osm = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const r1 = (v) => Math.round(v * 10) / 10;
const MAIN = /^(Landwasser|Dischmabach|Flüelabach|Sertigbach)$/;

// The water areas already drawn (rings flat [x, z, …]), for the point-in-polygon test
const areas = DAVOS_DATA.water.map((w) => {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < w.ring.length; i += 2) {
    box[0] = Math.min(box[0], w.ring[i]); box[1] = Math.min(box[1], w.ring[i + 1]);
    box[2] = Math.max(box[2], w.ring[i]); box[3] = Math.max(box[3], w.ring[i + 1]);
  }
  return { ring: w.ring, holes: w.holes || [], box };
});
const pip = (ring, x, z) => {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const inWater = (x, z) => areas.some((a) => x >= a.box[0] && x <= a.box[2] && z >= a.box[1] && z <= a.box[3] &&
  pip(a.ring, x, z) && !a.holes.some((h) => pip(h, x, z)));
const inFrame = (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;

// Douglas–Peucker on [{x, z}]
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let best = 0, at = 0;
  const a = pts[0], b = pts[pts.length - 1], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i].x - a.x) * dz - (pts[i].z - a.z) * dx) / L;
    if (d > best) { best = d; at = i; }
  }
  return best > eps ? [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)] : [a, b];
}

function widthOf(t) {
  const w = parseFloat(String(t.width || '').replace(',', '.'));
  if (Number.isFinite(w) && w > 0.3 && w < 40) return w;
  if (t.waterway === 'river') return t.name === 'Landwasser' ? 10 : 8;
  if (MAIN.test(t.name || '')) return 5;
  if (t.waterway === 'ditch' || t.waterway === 'drain') return 0.8;
  if (t.waterway === 'canal') return 3;
  return t.name ? 2.4 : 1.5;
}

const streams = [];
let culverts = 0, dropped = 0;
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type !== 'way' || !e.geometry) continue;
  if ((t.tunnel && t.tunnel !== 'no') || t.covered === 'yes' || t.location === 'underground') { culverts++; continue; }
  // Split the way where it leaves the map or enters a water area already drawn
  let run = [];
  const flush = () => {
    if (run.length >= 2) {
      const pts = rdp(run, t.waterway === 'river' ? 0.8 : 1.2);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      if (len >= 6) streams.push({ id: `w${e.id}`, name: t.name || '', kind: t.waterway, width: widthOf(t), intermittent: t.intermittent === 'yes' ? 1 : 0, pts: pts.flatMap((p) => [r1(p.x), r1(p.z)]) });
    }
    run = [];
  };
  // Densify to ~3 m first, so the cuts land close to the area edges
  const raw = e.geometry.map((p) => lonLatToWorld(p.lon, p.lat));
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i], b = raw[i + 1];
    const n = b ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3)) : 1;
    for (let k = 0; k < n; k++) {
      const p = b ? { x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n } : a;
      if (!inFrame(p.x, p.z) || inWater(p.x, p.z)) { dropped++; flush(); continue; }
      run.push(p);
    }
  }
  flush();
}
let total = 0;
for (const s of streams) for (let i = 2; i < s.pts.length; i += 2) total += Math.hypot(s.pts[i] - s.pts[i - 2], s.pts[i + 1] - s.pts[i - 1]);
const out = { source: 'OpenStreetMap contributors (ODbL), waterway=river/stream/canal/ditch/drain', fetched: new Date().toISOString().slice(0, 10), streams };
fs.writeFileSync(OUT, `// js/streams-data.js — GENERATED by tools/fetch-streams.mjs, do not edit by hand. © OpenStreetMap contributors (ODbL).\nexport const STREAMS = ${JSON.stringify(out)};\n`);
log(`${streams.length} stretches, ${(total / 1000).toFixed(1)} km (${culverts} culverts/tunnels left out, ${dropped} points in water areas or off the map) -> ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
