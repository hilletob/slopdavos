import * as THREE from 'three/webgpu';
import { attribute, float, floor, frontFacing, mix, mx_noise_float, smoothstep, step, texture, uv, vec2, vec3, vec4 } from 'three/tsl';
import { createTreeMaterial } from './tsl-materials.js';
import { snowyRoof, winter } from './season.js';
import { surfaceHeight } from './terrain.js';
import { QUALITY, skipped } from './quality.js';
import { releaseImageAfterUpload } from './gpu-memory.js';

// js/trees.js
// Procedural street, park & forest trees, planted by street-details.js (section 7) and city-grid.js (the woods):
// - Davos's trees: Norway spruce & European larch (the valley's spruce-larch forest), Swiss stone pine (the treeline
//   above ~1800 m), and in town mountain maple, ash, rowan & silver birch, plus green-alder / willow shrubs — grown
//   from seeded per-species rules: a flared trunk / leader carrying scaffold limbs (on the conifers whorls of
//   near-horizontal limbs shortening up the leader; the stone pine's limbs curving up like candelabra arms),
//   branches and twigs as tapered, curving bark tubes (uv in metres for the bark shader)
// - Leaf sprays on alpha-tested cards hung from the twigs, cut from a generated leaf atlas (palmate maple leaves,
//   pinnate rowan / ash fronds, oval shrub leaves, birch twigs, needle shoots and whole-tree conifer silhouettes)
//   whose mipmaps keep their coverage, so distant crowns don't thin out; bare broadleaves and larches in winter
// - Crown-shell normals, interior occlusion & sway weights baked per vertex (attributes: createTreeMaterial in
//   tsl-materials.js)
// - Three levels of detail (two variants per species up close), picked per tree from the camera distance and
//   regrouped per spatial cell / species / variant / level whenever the camera has moved a few metres
// - Up close, the spruce, larch, maple and birch are models grown with EZ-Tree (Dan Greenheck, MIT) and baked offline
//   (tools/bake-ez-trees.mjs → assets/trees/), shaded the same way

const V3 = THREE.Vector3;

// Seeded PRNG (mulberry32): every species, variant and level grows the same tree on every load
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// =====================================================================================================================
// 1. LEAF ATLAS: 4x4 tiles of leaf sprays drawn in metres and fitted to their tile (tileMeters = the card's world size)
//    0 palmate leaves (mountain maple) · 1 pinnate fronds (rowan, ash) · 2 oval leaves (alder / willow shrubs)
//    3 dense far-canopy clump (whole-crown cards of the far level) · 4 spruce shoot (dense needles, side shoots)
//    5 larch twig (tufts of soft needles) · 6 whole spruce/larch silhouette (tiered cone: the crossed cards of a distant
//    one) · 7 birch twig (hanging, small toothed leaves) · 8 Swiss stone pine shoot (long needles in brush-like tufts)
//    9 whole Swiss stone pine silhouette (a rounded column)
//    Texels: r = leaf brightness, g = per-leaf hue jitter, b = twig / stalk mask, a = coverage
// =====================================================================================================================
const TILES = 4;
// 4 x 512: every mip level down to 4 px still splits evenly into the tiles (4 x 128 on the mobile profile, js/quality.js:
// a sixteenth of the memory; the sprays are drawn to the tile's size either way)
const ATLAS_SIZE = QUALITY.treeAtlas;
const TILE = ATLAS_SIZE / TILES;
const GUTTER = 8; // px kept clear round every tile, so mip levels don't bleed between tiles
const TILE_FAR = 3;
const TILE_CONIFER_FAR = 6;
const TILE_ARVE_FAR = 9;
const tileOrigin = (k) => [(k % TILES) * TILE, Math.floor(k / TILES) * TILE];

