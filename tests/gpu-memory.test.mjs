import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

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
const { indexGeometry, flatGeometry, compactStaticGeometry, releaseRenderState, keepPipelinesOfReleasedObjects, flattenDraws, flatDrawStats, dropShaderModules, shaderModuleStats } = await import('../js/gpu-memory.js');

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

test('an object going away lets go of its render state, its pipeline staying compiled', () => {
  // (three.js' Pipelines as far as it matters here: delete() counts down, and at 0 the pipeline and its programs go)
  const pipeline = { usedTimes: 1, vertexProgram: { usedTimes: 1 }, fragmentProgram: { usedTimes: 1 } };
  const renderObject = {};
  const pipelines = {
    get: () => ({ pipeline }),
    delete() { pipeline.usedTimes--; pipeline.vertexProgram.usedTimes--; pipeline.fragmentProgram.usedTimes--; return 'deleted'; }
  };
  keepPipelinesOfReleasedObjects({ _pipelines: pipelines });
  const events = [];
  const mesh = { dispatchEvent: (e) => { events.push(e.type); pipelines.delete(renderObject); } };
  releaseRenderState(mesh);
  assert.deepEqual(events, ['dispose'], 'a plain mesh: the event its render objects listen for');
  assert.equal(pipeline.usedTimes, 1, 'the pipeline is still in use');
  assert.equal(pipeline.vertexProgram.usedTimes, 1);
  assert.equal(pipeline.fragmentProgram.usedTimes, 1);
  let disposed = 0;
  releaseRenderState({ isInstancedMesh: true, dispose() { disposed++; }, dispatchEvent() { assert.fail('its own dispose()'); } });
  assert.equal(disposed, 1);
  // Anything else (a material disposed for good) releases as ever
  assert.equal(pipelines.delete(renderObject), 'deleted');
  assert.equal(pipeline.usedTimes, 0);
});

test('what is torn down while playing releases its render state, what is built late is compacted', () => {
  const source = (f) => readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
  assert.match(source('world-stream.js'), /releaseRenderState\(m\)/);
  assert.match(source('missions.js'), /releaseRenderState\(o\)/);
  assert.match(source('main.js'), /keepPipelinesOfReleasedObjects\(renderer\)/);
  assert.match(source('main.js'), /if \(QUALITY\.flatDraws\) flattenDraws\(renderer\)/, 'the flat-draws profile, before anything is drawn');
  assert.match(source('main.js'), /if \(QUALITY\.dropShaderModules\) dropShaderModules\(renderer\)/, 'modules only while a pipeline is made');
  assert.match(source('quality.js'), /dropShaderModules: true/, 'on the mobile profile');
  assert.match(source('main.js'), /buildWinterScenery\(\);\s+finishLateScenery\(/, 'the winter scenery on the mobile profile');
});

test('indexGeometry leaves a geometry alone that is to stay flat (the terrain chunks on a phone)', () => {
  const flat = new THREE.BufferGeometry();
  flat.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3));
  assert.ok(indexGeometry(flat, { force: true }), 'without the mark it is indexed');
  flat.userData.keepFlat = true;
  assert.equal(indexGeometry(flat, { force: true }), null);
});

const DYNAMIC = 35048; // THREE.DynamicDrawUsage
function quad() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  return g;
}
const FLAT_QUAD = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0];

