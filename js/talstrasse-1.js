import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, worldNoise } from './building-kit.js';
import {
  BAY, HOUSES, KINDS, STOREY, WIN, allParts, alsoOutlines, groundOutlines, hips, onWall, outwardRing, partTop, pointInRing, roofFrame,
  roofY, upperFloors, wallFrame, wallOut, at
} from './talstrasse-1-data.js';

export { HOUSES };

// The houses along the Talstrasse in Davos Platz round the Sportzentrum rebuilt by hand (js/talstrasse-1-data.js),
// standing in for their swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses'
// windows: each house's surveyed volumes under their flat roofs (the two chalets at the north-east end under their
// saddle and hipped roofs), its render's colour, timber on the Sportzentrum and the box by the Coop, windows drawn by
// the walls' material from their uv (metres along the wall from its middle, metres up the house's floors' grid) in the
// house's kind (white-framed, wide behind blinds, over dark panels, glazed loggia bands, between shutters), cornices,
// balconies, shop fronts, canopies, the Coop's petrol station, the Sportzentrum's arcade, the lettering. One merged
// mesh per material for the whole row: the walls (their colours as vertex colours), the roofs, the trim (vertex
// colours), the glass and the lettering.

for (const h of HOUSES) excludeBuildings(h.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js; a small neighbour
// inside a house's volumes keeps no walls of its own, one beside it its own outlines)
for (const h of HOUSES) {
  SURVEYED_FOOTPRINTS.set(h.id, groundOutlines(h));
  for (const [id, rings] of Object.entries(alsoOutlines(h))) SURVEYED_FOOTPRINTS.set(id, rings);
  // (the businesses in them lettered here, not on the generic boards: js/shops.js)
  for (const id of h.shopIds || []) SHOP_EXCLUSIONS.add(id);
}

const S = STOREY;
// v of a wall: metres up its house's floors' grid scaled to STOREY (the ground floor's foot at 40 storeys); closed
// walls carry v − CLOSED, timber ± TIMBER (all multiples of a storey: the window grid's place in its storey stays)
const UP = 40 * S, CLOSED = 300 * S, TIMBER = 1000 * S;
const vOf = (house, y) => ((y - house.floor) * S) / house.storey + UP;
// aHalf: the half length the bays are laid out on (in the grid's metres), + 1000 × the windows' kind + 10000 × the
// house's index (its lit windows of its own)
const halfCode = (hi, kind, half) => half + 1000 * kind + 10000 * hi;
// a window's top in the grid (the loggias' bands higher)
const winHi = (kind) => (kind === KINDS.band ? WIN.hi + 0.3 : WIN.hi);

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.17, 0.165, 0.16];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  M.glass = SIMPLE_SKINS.glow([0.03, 0.036, 0.042], 0.1, 0.5, [1.0, 0.8, 0.56], 0.3);
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the houses' colours from the vertices, a lit band per floor at night)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], S, WIN.lo / S, WIN.hi / S, 0.85, 0.3, { bay: BAY, half: WIN.half });
    M.walls.vertexColors = true;
    return M;
  }
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const U = uv().x, V = uv().y, A = attribute('aHalf', 'float');
  const hi = floor(A.add(0.5).div(10000)), rest = A.sub(hi.mul(10000)), kind = floor(rest.add(0.5).div(1000)), half = rest.sub(kind.mul(1000));
  const is = (k) => step(k - 0.5, kind).mul(step(kind, k + 0.5));
  const blinds = is(KINDS.blinds), panel = is(KINDS.panel), band = is(KINDS.band), dark = is(KINDS.dark);
  const shut = is(KINDS.redShutters).add(is(KINDS.brownShutters));
  const logs = step(2000, V).add(step(V, -2000));
  const bay = floor(U.div(BAY).add(0.5)), bu = U.sub(bay.mul(BAY));
  const storey = floor(V.div(S)), fv = V.sub(storey.mul(S));
  // the window's half width and top by its kind
  const wh = float(WIN.half).add(blinds.mul(1.15 - WIN.half)).add(band.mul(BAY / 2 - 0.12 - WIN.half));
  const top = float(WIN.hi).add(band.mul(0.3));
  const open = step(abs(bay.mul(BAY)).add(wh).add(float(0.3).add(shut.mul(0.45))), half);
  const rect = (hw, lo, hiY, e = 0.012) => smoothstep(hw.add(e), hw.sub(e), abs(bu)).mul(smoothstep(lo.sub(e), lo.add(e), fv)).mul(smoothstep(hiY.add(e), hiY.sub(e), fv));
  const LO = float(WIN.lo);
  // the render with a little weathering; boards: a course every 0.2 m, each a shade of its own, dark joints
  const base = attribute('color', 'vec3');
  const render = base.mul(mix(float(0.95), float(1.05), worldNoise(0.4)));
  const course = V.div(0.2).floor(), fc = fract(V.div(0.2));
  const joint = smoothstep(0.12, 0.0, fc).max(smoothstep(0.88, 1.0, fc)).mul(fine).mul(0.45);
  const wood = base.mul(hash(course.mul(17.3)).mul(0.3).add(0.85)).mul(float(1).sub(joint));
  const wall = mix(render, wood, logs);
  // the shutters beside each window (red on the log chalet, brown on the white house)
  const sh = rect(wh.add(0.5), LO, top).sub(rect(wh.add(0.06), LO.sub(0.02), top.add(0.02))).max(0).mul(open).mul(shut);
  const slats = smoothstep(0.02, 0.0, abs(fract(fv.div(0.09)).sub(0.5)).sub(0.4)).mul(fine).mul(0.25);
  const shC = mix(vec3(0.42, 0.06, 0.04), vec3(0.17, 0.085, 0.045), is(KINDS.brownShutters)).mul(float(1).sub(slats));
  // a window: its frame (white, aluminium, light grey or dark by the kind), a post and a rail (the loggias' posts
  // every 1.3 m), a sill under it, a curtain drawn in some; blinds lowered some way in the wide ones
  const win = rect(wh, LO, top).mul(open);
  const rail = WIN.lo + (WIN.hi - WIN.lo) * 0.62;
  const posts = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.035, 0.02, abs(abs(bu).sub(0.65))).mul(band));
  const bars = posts.max(smoothstep(0.03, 0.018, abs(fv.sub(rail))).mul(float(1).sub(band)).mul(float(1).sub(blinds)));
  const pane = rect(wh.sub(0.07), LO.add(0.07), top.sub(0.07)).mul(float(1).sub(bars.mul(fine))).mul(open);
  const sill = rect(wh.add(0.07), LO.sub(0.09), LO).mul(open).mul(near).mul(float(1).sub(band));
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(hi.mul(13.1)));
  const drawn = step(0.6, id).mul(mix(float(0.3), float(0.7), step(0.85, id)));
  const span = top.sub(LO).sub(0.14);
  const curtain = step(top.sub(0.07).sub(drawn.mul(span)), fv).mul(pane).mul(near).mul(float(1).sub(blinds));
  const drop = hash(id.mul(71.3)).mul(0.75).add(0.1);
  const slat = smoothstep(0.25, 0.5, abs(fract(fv.div(0.08)).sub(0.5))).mul(fine).mul(0.3);
  const blind = step(top.sub(0.07).sub(drop.mul(span)), fv).mul(pane).mul(blinds);
  const dpanel = rect(wh.add(0.04), float(0.02), LO.sub(0.02)).mul(open).mul(panel);
  const frameC = mix(mix(mix(vec3(0.6, 0.6, 0.57), vec3(0.34, 0.35, 0.36), blinds), vec3(0.5, 0.5, 0.49), band), vec3(0.06, 0.045, 0.035), dark.max(panel));
  const glassC = mix(mix(vec3(0.02, 0.024, 0.028), vec3(0.06, 0.075, 0.09), worldNoise(0.07)), vec3(0.11, 0.15, 0.18), band);
  let c = mix(wall, shC, sh);
  c = mix(c, vec3(0.1, 0.055, 0.03), dpanel);
  c = mix(c, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, frameC, win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  c = mix(c, vec3(0.42, 0.42, 0.4).mul(float(1).sub(slat)), blind);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain)).mul(float(1).sub(blind));
  m.roughnessNode = mix(float(0.88), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (houses of flats and offices: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay.add(hi.mul(31)), storey, 61, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain.add(blind).min(1))).mul(glow.mul(1.1));
  M.walls = m;
  return M;
}

