import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  FRAME as HOTEL_FRAME, PARSENN, clearStretches, cutStretches, frontApex, groundOutlines, isListed, onWall, outwardRing, planeY, pointInRing, roofAt, roofY,
  toLocal, toWorld, wallFrame, windowLine
} from './sport-hotel-parsenn-data.js';

export { PARSENN };

// The Sport Hotel Parsenn rebuilt by hand (js/sport-hotel-parsenn-data.js), standing in for its swissBUILDINGS3D
// volumes, which the streamed tiles drew as white blocks with the town houses' windows: the surveyed walls in white
// plaster up to the surveyed roofs, a window in a grey painted surround with a white six-pane frame in every bay of
// every floor (drawn by the wall's material from its uv: metres along the wall from its middle, metres up the floors'
// grid), painted grey quoins on the corners, a grey scroll band under the eaves and along the verges, the roofs' planes
// with deep dark timber eaves on purlin heads and rafters, small windows in the gables, "Hotel Parsenn" painted in
// script on the gable over the Promenade with the entrance in the cross wing beside it, two timber balconies on the
// gable towards the fire station, the restaurant's glazed low front with the terrace on its roof. Six meshes: the
// walls, the roofs, the restaurant's glazing, the trim (one vertex-coloured mesh) and the decals (one canvas atlas).

excludeBuildings(PARSENN.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(PARSENN.osm, groundOutlines());
// (the hotel's own lettering instead of js/shops.js' generic sign)
SHOP_EXCLUSIONS.add(PARSENN.osm);

const { storey: STOREY, line: LINE, ground: GROUND, win: WIN, bay: BAY } = PARSENN;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the top floor's at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
// (the ground floor's own grid: its windows from its foot up, at the 35th storey)
const GROUND_UP = 35 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.6, 0.595, 0.57], SURROUND = [0.33, 0.33, 0.32], WHITE = [0.6, 0.6, 0.58];
const TIMBER = [0.11, 0.06, 0.03], SOFFIT = [0.085, 0.05, 0.028], ROOF = [0.1, 0.088, 0.08];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.52, 0.515, 0.49], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35);
    M.glass = SIMPLE_SKINS.glow([0.07, 0.065, 0.06], 0.15, 0.6, [1.0, 0.8, 0.55], 0.35);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(60, 200), fine = fade(8, 28);
  const glow = nightGlow();
  // White plaster with a window per bay and floor: a grey painted surround with the sill under it, a white frame, six
  // panes (a post and two bars, fading out with distance), a curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half + WIN.surround });
    const S = WIN.surround;
    const surround = rect(WIN.half + S, WIN.lo - S - 0.05, WIN.hi + S).mul(open);
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const third = (WIN.hi - WIN.lo - 0.12) / 3;
    const bars = smoothstep(0.035, 0.022, abs(bu))
      .max(smoothstep(0.03, 0.018, abs(fv.sub(WIN.lo + 0.06 + third))))
      .max(smoothstep(0.03, 0.018, abs(fv.sub(WIN.lo + 0.06 + 2 * third))));
    const pane = rect(WIN.half - 0.06, WIN.lo + 0.06, WIN.hi - 0.06).mul(float(1).sub(bars.mul(fine))).mul(open);
    // the plaster: a little weathering, a shade darker under the sills
    const stain = rect(WIN.half, WIN.lo - 0.9, WIN.lo - S - 0.05, 0.25).mul(open).mul(0.05);
    const wall = mix(vec3(0.55, 0.545, 0.52), vec3(...PLASTER).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(0.9), step(0.85, id)));
    const span = WIN.hi - WIN.lo - 0.12;
    const curtain = step(float(WIN.hi - 0.06).sub(drawn.mul(span)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(...SURROUND), surround.mul(near.mul(0.6).add(0.4)));
    c = mix(c, vec3(...WHITE), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.5, 0.46, 0.4), curtain);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    // (a hotel: rooms lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 23, { share: 0.32, late: 0.1, tone: twoTones([1.0, 0.72, 0.42], [1.0, 0.86, 0.66], 0.7) })
      .mul(pane).mul(mix(float(1), float(0.5), curtain)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The restaurant's glazing: dark timber posts every 1.4 m and a transom, a warm glow behind the panes in the evening
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.7 });
    const mu = abs(fract(U.div(1.4)).sub(0.5)), mv = abs(V.sub(2.2));
    const frame = smoothstep(0.455, 0.47, mu).max(smoothstep(0.05, 0.035, mv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.4)).mul(13.1).add(17.3));
    m.colorNode = mix(mix(vec3(0.05, 0.06, 0.065), vec3(0.12, 0.13, 0.13), paneId), vec3(...TIMBER), frame);
    m.roughnessNode = mix(float(0.1), float(0.7), frame);
    m.metalnessNode = mix(float(0.7), float(0), frame);
    m.emissiveNode = vec3(1.0, 0.78, 0.5).mul(float(1).sub(frame)).mul(paneId.mul(0.4).add(0.6)).mul(glow.mul(0.35));
    M.glass = m;
  }
  return M;
}

