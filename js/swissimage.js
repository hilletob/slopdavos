import * as THREE from 'three/webgpu';
import { texture, uniform, positionWorld, vec2, float } from 'three/tsl';
import { snowyGround, isWinter } from './season.js';
import { orthoLevel, orthoScale } from './ortho-levels.js';
import { QUALITY } from './quality.js';
import { releaseImageAfterUpload } from './gpu-memory.js';
import { groomedGround, groomedRoughness } from './groom-map.js';

// swisstopo SWISSIMAGE orthophotos (data/swissimage/, tools/fetch-swissimage.mjs): one WebP per terrain mesh chunk,
// reaching `margin` metres beyond it. The terrain chunks drape their own image; a swissBUILDINGS3D tile drapes its roofs
// with the image of the chunk under its centre. Images are mapped from above: u east, v north (the image's top row is
// its north edge, z0).

const INDEX_URL = new URL('../data/swissimage/index.json', import.meta.url);
// The optional high-resolution profile (npm run data:hires: 0.25 m on the valley floor; generated locally, not in git)
const HIRES_URL = new URL('../data/hires/swissimage/index.json', import.meta.url);
let indexPromise = null, hiresPromise = null;

// The index ({ chunk, margin, tiles, byChunk }), or null when the orthophotos are missing
export function orthophotoIndex() {
  indexPromise ??= fetch(INDEX_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then((index) => index && { ...index, byChunk: new Map(index.tiles.map((t) => [`${t.i0}/${t.j0}`, t])) })
    .catch(() => null);
  return indexPromise;
}

// The high-resolution index (same chunks and extents, sharper images), or null when it was not generated
export function hiresOrthophotoIndex() {
  if (!QUALITY.hires) return Promise.resolve(null); // (never on the mobile profile, js/quality.js)
  hiresPromise ??= fetch(HIRES_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then((index) => index && { ...index, base: HIRES_URL, byChunk: new Map(index.tiles.map((t) => [`${t.i0}/${t.j0}`, t])) })
    .catch(() => null);
  return hiresPromise;
}

// The image whose chunk holds (x, z), or null
export function orthophotoAt(index, x, z) {
  const m = index.margin || 0;
  return index.tiles.find((t) => x >= t.x0 + m && x < t.x1 - m && z >= t.z0 + m && z < t.z1 - m) || null;
}

// Whether a box ({ min, max } in world coordinates) lies within an image, margin included
export const orthophotoCovers = (tile, box) => box.min.x >= tile.x0 && box.max.x <= tile.x1 && box.min.z >= tile.z0 && box.max.z <= tile.z1;

// --- Decoding ----------------------------------------------------------------------------------------------------------
// Images are fetched as blobs and decoded to ImageBitmaps, downscaled on decode where a smaller level will do (the
// image's extent stays: only its pixel count changes, so the uv holds for every level). A Texture owns its bitmap:
// dropping it disposes both.
async function fetchBlob(url) {
  // (a few retries: simple static servers drop a request now and then while the buildings stream in too)
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return await res.blob();
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}
const pixels = (tile) => [Math.round((tile.x1 - tile.x0) / tile.res), Math.round((tile.z1 - tile.z0) / tile.res)];
async function loadBitmap(url, size = null) {
  const blob = await fetchBlob(url);
  return createImageBitmap(blob, size ? { resizeWidth: size[0], resizeHeight: size[1], resizeQuality: 'medium' } : undefined);
}
async function loadTexture(url, size = null) {
  return bitmapTexture(await loadBitmap(url, size));
}
// One image of several tiles (a chunk of more than one tile's size, js/quality.js terrainChunk): each tile drawn at its
// place over `rect` ({ x0, z0, x1, z1 }), `scale` of its full pixel size, the tiles' margins overdrawn by their
// neighbours (the same photo); the canvas gives its pixels up as the bitmap
async function loadComposed(tiles, rect, base, scale) {
  const res = Math.min(...tiles.map((t) => t.res)) / scale;
  const W = Math.max(16, Math.round((rect.x1 - rect.x0) / res)), H = Math.max(16, Math.round((rect.z1 - rect.z0) / res));
  const bitmaps = await Promise.all(tiles.map((t) => {
    const [w, h] = pixels(t);
    return loadBitmap(new URL(t.f, base).href, scale < 1 ? [Math.max(16, Math.round(w * scale)), Math.max(16, Math.round(h * scale))] : null);
  }));
  const canvas = new OffscreenCanvas(W, H), ctx = canvas.getContext('2d');
  tiles.forEach((t, i) => {
    const x = (t.x0 - rect.x0) / res, y = (t.z0 - rect.z0) / res, w = (t.x1 - t.x0) / res, h = (t.z1 - t.z0) / res;
    ctx.drawImage(bitmaps[i], x, y, w, h);
    bitmaps[i].close();
  });
  return bitmapTexture(canvas.transferToImageBitmap());
}
function bitmapTexture(bitmap) {
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return releaseImageAfterUpload(texture); // (the decoded bitmap is closed once on the GPU)
}
// (a second later: the frames already queued may still sample the old texture)
const drop = (texture) => { if (texture) setTimeout(() => { texture.dispose(); texture.image?.close?.(); }, 1000); };
// GPU bytes of a texture with its mipmaps (RGBA8)
const gpuBytes = (texture) => (texture?.image ? texture.image.width * texture.image.height * 4 * 4 / 3 : 0);

// The roofs' copy of a chunk's image (js/swissbuildings3d.js): a quarter of its linear size, kept for good — up close
// the sharp roof atlases take over. `base`: the light index (the default) or another one.
const roofTextures = new Map();
export function orthophotoTexture(tile, base = INDEX_URL) {
  const key = `${base}|${tile.f}`;
  if (!roofTextures.has(key)) {
    const [w, h] = pixels(tile);
    roofTextures.set(key, loadTexture(new URL(tile.f, base).href, [Math.max(16, Math.round(w / 4)), Math.max(16, Math.round(h / 4))]));
  }
  return roofTextures.get(key);
}

// Sets `geometry`'s uv from its world x, z over `tile`'s image
export function setOrthophotoUV(geometry, tile) {
  const pos = geometry.attributes.position, uv = new Float32Array(pos.count * 2);
  const w = tile.x1 - tile.x0, d = tile.z1 - tile.z0;
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - tile.x0) / w;
    uv[i * 2 + 1] = 1 - (pos.getZ(i) - tile.z0) / d;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// One material for every terrain chunk, each drawing its own image: a reference node reads the chunk's
// mesh.userData.orthoMap per object (and a swapped image is picked up by the next frame, without recompiling). A
// material per chunk built its node graph and shader state once per chunk, ~0.6 MB of JavaScript each: ~350 MB over
// the 572 chunks.
// The image is mapped from above, from the chunk's userData.orthoRect ([x0, z0, 1 / width, 1 / depth] of its image):
// no uv attribute (a sixth of the terrain's vertex data).
// The stand-in is filtered as the images are: three.js builds the shader from the texture the node holds at that moment,
// and a DataTexture's default nearest filter made it fetch texels (WGSLNodeBuilder.isUnfilterable: textureLoad, level 0,
// no sampler) — every image read unfiltered and without its mipmaps, blocky up close (as the roofs, js/swissbuildings3d.js)
const PLACEHOLDER = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 120, 100, 255]), 1, 1);
  t.colorSpace = THREE.SRGBColorSpace; // (the shader decodes the colour as the texture it was built with says)
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
})();
let ground = null;
const groundMaterial = () => {
  if (ground) return ground;
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.96, metalness: 0 });
  const rect = uniform(new THREE.Vector4()).onObjectUpdate(({ object }, self) => object.userData.orthoRect && self.value.copy(object.userData.orthoRect));
  const mapUV = vec2(positionWorld.x.sub(rect.x).mul(rect.z), float(1).sub(positionWorld.z.sub(rect.y).mul(rect.w)));
  const node = texture(PLACEHOLDER, mapUV).onObjectUpdate(({ object }) => object.userData.orthoMap || PLACEHOLDER);
  // summer as photographed; snow in winter (season.js), with the player groomer's tracks in it (groom-map.js)
  material.colorNode = groomedGround(snowyGround(node.rgb));
  material.roughnessNode = groomedRoughness(0.96);
  material.name = 'TerrainOrthophoto';
  return (ground = material);
};

