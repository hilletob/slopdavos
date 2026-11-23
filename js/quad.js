import * as THREE from 'three/webgpu';
import { attribute, uniform, mix } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// js/quad.js
// The quad: a utility ATV (2.25 m long, 1.13 m wide, the seat 0.85 m up) with racks, a rear cage and a bull bar.
// Its body, bars and wheel are real meshes, assets/models/quad.glb (tools/build-quad.mjs), from
//   "One-Piece Military Quad Bike "AM-1" – Print in Place, No Assembly" by qMeats,
//   https://www.printables.com/model/1748892-one-piece-military-quad-bike-am-1-print-in-place-n,
//   published as Creative Commons Public Domain (CC0 1.0): wheels and bars cut off, rescaled, simplified, coloured.
// The GLB is fetched when this module loads; until it is there (or if it fails) the quad is the procedural one below:
// side profiles extruded across the width with rounded edges (nose, tank, seat, tail, mudguards), lathed tyres with
// knobs, and tubes (racks, bull bar, wishbones, shocks, bars). Quads made before it arrives get its geometry then.
// Origin on the ground under the middle of the wheelbase, z forward, y up.
// One material (createQuadMaterial) paints all of it from two vertex attributes: `color`, and `surf` = (paint: the
// body colour's share, taken from the material's `paint` uniform, so that one geometry serves every colour; roughness;
// headlamp lens; tail lamp lens). The lenses glow with the material's `head` and `tail` uniforms: the driven quad's
// lamps at night, the tail lamp brighter under the brake (setQuadLamps).
// Used by the mission's quad (js/missions-rural.js, on js/missions-work.js workVehicle), its race ghosts
// (js/race-ghosts.js) and the quads standing about the valley that the player gets onto (js/gta-quads.js).
//   createQuad(paint)        the driven one: body, the bars (turning with the steering) and four wheels, six meshes
//   createParkedQuad(look)   one standing: a single mesh

/** The measures the game drives it by (js/controllers.js car.dims, the chase camera, the headlamps' spots) */
export const QUAD_MODEL = {
  wheelRadius: 0.305,
  wheelX: 0.4386,
  wheelZ: 0.67,
  dims: { halfW: 0.6, halfL: 1.13, top: 1.25, mass: 340 },
  chase: [5.8, 2.3],
  // (js/vehicle-lights.js placeVehicleHeadlight: the lamps' |x| and y, the nose)
  lights: { headlight: [0.29, 0.685], zFront: 0.97 },
  // the bars turn about this point (the rider's hands follow: js/pedestrians.js PersonRig.ride)
  steerPivot: new THREE.Vector3(0, 0.93, 0.27),
  // the rider: PersonRig.ride's frame (no cranks: both feet on the footboards)
  seat: {
    seat: new THREE.Vector3(0, 0.805, -0.17), bars: new THREE.Vector3(0, 1.0, 0.28), gripHalf: 0.27,
    bracket: new THREE.Vector3(0, 0.39, 0.05), crankLength: 0, pedalHalf: 0.38, lean: 0.2
  }
};
/** The colours they come in (the first: the mission's) */
export const QUAD_PAINTS = [0xd9601a, 0xb3202a, 0x2f6d3a, 0xd8b21c, 0x2c4f8f];

const R = QUAD_MODEL.wheelRadius, WX = QUAD_MODEL.wheelX, WZ = QUAD_MODEL.wheelZ;
const BLACK = 0x17181a, PLASTIC = 0x232528, STEEL = 0x7b8085, ALU = 0xb9bcbd, SEAT = 0x121315;

