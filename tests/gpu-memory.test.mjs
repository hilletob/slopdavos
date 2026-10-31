import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

// js/gpu-memory.js only needs three.js' plain geometry containers: a small stand-in lets Node load it
const three = encodeURIComponent(`
export const StaticDrawUsage = 35044;
export class BufferAttribute {
  constructor(array, itemSize, normalized = false) { this.array = array; this.itemSize = itemSize; this.normalized = normalized; this.count = array.length / itemSize; this.usage = StaticDrawUsage; this.isBufferAttribute = true; this.name = ""; }
}
export class BufferGeometry {
  constructor() { this.isBufferGeometry = true; this.attributes = {}; this.index = null; this.groups = []; this.morphAttributes = {}; this.drawRange = { start: 0, count: Infinity }; this.userData = {}; this.name = ""; }
  setAttribute(n, a) { this.attributes[n] = a; return this; }
  setIndex(i) { this.index = i; return this; }
  addGroup(start, count, materialIndex) { this.groups.push({ start, count, materialIndex }); }
  setDrawRange(start, count) { this.drawRange = { start, count }; }
  dispose() { this.disposed = true; }
}`);
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, next) { return s === 'three/webgpu' ? { url: 'data:text/javascript,${three}', shortCircuit: true } : next(s, c); }`)}`);
const THREE = await import('three/webgpu');
const { indexGeometry, compactStaticGeometry } = await import('../js/gpu-memory.js');

// A draped strip as drapeOverlay leaves it: non-indexed triangles, every inner corner repeated (n quads, 6 corners each)
function strip(n) {
  const pos = [], nor = [], uv = [];
  const corner = (i, side) => { pos.push(i * 4, Math.sin(i) * 0.3, side * 3); const l = Math.hypot(0.1, 1, 0.05 * i); nor.push(0.1 / l, 1 / l, 0.05 * i / l); uv.push(side, i * 4); };
  for (let i = 0; i < n; i++) { corner(i, 0); corner(i + 1, 1); corner(i + 1, 0); corner(i, 0); corner(i, 1); corner(i + 1, 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  return g;
}

test('indexGeometry shares the equal corners and draws the very same triangles', () => {
  const g = strip(40);
  g.addGroup(0, 120, 0); g.addGroup(120, 120, 1);
  const out = indexGeometry(g);
  assert.ok(out, 'a strip saves');
  assert.equal(out.attributes.position.count, 82, 'two rows of 41 nodes');
  assert.equal(out.index.count, 240);
  for (let k = 0; k < 240; k++) {
    const v = out.index.array[k];
    for (const name of ['position', 'normal', 'uv']) {
      const a = g.attributes[name], b = out.attributes[name], s = a.itemSize;
      for (let c = 0; c < s; c++) assert.equal(b.array[v * s + c], a.array[k * s + c], `${name} of corner ${k}`);
    }
  }
  assert.deepEqual(out.groups, g.groups, 'groups keep their ranges');
  assert.ok(out.index.array instanceof Uint16Array);
});

test('indexGeometry leaves alone what would not save (unless forced) and what is indexed already', () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Array.from({ length: 36 }, (_, i) => i)), 3));
  assert.equal(indexGeometry(g), null, 'no corner repeats');
  const forced = indexGeometry(g, { force: true });
  assert.equal(forced.index.count, 12);
  assert.equal(indexGeometry(forced), null, 'indexed already');
});

test('compactStaticGeometry indexes the static meshes and keeps their normals in bytes', () => {
  const mesh = { isMesh: true, geometry: strip(100), userData: {}, children: [] };
  mesh.geometry.isBufferGeometry = true;
  const instanced = { isMesh: true, isInstancedMesh: true, geometry: strip(10), userData: {}, children: [] };
  const kept = { isMesh: true, geometry: strip(10), userData: { keepCpu: true }, children: [] };
  const root = { userData: {}, children: [mesh, instanced, kept] };
  const before = mesh.geometry;
  const stats = compactStaticGeometry([root]);
  assert.equal(stats.geometries, 1);
  assert.ok(stats.after < stats.before / 3, `${stats.before} -> ${stats.after} bytes`);
  const nor = mesh.geometry.attributes.normal;
  assert.ok(nor.array instanceof Int8Array && nor.normalized);
  const v = mesh.geometry.index.array[7], f = before.attributes.normal.array;
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(nor.array[v * 3 + c] / 127 - f[7 * 3 + c]) <= 0.5 / 127 + 1e-6);
  assert.ok(before.disposed);
  assert.equal(instanced.geometry.index, null, 'instanced meshes are left alone');
  assert.equal(kept.geometry.index, null, 'userData.keepCpu');
});
