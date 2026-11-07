// tools/trace-ground.mjs — derives the vector ground (js/vector-ground.js) from the full-resolution swisstopo SWISSIMAGE:
// surfaces with a ground kind and painted lines, so that what must be sharp no longer depends on the orthophoto's pixels.
// Layer `sports` (npm run data:ground) writes js/ground-sports-data.js: the sports grounds of the map (OSM leisure=pitch
// in DAVOS_DATA.parks, their sport/surface tags from tools/data/cache/osm_davos.json, plus the grounds OSM lacks, from
// tools/data/ground-overrides.json). Per site a crop of the federal WMS (ch.swisstopo.swissimage, 0.1 m) is cached in
// tools/data/cache/ground-aerial/; tools/ground-sports.py classifies its pixels (tartan, turf, paint); the shapes are
// fitted here (tools/sports-fit.mjs): tartan and turf surfaces, the track's stadium snapped onto its painted lanes,
// the football pitch and the courts found in their paint, with the regulation markings of tools/sports-templates.mjs.
// --review draws every site's vectors over its photo (<site>-review.png in the cache) for checking by eye.
// usage: node tools/trace-ground.mjs [--layer sports] [--only <site id>] [--review]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { worldToLv95 } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { fitSite } from './sports-fit.mjs';
import { linePoints } from '../js/ground-geometry.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, 'data', 'cache', 'ground-aerial');
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'ground-overrides.json'), 'utf8'));
const WMS = 'https://wms.geo.admin.ch/';
const RES = 0.1, MAX_PX = 3800, MARGIN = 12, CONCURRENCY = 4;
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const LAYER = arg('--layer') || 'sports';
const ONLY = arg('--only');
const REVIEW = process.argv.includes('--review');
const log = (...a) => console.log('[trace-ground]', ...a);
if (LAYER !== 'sports') throw new Error(`unknown layer ${LAYER}`);
const CONF = OVERRIDES.sports;
const OUT = path.join(DIR, '..', 'js', 'ground-sports-data.js');
fs.mkdirSync(CACHE, { recursive: true });

// --- The sites --------------------------------------------------------------------------------------------------------
const bboxOf = (ring) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < ring.length; i += 2) { b[0] = Math.min(b[0], ring[i]); b[1] = Math.min(b[1], ring[i + 1]); b[2] = Math.max(b[2], ring[i]); b[3] = Math.max(b[3], ring[i + 1]); }
  return b;
};
const boxGap = (a, b) => Math.max(a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

function osmTags() {
  const osm = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'cache', 'osm_davos.json'), 'utf8'));
  const tags = new Map();
  for (const e of osm.elements) if (e.type !== 'node' && e.tags?.leisure === 'pitch') tags.set(`${e.type[0]}${e.id}`, e.tags);
  return tags;
}

function collectSites() {
  const tags = osmTags(), skipSports = new Set(CONF.skipSports || []);
  const pitches = DAVOS_DATA.parks.filter((p) => p.kind === 'pitch').map((p) => {
    const t = tags.get(p.id) || {};
    return { id: p.id, ring: p.ring, box: bboxOf(p.ring), sport: t.sport || '', surface: t.surface || '', name: p.name || t.name || '', covered: t.covered === 'yes' || !!t['building'] };
  }).filter((p) => !skipSports.has(p.sport) && !p.covered);
  const sites = (CONF.extraSites || []).map((s) => ({ ...s, pitches: [], hints: s.hints || {} }));
  for (const p of pitches) {
    const inExtra = sites.find((s) => boxGap(s.box, p.box) < 0 && p.box[0] >= s.box[0] - 20 && p.box[2] <= s.box[2] + 20);
    if (inExtra) { inExtra.pitches.push(p); continue; }
    const near = sites.find((s) => !s.fixed && s.auto && boxGap(s.box, p.box) < 30);
    if (near) { near.pitches.push(p); near.box = union(near.box, p.box); continue; }
    sites.push({ id: p.id, name: p.name, auto: true, box: p.box, pitches: [p], hints: {} });
  }
  for (const s of sites) {
    const o = CONF.sites?.[s.id] || {};
    Object.assign(s.hints, o.hints || {});
    s.override = o;
    const m = o.margin ?? (s.auto ? MARGIN : 0);
    s.crop = [s.box[0] - m, s.box[1] - m, s.box[2] + m, s.box[3] + m];
    if (!s.name) s.name = s.pitches.find((p) => p.name)?.name || '';
  }
  return sites.filter((s) => !s.override.skip);
}

