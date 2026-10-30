import * as THREE from 'three/webgpu';
import { mx_noise_float, positionWorld, normalWorld, cameraPosition, float, smoothstep, fract, step, vertexColor, attribute, vec2, vec3, mix, texture, uv } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FRAME } from './davos-frame.js';
import { ecefToLv95 } from './swiss-projection.js';
import { groundHeight } from './terrain.js';
import { snowyRoof } from './season.js';
import { orthophotoIndex, orthophotoAt, orthophotoCovers, orthophotoTexture, setOrthophotoUV, updateTerrainDetail } from './swissimage.js';

// swisstopo swissBUILDINGS3D 3.0: every building of Switzerland with its real roof, as 3D Tiles 1.0 (b3dm with Draco
// glTF, georeferenced in WGS84 ECEF). The tiles overlapping the city are stored in data/swissbuildings3d/ (refreshed
// deliberately from 3d.geo.admin.ch by tools/update-swissbuildings3d.mjs); they stream in nearest first and are baked
// into engine coordinates:
//   x = LV95 east - E0, z = N0 - LV95 north, y = height a.s.l. - H0 (js/davos-frame.js).
// Each tile gets an exact local affine map (the Jacobian of the rigorous ECEF -> LV95 transformation at its centre: a
// tile spans ~100 m, so the residual is far below a millimetre). Heights come out above the Bessel ellipsoid; the batch
// table's surveyed roof tops (DACH_MAX, metres a.s.l.) calibrate each tile to orthometric heights without a geoid model.
// Older captures (most of Davos, 2014) carry neither DACH_MAX nor GELAENDEPUNKT: there the lowest point of each building
// is set onto the swissALTI3D terrain instead (median over the tile).

const INDEX_URL = new URL('../data/swissbuildings3d/index.json', import.meta.url);
const ROOFS_URL = new URL('../data/roofs/index.json', import.meta.url);
// The optional high-resolution roof crops (0.1 m, npm run data:hires; not in git): preferred when present
const HIRES_ROOFS_URL = new URL('../data/hires/roofs/index.json', import.meta.url);
const MAX_PAGES = 4;

// --- b3dm container ----------------------------------------------------------------------------------------------------
export function parseB3dm(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'b3dm') throw new Error(`not a b3dm tile (${magic})`);
  const ftJson = view.getUint32(12, true), ftBin = view.getUint32(16, true);
  const btJson = view.getUint32(20, true), btBin = view.getUint32(24, true);
  const text = (start, length) => (length ? JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length))) : {});
  const featureTable = text(28, ftJson);
  const batchTable = text(28 + ftJson + ftBin, btJson);
  const glbStart = 28 + ftJson + ftBin + btJson + btBin;
  return { featureTable, batchTable, glb: buffer.slice(glbStart, view.getUint32(8, true)) };
}

// --- Tile frame: glTF (y-up, relative to RTC_CENTER) -> engine ------------------------------------------------------------
const Y_UP_TO_Z_UP = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

// Engine coordinates of a WGS84 ECEF point, heights above the Bessel ellipsoid minus H0 (uncalibrated)
function ecefToEngine(x, y, z) {
  const p = ecefToLv95(x, y, z);
  return [p.E - FRAME.E0, p.h - FRAME.H0, FRAME.N0 - p.N];
}

// Affine Matrix4 mapping ECEF offsets from `center` (an [x, y, z] array) to engine coordinates
export function tileMatrix(center) {
  const [cx, cy, cz] = center;
  const o = ecefToEngine(cx, cy, cz);
  const step = 1;
  const cols = [[step, 0, 0], [0, step, 0], [0, 0, step]].map(([dx, dy, dz]) => {
    const a = ecefToEngine(cx + dx, cy + dy, cz + dz), b = ecefToEngine(cx - dx, cy - dy, cz - dz);
    return [(a[0] - b[0]) / (2 * step), (a[1] - b[1]) / (2 * step), (a[2] - b[2]) / (2 * step)];
  });
  return new THREE.Matrix4().set(
    cols[0][0], cols[1][0], cols[2][0], o[0],
    cols[0][1], cols[1][1], cols[2][1], o[1],
    cols[0][2], cols[1][2], cols[2][2], o[2],
    0, 0, 0, 1
  );
}