// --- Streaming the terrain's images by distance ----------------------------------------------------------------------
// All 1344 light images at full size would take ~2 GB of GPU memory. Each chunk shows one level at a time, by its
// distance from the camera (with hysteresis, so that a chunk on the boundary doesn't flip back and forth; js/ortho-levels.js):
//   0: the light image decoded at 1/8 of its linear size (~0.1 MB on the GPU)        beyond orthoFullFar (1600 m)
//   1: the light image (0.5-2 m, up to 1152 px square: ~7 MB)                         within orthoFullNear (1200 m)
//   2: the high-resolution image (npm run data:hires, 0.25 m: ~28 MB), when generated within HIRES_NEAR
// Loads go nearest first, a few at a time; the replaced texture is disposed once the new one is in.
// (the distances and sizes come from the device profile, js/quality.js: the mobile one shows level 1 at half its linear
// size, a quarter of the memory, within a shorter radius, and never level 2)
const chunks = [];
let lastTick = 0, loads = 0, hiresIndex, coverageOf = null;
hiresOrthophotoIndex().then((index) => { hiresIndex = index; });

/** The vector ground's coverage of a rectangle (js/vector-ground.js groundCoverage), for js/ortho-levels.js */
export function setGroundCoverage(fn) { coverageOf = fn; for (const c of chunks) c.coverage = undefined; }

