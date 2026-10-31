// tools/fetch-mapillary.mjs — writes js/facades-data.js: the facade colour of the buildings seen from the street, from
// Mapillary street-level images (CC BY-SA 4.0, Mapillary contributors), so that js/swissbuildings3d.js paints them in
// their own colours (and as timber houses where the facade is mostly dark wood) instead of random ones.
//
// 1. Image metadata over the built-up valley floor (the Graph API `images` endpoint, in 0.005° tiles: it returns at most
//    2000 images per request), cached in tools/data/cache/mapillary/images.json.
// 2. For every swissBUILDINGS3D building (keyed by its surveyed centre, the batch table's Latitude/Longitude to 6
//    decimals, which bakeTile reads too), the images 8-45 m away that look at it — the facade's bearing extent inside
//    the camera's field of view, with no other footprint in between — and the facade's box in each image (columns
//    from the bearings, rows from the camera height, the distance and the building's height). At most 4 per
//    building, nearest, most frontal and newest first, summer daylight (May-October) preferred.
// 3. tools/mapillary-sample.py downloads the small thumbnails (signed public URLs) and measures each box: the median
//    colour in linear RGB without sky, window darks and vegetation, the share of dark brown (timber), after a mild
//    per-image exposure and white-balance normalisation; the boxes of a building are combined by weight.
//
// The token is read from .env.local (MAPILLARY_TOKEN=MLY|…) and only sent to graph.mapillary.com as the
// Authorization header (via curl's config on stdin, so it never appears in a command line or a log).
// usage: node tools/fetch-mapillary.mjs [--refresh]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lonLatToWorld, WORLD_BOUNDS } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..');
const CACHE = path.join(DIR, 'data', 'cache', 'mapillary');
const OUT = path.join(ROOT, 'js', 'facades-data.js');
const log = (...a) => console.log('[mapillary]', ...a);
fs.mkdirSync(CACHE, { recursive: true });

function token() {
  const env = fs.existsSync(path.join(ROOT, '.env.local')) ? fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8') : '';
  const t = (env.match(/^MAPILLARY_TOKEN=(.*)$/m) || [])[1]?.trim() || process.env.MAPILLARY_TOKEN;
  if (!t) throw new Error('MAPILLARY_TOKEN missing in .env.local');
  return t;
}

// curl with the token in a config read from stdin (not on the command line), generous timeouts, retries
function graph(url, tok) {
  return new Promise((resolve) => {
    const p = spawn('curl', ['-s', '--max-time', '120', '--connect-timeout', '60', '-K', '-', url]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => { try { resolve(JSON.parse(out)); } catch { resolve(null); } });
    p.stdin.end(`header = "Authorization: OAuth ${tok}"\n`);
  });
}

// --- 1. Image metadata -----------------------------------------------------------------------------------------------------
const FIELDS = 'id,computed_geometry,geometry,computed_compass_angle,compass_angle,is_pano,camera_type,captured_at,camera_parameters,width,height,thumb_256_url,thumb_1024_url';
// The valley floor from Davos Platz to Davos Dorf and the Dischma entrance (WGS84)
const AREA = [9.805, 46.783, 9.862, 46.820], STEP = 0.005;
const META = path.join(CACHE, 'images.json');
let images;
if (fs.existsSync(META) && !process.argv.includes('--refresh')) images = JSON.parse(fs.readFileSync(META, 'utf8'));
else {
  const tok = token(), boxes = [];
  for (let lon = AREA[0]; lon < AREA[2] - 1e-9; lon += STEP) for (let lat = AREA[1]; lat < AREA[3] - 1e-9; lat += STEP) {
    boxes.push([lon, lat, Math.min(AREA[2], lon + STEP), Math.min(AREA[3], lat + STEP)].map((v) => v.toFixed(4)));
  }
  const byId = new Map();
  let next = 0, done = 0, failed = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < boxes.length) {
      const b = boxes[next++];
      let res = null;
      for (let attempt = 1; attempt <= 4 && !res?.data; attempt++) {
        res = await graph(`https://graph.mapillary.com/images?fields=${FIELDS}&limit=2000&bbox=${b.join(',')}`, tok);
        if (!res?.data) await new Promise((r) => setTimeout(r, attempt * 3000));
      }
      if (!res?.data) failed++;
      for (const im of res?.data || []) byId.set(im.id, im);
      if (++done % 10 === 0) log(`${done}/${boxes.length} tiles, ${byId.size} images`);
    }
  }));
  images = [...byId.values()];
  fs.writeFileSync(META, JSON.stringify(images));
  log(`${images.length} images (${failed} tiles failed)`);
}

