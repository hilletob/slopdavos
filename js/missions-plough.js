import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { painted } from './missions-props.js';
import { VEHICLES, createToast, particles, lump } from './missions-work.js';
import { BODY_SPECS, buildCarGeometry, buildSteerableWheelGeo, createLoftedCarMaterial } from './actor-models.js';
import { releaseVehicle } from './hijack.js';
import { routePoint } from './missions-data-work.js';
import {
  PLOUGH, PLOUGH_JOINTS, PLOUGH_JUNCTIONS, createPloughRoute, createPloughGrid, resetPloughGrid, createPoles, laneShare,
  stepPlough, poleHits, jointCrossed, buriedJunction, boxesOverlap, roadPose, zoneAt, bladeGeometry
} from './missions-data-plough.js';

// js/missions-plough.js
// The runtime of the snow plough over the Wolfgang (js/missions-data-plough.js; js/missions.js takes PLOUGH_FEATURES into
// its FEATURES):
//   the lorry  — registered in js/missions-work.js VEHICLES as `plough`, worn by the player's car through workVehicle:
//                the traffic's lofted cab-over cab and frame (js/actor-models.js, in the municipal orange) on a spec of
//                its own, the salt spreader's hopper on the frame with its spinner turning behind, the reversible blade
//                on its push frame in front (it swings to the throw side and lifts), the plough lamps on their posts over
//                the blade, two amber beacons on the cab roof, the marker rods at the blade's ends; twin tyres behind.
//                The car's own two headlamp spots move onto the plough lamps for the run (no light more for the shaders).
//   plough     — the snow map along the Prättigauerstrasse as 34 meshes of 64 m (a vertex a cell: the snow's depth its
//                height, the cleared asphalt dark and wet), the snow poles on the verges (one instanced draw; knocked
//                ones lie in the snow), the yellow-black plough markers at the Totalpbach bridge's joints, the sign at
//                the Passhöhe; the blade's spray (js/missions-fx.js particles); the keys V (swing) and F (lift); the
//                penalties; the oncoming traffic eased to the kerb and kept rolling past the blade.
// Everything goes with the run's group and its cleanups.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const vertexMat = (o = {}) => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, ...o });
const boxAt = (w, h, l, hex, x, y, z, rx = 0, ry = 0, rz = 0) => painted(new THREE.BoxGeometry(w, h, l), hex).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
const cylAt = (r0, r1, h, seg, hex, x, y, z, rx = 0, rz = 0) => painted(new THREE.CylinderGeometry(r0, r1, h, seg), hex).rotateX(rx).rotateZ(rz).translate(x, y, z);

// --- The plough lorry ------------------------------------------------------------------------------------------------
// A 2-axle municipal lorry of the 18-tonne class as the Kanton runs on its passes (a Mercedes Arocs / MAN TGS with a
// Schmidt or Kahlbacher outfit): the cab-over cab in the municipal orange, the frame behind it carrying the salt
// spreader; in front the push frame on the bumper and the 3.9 m reversible blade. The spec is the green-waste lorry's
// (js/missions-rural.js) with a shorter platform line, the hopper standing on the frame instead of a bed.
const DZ = 0.2; // the spec's axles are symmetric about its origin: the body sits this far forward on the lorry's centre
const FRAME_Y = 0.97;
const SPEC = {
  ...BODY_SPECS.truck,
  name: 'plough-lorry',
  zFront: 2.55, zRear: -2.95,
  wheelRadius: 0.48, wheelZ: 1.55, wheelX: 0.86,
  archGap: 0.08, archFlare: 0.015, tuck: 0.05, lowerRound: 2.6, upperRound: 6,
  halfWidth: [[2.55, 1.02], [2.0, 1.06], [0.96, 1.06], [0.9, 1.04], [-2.95, 1.04]],
  sill: [[2.55, 0.56], [0.98, 0.56], [0.92, 0.66], [-2.95, 0.66]],
  shoulder: [[2.55, 1.06], [0.98, 1.08], [0.92, 0.84], [-2.95, 0.84]],
  edge: [[2.5, 1.62], [2.1, 1.68], [0.98, 1.7], [0.92, FRAME_Y - 0.004], [-2.95, FRAME_Y - 0.004]],
  crown: [[2.5, 0.025], [0.98, 0.012], [0.92, 0.003], [-2.95, 0.003]],
  tumble: [[2.55, 0.06], [0.98, 0.05], [0.92, 0.0], [-2.95, 0.0]],
  nose: { halfWidth: [0.2, 0.9, 2.4], edge: [0.12, 1.52, 2.6], crown: [0.12, 0.01, 2], sill: [0.1, 0.58, 2], shoulder: [0.15, 0.98, 2.2] },
  tail: { halfWidth: [0.05, 1.02, 2.6], edge: [0.03, FRAME_Y - 0.03, 4], crown: [0.03, 0, 2], sill: [0.05, 0.68, 2], shoulder: [0.05, 0.84, 2.4] },
  cabin: {
    ...BODY_SPECS.truck.cabin,
    cowl: 2.42, roofFront: 2.12, roofRear: 1.08, deck: 0.99,
    roofY: [[2.12, 2.62], [1.08, 2.6]],
    rail: [0.98, 0.98], inset: 0.025, bulge: 0.004, roofRound: 5, pillars: []
  },
  doors: [2.3, 1.06], handles: [1.24],
  headlight: [0.72, 0.92, 0.19, 0.075], taillight: [0.82, 0.84, 0.13, 0.065],
  grille: [1.12, 0.56, 0.15], intake: [0.73, 0.4, 0.028], plates: [0.85, 0.8], bumperLine: [1.0, 0.72],
  bumpers: [[0.6, 0.085], [0.55, 0.05]],
  chrome: false, cladding: 0.66, rails: false, sign: false, rearWiper: false
};
const ORANGE = 0xf07d1a, ORANGE_D = 0xc4620e, BLACK = 0x17181a, FRAME = 0x24272b, STEEL = 0x8d949b, GREY = 0x5d6267, WHITE = 0xeeeeea, RED = 0xc0161e, YELLOW = 0xf2c200;
// where the blade's cutting edge sits (its middle) in the lorry's frame: js/missions-data-plough.js PLOUGH.bladeAhead
const BLADE_Z = PLOUGH.bladeAhead;
// the plough lamps: the car's headlamp spots move here for the run (js/vehicle-lights.js placeVehicleHeadlight reads it)
const LAMPS = { headlight: [0.82, 1.62], zFront: 3.05 };

