// tools/markings-layer.mjs — layer `markings` of tools/trace-ground.mjs: the paint on the roads, traced from the
// full-resolution SWISSIMAGE into js/ground-markings-data.js. The areas (tools/data/ground-overrides.json markings) are
// cut into square cells; per cell a 0.1 m crop, the mask the carriageways of DAVOS_DATA.roads and every other paved
// surface (yards, forecourts, the car parks, private ones too, which OSM mostly lacks), the paint classified (tools/ground-sports.py classify-roads) and vectorised
// (tools/markings-fit.mjs). Inside the traced cells js/vector-ground.js draws this paint and the rule-based markings
// (js/road-paint.js, js/city-grid.js, the car parks' bay lines of js/parking.js) step back.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { CACHE, bboxOf, cropJob, fetchCrops } from './ground-aerial.mjs';
import { fitMarkings } from './markings-fit.mjs';
import { rowsOfBays, rowIn } from './markings-bays.mjs';
import { PARKING_DATA } from '../js/parking-data.js';
import { pointInRing } from '../js/ground-geometry.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CONF = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'ground-overrides.json'), 'utf8')).markings;
const OUT = path.join(DIR, '..', 'js', 'ground-markings-data.js');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = arg('--only'), REVIEW = process.argv.includes('--review');
const log = (...a) => console.log('[trace-ground markings]', ...a);
const ROAD_KINDS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service', 'pedestrian']);
const MARGIN = 2; // m round each cell (paint across its edge is cut where the cell owns it: by the blob's centre)

// The cells
const cells = [];
for (const area of CONF.areas) {
  const [ax0, az0, ax1, az1] = area.box, n = CONF.cell;
  for (let z = az0; z < az1; z += n) for (let x = ax0; x < ax1; x += n) {
    cells.push({ id: `${area.id}-${Math.round(x)}_${Math.round(z)}`, area: area.id, box: [x, z, Math.min(x + n, ax1), Math.min(z + n, az1)] });
  }
}
const todoCells = cells.filter((c) => !ONLY || c.id === ONLY || c.area === ONLY);
log(`${todoCells.length} cells`);
const jobs = todoCells.map((c) => {
  const [x0, z0, x1, z1] = c.box;
  const j = cropJob(c.id, [x0 - MARGIN, z0 - MARGIN, x1 + MARGIN, z1 + MARGIN]);
  const near = (bb) => bb[2] > j.x0 - 10 && bb[0] < x1 + MARGIN + 10 && bb[3] > j.z0 - 10 && bb[1] < z1 + MARGIN + 10;
  j.roads = DAVOS_DATA.roads.filter((r) => ROAD_KINDS.has(r.kind) && !r.tunnel && !r.bridge && near(bboxOf(r.pts)))
    .map((r) => ({ pts: j.px(r.pts), w: Math.max(2, (r.width || 5) - 0.8) / j.res })); // (the curbs' bright stones left out)
  j.exclude = [];
  j.cls = j.cls.replace(/\.cls$/, '.roads.cls');
  return j;
});
await fetchCrops(jobs, log);
const pyMtime = Math.max(...['ground-sports.py', 'markings-layer.mjs'].map((f) => fs.statSync(path.join(DIR, f)).mtimeMs)); // (the mask comes from here)
const todo = jobs.filter((j) => !fs.existsSync(j.cls) || fs.statSync(j.cls).mtimeMs < pyMtime);
if (todo.length) {
  const file = path.join(CACHE, 'markings-jobs.json');
  fs.writeFileSync(file, JSON.stringify(todo.map(({ px, url, ...j }) => j)));
  execFileSync('python3', ['-I', path.join(DIR, 'ground-sports.py'), 'classify-roads', file], { stdio: 'inherit' });
}

const r2 = (v) => Math.round(v * 100) / 100;
const results = [], reviews = [];
for (let k = 0; k < todoCells.length; k++) {
  const cell = todoCells[k], j = jobs[k];
  const cls = new Uint8Array(fs.readFileSync(j.cls));
  const yel = new Uint8Array(fs.readFileSync(j.cls + '.yel'));
  const fit = fitMarkings({ cls, yel, w: j.w, h: j.h, res: j.res, x0: j.x0, z0: j.z0 });
  if (process.env.YELLOW_HIST) { const hist = {}; for (const y of fit.stats.yellowness) { const b = Math.floor(y / 5) * 5; hist[b] = (hist[b] || 0) + 1; } log(cell.id, 'yellowness', JSON.stringify(hist)); }
  delete fit.stats.yellowness;
  // (a blob belongs to the cell that owns the middle of its first point… its centre)
  const [cx0, cz0, cx1, cz1] = cell.box;
  const owns = (pts) => { let x = 0, z = 0; for (let i = 0; i < pts.length; i += 2) { x += pts[i]; z += pts[i + 1]; } x /= pts.length / 2; z /= pts.length / 2; return x >= cx0 && x < cx1 && z >= cz0 && z < cz1; };
  const lines = fit.strokes.filter((s) => owns(s.pts)).map((s) => ({ c: s.c, w: r2(s.w), pts: s.pts.map(r2) }));
  const fills = fit.fills.filter((f) => owns(f.ring)).map((f) => ({ c: f.c, ring: f.ring.map(r2), ...(f.holes.length ? { holes: f.holes.map((h) => h.map(r2)) } : {}) }));
  log(cell.id, JSON.stringify(fit.stats), `kept ${lines.length} strokes, ${fills.length} fills`);
  results.push({ id: cell.id, box: cell.box, surfaces: [], lines, fills });
}

