import * as THREE from 'three/webgpu';
import { abs, float, fract, hash, mix, smoothstep, step, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  TALSTRASSE_CHALET, groundOutlines, houseWall, namedWall, onWall, outwardRing, pointInRing, roofRing, roofY, toLocal, toWorld, wallFrame, wingWall
} from './talstrasse-chalet-data.js';

export { TALSTRASSE_CHALET };

// The timber chalet on the Talstrasse by the car park rebuilt by hand (js/talstrasse-chalet-data.js), standing in for its
// swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows: the ground
// floor in white plaster, the floors over it in dark brown logs, white six-pane windows drawn by the walls' material
// from their uv (metres along the wall from its middle, metres up the floors' grid), the saddle roof on deep dark
// timber eaves (rafters under the eaves, purlins' heads under the verges), the balconies on the gables and along the
// wing's front with their sawn boards, the low wing under its flat roof on the house's south corner, a chimney, the
// doors. Four meshes: the walls, the roofs, the trim (one vertex-coloured mesh) and the doors and railings' boards (one
// canvas atlas).

excludeBuildings(TALSTRASSE_CHALET.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outline, which follows the roof's edge:
// js/landmarks.js)
SURVEYED_FOOTPRINTS.set(TALSTRASSE_CHALET.osm, groundOutlines());

const D = TALSTRASSE_CHALET;
const { storey: STOREY, win: WIN, bay: BAY } = D;
// v of a wall: metres up the floors' grid, the ground floor's foot at 40 storeys; closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
const vOf = (y) => y - D.floor + UP;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.56, 0.55, 0.52], LOGS = [0.15, 0.078, 0.04], FRAME_C = [0.6, 0.6, 0.57];
const TIMBER = [0.12, 0.062, 0.032], SOFFIT = [0.09, 0.05, 0.028], ROOF = [0.1, 0.096, 0.092];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the logs' mean colour, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.walls = SIMPLE_SKINS.windowed([0.17, 0.095, 0.055], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.85, 0.3);
    return M;
  }
  const fine = fade(8, 28), near = fade(40, 160);
  const glow = nightGlow();
  // White plaster on the ground floor, dark brown logs over it (their courses fading out with distance); a window per
  // bay: a white frame, a post in its middle and two rails (six panes), a sill under it, a curtain drawn in some
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const { half, v, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
  const logs = step(float(vOf(D.timber)), v);
  // the logs: a course every 0.19 m, each a shade of its own, a dark joint between them
  const course = v.div(0.19).floor(), fc = fract(v.div(0.19));
  const joint = smoothstep(0.12, 0.0, fc).max(smoothstep(0.88, 1.0, fc)).mul(fine).mul(0.45);
  const logC = vec3(...LOGS).mul(hash(course.mul(17.3)).mul(0.3).add(0.85)).mul(float(1).sub(joint));
  const plasterC = mix(vec3(...PLASTER).mul(0.94), vec3(...PLASTER).mul(1.04), worldNoise(0.4));
  const wall = mix(plasterC, logC, logs);
  const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
  const mid = WIN.lo + (WIN.hi - WIN.lo) / 3, mid2 = WIN.lo + ((WIN.hi - WIN.lo) * 2) / 3;
  const bars = smoothstep(0.035, 0.02, abs(bu))
    .max(smoothstep(0.03, 0.018, abs(fv.sub(mid))))
    .max(smoothstep(0.03, 0.018, abs(fv.sub(mid2))));
  const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(bars.mul(fine))).mul(open);
  const sill = rect(WIN.half + 0.07, WIN.lo - 0.09, WIN.lo).mul(open).mul(near);
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
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
  // (a house of flats: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 47, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1));
  M.walls = m;
  return M;
}

