// tools/fetch-golf.mjs — writes js/golf-data.js: the Golf Club Davos (OSM leisure=golf_course, the 18-hole par-69 course
// on the valley floor between Davos Dorf and Platz, Mattastrasse) and its playing areas from OSM golf=*: fairways,
// greens, tees, bunkers, water hazards, the driving range and rough (where mapped), the holes (golf=hole lines from tee
// to green, with ref and par) and the pins (golf=pin; a hole without one gets its pin at the green end of its line).
// Rings are simplified, closed implicitly, counter-clockwise seen from above in the world frame (x east, z south).
// Also lists the course's water hazards that DAVOS_DATA.water already draws (js/golf.js then leaves them to the lakes).
// usage: node tools/fetch-golf.mjs   (re-download: delete tools/data/cache/osm_davos_golf.json)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lonLatToWorld } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, 'data', 'cache', 'osm_davos_golf.json');
const OUT = path.join(DIR, '..', 'js', 'golf-data.js');
const log = (...a) => console.log('[golf]', ...a);
const QUERY = `[out:json][timeout:180];
(
  nwr["leisure"="golf_course"](46.71521,9.78805,46.83509,9.93464);
  nwr["golf"](46.71521,9.78805,46.83509,9.93464);
);
out geom;
`;

if (!fs.existsSync(CACHE)) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const q = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'golf-')), 'q.overpassql');
  fs.writeFileSync(q, QUERY);
  execFileSync('bash', [path.join(DIR, 'overpass.sh'), CACHE, q], { stdio: 'inherit' });
}
const osm = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const r1 = (v) => Math.round(v * 10) / 10;
const KINDS = ['rough', 'fairway', 'green', 'tee', 'bunker', 'water', 'range'];
const KIND_OF = { rough: 'rough', fairway: 'fairway', green: 'green', tee: 'tee', bunker: 'bunker', water_hazard: 'water', lateral_water_hazard: 'water', driving_range: 'range' };

