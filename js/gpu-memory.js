import * as THREE from 'three/webgpu';

// js/gpu-memory.js
// Static scenery doesn't need its vertex data in JavaScript once the GPU has it: three.js keeps every BufferAttribute's
// array for good (~0.5 GB here, beside the same bytes on the GPU). releaseUploadedGeometry() swaps the arrays of
// attributes the renderer has already uploaded, and that nothing updates, for empty arrays of the same type: the GPU
// buffer, the attribute's count, item size and type (all three.js reads when it builds a pipeline later) stay.
//
// Only for what nothing reads on the CPU any more: raycasts (shops.js against the buildings), collisions and height
// queries use their own data (colliders, terrain grid), and the callers pass just the static roots. Geometries get
// their bounding volumes first (culling needs them). An object can opt out with userData.keepCpu.

const released = new WeakSet();
const stats = { geometries: 0, attributes: 0, bytes: 0 };

function uploaded(renderer, attribute) {
  const map = renderer._attributes; // (three.js' Attributes: a DataMap of what the backend created)
  if (!map || !map.has(attribute)) return false;
  return map.get(attribute).version === attribute.version;
}

function releasable(attribute) {
  return attribute && attribute.isBufferAttribute && !attribute.isInstancedBufferAttribute && !attribute.isInterleavedBufferAttribute &&
    !attribute.isStorageBufferAttribute && attribute.usage === THREE.StaticDrawUsage && attribute.array && attribute.array.length > 0;
}

// A later update would upload nothing: never expected for released (static) data, so say so (one shared descriptor:
// thousands of attributes get it)
const REFUSE_UPDATE = {
  configurable: true,
  set(value) { if (value) console.warn('[gpu-memory] update of a released attribute ignored:', this.name || this.id); }
};
function release(attribute) {
  const bytes = attribute.array.byteLength;
  attribute.array = new attribute.array.constructor(0);
  Object.defineProperty(attribute, 'needsUpdate', REFUSE_UPDATE);
  return bytes;
}

/**
 * Releases the CPU copies of the uploaded static vertex and index data under `roots` (skipping subtrees for which
 * `skip(object)` is true). Safe to call repeatedly (e.g. as more gets drawn): returns the bytes released this call.
 */
export function releaseUploadedGeometry(renderer, roots, { skip = () => false } = {}) {
  let bytes = 0;
  const visit = (o) => {
    if (o.userData?.keepCpu || skip(o)) return;
    const g = o.geometry;
    if (g && g.isBufferGeometry && !released.has(g) && !o.isSkinnedMesh && !o.isPoints && !o.isLine && !o.morphTargetInfluences &&
        Object.keys(g.morphAttributes).length === 0) {
      // (attributes the material doesn't read are never uploaded: they stay, in case another material wants them)
      const attrs = [...Object.values(g.attributes), g.index].filter(releasable);
      const ready = attrs.filter((a) => uploaded(renderer, a));
      if (ready.length) {
        if (!g.boundingSphere) g.computeBoundingSphere();
        if (!g.boundingBox) g.computeBoundingBox();
        for (const a of ready) { bytes += release(a); stats.attributes++; }
        if (ready.length === attrs.length) { released.add(g); stats.geometries++; }
      }
    }
    for (const c of o.children) visit(c);
  };
  for (const root of roots) if (root) visit(root);
  stats.bytes += bytes;
  return bytes;
}

// (see releaseRenderState: the pipelines stay compiled)
let keepingPipelines = false;
/** To be called once the renderer is initialised (three.js' Pipelines: usedTimes counts the render objects on a pipeline) */
export function keepPipelinesOfReleasedObjects(renderer) {
  const pipelines = renderer._pipelines;
  if (!pipelines) return;
  const remove = pipelines.delete;
  pipelines.delete = function (renderObject) {
    const pipeline = keepingPipelines ? this.get(renderObject).pipeline : null;
    if (pipeline && !pipeline.isComputePipeline) {
      pipeline.usedTimes++;
      pipeline.vertexProgram.usedTimes++;
      pipeline.fragmentProgram.usedTimes++;
    }
    return remove.call(this, renderObject);
  };
}

/**
 * For an object going away for good while its material stays (the streamed cells', the missions' shared ones): three.js
 * keeps a drawn object's render state (its bindings and uniform buffers on the GPU, node state in JavaScript) until
 * the object or its material is disposed. Disposing the geometry doesn't do that and a plain Mesh has no dispose(),
 * so all of it stayed for good, a few GPU buffers an object.
 * The compiled pipeline stays (keepPipelinesOfReleasedObjects): the next cell with that material would otherwise compile
 * the same shaders again, and on a phone compiling is the dangerous and slow part. There are only so many of them.
 */
