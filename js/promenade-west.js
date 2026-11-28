import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, rectMask, twoTones, worldNoise } from './building-kit.js';
import { BAY, HOUSES, STOREY, WIN, at, groundOutlines, onWall, outwardRing, partTop, pointInRing, roofFrame, roofY, wallFrame, wallOut } from './promenade-west-data.js';

export { HOUSES };

// The houses along the Promenade in Davos Platz from the fire station past the Club Hotel to the Krematorium and the
// bend past the Spital rebuilt by hand (js/promenade-west-data.js), standing in for their swissBUILDINGS3D volumes,
// which the streamed tiles drew as white blocks: each house's surveyed volumes, its saddle roofs on their eaves, its
// render's colour, planks on the chalets' upper floors, windows drawn by the walls' material from their uv (metres along
// the wall from its middle, metres up the house's floors' grid) with the shutters of their house, shop fronts with
// their lettering, the fire station's doors, balconies, eaves slabs. One merged mesh per material for the whole row: the
// walls (their colours as vertex colours), the dark roofs, the trim (vertex colours), the shop windows' glass and the
// decals (the shops' lettering, the Krematorium's half-round windows).

for (const h of HOUSES) excludeBuildings(h.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js)
for (const h of HOUSES) SURVEYED_FOOTPRINTS.set(h.id, groundOutlines(h));
// (the shops lettered on their own fascias here)
for (const h of HOUSES) for (const id of h.shopIds || []) SHOP_EXCLUSIONS.add(id);

const S = STOREY;
// v of a wall: metres up its house's floors' grid (the ground floor's foot at 40 storeys); closed walls carry
// v − CLOSED, planks ± TIMBER (all multiples of a storey: the window grid's place in its storey stays)
const UP = 40 * S, CLOSED = 300 * S, TIMBER = 1000 * S;
const vOf = (house, y) => y - house.floor + UP;
// aHalf: the half length the bays are laid out on, + 1000 × the shutters' kind + 10000 × the house's index
const halfCode = (hi, house, half) => half + 1000 * house.shutters + 10000 * hi;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.1, 0.096, 0.092], FRAME_C = [0.6, 0.6, 0.57];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  M.glass = SIMPLE_SKINS.glow([0.03, 0.036, 0.042], 0.1, 0.5, [1.0, 0.8, 0.56], 0.3);
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the houses' colours from the vertices, a window per bay and floor, lit at night)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], S, WIN.lo / S, WIN.hi / S, 0.85, 0.3, { bay: BAY, half: WIN.half });
    M.walls.vertexColors = true;
    return M;
  }
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const U = uv().x, V = uv().y, A = attribute('aHalf', 'float');
  // (the packed code rounded before it is cut up: a value arriving a hair low must not read as its neighbour's)
  const hi = floor(A.add(0.5).div(10000)), rest = A.sub(hi.mul(10000)), kind = floor(rest.add(0.5).div(1000)), half = rest.sub(kind.mul(1000));
  const planks = step(2000, V).add(step(V, -2000));
  const bay = floor(U.div(BAY).add(0.5)), bu = U.sub(bay.mul(BAY));
  const storey = floor(V.div(S)), fv = V.sub(storey.mul(S));
  // (a window and its shutters fit in the wall)
  const open = step(abs(bay.mul(BAY)).add(WIN.half + 0.45), half);
  const rect = (hw, lo, hiY) => rectMask(bu, fv, hw, lo, hiY);
  // the render with a little weathering; planks: a course every 0.2 m, each a shade of its own, dark joints
  const base = attribute('color', 'vec3');
  const render = base.mul(mix(float(0.95), float(1.05), worldNoise(0.4)));
  const course = V.div(0.2).floor(), fc = fract(V.div(0.2));
  const joint = smoothstep(0.12, 0.0, fc).max(smoothstep(0.88, 1.0, fc)).mul(fine).mul(0.45);
  const wood = base.mul(hash(course.mul(17.3)).mul(0.3).add(0.85)).mul(float(1).sub(joint));
  const wall = mix(render, wood, planks);
  // the shutters beside each window: grey-green, white (louvred) or brown by the house
  const sh = rect(WIN.half + 0.5, WIN.lo, WIN.hi).sub(rect(WIN.half + 0.06, WIN.lo - 0.02, WIN.hi + 0.02)).max(0)
    .mul(open).mul(step(0.5, kind));
  const slats = smoothstep(0.02, 0.0, abs(fract(fv.div(0.09)).sub(0.5)).sub(0.4)).mul(fine).mul(0.25);
  const shC = mix(mix(vec3(0.11, 0.15, 0.12), vec3(0.58, 0.58, 0.55), step(1.5, kind)), vec3(0.2, 0.06, 0.04), step(2.5, kind)).mul(float(1).sub(slats));
  // a window: a white frame, a post and a rail (four panes), a sill under it, a curtain drawn in some
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
  let c = mix(wall, shC, sh);
  c = mix(c, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, vec3(...FRAME_C), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.88), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay.add(hi.mul(31)), storey, 71, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1));
  M.walls = m;
  return M;
}

