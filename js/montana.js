import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, length, mix, smoothstep, step, uv, vec2, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, worldNoise } from './building-kit.js';
import {
  MONTANA, atticStretch, bays, gableRoof, groundOutlines, hotelV, insideOther, onWall, outwardRing, part, wallFrame, wallNear, wallStretches,
  windowedTop
} from './montana-data.js';

export { MONTANA };

// The Hotel Montana rebuilt by hand (js/montana-data.js), standing in for its five swissBUILDINGS3D volumes, which the
// streamed tiles drew as white blocks with the town houses' windows: three gabled blocks in cream plaster (the
// north-west block with jerkinheads on its gables to the street and over the wing, the cross wing, the south-east
// block), the flat-topped block on the street front, the south block under the gables, six floors of windows in brown
// frames (a row of round-arched ones over the bar's roof) and an attic window in each gable, drawn by the wall's
// material from its uv (metres along the wall from its middle, metres up the floors' grid); the dark roofs with dormers
// and chimneys, green verges; the restaurant's wing on the street with its round-arched windows over a red-brown plinth
// and the lettering on two piers, a floor over it and a rail round its terrace; the veranda's glass in the garden; the
// bar and the Stube before the street front, red-brown, with white-framed windows, a white ledge, "BAR" in the bar's
// window, the Stube's door up its steps under its board; "MONTANA" on the street gable; balconies on the north-west side
// and towards the valley. Six meshes: the hotel's walls, the annex's walls, the roofs, the glass, the trim (one
// vertex-coloured mesh) and the lettering (one canvas atlas). The hanging signs of js/shops.js give way to its own.

excludeBuildings(MONTANA.exclude);
for (const id of MONTANA.signs) SHOP_EXCLUSIONS.add(id);
// (the player's walls on the surveyed volumes, not on OSM's outline, which stood up to 1.1 m off them: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(MONTANA.osm, groundOutlines());

const S = MONTANA.storey, BAY = MONTANA.bay, LINE = MONTANA.line, FLOOR = MONTANA.floor;
const WG = MONTANA.wing, AX = MONTANA.annex;
// v of a wall: the hotel's walls metres up the floors' grid (hotelV: a floor's foot at every multiple of S); the
// wing's HALL + metres over its floor; closed walls carry v − CLOSED. The annex's walls (a mesh of their own): metres
// over its floor
const HALL = 320 * S;
const CLOSED = 1000 * S;
// A hotel window in its storey (m up from the floor's foot), its half width; the arched row's storey on the grid
const WIN = { lo: 0.85, hi: 2.4, half: 0.55 };
const ARCHED = Math.round(hotelV(FLOOR) / S) + MONTANA.arched;
// The wing's windows: the ground floor's arched ones (m over the wing's floor) and the floor's over it
const HW = { bay: 4.4, lo: 0.8, hi: 3.8, half: 1.1, upBay: 2.2, upFoot: WG.hall - WG.floor + 0.4, upLo: 0.7, upHi: 2.3, upHalf: 0.6 };
// The annex's windows: the ground floor's big ones with a transom, the upper floor's (m over its floor)
const AW = { bay: 2.8, lo: 0.9, hi: 3.8, transom: 3.0, half: 1.05, upLo: 5.4, upHi: 7.3, upHalf: 0.55 };

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const CREAM = [0.46, 0.4, 0.27], OXBLOOD = [0.2, 0.062, 0.042], BROWN = [0.08, 0.048, 0.028], WHITE = [0.56, 0.56, 0.53];

/** A soft-edged rectangle |x| < hw, lo < y < hi (all nodes or numbers) */
const box2 = (x, y, hw, lo, hi, e = 0.012) => smoothstep(float(hw).add(e), float(hw).sub(e), abs(x)).mul(smoothstep(float(lo).sub(e), float(lo).add(e), y)).mul(smoothstep(float(hi).add(e), float(hi).sub(e), y));
/** A window's opening: a rectangle, its head round-arched where `arch` is 1 */
function opening(bu, fv, hw, lo, hi, arch, e = 0.012) {
  const spring = float(hi).sub(float(hw).mul(arch));
  const rect = box2(bu, fv, hw, lo, spring, e);
  const round = smoothstep(float(hw).add(e), float(hw).sub(e), length(vec2(bu, fv.sub(spring)))).mul(step(spring, fv)).mul(arch);
  return rect.max(round);
}

