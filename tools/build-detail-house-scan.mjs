// Bakes assets/models/dischmastrasse-19-facades.jpg, the photographs on the walls of Dischmastrasse 19
// (js/detail-houses.js builds the house itself, procedurally, to the numbers measured on the scan), from the owner's 3D
// scan "Grialetsch" (Scaniverse on an iPhone with LiDAR, 2026-10-31: one mesh of ~341k triangles with position & uv,
// one 8192² JPEG atlas). The numbers are js/detail-houses-data.js's DETAIL_HOUSES[…].model.
//
//   1. the scan into the house's local frame: turned by scanFrame.yaw about y, moved by (dx, dz) — x along the ridge,
//      z to the south front, y up from the ground (the scan is metric and level: ARKit);
//   2. per bake (model.bakes: a direction and an extent): an orthographic view of the scan — of the front-most
//      surface facing that way within the bake's slab, so that what stands in front (trees, the car, the stair's rail
//      far out) stays out — rasterised 2×2 supersampled, each sample's colour read (bilinear) off the scan's atlas at
//      its interpolated uv;
//   3. the light evened out per wall (equalise: the shadows the photographs were taken in — the street lamp's, the
//      porch roof's, the trees' — lifted to the wall's sunlit colour, the grain kept, the windows left alone); the
//      holes filled — the gable tops the LiDAR could not reach and the Laube's smeared east side with logs borrowed
//      from the north wall (transplant: a random, mirrored mix of cells, the courses aligned), smaller holes with
//      the wood below them (cloneWood), the glass the LiDAR saw through push-pull from round it; the colours balanced:
//      a little desaturated, the bluish casts (the sheeting, the sky in the glass) greyed;
//   4. packed (facadeLayout(): one scale, shelves) into one SIZE² atlas, each bake's border repeated into its gutter
//      (mipmaps don't bleed); JPEG.
// Everything is deterministic (hashes, no Math.random): the same scan gives the same atlas.
// Dependency: sharp (devDependency).
// Usage: node tools/build-detail-house-scan.mjs [path/to/scan.glb]
// (the scan goes to tools/data/cache/grialetsch-scan.glb by default; it is not in git)
// DEBUG_BAKES=<dir> writes every bake as a PNG, raw and finished, for a look.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { DETAIL_HOUSES, facadeLayout } from '../js/detail-houses-data.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.argv[2] || path.join(root, 'tools/data/cache/grialetsch-scan.glb'));
const MODEL = DETAIL_HOUSES.find((h) => h.id === 'dischmastrasse-19').model;
const OUT = path.join(root, MODEL.atlas);
const SIZE = 2048, PAD = 4, SS = 2; // the atlas, its gutters, the supersampling
const JPEG_QUALITY = 82;
const MAX_BYTES = 600 * 1024;

