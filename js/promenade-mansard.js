import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  PROMENADE_MANSARD, arcadeFrames, arcadeGround, arches, coveredTo, edgeFrame, groundOutlines, mansardRings, onWall, outwardIndex, outwardRing,
  part, wallFrame, windowLayout
} from './promenade-mansard-data.js';

export { PROMENADE_MANSARD };

// The house with the mansard and the red arcade on the Promenade by the Bristol, rebuilt by hand
// (js/promenade-mansard-data.js), standing in for its swissBUILDINGS3D volume, which the streamed tiles drew as one
// white block with the town houses' windows. Light grey plaster with a window in a dark frame in every bay of the three
// floors over the ground floor (drawn by the wall's material from its uv: metres along the wall from its middle, metres
// up the floors' grid), the ground floor's round arches in a deep red band on the Promenade, the low wing's open arcade
// with the shops' fronts under it, the deep white cornice, the slate mansard with its round-headed dormers and the
// risalit rising through it under a slate hood, the higher block and the wings behind; the shops' boards and the
// parking sign. Five meshes: the walls, the roofs, the glass, the trim (one vertex-coloured mesh) and the decals (one
// canvas atlas).

const P = PROMENADE_MANSARD;
excludeBuildings([P.exclude]);
// (the player's walls on the surveyed volumes, the low wing's on the shops' fronts under its arcade: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(P.osm, groundOutlines());
// (the boards of the two shops are drawn here, js/shops.js)
for (const id of P.shops) SHOP_EXCLUSIONS.add(id);

