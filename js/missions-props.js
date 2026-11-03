import * as THREE from 'three/webgpu';
import { atan, color, float, fract, mix, positionGeometry, sin, smoothstep, step, time, uniform, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BODY_SPECS, buildCarGeometry, createLoftedCarMaterial, buildLightbarGeometry, createLightbarMaterial, buildSteerableWheelGeo,
  buildHelicopterBodyGeometry, buildHelicopterMainRotorGeometry, buildHelicopterTailRotorGeometry, createLoftedHelicopterMaterial, H145
} from './actor-models.js';

// js/missions-props.js
// What the missions (js/missions.js) put into the world: the pulsing target marker, the zone rings on the ground, the
// injured skier and the helper waving, the crashed motorbike, the Kantonspolizei patrol car (standing, or worn by the
// player's car), the traffic cones, the avalanche launcher on the player's shoulder and a Rega H145 flown by script.
// Every prop is one or a few meshes with the city's materials; the figures are merged boxes and capsules with vertex
// colours (one draw call each). Nothing in here is visible outside a mission.

// --- Materials -------------------------------------------------------------------------------------------------------
// (shared() marks the materials kept for every mission and shared with the city, js/actor-models.js caches them: a run's
// teardown, js/missions.js disposeTree, disposes the geometries and its own materials, never these)
const shared = (mat) => { mat.userData.shared = true; return mat; };
let _figureMat = null;
const figureMaterial = () => (_figureMat ??= shared(new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 })));
let _metalMat = null;
const metalMaterial = () => (_metalMat ??= shared(new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 })));

// A geometry painted in one colour (vertex colours, non-indexed and with normals, so that it can be merged)
export function painted(geometry, hex) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const c = new THREE.Color(hex), n = g.attributes.position.count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}
const capsule = (r, len, hex) => painted(new THREE.CapsuleGeometry(r, len, 3, 8), hex);
const box = (w, h, d, hex) => painted(new THREE.BoxGeometry(w, h, d), hex);
const place = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };

// --- The target marker: a pulsing column of light with a ring at its foot (additive, one mesh) ----------------------
export function createTargetMarker() {
  const col = uniform(new THREE.Color(0x3fd6ff));
  const column = new THREE.CylinderGeometry(2.2, 2.6, 36, 24, 1, true).translate(0, 18, 0);
  const ring = new THREE.RingGeometry(2.4, 3.6, 40).rotateX(-Math.PI / 2).translate(0, 0.25, 0);
  const geo = mergeGeometries([column.toNonIndexed(), ring.toNonIndexed()]);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const pulse = sin(time.mul(2.4)).mul(0.5).add(0.5);
  const y = positionGeometry.y;
  // the column fades with height and breathes; the ring (y ~ 0.25) stays strong
  const columnA = smoothstep(36, 2, y).mul(0.3).mul(pulse.mul(0.6).add(0.5));
  const ringA = step(y, 0.3).mul(0.55).mul(pulse.mul(0.4).add(0.6));
  mat.colorNode = col;
  mat.opacityNode = columnA.add(ringA);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'MissionTarget';
  mesh.renderOrder = 980;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.colour = col;
  return mesh;
}

// --- A zone on the ground: a flat ring of radius 1 (scaled to the zone), hazard-striped, cyan or landing-pad white ----
export function createZoneRing(style = 'plain') {
  const geo = new THREE.RingGeometry(0.82, 1.0, 64).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const angle = atan(positionGeometry.z, positionGeometry.x).div(Math.PI * 2);
  const pulse = sin(time.mul(3)).mul(0.5).add(0.5);
  if (style === 'hazard') {
    const stripe = step(0.5, fract(angle.mul(14).add(time.mul(0.25))));
    mat.colorNode = mix(color(0xffc21a), color(0x151515), stripe);
    mat.opacityNode = float(0.78).add(pulse.mul(0.15));
  } else if (style === 'pad') {
    const dash = step(0.35, fract(angle.mul(24)));
    mat.colorNode = mix(color(0xffffff), color(0x3fd6ff), dash);
    mat.opacityNode = float(0.7).add(pulse.mul(0.2));
  } else {
    mat.colorNode = color(0x3fd6ff);
    mat.opacityNode = float(0.6).add(pulse.mul(0.25));
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `MissionZone ${style}`;
  mesh.renderOrder = 979;
  mesh.visible = false;
  return mesh;
}

// --- A small ring for the predicted impact of the launcher -----------------------------------------------------------
export function createAimMarker() {
  const geo = new THREE.RingGeometry(1.3, 2.0, 32).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, depthTest: false });
  mat.colorNode = color(0xffffff);
  mat.opacityNode = float(0.85);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'MissionAim';
  mesh.renderOrder = 995;
  mesh.visible = false;
  return mesh;
}

