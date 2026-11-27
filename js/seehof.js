import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, positionWorld, smoothstep, step, uv, vec3 } from 'three/tsl';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { SEEHOF, bays, facesStreet, insetRing, onWall, outwardRing, part, wallFrame } from './seehof-data.js';

export { SEEHOF };

// The Hotel Seehof rebuilt by hand (js/seehof-data.js), standing in for its swissBUILDINGS3D volume, which the streamed
// tiles drew as one white block with the town houses' windows. The new wing in pale plaster with a window in a grey
// frame in every bay, its loggia balconies, the dormers over its eaves and the rail round its attic; the glazed hall and
// the shops along the Promenade; the old hotel and its tower in cream over a rusticated ground floor, tall windows in
// brown stone surrounds, diamond quoins on the corners, slate mansards with a dormer over every window, the hotel's name
// on the roof, the tower's hipped roof and the entrance with its canopy at its foot. Windows are drawn by the walls'
// materials from their uv (metres along the wall from its middle, metres up the floors' grid). Six meshes: the two
// walls, the roofs, the glass, the trim (one vertex-coloured mesh) and the decals (one canvas atlas).

excludeBuildings([SEEHOF.exclude]);

// v of a wall: metres up its grid, a floor's top at every multiple of the storey (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const GRID = {
  modern: { storey: SEEHOF.storey.modern, bay: SEEHOF.bay.modern, win: { lo: 0.85, hi: 2.3, half: 0.6 } },
  old: { storey: SEEHOF.storey.old, bay: SEEHOF.bay.old, win: { lo: 0.9, hi: 2.75, half: 0.58 } }
};
for (const g of Object.values(GRID)) { g.up = 40 * g.storey; g.closed = 300 * g.storey; }

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PALE = [0.58, 0.565, 0.51], CREAM = [0.52, 0.45, 0.31], STONE = [0.36, 0.35, 0.32], SLATE = [0.1, 0.105, 0.115];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(SLATE, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    const w = (g, rgb) => SIMPLE_SKINS.windowed(rgb, g.storey, g.win.lo / g.storey, g.win.hi / g.storey, 0.9, 0.4);
    M.modern = w(GRID.modern, [0.5, 0.49, 0.45]);
    M.old = w(GRID.old, [0.45, 0.39, 0.28]);
    M.glass = SIMPLE_SKINS.glow([0.08, 0.1, 0.11], 0.1, 0.8, [1.0, 0.84, 0.62], 0.45);
    return M;
  }
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.09, 0.105), worldNoise(0.07));
  // The new wing: pale plaster, a window per bay and floor in a dark grey frame with a post in its middle, a sill under
  // it, a blind drawn in some
  {
    const G = GRID.modern, W = G.win;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: G.bay, storey: G.storey, closed: G.closed, winHalf: W.half });
    const win = rect(W.half, W.lo, W.hi).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu));
    const pane = rect(W.half - 0.07, W.lo + 0.07, W.hi - 0.07).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(W.half + 0.06, W.lo - 0.08, W.lo).mul(open).mul(near);
    const wall = mix(vec3(0.54, 0.525, 0.47), vec3(...PALE).mul(1.04), worldNoise(0.3)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.85, id)));
    const blind = step(float(W.hi - 0.07).sub(drawn.mul(W.hi - W.lo - 0.14)), fv).mul(pane).mul(near);
    let c = mix(wall, vec3(0.45, 0.45, 0.43), sill);
    c = mix(c, vec3(0.07, 0.072, 0.075), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.42, 0.4, 0.36), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (a hotel: most rooms lit in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 23, { share: 0.55, late: 0.15, tone: twoTones([1.0, 0.76, 0.48], [0.95, 0.88, 0.75], 0.75) }).mul(pane).mul(mix(float(1), float(0.45), blind)).mul(glow.mul(1.1));
    M.modern = m;
  }
  // The old hotel: cream plaster over a grey rusticated ground floor (its courses every 0.55 m), tall windows in brown
  // stone surrounds with a cap over them, white sashes with a post and a transom; no window under the ground floor
  {
    const G = GRID.old, W = G.win;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open: open0, rect } = windowGrid({ bay: G.bay, storey: G.storey, closed: G.closed, winHalf: W.half });
    const Y = positionWorld.y;
    const open = open0.mul(step(1.9, Y));
    const plinth = step(Y, SEEHOF.plinth);
    const surround = rect(W.half + 0.15, W.lo - 0.13, W.hi + 0.13).max(rect(W.half + 0.26, W.hi + 0.13, W.hi + 0.34)).max(rect(W.half + 0.22, W.lo - 0.24, W.lo - 0.08)).mul(open);
    const sash = rect(W.half, W.lo, W.hi).mul(open);
    const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.035, 0.02, abs(fv.sub(W.hi - 0.72))));
    const pane = rect(W.half - 0.08, W.lo + 0.08, W.hi - 0.08).mul(float(1).sub(bars.mul(near))).mul(open);
    const courses = smoothstep(0.44, 0.48, abs(fract(Y.div(0.55)).sub(0.5))).mul(fine);
    const cream = mix(vec3(...CREAM).mul(0.93), vec3(...CREAM).mul(1.05), worldNoise(0.25));
    const stone = mix(vec3(...STONE).mul(0.92), vec3(...STONE).mul(1.06), worldNoise(0.6)).mul(float(1).sub(courses.mul(0.35)));
    let c = mix(cream, stone, plinth);
    c = mix(c, mix(vec3(0.3, 0.2, 0.1), vec3(0.34, 0.33, 0.3), plinth), surround.mul(near.mul(0.7).add(0.3)));
    c = mix(c, vec3(0.62, 0.61, 0.58), sash);
    c = mix(c, glassC, pane);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.92), float(0.12), pane);
    m.metalnessNode = pane.mul(0.55);
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 41, { share: 0.6, late: 0.18, tone: twoTones([1.0, 0.72, 0.42], [1.0, 0.84, 0.6], 0.6) }).mul(pane).mul(glow.mul(1.1));
    M.old = m;
  }
  // The shops' windows and the hall's glazing: dark mullions every 1.4 m, a rail every 1.6 m, lit at night
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

