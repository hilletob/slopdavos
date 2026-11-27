import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, rectMask, twoTones, worldNoise } from './building-kit.js';
import {
  BAY, HOUSES, SHOP_IDS, STOREY, WIN, at, featureY, groundOutlines, hips, onWall, outwardRing, partTop, pointInRing, roofFrame, roofY, wallFrame, wallOut
} from './promenade-dorf-data.js';

export { HOUSES };

// The houses along the Promenade in Davos Dorf round the Migros Dorf rebuilt by hand (js/promenade-dorf-data.js),
// standing in for their swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses'
// windows: each house's surveyed volumes, the shallow hipped roofs on deep dark eaves of the corner house and the Hotel
// Isabella, the plaster's colours, windows drawn by the walls' material from their uv (metres along the wall from its
// middle, metres up the house's floors' grid), the shop fronts with their awnings and dark canopies, the kiosk's
// red-framed glass, timber balconies, the terraces' railings, white corner strips and cornices, the lettering of the
// shops and the houses (Müller, coop, Kindercafé Falclas, AlpäTraum, Dorf-Drogerie, ISABELLA, Haus Tafaas, the
// Graubündner Kantonalbank's fascia), the bank's bay windows and loggias. One
// merged mesh per material for the whole row: the walls (their colours as vertex colours), the roofs, the trim (vertex
// colours), the shop windows' glass and the lettering (one canvas atlas).

for (const h of HOUSES) excludeBuildings(h.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js)
// (a house OpenStreetMap does not have, the bank's: no walls from js/buildings.js, the module's colliders instead)
for (const h of HOUSES) if (h.id) SURVEYED_FOOTPRINTS.set(h.id, groundOutlines(h));
// (the shops' signs lettered here, on these walls: js/shops.js leaves them out)
for (const id of SHOP_IDS) SHOP_EXCLUSIONS.add(id);

const S = STOREY;
// v of a wall: metres up its house's floors' grid (the ground floor's foot at 40 storeys); closed walls carry v − CLOSED
const UP = 40 * S, CLOSED = 300 * S;
const vOf = (house, y) => y - house.floor + UP;
// aHalf: the half length the bays are laid out on, + 10000 × the house's index (its lit windows of its own)
const halfCode = (hi, half) => half + 10000 * hi;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.1, 0.096, 0.092], FRAME_C = [0.56, 0.55, 0.51];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  M.glass = SIMPLE_SKINS.glow([0.03, 0.036, 0.042], 0.1, 0.5, [1.0, 0.8, 0.56], 0.3);
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the houses' colours from the vertices, a lit band per floor at night)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], S, WIN.lo / S, WIN.hi / S, 0.85, 0.3);
    M.walls.vertexColors = true;
    return M;
  }
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const U = uv().x, V = uv().y, A = attribute('aHalf', 'float');
  const hi = floor(A.add(0.5).div(10000)), half = A.sub(hi.mul(10000));
  const bay = floor(U.div(BAY).add(0.5)), bu = U.sub(bay.mul(BAY));
  const storey = floor(V.div(S)), fv = V.sub(storey.mul(S));
  // (a window fits in the wall)
  const open = step(abs(bay.mul(BAY)).add(WIN.half + 0.4), half);
  const rect = (hw, lo, hiY) => rectMask(bu, fv, hw, lo, hiY);
  // the plaster with a little weathering
  const base = attribute('color', 'vec3');
  const wall = base.mul(mix(float(0.95), float(1.05), worldNoise(0.4)));
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
  let c = mix(wall, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, vec3(...FRAME_C), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.88), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (flats and a hotel: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay.add(hi.mul(31)), storey, 61, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1));
  M.walls = m;
  return M;
}