test('flatGeometry draws the same triangles without an index, and stays flat', () => {
  const g = quad();
  g.setAttribute('uv', new THREE.BufferAttribute(new Uint8Array([0, 0, 1, 0, 1, 1, 0, 1]), 2, true));
  const perInstance = new THREE.BufferAttribute(new Float32Array([1, 2, 3]), 3);
  perInstance.isInstancedBufferAttribute = true;
  g.setAttribute('aTint', perInstance);
  g.addGroup(0, 3, 0); g.addGroup(3, 3, 1);
  g.setDrawRange(3, 3);
  g.userData.lodLevels = [{ start: 0, count: 6 }];
  g.boundingBox = { min: [0, 0, 0], max: [1, 1, 0] };
  g.name = 'quad';
  const flat = flatGeometry(g);
  assert.equal(flat.index, null);
  assert.deepEqual(Array.from(flat.attributes.position.array), FLAT_QUAD);
  assert.ok(flat.attributes.uv.array instanceof Uint8Array && flat.attributes.uv.normalized, 'an attribute keeps its type');
  assert.deepEqual(Array.from(flat.attributes.uv.array), [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  assert.equal(flat.attributes.aTint, perInstance, 'an instanced attribute is shared, not written out');
  assert.deepEqual(flat.groups, g.groups);
  assert.deepEqual({ start: flat.drawRange.start, count: flat.drawRange.count }, { start: 3, count: 3 });
  assert.deepEqual(flat.userData.lodLevels, [{ start: 0, count: 6 }]);
  assert.equal(flat.boundingBox, g.boundingBox);
  assert.equal(flat.name, 'quad');
  assert.ok(flat.userData.keepFlat && g.disposed);
  assert.equal(indexGeometry(flat, { force: true }), null, 'stays flat');
});

test('flattenDraws writes out an indexed geometry the first time it is drawn, once for all who share it', () => {
  const drawn = [];
  const renderer = { renderObject(object, scene, camera, geometry, material, group, lightsNode, clipping, passId) { drawn.push({ object, geometry, passId }); return 'drawn'; } };
  flattenDraws(renderer);
  const shared = quad();
  const a = { geometry: shared }, b = { geometry: shared };
  const before = flatDrawStats();
  assert.equal(renderer.renderObject(a, 's', 'c', a.geometry, 'm', null, 'l', null, 'shadow'), 'drawn');
  renderer.renderObject(b, 's', 'c', b.geometry, 'm', null, 'l', null, null);
  renderer.renderObject(a, 's', 'c', a.geometry, 'm', null, 'l', null, null);
  assert.equal(a.geometry, b.geometry, 'one flat copy for both');
  assert.notEqual(a.geometry, shared);
  assert.equal(a.geometry.index, null);
  assert.deepEqual(Array.from(a.geometry.attributes.position.array), FLAT_QUAD);
  assert.deepEqual(drawn.map((d) => d.geometry), [a.geometry, a.geometry, a.geometry], 'the renderer only ever sees the flat one');
  assert.equal(drawn[0].passId, 'shadow', 'the rest of the arguments pass through');
  assert.ok(shared.disposed, 'the indexed one, never uploaded, is let go');
  const after = flatDrawStats();
  assert.equal(after.geometries - before.geometries, 1);
  assert.equal(after.bytes - before.bytes, 18 * 4);
  // Left as it is: a geometry with an attribute that is updated (its flat copy would never see the update)
  const dynamic = quad();
  dynamic.attributes.position.usage = DYNAMIC;
  const d = { geometry: dynamic };
  renderer.renderObject(d, 's', 'c', dynamic, 'm', null, 'l');
  assert.equal(d.geometry, dynamic);
  assert.equal(drawn[3].geometry, dynamic);
  assert.equal(flatDrawStats().kept - before.kept, 1);
  // ... and one whose arrays are released already
  const released = quad();
  released.index.array = new Uint16Array(0);
  renderer.renderObject({ geometry: released }, 's', 'c', released, 'm', null, 'l');
  assert.equal(drawn[4].geometry, released);
  // A flat geometry passes untouched
  const flat = new THREE.BufferGeometry();
  renderer.renderObject({ geometry: flat }, 's', 'c', flat, 'm', null, 'l');
  assert.equal(drawn[5].geometry, flat);
});

test('compactStaticGeometry on the flat-draws profile writes the index buffers out and still shrinks the normals', () => {
  const g = quad();
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(12).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  const mesh = { isMesh: true, geometry: g, userData: {}, children: [] };
  const stats = compactStaticGeometry([{ userData: {}, children: [mesh] }], { flat: true });
  assert.equal(stats.geometries, 1);
  assert.notEqual(mesh.geometry, g);
  assert.equal(mesh.geometry.index, null);
  assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), FLAT_QUAD);
  const nor = mesh.geometry.attributes.normal;
  assert.ok(nor.array instanceof Int8Array && nor.normalized && nor.count === 6);
  assert.equal(nor.array[2], 127);
  assert.ok(mesh.geometry.userData.keepFlat && g.disposed);
  assert.equal(stats.after, 6 * 12 + 6 * 3, 'float positions and byte normals, no index');
  // A flat one keeps its data and only loses the float normals
  const flat = new THREE.BufferGeometry();
  flat.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  flat.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
  const plain = { isMesh: true, geometry: flat, userData: {}, children: [] };
  compactStaticGeometry([{ userData: {}, children: [plain] }], { flat: true });
  assert.equal(plain.geometry, flat);
  assert.ok(flat.attributes.normal.array instanceof Int8Array);
});

test('dropShaderModules makes a program\'s module for the pipeline that asks and lets it go after that task', async () => {
  const made = [];
  const device = { createShaderModule(desc) { made.push(desc); return { desc }; } };
  const data = new Map();
  const backend = { isWebGPUBackend: true, device, get(k) { if (!data.has(k)) data.set(k, {}); return data.get(k); }, createProgram() { throw new Error('three.js own'); } };
  assert.equal(dropShaderModules({ backend }), true);
  assert.equal(dropShaderModules({ backend: { isWebGLBackend: true, createProgram() {} } }), false, 'WebGPU only');
  const program = { stage: 'fragment', name: 'Terrain', code: 'fn main() {}' };
  const before = shaderModuleStats();
  backend.createProgram(program);
  const gpu = backend.get(program).module;
  assert.equal(gpu.entryPoint, 'main');
  assert.equal(made.length, 0, 'nothing compiled until a pipeline asks');
  const first = gpu.module;
  assert.equal(gpu.module, first, 'read twice while the pipeline is made: one module');
  assert.deepEqual(made, [{ label: 'fragment_Terrain', code: 'fn main() {}' }]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.notEqual(gpu.module, first, 'the next pipeline with this program gets a fresh one');
  assert.equal(made.length, 2);
  const after = shaderModuleStats();
  assert.equal(after.programs - before.programs, 1);
  assert.equal(after.made - before.made, 2);
});
