import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, worldNoise } from './building-kit.js';
import {
  ATLAS, ATLAS_SIZE, EXCLUDE, HOUSES, LOOKS, SHOPFRONTS, SHOP_NODES, at350, bandRing, gableFrame, groundOutlines, houseOf,
  local350, lookOf, onWall, outerFrame, outwardRing, partOf, partRing, partTopAt, pointInRing, saddleY, wallFrame
} from './promenade-mitte-data.js';

export { HOUSES, ATLAS, ATLAS_SIZE };

// The houses along the Promenade between Platz and Dorf rebuilt by hand (js/promenade-mitte-data.js), standing in for
// their swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows: the
// white block with its ribbon windows and timber sliding shutters at the west end, the salmon-pink house with its tall
// windows in white surrounds and its deep cornice, the cream shops before it (Vreni's Teekanne) and the white house
// west of it under its shallow saddle roof, the twin tan blocks with roller blinds over the shops' glazed band and their
// attics under deep flat roofs (Orange Davos, Denner), the pale blue house at the bend with its steep gables, cross
// gables, dormers and shutters (Marionnaud). The windows are drawn by the walls' material from its uv (metres along a
// wall from its middle, storeys up the house's floors' grid) and the house's look, which every vertex carries
// (aWin, aWin2, aFrame, its colour): one walls mesh for the whole row. Six meshes: the walls, the pitched roofs, the flat
// roofs, the trim (one vertex-coloured mesh), the shops' glass and the lettering and doors (one canvas atlas).

excludeBuildings(EXCLUDE);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js)
for (const h of HOUSES) SURVEYED_FOOTPRINTS.set(h.osm, groundOutlines(h.osm));
// (the shops' own lettering instead of js/shops.js' generic signs)
for (const n of SHOP_NODES) SHOP_EXCLUSIONS.add(n);

const CLOSED_V = -1000; // v of a wall without windows

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
    // (the mobile profile: each house's colour from its vertices, a lit band per floor at night; v counts storeys,
    // js/landmark-buildings.js SIMPLE_SKINS)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], 1, 0.3, 0.78, 0.9, 0.3);
    M.walls.vertexColors = true;
    return M;
  }
  M.walls = wallMaterial();
  return M;
}

// A soft-edged rectangle of nodes: |x| < hw, lo < y < hi
const rect = (x, y, hw, lo, hi, e = 0.012) => smoothstep(hw.add(e), hw.sub(e), abs(x)).mul(smoothstep(lo.sub(e), lo.add(e), y)).mul(smoothstep(hi.add(e), hi.sub(e), y));

