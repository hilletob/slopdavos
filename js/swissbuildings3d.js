import * as THREE from 'three/webgpu';
import { mx_noise_float, positionWorld, normalWorld, cameraPosition, float, smoothstep, fract, step, vertexColor, attribute, vec2, vec3, mix, texture, uv, fwidth, hash as gpuHash, time, sin } from 'three/tsl';
import { cityUniforms } from './tsl-materials.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FRAME, lonLatToWorld } from './davos-frame.js';
import { ecefToLv95 } from './swiss-projection.js';
import { groundHeight } from './terrain.js';
import { snowyRoof } from './season.js';
import { FACADES } from './facades-data.js';
import { FACADE, gwrBuilding } from './gwr.js';
import { QUALITY } from './quality.js';
import { releaseImageAfterUpload } from './gpu-memory.js';
import { orthophotoIndex, orthophotoAt, orthophotoCovers, orthophotoTexture, setOrthophotoUV, updateTerrainDetail } from './swissimage.js';

// swisstopo swissBUILDINGS3D 3.0: every building of Switzerland with its real roof, as 3D Tiles 1.0 (b3dm with Draco
// glTF, georeferenced in WGS84 ECEF). The tiles overlapping the city are stored in data/swissbuildings3d/ (refreshed
// deliberately from 3d.geo.admin.ch by tools/update-swissbuildings3d.mjs); they stream in nearest first and are baked
// into engine coordinates:
//   x = LV95 east - E0, z = N0 - LV95 north, y = height a.s.l. - H0 (js/davos-frame.js).
// Each tile gets an exact local affine map (the Jacobian of the rigorous ECEF -> LV95 transformation at its centre: a
// tile spans ~100 m, so the residual is far below a millimetre). Heights come out above the Bessel ellipsoid; the batch
// table's surveyed roof tops (DACH_MAX, metres a.s.l.) calibrate each tile to orthometric heights without a geoid model.
// Older captures (all of Davos, 2014) carry neither DACH_MAX nor GELAENDEPUNKT: there each building's floor (drawn at
// the lowest ground around it) is set onto the lowest point of our terrain under it instead (median over the tile), and
// every building is then put onto its own base, its floor reaching under the ground (on a slope: the downhill walls).