// --- The lettering: one canvas atlas -------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  ewd: [0, 0, 512, 160],
  davos: [0, 160, 512, 128],
  garage: [0, 288, 512, 64],
  coop: [512, 0, 512, 128],
  pronto: [512, 128, 512, 96],
  timeout: [512, 224, 256, 96]
};
function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  const text = (t, x, y, px, colour, weight = 800, font = 'sans-serif', align = 'center') => {
    g.font = `${weight} ${px}px ${font}`; g.fillStyle = colour; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y);
  };
  // the EWD's mark: the three letters in blue over a yellow bar, "Energie aus Davos" under them
  cell('ewd', (w, h) => {
    text('EWD', w / 2, h * 0.36, Math.round(h * 0.6), '#1f4f9a', 900);
    g.fillStyle = '#e8b400'; g.fillRect(w * 0.2, h * 0.68, w * 0.6, h * 0.05);
    text('Energie aus Davos', w / 2, h * 0.86, Math.round(h * 0.16), '#1f4f9a', 600);
  });
  // the Sportzentrum's "DAVOS": white letters, wide apart
  cell('davos', (w, h) => {
    const L = ['D', 'A', 'V', 'O', 'S'];
    L.forEach((l, i) => text(l, (w * (i + 0.5)) / L.length, h * 0.54, Math.round(h * 0.82), '#f2f0ea', 700));
  });
  cell('garage', (w, h) => {
    g.fillStyle = '#1d3f73'; g.fillRect(0, 0, w, h);
    text('SPORTPLATZGARAGE GUTKNECHT', w / 2, h * 0.53, Math.round(h * 0.5), '#ffffff', 800);
  });
  // the Coop's word in its orange (the canopy's fascia carries it on white)
  cell('coop', (w, h) => text('coop', w / 2, h * 0.52, Math.round(h * 0.9), '#e8601c', 900));
  cell('pronto', (w, h) => {
    g.fillStyle = '#e8601c'; g.fillRect(0, 0, w, h);
    text('coop pronto', w / 2, h * 0.52, Math.round(h * 0.62), '#ffffff', 800);
  });
  cell('timeout', (w, h) => {
    g.fillStyle = '#2b2118'; g.fillRect(0, 0, w, h);
    text('Time Out', w / 2, h * 0.54, Math.round(h * 0.56), '#f0d9a0', 700, 'serif');
  });
  return canvasTexture(canvas);
}

