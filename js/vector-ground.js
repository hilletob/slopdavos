import * as THREE from 'three/webgpu';
import { attribute, float, mx_noise_float, normalize, positionWorld, smoothstep } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { polygonGeometry } from './golf.js';
import { drapeOverlay } from './terrain.js';
import { cutTriangles } from './terrain-grid.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { createRoadPaintMaterial } from './tsl-materials.js';
import { snowyGround, snowyStreet, winter } from './season.js';
import { QUALITY, worldRegion } from './quality.js';
import { GROUND_KINDS, groundKindNodes } from './ground-kinds.js';
import { strokePolyline, linePoints, ringDistance, ringBounds, chunkCoverage } from './ground-geometry.js';
import { GROUND_SPORTS } from './ground-sports-data.js';
import { GROUND_MARKINGS } from './ground-markings-data.js';
import { decodeMarkingsCell } from './ground-markings-area.js';

// js/vector-ground.js — the vector ground: what must be sharp on the ground drawn as draped vectors over the orthophoto
// instead of left to its pixels (0.5 m in the valley, ~1 m on the phone, where the lanes of a track and the lines of a
// pitch blur away). Surfaces with a ground kind (js/ground-kinds.js: tartan, turf, clay …) and painted lines, traced
// from the full-resolution SWISSIMAGE by tools/trace-ground.mjs into one data file per layer (js/ground-sports-data.js:
// the sports grounds; data/ground-markings/<cell>.json: the paint on the roads and the yards off them, a 120 m cell each,
// loaded near the camera (streamGroundMarkings), whose strokes and filled shapes (arrows, lettering) replace the
// rule-based markings where traced, js/ground-markings-area.js). One mesh of surfaces (one procedural material, the kind per vertex) and one of lines (the road
// paint's material and attributes, js/parking.js bayLines) per region: the whole map on the desktop, a 500 m cell of
// js/world-stream.js on the phone. In winter the surfaces lie under the same snow as the photo (season.js snowyGround)
// and the lines only show through faintly (snowyStreet paint).
// Heights: the road paint 0.13 (over the streets' asphalt, as js/city-grid.js paints it) > the streets' tops 0.11 >
// the lines 0.085 (as the car parks' bays) > the surfaces 0.06 (as the car parks'
// asphalt) > the golf course 0.05.
// groundCoverage(): the share of a rectangle the surfaces cover, for the orthophoto loader (js/swissimage.js), which
// can leave out the photo of a chunk the vector ground covers whole (not yet: QUALITY.orthoSkipCoverage).

export const GROUND_LAYERS = [GROUND_SPORTS]; // (built whole, or per cell of js/world-stream.js; the markings: streamGroundMarkings)
const SURFACE_LIFT = 0.06, LINE_LIFT = 0.085, ROAD_PAINT_LIFT = 0.13, SURFACE_EDGE = 4, LINE_EDGE = 3;
const LINE_COLOURS = { w: [0.9, 0.89, 0.86], y: [0.91, 0.68, 0.13], b: [0.16, 0.38, 0.78], r: [0.7, 0.1, 0.08] };
// (the road paint: js/road-paint.js's white and the Swiss yellow, 0xe6e2d6 and 0xf6bf10 in linear terms)
const ROAD_COLOURS = { w: new THREE.Color(0xe6e2d6).toArray(), y: new THREE.Color(0xf6bf10).toArray(), b: LINE_COLOURS.b, r: LINE_COLOURS.r };
const liftOf = (layer) => (layer.layer === 'markings' ? ROAD_PAINT_LIFT : LINE_LIFT);
const coloursOf = (layer) => (layer.layer === 'markings' ? ROAD_COLOURS : LINE_COLOURS);

let surfaceMat = null, lineMat = null, fillMat = null;
// The filled paint (arrows, lettering): plain painted shapes, worn a little, under the snow in winter
function fillMaterial() {
  if (fillMat) return fillMat;
  const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, transparent: true, depthWrite: false, metalness: 0, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  m.name = 'VectorGroundFills';
  const wear = mx_noise_float(positionWorld.xz.mul(2.3)).mul(0.5).add(0.5);
  m.opacityNode = smoothstep(0.1, 0.6, wear).mul(0.35).add(0.6).mul(float(1).sub(winter.mul(0.85)));
  fillMat = m;
  return m;
}
function surfaceMaterial() {
  if (surfaceMat) return surfaceMat;
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.name = 'VectorGroundSurface';
  const kind = attribute('groundKind', 'float'), edge = attribute('groundEdge', 'float'), dir = normalize(attribute('groundDir', 'vec2'));
  const { colour, roughness } = groundKindNodes(kind, { p: positionWorld.xz, dir, edge });
  m.colorNode = snowyGround(colour);
  m.roughnessNode = roughness;
  m.opacityNode = smoothstep(0, 0.3, edge); // (a soft edge into the photo)
  surfaceMat = m;
  return m;
}
function lineMaterial() {
  if (lineMat) return lineMat;
  const m = snowyStreet(createRoadPaintMaterial(), { paint: true });
  m.name = 'VectorGroundLines';
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4;
  lineMat = m;
  return m;
}

