import * as THREE from 'three/webgpu';
import { abs, float, fract, mix, smoothstep, step, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  SCHWEIZERHAUS, arcadePosts, crossOutline, crossRoofY, groundOutline, loggiaPosts, mainRoofY, northGable, onWall, toWorld, wallFrame, westFront
} from './schweizerhaus-data.js';

export { SCHWEIZERHAUS };

// The Schweizerhaus on the Promenade rebuilt by hand (js/schweizerhaus-data.js), standing in for its swissBUILDINGS3D
// volumes, which the streamed tiles drew as white blocks with the town houses' windows: the wings under the saddle roof
// and the taller middle under its cross roof in cream plaster, a darker ground floor and bands at the floors, windows
// in dark brown casings under their hoods (a pair in the middle of each wall, dark green shutters; on the middle's
// gables single, pair, single without), drawn by the walls' materials from their uv (metres along the wall from its
// middle, metres up the floors' grid); deep eaves with fretwork bargeboards on carved brackets; on the west front the
// timber arcade on its posts, the balcony over it and the wings' loggias with their arches and the frieze of slats; on
// the north gable the two halberdiers, the shields and the library's board; the door in the arcade. Five meshes: the
// walls, the middle's gables, the roofs, the trim (one vertex-coloured mesh) and the decoration (one canvas atlas).

excludeBuildings(SCHWEIZERHAUS.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outline, which stands up to 2 m north of them:
// js/landmarks.js)
SURVEYED_FOOTPRINTS.set(SCHWEIZERHAUS.osm, [groundOutline()]);

const D = SCHWEIZERHAUS;
const { storey: STOREY, win: WIN } = D;
// v of a wall: metres up the floors' grid, the ground floor's foot at 40 storeys; closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
const vOf = (y) => y - D.floor + UP;
const LOWER = D.floor - STOREY; // the lower floor's foot

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const CREAM = [0.44, 0.37, 0.2], CASING = [0.085, 0.048, 0.026], SASH = [0.5, 0.49, 0.45], SHUTTER = [0.035, 0.058, 0.045];
const ROOF = [0.105, 0.1, 0.095];
// A soft-edged rectangle whose half width is a node
const box = (x, y, hw, lo, hi, e = 0.012) => smoothstep(hw.add(e), hw.sub(e), abs(x)).mul(smoothstep(lo - e, lo + e, y)).mul(smoothstep(hi + e, hi - e, y));

/**
 * Cream plaster with a window in every bay that fits: the middle bay a pair, the others single, each in a dark brown
 * casing under a hood, white sashes with a post and a transom, a sill; dark green louvred shutters beside them
 * (`shutter` their width, 0: none). The floors' foot a darker band, the lower and ground floors a shade darker.
 */
function wallMaterial({ bay: BAY, single, pair, shutter, seed }) {
  const fine = fade(8, 28), near = fade(40, 160);
  const glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const { half, bay, bu, storey, fv } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: single });
  const isPair = step(abs(bay), 0.5);
  const casing = mix(float(single), float(pair), isPair);
  const open = step(abs(bay.mul(BAY)).add(casing).add(shutter + 0.3), half);
  const win = box(bu, fv, casing, WIN.lo, WIN.hi).mul(open);
  // the sashes: one in a single, two in a pair (a post of the casing between them)
  const pc = casing.sub(0.01).mul(0.5);
  const xs = mix(bu, abs(bu).sub(pc), isPair), hs = mix(casing.sub(0.07), casing.sub(0.13).mul(0.5), isPair);
  const sash = box(xs, fv, hs, WIN.lo + 0.07, WIN.hi - 0.07).mul(open);
  const tr = WIN.lo + (WIN.hi - WIN.lo) * 0.7;
  const bars = smoothstep(0.035, 0.022, abs(xs)).max(smoothstep(0.035, 0.022, abs(fv.sub(tr))));
  const pane = box(xs, fv, hs.sub(0.06), WIN.lo + 0.13, WIN.hi - 0.13).mul(float(1).sub(bars.mul(fine))).mul(open);
  // the shutters folded back beside the casing, their louvres fading out with distance
  let shut = float(0);
  if (shutter > 0) {
    const xo = abs(bu).sub(casing.add(shutter / 2));
    const louvre = smoothstep(0.35, 0.5, abs(fract(fv.div(0.07)).sub(0.5))).mul(fine).mul(0.35);
    shut = box(xo, fv, float(shutter / 2 - 0.015), WIN.lo + 0.02, WIN.hi - 0.02).mul(open).mul(float(1).sub(louvre));
  }
  const hood = box(bu, fv, casing.add(0.1), WIN.hi + 0.02, WIN.hi + 0.2).mul(open).mul(near);
  const sill = box(bu, fv, casing.add(0.06), WIN.lo - 0.09, WIN.lo).mul(open).mul(near);
  // the plaster: weathering, the floors' bands, the lower floors darker
  const low = step(38.5, storey).mul(step(storey, 40.5));
  const band = step(40.5, storey).mul(smoothstep(0.16, 0.13, fv)).mul(near);
  let c = mix(vec3(...CREAM).mul(0.93), vec3(...CREAM).mul(1.05), worldNoise(0.35)).mul(mix(float(1), float(0.8), low));
  c = mix(c, vec3(0.2, 0.15, 0.085), band);
  c = mix(c, vec3(0.36, 0.33, 0.27), sill);
  c = mix(c, vec3(...CASING), win.max(hood));
  c = mix(c, vec3(...SASH), sash);
  const glassC = mix(vec3(0.02, 0.024, 0.028), vec3(0.06, 0.075, 0.09), worldNoise(0.07));
  c = mix(c, glassC, pane);
  c = mix(c, vec3(...SHUTTER), shut);
  m.colorNode = c;
  m.roughnessNode = mix(float(0.9), float(0.12), pane);
  m.metalnessNode = pane.mul(0.5);
  // (a library and offices: a window lit here and there in the evening, few towards midnight)
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), seed, { share: 0.3, late: 0.06, tone: twoTones([1.0, 0.8, 0.56], [0.88, 0.92, 1.0], 0.8) })
    .mul(pane).mul(glow.mul(1.1));
  return m;
}