// ---- Read the scan ---------------------------------------------------------------------------------------------------
const file = fs.readFileSync(SRC);
if (file.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
const jsonLength = file.readUInt32LE(12);
const gltf = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
const binStart = 20 + jsonLength + 8;
const prim = gltf.meshes[0].primitives[0];
const accessorAt = (i) => {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
  return { a, offset: binStart + (v.byteOffset || 0) + (a.byteOffset || 0) };
};
const readFloats = (i, n) => {
  const { a, offset } = accessorAt(i);
  if (a.componentType !== 5126) throw new Error('expected floats');
  const out = new Float32Array(a.count * n);
  for (let k = 0; k < out.length; k++) out[k] = file.readFloatLE(offset + k * 4);
  return out;
};
const srcPos = readFloats(prim.attributes.POSITION, 3), uv = readFloats(prim.attributes.TEXCOORD_0, 2);
const idx = (() => {
  const { a, offset } = accessorAt(prim.indices);
  const out = new Uint32Array(a.count);
  for (let k = 0; k < a.count; k++) out[k] = a.componentType === 5125 ? file.readUInt32LE(offset + k * 4) : file.readUInt16LE(offset + k * 2);
  return out;
})();
const imageView = gltf.bufferViews[gltf.images[gltf.textures[gltf.materials[prim.material].pbrMetallicRoughness.baseColorTexture.index].source].bufferView];
const jpeg = file.subarray(binStart + (imageView.byteOffset || 0), binStart + (imageView.byteOffset || 0) + imageView.byteLength);
const nv = srcPos.length / 3, nt = idx.length / 3;
const { data: src, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
const SW = info.width, SH = info.height, SC = info.channels;
console.log(`scan: ${nt} triangles, ${nv} vertices, atlas ${SW}×${SH}`);

// ---- 1. Into the house's frame ---------------------------------------------------------------------------------------
const { yaw: yawDeg, dx, dz } = MODEL.scanFrame;
const yaw = yawDeg * Math.PI / 180, cs = Math.cos(yaw), sn = Math.sin(yaw);
const pos = new Float32Array(srcPos.length);
for (let i = 0; i < nv; i++) {
  const x = srcPos[i * 3], y = srcPos[i * 3 + 1], z = srcPos[i * 3 + 2];
  pos[i * 3] = x * cs + z * sn + dx;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = -x * sn + z * cs + dz;
}

// Bilinear sample of the scan's atlas (uv: glTF, v down) into rgb[o..o+2]
function sample(u, v, rgb, o) {
  const fx = Math.min(SW - 1.001, Math.max(0, u * SW - 0.5)), fy = Math.min(SH - 1.001, Math.max(0, v * SH - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const p00 = (y0 * SW + x0) * SC, p10 = p00 + SC, p01 = p00 + SW * SC, p11 = p01 + SC;
  for (let k = 0; k < 3; k++) {
    rgb[o + k] = (src[p00 + k] * (1 - tx) + src[p10 + k] * tx) * (1 - ty) + (src[p01 + k] * (1 - tx) + src[p11 + k] * tx) * ty;
  }
}

// ---- 2. & 3. The bakes -----------------------------------------------------------------------------------------------
const layout = facadeLayout(MODEL.bakes, SIZE, PAD);
const S = layout.scale;
console.log(`atlas: ${SIZE}², ${S} px per metre`);

const baked = {}; // every finished bake (before balance()) with the phase of its log courses, for the walls that borrow from it
function bake(key, b) {
  const W = Math.ceil((b.a[1] - b.a[0]) * S), H = Math.ceil((b.y[1] - b.y[0]) * S);
  const w = W * SS, h = H * SS, s = S * SS;
  const depth = new Float32Array(w * h).fill(-Infinity), col = new Float32Array(w * h * 3);
  const ax = b.axis === 'z' ? 0 : 2, ox = b.axis === 'z' ? 2 : 0; // the image's horizontal axis, the outward one
  let used = 0;
  for (let t = 0; t < nt; t++) {
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
    const o0 = pos[i0 * 3 + ox], o1 = pos[i1 * 3 + ox], o2 = pos[i2 * 3 + ox];
    const oc = (o0 + o1 + o2) / 3;
    if (oc < b.slab[0] || oc > b.slab[1]) continue;
    // facing out (the scan's triangles wind counter-clockwise seen from outside)
    const e1 = [pos[i1 * 3] - pos[i0 * 3], pos[i1 * 3 + 1] - pos[i0 * 3 + 1], pos[i1 * 3 + 2] - pos[i0 * 3 + 2]];
    const e2 = [pos[i2 * 3] - pos[i0 * 3], pos[i2 * 3 + 1] - pos[i0 * 3 + 1], pos[i2 * 3 + 2] - pos[i0 * 3 + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(...n) || 1;
    if (b.out * n[ox] / nl < 0.2) continue;
    // into the image: column (a − a0)·s, row (y1 − y)·s, depth outwards
    const P = [i0, i1, i2].map((i) => [(pos[i * 3 + ax] - b.a[0]) * s, (b.y[1] - pos[i * 3 + 1]) * s, b.out * pos[i * 3 + ox]]);
    const minX = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), maxX = Math.min(w - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), maxY = Math.min(h - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    if (minX > maxX || minY > maxY) continue;
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]);
    if (Math.abs(area) < 1e-9) continue;
    used++;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const l0 = ((P[1][0] - px) * (P[2][1] - py) - (P[1][1] - py) * (P[2][0] - px)) / area;
        const l1 = ((P[2][0] - px) * (P[0][1] - py) - (P[2][1] - py) * (P[0][0] - px)) / area;
        const l2 = 1 - l0 - l1;
        if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
        const d = l0 * P[0][2] + l1 * P[1][2] + l2 * P[2][2], p = y * w + x;
        if (d <= depth[p]) continue;
        depth[p] = d;
        sample(l0 * uv[i0 * 2] + l1 * uv[i1 * 2] + l2 * uv[i2 * 2], l0 * uv[i0 * 2 + 1] + l1 * uv[i1 * 2 + 1] + l2 * uv[i2 * 2 + 1], col, p * 3);
      }
    }
  }
  // down to W × H: the mean of the covered samples
  const img = new Float32Array(W * H * 3), ok = new Uint8Array(W * H);
  let covered = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, bl = 0, c = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
        const p = (y * SS + j) * w + x * SS + i;
        if (depth[p] === -Infinity) continue;
        r += col[p * 3]; g += col[p * 3 + 1]; bl += col[p * 3 + 2]; c++;
      }
      if (!c) continue;
      const q = y * W + x;
      img[q * 3] = r / c; img[q * 3 + 1] = g / c; img[q * 3 + 2] = bl / c; ok[q] = 1; covered++;
    }
  }
  if (process.env.DEBUG_BAKES) dump(`${key}-raw`, img, W, H);
  const typical = equalise(key, b, img, ok, W, H);
  if (FILLS[key]) transplant(key, b, img, ok, W, H, typical); else cloneWood(key, b, img, ok, W, H);
  pushPull(img, ok, W, H);
  baked[key] = { W, H, img: Float32Array.from(img), b, typical, phase: logPhase(img, ok, W, H) };
  balance(img);
  if (process.env.DEBUG_BAKES) dump(`${key}-out`, img, W, H);
  console.log(`  ${key}: ${W}×${H} px, ${used} triangles, ${(100 * covered / (W * H)).toFixed(0)}% covered, the larch ${typical.map((v) => Math.round(v)).join('/')}`);
  return { W, H, img };
}