// Spray primitives in metres (x right, y up from the card's attachment point): twigs (polylines) & leaves
function buildSprays(rng) {
  const R = (a, b) => a + (b - a) * rng();
  const dirOf = (a) => [Math.sin(a), Math.cos(a)]; // a = angle from straight up

  // Curving twig from (x, y) at angle a off vertical, len m long, curling by `curl` rad over its length
  const twig = (x, y, a, len, curl, segs = 12) => {
    const pts = [[x, y]];
    let ang = a;
    for (let i = 1; i <= segs; i++) {
      ang += curl / segs + R(-0.035, 0.035);
      const p = pts[i - 1];
      pts.push([p[0] + Math.sin(ang) * len / segs, p[1] + Math.cos(ang) * len / segs]);
    }
    return pts;
  };
  // Point & direction angle at arc fraction t of a polyline
  const at = (pts, t) => {
    const f = Math.min(pts.length - 1.001, t * (pts.length - 1));
    const i = Math.floor(f);
    const k = f - i;
    const a = pts[i];
    const b = pts[i + 1];
    return { p: [lerp(a[0], b[0], k), lerp(a[1], b[1], k)], a: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  };

  const sprays = [];

  // 0. London plane: four or five twigs fanning out, big palmate leaves on long stalks, alternating along them
  {
    const prims = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n - 0.5;
      const pts = twig(f * 0.08, 0, f * 1.55 + R(-0.1, 0.1), R(0.62, 0.8) * (1 - Math.abs(f) * 0.32), f * 0.6);
      prims.push({ type: 'twig', pts, w0: 0.016, w1: 0.006 });
      let side = rng() < 0.5 ? 1 : -1;
      for (let t = R(0.18, 0.26); t < 0.97; t += R(0.15, 0.19)) {
        const { p, a } = at(pts, t);
        side = -side;
        const la = a + side * R(0.55, 1.05);
        const len = R(0.17, 0.23) * (1 - t * 0.25);
        const stalk = len * 0.32;
        const q = [p[0] + Math.sin(la) * stalk, p[1] + Math.cos(la) * stalk];
        prims.push({ type: 'stalk', a: p, b: q, w: 0.006 });
        prims.push({ type: 'palmate', p: q, a: la + R(-0.25, 0.25), len, t });
      }
      const tip = at(pts, 1);
      prims.push({ type: 'palmate', p: tip.p, a: tip.a + R(-0.2, 0.2), len: R(0.15, 0.19), t: 1 });
    }
    sprays.push(prims);
  }

  // 1. Honey locust: slender twigs bearing feathery compound fronds of tiny paired leaflets (lacy, light-dappled)
  {
    const prims = [];
    const n = 3;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n - 0.5;
      const pts = twig(0, 0, f * 1.3 + R(-0.1, 0.1), R(0.5, 0.62), f * 0.5);
      prims.push({ type: 'twig', pts, w0: 0.012, w1: 0.005 });
      let side = rng() < 0.5 ? 1 : -1;
      for (let t = R(0.12, 0.2); t <= 1.0; t += R(0.2, 0.26)) {
        const { p, a } = at(pts, Math.min(t, 1));
        side = -side;
        const fa = a + side * R(0.35, 0.8);
        const flen = R(0.26, 0.36);
        const rachis = twig(p[0], p[1], fa, flen, side * R(-0.3, 0.1), 8);
        prims.push({ type: 'stalk', pts: rachis, w: 0.004 });
        for (let s = 0.12; s < 0.98; s += 0.07) {
          const r = at(rachis, s);
          for (const sd of [-1, 1]) {
            prims.push({ type: 'oval', p: r.p, a: r.a + sd * R(1.0, 1.35), len: R(0.032, 0.042), wid: 0.38, t: Math.min(1, t + s * 0.3) });
          }
        }
        const end = at(rachis, 1);
        prims.push({ type: 'oval', p: end.p, a: end.a, len: 0.036, wid: 0.38, t: 1 });
      }
    }
    sprays.push(prims);
  }

  // 2. American elm: zigzag twigs, drooping a little, with two ranks of oval, pointed, lopsided leaves
  {
    const prims = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n - 0.5;
      const pts = twig(f * 0.06, 0, f * 1.6 + R(-0.1, 0.1), R(0.5, 0.66) * (1 - Math.abs(f) * 0.25), f * 0.9, 14);
      prims.push({ type: 'twig', pts, w0: 0.012, w1: 0.004 });
      let side = rng() < 0.5 ? 1 : -1;
      for (let t = R(0.1, 0.16); t < 0.97; t += R(0.085, 0.11)) {
        const { p, a } = at(pts, t);
        side = -side;
        prims.push({ type: 'oval', p, a: a + side * R(0.6, 1.0), len: R(0.1, 0.13) * (1 - t * 0.2), wid: 0.5, skew: side * 0.12, t });
      }
      const tip = at(pts, 1);
      prims.push({ type: 'oval', p: tip.p, a: tip.a, len: 0.09, wid: 0.48, t: 1 });
    }
    sprays.push(prims);
  }

  // 3. Far-canopy clump: a ragged, roundish mass of leaves (one card stands for a whole section of a distant crown)
  {
    const prims = [];
    const lobes = Array.from({ length: 7 }, () => ({ a: R(0, Math.PI * 2), r: R(0.75, 1.0), w: R(0.5, 0.9) }));
    const edge = (ang) => 1.25 * lobes.reduce((m, l) => Math.max(m, l.r * Math.cos(Math.min(Math.PI / 2, Math.abs(((ang - l.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / l.w))), 0.6);
    for (let k = 0; k < 520; k++) {
      const ang = R(0, Math.PI * 2);
      const rr = Math.sqrt(rng()) * edge(ang);
      const p = [Math.cos(ang) * rr, 1.3 + Math.sin(ang) * rr];
      prims.push({ type: 'oval', p, a: R(-Math.PI, Math.PI), len: R(0.16, 0.22), wid: 0.55, t: Math.min(1, Math.max(0, (p[1] - 0.2) / 2.2)) });
    }
    sprays.push(prims);
  }

  // Needles in two ranks along a shoot, swept forward (stiff spruce needles or soft larch ones)
  const needles = (prims, pts, from, spacing, len, angle, t0) => {
    for (let t = from; t <= 1; t += spacing) {
      const { p, a } = at(pts, t);
      // the needle mass itself (solid enough for the alpha test at any distance), then the needles at its edges
      prims.push({ type: 'oval', p, a: a + R(-0.5, 0.5), len: len * 2.3, wid: 0.78, t: Math.min(1, t0 + t * 0.4) * 0.85 });
      for (const sd of [-1, 1]) {
        const na = a + sd * (angle + R(-0.18, 0.18));
        const l = len * R(0.8, 1.15) * (1 - t * 0.25);
        prims.push({ type: 'needle', a: p, b: [p[0] + Math.sin(na) * l, p[1] + Math.cos(na) * l], w: 0.0042, t: Math.min(1, t0 + t * 0.4) });
      }
    }
  };

  // 4. Norway spruce: a shoot with alternate side shoots, sweeping down a little, all densely clad in short needles
  {
    const prims = [];
    const main = twig(0, 0, R(-0.08, 0.08), 0.78, R(-0.15, 0.15), 16);
    prims.push({ type: 'twig', pts: main, w0: 0.013, w1: 0.004 });
    // (inner needles darker: t low near the shoot's base, which leafRGB darkens)
    needles(prims, main, 0.02, 0.011, 0.034, 0.75, 0.05);
    let side = rng() < 0.5 ? 1 : -1;
    for (let t = 0.08; t < 0.92; t += R(0.055, 0.075)) {
      const { p, a } = at(main, t);
      side = -side;
      const shoot = twig(p[0], p[1], a + side * R(0.75, 1.05), R(0.2, 0.3) * (1 - t * 0.55), side * 0.35, 8);
      prims.push({ type: 'twig', pts: shoot, w0: 0.007, w1: 0.003 });
      needles(prims, shoot, 0.06, 0.04, 0.03, 0.8, t * 0.7);
    }
    sprays.push(prims);
  }

  // 5. European larch: a twig set with short shoots, each a tuft of fine soft needles radiating forward
  {
    const prims = [];
    const main = twig(0, 0, R(-0.1, 0.1), 0.66, R(-0.25, 0.25), 14);
    prims.push({ type: 'twig', pts: main, w0: 0.011, w1: 0.004 });
    let side = 1;
    for (let t = 0.08; t <= 1; t += R(0.07, 0.1)) {
      const { p, a } = at(main, t);
      side = -side;
      const c = [p[0] + Math.sin(a + side * 1.2) * 0.012, p[1] + Math.cos(a + side * 1.2) * 0.012];
      for (let k = 0; k < 16; k++) {
        const na = a + side * 0.5 + R(-1.15, 1.15);
        const l = R(0.03, 0.045);
        prims.push({ type: 'needle', a: c, b: [c[0] + Math.sin(na) * l, c[1] + Math.cos(na) * l], w: 0.0032, t });
      }
    }
    sprays.push(prims);
  }

  // 6. Whole conifer, 10 m tall: tiers of drooping limbs, each a fringe of needle clumps, narrowing to the leader
  {
    const prims = [];
    for (let y = 0.4; y < 9.8; y += R(0.32, 0.42)) {
      const w = 1.85 * Math.pow(1 - y / 10, 0.95) + 0.1;
      for (let k = 0; k < 26 + w * 22; k++) {
        const u = R(-1, 1);
        const x = u * w;
        const droop = -0.45 * Math.pow(Math.abs(u), 1.6);
        const py = y + droop + R(-0.05, 0.38) * (1 - Math.abs(u) * 0.5);
        prims.push({ type: 'oval', p: [x, py], a: R(-Math.PI, Math.PI), len: R(0.22, 0.32), wid: 0.6, t: Math.min(1, 0.35 + y / 14 + (1 - Math.abs(u)) * 0.1) });
      }
    }
    prims.push({ type: 'oval', p: [0, 9.6], a: 0, len: 0.5, wid: 0.35, t: 1 }); // the leader
    sprays.push(prims);
  }

  // 7. Silver birch: thin twigs arching out and hanging down, with small triangular, toothed leaves on short stalks
  {
    const prims = [];
    for (let i = 0; i < 4; i++) {
      const f = (i + 0.5) / 4 - 0.5;
      const pts = twig(f * 0.05, 0, f * 1.2 + R(-0.1, 0.1), R(0.6, 0.75), Math.sign(f || 1) * R(0.9, 1.4), 16);
      prims.push({ type: 'twig', pts, w0: 0.008, w1: 0.003 });
      let side = 1;
      for (let t = R(0.12, 0.18); t < 0.99; t += R(0.07, 0.09)) {
        const { p, a } = at(pts, t);
        side = -side;
        const la = a + side * R(0.5, 0.9);
        const q = [p[0] + Math.sin(la) * 0.018, p[1] + Math.cos(la) * 0.018];
        prims.push({ type: 'stalk', a: p, b: q, w: 0.003 });
        prims.push({ type: 'oval', p: q, a: la + R(-0.2, 0.2), len: R(0.045, 0.06), wid: 0.72, skew: side * 0.18, t });
      }
    }
    sprays.push(prims);
  }

  // 8. Swiss stone pine (Arve): a stout shoot ending in dense brushes of long, soft needles (five to a bundle)
  {
    const prims = [];
    const main = twig(0, 0, R(-0.08, 0.08), 0.62, R(-0.1, 0.1), 12);
    prims.push({ type: 'twig', pts: main, w0: 0.018, w1: 0.008 });
    const brush = (pts, from, n, len, t0) => {
      for (let t = from; t <= 1; t += (1 - from) / n) {
        const { p, a } = at(pts, t);
        prims.push({ type: 'oval', p, a, len: len * 0.9, wid: 0.9, t: t0 * 0.6 });
        for (let k = 0; k < 9; k++) {
          const na = a + R(-0.95, 0.95) * (0.5 + 0.5 * t);
          const l = len * R(0.8, 1.1);
          prims.push({ type: 'needle', a: p, b: [p[0] + Math.sin(na) * l, p[1] + Math.cos(na) * l], w: 0.0045, t: Math.min(1, t0 + t * 0.5) });
        }
      }
    };
    brush(main, 0.35, 14, 0.085, 0.3);
    for (const side of [-1, 1]) {
      const { p, a } = at(main, R(0.3, 0.5));
      const shoot = twig(p[0], p[1], a + side * R(0.5, 0.8), R(0.22, 0.3), side * 0.2, 8);
      prims.push({ type: 'twig', pts: shoot, w0: 0.01, w1: 0.005 });
      brush(shoot, 0.3, 7, 0.075, 0.2);
    }
    sprays.push(prims);
  }

  // 9. Whole Swiss stone pine, 10 m tall: a dense, rounded column, broad almost to the top, irregular and lumpy
  {
    const prims = [];
    for (let y = 0.6; y < 9.6; y += R(0.3, 0.4)) {
      const w = 1.75 * Math.pow(Math.max(0, 1 - Math.pow(y / 9.8, 2.6)), 0.6) + 0.25 + R(-0.15, 0.15);
      for (let k = 0; k < 28 + w * 24; k++) {
        const u = R(-1, 1);
        const lump = 1 + 0.18 * Math.sin(y * 2.1 + u * 3.0);
        prims.push({ type: 'oval', p: [u * w * lump, y + R(-0.15, 0.3)], a: R(-Math.PI, Math.PI), len: R(0.24, 0.34), wid: 0.65, t: Math.min(1, 0.3 + y / 16 + (1 - Math.abs(u)) * 0.12) });
      }
    }
    sprays.push(prims);
  }
  return sprays;
}

// Bounding box of a spray (metres), with leaves treated as discs round their centre
function sprayBounds(prims) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const add = (x, y, r = 0) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r);
    maxY = Math.max(maxY, y + r);
  };
  for (const q of prims) {
    if (q.type === 'twig' || (q.type === 'stalk' && q.pts)) for (const p of q.pts) add(p[0], p[1]);
    else if (q.type === 'stalk' || q.type === 'needle') {
      add(q.a[0], q.a[1]);
      add(q.b[0], q.b[1]);
    } else {
      add(q.p[0] + Math.sin(q.a) * q.len * 0.5, q.p[1] + Math.cos(q.a) * q.len * 0.5, q.len * 0.62);
    }
  }
  return { minX, maxX, minY, maxY };
}