function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the plaster's mean colour, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.walls = SIMPLE_SKINS.windowed([0.4, 0.34, 0.19], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35);
    M.gables = M.walls;
    return M;
  }
  M.walls = wallMaterial({ bay: D.bay, single: WIN.single, pair: WIN.pair, shutter: WIN.shutter, seed: 29 });
  M.gables = wallMaterial({ bay: D.gableBay, single: D.gableWin.single, pair: D.gableWin.pair, shutter: 0, seed: 31 });
  return M;
}

// --- The decoration: one canvas atlas ------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  arch: [0, 0, 256, 160],
  railing: [264, 0, 256, 96],
  fringe: [528, 0, 256, 48],
  door: [792, 0, 128, 256],
  figureA: [0, 168, 128, 320],
  figureB: [136, 168, 128, 320],
  shields: [272, 168, 320, 72],
  corner: [272, 248, 192, 80],
  sign: [600, 168, 64, 296],
  hood: [672, 264, 256, 96]
};
const TIMBER = '#4e301b', TIMBER_DARK = '#2c190d';

// A shield: its outline (x, y the top left, w, h)
function shieldPath(g, x, y, w, h) {
  g.beginPath();
  g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h * 0.55);
  g.quadraticCurveTo(x + w, y + h * 0.9, x + w / 2, y + h);
  g.quadraticCurveTo(x, y + h * 0.9, x, y + h * 0.55);
  g.closePath();
}
// The shields as plain heraldry: (fields, a charge) drawn freely, no arms copied
const SHIELDS = [
  ['#c8102e', '#ffffff', 'cross'], ['#f2c200', '#1d1d1b', 'bar'], ['#1f4e9c', '#ffffff', 'pale'], ['#ffffff', '#1d1d1b', 'bend'], ['#2a7a3b', '#f2c200', 'cross']
];
function shield(g, x, y, w, h, [field, charge, kind]) {
  g.save();
  shieldPath(g, x, y, w, h); g.fillStyle = field; g.fill(); g.clip();
  g.fillStyle = charge;
  if (kind === 'cross') { g.fillRect(x + w * 0.4, y + h * 0.15, w * 0.2, h * 0.6); g.fillRect(x + w * 0.2, y + h * 0.35, w * 0.6, h * 0.2); }
  if (kind === 'bar') g.fillRect(x, y + h * 0.38, w, h * 0.22);
  if (kind === 'pale') g.fillRect(x + w * 0.38, y, w * 0.24, h);
  if (kind === 'bend') { g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.3, y); g.lineTo(x + w, y + h * 0.7); g.lineTo(x + w, y + h); g.closePath(); g.fill(); }
  g.restore();
  shieldPath(g, x, y, w, h); g.strokeStyle = '#3a2a1a'; g.lineWidth = 2; g.stroke();
}
// A halberdier painted on the plaster: a figure in doublet and hose, a helmet, the halberd upright beside him (simplified,
// after the photograph's pair; `flip` turns him)
function halberdier(g, w, h, { flip, coat, hose }) {
  g.save();
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  // a pale ground framed by a thin line
  g.fillStyle = 'rgba(238, 228, 196, 0.55)'; g.fillRect(6, 6, w - 12, h - 12);
  g.strokeStyle = 'rgba(110, 80, 50, 0.7)'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12);
  const cx = w * 0.46;
  // the halberd
  g.fillStyle = '#5a4128'; g.fillRect(w * 0.78, 18, 4, h - 36);
  g.fillStyle = '#9aa0a4'; g.beginPath(); g.moveTo(w * 0.78 + 2, 12); g.lineTo(w * 0.78 + 14, 44); g.lineTo(w * 0.78 + 2, 52); g.closePath(); g.fill();
  g.fillRect(w * 0.78 - 10, 40, 14, 14);
  // the legs (hose), the shoes
  g.fillStyle = hose; g.fillRect(cx - 14, h * 0.6, 11, h * 0.3); g.fillRect(cx + 3, h * 0.6, 11, h * 0.3);
  g.fillStyle = '#2b1c12'; g.fillRect(cx - 17, h * 0.9, 15, 8); g.fillRect(cx + 2, h * 0.9, 15, 8);
  // the doublet, slashed in two colours, the arms
  g.fillStyle = coat; g.fillRect(cx - 20, h * 0.3, 40, h * 0.32);
  g.fillStyle = hose; g.fillRect(cx - 4, h * 0.3, 8, h * 0.32);
  g.fillStyle = coat; g.fillRect(cx + 18, h * 0.32, 12, h * 0.2); g.fillRect(cx - 30, h * 0.32, 12, h * 0.22);
  // the head, the helmet with its brim and a plume
  g.fillStyle = '#d9b48c'; g.beginPath(); g.arc(cx, h * 0.24, 12, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8f969b'; g.beginPath(); g.arc(cx, h * 0.21, 13, Math.PI, 0); g.fill(); g.fillRect(cx - 18, h * 0.21 - 2, 36, 4);
  g.fillStyle = '#c8102e'; g.beginPath(); g.ellipse(cx + 4, h * 0.14, 6, 12, 0.4, 0, Math.PI * 2); g.fill();
  g.restore();
}

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // an arch between two posts: the timber spandrels round a half-round opening, a frieze of slats over it (the openings
  // left transparent)
  cell('arch', (w, h) => {
    g.fillStyle = TIMBER; g.fillRect(0, 0, w, h);
    g.fillStyle = TIMBER_DARK; g.fillRect(0, h * 0.3, w, 5);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) g.fillRect(8 + i * (w - 16) / 9 + 8, 6, (w - 16) / 9 - 12, h * 0.3 - 12);
    g.beginPath(); g.moveTo(10, h); g.lineTo(10, h * 0.78); g.arc(w / 2, h * 0.78 + 4, w / 2 - 10, Math.PI, 0); g.lineTo(w - 10, h); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = TIMBER_DARK; g.lineWidth = 6;
    g.beginPath(); g.arc(w / 2, h * 0.78 + 4, w / 2 - 12, Math.PI, 0); g.stroke();
  });
  // the balustrade: sawn boards, a lozenge and two notches cut out between each pair
  cell('railing', (w, h) => {
    const n = 12, bw = w / n;
    for (let i = 0; i < n; i++) { const k = ((i * 53) % 13) / 13; g.fillStyle = `rgb(${72 + k * 12}, ${44 + k * 7}, ${26 + k * 4})`; g.fillRect(i * bw, 0, bw, h); }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 1; i < n; i++) {
      const x = i * bw;
      g.fillRect(x - 1.5, 0, 3, h);
      g.beginPath(); g.moveTo(x, h * 0.22); g.lineTo(x + bw * 0.3, h * 0.5); g.lineTo(x, h * 0.78); g.lineTo(x - bw * 0.3, h * 0.5); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  });
  // the valance under the balconies and the bargeboards: a board with a row of rounded teeth hanging from it
  cell('fringe', (w, h) => {
    g.fillStyle = TIMBER_DARK; g.fillRect(0, 0, w, h * 0.4);
    const n = 16, tw = w / n;
    for (let i = 0; i < n; i++) {
      g.beginPath(); g.moveTo(i * tw + 2, h * 0.38); g.lineTo(i * tw + tw - 2, h * 0.38); g.lineTo(i * tw + tw - 2, h * 0.7);
      g.arc(i * tw + tw / 2, h * 0.7, tw / 2 - 2, 0, Math.PI); g.closePath(); g.fill();
    }
  });
  // the house door: two leaves of dark timber with glazed upper panels, a fanlight
  cell('door', (w, h) => {
    g.fillStyle = '#2a170c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a2b16'; g.fillRect(8, h * 0.2, w / 2 - 12, h * 0.78); g.fillRect(w / 2 + 4, h * 0.2, w / 2 - 12, h * 0.78);
    g.fillStyle = '#1b252b'; g.fillRect(8, 8, w - 16, h * 0.17 - 8);
    g.fillRect(16, h * 0.26, w / 2 - 28, h * 0.34); g.fillRect(w / 2 + 12, h * 0.26, w / 2 - 28, h * 0.34);
    g.fillStyle = '#b08a3c'; g.fillRect(w / 2 - 12, h * 0.6, 6, 14); g.fillRect(w / 2 + 6, h * 0.6, 6, 14);
  });
  cell('figureA', (w, h) => halberdier(g, w, h, { flip: false, coat: '#a8322a', hose: '#e8dcc0' }));
  cell('figureB', (w, h) => halberdier(g, w, h, { flip: true, coat: '#2f4f8a', hose: '#d8c060' }));
  // the row of five shields under the gable's window pair, the three by the west corner
  cell('shields', (w, h) => { for (let i = 0; i < 5; i++) shield(g, 6 + i * (w - 12) / 5 + 6, 4, (w - 12) / 5 - 12, h - 8, SHIELDS[i]); });
  cell('corner', (w, h) => { for (let i = 0; i < 3; i++) shield(g, 4 + i * (w - 8) / 3 + 6, 4, (w - 8) / 3 - 12, h - 8, SHIELDS[[0, 2, 4][i]]); });
  // the library's board: white, a small cross on blue and yellow over the word written upwards
  cell('sign', (w, h) => {
    g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e1b400'; g.fillRect(10, 8, (w - 20) / 2, 22); g.fillStyle = '#1f4e9c'; g.fillRect(w / 2, 8, (w - 20) / 2, 22);
    g.save(); g.translate(w / 2 + 10, h - 12); g.rotate(-Math.PI / 2);
    g.fillStyle = '#26303a'; g.font = 'bold 34px Helvetica, Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText('Bibliothek', 0, -10, h - 60);
    g.restore();
  });
  // the arched hood over the gable's window pair: a dark timber arch with a keystone, open under it
  cell('hood', (w, h) => {
    g.fillStyle = TIMBER_DARK;
    g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.75); g.ellipse(w / 2, h, w / 2, h * 0.95, 0, Math.PI, 0); g.lineTo(w, h); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(w / 2, h, w / 2 - 14, h * 0.95 - 16, 0, Math.PI, 0); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#4e301b'; g.fillRect(w / 2 - 10, 0, 20, 22);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  timber: [0.15, 0.08, 0.04], dark: [0.075, 0.042, 0.022], soffit: [0.12, 0.068, 0.035], fascia: [0.07, 0.04, 0.02],
  plinth: [0.2, 0.185, 0.16], casing: CASING, pane: [0.025, 0.03, 0.035], ridge: [0.08, 0.077, 0.074], step: [0.26, 0.25, 0.23]
};
const P3 = (t, c, y) => { const [x, z] = toWorld(t, c); return [x, y, z]; };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A quad facing `dir` (its corners turned round if they face away), into `bucket` */
function quadTo(B, bucket, pts, dir, opt = {}, uvs = undefined) {
  const [a, b, c, d] = pts;
  if (dot(cross(sub(b, a), sub(d, a)), dir) >= 0) B.quad(bucket, a, b, c, d, uvs, opt);
  else B.quad(bucket, a, d, c, b, uvs && [uvs[0], uvs[3], uvs[2], uvs[1]], opt);
}
/** A beam from p to q ([x, y, z]): `hw` half its width (level), `hh` half its height, into the trim */
function beam(B, p, q, hw, hh, colour) {
  const d = sub(q, p), L = Math.hypot(...d);
  if (L < 1e-3) return;
  const dn = d.map((v) => v / L);
  let side = [-dn[2], 0, dn[0]];
  const sl = Math.hypot(side[0], side[2]);
  side = sl < 1e-3 ? [1, 0, 0] : side.map((v) => v / sl);
  const up = cross(side, dn);
  const k = (o, sx, sy) => [o[0] + side[0] * sx * hw + up[0] * sy * hh, o[1] + side[1] * sx * hw + up[1] * sy * hh, o[2] + side[2] * sx * hw + up[2] * sy * hh];
  const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], opt = { colour };
  const P = [k(p, -1, -1), k(p, 1, -1), k(p, 1, 1), k(p, -1, 1)], Q = [k(q, -1, -1), k(q, 1, -1), k(q, 1, 1), k(q, -1, 1)];
  const out = (pts) => { const c = pts.reduce((s, x) => [s[0] + x[0] / 4, s[1] + x[1] / 4, s[2] + x[2] / 4], [0, 0, 0]); return sub(c, m); };
  for (let i = 0; i < 4; i++) { const f = [P[i], P[(i + 1) % 4], Q[(i + 1) % 4], Q[i]]; quadTo(B, 'trim', f, out(f), opt); }
  quadTo(B, 'trim', P, sub(p, q), opt);
  quadTo(B, 'trim', Q, d, opt);
}
/** A plane over an outline of the frame ([t, c]) at yOf(t, c): its triangles facing up (or down), into `bucket` */
function plane(B, bucket, ring, yOf, { down = false, dy = 0, colour = null } = {}) {
  const contour = ring.map(([t, c]) => new THREE.Vector2(t, c));
  for (const tri of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = tri.map((i) => P3(ring[i][0], ring[i][1], yOf(ring[i][0], ring[i][1]) + dy));
    const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const t = (n[1] > 0) !== down ? p : [p[0], p[2], p[1]];
    B.tri(bucket, t[0], t[1], t[2], t.map((q) => [q[0], q[2]]), { colour });
  }
}

