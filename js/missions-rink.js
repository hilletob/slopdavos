import * as THREE from 'three/webgpu';
import { attribute, vertexColor } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceHeight } from './terrain.js';
import { PersonCrowd, PersonRig, rollHairstyle } from './pedestrians.js';
import { touchLabel } from './missions-ice.js';
import { pondIceY } from './missions-outdoor.js';
import { pondBankPoints } from './missions-data-outdoor.js';
import { VEHICLES, GridMesh, createToast, particles, lump } from './missions-work.js';
import {
  RINK, createRinkIce, resetRinkIce, ringDistance, onIce, stepFreeze, stepSpray, stepBoots, stepConditioner,
  floodedShare, polishedShare, printCount, wetAt
} from './missions-data-rink.js';

// js/missions-rink.js
// The runtime of js/missions-data-rink.js (RINK_FEATURES, merged into js/missions.js FEATURES):
//   rinkIce — the Seehof Seeli's ice as one map mesh (js/missions-work.js GridMesh: a vertex a 0.5 m cell, its colour the
//             state of the ice: grey and scratched, wet and dark, frozen clear, resurfaced bright, footprints), the snow
//             bank round it, the lanterns, the hydrant with its reel and the hose trailing behind the walker to the nozzle
//             in the hands, the jet (js/missions-fx.js particles) and where it comes down (a ring on the ice). While the
//             hose is in the hands the walk is the mission's (slower; Space, the touch button, is the jet, not a jump).
//             The pond is a floor for the controllers meanwhile (controllerManager.groundPatch: no water there).
//   (the ice resurfacer itself is js/missions-work.js workVehicle's, on the player's car: its model is registered below in
//   VEHICLES as `zamboni`, its conditioner works the map from here; the car is parked by the pond at the start)
// Everything goes with the run's group and its cleanups.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const mat = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.6, ...o });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const objectiveId = (run) => run.def.objectives[run.index]?.id;

// --- The ice resurfacer ----------------------------------------------------------------------------------------------
// A compact resurfacer as the small rinks have: its own model, not the work vehicles' boxes. The body is one rounded
// side profile extruded across the width (the low nose with the open driver's place, the snow tank rising behind it
// with its sloped front and rounded top), the band and the sweep on its flanks, the black skirt over the wheels, the
// rails round the driver, the splash screen, the lamps, the amber beacon on its mast; at the back the conditioner's
// rounded housing with the vertical auger up into the tank, the hydraulic arms, the water bar and the towel on the ice.
// Merged per material (eight draws), apart only what moves: the four wheels and the beacon.
const RES = { W: 2.3, rear: -1.9, front: 2.05, wheelR: 0.38, track: 1.0, axleF: 1.3, axleR: -1.1 };

/** A side profile (s forwards, y up) extruded across the width, centred on x = 0, with rounded edges */
function sideExtrude(pts, width, bevel = 0.05, curveSegments = 10) {
  const shape = new THREE.Shape();
  pts.forEach((p, i) => {
    if (i === 0) shape.moveTo(p[0], p[1]);
    else if (p.length === 4) shape.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else shape.lineTo(p[0], p[1]);
  });
  shape.closePath();
  const depth = Math.max(0.01, width - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments });
  // (the shape's x is the model's forward z, the extrusion its width across x)
  geo.rotateY(-Math.PI / 2);
  geo.translate(depth / 2, 0, 0);
  return geo;
}
const rbox = (w, h, l, x, y, z, r = 0.04) => {
  const g = sideExtrude([[-l / 2 + r, -h / 2], [l / 2 - r, -h / 2], [l / 2, -h / 2, l / 2, -h / 2 + r], [l / 2, h / 2 - r], [l / 2, h / 2, l / 2 - r, h / 2], [-l / 2 + r, h / 2], [-l / 2, h / 2, -l / 2, h / 2 - r], [-l / 2, -h / 2 + r], [-l / 2, -h / 2, -l / 2 + r, -h / 2]], w, r * 0.6, 4);
  return g.translate(x, y, z);
};
const cyl = (r0, r1, len, x, y, z, rx = 0, rz = 0, seg = 14) => new THREE.CylinderGeometry(r0, r1, len, seg).rotateX(rx).rotateZ(rz).translate(x, y, z);
const tube = (pts, r = 0.03) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), pts.length * 8, r, 6, false);
/** Geometries merged into one mesh of one material (normals and uvs only: ExtrudeGeometry and the others agree then) */
function merged(list, material, shadow = true) {
  const geos = list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); return n; });
  const m = new THREE.Mesh(mergeGeometries(geos), material);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}
function decalTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#1f5fbf';
  x.font = '800 64px system-ui, sans-serif';
  x.textBaseline = 'middle';
  x.fillText('EISBAHN', 18, 50);
  x.font = '600 34px system-ui, sans-serif';
  x.fillStyle = '#3a4048';
  x.fillText('Seehofseeli · Davos Dorf', 20, 104);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function resurfacerWheel() {
  const g = new THREE.Group();
  const r = RES.wheelR;
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r - 0.09, 0.1, 10, 22).rotateY(Math.PI / 2), mat(0x1c1d1f, { roughness: 0.95 }));
  const side = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.06, r - 0.06, 0.22, 22).rotateZ(Math.PI / 2), mat(0x232426, { roughness: 0.9 }));
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.32, 16).rotateZ(Math.PI / 2), mat(0xd6d9dc, { roughness: 0.35, metalness: 0.6 }));
  tyre.castShadow = side.castShadow = true;
  g.add(tyre, side, rim);
  return g;
}
function buildZamboniModel() {
  const g = new THREE.Group();
  g.name = 'IceResurfacer';
  const C = RINK.conditioner, CW = C.halfW * 2, W = RES.W, F = RES.front, B = RES.rear;
  const white = [], blue = [], dark = [], steel = [], black = [];
  // the body: the nose with the driver's well, the tank behind it
  white.push(sideExtrude([
    [B, 0.42], [F - 0.25, 0.42], [F, 0.42, F, 0.68], [F, 0.88], [F, 1.02, F - 0.16, 1.02], [1.05, 1.02],
    [0.55, 1.06], [0.3, 1.9], [0.22, 2.1, -0.05, 2.12], [B + 0.25, 2.12], [B, 2.12, B, 1.88], [B, 0.42]
  ], W, 0.07));
  // the lid's seam, the band and the sweep on the flanks
  dark.push(sideExtrude([[0.28, 1.98], [B + 0.1, 1.98], [B + 0.1, 2.0], [0.27, 2.0]], W + 0.012, 0));
  blue.push(sideExtrude([[B - 0.01, 0.6], [F + 0.01, 0.6], [F + 0.01, 0.8], [B - 0.01, 0.8]], W + 0.03, 0.01));
  blue.push(sideExtrude([[0.5, 0.86], [0.36, 1.38], [-1.75, 0.86]], W + 0.03, 0.005));
  // the skirt under the body
  black.push(sideExtrude([[B + 0.05, 0.3], [F - 0.1, 0.3], [F - 0.08, 0.44], [B + 0.05, 0.44]], W - 0.1, 0.02));
  // the driver's place: the floor, the seat, the dashboard, the column and the wheel, the rails, the splash screen
  dark.push(rbox(1.6, 0.06, 0.95, 0, 1.05, 1.52, 0.02));
  dark.push(rbox(0.58, 0.14, 0.52, 0, 1.3, 0.92, 0.05), rbox(0.58, 0.6, 0.12, 0, 1.62, 0.62, 0.05));
  blue.push(rbox(1.3, 0.42, 0.3, 0, 1.28, 1.9, 0.06));
  dark.push(cyl(0.03, 0.03, 0.6, 0, 1.62, 1.78, -0.6, 0, 8));
  dark.push(new THREE.TorusGeometry(0.19, 0.022, 6, 20).rotateX(Math.PI / 2 - 0.6).translate(0, 1.92, 1.6));
  for (const sx of [1, -1]) steel.push(tube([[sx * 0.98, 1.05, 0.7], [sx * 1.0, 1.52, 0.85], [sx * 1.0, 1.55, 1.6], [sx * 0.98, 1.08, 2.0]], 0.028));
  steel.push(cyl(0.035, 0.035, 0.9, -0.95, 2.5, -0.35, 0, 0, 8)); // the beacon's mast
  // the lamps
  const lamps = [], tails = [];
  for (const sx of [0.72, -0.72]) {
    lamps.push(cyl(0.1, 0.1, 0.04, sx, 0.78, F + 0.02, Math.PI / 2, 0, 14));
    tails.push(rbox(0.22, 0.12, 0.04, sx * 1.2, 1.5, B - 0.01, 0.02));
  }
  // the conditioner: the rounded housing, its flared ends, the vertical auger into the tank, the arms, the water bar
  const cb = -C.back;
  steel.push(sideExtrude([[cb - 0.3, 0.1], [cb + 0.25, 0.1], [cb + 0.3, 0.2], [cb + 0.3, 0.44], [cb + 0.25, 0.56, cb + 0.05, 0.58], [cb - 0.22, 0.58], [cb - 0.32, 0.5, cb - 0.32, 0.38], [cb - 0.32, 0.18]], CW - 0.2, 0.06));
  for (const sx of [1, -1]) blue.push(rbox(0.12, 0.42, 0.66, sx * (CW / 2 - 0.06), 0.32, cb, 0.04));
  blue.push(rbox(CW - 0.3, 0.06, 0.52, 0, 0.6, cb, 0.02));
  steel.push(cyl(0.13, 0.13, 1.55, -0.88, 1.32, B - 0.18, 0.12, 0, 14)); // the vertical auger's tube
  steel.push(cyl(0.16, 0.16, 0.12, -0.88, 2.07, B - 0.08, 0.12, 0, 14));
  for (const sx of [0.55, -0.35]) {
    dark.push(cyl(0.05, 0.05, 0.75, sx, 0.62, cb + 0.62, Math.PI / 2 - 0.35, 0, 8));
    steel.push(cyl(0.028, 0.028, 0.5, sx, 0.72, cb + 0.85, Math.PI / 2 - 0.35, 0, 6));
  }
  dark.push(cyl(0.04, 0.04, CW - 0.35, 0, 0.16, cb - 0.36, 0, Math.PI / 2, 8)); // the water bar
  // mudflaps
  for (const sx of [1, -1]) black.push(rbox(0.36, 0.3, 0.03, sx * RES.track, 0.3, RES.axleR - 0.5, 0.01));
  const meshes = [
    merged(white, mat(0xf2f4f6, { roughness: 0.42 })), merged(blue, mat(0x1f5fbf, { roughness: 0.4 })),
    merged(dark, mat(0x2a2d32, { roughness: 0.7 })), merged(steel, mat(0xa9b0b7, { roughness: 0.3, metalness: 0.7 })),
    merged(black, mat(0x141516, { roughness: 0.85 })),
    merged(lamps, new THREE.MeshBasicNodeMaterial({ color: 0xfff4d6 }), false), merged(tails, new THREE.MeshBasicNodeMaterial({ color: 0xd8261b }), false)
  ];
  for (const m of meshes) g.add(m);
  // the splash screen in front of the driver (clear), the decals on the tank
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.42), new THREE.MeshStandardNodeMaterial({ color: 0xcfe6f5, transparent: true, opacity: 0.28, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  screen.position.set(0, 1.68, 2.02); screen.rotation.x = -0.25;
  g.add(screen);
  const decalMat = new THREE.MeshStandardNodeMaterial({ map: decalTexture(), transparent: true, roughness: 0.5, depthWrite: false });
  for (const sx of [1, -1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), decalMat);
    d.position.set(sx * (W / 2 + 0.03), 1.68, -0.75);
    d.rotation.y = sx * Math.PI / 2;
    g.add(d);
  }
  // the towel dragging behind, the beacon
  const towel = new THREE.Mesh(new THREE.BoxGeometry(CW - 0.3, 0.015, 0.8).translate(0, 0.008, -0.4), mat(0x22365e, { roughness: 1 }));
  towel.position.set(0, 0.02, cb - 0.34);
  g.add(towel);
  const beacon = new THREE.Mesh(cyl(0.11, 0.13, 0.2, 0, 0, 0, 0, 0, 14), mat(0xffa000, { emissive: 0xff8f00, emissiveIntensity: 0.9, roughness: 0.3 }));
  beacon.position.set(-0.95, 3.03, -0.35);
  g.add(beacon);
  const wheels = [];
  for (const z of [RES.axleF, RES.axleR]) for (const sx of [1, -1]) {
    const w = resurfacerWheel();
    w.position.set(sx * RES.track, RES.wheelR, z);
    w.rotation.order = 'YXZ'; // (steered about the upright, then rolling about its own axle)
    g.add(w);
    wheels.push({ mesh: w, r: RES.wheelR, front: z > 0 });
  }
  return {
    group: g, wheels, beacon,
    drive: { speed: 6.5, reverseSpeed: 2.2, acceleration: 2.2, powerSpeed: 0, rolling: 0.35, drag: 0, coast: 1.5, brake: 4.2, wheelbase: RES.axleF - RES.axleR, grip: 3.6, cornering: 3.6, rearSteer: RES.axleF }, // (steered at the rear axle, like the real machines: the tail swings out)
    dims: { halfW: 1.2, halfL: 2.3, top: 3.1, mass: 3400 }, chase: [9, 3.8], label: 'Ice resurfacer',
    seat: { seat: new THREE.Vector3(0, 1.37, 0.92), bars: new THREE.Vector3(0, 1.92, 1.6), gripHalf: 0.17, bracket: new THREE.Vector3(0, 1.1, 1.75), crankLength: 0, pedalHalf: 0.16, lean: 0.05 }
  };
}
VEHICLES.zamboni = buildZamboniModel;