// --- The doors and the railings' boards: one canvas atlas ----------------------------------------------------------------
const ATLAS_SIZE = [512, 256];
export const ATLAS = {
  door: [0, 0, 128, 256],
  railing: [144, 0, 256, 128]
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // a house door of dark boards in a frame, a small pane in its upper third, a brass handle
  cell('door', (w, h) => {
    g.fillStyle = '#3a1d0f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      const k = ((i * 37) % 11) / 11;
      g.fillStyle = `rgb(${70 + k * 16}, ${36 + k * 8}, ${20 + k * 4})`;
      g.fillRect(8 + (i * (w - 16)) / 6 + 1, 8, (w - 16) / 6 - 2, h - 8);
    }
    g.fillStyle = '#24110a'; g.fillRect(w * 0.3 - 4, h * 0.14 - 4, w * 0.4 + 8, h * 0.2 + 8);
    g.fillStyle = '#1a2328'; g.fillRect(w * 0.3, h * 0.14, w * 0.4, h * 0.2);
    g.fillStyle = '#b08a3c'; g.fillRect(w * 0.78, h * 0.52, 10, 6);
    g.strokeStyle = '#1e0e07'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h);
  });
  // a stretch of the railings: upright sawn boards, a cut-out between each pair (left transparent)
  cell('railing', (w, h) => {
    const n = 10, bw = w / n;
    for (let i = 0; i < n; i++) {
      const k = ((i * 53) % 13) / 13;
      g.fillStyle = `rgb(${74 + k * 14}, ${38 + k * 7}, ${21 + k * 4})`;
      g.fillRect(i * bw + 1, 0, bw - 2, h);
    }
    // (the cut-outs: a tulip between two boards, and the gaps)
    g.globalCompositeOperation = 'destination-out';
    for (let i = 1; i < n; i++) {
      const x = i * bw;
      g.fillRect(x - 1.5, 0, 3, h);
      g.beginPath();
      g.ellipse(x, h * 0.48, bw * 0.28, h * 0.16, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(x - bw * 0.2, h * 0.36); g.lineTo(x, h * 0.2); g.lineTo(x + bw * 0.2, h * 0.36);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  timber: TIMBER, soffit: SOFFIT, frame: FRAME_C, pane: [0.025, 0.03, 0.035], plinth: [0.22, 0.215, 0.205], step: [0.26, 0.255, 0.245],
  rail: [0.14, 0.072, 0.038], chimney: [0.42, 0.41, 0.39], cap: [0.12, 0.12, 0.12], fascia: [0.11, 0.058, 0.03]
};

// The highest ground along a wall, half a metre out of it (from s0 to s1)
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}
// The foot of the lowest storey whose windows clear the ground along a wall (from s0 to s1) by 0.15 m
function windowsFrom(F, s0, s1) {
  const g = groundAlong(F, s0, s1);
  let y = D.floor;
  while (y + WIN.lo < g + 0.15) y += STOREY;
  return y;
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
// (a point inside a ring, its edges counting as inside within a few centimetres)
function pointInRingLoose(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// One stretch of wall from s0 to s1 between y0 and its tops (ya at s0, yb at s1): closed under `win0`, the windows'
// band from `win0` to D.attic where `st` (the stretch the bays are laid out on) is given, closed over D.attic
function wallStretch(B, F, s0, s1, y0, ya, yb, win0, st) {
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const windows = !!st && st.to - st.from >= 2.0;
  const mid = st ? (st.from + st.to) / 2 : (s0 + s1) / 2, half = windows ? (st.to - st.from) / 2 : 0;
  const quad = (lo, ha, hb, open) => {
    const la = Math.min(lo, ha), lb = Math.min(lo, hb);
    if (Math.max(ha - la, hb - lb) < 0.005) return;
    const v = (y) => vOf(y) - (open ? 0 : CLOSED);
    B.quad('walls', P(s0, la), P(s1, lb), P(s1, hb), P(s0, ha), [[s0 - mid, v(la)], [s1 - mid, v(lb)], [s1 - mid, v(hb)], [s0 - mid, v(ha)]], { half: open ? half : 0 });
  };
  const w0 = Math.max(win0, y0);
  quad(y0, Math.min(ya, w0), Math.min(yb, w0), false);
  if (Math.max(ya, yb) > w0) quad(w0, Math.min(ya, D.attic), Math.min(yb, D.attic), windows);
  if (Math.max(ya, yb) > D.attic) quad(D.attic, ya, yb, false);
}

// The house's walls: from the base (or the wing's roof where the wing stands before them) up to the roof over them, a
// step under its upper face; the gables split where the ridge and D.attic cross their tops
function buildHouse(B) {
  const R = outwardRing(D.house), wing = D.wing;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    const topAt = (s) => roofY(toLocal(...onWall(F, s, -0.05))[1]) - 0.06;
    const overWing = (s) => pointInRingLoose(wing.ring, ...onWall(F, s, 0.3));
    const cuts = [0];
    for (let s = 0.25; s < F.len; s += 0.25) if (overWing(s - 0.25) !== overWing(s)) cuts.push(s);
    cuts.push(F.len);
    // where the top bends (the ridge) or crosses D.attic
    const bends = [];
    const ca = toLocal(...F.a)[1], cb = toLocal(...onWall(F, F.len))[1], cr = D.roof.ridge[0];
    if ((ca - cr) * (cb - cr) < 0) bends.push(((cr - ca) / (cb - ca)) * F.len);
    for (const [s0, s1] of [[0, bends[0] ?? F.len], [bends[0] ?? F.len, F.len]]) {
      const t0 = topAt(s0), t1 = topAt(s1);
      if (s1 - s0 > 1e-6 && (t0 - D.attic) * (t1 - D.attic) < 0) bends.push(s0 + ((D.attic - t0) / (t1 - t0)) * (s1 - s0));
    }
    for (let k = 0; k + 1 < cuts.length; k++) {
      const from = cuts[k], to = cuts[k + 1], behind = overWing((from + to) / 2);
      const y0 = behind ? wing.top - 0.02 : D.base;
      const win0 = behind ? wing.top + 0.4 : windowsFrom(F, from, to);
      // (the bays laid out on the whole wall, the same over the wing as beside it)
      const st = { from: 0, to: F.len };
      const pts = [from, ...bends.filter((s) => s > from + 1e-6 && s < to - 1e-6).sort((p, q) => p - q), to];
      for (let j = 0; j + 1 < pts.length; j++) wallStretch(B, F, pts[j], pts[j + 1], y0, topAt(pts[j]), topAt(pts[j + 1]), win0, st);
    }
    plinth(B, F, 0, F.len);
  }
}
// A plinth of grey render along a wall's foot, a little over the ground all along it (where it stands free)
function plinth(B, F, s0, s1) {
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.0));
  for (let k = 0; k < n; k++) {
    const a = s0 + ((s1 - s0) * k) / n, b = s0 + ((s1 - s0) * (k + 1)) / n;
    if (pointInRingLoose(D.wing.ring, ...onWall(F, (a + b) / 2, 0.3))) continue;
    const ga = groundHeight(...onWall(F, a, 0.3)) + 0.3, gb = groundHeight(...onWall(F, b, 0.3)) + 0.3;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('trim', P(a, D.base), P(b, D.base), P(b, Math.max(gb, D.base + 0.2)), P(a, Math.max(ga, D.base + 0.2)), undefined, { colour: C.plinth });
  }
}

// The roof: its two planes, the soffit under them, a fascia board round its edges, the ridge's cap, rafters under the
// eaves and the purlins' heads under the verges
function buildRoof(B) {
  const R = D.roof;
  const P = (t, c, dy = 0) => { const [x, z] = toWorld(t, c); return [x, roofY(c) + dy, z]; };
  const cw = R.west[0], cr = R.ridge[0], ce = R.east[0];
  const centre = toWorld((R.t0 + R.t1) / 2, (cw + ce) / 2);
  for (const [c0, c1] of [[cw, cr], [cr, ce]]) {
    const a = P(R.t0, c0), b = P(R.t0, c1), c = P(R.t1, c1), d = P(R.t1, c0);
    quadOut(B, 'roof', [a, b, c, d], [centre[0], -20, centre[1]]);
    const s = [a, b, c, d].map((p) => [p[0], p[1] - 0.07, p[2]]);
    quadOut(B, 'trim', s, [centre[0], 30, centre[1]], { colour: C.soffit });
  }
  // the fascia: along the eaves and up the verges
  const mid = [centre[0], 5.5, centre[1]];
  for (const t of [R.t0, R.t1]) {
    for (const [c0, c1] of [[cw, cr], [cr, ce]]) quadOut(B, 'trim', [P(t, c0, 0.03), P(t, c1, 0.03), P(t, c1, -0.3), P(t, c0, -0.3)], mid, { colour: C.fascia });
  }
  for (const c of [cw, ce]) quadOut(B, 'trim', [P(R.t0, c, 0.03), P(R.t1, c, 0.03), P(R.t1, c, -0.3), P(R.t0, c, -0.3)], mid, { colour: C.fascia });
  // the ridge's cap
  beam(B, P(R.t0, cr, 0.04), P(R.t1, cr, 0.04), 0.14, 0.06, ROOF.map((v) => v * 0.8));
  // rafters under the eaves, from the wall out to the fascia, every 0.9 m
  for (let t = R.t0 + 0.4; t < R.t1 - 0.3; t += 0.9) {
    beam(B, P(t, 0, -0.2), P(t, cw + 0.05, -0.2), 0.05, 0.09, C.timber);
    beam(B, P(t, D.wid, -0.2), P(t, ce - 0.05, -0.2), 0.05, 0.09, C.timber);
  }
  // the purlins' heads under the verges: the ridge and two purlins on each slope
  for (const c of [cr, (cw + cr) / 2 + 0.6, (cr + ce) / 2 - 0.6, cw + 0.6, ce - 0.6]) {
    for (const [tw, to] of [[0.05, R.t0 + 0.05], [D.len - 0.05, R.t1 - 0.05]]) beam(B, P(tw, c, -0.32), P(to, c, -0.32), 0.1, 0.13, C.timber);
  }
  // the chimney on the south-east slope: grey render, a dark cap
  const Ch = D.chimney, h = Ch.half;
  const F = wallFrame(toWorld(Ch.t - h, Ch.c - h), toWorld(Ch.t + h, Ch.c - h));
  B.box('trim', F, 0, 2 * h, 0, 2 * h, roofY(Ch.c + h) - 0.3, Ch.top, C.chimney);
  B.box('trim', F, -0.08, 2 * h + 0.08, -0.08, 2 * h + 0.08, Ch.top, Ch.top + 0.12, C.cap);
}

// The wing: its walls up to its flat roof (not those against the house), the roof with a timber fascia round it
function buildWing(B) {
  const A = D.wing, R = outwardRing(A.ring), top = A.top;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.05) continue;
    if (pointInRingLoose(D.house, ...onWall(F, F.len / 2, 0.3))) continue;
    wallStretch(B, F, 0, F.len, D.base, top, top, windowsFrom(F, 0, F.len), { from: 0, to: F.len });
    B.box('trim', F, -0.12, F.len + 0.12, -0.1, 0.3, top - 0.35, top + 0.08, C.fascia, { top: 'trim' });
    plinth(B, F, 0, F.len);
  }
  flatRoof(B, R, top);
}

