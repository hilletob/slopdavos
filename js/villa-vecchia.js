import * as THREE from 'three/webgpu';
import { abs, float, fract, hash, mix, smoothstep, step, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  VILLA_VECCHIA, columnsOf, groundOutlines, innerWall, meetZ, onWall, outwardRing, part, roofAt, sAlong, wallFrame, wallNamed, wallTopAt,
  wallsOf
} from './villa-vecchia-data.js';

export { VILLA_VECCHIA };

// The Villa Vecchia, the "Gemeinde Haus" of Davos Dorf, rebuilt by hand (js/villa-vecchia-data.js), standing in for its
// swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows: the main house,
// the bay on its north side and the lower wing on its west in white plaster over a grey stone plinth, under dark saddle
// roofs with timber eaves; a window in a dark red-brown frame in every column of every floor, between shutters striped
// red and black, the ground floor's behind wrought-iron grilles (drawn by the wall's material from its uv: metres along
// the wall from the column's middle, metres up the floors' grid); the painted east front (the name, the three arms with
// their captions, the grilles' crests), the porch with its arch on the north-east corner, the wing's loggia, the dormers
// and the chimney. Five meshes: the walls, the roofs, the glass, the trim (one vertex-coloured mesh) and the decals (one
// canvas atlas).

excludeBuildings(VILLA_VECCHIA.exclude);
// (the player's walls on the surveyed volumes and the porch, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(VILLA_VECCHIA.osm, groundOutlines());