const INDEX_URL = new URL('../data/swissbuildings3d/index.json', import.meta.url);
const ROOFS_URL = new URL('../data/roofs/index.json', import.meta.url);
// The optional high-resolution roof crops (0.1 m, npm run data:hires; not in git): preferred when present
const HIRES_ROOFS_URL = new URL('../data/hires/roofs/index.json', import.meta.url);
const MAX_PAGES = 4;
// Geoid height over the valley (the bakes' heights above the ellipsoid minus those a.s.l.): the calibration's reference
// until enough tiles are in (measured over all 1041 tiles' buildings, floor against base: 50.64 m, ±0.03 m whatever
// the slope)
const GEOID_OFFSET = 50.64;

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
// A measured facade colour (linear, 0-255), a quarter desaturated and kept to plausible plaster and timber brightness
// (the street images' exposure varies)
function measuredColor(f) {
  const r = f[0] / 255, g = f[1] / 255, b = f[2] / 255, l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const k = Math.min(0.75, Math.max(0.06, l)) / Math.max(l, 1e-4);
  return color.setRGB((l + (r - l) * 0.75) * k, (l + (g - l) * 0.75) * k, (l + (b - l) * 0.75) * k);
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
// Buildings rebuilt by hand (js/detail-houses.js): every building whose surveyed centre (the batch table's Latitude and
// Longitude) lies within r of an exclusion ({ x, z, r }, world) is left out of the baked tiles
const EXCLUSIONS = [];
export function excludeBuildings(list) { EXCLUSIONS.push(...list); }

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
  let positions = new Float32Array(total * 3);
  let batchOf = new Uint32Array(total);
  let normalsY = new Float32Array(total);
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

  // Left out: the excluded buildings, and the buildings already baked from another tile (swisstopo puts a building
  // that crosses a tile border into both tiles; drawn twice, the two copies, each with its own random style, fought
  // over the same pixels)
  const ids = batchTable.UUID || batchTable['gml:id'];
  if ((EXCLUSIONS.length && batchTable.Latitude) || ids) {
    const out = new Set();
    if (EXCLUSIONS.length && batchTable.Latitude) batchTable.Latitude.forEach((lat, b) => {
      const w = lonLatToWorld(batchTable.Longitude[b], lat);
      if (EXCLUSIONS.some((e) => Math.hypot(w.x - e.x, w.z - e.z) < e.r)) out.add(b);
    });
    if (ids) {
      stats.seen ??= new Set();
      ids.forEach((id, b) => { if (stats.seen.has(id)) { out.add(b); stats.duplicates = (stats.duplicates || 0) + 1; } else stats.seen.add(id); });
    }
    if (out.size) {
      // Keep the other buildings' triangles (the vertices come in threes, a triangle each)
      let w = 0;
      for (let t = 0; t < total; t += 3) {
        if (out.has(batchOf[t])) continue;
        for (let j = 0; j < 3; j++) {
          const from = t + j, to = w + j;
          positions[to * 3] = positions[from * 3]; positions[to * 3 + 1] = positions[from * 3 + 1]; positions[to * 3 + 2] = positions[from * 3 + 2];
          batchOf[to] = batchOf[from]; normalsY[to] = normalsY[from];
        }
        w += 3;
      }
      total = w;
      positions = positions.slice(0, total * 3); batchOf = batchOf.slice(0, total); normalsY = normalsY.slice(0, total);
      stats.excluded = (stats.excluded || 0) + out.size; // (exclusions and duplicates)
      if (!total) return null;
    }
  }

  // Left out too: triangles that repeat another one of the tile (the same three corners, to the centimetre, in any
  // order). Terraced houses come with both neighbours' copies of a shared wall, and where it shows (a taller neighbour,
  // a gap in the row) the two copies, styled apart, fought over the pixels: frames and shutters frayed into speckles.
  {
    // (the three corners, to the centimetre, sorted, hashed into numbers: a string key per triangle was most of the
    // tiles' garbage; a hash shared by two triangles is checked corner by corner)
    const seen = new Map(), cur = new Float64Array(9), other = new Float64Array(9);
    const corners = (t, out) => {
      for (let j = 0; j < 3; j++) for (let c = 0; c < 3; c++) out[j * 3 + c] = Math.round(positions[(t + j) * 3 + c] * 50);
      // (sorted: x, then y, then z)
      const less = (a, b) => out[a] < out[b] || (out[a] === out[b] && (out[a + 1] < out[b + 1] || (out[a + 1] === out[b + 1] && out[a + 2] < out[b + 2])));
      const swap = (a, b) => { for (let c = 0; c < 3; c++) { const x = out[a + c]; out[a + c] = out[b + c]; out[b + c] = x; } };
      if (less(3, 0)) swap(0, 3);
      if (less(6, 3)) swap(3, 6);
      if (less(3, 0)) swap(0, 3);
      return out;
    };
    const same = (a, b) => { for (let c = 0; c < 9; c++) if (a[c] !== b[c]) return false; return true; };
    let w = 0;
    for (let t = 0; t < total; t += 3) {
      corners(t, cur);
      let h = 2166136261;
      for (let c = 0; c < 9; c++) h = Math.imul(h ^ (cur[c] | 0), 16777619);
      const kept = seen.get(h);
      let dup = false;
      if (kept !== undefined) {
        if (typeof kept === 'number') dup = same(cur, corners(kept, other));
        else for (const k of kept) if (same(cur, corners(k, other))) { dup = true; break; }
      }
      if (dup) { stats.duplicateTriangles = (stats.duplicateTriangles || 0) + 1; continue; }
      // (the triangle's index once kept: it is moved to w below)
      if (kept === undefined) seen.set(h, w);
      else if (typeof kept === 'number') seen.set(h, [kept, w]);
      else kept.push(w);
      if (w !== t) for (let j = 0; j < 3; j++) {
        const from = t + j, to = w + j;
        positions[to * 3] = positions[from * 3]; positions[to * 3 + 1] = positions[from * 3 + 1]; positions[to * 3 + 2] = positions[from * 3 + 2];
        batchOf[to] = batchOf[from]; normalsY[to] = normalsY[from];
      }
      w += 3;
    }
    if (w < total) { total = w; positions = positions.slice(0, total * 3); batchOf = batchOf.slice(0, total); normalsY = normalsY.slice(0, total); }
  }

  // Vertical calibration: surveyed roof tops against the baked (ellipsoidal) ones
  const roofTop = batchTable.DACH_MAX || [];
  const maxY = new Map();
  for (let i = 0; i < total; i++) maxY.set(batchOf[i], Math.max(maxY.get(batchOf[i]) ?? -Infinity, positions[i * 3 + 1]));
  // Each building's floor (swissBUILDINGS3D draws every building down to a flat floor at the lowest point of the
  // terrain around it) and that lowest point on our terrain: the least ground height under the floor's corners and the
  // midpoints of its edges (the base, "Gebäudesockel")
  // (Roofs on posts — carports, canopies, a covered footbridge — have no walls down to their floor: left as they are)
  const standing = (b) => !/^(Offenes Gebaeude|Flugdach|Verbindungsbr|Unterirdisch)/.test(batchTable.OBJEKTART?.[b] || '');
  const floor = new Map(), sockel = new Map();
  for (let i = 0; i < total; i++) { const b = batchOf[i], y = positions[i * 3 + 1]; if (!(floor.get(b) <= y)) floor.set(b, y); }
  const atFloor = (i) => positions[i * 3 + 1] < floor.get(batchOf[i]) + 0.05;
  const sample = (b, x, z) => { const h = groundHeight(x, z); if (!(sockel.get(b) <= h)) sockel.set(b, h); };
  for (let t = 0; t < total; t += 3) {
    for (let j = 0; j < 3; j++) {
      const i = t + j, n = t + (j + 1) % 3;
      if (!atFloor(i)) continue;
      sample(batchOf[i], positions[i * 3], positions[i * 3 + 2]);
      if (atFloor(n)) sample(batchOf[i], (positions[i * 3] + positions[n * 3]) / 2, (positions[i * 3 + 2] + positions[n * 3 + 2]) / 2);
    }
  }
  const diffs = [];
  for (const [b, y] of maxY) if (Number.isFinite(roofTop[b])) diffs.push(roofTop[b] - FRAME.H0 - y);
  if (!diffs.length) {
    // No surveyed roofs (all of Davos): each building's floor onto its base. (Not the ground under its lowest vertex:
    // a flat floor's lowest vertex is any of its corners, half of them uphill — on a slope the tile came out metres
    // too high, its buildings floating.) The offset is the geoid's, the same to a few decimetres over the valley
    // (50.6 m on our terrain): a tile of a few buildings, or one far off the tiles loaded so far, takes the reference
    for (const [b, y] of floor) if (standing(b)) diffs.push(sockel.get(b) - y);
    const global = median(stats.offsets), guess = median(diffs);
    const reference = stats.offsets.length >= 8 ? global : GEOID_OFFSET;
    if (diffs.length < 3 || Math.abs(guess - reference) > 1.5) diffs.length = 0;
  }
  const local = median(diffs);
  if (local != null) stats.offsets.push(local);
  const dy = local ?? (stats.offsets.length >= 8 ? median(stats.offsets) : GEOID_OFFSET);
  // Each building onto its base: one sunk into the ground (where our 8 m terrain lies higher than the survey's) rises
  // to it, up to 3 m; and its floor reaches 0.5 m under the ground everywhere, so that on a slope the downhill walls
  // run into the ground instead of ending in the air (the floor sinks, the uphill walls stay where they are). Not
  // under what stands well clear of the ground (more than 6 m: the parts standing on another building's roof)
  const lift = new Map(), sink = new Map();
  for (const [b, y] of floor) {
    if (!standing(b)) { lift.set(b, 0); continue; }
    const gap = y + dy - sockel.get(b);
    const up = gap < -0.3 ? Math.min(-gap - 0.3, 3) : 0;
    lift.set(b, up);
    if (gap + up <= 6) sink.set(b, Math.min(y + dy + up, sockel.get(b) - 0.5));
    else stats.aloft = (stats.aloft || 0) + 1;
  }

  const ground = batchTable.GELAENDEPUNKT || [];
  const kinds = batchTable.OBJEKTART || [];
  const egids = batchTable.EGID || [];
  const colors = new Uint8Array(total * 4);
  const above = new Float32Array(total);
  const style = new Float32Array(total * 4);
  // Facades measured in street-level images (js/facades-data.js, Mapillary): per building its colour and timber share,
  // keyed by its surveyed centre; trusted from 25% confidence
  const measured = new Map();
  (batchTable.Latitude || []).forEach((lat, b) => {
    const f = FACADES.buildings[`${lat.toFixed(6)},${batchTable.Longitude[b].toFixed(6)}`];
    if (f && f[4] >= 25) measured.set(b, f);
  });
  // Each building's foot (its floor, or its surveyed ground point) and height: storeys count from the foot
  const foot = new Map(), top = new Map();
  for (let i = 0; i < total; i++) {
    const b = batchOf[i], y = positions[i * 3 + 1] + dy + lift.get(b);
    if (!(foot.get(b) <= y)) foot.set(b, y);
    if (!(top.get(b) >= y)) top.set(b, y);
  }
  // Each building's facade (js/gwr.js): its random number r, its kind from the building register (GWR: use, storeys,
  // year; the entry nearest its surveyed centre) and storey height (0: the kind's default). The street-level images
  // come first: a mostly timber facade is a chalet (forced: r = -1), a plastered one never (its style number kept clear
  // of them, a register chalet becomes a town house)
  const facadeOf = new Map();
  for (const b of foot.keys()) {
    const seed = (egids[b] || 0) * 31 + b + (tile.seed || 0);
    const f = measured.get(b), height = top.get(b) - foot.get(b);
    let r = hash(seed * 17 + 9);
    let kind = FACADE.UNKNOWN, storeyH = 0;
    if (batchTable.Latitude) {
      const w = lonLatToWorld(batchTable.Longitude[b], batchTable.Latitude[b]);
      ({ kind, storeyH } = gwrBuilding(w.x, w.z, hash(seed * 7 + 3), height));
      if (kind !== FACADE.UNKNOWN) stats.gwr = (stats.gwr || 0) + 1;
    }
    if (f) {
      r = f[3] >= 45 ? -1 : f[3] < 20 && r < 0.5 ? r + 0.5 : r;
      if (f[3] >= 45 && kind !== FACADE.BARN && kind !== FACADE.CHURCH) kind = FACADE.CHALET;
      if (f[3] < 20 && kind === FACADE.CHALET) kind = FACADE.TOWNHOUSE;
      if (f[3] < 20 && kind === FACADE.BARN) kind = FACADE.SHED;
    }
    facadeOf.set(b, [r, height, kind, storeyH]);
  }
  let minY = Infinity;
  for (let i = 0; i < total; i++) {
    const b = batchOf[i];
    const y = atFloor(i) && sink.has(b) ? sink.get(b) : positions[i * 3 + 1] + dy + lift.get(b);
    positions[i * 3 + 1] = y;
    minY = Math.min(minY, y);
    const base = Number.isFinite(ground[b]) ? ground[b] - FRAME.H0 : foot.get(b);
    above[i] = y - base;
    const seed = (egids[b] || 0) * 31 + b + (tile.seed || 0);
    const f = measured.get(b);
    style.set(facadeOf.get(b), i * 4);
    const roof = normalsY[i] > 0.35;
    const c = roof ? roofColor(seed, normalsY[i] < 0.97) : f ? measuredColor(f) : facadeColor(seed, kinds[b] || '');
    colors[i * 4] = c.r * 255; colors[i * 4 + 1] = c.g * 255; colors[i * 4 + 2] = c.b * 255; colors[i * 4 + 3] = roof ? 255 : 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4, true));
  geometry.setAttribute('aGround', new THREE.BufferAttribute(above, 1));
  // per building: a random number, its height, its facade kind (js/gwr.js FACADE) and storey height (0: default)
  geometry.setAttribute('aStyle', new THREE.BufferAttribute(style, 4));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.userData = { buildings: maxY.size, calibration: dy, minY };
  return geometry;
}