// The highest ground along a wall, half a metre out of it (from s0 to s1)
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}
// The foot of the lowest storey (from the lower floor up) whose windows clear the ground along a wall by 0.15 m
function windowsFrom(F, s0 = 0, s1 = F.len) {
  const g = groundAlong(F, s0, s1);
  let y = LOWER;
  while (y + WIN.lo < g + 0.15) y += STOREY;
  return y;
}

/**
 * A stretch of wall from s0 to s1 between bot(s) and top(s) (both straight over it): closed under `win0`, windows from
 * `win0` to `attic` where `lay` ({ mid, half }: the bays laid out from `mid`, the wall's half length) is given, closed
 * over `attic`; into `bucket`
 */
function wallStretch(B, bucket, F, s0, s1, bot, top, win0, attic, lay) {
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const cuts = [s0, s1];
  for (const f of [bot, top]) {
    for (const L of [win0, attic]) {
      const a = f(s0) - L, b = f(s1) - L;
      if (a * b < 0) cuts.push(s0 + (a / (a - b)) * (s1 - s0));
    }
  }
  cuts.sort((p, q) => p - q);
  const mid = lay ? lay.mid : (s0 + s1) / 2;
  for (let k = 0; k + 1 < cuts.length; k++) {
    const a = cuts[k], b = cuts[k + 1];
    if (b - a < 1e-4) continue;
    for (const [lo, hi, windows] of [[-Infinity, win0, false], [win0, attic, true], [attic, Infinity, false]]) {
      const open = windows && !!lay;
      const la = Math.max(bot(a), lo), lb = Math.max(bot(b), lo);
      const ha = Math.max(la, Math.min(top(a), hi)), hb = Math.max(lb, Math.min(top(b), hi));
      if (ha - la < 0.005 && hb - lb < 0.005) continue;
      const v = (y) => vOf(y) - (open ? 0 : CLOSED);
      B.quad(bucket, P(a, la), P(b, lb), P(b, hb), P(a, ha), [[a - mid, v(la)], [b - mid, v(lb)], [b - mid, v(hb)], [a - mid, v(ha)]], { half: open ? lay.half : 0 });
    }
  }
}
// A plinth of grey render along a wall's foot, a little over the ground all along it
function plinth(B, F, s0 = 0, s1 = F.len) {
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.0));
  for (let k = 0; k < n; k++) {
    const a = s0 + ((s1 - s0) * k) / n, b = s0 + ((s1 - s0) * (k + 1)) / n;
    const ga = groundHeight(...onWall(F, a, 0.3)) + 0.35, gb = groundHeight(...onWall(F, b, 0.3)) + 0.35;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('trim', P(a, D.base), P(b, D.base), P(b, Math.max(gb, D.base + 0.2)), P(a, Math.max(ga, D.base + 0.2)), undefined, { colour: C.plinth });
  }
}

