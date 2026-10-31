// Builds assets/models/citaro-530-lite.glb from assets/models/citaro-530.glb ("Low Poly Mercedes-Benz Citaro 530" by
// giosassets, https://sketchfab.com/giosassets, CC BY 4.0 — the credit and licence stay in the file's asset.extras).
// The model's body has ~6.4k triangles, but its four tyres ~42.7k (tread and sidewall detail no one sees at the size of
// a bus in the city): they are replaced here by plain capped cylinders fitted to each wheel (~80 triangles each). The
// ground plane and the unused texture coordinates are left out; the body's meshes are copied unchanged.
// No dependencies: the GLB's JSON and binary chunks are rewritten directly.  Usage: node tools/build-citaro-lite.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets/models/citaro-530.glb'), OUT = path.join(root, 'assets/models/citaro-530-lite.glb');
const SEGMENTS = 20;

const glb = fs.readFileSync(SRC);
const jsonLen = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8, bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));

// Column-major 4×4 matrices (glTF), world matrices of the nodes
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const local = (n) => {
  if (n.matrix) return n.matrix;
  if (n.translation || n.rotation || n.scale) throw new Error('TRS nodes not handled');
  return I;
};
const world = new Map();
const walk = (i, parent) => { const m = mul(parent, local(gltf.nodes[i])); world.set(i, m); for (const c of gltf.nodes[i].children || []) walk(c, m); };
for (const i of gltf.scenes[gltf.scene || 0].nodes) walk(i, I);

const readVec3 = (accessorIndex) => {
  const a = gltf.accessors[accessorIndex], v = gltf.bufferViews[a.bufferView];
  const stride = v.byteStride || 12, base = (v.byteOffset || 0) + (a.byteOffset || 0), out = [];
  for (let i = 0; i < a.count; i++) out.push([0, 1, 2].map((k) => bin.readFloatLE(base + i * stride + k * 4)));
  return out;
};
const apply = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

const TYRE = gltf.materials.findIndex((m) => m.name === 'Material.006');
const GROUND = gltf.materials.findIndex((m) => m.name === 'Material.007');
// The tyre vertices in world space (y up, the bus along z, x across)
const tyreNodes = [], dropNodes = [];
const pts = [];
gltf.nodes.forEach((n, i) => {
  if (n.mesh === undefined) return;
  const mats = gltf.meshes[n.mesh].primitives.map((p) => p.material);
  if (mats.includes(TYRE)) { tyreNodes.push(i); for (const p of gltf.meshes[n.mesh].primitives) for (const q of readVec3(p.attributes.POSITION)) pts.push(apply(world.get(i), q)); }
  else if (mats.includes(GROUND)) dropNodes.push(i);
});
// Four wheels: left/right of the centre line, front/rear axle (split at the middle of the tyres' z range)
let zMin = Infinity, zMax = -Infinity;
for (const p of pts) { zMin = Math.min(zMin, p[2]); zMax = Math.max(zMax, p[2]); }
const zMid = (zMin + zMax) / 2;
const wheels = new Map();
for (const p of pts) {
  const k = `${p[0] < 0 ? 'L' : 'R'}${p[2] < zMid ? 'B' : 'F'}`;
  const w = wheels.get(k) || { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < 3; i++) { w.min[i] = Math.min(w.min[i], p[i]); w.max[i] = Math.max(w.max[i], p[i]); }
  wheels.set(k, w);
}