// --- The lettering and the Krematorium's windows: one canvas atlas ------------------------------------------------------
const ATLAS_SIZE = [512, 256];
export const ATLAS = { claro: [0, 0, 512, 64], ganzheis: [0, 64, 352, 64], bico: [352, 64, 160, 64], rose: [0, 128, 256, 128] };
function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  const board = (bg, fg, text, font, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  };
  cell('claro', (w, h) => {
    board('#2f5d3a', '#ffffff', 'Claro  midenand Lade', `700 ${Math.round(h * 0.52)}px sans-serif`, w, h);
    g.fillStyle = '#e8b23a'; g.fillRect(10, h * 0.25, 10, h * 0.5);
  });
  cell('ganzheis', (w, h) => board('#5b2a1c', '#f3e3c3', 'GanzHeis', `700 ${Math.round(h * 0.6)}px serif`, w, h));
  cell('bico', (w, h) => board('#1f56a6', '#ffffff', 'bico', `700 ${Math.round(h * 0.7)}px sans-serif`, w, h));
  // the half-round window: a grey stone arch, dark glass parted by radial bars
  cell('rose', (w, h) => {
    const cx = w / 2, cy = h - 6, R = Math.min(w / 2, h) - 6;
    g.fillStyle = '#8c8a84'; g.beginPath(); g.arc(cx, cy, R, Math.PI, 0); g.closePath(); g.fill();
    g.fillStyle = '#16191c'; g.beginPath(); g.arc(cx, cy, R - 10, Math.PI, 0); g.closePath(); g.fill();
    g.strokeStyle = '#8c8a84'; g.lineWidth = 5;
    for (let k = 1; k < 6; k++) { const a = Math.PI + (k * Math.PI) / 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); g.stroke(); }
    g.beginPath(); g.arc(cx, cy, (R - 10) * 0.45, Math.PI, 0); g.stroke();
    g.fillStyle = '#8c8a84'; g.fillRect(cx - R, cy - 1, 2 * R, 7);
  });
  return canvasTexture(canvas);
}