const V = VILLA_VECCHIA, WIN = V.win, STOREY = V.storey;
// v of a wall: metres up the floors' grid, the ground floor's foot at UP (its storey GF); closed walls carry v − CLOSED
const GF = 40, UP = GF * STOREY, CLOSED = 300 * STOREY;
const BAY = 50; // (one window per column: the columns are laid out one by one)

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.6, 0.6, 0.58], ROOF = [0.13, 0.125, 0.12];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
  // the loggia's glazing: dark, a warm glow behind it at night
  M.glass = SIMPLE_SKINS.glow([0.04, 0.05, 0.055], 0.15, 0.4, [1.0, 0.78, 0.5], 0.3);
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colour, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.55, 0.55, 0.53], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.3, { bay: BAY, half: WIN.half });
    return M;
  }
  const glow = nightGlow(), near = fade(30, 160), fine = fade(8, 28);
  // White plaster with a window per column and floor: a dark red-brown frame, a post in its middle and a rail across its
  // upper part, a grey sill; the shutters beside it striped red and black on the diagonal (a mean red far off), on the
  // ground floor a wrought-iron grille over it instead; a curtain drawn in some
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  const { half, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
  const gf = step(storey, GF + 0.5), upper = float(1).sub(gf);
  const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
  const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.03, 0.018, abs(fv.sub(WIN.hi - 0.55))));
  const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(bars.mul(near))).mul(open);
  const sill = rect(WIN.half + 0.07, WIN.lo - 0.08, WIN.lo).mul(open).mul(near);
  const shutter = rect(WIN.half + WIN.shutter, WIN.lo, WIN.hi).sub(rect(WIN.half + 0.02, WIN.lo - 0.2, WIN.hi + 0.2, 0.006)).max(0).mul(open).mul(upper);
  const stripe = step(0.5, fract(abs(bu).add(fv).div(0.3)));
  const shutterC = mix(vec3(0.13, 0.025, 0.02), mix(vec3(0.025, 0.018, 0.016), vec3(0.26, 0.025, 0.02), stripe), fine);
  const grilleArea = rect(WIN.half + 0.06, WIN.lo - 0.04, WIN.hi + 0.02).mul(open).mul(gf);
  const ironV = smoothstep(0.4, 0.45, abs(fract(bu.div(0.12)).sub(0.5)));
  const ironH = smoothstep(0.43, 0.47, abs(fract(fv.sub(WIN.lo).div(0.52)).sub(0.5)));
  const iron = ironV.max(ironH).mul(grilleArea).mul(mix(float(0.35), float(1), fine));
  const stain = rect(WIN.half, WIN.lo - 0.7, WIN.lo - 0.08, 0.2).mul(open).mul(0.04);
  const wall = mix(vec3(0.56, 0.56, 0.54), vec3(...PLASTER).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain));
  const id = hash(half.mul(731.3).add(storey.mul(91.7)));
  const curtain = step(0.45, id).mul(smoothstep(0.3, 0.32, abs(bu)).max(step(0.8, id))).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.024, 0.03), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
  let c = mix(wall, vec3(0.42, 0.42, 0.4), sill);
  c = mix(c, shutterC, shutter);
  c = mix(c, vec3(0.1, 0.035, 0.025), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.46, 0.45, 0.42), curtain);
  c = mix(c, vec3(0.02, 0.02, 0.022), iron);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain)).mul(float(1).sub(iron));
  m.roughnessNode = mix(float(0.92), float(0.15), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (the commune's offices and flats: some rooms lit in the evening, few towards midnight)
  m.emissiveNode = litWindow(half.mul(100).floor(), storey, 23, { share: 0.35, late: 0.08, tone: twoTones([1.0, 0.74, 0.46], [0.86, 0.9, 1.0], 0.85) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(float(1).sub(iron.mul(0.6))).mul(glow);
  M.plaster = m;
  return M;
}

// --- The painted front, the doors and the dormers' windows: one canvas atlas ------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  name: [0, 0, 400, 200],
  crest: [404, 0, 220, 92],
  attic: [404, 96, 196, 140],
  door: [630, 0, 104, 200],
  zehn: [0, 250, 340, 192],
  stand: [342, 250, 340, 192],
  eidg: [684, 250, 340, 192]
};
const INK = '#2a1712', RED = '#8e1c18';

// A shield: its outline as a path (w × h at x, y)
function shield(g, x, y, w, h) {
  g.beginPath();
  g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h * 0.55);
  g.quadraticCurveTo(x + w, y + h * 0.9, x + w / 2, y + h);
  g.quadraticCurveTo(x, y + h * 0.9, x, y + h * 0.55);
  g.closePath();
}
// The arms with "A.D.", the year beside it and the caption under it
function arms(g, w, year, caption, paint) {
  const sw = 64, sh = 76, sx = (w - sw) / 2, sy = 8;
  g.save(); shield(g, sx, sy, sw, sh); g.clip(); paint(sx, sy, sw, sh); g.restore();
  shield(g, sx, sy, sw, sh); g.strokeStyle = '#3a2a22'; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '20px Georgia, "Times New Roman", serif';
  g.fillText('A.D.', sx - 40, 112);
  g.fillText(year, sx + sw + 44, 106);
  g.font = 'small-caps 28px Georgia, "Times New Roman", serif';
  g.fillStyle = RED;
  g.fillText(caption, w / 2, 152, w - 12);
}

function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  cell('name', (w) => {
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 62px Georgia, "Times New Roman", serif';
    g.fillText('GEMEINDE', w / 2, 58, w - 20);
    g.fillText('HAUS', w / 2, 140, w - 20);
  });
  // the wrought-iron crest over a ground floor's window: scrolls round a spike
  cell('crest', (w, h) => {
    g.strokeStyle = '#141212'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(8, h - 4); g.lineTo(w - 8, h - 4); g.stroke();
    for (const d of [-1, 1]) {
      for (const [cx, r] of [[0.3, 22], [0.14, 15]]) {
        g.beginPath(); g.arc(w / 2 + d * w * cx, h - 4 - r, r, 0, Math.PI * 2); g.stroke();
      }
      g.beginPath(); g.moveTo(w / 2 + d * 8, h - 4); g.quadraticCurveTo(w / 2 + d * 30, h - 60, w / 2 + d * 6, h - 72); g.stroke();
    }
    g.beginPath(); g.moveTo(w / 2, h - 4); g.lineTo(w / 2, 8); g.stroke();
    g.fillStyle = '#141212'; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2 - 7, 14); g.lineTo(w / 2 + 7, 14); g.fill();
  });
  // a dormer's window between its shutters
  cell('attic', (w, h) => {
    const sw = 46;
    for (const x0 of [0, w - sw]) {
      g.fillStyle = '#5a0f0c'; g.fillRect(x0, 8, sw, h - 16);
      g.strokeStyle = '#120c0a'; g.lineWidth = 9;
      g.save(); g.beginPath(); g.rect(x0, 8, sw, h - 16); g.clip();
      for (let k = -h; k < w + h; k += 22) { g.beginPath(); g.moveTo(x0 + k, 8); g.lineTo(x0 + k + (x0 ? -h : h), h + 8); g.stroke(); }
      g.restore();
    }
    g.fillStyle = '#2a0f0a'; g.fillRect(sw, 4, w - 2 * sw, h - 8);
    g.fillStyle = '#0e1216'; g.fillRect(sw + 10, 14, (w - 2 * sw) / 2 - 14, h - 28); g.fillRect(w / 2 + 4, 14, (w - 2 * sw) / 2 - 14, h - 28);
  });
  // a timber door under a round arch, in its stone frame
  cell('door', (w, h) => {
    const r = w / 2;
    g.fillStyle = '#9a9890';
    g.beginPath(); g.moveTo(0, h); g.lineTo(0, r); g.arc(r, r, r, Math.PI, 0); g.lineTo(w, h); g.closePath(); g.fill();
    g.fillStyle = '#4a2814';
    g.beginPath(); g.moveTo(10, h); g.lineTo(10, r + 2); g.arc(r, r + 2, r - 10, Math.PI, 0); g.lineTo(w - 10, h); g.closePath(); g.fill();
    g.strokeStyle = '#2c160a'; g.lineWidth = 3;
    for (const y of [r + 30, r + 75, h - 30]) { g.beginPath(); g.moveTo(16, y); g.lineTo(w - 16, y); g.stroke(); }
    g.beginPath(); g.moveTo(r, r - 8); g.lineTo(r, h); g.stroke();
    g.fillStyle = '#c8a040'; g.fillRect(w - 26, h * 0.6, 6, 12);
  });
  // the three arms, drawn plainly: the Zehngerichtenbund's blue cross on gold, the Stand Graubünden's three fields (the
  // Grey League black and white, the Zehngerichtenbund's cross, the Gotteshausbund's white field), the Swiss cross
  cell('zehn', (w) => arms(g, w, '1436', 'der Zehn Gerichte Bund', (x, y, sw, sh) => {
    g.fillStyle = '#e8b818'; g.fillRect(x, y, sw, sh);
    g.fillStyle = '#1d4f9c'; g.fillRect(x + sw * 0.4, y, sw * 0.2, sh); g.fillRect(x, y + sh * 0.36, sw, sh * 0.18);
  }));
  cell('stand', (w) => arms(g, w, '1471', 'der Stand Graubünden', (x, y, sw, sh) => {
    g.fillStyle = '#f2f0ea'; g.fillRect(x, y, sw, sh);
    g.fillStyle = '#161616'; g.fillRect(x, y, sw * 0.25, sh * 0.42);
    g.fillStyle = '#e8b818'; g.fillRect(x + sw * 0.5, y, sw * 0.5, sh * 0.42);
    g.fillStyle = '#1d4f9c'; g.fillRect(x + sw * 0.7, y, sw * 0.1, sh * 0.42); g.fillRect(x + sw * 0.5, y + sh * 0.16, sw * 0.5, sh * 0.08);
    g.fillStyle = '#161616'; g.fillRect(x, y + sh * 0.42, sw, 2);
  }));
  cell('eidg', (w) => arms(g, w, '1803', 'die Eidgenossenschaft', (x, y, sw, sh) => {
    g.fillStyle = '#d5171c'; g.fillRect(x, y, sw, sh);
    g.fillStyle = '#ffffff'; g.fillRect(x + sw * 0.41, y + sh * 0.16, sw * 0.18, sh * 0.56); g.fillRect(x + sw * 0.19, y + sh * 0.35, sw * 0.62, sh * 0.17);
  }));
  return canvasTexture(canvas);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  stone: [0.24, 0.235, 0.22], soffit: [0.09, 0.055, 0.035], fascia: [0.05, 0.035, 0.028], vent: [0.03, 0.03, 0.03],
  frame: [0.4, 0.4, 0.38], step: [0.3, 0.3, 0.29], plaster: PLASTER, inside: [0.38, 0.38, 0.36], cap: [0.1, 0.1, 0.1],
  slab: [0.55, 0.55, 0.53], rail: [0.04, 0.04, 0.04]
};
const THICK = V.thick;

