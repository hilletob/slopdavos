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
  g.add(C.mesh(material, 'TipperBody'));
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
  const scoop = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.55, 0.55).translate(0, -0.85, 0.55), mat(0xd6d3cc, { roughness: 0.95 }));
  scoop.visible = false;
  bucket.add(scoop);
  arm.add(bucket);
  g.add(arm);
  return { group: g, arm, bucket, scoop, wheels, beacon };
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
    for (let j = Math.max(0, j0); j <= Math.min(g.rows - 1, j1); j++) for (let ii = i0; ii <= i1; ii++) {
      const i = ((ii % g.cols) + g.cols) % g.cols, k = j * g.cols + i, h = g.h[k];
      const groomed = g.groomed[k] && h >= S.groomDepth * 0.5;
      // (no snow: under the grass; the old snow lumpy, the groomed even)
      pos[k * 3 + 1] = this.base[k] + (h <= 0.004 ? -0.3 : groomed ? h : h * (0.65 + 0.7 * hash(k)));
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
      cycle: 0, keyHold: false, touchHold: false, wasEmpty: false, wasFull: false, saved: null
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
    w.cycle = 0; w.wasEmpty = false; w.wasFull = false; w.shareT = 0;
    const v = run.vehicle;
    if (v?.bed) { v.bed.rotation.x = 0; v.gate.rotation.x = 0; v.heap.scale.set(1, 0.01, 1); v.heap.position.z = v.heapMid; }
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
    if (v?.bed) {
      v.bed.rotation.x = -st.raise * 0.5;
      v.gate.rotation.x = clamp((st.raise - 0.25) / 0.5, 0, 1) * 0.85;
      const f = st.load / S.capacity;
      v.heap.scale.y = Math.max(0.01, f);
      v.heap.visible = f > 0.002;
      v.heap.position.z = v.heapMid - (st.raise > S.runFrom ? (1 - f) * 1.4 : 0);
      // (the ram from the chassis to the bed's front: its length as the bed rises)
      const a = st.raise * 0.5, fz = TIPPER.hinge.z + Math.cos(a) * (TIPPER.bed.l + 0.12) - v.ram.position.z, fy = TIPPER.hinge.y + Math.sin(a) * (TIPPER.bed.l + 0.12) - v.ram.position.y;
      v.ram.scale.y = Math.max(0.3, Math.hypot(fz, fy));
      v.ram.rotation.x = Math.atan2(fz, fy);
      v.beacon.material.emissiveIntensity = ctx.mode === 'car' ? 0.5 + 0.7 * Math.max(0, Math.sin(performance.now() / 110)) : 0.15;
    }
    snowfarm.poseLoader(run, dt, car);
    w.mesh.update(dt);
    w.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
  },
  /** The snow running out over the tailgate: lumps from the bed's tail to the ground behind */
  spill(run, car, out, dt) {
    const w = run.work, pb = particles(run), h = car.heading, sx = Math.sin(h), sz = Math.cos(h);
    w.spillAcc += Math.min(60, (out / Math.max(dt, 1e-3)) * 7) * dt;
    while (w.spillAcc >= 1) {
      w.spillAcc--;
      const side = (Math.random() - 0.5) * 2;
      const a = { x: car.position.x - sx * 4.3 + sz * side, y: car.position.y + 1.6 + Math.random() * 0.5, z: car.position.z - sz * 4.3 - sx * side };
      const back = 0.6 + Math.random() * 1.0;
      const b = { x: a.x - sx * back + sz * side * 0.15, y: surfaceHeight(a.x, a.z) + 0.25, z: a.z - sz * back - sx * side * 0.15 };
      lump(pb, a, b, 0.45 + Math.random() * 0.15, { size: 0.32, grow: 0.35, r: 0.86, g: 0.85, bl: 0.82 });
    }
  },
  /** The wheel loader: a cycle (scoop at the face, back off and turn, tip into the bed, back) while it fills the truck */
  poseLoader(run, dt, car) {
    const w = run.work, L = w.loader, st = run.state;
    const period = S.loadS / 4; // (four buckets a load)
    if (st?.loading || w.cycle > 0) {
      w.cycle += dt / period;
      if (w.cycle >= 1) w.cycle = st?.loading ? w.cycle - 1 : 0;
    }
    const c = w.cycle;
    // the way: from the face (H, facing the heap) to beside the bed (T, facing the truck), in a V
    const H = S.loader;
    const bed = car && st?.onPad ? bedCentre(car.position.x, car.position.z, car.heading) : { x: S.pad.x, z: S.pad.z };
    const T = { x: bed.x + S.truck.halfW + 3.1, z: bed.z };
    // u: 0 at the face, 1 at the truck; the arm's lift and the bucket's tilt along the cycle
    let u, lift, tilt, full;
    if (c < 0.25) { u = 0; lift = 0; tilt = c < 0.15 ? 0 : -0.5 * ((c - 0.15) / 0.1); full = c > 0.15; } // (into the face, the bucket curls)
    else if (c < 0.5) { u = (c - 0.25) / 0.25; lift = u; tilt = -0.5; full = true; } // (to the truck, the arms going up)
    else if (c < 0.65) { u = 1; lift = 1; tilt = -0.5 + 1.5 * ((c - 0.5) / 0.15); full = c < 0.57; } // (tipping it out)
    else { u = 1 - (c - 0.65) / 0.35; lift = u; tilt = u > 0.5 ? 1 : 0; full = false; } // (back to the face)
    const e = u * u * (3 - 2 * u);
    const nudge = c < 0.15 ? Math.sin((c / 0.15) * Math.PI) * 0.8 : 0;
    const x = H.x + (T.x - H.x) * e + nudge, z = H.z + (T.z - H.z) * e + Math.sin(e * Math.PI) * 5;
    const heading = H.heading + Math.PI * e; // (it turns round through the north on the way: a V)
    L.group.position.set(x, surfaceHeight(x, z), z);
    L.group.rotation.set(0, heading, 0);
    L.arm.rotation.x = -lift * 0.75;
    L.bucket.rotation.x = lift * 0.75 + tilt; // (the bucket kept level as the arms rise, then tipped)
    L.scoop.visible = full;
    if (dt > 0 && c >= 0.5 && c < 0.6 && st?.loading) {
      // the bucket's load falls into the bed
      const pb = particles(run);
      w.dumpAcc += 30 * dt;
      const tip = { x: x + Math.sin(heading) * 2.9, z: z + Math.cos(heading) * 2.9 };
      while (w.dumpAcc >= 1) {
        w.dumpAcc--;
        const a = { x: tip.x + (Math.random() - 0.5) * 2, y: surfaceHeight(x, z) + 4.2, z: tip.z + (Math.random() - 0.5) * 0.6 };
        lump(pb, a, { x: bed.x + (Math.random() - 0.5) * 1.8, y: surfaceHeight(bed.x, bed.z) + 1.6 + (st.load / S.capacity) * 1.2, z: bed.z + (Math.random() - 0.5) * 3 }, 0.5, { size: 0.4, grow: 0.3, r: 0.86, g: 0.85, bl: 0.82 });
      }
    }
    // (rolling: the wheels turn with the way)
    const moved = dt > 0 ? Math.hypot(x - (w.lx ?? x), z - (w.lz ?? z)) : 0;
    const sign = c > 0.25 && c < 0.5 ? -1 : 1;
    for (const wh of L.wheels) wh.rotation.x += (sign * moved) / 0.78;
    w.lx = x; w.lz = z;
    L.beacon.material.emissiveIntensity = st?.loading ? 0.5 + 0.7 * Math.max(0, Math.sin(performance.now() / 120)) : 0.15;
  }
};

export const SNOWFARM_FEATURES = { snowfarm };