function createLeafAtlas() {
  const ctx2d = () => {
    const c = document.createElement('canvas');
    c.width = c.height = ATLAS_SIZE;
    return c.getContext('2d', { willReadFrequently: true });
  };
  const col = ctx2d(); // r leaf brightness, g hue jitter, b twig mask
  const cov = ctx2d(); // coverage
  // Mean leaf value under the empty texels, so filtering never pulls black (or twig brown) into the leaf edges
  col.fillStyle = 'rgb(170, 128, 0)';
  col.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  for (const c of [col, cov]) {
    c.lineCap = 'round';
    c.lineJoin = 'round';
  }
  const rng = mulberry32(20261015);
  const R = (a, b) => a + (b - a) * rng();
  const sprays = buildSprays(rng);
  const tileMeters = [];

  sprays.forEach((prims, k) => {
    // Fit: attachment point at the bottom centre of the tile (the far clump: centred), widest extent to the gutter
    const b = sprayBounds(prims);
    const [ox, oy] = tileOrigin(k);
    const room = TILE - 2 * GUTTER;
    let s;
    let cx;
    let by;
    if (k === TILE_FAR) {
      s = room / Math.max(b.maxX - b.minX, b.maxY - b.minY);
      cx = ox + TILE / 2 - ((b.minX + b.maxX) / 2) * s;
      by = oy + TILE / 2 + ((b.minY + b.maxY) / 2) * s;
    } else {
      s = Math.min((room / 2) / Math.max(-b.minX, b.maxX), room / Math.max(b.maxY, 0.01));
      cx = ox + TILE / 2;
      by = oy + TILE - GUTTER;
    }
    tileMeters[k] = room / s;
    const X = (p) => cx + p[0] * s;
    const Y = (p) => by - p[1] * s;
    // Point (u along, v across) of a leaf from P at angle a, L long & W wide (canvas space)
    const frame = (P, a, L, W) => {
      const d = [Math.sin(a), -Math.cos(a)];
      const x0 = X(P);
      const y0 = Y(P);
      return (u, v) => [x0 + d[0] * u * L * s - d[1] * v * W * s, y0 + d[1] * u * L * s + d[0] * v * W * s];
    };
    const ovalPath = (c, f, skew = 0) => {
      c.moveTo(...f(0, 0));
      c.bezierCurveTo(...f(0.05, 0.6 + skew), ...f(0.6, 0.62), ...f(1, 0));
      c.bezierCurveTo(...f(0.6, -0.62), ...f(0.05, -0.6 + skew), ...f(0, 0));
    };
    const halfPath = (c, f, skew = 0) => {
      c.moveTo(...f(0, 0));
      c.bezierCurveTo(...f(0.05, 0.6 + skew), ...f(0.6, 0.62), ...f(1, 0));
      c.closePath();
    };
    // Same path on both canvases: data colour on one, white coverage on the other
    const fill = (path, rgb) => {
      for (const [c, style] of [[col, rgb], [cov, '#fff']]) {
        c.beginPath();
        path(c);
        c.fillStyle = style;
        c.fill();
      }
    };
    const stroke = (pts, w0, w1, rgb) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const w = Math.max(0.8, lerp(w0, w1, i / (pts.length - 1)) * s);
        for (const [c, style] of [[col, rgb], [cov, '#fff']]) {
          c.beginPath();
          c.moveTo(X(pts[i]), Y(pts[i]));
          c.lineTo(X(pts[i + 1]), Y(pts[i + 1]));
          c.lineWidth = w;
          c.strokeStyle = style;
          c.stroke();
        }
      }
    };
    const leafRGB = (t) => {
      // brighter towards the sunlit outer end of the spray, a few darker or older leaves
      const r = Math.min(255, Math.round(255 * R(0.6, 0.9) * (0.8 + 0.2 * t)));
      return [r, Math.round(255 * rng())];
    };
    const rgb = (r, g, bl = 0) => `rgb(${r}, ${g}, ${bl})`;

    for (const q of prims) {
      if (q.type === 'twig') stroke(q.pts, q.w0, q.w1, rgb(110, 128, 255));
      else if (q.type === 'stalk') stroke(q.pts || [q.a, q.b], q.w, q.w * 0.7, rgb(120, 128, 150));
      else if (q.type === 'needle') {
        const [r, g] = leafRGB(q.t);
        stroke([q.a, q.b], q.w, q.w * 0.6, rgb(Math.round(r * 0.9), g));
      }
      else if (q.type === 'oval') {
        const [r, g] = leafRGB(q.t);
        const f = frame(q.p, q.a, q.len, q.len * q.wid);
        fill((c) => ovalPath(c, f, q.skew || 0), rgb(r, g));
        if (q.len * s > 9) {
          // one half of the blade a little darker (folded along the midrib) and the midrib itself
          col.beginPath();
          halfPath(col, f, q.skew || 0);
          col.fillStyle = rgb(Math.round(r * 0.84), g);
          col.fill();
        }
      } else if (q.type === 'palmate') {
        // Five pointed lobes radiating from the blade centre: main, two side & two small basal ones
        const [r, g] = leafRGB(q.t);
        const L = q.len;
        const cP = [q.p[0] + Math.sin(q.a) * L * 0.22, q.p[1] + Math.cos(q.a) * L * 0.22];
        const lobes = [[0, 0.78, 0.36], [0.85, 0.62, 0.34], [-0.85, 0.62, 0.34], [1.65, 0.34, 0.36], [-1.65, 0.34, 0.36]];
        lobes.forEach(([da, ll, ww], li) => {
          const f = frame(cP, q.a + da + R(-0.08, 0.08), L * ll, L * ll * ww);
          const shade = li === 0 ? 1 : (da > 0 ? 0.88 : 0.95);
          fill((c) => ovalPath(c, f), rgb(Math.round(r * shade), g));
        });
        fill((c) => c.arc(X(cP), Y(cP), L * 0.24 * s, 0, Math.PI * 2), rgb(Math.round(r * 0.96), g));
      }
    }
  });

  // Colour data + coverage -> level 0, then a mip chain whose alpha keeps each tile's coverage
  const data = col.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE).data;
  const mask = cov.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE).data;
  const level0 = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let i = 0; i < level0.length; i += 4) {
    level0[i] = data[i];
    level0[i + 1] = data[i + 1];
    level0[i + 2] = data[i + 2];
    level0[i + 3] = mask[i + 3];
  }
  const tex = new THREE.DataTexture(level0, ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = coverageMips(level0, ATLAS_SIZE, TILES);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  tex.name = 'TreeLeafAtlas';
  releaseImageAfterUpload(tex); // (its 21 MB of pixels and mipmaps leave JavaScript once on the GPU)
  return { texture: tex, tileMeters };
}

// Box-filtered mip chain whose alpha is rescaled per tile so the share of texels above the alpha-test cutoff stays as
// it is at level 0 (otherwise alpha-tested foliage thins out and vanishes at distance)
function coverageMips(level0, size, tiles, cutoff = 128) {
  const levels = [{ data: level0, width: size, height: size }];
  const target = [];
  const tilePx = size / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      let n = 0;
      for (let y = ty * tilePx; y < (ty + 1) * tilePx; y++) {
        for (let x = tx * tilePx; x < (tx + 1) * tilePx; x++) if (level0[(y * size + x) * 4 + 3] >= cutoff) n++;
      }
      target.push(n / (tilePx * tilePx));
    }
  }
  const meanTarget = target.reduce((a, b) => a + b, 0) / target.length;
  let src = level0;
  let w = size;
  const hist = new Uint32Array(256);
  while (w > 1) {
    const h = w >> 1;
    const dst = new Uint8Array(h * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < h; x++) {
        const i0 = ((2 * y) * w + 2 * x) * 4;
        const i1 = i0 + w * 4;
        const o = (y * h + x) * 4;
        for (let c = 0; c < 4; c++) dst[o + c] = (src[i0 + c] + src[i0 + 4 + c] + src[i1 + c] + src[i1 + 4 + c] + 2) >> 2;
      }
    }
    const nt = h >= tiles ? tiles : 1;
    const tp = h / nt;
    for (let ty = 0; ty < nt; ty++) {
      for (let tx = 0; tx < nt; tx++) {
        const want = (nt === tiles ? target[ty * tiles + tx] : meanTarget) * tp * tp;
        hist.fill(0);
        for (let y = ty * tp; y < (ty + 1) * tp; y++) for (let x = tx * tp; x < (tx + 1) * tp; x++) hist[dst[(y * h + x) * 4 + 3]]++;
        let acc = 0;
        let aStar = 255;
        for (let a = 255; a >= 1; a--) {
          acc += hist[a];
          if (acc >= want) {
            aStar = a;
            break;
          }
        }
        const scale = cutoff / Math.max(aStar, 1);
        if (Math.abs(scale - 1) < 0.01) continue;
        for (let y = ty * tp; y < (ty + 1) * tp; y++) {
          for (let x = tx * tp; x < (tx + 1) * tp; x++) {
            const i = (y * h + x) * 4 + 3;
            dst[i] = Math.min(255, Math.round(dst[i] * scale));
          }
        }
      }
    }
    levels.push({ data: dst, width: h, height: h });
    src = dst;
    w = h;
  }
  return levels;
}

