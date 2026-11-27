import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { SCHWEIZERHOF, arcadePieces, bays, onWall, outwardRing, part, wallFrame } from './schweizerhof-data.js';

export { SCHWEIZERHOF };

// The Hotel Schweizerhof Morosani and the house south of it rebuilt by hand (js/schweizerhof-data.js), standing in for
// their swissBUILDINGS3D volume, which the streamed tiles drew as one white block with the town houses' windows. The
// hotel in white plaster with a window in a brown timber frame in every bay of every floor (drawn by the wall's material
// from its uv: metres along the wall from its middle, metres up the floors' grid); along the Promenade the first floor
// stands out over the pavement on an arcade, the shops' glass and fascia under it, a terrace with a rail on it and the
// second floor set back; the glazed porch of the entrance with the name over its doors; timber balconies along the
// tall block's south face; the name in standing letters over the west block (to the street) and over the tall block
// (to the valley). The south house (the UBS's) in grey concrete posts with white bands and timber windows over a
// glazed ground floor, the hotel's board on its front. Six meshes: the two walls, the roofs, the glass, the trim (one
// vertex-coloured mesh) and the lettering (one canvas atlas). The hotel's fascia board and hanging sign (js/shops.js)
// give way to its own lettering; the shops' boards on its footprint stay (the arcade's front is their wall).

excludeBuildings([SCHWEIZERHOF.exclude]);
SHOP_EXCLUSIONS.add(SCHWEIZERHOF.osm);

const S = SCHWEIZERHOF;
// v of a wall: metres up its grid, a floor's top at every multiple of the storey (the part's `line` at 40 of them);
// closed walls carry v − CLOSED. A window in its storey (m up from the floor's foot) and its half width
const GRID = {
  hotel: { storey: S.storey.hotel, bay: 3.1, win: { lo: 0.85, hi: 2.35, half: 0.6 } },
  modern: { storey: S.storey.modern, bay: 3.0, win: { lo: 0.95, hi: 2.75, half: 1.12 } }
};
for (const g of Object.values(GRID)) { g.up = 40 * g.storey; g.closed = 300 * g.storey; }

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const WHITE = [0.6, 0.595, 0.565], BAND = [0.56, 0.56, 0.545], CONCRETE = [0.26, 0.265, 0.26], TIMBER = [0.3, 0.16, 0.07];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.28, 0.28, 0.27], 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    const w = (g, rgb) => SIMPLE_SKINS.windowed(rgb, g.storey, g.win.lo / g.storey, g.win.hi / g.storey, 0.9, 0.4);
    M.hotel = w(GRID.hotel, [0.52, 0.515, 0.49]);
    M.modern = w(GRID.modern, [0.4, 0.4, 0.39]);
    M.glass = SIMPLE_SKINS.glow([0.08, 0.1, 0.11], 0.1, 0.8, [1.0, 0.84, 0.62], 0.45);
    return M;
  }
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.09, 0.105), worldNoise(0.07));
  // The hotel: white plaster, a window per bay and floor in a brown timber frame with a post in its middle and a rail
  // across its upper third, a light sill under it; a curtain drawn in some
  {
    const G = GRID.hotel, W = G.win;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: G.bay, storey: G.storey, closed: G.closed, winHalf: W.half });
    const win = rect(W.half, W.lo, W.hi).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu)).max(smoothstep(0.035, 0.02, abs(fv.sub(W.hi - 0.5))));
    const pane = rect(W.half - 0.08, W.lo + 0.08, W.hi - 0.08).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(W.half + 0.08, W.lo - 0.09, W.lo).mul(open).mul(near);
    const stain = rect(W.half, W.lo - 0.7, W.lo - 0.09, 0.2).mul(open).mul(0.05);
    const wall = mix(vec3(...WHITE).mul(0.92), vec3(...WHITE).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.85, id)));
    const curtain = step(float(W.hi - 0.08).sub(drawn.mul(W.hi - W.lo - 0.16)), fv).mul(pane).mul(near);
    let c = mix(wall, vec3(0.5, 0.5, 0.48), sill);
    c = mix(c, vec3(...TIMBER).mul(0.6), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.5, 0.45, 0.36), curtain);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (a hotel: most rooms lit in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 31, { share: 0.55, late: 0.15, tone: twoTones([1.0, 0.74, 0.46], [1.0, 0.86, 0.66], 0.65) }).mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.1));
    M.hotel = m;
  }
  // The south house: grey concrete posts between the windows, white bands over and under them, the windows in brown
  // timber frames with a post in their middle
  {
    const G = GRID.modern, W = G.win;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
    const { half, bay, bu, storey, open, rect } = windowGrid({ bay: G.bay, storey: G.storey, closed: G.closed, winHalf: W.half });
    const post = smoothstep(W.half + 0.06, W.half + 0.09, abs(bu)).mul(open);
    const win = rect(W.half, W.lo, W.hi).mul(open);
    const bars = smoothstep(0.045, 0.03, abs(bu));
    const pane = rect(W.half - 0.09, W.lo + 0.09, W.hi - 0.09).mul(float(1).sub(bars.mul(near))).mul(open);
    const band = mix(vec3(...BAND).mul(0.94), vec3(...BAND).mul(1.04), worldNoise(0.4));
    const concrete = mix(vec3(...CONCRETE).mul(0.9), vec3(...CONCRETE).mul(1.08), worldNoise(0.8));
    let c = mix(band, concrete, post);
    c = mix(c, vec3(...TIMBER).mul(0.85), win);
    c = mix(c, mix(glassC, vec3(0.05, 0.08, 0.075), 0.5), pane);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.88), float(0.12), pane);
    m.metalnessNode = pane.mul(0.55);
    // (offices and flats: lit in the evening, dark towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 37, { share: 0.4, late: 0.08, tone: twoTones([1.0, 0.8, 0.55], [0.9, 0.93, 1.0], 0.7) }).mul(pane).mul(glow.mul(1.0));
    M.modern = m;
  }
  // The shops' windows and the porch's glazing: dark mullions every 1.4 m, a rail every 1.6 m, lit at night
  {
    const U = uv().x, V = uv().y;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.4)).sub(0.5)), mv = abs(fract(V.div(1.6)).sub(0.5));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.46, 0.48, mv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.4)).mul(13.1).add(floor(V.div(1.6)).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.05, 0.065, 0.075), vec3(0.12, 0.14, 0.15), paneId), vec3(0.06, 0.062, 0.066), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.3), frame);
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(float(1).sub(frame)).mul(paneId.mul(0.3).add(0.7)).mul(glow.mul(0.5));
    M.glass = m;
  }
  return M;
}