// --- Geometry helpers ------------------------------------------------------------------------------------------------------
const TRIM = {
  plinth: [0.22, 0.215, 0.205], frame: [0.6, 0.6, 0.57], soffit: [0.09, 0.05, 0.028], fascia: [0.11, 0.058, 0.03],
  concrete: [0.36, 0.35, 0.33], parapet: [0.42, 0.4, 0.36], timber: [0.14, 0.072, 0.038], metal: [0.07, 0.065, 0.06],
  sill: [0.3, 0.29, 0.27], steel: [0.3, 0.31, 0.32], white: [0.62, 0.62, 0.6], orange: [0.75, 0.2, 0.02],
  door: [0.2, 0.2, 0.2], garage: [0.32, 0.33, 0.34]
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
const PARTS = allParts();
// (the highest top of the row's parts standing on the ground at a point but `self`, or −Infinity: the overhanging
// upper floors of the timber box cover nothing)
function coverAt(self, x, z) {
  let y = -Infinity;
  for (const { house, part } of PARTS) {
    if (part === self || part.foot !== undefined || !pointInRing(part.ring, x, z)) continue;
    y = Math.max(y, partTop(house, part, x, z));
  }
  return y;
}
// The highest ground along a wall from s0 to s1, half a metre out of it
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 1.0));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}
/** The foot of the lowest storey of a house whose windows stand `y` or higher */
function storeyFrom(house, y) {
  const lo = (WIN.lo * house.storey) / S;
  return house.floor + Math.ceil((y - lo - house.floor) / house.storey - 1e-9) * house.storey;
}
const timberColour = (house) => house.timber?.colour || house.colour;
const kindOf = (house, part) => part.kind ?? house.kind;

