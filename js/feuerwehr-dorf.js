import * as THREE from 'three/webgpu';
import { abs, float, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  FEUERWEHR_DORF, annexEast, annexSouth, annexWest, groundOutlines, hallWall, onWall, outwardRing, roofRing, roofY, toLocal, toWorld,
  wallFrame
} from './feuerwehr-dorf-data.js';

export { FEUERWEHR_DORF };

// The Feuerwehrdepot Dorf rebuilt by hand (js/feuerwehr-dorf-data.js), standing in for its swissBUILDINGS3D volumes,
// which the streamed tiles drew as white blocks with the town houses' windows: the hall in pale warm plaster under its
// shallow saddle roof on deep dark timber eaves (rafters under the eaves, the gables' apexes in dark boards), the
// upper floor's windows in dark timber frames drawn by the wall's material from its uv (metres along the wall from its
// middle, metres up the floors' grid), the two engines' doors of brown timber boards on the forecourt's gable with
// "FEUERWEHR" over them, the small windows and doors of the ground floor; the flat-roofed annex in pale green-grey
// plaster with its wide timber door under a dark fascia and two domed roof lights. Five meshes: the hall's walls, the
// annex's walls, the roofs, the trim (one vertex-coloured mesh) and the doors and lettering (one canvas atlas).

excludeBuildings(FEUERWEHR_DORF.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(FEUERWEHR_DORF.osm, groundOutlines());
// (its own lettering instead of js/shops.js' generic sign)
SHOP_EXCLUSIONS.add(FEUERWEHR_DORF.osm);

const D = FEUERWEHR_DORF;
const { storey: STOREY, win: WIN, bay: BAY } = D;
// v of a wall: metres up the floors' grid, the upper floor's top (`line`) at 40 storeys; closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
const vOf = (y) => y - D.line + UP;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.44, 0.39, 0.34], GREEN = [0.3, 0.34, 0.29], FRAME = [0.1, 0.055, 0.03];
const TIMBER = [0.11, 0.06, 0.032], SOFFIT = [0.085, 0.05, 0.028], ROOF = [0.1, 0.098, 0.095];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band on the upper floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.4, 0.355, 0.31], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.3, { bay: BAY, half: WIN.half });
    M.annex = SIMPLE_SKINS.plain([0.29, 0.33, 0.28], 0.92);
    return M;
  }
  const near = fade(60, 200), fine = fade(8, 28);
  const glow = nightGlow();
  // Pale warm plaster with a window per bay on the upper floor: a dark timber frame, a post in its middle and a rail
  // over its lower two thirds (fading out with distance), a light sill under it, a blind drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu)).max(smoothstep(0.035, 0.022, abs(fv.sub(WIN.lo + (WIN.hi - WIN.lo) * 0.66))));
    const pane = rect(WIN.half - 0.08, WIN.lo + 0.08, WIN.hi - 0.08).mul(float(1).sub(bars.mul(fine))).mul(open);
    const sill = rect(WIN.half + 0.06, WIN.lo - 0.08, WIN.lo).mul(open).mul(near);
    const stain = rect(WIN.half, WIN.lo - 0.8, WIN.lo - 0.08, 0.25).mul(open).mul(0.05);
    const wall = mix(vec3(...PLASTER).mul(0.93), vec3(...PLASTER).mul(1.05), worldNoise(0.3)).mul(float(1).sub(stain));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(0.9), step(0.85, id)));
    const span = WIN.hi - WIN.lo - 0.16;
    const blind = step(float(WIN.hi - 0.08).sub(drawn.mul(span)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(0.42, 0.41, 0.39), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.45, 0.43, 0.4), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    // (the crew's rooms: a few lit in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 31, { share: 0.22, late: 0.08, tone: twoTones([1.0, 0.86, 0.66], [0.86, 0.92, 1.0], 0.6) })
      .mul(pane).mul(mix(float(1), float(0.5), blind)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The annex's pale green-grey plaster: a little weathering, darker towards the foot (v: metres over the ground)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 });
    const V = uv().y;
    const foot = smoothstep(0.6, 0.0, V).mul(0.12);
    m.colorNode = mix(vec3(...GREEN).mul(0.92), vec3(...GREEN).mul(1.06), worldNoise(0.35)).mul(float(1).sub(foot));
    M.annex = m;
  }
  return M;
}

