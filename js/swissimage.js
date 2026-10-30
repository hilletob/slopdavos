import * as THREE from 'three/webgpu';
import { texture, uv } from 'three/tsl';
import { snowyGround } from './season.js';

// swisstopo SWISSIMAGE orthophotos (data/swissimage/, tools/fetch-swissimage.mjs): one WebP per terrain mesh chunk,
// reaching `margin` metres beyond it. The terrain chunks drape their own image; a swissBUILDINGS3D tile drapes its roofs
// with the image of the chunk under its centre. Images are mapped from above: u east, v north (the image's top row is
// its north edge, z0).

const INDEX_URL = new URL('../data/swissimage/index.json', import.meta.url);
let indexPromise = null;

// The index ({ chunk, margin, tiles, byChunk }), or null when the orthophotos are missing
export function orthophotoIndex() {
  indexPromise ??= fetch(INDEX_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then((index) => index && { ...index, byChunk: new Map(index.tiles.map((t) => [`${t.i0}/${t.j0}`, t])) })
    .catch(() => null);
  return indexPromise;
}

// The image whose chunk holds (x, z), or null
export function orthophotoAt(index, x, z) {
  const m = index.margin || 0;
  return index.tiles.find((t) => x >= t.x0 + m && x < t.x1 - m && z >= t.z0 + m && z < t.z1 - m) || null;
}

// Whether a box ({ min, max } in world coordinates) lies within an image, margin included
export const orthophotoCovers = (tile, box) => box.min.x >= tile.x0 && box.max.x <= tile.x1 && box.min.z >= tile.z0 && box.max.z <= tile.z1;

const loader = new THREE.TextureLoader();
const textures = new Map();
export function orthophotoTexture(tile) {
  if (!textures.has(tile.f)) {
    const url = new URL(tile.f, INDEX_URL).href;
    // (a few retries: simple static servers drop a request now and then while the buildings stream in too)
    const load = async (attempt = 1) => {
      try {
        return await loader.loadAsync(url);
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise((r) => setTimeout(r, 500 * attempt));
        return load(attempt + 1);
      }
    };
    textures.set(tile.f, load().then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 8;
      return texture;
    }));
  }
  return textures.get(tile.f);
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

/**
 * Drapes the terrain chunks (buildTerrainMeshes, userData.chunk) with their orthophotos, nearest to `center` first.
 * The meshes keep their material until their image is in. Resolves when every image is applied.
 */
export async function drapeTerrainOrthophotos(meshes, { center = { x: 0, z: 0 }, concurrency = 6 } = {}) {
  const index = await orthophotoIndex();
  if (!index) return 0;
  const jobs = [];
  for (const mesh of meshes) {
    const tile = mesh.userData.chunk && index.byChunk.get(`${mesh.userData.chunk.i0}/${mesh.userData.chunk.j0}`);
    if (!tile) continue;
    const s = mesh.geometry.boundingSphere;
    jobs.push({ mesh, tile, d: Math.hypot(s.center.x - center.x, s.center.z - center.z) });
  }
  jobs.sort((a, b) => a.d - b.d);
  let next = 0, applied = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < jobs.length) {
      const { mesh, tile } = jobs[next++];
      try {
        const map = await orthophotoTexture(tile);
        setOrthophotoUV(mesh.geometry, tile);
        const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.96, metalness: 0 });
        material.colorNode = snowyGround(texture(map, uv()).rgb); // summer as photographed; snow in winter (season.js)
        mesh.material = material;
        applied++;
      } catch (error) {
        console.warn('[swissimage]', tile.f, error);
      }
    }
  }));
  return applied;
}