/** The fittings on the frame: the hopper, the spinner's chute, the push frame, the lamp posts, the mudguards */
function lorryFittings() {
  const p = [];
  const y0 = FRAME_Y, z0 = -2.75, z1 = 0.85, zc = (z0 + z1) / 2, L = z1 - z0;
  // the frame rails and the tank under the hopper, the side guards, the battery box
  for (const sx of [-1, 1]) p.push(boxAt(0.09, 0.22, 5.4, FRAME, sx * 0.44, 0.62, -0.25));
  p.push(boxAt(0.34, 0.36, 0.95, 0x2c3035, 0.76, 0.55, -0.3), boxAt(0.3, 0.3, 0.5, BLACK, -0.76, 0.56, 0.05));
  for (const sx of [-1, 1]) for (const y of [0.5, 0.64]) p.push(boxAt(0.035, 0.06, 1.5, 0xa2a8ae, sx * 0.99, y, -0.05));
  // the hopper: a box on the frame, its sides flaring out, the lid's grid on top, the ladder at the back
  p.push(boxAt(1.7, 0.42, L, GREY, 0, y0 + 0.21, zc)); // the conveyor's trough
  for (const sx of [-1, 1]) {
    p.push(boxAt(0.05, 1.0, L, ORANGE, sx * 1.0, y0 + 0.86, zc, 0, 0, sx * 0.22)); // the flared side
    p.push(boxAt(0.06, 0.08, L + 0.04, ORANGE_D, sx * 1.1, y0 + 1.36, zc)); // its top rail
    for (const z of [z0 + 0.3, zc, z1 - 0.3]) p.push(boxAt(0.07, 0.9, 0.08, ORANGE_D, sx * 1.02, y0 + 0.84, z, 0, 0, sx * 0.22)); // the stiffeners
  }
  p.push(boxAt(2.2, 1.0, 0.05, ORANGE, 0, y0 + 0.86, z1)); // the front wall
  p.push(boxAt(2.2, 1.0, 0.05, ORANGE, 0, y0 + 0.86, z0)); // the back wall
  p.push(boxAt(2.1, 0.03, L - 0.06, 0xdfe3e6, 0, y0 + 1.25, zc)); // the salt heaped in it
  for (let i = 0; i <= 8; i++) p.push(boxAt(0.035, 0.035, L, BLACK, -1.05 + i * 0.2625, y0 + 1.4, zc)); // the lid's grid
  for (let i = 0; i <= 6; i++) p.push(boxAt(2.2, 0.035, 0.035, BLACK, 0, y0 + 1.4, z0 + (i * L) / 6));
  for (const sx of [-1, 1]) p.push(boxAt(0.04, 1.3, 0.04, STEEL, sx * 0.25, y0 + 0.5, z0 - 0.08)); // the ladder
  for (let i = 0; i < 5; i++) p.push(boxAt(0.5, 0.03, 0.03, STEEL, 0, y0 + 0.0 + i * 0.28, z0 - 0.08));
  // the chute under the back end to the spinner, the spinner's housing, the rear lamps on their bar, the chevrons
  p.push(boxAt(0.3, 0.45, 0.3, GREY, 0, 0.75, -2.95));
  p.push(boxAt(2.1, 0.12, 0.1, BLACK, 0, 0.55, -2.92));
  for (let i = 0; i < 8; i++) p.push(boxAt(0.25, 0.32, 0.04, i % 2 ? WHITE : RED, -0.875 + i * 0.25, 0.8, -2.8));
  for (const sx of [-1, 1]) p.push(boxAt(0.22, 0.14, 0.06, 0x8e1b16, sx * 0.85, 0.62, -2.98));
  // the mudguards over the twin tyres, the mudflaps
  for (const sx of [-1, 1]) { p.push(boxAt(0.62, 0.05, 1.1, BLACK, sx * 0.8, 1.08, -1.35)); p.push(boxAt(0.5, 0.36, 0.015, BLACK, sx * 0.8, 0.36, -1.98)); }
  // the push frame on the bumper: the plate, the two arms, the ram
  p.push(boxAt(1.5, 0.55, 0.12, FRAME, 0, 0.66, 2.86));
  for (const sx of [-1, 1]) p.push(boxAt(0.12, 0.14, 0.62, FRAME, sx * 0.5, 0.48, 3.15));
  p.push(cylAt(0.06, 0.06, 0.55, 8, STEEL, 0, 0.85, 3.08, Math.PI / 2 - 0.5));
  // the plough lamps on their posts over the blade, the marker of the push frame
  for (const sx of [-1, 1]) {
    p.push(boxAt(0.06, 0.95, 0.06, FRAME, sx * LAMPS.headlight[0], 1.15, 2.9));
    p.push(boxAt(0.32, 0.24, 0.16, BLACK, sx * LAMPS.headlight[0], LAMPS.headlight[1], 2.95));
  }
  // the truck mirrors, the step under each door, the beacons' bar on the cab roof
  for (const sx of [-1, 1]) {
    p.push(boxAt(0.24, 0.03, 0.03, BLACK, sx * 1.12, 2.08, 2.36), boxAt(0.05, 0.34, 0.22, BLACK, sx * 1.25, 1.95, 2.34, 0, sx * 0.12));
    p.push(boxAt(0.12, 0.04, 0.42, FRAME, sx * 0.97, 0.46, 1.2));
  }
  p.push(boxAt(1.5, 0.08, 0.22, BLACK, 0, 2.66, 1.95));
  return mergeGeometries(p);
}