/** A quad facing `want` ([x, y, z]): the corners' order turned if need be */
function facing(B, bucket, pts, want, opt = {}) {
  const [a, b, , d] = pts;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const p = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0 ? pts : [pts[0], pts[3], pts[2], pts[1]];
  B.quad(bucket, p[0], p[1], p[2], p[3], undefined, opt);
}
/** A roof's slab: its top (four corners [x, y, z]) in the roof's mesh, the timber underside and edges in the trim */
function slab(B, top) {
  const low = top.map(([x, y, z]) => [x, y - THICK, z]);
  facing(B, 'roof', top, [0, 1, 0]);
  facing(B, 'trim', low, [0, -1, 0], { colour: C.soffit });
  const cx = top.reduce((s, p) => s + p[0], 0) / 4, cz = top.reduce((s, p) => s + p[2], 0) / 4;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, mx = (top[i][0] + top[j][0]) / 2, mz = (top[i][2] + top[j][2]) / 2;
    facing(B, 'trim', [top[i], top[j], low[j], low[i]], [mx - cx, 0, mz - cz], { colour: C.fascia });
  }
}

// A stretch of closed plaster on a wall: s0–s1 along it, from y0 up to its top at each end
function closed(B, F, s0, s1, y0, t0, t1) {
  if (t0 <= y0 + 1e-3 && t1 <= y0 + 1e-3) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; }, mid = (s0 + s1) / 2;
  const v = (y) => y - V.ground + UP - CLOSED;
  B.quad('plaster', P(s0, y0), P(s1, y0), P(s1, Math.max(y0, t1)), P(s0, Math.max(y0, t0)),
    [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(Math.max(y0, t1))], [s0 - mid, v(Math.max(y0, t0))]]);
}