// --- Geometry helpers -------------------------------------------------------------------------------------------------
/** A part: non-indexed position + normal, with its colour and surface (paint share, roughness, head / tail lens) */
function part(geometry, hex, { paint = 0, rough = 0.6, head = 0, tail = 0 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  const n = g.attributes.position.count, c = new THREE.Color(hex);
  const color = new Float32Array(n * 3), surf = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
    surf[i * 4] = paint; surf[i * 4 + 1] = rough; surf[i * 4 + 2] = head; surf[i * 4 + 3] = tail;
  }
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(surf, 4));
  return g;
}
const box = (w, h, l, x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.BoxGeometry(w, h, l).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
/** A round tube from a to b ([x, y, z]) */
function tube(a, b, r, seg = 7) {
  _a.fromArray(a); _b.fromArray(b);
  const len = _a.distanceTo(_b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  _q.setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
  g.applyMatrix4(_m.compose(_a.clone().add(_b).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1)));
  return g;
}
/** A closed run of tubes through the points */
const loop = (pts, r) => pts.map((p, i) => tube(p, pts[(i + 1) % pts.length], r));
/** A side profile (a THREE.Shape in (z, y)) extruded across the width from x0 to x1, its edges rounded by `bevel` */
function slab(shape, x0, x1, bevel = 0.03, curveSegments = 10) {
  const depth = x1 - x0 - 2 * bevel;
  const g = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, curveSegments, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2 });
  return g.rotateY(-Math.PI / 2).translate(x1 - bevel, 0, 0); // (the shape's x: forward; its depth: across)
}
/** A smooth closed outline through the points [[z, y], ...] */
function outline(points) {
  const s = new THREE.Shape();
  const curve = new THREE.CatmullRomCurve3(points.map(([z, y]) => new THREE.Vector3(z, y, 0)), true, 'catmullrom', 0.35);
  const pts = curve.getPoints(points.length * 5);
  s.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) s.lineTo(pts[i].x, pts[i].y);
  s.closePath();
  return s;
}
/** A band round a wheel at (cz, cy): from angle a0 to a1 (0: forward, 90°: up), between the radii r0 and r1 */
function band(cz, cy, r0, r1, a0, a1) {
  const s = new THREE.Shape(), d = Math.PI / 180;
  s.absarc(cz, cy, r1, a0 * d, a1 * d, false);
  s.absarc(cz, cy, r0, a1 * d, a0 * d, true);
  s.closePath();
  return s;
}
const mirrored = (make) => [make(1), make(-1)];