// (DEBUG_BAKES=dir: every bake as a PNG, raw and finished)
function dump(name, img, W, H) {
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.max(0, Math.min(255, Math.round(img[i])));
  fs.mkdirSync(process.env.DEBUG_BAKES, { recursive: true });
  sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(process.env.DEBUG_BAKES, `${name}.png`));
}

// The windows of a bake's face as rectangles in its image (px), `margin` metres round the glass
function glassRects(b, margin) {
  const face = { 'z1': 'S', 'z-1': 'N', 'x1': 'E', 'x-1': 'W' }[b.axis + b.out];
  return MODEL.windows.filter((w) => w[0] === face).map(([, a0, a1, y0, y1]) => [
    (a0 - margin - b.a[0]) * S, (a1 + margin - b.a[0]) * S, (b.y[1] - y1 - margin) * S, (b.y[1] - y0 + margin) * S]);
}
const inRects = (rects, x, y) => rects.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
// A texel's luminance, and whether it looks like the larch (not the white frames, the plaster, the sky in the glass)
const lumAt = (img, q) => 0.3 * img[q * 3] + 0.59 * img[q * 3 + 1] + 0.11 * img[q * 3 + 2];
const woodAt = (img, q) => { const l = lumAt(img, q); return l > 25 && l < 150 && img[q * 3] > img[q * 3 + 2] + 5; };
// A hash in [0, 1) of three integers (deterministic: the atlas is reproducible)
function hash3(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Big holes in the wood (the gable tops the LiDAR could not reach from the ground) take the wood from lower down the
// same wall — not one block copied up (its pattern would repeat), but a mix: the hole is covered by cells (2 m × two
// logs), each corner of a cell drawing its own source — some whole number of logs (6 to 20) further down, so that the
// seams line up, shifted up to 1.5 m along the logs, every other one mirrored — and each texel blends the four corners'
// sources by its position in the cell (the weights sharpened: mostly one source, a short cross-fade between them). Not
// within the windows (their glass is left to push-pull: the curtains round it); the sources keep clear of the windows
// with their shutters, flower boxes and sills (0.9 m beside, 0.45 m over and under them). Where the wall is boarded
// vertically (BOARDED: the south front and the lean-to), the sources lie straight below, neither shifted nor mirrored
const LOG = 0.165; // the pitch of the squared logs (m)
const BOARDED = new Set(['S', 'porchS', 'porchE', 'leanToE']);
function cloneWood(key, b, img, ok, W, H) {
  const glass = glassRects(b, 0.1), fittings = glassRects(b, 0.45).map(([x0, x1, y0, y1]) => [x0 - 0.45 * S, x1 + 0.45 * S, y0, y1]);
  const cellW = Math.round(2.0 * S), cellH = Math.round(2 * LOG * S), downs = [6, 9, 12, 15, 20], boards = BOARDED.has(key);
  const source = (x, y, cx, cy) => {
    const jx = boards ? 0 : Math.round((hash3(cx, cy, 2) - 0.5) * 3.0 * S), mirror = !boards && hash3(cx, cy, 3) < 0.4;
    const start = Math.floor(hash3(cx, cy, 1) * downs.length);
    for (let k = 0; k < downs.length; k++) {
      const n = downs[(start + k) % downs.length];
      const sx = (mirror ? W - 1 - x : x) + jx, sy = Math.round(y + n * LOG * S);
      if (sx < 0 || sx >= W || sy >= H) continue;
      const q = sy * W + sx;
      if (ok[q] && woodAt(img, q) && !inRects(fittings, sx, sy)) return q;
    }
    return -1;
  };
  const filled = [], colour = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (ok[p] || inRects(glass, x, y)) continue;
      const fx = x / cellW, fy = y / cellH, cx0 = Math.floor(fx), cy0 = Math.floor(fy), tx = fx - cx0, ty = fy - cy0;
      let r = 0, g = 0, bl = 0, wsum = 0;
      for (const [cx, cy, w0] of [[cx0, cy0, (1 - tx) * (1 - ty)], [cx0 + 1, cy0, tx * (1 - ty)], [cx0, cy0 + 1, (1 - tx) * ty], [cx0 + 1, cy0 + 1, tx * ty]]) {
        const q = source(x, y, cx, cy);
        if (q < 0) continue;
        const w = w0 * w0;
        r += img[q * 3] * w; g += img[q * 3 + 1] * w; bl += img[q * 3 + 2] * w; wsum += w;
      }
      if (!wsum) continue;
      filled.push(p); colour.push(r / wsum, g / wsum, bl / wsum);
    }
  }
  filled.forEach((p, k) => { img[p * 3] = colour[k * 3]; img[p * 3 + 1] = colour[k * 3 + 1]; img[p * 3 + 2] = colour[k * 3 + 2]; ok[p] = 1; });
}