function wanted(c, camera) {
  if (c.coverage === undefined) c.coverage = coverageOf ? coverageOf([c.rect.x0, c.rect.z0, c.rect.x1, c.rect.z1]) : 0;
  return orthoLevel({ d: Math.hypot(c.x - camera.x, c.z - camera.z), level: c.level, hires: !!(hiresIndex && c.hires), winter: isWinter(), coverage: c.coverage }, QUALITY);
}
function load(c, level) {
  const tile = level === 2 ? c.hires : c.tile, base = level === 2 ? HIRES_URL : INDEX_URL;
  const [w, h] = pixels(tile);
  c.loading = level; loads++;
  const scale = orthoScale(level, isWinter(), QUALITY);
  const loading = c.tiles.length > 1 && level < 2 ? loadComposed(c.tiles, c.rect, base, scale)
    : loadTexture(new URL(tile.f, base).href, scale < 1 ? [Math.max(16, Math.round(w * scale)), Math.max(16, Math.round(h * scale))] : null);
  return loading
    .then((map) => {
      c.mesh.userData.orthoMap = map;
      if (!c.material) { c.material = groundMaterial(); c.mesh.material = c.material; }
      drop(c.texture);
      c.texture = map; c.level = level; c.scale = scale;
    })
    .catch((error) => { console.warn('[swissimage]', tile.f, error); if (level === 2) c.hires = null; })
    .finally(() => { c.loading = -1; loads--; });
}

const SEEN_FOR = 2000; // ms since a chunk was last drawn, for it to count as in sight (js/quality.js orthoWhenSeen)
function unload(c) {
  drop(c.texture);
  c.texture = null; c.level = -1;
  c.mesh.userData.orthoMap = null; // (the node's placeholder until it is seen again)
}

/** Streams the terrain chunks' images by distance from `camera` (nearest first, a few at a time); call every frame. */
export function updateTerrainDetail(camera) {
  const now = performance.now();
  if (now - lastTick < 250 || !chunks.length) return;
  lastTick = now;
  // (the high-resolution image only where it covers the chunk's own rectangle: one generated before the terrain's grid
  // moved, as when the map grew, would put another place's photograph on the chunk)
  const fits = (h, t) => h && Math.abs(h.x0 - t.x0) < 0.5 && Math.abs(h.z0 - t.z0) < 0.5 && Math.abs(h.x1 - t.x1) < 0.5 && Math.abs(h.z1 - t.z1) < 0.5;
  if (hiresIndex) for (const c of chunks) if (c.hires === undefined) { const h = hiresIndex.byChunk.get(c.key); c.hires = fits(h, c.tile) ? h : null; }
  const todo = [];
  for (const c of chunks) {
    if (c.loading >= 0) continue;
    const want = wanted(c, camera);
    if (QUALITY.orthoWhenSeen && now - c.seenAt > SEEN_FOR) {
      // out of sight: nothing new is decoded for it, and a sharp image it no longer needs goes without a small one in its place
      if (c.level > want) unload(c);
      continue;
    }
    // (a new level, or the same at another size: the season changed)
    if (want !== c.level || (c.level >= 0 && orthoScale(want, isWinter(), QUALITY) !== c.scale)) todo.push({ c, want, d: Math.hypot(c.x - camera.x, c.z - camera.z) });
  }
  // Upgrades nearest first; downgrades (freeing memory) whenever a slot is free
  todo.sort((p, q) => (q.want > q.c.level) - (p.want > p.c.level) || p.d - q.d);
  for (const { c, want } of todo) {
    if (loads >= QUALITY.orthoLoads) break;
    load(c, want);
  }
}

