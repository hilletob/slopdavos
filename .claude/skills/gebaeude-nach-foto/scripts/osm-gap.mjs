// node osm-gap.mjs <building.json> <osm id> [batch …]
// The stretches of OpenStreetMap's footprint walls (the player's colliders, js/buildings.js) standing more than 0.5 m off
// every surveyed volume of in-game.mjs extract()'s file (or of the batches named): an invisible wall before the building,
// or the surveyed wall standing out of OSM's (one walks into it). Any output: register the surveyed outlines
// (js/landmarks.js SURVEYED_FOOTPRINTS, see SKILL.md section 4).
import fs from 'node:fs';
const [file, id, ...only] = process.argv.slice(2);
const { DAVOS_DATA } = await import(new URL('../../../../js/davos-geodata.js', import.meta.url).pathname);
const D = JSON.parse(fs.readFileSync(file, 'utf8')).filter((o) => !only.length || only.includes(String(o.b)));
const inTri = (p, t) => { const s = (a, b, c) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]); const d1 = s(p, t[0], t[1]), d2 = s(p, t[1], t[2]), d3 = s(p, t[2], t[0]); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
const T = [];
for (const o of D) for (const t of o.tris) { const tri = [[t[0], t[2]], [t[3], t[5]], [t[6], t[8]]]; if (Math.abs((tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[2][0] - tri[0][0]) * (tri[1][1] - tri[0][1])) > 0.01) T.push(tri); }
const b = DAVOS_DATA.buildings.find((x) => x.id === id), r = b.ring, n = r.length / 2;
let any = false;
for (let i = 0; i < n; i++) {
  const a = [r[2 * i], r[2 * i + 1]], c = [r[(2 * i + 2) % r.length], r[(2 * i + 3) % r.length]], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
  let out = 0, worst = 0;
  for (let s = 0.25; s < L; s += 0.5) {
    const p = [a[0] + (c[0] - a[0]) * s / L, a[1] + (c[1] - a[1]) * s / L];
    if (T.some((t) => inTri(p, t))) continue;
    const d = Math.min(...T.map((t) => Math.min(segD(p, t[0], t[1]), segD(p, t[1], t[2]), segD(p, t[2], t[0]))));
    if (d > 0.5) { out += 0.5; worst = Math.max(worst, d); }
  }
  if (out > 1) { any = true; console.log(`edge ${i} (${a.map((v) => v.toFixed(0))} → ${c.map((v) => v.toFixed(0))}): ${out} m of ${L.toFixed(1)} off the survey, up to ${worst.toFixed(1)} m`); }
}
console.log(any ? '→ register the surveyed outlines (SURVEYED_FOOTPRINTS)' : 'OSM footprint matches the survey');
