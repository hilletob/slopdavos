import * as THREE from 'three/webgpu';
import { abs, float, hash, mix, smoothstep, step, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  PARSENN_GADA, annexTop, blockDoor, blockRoofY, annexRoofY, blockTop, groundOutlines, isListed, onWall, outwardRing, roofRing, splitAtT, toLocal,
  towerRoofY, wallFrame, windowLine
} from './parsenn-gada-data.js';

export { PARSENN_GADA };

// The house of the Parsenn Gada bar rebuilt by hand (js/parsenn-gada-data.js), standing in for its swissBUILDINGS3D
// volumes, which the streamed tiles drew as white blocks with the town houses' windows: the block behind the Sport
// Hotel Parsenn's narrow wing under its shallow saddle roof, the tower rising over the hotel's roofs under its hipped
// roof with the timber balcony on its top floor, the low annex towards the fire station; cream plaster with a window
// in a light painted surround and a white frame in every bay of every floor (drawn by the wall's material from its
// uv: metres along the wall from its middle, metres up the floors' grid), a grey plinth, dark timber eaves, a door with
// a small canopy in the gable towards the Seeli, the annex's arched door, two small windows in the gable. Four meshes:
// the walls, the roofs, the trim (one vertex-coloured mesh) and the doors (one small canvas atlas). The bar itself is
// in the hotel's narrow wing (js/sport-hotel-parsenn.js), which keeps js/shops.js' sign.

excludeBuildings(PARSENN_GADA.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(PARSENN_GADA.osm, groundOutlines());

const { storey: STOREY, line: LINE, foot: FOOT, win: WIN, bay: BAY } = PARSENN_GADA;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the ground floor's at 40 of
// them); closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
const SURROUND = 0.12;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.5, 0.455, 0.37], LIGHT = [0.56, 0.535, 0.47], WHITE = [0.6, 0.6, 0.58];
const TIMBER = [0.11, 0.06, 0.03], SOFFIT = [0.085, 0.05, 0.028], ROOF = [0.1, 0.09, 0.085];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.46, 0.425, 0.35], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.3);
    return M;
  }
  const near = fade(60, 200), fine = fade(8, 28);
  const glow = nightGlow();
  // Cream plaster with a window per bay and floor: a light painted surround with the sill under it, a white frame, four
  // panes (a post and a bar, fading out with distance), a curtain drawn in some
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half + SURROUND });
  const surround = rect(WIN.half + SURROUND, WIN.lo - SURROUND - 0.05, WIN.hi + SURROUND).mul(open);
  const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
  const bars = smoothstep(0.035, 0.022, abs(bu)).max(smoothstep(0.03, 0.018, abs(fv.sub(WIN.hi - 0.5))));
  const pane = rect(WIN.half - 0.06, WIN.lo + 0.06, WIN.hi - 0.06).mul(float(1).sub(bars.mul(fine))).mul(open);
  // the plaster: a little weathering, a shade darker under the sills
  const stain = rect(WIN.half, WIN.lo - 0.9, WIN.lo - SURROUND - 0.05, 0.25).mul(open).mul(0.05);
  const wall = mix(vec3(0.46, 0.42, 0.34), vec3(...PLASTER).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain));
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
  const drawn = step(0.55, id).mul(mix(float(0.35), float(0.9), step(0.85, id)));
  const span = WIN.hi - WIN.lo - 0.12;
  const curtain = step(float(WIN.hi - 0.06).sub(drawn.mul(span)), fv).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
  let c = mix(wall, vec3(...LIGHT), surround.mul(near.mul(0.6).add(0.4)));
  c = mix(c, vec3(...WHITE), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.5, 0.45, 0.38), curtain);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.92), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (flats and rooms: lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 41, { share: 0.3, late: 0.08, tone: twoTones([1.0, 0.72, 0.42], [1.0, 0.86, 0.66], 0.7) })
    .mul(pane).mul(mix(float(1), float(0.5), curtain)).mul(glow.mul(1.1));
  M.plaster = m;
  return M;
}

