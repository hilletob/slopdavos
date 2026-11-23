import * as THREE from 'three/webgpu';
import { excludeBuildings } from './swissbuildings3d.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, decalMaterial } from './spital.js';
import { onWall, wallFrame } from './spital-data.js';
import { MARIENKIRCHE, decals, halfWidths, rectWalls, roofHeight, toWorld, towerRect } from './marienkirche-data.js';

export { MARIENKIRCHE };

// The Marienkirche rebuilt by hand (js/marienkirche-data.js), standing in for its five swissBUILDINGS3D volumes, which
// the streamed tiles drew white with the town houses' windows up the tower: the tower in white plaster on a plinth of
// rubble, quoins of grey stone up its corners, three courses, round-arched windows, an oval sound opening on each side
// under the timber belfry, the wide roof with its kink, the slim spire, the gilt ball and the cross; behind it the nave
// under its ridge with a hip over the choir, the transept's gables with three tall windows each, the choir, the
// flat-roofed sacristy. Three meshes: the masonry and the timber (one vertex-coloured material), the roofs (white in
// winter where they face up), the decals (one canvas atlas: windows, quoins, rubble, the belfry's bays). No shader of
// its own: the mobile profile draws the same.

excludeBuildings(MARIENKIRCHE.exclude);

// --- The windows, the quoins, the rubble: one canvas atlas ----------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  rubble: [0, 0, 256, 256],
  quoinA: [264, 0, 64, 256],
  quoinB: [336, 0, 64, 256],
  arch: [408, 0, 96, 300],
  towerArch: [512, 0, 112, 200],
  oval: [632, 0, 168, 192],
  triple: [808, 0, 208, 136],
  belfry: [0, 264, 400, 200],
  slit: [512, 208, 40, 80],
  oculus: [560, 208, 96, 96]
};
// (a small generator with a seed: the same stones on every load)
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function atlasTexture() {
  const c = document.createElement('canvas');
  [c.width, c.height] = ATLAS_SIZE;
  const g = c.getContext('2d');
  const cell = (key, draw) => { const [x, y, w, h] = ATLAS[key]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h); g.restore(); };
  const GLASS = '#14171c', SURROUND = '#f4f1e8', BAR = '#b4b0a4', STONE = ['#6b6a66', '#5d5c59', '#77756f', '#646058', '#55585a'], ASHLAR = ['#8f8d87', '#817f7a', '#9b9891'];
  // a round-arched shape: a rectangle under a half circle
  const arched = (x, y, w, h) => { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); };
  // a round-arched window: the surround, the glass, a post and rails, the sill
  const archWindow = (w, h, band, rails) => {
    g.fillStyle = SURROUND; arched(1, 1, w - 2, h - 8); g.fill();
    g.fillStyle = GLASS; arched(band, band, w - band * 2, h - 8 - band * 2 + 2); g.fill();
    g.fillStyle = BAR; g.fillRect(w / 2 - 1.5, band, 3, h - 8 - band * 2);
    for (let i = 1; i <= rails; i++) g.fillRect(band, band + ((h - band * 2) * i) / (rails + 1), w - band * 2, 2.5);
    g.fillStyle = '#d9d5c8'; g.fillRect(0, h - 9, w, 9);
  };
  // The plinth: rubble in mortar, the stones in rough courses
  cell('rubble', (w, h) => {
    const r = rng(7);
    g.fillStyle = '#4a4946'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h;) {
      const rowH = 30 + r() * 26;
      for (let x = -r() * 50; x < w;) {
        const sw = 34 + r() * 62, drop = r() * 10 - 5; // (the courses wander: no two stones' beds in a line)
        g.fillStyle = STONE[Math.floor(r() * STONE.length)];
        g.beginPath();
        g.moveTo(x + 2 + r() * 7, y + 2 + drop + r() * 5); g.lineTo(x + sw * 0.5, y + 1 + drop + r() * 5); g.lineTo(x + sw - 2 - r() * 7, y + 2 + drop + r() * 6);
        g.lineTo(x + sw - 1 - r() * 4, y + rowH * 0.5 + drop); g.lineTo(x + sw - 2 - r() * 7, y + rowH - 2 + drop - r() * 6);
        g.lineTo(x + sw * 0.45, y + rowH - 1 + drop - r() * 5); g.lineTo(x + 2 + r() * 7, y + rowH - 2 + drop - r() * 5); g.lineTo(x + 1 + r() * 4, y + rowH * 0.5 + drop);
        g.closePath(); g.fill();
        x += sw;
      }
      y += rowH;
    }
  });
  // The quoins: four blocks to a cell, long and short by turns from the corner (the cell's left edge); B starts short
  for (const [key, first] of [['quoinA', 0], ['quoinB', 1]]) {
    cell(key, (w, h) => {
      const r = rng(key === 'quoinA' ? 3 : 11), bh = h / 4;
      for (let i = 0; i < 4; i++) {
        const bw = (i + first) % 2 ? w * 0.6 : w - 2;
        g.fillStyle = '#5a5855'; g.fillRect(0, i * bh, bw, bh);
        g.fillStyle = ASHLAR[Math.floor(r() * 3)]; g.fillRect(0, i * bh + 2, bw - 2, bh - 4);
        g.fillStyle = 'rgba(255, 255, 255, 0.1)'; g.fillRect(0, i * bh + 2, bw - 2, 5);
        g.fillStyle = 'rgba(0, 0, 0, 0.14)'; g.fillRect(0, (i + 1) * bh - 8, bw - 2, 6);
      }
    });
  }
  cell('arch', (w, h) => archWindow(w, h, 11, 4));
  cell('towerArch', (w, h) => archWindow(w, h, 19, 2));
  // The tower's oval sound opening: a dark oval in a pale rim, its louvres
  cell('oval', (w, h) => {
    const oval = (rx, ry) => { g.beginPath(); g.ellipse(w / 2, h / 2, rx, ry, 0, 0, Math.PI * 2); };
    g.fillStyle = SURROUND; oval(w / 2 - 1, h / 2 - 1); g.fill();
    g.fillStyle = '#17120e'; oval(w / 2 - 12, h / 2 - 12); g.fill();
    g.save(); oval(w / 2 - 12, h / 2 - 12); g.clip();
    g.fillStyle = '#2c2119'; for (let y = 14; y < h; y += 11) g.fillRect(0, y, w, 4);
    g.fillRect(w / 2 - 2, 0, 4, h);
    g.restore();
  });
  // Three small windows in a row, a white frame round each
  cell('triple', (w, h) => {
    const ww = w / 3;
    for (let i = 0; i < 3; i++) {
      g.fillStyle = SURROUND; g.fillRect(i * ww + 3, 0, ww - 6, h);
      g.fillStyle = GLASS; g.fillRect(i * ww + 12, 9, ww - 24, h - 20);
      g.fillStyle = BAR; g.fillRect(i * ww + ww / 2 - 1.5, 9, 3, h - 20); g.fillRect(i * ww + 12, h * 0.4, ww - 24, 2.5);
    }
  });
  // A side of the belfry: four bays between timber posts, louvres over a boarded parapet, braces under the eaves
  cell('belfry', (w, h) => {
    g.fillStyle = '#0b0907'; g.fillRect(0, 0, w, h * 0.62);
    g.fillStyle = '#2b1e15'; for (let y = 8; y < h * 0.62; y += 10) g.fillRect(0, y, w, 4);
    g.fillStyle = '#33241a'; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = '#1d140e'; for (let x = 0; x < w; x += 14) g.fillRect(x, h * 0.62, 2, h * 0.38);
    g.fillStyle = '#4a3423';
    for (let i = 0; i <= 4; i++) g.fillRect(Math.min(w - 14, (i * (w - 14)) / 4), 0, 14, h);
    g.fillRect(0, h * 0.6, w, 9); g.fillRect(0, 0, w, 10); g.fillRect(0, h - 8, w, 8);
    g.strokeStyle = '#4a3423'; g.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      const x0 = (i * (w - 14)) / 4 + 14, x1 = ((i + 1) * (w - 14)) / 4;
      g.beginPath(); g.moveTo(x0, 40); g.lineTo(x0 + 26, 10); g.moveTo(x1, 40); g.lineTo(x1 - 26, 10); g.stroke();
    }
  });
  cell('slit', (w, h) => { g.fillStyle = SURROUND; arched(2, 2, w - 4, h - 4); g.fill(); g.fillStyle = GLASS; arched(9, 9, w - 18, h - 16); g.fill(); });
  cell('oculus', (w, h) => {
    g.fillStyle = SURROUND; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); g.fill();
    g.fillStyle = GLASS; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = BAR; g.fillRect(w / 2 - 1.5, 12, 3, h - 24); g.fillRect(12, h / 2 - 1.5, w - 24, 3);
  });
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// (linear colours)
const C = {
  plaster: [0.43, 0.415, 0.375], stone: [0.14, 0.14, 0.135], course: [0.16, 0.135, 0.12], wood: [0.05, 0.032, 0.021],
  copper: [0.045, 0.07, 0.06], gilt: [0.75, 0.52, 0.12], iron: [0.03, 0.03, 0.032]
};
const ROOF = [0.075, 0.055, 0.045];
const QUOIN = { w: 0.9, h: 2.7 }; // a quoin strip's width, the height of a cell of four blocks

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
/** A point of the church's frame at height y: world [x, y, z] */
const W = (a, b, y) => { const [x, z] = toWorld(a, b); return [x, y, z]; };