// --- The lettering, the quoins and the doors: one canvas atlas ---------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  name: [0, 0, 1024, 107], // the name on the roof (11 × 1.15 m)
  shop: [0, 112, 1024, 128], // the shops' red fascia (10.6 × 1.32 m)
  hall: [0, 244, 1024, 88], // the hall's dark fascia (15.2 × 1.32 m)
  canopy: [0, 336, 512, 80], // the board on the canopy (4 × 0.62 m)
  quoin: [520, 336, 48, 176], // a storey of the corner stones (0.8 × 3.3 m)
  door: [576, 336, 128, 176] // the entrance's doors (2.2 × 2.9 m)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // the name in standing letters: gilt, a dark edge
  cell('name', (w, h) => {
    g.font = `bold ${Math.round(h * 0.86)}px Georgia, 'Times New Roman', serif`;
    g.lineWidth = 5; g.strokeStyle = '#3b2c12'; g.fillStyle = '#d9b45a';
    g.strokeText('HOTEL SEEHOF', w / 2, h * 0.54, w - 12);
    g.fillText('HOTEL SEEHOF', w / 2, h * 0.54, w - 12);
  });
  cell('shop', (w, h) => {
    g.fillStyle = '#c4122c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = `italic bold ${Math.round(h * 0.52)}px Helvetica, Arial, sans-serif`;
    g.fillText('PAARSENN', w * 0.36, h * 0.44, w * 0.5);
    g.font = `${Math.round(h * 0.24)}px Helvetica, Arial, sans-serif`;
    g.fillText('Sport + Mode · Davos', w * 0.76, h * 0.5, w * 0.36);
    g.fillRect(0, h - 6, w, 6);
  });
  cell('hall', (w, h) => {
    g.fillStyle = '#2a2c30'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e6e0'; g.font = `bold ${Math.round(h * 0.42)}px Helvetica, Arial, sans-serif`;
    g.fillText('PAARSENN', w * 0.2, h * 0.5, w * 0.3);
    g.fillStyle = '#e03a3a';
    g.fillText('RENT A SPORT', w * 0.55, h * 0.5, w * 0.3);
    g.fillStyle = '#e8e6e0'; g.font = `${Math.round(h * 0.3)}px Helvetica, Arial, sans-serif`;
    g.fillText('SPORT + MODE', w * 0.85, h * 0.5, w * 0.24);
  });
  cell('canopy', (w, h) => {
    g.fillStyle = '#1c2230'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b99448'; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#e2c06a'; g.font = `bold ${Math.round(h * 0.56)}px Georgia, 'Times New Roman', serif`;
    g.fillText('HOTEL SEEHOF', w / 2, h * 0.55, w - 30);
  });
  // a storey of the quoins: two diamonds in a frame of stone, dark wedges between them
  cell('quoin', (w, h) => {
    g.fillStyle = '#7d786c'; g.fillRect(0, 0, w, h);
    for (const y0 of [0, h / 2]) {
      g.fillStyle = '#e9e2d0';
      g.beginPath(); g.moveTo(w / 2, y0 + 4); g.lineTo(w - 3, y0 + h / 4); g.lineTo(w / 2, y0 + h / 2 - 4); g.lineTo(3, y0 + h / 4); g.closePath(); g.fill();
      g.fillStyle = '#c9c1ad'; g.fillRect(0, y0, w, 5);
    }
  });
  cell('door', (w, h) => {
    g.fillStyle = '#3a2b1a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16232a';
    g.fillRect(8, h * 0.24, w / 2 - 11, h * 0.76 - 2); g.fillRect(w / 2 + 3, h * 0.24, w / 2 - 11, h * 0.76 - 2);
    g.fillRect(8, 8, w - 16, h * 0.24 - 16);
    g.fillStyle = '#c9a24a'; g.fillRect(w / 2 - 9, h * 0.56, 4, 28); g.fillRect(w / 2 + 5, h * 0.56, 4, 28);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  pale: PALE, cream: [0.56, 0.49, 0.35], stone: STONE, slate: SLATE, grey: [0.24, 0.24, 0.23], dark: [0.06, 0.065, 0.07],
  red: [0.42, 0.012, 0.025], slab: [0.5, 0.49, 0.45], rail: [0.13, 0.135, 0.14], panel: [0.3, 0.31, 0.32], awning: [0.5, 0.3, 0.06], iron: [0.03, 0.03, 0.032],
  steel: [0.08, 0.085, 0.095], frame: [0.6, 0.59, 0.55], pane: [0.025, 0.03, 0.035], brass: [0.45, 0.33, 0.12]
};
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;

/** A triangle of a roof, turned to face up */
function roofTri(B, a, b, c) {
  const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0;
  const t = up ? [a, b, c] : [a, c, b];
  B.tri('roof', t[0], t[1], t[2], t.map((p) => [p[0], p[2]]));
}
const roofQuad = (B, a, b, c, d) => { roofTri(B, a, b, c); roofTri(B, a, c, d); };

/** A wall's corners in the world: s along it, y up */
const at = (F, s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };

/** A plastered wall from y0 to y1, with windows (its bays' half `half`) or closed, on the grid of `g` from `line` */
function plaster(B, bucket, g, F, line, y0, y1, half) {
  const mid = F.len / 2, v = (y) => y - line + g.up - (half > 0 ? 0 : g.closed);
  B.quad(bucket, at(F, 0, y0), at(F, F.len, y0), at(F, F.len, y1), at(F, 0, y1), [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half });
}

/** A dormer on a roof at a wall's eaves: its body `o0`–`o1` out of the wall, a window in its front, a pitched roof */
function dormer(B, F, s, half, o0, o1, y0, y1, body, frame) {
  B.box('trim', F, s - half, s + half, o0, o1, y0, y1, body);
  B.box('trim', F, s - half + 0.12, s + half - 0.12, o1, o1 + 0.03, y0 + 0.25, y1 - 0.2, frame);
  B.box('trim', F, s - half + 0.2, s - 0.03, o1 + 0.03, o1 + 0.05, y0 + 0.33, y1 - 0.28, C.pane);
  B.box('trim', F, s + 0.03, s + half - 0.2, o1 + 0.03, o1 + 0.05, y0 + 0.33, y1 - 0.28, C.pane);
  const P = (ss, o, y) => { const [x, z] = onWall(F, ss, o); return [x, y, z]; };
  const e = 0.12, r = y1 + half * 0.75;
  roofQuad(B, P(s - half - e, o1 + e, y1), P(s, o1 + e, r), P(s, o0, r), P(s - half - e, o0, y1));
  roofQuad(B, P(s, o1 + e, r), P(s + half + e, o1 + e, y1), P(s + half + e, o0, y1), P(s, o0, r));
  // (the gable over the window)
  B.tri('trim', P(s - half, o1, y1), P(s + half, o1, y1), P(s, o1, r - 0.06), [[0, 0], [1, 0], [0.5, 1]], { colour: body });
}

/** Is the ring's corner i (between its walls i − 1 and i) convex? (outwardRing's turn: clockwise in x, z) */
function convex(R, i) {
  const n = R.length, p = R[(i - 1 + n) % n], q = R[i], r = R[(i + 1) % n];
  return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) < 0;
}

