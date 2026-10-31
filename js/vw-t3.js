import * as THREE from 'three/webgpu';
import { float, vec2, color, attribute, abs, fract, min, max, clamp, mix, step, smoothstep, length, fwidth, uniform, texture } from 'three/tsl';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityUniforms } from './tsl-materials.js';
import { plateAtlasTexture, PLATE_ATLAS } from './plates.js';
import { buildSteerableWheelGeo } from './actor-models.js';

// js/vw-t3.js
// The player's van: a VW T3 (Transporter / Caravelle bus, 1985–90) in royal blue with a white roof.
// The body is a real mesh, assets/models/vw-t3-body.glb (tools/build-vw-t3.mjs), from
//   "VW T3 Van scale1-100 lowpoly for 3D-printing" by fishermans garage (https://sketchfab.com/fishermans),
//   https://sketchfab.com/3d-models/vw-t3-van-scale1-100-lowpoly-for-3d-printing-b26d56e82819444aa2379e6461500ff6,
//   licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/): wheels & tail lettering removed,
//   re-oriented and rescaled to T3 below, recoloured & painted here.
// It brings the nose with its grille, round headlamps & emblem, the bumpers, door handles, the engine air intakes and
// the wheel houses; the mirrors are a few boxes, the steerable wheels are separate (buildVwT3WheelGeo). Everything else
// (glass, seals, the louvred sliding window, indicators, tail lamps, door seams, the camper flap & sockets, the Swiss
// plates, the blue/white split, the steel wheels) is painted by one TSL material from object-space position & normal,
// in the manner of the lofted traffic cars (actor-models.js).
// The GLB is fetched when this module loads; until it is there (or if it fails) the van is the old procedural body: one
// side-view profile extruded across the width with rounded edges, bumpers, wheel houses & mirrors from boxes.
// upgradeVwT3Body(mesh) swaps the mesh's geometry once the GLB has arrived.

// Dimensions (m): length 4.57, width 1.85, height 1.95, wheelbase 2.45; origin at the middle of the body, z = forward.
// The wheel, lamp & window positions follow the mesh (tools/build-vw-t3.mjs prints the wheels).
const T3 = {
  name: 'vw-t3',
  zFront: 2.285,
  zRear: -2.285,
  halfWidth: 0.925,
  height: 1.95,
  wheelRadius: 0.325,
  wheelX: 0.78,
  axles: [1.128, -1.319], // front / rear axle (front overhang 1.16 m, rear 0.97 m)
  wheelbase: 2.447,
  headlight: [0.684, 0.982], // round lamps: centre |x|, y (used by placeVehicleHeadlight)
  taillight: [0.635, 0.669], // the tail lamp units beside the plate recess (centre)
  plates: [0.498, 0.67], // front plate on the bumper (right of centre), rear plate in the recess under the tailgate
  windowY: [1.3, 1.79], // side window sills & heads
  roofLine: 1.84 // white above the rain gutter
};
T3.wheelZ = T3.axles[0];
T3.lamps = [T3.headlight[1], T3.taillight[1]];
T3.lampX = [T3.headlight[0], T3.taillight[0]];

const PARTS = { BODY: 0, TYRE: 2, RIM: 3, TRIM: 4, MIRROR: 5, ROOF: 6, LINER: 7 }; // TYRE & RIM as in actor-models.js
const BEVEL = 0.09; // rounding of every body edge (procedural body)

function part(geometry, id) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'partId') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.partId) g.setAttribute('partId', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(id), 1));
  g.clearGroups();
  return g;
}

// ---- The mesh body (assets/models/vw-t3-body.glb) --------------------------------------------------------------------
const BODY_URL = new URL('../assets/models/vw-t3-body.glb', import.meta.url);
let meshBody = null; // the parsed GLB (non-indexed BufferGeometry: position, normal, partId), once loaded