// A balcony on a wall from s0 to s1, `depth` out, its floor at `y`: the slab, struts under it, the railing round its
// three free sides (rails and posts in the trim, the sawn boards from the atlas)
function balcony(B, F, { y, depth, s0, s1 }) {
  const rh = D.railing, slab = 0.18;
  B.box('trim', F, s0, s1, 0, depth, y - slab, y, C.timber);
  // the sides: the front, and the two ends as walls of their own (facing out along the wall)
  const sides = [
    { G: F, a: s0, b: s1, o: depth },
    { G: wallFrame(onWall(F, s0, 0), onWall(F, s0, depth)), a: 0, b: depth, o: 0 },
    { G: wallFrame(onWall(F, s1, depth), onWall(F, s1, 0)), a: 0, b: depth, o: 0 }
  ];
  for (const { G, a, b, o } of sides) {
    const n = Math.max(1, Math.round((b - a) / 1.6)), w = (b - a) / n;
    B.box('trim', G, a, b, o - 0.07, o + 0.02, y + rh - 0.09, y + rh, C.rail);
    B.box('trim', G, a, b, o - 0.07, o + 0.02, y, y + 0.08, C.rail);
    for (let k = 0; k <= n; k++) B.box('trim', G, a + k * w - 0.05, a + k * w + 0.05, o - 0.08, o + 0.02, y, y + rh, C.rail);
    for (let k = 0; k < n; k++) B.decal(G, a + k * w + 0.05, a + (k + 1) * w - 0.05, o - 0.03, y + 0.08, y + rh - 0.09, 'railing');
  }
  // the struts under the slab, from the wall a metre lower out to the slab's front
  const n = Math.max(1, Math.round((s1 - s0) / 2.2));
  for (let k = 0; k <= n; k++) {
    const s = s0 + 0.15 + ((s1 - s0 - 0.3) * k) / n;
    const p = onWall(F, s, 0.06), q = onWall(F, s, depth * 0.85);
    beam(B, [p[0], y - 1.1, p[1]], [q[0], y - slab - 0.02, q[1]], 0.06, 0.06, C.timber);
  }
}