function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.105, 0.1, 0.095], 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.4, 0.35, 0.24], S, WIN.lo / S, WIN.hi / S, 0.9, 0.4);
    M.annex = SIMPLE_SKINS.windowed([0.19, 0.07, 0.05], AW.upLo, AW.lo / AW.upLo, AW.hi / AW.upLo, 0.9, 0.25);
    M.glass = SIMPLE_SKINS.glow([0.09, 0.11, 0.11], 0.1, 0.8, [1.0, 0.84, 0.62], 0.35);
    return M;
  }
  const U = uv().x, V0 = uv().y;
  const half = attribute('aHalf', 'float');
  const near = fade(140, 420);
  const glow = nightGlow();
  const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.07, 0.085, 0.095), worldNoise(0.07));
  // The hotel's and the wing's walls: cream plaster over a red-brown plinth; the hotel's windows in brown frames with
  // two leaves and a transom, a white sill, the row over the bar's roof round-arched; the wing's tall arched windows
  // with a post and a transom, the floor's windows over them
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const V = V0.add(step(V0, -1).mul(CLOSED));
    const hall = step(HALL - 50, V), v = V.sub(hall.mul(HALL));
    const gf = step(v, WG.hall - WG.floor).mul(hall); // (the wing's ground floor)
    const bayW = mix(float(BAY), mix(float(HW.upBay), float(HW.bay), gf), hall);
    const bay = floor(U.div(bayW).add(0.5)), bu = U.sub(bay.mul(bayW));
    const storey = floor(v.div(S));
    const fv = mix(v.sub(storey.mul(S)), mix(v.sub(HW.upFoot), v, gf), hall);
    const arch = mix(step(ARCHED - 0.5, storey).mul(step(storey, ARCHED + 0.5)), gf, hall);
    const hw = mix(float(WIN.half), mix(float(HW.upHalf), float(HW.half), gf), hall);
    const lo = mix(float(WIN.lo), mix(float(HW.upLo), float(HW.lo), gf), hall);
    const hi = mix(float(WIN.hi).add(arch.mul(0.2)), mix(float(HW.upHi), float(HW.hi), gf), hall);
    const open = step(abs(bay.mul(bayW)).add(hw).add(0.4), half);
    const win = opening(bu, fv, hw, lo, hi, arch).mul(open);
    const pane = opening(bu, fv, hw.sub(0.08), lo.add(0.08), hi.sub(0.08), arch).mul(open);
    const transomAt = mix(hi.sub(0.55), float(HW.hi - HW.half - 0.05), gf);
    const bars = smoothstep(0.04, 0.025, abs(bu)).max(smoothstep(0.04, 0.025, abs(fv.sub(transomAt)))).mul(near);
    const glassM = pane.mul(float(1).sub(bars));
    const sill = box2(bu, fv, hw.add(0.1), lo.sub(0.12), lo, 0.01).mul(open).mul(near);
    const plinth = mix(step(v, hotelV(FLOOR + 0.7)), step(v, 0.7), hall);
    const wall = mix(vec3(...CREAM).mul(0.93), vec3(...CREAM).mul(1.06), worldNoise(0.3));
    const red = mix(vec3(...OXBLOOD).mul(0.9), vec3(...OXBLOOD).mul(1.1), worldNoise(0.5));
    // (curtains half drawn in some of the rooms)
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(0.9), step(0.85, id))).mul(float(1).sub(hall));
    const curtain = step(hi.sub(0.1).sub(drawn.mul(hi.sub(lo).sub(0.2))), fv).mul(glassM).mul(near);
    let c = mix(wall, red, plinth);
    c = mix(c, vec3(...WHITE), sill);
    c = mix(c, vec3(...BROWN), win);
    c = mix(c, glassC, glassM);
    c = mix(c, vec3(0.5, 0.46, 0.38), curtain);
    m.colorNode = c;
    const shiny = glassM.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    // (the hotel's rooms lit here and there; the restaurant a faint glow behind its panes, a few lit)
    const rooms = litWindow(bay, storey.add(half.mul(3.1)), 37, { share: 0.38, late: 0.1, tone: twoTones([1.0, 0.74, 0.46], [0.95, 0.88, 0.76], 0.75) });
    const hallLit = vec3(1.0, 0.8, 0.55).mul(float(0.08).add(litWindow(bay, gf.add(half.mul(2.3)), 41, { share: 0.3, late: 0.05, tone: () => vec3(0.9, 0.7, 0.45), vary: false }).x));
    m.emissiveNode = mix(rooms, hallLit, hall).mul(pane).mul(mix(float(1), float(0.4), curtain)).mul(glow.mul(1.05));
    M.plaster = m;
  }
  // The bar's and the Stube's walls: red-brown plaster, the ground floor's big windows in white frames with a transom,
  // the upper floor's in white frames
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const v = V0.add(step(V0, -1).mul(CLOSED));
    const gf = step(v, AX.ground - AX.floor);
    const bay = floor(U.div(AW.bay).add(0.5)), bu = U.sub(bay.mul(AW.bay));
    const hw = mix(float(AW.upHalf), float(AW.half), gf), lo = mix(float(AW.upLo), float(AW.lo), gf), hi = mix(float(AW.upHi), float(AW.hi), gf);
    const open = step(abs(bay.mul(AW.bay)).add(hw).add(0.4), half);
    const win = box2(bu, v, hw, lo, hi).mul(open);
    const pane = box2(bu, v, hw.sub(0.09), lo.add(0.09), hi.sub(0.09)).mul(open);
    const bars = smoothstep(0.05, 0.035, abs(v.sub(mix(hi.sub(0.6), float(AW.transom), gf)))).max(smoothstep(0.04, 0.025, abs(bu)).mul(float(1).sub(gf))).mul(near);
    const glassM = pane.mul(float(1).sub(bars));
    const wall = mix(vec3(...OXBLOOD).mul(0.9), vec3(...OXBLOOD).mul(1.12), worldNoise(0.4));
    let c = mix(wall, vec3(...WHITE), win);
    c = mix(c, glassC, glassM);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.9), float(0.12), glassM);
    m.metalnessNode = glassM.mul(0.5);
    // (at night the bar is shut but for a faint glow and a lamp here and there; the rooms over it lit now and then)
    const id = hash(bay.mul(13.7).add(half.mul(7.1)).add(gf.mul(3.3)));
    const shop = vec3(1.0, 0.78, 0.5).mul(mix(float(0.05), float(0.4), step(0.72, id)));
    const rooms = litWindow(bay, half.mul(5.3), 43, { share: 0.3, late: 0.08, tone: twoTones([1.0, 0.74, 0.46], [0.95, 0.88, 0.76], 0.7) });
    m.emissiveNode = mix(rooms, shop, gf).mul(glassM).mul(glow);
    M.annex = m;
  }
  // The veranda's glass: white posts every 1.1 m, a transom 2.4 m up, a faint glow at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const V = V0;
    const frame = smoothstep(0.44, 0.465, abs(fract(U.div(1.1)).sub(0.5))).max(smoothstep(0.05, 0.03, abs(V.sub(2.4)))).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.1)).mul(13.1).add(step(2.4, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.05, 0.065, 0.07), vec3(0.11, 0.13, 0.14), paneId), vec3(...WHITE), frame);
    m.roughnessNode = mix(float(0.1), float(0.7), frame);
    m.metalnessNode = mix(float(0.8), float(0.1), frame);
    m.emissiveNode = vec3(1.0, 0.84, 0.6).mul(float(1).sub(frame)).mul(mix(float(0.04), float(0.3), step(0.75, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The lettering: one canvas atlas -----------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  name: [0, 0, 1024, 160], // "MONTANA" on the street gable (6.4 × 1.0 m)
  restaurant: [0, 168, 400, 316], // the wing's piers (3.3 × 2.6 m)
  stube: [408, 168, 420, 196], // the Stube's board (both its faces, 2.1 × 0.95 m)
  bar: [408, 372, 300, 100] // "BAR" in the bar's transom
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('name', (w, h) => {
    g.fillStyle = '#4a4034';
    g.font = '500 128px Georgia, "Times New Roman", serif';
    g.fillText('M O N T A N A', w / 2, h / 2 + 6, w - 30);
  });
  cell('restaurant', (w) => {
    g.fillStyle = '#5a4026';
    g.font = '600 56px Georgia, "Times New Roman", serif';
    ['RESTAURANT', 'MONTANA', 'HOTEL', 'BAR'].forEach((t, i) => g.fillText(t, w / 2, 48 + i * 74, w - 20));
  });
  cell('stube', (w, h) => {
    g.fillStyle = '#1e6b34'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#141414'; g.fillRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#f2ead8';
    g.font = 'italic 600 74px Georgia, "Times New Roman", serif';
    g.fillText('Montana Stube', w / 2, h * 0.4, w - 50);
    g.font = '600 30px Helvetica, Arial, sans-serif';
    g.fillText('RESTAURANT · BAR · HOTEL', w / 2, h * 0.78, w - 70);
  });
  cell('bar', (w, h) => {
    g.fillStyle = '#c4161c';
    g.font = 'bold 78px Georgia, "Times New Roman", serif';
    g.fillText('B A R', w / 2, h / 2 + 4, w - 20);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  cream: CREAM, white: WHITE, brown: BROWN, green: [0.03, 0.11, 0.05], verge: [0.04, 0.1, 0.055], iron: [0.03, 0.03, 0.032],
  stone: [0.3, 0.29, 0.27], slab: [0.42, 0.41, 0.38], cornice: [0.5, 0.45, 0.33], pane: [0.025, 0.03, 0.035], board: [0.02, 0.02, 0.02],
  chimney: [0.36, 0.32, 0.25], cap: [0.12, 0.12, 0.12]
};

const UV4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
/** A wall's point in the world: s along it, y up, o out of it */
const at = (F, s, y, o = 0) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };

/**
 * A strip of a wall into `bucket` from s0 to s1 and y0 to y1; uv: metres from the stretch's middle `mid`, v(y); `half`
 * the windows' half stretch (0: closed)
 */
function strip(B, bucket, F, s0, s1, y0, y1, v, mid, half) {
  if (s1 - s0 < 0.005 || y1 - y0 < 0.005) return;
  B.quad(bucket, at(F, s0, y0), at(F, s1, y0), at(F, s1, y1), at(F, s0, y1), [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half });
}
/** A trapezoid strip (its head sloping from ya at s0 to yb at s1) */
function trapezoid(B, bucket, F, s0, s1, y0, ya, yb, v, mid, half) {
  if (s1 - s0 < 0.005 || Math.max(ya, yb) - y0 < 0.005) return;
  B.quad(bucket, at(F, s0, y0), at(F, s1, y0), at(F, s1, yb), at(F, s0, ya),
    [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(yb)], [s0 - mid, v(ya)]], { half });
}

const closed = (v) => (y) => v(y) - CLOSED;
/** The highest ground along a wall, half a metre out of it */
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}
/** Does the wall face open ground (not another part) somewhere along it? */
function facesOpen(p, F) {
  for (let k = 1; k < 8; k++) { const [x, z] = onWall(F, (F.len * k) / 8, 0.4); if (!insideOther(p, x, z)) return true; }
  return false;
}

/**
 * A hotel wall from the base to `top`: the plinth, the floors' windows from the ground floor (or, where the ground
 * rises over a floor's windows, from the next floor up) to the highest floor that fits under `top`, closed over them
 */
function hotelWall(B, F, top) {
  const mid = F.len / 2, half = F.len >= 2.4 ? mid : 0;
  const hi = groundAlong(F) + 0.25;
  const from = hi <= FLOOR + WIN.lo ? FLOOR : FLOOR + Math.ceil((hi - FLOOR - WIN.lo) / S) * S;
  const wTop = Math.max(from, windowedTop(top));
  strip(B, 'plaster', F, 0, F.len, MONTANA.base, from, closed(hotelV), mid, 0);
  strip(B, 'plaster', F, 0, F.len, from, wTop, hotelV, mid, half);
  strip(B, 'plaster', F, 0, F.len, wTop, top, closed(hotelV), mid, 0);
}

/** A flat-roofed part: its walls, a cornice where they face open ground, the roof */
function buildFlat(B, p) {
  const R = outwardRing(p.ring);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.05) continue;
    if (p.kind === 'hotel') hotelWall(B, F, p.top);
    else if (p.kind === 'hall') hallWall(B, p, F);
    else if (p.kind === 'annex') annexWall(B, p, F);
    else verandaWall(B, F, p.top);
    if (!facesOpen(p, F)) continue;
    const edge = p.kind === 'annex' ? C.white : p.kind === 'hall' ? C.cornice : C.white;
    B.box('trim', F, -0.05, F.len + 0.05, -0.25, p.kind === 'annex' ? 0.35 : 0.25, p.top - (p.kind === 'annex' ? 0.5 : 0.3), p.top + 0.08, edge, { top: 'roof' });
  }
  flatRoof(B, R, p.top);
}