// The shops and the hall: on the street the shop windows, the fascia, the hall's glazing over it; closed panels elsewhere
function buildShop(B, p) {
  const R = outwardRing(p.ring), [f0, f1] = p.fascia, y0 = SEEHOF.base;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.05) continue;
    if (!facesStreet(F, 0)) {
      B.quad('trim', at(F, 0, y0), at(F, F.len, y0), at(F, F.len, p.top), at(F, 0, p.top), undefined, { colour: C.grey });
      continue;
    }
    const glass = (ya, yb) => B.quad('glass', at(F, 0, ya), at(F, F.len, ya), at(F, F.len, yb), at(F, 0, yb), [[0, ya], [F.len, ya], [F.len, yb], [0, yb]]);
    glass(y0, f0);
    const fascia = p.id === 'shops' ? C.red : C.dark;
    B.box('trim', F, -0.05, F.len + 0.05, 0, 0.12, f0, f1, fascia);
    if (p.top > f1 + 1) {
      glass(f1, p.top - 0.45);
      B.box('trim', F, -0.05, F.len + 0.05, 0, 0.1, p.top - 0.45, p.top + 0.12, C.grey);
    } else B.box('trim', F, -0.05, F.len + 0.05, 0, 0.12, f1, f1 + 0.12, C.grey);
    // the shops' names: the red fascia's on the two long fronts, the dark one's on the hall's front over the street
    if (p.id === 'shops' && F.len > 10) B.decal(F, 0, F.len, 0.13, f0, f1, 'shop');
    if (p.id === 'hall' && F.len > 14 && F.len < 20) B.decal(F, 0, F.len, 0.13, f0, f1, 'hall');
  }
  flatRoof(B, R, p.top);
}