// --- The ice's colours -----------------------------------------------------------------------------------------------
const SNOW = new THREE.Color(0.9, 0.92, 0.95), RAW = new THREE.Color(0.6, 0.64, 0.68), COAT = new THREE.Color(0.62, 0.76, 0.9);
const WET = new THREE.Color(0.2, 0.3, 0.4), PRINT = new THREE.Color(0.44, 0.45, 0.47), POLISH = new THREE.Color(0.86, 0.93, 1.0), FILM = new THREE.Color(0.42, 0.55, 0.68);

/** The snow bank round the ice: a low ridge just outside the ring (m over the ground by the distance from the ring) */
const bankProfile = (d) => (d < 0.25 ? 0.06 : d < 1.1 ? 0.06 + 0.4 * ((d - 0.25) / 0.85) : d < 3 ? 0.46 * (1 - (d - 1.1) / 1.9) : 0);

// --- The hose ----------------------------------------------------------------------------------------------------------
const HOSE_SEGMENTS = 90;
function buildHydrant() {
  const g = new THREE.Group();
  g.name = 'Hydrant';
  const red = 0xc8231f;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.85, 12).translate(0, 0.42, 0), mat(red, { roughness: 0.45 }));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.85, 0), mat(red, { roughness: 0.45 }));
  const outlet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8).rotateZ(Math.PI / 2).translate(0, 0.55, 0), mat(0xb8bcc0, { metalness: 0.6, roughness: 0.3 }));
  // the hose reel on its two-wheeled cart beside it
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 16).rotateZ(Math.PI / 2).translate(0.9, 0.62, 0), mat(0x8a2a22, { roughness: 0.7 }));
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08).translate(0.9, 0.45, 0.35), mat(0x55595e, { metalness: 0.5 }));
  for (const m of [body, cap, outlet, reel, frame]) { m.castShadow = true; g.add(m); }
  return g;
}

