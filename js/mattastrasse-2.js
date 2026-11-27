import * as THREE from 'three/webgpu';
import { abs, attribute, float, fract, hash, mix, smoothstep, step, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { MATTASTRASSE_2, clipBand, groundOutlines, onWall, pointInRing, roofEdges, roofTriangles, wallFrame, wallMeasures } from './mattastrasse-2-data.js';

export { MATTASTRASSE_2 };

// The houses along the Mattastrasse from the Kurpark past the Landwasser to the Golf Club Davos rebuilt by hand
// (js/mattastrasse-2-data.js), standing in for their swissBUILDINGS3D volumes, which the streamed tiles drew as white
// blocks with the town houses' windows. Each house is its surveyed walls and roofs as they are (the eaves' overhangs,
// the walls on lower roofs, the stepped roofs of the blocks); the looks are the street's in the 2015 views: white or
// cream render, the yellow house before the AVIA, the grey-brown blocks with their glazed balconies, timber gables and
// chalets' timber floors, balconies of sawn boards, the hotels' timber balconies on every floor. Windows drawn by the
// walls' material from their uv (metres along the wall from its middle, metres up the house's floors' grid), the lowest
// over the highest ground along each wall with a grey plinth under them, a lit window here and there at night; dark
// fascias and soffits under the pitched roofs, cornices round the flat ones, doors and garage doors from one canvas
// atlas. All the houses share five meshes: the plastered walls, the timber walls, the roofs, the trim (one
// vertex-coloured mesh) and the decals.

const D = MATTASTRASSE_2;
excludeBuildings(D.houses.flatMap((h) => h.exclude));
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines, js/landmarks.js)
for (const h of D.houses) SURVEYED_FOOTPRINTS.set(h.id, groundOutlines(h));
// (the Golf Club's name lettered on its board here: js/shops-data.js' sign stood on the OSM outline, 5.6 m off the walls)
for (const h of D.houses) if (h.look.sign) SHOP_EXCLUSIONS.add(h.look.sign.shop);

const { storey: STOREY, win: WIN, bay: BAY } = D;
// v of a wall: metres up its house's floors' grid (the entrance floor's foot at 40 storeys); closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.1, 0.096, 0.092];

function wallMaterial(timber) {
  const fine = fade(8, 28), near = fade(40, 160);
  const glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const { half, v, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half + 0.1 });
  const base = attribute('color', 'vec3');
  let wall;
  if (timber) {
    // horizontal boards: a course every 0.19 m, each a shade of its own, a dark joint between them (fading with distance)
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
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
  // (a curtain drawn in 40 % of the windows, a third or two thirds down)
  const drawn = step(0.6, id).mul(mix(float(0.3), float(0.7), step(0.85, id)));
  const span = WIN.hi - WIN.lo - 0.14;
  const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(span)), fv).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.024, 0.028), vec3(0.06, 0.075, 0.09), worldNoise(0.07));
  // (white frames in render, dark brown ones in timber)
  const frameC = timber ? vec3(0.12, 0.065, 0.035) : vec3(0.6, 0.6, 0.57);
  let c = mix(wall, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, frameC, win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.88), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (flats and hotel rooms: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), timber ? 67 : 59, { share: 0.28, late: 0.08, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.8) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1));
  return m;
}

function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS; each house's colour
    // from the vertex colours)
    M.plaster = SIMPLE_SKINS.windowed([1, 1, 1], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.3);
    M.timber = SIMPLE_SKINS.windowed([1, 1, 1], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.85, 0.3);
    M.plaster.vertexColors = M.timber.vertexColors = true;
    return M;
  }
  M.plaster = wallMaterial(false);
  M.timber = wallMaterial(true);
  return M;
}