// --- 2. Buildings and the images that see their facades ---------------------------------------------------------------------
// Buildings: the surveyed centres and heights from the swissBUILDINGS3D batch tables
const bIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'swissbuildings3d', 'index.json'), 'utf8'));
const buildings = [];
for (const t of bIndex.tiles) {
  const buf = fs.readFileSync(path.join(ROOT, 'data', 'swissbuildings3d', bIndex.base, t.u));
  const ftj = buf.readUInt32LE(12), ftb = buf.readUInt32LE(16), btj = buf.readUInt32LE(20);
  if (!btj) continue;
  const bt = JSON.parse(buf.toString('utf8', 28 + ftj + ftb, 28 + ftj + ftb + btj));
  (bt.Latitude || []).forEach((lat, i) => {
    const lon = bt.Longitude[i], w = lonLatToWorld(lon, lat);
    if (w.x < WORLD_BOUNDS[0] || w.x > WORLD_BOUNDS[2] || w.z < WORLD_BOUNDS[1] || w.z > WORLD_BOUNDS[3]) return;
    buildings.push({ key: `${lat.toFixed(6)},${lon.toFixed(6)}`, x: w.x, z: w.z, h: bt.Height?.[i] || 9 });
  });
}
// Footprints (OSM) for each building: the one containing its centre, else a 12 m square around it
const pip = (ring, x, z) => {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < ((ring[j] - ring[i]) * (z - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) inside = !inside;
  }
  return inside;
};
const CELL = 50, fpCells = new Map();
const footprints = DAVOS_DATA.buildings.map((b) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < b.ring.length; i += 2) { x0 = Math.min(x0, b.ring[i]); x1 = Math.max(x1, b.ring[i]); z0 = Math.min(z0, b.ring[i + 1]); z1 = Math.max(z1, b.ring[i + 1]); }
  return { ring: b.ring, x0, x1, z0, z1 };
});
footprints.forEach((f, i) => {
  for (let cx = Math.floor(f.x0 / CELL); cx <= Math.floor(f.x1 / CELL); cx++) for (let cz = Math.floor(f.z0 / CELL); cz <= Math.floor(f.z1 / CELL); cz++) {
    const k = `${cx},${cz}`;
    if (!fpCells.has(k)) fpCells.set(k, []);
    fpCells.get(k).push(i);
  }
});
const near = (x, z, r) => {
  const out = new Set();
  for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
    for (const i of fpCells.get(`${cx},${cz}`) || []) out.add(i);
  }
  return out;
};
for (const b of buildings) {
  const f = [...near(b.x, b.z, 2)].find((i) => pip(footprints[i].ring, b.x, b.z));
  b.fp = f ?? -1;
  b.ring = f !== undefined ? footprints[f].ring : [b.x - 6, b.z - 6, b.x + 6, b.z - 6, b.x + 6, b.z + 6, b.x - 6, b.z + 6];
}
// Does the segment (ax, az)-(bx, bz) cross a footprint edge (other than `own`)?
const segX = (ax, az, bx, bz, cx, cz, dx, dz) => {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t > 0.02 && t < 0.98 && u >= 0 && u <= 1;
};
function occluded(ax, az, bx, bz, own) {
  for (const i of near((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + 2)) {
    if (i === own) continue;
    const r = footprints[i].ring;
    for (let k = 0, j = r.length - 2; k < r.length; j = k, k += 2) if (segX(ax, az, bx, bz, r[j], r[j + 1], r[k], r[k + 1])) return true;
  }
  return false;
}

// Bearings: world x east, z south → compass degrees (north 0, east 90)
const bearing = (dx, dz) => ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
const wrap = (a) => ((a + 540) % 360) - 180;
const CAM_H = 2.3; // the camera above the street (car roof / helmet)
const jobs = [];
const usable = images.filter((im) => (im.computed_geometry || im.geometry) && (im.thumb_256_url || im.thumb_1024_url));
const imCells = new Map();
for (const im of usable) {
  const [lon, lat] = (im.computed_geometry || im.geometry).coordinates;
  const w = lonLatToWorld(lon, lat);
  im.x = w.x; im.z = w.z;
  im.heading = im.computed_compass_angle ?? im.compass_angle ?? 0;
  const month = new Date(im.captured_at).getUTCMonth() + 1, year = new Date(im.captured_at).getUTCFullYear();
  im.score = (month >= 5 && month <= 10 ? 1 : 0.35) * (year >= 2021 ? 1 : year >= 2018 ? 0.7 : 0.45);
  const k = `${Math.floor(w.x / CELL)},${Math.floor(w.z / CELL)}`;
  if (!imCells.has(k)) imCells.set(k, []);
  imCells.get(k).push(im);
}
let seen = 0;
for (const b of buildings) {
  const cands = [];
  for (let cx = Math.floor((b.x - 50) / CELL); cx <= Math.floor((b.x + 50) / CELL); cx++) for (let cz = Math.floor((b.z - 50) / CELL); cz <= Math.floor((b.z + 50) / CELL); cz++) {
    for (const im of imCells.get(`${cx},${cz}`) || []) {
      // The facade nearest the camera: the footprint's vertices' bearings (their extent) and the nearest distance
      let dMin = Infinity, bs = [];
      for (let i = 0; i < b.ring.length; i += 2) {
        const dx = b.ring[i] - im.x, dz = b.ring[i + 1] - im.z;
        dMin = Math.min(dMin, Math.hypot(dx, dz));
        bs.push(bearing(dx, dz));
      }
      if (dMin < 8 || dMin > 45 || pip(b.ring, im.x, im.z)) continue;
      const mid = bearing(b.x - im.x, b.z - im.z);
      const rel = bs.map((a) => wrap(a - mid));
      let a0 = mid + Math.min(...rel), a1 = mid + Math.max(...rel);
      // The facade's middle third, horizontally (keeps clear of corners and neighbours)
      const span = a1 - a0;
      a0 += span / 3; a1 -= span / 3;
      if (occluded(im.x, im.z, b.x, b.z, b.fp)) continue; // another footprint between the camera and the building
      // Image columns
      let u0, u1, fov;
      if (im.is_pano || im.camera_type === 'spherical' || im.camera_type === 'equirectangular') {
        u0 = (((a0 - im.heading + 540) % 360) / 360); u1 = (((a1 - im.heading + 540) % 360) / 360);
        if (u1 < u0) continue;
        fov = 'pano';
      } else {
        // perspective: the focal length (normalised by the larger side) gives the horizontal field of view
        const f = Array.isArray(im.camera_parameters) && im.camera_parameters[0] > 0.3 ? im.camera_parameters[0] : 0.75;
        const aspect = (im.width || 4) / (im.height || 3), fx = f * Math.max(1, aspect) / aspect; // focal in widths
        const r0 = wrap(a0 - im.heading), r1 = wrap(a1 - im.heading);
        const lim = (Math.atan(0.5 / fx) * 180) / Math.PI - 3;
        if (Math.abs(r0) > lim || Math.abs(r1) > lim) continue;
        u0 = 0.5 + Math.tan((r0 * Math.PI) / 180) * fx; u1 = 0.5 + Math.tan((r1 * Math.PI) / 180) * fx;
        fov = { fx, aspect };
      }
      // Rows: from 1 m above the ground (over parked cars) to the eave (~85% of the height), at the nearest distance
      const d = dMin + 2, eave = Math.max(3, b.h * 0.8);
      const e0 = Math.atan2(1.2 - CAM_H, d), e1 = Math.atan2(Math.min(eave, 14) - CAM_H, d);
      let v0, v1;
      if (fov === 'pano') { v0 = 0.5 - e1 / Math.PI; v1 = 0.5 - e0 / Math.PI; }
      else { const fy = fov.fx * fov.aspect; v0 = 0.5 - Math.tan(e1) * fy; v1 = 0.5 - Math.tan(e0) * fy; }
      if (v1 - v0 < 0.03 || u1 - u0 < 0.02) continue;
      const frontal = Math.cos(((wrap(mid - im.heading)) * Math.PI) / 180);
      cands.push({ im, box: [u0, Math.max(0, v0), u1, Math.min(1, v1)].map((v) => +v.toFixed(4)), w: im.score * (fov === 'pano' ? 0.8 : 1) * (1 - dMin / 60) * (0.5 + 0.5 * Math.max(0, frontal)) });
    }
  }
  cands.sort((p, q) => q.w - p.w);
  const pick = [], used = new Set();
  for (const c of cands) {
    if (pick.length >= 4) break;
    if ([...used].some((p) => Math.hypot(p.x - c.im.x, p.z - c.im.z) < 4)) continue; // different viewpoints
    used.add(c.im); pick.push(c);
  }
  if (pick.length) seen++;
  for (const c of pick) jobs.push({ key: b.key, id: c.im.id, url: c.im.thumb_256_url || c.im.thumb_1024_url, pano: !!(c.im.is_pano || c.im.camera_type === 'spherical'), box: c.box, w: +c.w.toFixed(3) });
}
log(`${buildings.length} buildings, ${seen} seen by ${new Set(jobs.map((j) => j.id)).size} images (${jobs.length} facade views)`);
const JOBS = path.join(CACHE, 'jobs.json');
fs.writeFileSync(JOBS, JSON.stringify(jobs));

// --- 3. Sampling (python, PIL) ----------------------------------------------------------------------------------------------
const RESULT = path.join(CACHE, 'facades.json');
const py = spawnSync('python3', ['-I', path.join(DIR, 'mapillary-sample.py'), JOBS, path.join(CACHE, 'thumbs'), RESULT], { stdio: 'inherit' });
if (py.status !== 0) throw new Error('mapillary-sample.py failed');
const result = JSON.parse(fs.readFileSync(RESULT, 'utf8'));
const data = {
  source: 'Mapillary street-level images (facade colours measured per building, tools/fetch-mapillary.mjs)',
  license: 'CC BY-SA 4.0 (Mapillary contributors)',
  fetched: new Date().toISOString().slice(0, 10),
  // key: the building's surveyed centre (swissBUILDINGS3D batch table: latitude,longitude to 6 decimals)
  // value: [r, g, b] (linear, 0-255), timber share (0-100), confidence (0-100)
  buildings: result
};
fs.writeFileSync(OUT, `// js/facades-data.js — GENERATED by tools/fetch-mapillary.mjs, do not edit by hand.\n// Facade colours from Mapillary street-level images, CC BY-SA 4.0, Mapillary contributors.\nexport const FACADES = ${JSON.stringify(data)};\n`);
log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${Object.keys(result).length} buildings)`);