/** The blade on its pivot: the curved mouldboard, the steel edge, the end plates, the stripes, the marker rods */
function buildBlade() {
  const g = new THREE.Group();
  const W = PLOUGH.bladeHalf * 2, H = 1.05, R = 0.62;
  // the mouldboard: a quarter and more of a cylinder about x, concave forward: from the cutting edge at its foot (z 0.15)
  // back and up to the lip leaning forward again at the top (the cylinder's angle θ: height R(1 + sin θ), depth R cos θ)
  const board = new THREE.CylinderGeometry(R, R, W, 24, 1, true, Math.PI * 0.75, Math.PI * 0.75).rotateZ(Math.PI / 2);
  board.translate(0, R, 0.15);
  const boardMesh = new THREE.Mesh(painted(board, ORANGE), vertexMat({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.15 }));
  boardMesh.castShadow = true;
  const p = [];
  p.push(boxAt(W, 0.1, 0.1, STEEL, 0, 0.05, 0.12)); // the cutting edge
  p.push(boxAt(W - 0.1, 0.55, 0.05, ORANGE_D, 0, 0.6, -0.62)); // the back plate
  for (const x of [-0.9, -0.3, 0.3, 0.9]) p.push(boxAt(0.06, 0.6, 0.2, ORANGE_D, x, 0.62, -0.52)); // its ribs
  for (const sx of [-1, 1]) {
    p.push(boxAt(0.05, H, 0.75, ORANGE_D, sx * (W / 2 - 0.02), H / 2, -0.22)); // the end plates
    p.push(boxAt(0.14, 0.12, 0.4, BLACK, sx * (W / 2 - 0.1), 0.06, -0.3)); // the skid shoes
    // the marker rod at the end: orange with black bands, a little flag at the top
    for (let i = 0; i < 6; i++) p.push(cylAt(0.018, 0.018, 0.2, 6, i % 2 ? BLACK : ORANGE, sx * (W / 2 - 0.05), H + 0.12 + i * 0.2, -0.4));
    p.push(boxAt(0.02, 0.14, 0.2, ORANGE, sx * (W / 2 - 0.05), H + 1.25, -0.5));
  }
  // the red and white reflective stripes along the top edge
  for (let i = 0; i < 13; i++) p.push(boxAt(W / 13 - 0.01, 0.1, 0.05, i % 2 ? WHITE : RED, -W / 2 + (i + 0.5) * (W / 13), H - 0.04, -0.33)); // (on the lip's back edge)
  const fit = new THREE.Mesh(mergeGeometries(p), vertexMat({ roughness: 0.5, metalness: 0.2 }));
  fit.castShadow = true;
  g.add(boardMesh, fit);
  return g;
}

