// tools/fetch-level-crossings.mjs — writes js/level-crossings-data.js: the level crossings of the RhB line through the
// mapped valley, for js/level-crossings.js.
//   - OSM railway=level_crossing (roads) and railway=crossing (footpaths) nodes, with crossing:barrier / crossing:light /
//     crossing:bell / crossing:saltire (query tools/data/q_davos_level_crossings.overpassql, cached in
//     tools/data/cache/osm_davos_level_crossings.json; pass --refresh to query Overpass again);
//   - where a drivable road crosses the line at grade with no mapped crossing within 25 m, a crossing is derived
//     (half barriers and lights, the usual RhB equipment in the valley).
// Each crossing is placed on the line (js/rhb-route.js: its distance along both routes) and on the road it carries
// (the road's direction and width from js/davos-geodata.js). Crossings more than 12 m off the line (sidings, the
// funiculars' station tracks) are left out.
// usage: node tools/fetch-level-crossings.mjs [--refresh]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lonLatToWorld } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { buildLine, routePoint, project } from '../js/rhb-route.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, 'data', 'cache', 'osm_davos_level_crossings.json');
const QUERY = path.join(DIR, 'data', 'q_davos_level_crossings.overpassql');
const OUT = path.join(DIR, '..', 'js', 'level-crossings-data.js');
const log = (...a) => console.log('[level-crossings]', ...a);

if (process.argv.includes('--refresh') || !fs.existsSync(CACHE)) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  execFileSync('bash', [path.join(DIR, 'overpass.sh'), CACHE, QUERY, '6'], { stdio: 'inherit' });
}
const osm = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const line = buildLine(DAVOS_DATA.railways, DAVOS_DATA.stations || [], DAVOS_DATA.meta.bounds);
if (!line) throw new Error('no RhB line in js/davos-geodata.js');

const DRIVABLE = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/;
const PATHS = /^(footway|path|cycleway|pedestrian|track|steps|bridleway)$/;
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

// The road segment nearest (x, z) among `roads` (off bridges and out of tunnels): its direction, width, name, kind
function nearestRoad(x, z, test) {
  let best = null;
  for (const r of DAVOS_DATA.roads) {
    if (r.bridge || r.tunnel || !test(r.kind)) continue;
    for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], dx = r.pts[i] - ax, dz = r.pts[i + 1] - az, L2 = dx * dx + dz * dz;
      if (L2 < 0.01) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (!best || d < best.d) {
        const L = Math.sqrt(L2);
        best = { d, dx: dx / L, dz: dz / L, width: r.width || 6, name: r.name || '', kind: r.kind, x: ax + dx * t, z: az + dz * t };
      }
    }
  }
  return best;
}

// A crossing on the line: snapped onto the southbound track, with both routes' distances and the track direction
function onLine(x, z) {
  const a = project(line.south, x, z), b = project(line.north, x, z);
  if (Math.min(a.d, b.d) > 12) return null;
  const p = routePoint(line.south, a.s, {});
  if (p.tunnel) return null;
  return { x: p.x, z: p.z, south: a.s, north: b.s, rdx: p.dx, rdz: p.dz, off: Math.min(a.d, b.d) };
}

const crossings = [];
let skipped = 0;
for (const e of osm.elements) {
  if (e.type !== 'node') continue;
  const t = e.tags || {};
  const w = lonLatToWorld(e.lon, e.lat), l = onLine(w.x, w.z);
  if (!l) { skipped++; continue; }
  const road = t.railway === 'crossing' ? nearestRoad(w.x, w.z, (k) => PATHS.test(k)) : nearestRoad(w.x, w.z, (k) => DRIVABLE.test(k) || PATHS.test(k));
  if (!road || road.d > 15) { skipped++; continue; }
  // Merge duplicates (two nodes on the same crossing, one per track)
  if (crossings.some((c) => Math.hypot(c.x - l.x, c.z - l.z) < 12)) continue;
  // (untagged: a public road crossing has half barriers and lights; footpaths, private tracks and 'uncontrolled' ones none)
  const barrier = t['crossing:barrier'] || (t.crossing === 'uncontrolled' || t.railway === 'crossing' || t.access === 'private' ? 'no' : 'half');
  crossings.push({
    id: `n${e.id}`, source: 'osm', x: r1(l.x), z: r1(l.z), south: r1(l.south), north: r1(l.north),
    rdx: r3(l.rdx), rdz: r3(l.rdz), dx: r3(road.dx), dz: r3(road.dz), width: r1(Math.max(2, road.width)),
    road: road.name, kind: road.kind, foot: t.railway === 'crossing' || PATHS.test(road.kind),
    barrier, light: t['crossing:light'] ? t['crossing:light'] !== 'no' : barrier !== 'no' || t.crossing !== 'uncontrolled',
    bell: t['crossing:bell'] ? t['crossing:bell'] !== 'no' : barrier !== 'no', saltire: t['crossing:saltire'] === 'yes' || barrier === 'no',
    private: t.access === 'private'
  });
}

// Derived: drivable roads crossing the line at grade without a mapped crossing nearby
let derived = 0;
const track = line.south;
for (const r of DAVOS_DATA.roads) {
  if (r.bridge || r.tunnel || !DRIVABLE.test(r.kind) || r.kind === 'service') continue;
  for (let i = 2; i < r.pts.length; i += 2) {
    const ax = r.pts[i - 2], az = r.pts[i - 1], bx = r.pts[i], bz = r.pts[i + 1];
    for (let k = 1; k < track.pts.length; k++) {
      const p = track.pts[k - 1], q = track.pts[k];
      if (p.tunnel || p.bridge || q.bridge) continue;
      // Segment intersection
      const d = (bx - ax) * (q.z - p.z) - (bz - az) * (q.x - p.x);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((p.x - ax) * (q.z - p.z) - (p.z - az) * (q.x - p.x)) / d, v = ((p.x - ax) * (bz - az) - (p.z - az) * (bx - ax)) / d;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
      if (crossings.some((c) => Math.hypot(c.x - x, c.z - z) < 25)) continue;
      const l = onLine(x, z);
      if (!l) continue;
      const L = Math.hypot(bx - ax, bz - az) || 1;
      crossings.push({
        id: `d${r.id}-${i}`, source: 'derived', x: r1(l.x), z: r1(l.z), south: r1(l.south), north: r1(l.north),
        rdx: r3(l.rdx), rdz: r3(l.rdz), dx: r3((bx - ax) / L), dz: r3((bz - az) / L), width: r1(Math.max(4, r.width || 6)),
        road: r.name || '', kind: r.kind, foot: false, barrier: 'half', light: true, bell: true, saltire: false, private: false
      });
      derived++;
    }
  }
}
crossings.sort((a, b) => a.south - b.south);

const data = {
  source: 'OpenStreetMap contributors (ODbL): railway=level_crossing / crossing; derived where roads cross the line at grade',
  fetched: new Date().toISOString().slice(0, 10), crossings
};
fs.writeFileSync(OUT, `// js/level-crossings-data.js — GENERATED by tools/fetch-level-crossings.mjs, do not edit by hand.\n// © OpenStreetMap contributors (ODbL).\nexport const LEVEL_CROSSINGS = ${JSON.stringify(data)};\n`);
log(`${crossings.length} crossings (${crossings.length - derived} from OSM, ${derived} derived), ${skipped} OSM nodes off the line; wrote ${OUT}`);
for (const c of crossings) log(` ${c.id} s=${c.south} ${c.road || '(unnamed)'} ${c.kind} ${c.barrier}${c.foot ? ' foot' : ''}${c.private ? ' private' : ''}`);