/** The house's walls as stretches: a frame in the house's (t, c) from a to b, what bounds them and how the bays run */
function walls() {
  const X = D.middle, T1 = D.t1, CS = D.len, cr = D.cross.ridge[0], tr = D.roof.ridge[0];
  const roofTop = (t) => mainRoofY(t) - 0.06, crossTop = (c) => crossRoofY(c) - 0.06;
  const base = () => D.base;
  const sideTop = crossTop(X.c0); // the middle's long walls up to its eaves
  return [
    // the north gable on the street, the wings' west and east walls (the second floor in the roof but on the gables)
    { id: 'north', a: [T1, 0], b: [0, 0], at: (s) => [T1 - s, 0], bends: [T1 - tr], top: (t) => roofTop(t), attic: D.attic.gable },
    { id: 'north-west', a: [0, 0], b: [0, X.c0], at: (s) => [0, s], top: () => roofTop(0), attic: D.attic.wing },
    { id: 'north-east', a: [T1, X.c0], b: [T1, 0], at: (s) => [T1, X.c0 - s], top: () => roofTop(T1), attic: D.attic.wing },
    { id: 'south', a: [0, CS], b: [T1, CS], at: (s) => [s, CS], bends: [tr], top: (t) => roofTop(t), attic: D.attic.gable },
    { id: 'south-west', a: [0, X.c1], b: [0, CS], at: (s) => [0, X.c1 + s], top: () => roofTop(0), attic: D.attic.wing },
    { id: 'south-east', a: [T1, CS], b: [T1, X.c1], at: (s) => [T1, CS - s], top: () => roofTop(T1), attic: D.attic.wing },
    // the middle's gables (the house door in the west one: no windows on its ground floor)
    { id: 'middle-west', a: [0, X.c0], b: [0, X.c1], at: (s) => [0, X.c0 + s], bends: [cr - X.c0], topC: (c) => crossTop(c), attic: D.attic.middle, gable: true, win0: D.floor + STOREY },
    { id: 'middle-east', a: [X.t1, X.c1], b: [X.t1, X.c0], at: (s) => [X.t1, X.c1 - s], bends: [X.c1 - cr], topC: (c) => crossTop(c), attic: D.attic.middle, gable: true },
    // the middle's long walls: over the saddle roof (closed), down to the ground where the east end stands out
    { id: 'middle-north', a: [X.t1, X.c0], b: [0, X.c0], at: (s) => [X.t1 - s, X.c0], bends: [X.t1 - T1, X.t1 - tr], top: () => sideTop, botT: (t) => (t > T1 + 1e-6 ? base() : mainRoofY(t) - 0.35), closed: true },
    { id: 'middle-south', a: [0, X.c1], b: [X.t1, X.c1], at: (s) => [s, X.c1], bends: [tr, T1], top: () => sideTop, botT: (t) => (t > T1 + 1e-6 ? base() : mainRoofY(t) - 0.35), closed: true }
  ];
}