// --- The lettering, the board and the doors: one canvas atlas ----------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  name: [0, 0, 1024, 110], // the standing letters on the roofs (13 × 1.4 m, 15 × 1.6 m)
  porch: [0, 116, 1024, 165], // the porch's fascia over the doors (5.6 × 0.9 m)
  board: [0, 286, 640, 200], // the hotel's board on the south house (4 × 1.25 m)
  door: [648, 286, 150, 201] // the porch's doors (1.9 × 2.55 m)
};
const GOLD = '#d8b866', NAVY = '#16233b';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // the name in standing letters: gilt, a dark edge (on nothing: the sky shows between them)
  cell('name', (w, h) => {
    g.font = `bold ${Math.round(h * 0.8)}px Georgia, 'Times New Roman', serif`;
    g.lineWidth = 5; g.strokeStyle = '#3b2c12'; g.fillStyle = GOLD;
    g.strokeText('MOROSANI SCHWEIZERHOF', w / 2, h * 0.54, w - 12);
    g.fillText('MOROSANI SCHWEIZERHOF', w / 2, h * 0.54, w - 12);
  });
  // the porch's fascia: navy, a gilt rule, the name and the four stars under it
  cell('porch', (w, h) => {
    g.fillStyle = NAVY; g.fillRect(0, 0, w, h);
    g.strokeStyle = GOLD; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = GOLD;
    g.font = `bold ${Math.round(h * 0.46)}px Georgia, 'Times New Roman', serif`;
    g.fillText('MOROSANI SCHWEIZERHOF', w / 2, h * 0.42, w - 60);
    g.font = `${Math.round(h * 0.22)}px Georgia, 'Times New Roman', serif`;
    g.fillText('★ ★ ★ ★   DAVOS', w / 2, h * 0.78, w - 60);
  });
  // the board on the south house, as on the photograph: black, a small shield, the name, the stars, "P" and an arrow
  cell('board', (w, h) => {
    g.fillStyle = '#121212'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a7440'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = GOLD;
    g.beginPath(); g.moveTo(w / 2 - 22, 18); g.lineTo(w / 2 + 22, 18); g.lineTo(w / 2 + 22, 46); g.lineTo(w / 2, 62); g.lineTo(w / 2 - 22, 46); g.closePath(); g.fill();
    g.fillStyle = '#121212'; g.fillRect(w / 2 - 3, 24, 6, 28); g.fillRect(w / 2 - 14, 34, 28, 6);
    g.fillStyle = '#efe6cf';
    g.font = `bold ${Math.round(h * 0.2)}px Georgia, 'Times New Roman', serif`;
    g.fillText('MOROSANI SCHWEIZERHOF', w / 2, h * 0.47, w - 40);
    g.font = `${Math.round(h * 0.11)}px Georgia, 'Times New Roman', serif`;
    g.fillText('★ ★ ★ ★', w / 2, h * 0.64, w - 40);
    g.font = `bold ${Math.round(h * 0.16)}px Helvetica, Arial, sans-serif`;
    g.fillText('P', w * 0.66, h * 0.83);
    g.fillRect(w * 0.7, h * 0.82, w * 0.12, 4);
    g.beginPath(); g.moveTo(w * 0.84, h * 0.83); g.lineTo(w * 0.81, h * 0.78); g.lineTo(w * 0.81, h * 0.88); g.closePath(); g.fill();
  });
  // the porch's doors: two glazed leaves in bronze frames, long brass handles
  cell('door', (w, h) => {
    g.fillStyle = '#3a2e1e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#18242b';
    g.fillRect(8, 8, w / 2 - 11, h - 16); g.fillRect(w / 2 + 3, 8, w / 2 - 11, h - 16);
    g.fillStyle = '#c9a24a'; g.fillRect(w / 2 - 12, h * 0.36, 5, 56); g.fillRect(w / 2 + 7, h * 0.36, 5, 56);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  cornice: [0.52, 0.515, 0.49], concrete: CONCRETE, slab: [0.53, 0.53, 0.51], timber: TIMBER, dark: [0.05, 0.055, 0.06],
  navy: [0.012, 0.022, 0.05], steel: [0.08, 0.085, 0.095], rail: [0.13, 0.135, 0.14], stone: [0.3, 0.3, 0.29], soffit: [0.45, 0.45, 0.43]
};
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** A wall's corners in the world: s along it, y up */
const at = (F, s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };

/** A quad facing down (a ceiling) through four world points, whichever way round they come */
function ceiling(B, bucket, pts, colour) {
  const [a, b, , d] = pts;
  const ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
  const q = ny > 0 ? [pts[0], pts[3], pts[2], pts[1]] : pts;
  B.quad(bucket, q[0], q[1], q[2], q[3], undefined, { colour });
}

/** A stretch s0–s1 of a wall from y0 to y1 in plaster, with windows (on the grid of `style` from `line`) or closed */
function plaster(B, style, F, s0, s1, line, y0, y1, windows) {
  const g = GRID[style], len = s1 - s0, mid = (s0 + s1) / 2, open = windows && len >= 2.4;
  const v = (y) => y - line + g.up - (open ? 0 : g.closed);
  B.quad(style, at(F, s0, y0), at(F, s1, y0), at(F, s1, y1), at(F, s0, y1), [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half: open ? len / 2 : 0 });
}

// The south house's glazed ground floor on the Promenade: the glass, a concrete band over it, a post at every bay
function shopFloor(B, F, s0, s1, top) {
  const y0 = S.base, len = s1 - s0;
  B.quad('glass', at(F, s0, y0), at(F, s1, y0), at(F, s1, top - 0.45), at(F, s0, top - 0.45), [[0, y0], [len, y0], [len, top - 0.45], [0, top - 0.45]]);
  B.box('trim', F, s0, s1, 0, 0.1, top - 0.45, top, C.concrete);
  for (const s of bays(len, GRID.modern.bay, 0)) {
    const e = s0 + s - GRID.modern.bay / 2;
    if (e > s0 + 0.2 && e < s1 - 0.2) B.box('trim', F, e - 0.22, e + 0.22, 0, 0.25, y0, top - 0.45, C.concrete);
  }
  for (const e of [s0 + 0.22, s1 - 0.22]) B.box('trim', F, e - 0.22, e + 0.22, 0, 0.25, y0, top - 0.45, C.concrete);
}

// A volume: its walls from the base up to its roof (the arcade's wall from the soffit, a modern part's ground floor
// glazed on the Promenade, the body's walls on the band from the band's roof), a cornice, the roof over them
function buildPart(B, p) {
  const R = outwardRing(p.ring), A = S.arcade, band = part(A.part);
  const windows = p.windows !== false;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const pieces = p.id === A.part ? arcadePieces(a, b) : [{ from: 0, to: F.len, open: false }];
    // (the body's walls standing on the band: hidden under the band's roof)
    const onBand = p.id === 'body' && band.ring.some((q) => near(q, a)) && band.ring.some((q) => near(q, b));
    for (const pc of pieces) {
      let y0 = S.base;
      if (pc.open) y0 = A.soffit;
      else if (onBand) y0 = band.top;
      else if (p.shop && F.n[0] < -0.5 && F.len > 2) { shopFloor(B, F, pc.from, pc.to, p.shop); y0 = p.shop; }
      plaster(B, p.style, F, pc.from, pc.to, p.line, y0, p.top, windows);
    }
    // the cornice under the roof's edge
    if (F.len > 0.3) B.box('trim', F, 0, F.len, 0, 0.16, p.top - 0.28, p.top + 0.06, p.style === 'modern' ? C.concrete : C.cornice);
  }
  flatRoof(B, R, p.top);
}

