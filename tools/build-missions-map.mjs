// tools/build-missions-map.mjs — builds docs/missions-map.html, a self-contained planning map of the mission locations
// (no external dependencies, opens by double click). Reads docs/missions-locations.json (the missions: places, vehicles,
// seasons, sources) and draws the background from the game's data: js/davos-geodata.js (roads, water, woods, buildings,
// railways, Loipen), js/streams-data.js, js/bergbahnen-data.js, js/ski-pistes-data.js, js/golf-data.js,
// js/landmark-buildings-data.js, js/terrain.js (hillshade) and tools/data/cache/osm_davos.json (MTB trails).
//
//   node tools/build-missions-map.mjs
//
// Not part of the game: the map is a planning resource only.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DAVOS_DATA as D } from '../js/davos-geodata.js';
import { STREAMS } from '../js/streams-data.js';
import { BERGBAHNEN } from '../js/bergbahnen-data.js';
import { SKI_PISTES } from '../js/ski-pistes-data.js';
import { GOLF } from '../js/golf-data.js';
import { EISBAHN, trackOutline } from '../js/landmark-buildings-data.js';
import { TERRAIN } from '../js/terrain.js';
import { lonLatToWorld } from '../js/davos-frame.js';
import { rdp } from './osm-geometry.mjs';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const DATA = JSON.parse(fs.readFileSync(root('docs/missions-locations.json'), 'utf8'));
const OUT = root('docs/missions-map.html');

// The mapped window (world frame, metres): Frauenkirch to Wolfgang, Strela to the Flüela road
const X0 = -2900, X1 = 5700, Z0 = -4300, Z1 = 6300; // (south to the Rinerhorn's sled run)
const W = X1 - X0, H = Z1 - Z0;

// --- Geometry helpers ------------------------------------------------------------------------------------------------
const pairs = (flat) => { const out = []; for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return out; };
const bboxHits = (pts, m = 0) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return x1 >= X0 - m && x0 <= X1 + m && z1 >= Z0 - m && z0 <= Z1 + m;
};
const n = (v) => Math.round(v); // 1 m is plenty for a planning map
function pathD(pts, eps, close = false) {
  const s = pts.length > 2 ? rdp(pts, eps) : pts;
  if (s.length < 2) return '';
  let d = `M${n(s[0][0])} ${n(s[0][1])}`, px = n(s[0][0]), pz = n(s[0][1]);
  for (let i = 1; i < s.length; i++) { const x = n(s[i][0]), z = n(s[i][1]); if (x === px && z === pz) continue; d += `l${x - px} ${z - pz}`; px = x; pz = z; }
  return close ? d + 'z' : d;
}
const lines = (list, eps) => list.filter((p) => p.length > 1 && bboxHits(p, 50)).map((p) => pathD(p, eps)).filter(Boolean).join('');
const rings = (list, eps, minArea = 0) => list.filter((r) => r.length > 2 && bboxHits(r, 50) && Math.abs(area(r)) >= minArea).map((r) => pathD(r, eps, true)).filter((d) => d.split('l').length > 2).join('');
function area(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Hillshade from the terrain grid (PNG, grey with alpha, written by hand: no dependencies) --------------------------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(width, height, rgba) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function hillshade(cell = 16) {
  const { cols, rows, cell: tc, minX, minZ, heights } = TERRAIN;
  const h = (x, z) => {
    const fi = Math.max(0, Math.min(cols - 1.001, (x - minX) / tc)), fj = Math.max(0, Math.min(rows - 1.001, (z - minZ) / tc));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, k = j * cols + i;
    return (heights[k] * (1 - u) + heights[k + 1] * u) * (1 - v) + (heights[k + cols] * (1 - u) + heights[k + cols + 1] * u) * v;
  };
  const w = Math.round(W / cell), hh = Math.round(H / cell), out = Buffer.alloc(w * hh * 4);
  // light from the north-west, 45° high (z points south: north-west = -x, -z)
  const L = [-0.5, 0.7071, -0.5]; const ln = Math.hypot(...L); L[0] /= ln; L[1] /= ln; L[2] /= ln;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const wx = X0 + (x + 0.5) * cell, wz = Z0 + (y + 0.5) * cell;
    const dx = (h(wx + cell, wz) - h(wx - cell, wz)) / (2 * cell), dz = (h(wx, wz + cell) - h(wx, wz - cell)) / (2 * cell);
    const nx = -dx, ny = 1, nz = -dz, nl = Math.hypot(nx, ny, nz);
    const shade = (nx * L[0] + ny * L[1] + nz * L[2]) / nl; // 1 = lit, 0 = in shadow
    const elev = h(wx, wz) + 1558;
    const o = (y * w + x) * 4;
    // shadows as dark alpha, sunny slopes as a light veil; above the tree line a touch of rock grey
    const dark = Math.max(0, 0.78 - shade);
    out[o] = out[o + 1] = out[o + 2] = elev > 2200 ? 70 : 40;
    out[o + 3] = Math.min(255, Math.round(dark * 270 + (elev > 2200 ? 18 : 0)));
  }
  return { href: `data:image/png;base64,${png(w, hh, out).toString('base64')}` };
}