// --- The lettering: one canvas atlas ----------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 256];
export const ATLAS = {
  muller: [0, 0, 512, 64],
  isabella: [512, 0, 512, 64],
  falclas: [0, 64, 512, 64],
  alpatraum: [512, 64, 512, 64],
  drogerie: [0, 128, 512, 64],
  tafaas: [512, 128, 320, 64],
  coop: [832, 128, 192, 64],
  gkb: [0, 192, 640, 64]
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
  // a board round its lettering, centred in the cell
  const board = (w, h, bw, colour) => { g.fillStyle = colour; g.fillRect((w - bw) / 2, 4, bw, h - 8); };
  // Müller: white on its orange board, the white M in its square on the left
  cell('muller', (w, h) => {
    board(w, h, 250, '#f39200');
    g.fillStyle = '#ffffff'; g.fillRect((w - 250) / 2 + 10, 12, h - 24, h - 24);
    text('M', (w - 250) / 2 + 10 + (h - 24) / 2, h / 2 + 1, 34, '#f39200', 900);
    text('Müller', w / 2 + 26, h / 2 + 2, 40, '#ffffff', 900);
  });
  // ISABELLA in brown capitals on the plaster
  cell('isabella', (w, h) => { text('ISABELLA', w / 2, h / 2 + 2, 50, '#6a4a22', 700, 'serif'); });
  // the café's and the shop's boards
  cell('falclas', (w, h) => { board(w, h, 420, '#4a2d1d'); text('Kindercafé Falclas', w / 2, h / 2 + 2, 36, '#f3e3c3', 700, 'serif'); });
  cell('alpatraum', (w, h) => { board(w, h, 260, '#4a2d1d'); text('AlpäTraum', w / 2, h / 2 + 2, 40, '#f3e3c3', 700, 'serif'); });
  cell('drogerie', (w, h) => {
    board(w, h, 400, '#2e9d47');
    g.fillStyle = '#ffffff'; g.fillRect((w - 400) / 2 + 10, 12, h - 24, h - 24);
    g.fillStyle = '#2e9d47'; g.fillRect((w - 400) / 2 + 10 + 16, 16, 8, h - 32); g.fillRect((w - 400) / 2 + 10 + 4, 28, h - 32, 8);
    text('Dorf-Drogerie Davos', w / 2 + 22, h / 2 + 2, 32, '#ffffff', 700);
  });
  // Haus Tafaas in grey-brown on the plaster
  cell('tafaas', (w, h) => { text('Haus Tafaas', w / 2, h / 2 + 2, 42, '#5b4e3c', 500, 'serif'); });
  // coop: the orange letters
  cell('coop', (w, h) => { text('coop', w / 2, h / 2 + 3, 62, '#e8601c', 800); });
  // the bank's name in plain dark letters on its white fascia
  cell('gkb', (w, h) => { text('Graubündner Kantonalbank', w / 2, h / 2 + 2, 40, '#2a2c30', 600); });
  return canvasTexture(canvas);
}

