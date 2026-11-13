// tools/check-road-smoothness.mjs — drives every street over the built terrain (data/davos-terrain.bin) and lists the
// spots where the carriageway is not smooth: the streets are draped on the 8 m grid (js/terrain.js drapeOverlay), so
// what a car feels is the triangulated surface of js/terrain-grid.js gridHeight under the way's centre line.
//
// Along every drivable way off the bridges and tunnels (the same ways as the street beds of
// tools/build-davos-terrain.mjs), sampled every metre:
//   kink   the change of grade across KINK_SPAN m (a crest or a dip the length of a car: 0.08 = 8 % within 8 m)
//   bump   the height off the way's own profile Gaussian-smoothed over ~±2 SIGMA m (a lump or a notch)
//   tilt   the cross slope between the two edges of the carriageway (at 0.8 of its half width)
// Flagged samples within CLUSTER m of each other make one spot; the spots are printed worst first.
// With --held (the held.bin a build with TERRAIN_STAGES=dir writes), each flagged metre is put down to why the grid
// nodes under it are not where the streets want them: under the track, in the water, between streets stacked on a
// slope, under a house, at the most a node may move, or between streets at different heights meeting there.
// With --base (the model before the beds, 0-model.bin of TERRAIN_STAGES), the houses are checked too: how far the ground
// under a footprint was raised (buries the house) or cut (shows its plinth) against the model.
// usage: node tools/check-road-smoothness.mjs [terrain.bin] [--json out.json] [--top N] [--held held.bin] [--base 0-model.bin]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTerrain, gridHeight } from '../js/terrain-grid.js';
import { lonLatToWorld } from '../js/davos-frame.js';
import { polygons, bbox as ringBox } from './osm-geometry.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : def; };
const JSON_OUT = opt('--json', null), TOP = +opt('--top', 40), HELD_FILE = opt('--held', null), REASON_FILTER = opt('--reason', null), BASE_FILE = opt('--base', null);
const FILE = args[0] || path.join(DIR, '..', 'data', 'davos-terrain.bin');
const buf = fs.readFileSync(FILE);
const grid = parseTerrain(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const osm = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'cache', 'osm_davos.json'), 'utf8'));

const KINK_SPAN = 8, SIGMA = 8, CLUSTER = 25;
const LIMIT = { kink: 0.08, bump: 0.35, tilt: 0.10 };
const KINDS = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(residential|unclassified|living_street|service)$/;
const WIDTH = { motorway: 14, trunk: 12, primary: 10, secondary: 8, tertiary: 7, residential: 6, unclassified: 6, living_street: 5, service: 3.5 };
const LANES = { motorway: 4, trunk: 4, primary: 2, secondary: 2, tertiary: 2, residential: 2, unclassified: 2, living_street: 1, service: 1 };
const isOn = (v) => !!v && v !== 'no';
const h = (x, z) => gridHeight(grid, x, z);
const held = HELD_FILE ? fs.readFileSync(HELD_FILE) : null;
const REASONS = ['free', 'rail', 'water', 'stacked', 'house', 'limit', 'junction'];
// (the worst reason among the three nodes of the triangle under (x, z))
const reasonAt = (x, z) => {
  const u = (x - grid.minX) / grid.cell, v = (z - grid.minZ) / grid.cell, i = Math.floor(u), j = Math.floor(v), k = j * grid.cols + i;
  const r = [held[k], held[k + grid.cols + 1], held[u - i >= v - j ? k + 1 : k + grid.cols]].filter((c) => c);
  return r.length ? Math.min(...r) : 0;
};
const inside = (p) => p.x > grid.minX + 1 && p.x < grid.maxX - 1 && p.z > grid.minZ + 1 && p.z < grid.maxZ - 1;

// Ends of bridges and tunnels: the ramps there meet a deck, not the ground — left out within a few metres
const structureEnds = [];
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type !== 'way' || !e.geometry || !(t.highway || t.railway)) continue;
  if (isOn(t.bridge) || isOn(t.tunnel) || t.covered === 'yes') {
    for (const p of [e.geometry[0], e.geometry[e.geometry.length - 1]]) structureEnds.push(lonLatToWorld(p.lon, p.lat));
  }
}
const nearStructureEnd = (x, z) => structureEnds.some((p) => Math.abs(p.x - x) < 12 && Math.abs(p.z - z) < 12 && Math.hypot(p.x - x, p.z - z) < 12);

