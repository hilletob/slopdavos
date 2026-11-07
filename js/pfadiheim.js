import * as THREE from 'three/webgpu';
import { abs, float, fract, fwidth, mix, mx_noise_float, positionLocal, positionWorld, sin, smoothstep, step, texture, time, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { snowyRoof } from './season.js';
import { cityUniforms } from './tsl-materials.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { glassMaterial } from './detail-houses.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { toWorld } from './detail-houses-data.js';
import { PFADIHEIM, PFADIHEIM_DOOR, PFADIHEIM_START, pfadiheimFrame } from './pfadiheim-data.js';

export { PFADIHEIM, PFADIHEIM_DOOR, PFADIHEIM_START };

// The Pfadiheim Davos (Eisbahnstrasse 5), the scouts' holiday house by the Eisbahn, built by hand after the photographs
// on pfadiheimdavos.ch (assets/pfadi/photos) in place of its swissBUILDINGS3D volume (left out of the streamed tiles)
// and of the OSM building's hanging shop sign: three storeys clad in vertical larch boards (orange on the sunny front
// and the south-west end, weathered silver-grey on the north-east end and the back) on a concrete plinth, a low hipped
// roof on wide eaves with the rafters showing; seven bays of white three-pane windows, red roller blinds half of them
// down on the first floor's east bays and the ground floor's; along the front the veranda (a concrete slab with a steel
// railing, its stair down at the north-east end) under a white canopy with downlights, the red entrance door with the
// "PFADIHEIM" board beside it, the HCD Fanshop's window and door; the lilies and "PFADIHEIM" high on the north-east end
// (photographs, assets/pfadi/pfadiheim-atlas.webp); the shed by the north-east end. On the forecourt the flagpole with
// the Pfadi Battasendas flag (pfadidavos.ch's logo), the ping-pong table and a picnic table, the Pfadiheim's board by
// the path. Built in the house's local frame (pfadiheim-data.js: x along the front to the north-east end, z out of the
// front, y up from the forecourt), merged into one mesh per material (13 draw calls).

excludeBuildings([PFADIHEIM.exclude]);
SHOP_EXCLUSIONS.add(PFADIHEIM.osm);

const ATLAS_URL = new URL('../assets/pfadi/pfadiheim-atlas.webp', import.meta.url);
// The atlas' pieces (px, top-left origin, 1024²): the board by the door and the lettering on the north-east end
// (IMG_5402.jpg, Pfadi_029.jpg rectified), the Fanshop's window (15-11-Pfadiheim-Davos_121.jpg), the flag, the board
const ATLAS = {
  sign: [0, 0, 512, 364], gable: [512, 0, 512, 288], fanshop: [0, 384, 512, 264], flag: [512, 320, 512, 344], board: [0, 672, 512, 256]
};

// --- Materials (linear colours) ------------------------------------------------------------------------------------------
// The walls' uv is metres along the wall and over the ground: boards 12.5 cm wide with their joints, the floors' seams
function cladding(light, dark, seamDepth = 0.45) {
  const U = uv();
  const grain = mx_noise_float(positionWorld.mul(vec3(0.9, 0.12, 0.9))).mul(0.5).add(0.5);
  const board = mx_noise_float(vec3(U.x.div(0.125).floor().mul(3.1), 0, 0)).mul(0.5).add(0.5); // (each board its own tone)
  const tone = mix(dark, light, grain.mul(0.6).add(board.mul(0.4)));
  // (the joints fade into their mean darkening where they get finer than a pixel: no moiré at a distance)
  const aa = smoothstep(0.15, 0.5, fwidth(U.x.div(0.125)));
  const joint = mix(smoothstep(0.4, 0.5, abs(fract(U.x.div(0.125)).sub(0.5))), float(0.2), aa);
  const floorSeam = float(0).add(smoothstep(0.035, 0.0, abs(U.y.sub(4.3)))).add(smoothstep(0.035, 0.0, abs(U.y.sub(7.4))));
  return tone.mul(float(1).sub(joint.mul(seamDepth))).mul(float(1).sub(floorSeam.clamp(0, 1).mul(0.5)));
}
function materials() {
  const std = (props, colorNode) => { const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, ...props }); if (colorNode) m.colorNode = colorNode; return m; };
  const weather = mx_noise_float(positionWorld.mul(0.4)).mul(0.5).add(0.5);
  const M = {};
  // larch, fresh on the sunny sides (the photographs' orange), silver-grey where the weather has had it
  M.larch = std({ roughness: 0.88 }, cladding(vec3(0.56, 0.25, 0.095), vec3(0.38, 0.155, 0.05)));
  const grey = cladding(vec3(0.52, 0.48, 0.42), vec3(0.34, 0.31, 0.27), 0.5);
  // (some brown left low down under the eaves' shelter of the plinth and in streaks)
  M.greyLarch = std({ roughness: 0.92 }, mix(grey, vec3(0.3, 0.17, 0.08), smoothstep(0.62, 0.85, mx_noise_float(positionWorld.mul(vec3(1.5, 0.08, 1.5)))).mul(0.45)));
  M.concrete = std({ roughness: 0.95 }, mix(vec3(0.32, 0.32, 0.31), vec3(0.42, 0.42, 0.4), weather));
  M.white = std({ roughness: 0.55 }, vec3(0.78, 0.78, 0.76));
  M.dark = std({ roughness: 0.6 }, vec3(0.05, 0.055, 0.06));
  M.timber = std({ roughness: 0.85 }, mix(vec3(0.12, 0.05, 0.018), vec3(0.2, 0.085, 0.03), weather));
  // the roof: dark sheet metal in standing seams, snow on it in winter
  const seam = smoothstep(0.44, 0.5, abs(fract(positionWorld.x.add(positionWorld.z).div(0.55)).sub(0.5)));
  M.roof = std({ roughness: 0.6, metalness: 0.3 }, snowyRoof(vec3(0.06, 0.062, 0.065).mul(float(1).sub(seam.mul(0.3))), float(1)));
  M.metal = std({ roughness: 0.4, metalness: 0.7 }, vec3(0.5, 0.52, 0.53));
  // red: the roller blinds (slats from uv.y; the frames have uv 0) and the door's frame
  const slat = smoothstep(0.75, 0.95, fract(uv().y.div(0.07)));
  M.red = std({ roughness: 0.55 }, vec3(0.55, 0.025, 0.03).mul(float(1).sub(slat.mul(0.35))));
  // the downlights under the canopy: lit from dusk on
  M.lamp = std({ roughness: 0.4 }, vec3(0.8, 0.8, 0.78));
  M.lamp.emissiveNode = vec3(1.0, 0.78, 0.5).mul(smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow).mul(2.2));
  M.glass = glassMaterial();
  return M;
}

