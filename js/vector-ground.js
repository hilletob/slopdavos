import * as THREE from 'three/webgpu';
import { attribute, float, mx_noise_float, normalize, positionWorld, smoothstep } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { polygonGeometry } from './golf.js';
import { drapeOverlay } from './terrain.js';
import { createRoadPaintMaterial } from './tsl-materials.js';
import { snowyGround, snowyStreet, winter } from './season.js';
import { QUALITY, worldRegion } from './quality.js';
import { GROUND_KINDS, groundKindNodes } from './ground-kinds.js';
import { strokePolyline, linePoints, ringDistance, ringBounds, chunkCoverage } from './ground-geometry.js';
import { GROUND_SPORTS } from './ground-sports-data.js';
import { GROUND_MARKINGS } from './ground-markings-data.js';

// js/vector-ground.js — the vector ground: what must be sharp on the ground drawn as draped vectors over the orthophoto
// instead of left to its pixels (0.5 m in the valley, ~1 m on the phone, where the lanes of a track and the lines of a
// pitch blur away). Surfaces with a ground kind (js/ground-kinds.js: tartan, turf, clay …) and painted lines, traced
// from the full-resolution SWISSIMAGE by tools/trace-ground.mjs into one data file per layer (js/ground-sports-data.js:
// the sports grounds; js/ground-markings-data.js: the paint on the roads, whose strokes and filled shapes (arrows,
// lettering) replace the rule-based markings where traced, js/ground-markings-area.js). One mesh of surfaces (one procedural material, the kind per vertex) and one of lines (the road
// paint's material and attributes, js/parking.js bayLines) per region: the whole map on the desktop, a 500 m cell of
// js/world-stream.js on the phone. In winter the surfaces lie under the same snow as the photo (season.js snowyGround)
// and the lines only show through faintly (snowyStreet paint).
// Heights: the road paint 0.13 (over the streets' asphalt, as js/city-grid.js paints it) > the streets' tops 0.11 >
// the lines 0.085 (as the car parks' bays) > the surfaces 0.06 (as the car parks'
// asphalt) > the golf course 0.05.
// groundCoverage(): the share of a rectangle the surfaces cover, for the orthophoto loader (js/swissimage.js), which
// can leave out the photo of a chunk the vector ground covers whole (not yet: QUALITY.orthoSkipCoverage).

export const GROUND_LAYERS = [GROUND_SPORTS, GROUND_MARKINGS];
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

function surfaceGeometry(s, heading) {
  const flat = polygonGeometry(s.ring, s.holes || []);
  const g = drapeOverlay(flat, { maxEdge: SURFACE_EDGE, lift: SURFACE_LIFT });
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