function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const median = (values) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
};

// Davos palette: light plaster and larch-wood facades, grey slate and tin roofs, grey flat roofs
const color = new THREE.Color();
function facadeColor(seed, kind) {
  const r = hash(seed + 1), s = hash(seed * 7 + 3);
  if (/Kirche|Kapelle/.test(kind)) return color.setHSL(0.09 + s * 0.03, 0.08, 0.58 + r * 0.08);
  if (r < 0.45) return color.setHSL(0.10 + s * 0.04, 0.18 + r * 0.2, 0.74 + s * 0.12); // cream / ochre plaster
  if (r < 0.75) return color.setHSL(0.08 + s * 0.06, 0.04 + s * 0.06, 0.70 + r * 0.12); // light grey / white
  if (r < 0.9) return color.setHSL(0.07 + s * 0.03, 0.22, 0.56 + s * 0.12); // sandstone
  return color.setHSL(0.02 + s * 0.04, 0.26, 0.48 + s * 0.12); // muted red / rose
}
function roofColor(seed, pitched) {
  const r = hash(seed * 13 + 5), s = hash(seed * 3 + 11);
  if (!pitched) return color.setHSL(0.1, 0.03, 0.16 + r * 0.1); // gravel, membrane and tin flat roofs (linear: mid grey)
  if (r < 0.78) return color.setHSL(0.025 + s * 0.025, 0.45 + r * 0.15, 0.32 + s * 0.08); // clay tiles
  if (r < 0.9) return color.setHSL(0.47 + s * 0.04, 0.22, 0.42 + s * 0.08); // weathered copper
  return color.setHSL(0.6, 0.06, 0.28 + s * 0.06); // slate / eternit
}

