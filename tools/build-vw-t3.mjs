// Builds assets/models/vw-t3-body.glb, the body of the player's VW T3 (js/vw-t3.js), from
// "VW T3 Van scale1-100 lowpoly for 3D-printing" by fishermans garage
// (https://sketchfab.com/3d-models/vw-t3-van-scale1-100-lowpoly-for-3d-printing-b26d56e82819444aa2379e6461500ff6,
// https://sketchfab.com/fishermans), CC BY 4.0 — the credit and licence stay in the file's asset.extras.
//
// The source is a 1:100 print model in mm (one grey primitive, Z up, the van along +x, its left side at +y). Here it is
// turned into the van's object space (origin in the middle of the body on the ground, z forward, y up, x to the left,
// metres) and scaled to T3.zFront/zRear/halfWidth/height of js/vw-t3.js. The model is a heap of separate shells:
//   - the four wheels (with their tyres ~6.2k triangles): dropped, the game's wheels are separate & steerable; the wheel
//     arches stay. Their centres & radius are printed, js/vw-t3.js's T3.axles/wheelX/wheelRadius follow them;
//   - tiny raised lettering & badges on the tail (~4.5k triangles for letters 2 cm high): dropped, the material paints;
//   - bumpers, door handles, the exhaust & the bits under the tail: part TRIM (black plastic), the rest part BODY.
// What is left is welded (identical position & normal), ~7.7k triangles; no decimation is needed.
// The GLB holds POSITION, NORMAL (float) and _PART (unsigned byte, js/vw-t3.js PARTS) with 16-bit indices.
// No dependencies.  Usage: node tools/build-vw-t3.mjs [path/to/scene.gltf]
// (the source, downloaded from Sketchfab as glTF, goes to tools/data/cache/vw-t3/ by default)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.argv[2] || path.join(root, 'tools/data/cache/vw-t3/scene.gltf'));
const OUT = path.join(root, 'assets/models/vw-t3-body.glb');
// js/vw-t3.js T3: the van's length (bumper to bumper), width (body) and height (roof)
const LENGTH = 4.57, WIDTH = 1.85, HEIGHT = 1.95;
const PART = { BODY: 0, TRIM: 4 };

const gltf = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const bin = fs.readFileSync(path.join(path.dirname(SRC), gltf.buffers[0].uri));
const prim = gltf.meshes[0].primitives[0];
if (gltf.meshes.length !== 1 || gltf.meshes[0].primitives.length !== 1) throw new Error('expected one primitive');
const accessor = (i) => {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
  return { count: a.count, base: (v.byteOffset || 0) + (a.byteOffset || 0), stride: v.byteStride || 12, type: a.componentType };
};
const P = accessor(prim.attributes.POSITION), N = accessor(prim.attributes.NORMAL), I = accessor(prim.indices);
const vcount = P.count;
const pos = new Float64Array(vcount * 3), nor = new Float64Array(vcount * 3);
for (let i = 0; i < vcount; i++) {
  for (let k = 0; k < 3; k++) {
    pos[i * 3 + k] = bin.readFloatLE(P.base + i * P.stride + k * 4);
    nor[i * 3 + k] = bin.readFloatLE(N.base + i * N.stride + k * 4);
  }
}
const idx = new Uint32Array(I.count);
for (let i = 0; i < I.count; i++) idx[i] = I.type === 5125 ? bin.readUInt32LE(I.base + i * 4) : bin.readUInt16LE(I.base + i * 2);