// --- The doors, the garage doors and the balconies' boards: one canvas atlas -------------------------------------------
const ATLAS_SIZE = [512, 320];
export const ATLAS = {
  door: [0, 0, 112, 256],
  railing: [128, 0, 256, 128],
  garage: [128, 136, 224, 120],
  golf: [0, 264, 512, 56]
};
// (a board's size in metres: [width, height])
const SIGNS = { golf: { size: [4.6, 0.5], text: 'GOLF CLUB DAVOS' } };

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
    }
    g.globalCompositeOperation = 'source-over';
  });
  // a garage door: grey panels with horizontal grooves in a grey frame
  cell('garage', (w, h) => {
    g.fillStyle = '#6b6b66'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a8a86'; g.fillRect(6, 6, w - 12, h - 6);
    for (let i = 1; i < 6; i++) {
      g.fillStyle = '#5a5a56'; g.fillRect(6, 6 + (i * (h - 6)) / 6 - 1, w - 12, 3);
      g.fillStyle = '#a2a29e'; g.fillRect(6, 6 + (i * (h - 6)) / 6 + 2, w - 12, 2);
    }
  });
  // the clubhouse's board: cream serif capitals on dark brown
  cell('golf', (w, h) => {
    g.fillStyle = '#2b2118'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#f0d9a0'; g.font = `700 ${Math.round(h * 0.62)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(SIGNS.golf.text, w / 2, h * 0.54);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = {
  frame: [0.6, 0.6, 0.57], pane: [0.025, 0.03, 0.035], plinth: [0.22, 0.215, 0.205], step: [0.26, 0.255, 0.245],
  cornice: [0.2, 0.2, 0.195], slab: [0.5, 0.49, 0.47], glassRail: [0.22, 0.25, 0.27], metal: [0.12, 0.12, 0.12]
};
const shade = (rgb, k) => rgb.map((v) => v * k);

// A triangle into a bucket with uv, aHalf and its colour (the Builder's tri carries no aHalf)
function wallTri(B, bucket, P, uvs, half, colour) {
  const b = B.bucket(bucket);
  const [a, c, d] = P;
  const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  for (let i = 0; i < 3; i++) {
    b.pos.push(P[i][0], P[i][1], P[i][2]); b.nrm.push(nx, ny, nz); b.uv.push(uvs[i][0], uvs[i][1]); b.half.push(half);
    b.col.push(colour[0], colour[1], colour[2]);
  }
}

// The highest ground along a wall, half a metre out of it (from s0 to s1)
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}

// A house's measures: its floors' grid (the entrance floor's foot over the highest ground round it), its colours
function houseContext(h) {
  let gMax = -Infinity;
  for (const r of h.rings) for (const [x, z] of r) gMax = Math.max(gMax, groundHeight(x, z));
  if (!Number.isFinite(gMax)) gMax = h.base;
  const L = h.look, g0 = gMax + 0.15;
  return { h, L, g0, plaster: D.plaster[L.plaster ?? 0], wood: D.wood[L.wood ?? 0], timberY: L.kind === 'chalet' ? g0 + (L.floors ?? 1) * STOREY : Infinity };
}
const vOf = (cx, y) => y - cx.g0 + UP;
const insideHouse = (h, x, z) => h.rings.some((r) => pointInRing(r, x, z));
const insideRow = (x, z) => D.houses.some((h) => insideHouse(h, x, z));

// One wall: its surveyed triangles cut into bands: closed under its lowest windows, the windows' band up to its eaves,
// closed over them (the gable); render under the house's timber line, timber over it (a chalet's upper floors, a
// house's timber gable)
function wallOf(B, cx, w) {
  const m = wallMeasures(w), F = m.F;
  const gable = m.maxTop - m.minTop > 1.0;
  // (a wall standing on a lower roof: its windows from that roof up)
  const g = groundAlong(F), upper = m.foot > g + 1.0;
  const floor = upper ? m.foot + 0.3 : g + 0.15;
  let win0 = cx.g0 - 12 * STOREY;
  while (win0 + WIN.lo < floor) win0 += STOREY;
  // the windows' band ends at the eaves: on a floor's line, or over a floor whose windows fit under them
  const k = Math.floor((m.minTop - cx.g0) / STOREY), gl = cx.g0 + k * STOREY;
  const openTop = m.minTop - gl >= WIN.hi + 0.3 ? m.minTop - 0.02 : gl;
  const hall = cx.L.kind === 'hall' && F.len < 8;
  const windows = F.len >= 2.2 && openTop > win0 + WIN.hi && !hall;
  const timberY = cx.L.kind === 'chalet' ? cx.timberY : cx.L.gable === 'timber' && gable ? openTop : Infinity;
  const cuts = [...new Set([win0, openTop, timberY].filter((y) => y > m.foot && y < m.maxTop))].sort((a, b) => a - b);
  const ys = [-Infinity, ...cuts, Infinity];
  const mid = F.len / 2;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  for (const T of m.tris) {
    for (let i = 0; i + 1 < ys.length; i++) {
      const lo = ys[i], hi = ys[i + 1];
      const poly = clipBand(T, lo, hi);
      if (poly.length < 3) continue;
      const open = windows && lo >= win0 - 1e-6 && hi <= openTop + 1e-6;
      const timber = lo >= timberY - 1e-6;
      const v = (y) => vOf(cx, y) - (open ? 0 : CLOSED);
      for (let j = 1; j + 1 < poly.length; j++) {
        const pts = [poly[0], poly[j], poly[j + 1]];
        wallTri(B, timber ? 'timber' : 'plaster', pts.map(([s, y]) => P(s, y)), pts.map(([s, y]) => [s - mid, v(y)]), open ? mid : 0, timber ? cx.wood : cx.plaster);
      }
    }
  }
  return { ...m, w, gable, win0, openTop, windows, upper, ground: g };
}