// --- Background layers -----------------------------------------------------------------------------------------------
const parks = (kinds) => D.parks.filter((p) => kinds.includes(p.kind)).map((p) => pairs(p.ring));
const ROAD_CLASSES = {
  primary: ['primary'], secondary: ['secondary'], tertiary: ['tertiary'],
  minor: ['residential', 'unclassified', 'service', 'pedestrian'], track: ['track'], path: ['path', 'footway', 'steps', 'cycleway']
};
const roads = Object.fromEntries(Object.entries(ROAD_CLASSES).map(([k, kinds]) => [k, lines(D.roads.filter((r) => kinds.includes(r.kind) && !r.tunnel).map((r) => pairs(r.pts)), k === 'path' || k === 'track' ? 4 : 2)]));
const rail = lines(D.railways.filter((r) => r.kind === 'narrow_gauge' && !r.tunnel).map((r) => pairs(r.pts)), 2);
const railTunnel = lines(D.railways.filter((r) => r.tunnel).map((r) => pairs(r.pts)), 2);
const funicular = lines(D.railways.filter((r) => r.kind === 'funicular' && !r.tunnel).map((r) => pairs(r.pts)), 2);
const ropeways = BERGBAHNEN.ropeways.map((r) => { const st = r.supports.filter((s) => s.kind === 'station'); return { name: r.name, kind: r.kind, a: st[0], b: st[st.length - 1] }; });
const ropewayD = ropeways.filter((r) => bboxHits([[r.a.x, r.a.z], [r.b.x, r.b.z]])).map((r) => `M${n(r.a.x)} ${n(r.a.z)}L${n(r.b.x)} ${n(r.b.z)}`).join('');
const ropewayStations = [...new Map(ropeways.flatMap((r) => [r.a, r.b]).filter((s) => bboxHits([[s.x, s.z]])).map((s) => [`${n(s.x / 5)},${n(s.z / 5)}`, s])).values()];
const streams = lines(STREAMS.streams.filter((s) => s.kind === 'river' || s.width >= 1.5).map((s) => pairs(s.pts)), 5);
const smallStreams = lines(STREAMS.streams.filter((s) => !(s.kind === 'river' || s.width >= 1.5)).map((s) => pairs(s.pts)), 8);
const pistes = lines(SKI_PISTES.runs.map((r) => pairs(r.pts)), 6);
const loipen = lines(D.loipen.map((l) => pairs(l.pts)), 5);

const layers = {
  hillshade: hillshade(),
  wood: rings(parks(['wood']), 6, 400),
  meadow: rings(parks(['meadow', 'grassland', 'grass', 'park', 'recreation_ground', 'garden', 'cemetery', 'playground']), 3, 200),
  pitch: rings(parks(['pitch']), 2),
  golf: rings(GOLF.outline.map(pairs), 3),
  water: rings(D.water.map((w) => pairs(w.ring)), 3),
  buildings: rings(D.buildings.map((b) => pairs(b.ring)), 1.5, 12),
  eisbahn: pathD(trackOutline(EISBAHN.track, 24).map((p) => (Array.isArray(p) ? p : [p.x, p.z])), 0.5, true),
  streams, smallStreams, pistes, loipen, rail, railTunnel, funicular, ropeway: ropewayD, ...roads
};

// --- Labels ----------------------------------------------------------------------------------------------------------
const stations = Object.fromEntries(D.stations.map((s) => [s.name, s]));
const rw = (name, end) => { const r = ropeways.find((q) => q.name === name); return r && r[end]; };
const placeLabels = [
  { t: 'Davos Platz', x: -760, z: 330, k: 'town' },
  { t: 'Davos Dorf', x: 1060, z: -1500, k: 'town' },
  { t: 'Frauenkirch', x: stations['Davos Frauenkirch'].x, z: stations['Davos Frauenkirch'].z + 150, k: 'village' },
  { t: 'Wolfgang', x: stations['Davos Wolfgang'].x + 250, z: stations['Davos Wolfgang'].z + 120, k: 'village' },
  { t: 'Clavadel', x: -1000, z: 2350, k: 'village' },
  { t: 'Schatzalp', x: stations.Schatzalp.x - 120, z: stations.Schatzalp.z - 70, k: 'poi' },
  { t: 'Davosersee', x: 1350, z: -2650, k: 'water' },
  { t: 'Landwasser', x: -1700, z: 1650, k: 'water', rot: 30 },
  { t: 'Dischma', x: 3300, z: 1300, k: 'valley', rot: 35 },
  { t: 'Flüelatal', x: 3800, z: -900, k: 'valley', rot: -25 },
  { t: 'Jakobshorn', x: rw('Jakobshornbahn Sektion 2', 'b').x + 60, z: rw('Jakobshornbahn Sektion 2', 'b').z - 70, k: 'peak' },
  { t: 'Weissfluhjoch', x: stations.Weissfluhjoch.x + 80, z: stations.Weissfluhjoch.z + 150, k: 'peak' },
  { t: 'Pischa', x: rw('Pischabahn', 'b').x - 200, z: rw('Pischabahn', 'b').z - 80, k: 'peak' },
  { t: 'Strela', x: -2450, z: -1620, k: 'peak' },
  { t: 'Salezer Horn', x: -1150, z: -2560, k: 'peak' },
  { t: 'Ischalp', x: 120, z: 1060, k: 'poi' },
  { t: 'Golf Club', x: GOLF.clubhouse[0] + 420, z: GOLF.clubhouse[1] + 90, k: 'poi' }
];