function decalMaterial(map) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0, transparent: true });
  const t = texture(map, uv());
  m.colorNode = t.rgb.mul(0.85); // (the photographs are in full sun)
  m.opacityNode = t.a;
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  return m;
}
// The flag: waving from the pole (local x = 0) out to its fly end, more the farther out
function flagMaterial(map) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  m.colorNode = texture(map, uv()).rgb;
  const x = positionLocal.x;
  const wave = sin(x.mul(3.2).sub(time.mul(4.3))).mul(0.09).add(sin(x.mul(5.1).sub(time.mul(6.7)).add(positionLocal.y.mul(2))).mul(0.04)).mul(x.div(1.5));
  m.positionNode = positionLocal.add(vec3(0, wave.mul(-0.3), wave));
  return m;
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
class Builder {
  constructor() { this.parts = new Map(); }
  add(mat, g) {
    g = g.index ? g.toNonIndexed() : g;
    g.clearGroups();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'uv1'].includes(name)) g.deleteAttribute(name);
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.uv1) g.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }
  box(mat, sx, sy, sz, x, y, z, { ry = 0, rx = 0, rz = 0 } = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return this.add(mat, g);
  }
  // a box from (x0, y0, z0) to (x1, y1, z1)
  span(mat, x0, x1, y0, y1, z0, z1) { return this.box(mat, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); }
  cylinder(mat, r, h, x, y, z, seg = 10) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(x, y, z);
    return this.add(mat, g);
  }
  meshes(M) {
    return [...this.parts].map(([key, list]) => {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), M[key]);
      mesh.castShadow = !['glass', 'lamp', 'decal'].includes(key);
      mesh.receiveShadow = true;
      mesh.name = `pfadiheim ${key}`;
      return mesh;
    });
  }
}

// The faces: the outward axis and its sign, and how the shape's x runs along the wall (so that ShapeGeometry's +z turns
// outward; flip × a is the viewer's right)
const FACES = {
  S: { axis: 'z', out: 1, flip: 1 }, N: { axis: 'z', out: -1, flip: -1 },
  E: { axis: 'x', out: 1, flip: -1 }, W: { axis: 'x', out: -1, flip: 1 }
};
const onFace = (face, plane, a, y, d = 0) => {
  const F = FACES[face], o = plane + F.out * d;
  return F.axis === 'z' ? [a, y, o] : [o, y, a];
};

