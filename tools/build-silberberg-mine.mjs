// Builds assets/silberberg/<adit>.bin, the Silberberg mine's galleries for js/missions-mine.js, from the laser scans of
// the Institut Geomatik FHNW (https://www.fhnw.ch/plattformen/geo/potree/silberberg/: the Dalvazzer- and the
// Hilfsstollen, surveyed in a course in 2023; Potree 2.0 point clouds in LV95 / LN02 with colour).
//
//   1. the coarse levels of each cloud's octree (HTTP range requests on its hierarchy.bin and octree.bin; cached under
//      tools/data/cache/silberberg/): a few hundred thousand points on the walls, 5–7 cm apart;
//   2. into voxels (VOX m) in a frame turned along the gallery: a voxel with points is rock (its points' mean colour
//      kept); the free space is flooded from the adit's stations (FHNW's annotations) through the voxels at least
//      R voxels from the rock — the holes in the scan smaller than that stay closed — and grown back by R: the air.
//      A barrier just outside the portal keeps the flood in the mountain (nothing of the hillside outside);
//   3. the air's boundary as a closed mesh (surface nets on the air mask, blurred: smooth rock, no cracks — seen from
//      the inside, there is nothing behind it to see), each vertex coloured from the rock voxels next to it; the cut
//      at the portal's barrier marked as daylight (the colour's fourth byte); simplified (meshoptimizer);
//   4. the floor the miner walks on: from the portal, over the columns of air with headroom, steps of at most STEP —
//      a grid of floor and ceiling heights; the rails: the shortest way from the portal to the far end through the
//      middle of the gallery, smoothed.
//
// Everything in the world frame (x = E − 2782500, z = 1185500 − N, y = H − 1558), relative to the portal's floor.
// Usage: node tools/build-silberberg-mine.mjs [adit…]   (default: all; DEBUG_PNG=1 writes plan images to the cache)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from '../node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, 'tools/data/cache/silberberg');
const OUT = path.join(root, 'assets/silberberg');
const BASE = 'https://www.fhnw.ch/plattformen/geo/potree/silberberg/pointclouds/';
const toWorld = (E, N, H) => [E - 2782500, H - 1558, 1185500 - N];

export const ADITS = {
  dalvazzer: {
    cloud: 'Dalvazzerstollen', level: 3, vox: 0.2,
    // (the walkway from the Pochhaus ends at the portal; the gallery runs north-east, the stope above and below it)
    portal: [2776582.426, 1174336.674, 1506.418], out: [-0.78, -0.62],
    outside: true, // (nothing of the mine beyond the portal's plane: all of it is the hillside)
    stations: {
      portal: [2776582.426, 1174336.674, 1506.418],
      barbara: [2776589.361, 1174340.466, 1505.004],
      end: [2776606.614, 1174356.074, 1506.843]
    },
    crop: [2776570, 1174325, 1503, 2776621, 1174378, 1514],
    // (the mine's outline, drawn on the scan: the gallery and the stope beside it, not the cliff and the forest round
    // the portal, nor what lies beyond the scan's end, where the gallery goes on)
    keep: [[2776579.6, 1174337.1], [2776583.0, 1174341.2], [2776588.4, 1174346.0], [2776592.0, 1174349.6], [2776596.2, 1174359.8],
      [2776599.8, 1174361.6], [2776604.6, 1174361.0], [2776611.8, 1174358.2], [2776612.4, 1174354.0], [2776602.2, 1174346.6],
      [2776591.4, 1174337.6], [2776585.6, 1174331.0], [2776583.0, 1174332.0]],
    // the visitors' walkway: [u (m from the portal towards the far end), w (m to the left), floor y (m from the portal
    // station)] — read off the scan's floors: in at the portal's level, the stairs down at 7–9 m, the footbridge
    walk: { half: 0.45, pts: [[-1, -0.3, -0.4], [6.5, -0.4, -0.6], [8.8, -0.4, -1.7], [20, -0.5, -1.7], [26, -0.6, -1.8], [31.5, 0.1, -1.8]] }
  },
  hilfsstollen: {
    cloud: 'Hilfsstollen', level: 5, vox: 0.2,
    portal: [2776638.58, 1174418.271, 1559.538], out: [-0.6, -0.8],
    stations: {
      portal: [2776638.58, 1174418.271, 1559.538],
      y1813: [2776729.922, 1174488.116, 1560.456],
      crossing: [2776753.139, 1174506.46, 1560.127],
      y1818: [2776787.456, 1174515.553, 1559.992],
      end: [2776893.362, 1174624.262, 1562.426]
    },
    crop: [2776625, 1174395, 1550, 2776900, 1174635, 1570]
  }
};

const R = 2; // voxels: the flood keeps this far from the rock (scan holes up to ~2R voxels stay closed)
const HEAD = Number(process.env.HEAD || 0.8); // m of air over a floor the miner stands on (the galleries narrow towards the floor and the roof: measured at the hips; the eye ducks under a low roof)
const STEP = Number(process.env.STEP || 0.45); // m: the highest step between neighbouring floor columns
const HOLE = 1.2; // m²: the largest island of rock in the floor that is filled in (see finish)
const ENCL = 10; // m: how far the flood looks for rock round it (see buildAdit)

// --- Potree 2.0 ------------------------------------------------------------------------------------------------------
async function range(url, off, size) {
  for (let t = 0; ; t++) {
    try {
      const r = await fetch(url, { headers: { Range: `bytes=${off}-${off + size - 1}` } });
      if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length !== size) throw new Error(`short read ${b.length}/${size}`);
      return b;
    } catch (e) {
      if (t >= 4) throw e;
      await new Promise((ok) => setTimeout(ok, 600 * (t + 1)));
    }
  }
}