// --- Geometry helpers ------------------------------------------------------------------------------------------------------
const TRIM = {
  plinth: [0.22, 0.215, 0.205], frame: FRAME_C, soffit: [0.07, 0.045, 0.03], fascia: [0.1, 0.06, 0.035],
  concrete: [0.36, 0.35, 0.33], timber: [0.3, 0.1, 0.05], metal: [0.2, 0.21, 0.22], sill: [0.3, 0.29, 0.27]
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
  const k = Math.ceil((y - WIN.lo - house.floor) / S - 1e-9);
  return house.floor + k * S;
}
function bandColour(house, part, y) {
  for (const [top, colour] of part.bands || []) if (y < top) return colour;
  return part.colour || house.colour;
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
// windows' band, the plaster's bands)
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
  // the band of windows' top: the last storey whose windows fit under the wall's lowest top
  const minTop = Math.min(...top);
  let snap = storeyFrom(house, -100);
  while (snap + S + WIN.hi + 0.2 <= minTop) snap += S;
  const bandTop = part.closed ? -Infinity : snap + WIN.hi + 0.2;
  const bands = (part.bands || []).map(([y]) => y);
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
    const levels = [win0, bandTop, ...bands].filter((y) => Number.isFinite(y)).sort((p, q) => p - q);
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
        const colour = bandColour(house, part, yc);
        const off = open ? 0 : -CLOSED;
        const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
        const V = (y) => vOf(house, y) + off, Uu = (s) => s - mid;
        const A0 = Math.min(a0, a1), B0 = Math.min(b0, b1);
        B.quad('walls', P(s0, A0), P(s1, B0), P(s1, Math.max(b0, b1)), P(s0, Math.max(a0, a1)),
          [[Uu(s0), V(A0)], [Uu(s1), V(B0)], [Uu(s1), V(Math.max(b0, b1))], [Uu(s0), V(Math.max(a0, a1))]],
          { half: open ? halfCode(hi, half) : 0, colour });
      }
    }
  }
  plinth(B, house, F, sK, bot);
  if (part.frieze) frieze(B, part, F);
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
// An ornamented band round a part (the Isabella's under its top floor): where the wall stands free at its height
function frieze(B, part, F) {
  const { y, h, colour } = part.frieze;
  if (F.len < 0.5 || coverAt(part, ...onWall(F, F.len / 2, 0.3)) >= y) return;
  B.box('trim', F, 0, F.len, 0, 0.05, y, y + h, colour);
  B.box('trim', F, 0, F.len, 0, 0.08, y - 0.06, y, colour.map((v) => v * 0.8));
}
// Light strips up a part's outer corners (the Isabella's and the Coop's): 0.55 m on each wall, from y0 (or the top of
// a part before them) to their colour's top or the wall's
function quoins(B, house, part) {
  const R = outwardRing(part.ring), n = R.length, w = 0.55;
  const { colour, y0 = house.floor, y1 = Infinity } = part.quoins;
  for (let i = 0; i < n; i++) {
    const F1 = wallFrame(R[(i + n - 1) % n], R[i]), F2 = wallFrame(R[i], R[(i + 1) % n]);
    if (F1.len < w + 0.4 || F2.len < w + 0.4) continue;
    const [cx, cz] = R[i], ox = (F1.n[0] + F2.n[0]) * 0.35, oz = (F1.n[1] + F2.n[1]) * 0.35;
    // (convex: a step out of the corner leaves the part, a step in stays in it)
    if (pointInRing(part.ring, cx + ox, cz + oz) || !pointInRing(part.ring, cx - ox, cz - oz)) continue;
    const from = Math.max(y0, coverAt(part, ...onWall(F2, 0.3, 0.3)), coverAt(part, ...onWall(F1, F1.len - 0.3, 0.3)), groundHeight(cx, cz));
    const to = Math.min(y1, partTop(house, part, cx, cz) - 0.05);
    if (to - from < 1.0) continue;
    B.box('trim', F1, F1.len - w, F1.len + 0.05, 0, 0.05, from, to, colour);
    B.box('trim', F2, 0, w, 0, 0.05, from, to, colour);
  }
}