// The restaurant's wing: the red-brown plinth, the ground floor's arched windows (piers left free for the lettering),
// a cornice, the floor over it, a closed band and the coping; a rail round the terrace on its roof
function hallWall(B, p, F) {
  const mid = F.len / 2, v = (y) => y - WG.floor + HALL;
  const hi = groundAlong(F) + 0.25;
  // (where the ground rises over the arched windows' sills, a closed wall to the cornice under them)
  const gfOpen = hi <= WG.floor + HW.lo;
  strip(B, 'plaster', F, 0, F.len, MONTANA.base, WG.floor, closed(v), mid, 0);
  for (const st of wallStretches(p, F)) {
    const m = (st.from + st.to) / 2, h = st.windows && gfOpen && st.to - st.from >= 2 * (HW.half + 0.4) ? (st.to - st.from) / 2 : 0;
    strip(B, 'plaster', F, st.from, st.to, WG.floor, WG.hall, h > 0 ? v : closed(v), m, h);
  }
  strip(B, 'plaster', F, 0, F.len, WG.hall, WG.upper, v, mid, F.len >= 2.4 ? mid : 0);
  strip(B, 'plaster', F, 0, F.len, WG.upper, p.top, closed(v), mid, 0);
  if (!facesOpen(p, F)) return;
  B.box('trim', F, -0.05, F.len + 0.05, 0, 0.22, WG.hall - 0.05, WG.hall + 0.3, C.cornice);
  B.box('trim', F, -0.05, F.len + 0.05, 0, 0.12, WG.floor + 0.62, WG.floor + 0.72, C.stone);
  // the terrace's rail: posts and a handrail a step in from the roof's edge
  const y = p.top + 0.08, r = WG.rail;
  B.box('trim', F, 0.1, F.len - 0.1, -0.3, -0.24, y + r - 0.05, y + r, C.iron);
  B.box('trim', F, 0.1, F.len - 0.1, -0.29, -0.25, y + 0.12, y + 0.16, C.iron);
  for (let s = 0.15; s < F.len - 0.1; s += Math.max(0.8, (F.len - 0.3) / Math.max(1, Math.round((F.len - 0.3) / 1.2)))) B.box('trim', F, s - 0.025, s + 0.025, -0.3, -0.24, y, y + r, C.iron);
}

