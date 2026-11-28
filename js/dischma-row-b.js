import * as THREE from 'three/webgpu';
import { abs, attribute, float, fract, hash, mix, smoothstep, step, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, litWindow, nightGlow, rectMask, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  COVERED_NEIGHBOURS, DISCHMA_ROW_B, groundOutlines, onWall, outerWalls, pointInRing, profileAt, roofHeights, upperWalls, wallFrame, wallProfile
} from './dischma-row-b-data.js';

export { DISCHMA_ROW_B };

// The houses along the Dischmastrasse from about z −935 to the valley's mouth rebuilt by hand (js/dischma-row-b-data.js),
// standing in for their swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses'
// windows. Each house stands on its surveyed outlines under its surveyed roofs (their eaves' overhangs as surveyed);
// the looks are the valley's: chalets with plastered storeys (a masonry base on the slope) under timber ones of
// horizontal logs, houses in white render with timber gables, plain flat-roofed blocks in render. Windows drawn by
// the walls' material from their uv (metres along the wall from its middle, metres up the house's floors' grid), with
// shutters where the house has them (their colour a vertex attribute), a lit window here and there at night; deep dark
// eaves with a fascia, the rafters' and purlins' heads under them, the balconies of sawn boards on the gables facing the
// sun, the blocks' balconies along their sunny side, doors, two garage doors, windows in the gables. All the houses
// share six meshes: the plastered walls, the timber walls, the roofs, the trim (one vertex-coloured mesh), the doors and
// boards (one canvas atlas).

const D = DISCHMA_ROW_B;
excludeBuildings(D.houses.flatMap((h) => h.exclude));
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines, which follow the roofs' edges:
// js/landmarks.js)
for (const h of D.houses) SURVEYED_FOOTPRINTS.set(h.id, groundOutlines(h));
for (const id of COVERED_NEIGHBOURS) SURVEYED_FOOTPRINTS.set(id, []);

const { storey: STOREY, win: WIN, bay: BAY } = D;
// v of a wall: metres up its house's floors' grid (the entrance floor's foot at 40 storeys); closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.1, 0.096, 0.092];
const FRAME_C = [0.6, 0.6, 0.57];
// (the shutters reach 0.56 m beside a window: a window only where its shutters fit in the wall)
const WIN_ROOM = WIN.half + 0.25;

function wallMaterial(timber) {
  const fine = fade(8, 28), near = fade(40, 160);
  const glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const { half, v, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN_ROOM });
  const base = attribute('color', 'vec3'), shut = attribute('aShut', 'vec3');
  let wall;
  if (timber) {
    // horizontal logs: a course every 0.19 m, each a shade of its own, a dark joint between them (fading with distance)
    const course = v.div(0.19).floor(), fc = fract(v.div(0.19));
    const joint = smoothstep(0.12, 0.0, fc).max(smoothstep(0.88, 1.0, fc)).mul(fine).mul(0.45);
    wall = base.mul(hash(course.mul(17.3)).mul(0.3).add(0.85)).mul(float(1).sub(joint)).mul(mix(float(0.9), float(1.06), worldNoise(0.3)));
  } else {
    wall = mix(base.mul(0.93), base.mul(1.04), worldNoise(0.4));
  }
  const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
  const mid = WIN.lo + (WIN.hi - WIN.lo) / 3, mid2 = WIN.lo + ((WIN.hi - WIN.lo) * 2) / 3;
  const bars = smoothstep(0.035, 0.02, abs(bu))
    .max(smoothstep(0.03, 0.018, abs(fv.sub(mid))))
    .max(smoothstep(0.03, 0.018, abs(fv.sub(mid2))));
  const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(bars.mul(fine))).mul(open);
  const sill = rect(WIN.half + 0.07, WIN.lo - 0.09, WIN.lo).mul(open).mul(near);
  // the shutters: a leaf either side of a window, slats across them, where the house has shutters
  const has = step(0.002, shut.x.add(shut.y).add(shut.z));
  const leaf = rectMask(abs(bu).sub(WIN.half + 0.3), fv, 0.25, WIN.lo - 0.02, WIN.hi + 0.02).mul(open).mul(has);
  const slats = smoothstep(0.3, 0.0, fract(fv.div(0.075))).mul(0.35).mul(fine);
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
  const drawn = step(0.6, id).mul(mix(float(0.3), float(0.7), step(0.85, id)));
  const span = WIN.hi - WIN.lo - 0.14;
  const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(span)), fv).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.024, 0.028), vec3(0.06, 0.075, 0.09), worldNoise(0.07));
  let c = mix(wall, shut.mul(float(1).sub(slats)), leaf);
  c = mix(c, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, vec3(...FRAME_C), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.88), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (houses of families and flats: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), timber ? 61 : 53, { share: 0.28, late: 0.08, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.8) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1));
  return m;
}