// --- Figures -----------------------------------------------------------------------------------------------------------
// The injured skier, lying on the back, one leg drawn up, in a red jacket with a white helmet; the Rega's rescue bag
// colours in the dark trousers. The origin on the ground under the chest, lying along +z (head at +z).
export function createPatient() {
  const parts = [
    place(capsule(0.19, 0.5, 0xd2232a), 0, 0.22, 0.05, Math.PI / 2), // torso
    painted(new THREE.SphereGeometry(0.135, 12, 9), 0xf2f2f0).translate(0.02, 0.21, 0.55), // helmet
    place(capsule(0.09, 0.3, 0xd2232a), -0.3, 0.14, 0.1, Math.PI / 2, 0, -0.5), // left arm out
    place(capsule(0.09, 0.3, 0xd2232a), 0.28, 0.16, 0.2, Math.PI / 2, 0, 0.5), // right arm
    place(capsule(0.1, 0.42, 0x1c2230), -0.12, 0.16, -0.48, Math.PI / 2), // left leg flat
    place(capsule(0.1, 0.4, 0x1c2230), 0.14, 0.34, -0.3, Math.PI / 2 + 0.9), // right leg drawn up
    place(box(0.1, 0.06, 0.32, 0x222222), -0.12, 0.08, -0.78), place(box(0.1, 0.06, 0.32, 0x222222), 0.19, 0.3, -0.58, 0.9), // boots
    place(box(0.08, 0.04, 1.65, 0xe8e8e0), 0.55, 0.03, -0.1, 0, 0.3), place(box(0.08, 0.04, 1.65, 0xe8e8e0), -0.7, 0.03, 0.3, 0, -0.9) // skis off, lying about
  ];
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g)), figureMaterial());
  mesh.castShadow = true;
  mesh.name = 'MissionPatient';
  return mesh;
}

// The helper: standing, in a blue jacket, one arm waving over the head (the arm is its own mesh, swung per frame)
export function createHelper() {
  const body = [
    place(capsule(0.11, 0.45, 0x1c2230), -0.13, 0.42, 0), place(capsule(0.11, 0.45, 0x1c2230), 0.13, 0.42, 0), // legs
    place(capsule(0.2, 0.42, 0x1f5ec9), 0, 1.08, 0), // torso
    place(capsule(0.08, 0.5, 0x1f5ec9), -0.3, 1.0, 0.05, 0, 0, 0.25), // left arm down
    painted(new THREE.SphereGeometry(0.13, 12, 9), 0xe9c3a3).translate(0, 1.55, 0), // head
    painted(new THREE.SphereGeometry(0.14, 12, 9, 0, Math.PI * 2, 0, Math.PI / 2), 0xd2232a).translate(0, 1.56, 0) // red cap
  ];
  const root = new THREE.Group();
  root.name = 'MissionHelper';
  const torso = new THREE.Mesh(mergeGeometries(body.map((g) => g.index ? g.toNonIndexed() : g)), figureMaterial());
  torso.castShadow = true;
  root.add(torso);
  // the waving arm: pivot at the shoulder, the arm geometry hanging "up" from it
  const arm = new THREE.Mesh(capsule(0.08, 0.5, 0x1f5ec9).translate(0, 0.3, 0), figureMaterial());
  arm.position.set(0.28, 1.28, 0);
  arm.rotation.z = -0.5;
  arm.castShadow = true;
  root.add(arm);
  root.userData.wave = arm;
  return root;
}

// The crashed motorbike, lying on its left side: two wheels, a frame, the tank and the seat; origin on the ground at the
// bike's middle, the bike along +z (front wheel at +z)
export function createMotorbike() {
  const wheel = (z) => place(painted(new THREE.TorusGeometry(0.3, 0.075, 10, 24), 0x111214), 0, 0.075, z, Math.PI / 2);
  const parts = [
    wheel(0.72), wheel(-0.7),
    place(painted(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 12), 0x8d9398), 0, 0.075, 0.72), place(painted(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12), 0x8d9398), 0, 0.075, -0.7), // hubs
    place(box(0.5, 0.06, 1.1, 0x2a2d31), 0, 0.14, 0.02), // frame lying flat
    place(box(0.34, 0.16, 0.48, 0x1d5fb0), 0.12, 0.28, 0.1), // tank, blue
    place(box(0.28, 0.1, 0.5, 0x15171a), 0.16, 0.26, -0.4), // seat
    place(box(0.25, 0.22, 0.32, 0x4a4f55), 0, 0.26, 0.05), // engine block
    place(painted(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), 0x8d9398), 0.25, 0.28, 0.52, 0, 0, Math.PI / 2), // handlebar
    place(painted(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), 0x8d9398), -0.05, 0.1, -0.2, 0, 0, 0), // exhaust
    place(painted(new THREE.SphereGeometry(0.11, 10, 8), 0x222222), 0.45, 0.2, 1.05) // the helmet, rolled off
  ];
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g)), metalMaterial());
  mesh.castShadow = true;
  mesh.name = 'MissionMotorbike';
  return mesh;
}

// A traffic cone (orange with a white band)
export function createCone() {
  const parts = [
    place(painted(new THREE.ConeGeometry(0.16, 0.6, 12), 0xff5a1f), 0, 0.3, 0),
    place(painted(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 12), 0xf2f2f0), 0, 0.36, 0),
    place(box(0.4, 0.03, 0.4, 0x1a1a1a), 0, 0.015, 0)
  ];
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g)), figureMaterial());
  mesh.castShadow = true;
  mesh.name = 'MissionCone';
  return mesh;
}