// --- Geometry helpers ------------------------------------------------------------------------------------------------------
const TRIM = {
  plinth: [0.22, 0.215, 0.205], frame: FRAME_C, soffit: [0.09, 0.05, 0.028], fascia: [0.11, 0.058, 0.03],
  concrete: [0.36, 0.35, 0.33], timber: [0.14, 0.072, 0.038], metal: [0.2, 0.21, 0.22], sill: [0.3, 0.29, 0.27],
  door: [0.16, 0.12, 0.09]
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
// (a point inside one of the row's parts but `self`: the highest of their tops there, or −Infinity)
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
  const k = Math.ceil((y - WIN.lo - house.floor) / S - 1e-9);
  return house.floor + k * S;
}
const timberOn = (house, pi, F) => {
  const T = house.timber;
  if (!T || (T.parts && !T.parts.includes(pi))) return Infinity;
  if (T.facing && F.n[0] * T.facing[0] + F.n[1] * T.facing[1] < 0.6) return Infinity;
  return T.from;
};
// a shop front or a garage's doors on a wall (its segment along the wall's line): the top they reach, or −Infinity
function frontOn(house, F) {
  let top = -Infinity;
  for (const s of [...(house.shops || []), ...(house.garages || [])]) {
    const [a, b] = s.on, d = (p) => Math.abs((p[0] - F.a[0]) * F.n[0] + (p[1] - F.a[1]) * F.n[1]);
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t = (m[0] - F.a[0]) * F.u[0] + (m[1] - F.a[1]) * F.u[1];
    if (d(a) < 0.3 && d(b) < 0.3 && t > 0 && t < F.len) {
      const G = wallOut(house, a, b);
      top = Math.max(top, groundAlong(G, s.s0, s.s1) + (s.rise ?? s.h + 0.3));
    }
  }
  return top;
}