// The light the photographs were taken in, evened out per wall: the sun's patches and the shadows burnt into them (the
// street lamp's on the west gable, the porch roof's and the eaves' on the east, the trees' on the north). Per colour
// channel (the shadows are bluer than the sunlit larch), the illumination is estimated as the channel's blurred field
// at σ ≈ 10 cm — fine enough to follow the shadows' edges and the lamp post's 15 cm, coarse enough that the logs'
// seams (16.5 cm apart) and the grain average out — and what lies in shadow is brought to the wall's sunlit colour
// (the 70th percentile): its mean lifted to it, its grain scaled by at most 1.6× (in the deepest shadow the scan's
// texture is mostly blotches); fully where the illumination is below 60 % of it, not at all above 90 % (the sunlit
// wall keeps its own variation from log to log). Only the larch is touched (not the plaster, the white frames, the glass): the
// windows and 15 cm round them keep the photograph as it is, the correction fading in from there. Returns the wall's
// sunlit colour
const SCALES = [0.1];
function equalise(key, b, img, ok, W, H) {
  const glass = glassRects(b, 0.15), N = W * H;
  const mask = new Float32Array(N), woodness = new Float32Array(N);
  for (let q = 0; q < N; q++) {
    if (!ok[q]) continue;
    const l = lumAt(img, q), chroma = img[q * 3] - img[q * 3 + 2];
    // larch: brownish and not white (deep shadow, too dark to have a colour, counts) — a soft measure, so that the
    // gain has no hard edges
    const w = Math.min(1, Math.max(0, (175 - l) / 35)) * Math.max(Math.min(1, Math.max(0, chroma / 10)), Math.min(1, Math.max(0, (90 - l) / 30)));
    woodness[q] = w; mask[q] = w > 0.5 ? 1 : 0;
  }
  const channel = (c) => Float32Array.from({ length: N }, (_, q) => img[q * 3 + c]);
  const fields = [0, 1, 2].map((c) => { const v = channel(c); return SCALES.map((m) => maskedBlur(v, mask, W, H, Math.round(m * S))); });
  // the wall's sunlit colour: the 70th percentile of the fields over the larch
  const target = [0, 1, 2].map((c) => {
    const values = [];
    for (let q = 0; q < N; q++) if (mask[q]) values.push(fields[c][0][q]);
    values.sort((p, q) => p - q);
    return values.length ? values[Math.floor(values.length * 0.7)] : 0;
  });
  if (!target[1]) return target;
  const lumOf = (rgb) => 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2], targetLum = lumOf(target);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const q = y * W + x;
      if (!ok[q] || !woodness[q]) continue;
      // fade the correction in over 15 cm from the windows' margins
      let near = 1;
      for (const [x0, x1, y0, y1] of glass) {
        const d = Math.max(x0 - x, x - x1, y0 - y, y - y1);
        if (d < 0) { near = 0; break; }
        near = Math.min(near, d / (0.15 * S));
      }
      const illumination = [0, 1, 2].map((c) => Math.max(4, Math.min(...fields[c].map((f) => f[q]))));
      const shade = Math.min(1, Math.max(0, (0.9 * targetLum - lumOf(illumination)) / (0.3 * targetLum)));
      const k = woodness[q] * near * shade;
      if (!k) continue;
      for (let c = 0; c < 3; c++) {
        // the mean to the target; what the texel differs from its surroundings by (the grain — in deep shadow mostly
        // the scan's blotches) scaled with the light, but at most 1.6×
        const gain = Math.min(1.6, Math.max(1, target[c] / illumination[c]));
        const v = target[c] + (img[q * 3 + c] - illumination[c]) * gain;
        img[q * 3 + c] += (v - img[q * 3 + c]) * k;
      }
    }
  }
  return target;
}