const flags = [];
const stats = { ways: 0, metres: 0, kink: [], bump: [], tilt: [] };
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type !== 'way' || !e.geometry || !KINDS.test(t.highway || '') || t.area === 'yes') continue;
  if (isOn(t.bridge) || (isOn(t.tunnel) && t.tunnel !== 'building_passage') || t.covered === 'yes' || (parseFloat(t.layer) || 0) < 0) continue;
  const base = t.highway.replace(/_link$/, '');
  const width = parseFloat(t.width) || Math.max(WIDTH[base] ?? 3, (parseFloat(t.lanes) || LANES[base] || 1) * 3);
  const half = width / 2;
  const pts = e.geometry.map((p) => lonLatToWorld(p.lon, p.lat)), S = [];
  let s = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], L = Math.hypot(b.x - a.x, b.z - a.z), m1 = Math.max(1, Math.ceil(L));
    if (L < 1e-3) continue;
    for (let m = S.length ? 1 : 0; m <= m1; m++) S.push({ x: a.x + ((b.x - a.x) * m) / m1, z: a.z + ((b.z - a.z) * m) / m1, s: s + (L * m) / m1, ux: (b.x - a.x) / L, uz: (b.z - a.z) / L });
    s += L;
  }
  if (S.length < 3 || !S.every(inside)) continue;
  for (const p of S) p.h = h(p.x, p.z);
  stats.ways++; stats.metres += s;
  // The smoothed profile (Gaussian-weighted local line, as the street beds)
  const prof = S.map((p) => {
    let w0 = 0, w1 = 0, w2 = 0, h0 = 0, h1 = 0;
    for (const q of S) {
      const d = q.s - p.s;
      if (d < -3 * SIGMA || d > 3 * SIGMA) continue;
      const w = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
      w0 += w; w1 += w * d; w2 += w * d * d; h0 += w * q.h; h1 += w * d * q.h;
    }
    const det = w0 * w2 - w1 * w1;
    return det > 1e-6 ? (h0 * w2 - h1 * w1) / det : h0 / w0;
  });
  // (the height at arc length s, linear between the samples)
  let cursor = 0;
  const at = (sv) => {
    while (cursor > 0 && S[cursor].s > sv) cursor--;
    while (cursor < S.length - 2 && S[cursor + 1].s < sv) cursor++;
    const a = S[cursor], b = S[cursor + 1], f = (sv - a.s) / (b.s - a.s || 1);
    return a.h + (b.h - a.h) * Math.max(0, Math.min(1, f));
  };
  const H2 = KINK_SPAN / 2, END = 3;
  for (let k = 0; k < S.length; k++) {
    const p = S[k];
    if (p.s < END || p.s > s - END || nearStructureEnd(p.x, p.z)) continue;
    let kink = 0;
    if (p.s >= H2 && p.s <= s - H2) {
      const g1 = (p.h - at(p.s - H2)) / H2, g2 = (at(p.s + H2) - p.h) / H2;
      kink = Math.abs(g2 - g1);
    }
    const bump = Math.abs(p.h - prof[k]);
    const q = half * 0.8, hl = h(p.x - p.uz * q, p.z + p.ux * q), hr = h(p.x + p.uz * q, p.z - p.ux * q);
    const tilt = Math.abs(hl - hr) / (2 * q);
    if (k % 4 === 0) { stats.kink.push(kink); stats.bump.push(bump); stats.tilt.push(tilt); }
    const score = Math.max(kink / LIMIT.kink, bump / LIMIT.bump, tilt / LIMIT.tilt);
    if (score > 1) {
      // (the reason: the worst over the stretch that makes the kink)
      let reason = 0;
      if (held) for (const d of [-H2, -H2 / 2, 0, H2 / 2, H2]) { const r = reasonAt(p.x + p.ux * d, p.z + p.uz * d); if (r && (!reason || r < reason)) reason = r; }
      flags.push({ x: p.x, z: p.z, kink, bump, tilt, score, way: e.id, name: t.name || t.ref || '', kind: t.highway, reason });
    }
  }
}