const toPts = (geometry) => geometry.map((g) => lonLatToWorld(g.lon, g.lat));
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
// Signed area in the x/z plane (positive: counter-clockwise seen from above, i.e. with z pointing south: clockwise on a map)
const area = (p) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j].x * p[i].z - p[i].x * p[j].z; return s / 2; };
function ring(geometry, eps = 0.25) {
  let p = toPts(geometry);
  if (p.length > 2 && Math.hypot(p[0].x - p.at(-1).x, p[0].z - p.at(-1).z) < 0.01) p = p.slice(0, -1);
  // (a closed ring is simplified in two halves, split at the vertex farthest from the first)
  let far = 0;
  p.forEach((q, i) => { if (Math.hypot(q.x - p[0].x, q.z - p[0].z) > Math.hypot(p[far].x - p[0].x, p[far].z - p[0].z)) far = i; });
  if (far === 0) return null;
  p = [...rdp(p.slice(0, far + 1), eps).slice(0, -1), ...rdp([...p.slice(far), p[0]], eps).slice(0, -1)];
  if (p.length < 3) return null;
  if (area(p) < 0) p.reverse();
  return p.flatMap((q) => [r1(q.x), r1(q.z)]);
}
const pip = (ring, x, z) => {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const centroid = (ring) => { let x = 0, z = 0; for (let i = 0; i < ring.length; i += 2) { x += ring[i]; z += ring[i + 1]; } return [x / (ring.length / 2), z / (ring.length / 2)]; };

// Join the multipolygon's outer member ways into closed rings
function joinRings(members) {
  const ways = members.filter((m) => m.type === 'way' && m.geometry).map((m) => ({ role: m.role || 'outer', pts: m.geometry.slice() }));
  const out = [];
  for (const role of ['outer', 'inner']) {
    const open = ways.filter((w) => w.role === role).map((w) => w.pts);
    while (open.length) {
      let cur = open.shift();
      const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
      for (let guard = 0; !same(cur[0], cur.at(-1)) && guard < 1000; guard++) {
        const i = open.findIndex((w) => same(w[0], cur.at(-1)) || same(w.at(-1), cur.at(-1)));
        if (i < 0) break;
        const w = open.splice(i, 1)[0];
        cur = cur.concat((same(w[0], cur.at(-1)) ? w : w.slice().reverse()).slice(1));
      }
      out.push({ role, geometry: cur });
    }
  }
  return out;
}

const course = osm.elements.find((e) => e.tags?.leisure === 'golf_course' && /Davos/.test(e.tags.name || ''));
if (!course) throw new Error('Golf Club Davos not found');
const outline = (course.type === 'relation' ? joinRings(course.members) : [{ role: 'outer', geometry: course.geometry }])
  .filter((r) => r.role === 'outer').map((r) => ring(r.geometry, 0.5)).filter(Boolean);
const inCourse = (x, z) => outline.some((o) => pip(o, x, z));

const areas = [];
const skipped = {};
for (const e of osm.elements) {
  const kind = KIND_OF[e.tags?.golf];
  if (!kind || e.type !== 'way' || !e.geometry) continue;
  const r = ring(e.geometry, kind === 'green' || kind === 'bunker' ? 0.15 : 0.25);
  if (!r) continue;
  const [cx, cz] = centroid(r);
  // (only the Golf Club Davos' own: OSM may know a mini golf or a practice green elsewhere in the valley)
  if (!inCourse(cx, cz)) { skipped[kind] = (skipped[kind] || 0) + 1; continue; }
  const a = { id: `w${e.id}`, kind, ring: r };
  if (e.tags.ref) a.ref = e.tags.ref;
  areas.push(a);
}
// Lower kinds first: the mesh draws them in this order, later ones over earlier ones
areas.sort((p, q) => KINDS.indexOf(p.kind) - KINDS.indexOf(q.kind));

// The water hazards that the geodata's water areas already draw (same pond: its centroid inside a DAVOS_DATA.water ring)
for (const a of areas.filter((p) => p.kind === 'water')) {
  const [cx, cz] = centroid(a.ring);
  if (DAVOS_DATA.water.some((w) => pip(w.ring, cx, cz))) a.drawn = 1;
}

const holes = [];
for (const e of osm.elements) {
  if (e.tags?.golf !== 'hole' || e.type !== 'way' || !e.geometry) continue;
  const pts = toPts(e.geometry);
  holes.push({ ref: +e.tags.ref || 0, par: +e.tags.par || 0, name: e.tags.name || '', pts: pts.flatMap((p) => [r1(p.x), r1(p.z)]) });
}
holes.sort((p, q) => p.ref - q.ref);

// Pins: every mapped golf=pin; a hole whose green holds none gets one at its line's green end
const pins = osm.elements.filter((e) => e.type === 'node' && e.tags?.golf === 'pin').map((e) => { const p = lonLatToWorld(e.lon, e.lat); return [r1(p.x), r1(p.z)]; });
const greens = areas.filter((a) => a.kind === 'green');
let inferredPins = 0;
for (const h of holes) {
  const ex = h.pts.at(-2), ez = h.pts.at(-1);
  const green = greens.find((g) => pip(g.ring, ex, ez)) || greens.reduce((b, g) => {
    const [cx, cz] = centroid(g.ring), d = Math.hypot(cx - ex, cz - ez);
    return !b || d < b.d ? { g, d } : b;
  }, null)?.g;
  if (!green) continue;
  green.hole = h.ref;
  const pin = pins.find((p) => pip(green.ring, p[0], p[1]));
  if (pin) h.pin = pin;
  else {
    // (the line's end if it lies on the green, else the green's centre)
    h.pin = pip(green.ring, ex, ez) ? [ex, ez] : centroid(green.ring).map(r1);
    inferredPins++;
  }
}

const clubhouse = osm.elements.find((e) => e.tags?.golf === 'clubhouse' && e.type === 'node');
const data = {
  source: 'OpenStreetMap contributors (ODbL), leisure=golf_course + golf=*',
  fetched: new Date().toISOString().slice(0, 10),
  name: course.tags.name, description: course.tags.description || '',
  kinds: KINDS,
  outline,
  areas,
  holes,
  clubhouse: clubhouse ? Object.values(lonLatToWorld(clubhouse.lon, clubhouse.lat)).map(r1) : null
};
const count = (k) => areas.filter((a) => a.kind === k).length;
fs.writeFileSync(OUT, `// js/golf-data.js — GENERATED by tools/fetch-golf.mjs, do not edit by hand. © OpenStreetMap contributors (ODbL).\nexport const GOLF = ${JSON.stringify(data)};\n`);
log(`${course.tags.name}: ${outline.length} outline rings, ${KINDS.map((k) => `${count(k)} ${k}`).join(', ')}; ${holes.length} holes, ${holes.filter((h) => h.pin).length} pins (${inferredPins} inferred); ${areas.filter((a) => a.drawn).length} water hazards already drawn; skipped outside: ${JSON.stringify(skipped)}`);
log(`wrote ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes)`);