/** The number of terrain chunks showing their high-resolution image (for the HUD and tests) */
export const hiresTerrainCount = () => chunks.filter((c) => c.level === 2).length;
/** Rough GPU memory held by the terrain's and the roofs' orthophotos, in MB, and the chunks per level */
export async function orthophotoMemory() {
  const roofs = await Promise.all([...roofTextures.values()].map((p) => p.catch(() => null)));
  const levels = [0, 0, 0];
  for (const c of chunks) if (c.level >= 0) levels[c.level]++;
  return {
    terrainMB: Math.round(chunks.reduce((a, c) => a + gpuBytes(c.texture), 0) / 1048576),
    roofsMB: Math.round(roofs.reduce((a, t) => a + gpuBytes(t), 0) / 1048576),
    levels
  };
}

/**
 * Drapes the terrain chunks (buildTerrainMeshes, userData.chunk) with their orthophotos, nearest to `center` first, at
 * the level their distance from `center` calls for (updateTerrainDetail then follows the camera). The meshes keep
 * their material until their image is in. Resolves when every chunk has an image.
 */
export async function drapeTerrainOrthophotos(meshes, { center = { x: 0, z: 0 } } = {}) {
  const index = await orthophotoIndex();
  if (!index) return 0;
  const added = [];
  for (const mesh of meshes) {
    const at = mesh.userData.chunk;
    if (!at) continue;
    // The chunk's tiles: one of its size (the index's chunk, 64 nodes), or those of a bigger chunk (terrainChunk)
    const tiles = [];
    for (let dj = 0; dj < (at.n || index.chunk); dj += index.chunk) for (let di = 0; di < (at.n || index.chunk); di += index.chunk) {
      const t = index.byChunk.get(`${at.i0 + di}/${at.j0 + dj}`);
      if (t) tiles.push(t);
    }
    if (!tiles.length) continue;
    const tile = tiles[0], key = `${at.i0}/${at.j0}`;
    const rect = tiles.length === 1 ? tile : { x0: Math.min(...tiles.map((t) => t.x0)), z0: Math.min(...tiles.map((t) => t.z0)),
      x1: Math.max(...tiles.map((t) => t.x1)), z1: Math.max(...tiles.map((t) => t.z1)) };
    mesh.userData.orthoRect = new THREE.Vector4(rect.x0, rect.z0, 1 / (rect.x1 - rect.x0), 1 / (rect.z1 - rect.z0));
    const s = mesh.geometry.boundingSphere;
    // (a composed chunk never takes the high-resolution image: those are per tile)
    const chunk = { mesh, tile, tiles, rect, key, x: s.center.x, z: s.center.z, level: -1, loading: -1, texture: null, material: null,
      hires: tiles.length > 1 ? null : undefined, seenAt: -Infinity };
    if (QUALITY.orthoWhenSeen) { // (on top of the terrain's own hook, its levels of detail)
      const before = mesh.onBeforeRender;
      mesh.onBeforeRender = function (...args) { chunk.seenAt = performance.now(); return before?.apply(this, args); };
    }
    added.push(chunk);
  }
  chunks.push(...added);
  if (QUALITY.orthoWhenSeen) return added.length; // (updateTerrainDetail loads them as they come into sight)
  added.sort((p, q) => Math.hypot(p.x - center.x, p.z - center.z) - Math.hypot(q.x - center.x, q.z - center.z));
  // First pass: every chunk gets its light image (or the small one) — six at a time; hi-res comes with the streaming
  let next = 0;
  // (the mobile profile: one at a time, js/quality.js orthoLoads, so that decoded images never pile up at the start)
  await Promise.all(Array.from({ length: QUALITY.mobile ? QUALITY.orthoLoads : 6 }, async () => {
    while (next < added.length) {
      const c = added[next++];
      if (c.level < 0 && c.loading < 0) await load(c, Math.min(1, wanted({ ...c, level: -1 }, center)));
    }
  }));
  return added.filter((c) => c.level >= 0).length;
}