// A flat piece of wall: the polygon pts ([a, y]) on the plane of `face`, with rectangular holes [a0, a1, y0, y1]; uv in
// metres (a, y), or `uvOf(a, y)`
function wallPiece(face, plane, pts, holes = [], uvOf = null) {
  const F = FACES[face];
  const shape = new THREE.Shape(pts.map(([a, y]) => new THREE.Vector2(F.flip * a, y)));
  for (const [a0, a1, y0, y1] of holes) shape.holes.push(new THREE.Path([[a0, y0], [a1, y0], [a1, y1], [a0, y1]].map(([a, y]) => new THREE.Vector2(F.flip * a, y))));
  const g = new THREE.ShapeGeometry(shape).toNonIndexed();
  const p = g.attributes.position, n = p.count;
  const nor = new Float32Array(n * 3), uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = F.flip * p.getX(i), y = p.getY(i);
    if (F.axis === 'z') p.setXYZ(i, a, y, plane); else p.setXYZ(i, plane, y, a);
    nor[i * 3 + (F.axis === 'z' ? 2 : 0)] = F.out;
    [uvs[i * 2], uvs[i * 2 + 1]] = uvOf ? uvOf(a, y) : [a, y];
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}
const rectPts = (a0, a1, y0, y1) => [[a0, y0], [a1, y0], [a1, y1], [a0, y1]];

// A flat quad on a face showing an atlas piece (`key`) over a0..a1 × y0..y1, d out from the plane
function decal(B, face, plane, a0, a1, y0, y1, key, d = 0.02) {
  const F = FACES[face], [rx, ry, rw, rh] = ATLAS[key];
  const r0 = Math.min(F.flip * a0, F.flip * a1), span = Math.abs(a1 - a0);
  B.add('decal', wallPiece(face, plane + F.out * d, rectPts(a0, a1, y0, y1), [], (a, y) => [
    (rx + ((F.flip * a - r0) / span) * rw) / 1024, (ry + ((y1 - y) / (y1 - y0)) * rh) / 1024
  ]));
}

// A quad from four corners (flat-shaded), turned to face `up` if given
function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.computeVertexNormals();
  return g;
}
function tri(a, b, c, wantUp) {
  const g = new THREE.BufferGeometry();
  const e1 = b.map((v, i) => v - a[i]), e2 = c.map((v, i) => v - a[i]);
  const ny = e1[2] * e2[0] - e1[0] * e2[2];
  g.setAttribute('position', new THREE.Float32BufferAttribute((ny > 0) === wantUp ? [...a, ...b, ...c] : [...a, ...c, ...b], 3));
  g.computeVertexNormals();
  return g;
}