// ---- Shells: connected components over welded positions ------------------------------------------------------------
const posKey = (i) => `${pos[i * 3].toFixed(3)},${pos[i * 3 + 1].toFixed(3)},${pos[i * 3 + 2].toFixed(3)}`;
const weld = new Map(), welded = new Uint32Array(vcount);
for (let i = 0; i < vcount; i++) {
  const k = posKey(i);
  if (!weld.has(k)) weld.set(k, weld.size);
  welded[i] = weld.get(k);
}
const parent = Int32Array.from({ length: weld.size }, (_, i) => i);
const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
for (let t = 0; t < idx.length; t += 3) {
  const a = find(welded[idx[t]]);
  parent[find(welded[idx[t + 1]])] = a;
  parent[find(welded[idx[t + 2]])] = a;
}
const shells = new Map();
for (let t = 0; t < idx.length; t += 3) {
  const r = find(welded[idx[t]]);
  let s = shells.get(r);
  if (!s) shells.set(r, (s = { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
  s.tris.push(t);
  for (let j = 0; j < 3; j++) {
    for (let k = 0; k < 3; k++) {
      const v = pos[idx[t + j] * 3 + k];
      s.min[k] = Math.min(s.min[k], v);
      s.max[k] = Math.max(s.max[k], v);
    }
  }
}
const list = [...shells.values()].sort((a, b) => b.tris.length - a.tris.length);
const bodyShell = list[0];
const size = (s, k) => s.max[k] - s.min[k];
const groundZ = Math.min(...list.map((s) => s.min[2]));
const xMin = Math.min(...list.map((s) => s.min[0])), xMax = Math.max(...list.map((s) => s.max[0]));

// Classify (source mm: x along the van, y across, z up)
const wheels = [];
let dropped = 0;
for (const s of list) {
  s.keep = true;
  s.part = PART.BODY;
  if (s === bodyShell) continue;
  if (s.min[2] < groundZ + 0.05 && size(s, 0) > 4 && size(s, 2) > 4) { // a wheel standing on the ground
    s.keep = false;
    wheels.push(s);
  } else if (s.max[0] < xMin + 1.5 && size(s, 0) < 0.8 && size(s, 1) < 4 && size(s, 2) < 1) { // lettering on the tail
    s.keep = false;
  } else if (size(s, 1) > 0.6 * size(bodyShell, 1) && s.max[2] < groundZ + 7) { // the bumpers
    s.part = PART.TRIM;
  } else if (s.max[2] < bodyShell.min[2] + 1.5) { // exhaust, tow bits under the tail
    s.part = PART.TRIM;
  } else if (s.tris.length <= 60 && (s.min[1] < bodyShell.min[1] + 0.5 || s.max[1] > bodyShell.max[1] - 0.5)) { // door handles
    s.part = PART.TRIM;
  }
  if (!s.keep) dropped += s.tris.length;
}
if (wheels.length !== 4) throw new Error(`expected 4 wheels, found ${wheels.length}`);

// ---- Into the van's object space ----------------------------------------------------------------------------------
// source (x, y, z) -> van (x = y, y = z, z = x): a rotation, so the winding stays
const cx = (bodyShell.min[1] + bodyShell.max[1]) / 2, cz = (xMin + xMax) / 2;
const sX = WIDTH / size(bodyShell, 1), sY = HEIGHT / (bodyShell.max[2] - groundZ), sZ = LENGTH / (xMax - xMin);
const toVan = (x, y, z) => [(y - cx) * sX, (z - groundZ) * sY, (x - cz) * sZ];
const nToVan = (x, y, z) => { // normals take the inverse transpose of the scale
  const n = [y / sX, z / sY, x / sZ], l = Math.hypot(...n) || 1;
  return n.map((v) => v / l);
};

// The wheels (for T3 in js/vw-t3.js)
for (const w of wheels) {
  const c = toVan((w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2, (w.min[2] + w.max[2]) / 2);
  const r = ((w.max[0] - w.min[0]) * sZ + (w.max[2] - w.min[2]) * sY) / 4;
  console.log(`wheel: x ${c[0].toFixed(3)} y ${c[1].toFixed(3)} z ${c[2].toFixed(3)}, r ${r.toFixed(3)}, ` +
    `width ${(size(w, 1) * sX).toFixed(3)} (outer face |x| ${(Math.max(Math.abs(toVan(0, w.min[1], 0)[0]), Math.abs(toVan(0, w.max[1], 0)[0]))).toFixed(3)})`);
}

// ---- Welded, indexed output ---------------------------------------------------------------------------------------
const outPos = [], outNor = [], outPart = [], outIdx = [];
const vmap = new Map();
const vertex = (i, part) => {
  const p = toVan(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const n = nToVan(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
  const k = `${p.map((v) => v.toFixed(5)).join(',')}|${n.map((v) => v.toFixed(3)).join(',')}|${part}`;
  let j = vmap.get(k);
  if (j === undefined) {
    j = outPart.length;
    vmap.set(k, j);
    outPos.push(...p);
    outNor.push(...n);
    outPart.push(part);
  }
  return j;
};
for (const s of list) {
  if (!s.keep) continue;
  for (const t of s.tris) {
    const a = vertex(idx[t], s.part), b = vertex(idx[t + 1], s.part), c = vertex(idx[t + 2], s.part);
    if (a === b || b === c || a === c) continue; // (degenerate after welding)
    outIdx.push(a, b, c);
  }
}
const nv = outPart.length;
if (nv > 65535) throw new Error('too many vertices for 16-bit indices');
if (!outIdx.length) throw new Error('empty result');

// ---- GLB ----------------------------------------------------------------------------------------------------------
const chunks = [], views = [];
let offset = 0;
const addView = (buf, target) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
  chunks.push(buf);
  offset += buf.length;
  return views.length - 1;
};
const bounds = (arr, n) => {
  const min = new Array(n).fill(Infinity), max = new Array(n).fill(-Infinity);
  for (let i = 0; i < arr.length; i += n) for (let k = 0; k < n; k++) { min[k] = Math.min(min[k], arr[i + k]); max[k] = Math.max(max[k], arr[i + k]); }
  return { min: min.map((v) => Math.fround(v)), max: max.map((v) => Math.fround(v)) };
};
const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
const accessors = [
  { bufferView: addView(f32(outPos), 34962), componentType: 5126, count: nv, type: 'VEC3', ...bounds(outPos, 3) },
  { bufferView: addView(f32(outNor), 34962), componentType: 5126, count: nv, type: 'VEC3' },
  { bufferView: addView(Buffer.from(Uint8Array.from(outPart)), 34962), componentType: 5121, count: nv, type: 'SCALAR' },
  { bufferView: addView(Buffer.from(new Uint16Array(outIdx).buffer), 34963), componentType: 5123, count: outIdx.length, type: 'SCALAR' }
];
const binary = Buffer.concat(chunks);
const out = {
  asset: {
    version: '2.0',
    generator: 'tools/build-vw-t3.mjs (wheels & tail lettering removed, rescaled to metres, z forward)',
    extras: { ...gltf.asset.extras, modified: 'wheels and tail lettering removed, rescaled, re-oriented; tools/build-vw-t3.mjs' }
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'vw-t3-body', mesh: 0 }],
  meshes: [{ name: 'vw-t3-body', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, _PART: 2 }, indices: 3, mode: 4 }] }],
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
console.log(`${path.relative(root, OUT)}: ${outIdx.length / 3} triangles (${idx.length / 3} in the source, ${dropped} dropped), ` +
  `${nv} vertices, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB; scale x ${sX.toFixed(4)} y ${sY.toFixed(4)} z ${sZ.toFixed(4)}`);