// --- The walls ---------------------------------------------------------------------------------------------------------------
// One wall of a part: its top (the part's roof) and its foot (the base, or the top of a part before it) sampled every
// 0.25 m, cut into runs where both are straight, each run into slices at the levels where its look changes (the
// windows' band, the planks); the gables' windows as trim over the band
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
  const tBand = timberOn(house, pi, F), front = frontOn(house, F);
  // the band of windows' top: the last storey whose windows fit under the wall's lowest top
  const minTop = Math.min(...top);
  let snap = storeyFrom(house, -100);
  while (snap + S + WIN.hi + 0.2 <= minTop) snap += S;
  const bandTop = part.closed ? -Infinity : snap + WIN.hi + 0.2;
  const colour = part.colour || house.colour;
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
    from = Math.max(from, front + 0.1);
    const win0 = part.closed ? Infinity : storeyFrom(house, from);
    const levels = [win0, bandTop, tBand].filter((y) => Number.isFinite(y)).sort((p, q) => p - q);
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
        const ym = (Math.max(a0, b0) + Math.min(a1, b1)) / 2, yc = (a0 + a1 + b0 + b1) / 4;
        const open = ym >= win0 - 1e-6 && ym <= bandTop + 1e-6;
        const wood = yc >= tBand;
        const col = wood ? house.timber.colour || [0.2, 0.105, 0.055] : colour;
        const off = (wood ? (open ? TIMBER : -TIMBER) : 0) - (open ? 0 : CLOSED);
        const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
        const V = (y) => vOf(house, y) + off, Uu = (s) => s - mid;
        const A0 = Math.min(a0, a1), B0 = Math.min(b0, b1);
        B.quad('walls', P(s0, A0), P(s1, B0), P(s1, Math.max(b0, b1)), P(s0, Math.max(a0, a1)),
          [[Uu(s0), V(A0)], [Uu(s1), V(B0)], [Uu(s1), V(Math.max(b0, b1))], [Uu(s0), V(Math.max(a0, a1))]],
          { half: open ? halfCode(hi, house, half) : 0, colour: col });
      }
    }
  }
  // the gable's windows: a storey or two over the band where the gable is wide enough
  if (part.roofs && !part.closed) {
    for (let y = snap + S; y + WIN.hi + 0.3 < Math.max(...top); y += S) {
      const need = y + WIN.hi + 0.3;
      let g0 = null, g1 = null;
      for (let k = 0; k <= n; k++) if (top[k] >= need && bot[k] < y + WIN.lo - 0.1) { if (g0 === null) g0 = sK[k]; g1 = sK[k]; }
      if (g0 === null || g1 - g0 < 1.6) continue;
      const m = (g0 + g1) / 2, list = g1 - g0 > 4.6 ? [m - 1.15, m + 1.15] : [m];
      for (const s of list) gableWindow(B, F, s, y);
    }
  }
  plinth(B, house, F, sK, bot);
}
// A window in a gable: its white frame, a post, its glass (lit at night with the shop windows)
function gableWindow(B, F, s, y) {
  const h = WIN.half;
  B.box('trim', F, s - h - 0.07, s + h + 0.07, 0, 0.05, y + WIN.lo - 0.07, y + WIN.hi + 0.07, TRIM.frame);
  B.box('trim', F, s - 0.035, s + 0.035, 0.08, 0.11, y + WIN.lo, y + WIN.hi, TRIM.frame);
  const P = (q, yy) => { const [x, z] = onWall(F, q, 0.08); return [x, yy, z]; };
  B.quad('glass', P(s - h, y + WIN.lo), P(s + h, y + WIN.lo), P(s + h, y + WIN.hi), P(s - h, y + WIN.hi));
}
// A plinth of grey render along a wall's foot, `plinth` m over the ground where the wall stands free
function plinth(B, house, F, sK, bot) {
  const h = house.plinth || 0.3, n = Math.max(1, Math.ceil(F.len / 1.5));
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
// A saddle roof: its two faces, the soffit under them, a fascia board round its edges
function roof(B, R) {
  const F = roofFrame(R), L = F.L;
  const P = (t, c, dy = 0) => { const [x, z] = at(F, t, c); return [x, roofY(R, x, z) + dy, z]; };
  const faces = [
    [[0, R.cR], [L, R.cR], [L, 0], [0, 0]],
    [[0, -R.cL], [0, 0], [L, 0], [L, -R.cL]]
  ];
  for (const f of faces) {
    // (the ridge's points a hair inside, so that roofY there is the ridge's)
    const pts = f.map(([t, c]) => P(Math.min(Math.max(t, 1e-4), L - 1e-4), c));
    quadUp(B, 'roof', pts, true);
    quadUp(B, 'trim', pts.map((p) => [p[0], p[1] - 0.1, p[2]]), false, { colour: TRIM.soffit });
  }
  // the fascia: round the outline, along the eaves and up the verges
  const [cx, cz] = at(F, L / 2, (R.cR - R.cL) / 2), centre = [cx, Math.min(R.eL, R.eR) - 1, cz];
  const edge = [[0, -R.cL], [L, -R.cL], [L - 1e-4, 0], [L, R.cR], [0, R.cR], [1e-4, 0]];
  for (let i = 0; i < edge.length; i++) {
    const [ta, ca] = edge[i], [tb, cb] = edge[(i + 1) % edge.length];
    const a = P(Math.min(Math.max(ta, 1e-4), L - 1e-4), ca), b = P(Math.min(Math.max(tb, 1e-4), L - 1e-4), cb);
    quadOut(B, 'trim', [[a[0], a[1] + 0.03, a[2]], [b[0], b[1] + 0.03, b[2]], [b[0], b[1] - 0.26, b[2]], [a[0], a[1] - 0.26, a[2]]], centre, { colour: TRIM.fascia });
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

// A balcony: its slab out of the wall, a railing of timber boards round its three free sides
function balcony(B, house, Bl) {
  const F = wallOut(house, Bl.on[0], Bl.on[1]);
  const s0 = Bl.s0 ?? 0.2, s1 = Bl.s1 ?? F.len - 0.2, d = Bl.depth, rh = 1.0, K = TRIM.timber;
  for (const y of Bl.floors) {
    B.box('trim', F, s0, s1, 0, d, y - 0.2, y, K);
    const sides = [
      { G: F, a: s0, b: s1, o: d },
      { G: wallFrame(onWall(F, s0, 0), onWall(F, s0, d)), a: 0, b: d, o: 0 },
      { G: wallFrame(onWall(F, s1, d), onWall(F, s1, 0)), a: 0, b: d, o: 0 }
    ];
    for (const { G, a, b, o } of sides) {
      B.box('trim', G, a, b, o - 0.06, o + 0.02, y + rh - 0.07, y + rh, K);
      B.box('trim', G, a, b, o - 0.04, o, y + 0.1, y + rh - 0.12, K);
    }
  }
}

// A shop front: glass between piers from the ground to its fascia, a sill, the fascia with its lettering
function shopFront(B, house, Sp) {
  const F = wallOut(house, Sp.on[0], Sp.on[1]);
  const s0 = Sp.s0, s1 = Sp.s1, g = groundAlong(F, s0, s1), top = g + Sp.rise, fa = top - 0.7;
  const P = (s, y, o) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  const y0 = g + 0.35;
  B.box('trim', F, s0 - 0.1, s1 + 0.1, 0, 0.12, house.base, y0, TRIM.sill);
  B.quad('glass', P(s0, y0, 0.04), P(s1, y0, 0.04), P(s1, fa, 0.04), P(s0, fa, 0.04));
  const n = Math.max(1, Math.round((s1 - s0) / 3.0));
  for (let k = 0; k <= n; k++) {
    const s = s0 + ((s1 - s0) * k) / n;
    B.box('trim', F, s - 0.15, s + 0.15, 0, 0.14, house.base, fa, Sp.piers);
  }
  B.box('trim', F, s0 - 0.25, s1 + 0.25, 0, 0.2, fa, top, Sp.piers);
  if (Sp.sign) {
    const [, , aw, ah] = ATLAS[Sp.sign], h = 0.6, w = Math.min(s1 - s0 - 0.4, (h * aw) / ah), m = (s0 + s1) / 2;
    B.decal(F, m - w / 2, m + w / 2, 0.21, fa + 0.05, fa + 0.05 + (w * ah) / aw, Sp.sign);
  }
}

// A garage's doors: `n` panels in their colour, a frame round each, a step of concrete under them
function garages(B, house, Gd) {
  const F = wallOut(house, Gd.on[0], Gd.on[1]), g = groundAlong(F, Gd.s0, Gd.s1);
  const w = (Gd.s1 - Gd.s0) / Gd.n;
  B.box('trim', F, Gd.s0 - 0.2, Gd.s1 + 0.2, 0, 0.6, house.base, g + 0.05, TRIM.concrete);
  for (let k = 0; k < Gd.n; k++) {
    const a = Gd.s0 + k * w + 0.2, b = Gd.s0 + (k + 1) * w - 0.2;
    B.box('trim', F, a - 0.12, b + 0.12, 0, 0.05, g, g + Gd.h + 0.12, TRIM.frame);
    B.box('trim', F, a, b, 0.05, 0.08, g + 0.05, g + Gd.h, Gd.colour);
  }
  // the canopy over the doors
  B.box('trim', F, Gd.s0 - 0.3, Gd.s1 + 0.3, 0, 1.6, g + Gd.h + 0.35, g + Gd.h + 0.6, [0.55, 0.55, 0.53]);
}

/** The camera spots for a look along the street */
export { VIEWS } from './promenade-west-data.js';

/**
 * Builds the row into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand on the
 * surveyed outlines, js/landmarks.js; the balconies, eaves and canopies hang over the ground, the shop fronts' sills and
 * the doors' steps stand within 0.6 m of the walls).
 */
export function buildPromenadeWest(scene) {
  const root = new THREE.Group();
  root.name = 'Promenade west';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Promenade west' }), M = materials();
  HOUSES.forEach((house, hi) => {
    house.parts.forEach((part, pi) => {
      const R = outwardRing(part.ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len >= 0.05) wall(B, hi, house, pi, F);
      }
      if (part.top !== undefined) flatRoof(B, R, part.top);
    });
    for (const R of house.roofs || []) roof(B, R);
    const C = house.cornice;
    if (C) house.parts.forEach((p, pi) => { if (p.top !== undefined && !p.closed && (!C.parts || C.parts.includes(pi))) slab(B, p, C.out, C.thick, C.colour, p.top); });
    for (const Bl of house.balconies || []) balcony(B, house, Bl);
    for (const Sp of house.shops || []) shopFront(B, house, Sp);
    for (const Gd of house.garages || []) garages(B, house, Gd);
    for (const D of house.decals || []) { const F = wallOut(house, D.on[0], D.on[1]); B.decal(F, D.s0, D.s1, 0.04, D.y0, D.y1, D.key); }
  });
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
