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
//   3. the holes (glass the LiDAR saw through, the gable tops it could not reach) filled push-pull from round them;
//      the colours balanced: a little desaturated, the bluish casts (the Laube's sheeting, the sky in the glass)
//      greyed;
//   4. packed (facadeLayout(): one scale, shelves) into one SIZE² atlas, each bake's border repeated into its gutter
//      (mipmaps don't bleed); JPEG.
// Dependency: sharp (devDependency).
// Usage: node tools/build-detail-house-scan.mjs [path/to/scan.glb]
// (the scan goes to tools/data/cache/grialetsch-scan.glb by default; it is not in git)
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
  cloneWood(key, b, img, ok, W, H);
  pushPull(img, ok, W, H);
  balance(img);
  console.log(`  ${key}: ${W}×${H} px, ${used} triangles, ${(100 * covered / (W * H)).toFixed(0)}% covered`);
  return { W, H, img };
}

// Big holes in the wood (the gable tops the LiDAR could not reach from the ground) take the wood from below or beside
// them: each empty texel copies the first covered, wood-coloured texel CLONE metres below (then further below, then
// beside); not within the windows (their glass is left to push-pull: the curtains round it)
const CLONE = 1.6;
function cloneWood(key, b, img, ok, W, H) {
  const face = { 'z1': 'S', 'z-1': 'N', 'x1': 'E', 'x-1': 'W' }[b.axis + b.out];
  const glass = MODEL.windows.filter((w) => w[0] === face).map(([, a0, a1, y0, y1]) => [
    (a0 - 0.1 - b.a[0]) * S, (a1 + 0.1 - b.a[0]) * S, (b.y[1] - y1 - 0.1) * S, (b.y[1] - y0 + 0.1) * S]);
  const wood = (q) => {
    const r = img[q * 3], g = img[q * 3 + 1], bl = img[q * 3 + 2], l = 0.3 * r + 0.59 * g + 0.11 * bl;
    return l > 25 && l < 150 && r > bl + 5;
  };
  const P = Math.round(CLONE * S), offsets = [[0, P], [0, 2 * P], [0, 3 * P], [P, 0], [-P, 0], [P, P], [-P, P], [0, 4 * P]];
  const filled = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (ok[p] || glass.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) continue;
      for (const [ddx, ddy] of offsets) {
        const sx = x + ddx, sy = y + ddy;
        if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
        const q = sy * W + sx;
        if (!ok[q] || !wood(q)) continue;
        filled.push(p, q);
        break;
      }
    }
  }
  for (let k = 0; k < filled.length; k += 2) {
    const p = filled[k], q = filled[k + 1];
    img[p * 3] = img[q * 3]; img[p * 3 + 1] = img[q * 3 + 1]; img[p * 3 + 2] = img[q * 3 + 2];
  }
  for (let k = 0; k < filled.length; k += 2) ok[filled[k]] = 1;
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
for (const [key, b] of Object.entries(MODEL.bakes)) {
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
