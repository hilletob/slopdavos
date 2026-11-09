// Builds assets/models/bicycle-helmet.glb, the cycling helmet of the player's figure on the bikes (js/player-figure.js),
// from "Bicycle Hat" by MR.Sirapop (https://sketchfab.com/3d-models/bicycle-hat-660183838e9f4a16b53043e639ad8609,
// https://sketchfab.com/Sirapop.Satemrn), CC BY 4.0 — the credit and licence stay in the file's asset.extras.
//
// The source (downloaded from Sketchfab as glTF to tools/data/cache/bicycle-hat/) is one primitive in cm, Z up, under a
// node turning it Y up. Here it goes into the helmet's own space: metres, Y up, the front forward (+Z; the green panel
// at the back), the origin at the shell's crown (x, z: the shell's middle, without the chin straps hanging below; y: its
// top), so that js/player-figure.js can sit it on a figure's skull. The base colour comes along as a 512² JPEG (the normal and
// metallic-roughness maps are dropped: a helmet the size of a fist on screen).
// Usage: node tools/build-bicycle-helmet.mjs [path/to/scene.gltf] [--flip]   (--flip: the brim was at -Z)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const FLIP = args.includes('--flip');
const SRC = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(root, 'tools/data/cache/bicycle-hat/scene.gltf'));
const OUT = path.join(root, 'assets/models/bicycle-helmet.glb');

const gltf = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const bin = fs.readFileSync(path.join(path.dirname(SRC), gltf.buffers[0].uri));
const prim = gltf.meshes[0].primitives[0];
const read = (i, n) => {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
  const base = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || n * 4;
  const out = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = bin.readFloatLE(base + k * stride + c * 4);
  return out;
};
const P = read(prim.attributes.POSITION, 3), N = read(prim.attributes.NORMAL, 3), UV = read(prim.attributes.TEXCOORD_0, 2);
const count = P.length / 3;
const ia = gltf.accessors[prim.indices], iv = gltf.bufferViews[ia.bufferView];
const idx = [];
for (let k = 0; k < ia.count; k++) {
  const o = (iv.byteOffset || 0) + (ia.byteOffset || 0) + k * (ia.componentType === 5125 ? 4 : 2);
  idx.push(ia.componentType === 5125 ? bin.readUInt32LE(o) : bin.readUInt16LE(o));
}

// Z up (cm) -> Y up (m), as the scene's node does: (x, y, z) -> (x, z, -y); --flip turns it round about Y
const s = FLIP ? -1 : 1;
const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
for (let k = 0; k < count; k++) {
  pos[k * 3] = s * P[k * 3] * 0.01; pos[k * 3 + 1] = P[k * 3 + 2] * 0.01; pos[k * 3 + 2] = -s * P[k * 3 + 1] * 0.01;
  nor[k * 3] = s * N[k * 3]; nor[k * 3 + 1] = N[k * 3 + 2]; nor[k * 3 + 2] = -s * N[k * 3 + 1];
}
// origin: the shell's (the top 12 cm, above the straps) middle in x & z, y at its top
let top = -Infinity;
for (let k = 0; k < count; k++) top = Math.max(top, pos[k * 3 + 1]);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let k = 0; k < count; k++) {
  if (pos[k * 3 + 1] < top - 0.12) continue;
  for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], pos[k * 3 + c]); max[c] = Math.max(max[c], pos[k * 3 + c]); }
}
const shift = [(min[0] + max[0]) / 2, top, (min[2] + max[2]) / 2];
console.log(`shell: ${(max[0] - min[0]).toFixed(3)} wide, ${(max[2] - min[2]).toFixed(3)} long`);
for (let k = 0; k < count; k++) for (let c = 0; c < 3; c++) pos[k * 3 + c] -= shift[c];

// the base colour, 512²
const texPath = path.join(path.dirname(SRC), gltf.images[gltf.textures[gltf.materials[0].pbrMetallicRoughness.baseColorTexture.index].source].uri);
const jpeg = await sharp(texPath).resize(512, 512, { kernel: 'lanczos3' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();

// ---- GLB ----------------------------------------------------------------------------------------------------------
const chunks = [], views = [];
let offset = 0;
const addView = (b, target) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  views.push({ buffer: 0, byteOffset: offset, byteLength: b.length, ...(target ? { target } : {}) });
  chunks.push(b);
  offset += b.length;
  return views.length - 1;
};
const bounds = (arr, k) => {
  const lo = new Array(k).fill(Infinity), hi = new Array(k).fill(-Infinity);
  for (let i = 0; i < arr.length; i += k) for (let j = 0; j < k; j++) { lo[j] = Math.min(lo[j], arr[i + j]); hi[j] = Math.max(hi[j], arr[i + j]); }
  return { min: lo.map((v) => Math.fround(v)), max: hi.map((v) => Math.fround(v)) };
};
const uv32 = Float32Array.from(UV);
const accessors = [
  { bufferView: addView(Buffer.from(pos.buffer), 34962), componentType: 5126, count, type: 'VEC3', ...bounds(pos, 3) },
  { bufferView: addView(Buffer.from(nor.buffer), 34962), componentType: 5126, count, type: 'VEC3' },
  { bufferView: addView(Buffer.from(uv32.buffer), 34962), componentType: 5126, count, type: 'VEC2' },
  { bufferView: addView(Buffer.from(Uint16Array.from(idx).buffer), 34963), componentType: 5123, count: idx.length, type: 'SCALAR' }
];
const imageView = addView(jpeg);
const binary = Buffer.concat(chunks);
const out = {
  asset: {
    version: '2.0',
    generator: 'tools/build-bicycle-helmet.mjs (metres, Y up, front forward, origin at the crown; base colour only)',
    extras: {
      title: 'Bicycle Hat',
      author: 'MR.Sirapop (https://sketchfab.com/Sirapop.Satemrn)',
      source: 'https://sketchfab.com/3d-models/bicycle-hat-660183838e9f4a16b53043e639ad8609',
      license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
      modified: 'rescaled to metres, re-oriented, textures reduced to a 512 px base colour; tools/build-bicycle-helmet.mjs'
    }
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'bicycle-helmet', mesh: 0 }],
  meshes: [{ name: 'bicycle-helmet', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0, mode: 4 }] }],
  materials: [{ name: 'helmet', doubleSided: true, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.35 } }],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{ magFilter: 9729, minFilter: 9987 }],
  images: [{ bufferView: imageView, mimeType: 'image/jpeg' }],
  accessors,
  bufferViews: views,
  buffers: [{ byteLength: binary.length }]
};
let json = Buffer.from(JSON.stringify(out), 'utf8');
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const binPadded = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.write('glTF', 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
const chunkHeader = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, chunkHeader(json.length, 0x4e4f534a), json, chunkHeader(binPadded.length, 0x004e4942), binPadded]));
const b = bounds(pos, 3);
console.log(`${path.relative(root, OUT)}: ${idx.length / 3} triangles, ${count} vertices, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB; ` +
  `size ${(b.max[0] - b.min[0]).toFixed(3)} x ${(b.max[1] - b.min[1]).toFixed(3)} x ${(b.max[2] - b.min[2]).toFixed(3)} m`);