// --- The walls ---------------------------------------------------------------------------------------------------------------
// One wall of a part: its top (the part's roof) and its foot (the base, or the top of a part before it) sampled every
// 0.5 m, cut into runs where both are straight, each run into slices at the levels where its look changes (the
// windows' band, the boards)
function wall(B, hi, house, part, F) {
  const n = Math.max(1, Math.ceil(F.len / 0.5));
  const foot = part.foot ?? house.base;
  const sK = [], top = [], bot = [];
  for (let k = 0; k <= n; k++) {
    const s = (F.len * k) / n;
    sK.push(s);
    top.push(partTop(house, part, ...onWall(F, s, -0.05)));
    bot.push(Math.max(foot, coverAt(part, ...onWall(F, s, 0.3))));
  }
  const kind = kindOf(house, part), scale = BAY / house.bay;
  const mid = F.len / 2, half = mid * scale;
  const tFrom = house.timber ? house.timber.from : Infinity;
  // the band of windows' top: the last storey whose windows fit under the wall's lowest top
  const hiM = (winHi(kind) * house.storey) / S, minTop = Math.min(...top);
  let snap = house.floor;
  while (snap + house.storey + hiM + 0.2 <= minTop) snap += house.storey;
  const bandTop = part.closed ? -Infinity : snap + hiM + 0.2;
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
    const covered = Math.max(ba, bb) > foot + 0.01;
    const from = covered ? Math.max(ba, bb) + 0.3 : groundAlong(F, sa, sb) + Math.max(0.15, (house.plinth || 0) + 0.1);
    const win0 = part.closed ? Infinity : storeyFrom(house, from);
    const levels = [win0, bandTop, tFrom].filter((y) => Number.isFinite(y)).sort((p, q) => p - q);
    const T = (s) => ta + ((tb - ta) * (s - sa)) / (sb - sa), Bt = (s) => ba + ((bb - ba) * (s - sa)) / (sb - sa);
    const cuts = [sa, sb];
    for (const L of levels) for (const [ya, yb] of [[ta, tb], [ba, bb]]) {
      if ((ya - L) * (yb - L) < 0) cuts.push(sa + ((L - ya) / (yb - ya)) * (sb - sa));
    }
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
        const logs = yc >= tFrom;
        const colour = logs ? timberColour(house) : part.colour || house.colour;
        const off = (logs ? (open ? TIMBER : -TIMBER) : 0) - (open ? 0 : CLOSED);
        const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
        const Vv = (y) => vOf(house, y) + off, Uu = (s) => (s - mid) * scale;
        const A0 = Math.min(a0, a1), B0 = Math.min(b0, b1);
        B.quad('walls', P(s0, A0), P(s1, B0), P(s1, Math.max(b0, b1)), P(s0, Math.max(a0, a1)),
          [[Uu(s0), Vv(A0)], [Uu(s1), Vv(B0)], [Uu(s1), Vv(Math.max(b0, b1))], [Uu(s0), Vv(Math.max(a0, a1))]],
          { half: open ? halfCode(hi, kind, half) : 0, colour });
      }
    }
  }
  if (part.foot === undefined) plinth(B, house, F, sK, bot, foot);
}
// A plinth of grey render along a wall's foot, `plinth` m over the ground where the wall stands free
function plinth(B, house, F, sK, bot, foot) {
  const h = house.plinth || 0.3, n = Math.max(1, Math.ceil(F.len / 2.0));
  for (let k = 0; k < n; k++) {
    const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
    const ia = Math.round((a / F.len) * (sK.length - 1)), ib = Math.round((b / F.len) * (sK.length - 1));
    if (bot[ia] > foot + 0.01 || bot[ib] > foot + 0.01) continue;
    const ga = groundHeight(...onWall(F, a, 0.3)) + h, gb = groundHeight(...onWall(F, b, 0.3)) + h;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('trim', P(a, foot), P(b, foot), P(b, Math.max(gb, foot + 0.2)), P(a, Math.max(ga, foot + 0.2)), undefined, { colour: TRIM.plinth });
  }
}

