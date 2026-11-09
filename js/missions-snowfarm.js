import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceHeight } from './terrain.js';
import { VEHICLES, createToast, particles, lump } from './missions-work.js';
import {
  SNOWFARM, createSnowfarmRoute, createSnowfarmGrid, resetSnowfarmGrid, loopPose, onPad, bedCentre, stepLoading, stepSpread,
  stepTiller, coveredShare, groomedShare, nearestGap, nearestUngroomed
} from './missions-data-snowfarm.js';
import { routePoint } from './missions-data-work.js';

// js/missions-snowfarm.js
// The runtime of Snowfarming (js/missions-data-snowfarm.js has the definitions and the pure logic; js/missions.js takes
// SNOWFARM_FEATURES into its FEATURES):
//   snowfarm — the Loipe's snow as one mesh along the loop (a vertex a cell of the map, closed over the seam: the snow's
//              depth its height, buried under the grass where there is none; the old snow grey and lumpy with bits of
//              wood chips in it, the groomed snow smooth and white in the tiller's stripes), the trail's marker poles,
//              the depot (a heap under brown wood chips, half of it under white fleece weighed down with old tyres, its
//              west face cut open; solid for the controllers), the wheel loader shuttling between the face and the
//              bed, the tipper's bed rising and the snow running out behind it (js/missions-fx.js particles), the
//              snowcat parked beside the depot (taken out of its summer shed for the mission and put back after).
//   (the tipper itself is js/missions-work.js workVehicle's, on the player's car: its model is registered below in
//   VEHICLES as `snowfarmTipper`)
// Everything goes with the run's group and its cleanups.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const objectiveId = (run) => run.def.objectives[run.index]?.id;
const wrapPi = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; else if (a < -Math.PI) a += Math.PI * 2; return a; };
const mat = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.7, ...o });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const S = SNOWFARM;
// (the easing: smoothstep, and smoothstep over [a, b])
const ease = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const easeIn = (a, b, x) => ease((x - a) / (b - a));
// (the flying snow's ends, reused: lump() reads them only)
const _a = { x: 0, y: 0, z: 0 }, _b = { x: 0, y: 0, z: 0 }, _v = new THREE.Vector3();
/** A damped spring towards `target`: o[key] and o[key + 'V'] moved by dt (k the stiffness, z the damping ratio) */
function spring(o, key, target, k, z, dt) {
  const vk = key + 'V', c = 2 * z * Math.sqrt(k);
  // (two half steps: a stiff spring stays stable at 30 fps)
  for (let i = 0; i < 2; i++) {
    const h = dt / 2;
    o[vk] += (k * (target - o[key]) - c * o[vk]) * h;
    o[key] += o[vk] * h;
  }
}
/** A puff of snow dust at (x, y, z): it swells, drifts and thins out (the batch's 'smoke' kind, no gravity) */
function dust(pb, x, y, z, vx, vz, { size = 0.6, grow = 2.6, life = 1.6, alpha = 0.32, k = 0.9 } = {}) {
  pb.spawn({ x, y, z, vx: vx + (Math.random() - 0.5) * 0.8, vy: 0.35 + Math.random() * 0.5, vz: vz + (Math.random() - 0.5) * 0.8, drag: 1.4, life: life * (0.8 + Math.random() * 0.4), size0: size, size1: size + grow, alpha, r: k, g: k, b: k + 0.03, kind: 'smoke' });
}

// --- Models: boxes and cylinders in one geometry, coloured by vertex -------------------------------------------------
class Parts {
  constructor() { this.list = []; }
  add(geo, colour) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    _c.set(colour);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push(g);
    return this;
  }
  box(w, h, l, colour, x = 0, y = 0, z = 0, rx = 0) { return this.add(new THREE.BoxGeometry(w, h, l).rotateX(rx).translate(x, y, z), colour); }
  /** A cylinder of radius r and length `len` along the axis ('x' | 'y' | 'z') */
  cyl(r, len, colour, x, y, z, axis = 'x', seg = 14, r2 = r) {
    const g = new THREE.CylinderGeometry(r2, r, len, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    return this.add(g.translate(x, y, z), colour);
  }
  mesh(material, name) {
    const m = new THREE.Mesh(mergeGeometries(this.list), material);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}
const vcMat = (o = {}) => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.62, ...o });

/** A wheel whose axle is the mesh's x axis (js/missions-work.js workVehicle rolls it about x, steers it about y) */
function wheelMesh(r, w, dual, material) {
  const P = new Parts();
  const tyre = 0x18191b, rim = 0xb9bcbf, hub = 0x6b6e72;
  const off = dual ? w * 0.26 : 0;
  for (const dx of dual ? [-off, off] : [0]) {
    P.cyl(r, dual ? w * 0.48 : w, tyre, dx, 0, 0, 'x', 20);
    P.cyl(r * 0.62, (dual ? w * 0.48 : w) + 0.02, rim, dx, 0, 0, 'x', 14);
  }
  P.cyl(r * 0.22, w + 0.06, hub, 0, 0, 0, 'x', 8);
  // (the tread's blocks: something to see turning)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    P.add(new THREE.BoxGeometry(w * 0.98, 0.07, 0.12).translate(0, r - 0.015, 0).rotateX(a), 0x232427);
  }
  const m = P.mesh(material, 'Wheel');
  return m;
}