// --- The doors: one small canvas atlas -----------------------------------------------------------------------------------
const ATLAS_SIZE = [512, 256];
export const ATLAS = {
  arch: [0, 0, 192, 256],
  door: [208, 0, 128, 256]
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // The annex's arched door: a light stone surround, dark timber boards, the arch's fanlight
  cell('arch', (w, h) => {
    const r = w / 2;
    g.fillStyle = '#b9b2a2';
    g.beginPath(); g.moveTo(0, h); g.lineTo(0, r); g.arc(r, r, r, Math.PI, 0); g.lineTo(w, h); g.closePath(); g.fill();
    const q = r - 16;
    g.fillStyle = '#2e1d10';
    g.beginPath(); g.moveTo(16, h); g.lineTo(16, r); g.arc(r, r, q, Math.PI, 0); g.lineTo(w - 16, h); g.closePath(); g.fill();
    g.fillStyle = '#1a2024';
    g.beginPath(); g.moveTo(16, r); g.arc(r, r, q, Math.PI, 0); g.closePath(); g.fill();
    g.strokeStyle = '#3d2817'; g.lineWidth = 4;
    for (let x = 34; x < w - 20; x += 18) { g.beginPath(); g.moveTo(x, r + 6); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = '#c8b27a'; g.fillRect(w / 2 + 14, h * 0.66, 8, 18);
  });
  // The block's door: dark timber with panels and a glazed upper part, in a light surround
  cell('door', (w, h) => {
    g.fillStyle = '#b9b2a2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b1a0e'; g.fillRect(12, 12, w - 24, h - 12);
    g.fillStyle = '#1a2024'; g.fillRect(24, 26, w - 48, 86);
    g.fillStyle = '#3b2615'; g.fillRect(24, 128, w - 48, 52); g.fillRect(24, 192, w - 48, 52);
    g.fillStyle = '#c8b27a'; g.fillRect(w - 34, 140, 8, 20);
  });
  return canvasTexture(c);
}

// --- Geometry helpers --------------------------------------------------------------------------------------------------
const C = { timber: TIMBER, soffit: SOFFIT, frame: WHITE, pane: [0.025, 0.03, 0.035], surround: LIGHT, plinth: [0.24, 0.235, 0.22], step: [0.3, 0.3, 0.29] };

// The highest ground along a wall, half a metre out of it
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}
/** A painted patch on a wall's face (`o` m before it) */
function paint(B, F, s0, s1, y0, y1, colour, o = 0.012) {
  const P = (s, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  B.quad('trim', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), undefined, { colour });
}
/** A triangle or quad turned to face up (the roofs) */
function up(B, bucket, pts, uvOf, opt = {}) {
  const [a, b, c] = pts;
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const P = ny > 0 ? pts : [...pts].reverse();
  if (P.length === 3) B.tri(bucket, P[0], P[1], P[2], P.map(uvOf), opt);
  else B.quad(bucket, P[0], P[1], P[2], P[3], P.map(uvOf), opt);
}

// --- The walls ---------------------------------------------------------------------------------------------------------
/**
 * A wall a → b from `from` up to its roof (`topOf(x, z)`): closed under the ground floor's foot (a grey plinth over the
 * ground), the floors' windows up to the highest floor that fits under its lowest top, closed above (the gables);
 * `closed`: no windows at all; `ground: false`: the ground floor closed; `clear` [[s0, s1]]: the ground floor kept
 * free there (a door). Returns the wall's frame and its tops
 */
