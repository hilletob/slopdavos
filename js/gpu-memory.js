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
