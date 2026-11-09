// Builds assets/models/rocketbox-<name>.glb, one Microsoft Rocketbox avatar as a figure of the game's own crowds
// (js/pedestrians.js PersonCrowd with dress.model, loaded by js/person-models.js).
//
// Source: Microsoft Rocketbox Avatar Library, https://github.com/microsoft/Microsoft-Rocketbox, MIT licence
// (Copyright (c) Microsoft Corporation) — the credit stays in the file's asset.extras. The avatar's folder goes to
// tools/data/cache/rocketbox/<Avatar>/ (Export/<Avatar>.fbx and Textures/*_color.tga, flat):
//   B=https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars/Professions/Police_Male_01
//   curl -O $B/Export/Police_Male_01.fbx; curl -O $B/Textures/m220_{body,head,equipment,pistol}_color.tga
//
// A Rocketbox avatar is a 3ds Max biped (80 bones with fingers & face, cm, A-pose) with 2048² textures; the game's
// people are skinned to 15 bones with two influences and posed by PersonRig's IK about fixed bind joints
// (js/pedestrians.js bindJoints, the male body). So here:
//   - every biped bone goes to one of the 15 (spine & clavicles to the chest, neck & face to the head, hand & fingers to
//     the forearm, ...), its weights summed;
//   - the body is moved into the game's bind pose: each of the 15 bones maps its part of the mesh from the biped's
//     joints onto the game's (the limbs turned onto the game's straight legs & arms hanging 8 degrees out, stretched to
//     its segment lengths; the torso stretched in height from hips to shoulders), the vertices blended by their
//     weights, so knees, elbows & shoulders bend where PersonRig bends them;
//   - the two strongest bones of a vertex are kept (vec4 _SKIN: bone a, bone b, weight of b, part: HEAD for the head
//     material, BODY for the rest);
//   - the colour maps (normal & specular maps are dropped) go into one atlas, embedded as a WebP with alpha
//     (baseColorTexture, EXT_texture_webp): body & head 512² side by side, any other materials (equipment, the
//     opacity map's hair strands & lashes, ...) side by side in a row of 512 below; with an opacity map the material
//     is alpha-tested and double-sided;
//   - a female avatar (by its name) goes onto the female bind pose; every avatar is built at the bind pose's size, its
//     own size the PersonRig scale in asset.extras (scale; female, label).
// No decimation: the hipoly meshes are ~7-9k triangles.
// Usage: node tools/build-rocketbox.mjs [Avatar] [out-name]   (default Police_Male_01 police-m01)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import sharp from 'sharp';
import { PART, avatarRig, loadFbx, targetOf } from './rocketbox-rig.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AVATAR = process.argv[2] || 'Police_Male_01';
const NAME = process.argv[3] || 'police-m01';
const SRC = path.join(root, 'tools/data/cache/rocketbox', AVATAR);
const OUT = path.join(root, `assets/models/rocketbox-${NAME}.glb`);

// ---- read the FBX, map the biped onto the game's skeleton (tools/rocketbox-rig.mjs) ---------------------------------
const FEMALE = /female/i.test(AVATAR);
const { mesh, MAP, torsoK, scale } = avatarRig(loadFbx(path.join(SRC, `${AVATAR}.fbx`)), { female: FEMALE });
const g = mesh.geometry;
const materials = [mesh.material].flat().map((m) => m.name.replace(/^[mf]\d+_/, ''));
const boneTarget = mesh.skeleton.bones.map((b) => targetOf(b.name));

// ---- vertices: bind pose, weights to the 15, mapped & blended ------------------------------------------------------
const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
const n = P.count;
const bindN = new THREE.Matrix3().getNormalMatrix(mesh.bindMatrix);
const matOf = new Int32Array(n);
for (const gr of g.groups) matOf.fill(gr.materialIndex, gr.start, gr.start + gr.count);

// atlas: body & head above, the others in a row below; rectangles in px (top-left origin)
const extra = materials.filter((m) => m !== 'body' && m !== 'head');
const AW = 1024, AH = extra.length ? 1024 : 512;
const RECT = { body: [0, 0, 512, 512], head: [512, 0, 512, 512] };
extra.forEach((m, i) => { RECT[m] = [Math.round((i * AW) / extra.length), 512, Math.round(AW / extra.length), 512]; });
for (const m of ['body', 'head']) if (!materials.includes(m)) throw new Error('no material ' + m);

