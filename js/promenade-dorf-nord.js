import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, rectMask, twoTones, worldNoise } from './building-kit.js';
import {
  BAY, HOUSES, SHOP_IDS, STOREY, STYLE, WIN, at, featureY, groundOutlines, hips, onBoards, onWall, outwardRing, partTop, pointInRing, roofFrame,
  roofY, wallFrame, wallOut, winHi, winLo
} from './promenade-dorf-nord-data.js';

export { HOUSES };

// The houses along the Promenade in Davos Dorf from the Freitag Store to the Dischmastrasse's corner rebuilt by hand
// (js/promenade-dorf-nord-data.js), standing in for their swissBUILDINGS3D volumes, which the streamed tiles drew as
// white blocks with the town houses' windows: the Bergsport's house (cream, the shop under a light fascia and a dark
// canopy, the Fullmoons panel), the pink house behind it, the cream house with its oriel and dark eaves, the gabled
// house (beige, painted surrounds, shutters, quoins, its cross wing, bay and annex), the two blocks of flats in white
// plaster and larch boards, and the pink house with the galleries (shutters, the gable on the street, the timber
// galleries under the cross gable). Windows are drawn by the walls' material from their uv (metres along the wall from
// its middle, metres up the house's floors' grid, each house's storey scaled to STOREY). One merged mesh per material
// for the whole row: the walls (their colours as vertex colours, their style and house in aHalf), the roofs, the trim
// (vertex colours), the glass and the lettering (one canvas atlas).

for (const h of HOUSES) excludeBuildings(h.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js)
for (const h of HOUSES) SURVEYED_FOOTPRINTS.set(h.id, groundOutlines(h));
// (the shops' signs lettered here, on these walls: js/shops.js leaves them out)
for (const id of SHOP_IDS) SHOP_EXCLUSIONS.add(id);

const S = STOREY;
// v of a wall: metres up its house's floors' grid in STOREY units (the grid's foot at 40 storeys); closed walls carry
// v − CLOSED
const UP = 40 * S, CLOSED = 300 * S;
const vOf = (house, y) => ((y - house.floor) * S) / house.storey + UP;
// aHalf: the half length the bays are laid out on (0: no windows), + 1000 × the wall's style bits, + 10000 × the
// house's index
const halfCode = (hi, half, style) => half + 1000 * style + 10000 * hi;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.11, 0.1, 0.095], FRAME_C = [0.58, 0.57, 0.53];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  M.glass = SIMPLE_SKINS.glow([0.03, 0.036, 0.042], 0.1, 0.5, [1.0, 0.8, 0.56], 0.3);
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the houses' colours from the vertices, a window per bay and storey, lit at night)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], S, WIN.lo / S, WIN.hi / S, 0.85, 0.3, { bay: BAY, half: WIN.half });
    M.walls.vertexColors = true;
    return M;
  }
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const U = uv().x, V = uv().y, A = attribute('aHalf', 'float');
  // (rounded before the floor: an exact multiple arriving a hair low would read as the neighbour's code)
  const hi = floor(A.add(0.5).div(10000)), rest = A.sub(hi.mul(10000));
  const st = floor(rest.add(0.5).div(1000)), half = rest.sub(st.mul(1000));
  const st2 = floor(st.add(0.5).div(2)), st4 = floor(st.add(0.5).div(4));
  const timber = st.sub(st2.mul(2)), surr = st2.sub(st4.mul(2)), shut = st4;
  const bay = floor(U.div(BAY).add(0.5)), bu = U.sub(bay.mul(BAY));
  const storey = floor(V.div(S)), fv = V.sub(storey.mul(S));
  // (a window fits in the wall; its shutters too)
  const open = step(abs(bay.mul(BAY)).add(WIN.half + 0.4), half);
  const openS = step(abs(bay.mul(BAY)).add(WIN.half + 0.7), half);
  const rect = (hw, lo, hiY) => rectMask(bu, fv, hw, lo, hiY);
  // the plaster with a little weathering; the boards, 0.14 m each, a shade of their own, a dark joint between
  const base = attribute('color', 'vec3');
  const plaster = base.mul(mix(float(0.95), float(1.05), worldNoise(0.4)));
  const course = V.div(0.14).floor(), fc = fract(V.div(0.14));
  const joint = smoothstep(0.1, 0.0, fc).max(smoothstep(0.9, 1.0, fc)).mul(fine).mul(0.5);
  const boards = base.mul(hash(course.mul(17.3).add(floor(U.div(4.1)).mul(3.7))).mul(0.3).add(0.85)).mul(float(1).sub(joint));
  let c = mix(plaster, boards, timber);
  // the painted surrounds: a light band round each window, a deeper head over it
  const sur = rect(WIN.half + 0.17, WIN.lo - 0.22, WIN.hi + 0.42).mul(open).mul(surr);
  c = mix(c, vec3(0.66, 0.64, 0.58), sur);
  // the shutters: a dark brown leaf each side of the window, its slats near by
  const leaf = rect(WIN.half + 0.6, WIN.lo, WIN.hi).sub(rect(WIN.half + 0.04, WIN.lo - 0.05, WIN.hi + 0.05)).max(0).mul(openS).mul(shut);
  const slat = smoothstep(0.35, 0.5, abs(fract(fv.div(0.09)).sub(0.5))).mul(fine).mul(0.35);
  c = mix(c, vec3(0.13, 0.07, 0.035).mul(float(1).sub(slat)), leaf);
  // a window: a light frame, a post and a rail (four panes), a sill under it, a curtain drawn in some
  const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
  const rail = WIN.lo + (WIN.hi - WIN.lo) * 0.62;
  const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.03, 0.018, abs(fv.sub(rail))));
  const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(bars.mul(fine))).mul(open);
  const sill = rect(WIN.half + 0.07, WIN.lo - 0.09, WIN.lo).mul(open).mul(near);
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(hi.mul(13.1)));
  const drawn = step(0.6, id).mul(mix(float(0.3), float(0.7), step(0.85, id)));
  const span = WIN.hi - WIN.lo - 0.14;
  const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(span)), fv).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.024, 0.028), vec3(0.06, 0.075, 0.09), worldNoise(0.07));
  c = mix(c, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, vec3(...FRAME_C), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.88), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (flats and shops' offices: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay.add(hi.mul(31)), storey, 71, { share: 0.32, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1));
  M.walls = m;
  return M;
}