// --- The lettering, the scroll band, the door and the restaurant's board: one canvas atlas -------------------------------
const ATLAS_SIZE = [1024, 768];
export const ATLAS = {
  name: [0, 0, 1024, 384],
  band: [0, 384, 1024, 128],
  door: [0, 512, 192, 256],
  board: [208, 512, 512, 96]
};
// (the band's cell repeats every BAND_LEN m along a wall)
const BAND_LEN = PARSENN.band.h * (ATLAS.band[2] / ATLAS.band[3]);

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // "Hotel Parsenn" painted in script over two lines, in the warm brown of the photograph
  cell('name', (w, h) => {
    g.fillStyle = '#6e5636'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = 'italic 600 150px "Brush Script MT", "Apple Chancery", "Lucida Calligraphy", Georgia, serif';
    g.fillText('Hotel', w * 0.36, h * 0.44, w * 0.6);
    g.font = 'italic 600 168px "Brush Script MT", "Apple Chancery", "Lucida Calligraphy", Georgia, serif';
    g.fillText('Parsenn', w * 0.55, h * 0.9, w * 0.86);
  });
  // The scroll band: running scrolls between two lines, grey as the surrounds (the period divides the cell: it repeats)
  cell('band', (w, h) => {
    g.strokeStyle = '#8c8c86'; g.fillStyle = '#8c8c86'; g.lineCap = 'round';
    g.fillRect(0, 6, w, 9); g.fillRect(0, h - 15, w, 9);
    const P = 128, m = h / 2;
    g.lineWidth = 11;
    for (let x = 0; x < w; x += P) {
      g.beginPath();
      g.moveTo(x, m + 18);
      g.bezierCurveTo(x + P * 0.3, m + 40, x + P * 0.55, m - 34, x + P * 0.5, m - 6);
      g.bezierCurveTo(x + P * 0.46, m + 14, x + P * 0.3, m + 8, x + P * 0.34, m - 4);
      g.stroke();
      g.beginPath();
      g.moveTo(x + P * 0.5, m - 6);
      g.bezierCurveTo(x + P * 0.62, m + 30, x + P * 0.85, m + 30, x + P, m + 18);
      g.stroke();
    }
  });
  // The entrance: a pair of dark timber doors with panels under a fanlight, in a grey surround
  cell('door', (w, h) => {
    g.fillStyle = '#585853'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b1a0e'; g.fillRect(14, 14, w - 28, h - 14);
    g.fillStyle = '#1a2024'; g.fillRect(22, 22, w - 44, 46);
    g.fillStyle = '#3b2615';
    for (const x of [24, w / 2 + 6]) { g.fillRect(x, 84, w / 2 - 30, 70); g.fillRect(x, 166, w / 2 - 30, 76); }
    g.fillStyle = '#c8b27a'; g.fillRect(w / 2 - 14, 150, 8, 22); g.fillRect(w / 2 + 6, 150, 8, 22);
  });
  // The restaurant's board on its fascia
  cell('board', (w, h) => {
    g.fillStyle = '#2b1a0e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8d7a8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 600 62px Georgia, "Times New Roman", serif';
    g.fillText('Restaurant', w / 2, h / 2 + 4, w - 30);
  });
  return canvasTexture(c);
}