// A rail along a wall at a roof's edge: two bars on posts every 2 m, `inset` m in
function rail(B, F, top, inset = 0.3, colour = C.rail) {
  for (const y of [top + 0.5, top + 1.0]) B.box('trim', F, 0, F.len, -inset - 0.06, -inset, y - 0.05, y, colour);
  const k = Math.max(1, Math.round(F.len / 2));
  for (let j = 0; j <= k; j++) { const s = (F.len * j) / k; B.box('trim', F, s - 0.03, s + 0.03, -inset - 0.06, -inset, top, top + 1.0, colour); }
}

// The arcade along the Promenade: the band's soffit over the pavement, its slab's edge, the shops' glass and fascia on
// the front under it with the posts between the shops, the terrace's rail on the band's roof
function buildArcade(B) {
  const A = S.arcade, W = wallFrame(...A.wall), Fr = wallFrame(...A.front), top = part(A.part).top, y = A.soffit;
  ceiling(B, 'trim', [[A.front[0][0], y, A.front[0][1]], [A.wall[0][0], y, A.wall[0][1]], [A.wall[1][0], y, A.wall[1][1]], [A.front[1][0], y, A.front[1][1]]], C.soffit);
  B.box('trim', W, 0, W.len, 0, 0.12, y - 0.32, y + 0.05, C.slab);
  const g0 = A.street - 0.6;
  B.quad('glass', at(Fr, 0, g0), at(Fr, Fr.len, g0), at(Fr, Fr.len, A.fascia), at(Fr, 0, A.fascia), [[0, g0], [Fr.len, g0], [Fr.len, A.fascia], [0, A.fascia]]);
  B.box('trim', Fr, 0, Fr.len, 0, 0.1, A.fascia, y, C.dark);
  const n = Math.round(Fr.len / 7.6);
  for (let j = 0; j <= n; j++) { const s = Math.min(Fr.len - 0.15, Math.max(0.15, (Fr.len * j) / n)); B.box('trim', Fr, s - 0.15, s + 0.15, 0, 0.16, g0, A.fascia, C.stone); }
  rail(B, W, top, 0.15);
}