// The bar's and the Stube's walls: red-brown, the ground floor's big windows, the upper floor's, closed over them; the
// white ledge over the ground floor on the street
function annexWall(B, p, F) {
  const mid = F.len / 2, v = (y) => y - AX.floor;
  const hi = groundAlong(F) + 0.25, gfOpen = hi <= AX.floor + AW.lo;
  const head = AX.floor + AW.upHi + 0.35;
  strip(B, 'annex', F, 0, F.len, MONTANA.base, AX.floor, closed(v), mid, 0);
  for (const st of wallStretches(p, F)) {
    const m = (st.from + st.to) / 2, h = st.windows && gfOpen ? (st.to - st.from) / 2 : 0;
    strip(B, 'annex', F, st.from, st.to, AX.floor, AX.ground, h > 0 ? v : closed(v), m, h);
  }
  strip(B, 'annex', F, 0, F.len, AX.ground, head, v, mid, F.len >= 2.4 ? mid : 0);
  strip(B, 'annex', F, 0, F.len, head, p.top, closed(v), mid, 0);
  if (!facesOpen(p, F)) return;
  B.box('trim', F, -0.05, F.len + 0.05, 0, AX.ledge, AX.ground - 0.05, AX.ground + 0.32, C.white, { top: 'roof' });
  B.box('trim', F, -0.05, F.len + 0.05, 0, 0.1, AX.floor - 0.3, AX.floor + 0.5, C.stone);
}