let columnId = 0;
// A wall of a part: cut into vertical strips (at its columns' edges, the ridge, where its top crosses a column's
// window range); each strip closed under its column's first window, windowed up to the attic (or the gable's top),
// closed over that
function buildWall(B, p, w) {
  const F = w.F, top = (s) => wallTopAt(p, ...onWall(F, s));
  const cols = columnsOf(p, w, groundHeight).map((c) => ({ ...c, half: V.column + 0.01 * (columnId++) }));
  const cuts = new Set([0, F.len]);
  for (const c of cols) { cuts.add(Math.max(0, c.s - V.column)); cuts.add(Math.min(F.len, c.s + V.column)); }
  // (the ridge over the wall, where its top turns)
  const R = p.roof, ax = R.ridge === 'x' ? 1 : 0;
  if (Math.abs(F.u[ax]) > 0.7) { const s = sAlong(F, R.at); if (s > 0 && s < F.len) cuts.add(s); }
  // (where the top crosses a column's levels: the strips' tops stay straight between the cuts)
  const sorted0 = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i + 1 < sorted0.length; i++) {
    const s0 = sorted0[i], s1 = sorted0[i + 1], t0 = top(s0), t1 = top(s1);
    for (const c of cols) for (const y of [c.from, c.to]) {
      if ((t0 - y) * (t1 - y) < 0) cuts.add(s0 + (s1 - s0) * (y - t0) / (t1 - t0));
    }
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  for (let i = 0; i + 1 < sorted.length; i++) {
    const s0 = sorted[i], s1 = sorted[i + 1];
    if (s1 - s0 < 1e-3) continue;
    const t0 = top(s0), t1 = top(s1), sm = (s0 + s1) / 2;
    const col = cols.find((c) => sm > c.s - V.column && sm < c.s + V.column);
    if (!col) { closed(B, F, s0, s1, V.base, t0, t1); continue; }
    closed(B, F, s0, s1, V.base, Math.min(t0, col.from), Math.min(t1, col.from));
    // the windowed band: from the first window's floor up to the attic or the gable's top
    const y0 = col.from, a0 = Math.min(t0, col.to), a1 = Math.min(t1, col.to);
    if (a0 > y0 + 1e-3 || a1 > y0 + 1e-3) {
      const v = (y) => y - V.ground + UP, u0 = s0 - col.s, u1 = s1 - col.s;
      const b0 = Math.max(y0, a0), b1 = Math.max(y0, a1);
      B.quad('plaster', P(s0, y0), P(s1, y0), P(s1, b1), P(s0, b0), [[u0, v(y0)], [u1, v(y0)], [u1, v(b1)], [u0, v(b0)]], { half: col.half });
    }
    closed(B, F, s0, s1, col.to, t0, t1);
  }
  // the stone plinth along the wall, the vents in the east front
  B.box('trim', F, -0.04, F.len + 0.04, 0, 0.05, V.base, V.plinth, C.stone);
  if (w.key === 'main:east') for (const c of cols) B.box('trim', F, c.s - 0.17, c.s + 0.17, 0.05, 0.08, V.plinth + 0.08, V.plinth + 0.5, C.vent);
  // a door's stone frame and step in place of a ground floor's window
  for (const c of cols.filter((q) => q.door)) {
    B.box('trim', F, c.s - 0.72, c.s + 0.72, 0, 0.06, V.ground, V.ground + 2.37, C.frame);
    B.box('trim', F, c.s - 0.95, c.s + 0.95, 0, 0.95, V.base, V.ground + 0.05, C.step);
  }
}

