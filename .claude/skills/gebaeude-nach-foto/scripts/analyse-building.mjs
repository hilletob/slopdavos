// node analyse-building.mjs <building.json> [batch …]
// Reads what in-game.mjs extract() saved and prints, for each batch (or the ones named): its bounds, the flat roofs as
// outlines with their heights (ready to paste as a part's `ring`), the sloped roof triangles, the walls, and the
// distinct heights with the points at each (how a tower or a spire is read: eaves, gable tops, tip).
import fs from 'node:fs';
const [file, ...only] = process.argv.slice(2);
const D = JSON.parse(fs.readFileSync(file, 'utf8'));
const f = (v, d = 1) => v.toFixed(d);
const nrm = ([a, b, c]) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...n) || 1; return n.map((v) => v / l); };
for (const o of D) {
  if (only.length && !only.includes(String(o.b))) continue;
  // (the tiles carry every triangle twice)
  const seen = new Set();
  const T = o.tris.map((a) => [a.slice(0, 3), a.slice(3, 6), a.slice(6, 9)]).filter((t) => { const k = t.map((p) => p.map((v) => v.toFixed(1)).join(',')).sort().join(';'); if (seen.has(k)) return false; seen.add(k); return true; });
  const pts = T.flat(), mm = (i) => `${f(Math.min(...pts.map((p) => p[i])))}..${f(Math.max(...pts.map((p) => p[i])))}`;
  console.log(`\n=== ${o.u} batch ${o.b}: centre ${o.cx} ${o.cz} (exclude: { x: ${o.cx}, z: ${o.cz}, r: … }), ${T.length} triangles, x ${mm(0)} y ${mm(1)} z ${mm(2)}, floor on ${o.base}`);
  const kind = (t) => { const n = nrm(t); return Math.abs(n[1]) > 0.98 ? (n[1] > 0 ? 'flat' : 'floor') : Math.abs(n[1]) < 0.05 ? 'wall' : 'slope'; };
  // flat roofs: by height, their outlines (the edges used once, chained)
  const byH = new Map();
  for (const t of T) if (kind(t) === 'flat') { const h = Math.round(t[0][1] * 4) / 4; (byH.get(h) || byH.set(h, []).get(h)).push(t); }
  const key = (p) => `${f(p[0])} ${f(p[2])}`;
  for (const [h, list] of [...byH].sort((a, b) => a[0] - b[0])) {
    const edges = new Map();
    for (const t of list) for (let i = 0; i < 3; i++) { const a = key(t[i]), b = key(t[(i + 1) % 3]); if (a !== b) { const e = a < b ? a + '|' + b : b + '|' + a; edges.set(e, (edges.get(e) || 0) + 1); } }
    const adj = new Map();
    for (const [e, n] of edges) if (n === 1) { const [a, b] = e.split('|'); (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
    const area = list.reduce((s, t) => s + Math.abs((t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[2][0] - t[0][0]) * (t[1][2] - t[0][2])) / 2, 0);
    console.log(`  flat roof at y ${f(list.reduce((s, t) => s + t[0][1], 0) / list.length, 2)}, ${f(area, 0)} m²`);
    const done = new Set();
    for (const start of adj.keys()) {
      if (done.has(start)) continue;
      const loop = [start]; done.add(start);
      for (let cur = start; ;) { const nx = (adj.get(cur) || []).find((n) => !done.has(n)); if (!nx) break; done.add(nx); loop.push(nx); cur = nx; }
      console.log('    ring: [' + loop.map((s) => `[${s.replace(' ', ', ')}]`).join(', ') + ']');
    }
  }
  const slopes = T.filter((t) => kind(t) === 'slope');
  if (slopes.length) {
    console.log(`  ${slopes.length} sloped roof triangles` + (slopes.length > 40 ? ' (the first 40)' : ''));
    for (const t of slopes.slice(0, 40)) console.log('    n ' + nrm(t).map((v) => f(v, 2)).join(' ') + '  ' + t.map((p) => `${f(p[0])} ${f(p[1])} ${f(p[2])}`).join(' | '));
  }
  // the heights, and the points at each
  const uniq = new Map(); for (const p of pts) uniq.set(p.map((v) => f(v)).join(','), p);
  const byY = new Map(); for (const p of uniq.values()) { const y = Math.round(p[1] * 2) / 2; (byY.get(y) || byY.set(y, []).get(y)).push(p); }
  console.log('  heights:');
  for (const [y, list] of [...byY].sort((a, b) => a[0] - b[0])) {
    const cx = list.reduce((s, p) => s + p[0], 0) / list.length, cz = list.reduce((s, p) => s + p[2], 0) / list.length;
    console.log(`    y ${f(y)}: ${list.length} points round ${f(cx)} ${f(cz)}: ` + list.slice(0, 8).map((p) => `${f(p[0])} ${f(p[2])}`).join(' | ') + (list.length > 8 ? ' …' : ''));
  }
}
