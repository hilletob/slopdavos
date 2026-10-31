// tools/fetch-bergbahnen.mjs — writes js/bergbahnen-data.js: the funiculars and aerial ropeways of Davos (Parsennbahn,
// Schatzalp-Bahn, Jakobshornbahn and the ski lifts) from OpenStreetMap (railway=funicular, aerialway=*), in the world
// frame of js/davos-frame.js with absolute heights (above FRAME.H0): the terrain (data/davos-terrain.bin) inside the map,
// the 50 m relief of data/davos-surroundings.bin beyond it (the top stations of the Parsenn and the Jakobshorn).
//  - funiculars: per line (OSM ways of one name and capacity), the two cars' paths from the valley station to the top,
//    one through each side of the passing loop, sampled every 2 m on the ground (smoothed over ±8 m, never below it);
//  - ropeways: the supports in order (stations at both ends, the pylons between), with the rope's height above them.
// Line facts (gauge, cars, speed, colours) from the operators and Wikipedia, see FACTS below.
// usage: node tools/fetch-bergbahnen.mjs [--cached]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FRAME, WORLD_BOUNDS, lonLatToWorld } from '../js/davos-frame.js';
import { parseTerrain, gridHeight } from '../js/terrain-grid.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, 'data', 'cache');
const RAW = path.join(CACHE, 'osm_bergbahnen.json');
const OUT = path.join(DIR, '..', 'js', 'bergbahnen-data.js');
const log = (...a) => console.log('[bergbahnen]', ...a);
fs.mkdirSync(CACHE, { recursive: true });

// --- OpenStreetMap ---------------------------------------------------------------------------------------------------------
if (!process.argv.includes('--cached') || !fs.existsSync(RAW)) {
  const query = path.join(CACHE, 'q_bergbahnen.overpassql');
  fs.writeFileSync(query, `[out:json][timeout:180];
(
  way["aerialway"](46.70,9.75,46.86,9.95);
  way["railway"="funicular"](46.70,9.75,46.86,9.95);
);
out geom;
>;
out body;
`);
  execFileSync('bash', [path.join(DIR, 'overpass.sh'), RAW, query], { stdio: 'inherit' });
}
const osm = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const nodeTags = new Map();
for (const e of osm.elements) if (e.type === 'node') nodeTags.set(e.id, e.tags || {});