// --- The tipper: a three-axle municipal lorry with an orange cab and a grey tipping bed ------------------------------------
const TIPPER = { frontAxle: 2.85, rearAxles: [-1.55, -2.95], r: 0.53, hinge: { y: 1.38, z: -4.15 }, bed: { l: 5.65, w: 2.42, side: 1.15 } };
function buildFarmTipper() {
  const g = new THREE.Group();
  g.name = 'SnowfarmTipper';
  const material = vcMat();
  const orange = 0xe8731c, dark = 0x26282b, black = 0x141517, steel = 0x8f969c, glass = 0x26323d, white = 0xeeeeea;
  const C = new Parts();
  // the chassis, the fuel tank and the toolbox, the mudguards
  C.box(1.0, 0.32, 8.2, dark, 0, 0.92, -0.05);
  for (const x of [0.62, -0.62]) C.box(0.12, 0.42, 7.9, dark, x, 0.96, -0.1);
  C.cyl(0.32, 1.1, 0x9ea4a9, 1.0, 0.82, 0.95, 'z', 12);
  C.box(0.45, 0.5, 0.9, dark, -1.0, 0.85, 0.95);
  for (const [z, l] of [[TIPPER.frontAxle, 1.25], [(TIPPER.rearAxles[0] + TIPPER.rearAxles[1]) / 2, 2.75]]) for (const x of [1.08, -1.08]) C.box(0.62, 0.06, l, black, x, 1.18, z);
  // the cab (forward control): its body, the dark band of the windows, the windscreen, the grille, the bumper
  C.box(2.48, 1.55, 2.15, orange, 0, 1.92, 3.18);
  C.box(2.5, 0.95, 2.0, orange, 0, 3.1, 3.12);
  C.box(2.52, 0.1, 2.17, white, 0, 2.62, 3.18); // (the white band round it)
  C.box(2.22, 0.86, 0.06, glass, 0, 3.08, 4.13);
  for (const x of [1.255, -1.255]) { C.box(0.04, 0.78, 1.05, glass, x, 3.1, 3.55); C.box(0.04, 0.62, 0.7, glass, x, 3.12, 2.6); }
  C.box(1.7, 0.55, 0.05, 0x3a3c40, 0, 1.75, 4.27);
  for (let i = 0; i < 5; i++) C.box(1.6, 0.04, 0.06, 0x55585c, 0, 1.55 + i * 0.1, 4.29);
  C.box(2.5, 0.38, 0.3, black, 0, 1.12, 4.25);
  C.box(2.56, 0.12, 2.1, dark, 0, 3.62, 3.12); // the roof's edge
  C.box(1.1, 0.16, 0.5, 0x3a3c40, 0, 3.74, 2.4); // the roof's air vent
  // the lamps (white in front, the indicators amber)
  for (const x of [0.92, -0.92]) { C.box(0.36, 0.18, 0.05, 0xfff3d0, x, 1.38, 4.29); C.box(0.14, 0.12, 0.05, 0xffa21a, x * 1.18, 1.38, 4.29); }
  // the mirrors on their arms
  for (const s of [1, -1]) { C.box(0.5, 0.05, 0.05, black, s * 1.45, 3.35, 3.9); C.box(0.08, 0.55, 0.3, black, s * 1.7, 3.15, 3.9); }
  // the steps under the doors
  for (const x of [1.15, -1.15]) { C.box(0.3, 0.05, 0.6, steel, x, 1.0, 3.0); C.box(0.3, 0.05, 0.6, steel, x, 1.35, 3.0); }
  // the exhaust stack behind the cab, the hydraulic ram in front of the bed (it grows with the tipping)
  C.cyl(0.08, 1.6, steel, -1.0, 3.0, 1.95, 'y', 10);
  // the tail lights and the underrun bar
  for (const x of [1.05, -1.05]) C.box(0.35, 0.16, 0.06, 0x9e1a14, x, 0.98, -4.2);
  C.box(2.3, 0.14, 0.1, dark, 0, 0.62, -4.15);
  const body = C.mesh(material, 'TipperBody');
  g.add(body);
  // the bed tips about its hinge at the tail
  const bed = new THREE.Group();
  bed.position.set(0, TIPPER.hinge.y, TIPPER.hinge.z);
  const B = new Parts();
  const L = TIPPER.bed.l, W = TIPPER.bed.w, H = TIPPER.bed.side, z0 = 0.12, mid = z0 + L / 2;
  B.box(W, 0.14, L, steel, 0, 0.07, mid);
  for (const s of [1, -1]) {
    B.box(0.07, H, L, steel, s * W / 2, H / 2 + 0.07, mid);
    B.box(0.12, 0.1, L + 0.05, 0x6f767c, s * (W / 2 + 0.03), H + 0.07, mid); // (the top rail)
    for (let i = 0; i < 6; i++) B.box(0.1, H, 0.09, 0x6f767c, s * (W / 2 + 0.04), H / 2 + 0.07, z0 + 0.3 + (i * (L - 0.6)) / 5); // (the side posts)
  }
  B.box(W, H + 0.35, 0.1, steel, 0, (H + 0.35) / 2 + 0.07, z0 + L); // the front wall
  B.box(W, 0.08, 0.75, 0x6f767c, 0, H + 0.42, z0 + L + 0.3); // the cab guard over the cab's back
  for (const z of [0.8, 2.2, 3.6, 5.0]) B.box(W + 0.1, 0.16, 0.12, dark, 0, -0.06, z0 + z * (L / 5.65)); // (cross members under the floor)
  bed.add(B.mesh(material, 'TipperBed'));
  // the tailgate hangs from its top hinge; it swings out when the bed is up
  const gate = new THREE.Group();
  gate.position.set(0, H + 0.07, z0 - 0.02);
  const G = new Parts();
  G.box(W - 0.04, H, 0.08, 0x7c848a, 0, -H / 2, 0);
  G.box(W - 0.04, 0.08, 0.1, orange, 0, -H + 0.12, -0.02);
  G.box(W - 0.04, 0.08, 0.1, orange, 0, -0.12, -0.02);
  gate.add(G.mesh(material, 'TipperGate'));
  bed.add(gate);
  // the load: old snow, grey-white with bits of wood chips, a dome that grows with the fill
  const heapGeo = mergeGeometries([
    new THREE.BoxGeometry(W - 0.16, 0.9, L - 0.2, 1, 1, 1).translate(0, 0.45, 0).toNonIndexed(),
    new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale((W - 0.16) / 2, 0.85, (L - 0.2) / 2).translate(0, 0.9, 0).toNonIndexed()
  ].map((p) => { p.deleteAttribute('uv'); return p; }));
  // (the lumps: the dome's vertices pushed about a little)
  const hp = heapGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) if (hp.getY(i) > 0.95) hp.setY(i, hp.getY(i) + (hash(Math.round(hp.getX(i) * 7) * 31 + Math.round(hp.getZ(i) * 5)) - 0.5) * 0.25);
  heapGeo.computeVertexNormals();
  const heap = new THREE.Mesh(heapGeo, mat(0xd6d3cc, { roughness: 0.95 }));
  heap.name = 'TipperLoad';
  heap.position.set(0, 0.14, mid);
  heap.scale.set(1, 0.01, 1);
  heap.castShadow = true;
  bed.add(heap);
  g.add(bed);
  // the ram: from the chassis up to the bed's front; scaled to the bed's lift
  const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1, 10).translate(0, 0.5, 0), mat(0xc9ccd0, { metalness: 0.7, roughness: 0.3 }));
  ram.position.set(0, 1.1, 1.5);
  g.add(ram);
  // the amber beacon on the cab's roof
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.2, 12), mat(0xffb300, { emissive: 0xff8f00, emissiveIntensity: 0.4, roughness: 0.3 }));
  beacon.position.set(0.7, 3.8, 3.5);
  g.add(beacon);
  // the wheels: a single pair in front, two axles of twins behind
  const wheels = [];
  const wmat = vcMat({ roughness: 0.85 });
  for (const [z, dual] of [[TIPPER.frontAxle, false], [TIPPER.rearAxles[0], true], [TIPPER.rearAxles[1], true]]) {
    for (const s of [1, -1]) {
      const w = wheelMesh(TIPPER.r, dual ? 0.62 : 0.38, dual, wmat);
      w.position.set(s * (dual ? 0.98 : 1.04), TIPPER.r, z);
      g.add(w);
      wheels.push({ mesh: w, r: TIPPER.r, front: !dual });
    }
  }
  return {
    group: g, wheels, bed, gate, heap, heapMid: mid, ram, beacon,
    // (on the springs: the body, the bed, the ram and the beacon sit lower under the load and bounce, the wheels do not)
    sprung: [body, bed, ram, beacon].map((o) => ({ o, y: o.position.y })),
    anim: { bed: 0, bedV: 0, gate: 0, gateV: 0, sq: 0, sqV: 0, fill: 0, acc: 0, speed: 0, raised: false },
    drive: { speed: S.truck.speed, reverseSpeed: 3.2, acceleration: 1.6, powerSpeed: 6, rolling: 0.25, drag: 0.0009, coast: 0.5, brake: 6, wheelbase: 4.45, grip: 6.5, cornering: 4.6 },
    dims: { halfW: S.truck.halfW, halfL: S.truck.halfL, top: 3.85, mass: 18000 }, chase: [14, 4.8], label: 'Tipper'
  };
}
VEHICLES.snowfarmTipper = buildFarmTipper;

