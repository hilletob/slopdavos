import * as THREE from 'three/webgpu';
import { abs, attribute, cos, dot, float, fract, max, min, mix, mx_noise_float, positionLocal, positionWorld, sin, smoothstep, step, time, vec2, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GOLF } from './golf-data.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { STREAMS } from './streams-data.js';
import { PARKING_DATA } from './parking-data.js';
import { TLM_TREES } from './tlm-trees-data.js';
import { drapeOverlay, groundHeight, TERRAIN } from './terrain.js';
import { winter } from './season.js';
import { boxInWorld } from './quality.js';

// The Golf Club Davos (js/golf-data.js from OSM: the 18-hole par-69 course on the valley floor between Dorf and Platz,
// along the Landwasser) as it looks in summer: the rough a little darker and lusher over the whole course, the fairways
// mown in broad light and dark stripes along their holes, the greens short and saturated in a fine cross-cut with a
// collar of fringe and a flag in every hole, the tees in fine stripes with their markers, raked bunkers of pale sand
// under a sod lip, the water hazards the lakes don't already draw, and the driving range in wide bands.
// All playing areas are one mesh draped on the terrain (a per-vertex `kind`, the distance to the area's edge and the
// mowing direction drive one TSL material), drawn in order (rough, fairway, green, tee, bunker, water, range) so that
// later kinds lie over earlier ones without depth fighting; the pins and the tee markers are two instanced meshes.
// In winter (season.js `winter`) the course lies under snow, where the Loipen run: the overlays fade out into the
// snowy ground and the flags and markers are taken in.

const KIND = Object.fromEntries(GOLF.kinds.map((k, i) => [k, i])); // rough 0, fairway 1, green 2, tee 3, bunker 4, water 5, range 6
const MAX_EDGE = { rough: 4, fairway: 4, green: 2, tee: 2, bunker: 1.5, water: 3, range: 4 };
const LIFT = 0.05; // above the ground (the roads' tops lie at 0.11: they stay over the course)

// --- 2D helpers -----------------------------------------------------------------------------------------------------
const pip = (ring, x, z) => {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const ringDist = (ring, x, z) => {
  let d = Infinity;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) d = Math.min(d, segDist(x, z, ring[j], ring[j + 1], ring[i], ring[i + 1]));
  return d;
};
const centroid = (ring) => { let x = 0, z = 0; for (let i = 0; i < ring.length; i += 2) { x += ring[i]; z += ring[i + 1]; } return [x / (ring.length / 2), z / (ring.length / 2)]; };
const bbox = (ring) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < ring.length; i += 2) { b[0] = Math.min(b[0], ring[i]); b[1] = Math.min(b[1], ring[i + 1]); b[2] = Math.max(b[2], ring[i]); b[3] = Math.max(b[3], ring[i + 1]); }
  return b;
};

// Splits a convex polygon [[u, v], …] along the line fu·u + fv·v = k into the parts on either side
function splitConvex(poly, fu, fv, k) {
  const s = poly.map(([u, v]) => fu * u + fv * v - k);
  if (s.every((d) => d >= -1e-9) || s.every((d) => d <= 1e-9)) return [poly];
  const a = [], b = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length, p = poly[i], q = poly[j];
    if (s[i] >= 0) a.push(p);
    if (s[i] <= 0) b.push(p);
    if ((s[i] > 0 && s[j] < 0) || (s[i] < 0 && s[j] > 0)) {
      const t = s[i] / (s[i] - s[j]), x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      a.push(x); b.push(x);
    }
  }
  return [a, b].filter((p) => p.length >= 3);
}