// --- Roofs ------------------------------------------------------------------------------------------------------------------
// A pitched roof: its faces (two sides, the hips' ends), the soffit under them, a fascia board round its edges
function roof(B, R) {
  const F = roofFrame(R), L = F.L, [h0, h1] = hips(R);
  const P = (t, c, dy = 0) => { const [x, z] = at(F, t, c); return [x, roofY(R, x, z) + dy, z]; };
  const faces = [
    [[0, R.cR], [L, R.cR], [L - h1, 0], [h0, 0]],
    [[0, -R.cL], [h0, 0], [L - h1, 0], [L, -R.cL]]
  ];
  if (h0 > 0) faces.push([[0, -R.cL], [0, R.cR], [h0, 0], [h0, 0]]);
  if (h1 > 0) faces.push([[L, R.cR], [L, -R.cL], [L - h1, 0], [L - h1, 0]]);
  for (const f of faces) {
    const pts = f.map(([t, c]) => P(Math.min(Math.max(t, 1e-4), L - 1e-4), c));
    quadUp(B, 'roof', pts, true);
    quadUp(B, 'trim', pts.map((p) => [p[0], p[1] - 0.1, p[2]]), false, { colour: TRIM.soffit });
  }
  const [cx, cz] = at(F, L / 2, (R.cR - R.cL) / 2), centre = [cx, R.eaves - 1, cz];
  const edge = [[0, -R.cL], [L, -R.cL], ...(h1 > 0 ? [] : [[L - 1e-4, 0]]), [L, R.cR], [0, R.cR], ...(h0 > 0 ? [] : [[1e-4, 0]])];
  for (let i = 0; i < edge.length; i++) {
    const [ta, ca] = edge[i], [tb, cb] = edge[(i + 1) % edge.length];
    const a = P(Math.min(Math.max(ta, 1e-4), L - 1e-4), ca), b = P(Math.min(Math.max(tb, 1e-4), L - 1e-4), cb);
    quadOut(B, 'trim', [[a[0], a[1] + 0.03, a[2]], [b[0], b[1] + 0.03, b[2]], [b[0], b[1] - 0.26, b[2]], [a[0], a[1] - 0.26, a[2]]], centre, { colour: TRIM.fascia });
  }
}
// A band round a flat part's top (or a slab at `y`): a box along every edge whose wall stands free up there
function band(B, part, out, h, colour, y) {
  const R = outwardRing(part.ring);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.3) continue;
    const [x, z] = onWall(F, F.len / 2, 0.3);
    if (coverAt(part, x, z) >= y - 0.05) continue;
    B.box('trim', F, -out, F.len + out, -0.05, out, y - h, y + 0.03, colour);
  }
}

// --- Balconies, shop fronts, canopies, doors, lettering ---------------------------------------------------------------------
// A balcony on every storey it names (indices; or every storey over the ground floor from `from`): its slab out of the
// wall, a parapet or railing round its three free sides (metal bars, a concrete parapet, timber boards), an awning over
function balcony(B, house, Bl) {
  const F = wallOut(house, Bl.on[0], Bl.on[1]);
  const s0 = Bl.s0 ?? 0.2, s1 = Bl.s1 ?? F.len - 0.2, d = Bl.depth, rh = 1.0;
  const topHere = Math.min(...[0.25, 0.5, 0.75].map((f) => {
    const [x, z] = onWall(F, s0 + (s1 - s0) * f, -0.3);
    return Math.max(...house.parts.filter((p) => pointInRing(p.ring, x, z)).map((p) => partTop(house, p, x, z)), -Infinity);
  }));
  const floors = Bl.floors ? Bl.floors.map((k) => house.floor + k * house.storey) : upperFloors(house, topHere, Bl.from || 1);
  const K = {
    metal: { slab: TRIM.concrete, rail: TRIM.metal },
    concrete: { slab: TRIM.parapet, rail: TRIM.parapet, solid: true },
    timber: { slab: TRIM.timber, rail: TRIM.timber, solid: true }
  }[Bl.rail];
  for (const y of floors) {
    B.box('trim', F, s0, s1, 0, d, y - 0.2, y, K.slab);
    const sides = [
      { G: F, a: s0, b: s1, o: d },
      { G: wallFrame(onWall(F, s0, 0), onWall(F, s0, d)), a: 0, b: d, o: 0 },
      { G: wallFrame(onWall(F, s1, d), onWall(F, s1, 0)), a: 0, b: d, o: 0 }
    ];
    for (const { G, a, b, o } of sides) {
      if (K.solid) { B.box('trim', G, a, b, o - 0.12, o, y, y + rh, K.rail); continue; }
      B.box('trim', G, a, b, o - 0.06, o, y + rh - 0.06, y + rh, K.rail);
      B.box('trim', G, a, b, o - 0.04, o, y + 0.12, y + 0.18, K.rail);
      const m = Math.max(1, Math.round((b - a) / 2.0));
      for (let k = 0; k <= m; k++) { const s = a + ((b - a) * k) / m; B.box('trim', G, s - 0.03, s + 0.03, o - 0.06, o, y, y + rh, K.rail); }
    }
    // the awning: from the wall over the storey down and out to the slab's front
    if (Bl.awning) {
      const P = (s, yy, oo) => { const [x, z] = onWall(F, s, oo); return [x, yy, z]; };
      const yA = y + house.storey - 0.35;
      quadUp(B, 'trim', [P(s0, yA, 0.05), P(s1, yA, 0.05), P(s1, yA - 0.55, d - 0.05), P(s0, yA - 0.55, d - 0.05)], true, { colour: Bl.awning });
      quadUp(B, 'trim', [P(s0, yA - 0.04, 0.05), P(s1, yA - 0.04, 0.05), P(s1, yA - 0.59, d - 0.05), P(s0, yA - 0.59, d - 0.05)], false, { colour: Bl.awning.map((v) => v * 0.6) });
    }
  }
}