const BAY = P.bay, STOREY = P.storey, WIN = P.win;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.55, 0.56, 0.56], FRAME = [0.07, 0.075, 0.08], SLATE = [0.06, 0.065, 0.075];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(SLATE, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.47, 0.48, 0.48], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35);
    M.glass = SIMPLE_SKINS.glow([0.06, 0.075, 0.085], 0.1, 0.8, [1.0, 0.84, 0.62], 0.25);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  // Light grey plaster with a window per bay and floor: a lighter surround, a dark frame, a post in its middle and a
  // transom over its lower two thirds, a grey sill; a blind drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const surround = rect(WIN.half + 0.13, WIN.lo - 0.1, WIN.hi + 0.13).mul(open).mul(near);
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu)).max(smoothstep(0.035, 0.02, abs(fv.sub(WIN.hi - 0.5))));
    const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.1, WIN.lo - 0.1, WIN.lo).mul(open).mul(near);
    const stain = rect(WIN.half, WIN.lo - 0.8, WIN.lo - 0.1, 0.25).mul(open).mul(0.05);
    const wall = mix(vec3(0.5, 0.51, 0.51), vec3(...PLASTER).mul(1.05), worldNoise(0.3)).mul(float(1).sub(stain))
      .mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.62, id).mul(mix(float(0.35), float(1), step(0.88, id)));
    const blind = step(float(WIN.hi - 0.07).sub(drawn.mul(WIN.hi - WIN.lo - 0.14)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(0.62, 0.62, 0.6), surround);
    c = mix(c, vec3(0.4, 0.4, 0.39), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.38, 0.38, 0.36), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (flats: lit here and there in the evening, few towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 53, { share: 0.42, late: 0.1, tone: twoTones([1.0, 0.74, 0.46], [0.9, 0.9, 1.0], 0.8) })
      .mul(pane).mul(mix(float(1), float(0.4), blind)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The shops' windows: dark mullions every 1.3 m, a transom at the doors' head; shut at night, a faint glow behind
  // most panes, a few lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.3)).sub(0.5));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.05, 0.03, abs(V.sub(6.9)))).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.3)).mul(13.1).add(floor(V.div(6.9)).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.05, 0.065, 0.075), vec3(0.12, 0.14, 0.15), paneId), vec3(...FRAME), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.3), frame);
    const lit = mix(float(0.1), float(0.75), step(0.84, paneId));
    m.emissiveNode = vec3(1.0, 0.85, 0.62).mul(float(1).sub(frame)).mul(lit).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The boards and the dormers' windows: one canvas atlas ---------------------------------------------------------
const ATLAS_SIZE = [1024, 256];
export const ATLAS = {
  freestyle: [0, 0, 480, 100], // Free-Style's board on the bump (2.6 × 0.5 m)
  finnis: [0, 104, 480, 100], // finnis.ch's over the arcade's southern arch (2.1 × 0.45 m)
  parking: [488, 0, 168, 206], // the parking sign (0.85 × 1.05 m)
  dormer: [664, 0, 136, 206] // a dormer's round-headed window
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('freestyle', (w, h) => {
    g.fillStyle = '#f1f0ec'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9a9a96'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#2b2b2e'; g.font = `italic bold ${Math.round(h * 0.62)}px Georgia, 'Times New Roman', serif`;
    g.fillText('Free-Style', w / 2, h * 0.54, w - 30);
  });
  cell('finnis', (w, h) => {
    g.fillStyle = '#33393f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(h * 0.58)}px Helvetica, Arial, sans-serif`;
    g.fillText('finnis.ch', w / 2, h * 0.54, w - 30);
  });
  // the blue parking sign: a white P, the arrow and the distance under it
  cell('parking', (w, h) => {
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f4fa8'; g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(h * 0.5)}px Helvetica, Arial, sans-serif`;
    g.fillText('P', w / 2, h * 0.36);
    g.font = `bold ${Math.round(h * 0.15)}px Helvetica, Arial, sans-serif`;
    g.fillText('→ 20 m', w / 2, h * 0.8, w - 24);
  });
  // a dormer's window: a white frame round the round-headed opening, its sashes; clear outside the frame
  cell('dormer', (w, h) => {
    const r = w / 2, spring = r;
    const arch = (inset) => { g.beginPath(); g.moveTo(inset, h); g.lineTo(inset, spring); g.arc(r, spring, r - inset, Math.PI, 0); g.lineTo(w - inset, h); g.closePath(); };
    g.fillStyle = '#e4e3de'; arch(0); g.fill();
    g.fillStyle = '#1a2026'; arch(16); g.fill();
    g.fillStyle = '#d8d7d2';
    g.fillRect(r - 4, spring - r + 16, 8, h - spring + r - 16);
    g.fillRect(16, spring + 6, w - 32, 7);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  white: [0.6, 0.6, 0.58], cornice: [0.62, 0.62, 0.6], red: [0.36, 0.035, 0.05], redDeep: [0.26, 0.022, 0.035], slate: SLATE,
  frame: FRAME, plaster: PLASTER
};
const { spring: SPRING, top: BAND_TOP } = P.band;

/** A wall's point in the world: s along it, o out of it, y up */
const at = (F, s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };

/** A quad facing `want` ([x, y, z]): its corners turned round if they face away */
function faceQuad(B, bucket, a, b, c, d, want, opt = {}) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const uvs = opt.uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) B.quad(bucket, a, b, c, d, uvs, opt);
  else B.quad(bucket, a, d, c, b, [uvs[0], uvs[3], uvs[2], uvs[1]], opt);
}
/** A triangle facing `want` */
function faceTri(B, bucket, a, b, c, want, opt = {}) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const uvs = (p) => [p[0], p[2]];
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) B.tri(bucket, a, b, c, [a, b, c].map(uvs), opt);
  else B.tri(bucket, a, c, b, [a, c, b].map(uvs), opt);
}
const UPWARD = [0, 1, 0];
const out3 = (F, k = 1) => [F.n[0] * k, 0, F.n[1] * k];
const along3 = (F, k = 1) => [F.u[0] * k, 0, F.u[1] * k];
/** A roof's quad, facing up (uv metres over the plan) */
const roofQuad = (B, a, b, c, d) => faceQuad(B, 'roof', a, b, c, d, UPWARD, { uvs: [a, b, c, d].map((p) => [p[0], p[2]]) });

/**
 * A plastered wall s0–s1 of the frame from y0 to y1: with windows on the floors' grid (from `line`) laid out from its
 * middle (one window in it, or a pair either side of it, js/promenade-mansard-data.js windowLayout), or closed
 */
function plaster(B, F, s0, s1, y0, y1, line, windows) {
  if (y1 - y0 < 0.02 || s1 - s0 < 0.02) return;
  const len = s1 - s0, mid = (s0 + s1) / 2, L = windowLayout(len);
  const open = windows && L.count > 0;
  const v = (y) => y - line + UP - (open ? 0 : CLOSED);
  if (open && L.even) {
    // (two halves, u running out from the middle: the windows' grid's bays fall either side of it)
    const half = len / 2 + BAY / 2;
    B.quad('plaster', at(F, s0, 0, y0), at(F, mid, 0, y0), at(F, mid, 0, y1), at(F, s0, 0, y1),
      [[half, v(y0)], [BAY / 2, v(y0)], [BAY / 2, v(y1)], [half, v(y1)]], { half });
    B.quad('plaster', at(F, mid, 0, y0), at(F, s1, 0, y0), at(F, s1, 0, y1), at(F, mid, 0, y1),
      [[BAY / 2, v(y0)], [half, v(y0)], [half, v(y1)], [BAY / 2, v(y1)]], { half });
    return;
  }
  B.quad('plaster', at(F, s0, 0, y0), at(F, s1, 0, y0), at(F, s1, 0, y1), at(F, s0, 0, y1),
    [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half: open ? len / 2 : 0 });
}