function buildWall(B, a, b, topOf, { from = PARSENN_GADA.base, closed = false, ground = true, clear = [], ridge = null } = {}) {
  const F = wallFrame(a, b);
  if (F.len < 0.05) return null;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  // (a sample every 0.5 m and where the wall crosses its roof's ridge; the ones where the top runs straight on dropped)
  const all = [];
  for (let s = 0; s < F.len - 0.05; s += 0.5) all.push(s);
  all.push(F.len);
  if (ridge) {
    const [k, at] = ridge, va = toLocal(...F.a)[k], vb = toLocal(...onWall(F, F.len))[k];
    if ((va - at) * (vb - at) < 0) all.push(((at - va) / (vb - va)) * F.len);
    all.sort((p, q) => p - q);
  }
  const tops = all.map((s) => topOf(...onWall(F, s, -0.05)));
  const keep = all.map((s, i) => i === 0 || i === all.length - 1 || Math.abs(tops[i - 1] + (tops[i + 1] - tops[i - 1]) * ((s - all[i - 1]) / (all[i + 1] - all[i - 1])) - tops[i]) > 0.01);
  const s = all.filter((_, i) => keep[i]), top = tops.filter((_, i) => keep[i]);
  const foot = groundAlong(F) + 0.25;
  const L = closed ? -Infinity : windowLine(Math.min(...top));
  // (the ground floor's windows only where their sills stand clear of the ground)
  const g0 = ground && foot < FOOT + WIN.lo - 0.15 ? FOOT : LINE;
  const v = (y, open) => y - LINE + UP - (open ? 0 : CLOSED);
  // a quad from y0 to y1 (a pair: a sloped top) over s0–s1; `st` its stretch ({ from, to }) when it has windows
  const quad = (s0, s1, y0, y1, st) => {
    const [ya, yb] = Array.isArray(y1) ? y1 : [y1, y1];
    if (Math.max(ya, yb) - y0 < 0.005) return;
    const open = !!st && st.to - st.from >= 2 * (WIN.half + SURROUND) + 0.85;
    const mid = st ? (st.from + st.to) / 2 : F.len / 2, half = open ? (st.to - st.from) / 2 : 0;
    B.quad('plaster', P(s0, y0), P(s1, y0), P(s1, yb), P(s0, ya), [[s0 - mid, v(y0, open)], [s1 - mid, v(y0, open)], [s1 - mid, v(yb, open)], [s0 - mid, v(ya, open)]], { half });
  };
  // the ground floor's stretches round the clear ones
  const low = [];
  let at = 0;
  for (const [c0, c1] of [...clear].sort((p, q) => p[0] - q[0])) {
    if (c0 - at > 0.01) low.push({ from: at, to: c0 });
    low.push({ from: c0, to: c1, shut: true });
    at = c1;
  }
  if (F.len - at > 0.01) low.push({ from: at, to: F.len });
  const whole = { from: 0, to: F.len };
  for (let i = 0; i + 1 < s.length; i++) {
    const s0 = s[i], s1 = s[i + 1];
    const yTop = [top[i], top[i + 1]];
    if (closed || L <= Math.max(from, g0) + 0.01) { quad(s0, s1, from, yTop, null); continue; }
    const w0 = Math.max(from, g0);
    quad(s0, s1, from, w0, null);
    if (w0 < LINE - 0.01) {
      // (the ground floor, cut where it is kept clear)
      for (const st of low) {
        const p0 = Math.max(s0, st.from), p1 = Math.min(s1, st.to);
        if (p1 - p0 > 0.001) quad(p0, p1, w0, LINE, st.shut ? null : st);
      }
    }
    if (L > Math.max(w0, LINE)) quad(s0, s1, Math.max(w0, LINE), L, whole);
    quad(s0, s1, Math.max(L, w0), yTop, null);
  }
  // the plinth: grey from under the ground to the ground floor's foot
  if (from < FOOT) paint(B, F, 0, F.len, Math.min(foot - 1.0, FOOT - 0.4), Math.max(FOOT, foot), C.plinth);
  return { F, s, top, foot };
}

// The walls of a ring, its own ones (`opts(a, b)` null for those that are another's); `ridge` [k, at]: its roof's ridge
// along the hotel's frame's t (k 0) or c (k 1) = at
function buildRing(B, ring, topOf, opts = () => ({}), ridge = null) {
  const R = outwardRing(ring), out = [];
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], o = opts(a, b);
    if (o === null) continue;
    out.push(buildWall(B, a, b, topOf, { ridge, ...o }));
  }
  return out;
}

// --- The roofs ---------------------------------------------------------------------------------------------------------
/**
 * A roof plane over its outline ([[t, c], …] of the hotel's frame) at y(t, c): its top, its underside in dark timber;
 * along the edges marked in `fascia` a timber board
 */