// A part: its walls (not those inside another part), its roof
function buildPart(B, p) {
  for (const w of wallsOf(p)) {
    if (innerWall(p, w.a, w.b) || w.F.len < 0.05) continue;
    buildWall(B, p, w);
  }
  const R = p.roof, Y = (x, z) => roofAt(p, x, z);
  if (R.ridge === 'x') {
    for (const [za, zb] of [[R.z0, R.at], [R.at, R.z1]]) slab(B, [[R.x0, Y(R.x0, za), za], [R.x1, Y(R.x1, za), za], [R.x1, Y(R.x1, zb), zb], [R.x0, Y(R.x0, zb), zb]]);
  } else {
    // the cross gable: each side from the gable's edge back to its valley with the main roof
    const into = part(R.into);
    for (const xe of [R.x0, R.x1]) {
      const ye = Y(xe, R.z0);
      slab(B, [[xe, ye, R.z0], [R.at, R.top, R.z0], [R.at, R.top, meetZ(into, R.top)], [xe, ye, meetZ(into, ye)]]);
    }
  }
}

// The porch on the north-east corner: its walls with the arch facing east, the lean-to roof, the inside seen through the
// arch (the floor, the north wall's inner face), the steps
function buildPorch(B) {
  const Pc = V.porch, ring = outwardRing(Pc.ring);
  const z0 = Math.min(...Pc.ring.map((q) => q[1])), z1 = Math.max(...Pc.ring.map((q) => q[1]));
  const x0 = Math.min(...Pc.ring.map((q) => q[0])), x1 = Math.max(...Pc.ring.map((q) => q[0]));
  const k = (Pc.high - Pc.low) / (z1 - z0);
  const roofY = (z) => Pc.high - k * (z1 - z);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.n[1] > 0.7) continue; // (against the house)
    const top = (s) => roofY(onWall(F, s)[1]) - THICK;
    if (F.n[0] > 0.7) {
      // the east face: two piers, the arch over the opening, the sill under it
      const A = Pc.arch, m = F.len / 2, r = A.half;
      closed(B, F, 0, m - r, V.base, top(0), top(m - r));
      closed(B, F, m + r, F.len, V.base, top(m + r), top(F.len));
      closed(B, F, m - r, m + r, V.base, Pc.floor, Pc.floor);
      const N = 10, P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
      for (let j = 0; j < N; j++) {
        const q0 = Math.PI * (1 - j / N), q1 = Math.PI * (1 - (j + 1) / N);
        const s0 = m + r * Math.cos(q0), s1 = m + r * Math.cos(q1), y0 = A.spring + r * Math.sin(q0), y1 = A.spring + r * Math.sin(q1);
        const v = (y) => y - V.ground + UP - CLOSED;
        B.quad('plaster', P(s0, y0), P(s1, y1), P(s1, top(s1)), P(s0, top(s0)), [[s0 - m, v(y0)], [s1 - m, v(y1)], [s1 - m, v(top(s1))], [s0 - m, v(top(s0))]]);
      }
      // the reveal round the opening and the steps up to it
      for (const s of [m - r - 0.02, m + r + 0.02]) B.box('trim', F, s - 0.02, s + 0.02, -0.25, 0, Pc.floor, A.spring, C.inside);
      let gy = -Infinity;
      for (const s of [m - 0.9, m, m + 0.9]) gy = Math.max(gy, groundHeight(...onWall(F, s, 1.0)));
      const rise = (Pc.floor - Math.min(gy, Pc.floor - 0.2)) / Pc.steps;
      for (let j = 0; j < Pc.steps; j++) B.box('trim', F, m - 0.9, m + 0.9, -0.05, 0.3 * (j + 1), V.base, Pc.floor - j * rise, C.step);
    } else closed(B, F, 0, F.len, V.base, top(0), top(F.len));
    B.box('trim', F, -0.04, F.len + 0.04, 0, 0.05, V.base, Math.min(V.plinth, Pc.floor), C.stone);
  }
  // the roof, the floor, the north wall's inner face
  const zo = z0 - Pc.over, xe = x1 + Pc.over;
  slab(B, [[x0, roofY(zo), zo], [xe, roofY(zo), zo], [xe, roofY(z1), z1], [x0, roofY(z1), z1]]);
  const S = wallFrame([x0, z1], [x1, z1]); // (the house's wall: s east, o out to the north is negative)
  B.box('trim', S, 0, x1 - x0 - 0.25, -(z1 - z0) + 0.25, 0, V.base, Pc.floor, C.step);
  facing(B, 'trim', [[x0, Pc.floor, z0 + 0.25], [x1 - 0.25, Pc.floor, z0 + 0.25], [x1 - 0.25, roofY(z0) - THICK, z0 + 0.25], [x0, roofY(z0) - THICK, z0 + 0.25]], [0, 0, 1], { colour: C.inside });
}