const pos = [], nor = [], uvs = [], skin = [];
const p = new THREE.Vector3(), nv = new THREE.Vector3(), acc = new THREE.Vector3(), accN = new THREE.Vector3();
const w15 = new Float64Array(15);
for (let i = 0; i < n; i++) {
  p.fromBufferAttribute(P, i).applyMatrix4(mesh.bindMatrix);
  nv.fromBufferAttribute(N, i).applyMatrix3(bindN).normalize();
  w15.fill(0);
  for (let k = 0; k < 4; k++) w15[boneTarget[SI.getComponent(i, k)]] += SW.getComponent(i, k);
  let sum = 0;
  for (let b = 0; b < 15; b++) sum += w15[b];
  acc.set(0, 0, 0);
  accN.set(0, 0, 0);
  for (let b = 0; b < 15; b++) {
    if (!w15[b]) continue;
    const w = w15[b] / sum;
    acc.addScaledVector(MAP[b].fn(p), w);
    accN.addScaledVector(nv.clone().applyQuaternion(MAP[b].q), w);
  }
  pos.push(acc.x, acc.y, acc.z);
  accN.normalize();
  nor.push(accN.x, accN.y, accN.z);
  // the two strongest bones
  let a = 0, b2 = -1;
  for (let b = 1; b < 15; b++) if (w15[b] > w15[a]) a = b;
  for (let b = 0; b < 15; b++) if (b !== a && w15[b] > 0 && (b2 < 0 || w15[b] > w15[b2])) b2 = b;
  const wb = b2 < 0 ? 0 : w15[b2] / (w15[a] + w15[b2]);
  const mat = materials[matOf[i]];
  skin.push(a, b2 < 0 ? a : b2, wb, mat === 'head' ? PART.HEAD : PART.BODY);
  const [x0, y0, w, h] = RECT[mat];
  uvs.push((x0 + UV.getX(i) * w) / AW, (y0 + (1 - UV.getY(i)) * h) / AH); // glTF: v from the top
}

// weld identical vertices
const key = (i) => [...pos.slice(i * 3, i * 3 + 3), ...nor.slice(i * 3, i * 3 + 3), ...uvs.slice(i * 2, i * 2 + 2), ...skin.slice(i * 4, i * 4 + 4)]
  .map((v) => Math.round(v * 1e5)).join(',');
const seen = new Map(), oPos = [], oNor = [], oUv = [], oSkin = [], oIdx = [];
for (let i = 0; i < n; i++) {
  const k = key(i);
  let j = seen.get(k);
  if (j === undefined) {
    j = oPos.length / 3;
    seen.set(k, j);
    oPos.push(...pos.slice(i * 3, i * 3 + 3));
    oNor.push(...nor.slice(i * 3, i * 3 + 3));
    oUv.push(...uvs.slice(i * 2, i * 2 + 2));
    oSkin.push(...skin.slice(i * 4, i * 4 + 4));
  }
  oIdx.push(j);
}
const nOut = oPos.length / 3;
if (nOut > 65535) throw new Error('too many vertices for 16-bit indices');