/**
 * Builds the church into `scene`. Returns { group, colliders } (the sacristy's walls at world heights, baseY set; the
 * other walls are OpenStreetMap's footprint's, js/buildings.js).
 */
export function buildMarienkirche(scene) {
  const K = MARIENKIRCHE, T = K.tower, HW = halfWidths();
  const root = new THREE.Group();
  root.name = 'Marienkirche';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'none', name: 'Marienkirche' });

  // a flat polygon (three or four points) facing `towards`, whatever way round it was given
  const face = (bucket, pts, towards, colour) => {
    const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    const p = dot(n, towards) >= 0 ? pts : [...pts].reverse();
    const opt = colour ? { colour } : {};
    // uv in metres: along the first edge, and up the slope
    const e = sub(p[1], p[0]), el = Math.hypot(...e) || 1, u = e.map((v) => v / el);
    const uvs = p.map((q) => { const d = sub(q, p[0]), s = dot(d, u); return [s, Math.hypot(...sub(d, u.map((v) => v * s)))]; });
    if (p.length === 3) B.tri(bucket, p[0], p[1], p[2], uvs, opt);
    else B.quad(bucket, p[0], p[1], p[2], p[3], uvs, opt);
  };
  const UP = [0, 1, 0], DOWN = [0, -1, 0];
  // a roof's plane as a slab: the covering on top, timber underneath and round its edge
  const slab = (pts, thick = 0.22) => {
    const low = pts.map((p) => [p[0], p[1] - thick, p[2]]);
    const mid = pts.reduce((m, p) => m.map((v, i) => v + p[i] / pts.length), [0, 0, 0]);
    face('roof', pts, UP);
    face('trim', low, DOWN, C.wood);
    pts.forEach((p, i) => {
      const j = (i + 1) % pts.length, m = [(p[0] + pts[j][0]) / 2, 0, (p[2] + pts[j][2]) / 2];
      face('trim', [p, pts[j], low[j], low[i]], [m[0] - mid[0], 0, m[2] - mid[2]], C.wood);
    });
  };
  // a wall's face from s0 to s1 along it, y0 to y1
  const wall = (F, s0, s1, y0, y1, colour = C.plaster) => {
    const P = (s, y) => { const [x, z] = onWall(F, s, 0); return [x, y, z]; };
    B.quad('trim', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), undefined, { colour });
  };
  // the plinth's rubble along a wall, up to `top`, and the course over it
  const plinth = (F, top = K.plinth, course = true) => {
    const n = Math.max(1, Math.round(F.len / 4.6));
    for (let i = 0; i < n; i++) B.decal(F, (F.len * i) / n, (F.len * (i + 1)) / n, 0.03, top - 5.6, top, 'rubble', { mirror: i % 2 === 1 });
    if (course) B.box('trim', F, -0.12, F.len + 0.12, 0, 0.12, top - 0.02, top + 0.16, C.stone);
  };
  // the quoins up a wall's two ends, from y0 to y1
  const quoins = (F, y0, y1, ends = [true, true]) => {
    const n = Math.max(1, Math.round((y1 - y0) / QUOIN.h));
    for (let i = 0; i < n; i++) {
      const a = y0 + ((y1 - y0) * i) / n, b = y0 + ((y1 - y0) * (i + 1)) / n;
      if (ends[0]) B.decal(F, 0, QUOIN.w, 0.035, a, b, 'quoinA');
      if (ends[1]) B.decal(F, F.len - QUOIN.w, F.len, 0.035, a, b, 'quoinB', { mirror: true });
    }
  };

  // --- The tower ---
  const tw = rectWalls(towerRect()), side = T.half * 2;
  for (const F of Object.values(tw)) {
    wall(F, 0, side, K.base, T.masonry);
    wall(F, 0, side, T.masonry, T.walls, C.wood);
    plinth(F, K.plinth, false);
    for (const y of T.courses) B.box('trim', F, -0.2, side + 0.2, 0, 0.2, y - 0.02, y + 0.3, y === K.plinth ? C.stone : C.course);
    // (the belfry's sill beam)
    B.box('trim', F, -0.16, side + 0.16, 0, 0.16, T.masonry - 0.12, T.masonry + 0.2, C.wood);
    quoins(F, K.plinth + 0.3, T.masonry - 0.12);
  }
  // the roof: ring over ring from the eaves to the spire's foot, the eaves' underside
  const ring = (half, y) => [W(half, -half, y), W(-half, -half, y), W(-half, half, y), W(half, half, y)];
  const centre = W(0, 0, 0);
  for (let k = 0; k + 1 < T.roof.length; k++) {
    const lo = ring(T.roof[k].half, T.roof[k].y), hi = ring(T.roof[k + 1].half, T.roof[k + 1].y);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, m = [(lo[i][0] + lo[j][0]) / 2 - centre[0], 3, (lo[i][2] + lo[j][2]) / 2 - centre[2]];
      face('roof', [lo[i], lo[j], hi[j], hi[i]], m);
    }
  }
  {
    const top = ring(T.roof[0].half, T.roof[0].y), low = ring(T.roof[0].half, T.roof[0].y - 0.22), lowIn = ring(T.half, T.roof[0].y - 0.22);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, m = [(top[i][0] + top[j][0]) / 2 - centre[0], 0, (top[i][2] + top[j][2]) / 2 - centre[2]];
      face('trim', [low[i], low[j], lowIn[j], lowIn[i]], DOWN, C.wood);
      face('trim', [top[i], top[j], low[j], low[i]], m, C.wood); // (the eaves board)
    }
  }
  // the spire: eight faces to the tip
  {
    const S = T.spire, tip = W(0, 0, S.tip);
    const at = (i) => { const t = ((i + 0.5) / S.sides) * Math.PI * 2; return W(Math.cos(t) * S.radius, Math.sin(t) * S.radius, S.from); };
    for (let i = 0; i < S.sides; i++) {
      const p = at(i), q = at(i + 1);
      face('trim', [p, q, tip], [(p[0] + q[0]) / 2 - centre[0], 0.5, (p[2] + q[2]) / 2 - centre[2]], C.copper);
    }
  }
  // the gilt ball (a coarse sphere) and the cross on its rod
  {
    const { y, r } = T.ball, N = 10, R = 6;
    const pt = (i, k) => { const t = (i / N) * Math.PI * 2, f = (k / R) * Math.PI; return W(Math.cos(t) * Math.sin(f) * r, Math.sin(t) * Math.sin(f) * r, y - Math.cos(f) * r); };
    const c0 = W(0, 0, y);
    for (let k = 0; k < R; k++) {
      for (let i = 0; i < N; i++) {
        const q = k === 0 ? [pt(i, 1), pt(i + 1, 1), pt(0, 0)] : k === R - 1 ? [pt(i, k), pt(i + 1, k), pt(0, R)] : [pt(i, k), pt(i + 1, k), pt(i + 1, k + 1), pt(i, k + 1)];
        const m = q.reduce((s, p) => s.map((v, n) => v + p[n] / q.length), [0, 0, 0]);
        face('trim', q, sub(m, c0), C.gilt);
      }
    }
    const F0 = wallFrame(toWorld(0, 0), toWorld(1, 0)); // (s east, o north of the tower's middle)
    B.box('trim', F0, -0.035, 0.035, -0.035, 0.035, T.spire.tip - 0.5, T.cross.top, C.iron);
    B.box('trim', F0, -T.cross.span / 2, T.cross.span / 2, -0.03, 0.03, T.cross.arm - 0.035, T.cross.arm + 0.035, C.iron);
  }

  // --- The nave: the walls up to the roof, the gable beside the tower, the ridge and the hip over the choir ---
  {
    const N = K.nave, [a0, a1, b0, b1] = N.rect, nv = rectWalls(N.rect);
    const eaveW = N.axis - HW.nave - N.over, eaveE = N.axis + HW.nave + N.over, top = roofHeight(N, HW.nave, HW.nave);
    for (const F of Object.values(nv)) { wall(F, 0, F.len, K.base, top); plinth(F); }
    // (the gable at the north end: the tower stands before its middle)
    face('trim', [W(a1, b0, top), W(a0, b0, top), W(N.axis, b0, N.ridge)], W(0, -1, 0).map((v, i) => v - centre[i]), C.plaster);
    for (const F of Object.values(nv)) quoins(F, K.plinth + 0.2, top - 0.3);
    const n0 = b0 - N.over, s1 = b1 + 1.0;
    slab([W(eaveW, n0, N.eaves), W(eaveW, s1, N.eaves), W(N.axis, N.ridgeEnd, N.ridge), W(N.axis, n0, N.ridge)]);
    slab([W(eaveE, n0, N.eaves), W(eaveE, s1, N.eaves), W(N.axis, N.ridgeEnd, N.ridge), W(N.axis, n0, N.ridge)]);
    slab([W(eaveW, s1, N.eaves), W(eaveE, s1, N.eaves), W(N.axis, N.ridgeEnd, N.ridge)]);
  }
  // --- The transept: two gables, the ridge across the nave's ---
  {
    const X = K.transept, [a0, a1, b0, b1] = X.rect, tr = rectWalls(X.rect);
    const top = roofHeight(X, HW.transept, HW.transept);
    for (const F of Object.values(tr)) { wall(F, 0, F.len, K.base, top); plinth(F); quoins(F, K.plinth + 0.2, top - 0.3); }
    for (const [a, out] of [[a0, -1], [a1, 1]]) {
      face('trim', [W(a, b0, top), W(a, b1, top), W(a, X.axis, X.ridge)], sub(W(out, 0, 0), centre), C.plaster);
    }
    const w = a0 - X.over, e = a1 + X.over;
    slab([W(w, b0 - X.over, X.eaves), W(e, b0 - X.over, X.eaves), W(e, X.axis, X.ridge), W(w, X.axis, X.ridge)], 0.26);
    slab([W(w, b1 + X.over, X.eaves), W(e, b1 + X.over, X.eaves), W(e, X.axis, X.ridge), W(w, X.axis, X.ridge)], 0.26);
  }
  // --- The choir: a short block under a hipped roof coming out of the nave's ---
  {
    const H = K.choir, [a0, a1, , b1] = H.rect, ch = rectWalls(H.rect);
    const top = roofHeight(H, HW.choir, HW.choir);
    for (const F of [ch.west, ch.south, ch.east]) { wall(F, 0, F.len, K.base, top); plinth(F); }
    quoins(ch.south, K.plinth + 0.2, top - 0.3);
    quoins(ch.west, K.plinth + 0.2, top - 0.3, [false, true]);
    quoins(ch.east, K.plinth + 0.2, top - 0.3, [true, false]);
    const w = a0 - H.over, e = a1 + H.over, s = b1 + 1.0;
    slab([W(w, H.ridgeFrom, H.eaves), W(w, s, H.eaves), W(H.axis, H.ridgeEnd, H.ridge), W(H.axis, H.ridgeFrom, H.ridge)]);
    slab([W(e, H.ridgeFrom, H.eaves), W(e, s, H.eaves), W(H.axis, H.ridgeEnd, H.ridge), W(H.axis, H.ridgeFrom, H.ridge)]);
    slab([W(w, s, H.eaves), W(e, s, H.eaves), W(H.axis, H.ridgeEnd, H.ridge)]);
  }
  // --- The sacristy: a low block under a flat roof with a rim ---
  {
    const S = K.sacristy, [a0, a1, b0, b1] = S.rect, sc = rectWalls(S.rect);
    for (const F of Object.values(sc)) {
      wall(F, 0, F.len, K.base, S.top);
      B.box('trim', F, -0.1, F.len + 0.1, -0.25, 0.1, S.top - 0.12, S.top + 0.14, C.course);
    }
    face('roof', [W(a0, b0, S.top), W(a1, b0, S.top), W(a1, b1, S.top), W(a0, b1, S.top)], UP);
  }

  // --- The windows, the ovals, the belfry's bays ---
  const frames = { tower: tw, nave: rectWalls(K.nave.rect), transept: rectWalls(K.transept.rect), sacristy: rectWalls(K.sacristy.rect) };
  for (const d of decals()) B.decal(frames[d.part][d.side], d.s0, d.s1, 0.05, d.y0, d.y1, d.key);

  const trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  root.add(...B.meshes({ trim, roof: SIMPLE_SKINS.snowRoof(ROOF, 0.85), decal: decalMaterial(atlasTexture()) }));
  scene.add(root);

  // Colliders: the sacristy's walls (it stands outside OpenStreetMap's footprint of the church), thin boxes at world heights
  const colliders = [];
  for (const F of Object.values(rectWalls(K.sacristy.rect))) {
    if (F.side === 'west') continue; // (the nave's wall)
    const b = onWall(F, F.len, 0), cx = (F.a[0] + b[0]) / 2, cz = (F.a[1] + b[1]) / 2, hx = F.len / 2, hz = 0.22;
    const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: K.base, minY: K.base, maxY: K.sacristy.top, obb: { cx, cz, hx, hz, cs, sn } });
  }
  return { group: root, colliders };
}