/**
 * The floor round the pond: the ice over the pond, and where the ground just outside it dips below the ice (the terrain is
 * carved under the water's edge) a bank sloping down from the ice; NaN elsewhere (the controllers' own ground)
 */
function rinkFloor(x, z, iceY) {
  if (x < 690 || x > 763 || z < -1455 || z > -1383) return NaN;
  if (onIce(x, z)) return iceY;
  const ground = surfaceHeight(x, z);
  if (ground >= iceY) return NaN;
  const y = iceY - 0.35 * Math.max(0, ringDistance(x, z) - 1);
  return y > ground + 0.02 ? y : NaN;
}

/** The person's walk with the hose in the hands: slower, and Space is the jet (js/controllers.js personDriver) */
function hoseWalk(dt, cm) {
  const p = cm.entities.person, H = RINK.hose, k = cm.keys;
  const target = k.forward ? H.walk * k.forward : k.backward ? -H.back * k.backward : 0;
  if (k.left) p.heading += H.turn * dt * k.left;
  if (k.right) p.heading -= H.turn * dt * k.right;
  p.speed += clamp(target - p.speed, -6 * dt, 6 * dt);
  p.position.x += Math.sin(p.heading) * p.speed * dt;
  p.position.z += Math.cos(p.heading) * p.speed * dt;
  cm.resolveHorizontalCollision(p.position, 0.48, null, p);
  p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person', p.position.y);
  p.verticalVel = 0;
}

