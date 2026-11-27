// usage: node mapillary-candidates.mjs → the named buildings by size with the number of Mapillary photos looking at them and the
// hand-built module that already covers them or the file naming its OSM id (last column: check it; a mission door is
// no build; empty: still the generic block)
import fs from 'node:fs';
const root = new URL('../../../../', import.meta.url).pathname; // (the repo's root)
const { DAVOS_DATA } = await import(root + 'js/davos-geodata.js');
const imgs = JSON.parse(fs.readFileSync(root + 'tools/data/cache/mapillary/images.json', 'utf8'));
const lv = (lat, lon) => { const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
  return [2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3 - 2782500, 1185500 - (1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3)]; };
const P = imgs.map((i) => { const g = (i.computed_geometry || i.geometry).coordinates; const [x, z] = lv(g[1], g[0]); return { x, z, a: i.computed_compass_angle ?? i.compass_angle, pano: i.is_pano, id: i.id, y: new Date(i.captured_at).getFullYear() }; });
// hand-built modules: collect coordinates mentioned in their excludes
const done = [];
for (const f of fs.readdirSync(root + 'js')) { if (!/-data\.js$|landmark|detail-houses|pfadiheim|bergbahnen|unsurveyed/.test(f)) continue; const s = fs.readFileSync(root + 'js/' + f, 'utf8'); for (const m of s.matchAll(/\{\s*x:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+),\s*r:\s*([\d.]+)/g)) done.push([+m[1], +m[2], f]); }
const mentions = fs.readdirSync(root + 'js').filter((f) => f.endsWith('.js') && !/davos-geodata|names-data|shops-data/.test(f)).map((f) => [f, fs.readFileSync(root + 'js/' + f, 'utf8')]);
const out = [];
for (const b of DAVOS_DATA.buildings) {
  if (!b.name) continue;
  const r = b.ring; let cx = 0, cz = 0, n = r.length / 2, A = 0;
  for (let i = 0; i < r.length; i += 2) { cx += r[i] / n; cz += r[i + 1] / n; const j = (i + 2) % r.length; A += r[i] * r[j + 1] - r[j] * r[i + 1]; }
  A = Math.abs(A) / 2;
  const rad = Math.sqrt(A / Math.PI);
  // images within 15..70 m of the outline's centre circle, looking towards the building (±35°)
  let see = 0;
  for (const p of P) { const dx = cx - p.x, dz = cz - p.z, d = Math.hypot(dx, dz); if (d > rad + 70 || d < rad * 0.6) continue; const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; let da = Math.abs(bearing - p.a) % 360; if (da > 180) da = 360 - da; if (p.pano || da < 35) see++; }
  const near = done.find((d) => Math.hypot(d[0] - cx, d[1] - cz) < rad + 12);
  // (a building named by its OSM id in a hand-built module: the Kongress Hotel is a part of js/landmark-buildings.js's complex)
  const named = near ? null : mentions.find(([, text]) => text.includes(`'${b.id}'`) || text.includes(` ${b.id} `));
  out.push({ id: b.id, name: b.name, kind: b.kind, cx: Math.round(cx), cz: Math.round(cz), A: Math.round(A), see, done: near ? near[2] : named ? named[0] : '' });
}
out.sort((a, b) => (b.see > 5) * b.A - (a.see > 5) * a.A);
console.log(out.length, 'named');
for (const o of out.filter((o) => o.see > 5 && o.A > 300).slice(0, 70)) console.log([o.id, o.name, o.kind, o.cx, o.cz, o.A + 'm²', o.see + ' img', o.done].join(' | '));