// Bakes a decoded tile into one engine-space geometry: position, vertex colour, and the height above the building's
// surveyed ground point (aGround: storey lines and shop windows follow the street, whatever the terrain does).
export function bakeTile(gltf, tile, stats) {
  const { featureTable, batchTable } = tile;
  const rtc = featureTable.RTC_CENTER || [0, 0, 0];
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length) return null;
  // Tile centre in ECEF: RTC_CENTER plus the first mesh's node offset
  const firstNode = new THREE.Vector3().setFromMatrixPosition(meshes[0].matrixWorld).applyMatrix4(Y_UP_TO_Z_UP);
  const center = [rtc[0] + firstNode.x, rtc[1] + firstNode.y, rtc[2] + firstNode.z];
  const toEngine = tileMatrix(center)
    .multiply(new THREE.Matrix4().makeTranslation(rtc[0] - center[0], rtc[1] - center[1], rtc[2] - center[2]))
    .multiply(Y_UP_TO_Z_UP);

  let total = 0;
  for (const m of meshes) total += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
  const positions = new Float32Array(total * 3);
  const batchOf = new Uint32Array(total);
  const normalsY = new Float32Array(total);
  const v = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  let k = 0;
  for (const m of meshes) {
    const g = m.geometry;
    const full = new THREE.Matrix4().multiplyMatrices(toEngine, m.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(full);
    const pos = g.attributes.position, nor = g.attributes.normal, bid = g.attributes._batchid;
    const index = g.index;
    const n = index ? index.count : pos.count;
    for (let t = 0; t < n; t++) {
      const i = index ? index.getX(t) : t;
      v.fromBufferAttribute(pos, i).applyMatrix4(full);
      positions[k * 3] = v.x; positions[k * 3 + 1] = v.y; positions[k * 3 + 2] = v.z;
      normalsY[k] = nor ? nrm.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize().y : 0;
      batchOf[k] = bid ? Math.round(bid.getX(i)) : 0;
      k++;
    }
  }

  // Vertical calibration: surveyed roof tops against the baked (ellipsoidal) ones
  const roofTop = batchTable.DACH_MAX || [];
  const maxY = new Map();
  for (let i = 0; i < total; i++) maxY.set(batchOf[i], Math.max(maxY.get(batchOf[i]) ?? -Infinity, positions[i * 3 + 1]));
  const diffs = [];
  for (const [b, y] of maxY) if (Number.isFinite(roofTop[b])) diffs.push(roofTop[b] - FRAME.H0 - y);
  if (!diffs.length) {
    // No surveyed roofs: the terrain under each building's lowest vertex
    const lowest = new Map();
    for (let i = 0; i < total; i++) {
      const l = lowest.get(batchOf[i]);
      if (!l || positions[i * 3 + 1] < positions[l * 3 + 1]) lowest.set(batchOf[i], i);
    }
    for (const i of lowest.values()) diffs.push(groundHeight(positions[i * 3], positions[i * 3 + 2]) - positions[i * 3 + 1]);
    // The offset is systematic (~51 m around Davos): a tile of a few buildings on a steep slope, or far off the tiles
    // loaded so far, takes their median instead
    const global = median(stats.offsets), guess = median(diffs);
    if (diffs.length < 4 || (global != null && stats.offsets.length >= 8 && Math.abs(guess - global) > 4)) diffs.length = 0;
  }
  const local = median(diffs);
  if (local != null) stats.offsets.push(local);
  const dy = local ?? median(stats.offsets) ?? 0;

  const ground = batchTable.GELAENDEPUNKT || [];
  const kinds = batchTable.OBJEKTART || [];
  const egids = batchTable.EGID || [];
  const colors = new Uint8Array(total * 4);
  const above = new Float32Array(total);
  const style = new Float32Array(total * 2);
  // Each building's foot (its lowest vertex, or its surveyed ground point) and height: storeys count from the foot
  const foot = new Map(), top = new Map();
  for (let i = 0; i < total; i++) {
    const b = batchOf[i], y = positions[i * 3 + 1] + dy;
    if (!(foot.get(b) <= y)) foot.set(b, y);
    if (!(top.get(b) >= y)) top.set(b, y);
  }
  let minY = Infinity;
  for (let i = 0; i < total; i++) {
    const b = batchOf[i];
    const y = positions[i * 3 + 1] + dy;
    positions[i * 3 + 1] = y;
    minY = Math.min(minY, y);
    const base = Number.isFinite(ground[b]) ? ground[b] - FRAME.H0 : foot.get(b);
    above[i] = y - base;
    const seed = (egids[b] || 0) * 31 + b + (tile.seed || 0);
    style[i * 2] = hash(seed * 17 + 9); style[i * 2 + 1] = top.get(b) - foot.get(b);
    const roof = normalsY[i] > 0.35;
    const c = roof ? roofColor(seed, normalsY[i] < 0.97) : facadeColor(seed, kinds[b] || '');
    colors[i * 4] = c.r * 255; colors[i * 4 + 1] = c.g * 255; colors[i * 4 + 2] = c.b * 255; colors[i * 4 + 3] = roof ? 255 : 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4, true));
  geometry.setAttribute('aGround', new THREE.BufferAttribute(above, 1));
  geometry.setAttribute('aStyle', new THREE.BufferAttribute(style, 2)); // a random number per building, its height
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.userData = { buildings: maxY.size, calibration: dy, minY };
  return geometry;
}