// The GLB written by tools/build-vw-t3.mjs: one primitive with POSITION & NORMAL (float), _PART (unsigned byte) and
// 16-bit indices, already in the van's object space
function parseBodyGlb(buffer) {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 28 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLength = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const prim = json.meshes[0].primitives[0];
  const read = (index, Type, size) => {
    const a = json.accessors[index], v = json.bufferViews[a.bufferView];
    const offset = binStart + (v.byteOffset || 0) + (a.byteOffset || 0);
    if (!a.count || offset + a.count * size * Type.BYTES_PER_ELEMENT > buffer.byteLength) throw new Error('bad accessor');
    return new Type(buffer, offset, a.count * size);
  };
  const position = read(prim.attributes.POSITION, Float32Array, 3);
  const normal = read(prim.attributes.NORMAL, Float32Array, 3);
  const partId = Float32Array.from(read(prim.attributes._PART, Uint8Array, 1));
  const index = read(prim.indices, Uint16Array, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('partId', new THREE.BufferAttribute(partId, 1));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const flat = g.toNonIndexed();
  if (!flat.attributes.position.count) throw new Error('empty body');
  return flat;
}

const bodyReady = (typeof fetch === 'function'
  ? fetch(BODY_URL).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
  : Promise.reject(new Error('no fetch')))
  .then((buffer) => (meshBody = parseBodyGlb(buffer)))
  .catch((err) => {
    console.warn('vw-t3: body mesh not loaded, keeping the procedural van', err);
    return null;
  });

// ---- The procedural body (fallback) ----------------------------------------------------------------------------------
// Side profile (shape x = car z, shape y = height), BEVEL inside the finished outline: extrusion bevels it back out
function bodyProfile() {
  const s = new THREE.Shape();
  const b = BEVEL;
  const floorY = 0.32 + b;
  const zF = T3.zFront - b, zR = T3.zRear + b, roofY = T3.height - b;
  const arch = (zc) => {
    // Angular T3 arch: near-vertical sides, a flat crown, rounded shoulders (0.41 m outside the tyre's centre)
    const w = 0.41 + b, top = 0.73 + b;
    s.lineTo(zc - w, floorY);
    s.lineTo(zc - w + 0.01, 0.56);
    s.quadraticCurveTo(zc - w + 0.035, top, zc - 0.24, top);
    s.lineTo(zc + 0.24, top);
    s.quadraticCurveTo(zc + w - 0.035, top, zc + w - 0.01, 0.56);
    s.lineTo(zc + w, floorY);
  };
  s.moveTo(zR + 0.02, floorY + 0.03);
  arch(T3.axles[1]);
  arch(T3.axles[0]);
  s.lineTo(zF - 0.03, floorY);
  s.lineTo(zF, floorY + 0.06);
  s.lineTo(zF, 1.1); // upright nose
  s.lineTo(zF - 0.06, 1.25); // short nose panel, leaning back to the screen
  s.lineTo(1.66, 1.8); // windscreen
  s.quadraticCurveTo(1.6, roofY, 1.44, roofY);
  s.lineTo(zR + 0.24, roofY); // flat roof
  s.quadraticCurveTo(zR + 0.08, roofY, zR + 0.04, roofY - 0.16);
  s.lineTo(zR, floorY + 0.08); // square tail
  s.lineTo(zR + 0.02, floorY + 0.03);
  return s;
}

function buildBody() {
  const depth = 2 * (T3.halfWidth - BEVEL);
  const g = new THREE.ExtrudeGeometry(bodyProfile(), {
    depth,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 4,
    curveSegments: 8
  });
  g.translate(0, 0, -depth / 2).rotateY(-Math.PI / 2); // shape x -> car z, extrusion -> car x
  // Tumblehome: the glasshouse leans in by ~3 cm a side towards the roof
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - 1.18) / 0.77));
    pos.setX(i, pos.getX(i) * (1 - 0.035 * t));
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return part(toCreasedNormals(g, 0.6), PARTS.BODY);
}