// The walls: each cut at its bends (the ridges, the wing's corner), its windows from the lowest storey clearing the ground
function buildWalls(B) {
  for (const w of walls()) {
    const F = wallFrame(toWorld(...w.a), toWorld(...w.b));
    const bucket = w.gable ? 'gables' : 'walls';
    const top = (s) => { const [t, c] = w.at(s); return w.topC ? w.topC(c) : w.top(t); };
    const bot = (s) => (w.botT ? w.botT(w.at(s)[0]) : D.base);
    const win0 = w.win0 ?? windowsFrom(F);
    const lay = w.closed ? null : { mid: F.len / 2, half: F.len / 2 };
    const pts = [0, ...(w.bends || []).filter((s) => s > 1e-6 && s < F.len - 1e-6).sort((p, q) => p - q), F.len];
    for (let k = 0; k + 1 < pts.length; k++) {
      // (each piece's bounds straight over it: taken a hair inside its ends, where the wing's corner steps the foot)
      const p0 = pts[k], p1 = pts[k + 1], inside = (s) => Math.min(Math.max(s, p0 + 1e-4), p1 - 1e-4);
      wallStretch(B, bucket, F, p0, p1, (s) => bot(inside(s)), (s) => top(inside(s)), win0, w.attic ?? -Infinity, lay);
    }
    if (!w.botT) plinth(B, F);
    else if (w.id === 'middle-north') plinth(B, F, 0, D.middle.t1 - D.t1);
    else plinth(B, F, D.t1, D.middle.t1);
  }
}