// Where a wall's photograph is beyond mending — the gable tops the LiDAR did not reach from the ground (the west and
// east gables, the top of the south front) and the Laube's east side (its texture a smear of burnt shadow and the
// glare off its sheeting) — the logs are borrowed from a clean stretch of the north wall (the one wall the scan covers
// whole; the upper south front is boarded vertically, no use for logs): FILLS, per bake, the source, its clean stretch,
// and the regions to replace outright (the holes are always filled; `keep` leaves the windows with their frames and
// shutters, so much beside and over them). The source rows are a whole number of logs from the rows of the same height
// (the courses measured on both walls: logPhase), so that the seams run on; along the logs the source is drawn at
// random and mirrored at random per cell (2 m × two logs), the four corners of a cell blended as in cloneWood; the
// source's colour is brought from its wall's typical colour to this wall's (the sunlit gable is redder than the
// shaded north wall)
const FILLS = {
  W: { from: 'N' },
  E: { from: 'N', regions: [{ a: [1.3, 4.95], y: [1.95, 8.2], keep: [0.15, 0.12] }] }
};
const CLEAN = { N: { a: [-4.0, 4.0], y: [3.2, 6.5] } };
function transplant(key, b, img, ok, W, H, typical) {
  const F = FILLS[key], from = baked[F.from], clean = CLEAN[F.from];
  if (!from) throw new Error(`${key}: the source ${F.from} must be baked first`);
  const tint = [0, 1, 2].map((c) => (from.typical[c] > 1 ? Math.min(2.0, Math.max(0.5, typical[c] / from.typical[c])) : 1));
  const glass = glassRects(b, 0.1);
  const fb = from.b, sx0 = Math.round((clean.a[0] - fb.a[0]) * S), sx1 = Math.round((clean.a[1] - fb.a[0]) * S);
  const sy0 = Math.round((fb.y[1] - clean.y[1]) * S), sy1 = Math.round((fb.y[1] - clean.y[0]) * S);
  const P = LOG * S, shift = from.phase - logPhase(img, ok, W, H);
  const source = (x, y, cx, cy) => {
    // the row of the same height in the source bake, its courses' phase matched, then some whole number of logs away
    const same = (b.y[1] - y / S - fb.y[1]) * -S + shift;
    const nLo = Math.ceil((sy0 - same) / P), nHi = Math.floor((sy1 - same) / P);
    if (nHi < nLo) return -1;
    const sy = Math.round(same + (nLo + Math.floor(hash3(cx, cy, 11) * (nHi - nLo + 1))) * P);
    const span = sx1 - sx0, u = (x + hash3(cx, cy, 12) * span) % span;
    const sx = sx0 + Math.round(hash3(cx, cy, 13) < 0.5 ? u : span - 1 - u);
    const q = sy * from.W + Math.min(sx1, Math.max(sx0, sx));
    return woodAt(from.img, q) ? q : -1;
  };
  const regions = (F.regions || []).map((R) => ({
    x0: Math.max(0, Math.round((R.a[0] - b.a[0]) * S)), x1: Math.min(W - 1, Math.round((R.a[1] - b.a[0]) * S)),
    y0: Math.max(0, Math.round((b.y[1] - R.y[1]) * S)), y1: Math.min(H - 1, Math.round((b.y[1] - R.y[0]) * S)),
    kept: glassRects(b, R.keep[1]).map(([x0, x1, y0, y1]) => [x0 - R.keep[0] * S, x1 + R.keep[0] * S, y0, y1])
  }));
  const cellW = Math.round(2.0 * S), cellH = Math.round(2 * LOG * S);
  const out = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      let edge = 0; // how much of the texel is replaced (a hole: all of it; a region: all but a soft 10 cm edge)
      if (!ok[p]) { if (inRects(glass, x, y)) continue; edge = 1; }
      else {
        const R = regions.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && !inRects(r.kept, x, y));
        if (!R) continue;
        edge = 1;
        for (const [x0, x1, y0, y1] of R.kept) edge = Math.min(edge, Math.max(x0 - x, x - x1, y0 - y, y - y1) / (0.1 * S));
      }
      const fx = x / cellW, fy = y / cellH, cx0 = Math.floor(fx), cy0 = Math.floor(fy), tx = fx - cx0, ty = fy - cy0;
      let r = 0, g = 0, bl = 0, wsum = 0;
      for (const [cx, cy, w0] of [[cx0, cy0, (1 - tx) * (1 - ty)], [cx0 + 1, cy0, tx * (1 - ty)], [cx0, cy0 + 1, (1 - tx) * ty], [cx0 + 1, cy0 + 1, tx * ty]]) {
        const q = source(x, y, cx, cy);
        if (q < 0) continue;
        const w = w0 * w0;
        r += from.img[q * 3] * w; g += from.img[q * 3 + 1] * w; bl += from.img[q * 3 + 2] * w; wsum += w;
      }
      if (!wsum) continue;
      out.push(p, edge, r / wsum * tint[0], g / wsum * tint[1], bl / wsum * tint[2]);
    }
  }
  for (let k = 0; k < out.length; k += 5) {
    const p = out[k], e = out[k + 1];
    for (let c = 0; c < 3; c++) img[p * 3 + c] = ok[p] ? img[p * 3 + c] * (1 - e) + out[k + 2 + c] * e : out[k + 2 + c];
    ok[p] = 1;
  }
}