// A volume of plaster: its walls from the base to its eaves, the roof over them (an old part's mansard with dormers,
// its cornice and quoins)
function buildPart(B, p) {
  if (p.style === 'shop') return buildShop(B, p);
  const R = outwardRing(p.ring), y0 = SEEHOF.base, g = GRID[p.style], old = p.style === 'old';
  const eave = p.mansard ? p.mansard.eave : p.top;
  const E = SEEHOF.entrance, Q = SEEHOF.quoin;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    // (an old wall's windows keep clear of the quoins at its ends)
    const half = old ? (F.len >= 3.4 ? F.len / 2 - Q : 0) : (F.len >= 2.4 ? F.len / 2 : 0);
    if (near(a, E.a) && near(b, E.b)) {
      // the tower's front over the entrance: closed under the ground floor's top
      plaster(B, p.style, g, F, p.line, y0, SEEHOF.plinth, 0);
      plaster(B, p.style, g, F, p.line, SEEHOF.plinth, eave, half);
    } else plaster(B, p.style, g, F, p.line, y0, eave, half);
    if (old) {
      // the cornice under the eaves, the band over the rusticated ground floor
      B.box('trim', F, 0, F.len, 0, 0.35, eave - 0.32, eave + 0.04, C.cream);
      B.box('trim', F, 0, F.len, 0, 0.12, SEEHOF.plinth - 0.2, SEEHOF.plinth, C.stone);
    } else if (p.id === 'wing') B.box('trim', F, 0, F.len, 0, 0.22, eave - 0.28, eave + 0.03, C.grey);
  }
  if (old) buildQuoins(B, R, eave);
  if (p.mansard) buildMansard(B, p, R);
  else if (p.id !== 'tower') flatRoof(B, R, p.top);
  if (p.rail) buildRail(B, R, p.top);
}

// The quoins: a strip of diamonds each side of every convex corner whose walls are long enough, a storey at a time from
// the ground floor's top to the eaves
function buildQuoins(B, R, eave) {
  const Q = SEEHOF.quoin, h = SEEHOF.storey.old;
  for (let i = 0; i < R.length; i++) {
    if (!convex(R, i)) continue;
    const n = R.length, F0 = wallFrame(R[(i - 1 + n) % n], R[i]), F1 = wallFrame(R[i], R[(i + 1) % n]);
    if (F0.len < 3 || F1.len < 3) continue;
    for (let y = SEEHOF.plinth; y + h <= eave + 0.01; y += h) {
      B.decal(F0, F0.len - Q, F0.len, 0.03, y, y + h, 'quoin');
      B.decal(F1, 0, Q, 0.03, y, y + h, 'quoin');
    }
  }
}