// The wing's loggia on its south side: dark glazing from the first floor up, a white slab and a black rail per floor
function buildLoggia(B) {
  const L = V.loggia, F = wallNamed(L.wall).F;
  const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
  B.quad('glass', P(L.from, L.y0), P(L.to, L.y0), P(L.to, L.y1), P(L.from, L.y1));
  for (let y = L.y0; y < L.y1 - 1; y += STOREY) {
    B.box('trim', F, L.from - 0.1, L.to + 0.1, 0, 0.3, y - 0.18, y, C.slab);
    B.box('trim', F, L.from, L.to, 0.22, 0.27, y + 0.95, y + 1.02, C.rail);
    for (let s = L.from; s <= L.to + 0.01; s += (L.to - L.from) / 8) B.box('trim', F, s - 0.015, s + 0.015, 0.23, 0.26, y, y + 0.95, C.rail);
  }
  for (const s of [L.from, L.to]) B.box('trim', F, s - 0.1, s + 0.1, 0, 0.12, L.y0 - 0.18, L.y1, C.plaster);
}

// The dormers on the main roof's south side: a plaster front with a window between shutters, cheeks down to the roof, a
// small saddle roof running back into the main one
function buildDormers(B) {
  const D = V.dormers, main = part('main'), R = main.roof;
  const zAt = (y) => R.at + (R.top - y) / R.slope[1]; // (where the main roof's south side stands at y)
  for (const x of D.xs) {
    const foot = roofAt(main, x, D.z), F = wallFrame([x - D.half, D.z], [x + D.half, D.z]);
    const cheek = D.eave + 0.05;
    closed(B, F, 0, 2 * D.half, foot - 0.3, cheek, cheek);
    // the gable over the front
    const P = (s, y) => { const [px, pz] = onWall(F, s); return [px, y, pz]; };
    const apex = D.ridge - THICK;
    B.tri('plaster', P(0, cheek), P(2 * D.half, cheek), P(D.half, apex), [[-D.half, cheek - V.ground + UP - CLOSED], [D.half, cheek - V.ground + UP - CLOSED], [0, apex - V.ground + UP - CLOSED]]);
    // the cheeks: from the front back to where the roof rises to their top
    // (both faces: the cheeks are seen from either side over the roof)
    const zb = zAt(cheek);
    for (const xs of [x - D.half, x + D.half]) {
      B.tri('trim', [xs, foot - 0.3, D.z], [xs, cheek, D.z], [xs, cheek, zb], undefined, { colour: C.plaster });
      B.tri('trim', [xs, foot - 0.3, D.z], [xs, cheek, zb], [xs, cheek, D.z], undefined, { colour: C.plaster });
    }
    for (const xe of [x - D.half - 0.15, x + D.half + 0.15]) {
      const zf = D.z + 0.2;
      slab(B, [[xe, D.eave, zf], [x, D.ridge, zf], [x, D.ridge, zAt(D.ridge)], [xe, D.eave, zAt(D.eave)]]);
    }
    B.decal(F, D.half - 0.65, D.half + 0.65, 0.03, foot + 0.05, Math.min(cheek - 0.08, foot + 0.98), 'attic');
  }
}