// The phase (px, in [0, LOG·S)) of a wall's log courses: the row profile of the larch's luminance projected onto one
// period of the pitch
function logPhase(img, ok, W, H) {
  const P = LOG * S;
  let re = 0, im = 0;
  for (let y = 0; y < H; y++) {
    let sum = 0, n = 0;
    for (let x = 0; x < W; x++) { const q = y * W + x; if (ok[q] && woodAt(img, q)) { sum += lumAt(img, q); n++; } }
    if (n < W * 0.2) continue;
    const v = sum / n, ang = 2 * Math.PI * y / P;
    re += v * Math.cos(ang); im += v * Math.sin(ang);
  }
  return ((Math.atan2(im, re) / (2 * Math.PI)) * P + P) % P;
}

// A normalised (masked) blur of `v` over the texels where `mask` is set: three box passes of radius r each way (close
// to a Gaussian of σ ≈ r); where nothing is near, the field is 0
function maskedBlur(v, mask, W, H, r) {
  let a = Float32Array.from(v, (x, i) => x * mask[i]), m = Float32Array.from(mask);
  for (let k = 0; k < 3; k++) { a = boxBlur(a, W, H, r); m = boxBlur(m, W, H, r); }
  return a.map((x, i) => (m[i] > 1e-6 ? x / m[i] : 0));
}
function boxBlur(v, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += v[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = s / (2 * r + 1);
      s += v[y * W + Math.min(W - 1, x + r + 1)] - v[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = s / (2 * r + 1);
      s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

// Push-pull: every texel without colour takes the mean of its coarser neighbourhood's
function pushPull(img, ok, W, H) {
  if (W <= 1 && H <= 1) return;
  const w2 = Math.max(1, (W + 1) >> 1), h2 = Math.max(1, (H + 1) >> 1);
  const small = new Float32Array(w2 * h2 * 3), okSmall = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx2 = 0; dx2 < 2; dx2++) {
        const sx = x * 2 + dx2, sy = y * 2 + dy;
        if (sx >= W || sy >= H) continue;
        const p = sy * W + sx;
        if (!ok[p]) continue;
        r += img[p * 3]; g += img[p * 3 + 1]; b += img[p * 3 + 2]; n++;
      }
      if (n) { const q = y * w2 + x; small[q * 3] = r / n; small[q * 3 + 1] = g / n; small[q * 3 + 2] = b / n; okSmall[q] = 1; }
    }
  }
  if (w2 < W || h2 < H) pushPull(small, okSmall, w2, h2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (ok[p]) continue;
      // (bilinear from the coarser level: no blocks)
      const fx = Math.min(w2 - 1, Math.max(0, (x - 0.5) / 2)), fy = Math.min(h2 - 1, Math.max(0, (y - 0.5) / 2));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w2 - 1, x0 + 1), y1 = Math.min(h2 - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      for (let k = 0; k < 3; k++) {
        img[p * 3 + k] = (small[(y0 * w2 + x0) * 3 + k] * (1 - tx) + small[(y0 * w2 + x1) * 3 + k] * tx) * (1 - ty) +
          (small[(y1 * w2 + x0) * 3 + k] * (1 - tx) + small[(y1 * w2 + x1) * 3 + k] * tx) * ty;
      }
    }
  }
}

