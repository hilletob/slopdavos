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
  BAY, HOUSES, SHOP_IDS, STOREY, WIN, at, featureY, groundOutlines, hips, onWall, outwardRing, partTop, pointInRing, roofFrame, roofY, storeyOf,
  wallFrame, wallOut
} from './talstrasse-4-data.js';

export { HOUSES };

// The houses along the Talstrasse from Bünda to Davos Dorf rebuilt by hand (js/talstrasse-4-data.js), standing in for
// their swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows: the Casa
// Aurora (yellow, a shallow hip, red-brown balconies), the house on the Bünda corner (cream, grey-boarded balconies,
// deep dark eaves), the house south of the Talgarage, the Talgarage (white, its garage doors and lettering, the wing,
// the porch and the workshop), the dark Cresta Studios block, the house with the carved balconies (its cross gable on
// the street), the Jäggi Schneider house with its garage, the house with the green shutters, the new house north of the
// Cresta (dark glazing under white storeys, glass balconies), the house with the ribbon windows, the ochre house with
// the timber gable, the beige house with the balconies, the white block on the fields, the house with the shop, the
// house over the garage, the Demont and its barn, the chalet by the Dischma crossing, the house by the car park and the
// two houses below the street. Windows are drawn by the walls' material from their uv (metres along the wall from its
// middle, metres up the house's floors' grid scaled to 2.9 m storeys). One merged mesh per material for the whole row:
// the walls (their colours as vertex colours; the boards, the shutters' colour and the house by a code in aHalf), the
// roofs, the trim (vertex colours: eaves, balconies, railings, plinths, doors), the shops' glass and the balconies'
// glass, and the lettering (one canvas atlas).

for (const h of HOUSES) excludeBuildings(h.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js)
for (const h of HOUSES) SURVEYED_FOOTPRINTS.set(h.id, groundOutlines(h));
// (the shops' signs lettered here, on these walls: js/shops.js leaves them out)
for (const id of SHOP_IDS) SHOP_EXCLUSIONS.add(id);