// Cluster the flagged samples into spots
flags.sort((a, b) => b.score - a.score);
const spots = [];
const CELL = CLUSTER, cells = new Map();
for (const f of flags) {
  const ci = Math.floor(f.x / CELL), cj = Math.floor(f.z / CELL);
  let spot = null;
  for (let di = -1; di <= 1 && !spot; di++) for (let dj = -1; dj <= 1 && !spot; dj++) {
    for (const s of cells.get(`${ci + di},${cj + dj}`) || []) if (Math.hypot(s.x - f.x, s.z - f.z) < CLUSTER) { spot = s; break; }
  }
  if (!spot) {
    spot = { x: f.x, z: f.z, score: f.score, kink: 0, bump: 0, tilt: 0, samples: 0, reasons: {}, names: new Set(), kinds: new Set(), ways: new Set() };
    spots.push(spot);
    const key = `${ci},${cj}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(spot);
  }
  spot.samples++;
  spot.reasons[REASONS[f.reason]] = (spot.reasons[REASONS[f.reason]] || 0) + 1;
  spot.kink = Math.max(spot.kink, f.kink); spot.bump = Math.max(spot.bump, f.bump); spot.tilt = Math.max(spot.tilt, f.tilt);
  if (f.name) spot.names.add(f.name);
  spot.kinds.add(f.kind); spot.ways.add(f.way);
}

const pct = (arr, q) => { const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
console.log(`[road-smoothness] ${stats.ways} ways, ${(stats.metres / 1000).toFixed(1)} km driven`);
for (const m of ['kink', 'bump', 'tilt']) {
  console.log(`  ${m.padEnd(5)} p50 ${pct(stats[m], 0.5).toFixed(3)}  p95 ${pct(stats[m], 0.95).toFixed(3)}  p99 ${pct(stats[m], 0.99).toFixed(3)}  max ${pct(stats[m], 1).toFixed(3)}  (limit ${LIMIT[m]})`);
}
const flaggedMetres = flags.length;
console.log(`  ${flaggedMetres} m over a limit (${((100 * flaggedMetres) / stats.metres).toFixed(2)} %), ${spots.length} spots`);
if (held) {
  const by = {};
  for (const f of flags) by[REASONS[f.reason]] = (by[REASONS[f.reason]] || 0) + 1;
  console.log('  by reason: ' + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([r, m]) => `${r} ${m} m`).join(', '));
}
const serious = spots.filter((s) => s.score > 1.5);
console.log(`  ${serious.length} spots over 1.5 × a limit\n`);
const mainReason = (s) => Object.entries(s.reasons).sort((a, b) => b[1] - a[1])[0][0];
console.log('score  kink   bump   tilt   len  x       z       why       street');
for (const s of spots.filter((s) => !REASON_FILTER || mainReason(s) === REASON_FILTER).slice(0, TOP)) {
  console.log(`${s.score.toFixed(2).padStart(5)}  ${s.kink.toFixed(3)}  ${s.bump.toFixed(2).padStart(5)}  ${s.tilt.toFixed(3)}  ${String(s.samples).padStart(3)}  ${s.x.toFixed(0).padStart(6)}  ${s.z.toFixed(0).padStart(6)}  ${(held ? mainReason(s) : '').padEnd(8)}  ${[...s.names].join(' / ') || '–'} (${[...s.kinds].join(',')})`);
}
// The metre-gauge tracks off the bridges and tunnels (laid before the streets, which must leave them be): their kinks
const railKinks = [];
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type !== 'way' || !e.geometry || t.railway !== 'narrow_gauge' || isOn(t.bridge) || isOn(t.tunnel) || (parseFloat(t.layer) || 0) < 0) continue;
  const pts = e.geometry.map((p) => lonLatToWorld(p.lon, p.lat)), S = [];
  let s = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], L = Math.hypot(b.x - a.x, b.z - a.z), m1 = Math.max(1, Math.ceil(L));
    if (L < 1e-3) continue;
    for (let m = S.length ? 1 : 0; m <= m1; m++) S.push({ x: a.x + ((b.x - a.x) * m) / m1, z: a.z + ((b.z - a.z) * m) / m1 });
    s += L;
  }
  if (S.length < 2 * KINK_SPAN + 1 || !S.every(inside)) continue;
  for (const p of S) p.h = h(p.x, p.z);
  for (let k = KINK_SPAN / 2 + 3; k < S.length - KINK_SPAN / 2 - 3; k++) {
    if (nearStructureEnd(S[k].x, S[k].z)) continue;
    const g1 = (S[k].h - S[k - KINK_SPAN / 2].h) / (KINK_SPAN / 2), g2 = (S[k + KINK_SPAN / 2].h - S[k].h) / (KINK_SPAN / 2);
    railKinks.push(Math.abs(g2 - g1));
  }
}
console.log(`\n[rails] ${(railKinks.length / 1000).toFixed(1)} km, kink p95 ${pct(railKinks, 0.95).toFixed(3)} p99 ${pct(railKinks, 0.99).toFixed(3)} max ${pct(railKinks, 1).toFixed(3)}, ${railKinks.filter((k) => k > 0.03).length} m over 0.03`);
if (BASE_FILE) {
  const b = fs.readFileSync(BASE_FILE), base = parseTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const raised = [], cut = [];
  for (const e of osm.elements) {
    if (e.type === 'node' || !e.tags?.building) continue;
    for (const { ring } of polygons(e)) {
      const bb = ringBox(ring);
      if (bb.x0 < grid.minX || bb.x1 > grid.maxX || bb.z0 < grid.minZ || bb.z1 > grid.maxZ) continue;
      let up = 0, down = 0;
      for (const [x, z] of ring) { const d = h(x, z) - gridHeight(base, x, z); up = Math.max(up, d); down = Math.max(down, -d); }
      raised.push(up); cut.push(down);
    }
  }
  const count = (arr, v) => arr.filter((d) => d > v).length;
  console.log(`[houses] ${raised.length} footprints: ground raised > 1 m at ${count(raised, 1)}, > 2 m at ${count(raised, 2)}, > 3 m at ${count(raised, 3)}; cut > 2 m at ${count(cut, 2)}, > 4 m at ${count(cut, 4)}`);
}
if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    stats: { ways: stats.ways, km: stats.metres / 1000, flaggedMetres, spots: spots.length },
    spots: spots.map((s) => ({ ...s, names: [...s.names], kinds: [...s.kinds], ways: [...s.ways] }))
  }, null, 1));
  console.log(`\nwrote ${JSON_OUT}`);
}