// --- Geometry helpers --------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  timber: TIMBER, soffit: SOFFIT, surround: SURROUND, frame: WHITE, pane: [0.025, 0.03, 0.035], quoin: [0.34, 0.34, 0.33],
  slab: [0.45, 0.44, 0.42], plinth: [0.3, 0.3, 0.29]
};

// The highest ground along a wall, half a metre out of it
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A quad facing away from `centre` (its corners turned round if they face it) */
function quadOut(B, bucket, pts, centre, opt = {}) {
  const [a, b, c, d] = pts;
  const n = cross(sub(b, a), sub(d, a)), m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  B.quad(bucket, ...(dot(n, sub(m, centre)) >= 0 ? [a, b, c, d] : [a, d, c, b]), undefined, opt);
}
/** A beam from p to q ([x, y, z]): `hw` half its width (level), `hh` half its height, into the trim */
function beam(B, p, q, hw, hh, colour) {
  const d = sub(q, p), L = Math.hypot(...d);
  if (L < 1e-3) return;
  const dn = d.map((v) => v / L);
  let side = [-dn[2], 0, dn[0]];
  const sl = Math.hypot(side[0], side[2]);
  side = sl < 1e-3 ? [1, 0, 0] : side.map((v) => v / sl);
  const up = cross(side, dn);
  const k = (o, sx, sy) => [o[0] + side[0] * sx * hw + up[0] * sy * hh, o[1] + side[1] * sx * hw + up[1] * sy * hh, o[2] + side[2] * sx * hw + up[2] * sy * hh];
  const centre = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], opt = { colour };
  const P = [k(p, -1, -1), k(p, 1, -1), k(p, 1, 1), k(p, -1, 1)], Q = [k(q, -1, -1), k(q, 1, -1), k(q, 1, 1), k(q, -1, 1)];
  for (let i = 0; i < 4; i++) quadOut(B, 'trim', [P[i], P[(i + 1) % 4], Q[(i + 1) % 4], Q[i]], centre, opt);
  quadOut(B, 'trim', P, centre, opt);
  quadOut(B, 'trim', Q, centre, opt);
}
/** A painted patch on a wall's face (`o` m before it) */
function paint(B, F, s0, s1, y0, y1, colour, o = 0.012) {
  const P = (s, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  B.quad('trim', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), undefined, { colour });
}

// --- The walls ---------------------------------------------------------------------------------------------------------
// A wall's top: the roof over it, a step inside
const topAt = (F, s) => roofY(...onWall(F, s, -0.05));

/** Where along a wall its top bends: a sample every 0.5 m, the ridges' crossings, the stretches' ends; with the tops */
function wallSamples(F, extra = []) {
  const ss = new Set([0, F.len, ...extra.filter((s) => s > 0 && s < F.len)]);
  for (let s = 0.5; s < F.len - 0.05; s += 0.5) ss.add(s);
  // (the ridges: c = 0 and the cross wing's at t = 6.18; the narrow wing's edge at t = 5.3)
  const [ta, ca] = toLocal(...F.a), [tb, cb] = toLocal(...onWall(F, F.len));
  const cut = (va, vb, at) => { if ((va - at) * (vb - at) < 0) ss.add(((at - va) / (vb - va)) * F.len); };
  cut(ca, cb, 0); cut(ca, cb, -0.67); cut(ta, tb, 6.18); cut(ta, tb, 5.3);
  const s = [...ss].sort((p, q) => p - q);
  const top = s.map((v) => topAt(F, v));
  // (dropping the samples where the top runs straight on)
  const keep = s.map((v, i) => {
    if (i === 0 || i === s.length - 1 || extra.some((e) => Math.abs(e - v) < 1e-6)) return true;
    const k = (v - s[i - 1]) / (s[i + 1] - s[i - 1]);
    return Math.abs(top[i - 1] + (top[i + 1] - top[i - 1]) * k - top[i]) > 0.01 || windowLine(top[i - 1]) !== windowLine(top[i + 1]);
  });
  return { s: s.filter((_, i) => keep[i]), top: top.filter((_, i) => keep[i]) };
}