// The porch of the entrance: glass round it on a stone step, the navy fascia, its roof; the doors and the name on the
// front to the street, a step before the doors
function buildPorch(B) {
  const P = S.porch, R = outwardRing(P.ring);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.05) continue;
    const g0 = P.y0 + 0.15;
    B.quad('glass', at(F, 0, g0), at(F, F.len, g0), at(F, F.len, P.fascia), at(F, 0, P.fascia), [[0, g0], [F.len, g0], [F.len, P.fascia], [0, P.fascia]]);
    B.box('trim', F, -0.05, F.len + 0.05, -0.1, 0.06, P.y0 - 1.0, g0, C.stone);
    B.box('trim', F, -0.06, F.len + 0.06, 0, 0.12, P.fascia, P.top, C.navy);
    for (const s of [0.06, F.len - 0.06]) B.box('trim', F, s - 0.06, s + 0.06, 0, 0.1, g0, P.fascia, C.steel);
  }
  flatRoof(B, R, P.top);
  const F = wallFrame(...P.front), m = F.len / 2, D = P.door, N = P.name;
  B.decal(F, m - D.w / 2, m + D.w / 2, 0.04, P.y0 + 0.15, P.y0 + 0.15 + D.h, 'door');
  B.decal(F, m - N.w / 2, m + N.w / 2, 0.14, N.y0, N.y1, 'porch');
  B.box('trim', F, m - 1.6, m + 1.6, 0, 1.0, P.y0 - 1.0, P.y0 + 0.1, C.stone);
}