// --- The lettering: one canvas atlas ----------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 128];
export const ATLAS = {
  bergsport: [0, 0, 512, 64],
  govertical: [512, 0, 512, 64],
  rainbow: [0, 64, 512, 64],
  fullmoons: [512, 64, 128, 64]
};
/** A cell's width over its height (the decals' proportions) */
export const aspectOf = (key) => ATLAS[key][2] / ATLAS[key][3];

function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  const text = (t, x, y, px, colour, weight = 700, family = 'sans-serif') => {
    g.font = `${weight} ${px}px ${family}`;
    g.fillStyle = colour; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, x, y);
  };
  const board = (w, h, bw, colour) => { g.fillStyle = colour; g.fillRect((w - bw) / 2, 4, bw, h - 8); };
  // BERGSPORT in dark grey capitals on the light fascia (the photographs), Go Vertical's name on the street side
  cell('bergsport', (w, h) => { text('BERGSPORT', w / 2, h / 2 + 2, 50, '#2e3236', 600); });
  cell('govertical', (w, h) => { board(w, h, 400, '#1b4f8a'); text('Go Vertical Davos', w / 2, h / 2 + 2, 38, '#ffffff', 800); });
  cell('rainbow', (w, h) => { board(w, h, 480, '#33393f'); text('Rainbow Kinder-Secondhand', w / 2, h / 2 + 2, 32, '#ffffff', 700); });
  // the black panel with the yellow diamond and its small lettering
  cell('fullmoons', (w, h) => {
    g.fillStyle = '#121212'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2c919';
    g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2 + 26, h / 2); g.lineTo(w / 2, h - 6); g.lineTo(w / 2 - 26, h / 2); g.closePath(); g.fill();
    g.fillStyle = '#121212'; g.beginPath(); g.arc(w / 2, h / 2, 7, 0, Math.PI * 2); g.fill();
    text('FULLMOONS', 26, 10, 9, '#3a8ad0', 700);
  });
  return canvasTexture(canvas);
}