const S = STOREY;
// v of a wall: metres up its house's floors' grid scaled to 2.9 m storeys (the ground floor's foot at 40 storeys);
// closed walls carry v − CLOSED
const UP = 40 * S, CLOSED = 300 * S;
const vOf = (house, y) => ((y - house.floor) * S) / storeyOf(house) + UP;
// aHalf: the half length the bays are laid out on (0: no windows), + 1000 × the windows' style, + 5000 for boards,
// + 10000 × the house's index
const halfCode = (hi, half, style, timber) => half + 1000 * style + (timber ? 5000 : 0) + 10000 * hi;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.1, 0.095, 0.09], FRAME_C = [0.58, 0.57, 0.53];
// the shutters by style: green, brown, grey
const SHUTTERS = [[0.06, 0.16, 0.08], [0.2, 0.1, 0.05], [0.3, 0.3, 0.29]];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  M.glass = SIMPLE_SKINS.glow([0.03, 0.036, 0.042], 0.1, 0.5, [1.0, 0.8, 0.56], 0.25);
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the houses' colours from the vertices, a lit band per floor at night)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], S, WIN.lo / S, WIN.hi / S, 0.85, 0.3, { bay: BAY, half: WIN.half });
    M.walls.vertexColors = true;
    return M;
  }
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const U = uv().x, V = uv().y, A = attribute('aHalf', 'float');
  // (decoded with half a unit's margin: aHalf is interpolated over each triangle, and a closed wall's code of exactly
  // 10000 × the house came out a hair under it on some pixels, read as the house before with boards and ribbon windows
  // all over: shimmering streaks)
  const hi = floor(A.add(0.5).div(10000)), rest = A.sub(hi.mul(10000)), timber = step(4999.5, rest), rest2 = rest.sub(timber.mul(5000));
  const style = floor(rest2.add(0.5).div(1000)), half = rest2.sub(style.mul(1000));
  const ribbon = step(3.5, style), shut = step(0.5, style).mul(float(1).sub(ribbon));
  const bay = floor(U.div(BAY).add(0.5)), bu = U.sub(bay.mul(BAY));
  const storey = floor(V.div(S)), fv = V.sub(storey.mul(S));
  // the windows: their half width (the ribbons nearly join), a window fits in the wall
  const wh = mix(float(WIN.half), float(BAY / 2 - 0.16), ribbon);
  const open = step(abs(bay.mul(BAY)).add(wh).add(0.4), half);
  // (a soft-edged rectangle in the bay whose half width is a node)
  const rectW = (hw, lo, hiY, e = 0.012) => smoothstep(hw.add(e), hw.sub(e), abs(bu)).mul(smoothstep(lo - e, lo + e, fv)).mul(smoothstep(hiY + e, hiY - e, fv));
  // the plaster with a little weathering; the boards, 0.14 m each, a shade of their own, a dark joint between
  const base = attribute('color', 'vec3');
  const plaster = base.mul(mix(float(0.95), float(1.05), worldNoise(0.4)));
  const course = V.div(0.14).floor(), fc = fract(V.div(0.14));
  const joint = smoothstep(0.1, 0.0, fc).max(smoothstep(0.9, 1.0, fc)).mul(fine).mul(0.5);
  const boards = base.mul(hash(course.mul(17.3).add(floor(U.div(4.1)).mul(3.7))).sub(0.5).mul(0.3).mul(fine).add(1)).mul(float(1).sub(joint));
  const wall = mix(plaster, boards, timber);
  // a window: a light frame (dark on the ribbons), a post and a rail, a sill under it, a curtain drawn in some
  const win = rectW(wh, WIN.lo, WIN.hi).mul(open);
  const rail = WIN.lo + (WIN.hi - WIN.lo) * 0.62;
  const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.03, 0.018, abs(fv.sub(rail))));
  const pane = rectW(wh.sub(0.07), WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(bars.mul(fine))).mul(open);
  const sill = rectW(wh.add(0.07), WIN.lo - 0.09, WIN.lo).mul(open).mul(fine);
  // the shutters beside the windows (their slats fading out with distance)
  const shutC = mix(mix(vec3(...SHUTTERS[0]), vec3(...SHUTTERS[1]), step(1.5, style)), vec3(...SHUTTERS[2]), step(2.5, style));
  const slats = float(1).sub(smoothstep(0.3, 0.0, fract(fv.div(0.08))).mul(0.35).mul(fine));
  const sideOff = WIN.half + 0.3;
  const shutter = rectMask(abs(bu).sub(sideOff), fv, 0.27, WIN.lo, WIN.hi).mul(open).mul(shut);
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(hi.mul(13.1)));
  const drawn = step(0.6, id).mul(mix(float(0.3), float(0.7), step(0.85, id)));
  const span = WIN.hi - WIN.lo - 0.14;
  const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(span)), fv).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.024, 0.028), vec3(0.06, 0.075, 0.09), worldNoise(0.07));
  const frameC = mix(vec3(...FRAME_C), vec3(0.08, 0.085, 0.09), ribbon);
  let c = mix(wall, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, shutC.mul(slats), shutter);
  c = mix(c, frameC, win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.88), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (houses of flats: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay.add(hi.mul(31)), storey, 71, { share: 0.28, late: 0.08, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1));
  M.walls = m;
  return M;
}