// The veranda: a closed sill over the garden, the glass, a white band under its roof
function verandaWall(B, F, top) {
  const mid = F.len / 2, Vd = MONTANA.veranda;
  const sill = Math.max(Vd.sill, groundAlong(F) + 0.3);
  strip(B, 'plaster', F, 0, F.len, MONTANA.base, sill, closed(hotelV), mid, 0);
  B.quad('glass', at(F, 0, sill), at(F, F.len, sill), at(F, F.len, Vd.head), at(F, 0, Vd.head), [[0, 0], [F.len, 0], [F.len, Vd.head - sill], [0, Vd.head - sill]]);
  strip(B, 'plaster', F, 0, F.len, Vd.head, top, closed(hotelV), mid, 0);
  B.box('trim', F, -0.03, F.len + 0.03, 0, 0.08, sill - 0.08, sill, C.white);
}

/** A triangle of a roof, turned to face up */
function roofTri(B, a, b, c) {
  const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0;
  const t = up ? [a, b, c] : [a, c, b];
  B.tri('roof', t[0], t[1], t[2], t.map((q) => [q[0], q[2]]));
}
/** A convex roof polygon as a fan of triangles */
const roofPoly = (B, pts) => { for (let i = 1; i + 1 < pts.length; i++) roofTri(B, pts[0], pts[i], pts[i + 1]); };

/**
 * A gabled block: its eaves' walls, its gables (the floors' windows up to the eaves, the attic's window where the
 * gable stands high enough, closed over it), the verges, the fascias under the eaves, the slopes and the jerkinheads
 */
