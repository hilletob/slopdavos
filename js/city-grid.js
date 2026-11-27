import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { attribute } from 'three/tsl';
import {
  blockAt,
  TOWN_DATA,
  nearestRoads,
  roadCloserThan,
  pointInPoly,
  waterAt
} from './city-config.js';
import {
  createRoadSurfaceMaterial,
  createSidewalkMaterial,
  createCurbMaterial,
  createWaterMaterial,
  createParkLawnMaterial,
  createParkPavingMaterial,
  createTrailMaterial,
  createRoadPaintMaterial
} from './tsl-materials.js';
import { LANDMARK_EXCLUSIONS, BERGHAIN_TREE_SITES } from './landmarks.js';
import { mappedPoints, mappedBounds, mappedPolygonGeometry, mappedStrip, mappedRoadSegments, mappedGeometryGroups } from './mapped-geometry.js';
import { CROSSWALKS } from './crosswalks-data.js';
import { streetCorners, cornersIn, convexPlanes, inCornerCut } from './street-corners.js';
import { freezeWater, snowyStreet } from './season.js';
import { TLM_TREES } from './tlm-trees-data.js';
import { GOLF } from './golf-data.js';
import { SKI_PISTES } from './ski-pistes-data.js';
import { BERGBAHNEN } from './bergbahnen-data.js';
import { SPECIES_INDEX as TREE, SPECIES_HEIGHT, plantedTree, plantedAt } from './trees.js';
// (the sled run's forest aisles, js/missions-data-fondue.js: [x0, z0, x1, z1] each)
export const SLED_AISLES = [[-1328.5, -51.6, -1304.8, -36], [-1215.7, -138.5, -1209.8, -95], [-1265.5, 177.5, -1248.1, 214.1]];
import { QUALITY, REGION_ALL } from './quality.js';
import { indexGeometry } from './gpu-memory.js';
import { withoutTraced } from './ground-markings-area.js';
import { busBaySegments } from './bus-bays.js';
import { FRAME } from './davos-frame.js';
import { isBenched } from './path-bench.js';
import { PATH_BENCHES } from './terrain.js';
import { BANK, stillWater, naturalBank, inWaterBody, bedCut, apronTriangles, bankStones } from './terrain.js';
import { buildTerrainMeshes, carveRoads, drapeOverlay, displaceGeometry, groundHeight, waterSurfaceHeight, deckHeight, deckHalfWidth, pierClear, addRaisedSidewalk, RAISED_SIDEWALK_TOP, OVERPASSES } from './terrain.js';
import { inFlatRing as inRing } from './ring.js';

// Live construction data consumed by the building and street-detail builders after buildCityGrid().
let parkTreeSites;
let mappedStreetSites = [];

const CITY_MERGE_CELL = 1000; // m: tiles of the merged ground layers (roads, sidewalks, curbs, lawns, paint, water)
const CITY_MERGE_MAX_VERTICES = 1 << 20; // per merged mesh (non-indexed, ~32 MB of attributes at most)

// (the mobile profile: the build pauses now and then, so that Safari's garbage collector gets to free the pieces already
// merged before the next pile up: without, JavaScriptCore let the build's short-lived arrays grow to ~2.5 GB)
const buildPause = () => (QUALITY.mobile ? new Promise((resolve) => setTimeout(resolve, 30)) : null);

// The ground layers' materials, shared by everything built with them (the town at the start and, on the mobile
// profile, the cells js/world-stream.js builds while playing)
let cityMats = null;
function cityMaterials() {
  if (cityMats) return cityMats;
  // In winter (season.js) the streets lie under packed snow and slush, the lakes freeze over
  const roadMat = snowyStreet(createRoadSurfaceMaterial(), { cover: 0.7 });
  const sidewalkMat = snowyStreet(createSidewalkMaterial(), { cover: 0.9 });
  const walkMat = snowyStreet(createSidewalkMaterial({ asphalt: true }), { cover: 0.9 }); // the raised sidewalks
  const curbMat = snowyStreet(createCurbMaterial(), { cover: 0.95, top: true });
  // (the road bridges' slabs, parapets and piers and the overpasses' abutments: cast concrete)
  const concreteMat = snowyStreet(new THREE.MeshStandardNodeMaterial({ color: 0x8c8b84, roughness: 0.96 }), { cover: 0.95, top: true });
  // (`waterStill` on the water's vertices: 1 on still water, which freezes wherever it lies, js/terrain.js)
  const waterMat = freezeWater(createWaterMaterial(), { still: attribute('waterStill', 'float') });
  const lawnMat = createParkLawnMaterial(false);
  const pavingMat = snowyStreet(createParkPavingMaterial(), { cover: 0.9 });
  const paintMat = snowyStreet(createRoadPaintMaterial(), { paint: true });
  // (the markings lie ~1 cm over the asphalt: pulled forward in depth so that they never flicker through it far off)
  paintMat.polygonOffset = true; paintMat.polygonOffsetFactor = -1; paintMat.polygonOffsetUnits = -4;
  // (the unsealed paths and tracks and every bench's fill slope; in winter under trodden snow from edge to edge)
  const trailMat = snowyStreet(createTrailMaterial(), { cover: 1 });
  return (cityMats = { roadMat, sidewalkMat, walkMat, curbMat, concreteMat, waterMat, lawnMat, pavingMat, paintMat, trailMat });
}

// --- The paths and tracks as level benches (js/path-bench.js) --------------------------------------------------------------
const BENCH_LIFT = 0.07; // m the bench lies over its profile (the profile's own tolerance, and the chords between samples)
const SKIRT_MIN = 0.12; // m: an edge standing less than this over the ground has no fill slope drawn
const TRAIL_SURFACE = { g: 0, d: 1, r: 2, w: 3 };
/**
 * The bench of way `r` along the stretches `owned(segment index)` says are to be built, in world heights:
 * { paved, trail } geometries (either may be null). A sealed way's surface goes to the paving material (uv: its style),
 * an unsealed one's and every fill slope to the trail material (uv: across -1..1 and on to ±2 down the slope, metres
 * along; `trail`: half width, surface, overgrowth). `skip(x, z)`: no bench there (a carriageway lies over it).
 */