/**
 * A wall of the hotel from `from` (the base, or over the restaurant's roof) up to the roof over it: the plinth and the
 * ground floor's windows from the ground's level (`ground`), the floors' windows up to the highest floor that fits
 * under its top, closed above (the gables); cut into stretches with and without windows
 */
function buildWall(B, a, b, { from = PARSENN.base, ground = true } = {}) {
  const F = wallFrame(a, b);
  if (F.len < 0.05) return null;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const clear = clearStretches(a, b);
  const upper = cutStretches(F.len, clear.upper), low = cutStretches(F.len, clear.ground);
  const ends = [...upper, ...low].flatMap((st) => [st.from, st.to]);
  const { s, top } = wallSamples(F, ends);
  const foot = groundAlong(F) + 0.25;
  const within = (list, m) => list.find((st) => m >= st.from - 1e-6 && m <= st.to + 1e-6);
  // a quad of the wall from y0 to y1 over s0–s1 (y1 a pair: a sloped top), on a stretch's grid `g` (null: closed)
  const quad = (s0, s1, y0, y1, st, vOf) => {
    const [ya, yb] = Array.isArray(y1) ? y1 : [y1, y1];
    if (Math.max(ya, yb) - y0 < 0.005) return;
    const windows = !!st && st.windows && st.to - st.from >= 2.4;
    const mid = st ? (st.from + st.to) / 2 : F.len / 2, half = windows ? (st.to - st.from) / 2 : 0;
    const v = (y) => vOf(y) - (windows ? 0 : CLOSED);
    B.quad('plaster', P(s0, y0), P(s1, y0), P(s1, yb), P(s0, ya), [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(yb)], [s0 - mid, v(ya)]], { half });
  };
  const vUp = (y) => y - LINE + UP, vLow = (y) => y - foot + GROUND_UP;
  for (let i = 0; i + 1 < s.length; i++) {
    const s0 = s[i], s1 = s[i + 1], m = (s0 + s1) / 2;
    const L = windowLine(Math.min(top[i], top[i + 1]));
    if (ground && from < foot) {
      const gTop = Math.min(foot + STOREY - 0.01, GROUND);
      quad(s0, s1, from, foot, null, vUp);
      quad(s0, s1, foot, gTop, within(low, m), vLow);
      if (gTop < GROUND) quad(s0, s1, gTop, GROUND, null, vUp);
    } else quad(s0, s1, from, GROUND, null, vUp);
    if (L > GROUND) quad(s0, s1, GROUND, L, within(upper, m), vUp);
    quad(s0, s1, Math.max(L, GROUND), [top[i], top[i + 1]], null, vUp);
  }
  return { F, s, top, foot };
}

// A closed patch of wall between three points (the steps between the roofs), facing `out` (a world [x, z])
function closedTri(B, p, q, r, out) {
  const n = cross(sub(q, p), sub(r, p));
  const [a, b, c] = n[0] * out[0] + n[2] * out[1] >= 0 ? [p, q, r] : [p, r, q];
  const uvOf = (k) => [k[0] + k[2], k[1] - LINE + UP - CLOSED];
  B.tri('plaster', a, b, c, [a, b, c].map(uvOf));
}