// Davos facades and roofs, procedural (no photographs of the facades exist): per building (aStyle: a random number and
// its height) one of three types —
//  - chalets (low houses): a stone plinth, plaster below and larch boarding above, small windows with green or ox-red
//    shutters;
//  - hotels and sanatoria (tall, south fronts): rows of wide balcony doors behind wooden balcony bands, the loggias'
//    shade under the slab above;
//  - town houses and blocks: plastered, windows in white frames, shutters on some, shop fronts on the ground floor.
// Storeys and bays come from the height above the building's foot (aGround) and the position along the wall. Roofs:
// the orthophoto (`roofMap`, uv from above) or the roof colour, with slate courses across the fall line on pitched
// roofs and gravel on flat ones. The fine detail fades out with distance (no shimmer), and snow lies in winter.
// `sharp`: the pages of the tile's roof atlas (data/roofs/, 0.125 m), sampled at aRoof (u, v, page + 1; 0 off the
// atlas), blended over the orthophoto near the camera
function createMaterial(roofMap = null, sharp = null) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, flatShading: true });
  const above = attribute('aGround', 'float');
  const st = attribute('aStyle', 'vec2'), r = st.x, height = st.y;
  const roof = vertexColor().a;
  const n = normalWorld;
  const wall = step(n.y.abs(), 0.35).mul(float(1).sub(roof));
  const near = smoothstep(220, 60, positionWorld.distance(cameraPosition)); // detail fades with distance
  const r2 = fract(r.mul(7.31)), r3 = fract(r.mul(13.7));
  const chalet = step(height, 11).mul(step(r, 0.5));
  const hotel = step(13, height).mul(step(r, 0.55)).mul(float(1).sub(chalet));
  const south = smoothstep(0.35, 0.6, n.z); // facing south (+z)

  // Facade grid: bays along the wall, storeys up from the foot
  const along = positionWorld.x.mul(n.z.abs()).add(positionWorld.z.mul(n.x.abs()));
  const bayW = mix(float(2.7), float(3.4), r2), storeyH = mix(float(2.95), float(2.6), chalet);
  const u = fract(along.div(bayW)), v = fract(above.div(storeyH)), storey = above.div(storeyH).floor();
  // A soft-edged rectangle [u0, u1] x [v0, v1] of the bay (bounds may be nodes)
  const box = (u0, u1, v0, v1, f = 0.02) => {
    [u0, u1, v0, v1] = [u0, u1, v0, v1].map((e) => (typeof e === 'number' ? float(e) : e));
    return smoothstep(u0, u0.add(f), u).mul(smoothstep(u1, u1.sub(f), u)).mul(smoothstep(v0, v0.add(f), v)).mul(smoothstep(v1, v1.sub(f), v));
  };
  const upper = step(0.5, storey);
  // Windows (hotels: wide balcony doors), their white frames, the shutters
  const winW = mix(mix(float(0.2), float(0.27), chalet), float(0.08), hotel.mul(south)); // inset from each side of the bay
  const glassMask = box(winW, float(1).sub(winW), mix(float(0.3), float(0.06), hotel.mul(south)), 0.84).mul(upper);
  const frame = box(winW.sub(0.04), float(1.04).sub(winW), mix(float(0.27), float(0.03), hotel.mul(south)), 0.87).mul(upper).sub(glassMask).max(0);
  const shuttered = step(r3, 0.55).mul(float(1).sub(hotel));
  const shutter = box(winW.sub(0.15), winW.sub(0.045), 0.3, 0.84).max(box(float(1.045).sub(winW), float(1.15).sub(winW), 0.3, 0.84)).mul(upper).mul(shuttered);
  const slats = smoothstep(0.35, 0.5, fract(above.mul(14)).sub(0.5).abs()).mul(0.25);
  const shutterColour = mix(vec3(0.07, 0.2, 0.09), vec3(0.32, 0.07, 0.04), step(0.5, fract(r.mul(3.3)))).mul(float(1).sub(slats));
  // Hotel balconies on the south fronts: a wooden balustrade band and the slab's shade over each storey
  const balcony = hotel.mul(south).mul(upper);
  const rail = smoothstep(0.0, 0.02, v).mul(smoothstep(0.34, 0.32, v)).mul(balcony);
  const railWood = mix(vec3(0.2, 0.11, 0.05), vec3(0.3, 0.17, 0.08), smoothstep(0.3, 0.5, fract(along.mul(9)).sub(0.5).abs()));
  const loggia = smoothstep(0.86, 0.98, v).mul(balcony);
  // Chalets: larch boarding above the ground floor
  const boards = chalet.mul(step(2.6, above));
  const wood = mix(vec3(0.2, 0.11, 0.05), vec3(0.33, 0.2, 0.1), mx_noise_float(vec3(along.mul(0.6), above.mul(4), r.mul(50))).mul(0.5).add(0.5))
    .mul(float(1).sub(smoothstep(0.42, 0.5, fract(above.mul(4.5)).sub(0.5).abs()).mul(0.35)));
  // Shop fronts on the ground floor of town houses
  const shop = step(0.5, above).mul(step(above, 3.1)).mul(step(r2, 0.45)).mul(float(1).sub(chalet)).mul(box(0.08, 0.92, 0, 1, 0.03));
  // Plaster: a fine grain, rain streaks under the eaves and the windows; the stone plinth
  const grain = mx_noise_float(positionWorld.mul(0.6)).mul(0.08).add(0.96);
  const streaks = mx_noise_float(vec3(along.mul(1.3), above.mul(0.08), r.mul(30))).mul(0.5).add(0.5);
  const plaster = vertexColor().rgb.mul(grain).mul(mix(float(1), streaks.mul(0.12).add(0.88), near));
  const plinth = smoothstep(0.75, 0.65, above).mul(wall);
  let facade = mix(plaster, wood, boards);
  facade = mix(facade, vec3(0.26, 0.255, 0.24).mul(grain), plinth);
  facade = mix(facade, railWood, rail);
  facade = mix(facade, facade.mul(0.55), loggia);
  facade = mix(facade, vec3(0.8, 0.79, 0.76), frame.mul(near.mul(0.7).add(0.3)));
  facade = mix(facade, shutterColour, shutter.mul(near));
  const sky = mix(vec3(0.05, 0.065, 0.085), vec3(0.22, 0.27, 0.33), v);
  facade = mix(facade, sky, glassMask.mul(0.88));
  facade = mix(facade, vec3(0.1, 0.11, 0.12), shop.mul(0.8));

  // Roofs: slate courses across the fall line (pitched), gravel (flat)
  const pitched = roof.mul(step(n.y, 0.97)), flat = roof.mul(step(0.97, n.y));
  const fall = n.xz.add(vec2(1e-4, 0)).normalize(); // (nudged: a flat roof has no fall line, and would give NaN)
  const course = positionWorld.xz.dot(fall), across = positionWorld.x.mul(fall.y).sub(positionWorld.z.mul(fall.x));
  const row = course.div(0.32);
  const joint = smoothstep(0.82, 0.98, fract(row)).max(smoothstep(0.9, 0.99, fract(across.div(0.42).add(row.floor().mul(0.5)))).mul(0.6));
  const gravel = mx_noise_float(positionWorld.xz.mul(7)).mul(0.5).add(0.5);
  let roofBase = roofMap ? texture(roofMap, uv()).rgb : vertexColor().rgb.mul(grain);
  let photo = float(0); // how much of the roof shows the sharp crop (it carries its own tiles and gravel)
  if (sharp) {
    const at = attribute('aRoof', 'vec3');
    // the page: at.z - 1 (up to MAX_PAGES atlas pages per tile)
    let crop = texture(sharp[0], at.xy).rgb;
    for (let p = 1; p < sharp.length; p++) crop = mix(crop, texture(sharp[p], at.xy).rgb, step(p + 0.5, at.z));
    photo = step(0.5, at.z).mul(smoothstep(520, 380, positionWorld.distance(cameraPosition)));
    roofBase = mix(roofBase, crop, photo);
  }
  let roofColour = mix(roofBase, roofBase.mul(0.72), joint.mul(pitched).mul(near).mul(float(1).sub(photo.mul(0.75))));
  roofColour = mix(roofColour, roofColour.mul(gravel.mul(0.25).add(0.85)), flat.mul(near));

  m.colorNode = snowyRoof(mix(facade, roofColour, roof), roof);
  m.roughnessNode = mix(float(0.92), float(0.12), glassMask.add(shop).min(1).mul(float(1).sub(roof)));
  m.metalnessNode = mix(float(0), float(0.5), glassMask.mul(float(1).sub(roof)));
  return m;
}