// --- The wheel loader --------------------------------------------------------------------------------------------------------
function buildLoader() {
  const g = new THREE.Group();
  g.name = 'WheelLoader';
  const material = vcMat();
  const yellow = 0xf2b705, dark = 0x2a2b2e, glass = 0x26323d, steel = 0x8f969c;
  const P = new Parts();
  // the rear frame with the engine and the counterweight, the articulation, the front frame
  P.box(2.2, 1.25, 2.6, yellow, 0, 1.55, -1.45);
  P.box(2.3, 0.6, 0.45, dark, 0, 1.2, -2.85);
  for (let i = 0; i < 6; i++) P.box(1.6, 0.05, 0.06, dark, 0, 1.75 + i * 0.12, -2.8); // (the radiator's grille)
  P.box(1.3, 0.8, 1.4, yellow, 0, 1.2, 0.85);
  // the cab: its posts, the glass, the roof
  P.box(1.55, 1.55, 1.55, glass, 0, 2.95, -0.25);
  for (const [x, z] of [[0.76, 0.52], [-0.76, 0.52], [0.76, -1.0], [-0.76, -1.0]]) P.box(0.1, 1.55, 0.1, dark, x, 2.95, z);
  P.box(1.75, 0.14, 1.75, yellow, 0, 3.78, -0.25);
  P.cyl(0.08, 1.0, dark, 0.7, 2.6, -2.2, 'y', 8); // the exhaust
  // the wheels' arches
  for (const z of [1.15, -1.75]) for (const x of [1.05, -1.05]) P.box(0.55, 0.1, 1.5, yellow, x, 1.72, z);
  g.add(P.mesh(material, 'LoaderBody'));
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 12), mat(0xffb300, { emissive: 0xff8f00, emissiveIntensity: 0.4 }));
  beacon.position.set(0, 3.95, -0.6);
  g.add(beacon);
  const wheels = [];
  const wmat = vcMat({ roughness: 0.85 });
  for (const z of [1.15, -1.75]) for (const s of [1, -1]) {
    const w = wheelMesh(0.78, 0.55, false, wmat);
    w.position.set(s * 1.05, 0.78, z);
    g.add(w); wheels.push(w);
  }
  // the lift arms pivot by the cab; the bucket at their end tilts
  const arm = new THREE.Group();
  arm.position.set(0, 2.15, 0.7);
  const A = new Parts();
  for (const x of [0.62, -0.62]) A.add(new THREE.BoxGeometry(0.2, 0.3, 2.9).translate(x, 0, 1.45), yellow);
  A.box(1.44, 0.2, 0.2, yellow, 0, 0, 1.6);
  A.cyl(0.09, 1.5, steel, 0, -0.35, 0.9, 'z', 8);
  arm.add(A.mesh(material, 'LoaderArm'));
  const bucket = new THREE.Group();
  bucket.position.set(0, 0, 2.9);
  const K = new Parts();
  K.box(2.5, 0.08, 1.15, dark, 0, -0.95, 0.55); // the floor
  K.box(2.5, 1.1, 0.08, dark, 0, -0.42, 0.0); // the back
  for (const x of [1.25, -1.25]) K.box(0.07, 1.0, 1.15, dark, x, -0.5, 0.5);
  K.box(2.5, 0.06, 0.12, steel, 0, -0.98, 1.12); // the cutting edge
  bucket.add(K.mesh(material, 'LoaderBucket'));
  // (the bucket's load: a dome on the floor, scaled with how full the bucket is)
  const scoop = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.6, 0.55), mat(0xd6d3cc, { roughness: 0.95 }));
  scoop.position.set(0, -0.9, 0.55);
  scoop.castShadow = true;
  scoop.visible = false;
  bucket.add(scoop);
  arm.add(bucket);
  g.add(arm);
  g.rotation.order = 'YXZ'; // (the heading, then the body's pitch on its tyres)
  return { group: g, arm, bucket, scoop, wheels, beacon, pitch: 0, pitchV: 0, vel: 0 };
}