// The quoins painted on a corner's two walls: long and short blocks in turn, from the foot to under the scroll band
function quoins(B, Fa, Fb, y0, y1) {
  let k = 0;
  for (let y = y0 + 0.05; y + 0.5 <= y1; y += 0.62, k++) {
    const [wa, wb] = k % 2 === 0 ? [0.42, 0.72] : [0.72, 0.42];
    paint(B, Fa, Fa.len - wa, Fa.len, y, y + 0.5, C.quoin);
    paint(B, Fb, 0, wb, y, y + 0.5, C.quoin);
  }
}

// The scroll band under a wall's top, from the atlas' band cell repeated along it
function scrollBand(B, W) {
  const { F, s, top } = W, { h, under } = PARSENN.band;
  const [ax, ay, aw, ah] = ATLAS.band, [AW, AH] = ATLAS_SIZE;
  const v0 = 1 - (ay + ah) / AH, v1 = 1 - ay / AH;
  const P = (q, y) => { const [x, z] = onWall(F, q, 0.03); return [x, y, z]; };
  const yAt = (q) => { let i = 0; while (i + 2 < s.length && s[i + 1] < q) i++; const k = (q - s[i]) / (s[i + 1] - s[i] || 1); return top[i] + (top[i + 1] - top[i]) * k; };
  // (the breaks: the tops' bends and the cell's ends)
  const br = new Set(s);
  for (let q = BAND_LEN; q < F.len; q += BAND_LEN) br.add(q);
  const qs = [...br].sort((p, q) => p - q);
  for (let i = 0; i + 1 < qs.length; i++) {
    const q0 = qs[i], q1 = qs[i + 1];
    if (q1 - q0 < 0.01) continue;
    const cellAt = Math.floor((q0 + 1e-6) / BAND_LEN) * BAND_LEN;
    const u0 = (ax + ((q0 - cellAt) / BAND_LEN) * aw) / AW, u1 = (ax + ((q1 - cellAt) / BAND_LEN) * aw) / AW;
    const t0 = yAt(q0) - under, t1 = yAt(q1) - under;
    B.quad('decal', P(q0, t0 - h), P(q1, t1 - h), P(q1, t1), P(q0, t0), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
}

// The gable's small windows under its peak, a pair where they fit
function atticWindows(B, W) {
  const { F, s, top } = W;
  let best = 0;
  for (let i = 1; i < s.length; i++) if (top[i] > top[best]) best = i;
  const peak = s[best], tp = top[best];
  if (tp < 15.9) return;
  const y0 = LINE + 0.45, y1 = y0 + 1.15, need = y1 + PARSENN.band.h + PARSENN.band.under + 0.1;
  const fits = (c, hw) => topAt(F, c - hw - 0.2) >= need && topAt(F, c + hw + 0.2) >= need && c - hw > 0.8 && c + hw < F.len - 0.8;
  const hw = 0.34;
  const at = fits(peak - 0.6, hw) && fits(peak + 0.6, hw) ? [peak - 0.6, peak + 0.6] : fits(peak, hw) ? [peak] : [];
  for (const c of at) {
    paint(B, F, c - hw - 0.13, c + hw + 0.13, y0 - 0.17, y1 + 0.13, C.surround);
    paint(B, F, c - hw, c + hw, y0, y1, C.frame, 0.02);
    paint(B, F, c - hw + 0.06, c + hw - 0.06, y0 + 0.06, y1 - 0.06, C.pane, 0.028);
    paint(B, F, c - 0.025, c + 0.025, y0 + 0.06, y1 - 0.06, C.frame, 0.032);
  }
}

// The hotel's walls, the steps between its roofs, the quoins, the scroll band, the gables' windows
function buildHotel(B) {
  const R = outwardRing(PARSENN.hotel), n = R.length;
  const walls = [];
  for (let i = 0; i < n; i++) {
    const a = R[i], b = R[(i + 1) % n];
    const over = isListed(PARSENN.overRestaurant, a, b);
    walls.push(buildWall(B, a, b, over ? { from: PARSENN.restaurant.top - 0.1, ground: false } : {}));
  }
  // (the narrow wing's roof stands over the saddle roof's north-east slope where they meet: the step between them)
  {
    const c1 = 6.85, r = PARSENN.roofs, ne = r.find((q) => q.id === 'north-east'), nw = r.find((q) => q.id === 'narrow-wing');
    const p0 = toWorld(5.3, 0), p1 = toWorld(5.3, c1);
    closedTri(B, [p0[0], planeY(nw, 5.3, 0), p0[1]], [p1[0], planeY(nw, 5.3, c1), p1[1]], [p1[0], planeY(ne, 5.3, c1), p1[1]], HOTEL_FRAME.u);
  }
  // (the cross wing's ridge ends over the saddle roof's south-west slope: its end)
  {
    const sw = PARSENN.roofs.find((q) => q.id === 'south-west'), cr = PARSENN.roofs.find((q) => q.id === 'cross-north-west');
    const c = -0.67, y = planeY(sw, 0, c), d = (cr.at[2] - y) / cr.dt;
    const P = (t, yy) => { const [x, z] = toWorld(t, c); return [x, yy, z]; };
    closedTri(B, P(cr.at[0] - d, y), P(cr.at[0], cr.at[2]), P(cr.at[0] + d, y), HOTEL_FRAME.n);
  }
  // the quoins on the outer corners between walls of some length
  for (let i = 0; i < n; i++) {
    const Wa = walls[(i + n - 1) % n], Wb = walls[i];
    if (!Wa || !Wb || Wa.F.len < 2 || Wb.F.len < 2) continue;
    const q = R[i], dx = Wa.F.n[0] + Wb.F.n[0], dz = Wa.F.n[1] + Wb.F.n[1];
    if (pointInRing(PARSENN.hotel, q[0] + dx * 0.3, q[1] + dz * 0.3)) continue; // (an inner corner)
    // (from the ground, or from the restaurant's roof where a wall stands on it)
    const over = isListed(PARSENN.overRestaurant, R[(i + n - 1) % n], q) || isListed(PARSENN.overRestaurant, q, R[(i + 1) % n]);
    const y0 = over ? PARSENN.restaurant.top + 0.05 : Math.min(Wa.foot, Wb.foot) - 0.25;
    const y1 = Math.min(Wa.top[Wa.top.length - 1], Wb.top[0]) - PARSENN.band.h - PARSENN.band.under - 0.15;
    quoins(B, Wa.F, Wb.F, y0, y1);
  }
  for (const W of walls) if (W && W.F.len >= 2) { scrollBand(B, W); atticWindows(B, W); }
  return walls;
}

// The wing across the yard: its walls to the slope over it
function buildYardWing(B) {
  const R = outwardRing(PARSENN.yardWing);
  for (let i = 0; i < R.length; i++) buildWall(B, R[i], R[(i + 1) % R.length]);
}

// --- The roofs ---------------------------------------------------------------------------------------------------------
// Each roof's plane over its outline, its underside in dark timber; along its outer edges (where no other roof runs on
// at about its height) a fascia board and, under the eaves, rafters, under the verges the purlins' heads
function buildRoofs(B) {
  const ov = PARSENN.overhang;
  for (const r of PARSENN.roofs) {
    const ring = r.poly.map(([t, c]) => toWorld(t, c));
    const yOf = (x, z) => { const [t, c] = toLocal(x, z); return planeY(r, t, c); };
    const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      const p = [ring[i], ring[j], ring[k]].map((q) => [q[0], yOf(q[0], q[1]), q[1]]);
      const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
      const t = up ? p : [p[0], p[2], p[1]];
      B.tri('roof', t[0], t[1], t[2], t.map((q) => [q[0], q[2]]));
      const d = t.map((q) => [q[0], q[1] - 0.06, q[2]]);
      B.tri('trim', d[0], d[2], d[1], undefined, { colour: C.soffit });
    }
    // the edges, in pieces of about a metre
    for (let i = 0; i < r.poly.length; i++) {
      const a = r.poly[i], b = r.poly[(i + 1) % r.poly.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) continue;
      // (out of the outline: the side a step to which leaves it)
      let nt = (b[1] - a[1]) / len, nc = -(b[0] - a[0]) / len;
      const mt = (a[0] + b[0]) / 2, mc = (a[1] + b[1]) / 2;
      if (pointInRing(r.poly, mt + nt * 0.05, mc + nc * 0.05)) { nt = -nt; nc = -nc; }
      const pieces = Math.max(1, Math.round(len / 1.0));
      const verge = Math.abs(planeY(r, ...a) - planeY(r, ...b)) > 0.4;
      for (let k = 0; k < pieces; k++) {
        const f0 = k / pieces, f1 = (k + 1) / pieces, fm = (f0 + f1) / 2;
        const at = (f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        const [qt, qc] = at(fm), own = planeY(r, qt, qc);
        const ot = qt + nt * 0.15, oc = qc + nc * 0.15;
        const other = PARSENN.roofs.some((o) => o !== r && pointInRing(o.poly, ot, oc) && planeY(o, ot, oc) > own - 1.0);
        if (other) continue;
        const P = (f, dy = 0) => { const [t, c] = at(f), [x, z] = toWorld(t, c); return [x, planeY(r, t, c) + dy, z]; };
        const [cx, cz] = toWorld(qt - nt, qc - nc), centre = [cx, own - 0.15, cz];
        quadOut(B, 'trim', [P(f0, 0.02), P(f1, 0.02), P(f1, -0.3), P(f0, -0.3)], centre, { colour: C.timber });
        // (under the eaves a rafter every metre; under the verges a purlin's head every other piece)
        const inward = (f, dy, back) => { const [t, c] = at(f), [x, z] = toWorld(t - nt * back, c - nc * back); return [x, planeY(r, t - nt * back, c - nc * back) + dy, z]; };
        if (!verge) beam(B, inward(fm, -0.17, 0.05), inward(fm, -0.17, ov + 0.3), 0.05, 0.08, C.timber);
        else if (k % 2 === 1 && k < pieces - 1) beam(B, inward(fm, -0.32, 0.0), inward(fm, -0.32, ov + 0.3), 0.11, 0.13, C.timber);
      }
    }
  }
}

// --- The restaurant, the entrance, the lettering, the balconies ------------------------------------------------------
// The restaurant's low front: a plinth, the glazing, the band under its roof with the board on the long side, the
// terrace's rail on its roof
function buildRestaurant(B) {
  const Rs = PARSENN.restaurant, R = outwardRing(Rs.ring), top = Rs.top, base = PARSENN.base;
  let longest = null;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length];
    if (isListed(Rs.inner, a, b)) continue;
    const F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    const foot = groundAlong(F) + 0.25, g0 = foot + Rs.glass.from, g1 = top - Rs.glass.below;
    const closed = (y0, y1) => B.quad('plaster', P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1),
      [[0, y0 - LINE + UP - CLOSED], [F.len, y0 - LINE + UP - CLOSED], [F.len, y1 - LINE + UP - CLOSED], [0, y1 - LINE + UP - CLOSED]]);
    if (F.len >= 1.0) {
      closed(base, g0);
      B.quad('glass', P(0, g0), P(F.len, g0), P(F.len, g1), P(0, g1), [[0, 0], [F.len, 0], [F.len, g1 - g0], [0, g1 - g0]]);
      closed(g1, top);
      B.box('trim', F, -0.02, F.len + 0.02, 0, 0.12, g0 - 0.12, g0, C.slab);
    } else closed(base, top);
    // the coping and the terrace's rail: posts, a handrail and a board under it
    B.box('trim', F, -0.04, F.len + 0.04, -0.25, 0.08, top - 0.08, top + 0.12, C.slab);
    const P3 = (s, y) => { const [x, z] = onWall(F, s, -0.1); return [x, y, z]; };
    const y0 = top + 0.12, y1 = top + Rs.rail;
    beam(B, P3(0, y1 - 0.04), P3(F.len, y1 - 0.04), 0.06, 0.045, C.timber);
    beam(B, P3(0, y0 + 0.2), P3(F.len, y0 + 0.2), 0.03, 0.08, C.timber);
    const nPost = Math.max(1, Math.round(F.len / 1.6));
    for (let k = 0; k <= nPost; k++) { const s = (F.len * k) / nPost; beam(B, P3(s, y0), P3(s, y1 - 0.08), 0.05, 0.05, C.timber); }
    if (!longest || F.len > longest.F.len) longest = { F, g1 };
  }
  flatRoof(B, R, top);
  // the board on the long side's band
  const { F, g1 } = longest, w = 3.0, h = w * ATLAS.board[3] / ATLAS.board[2], m = F.len / 2;
  B.decal(F, m - w / 2, m + w / 2, 0.05, g1 + 0.2, g1 + 0.2 + h, 'board');
}