/** A pane of the shops' glass on a wall, `o` m out of it (uv: metres along, metres up) */
function glass(B, F, s0, s1, o, y0, y1) {
  B.quad('glass', at(F, s0, o, y0), at(F, s1, o, y0), at(F, s1, o, y1), at(F, s0, o, y1), [[s0, y0], [s1, y0], [s1, y1], [s0, y1]]);
}

/** Is a → b the wall p – q (either way round)? */
const close = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
const sameEdge = (a, b, p, q) => (close(a, p) && close(b, q)) || (close(a, q) && close(b, p));

/** Is the ring's corner i (between its walls i − 1 and i) convex? (outwardRing's turn) */
function convex(R, i) {
  const n = R.length, p = R[(i - 1 + n) % n], q = R[i], r = R[(i + 1) % n];
  return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) < 0;
}

/**
 * A row of round arches in the red band on a wall: `pillars` and `openings` ([s0, s1] m along it), the band `T` m
 * thick from the arches' springing up to `top`, the glass `D` m back (the shops' fronts), the arcade's ceiling at
 * `ceiling` when it is deeper than the band. Pillars are white plaster from the base; the arches' soffits red.
 */
function arcadeRow(B, F, { pillars, openings, T, D, top, ceiling, back = D > T, shops = true, posts = true }) {
  const base = P.base, K = 10, out = out3(F), inn = out3(F, -1);
  for (const [s0, s1] of pillars) {
    if (posts) B.box('trim', F, s0, s1, -T, 0, base, SPRING, C.white);
    faceQuad(B, 'trim', at(F, s0, 0, SPRING), at(F, s1, 0, SPRING), at(F, s1, 0, top), at(F, s0, 0, top), out, { colour: C.red });
    if (back) faceQuad(B, 'trim', at(F, s0, -T, SPRING), at(F, s1, -T, SPRING), at(F, s1, -T, ceiling), at(F, s0, -T, ceiling), inn, { colour: C.red });
  }
  for (const [s0, s1] of openings) {
    const c = (s0 + s1) / 2, r = (s1 - s0) / 2;
    const arc = (k) => { const t = Math.PI - (Math.PI * k) / K; return [c + r * Math.cos(t), SPRING + r * Math.sin(t)]; };
    for (let k = 0; k < K; k++) {
      const [sa, ya] = arc(k), [sb, yb] = arc(k + 1);
      faceQuad(B, 'trim', at(F, sa, 0, ya), at(F, sb, 0, yb), at(F, sb, 0, top), at(F, sa, 0, top), out, { colour: C.red });
      if (back) faceQuad(B, 'trim', at(F, sa, -T, ya), at(F, sb, -T, yb), at(F, sb, -T, ceiling), at(F, sa, -T, ceiling), inn, { colour: C.red });
      // (the soffit, facing the arch's middle)
      const tm = Math.PI - (Math.PI * (k + 0.5)) / K;
      const want = [-Math.cos(tm) * F.u[0], -Math.sin(tm), -Math.cos(tm) * F.u[1]];
      faceQuad(B, 'trim', at(F, sa, 0, ya), at(F, sb, 0, yb), at(F, sb, -T, yb), at(F, sa, -T, ya), want, { colour: C.redDeep });
    }
    if (shops && D <= T) glass(B, F, s0 - 0.01, s1 + 0.01, -D, P.base, SPRING + r + 0.02);
  }
  if (D > T) {
    // (the arcade's ceiling, and the shops' fronts along the whole of it)
    const s0 = Math.min(...pillars.map((p) => p[0]), ...openings.map((p) => p[0])), s1 = Math.max(...pillars.map((p) => p[1]), ...openings.map((p) => p[1]));
    if (shops) glass(B, F, s0, s1, -D, P.base, ceiling);
    faceQuad(B, 'trim', at(F, s0, -T, ceiling), at(F, s1, -T, ceiling), at(F, s1, -D, ceiling), at(F, s0, -D, ceiling), [0, -1, 0], { colour: C.white });
  }
}