function buildPloughModel() {
  const g = new THREE.Group();
  g.name = 'PloughLorry';
  const bodyMat = createLoftedCarMaterial(SPEC, ORANGE);
  bodyMat.userData.shared = true; // (cached by js/actor-models.js: not the run's to dispose)
  const body = new THREE.Mesh(buildCarGeometry(SPEC, false).translate(0, 0, DZ), bodyMat);
  body.castShadow = true;
  g.add(body);
  const fittings = new THREE.Mesh(lorryFittings(), vertexMat({ roughness: 0.55, metalness: 0.2 }));
  fittings.castShadow = true;
  fittings.receiveShadow = true;
  g.add(fittings);
  // the plough lamps' lenses and the beacons: lit
  const lampMat = new THREE.MeshStandardNodeMaterial({ color: 0xfff6dd, emissive: 0xffeec8, emissiveIntensity: 1.6, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14).rotateX(Math.PI / 2).translate(sx * LAMPS.headlight[0], LAMPS.headlight[1], 3.04), lampMat);
    g.add(lens);
  }
  const beaconMats = [0, 1].map(() => new THREE.MeshStandardNodeMaterial({ color: 0xffa214, emissive: 0xff8a00, emissiveIntensity: 0.4, roughness: 0.3, transparent: true, opacity: 0.92 }));
  [-0.6, 0.6].forEach((x, i) => g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 14).translate(x, 2.8, 1.95), beaconMats[i])));
  // the blade on its pivot (it swings about y and lifts)
  const blade = buildBlade();
  const bladePivot = new THREE.Group();
  bladePivot.position.set(0, 0, BLADE_Z);
  bladePivot.add(blade);
  g.add(bladePivot);
  // the spinner behind: a disc with its vanes
  const spinner = new THREE.Mesh(mergeGeometries([cylAt(0.32, 0.32, 0.03, 18, STEEL, 0, 0, 0), ...[0, 1, 2, 3].map((i) => boxAt(0.6, 0.07, 0.03, GREY, 0, 0.04, 0, 0, (i * Math.PI) / 4))]), vertexMat({ metalness: 0.6, roughness: 0.4 }));
  spinner.position.set(0, 0.48, -3.2);
  g.add(spinner);
  // the wheels: the traffic's, scaled to the lorry; twins at the back. (YXZ: the spin about the axle, then the steer)
  const wheelMat = createLoftedCarMaterial(BODY_SPECS.sedan, 0x30343a);
  wheelMat.userData.shared = true;
  const Rw = SPEC.wheelRadius, scale = Rw / BODY_SPECS.sedan.wheelRadius, wheels = [];
  for (const side of [-1, 1]) {
    const geo = buildSteerableWheelGeo(BODY_SPECS.sedan, side);
    for (const [z, x] of [[SPEC.wheelZ, SPEC.wheelX], [-SPEC.wheelZ, SPEC.wheelX], [-SPEC.wheelZ, SPEC.wheelX - 0.29]]) {
      const w = new THREE.Mesh(geo, wheelMat);
      w.scale.setScalar(scale);
      w.rotation.order = 'YXZ';
      w.position.set(side * x, Rw, z + DZ);
      w.castShadow = true;
      g.add(w);
      wheels.push({ mesh: w, r: Rw, front: z > 0 });
    }
  }
  let spin = 0;
  return {
    group: g, wheels, blade: bladePivot, spinner,
    drive: { speed: 16.5, reverseSpeed: 3.5, acceleration: 1.9, powerSpeed: 8, rolling: 0.25, drag: 0.0009, coast: 0.6, brake: 6.5, wheelbase: 2 * SPEC.wheelZ, grip: 7, cornering: 5.2 },
    dims: { halfW: 1.25, halfL: 3.3, top: 2.95, mass: 14000 }, chase: [12.5, 4.6], label: 'Snow plough',
    pose(group, car, dt) {
      const s = car.carState?.value, lit = bodyMat.userData.carState?.value;
      if (s && lit) lit.copy(s);
      spin += dt * 6.5;
      beaconMats[0].emissiveIntensity = 0.35 + 2.6 * Math.max(0, Math.sin(spin)) ** 6;
      beaconMats[1].emissiveIntensity = 0.35 + 2.6 * Math.max(0, Math.sin(spin + Math.PI)) ** 6;
    }
  };
}
VEHICLES.plough = buildPloughModel;

// --- The snow map as meshes of 64 m ------------------------------------------------------------------------------------
const CHUNK = 64;
const SNOW = new THREE.Color(0.9, 0.92, 0.96), WET = new THREE.Color(0.045, 0.048, 0.055), SALTED = new THREE.Color(0.16, 0.16, 0.17);
const LIFT = 0.035;

