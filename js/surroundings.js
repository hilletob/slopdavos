import * as THREE from 'three/webgpu';
import { attribute, float, mix, mx_noise_float, normalWorld, positionWorld, smoothstep, vec3 } from 'three/tsl';
import { parseTerrain, gridHeight, gridLevels, pickLevel } from './terrain-grid.js';
import { TERRAIN, groundHeight, drawLevel } from './terrain.js';
import { createWaterMaterial } from './tsl-materials.js';
import { FRAME } from './davos-frame.js';
import { winter, freezeWater } from './season.js';

// The relief around the mapped city (data/davos-surroundings.bin, tools/build-davos-surroundings.mjs, swissALTIRegio):
// a mid ring (±12 km at 50 m: the Weissfluh, the Pischa, the Flüela and Sertig peaks) and a far ring (±91 km at 275 m:
// the Silvretta, the Albula Alps, the Bernina, the Rätikon). Each ring's grid lines up with the edge of the area inside it:
// its nodes on that edge take the inner surface's heights, and a skirt one cell wide runs some metres under the inner
// surface so that the seam never shows the sky. Beyond the city the Earth's curvature (less refraction) lowers the
// horizon: ~250 m at 60 km.

const URL_SURROUNDINGS = new URL('../data/davos-surroundings.bin', import.meta.url);
const EARTH_RADIUS = 6371000, REFRACTION = 0.13;
const CITY_RADIUS = TERRAIN.maxX; // the curvature is left out within the city (< 0.3 m)
// Levels of detail: the coarsest level whose error stays within LOD_TOLERANCE px, the error being what 99% of a tile's
// nodes stay within (the Alps at 50 and 275 m are rough: their worst spike alone would keep every tile in full)
const LOD_TOLERANCE = 1.5, LOD_QUANTILE = 0.99;

function parseRings(buffer) {
  const rings = [];
  for (let offset = 0; offset < buffer.byteLength;) {
    const view = new DataView(buffer, offset);
    const cols = view.getUint16(4, true), rows = view.getUint16(6, true);
    const bytes = 24 + cols * rows * 2;
    rings.push(parseTerrain(buffer.slice(offset, offset + bytes)));
    offset += bytes;
  }
  return rings;
}

const curvatureDrop = (x, z, inner) => {
  const d = Math.max(0, Math.hypot(x, z) - inner);
  return (d * d * (1 - REFRACTION)) / (2 * EARTH_RADIUS);
};

/**
 * One ring in tiles: cells inside `hole` ({ minX, maxX, minZ, maxZ }, the area drawn in more detail, on the ring's
 * grid lines) are left out but for the skirt along its edge, `skirt` metres down (deep enough not to poke through the
 * inner surface between two of the ring's nodes). `innerHeight(x, z)`: the surface inside the hole, for the seam.
 * The tiles (up to `tile` cells a side, their edges on the hole's) are culled by the view and drawn in levels of
 * detail (terrain-grid.js gridLevels: every 2nd, 4th, … node as long as the relief stays within a pixel of the full
 * grid, the silhouettes on the horizon included); their edges keep every node, so tiles at different levels, the skirt
 * and the inner surface meet without cracks.
 */