// Flat triangulated polygon in the x/z plane (y = 0), facing up, cut along the terrain grid's cell edges and diagonals
// (terrain-grid.js gridHeight): every piece then lies within one of the terrain's planar triangles, so that the draped
// overlay follows the relief exactly (no chords sagging into the ground over the mounds of greens and tees)
function polygonGeometry(ring) {
  const { minX, minZ, cell } = TERRAIN;
  const contour = [];
  for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i], ring[i + 1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = [];
  for (const [a, b, c] of tris) {
    // (counter-clockwise seen from above: with z pointing south that is clockwise in x/z)
    const p = [contour[a], contour[b], contour[c]];
    const cross = (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[1].y - p[0].y) * (p[2].x - p[0].x);
    if (cross > 0) p.reverse();
    // in grid units u, v; the cell edges u = k, v = k and the diagonals u − v = k
    const tri = p.map((q) => [(q.x - minX) / cell, (q.y - minZ) / cell]);
    let pieces = [tri];
    for (const [fu, fv] of [[1, 0], [0, 1], [1, -1]]) {
      const s = tri.map(([u, v]) => fu * u + fv * v);
      for (let k = Math.ceil(Math.min(...s)); k <= Math.floor(Math.max(...s)); k++) pieces = pieces.flatMap((q) => splitConvex(q, fu, fv, k));
    }
    for (const q of pieces) for (let i = 1; i + 1 < q.length; i++) {
      for (const [u, v] of [q[0], q[i], q[i + 1]]) pos.push(minX + u * cell, 0, minZ + v * cell);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// --- What the rough must leave alone: the roads and paths, the buildings, the water, the car parks, the woods --------
function roughClearance(bounds) {
  const [x0, z0, x1, z1] = [bounds[0] - 30, bounds[1] - 30, bounds[2] + 30, bounds[3] + 30];
  const near = (b) => b[2] >= x0 && b[0] <= x1 && b[3] >= z0 && b[1] <= z1;
  const CELL = 16, grid = new Map();
  const add = (item, b) => {
    for (let gx = Math.floor(b[0] / CELL); gx <= Math.floor(b[2] / CELL); gx++) for (let gz = Math.floor(b[1] / CELL); gz <= Math.floor(b[3] / CELL); gz++) {
      const k = gx * 100003 + gz;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(item);
    }
  };
  const lines = (pts, half) => {
    for (let i = 2; i < pts.length; i += 2) {
      const s = [pts[i - 2], pts[i - 1], pts[i], pts[i + 1]], m = half + 4;
      const b = [Math.min(s[0], s[2]) - m, Math.min(s[1], s[3]) - m, Math.max(s[0], s[2]) + m, Math.max(s[1], s[3]) + m];
      if (near(b)) add({ seg: s, half }, b);
    }
  };
  const areas = (ring, holes = []) => { const b = bbox(ring); if (near(b)) add({ ring, holes }, [b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4]); };
  for (const r of DAVOS_DATA.roads) if (!r.tunnel) lines(r.pts, (r.width || 4) / 2 + 0.3);
  for (const s of STREAMS.streams || []) lines(s.pts, s.width / 2 + 0.8);
  for (const b of DAVOS_DATA.buildings) areas(b.ring);
  for (const w of DAVOS_DATA.water) areas(w.ring);
  for (const p of PARKING_DATA || []) areas(p.ring);
  for (const a of TLM_TREES?.areas || []) if (a.kind === 'forest' || a.kind === 'woody') areas(a.rings[0], a.rings.slice(1)); // (with its clearings)
  // Clearance in metres (0 inside or on a feature) of a point
  return (x, z) => {
    let d = 4;
    for (const it of grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || []) {
      if (it.seg) d = Math.min(d, segDist(x, z, ...it.seg) - it.half);
      else if (pip(it.ring, x, z) && !it.holes.some((h) => pip(h, x, z))) return 0;
      else d = Math.min(d, ringDist(it.ring, x, z), ...it.holes.map((h) => ringDist(h, x, z)));
      if (d <= 0) return 0;
    }
    return d;
  };
}

// The mowing direction of an area: along the nearest hole line
function mowDirection(ring) {
  const [cx, cz] = centroid(ring);
  let best = null;
  for (const h of GOLF.holes) for (let i = 2; i < h.pts.length; i += 2) {
    const d = segDist(cx, cz, h.pts[i - 2], h.pts[i - 1], h.pts[i], h.pts[i + 1]);
    if (!best || d < best.d) best = { d, dx: h.pts[i] - h.pts[i - 2], dz: h.pts[i + 1] - h.pts[i - 1] };
  }
  if (!best || best.d > 120) return [1, 0];
  const L = Math.hypot(best.dx, best.dz) || 1;
  return [best.dx / L, best.dz / L];
}

function buildSurfaceGeometry() {
  const parts = [];
  const outlineBounds = GOLF.outline.map(bbox).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const clearance = roughClearance(outlineBounds);
  const surfaces = [
    ...GOLF.outline.map((ring) => ({ kind: 'rough', ring })),
    ...GOLF.areas.filter((a) => !a.drawn) // (the ponds the lakes already draw stay theirs)
  ];
  for (const s of surfaces) {
    const [x0, z0, x1, z1] = bbox(s.ring);
    if (!boxInWorld(x0, x1, z0, z1)) continue; // (the mobile profile: only near the start, js/quality.js worldRadius)
    const flat = polygonGeometry(s.ring);
    const g = drapeOverlay(flat, { maxEdge: MAX_EDGE[s.kind], lift: LIFT });
    flat.dispose();
    const p = g.attributes.position, n = p.count;
    const kind = new Float32Array(n).fill(KIND[s.kind]), edge = new Float32Array(n), mow = new Float32Array(n * 2), mask = new Float32Array(n).fill(1);
    const [dx, dz] = mowDirection(s.ring);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), z = p.getZ(i);
      edge[i] = Math.min(ringDist(s.ring, x, z), 30);
      mow[2 * i] = dx; mow[2 * i + 1] = dz;
      if (s.kind === 'rough') mask[i] = Math.min(1, clearance(x, z) / 2.5);
    }
    g.setAttribute('golfKind', new THREE.BufferAttribute(kind, 1));
    g.setAttribute('golfEdge', new THREE.BufferAttribute(edge, 1));
    g.setAttribute('golfMow', new THREE.BufferAttribute(mow, 2));
    g.setAttribute('golfMask', new THREE.BufferAttribute(mask, 1));
    parts.push(g);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

// --- The turf, sand and water material --------------------------------------------------------------------------------
function createSurfaceMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const kind = attribute('golfKind', 'float'), edge = attribute('golfEdge', 'float'), mask = attribute('golfMask', 'float');
  const dir = attribute('golfMow', 'vec2');
  const is = (k) => step(abs(kind.sub(k)), float(0.5));
  const p = positionWorld.xz;
  const along = dot(p, dir), across = dot(p, vec2(dir.y.negate(), dir.x));
  // Mown stripes: a soft square wave of the given width (the mower's passes, light where mown away from the eye)
  const stripes = (coord, width, soft = 0.15) => smoothstep(0.5 - soft, 0.5 + soft, abs(fract(coord.div(width * 2)).sub(0.5)).mul(2));
  const blotch = mx_noise_float(p.mul(0.05)).mul(0.5).add(0.5); // patches of slightly drier / lusher turf
  const fine = mx_noise_float(p.mul(1.7)).mul(0.5).add(0.5); // grain

  // Rough: longer, darker grass, uneven
  const roughCol = mix(vec3(0.04, 0.1, 0.022), vec3(0.065, 0.145, 0.032), blotch.mul(0.7).add(fine.mul(0.3)));
  // Fairway: 9 m passes along the hole, a 1.5 m first cut of the rough along its edges
  const fairStripe = stripes(across, 9);
  const fairBase = mix(vec3(0.06, 0.18, 0.03), vec3(0.085, 0.225, 0.042), fairStripe);
  const fairCol = mix(mix(roughCol, fairBase, 0.65), fairBase.mul(fine.mul(0.08).add(0.96)), smoothstep(1.2, 1.8, edge));
  // Green: 1.2 m passes in two directions (a fine checkerboard), very short and saturated; the fringe a 1 m collar
  const checker = abs(stripes(across, 1.2, 0.06).sub(stripes(along, 1.2, 0.06)));
  const greenCol = mix(vec3(0.046, 0.195, 0.028), vec3(0.053, 0.212, 0.032), checker).mul(fine.mul(0.06).add(0.97));
  const fringe = mix(vec3(0.055, 0.16, 0.03), vec3(0.065, 0.18, 0.034), stripes(across, 0.8));
  const greenAll = mix(fringe, greenCol, smoothstep(0.9, 1.2, edge));
  // Tee: fine stripes across the hole
  const teeCol = mix(vec3(0.048, 0.19, 0.03), vec3(0.064, 0.225, 0.037), stripes(along, 1.2));
  // Bunker: pale sand, raked in fine furrows along the hole; a dark sod lip and a sloping face along the edge
  const rake = smoothstep(0.2, 0.8, abs(fract(across.div(0.12)).sub(0.5)).mul(2)).mul(0.06);
  const sand = mix(vec3(0.6, 0.5, 0.33), vec3(0.7, 0.6, 0.42), fine.mul(0.6).add(blotch.mul(0.4))).mul(float(1).sub(rake));
  const lip = smoothstep(0.35, 0.05, edge);
  const bunkerCol = mix(mix(sand.mul(0.82), sand, smoothstep(0.2, 1.5, edge)), vec3(0.05, 0.12, 0.03), lip);
  // Water hazard: still, dark green-brown pond water
  const waterCol = mix(vec3(0.015, 0.04, 0.035), vec3(0.03, 0.07, 0.06), blotch);
  // Driving range: broad 12 m bands
  const rangeCol = mix(vec3(0.07, 0.19, 0.035), vec3(0.09, 0.225, 0.045), stripes(across, 12));

  let col = roughCol;
  col = mix(col, fairCol, is(1));
  col = mix(col, greenAll, is(2));
  col = mix(col, teeCol, is(3));
  col = mix(col, bunkerCol, is(4));
  col = mix(col, waterCol, is(5));
  col = mix(col, rangeCol, is(6));
  m.colorNode = col;
  m.roughnessNode = mix(mix(float(0.95), float(0.8), is(1).add(is(2)).add(is(3)).add(is(6))), float(0.12), is(5));
  // Opacity: the rough a tint over the orthophoto (thinning out towards the course's edge and around what it must leave
  // alone), the playing areas whole with a soft edge; nothing in winter (the course lies under the snow)
  const roughAlpha = mask.mul(smoothstep(0, 6, edge)).mul(0.88);
  const areaAlpha = smoothstep(0, 0.6, edge).max(is(4)); // (the bunker draws its own lip)
  const alpha = mix(roughAlpha, areaAlpha, min(kind, 1));
  m.opacityNode = alpha.mul(float(1).sub(winter));
  return m;
}

// --- Flags in the holes, markers on the tees ---------------------------------------------------------------------------
// One geometry: the white pole (2.1 m), the flag (yellow, 50 × 35 cm, swaying in the wind), the cup's white liner
// and its dark hole. `color` per vertex, `sway` 0 on the pole … 1 at the flag's free end.
function pinGeometry() {
  const parts = [];
  const colour = (g, c, sway = () => 0) => {
    const n = g.attributes.position.count, col = new Float32Array(n * 3), sw = new Float32Array(n);
    for (let i = 0; i < n; i++) { col.set(c, i * 3); sw[i] = sway(g.attributes.position.getX(i), g.attributes.position.getY(i)); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'sway'].includes(k)) g.deleteAttribute(k);
    return g;
  };
  const pole = new THREE.CylinderGeometry(0.018, 0.018, 2.1, 6);
  pole.translate(0, 1.05, 0);
  parts.push(colour(pole, [0.85, 0.85, 0.82]));
  const flag = new THREE.PlaneGeometry(0.5, 0.35, 4, 1);
  flag.translate(0.25 + 0.018, 2.1 - 0.175, 0);
  parts.push(colour(flag, [0.9, 0.62, 0.02], (x) => Math.max(0, x - 0.018) / 0.5));
  const liner = new THREE.RingGeometry(0.054, 0.075, 16);
  liner.rotateX(-Math.PI / 2); liner.translate(0, 0.012, 0);
  parts.push(colour(liner, [0.8, 0.8, 0.78]));
  const cup = new THREE.CircleGeometry(0.054, 16);
  cup.rotateX(-Math.PI / 2); cup.translate(0, 0.012, 0);
  parts.push(colour(cup, [0.01, 0.01, 0.01]));
  return mergeGeometries(parts, false);
}

function createPinMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  m.colorNode = attribute('color', 'vec3');
  const sway = attribute('sway', 'float');
  // (a flutter running down the flag, stronger towards its free end)
  const wave = sin(time.mul(5.3).sub(positionLocal.x.mul(9)).add(positionWorld.x.mul(0.1))).mul(0.045).add(cos(time.mul(2.1)).mul(0.03));
  const swayed = positionLocal.add(vec3(0, 0, wave.mul(sway)));
  m.positionNode = swayed.mul(float(1).sub(winter)); // (taken in for the winter)
  return m;
}