// The walls of the whole row: each vertex carries its house's look (aWin: storey, bay, window's half width, style;
// aWin2: the window's foot and head over its storey's foot, a seed; aFrame: the frames' colour; color: the render)
function wallMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const A = attribute('aWin', 'vec4'), A2 = attribute('aWin2', 'vec4'), FR = attribute('aFrame', 'vec3'), COL = attribute('color', 'vec3');
  const STOREY = A.x, BAY = A.y, WH = A.z, STYLE = A.w, LO = A2.x, HI = A2.y, SEED = A2.z;
  const U = uv().x, V = uv().y, half = attribute('aHalf', 'float');
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  const openV = step(0, V);
  const st = floor(V), fv = V.sub(st).mul(STOREY);
  const bay = floor(U.div(BAY).add(0.5)), bu = U.sub(bay.mul(BAY));
  const ribbon = step(1.5, STYLE).mul(step(STYLE, 2.5));
  const style3 = step(2.5, STYLE).mul(step(STYLE, 3.5)), style4 = step(3.5, STYLE);
  const surrounded = step(STYLE, 1.5).add(style3);
  // the punched windows: one per bay where it fits in the wall
  const openP = step(abs(bay.mul(BAY)).add(WH).add(0.4), half).mul(openV).mul(step(0.5, STYLE)).mul(float(1).sub(ribbon));
  const win = rect(bu, fv, WH, LO, HI).mul(openP);
  const mid = LO.add(HI.sub(LO).mul(0.72));
  const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.03, 0.018, abs(fv.sub(mid))));
  const pane = rect(bu, fv, WH.sub(0.07), LO.add(0.07), HI.sub(0.07)).mul(float(1).sub(bars.mul(fine))).mul(openP);
  const surround = rect(bu, fv, WH.add(0.15), LO.sub(0.15), HI.add(0.15)).mul(openP).mul(surrounded).sub(win).max(0);
  const sill = rect(bu, fv, WH.add(0.1), LO.sub(0.1), LO).mul(openP).mul(near);
  const id = hash(bay.mul(37.7).add(st.mul(91.3)).add(half.mul(13.1)).add(SEED));
  // roller blinds (style 4): drawn down some way in most windows, their boxes over them
  const drawn = step(0.35, id).mul(mix(float(0.25), float(0.95), hash(id.mul(71.3))));
  const blind = step(HI.sub(0.07).sub(drawn.mul(HI.sub(LO).sub(0.14))), fv).mul(pane).mul(style4).mul(near);
  const blindBox = rect(bu, fv, WH.add(0.04), HI, HI.add(0.24)).mul(openP).mul(style4);
  // shutters each side (style 3)
  const shutter = rect(abs(bu).sub(WH.mul(1.5).add(0.06)), fv, WH.mul(0.5), LO, HI).mul(openP).mul(style3).mul(step(abs(bay.mul(BAY)).add(WH.mul(2)).add(0.5), half));
  // a curtain drawn in some windows (styles 1 and 3)
  const curtain = step(0.7, id).mul(step(HI.sub(0.07).sub(HI.sub(LO).mul(0.35)), fv)).mul(pane).mul(float(1).sub(style4)).mul(near);
  // the ribbon windows (style 2): a band along the wall but its ends, mullions every bay, timber sliding shutters
  // drawn over some panes
  const openR = step(2.6, half).mul(openV).mul(ribbon);
  const winR = rect(U, fv, half.sub(0.9), LO, HI).mul(openR);
  const post = smoothstep(BAY.mul(0.5).sub(0.06), BAY.mul(0.5).sub(0.03), abs(bu)).max(smoothstep(0.03, 0.015, abs(fv.sub(LO.add(0.08)))));
  const paneR = winR.mul(float(1).sub(post.mul(fine).max(post.mul(0.6))));
  const slide = step(0.45, id).mul(paneR);
  const batten = smoothstep(0.3, 0.5, abs(bu.mul(14).fract().sub(0.5)).mul(2)).mul(fine).mul(0.25);
  const timberC = vec3(0.34, 0.22, 0.12).mul(hash(bay.mul(3.1).add(st)).mul(0.25).add(0.85)).mul(float(1).sub(batten));
  // the render: its colour, weathered
  const render = COL.mul(mix(float(0.94), float(1.04), worldNoise(0.35)));
  const glassC = mix(vec3(0.02, 0.025, 0.03), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
  let c = render;
  c = mix(c, COL.mul(0.4).add(0.36), surround);
  c = mix(c, vec3(0.42, 0.41, 0.39), sill);
  c = mix(c, vec3(0.44, 0.43, 0.41), blindBox);
  c = mix(c, vec3(0.17, 0.21, 0.19), shutter);
  c = mix(c, FR, win.max(winR));
  c = mix(c, glassC, pane.max(paneR));
  c = mix(c, vec3(0.5, 0.48, 0.44), blind);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  c = mix(c, timberC, slide);
  m.colorNode = c;
  const shiny = pane.max(paneR).mul(float(1).sub(blind)).mul(float(1).sub(curtain)).mul(float(1).sub(slide));
  m.roughnessNode = mix(float(0.9), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (houses of flats: a window lit here and there in the evening, fewer towards midnight)
  const lit = litWindow(bay, st.add(half.mul(3.3)), SEED, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) });
  m.emissiveNode = lit.mul(pane.max(paneR)).mul(float(1).sub(blind)).mul(mix(float(1), float(0.5), curtain.max(slide))).mul(glow.mul(1.1));
  return m;
}