function ringMeshes(grid, hole, innerHeight, materials, skirt, { tile = 96, steps = [1, 2, 4, 8] } = {}) {
  const { cols, rows, cell, minX, minZ, heights } = grid;
  const inside = (x, z) => x > hole.minX + 0.01 && x < hole.maxX - 0.01 && z > hole.minZ + 0.01 && z < hole.maxZ - 0.01;
  const onEdge = (x, z) => !inside(x, z) && x >= hole.minX - 0.01 && x <= hole.maxX + 0.01 && z >= hole.minZ - 0.01 && z <= hole.maxZ + 0.01;
  const ys = new Float32Array(cols * rows), surface = new Float32Array(cols * rows), lakes = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, x = minX + i * cell, z = minZ + j * cell;
    let h = heights[k];
    if (onEdge(x, z) || inside(x, z)) h = innerHeight(x, z);
    const drop = curvatureDrop(x, z, CITY_RADIUS);
    surface[k] = h - drop; // (the shading's normals: the surface without the skirt)
    ys[k] = (inside(x, z) ? h - skirt : h) - drop; // the skirt, under the inner surface
    // A lake is perfectly level in the survey
    let flat = true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < cols && jj < rows && Math.abs(heights[jj * cols + ii] - heights[k]) > 0.25) flat = false;
    }
    lakes[k] = flat ? 1 : 0;
  }
  // The hole on the grid, and the tiles: each axis cut at the hole's edges, then into near-equal runs of <= `tile` cells
  const hi0 = Math.round((hole.minX - minX) / cell), hi1 = Math.round((hole.maxX - minX) / cell);
  const hj0 = Math.round((hole.minZ - minZ) / cell), hj1 = Math.round((hole.maxZ - minZ) / cell);
  const cuts = (n, a, b) => {
    const out = [0];
    for (const [p, q] of [[0, a], [a, b], [b, n]]) {
      const parts = Math.ceil((q - p) / tile);
      for (let k = 1; k <= parts; k++) out.push(Math.round(p + ((q - p) * k) / parts));
    }
    return [...new Set(out)].sort((p, q) => p - q);
  };
  const xs = cuts(cols - 1, hi0, hi1), zs = cuts(rows - 1, hj0, hj1);
  const meshes = [];
  // A block of the ring's nodes [i0, i1] x [j0, j1] as geometry (positions, shading normals, altitude, lake)
  const block = (i0, i1, j0, j1) => {
    const nc = i1 - i0 + 1, nr = j1 - j0 + 1;
    const positions = new Float32Array(nc * nr * 3), normals = new Float32Array(nc * nr * 3), altitudes = new Float32Array(nc * nr), lake = new Float32Array(nc * nr);
    const local = new Float32Array(nc * nr);
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
      const i = i0 + c, j = j0 + r, k = j * cols + i, v = r * nc + c;
      positions[v * 3] = minX + i * cell; positions[v * 3 + 1] = ys[k]; positions[v * 3 + 2] = minZ + j * cell;
      local[v] = ys[k];
      const hl = surface[j * cols + Math.max(0, i - 1)], hr = surface[j * cols + Math.min(cols - 1, i + 1)];
      const hu = surface[Math.max(0, j - 1) * cols + i], hd = surface[Math.min(rows - 1, j + 1) * cols + i];
      const nx = (hl - hr) / (2 * cell), nz = (hu - hd) / (2 * cell), len = Math.hypot(nx, 1, nz);
      normals[v * 3] = nx / len; normals[v * 3 + 1] = 1 / len; normals[v * 3 + 2] = nz / len;
      altitudes[v] = heights[k]; lake[v] = lakes[k];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setAttribute('aAltitude', new THREE.BufferAttribute(altitudes, 1));
    g.setAttribute('aLake', new THREE.BufferAttribute(lake, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return { g, nc, nr, local, lake };
  };
  for (let tj = 0; tj + 1 < zs.length; tj++) for (let ti = 0; ti + 1 < xs.length; ti++) {
    const i0 = xs[ti], i1 = xs[ti + 1], j0 = zs[tj], j1 = zs[tj + 1];
    if (i0 >= hi0 && i1 <= hi1 && j0 >= hj0 && j1 <= hj1) continue; // in the hole
    const { g, nc, nr, local, lake } = block(i0, i1, j0, j1);
    // Land and lake triangles (all three corners level) share the vertices; in full detail the lakes take the city's
    // water material so that the Davosersee runs on seamlessly, further off the ground's own lake shading draws them.
    const { index, levels, secondary } = gridLevels(nc - 1, nr - 1, local, steps, { quantile: LOD_QUANTILE, secondary: (a, b, c) => lake[a] && lake[b] && lake[c] });
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.setDrawRange(levels[0].start, levels[0].count);
    const land = new THREE.Mesh(g, materials.land);
    land.receiveShadow = true;
    land.userData.lodLevels = levels;
    land.userData.lodTolerance = LOD_TOLERANCE;
    land.onBeforeRender = drawLevel;
    meshes.push(land);
    if (secondary.length) {
      const w = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'aAltitude', 'aLake']) w.setAttribute(name, g.attributes[name]);
      w.setIndex(new THREE.BufferAttribute(nc * nr > 65535 ? new Uint32Array(secondary) : new Uint16Array(secondary), 1));
      w.boundingSphere = g.boundingSphere; w.boundingBox = g.boundingBox;
      const water = new THREE.Mesh(w, materials.lake);
      // (only while the land around it is in full detail)
      water.onBeforeRender = (renderer, scene, camera, geometry) => {
        if (camera.isOrthographicCamera) return;
        geometry.drawRange.count = pickLevel(levels, g.boundingBox, camera, renderer.domElement?.clientHeight || 800, land.userData.lodTolerance) === 0 ? Infinity : 0;
      };
      meshes.push(water);
    }
  }
  // The skirt: the band of cells just inside the hole's edge, in full detail
  const band = [];
  const { g, nc } = block(hi0, hi1, hj0, hj1);
  for (let r = 0; r < hj1 - hj0; r++) for (let c = 0; c < hi1 - hi0; c++) {
    if (r > 0 && c > 0 && r < hj1 - hj0 - 1 && c < hi1 - hi0 - 1) continue;
    const a = r * nc + c;
    band.push(a, a + nc + 1, a + 1, a, a + nc, a + nc + 1);
  }
  // (only the band's nodes: the block's others are dropped)
  const used = [...new Set(band)].sort((p, q) => p - q), remap = new Map(used.map((v, k) => [v, k]));
  const skirtGeometry = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const size = attr.itemSize, out = new Float32Array(used.length * size);
    used.forEach((v, k) => { for (let c = 0; c < size; c++) out[k * size + c] = attr.array[v * size + c]; });
    skirtGeometry.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  skirtGeometry.setIndex(new THREE.BufferAttribute(used.length > 65535 ? new Uint32Array(band.map((v) => remap.get(v))) : new Uint16Array(band.map((v) => remap.get(v))), 1));
  skirtGeometry.computeBoundingSphere(); skirtGeometry.computeBoundingBox();
  g.dispose();
  const skirtMesh = new THREE.Mesh(skirtGeometry, materials.land);
  skirtMesh.receiveShadow = true;
  meshes.push(skirtMesh);
  return meshes;
}