function buildGabled(B, p) {
  const Q = gableRoof(p), A = atticStretch(p);
  const W3 = (s, t, y) => { const [x, z] = Q.at(s, t); return [x, y, z]; };
  const corners = [Q.at(0, 0), Q.at(Q.L, 0), Q.at(Q.L, Q.W), Q.at(0, Q.W)];
  const R = outwardRing(corners);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    // its place in the block's frame: along the eaves (t fixed) or across (a gable, s fixed)
    const t0 = (F.a[0] - Q.a[0]) * Q.w[0] + (F.a[1] - Q.a[1]) * Q.w[1];
    const across = Math.abs(F.u[0] * Q.w[0] + F.u[1] * Q.w[1]) > 0.7;
    if (!across) {
      const E = t0 < Q.W / 2 ? Q.E0 : Q.E1;
      hotelWall(B, F, E);
      if (facesOpen(p, F)) B.box('trim', F, -0.35, F.len + 0.35, 0, 0.5, E - 0.3, E + 0.02, C.brown, { top: 'roof' });
      continue;
    }
    // a gable: s along the wall ↔ t across the block (the profile's points in the wall's frame)
    const tOf = (s) => t0 + s * (F.u[0] * Q.w[0] + F.u[1] * Q.w[1]);
    const sOf = (t) => (t - t0) / (F.u[0] * Q.w[0] + F.u[1] * Q.w[1]);
    const yAt = (t) => {
      const pr = Q.profile;
      for (let k = 0; k + 1 < pr.length; k++) if (t >= pr[k][0] - 1e-9 && t <= pr[k + 1][0] + 1e-9) return pr[k][1] + ((t - pr[k][0]) / (pr[k + 1][0] - pr[k][0] || 1)) * (pr[k + 1][1] - pr[k][1]);
      return Math.min(Q.E0, Q.E1);
    };
    const Emin = Math.min(Q.E0, Q.E1), attic = LINE + S;
    hotelWall(B, F, Emin);
    // the gable over the eaves: strips between the profile's corners, the attic's stretch and where it crosses the
    // attic's head
    const ts = new Set([0, Q.W, ...Q.profile.map((q) => q[0]), ...(A || [])]);
    for (let k = 0; k + 1 < Q.profile.length; k++) {
      const [ta, ya] = Q.profile[k], [tb, yb] = Q.profile[k + 1];
      if ((ya - attic) * (yb - attic) < 0) ts.add(ta + ((attic - ya) / (yb - ya)) * (tb - ta));
    }
    const ss = [...ts].map(sOf).filter((s) => s >= -1e-6 && s <= F.len + 1e-6).sort((a, b) => a - b);
    const mid = F.len / 2;
    // (the attic's windows laid out from the wall's middle, within the stretch)
    let half = 0;
    if (A) { const [sa, sb] = [sOf(A[0]), sOf(A[1])].sort((a, b) => a - b); half = Math.max(0, Math.min(mid - sa, sb - mid)); }
    if (half < WIN.half + 0.4) half = 0;
    for (let k = 0; k + 1 < ss.length; k++) {
      const s0 = ss[k], s1 = ss[k + 1], y0 = yAt(tOf(s0)), y1 = yAt(tOf(s1)), sm = (s0 + s1) / 2;
      const inAttic = half > 0 && Math.abs(sm - mid) < half;
      if (inAttic && Math.min(y0, y1) >= attic - 1e-6) {
        trapezoid(B, 'plaster', F, s0, s1, Emin, attic, attic, hotelV, mid, half);
        trapezoid(B, 'plaster', F, s0, s1, attic, y0, y1, closed(hotelV), mid, 0);
      } else trapezoid(B, 'plaster', F, s0, s1, Emin, y0, y1, inAttic ? hotelV : closed(hotelV), mid, inAttic ? half : 0);
      // the verge: a green board along the slope, a little out of the gable
      if (y0 > Emin + 0.05 || y1 > Emin + 0.05) {
        B.quad('trim', at(F, s0, y0 - 0.32, 0.1), at(F, s1, y1 - 0.32, 0.1), at(F, s1, y1 + 0.06, 0.1), at(F, s0, y0 + 0.06, 0.1), UV4, { colour: C.verge });
      }
    }
  }
  // The slopes (the jerkinheads' triangles at the gables where it has them)
  const { L, W, r, E0, E1, R: H, hh, hin, t0, t1 } = Q;
  if (hin > 0) {
    roofPoly(B, [W3(0, 0, E0), W3(L, 0, E0), W3(L, t0, hh), W3(L - hin, r, H), W3(hin, r, H), W3(0, t0, hh)]);
    roofPoly(B, [W3(0, W, E1), W3(0, t1, hh), W3(hin, r, H), W3(L - hin, r, H), W3(L, t1, hh), W3(L, W, E1)]);
    roofTri(B, W3(0, t0, hh), W3(0, t1, hh), W3(hin, r, H));
    roofTri(B, W3(L, t0, hh), W3(L, t1, hh), W3(L - hin, r, H));
  } else {
    roofPoly(B, [W3(0, 0, E0), W3(L, 0, E0), W3(L, r, H), W3(0, r, H)]);
    roofPoly(B, [W3(0, W, E1), W3(0, r, H), W3(L, r, H), W3(L, W, E1)]);
  }
}