// aRoof for the roof vertices of a baked tile that fall into one of its roof atlas rects ([x0, z0, x1, z1, px, py, pw, ph]
// per page, data/roofs/index.json): the atlas uv (the image's top row is the rect's north edge) and the page + 1
function setRoofAtlasUV(geometry, pages) {
  const pos = geometry.attributes.position, col = geometry.attributes.color, out = new Float32Array(pos.count * 3);
  let hits = 0;
  for (let i = 0; i < pos.count; i++) {
    if (col.getW(i) < 0.5) continue; // facades
    const x = pos.getX(i), z = pos.getZ(i);
    for (let p = 0; p < pages.length && p < MAX_PAGES; p++) {
      const { w, h, rects } = pages[p];
      const r = rects.find((q) => x >= q[0] - 0.5 && x <= q[2] + 0.5 && z >= q[1] - 0.5 && z <= q[3] + 0.5);
      if (!r) continue;
      const fx = Math.min(1, Math.max(0, (x - r[0]) / (r[2] - r[0]))), fz = Math.min(1, Math.max(0, (z - r[1]) / (r[3] - r[1])));
      out[i * 3] = (r[4] + fx * r[6]) / w;
      out[i * 3 + 1] = 1 - (r[5] + fz * r[7]) / h;
      out[i * 3 + 2] = p + 1;
      hits++;
      break;
    }
  }
  geometry.setAttribute('aRoof', new THREE.BufferAttribute(out, 3));
  return hits;
}