// =====================================================================================================================
// 2. SPECIES: trunk / leader (radius, top, lean), scaffold limbs (count, heights up the leader, tilt off vertical and
//    length blended from the lowest to the highest limb), branches & twigs (count, span along the parent, angle off it,
//    length as a share of the parent or in metres), bending per metre (up: toward the sky, out: away from the trunk,
//    droop: down, growing toward the tips), leaf cards per twig (scale, droop) and the per-tree foliage tints (sRGB).
//    Scale 1 is a mature park tree; street trees are planted smaller.
// =====================================================================================================================
const SPECIES = [
  { // 0: Mountain maple (Bergahorn): a short stout trunk and heavy ascending limbs, a broad dome of big palmate leaves
    name: 'maple', tile: 0, bark: 'smooth',
    trunk: { r: 0.3, top: 6.2, lean: 0.04, segs: 8 },
    limbs: { n: 6, y: [2.6, 5.6], tilt: [1.05, 0.4], len: [4.4, 2.8], r: 0.62, up: 0.08, out: 0, droop: 0, jitter: 0.08, segs: 6 },
    branches: { n: 4, t: [0.3, 0.98], angle: [0.55, 0.95], len: [0.62, 0.42], up: 0.06, out: 0.02, droop: 0, jitter: 0.1, segs: 4 },
    twigs: { n: 3, t: [0.3, 1.0], angle: [0.6, 1.05], len: [1.05, 0.7], up: 0.02, out: 0, droop: 0.04, jitter: 0.12, segs: 2 },
    cards: { perTwig: 2, scale: [0.8, 1.05], droop: 0.05 },
    tints: [0x3f5f24, 0x4a6b29, 0x365520]
  },
  { // 1: Rowan (Vogelbeere): a small tree with a slim trunk, steep ascending limbs, a light oval crown of pinnate leaves
    name: 'rowan', tile: 1,
    trunk: { r: 0.15, top: 3.6, lean: 0.06, segs: 7 },
    limbs: { n: 5, y: [1.8, 3.4], tilt: [0.75, 0.35], len: [3.6, 2.4], r: 0.7, up: 0.06, out: 0, droop: 0, jitter: 0.14, segs: 5 },
    branches: { n: 3, t: [0.3, 0.98], angle: [0.5, 0.9], len: [0.55, 0.4], up: 0.04, out: 0.02, droop: 0.02, jitter: 0.14, segs: 4 },
    twigs: { n: 3, t: [0.3, 1.0], angle: [0.5, 0.95], len: [0.8, 0.55], up: 0.02, out: 0, droop: 0.05, jitter: 0.14, segs: 2 },
    cards: { perTwig: 2, scale: [0.7, 0.95], droop: 0.08 },
    tints: [0x56732c, 0x637f31, 0x4b6627]
  },
  { // 2: Ash (Esche): a tall straight trunk, few long ascending limbs, an open, airy crown of pinnate leaves
    name: 'ash', tile: 1,
    trunk: { r: 0.26, top: 7.5, lean: 0.03, segs: 8 },
    limbs: { n: 5, y: [4.0, 7.0], tilt: [0.8, 0.35], len: [5.0, 3.2], r: 0.6, up: 0.05, out: 0.02, droop: 0, jitter: 0.1, segs: 6 },
    branches: { n: 4, t: [0.3, 1.0], angle: [0.5, 0.9], len: [0.5, 0.35], up: 0.02, out: 0.04, droop: 0.04, jitter: 0.12, segs: 4 },
    twigs: { n: 2, t: [0.35, 1.0], angle: [0.5, 0.95], len: [1.1, 0.75], up: 0, out: 0, droop: 0.08, jitter: 0.12, segs: 2 },
    cards: { perTwig: 2, scale: [0.9, 1.15], droop: 0.15 },
    tints: [0x587a30, 0x648636, 0x4d6c2a]
  },
  { // 3: Norway spruce (Fichte): a straight leader to the very top, whorls of near-horizontal limbs shortening up it
    //    into a narrow spire, side shoots and hanging twigs densely clad in dark blue-green needles (more foliage
    //    along the limbs close to the trunk, so the crown is dense rather than lacy close up)
    name: 'spruce', tile: 4, conifer: true,
    trunk: { r: 0.3, top: 19, lean: 0.012, segs: 10 },
    limbs: { n: 22, y: [2.0, 18.2], tilt: [1.82, 1.12], len: [3.3, 0.55], r: 0.34, up: 0.07, out: 0, droop: 0.02, jitter: 0.05, segs: 5 },
    branches: { n: 2, t: [0.25, 0.95], angle: [0.85, 1.2], len: [0.5, 0.32], up: 0, out: 0.02, droop: 0.14, jitter: 0.08, segs: 3 },
    twigs: { n: 2, t: [0.3, 1.0], angle: [0.55, 0.95], len: [0.6, 0.42], up: 0, out: 0, droop: 0.3, jitter: 0.1, segs: 2 },
    cards: { perTwig: 2, scale: [1.8, 2.3], droop: 0.3, alongLimbs: 9, limbFrom: 0.08 },
    tints: [0x1f3b26, 0x25432b, 0x1b3322]
  },
  { // 4: European larch (Lärche): a lighter, more open cone of upswept limbs with hanging side twigs and soft, bright
    //    green needle tufts (bare in winter: season.js)
    name: 'larch', tile: 5, conifer: true, deciduous: true,
    trunk: { r: 0.27, top: 17, lean: 0.03, segs: 9 },
    limbs: { n: 14, y: [3.0, 16.2], tilt: [1.5, 0.85], len: [3.6, 0.8], r: 0.36, up: 0.12, out: 0, droop: 0, jitter: 0.07, segs: 5 },
    branches: { n: 3, t: [0.25, 0.95], angle: [0.6, 1.0], len: [0.55, 0.35], up: 0, out: 0.02, droop: 0.18, jitter: 0.1, segs: 3 },
    twigs: { n: 2, t: [0.3, 1.0], angle: [0.5, 0.95], len: [0.55, 0.38], up: 0, out: 0, droop: 0.28, jitter: 0.12, segs: 2 },
    cards: { perTwig: 2, scale: [1.6, 2.0], droop: 0.25, alongLimbs: 5 },
    tints: [0x5f7f33, 0x6c8a3a, 0x52702d]
  },
  { // 5: Swiss stone pine (Arve): the tree of the treeline above Davos — a stout trunk and many upswept limbs whose
    //    ends curve up like candelabra arms, a dense rounded column of dark green needle brushes
    name: 'arve', tile: 8, farTile: TILE_ARVE_FAR, conifer: true,
    trunk: { r: 0.36, top: 12, lean: 0.03, segs: 9 },
    limbs: { n: 16, y: [1.6, 11.4], tilt: [1.25, 0.6], len: [2.9, 1.3], r: 0.4, up: 0.22, out: 0, droop: 0, jitter: 0.1, segs: 5 },
    branches: { n: 3, t: [0.3, 1.0], angle: [0.5, 0.85], len: [0.55, 0.4], up: 0.12, out: 0.02, droop: 0, jitter: 0.1, segs: 3 },
    twigs: { n: 2, t: [0.4, 1.0], angle: [0.4, 0.8], len: [0.5, 0.35], up: 0.06, out: 0, droop: 0.05, jitter: 0.1, segs: 2 },
    cards: { perTwig: 3, scale: [1.3, 1.7], droop: 0.0, alongLimbs: 7, limbFrom: 0.15 },
    tints: [0x1c3a22, 0x234428, 0x18321e]
  },
  { // 6: Silver birch (Birke): a slender white trunk, steep limbs and long hanging twigs, a light, airy crown
    name: 'birch', tile: 7, bark: 'birch',
    trunk: { r: 0.16, top: 9.5, lean: 0.05, segs: 9 },
    limbs: { n: 8, y: [3.0, 9.0], tilt: [0.8, 0.35], len: [3.6, 1.6], r: 0.55, up: 0.04, out: 0, droop: 0.04, jitter: 0.12, segs: 6 },
    branches: { n: 3, t: [0.3, 1.0], angle: [0.6, 1.0], len: [0.5, 0.35], up: 0, out: 0.03, droop: 0.12, jitter: 0.14, segs: 4 },
    twigs: { n: 3, t: [0.3, 1.0], angle: [0.5, 1.0], len: [1.0, 0.7], up: 0, out: 0, droop: 0.45, jitter: 0.14, segs: 3 },
    cards: { perTwig: 2, scale: [0.85, 1.05], droop: 0.55 },
    tints: [0x6a8a34, 0x77953a, 0x5d7d2e]
  },
  { // 7: Shrub (Gebüsch: green alder / willow): several stems from the ground, a rounded bush ~2.5 m high
    name: 'shrub', tile: 2,
    trunk: { r: 0.06, top: 0.45, lean: 0.1, segs: 3 },
    limbs: { n: 7, y: [0.08, 0.4], tilt: [0.75, 0.3], len: [2.3, 1.9], r: 1.1, up: 0.05, out: 0.03, droop: 0.04, jitter: 0.18, segs: 5 },
    branches: { n: 3, t: [0.3, 1.0], angle: [0.5, 0.95], len: [0.45, 0.3], up: 0.02, out: 0.03, droop: 0.05, jitter: 0.16, segs: 3 },
    twigs: { n: 2, t: [0.35, 1.0], angle: [0.5, 0.95], len: [0.45, 0.3], up: 0, out: 0, droop: 0.06, jitter: 0.14, segs: 2 },
    cards: { perTwig: 2, scale: [0.55, 0.75], droop: 0.08 },
    tints: [0x3f6024, 0x4a6b28, 0x37561f]
  }
];

// Species by name for the planting code (city-grid.js); 'plane', 'locust' and 'elm' are the indices' old names
const SPECIES_INDEX = Object.freeze({ maple: 0, rowan: 1, ash: 2, spruce: 3, larch: 4, arve: 5, birch: 6, shrub: 7, plane: 0, locust: 1, elm: 2 });
// Natural heights (m) of the species at scale 1, for sizing trees from surveyed heights
const SPECIES_HEIGHT = Object.freeze([13, 8.5, 15, 20, 18, 13, 14, 2.6]);

// =====================================================================================================================
// 3. SKELETON
// =====================================================================================================================

// Unit vector `angle` off `dir`, turned `azimuth` round it
function deflect(dir, angle, azimuth) {
  const ref = Math.abs(dir.y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0);
  const u = new V3().crossVectors(dir, ref).normalize();
  const w = new V3().crossVectors(dir, u);
  return dir.clone().multiplyScalar(Math.cos(angle))
    .addScaledVector(u, Math.sin(angle) * Math.cos(azimuth))
    .addScaledVector(w, Math.sin(angle) * Math.sin(azimuth))
    .normalize();
}

// A branch as a polyline from p0 along dir, len metres in segs steps (or at the given length fractions), bending per
// metre toward the sky (up), away from the trunk axis (out) and downward toward its tip (droop), with some wander
function growBranch(p0, dir, len, r0, r1, segs, bend, rng, level, schedule = null) {
  const ts = schedule || Array.from({ length: segs + 1 }, (_, i) => i / segs);
  const pts = [p0.clone()];
  const rad = [r0];
  const d = dir.clone();
  const p = p0.clone();
  const out = new V3();
  for (let i = 1; i < ts.length; i++) {
    const t = ts[i];
    const step = (t - ts[i - 1]) * len;
    out.set(p.x, 0, p.z);
    if (out.lengthSq() > 1e-6) out.normalize();
    d.x += out.x * bend.out * step + (rng() - 0.5) * bend.jitter;
    d.y += (bend.up - bend.droop * t * 2.0) * step + (rng() - 0.5) * bend.jitter * 0.6;
    d.z += out.z * bend.out * step + (rng() - 0.5) * bend.jitter;
    d.normalize();
    p.addScaledVector(d, step);
    pts.push(p.clone());
    rad.push(r0 + (r1 - r0) * Math.pow(t, 0.8));
  }
  return { pts, rad, len, level, ts };
}

// Point, direction & radius at length fraction t of a branch
function along(b, t) {
  const ts = b.ts;
  let i = 0;
  while (i < ts.length - 2 && ts[i + 1] < t) i++;
  const k = Math.min(1, Math.max(0, (t - ts[i]) / (ts[i + 1] - ts[i])));
  return {
    p: b.pts[i].clone().lerp(b.pts[i + 1], k),
    d: b.pts[i + 1].clone().sub(b.pts[i]).normalize(),
    r: lerp(b.rad[i], b.rad[i + 1], k)
  };
}

function growTree(sp, seed) {
  const rng = mulberry32(seed);
  const R = (a, b) => a + (b - a) * rng();
  const branches = [];
  const still = { up: 0, out: 0, droop: 0, jitter: 0.025 };

  // Trunk & leader: leaning a little, flaring at the root (dense rings at the base), tapering to a slim top
  const T = sp.trunk;
  const lean = R(0, Math.PI * 2);
  const trunkDir = new V3(Math.cos(lean) * T.lean, 1, Math.sin(lean) * T.lean).normalize();
  const schedule = [0, 0.03, 0.08];
  for (let i = 1; i <= T.segs; i++) schedule.push(0.08 + (0.92 * i) / T.segs);
  const trunk = growBranch(new V3(0, 0, 0), trunkDir, T.top, T.r, T.r * 0.3, T.segs, still, rng, 0, schedule);
  trunk.rad = trunk.rad.map((r, i) => r * (1 + 0.75 * Math.exp(-(trunk.ts[i] * T.top) / 0.28)));
  branches.push(trunk);

  // Scaffold limbs spiralling up the leader by the golden angle; branches along each limb; twigs along each branch
  const L = sp.limbs;
  const B = sp.branches;
  const W = sp.twigs;
  let az = R(0, Math.PI * 2);
  for (let i = 0; i < L.n; i++) {
    const f = L.n > 1 ? i / (L.n - 1) : 0;
    const y = lerp(L.y[0], L.y[1], f) + R(-0.25, 0.25);
    const base = along(trunk, Math.min(0.98, y / T.top));
    az += 2.39996 + R(-0.35, 0.35);
    const tilt = lerp(L.tilt[0], L.tilt[1], f) + R(-0.08, 0.08);
    const dir = new V3(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));
    const len = lerp(L.len[0], L.len[1], f) * R(0.88, 1.1);
    const limb = growBranch(base.p, dir, len, base.r * L.r, 0.035, L.segs, L, rng, 1);
    branches.push(limb);

    const nb = B.n + (rng() < 0.5 ? 1 : 0);
    let baz = R(0, Math.PI * 2);
    for (let j = 0; j < nb; j++) {
      const bt = lerp(B.t[0], B.t[1], (j + R(0.15, 0.85)) / nb);
      const a = along(limb, bt);
      baz += 2.39996 + R(-0.4, 0.4);
      const bdir = deflect(a.d, R(B.angle[0], B.angle[1]), baz);
      const outw = new V3(a.p.x, 0, a.p.z).normalize();
      if (bdir.dot(outw) < -0.15) bdir.addScaledVector(outw, 0.7).normalize(); // keep out of the crown core
      const blen = len * lerp(B.len[0], B.len[1], bt) * R(0.85, 1.12);
      const br = growBranch(a.p, bdir, blen, Math.max(0.022, a.r * 0.62), 0.014, B.segs, B, rng, 2);
      br.parentT = bt;
      branches.push(br);

      const nw = W.n + (rng() < 0.4 ? 1 : 0);
      let taz = R(0, Math.PI * 2);
      for (let k = 0; k < nw; k++) {
        const tt = lerp(W.t[0], W.t[1], (k + R(0.2, 0.8)) / nw);
        const ta = along(br, tt);
        taz += 2.39996 + R(-0.5, 0.5);
        const tdir = deflect(ta.d, R(W.angle[0], W.angle[1]), taz);
        const tw = growBranch(ta.p, tdir, lerp(W.len[0], W.len[1], tt) * R(0.8, 1.2), Math.max(0.012, ta.r * 0.7), 0.006, W.segs, W, rng, 3);
        tw.parentT = tt;
        branches.push(tw);
      }
    }
  }
  return branches;
}