// --- The doors and the lettering: one canvas atlas -----------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  name: [0, 0, 1024, 128],
  door: [0, 144, 368, 368],
  annexDoor: [384, 144, 448, 368]
};

// Brown timber boards, the joints of the door's sections across them, a row of small panes in the doors (`panes`)
function boards(g, w, h, { boardsN, sections, panes }) {
  g.fillStyle = '#4a2416'; g.fillRect(0, 0, w, h);
  const bw = w / boardsN;
  for (let i = 0; i < boardsN; i++) {
    const k = ((i * 37) % 11) / 11;
    g.fillStyle = `rgb(${66 + k * 18}, ${32 + k * 8}, ${20 + k * 5})`;
    g.fillRect(i * bw + 1, 0, bw - 2, h);
  }
  g.fillStyle = 'rgba(20, 8, 4, 0.75)';
  for (let i = 1; i < sections; i++) g.fillRect(0, (h * i) / sections - 2, w, 4);
  if (panes) {
    const y = h * (1 / sections) + 10, ph = h / sections - 40;
    for (let i = 0; i < panes; i++) {
      const x = ((i + 0.5) * w) / panes, pw = w / panes - 26;
      g.fillStyle = '#2a1408'; g.fillRect(x - pw / 2 - 4, y - 4, pw + 8, ph + 8);
      g.fillStyle = '#1a2328'; g.fillRect(x - pw / 2, y, pw, ph);
    }
  }
  // a frame of dark boards round it
  g.strokeStyle = '#24100a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
}

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // "FEUERWEHR" in plain red capitals
  cell('name', (w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.round(h * 0.82)}px Helvetica, Arial, sans-serif`;
    g.fillStyle = '#a3140f';
    g.fillText('FEUERWEHR', w / 2, h * 0.54, w - 12);
  });
  // the engines' doors: four sections, a row of small panes in the second from the top
  cell('door', (w, h) => boards(g, w, h, { boardsN: 24, sections: 4, panes: 4 }));
  // the annex's wide door: boards without panes, as in the photographs
  cell('annexDoor', (w, h) => boards(g, w, h, { boardsN: 30, sections: 4, panes: 0 }));
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  timber: TIMBER, soffit: SOFFIT, frame: FRAME, pane: [0.025, 0.03, 0.035], plinth: [0.24, 0.235, 0.225], lintel: [0.34, 0.33, 0.31],
  dome: [0.62, 0.62, 0.6], kerb: [0.26, 0.26, 0.25], door: [0.075, 0.04, 0.024]
};

// The highest ground along a wall, half a metre out of it (from s0 to s1)
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
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

// The hall's walls: from the base up to the roof over them (a step under its upper face); the upper floor's band with
// windows where the wall is free (not over the annex's roof), closed under and over it; the gables' apexes over
// D.gable in dark boards
function buildHall(B) {
  const R = outwardRing(D.hall), annex = D.annex.ring;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    const topAt = (s) => roofY(toLocal(...onWall(F, s, -0.05))[1]) - 0.06;
    // where the top bends: the ridge's crossing
    const ss = [0, F.len];
    const ca = toLocal(...F.a)[1], cb = toLocal(...onWall(F, F.len))[1], cr = D.roof.ridge[0];
    if ((ca - cr) * (cb - cr) < 0) ss.splice(1, 0, ((cr - ca) / (cb - ca)) * F.len);
    // the stretches: over the annex's roof (closed) or free
    const overAnnex = (s) => annex.length && (() => { const [x, z] = onWall(F, s, 0.3); return pointInRingLoose(annex, x, z); })();
    const cuts = [0];
    for (let s = 0.25; s < F.len; s += 0.25) if (overAnnex(s - 0.25) !== overAnnex(s)) cuts.push(s);
    cuts.push(F.len);
    const quad = (s0, s1, y0, ya, yb, st) => {
      if (Math.max(ya, yb) - y0 < 0.005) return;
      const windows = !!st && st.to - st.from >= 2.4;
      const mid = st ? (st.from + st.to) / 2 : F.len / 2, half = windows ? (st.to - st.from) / 2 : 0;
      const v = (y) => vOf(y) - (windows ? 0 : CLOSED);
      B.quad('plaster', P(s0, y0), P(s1, y0), P(s1, yb), P(s0, ya), [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(yb)], [s0 - mid, v(ya)]], { half });
    };
    for (let k = 0; k + 1 < cuts.length; k++) {
      const from = cuts[k], to = cuts[k + 1], st = overAnnex((from + to) / 2) ? null : { from, to };
      const pts = [from, ...ss.filter((s) => s > from + 1e-6 && s < to - 1e-6), to];
      for (let j = 0; j + 1 < pts.length; j++) {
        const s0 = pts[j], s1 = pts[j + 1], t0 = topAt(s0), t1 = topAt(s1);
        quad(s0, s1, D.base, D.upper, D.upper, null);
        quad(s0, s1, D.upper, D.line, D.line, st);
        const g0 = Math.min(t0, D.gable), g1 = Math.min(t1, D.gable);
        quad(s0, s1, D.line, g0, g1, null);
        // the gable's apex in dark boards (a sloped top: split where it crosses D.gable)
        if (t0 > D.gable || t1 > D.gable) {
          let a = s0, b = s1;
          if (t0 < D.gable) a = s0 + ((D.gable - t0) / (t1 - t0)) * (s1 - s0);
          if (t1 < D.gable) b = s0 + ((D.gable - t0) / (t1 - t0)) * (s1 - s0);
          const ta = topAt(a), tb = topAt(b);
          const Q = (s, y) => { const [x, z] = onWall(F, s, 0.04); return [x, y, z]; };
          B.quad('trim', Q(a, D.gable), Q(b, D.gable), Q(b, Math.max(tb, D.gable)), Q(a, Math.max(ta, D.gable)), undefined, { colour: C.timber });
        }
      }
    }
    // the plinth along the wall's foot, a board under the gable's boards
    const foot = groundAlong(F);
    B.box('trim', F, 0, F.len, 0, 0.04, D.base, foot + 0.35, C.plinth);
    if (topAt(F.len / 2) > D.gable + 0.3) B.box('trim', F, 0, F.len, 0, 0.12, D.gable - 0.12, D.gable + 0.02, C.timber);
  }
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

// The roof: its two planes, the soffit under them, a fascia board round its edges, rafters under the eaves and the
// purlins' heads under the verges
function buildRoof(B) {
  const R = D.roof;
  const P = (t, c, dy = 0) => { const [x, z] = toWorld(t, c); return [x, roofY(c) + dy, z]; };
  const cw = R.west[0], cr = R.ridge[0], ce = R.east[0];
  for (const [c0, c1] of [[cw, cr], [cr, ce]]) {
    const a = P(R.t0, c0), b = P(R.t0, c1), c = P(R.t1, c1), d = P(R.t1, c0);
    const centreBelow = [...toWorld((R.t0 + R.t1) / 2, (cw + ce) / 2)];
    const ctr = [centreBelow[0], -10, centreBelow[1]];
    quadOut(B, 'roof', [a, b, c, d], ctr);
    const s = [a, b, c, d].map((p) => [p[0], p[1] - 0.06, p[2]]);
    quadOut(B, 'trim', s, [ctr[0], 30, ctr[2]], { colour: C.soffit });
  }
  // the fascia: along the eaves and up the verges
  const centre = [...toWorld((R.t0 + R.t1) / 2, (cw + ce) / 2)];
  const mid = [centre[0], 5, centre[1]];
  for (const t of [R.t0, R.t1]) {
    for (const [c0, c1] of [[cw, cr], [cr, ce]]) quadOut(B, 'trim', [P(t, c0, 0.03), P(t, c1, 0.03), P(t, c1, -0.28), P(t, c0, -0.28)], mid, { colour: C.timber });
  }
  for (const c of [cw, ce]) quadOut(B, 'trim', [P(R.t0, c, 0.03), P(R.t1, c, 0.03), P(R.t1, c, -0.28), P(R.t0, c, -0.28)], mid, { colour: C.timber });
  // the ridge's cap
  beam(B, P(R.t0, cr, 0.04), P(R.t1, cr, 0.04), 0.14, 0.06, ROOF.map((v) => v * 0.8));
  // rafters under the eaves, from the wall out to the fascia, every metre
  const wallC = { west: toLocal(...D.hall[0])[1], east: toLocal(...D.hall[1])[1] };
  for (let t = R.t0 + 0.5; t < R.t1 - 0.3; t += 1.0) {
    beam(B, P(t, wallC.west, -0.18), P(t, cw + 0.05, -0.18), 0.05, 0.08, C.timber);
    beam(B, P(t, wallC.east, -0.18), P(t, ce - 0.05, -0.18), 0.05, 0.08, C.timber);
  }
  // the purlins' heads under the verges: the ridge and one purlin on each slope
  const tN = toLocal(...D.hall[2])[0];
  for (const c of [cr, (cw + cr) / 2 + 0.4, (cr + ce) / 2 - 0.4]) {
    for (const [tw, to] of [[0.05, R.t0 + 0.05], [tN - 0.05, R.t1 - 0.05]]) beam(B, P(tw, c, -0.3), P(to, c, -0.3), 0.1, 0.12, C.timber);
  }
}

// A small window or door on a wall (s its middle), its frame, its panes; `hi`: high under the annex's roof
function opening(B, F, o, foot) {
  const half = o.w / 2;
  let y0, y1;
  if (o.door) { y0 = foot; y1 = foot + 2.2; } else if (o.hi) { y0 = D.annex.top - 1.9; y1 = D.annex.top - 1.1; } else { y0 = foot + 1.3; y1 = foot + 2.6; }
  B.box('trim', F, o.s - half - 0.08, o.s + half + 0.08, 0, 0.05, y0 - (o.door ? 0 : 0.08), y1 + 0.08, C.frame);
  if (o.door) {
    B.box('trim', F, o.s - half + 0.06, o.s + half - 0.06, 0.05, 0.07, y0, y1 - 0.06, C.door);
    B.box('trim', F, o.s - half - 0.3, o.s + half + 0.3, 0, 0.9, y0 - 0.4, y0 - 0.02, C.kerb);
  } else {
    B.box('trim', F, o.s - half + 0.07, o.s - 0.03, 0.05, 0.07, y0 + 0.07, y1 - 0.07, C.pane);
    B.box('trim', F, o.s + 0.03, o.s + half - 0.07, 0.05, 0.07, y0 + 0.07, y1 - 0.07, C.pane);
    B.box('trim', F, o.s - half - 0.1, o.s + half + 0.1, 0, 0.14, y0 - 0.13, y0 - 0.05, C.lintel);
  }
}

// The forecourt's gable: the engines' doors (each on its own ground), their concrete frames, the lettering
function buildFront(B) {
  const F = hallWall('south'), Dr = D.doors;
  for (const s of Dr.at) {
    const s0 = s - Dr.w / 2, s1 = s + Dr.w / 2;
    const y0 = Math.min(groundAlong(F, s0, s1) + 0.02, Dr.top - 3.4);
    B.decal(F, s0, s1, 0.05, y0, Dr.top, 'door');
    // the frame: posts and a lintel of grey concrete
    B.box('trim', F, s0 - 0.25, s0, 0, 0.12, D.base, Dr.top + 0.3, C.lintel);
    B.box('trim', F, s1, s1 + 0.25, 0, 0.12, D.base, Dr.top + 0.3, C.lintel);
    B.box('trim', F, s0 - 0.25, s1 + 0.25, 0, 0.12, Dr.top, Dr.top + 0.3, C.lintel);
    // the sill: the apron's edge under the door
    B.box('trim', F, s0, s1, 0, 0.6, D.base, y0, C.kerb);
  }
  const N = D.name, m = F.len / 2;
  B.decal(F, m - N.w / 2, m + N.w / 2, 0.03, N.y0, N.y1, 'name');
  const out = [];
  for (const side of ['east', 'north']) {
    const W = hallWall(side), foot = groundAlong(W);
    for (const o of D.openings[side]) opening(B, W, o, foot + 0.05);
    out.push(W);
  }
  return out;
}

// The annex: its walls up to its roof, the fascia and the wide door on the forecourt side, the openings, the roof with
// its kerb and the domed roof lights
function buildAnnex(B) {
  const A = D.annex, R = outwardRing(A.ring), top = A.top, hall = D.hall;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.05) continue;
    // (not the wall inside the hall)
    if (pointInRingLoose(hall, ...onWall(F, F.len / 2, 0.3))) continue;
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    const g = groundAlong(F);
    B.quad('annex', P(0, D.base), P(F.len, D.base), P(F.len, top), P(0, top), [[0, D.base - g], [F.len, D.base - g], [F.len, top - g], [0, top - g]]);
    // the roof's kerb: a sheet-metal capping
    B.box('trim', F, -0.04, F.len + 0.04, -0.2, 0.06, top - 0.12, top + 0.12, C.kerb);
  }
  flatRoof(B, R, top);
  // the forecourt side: the wide timber door near its east end under a dark fascia
  const S = annexSouth(), Ad = D.annexDoor, s0 = S.len - Ad.s1, s1 = S.len - Ad.s0;
  const y0 = groundAlong(S, s0, s1) + 0.02;
  B.decal(S, s0, s1, 0.05, y0, Ad.top, 'annexDoor');
  B.box('trim', S, s0 - 0.1, s1 + 0.6, 0, 0.35, top - A.fascia, top + 0.1, C.timber, { top: 'roof' });
  B.box('trim', S, s0 - 0.1, s1 + 0.1, 0, 0.06, Ad.top, top - A.fascia, C.door);
  for (const [F, list] of [[annexWest(), D.openings.annexWest], [annexEast(), D.openings.annexEast]]) {
    const foot = groundAlong(F) + 0.05;
    for (const o of list) opening(B, F, o, foot);
  }
  // the domed roof lights: an eight-sided kerb and a low dome over it
  for (const [t, c] of A.domes) {
    const [x, z] = toWorld(t, c), r = A.dome / 2, k = top + 0.25, h = 0.35;
    for (let j = 0; j < 8; j++) {
      const a0 = (j / 8) * Math.PI * 2, a1 = ((j + 1) / 8) * Math.PI * 2;
      const p = (a, rr, y) => [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr];
      quadOut(B, 'trim', [p(a0, r, top), p(a1, r, top), p(a1, r, k), p(a0, r, k)], [x, k - 0.1, z], { colour: C.kerb });
      quadOut(B, 'trim', [p(a0, r, k), p(a1, r, k), p(a1, r * 0.55, k + h * 0.8), p(a0, r * 0.55, k + h * 0.8)], [x, top, z], { colour: C.dome });
      B.tri('trim', p(a0, r * 0.55, k + h * 0.8), [x, k + h, z], p(a1, r * 0.55, k + h * 0.8), undefined, { colour: C.dome });
    }
  }
  // (the timber posts of a door's frame on the annex's east side stand within its wall: no collider)
  return { S };
}

/** The camera spots for a look at it (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  forecourt: [702, -2.6, -1340, 698.6, -1.0, -1366.7],
  kiosk: [740, -1.0, -1376, 702, 0.5, -1372],
  above: [672, 14, -1398, 698, -1.0, -1372]
};

/**
 * Builds the Feuerwehrdepot Dorf into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls
 * stand on the surveyed outlines, js/landmarks.js; the doors' sills and steps stand within a metre of them).
 */
export function buildFeuerwehrDorf(scene) {
  const root = new THREE.Group();
  root.name = 'Feuerwehrdepot Dorf';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Feuerwehrdepot Dorf' }), M = materials();
  buildHall(B);
  buildRoof(B);
  buildFront(B);
  buildAnnex(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}

export { roofRing };