// --- The parts ----------------------------------------------------------------------------------------------------------
function bodyParts() {
  const p = [];
  const paint = { paint: 1, rough: 0.34 }, plastic = { rough: 0.78 }, metal = { rough: 0.42 };

  // the bodywork, painted: the nose and tank, the tail under the seat
  p.push(part(slab(outline([[1.0, 0.56], [1.02, 0.7], [0.9, 0.79], [0.62, 0.86], [0.4, 0.95], [0.18, 0.96], [0.04, 0.88], [0.02, 0.62], [0.3, 0.5], [0.8, 0.5]]), -0.3, 0.3, 0.05), 0xffffff, paint));
  p.push(part(slab(outline([[0.04, 0.6], [0.04, 0.8], [-0.4, 0.8], [-0.8, 0.84], [-1.0, 0.82], [-1.03, 0.72], [-0.86, 0.6], [-0.4, 0.52]]), -0.27, 0.27, 0.05), 0xffffff, paint));
  // the seat
  p.push(part(slab(outline([[0.07, 0.84], [0.02, 0.91], [-0.2, 0.895], [-0.46, 0.9], [-0.64, 0.945], [-0.72, 0.9], [-0.66, 0.8], [-0.2, 0.78]]), -0.19, 0.19, 0.06), SEAT, { rough: 0.92 }));
  // the mudguards (painted) with their black flares, the footboards between them
  for (const side of [1, -1]) {
    const x0 = side > 0 ? 0.26 : -0.66, x1 = side > 0 ? 0.66 : -0.26;
    const f0 = side > 0 ? 0.64 : -0.69, f1 = side > 0 ? 0.69 : -0.64;
    p.push(part(slab(band(WZ, R, R + 0.085, R + 0.125, 8, 158), x0, x1, 0.016, 14), 0xffffff, paint));
    p.push(part(slab(band(-WZ, R, R + 0.085, R + 0.125, 22, 176), x0, x1, 0.016, 14), 0xffffff, paint));
    p.push(part(slab(band(WZ, R, R + 0.06, R + 0.14, 4, 162), f0, f1, 0.012, 14), PLASTIC, plastic));
    p.push(part(slab(band(-WZ, R, R + 0.06, R + 0.14, 18, 180), f0, f1, 0.012, 14), PLASTIC, plastic));
    p.push(part(box(0.38, 0.035, 0.6, side * 0.46, 0.335, 0), PLASTIC, plastic));
    p.push(part(box(0.03, 0.09, 0.6, side * 0.655, 0.37, 0), PLASTIC, plastic));
    for (const z of [-0.2, -0.07, 0.06, 0.19]) p.push(part(box(0.3, 0.012, 0.03, side * 0.46, 0.358, z), BLACK, plastic)); // (the boards' ribs)
    // the side panel between the tank and the footboard
    p.push(part(box(0.03, 0.26, 0.5, side * 0.275, 0.5, 0.0), PLASTIC, plastic));
  }

  // the frame, the engine with its fins, the skid plate, the exhaust
  p.push(part(box(0.42, 0.2, 1.5, 0, 0.36, 0), BLACK, plastic));
  p.push(part(box(0.5, 0.025, 1.7, 0, 0.245, 0), STEEL, metal));
  p.push(part(box(0.5, 0.2, 0.42, 0, 0.47, -0.02), STEEL, metal));
  for (const y of [0.42, 0.47, 0.52]) p.push(part(box(0.54, 0.014, 0.3, 0, y, -0.02), 0x5a5e62, metal));
  p.push(part(tube([0.2, 0.52, -0.5], [0.2, 0.6, -1.02], 0.06, 12), 0x8e9296, { rough: 0.3 }));
  p.push(part(tube([0.2, 0.6, -1.02], [0.2, 0.605, -1.07], 0.035, 10), BLACK, plastic));
  p.push(part(tube([0.2, 0.48, -0.1], [0.2, 0.52, -0.5], 0.028), 0x6a6e72, metal));

  // the wishbones, the axles and the shocks with their springs
  for (const side of [1, -1]) {
    for (const z of [WZ, -WZ]) {
      p.push(part(tube([side * 0.16, 0.3, z + 0.14], [side * 0.4, R - 0.04, z], 0.018), BLACK, metal));
      p.push(part(tube([side * 0.16, 0.3, z - 0.14], [side * 0.4, R - 0.04, z], 0.018), BLACK, metal));
      p.push(part(tube([side * 0.1, R, z], [side * 0.4, R, z], 0.022), STEEL, metal));
      p.push(part(tube([side * 0.2, 0.68, z * 0.92], [side * 0.36, R + 0.02, z], 0.014), ALU, metal));
      p.push(part(tube([side * 0.215, 0.65, z * 0.925], [side * 0.33, R + 0.1, z * 0.985], 0.034, 9), 0xc8281e, { rough: 0.5 }));
    }
  }

  // the nose: a dark grille between the two headlamps (bezel and lens), the bull bar
  p.push(part(box(0.2, 0.09, 0.02, 0, 0.665, 1.012), BLACK, plastic));
  for (const y of [0.64, 0.665, 0.69]) p.push(part(box(0.18, 0.008, 0.026, 0, y, 1.012), 0x3a3d40, plastic));
  for (const side of [1, -1]) {
    p.push(part(box(0.17, 0.105, 0.02, side * 0.19, 0.665, 1.012), BLACK, plastic));
    p.push(part(box(0.14, 0.075, 0.03, side * 0.19, 0.665, 1.016), 0xfff4d2, { rough: 0.2, head: 1 }));
  }
  const bar = [[0.24, 0.34, 1.02], [0.26, 0.56, 1.1], [-0.26, 0.56, 1.1], [-0.24, 0.34, 1.02]];
  for (const g of loop(bar, 0.02)) p.push(part(g, BLACK, metal));
  p.push(part(tube([0.26, 0.45, 1.06], [-0.26, 0.45, 1.06], 0.016), BLACK, metal));
  for (const side of [1, -1]) p.push(part(tube([side * 0.24, 0.34, 1.02], [side * 0.2, 0.34, 0.8], 0.02), BLACK, metal));
  p.push(part(box(0.1, 0.08, 0.1, 0, 0.42, 1.0), 0x34373a, metal)); // (the winch)

  // the racks: front over the nose, rear behind the seat, each a frame of tube with slats on four posts
  const rack = (z0, z1, y, half, back) => {
    for (const g of loop([[half, y, z0], [half, y, z1], [-half, y, z1], [-half, y, z0]], 0.014)) p.push(part(g, BLACK, metal));
    for (const x of [-half * 0.5, 0, half * 0.5]) p.push(part(tube([x, y, z0], [x, y, z1], 0.011), BLACK, metal));
    for (const side of [1, -1]) for (const z of [z0 + 0.06, z1 - 0.06]) p.push(part(tube([side * half * 0.8, y, z], [side * half * 0.62, y - 0.13, z], 0.012), BLACK, metal));
    if (back) for (const g of [tube([half, y, back], [half, y + 0.09, back], 0.012), tube([-half, y, back], [-half, y + 0.09, back], 0.012), tube([half, y + 0.09, back], [-half, y + 0.09, back], 0.012)]) p.push(part(g, BLACK, metal));
  };
  rack(0.56, 1.0, 0.945, 0.36, 0);
  rack(-1.06, -0.72, 0.925, 0.38, -1.06);

  // the tail: the lamp, two reflectors, the plate on its holder, the hitch
  p.push(part(box(0.22, 0.05, 0.03, 0, 0.745, -1.03), 0xd21a14, { rough: 0.25, tail: 1 }));
  for (const side of [1, -1]) p.push(part(box(0.05, 0.035, 0.012, side * 0.46, 0.5, -1.055, 0, 0, 0), 0xc0241c, { rough: 0.3 }));
  p.push(part(box(0.2, 0.16, 0.012, 0, 0.6, -1.06, 0.12), BLACK, plastic));
  p.push(part(box(0.18, 0.14, 0.012, 0, 0.6, -1.068, 0.12), 0xf2f2ee, { rough: 0.45 }));
  p.push(part(box(0.06, 0.05, 0.12, 0, 0.3, -1.0), STEEL, metal));
  p.push(part(new THREE.SphereGeometry(0.028, 8, 6).translate(0, 0.35, -1.05), ALU, { rough: 0.25 }));
  // the steering column's foot under the bars
  p.push(part(tube([0, 0.62, 0.42], [0, 0.94, 0.31], 0.024), BLACK, metal));
  return p;
}

