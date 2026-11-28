import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, litWindow, nightGlow, twoTones, worldNoise } from './building-kit.js';
import {
  ATLAS, ATLAS_SIZE, BOARDS, DOORS, EXCLUDE, HOUSES, SHOPFRONTS, SHOP_NODES, groundOutlines, houseOf, lookOf, nearestWall, onWall,
  outerWalls, pointInRing, profileAt, roofHeights, shopWall, upperWalls, wallProfile
} from './promenade-mitte-2-data.js';

export { HOUSES, ATLAS, ATLAS_SIZE };

// The houses along the Promenade between the Kongress Hotel and the Bristol rebuilt by hand
// (js/promenade-mitte-2-data.js), standing in for their swissBUILDINGS3D volumes, which the streamed tiles drew as
// white blocks with the town houses' windows: Gourmet Käch's white house with its shops under a slab canopy, the white
// house of flats behind it, the cream house and La Piazza's behind the pavilions, the taupe corner house at the
// Reginaweg with its frieze under the deep eaves (Kopp's Coiffure), the ochre Villa Silvana with its round tower, its
// turret and its mansard as surveyed, the light grey house of mark & händle with its canopy, the anthracite block with
// orange reveals over Escher's glazed floor, and the low white Green Wildman under its dark parapet. Each house stands
// on its surveyed outlines under its surveyed roofs (their overhangs as surveyed). The windows are drawn by the walls'
// material from its uv (metres along a wall from its middle, storeys up the house's floors' grid) and the house's look,
// which every vertex carries (aWin, aWin2, aFrame, its colour): one walls mesh for the whole row. Six meshes: the walls,
// the pitched roofs, the flat roofs, the trim (one vertex-coloured mesh), the shops' glass and the lettering, doors and
// frieze (one canvas atlas).

excludeBuildings(EXCLUDE);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js; the OSM buildings
// the anthracite block's survey also covers lose their own)
for (const h of HOUSES) {
  SURVEYED_FOOTPRINTS.set(h.osm, groundOutlines(h.osm));
  for (const id of h.covers || []) SURVEYED_FOOTPRINTS.set(id, []);
}
// (the shops' own lettering on the surveyed walls instead of js/shops.js' generic signs on OSM's)
for (const n of SHOP_NODES) SHOP_EXCLUSIONS.add(n);

const CLOSED_V = -1000; // v of a wall without windows
const UP = 40; // storeys added to v, so that it stays positive under the floors' grid's origin

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.1, 0.1, 0.105], FLAT = [0.24, 0.235, 0.225];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.8);
  M.flat = SIMPLE_SKINS.snowRoof(FLAT, 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.03 });
  // the shops' glass: dark, a warm glow behind it after dusk
  M.glass = SIMPLE_SKINS.glow([0.05, 0.06, 0.07], 0.1, 0.6, [1.0, 0.82, 0.6], 0.3);
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: each house's colour from its vertices, a window per bay and floor, lit at night; v counts
    // storeys, js/landmark-buildings.js SIMPLE_SKINS)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], 1, 0.3, 0.78, 0.9, 0.3, { bay: 2.8, half: 0.6 });
    M.walls.vertexColors = true;
    return M;
  }
  M.walls = wallMaterial();
  return M;
}

// A soft-edged rectangle of nodes: |x| < hw, lo < y < hi
const rect = (x, y, hw, lo, hi, e = 0.012) => smoothstep(hw.add(e), hw.sub(e), abs(x)).mul(smoothstep(lo.sub(e), lo.add(e), y)).mul(smoothstep(hi.add(e), hi.sub(e), y));

