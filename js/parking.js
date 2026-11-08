import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PARKING_DATA } from './parking-data.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { drapeOverlay, surfaceHeight, liftColliders } from './terrain.js';
import { BODY_SPECS, buildCarGeometry, buildCarProxyGeometry, createLoftedCarMaterial } from './actor-models.js';
import { createRoadSurfaceMaterial, createRoadPaintMaterial } from './tsl-materials.js';
import { snowyStreet } from './season.js';
import { berlinPolygonGeometry } from './berlin-geometry.js';
import { QUALITY, worldRegion } from './quality.js';
import { bayKey, createLotRegistry } from './hijack.js';
import { tracedMarkings } from './ground-markings-area.js';
import { GROUND_MARKINGS } from './ground-markings-data.js';

// The car parks OSM lacks (private yards and forecourts): their bays read from the paint traced in the aerial photo
// (js/ground-markings-data.js lots, tools/markings-bays.mjs: kind 'traced', no asphalt of their own, the ground's photo)
const ALL_LOTS = [...(PARKING_DATA || []), ...(GROUND_MARKINGS.cells || []).flatMap((c) => c.lots || [])];

// The open-air car parks of Davos (js/parking-data.js, tools/fetch-parking.mjs: OSM amenity=parking areas) with their
// bays and parked cars. In each lot the bays are laid out along its longest edge: thin lots (street-side and lane
// parking) get a row of parallel bays (6 × 2.3 m), deeper ones rows of perpendicular bays (2.5 × 5 m) back to back
// with a 6 m aisle between; a bay is kept when it lies wholly inside the lot, clear of the buildings, the water and the
// mapped roads and aisles. Lots whose painted bays tools/detect-parking-bays.mjs found in the SWISSIMAGE aerial photo
// (lot.bays) use those instead, with a car where the photo shows one. White bay lines are draped on the ground; about
// seven bays in ten hold a car (the traffic's
// sedans and SUVs, with their materials and the Swiss plates of js/plates.js), standing on the slope. The cars within
// NEAR of the camera are the full models (with wheels, casting shadows), the rest the lofted proxies instanced per
// 200 m cell (no shadows); all are solid: colliders for the player.
// Each lot is paved: the asphalt of the streets (snowed over in winter, js/season.js) draped flush on the terrain over
// the orthophoto, a little under the streets and pushed back in depth (polygonOffset) so that the aisles mapped as
// service roads and the streets crossing a lot win; the bay lines, in the road paint (anti-aliased, worn, faded under
// the snow), lie on it and are pulled forward. As in Switzerland the lines are white on public car parks, blue for the
// blue zone along the streets and yellow on private ground (hotel car parks, the small lots of the houses).
// The player can get into the parked cars (js/gta-takeover.js, the rules in js/hijack.js): lotCars knows the cars built and
// the bays whose car is in use, which stay empty (near and far instances hidden, collider gone), also when the mobile
// profile's cell is torn down and built anew. Taken bays are not saved, except the one of the car being driven.

const BAY_W = 2.5, BAY_D = 5, AISLE = 6, PARALLEL_L = 6, PARALLEL_W = 2.3, LINE = 0.12;
const SURFACE_LIFT = 0.06, LINE_LIFT = 0.085; // m over the terrain (the streets lie at 0.11)
const LINE_COLOURS = { white: [0.9, 0.89, 0.86], yellow: [0.91, 0.68, 0.13], blue: [0.16, 0.38, 0.78] };
const OCCUPANCY = 0.7, CELL = 200, NEAR = 100, FAR = QUALITY.parkedFar;
const KINDS = ['sedan', 'suv'];
// Swiss car colours (linear-ish sRGB hex, as the traffic palettes): greys, black, white, silver, dark blue, red, green
const PALETTE = [0x16191e, 0xf0f3f7, 0xbec6cf, 0x52575e, 0x2b3038, 0x1d3b6c, 0x6e1f24, 0x28382e, 0x8a8f96, 0xdadfe4, 0x3a434d, 0x5c1418];

function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const flatPts = (ring) => { const p = []; for (let i = 0; i < ring.length; i += 2) p.push({ x: ring[i], z: ring[i + 1] }); return p; };
function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}
const box = (pts) => ({ x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)) });