export function releaseRenderState(object) {
  keepingPipelines = true;
  try {
    if (object.isInstancedMesh) object.dispose();
    else object.dispatchEvent({ type: 'dispose' });
  } finally {
    keepingPipelines = false;
  }
}

/** What has been released so far: { geometries, attributes, bytes } */
export const releasedGeometryStats = () => ({ ...stats });

/**
 * Lets `texture` drop its CPU-side pixels once they are on the GPU: an ImageBitmap is closed, an image element or a
 * DataTexture's arrays (and mipmaps) are let go, leaving a stand-in with the same size. For textures nobody updates
 * again (orthophotos, roof crops, the leaf atlas); a later update would have nothing to upload, so it is refused.
 */
export function releaseImageAfterUpload(texture) {
  const previous = texture.onUpdate;
  texture.onUpdate = function (t) {
    previous?.call(this, t);
    if (t.source?.dataReady === false) return;
    const image = t.image;
    if (!image || image.released) return;
    const standIn = { width: image.width, height: image.height, released: true };
    if (ArrayBuffer.isView(image.data)) standIn.data = new image.data.constructor(0);
    t.image = standIn;
    if (t.mipmaps?.length) t.mipmaps = t.mipmaps.map((m) => (ArrayBuffer.isView(m.data) ? { width: m.width, height: m.height, data: new m.data.constructor(0) } : m));
    if (typeof image.close === 'function') image.close(); // (ImageBitmap)
    Object.defineProperty(t, 'needsUpdate', {
      configurable: true,
      set(value) { if (value) console.warn('[gpu-memory] update of a released texture ignored:', t.name || t.uuid); }
    });
  };
  return texture;
}

// --- Compact vertex data (the mobile profile, js/quality.js) --------------------------------------------------------------
// The draped ground layers, streams and golf course are built non-indexed (subdivided triangles, each with its own three
// vertices) with float normals: ~32 bytes a corner. indexGeometry() shares the corners that are equal in every attribute
// (a subdivided strip: ~5 corners a vertex) and quantizeNormals() keeps the normals in 8 bits (snorm, as the terrain's):
// a quarter to a third of the memory on the CPU and the GPU, the same picture.

const scratch = { table: new Int32Array(0), firstOf: new Int32Array(0) };
const _bits = new Map(); // array -> Uint32Array view of its bytes (float arrays: compared bit for bit)
function wordsOf(array) {
  if (!(array instanceof Float32Array)) return array;
  let w = _bits.get(array);
  if (!w) { w = new Uint32Array(array.buffer, array.byteOffset, array.length); _bits.set(array, w); }
  return w;
}

/**
 * An indexed copy of the non-indexed `geometry` whose vertices equal in every attribute are shared, or null when it
 * would not save at least a fifth (or the geometry can't be: indexed already, morph targets, interleaved attributes).
 * `force`: an indexed copy whatever it saves (for merging with indexed geometries).
 * Groups and the draw range keep their meaning (an index range [start, start + count) draws the same corners).
 */
export function indexGeometry(geometry, { force = false } = {}) {
  if (geometry.index || Object.keys(geometry.morphAttributes).length) return null;
  const attrs = Object.entries(geometry.attributes);
  if (!attrs.length || attrs.some(([, a]) => !a.isBufferAttribute || a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute)) return null;
  const n = geometry.attributes.position?.count || 0;
  if (n < 12 && !force) return null;
  const cols = attrs.map(([, a]) => ({ w: wordsOf(a.array), s: a.itemSize }));
  _bits.clear();
  let size = 1;
  while (size < n * 2) size <<= 1;
  // (the hash table and the first corners in scratch buffers kept between calls: thousands of pieces at the start)
  // (only small ones: a large geometry's would stay allocated for good)
  const small = size <= 1 << 18;
  if (small && scratch.table.length < size) scratch.table = new Int32Array(size);
  if (small && scratch.firstOf.length < n) scratch.firstOf = new Int32Array(size);
  const table = small ? scratch.table : new Int32Array(size), mask = size - 1, firstOf = small ? scratch.firstOf : new Int32Array(n);
  table.fill(-1, 0, size);
  const remap = new Uint32Array(n);
  let unique = 0;
  for (let v = 0; v < n; v++) {
    let h = 2166136261;
    for (const { w, s } of cols) for (let c = 0, o = v * s; c < s; c++) h = Math.imul(h ^ w[o + c], 16777619);
    let slot = (h ^ (h >>> 15)) & mask;
    for (;;) {
      const r = table[slot];
      if (r < 0) { table[slot] = v; firstOf[unique] = v; remap[v] = unique++; break; }
      let same = true;
      for (const { w, s } of cols) {
        const a = r * s, b = v * s;
        for (let c = 0; c < s; c++) if (w[a + c] !== w[b + c]) { same = false; break; }
        if (!same) break;
      }
      if (same) { remap[v] = remap[r]; break; }
      slot = (slot + 1) & mask;
    }
  }
  if (unique > n * 0.8 && !force) return null;
  const out = new THREE.BufferGeometry();
  for (const [name, a] of attrs) {
    const s = a.itemSize, src = a.array, dst = new src.constructor(unique * s);
    for (let u = 0; u < unique; u++) { const f = firstOf[u] * s; for (let c = 0; c < s; c++) dst[u * s + c] = src[f + c]; }
    const b = new THREE.BufferAttribute(dst, s, a.normalized);
    b.name = a.name; b.usage = a.usage;
    out.setAttribute(name, b);
  }
  out.setIndex(new THREE.BufferAttribute(unique > 65535 ? remap : new Uint16Array(remap), 1));
  for (const g of geometry.groups) out.addGroup(g.start, g.count, g.materialIndex);
  out.setDrawRange(geometry.drawRange.start, geometry.drawRange.count);
  out.boundingBox = geometry.boundingBox; out.boundingSphere = geometry.boundingSphere;
  out.userData = geometry.userData;
  out.name = geometry.name;
  return out;
}

