import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { HILTON, levels, loggias, onWall, outwardRing, panels, recess, wallFrame } from './hilton-garden-inn-data.js';

export { HILTON };

// The Hilton Garden Inn Davos rebuilt by hand (js/hilton-garden-inn-data.js), with the low building west of it, both
// standing in for their swissBUILDINGS3D volume, which the streamed tiles drew as one white block with the town houses'
// windows. The hotel: on the street a skin of larch battens over five floors, cut by loggias that step along from floor
// to floor, white plaster and windows behind them, the ground floor set back under it (the long window, the entrance
// in its recess, the garage door); the other sides white behind running balconies with slatted rails and panels; the
// white east end and the white west volume with the name in red letters; the low hall in the court. The low building
// in dark grey panels with its shop on the street and the butcher's name. Windows are drawn by the walls' material
// from their uv (metres along the wall from the bays' middle, metres up the floors' grid). Seven meshes: the plaster,
// the timber, the panels, the glass, the roofs, the trim (one vertex-coloured mesh) and the decals (one canvas atlas).

excludeBuildings([HILTON.exclude]);
// (the name is the hotel's own lettering here, not js/shops.js' generic board; the butcher's is drawn on the low
// building, whose surveyed front stands before OpenStreetMap's, where the board would hang)
SHOP_EXCLUSIONS.add(HILTON.osm);
SHOP_EXCLUSIONS.add('n2503295134');

const S = HILTON.storey, D = HILTON.depth, BASE = HILTON.base, TOP = HILTON.top, ROOF = HILTON.roofLevel;
// v of a wall: metres up the floors' grid (a floor at every multiple of the storey from the first floor, which is at
// 40 of them); closed walls carry v − CLOSED
const UP = 40 * S, CLOSED = 300 * S;
// A window in its storey (m up from the floor) and its half width
const WIN = { lo: 0.9, hi: 2.55, half: 0.85 };

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const WHITE = [0.6, 0.6, 0.58], LARCH = [0.3, 0.16, 0.07], PANEL = [0.11, 0.115, 0.12];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.27, 0.27, 0.26], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.55, 0.55, 0.53], S, WIN.lo / S, WIN.hi / S, 0.9, 0.4);
    M.timber = SIMPLE_SKINS.plain(LARCH, 0.85);
    M.panel = SIMPLE_SKINS.plain(PANEL, 0.7);
    M.glass = SIMPLE_SKINS.glow([0.06, 0.075, 0.085], 0.1, 0.8, [1.0, 0.84, 0.62], 0.45);
    return M;
  }
  const near = fade(140, 420);
  const glow = nightGlow();
  // White plaster, a window per bay and floor in a white frame (three panes), a curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, open, rect } = windowGrid({ bay: HILTON.bay, storey: S, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const third = (WIN.half * 2) / 3;
    const bars = smoothstep(0.045, 0.03, abs(abs(bu).sub(third / 2)));
    const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(bars.mul(near))).mul(open);
    const wall = mix(vec3(...WHITE).mul(0.94), vec3(...WHITE).mul(1.03), worldNoise(0.3));
    const id = hash(bay.mul(41.3).add(storey.mul(77.9)).add(half.mul(9.7)));
    const glassC = mix(vec3(0.02, 0.028, 0.034), vec3(0.08, 0.1, 0.11), worldNoise(0.08));
    // (curtains: a green-grey drawn across part of the pane in some rooms)
    const curtain = step(0.6, id).mul(step(abs(bu), mix(float(0.25), float(WIN.half), step(0.85, id)))).mul(pane).mul(near);
    let c = mix(wall, vec3(0.64, 0.64, 0.62), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.2, 0.23, 0.19), curtain);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (a hotel: most rooms lit in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 37, { share: 0.55, late: 0.15, tone: twoTones([1.0, 0.76, 0.48], [0.95, 0.88, 0.75], 0.75) })
      .mul(pane).mul(mix(float(1), float(0.5), curtain)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // Larch battens: 6.5 cm each, a dark gap between them, each a shade of its own, silvered in places
  {
    const U = uv().x;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    const k = floor(U.div(0.065)), f = fract(U.div(0.065));
    // (the battens are finer than a pixel from across the street: their gaps and shades fade out early, or they shimmer)
    const slat = fade(8, 28);
    const gap = smoothstep(0.74, 0.82, f).mul(slat);
    const id = mix(float(0.5), hash(k.mul(17.3)), slat);
    const wood = mix(vec3(0.25, 0.13, 0.055), vec3(0.37, 0.215, 0.1), id.mul(0.6).add(worldNoise(0.4).mul(0.4)));
    const silver = mix(wood, vec3(0.3, 0.28, 0.23), worldNoise(0.06).mul(0.4));
    m.colorNode = silver.mul(float(1).sub(gap.mul(0.7))).mul(mix(float(0.86), float(1), slat));
    M.timber = m;
  }
  // The low building's panels: dark grey fibre cement, joints every 1.25 m along and 1.5 m up
  {
    const U = uv().x, V = uv().y;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.05 });
    const joint = smoothstep(0.48, 0.495, abs(fract(U.div(1.25)).sub(0.5))).max(smoothstep(0.485, 0.497, abs(fract(V.div(1.5)).sub(0.5)))).mul(near);
    const c = mix(vec3(...PANEL).mul(0.9), vec3(...PANEL).mul(1.12), worldNoise(0.2));
    m.colorNode = mix(c, vec3(0.04, 0.042, 0.045), joint);
    M.panel = m;
  }
  // The glass of the ground floor and the shops: dark frames every 2.5 m, a rail over the doors' height, lit at night
  {
    const U = uv().x, V = uv().y;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(2.5)).sub(0.5)), mv = abs(fract(V.div(2.6)).sub(0.5));
    const frame = smoothstep(0.475, 0.488, mu).max(smoothstep(0.476, 0.49, mv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(2.5)).mul(13.1).add(floor(V.div(2.6)).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.04, 0.055, 0.065), vec3(0.1, 0.12, 0.13), paneId), vec3(0.05, 0.052, 0.056), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.3), frame);
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(float(1).sub(frame)).mul(paneId.mul(0.3).add(0.7)).mul(glow.mul(0.5));
    M.glass = m;
  }
  return M;
}