// A shop front: glass between piers from the ground to its fascia, a sill, the fascia (or garage doors)
function shopFront(B, house, Sp) {
  const F = wallOut(house, Sp.on[0], Sp.on[1]);
  const s0 = Sp.s0, s1 = Sp.s1, g = groundAlong(F, s0, s1), top = Sp.top, fa = top - (Sp.ground ? 0.25 : 0.6);
  const P = (s, y, o) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  const y0 = g + (Sp.ground ? 0.05 : 0.35);
  if (fa - y0 < 1.2) return;
  const n = Math.max(1, Math.round((s1 - s0) / (Sp.garage ? 3.4 : 3.0)));
  if (Sp.garage) {
    // the workshop's doors: grey sectional doors between the piers
    for (let k = 0; k < n; k++) {
      const a = s0 + ((s1 - s0) * k) / n + 0.25, b = s0 + ((s1 - s0) * (k + 1)) / n - 0.25;
      B.box('trim', F, a, b, 0, 0.04, g, Math.min(g + 3.2, fa), TRIM.garage);
    }
  } else {
    B.box('trim', F, s0 - 0.1, s1 + 0.1, 0, 0.12, house.base, y0, TRIM.sill);
    B.quad('glass', P(s0, y0, 0.04), P(s1, y0, 0.04), P(s1, fa, 0.04), P(s0, fa, 0.04));
  }
  for (let k = 0; k <= n; k++) {
    const s = s0 + ((s1 - s0) * k) / n;
    B.box('trim', F, s - 0.12, s + 0.12, 0, 0.1, house.base, fa, Sp.piers);
  }
  B.box('trim', F, s0 - 0.2, s1 + 0.2, 0, 0.16, fa, top, Sp.fascia || Sp.piers);
}

// A canopy over a door: a slab from the wall out, its fascia
function canopy(B, house, Cn) {
  const F = wallOut(house, Cn.on[0], Cn.on[1]);
  B.box('trim', F, Cn.s0, Cn.s1, 0, Cn.depth, Cn.y, Cn.y + 0.12, TRIM.white);
  B.box('trim', F, Cn.s0 - 0.02, Cn.s1 + 0.02, Cn.depth - 0.06, Cn.depth + 0.02, Cn.y - 0.05, Cn.y + 0.35, Cn.fascia);
}