// =====================================================================================================================
// 4. GEOMETRY: bark tubes & leaf cards of one species / variant at one level of detail
// =====================================================================================================================
class TreeGeometryBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.attr = [];
    this.idx = [];
  }

  vertex(p, n, u, v, leaf, ao, sway, rnd) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.attr.push(leaf, ao, sway, rnd);
    return this.pos.length / 3 - 1;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aTree', new THREE.Float32BufferAttribute(this.attr, 4));
    const vCount = this.pos.length / 3;
    g.setIndex(vCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Tapered tube along a branch with parallel-transported rings (every `stride`-th skeleton point); uv in metres
function addTube(gb, b, radial, stride, aoAt, swayAt) {
  const n = b.pts.length;
  const keep = [];
  for (let i = 0; i < n; i += stride) keep.push(i);
  if (keep[keep.length - 1] !== n - 1) keep.push(n - 1);
  const tangent = (i) => {
    const a = b.pts[Math.max(0, i - 1)];
    const c = b.pts[Math.min(n - 1, i + 1)];
    return c.clone().sub(a).normalize();
  };
  let T = tangent(keep[0]);
  let N = Math.abs(T.y) < 0.9 ? new V3(0, 1, 0).cross(T).normalize() : new V3(1, 0, 0).cross(T).normalize();
  const q = new THREE.Quaternion();
  const around = 2 * Math.PI * Math.max(b.rad[0], 0.02);
  let vLen = 0;
  const base = gb.pos.length / 3;
  const dir = new V3();
  const p = new V3();
  keep.forEach((i, ki) => {
    if (ki > 0) {
      const T2 = tangent(i);
      q.setFromUnitVectors(T, T2);
      N.applyQuaternion(q).normalize();
      T = T2;
      vLen += b.pts[i].distanceTo(b.pts[keep[ki - 1]]);
    }
    const Bn = new V3().crossVectors(T, N);
    const t = b.ts[i];
    const ao = aoAt(b.pts[i]);
    const sway = swayAt(b, t);
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      dir.copy(N).multiplyScalar(Math.cos(ang)).addScaledVector(Bn, Math.sin(ang));
      p.copy(b.pts[i]).addScaledVector(dir, b.rad[i]);
      gb.vertex(p, dir, (j / radial) * around, vLen, 0, ao, sway, 0);
    }
  });
  // Rings run counter-clockwise round the tangent, so (a, a + 1, c) is counter-clockwise seen from outside: the front
  // faces point out along the normals (the material drops the bark's back faces)
  for (let k = 0; k < keep.length - 1; k++) {
    for (let j = 0; j < radial; j++) {
      const a = base + k * (radial + 1) + j;
      const c = a + radial + 1;
      gb.idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
}

// Leaf card: bottom edge centred on `at`, rising along `up`, facing `face`; uv over atlas tile `tile` (mirrored or not)
function addCard(gb, at, up, face, size, tile, mirror, rnd, crown) {
  const side = new V3().crossVectors(up, face).normalize();
  const nrm = new V3().crossVectors(side, up).normalize();
  const [ox, oy] = tileOrigin(tile);
  let u0 = (ox + GUTTER) / ATLAS_SIZE;
  let u1 = (ox + TILE - GUTTER) / ATLAS_SIZE;
  if (mirror) [u0, u1] = [u1, u0];
  const vTop = (oy + GUTTER) / ATLAS_SIZE;
  const vBot = (oy + TILE - GUTTER) / ATLAS_SIZE;
  const corners = [
    [-0.5, 0, u0, vBot],
    [0.5, 0, u1, vBot],
    [0.5, 1, u1, vTop],
    [-0.5, 1, u0, vTop]
  ];
  const base = gb.pos.length / 3;
  const p = new V3();
  for (const [sx, sy, u, v] of corners) {
    p.copy(at).addScaledVector(side, sx * size).addScaledVector(up, sy * size);
    const { n, ao } = crown.shade(p, nrm);
    gb.vertex(p, n, u, v, 1, ao, lerp(0.8, 1.0, sy), rnd);
  }
  gb.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// Crown ellipsoid (from the foliage) for shell normals & interior occlusion
function makeCrown(points) {
  const box = new THREE.Box3().setFromPoints(points);
  const C = box.getCenter(new V3());
  const Rr = box.getSize(new V3()).multiplyScalar(0.5).max(new V3(0.5, 0.5, 0.5));
  const tmp = new V3();
  const sn = new V3();
  return {
    C,
    R: Rr,
    bottom: box.min.y,
    // Shell normal (out from the centre, a little skyward) blended with the card face (turned to agree with it)
    shade(p, face) {
      tmp.copy(p).sub(C).divide(Rr);
      const e = tmp.length();
      sn.copy(tmp).normalize();
      sn.y += 0.22;
      sn.normalize();
      const f = face.dot(sn) < 0 ? face.clone().negate() : face.clone();
      const n = sn.clone().multiplyScalar(0.72).addScaledVector(f, 0.28).normalize();
      const top = Math.min(1, Math.max(-1, (p.y - C.y) / Rr.y));
      const ao = (0.22 + 0.78 * smooth(0.15, 1.0, e)) * (0.86 + 0.14 * top);
      return { n, ao };
    },
    // Bark: open below the crown, darker the deeper inside it
    barkAO(p) {
      if (p.y < box.min.y) return 0.9;
      tmp.copy(p).sub(C).divide(Rr);
      return lerp(0.32, 0.8, smooth(0.2, 1.0, tmp.length()));
    }
  };
}

// Conifer crown: a cone round the leader (base radius at the lowest foliage, apex at the top), for shell normals that
// slope up the cone and occlusion growing toward the leader
function makeCone(points) {
  const box = new THREE.Box3().setFromPoints(points);
  const C = box.getCenter(new V3());
  const Rr = box.getSize(new V3()).multiplyScalar(0.5).max(new V3(0.5, 0.5, 0.5));
  const bottom = box.min.y, top = box.max.y, H = Math.max(1, top - bottom);
  const base = Math.max(Rr.x, Rr.z);
  const slope = base / H; // the cone's normal tilts up by its half-angle
  const ratio = (p) => {
    const h = Math.min(1, Math.max(0, (p.y - bottom) / H));
    return { h, e: Math.hypot(p.x, p.z) / (base * (1 - h) + 0.35) };
  };
  return {
    C, R: Rr, bottom, top, conifer: true,
    shade(p, face) {
      const { h, e } = ratio(p);
      const r = Math.hypot(p.x, p.z) || 1e-3;
      const sn = new V3(p.x / r, slope, p.z / r).normalize();
      const f = face.dot(sn) < 0 ? face.clone().negate() : face.clone();
      const n = sn.multiplyScalar(0.7).addScaledVector(f, 0.3).normalize();
      const ao = (0.2 + 0.8 * smooth(0.2, 1.0, e)) * (0.8 + 0.2 * h);
      return { n, ao };
    },
    barkAO(p) {
      if (p.y < bottom) return 0.85;
      return lerp(0.3, 0.75, smooth(0.2, 1.0, ratio(p).e));
    }
  };
}

// Sway weight along the hierarchy: 0 on the trunk (whole-tree bend is height based), rising to 1 at the twig tips
function swayWeight(b, t) {
  switch (b.level) {
    case 0: return 0;
    case 1: return 0.18 * t;
    case 2: return 0.18 + 0.4 * t;
    default: return 0.58 + 0.4 * t;
  }
}

// Leaf cards of one tree: lod 0 on every twig, lod 1 fewer & larger along the branches, lod 2 a shell of whole-crown
// cards (far-canopy tile) round the crown ellipsoid
function placeCards(sp, branches, lod, tileMeters, rng, crown) {
  const R = (a, b) => a + (b - a) * rng();
  const cards = [];
  // (conifers: out from the leader, level)
  const outward = crown.conifer
    ? (p) => new V3(p.x, 0.15, p.z).normalize()
    : (p) => new V3(p.x - crown.C.x, (p.y - crown.C.y) * 0.6, p.z - crown.C.z).normalize();
  const orient = (p, d, droop) => {
    const o = outward(p);
    const up = d.clone().multiplyScalar(0.55).addScaledVector(o, 0.45)
      .add(new V3(R(-0.3, 0.3), R(-0.2, 0.3), R(-0.3, 0.3)));
    up.y -= droop;
    up.normalize();
    let face = o.clone().add(new V3(R(-0.9, 0.9), R(-0.6, 0.9), R(-0.9, 0.9))).normalize();
    face.addScaledVector(up, -face.dot(up));
    if (face.lengthSq() < 1e-4) face = new V3(0, 1, 0).cross(up);
    return { up, face: face.normalize() };
  };
  const size = tileMeters[sp.tile];
  // A conifer's leader ends in an upright shoot
  if (sp.conifer && lod === 0) {
    const trunk = branches[0];
    for (const t of [0.9, 0.96]) {
      const a = along(trunk, t);
      const up = new V3(R(-0.15, 0.15), 1, R(-0.15, 0.15)).normalize();
      let face = new V3(R(-1, 1), 0, R(-1, 1)).normalize();
      face.addScaledVector(up, -face.dot(up)).normalize();
      cards.push({ at: a.p, up, face, size: size * 0.9, tile: sp.tile });
    }
  }
  if (lod >= 1 && sp.conifer) {
    // Crossed upright cards of the whole tree, scaled to the crown's height: a full, dense cone from mid range on
    // (three at the far level, six at mid range)
    const scale = (crown.top - crown.bottom) / 10;
    const n = lod === 1 ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const ang = (i * Math.PI) / n + R(-0.1, 0.1);
      const face = new V3(Math.cos(ang), 0, Math.sin(ang));
      const far = sp.farTile ?? TILE_CONIFER_FAR;
      cards.push({ at: new V3(0, crown.bottom - 0.4 * scale, 0), up: new V3(0, 1, 0), face, size: tileMeters[far] * scale, tile: far });
    }
    return cards;
  }
  if (lod === 0) {
    for (const b of branches) {
      if (b.level !== 3) continue;
      const n = sp.cards.perTwig;
      for (let k = 0; k < n; k++) {
        const t = lerp(0.4, 1.0, (k + R(0.3, 0.9)) / n);
        const a = along(b, t);
        const { up, face } = orient(a.p, a.d, sp.cards.droop);
        cards.push({ at: a.p, up, face, size: size * R(sp.cards.scale[0], sp.cards.scale[1]), tile: sp.tile });
      }
    }
    // conifers: foliage all along the limbs, not only out at the twigs
    if (sp.cards.alongLimbs) {
      for (const b of branches) {
        if (b.level !== 1) continue;
        for (let k = 0; k < sp.cards.alongLimbs; k++) {
          const a = along(b, lerp(sp.cards.limbFrom ?? 0.25, 0.95, (k + R(0.2, 0.8)) / sp.cards.alongLimbs));
          const { up, face } = orient(a.p, a.d, sp.cards.droop);
          cards.push({ at: a.p, up, face, size: size * R(sp.cards.scale[0], sp.cards.scale[1]), tile: sp.tile });
        }
      }
    }
    // a card at the end of every branch fills the gap between its twigs
    for (const b of branches) {
      if (b.level !== 2) continue;
      const a = along(b, 1);
      const { up, face } = orient(a.p, a.d, sp.cards.droop);
      cards.push({ at: a.p, up, face, size: size * R(0.9, 1.1), tile: sp.tile });
    }
  } else if (lod === 1) {
    for (const b of branches) {
      if (b.level !== 2) continue;
      for (const t of [0.42, 0.72, 1.0]) {
        const a = along(b, Math.min(1, t + R(-0.06, 0.04)));
        const { up, face } = orient(a.p, a.d, sp.cards.droop);
        const at = a.p.clone().addScaledVector(outward(a.p), 0.35);
        cards.push({ at, up, face, size: size * R(1.35, 1.6), tile: sp.tile });
      }
    }
  } else {
    // Fibonacci directions over the crown, fewer underneath; cards centred just inside the shell, facing out
    const n = 18;
    const meanR = (crown.R.x + crown.R.y + crown.R.z) / 3;
    const s = Math.max(meanR * 1.25, 2.4);
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 1.55; // 1 .. -0.55
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const ph = i * 2.39996 + R(-0.2, 0.2);
      const dir = new V3(Math.cos(ph) * r, y, Math.sin(ph) * r);
      const center = crown.C.clone().add(dir.clone().multiply(crown.R).multiplyScalar(0.58));
      const face = dir.clone().add(new V3(R(-0.25, 0.25), R(-0.25, 0.25), R(-0.25, 0.25))).normalize();
      let up = new V3(0, 1, 0).addScaledVector(face, -face.y);
      if (up.lengthSq() < 1e-3) up = new V3(1, 0, 0);
      up.normalize().applyAxisAngle(face, R(-0.5, 0.5));
      const at = center.clone().addScaledVector(up, -s * 0.5);
      cards.push({ at, up, face, size: s, tile: TILE_FAR });
    }
  }
  return cards;
}

// One species / variant: [lod0, lod1, lod2] geometries (lod 2 only for variant 0)
function buildTreeGeometries(speciesIndex, variant, tileMeters) {
  const sp = SPECIES[speciesIndex];
  const seed = 7919 * (speciesIndex + 1) + 104729 * (variant + 1);
  const branches = growTree(sp, seed);

  // Crown from the full-detail foliage: card anchors pushed out by half a card
  const rngC = mulberry32(seed ^ 0x5bd1e995);
  const tips = [];
  for (const b of branches) if (b.level === 3) tips.push(b.pts[b.pts.length - 1]);
  const roughCrown = (sp.conifer ? makeCone : makeCrown)(tips);
  const cards0 = placeCards(sp, branches, 0, tileMeters, rngC, roughCrown);
  const pts = [];
  for (const c of cards0) {
    pts.push(c.at.clone().addScaledVector(c.up, c.size * 0.5));
    pts.push(c.at.clone().addScaledVector(c.up, c.size));
  }
  const crown = (sp.conifer ? makeCone : makeCrown)(pts);

  const geos = [];
  const levels = variant === 0 ? [0, 1, 2] : [0, 1];
  for (const lod of levels) {
    const gb = new TreeGeometryBuilder();
    const rng = mulberry32(seed + lod * 31337);
    const aoAt = (p) => crown.barkAO(p);
    // Bark: lod 0 everything, lod 1 trunk + limbs + branches (coarser), lod 2 trunk + limbs as thin prisms
    for (const b of branches) {
      if (lod === 0) {
        const radial = [9, 6, 4, 3][b.level];
        addTube(gb, b, radial, 1, aoAt, swayWeight);
      } else if (lod === 1 && b.level <= (sp.conifer ? 0 : 2)) {
        addTube(gb, b, sp.conifer ? 6 : [6, 5, 3][b.level], 2, aoAt, swayWeight);
      } else if (lod === 2 && b.level <= (sp.conifer ? 0 : 1)) { // (a conifer's limbs hide behind its cards)
        addTube(gb, b, b.level === 0 ? 5 : 3, b.level === 0 ? 4 : 6, aoAt, swayWeight);
      }
    }
    // Close trees add the coarse branch cards and the whole-crown shell on top of the twig cards, so a crown seen
    // from above (helicopter) stays as full as the distant levels
    // (a conifer's crossed whole-tree cards would show as flat sheets up close: its near levels do without them)
    const cards = lod === 0
      ? [...cards0, ...placeCards(sp, branches, 1, tileMeters, rng, crown), ...(sp.conifer ? [] : placeCards(sp, branches, 2, tileMeters, rng, crown))]
      : placeCards(sp, branches, lod, tileMeters, rng, crown);
    for (const c of cards) addCard(gb, c.at, c.up, c.face, c.size, c.tile, rng() < 0.5, rng(), crown);
    const g = gb.build();
    g.userData = { species: sp.name, variant, lod, cards: cards.length, triangles: gb.idx.length / 3 };
    geos[lod] = g;
  }
  return geos;
}

// =====================================================================================================================
// 5. TREE FIELD: per-tree level of detail, with spatial cells culled separately in the view and shadow passes
// =====================================================================================================================
// Cell size per level: the near trees in small cells, culled closely; the farther levels, each tree a few cards, in
// larger ones (a mesh per cell, species & variant: the distant cells would otherwise cost hundreds of draws a frame)
const TREE_CELL_SIZE = [200, 400, 1200];
const LOD_NEAR = 105 * QUALITY.treeDetail; // full detail within (m)
const LOD_MID = 420 * QUALITY.treeDetail; // coarse cards & branches within; whole-crown cards beyond
const LOD_HYSTERESIS = 6;
// Draw distance per tier (0 park & plaza, 1 avenue & esplanade, 2 cross-street); at street level everything beyond
// LOW_CUTOFF is behind the buildings anyway
const MAX_DIST = [3000, 1600, 950];
const LOW_CUTOFF = 1150;

// Close-up models baked from EZ-Tree (assets/trees, tools/bake-ez-trees.mjs) take over the near level of the spruce,
// larch, maple and birch once loaded; until then (or without them) the procedural models stand in. The conifers come in
// height classes, picked by the tree's actual height: a young tree feathered to the ground, a full-grown one, a tall
// forest tree with a long clear stem, and (spruce) an old one with its top broken off
const BAKED_SHAPES = { spruce: ['young', 'medium', 'tall', 'broken'], larch: ['young', 'medium', 'tall'], maple: ['any', 'any'], birch: ['any', 'any'] };
const BAKED_URL = new URL('../assets/trees/ez-trees.json', import.meta.url);

function nearVariant(sp, scale, r, variant) {
  const shapes = BAKED_SHAPES[sp.name];
  if (!shapes || shapes[0] === 'any') return variant;
  if (shapes.includes('broken') && scale > 0.85 && r < 0.08) return shapes.indexOf('broken');
  return scale < 0.62 ? 0 : scale < 1.0 ? 1 : 2;
}

// One baked model (ez-trees.json entry) as a tree geometry: dequantised, its leaf cards mapped into the species' tile
function bakedGeometry(m, bin) {
  const n = m.vertices;
  const p16 = new Int16Array(bin, m.position, n * 3);
  const n8 = new Int8Array(bin, m.normal, n * 3);
  const uv16 = new Uint16Array(bin, m.uv, n * 2);
  const a8 = new Uint8Array(bin, m.aTree, n * 4);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uvs = new Float32Array(n * 2), attr = new Float32Array(n * 4);
  for (let i = 0; i < n * 3; i++) {
    const a = i % 3;
    pos[i] = m.min[a] + ((p16[i] + 32768) / 65535) * (m.max[a] - m.min[a]);
    nrm[i] = n8[i] / 127;
  }
  for (let i = 0; i < n * 4; i++) attr[i] = a8[i] / 255;
  const [ox, oy] = tileOrigin(m.tile);
  const span = TILE - 2 * GUTTER;
  for (let i = 0; i < n; i++) {
    const u = (uv16[i * 2] / 65535) * m.uvMax, v = (uv16[i * 2 + 1] / 65535) * m.uvMax;
    const leaf = a8[i * 4] > 127;
    uvs[i * 2] = leaf ? (ox + GUTTER + u * span) / ATLAS_SIZE : u;
    uvs[i * 2 + 1] = leaf ? (oy + TILE - GUTTER - v * span) / ATLAS_SIZE : v;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('aTree', new THREE.BufferAttribute(attr, 4));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, m.index, m.indexCount).slice(), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData = { species: m.species, shape: m.shape, lod: 0, cards: m.cards, triangles: m.triangles, baked: true };
  return g;
}

async function loadBakedTrees() {
  const manifest = await (await fetch(BAKED_URL)).json();
  const bin = await (await fetch(new URL('ez-trees.bin', BAKED_URL))).arrayBuffer();
  return manifest.models.map((m) => bakedGeometry(m, bin));
}

// The two variants of a level in one geometry (one draw per cell & species instead of two; for small geometries): aTree.w (the card's
// flutter phase, 0..1) is raised by 4 on variant 0's vertices and by 2 on variant 1's, and the tree material collapses
// the vertices of the variant a tree doesn't use (its own variant: aTreeData.w's fraction past 0.5, see createTreeField)
function mergeVariants(a, b) {
  const g = new THREE.BufferGeometry();
  const na = a.attributes.position.count;
  for (const name of Object.keys(a.attributes)) {
    const A = a.attributes[name], B = b.attributes[name], size = A.itemSize;
    const arr = new Float32Array((A.count + B.count) * size);
    arr.set(A.array, 0);
    arr.set(B.array, A.count * size);
    if (name === 'aTree') for (let v = 0; v < A.count + B.count; v++) arr[v * 4 + 3] += v < na ? 4 : 2;
    g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const ia = a.index.array, ib = b.index.array, n = na + b.attributes.position.count;
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(ia.length + ib.length);
  idx.set(ia, 0);
  for (let k = 0; k < ib.length; k++) idx[ia.length + k] = ib[k] + na;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData = { ...a.userData, variant: 'both', triangles: (ia.length + ib.length) / 3 };
  return g;
}

/** Whether the tree at site `t` is planted on this device profile (js/quality.js: a share of the park and forest trees,
 *  tier 0, on the mobile one; every street tree). city-grid.js drops the others' sites at once. */
export function plantedTree(t) {
  return plantedAt(t.x, t.z, t.tier || 0);
}
/** The same asked before a site exists: the woods' sites a phone would drop are then never checked or made */
export function plantedAt(x, z, tier = 0) {
  return QUALITY.treeShare >= 1 || tier !== 0 || hashPos(x, 8.8, z) < QUALITY.treeShare;
}

function hashPos(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Builds the instanced tree field for `sites` ({ x, y, z, scale, species, yaw?, sx?, sz?, tier? }) and keeps each
 * tree's level of detail up to date from the camera of every view pass (scene.onBeforeRender). Returns
 * { group, material, atlas, update(cameraPosition) }.
 */
function createTreeField(scene, sites) {
  // Debug: ?treegallery plants a row of every species (two sizes each) on the meadow by the Dischmastrasse
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('treegallery')) {
    sites = [...sites, ...SPECIES.flatMap((sp, k) => [0, 1].map((v) => ({ x: 700 + k * 11, z: -1060 + v * 14, y: 0, scale: v ? 0.6 : 1, species: k, yaw: k })))];
    // (and every baked close-up model, a row per species out on the meadow)
    sites.push(...SPECIES.flatMap((sp, k) => (BAKED_SHAPES[sp.name] || []).map((_, j) => ({ x: 690 + k * 14, z: -950 + j * 14, y: 0, scale: 1, species: k, yaw: k, near: j }))));
  }
  // The mobile profile (js/quality.js) plants a share of the park and forest trees (tier 0, the bulk of them), and
  // draws all trees over shorter distances; the street trees all stand
  if (QUALITY.treeShare < 1) sites = sites.filter(plantedTree);
  const maxDist = MAX_DIST.map((d) => d * QUALITY.treeDistance), lowCutoff = LOW_CUTOFF * QUALITY.treeDistance;
  const group = new THREE.Group();
  group.name = 'Trees';
  // The instances are repacked from `mats` whenever their level of detail changes, so the trees stand on the terrain
  // in `mats` already (sites come with flat-world heights) and placeOnTerrain must leave the field alone
  group.userData.terrain = 'absolute';
  group.visible = !skipped('trees'); // (?qset=skip:trees: planted, never drawn)
  const atlas = createLeafAtlas();
  const material = createTreeMaterial(atlas.texture);
  // Davos additions on top of the shared tree material (tsl-materials.js):
  //  - bark: white birch bark with dark lenticels and black patches; smooth grey maple bark (instead of the plane's)
  //  - winter (season.js): the broadleaves, shrubs and larches stand bare — their cards keep only the twigs (atlas b
  //    channel) and a sparse share of brown remnants (larch: a grey-brown haze of needleless twigs), the evergreen
  //    conifers keep their needles; snow caught on the upward faces of what remains
  if (material.colorNode) {
    const base = material.colorNode;
    const aTree = attribute('aTree', 'vec4'), aData = attribute('aTreeData', 'vec4');
    const isLeaf = aTree.x, species = floor(aData.w);
    const is = (k) => step(k - 0.5, species).mul(step(species, k + 0.5));
    const leafTex = texture(atlas.texture, uv());
    // Bark
    const bu = uv();
    const lenticel = smoothstep(0.62, 0.7, mx_noise_float(vec2(bu.x.mul(2.2), bu.y.mul(14)))).mul(0.85);
    const patch = smoothstep(0.55, 0.75, mx_noise_float(bu.mul(vec2(1.4, 0.8)))).mul(0.7);
    const birchBark = mix(vec3(0.78, 0.77, 0.73), vec3(0.04, 0.04, 0.04), lenticel.max(patch));
    const mapleBark = mix(vec3(0.24, 0.23, 0.21), vec3(0.34, 0.33, 0.3), mx_noise_float(bu.mul(vec2(3, 1.5))).mul(0.5).add(0.5));
    const isBark = float(1).sub(isLeaf);
    let rgb = mix(base.rgb, birchBark, isBark.mul(is(6)));
    rgb = mix(rgb, mapleBark, isBark.mul(is(0)));
    // Bare in winter
    const deciduous = is(0).add(is(1)).add(is(2)).add(is(4)).add(is(6)).add(is(7)).min(1);
    const bare = winter.mul(deciduous).mul(isLeaf);
    const twig = smoothstep(0.35, 0.7, leafTex.b);
    const remnant = step(leafTex.g, mix(float(0.1), float(0.32), is(4))); // a few dry leaves; the larch's twig haze
    const keep = twig.max(remnant);
    rgb = mix(rgb, mix(vec3(0.16, 0.13, 0.1), vec3(0.2, 0.17, 0.13), leafTex.r), bare.mul(float(1).sub(twig)).mul(remnant));
    const alpha = mix(float(frontFacing), leafTex.a.mul(mix(float(1), keep, bare)), isLeaf);
    material.colorNode = vec4(snowyRoof(rgb, 0.6), alpha);
    material.maskShadowNode = alpha.greaterThan(0.5);
  }

  // Geometries: [species][variant][lod]
  const geos = SPECIES.map((_, s) => [0, 1].map((v) => buildTreeGeometries(s, v, atlas.tileMeters)));

  // Per-tree transform & data
  const N = sites.length;
  const mats = new Float32Array(N * 16);
  const data = new Float32Array(N * 4);
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const pz = new Float32Array(N);
  const meshOf = new Int32Array(N * 3); // mesh index per level
  const cellOf = new Array(N * 3); // cell per level
  const tier = new Uint8Array(N);
  const lod = new Uint8Array(N).fill(255);

  // Shared geometry types: lod 0 & 1 per species & variant, lod 2 per species
  const types = [];
  const makeType = (geo, name) => {
    const height = Math.max(Math.abs(geo.boundingBox.min.y), Math.abs(geo.boundingBox.max.y));
    // The material adds wind after the instance transform: height-squared lean/rock, plus bob and flutter.
    const windPadding = Math.hypot(0.2, 0.06) * Math.hypot(0.86, 0.51) * (height / 11) ** 2 + 2;
    const type = { geo, name, windPadding, meshes: [] };
    types.push(type);
    return type;
  };
  const meshIndex = SPECIES.map((sp, s) => ({
    l0: (BAKED_SHAPES[sp.name] || [0, 1]).map((_, v) => makeType(geos[s][v % 2][0], `Trees_${sp.name}_v${v}_lod0`)),
    // (the conifers' middle level, a few dozen triangles, with both variants in one geometry; the broadleaves' are
    // ten times the size, too many to carry twice: past 105 m, turned, scaled and tinted per tree, one variant does)
    l1: [sp.conifer ? makeType(mergeVariants(geos[s][0][1], geos[s][1][1]), `Trees_${sp.name}_lod1`) : makeType(geos[s][0][1], `Trees_${sp.name}_v0_lod1`)],
    l2: makeType(geos[s][0][2], `Trees_${sp.name}_lod2`)
  }));
  const cells = new Map();
  const meshes = [];

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  sites.forEach((t, i) => {
    // (the species mix is chosen where the trees are planted: city-grid.js, by place and altitude)
    const sp = Math.min(SPECIES.length - 1, Math.max(0, t.species || 0));
    const r1 = hashPos(t.x, 1.3, t.z);
    const r2 = hashPos(t.z, 7.1, t.x);
    const r3 = hashPos(t.x + t.z, 3.3, 0.7);
    const variant = hashPos(t.x, 5.9, t.z) < 0.5 ? 0 : 1;
    const s = t.scale * (0.9 + r1 * 0.2);
    const ground = surfaceHeight(t.x, t.z);
    dummy.position.set(t.x, ground + (t.y || 0), t.z);
    dummy.rotation.set(0, t.yaw ?? r2 * Math.PI * 2, 0);
    dummy.scale.set(s * (0.9 + r3 * 0.2) * (t.sx || 1), s * (0.88 + r1 * 0.24), s * (0.9 + r2 * 0.2) * (t.sz || 1));
    dummy.updateMatrix();
    dummy.matrix.toArray(mats, i * 16);
    tint.setHex(SPECIES[sp].tints[Math.floor(r3 * 2.999)]).multiplyScalar(0.82 + r1 * 0.36);
    // w: species + (variant 1: 0.5) + a random fraction (the middle level's variant, see mergeVariants)
    data[i * 4] = tint.r; data[i * 4 + 1] = tint.g; data[i * 4 + 2] = tint.b; data[i * 4 + 3] = sp + variant * 0.5 + r2 * 0.499;
    px[i] = t.x;
    py[i] = ground + (t.y || 0) + 6 * s;
    pz[i] = t.z;
    tier[i] = Math.min(2, t.tier || 0);
    const mi = meshIndex[sp];
    const near = mi.l0[t.near ?? nearVariant(SPECIES[sp], s, r1, variant)];
    // (cells looked up by number; the name only made once a cell is: ~200,000 strings at the start otherwise)
    for (let l = 0; l < 3; l++) {
      const size = TREE_CELL_SIZE[l], cx = Math.floor(t.x / size), cz = Math.floor(t.z / size);
      let cell = cells.get((l * 200000 + cx + 100000) * 200000 + cz + 100000);
      if (!cell) {
        const key = l + ':' + cx + ',' + cz;
        const cellGroup = new THREE.Group();
        cellGroup.name = `TreeCell_${key}`;
        cellGroup.visible = false;
        group.add(cellGroup);
        cell = { group: cellGroup, level: l, trees: [], meshes: new Map(), key };
        cells.set((l * 200000 + cx + 100000) * 200000 + cz + 100000, cell);
      }
      cell.trees.push(i);
      cellOf[i * 3 + l] = cell;
      const type = l === 0 ? near : l === 1 ? mi.l1[0] : mi.l2;
      let index = cell.meshes.get(type);
      if (index === undefined) {
        index = meshes.length;
        meshes.push({ type, cell, name: `${type.name}_${cell.key}`, capacity: 0 });
        cell.meshes.set(type, index);
      }
      meshOf[i * 3 + l] = index;
      meshes[index].capacity++;
    }
  });

  // The InstancedMeshes themselves are made on first use too (meshFor): ~20 000 slots (cells x species x variants x
  // levels) of which a few hundred ever show from one place; each one made up front cost ~2 KB of objects
  const instanced = new Array(meshes.length).fill(null);
  let template = null; // the first mesh made: its instance attribute class (main.js makes it a storage attribute on WebGPU)
  let farShadows = true; // whether the whole-crown level casts shadows (setFarShadows)
  function meshFor(mi) {
    if (instanced[mi]) return instanced[mi];
    const m = meshes[mi];
    const geo = new THREE.BufferGeometry();
    for (const name of Object.keys(m.type.geo.attributes)) geo.setAttribute(name, m.type.geo.attributes[name]);
    geo.setIndex(m.type.geo.index);
    geo.boundingSphere = m.type.geo.boundingSphere;
    geo.boundingBox = m.type.geo.boundingBox;
    // Static usage on purpose: three.js re-uploads a DynamicDrawUsage attribute in every render pass of every frame
    // (both shadow cascades + the scene pass, ~7 MB/frame here). rebuild() uploads just the instances in use, and only
    // when the levels change.
    // The instance buffers (m.capacity instances) are only allocated once the mesh first has trees to draw (allocate,
    // in rebuild): every tree has a slot at each of the three levels, but stands at one level at most, and most cells
    // never show some of theirs (~40 MB of the 60 MB of buffers stayed empty)
    geo.setAttribute('aTreeData', new THREE.InstancedBufferAttribute(new Float32Array(0), 4));
    geo.userData = m.type.geo.userData;
    const mesh = new THREE.InstancedMesh(geo, material, 0);
    if (template) mesh.instanceMatrix = new template.instanceMatrix.constructor(new Float32Array(0), 16);
    else template = mesh;
    mesh.name = m.name;
    mesh.count = 0;
    mesh.visible = false;
    mesh.castShadow = m.cell.level < 2 || farShadows;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
    // (every mesh of a geometry type shares its pipeline: main.js precompiles one of them)
    if (m.type.meshes.length) mesh.userData.sharesPipelineWith = m.type.meshes[0];
    m.cell.group.add(mesh);
    mesh.updateMatrixWorld(true);
    m.type.meshes.push(mesh);
    instanced[mi] = mesh;
    return mesh;
  }
  const counts = new Array(meshes.length).fill(0);

  // A mesh's instance buffers at its full capacity, on first use (the instance matrix keeps the attribute class main.js
  // gave it: a storage attribute on WebGPU)
  function allocate(mi) {
    const mesh = meshFor(mi), cap = meshes[mi].capacity;
    if (mesh.instanceMatrix.count >= cap) return;
    mesh.instanceMatrix = new mesh.instanceMatrix.constructor(new Float32Array(cap * 16), 16);
    mesh.geometry.setAttribute('aTreeData', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
  }

  // Repack only cells whose trees changed level; the meshes and their buffer capacities stay fixed.
  const dirtyCells = new Set();
  // A clearing (setClearing): the trees in it are left out, e.g. round the tower crane while its driver works (the
  // crowns stood between the camera and the load)
  const cleared = new Uint8Array(N);
  function rebuild() {
    for (const cell of dirtyCells) {
      for (const mi of cell.meshes.values()) counts[mi] = 0;
      const l = cell.level;
      for (const i of cell.trees) {
        if (lod[i] !== l || cleared[i]) continue;
        const mi = meshOf[i * 3 + l];
        const c = counts[mi]++;
        if (c === 0) allocate(mi);
        const mesh = instanced[mi];
        mesh.instanceMatrix.array.set(mats.subarray(i * 16, i * 16 + 16), c * 16);
        mesh.geometry.attributes.aTreeData.array.set(data.subarray(i * 4, i * 4 + 4), c * 4);
      }
      let visible = false;
      for (const mi of cell.meshes.values()) {
        const mesh = instanced[mi];
        if (!mesh) continue;
        const n = counts[mi];
        mesh.count = n;
        mesh.visible = n > 0;
        if (n > 0) {
          visible = true;
          // main.js swaps instanceMatrix for a storage attribute: look it up here on every changed cell.
          for (const attr of [mesh.instanceMatrix, mesh.geometry.attributes.aTreeData]) {
            attr.clearUpdateRanges();
            attr.addUpdateRange(0, n * attr.itemSize);
            attr.needsUpdate = true;
          }
          mesh.computeBoundingSphere();
          mesh.boundingSphere.radius += meshes[mi].type.windPadding;
        }
      }
      // Hidden cells avoid traversing all their dormant species/variant/LOD meshes in every render pass.
      cell.group.visible = visible;
    }
    dirtyCells.clear();
  }

  // Levels from the camera position (3D distance to mid-crown), with hysteresis at every boundary
  const last = new V3(Infinity, Infinity, Infinity);
  const cam = new V3();
  function update(position) {
    cam.copy(position);
    if (cam.distanceToSquared(last) < 16) return false;
    last.copy(cam);
    const low = cam.y < 40;
    let changed = false;
    for (let i = 0; i < N; i++) {
      const dx = px[i] - cam.x;
      const dy = py[i] - cam.y;
      const dz = pz[i] - cam.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const maxD = low ? Math.min(maxDist[tier[i]], lowCutoff) : maxDist[tier[i]];
      // levels 0-2, 3 = hidden; next to a boundary a tree keeps the level it has
      const curL = lod[i] === 255 ? 3 : lod[i];
      let nextL = d < LOD_NEAR ? 0 : d < LOD_MID ? 1 : d < maxD ? 2 : 3;
      if (Math.abs(nextL - curL) === 1) {
        const edge = [LOD_NEAR, LOD_MID, maxD][Math.min(nextL, curL)];
        if (Math.abs(d - edge) < LOD_HYSTERESIS) nextL = curL;
      }
      const next = nextL === 3 ? 255 : nextL;
      if (next !== lod[i]) {
        if (lod[i] !== 255) dirtyCells.add(cellOf[i * 3 + lod[i]]);
        if (next !== 255) dirtyCells.add(cellOf[i * 3 + next]);
        lod[i] = next;
        changed = true;
      }
    }
    if (changed) rebuild();
    return changed;
  }

  // Follow the view camera of every scene render (shadow cascades are orthographic and keep the view's levels)
  const viewPos = new V3();
  const prevBeforeRender = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, scn, camera, target) {
    prevBeforeRender.call(this, renderer, scn, camera, target);
    if (camera.isOrthographicCamera === true || camera.isArrayCamera === true) return;
    update(viewPos.setFromMatrixPosition(camera.matrixWorld));
  };

  // Levels for the start-up view (Midtown, 5th Ave), so the precompile pass sees the tree meshes
  update(new V3(0, 10, 140));

  // Precompile one visible representative per geometry; the other cells use exactly the same pipeline.
  for (const type of types) {
    const representative = type.meshes.find((mesh) => mesh.visible) || type.meshes[0];
    for (const mesh of type.meshes) {
      if (mesh !== representative) mesh.userData.sharesPipelineWith = representative;
      else delete mesh.userData.sharesPipelineWith;
    }
  }

  // Tree placements are world-space instance matrices; the field, cells and meshes keep identity transforms.
  // Freezing both avoids recomputing thousands of dormant objects in every view and shadow pass.
  group.traverse((object) => {
    object.matrixAutoUpdate = false;
    object.matrixWorldAutoUpdate = false;
  });

  // The baked close-up models, once loaded: swapped into the near-level meshes (which keep their instance data)
  const baked = { loaded: false, models: 0 };
  // (?proceduraltrees keeps the procedural models, for comparison)
  if (typeof fetch !== 'undefined' && !(typeof location !== 'undefined' && new URLSearchParams(location.search).has('proceduraltrees'))) {
    loadBakedTrees().then((models) => {
      SPECIES.forEach((sp, s) => {
        const own = models.filter((g) => g.userData.species === sp.name);
        meshIndex[s].l0.forEach((type, v) => {
          const geo = own[v];
          if (!geo) return;
          type.geo = geo;
          const height = geo.boundingBox.max.y;
          type.windPadding = Math.hypot(0.2, 0.06) * Math.hypot(0.86, 0.51) * (height / 11) ** 2 + 2;
          for (const mesh of type.meshes) {
            const g = new THREE.BufferGeometry();
            for (const name of Object.keys(geo.attributes)) g.setAttribute(name, geo.attributes[name]);
            g.setAttribute('aTreeData', mesh.geometry.attributes.aTreeData);
            g.setIndex(geo.index);
            g.boundingSphere = geo.boundingSphere;
            g.boundingBox = geo.boundingBox;
            g.userData = geo.userData;
            mesh.geometry = g;
          }
          baked.models++;
        });
      });
      baked.loaded = true;
      for (const cell of cells.values()) dirtyCells.add(cell);
      rebuild();
    }).catch((err) => console.warn('[trees] baked close-up models unavailable, procedural ones stay:', err));
  }

  const stats = {
    baked,
    trees: N,
    triangles: geos.map((v) => v.map((l) => l.map((g) => g && g.userData.triangles))),
    cards: geos.map((v) => v.map((l) => l.map((g) => g && g.userData.cards)))
  };
  // Whether the whole-crown level (beyond LOD_MID) casts shadows, for the meshes made so far and those made later
  function setFarShadows(on) {
    farShadows = on;
    for (let mi = 0; mi < meshes.length; mi++) if (instanced[mi] && meshes[mi].cell.level === 2) instanced[mi].castShadow = on;
  }

  /** Leaves out the trees within r of (x, z) (null: all trees back) */
  function setClearing(c) {
    for (let i = 0; i < N; i++) {
      const out = c && (px[i] - c.x) ** 2 + (pz[i] - c.z) ** 2 < c.r * c.r ? 1 : 0;
      if (out === cleared[i]) continue;
      cleared[i] = out;
      if (lod[i] !== 255) dirtyCells.add(cellOf[i * 3 + lod[i]]);
    }
    rebuild();
  }

  // (meshes: those made so far)
  const field = { group, material, atlas, update, meshes: instanced.filter(Boolean), setFarShadows, setClearing, stats };
  group.userData.field = field; // (found by name: scene.getObjectByName('Trees'))
  return field;
}

// (makeCrown & makeCone also shade the baked EZ-Tree models: tools/bake-ez-trees.mjs)
export { createTreeField, createLeafAtlas, buildTreeGeometries, makeCrown, makeCone, SPECIES as TREE_SPECIES, SPECIES_INDEX, SPECIES_HEIGHT };