// --- Geometry helpers ------------------------------------------------------------------------------------------------------
const TRIM = {
  plinth: [0.22, 0.215, 0.205], frame: FRAME_C, soffit: [0.07, 0.045, 0.03], fascia: [0.1, 0.06, 0.035],
  sill: [0.3, 0.29, 0.27], quoin: [0.64, 0.62, 0.56], winFrame: [0.5, 0.48, 0.44]
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A quad facing away from `centre` (its corners turned round if they face it) */
function quadOut(B, bucket, pts, centre, opt = {}) {
  const [a, b, c, d] = pts;
  const n = cross(sub(b, a), sub(d, a)), m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  B.quad(bucket, ...(dot(n, sub(m, centre)) >= 0 ? [a, b, c, d] : [a, d, c, b]), undefined, opt);
}
/** A quad facing up (or down) whichever way its corners run */
function quadUp(B, bucket, pts, up, opt = {}) {
  const [a, b, c, d] = pts;
  const n = cross(sub(b, a), sub(d, a)).map((v, i) => v + cross(sub(c, b), sub(a, b))[i]);
  B.quad(bucket, ...((n[1] >= 0) === up ? [a, b, c, d] : [a, d, c, b]), undefined, opt);
}
// (a point inside one of all the row's parts, but `self`: the highest of their tops there, or −Infinity)
function coverAt(self, x, z) {
  let y = -Infinity;
  for (const h of HOUSES) for (const p of h.parts) {
    if (p === self || !pointInRing(p.ring, x, z)) continue;
    y = Math.max(y, partTop(h, p, x, z));
  }
  return y;
}
// The highest ground along a wall from s0 to s1, half a metre out of it
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}
/** The foot of the lowest storey of a house whose windows stand `y` or higher */
function storeyFrom(house, y) {
  const k = Math.ceil((y - winLo(house) - house.floor) / house.storey - 1e-9);
  return house.floor + k * house.storey;
}
// a shop front on a wall (its segment along the wall's line): the shop's top, or −Infinity
function shopOn(house, F) {
  let top = -Infinity;
  for (const s of house.shops || []) {
    const [a, b] = s.on, d = (p) => Math.abs((p[0] - F.a[0]) * F.n[0] + (p[1] - F.a[1]) * F.n[1]);
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t = (m[0] - F.a[0]) * F.u[0] + (m[1] - F.a[1]) * F.u[1];
    if (d(a) < 0.3 && d(b) < 0.3 && t > 0 && t < F.len) top = Math.max(top, s.top);
  }
  return top;
}