// --- The depot: the heap, its wood chips, the fleece and the tyres on it -----------------------------------------------------
const CHIPS = new THREE.Color(0.4, 0.27, 0.15), CHIPS_DARK = new THREE.Color(0.28, 0.18, 0.1), FLEECE = new THREE.Color(0.9, 0.9, 0.87), FACE = new THREE.Color(0.8, 0.81, 0.82);
/** The heap's height over the ground at (lx, lz) in its own frame (lx along its length, east) */
function heapHeight(lx, lz, D = S.depot) {
  // (rounded in plan and in section; the west end cut off steep where the loader takes the snow)
  const west = lx < 0;
  const a = west ? D.halfL - 0.6 : D.halfL, px = west ? 8 : 3;
  const q = Math.abs(lx / a) ** px + Math.abs(lz / D.halfW) ** 2.2;
  if (q >= 1) return 0;
  const bump = (hash(Math.round(lx * 1.3) * 57 + Math.round(lz * 1.3)) - 0.5) * 0.18;
  return Math.max(0, D.height * Math.pow(1 - q, 0.55) + bump * (1 - q));
}
function buildDepot(run) {
  const D = S.depot;
  const step = 0.5, nx = Math.round((2 * D.halfL + 3) / step) + 1, nz = Math.round((2 * D.halfW + 3) / step) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const hs = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, lx = -D.halfL - 1.5 + i * step, lz = -D.halfW - 1.5 + j * step;
    const x = D.x + lx, z = D.z + lz, h = heapHeight(lx, lz);
    hs[k] = h;
    pos[k * 3] = x; pos[k * 3 + 1] = surfaceHeight(x, z) + (h > 0 ? h : -0.15); pos[k * 3 + 2] = z;
    // the colours: the cut face's snow at the west end (under a band of chips on top), the fleece over the eastern part
    // (in strips across, their overlaps a shade darker), the brown chips elsewhere, lighter and darker in patches
    const n = hash(i * 13 + j * 71);
    const fleeceFrom = -3.5 + 2.6 * Math.sin(lz * 0.45 + 0.8) + 1.2 * Math.sin(lz * 1.3);
    if (lx < -D.halfL + 3.2 && h > 0.05 && h < D.height * 0.82) _c.copy(FACE).multiplyScalar(0.9 + 0.12 * n);
    else if (lx > fleeceFrom && h > 0.15) _c.copy(FLEECE).multiplyScalar((Math.abs(((lx + 40) % 4.2) - 0.1) < 0.35 ? 0.86 : 0.97) - 0.05 * n);
    else _c.copy(CHIPS).lerp(CHIPS_DARK, n * 0.7);
    col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k = j * nx + i;
    idx.set([k, k + nx, k + 1, k + 1, k + nx, k + nx + 1], q); q += 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const heap = new THREE.Mesh(geo, vcMat({ roughness: 0.95 }));
  heap.name = 'SnowDepot';
  heap.castShadow = true; heap.receiveShadow = true;
  run.group.add(heap);
  // old tyres holding the fleece down
  const tyres = new THREE.InstancedMesh(new THREE.TorusGeometry(0.42, 0.16, 8, 16).rotateX(Math.PI / 2), mat(0x151617, { roughness: 0.9 }), 14);
  let n = 0;
  for (let i = 0; i < 40 && n < 14; i++) {
    const lx = -1 + hash(i * 3.1) * (D.halfL + 0.5), lz = (hash(i * 7.7) - 0.5) * 2 * D.halfW * 0.8, h = heapHeight(lx, lz);
    if (h < 1) continue;
    _q.setFromAxisAngle(UP, hash(i) * 3);
    tyres.setMatrixAt(n++, _m.compose(_p.set(D.x + lx, surfaceHeight(D.x + lx, D.z + lz) + h + 0.05, D.z + lz), _q, _s.set(1, 1, 1)));
  }
  tyres.count = n;
  tyres.castShadow = true;
  run.group.add(run.storage(tyres));
  // solid for the vehicles (an axis-aligned box a little inside the heap's foot)
  const y = surfaceHeight(D.x, D.z);
  return { mesh: heap, collider: { minX: D.x - D.halfL + 1.5, maxX: D.x + D.halfL - 1, minZ: D.z - D.halfW + 1, maxZ: D.z + D.halfW - 1, minY: y - 3, maxY: y + D.height } };
}

// --- The Loipe's snow: a mesh along the loop, closed over its seam -----------------------------------------------------------
const GRASS = new THREE.Color(0.17, 0.25, 0.08), OLD = new THREE.Color(0.8, 0.79, 0.76), GROOMED = new THREE.Color(0.95, 0.96, 0.99), SPECK = new THREE.Color(0.48, 0.37, 0.25);
class LoopMesh {
  constructor(grid, route) {
    this.grid = grid;
    const { cols, rows } = grid, n = cols * rows;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    this.base = new Float32Array(n);
    // (the old snow's lumps: a factor on its depth that swells and dips over a metre or two, a little grain on top)
    this.lump = new Float32Array(n);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      this.lump[k] = 0.92 + 0.17 * Math.sin(i * 0.71 + 1.7 * Math.sin(j * 0.83)) + 0.12 * Math.sin(i * 0.29 - j * 1.13 + 2.1) + 0.12 * (hash(k) - 0.5);
    }
    const pt = {};
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i, w = routePoint(route, (i + 0.5) * grid.cell, (j + 0.5) * grid.cellD - S.half, pt);
      pos[k * 3] = w.x; pos[k * 3 + 2] = w.z;
      this.base[k] = surfaceHeight(w.x, w.z) + 0.03;
    }
    const idx = new Uint32Array(cols * (rows - 1) * 6);
    let q = 0;
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols; i++) {
      const a = j * cols + i, b = j * cols + ((i + 1) % cols);
      // (d grows to the left of the way along: (s, d) is turned the other way round from (x, z), so this winding faces up)
      idx.set([a, b, a + cols, b, b + cols, a + cols], q); q += 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(geo, vcMat({ roughness: 0.92 }));
    this.mesh.name = 'LoipeSnow';
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.normalT = 0;
    this.refresh();
  }
  refresh() { this.grid.dirty = null; this.range(0, this.grid.cols - 1, 0, this.grid.rows - 1); this.mesh.geometry.computeVertexNormals(); this.normalsDirty = false; }
  range(i0, i1, j0, j1) {
    const g = this.grid, geo = this.mesh.geometry, pos = geo.attributes.position.array, col = geo.attributes.color.array;
    const C = g.cols, R = g.rows, gh = g.h;
    for (let j = Math.max(0, j0); j <= Math.min(R - 1, j1); j++) for (let ii = i0; ii <= i1; ii++) {
      const i = ((ii % C) + C) % C, k = j * C + i;
      const groomed = g.groomed[k] && gh[k] >= S.groomDepth * 0.5;
      // (the old snow as you see it: the cell's depth blurred with its four neighbours, so that the windrow is a rounded
      // ridge with soft shoulders, not a box of spikes; lumpy in swells a few cells long, not cell by cell)
      const iL = (i + C - 1) % C, iR = (i + 1) % C, jD = j > 0 ? j - 1 : j, jU = j < R - 1 ? j + 1 : j;
      const h = groomed ? gh[k] : 0.4 * gh[k] + 0.15 * (gh[j * C + iL] + gh[j * C + iR] + gh[jD * C + i] + gh[jU * C + i]);
      // (no snow: under the grass; the old snow lumpy, the groomed even)
      pos[k * 3 + 1] = this.base[k] + (h <= 0.004 ? -0.3 : groomed ? h : h * this.lump[k]);
      if (groomed) _c.copy(GROOMED).multiplyScalar(j % 2 ? 1 : 0.9 + 0.02 * g.dir[k]);
      else if (h <= 0.004) _c.copy(GRASS);
      else {
        _c.copy(GRASS).lerp(OLD, clamp(h / 0.1, 0, 1)).multiplyScalar(0.92 + 0.1 * hash(k * 3));
        if (hash(k * 7 + 1) > 0.86) _c.lerp(SPECK, 0.6); // (bits of the wood chips in the old snow)
      }
      col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.normalsDirty = true;
  }
  update(dt) {
    const d = this.grid.dirty;
    if (d) {
      this.grid.dirty = null;
      // (a box over the seam spans the whole map's columns: then just the two ends)
      if (d.i1 - d.i0 > this.grid.cols / 2 && d.i1 - d.i0 < this.grid.cols - 1) { this.range(d.i1 - 1, this.grid.cols + 2, d.j0 - 1, d.j1 + 1); this.range(-2, d.i0 + 1, d.j0 - 1, d.j1 + 1); }
      else this.range(d.i0 - 1, d.i1 + 1, d.j0 - 1, d.j1 + 1);
    }
    this.normalT += dt;
    if (this.normalsDirty && this.normalT > 0.12) { this.normalT = 0; this.normalsDirty = false; this.mesh.geometry.computeVertexNormals(); }
  }
}