// --- The lettering: one canvas atlas ----------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 256];
export const ATLAS = {
  talgarage: [0, 0, 512, 64],
  suzuki: [512, 0, 256, 64],
  marc: [768, 0, 256, 64],
  demont: [0, 64, 512, 64],
  demontS: [512, 64, 256, 64],
  aurora: [768, 64, 256, 80],
  cresta: [0, 128, 192, 128],
  jaeggi: [224, 128, 256, 128]
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
  // "Talgarage Davos" in grey-blue on the white fascia
  cell('talgarage', (w, h) => { g.fillStyle = '#eef0ef'; g.fillRect(0, 0, w, h); text('Talgarage Davos', w / 2, h / 2 + 2, 42, '#3d5770', 700); });
  // SUZUKI in dark blue on a white board, a red bar under it
  cell('suzuki', (w, h) => {
    g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, w, h);
    text('SUZUKI', w / 2, h / 2, 44, '#1b3a8c', 900);
    g.fillStyle = '#c8102e'; g.fillRect(24, h - 10, w - 48, 5);
  });
  cell('marc', (w, h) => { g.fillStyle = '#f1ede2'; g.fillRect(0, 0, w, h); text('MARC AG', w / 2, h / 2 + 2, 38, '#2c3e66', 700); });
  // the garden centre's board: the name in green, its trade under it
  cell('demont', (w, h) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h);
    text('DEMONT', 120, h / 2 + 2, 44, '#2f7a34', 900);
    text('Gartenbau', 360, h / 2 - 12, 24, '#2f3a2f', 600);
    text('Gartengestaltung', 360, h / 2 + 14, 24, '#2f3a2f', 600);
  });
  cell('demontS', (w, h) => { g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); text('DEMONT', w / 2, h / 2 + 2, 44, '#2f7a34', 900); });
  // "Casa Aurora" in a brown italic serif on the yellow wall (left transparent round it)
  cell('aurora', (w, h) => { text('Casa Aurora', w / 2, h / 2 + 4, 46, '#6a4a22', 'italic 700', 'Georgia, serif'); });
  // the yellow board: CRESTA over STUDIOS
  cell('cresta', (w, h) => {
    g.fillStyle = '#e8c21c'; g.fillRect(0, 0, w, h);
    text('CRESTA', w / 2, h * 0.36, 40, '#1a1a1a', 900);
    text('STUDIOS', w / 2, h * 0.7, 30, '#1a1a1a', 700);
  });
  // the builder's lettering on the white wall: the trade in gold, the name in blue on a blue-edged band
  cell('jaeggi', (w, h) => {
    g.fillStyle = '#eeeeec'; g.fillRect(0, 0, w, h);
    text('Umbauspezialist', w / 2, 22, 26, '#c79a12', 700, 'Georgia, serif');
    g.fillStyle = '#1f4f9a'; g.fillRect(20, 46, w - 40, 4); g.fillRect(20, h - 14, w - 40, 4);
    text('JÄGGI', w / 2, 70, 34, '#1f4f9a', 900);
    text('SCHNEIDER', w / 2, 100, 30, '#1f4f9a', 900);
  });
  return canvasTexture(canvas);
}

// --- Geometry helpers ------------------------------------------------------------------------------------------------------
const TRIM = {
  plinth: [0.22, 0.215, 0.205], frame: FRAME_C, soffit: [0.07, 0.045, 0.03], fascia: [0.1, 0.06, 0.035],
  door: [0.16, 0.09, 0.05], step: [0.3, 0.29, 0.28], chimney: [0.4, 0.39, 0.37], rail: [0.12, 0.12, 0.12]
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
// A house's window in world metres (its storeys' grid scaled): the window's foot and head over a storey's foot
const winLo = (house) => (WIN.lo * storeyOf(house)) / S, winHi = (house) => (WIN.hi * storeyOf(house)) / S;
/** The foot of the lowest storey of a house whose windows stand `y` or higher */
function storeyFrom(house, y) {
  const st = storeyOf(house), k = Math.ceil((y - winLo(house) - house.floor) / st - 1e-9);
  return house.floor + k * st;
}
function bandColour(house, part, y) {
  for (const [top, colour] of part.bands || []) if (y < top) return [colour, true];
  return [part.colour || house.colour, false];
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
  const part = house.parts[pi], st = storeyOf(house);
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
  while (snap + st + winHi(house) + 0.2 <= minTop) snap += st;
  const bandTop = part.closed ? -Infinity : snap + winHi(house) + 0.2;
  const bands = (part.bands || []).map(([y]) => y);
  const style = house.win || 0;
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
        const [colour, banded] = bandColour(house, part, yc);
        // (the boards where the house or the part is clad, its plaster's bands plain)
        const boards = !!(part.timber ?? house.timber) && !banded;
        const off = open ? 0 : -CLOSED;
        const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
        const V = (y) => vOf(house, y) + off, Uu = (s) => s - mid;
        const A0 = Math.min(a0, a1), B0 = Math.min(b0, b1);
        B.quad('walls', P(s0, A0), P(s1, B0), P(s1, Math.max(b0, b1)), P(s0, Math.max(a0, a1)),
          [[Uu(s0), V(A0)], [Uu(s1), V(B0)], [Uu(s1), V(Math.max(b0, b1))], [Uu(s0), V(Math.max(a0, a1))]],
          { half: halfCode(hi, open ? half : 0, style, boards), colour });
      }
    }
  }
  plinth(B, house, F, sK, bot);
}
// A plinth of grey render along a wall's foot, `plinth` m over the ground where the wall stands free (in 2 m pieces)
function plinth(B, house, F, sK, bot) {
  const h = house.plinth || 0.3, n = Math.max(1, Math.ceil(F.len / 2.0));
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
// A pitched roof: its faces (two sides, the hips' ends), the soffit under them, a fascia board round its edges
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
  // the fascia: round the outline, along the eaves and up the verges
  const [cx, cz] = at(F, L / 2, (R.cR - R.cL) / 2), centre = [cx, Math.min(R.eavesL ?? R.eaves, R.eavesR ?? R.eaves, R.eaves) - 1, cz];
  const edge = [[0, -R.cL], [L, -R.cL], [L, R.cR], [0, R.cR]];
  for (let i = 0; i < edge.length; i++) {
    const [ta, ca] = edge[i], [tb, cb] = edge[(i + 1) % edge.length];
    // (a gable's verge in two pieces, up to the ridge and down)
    const pieces = !h0 && !h1 && ca !== cb ? [[ta, ca, ta, 0], [ta, 0, tb, cb]] : [[ta, ca, tb, cb]];
    for (const [t0, c0, t1, c1] of pieces) {
      const a = P(clampT(t0), c0), b = P(clampT(t1), c1);
      quadOut(B, 'trim', [[a[0], a[1] + 0.03, a[2]], [b[0], b[1] + 0.03, b[2]], [b[0], b[1] - 0.3, b[2]], [a[0], a[1] - 0.3, a[2]]], centre, { colour: TRIM.fascia });
    }
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
// A railing round a flat part's roof: a rail on thin posts along every edge whose wall stands free up there
function railing(B, part, h, colour) {
  const R = outwardRing(part.ring), y = part.top;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.8) continue;
    const [x, z] = onWall(F, F.len / 2, 0.3);
    if (coverAt(part, x, z) >= y - 0.05) continue;
    B.box('trim', F, 0.05, F.len - 0.05, -0.25, -0.15, y + h - 0.08, y + h, colour);
    B.box('trim', F, 0.05, F.len - 0.05, -0.24, -0.16, y + 0.1, y + h * 0.55, colour.map((v) => v * 0.85));
    const n = Math.max(1, Math.round(F.len / 2.5));
    for (let k = 0; k <= n; k++) { const s = 0.1 + ((F.len - 0.2) * k) / n; B.box('trim', F, s - 0.04, s + 0.04, -0.24, -0.16, y, y + h, colour); }
  }
}
// A chimney on a roof at (x, z): grey render from under the roof to `top`, a dark cap
function chimney(B, x, z, foot, top) {
  const F = wallFrame([x - 0.35, z], [x + 0.35, z]);
  B.box('trim', F, 0, 0.7, -0.35, 0.35, foot, top, TRIM.chimney);
  B.box('trim', F, -0.06, 0.76, -0.41, 0.41, top, top + 0.1, [0.1, 0.1, 0.1]);
}
// The highest of the house's tops at a point (a chimney's foot)
function houseTop(house, x, z) {
  let y = -Infinity;
  for (const p of house.parts) if (pointInRing(p.ring, x, z)) y = Math.max(y, partTop(house, p, x, z));
  return y;
}