// A window: the hole's reveal back to the glass, the sill, the frame round the glass and its mullions, the glass (lit at
// night, js/detail-houses.js glassMaterial), a red roller blind let down by `blind` (0–1) in front of it
let windowId = 0;
function windowIn(B, face, plane, [a0, a1, y0, y1], { depth = 0.16, panes = 3, blind = 0, cellar = false } = {}) {
  const F = FACES[face];
  const P = (a, y, d) => onFace(face, plane, a, y, d);
  const ring = [[a0, y0], [a1, y0], [a1, y1], [a0, y1]], mid = P((a0 + a1) / 2, (y0 + y1) / 2, -depth / 2);
  for (let k = 0; k < 4; k++) {
    const [pa, py] = ring[k], [qa, qy] = ring[(k + 1) % 4];
    const c = [P(pa, py, 0), P(qa, qy, 0), P(qa, qy, -depth), P(pa, py, -depth)];
    const e1 = c[1].map((v, j) => v - c[0][j]), e2 = c[3].map((v, j) => v - c[0][j]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const toMid = mid.map((v, j) => v - (c[0][j] + c[2][j]) / 2);
    B.add('white', n[0] * toMid[0] + n[1] * toMid[1] + n[2] * toMid[2] > 0 ? quad(...c) : quad(c[0], c[3], c[2], c[1]));
  }
  const w = a1 - a0, h = y1 - y0, along = (len, a, y, d, sa, sy, sd) => {
    const [x, yy, z] = P(a, y, d);
    B.box(sd === undefined ? 'white' : sd, F.axis === 'z' ? sa : len, sy, F.axis === 'z' ? len : sa, x, yy, z);
  };
  // the sill, standing out under it (not under a door)
  if (!cellar) { const [sx, sy, sz] = P((a0 + a1) / 2, y0 - 0.025, 0.05); B.box('white', F.axis === 'z' ? w + 0.1 : 0.16, 0.05, F.axis === 'z' ? 0.16 : w + 0.1, sx, sy, sz); }
  // the frame round the glass and the mullions (6 cm), just in front of it
  const fd = -depth + 0.04, t = 0.06;
  along(0.05, (a0 + a1) / 2, y0 + t / 2, fd, w, t);
  along(0.05, (a0 + a1) / 2, y1 - t / 2, fd, w, t);
  // (panes 0: the frame's sides only, as the Fanshop's window; the mullions would sit at 0/0 = NaN)
  for (let i = 0; i <= Math.max(1, panes); i++) along(0.05, a0 + t / 2 + ((w - t) * i) / Math.max(1, panes), (y0 + y1) / 2, fd, t, h);
  // the glass
  const g = wallPiece(face, plane - F.out * depth, rectPts(a0, a1, y0, y1), []);
  const p = g.attributes.position, uvs = g.attributes.uv, n = p.count, uv1 = new Float32Array(n * 2);
  const id = ++windowId;
  for (let i = 0; i < n; i++) {
    const a = F.axis === 'z' ? p.getX(i) : p.getZ(i);
    uvs.setXY(i, Math.abs(a - a0) / w, (p.getY(i) - y0) / h);
    uv1[i * 2] = id; uv1[i * 2 + 1] = cellar ? 1 : 0;
  }
  g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  B.add('glass', g);
  // the roller blind: its box at the head, the slats let down over the glass
  if (blind > 0) {
    const yb = y1 - h * blind;
    B.add('red', wallPiece(face, plane - F.out * (depth - 0.08), rectPts(a0 + 0.04, a1 - 0.04, yb, y1 - 0.02)));
  }
}

// --- The house -----------------------------------------------------------------------------------------------------------
function buildHouse(B, m) {
  const [X0, X1] = m.walls.x, [Z0, Z1] = m.walls.z, E = m.eaves, pT = m.plinthTop;
  const [g0, f1, f2] = m.floors;
  const bay = (k) => X0 + (X1 - X0) * (k + 0.5) / 7; // the seven bays along the long sides
  // windows per face: [a0, a1, y0, y1, options]
  const W = { S: [], N: [], E: [], W: [], plinthS: [], plinthW: [] };
  const win = (list, c, w, sill, h, o = {}) => list.push([c - w / 2, c + w / 2, sill, sill + h, o]);
  // Front: the upper floors' seven bays, red blinds down on the first floor's east bays
  for (let k = 0; k < 7; k++) {
    win(W.S, bay(k), 1.55, f1 + 0.8, 1.55, { blind: k === 4 ? 1 : k === 5 ? 1 : k === 6 ? 0.75 : 0 });
    win(W.S, bay(k), 1.55, f2 + 0.8, 1.55, { blind: k === 1 ? 0.3 : 0 });
  }
  // the ground floor: the window west of the veranda, the two east ones with their blinds down (as on the photos)
  win(W.S, bay(0), 1.5, g0 + 0.85, 1.35);
  win(W.S, bay(5), 1.5, g0 + 0.85, 1.35, { blind: 1 });
  win(W.S, bay(6), 1.5, g0 + 0.85, 1.35, { blind: 0.9 });
  // the cellar windows in the plinth, under the veranda and west of it
  for (const k of [0, 1, 3, 4, 6]) win(W.plinthS, bay(k), k === 0 ? 1.1 : 1.0, 0.12, 0.7, { cellar: true, panes: 2, depth: 0.12 });
  // Back: seven bays on every floor
  for (let k = 0; k < 7; k++) for (const [f, h] of [[g0, 1.25], [f1, 1.3], [f2, 1.3]]) win(W.N, bay(k), 1.2, f + 0.9, h, { panes: 2 });
  // The south-west end: three columns of tall narrow windows, cellar windows under them
  for (const z of [-3.6, -0.1, 3.4]) {
    for (const f of [g0, f1, f2]) win(W.W, z, 0.8, f + 0.75, 1.45, { panes: 1 });
    if (z > -1) win(W.plinthW, z, 0.7, 0.2, 0.55, { cellar: true, panes: 1, depth: 0.12 });
  }
  // The north-east end: the lettering high up towards the front, windows towards the back (the shed before the
  // ground floor's front half)
  for (const z of [-0.6, -3.6]) for (const f of [g0, f1, f2]) win(W.E, z, 1.2, f + 0.85, 1.3, { panes: 2 });
  win(W.E, 3.0, 1.2, f1 + 0.85, 1.3, { panes: 2 });

  // Doors and the Fanshop window: holes in the front, filled below
  const [d0, d1] = m.door, [fd0, fd1] = m.fanDoor, [s0, s1] = m.fanshop;
  const doorTop = g0 + 2.15, fanTop = 3.57;
  const frontHoles = [...W.S.map((w) => w.slice(0, 4)), [d0, d1, g0, doorTop], [fd0, fd1, g0, doorTop], [s0, s1, 1.4, fanTop]];

  // The walls: larch from the plinth's top to the eaves, the concrete plinth down into the ground
  const P = (face, plane, a0, a1, mat, holes, y0 = pT, y1 = E) => B.add(mat, wallPiece(face, plane, rectPts(a0, a1, y0, y1), holes));
  P('S', Z1, X0, X1, 'larch', frontHoles);
  P('N', Z0, X0, X1, 'greyLarch', W.N.map((w) => w.slice(0, 4)));
  P('W', X0, Z0, Z1, 'larch', W.W.map((w) => w.slice(0, 4)));
  P('E', X1, Z0, Z1, 'greyLarch', W.E.map((w) => w.slice(0, 4)));
  const pd = 0.03; // (the plinth 3 cm proud)
  P('S', Z1 + pd, X0 - pd, X1 + pd, 'concrete', W.plinthS.map((w) => w.slice(0, 4)), -3, pT);
  P('N', Z0 - pd, X0 - pd, X1 + pd, 'concrete', [], -3, pT);
  P('W', X0 - pd, Z0 - pd, Z1 + pd, 'concrete', W.plinthW.map((w) => w.slice(0, 4)), -3, pT);
  P('E', X1 + pd, Z0 - pd, Z1 + pd, 'concrete', [], -3, pT);
  // (the plinth's top edge, a small drip ledge)
  B.span('concrete', X0 - 0.06, X1 + 0.06, pT - 0.06, pT, Z1 - 0.1, Z1 + 0.06);
  B.span('concrete', X0 - 0.06, X1 + 0.06, pT - 0.06, pT, Z0 - 0.06, Z0 + 0.1);
  for (const [face, plane, list] of [['S', Z1, W.S], ['N', Z0, W.N], ['W', X0, W.W], ['E', X1, W.E], ['S', Z1 + pd, W.plinthS], ['W', X0 - pd, W.plinthW]]) {
    for (const [a0, a1, y0, y1, o] of list) windowIn(B, face, plane, [a0, a1, y0, y1], o);
  }

  // The entrance: the red door (its frame, the glass, a white kick panel), the Fanshop's dark door, its window (the
  // photograph, behind the glass line)
  const doorIn = (a0, a1, frameMat) => {
    windowIn(B, 'S', Z1, [a0, a1, g0, doorTop], { depth: 0.12, panes: 1, cellar: false });
    const fz = Z1 - 0.06;
    B.span(frameMat, a0, a0 + 0.1, g0, doorTop, fz - 0.05, fz + 0.03);
    B.span(frameMat, a1 - 0.1, a1, g0, doorTop, fz - 0.05, fz + 0.03);
    B.span(frameMat, a0, a1, doorTop - 0.1, doorTop, fz - 0.05, fz + 0.03);
    B.span(frameMat, a0, a1, g0, g0 + 0.32, fz - 0.05, fz + 0.03);
    B.span('metal', a1 - 0.3, a1 - 0.14, g0 + 1.02, g0 + 1.06, fz + 0.03, fz + 0.09);
  };
  doorIn(d0, d1, 'red');
  doorIn(fd0, fd1, 'dark');
  windowIn(B, 'S', Z1, [s0, s1, 1.4, fanTop], { depth: 0.1, panes: 0 });
  decal(B, 'S', Z1 - 0.07, s0, s1, 1.4, fanTop, 'fanshop', 0);
  // the "PFADIHEIM" board with the lilies beside the door, the house number, the letter boxes
  decal(B, 'S', Z1, d1 + 0.25, d1 + 1.75, g0 + 1.15, g0 + 2.22, 'sign', 0.025);
  B.span('dark', d0 - 0.45, d0 - 0.25, g0 + 2.05, g0 + 2.2, Z1, Z1 + 0.02);
  B.span('white', d0 - 1.05, d0 - 0.6, g0 + 1.1, g0 + 1.45, Z1, Z1 + 0.14);
  B.span('red', d0 - 0.45, d0 - 0.3, g0 + 1.3, g0 + 1.48, Z1, Z1 + 0.12);
  // the lettering high on the north-east end (feathered into the grey boards)
  decal(B, 'E', X1, 0.55, 4.55, f2 + 1.0, f2 + 1.0 + 4.0 * 288 / 512, 'gable', 0.02);

  // The veranda: the slab, its railing (posts, bars, rails), the stair down to the north-east with its railing
  const v = m.veranda, vz = Z1 + v.depth, vy = v.y;
  B.span('concrete', v.x[0], v.x[1], vy - 0.25, vy, Z1, vz);
  const railH = 1.0;
  const bars = (ax, az, bx, bz, ya, yb) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.13));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ya + (yb - ya) * t;
      B.box('metal', 0.018, railH - 0.06, 0.018, x, y + railH / 2, z);
    }
    const ang = Math.atan2(yb - ya, len), yaw = Math.atan2(bx - ax, bz - az);
    for (const hy of [railH, 0.08]) {
      const g = new THREE.BoxGeometry(0.045, 0.045, Math.hypot(len, yb - ya));
      g.rotateX(-ang); g.rotateY(yaw);
      g.translate((ax + bx) / 2, (ya + yb) / 2 + hy, (az + bz) / 2);
      B.add('metal', g);
    }
  };
  bars(v.x[0] + 0.03, vz - 0.04, v.x[1], vz - 0.04, vy, vy);
  bars(v.x[0] + 0.03, Z1 + 0.05, v.x[0] + 0.03, vz - 0.04, vy, vy);
  const st = m.stair, sz0 = Z1 + 0.1, sz1 = sz0 + st.depth, steps = 6, run = (st.x[1] - st.x[0]) / steps, rise = vy / (steps + 1);
  for (let i = 0; i < steps; i++) B.span('concrete', st.x[0] + i * run, st.x[0] + (i + 1) * run, -0.6, vy - (i + 1) * rise, sz0, sz1);
  // (the stair's sloping concrete cheek on its outer side, as on IMG_5402)
  const cheek = new THREE.Shape([new THREE.Vector2(st.x[0], -0.6), new THREE.Vector2(st.x[1] + 0.2, -0.6), new THREE.Vector2(st.x[1] + 0.2, 0.05), new THREE.Vector2(st.x[0], vy + 0.05)]);
  const cg = new THREE.ExtrudeGeometry(cheek, { depth: 0.14, bevelEnabled: false });
  cg.translate(0, 0, sz1);
  B.add('concrete', cg);
  bars(st.x[0], sz1 + 0.07, st.x[1] + 0.15, sz1 + 0.07, vy, 0.05);

  // The canopy over the veranda and the ground floor: white, a dark edge, downlights
  const c = m.canopy, cz = Z1 + c.depth;
  B.span('white', c.x[0], c.x[1], c.y, c.y + 0.16, Z1, cz);
  B.span('dark', c.x[0] - 0.02, c.x[1] + 0.02, c.y + 0.1, c.y + 0.22, cz - 0.04, cz + 0.02);
  for (let x = c.x[0] + 2.2; x < c.x[1] - 0.5; x += 3.5) B.cylinder('lamp', 0.11, 0.03, x, c.y - 0.012, Z1 + c.depth * 0.55, 12);
  B.cylinder('lamp', 0.11, 0.03, (d0 + d1) / 2, c.y - 0.012, Z1 + 0.6, 12);

  // The low hipped roof: the slopes, their soffit underneath, the fascia, the rafters under the eaves
  const o = m.roof.overhang, k = m.roof.slope, th = m.roof.thickness;
  const rx = X1 + o, rz = Z1 + o, yEdge = E + th - k * o, half = rz, yRidge = yEdge + k * half, ridge = rx - half;
  const roofFaces = (dy, mat, up) => {
    const A = (x, y, z) => [x, y + dy, z];
    const corners = [A(-rx, yEdge, rz), A(rx, yEdge, rz), A(rx, yEdge, -rz), A(-rx, yEdge, -rz)], r0 = A(-ridge, yRidge, 0), r1 = A(ridge, yRidge, 0);
    for (const [a, b, cc] of [[corners[0], corners[1], r1], [corners[0], r1, r0], [corners[2], corners[3], r0], [corners[2], r0, r1], [corners[1], corners[2], r1], [corners[3], corners[0], r0]]) B.add(mat, tri(a, b, cc, up));
  };
  roofFaces(0, 'roof', true);
  roofFaces(-th, 'timber', false);
  B.span('timber', -rx - 0.03, rx + 0.03, yEdge - th - 0.08, yEdge + 0.02, rz - 0.03, rz + 0.03);
  B.span('timber', -rx - 0.03, rx + 0.03, yEdge - th - 0.08, yEdge + 0.02, -rz - 0.03, -rz + 0.03);
  B.span('timber', rx - 0.03, rx + 0.03, yEdge - th - 0.08, yEdge + 0.02, -rz, rz);
  B.span('timber', -rx - 0.03, -rx + 0.03, yEdge - th - 0.08, yEdge + 0.02, -rz, rz);
  B.span('metal', -rx, rx, yEdge - th - 0.02, yEdge + 0.04, rz + 0.03, rz + 0.13);
  B.span('metal', -rx, rx, yEdge - th - 0.02, yEdge + 0.04, -rz - 0.13, -rz - 0.03);
  const ang = Math.atan(k), rl = o / Math.cos(ang) + 0.05, ry = E - k * o / 2 - 0.08;
  for (let x = X0 + 0.4; x < X1; x += 0.9) for (const s of [1, -1]) B.box('timber', 0.1, 0.15, rl, x, ry, s * (Z1 + o / 2), { rx: s * ang });
  for (let z = Z0 + 0.4; z < Z1; z += 0.9) for (const s of [1, -1]) B.box('timber', rl, 0.15, 0.1, s * (X1 + o / 2), ry, z, { rz: -s * ang });
  B.box('roof', 2 * ridge + 0.2, 0.06, 0.3, 0, yRidge + 0.02, 0);
}