function benchGeometries(r, owned, skip) {
  const P = PATH_BENCHES.profile(r);
  if (!P) return { paved: null, trail: null };
  const sf = r.sf || 'p0', sealed = sf[0] === 'p';
  const surface = TRAIL_SURFACE[sf[0]] ?? 0, grown = +sf[1] || 0, half = P.half;
  const make = () => ({ pos: [], nor: [], uv: [], trail: [] });
  const top = make(), side = sealed ? make() : top;
  const _a = [0, 0, 0], _b = [0, 0, 0];
  // A triangle facing up, its corners [x, y, z, u, v]
  const tri = (o, p, q, w) => {
    for (let c = 0; c < 3; c++) { _a[c] = q[c] - p[c]; _b[c] = w[c] - p[c]; }
    let nx = _a[1] * _b[2] - _a[2] * _b[1], ny = _a[2] * _b[0] - _a[0] * _b[2], nz = _a[0] * _b[1] - _a[1] * _b[0];
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    if (ny < 0) { const t = q; q = w; w = t; nx = -nx; ny = -ny; nz = -nz; }
    for (const v of [p, q, w]) {
      o.pos.push(v[0], v[1], v[2]); o.nor.push(nx / l, ny / l, nz / l); o.uv.push(v[3], v[4]); o.trail.push(half, surface, grown);
    }
  };
  const quad = (o, a, b, c, d) => { tri(o, a, b, c); tri(o, a, c, d); };
  // Per sample: the two edges on the bench, their drop to the ground, and the feet of the fill slopes
  const edge = (m, sgn) => {
    const x = P.x[m] + sgn * P.nx[m] * half, z = P.z[m] + sgn * P.nz[m] * half, y = P.h[m] + BENCH_LIFT;
    const drop = y - groundHeight(x, z);
    const out = Math.min(2.5, 0.12 + Math.max(0, drop) * 0.55), nl = Math.hypot(P.nx[m], P.nz[m]) || 1;
    const fx = x + (sgn * P.nx[m] / nl) * out, fz = z + (sgn * P.nz[m] / nl) * out;
    return { p: [x, y, z, sealed ? (r.kind === 'cycleway' ? 0 : 2) : -sgn, sealed ? 0 : P.s[m]], drop, foot: [fx, Math.min(y, groundHeight(fx, fz)) - 0.15, fz, -sgn * 2, P.s[m]], rim: [x, y, z, -sgn, P.s[m]] };
  };
  let prev = null;
  for (let m = 0; m < P.n; m++) {
    const here = { l: edge(m, 1), r: edge(m, -1) };
    if (prev && owned(P.seg[m - 1]) && !skip((P.x[m - 1] + P.x[m]) / 2, (P.z[m - 1] + P.z[m]) / 2)) {
      quad(top, prev.l.p, here.l.p, here.r.p, prev.r.p);
      for (const k of ['l', 'r']) {
        if (prev[k].drop < SKIRT_MIN && here[k].drop < SKIRT_MIN) continue;
        quad(side, prev[k].rim, here[k].rim, here[k].foot, prev[k].foot);
      }
    }
    prev = here;
  }
  const geometry = (o, withTrail) => {
    if (!o.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
    if (withTrail) g.setAttribute('trail', new THREE.Float32BufferAttribute(o.trail, 3));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  };
  return sealed ? { paved: geometry(top, false), trail: geometry(side, true) } : { paved: null, trail: geometry(top, true) };
}
// Everything is built flat (small y offsets above y = 0) and laid on the terrain before merging: ground layers are
// draped, solids displaced; geometry of a bridge follows its deck; `absolute` geometry is already in world heights.
function makeCollector() {
  const collections = new Map();
  const onDeck = new WeakSet(), absolute = new WeakSet();
  const c = {
    collections, onDeck, absolute, deckContext: false,
    collect(geometry, material, { world = false } = {}) {
      if (!geometry) return;
      if (!collections.has(material)) collections.set(material, []);
      collections.get(material).push(geometry);
      if (c.deckContext) onDeck.add(geometry);
      if (world) absolute.add(geometry);
    }
  };
  return c;
}
const firstMeshOf = new Map(); // material -> the first merged mesh drawn with it (userData.sharesPipelineWith)
// Lays the collected flat layers on the terrain and merges them per material and `mergeCell` m tile: the meshes.
// The mobile profile (js/quality.js) shares each piece's equal corners at once (gpu-memory.js indexGeometry: a draped
// strip has ~5 corners a vertex) and merges them indexed: the town's ground layers never stand in memory in full,
// non-indexed, twice over (~200 MB).
async function mergeCollections({ collections, onDeck, absolute }, { mergeCell = CITY_MERGE_CELL } = {}) {
  const { curbMat, concreteMat, lawnMat, waterMat, paintMat } = cityMaterials();
  const indexed = QUALITY.compactGeometry;
  const meshes = [];
  // (the mobile profile pauses once per ~600 pieces handled, a small cell's few hundred not at all)
  let sincePause = 0;
  const pause = async (n = 1) => { if (QUALITY.mobile && (sincePause += n) >= 600) { sincePause = 0; await buildPause(); } };
  for (const [material, geometries] of collections) {
    for (let i = 0; i < geometries.length; i++) {
      await pause();
      const g = geometries[i];
      if (!absolute.has(g)) {
        const deck = onDeck.has(g);
        geometries[i] = material === curbMat || material === concreteMat ? displaceGeometry(g, { deck }) : drapeOverlay(g, { deck, maxEdge: material === lawnMat ? 10 : 8 });
        if (geometries[i] !== g) g.dispose();
        // (where the road paint is traced from the aerial photo, js/vector-ground.js draws it: these markings step back,
        // cut once draped, its triangles then 8 m at most: a long strip's few triangles reach well past the traced cells)
        if (material === paintMat) {
          const kept = withoutTraced(geometries[i]);
          if (kept !== geometries[i]) {
            geometries[i].dispose();
            if (!kept) { geometries.splice(i, 1); i--; continue; }
            geometries[i] = kept;
          }
        }
      }
      if (indexed && !geometries[i].index) {
        const flat = geometries[i];
        geometries[i] = indexGeometry(flat, { force: true }) || flat;
        if (geometries[i] !== flat) flat.dispose();
      }
    }
  }
  // Merge per material and 1 km tile, retaining the original TSL node materials including wet asphalt, animated
  // water and anti-aliased dash paint: one draw per material and tile, each culled by the view frustum (and the shadow
  // cascades) on its own. (Batches of 300 pieces per 750 m cell made ~580 meshes, ~130 drawn from the valley floor;
  // 1 km tiles make ~375, ~70 drawn. Smaller tiles cull better but multiply the draws: 400 m tiles drew ~270.)
  for (const [material, geometries] of collections) {
    const cells = mappedGeometryGroups(geometries, mergeCell);
    if (QUALITY.mobile) geometries.length = 0; // (the cells hold them now, and let each batch go once merged)
    for (const cell of cells) for (let i = 0; i < cell.length;) {
      const batch = [];
      for (let vertices = 0; i < cell.length && (batch.length === 0 || vertices < CITY_MERGE_MAX_VERTICES); i++) {
        const g = cell[i];
        batch.push(g);
        vertices += g.index ? g.index.count : g.attributes.position.count;
      }
      const keepIndex = indexed && batch.every(g => g.index); // (mergeGeometries: all indexed or none)
      const chunk = batch.map(g => {
        if (!g.index || keepIndex) return g;
        const expanded = g.toNonIndexed(); g.dispose(); return expanded;
      });
      const merged = mergeGeometries(chunk, false);
      chunk.forEach(g => g.dispose());
      if (QUALITY.mobile) { cell.fill(null, i - batch.length, i); await pause(batch.length); } // (the merged pieces may go)
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.receiveShadow = material !== waterMat; mesh.castShadow = material === curbMat || material === concreteMat;
      if (material === paintMat) mesh.renderOrder = 1;
      const first = firstMeshOf.get(material);
      if (first && first.parent) mesh.userData.sharesPipelineWith = first; // (one shader build serves the rest)
      else firstMeshOf.set(material, mesh);
      meshes.push(mesh);
    }
  }
  collections.clear();
  return meshes;
}
const streetSiteKeys = new Set(); // (the lamps' sites along the streets, one per 14 m square, never twice)
// Where the street lamps end on a road leaving the town (its last houses, like an Ortsende): on the roads whose name
// matches, no lamp beyond the line through (x, z) across (dx, dz), the direction away from the town. The Flüelastrasse
// is lit through Davos Dorf up to Stilli; past the hamlet's last houses by the road (the two commercial buildings at
// x ≈ 1900, just after the bus terminus) it climbs the Flüelatal to the pass unlit (Flüelapassstrasse, Via Pass dal
// Flüela: the only carriageway up the valley). Nothing hangs off a missing mast either: the site carries the street-name
// plate and the light (js/street-details.js), so the road beyond keeps neither.
const UNLIT_BEYOND = [
  { road: /Flüela/, x: 1920, z: -1765, dx: 0.97, dz: 0.24 }
];
const beyondStreetLamps = (road, x, z) => UNLIT_BEYOND.some((e) => e.road.test(road.name || '') && (x - e.x) * e.dx + (z - e.z) * e.dz > 0);

/**
 * The town's ground layers in `region` (js/quality.js regions: everything, or one of js/world-stream.js's cells): the
 * streets with their centre lines, the raised sidewalks and curbs, the footways, the rounded corners, the BUS lettering
 * and the crosswalks, the bridges' slabs, parapets and piers; flat-built, laid on the terrain and merged per material.
 * Returns { meshes, colliders (the parapets, flat-world boxes), carveStrips (terrain.js carveRoads: where the drawn
 * terrain sinks under the roads), raised (the sidewalk slabs' polygons, terrain.js addRaisedSidewalk), stats }.
 * `streetSites`: collect the street lamps' sites (mappedStreetSites) along the way (js/street-details.js reads them once).
 */
async function buildGroundLayers(region, { mergeCell = CITY_MERGE_CELL, streetSites = true } = {}) {
  const { roadMat, sidewalkMat, walkMat, curbMat, concreteMat, lawnMat, pavingMat, paintMat, trailMat } = cityMaterials();
  const collector = makeCollector();
  const { collect } = collector;
  const colliders = [], carveStrips = [], raised = [];
  const ringInWorld = (flat) => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < flat.length; i += 2) { minX = Math.min(minX, flat[i]); maxX = Math.max(maxX, flat[i]); minZ = Math.min(minZ, flat[i + 1]); maxZ = Math.max(maxZ, flat[i + 1]); }
    return region.owns((minX + maxX) / 2, (minZ + maxZ) / 2);
  };
  for (const park of TOWN_DATA.parks || []) {
    if (!park.ring || park.ring.length < 6 || !ringInWorld(park.ring)) continue;
    const ring = mappedPoints(park.ring), holes = (park.holes || []).map(mappedPoints);
    const paved = ['square', 'pedestrian', 'plaza'].includes(park.kind);
    // Meadows, woods and lawns are in the orthophoto draped on the terrain (swissimage.js); only plazas are paved over
    if (!paved) continue;
    const geometry = mappedPolygonGeometry(ring, holes, paved ? 0.055 : 0.045);
    if (paved) setPavingStyle(geometry, 2);
    collect(geometry, paved ? pavingMat : lawnMat);
  }

  // Tempelhofer Feld retains the former airport's mapped runway and apron
  // surfaces. These are park ground geometry, not new traffic corridors.
  for (const feature of TOWN_DATA.aeroways || []) {
    if (!ringInWorld(feature.ring || feature.pts || [])) continue;
    if (feature.ring?.length >= 6) {
      collect(mappedPolygonGeometry(mappedPoints(feature.ring), (feature.holes || []).map(mappedPoints), 0.065), roadMat);
    } else if (feature.pts?.length >= 4) {
      const points = mappedPoints(feature.pts);
      const halfWidth = Math.max(2, feature.width || (feature.kind === 'runway' ? 45 : 15)) / 2;
      for (let i = 1; i < points.length; i++) collect(mappedStrip(points[i - 1], points[i], halfWidth, 0.065), roadMat);
    }
  }

  // (the segments the region owns are built; those a little beyond it still clip their sidewalks and curbs, and the
  // joints to them are kept, so that the pieces of neighbouring cells meet without a notch)
  // (with the bus bays, js/bus-bays.js: carriageway pieces of their own beside the streets they widen)
  const allSegments = [...mappedRoadSegments(), ...busBaySegments()];
  const roadSegments = region.all ? allSegments : allSegments.filter(s => region.ownsSegment(s.a.x, s.a.z, s.b.x, s.b.z));
  const nearSegments = region.all ? allSegments : allSegments.filter(s => region.segment(s.a.x, s.a.z, s.b.x, s.b.z, 80));
  // Joints: the consecutive segments of a way (OSM's bends are rounded into arcs, tools/build-davos-geodata.mjs) meet at
  // a miter, so that their strips tile the bend without a notch on the outside or an overlap on the inside, and their
  // markings run on in one dash phase (s0: metres along the way to the segment's start). `a`/`b`: the vector at that
  // end to the point one metre left of the centreline (the plain normal where there is no joint).
  const joints = new Map();
  {
    const miter = (p, q) => {
      const mx = -p.uz - q.uz, mz = p.ux + q.ux, m = Math.hypot(mx, mz);
      if (m < 0.5) return null; // (a hairpin turning more than ~150°: no joint)
      const k = m / (mx * -p.uz + mz * p.ux); // 1 / cos(half the turn)
      return k > 2.5 ? null : { x: mx / m * k, z: mz / m * k };
    };
    const linked = (p, q) => p && p.road === q.road && p.bridge === q.bridge && Math.abs(p.b.x - q.a.x) + Math.abs(p.b.z - q.a.z) < 0.01;
    let prev = null, first = null, s0 = 0;
    const close = () => { // a closed way (a roundabout): its last segment meets its first
      if (first && prev && first !== prev && linked(prev, first)) {
        const m = miter(prev, first);
        if (m) { joints.get(prev).b = m; joints.get(first).a = m; }
      }
    };
    for (const s of nearSegments) {
      const on = linked(prev, s);
      if (!on && prev?.road !== s.road) { close(); first = s; }
      s0 = on ? s0 + prev.len : 0;
      const j = { s0, a: null, b: null };
      joints.set(s, j);
      if (on) { const m = miter(prev, s); if (m) { joints.get(prev).b = m; j.a = m; } }
      prev = s;
    }
    close();
  }
  // The point `offset` metres left of the centreline at the segment's start (`end` 0) or end (1)
  const edgePoint = (s, end, offset) => {
    const v = joints.get(s)?.[end ? 'b' : 'a'], p = end ? s.b : s.a;
    return v ? { x: p.x + v.x * offset, z: p.z + v.z * offset } : { x: p.x - s.uz * offset, z: p.z + s.ux * offset };
  };
  const carriagewayKinds = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
    'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'service', 'living_street']);
  const curbedKinds = new Set(['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
    'tertiary', 'tertiary_link', 'residential', 'unclassified']);
  const isSharedSurface = s => s.road.kind === 'living_street' || (s.road.kind === 'service' && /platz/i.test(s.road.name || ''));
  const isCarriageway = s => carriagewayKinds.has(s.road.kind) && !isSharedSurface(s);
  const carriagewayIndex = new Map();
  const indexCell = 48;
  for (const s of nearSegments) {
    if (!isCarriageway(s)) continue;
    const pad = s.width / 2 + 1;
    for (let x = Math.floor((Math.min(s.a.x, s.b.x) - pad) / indexCell); x <= Math.floor((Math.max(s.a.x, s.b.x) + pad) / indexCell); x++) {
      for (let z = Math.floor((Math.min(s.a.z, s.b.z) - pad) / indexCell); z <= Math.floor((Math.max(s.a.z, s.b.z) + pad) / indexCell); z++) {
        const key = `${x}/${z}`;
        if (!carriagewayIndex.has(key)) carriagewayIndex.set(key, []);
        carriagewayIndex.get(key).push(s);
      }
    }
  }
  const nearbyCarriageways = (a, b, pad = 0) => {
    const found = new Set();
    for (let x = Math.floor((Math.min(a.x, b.x) - pad) / indexCell); x <= Math.floor((Math.max(a.x, b.x) + pad) / indexCell); x++) {
      for (let z = Math.floor((Math.min(a.z, b.z) - pad) / indexCell); z <= Math.floor((Math.max(a.z, b.z) + pad) / indexCell); z++) {
        for (const road of carriagewayIndex.get(`${x}/${z}`) || []) found.add(road);
      }
    }
    return found;
  };
  // Four half-planes of a real carriageway segment, all with inside >= 0.
  const roadPlanes = (s, pad = 0) => {
    const nx = -s.uz, nz = s.ux, along = s.a.x * s.ux + s.a.z * s.uz, across = s.a.x * nx + s.a.z * nz;
    return [[s.ux, s.uz, along - pad], [-s.ux, -s.uz, -along - s.len - pad],
      [nx, nz, across - s.width / 2 - pad], [-nx, -nz, -across - s.width / 2 - pad]];
  };
  // Does (x, z) stand on the asphalt of a carriageway other than `source`'s way (its rectangle grown by `pad`), or
  // on the asphalt of a rounded corner?
  const onOtherCarriageway = (x, z, source, pad = 0) => {
    const p = { x, z };
    for (const o of nearbyCarriageways(p, p, pad)) {
      if (o.road === source.road || o.bridge !== source.bridge) continue;
      if (roadPlanes(o, pad).every(([nx, nz, c]) => nx * x + nz * z - c >= 0)) return true;
    }
    return !source.bridge && inCornerCut(corners, x, z);
  };
  const stripPoints = (s, half, offset = 0) => [
    edgePoint(s, 0, offset - half), edgePoint(s, 1, offset - half), edgePoint(s, 1, offset + half), edgePoint(s, 0, offset + half),
  ];
  const outsideRoads = (polygon, roads, source) => {
    const area = pts => Math.abs(pts.reduce((sum, a, i) => {
      const b = pts[(i + 1) % pts.length]; return sum + a.x * b.z - b.x * a.z;
    }, 0)) * 0.5;
    let fragments = [polygon];
    for (const road of roads) {
      if (road === source || road.bridge !== source.bridge) continue;
      const outside = [];
      const planes = roadPlanes(road, 0.03);
      for (let fragment of fragments) {
        let intersection = fragment;
        for (const [nx, nz, c] of planes) {
          intersection = clipPolygonHalfPlane(intersection, nx, nz, c);
          if (intersection.length < 3) break;
        }
        // An unrelated nearby road's infinite half-planes must not subdivide a
        // path that never enters its finite carriageway rectangle.
        if (intersection.length < 3 || area(intersection) < 0.015) { outside.push(fragment); continue; }
        for (const [nx, nz, c] of planes) {
          const piece = clipPolygonHalfPlane(fragment, -nx, -nz, -c);
          if (piece.length >= 3 && area(piece) > 0.015) outside.push(piece);
          fragment = clipPolygonHalfPlane(fragment, nx, nz, c);
          if (fragment.length < 3) break;
        }
      }
      fragments = outside;
      if (!fragments.length) break;
    }
    return fragments;
  };
  // Clip a curb's centreline out of every other carriageway. Unlike a fixed
  // inset per OSM segment, this opens actual junctions and preserves continuous
  // curb runs along simple bends and arbitrarily split street centre lines.
  const curbIntervals = (a, b, source, roads) => {
    let intervals = [[0, 1]];
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const road of roads) {
      if (road === source || road.bridge !== source.bridge) continue;
      let lo = 0, hi = 1;
      for (const [nx, nz, c] of roadPlanes(road, 0.24)) {
        const start = nx * a.x + nz * a.z - c, rate = nx * dx + nz * dz;
        if (Math.abs(rate) < 1e-9) { if (start < 0) { lo = 1; hi = 0; break; } }
        else if (rate > 0) lo = Math.max(lo, -start / rate);
        else hi = Math.min(hi, -start / rate);
      }
      if (lo >= hi || hi <= 0 || lo >= 1) continue;
      const next = [];
      for (const [start, end] of intervals) {
        if (hi <= start || lo >= end) next.push([start, end]);
        else {
          if (lo > start) next.push([start, Math.min(end, lo)]);
          if (hi < end) next.push([Math.max(start, hi), end]);
        }
      }
      intervals = next;
      if (!intervals.length) break;
    }
    // (and where it rounds a corner: the arc's stones, below, take over)
    if (intervals.length) {
      const pad = 0.3;
      for (const c of cornersIn(corners, Math.min(a.x, b.x) - pad, Math.max(a.x, b.x) + pad, Math.min(a.z, b.z) - pad, Math.max(a.z, b.z) + pad)) {
        let lo = 0, hi = 1;
        for (const [nx, nz, cc] of c.kitePlanes) {
          const start = nx * a.x + nz * a.z - cc, rate = nx * dx + nz * dz;
          if (Math.abs(rate) < 1e-9) { if (start < 0) { lo = 1; hi = 0; break; } }
          else if (rate > 0) lo = Math.max(lo, -start / rate);
          else hi = Math.min(hi, -start / rate);
        }
        if (lo >= hi || hi <= 0 || lo >= 1) continue;
        const next = [];
        for (const [start, end] of intervals) {
          if (hi <= start || lo >= end) next.push([start, end]);
          else {
            if (lo > start) next.push([start, Math.min(end, lo)]);
            if (hi < end) next.push([Math.max(start, hi), end]);
          }
        }
        intervals = next;
        if (!intervals.length) break;
      }
    }
    return intervals;
  };
  let clippedPedestrianPieces = 0, clippedSidewalkPieces = 0, curbRuns = 0, sidewalkSlabs = 0, busMarkings = 0, roundedCorners = 0;
  // Rounded street corners (js/street-corners.js): the curb follows an arc tangent to the two carriageways' edges, the
  // asphalt reaches round to it and the sidewalks end at it
  const corners = streetCorners(TOWN_DATA.roads);
  for (const c of corners.list) {
    if (c.kitePlanes) break; // (cached with the corners)
    c.kitePlanes = convexPlanes(c.kite);
    c.sectorPlanes = convexPlanes(c.sector);
  }
  const polyArea = pts => Math.abs(pts.reduce((sum, a, i) => {
    const b = pts[(i + 1) % pts.length]; return sum + a.x * b.z - b.x * a.z;
  }, 0)) * 0.5;
  // A convex sidewalk piece without the corners it reaches into (kite minus the sector inside the arc), as convex
  // pieces; the lines they were cut along through the sidewalk (from the arc's centre to its ends) are joins, without
  // a curb face
  const roundCorners = (piece) => {
    let parts = [{ poly: piece, joins: [] }];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of piece) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    for (const c of cornersIn(corners, minX, maxX, minZ, maxZ)) {
      const next = [];
      for (const part of parts) {
        let inside = part.poly;
        for (const [nx, nz, cc] of c.kitePlanes) {
          inside = clipPolygonHalfPlane(inside, nx, nz, cc);
          if (inside.length < 3) break;
        }
        if (inside.length < 3 || polyArea(inside) < 0.005) { next.push(part); continue; }
        let fragment = part.poly;
        for (const [nx, nz, cc] of c.kitePlanes) {
          const out = clipPolygonHalfPlane(fragment, -nx, -nz, -cc);
          if (out.length >= 3 && polyArea(out) > 0.005) next.push({ poly: out, joins: part.joins });
          fragment = clipPolygonHalfPlane(fragment, nx, nz, cc);
          if (fragment.length < 3) break;
        }
        for (const [nx, nz, cc] of c.sectorPlanes) {
          inside = clipPolygonHalfPlane(inside, nx, nz, cc);
          if (inside.length < 3) break;
        }
        if (inside.length >= 3 && polyArea(inside) > 0.005) {
          const e1 = { x: (c.T1.x - c.O.x) / c.R, z: (c.T1.z - c.O.z) / c.R }, e2 = { x: (c.T2.x - c.O.x) / c.R, z: (c.T2.z - c.O.z) / c.R };
          next.push({ poly: inside, joins: [...part.joins, [c.O, e1], [c.O, e2]] });
        }
      }
      parts = next;
      if (!parts.length) break;
    }
    return parts;
  };
  // Raised sidewalks (OSM sidewalk=*, roads[].sidewalk; and the sidewalks mapped as ways of their own): a slab of light
  // asphalt SIDEWALK_TOP over the ground (the roadway: 0.11 m, the curbs' top 0.17 m), its edges dropping to the ground
  // in faces of curb stone. `piece`: a convex polygon (flat, [{x, z}]); `joins`: [[point, direction]] lines (the miters
  // to the next piece of the same way) along which no edge face is needed.
  const SIDEWALK_TOP = RAISED_SIDEWALK_TOP, SKIRT_DEPTH = 0.14;
  const sidewalkSlab = (whole, wayJoins = []) => {
    for (const { poly, joins } of roundCorners(whole)) slabPiece(poly, [...wayJoins, ...joins]);
  };
  const slabPiece = (piece, joins) => {
    raised.push(piece); // (where people and the player stand on it: terrain.js addRaisedSidewalk, by the caller)
    collect(mappedPolygonGeometry(piece, [], SIDEWALK_TOP - 0.05), walkMat); // (drapeOverlay lifts it 0.05 m)
    let cx = 0, cz = 0;
    for (const p of piece) { cx += p.x / piece.length; cz += p.z / piece.length; }
    const pos = [], nor = [], uvs = [];
    for (let i = 0; i < piece.length; i++) {
      const p = piece[i], q = piece[(i + 1) % piece.length], L = Math.hypot(q.x - p.x, q.z - p.z);
      if (L < 0.05) continue;
      if (joins.some(([o, v]) => Math.abs((p.x - o.x) * v.z - (p.z - o.z) * v.x) < 0.03 && Math.abs((q.x - o.x) * v.z - (q.z - o.z) * v.x) < 0.03)) continue;
      let nx = (q.z - p.z) / L, nz = -(q.x - p.x) / L;
      if (nx * ((p.x + q.x) / 2 - cx) + nz * ((p.z + q.z) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
      const n = Math.max(1, Math.ceil(L / 4));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const x0 = p.x + (q.x - p.x) * t0, z0 = p.z + (q.z - p.z) * t0, x1 = p.x + (q.x - p.x) * t1, z1 = p.z + (q.z - p.z) * t1;
        const g0 = groundHeight(x0, z0), g1 = groundHeight(x1, z1);
        const A = [x0, g0 + SIDEWALK_TOP, z0], B = [x1, g1 + SIDEWALK_TOP, z1], C = [x1, g1 - SKIRT_DEPTH, z1], D = [x0, g0 - SKIRT_DEPTH, z0];
        // (wound to face out: A D C faces right of p -> q)
        const right = nx * -(q.z - p.z) + nz * (q.x - p.x) > 0;
        for (const v of right ? [A, D, C, A, C, B] : [A, C, D, A, B, C]) { pos.push(...v); nor.push(nx, 0, nz); }
        uvs.push(...(right ? [t0, 1, t0, 0, t1, 0, t0, 1, t1, 0, t1, 1] : [t0, 1, t1, 0, t0, 0, t0, 1, t1, 1, t1, 0]));
      }
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.computeBoundingBox();
      collect(g, curbMat, { world: true });
    }
    sidewalkSlabs++;
  };
  const YELLOW = new THREE.Color(0xe8ad22);
  const paintStrip = (s, offset, halfWidth = 0.075, duty = 0.5, period = 8, col = null) => {
    if (s.len < 0.1) return;
    const g = mappedPolygonGeometry(stripPoints(s, halfWidth, offset), [], s.bridge ? 0.081 : 0.071);
    // (mitered like the asphalt; the dashes run on from the previous segment of the way)
    const p = g.getAttribute('position'), paints = [], sides = [], colors = [], s0 = joints.get(s)?.s0 || 0;
    const centre = [edgePoint(s, 0, offset), edgePoint(s, 1, offset)];
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - s.a.x, dz = p.getZ(i) - s.a.z;
      const along = dx * s.ux + dz * s.uz, c = centre[along > s.len / 2 ? 1 : 0];
      paints.push(s0 + along, period, duty); sides.push(p.getX(i) - c.x, p.getZ(i) - c.z);
      if (col) colors.push(col.r, col.g, col.b); else colors.push(1, 1, 1);
    }
    g.setAttribute('paint', new THREE.Float32BufferAttribute(paints, 3));
    g.setAttribute('side', new THREE.Float32BufferAttribute(sides, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    collect(g, paintMat);
  };
  // The paths and tracks off the bridges: level benches over the slope, with their fill (benchGeometries); where a
  // carriageway lies over them, it is the ground, and its raised sidewalks with it (a bench on the highest ground
  // across it would come up through the slab on a street that leans)
  const underStreet = (x, z, source) => {
    const p = { x, z };
    for (const o of nearbyCarriageways(p, p, 4)) {
      if (o.road === source.road || o.bridge) continue;
      const walks = o.road.sidewalk, pad = walks ? Math.max(walks[0] || 0, walks[1] || 0) + 0.3 : -0.3;
      if (roadPlanes(o, pad).every(([nx, nz, c]) => nx * x + nz * z - c >= 0)) return true;
    }
    return inCornerCut(corners, x, z);
  };
  {
    const builtWays = new Set();
    for (const s of roadSegments) {
      if (!isBenched(s.road) || builtWays.has(s.road)) continue;
      builtWays.add(s.road);
      const p = s.road.pts, probe = { road: s.road, bridge: false };
      const owned = (i) => region.all || region.ownsSegment(p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]);
      const { paved, trail } = benchGeometries(s.road, owned, (x, z) => underStreet(x, z, probe));
      if (paved) collect(paved, pavingMat, { world: true });
      if (trail) collect(trail, trailMat, { world: true });
      if (paved || trail) clippedPedestrianPieces++;
    }
  }
  const bridgeSlabs = [];
  for (const s of roadSegments) {
    if (isBenched(s.road)) continue;
    const width = s.width;
    const y = 0.06;
    const deckContext = collector.deckContext = !!s.road.bridge && Array.isArray(s.road.ys);
    if (!deckContext) carveStrips.push({ a: s.a, b: s.b, half: isCarriageway(s) ? width / 2 - 0.8 : Math.max(0.75, width * 0.5) - 0.3 });
    if (deckContext && s.len > 0.5 && !bridgeSlabs.some(b => b.road === s.road && b.a === s.a)) bridgeSlabs.push(s);
    if (!isCarriageway(s)) {
      const half = Math.max(0.75, width * 0.5);
      const pieces = outsideRoads(stripPoints(s, half), nearbyCarriageways(s.a, s.b, half), s);
      if (s.road.sidewalkWay && !deckContext) {
        // (a sidewalk mapped as a way of its own, footway=sidewalk: raised like the ones along the streets)
        const j = joints.get(s), joins = [];
        if (j?.a) joins.push([s.a, j.a]);
        if (j?.b) joins.push([s.b, j.b]);
        for (const piece of pieces) sidewalkSlab(piece, joins);
        continue;
      }
      for (const piece of pieces) {
        const geometry = mappedPolygonGeometry(piece, [], 0.055);
        setPavingStyle(geometry, s.road.kind === 'cycleway' ? 0 : 2);
        collect(geometry, pavingMat);
        clippedPedestrianPieces++;
      }
      continue;
    }
    // Sidewalks: the ground between the streets is the terrain itself, in the sidewalk material, except on bridges
    if (curbedKinds.has(s.road.kind) && deckContext) {
      const neighbors = nearbyCarriageways(s.a, s.b, width / 2 + 2.8);
      for (const side of [-1, 1]) {
        const shoulder = stripPoints(s, 1.4, side * (width / 2 + 1.4));
        for (const piece of outsideRoads(shoulder, neighbors, s)) {
          collect(mappedPolygonGeometry(piece, [], 0.025), sidewalkMat);
          clippedSidewalkPieces++;
        }
      }
    }
    collect(mappedPolygonGeometry(stripPoints(s, width / 2), [], y), roadMat);
    const nx = -s.uz, nz = s.ux;
    // Sidewalks along the street ([left, right] of the way: offsets -, +), from the curb (width / 2 .. + 0.16 m) out,
    // clipped out of the other carriageways (junctions, driveways)
    if (s.road.sidewalk && !deckContext) {
      const j = joints.get(s), joins = [];
      if (j?.a) joins.push([s.a, j.a]);
      if (j?.b) joins.push([s.b, j.b]);
      s.road.sidewalk.forEach((w, k) => {
        if (!w) return;
        const side = k ? 1 : -1, inner = width / 2 + 0.12;
        const strip = stripPoints(s, w / 2, side * (inner + w / 2));
        for (const piece of outsideRoads(strip, nearbyCarriageways(s.a, s.b, inner + w + 1), s)) sidewalkSlab(piece, joins);
      });
    }
    if (width >= 7 && !s.road.oneway && s.road.kind !== 'service') paintStrip(s, 0, 0.075, 0.45);
    // One-way for cars, both ways for the buses: a dashed centre line, or a solid yellow one along a marked bus lane
    if (s.road.bus === 1) paintStrip(s, 0, 0.075, 0.45);
    if (s.road.bus === 2) paintStrip(s, 0, 0.1, 1, 1, YELLOW);
    if (width >= 12) {
      for (const side of [-1, 1]) paintStrip(s, side * width * 0.24, 0.065, 0.45);
    }
    if (curbedKinds.has(s.road.kind)) for (const side of [-1, 1]) {
      // (from miter to miter: the runs along a rounded bend meet without gaps)
      const offset = side * (width / 2 + 0.08);
      const a = edgePoint(s, 0, offset), b = edgePoint(s, 1, offset), runLength = Math.hypot(b.x - a.x, b.z - a.z);
      for (const [start, end] of curbIntervals(a, b, s, nearbyCarriageways(a, b, 0.5))) {
        const length = runLength * (end - start);
        // (stubs left at a junction are dropped; pieces of a bend's continuous run are kept)
        if (length < (end - start > 0.999 ? 0.3 : 2.5)) continue;
        const mid = (start + end) / 2;
        const geometry = new THREE.BoxGeometry(length, 0.18, 0.16);
        geometry.rotateY(-Math.atan2(s.uz, s.ux));
        geometry.translate(a.x + (b.x - a.x) * mid, 0.08, a.z + (b.z - a.z) * mid);
        collect(geometry, curbMat);
        curbRuns++;
      }
    }
    if (streetSites && s.len >= 12 && s.road.kind !== 'service' && !s.road.bay) {
      const count = Math.max(1, Math.floor(s.len / 34));
      for (let k = 0; k < count; k++) for (const side of [-1, 1]) {
        const t = (k + 0.5) / count, x = s.a.x + s.ux * s.len * t + nx * side * (width / 2 + 1.3),
          z = s.a.z + s.uz * s.len * t + nz * side * (width / 2 + 1.3);
        // (never on another carriageway: at a junction the crossing road's asphalt, or the rounded corner's, reaches
        // past this road's pavement; the mast stands 0.6 m clear of any curb)
        if (onOtherCarriageway(x, z, s, 0.6)) continue;
        if (beyondStreetLamps(s.road, x, z)) continue;
        const key = `${Math.round(x / 14)}/${Math.round(z / 14)}`;
        if (streetSiteKeys.has(key)) continue;
        streetSiteKeys.add(key);
        mappedStreetSites.push({ x, z, nx: -nx * side, nz: -nz * side, ux: s.ux, uz: s.uz, name: s.road.name || '', road: s.road });
      }
    }
  }
  collector.deckContext = false;
  await buildPause();
  // The rounded corners' asphalt (between the two edges and the arc) and the curb stones along the arc (as along the
  // straight curbs: 0.16 m wide, its road side on the arc)
  for (const c of corners.list) {
    if (!region.owns(c.O.x, c.O.z)) continue;
    collect(mappedPolygonGeometry(c.fillet, [], 0.06), roadMat);
    const r = c.R - 0.08, steps = 8;
    for (let k = 0; k < steps; k++) {
      const p0 = c.a0 + (c.a1 - c.a0) * (k / steps), p1 = c.a0 + (c.a1 - c.a0) * ((k + 1) / steps);
      const x0 = c.O.x + Math.cos(p0) * r, z0 = c.O.z + Math.sin(p0) * r, x1 = c.O.x + Math.cos(p1) * r, z1 = c.O.z + Math.sin(p1) * r;
      const geometry = new THREE.BoxGeometry(Math.hypot(x1 - x0, z1 - z0) + 0.02, 0.18, 0.16);
      geometry.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      geometry.translate((x0 + x1) / 2, 0.08, (z0 + z1) / 2);
      collect(geometry, curbMat);
    }
    roundedCorners++;
  }
  // "BUS" in yellow down the marked bus lanes (roads[].bus 2: bus:lanes:backward=designated), reading the buses' way,
  // every ~70 m along straight stretches of the way clear of its ends (the junctions)
  {
    // Strokes of the letters in a unit box (x: across, left to right as read; y: along, the bottom nearest the reader)
    const sw = 0.24, sh = 0.12;
    const GLYPHS = {
      B: [[0, 0, sw, 1], [0, 0, 0.78, sh], [0, 0.5 - sh / 2, 0.78, 0.5 + sh / 2], [0, 1 - sh, 0.78, 1], [1 - sw, sh * 0.6, 1, 0.5 - sh * 0.3], [1 - sw, 0.5 + sh * 0.3, 1, 1 - sh * 0.6]],
      U: [[0, sh, sw, 1], [1 - sw, sh, 1, 1], [sw * 0.4, 0, 1 - sw * 0.4, sh]],
      S: [[sw * 0.4, 1 - sh, 1, 1], [0, 0.5, sw, 1 - sh * 0.4], [sw * 0.4, 0.5 - sh / 2, 1 - sw * 0.4, 0.5 + sh / 2], [1 - sw, sh * 0.4, 1, 0.5], [0, 0, 1 - sw * 0.4, sh]],
    };
    const LETTER_L = 2.6, LETTER_W = 1.0, GAP = 0.7, WORD = 3 * LETTER_L + 2 * GAP;
    for (const road of TOWN_DATA.roads) {
      if (road.bus !== 2 || road.bridge || road.tunnel) continue;
      const pts = mappedPoints(road.pts), cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      const total = cum[cum.length - 1];
      const at = (d) => {
        let i = 1;
        while (i < pts.length - 1 && cum[i] < d) i++;
        const L = cum[i] - cum[i - 1] || 1e-6, t = (d - cum[i - 1]) / L;
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t, ux: (pts[i].x - pts[i - 1].x) / L, uz: (pts[i].z - pts[i - 1].z) / L };
      };
      // the bus lane: left of the way (oneway=yes; the buses drive against it), its centre half way to the curb
      const busSide = road.reverse ? 1 : -1, lane = busSide * road.width / 4;
      for (let d = 14 + WORD / 2; d <= total - 14 - WORD / 2; d += 70) {
        const p = at(d), p0 = at(d - WORD / 2), p1 = at(d + WORD / 2);
        if (!region.owns(p.x, p.z)) continue;
        if (p0.ux * p1.ux + p0.uz * p1.uz < 0.985) continue; // (a bend: no lettering)
        // f: the buses' heading; r: their right
        const fx = road.reverse ? p.ux : -p.ux, fz = road.reverse ? p.uz : -p.uz, rx = -fz, rz = fx;
        const cx = p.x - p.uz * lane, cz = p.z + p.ux * lane;
        // (the whole word clear of the other carriageways: junctions, driveways)
        const probes = [-WORD / 2 - 1, 0, WORD / 2 + 1].map((v) => [cx + fx * v, cz + fz * v]);
        if ([...nearbyCarriageways(p0, p1, 4)].some((o) => o.road !== road && probes.some(([x, z]) => roadPlanes(o, 1.5).every(([nx, nz, c]) => nx * x + nz * z - c >= 0)))) continue;
        ['B', 'U', 'S'].forEach((ch, k) => {
          const y0 = -WORD / 2 + k * (LETTER_L + GAP);
          for (const [a0, b0, a1, b1] of GLYPHS[ch]) {
            const P = (a, b) => { const u = (a - 0.5) * LETTER_W, v = y0 + b * LETTER_L; return { x: cx + rx * u + fx * v, z: cz + rz * u + fz * v }; };
            const quad = [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)];
            const g = mappedPolygonGeometry(quad, [], 0.071);
            const mx = (quad[0].x + quad[2].x) / 2, mz = (quad[0].z + quad[2].z) / 2, pp = g.getAttribute('position');
            const paints = [], sides = [], colors = [];
            for (let i = 0; i < pp.count; i++) { paints.push(0, 1, 1); sides.push(pp.getX(i) - mx, pp.getZ(i) - mz); colors.push(YELLOW.r, YELLOW.g, YELLOW.b); }
            g.setAttribute('paint', new THREE.Float32BufferAttribute(paints, 3));
            g.setAttribute('side', new THREE.Float32BufferAttribute(sides, 2));
            g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            collect(g, paintMat);
          }
        });
        busMarkings++;
      }
    }
  }
  // Fussgängerstreifen: the marked crossings mapped in OSM (js/crosswalks-data.js, tools/build-crosswalks.mjs), yellow
  // as everywhere in Switzerland: bars 0.5 m wide with 0.5 m gaps across the carriageway, 4 m long along it
  let crosswalkBars = 0;
  {
    const CW = new THREE.Color(0xf6bf10);
    for (const c of CROSSWALKS) {
      if (!region.owns(c.x, c.z)) continue;
      const rx = -c.uz, rz = c.ux, n = Math.max(2, Math.floor(c.w - 0.1));
      for (let k = 0; k < n; k++) {
        const o = k - (n - 1) / 2, x = c.x + rx * o, z = c.z + rz * o;
        const quad = [[-0.25, -2], [0.25, -2], [0.25, 2], [-0.25, 2]].map(([a, b]) => ({ x: x + rx * a + c.ux * b, z: z + rz * a + c.uz * b }));
        const g = mappedPolygonGeometry(quad, [], 0.072), pp = g.getAttribute('position');
        const paints = [], sides = [], colors = [];
        for (let i = 0; i < pp.count; i++) {
          const across = (pp.getX(i) - x) * rx + (pp.getZ(i) - z) * rz;
          paints.push(0, 1, 1); sides.push(rx * across, rz * across); colors.push(CW.r, CW.g, CW.b);
        }
        g.setAttribute('paint', new THREE.Float32BufferAttribute(paints, 3));
        g.setAttribute('side', new THREE.Float32BufferAttribute(sides, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        collect(g, paintMat);
        crosswalkBars++;
      }
    }
  }
  // Bridge structures under the decks: a slab, parapets and, where the gap allows, piers down to the ground. OSM maps a
  // wide bridge as side by side ways (the Quaibrücke: footways, cycle lanes, carriageways, tram tracks): their slabs
  // join into one deck, and the parapets (solid for the player) stand only along its outer edges.
  let bridgePiers = 0, bridgeParapets = 0;
  const PARAPET = 0.3, PARAPET_STEP = 1.5;
  for (const s of bridgeSlabs) {
    const half = deckHalfWidth(s.road);
    const deckMat = /^(primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/.test(s.road.kind) ? concreteMat : curbMat;
    const nx = -s.uz, nz = s.ux;
    const deckAt = (x, z) => { const d = deckHeight(x, z); return d === d ? d : groundHeight(x, z); };
    const pieces = Math.max(1, Math.ceil(s.len / 6));
    for (let k = 0; k < pieces; k++) {
      const t0 = k / pieces, t1 = (k + 1) / pieces;
      const a = { x: s.a.x + (s.b.x - s.a.x) * t0, z: s.a.z + (s.b.z - s.a.z) * t0 }, b = { x: s.a.x + (s.b.x - s.a.x) * t1, z: s.a.z + (s.b.z - s.a.z) * t1 };
      const ya = deckAt(a.x, a.z), yb = deckAt(b.x, b.z);
      // (a low piece: a short bridge over a creek, whose channel the 8 m terrain grid smooths away, or a bridgehead — the
      // parapets only, no slab or pier sunk in the ground)
      const low = Math.min(ya - groundHeight(a.x, a.z), yb - groundHeight(b.x, b.z)) < 0.8;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      // A box along [u0, u1] of the piece (fractions), `w` across at `offset`, from `bottom` to `top` around the deck
      const box = (w, top, bottom, offset, u0 = 0, u1 = 1) => {
        const l = len * (u1 - u0), cx = a.x + (b.x - a.x) * (u0 + u1) / 2 + nx * offset, cz = a.z + (b.z - a.z) * (u0 + u1) / 2 + nz * offset;
        const g = new THREE.BoxGeometry(l + 0.04, 1, w);
        g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
        g.translate(cx, 0.5, cz);
        const p = g.attributes.position;
        for (let v = 0; v < p.count; v++) {
          const t = Math.max(0, Math.min(1, ((p.getX(v) - a.x) * (b.x - a.x) + (p.getZ(v) - a.z) * (b.z - a.z)) / (len * len)));
          const deck = ya + (yb - ya) * t;
          p.setY(v, deck + (p.getY(v) > 0.5 ? top : bottom));
        }
        g.computeVertexNormals();
        collect(g, deckMat, { world: true });
        return { cx, cz, l };
      };
      if (!low) box(half * 2, -0.02, -1.15, 0);
      // Parapets: along the stretches where no other deck continues the bridge beyond this one's edge
      const steps = Math.max(1, Math.round(len / PARAPET_STEP));
      for (const side of [-1, 1]) {
        const offset = side * (half - PARAPET / 2);
        const edge = (i) => {
          const t = (i + 0.5) / steps, x = a.x + (b.x - a.x) * t + nx * side * (half + 0.5), z = a.z + (b.z - a.z) * t + nz * side * (half + 0.5);
          const other = deckHeight(x, z);
          return !(other === other && Math.abs(other - (ya + (yb - ya) * t)) < 1.5);
        };
        for (let i = 0; i < steps;) {
          if (!edge(i)) { i++; continue; }
          let j = i + 1;
          while (j < steps && edge(j)) j++;
          const u0 = i / steps, u1 = j / steps, { cx, cz, l } = box(PARAPET, 1.05, -0.02, offset, u0, u1);
          const y0 = ya + (yb - ya) * u0, y1 = ya + (yb - ya) * u1;
          const hx = l / 2, hz = PARAPET / 2, cs = s.ux, sn = -s.uz;
          const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
          colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: Math.min(y0, y1),
            minY: Math.min(y0, y1) - 1.15, maxY: Math.max(y0, y1) + 1.05, obb: { cx, cz, hx, hz, cs, sn } });
          bridgeParapets++;
          i = j;
        }
      }
      // A pier every ~24 m along spans that clear 3 m, off the streets passing underneath
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, under = groundHeight(mid.x, mid.z), top = (ya + yb) / 2 - 1.15;
      if (!low && top - under > 3 && Math.floor(s.len * t0 / 24) !== Math.floor(s.len * t1 / 24) && pierClear(mid.x, mid.z, s.ux, s.uz, half)) {
        const pier = new THREE.BoxGeometry(1.2, top - under + 0.5, half * 1.2);
        pier.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
        pier.translate(mid.x, under - 0.5 + (top - under + 0.5) / 2, mid.z);
        collect(pier, deckMat, { world: true });
        bridgePiers++;
      }
    }
  }
  // The road underpasses (tools/underpass.mjs): the lid over the trench, flush with the yard, the walls along the road
  // inside (and a few metres out along the ramps, hiding the sides of the cut), a railing over each mouth.
  collector.deckContext = false;
  for (const u of TOWN_DATA.underpasses || []) {
    if (!region.owns(u.ax + u.ux * u.len / 2, u.az + u.uz * u.len / 2)) continue;
    const nx = -u.uz, nz = u.ux, angle = -Math.atan2(u.uz, u.ux), floor = Math.min(groundHeight(u.ax, u.az), groundHeight(u.ax + u.ux * u.len, u.az + u.uz * u.len));
    // A box from s0 to s1 along the road, from v0 to v1 across it, from y0 to y1
    const box = (s0, s1, v0, v1, y0, y1, solid = false) => {
      const g = new THREE.BoxGeometry(s1 - s0, y1 - y0, v1 - v0);
      const s = (s0 + s1) / 2, v = (v0 + v1) / 2, cx = u.ax + u.ux * s + nx * v, cz = u.az + u.uz * s + nz * v;
      g.rotateY(angle);
      g.translate(cx, (y0 + y1) / 2, cz);
      collect(g, curbMat, { world: true });
      if (!solid) return;
      const hx = (s1 - s0) / 2, hz = (v1 - v0) / 2, cs = u.ux, sn = -u.uz;
      const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
      colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } });
    };
    box(0, u.len, -u.left, u.right, u.y - 0.5, u.y - 0.02);
    const wall = u.half + 0.6, WING = 6, THICK = 0.4;
    for (const side of [-1, 1]) {
      const v0 = side < 0 ? -wall - THICK : wall, v1 = v0 + THICK;
      box(-WING, u.len + WING, v0, v1, floor - 0.5, u.y - 0.4, true);
    }
    for (const s of [0, u.len]) box(s - 0.15, s + 0.15, -wall - THICK, wall + THICK, u.y - 0.02, u.y + 1.05, true);
  }
  // The abutments of the road bridges over a street (js/terrain.js OVERPASSES, which lays the street's corridor under the
  // deck at its level): a concrete block each side, from the verge out over the grid cell the terrain was lowered in,
  // from below the street up to the deck's underside, a little longer than the deck is wide.
  for (const o of OVERPASSES) {
    if (!region.owns(o.x, o.z)) continue;
    const nx = -o.uz, nz = o.ux, angle = -Math.atan2(o.uz, o.ux), S = o.along + 2, DEPTH = 9;
    for (const side of [-1, 1]) {
      const v0 = side < 0 ? -o.wall - DEPTH : o.wall, v1 = v0 + DEPTH, y0 = o.roadY - 0.5, y1 = o.deckY - 1.15;
      const g = new THREE.BoxGeometry(2 * S, y1 - y0, DEPTH);
      const v = (v0 + v1) / 2, cx = o.x + nx * v, cz = o.z + nz * v;
      g.rotateY(angle);
      g.translate(cx, (y0 + y1) / 2, cz);
      collect(g, concreteMat, { world: true });
      const hx = S, hz = DEPTH / 2, cs = o.ux, sn = -o.uz;
      const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
      colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } });
    }
  }
  const meshes = await mergeCollections(collector, { mergeCell });
  return { meshes, colliders, carveStrips, raised, stats: { roads: roadSegments.length, bridgeSegments: bridgeSlabs.length, bridgePiers, bridgeParapets,
    clippedPedestrianPieces, clippedSidewalkPieces, curbRuns, sidewalkSlabs, busMarkings, crosswalkBars, roundedCorners } };
}

