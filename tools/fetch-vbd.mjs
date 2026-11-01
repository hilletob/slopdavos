// tools/fetch-vbd.mjs — writes js/vbd-data.js: the bus lines of the Verkehrsbetrieb Davos (VBD) from OpenStreetMap's
// public transport relations (route=bus, operator VBD; PTv2: the ways in driving order, then the stops), clipped to the
// world frame (js/davos-frame.js). Each variant (one direction of one line, e.g. 301 Glaris – Wolfgang) becomes a
// polyline in world coordinates along the mapped roads, with its stops as distances along it. The ways' geometry is
// taken from js/davos-geodata.js (roads[].pts, the same OSM ways with their bends rounded into arcs, as the asphalt is
// laid and the traffic's lanes run, tools/build-davos-geodata.mjs), falling back to the way as mapped where the
// geodata doesn't carry it: so the buses stay in their lane round the bends instead of cutting the corners.
// usage: node tools/fetch-vbd.mjs   (raw Overpass response cached in tools/data/cache/vbd_routes.json)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { geomPts, inFrame, rdp, flat } from './osm-geometry.mjs';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, 'data', 'cache');
const RAW = path.join(CACHE, 'vbd_routes.json');
const OUT = path.join(DIR, '..', 'js', 'vbd-data.js');
const log = (...a) => console.log('[vbd]', ...a);
fs.mkdirSync(CACHE, { recursive: true });

if (!fs.existsSync(RAW) || process.argv.includes('--refresh')) {
  const query = path.join(CACHE, 'vbd_routes.overpassql');
  fs.writeFileSync(query, `[out:json][timeout:180];
relation["route"="bus"]["operator"~"VBD|Verkehrsbetrieb.*Davos"](46.71521,9.78805,46.83509,9.93464);
out geom;
`);
  execFileSync('bash', [path.join(DIR, 'overpass.sh'), RAW, query], { stdio: 'inherit' });
}
const { elements } = JSON.parse(fs.readFileSync(RAW, 'utf8'));

