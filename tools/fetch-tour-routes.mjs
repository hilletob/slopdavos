// tools/fetch-tour-routes.mjs — writes js/tour-routes-data.js: the marked and the published routes of the Landschaft
// Davos for js/tour-routes.js (the full map's route layers and the yellow signposts at the hiking trails' junctions).
// - `hiking`: the signposted hiking network, swisstopo's swissTLM3D Wanderwege (the national download from
//   data.geo.admin.ch: the map service leaves the category out). Per category: 'w' Wanderweg (yellow), 'b'
//   Bergwanderweg (white-red-white), 'a' Alpinwanderweg (white-blue-white). Segments chained into longer lines.
// - `nodes`: the junctions of that network (three or more trails meeting) and its ends: where the signposts stand
//   (`n` trails, the highest category `c`, `a` the direction to stand off the junction).
// - `mobil`: SchweizMobil's national and regional routes, ch.astra.wanderland ('hike') and ch.astra.mountainbikeland
//   ('mtb'), with their numbers.
// - `ski`, `snowshoe`: swisstopo's and the SAC's ski touring and snowshoe routes (ch.swisstopo-karto.skitouren,
//   ch.swisstopo-karto.schneeschuhrouten), with their summit, its height and the SAC difficulty where there is one.
// Everything is clipped to the map and simplified (2 m for the trails, 4 m for the tours).
// opendata.swiss terms "open use, must provide the source": © swisstopo, ASTRA / SchweizMobil, SAC.
//
// usage: node tools/fetch-tour-routes.mjs [--refresh] [--gpkg path/to/SWISSTLM3D_WANDERWEGE.gpkg]
// The hiking network is cut out of the 200 MB download once (into tools/data/cache/tlm_wanderwege.json, with sqlite3
// and unzip from the system); --gpkg takes an already unpacked GeoPackage instead of downloading it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FRAME, WORLD_BOUNDS, lv95ToWorld } from '../js/davos-frame.js';
import { rdp, flat } from './osm-geometry.mjs';
import { layerFeatures, linesOf } from './geoadmin.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, '..', 'js', 'tour-routes-data.js');
const TLM_CACHE = path.join(DIR, 'data', 'cache', 'tlm_wanderwege.json');
const TLM_URL = 'https://data.geo.admin.ch/ch.swisstopo.swisstlm3d-wanderwege/swisstlm3d-wanderwege/swisstlm3d-wanderwege_2056_5728.gpkg.zip';
const log = (...a) => console.log('[tour-routes]', ...a);
const refresh = process.argv.includes('--refresh');
const argOf = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

const [MIN_X, MIN_Z, MAX_X, MAX_Z] = WORLD_BOUNDS;
const INSET = 10;
const inside = ([x, z]) => x >= MIN_X + INSET && x <= MAX_X - INSET && z >= MIN_Z + INSET && z <= MAX_Z - INSET;
const pathLength = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
// Simplified to `eps` m, in halves (a loop's ends meet, which would collapse it to a point)
const simplify = (pts, eps) => {
  if (pts.length < 5) return pts;
  const mid = pts.length >> 1;
  return [...rdp(pts.slice(0, mid + 1), eps), ...rdp(pts.slice(mid), eps).slice(1)];
};
const toWorld = (line) => line.map(([E, N]) => { const w = lv95ToWorld(E, N); return [w.x, w.z]; });

// The stretches of a line inside the map (crossings found by bisection)
function clipLine(pts, minLength = 40) {
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
  return pieces.filter((q) => q.length >= 2 && pathLength(q) >= minLength);
}

// --- The hiking network -------------------------------------------------------------------------------------------
// A GeoPackage geometry blob (header 'GP', flags, srs, envelope) holding a WKB LineString (Z): its [E, N] points
function gpkgLine(hex) {
  const buf = Buffer.from(hex, 'hex');
  if (buf[0] !== 0x47 || buf[1] !== 0x50) throw new Error('not a GeoPackage geometry');
  const envelope = [0, 32, 48, 48, 64][(buf[3] >> 1) & 7];
  let o = 8 + envelope;
  const le = buf[o] === 1;
  const u32 = (at) => (le ? buf.readUInt32LE(at) : buf.readUInt32BE(at));
  const f64 = (at) => (le ? buf.readDoubleLE(at) : buf.readDoubleBE(at));
  const type = u32(o + 1);
  const base = type & 0xffff, kind = base % 1000;
  if (kind !== 2) throw new Error(`geometry type ${type}`);
  const dims = 2 + (base >= 3000 ? 2 : base >= 1000 ? 1 : 0) + ((type & 0x80000000) && base < 1000 ? 1 : 0);
  const n = u32(o + 5);
  o += 9;
  const pts = [];
  for (let i = 0; i < n; i++, o += dims * 8) pts.push([f64(o), f64(o + 8)]);
  return pts;
}