// The roofs: the saddle roof's two planes and the cross roof's two over it, the soffits under them, a fascia round their
// edges, the ridges' caps, rafters under the eaves, the purlins' heads on carved brackets under the verges, the fretwork
// under the verges
function buildRoofs(B) {
  const R = D.roof, X = D.cross;
  const [tw] = R.west, [tr] = R.ridge, [te] = R.east;
  const main = (t) => mainRoofY(t), crossY = (t, c) => crossRoofY(c);
  // the saddle roof
  for (const ring of [[[tw, R.c0], [tr, R.c0], [tr, R.c1], [tw, R.c1]], [[tr, R.c0], [te, R.c0], [te, R.c1], [tr, R.c1]]]) {
    plane(B, 'roof', ring, main);
    plane(B, 'trim', ring, main, { down: true, dy: -0.12, colour: C.soffit });
  }
  // the cross roof: its outline split at the ridge
  const cr = X.ridge[0], ring = crossOutline();
  const northRing = [...ring.filter(([, c]) => c < cr), [X.t1, cr], [X.t0, cr]];
  const southRing = [[X.t0, cr], [X.t1, cr], ...ring.filter(([, c]) => c > cr)];
  for (const r of [northRing, southRing]) {
    plane(B, 'roof', r, crossY);
    plane(B, 'trim', r, crossY, { down: true, dy: -0.12, colour: C.soffit });
  }
  // the fascia boards: along the saddle roof's eaves and verges, the cross roof's eaves (where they overhang) and verges
  const fascia = (p, q) => beam(B, [p[0], p[1] - 0.1, p[2]], [q[0], q[1] - 0.1, q[2]], 0.04, 0.13, C.fascia);
  for (const t of [tw, te]) fascia(P3(t, R.c0, main(t)), P3(t, R.c1, main(t)));
  for (const c of [R.c0, R.c1]) { fascia(P3(tw, c, main(tw)), P3(tr, c, main(tr))); fascia(P3(tr, c, main(tr)), P3(te, c, main(te))); }
  const [wa] = X.valley.west, [ea] = X.valley.east, cn = X.north[0], cs = X.south[0];
  for (const c of [cn, cs]) { fascia(P3(X.t0, c, crossRoofY(c)), P3(wa, c, crossRoofY(c))); fascia(P3(ea, c, crossRoofY(c)), P3(X.t1, c, crossRoofY(c))); }
  for (const t of [X.t0, X.t1]) { fascia(P3(t, cn, crossRoofY(cn)), P3(t, cr, crossRoofY(cr))); fascia(P3(t, cr, crossRoofY(cr)), P3(t, cs, crossRoofY(cs))); }
  // the ridges' caps
  beam(B, P3(tr, R.c0, main(tr) + 0.05), P3(tr, R.c1, main(tr) + 0.05), 0.13, 0.06, C.ridge);
  beam(B, P3(X.t0, cr, crossRoofY(cr) + 0.05), P3(X.t1, cr, crossRoofY(cr) + 0.05), 0.13, 0.06, C.ridge);
  // rafters under the saddle roof's eaves (from the wall out to the fascia, every 0.9 m; where the middle's walls do not
  // stand under them) and the cross roof's
  for (let c = R.c0 + 0.35; c < R.c1 - 0.2; c += 0.9) {
    beam(B, P3(0, c, main(0) - 0.22), P3(tw + 0.06, c, main(tw + 0.06) - 0.22), 0.05, 0.08, C.dark);
    // (on the east not where the middle's gable stands out under the eaves)
    if (c < D.middle.c0 - 0.1 || c > D.middle.c1 + 0.1) beam(B, P3(D.t1, c, main(D.t1) - 0.22), P3(te - 0.06, c, main(te - 0.06) - 0.22), 0.05, 0.08, C.dark);
  }
  for (const [t0, t1] of [[X.t0 + 0.3, wa], [ea, X.t1 - 0.2]]) {
    for (let t = t0; t < t1; t += 0.9) {
      for (const [cw, ce] of [[D.middle.c0, cn], [D.middle.c1, cs]]) {
        const cf = ce + Math.sign(cw - ce) * 0.06;
        beam(B, P3(t, cw, crossRoofY(cw) - 0.22), P3(t, cf, crossRoofY(cf) - 0.22), 0.05, 0.08, C.dark);
      }
    }
  }
  // the purlins' heads on carved brackets under the verges: the saddle roof's gables (north and south) and the middle's
  // (west and east): from the wall out to the verge, a strut under each from the wall a metre lower
  const purlins = (at, wallO, verge, list, yOf) => {
    for (const s of list) {
      const y = yOf(s) - 0.32;
      const p = at(s, wallO), q = at(s, verge);
      beam(B, [p[0], y, p[1]], [q[0], y, q[1]], 0.09, 0.12, C.dark);
      const m = at(s, wallO + (verge - wallO) * 0.7);
      beam(B, [p[0], y - 1.1, p[1]], [m[0], y - 0.12, m[1]], 0.06, 0.07, C.dark);
    }
  };
  const mainList = [tr, tr - 3.3, tr + 3.0, 1.2, D.t1 - 1.0];
  purlins((t, c) => toWorld(t, c), 0, R.c0, mainList, main);
  purlins((t, c) => toWorld(t, c), D.len, R.c1, mainList, main);
  const crossList = [cr, cr - 1.9, cr + 1.9];
  purlins((c, t) => toWorld(t, c), 0, X.t0, crossList, (c) => crossRoofY(c));
  purlins((c, t) => toWorld(t, c), D.middle.t1, X.t1, crossList, (c) => crossRoofY(c));
  // the fretwork hanging from the verges: pieces of the atlas' valance along each, sheared to the slope
  const fret = (A, Bp, out) => {
    const L = Math.hypot(Bp[0] - A[0], Bp[2] - A[2]), n = Math.max(1, Math.round(L / 1.2));
    for (let k = 0; k < n; k++) {
      const f0 = k / n, f1 = (k + 1) / n;
      const p = [A[0] + (Bp[0] - A[0]) * f0, A[1] + (Bp[1] - A[1]) * f0 - 0.22, A[2] + (Bp[2] - A[2]) * f0];
      const q = [A[0] + (Bp[0] - A[0]) * f1, A[1] + (Bp[1] - A[1]) * f1 - 0.22, A[2] + (Bp[2] - A[2]) * f1];
      decalQuad(B, [[p[0], p[1] - 0.32, p[2]], [q[0], q[1] - 0.32, q[2]], q, p], 'fringe', out);
    }
  };
  for (const [c, dir] of [[R.c0 + 0.02, -1], [R.c1 - 0.02, 1]]) {
    const out = [FRAME_N[0] * dir, 0, FRAME_N[1] * dir];
    fret(P3(tw, c, main(tw)), P3(tr, c, main(tr)), out); fret(P3(tr, c, main(tr)), P3(te, c, main(te)), out);
  }
  for (const [t, dir] of [[X.t0 + 0.02, -1], [X.t1 - 0.02, 1]]) {
    const out = [FRAME_U[0] * dir, 0, FRAME_U[1] * dir];
    fret(P3(t, cn, crossRoofY(cn)), P3(t, cr, crossRoofY(cr)), out); fret(P3(t, cr, crossRoofY(cr)), P3(t, cs, crossRoofY(cs)), out);
  }
}
const FRAME_U = (() => { const a = toWorld(0, 0), b = toWorld(1, 0); return [b[0] - a[0], b[1] - a[1]]; })();
const FRAME_N = (() => { const a = toWorld(0, 0), b = toWorld(0, 1); return [b[0] - a[0], b[1] - a[1]]; })();