// The shed by the north-east end: larch boards, a dark door, a flat roof falling to the back
function buildShed(B, m) {
  const s = m.shed, [x0, x1] = s.x, [z0, z1] = s.z, top = s.top;
  const P = (face, plane, a0, a1) => B.add('larch', wallPiece(face, plane, rectPts(a0, a1, -1, top)));
  P('S', z1, x0, x1); P('N', z0, x0, x1); P('E', x1, z0, z1); P('W', x0, z0, z1);
  B.span('timber', x0 + 0.6, x0 + 1.6, 0, 2.0, z1, z1 + 0.04);
  const g = new THREE.BoxGeometry(x1 - x0 + 0.5, 0.12, z1 - z0 + 0.5);
  g.rotateX(-0.05);
  g.translate((x0 + x1) / 2, top + 0.08, (z0 + z1) / 2);
  B.add('roof', g);
  B.span('timber', x0 - 0.25, x1 + 0.25, top - 0.06, top + 0.16, z1 + 0.22, z1 + 0.27);
}

// The forecourt: the flagpole (its flag a separate, waving mesh), the ping-pong table, the picnic table, the bench by
// the plinth, the Pfadiheim's board by the path
const PROPS = { flagpole: [-12.2, 12.6], pingpong: [-2.2, 10.8], picnic: [8.6, 10.6], board: [-14.4, 9.0], bench: [-10.6, 6.3] };
function buildProps(B, ground) {
  const [fx, fz] = PROPS.flagpole, fy = ground(fx, fz);
  B.cylinder('metal', 0.06, 8.6, fx, fy + 4.3 - 0.3, fz, 12);
  B.add('white', new THREE.SphereGeometry(0.1, 10, 8).translate(fx, fy + 8.05, fz));
  B.cylinder('concrete', 0.3, 0.3, fx, fy + 0.05, fz, 12);
  // Ping-pong table (the Cornilleau of IMG_5402): the dark top, the net, the galvanised arches
  {
    const [x, z] = PROPS.pingpong, y = ground(x, z);
    B.span('dark', x - 1.37, x + 1.37, y + 0.72, y + 0.76, z - 0.76, z + 0.76);
    B.span('white', x - 1.37, x + 1.37, y + 0.755, y + 0.762, z - 0.01, z + 0.01);
    B.span('white', x - 0.01, x + 0.01, y + 0.76, y + 0.92, z - 0.88, z + 0.88);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('metal', 0.07, 0.85, 0.07, x + sx * 0.95, y + 0.36, z + sz * 0.55, { rz: sx * 0.35 });
  }
  // Picnic table with its two benches
  {
    const [x, z] = PROPS.picnic, y = ground(x, z);
    B.span('timber', x - 0.9, x + 0.9, y + 0.72, y + 0.77, z - 0.38, z + 0.38);
    for (const sz of [-1, 1]) B.span('timber', x - 0.9, x + 0.9, y + 0.42, y + 0.46, z + sz * 0.72 - 0.15, z + sz * 0.72 + 0.15);
    for (const sx of [-0.7, 0.7]) for (const sz of [-1, 1]) B.box('timber', 0.08, 0.95, 0.08, x + sx, y + 0.38, z + sz * 0.4, { rx: sz * 0.62 });
  }
  // The bench against the plinth west of the veranda
  {
    const [x, z] = PROPS.bench, y = ground(x, z);
    B.span('timber', x - 0.9, x + 0.9, y + 0.43, y + 0.47, z - 0.2, z + 0.2);
    for (const sx of [-0.75, 0.75]) B.span('metal', x + sx - 0.03, x + sx + 0.03, y, y + 0.43, z - 0.18, z + 0.18);
  }
}