/** The marker poles along both sides of the Loipe, every 20 m (orange, the tips reflecting) */
function buildPoles(run, route) {
  const n = Math.floor(route.length / 20) * 2;
  const geo = mergeGeometries([
    new THREE.CylinderGeometry(0.025, 0.03, 1.5, 6).translate(0, 0.75, 0).toNonIndexed(),
    new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6).translate(0, 1.42, 0).toNonIndexed()
  ].map((g, i) => {
    g.deleteAttribute('uv');
    const c = i ? [0.95, 0.95, 0.9] : [0.95, 0.42, 0.05], a = new Float32Array(g.attributes.position.count * 3);
    for (let v = 0; v < a.length; v += 3) a.set(c, v);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }));
  const poles = new THREE.InstancedMesh(geo, vcMat({ roughness: 0.5 }), n);
  const pt = {};
  let k = 0;
  for (let s = 6; s < route.length - 4 && k < n; s += 20) for (const d of [S.trailHalf + 1.0, -(S.trailHalf + 1.0)]) {
    const p = routePoint(route, s, d, pt);
    poles.setMatrixAt(k++, _m.compose(_p.set(p.x, surfaceHeight(p.x, p.z) - 0.1, p.z), _q.identity(), _s.set(1, 1, 1)));
  }
  poles.count = k;
  poles.castShadow = true;
  run.group.add(run.storage(poles));
  return poles;
}

// --- The hold (Space / E, the touch button): the bed up while held ----------------------------------------------------------
const holding = (run) => !!(run.work.keyHold || run.work.touchHold);
const canSpread = (run, cm) => cm.activeMode === 'car' && run.index <= 1;