// The low wing: its walls on the shops' fronts at the ground, the open arcade along the Promenade, the red band and the
// coping round its roof, the shops' windows on the bump and towards the north where the ground lies low
function buildArcadeWing(B) {
  const p = part('arcade'), A = P.arcade, { east: E, north: N } = arcadeFrames();
  const G = outwardRing(arcadeGround());
  const inner = arcadeGround().filter((q) => !p.ring.some((r) => Math.hypot(r[0] - q[0], r[1] - q[1]) < 0.06));
  const isInner = (q) => inner.some((r) => Math.hypot(r[0] - q[0], r[1] - q[1]) < 0.06);
  // the walls at the ground (closed plaster; the shops' fronts under the arcade are its glass)
  for (let i = 0; i < G.length; i++) {
    const a = G[i], b = G[(i + 1) % G.length], F = wallFrame(a, b);
    if (F.len < 0.05 || (isInner(a) && isInner(b))) continue;
    const cover = coveredTo(p, F);
    if (cover >= p.top) continue;
    plaster(B, F, 0, F.len, Math.max(P.base, cover), p.top, 0, false);
  }
  // the band and the coping round the survey's outline (the arcade's front and its north end's arch are its own)
  const R = outwardRing(p.ring), Dn = A.depth;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], F = wallFrame(a, b);
    if (F.len < 0.05 || coveredTo(p, F) >= p.top) continue;
    const e0 = convex(R, i) ? 0.14 : 0, e1 = convex(R, (i + 1) % R.length) ? 0.14 : 0;
    B.box('trim', F, -e0, F.len + e1, -0.1, 0.14, BAND_TOP, p.top + 0.03, C.cornice);
    if (sameEdge(a, b, A.a, A.b)) continue;
    const isNorth = sameEdge(a, b, N.a, onWall(N, N.len));
    B.box('trim', F, isNorth ? Dn : 0, F.len, 0, 0.05, SPRING, BAND_TOP, C.red);
  }
  // the arcade along the Promenade and the arch at its north end
  const row = arches(E.len, A.n, A.pillar);
  const ceiling = SPRING + row.open / 2 + 0.05;
  arcadeRow(B, E, { pillars: row.pillars, openings: row.openings, T: A.band, D: A.depth, top: BAND_TOP, ceiling });
  // (the north end's: open, its band as thick as the corner pillar is wide, closed behind up to the ceiling)
  arcadeRow(B, N, { pillars: [[0, A.band]], openings: [[A.band, Dn]], T: A.pillar, D: A.pillar, top: BAND_TOP, ceiling, back: true, shops: false, posts: false });
  // finnis.ch's board over the southern arch
  const fb = P.boards.finnis, [o0, o1] = row.openings[fb.bay], fm = (o0 + o1) / 2;
  B.decal(E, fm - fb.w / 2, fm + fb.w / 2, 0.02, fb.y0, fb.y1, 'finnis');
  // the bump: shop windows under the band, Free-Style's board, the parking sign on its north face
  const bumpN = edgeFrame(p.ring, P.bump.north.a, P.bump.north.b), bumpE = edgeFrame(p.ring, P.bump.east.a, P.bump.east.b);
  for (const F of [bumpN, bumpE]) {
    const y0 = P.street + 0.15, y1 = SPRING - 0.1;
    glass(B, F, 0.35, F.len - 0.35, 0.02, y0, y1);
    B.box('trim', F, 0.25, F.len - 0.25, 0, 0.05, y1, y1 + 0.1, C.frame);
    for (const s of [0.3, F.len - 0.3]) B.box('trim', F, s - 0.05, s + 0.05, 0, 0.05, y0, y1, C.frame);
  }
  const pk = P.boards.parking, fs = P.boards.freestyle;
  B.decal(bumpN, pk.s - pk.w / 2, pk.s + pk.w / 2, 0.05, pk.y0, pk.y1, 'parking');
  B.decal(bumpE, fs.s - fs.w / 2, fs.s + fs.w / 2, 0.07, fs.y0, fs.y1, 'freestyle');
  // shop windows in the north wall where the ground lies low enough (towards the Promenade)
  const nb = 2.7;
  for (let s = Dn + 0.5; s + nb <= N.len - 0.4; s += nb) {
    const g = groundHeight(...onWall(N, s + nb / 2, 0.6));
    if (g > SPRING - 2.4) continue;
    const y0 = g + 0.4, y1 = SPRING - 0.15;
    glass(B, N, s + 0.3, s + nb - 0.3, 0.02, y0, y1);
    B.box('trim', N, s + 0.22, s + nb - 0.22, 0, 0.06, y1, y1 + 0.08, C.frame);
    B.box('trim', N, s + 0.22, s + nb - 0.22, 0, 0.12, y0 - 0.1, y0, C.frame);
  }
  flatRoof(B, p.ring, p.top);
  return row;
}