// --- The parking bays in the paint (the car parks OSM lacks): rows over all the cells, each given to the cell that owns
// its middle, with the separators the parked cars hide put back; which bays hold a car, from the photo
const buildings = DAVOS_DATA.buildings.map((b) => ({ ring: b.ring, bb: bboxOf(b.ring) }));
const blocked = (x, z) => buildings.some(({ ring, bb }) => x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3] && pointInRing(ring, x, z));
const mapped = PARKING_DATA.map((l) => l.ring); // (their bays are js/parking.js's: detected or laid out)
const rows = rowsOfBays(results.flatMap((r) => r.lines), { blocked }).filter((row) => !rowIn(row, mapped));
const quad = (b) => {
  const ux = Math.sin(b.angle), uz = Math.cos(b.angle), vx = -uz, vz = ux, out = [];
  for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push(b.x + ux * a * b.l / 2 + vx * c * b.w / 2, b.z + uz * a * b.l / 2 + vz * c * b.w / 2);
  return out;
};
const cellOf = (x, z) => results.findIndex((r) => x >= r.box[0] && x < r.box[2] && z >= r.box[1] && z < r.box[3]);
const byCell = new Map();
for (const row of rows) {
  const mx = row.bays.reduce((a, b) => a + b.x, 0) / row.bays.length, mz = row.bays.reduce((a, b) => a + b.z, 0) / row.bays.length;
  const k = cellOf(mx, mz);
  if (k < 0) continue;
  if (!byCell.has(k)) byCell.set(k, []);
  byCell.get(k).push(row);
}
const occJobs = [...byCell.entries()].map(([k, rs]) => ({ id: String(k), img: jobs[k].img, res: jobs[k].res, bays: rs.flatMap((r) => r.bays.map((b) => jobs[k].px(quad(b)))) }));
let occ = {};
if (occJobs.length) {
  const file = path.join(CACHE, 'markings-occ.json');
  fs.writeFileSync(file, JSON.stringify(occJobs));
  execFileSync('python3', ['-I', path.join(DIR, 'ground-sports.py'), 'occupancy', file], { stdio: 'inherit' });
  occ = JSON.parse(fs.readFileSync(file.replace('.json', '-occ.json'), 'utf8'));
}
let nBays = 0, nCars = 0, nPut = 0;
for (const [k, rs] of byCell) {
  const r = results[k], flags = occ[String(k)] || [];
  let i = 0;
  r.lots = rs.map((row, n) => ({
    id: `${r.id}-p${n}`, kind: 'traced', ring: row.ring.map(r2),
    bays: row.bays.map((b) => { const o = flags[i++] || 0; nBays++; nCars += o; return [r2(b.x), r2(b.z), Math.round(b.angle * 1000) / 1000, r2(b.w), r2(b.l), o]; })
  }));
  for (const row of rs) for (const s of row.added) { r.lines.push({ c: s.c, w: r2(s.w), pts: s.pts.map(r2) }); nPut++; }
}
log(`${rows.length} rows of bays: ${nBays} bays, ${nCars} with a car, ${nPut} separators put back`);
if (REVIEW) for (let k = 0; k < results.length; k++) {
  const r = results[k], j = jobs[k];
  reviews.push({
    img: j.img, out: path.join(CACHE, `${r.id}-review.png`), scale: 1, colours: true,
    lines: r.lines.map((l) => ({ c: l.c, pts: j.px(l.pts) })), fills: r.fills.map((f) => ({ c: f.c, ring: j.px(f.ring) })),
    bays: (r.lots || []).flatMap((lot) => lot.bays.map(([x, z, angle, w, l, o]) => ({ quad: j.px(quad({ x, z, angle, w, l })), occupied: o })))
  });
}

let all = results;
if (ONLY && fs.existsSync(OUT)) {
  const { GROUND_MARKINGS } = await import(`${pathToFileURL(OUT).href}?${Date.now()}`);
  const ids = new Set(results.map((r) => r.id));
  all = [...GROUND_MARKINGS.sites.filter((s) => !ids.has(s.id)), ...results];
}
const data = { source: 'swisstopo SWISSIMAGE (road paint traced by tools/trace-ground.mjs --layer markings)', fetched: new Date().toISOString().slice(0, 10), layer: 'markings', sites: all };
fs.writeFileSync(OUT, `// js/ground-markings-data.js — GENERATED by tools/trace-ground.mjs --layer markings, do not edit by hand (areas: tools/data/ground-overrides.json).\nexport const GROUND_MARKINGS = ${JSON.stringify(data)};\n`);
log(`${all.length} cells, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB -> ${path.relative(process.cwd(), OUT)}`);
if (REVIEW && reviews.length) {
  const file = path.join(CACHE, 'markings-review.json');
  fs.writeFileSync(file, JSON.stringify(reviews));
  execFileSync('python3', ['-I', path.join(DIR, 'ground-sports.py'), 'review', file], { stdio: 'inherit' });
}