// --- The walls ---------------------------------------------------------------------------------------------------------------
// One wall of a part: its top (the part's roof) and its foot (the base, or the top of a part before it) sampled every
// 0.25 m, cut into runs where both are straight, each run into slices at the levels where its look changes (the
// windows' band)
function wall(B, hi, house, pi, F) {
  const part = house.parts[pi];
  const n = Math.max(1, Math.ceil(F.len / 0.25));
  const sK = [], top = [], bot = [];
  for (let k = 0; k <= n; k++) {
    const s = (F.len * k) / n;
    sK.push(s);
    top.push(partTop(house, part, ...onWall(F, s, -0.05)));
    bot.push(Math.max(house.base, coverAt(part, ...onWall(F, s, 0.3))));
  }
  const mid = F.len / 2, half = mid;
  const shop = shopOn(house, F);
  const boards = onBoards(house, F.a, onWall(F, F.len));
  const colour = boards ? house.boardColour || [0.3, 0.16, 0.07] : part.colour || house.colour;
  const style = boards ? STYLE.boards : part.style ?? house.style ?? 0;
  // the band of windows' top: the last storey whose windows fit under the wall's lowest top
  const minTop = Math.min(...top), hiW = winHi(house);
  let snap = storeyFrom(house, -100);
  while (snap + house.storey + hiW + 0.2 <= minTop) snap += house.storey;
  const bandTop = part.closed ? -Infinity : snap + hiW + 0.2;
  // runs where top and foot are straight
  const runs = [];
  let k0 = 0;
  const straight = (a, b) => {
    for (let k = a + 1; k < b; k++) {
      const f = (sK[k] - sK[a]) / (sK[b] - sK[a]);
      if (Math.abs(top[a] + (top[b] - top[a]) * f - top[k]) > 0.01 || Math.abs(bot[a] + (bot[b] - bot[a]) * f - bot[k]) > 0.01) return false;
    }
    return true;
  };
  for (let k = 1; k <= n; k++) if (!straight(k0, k)) { runs.push([k0, k - 1]); k0 = k - 1; }
  runs.push([k0, n]);
  for (const [ka, kb] of runs) {
    const sa = sK[ka], sb = sK[kb];
    if (sb - sa < 1e-6) continue;
    const ta = top[ka], tb = top[kb], ba = bot[ka], bb = bot[kb];
    if (ta - ba < 0.01 && tb - bb < 0.01) continue;
    // the windows from: over the highest ground along the run where it stands free, over the part before it elsewhere
    const covered = Math.max(ba, bb) > house.base + 0.01;
    const clear = Math.max(0.15, (house.plinth || 0) + 0.1);
    let from = covered ? Math.max(ba, bb) + 0.3 : groundAlong(F, sa, sb) + clear;
    from = Math.max(from, shop + 0.1);
    const win0 = part.closed ? Infinity : storeyFrom(house, from);
    const levels = [win0, bandTop].filter((y) => Number.isFinite(y)).sort((p, q) => p - q);
    // the run cut where its top or foot crosses a level
    const T = (s) => ta + ((tb - ta) * (s - sa)) / (sb - sa), Bt = (s) => ba + ((bb - ba) * (s - sa)) / (sb - sa);
    const cuts = [sa, sb];
    for (const L of levels) for (const [ya, yb] of [[ta, tb], [ba, bb]]) {
      if ((ya - L) * (yb - L) < 0) cuts.push(sa + ((L - ya) / (yb - ya)) * (sb - sa));
    }
    // (and where the foot meets the top)
    if ((ta - ba) * (tb - bb) < 0) cuts.push(sa + ((ba - ta) / ((tb - ta) - (bb - ba))) * (sb - sa));
    cuts.sort((p, q) => p - q);
    const edges = [-Infinity, ...levels, Infinity];
    for (let j = 0; j + 1 < cuts.length; j++) {
      const s0 = cuts[j], s1 = cuts[j + 1];
      if (s1 - s0 < 1e-4) continue;
      for (let e = 0; e + 1 < edges.length; e++) {
        const lo = edges[e], up = edges[e + 1];
        const a0 = Math.max(Bt(s0), lo), a1 = Math.min(T(s0), up), b0 = Math.max(Bt(s1), lo), b1 = Math.min(T(s1), up);
        if (a1 - a0 < 0.002 && b1 - b0 < 0.002) continue;
        const ym = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
        const open = ym >= win0 - 1e-6 && ym <= bandTop + 1e-6;
        const off = open ? 0 : -CLOSED;
        const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
        const V = (y) => vOf(house, y) + off, Uu = (s) => s - mid;
        const A0 = Math.min(a0, a1), B0 = Math.min(b0, b1);
        B.quad('walls', P(s0, A0), P(s1, B0), P(s1, Math.max(b0, b1)), P(s0, Math.max(a0, a1)),
          [[Uu(s0), V(A0)], [Uu(s1), V(B0)], [Uu(s1), V(Math.max(b0, b1))], [Uu(s0), V(Math.max(a0, a1))]],
          { half: halfCode(hi, open ? half : 0, style), colour });
      }
    }
  }
  plinth(B, house, F, sK, bot);
}
// A plinth of grey render along a wall's foot, `plinth` m over the ground where the wall stands free
function plinth(B, house, F, sK, bot) {
  const h = house.plinth || 0.3, n = Math.max(1, Math.ceil(F.len / 1.0));
  for (let k = 0; k < n; k++) {
    const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
    const ia = Math.round((a / F.len) * (sK.length - 1)), ib = Math.round((b / F.len) * (sK.length - 1));
    if (bot[ia] > house.base + 0.01 || bot[ib] > house.base + 0.01) continue;
    const ga = groundHeight(...onWall(F, a, 0.3)) + h, gb = groundHeight(...onWall(F, b, 0.3)) + h;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('trim', P(a, house.base), P(b, house.base), P(b, Math.max(gb, house.base + 0.2)), P(a, Math.max(ga, house.base + 0.2)), undefined, { colour: TRIM.plinth });
  }
}