const r1 = (v) => Math.round(v * 10) / 10;
const near = (a, b, d = 2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < d;

// A way's points: the rounded centreline of js/davos-geodata.js (the same OSM way, by id, running the same way round),
// else as mapped
const roads = new Map((DAVOS_DATA.roads || []).map((r) => [r.id.replace(/^w/, ''), r]));
let rounded = 0, mapped = 0;
function wayPts(m) {
  const raw = geomPts(m.geometry);
  const r = roads.get(String(m.ref));
  if (r && r.pts.length >= 4) {
    const pts = [];
    for (let i = 0; i < r.pts.length; i += 2) pts.push([r.pts[i], r.pts[i + 1]]);
    const a = pts[0], b = pts[pts.length - 1], p = raw[0], q = raw[raw.length - 1];
    const same = near(a, p, 1) && near(b, q, 1), flipped = near(a, q, 1) && near(b, p, 1);
    if (same || flipped) { rounded++; return flipped ? pts.reverse() : pts; }
  }
  mapped++;
  return raw;
}

// The relation's ways joined end to end in member order (each turned round as needed to continue the chain)
function chain(rel) {
  const ways = rel.members.filter((m) => m.type === 'way' && m.geometry && !/platform/.test(m.role || '')).map(wayPts);
  const out = [];
  for (const w of ways) {
    if (!out.length) { out.push(...w); continue; }
    const end = out[out.length - 1];
    if (near(end, w[0])) out.push(...w.slice(1));
    else if (near(end, w[w.length - 1])) out.push(...w.reverse().slice(1));
    else if (out.length === ways[0].length && (near(out[0], w[0]) || near(out[0], w[w.length - 1]))) {
      // the first way was the wrong way round
      out.reverse();
      out.push(...(near(out[out.length - 1], w[0]) ? w.slice(1) : w.reverse().slice(1)));
    } else out.push(...w); // a gap in the mapping: joined straight
  }
  return out;
}

// The longest run of the polyline inside the frame
function clip(pts) {
  let best = [], run = [];
  for (const p of pts) {
    if (inFrame(p[0], p[1], -5)) run.push(p);
    else { if (run.length > best.length) best = run; run = []; }
  }
  return run.length > best.length ? run : best;
}

// Distance along the polyline of its point nearest (x, z), and how far off
function project(pts, cum, x, z) {
  let best = { s: 0, d: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
    const d = Math.hypot(ax + ex * t - x, az + ez * t - z);
    if (d < best.d) best = { s: cum[i - 1] + Math.sqrt(L2) * t, d };
  }
  return best;
}

const variants = [];
for (const rel of elements) {
  if (rel.type !== 'relation') continue;
  const t = rel.tags || {};
  const pts = rdp(clip(chain(rel)), 0.1); // (the arcs' pieces stay: ~7.5° each)
  if (pts.length < 2) continue;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  if (len < 200) continue;
  // Stops: the stop positions (on the road), else the platforms, projected onto the route
  const stops = [];
  for (const m of rel.members) {
    if (m.type !== 'node' || !/^(stop|stop_entry_only|stop_exit_only|platform|platform_entry_only|platform_exit_only)$/.test(m.role || '')) continue;
    const [x, z] = geomPts([{ lon: m.lon, lat: m.lat }])[0];
    if (!inFrame(x, z)) continue;
    const p = project(pts, cum, x, z);
    if (p.d > 30) continue;
    const name = elements.find((e) => e.type === 'node' && e.id === m.ref)?.tags?.name || '';
    if (stops.some((s) => Math.abs(s.s - p.s) < 25)) continue; // stop and platform of the same halt
    stops.push({ s: r1(p.s), name });
  }
  stops.sort((a, b) => a.s - b.s);
  variants.push({
    id: `r${rel.id}`, ref: t.ref || '', colour: (t.colour || '#356296').toUpperCase().replace('WHITE', '#FFFFFF'),
    from: t.from || '', to: t.to || '', name: t.name || '', pts: flat(pts), len: r1(len), stops
  });
}
variants.sort((a, b) => a.ref.localeCompare(b.ref) || b.len - a.len);

// Stop names come from the member nodes' own tags, which `out geom` leaves out: fetch them once
const missing = variants.some((v) => v.stops.some((s) => !s.name));
if (missing) {
  const ids = [...new Set(elements.flatMap((r) => (r.members || []).filter((m) => m.type === 'node').map((m) => m.ref)))];
  const NAMES = path.join(CACHE, 'vbd_stops.json');
  if (!fs.existsSync(NAMES) || process.argv.includes('--refresh')) {
    const q = path.join(CACHE, 'vbd_stops.overpassql');
    fs.writeFileSync(q, `[out:json][timeout:120];\nnode(id:${ids.join(',')});\nout;\n`);
    execFileSync('bash', [path.join(DIR, 'overpass.sh'), NAMES, q], { stdio: 'inherit' });
  }
  const names = new Map(JSON.parse(fs.readFileSync(NAMES, 'utf8')).elements.map((e) => [e.id, e.tags?.name || '']));
  for (const rel of elements) {
    const v = variants.find((w) => w.id === `r${rel.id}`);
    if (!v) continue;
    // Re-derive the stop names in order of the projected positions
    const pts = []; for (let i = 0; i < v.pts.length; i += 2) pts.push([v.pts[i], v.pts[i + 1]]);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    for (const m of rel.members) {
      if (m.type !== 'node') continue;
      const [x, z] = geomPts([{ lon: m.lon, lat: m.lat }])[0];
      const p = project(pts, cum, x, z);
      const stop = v.stops.find((s) => Math.abs(s.s - p.s) < 25 && !s.name);
      if (stop && p.d <= 30) stop.name = names.get(m.ref) || '';
    }
  }
}

const lines = [...new Set(variants.map((v) => v.ref))];
const data = {
  source: 'OpenStreetMap contributors (ODbL), route=bus relations of the Verkehrsbetrieb Davos (VBD)',
  fetched: new Date().toISOString().slice(0, 10),
  lines: lines.map((ref) => { const v = variants.find((w) => w.ref === ref); return { ref, colour: v.colour }; }),
  variants
};
fs.writeFileSync(OUT, `// js/vbd-data.js — GENERATED by tools/fetch-vbd.mjs, do not edit by hand.\n// VBD bus lines in the world frame of js/davos-frame.js. © OpenStreetMap contributors (ODbL).\nexport const VBD_DATA = ${JSON.stringify(data)};\n`);
log(`wrote ${OUT}: ${variants.length} variants of lines ${lines.join(', ')}, ${variants.reduce((a, v) => a + v.stops.length, 0)} stops (${rounded} ways on the rounded centrelines, ${mapped} as mapped)`);
for (const v of variants) log(`${v.ref} ${v.from} -> ${v.to}: ${(v.len / 1000).toFixed(1)} km, ${v.stops.length} stops`);