/** A gabled block's eave as a wall frame (outward over side `side`), with the slope's rise per metre and its eave */
function eaveFrame(p, side) {
  const Q = gableRoof(p);
  const n = side === 0 ? [-Q.w[0], -Q.w[1]] : Q.w;
  const u = [n[1], -n[0]]; // (wallFrame's turn: the outside on (−u.z, u.x))
  // (s runs from the block's a/d end, or back from its b/c end where the frame turns the other way)
  const flip = u[0] * Q.u[0] + u[1] * Q.u[1] < 0, t = side === 0 ? 0 : Q.W;
  const a = Q.at(flip ? Q.L : 0, t);
  return { F: { a, u, n, len: Q.L }, Q, k: side === 0 ? Q.k0 : Q.k1, E: side === 0 ? Q.E0 : Q.E1, flip };
}

// The dormers: a cream body standing out of the slope, its window, a pitched roof
function buildDormers(B) {
  const half = 0.75, tf = 1.1;
  for (const D of MONTANA.dormers) {
    const p = part(D.part), { F, k, E, flip, Q } = eaveFrame(p, D.side);
    for (const s0 of D.at) {
      const s = flip ? Q.L - s0 : s0;
      const yf = E + k * tf, y1 = yf + 1.55, depth = (y1 - yf + 0.6) / k;
      B.box('trim', F, s - half, s + half, -tf - depth, -tf, yf - 0.15, y1, C.cream);
      B.box('trim', F, s - half + 0.14, s + half - 0.14, -tf, -tf + 0.04, yf + 0.25, y1 - 0.2, C.white);
      B.box('trim', F, s - half + 0.22, s - 0.04, -tf + 0.04, -tf + 0.06, yf + 0.33, y1 - 0.28, C.pane);
      B.box('trim', F, s + 0.04, s + half - 0.22, -tf + 0.04, -tf + 0.06, yf + 0.33, y1 - 0.28, C.pane);
      const P = (ss, o, y) => { const [x, z] = onWall(F, ss, o); return [x, y, z]; };
      const e = 0.15, top = y1 + half * 0.8, back = -tf - depth;
      roofPoly(B, [P(s - half - e, -tf + e, y1), P(s, -tf + e, top), P(s, back, top), P(s - half - e, back, y1)]);
      roofPoly(B, [P(s, -tf + e, top), P(s + half + e, -tf + e, y1), P(s + half + e, back, y1), P(s, back, top)]);
      B.tri('trim', P(s - half, -tf, y1), P(s + half, -tf, y1), P(s, -tf, top - 0.05), [[0, 0], [1, 0], [0.5, 1]], { colour: C.cream });
    }
  }
}

// The chimneys on the north-west block's ridge
function buildChimneys(B) {
  const p = part('west'), { F, Q, flip } = eaveFrame(p, 0);
  for (const s0 of MONTANA.chimneys) {
    const s = flip ? Q.L - s0 : s0, o = -Q.r;
    B.box('trim', F, s - 0.4, s + 0.4, o - 0.35, o + 0.35, Q.R - 1.5, Q.R + 1.3, C.chimney);
    B.box('trim', F, s - 0.48, s + 0.48, o - 0.43, o + 0.43, Q.R + 1.3, Q.R + 1.45, C.cap);
  }
}

// The lettering: "RESTAURANT MONTANA HOTEL BAR" on the wing's piers, "MONTANA" on the street gable
function buildLetters(B) {
  for (const l of MONTANA.letters) {
    const { F, s } = wallNear(part(l.part), l.at[0], l.at[1]);
    B.decal(F, s - l.w / 2, s + l.w / 2, 0.04, l.y0, l.y1, l.key);
  }
}

