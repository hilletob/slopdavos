// tools/classes-layer.mjs — layer `classes` of tools/trace-ground.mjs: the town's open ground (lawns, shrubs and trees,
// paving, gravel, red paving; what lies between the streets, the buildings and the car parks, which are drawn as solids
// and overlays already) as maps of ground kinds, one per orthophoto tile, from the local high-resolution tiles
// (data/hires/swissimage/, 0.25 m: npm run data:hires) into data/ground-classes/<tile>.png: one byte a pixel at 0.5 m,
// the ground kind's number + 1 (js/ground-kind-names.js). js/swissimage.js draws such a tile's chunk from its map and
// the kinds' procedural colours (js/ground-kinds.js) instead of the photograph, keeping only the photo's smallest level
// for its tint (QUALITY.groundClasses). Shadows are not a class: the game casts its own, so the shade in the photo
// goes to the ground it falls on.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { GROUND_KIND_INDEX } from '../js/ground-kind-names.js';
import { CACHE, bboxOf } from './ground-aerial.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..');
const CONF = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'ground-overrides.json'), 'utf8')).classes;
const HIRES = path.join(ROOT, 'data', 'hires', 'swissimage');
const OUT = path.join(ROOT, 'data', 'ground-classes');
const SCALE = 0.5; // of the hires tiles' resolution (0.25 m -> 0.5 m)
const log = (...a) => console.log('[trace-ground classes]', ...a);
if (!fs.existsSync(path.join(HIRES, 'index.json'))) throw new Error('no high-resolution orthophotos: npm run data:hires first');
const index = JSON.parse(fs.readFileSync(path.join(HIRES, 'index.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const KINDS = Object.fromEntries(['lawn', 'shrub', 'paving', 'gravel', 'red-paving', 'asphalt'].map((k) => [k, GROUND_KIND_INDEX[k] + 1]));
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const tiles = index.tiles.filter((t) => CONF.areas.some((a) => overlaps(a.box, [t.x0, t.z0, t.x1, t.z1])));
log(`${tiles.length} tiles`);
const jobs = tiles.map((t) => {
  const px = (ring) => { const out = []; for (let i = 0; i < ring.length; i += 2) out.push([(ring[i] - t.x0) / t.res, (ring[i + 1] - t.z0) / t.res]); return out; };
  const box = [t.x0, t.z0, t.x1, t.z1];
  return {
    id: t.f, img: path.join(HIRES, t.f), out: path.join(OUT, t.f.replace(/\.webp$/, '.png')), res: t.res, scale: SCALE, kinds: KINDS,
    buildings: DAVOS_DATA.buildings.filter((b) => overlaps(bboxOf(b.ring), box)).map((b) => px(b.ring))
  };
});
const file = path.join(CACHE, 'classes-jobs.json');
fs.writeFileSync(file, JSON.stringify(jobs));
execFileSync('python3', ['-I', path.join(DIR, 'ground-sports.py'), 'classify-ground', file], { stdio: 'inherit' });
// the index: every map there is (the earlier runs' too)
const done = index.tiles.filter((t) => fs.existsSync(path.join(OUT, t.f.replace(/\.webp$/, '.png'))));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
  source: 'swisstopo SWISSIMAGE 0.25 m, classified by tools/trace-ground.mjs --layer classes', fetched: new Date().toISOString().slice(0, 10),
  res: index.tiles[0].res / SCALE, kinds: KINDS,
  tiles: done.map((t) => ({ f: t.f.replace(/\.webp$/, '.png'), i0: t.i0, j0: t.j0, x0: t.x0, z0: t.z0, x1: t.x1, z1: t.z1, res: t.res / SCALE }))
}));
const bytes = done.reduce((a, t) => a + fs.statSync(path.join(OUT, t.f.replace(/\.webp$/, '.png'))).size, 0);
log(`${done.length} maps, ${(bytes / 1024).toFixed(0)} KB -> ${path.relative(process.cwd(), OUT)}`);