// An old part's mansard: a slate slope from the eaves `inset` m back up to the top, the flat roof over it, a dormer over
// every window of the walls under it
function buildMansard(B, p, R) {
  const { eave, inset } = p.mansard, I = insetRing(p.ring, inset), top = p.top, n = R.length;
  for (let i = 0; i < n; i++) {
    const a = R[i], b = R[(i + 1) % n], c = I[(i + 1) % n], d = I[i];
    roofQuad(B, [a[0], eave, a[1]], [b[0], eave, b[1]], [c[0], top, c[1]], [d[0], top, d[1]]);
    const F = wallFrame(a, b);
    if (F.len < 3.4) continue;
    for (const s of bays(F.len, GRID.old.bay, F.len / 2 - SEEHOF.quoin, GRID.old.win.half)) dormer(B, F, s, 0.62, -1.45, -0.2, eave + 0.15, eave + 2.3, C.cream, C.frame);
  }
  flatRoof(B, I, top);
}

// A rail round a roof's edge: two bars on posts every 2 m, 0.3 m in
function buildRail(B, R, top) {
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.3) continue;
    for (const y of [top + 0.5, top + 1.0]) B.box('trim', F, 0, F.len, -0.34, -0.28, y - 0.05, y, C.rail);
    const k = Math.max(1, Math.round(F.len / 2));
    for (let j = 0; j <= k; j++) { const s = (F.len * j) / k; B.box('trim', F, s - 0.03, s + 0.03, -0.34, -0.28, top, top + 1.0, C.rail); }
  }
}

// The tower's hipped roof: its two long sides up to the ridge, the hips at its ends, the finial over the street
function buildTowerRoof(B) {
  const T = SEEHOF.towerRoof, [A, Bq, Cq, D] = part('tower').ring, [r1, r2] = T.ridge;
  const e = (q) => [q[0], T.eave, q[1]], r = (q) => [q[0], T.top, q[1]];
  roofQuad(B, e(A), e(Bq), r(r2), r(r1));
  roofQuad(B, e(Cq), e(D), r(r1), r(r2));
  roofTri(B, e(Bq), e(Cq), r(r2));
  roofTri(B, e(D), e(A), r(r1));
  // the eaves' board round it
  const R = outwardRing(part('tower').ring);
  for (let i = 0; i < 4; i++) { const F = wallFrame(R[i], R[(i + 1) % 4]); B.box('trim', F, -0.3, F.len + 0.3, 0, 0.3, T.eave - 0.25, T.eave + 0.02, C.cream); }
  const F = wallFrame(r1, r2);
  B.box('trim', F, F.len - 0.06, F.len + 0.06, -0.06, 0.06, T.top - 0.3, T.top + T.finial, C.iron);
  B.box('trim', F, F.len - 0.14, F.len + 0.14, -0.14, 0.14, T.top + 0.4, T.top + 0.62, C.brass);
}

// The entrance: the doors in the tower's front, the canopy over them (held from the wall), the name on a board on its edge
function buildEntrance(B) {
  const E = SEEHOF.entrance, F = wallFrame(E.a, E.b), D = E.door, K = E.canopy;
  B.decal(F, D.s - D.w / 2, D.s + D.w / 2, 0.04, D.y0, D.y1, 'door');
  B.box('trim', F, D.s - D.w / 2 - 0.15, D.s + D.w / 2 + 0.15, 0, 0.08, D.y1, D.y1 + 0.16, C.stone);
  B.box('trim', F, K.over, F.len - K.over, 0, K.out, K.y, K.y + K.thick, C.steel, { top: 'roof' });
  const bw = 4.0, bm = F.len / 2;
  B.box('trim', F, bm - bw / 2, bm + bw / 2, K.out - 0.12, K.out - 0.04, K.y + K.thick, K.y + K.thick + 0.62, C.steel);
  B.decal(F, bm - bw / 2, bm + bw / 2, K.out - 0.03, K.y + K.thick, K.y + K.thick + 0.62, 'canopy');
}