// ---- the atlas -----------------------------------------------------------------------------------------------------
function readTga(file) {
  const b = fs.readFileSync(file);
  const idLen = b[0], cmap = b[1], type = b[2], w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], desc = b[17];
  if (cmap || (type !== 2 && type !== 10) || (bpp !== 24 && bpp !== 32)) throw new Error(`unsupported TGA ${file}: type ${type}, ${bpp} bpp`);
  const c = bpp / 8, px = Buffer.alloc(w * h * 4);
  let o = 18 + idLen, k = 0;
  const put = (s) => { px[k * 4] = b[s + 2]; px[k * 4 + 1] = b[s + 1]; px[k * 4 + 2] = b[s]; px[k * 4 + 3] = c === 4 ? b[s + 3] : 255; k++; };
  if (type === 2) for (; k < w * h; o += c) put(o);
  else while (k < w * h) {
    const hd = b[o++], cnt = (hd & 0x7f) + 1;
    if (hd & 0x80) { for (let r = 0; r < cnt; r++) put(o); o += c; } else for (let r = 0; r < cnt; r++, o += c) put(o);
  }
  if (!(desc & 0x20)) { // bottom-up rows: flip
    const row = w * 4, t = Buffer.alloc(row);
    for (let y = 0; y < h / 2; y++) {
      const a1 = y * row, a2 = (h - 1 - y) * row;
      px.copy(t, 0, a1, a1 + row); px.copy(px, a1, a2, a2 + row); t.copy(px, a2);
    }
  }
  return { image: sharp(px, { raw: { width: w, height: h, channels: 4 } }), alpha: c === 4 };
}
const tgaFor = (m) => {
  const f = fs.readdirSync(SRC).find((x) => x.endsWith(`_${m}_color.tga`));
  if (!f) throw new Error(`no ${m}_color.tga in ${SRC}`);
  return path.join(SRC, f);
};
let ALPHA = false;
const layers = await Promise.all(materials.map(async (m) => {
  const [x, y, w, h] = RECT[m];
  const { image, alpha } = readTga(tgaFor(m));
  if (alpha) ALPHA = true;
  return { input: await image.resize(w, h, { kernel: 'lanczos3' }).png().toBuffer(), left: x, top: y };
}));
// (on a clear canvas: the opacity map's alpha stays the atlas's)
const atlas = await sharp({ create: { width: AW, height: AH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(layers).webp({ quality: 88, alphaQuality: 95, effort: 6 }).toBuffer();

// ---- GLB -----------------------------------------------------------------------------------------------------------
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
  const min = new Array(k).fill(Infinity), max = new Array(k).fill(-Infinity);
  for (let i = 0; i < arr.length; i += k) for (let j = 0; j < k; j++) { min[j] = Math.min(min[j], arr[i + j]); max[j] = Math.max(max[j], arr[i + j]); }
  return { min: min.map((v) => Math.fround(v)), max: max.map((v) => Math.fround(v)) };
};
const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
const accessors = [
  { bufferView: addView(f32(oPos), 34962), componentType: 5126, count: nOut, type: 'VEC3', ...bounds(oPos, 3) },
  { bufferView: addView(f32(oNor), 34962), componentType: 5126, count: nOut, type: 'VEC3' },
  { bufferView: addView(f32(oUv), 34962), componentType: 5126, count: nOut, type: 'VEC2' },
  { bufferView: addView(f32(oSkin), 34962), componentType: 5126, count: nOut, type: 'VEC4' },
  { bufferView: addView(Buffer.from(new Uint16Array(oIdx).buffer), 34963), componentType: 5123, count: oIdx.length, type: 'SCALAR' }
];
const imageView = addView(atlas);
const binary = Buffer.concat(chunks);
const out = {
  asset: {
    version: '2.0',
    generator: 'tools/build-rocketbox.mjs (re-skinned to the 15 bones of js/pedestrians.js, moved into its bind pose, colour atlas)',
    extras: {
      title: `Microsoft Rocketbox Avatar Library: ${AVATAR}`,
      source: `https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars (${AVATAR})`,
      license: 'MIT, Copyright (c) Microsoft Corporation',
      modified: 'skeleton reduced to 15 bones, re-posed, textures downscaled into one atlas; tools/build-rocketbox.mjs',
      female: FEMALE,
      scale: +scale.toFixed(4)
    }
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: `rocketbox-${NAME}`, mesh: 0 }],
  meshes: [{ name: `rocketbox-${NAME}`, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, _SKIN: 3 }, indices: 4, material: 0, mode: 4 }] }],
  materials: [{
    name: AVATAR, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8 },
    ...(ALPHA ? { alphaMode: 'MASK', alphaCutoff: 0.5, doubleSided: true } : {})
  }],
  textures: [{ sampler: 0, extensions: { EXT_texture_webp: { source: 0 } } }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  images: [{ bufferView: imageView, mimeType: 'image/webp' }],
  extensionsUsed: ['EXT_texture_webp'],
  extensionsRequired: ['EXT_texture_webp'],
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
const top = bounds(oPos, 3).max[1];
console.log(`${path.relative(root, OUT)}: ${oIdx.length / 3} triangles, ${nOut} vertices (${n} in the source), ` +
  `${(fs.statSync(OUT).size / 1024).toFixed(0)} KB (atlas ${(atlas.length / 1024).toFixed(0)} KB${ALPHA ? ', alpha' : ''}); ` +
  `height ${(top * scale).toFixed(3)} m (scale ${scale.toFixed(3)}${FEMALE ? ', female' : ''}), torso stretch ${torsoK.toFixed(3)}; materials ${materials.join(', ')}`);