// The gable over the Promenade: "Hotel Parsenn" under the ridge's end, the entrance in the cross wing's part
function buildFront(B) {
  const Fr = PARSENN.front, { F, s } = frontApex(), N = Fr.name;
  B.decal(F, s - N.w / 2, s + N.w / 2, 0.03, N.y0, N.y1, 'name');
  const D = Fr.door, y0 = groundHeight(...onWall(F, D.s, 0.6)) + 0.02, h = D.w * ATLAS.door[3] / ATLAS.door[2];
  B.decal(F, D.s - D.w / 2, D.s + D.w / 2, 0.03, y0, y0 + h, 'door');
  // a step before it and a small timber canopy over it
  B.box('trim', F, D.s - D.w / 2 - 0.3, D.s + D.w / 2 + 0.3, 0, 0.45, y0 - 0.5, y0, C.plinth);
  B.box('trim', F, D.s - D.w / 2 - 0.45, D.s + D.w / 2 + 0.45, 0, 1.0, y0 + h + 0.2, y0 + h + 0.34, C.timber, { top: 'roof' });
  // (two brackets under it)
  const Q = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  for (const e of [-1, 1]) { const s = D.s + e * (D.w / 2 + 0.3); beam(B, Q(s, 0.04, y0 + h - 0.3), Q(s, 0.9, y0 + h + 0.2), 0.04, 0.05, C.timber); }
}

