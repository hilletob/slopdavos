// tools/build-hike-routes.mjs — writes js/missions-hike-routes.js: the hikes' lines in the world frame, thinned to one point
// every ~STEP m. The Schwarzhorn from the tour recorded in the swisstopo app (tools/data/schwarzhorn-tour.gpx, from the
// Flüelapass road to the summit); the Jöriseen from the OSM paths (tools/data/cache/osm_davos.json), walked by Dijkstra through
// the given LV95 points.
// usage: node tools/build-hike-routes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lonLatToWorld, lv95ToWorld } from '../js/davos-frame.js';
import { waterAt } from '../js/city-config.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STEP = 25;

function thin(pts, step = STEP) {
  const out = [pts[0]];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (run >= step) { out.push(pts[i]); run = 0; }
  }
  const end = pts[pts.length - 1];
  if (out[out.length - 1] !== end) out.push(end);
  return out.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]);
}
// A mapped path can graze a mapped lake, and nobody walks on water (js/controllers.js): what lies within SHORE m of it moves to dry ground
const SHORE = 3;
const wet = (x, z) => waterAt(x, z) || [0, 1, 2, 3, 4, 5, 6, 7].some((k) => waterAt(x + Math.cos(k * Math.PI / 4) * SHORE, z + Math.sin(k * Math.PI / 4) * SHORE));
function dryLine(pts) {
  const dense = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
    for (let k = 1; k <= n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  let moved = 0;
  const out = dense.map(([x, z]) => {
    if (!wet(x, z)) return [x, z];
    moved++;
    for (let r = 1; r < 40; r++) for (let k = 0; k < 16; k++) {
      const q = [x + Math.cos(k * Math.PI / 8) * r, z + Math.sin(k * Math.PI / 8) * r];
      if (!wet(q[0], q[1])) return q;
    }
    return [x, z];
  });
  // (the moved points smoothed along the line, and whatever the smoothing took back to the water left where it was)
  const smooth = out.map((p, i) => {
    if (i < 2 || i > out.length - 3) return p;
    const q = [0, 1].map((c) => (out[i - 2][c] + out[i - 1][c] + p[c] + out[i + 1][c] + out[i + 2][c]) / 5);
    return wet(q[0], q[1]) ? p : q;
  });
  console.log(`  ${moved} of ${dense.length} points moved off the water`);
  return smooth;
}
const lengthOf = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

// The Schwarzhorn's recorded track, up to its summit
const gpx = fs.readFileSync(path.join(DIR, 'data', 'schwarzhorn-tour.gpx'), 'utf8');
const track = [...gpx.matchAll(/<trkpt[^>]*lat="([\d.]+)"[^>]*lon="([\d.]+)"/g)].map((m) => { const p = lonLatToWorld(+m[2], +m[1]); return [p.x, p.z]; });
if (track.length < 10) throw new Error('no track in the GPX');
const summit = lv95ToWorld(2791281, 1179113);
let top = 0, best = Infinity;
track.forEach((p, i) => { const d = Math.hypot(p[0] - summit.x, p[1] - summit.z); if (d < best) { best = d; top = i; } });
const schwarzhorn = thin(dryLine(track.slice(0, top + 1)));

// The OSM paths as a graph
const osm = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'cache', 'osm_davos.json'), 'utf8'));
const nodes = new Map(), edges = new Map();
const key = (p) => `${p.lat},${p.lon}`;
for (const e of osm.elements) {
  if (e.type !== 'way' || !e.geometry || !/^(path|footway|track|steps|unclassified|service)$/.test(e.tags?.highway || '')) continue;
  for (let i = 0; i < e.geometry.length; i++) {
    const k = key(e.geometry[i]);
    if (!nodes.has(k)) { const w = lonLatToWorld(e.geometry[i].lon, e.geometry[i].lat); nodes.set(k, [w.x, w.z]); edges.set(k, []); }
    if (i) {
      const a = key(e.geometry[i - 1]), d = Math.hypot(nodes.get(a)[0] - nodes.get(k)[0], nodes.get(a)[1] - nodes.get(k)[1]);
      edges.get(a).push([k, d]); edges.get(k).push([a, d]);
    }
  }
}
const nearest = ([x, z]) => { let b = null, bd = Infinity; for (const [k, p] of nodes) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; b = k; } } return { k: b, d: bd }; };
function walk(from, to) {
  const dist = new Map([[from, 0]]), prev = new Map(), open = new Set([from]);
  while (open.size) {
    let u = null, du = Infinity;
    for (const k of open) if (dist.get(k) < du) { du = dist.get(k); u = k; }
    open.delete(u);
    if (u === to) break;
    for (const [v, d] of edges.get(u)) if (du + d < (dist.get(v) ?? Infinity)) { dist.set(v, du + d); prev.set(v, u); open.add(v); }
  }
  if (!dist.has(to)) throw new Error('no path');
  const out = [];
  for (let u = to; u; u = prev.get(u)) out.unshift(nodes.get(u));
  return out;
}
const through = (lv95) => {
  const stops = lv95.map(([E, N]) => { const w = lv95ToWorld(E, N); return nearest([w.x, w.z]); });
  stops.forEach((s, i) => console.log(`  stop ${i}: ${Math.round(s.d)} m from the path`));
  const out = [];
  for (let i = 1; i < stops.length; i++) out.push(...walk(stops[i - 1].k, stops[i].k).slice(i > 1 ? 1 : 0));
  return out;
};
// From the Wägerhus on the Flüelastrasse up through the Winterlücke, over the Jöriflüelafurgga to the largest lake's shore
const JOERI = [[2791165, 1182437], [2792193, 1184393], [2793204, 1184092]];
const joeriseen = thin(dryLine(through(JOERI)));

fs.writeFileSync(path.join(DIR, '..', 'js', 'missions-hike-routes.js'), `// js/missions-hike-routes.js — GENERATED by tools/build-hike-routes.mjs: the hikes' lines, [x, z] in the world frame
export const SCHWARZHORN_ROUTE = ${JSON.stringify(schwarzhorn)};
export const JOERISEEN_ROUTE = ${JSON.stringify(joeriseen)};
`);
console.log(`Schwarzhorn: ${schwarzhorn.length} points, ${Math.round(lengthOf(schwarzhorn))} m; Jöriseen: ${joeriseen.length} points, ${Math.round(lengthOf(joeriseen))} m`);