let gltfLoader = null;
function loaderFor() {
  if (gltfLoader) return gltfLoader;
  const draco = new DRACOLoader().setDecoderPath(new URL('libs/draco/gltf/', import.meta.resolve('three/addons/')).href);
  gltfLoader = new GLTFLoader().setDRACOLoader(draco);
  return gltfLoader;
}

async function fetchBuffer(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return await res.arrayBuffer();
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

/**
 * Streams the city's swissBUILDINGS3D tiles into `scene`, nearest to `center` first.
 * Returns { group, ready, done }: `ready` resolves once every tile within `nearRadius` is in (or rejects when the
 * service can't be reached at all), `done` once all tiles are.
 */
export function streamSwissBuildings(scene, { center = { x: 0, z: 0 }, nearRadius = 450, concurrency = 8, onProgress } = {}) {
  const group = new THREE.Group();
  group.name = 'swissbuildings3d';
  group.userData.terrain = 'absolute'; // baked in world heights
  scene.add(group);
  const material = createMaterial();
  const stats = { offsets: [], buildings: 0, failed: 0 };
  let resolveReady, rejectReady;
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
  const done = (async () => {
    const index = await (await fetch(INDEX_URL)).json();
    // Roofs take the SWISSIMAGE orthophoto of the terrain chunk under the tile (one material per image)
    const ortho = await orthophotoIndex();
    const roofMaterials = new Map();
    const drapeRoofs = (mesh) => {
      const box = mesh.geometry.boundingBox, tile = ortho && orthophotoAt(ortho, (box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2);
      // (a tile reaching beyond its chunk's image keeps the roof colours, until its sharp roof atlas comes in)
      if (!tile || !orthophotoCovers(tile, box)) { mesh.userData.baseMaterial = material; return false; }
      setOrthophotoUV(mesh.geometry, tile);
      if (!roofMaterials.has(tile.f)) roofMaterials.set(tile.f, orthophotoTexture(tile).then((map) => ({ map, material: createMaterial(map) })));
      roofMaterials.get(tile.f).then(({ map, material: m }) => {
        mesh.userData.orthoMap = map; mesh.userData.baseMaterial = m;
        if (!mesh.userData.sharp) mesh.material = m;
      }).catch((error) => console.warn('[swissbuildings3d] roofs', tile.f, error));
      return true;
    };
    // Sharp roof crops (data/roofs/, tools/build-roof-atlases.mjs), one atlas per tile, streamed near the camera
    const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const hiresRoofs = await getJson(HIRES_ROOFS_URL);
    const roofIndex = hiresRoofs || await getJson(ROOFS_URL);
    roofBaseUrl = hiresRoofs ? HIRES_ROOFS_URL : ROOFS_URL;
    if (hiresRoofs) console.info(`[roofs] high-resolution roof crops (${hiresRoofs.res} m)`);
    let draped = 0;
    const base = new URL(index.base, INDEX_URL);
    const tiles = index.tiles.map((t, i) => ({ ...t, seed: i * 977, d: Math.hypot(t.x - center.x, t.z - center.z) })).sort((a, b) => a.d - b.d);
    const near = tiles.filter((t) => t.d <= nearRadius).length || Math.min(tiles.length, 12);
    let next = 0, loaded = 0, settled = 0;
    const settle = () => {
      settled++;
      onProgress?.(loaded, tiles.length);
      if (settled === near) (loaded ? resolveReady(group) : rejectReady(new Error('no swissBUILDINGS3D tile could be loaded')));
    };
    const worker = async () => {
      while (next < tiles.length) {
        const t = tiles[next++];
        try {
          const tile = parseB3dm(await fetchBuffer(new URL(t.u, base)));
          const gltf = await loaderFor().parseAsync(tile.glb, '');
          const geometry = bakeTile(gltf, { ...tile, seed: t.seed }, stats);
          if (geometry) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = t.u;
            mesh.castShadow = mesh.receiveShadow = true;
            if (drapeRoofs(mesh)) draped++;
            const pages = roofIndex?.tiles?.[t.u];
            if (pages?.length && setRoofAtlasUV(geometry, pages)) sharpRoofs.push({ mesh, pages, x: t.x, z: t.z, state: 0 });
            group.add(mesh);
            stats.buildings += geometry.userData.buildings;
          }
          loaded++;
        } catch (error) {
          stats.failed++;
          if (stats.failed <= 3) console.warn('[swissbuildings3d]', t.u, error);
        }
        settle();
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    group.userData = { terrain: 'absolute', city: 'Davos', source: `swisstopo swissBUILDINGS3D 3.0 (${index.release})`, tiles: loaded, failed: stats.failed, buildings: stats.buildings, calibration: median(stats.offsets) };
    console.info(`[swissbuildings3d] ${loaded}/${tiles.length} tiles (${draped} with orthophoto roofs), ${stats.buildings} buildings, height calibration ${median(stats.offsets)?.toFixed(2)} m`);
    return group;
  })();
  done.catch((error) => rejectReady(error));

  // Every half second: load the roof atlases of the tiles within 420 m of the camera (four at a time), release those
  // beyond 700 m
  const sharpRoofs = [];
  let roofBaseUrl = ROOFS_URL;
  const loader = new THREE.TextureLoader();
  let lastCheck = 0, loading = 0;
  const release = (e) => {
    e.mesh.userData.sharp = false;
    if (e.mesh.userData.baseMaterial) e.mesh.material = e.mesh.userData.baseMaterial;
    e.material?.dispose(); e.textures?.forEach((t) => t.dispose());
    e.material = e.textures = null; e.state = 0;
  };
  function updateRoofDetail(camera) {
    updateTerrainDetail(camera); // (the terrain's high-resolution orthophotos stream on the same tick)
    const now = performance.now();
    if (now - lastCheck < 500) return;
    lastCheck = now;
    for (const e of sharpRoofs) {
      const d = Math.hypot(e.x - camera.x, e.z - camera.z);
      if (e.state === 2 && d > 700) release(e);
      else if (e.state === 0 && d < 420 && loading < 4 && e.mesh.userData.baseMaterial) { // (once its orthophoto is in, if any)
        e.state = 1; loading++;
        Promise.all(e.pages.slice(0, MAX_PAGES).map((p) => loader.loadAsync(new URL(p.f, roofBaseUrl).href))).then((textures) => {
          for (const t of textures) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; }
          e.textures = textures;
          e.material = createMaterial(e.mesh.userData.orthoMap || null, textures);
          e.mesh.material = e.material; e.mesh.userData.sharp = true; e.state = 2;
          if (Math.hypot(e.x - camera.x, e.z - camera.z) > 700) release(e);
        }).catch((error) => { e.state = 3; console.warn('[roofs]', e.pages[0]?.f, error); }).finally(() => { loading--; });
      }
    }
  }
  return { group, ready, done, updateRoofDetail };
}