// Meadows and larch-and-spruce woods up to the tree line (~2100 m around Davos), rock above it, snow on the gentler slopes of the high Alps, lakes
// (colours in linear space)
function createMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  const altitude = attribute('aAltitude', 'float').add(FRAME.H0);
  const lake = smoothstep(0.6, 1.0, attribute('aLake', 'float'));
  const patches = mx_noise_float(positionWorld.xz.mul(0.002)).mul(0.5).add(0.5);
  const fine = mx_noise_float(positionWorld.xz.mul(0.006)).mul(0.5).add(0.5);
  const slope = float(1).sub(normalWorld.y);
  const meadow = mix(vec3(0.07, 0.12, 0.035), vec3(0.11, 0.15, 0.05), fine);
  const forest = vec3(0.025, 0.05, 0.02);
  const lowland = mix(meadow, forest, smoothstep(0.45, 0.6, patches.add(slope.mul(1.4))));
  const rock = mix(vec3(0.13, 0.12, 0.11), vec3(0.2, 0.19, 0.17), fine);
  // Winter (season.js): the snowline drops to the valley floors; woods (the dark patches below ~2100 m) keep a dusting only
  const lineLow = mix(float(2650), float(700), winter), lineHigh = mix(float(3000), float(1100), winter);
  const snowline = smoothstep(lineLow, lineHigh, altitude.add(fine.mul(250))).mul(smoothstep(mix(float(0.55), float(0.75), winter), 0.3, slope));
  const wooded = smoothstep(0.45, 0.6, patches.add(slope.mul(1.4))).mul(smoothstep(2200, 1900, altitude)).mul(winter).mul(0.6);
  const ground = mix(mix(lowland, rock, smoothstep(2150, 2550, altitude.add(fine.mul(200)))), vec3(0.85, 0.88, 0.92), snowline.mul(float(1).sub(wooded)));
  // (the lakes further off, where the water material gives way to this one: frozen and snowed over in winter, freezeWater)
  m.colorNode = mix(ground, mix(vec3(0.03, 0.07, 0.09), vec3(0.62, 0.67, 0.72), winter), lake);
  m.roughnessNode = mix(float(0.95), mix(float(0.12), float(0.55), winter), lake);
  return m;
}

export async function buildSurroundings(scene) {
  const res = await fetch(URL_SURROUNDINGS);
  if (!res.ok) throw new Error(`${URL_SURROUNDINGS}: ${res.status}`);
  const [mid, far] = parseRings(await res.arrayBuffer());
  const materials = { land: createMaterial(), lake: freezeWater(createWaterMaterial(), { all: true }) };
  const group = new THREE.Group();
  group.name = 'surroundings';
  group.userData.terrain = 'absolute';
  const frame = { minX: TERRAIN.minX, maxX: TERRAIN.maxX, minZ: TERRAIN.minZ, maxZ: TERRAIN.maxZ };
  const midBox = { minX: mid.minX, maxX: mid.maxX, minZ: mid.minZ, maxZ: mid.maxZ };
  group.add(...ringMeshes(mid, frame, groundHeight, materials, 15));
  group.add(...ringMeshes(far, midBox, (x, z) => gridHeight(mid, x, z), materials, 40, { steps: [1, 2, 4, 8, 16] }));
  // (one shader per material: the precompile pass builds it once, main.js)
  const first = new Map();
  for (const mesh of group.children) {
    if (first.has(mesh.material)) mesh.userData.sharesPipelineWith = first.get(mesh.material);
    else first.set(mesh.material, mesh);
  }
  scene.add(group);
  return group;
}