// A door: a glass door in a dark frame or a door of boards, a step before it
function door(B, house, Dr) {
  const F = wallOut(house, Dr.on[0], Dr.on[1]), h = Dr.w / 2, g = groundAlong(F, Dr.s - h, Dr.s + h) + 0.12;
  B.box('trim', F, Dr.s - h - 0.08, Dr.s + h + 0.08, 0, 0.05, g, g + 2.4, Dr.glass ? TRIM.metal : TRIM.sill);
  if (Dr.glass) {
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.07); return [x, y, z]; };
    B.quad('glass', P(Dr.s - h, g), P(Dr.s + h, g), P(Dr.s + h, g + 2.3), P(Dr.s - h, g + 2.3));
  } else B.box('trim', F, Dr.s - h, Dr.s + h, 0.05, 0.08, g, g + 2.25, TRIM.timber);
  B.box('trim', F, Dr.s - h - 0.2, Dr.s + h + 0.2, 0, 0.4, house.base, g, TRIM.concrete);
}
// A row of garage doors on a wall (their middles `s`)
function garageDoors(B, house, Gd) {
  const F = wallOut(house, Gd.on[0], Gd.on[1]);
  for (const s of Gd.s) {
    const g = groundAlong(F, s - Gd.w / 2, s + Gd.w / 2);
    B.box('trim', F, s - Gd.w / 2 - 0.1, s + Gd.w / 2 + 0.1, 0, 0.04, g, g + Gd.h + 0.1, TRIM.sill);
    B.box('trim', F, s - Gd.w / 2, s + Gd.w / 2, 0.04, 0.07, g, g + Gd.h, TRIM.garage);
  }
}
// Lettering from the atlas on a wall, its middle at `s`
function sign(B, house, Sg) {
  const F = wallOut(house, Sg.on[0], Sg.on[1]);
  B.decal(F, Sg.s - Sg.w / 2, Sg.s + Sg.w / 2, Sg.off ?? 0.2, Sg.y0, Sg.y1, Sg.key);
}

// --- Colliders ----------------------------------------------------------------------------------------------------------------
/** An oriented collider box along a → b (centred on it, `hz` half its depth), from `baseY` up to `top` */
function boxCollider(a, b, baseY, top, hz) {
  const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY, minY: baseY, maxY: top, obb: { cx, cz, hx, hz, cs, sn } };
}
// A post: a square box on a frame's line at s (`half` its half side, `o` out of the line), and its collider
function post(B, F, s, o, half, y0, y1, colour, colliders) {
  B.box('trim', F, s - half, s + half, o - half, o + half, y0, y1, colour);
  colliders.push(boxCollider(onWall(F, s - half, o), onWall(F, s + half, o), y0, y1, half));
}

// A flat soffit under an outline at `y`, facing down, into the trim
function ceiling(B, ring, y, colour) {
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = [ring[i], ring[j], ring[k]].map((q) => [q[0], y, q[1]]);
    const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
    const t = up ? [p[0], p[2], p[1]] : p;
    B.tri('trim', t[0], t[1], t[2], undefined, { colour });
  }
}

// The Sportzentrum's arcade: its roof on posts along its free edges, the slab's fascia, the soffit under it
function arcade(B, A, colliders) {
  const R = outwardRing(A.ring), y0 = A.top - A.thick;
  flatRoof(B, R, A.top);
  ceiling(B, R, y0, TRIM.soffit);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    const [x, z] = onWall(F, F.len / 2, 0.3);
    if (coverAt(null, x, z) >= A.top - 0.05) continue;
    B.box('trim', F, 0, F.len, -0.02, 0.02, y0, A.top + 0.03, A.colour);
    // (the posts along the free edges, half a metre in)
    if (F.len < 3) continue;
    const n = Math.max(1, Math.round(F.len / A.posts));
    for (let k = 0; k <= n; k++) {
      const s = Math.min(Math.max((F.len * k) / n, 0.5), F.len - 0.5);
      const g = groundHeight(...onWall(F, s, -0.5));
      post(B, F, s, -0.5, 0.2, g - 0.3, y0, A.colour, colliders);
    }
  }
}

// The Coop's petrol station: the canopy's slab (a white fascia with an orange band and "coop" on the two street sides),
// its soffit, the pump islands with two pumps and two columns each
function station(B, St, colliders) {
  const R = outwardRing(St.ring), y0 = St.top - St.thick;
  flatRoof(B, R, St.top);
  ceiling(B, R, y0, TRIM.white);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    B.box('trim', F, 0, F.len, -0.02, 0.02, y0, St.top + 0.03, TRIM.white);
    B.box('trim', F, 0, F.len, 0.02, 0.04, y0 + 0.1, y0 + 0.3, TRIM.orange);
    // (the lettering on the sides away from the shop)
    const [x, z] = onWall(F, F.len / 2, 2.0);
    if (!pointInRing(HOUSES.find((h) => h.station === St).parts[0].ring, x, z)) B.decal(F, F.len / 2 - 2.4, F.len / 2 + 2.4, 0.06, y0 + 0.35, St.top - 0.05, 'coop');
  }
  for (const Pm of St.pumps) {
    const a = [Pm.x - Pm.u[0] * Pm.half, Pm.z - Pm.u[1] * Pm.half], b = [Pm.x + Pm.u[0] * Pm.half, Pm.z + Pm.u[1] * Pm.half];
    const F = wallFrame(a, b), g = groundHeight(Pm.x, Pm.z);
    B.box('trim', F, 0, F.len, -0.6, 0.6, g - 0.3, g + 0.22, TRIM.concrete);
    colliders.push(boxCollider(a, b, g - 0.3, g + 0.22, 0.6));
    for (const s of [F.len / 2 - 1.0, F.len / 2 + 1.0]) {
      B.box('trim', F, s - 0.35, s + 0.35, -0.25, 0.25, g + 0.22, g + 1.9, TRIM.white);
      B.box('trim', F, s - 0.36, s + 0.36, -0.26, 0.26, g + 1.5, g + 1.75, TRIM.orange);
    }
    for (const s of [F.len / 2 - St.column.at - 0.4, F.len / 2 + St.column.at + 0.4]) post(B, F, s, 0, St.column.half, g + 0.2, y0, TRIM.white, colliders);
  }
}