/** The bars with their column, grips, levers, the instrument pod and its lamp: about QUAD_MODEL.steerPivot */
function steerParts() {
  const p = [], metal = { rough: 0.42 }, plastic = { rough: 0.8 };
  p.push(part(tube([0, 0.9, 0.32], [0, 1.1, 0.27], 0.022), BLACK, metal));
  // the bar: a clamp in the middle, rising to the grips
  p.push(part(tube([-0.1, 1.1, 0.27], [0.1, 1.1, 0.27], 0.018), ALU, metal));
  for (const side of [1, -1]) {
    p.push(part(tube([side * 0.1, 1.1, 0.27], [side * 0.2, 1.15, 0.24], 0.016), ALU, metal));
    p.push(part(tube([side * 0.2, 1.15, 0.24], [side * 0.25, 1.15, 0.235], 0.016), ALU, metal));
    p.push(part(tube([side * 0.25, 1.15, 0.235], [side * 0.37, 1.15, 0.225], 0.021, 8), BLACK, { rough: 0.95 }));
    p.push(part(tube([side * 0.24, 1.15, 0.27], [side * 0.36, 1.14, 0.3], 0.007, 5), ALU, metal)); // (the lever)
    p.push(part(box(0.04, 0.045, 0.05, side * 0.23, 1.15, 0.245), BLACK, plastic));
    // the hand guard
    p.push(part(box(0.13, 0.07, 0.014, side * 0.31, 1.15, 0.315, 0, side * -0.18), PLASTIC, plastic));
  }
  // the pod: its housing painted, the dial, the third lamp
  p.push(part(slab(outline([[0.42, 1.08], [0.43, 1.17], [0.36, 1.215], [0.24, 1.2], [0.22, 1.1], [0.3, 1.06]]), -0.11, 0.11, 0.03, 6), 0xffffff, { paint: 1, rough: 0.34 }));
  p.push(part(box(0.11, 0.012, 0.075, 0, 1.213, 0.3, -0.16), 0x0c1418, { rough: 0.15 }));
  p.push(part(box(0.13, 0.07, 0.02, 0, 1.125, 0.428), BLACK, plastic));
  p.push(part(box(0.1, 0.05, 0.03, 0, 1.125, 0.432), 0xfff4d2, { rough: 0.2, head: 1 }));
  return p;
}