// A tall part: its walls (the ground floor closed, or the blind arches on the Promenade; the floors' windows; closed
// over the last floor with windows), the red band and the string course over the ground floor, the cornice at the
// eaves, the coping round a flat roof; the block's mansard
function buildTallPart(B, p) {
  const R = outwardRing(p.ring), M = p.mansard ? mansardRings() : null;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const cover = coveredTo(p, F);
    if (cover >= p.top - 0.05) continue;
    const top = M && M.slope.has(i) ? P.eave : p.top;
    const y0 = Math.max(P.base, cover);
    // (over a lower part's roof the windows begin on the first floor whose sill clears it)
    const from = cover > P.floor1 + 0.05 ? P.floor1 + STOREY * Math.ceil((cover + 0.3 - WIN.lo - P.floor1) / STOREY) : P.floor1;
    const blind = P.blind.find((q) => q.part === p.id && sameEdge(a, b, q.a, q.b));
    if (y0 < P.floor1) {
      if (blind) {
        const row = arches(F.len, blind.n, P.arcade.pillar);
        arcadeRow(B, F, { ...row, T: P.blindDepth, D: P.blindDepth, top: P.floor1, ceiling: 0 });
      } else {
        plaster(B, F, 0, F.len, y0, P.floor1, p.line, false);
        B.box('trim', F, 0, F.len, 0, 0.04, SPRING, P.floor1, C.red);
      }
      B.box('trim', F, 0, F.len, -0.02, 0.1, P.floor1, P.floor1 + 0.22, C.cornice);
    }
    const w0 = Math.max(y0, P.floor1), w1 = Math.min(top, p.windowsTo);
    if (from > w0) plaster(B, F, 0, F.len, w0, Math.min(from, top), p.line, false);
    plaster(B, F, 0, F.len, Math.max(w0, from), w1, p.line, true);
    plaster(B, F, 0, F.len, Math.max(w0, w1, Math.min(from, top)), top, p.line, false);
    // the cornice at the eaves (deep under the mansard), out over the convex corners
    const e0 = convex(R, i) ? 0.5 : 0, e1 = convex(R, (i + 1) % R.length) ? 0.5 : 0;
    if (cover < P.eave && top >= P.eave - 0.01) {
      B.box('trim', F, -e0, F.len + e1, 0, 0.5, P.eave - 0.32, P.eave + 0.06, C.cornice);
      B.box('trim', F, -e0 * 0.5, F.len + e1 * 0.5, 0, 0.25, P.eave - 0.55, P.eave - 0.32, C.cornice);
    }
    if (!M && p.id !== 'risalit') B.box('trim', F, -e0 * 0.3, F.len + e1 * 0.3, -0.05, 0.15, p.top - 0.3, p.top + 0.05, C.cornice);
  }
  if (M) buildMansard(B, p, M);
  else if (p.id !== 'risalit') flatRoof(B, p.ring, p.top);
}

// The block's mansard: the steep slate slopes from the eaves up to the break, the upper slopes up to its flat top, on
// the walls to the street and the north; the round-headed dormers on the steep slopes, small ones on the upper
function buildMansard(B, p, M) {
  const { R, I1, I2, slope } = M, n = R.length, { eave } = P, { brk } = p.mansard, top = p.top;
  for (const i of slope) {
    const j = (i + 1) % n;
    roofQuad(B, [R[i][0], eave, R[i][1]], [R[j][0], eave, R[j][1]], [I1[j][0], brk, I1[j][1]], [I1[i][0], brk, I1[i][1]]);
    roofQuad(B, [I1[i][0], brk, I1[i][1]], [I1[j][0], brk, I1[j][1]], [I2[j][0], top, I2[j][1]], [I2[i][0], top, I2[i][1]]);
  }
  flatRoof(B, I2, top);
  const D = P.dormers, frame = (k) => { const i = outwardIndex(p.ring, k); return wallFrame(R[i], R[(i + 1) % n]); };
  for (const [k, s] of D.lower) dormer(B, frame(k), s, D.half, D.back, D.front, D.from, D.to, true);
  // (the upper slope's: their fronts on it, a step in from the break)
  const back2 = -(p.mansard.d1 + 1.6), front2 = -(p.mansard.d1 + 0.12);
  for (const [k, s] of D.upper) dormer(B, frame(k), s, D.upperHalf, back2, front2, D.upperFrom, D.upperTo, false);
}