// A stack of balconies out of a wall: on each floor a slab, its parapet on its three free sides (timber or a light
// rail, or glass under a rail)
function balconies(B, house, Bc) {
  const F = wallOut(house, Bc.on[0], Bc.on[1], featureY(Bc));
  const { s0, s1, depth } = Bc, rh = 1.05, slabC = Bc.slab || Bc.colour;
  for (const y of Bc.floors) {
    B.box('trim', F, s0, s1, 0, depth, y - 0.2, y, slabC);
    const sides = [
      { G: F, a: s0, b: s1, o: depth },
      { G: wallFrame(onWall(F, s0, 0), onWall(F, s0, depth)), a: 0, b: depth, o: 0 },
      { G: wallFrame(onWall(F, s1, depth), onWall(F, s1, 0)), a: 0, b: depth, o: 0 }
    ];
    for (const { G, a, b, o } of sides) {
      if (Bc.glass) {
        const P = (s, yy) => { const [x, z] = onWall(G, s, o - 0.04); return [x, yy, z]; };
        B.quad('glass', P(a, y), P(b, y), P(b, y + rh - 0.06), P(a, y + rh - 0.06));
        B.box('trim', G, a, b, o - 0.07, o, y + rh - 0.06, y + rh, Bc.colour);
      } else {
        B.box('trim', G, a, b, o - 0.08, o, y, y + rh, Bc.colour);
      }
    }
  }
}