const snowfarm = {
  setup(run) {
    const cm = run.hooks.controllerManager, car = cm.entities.car, cat = cm.entities.snowcat;
    const route = createSnowfarmRoute();
    const grid = createSnowfarmGrid(route);
    const mesh = new LoopMesh(grid, route);
    run.group.add(mesh.mesh);
    buildPoles(run, route);
    const depot = buildDepot(run);
    cm.addColliders?.([depot.collider]);
    run.cleanups.push(() => cm.removeColliders?.([depot.collider]));
    const loader = buildLoader();
    run.group.add(loader.group);
    run.work = {
      route, grid, mesh, depot, loader, toast: createToast(run), pose: {}, catPose: {}, shareT: 0, spillAcc: 0, dumpAcc: 0,
      cycle: 0, dumped: 0, dustAcc: 0, keyHold: false, touchHold: false, wasEmpty: false, wasFull: false, saved: null
    };
    // the hold: the bed up (the big touch button, the gamepad's A, the key bar's Space); the jump button goes meanwhile
    run.button('up', null);
    run.actions([{ id: 'work-hold', kind: 'hold', primary: true, label: 'Spread', icon: 'i-chute', keys: ['Space', 'KeyE'], kbd: ['Space'], keyboard: false, pad: 'a', when: () => canSpread(run, cm), run: (on) => { run.work.touchHold = on; } }]);
    run.listen(window, 'keyup', (e) => { if (e.code === 'Space' || e.code === 'KeyE') run.work.keyHold = false; }, { capture: true });
    run.listen(window, 'blur', () => { run.work.keyHold = false; run.work.touchHold = false; });
    // the car and the snowcat as they were (the snowcat stays in its shed in summer): given back at the end
    run.work.saved = {
      car: { hidden: !!car.hidden, x: car.position.x, z: car.position.z, heading: car.heading },
      cat: cat ? { hidden: !!cat.hidden, x: cat.position.x, z: cat.position.z, heading: cat.heading, raised: !!cat.tillerRaised } : null
    };
    run.cleanups.push(() => {
      const s = run.work?.saved;
      if (!s) return;
      if (cm.activeMode !== 'car') { cm.placeEntity('car', s.car.x, s.car.z, s.car.heading); cm.setEntityHidden('car', s.car.hidden); }
      if (s.cat && cm.activeMode !== 'snowcat') { cm.placeEntity('snowcat', s.cat.x, s.cat.z, s.cat.heading); cm.setEntityHidden('snowcat', s.cat.hidden); cm.entities.snowcat.tillerRaised = s.cat.raised; }
    });
  },
  reset(run) {
    const w = run.work, cm = run.hooks.controllerManager, car = cm.entities.car;
    resetSnowfarmGrid(w.grid, createSnowfarmGrid(w.route));
    w.mesh.refresh();
    car.speed = 0; car.vx = 0; car.vz = 0; car.angularVel = 0;
    snowfarm.parkCat(run, cm);
    w.keyHold = w.touchHold = false;
    w.cycle = 0; w.wasEmpty = false; w.wasFull = false; w.shareT = 0; w.dumped = 0;
    const v = run.vehicle;
    if (v?.bed) {
      v.bed.rotation.x = 0; v.gate.rotation.x = 0; v.heap.scale.set(1, 0.01, 1); v.heap.position.z = v.heapMid;
      Object.assign(v.anim, { bed: 0, bedV: 0, gate: 0, gateV: 0, sq: 0, sqV: 0, fill: 0, acc: 0, speed: 0, raised: false });
      for (const s of v.sprung) s.o.position.y = s.y;
    }
    Object.assign(w.loader, { pitch: 0, pitchV: 0, vel: 0 });
    w.lx = w.lz = undefined;
    snowfarm.poseLoader(run, 0, null);
    w.toast.hide();
  },
  /** The snowcat by the depot, seen even in summer, its tiller down */
  parkCat(run, cm) {
    const cat = cm.entities.snowcat, C = S.snowcat;
    if (!cat) return;
    cm.setEntityHidden('snowcat', false);
    cm.placeEntity('snowcat', C.x, C.z, C.heading);
    cat.tillerRaised = false;
  },
  key(run, e) {
    if (run.phase === 'intro' || (e.code !== 'Space' && e.code !== 'KeyE')) return;
    const cm = run.hooks.controllerManager;
    if (!canSpread(run, cm)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    run.work.keyHold = true;
  },
  update(run, ctx, dt, cm) {
    const w = run.work, st = run.state, car = cm.entities.car, cat = cm.entities.snowcat, v = run.vehicle;
    const obj = objectiveId(run);
    // (the season's switch puts the snowcat back in its shed in summer: it stays out for the mission)
    if (cat?.hidden && cm.activeMode !== 'snowcat' && live(run)) cm.setEntityHidden('snowcat', false);
    const pose = loopPose(w.route, car.position.x, car.position.z, car.heading, w.pose);
    if (live(run) && ctx.mode === 'car' && (obj === 'load' || obj === 'spread')) {
      const loaded = stepLoading(st, onPad(car.position.x, car.position.z, car.heading, car.speed || 0), dt);
      const out = stepSpread(w.grid, st, pose, car.speed || 0, obj === 'spread' && holding(run), dt);
      if (out > 0) snowfarm.spill(run, car, out, dt);
      if (loaded > 0 && st.load >= S.capacity && !w.wasFull) { w.toast.show('Full: off to the Loipe', '#e7f3ff', 2); w.wasFull = true; }
      if (st.load < S.capacity) w.wasFull = false;
      if (st.out > 0 && st.load <= 0 && !w.wasEmpty) { w.toast.show('Empty: back to the depot', '#ffd9a8', 2); w.wasEmpty = true; }
      if (st.load > 0) w.wasEmpty = false;
    } else {
      // (out of the cab, or the spreading done: the bed comes down, the loader stops)
      st.raise = Math.max(0, st.raise - dt / S.raiseS);
      st.loading = false; st.spreading = false; st.piling = false;
    }
    if (live(run) && ctx.mode === 'snowcat' && obj === 'groom' && cat) {
      const cp = loopPose(w.route, cat.position.x, cat.position.z, cat.heading, w.catPose);
      stepTiller(w.grid, cp, cat.speed || 0, cat.model?.tillerLift?.value ?? (cat.tillerRaised ? 1 : 0));
    }
    st.tillerDown = !!cat && !cat.tillerRaised;
    // (the shares and the next gap: a pass over the map, five times a second)
    w.shareT -= dt;
    if (w.shareT <= 0) {
      w.shareT = 0.2;
      st.covered = coveredShare(w.grid);
      st.groomed = groomedShare(w.grid);
      const me = cm.getActiveEntity().position;
      const s = loopPose(w.route, me.x, me.z, 0, {}).s;
      st.gap = nearestGap(w.grid, s);
      st.ungroomed = obj === 'groom' ? nearestUngroomed(w.grid, s) : null;
    }
    if (cat) { const me = cm.getActiveEntity().position; st.catDist = Math.hypot(me.x - cat.position.x, me.z - cat.position.z); }
    // the tipper: the bed and its load, the gate, the ram, the beacon
    if (v?.bed) snowfarm.animateTipper(run, v, car, ctx, dt);
    snowfarm.poseLoader(run, dt, car);
    w.mesh.update(dt);
    w.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
  },
  /**
   * The tipper's moving parts over the logic's state (only the look: st.raise and st.load stay the logic's): the bed
   * eased up and down on its rams with a jolt at the stops, the tailgate swinging free from its top hinge (gravity, the
   * truck's pull and braking, the snow pushing it out; it clacks against the bed), the body squatting on its springs
   * under the load and bouncing as each bucket lands, the load in the bed growing bucket by bucket and sliding back as
   * the bed empties
   */
  animateTipper(run, v, car, ctx, dt) {
    const w = run.work, st = run.state, A = v.anim;
    const step = Math.min(dt, 1 / 20);
    if (step > 0) {
      // the bed: eased towards the rams' angle, a little overshoot at the top stop, a bounce when it lands on the chassis
      const prevBed = A.bed;
      spring(A, 'bed', ease(st.raise) * 0.5, 160, 0.55, step);
      if (A.bed < 0) { if (A.bedV < -0.15) A.sqV -= Math.min(0.5, -A.bedV * 0.6); A.bed = 0; A.bedV = -A.bedV * 0.2; } // (down on the chassis: the springs take it)
      if (st.raise >= 1 && !A.raised) A.bedV += 0.09; // (the rams at their stop: a jolt)
      A.raised = st.raise >= 1;
      // the truck's pull along: how hard it speeds up or brakes, smoothed
      const sp = car.speed || 0;
      A.acc += (clamp((sp - A.speed) / step, -8, 8) - A.acc) * Math.min(1, step * 6);
      A.speed = sp;
      // the tailgate: its swing out of the vertical (+ out behind); a physical pendulum from its top hinge
      const latched = A.bed < 0.035 && st.raise < 0.05;
      if (latched) { A.gate = -A.bed; A.gateV = 0; }
      else {
        const push = st.spreading ? 4 + 2.5 * Math.random() : 0; // (the snow running out shoves it some 20-30° open, unevenly)
        const tq = -12.8 * Math.sin(A.gate) + A.acc * 1.6 + push - 1.1 * A.gateV - (A.bed - prevBed) / step * 2.5;
        A.gateV += tq * step;
        A.gate += A.gateV * step;
        if (A.gate < -A.bed) { A.gate = -A.bed; if (A.gateV < 0) A.gateV = -A.gateV * 0.35; } // (against the bed's tail: clack)
        if (A.gate > 0.9) { A.gate = 0.9; A.gateV = Math.min(0, A.gateV); }
      }
      // the load as you see it: while the loader works it grows with each bucket landing in the bed, else it follows the load
      const target = st.loading ? Math.min(S.capacity, w.dumped) : st.load;
      A.fill += (target - A.fill) * (1 - Math.exp(-step * (st.loading ? 3.5 : 8)));
      // the springs: lower under the load, a little lift as the bed's weight goes to the back
      spring(A, 'sq', -0.11 * (A.fill / S.capacity) - 0.02 * ease(st.raise), 70, 0.22, step);
      A.sq = clamp(A.sq, -0.3, 0.12);
    }
    for (const s of v.sprung) s.o.position.y = s.y + A.sq;
    v.bed.rotation.x = -A.bed;
    v.gate.rotation.x = A.bed + A.gate; // (relative to the bed: it hangs, plus its swing)
    const f = A.fill / S.capacity;
    v.heap.scale.y = Math.max(0.01, f);
    v.heap.visible = f > 0.002;
    // (the load slides back to the tail as the bed empties, more the higher the bed: no jump where the snow starts running)
    v.heap.position.z = v.heapMid - easeIn(0.25, 0.85, A.bed / 0.5) * (1 - f) * 1.6;
    {
      // (the ram from the chassis to the bed's front: its length as the bed rises)
      const a = A.bed, fz = TIPPER.hinge.z + Math.cos(a) * (TIPPER.bed.l + 0.12) - v.ram.position.z, fy = v.bed.position.y + Math.sin(a) * (TIPPER.bed.l + 0.12) - v.ram.position.y;
      v.ram.scale.y = Math.max(0.3, Math.hypot(fz, fy));
      v.ram.rotation.x = Math.atan2(fz, fy);
      v.beacon.material.emissiveIntensity = ctx.mode === 'car' ? 0.5 + 0.7 * Math.max(0, Math.sin(performance.now() / 110)) : 0.15;
    }
  },
  /**
   * The snow running out under the swung-open tailgate: lumps that leave the tail with the truck's own speed and a
   * little push back, so they land under the tail where the windrow grows (not thrown backwards), a stream that starts
   * thin as the bed passes the point where the snow slides; and the dust they kick up where they land
   */
  spill(run, car, out, dt) {
    const w = run.work, st = run.state, pb = particles(run), h = car.heading, sx = Math.sin(h), sz = Math.cos(h);
    const A = run.vehicle?.anim, sp = car.speed || 0, vx = sx * sp, vz = sz * sp;
    const onset = easeIn(S.runFrom, S.runFrom + 0.3, st.raise); // (the stream swells as the bed goes on up)
    const gap = A ? clamp(A.bed + A.gate, 0.15, 0.9) * 0.8 : 0.5; // (the opening under the gate)
    const groundY = surfaceHeight(car.position.x - sx * 5, car.position.z - sz * 5);
    w.spillAcc += Math.min(70, (out / Math.max(dt, 1e-3)) * 8) * onset * dt;
    while (w.spillAcc >= 1) {
      w.spillAcc--;
      const side = (Math.random() - 0.5) * 2.1;
      _a.x = car.position.x - sx * 4.35 + sz * side; _a.z = car.position.z - sz * 4.35 - sx * side;
      _a.y = car.position.y + 1.2 + (A?.sq || 0) + Math.random() * gap;
      const T = 0.32 + Math.random() * 0.14, back = 0.3 + Math.random() * 0.9;
      _b.x = _a.x + vx * T - sx * back + sz * side * 0.12; _b.z = _a.z + vz * T - sz * back - sx * side * 0.12;
      _b.y = groundY + 0.15 + Math.random() * 0.2;
      const k = 0.8 + Math.random() * 0.1, chip = Math.random() < 0.08; // (now and then a lump with the wood chips in it)
      lump(pb, _a, _b, T, { size: 0.3 + Math.random() * 0.25, grow: 0.3, r: chip ? 0.62 : k, g: chip ? 0.53 : k - 0.01, bl: chip ? 0.43 : k - 0.03 });
    }
    // (the dust where it lands, drifting a little after the truck)
    w.dustAcc += 11 * onset * dt;
    while (w.dustAcc >= 1) {
      w.dustAcc--;
      const side = (Math.random() - 0.5) * 2.4, back = 4.8 + Math.random() * 1.2;
      dust(pb, car.position.x - sx * back + sz * side, groundY + 0.3, car.position.z - sz * back - sx * side, vx * 0.25, vz * 0.25, { size: 0.7, grow: 2.4, life: 1.5, alpha: 0.3 });
    }
  },
  /**
   * The wheel loader: a cycle (into the face, the bucket filling and curling, back off and turn, the arms up, tip into
   * the bed and shake it out, back) while it fills the truck. Every move eased in and out, no jumps between the
   * phases; the bucket's load grows as it bites and pours out as it tips; the machine pitches on its tyres as it
   * speeds up and brakes and noses into the heap; snow dust where the bucket bites and where its load lands
   */
  poseLoader(run, dt, car) {
    const w = run.work, L = w.loader, st = run.state;
    const period = S.loadS / 4; // (four buckets a load)
    const c0 = w.cycle;
    if (st?.loading || w.cycle > 0) {
      if (w.cycle === 0 && st?.loading) w.dumped = st.load; // (a cycle starts: the load counted from what is in the bed)
      w.cycle += dt / period;
      if (w.cycle >= 1) w.cycle = st?.loading ? w.cycle - 1 : 0;
    }
    const c = w.cycle;
    // the way: from the face (H, facing the heap) to beside the bed (T, facing the truck), in a V
    const H = S.loader;
    const bed = car && st?.onPad ? bedCentre(car.position.x, car.position.z, car.heading) : { x: S.pad.x, z: S.pad.z };
    const T = { x: bed.x + S.truck.halfW + 3.1, z: bed.z };
    // u: 0 at the face, 1 at the truck (eased); the arms' lift, the bucket's tilt (− curled, + tipped), its fill
    const e = c < 0.25 ? 0 : c < 0.5 ? ease((c - 0.25) / 0.25) : c < 0.65 ? 1 : 1 - ease((c - 0.65) / 0.35);
    const lift = c < 0.16 ? 0 : c < 0.25 ? 0.1 * easeIn(0.16, 0.25, c) : c < 0.5 ? 0.1 + 0.9 * easeIn(0.25, 0.48, c) : c < 0.65 ? 1 : 1 - easeIn(0.68, 0.97, c);
    let tilt = c < 0.16 ? 0 : c < 0.25 ? -0.5 * easeIn(0.16, 0.25, c) : c < 0.5 ? -0.5 : c < 0.65 ? -0.5 + 1.5 * easeIn(0.5, 0.62, c) : 1 - easeIn(0.66, 0.86, c);
    if (c > 0.6 && c < 0.7) tilt += Math.sin(((c - 0.6) / 0.1) * Math.PI) * 0.07 * Math.sin(((c - 0.6) / 0.1) * Math.PI * 8); // (shaken out)
    const fill = c < 0.05 ? 0 : c < 0.5 ? easeIn(0.05, 0.17, c) : 1 - easeIn(0.53, 0.63, c);
    // into the face (an eased push and back out), the nose dipping as it bites
    const nudge = c < 0.16 ? 0.9 * easeIn(0, 0.13, c) : c < 0.25 ? 0.9 * (1 - easeIn(0.16, 0.25, c)) : 0;
    const x = H.x + (T.x - H.x) * e + nudge, z = H.z + (T.z - H.z) * e + Math.sin(e * Math.PI) * 5;
    const heading = H.heading + Math.PI * e; // (it turns round through the north on the way: a V)
    // (rolling: the wheels turn with the way, forwards or backwards as it goes; the speed along for the pitch)
    const dx = x - (w.lx ?? x), dz = z - (w.lz ?? z);
    const along = dx * Math.sin(heading) + dz * Math.cos(heading);
    if (dt > 0) {
      for (const wh of L.wheels) wh.rotation.x += along / 0.78;
      const vel = along / dt, acc = clamp((vel - L.vel) / dt, -6, 6);
      L.vel = vel;
      // the body on its tyres: squats back as it pulls away, dives as it brakes, noses down into the heap and with the
      // full bucket held high
      const bite = c > 0.08 && c < 0.17 ? 0.025 : 0;
      spring(L, 'pitch', clamp(-acc * 0.012, -0.05, 0.05) + bite + 0.015 * lift * fill, 90, 0.35, Math.min(dt, 1 / 20));
    }
    w.lx = x; w.lz = z;
    L.group.position.set(x, surfaceHeight(x, z), z);
    L.group.rotation.set(L.pitch, heading, 0, 'YXZ');
    L.arm.rotation.x = -lift * 0.75;
    L.bucket.rotation.x = lift * 0.75 + tilt; // (the bucket kept level as the arms rise, curled, then tipped)
    L.scoop.visible = fill > 0.02;
    if (L.scoop.visible) {
      L.scoop.scale.set(0.55 + 0.45 * fill, fill, 0.6 + 0.4 * fill);
      L.scoop.position.z = 0.55 + (c > 0.5 ? (1 - fill) * 0.35 : 0); // (pouring over the cutting edge)
    }
    if (dt <= 0) return;
    const pb = (c > 0.06 && c < 0.17) || (c > 0.52 && c < 0.66) ? particles(run) : null;
    if (pb && c < 0.2) {
      // the bucket biting into the face: a puff of the old snow
      w.dustAcc += 9 * dt;
      while (w.dustAcc >= 1) {
        w.dustAcc--;
        const r = 3.4 + Math.random() * 0.6, s = (Math.random() - 0.5) * 2.4;
        dust(pb, x + Math.sin(heading) * r + Math.cos(heading) * s, surfaceHeight(x, z) + 0.4 + Math.random() * 0.6, z + Math.cos(heading) * r - Math.sin(heading) * s, 0, 0, { size: 0.5, grow: 2, life: 1.3, alpha: 0.35 });
      }
    }
    if (pb && c > 0.5 && st?.loading) {
      // the bucket's load pours over its edge into the bed: from the cutting edge where it is now; the truck dips
      if (c0 < 0.55 && c >= 0.55 && run.vehicle?.anim) run.vehicle.anim.sqV -= 0.35;
      w.dumped += (S.capacity / 4) * (dt / period) / 0.1 * (c < 0.63 ? 1 : 0); // (a quarter of the bed over 0.53-0.63)
      L.group.updateMatrixWorld(true);
      L.bucket.localToWorld(_v.set(0, -0.95, 1.1));
      const lipX = _v.x, lipY = _v.y, lipZ = _v.z;
      const pour = c < 0.63 ? Math.sin(easeIn(0.52, 0.63, c) * Math.PI) : 0; // (a trickle, the rush, a trickle)
      const by = (car?.position.y ?? surfaceHeight(bed.x, bed.z)) + 1.5 + (st.load / S.capacity) * 1.1;
      w.dumpAcc += 110 * pour * dt;
      while (w.dumpAcc >= 1) {
        w.dumpAcc--;
        _a.x = lipX + Math.cos(heading) * (Math.random() - 0.5) * 2.2; _a.y = lipY - Math.random() * 0.3; _a.z = lipZ - Math.sin(heading) * (Math.random() - 0.5) * 2.2;
        _b.x = bed.x + (Math.random() - 0.5) * 1.9; _b.y = by; _b.z = bed.z + (Math.random() - 0.5) * 3.2;
        const drop = Math.max(0.3, _a.y - _b.y);
        const k = 0.8 + Math.random() * 0.1;
        lump(pb, _a, _b, Math.sqrt((2 * drop) / 9.81) + 0.1, { size: 0.25 + Math.random() * 0.25, grow: 0.25, r: k, g: k - 0.01, bl: k - 0.03 });
      }
      w.dustAcc += 14 * pour * dt;
      while (w.dustAcc >= 1) { w.dustAcc--; dust(pb, bed.x + (Math.random() - 0.5) * 2, by + 0.3, bed.z + (Math.random() - 0.5) * 3.5, 0, 0, { size: 0.8, grow: 2.6, life: 1.6, alpha: 0.28 }); }
    }
    L.beacon.material.emissiveIntensity = st?.loading ? 0.5 + 0.7 * Math.max(0, Math.sin(performance.now() / 120)) : 0.15;
  }
};

export const SNOWFARM_FEATURES = { snowfarm };