/** The direction a site's surfaces are laid in (mowing, brushing): its track's or first court's heading */
function siteHeading(site) {
  if (site.track) return site.track.heading;
  if (site.courts?.length) return site.courts[0].heading;
  // the longest edge of the first surface
  const r = site.surfaces[0]?.ring || [0, 0, 1, 0];
  let best = 0, h = 0;
  for (let i = 0; i < r.length; i += 2) {
    const j = (i + 2) % r.length, dx = r[j] - r[i], dz = r[j + 1] - r[i + 1], L = Math.hypot(dx, dz);
    if (L > best) { best = L; h = Math.atan2(dx, dz); }
  }
  return h;
}

// The railway's track bed (js/trams.js: 2.8 m of ballast over each mapped track, off the bridges and tunnels) is cut
// out of the surfaces: a yard traced up to the platforms reaches over the tracks, lies 2 cm under the ballast and is
// pulled forward in depth (its polygonOffset), so that from a little way off it covered the rails at the stations.
// (TRACK_CUT: a little under the ballast's half width, so that the photo never shows in a seam beside it)
const TRACK_CUT = 1.3, TRACK_CELL = 64;
let trackCells = null;
function trackRects(minX, minZ, maxX, maxZ) {
  if (!trackCells) {
    trackCells = new Map();
    for (const r of DAVOS_DATA.railways || []) {
      if (r.tunnel || r.bridge || !/^(rail|narrow_gauge)$/.test(r.kind)) continue;
      for (let i = 2; i < r.pts.length; i += 2) {
        const rect = { ax: r.pts[i - 2], az: r.pts[i - 1], bx: r.pts[i], bz: r.pts[i + 1], half: TRACK_CUT };
        for (let cx = Math.floor((Math.min(rect.ax, rect.bx) - TRACK_CUT) / TRACK_CELL); cx <= Math.floor((Math.max(rect.ax, rect.bx) + TRACK_CUT) / TRACK_CELL); cx++) {
          for (let cz = Math.floor((Math.min(rect.az, rect.bz) - TRACK_CUT) / TRACK_CELL); cz <= Math.floor((Math.max(rect.az, rect.bz) + TRACK_CUT) / TRACK_CELL); cz++) {
            const key = cx * 65536 + cz;
            if (!trackCells.has(key)) trackCells.set(key, []);
            trackCells.get(key).push(rect);
          }
        }
      }
    }
  }
  const found = new Set();
  for (let cx = Math.floor(minX / TRACK_CELL); cx <= Math.floor(maxX / TRACK_CELL); cx++) {
    for (let cz = Math.floor(minZ / TRACK_CELL); cz <= Math.floor(maxZ / TRACK_CELL); cz++) for (const r of trackCells.get(cx * 65536 + cz) || []) found.add(r);
  }
  return [...found];
}
/** `g` (draped, non-indexed) without the track bed, or `g` itself where no track crosses it */
function withoutTrackBed(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, rects = trackRects(b.min.x, b.min.z, b.max.x, b.max.z);
  if (!rects.length) return g;
  const p = g.attributes.position.array, n = p.length / 3;
  // (cutTriangles rounds the new vertices' normals, as for normals in bytes: these go in scaled up)
  const nrm = Float32Array.from(g.attributes.normal.array, (v) => v * 1e4);
  const index = new Uint32Array(n);
  for (let i = 0; i < n; i++) index[i] = i;
  const cut = cutTriangles(p, nrm, index, 0, n, rects);
  if (cut.index.length === n && cut.positions.length === p.length) return g; // (nothing on the tracks)
  const pos = new Float32Array(cut.index.length * 3), nor = new Float32Array(cut.index.length * 3);
  for (let t = 0; t < cut.index.length; t++) for (let c = 0; c < 3; c++) {
    pos[t * 3 + c] = cut.positions[cut.index[t] * 3 + c]; nor[t * 3 + c] = cut.normals[cut.index[t] * 3 + c] * 1e-4;
  }
  g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

function surfaceGeometry(s, heading) {
  const flat = polygonGeometry(s.ring, s.holes || []);
  const g = withoutTrackBed(drapeOverlay(flat, { maxEdge: SURFACE_EDGE, lift: SURFACE_LIFT }));
  flat.dispose();
  const p = g.attributes.position, n = p.count;
  const kind = new Float32Array(n).fill(GROUND_KINDS[s.kind].index), edge = new Float32Array(n), dir = new Float32Array(n * 2);
  const dx = Math.sin(heading), dz = Math.cos(heading);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), z = p.getZ(i);
    let d = ringDistance(s.ring, x, z);
    for (const h of s.holes || []) d = Math.min(d, ringDistance(h, x, z));
    edge[i] = Math.min(d, 30);
    dir[2 * i] = dx; dir[2 * i + 1] = dz;
  }
  g.setAttribute('groundKind', new THREE.BufferAttribute(kind, 1));
  g.setAttribute('groundEdge', new THREE.BufferAttribute(edge, 1));
  g.setAttribute('groundDir', new THREE.BufferAttribute(dir, 2));
  return g;
}