// --- Roofs ------------------------------------------------------------------------------------------------------------------
// A saddle roof (or one hipped at an end): its faces, the soffit under them, a fascia board round its edges
function roof(B, R) {
  const F = roofFrame(R), L = F.L, [h0, h1] = hips(R);
  const P = (t, c, dy = 0) => { const [x, z] = at(F, t, c); return [x, roofY(R, x, z) + dy, z]; };
  const clampT = (t) => Math.min(Math.max(t, 1e-4), L - 1e-4);
  const faces = [
    [[0, R.cR], [L, R.cR], [L - h1, 0], [h0, 0]],
    [[0, -R.cL], [h0, 0], [L - h1, 0], [L, -R.cL]]
  ];
  if (h0 > 0) faces.push([[0, -R.cL], [0, R.cR], [h0, 0], [h0, 0]]);
  if (h1 > 0) faces.push([[L, R.cR], [L, -R.cL], [L - h1, 0], [L - h1, 0]]);
  for (const f of faces) {
    const pts = f.map(([t, c]) => P(clampT(t), c));
    quadUp(B, 'roof', pts, true);
    quadUp(B, 'trim', pts.map((p) => [p[0], p[1] - 0.12, p[2]]), false, { colour: TRIM.soffit });
  }
  // the fascia: round the outline, along the eaves and up the gables' verges
  const [cx, cz] = at(F, L / 2, (R.cR - R.cL) / 2), centre = [cx, R.eaves - 1, cz];
  const edge = [[0, -R.cL], [0, 0], [0, R.cR], [L, R.cR], [L, 0], [L, -R.cL]];
  for (let i = 0; i < edge.length; i++) {
    const [ta, ca] = edge[i], [tb, cb] = edge[(i + 1) % edge.length];
    const a = P(clampT(ta), ca), b = P(clampT(tb), cb);
    if (Math.hypot(a[0] - b[0], a[2] - b[2]) < 1e-3) continue;
    quadOut(B, 'trim', [[a[0], a[1] + 0.03, a[2]], [b[0], b[1] + 0.03, b[2]], [b[0], b[1] - 0.3, b[2]], [a[0], a[1] - 0.3, a[2]]], centre, { colour: TRIM.fascia });
  }
}
// The eaves slab round a flat part's top: a box along every edge whose wall stands free up there
function slab(B, part, out, thick, colour, y) {
  const R = outwardRing(part.ring);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.3) continue;
    const [x, z] = onWall(F, F.len / 2, 0.3);
    if (coverAt(part, x, z) >= y - 0.05) continue;
    B.box('trim', F, -out, F.len + out, -0.05, out, y - thick, y + 0.03, colour);
  }
}