/** A quad of the atlas' cell `key` (corners: bottom left, bottom right, top right, top left seen from `out`) */
function decalQuad(B, [a, b, c, d], key, out) {
  const [ax, ay, aw, ah] = ATLAS[key], [Wd, H] = ATLAS_SIZE;
  const u0 = ax / Wd, u1 = (ax + aw) / Wd, v0 = 1 - (ay + ah) / H, v1 = 1 - ay / H;
  quadTo(B, 'decal', [a, b, c, d], out, {}, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
}

// The timber before the west front: the terrace at the ground floor and the balcony over it along the whole front with
// their balustrades and valances, the arcade's posts and arches, the wings' loggias with their posts, arches and head
function buildFront(B) {
  const F = westFront(), A = D.front, o1 = A.depth;
  const slab = (y, c0, c1) => {
    B.box('trim', F, c0, c1, 0, o1, y - A.slab, y, C.timber);
    B.decal(F, c0, c1, o1 + 0.01, y - A.slab - 0.3, y - A.slab + 0.02, 'fringe');
  };
  const balustrade = (y, c0, c1) => {
    const sides = [
      { G: F, a: c0, b: c1, o: o1 },
      { G: wallFrame(onWall(F, c0, 0), onWall(F, c0, o1)), a: 0, b: o1, o: 0 },
      { G: wallFrame(onWall(F, c1, o1), onWall(F, c1, 0)), a: 0, b: o1, o: 0 }
    ];
    for (const { G, a, b, o } of sides) {
      const n = Math.max(1, Math.round((b - a) / 1.5)), w = (b - a) / n;
      B.box('trim', G, a, b, o - 0.08, o + 0.02, y + A.railing - 0.09, y + A.railing, C.timber);
      B.box('trim', G, a, b, o - 0.08, o + 0.02, y, y + 0.08, C.timber);
      for (let k = 0; k < n; k++) B.decal(G, a + k * w, a + (k + 1) * w, o - 0.03, y + 0.08, y + A.railing - 0.09, 'railing');
    }
  };
  // the terrace and the balcony
  slab(A.terrace, A.c0, A.c1);
  balustrade(A.terrace, A.c0, A.c1);
  slab(A.balcony, A.c0, A.c1);
  balustrade(A.balcony, A.c0, A.c1);
  // the arcade: posts from the ground up to the balcony, an arch between each two under it
  const posts = arcadePosts(), under = A.balcony - A.slab;
  for (const c of posts) {
    const g = groundHeight(...onWall(F, c, o1 - 0.1));
    B.box('trim', F, c - 0.1, c + 0.1, o1 - 0.2, o1, g - 0.3, under, C.timber);
  }
  for (let k = 0; k + 1 < posts.length; k++) B.decal(F, posts[k] + 0.1, posts[k + 1] - 0.1, o1 - 0.1, under - A.arch, under, 'arch');
  // the loggias on the wings: posts from the balcony up to the head under the eaves, arches under the head
  const lp = loggiaPosts();
  for (const c of lp) B.box('trim', F, c - 0.09, c + 0.09, o1 - 0.18, o1, A.balcony, A.head, C.timber);
  for (const [c0, c1] of A.loggias) {
    B.box('trim', F, c0 - 0.05, c1 + 0.05, 0, o1, A.head, A.head + 0.18, C.timber);
    B.decal(F, c0 - 0.05, c1 + 0.05, o1 + 0.01, A.head - 0.04, A.head + 0.18, 'fringe');
    const n = A.loggiaSpans;
    for (let k = 0; k < n; k++) {
      const a = c0 + ((c1 - c0) * k) / n, b = c0 + ((c1 - c0) * (k + 1)) / n;
      B.decal(F, a + 0.09, b - 0.09, o1 - 0.09, A.head - A.arch - 0.25, A.head, 'arch');
    }
  }
}

// The house door in the middle's west gable (under the arcade): the atlas' door in a dark casing, a step before it
function buildDoor(B) {
  const F = westFront(), d = D.door, y0 = D.floor + 0.05, half = d.w / 2;
  B.box('trim', F, d.c - half - 0.14, d.c + half + 0.14, 0, 0.07, y0, y0 + d.h + 0.14, C.casing);
  B.decal(F, d.c - half, d.c + half, 0.08, y0, y0 + d.h, 'door');
  B.box('trim', F, d.c - half - 0.3, d.c + half + 0.3, 0, 0.5, D.floor - 0.4, D.floor + 0.04, C.step);
}

// The window pair under the apex of the middle's west gable: dark casings, the panes
function buildAtticPair(B) {
  const F = wallFrame(toWorld(0, D.middle.c0), toWorld(0, D.middle.c1)), A = D.atticPair, m = F.len / 2;
  for (const sgn of [-1, 1]) {
    const s = m + sgn * (A.gap / 2 + A.half);
    B.box('trim', F, s - A.half, s + A.half, 0, 0.05, A.y0, A.y1, C.casing);
    B.box('trim', F, s - A.half + 0.08, s + A.half - 0.08, 0.05, 0.07, A.y0 + 0.08, A.y1 - 0.08, C.pane);
  }
  B.box('trim', F, m - A.gap / 2 - 2 * A.half - 0.1, m + A.gap / 2 + 2 * A.half + 0.1, 0, 0.14, A.y1, A.y1 + 0.12, C.casing);
}

// The north gable's paintings and boards (u from its middle towards the west)
function buildNorthGable(B) {
  const F = northGable(), N = D.north, m = F.len / 2;
  N.figures.forEach((f, i) => B.decal(F, m + f.u - f.w / 2, m + f.u + f.w / 2, 0.03, N.figureY[0], N.figureY[1], i ? 'figureB' : 'figureA'));
  B.decal(F, m - N.shields.w / 2, m + N.shields.w / 2, 0.03, N.shields.y0, N.shields.y1, 'shields');
  B.decal(F, m + N.corner.u0, m + N.corner.u1, 0.03, N.corner.y0, N.corner.y1, 'corner');
  B.box('trim', F, m + N.sign.u0 - 0.03, m + N.sign.u1 + 0.03, 0, 0.05, N.sign.y0 - 0.03, N.sign.y1 + 0.03, C.casing);
  B.decal(F, m + N.sign.u0, m + N.sign.u1, 0.06, N.sign.y0, N.sign.y1, 'sign');
  B.decal(F, m - N.hood.w / 2, m + N.hood.w / 2, 0.04, N.hood.y0, N.hood.y1, 'hood');
}

/** The camera spots for a look at it (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  northWest: [-50, -3.9, -638, -29, 0.5, -619], // where the 2014 photograph was taken
  east: [11, -4.0, -636, -24, 1.0, -617],
  south: [-22, -11.5, -590, -28, -3.0, -617]
};

/**
 * Builds the Schweizerhaus into `scene`. Returns { group, colliders }: the arcade's posts before the west front, at
 * world heights (baseY set, so liftColliders leaves them be); the walls stand on the surveyed outline (js/landmarks.js).
 */
export function buildSchweizerhaus(scene) {
  const root = new THREE.Group();
  root.name = 'Schweizerhaus';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['walls', 'gables'], name: 'Schweizerhaus' }), M = materials();
  buildWalls(B);
  buildRoofs(B);
  buildFront(B);
  buildDoor(B);
  buildAtticPair(B);
  buildNorthGable(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: postColliders() };
}

/** The arcade's posts for the player: thin boxes from under the ground up to the balcony */
export function postColliders() {
  const F = westFront(), A = D.front, out = [];
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  for (const c of arcadePosts()) {
    const [cx, cz] = onWall(F, c, A.depth - 0.1), hx = 0.13, hz = 0.13;
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    const y0 = groundHeight(cx, cz) - 0.5, y1 = A.balcony - A.slab;
    out.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } });
  }
  return out;
}