// Obstacles near the lots: building footprints and water (polygons), roads and aisles (segments with half-widths)
function obstacles() {
  const G = 50, polys = new Map(), segs = new Map();
  const add = (map, b, item) => {
    for (let i = Math.floor(b.x0 / G); i <= Math.floor(b.x1 / G); i++) for (let j = Math.floor(b.z0 / G); j <= Math.floor(b.z1 / G); j++) {
      const k = `${i},${j}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    }
  };
  for (const f of [...DAVOS_DATA.buildings, ...DAVOS_DATA.water]) {
    const poly = flatPts(f.ring), b = box(poly);
    add(polys, b, { poly, b });
  }
  for (const r of DAVOS_DATA.roads) {
    if (r.tunnel || r.bridge || /^(footway|path|steps|track|cycleway)$/.test(r.kind)) continue;
    const half = (r.width || 4) / 2 + 0.3;
    for (let i = 2; i < r.pts.length; i += 2) {
      const a = { x: r.pts[i - 2], z: r.pts[i - 1] }, c = { x: r.pts[i], z: r.pts[i + 1] };
      add(segs, { x0: Math.min(a.x, c.x) - half, x1: Math.max(a.x, c.x) + half, z0: Math.min(a.z, c.z) - half, z1: Math.max(a.z, c.z) + half }, { a, c, half });
    }
  }
  const near = (map, x, z) => map.get(`${Math.floor(x / G)},${Math.floor(z / G)}`) || [];
  return {
    // `roads`: also keep clear of the roads (not for street-side parking, which lines them)
    blocked(x, z, roads = true) {
      for (const { poly, b } of near(polys, x, z)) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && inside(poly, x, z)) return true;
      if (!roads) return false;
      for (const { a, c, half } of near(segs, x, z)) {
        const dx = c.x - a.x, dz = c.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
        if (Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < half) return true;
      }
      return false;
    }
  };
}

// The bays of a lot: [{ x, z, ux, uz (along the bay's length, the car's heading), w, l }]
function layoutLot(lot, obs) {
  const poly = flatPts(lot.ring);
  if (poly.length > 2 && poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly.pop();
  // The longest edge sets the rows' direction d; n across them
  let d = { x: 1, z: 0 }, best = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L > best) { best = L; d = { x: (b.x - a.x) / L, z: (b.z - a.z) / L }; }
  }
  const n = { x: -d.z, z: d.x };
  const us = poly.map((p) => p.x * d.x + p.z * d.z), vs = poly.map((p) => p.x * n.x + p.z * n.z);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  const depth = v1 - v0;
  const at = (u, v) => ({ x: d.x * u + n.x * v, z: d.z * u + n.z * v });
  const fits = (u, v, hu, hv) => {
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const p = at(u + su * hu, v + sv * hv);
      if (!inside(poly, p.x, p.z) || obs.blocked(p.x, p.z, lot.kind === 'surface')) return false;
    }
    return true;
  };
  const bays = [];
  if (lot.kind === 'space') {
    // A single marked bay: the car along the bay's longer side
    const c = at((u0 + u1) / 2, (v0 + v1) / 2), long = u1 - u0 >= depth;
    bays.push({ ...c, ux: long ? d.x : n.x, uz: long ? d.z : n.z, w: long ? depth : u1 - u0, l: long ? u1 - u0 : depth });
    return bays;
  }
  if (depth < 3.8) {
    // Parallel parking along the lot
    const v = (v0 + v1) / 2;
    for (let u = u0 + PARALLEL_L / 2 + 0.3; u <= u1 - PARALLEL_L / 2; u += PARALLEL_L) {
      if (fits(u, v, PARALLEL_L / 2 - 0.4, Math.min(PARALLEL_W, depth) / 2 - 0.2)) bays.push({ ...at(u, v), ux: d.x, uz: d.z, w: PARALLEL_W, l: PARALLEL_L });
    }
    return bays;
  }
  // Perpendicular rows: bay row (+n), aisle, bay row (-n), back to back with the next pair
  const rows = [];
  for (let v = v0; v + BAY_D <= v1 + 0.01;) {
    rows.push({ v: v + BAY_D / 2, dir: 1 });
    v += BAY_D;
    if (v + AISLE + BAY_D > v1 + 0.01) break;
    v += AISLE;
    rows.push({ v: v + BAY_D / 2, dir: -1 });
    v += BAY_D;
  }
  for (const row of rows) {
    for (let u = u0 + BAY_W / 2 + 0.3; u <= u1 - BAY_W / 2; u += BAY_W) {
      if (fits(u, row.v, BAY_W / 2 - 0.15, BAY_D / 2 - 0.3)) bays.push({ ...at(u, row.v), ux: n.x * row.dir, uz: n.z * row.dir, w: BAY_W, l: BAY_D });
    }
  }
  return bays;
}

// The colour of a lot's lines (see above)
function lineColour(lot, bayCount) {
  if (lot.kind === 'street') return 'blue';
  if (/hotel|gäste|privat|anwohner|mieter/i.test(lot.name || '')) return 'yellow';
  if (lot.kind === 'surface' && !lot.name && bayCount > 0 && bayCount < 12) return 'yellow';
  return 'white';
}

// The lines between the bays (and their back ends), draped on the lot, with the road paint's attributes (`paint`: metres
// along, period, duty; `side`: offset from the line's centre, for the anti-aliased widening; `color`)
function bayLines(bays) {
  const positions = [], paints = [], sides = [], colors = [];
  const quad = (ax, az, bx, bz, col) => {
    const L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L * LINE / 2, nz = (bx - ax) / L * LINE / 2;
    // (counter-clockwise seen from above, so that the strips face up)
    const corners = [[ax - nx, az - nz, 0, -1], [bx + nx, bz + nz, L, 1], [bx - nx, bz - nz, L, -1], [ax - nx, az - nz, 0, -1], [ax + nx, az + nz, 0, 1], [bx + nx, bz + nz, L, 1]];
    for (const [x, z, along, side] of corners) {
      positions.push(x, 0, z);
      paints.push(along, 1, 1);
      sides.push(nx * side, nz * side);
      colors.push(...col);
    }
  };
  for (const b of bays) {
    const sx = -b.uz, sz = b.ux, hw = b.w / 2, hl = b.l / 2, col = LINE_COLOURS[b.colour] || LINE_COLOURS.white;
    // the two side lines along the bay, and the back line
    for (const s of [-1, 1]) quad(b.x + sx * hw * s - b.ux * hl, b.z + sz * hw * s - b.uz * hl, b.x + sx * hw * s + b.ux * hl, b.z + sz * hw * s + b.uz * hl, col);
    quad(b.x - b.ux * hl - sx * hw, b.z - b.uz * hl - sz * hw, b.x - b.ux * hl + sx * hw, b.z - b.uz * hl + sz * hw, col);
  }
  if (!positions.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(positions.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('paint', new THREE.Float32BufferAttribute(paints, 3));
  g.setAttribute('side', new THREE.Float32BufferAttribute(sides, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const draped = drapeOverlay(g, { maxEdge: 3, lift: LINE_LIFT });
  g.dispose();
  return draped;
}

// The asphalt of a lot, draped on the terrain
function lotSurface(lot) {
  if (lot.kind === 'traced') return null; // (a yard's own ground, as photographed)
  const ring = flatPts(lot.ring);
  if (ring.length > 2 && ring[0].x === ring[ring.length - 1].x && ring[0].z === ring[ring.length - 1].z) ring.pop();
  if (ring.length < 3) return null;
  const flatGeometry = berlinPolygonGeometry(ring, [], 0);
  const draped = drapeOverlay(flatGeometry, { maxEdge: 6, lift: SURFACE_LIFT });
  flatGeometry.dispose();
  return draped;
}

/** The parked cars built so far and the taken bays (js/hijack.js createLotRegistry) */
export const lotCars = createLotRegistry();
/** The car of bay `key` is in use: its bay stands empty, now (if it is built) and whenever its cell is built */
export function takeLotBay(key, controllers) {
  lotCars.take(key);
  const car = lotCars.get(key);
  if (car) car.setTaken(car, true, controllers);
}
/** The car of bay `key` is back */
export function returnLotBay(key, controllers) {
  lotCars.give(key);
  const car = lotCars.get(key);
  if (car) car.setTaken(car, false, controllers);
}

let sharedObstacles = null, sharedMaterials = null, sharedFarGeometry = null;
/**
 * The car parks in `region` (js/quality.js regions: everything on the desktop profile; on the mobile one
 * js/world-stream.js asks for its cells round the player, one group each), added to `scene` (or the group passed).
 */
export function buildParking(scene, region = worldRegion()) {
  const group = new THREE.Group();
  group.name = 'Parking';
  group.userData.terrain = 'absolute'; // laid on the terrain here
  scene.add(group);
  const obs = sharedObstacles || (sharedObstacles = obstacles());
  // (the mobile profile, js/quality.js worldRadius: only the car parks of the cell being built)
  const lots = ALL_LOTS.filter((lot) => !lot.ring?.length ? region.all : region.owns(lot.ring[0], lot.ring[1]));
  const bays = [];
  let photographed = 0;
  for (const lot of lots) {
    const first = bays.length;
    if (lot.bays?.length) {
      // The bays painted on the ground, as found in SWISSIMAGE (tools/detect-parking-bays.mjs): the back line on the row
      // line, a car where the photo shows one (none where a building stands)
      photographed++;
      for (const [x, z, angle, w, l, occupied] of lot.bays) {
        if (obs.blocked(x, z, false)) continue; // (buildings and water only: the painted bays know the aisles)
        bays.push({ x, z, ux: Math.sin(angle), uz: Math.cos(angle), w, l, occupied: !!occupied, lot: lot.id });
      }
    } else for (const b of layoutLot(lot, obs)) bays.push({ ...b, lot: lot.id });
    const colour = lineColour(lot, bays.length - first);
    for (let i = first; i < bays.length; i++) bays[i].colour = colour;
  }

  // Asphalt (one merged mesh), pushed back in depth under the streets and the lines
  const surfaces = lots.map(lotSurface).filter(Boolean);
  if (surfaces.length) {
    const material = snowyStreet(createRoadSurfaceMaterial(), { cover: 0.85 });
    material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 2;
    const asphalt = new THREE.Mesh(mergeGeometries(surfaces, false), material);
    surfaces.forEach((g) => g.dispose());
    asphalt.name = 'Parking asphalt';
    asphalt.receiveShadow = true;
    group.add(asphalt);
  }

  // Lines (one merged mesh), pulled forward over the asphalt
  const lineGeometries = [];
  // (where the paint is traced from the aerial photo, js/vector-ground.js draws the real lines; the bays and their cars stay)
  const painted = bays.filter((b) => !tracedMarkings(b.x, b.z));
  for (let i = 0; i < painted.length; i += 400) { const g = bayLines(painted.slice(i, i + 400)); if (g) lineGeometries.push(g); }
  if (lineGeometries.length) {
    const material = snowyStreet(createRoadPaintMaterial(), { paint: true });
    material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -4;
    const lines = new THREE.Mesh(mergeGeometries(lineGeometries, false), material);
    lineGeometries.forEach((g) => g.dispose());
    lines.name = 'Parking bay lines';
    lines.receiveShadow = true;
    lines.renderOrder = 1; // (after the asphalt, like the street markings)
    group.add(lines);
  }

  // The cars: about seven bays in ten (deterministic), sedans and SUVs, in the traffic's materials
  const cars = [];
  bays.forEach((b, i) => {
    const h = hash(Math.round(b.x * 10) * 73856093 ^ Math.round(b.z * 10) * 19349663);
    if (b.occupied === undefined ? h > OCCUPANCY : !b.occupied) return;
    const kind = KINDS[hash(i * 7 + 3) < 0.55 ? 0 : 1];
    const col = new THREE.Color(PALETTE[Math.floor(hash(i * 13 + 5) * PALETTE.length)]);
    // Nose in or nose out
    const flip = hash(i * 31 + 7) < 0.35 ? -1 : 1;
    const key = bayKey(b.x, b.z);
    cars.push({ key, x: b.x, z: b.z, ux: b.ux * flip, uz: b.uz * flip, kind, col, taken: lotCars.isTaken(key) });
  });

  // Far: the lofted proxies, instanced per 200 m cell and body type (frustum-culled per cell, no shadows), shown within
  // FAR. Near: the full cars (with wheels, casting shadows) within NEAR of the camera, one instanced mesh per body type
  // refilled as the camera moves, their proxies hidden meanwhile (a zero matrix in the cell's mesh)
  const cells = new Map();
  for (const c of cars) {
    const key = `${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}`;
    if (!cells.has(key)) cells.set(key, { x: (Math.floor(c.x / CELL) + 0.5) * CELL, z: (Math.floor(c.z / CELL) + 0.5) * CELL, cars: { sedan: [], suv: [] } });
    cells.get(key).cars[c.kind].push(c);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const colliders = [];
  const cellMeshes = [];
  const materials = sharedMaterials || (sharedMaterials = Object.fromEntries(KINDS.map((k) => [k, createLoftedCarMaterial(BODY_SPECS[k])])));
  const farGeometry = sharedFarGeometry || (sharedFarGeometry = Object.fromEntries(KINDS.map((k) => [k, buildCarProxyGeometry(BODY_SPECS[k])])));
  for (const cell of cells.values()) {
    const entry = { x: cell.x, z: cell.z, far: [], cars: [] };
    for (const kind of KINDS) {
      const list = cell.cars[kind];
      if (!list.length) continue;
      const spec = BODY_SPECS[kind], half = (spec.zFront - spec.zRear) / 2;
      const geo = farGeometry[kind].clone();
      const paint = new Float32Array(list.length * 3);
      geo.setAttribute('paintColor', new THREE.InstancedBufferAttribute(paint, 3));
      geo.setAttribute('carState', new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4));
      const mesh = new THREE.InstancedMesh(geo, materials[kind], list.length);
      list.forEach((c, i) => {
        // On the slope: pitched along the car, rolled across it
        const yaw = Math.atan2(c.ux, c.uz), sx = -c.uz, sz = c.ux;
        const yf = surfaceHeight(c.x + c.ux * half, c.z + c.uz * half), yb = surfaceHeight(c.x - c.ux * half, c.z - c.uz * half);
        const yl = surfaceHeight(c.x - sx * 0.85, c.z - sz * 0.85), yr = surfaceHeight(c.x + sx * 0.85, c.z + sz * 0.85);
        e.set(-Math.atan2(yf - yb, 2 * half), yaw, Math.atan2(yr - yl, 1.7));
        c.y = (yf + yb) / 2 + 0.02;
        c.matrix = m.compose(p.set(c.x, c.y, c.z), q.setFromEuler(e), one).clone();
        c.paint = [Math.fround(c.col.r), Math.fround(c.col.g), Math.fround(c.col.b)];
        c.mesh = mesh; c.slot = i; c.near = false;
        c.heading = yaw; c.half = half; c.halfWidth = 0.95; c.setTaken = setTaken;
        mesh.setMatrixAt(i, c.matrix);
        paint.set(c.paint, i * 3);
        entry.cars.push(c);
        c.collider = {
          minX: c.x - Math.abs(c.ux) * half - Math.abs(sx) * 0.95, maxX: c.x + Math.abs(c.ux) * half + Math.abs(sx) * 0.95,
          minZ: c.z - Math.abs(c.uz) * half - Math.abs(sz) * 0.95, maxZ: c.z + Math.abs(c.uz) * half + Math.abs(sz) * 0.95,
          minY: 0, maxY: kind === 'suv' ? 1.75 : 1.5,
          obb: { cx: c.x, cz: c.z, hx: 0.95, hz: half, cs: Math.cos(yaw), sn: Math.sin(yaw) }
        };
        if (!c.taken) colliders.push(c.collider);
        lotCars.add(c);
      });
      mesh.computeBoundingSphere();
      for (const c of list) if (c.taken) mesh.setMatrixAt(c.slot, hidden); // (after the sphere: a zero matrix would stretch it to the origin)
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.visible = false;
      mesh.name = `Parked ${kind} far`;
      group.add(mesh);
      entry.far.push(mesh);
    }
    cellMeshes.push(entry);
  }
  // (capacity at least one: WebGPU rejects zero-sized buffers)
  const near = Object.fromEntries(KINDS.map((kind) => {
    const n = Math.max(1, cars.filter((c) => c.kind === kind).length);
    const geo = buildCarGeometry(BODY_SPECS[kind], true);
    geo.setAttribute('paintColor', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('carState', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
    const mesh = new THREE.InstancedMesh(geo, materials[kind], n);
    mesh.count = 0;
    mesh.visible = false;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = `Parked ${kind} near`;
    group.add(mesh);
    return [kind, mesh];
  }));

  // Every 0.3 s: the cells within FAR show their proxies; the cars within NEAR (NEAR + 12 m to leave) the full model
  let last = -1e9, lastCamera = null;
  const nearCars = [];
  function update(camera) {
    const now = performance.now();
    if (now - last < 300) return;
    last = now;
    lastCamera = camera;
    nearCars.length = 0;
    const reach = NEAR + 12 + CELL * 0.71;
    for (const c of cellMeshes) {
      const d = Math.hypot(c.x - camera.x, c.z - camera.z);
      for (const mesh of c.far) mesh.visible = d < FAR;
      if (d > reach && !c.anyNear) continue;
      let any = false;
      for (const car of c.cars) {
        if (car.taken) continue;
        const dc = Math.hypot(car.x - camera.x, car.y - camera.y, car.z - camera.z);
        const isNear = dc < (car.near ? NEAR + 12 : NEAR);
        if (isNear !== car.near) {
          car.near = isNear;
          car.mesh.setMatrixAt(car.slot, isNear ? hidden : car.matrix);
          car.mesh.instanceMatrix.needsUpdate = true;
        }
        if (isNear) { nearCars.push(car); any = true; }
      }
      c.anyNear = any;
    }
    for (const kind of KINDS) {
      const mesh = near[kind], paint = mesh.geometry.attributes.paintColor;
      let n = 0;
      for (const car of nearCars) {
        if (car.kind !== kind) continue;
        mesh.setMatrixAt(n, car.matrix);
        paint.array.set(car.paint, n * 3);
        n++;
      }
      mesh.count = n;
      mesh.visible = n > 0;
      if (n) {
        mesh.instanceMatrix.needsUpdate = true;
        paint.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
  }

  // A car goes out of its bay or back into it (takeLotBay, returnLotBay): at once, not at the next refill
  function setTaken(car, taken, controllers) {
    if (car.taken === taken) return;
    car.taken = taken;
    car.near = false;
    car.mesh.setMatrixAt(car.slot, taken ? hidden : car.matrix);
    car.mesh.instanceMatrix.needsUpdate = true;
    if (taken) {
      const i = colliders.indexOf(car.collider);
      if (i >= 0) colliders.splice(i, 1);
      controllers?.removeColliders([car.collider]);
    } else {
      liftColliders([car.collider]); // (a cell built with the bay empty has not been lifted with the rest)
      colliders.push(car.collider);
      controllers?.addColliders([car.collider]);
    }
    last = -1e9;
    if (lastCamera) update(lastCamera);
  }
  const dispose = () => { for (const c of cars) lotCars.remove(c); };

  group.userData.stats = { lots: lots.length, photographed, bays: bays.length, cars: cars.length, cells: cells.size };
  if (region.all) console.info(`[parking] ${lots.length} lots (${photographed} with the bays painted in the aerial photo), ${bays.length} bays, ${cars.length} parked cars in ${cells.size} cells`);
  return { group, update, colliders, dispose, stats: group.userData.stats };
}

/** The bays of one lot as buildParking lays them out: [{ x, z, ux, uz, w, l, occupied }] (`occupied`: a parked car stands
 *  there; the missions' marshal, js/missions-resort.js, sends cars to the free ones) */
export function lotBays(lotId) {
  const lot = ALL_LOTS.find((l) => l.id === lotId);
  if (!lot) return [];
  const obs = sharedObstacles || (sharedObstacles = obstacles());
  if (lot.bays?.length) return lot.bays.filter(([x, z]) => !obs.blocked(x, z, false)).map(([x, z, angle, w, l, occupied]) => ({ x, z, ux: Math.sin(angle), uz: Math.cos(angle), w, l, occupied: !!occupied }));
  return layoutLot(lot, obs).map((b) => ({ ...b, occupied: hash(Math.round(b.x * 10) * 73856093 ^ Math.round(b.z * 10) * 19349663) <= OCCUPANCY }));
}