// --- Heights: the terrain inside the map, the surroundings' 50 m ring beyond --------------------------------------------------
const readBin = (file) => { const b = fs.readFileSync(path.join(DIR, '..', 'data', file)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const TERRAIN = parseTerrain(readBin('davos-terrain.bin'));
const ringsBuf = readBin('davos-surroundings.bin');
const MID = parseTerrain(ringsBuf.slice(0, 24 + new DataView(ringsBuf).getUint16(4, true) * new DataView(ringsBuf).getUint16(6, true) * 2));
const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const inside = (x, z, pad = 0) => x >= minX - pad && x <= maxX + pad && z >= minZ - pad && z <= maxZ + pad;
const ground = (x, z) => (inside(x, z) ? gridHeight(TERRAIN, x, z) : gridHeight(MID, x, z));
const r1 = (v) => Math.round(v * 10) / 10;

// --- Facts per line (OSM gives the geometry, names, occupancy and capacity) -------------------------------------------------
// Parsennbahn: lower section Davos Dorf – Höhenweg 1860 m / 662 m, gauge 1200 mm, two trains of two coupled cars
// (~200 passengers), up to 10 m/s; upper section Höhenweg – Weissfluhjoch 2188 m / 444 m, gauge 800 mm, two trains of
// one long car each (Gangloff, ~110 passengers, remontees-mecaniques.net FUNI 110), 6.2 m/s; each section a shuttle of
// its two trains on one rope, crossing on the loop half-way (en.wikipedia.org/wiki/Parsenn_Funicular, the operator). Schatzalp-Bahn: Davos Platz – Schatzalp 712 m / 304 m,
// metre gauge, two cars (en.wikipedia.org/wiki/Schatzalp-Bahn). Jakobshornbahn: two aerial tramways, Davos Platz –
// Ischalp (100-person cabins, 2014) and Ischalp – Jakobshorn (60-person CWA "Kronos" cabins, 2022) (bergbahnen.org,
// davosklostersmountains.ch).
const FACTS = {
  'Parsennbahn|2200': { label: 'Parsennbahn (Davos Dorf – Höhenweg)', gauge: 1.2, cars: 2, carLength: 12.5, speed: 10, colour: 0xc8102e, trim: 0xf2f2f2 },
  'Parsennbahn|1160': { label: 'Parsennbahn (Höhenweg – Weissfluhjoch)', gauge: 0.8, cars: 1, carLength: 19, speed: 6.2, colour: 0xc8102e, trim: 0xf2f2f2 },
  'Schatzalp-Bahn|750': { label: 'Schatzalpbahn (Davos Platz – Schatzalp)', gauge: 1.0, cars: 1, carLength: 10.5, speed: 4.5, colour: 0xa3162b, trim: 0xe9dcc0 }
};
const ROPE = { // rope height above ground at the stations, default pylon height, cabin spacing (circulating lifts)
  cable_car: { station: 11, pylon: 28 },
  gondola: { station: 7, pylon: 16 },
  mixed_lift: { station: 7, pylon: 16 },
  chair_lift: { station: 5, pylon: 11 },
  't-bar': { station: 4.5, pylon: 7.5 },
  drag_lift: { station: 4.5, pylon: 7.5 },
  platter: { station: 4.5, pylon: 7.5 }
};

// --- Funiculars -----------------------------------------------------------------------------------------------------------
const groups = new Map();
for (const e of osm.elements) {
  if (e.type !== 'way' || e.tags?.railway !== 'funicular' || !e.nodes || !e.geometry) continue;
  const key = `${e.tags.name}|${e.tags['aerialway:capacity'] || ''}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(e);
}
function dijkstra(adj, from, to, cost) {
  const dist = new Map([[from, 0]]), prev = new Map(), open = new Set([from]);
  while (open.size) {
    let u = null;
    for (const v of open) if (u === null || dist.get(v) < dist.get(u)) u = v;
    open.delete(u);
    if (u === to) break;
    for (const { to: v, len } of adj.get(u) || []) {
      const d = dist.get(u) + len * cost(u, v);
      if (d < (dist.get(v) ?? Infinity)) { dist.set(v, d); prev.set(v, u); open.add(v); }
    }
  }
  if (!prev.has(to)) return null;
  const p = [to];
  while (p[0] !== from) p.unshift(prev.get(p[0]));
  return p;
}
const funiculars = [];
for (const [key, ways] of groups) {
  const facts = FACTS[key];
  if (!facts) { log(`funicular ${key}: no facts, skipped`); continue; }
  const pos = new Map(), adj = new Map();
  const link = (a, b) => {
    const len = Math.hypot(pos.get(a).x - pos.get(b).x, pos.get(a).z - pos.get(b).z);
    for (const [p, q] of [[a, b], [b, a]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push({ to: q, len }); }
  };
  for (const w of ways) {
    w.nodes.forEach((id, i) => pos.set(id, lonLatToWorld(w.geometry[i].lon, w.geometry[i].lat)));
    for (let i = 1; i < w.nodes.length; i++) link(w.nodes[i - 1], w.nodes[i]);
  }
  // The ends: the two dead ends farthest apart; the valley station is the lower
  const ends = [...adj.keys()].filter((id) => adj.get(id).length === 1);
  let best = null;
  for (const a of ends) for (const b of ends) {
    const d = Math.hypot(pos.get(a).x - pos.get(b).x, pos.get(a).z - pos.get(b).z);
    if (a !== b && (!best || d > best.d)) best = { a, b, d };
  }
  if (!best) continue;
  let [bottom, top] = [best.a, best.b];
  if (ground(pos.get(bottom).x, pos.get(bottom).z) > ground(pos.get(top).x, pos.get(top).z)) [bottom, top] = [top, bottom];
  const pathA = dijkstra(adj, bottom, top, () => 1);
  const used = new Set();
  for (let i = 1; i < pathA.length; i++) { used.add(`${pathA[i - 1]}/${pathA[i]}`); used.add(`${pathA[i]}/${pathA[i - 1]}`); }
  const pathB = dijkstra(adj, bottom, top, (u, v) => (used.has(`${u}/${v}`) ? 1.6 : 1));
  // Sampled every 2 m on the smoothed ground
  const sample = (ids) => {
    const P = ids.map((id) => pos.get(id)), S = [];
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) S.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    const h = S.map((p) => ground(p.x, p.z));
    const smooth = h.map((_, k) => { let s = 0, n = 0; for (let m = Math.max(0, k - 4); m <= Math.min(h.length - 1, k + 4); m++) { s += h[m]; n++; } return s / n; });
    // (never under the ground: on the convex stretches the track runs on a low embankment)
    return S.flatMap((p, k) => [r1(p.x), r1(Math.max(h[k], smooth[k])), r1(p.z)]);
  };
  const paths = [sample(pathA), sample(pathB)];
  const length = (pts) => { let L = 0; for (let i = 3; i < pts.length; i += 3) L += Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2], pts[i + 2] - pts[i - 1]); return L; };
  const name = key.split('|')[0];
  funiculars.push({ id: key, name, ...facts, capacity: +key.split('|')[1] || null, paths, length: Math.round(length(paths[0])),
    rise: Math.round(paths[0][paths[0].length - 2] - paths[0][1]), inside: paths[0].every((v, i) => i % 3 !== 0 || inside(v, paths[0][i + 2])) });
  log(`funicular ${facts.label}: ${funiculars.at(-1).length} m, rise ${funiculars.at(-1).rise} m, loop ${Math.round(length(paths[1]) - length(paths[0]))} m longer`);
}

// --- Aerial ropeways --------------------------------------------------------------------------------------------------------
const ropeways = [];
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type !== 'way' || !t.aerialway || !ROPE[t.aerialway] || !e.nodes || e.nodes.length < 2) continue;
  if (/wakeboard/i.test(t.name || '')) continue; // the cable ski lift on the lake
  const spec = ROPE[t.aerialway];
  const supports = e.nodes.map((id, i) => {
    const p = lonLatToWorld(e.geometry[i].lon, e.geometry[i].lat), g = ground(p.x, p.z), nt = nodeTags.get(id) || {};
    const end = i === 0 || i === e.nodes.length - 1;
    const height = end ? spec.station : parseFloat(nt.height) || spec.pylon;
    return { x: r1(p.x), z: r1(p.z), ground: r1(g), y: r1(g + height), kind: end ? 'station' : 'pylon' };
  });
  if (!supports.some((s) => inside(s.x, s.z, 200))) continue;
  // The lower end first: everything runs up from there
  if (supports[0].ground > supports[supports.length - 1].ground) supports.reverse();
  let length = 0;
  for (let i = 1; i < supports.length; i++) length += Math.hypot(supports[i].x - supports[i - 1].x, supports[i].y - supports[i - 1].y, supports[i].z - supports[i - 1].z);
  ropeways.push({ id: `w${e.id}`, name: t.name || '', kind: t.aerialway, occupancy: +t['aerialway:occupancy'] || null,
    capacity: +t['aerialway:capacity'] || null, duration: parseFloat(t['aerialway:duration']) || null, length: Math.round(length), supports });
}
log(`${ropeways.length} ropeways:`, ropeways.map((r) => `${r.name || r.kind} (${r.kind})`).join(', '));

const data = {
  meta: { source: 'OpenStreetMap contributors (ODbL); heights swisstopo swissALTI3D / swissALTIRegio', frame: FRAME.name, fetched: new Date().toISOString().slice(0, 10) },
  funiculars, ropeways
};
fs.writeFileSync(OUT, `// js/bergbahnen-data.js — GENERATED by tools/fetch-bergbahnen.mjs, do not edit by hand.\n// The funiculars and ropeways of Davos in the world frame of js/davos-frame.js. © OpenStreetMap contributors (ODbL), swisstopo.\nexport const BERGBAHNEN = ${JSON.stringify(data)};\n`);
log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