function hikingSegments() {
  if (!refresh && fs.existsSync(TLM_CACHE)) return JSON.parse(fs.readFileSync(TLM_CACHE, 'utf8')).segments;
  let gpkg = argOf('--gpkg'), tmp = null;
  if (!gpkg) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tlm-wanderwege-'));
    log('downloading', TLM_URL);
    execFileSync('curl', ['-sSfL', '-A', 'geodata fetch tool', '-o', path.join(tmp, 'w.zip'), TLM_URL], { stdio: 'inherit' });
    execFileSync('unzip', ['-o', '-q', path.join(tmp, 'w.zip'), '-d', tmp]);
    fs.rmSync(path.join(tmp, 'w.zip'));
    gpkg = path.join(tmp, fs.readdirSync(tmp).find((f) => f.endsWith('.gpkg')));
  }
  const [e0, n0, e1, n1] = FRAME.lv95;
  const sql = `select s.wanderwege, s.objektart, s.kunstbaute, hex(s.geom) from tlm_strassen_strasse s join rtree_tlm_strassen_strasse_geom r on r.id = s.id ` +
    `where r.maxx >= ${e0} and r.minx <= ${e1} and r.maxy >= ${n0} and r.miny <= ${n1};`;
  const rows = execFileSync('sqlite3', ['-separator', '|', gpkg, sql], { maxBuffer: 1 << 30 }).toString().trim().split('\n');
  const segments = rows.map((row) => {
    const [category, kind, structure, hex] = row.split('|');
    return { category, kind, structure, pts: gpkgLine(hex).map(([E, N]) => [Math.round(E * 10) / 10, Math.round(N * 10) / 10]) };
  });
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(TLM_CACHE), { recursive: true });
  fs.writeFileSync(TLM_CACHE, JSON.stringify({ source: TLM_URL, fetched: new Date().toISOString().slice(0, 10), segments }));
  log(`${segments.length} segments cut out of the GeoPackage`);
  return segments;
}

const CATEGORY = { Wanderweg: 'w', Bergwanderweg: 'b', Alpinwanderweg: 'a' };
const key = ([x, z]) => `${Math.round(x * 2)},${Math.round(z * 2)}`; // (ends within 0.5 m are one node)

function hikingNetwork() {
  const pieces = [];
  for (const s of hikingSegments()) {
    const c = CATEGORY[s.category];
    if (!c || s.structure === 'Tunnel') continue;
    for (const p of clipLine(toWorld(s.pts), 0)) pieces.push({ c, pts: p });
  }
  // The nodes: how many segments end there, and of which categories
  const nodes = new Map();
  const at = (p) => { const k = key(p); if (!nodes.has(k)) nodes.set(k, { x: p[0], z: p[1], ends: [] }); return nodes.get(k); };
  pieces.forEach((p, i) => { at(p.pts[0]).ends.push(i); at(p.pts[p.pts.length - 1]).ends.push(i); });
  // Chains: through the nodes where exactly two segments of the same category meet
  const used = new Uint8Array(pieces.length);
  const lines = [];
  const next = (i, p) => {
    const n = nodes.get(key(p));
    if (n.ends.length !== 2) return -1;
    const j = n.ends[0] === i ? n.ends[1] : n.ends[0];
    return j !== i && !used[j] && pieces[j].c === pieces[i].c ? j : -1;
  };
  for (let i = 0; i < pieces.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    let pts = [...pieces[i].pts];
    for (const forward of [true, false]) {
      let cur = i;
      for (;;) {
        const end = forward ? pts[pts.length - 1] : pts[0];
        const j = next(cur, end);
        if (j < 0) break;
        used[j] = 1;
        let q = pieces[j].pts;
        if (key(forward ? q[0] : q[q.length - 1]) !== key(end)) q = [...q].reverse();
        pts = forward ? [...pts, ...q.slice(1)] : [...q.slice(0, -1), ...pts];
        cur = j;
      }
    }
    lines.push({ c: pieces[i].c, pts });
  }
  const hiking = lines.filter((l) => pathLength(l.pts) >= 15).map((l) => {
    const pts = simplify(l.pts, 2);
    return { c: l.c, len: Math.round(pathLength(pts)), pts: flat(pts) };
  });
  // Signpost sites: junctions (3+ trails) and the network's ends inside the map
  const sites = [];
  for (const n of nodes.values()) {
    if (n.ends.length === 2) continue;
    const cs = new Set(n.ends.map((i) => pieces[i].c));
    if (n.ends.length === 1 && !inside([n.x, n.z])) continue;
    // (the post stands beside the junction, in the widest gap between the trails leaving it: `a`, atan2(dx, dz))
    const angles = n.ends.map((i) => {
      const q = pieces[i].pts, first = key(q[0]) === key([n.x, n.z]);
      const [ax, az] = first ? q[0] : q[q.length - 1], [bx, bz] = first ? q[1] : q[q.length - 2];
      return Math.atan2(bx - ax, bz - az);
    }).sort((p, q) => p - q);
    let gap = -1, a = 0;
    angles.forEach((v, i) => {
      const w = i + 1 < angles.length ? angles[i + 1] - v : angles[0] + 2 * Math.PI - v;
      if (w > gap) { gap = w; a = v + w / 2; }
    });
    sites.push({ x: Math.round(n.x * 10) / 10, z: Math.round(n.z * 10) / 10, n: n.ends.length, c: cs.has('a') ? 'a' : cs.has('b') ? 'b' : 'w', a: Math.round(a * 100) / 100 });
  }
  // (junctions closer than 25 m share a signpost: the one with the most trails)
  sites.sort((a, b) => b.n - a.n);
  const kept = [];
  for (const s of sites) if (!kept.some((k) => Math.hypot(k.x - s.x, k.z - s.z) < 25)) kept.push(s);
  return { hiking, nodes: kept };
}