// A plinth of grey render along a wall's foot, a little over the ground (where no other part of the house stands)
function plinth(B, cx, info) {
  const F = info.F, n = Math.max(1, Math.ceil(F.len / 3.0));
  for (let k = 0; k < n; k++) {
    const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
    const [mx, mz] = onWall(F, (a + b) / 2, 0.3);
    if (insideHouse(cx.h, mx, mz)) continue;
    const ga = groundHeight(...onWall(F, a, 0.3)) + 0.3, gb = groundHeight(...onWall(F, b, 0.3)) + 0.3;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    const y0 = info.foot;
    B.quad('trim', P(a, y0), P(b, y0), P(b, Math.max(gb, y0 + 0.2)), P(a, Math.max(ga, y0 + 0.2)), undefined, { colour: C.plinth });
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// The roofs: the surveyed triangles facing up, a soffit under the pitched ones; along their free edges a fascia (a
// cornice on the flat ones), unless a wall of the house rises from the edge
function buildRoofs(B, cx, walls) {
  const plain = cx.L.kind === 'block' || cx.L.kind === 'hall';
  const fascia = plain ? C.cornice : shade(cx.wood, 0.55);
  const soffit = plain ? shade(C.cornice, 1.4) : shade(cx.wood, 0.45);
  for (const [a0, b0, c0] of roofTriangles(cx.h)) {
    let a = a0, b = b0, c = c0;
    if (cross(sub(b, a), sub(c, a))[1] < 0) [b, c] = [c, b];
    B.tri('roof', a, b, c, [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]]);
    const n = cross(sub(b, a), sub(c, a));
    if (n[1] / Math.hypot(...n) < 0.985) B.tri('trim', ...[a, c, b].map((p) => [p[0], p[1] - 0.07, p[2]]), undefined, { colour: soffit });
  }
  for (const [p, q, m] of roofEdges(cx.h)) {
    const dx = q[0] - p[0], dz = q[2] - p[2], L = Math.hypot(dx, dz);
    if (L < 0.3) continue;
    // (out: away from the triangle's middle)
    let o = [-dz / L, dx / L];
    const e = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    if ((m[0] - e[0]) * o[0] + (m[2] - e[2]) * o[1] > 0) o = [-o[0], -o[1]];
    // (a wall rising from this edge: no fascia)
    const rises = walls.some((w) => {
      const along = (e[0] - w.F.a[0]) * w.F.u[0] + (e[2] - w.F.a[1]) * w.F.u[1], off = (e[0] - w.F.a[0]) * w.F.n[0] + (e[2] - w.F.a[1]) * w.F.n[1];
      return Math.abs(off) < 0.2 && along > -0.1 && along < w.F.len + 0.1 && w.maxTop > e[1] + 0.4 && w.foot < e[1] + 0.3;
    });
    if (rises) continue;
    const flat = Math.abs(q[1] - p[1]) < 0.05 && Math.abs(m[1] - e[1]) < 0.05;
    const off = (r, dy, s = 0.02) => [r[0] + o[0] * s, r[1] + dy, r[2] + o[1] * s];
    const quadOut = (pts) => B.quad('trim', ...pts, undefined, { colour: fascia });
    // (wound so that the quad faces along o)
    const face = (a, b, c, d) => {
      const nn = cross(sub(b, a), sub(d, a));
      quadOut(nn[0] * o[0] + nn[2] * o[1] >= 0 ? [a, b, c, d] : [a, d, c, b]);
    };
    if (flat) {
      face(off(p, -0.32, 0.05), off(q, -0.32, 0.05), off(q, 0.12, 0.05), off(p, 0.12, 0.05));
      const t = [off(p, 0.12, 0.05), off(q, 0.12, 0.05), off(q, 0.12, -0.25), off(p, 0.12, -0.25)];
      const nn = cross(sub(t[1], t[0]), sub(t[3], t[0]));
      quadOut(nn[1] >= 0 ? t : [t[0], t[3], t[2], t[1]]);
    } else {
      face(off(p, 0.03), off(q, 0.03), off(q, -0.24), off(p, -0.24));
    }
  }
}

// A balcony on a wall from s0 to s1, `depth` out, its floor at `y`: a slab of boards and the railing round its three
// free sides (sawn boards from the atlas between rails, or a glass parapet in a metal frame)
function balcony(B, cx, F, { y, depth, s0, s1, style }) {
  const rh = D.railing;
  const sides = [
    { G: F, a: s0, b: s1, o: depth },
    { G: wallFrame(onWall(F, s0, 0), onWall(F, s0, depth)), a: 0, b: depth, o: 0 },
    { G: wallFrame(onWall(F, s1, depth), onWall(F, s1, 0)), a: 0, b: depth, o: 0 }
  ];
  if (style === 'glass') {
    B.box('trim', F, s0, s1, 0, depth, y - 0.2, y, C.slab);
    for (const { G, a, b, o } of sides) {
      B.box('trim', G, a, b, o - 0.04, o, y + 0.1, y + 1.0, C.glassRail);
      B.box('trim', G, a, b, o - 0.06, o + 0.01, y + 1.0, y + 1.05, C.metal);
    }
    return;
  }
  const wood = shade(cx.wood, 0.85), rail = shade(cx.wood, 0.7);
  B.box('trim', F, s0, s1, 0, depth, y - 0.18, y, wood);
  for (const { G, a, b, o } of sides) {
    const n = Math.max(1, Math.round((b - a) / 2.4)), w = (b - a) / n;
    B.box('trim', G, a, b, o - 0.07, o + 0.02, y + rh - 0.09, y + rh, rail);
    for (let k = 0; k <= n; k++) B.box('trim', G, a + k * w - 0.05, a + k * w + 0.05, o - 0.08, o + 0.02, y, y + rh, rail);
    for (let k = 0; k < n; k++) B.decal(G, a + k * w + 0.05, a + (k + 1) * w - 0.05, o - 0.03, y + 0.02, y + rh - 0.09, 'railing');
  }
}

// A door on a wall (s its middle): the atlas' door in a white frame, a step before it
function door(B, F, s, foot, w = 1.0) {
  const half = w / 2, g = groundAlong(F, s - half - 0.3, s + half + 0.3), y0 = g + 0.12, y1 = y0 + 2.1;
  B.box('trim', F, s - half - 0.1, s + half + 0.1, 0, 0.06, y0, y1 + 0.1, C.frame);
  B.decal(F, s - half, s + half, 0.07, y0, y1, 'door');
  B.box('trim', F, s - half - 0.3, s + half + 0.3, 0, 0.45, Math.min(foot, g - 0.3), y0, C.step);
}
// A garage door on a wall (s its middle)
function garage(B, F, s, w = 2.5) {
  const y0 = groundAlong(F, s - w / 2, s + w / 2) + 0.03;
  B.decal(F, s - w / 2, s + w / 2, 0.05, y0, y0 + 2.25, 'garage');
}
// A window in a gable: its frame and the dark pane
function gableWindow(B, F, s, y0, frame) {
  const y1 = y0 + 1.15;
  B.box('trim', F, s - 0.5, s + 0.5, 0, 0.05, y0 - 0.08, y1 + 0.08, frame);
  B.box('trim', F, s - 0.4, s + 0.4, 0.05, 0.07, y0, y1, C.pane);
}
const facing = (F, dir) => F.n[0] * dir[0] + F.n[1] * dir[1];

// A house: its walls, roofs, the doors, garages and balconies
function buildHouse(B, h) {
  const cx = houseContext(h), L = h.look;
  const info = h.walls.map((w) => wallOf(B, cx, w));
  // (walls at the ground, standing free: a step out of their middle lies outside the house)
  const free = info.filter((i) => !i.upper && i.len >= 2.5 && !insideRow(...onWall(i.F, i.len / 2, 0.3)) && i.foot < i.ground);
  for (const i of info) if (!i.upper) plinth(B, cx, i);
  buildRoofs(B, cx, info);
  const used = new Set();
  // the garages: on the longest free wall facing their way
  if (L.garages) {
    const gw = free.filter((i) => facing(i.F, L.garages.facing) > 0.5).sort((p, q) => q.len - p.len)[0];
    if (gw) {
      used.add(gw);
      for (let k = 0; k < L.garages.n; k++) garage(B, gw.F, gw.len / 2 + (k - (L.garages.n - 1) / 2) * 3.1);
    }
  }
  // the balconies: on the longest free wall facing their way, on the top floors under its eaves
  if (L.balconies) {
    const bw = free.filter((i) => !used.has(i) && i.len >= 4 && facing(i.F, L.balconies.facing) > 0.5).sort((p, q) => q.len - p.len)[0];
    if (bw) {
      used.add(bw);
      const F = bw.F, levels = [];
      for (let y = cx.g0 - 12 * STOREY; y + D.railing + 0.4 <= bw.openTop; y += STOREY) if (y >= bw.ground + 2.4) levels.push(y);
      const s0 = Math.min(0.6, F.len * 0.1), s1 = F.len - s0, depth = L.balconies.style === 'glass' ? 1.5 : 1.25;
      // (the balconies' far corners clear of the other houses and of the house's own other parts)
      const clear = [s0, s1].every((s) => !insideRow(...onWall(F, s, depth + 0.1)));
      if (clear) for (const y of levels.slice(-L.balconies.n)) balcony(B, cx, F, { y, depth, s0, s1, style: L.balconies.style });
    }
  }
  // a name board: on the longest free wall facing its way, over the ground floor
  if (L.sign) {
    const sw = free.filter((i) => !used.has(i) && facing(i.F, L.sign.facing) > 0.5).sort((p, q) => q.len - p.len)[0];
    if (sw) {
      const [bw, bh] = SIGNS[L.sign.key].size, w = Math.min(bw, sw.len - 0.6), hh = (bh * w) / bw, s = sw.len / 2;
      const y0 = Math.min(sw.ground + 2.6, sw.minTop - hh - 0.3);
      B.box('trim', sw.F, s - w / 2 - 0.05, s + w / 2 + 0.05, 0, 0.06, y0 - 0.05, y0 + hh + 0.05, [0.12, 0.09, 0.06]);
      B.decal(sw.F, s - w / 2, s + w / 2, 0.07, y0, y0 + hh, L.sign.key);
    }
  }
  // the door: on the free wall facing its way (not the balconies' or the garages'), at a third of it
  const dw = free.filter((i) => !used.has(i) && i.len >= 3.5).sort((p, q) => facing(q.F, L.door) - facing(p.F, L.door))[0];
  if (dw) {
    door(B, dw.F, Math.max(0.9, dw.len * 0.35), dw.foot);
  }
  // windows in the gables, over the eaves' floor (not on blocks and halls)
  if (L.kind !== 'block' && L.kind !== 'hall') {
    for (const i of free) {
      if (!i.gable) continue;
      const y0 = Math.max(i.openTop, i.minTop) + 0.45, y1 = y0 + 1.15;
      if (i.maxTop < y1 + 0.6) continue;
      // (under the gable's peak)
      let peak = 0, top = -Infinity;
      for (let s = 0.5; s < i.len - 0.5; s += 0.25) { const y = topAt(i, s); if (y > top) { top = y; peak = s; } }
      const spots = topAt(i, peak - 1.75) > y1 + 0.4 && topAt(i, peak + 1.75) > y1 + 0.4 ? [peak - 1.0, peak + 1.0] : [peak];
      const frame = cx.timberY < y0 || L.gable === 'timber' ? shade(cx.wood, 0.6) : C.frame;
      for (const s of spots) if (s > 0.8 && s < i.len - 0.8 && topAt(i, s - 0.6) > y1 + 0.3 && topAt(i, s + 0.6) > y1 + 0.3) gableWindow(B, i.F, s, y0, frame);
    }
  }
}
// The top of a wall at s (its triangles')
function topAt(info, s) {
  let hi = -Infinity;
  for (const T of info.tris) for (let i = 0; i < 3; i++) {
    const p = T[i], q = T[(i + 1) % 3], a = Math.min(p[0], q[0]), b = Math.max(p[0], q[0]);
    if (s < a || s > b || b - a < 1e-6) continue;
    hi = Math.max(hi, p[1] + ((s - p[0]) * (q[1] - p[1])) / (q[0] - p[0]));
  }
  return hi;
}

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // on the Mattastrasse by the Kurpark, north-east past the white houses and the blocks
  west: [-40, -18.4, 128, 60, -12, 50],
  // west of the yellow house, towards the AVIA and the grey-brown blocks
  avia: [192, -14.4, -66, 290, -8, -125],
  // before the Waldhuus' hotel houses
  waldhuus: [352, -11.9, -178, 440, -2, -215]
};

/**
 * Builds the row into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand on the
 * surveyed outlines, js/landmarks.js; the balconies hang over the ground, the doors' steps stand within 0.45 m of the
 * walls).
 */
export function buildMattastrasse2(scene) {
  const root = new THREE.Group();
  root.name = 'Mattastrasse 2';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['plaster', 'timber'], name: 'Mattastrasse 2' }), M = materials();
  for (const h of D.houses) buildHouse(B, h);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