// The balconies on the gable towards the fire station: a slab, a closed timber balustrade
function buildBalconies(B) {
  const Bc = PARSENN.balconies, F = wallFrame(Bc.a, Bc.b), m = F.len / 2, s0 = m - Bc.w / 2, s1 = m + Bc.w / 2;
  for (const y of Bc.floors) {
    B.box('trim', F, s0, s1, 0, Bc.out, y - 0.2, y, C.timber);
    B.box('trim', F, s0, s1, Bc.out - 0.06, Bc.out, y, y + Bc.rail - 0.08, C.timber);
    for (const s of [s0, s1 - 0.06]) B.box('trim', F, s, s + 0.06, 0, Bc.out, y, y + Bc.rail - 0.08, C.timber);
    B.box('trim', F, s0 - 0.04, s1 + 0.04, 0, Bc.out + 0.04, y + Bc.rail - 0.08, y + Bc.rail, C.timber);
  }
}

/**
 * Builds the Sport Hotel Parsenn into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls
 * stand on the surveyed outlines, js/landmarks.js; the step and the canopy at the door are within a metre of them).
 */
export function buildSportHotelParsenn(scene) {
  const root = new THREE.Group();
  root.name = 'Sport Hotel Parsenn';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Sport Hotel Parsenn' }), M = materials();
  buildHotel(B);
  buildYardWing(B);
  buildRoofs(B);
  buildRestaurant(B);
  buildFront(B);
  buildBalconies(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}

export { roofAt };