// The new wing's loggia balconies (a slab with its awning, a rail and a grey panel at each floor, posts at the stack's
// corners) and the dormers over its eaves between them
function buildBalconies(B) {
  const Bc = SEEHOF.balconies, F = wallFrame(Bc.a, Bc.b), h = SEEHOF.storey.modern, o = Bc.out;
  for (const [c, w] of Bc.stacks) {
    const s0 = c - w / 2, s1 = c + w / 2;
    for (let k = 0; k < Bc.floors; k++) {
      const y = Bc.y0 + k * h;
      B.box('trim', F, s0, s1, 0, o, y - 0.18, y, C.slab);
      B.box('trim', F, s0 + 0.05, s1 - 0.05, o - 0.08, o - 0.02, y - 0.55, y - 0.18, C.awning);
      B.box('trim', F, s0, s1, o - 0.06, o, y + Bc.rail - 0.06, y + Bc.rail, C.rail);
      B.box('trim', F, s0 + 0.05, s1 - 0.05, o - 0.05, o - 0.02, y + 0.1, y + Bc.rail - 0.12, C.panel);
      for (const s of [s0, s1]) B.box('trim', F, s - 0.03, s + 0.03, 0, o, y + Bc.rail - 0.06, y + Bc.rail, C.rail);
    }
    for (const s of [s0 + 0.05, s1 - 0.05]) B.box('trim', F, s - 0.05, s + 0.05, o - 0.1, o, part('hall').top, Bc.y0 + (Bc.floors - 1) * h + Bc.rail, C.rail);
  }
  const D = SEEHOF.dormers, top = part('wing').top;
  for (const s of D.at) dormer(B, F, s, D.half, -D.depth, -0.1, top, top + D.height, C.slate, C.frame);
}

// The old hotel's iron balconies: at every other window of its fronts to the street, on two floors; a stone slab, an
// iron rail on bars
function buildIronBalconies(B) {
  const I = SEEHOF.ironBalconies;
  for (const p of SEEHOF.parts.filter((q) => q.mansard)) {
    const R = outwardRing(p.ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 8 || !facesStreet(F, 0.5)) continue;
      const list = bays(F.len, GRID.old.bay, F.len / 2 - SEEHOF.quoin, GRID.old.win.half);
      list.forEach((s, j) => {
        if (j % 2) return;
        for (const y of I.floors) {
          if (y > p.mansard.eave - 2) continue;
          B.box('trim', F, s - I.half, s + I.half, 0, I.out, y - 0.16, y, C.stone);
          B.box('trim', F, s - I.half, s + I.half, I.out - 0.04, I.out, y + 0.95, y + 1.0, C.iron);
          B.box('trim', F, s - I.half, s + I.half, I.out - 0.04, I.out, y + 0.08, y + 0.13, C.iron);
          for (let e = s - I.half + 0.15; e < s + I.half - 0.1; e += 0.15) B.box('trim', F, e - 0.012, e + 0.012, I.out - 0.03, I.out - 0.01, y + 0.13, y + 0.95, C.iron);
          for (const e of [s - I.half, s + I.half]) B.box('trim', F, e - 0.025, e + 0.025, 0, I.out, y, y + 1.0, C.iron);
        }
      });
    }
  }
}

// The hotel's name standing on the old hotel's mansard over its front by the tower, on two posts
function buildName(B) {
  const N = SEEHOF.name, p = part(N.part), R = outwardRing(p.ring), I = insetRing(p.ring, p.mansard.inset);
  const a = [N.wall[0], N.wall[1]], b = [N.wall[2], N.wall[3]];
  const i = R.findIndex((q, k) => near(q, a) && near(R[(k + 1) % R.length], b));
  const F = wallFrame(I[i], I[(i + 1) % I.length]), s0 = (F.len - N.w) / 2;
  B.decal(F, s0, s0 + N.w, -0.2, p.top + 0.15, p.top + 0.15 + N.h, 'name');
  for (const s of [s0 + 1.5, s0 + N.w - 1.5]) B.box('trim', F, s - 0.04, s + 0.04, -0.32, -0.24, p.top, p.top + 0.15 + N.h * 0.8, C.iron);
}

/**
 * Builds the Hotel Seehof into `scene`. Returns { group, colliders }: the walls of the hall and the shops before it
 * (they stand out of OpenStreetMap's footprint, whose walls are js/buildings.js'), at world heights (baseY set, so
 * liftColliders leaves them be).
 */
export function buildSeehof(scene) {
  const root = new THREE.Group();
  root.name = 'Hotel Seehof';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['modern', 'old'], name: 'Hotel Seehof' }), M = materials();
  for (const p of SEEHOF.parts) buildPart(B, p);
  buildTowerRoof(B);
  buildEntrance(B);
  buildBalconies(B);
  buildIronBalconies(B);
  buildName(B);
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
  for (const p of SEEHOF.parts) {
    if (!p.collide) continue;
    p.ring.forEach((a, i) => { const b = p.ring[(i + 1) % p.ring.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.05) wall(a, b, SEEHOF.base, p.top); });
  }
  return { group: root, colliders };
}