// A door on a wall (s its middle): the atlas' door in a white frame, a step before it on the ground
function door(B, F, { s, w }) {
  const half = w / 2, g = groundAlong(F, s - half - 0.3, s + half + 0.3), y0 = g + 0.15, y1 = y0 + 2.1;
  B.box('trim', F, s - half - 0.1, s + half + 0.1, 0, 0.06, y0, y1 + 0.1, C.frame);
  B.decal(F, s - half, s + half, 0.07, y0, y1, 'door');
  B.box('trim', F, s - half - 0.3, s + half + 0.3, 0, 0.6, D.base, y0, C.step);
}

// A small window in a gable's apex (s its middle): its white frame and its dark pane
function atticWindow(B, F, s) {
  B.box('trim', F, s - 0.45, s + 0.45, 0, 0.05, 5.25, 6.25, C.frame);
  B.box('trim', F, s - 0.36, s + 0.36, 0.05, 0.07, 5.34, 6.16, C.pane);
}

/** The camera spots for a look at it (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  carPark: [652, -3.0, -1300, 676, 0.0, -1328],
  talstrasse: [702, -2.5, -1306, 680, 0.0, -1327],
  fireStation: [690, -2.0, -1352, 678, 1.0, -1331]
};

/**
 * Builds the chalet into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand on
 * the surveyed outlines, js/landmarks.js; the balconies hang over the ground, the doors' steps stand within 0.6 m of
 * the walls).
 */
export function buildTalstrasseChalet(scene) {
  const root = new THREE.Group();
  root.name = 'Chalet Talstrasse';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Chalet Talstrasse' }), M = materials();
  buildHouse(B);
  buildRoof(B);
  buildWing(B);
  for (const b of D.balconies) balcony(B, houseWall(b.wall), b);
  balcony(B, wingWall('south'), D.wing.balcony);
  for (const d of D.doors) door(B, namedWall(d.wall), d);
  const cr = D.roof.ridge[0];
  atticWindow(B, houseWall('south'), cr);
  atticWindow(B, houseWall('north'), D.wid - cr);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}

export { roofRing, pointInRing };