// --- Roofs ------------------------------------------------------------------------------------------------------------------
// A hipped roof: its faces (two sides, the hips' ends), the soffit under them, a fascia board round its edges
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
  // the fascia: round the outline, along the eaves
  const [cx, cz] = at(F, L / 2, (R.cR - R.cL) / 2), centre = [cx, R.eaves - 1, cz];
  const edge = [[0, -R.cL], [L, -R.cL], [L, R.cR], [0, R.cR]];
  for (let i = 0; i < edge.length; i++) {
    const [ta, ca] = edge[i], [tb, cb] = edge[(i + 1) % edge.length];
    const a = P(clampT(ta), ca), b = P(clampT(tb), cb);
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

// A balcony: its slab out of the wall, a railing of timber boards round its three free sides
function balcony(B, house, Bl) {
  const F = wallOut(house, Bl.on[0], Bl.on[1], featureY(Bl));
  const s0 = Bl.s0 ?? 0.2, s1 = Bl.s1 ?? F.len - 0.2, d = Bl.depth, rh = 1.0;
  for (const y of Bl.floors) {
    B.box('trim', F, s0, s1, 0, d, y - 0.2, y, TRIM.concrete);
    const sides = [
      { G: F, a: s0, b: s1, o: d },
      { G: wallFrame(onWall(F, s0, 0), onWall(F, s0, d)), a: 0, b: d, o: 0 },
      { G: wallFrame(onWall(F, s1, d), onWall(F, s1, 0)), a: 0, b: d, o: 0 }
    ];
    for (const { G, a, b, o } of sides) {
      B.box('trim', G, a, b, o - 0.06, o + 0.02, y + rh - 0.08, y + rh, TRIM.timber);
      B.box('trim', G, a, b, o - 0.04, o, y + 0.12, y + rh - 0.1, TRIM.timber.map((v) => v * 0.85));
      const k = Math.max(1, Math.round((b - a) / 1.8));
      for (let j = 0; j <= k; j++) {
        const s = a + ((b - a) * j) / k;
        B.box('trim', G, s - 0.04, s + 0.04, o - 0.07, o + 0.01, y, y + rh, TRIM.timber);
      }
    }
    // a loggia's timber cheeks at its ends, up to the slab over it (or the eaves)
    if (Bl.loggia) for (const s of [s0, s1 - 0.14]) B.box('trim', F, s, s + 0.14, 0, d, y, Math.min(y + STOREY - 0.2, Bl.loggia), TRIM.timber);
  }
}

// A stack of bay windows out of a wall: a white box from the lowest floor up to over the highest, on each floor a
// window band of brown frames round the glass on its front and narrow ones on its cheeks
function bays(B, house, Bw) {
  const F = wallOut(house, Bw.on[0], Bw.on[1], Math.min(...Bw.floors));
  const { s0, s1, out } = Bw, y0 = Math.min(...Bw.floors) + 0.1, y1 = Math.max(...Bw.floors) + STOREY - 0.1;
  const frame = [0.2, 0.1, 0.05];
  B.box('trim', F, s0, s1, 0, out, y0, y1, house.colour);
  const P = (G, s, y, o) => { const [x, z] = onWall(G, s, o); return [x, y, z]; };
  for (const y of Bw.floors) {
    const lo = y + WIN.lo, hi = y + WIN.hi;
    B.box('trim', F, s0 + 0.25, s1 - 0.25, out, out + 0.04, lo - 0.06, hi + 0.06, frame);
    B.quad('glass', P(F, s0 + 0.35, lo, out + 0.045), P(F, s1 - 0.35, lo, out + 0.045), P(F, s1 - 0.35, hi, out + 0.045), P(F, s0 + 0.35, hi, out + 0.045));
    // (the posts between three panes)
    for (const f of [1 / 3, 2 / 3]) { const s = s0 + 0.35 + (s1 - s0 - 0.7) * f; B.box('trim', F, s - 0.04, s + 0.04, out + 0.04, out + 0.07, lo, hi, frame); }
    // the cheeks' narrow windows
    for (const G of [wallFrame(onWall(F, s0, 0), onWall(F, s0, out)), wallFrame(onWall(F, s1, out), onWall(F, s1, 0))]) {
      B.box('trim', G, 0.1, out - 0.1, 0, 0.04, lo - 0.06, hi + 0.06, frame);
      B.quad('glass', P(G, 0.16, lo, 0.045), P(G, out - 0.16, lo, 0.045), P(G, out - 0.16, hi, 0.045), P(G, 0.16, hi, 0.045));
    }
  }
}

// A shop front: glass between piers from the ground to its fascia, a sill, the fascia (or a dark canopy out over the
// pavement), an awning, a coloured band under the fascia (the kiosk's), the shop's lettering on the fascia or the canopy
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
    B.box('trim', F, s - 0.15, s + 0.15, 0, 0.14, house.base, fa, Sp.piers);
  }
  if (Sp.band) B.box('trim', F, s0, s1, 0.04, 0.09, fa - 0.35, fa, Sp.band);
  const mid = (s0 + s1) / 2;
  if (Sp.canopy) {
    // a flat dark canopy over the pavement, its front the fascia
    const { depth, colour } = Sp.canopy;
    B.box('trim', F, s0 - 0.3, s1 + 0.3, 0, depth, fa, top, colour);
    if (Sp.sign) signOn(B, F, mid, depth + 0.015, fa + 0.1, top - 0.1, Sp.sign, s1 - s0 + 0.6);
  } else {
    B.box('trim', F, s0 - 0.25, s1 + 0.25, 0, 0.2, fa, top, Sp.fasciaColour || Sp.piers);
    if (Sp.sign) signOn(B, F, mid, 0.215, fa + 0.06, top - 0.06, Sp.sign, s1 - s0 + 0.5);
  }
  if (Sp.awning) {
    const a = Sp.awning, ya = fa - 0.05;
    quadUp(B, 'trim', [P(s0, ya, 0.2), P(s1, ya, 0.2), P(s1, ya - 0.5, 1.3), P(s0, ya - 0.5, 1.3)], true, { colour: a });
    quadUp(B, 'trim', [P(s0, ya - 0.05, 0.2), P(s1, ya - 0.05, 0.2), P(s1, ya - 0.55, 1.3), P(s0, ya - 0.55, 1.3)], false, { colour: a });
    B.box('trim', F, s0, s1, 1.27, 1.32, ya - 0.8, ya - 0.5, a);
  }
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