/** `attribute` (float, 3 a vertex) as normalized signed bytes; the same object for an attribute already quantized */
function quantizedNormal(attribute) {
  const src = attribute.array, dst = new Int8Array(src.length);
  for (let i = 0; i < src.length; i++) dst[i] = Math.round(Math.max(-1, Math.min(1, src[i])) * 127);
  return new THREE.BufferAttribute(dst, 3, true);
}

/**
 * Compacts the static meshes' vertex data under `roots` (indexGeometry, 8-bit normals), before anything is uploaded.
 * Leaves alone what may be read or rewritten on the CPU later: instanced meshes and their shared bases, skinned and
 * morphed meshes, lines and points, attributes that are updated (not StaticDrawUsage) and objects with
 * userData.keepCpu; `skip(object)` excludes whole subtrees. Returns { geometries, before, after } (bytes).
 */
export function compactStaticGeometry(roots, { skip = () => false } = {}) {
  const stats = { geometries: 0, before: 0, after: 0 };
  const users = new Map(); // attribute -> geometries using it
  const meshes = [];
  const blocked = new Set(); // geometries some other kind of object draws as well
  const visit = (o) => {
    if (o.userData?.keepCpu || skip(o)) return;
    if (o.geometry && !(o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.isBatchedMesh && !o.morphTargetInfluences)) blocked.add(o.geometry);
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.isBatchedMesh && !o.morphTargetInfluences && o.geometry?.isBufferGeometry) {
      meshes.push(o);
      for (const a of Object.values(o.geometry.attributes)) {
        if (!users.has(a)) users.set(a, new Set());
        users.get(a).add(o.geometry);
      }
    }
    for (const c of o.children) visit(c);
  };
  for (const r of roots) if (r) visit(r);
  // (geometries also used by an instanced mesh or anything else outside are found by their attributes' other users)
  const bytesOf = (g) => [...Object.values(g.attributes), g.index].reduce((s, a) => s + (a?.array?.byteLength || 0), 0);
  const done = new Map(); // old geometry -> new
  const normals = new Map(); // old normal attribute -> quantized
  for (const mesh of meshes) {
    const g = mesh.geometry;
    if (done.has(g)) { mesh.geometry = done.get(g); continue; }
    if (blocked.has(g)) continue;
    const attrs = Object.values(g.attributes);
    if (attrs.some((a) => a.usage !== THREE.StaticDrawUsage || !a.array?.length)) continue;
    const before = bytesOf(g);
    let out = g;
    if (attrs.every((a) => (users.get(a)?.size ?? 1) === 1)) out = indexGeometry(g) || g;
    const nor = out.attributes.normal;
    if (nor && nor.itemSize === 3 && nor.array instanceof Float32Array && !nor.isInterleavedBufferAttribute) {
      // (an attribute shared by several geometries is quantized once, for all of them)
      const shared = out === g ? nor : null;
      let q = shared && normals.get(shared);
      if (!q) { q = quantizedNormal(nor); if (shared) normals.set(shared, q); }
      if (out === g && (users.get(nor)?.size ?? 1) > 1) for (const other of users.get(nor)) other.setAttribute('normal', q);
      else out.setAttribute('normal', q);
    }
    if (out !== g) { done.set(g, out); mesh.geometry = out; g.dispose(); }
    const after = bytesOf(out);
    if (after < before) { stats.geometries++; stats.before += before; stats.after += after; }
  }
  return stats;
}