// A stack of oriel windows out of a wall: a box from the lowest floor up to over the highest, on each floor a window
// band of dark frames round the glass on its front and narrow ones on its cheeks, a painted panel under each
function bays(B, house, Bw) {
  const F = wallOut(house, Bw.on[0], Bw.on[1], featureY(Bw));
  const { s0, s1, out } = Bw, y0 = Math.min(...Bw.floors) - 0.3, y1 = Math.max(...Bw.floors) + house.storey - 0.1;
  const frame = [0.08, 0.06, 0.05], colour = Bw.colour || house.colour;
  B.box('trim', F, s0, s1, 0, out, y0, y1, colour);
  // (the corbel under it)
  B.box('trim', F, s0 + 0.3, s1 - 0.3, 0, out * 0.6, y0 - 0.45, y0, colour.map((v) => v * 0.85));
  const P = (G, s, y, o) => { const [x, z] = onWall(G, s, o); return [x, y, z]; };
  for (const y of Bw.floors) {
    const lo = y + winLo(house), hi = y + winHi(house);
    B.box('trim', F, s0 + 0.25, s1 - 0.25, out, out + 0.04, lo - 0.06, hi + 0.06, frame);
    B.quad('glass', P(F, s0 + 0.35, lo, out + 0.045), P(F, s1 - 0.35, lo, out + 0.045), P(F, s1 - 0.35, hi, out + 0.045), P(F, s0 + 0.35, hi, out + 0.045));
    B.box('trim', F, (s0 + s1) / 2 - 0.04, (s0 + s1) / 2 + 0.04, out + 0.04, out + 0.07, lo, hi, frame);
    // (the painted panel under the window: a dark red square in a light frame)
    B.box('trim', F, s0 + 0.35, s1 - 0.35, out, out + 0.02, y + 0.05, lo - 0.12, [0.62, 0.58, 0.5]);
    B.box('trim', F, (s0 + s1) / 2 - 0.3, (s0 + s1) / 2 + 0.3, out + 0.02, out + 0.03, y + 0.12, lo - 0.19, [0.32, 0.1, 0.06]);
    for (const G of [wallFrame(onWall(F, s0, 0), onWall(F, s0, out)), wallFrame(onWall(F, s1, out), onWall(F, s1, 0))]) {
      B.quad('glass', P(G, 0.12, lo, 0.02), P(G, out - 0.12, lo, 0.02), P(G, out - 0.12, hi, 0.02), P(G, 0.12, hi, 0.02));
    }
  }
}

// A shop front: glass between piers from the ground to its fascia, a sill, the fascia with the shop's lettering, a flat
// dark canopy over it where it has one
function shopFront(B, house, Sp) {
  const F = wallOut(house, Sp.on[0], Sp.on[1], featureY(Sp));
  const s0 = Sp.s0, s1 = Sp.s1, g = groundAlong(F, s0, s1), top = Sp.top, fa = top - (Sp.fascia ?? 0.6);
  const P = (s, y, o) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  const y0 = g + 0.35;
  if (fa - y0 < 1.2) return;
  B.box('trim', F, s0 - 0.1, s1 + 0.1, 0, 0.12, house.base, y0, TRIM.sill);
  B.quad('glass', P(s0, y0, 0.04), P(s1, y0, 0.04), P(s1, fa, 0.04), P(s0, fa, 0.04));
  const n = Math.max(1, Math.round((s1 - s0) / 3.0));
  for (let k = 0; k <= n; k++) {
    const s = s0 + ((s1 - s0) * k) / n;
    B.box('trim', F, s - 0.12, s + 0.12, 0, 0.14, house.base, fa, Sp.piers);
  }
  B.box('trim', F, s0 - 0.25, s1 + 0.25, 0, 0.2, fa, top, Sp.fasciaColour || Sp.piers);
  if (Sp.canopy) {
    const { depth, thick, colour, ext = [0, 0] } = Sp.canopy;
    B.box('trim', F, s0 - 0.3 - ext[0], s1 + 0.3 + ext[1], 0, depth, top, top + thick, colour);
  }
  for (const sg of Sp.signs || []) signOn(B, F, sg.s, 0.215, fa + 0.08, top - 0.08, sg.key, 6.5);
}
// A board from the atlas centred at s on a wall, `o` m before it, from y0 to y1 (its width by the cell's proportions,
// no wider than `max`)
function signOn(B, F, s, o, y0, y1, key, max = Infinity) {
  const [, , w, h] = ATLAS[key];
  let hh = y1 - y0, ww = (hh * w) / h;
  if (ww > max) { hh *= max / ww; ww = max; }
  const yc = (y0 + y1) / 2;
  B.decal(F, s - ww / 2, s + ww / 2, o, yc - hh / 2, yc + hh / 2, key);
}
// The galleries before a front: on each storey a floor of boards out over the ground and a railing round it (no posts)
function galleries(B, house, G) {
  const F = wallOut(house, G.on[0], G.on[1], featureY(G));
  const { s0, s1, depth, colour } = G;
  const rail = colour.map((v) => v * 0.8);
  for (const y of G.ys) {
    B.box('trim', F, s0, s1, 0, depth, y - 0.2, y, colour);
    B.box('trim', F, s0, s1, depth - 0.06, depth, y, y + 1.0, rail);
    for (const s of [s0, s1 - 0.06]) B.box('trim', F, s, s + 0.06, 0, depth - 0.06, y, y + 1.0, rail);
  }
}
// A window in a gable: a light frame round the glass, a sill
function gableWindow(B, house, W) {
  const F = wallOut(house, W.on[0], W.on[1], W.y0);
  const P = (s, y) => { const [x, z] = onWall(F, s, 0.05); return [x, y, z]; };
  const h = W.w / 2;
  B.box('trim', F, W.s - h - 0.1, W.s + h + 0.1, 0, 0.04, W.y0 - 0.1, W.y1 + 0.1, TRIM.winFrame);
  B.quad('glass', P(W.s - h, W.y0), P(W.s + h, W.y0), P(W.s + h, W.y1), P(W.s - h, W.y1));
  B.box('trim', F, W.s - h - 0.12, W.s + h + 0.12, 0, 0.12, W.y0 - 0.16, W.y0 - 0.08, TRIM.sill);
}
// White quoins at a part's outer corners: a strip either side of each corner from the plinth to the wall's top there
function quoins(B, house, part) {
  const R = outwardRing(part.ring);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 3) continue;
    for (const [s0, s1] of [[0, 0.5], [F.len - 0.5, F.len]]) {
      const sm = (s0 + s1) / 2, [x, z] = onWall(F, sm, -0.05);
      const top = Math.min(partTop(house, part, ...onWall(F, s0, -0.05)), partTop(house, part, ...onWall(F, s1, -0.05))) - 0.1;
      if (coverAt(part, ...onWall(F, sm, 0.3)) > house.base + 0.01) continue;
      const g = groundHeight(x, z) + (house.plinth || 0.3);
      if (top - g > 1) B.box('trim', F, s0, s1, 0, 0.03, g, top, TRIM.quoin);
    }
  }
}