// --- The Kantonspolizei Graubünden patrol car: the traffic's estate with its police livery (js/actor-models.js, the
// `carState.w = 1` instance), the blue light bar and four wheels. Origin on the ground under the car's middle, +z forward
export function createPoliceCar() {
  const spec = BODY_SPECS.sedan;
  const geo = buildCarGeometry(spec, true);
  geo.setAttribute('paintColor', new THREE.InstancedBufferAttribute(new Float32Array([0.92, 0.93, 0.94]), 3));
  geo.setAttribute('carState', new THREE.InstancedBufferAttribute(new Float32Array([1, 0, 0, 1]), 4));
  const body = new THREE.InstancedMesh(geo, shared(createLoftedCarMaterial(spec)), 1);
  body.setMatrixAt(0, new THREE.Matrix4());
  body.castShadow = body.receiveShadow = true;
  const bar = new THREE.InstancedMesh(buildLightbarGeometry(spec), shared(createLightbarMaterial()), 1);
  bar.setMatrixAt(0, new THREE.Matrix4());
  bar.castShadow = true;
  const root = new THREE.Group();
  root.name = 'MissionPoliceCar';
  root.add(body, bar);
  const wheelMat = shared(createLoftedCarMaterial(spec, 0x202326));
  const wheels = [];
  for (const side of [-1, 1]) {
    const wg = buildSteerableWheelGeo(spec, side);
    for (const wz of [spec.wheelZ, -spec.wheelZ]) {
      const w = new THREE.Mesh(wg, wheelMat);
      w.position.set(side * spec.wheelX, spec.wheelRadius, wz);
      w.castShadow = true;
      root.add(w);
      wheels.push(w);
    }
  }
  root.userData.lightbar = bar;
  root.userData.wheels = wheels;
  return root;
}

// --- The avalanche launcher on the player's shoulder: a tube with its sight and a shoulder rest ----------------------
export function createLauncher() {
  const parts = [
    place(painted(new THREE.CylinderGeometry(0.065, 0.075, 1.5, 14, 1, true), 0x3b4a3a), 0, 0, 0.1, Math.PI / 2), // the tube, along +z
    place(painted(new THREE.CylinderGeometry(0.09, 0.07, 0.18, 14), 0x2a2f2a), 0, 0, 0.9, Math.PI / 2), // the muzzle flare
    place(box(0.05, 0.14, 0.22, 0x1f2320), 0.09, 0.12, 0.25), // the sight
    place(box(0.08, 0.1, 0.3, 0x5a4634), 0, -0.1, -0.2), // the grip
    place(box(0.1, 0.16, 0.08, 0x1f2320), 0, -0.02, -0.62) // the shoulder rest
  ];
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g)), metalMaterial());
  mesh.castShadow = true;
  mesh.name = 'MissionLauncher';
  return mesh;
}

// The shell in flight: a small glowing tracer
export function createShell() {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.colorNode = vec3(1.0, 0.75, 0.45);
  mat.opacityNode = float(0.95);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), mat);
  mesh.name = 'MissionShell';
  mesh.visible = false;
  return mesh;
}

// --- A Rega H145 flown by script (js/missions.js regaScript): the fuselage, main rotor with its blur disc, fenestron ----
export function createScriptedRega() {
  const root = new THREE.Group();
  root.name = 'MissionRega';
  const mat = shared(createLoftedHelicopterMaterial());
  const body = new THREE.Mesh(buildHelicopterBodyGeometry(), mat);
  body.castShadow = true;
  root.add(body);
  const rotor = new THREE.Group();
  rotor.position.set(0, H145.hubY, H145.mastZ);
  rotor.add(new THREE.Mesh(buildHelicopterMainRotorGeometry(), mat));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.35, 5.35, 0.015, 40), new THREE.MeshBasicNodeMaterial({ color: 0xc8d8e8, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
  rotor.add(disc);
  root.add(rotor);
  const tail = new THREE.Group();
  tail.position.set(0, H145.fenestron.y, H145.fenestron.z);
  tail.add(new THREE.Mesh(buildHelicopterTailRotorGeometry(), mat));
  root.add(tail);
  const shroud = new THREE.Mesh(new THREE.TorusGeometry(H145.fenestron.r + 0.13, 0.16, 12, 32).rotateY(Math.PI * 0.5).scale(0.7, 1, 1), new THREE.MeshStandardNodeMaterial({ color: 0xd2101c, roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide }));
  shroud.position.copy(tail.position);
  root.add(shroud);
  root.userData.rotor = rotor;
  root.userData.tail = tail;
  root.visible = false;
  return root;
}

/** The slope under a prop: a quaternion turning +y onto the ground normal `n` (so lying figures follow the relief) */
export function slopeQuaternion(n, out = new THREE.Quaternion()) {
  return out.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, n.z).normalize());
}

export const PROP_BUILDERS = {
  patient: createPatient,
  helper: createHelper,
  motorbike: createMotorbike,
  cone: createCone,
  policeCar: createPoliceCar
};