// --- Build ---------------------------------------------------------------------------------------------------------------
async function loadAtlas() {
  if (typeof fetch !== 'function' || typeof createImageBitmap !== 'function') throw new Error('no fetch');
  const res = await fetch(ATLAS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none' });
  const map = new THREE.Texture(bitmap);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false; // (v down, as the atlas' px)
  map.anisotropy = 8;
  map.needsUpdate = true;
  return map;
}

/**
 * Builds the Pfadiheim into `scene`. Returns { group, colliders } (colliders at world heights: baseY set, so
 * liftColliders leaves them be).
 */
export function buildPfadiheim(scene) {
  const fr = pfadiheimFrame(), m = PFADIHEIM.model;
  const root = new THREE.Group();
  root.name = 'Pfadiheim';
  root.userData.terrain = 'absolute';
  // y = 0: the forecourt's ground in front of the house (the mean along the front, a few metres out)
  const front = [-10, -5, 0, 5, 10].map((x) => groundHeight(...toWorld(fr, x, m.walls.z[1] + 3)));
  const baseY = front.reduce((s, h) => s + h, 0) / front.length;
  root.position.set(fr.cx, baseY, fr.cz);
  root.rotation.y = fr.theta;
  const ground = (lx, lz) => groundHeight(...toWorld(fr, lx, lz)) - baseY;

  const M = materials(), B = new Builder();
  buildHouse(B, m);
  buildShed(B, m);
  buildProps(B, ground);
  // (the board by the path, turned towards the Eisbahnstrasse's end and the forecourt)
  const boardGroup = new THREE.Group();
  {
    const [x, z] = PROPS.board, y = ground(x, z), Bb = new Builder();
    for (const sx of [-0.62, 0.62]) Bb.span('timber', sx - 0.05, sx + 0.05, -0.4, 1.95, -0.05, 0.05);
    Bb.span('timber', -0.75, 0.75, 1.1, 1.92, -0.06, -0.02);
    decal(Bb, 'S', -0.02, -0.7, 0.7, 1.15, 1.85, 'board', 0.005);
    boardGroup.position.set(x, y, z);
    boardGroup.rotation.y = -0.75;
    boardGroup.userData.builder = Bb;
  }
  const meshes = B.meshes(M);
  root.add(...meshes.filter((x) => !x.name.endsWith('decal')));
  const boardMeshes = boardGroup.userData.builder.meshes(M);
  boardGroup.add(...boardMeshes.filter((x) => !x.name.endsWith('decal')));
  root.add(boardGroup);

  // The photographs and the flag, once the atlas is in (until then the walls are plain)
  const decals = [[meshes, root], [boardMeshes, boardGroup]].flatMap(([list, parent]) => list.filter((x) => x.name.endsWith('decal')).map((d) => [d, parent]));
  loadAtlas().then((map) => {
    const dm = decalMaterial(map);
    for (const [d, parent] of decals) { d.material = dm; d.castShadow = false; parent.add(d); }
    const [x, z] = PROPS.flagpole, y = ground(x, z);
    const g = new THREE.PlaneGeometry(1.5, 1.0, 14, 6);
    g.translate(0.75, 0, 0);
    const [ax, ay, aw, ah] = ATLAS.flag, p = g.attributes.position, uvs = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uvs.setXY(i, (ax + (p.getX(i) / 1.5) * aw) / 1024, (ay + (0.5 - p.getY(i)) * ah) / 1024);
    const flag = new THREE.Mesh(g, flagMaterial(map));
    flag.name = 'pfadiheim flag';
    flag.position.set(x + 0.07, y + 7.35, z);
    flag.rotation.y = 0.5;
    flag.castShadow = true;
    root.add(flag);
  }).catch((error) => console.warn('[pfadiheim] the photographs were not loaded, plain walls', error));

  scene.add(root);

  // Colliders (world, absolute heights): the house, the veranda with its stair, the shed, the props
  const colliders = [];
  const cs = Math.cos(fr.theta), sn = Math.sin(fr.theta);
  const box = (x0, x1, z0, z1, h) => {
    const [cx, cz] = toWorld(fr, (x0 + x1) / 2, (z0 + z1) / 2), hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: baseY - 3, minY: baseY - 3, maxY: baseY + h, obb: { cx, cz, hx, hz, cs, sn } });
  };
  const [X0, X1] = m.walls.x, [Z0, Z1] = m.walls.z;
  box(X0, X1, Z0, Z1, 12.5);
  box(m.veranda.x[0], m.stair.x[1] + 0.2, Z1, Z1 + m.veranda.depth, m.veranda.y + 1.0);
  box(m.shed.x[0], m.shed.x[1], m.shed.z[0], m.shed.z[1], m.shed.top + 0.2);
  const [fx, fz] = PROPS.flagpole; box(fx - 0.15, fx + 0.15, fz - 0.15, fz + 0.15, 8.5);
  const [px, pz] = PROPS.pingpong; box(px - 1.37, px + 1.37, pz - 0.76, pz + 0.76, 0.8);
  const [qx, qz] = PROPS.picnic; box(qx - 0.9, qx + 0.9, qz - 0.9, qz + 0.9, 0.8);
  return { group: root, colliders };
}