/** The camera spots for a look along the street */
export { VIEWS } from './promenade-dorf-nord-data.js';

/**
 * Builds the row into `scene`. Returns { group, colliders }: none, the houses' walls standing on their surveyed outlines
 * (js/landmarks.js); the canopies, oriels and galleries hang over the ground, the shop fronts' sills and piers stand
 * within 0.25 m of the walls.
 */
export function buildPromenadeDorfNord(scene) {
  const root = new THREE.Group();
  root.name = 'Promenade Dorf Nord';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Promenade Dorf Nord' }), M = materials();
  HOUSES.forEach((house, hi) => {
    house.parts.forEach((part, pi) => {
      const R = outwardRing(part.ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len >= 0.05) wall(B, hi, house, pi, F);
      }
      if (part.top !== undefined) flatRoof(B, R, part.top);
      if (house.quoins && !part.closed) quoins(B, house, part);
    });
    for (const R of house.roofs || []) roof(B, R);
    const Cn = house.cornice;
    if (Cn) house.parts.forEach((p, pi) => { if (p.top !== undefined && (!Cn.parts || Cn.parts.includes(pi))) slab(B, p, Cn.out, Cn.thick, Cn.colour, p.top); });
    for (const Bw of house.bays || []) bays(B, house, Bw);
    for (const Sp of house.shops || []) shopFront(B, house, Sp);
    for (const Lt of house.letters || []) {
      const F = wallOut(house, Lt.on[0], Lt.on[1], featureY(Lt));
      if (Lt.board) B.box('trim', F, Lt.s0 - 0.08, Lt.s1 + 0.08, 0, 0.1, Lt.y0 - 0.1, Lt.y1 + 0.1, Lt.board);
      signOn(B, F, (Lt.s0 + Lt.s1) / 2, Lt.board ? 0.115 : 0.03, Lt.y0, Lt.y1, Lt.key, Lt.s1 - Lt.s0);
    }
    for (const G of house.balconies || []) galleries(B, house, G);
    for (const W of house.gableWins || []) gableWindow(B, house, W);
  });
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
