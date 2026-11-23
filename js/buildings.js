import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFireEscapes } from './fire-escapes.js';
import {
  Fn,
  float,
  vec2,
  color,
  uv,
  positionWorld,
  normalWorldGeometry,
  abs,
  fract,
  step,
  smoothstep,
  fwidth,
  max,
  min,
  mix,
  length,
  mx_noise_float,
  mx_worley_noise_float
} from 'three/tsl';
import {
  ISLAND_BOUNDS,
  BERLIN_DATA,
  districtAt
} from './city-config.js';
import {
  createPreWarBuildingMaterial,
  createCurtainWallMaterial,
  createFacadeBoxes,
  createBillboardMaterial,
  filteredPulse,
  WALL_KINDS
} from './tsl-materials.js';
import { berlinPoints, berlinBounds, berlinPolygonGeometry, nearestBerlinRoad, berlinSpatialGroups, berlinGeometryGroups } from './berlin-geometry.js';
import { LANDMARK_EXCLUSIONS, LANDMARK_SOURCE_EXCLUSIONS } from './landmarks.js';
import { UNSURVEYED_BUILDINGS } from './unsurveyed-buildings-data.js';
import { surfaceHeight } from './terrain.js';
import { QUALITY } from './quality.js';

// js/buildings.js
// The buildings of the mapped town from their OpenStreetMap footprints: wall colliders and floor plans for all of them,
// facades and roofs for those the streamed swissBUILDINGS3D volumes lack, and the street-level details (cornices,
// awnings, rooftop units) streamed around the player through a spatial quadtree.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Spatial 2D quadtree for range queries around the active player/camera position.
 */
class Quadtree {
  constructor(bounds, capacity = 6, maxDepth = 6, depth = 0) {
    this.bounds = bounds; // { minX, maxX, minZ, maxZ }
    this.capacity = capacity;
    this.maxDepth = maxDepth;
    this.depth = depth;
    this.items = [];
    this.divided = false;
    this.nw = null;
    this.ne = null;
    this.sw = null;
    this.se = null;
  }