// --- The lettering and the doors: one canvas atlas ---------------------------------------------------------------------
const ATLAS_SIZE = [1024, 640];
export const ATLAS = {
  name: [0, 0, 1024, 310], // the hotel's name in two lines (7.6 × 2.3 m on the east end)
  metzg: [0, 316, 1024, 96], // the butcher's name over the shop (6.4 × 0.6 m)
  doors: [0, 416, 256, 192], // the entrance's sliding doors (4 × 3 m)
  garage: [264, 416, 320, 168], // the grey sectional door with its door for people (6.4 × 3.4 m)
  door: [592, 416, 96, 192] // a plain door (1.2 × 2.4 m)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // The name in red letters standing on the plaster: "Hilton" smaller over "Garden Inn"
  cell('name', (w, h) => {
    g.fillStyle = '#c8202c'; g.strokeStyle = '#7a0f16'; g.lineWidth = 3;
    g.font = `bold ${Math.round(h * 0.36)}px Georgia, 'Times New Roman', serif`;
    g.strokeText('Hilton', w / 2, h * 0.23, w * 0.5); g.fillText('Hilton', w / 2, h * 0.23, w * 0.5);
    g.font = `bold ${Math.round(h * 0.48)}px Georgia, 'Times New Roman', serif`;
    g.strokeText('Garden Inn', w / 2, h * 0.68, w - 12); g.fillText('Garden Inn', w / 2, h * 0.68, w - 12);
  });
  cell('metzg', (w, h) => {
    g.fillStyle = '#6e1414'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(h * 0.62)}px Georgia, 'Times New Roman', serif`;
    g.fillText('Metzg Davos', w / 2, h * 0.54, w - 40);
  });
  // Two sliding doors of glass in dark frames, a fixed pane each side, a transom over them
  cell('doors', (w, h) => {
    g.fillStyle = '#2a2d31'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16232a';
    const q = w / 4;
    for (let i = 0; i < 4; i++) g.fillRect(i * q + 5, h * 0.2 + 4, q - 10, h * 0.8 - 8);
    g.fillRect(5, 5, w - 10, h * 0.2 - 6);
    g.fillStyle = '#9aa3a8'; g.fillRect(w / 2 - 2, h * 0.2, 4, h * 0.8);
    g.fillStyle = 'rgba(255, 236, 200, 0.18)'; g.fillRect(q + 5, h * 0.2 + 4, 2 * q - 10, h * 0.8 - 8);
  });
  // The garage's sectional door: grey, ribbed, a door for people outlined in it
  cell('garage', (w, h) => {
    g.fillStyle = '#56595c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#45484b';
    for (let y = 6; y < h; y += 9) g.fillRect(0, y, w, 2);
    g.strokeStyle = '#8fa3a6'; g.lineWidth = 2; g.strokeRect(w * 0.58, h * 0.22, w * 0.16, h * 0.78 - 2);
    g.fillStyle = '#c9cfd1'; g.fillRect(w * 0.71, h * 0.6, 4, 12);
  });
  cell('door', (w, h) => {
    g.fillStyle = '#3d4043'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2e31'; g.fillRect(6, 6, w - 12, h - 6);
    g.fillStyle = '#c9cfd1'; g.fillRect(w - 22, h * 0.52, 10, 4);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  white: [0.58, 0.58, 0.56], soffit: [0.5, 0.5, 0.48], floor: [0.3, 0.3, 0.29], slate: [0.11, 0.115, 0.12], coping: [0.3, 0.31, 0.32],
  dark: [0.05, 0.052, 0.056], housing: [0.42, 0.42, 0.41], column: [0.55, 0.55, 0.53]
};

/** A point `s` m along a wall, `o` m out of it, at height y */
const P = (F, s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };

/**
 * A plastered plane from p to q ([x, z], its front on the left of p → q's way, as wallFrame's n), from y0 to y1: uv u0
 * to u1 along it (m from the bays' middle), v up the floors' grid; `half` the bays' half (0: closed)
 */
function plaster(B, p, q, y0, y1, { u0 = 0, u1 = null, half = 0 } = {}) {
  if (u1 === null) u1 = u0 + Math.hypot(q[0] - p[0], q[1] - p[1]);
  const v = (y) => y - HILTON.first + UP - (half > 0 ? 0 : CLOSED);
  B.quad('plaster', [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [[u0, v(y0)], [u1, v(y0)], [u1, v(y1)], [u0, v(y1)]], { half });
}
const xz = (F, s, o = 0) => onWall(F, s, o);

/** A plane of battens along a wall, `o` m out of it, from s0 to s1 and y0 to y1 (uv: metres) */
function timber(B, F, s0, s1, y0, y1, o = 0) {
  B.quad('timber', P(F, s0, o, y0), P(F, s1, o, y0), P(F, s1, o, y1), P(F, s0, o, y1), [[s0, y0], [s1, y0], [s1, y1], [s0, y1]]);
}

// A face of plaster: closed from the base to the roof; the name on it, a shop's glass at its foot
function buildPlaster(B, f) {
  const F = wallFrame(f.a, f.b);
  plaster(B, f.a, f.b, BASE, TOP);
  if (f.name) {
    const { w, h, y } = f.name, s0 = (F.len - w) / 2;
    B.decal(F, s0, s0 + w, 0.03, y, y + h, 'name');
  }
  if (f.shop) {
    const [s0, s1] = f.shop;
    B.quad('glass', P(F, s0, 0.03, HILTON.plinth), P(F, s1, 0.03, HILTON.plinth), P(F, s1, 0.03, HILTON.lintel), P(F, s0, 0.03, HILTON.lintel),
      [[s0, 0], [s1, 0], [s1, HILTON.lintel - HILTON.plinth], [s0, HILTON.lintel - HILTON.plinth]]);
    B.box('trim', F, s0 - 0.1, s1 + 0.1, 0, 0.08, BASE, HILTON.plinth, C.slate);
    B.box('trim', F, s0 - 0.1, s1 + 0.1, 0, 0.1, HILTON.lintel, HILTON.lintel + 0.12, C.dark);
  }
}

// The recessed wall of a loggia or balcony face, its returns at the margins and the margins themselves (white at the
// outline from `y0` to the parapet)
function buildRecess(B, f, start, y0) {
  const { F, e0, e1, c, h } = recess(f);
  plaster(B, xz(F, e0, -D), xz(F, e1, -D), start, ROOF, { u0: e0 - c, u1: e1 - c, half: h });
  plaster(B, xz(F, e0, 0), xz(F, e0, -D), start, ROOF);
  plaster(B, xz(F, e1, -D), xz(F, e1, 0), start, ROOF);
  if (e0 > 0.01) plaster(B, xz(F, 0), xz(F, e0), y0, TOP);
  if (e1 < F.len - 0.01) plaster(B, xz(F, e1), xz(F, F.len), y0, TOP);
  return { F, e0, e1 };
}

// The street front: the timber skin from the first floor to the parapet, a loggia's opening in it where loggias(f, i)
// says (its floor, its soffit, the battens' reveals at its sides, the fin between its two rooms, the rail's cap)
function buildLoggias(B, f) {
  const start = HILTON.first, { F, e0, e1 } = buildRecess(B, f, start, start), L = HILTON.loggia;
  levels().forEach((y, i) => {
    const head = y + S - L.head, sill = y + HILTON.rail;
    const yTop = i === HILTON.floors - 1 ? TOP : y + S;
    timber(B, F, e0, e1, y, sill);
    timber(B, F, e0, e1, head, yTop);
    let s = e0;
    for (const [s0, s1] of loggias(f, i)) {
      timber(B, F, s, s0, sill, head);
      s = s1;
      B.box('trim', F, s0, s1, -D, 0, y - 0.02, y, C.floor);
      B.box('trim', F, s0, s1, -D, 0, head, head + 0.02, C.soffit);
      B.box('timber', F, s0, s1, -0.08, 0, sill - 0.03, sill);
      B.box('timber', F, s0 - 0.1, s0, -D, 0, y, head);
      B.box('timber', F, s1, s1 + 0.1, -D, 0, y, head);
      const m = (s0 + s1) / 2;
      B.box('timber', F, m - L.fin / 2, m + L.fin / 2, -D, -D + 0.22, y, head);
    }
    timber(B, F, s, e1, sill, head);
  });
  // the skin's lower edge over the ground floor
  B.box('timber', F, e0, e1, -0.12, 0, start - 0.05, start);
  buildGround(B, F);
}

// The ground floor under the street front's skin: each stretch's wall `d` m back, the returns between them, the soffit
// over them; the long window on its plinth, the entrance's doors and columns, the plain door and the garage door
function buildGround(B, F) {
  const y1 = HILTON.first, G = HILTON.ground.map(([s0, s1, kind, d]) => [s0, Math.min(s1, F.len), kind, d]);
  G.forEach(([s0, s1, kind, d], i) => {
    plaster(B, xz(F, s0, -d), xz(F, s1, -d), BASE, y1);
    if (d > 0) B.box('trim', F, s0, s1, -d, 0, y1 - 0.03, y1, C.soffit);
    // (the return from the stretch before: from its line to this one's, facing the deeper of the two)
    const prev = i ? G[i - 1][3] : 0;
    if (prev !== d) plaster(B, xz(F, s0, -prev), xz(F, s0, -d), BASE, y1);
    if (i === G.length - 1 && d > 0) plaster(B, xz(F, s1, -d), xz(F, s1, 0), BASE, y1);
    const o = -d + 0.03, mid = (s0 + s1) / 2;
    if (kind === 'glass') {
      B.quad('glass', P(F, s0 + 0.15, o, HILTON.plinth), P(F, s1 - 0.15, o, HILTON.plinth), P(F, s1 - 0.15, o, HILTON.lintel), P(F, s0 + 0.15, o, HILTON.lintel),
        [[s0, 0], [s1, 0], [s1, HILTON.lintel - HILTON.plinth], [s0, HILTON.lintel - HILTON.plinth]]);
      B.box('trim', F, s0 + 0.1, s1 - 0.1, -d, -d + 0.12, BASE, HILTON.plinth, C.slate);
      B.box('trim', F, s0 + 0.1, s1 - 0.1, -d, -d + 0.08, HILTON.lintel, HILTON.lintel + 0.1, C.dark);
    } else if (kind === 'entrance') {
      B.decal(F, mid - 2, mid + 2, o, HILTON.street, HILTON.street + 3, 'doors');
      for (const s of [s0 + (s1 - s0) * 0.33, s0 + (s1 - s0) * 0.67]) B.box('trim', F, s - 0.18, s + 0.18, -0.95, -0.59, BASE, y1, C.column);
    } else if (kind === 'door') {
      B.decal(F, mid - 0.6, mid + 0.6, o, -2.6, -0.2, 'door');
    } else if (kind === 'garage') {
      B.decal(F, mid - 3.2, mid + 3.2, o, -2.5, 0.9, 'garage');
    }
  });
}

// A face of running balconies: the floor's slab with its white edge, the slatted rail, the storey-high slatted panels
// that step along from floor to floor; closed white plaster under the first one; the battens' band at the parapet
function buildBalconies(B, f) {
  const from = f.from || 0, start = levels()[from], { F, e0, e1 } = buildRecess(B, f, start, start);
  plaster(B, f.a, f.b, BASE, start);
  levels().forEach((y, i) => {
    if (i < from) return;
    B.box('trim', F, e0, e1, -D, 0, y - 0.25, y, C.white);
    B.box('timber', F, e0, e1, -0.06, 0, y, y + HILTON.rail);
    for (const [s0, s1] of panels(f, i)) if (s0 >= e0 - 0.01 && s1 <= e1 + 0.01) B.box('timber', F, s0, s1, -0.05, 0, y + HILTON.rail, y + S - 0.25);
  });
  B.box('trim', F, e0, e1, -D, 0, ROOF - 0.25, ROOF, C.white);
  timber(B, F, e0, e1, ROOF - 0.25, TOP);
}

// The hotel: its faces, the roof over its outline with a coping round it and the housings on it
function buildHotel(B) {
  for (const f of HILTON.faces) {
    if (f.style === 'loggia') buildLoggias(B, f);
    else if (f.style === 'balcony') buildBalconies(B, f);
    else buildPlaster(B, f);
  }
  const R = outwardRing(HILTON.ring);
  flatRoof(B, R, TOP);
  coping(B, R, TOP);
  for (const [x, z, hx, hz, h] of HILTON.roofBoxes) {
    const F = wallFrame([x - hx, z + hz], [x + hx, z + hz]);
    B.box('trim', F, 0, 2 * hx, -2 * hz, 0, TOP - 0.1, TOP + h, C.housing, { top: 'roof' });
  }
}

/** A metal coping along the top of a ring's walls */
function coping(B, R, top) {
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len > 0.05) B.box('trim', F, 0, F.len, -0.3, 0.03, top, top + 0.08, C.coping);
  }
}

// The low hall in the court: white, glazed towards the footpath (north), a flat roof
function buildCourt(B) {
  const T = HILTON.court, R = outwardRing(T.ring);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    plaster(B, R[i], R[(i + 1) % R.length], BASE, T.top);
    if (F.n[1] < -0.9) {
      B.quad('glass', P(F, 0.5, 0.03, -0.6), P(F, F.len - 0.5, 0.03, -0.6), P(F, F.len - 0.5, 0.03, 4.3), P(F, 0.5, 0.03, 4.3), [[0, 0], [F.len - 1, 0], [F.len - 1, 4.9], [0, 4.9]]);
      B.box('trim', F, 0.4, F.len - 0.4, 0, 0.1, 4.3, 4.45, C.dark);
    }
  }
  flatRoof(B, R, T.top);
  coping(B, R, T.top);
}

// The low building: dark grey panels; on the street the shop's window, its fascia with the butcher's name and a band of
// windows over it; the glass at its south-west corner; a flat roof
function buildLow(B) {
  const T = HILTON.low, R = outwardRing(T.ring), Sh = HILTON.shop;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], F = wallFrame(a, b);
    B.quad('panel', P(F, 0, 0, BASE), P(F, F.len, 0, BASE), P(F, F.len, 0, T.top), P(F, 0, 0, T.top), [[0, BASE], [F.len, BASE], [F.len, T.top], [0, T.top]]);
    const glass = (s0, s1, y0, y1) => B.quad('glass', P(F, s0, 0.03, y0), P(F, s1, 0.03, y0), P(F, s1, 0.03, y1), P(F, s0, 0.03, y1), [[s0, 0], [s1, 0], [s1, y1 - y0], [s0, y1 - y0]]);
    if (F.n[1] > 0.9) {
      // the street front
      glass(0.8, F.len - 0.8, Sh.glass[0], Sh.glass[1]);
      B.box('trim', F, 0.7, F.len - 0.7, 0, 0.1, BASE, Sh.glass[0], C.slate);
      B.box('trim', F, 0.5, F.len - 0.5, 0, 0.16, Sh.fascia[0], Sh.fascia[1], C.dark);
      glass(1.5, F.len - 1.5, Sh.band[0], Sh.band[1]);
      const M = Sh.metzg, s = (M.x - F.a[0]) / F.u[0], y = (Sh.fascia[0] + Sh.fascia[1] - M.h) / 2;
      B.decal(F, s - M.w / 2, s + M.w / 2, 0.17, y, y + M.h, 'metzg');
    } else if (F.n[0] < -0.9) {
      // the west end: glazed at its south corner (the wall's right end, seen from the west)
      const K = HILTON.corner;
      glass(F.len - K.len, F.len - 0.4, K.y[0], K.y[1]);
      B.box('trim', F, F.len - K.len - 0.1, F.len - 0.3, 0, 0.12, K.y[1], K.y[1] + 0.15, C.dark);
    }
  }
  flatRoof(B, R, T.top);
  coping(B, R, T.top);
}

/**
 * Builds the Hilton Garden Inn and the low building west of it into `scene`. Returns { group, colliders }: the walls
 * of the hotel and the low building (their surveyed fronts stand up to 2.3 m before OpenStreetMap's footprints, whose
 * walls are js/buildings.js'), the street front's at its ground floor's line, at world heights (baseY set, so
 * liftColliders leaves them be).
 */
export function buildHiltonGardenInn(scene) {
  const root = new THREE.Group();
  root.name = 'Hilton Garden Inn';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Hilton Garden Inn' }), M = materials();
  buildHotel(B);
  buildCourt(B);
  buildLow(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: colliders() };
}

/** The colliders: thin boxes along the walls, 0.4 m thick behind their line (the street front's along its ground floor) */
export function colliders() {
  const out = [];
  const wall = (a, b, y0, y1, thick = 0.4) => {
    const F = wallFrame(a, b);
    if (F.len < 0.05) return;
    const m = onWall(F, F.len / 2, -thick / 2), cx = m[0], cz = m[1], hx = F.len / 2, hz = thick / 2;
    const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    out.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } });
  };
  for (const f of HILTON.faces) {
    if (f.style !== 'loggia') { wall(f.a, f.b, BASE, TOP); continue; }
    const F = wallFrame(f.a, f.b);
    let prev = 0;
    for (const [s0, s1raw, , d] of HILTON.ground) {
      const s1 = Math.min(s1raw, F.len);
      wall(onWall(F, s0, -d), onWall(F, s1, -d), BASE, TOP);
      if (d !== prev) wall(onWall(F, s0, -Math.min(d, prev)), onWall(F, s0, -Math.max(d, prev)), BASE, HILTON.first);
      prev = d;
    }
  }
  for (const T of [HILTON.court, HILTON.low]) {
    const R = outwardRing(T.ring);
    R.forEach((a, i) => wall(a, R[(i + 1) % R.length], BASE, T.top));
  }
  return out;
}