function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the walls' mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.54, 0.52, 0.49], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.3, { bay: BAY, half: WIN.half });
    M.timber = SIMPLE_SKINS.windowed([0.2, 0.11, 0.056], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.85, 0.3, { bay: BAY, half: WIN.half });
    return M;
  }
  M.plaster = wallMaterial(false);
  M.timber = wallMaterial(true);
  return M;
}

// --- The doors, the garage doors and the balconies' boards: one canvas atlas -------------------------------------------
const ATLAS_SIZE = [512, 256];
export const ATLAS = {
  door: [0, 0, 112, 256],
  railing: [128, 0, 256, 128],
  garage: [128, 136, 224, 120]
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // a house door of dark boards in a frame, a small pane in its upper third, a brass handle
  cell('door', (w, h) => {
    g.fillStyle = '#3a1d0f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const k = ((i * 37) % 11) / 11;
      g.fillStyle = `rgb(${70 + k * 16}, ${36 + k * 8}, ${20 + k * 4})`;
      g.fillRect(8 + (i * (w - 16)) / 5 + 1, 8, (w - 16) / 5 - 2, h - 8);
    }
    g.fillStyle = '#24110a'; g.fillRect(w * 0.28 - 4, h * 0.14 - 4, w * 0.44 + 8, h * 0.2 + 8);
    g.fillStyle = '#1a2328'; g.fillRect(w * 0.28, h * 0.14, w * 0.44, h * 0.2);
    g.fillStyle = '#b08a3c'; g.fillRect(w * 0.76, h * 0.52, 10, 6);
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
  // a garage door: dark brown panels with horizontal grooves, a grey frame
  cell('garage', (w, h) => {
    g.fillStyle = '#6b6b66'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b1a10'; g.fillRect(6, 6, w - 12, h - 6);
    for (let i = 1; i < 6; i++) {
      g.fillStyle = '#1a0f09'; g.fillRect(6, 6 + (i * (h - 6)) / 6 - 1, w - 12, 3);
      g.fillStyle = '#3a2416'; g.fillRect(6, 6 + (i * (h - 6)) / 6 + 2, w - 12, 2);
    }
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = {
  frame: FRAME_C, pane: [0.025, 0.03, 0.035], plinth: [0.22, 0.215, 0.205], step: [0.26, 0.255, 0.245], soffitGrey: [0.3, 0.3, 0.29],
  cornice: [0.2, 0.2, 0.195], slab: [0.5, 0.49, 0.47], glassRail: [0.22, 0.25, 0.27], metal: [0.12, 0.12, 0.12]
};
const shade = (rgb, k) => rgb.map((v) => v * k);

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

// The highest ground along a wall, half a metre out of it (from s0 to s1)
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}

// The walls' quads carry their colour (the vertex colour) and the shutters' colour (aShut, 0: none)
const SHUT = new Map();
function wallQuad(B, bucket, a, b, c, d, uvs, half, colour, shut) {
  B.quad(bucket, a, b, c, d, uvs, { half, colour });
  if (!SHUT.has(bucket)) SHUT.set(bucket, []);
  const list = SHUT.get(bucket);
  for (let i = 0; i < 6; i++) list.push(shut[0], shut[1], shut[2]);
}

// A house's measures: its floors' grid (the entrance floor's foot over the highest ground round it), where its timber
// starts, its colours
function houseContext(h) {
  const L = h.look;
  let gMax = -Infinity;
  for (const p of h.parts) for (const [x, z] of p.ring) gMax = Math.max(gMax, groundHeight(x, z));
  const g0 = gMax + 0.15;
  const plaster = D.plaster[L.plaster ?? 0], wood = D.wood[L.wood ?? 0];
  const shut = L.shutters === null || L.shutters === undefined ? [0, 0, 0] : D.shutters[L.shutters];
  const roof = h.parts.flatMap((p) => p.roof);
  return { h, L, g0, plaster, wood, shut, roof, timberY: L.kind === 'chalet' ? g0 + (L.floors ?? 1) * STOREY : Infinity };
}
const vOf = (cx, y) => y - cx.g0 + UP;

// One wall: from y0 up to its profile, in bands: closed under its lowest windows, the windows' band up to its eaves,
// closed over them (the gable); plaster under the house's timber line, timber over it (and a house's gables)
function wallOf(B, cx, F, prof, y0, { upper = false } = {}) {
  const tops = prof.map((p) => p[1]), minTop = Math.min(...tops), maxTop = Math.max(...tops);
  const gable = maxTop - minTop > 1.0;
  // the lowest floor whose windows clear the ground by 0.15 m (or the lower roof the wall stands on)
  const g = upper ? y0 + 0.3 : groundAlong(F);
  let win0 = cx.g0 - 12 * STOREY;
  while (win0 + WIN.lo < g + 0.15) win0 += STOREY;
  // the windows' band ends at the eaves: on a floor's line, or over a floor whose windows fit under them
  const k = Math.floor((minTop - cx.g0) / STOREY), gl = cx.g0 + k * STOREY;
  const openTop = minTop - gl >= WIN.hi + 0.3 ? minTop - 0.02 : gl;
  const hall = cx.L.kind === 'hall' && F.len < 15;
  const windows = F.len >= 2.2 && openTop > win0 + WIN.hi && !hall;
  const timberY = cx.L.kind === 'chalet' ? cx.timberY : cx.L.kind === 'house' && gable ? openTop : Infinity;
  const cuts = [...new Set([y0, win0, openTop, timberY].filter((y) => y > y0 && y < maxTop))].sort((a, b) => a - b);
  const bands = [];
  const ys = [y0, ...cuts.filter((y) => y > y0), Infinity];
  for (let i = 0; i + 1 < ys.length; i++) bands.push([ys[i], ys[i + 1]]);
  const mid = F.len / 2;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  for (let i = 0; i + 1 < prof.length; i++) {
    const [s0, ya] = prof[i], [s1, yb] = prof[i + 1];
    if (s1 - s0 < 1e-4) continue;
    for (const [lo, hi] of bands) {
      const la = Math.min(lo, ya), lb = Math.min(lo, yb), ha = Math.min(hi, ya), hb = Math.min(hi, yb);
      if (Math.max(ha - la, hb - lb) < 0.005) continue;
      const open = windows && lo >= win0 - 1e-6 && hi <= openTop + 1e-6;
      const timber = lo >= timberY - 1e-6;
      const v = (y) => vOf(cx, y) - (open ? 0 : CLOSED);
      wallQuad(B, timber ? 'timber' : 'plaster', P(s0, la), P(s1, lb), P(s1, hb), P(s0, ha),
        [[s0 - mid, v(la)], [s1 - mid, v(lb)], [s1 - mid, v(hb)], [s0 - mid, v(ha)]], open ? mid : 0, timber ? cx.wood : cx.plaster, cx.shut);
    }
  }
  return { minTop, maxTop, gable, win0, openTop, windows };
}

// A plinth of grey render along a wall's foot, a little over the ground (where no other part of the house stands)
function plinth(B, cx, F) {
  const n = Math.max(1, Math.ceil(F.len / 1.0));
  for (let k = 0; k < n; k++) {
    const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
    const [mx, mz] = onWall(F, (a + b) / 2, 0.3);
    if (cx.h.parts.some((p) => pointInRing(p.ring, mx, mz))) continue;
    const ga = groundHeight(...onWall(F, a, 0.3)) + 0.3, gb = groundHeight(...onWall(F, b, 0.3)) + 0.3;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('trim', P(a, cx.h.base), P(b, cx.h.base), P(b, Math.max(gb, cx.h.base + 0.2)), P(a, Math.max(ga, cx.h.base + 0.2)), undefined, { colour: C.plinth });
  }
}

const isFlat = (t) => {
  const n = cross(sub([t[3], t[4], t[5]], [t[0], t[1], t[2]]), sub([t[6], t[7], t[8]], [t[0], t[1], t[2]]));
  return Math.abs(n[1]) / Math.hypot(...n) > 0.985;
};
const insideHouse = (cx, x, z) => cx.h.parts.some((p) => pointInRing(p.ring, x, z));

// The roofs: the surveyed triangles facing up, a soffit under the pitched ones; along their free edges a fascia (a
// cornice on the flat ones), and under the eaves the rafters' heads, under the verges the purlins'
function buildRoofs(B, cx) {
  const fascia = cx.L.kind === 'block' || cx.L.kind === 'hall' ? C.cornice : shade(cx.wood, 0.55);
  const soffit = cx.L.kind === 'block' || cx.L.kind === 'hall' ? C.soffitGrey : shade(cx.wood, 0.45);
  const rafter = shade(cx.wood, 0.75);
  for (const part of cx.h.parts) {
    for (const t of part.roof) {
      let a = [t[0], t[1], t[2]], b = [t[3], t[4], t[5]], c = [t[6], t[7], t[8]];
      if (cross(sub(b, a), sub(c, a))[1] < 0) [b, c] = [c, b];
      B.tri('roof', a, b, c, [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]]);
      const flat = isFlat(t);
      if (!flat) B.tri('trim', ...[a, c, b].map((p) => [p[0], p[1] - 0.07, p[2]]), undefined, { colour: soffit });
      // the free edges: one side of them not covered by this part's roof (or by one more than 0.3 m lower)
      const P = [a, b, c];
      for (let i = 0; i < 3; i++) {
        const p = P[i], q = P[(i + 1) % 3];
        const dx = q[0] - p[0], dz = q[2] - p[2], L = Math.hypot(dx, dz);
        if (L < 0.3) continue;
        let o = [-dz / L, dx / L];
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
        const side = (sgn) => { const ys = roofHeights(part.roof, m[0] + o[0] * 0.08 * sgn, m[2] + o[1] * 0.08 * sgn); return ys.length ? Math.max(...ys) : -Infinity; };
        const hp = side(1), hm = side(-1);
        let out;
        if (hp < m[1] - 0.3 && hm >= m[1] - 0.3) out = 1;
        else if (hm < m[1] - 0.3 && hp >= m[1] - 0.3) out = -1;
        else continue;
        o = [o[0] * out, o[1] * out];
        const centre = [m[0] - o[0], m[1], m[2] - o[1]];
        const off = (r, dy, e = 0.02) => [r[0] + o[0] * e, r[1] + dy, r[2] + o[1] * e];
        if (flat) {
          // (a cornice proud of the wall, and its top)
          quadOut(B, 'trim', [off(p, -0.32, 0.05), off(q, -0.32, 0.05), off(q, 0.12, 0.05), off(p, 0.12, 0.05)], centre, { colour: fascia });
          quadOut(B, 'trim', [off(p, 0.12, 0.05), off(q, 0.12, 0.05), off(q, 0.12, -0.25), off(p, 0.12, -0.25)], [m[0], -50, m[2]], { colour: fascia });
          continue;
        }
        quadOut(B, 'trim', [off(p, 0.03), off(q, 0.03), off(q, -0.24), off(p, -0.24)], centre, { colour: fascia });
        // the heads under it: from the edge in to the wall (where the wall is within 2.6 m)
        const level = Math.abs(q[1] - p[1]) < 0.15;
        const spots = level ? Array.from({ length: Math.max(0, Math.floor((L - 0.4) / 1.0)) + 1 }, (_, k) => 0.2 + k * 1.0).filter((s) => s < L - 0.15)
          : [0.15, 0.5, 0.85].map((f) => f * L);
        for (const s of spots) {
          const e = [p[0] + (dx / L) * s, p[1] + ((q[1] - p[1]) * s) / L, p[2] + (dz / L) * s];
          let reach = null;
          for (let r = 0.1; r < 2.6; r += 0.1) if (insideHouse(cx, e[0] - o[0] * r, e[2] - o[1] * r)) { reach = r + 0.05; break; }
          if (reach === null || reach < 0.3) continue;
          const y = e[1] - (level ? 0.17 : 0.33);
          beam(B, [e[0] - o[0] * 0.03, y, e[2] - o[1] * 0.03], [e[0] - o[0] * reach, y, e[2] - o[1] * reach], level ? 0.05 : 0.1, level ? 0.08 : 0.13, rafter);
        }
      }
    }
  }
}

// A chalet's balcony on a wall from s0 to s1, `depth` out, its floor at `y`: the slab, struts under it, the railing round
// its three free sides (rails and posts in the trim, the sawn boards from the atlas)
function balcony(B, cx, F, { y, depth, s0, s1 }) {
  const rh = D.railing, slab = 0.18, wood = shade(cx.wood, 0.85), rail = shade(cx.wood, 0.7);
  B.box('trim', F, s0, s1, 0, depth, y - slab, y, wood);
  const sides = [
    { G: F, a: s0, b: s1, o: depth },
    { G: wallFrame(onWall(F, s0, 0), onWall(F, s0, depth)), a: 0, b: depth, o: 0 },
    { G: wallFrame(onWall(F, s1, depth), onWall(F, s1, 0)), a: 0, b: depth, o: 0 }
  ];
  for (const { G, a, b, o } of sides) {
    const n = Math.max(1, Math.round((b - a) / 1.6)), w = (b - a) / n;
    B.box('trim', G, a, b, o - 0.07, o + 0.02, y + rh - 0.09, y + rh, rail);
    B.box('trim', G, a, b, o - 0.07, o + 0.02, y, y + 0.08, rail);
    for (let k = 0; k <= n; k++) B.box('trim', G, a + k * w - 0.05, a + k * w + 0.05, o - 0.08, o + 0.02, y, y + rh, rail);
    for (let k = 0; k < n; k++) B.decal(G, a + k * w + 0.05, a + (k + 1) * w - 0.05, o - 0.03, y + 0.08, y + rh - 0.09, 'railing');
  }
  const n = Math.max(1, Math.round((s1 - s0) / 2.2));
  for (let k = 0; k <= n; k++) {
    const s = s0 + 0.15 + ((s1 - s0 - 0.3) * k) / n;
    const p = onWall(F, s, 0.06), q = onWall(F, s, depth * 0.85);
    beam(B, [p[0], y - 1.1, p[1]], [q[0], y - slab - 0.02, q[1]], 0.06, 0.06, wood);
  }
}
// A block's balcony: a concrete slab, a parapet of frosted glass in a dark metal frame
function blockBalcony(B, F, { y, depth, s0, s1 }) {
  B.box('trim', F, s0, s1, 0, depth, y - 0.2, y, C.slab);
  const sides = [
    { G: F, a: s0, b: s1, o: depth },
    { G: wallFrame(onWall(F, s0, 0), onWall(F, s0, depth)), a: 0, b: depth, o: 0 },
    { G: wallFrame(onWall(F, s1, depth), onWall(F, s1, 0)), a: 0, b: depth, o: 0 }
  ];
  for (const { G, a, b, o } of sides) {
    B.box('trim', G, a, b, o - 0.04, o, y + 0.1, y + 1.0, C.glassRail);
    B.box('trim', G, a, b, o - 0.06, o + 0.01, y + 1.0, y + 1.05, C.metal);
  }
}

// A door on a wall (s its middle): the atlas' door in a white frame, a step before it
function door(B, cx, F, s, w = 1.0) {
  const half = w / 2, g = groundAlong(F, s - half - 0.3, s + half + 0.3), y0 = g + 0.12, y1 = y0 + 2.1;
  B.box('trim', F, s - half - 0.1, s + half + 0.1, 0, 0.06, y0, y1 + 0.1, C.frame);
  B.decal(F, s - half, s + half, 0.07, y0, y1, 'door');
  B.box('trim', F, s - half - 0.3, s + half + 0.3, 0, 0.5, cx.h.base, y0, C.step);
}
// A garage door on a wall (s its middle)
function garage(B, F, s, w = 2.5) {
  const y0 = groundAlong(F, s - w / 2, s + w / 2) + 0.03;
  B.decal(F, s - w / 2, s + w / 2, 0.05, y0, y0 + 2.25, 'garage');
}
// A window in a gable: its white frame, the dark pane, and shutters where the house has them
function gableWindow(B, cx, F, s, y0) {
  const y1 = y0 + 1.15;
  B.box('trim', F, s - 0.5, s + 0.5, 0, 0.05, y0 - 0.08, y1 + 0.08, C.frame);
  B.box('trim', F, s - 0.4, s + 0.4, 0.05, 0.07, y0, y1, C.pane);
  if (cx.shut[0] + cx.shut[1] + cx.shut[2] > 0) for (const sg of [-1, 1]) B.box('trim', F, s + sg * 0.55 - 0.22, s + sg * 0.55 + 0.22, 0, 0.04, y0, y1, cx.shut);
}

// A house: its walls, roofs, the doors and balconies
function buildHouse(B, h) {
  const cx = houseContext(h);
  const walls = outerWalls(h).map((w) => ({ ...w, prof: wallProfile(w.part.roof, w.F) }));
  // (a wall inside another part of the house: it still stands, over that part's roof)
  const info = walls.map((w) => ({ ...w, ...wallOf(B, cx, w.F, w.prof, h.base), free: !h.parts.some((p, pi) => pi !== w.pi && pointInRing(p.ring, ...onWall(w.F, w.F.len / 2, 0.3))) }));
  for (const w of info) if (w.free) plinth(B, cx, w.F);
  for (const u of upperWalls(h)) {
    const prof = wallProfile(cx.roof, u.F, (ys) => { const a = ys.filter((y) => y > u.bottom + 0.3); return a.length ? Math.min(...a) : null; });
    wallOf(B, cx, u.F, prof, u.bottom - 0.05, { upper: true });
  }
  buildRoofs(B, cx);
  const free = info.filter((w) => w.free && w.F.len >= 2.5);
  const L = h.look;
  // the garages: on the longest free wall facing their way
  let garageWall = null;
  if (L.garages) {
    garageWall = free.filter((w) => w.F.n[0] * L.garages.facing[0] + w.F.n[1] * L.garages.facing[1] > 0.9).sort((p, q) => q.F.len - p.F.len)[0] ?? null;
    if (garageWall) for (let i = 0; i < L.garages.n; i++) garage(B, garageWall.F, garageWall.F.len / 2 + (i - (L.garages.n - 1) / 2) * 3.1);
  }
  // the balconies: a chalet's or a house's on its gable facing the sun, a block's along its sunny side
  let balconyWall = null;
  if (L.kind === 'block' && L.balconyBands) {
    // (one of its long walls, the sunnier)
    const longest = Math.max(...free.map((w) => w.F.len));
    balconyWall = free.filter((w) => w.F.len >= Math.max(10, longest * 0.6)).sort((p, q) => q.F.n[1] - p.F.n[1])[0] ?? null;
    if (balconyWall) {
      const F = balconyWall.F, g = groundAlong(F);
      for (let y = cx.g0 - 12 * STOREY; y + D.railing + 0.4 <= balconyWall.openTop; y += STOREY) {
        if (y < g + 2.4) continue;
        blockBalcony(B, F, { y, depth: 1.5, s0: 1.0, s1: F.len - 1.0 });
      }
    }
  } else if (L.balconies) {
    const gables = free.filter((w) => w.gable && w.F.len >= 5 && w !== garageWall);
    balconyWall = (gables.length ? gables : free.filter((w) => w.F.len >= 6 && w !== garageWall)).sort((p, q) => q.F.n[1] - p.F.n[1])[0] ?? null;
    if (balconyWall) {
      const F = balconyWall.F, g = groundAlong(F), levels = [];
      for (let y = cx.g0 - 12 * STOREY; y + D.railing + 0.4 <= balconyWall.openTop; y += STOREY) if (y >= g + 2.4) levels.push(y);
      const s0 = Math.min(0.6, F.len * 0.1), s1 = F.len - s0;
      // (the balconies' far corners clear of the other houses)
      const clear = (y) => [s0, s1].every((s) => !insideOther(h, ...onWall(F, s, 1.3)));
      for (const y of levels.slice(-L.balconies)) if (clear(y)) balcony(B, cx, F, { y, depth: 1.25, s0, s1 });
    }
  }
  // the door: on the free wall with the highest ground (not the balconies' or the garages'), between two windows
  const doorWalls = free.filter((w) => w !== garageWall && w !== balconyWall && w.F.len >= 3.5);
  const dw = doorWalls.sort((p, q) => groundAlong(q.F) - groundAlong(p.F))[0];
  if (dw) {
    const F = dw.F, mid = F.len / 2;
    let best = null;
    for (let k = -8; k <= 8; k++) {
      const s = mid + (k + 0.5) * BAY;
      if (s < 0.9 || s > F.len - 0.9) continue;
      if (!best || Math.abs(s - F.len * 0.35) < Math.abs(best - F.len * 0.35)) best = s;
    }
    door(B, cx, F, best ?? mid);
  }
  // windows in the gables, over the eaves' floor
  for (const w of info) {
    if (!w.free || !w.gable || L.kind === 'block' || L.kind === 'hall') continue;
    const y0 = Math.max(w.openTop, w.minTop) + 0.45, y1 = y0 + 1.15;
    if (w.maxTop < y1 + 0.6) continue;
    const peak = w.prof.reduce((p, q) => (q[1] > p[1] ? q : p))[0];
    const spots = profileAt(w.prof, peak - 1.75) > y1 + 0.4 && profileAt(w.prof, peak + 1.75) > y1 + 0.4 ? [peak - 1.0, peak + 1.0] : [peak];
    for (const s of spots) if (s > 0.8 && s < w.F.len - 0.8 && profileAt(w.prof, s - 0.6) > y1 + 0.3 && profileAt(w.prof, s + 0.6) > y1 + 0.3) gableWindow(B, cx, w.F, s, y0);
  }
}
// (inside a house of the row other than h)
const insideOther = (h, x, z) => D.houses.some((o) => o !== h && o.parts.some((p) => pointInRing(p.ring, x, z)));

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // on the street by w126895399, up the valley (the 2013 photograph's way)
  lower: [827.2, -7.2, -913.7, 860, -4.0, -860],
  // by the blocks w126895359 and w126895321, looking back down
  middle: [930, -5.3, -747, 905, -2.0, -790],
  // by w126895327 towards the valley's mouth
  mouth: [1032.3, -4.0, -561.4, 1075, -1.0, -505]
};

/**
 * Builds the row into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand on the
 * surveyed outlines, js/landmarks.js; the balconies hang over the ground, the doors' steps stand within 0.5 m of the
 * walls).
 */
export function buildDischmaRowB(scene) {
  const root = new THREE.Group();
  root.name = 'Dischmastrasse B';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['plaster', 'timber'], name: 'Dischmastrasse B' }), M = materials();
  SHUT.clear();
  for (const h of D.houses) buildHouse(B, h);
  M.decal = decalMaterial(atlasTexture());
  const meshes = B.meshes(M);
  for (const mesh of meshes) {
    const list = SHUT.get(mesh.name.slice('Dischmastrasse B '.length));
    if (list) mesh.geometry.setAttribute('aShut', new THREE.Float32BufferAttribute(list, 3));
  }
  root.add(...meshes);
  scene.add(root);
  return { group: root, colliders: [] };
}