// --- The lettering and the doors: one canvas atlas ---------------------------------------------------------------------
function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  const letters = (text, w, h, { colour, font, weight = 800, scale = 0.62, spacing = 0 }) => {
    g.fillStyle = colour;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${weight} ${Math.round(h * scale)}px ${font}`;
    if ('letterSpacing' in g && spacing) g.letterSpacing = `${spacing}px`;
    g.fillText(text, w / 2, h / 2 + h * 0.04, w * 0.92);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  };
  const sans = 'Inter, "Helvetica Neue", Arial, sans-serif', serif = 'Georgia, "Times New Roman", serif';
  // DENNER: white on red, in a white rim
  cell('denner', (w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8111b'; g.fillRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.4, h * 0.32, 0, 0, Math.PI * 2); g.fill();
    letters('DENNER', w, h, { colour: '#d8111b', font: sans, weight: 900, scale: 0.42, spacing: 3 });
  });
  // Orange Davos: white on orange
  cell('orange', (w, h) => {
    g.fillStyle = '#e8641b'; g.fillRect(0, 0, w, h);
    letters('ORANGE', w, h, { colour: '#ffffff', font: sans, weight: 800, scale: 0.5, spacing: 2 });
  });
  // MARIONNAUD: white serif capitals on black
  cell('marionnaud', (w, h) => {
    g.fillStyle = '#121212'; g.fillRect(0, 0, w, h);
    letters('MARIONNAUD', w, h, { colour: '#f4f1ea', font: serif, weight: 500, scale: 0.52, spacing: 4 });
  });
  // Vreni's Teekanne: a white board in a green rim, the name over a teapot
  cell('vreni', (w, h) => {
    g.fillStyle = '#3c6b3a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f6f4ee'; g.fillRect(7, 7, w - 14, h - 14);
    g.fillStyle = '#2c4f2b';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `italic 700 ${Math.round(h * 0.15)}px ${serif}`;
    g.fillText("Vreni's", w / 2, h * 0.17, w * 0.85);
    g.font = `600 ${Math.round(h * 0.1)}px ${serif}`;
    g.fillText('Teekanne Davos', w / 2, h * 0.32, w * 0.86);
    // the teapot: its body, lid, spout and handle
    g.fillStyle = '#3c6b3a';
    g.beginPath(); g.ellipse(w * 0.5, h * 0.66, w * 0.2, h * 0.13, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(w * 0.44, h * 0.48, w * 0.12, h * 0.06);
    g.beginPath(); g.moveTo(w * 0.68, h * 0.66); g.lineTo(w * 0.86, h * 0.52); g.lineTo(w * 0.86, h * 0.56); g.lineTo(w * 0.7, h * 0.72); g.fill();
    g.lineWidth = w * 0.035; g.strokeStyle = '#3c6b3a';
    g.beginPath(); g.ellipse(w * 0.28, h * 0.66, w * 0.07, h * 0.08, 0, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
    g.font = `500 ${Math.round(h * 0.08)}px ${serif}`; g.fillStyle = '#2c4f2b';
    g.fillText('Speciality Tea', w / 2, h * 0.88, w * 0.85);
  });
  // a house door: a dark frame, a glass leaf with a bar across, a handle
  cell('door', (w, h) => {
    g.fillStyle = '#2a2724'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b2329'; g.fillRect(w * 0.14, h * 0.06, w * 0.72, h * 0.9);
    g.fillStyle = '#3b4a54'; g.fillRect(w * 0.18, h * 0.09, w * 0.64, h * 0.4);
    g.fillStyle = '#56544f'; g.fillRect(w * 0.14, h * 0.52, w * 0.72, h * 0.04);
    g.fillStyle = '#b9b4a8'; g.fillRect(w * 0.7, h * 0.56, w * 0.08, h * 0.03);
  });
  // the green-and-white awning's stripes
  cell('awning', (w, h) => {
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f2f0ea' : '#2f6b3f'; g.fillRect((i * w) / 16, 0, w / 16 + 1, h * 0.82); }
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#f2f0ea' : '#2f6b3f';
      g.beginPath(); g.moveTo((i * w) / 16, h * 0.8); g.lineTo(((i + 1) * w) / 16, h * 0.8); g.lineTo(((i + 0.5) * w) / 16, h); g.fill();
    }
  });
  return canvasTexture(canvas);
}

// --- The walls' collector: one mesh for the row, each vertex its look -------------------------------------------------------
class Walls {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.half = []; this.col = []; this.win = []; this.win2 = []; this.frame = []; }
  /** A polygon on a wall (pts [s, y], counter-clockwise seen from outside), `mid` the bays' middle, `half` the windows'
   *  stretch, `open` whether it carries windows */
  poly(F, pts, look, mid, half, open) {
    if (pts.length < 3) return;
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    const v = (y) => (open ? (y - look.floor0) / look.storey : CLOSED_V);
    for (let i = 1; i + 1 < pts.length; i++) {
      for (const [s, y] of [pts[0], pts[i], pts[i + 1]]) {
        this.pos.push(...P(s, y)); this.nrm.push(F.n[0], 0, F.n[1]); this.uv.push(s - mid, v(y)); this.half.push(open ? half : 0);
        this.col.push(...look.colour); this.win.push(look.storey, look.bay, look.half, look.style);
        this.win2.push(look.lo, look.hi, look.seed, 0); this.frame.push(...look.frame);
      }
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

// The part of a polygon ([s, y]) under the line y = tA + (s − s0)·(tB − tA)/(s1 − s0)
function clipUnder(poly, s0, s1, tA, tB) {
  const T = (s) => tA + ((s - s0) * (tB - tA)) / (s1 - s0 || 1);
  const f = ([s, y]) => y - T(s);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
    if (fp <= 1e-6) out.push(p);
    if ((fp < -1e-6 && fq > 1e-6) || (fp > 1e-6 && fq < -1e-6)) { const k = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
  }
  return out;
}

// The foot of the lowest storey (from the look's floor0 up) whose windows clear `y` by 0.15 m
function firstFoot(look, y) {
  let f = look.floor0;
  if (f + look.lo < y + 0.15) f += Math.ceil((y + 0.15 - look.lo - f) / look.storey) * look.storey;
  return f;
}
// The foot of the lowest storey at or over `y`
const footAtLeast = (look, y) => look.floor0 + Math.max(0, Math.ceil((y - look.floor0) / look.storey - 1e-9)) * look.storey;
// The highest ground along a wall from s0 to s1, half a metre out of it
function groundAlong(F, s0, s1) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}

/**
 * A run of wall from s0 to s1: from `yb` up to its top (tA at s0, tB at s1), closed under `from`, a band per storey from
 * there on (windows where they fit under the top: `mid` the bays' middle, `half` the wall's windows' stretch, narrowed
 * under a sloping top), closed over `to`
 */
function wallRun(W, F, s0, s1, yb, tA, tB, look, { mid, half, from, to }) {
  const tMax = Math.max(tA, tB), tMin = Math.min(tA, tB);
  if (tMax - yb < 0.01 || s1 - s0 < 0.01) return;
  const piece = (lo, hi, open, h = half) => {
    if (hi - lo < 0.005) return;
    const pts = clipUnder([[s0, lo], [s1, lo], [s1, hi], [s0, hi]], s0, s1, tA, tB);
    W.poly(F, pts, look, mid, h, open);
  };
  const k = (tMax - tMin) / (s1 - s0);
  let y = yb;
  const f0 = Math.max(from, yb);
  if (f0 > y) { piece(y, Math.min(f0, tMax), false); y = f0; }
  // (the storeys from `from` on: a band each)
  let f = from;
  while (f < yb - 1e-6) f += look.storey;
  if (f > y + 1e-6) { piece(y, Math.min(f, tMax), false); y = f; }
  while (y < Math.min(to, tMax) - 1e-6) {
    const hi = Math.min(y + look.storey, to, tMax);
    const head = y + look.hi + 0.25;
    let h = half;
    if (k > 1e-4) h = Math.min(half, (tMax - head) / k + 0.4);
    const fits = head <= tMax && (k > 1e-4 ? h > look.half + 0.4 : head <= tMin + 1e-6);
    piece(y, hi, fits, h);
    y = hi;
  }
  if (tMax > y + 1e-6) piece(y, tMax, false);
}

// --- Building the row ---------------------------------------------------------------------------------------------------
const C = {
  plinth: [0.2, 0.195, 0.19], coping: [0.46, 0.45, 0.43], cornice: [0.55, 0.54, 0.51], tanCornice: [0.3, 0.27, 0.23],
  soffit: [0.32, 0.31, 0.29], fascia: [0.2, 0.2, 0.2], timber: [0.16, 0.085, 0.045], shopFrame: [0.06, 0.06, 0.065],
  kick: [0.12, 0.12, 0.125], canopy: [0.5, 0.5, 0.49], chimney: [0.4, 0.39, 0.37], cap: [0.13, 0.13, 0.13],
  dormerFrame: [0.62, 0.62, 0.6], pane: [0.03, 0.035, 0.04], step: [0.3, 0.295, 0.285]
};

// Every part of the row with its house (the shops' bands as parts of their own)
function allParts() {
  const out = [];
  for (const h of HOUSES) {
    for (const p of h.parts) out.push({ h, p });
    const band = bandRing(h);
    if (band) out.push({ h, p: { id: 'band', ring: band.ring, top: h.band.top, cornice: [0.3, 0.35], shop: true, band: true } });
  }
  return out;
}
// How high another part stands before a point (its top; a gable part its eaves; parts off the ground cover only from
// their base, and only parts off the ground)
function coverAt(parts, self, x, z) {
  let c = -Infinity;
  for (const q of parts) {
    if (q === self) continue;
    const ring = partRing(q.p);
    if (!pointInRing(ring, x, z)) continue;
    const elevated = q.p.base !== undefined;
    if (elevated && self.p.base === undefined) continue;
    c = Math.max(c, q.p.gable ? q.p.gable.eave : q.p.top);
  }
  return c;
}
// Where the top of a part's wall bends along it (s along F): over a gable's ridge, the saddle's ridge and edges
function bends(p, F) {
  const out = [];
  const cross = (fa, fb) => { if (fa * fb < 0) out.push((fa / (fa - fb)) * F.len); };
  const [ax, az] = F.a, [bx, bz] = onWall(F, F.len);
  if (p.gable) {
    const G = gableFrame(p.gable), c = (x, z) => (x - G.o[0]) * G.n[0] + (z - G.o[1]) * G.n[1];
    cross(c(ax, az), c(bx, bz));
  }
  if (p.roof) {
    const R = p.roof;
    for (const x of [R.x0, R.ridgeX, R.x1]) cross(ax - x, bx - x);
    for (const z of [R.z0, R.z1]) cross(az - z, bz - z);
  }
  return out.sort((a, b) => a - b);
}

/** A part's walls: each wall split where another part stands before it (from that one's top up) and where its top bends */
function buildPartWalls(W, B, parts, item, shopWalls) {
  const { h, p } = item;
  const look = lookOf(h, p);
  const R = outwardRing(partRing(p));
  const ground = p.base === undefined;
  const base = ground ? Math.min(...R.map(([x, z]) => groundHeight(x, z))) - 0.7 : p.base;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.2) continue;
    // (the cover along the wall, every half metre)
    const n = Math.max(1, Math.round(F.len / 0.5)), step = F.len / n;
    const cov = [];
    for (let k = 0; k < n; k++) cov.push(coverAt(parts, item, ...onWall(F, (k + 0.5) * step, 0.3)));
    const topAt = (s) => partTopAt(p, ...onWall(F, s, -0.02)) - 0.05;
    const tMaxWall = Math.max(topAt(0), topAt(F.len), ...bends(p, F).map(topAt));
    // the windows: from the lowest storey clearing the ground (or the shop under them) to the last one under the top
    const shop = p.shop || shopWalls.some((sw) => sw.p === p && sameWall(sw.F, F));
    let from = ground ? firstFoot(look, groundAlong(F, 0, F.len)) : firstFoot(look, base);
    if (shop) from = Math.max(from, p.band ? Infinity : footAtLeast(look, shopTopOf(shopWalls, p, F) - 0.3));
    const topFlat = p.gable ? p.gable.eave : p.top;
    let to = look.floor0;
    while (to + look.hi + 0.3 <= topFlat) to += look.storey;
    to = Math.min(to, topFlat);
    if (p.gable) to = Math.max(to, tMaxWall);
    // (the gable ends: the bays from the ridge's middle; other walls from their middle)
    const bs = bends(p, F);
    const mid = p.gable && bs.length ? bs[0] : F.len / 2;
    const half = p.gable && bs.length ? Math.min(bs[0], F.len - bs[0]) : F.len / 2;
    // the runs of equal cover, cut at the bends
    let k = 0;
    while (k < n) {
      let j = k;
      while (j + 1 < n && cov[j + 1] === cov[k]) j++;
      const r0 = k * step, r1 = (j + 1) * step, cv = cov[k];
      const yb = Math.max(base, cv - 0.02);
      const cuts = [r0, ...bs.filter((s) => s > r0 + 1e-6 && s < r1 - 1e-6), r1];
      for (let q = 0; q + 1 < cuts.length; q++) {
        const a = cuts[q], b = cuts[q + 1];
        if (topAt(a) > yb + 0.01 || topAt(b) > yb + 0.01) wallRun(W, F, a, b, yb, topAt(a), topAt(b), look, { mid, half, from, to });
      }
      if (ground && cv === -Infinity) plinth(B, F, r0, r1, base);
      if (p.cornice && !p.gable && cv < p.top - p.cornice[1]) cornice(B, F, r0, r1, p, h, look);
      k = j + 1;
    }
  }
}
const sameWall = (A, F) => Math.abs(A.u[0] * F.u[0] + A.u[1] * F.u[1]) > 0.995 && Math.abs((F.a[0] - A.a[0]) * A.n[0] + (F.a[1] - A.a[1]) * A.n[1]) < 0.3;
const shopTopOf = (shopWalls, p, F) => Math.max(...shopWalls.filter((sw) => sw.p === p && sameWall(sw.F, F)).map((sw) => sw.top));

// A plinth of grey render along a wall's foot, a little over the ground
function plinth(B, F, s0, s1, base) {
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.0));
  for (let k = 0; k < n; k++) {
    const a = s0 + ((s1 - s0) * k) / n, b = s0 + ((s1 - s0) * (k + 1)) / n;
    const ga = groundHeight(...onWall(F, a, 0.3)) + 0.3, gb = groundHeight(...onWall(F, b, 0.3)) + 0.3;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('trim', P(a, base), P(b, base), P(b, Math.max(gb, base + 0.2)), P(a, Math.max(ga, base + 0.2)), undefined, { colour: C.plinth });
  }
}
// The cornice (or an eaves slab) round a flat roof: `out` before the wall, `depth` high, at the top
function cornice(B, F, s0, s1, p, h, look) {
  const [out, depth] = p.cornice;
  const colour = p.timber ? C.timber : look === LOOKS.tan ? C.tanCornice : look === LOOKS.pink ? C.cornice : C.coping;
  B.box('trim', F, s0 - (s0 < 0.01 ? out : 0), s1 + (s1 > F.len - 0.01 ? out : 0), -0.05, out, p.top - depth, p.top + 0.06, colour, { top: 'trim' });
}

// A gable part's roof: its two planes over the eaves' and verges' overhang, the soffit under them, fascia boards along
// the eaves and up the verges, the ridge's cap
function buildGableRoof(B, g) {
  const G = gableFrame(g), k = (g.top - g.eave) / g.half, w = g.half + g.ov;
  const P = (t, c, dy = 0) => [G.o[0] + G.u[0] * t + G.n[0] * c, g.top - Math.abs(c) * k + dy, G.o[1] + G.u[1] * t + G.n[1] * c];
  const t0 = -g.ovEnd, t1 = G.len + g.ovEnd;
  const mid = P(G.len / 2, 0), low = [mid[0], g.eave - 3, mid[2]], high = [mid[0], g.top + 30, mid[2]];
  const lo = (v, d = 0.28) => [v[0], v[1] - d, v[2]];
  for (const sgn of [-1, 1]) {
    const pts = [P(t0, 0), P(t1, 0), P(t1, sgn * w), P(t0, sgn * w)];
    quadUp(B, 'roof', pts);
    // the soffit, a hand under the roof, facing down
    quadOut(B, pts.map((q) => lo(q, 0.12)), high, C.soffit);
    // the fascia along the eaves, the verge boards up the ends
    const e0 = P(t0, sgn * w, 0.02), e1 = P(t1, sgn * w, 0.02);
    quadOut(B, [e0, e1, lo(e1), lo(e0)], low, C.fascia);
    for (const t of [t0, t1]) {
      const r = P(t, 0, 0.02), q = P(t, sgn * w, 0.02);
      quadOut(B, [r, q, lo(q), lo(r)], [mid[0], mid[1] - 1, mid[2]], C.fascia);
    }
  }
  // the ridge's cap
  for (const sgn of [-1, 1]) quadUp(B, 'trim', [P(t0, 0, 0.05), P(t1, 0, 0.05), P(t1, sgn * 0.18, 0.05), P(t0, sgn * 0.18, 0.05)], ROOF.map((v) => v * 0.8));
}
// A quad of the trim facing away from `centre` (its corners turned round if they face it)
function quadOut(B, [a, b, c, d], centre, colour) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = [(a[0] + c[0]) / 2 - centre[0], (a[1] + c[1]) / 2 - centre[1], (a[2] + c[2]) / 2 - centre[2]];
  B.quad('trim', ...(n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0 ? [a, b, c, d] : [a, d, c, b]), undefined, { colour });
}
// A quad facing up (its corners turned round if it faces down)
function quadUp(B, bucket, [a, b, c, d], colour = null) {
  const ux = b[0] - a[0], uz = b[2] - a[2], vx = d[0] - a[0], vz = d[2] - a[2];
  const ny = uz * vx - ux * vz;
  const pts = ny >= 0 ? [a, b, c, d] : [a, d, c, b];
  const uvs = pts.map((p) => [p[0], p[2]]);
  B.quad(bucket, ...pts, uvs, colour ? { colour } : {});
}

// w127653797's shallow saddle roof over its middle (its ridge along z), the soffit under it
function buildSaddle(B, R) {
  const P = (x, z, dy = 0) => [x, saddleY(R, x) + dy, z];
  for (const [x0, x1] of [[R.x0, R.ridgeX], [R.ridgeX, R.x1]]) {
    quadUp(B, 'roof', [P(x0, R.z0), P(x1, R.z0), P(x1, R.z1), P(x0, R.z1)]);
    quadOut(B, [P(x0, R.z0, -0.1), P(x0, R.z1, -0.1), P(x1, R.z1, -0.1), P(x1, R.z0, -0.1)], [x0, 60, R.z0], C.soffit);
  }
  for (const x of [R.x0, R.x1]) {
    const F = wallFrame(x === R.x0 ? [x, R.z1] : [x, R.z0], x === R.x0 ? [x, R.z0] : [x, R.z1]);
    B.box('trim', F, 0, F.len, 0, 0.04, R.eave - 0.25, R.eave + 0.02, C.fascia);
  }
}

// A shop front: glazing in panels on a wall from s0 to s1 up to `top` (a fascia over it), mullions between them, a kick
// plate under them; the lettering on the fascia
function shopFront(B, F, s0, s1, top, base, { fascia = 0.6, signs = [] } = {}) {
  const n = Math.max(1, Math.round((s1 - s0) / 2.4)), w = (s1 - s0) / n, yt = top - fascia;
  for (let k = 0; k < n; k++) {
    const a = s0 + k * w, b = a + w;
    const yb = groundAlong(F, a, b) + 0.15;
    if (yt - yb < 1.2) continue;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('glass', P(a + 0.05, yb), P(b - 0.05, yb), P(b - 0.05, yt), P(a + 0.05, yt));
    B.box('trim', F, a + 0.02, b - 0.02, 0, 0.08, base, yb, C.kick);
    B.box('trim', F, a - 0.06, a + 0.06, 0, 0.1, yb, yt, C.shopFrame);
  }
  B.box('trim', F, s1 - 0.06, s1 + 0.06, 0, 0.1, base, yt, C.shopFrame);
  B.box('trim', F, s0 - 0.05, s1 + 0.05, 0, 0.12, yt, top, C.fascia);
  for (const sg of signs) {
    const [, , aw, ah] = ATLAS[sg.key];
    const hh = sg.y ? sg.w * (ah / aw) : Math.min(fascia - 0.1, sg.w * (ah / aw));
    const ww = hh * (aw / ah), yc = sg.y ?? (yt + top) / 2;
    const want = sg.near ? (sg.near[0] - F.a[0]) * F.u[0] + (sg.near[1] - F.a[1]) * F.u[1] : (s0 + s1) / 2;
    const at = Math.min(Math.max(want, s0 + ww / 2 + 0.2), s1 - ww / 2 - 0.2);
    B.decal(F, at - ww / 2, at + ww / 2, 0.14, yc - hh / 2, yc + hh / 2, sg.key);
  }
}

// A door on a wall (s its middle): the atlas' door in a frame, a step before it
function door(B, F, s) {
  const g = groundAlong(F, s - 0.9, s + 0.9), y0 = g + 0.15, y1 = y0 + 2.2;
  B.box('trim', F, s - 0.65, s + 0.65, 0, 0.06, y0, y1 + 0.12, C.shopFrame);
  B.decal(F, s - 0.55, s + 0.55, 0.07, y0, y1, 'door');
  B.box('trim', F, s - 0.9, s + 0.9, 0, 0.5, g - 0.4, y0, C.step);
}

// A small dormer on w117012350's north-east slope: its front, cheeks and gabled roof, a window in its front
function dormer(W, B, { t, c }) {
  const mainG = HOUSES.find((h) => h.osm === 'w117012350').parts[0].gable;
  const roofAt = (cc) => mainG.top - (Math.abs(cc + 0.1) * (mainG.top - mainG.eave)) / mainG.half;
  const eave = roofAt(c) + 1.5, g = { ridge: [at350(t, c), at350(t, c - 2.6)], half: 0.85, eave, top: eave + 0.9, ov: 0.15, ovEnd: 0.2 };
  const look = { ...LOOKS.blue, style: 0 };
  const R = outwardRing([at350(t - 0.85, c), at350(t + 0.85, c), at350(t + 0.85, c - 2.6), at350(t - 0.85, c - 2.6)]);
  const base = roofAt(c) - 0.4;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    const part = { gable: g };
    const tA = partTopAt(part, ...onWall(F, 0, -0.02)) - 0.04, tB = partTopAt(part, ...onWall(F, F.len, -0.02)) - 0.04;
    const bs = bends(part, F);
    const cuts = [0, ...bs, F.len];
    for (let q = 0; q + 1 < cuts.length; q++) {
      const a = cuts[q], b = cuts[q + 1], ta = partTopAt(part, ...onWall(F, a, -0.02)) - 0.04, tb = partTopAt(part, ...onWall(F, b, -0.02)) - 0.04;
      wallRun(W, F, a, b, base, ta, tb, look, { mid: F.len / 2, half: 0, from: 1e9, to: 1e9 });
    }
    // (the front: its window)
    const [, cc] = local350(...onWall(F, F.len / 2, 0.5));
    if (cc > c && Math.min(tA, tB) > 0) {
      B.box('trim', F, F.len / 2 - 0.42, F.len / 2 + 0.42, 0, 0.05, eave - 1.25, eave - 0.1, C.dormerFrame);
      B.box('trim', F, F.len / 2 - 0.32, F.len / 2 + 0.32, 0.05, 0.07, eave - 1.15, eave - 0.2, C.pane);
    }
  }
  buildGableRoof(B, g);
}

// A chimney: grey render from under the roof to `top`, a dark cap
function chimney(B, x, z, top) {
  const F = wallFrame([x - 0.35, z - 0.35], [x + 0.35, z - 0.35]);
  B.box('trim', F, 0, 0.7, -0.7, 0, top - 4.0, top, C.chimney);
  B.box('trim', F, -0.08, 0.78, -0.78, 0.08, top, top + 0.12, C.cap);
}

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  west: [309, 1.5, -660, 266, 8, -622],
  pink: [338, 1.6, -683, 300, 8, -672],
  denner: [431, 3.6, -760, 405, 10, -718],
  bend: [490, 5.5, -830, 474, 18, -772]
};

/**
 * Builds the row into `scene`. Returns { group, colliders }: the shops' canopies' posts are none (the canopies hang
 * from the walls), so no colliders of its own (the player's walls stand on the surveyed outlines, js/landmarks.js).
 */
export function buildPromenadeMitte(scene) {
  const root = new THREE.Group();
  root.name = 'Promenade Mitte';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'none', name: 'Promenade Mitte' }), M = materials();
  const W = new Walls();
  const parts = allParts();
  // the shop fronts' walls (their frames), so that their walls carry no windows on the ground floor
  const shopWalls = [];
  for (const S of SHOPFRONTS) {
    const h = houseOf(S.house);
    if (S.band) {
      const band = bandRing(h), item = parts.find((q) => q.h === h && q.p.band);
      const F = wallFrame(band.ring[3], band.ring[2]);
      shopWalls.push({ p: item.p, F: wallFrame(band.ring[2], band.ring[3]), top: S.top, S, front: F });
      continue;
    }
    const p = partOf(h, S.part);
    const F = outerFrame(partRing(p), S.a, S.b);
    shopWalls.push({ p, F, top: S.top, S, front: F });
  }
  for (const item of parts) {
    buildPartWalls(W, B, parts, item, shopWalls);
    const { p } = item;
    if (p.gable) buildGableRoof(B, p.gable);
    else flatRoof(B, outwardRing(p.ring), p.top, { bucket: 'flat' });
    if (p.roof) buildSaddle(B, p.roof);
  }
  // the shop fronts
  for (const sw of shopWalls) {
    const F = sw.front, base = Math.min(groundHeight(...F.a), groundHeight(...onWall(F, F.len))) - 0.7;
    shopFront(B, F, 0.15, F.len - 0.15, sw.top, base, { fascia: sw.S.band ? 1.05 : 0.6, signs: sw.S.signs || [] });
  }
  // the canopy on w117012350's Promenade side, the awning at the end of Vreni's arm
  for (const h of HOUSES) {
    if (h.canopy) {
      const K = h.canopy, rings = h.parts.map(partRing);
      let F = wallFrame(K.a, K.b);
      const [mx, mz] = onWall(F, F.len / 2, 0.4);
      if (rings.some((r) => pointInRing(r, mx, mz))) F = wallFrame(K.b, K.a);
      B.box('trim', F, -0.2, F.len + 0.2, 0, K.depth, K.top - 0.3, K.top, C.canopy, { top: 'trim' });
    }
    for (const d of h.doors || []) {
      const p = partOf(h, d.part), R = outwardRing(partRing(p));
      let best = null;
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        const s = (d.at[0] - F.a[0]) * F.u[0] + (d.at[1] - F.a[1]) * F.u[1], o = (d.at[0] - F.a[0]) * F.n[0] + (d.at[1] - F.a[1]) * F.n[1];
        if (s > 1 && s < F.len - 1 && (!best || Math.abs(o) < best.o)) best = { F, s, o: Math.abs(o) };
      }
      if (best) door(B, best.F, best.s);
    }
    for (const d of h.dormers || []) dormer(W, B, d);
    for (const [x, z, top] of h.chimneys || []) chimney(B, x, z, top);
  }
  {
    // the awning: sloping out from the arm's end over its glazing
    const arm = partOf(houseOf('w1530028811'), 'arm'), sw = shopWalls.find((q) => q.p === arm), F = sw.front;
    const P = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
    const [ax, ay, aw, ah] = ATLAS.awning, [AW, AH] = ATLAS_SIZE;
    const u0 = ax / AW, u1 = (ax + aw) / AW, v0 = 1 - (ay + ah) / AH, v1 = 1 - ay / AH;
    // (at its end by the street, the arm's south-east corner)
    const atA = Math.hypot(F.a[0] - 330.3, F.a[1] + 680.2) < 1;
    const s0 = atA ? 0.4 : F.len - 5.2, s1 = s0 + 4.8, y = sw.top - 0.7;
    B.quad('decal', P(s0, 1.3, y - 0.6), P(s1, 1.3, y - 0.6), P(s1, 0.05, y), P(s0, 0.05, y), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  M.decal = decalMaterial(atlasTexture());
  root.add(W.mesh(M.walls, 'Promenade Mitte'), ...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