/** A wheel about the x axis through the origin: the tyre with two rows of knobs, the rim's barrel, spokes and hub */
function wheelParts() {
  const p = [], W = 0.125;
  const profile = [[0.168, -W + 0.012], [0.235, -W], [0.29, -W + 0.012], [R, -0.07], [R, 0.07], [0.29, W - 0.012], [0.235, W], [0.168, W - 0.012]].map(([r, y]) => new THREE.Vector2(r, y));
  p.push(part(new THREE.LatheGeometry(profile, 22).rotateZ(-Math.PI / 2), BLACK, { rough: 0.95 }));
  const knobs = 18;
  for (let i = 0; i < knobs; i++) {
    for (const row of [1, -1]) {
      const a = ((i + (row > 0 ? 0 : 0.5)) / knobs) * Math.PI * 2;
      p.push(part(new THREE.BoxGeometry(0.1, 0.03, 0.056).rotateY(row * 0.3).translate(row * 0.058, R + 0.008, 0).rotateX(a), 0x1d1e20, { rough: 0.98 }));
    }
  }
  p.push(part(new THREE.CylinderGeometry(0.172, 0.172, 0.2, 20, 1, true).rotateZ(Math.PI / 2), ALU, { rough: 0.35 }));
  for (const side of [1, -1]) {
    p.push(part(new THREE.CylinderGeometry(0.168, 0.168, 0.01, 20).rotateZ(Math.PI / 2).translate(side * 0.082, 0, 0), 0x2b2d30, { rough: 0.6 }));
    p.push(part(new THREE.TorusGeometry(0.168, 0.012, 5, 20).rotateY(Math.PI / 2).translate(side * 0.1, 0, 0), ALU, { rough: 0.3 }));
    for (let i = 0; i < 5; i++) p.push(part(new THREE.BoxGeometry(0.018, 0.13, 0.042).translate(side * 0.094, 0.095, 0).rotateX((i / 5) * Math.PI * 2), ALU, { rough: 0.35 }));
    p.push(part(new THREE.CylinderGeometry(0.05, 0.058, 0.03, 10).rotateZ(side * -Math.PI / 2).translate(side * 0.1, 0, 0), 0x8a8e92, { rough: 0.3 }));
  }
  return p;
}

// (built once, shared by every quad: the procedural ones until the GLB has arrived)
const WHEEL_AT = [[WX, WZ, 'wheelL'], [-WX, WZ, 'wheelR'], [WX, -WZ, 'wheelL'], [-WX, -WZ, 'wheelR']];
function assemble(body, steerAt, wheelL, wheelR) {
  const sp = QUAD_MODEL.steerPivot;
  // one standing: the bars straight, the wheels in their places
  const parked = mergeGeometries([body, steerAt, ...WHEEL_AT.map(([x, z, side]) => (side === 'wheelL' ? wheelL : wheelR).clone().translate(x, R, z))]);
  // (the traffic's: body and bars as one, the wheels instanced apart so that they turn)
  const still = mergeGeometries([body, steerAt]);
  return { body, steer: steerAt.clone().translate(-sp.x, -sp.y, -sp.z), wheelL, wheelR, parked, still };
}
let geos = null;
let live = new Set(); // the meshes made so far, by role: they get the GLB's geometry when it arrives (then null)
function geometries() {
  if (!geos) {
    const wheel = mergeGeometries(wheelParts());
    geos = assemble(mergeGeometries(bodyParts()), mergeGeometries(steerParts()), wheel, wheel);
  }
  return geos;
}
function tracked(mesh, role, adapt = null) {
  if (live) live.add([mesh, role, adapt]);
  return mesh;
}