// --- Mission routes from the data ------------------------------------------------------------------------------------
const osmCache = JSON.parse(fs.readFileSync(root('tools/data/cache/osm_davos.json'), 'utf8'));
const osmWays = new Map(osmCache.elements.filter((e) => e.type === 'way' && e.geometry).map((e) => [e.id, e]));
function routeOf(m) {
  const r = m.route;
  if (!r) return '';
  if (r.type === 'loipe') { const l = D.loipen.find((q) => q.id === r.id); return l ? pathD(pairs(l.pts), 2) : ''; }
  if (r.type === 'piste') { const p = SKI_PISTES.runs.find((q) => q.id === r.id); return p ? pathD(pairs(p.pts), 2) : ''; }
  if (r.type === 'ropeway') { const q = ropeways.find((w) => w.name === r.name); return q ? `M${n(q.a.x)} ${n(q.a.z)}L${n(q.b.x)} ${n(q.b.z)}` : ''; }
  if (r.type === 'pts') return pathD(pairs(r.pts), 2); // (a route given as its points: x0, z0, x1, z1, …)
  if (r.type === 'eisbahn') return layers.eisbahn;
  if (r.type === 'golf') return layers.golf;
  if (r.type === 'osm') return r.ids.map((id) => osmWays.get(id)).filter(Boolean).map((e) => pathD(e.geometry.map((g) => { const p = lonLatToWorld(g.lon, g.lat); return [p.x, p.z]; }), 2)).join('');
  return '';
}
for (const m of DATA.missions) {
  // the LV95 coordinates in the JSON must match x/z (frame: E = x + 2782500, N = 1185500 − z)
  const chk = (p) => { if (Math.abs(p.lv95.E - (p.x + 2782500)) > 1 || Math.abs(p.lv95.N - (1185500 - p.z)) > 1) throw new Error(`LV95 mismatch: ${m.id} ${p.name}`); };
  chk(m.ort); (m.punkte || []).forEach(chk);
  if (m.route && !routeOf(m)) console.warn(`! no route geometry for ${m.id}`);
}
const missions = DATA.missions.map((m) => ({ ...m, routeD: routeOf(m) }));

// --- SVG -------------------------------------------------------------------------------------------------------------
const P = (cls, d) => (d ? `<path class="${cls}" d="${d}"/>` : '');
const svg = `<svg id="map" xmlns="http://www.w3.org/2000/svg" viewBox="${X0} ${Z0} ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Karte Davos mit Missionsorten">
<rect x="${X0 - 20000}" y="${Z0 - 20000}" width="${W + 40000}" height="${H + 40000}" class="outside"/>
<rect x="${X0}" y="${Z0}" width="${W}" height="${H}" class="land"/>
<g id="bg">
${P('meadow', layers.meadow)}${P('wood', layers.wood)}
<image href="${layers.hillshade.href}" x="${X0}" y="${Z0}" width="${W}" height="${H}" preserveAspectRatio="none" class="hill"/>
${P('golf', layers.golf)}${P('pitch', layers.pitch)}${P('eisbahn', layers.eisbahn)}
${P('water', layers.water)}${P('stream', layers.streams)}${P('stream-s', layers.smallStreams)}
${P('piste', layers.pistes)}${P('loipe', layers.loipen)}
${P('bldg', layers.buildings)}
${P('r-path', layers.path)}${P('r-track', layers.track)}
${P('r-minor-c', layers.minor)}${P('r-ter-c', layers.tertiary)}${P('r-sec-c', layers.secondary)}${P('r-pri-c', layers.primary)}
${P('r-minor', layers.minor)}${P('r-ter', layers.tertiary)}${P('r-sec', layers.secondary)}${P('r-pri', layers.primary)}
${P('rail-t', layers.railTunnel)}${P('rail', layers.rail)}${P('rail-d', layers.rail)}${P('funi', layers.funicular)}
${P('rope', layers.ropeway)}
</g>
<g id="routes">${missions.map((m) => (m.routeD ? `<path class="route s-${m.saison}" data-id="${m.id}" d="${m.routeD}"/>` : '')).join('')}</g>
<g id="links"></g>
<g id="labels">${placeLabels.map((l) => `<text class="lbl l-${l.k}" data-x="${n(l.x)}" data-z="${n(l.z)}" data-rot="${l.rot || 0}">${esc(l.t)}</text>`).join('')}
${ropewayStations.map((s) => `<circle class="st" data-x="${n(s.x)}" data-z="${n(s.z)}" r="2.6"/>`).join('')}</g>
<g id="bases"></g>
<g id="pins"></g>
</svg>`;

