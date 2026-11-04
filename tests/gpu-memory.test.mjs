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
const { indexGeometry, flatGeometry, compactStaticGeometry, releaseRenderState, keepPipelinesOfReleasedObjects } = await import('../js/gpu-memory.js');

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
  assert.match(source('main.js'), /buildWinterScenery\(\);\s+finishLateScenery\(/, 'the winter scenery on the mobile profile');
});

test('indexGeometry leaves a geometry alone that is to stay flat (the terrain chunks on a phone)', () => {
  const flat = new THREE.BufferGeometry();
  flat.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3));
  assert.ok(indexGeometry(flat, { force: true }), 'without the mark it is indexed');
  flat.userData.keepFlat = true;
  assert.equal(indexGeometry(flat, { force: true }), null);
});

test('flatGeometry draws the same triangles without an index, and stays flat', () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  // (the test's three.js stub has no toNonIndexed: the corners written out in index order by hand)
  g.toNonIndexed = () => {
    const flat = new THREE.BufferGeometry(), src = g.attributes.position.array, out = [];
    for (const i of [0, 1, 2, 0, 2, 3]) out.push(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
    flat.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
    return flat;
  };
  g.setDrawRange(3, 3);
  g.userData.lodLevels = [{ start: 0, count: 6 }];
  g.boundingBox = { min: [0, 0, 0], max: [1, 1, 0] };
  const flat = flatGeometry(g);
  assert.equal(flat.index, null);
  assert.deepEqual(Array.from(flat.attributes.position.array), [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]);
  assert.deepEqual({ start: flat.drawRange.start, count: flat.drawRange.count }, { start: 3, count: 3 });
  assert.deepEqual(flat.userData.lodLevels, [{ start: 0, count: 6 }]);
  assert.equal(flat.userData.keepFlat, true);
  assert.equal(flat.boundingBox, g.boundingBox);
  assert.equal(indexGeometry(flat, { force: true }), null);
});