// ---- The mesh quad (assets/models/quad.glb) ------------------------------------------------------------------------------
const MODEL_URL = new URL('../assets/models/quad.glb', import.meta.url);
// The GLB of tools/build-quad.mjs: three meshes (body, steer, wheel), each POSITION (float), NORMAL (byte x 4), COLOR_0
// (unsigned byte x 4, sRGB), _SURF (unsigned byte x 4) and 16- or 32-bit indices, in the quad's object space (the wheel
// about its axle, the left one)
function parseQuadGlb(buffer) {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 28 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLength = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const read = (index, Type, size) => {
    const a = json.accessors[index], v = json.bufferViews[a.bufferView];
    const offset = binStart + (v.byteOffset || 0) + (a.byteOffset || 0);
    if (!a.count || offset + a.count * size * Type.BYTES_PER_ELEMENT > buffer.byteLength) throw new Error('bad accessor');
    return new Type(buffer, offset, a.count * size);
  };
  const out = {}, c = new THREE.Color();
  for (const mesh of json.meshes) {
    const prim = mesh.primitives[0], at = prim.attributes;
    const position = read(at.POSITION, Float32Array, 3), n8 = read(at.NORMAL, Int8Array, 4);
    const c8 = read(at.COLOR_0, Uint8Array, 4), s8 = read(at._SURF, Uint8Array, 4);
    const index = read(prim.indices, json.accessors[prim.indices].componentType === 5125 ? Uint32Array : Uint16Array, 1);
    // (indexed, a third of the vertices of a flat list: the GLB's parts are merged among themselves only)
    const nv = position.length / 3;
    const nor = new Float32Array(nv * 3), color = new Float32Array(nv * 3), surf = new Float32Array(nv * 4);
    const linear = new Map();
    for (let v = 0; v < nv; v++) {
      for (let k = 0; k < 3; k++) nor[v * 3 + k] = n8[v * 4 + k] / 127;
      const key = (c8[v * 4] << 16) | (c8[v * 4 + 1] << 8) | c8[v * 4 + 2];
      let lin = linear.get(key);
      if (!lin) { c.setHex(key); linear.set(key, (lin = [c.r, c.g, c.b])); }
      color.set(lin, v * 3);
      for (let k = 0; k < 4; k++) surf[v * 4 + k] = s8[v * 4 + k] / 255;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(position), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setAttribute('surf', new THREE.BufferAttribute(surf, 4));
    g.setIndex(new THREE.BufferAttribute(index.slice(), 1));
    out[mesh.name] = g;
  }
  if (!out.body || !out.steer || !out.wheel) throw new Error('parts missing');
  // the right wheel: the left one mirrored (the winding turned back)
  const right = out.wheel.clone().scale(-1, 1, 1);
  const idx = right.index.array;
  for (let t = 0; t < idx.length; t += 3) { const v = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = v; }
  return assemble(out.body, out.steer, out.wheel, right);
}
/** Resolves once the quad's mesh is in use (true) or has failed (false: the procedural quad stays) */
export const quadReady = (typeof fetch === 'function'
  ? fetch(MODEL_URL).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
  : Promise.reject(new Error('no fetch')))
  .then((buffer) => {
    const old = geos;
    geos = parseQuadGlb(buffer);
    for (const [mesh, role, adapt] of live) mesh.geometry = adapt ? adapt(geos[role]) : geos[role];
    live = null;
    if (old) for (const g of new Set(Object.values(old))) g.dispose();
    return true;
  })
  .catch((err) => {
    console.warn('quad: mesh not loaded, keeping the procedural quad', err);
    live = null;
    return false;
  });

/** The quad's material: { material, paint, head, tail } (the body colour and the lamps' glow, uniforms) */
export function createQuadMaterial(paintHex = QUAD_PAINTS[0], { instanced = false } = {}) {
  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0.06 });
  // (instanced: the colour from the geometry's `paintColor`, one an instance; createQuadInstances)
  // (and the lamps switched an instance, by `quadLamp`: 0 for one standing with nobody on it)
  const paint = instanced ? attribute('paintColor', 'vec3') : uniform(new THREE.Color(paintHex)), head = uniform(0), tail = uniform(0);
  const surf = attribute('surf', 'vec4'), base = attribute('color', 'vec3');
  material.colorNode = mix(base, paint, surf.x);
  material.roughnessNode = surf.y;
  const glow = base.mul(surf.z.mul(head).add(surf.w.mul(tail)));
  material.emissiveNode = instanced ? glow.mul(attribute('quadLamp', 'float')) : glow;
  return { material, paint, head, tail };
}