// The balconies along the tall block's south face: a slab at each floor, a timber balustrade on it, the rail's posts at
// the ends and between every two windows
function buildBalconies(B) {
  const Bc = S.balconies, F = wallFrame(Bc.a, Bc.b), o = Bc.out;
  for (const run of Bc.runs) {
    const dividers = [];
    for (let s = run.s0 + 2 * GRID.hotel.bay; s < run.s1 - 0.5; s += 2 * GRID.hotel.bay) dividers.push(s);
    for (const y of run.floors) {
      B.box('trim', F, run.s0, run.s1, 0, o, y - 0.18, y, C.slab);
      B.box('trim', F, run.s0, run.s1, o - 0.07, o - 0.01, y + 0.12, y + Bc.rail - 0.1, C.timber);
      B.box('trim', F, run.s0, run.s1, o - 0.1, o, y + Bc.rail - 0.1, y + Bc.rail, C.timber);
      for (const s of [run.s0, run.s1]) B.box('trim', F, s - 0.05, s + 0.05, 0, o, y, y + Bc.rail, C.timber);
      for (const s of dividers) B.box('trim', F, s - 0.04, s + 0.04, 0, o - 0.07, y, y + Bc.rail, C.timber);
    }
  }
}

// The name in standing letters on the roofs, on two posts each
function buildNames(B) {
  for (const N of S.names) {
    const p = part(N.part), F = wallFrame(N.a, N.b), s0 = (F.len - N.w) / 2, y0 = p.top + 0.25;
    B.decal(F, s0, s0 + N.w, -N.back, y0, y0 + N.h, 'name');
    for (const s of [s0 + 1.2, s0 + N.w / 2, s0 + N.w - 1.2]) B.box('trim', F, s - 0.04, s + 0.04, -N.back - 0.12, -N.back - 0.04, p.top, y0 + N.h * 0.8, C.rail);
  }
}

// The hotel's board on the south house's front: its body, the board on it
function buildBoard(B) {
  const D = S.board, F = wallFrame(D.a, D.b);
  B.box('trim', F, D.s0 - 0.05, D.s0 + D.w + 0.05, 0, 0.08, D.y0 - 0.05, D.y0 + D.h + 0.05, C.dark);
  B.decal(F, D.s0, D.s0 + D.w, 0.09, D.y0, D.y0 + D.h, 'board');
}

/**
 * Builds the Hotel Schweizerhof and the south house into `scene`. Returns { group, colliders }: the walls of the parts
 * outside OpenStreetMap's footprints (the annexes along the Guggerbachstrasse, the link and the stair tower between the
 * hotel and the south house; the footprints' walls are js/buildings.js'), at world heights (baseY set, so
 * liftColliders leaves them be).
 */
export function buildSchweizerhof(scene) {
  const root = new THREE.Group();
  root.name = 'Hotel Schweizerhof';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['hotel', 'modern'], name: 'Hotel Schweizerhof' }), M = materials();
  for (const p of S.parts) buildPart(B, p);
  buildArcade(B);
  buildPorch(B);
  buildBalconies(B);
  buildNames(B);
  buildBoard(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  const colliders = [];
  const wall = (a, b, y0, y1, thick = 0.4) => {
    const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2, hz = thick / 2;
    const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } });
  };
  for (const p of S.parts) {
    if (!p.collide) continue;
    p.ring.forEach((a, i) => { const b = p.ring[(i + 1) % p.ring.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.05) wall(a, b, S.base, p.top); });
  }
  return { group: root, colliders };
}