// --- The published routes (map service) ---------------------------------------------------------------------------
async function routes(layer, cache, describe, eps) {
  const features = await layerFeatures(layer, FRAME.lv95, { cache, refresh, log });
  const out = [];
  for (const f of features) {
    const lines = [];
    for (const line of linesOf(f)) for (const piece of clipLine(toWorld(line), 0)) lines.push(flat(simplify(piece, eps)));
    let len = 0;
    for (const l of lines) for (let i = 2; i < l.length; i += 2) len += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]);
    if (len < 60) continue;
    out.push({ id: String(f.id).replace(/[{}]/g, ''), ...describe(f.properties || {}), len: Math.round(len), lines });
  }
  return out;
}

const mobil = (kind) => (p) => ({ kind, name: p.chmobil_title || p.label || '', nr: p.chmobil_route_number ?? null });
const tour = (p) => ({
  name: p.target_name || p.label || '',
  alt: p.target_altitude ?? null,
  route: /^Keine Routeninfo/.test(p.name_de || p.name || '') ? '' : p.name_de || p.name || '',
  grade: p.difficulty_de || '',
  time: p.ascent_time_label || '',
  up: Number(p.ascent_altitude) || null,
  down: Number(p.descent_altitude) || null
});

const { hiking, nodes } = hikingNetwork();
const data = {
  source: 'swisstopo swissTLM3D Wanderwege; ASTRA / SchweizMobil (ch.astra.wanderland, ch.astra.mountainbikeland); swisstopo / SAC (ch.swisstopo-karto.skitouren, ch.swisstopo-karto.schneeschuhrouten); opendata.swiss terms of use (open use, must provide the source)',
  fetched: new Date().toISOString().slice(0, 10),
  hiking,
  nodes,
  mobil: [
    ...await routes('ch.astra.wanderland', 'geoadmin_wanderland', mobil('hike'), 3),
    ...await routes('ch.astra.mountainbikeland', 'geoadmin_mountainbikeland', mobil('mtb'), 3)
  ],
  ski: await routes('ch.swisstopo-karto.skitouren', 'geoadmin_skitouren', tour, 4),
  snowshoe: await routes('ch.swisstopo-karto.schneeschuhrouten', 'geoadmin_schneeschuhrouten', tour, 4)
};
fs.writeFileSync(OUT, `// js/tour-routes-data.js — GENERATED by tools/fetch-tour-routes.mjs, do not edit by hand.\n// The hiking network, the SchweizMobil routes and the ski touring and snowshoe routes of Davos (world frame of\n// js/davos-frame.js). © swisstopo, ASTRA / SchweizMobil, SAC.\nexport const TOUR_ROUTES = ${JSON.stringify(data)};\n`);
const km = (list) => (list.reduce((s, r) => s + r.len, 0) / 1000).toFixed(1);
log(`hiking network: ${hiking.length} lines, ${km(hiking)} km (${['w', 'b', 'a'].map((c) => `${c} ${km(hiking.filter((h) => h.c === c))}`).join(', ')}), ${nodes.length} signpost sites`);
log(`SchweizMobil: ${data.mobil.length} routes, ${km(data.mobil)} km; ski tours: ${data.ski.length}, ${km(data.ski)} km; snowshoe: ${data.snowshoe.length}, ${km(data.snowshoe)} km`);
log(`wrote ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes)`);