class SnowRoad {
  constructor(grid, route, groundY) {
    this.grid = grid;
    this.group = new THREE.Group();
    this.group.name = 'PloughSnow';
    this.material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.88 });
    this.chunks = [];
    const { cols, rows } = grid, pt = {};
    this.base = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      routePoint(route, (i + 0.5) * grid.cs, (j + 0.5) * grid.cd - grid.half, pt);
      this.base[k] = groundY(pt.x, pt.z) + LIFT;
    }
    for (let c0 = 0; c0 < cols - 1; c0 += CHUNK) {
      const c1 = Math.min(cols - 1, c0 + CHUNK), n = (c1 - c0 + 1) * rows;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const w = c1 - c0 + 1;
      for (let j = 0; j < rows; j++) for (let i = c0; i <= c1; i++) {
        routePoint(route, (i + 0.5) * grid.cs, (j + 0.5) * grid.cd - grid.half, pt);
        const v = j * w + (i - c0);
        pos[v * 3] = pt.x; pos[v * 3 + 2] = pt.z;
      }
      // (s along the road and d to its left: the faces' winding so that they look up)
      const idx = new Uint16Array((w - 1) * (rows - 1) * 6);
      let q = 0;
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < w - 1; i++) {
        const k = j * w + i;
        idx.set([k, k + 1, k + w, k + 1, k + w + 1, k + w], q);
        q += 6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.receiveShadow = true;
      mesh.name = `PloughSnow${c0}`;
      const chunk = { c0, c1, w, mesh, dirty: false, normals: false };
      this.chunks.push(chunk);
      this.group.add(mesh);
      this.fill(chunk, 0, rows - 1);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      geo.boundingSphere.radius += 2;
    }
    this.flip();
    this.normalT = 0;
  }
  /** Turns the faces up if the frame's winding put them down (decided once, on the first chunk) */
  flip() {
    const geo = this.chunks[0].mesh.geometry, n = geo.attributes.normal;
    let up = 0;
    for (let v = 0; v < n.count; v += 7) up += n.getY(v);
    if (up >= 0) return;
    for (const c of this.chunks) {
      const idx = c.mesh.geometry.index.array;
      for (let q = 0; q < idx.length; q += 3) { const t = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = t; }
      c.mesh.geometry.index.needsUpdate = true;
      c.mesh.geometry.computeVertexNormals();
    }
  }
  fill(chunk, j0, j1) {
    const g = this.grid, geo = chunk.mesh.geometry, pos = geo.attributes.position.array, col = geo.attributes.color.array;
    for (let j = Math.max(0, j0); j <= Math.min(g.rows - 1, j1); j++) for (let i = chunk.c0; i <= chunk.c1; i++) {
      const k = j * g.cols + i, v = j * chunk.w + (i - chunk.c0), h = g.h[k];
      // (the outermost rows ease down to the ground: no dark cliff at the map's edge)
      const rim = Math.min(j, g.rows - 1 - j, i, g.cols - 1 - i);
      pos[v * 3 + 1] = this.base[k] + (rim === 0 ? -0.03 : rim === 1 ? h * 0.35 : rim === 2 ? h * 0.75 : h);
      if (h < PLOUGH.clearAt) _c.copy(WET).lerp(SALTED, clamp(h / PLOUGH.clearAt, 0, 1) * 0.5 + 0.15 * hash(k));
      else if (h < 0.1) _c.copy(SALTED).lerp(SNOW, (h - PLOUGH.clearAt) / 0.04);
      else _c.copy(SNOW).multiplyScalar(0.94 + 0.06 * hash(k));
      col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    chunk.normals = true;
  }
  /** Takes the grid's changes (each frame); the normals of the changed chunks at most ten times a second */
  update(dt, force = false) {
    const d = this.grid.dirty;
    if (d) {
      this.grid.dirty = null;
      for (const c of this.chunks) if (c.c1 >= d.i0 - 1 && c.c0 <= d.i1 + 1) this.fill(c, d.j0 - 1, d.j1 + 1);
    }
    this.normalT += dt;
    if (force || this.normalT > 0.1) {
      this.normalT = 0;
      for (const c of this.chunks) if (c.normals) { c.normals = false; c.mesh.geometry.computeVertexNormals(); }
    }
  }
}

// --- The snow poles, the joints' markers, the pass sign -------------------------------------------------------------------
function poleGeometry() {
  const p = [];
  for (let i = 0; i < 8; i++) p.push(cylAt(0.028, 0.028, 0.25, 6, i % 2 ? BLACK : ORANGE, 0, 0.125 + i * 0.25, 0));
  return mergeGeometries(p);
}
function markerGeometry() {
  // a yellow and black plough marker: the post, the plate with its stripes facing the road both ways
  const p = [cylAt(0.04, 0.04, 1.5, 8, GREY, 0, 0.75, 0)];
  for (let i = 0; i < 5; i++) p.push(boxAt(0.32, 0.12, 0.03, i % 2 ? BLACK : YELLOW, 0, 1.25 + i * 0.12, 0, 0, 0, i % 2 ? 0 : 0));
  return mergeGeometries(p);
}
function signTexture(lines) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 256);
  x.strokeStyle = '#111'; x.lineWidth = 10; x.strokeRect(14, 14, 484, 228);
  x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '800 92px system-ui, sans-serif'; x.fillText(lines[0], 256, 100);
  x.font = '700 58px system-ui, sans-serif'; x.fillText(lines[1], 256, 186);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const PASS_SIGN = { s: 2124, d: -6.6 };