// --- Page ------------------------------------------------------------------------------------------------------------
const clientData = {
  frame: { X0, Z0, W, H },
  basen: DATA.basen,
  missions: missions.map(({ routeD, ...m }) => m)
};
const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Missionsorte Davos</title>
<!-- GENERATED by tools/build-missions-map.mjs from docs/missions-locations.json — do not edit by hand.
     Background: © OpenStreetMap contributors (ODbL), swisstopo swissALTI3D (hillshade). -->
<style>
:root{--bg:#f4f1ea;--panel:#fffdf8;--ink:#1f2328;--muted:#5d6670;--line:#ddd6c8;--winter:#1f6fd1;--sommer:#d9480f;--ganzjaehrig:#7b3fc4;--active:#ffd43b}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#app{display:flex;height:100vh}
#mapwrap{position:relative;flex:1;min-width:0;overflow:hidden;background:#e9e5dc;touch-action:none;cursor:grab}
#mapwrap.drag{cursor:grabbing}
#map{width:100%;height:100%;display:block}
aside{width:400px;max-width:44vw;border-left:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column}
aside header{padding:14px 16px 10px;border-bottom:1px solid var(--line)}
aside h1{font-size:18px;margin:0 0 4px}
aside .sub{color:var(--muted);font-size:12px}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.filters button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:3px 10px;font:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px}
.filters button[aria-pressed=false]{opacity:.45}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block;flex:none}
ol{list-style:none;margin:0;padding:6px 8px 16px;overflow:auto;flex:1}
li{border:1px solid transparent;border-radius:8px;padding:8px 10px;margin:2px 0;cursor:pointer;display:grid;grid-template-columns:28px 1fr;gap:2px 10px}
li:hover{background:#f6f2e8}
li.active{background:#fff6cc;border-color:#e8c547}
li.hidden{display:none}
.num{grid-row:span 2;width:26px;height:26px;border-radius:50%;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}
.num.idee{box-shadow:inset 0 0 0 2px rgba(255,255,255,.85)}
.name{font-weight:600}
.meta{color:var(--muted);font-size:12px}
.tag{display:inline-block;font-size:11px;padding:0 6px;border-radius:4px;background:#eee7d8;color:#4b4335;margin-left:4px;font-weight:500}
.tag.u-mittel{background:#fde7c4}.tag.u-hoch{background:#f9c9c3}
.details{grid-column:2;display:none;font-size:12.5px;margin-top:6px;color:#333}
li.active .details{display:block}
.details dl{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:6px 0 0}
.details dt{color:var(--muted)}
.details dd{margin:0}
.ctrl{position:absolute;top:12px;left:12px;display:flex;flex-direction:column;gap:4px}
.ctrl button{width:32px;height:32px;border:1px solid #bbb;background:#fff;border-radius:6px;font-size:18px;cursor:pointer;line-height:1}
.ctrl button.txt{width:auto;font-size:12px;padding:0 8px}
#scale{position:absolute;left:12px;bottom:12px;background:rgba(255,255,255,.85);padding:4px 8px 3px;border-radius:4px;font-size:11px}
#scale .bar{height:6px;border:1.5px solid #222;border-top:none;margin-top:2px}
#north{position:absolute;right:12px;top:12px;width:40px;height:52px;background:rgba(255,255,255,.85);border-radius:6px}
#legend{position:absolute;right:12px;bottom:12px;background:rgba(255,255,255,.9);padding:6px 9px;border-radius:6px;font-size:11px;line-height:1.55}
#legend i{display:inline-block;width:22px;height:0;vertical-align:middle;margin-right:6px;border-top:3px solid}
#coords{position:absolute;left:60px;top:12px;background:rgba(255,255,255,.8);padding:2px 6px;border-radius:4px;font:11px ui-monospace,Menlo,monospace;color:#333}
/* map styles (stroke widths in screen px) */
#map path,#map circle{vector-effect:non-scaling-stroke}
.outside{fill:#ddd8cc}.land{fill:#f3f0e4}
.meadow{fill:#e4ecd0}.wood{fill:#bcd5a8}.hill{mix-blend-mode:multiply;pointer-events:none}
.golf{fill:#b7dd9a;stroke:#78a85a;stroke-width:.8}.pitch{fill:#cfe5b8;stroke:#9cbf86;stroke-width:.5}
.eisbahn{fill:none;stroke:#5aa0d8;stroke-width:1.4}
.water{fill:#9cc8ea;stroke:#6aa6d6;stroke-width:.6}
.stream{fill:none;stroke:#6aa6d6;stroke-width:1.6}.stream-s{fill:none;stroke:#8dbde3;stroke-width:.7}
.piste{fill:none;stroke:#6f9fd8;stroke-width:1;stroke-opacity:.55;stroke-dasharray:5 3}
.loipe{fill:none;stroke:#2bb3a3;stroke-width:1;stroke-opacity:.6;stroke-dasharray:2 2}
.bldg{fill:#b5a593;stroke:none}
.r-path{fill:none;stroke:#9a7d5a;stroke-width:.6;stroke-dasharray:3 2;stroke-opacity:.7}
.r-track{fill:none;stroke:#a88a5d;stroke-width:.8;stroke-dasharray:6 2;stroke-opacity:.8}
.r-minor-c{fill:none;stroke:#a9a39a;stroke-width:2.6;stroke-linecap:round}.r-minor{fill:none;stroke:#fff;stroke-width:1.6;stroke-linecap:round}
.r-ter-c{fill:none;stroke:#8f8a80;stroke-width:3.6;stroke-linecap:round}.r-ter{fill:none;stroke:#fffbe8;stroke-width:2.4;stroke-linecap:round}
.r-sec-c{fill:none;stroke:#b5862b;stroke-width:4.4;stroke-linecap:round}.r-sec{fill:none;stroke:#f7d36b;stroke-width:3;stroke-linecap:round}
.r-pri-c{fill:none;stroke:#a5541e;stroke-width:5.2;stroke-linecap:round}.r-pri{fill:none;stroke:#f2a14a;stroke-width:3.6;stroke-linecap:round}
.rail{fill:none;stroke:#333;stroke-width:3}.rail-d{fill:none;stroke:#fff;stroke-width:1.6;stroke-dasharray:6 6}
.rail-t{fill:none;stroke:#555;stroke-width:1.4;stroke-dasharray:3 3;stroke-opacity:.6}
.funi{fill:none;stroke:#7a1f1f;stroke-width:2}
.rope{fill:none;stroke:#c0262d;stroke-width:1.3}
.st{fill:#fff;stroke:#c0262d;stroke-width:1.3}
.route{fill:none;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-opacity:.75}
.route.s-winter{stroke:var(--winter)}.route.s-sommer{stroke:var(--sommer)}.route.s-ganzjaehrig{stroke:var(--ganzjaehrig)}
.route.active{stroke-width:7;stroke-opacity:1}
.link{fill:none;stroke:#222;stroke-width:1.4;stroke-dasharray:5 4}
.lbl{font-family:system-ui,sans-serif;paint-order:stroke;stroke:#fffdf5;stroke-width:3px;stroke-linejoin:round;text-anchor:middle;dominant-baseline:middle;pointer-events:none}
.l-town{font-size:15px;font-weight:700;letter-spacing:.04em;fill:#2b2b2b}
.l-village{font-size:12.5px;font-weight:600;fill:#333}
.l-peak{font-size:11.5px;font-style:italic;fill:#5a3e22}
.l-poi{font-size:11px;fill:#444}
.l-water{font-size:11.5px;font-style:italic;fill:#2f6ea8}
.l-valley{font-size:13px;font-style:italic;letter-spacing:.2em;fill:#6b6152}
.pin{cursor:pointer}
.pin .lead{stroke:#222;stroke-width:1.2}
.pin .anchor{fill:#222}
.pin .b{stroke:#fff;stroke-width:2}
.pin.idee .b{stroke-dasharray:3 2}
.pin text{fill:#fff;font:700 12px system-ui,sans-serif;text-anchor:middle;dominant-baseline:central;pointer-events:none}
.pin.active .b{stroke:var(--active);stroke-width:4;stroke-dasharray:none}
.pin.hidden{display:none}
.base rect{fill:#fff;stroke:#222;stroke-width:1.5}
.base text{font:700 11px system-ui,sans-serif;text-anchor:middle;dominant-baseline:central}
.base .bl{font-weight:500;font-size:10.5px;text-anchor:start;paint-order:stroke;stroke:#fffdf5;stroke-width:3px}
.punkt circle{fill:#fff;stroke-width:2.5}
.punkt text{font:11px system-ui,sans-serif;paint-order:stroke;stroke:#fffdf5;stroke-width:3px;text-anchor:start;dominant-baseline:central}
@media (max-width:760px){#app{flex-direction:column}aside{width:100%;max-width:none;height:46vh;border-left:none;border-top:1px solid var(--line)}#mapwrap{flex:1}#legend{display:none}}
</style>
</head>
<body>
<div id="app">
<div id="mapwrap">
${svg}
<div class="ctrl"><button id="zin" title="Hineinzoomen">+</button><button id="zout" title="Herauszoomen">−</button><button id="zreset" class="txt" title="Ganze Karte">Alles</button><button id="zcenter" class="txt" title="Zentrum Davos Platz">Zentrum</button></div>
<div id="coords"></div>
<div id="scale"><span id="scalet"></span><div class="bar" id="scaleb"></div></div>
<svg id="north" viewBox="0 0 40 52"><path d="M20 6 L28 30 L20 25 L12 30 Z" fill="#222"/><text x="20" y="44" text-anchor="middle" font-size="13" font-weight="700" font-family="system-ui">N</text></svg>
<div id="legend"><div><i style="border-color:#f2a14a"></i>Hauptstrasse</div><div><i style="border-color:#f7d36b"></i>Nebenstrasse</div><div><i style="border-color:#333;border-top-style:dashed"></i>RhB</div><div><i style="border-color:#c0262d;border-top-width:1.5px"></i>Bergbahn / Lift</div><div><i style="border-color:#6f9fd8;border-top-style:dashed;border-top-width:1.5px"></i>Skipiste</div><div><i style="border-color:#2bb3a3;border-top-style:dotted;border-top-width:2px"></i>Loipe</div><div><i style="border-color:#bcd5a8;border-top-width:8px"></i>Wald</div></div>
</div>
<aside>
<header><h1>Missionsorte Davos</h1>
<div class="sub">${DATA.missions.length} Missionen · ${DATA.missions.filter((m) => m.status === 'bestehend').length} bestehend (durchgezogener Rand), ${DATA.missions.filter((m) => m.status !== 'bestehend').length} Ideen (gestrichelt) · Stand ${esc(DATA.meta.stand)} · Klick auf Pin oder Eintrag</div>
<div class="filters" id="filters"></div></header>
<ol id="list"></ol>
</aside>
</div>
<script type="application/json" id="data">${JSON.stringify(clientData).replace(/</g, '\\u003c')}</script>
<script>
(() => {
const DATA = JSON.parse(document.getElementById('data').textContent);
const { X0, Z0, W, H } = DATA.frame;
const SEASON = { winter: 'Winter', sommer: 'Sommer', ganzjaehrig: 'Ganzjährig' };
const COLOR = { winter: 'var(--winter)', sommer: 'var(--sommer)', ganzjaehrig: 'var(--ganzjaehrig)' };
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('map'), wrap = document.getElementById('mapwrap');
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const fmt = (v) => Math.round(v).toLocaleString('de-CH');
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// view: the visible world rectangle
let view = { x: X0, z: Z0, w: W, h: H };
let k = 1; // world metres per screen px
function applyView() {
  const r = wrap.getBoundingClientRect();
  const sx = view.w / r.width, sz = view.h / r.height; k = Math.max(sx, sz);
  svg.setAttribute('viewBox', view.x + ' ' + view.z + ' ' + view.w + ' ' + view.h);
  layout();
}
function screenToWorld(px, py) {
  const r = wrap.getBoundingClientRect();
  const cx = view.x + view.w / 2, cz = view.z + view.h / 2;
  return { x: cx + (px - r.left - r.width / 2) * k, z: cz + (py - r.top - r.height / 2) * k };
}
function zoomAt(f, px, py) {
  const r = wrap.getBoundingClientRect();
  if (px == null) { px = r.left + r.width / 2; py = r.top + r.height / 2; }
  const p = screenToWorld(px, py);
  let nw = Math.min(W * 1.6, Math.max(250, view.w * f)); f = nw / view.w;
  view = { x: p.x - (p.x - view.x) * f, z: p.z - (p.z - view.z) * f, w: view.w * f, h: view.h * f };
  applyView();
}
function fitTo(x0, z0, x1, z1) {
  const r = wrap.getBoundingClientRect(), a = r.width / r.height;
  let w = x1 - x0, h = z1 - z0; if (w / h > a) h = w / a; else w = h * a;
  view = { x: (x0 + x1) / 2 - w / 2, z: (z0 + z1) / 2 - h / 2, w, h }; applyView();
}

// --- pins, bases, labels --------------------------------------------------------------------------------------------
const pinsG = document.getElementById('pins'), basesG = document.getElementById('bases'), linksG = document.getElementById('links');
const labels = [...document.querySelectorAll('#labels text, #labels circle')];
const pins = DATA.missions.map((m) => {
  const g = el('g', { class: 'pin ' + m.status, 'data-id': m.id }, pinsG);
  const lead = el('line', { class: 'lead', x1: 0, y1: 0, x2: 0, y2: 0 }, g);
  el('circle', { class: 'anchor', r: 2.5 }, g);
  const head = el('g', {}, g);
  el('circle', { class: 'b', r: 11, fill: COLOR[m.saison] }, head);
  el('text', {}, head).textContent = m.nr;
  const t = el('title', {}, g); t.textContent = m.nr + '. ' + m.name + ' · ' + m.fahrzeug + ' · ' + SEASON[m.saison];
  g.addEventListener('click', (e) => { e.stopPropagation(); select(m.id, false); });
  return { m, g, lead, head, x: m.ort.x, z: m.ort.z, dx: 0, dy: 0 };
});
const bases = DATA.basen.map((b) => {
  const g = el('g', { class: 'base' }, basesG);
  el('rect', { x: -8, y: -8, width: 16, height: 16, rx: 3 }, g);
  el('text', {}, g).textContent = b.id === 'spital-helipad' ? 'H' : 'P';
  const l = el('text', { class: 'bl', x: 12, y: 0 }, g); l.textContent = b.name;
  const t = el('title', {}, g); t.textContent = b.name + ' (x ' + b.x + ', z ' + b.z + ')';
  return { b, g };
});
function layout() {
  for (const l of labels) {
    const x = +l.dataset.x, z = +l.dataset.z, rot = +(l.dataset.rot || 0);
    l.setAttribute('transform', 'translate(' + x + ' ' + z + ') scale(' + k + ')' + (rot ? ' rotate(' + rot + ')' : ''));
  }
  for (const { b, g } of bases) g.setAttribute('transform', 'translate(' + b.x + ' ' + b.z + ') scale(' + k + ')');
  // declutter: pins closer than 25 px on screen are pushed apart, a leader line marks the true spot
  const vis = pins.filter((p) => !p.g.classList.contains('hidden'));
  for (const p of vis) { p.dx = 0; p.dy = -16; }
  for (let it = 0; it < 80; it++) {
    let moved = false;
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i], c = vis[j];
      let ex = (c.x / k + c.dx) - (a.x / k + a.dx), ey = (c.z / k + c.dy) - (a.z / k + a.dy);
      let d = Math.hypot(ex, ey);
      if (d >= 25) continue;
      if (d < 0.01) { ex = 1; ey = 0; d = 1; }
      const push = (25 - d) / 2 + 0.5; ex /= d; ey /= d;
      a.dx -= ex * push; a.dy -= ey * push; c.dx += ex * push; c.dy += ey * push; moved = true;
    }
    if (!moved) break;
  }
  for (const p of pins) {
    p.g.setAttribute('transform', 'translate(' + p.x + ' ' + p.z + ') scale(' + k + ')');
    p.head.setAttribute('transform', 'translate(' + p.dx + ' ' + p.dy + ')');
    p.lead.setAttribute('x2', p.dx); p.lead.setAttribute('y2', p.dy);
  }
  for (const pt of linksG.querySelectorAll('.punkt')) pt.setAttribute('transform', 'translate(' + pt.dataset.x + ' ' + pt.dataset.z + ') scale(' + k + ')');
  // scale bar: a round distance of ~100 px
  const target = 110 * k, pow = Math.pow(10, Math.floor(Math.log10(target)));
  const nice = [1, 2, 5, 10].map((f) => f * pow).filter((v) => v <= target).pop();
  document.getElementById('scaleb').style.width = (nice / k) + 'px';
  document.getElementById('scalet').textContent = nice >= 1000 ? (nice / 1000) + ' km' : nice + ' m';
}

// --- list -----------------------------------------------------------------------------------------------------------
const list = document.getElementById('list');
const items = DATA.missions.map((m) => {
  const li = document.createElement('li'); li.dataset.id = m.id;
  const pts = (m.punkte || []).map((p) => '<dd>' + escH(p.name) + ': x ' + p.x + ' / z ' + p.z + '</dd>').join('');
  li.innerHTML = '<span class="num ' + m.status + '" style="background:' + COLOR[m.saison] + '">' + m.nr + '</span>' +
    '<span class="name">' + escH(m.name) + (m.status === 'bestehend' ? ' <span class="tag">im Spiel</span>' : '') + '</span>' +
    '<span class="meta">' + escH(m.fahrzeug) + ' · ' + SEASON[m.saison] + ' · <span class="tag u-' + m.unsicherheit + '">Unsicherheit ' + m.unsicherheit + '</span></span>' +
    '<div class="details">' + escH(m.kurz) + '<dl>' +
    '<dt>Ort</dt><dd>' + escH(m.ort.name) + '</dd>' +
    '<dt>Welt</dt><dd>x ' + m.ort.x + ' / z ' + m.ort.z + '</dd>' +
    '<dt>LV95</dt><dd>' + m.ort.lv95.E + ' / ' + m.ort.lv95.N + '</dd>' +
    '<dt>Anreise</dt><dd>' + escH(m.anreise) + '</dd>' +
    (pts ? '<dt>Punkte</dt>' + pts.replace(/<\\/dd><dd>/g, '<br>') : '') +
    '<dt>Quelle</dt><dd>' + escH(m.quelle) + '</dd>' +
    '<dt>Hinweis</dt><dd>' + escH(m.unsicherheitNotiz) + '</dd></dl></div>';
  li.addEventListener('click', () => select(m.id, true));
  list.appendChild(li);
  return li;
});
function select(id, zoom) {
  for (const li of items) li.classList.toggle('active', li.dataset.id === id);
  for (const p of pins) p.g.classList.toggle('active', p.m.id === id);
  for (const r of document.querySelectorAll('.route')) r.classList.toggle('active', r.dataset.id === id);
  const p = pins.find((q) => q.m.id === id); if (p) pinsG.appendChild(p.g);
  linksG.replaceChildren();
  const m = DATA.missions.find((q) => q.id === id);
  if (!m) return;
  const li = items.find((q) => q.dataset.id === id); li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  for (const pt of m.punkte || []) {
    el('line', { class: 'link', x1: m.ort.x, y1: m.ort.z, x2: pt.x, y2: pt.z }, linksG);
    const g = el('g', { class: 'punkt', 'data-x': pt.x, 'data-z': pt.z }, linksG);
    el('circle', { r: 6, stroke: COLOR[m.saison] }, g);
    el('text', { x: 10, y: 0 }, g).textContent = pt.name;
  }
  if (zoom) {
    const xs = [m.ort.x, ...(m.punkte || []).map((q) => q.x)], zs = [m.ort.z, ...(m.punkte || []).map((q) => q.z)];
    const pad = 350; fitTo(Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad);
  } else layout();
}
svg.addEventListener('click', () => { if (!dragged) select(null); });

// --- season filter --------------------------------------------------------------------------------------------------
const filters = document.getElementById('filters'), on = { winter: true, sommer: true, ganzjaehrig: true };
for (const s of Object.keys(SEASON)) {
  const b = document.createElement('button'); b.setAttribute('aria-pressed', 'true');
  b.innerHTML = '<span class="dot" style="background:' + COLOR[s] + '"></span>' + SEASON[s] + ' (' + DATA.missions.filter((m) => m.saison === s).length + ')';
  b.onclick = () => { on[s] = !on[s]; b.setAttribute('aria-pressed', on[s]);
    for (const p of pins) p.g.classList.toggle('hidden', !on[p.m.saison]);
    for (const li of items) li.classList.toggle('hidden', !on[DATA.missions.find((m) => m.id === li.dataset.id).saison]);
    for (const r of document.querySelectorAll('.route')) r.style.display = on[DATA.missions.find((m) => m.id === r.dataset.id).saison] ? '' : 'none';
    layout(); };
  filters.appendChild(b);
}

// --- pan & zoom -----------------------------------------------------------------------------------------------------
let drag = null, dragged = false;
wrap.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
wrap.addEventListener('pointerdown', (e) => { if (e.target.closest('.ctrl')) return; drag = { x: e.clientX, y: e.clientY, v: { ...view } }; dragged = false; wrap.classList.add('drag'); });
window.addEventListener('pointermove', (e) => {
  const p = screenToWorld(e.clientX, e.clientY);
  const r = wrap.getBoundingClientRect();
  if (e.clientX >= r.left && e.clientX <= r.right) document.getElementById('coords').textContent = 'x ' + fmt(p.x) + '  z ' + fmt(p.z) + '  ·  LV95 ' + Math.round(p.x + 2782500) + ' / ' + Math.round(1185500 - p.z);
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 3) dragged = true;
  view = { ...drag.v, x: drag.v.x - dx * k, z: drag.v.z - dy * k }; applyView();
});
window.addEventListener('pointerup', () => { drag = null; wrap.classList.remove('drag'); setTimeout(() => (dragged = false), 0); });
document.getElementById('zin').onclick = () => zoomAt(0.6);
document.getElementById('zout').onclick = () => zoomAt(1 / 0.6);
document.getElementById('zreset').onclick = () => fitTo(X0, Z0, X0 + W, Z0 + H);
document.getElementById('zcenter').onclick = () => fitTo(-900, -700, 300, 200);
window.addEventListener('resize', applyView);
// #zentrum zooms to Davos Platz, #<mission id> selects that mission
function fromHash() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === 'zentrum') fitTo(-900, -700, 300, 200); else if (hash) select(hash, true);
}
fitTo(X0, Z0, X0 + W, Z0 + H);
fromHash();
window.addEventListener('hashchange', fromHash);
})();
</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);
console.log(`docs/missions-map.html: ${kb(html)} KB (hillshade ${kb(layers.hillshade.href)}, buildings ${kb(layers.buildings)}, roads ${kb(Object.keys(ROAD_CLASSES).map((c) => layers[c]).join(''))}, wood ${kb(layers.wood)})`);