/** The points of a cloud down to an octree level: { xyz: Float64Array (LV95), rgb: Uint8Array } (cached) */
async function loadCloud(name, maxLevel) {
  const dir = path.join(CACHE, name);
  fs.mkdirSync(dir, { recursive: true });
  const fx = path.join(dir, `pts-L${maxLevel}.f64`), fc = path.join(dir, `rgb-L${maxLevel}.u8`);
  if (fs.existsSync(fx) && fs.existsSync(fc)) {
    const b = fs.readFileSync(fx);
    return { xyz: new Float64Array(b.buffer, b.byteOffset, b.length / 8), rgb: new Uint8Array(fs.readFileSync(fc)) };
  }
  const base = BASE + name + '/';
  const meta = await (await fetch(base + 'metadata.json')).json();
  const nodes = [];
  const chunk = async (off, size, level0) => {
    const b = await range(base + 'hierarchy.bin', off, size);
    const levels = [level0];
    for (let i = 0; i < size / 22; i++) {
      const p = i * 22, type = b[p], mask = b[p + 1], num = b.readUInt32LE(p + 2);
      const bo = Number(b.readBigUInt64LE(p + 6)), bs = Number(b.readBigUInt64LE(p + 14));
      const lv = levels[i];
      for (let c = 0; c < 8; c++) if (mask & (1 << c)) levels.push(lv + 1);
      if (type === 2) { if (lv <= maxLevel) await chunk(bo, bs, lv); } else if (lv <= maxLevel && num) nodes.push({ num, bo, bs });
    }
  };
  await chunk(0, meta.hierarchy.firstChunkSize, 0);
  const stride = meta.attributes.reduce((a, x) => a + x.size, 0);
  let rgbOff = 0;
  for (const a of meta.attributes) { if (a.name === 'rgb') break; rgbOff += a.size; }
  const total = nodes.reduce((a, n) => a + n.num, 0);
  const xyz = new Float64Array(total * 3), rgb = new Uint8Array(total * 3);
  const [sx, sy, sz] = meta.scale, [ox, oy, oz] = meta.offset;
  let k = 0, done = 0;
  const queue = [...nodes];
  const worker = async () => {
    while (queue.length) {
      const nd = queue.shift();
      const b = await range(base + 'octree.bin', nd.bo, nd.bs);
      for (let i = 0; i < nd.num; i++) {
        const p = i * stride, j = k++;
        xyz[j * 3] = b.readInt32LE(p) * sx + ox; xyz[j * 3 + 1] = b.readInt32LE(p + 4) * sy + oy; xyz[j * 3 + 2] = b.readInt32LE(p + 8) * sz + oz;
        const r = b.readUInt16LE(p + rgbOff), g = b.readUInt16LE(p + rgbOff + 2), bl = b.readUInt16LE(p + rgbOff + 4);
        const sc = Math.max(r, g, bl) > 255 ? 257 : 1;
        rgb[j * 3] = r / sc; rgb[j * 3 + 1] = g / sc; rgb[j * 3 + 2] = bl / sc;
      }
      process.stderr.write(`  ${name}: ${++done}/${nodes.length} nodes\r`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  process.stderr.write('\n');
  fs.writeFileSync(fx, Buffer.from(xyz.buffer));
  fs.writeFileSync(fc, Buffer.from(rgb.buffer));
  return { xyz, rgb };
}

// --- The voxels ------------------------------------------------------------------------------------------------------
function buildAdit(id, A, cloud) {
  const V = A.vox;
  const [pE, pN, pH] = A.portal;
  // the frame: u along the gallery (portal → far end), w across, y up; origin at the portal station
  const far = A.stations.end;
  const th = Math.atan2(far[1] - pN, far[0] - pE); // (in E/N)
  const cu = Math.cos(th), su = Math.sin(th);
  const toU = (E, N) => (E - pE) * cu + (N - pN) * su, toW = (E, N) => -(E - pE) * su + (N - pN) * cu;
  const [cE0, cN0, cH0, cE1, cN1, cH1] = A.crop;
  const n = cloud.xyz.length / 3;
  let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const keep = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const E = cloud.xyz[i * 3], N = cloud.xyz[i * 3 + 1], H = cloud.xyz[i * 3 + 2];
    if (E < cE0 || E > cE1 || N < cN0 || N > cN1 || H < cH0 || H > cH1) continue;
    keep[i] = 1;
    const u = toU(E, N), w = toW(E, N), y = H - pH;
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < w0) w0 = w; if (w > w1) w1 = w; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = (R + 4) * V;
  u0 -= pad; w0 -= pad; y0 -= pad; u1 += pad; w1 += pad; y1 += pad;
  const NU = Math.ceil((u1 - u0) / V), NW = Math.ceil((w1 - w0) / V), NY = Math.ceil((y1 - y0) / V);
  const NN = NU * NW * NY;
  console.log(`${id}: ${NU}×${NW}×${NY} voxels (${(NN / 1e6).toFixed(1)} M), θ ${(th * 180 / Math.PI).toFixed(1)}° u0 ${u0.toFixed(2)} w0 ${w0.toFixed(2)} y0 ${y0.toFixed(2)}`);
  const idx = (a, b, c) => (c * NW + b) * NY + a; // (a: u, b: w, c: y — y fastest)
  const I = (iu, iw, iy) => (iy * NW + iw) * NU + iu; // index layout: u fastest
  const solid = new Uint8Array(NN);
  const colSum = new Map(); // voxel → [r, g, b, count]
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    const E = cloud.xyz[i * 3], N = cloud.xyz[i * 3 + 1], H = cloud.xyz[i * 3 + 2];
    const iu = Math.floor((toU(E, N) - u0) / V), iw = Math.floor((toW(E, N) - w0) / V), iy = Math.floor((H - pH - y0) / V);
    const v = I(iu, iw, iy);
    solid[v] = 1;
    let c = colSum.get(v);
    if (!c) colSum.set(v, (c = [0, 0, 0, 0]));
    c[0] += cloud.rgb[i * 3]; c[1] += cloud.rgb[i * 3 + 1]; c[2] += cloud.rgb[i * 3 + 2]; c[3]++;
  }
  void idx;
  // the portal's barrier: a slab just outside the door, across the opening
  const oE = A.out[0], oN = A.out[1], ol = Math.hypot(oE, oN);
  const outU = (oE * cu + oN * su) / ol, outW = (-oE * su + oN * cu) / ol;
  const barrier = new Uint8Array(NN);
  const SLAB0 = 0.9, SLAB1 = 1.5;
  // (1: the portal's — daylight beyond it; 2: outside the mine's outline — rock)
  const slabs = [{ P: [0, 0], n: [outU, outW], s0: SLAB0, s1: A.outside ? 1e9 : SLAB1, lat: A.outside ? 1e9 : 4.5, kind: 1 }];
  const poly = A.keep?.map(([E, N]) => [toU(E, N), toW(E, N)]);
  const inPoly = (u, w) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ui, wi] = poly[i], [uj, wj] = poly[j];
      if ((wi > w) !== (wj > w) && u < ((uj - ui) * (w - wi)) / (wj - wi) + ui) c = !c;
    }
    return c;
  };
  if (poly) for (let iw = 0; iw < NW; iw++) for (let iu = 0; iu < NU; iu++) {
    if (inPoly(u0 + (iu + 0.5) * V, w0 + (iw + 0.5) * V)) continue;
    for (let iy = 0; iy < NY; iy++) barrier[I(iu, iw, iy)] = 2;
  }
  for (let iy = 0; iy < NY; iy++) for (let iw = 0; iw < NW; iw++) for (let iu = 0; iu < NU; iu++) {
    const u = u0 + (iu + 0.5) * V, w = w0 + (iw + 0.5) * V, y = y0 + (iy + 0.5) * V;
    for (const b of slabs) {
      const du = u - b.P[0], dw = w - b.P[1];
      const s = du * b.n[0] + dw * b.n[1], lat = Math.abs(-du * b.n[1] + dw * b.n[0]);
      if (s >= b.s0 && s <= b.s1 && lat < b.lat && (b.s1 > 1e8 || (y > -3 && y < 5))) barrier[I(iu, iw, iy)] = b.kind;
    }
  }
  // distance from the rock (voxel steps, 6-neighbour BFS, capped)
  const CAP = R + 1;
  const dist = new Uint8Array(NN).fill(CAP);
  let front = [];
  for (let v = 0; v < NN; v++) if (solid[v]) { dist[v] = 0; front.push(v); }
  const SU = 1, SW = NU, SY = NU * NW;
  const coords = (v) => { const iu = v % NU, r = (v - iu) / NU, iw = r % NW; return [iu, iw, (r - iw) / NW]; };
  const nbrs = (v, out) => {
    const [iu, iw, iy] = coords(v);
    out.length = 0;
    if (iu > 0) out.push(v - SU); if (iu < NU - 1) out.push(v + SU);
    if (iw > 0) out.push(v - SW); if (iw < NW - 1) out.push(v + SW);
    if (iy > 0) out.push(v - SY); if (iy < NY - 1) out.push(v + SY);
    return out;
  };
  const nb = [];
  for (let d = 1; d < CAP && front.length; d++) {
    const next = [];
    for (const v of front) for (const q of nbrs(v, nb)) if (dist[q] > d) { dist[q] = d; next.push(q); }
    front = next;
  }
  // enclosed: rock within ENCL m along at least 4 of the 6 axis directions (beyond the end of the scan, where the
  // gallery goes on unscanned, and out in the open there is no rock to be seen across: the flood stops there)
  const hits = new Uint8Array(NN);
  const L = Math.round(ENCL / V);
  for (const [stride, len, outer] of [[1, NU, NW * NY], [NU, NW, NU * NY], [NU * NW, NY, NU * NW]]) {
    for (let o = 0; o < outer; o++) {
      // (the line's first voxel: o spread over the other two axes)
      let b0;
      if (stride === 1) b0 = o * NU;
      else if (stride === NU) { const iu = o % NU, iy = (o - iu) / NU; b0 = iy * NU * NW + iu; }
      else b0 = o;
      let last = -1e9;
      for (let k = 0; k < len; k++) { const v = b0 + k * stride; if (solid[v]) last = k; else if (k - last <= L) hits[v]++; }
      last = 1e9;
      for (let k = len - 1; k >= 0; k--) { const v = b0 + k * stride; if (solid[v]) last = k; else if (last - k <= L) hits[v]++; }
    }
  }
  // the flood: from the stations, through voxels R clear of the rock, not through the barrier
  const core = new Uint8Array(NN);
  const queue = new Int32Array(NN);
  let qh = 0, qt = 0;
  const vox = (E, N, H) => [Math.floor((toU(E, N) - u0) / V), Math.floor((toW(E, N) - w0) / V), Math.floor((H - pH - y0) / V)];
  for (const [name, st] of Object.entries(A.stations)) {
    // (the portal's station stands in the door: the seed 2.5 m further in)
    const [E, N, H] = name === 'portal' ? [st[0] + 2.5 * cu, st[1] + 2.5 * su, st[2]] : st;
    // (the station's point may sit on the floor or a wall: the clear voxel nearest it, within a metre)
    const [cu_, cw_, cy_] = vox(E, N, H + 0.6);
    let best = -1, bd = Infinity;
    for (let dy = -5; dy <= 5; dy++) for (let dw = -5; dw <= 5; dw++) for (let du = -5; du <= 5; du++) {
      const iu = cu_ + du, iw = cw_ + dw, iy = cy_ + dy;
      if (iu < 0 || iw < 0 || iy < 0 || iu >= NU || iw >= NW || iy >= NY) continue;
      const v = I(iu, iw, iy), d = du * du + dw * dw + dy * dy;
      if (dist[v] >= R && hits[v] >= 4 && !barrier[v] && d < bd) { bd = d; best = v; }
    }
    if (best < 0) { console.warn(`  (a station without clear space near it: ${E}, ${N})`); continue; }
    if (!core[best]) { core[best] = 1; queue[qt++] = best; }
  }
  const parent = process.env.DEBUG_LEAK ? new Int32Array(NN).fill(-1) : null;
  while (qh < qt) {
    const v = queue[qh++];
    for (const q of nbrs(v, nb)) if (!core[q] && dist[q] >= R && hits[q] >= 4 && !barrier[q]) { core[q] = 1; queue[qt++] = q; if (parent) parent[q] = v; }
  }
  if (parent) {
    // the first voxel at the crop's edge the flood reached, and the way it came (LV95)
    for (let h = 0; h < qt; h++) {
      const v = queue[h];
      const [iu, iw, iy] = coords(v);
      if (!(iu < R + 4 || iw < R + 4 || iy < R + 4 || iu >= NU - R - 4 || iw >= NW - R - 4 || iy >= NY - R - 4)) continue;
      const way = [];
      for (let k = v; k >= 0; k = parent[k]) way.push(k);
      way.reverse();
      console.log(`  leak: ${way.length} steps`);
      for (let j = 0; j < way.length; j += Math.max(1, Math.floor(way.length / 40))) {
        const [a, b, c] = coords(way[j]);
        const u = u0 + (a + 0.5) * V, w = w0 + (b + 0.5) * V, y = y0 + (c + 0.5) * V;
        console.log(`   ${j}: E ${(pE + u * cu - w * su).toFixed(1)} N ${(pN + u * su + w * cu).toFixed(1)} H ${(pH + y).toFixed(1)} dist ${dist[way[j]]}`);
      }
      break;
    }
  }
  // (nothing at the grid's boundary: the mesh closes where the crop cuts the air)
  for (let v = 0; v < NN; v++) {
    const [iu, iw, iy] = coords(v);
    if (iu < 2 || iw < 2 || iy < 2 || iu >= NU - 2 || iw >= NW - 2 || iy >= NY - 2) { core[v] = 0; barrier[v] ||= 2; }
  }
  // the air: the core grown back by R (not into the rock, not through the barrier)
  const air = new Uint8Array(NN);
  front = [];
  for (let v = 0; v < NN; v++) if (core[v]) { air[v] = 1; front.push(v); }
  for (let d = 0; d < R; d++) {
    const next = [];
    for (const v of front) for (const q of nbrs(v, nb)) if (!air[q] && !solid[q] && !barrier[q]) { air[q] = 1; next.push(q); }
    front = next;
  }
  let nAir = 0, edge = 0;
  for (let v = 0; v < NN; v++) {
    if (!air[v]) continue;
    nAir++;
    const [iu, iw, iy] = coords(v);
    if (iu < R + 4 || iw < R + 4 || iy < R + 4 || iu >= NU - R - 4 || iw >= NW - R - 4 || iy >= NY - R - 4) edge++;
  }
  if (edge) console.warn(`  (the air reaches the crop's edge in ${edge} voxels: a leak)`);
  console.log(`  air ${(nAir * V ** 3).toFixed(0)} m³ (${nAir} voxels), core flood ${qt}`);
  if (process.env.DEBUG_PNG) {
    // (the voxels for a look: 0 nothing, 1 rock, 2 air, 3 the barrier; u fastest, then w, then y)
    const dump = new Uint8Array(NN);
    for (let v = 0; v < NN; v++) dump[v] = barrier[v] ? 3 : air[v] ? 2 : solid[v] ? 1 : 0;
    fs.writeFileSync(path.join(CACHE, `${id}-vox-${NU}x${NW}x${NY}.u8`), dump);
  }
  const grid = { NU, NW, NY, V, u0, w0, y0, th, cu, su, I, coords, outU, outW, SLAB0 };
  return { grid, air, solid, colSum, barrier };
}