  containsPoint(x, z) {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  intersectsCircle(cx, cz, radius) {
    const b = this.bounds;
    const closestX = Math.max(b.minX, Math.min(cx, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(cz, b.maxZ));
    const dx = cx - closestX;
    const dz = cz - closestZ;
    return (dx * dx + dz * dz) <= (radius * radius);
  }

  subdivide() {
    const b = this.bounds;
    const midX = (b.minX + b.maxX) * 0.5;
    const midZ = (b.minZ + b.maxZ) * 0.5;
    const nextDepth = this.depth + 1;

    this.nw = new Quadtree({ minX: b.minX, maxX: midX, minZ: b.minZ, maxZ: midZ }, this.capacity, this.maxDepth, nextDepth);
    this.ne = new Quadtree({ minX: midX, maxX: b.maxX, minZ: b.minZ, maxZ: midZ }, this.capacity, this.maxDepth, nextDepth);
    this.sw = new Quadtree({ minX: b.minX, maxX: midX, minZ: midZ, maxZ: b.maxZ }, this.capacity, this.maxDepth, nextDepth);
    this.se = new Quadtree({ minX: midX, maxX: b.maxX, minZ: midZ, maxZ: b.maxZ }, this.capacity, this.maxDepth, nextDepth);
    this.divided = true;

    for (const item of this.items) {
      this._insertIntoChildren(item);
    }
    this.items.length = 0;
  }

  _insertIntoChildren(item) {
    if (this.nw.containsPoint(item.cx, item.cz)) return this.nw.insert(item);
    if (this.ne.containsPoint(item.cx, item.cz)) return this.ne.insert(item);
    if (this.sw.containsPoint(item.cx, item.cz)) return this.sw.insert(item);
    if (this.se.containsPoint(item.cx, item.cz)) return this.se.insert(item);
    return false;
  }

  insert(item) {
    if (!this.containsPoint(item.cx, item.cz)) return false;

    if (!this.divided) {
      if (this.items.length < this.capacity || this.depth >= this.maxDepth) {
        this.items.push(item);
        return true;
      }
      this.subdivide();
    }
    return this._insertIntoChildren(item);
  }

  queryRange(cx, cz, radius, found = []) {
    if (!this.intersectsCircle(cx, cz, radius)) return found;

    const rSq = radius * radius;
    if (!this.divided) {
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        const dx = item.cx - cx;
        const dz = item.cz - cz;
        if (dx * dx + dz * dz <= rSq) {
          found.push(item);
        }
      }
      return found;
    }

    this.nw.queryRange(cx, cz, radius, found);
    this.ne.queryRange(cx, cz, radius, found);
    this.sw.queryRange(cx, cz, radius, found);
    this.se.queryRange(cx, cz, radius, found);
    return found;
  }
}

// Buildings whose swissBUILDINGS3D volume is incomplete: they keep their facades and roof extruded from the
// OpenStreetMap footprint even when the streamed volumes stand in for all the others (`bag`). (The Bahnhof Davos Platz,
// w712452961, which swisstopo has only as its roofs, is rebuilt by hand now: js/landmark-buildings.js; its footprint
// here keeps only its colliders.)
// Likewise the buildings swisstopo does not have at all (js/unsurveyed-buildings-data.js: built after the 2014 survey)
export const NEWER_THAN_SWISSBUILDINGS = new Set(UNSURVEYED_BUILDINGS);

// `bag`: 3D BAG meshes already supply the facades and roofs, so only colliders and street-level details are built here
// (but for NEWER_THAN_SWISSBUILDINGS).
function buildCityBlocks(scene, { bag = false } = {}) {
  const group = new THREE.Group();
  group.name = BERLIN_DATA ? 'BerlinMitteCityBlocks' : 'ManhattanCityBlocks';
  const colliders = [];
  // The floor plans of the buildings with walls at the ground (for js/controllers.js: the wall colliders say nothing
  // about the inside, so a teleport into a building would be walled in): { bounds, maxY, ring, holes }
  const interiors = [];

  // Re-seeded from each building's id, so every building is reproducible on its own
  let rand = mulberry32(10019);

  // The spatial quadtree of the buildings' street-level details
  const quadtree = new Quadtree({
    minX: ISLAND_BOUNDS.minX - 50,
    maxX: ISLAND_BOUNDS.maxX + 50,
    minZ: ISLAND_BOUNDS.minZ - 50,
    maxZ: ISLAND_BOUNDS.maxZ + 50
  }, 6, 9);
  const allBlocks = [];

  const facades = [
    // 0: Pre-War Limestone & Buff Brick (5th Ave / Madison Ave / Upper East Side style)
    [createPreWarBuildingMaterial, {
      stoneColor: 0xd8cdb8,
      trimColor: 0x9e937f,
      windowGlassColor: 0x1a2836,
      windowWidth: 2.6,
      floorHeight: 3.7,
      litProbability: 0.54,
      warmth: 0.80,
      seed: 12.4
    }],
    // 1: Historic Warm Red/Terracotta Brick (Garment District / Chelsea / SoHo / Upper West Side)
    [createPreWarBuildingMaterial, {
      stoneColor: BERLIN_DATA ? 0xc8b49b : 0xa45a45,
      trimColor: BERLIN_DATA ? 0xe4dac5 : 0xcab9a0,
      windowGlassColor: 0x16222e,
      windowWidth: 2.4,
      floorHeight: 3.5,
      litProbability: 0.56,
      warmth: 0.86,
      seed: 27.8
    }],
    // 2: Classic NYC Brownstone & Dark Masonry (Cross-street rowhouses, Village & Harlem)
    [createPreWarBuildingMaterial, {
      stoneColor: BERLIN_DATA ? 0xb1b4a1 : 0x765443,
      trimColor: BERLIN_DATA ? 0xd7d9c9 : 0x503a2e,
      windowGlassColor: 0x151e26,
      windowWidth: 2.2,
      floorHeight: 3.4,
      litProbability: 0.60,
      warmth: 0.90,
      seed: 41.2
    }],
    // 3: Blue-Teal Curtain-Wall Glass (Park Ave / 6th Ave / Financial District modernism)
    [createCurtainWallMaterial, {
      glassTint: 0x1a3a52,
      frameTint: 0x3b4c5b,
      windowWidth: 2.7,
      floorHeight: 3.9,
      litProbability: 0.60,
      warmth: 0.52,
      reflectivity: 0.92,
      seed: 63.5
    }],
    // 4: Dark Bronze / Charcoal Miesian Glass (Avenue of the Americas / Midtown West)
    [createCurtainWallMaterial, {
      glassTint: 0x242220,
      frameTint: 0x3c3631,
      windowWidth: 2.5,
      floorHeight: 3.8,
      litProbability: 0.64,
      warmth: 0.72,
      reflectivity: 0.88,
      seed: 81.9
    }],
    // 5: Silver / Ice-Blue Contemporary Supertall Glass (Billionaires' Row / Hudson Yards / WTC)
    [createCurtainWallMaterial, {
      glassTint: 0x264664,
      frameTint: 0xb0bcc8,
      windowWidth: 2.9,
      floorHeight: 4.1,
      litProbability: 0.58,
      warmth: 0.48,
      reflectivity: 0.95,
      seed: 94.3
    }]
  ];
  const materials = facades.map(([create, opts]) => create({ ...opts, boxLocal: true }));

  const buckets = materials.map(() => []);
  const broadwayBillboards = [];

  if (BERLIN_DATA) {
    // Exact OSM rings drive the original facade shaders and detail-streaming
    // pools. Thin, oriented facade boxes preserve courtyard openings and the
    // angled street walls of Mitte without Manhattan's synthetic block layouts.
    const roofBuckets = [[], [], []];
    // (on a phone the few roofs left here, of the buildings swisstopo lacks, in one tone and in cells of 3 km: the three
    // tones in 750 m cells were 367 meshes of a few triangles each, 60 draws a frame and three pipelines)
    const fewRoofs = bag && QUALITY.mobile;
    const roofMaterials = [0x655c51, 0x857369, 0x676b68].map(c => {
      const m = new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.9 });
      m.colorNode = color(c).mul(mx_noise_float(positionWorld.xz.mul(0.9)).mul(0.12).add(0.94));
      return m;
    });
    const signedArea = pts => pts.reduce((sum, a, i) => {
      const b = pts[(i + 1) % pts.length]; return sum + a.x * b.z - b.x * a.z;
    }, 0) / 2;
    let built = 0;
    for (const source of BERLIN_DATA.buildings || []) {
      if ((LANDMARK_SOURCE_EXCLUSIONS.has(source.id) || LANDMARK_SOURCE_EXCLUSIONS.has(source.osmId))) continue;
      if (!source.ring || source.ring.length < 6) continue;
      const poly = berlinPoints(source.ring), holes = (source.holes || []).map(berlinPoints);
      const bounds = berlinBounds(poly);
      const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
      if (cx < ISLAND_BOUNDS.minX - 100 || cx > ISLAND_BOUNDS.maxX + 100 || cz < ISLAND_BOUNDS.minZ - 100 || cz > ISLAND_BOUNDS.maxZ + 100) continue;
      if (LANDMARK_EXCLUSIONS.some(r => cx > r.minX && cx < r.maxX && cz > r.minZ && cz < r.maxZ)) continue;
      if (Math.abs(signedArea(poly)) < 7) continue;
      const base = Math.max(0, source.minHeight || 0);
      // (the buildings swisstopo lacks and OSM gives no height: OSM's default of 9 m made a tower of every shed; by their
      // floor area instead: a shed or garage, a small house, a house)
      const plan = Math.abs(signedArea(poly));
      const guessed = bag && UNSURVEYED_BUILDINGS.has(source.id) && source.heightSource === 'default' ? (plan < 40 ? 3 : plan < 120 ? 6 : 9) : 0;
      const height = Math.max(base + 0.15, guessed || source.h || (source.levels || 6) * 3.4);
      const roofHeight = Math.max(0, Math.min(source.roofHeight || 0, height * 0.4));
      // (the streamed volumes lack this one: it is drawn from its footprint)
      const drawn = !bag || NEWER_THAN_SWISSBUILDINGS.has(source.id);
      const pitched = roofHeight > 0.6 && poly.length === 4 && !holes.length && ['gabled', 'hipped', 'half-hipped', 'pyramidal'].includes(source.roofShape);
      const eave = pitched ? Math.max(base + 0.5, height - roofHeight) : height;
      const seed = (source.styleSeed || source.id).split('').reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 701);
      rand = mulberry32(seed);
      const tone = rand();
      const updated = source.accuracyArea === 'mitte' || source.accuracyArea === 'ringbahn';
      const colourName = source.colour?.trim().toLowerCase();
      const facadeColour = updated && colourName && (/^#[0-9a-f]{6}$/.test(colourName) || THREE.Color.NAMES[colourName] !== undefined) ? new THREE.Color(colourName) : null;
      const warmMasonry = facadeColour && facadeColour.r > facadeColour.b * 1.4;
      const modern = !warmMasonry && ['office', 'commercial', 'hotel', 'retail'].includes(source.kind) && (height > 30 || tone > 0.72);
      const matIndex = modern ? 3 + Math.floor(rand() * 3) : Math.floor(rand() * 3);
      const detail = { id: source.id, name: source.name, cx, cz, ...bounds, district: districtAt(cx, cz), maxH: height,
        cornices: [], waterTowers: [], hvacUnits: [], fireEscapes: [], awnings: [], scaffoldSheds: [], yards: [],
        footprints: [{ x0: bounds.minX, x1: bounds.maxX, z0: bounds.minZ, z1: bounds.maxZ, h: height, tone, pts: poly, holes }],
        sourceHeight: source.h, sourceHeightKind: source.heightSource };
      if (base < 1) interiors.push({ minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ, maxY: height, ring: poly, holes, id: source.id });
      for (const [ringIndex, ring] of [poly, ...holes].entries()) {
        const direction = Math.sign(signedArea(ring)) || 1;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
          if (length < 0.3) continue;
          const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
          const ry = -Math.atan2(dz, dx), thickness = 0.44;
          // The footprint's clockwise exterior is to the right of its edge;
          // courtyard normals point into the hole instead.
          const normalSign = ringIndex ? -direction : direction;
          const nx = dz / length * normalSign, nz = -dx / length * normalSign;
          const road = !updated && ringIndex === 0 && length > 6 && base < 0.5 ? nearestBerlinRoad(x + nx * 3, z + nz * 3, 35) : null;
          const shop = !updated && road && road.distance < road.width / 2 + 13 && !['church', 'cathedral', 'school', 'university', 'civic'].includes(source.kind);
          const face = ringIndex ? WALL_KINDS.rear : shop ? WALL_KINDS.shop : WALL_KINDS.entry;
          if (drawn) buckets[matIndex].push({ x, y: base + (eave - base) / 2 + 0.02, z, w: length + 0.06, h: eave - base, d: thickness,
            ry, tone, facadeColour, facadeLevels: source.facadeLevels, faces: [WALL_KINDS.blankStone, WALL_KINDS.blankStone, face, face] });
          if (base < 1) {
            const hx = length / 2, hz = thickness / 2, cs = Math.cos(ry), sn = Math.sin(ry);
            const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
            colliders.push({ minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez, maxY: height,
              obb: { cx: x, cz: z, hx, hz, cs, sn } });
          }
          if (drawn && !modern && height > 7 && length > 1.5) {
            detail.cornices.push({ x, z, y: eave, w: length + 0.2, h: 0.44, d: 0.85, ry });
            if (height > 13) detail.cornices.push({ x, z, y: 4.4, w: length + 0.12, h: 0.22, d: 0.62, ry });
          }
          if (shop && length > 9 && rand() < 0.48) {
            const count = Math.min(3, Math.floor(length / 8));
            for (let j = 0; j < count; j++) {
              const t = (j + 0.5) / count;
              // The upstream awning is long along local Z, unlike facade boxes.
              detail.awnings.push({ x: a.x + dx * t + nx * 0.8, z: a.z + dz * t + nz * 0.8, y: 3.8,
                w: 1.65, d: Math.min(6.4, length / count - 1.0), dir: -1, colorIdx: Math.floor(rand() * 5), ry: Math.atan2(nx, nz) + Math.PI / 2 });
            }
          }
        }
      }
      let roof = !drawn ? null : berlinPolygonGeometry(poly, holes, eave + 0.035);
      if (pitched && drawn) {
        // Hipped/gabled roof on a mapped quadrilateral, preserving every eave
        // corner; no guessed Manhattan towers or rooftop water tanks.
        const ordered = signedArea(poly) < 0 ? [...poly].reverse() : poly;
        const edges = ordered.map((a, i) => Math.hypot(ordered[(i + 1) % 4].x - a.x, ordered[(i + 1) % 4].z - a.z));
        const start = edges.indexOf(Math.max(...edges)), p = Array.from({ length: 4 }, (_, i) => ordered[(start + i) % 4]);
        const inset = source.roofShape === 'gabled' ? 0 : 0.18;
        const left = { x: (p[0].x + p[3].x) / 2, z: (p[0].z + p[3].z) / 2 };
        const right = { x: (p[1].x + p[2].x) / 2, z: (p[1].z + p[2].z) / 2 };
        const v = p.map(q => [q.x, eave + 0.03, q.z]);
        v.push([left.x + (right.x - left.x) * inset, height + 0.03, left.z + (right.z - left.z) * inset]);
        v.push([right.x + (left.x - right.x) * inset, height + 0.03, right.z + (left.z - right.z) * inset]);
        const indices = [0, 4, 5, 0, 5, 1, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2];
        const positions = [], uvs = [];
        for (const index of indices) { positions.push(...v[index]); uvs.push(v[index][0], v[index][2]); }
        roof.dispose(); roof = new THREE.BufferGeometry();
        roof.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        roof.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); roof.computeVertexNormals();
      }
      if (roof) {
        // Into world heights here (the roof meshes are 'absolute'): placeOnTerrain would take the merged flat roofs for
        // a ground overlay and drape them onto the terrain. The walls are lifted by the ground at their middles, so
        // the roof by the mean of the ground along the outline.
        roof.translate(0, poly.reduce((sum, q) => sum + surfaceHeight(q.x, q.z), 0) / poly.length, 0);
        roofBuckets[fewRoofs ? 0 : Math.floor(tone * 3)].push(roof);
      }
      if (drawn && !pitched && !holes.length && !source.part && height > 12 && rand() < 0.34) {
        detail.hvacUnits.push({ x: cx, z: cz, y: height, w: 2.2, h: 0.85, d: 3.0, ry: 0 });
      }
      quadtree.insert(detail); allBlocks.push(detail); built++;
    }
    for (let materialIndex = 0; materialIndex < roofBuckets.length; materialIndex++) {
      let firstMesh;
      for (const cell of berlinGeometryGroups(roofBuckets[materialIndex], fewRoofs ? 3000 : undefined)) for (let i = 0; i < cell.length; i += 250) {
        const pieces = cell.slice(i, i + 250).map(g => {
          if (!g.index) return g;
          const expanded = g.toNonIndexed(); g.dispose(); return expanded;
        });
        const mesh = new THREE.Mesh(mergeGeometries(pieces, false), roofMaterials[materialIndex]);
        mesh.userData.terrain = 'absolute'; // (lifted above)
        mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
        if (firstMesh) mesh.userData.sharesPipelineWith = firstMesh;
        else firstMesh = mesh;
        pieces.forEach(g => g.dispose());
      }
    }
    group.userData = { city: 'Berlin', buildings: built, originalFacadeShaders: true, originalDetailStreaming: true };
  }
  // ============================================================================
  // C. STATIC ISLAND-WIDE ARCHITECTURAL MASSING (6 TSL Facade Materials)
  // ============================================================================
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();

  buckets.forEach((items, matIdx) => {
    if (items.length === 0) return;
    let firstMesh;
    for (const cell of BERLIN_DATA ? berlinSpatialGroups(items) : [items]) {
      const inst = createFacadeBoxes(materials[matIdx], cell);
      inst.castShadow = true;
      inst.receiveShadow = true;
      if (firstMesh) inst.userData.sharesPipelineWith = firstMesh;
      else firstMesh = inst;
      group.add(inst);
    }
  });

  // Billboards: one merged mesh per poster theme
  {
    const byVariant = new Map();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const bb of broadwayBillboards) {
      const g = new THREE.PlaneGeometry(bb.w, bb.h);
      g.applyMatrix4(m.compose(new THREE.Vector3(bb.x, bb.y, bb.z), q.setFromAxisAngle(up, bb.rotY), new THREE.Vector3(1, 1, 1)));
      if (!byVariant.has(bb.variant)) byVariant.set(bb.variant, []);
      byVariant.get(bb.variant).push(g);
    }
    for (const [variant, geos] of byVariant) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), createBillboardMaterial(variant));
      mesh.name = `TimesSquareBillboards_${variant}`;
      group.add(mesh);
      for (const g of geos) g.dispose();
    }
  }

  // Rear yards, light courts & project lawns: one thin slab per patch just above the sidewalk (buildings standing on
  // it hide the rest). Lawn, paving and tree canopies come from world-space noise; detail finer than a pixel fades
  // to its average so the gardens don't shimmer from the air
  const yardMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.94, metalness: 0.0 });
  yardMat.colorNode = Fn(() => {
    const p = positionWorld.xz;
    const px = length(fwidth(p)); // metres per pixel
    const fine = smoothstep(0.9, 0.12, px);
    const crownLOD = smoothstep(8.0, 3.0, px); // crowns a few pixels wide or more are drawn, smaller ones averaged
    const grain = mx_noise_float(p.mul(1.9)).mul(fine).mul(0.5).add(0.5);
    const clump = mx_noise_float(p.mul(0.7).add(5.3)).mul(smoothstep(2.0, 0.4, px)).mul(0.5).add(0.5);

    // Lawns with grey / beige patios & light-court paving
    const patch = mx_noise_float(p.mul(0.21)).mul(smoothstep(12.0, 4.0, px));
    const lawn = mix(color(0x5d7a3a), color(0x7a944c), grain);
    const paving = mix(color(0x8c8679), color(0xa59e90), grain);
    const ground = mix(lawn, paving, smoothstep(0.15, 0.45, patch));

    // Street-tree-sized (~12 m) & small (~6 m) crowns, domed: sunlit crowns, softer & darker towards their rims
    const w1 = mx_worley_noise_float(p.mul(0.085));
    const w2 = mx_worley_noise_float(p.mul(0.16).add(17.0));
    const crowns = max(smoothstep(0.55, 0.3, w1), smoothstep(0.45, 0.25, w2).mul(0.85));
    const rim = smoothstep(0.0, 1.0, min(w1.div(0.55), w2.div(0.45)));
    const leaves = mix(color(0x3f5e2a), color(0x5e7f3b), clump.mul(0.6).add(grain.mul(0.4))).mul(mix(float(1.08), float(0.78), rim));
    const leavesMean = mix(color(0x3f5e2a), color(0x5e7f3b), 0.5).mul(0.93);
    return mix(ground, mix(leavesMean, leaves, crownLOD), mix(float(0.5), crowns, crownLOD));
  })();
  const yardRects = [];
  for (const blk of allBlocks) yardRects.push(...blk.yards);
  if (yardRects.length) {
    const yardInst = new THREE.InstancedMesh(unitBox, yardMat, yardRects.length);
    yardRects.forEach((r, i) => {
      dummy.position.set((r.x0 + r.x1) * 0.5, 0.225, (r.z0 + r.z1) * 0.5);
      dummy.rotation.set(0, r.ry || 0, 0);
      dummy.scale.set(r.x1 - r.x0, 0.05, r.z1 - r.z0);
      dummy.updateMatrix();
      yardInst.setMatrixAt(i, dummy.matrix);
    });
    dummy.rotation.set(0, 0, 0);
    yardInst.receiveShadow = true;
    group.add(yardInst);
  }

  // ============================================================================
  // D. QUADTREE-STREAMED HIGH-DETAIL ARCHITECTURAL POOLS (LOD0 around player)
  // ============================================================================
  const MAX_CORNICES = 7000;
  const MAX_WATER_TOWERS = 1400;
  const MAX_HVAC = 1600;
  const MAX_AWNINGS = 1800;
  const MAX_SHEDS = 300;

  // 1. Projecting horizontal stone cornices & parapet ledges
  const corniceMat = new THREE.MeshStandardNodeMaterial({ color: 0xc8bca6, roughness: 0.78, metalness: 0.08 });
  const corniceInst = new THREE.InstancedMesh(unitBox, corniceMat, MAX_CORNICES);
  corniceInst.castShadow = true;
  corniceInst.receiveShadow = true;
  corniceInst.frustumCulled = false;
  group.add(corniceInst);

  // 2. 3-part rooftop cedar water towers with steel hoop bands & open 4-leg steel trestle
  const woodMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.78 });
  woodMat.colorNode = Fn(() => {
    const u = uv();
    // Preserve the average width of seams and hoops when they become smaller than a pixel.
    const staveCoord = u.x.mul(28.0);
    const staveSeam = filteredPulse(fract(staveCoord), 0.46, 0.54, fwidth(staveCoord));
    const staveTone = mix(color(0x8e6343), color(0x5c3e26), staveSeam.mul(0.55));
    const bandCoord = u.y.mul(5.0);
    const isHoop = filteredPulse(fract(bandCoord), 0.42, 0.58, fwidth(bandCoord));
    return mix(staveTone, color(0x1f2328), isHoop);
  })();
  const roofCapMat = new THREE.MeshStandardNodeMaterial({ color: 0x3b4045, roughness: 0.65, metalness: 0.3 });
  const legMat = new THREE.MeshStandardNodeMaterial({ color: 0x262b30, roughness: 0.45, metalness: 0.68 });
  const barrelGeo = new THREE.CylinderGeometry(1.65, 1.75, 3.6, 12);
  const coneGeo = new THREE.ConeGeometry(1.9, 1.5, 12);

  // Open 4-leg structural steel trestle with cross-bracing and top chime deck
  const trestleParts = [];
  const legPostGeo = new THREE.BoxGeometry(0.24, 2.75, 0.24);
  const legPositions = [
    [-1.05, 0, -1.05],
    [1.05, 0, -1.05],
    [-1.05, 0, 1.05],
    [1.05, 0, 1.05],
  ];
  for (const [lx, ly, lz] of legPositions) {
    const g = legPostGeo.clone();
    g.rotateZ(lx > 0 ? 0.08 : -0.08);
    g.rotateX(lz > 0 ? -0.08 : 0.08);
    g.translate(lx, ly, lz);
    trestleParts.push(g);
  }
  const deckRingGeo = new THREE.CylinderGeometry(1.88, 1.88, 0.22, 12);
  deckRingGeo.translate(0, 1.22, 0);
  trestleParts.push(deckRingGeo);
  const braceX1 = new THREE.BoxGeometry(2.15, 0.14, 0.14);
  braceX1.translate(0, 0.2, -1.02);
  trestleParts.push(braceX1);
  const braceX2 = new THREE.BoxGeometry(2.15, 0.14, 0.14);
  braceX2.translate(0, 0.2, 1.02);
  trestleParts.push(braceX2);
  const braceZ1 = new THREE.BoxGeometry(0.14, 0.14, 2.15);
  braceZ1.translate(-1.02, -0.45, 0);
  trestleParts.push(braceZ1);
  const braceZ2 = new THREE.BoxGeometry(0.14, 0.14, 2.15);
  braceZ2.translate(1.02, -0.45, 0);
  trestleParts.push(braceZ2);
  const riserPipe = new THREE.CylinderGeometry(0.24, 0.24, 2.6, 8);
  trestleParts.push(riserPipe);
  const legsGeo = mergeGeometries(trestleParts, false);

  const barrelInst = new THREE.InstancedMesh(barrelGeo, woodMat, MAX_WATER_TOWERS);
  const coneInst = new THREE.InstancedMesh(coneGeo, roofCapMat, MAX_WATER_TOWERS);
  const legsInst = new THREE.InstancedMesh(legsGeo, legMat, MAX_WATER_TOWERS);
  barrelInst.castShadow = barrelInst.receiveShadow = true;
  coneInst.castShadow = coneInst.receiveShadow = true;
  legsInst.castShadow = legsInst.receiveShadow = true;
  barrelInst.frustumCulled = coneInst.frustumCulled = legsInst.frustumCulled = false;
  group.add(legsInst, barrelInst, coneInst);

  // 3. Rooftop mechanical penthouses & HVAC chillers with top exhaust fans & side louvers
  const hvacMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.52, metalness: 0.45 });
  hvacMat.colorNode = Fn(() => {
    const u = uv();
    const isTop = step(0.7, normalWorldGeometry.y);
    const fan1 = length(u.sub(vec2(0.3, 0.5)));
    const fan2 = length(u.sub(vec2(0.7, 0.5)));
    const fanDist = min(fan1, fan2);
    const inFanWell = smoothstep(0.19, 0.17, fanDist);
    // Average subpixel slats and fan rings instead of letting them shimmer at a distance.
    const fanCoord = fanDist.mul(16.0);
    const fanRing = filteredPulse(fract(fanCoord), 0.4835, 0.5165, fwidth(fanCoord)).mul(inFanWell);
    const topCol = mix(color(0x889098), color(0x1b2026), inFanWell.mul(0.82).sub(fanRing.mul(0.45)));

    const inLouverBox = step(0.12, u.x).mul(step(u.x, 0.88)).mul(step(0.18, u.y)).mul(step(u.y, 0.82));
    const slatCoord = u.y.mul(14.0);
    const louverSlat = filteredPulse(fract(slatCoord), 0.45, 1.0, fwidth(slatCoord)).mul(inLouverBox);
    const panelSeam = smoothstep(0.03, 0.0, abs(fract(u.x.mul(3.0)).sub(0.5)));
    const sideCol = mix(color(0x7c848c), color(0x282e36), max(louverSlat.mul(0.72), panelSeam.mul(0.35)));
    return mix(sideCol, topCol, isTop);
  })();
  const hvacInst = new THREE.InstancedMesh(unitBox, hvacMat, MAX_HVAC);
  hvacInst.castShadow = hvacInst.receiveShadow = true;
  hvacInst.frustumCulled = false;
  group.add(hvacInst);

  // 4. Instanced fire escapes: real steps nearby, lightweight silhouettes in the distance.
  const fireEscapeSystem = createFireEscapes(group);

  // 5. Ground-floor retail canvas awnings & illuminated storefront fascia signs
  const awningMat = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.65 });
  const awningPalette = [
    new THREE.Color(0x9e222e),
    new THREE.Color(0x1f593b),
    new THREE.Color(0x213d68),
    new THREE.Color(0xd9912b),
    new THREE.Color(0x2d2d32)
  ];
  const awningInst = new THREE.InstancedMesh(unitBox, awningMat, MAX_AWNINGS);
  awningInst.castShadow = awningInst.receiveShadow = true;
  awningInst.frustumCulled = false;
  // Pre-initialize instanceColor buffer so dynamic updates work cleanly
  for (let i = 0; i < MAX_AWNINGS; i++) {
    awningInst.setColorAt(i, awningPalette[i % awningPalette.length]);
  }
  group.add(awningInst);

  const signThemes = [
    { bg: '#161210', border: '#c89d54', text: 'KAFI · CONDITOREI', color: '#ffe4a8' },
    { bg: '#0b5a32', border: '#7fe0a8', text: 'APOTHEKE · DROGERIE', color: '#ffffff' },
    { bg: '#142b20', border: '#d4af37', text: 'BUCHHANDLUNG · ANTIQUARIAT', color: '#fff2cc' },
    { bg: '#280a10', border: '#ff5252', text: 'KIOSK · ZEITUNGEN', color: '#ffd180' },
    { bg: '#101318', border: '#e0e6ed', text: 'BECK · BÄCKEREI', color: '#f5f9ff' }
  ];
  const MAX_SIGNS_PER_THEME = Math.ceil(MAX_AWNINGS / signThemes.length) + 32;
  // Davos's real businesses carry their own signs (js/shops.js): the made-up fascia signs over the awnings stay off
  const GENERIC_SIGNS = false;
  // The awnings hang on the OSM footprints, which the swissBUILDINGS3D facades often stand in front of or behind:
  // in Davos they floated in front of the shop fronts, so they're off too (the businesses' signs are js/shops.js)
  const GENERIC_AWNINGS = false;
  const signInsts = signThemes.map((st) => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = st.bg;
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = st.border;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 84);
    ctx.fillStyle = st.color;
    ctx.font = '800 26px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.text, 256, 50);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sMat = new THREE.MeshBasicNodeMaterial({ map: tex });
    const sInst = new THREE.InstancedMesh(unitBox, sMat, MAX_SIGNS_PER_THEME);
    sInst.frustumCulled = false;
    group.add(sInst);
    return sInst;
  });

  // 6. Sidewalk construction scaffolding sheds
  const shedMat = new THREE.MeshStandardNodeMaterial({ color: 0x214f37, roughness: 0.6, metalness: 0.25 });
  const shedInst = new THREE.InstancedMesh(unitBox, shedMat, MAX_SHEDS);
  shedInst.castShadow = shedInst.receiveShadow = true;
  shedInst.frustumCulled = false;
  group.add(shedInst);

  // 7. Ground-floor storefront clustered SpotLights (awnings/fascia signs)
  const storeLightGroup = new THREE.Group();
  storeLightGroup.name = 'StoreClusteredLights';
  // (the spots are set in world heights (surfaceHeight) every frame: placeOnTerrain must not lift the group too,
  // which put every shop light 22 m under its street)
  storeLightGroup.userData.terrain = 'absolute';
  scene.add(storeLightGroup);

  const storeThemeColors = [
    new THREE.Color(0xffd896), // Bistro warm gold
    new THREE.Color(0xd8eeff), // Pharmacy crisp cool white
    new THREE.Color(0xffe4ad), // Bookstore warm amber
    new THREE.Color(0xffbe88), // 24hr Deli warm orange-gold
    new THREE.Color(0xfff2d6)  // Watch boutique warm ivory
  ];

  const STORE_SPOT_POOL = 28;
  const storeSpotPool = [];
  for (let i = 0; i < STORE_SPOT_POOL; i++) {
    const spot = new THREE.SpotLight(0xffd896, 0, 12.0, 0.84, 0.80, 1.30);
    spot.castShadow = false;
    spot.position.set(0, -1000, 0);
    spot.target.position.set(0, -1001, 0);
    storeLightGroup.add(spot);
    storeLightGroup.add(spot.target);
    storeSpotPool.push(spot);
  }

  const activeAwnings = [];
  // These details are placed every refresh (they follow the player), after placeOnTerrain has laid the static city on
  // the relief: each takes the surface height under it (cached), since they are built for a flat world
  const ground = (o) => (o.groundY ??= surfaceHeight(o.x, o.z));
  const spotCandidates = [];

  // ============================================================================
  // E. DYNAMIC QUADTREE STREAMING UPDATE AROUND PLAYER / CAMERA
  // ============================================================================
  let lastStreamX = Infinity;
  let lastStreamZ = Infinity;
  const STREAM_RADIUS = 560; // High-detail architectural radius around player in meters

  // Streaming rewrites only the active prefix; unused pool capacity need not cross the GPU queue.
  function flagRange(attribute, count) {
    if (count === 0) return;
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count * attribute.itemSize);
    attribute.needsUpdate = true;
  }

  function update(focusX, focusZ, force = false) {
    const dx = focusX - lastStreamX;
    const dz = focusZ - lastStreamZ;
    if (!force && (dx * dx + dz * dz) < 324) {
      // Player moved less than 18m since last Quadtree stream update
      return;
    }
    lastStreamX = focusX;
    lastStreamZ = focusZ;

    const nearbyBlocks = quadtree.queryRange(focusX, focusZ, STREAM_RADIUS);
    // Sort closest blocks first so if any pool hits capacity, closest blocks around the player always win
    nearbyBlocks.sort((a, b) => {
      const da = (a.cx - focusX) * (a.cx - focusX) + (a.cz - focusZ) * (a.cz - focusZ);
      const db = (b.cx - focusX) * (b.cx - focusX) + (b.cz - focusZ) * (b.cz - focusZ);
      return da - db;
    });
    activeAwnings.length = 0;

    let corniceCount = 0;
    let wtCount = 0;
    let hvacCount = 0;
    fireEscapeSystem.begin();
    let awningCount = 0;
    let shedCount = 0;
    const signCounts = signInsts.map(() => 0);

    for (let bIdx = 0; bIdx < nearbyBlocks.length; bIdx++) {
      const blk = nearbyBlocks[bIdx];
      // every piece of a block turned into a frontage frame shares its turn (see placeInFrame)
      dummy.rotation.set(0, blk.ry || 0, 0);
      const collectNearLights = bIdx < 20;

      // 1. Stone cornices & setback ledges, hung just below their roof line (top 0.1h under it, so no two ledges or
      //    roofs share a plane) so roofs & terraces keep their own roofing instead of a stone lid
      for (let i = 0; i < blk.cornices.length && corniceCount < MAX_CORNICES; i++) {
        const c = blk.cornices[i];
        dummy.rotation.set(0, c.ry ?? blk.ry ?? 0, 0);
        dummy.position.set(c.x, ground(c) + c.y - c.h * 0.6, c.z);
        dummy.scale.set(c.w, c.h, c.d);
        dummy.updateMatrix();
        corniceInst.setMatrixAt(corniceCount++, dummy.matrix);
      }

      // 2. Rooftop cedar water towers
      for (let i = 0; i < blk.waterTowers.length && wtCount < MAX_WATER_TOWERS; i++) {
        const wt = blk.waterTowers[i];
        dummy.scale.set(1, 1, 1);

        dummy.position.set(wt.x, ground(wt) + wt.y + 1.3, wt.z);
        dummy.updateMatrix();
        legsInst.setMatrixAt(wtCount, dummy.matrix);

        dummy.position.set(wt.x, ground(wt) + wt.y + 4.2, wt.z);
        dummy.updateMatrix();
        barrelInst.setMatrixAt(wtCount, dummy.matrix);

        dummy.position.set(wt.x, ground(wt) + wt.y + 6.7, wt.z);
        dummy.updateMatrix();
        coneInst.setMatrixAt(wtCount, dummy.matrix);
        wtCount++;
      }

      // 3. Rooftop HVAC & mechanical bulkheads
      for (let i = 0; i < blk.hvacUnits.length && hvacCount < MAX_HVAC; i++) {
        const u = blk.hvacUnits[i];
        dummy.rotation.set(0, u.ry ?? blk.ry ?? 0, 0);
        dummy.position.set(u.x, ground(u) + u.y + u.h * 0.5, u.z);
        dummy.scale.set(u.w, u.h, u.d);
        dummy.updateMatrix();
        hvacInst.setMatrixAt(hvacCount++, dummy.matrix);
      }

      // 4. Wrought-iron fire escapes
      for (const fe of blk.fireEscapes) fireEscapeSystem.add(fe, focusX, focusZ);

      // 5. Retail awnings & illuminated storefront fascia signs
      for (let i = 0; GENERIC_AWNINGS && i < blk.awnings.length && awningCount < MAX_AWNINGS; i++) {
        const a = blk.awnings[i];
        dummy.rotation.set(0, a.ry ?? blk.ry ?? 0, 0);
        dummy.position.set(a.x, ground(a) + a.y, a.z);
        dummy.scale.set(a.w, 0.75, a.d);
        dummy.updateMatrix();
        awningInst.setMatrixAt(awningCount, dummy.matrix);
        awningInst.setColorAt(awningCount, awningPalette[a.colorIdx % awningPalette.length]);

        const themeIdx = awningCount % signInsts.length;
        if (GENERIC_SIGNS && signCounts[themeIdx] < MAX_SIGNS_PER_THEME) {
          dummy.position.set(a.x, ground(a) + 4.68, a.z);
          dummy.scale.set(0.28, 0.86, a.d * 0.92);
          dummy.updateMatrix();
          signInsts[themeIdx].setMatrixAt(signCounts[themeIdx]++, dummy.matrix);
        }
        if (collectNearLights) {
          activeAwnings.push({ a, themeIdx, ry: a.ry ?? blk.ry ?? 0 });
        }
        awningCount++;
      }

      // 6. Sidewalk construction sheds
      for (let i = 0; i < blk.scaffoldSheds.length && shedCount < MAX_SHEDS; i++) {
        const s = blk.scaffoldSheds[i];
        dummy.position.set(s.x, ground(s) + s.y + 3.6, s.z);
        dummy.scale.set(s.w, 0.85, s.d);
        dummy.updateMatrix();
        shedInst.setMatrixAt(shedCount++, dummy.matrix);
      }
    }
    dummy.rotation.set(0, 0, 0);

    corniceInst.count = corniceCount;
    flagRange(corniceInst.instanceMatrix, corniceCount);

    legsInst.count = wtCount;
    barrelInst.count = wtCount;
    coneInst.count = wtCount;
    flagRange(legsInst.instanceMatrix, wtCount);
    flagRange(barrelInst.instanceMatrix, wtCount);
    flagRange(coneInst.instanceMatrix, wtCount);

    hvacInst.count = hvacCount;
    flagRange(hvacInst.instanceMatrix, hvacCount);

    fireEscapeSystem.end();

    awningInst.count = awningCount;
    flagRange(awningInst.instanceMatrix, awningCount);
    if (awningInst.instanceColor) flagRange(awningInst.instanceColor, awningCount);

    signInsts.forEach((sInst, idx) => {
      sInst.count = signCounts[idx];
      flagRange(sInst.instanceMatrix, signCounts[idx]);
    });

    shedInst.count = shedCount;
    flagRange(shedInst.instanceMatrix, shedCount);
  }

  function smoothFade(d, start, end) {
    const t = Math.min(1, Math.max(0, (end - d) / (end - start)));
    return t * t * (3 - 2 * t);
  }

  function updateLights(camera) {
    const glow = 0.85;
    const glowFactor = Math.max(0, (glow - 0.15) / 0.90);
    if (!camera || glowFactor <= 0.001) {
      for (let i = 0; i < STORE_SPOT_POOL; i++) {
        storeSpotPool[i].intensity = 0;
        storeSpotPool[i].position.set(0, -1000, 0);
      }
      return;
    }

    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;
    const e = camera.matrixWorld.elements;
    const fwdLen = Math.hypot(e[8], e[10]) || 1;
    const fwdX = -e[8] / fwdLen;
    const fwdZ = -e[10] / fwdLen;
    const STORE_MAX_DIST = 115;

    spotCandidates.length = 0;
    for (let i = 0; i < activeAwnings.length; i++) {
      const item = activeAwnings[i];
      const a = item.a;
      const dx = a.x - camX;
      const dz = a.z - camZ;
      const d2 = dx * dx + dz * dz + camY * camY;
      if (d2 > STORE_MAX_DIST * STORE_MAX_DIST) continue;
      const d = Math.sqrt(d2);
      const forwardDot = dx * fwdX + dz * fwdZ;
      const effDist = d + Math.max(0, 6.0 - forwardDot) * 2.8;
      if (effDist >= STORE_MAX_DIST) continue;
      spotCandidates.push({ item, effDist });
    }
    spotCandidates.sort((a, b) => a.effDist - b.effDist);

    const storeCutoff = spotCandidates.length > STORE_SPOT_POOL
      ? Math.min(STORE_MAX_DIST, spotCandidates[STORE_SPOT_POOL].effDist)
      : STORE_MAX_DIST;
    const activeSpots = Math.min(STORE_SPOT_POOL, spotCandidates.length);
    const spotIntensity = 46 * glowFactor;
    for (let i = 0; i < STORE_SPOT_POOL; i++) {
      const spot = storeSpotPool[i];
      if (i < activeSpots) {
        const cand = spotCandidates[i];
        const { a, themeIdx, ry } = cand.item;
        const fade = smoothFade(cand.effDist, storeCutoff * 0.62, storeCutoff);
        const sideDir = a.sideDir || 1;
        const outX = Math.cos(ry) * sideDir;
        const outZ = -Math.sin(ry) * sideDir;
        spot.position.set(a.x + outX * 0.45, ground(a) + 4.35, a.z + outZ * 0.45);
        spot.target.position.set(a.x + outX * 1.85, ground(a), a.z + outZ * 1.85);
        spot.target.updateMatrixWorld();
        spot.color.copy(storeThemeColors[themeIdx % storeThemeColors.length]);
        spot.intensity = spotIntensity * fade;
      } else {
        spot.intensity = 0;
        spot.position.set(0, -1000, 0);
      }
    }
  }

  // Initial Quadtree stream centered at Midtown 5th Ave & 42nd St
  update(0, 62, true);

  scene.add(group);
  return {
    group,
    colliders,
    interiors,
    quadtree,
    allBlocks,
    update,
    updateLights
  };
}

export { Quadtree, buildCityBlocks };
