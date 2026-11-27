// usage (from a scratchpad folder): node mapillary-photos.mjs <slug> <osm id | x,z[,radius]> [max] → ./buildings/<slug>/photos/*.jpg + photos.txt (where each
// was taken, its heading): the Mapillary street photos looking at a building, spread over the sides, from the cache
// tools/data/cache/mapillary/images.json (its thumbnail URLs are signed and expire: then a fresh one from the Graph API
// with MAPILLARY_TOKEN from .env.local)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../../../../', import.meta.url).pathname; // (the repo's root)
const [slug, id, max = '12'] = process.argv.slice(2);
const dir = process.cwd() + '/buildings/' + slug + '/photos/';
fs.mkdirSync(dir, { recursive: true });
const { DAVOS_DATA } = await import(root + 'js/davos-geodata.js');
const imgs = JSON.parse(fs.readFileSync(root + 'tools/data/cache/mapillary/images.json', 'utf8'));
const lv = (lat, lon) => { const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
  return [2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3 - 2782500, 1185500 - (1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3)]; };
// (`id` an OSM building's, or a place without one: "x,z[,radius]", a pond, a fountain)
const at = /^-?[\d.]+,-?[\d.]+/.test(id) ? id.split(',').map(Number) : null;
const b = at ? { name: `the place ${at[0]} ${at[1]}`, ring: [at[0], at[1]] } : DAVOS_DATA.buildings.find((x) => x.id === id), r = b.ring;
let cx = 0, cz = 0; const n = r.length / 2;
for (let i = 0; i < r.length; i += 2) { cx += r[i] / n; cz += r[i + 1] / n; }
const rad = at ? (at[2] ?? 6) : Math.max(...Array.from({ length: n }, (_, i) => Math.hypot(r[2 * i] - cx, r[2 * i + 1] - cz)));
// MAPILLARY_TOKEN from the repo's .env.local (gitignored), never printed
const token = (() => { try { return (fs.readFileSync(root + '.env.local', 'utf8').match(/^MAPILLARY_TOKEN=(.+)$/m) || [])[1]?.trim(); } catch { return null; } })();
async function fresh(id) {
  if (!token) return null;
  try {
    const r = await fetch(`https://graph.mapillary.com/${id}?fields=thumb_1024_url`, { headers: { Authorization: `OAuth ${token}` } });
    return r.ok ? (await r.json()).thumb_1024_url : null;
  } catch { return null; }
}
const cand = [];
for (const i of imgs) {
  if (i.is_pano) continue;
  const g = (i.computed_geometry || i.geometry).coordinates, [x, z] = lv(g[1], g[0]);
  const dx = cx - x, dz = cz - z, d = Math.hypot(dx, dz);
  if (d > rad + 60 || d < rad * 0.7) continue;
  const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360, a = i.computed_compass_angle ?? i.compass_angle;
  let da = Math.abs(bearing - a) % 360; if (da > 180) da = 360 - da;
  if (da > 28) continue;
  cand.push({ i, x, z, d, a, bearing, score: da + Math.abs(d - rad - 25) * 0.5 });
}
// spread over the directions the building is seen from: the best per 30° sector, then the next best
cand.sort((p, q) => p.score - q.score);
const pick = [], per = new Map();
for (const round of [1, 2, 3]) for (const c of cand) { const s = Math.floor(c.bearing / 30); if ((per.get(s) || 0) >= round || pick.includes(c)) continue; per.set(s, (per.get(s) || 0) + 1); pick.push(c); }
const lines = [`${b.name} (${id}): centre ${cx.toFixed(1)} ${cz.toFixed(1)}, footprint radius ${rad.toFixed(0)} m. World frame: x east, z SOUTH. Heading: compass degrees the camera looks (0 north, 90 east).`];
for (const c of pick.slice(0, +max)) {
  const f = `${c.i.id}.jpg`;
  try { execFileSync('curl', ['-s', '-f', '-o', dir + f, c.i.thumb_1024_url]); } catch {
    // (the cache's signed URLs expire: a fresh one from the Graph API, the token sent to graph.mapillary.com only)
    const url = await fresh(c.i.id);
    if (!url) continue;
    try { execFileSync('curl', ['-s', '-f', '-o', dir + f, url]); } catch { continue; }
  }
  // (the side of the building the camera stands on, written out: z grows to the south, the easiest thing to get wrong)
  const side = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((c.bearing + 180) % 360) / 45) % 8];
  lines.push(`${f}: taken from the ${side}, camera at x ${c.x.toFixed(0)} z ${c.z.toFixed(0)}, ${c.d.toFixed(0)} m from the centre, looking ${Math.round(c.a)}° (the building lies at ${Math.round(c.bearing)}°), ${new Date(c.i.captured_at).toISOString().slice(0, 10)}`);
}
fs.writeFileSync(dir + '../photos.txt', lines.join('\n') + '\n');
console.log(lines.join('\n'));