const plough = {
  setup(run) {
    const cm = run.hooks.controllerManager, car = cm.entities.car;
    const route = createPloughRoute();
    const grid = createPloughGrid(route);
    const ground = (x, z) => cm.getGroundHeight(x, z, 'car');
    const snow = new SnowRoad(grid, route, ground);
    run.group.add(snow.group);
    // the snow poles
    const poles = createPoles(route);
    const poleMesh = new THREE.InstancedMesh(poleGeometry(), vertexMat({ roughness: 0.5 }), poles.length);
    poleMesh.castShadow = true;
    poleMesh.frustumCulled = false;
    const pt = {};
    for (const pole of poles) {
      routePoint(route, pole.s, pole.d, pt);
      pole.x = pt.x; pole.z = pt.z; pole.y = ground(pt.x, pt.z); pole.heading = pt.heading;
    }
    run.group.add(run.storage(poleMesh));
    // the markers at the joints, both verges; the sign at the Passhöhe
    const markers = [];
    for (const j of PLOUGH_JOINTS) for (const side of [-1, 1]) { routePoint(route, j, side * 5.4, pt); markers.push(markerGeometry().rotateY(pt.heading).translate(pt.x, ground(pt.x, pt.z), pt.z)); }
    const markerMesh = new THREE.Mesh(mergeGeometries(markers), vertexMat({ roughness: 0.5 }));
    markerMesh.castShadow = true;
    run.group.add(markerMesh);
    routePoint(route, PASS_SIGN.s, PASS_SIGN.d, pt);
    const sign = new THREE.Group();
    const posts = new THREE.Mesh(mergeGeometries([cylAt(0.045, 0.045, 2.6, 8, GREY, -0.75, 1.3, 0), cylAt(0.045, 0.045, 2.6, 8, GREY, 0.75, 1.3, 0)]), vertexMat());
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0).translate(0, 2.1, 0.05), new THREE.MeshStandardNodeMaterial({ map: signTexture(['Wolfgang', '1631 m ü. M.']), roughness: 0.6 }));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0).rotateY(Math.PI).translate(0, 2.1, 0.03), new THREE.MeshStandardNodeMaterial({ map: signTexture(['Wolfgang', 'Pass 1631 m']), roughness: 0.6 }));
    sign.add(posts, face, back);
    sign.position.set(pt.x, ground(pt.x, pt.z), pt.z);
    sign.rotation.y = pt.heading + Math.PI; // (its face to the lorry coming up)
    run.group.add(sign);
    run.work = { route, grid, snow, poles, poleMesh, toast: createToast(run), pose: {}, prevBladeS: null, lastHit: new Map(), spawnAcc: 0, buriedNow: new Set(), wasUp: true };
    // the keys: V swings the blade, F lifts it (the capture listener, key(), swallows them: F would get out, V turn the camera);
    // getting out (F) leaves the key bar and the touch buttons for the run
    run.button('use', null);
    run.actions([
      { id: 'plough-side', label: 'Swing the blade', touchLabel: 'Blade side', icon: 'i-chute', keys: ['KeyV'], keyboard: false, pad: 'right', run: () => plough.swing(run) },
      { id: 'plough-lift', kind: 'toggle', label: 'Lift the blade', touchLabel: 'Lift', icon: 'i-tiller', keys: ['KeyF'], keyboard: false, pad: 'left', state: () => !run.state?.lowered, run: () => plough.lift(run) }
    ]);
    // the car's two headlamp spots onto the plough lamps for the run (the T3's are hidden with it)
    const v = run.vehicle;
    if (v && car.headLights) {
      const saved = { lightSpec: car.lightSpec, parents: car.headLights.map((s) => [s.parent, s.target.parent]) };
      for (const s of car.headLights) v.group.add(s, s.target);
      car.lightSpec = LAMPS;
      car._highBeam = undefined; // (placed afresh at the plough lamps: js/controllers.js updateVehicleLights)
      run.cleanups.push(() => {
        car.headLights.forEach((s, i) => { const [p, pt2] = saved.parents[i]; p?.add(s); pt2?.add(s.target); });
        car.lightSpec = saved.lightSpec;
        car._highBeam = undefined;
      });
    }
    plough.placePoles(run);
  },
  reset(run) {
    const w = run.work;
    resetPloughGrid(w.grid);
    w.snow.update(0, true);
    for (const p of w.poles) p.hit = false;
    plough.placePoles(run);
    w.prevBladeS = null;
    w.lastHit.clear();
    w.buriedNow.clear();
    w.toast.hide();
    const car = run.hooks.controllerManager.entities.car;
    car.speed = 0;
  },
  teardown(run) { plough.releaseTraffic(run); },
  key(run, e) {
    if (run.phase === 'intro' || e.repeat) return;
    if (e.code === 'KeyV') { e.preventDefault(); e.stopImmediatePropagation(); plough.swing(run); }
    else if (e.code === 'KeyF') { e.preventDefault(); e.stopImmediatePropagation(); plough.lift(run); }
  },
  swing(run) { if (run.state) run.state.side = -run.state.side; },
  lift(run) { if (run.state) run.state.lowered = !run.state.lowered; },
  placePoles(run) {
    const w = run.work, m = w.poleMesh;
    w.poles.forEach((p, i) => {
      // (a knocked pole lies over, out towards its verge)
      _e.set(0, p.heading, p.hit ? -p.side * 1.35 : 0);
      _q.setFromEuler(_e);
      m.setMatrixAt(i, _m.compose(_p.set(p.x, p.y + (p.hit ? 0.05 : -0.1), p.z), _q, _s.set(1, 1, 1)));
    });
    m.instanceMatrix.needsUpdate = true;
  },
  update(run, ctx, dt, cm) {
    const w = run.work, st = run.state, car = cm.entities.car, v = run.vehicle;
    const P = PLOUGH;
    const pose = roadPose(w.route, car.position.x, car.position.z, car.heading, w.pose);
    const speed = car.speed || 0;
    st.s = pose.s; st.d = pose.d; st.up = pose.up;
    st.moving = Math.abs(speed) > 1;
    st.roadThrow = st.zoneFast = st.jointAhead = false;
    st.junctionAhead = null;
    const running = run.phase === 'running';
    const b = bladeGeometry(pose, pose.a, st.side);
    if (live(run) && ctx.mode === 'car') {
      const out = stepPlough(w.grid, pose, pose.a, speed, st.lowered, st.side, dt);
      // the throw: onto the road (the blade swung the wrong way), or far over the verge by the houses
      if (out.vol > 0 && out.onRoad / out.vol > 0.5) {
        st.roadThrow = true;
        if (running) { st.roadSec += dt; st.penaltyMs += dt * 1000 * P.roadRate; }
      }
      if (st.lowered && speed > P.zoneSpeed && zoneAt(b.c.s) && Math.abs(pose.d) < 6) {
        st.zoneFast = true;
        if (running) { st.zoneSec += dt; st.penaltyMs += dt * 1000 * P.zoneRate; }
      }
      // the bridge joints
      if (w.prevBladeS != null && st.lowered && Math.abs(speed) > P.jointSpeed && Math.abs(pose.d) < 6) {
        const j = jointCrossed(w.prevBladeS, b.c.s);
        if (j != null && running) {
          st.joints++; st.penaltyMs += P.jointMs;
          w.toast.show('The blade hit the bridge joint!', '#ff8f80', 2);
          run.audio?.thump?.();
          car.speed *= 0.6;
        }
      }
      const dir = pose.up ? 1 : -1;
      if (st.lowered && Math.abs(pose.d) < 6) st.jointAhead = PLOUGH_JOINTS.some((j) => (j - b.c.s) * dir > 0 && (j - b.c.s) * dir < 45);
      // the side roads on the throw side (the wall's side of the road)
      const wallSide = Math.sign(b.lv * st.side) || 1;
      if (st.lowered && Math.abs(pose.d) < 6) {
        const jn = PLOUGH_JUNCTIONS.find((j) => j.side === wallSide && (j.s - b.c.s) * dir > 3 && (j.s - b.c.s) * dir < 50);
        if (jn) st.junctionAhead = jn.name;
      }
      const buried = buriedJunction(out.wall);
      if (buried) {
        const key = `${buried.s}:${pose.up ? 'up' : 'down'}`;
        if (!w.buriedNow.has(key) && running) {
          w.buriedNow.add(key);
          st.buried++; st.penaltyMs += P.buryMs;
          w.toast.show(`You buried the mouth of ${buried.name}!`, '#ff8f80', 2.2);
        }
      }
      // the snow poles
      const hits = poleHits(w.poles, pose, pose.a, st.side, Math.abs(speed) * dt);
      if (hits.length) {
        plough.placePoles(run);
        if (running) {
          st.poles += hits.length; st.penaltyMs += hits.length * P.poleMs;
          w.toast.show('Snow pole knocked down! +3 s', '#ffb070', 1.6);
        }
      }
      if (out.vol > 0) plough.spray(run, car, out, dt);
      st.offLane = pose.up ? pose.d > -1.0 || pose.d < -3.8 : pose.d < 1.0 || pose.d > 3.8;
      plough.traffic(run, car, dt, running);
    }
    if (pose.up !== w.wasUp) { w.wasUp = pose.up; w.buriedNow.clear(); }
    w.prevBladeS = b.c.s;
    st.north = laneShare(w.grid, 1);
    st.south = laneShare(w.grid, 2);
    w.snow.update(dt);
    w.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
    if (v?.blade) {
      // the blade swings to its side and lifts; the spinner turns while the lorry moves
      const yaw = st.side * PLOUGH.bladeAngle;
      v.blade.rotation.y += (yaw - v.blade.rotation.y) * Math.min(1, dt * 3);
      const y = st.lowered ? 0 : 0.38;
      v.blade.position.y += (y - v.blade.position.y) * Math.min(1, dt * 4);
      v.spinner.rotation.y += dt * (Math.abs(speed) > 0.5 ? 14 : 1.5);
    }
  },
  /** The snow leaving the blade's trailing end in an arc onto the wall */
  spray(run, car, out, dt) {
    const w = run.work, pb = particles(run);
    w.spawnAcc += Math.min(1.5, out.vol / Math.max(dt, 1e-3) / 1.2) * 45 * dt;
    if (w.spawnAcc < 1) return;
    const st = run.state, h = car.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const across = PLOUGH.bladeHalf * Math.cos(PLOUGH.bladeAngle), back = PLOUGH.bladeHalf * Math.sin(PLOUGH.bladeAngle);
    const o = { x: car.position.x + fx * (PLOUGH.bladeAhead - back) + lx * st.side * across, y: car.position.y + 0.9, z: car.position.z + fz * (PLOUGH.bladeAhead - back) + lz * st.side * across };
    const tgt = routePoint(w.route, out.wall.s, out.wall.d);
    const gy = run.hooks.controllerManager.getGroundHeight(tgt.x, tgt.z, 'car');
    while (w.spawnAcc >= 1) {
      w.spawnAcc--;
      const b = { x: tgt.x + (Math.random() - 0.5) * 1.6, y: gy + 0.4, z: tgt.z + (Math.random() - 0.5) * 1.6 };
      lump(pb, o, b, 0.35 + Math.random() * 0.25 + out.far * 0.08, { size: 0.22, grow: 0.5, alpha: 0.8 });
    }
  },
  /** The traffic round the plough: what comes towards it eases to its kerb and slows, keeps rolling; a car that stands in
   *  front of the blade for long goes back to the traffic's pool (it reappears out of view); hitting one costs */
  traffic(run, car, dt, running) {
    const tr = run.hooks.traffic, w = run.work, st = run.state;
    if (!tr) return;
    const h = car.heading, fx = Math.sin(h), fz = Math.cos(h);
    const me = { x: car.position.x + fx * 0.45, z: car.position.z + fz * 0.45, h, halfW: 1.3, halfL: 3.4 };
    const now = performance.now();
    for (const list of [tr.cars, tr.buses, tr.bikes]) {
      for (const veh of list || []) {
        if (!veh.edge || veh.held) continue;
        const dx = veh.x - car.position.x, dz = veh.z - car.position.z;
        if (Math.abs(dx) > 70 || Math.abs(dz) > 70) { if (veh._plough) veh._plough = 0; continue; }
        const ahead = dx * fx + dz * fz, side = dx * fz - dz * fx;
        const facing = Math.sin(veh.yaw) * fx + Math.cos(veh.yaw) * fz;
        // a collision
        if (Math.abs(ahead) < 9 && Math.abs(side) < 5 && boxesOverlap(me, { x: veh.x, z: veh.z, h: veh.yaw, halfW: veh.halfWidth || 0.9, halfL: veh.half || 2.2 })) {
          const last = w.lastHit.get(veh) || -1e9;
          if (now - last > 3000 && running && Math.abs(car.speed || 0) + (veh.speed || 0) > 1.2) {
            st.hits++; st.penaltyMs += PLOUGH.hitMs;
            w.toast.show('You hit a car! +10 s', '#ff8f80', 2);
            run.audio?.thump?.();
          }
          w.lastHit.set(veh, now);
        }
        if (facing > -0.5 || ahead < -4 || ahead > 65 || veh.conn) continue;
        // oncoming: ease to the kerb (js/traffic.js dl, the lane offset it keeps) and pass at a crawl
        if (!veh.bus) { veh.dl = Math.max(veh.dl || 0, 0.7); veh.dlv = 0; }
        veh.speed = Math.min(veh.speed, ahead < 25 ? 6 : 10);
        veh._plough = (veh._plough || 0) + (veh.speed < 0.4 && ahead < 35 && Math.abs(side) < 4 ? dt : -dt);
        if (veh._plough < 0) veh._plough = 0;
        if (veh._plough > 2.5) {
          veh._plough = 0;
          veh.conn = veh.trail = veh.commit = veh.move = null;
          veh.speed = 0;
          releaseVehicle(veh);
        }
      }
    }
  },
  releaseTraffic(run) {
    const tr = run.hooks.traffic;
    if (!tr) return;
    for (const list of [tr.cars, tr.buses, tr.bikes]) for (const veh of list || []) if (veh._plough) veh._plough = 0;
  }
};

export const PLOUGH_FEATURES = { plough };