// The boxes along the given closed rings, pieces of <= 4 m, tops on the bank and feet under the water line
function quayWalls(rings) {
  const box = new THREE.BoxGeometry(1, 1, 0.38), bp = box.attributes.position.array, buv = box.attributes.uv.array, bi = box.index.array;
  const verts = bp.length / 3;
  let total = 0;
  for (const edge of rings) for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len >= 0.4) total += Math.ceil(len / 4);
  }
  if (!total) return null;
  const position = new Float32Array(total * bp.length), uv = new Float32Array(total * buv.length);
  const index = new Uint32Array(total * bi.length);
  let n = 0;
  for (const edge of rings) for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.4) continue;
    const pieces = Math.ceil(len / 4), width = len / pieces + 0.05;
    const c = (b.x - a.x) / len, s = (b.z - a.z) / len;
    for (let k = 0; k < pieces; k++, n++) {
      const cx = a.x + (b.x - a.x) * (k + 0.5) / pieces, cz = a.z + (b.z - a.z) * (k + 0.5) / pieces;
      for (let v = 0; v < verts; v++) {
        const lx = bp[v * 3] * width, lz = bp[v * 3 + 2], o = (n * verts + v) * 3;
        const x = cx + lx * c - lz * s, z = cz + lx * s + lz * c;
        position[o] = x; position[o + 2] = z;
        position[o + 1] = bp[v * 3 + 1] > 0 ? groundHeight(x, z) + 0.19 : waterSurfaceHeight(x, z) - 0.6;
        uv[(n * verts + v) * 2] = buv[v * 2]; uv[(n * verts + v) * 2 + 1] = buv[v * 2 + 1];
      }
      for (let t = 0; t < bi.length; t++) index[n * bi.length + t] = n * verts + bi[t];
    }
  }
  box.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals(); // (each face has its own corners: the box's flat faces as before)
  return g;
}