/**
 * Builds the Villa Vecchia into `scene`. Returns { group, colliders } (no colliders of its own: the player's walls stand
 * on the surveyed outlines and the porch's, registered above for js/buildings.js).
 */
export function buildVillaVecchia(scene) {
  const root = new THREE.Group();
  root.name = 'Villa Vecchia';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Villa Vecchia' }), M = materials();
  columnId = 0;
  for (const p of V.parts) buildPart(B, p);
  buildPorch(B);
  buildLoggia(B);
  buildDormers(B);
  // the chimney by the ridge
  const Ch = V.chimney, CF = wallFrame([Ch.x, Ch.z], [Ch.x + Ch.w, Ch.z]);
  const chFoot = roofAt(part('main'), Ch.x, Ch.z) - 0.6;
  B.box('trim', CF, 0, Ch.w, -Ch.w, 0, chFoot, Ch.top, C.plaster);
  B.box('trim', CF, -0.06, Ch.w + 0.06, -Ch.w - 0.06, 0.06, Ch.top, Ch.top + 0.12, C.cap);
  // the painted front, the crests, the doors
  for (const d of V.decals) {
    const w = wallNamed(d.wall), s = sAlong(w.F, d.at);
    B.decal(w.F, s - d.w / 2, s + d.w / 2, d.key === 'door' ? 0.08 : 0.025, d.y0, d.y1, d.key);
  }
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