// The Stube's door up its steps, its board out from the wall; "BAR" in the bar's window
function buildDoor(B) {
  const D = MONTANA.door, { F, s } = wallNear(part(D.part), D.at[0], D.at[1]);
  const g = groundHeight(...onWall(F, s, 1.0)), step = 0.17, sill = g + D.steps * step, w = D.w / 2;
  for (let i = 0; i < D.steps; i++) B.box('trim', F, s - w - 0.5, s + w + 0.5, 0, 1.25 - i * 0.4, g - 0.6, g + (i + 1) * step, C.stone);
  B.box('trim', F, s - w - 0.12, s + w + 0.12, 0, 0.1, sill, sill + D.h + 0.12, C.green);
  B.box('trim', F, s - w, s + w, 0.04, 0.12, sill, sill + D.h, [0.02, 0.06, 0.03]);
  for (const ds of [-w / 2, w / 2]) B.box('trim', F, s + ds - w / 2 + 0.14, s + ds + w / 2 - 0.14, 0.12, 0.13, sill + 1.0, sill + D.h - 0.2, C.pane);
  B.box('trim', F, s - w - 0.4, s + w + 0.4, 0, 0.9, sill + D.h + 0.25, sill + D.h + 0.4, C.green, { top: 'roof' });
  // the board, out from the wall beside the door: both its faces
  const Bd = D.board, bs = s + Bd.s, y0 = AX.floor + Bd.y, y1 = y0 + Bd.h;
  B.box('trim', F, bs - 0.05, bs + 0.05, 0, 0.2, y0 + 0.2, y1 - 0.2, C.iron);
  B.box('trim', F, bs - 0.04, bs + 0.04, 0.2, 0.2 + Bd.out, y0, y1, C.board);
  // (the face towards the wall's start, then the one towards its end)
  const [ax, az] = onWall(F, bs - 0.05, 0.2), [bx, bz] = onWall(F, bs + 0.05, 0.2 + Bd.out);
  B.decal({ a: [ax, az], u: F.n, n: [-F.n[1], F.n[0]] }, 0, Bd.out, 0, y0, y1, 'stube');
  B.decal({ a: [bx, bz], u: [-F.n[0], -F.n[1]], n: [F.n[1], -F.n[0]] }, 0, Bd.out, 0, y0, y1, 'stube');
  // "BAR" in the transom of the bar's window on the street
  const W = wallNear(part(MONTANA.bar.part), MONTANA.bar.at[0], MONTANA.bar.at[1]);
  B.decal(W.F, W.F.len / 2 - 0.8, W.F.len / 2 + 0.8, 0.02, AX.floor + AW.transom + 0.12, AX.floor + AW.hi - 0.12, 'bar');
}

// The balconies: a slab, an iron rail with its bars, before a window (or along the whole wall)
function buildBalconies(B) {
  for (const Bc of MONTANA.balconies) {
    const p = part(Bc.part), { F, s } = wallNear(p, Bc.at[0], Bc.at[1]);
    let s0 = 0.4, s1 = F.len - 0.4;
    if (!Bc.run) {
      const list = bays(F.len, BAY, F.len / 2, WIN.half);
      const sb = list.reduce((b, q) => (Math.abs(q - s) < Math.abs(b - s) ? q : b), list[0]);
      [s0, s1] = [sb - Bc.w / 2, sb + Bc.w / 2];
    }
    const o = Bc.out, r = 1.0;
    for (const y of Bc.floors) {
      B.box('trim', F, s0, s1, 0, o, y - 0.18, y, C.slab, { top: 'roof' });
      B.box('trim', F, s0, s1, o - 0.06, o, y + r - 0.05, y + r, C.iron);
      B.box('trim', F, s0, s1, o - 0.05, o - 0.02, y + 0.1, y + 0.14, C.iron);
      for (const e of [s0, s1 - 0.05]) B.box('trim', F, e, e + 0.05, 0, o, y + r - 0.05, y + r, C.iron);
      const n = Math.max(2, Math.round((s1 - s0) / 0.25));
      for (let i = 0; i <= n; i++) { const e = s0 + 0.03 + ((s1 - s0 - 0.06) * i) / n; B.box('trim', F, e - 0.012, e + 0.012, o - 0.05, o - 0.026, y, y + r, C.iron); }
    }
  }
}

/**
 * Builds the Hotel Montana into `scene`. Returns { group, colliders }: none of its own (every part stands on the
 * ground and its outline is registered for js/buildings.js' walls; the Stube's two steps stay walkable).
 */
export function buildMontana(scene) {
  const root = new THREE.Group();
  root.name = 'Hotel Montana';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['plaster', 'annex'], name: 'Montana' }), M = materials();
  for (const p of MONTANA.parts) {
    if (p.roof) buildGabled(B, p);
    else buildFlat(B, p);
  }
  buildDormers(B);
  buildChimneys(B);
  buildLetters(B);
  buildDoor(B);
  buildBalconies(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