// The water's vertices tell its material whether it is still (js/season.js freezeWater): every water geometry has them
function withWaterStill(g, still) {
  g.setAttribute('waterStill', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(still), 1));
  return g;
}
// The apron round a natural bank's pond (js/terrain.js apronTriangles), with the water's attributes
function apronGeometry(flat) {
  const g = new THREE.BufferGeometry(), n = flat.length / 3;
  const normal = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { normal[i * 3 + 1] = 1; uv[i * 2] = flat[i * 3]; uv[i * 2 + 1] = -flat[i * 3 + 2]; }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flat), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// The stones at the natural banks' waterline: low, flattened lumps of the curbs' granite, one geometry
function stoneGeometry(stones) {
  if (!stones.length) return null;
  const lump = new THREE.IcosahedronGeometry(1, 0).toNonIndexed(), lp = lump.attributes.position.array;
  const position = new Float32Array(stones.length * lp.length), uv = new Float32Array(stones.length * lp.length / 3 * 2);
  stones.forEach((s, k) => {
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    for (let v = 0; v < lp.length; v += 3) {
      const lx = lp[v] * s.r * 1.3, ly = lp[v + 1] * s.r * 0.55, lz = lp[v + 2] * s.r, o = k * lp.length + v;
      position[o] = s.x + lx * c - lz * sn; position[o + 1] = s.y + ly; position[o + 2] = s.z + lx * sn + lz * c;
    }
  });
  lump.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

async function buildMappedCityGrid(scene) {
  const group = new THREE.Group();
  group.name = 'TownGround';
  const { sidewalkMat, curbMat, waterMat } = cityMaterials();
  const footprints = [], sidewalks = [], colliders = [];
  parkTreeSites = []; mappedStreetSites = []; streetSiteKeys.clear();

  // The ground is the terrain model itself (swissALTI3D), carved a few metres under the rivers and the lake so that
  // their surfaces (the lowest ground around, see terrain.js) show over a dark bed. The water is built for the whole
  // valley on either profile (the lake, the ponds and the mapped river beds: a few thousand triangles).
  const waterCollector = makeCollector();
  const banked = []; // the water bodies with a natural bank: { w, bank } (their beds, below)
  {
    const { collect } = waterCollector;
    const water = (TOWN_DATA.water || []).filter(w => w.ring?.length >= 6);
    const stones = [];
    for (const feature of water) {
      const ring = mappedPoints(feature.ring), holes = (feature.holes || []).map(mappedPoints);
      const still = stillWater(feature) ? 1 : 0;
      // A pond or small lake that the survey holds level, its banks rising all round (the Seehof Seeli, the mountain
      // tarns): flat at its surveyed level, a short apron under the bank and a few stones at the waterline, no quay wall
      const bank = naturalBank(feature, groundHeight);
      if (bank) {
        banked.push({ w: feature, bank });
        const y = bank.level + BANK.lift;
        collect(withWaterStill(mappedPolygonGeometry(ring, holes, y), still), waterMat, { world: true });
        collect(withWaterStill(apronGeometry(apronTriangles(feature, bank)), still), waterMat, { world: true });
        stones.push(...bankStones(feature, bank, groundHeight));
        continue;
      }
      // The lake is level; the Limmat and the Sihl fall a few metres across the city and follow their surface
      let lo = Infinity, hi = -Infinity;
      for (const p of ring) { const h = waterSurfaceHeight(p.x, p.z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      collect(withWaterStill(hi - lo < 0.4 ? mappedPolygonGeometry(ring, holes, lo + 0.04)
        : drapeOverlay(mappedPolygonGeometry(ring, holes, 0), { surface: 'water', maxEdge: 12, lift: 0.04 }), still), waterMat, { world: true });
      // Quay walls: from below the water line up to the bank, every <= 4 m so that both ends follow the terrain
      // (one geometry per shore, not one per piece: thousands of BoxGeometries would be garbage a moment later)
      collect(quayWalls([ring, ...holes]), curbMat, { world: true });
    }
    collect(stoneGeometry(stones), curbMat, { world: true });
  }
  group.add(...await mergeCollections(waterCollector));
  // The streets and the rest of the ground layers: the whole valley at once on the desktop profile; on the mobile
  // profile (js/quality.js worldRadius) js/world-stream.js builds them 500 m cell by cell around the player, and
  // removes them again behind it, so this builds none here
  let layers = null;
  if (QUALITY.worldRadius <= 0) {
    layers = await buildGroundLayers(REGION_ALL);
    group.add(...layers.meshes);
    colliders.push(...layers.colliders);
    carveRoads(layers.carveStrips);
    for (const piece of layers.raised) addRaisedSidewalk(piece);
  }
  // The trees of the national map (js/tlm-trees-data.js): every swissTLM3D single tree, sized by the BAFU habitat map's
  // surveyed height where it has one, its species from the leaf type, and the BAFU shrubs as small bushes. Davos is
  // spruce country: outside the town ~70 % spruce and ~30 % larch, broadleaves only where the map says deciduous (and
  // above ~1600 m even then mostly larch); in town a fifth to a quarter mountain maple and birch, the rest spruce with
  // some larch. Nothing stands on a road, in the water or inside a building.
  await buildPause();
  const tlmHash = (x, z, seed) => { const v = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453; return v - Math.floor(v); };
  const TREE_HEIGHT = SPECIES_HEIGHT; // trees.js species' natural heights at scale 1
  // Swiss stone pine (Arve) among the conifers from ~1800 m a.s.l., most of them near the treeline (~2100 m)
  const arveShare = (x, z) => { const a = groundHeight(x, z) + FRAME.H0; return Math.max(0, Math.min(1, (a - 1800) / 300)) * 0.75; };
  const conifer = (x, z, r, larch = 0.2) => (r < arveShare(x, z) ? TREE.arve : tlmHash(x, z, 21) < 1 - larch ? TREE.spruce : TREE.larch);
  // Broadleaves: mountain maple and silver birch
  const broadleaf = (x, z) => (tlmHash(x, z, 12) < 0.55 ? TREE.maple : TREE.birch);
  // The golf course's fairways, greens, tees and bunkers (js/golf-data.js) are kept clear too: the swissTLM3D single
  // trees on their edges stand where the OSM outlines run a little wide
  const playAreas = (GOLF?.areas || []).filter((a) => a.kind !== 'rough').map((a) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < a.ring.length; i += 2) { x0 = Math.min(x0, a.ring[i]); x1 = Math.max(x1, a.ring[i]); z0 = Math.min(z0, a.ring[i + 1]); z1 = Math.max(z1, a.ring[i + 1]); }
    return { ring: a.ring, x0, x1, z0, z1 };
  });
  // (even-odd over a flat [x, z, x, z, …] ring)
  const onPlayArea = (x, z) => playAreas.some(({ ring, x0, x1, z0, z1 }) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && inRing(ring, x, z));
  // The funiculars' (js/bergbahnen-data.js) cuttings through the forest: nothing within FUNICULAR_CLEAR of the track
  // (the cars are ~3 m wide, and the passing loop is two tracks side by side)
  const FUNICULAR_CLEAR = 5, funicularCells = new Map();
  for (const line of BERGBAHNEN?.funiculars || []) for (const path of line.paths || []) {
    for (let i = 3; i < path.length; i += 3) {
      const ax = path[i - 3], az = path[i - 1], bx = path[i], bz = path[i + 2];
      for (const [cx, cz] of [[ax, az], [bx, bz]]) {
        const key = Math.floor(cx / 20) * 100000 + Math.floor(cz / 20); // (numbers: no string a lookup, 240,000 lookups)
        if (!funicularCells.has(key)) funicularCells.set(key, []);
        funicularCells.get(key).push([ax, az, bx, bz]);
      }
    }
  }
  const onFunicular = (x, z) => {
    const gx = Math.floor(x / 20), gz = Math.floor(z / 20);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = funicularCells.get((gx + dx) * 100000 + gz + dz);
      if (list) for (const [ax, az, bx, bz] of list) {
        const ux = bx - ax, uz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz || 1)));
        if (Math.hypot(x - ax - ux * t, z - az - uz * t) < FUNICULAR_CLEAR) return true;
      }
    }
    return false;
  };
  // The groomed ski runs (js/ski-pistes-data.js): nothing on the run, across its whole width and PISTE_CLEAR m past
  // either edge (a crown's spread), nor inside the mapped piste areas. The swissTLM3D woods' outlines run across many
  // runs, so the Davos Vertical, say, went down through the spruces. (The freeride Skirouten keep their trees.)
  const PISTE_CLEAR = 3, PISTE_CELL = 32, pisteCells = new Map();
  const pisteCell = (key, entry) => { let list = pisteCells.get(key); if (!list) pisteCells.set(key, list = []); list.push(entry); };
  for (const run of SKI_PISTES?.runs || []) {
    if (!run.groomed) continue;
    const half = run.w / 2 + PISTE_CLEAR, pts = run.pts;
    for (let i = 2; i < pts.length; i += 2) {
      const seg = [pts[i - 2], pts[i - 1], pts[i], pts[i + 1], half];
      // (every cell the segment's padded bounds touch: the runs' points lie up to ~600 m apart)
      const gx0 = Math.floor((Math.min(seg[0], seg[2]) - half) / PISTE_CELL), gx1 = Math.floor((Math.max(seg[0], seg[2]) + half) / PISTE_CELL);
      const gz0 = Math.floor((Math.min(seg[1], seg[3]) - half) / PISTE_CELL), gz1 = Math.floor((Math.max(seg[1], seg[3]) + half) / PISTE_CELL);
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) pisteCell(gx * 100000 + gz, seg);
    }
  }
  for (const area of SKI_PISTES?.areas || []) {
    if (!area.groomed) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < area.ring.length; i += 2) { x0 = Math.min(x0, area.ring[i]); x1 = Math.max(x1, area.ring[i]); z0 = Math.min(z0, area.ring[i + 1]); z1 = Math.max(z1, area.ring[i + 1]); }
    for (let gx = Math.floor(x0 / PISTE_CELL); gx <= Math.floor(x1 / PISTE_CELL); gx++) for (let gz = Math.floor(z0 / PISTE_CELL); gz <= Math.floor(z1 / PISTE_CELL); gz++) pisteCell(gx * 100000 + gz, area);
  }
  const onPiste = (x, z) => {
    const list = pisteCells.get(Math.floor(x / PISTE_CELL) * 100000 + Math.floor(z / PISTE_CELL));
    if (list) for (const p of list) {
      if (p.ring) {
        if (inRing(p.ring, x, z) && !(p.holes || []).some((h) => inRing(h, x, z))) return true;
        continue;
      }
      const [ax, az, bx, bz, half] = p, ux = bx - ax, uz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz || 1)));
      if ((x - ax - ux * t) ** 2 + (z - az - uz * t) ** 2 < half * half) return true;
    }
    return false;
  };
  // The minigolf at the Hotel Waldhuus (js/missions-data-sport.js MINIGOLF_PATH: x 388–424, z −182…−165) stands on
  // open meadow: no tree or shrub on its lanes, nor within 4 m round them
  const onMinigolf = (x, z) => x > 384 && x < 428 && z > -186 && z < -161;
  // The three aisles cut through the forest between the stacked hairpins of the Schatzalp's sled run (the Fondue Night's
  // shortcuts, js/missions-data-fondue.js SHORTCUTS; tests/missions-fondue.test.mjs keeps the two in step): no tree
  // within SLED_AISLE m of their lines, the mission plants its own young spruces in them
  const SLED_AISLE = 6;
  const onSledAisle = (x, z) => SLED_AISLES.some(([ax, az, bx, bz]) => {
    if (x < Math.min(ax, bx) - SLED_AISLE || x > Math.max(ax, bx) + SLED_AISLE || z < Math.min(az, bz) - SLED_AISLE || z > Math.max(az, bz) + SLED_AISLE) return false;
    const ux = bx - ax, uz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz)));
    return Math.hypot(x - ax - ux * t, z - az - uz * t) < SLED_AISLE;
  });
  const clearSite = (x, z, margin) => {
    if (waterAt(x, z) || onPlayArea(x, z) || onMinigolf(x, z) || onFunicular(x, z) || onPiste(x, z) || onSledAisle(x, z)) return false;
    // (nearestRoads allocates its answer: asked only where some road comes that close at all)
    if (roadCloserThan(x, z, 12, margin) && nearestRoads(x, z, 12).some(q => q.dist < q.road.w / 2 + margin)) return false;
    const block = blockAt(x, z);
    return !block || block.park || block.sidewalk;
  };
  const inTown = (x, z) => groundHeight(x, z) < 130 && roadCloserThan(x, z, 30, Infinity);
  const pickTreeSpecies = (x, z, evergreen) => {
    const r = tlmHash(x, z, 11), broad = broadleaf(x, z), r2 = tlmHash(x, z, 22);
    if (inTown(x, z)) {
      if (evergreen === 1) return conifer(x, z, r2, 0.1);
      return r < (evergreen === 0 ? 0.5 : 0.2) ? broad : conifer(x, z, r2, evergreen === 0 ? 0.6 : 0.2);
    }
    // (evergreen on the map: spruce, a few larches; deciduous: larch above ~1600 m, else larch and broadleaves)
    if (evergreen === 1) return conifer(x, z, r2, 0.12);
    if (evergreen === 0) return r < (groundHeight(x, z) + FRAME.H0 > 1600 ? 0.1 : 0.5) ? broad : (r2 < arveShare(x, z) ? TREE.arve : TREE.larch);
    return conifer(x, z, r2, 0.3);
  };
  let tlmSingle = 0, tlmShrubs = 0;
  for (const [x, z, height, evergreen] of TLM_TREES?.trees || []) {
    if (!plantedAt(x, z) || !clearSite(x, z, 0.8)) continue;
    const species = pickTreeSpecies(x, z, evergreen), r = tlmHash(x, z, 13);
    const scale = height > 0 ? Math.max(0.2, Math.min(1.7, height / TREE_HEIGHT[species])) : 0.6 + r * 0.5;
    parkTreeSites.push({ x, z, y: 0.09, scale, species, yaw: r * Math.PI * 2 });
    tlmSingle++;
  }
  for (const [x, z, height, evergreen] of TLM_TREES?.shrubs || []) {
    if (!clearSite(x, z, 0.4)) continue;
    // (evergreen scrub: a young conifer; else the multi-stemmed shrub)
    const species = evergreen ? conifer(x, z, tlmHash(x, z, 23), 0) : TREE.shrub, r = tlmHash(x, z, 14);
    const scale = evergreen ? Math.max(0.08, Math.min(0.35, (height || 2.5) / TREE_HEIGHT[species])) : Math.max(0.5, Math.min(1.4, (height || 2.5) / TREE_HEIGHT[species]));
    parkTreeSites.push({ x, z, y: 0.09, scale, species, yaw: r * Math.PI * 2, tier: 1 });
    tlmShrubs++;
  }
  for (const tree of TOWN_DATA.trees || []) {
    if (onMinigolf(tree.x, tree.z)) continue;
    const h = Math.abs(Math.sin(tree.x * 1.9 + tree.z * 8.1));
    parkTreeSites.push({ x: tree.x, z: tree.z, y: 0.09, scale: tree.h ? Math.max(0.45, Math.min(1.8, tree.h / 13)) : 0.66 + h * 0.62,
      species: inTown(tree.x, tree.z) && h < 0.22 ? broadleaf(tree.x, tree.z) : conifer(tree.x, tree.z, h, 0.25), yaw: h * Math.PI * 2 });
  }
  // OSM often maps a wooded area without mapping each individual tree. Fill
  // those patches procedurally, preserving mapped trees and clear paths.
  const mappedTreeCount = parkTreeSites.length;
  const treeCells = new Map();
  const indexTree = tree => {
    const key = Math.floor(tree.x / 8) * 100000 + Math.floor(tree.z / 8); // (numbers: no string a lookup)
    if (!treeCells.has(key)) treeCells.set(key, []);
    treeCells.get(key).push(tree);
  };
  parkTreeSites.forEach(indexTree);
  const nearbyTree = (x, z, radius = 7) => {
    const ix = Math.floor(x / 8), iz = Math.floor(z / 8);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = treeCells.get((ix + dx) * 100000 + iz + dz);
      if (list) for (const t of list) if (Math.hypot(t.x - x, t.z - z) < radius) return true;
    }
    return false;
  };
  // Photo-referenced trees and undergrowth around Berghain use the original
  // tree geometry, instancing and LOD. Keep mapped trees in preference to extras.
  for (const tree of BERGHAIN_TREE_SITES) {
    if (nearbyTree(tree.x, tree.z, tree.isShrub ? 1.25 : 5)) continue;
    parkTreeSites.push(tree); indexTree(tree);
  }
  const landmarkTrees = parkTreeSites.length - mappedTreeCount;
  const hash = (x, z, seed) => { const n = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453; return n - Math.floor(n); };
  // The swissTLM3D wooded areas, filled on a jittered grid (scanline, even-odd over the outer ring and its clearings):
  // Wald densely, Wald offen sparsely, Gehölz (groves) densely, Gebüschwald with low scrub. They replace the OSM woods.
  const WOODS = { forest: { step: 13, scale: [0.7, 1.2] }, open: { step: 24, scale: [0.6, 1.1] }, woody: { step: 11, scale: [0.6, 1.1] }, scrub: { step: 15, scale: [0.18, 0.4] } };
  let tlmWoodland = 0;
  for (const area of TLM_TREES?.areas || []) {
    const spec = WOODS[area.kind];
    if (!spec) continue;
    const rings = area.rings;
    let z0 = Infinity, z1 = -Infinity;
    for (let i = 1; i < rings[0].length; i += 2) { z0 = Math.min(z0, rings[0][i]); z1 = Math.max(z1, rings[0][i]); }
    for (let gz = Math.ceil(z0 / spec.step); gz <= Math.floor(z1 / spec.step); gz++) {
      const zc = gz * spec.step, xs = [];
      for (const ring of rings) for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const ax = ring[j], az = ring[j + 1], bx = ring[i], bz = ring[i + 1];
        if ((az > zc) !== (bz > zc)) xs.push(ax + ((zc - az) * (bx - ax)) / (bz - az));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let gx = Math.ceil(xs[k] / spec.step); gx * spec.step <= xs[k + 1]; gx++) {
        const x = gx * spec.step + (hash(gx, gz, 1) - 0.5) * spec.step * 0.7, z = zc + (hash(gx, gz, 2) - 0.5) * spec.step * 0.7;
        if (!plantedAt(x, z) || nearbyTree(x, z, spec.step * 0.45) || !clearSite(x, z, 2)) continue;
        // spruce ~70 % and larch ~30 % below the stone-pine belt; scrub half shrubs (green alder), half young conifers
        const h = hash(gx, gz, 3), sp = conifer(x, z, hash(gx, gz, 6), 0.28), shrub = area.kind === 'scrub' && h < 0.5;
        const scale = shrub ? 0.6 + h * 0.8 : spec.scale[0] + h * (spec.scale[1] - spec.scale[0]);
        const tree = { x, z, y: 0.09, scale, species: shrub ? TREE.shrub : sp, yaw: h * Math.PI * 2 };
        parkTreeSites.push(tree); indexTree(tree); tlmWoodland++;
      }
    }
  }
  for (const park of TOWN_DATA.parks || []) {
    if (TLM_TREES?.areas?.length) break; // (the swisstopo woods replace the OSM ones)
    if (!['wood', 'forest'].includes(park.kind) && park.name !== 'Viktoriapark') continue;
    const ring = mappedPoints(park.ring), holes = (park.holes || []).map(mappedPoints), bounds = mappedBounds(ring);
    for (let gx = Math.ceil(bounds.minX / 14); gx <= Math.floor(bounds.maxX / 14); gx++) {
      for (let gz = Math.ceil(bounds.minZ / 14); gz <= Math.floor(bounds.maxZ / 14); gz++) {
        const x = gx * 14 + (hash(gx, gz, 1) - 0.5) * 10, z = gz * 14 + (hash(gx, gz, 2) - 0.5) * 10;
        if (!pointInPoly(ring, x, z) || holes.some(h => pointInPoly(h, x, z)) || nearbyTree(x, z) || waterAt(x, z)) continue;
        if (LANDMARK_EXCLUSIONS.some(b => x > b.minX - 4 && x < b.maxX + 4 && z > b.minZ - 4 && z < b.maxZ + 4)) continue;
        if (nearestRoads(x, z, 20).some(q => q.dist < q.road.w / 2 + 3)) continue;
        const block = blockAt(x, z); if (block && !block.park && !block.sidewalk) continue;
        // Davos's woods: spruce, with larch scattered through them, stone pines towards the treeline
        const h = hash(gx, gz, 3), tree = { x, z, y: 0.09, scale: 0.7 + h * 0.5, species: conifer(x, z, hash(gx, gz, 6), 0.18), yaw: h * Math.PI * 2 };
        parkTreeSites.push(tree); indexTree(tree);
      }
    }
  }
  await buildPause();
  // (under the water 2.5 m down; under a natural bank's pond its shelving bed, js/terrain.js)
  const bedOf = (x, z) => {
    for (const { w, bank } of banked) {
      const b = bank.box;
      if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && inWaterBody(w, x, z)) return bedCut(w, bank, x, z, groundHeight(x, z));
    }
    return 2.5;
  };
  const terrainMeshes = buildTerrainMeshes(sidewalkMat, { carve: (x, z) => (waterAt(x, z) ? bedOf(x, z) : 0) });
  for (const mesh of terrainMeshes) {
    if (group.children[0]) mesh.userData.sharesPipelineWith = group.children[0];
    group.add(mesh);
  }
  const st = layers?.stats || {};
  group.userData = { terrain: 'absolute', city: TOWN_DATA.meta.city, source: 'OpenStreetMap, swisstopo swissALTI3D', ...st, mappedTrees: mappedTreeCount, tlmSingle, tlmShrubs, tlmWoodland, landmarkTrees, proceduralWoodlandTrees: parkTreeSites.length - mappedTreeCount - landmarkTrees,
    junctionClippedCurbs: true, junctionClippedSidewalks: true };
  if (layers) console.info(`[sidewalks] ${st.sidewalkSlabs} raised sidewalk pieces, ${st.busMarkings} BUS markings, ${st.crosswalkBars} crosswalk bars, ${st.roundedCorners} rounded corners`);
  // (the mobile profile plants a share of the woods, trees.js: the other sites, ~70 bytes each of 240,000, go now)
  let kept = 0;
  for (const t of parkTreeSites) if (plantedTree(t)) parkTreeSites[kept++] = t;
  parkTreeSites.length = kept;
  scene.add(group);
  return { group, sidewalks, footprints, highwayLanes: [], colliders, terrainMeshes };
}

/**
 * Sutherland-Hodgman clip of polygon [{x, z}] to the half-plane nx * x + nz * z >= c.
 */
function clipPolygonHalfPlane(pts, nx, nz, c) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const da = nx * a.x + nz * a.z - c;
    const db = nx * b.x + nz * b.z - c;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

function setPavingStyle(geo, style) {
  const uvAttr = geo.attributes.uv;
  for (let i = 0; i < uvAttr.count; i++) uvAttr.setXY(i, style, 0);
  uvAttr.needsUpdate = true;
  return geo;
}

function buildCityGrid(scene) {
  return buildMappedCityGrid(scene);
}

export {
  buildCityGrid,
  buildGroundLayers,
  cityMaterials,
  parkTreeSites,
  mappedStreetSites
};