// A little desaturated; bluish texels (the Laube's sheeting, the sky in the glass) greyed much more
function balance(img) {
  for (let p = 0; p < img.length; p += 3) {
    const r = img[p], g = img[p + 1], b = img[p + 2], l = 0.3 * r + 0.59 * g + 0.11 * b;
    const blue = Math.max(0, Math.min(1, (b - Math.max(r, g)) / 40));
    const keep = 0.85 * (1 - 0.75 * blue);
    img[p] = l + (r - l) * keep; img[p + 1] = l + (g - l) * keep; img[p + 2] = l + (b - l) * keep;
  }
}

// ---- 4. The atlas ----------------------------------------------------------------------------------------------------
const atlas = Buffer.alloc(SIZE * SIZE * 3, 128);
// (the walls others borrow from first)
const order = Object.keys(MODEL.bakes).sort((p, q) => (FILLS[p] ? 1 : 0) - (FILLS[q] ? 1 : 0));
for (const key of order) {
  const b = MODEL.bakes[key];
  const { W, H, img } = bake(key, b), r = layout.rects[key];
  if (W !== r.w || H !== r.h) throw new Error(`${key}: ${W}×${H} against the layout's ${r.w}×${r.h}`);
  for (let y = -PAD; y < H + PAD; y++) {
    for (let x = -PAD; x < W + PAD; x++) {
      const sx = Math.min(W - 1, Math.max(0, x)), sy = Math.min(H - 1, Math.max(0, y)), q = (sy * W + sx) * 3;
      const o = ((r.y + y) * SIZE + r.x + x) * 3;
      for (let k = 0; k < 3; k++) atlas[o + k] = Math.max(0, Math.min(255, Math.round(img[q + k])));
    }
  }
}
let quality = JPEG_QUALITY, jpg;
for (;;) {
  jpg = await sharp(atlas, { raw: { width: SIZE, height: SIZE, channels: 3 } }).jpeg({ quality, mozjpeg: true }).toBuffer();
  if (jpg.length <= MAX_BYTES || quality <= 60) break;
  quality -= 4;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, jpg);
console.log(`${path.relative(root, OUT)}: ${SIZE}², JPEG q${quality}, ${(jpg.length / 1024).toFixed(0)} KB`);