// Davos facades and roofs, procedural (no photographs of the facades exist): per building (aStyle: a random number, its
// height, its facade kind from the building register and storey height — js/gwr.js) one of these types —
//  - chalets (low houses): a stone plinth, plaster below and larch boarding above, small windows with green or ox-red
//    shutters;
//  - hotels and sanatoria (tall, south fronts): rows of wide balcony doors behind wooden balcony bands, the loggias'
//    shade under the slab above;
//  - town houses and blocks: plastered, windows in white frames, shutters on some, shop fronts on the ground floor
//    (register: only where it records shops, restaurants or mixed use);
//  - offices, schools, industry (register): wide windows in grey frames on every floor, no shutters;
//  - churches (register): tall narrow windows; farm buildings: timber boarding without windows; garages and sheds:
//    plain walls.
// Without a register entry the type follows the random number and the height (low: chalets, tall: hotels).
// Storeys and bays come from the height above the building's foot (aGround) and the position along the wall. Roofs:
// the orthophoto (`roofMap`, uv from above) or the roof colour, with slate courses across the fall line on pitched
// roofs and gravel on flat ones. The fine detail fades out with distance (no shimmer), and snow lies in winter.
// `sharp`: the pages of the tile's roof atlas (data/roofs/, 0.125 m), sampled at aRoof (u, v, page + 1; 0 off the
// atlas), blended over the orthophoto near the camera
// Both images are the drawn mesh's own (userData.orthoMap, userData.roofPages, read per object): one material serves
// every tile with the same number of atlas pages (sharedMaterial). A material per image or tile built its large node
// graph once each, ~1 MB of JavaScript apiece, ~250 materials over the city.
const PLACEHOLDER = (() => {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  t.colorSpace = THREE.SRGBColorSpace; // (the shader's colour decoding follows the texture it was built with)
  t.needsUpdate = true;
  return t;
})();
const objectTexture = (read, uvNode) => texture(PLACEHOLDER, uvNode).onObjectUpdate(({ object }) => read(object.userData) || PLACEHOLDER);
const sharedMaterials = new Map();
function sharedMaterial(roof, pages = 0) {
  const key = `${roof ? 1 : 0}/${pages}`;
  if (!sharedMaterials.has(key)) sharedMaterials.set(key, createMaterial(roof, pages));
  return sharedMaterials.get(key);
}
function createMaterial(roofMap = false, sharp = 0) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, flatShading: true });
  const above = attribute('aGround', 'float');
  const st = attribute('aStyle', 'vec4'), r = st.x, height = st.y, kind = st.z, storeyGwr = st.w;
  const is = (k) => step(kind.sub(k).abs(), 0.5); // (one facade kind of js/gwr.js)
  const known = step(0.5, kind); // a register entry decides the type
  const plain = is(FACADE.PLAIN), church = is(FACADE.CHURCH), barn = is(FACADE.BARN), shed = is(FACADE.SHED);
  const windowed = float(1).sub(barn).sub(shed);
  const roof = vertexColor().a;
  const n = normalWorld;
  const wall = step(n.y.abs(), 0.35).mul(float(1).sub(roof));
  const near = smoothstep(220, 60, positionWorld.distance(cameraPosition)); // detail fades with distance
  const r2 = fract(r.mul(7.31)), r3 = fract(r.mul(13.7));
  // (r < -0.5: a measured timber facade, a chalet at any height — js/facades-data.js; it comes before the register)
  const chalet = mix(step(height, 11).mul(step(r, 0.5)), is(FACADE.CHALET), known).max(step(r, -0.5)).mul(float(1).sub(barn).sub(church));
  const hotel = mix(step(13, height).mul(step(r, 0.55)), is(FACADE.HOTEL), known).mul(float(1).sub(chalet));
  const south = smoothstep(0.35, 0.6, n.z); // facing south (+z)

  // Facade grid: bays along the wall, storeys up from the foot
  const along = positionWorld.x.mul(n.z.abs()).add(positionWorld.z.mul(n.x.abs()));
  // (the register's storey count sets the storey height where it has one)
  const bayW = mix(float(2.7), float(3.4), r2), storeyH = mix(mix(float(2.95), float(2.6), chalet), storeyGwr, step(0.5, storeyGwr));
  const u = fract(along.div(bayW)), v = fract(above.div(storeyH)), storey = above.div(storeyH).floor();
  // A soft-edged rectangle [u0, u1] x [v0, v1] of the bay (bounds may be nodes)
  // Edges at least ~1.5 px soft (fwidth), so that frames, shutters and panes don't break into speckles at a distance
  const fu = fwidth(u).mul(1.5), fv = fwidth(v).mul(1.5);
  const box = (u0, u1, v0, v1, f = 0.02) => {
    [u0, u1, v0, v1] = [u0, u1, v0, v1].map((e) => (typeof e === 'number' ? float(e) : e));
    const eu = fu.max(f), ev = fv.max(f);
    return smoothstep(u0, u0.add(eu), u).mul(smoothstep(u1, u1.sub(eu), u)).mul(smoothstep(v0, v0.add(ev), v)).mul(smoothstep(v1, v1.sub(ev), v));
  };
  // How resolved the bay is on screen: 1 when a bay spans 25+ px, 0 below ~10 px (then the small parts fade out)
  const resolved = smoothstep(0.1, 0.04, fwidth(u));
  // (offices and churches: windows on the ground floor too; none on the plinth under the foot, down a slope)
  const upper = step(0.5, storey).max(plain).max(church).mul(step(0, above));
  // Windows (hotels: wide balcony doors; offices: wide; churches: tall and narrow), their frames, the shutters
  const winW = mix(mix(mix(mix(float(0.2), float(0.27), chalet), float(0.1), plain), float(0.4), church), float(0.08), hotel.mul(south)); // inset from each side of the bay
  const winV = mix(mix(float(0.3), float(0.12), church), float(0.06), hotel.mul(south)); // sill
  const glassMask = box(winW, float(1).sub(winW), winV, 0.84).mul(upper).mul(windowed);
  const frame = box(winW.sub(0.04), float(1.04).sub(winW), winV.sub(0.03), 0.87).mul(upper).mul(windowed).sub(glassMask).max(0);
  // shutters: on some town houses, most register chalets; never on hotels, offices, churches, sheds
  const shutterable = mix(float(1).sub(hotel), chalet.add(is(FACADE.TOWNHOUSE)).add(is(FACADE.SHOPS)).min(1), known);
  const shuttered = step(r3, mix(float(0.55), float(0.8), chalet.mul(known))).mul(shutterable);
  const shutter = box(winW.sub(0.15), winW.sub(0.045), 0.3, 0.84).max(box(float(1.045).sub(winW), float(1.15).sub(winW), 0.3, 0.84)).mul(upper).mul(shuttered).mul(resolved);
  // (the louvres only where they span a few pixels)
  const slats = smoothstep(0.35, 0.5, fract(above.mul(14)).sub(0.5).abs()).mul(0.25).mul(smoothstep(0.4, 0.15, fwidth(above.mul(14))));
  const shutterColour = mix(vec3(0.07, 0.2, 0.09), vec3(0.32, 0.07, 0.04), step(0.5, fract(r.mul(3.3)))).mul(float(1).sub(slats));
  // Hotel balconies on the south fronts: a wooden balustrade band and the slab's shade over each storey
  const balcony = hotel.mul(south).mul(upper);
  const rail = smoothstep(0.0, 0.02, v).mul(smoothstep(0.34, 0.32, v)).mul(balcony);
  const railWood = mix(vec3(0.25, 0.14, 0.065), mix(vec3(0.2, 0.11, 0.05), vec3(0.3, 0.17, 0.08), smoothstep(0.3, 0.5, fract(along.mul(9)).sub(0.5).abs())), smoothstep(0.4, 0.15, fwidth(along.mul(9))));
  const loggia = smoothstep(0.86, 0.98, v).mul(balcony);
  // Chalets: larch boarding above the ground floor; barns: above the plinth
  const boards = chalet.mul(step(2.6, above)).max(barn.mul(step(0.75, above)));
  const wood = mix(vec3(0.2, 0.11, 0.05), vec3(0.33, 0.2, 0.1), mx_noise_float(vec3(along.mul(0.6), above.mul(4), r.mul(50))).mul(0.5).add(0.5))
    .mul(float(1).sub(smoothstep(0.42, 0.5, fract(above.mul(4.5)).sub(0.5).abs()).mul(0.35).mul(smoothstep(0.4, 0.15, fwidth(above.mul(4.5))))));
  // Shop fronts on the ground floor of town houses (register: of shops, restaurants, mixed use, and some hotels)
  const shops = mix(step(r2, 0.45).mul(float(1).sub(chalet)), is(FACADE.SHOPS).mul(step(r2, 0.9)).max(hotel.mul(step(r2, 0.45))), known);
  const shop = step(0.5, above).mul(step(above, 3.1)).mul(shops).mul(box(0.08, 0.92, 0, 1, 0.03));
  // Plaster: a fine grain, rain streaks under the eaves and the windows; the stone plinth
  const grain = mx_noise_float(positionWorld.mul(0.6)).mul(0.08).add(0.96);
  const streaks = mx_noise_float(vec3(along.mul(1.3), above.mul(0.08), r.mul(30))).mul(0.5).add(0.5);
  const plaster = vertexColor().rgb.mul(grain).mul(mix(float(1), streaks.mul(0.12).add(0.88), near));
  const plinth = smoothstep(0.75, 0.65, above).mul(wall);
  let facade = mix(plaster, wood, boards);
  facade = mix(facade, vec3(0.26, 0.255, 0.24).mul(grain), plinth);
  facade = mix(facade, railWood, rail);
  facade = mix(facade, facade.mul(0.55), loggia);
  facade = mix(facade, mix(vec3(0.8, 0.79, 0.76), vec3(0.3, 0.31, 0.32), plain), frame.mul(near.mul(0.7).add(0.3)).mul(resolved.mul(0.7).add(0.3)));
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
  let roofBase = roofMap ? objectTexture((u) => u.orthoMap, uv()).rgb : vertexColor().rgb.mul(grain);
  let photo = float(0); // how much of the roof shows the sharp crop (it carries its own tiles and gravel)
  if (sharp) {
    const at = attribute('aRoof', 'vec3');
    // the page: at.z - 1 (up to MAX_PAGES atlas pages per tile)
    let crop = objectTexture((u) => u.roofPages?.[0], at.xy).rgb;
    for (let p = 1; p < sharp; p++) crop = mix(crop, objectTexture((u) => u.roofPages?.[p], at.xy).rgb, step(p + 0.5, at.z));
    photo = step(0.5, at.z).mul(smoothstep(520, 380, positionWorld.distance(cameraPosition)));
    roofBase = mix(roofBase, crop, photo);
  }
  let roofColour = mix(roofBase, roofBase.mul(0.72), joint.mul(pitched).mul(near).mul(float(1).sub(photo.mul(0.75))));
  roofColour = mix(roofColour, roofColour.mul(gravel.mul(0.25).add(0.85)), flat.mul(near));

  m.colorNode = snowyRoof(mix(facade, roofColour, roof), roof);
  // Glossy only well inside the panes (and only where they resolve): a soft pane edge would hand the frames a little
  // metalness, and the half-resolution reflections (main.js) then fray them into speckles
  const pane = step(0.6, glassMask.add(shop).min(1)).mul(float(1).sub(roof)).mul(step(0.5, resolved));
  m.roughnessNode = mix(float(0.92), float(0.12), pane);
  m.metalnessNode = mix(float(0), float(0.5), pane.mul(step(0.6, glassMask)));
  m.emissiveNode = windowLights({ r, kind: { chalet, hotel, plain, church }, along, above, bayW, storeyH, u, v, n, glassMask, shop, rail, wall, near, resolved, winW, winV, upper, windowed });
  return m;
}