// A railing round a flat roof (a terrace): posts and a rail along its free edges
function terrace(B, part) {
  const R = outwardRing(part.ring);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.5) continue;
    const [x, z] = onWall(F, F.len / 2, 0.3);
    if (coverAt(part, x, z) >= part.top - 0.05) continue;
    const y = part.top;
    B.box('trim', F, 0, F.len, -0.12, -0.06, y + 0.95, y + 1.02, part.railing);
    const n = Math.max(1, Math.round(F.len / 1.2));
    for (let k = 0; k <= n; k++) { const s = (F.len * k) / n; B.box('trim', F, s - 0.03, s + 0.03, -0.12, -0.06, y, y + 1.0, part.railing); }
  }
}

/** An oriented collider box along a wall a → b (thin, centred on it), from `baseY` up to `top` (js/pischa.js') */
function wallCollider(a, b, baseY, top, hz = 0.22) {
  const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY, minY: baseY, maxY: top, obb: { cx, cz, hx, hz, cs, sn } };
}

/** The camera spots for a look along the street */
export { VIEWS } from './promenade-dorf-data.js';

/**
 * Builds the row into `scene`. Returns { group, colliders }: the bank's walls (OpenStreetMap has no building there, so
 * js/buildings.js raises none), at world heights (baseY set); the other houses' walls stand on their surveyed
 * outlines (js/landmarks.js); the balconies, awnings, canopies and bays hang over the ground, the shop fronts' sills
 * and piers stand within 0.15 m of the walls.
 */
export function buildPromenadeDorf(scene) {
  const root = new THREE.Group();
  root.name = 'Promenade Dorf';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Promenade Dorf' }), M = materials();
  HOUSES.forEach((house, hi) => {
    house.parts.forEach((part, pi) => {
      const R = outwardRing(part.ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len >= 0.05) wall(B, hi, house, pi, F);
      }
      if (part.top !== undefined) flatRoof(B, R, part.top);
      if (part.railing) terrace(B, part);
      if (part.quoins) quoins(B, house, part);
    });
    for (const R of house.roofs || []) roof(B, R);
    const C = house.cornice;
    if (C) house.parts.forEach((p, pi) => { if (p.top !== undefined && (!C.parts || C.parts.includes(pi))) slab(B, p, C.out, C.thick, C.colour, p.top); });
    for (const Bl of house.balconies || []) balcony(B, house, Bl);
    for (const Bw of house.bays || []) bays(B, house, Bw);
    for (const Sp of house.shops || []) shopFront(B, house, Sp);
    for (const Lt of house.letters || []) {
      const F = wallOut(house, Lt.on[0], Lt.on[1], featureY(Lt));
      signOn(B, F, (Lt.s0 + Lt.s1) / 2, 0.03, Lt.y0, Lt.y1, Lt.key, Lt.s1 - Lt.s0);
    }
  });
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  // the walls of a house OpenStreetMap does not have (the bank's): a thin box along every wall of its parts
  const colliders = [];
  for (const h of HOUSES.filter((q) => q.colliders)) {
    for (const p of h.parts) {
      const R = outwardRing(p.ring);
      for (let i = 0; i < R.length; i++) {
        const a = R[i], b = R[(i + 1) % R.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.3) colliders.push(wallCollider(a, b, h.base, partTop(h, p, ...a)));
      }
    }
  }
  return { group: root, colliders };
}