// A shop front: glass between piers from the ground to its fascia, a sill, the fascia (or a flat canopy out over the
// pavement), the shops' lettering on the fascia or the canopy
function shopFront(B, house, Sp) {
  const F = wallOut(house, Sp.on[0], Sp.on[1], featureY(Sp));
  const s0 = Sp.s0, s1 = Sp.s1, g = groundAlong(F, s0, s1), top = Sp.top, fa = top - (Sp.fascia ?? 0.6);
  const P = (s, y, o) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  const y0 = g + 0.35;
  if (fa - y0 < 1.2) return;
  B.box('trim', F, s0 - 0.1, s1 + 0.1, 0, 0.12, house.base, y0, TRIM.plinth);
  B.quad('glass', P(s0, y0, 0.04), P(s1, y0, 0.04), P(s1, fa, 0.04), P(s0, fa, 0.04));
  const n = Math.max(1, Math.round((s1 - s0) / 3.0));
  for (let k = 0; k <= n; k++) {
    const s = s0 + ((s1 - s0) * k) / n;
    B.box('trim', F, s - 0.15, s + 0.15, 0, 0.14, house.base, fa, Sp.piers);
    // (the doors' panes: a rail across each bay)
    if (k < n) B.box('trim', F, s + 0.15, s + (s1 - s0) / n - 0.15, 0.04, 0.1, y0 + (fa - y0) * 0.5 - 0.05, y0 + (fa - y0) * 0.5 + 0.05, Sp.piers);
  }
  if (Sp.canopy) {
    const { depth, colour } = Sp.canopy;
    B.box('trim', F, s0 - 0.3, s1 + 0.3, 0, depth, fa, top, colour);
    for (const sg of Sp.signs || []) signOn(B, F, sg.s, depth + 0.015, fa + 0.08, top - 0.08, sg.key, 4.0);
  } else {
    B.box('trim', F, s0 - 0.25, s1 + 0.25, 0, 0.2, fa, top, Sp.fasciaColour || Sp.piers);
    for (const sg of Sp.signs || []) signOn(B, F, sg.s, 0.215, fa + 0.06, top - 0.06, sg.key, 8.0);
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
// A door on a wall (s its middle): a dark leaf in a light frame, a step before it on the ground
function door(B, house, D) {
  const F = wallOut(house, D.on[0], D.on[1]);
  const half = D.w / 2, g = groundAlong(F, D.s - half - 0.3, D.s + half + 0.3), y0 = g + 0.15, y1 = y0 + 2.2;
  B.box('trim', F, D.s - half - 0.12, D.s + half + 0.12, 0, 0.06, y0, y1 + 0.12, TRIM.frame);
  B.box('trim', F, D.s - half, D.s + half, 0.06, 0.08, y0, y1, TRIM.door);
  B.box('trim', F, D.s - half - 0.3, D.s + half + 0.3, 0, 0.45, house.base, y0, TRIM.step);
}

/** The camera spots for a look along the street */
export { VIEWS } from './talstrasse-4-data.js';

/**
 * Builds the row into `scene`. Returns { group, colliders }: none of its own (the houses' walls stand on their surveyed
 * outlines, js/landmarks.js; the balconies, canopies, eaves and boards hang over the ground, the shop fronts' sills
 * and piers and the doors' steps stand within 0.45 m of the walls).
 */
export function buildTalstrasse4(scene) {
  const root = new THREE.Group();
  root.name = 'Talstrasse 4';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Talstrasse 4' }), M = materials();
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
    const Cn = house.cornice;
    if (Cn) house.parts.forEach((p, pi) => { if (p.top !== undefined && (!Cn.parts || Cn.parts.includes(pi))) slab(B, p, Cn.out, Cn.thick, Cn.colour, p.top); });
    for (const Rl of house.railings || []) railing(B, house.parts[Rl.part], Rl.h, Rl.colour);
    for (const Bc of house.balconies || []) balconies(B, house, Bc);
    for (const Sp of house.shops || []) shopFront(B, house, Sp);
    for (const Lt of house.letters || []) {
      const F = wallOut(house, Lt.on[0], Lt.on[1], featureY(Lt));
      if (Lt.board) B.box('trim', F, Lt.s0 - 0.08, Lt.s1 + 0.08, 0, 0.1, Lt.y0 - 0.1, Lt.y1 + 0.1, Lt.board);
      signOn(B, F, (Lt.s0 + Lt.s1) / 2, Lt.board ? 0.115 : 0.03, Lt.y0, Lt.y1, Lt.key, Lt.s1 - Lt.s0);
    }
    for (const D of house.doors || []) door(B, house, D);
    for (const [x, z, top] of house.chimneys || []) chimney(B, x, z, houseTop(house, x, z) - 0.4, top);
  });
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