function linesGeometry(lines, { lift = LINE_LIFT, colours = LINE_COLOURS } = {}) {
  const out = { positions: [], paint: [], side: [], color: [] };
  const edge = LINE_EDGE / (QUALITY.drapeScale || 1);
  // (pieces whose diagonal stays under the drape's edge: it then splits none of them, ground-geometry.js strokePolyline)
  for (const l of lines) strokePolyline(linePoints(l), l.w, colours[l.c] || colours.w, out, Math.sqrt(Math.max(0.01, (edge * 0.95) ** 2 - (l.w * 3) ** 2)));
  if (!out.positions.length) return null;
  const g = new THREE.BufferGeometry();
  const normals = new Float32Array(out.positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('paint', new THREE.Float32BufferAttribute(out.paint, 3));
  g.setAttribute('side', new THREE.Float32BufferAttribute(out.side, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.color, 3));
  // (not split coarser on the phone, js/quality.js drapeScale: thin lines over the surfaces' exact drape would dip under it)
  const draped = drapeOverlay(g, { maxEdge: edge, lift });
  g.dispose();
  return draped;
}

function fillsGeometry(fills, colours) {
  const parts = [];
  for (const f of fills) {
    const flat = polygonGeometry(f.ring, f.holes || []);
    const g = drapeOverlay(flat, { maxEdge: LINE_EDGE / (QUALITY.drapeScale || 1), lift: ROAD_PAINT_LIFT });
    flat.dispose();
    const c = colours[f.c] || colours.w, n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/** The sites of the layers a region builds (a site belongs to the region that owns the centre of its box) */
export function regionSites(region, layers = GROUND_LAYERS) {
  return layers.flatMap((l) => l.sites).filter((s) => region.owns((s.box[0] + s.box[2]) / 2, (s.box[1] + s.box[3]) / 2));
}

/** Builds the vector ground of a region: { group, stats, dispose } (the group added to `scene` when given) */
export function buildVectorGround(scene, { layers = GROUND_LAYERS, region = worldRegion() } = {}) {
  const group = new THREE.Group();
  group.name = 'VectorGround';
  group.userData.terrain = 'absolute'; // draped above
  const sites = regionSites(region, layers);
  const surfaces = [], lineSets = new Map(), fills = [];
  for (const layer of layers) for (const site of regionSites(region, [layer])) {
    const heading = siteHeading(site);
    for (const s of site.surfaces) if (GROUND_KINDS[s.kind] && !GROUND_KINDS[s.kind].lines) surfaces.push({ s, heading });
    if (!lineSets.has(layer)) lineSets.set(layer, []);
    lineSets.get(layer).push(...site.lines);
    if (site.fills) fills.push(...site.fills);
  }
  // drawn in the kinds' order (no depth writes: later triangles lie over earlier ones)
  surfaces.sort((a, b) => GROUND_KINDS[a.s.kind].index - GROUND_KINDS[b.s.kind].index);
  const stats = { sites: sites.length, surfaces: surfaces.length, lines: [...lineSets.values()].reduce((a, l) => a + l.length, 0), fills: fills.length, surfaceVertices: 0, lineVertices: 0, fillVertices: 0 };
  if (surfaces.length) {
    const parts = surfaces.map(({ s, heading }) => surfaceGeometry(s, heading));
    const geometry = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    const mesh = new THREE.Mesh(geometry, surfaceMaterial());
    mesh.name = 'VectorGround surfaces';
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    group.add(mesh);
    stats.surfaceVertices = geometry.attributes.position.count;
  }
  for (const [layer, lines] of lineSets) {
    const lineGeometry = linesGeometry(lines, { lift: liftOf(layer), colours: coloursOf(layer) });
    if (!lineGeometry) continue;
    const mesh = new THREE.Mesh(lineGeometry, lineMaterial());
    mesh.name = `VectorGround lines ${layer.layer}`;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
    stats.lineVertices += lineGeometry.attributes.position.count;
  }
  const fillGeometry = fillsGeometry(fills, ROAD_COLOURS);
  if (fillGeometry) {
    const mesh = new THREE.Mesh(fillGeometry, fillMaterial());
    mesh.name = 'VectorGround fills';
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
    stats.fillVertices = fillGeometry.attributes.position.count;
  }
  group.userData.stats = stats;
  if (scene) scene.add(group);
  if (region.all) console.info('[vector-ground]', JSON.stringify(stats));
  return {
    group, stats,
    dispose() { group.traverse((o) => o.geometry?.dispose()); group.removeFromParent(); }
  };
}

/** The share (0 … 1) of the rectangle [x0, z0, x1, z1] the layers' surfaces cover */
export function groundCoverage(layers = GROUND_LAYERS) {
  const surfaces = layers.flatMap((l) => l.sites.flatMap((s) => s.surfaces)).filter((s) => !GROUND_KINDS[s.kind]?.lines).map((s) => ({ ...s, bounds: ringBounds(s.ring) }));
  return (rect) => chunkCoverage(surfaces, rect, 4);
}

// --- The road paint, cell by cell near the camera ------------------------------------------------------------------
const MARKINGS_URL = new URL('../data/ground-markings/', import.meta.url);
const ANY = Object.freeze({ all: false, owns: () => true }); // (a cell's paint is all its own)

/**
 * Streams the traced paint (js/ground-markings-data.js cells, data/ground-markings/) round the camera: a cell's file is
 * fetched and built when its square comes within `radius`, a couple at a time, nearest first, and dropped beyond
 * radius + 150 m. Returns { update(position), group, stats }.
 * (On a phone 260 m: three transparent draws a cell, and at its resolution a 15 cm line is gone long before; at 380 m
 * the cells were ~50 draws a frame and 8 MB of vertices. The group is one of js/main.js's STATIC_ROOTS: a cell's
 * arrays leave JavaScript once drawn, nothing reads them again.)
 */
export function streamGroundMarkings(scene, { radius = QUALITY.mobile ? 260 : 750 } = {}) {
  const group = new THREE.Group();
  group.name = 'VectorGroundMarkings';
  group.userData.terrain = 'absolute';
  scene.add(group);
  const live = new Map(); // id -> { ground } | { loading: true }
  const stats = { cells: 0, loads: 0 };
  let loading = 0, last = 0;
  const distance = (box, p) => Math.hypot(Math.max(box[0] - p.x, 0, p.x - box[2]), Math.max(box[1] - p.z, 0, p.z - box[3]));
  return {
    group, stats,
    update(p) {
      const now = performance.now();
      if (now - last < 400) return;
      last = now;
      for (const [id, cell] of live) {
        if (cell.ground && distance(cell.box, p) > radius + 150) { cell.ground.dispose(); live.delete(id); stats.cells--; }
      }
      const wanted = GROUND_MARKINGS.cells.filter((c) => !live.has(c.id) && distance(c.box, p) < radius).sort((a, b) => distance(a.box, p) - distance(b.box, p));
      for (const c of wanted) {
        if (loading >= 2) break;
        loading++;
        const entry = { box: c.box, loading: true };
        live.set(c.id, entry);
        fetch(new URL(`${c.id}.json`, MARKINGS_URL))
          .then((res) => (res.ok ? res.json() : null))
          .then((file) => {
            if (!file || live.get(c.id) !== entry) { if (!file) live.set(c.id, { box: c.box, ground: { dispose() {} } }); return; }
            const site = decodeMarkingsCell(c.id, file);
            const ground = buildVectorGround(null, { layers: [{ layer: 'markings', sites: [site] }], region: ANY });
            group.add(ground.group);
            entry.ground = ground; entry.loading = false;
            stats.cells++; stats.loads++;
          })
          .catch((error) => { console.warn('[vector-ground] markings', c.id, error); live.delete(c.id); })
          .finally(() => { loading--; });
      }
    }
  };
}