// Capped cylinders along x (non-indexed: position, normal)
const pos = [], nor = [];
const tri = (a, b, c, n) => { pos.push(...a, ...b, ...c); nor.push(...(n || [0, 0, 0]), ...(n || [0, 0, 0]), ...(n || [0, 0, 0])); };
for (const [key, w] of wheels) {
  const cy = (w.min[1] + w.max[1]) / 2, cz = (w.min[2] + w.max[2]) / 2;
  const r = Math.max(w.max[1] - w.min[1], w.max[2] - w.min[2]) / 2;
  const x0 = w.min[0], x1 = w.max[0];
  console.log(`wheel ${key}: x ${x0.toFixed(3)}…${x1.toFixed(3)}, centre y ${cy.toFixed(3)} z ${cz.toFixed(3)}, r ${r.toFixed(3)}`);
  for (let s = 0; s < SEGMENTS; s++) {
    const a0 = (s / SEGMENTS) * Math.PI * 2, a1 = ((s + 1) / SEGMENTS) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p = (x, c, sn) => [x, cy + c * r, cz + sn * r];
    // tread (smooth normals per vertex)
    const n0 = [0, c0, s0], n1 = [0, c1, s1];
    pos.push(...p(x0, c0, s0), ...p(x0, c1, s1), ...p(x1, c1, s1), ...p(x0, c0, s0), ...p(x1, c1, s1), ...p(x1, c0, s0));
    nor.push(...n0, ...n1, ...n1, ...n0, ...n1, ...n0);
    // the two sidewalls, facing out (±x)
    tri([x1, cy, cz], p(x1, c0, s0), p(x1, c1, s1), [1, 0, 0]);
    tri([x0, cy, cz], p(x0, c1, s1), p(x0, c0, s0), [-1, 0, 0]);
  }
}
// (the winding of the tread: counter-clockwise from outside — checked against the normal of the first triangle)
{
  const a = pos.slice(0, 3), b = pos.slice(3, 6), c = pos.slice(6, 9);
  const u = b.map((v, i) => v - a[i]), v = c.map((x, i) => x - a[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[0] * nor[0] + n[1] * nor[1] + n[2] * nor[2] < 0) {
    for (let t = 0; t < pos.length; t += 9) for (let k = 0; k < 3; k++) { const tmp = pos[t + 3 + k]; pos[t + 3 + k] = pos[t + 6 + k]; pos[t + 6 + k] = tmp; }
    for (let t = 0; t < nor.length; t += 9) for (let k = 0; k < 3; k++) { const tmp = nor[t + 3 + k]; nor[t + 3 + k] = nor[t + 6 + k]; nor[t + 6 + k] = tmp; }
  }
}

// The new file: the body's primitives (POSITION, NORMAL, indices) copied over, the cylinders appended
const chunks = [], views = [], accessors = [];
let offset = 0;
const addView = (buf, target, byteStride) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(byteStride ? { byteStride } : {}), target });
  chunks.push(buf); offset += buf.length;
  return views.length - 1;
};
const copyAccessor = (index, target) => {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type] * { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
  const stride = v.byteStride || size, base = (v.byteOffset || 0) + (a.byteOffset || 0);
  const out = Buffer.alloc(size * a.count);
  for (let i = 0; i < a.count; i++) bin.copy(out, i * size, base + i * stride, base + i * stride + size);
  accessors.push({ ...a, bufferView: addView(out, target), byteOffset: undefined });
  return accessors.length - 1;
};
const meshes = [];
const meshMap = new Map();
gltf.nodes.forEach((n) => {
  if (n.mesh === undefined || meshMap.has(n.mesh)) return;
  const m = gltf.meshes[n.mesh];
  if (m.primitives.some((p) => p.material === TYRE || p.material === GROUND)) return;
  meshes.push({ name: m.name, primitives: m.primitives.map((p) => ({
    attributes: { POSITION: copyAccessor(p.attributes.POSITION, 34962), NORMAL: copyAccessor(p.attributes.NORMAL, 34962) },
    ...(p.indices !== undefined ? { indices: copyAccessor(p.indices, 34963) } : {}),
    material: p.material, mode: p.mode
  })) });
  meshMap.set(n.mesh, meshes.length - 1);
});
const f32 = (arr) => Buffer.from(new Float32Array(arr).buffer);
const bounds = (arr) => { const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], arr[i + k]); max[k] = Math.max(max[k], arr[i + k]); } return { min, max }; };
accessors.push({ bufferView: addView(f32(pos), 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', ...bounds(pos) });
accessors.push({ bufferView: addView(f32(nor), 34962), componentType: 5126, count: nor.length / 3, type: 'VEC3', ...bounds(nor) });
meshes.push({ name: 'Tires_lite', primitives: [{ attributes: { POSITION: accessors.length - 2, NORMAL: accessors.length - 1 }, material: TYRE, mode: 4 }] });
for (const a of accessors) delete a.byteOffset;

const nodes = gltf.nodes.map((n) => {
  const o = { ...n };
  delete o.mesh;
  if (n.mesh !== undefined && meshMap.has(n.mesh)) o.mesh = meshMap.get(n.mesh);
  return o;
});
nodes.push({ name: 'Tires_lite', mesh: meshes.length - 1 }); // (in world space: a root of the scene)
const scenes = gltf.scenes.map((s, i) => (i === (gltf.scene || 0) ? { ...s, nodes: [...s.nodes, nodes.length - 1] } : s));
const binary = Buffer.concat(chunks);
const out = {
  asset: { ...gltf.asset, generator: `${gltf.asset.generator}; tools/build-citaro-lite.mjs (tyres simplified)` },
  scene: gltf.scene || 0, scenes, nodes, meshes, materials: gltf.materials, accessors, bufferViews: views,
  buffers: [{ byteLength: binary.length }]
};
let json = Buffer.from(JSON.stringify(out), 'utf8');
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const binPadded = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.writeFileSync(OUT, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(binPadded.length, 0x004e4942), binPadded]));
const tris = meshes.reduce((n, m) => n + m.primitives.reduce((k, p) => k + (p.indices !== undefined ? accessors[p.indices].count : accessors[p.attributes.POSITION].count) / 3, 0), 0);
console.log(`${path.relative(root, OUT)}: ${tris} triangles, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB (from ${(glb.length / 1024).toFixed(0)} KB)`);
