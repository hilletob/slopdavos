// Builds assets/models/dump-truck.glb, the tipper of the snow-haul mission (js/missions-work.js buildTipperModel), from
// "Man Tga dump truck" by zairiq-zairiq-123-pixar-cars-bfdi
// (https://sketchfab.com/3d-models/man-tga-dump-truck-6e9329c43a3542d5a47b5d40d6c0a086,
// https://sketchfab.com/zairiqzairiqpixarcarsbfdi), CC BY 4.0 — the credit and licence stay in the file's asset.extras.
//
// The source is Sketchfab's glTF (scene.gltf, scene.bin, textures/*.png): a three-axle tipper in cm, y up, its front at
// +z, already taken apart the way the game needs it — body_main_1 (the cab and the chassis), platform (the bed, its
// origin on the tipping hinge at the tail) with platform_door (the tail board, hinged at its top) and hydraulic_part2
// (the ram's rod), hydraulic_part1 (the ram's cylinder on the chassis), and the six wheels, each its own node centred on
// its axle. The file is only packed into one GLB here: the buffer and the textures in its binary chunk, the
// KHR_materials_specular extension (specular 0, which three.js would read as no highlights at all) dropped, the credit
// added. js/missions-work.js scales it (TIPPER.scale) and finds its parts by name.
// No dependencies.  Usage: node tools/build-dump-truck.mjs [path/to/scene.gltf]
// (the source, downloaded from Sketchfab as glTF, goes to tools/data/cache/dump-truck/ by default)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.argv[2] || path.join(root, 'tools/data/cache/dump-truck/scene.gltf'));
const OUT = path.join(root, 'assets/models/dump-truck.glb');
const dir = path.dirname(SRC);

const gltf = JSON.parse(fs.readFileSync(SRC, 'utf8'));
if (gltf.buffers.length !== 1) throw new Error('expected one buffer');
const NEEDED = ['body_main_1', 'platform', 'platform_door', 'hydraulic_part1', 'hydraulic_part2', 'wheel_front_left', 'wheel_back_axis1_left'];
for (const n of NEEDED) if (!gltf.nodes.some((node) => node.name === n)) throw new Error(`node ${n} missing`);

// The binary chunk: the mesh data, then each image, every piece on a 4-byte boundary
const pad4 = (n) => (n + 3) & ~3;
const chunks = [];
let length = 0;
const append = (buf) => { const at = length; chunks.push(buf); length += buf.length; const p = pad4(length) - length; if (p) { chunks.push(Buffer.alloc(p)); length += p; } return at; };
const bin = fs.readFileSync(path.join(dir, gltf.buffers[0].uri));
append(bin);
for (const img of gltf.images) {
  const data = fs.readFileSync(path.join(dir, decodeURIComponent(img.uri)));
  const at = append(data);
  gltf.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: data.length });
  img.bufferView = gltf.bufferViews.length - 1;
  img.mimeType = img.uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
  delete img.uri;
}
gltf.buffers = [{ byteLength: length }];

for (const m of gltf.materials) delete m.extensions;
for (const key of ['extensionsUsed', 'extensionsRequired']) {
  if (gltf[key]) gltf[key] = gltf[key].filter((e) => e !== 'KHR_materials_specular');
  if (gltf[key]?.length === 0) delete gltf[key];
}
gltf.asset = {
  ...gltf.asset,
  generator: 'tools/build-dump-truck.mjs',
  extras: {
    title: 'Man Tga dump truck',
    author: 'zairiq-zairiq-123-pixar-cars-bfdi (https://sketchfab.com/zairiqzairiqpixarcarsbfdi)',
    source: 'https://sketchfab.com/3d-models/man-tga-dump-truck-6e9329c43a3542d5a47b5d40d6c0a086',
    license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)'
  }
};

const json = Buffer.from(JSON.stringify(gltf));
const jsonChunk = Buffer.concat([json, Buffer.alloc(pad4(json.length) - json.length, 0x20)]);
const binChunk = Buffer.concat(chunks);
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
jh.writeUInt32LE(jsonChunk.length, 0); jh.write('JSON', 4);
bh.writeUInt32LE(binChunk.length, 0); bh.write('BIN\0', 4);
fs.writeFileSync(OUT, Buffer.concat([header, jh, jsonChunk, bh, binChunk]));
console.log(`${path.relative(root, OUT)}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${gltf.meshes.length} meshes, ${gltf.images.length} textures`);