// --- Fetching the crops -----------------------------------------------------------------------------------------------
async function fetchRetry(url, file) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url).catch((error) => ({ ok: false, status: error.message }));
    if (res.ok && /^image\//.test(res.headers.get('content-type') || '')) { fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); return; }
    if (attempt === 4) throw new Error(`${url}: ${res.status}`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

function job(site) {
  const [x0, z0, x1, z1] = site.crop;
  const res = Math.max(RES, (x1 - x0) / MAX_PX, (z1 - z0) / MAX_PX);
  const w = Math.round((x1 - x0) / res), h = Math.round((z1 - z0) / res);
  const sw = worldToLv95(x0, z1), ne = worldToLv95(x1, z0); // world z grows to the south
  const key = `${x0}_${z0}_${x1}_${z1}`.replace(/\./g, 'p');
  const img = path.join(CACHE, `${site.id}-${key}-${res.toFixed(3)}.jpg`);
  const px = (ring) => { const out = []; for (let i = 0; i < ring.length; i += 2) out.push([(ring[i] - x0) / res, (ring[i + 1] - z0) / res]); return out; };
  const buildings = DAVOS_DATA.buildings.filter((b) => { const bb = bboxOf(b.ring); return bb[2] > x0 && bb[0] < x1 && bb[3] > z0 && bb[1] < z1; }).map((b) => px(b.ring));
  return {
    id: site.id, img, cls: img.replace(/\.jpg$/, '.cls'), res, x0, z0, w, h, buildings, px,
    url: `${WMS}?${new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'ch.swisstopo.swissimage', STYLES: '', CRS: 'EPSG:2056',
      BBOX: `${sw.E},${sw.N},${ne.E},${ne.N}`, WIDTH: String(w), HEIGHT: String(h), FORMAT: 'image/jpeg'
    })}`
  };
}

// --- Run --------------------------------------------------------------------------------------------------------------
const sites = collectSites().filter((s) => !ONLY || s.id === ONLY);
if (!sites.length) throw new Error(`no site ${ONLY}`);
log(`${sites.length} sites:`, sites.map((s) => `${s.id} (${s.pitches.map((p) => p.sport || '?').join(', ') || '–'})`).join('; '));
const jobs = sites.map(job);
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    if (!fs.existsSync(j.img)) { await fetchRetry(j.url, j.img); log('fetched', path.basename(j.img)); }
  }
}));
const todo = jobs.filter((j) => !fs.existsSync(j.cls) || fs.statSync(j.cls).mtimeMs < fs.statSync(path.join(DIR, 'ground-sports.py')).mtimeMs);
if (todo.length) {
  const jobFile = path.join(CACHE, 'jobs.json');
  fs.writeFileSync(jobFile, JSON.stringify(todo.map(({ px, url, ...j }) => j)));
  execFileSync('python3', ['-I', path.join(DIR, 'ground-sports.py'), 'classify', jobFile], { stdio: 'inherit' });
}

// Fit
const r2 = (v) => Math.round(v * 100) / 100, r4 = (v) => Math.round(v * 10000) / 10000;
const roundRing = (ring) => ring.map(r2);
const results = [];
const reviews = [];
for (let k = 0; k < sites.length; k++) {
  const site = sites[k], j = jobs[k];
  const cls = new Uint8Array(fs.readFileSync(j.cls));
  if (cls.length !== j.w * j.h) throw new Error(`${j.cls}: ${cls.length} bytes for ${j.w} × ${j.h}`);
  const fit = fitSite(site, { cls, w: j.w, h: j.h, res: j.res, x0: j.x0, z0: j.z0 });
  for (const s of site.override.surfaces || []) fit.surfaces.push(s);
  for (const l of site.override.lines || []) fit.lines.push(l);
  log(site.id, fit.summary);
  const out = {
    id: site.id, name: site.name, osm: site.pitches.map((p) => p.id), box: fit.box.map(r2),
    surfaces: fit.surfaces.map((s) => ({ kind: s.kind, ring: roundRing(s.ring), ...(s.holes?.length ? { holes: s.holes.map(roundRing) } : {}) })),
    lines: fit.lines.map((l) => ({ c: l.c, w: l.w, ...(l.arc ? { arc: [r2(l.arc[0]), r2(l.arc[1]), r2(l.arc[2]), r4(l.arc[3]), r4(l.arc[4])] } : { pts: roundRing(l.pts) }), ...(l.traced ? { t: 1 } : {}) }))
  };
  if (fit.track) out.track = Object.fromEntries(Object.entries(fit.track).map(([key, v]) => [key, typeof v === 'number' ? (key === 'heading' ? r4(v) : r2(v)) : v]));
  if (fit.courts?.length) out.courts = fit.courts.map((c) => ({ sport: c.sport, cx: r2(c.cx), cz: r2(c.cz), heading: r4(c.heading), l: r2(c.l), w: r2(c.w), score: r2(c.score) }));
  if (out.surfaces.length || out.lines.length) results.push(out);
  if (REVIEW) {
    const px = (flat) => j.px(flat);
    reviews.push({
      img: j.img, out: path.join(CACHE, `${site.id}-review.png`), scale: Math.min(1, 2400 / Math.max(j.w, j.h)),
      surfaces: out.surfaces.map((s) => ({ kind: s.kind, ring: px(s.ring), holes: (s.holes || []).map(px) })),
      lines: out.lines.map((l) => ({ c: l.c, traced: !!l.t, pts: px(linePoints(l, 0.05)) })),
      osm: site.pitches.map((p) => px(p.ring)),
      labels: fit.labels.map((lb) => ({ text: lb.text, at: [(lb.x - j.x0) / j.res, (lb.z - j.z0) / j.res] }))
    });
  }
}

// Write (with --only: replace that site in the existing file)
let all = results;
if (ONLY && fs.existsSync(OUT)) {
  const { GROUND_SPORTS } = await import(`${pathToFileURL(OUT).href}?${Date.now()}`);
  all = [...GROUND_SPORTS.sites.filter((s) => s.id !== ONLY), ...results];
}
const data = { source: 'swisstopo SWISSIMAGE (vectors traced by tools/trace-ground.mjs), OSM leisure=pitch (© OpenStreetMap contributors, ODbL)', fetched: new Date().toISOString().slice(0, 10), layer: 'sports', sites: all };
fs.writeFileSync(OUT, `// js/ground-sports-data.js — GENERATED by tools/trace-ground.mjs --layer sports, do not edit by hand (corrections: tools/data/ground-overrides.json).\nexport const GROUND_SPORTS = ${JSON.stringify(data)};\n`);
log(`${all.length} sites, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB -> ${path.relative(process.cwd(), OUT)}`);
if (REVIEW && reviews.length) {
  const file = path.join(CACHE, 'review.json');
  fs.writeFileSync(file, JSON.stringify(reviews));
  execFileSync('python3', ['-I', path.join(DIR, 'ground-sports.py'), 'review', file], { stdio: 'inherit' });
}