const rinkIce = {
  setup(run) {
    const cm = run.hooks.controllerManager;
    const iceY = pondIceY();
    // the pond is a floor meanwhile (the walker on the ice, the machine too)
    cm.groundPatch = (x, z) => rinkFloor(x, z, iceY);
    run.cleanups.push(() => { if (cm.groundPatch) cm.groundPatch = null; });
    const grid = createRinkIce();
    const F = RINK.frame, n = grid.cols * grid.rows;
    // the bank's ridge outside the ring (once: the distance of each cell from the ring)
    // (beyond it the map's cells sink under the terrain: the box round the pond is not to be seen; the glow, below, is
    // the ice's only)
    const bank = new Float32Array(n), glow = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      if (grid.inside[k]) { glow[k] = 1; continue; }
      const w = F.toWorld(((k % grid.cols) + 0.5) * grid.cell, (((k / grid.cols) | 0) + 0.5) * grid.cell);
      const d = ringDistance(w.x, w.z);
      bank[k] = d > 3.4 ? -0.5 : bankProfile(d);
      glow[k] = Math.max(0, 1 - d / 0.8);
    }
    const mesh = new GridMesh(grid, {
      toWorld: (u, v) => F.toWorld(u, v), name: 'RinkIce', lift: 0.03, roughness: 0.4,
      base: (x, z) => { const y = rinkFloor(x, z, iceY); return Number.isFinite(y) ? y : surfaceHeight(x, z); },
      height: (_h, k) => (grid.inside[k] ? Math.min(0.02, grid.wet[k] * 0.015) : bank[k]),
      colour: (h, k, out) => {
        if (!grid.inside[k]) return out.copy(SNOW).multiplyScalar(0.95 + 0.05 * hash(k));
        if (grid.prints[k]) out.copy(PRINT).multiplyScalar(0.9 + 0.15 * hash(k + 3));
        else if (grid.polish[k]) out.copy(POLISH).lerp(FILM, grid.film[k]).multiplyScalar(0.985 + 0.03 * hash(k));
        // (the day's ice: grey with scratches and snow dust; the new coat clear and blue)
        else out.copy(RAW).multiplyScalar(0.84 + 0.3 * hash(k) * hash(k + 11)).lerp(COAT, clamp(h, 0, 1));
        const w = grid.wet[k];
        if (w > 0) out.lerp(WET, clamp(w / 0.5, 0, 1) * 0.85);
        return out;
      }
    });
    // (lit a little from within, as the hockey's ice: at dusk the states of the ice still read)
    mesh.mesh.geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    mesh.mesh.material.emissiveNode = vertexColor().mul(attribute('aGlow', 'float').mul(0.32));
    run.group.add(mesh.mesh);
    // the lanterns on the bank (self-lit: no lights to pay for)
    const posts = pondBankPoints(3.2, 6);
    const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.05, 2.8, 5).translate(0, 1.4, 0), mat(0x3a3f46), posts.length);
    const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), new THREE.MeshBasicNodeMaterial({ color: 0xffc77a }), posts.length);
    posts.forEach((q, i) => {
      const y = Math.max(surfaceHeight(q.x, q.z), iceY);
      postMesh.setMatrixAt(i, _m.makeTranslation(q.x, y - 0.25, q.z));
      lampMesh.setMatrixAt(i, _m.makeTranslation(q.x, y + 2.67, q.z));
    });
    for (const m of [postMesh, lampMesh]) { m.frustumCulled = false; run.group.add(run.storage(m)); }
    // the hydrant, the hose (segments, one instanced mesh), the nozzle, the jet's ring
    const hy = surfaceHeight(RINK.hydrant.x, RINK.hydrant.z);
    const hydrant = buildHydrant();
    hydrant.position.set(RINK.hydrant.x, hy, RINK.hydrant.z);
    hydrant.rotation.y = Math.atan2(727 - RINK.hydrant.x, -1419 - RINK.hydrant.z) + Math.PI / 2;
    run.group.add(hydrant);
    const hose = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), mat(0xd8452b, { roughness: 0.7 }), HOSE_SEGMENTS);
    hose.frustumCulled = false; hose.castShadow = true;
    run.group.add(run.storage(hose));
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.38, 8).rotateX(Math.PI / 2), mat(0xb08a30, { metalness: 0.7, roughness: 0.3 }));
    run.group.add(nozzle);
    const ring = new THREE.Mesh(new THREE.RingGeometry(RINK.hose.radius - 0.18, RINK.hose.radius, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.4, depthWrite: false }));
    ring.renderOrder = 5;
    run.group.add(ring);
    // a few skaters waiting on the bank with their skates over the shoulder
    const watchers = pondBankPoints(3.6, 5).filter((q) => q.z > -1440).slice(0, 5).map((q, i) => ({ ...q, y: Math.max(surfaceHeight(q.x, q.z), iceY), ph: i * 1.7 }));
    const crowd = new PersonCrowd(watchers.length, { farDistance: 70, castShadow: false });
    for (const m of crowd.meshes) run.group.add(m);
    watchers.forEach((w, i) => { const female = i % 2 === 1; w.rig = new PersonRig({ seed: (i * 0.37 + 0.2) % 1, female, girth: 0.95 + (i % 3) * 0.05, ...rollHairstyle(((i + 3) * 0.618) % 1, female) }); });
    run.work = { grid, mesh, iceY, hose, nozzle, ring, hydrantY: hy, crumbs: [], toast: createToast(run), g: {}, f: {}, jetAcc: 0, printT: 0, shareT: 0, crowd, watchers, saved: null };
    // the car: its state before the mission (the machine is parked on it by the pond)
    const car = cm.entities.car;
    run.work.saved = { hidden: !!car.hidden, x: car.position.x, z: car.position.z, heading: car.heading };
    run.cleanups.push(() => {
      if (cm.personDriver === hoseWalk) cm.personDriver = null;
      const s = run.work?.saved;
      // (the player left on foot: the van goes back where it was, hidden again if it was put away)
      if (s && cm.activeMode !== 'car') { cm.placeEntity('car', s.x, s.z, s.heading); cm.setEntityHidden('car', s.hidden); }
    });
  },
  reset(run) {
    const w = run.work, cm = run.hooks.controllerManager;
    resetRinkIce(w.grid, createRinkIce());
    w.mesh.refresh();
    w.crumbs.length = 0;
    w.toast.hide();
    const M = RINK.machine, car = cm.entities.car;
    cm.setEntityHidden('car', false);
    cm.placeEntity('car', M.x, M.z, M.heading);
    car.speed = 0; car.vx = 0; car.vz = 0; car.angularVel = 0;
    if (run.state) run.state.machineAt = { x: M.x, z: M.z };
    touchLabel(run, 'Spray');
  },
  update(run, ctx, dt, cm) {
    const w = run.work, st = run.state, p = cm.entities.person, car = cm.entities.car;
    const obj = objectiveId(run);
    const hoseOn = obj === 'flood' && ctx.mode === 'person';
    // the walk with the hose (and Space for the jet) only while flooding
    if (hoseOn && live(run)) cm.personDriver = hoseWalk;
    else if (cm.personDriver === hoseWalk) cm.personDriver = null;
    st.spraying = false;
    if (hoseOn && live(run)) {
      const g = RINK.frame.toGrid(p.position.x, p.position.z, w.g), f = RINK.frame.dirToGrid(Math.sin(p.heading), Math.cos(p.heading), w.f);
      if (cm.keys.up) { st.spraying = true; const laid = stepSpray(w.grid, g, f, dt); rinkIce.jet(run, p, laid, dt); }
      const printed = stepBoots(w.grid, g, Math.abs(p.speed) > 0.2);
      if (printed && run.phase === 'running') {
        st.printed += printed;
        if (performance.now() - w.printT > 1800) { w.printT = performance.now(); w.toast.show('Footprints in the fresh ice!', '#ff9e8a', 1.6); }
      }
    }
    st.onWet = ctx.mode === 'person' && obj === 'flood' && wetAt(w.grid, p.position.x, p.position.z) > RINK.printWet;
    if (ctx.mode === 'car' && live(run) && (obj === 'resurface' || obj === 'machine')) {
      const g = RINK.frame.toGrid(car.position.x, car.position.z, w.g), f = RINK.frame.dirToGrid(Math.sin(car.heading), Math.cos(car.heading), w.f);
      if (stepConditioner(w.grid, g, f, car.speed || 0) > 0) rinkIce.mist(run, car, dt);
    }
    stepFreeze(w.grid, dt);
    // (the shares: a pass over the map, five times a second is enough for the HUD)
    w.shareT -= dt;
    if (w.shareT <= 0) { w.shareT = 0.2; st.flooded = floodedShare(w.grid); st.polished = polishedShare(w.grid); st.prints = printCount(w.grid); }
    if (obj !== 'machine' || ctx.mode !== 'car') st.machineAt = { x: car.position.x, z: car.position.z };
    w.mesh.update(dt);
    w.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
  },
  after(run, ctx, dt, cm) {
    const w = run.work, p = cm.entities.person, obj = objectiveId(run);
    const inHand = ctx.mode === 'person' && obj === 'flood';
    rinkIce.drawHose(run, p, inHand);
    w.nozzle.visible = inHand;
    w.ring.visible = inHand && live(run);
    if (w.ring.visible) {
      const r = RINK.hose.reach, x = p.position.x + Math.sin(p.heading) * r, z = p.position.z + Math.cos(p.heading) * r;
      w.ring.position.set(x, (onIce(x, z) ? w.iceY : surfaceHeight(x, z)) + 0.06, z);
      w.ring.material.opacity = run.state.spraying ? 0.55 : 0.3;
    }
    if (run.vehicle?.driver) for (const m of run.vehicle.driver.crowd.meshes) m.visible = ctx.mode === 'car';
    if (run.vehicle?.beacon) run.vehicle.beacon.material.emissiveIntensity = ctx.mode === 'car' ? 0.6 + 0.6 * Math.max(0, Math.sin(performance.now() / 120)) : 0.2;
    // the skaters on the bank, shifting from foot to foot in the cold
    const t = performance.now() / 1000, iceY = w.iceY;
    w.crowd.begin();
    for (const s of w.watchers) {
      s.rig.update(dt, s.x, s.z, s.yaw + Math.sin(t * 0.4 + s.ph) * 0.25, (_o, x, z) => Math.max(surfaceHeight(x, z), iceY));
      w.crowd.add(s.rig, 0);
    }
    w.crowd.end();
  },
  /** The hose from the hydrant along where the walker went (breadcrumbs, reeled in on the way back) to the nozzle */
  drawHose(run, p, inHand) {
    const w = run.work, C = w.crumbs;
    const H = RINK.hydrant;
    if (inHand) {
      const last = C.length ? C[C.length - 1] : H;
      if (Math.hypot(p.position.x - last.x, p.position.z - last.z) > 1.4) C.push({ x: p.position.x, z: p.position.z });
      while (C.length >= 2 && Math.hypot(p.position.x - C[C.length - 2].x, p.position.z - C[C.length - 2].z) < 1.1) C.pop();
      if (C.length && Math.hypot(p.position.x - H.x, p.position.z - H.z) < 1.2) C.length = 0;
      while (C.length > HOSE_SEGMENTS - 4) C.splice(1, 1);
    } else if (C.length && objectiveId(run) !== 'flood') C.length = 0; // (rolled up again on the reel)
    const ground = (x, z) => (onIce(x, z) ? w.iceY : surfaceHeight(x, z)) + 0.04;
    const pts = [[H.x + 0.2, w.hydrantY + 0.55, H.z], [H.x + 0.45, w.hydrantY + 0.06, H.z]];
    for (const c of C) pts.push([c.x, ground(c.x, c.z), c.z]);
    let hand = null;
    if (inHand) {
      const h = p.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
      pts.push([p.position.x - fx * 0.4, ground(p.position.x, p.position.z), p.position.z - fz * 0.4]);
      hand = [p.position.x + fx * 0.42 - lx * 0.12, p.position.y + 1.02, p.position.z + fz * 0.42 - lz * 0.12];
      pts.push(hand);
      w.nozzle.position.set(hand[0] + fx * 0.2, hand[1] + 0.03, hand[2] + fz * 0.2);
      w.nozzle.rotation.set(-0.25, h, 0, 'YXZ');
    }
    let i = 0;
    for (; i < pts.length - 1 && i < HOSE_SEGMENTS; i++) {
      const a = pts[i], b = pts[i + 1];
      _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = _d.length();
      if (len < 1e-3) { w.hose.setMatrixAt(i, ZERO); continue; }
      _q.setFromUnitVectors(UP, _d.divideScalar(len));
      w.hose.setMatrixAt(i, _m.compose(_p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(1, len, 1)));
    }
    for (; i < HOSE_SEGMENTS; i++) w.hose.setMatrixAt(i, ZERO);
    w.hose.instanceMatrix.needsUpdate = true;
  },
  /** The jet: drops from the nozzle in an arc onto the fan */
  jet(run, p, laid, dt) {
    const w = run.work;
    w.jetAcc += dt * 90;
    if (w.jetAcc < 1) return;
    const pb = particles(run), h = p.heading, fx = Math.sin(h), fz = Math.cos(h);
    const o = { x: w.nozzle.position.x + fx * 0.2, y: w.nozzle.position.y, z: w.nozzle.position.z + fz * 0.2 };
    const R = RINK.hose;
    while (w.jetAcc >= 1) {
      w.jetAcc--;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R.radius * 0.85;
      const x = p.position.x + fx * R.reach + Math.cos(a) * r, z = p.position.z + fz * R.reach + Math.sin(a) * r;
      const b = { x, y: (onIce(x, z) ? w.iceY : surfaceHeight(x, z)) + 0.05, z };
      lump(pb, o, b, 0.45 + Math.random() * 0.12, { size: 0.07, grow: 0.3, r: 0.72, g: 0.86, bl: 1, alpha: 0.75 });
    }
    void laid;
  },
  /** A little steam off the warm water behind the conditioner */
  mist(run, car, dt) {
    const w = run.work;
    w.jetAcc += dt * 14;
    if (w.jetAcc < 1) return;
    const pb = particles(run), h = car.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    while (w.jetAcc >= 1) {
      w.jetAcc--;
      const s = (Math.random() - 0.5) * RINK.conditioner.halfW * 2, back = RINK.conditioner.back + 0.6;
      pb.spawn({ x: car.position.x - fx * back + lx * s, y: w.iceY + 0.05, z: car.position.z - fz * back + lz * s, vx: 0, vy: 0.5, vz: 0, gravity: 0, life: 1.1, size0: 0.12, size1: 0.5, alpha: 0.12, r: 0.92, g: 0.95, b: 1, kind: 'lump' });
    }
  }
};

export const RINK_FEATURES = { rinkIce };