// The walls of the whole row: each vertex carries its house's look (aWin: storey, bay, window's half width, style;
// aWin2: the window's foot and head over its storey's foot, a seed; aFrame: the frames', shutters' or reveals' colour;
// color: the render)
function wallMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const A = attribute('aWin', 'vec4'), A2 = attribute('aWin2', 'vec4'), FR = attribute('aFrame', 'vec3'), COL = attribute('color', 'vec3');
  const STOREY = A.x, BAY = A.y, WH = A.z, STYLE = A.w, LO = A2.x, HI = A2.y, SEED = A2.z;
  const U = uv().x, V = uv().y, half = attribute('aHalf', 'float');
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  const openV = step(0, V);
  const st = floor(V), fv = V.sub(st).mul(STOREY);
  const bay = floor(U.div(BAY).add(0.5)), bu = U.sub(bay.mul(BAY));
  const style3 = step(2.5, STYLE).mul(step(STYLE, 3.5)), style5 = step(4.5, STYLE);
  const surrounded = step(STYLE, 1.5);
  // one window per bay where it fits in the wall
  const openP = step(abs(bay.mul(BAY)).add(WH).add(0.4), half).mul(openV);
  const win = rect(bu, fv, WH, LO, HI).mul(openP);
  const frameW = mix(float(0.07), float(0.05), style5);
  const mid = LO.add(HI.sub(LO).mul(0.72));
  const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.03, 0.018, abs(fv.sub(mid))).mul(float(1).sub(style5)));
  const pane = rect(bu, fv, WH.sub(frameW), LO.add(frameW), HI.sub(frameW)).mul(float(1).sub(bars.mul(fine))).mul(openP);
  const surround = rect(bu, fv, WH.add(0.15), LO.sub(0.15), HI.add(0.15)).mul(openP).mul(surrounded).sub(win).max(0);
  const sill = rect(bu, fv, WH.add(0.1), LO.sub(0.1), LO).mul(openP).mul(near).mul(float(1).sub(style5));
  const id = hash(bay.mul(37.7).add(st.mul(91.3)).add(half.mul(13.1)).add(SEED));
  // shutters each side (style 3), in the frame colour, slats across them near by
  const shutter = rect(abs(bu).sub(WH.mul(1.5).add(0.06)), fv, WH.mul(0.5), LO, HI).mul(openP).mul(style3).mul(step(abs(bay.mul(BAY)).add(WH.mul(2)).add(0.5), half));
  const slats = smoothstep(0.3, 0.0, fract(fv.div(0.075))).mul(0.35).mul(fine);
  // the reveals of the big windows (style 5): orange in about a third of them, dark grey in the others
  const reveal = rect(bu, fv, WH.add(0.13), LO.sub(0.13), HI.add(0.13)).mul(openP).mul(style5).sub(win).max(0);
  const orange = step(0.66, hash(id.mul(19.7)));
  // their blinds: drawn down some way in most windows, the slats near by
  const drawn = step(0.3, id).mul(mix(float(0.2), float(0.9), hash(id.mul(71.3))));
  const blind = step(HI.sub(frameW).sub(drawn.mul(HI.sub(LO))), fv).mul(pane).mul(style5);
  const blindSlats = smoothstep(0.35, 0.0, fract(fv.div(0.08))).mul(0.25).mul(fine);
  // a curtain drawn in some windows (styles 1 and 3)
  const curtain = step(0.7, id).mul(step(HI.sub(0.07).sub(HI.sub(LO).mul(0.35)), fv)).mul(pane).mul(float(1).sub(style5)).mul(near);
  // the render: its colour, weathered
  const render = COL.mul(mix(float(0.94), float(1.04), worldNoise(0.35)));
  const glassC = mix(vec3(0.02, 0.025, 0.03), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
  let c = render;
  c = mix(c, COL.mul(0.45).add(0.33), surround);
  c = mix(c, vec3(0.42, 0.41, 0.39), sill);
  c = mix(c, FR.mul(float(1).sub(slats)), shutter);
  c = mix(c, mix(vec3(0.16, 0.16, 0.17), FR, orange), reveal);
  c = mix(c, mix(FR, vec3(0.6, 0.6, 0.58), style3).mul(float(1).sub(style5)).add(vec3(0.05, 0.05, 0.055).mul(style5)), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  c = mix(c, vec3(0.5, 0.5, 0.48).mul(float(1).sub(blindSlats)), blind);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(blind)).mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.9), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (houses of flats and offices: a window lit here and there in the evening, fewer towards midnight)
  const lit = litWindow(bay, st.add(half.mul(3.3)), SEED, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) });
  m.emissiveNode = lit.mul(pane).mul(mix(float(1), float(0.45), blind.max(curtain))).mul(glow.mul(1.1));
  return m;
}