function buildPins() {
  const sites = GOLF.holes.filter((h) => h.pin).map((h) => ({ x: h.pin[0], z: h.pin[1] }));
  if (!sites.length) return null;
  const mesh = new THREE.InstancedMesh(pinGeometry(), createPinMaterial(), sites.length);
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  // (the flags all fly with the valley wind, up the valley towards the north-east)
  sites.forEach((s, i) => mesh.setMatrixAt(i, mat.compose(new THREE.Vector3(s.x, groundHeight(s.x, s.z) + LIFT, s.z), q.setFromAxisAngle(up, Math.PI * 0.75 + ((i * 0.37) % 0.3)), one)));
  mesh.name = 'Golf pins';
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// Tee markers: a pair of balls (yellow on the men's tees, red on the ladies', by size order on each hole) across the tee
function buildTeeMarkers() {
  const tees = GOLF.areas.filter((a) => a.kind === 'tee');
  if (!tees.length) return null;
  const sites = [];
  for (const t of tees) {
    const [cx, cz] = centroid(t.ring), [dx, dz] = mowDirection(t.ring);
    if (!pip(t.ring, cx, cz)) continue;
    const red = ((Math.round(cx * 7 + cz * 13) % 3) + 3) % 3 === 0;
    for (const side of [-1.6, 1.6]) {
      const x = cx - dz * side, z = cz + dx * side;
      if (pip(t.ring, x, z)) sites.push({ x, z, colour: red ? [0.7, 0.04, 0.03] : [0.9, 0.7, 0.03] });
    }
  }
  const geometry = new THREE.SphereGeometry(0.09, 10, 6);
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0 });
  material.positionNode = positionLocal.mul(float(1).sub(winter));
  const mesh = new THREE.InstancedMesh(geometry, material, sites.length);
  const mat = new THREE.Matrix4(), c = new THREE.Color();
  sites.forEach((s, i) => {
    mesh.setMatrixAt(i, mat.makeTranslation(s.x, groundHeight(s.x, s.z) + LIFT + 0.07, s.z));
    mesh.setColorAt(i, c.setRGB(...s.colour));
  });
  mesh.name = 'Golf tee markers';
  mesh.castShadow = true;
  return mesh;
}

export function buildGolf(scene) {
  const group = new THREE.Group();
  group.name = 'Golf Club Davos';
  group.userData.terrain = 'absolute'; // draped above
  const geometry = buildSurfaceGeometry();
  if (geometry) {
    const mesh = new THREE.Mesh(geometry, createSurfaceMaterial());
    mesh.name = 'Golf course';
    mesh.receiveShadow = true;
    mesh.renderOrder = 1; // (under the Loipen, which run across the course in winter)
    group.add(mesh);
  }
  const pins = buildPins();
  if (pins) group.add(pins);
  const markers = buildTeeMarkers();
  if (markers) group.add(markers);
  const count = (k) => GOLF.areas.filter((a) => a.kind === k).length;
  group.userData.stats = { holes: GOLF.holes.length, pins: pins?.count || 0, teeMarkers: markers?.count || 0, fairways: count('fairway'), greens: count('green'), tees: count('tee'), bunkers: count('bunker'), triangles: geometry ? geometry.attributes.position.count / 3 : 0 };
  console.info('[golf]', JSON.stringify(group.userData.stats));
  scene.add(group);
  return group;
}