// Tall black mirrors on short arms at the front corners of the door windows (both bodies)
function buildMirrors() {
  const list = [];
  for (const side of [-1, 1]) {
    list.push(part(new THREE.BoxGeometry(0.17, 0.03, 0.035).rotateZ(side * 0.32).translate(side * 0.895, 1.295, 1.72), PARTS.TRIM));
    list.push(part(new THREE.BoxGeometry(0.045, 0.21, 0.14).translate(side * 0.99, 1.39, 1.71), PARTS.MIRROR));
  }
  return list;
}

// Black plastic bumpers wrapping a little round the corners, dark wheel houses through the body (procedural body)
function buildFittings() {
  const list = [];
  const box = (w, h, d, x, y, z, id) => list.push(part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), id));
  for (const end of [1, -1]) {
    const tip = end > 0 ? T3.zFront : T3.zRear;
    box(1.9, 0.16, 0.16, 0, T3.plates[0], tip - end * 0.06, PARTS.TRIM);
    for (const side of [-1, 1]) box(0.07, 0.16, 0.3, side * 0.925, T3.plates[0], tip - end * 0.18, PARTS.TRIM);
  }
  for (const z of T3.axles) box(1.56, 0.44, 0.88, 0, 0.6, z, PARTS.LINER);
  return list;
}

/**
 * The van's body, bumpers & mirrors in one geometry (position, normal, partId). The mesh body once it has loaded,
 * the procedural one before (geometry.userData.vwT3Body: 'mesh' | 'procedural'). Never empty.
 */