// The timber box's posts along the overhang's edges over the glazed ground floor, its soffit
function overhang(B, house, colliders) {
  const Pt = house.posts, full = house.parts.find((p) => p.foot !== undefined), R = full.ring;
  ceiling(B, outwardRing(R), full.foot, TRIM.soffit);
  for (const i of Pt.edges) {
    const F = wallOut(house, R[i], R[(i + 1) % R.length]);
    const n = Math.max(1, Math.round((F.len - 1.0) / Pt.every));
    for (let k = 0; k <= n; k++) {
      const s = 0.5 + ((F.len - 1.0) * k) / n;
      const g = groundHeight(...onWall(F, s, -0.5));
      post(B, F, s, -0.5, Pt.half, g - 0.3, full.foot, Pt.colour, colliders);
    }
  }
}

/** The camera spots for a look along the street */
export { VIEWS } from './talstrasse-1-data.js';

/**
 * Builds the row into `scene`. Returns { group, colliders }: the posts of the Sportzentrum's arcade and the timber
 * box's overhang, the Coop's canopy columns and pump islands (the player's walls stand on the surveyed outlines,
 * js/landmarks.js; the balconies, canopies and awnings hang over the ground, the shop fronts' sills and the doors'
 * steps stand within 0.4 m of the walls), at world heights (baseY set, so liftColliders leaves them be).
 */
export function buildTalstrasse1(scene) {
  const root = new THREE.Group();
  root.name = 'Talstrasse 1';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Talstrasse 1' }), M = materials();
  const colliders = [];
  HOUSES.forEach((house, hi) => {
    const parts = [...house.parts, ...(house.also || []).flatMap((a) => a.parts || [])];
    for (const part of parts) {
      const R = outwardRing(part.ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len >= 0.05) wall(B, hi, house, part, F);
      }
      // (a flat roof, but not one under the overhanging floors of its own house)
      if (part.top !== undefined && !parts.some((q) => q.foot === part.top)) flatRoof(B, R, part.top);
    }
    for (const R of house.roofs || []) roof(B, R);
    const Cr = house.cornice;
    if (Cr) parts.forEach((p, pi) => { if (p.top !== undefined && (!Cr.parts || Cr.parts.includes(pi))) band(B, p, Cr.out, Cr.h, Cr.colour, p.top); });
    for (const Bd of house.bands || []) band(B, house.parts[Bd.part], Bd.out, Bd.h, Bd.colour, house.parts[Bd.part].top);
    for (const Bl of house.balconies || []) balcony(B, house, Bl);
    for (const Sp of house.shops || []) shopFront(B, house, Sp);
    for (const Cn of house.canopies || []) canopy(B, house, Cn);
    for (const Dr of house.doors || []) door(B, house, Dr);
    for (const Gd of house.garageDoors || []) garageDoors(B, house, Gd);
    for (const Sg of house.signs || []) sign(B, house, Sg);
    if (house.arcade) arcade(B, house.arcade, colliders);
    if (house.station) station(B, house.station, colliders);
    if (house.posts) overhang(B, house, colliders);
    if (house.slab) flatRoof(B, outwardRing(house.slab.ring), house.slab.top, { bucket: 'trim', colour: TRIM.concrete });
  });
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders };
}