// --- The lettering, the doors and the frieze: one canvas atlas ----------------------------------------------------------
function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  const letters = (text, w, h, { colour, font, weight = 800, scale = 0.62, spacing = 0, y = 0.5 }) => {
    g.fillStyle = colour;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${weight} ${Math.round(h * scale)}px ${font}`;
    if ('letterSpacing' in g && spacing) g.letterSpacing = `${spacing}px`;
    g.fillText(text, w / 2, h * y + h * 0.04, w * 0.92);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  };
  const sans = 'Inter, "Helvetica Neue", Arial, sans-serif', serif = 'Georgia, "Times New Roman", serif';
  // ESCHER RAUMDESIGN: white capitals on the anthracite box, the second line small and spaced
  cell('escher', (w, h) => {
    g.fillStyle = '#26282b'; g.fillRect(0, 0, w, h);
    letters('ESCHER', w, h, { colour: '#f2f2f0', font: sans, weight: 700, scale: 0.5, spacing: 10, y: 0.38 });
    letters('RAUMDESIGN', w, h, { colour: '#d9d9d6', font: sans, weight: 400, scale: 0.2, spacing: 12, y: 0.8 });
  });
  // Gourmet Käch: dark letters on its yellow board
  cell('kaech', (w, h) => {
    g.fillStyle = '#f2d36b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3a2a00'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    letters('Gourmet Käch', w, h, { colour: '#3a2a00', font: serif, weight: 700, scale: 0.48 });
  });
  // La Piazza: cream serif on a dark brown board
  cell('piazza', (w, h) => {
    g.fillStyle = '#2b2118'; g.fillRect(0, 0, w, h);
    letters('La Piazza', w, h, { colour: '#f0d9a0', font: serif, weight: 700, scale: 0.42 });
  });
  // Kopp's Coiffure: white on dark grey
  cell('kopp', (w, h) => {
    g.fillStyle = '#33393f'; g.fillRect(0, 0, w, h);
    letters("Kopp's Coiffure", w, h, { colour: '#ffffff', font: sans, weight: 700, scale: 0.46 });
  });
  // The Green Wildman: gold on dark green, a thin gold rim
  cell('wildman', (w, h) => {
    g.fillStyle = '#1f3a1f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a44a'; g.lineWidth = 3; g.strokeRect(7, 7, w - 14, h - 14);
    letters('The Green Wildman', w, h, { colour: '#ffd27a', font: serif, weight: 700, scale: 0.36 });
  });
  // VILLA SILVANA: dark grey capitals on the grey ground floor (transparent round them)
  cell('silvana', (w, h) => {
    g.clearRect(0, 0, w, h);
    letters('VILLA SILVANA', w, h, { colour: '#2c2c2a', font: serif, weight: 500, scale: 0.6, spacing: 6 });
  });
  // a house door: a dark frame, a glass leaf with a bar across, a handle
  cell('door', (w, h) => {
    g.fillStyle = '#2a2724'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b2329'; g.fillRect(w * 0.14, h * 0.06, w * 0.72, h * 0.9);
    g.fillStyle = '#3b4a54'; g.fillRect(w * 0.18, h * 0.09, w * 0.64, h * 0.4);
    g.fillStyle = '#56544f'; g.fillRect(w * 0.14, h * 0.52, w * 0.72, h * 0.04);
    g.fillStyle = '#b9b4a8'; g.fillRect(w * 0.7, h * 0.56, w * 0.08, h * 0.03);
  });
  // the taupe house's door: dark boards in a stone surround carved in a twisted band, a round head
  cell('carved', (w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#b3ab9c';
    g.beginPath(); g.moveTo(0, h); g.lineTo(0, w / 2); g.arc(w / 2, w / 2, w / 2, Math.PI, 0); g.lineTo(w, h); g.closePath(); g.fill();
    g.strokeStyle = '#857d6f'; g.lineWidth = 3;
    for (let y = w / 2; y < h; y += 14) { g.beginPath(); g.moveTo(4, y); g.lineTo(16, y + 7); g.lineTo(4, y + 14); g.stroke(); g.beginPath(); g.moveTo(w - 4, y); g.lineTo(w - 16, y + 7); g.lineTo(w - 4, y + 14); g.stroke(); }
    g.fillStyle = '#4a2c1a';
    g.beginPath(); g.moveTo(20, h); g.lineTo(20, w / 2 + 4); g.arc(w / 2, w / 2 + 4, w / 2 - 20, Math.PI, 0); g.lineTo(w - 20, h); g.closePath(); g.fill();
    g.fillStyle = '#5e3a24';
    for (let i = 0; i < 3; i++) g.fillRect(26 + i * ((w - 52) / 3), w / 2 + 8, (w - 52) / 3 - 4, h - w / 2 - 8);
    g.fillStyle = '#1c2126'; g.fillRect(w / 2 - 6, h * 0.35, 12, h * 0.3);
  });
  // the frieze under the taupe house's eaves: a running-dog wave, light on a dark band
  cell('frieze', (w, h) => {
    g.fillStyle = '#3e352b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a39785'; g.lineWidth = h * 0.12;
    g.beginPath();
    const n = 8, p = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * p;
      g.moveTo(x, h * 0.78);
      g.bezierCurveTo(x + p * 0.35, h * 0.78, x + p * 0.55, h * 0.2, x + p * 0.75, h * 0.25);
      g.bezierCurveTo(x + p * 0.95, h * 0.3, x + p * 0.85, h * 0.62, x + p * 0.62, h * 0.55);
      g.moveTo(x + p * 0.75, h * 0.25);
      g.bezierCurveTo(x + p * 0.9, h * 0.3, x + p, h * 0.78, x + p, h * 0.78);
    }
    g.stroke();
    g.fillStyle = '#a39785'; g.fillRect(0, 0, w, h * 0.06); g.fillRect(0, h * 0.94, w, h * 0.06);
  });
  return canvasTexture(canvas);
}

// --- The walls' collector: one mesh for the row, each vertex its look -------------------------------------------------------
class Walls {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.half = []; this.col = []; this.win = []; this.win2 = []; this.frame = []; }
  /** A quad on a wall (frame F, outside on F.n) from s0 to s1, y from la/lb up to ha/hb (at s0/s1) */
  quad(F, s0, s1, la, lb, ha, hb, look, { mid, half, open, colour }) {
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    const v = (y) => (open ? (y - look.floor0) / look.storey + UP : CLOSED_V);
    const corners = [[s0, la], [s1, lb], [s1, hb], [s0, ha]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [s, y] = corners[i];
      this.pos.push(...P(s, y)); this.nrm.push(F.n[0], 0, F.n[1]); this.uv.push(s - mid, v(y)); this.half.push(open ? half : 0);
      this.col.push(...colour); this.win.push(look.storey, look.bay, look.half, look.style);
      this.win2.push(look.lo, look.hi, look.seed, 0); this.frame.push(...look.frame);
    }
  }
  mesh(material, name) {
    const g = new THREE.BufferGeometry();
    const f = (a, n) => new THREE.Float32BufferAttribute(a, n);
    g.setAttribute('position', f(this.pos, 3)); g.setAttribute('normal', f(this.nrm, 3)); g.setAttribute('uv', f(this.uv, 2));
    g.setAttribute('aHalf', f(this.half, 1)); g.setAttribute('color', f(this.col, 3)); g.setAttribute('aWin', f(this.win, 4));
    g.setAttribute('aWin2', f(this.win2, 4)); g.setAttribute('aFrame', f(this.frame, 3));
    const mesh = new THREE.Mesh(g, material);
    mesh.name = `${name} walls`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

// --- Geometry helpers ------------------------------------------------------------------------------------------------------
const C = {
  plinth: [0.22, 0.215, 0.205], soffit: [0.3, 0.295, 0.285], fascia: [0.2, 0.2, 0.2], shopFrame: [0.06, 0.06, 0.065],
  kick: [0.12, 0.12, 0.125], canopy: [0.5, 0.5, 0.49], step: [0.3, 0.295, 0.285], doorFrame: [0.55, 0.55, 0.53], band: [0.16, 0.135, 0.11]
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A quad of the trim facing away from `centre` (its corners turned round if they face it) */
function quadOut(B, pts, centre, colour) {
  const [a, b, c, d] = pts;
  const n = cross(sub(b, a), sub(d, a)), m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  B.quad('trim', ...(dot(n, sub(m, centre)) >= 0 ? [a, b, c, d] : [a, d, c, b]), undefined, { colour });
}
// The highest ground along a wall, half a metre out of it (from s0 to s1)
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}
const insideHouse = (h, x, z) => h.parts.some((p) => pointInRing(p.ring, x, z));

/**
 * One wall: from y0 up to its profile, in bands: closed under its lowest windows, the windows' band up to the last
 * storey under its eaves, closed over it (a gable, a turret); the look's ground floor band in its own colour; the shop
 * fronts' stretches closed up to the floors' grid's origin (their glazing is geometry). Returns its measures.
 */
function wallOf(W, h, F, prof, y0, { upper = false, shops = [] } = {}) {
  const look = lookOf(h);
  const tops = prof.map((p) => p[1]), minTop = Math.min(...tops), maxTop = Math.max(...tops);
  // the lowest storey whose windows clear the ground by 0.15 m (or the lower roof the wall stands on)
  const g = upper ? y0 + 0.3 : groundAlong(F);
  let win0 = look.floor0 - 12 * look.storey;
  while (win0 + look.lo < g + 0.15) win0 += look.storey;
  // the windows' band ends at the eaves: on a storey's line, or over a storey whose windows fit under them
  const k = Math.floor((minTop - look.floor0) / look.storey), gl = look.floor0 + k * look.storey;
  const openTop = minTop - gl >= look.hi + 0.3 ? minTop - 0.02 : gl;
  const windows = F.len >= 2.2 && openTop > win0 + look.hi;
  const bandTop = look.band ? look.band.top : -Infinity;
  const mid = F.len / 2, half = F.len / 2;
  // (the profile cut where the shop fronts start and end)
  const cuts = new Set(prof.map((p) => p[0]));
  for (const [a, b] of shops) { cuts.add(a); cuts.add(b); }
  const S = [...cuts].filter((s) => s >= 0 && s <= F.len).sort((a, b) => a - b);
  for (let i = 0; i + 1 < S.length; i++) {
    const s0 = S[i], s1 = S[i + 1];
    if (s1 - s0 < 1e-4) continue;
    const ya = profileAt(prof, s0), yb = profileAt(prof, s1);
    const shop = shops.some(([a, b]) => s0 >= a - 1e-6 && s1 <= b + 1e-6);
    const w0 = shop ? Math.max(win0, look.floor0) : win0;
    const ys = [...new Set([y0, w0, openTop, bandTop].filter((y) => y > y0 && y < Math.max(ya, yb)))].sort((p, q) => p - q);
    const levels = [y0, ...ys, Infinity];
    for (let j = 0; j + 1 < levels.length; j++) {
      const lo = levels[j], hi = levels[j + 1];
      const la = Math.min(lo, ya), lb = Math.min(lo, yb), ha = Math.min(hi, ya), hb = Math.min(hi, yb);
      if (Math.max(ha - la, hb - lb) < 0.005) continue;
      const open = windows && lo >= w0 - 1e-6 && hi <= openTop + 1e-6;
      const colour = hi <= bandTop + 1e-6 ? look.band.colour : look.colour;
      W.quad(F, s0, s1, la, lb, ha, hb, look, { mid, half, open, colour });
    }
  }
  return { minTop, maxTop, win0, openTop, windows };
}

// A plinth of grey render along a wall's foot, a little over the ground (where no other part of the house stands)
function plinth(B, h, F, y0) {
  const n = Math.max(1, Math.ceil(F.len / 1.5));
  for (let k = 0; k < n; k++) {
    const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
    const [mx, mz] = onWall(F, (a + b) / 2, 0.3);
    if (insideHouse(h, mx, mz)) continue;
    const ga = groundHeight(...onWall(F, a, 0.3)) + 0.3, gb = groundHeight(...onWall(F, b, 0.3)) + 0.3;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('trim', P(a, y0), P(b, y0), P(b, Math.max(gb, y0 + 0.2)), P(a, Math.max(ga, y0 + 0.2)), undefined, { colour: C.plinth });
  }
}

const isFlat = (t) => {
  const n = cross(sub([t[3], t[4], t[5]], [t[0], t[1], t[2]]), sub([t[6], t[7], t[8]], [t[0], t[1], t[2]]));
  return Math.abs(n[1]) / Math.hypot(...n) > 0.985;
};

// The roofs: the surveyed triangles facing up (the flat ones on their own mesh), an underside under each; along their
// free edges a cornice in the look's colour (a deep dark parapet on the Wildman, deep eaves on the taupe house), a
// fascia board on the pitched ones
function buildRoofs(B, h) {
  const look = lookOf(h), [fasciaC, depth] = look.fascia;
  for (const part of h.parts) {
    for (const t of part.roof) {
      let a = [t[0], t[1], t[2]], b = [t[3], t[4], t[5]], c = [t[6], t[7], t[8]];
      if (cross(sub(b, a), sub(c, a))[1] < 0) [b, c] = [c, b];
      const flat = isFlat(t);
      B.tri(flat ? 'flat' : 'roof', a, b, c, [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]]);
      B.tri('trim', ...[a, c, b].map((p) => [p[0], p[1] - (flat ? 0.2 : 0.07), p[2]]), undefined, { colour: C.soffit });
      // the free edges: one side of them not covered by this part's roof (or by one more than 0.3 m lower)
      const P = [a, b, c];
      for (let i = 0; i < 3; i++) {
        const p = P[i], q = P[(i + 1) % 3];
        const dx = q[0] - p[0], dz = q[2] - p[2], L = Math.hypot(dx, dz);
        if (L < 0.25) continue;
        let o = [-dz / L, dx / L];
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
        const side = (sgn) => { const ys = roofHeights(part.roof, m[0] + o[0] * 0.08 * sgn, m[2] + o[1] * 0.08 * sgn); return ys.length ? Math.max(...ys) : -Infinity; };
        const hp = side(1), hm = side(-1);
        let out;
        if (hp < m[1] - 0.3 && hm >= m[1] - 0.3) out = 1;
        else if (hm < m[1] - 0.3 && hp >= m[1] - 0.3) out = -1;
        else continue;
        o = [o[0] * out, o[1] * out];
        const centre = [m[0] - o[0], m[1], m[2] - o[1]];
        const off = (r, dy, e = 0.02) => [r[0] + o[0] * e, r[1] + dy, r[2] + o[1] * e];
        if (flat) {
          // (a cornice proud of the wall, and its top)
          quadOut(B, [off(p, -depth, 0.05), off(q, -depth, 0.05), off(q, 0.1, 0.05), off(p, 0.1, 0.05)], centre, fasciaC);
          quadOut(B, [off(p, 0.1, 0.05), off(q, 0.1, 0.05), off(q, 0.1, -0.25), off(p, 0.1, -0.25)], [m[0], -50, m[2]], fasciaC);
          continue;
        }
        quadOut(B, [off(p, 0.03), off(q, 0.03), off(q, -0.22), off(p, -0.22)], centre, C.fascia);
      }
    }
  }
}

// A shop front: glazing in panels on a wall from s0 to s1 up to `top` (a fascia over it), mullions between them, a kick
// plate under them; a canopy slab over it; the lettering on the fascia
function shopFront(B, F, s0, s1, top, base, { fascia = 0.7, canopy = 0, signs = [] } = {}) {
  const n = Math.max(1, Math.round((s1 - s0) / 2.4)), w = (s1 - s0) / n, yt = top - fascia;
  const P = (s, y, o = 0.03) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  for (let k = 0; k < n; k++) {
    const a = s0 + k * w, b = a + w;
    const yb = groundAlong(F, a, b) + 0.15;
    if (yt - yb < 1.2) continue;
    B.quad('glass', P(a + 0.05, yb), P(b - 0.05, yb), P(b - 0.05, yt), P(a + 0.05, yt));
    B.box('trim', F, a + 0.02, b - 0.02, 0, 0.08, base, yb, C.kick);
    B.box('trim', F, a - 0.06, a + 0.06, 0, 0.1, yb, yt, C.shopFrame);
  }
  B.box('trim', F, s1 - 0.06, s1 + 0.06, 0, 0.1, base, yt, C.shopFrame);
  B.box('trim', F, s0 - 0.05, s1 + 0.05, 0, 0.12, yt, top, C.fascia);
  if (canopy > 0) B.box('trim', F, s0 - 0.1, s1 + 0.1, 0, canopy, top + 0.02, top + 0.26, C.canopy);
  for (const sg of signs) {
    const [, , aw, ah] = ATLAS[sg.key];
    const hh = Math.min(fascia - 0.1, sg.w * (ah / aw)), ww = hh * (aw / ah), yc = (yt + top) / 2;
    const want = sg.near ? (sg.near[0] - F.a[0]) * F.u[0] + (sg.near[1] - F.a[1]) * F.u[1] : (s0 + s1) / 2;
    const at = Math.min(Math.max(want, s0 + ww / 2 + 0.2), s1 - ww / 2 - 0.2);
    B.decal(F, at - ww / 2, at + ww / 2, 0.14, yc - hh / 2, yc + hh / 2, sg.key);
  }
}

// A door on a wall (s its middle): the atlas' door in a frame (or in its carved surround), a step before it
function door(B, F, s, base, carved = false) {
  const g = groundAlong(F, s - 0.9, s + 0.9), y0 = g + 0.12;
  if (carved) {
    B.decal(F, s - 0.75, s + 0.75, 0.04, y0, y0 + 3.0, 'carved');
  } else {
    const y1 = y0 + 2.2;
    B.box('trim', F, s - 0.65, s + 0.65, 0, 0.06, y0, y1 + 0.12, C.doorFrame);
    B.decal(F, s - 0.55, s + 0.55, 0.07, y0, y1, 'door');
  }
  B.box('trim', F, s - 0.9, s + 0.9, 0, 0.5, base, y0, C.step);
}

// A house: its walls (on the ground and on lower roofs), the plinths, its roofs; the taupe house's frieze and band
function buildHouse(W, B, h) {
  const look = lookOf(h);
  const roof = h.parts.flatMap((p) => p.roof);
  const shopsOn = (F) => SHOPFRONTS.filter((S) => S.house === h.osm).map(shopWall).filter((w) => w && w.F.a[0] === F.a[0] && w.F.a[1] === F.a[1] && Math.abs(w.F.len - F.len) < 1e-6).map((w) => [w.s0, w.s1]);
  const walls = outerWalls(h).map((w) => ({ ...w, prof: wallProfile(w.part.roof, w.F) }));
  const info = [];
  for (const w of walls) {
    let gMin = Infinity;
    for (let k = 0; k <= 8; k++) gMin = Math.min(gMin, groundHeight(...onWall(w.F, (w.F.len * k) / 8, 0.3)));
    const y0 = Math.min(gMin, ...h.parts.map((p) => Math.min(...p.ring.map(([x, z]) => groundHeight(x, z))))) - 0.6;
    const r = wallOf(W, h, w.F, w.prof, y0, { shops: shopsOn(w.F) });
    const free = !h.parts.some((p, pi) => pi !== w.pi && pointInRing(p.ring, ...onWall(w.F, w.F.len / 2, 0.3)));
    info.push({ ...w, ...r, y0, free });
    if (free) plinth(B, h, w.F, y0);
  }
  for (const u of upperWalls(h)) {
    const prof = wallProfile(roof, u.F, (ys) => { const a = ys.filter((y) => y > u.bottom + 0.3); return a.length ? Math.min(...a) : null; });
    wallOf(W, h, u.F, prof, u.bottom - 0.05, { upper: true });
  }
  buildRoofs(B, h);
  if (h.frieze) {
    // the running-dog frieze under the eaves and the dark band over the first floor, on every free wall
    for (const w of info) {
      if (!w.free || w.F.len < 3) continue;
      const top = w.minTop - look.fascia[1] - 0.05, n = Math.max(1, Math.round(w.F.len / 6.4)), tw = w.F.len / n;
      for (let i = 0; i < n; i++) B.decal(w.F, i * tw, (i + 1) * tw, 0.02, top - 0.6, top, 'frieze');
      const yb = look.floor0 + look.storey - 0.12;
      B.box('trim', w.F, 0, w.F.len, 0, 0.06, yb, yb + 0.22, C.band);
    }
  }
  return info;
}

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // on the Promenade at the Reginaweg corner, south-west towards Gourmet Käch (the 2014 photographs' way)
  reginaweg: [371, 2.9, -707, 335, 8, -662],
  // on the Promenade by the Denner block, south-west to the Villa Silvana and the taupe corner house
  villa: [388, 3.7, -726, 352, 12, -700],
  // on the Promenade at the bend, north-east past mark & händle to the anthracite block and the Green Wildman
  escher: [440, 5.1, -763, 462, 10, -810]
};

/**
 * Builds the row into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand on the
 * surveyed outlines, js/landmarks.js; the canopies hang from the walls, the doors' steps stand within 0.5 m of them).
 */
export function buildPromenadeMitte2(scene) {
  const root = new THREE.Group();
  root.name = 'Promenade Mitte 2';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'none', name: 'Promenade Mitte 2' }), M = materials();
  const W = new Walls();
  const walls = new Map();
  for (const h of HOUSES) walls.set(h, buildHouse(W, B, h));
  // the shop fronts
  for (const S of SHOPFRONTS) {
    const sw = shopWall(S);
    if (!sw) continue;
    const { F, s0, s1 } = sw;
    const top = groundAlong(F, s0, s1) + S.h;
    const base = Math.min(groundHeight(...onWall(F, s0)), groundHeight(...onWall(F, s1))) - 0.7;
    shopFront(B, F, s0 + 0.15, s1 - 0.15, top, base, { fascia: S.signs?.some((g) => g.key === 'escher') ? 0.95 : 0.7, canopy: S.canopy, signs: S.signs || [] });
  }
  // the doors and the boards
  for (const d of DOORS) {
    const h = houseOf(d.house), w = nearestWall(h, d.at);
    if (!w) continue;
    const s = Math.min(Math.max(w.s, 0.95), w.F.len - 0.95);
    const info = walls.get(h).find((q) => q.F.a[0] === w.F.a[0] && q.F.a[1] === w.F.a[1]);
    door(B, w.F, s, info ? info.y0 : groundHeight(...onWall(w.F, s)) - 0.6, d.carved);
  }
  for (const b of BOARDS) {
    const w = nearestWall(houseOf(b.house), b.near);
    const [, , aw, ah] = ATLAS[b.key], hh = (b.w * ah) / aw;
    const s = Math.min(Math.max(w.s, b.w / 2 + 0.2), w.F.len - b.w / 2 - 0.2), y = groundAlong(w.F, s - b.w / 2, s + b.w / 2) + b.y;
    B.decal(w.F, s - b.w / 2, s + b.w / 2, 0.04, y, y + hh, b.key);
  }
  M.decal = decalMaterial(atlasTexture());
  root.add(W.mesh(M.walls, 'Promenade Mitte 2'), ...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