// Lit windows at dusk and night: 0 by day (the scene's interior glow, js/lighting.js, ramps it in with the blue hour).
// Every window (its bay along the wall, its storey, its wall's facing and the building's random number) draws its own
// hash: whether anyone is home (second homes and holiday flats stay dark: chalets often, hotels rarely), whether the
// light is on (a share by use: hotels most, flats some, offices few by evening and fewer by midnight, churches a dim
// glow, barns and sheds none), its colour (mostly warm 2700 K bulbs, some halogen and neutral LED, a few bluish
// flickering TVs) and whether curtains are drawn (dimmer and warmer). Each window re-rolls its switch every few
// minutes, and each building's activity drifts over half an hour, so lights go on and off one by one through the
// night. Shop fronts on the ground floor are brightly lit. Where the bays get too small on screen to tell one window
// from the next (as with the facade's `resolved`), the expected glow of the facade's glass is shown instead of a
// shimmer of single windows: the town still glows from the heli and across the valley.
function windowLights({ r, kind, along, above, bayW, storeyH, u, v, n, glassMask, shop, rail, wall, near, resolved, winW, winV, upper, windowed }) {
  const { chalet, hotel, plain, church } = kind;
  const glow = cityUniforms.uInteriorGlow;
  const night = smoothstep(0.7, 1.45, glow); // golden 0, twilight ~0.7, midnight 1
  const late = smoothstep(1.3, 1.55, glow); // towards midnight fewer lights
  // Integer keys: the wall's facing (front and back walls share `along`), the bay, the storey, the building
  const face = n.x.mul(4).round().add(4).add(n.z.mul(4).round().add(4).mul(9));
  const building = gpuHash(r.add(2).mul(1e6).floor().add(face.mul(3.1e6)));
  const bay = along.div(bayW).floor().add(16384), storey = above.div(storeyH).floor().add(2);
  const key = bay.add(storey.mul(32768)).add(building.mul(4e6).floor());
  const h = gpuHash(key);
  const hn = (i) => gpuHash(h.mul(1.6e7).floor().add(i)); // further numbers of the same window
  // Who is home: a share of the buildings by use (Davos: many second homes)
  const townhouse = float(1).sub(chalet).sub(hotel).sub(plain).sub(church).max(0);
  const occShare = chalet.mul(0.55).add(townhouse.mul(0.78)).add(hotel.mul(0.92)).add(plain.mul(0.85)).add(church.mul(0.6));
  const home = step(fract(r.mul(5.77).add(0.13)), occShare);
  // The share of lit windows by use, and its slow drift per building (period ~30 min, ±35%)
  const share = chalet.mul(0.5).add(townhouse.mul(mix(0.48, 0.36, late))).add(hotel.mul(mix(0.66, 0.5, late)))
    .add(plain.mul(mix(0.3, 0.07, late))).add(church.mul(0.75));
  const activity = sin(time.mul(Math.PI * 2 / 1800).add(r.mul(41))).mul(0.35).add(1);
  const lit = share.mul(activity).mul(home);
  // The switch: re-rolled every 5–15 min per window (a staggered phase), compared against the lit share
  const period = mix(float(300), float(900), hn(3));
  const slot = time.div(period).add(hn(4)).floor();
  const on = step(gpuHash(h.mul(1.6e7).floor().add(slot.mul(7)).add(11)), lit);
  // Colour: warm 2700 K most, halogen, neutral LED, bluish TV (flickering); curtains drawn on a third (dimmer, warmer)
  const c = hn(5), tv = step(0.92, c);
  const flicker = mx_noise_float(vec3(time.mul(3.1), h.mul(97), 0)).mul(0.45).add(0.75);
  let col = mix(vec3(1.0, 0.56, 0.24), vec3(1.0, 0.68, 0.38), step(0.55, c));
  col = mix(col, vec3(0.92, 0.84, 0.7), step(0.8, c));
  col = mix(col, vec3(0.36, 0.52, 1.0).mul(flicker), tv);
  const curtain = step(hn(6), 0.33);
  const folds = mix(float(1), sin(u.mul(70)).mul(0.12).add(0.88), near.mul(resolved));
  col = mix(col, col.mul(vec3(1.0, 0.82, 0.62)).mul(0.5).mul(folds), curtain);
  // brighter towards the ceiling lamp, a little variation in strength; churches a dim glow
  const strength = hn(7).mul(0.5).add(0.75).mul(smoothstep(winV, float(0.84), v).mul(0.35).add(0.8)).mul(mix(float(1), float(0.4), church));
  const win = col.mul(strength).mul(on).mul(glassMask).mul(float(1).sub(rail));
  // Expected glow of the facade's glass when the bays fall below a few pixels: the glass share of a bay times the
  // mean lit share and mean colour (curtains, strength and TVs averaged)
  const glassShare = float(1).sub(winW.mul(2)).max(0).mul(float(0.84).sub(winV)).mul(upper).mul(windowed);
  const meanWindow = vec3(0.94, 0.62, 0.39).mul(0.83).mul(mix(float(1), float(0.4), church));
  // (held well below the mean: seen from afar, lit windows read as sparse points of light in dark walls, not as glowing walls)
  const average = meanWindow.mul(lit).mul(glassShare).mul(0.15);
  const fine = smoothstep(0.3, 0.12, fwidth(u).max(fwidth(v))); // bays of 8+ px: single windows; below ~3 px: the mean
  // Shop fronts: lit at dusk, most still at midnight (window displays), per bay
  const shopOn = step(gpuHash(bay.add(building.mul(4e6).floor()).add(7e6)), mix(0.85, 0.5, late));
  const shopGlow = vec3(1.0, 0.84, 0.62).mul(mix(shopOn, mix(0.85, 0.5, late), float(1).sub(fine))).mul(shop).mul(smoothstep(0.5, 3.1, above).mul(0.5).add(0.45)); // (brighter under the ceiling lights)
  const brightness = 1.15;
  return mix(average, win, fine).mul(brightness).add(shopGlow).mul(wall).mul(night);
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
  const material = sharedMaterial(false);
  const stats = { offsets: [], buildings: 0, failed: 0 };
  let resolveReady, rejectReady;
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
  const done = (async () => {
    const index = await (await fetch(INDEX_URL)).json();
    // Roofs take the SWISSIMAGE orthophoto of the terrain chunk under the tile (one shared material, each tile its image)
    const ortho = await orthophotoIndex();
    const roofImages = new Map();
    const drapeRoofs = (mesh) => {
      // (not on the mobile profile, js/quality.js: one shared material and no roof images keep its memory down)
      if (!QUALITY.roofOrthophotos) { mesh.userData.baseMaterial = material; return false; }
      const box = mesh.geometry.boundingBox, tile = ortho && orthophotoAt(ortho, (box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2);
      // (a tile reaching beyond its chunk's image keeps the roof colours, until its sharp roof atlas comes in)
      if (!tile || !orthophotoCovers(tile, box)) { mesh.userData.baseMaterial = material; return false; }
      setOrthophotoUV(mesh.geometry, tile);
      if (!roofImages.has(tile.f)) roofImages.set(tile.f, orthophotoTexture(tile));
      roofImages.get(tile.f).then((map) => {
        const m = sharedMaterial(true);
        mesh.userData.orthoMap = map; mesh.userData.baseMaterial = m;
        if (!mesh.userData.sharp) mesh.material = m;
      }).catch((error) => console.warn('[swissbuildings3d] roofs', tile.f, error));
      return true;
    };
    // Sharp roof crops (data/roofs/, tools/build-roof-atlases.mjs), one atlas per tile, streamed near the camera
    const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const hiresRoofs = QUALITY.hires ? await getJson(HIRES_ROOFS_URL) : null;
    const roofIndex = !QUALITY.sharpRoofs ? null : hiresRoofs || await getJson(ROOFS_URL);
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
    group.userData = { terrain: 'absolute', city: 'Davos', source: `swisstopo swissBUILDINGS3D 3.0 (${index.release})`, tiles: loaded, failed: stats.failed, buildings: stats.buildings, gwr: stats.gwr || 0, calibration: median(stats.offsets) };
    console.info(`[swissbuildings3d] ${loaded}/${tiles.length} tiles (${draped} with orthophoto roofs), ${stats.buildings} buildings (${stats.gwr || 0} with a GWR entry), height calibration ${median(stats.offsets)?.toFixed(2)} m`);
    return group;
  })();
  done.catch((error) => rejectReady(error));

  // Every half second: load the roof atlases of the tiles within 420 m of the camera (four at a time), release those
  // beyond 700 m (js/quality.js sharpRoofNear / sharpRoofFar; none on the mobile profile)
  const sharpRoofs = [];
  let roofBaseUrl = ROOFS_URL;
  const loader = new THREE.TextureLoader();
  let lastCheck = 0, loading = 0;
  const release = (e) => {
    e.mesh.userData.sharp = false;
    if (e.mesh.userData.baseMaterial) e.mesh.material = e.mesh.userData.baseMaterial;
    // (the material is shared; the pages go a second later, when the frames queued may no longer sample them)
    const textures = e.textures;
    if (textures) setTimeout(() => textures.forEach((t) => t.dispose()), 1000);
    delete e.mesh.userData.roofPages;
    e.material = e.textures = null; e.state = 0;
  };
  function updateRoofDetail(camera) {
    updateTerrainDetail(camera); // (the terrain's high-resolution orthophotos stream on the same tick)
    const now = performance.now();
    if (now - lastCheck < 500) return;
    lastCheck = now;
    for (const e of sharpRoofs) {
      const d = Math.hypot(e.x - camera.x, e.z - camera.z);
      if (e.state === 2 && d > QUALITY.sharpRoofFar) release(e);
      else if (e.state === 0 && d < QUALITY.sharpRoofNear && loading < 4 && e.mesh.userData.baseMaterial) { // (once its orthophoto is in, if any)
        e.state = 1; loading++;
        Promise.all(e.pages.slice(0, MAX_PAGES).map((p) => loader.loadAsync(new URL(p.f, roofBaseUrl).href))).then((textures) => {
          for (const t of textures) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; releaseImageAfterUpload(t); }
          e.textures = textures;
          e.mesh.userData.roofPages = textures;
          e.material = sharedMaterial(!!e.mesh.userData.orthoMap, textures.length);
          e.mesh.material = e.material; e.mesh.userData.sharp = true; e.state = 2;
          if (Math.hypot(e.x - camera.x, e.z - camera.z) > QUALITY.sharpRoofFar) release(e);
        }).catch((error) => { e.state = 3; console.warn('[roofs]', e.pages[0]?.f, error); }).finally(() => { loading--; });
      }
    }
  }
  return { group, ready, done, updateRoofDetail };
}