// --- The mesh: surface nets on the blurred air ----------------------------------------------------------------------------
function blur(src, NU, NW, NY) {
  // a separable [1 2 1]/4 filter, twice: a small Gaussian
  let a = Float32Array.from(src), b = new Float32Array(a.length);
  const SY = NU * NW;
  for (let pass = 0; pass < 2; pass++) for (const [s, n, len] of [[1, NU, NU], [NU, NW, NW], [SY, NY, NY]]) {
    void n;
    for (let v = 0; v < a.length; v++) {
      const k = Math.floor(v / s) % len;
      const l = k > 0 ? a[v - s] : a[v], r = k < len - 1 ? a[v + s] : a[v];
      b[v] = 0.25 * l + 0.5 * a[v] + 0.25 * r;
    }
    [a, b] = [b, a];
  }
  return a;
}

function surfaceNets(F, grid, colourAt, dayAt) {
  const { NU, NW, NY, I } = grid;
  const iso = 0.5;
  const vid = new Int32Array((NU - 1) * (NW - 1) * (NY - 1)).fill(-1);
  const C = (iu, iw, iy) => (iy * (NW - 1) + iw) * (NU - 1) + iu;
  const pos = [], col = [], tri = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  for (let iy = 0; iy < NY - 1; iy++) for (let iw = 0; iw < NW - 1; iw++) for (let iu = 0; iu < NU - 1; iu++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const [a, b, d] = corner[c];
      val[c] = F[I(iu + a, iw + b, iy + d)];
      if (val[c] > iso) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [e0, e1] of edges) {
      const in0 = val[e0] > iso, in1 = val[e1] > iso;
      if (in0 === in1) continue;
      const t = (iso - val[e0]) / (val[e1] - val[e0]);
      const p0 = corner[e0], p1 = corner[e1];
      sx += p0[0] + (p1[0] - p0[0]) * t; sy += p0[1] + (p1[1] - p0[1]) * t; sz += p0[2] + (p1[2] - p0[2]) * t;
      cnt++;
    }
    vid[C(iu, iw, iy)] = pos.length / 3;
    // (voxel-centre coordinates: cell (iu, iw, iy) spans centres iu..iu+1)
    pos.push(iu + sx / cnt, iw + sy / cnt, iy + sz / cnt);
  }
  // the quads: across each voxel edge where the air ends, the four cells round it
  for (let iy = 1; iy < NY - 1; iy++) for (let iw = 1; iw < NW - 1; iw++) for (let iu = 1; iu < NU - 1; iu++) {
    const f0 = F[I(iu, iw, iy)] > iso;
    // +u edge
    for (const [du, dw, dy, cellsOf] of [
      [1, 0, 0, () => [C(iu, iw - 1, iy - 1), C(iu, iw, iy - 1), C(iu, iw, iy), C(iu, iw - 1, iy)]],
      [0, 1, 0, () => [C(iu - 1, iw, iy - 1), C(iu - 1, iw, iy), C(iu, iw, iy), C(iu, iw, iy - 1)]],
      [0, 0, 1, () => [C(iu - 1, iw - 1, iy), C(iu, iw - 1, iy), C(iu, iw, iy), C(iu - 1, iw, iy)]]
    ]) {
      if (iu + du >= NU || iw + dw >= NW || iy + dy >= NY) continue;
      const f1 = F[I(iu + du, iw + dw, iy + dy)] > iso;
      if (f0 === f1) continue;
      const q = cellsOf().map((c) => vid[c]);
      if (q.some((x) => x < 0)) continue;
      // (facing the air: the winding flips with the side the air is on)
      if (f0) tri.push(q[0], q[2], q[1], q[0], q[3], q[2]);
      else tri.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
  }
  const nv = pos.length / 3;
  for (let i = 0; i < nv; i++) {
    const [r, g, b] = colourAt(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    col.push(r, g, b, dayAt(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
  }
  return { pos: Float32Array.from(pos), col: Uint8Array.from(col), tri: Uint32Array.from(tri) };
}

// --- The floor ---------------------------------------------------------------------------------------------------------
function buildFloor(grid, air) {
  const { NU, NW, NY, V, I } = grid;
  const head = Math.ceil(HEAD / V), step = Math.round(STEP / V);
  // per column: the floors (an air voxel over a non-air one) with headroom
  const floorsOf = (iu, iw) => {
    const out = [];
    for (let iy = 1; iy < NY - head; iy++) {
      if (!air[I(iu, iw, iy)] || air[I(iu, iw, iy - 1)]) continue;
      // (up through the air; a beam or a rail one voxel thick does not end it)
      let h = 0;
      while (iy + h < NY && (air[I(iu, iw, iy + h)] || (iy + h + 1 < NY && air[I(iu, iw, iy + h + 1)] && h > 2))) h++;
      if (h >= head) out.push([iy, iy + h]);
    }
    return out;
  };
  return { floorsOf, head, step };
}

// --- Main --------------------------------------------------------------------------------------------------------------
async function main() {
  const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const ids = want.length ? want : Object.keys(ADITS);
  fs.mkdirSync(OUT, { recursive: true });
  await MeshoptSimplifier.ready;
  for (const id of ids) {
    const A = ADITS[id];
    const cloud = await loadCloud(A.cloud, A.level);
    console.log(`${id}: ${cloud.xyz.length / 3} points`);
    const { grid, air, solid, colSum, barrier } = buildAdit(id, A, cloud);
    const { NU, NW, NY, V, u0, w0, y0, cu, su, I } = grid;
    // (voxel coordinates → the frame's metres → the world frame relative to the portal)
    const [pE, pN, pH] = A.portal;
    const toLocal = (fu, fw, fy) => {
      const u = u0 + (fu + 0.5) * V, w = w0 + (fw + 0.5) * V, y = y0 + (fy + 0.5) * V;
      const dE = u * cu - w * su, dN = u * su + w * cu;
      return [dE, y, -dN];
    };
    // colours: the mean of the rock voxels round a point (2 voxels), grey where none
    const colourAt = (fu, fw, fy) => {
      const cu_ = Math.round(fu), cw_ = Math.round(fw), cy_ = Math.round(fy);
      let r = 0, g = 0, b = 0, c = 0;
      for (let rad = 1; rad <= 3 && c < 8; rad++) {
        r = g = b = c = 0;
        for (let dy = -rad; dy <= rad; dy++) for (let dw = -rad; dw <= rad; dw++) for (let du = -rad; du <= rad; du++) {
          const iu = cu_ + du, iw = cw_ + dw, iy = cy_ + dy;
          if (iu < 0 || iw < 0 || iy < 0 || iu >= NU || iw >= NW || iy >= NY) continue;
          const s = colSum.get(I(iu, iw, iy));
          if (!s) continue;
          r += s[0]; g += s[1]; b += s[2]; c += s[3];
        }
      }
      return c ? [r / c, g / c, b / c] : [92, 86, 78];
    };
    // (daylight: a vertex next to the portal's barrier)
    const dayAt = (fu, fw, fy) => {
      for (let dy = -1; dy <= 2; dy++) for (let dw = -1; dw <= 2; dw++) for (let du = -1; du <= 2; du++) {
        const iu = Math.floor(fu) + du, iw = Math.floor(fw) + dw, iy = Math.floor(fy) + dy;
        if (iu >= 0 && iw >= 0 && iy >= 0 && iu < NU && iw < NW && iy < NY && barrier[I(iu, iw, iy)] === 1) return 255;
      }
      return 0;
    };
    const F = blur(air, NU, NW, NY);
    const mesh = surfaceNets(F, grid, colourAt, dayAt);
    console.log(`  mesh: ${mesh.pos.length / 3} vertices, ${mesh.tri.length / 3} triangles`);
    // into metres (the frame) for the simplifier
    const nv = mesh.pos.length / 3;
    const P = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { const [x, y, z] = toLocal(mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]); P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; }
    const scale = MeshoptSimplifier.getScale(P, 3);
    const [simple, err] = MeshoptSimplifier.simplify(mesh.tri, P, 3, Math.floor(mesh.tri.length * 0.25 / 3) * 3, 0.03 / scale, []);
    console.log(`  simplified: ${simple.length / 3} triangles (error ${(err * scale * 100).toFixed(1)} cm)`);
    // the floor and its grid, the rails
    const floor = buildFloor(grid, air);
    const result = { id, A, grid, air, solid, mesh: { P, col: mesh.col, tri: simple }, floor, toLocal };
    finish(result);
  }
}

// --- Walking: the floor grid from the portal; the rails ---------------------------------------------------------------
function finish({ id, A, grid, mesh, floor, toLocal }) {
  const { NU, NW, V, u0, w0, y0, th } = grid;
  const { floorsOf, step } = floor;
  const [pE, pN, pH] = A.portal;
  // the columns' floors, reached from the portal over steps of at most STEP
  const FLOOR = new Int16Array(NU * NW).fill(-32768), CEIL = new Int16Array(NU * NW).fill(-32768);
  const J = (iu, iw) => iw * NU + iu;
  const toU = (E, N) => (E - pE) * grid.cu + (N - pN) * grid.su, toW = (E, N) => -(E - pE) * grid.su + (N - pN) * grid.cu;
  const colOf = (E, N) => [Math.floor((toU(E, N) - u0) / V), Math.floor((toW(E, N) - w0) / V)];
  const cache = new Map();
  const floors = (iu, iw) => { const k = J(iu, iw); let f = cache.get(k); if (!f) cache.set(k, (f = floorsOf(iu, iw))); return f; };
  // the start: the portal station's column, or the nearest one with a floor
  let start = null;
  {
    const [su_, sw_] = colOf(pE + 2 * Math.cos(grid.th), pN + 2 * Math.sin(grid.th));
    const sy = (0 - y0) / V;
    let bd = Infinity;
    for (let dw = -8; dw <= 8; dw++) for (let du = -8; du <= 8; du++) {
      const iu = su_ + du, iw = sw_ + dw;
      if (iu < 0 || iw < 0 || iu >= NU || iw >= NW) continue;
      for (const [fy] of floors(iu, iw)) { const d = du * du + dw * dw + ((fy - sy) * 0.5) ** 2; if (d < bd) { bd = d; start = [iu, iw, fy]; } }
    }
  }
  if (!start) throw new Error(`${id}: no floor at the portal`);
  if (process.env.DEBUG_PNG) console.log(`  floor start u ${(u0 + start[0] * V).toFixed(1)} w ${(w0 + start[1] * V).toFixed(1)} y ${(y0 + start[2] * V).toFixed(1)} (iy ${start[2]})`);
  const FY = new Int32Array(NU * NW).fill(-1);
  const q = [start];
  FY[J(start[0], start[1])] = start[2];
  for (let h = 0; h < q.length; h++) {
    const [iu, iw, fy] = q[h];
    for (const [du, dw] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nu = iu + du, nw = iw + dw;
      if (nu < 0 || nw < 0 || nu >= NU || nw >= NW || FY[J(nu, nw)] >= 0) continue;
      let pick = null, pd = Infinity;
      for (const [f] of floors(nu, nw)) { const d = Math.abs(f - fy); if (d <= step && d < pd) { pd = d; pick = f; } }
      if (pick == null) continue;
      FY[J(nu, nw)] = pick;
      q.push([nu, nw, pick]);
    }
  }
  const TOP = new Int32Array(NU * NW).fill(-1);
  if (A.walk) {
    // a walkway laid by hand (a narrow footbridge over the open stope, stairs: too fine for the voxels): the cells
    // within `half` of its line, each on the scan's floor nearest the line's height there, or at that height
    FY.fill(-1);
    const L = A.walk.pts;
    for (let iw = 0; iw < NW; iw++) for (let iu = 0; iu < NU; iu++) {
      const u = u0 + (iu + 0.5) * V, w = w0 + (iw + 0.5) * V;
      let best = Infinity, ty = 0;
      for (let i = 0; i + 1 < L.length; i++) {
        const [au, aw, ay] = L[i], [bu, bw, by] = L[i + 1];
        const du = bu - au, dw = bw - aw, len2 = du * du + dw * dw;
        const t = Math.max(0, Math.min(1, ((u - au) * du + (w - aw) * dw) / len2));
        const d = Math.hypot(u - au - du * t, w - aw - dw * t);
        if (d < best) { best = d; ty = ay + (by - ay) * t; }
      }
      if (best > A.walk.half) continue;
      const k = J(iu, iw), tf = (ty - y0) / V;
      let pick = null, pd = Infinity;
      for (const [f, top] of floors(iu, iw)) { const d = Math.abs(f - tf); if (d * V <= 0.5 && d < pd) { pd = d; pick = [f, top]; } }
      FY[k] = pick ? pick[0] : Math.round(tf);
      TOP[k] = pick ? pick[1] : Math.round(tf) + Math.round(2 / V);
    }
  }
  // the scan's floor is rough (rubble, sleepers, holes where the scanner did not see it): the holes closed (a cell with
  // three or four walkable neighbours joins them, twice), the heights a 3×3 median
  for (let pass = 0; pass < 2; pass++) {
    const add = [];
    for (let iw = 1; iw < NW - 1; iw++) for (let iu = 1; iu < NU - 1; iu++) {
      const k = J(iu, iw);
      if (FY[k] >= 0) continue;
      const n = [J(iu + 1, iw), J(iu - 1, iw), J(iu, iw + 1), J(iu, iw - 1)].filter((q) => FY[q] >= 0);
      if (n.length < 3) continue;
      const fy = Math.round(n.reduce((a, q) => a + FY[q], 0) / n.length);
      const tp = Math.min(...n.map((q) => (TOP[q] >= 0 ? TOP[q] : floors(q % NU, Math.floor(q / NU)).find(([f]) => f === FY[q])?.[1] ?? fy + 10)));
      add.push([k, fy, tp]);
    }
    for (const [k, fy, tp] of add) { FY[k] = fy; TOP[k] = tp; }
  }
  // the islands of rock in the floor (a post, a stone, a hole in the scan) up to HOLE m² that the floor surrounds
  {
    const seen = new Uint8Array(NU * NW);
    for (let k0 = 0; k0 < NU * NW; k0++) {
      if (FY[k0] >= 0 || seen[k0]) continue;
      const comp = [k0];
      seen[k0] = 1;
      let open = false;
      for (let h = 0; h < comp.length && comp.length <= HOLE / (V * V) + 1; h++) {
        const k = comp[h], iu = k % NU, iw = (k - iu) / NU;
        for (const [du, dw] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nu = iu + du, nw = iw + dw;
          if (nu < 0 || nw < 0 || nu >= NU || nw >= NW) { open = true; continue; }
          const q = J(nu, nw);
          if (FY[q] >= 0 || seen[q]) continue;
          seen[q] = 1; comp.push(q);
        }
      }
      if (open || comp.length > HOLE / (V * V)) continue;
      // (filled at the height of the floor round it)
      for (const k of comp) {
        const iu = k % NU, iw = (k - iu) / NU;
        let sum = 0, n = 0, tp = Infinity;
        for (let r = 1; r <= 4 && !n; r++) for (let dw = -r; dw <= r; dw++) for (let du = -r; du <= r; du++) {
          const q = J(iu + du, iw + dw);
          if (iu + du < 0 || iw + dw < 0 || iu + du >= NU || iw + dw >= NW || FY[q] < 0 || comp.includes(q)) continue;
          sum += FY[q]; n++;
          tp = Math.min(tp, TOP[q] >= 0 ? TOP[q] : floors(q % NU, Math.floor(q / NU)).find(([f]) => f === FY[q])?.[1] ?? FY[q] + 10);
        }
        if (n) { FY[k] = Math.round(sum / n); TOP[k] = Number.isFinite(tp) ? tp : FY[k] + 10; }
      }
    }
  }
  {
    const med = new Int32Array(FY);
    for (let iw = 1; iw < NW - 1; iw++) for (let iu = 1; iu < NU - 1; iu++) {
      const k = J(iu, iw);
      if (FY[k] < 0) continue;
      const v = [];
      for (let dw = -1; dw <= 1; dw++) for (let du = -1; du <= 1; du++) { const q = J(iu + du, iw + dw); if (FY[q] >= 0) v.push(FY[q]); }
      v.sort((a, b) => a - b);
      med[k] = v[v.length >> 1];
    }
    for (let k = 0; k < NU * NW; k++) if (FY[k] >= 0 && TOP[k] < 0) TOP[k] = floors(k % NU, Math.floor(k / NU)).find(([f]) => f === FY[k])?.[1] ?? FY[k] + 10;
    FY.set(med);
  }
  let walk = 0;
  for (let k = 0; k < NU * NW; k++) {
    if (FY[k] < 0) continue;
    walk++;
    const iu = k % NU, iw = (k - iu) / NU;
    const top = TOP[k] >= 0 ? TOP[k] : floors(iu, iw).find(([f]) => f === FY[k])[1];
    FLOOR[k] = Math.round((y0 + FY[k] * V) * 100); // cm (the voxel's bottom)
    CEIL[k] = Math.round((y0 + top * V) * 100);
  }
  console.log(`  floor: ${(walk * V * V).toFixed(0)} m² walkable`);
  // the clearance on the floor (2D distance to the edge, in cells), for the rails through the middle
  const clear = new Float32Array(NU * NW).fill(0);
  {
    const d = new Int32Array(NU * NW).fill(1e9);
    const qq = [];
    for (let k = 0; k < NU * NW; k++) if (FY[k] < 0) { d[k] = 0; qq.push(k); }
    for (let h = 0; h < qq.length; h++) {
      const k = qq[h], iu = k % NU, iw = (k - iu) / NU;
      for (const [du, dw] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nu = iu + du, nw = iw + dw;
        if (nu < 0 || nw < 0 || nu >= NU || nw >= NW) continue;
        const nk = J(nu, nw);
        if (d[nk] > d[k] + 1) { d[nk] = d[k] + 1; qq.push(nk); }
      }
    }
    for (let k = 0; k < NU * NW; k++) clear[k] = d[k];
  }
  // the rails: Dijkstra from the portal to the far end, dear near the walls
  const target = A.stations.end;
  const railCells = shortest(NU, NW, FY, clear, [start[0], start[1]], colOf(target[0], target[1]));
  const rail = [];
  if (railCells) {
    // smoothed (a moving mean over ±1.5 m), resampled every metre
    const pts = railCells.map(([iu, iw]) => [u0 + (iu + 0.5) * V, w0 + (iw + 0.5) * V]);
    const sm = pts.map((_, i) => {
      let su_ = 0, sw_ = 0, c = 0;
      for (let j = Math.max(0, i - 7); j <= Math.min(pts.length - 1, i + 7); j++) { su_ += pts[j][0]; sw_ += pts[j][1]; c++; }
      return [su_ / c, sw_ / c];
    });
    let acc = 0;
    for (let i = 0; i < sm.length; i++) {
      if (i) acc += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
      if (i && acc < 1 && i < sm.length - 1) continue;
      acc = 0;
      const [u, w] = sm[i];
      const dE = u * grid.cu - w * grid.su, dN = u * grid.su + w * grid.cu;
      const k = J(Math.floor((u - u0) / V), Math.floor((w - w0) / V));
      const fy = FLOOR[k] > -32768 ? FLOOR[k] / 100 : (rail.length ? rail[rail.length - 1][1] : 0);
      rail.push([round2(dE), round2(fy), round2(-dN)]);
    }
    console.log(`  rails: ${rail.length} points, ${(railCells.length * V).toFixed(0)} m`);
  } else console.warn('  (no way from the portal to the far end)');
  // the stations in the local frame (on the floor beneath them)
  const stations = {};
  for (const [name, [E, N, H]] of Object.entries(A.stations)) {
    const [iu, iw] = colOf(E, N);
    let fy = (H - pH);
    let best = null, bd = Infinity;
    for (let dw = -6; dw <= 6; dw++) for (let du = -6; du <= 6; du++) {
      const k = J(iu + du, iw + dw);
      if (iu + du < 0 || iw + dw < 0 || iu + du >= NU || iw + dw >= NW || FLOOR[k] === -32768) continue;
      const d = du * du + dw * dw;
      if (d < bd) { bd = d; best = k; }
    }
    if (best != null) fy = FLOOR[best] / 100;
    stations[name] = [round2(E - pE), round2(fy), round2(-(N - pN))];
  }
  // the portal: the floor at the start, its outward direction (world x/z)
  const ol = Math.hypot(A.out[0], A.out[1]);
  const portalFloor = (y0 + start[2] * V);
  // --- the file ---
  const nv = mesh.P.length / 3;
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], mesh.P[i * 3 + a]); mx[a] = Math.max(mx[a], mesh.P[i * 3 + a]); }
  // only the vertices the simplified triangles use, re-indexed
  const remap = new Int32Array(nv).fill(-1);
  let used = 0;
  for (const v of mesh.tri) if (remap[v] < 0) remap[v] = used++;
  const qpos = new Uint16Array(used * 3), qcol = new Uint8Array(used * 4);
  for (let i = 0; i < nv; i++) {
    const r = remap[i];
    if (r < 0) continue;
    for (let a = 0; a < 3; a++) qpos[r * 3 + a] = Math.round(((mesh.P[i * 3 + a] - mn[a]) / (mx[a] - mn[a])) * 65535);
    for (let a = 0; a < 4; a++) qcol[r * 4 + a] = mesh.col[i * 4 + a];
  }
  const tri = used < 65536 ? new Uint16Array(mesh.tri.length) : new Uint32Array(mesh.tri.length);
  for (let i = 0; i < mesh.tri.length; i++) tri[i] = remap[mesh.tri[i]];
  const [wx, wy, wz] = toWorld(pE, pN, pH);
  const header = {
    id, version: 1,
    source: 'Institut Geomatik FHNW, Silberberg laser scans (2023): https://www.fhnw.ch/plattformen/geo/potree/silberberg/',
    // (the portal station in the world frame; everything else relative to it)
    origin: [round2(wx), round2(wy), round2(wz)],
    portal: { floor: round2(portalFloor), out: [round3(A.out[0] / ol), round3(-A.out[1] / ol)] },
    mesh: { vertices: used, indices: tri.length, index32: tri instanceof Uint32Array, min: mn.map(round3), max: mx.map(round3) },
    floor: { nu: NU, nw: NW, cell: V, u0: round3(u0), w0: round3(w0), cos: round6(grid.cu), sin: round6(grid.su) },
    rail, stations
  };
  void th; void toLocal;
  header.floor.cells = 0;
  for (let k = 0; k < NU * NW; k++) if (FLOOR[k] !== -32768) header.floor.cells++;
  const hj = Buffer.from(JSON.stringify(header));
  const hpad = (4 - ((4 + hj.length) % 4)) % 4;
  const parts = [Buffer.alloc(4), hj, Buffer.alloc(hpad, 0x20), Buffer.from(qpos.buffer), Buffer.from(qcol.buffer)];
  parts[0].writeUInt32LE(hj.length + hpad);
  let off = 4 + hj.length + hpad + qpos.byteLength + qcol.byteLength;
  const ipad = (4 - (off % 4)) % 4;
  parts.push(Buffer.alloc(ipad), Buffer.from(tri.buffer));
  off += ipad + tri.byteLength;
  // the floor: only its cells (index into the nu × nw grid, floor and ceiling in cm)
  const cells = [];
  for (let k = 0; k < NU * NW; k++) if (FLOOR[k] !== -32768) cells.push(k);
  const cellIdx = Uint32Array.from(cells), cellY = new Int16Array(cells.length * 2);
  cells.forEach((k, i) => { cellY[i * 2] = FLOOR[k]; cellY[i * 2 + 1] = CEIL[k]; });
  parts.push(Buffer.from(cellIdx.buffer), Buffer.from(cellY.buffer));
  const file = path.join(OUT, `${id}.bin`);
  fs.writeFileSync(file, Buffer.concat(parts));
  console.log(`  → ${path.relative(root, file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  if (process.env.DEBUG_PNG) debugPlan(id, NU, NW, FY, railCells);
}

function shortest(NU, NW, FY, clear, a, b) {
  const J = (iu, iw) => iw * NU + iu;
  const dist = new Float64Array(NU * NW).fill(Infinity), prev = new Int32Array(NU * NW).fill(-1);
  // (the goal: the walkable cell nearest b)
  let goal = -1, gd = Infinity;
  for (let dw = -10; dw <= 10; dw++) for (let du = -10; du <= 10; du++) {
    const iu = b[0] + du, iw = b[1] + dw;
    if (iu < 0 || iw < 0 || iu >= NU || iw >= NW || FY[J(iu, iw)] < 0) continue;
    if (du * du + dw * dw < gd) { gd = du * du + dw * dw; goal = J(iu, iw); }
  }
  if (goal < 0) return null;
  // a binary heap
  const heap = [];
  const push = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const s = J(a[0], a[1]);
  dist[s] = 0; push(s, 0);
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist[k]) continue;
    if (k === goal) break;
    const iu = k % NU, iw = (k - iu) / NU;
    for (const [du, dw, len] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]) {
      const nu = iu + du, nw = iw + dw;
      if (nu < 0 || nw < 0 || nu >= NU || nw >= NW) continue;
      const nk = J(nu, nw);
      if (FY[nk] < 0) continue;
      const c = d + len * (1 + 6 / (clear[nk] * clear[nk] + 0.5));
      if (c < dist[nk]) { dist[nk] = c; prev[nk] = k; push(nk, c); }
    }
  }
  if (!Number.isFinite(dist[goal])) return null;
  const out = [];
  for (let k = goal; k >= 0; k = prev[k]) out.unshift([k % NU, Math.floor(k / NU)]);
  return out;
}

async function debugPlan(id, NU, NW, FY, railPath) {
  const sharp = (await import('sharp')).default;
  const img = Buffer.alloc(NU * NW * 3);
  for (let k = 0; k < NU * NW; k++) if (FY[k] >= 0) { img[k * 3] = 90; img[k * 3 + 1] = 90; img[k * 3 + 2] = 90; }
  for (const [iu, iw] of railPath || []) { const k = iw * NU + iu; img[k * 3] = 255; img[k * 3 + 1] = 200; img[k * 3 + 2] = 0; }
  await sharp(img, { raw: { width: NU, height: NW, channels: 3 } }).flip().png().toFile(path.join(CACHE, `${id}-floor.png`));
}

const round2 = (v) => Math.round(v * 100) / 100, round3 = (v) => Math.round(v * 1000) / 1000, round6 = (v) => Math.round(v * 1e6) / 1e6;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