/**
 * A quad to drive: { group, body, steer, wheels: [{ mesh, x, z, r, y, front }], look } (the wheels and the bars are the
 * group's children at their places; `look`: createQuadMaterial's handles). Its own material (the race ghosts fade it).
 */
export function createQuad(paintHex = QUAD_PAINTS[0]) {
  const g = geometries(), look = createQuadMaterial(paintHex);
  const group = new THREE.Group();
  group.name = 'Quad';
  const body = tracked(new THREE.Mesh(g.body, look.material), 'body');
  body.castShadow = true;
  const steer = tracked(new THREE.Mesh(g.steer, look.material), 'steer');
  steer.position.copy(QUAD_MODEL.steerPivot);
  steer.castShadow = true;
  group.add(body, steer);
  const wheels = [];
  for (const [x, z, side] of WHEEL_AT) {
    const mesh = tracked(new THREE.Mesh(g[side], look.material), side);
    mesh.position.set(x, R, z);
    mesh.castShadow = true;
    group.add(mesh);
    wheels.push({ mesh, x, z, r: R, y: R, front: z > 0 });
  }
  return { group, body, steer, wheels, look };
}

/** A quad standing about: one mesh, its lamps dark (`look`: a material shared by those of a colour) */
export function createParkedQuad(look) {
  const mesh = tracked(new THREE.Mesh(geometries().parked, look.material), 'parked');
  mesh.name = 'ParkedQuad';
  mesh.castShadow = true;
  return mesh;
}

/**
 * `count` quads in two draws (the traffic's, js/traffic.js): { mesh, wheels, paint, lamp, look }. `mesh`: body and bars,
 * each instance's body colour in `paint` (an InstancedBufferAttribute of linear rgb) and its lamps on (1) or off in
 * `lamp`; `wheels`: 4 * count wheels (the left one, turned half round for the right side), instance 4 * i + k the
 * quad i's wheel k (front left, front right, rear left, rear right); the lamps' glow in `look`.
 */
export function createQuadInstances(count) {
  const paint = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(0.5), 3);
  const lamp = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
  const look = createQuadMaterial(0, { instanced: true });
  // (the shared geometry's attributes with the instances' beside them)
  const adapt = (g) => {
    const out = new THREE.BufferGeometry();
    for (const name of Object.keys(g.attributes)) out.setAttribute(name, g.attributes[name]);
    if (g.index) out.setIndex(g.index); // (the GLB's parts are indexed, the procedural ones not)
    out.setAttribute('paintColor', paint);
    out.setAttribute('quadLamp', lamp);
    return out;
  };
  const mesh = tracked(new THREE.InstancedMesh(adapt(geometries().still), look.material, count), 'still', adapt);
  mesh.name = 'Quads';
  const wheels = tracked(new THREE.InstancedMesh(geometries().wheelL, createQuadMaterial().material, count * 4), 'wheelL');
  wheels.name = 'QuadWheels';
  return { mesh, wheels, paint, lamp, look };
}
/** Where quad wheel k (createQuadInstances' order) sits on its quad, and its turn about y (the right ones half round) */
export const QUAD_WHEELS = WHEEL_AT.map(([x, z, side]) => ({ x, y: R, z, yaw: side === 'wheelL' ? 0 : Math.PI, front: z > 0 }));

/**
 * The driven quad's lamps: `night` 0..1 (js/controllers.js beamScale: 0 by day), `high` the full beam, `brake` 0..1.
 * By day the lenses stay dark but for the brake.
 */
export function setQuadLamps(look, { night = 0, high = false, brake = 0, on = true } = {}) {
  const n = on ? Math.min(1, Math.max(0, night)) : 0;
  look.head.value = n * (high ? 5.5 : 3.6);
  look.tail.value = on ? n * 1.1 + (brake > 0 ? 3.2 : 0) : 0;
}