function buildVwT3Geometry() {
  let g = null;
  if (meshBody) {
    try {
      g = mergeGeometries([meshBody.clone(), ...buildMirrors()]);
      if (g) g.userData.vwT3Body = 'mesh';
    } catch (err) {
      console.warn('vw-t3: mesh body unusable', err);
      g = null;
    }
  }
  if (!g || !g.attributes.position.count) {
    g = mergeGeometries([buildBody(), ...buildFittings(), ...buildMirrors()]);
    g.userData.vwT3Body = 'procedural';
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Puts the mesh body on `mesh` (made with buildVwT3Geometry) as soon as the GLB has loaded; resolves to true if so. */
function upgradeVwT3Body(mesh) {
  if (mesh.geometry?.userData.vwT3Body === 'mesh') return Promise.resolve(true);
  return bodyReady.then((body) => {
    if (!body) return false;
    const g = buildVwT3Geometry();
    if (g.userData.vwT3Body !== 'mesh') return false;
    const old = mesh.geometry;
    mesh.geometry = g;
    old?.dispose();
    return true;
  });
}

function buildVwT3WheelGeo(side) {
  return buildSteerableWheelGeo(T3, side);
}

// ---- Material ---------------------------------------------------------------------------------------------------------
// Signed distance to a rounded box (half sizes hw, hh, corner radius r) around the origin of (u, v)
const boxSdf = (u, v, hw, hh, r) => {
  const qx = abs(u).sub(hw - r);
  const qy = abs(v).sub(hh - r);
  return length(max(vec2(qx, qy), 0.0)).add(min(max(qx, qy), 0.0)).sub(r);
};
const cov = (d) => {
  const w = max(fwidth(d), 0.0008);
  return smoothstep(w, w.negate(), d);
};
const line = (d, half) => cov(abs(d).sub(half));
// Distance from (u, v) to the segment a-b
const segment = (u, v, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const pu = u.sub(ax), pv = v.sub(ay);
  const h = clamp(pu.mul(dx).add(pv.mul(dy)).div(dx * dx + dy * dy), 0.0, 1.0);
  return length(vec2(pu.sub(h.mul(dx)), pv.sub(h.mul(dy))));
};

let _material = null;
/**
 * The van's TSL material (body, fittings & wheels). `material.userData.carState` is the lamp uniform shared with the
 * lofted cars: x brake, y left (+x) & z right (-x) indicators, w reverse. `material.userData.lampState` (vec2): x
 * headlamps on, y high beam.
 */
function createVwT3Material() {
  if (_material) return _material;
  const state = uniform(new THREE.Vector4(0, 0, 0, 0));
  const one = float(1);
  const p = attribute('position', 'vec3');
  const n = attribute('normal', 'vec3');
  const partId = attribute('partId', 'float');
  const isPart = (id) => step(abs(partId.sub(id)), 0.25);
  const isBody = isPart(PARTS.BODY), isTyre = isPart(PARTS.TYRE), isRim = isPart(PARTS.RIM), isTrim = isPart(PARTS.TRIM);
  const isMirror = isPart(PARTS.MIRROR), isRoof = isPart(PARTS.ROOF), isLiner = isPart(PARTS.LINER);
  const ax = abs(p.x);
  const leftSide = step(0.0, p.x); // the camper side (no sliding door): louvres, flap & sockets
  const side = smoothstep(0.6, 0.8, abs(n.x)).mul(isBody);
  const front = smoothstep(0.55, 0.75, n.z).mul(step(2.0, p.z)).mul(isBody);
  const frontish = smoothstep(0.5, 0.7, n.z).mul(step(1.5, p.z)).mul(isBody);
  const rear = smoothstep(0.55, 0.75, n.z.negate()).mul(step(p.z, -1.9)).mul(isBody); // (the tail leans in at the top)
  const [wy0, wy1] = T3.windowY;
  const wyc = (wy0 + wy1) / 2, wyh = (wy1 - wy0) / 2;

  // Side glass: door window (its front edge follows the A pillar), louvred sliding window, rear window (ending before
  // the engine air intake)
  const pillar = p.z.sub(1.8).mul(0.854).add(p.y.sub(wy0).mul(0.521));
  const doorWin = max(boxSdf(p.z.sub(1.3), p.y.sub(wyc), 0.6, wyh, 0.03), pillar);
  const midWin = boxSdf(p.z.add(0.01), p.y.sub(wyc), 0.59, wyh, 0.03);
  const rearWin = boxSdf(p.z.add(1.13), p.y.sub(wyc), 0.42, wyh, 0.07);
  const sideWin = min(min(doorWin, midWin), rearWin);
  const sideGlass = cov(sideWin).mul(side);
  const sideSeal = cov(sideWin.sub(0.028)).mul(side);
  const louvre = cov(midWin).mul(side).mul(leftSide);
  const louvreFrame = max(max(cov(midWin.add(0.024)).oneMinus(), line(p.z.add(0.01), 0.011)),
    line(abs(fract(p.y.sub(wy0).div(0.095).add(0.5)).sub(0.5)).mul(0.095), 0.004)).mul(louvre);
  const louvreBlade = smoothstep(0.15, 0.85, fract(p.y.sub(wy0).div(0.095))).mul(step(p.z, -0.01)).mul(louvre);
  // Engine air intake behind the rear windows (both sides; the louvres are in the mesh), leaning like the tail
  const vent = cov(boxSdf(p.z.add(1.82).sub(p.y.sub(1.57).mul(0.4)), p.y.sub(1.57), 0.12, 0.21, 0.02)).mul(isBody)
    .mul(step(0.75, ax));
  const ventSlat = smoothstep(0.2, 0.9, n.y.abs().add(n.z.abs())).mul(0.5).add(0.5);

  // Windscreen & rear window (projected along z), their rubber seals, wipers
  const screen = boxSdf(p.x.mul(p.y.sub(1.33).mul(0.23).add(1)), p.y.sub(1.575), 0.765, 0.245, 0.07); // (narrower at the top)
  const screenGlass = cov(screen).mul(frontish);
  const screenSeal = cov(screen.sub(0.03)).mul(frontish);
  const wiper = max(segment(p.x, p.y, [-0.7, 1.36], [-0.12, 1.39]), segment(p.x, p.y, [0.04, 1.36], [0.62, 1.39]));
  const wipers = line(wiper, 0.007).mul(screenGlass);
  const backlight = boxSdf(p.x.mul(p.y.sub(1.22).mul(0.2).add(1)), p.y.sub(1.5), 0.73, 0.28, 0.07);
  const backGlass = cov(backlight).mul(rear);
  const backSeal = cov(backlight.sub(0.026)).mul(rear);
  const glass = max(max(sideGlass, screenGlass), backGlass).mul(one.sub(louvreFrame));
  const seal = max(max(sideSeal, screenSeal), backSeal);

  // Nose: black grille band with the round headlamps and a round emblem, second grille below, corner indicators
  // (the slats & lamp rings are in the mesh; the slats' faces shade them)
  const band = cov(boxSdf(p.x, p.y.sub(0.994), 0.815, 0.128, 0.02)).mul(front);
  const lowGrille = cov(boxSdf(p.x, p.y.sub(0.703), 0.565, 0.082, 0.01)).mul(front);
  const grilleSlats = smoothstep(0.3, 0.8, n.y.abs()).mul(0.8).add(0.6);
  const hlDist = length(vec2(ax.sub(T3.headlight[0]), p.y.sub(T3.headlight[1])));
  const headBezel = cov(hlDist.sub(0.1)).mul(front);
  const headLens = cov(hlDist.sub(0.082)).mul(front);
  const lensRings = line(abs(fract(hlDist.div(0.02)).sub(0.5)), 0.08).mul(0.18);
  const ex = p.x.div(1.25), ey = p.y.sub(0.978).div(1.25); // the emblem, 1.25 × the old painted one
  const embDist = length(vec2(ex, ey));
  const embInside = cov(embDist.sub(0.052));
  let mark = min(segment(ex, ey, [-0.034, 0.04], [0, -0.006]), segment(ex, ey, [0, -0.006], [0.034, 0.04]));
  for (const [a, b] of [[[-0.046, 0.008], [-0.022, -0.046]], [[-0.022, -0.046], [0, -0.012]], [[0, -0.012], [0.022, -0.046]], [[0.022, -0.046], [0.046, 0.008]]]) {
    mark = min(mark, segment(ex, ey, a, b));
  }
  const emblem = max(line(embDist.sub(0.058), 0.0065), line(mark, 0.0055).mul(embInside)).mul(front);
  const turnFront = cov(boxSdf(ax.sub(0.82), p.y.sub(0.707), 0.075, 0.062, 0.012)).mul(step(2.07, p.z)).mul(isBody); // (round the corner)

  // Tail: tailgate shut line, the lamp units beside the plate recess (amber, red, reverse, red from the top), plate,
  // handle
  const tailgate = line(boxSdf(p.x.mul(p.y.sub(0.8).mul(0.12).add(1)), p.y.sub(1.33), 0.795, 0.535, 0.06), 0.004).mul(rear);
  const engineLid = float(0);
  const gateHandle = cov(boxSdf(p.x, p.y.sub(1.1), 0.07, 0.018, 0.01)).mul(rear);
  const tlU = ax.sub(T3.taillight[0]), tlV = p.y.sub(T3.taillight[1]);
  const tailHousing = cov(boxSdf(tlU, tlV, 0.155, 0.064, 0.012)).mul(rear);
  const tailLens = cov(boxSdf(tlU, tlV, 0.145, 0.055, 0.008)).mul(rear);
  const tv = tlV.div(0.11).add(0.5); // 0 at the bottom, 1 at the top
  const tailDivider = cov(min(min(abs(tv.sub(0.72)), abs(tv.sub(0.3))), abs(tv.sub(0.14))).sub(0.008));
  const turnRearSection = step(0.72, tv), reverseSection = step(0.14, tv).mul(step(tv, 0.3));
  const lens = tailLens.mul(one.sub(tailDivider));
  const turnRear = lens.mul(turnRearSection);
  const reverseLens = lens.mul(reverseSection);
  const redLens = lens.mul(one.sub(max(turnRearSection, reverseSection)));
  const tailColor = mix(mix(color(0xa8141c), color(0xc8701c), turnRearSection), color(0xc4ccd0), reverseSection);

  // Swiss plates (plates.js, plate 0 from Graubünden): front 300 × 80 mm on the bumper, rear 500 × 110 mm on the lid
  const [plateFY, plateRY] = T3.plates;
  const plateFX = -0.3;
  const onBumperFront = smoothstep(0.55, 0.75, n.z).mul(step(T3.zFront - 0.05, p.z)).mul(isTrim);
  const plateFront = cov(boxSdf(p.x.sub(plateFX), p.y.sub(plateFY), 0.15, 0.04, 0.006)).mul(onBumperFront);
  const plateRear = cov(boxSdf(p.x, p.y.sub(plateRY), 0.25, 0.055, 0.006)).mul(rear);
  const plateLamp = cov(boxSdf(p.x, p.y.sub(plateRY + 0.085), 0.07, 0.016, 0.008)).mul(rear);
  const atlas = plateAtlasTexture();
  const cell = (u, v, top, h) => vec2(clamp(u, 0.004, 0.996).div(PLATE_ATLAS.cols),
    one.sub(one.sub(clamp(v, 0.01, 0.99)).mul(h).add(top).div(PLATE_ATLAS.size)));
  const rearPlateColor = texture(atlas, cell(p.x.div(-0.5).add(0.5), p.y.sub(plateRY).div(0.11).add(0.5), 0, PLATE_ATLAS.rearH)).rgb;
  const frontPlateColor = texture(atlas, cell(p.x.sub(plateFX).div(0.3).add(0.5), p.y.sub(plateFY).div(0.08).add(0.5), PLATE_ATLAS.frontY, PLATE_ATLAS.frontH)).rgb;

  // Sides: two swage lines (under the windows and at handle height), door seams, sliding-door rail, handles,
  // the rain gutter; on the camper side a black flap, a round vent & a round socket
  const swage = (y) => cov(abs(p.y.sub(y + 0.009)).sub(0.006)).mul(0.32).sub(cov(abs(p.y.sub(y - 0.006)).sub(0.005)).mul(0.42));
  const swages = swage(1.0).mul(0.6).mul(side).mul(step(p.z, 2.2)).mul(step(-2.24, p.z)); // (the others are in the mesh)
  const slidingSide = one.sub(leftSide);
  const vSeam = (z, y0, y1) => line(p.z.sub(z), 0.004).mul(step(y0, p.y)).mul(step(p.y, y1));
  const seams = max(max(vSeam(0.675, 0.38, 1.83), vSeam(-0.655, 0.38, 1.83).mul(slidingSide)),
    line(p.y.sub(1.2), 0.007).mul(step(p.z, -0.655)).mul(step(-1.92, p.z)).mul(slidingSide)).mul(side).mul(one.sub(sideSeal));
  const handles = float(0); // (the handles are in the mesh)
  const gutter = line(p.y.sub(T3.roofLine - 0.007), 0.004).mul(side);
  const flap = cov(boxSdf(p.z.add(0.36), p.y.sub(0.95), 0.045, 0.085, 0.01));
  const latch = cov(boxSdf(p.z.add(0.21), p.y.sub(1.115), 0.035, 0.035, 0.008));
  const ventDist = length(vec2(p.z.add(0.465), p.y.sub(0.95)));
  const socketDist = length(vec2(p.z.add(0.585), p.y.sub(0.95)));
  const camper = max(max(flap, latch), max(cov(ventDist.sub(0.05)), cov(socketDist.sub(0.055)))).mul(side).mul(leftSide);
  const camperShade = mix(one, line(abs(fract(ventDist.div(0.014)).sub(0.5)), 0.12).mul(0.5).oneMinus(), cov(ventDist.sub(0.05)))
    .mul(mix(one, float(0.4), cov(socketDist.sub(0.03))));

  // Roof: white above the gutter, longitudinal ribs; dark wheel arch returns & underside
  const roofWhite = smoothstep(T3.roofLine - 0.002, T3.roofLine + 0.002, p.y).mul(isBody);
  const ribs = line(abs(fract(p.x.div(0.19).add(0.5)).sub(0.5)).mul(0.19), 0.006)
    .mul(smoothstep(0.75, 0.9, n.y)).mul(step(p.z, 1.5)).mul(step(-2.1, p.z)).mul(step(ax, 0.72)).mul(isBody);
  let nearAxle = float(0);
  for (const z of T3.axles) nearAxle = max(nearAxle, step(abs(p.z.sub(z)), 0.52));
  const archReturn = smoothstep(0.55, 0.3, abs(n.x)).mul(step(p.y, 0.82)).mul(nearAxle).mul(smoothstep(0.4, 0.1, n.y));
  // (and the mesh's wheel houses: their inner walls & crowns inboard of the body sides)
  const wheelHouse = step(ax, 0.82).mul(step(p.y, 0.76)).mul(nearAxle);
  const under = max(max(smoothstep(-0.4, -0.6, n.y), archReturn), wheelHouse).mul(isBody);

  // ---- Colour ---------------------------------------------------------------------------------------------------------
  const ao = smoothstep(0.32, 0.8, p.y).mul(0.18).add(0.82);
  let body = mix(color(0x2c38b2), color(0xe6e8e4), roofWhite).mul(ao);
  body = body.mul(swages.add(1)).mul(one.sub(ribs.mul(0.12)));
  body = mix(body, color(0x101215), max(max(seams, gutter.mul(0.7)), handles));
  body = mix(body, color(0x16181b).mul(camperShade), camper);
  body = mix(body, color(0x0f1113).mul(ventSlat.mul(0.6).add(0.4)), vent);
  // Nose
  body = mix(body, color(0x121416).mul(grilleSlats), max(band, lowGrille));
  body = mix(body, color(0x9da3a6), headBezel);
  body = mix(body, color(0xc9d0d4).mul(one.sub(lensRings)), headLens);
  body = mix(body, color(0xc8ccce), emblem);
  body = mix(body, color(0xd47a1e), turnFront);
  // Tail
  body = mix(body, color(0x101215), max(max(tailgate, engineLid), max(gateHandle, plateLamp)));
  body = mix(body, color(0x16181b), tailHousing);
  body = mix(body, tailColor, lens);
  body = mix(body, color(0xf2f2ee), plateRear);
  body = mix(body, rearPlateColor, plateRear);
  // Glass, seals, louvres
  const glassCol = mix(color(0x0b1118), color(0x26364a), smoothstep(1.2, 1.8, p.y));
  body = mix(body, color(0x111315), seal);
  body = mix(body, mix(glassCol, color(0x55657a), louvreBlade.mul(0.7)), glass);
  body = mix(body, color(0xc4c9cc), louvreFrame);
  body = mix(body, color(0x15171a), wipers);
  body = mix(body, color(0x0c0d0f), under);

  const wheelDist = length(vec2(p.z, p.y));
  let holes = float(0);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    holes = max(holes, cov(length(vec2(p.z.sub(Math.cos(a) * 0.142), p.y.sub(Math.sin(a) * 0.142))).sub(0.019)));
  }
  let lugs = float(0);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    lugs = max(lugs, cov(length(vec2(p.z.sub(Math.cos(a) * 0.045), p.y.sub(Math.sin(a) * 0.045))).sub(0.01)));
  }
  const dish = smoothstep(0.07, 0.2, wheelDist).mul(-0.18).add(1);
  let rimCol = mix(color(0xcfd2cd).mul(dish), color(0x1a1c1e), holes);
  rimCol = mix(rimCol, color(0x5a5e60), cov(wheelDist.sub(0.068)));
  rimCol = mix(rimCol, color(0x2a2c2e), max(lugs, cov(wheelDist.sub(0.024))));
  const tyreCol = color(0x17191c).mul(smoothstep(0.27, 0.3, wheelDist).mul(0.25).add(0.75));

  const trimCol = mix(color(0x1b1d20).mul(one.sub(line(p.y.sub(0.47), 0.006).mul(0.4))), color(0xf2f2ee), plateFront);
  const mirrorGlass = smoothstep(0.55, 0.75, n.z.negate()).mul(isMirror);
  let col = body;
  col = mix(col, mix(trimCol, frontPlateColor, plateFront), isTrim);
  col = mix(col, mix(color(0x16181b), color(0x7c8a94), mirrorGlass), isMirror);
  col = mix(col, color(0xe2e4e0), isRoof);
  col = mix(col, color(0x0b0c0e), isLiner);
  col = mix(col, rimCol, isRim);
  col = mix(col, tyreCol, isTyre);

  // ---- Roughness & metalness: glossy paint, glass & lamps; matte plastics, rubber & tyres -----------------------------
  const plates = max(plateFront, plateRear);
  const lamps = max(max(headLens, lens), turnFront);
  const glossy = max(max(glass, mirrorGlass), lamps);
  const matte = max(max(max(isTrim, isTyre), isLiner), max(max(band, lowGrille), max(max(seal, under), max(vent, camper))));
  let rough = mix(float(0.24), float(0.1), glossy);
  rough = mix(rough, float(0.45), max(plates, isRim));
  rough = mix(rough, float(0.8), matte.mul(one.sub(plateFront)));
  let metal = mix(float(0.3), float(0.15), glass);
  metal = mix(metal, float(0.6), max(max(headLens, mirrorGlass), max(emblem, headBezel)));
  metal = mix(metal, float(0.3), isRim);
  metal = mix(metal, float(0.05), max(max(matte, plates), isRoof));

  // ---- Emissive: headlamps at night, tail & brake lamps, indicators, reverse lamps ----------------------------------
  const night = smoothstep(0.6, 1.15, cityUniforms.uInteriorGlow);
  const blink = max(state.y.mul(step(0.0, p.x)), state.z.mul(step(p.x, 0.0)));
  // lampState: x headlamps switched on (the van being driven), y high beam (brighter lenses)
  const lampState = uniform(new THREE.Vector2(1, 0));
  const headlamps = color(0xfff8ec).mul(headLens.mul(lampState.y.mul(2.6).add(2.2))).mul(night).mul(lampState.x);
  const tail = color(0xff0a12).mul(redLens.mul(state.x.mul(2.1).add(night.mul(0.45))));
  const turn = color(0xff9a14).mul(max(turnFront, turnRear).mul(blink).mul(2.2));
  const reverse = color(0xf0f6ff).mul(reverseLens.mul(state.w).mul(1.8));
  const plateLight = color(0xfff4e0).mul(plateRear.mul(night).mul(0.25));

  const mat = new THREE.MeshStandardNodeMaterial();
  mat.colorNode = col;
  mat.roughnessNode = rough;
  mat.metalnessNode = metal;
  mat.emissiveNode = headlamps.add(tail).add(turn).add(reverse).add(plateLight);
  mat.userData.carState = state;
  mat.userData.lampState = lampState;
  _material = mat;
  return mat;
}

export { T3, buildVwT3Geometry, buildVwT3WheelGeo, createVwT3Material, upgradeVwT3Body };