function roofPlane(B, poly, yOf, fascia = null) {
  const ring = roofRing(poly);
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  const Y = (x, z) => yOf(...toLocal(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = [ring[i], ring[j], ring[k]].map((q) => [q[0], Y(q[0], q[1]), q[1]]);
    up(B, 'roof', p, (q) => [q[0], q[2]]);
    const d = p.map((q) => [q[0], q[1] - 0.06, q[2]]);
    const ny = (d[1][2] - d[0][2]) * (d[2][0] - d[0][0]) - (d[1][0] - d[0][0]) * (d[2][2] - d[0][2]);
    const [a, b, c] = ny > 0 ? [d[0], d[2], d[1]] : d;
    B.tri('trim', a, b, c, undefined, { colour: C.soffit });
  }
  if (fascia) for (let i = 0; i < ring.length; i++) if (fascia[i]) board(B, ring[i], ring[(i + 1) % ring.length], Y);
}

// A fascia board along a roof's edge p → q (world [x, z]), its top at the roof's height there, both its faces
function board(B, p, q, Y) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (len < 0.05) return;
  const pieces = Math.max(1, Math.round(len / 1.0));
  const at = (f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  for (let k = 0; k < pieces; k++) {
    const [x0, z0] = at(k / pieces), [x1, z1] = at((k + 1) / pieces);
    const y0 = Y(x0, z0), y1 = Y(x1, z1);
    const A = [x0, y0 + 0.03, z0], Bq = [x1, y1 + 0.03, z1], Cq = [x1, y1 - 0.28, z1], D = [x0, y0 - 0.28, z0];
    B.quad('trim', D, Cq, Bq, A, undefined, { colour: C.timber });
    B.quad('trim', Cq, D, A, Bq, undefined, { colour: C.timber });
  }
}

// The block's saddle roof (its two planes), the annex's, the tower's hipped roof
function buildRoofs(B) {
  const Bk = PARSENN_GADA.block, An = PARSENN_GADA.annex;
  for (const half of splitAtT(Bk.roof, Bk.ridge.t)) if (half) roofPlane(B, half, (t) => blockRoofY(t));
  // (the fascia along the whole outline's open edges)
  const ring = roofRing(Bk.roof), Yb = (x, z) => blockRoofY(toLocal(x, z)[0]);
  for (let i = 0; i < ring.length; i++) if (Bk.fascia[i]) board(B, ring[i], ring[(i + 1) % ring.length], Yb);
  // the annex: its two planes split along the ridge (c), the fascia round its open edges
  const swap = (poly) => poly.map(([t, c]) => [c, t]);
  for (const half of splitAtT(swap(An.roof), An.ridge.c)) if (half) roofPlane(B, swap(half), (t, c) => annexRoofY(c));
  const ra = roofRing(An.roof), Ya = (x, z) => annexRoofY(toLocal(x, z)[1]);
  for (let i = 0; i < ra.length; i++) if (An.fascia[i]) board(B, ra[i], ra[(i + 1) % ra.length], Ya);
  // the tower: the long faces up to the ridge, the hips to its ends
  const T = PARSENN_GADA.tower, E = T.eaves.ring.map(([x, z]) => [x, T.eaves.y, z]);
  const ra2 = [T.ridge.a[0], T.ridge.y, T.ridge.a[1]], rb = [T.ridge.b[0], T.ridge.y, T.ridge.b[1]];
  const uvOf = (q) => [q[0], q[2]];
  const faces = [[E[0], E[1], ra2], [E[1], E[2], rb, ra2], [E[2], E[3], rb], [E[3], E[0], ra2, rb]];
  for (const f of faces) {
    up(B, 'roof', f, uvOf);
    const d = f.map((q) => [q[0], q[1] - 0.06, q[2]]);
    const ny = (d[1][2] - d[0][2]) * (d[2][0] - d[0][0]) - (d[1][0] - d[0][0]) * (d[2][2] - d[0][2]);
    const D = ny > 0 ? [...d].reverse() : d;
    if (D.length === 3) B.tri('trim', D[0], D[1], D[2], undefined, { colour: C.soffit });
    else B.quad('trim', D[0], D[1], D[2], D[3], undefined, { colour: C.soffit });
  }
  for (let i = 0; i < 4; i++) board(B, T.eaves.ring[i], T.eaves.ring[(i + 1) % 4], towerRoofY);
}

// --- The walls of the three parts, the doors, the balcony ------------------------------------------------------------
function buildBlock(B) {
  const Bk = PARSENN_GADA.block, D = blockDoor(), d = Bk.door;
  const walls = buildRing(B, Bk.ring, blockTop, (a, b) => {
    if (isListed(Bk.inner, a, b)) return null;
    if (isListed(Bk.closed, a, b)) return { closed: true };
    if (isListed(Bk.overAnnex, a, b)) return { from: annexTop(...a), closed: true };
    // (the gable towards the Seeli: the door's stretch kept clear)
    const F = wallFrame(a, b);
    if (Math.hypot(F.a[0] - D.F.a[0], F.a[1] - D.F.a[1]) < 0.06 && Math.abs(F.len - D.F.len) < 0.06) return { clear: [[D.s - d.w / 2 - 0.7, D.s + d.w / 2 + 0.7]] };
    return {};
  }, [0, Bk.ridge.t]);
  // the door, a step before it, a small timber canopy on two brackets
  const F = D.F, y0 = groundHeight(...onWall(F, D.s, 0.6)) + 0.02;
  B.decal(F, D.s - d.w / 2, D.s + d.w / 2, 0.03, y0, y0 + d.h, 'door');
  B.box('trim', F, D.s - d.w / 2 - 0.3, D.s + d.w / 2 + 0.3, 0, 0.45, y0 - 0.5, y0, C.step);
  B.box('trim', F, D.s - d.w / 2 - 0.45, D.s + d.w / 2 + 0.45, 0, 0.95, y0 + d.h + 0.25, y0 + d.h + 0.38, C.timber, { top: 'roof' });
  for (const e of [-1, 1]) B.box('trim', F, D.s + e * (d.w / 2 + 0.3) - 0.04, D.s + e * (d.w / 2 + 0.3) + 0.04, 0, 0.8, y0 + d.h - 0.1, y0 + d.h + 0.25, C.timber);
  // two small windows in the gable under the ridge
  const [tA] = toLocal(...F.a), [tB] = toLocal(...onWall(F, F.len));
  const ridgeS = ((PARSENN_GADA.block.ridge.t - tA) / (tB - tA)) * F.len;
  const wy0 = LINE + 3 * STOREY + 0.8, wy1 = wy0 + 1.15, hw = 0.34;
  for (const c of [ridgeS - 0.75, ridgeS + 0.75]) {
    paint(B, F, c - hw - SURROUND, c + hw + SURROUND, wy0 - SURROUND - 0.05, wy1 + SURROUND, C.surround);
    paint(B, F, c - hw, c + hw, wy0, wy1, C.frame, 0.02);
    paint(B, F, c - hw + 0.06, c + hw - 0.06, wy0 + 0.06, wy1 - 0.06, C.pane, 0.028);
    paint(B, F, c - 0.025, c + 0.025, wy0 + 0.06, wy1 - 0.06, C.frame, 0.032);
  }
  return walls;
}

function buildTower(B) {
  const T = PARSENN_GADA.tower;
  buildRing(B, T.ring, () => T.top);
  // the balcony towards the yard: a timber slab, a closed balustrade of boards, a handrail
  const Bc = T.balcony, F = wallFrame(Bc.a, Bc.b), m = F.len / 2, s0 = m - Bc.w / 2, s1 = m + Bc.w / 2, y = Bc.y;
  B.box('trim', F, s0, s1, 0, Bc.out, y - 0.22, y, C.timber);
  B.box('trim', F, s0, s1, Bc.out - 0.06, Bc.out, y, y + Bc.rail - 0.08, C.timber);
  for (const s of [s0, s1 - 0.06]) B.box('trim', F, s, s + 0.06, 0, Bc.out, y, y + Bc.rail - 0.08, C.timber);
  B.box('trim', F, s0 - 0.04, s1 + 0.04, 0, Bc.out + 0.04, y + Bc.rail - 0.08, y + Bc.rail, C.timber);
  // (two brackets under the slab)
  for (const s of [s0 + 0.3, s1 - 0.3]) B.box('trim', F, s - 0.05, s + 0.05, 0, Bc.out - 0.1, y - 0.75, y - 0.22, C.timber);
}

function buildAnnex(B) {
  const An = PARSENN_GADA.annex, d = An.door;
  buildRing(B, An.ring, annexTop, (a, b) => {
    if (isListed(An.inner, a, b)) return null;
    // (the face towards the Seeli: the arched door, its ground floor closed)
    if (isListed([[d.a, d.b]], a, b)) return { ground: false };
    return {};
  }, [1, An.ridge.c]);
  const F = wallFrame(d.a, d.b), m = F.len / 2, y0 = groundHeight(...onWall(F, m, 0.6)) + 0.02;
  B.decal(F, m - d.w / 2, m + d.w / 2, 0.03, y0, y0 + d.w * (ATLAS.arch[3] / ATLAS.arch[2]), 'arch');
  B.box('trim', F, m - d.w / 2 - 0.25, m + d.w / 2 + 0.25, 0, 0.4, y0 - 0.5, y0, C.step);
}

/**
 * Builds the house into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand on the
 * surveyed outlines, js/landmarks.js; the steps and the canopy at the doors are within a metre of them).
 */
export function buildParsennGada(scene) {
  const root = new THREE.Group();
  root.name = 'Parsenn Gada';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Parsenn Gada' }), M = materials();
  buildBlock(B);
  buildTower(B);
  buildAnnex(B);
  buildRoofs(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