/** A dormer: its white body o0–o1 out of the wall's line, the round-headed window in its front, a curved slate hood */
function dormer(B, F, s, half, o0, o1, y0, y1, big) {
  B.box('trim', F, s - half, s + half, o0, o1, y0, y1, big ? C.white : C.cornice);
  const rise = half * 0.75, K = 8, h = half + 0.08;
  const pt = (k) => { const t = (Math.PI * k) / K; return [s + h * Math.cos(t), y1 + rise * Math.sin(t)]; };
  for (let k = 0; k < K; k++) {
    const [sa, ya] = pt(k), [sb, yb] = pt(k + 1);
    roofQuad(B, at(F, sa, o1 + 0.1, ya), at(F, sb, o1 + 0.1, yb), at(F, sb, o0, yb), at(F, sa, o0, ya));
    // (the tympanum over the window, white)
    const ra = [s + half * Math.cos((Math.PI * k) / K), y1 + (rise - 0.06) * Math.sin((Math.PI * k) / K)];
    const rb = [s + half * Math.cos((Math.PI * (k + 1)) / K), y1 + (rise - 0.06) * Math.sin((Math.PI * (k + 1)) / K)];
    faceTri(B, 'trim', at(F, s, o1, y1), at(F, ra[0], o1, ra[1]), at(F, rb[0], o1, rb[1]), out3(F), { colour: big ? C.white : C.cornice });
  }
  B.decal(F, s - half + 0.1, s + half - 0.1, o1 + 0.01, y0 + 0.12, y1 + rise * 0.8, 'dormer');
}

// The risalit's hood: a slate slope from its front over the eaves back into the mansard's break, its cheeks, the wedge
// of its side walls between the block's wall and the steep slope
function buildRisalitHood(B) {
  const r = part('risalit'), block = part('block'), m = block.mansard;
  const front = edgeFrame(r.ring, [495.8, -908.5], [500.7, -907.1]);
  const e0 = edgeFrame(block.ring, block.ring[0], block.ring[1]);
  const proud = (front.a[0] - e0.a[0]) * e0.n[0] + (front.a[1] - e0.a[1]) * e0.n[1];
  const y = r.top, back = -(proud + m.d1), slopeAt = -(proud + (m.d1 * (y - P.eave)) / (m.brk - P.eave));
  roofQuad(B, at(front, -0.15, 0.15, y), at(front, front.len + 0.15, 0.15, y), at(front, front.len + 0.15, back, m.brk), at(front, -0.15, back, m.brk));
  for (const [s, k] of [[-0.15, -1], [front.len + 0.15, 1]]) {
    faceTri(B, 'trim', at(front, s, 0.15, y), at(front, s, back, m.brk), at(front, s, slopeAt, y), along3(front, k), { colour: C.slate });
    const w = s < 0 ? 0 : front.len;
    faceTri(B, 'trim', at(front, w, -proud, P.eave), at(front, w, -proud, y), at(front, w, slopeAt, y), along3(front, k), { colour: C.plaster });
  }
  B.box('trim', front, -0.15, front.len + 0.15, 0, 0.18, y - 0.25, y + 0.02, C.cornice);
}

/**
 * Builds the house into `scene`. Returns { group, colliders }: the arcade's pillars on the Promenade (they stand out of
 * the low wing's outline at the ground, whose wall is on the shops' fronts), at world heights (baseY set, so
 * liftColliders leaves them be).
 */
export function buildPromenadeMansard(scene) {
  const root = new THREE.Group();
  root.name = 'Promenade mansard house';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Promenade mansard house' }), M = materials();
  const row = buildArcadeWing(B);
  for (const p of P.parts) if (p.id !== 'arcade') buildTallPart(B, p);
  buildRisalitHood(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  const colliders = [];
  const E = arcadeFrames().east, T = P.arcade.band, top = part('arcade').top;
  for (const [s0, s1] of row.pillars) {
    const [cx, cz] = onWall(E, (s0 + s1) / 2, -T / 2), hx = (s1 - s0) / 2, hz = T / 2;
    const cs = E.u[0], sn = -E.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: P.base, minY: P.base, maxY: top, obb: { cx, cz, hx, hz, cs, sn } });
  }
  return { group: root, colliders };
}
