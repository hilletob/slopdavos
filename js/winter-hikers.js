import * as THREE from 'three/webgpu';
import { Fn, float, int, vec2, vec3, color, attribute, attributeArray, instanceIndex, varying, sin, cos, abs, fract, mix, step, smoothstep, max, normalize, positionLocal } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PERSON_BONES as BONE, buildPersonGeometry, createPersonMaterial, PersonRig } from './pedestrians.js';
import { surfaceHeight, groundHeight } from './terrain.js';
import { winter } from './season.js';
import { winterTrails, TRAIL_LIFT } from './winter-hikes.js';

// Winter hikers on the Winterwanderwege (js/winter-hikes.js draws the trails): people in down jackets, beanies,
// mittens and boots, strolling at 1.1-1.4 m/s alone, in pairs or threes, keeping right, some with trekking poles,
// now and then a dog on the lead. The pedestrians' skinned body and gait (js/pedestrians.js PersonRig: planted
// footsteps, IK) in winter clothes: one instanced draw per body level of detail, one for all poles and leads, one for
// the dogs. Only around the camera (~400 m) and only in winter; new groups turn up out of sight, the poses are worked
// out for those in view.

const MAX = 36; // walkers at most
const GROUPS = 22;
const RADIUS = 400; // m around the camera
const PER_METRE = 1 / 35; // walkers per metre of trail nearby
const NEAR_LOD = 32; // m: the detailed body inside
const POLE_DRAW = 110;
const DOG_DRAW = 220;
const MAX_DOGS = 8;
const FOREARM = 0.255; // (pedestrians.js) elbow to wrist; the grip is a few centimetres further, in the fist
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------------------
// Look: quilted down jackets (bright or dark), softshell trousers, winter boots, beanies (some with a turned-up rim),
// a scarf on some, mittens; sunglasses on a few
// ---------------------------------------------------------------------------------------------------------------------
const JACKET = [0xc4262e, 0x1e2f55, 0x16171b, 0x4a5a3a, 0x6e1f33, 0x0f6f78, 0xd09a1e, 0xe9e7e1, 0xe8641c, 0x7d5a9a, 0x2b6cb0, 0x3a3c40];
const TROUSERS = [0x16171b, 0x24272e, 0x2c3442, 0x3b3a36, 0x1c2433];
const HAT = [0xc4262e, 0x16171b, 0xe9e7e1, 0x2b6cb0, 0xd09a1e, 0x8a8f99, 0x6e1f33, 0x0f6f78, 0xe2187f];
const SCARF = [0xc4262e, 0xd8cfbe, 0x2b3a52, 0x6b7d3a, 0x8c2f5a, 0x9a9a96];
const BOOTS = [0x3d2a1c, 0x16171b, 0x5a3e26, 0x2a2b2f];
const SKIN = [0xe0ab88, 0xc68863, 0xd9a077, 0xa96f4c, 0xeab995];
const HAIR = [0x1a1512, 0x3a2a1a, 0x6b4a2a, 0x8f6d43, 0xb48c58, 0x9a9590, 0x2a2624];
const POLE_COLORS = [0x2b2d33, 0x8d9094, 0x1d5bc4, 0xc4262e, 0x15171c];
const LEAD_COLORS = [0xc4262e, 0x1d5bc4, 0x13a07a, 0xf2c014, 0x15171c];
const DOG_COLORS = [0x2a211b, 0x8a5a2c, 0xc9a26a, 0xeae2d0, 0x4a4440, 0xb07a3a, 0x1a1816];

function palette(hex, t) {
  let acc = color(hex[0]);
  for (let i = 1; i < hex.length; i++) acc = mix(acc, color(hex[i]), step(float(i), t.mul(hex.length)));
  return acc;
}

// The body's skinning (createPersonMaterial's vertex stage) with winter clothes instead of the city clothes.
// info: (seed, female, girth, hair): hair < 0.42 wears a beanie (over the hair shell)
function createHikerMaterial(pose, stride) {
  const mat = createPersonMaterial(pose);
  const info = varying(pose.element(int(instanceIndex).mul(stride).add(stride - 1)), 'vHikerInfo');
  const lane = (salt) => fract(sin(info.x.add(salt).mul(12.9898)).mul(43758.5453));
  const isPart = (p, id) => step(abs(p.sub(id)), 0.25);
  mat.colorNode = Fn(() => {
    const part = attribute('skin', 'vec4').w;
    const q = attribute('position', 'vec3');
    const along = attribute('extra', 'vec3').z;
    const jacket = palette(JACKET, lane(3)).toVar();
    const trousers = palette(TROUSERS, lane(13));
    const skin = palette(SKIN, lane(17));
    const hair = palette(HAIR, lane(19));
    const hat = palette(HAT, lane(23));
    const scarfCol = palette(SCARF, lane(43));
    const boot = palette(BOOTS, lane(47));
    const mittens = mix(color(0x16171b), hat, step(0.55, lane(29)));
    const beanie = step(info.w, 0.42);
    const scarf = step(0.45, lane(31));

    // Torso: the down jacket's quilted baffles (horizontal seams every ~9 cm), a zip, the hem below the hips, a high
    // collar or a scarf round the neck; trousers below
    const baffle = smoothstep(0.38, 0.5, abs(fract(q.y.div(0.09)).sub(0.5))).mul(0.32);
    const zip = smoothstep(0.005, 0.002, abs(q.x)).mul(step(0.03, q.z)).mul(step(0.92, q.y));
    const puffy = jacket.mul(float(1).sub(baffle)).toVar();
    const top = mix(puffy, color(0x1a1b1f), zip.mul(0.7));
    const hem = smoothstep(0.885, 0.895, q.y);
    const collar = smoothstep(1.45, 1.46, q.y).mul(smoothstep(0.11, 0.09, abs(q.x))); // (round the neck, not the shoulders)
    const neck = mix(mix(top, jacket.mul(0.85), collar), scarfCol.mul(float(1).sub(smoothstep(0.4, 0.5, abs(fract(q.y.div(0.025)).sub(0.5))).mul(0.15))), collar.mul(scarf));
    const bare = smoothstep(1.515, 1.525, q.y);
    const torso = mix(mix(trousers, neck, hem), skin, bare);
    // Sleeves: baffles round the arm, elastic cuffs
    const sleeveBaffle = smoothstep(0.38, 0.5, abs(fract(along.mul(7.5)).sub(0.5))).mul(0.3);
    const sleeve = mix(jacket.mul(float(1).sub(sleeveBaffle)), jacket.mul(0.55), smoothstep(0.9, 0.93, along));
    // Trousers: a knee seam; boots: dark leather, a lighter sole, laces, a padded collar
    const legs = trousers.mul(float(1).sub(smoothstep(0.006, 0.0, abs(q.y.sub(0.5))).mul(0.25)));
    const sole = smoothstep(0.035, 0.025, q.y);
    const laces = smoothstep(0.6, 0.75, fract(q.z.mul(70))).mul(step(0.0, q.z)).mul(step(0.07, q.y)).mul(step(abs(abs(q.x).sub(0.09)), 0.016));
    const boots = mix(mix(boot, color(0x6b6158), sole), color(0x8c8478), laces.mul(0.5));
    // Head: face, sunglasses on a few, a beanie with a turned-up rim or the hair
    const hd = normalize(vec2(q.x, q.z.add(0.01)));
    const front = smoothstep(0.05, 0.075, q.z);
    const glasses = smoothstep(0.012, 0.008, abs(q.y.sub(1.628))).mul(smoothstep(0.075, 0.06, abs(q.x))).mul(front).mul(step(0.75, lane(37)));
    const eyes = smoothstep(0.011, 0.006, abs(abs(q.x).sub(0.031))).mul(smoothstep(0.0055, 0.002, abs(q.y.sub(1.627)))).mul(front).mul(0.7);
    const mouth = smoothstep(0.022, 0.014, abs(q.x)).mul(smoothstep(0.0045, 0.0015, abs(q.y.sub(1.549)))).mul(front).mul(0.5);
    const face = mix(mix(skin.mul(float(1).sub(eyes)), skin.mul(color(0xb06a5c)), mouth), color(0x0c0d10), glasses);
    const hairline = hd.y.mul(0.055).add(1.62);
    const capLine = hairline.sub(0.022);
    const head = mix(face, mix(hair, hat, beanie), smoothstep(capLine.sub(0.004), capLine.add(0.004), q.y).mul(beanie).add(
      smoothstep(hairline.sub(0.004), hairline.add(0.004), q.y).mul(float(1).sub(beanie))));
    const rib = smoothstep(0.3, 0.5, abs(fract(hd.x.mul(20)).sub(0.5))).mul(0.12);
    const rim = smoothstep(capLine.add(0.045), capLine.add(0.04), q.y).mul(step(0.4, lane(53)));
    const shell = mix(hair, hat.mul(float(1).sub(rib).sub(rim.mul(0.18))), beanie);
    return mix(mix(mix(mix(mix(mix(mix(torso, legs, isPart(part, 1)), boots, isPart(part, 2)), sleeve, isPart(part, 3)),
      mittens, isPart(part, 4)), head, isPart(part, 5)), shell, isPart(part, 6)), hair, isPart(part, 7));
  })();
  mat.roughnessNode = Fn(() => {
    const part = attribute('skin', 'vec4').w;
    // the jackets' nylon shell has a soft sheen; skin, knitwear, wool and leather are matt
    const nylon = max(isPart(part, 3), isPart(part, 0).mul(step(0.885, attribute('position', 'vec3').y)));
    return mix(float(0.82), float(0.5), nylon);
  })();
  return mat;
}

// A trekking pole (or a dog's lead, thinner): from the grip (origin) down to the tip at y = -1, scaled per instance
function poleGeometry() {
  const parts = [];
  const add = (geo, dark) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.setAttribute('dark', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(dark), 1));
    parts.push(g);
  };
  const shaft = new THREE.CylinderGeometry(0.009, 0.007, 0.96, 6, 1, true);
  shaft.translate(0, -0.5, 0);
  add(shaft, 0);
  const grip = new THREE.CylinderGeometry(0.016, 0.014, 0.12, 6);
  grip.translate(0, -0.05, 0);
  add(grip, 1);
  const basket = new THREE.CylinderGeometry(0.045, 0.03, 0.01, 8); // a snow basket
  basket.translate(0, -0.93, 0);
  add(basket, 1);
  return mergeGeometries(parts, false);
}

// A dog (~0.5 m at the shoulder before scaling, nose along +z, standing at the origin): body, chest, neck, head and
// muzzle, ears, tail and four legs; `leg` = (swing: +1 / -1 for the diagonal pairs of the trot, 0 the body; hip
// height; hip z). The legs swing in the vertex shader by the instance's gait phase.
function dogGeometry() {
  const parts = [];
  const add = (geo, { swing = 0, hipY = 0, hipZ = 0, dark = 0 } = {}) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count;
    const leg = new Float32Array(n * 3), dk = new Float32Array(n).fill(dark);
    for (let i = 0; i < n; i++) leg.set([swing, hipY, hipZ], i * 3);
    g.setAttribute('leg', new THREE.BufferAttribute(leg, 3));
    g.setAttribute('dark', new THREE.BufferAttribute(dk, 1));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  const body = new THREE.CapsuleGeometry(0.12, 0.38, 3, 8);
  body.rotateX(Math.PI / 2);
  body.scale(0.95, 1.05, 1);
  body.translate(0, 0.44, 0);
  add(body);
  const neck = new THREE.CylinderGeometry(0.07, 0.09, 0.2, 7);
  neck.rotateX(-0.7);
  neck.translate(0, 0.55, 0.3);
  add(neck);
  const head = new THREE.SphereGeometry(0.095, 8, 6);
  head.scale(0.95, 0.9, 1.05);
  head.translate(0, 0.64, 0.38);
  add(head);
  const muzzle = new THREE.CylinderGeometry(0.04, 0.055, 0.13, 7);
  muzzle.rotateX(Math.PI / 2);
  muzzle.translate(0, 0.615, 0.48);
  add(muzzle);
  const nose = new THREE.SphereGeometry(0.022, 6, 4);
  nose.translate(0, 0.625, 0.548);
  add(nose, { dark: 1 });
  for (const sx of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.035, 0.09, 4);
    ear.rotateZ(-sx * 0.35);
    ear.translate(sx * 0.055, 0.73, 0.35);
    add(ear);
    const eye = new THREE.SphereGeometry(0.012, 5, 3);
    eye.translate(sx * 0.045, 0.665, 0.46);
    add(eye, { dark: 1 });
  }
  const tail = new THREE.CylinderGeometry(0.018, 0.03, 0.26, 5);
  tail.rotateX(-0.9);
  tail.translate(0, 0.56, -0.33);
  add(tail);
  // legs: hip at y 0.42, foot at 0; front pair at z 0.2, hind at z -0.2; the diagonal pairs swing together
  for (const [x, z, swing] of [[0.065, 0.2, 1], [-0.065, 0.2, -1], [0.065, -0.2, -1], [-0.065, -0.2, 1]]) {
    const leg = new THREE.CylinderGeometry(0.03, 0.022, 0.42, 6);
    leg.translate(x, 0.21, z);
    add(leg, { swing, hipY: 0.42, hipZ: z });
    const paw = new THREE.SphereGeometry(0.03, 6, 4);
    paw.scale(1, 0.7, 1.3);
    paw.translate(x, 0.02, z + 0.015);
    add(paw, { swing, hipY: 0.42, hipZ: z });
  }
  return mergeGeometries(parts, false);
}

function createDogMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const leg = attribute('leg', 'vec3');
  const gait = attribute('gait', 'vec2'); // (phase in radians, stride amplitude)
  const a = sin(gait.x).mul(leg.x).mul(gait.y);
  const p = positionLocal;
  const ry = p.y.sub(leg.y), rz = p.z.sub(leg.z);
  const swung = vec3(p.x, leg.y.add(ry.mul(cos(a))).sub(rz.mul(sin(a))), leg.z.add(ry.mul(sin(a))).add(rz.mul(cos(a))));
  const moved = mix(p, swung, abs(leg.x));
  // the body bobs twice per stride
  m.positionNode = moved.add(vec3(0, abs(sin(gait.x)).mul(gait.y).mul(0.05), 0));
  // fur (instance colour) with a lighter belly; nose and eyes dark
  const belly = smoothstep(0.4, 0.33, p.y).mul(step(abs(leg.x), 0.5)).mul(0.25);
  m.colorNode = mix(vec3(1).add(belly), vec3(0.04), attribute('dark', 'float'));
  return m;
}

function createGearMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.1 });
  m.colorNode = mix(vec3(1), vec3(0.08), attribute('dark', 'float')); // (times the instance colour)
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// The trails as lines to walk: position and heading at an arc length
// ---------------------------------------------------------------------------------------------------------------------
function trailPoint(t, s, out, hint = 1) {
  const cum = t.cum, n = cum.length;
  let i = Math.max(1, Math.min(n - 1, hint | 0));
  while (i > 1 && cum[i - 1] > s) i--;
  while (i < n - 1 && cum[i] < s) i++;
  const ax = t.pts[i * 2 - 2], az = t.pts[i * 2 - 1], bx = t.pts[i * 2], bz = t.pts[i * 2 + 1];
  const L = cum[i] - cum[i - 1] || 1, f = Math.max(0, Math.min(1, (s - cum[i - 1]) / L));
  out.x = ax + (bx - ax) * f;
  out.z = az + (bz - az) * f;
  out.hx = (bx - ax) / L;
  out.hz = (bz - az) / L;
  out.i = i;
  return out;
}

// The stretches of trail within `radius` of (cx, cz): [{ t, s0, s1 }] and their total length
function nearbyStretches(trails, cx, cz, radius) {
  const stretches = [];
  let total = 0;
  for (const t of trails) {
    let open = null;
    for (let i = 1; i < t.cum.length; i++) {
      const mx = (t.pts[i * 2 - 2] + t.pts[i * 2]) / 2, mz = (t.pts[i * 2 - 1] + t.pts[i * 2 + 1]) / 2;
      if (Math.hypot(mx - cx, mz - cz) < radius) {
        if (!open) open = { t, s0: t.cum[i - 1], s1: t.cum[i] };
        else open.s1 = t.cum[i];
      } else if (open) { stretches.push(open); total += open.s1 - open.s0; open = null; }
    }
    if (open) { stretches.push(open); total += open.s1 - open.s0; }
  }
  return { stretches, total };
}

// Where the members of a group walk: [behind (m, + ahead), right of the line of travel (m)]; keeping right on the 4 m
// trail (the oncoming walkers pass on the other half), side by side in pairs, the third a step behind; each group
// shifted a little across its half (g.offset), so that the walking lines spread over the width
const FORMATION = [
  null,
  [[0, 0.95]],
  [[0, 0.6], [0.15, 1.25]],
  [[0, 0.6], [0.15, 1.25], [-1.4, 0.9]]
];

// ---------------------------------------------------------------------------------------------------------------------
export function buildWinterHikers(scene) {
  const group = new THREE.Group();
  group.name = 'WinterHikers';
  group.userData.terrain = 'absolute'; // placed in world heights
  const trails = winterTrails();
  let seed = 1291;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 1) >>> 0) / 4294967296;
  const pick = (list) => list[Math.floor(rand() * list.length)];

  // Bodies: one instanced, skinned draw per level of detail (as PersonCrowd)
  const probe = new PersonRig({});
  const stride = probe.pose.length / 4;
  const lods = [1, 0].map((detail) => {
    const pose = attributeArray(MAX * stride, 'vec4').toReadOnly();
    const mesh = new THREE.Mesh(buildPersonGeometry(detail), createHikerMaterial(pose, stride));
    mesh.name = detail ? 'WinterHikersNear' : 'WinterHikersFar';
    mesh.count = 1; // one (degenerate) walker until the first frame, so the pipelines compile up front
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return { pose, mesh, count: 0 };
  });
  const instanced = (geometry, material, count, name) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < count; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 1;
    mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
    group.add(mesh);
    return mesh;
  };
  const poleMesh = instanced(poleGeometry(), createGearMaterial(), MAX * 2 + MAX_DOGS, 'WinterHikerPoles');
  const dogGeo = dogGeometry();
  const gaitAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOGS * 2), 2);
  gaitAttr.setUsage(THREE.DynamicDrawUsage);
  dogGeo.setAttribute('gait', gaitAttr);
  const dogMesh = instanced(dogGeo, createDogMaterial(), MAX_DOGS, 'WinterHikerDogs');

  // Groups of 1-3 walkers (a rig each), some with a dog
  const walkersOf = (n) => Array.from({ length: n }, (_, k) => {
    const female = rand() < 0.5;
    const poles = rand() < 0.3;
    return {
      k,
      rig: new PersonRig({
        seed: 300 + rand() * 1000,
        scale: (female ? 0.93 : 1.0) * (0.94 + rand() * 0.1),
        female,
        girth: 1.06 + rand() * 0.12, // (the down jacket)
        hair: rand() < 0.75 ? 0.1 + rand() * 0.3 : (female ? 0.6 + rand() * 0.4 : 0.45 + rand() * 0.1),
        armSwing: poles ? 1.5 : 0.7 + rand() * 0.4,
        stride: 0.9 + rand() * 0.15
      }),
      poles,
      poleColor: new THREE.Color(pick(POLE_COLORS)),
      lateral: 0
    };
  });
  const groups = Array.from({ length: GROUPS }, (_, id) => ({
    id, active: false, size: 1, trail: null, s: 0, dir: 1, v: 1.25, base: 1.25, hint: 1, members: walkersOf(3),
    dog: null, offset: 0, onRoad: false, dogPhase: 0, dogColor: new THREE.Color(), leadColor: new THREE.Color(), dogScale: 1, inView: false
  }));

  let near = { stretches: [], total: 0 }, nearAt = null, refresh = 0, wasActive = false;
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v3 = new THREE.Vector3(), dir3 = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);
  const tp = { x: 0, z: 0, hx: 0, hz: 1, i: 1 }, tq = { x: 0, z: 0, hx: 0, hz: 1, i: 1 };
  const stats = { active: 0, groups: 0, drawn: 0, dogs: 0, poles: 0, near: 0 };
  const api = { group, groups, stats, trails, timeScale: 1, enabled: true };
  // the rolled trail (the boots a little into the trodden snow), or the street where the trail follows one
  const groundAt = (x, z, onRoad = false) => surfaceHeight(x, z, groundHeight(x, z)) + (onRoad ? 0.1 : TRAIL_LIFT - 0.05);
  const rigGround = (g, x, z) => groundAt(x, z, g && g.onRoad);
  const activeWalkers = () => groups.reduce((n, g) => n + (g.active ? g.size : 0), 0);

  function deactivate() {
    for (const g of groups) g.active = false;
    for (const l of lods) l.mesh.count = 0;
    poleMesh.count = dogMesh.count = 0;
    stats.active = stats.groups = stats.drawn = stats.dogs = stats.poles = 0;
  }

  function spawn(g, minDistance, cam, budget) {
    if (!near.total) return false;
    for (let attempt = 0; attempt < 8; attempt++) {
      let r = rand() * near.total, st = near.stretches[0];
      for (const x of near.stretches) { if (r <= x.s1 - x.s0) { st = x; break; } r -= x.s1 - x.s0; }
      const s = st.s0 + rand() * (st.s1 - st.s0);
      const p = trailPoint(st.t, s, tp);
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (d < minDistance) continue;
      // (out of sight: far enough, or behind the camera)
      if (minDistance > 0 && d < 160) {
        sphere.center.set(p.x, groundAt(p.x, p.z) + 1, p.z);
        sphere.radius = 3;
        if (frustum.intersectsSphere(sphere)) continue;
      }
      if (groups.some((o) => o.active && o.trail === st.t && Math.abs(o.s - s) < 12)) continue;
      const roll = rand();
      g.size = Math.min(budget, roll < 0.35 ? 1 : roll < 0.8 ? 2 : 3);
      if (g.size < 1) return false;
      g.trail = st.t;
      g.s = s;
      g.hint = p.i;
      g.dir = rand() < 0.5 ? 1 : -1;
      g.offset = (rand() - 0.5) * (g.size > 1 ? 0.4 : 1.0);
      g.base = g.v = 1.1 + rand() * 0.3;
      g.dog = rand() < 0.22 ? { owner: Math.floor(rand() * g.size) } : null;
      if (g.dog) {
        g.dogColor.setHex(pick(DOG_COLORS));
        g.leadColor.setHex(pick(LEAD_COLORS));
        g.dogScale = 0.75 + rand() * 0.45;
        g.dogPhase = rand() * TAU;
      }
      for (let k = 0; k < g.size; k++) {
        const w = g.members[k];
        w.lateral = FORMATION[g.size][k][1] + g.offset;
        w.rig.placed = false;
      }
      g.active = true;
      return true;
    }
    return false;
  }

  // Where member k (or the dog: k = -1) stands: on the line `ahead` metres along the walking direction, `right` metres
  // to the right of it
  function memberPoint(g, ahead, right, out) {
    const p = trailPoint(g.trail, Math.max(0, Math.min(g.trail.len, g.s + g.dir * ahead)), out, g.hint);
    const hx = p.hx * g.dir, hz = p.hz * g.dir;
    out.x = p.x - hz * right;
    out.z = p.z + hx * right;
    out.hx = hx;
    out.hz = hz;
    return out;
  }

  // The grip of a walker's hand (i: 0 left, 1 right) from the posed forearm bone
  const handBind = [0, 1].map((i) => {
    const f = i ? BONE.FOREARM_R : BONE.FOREARM_L, u = i ? BONE.UPPER_ARM_R : BONE.UPPER_ARM_L;
    return [false, true].map((female) => {
      const r = new PersonRig({ female });
      const jf = r.bind[f], ju = r.bind[u];
      return jf.clone().addScaledVector(jf.clone().sub(ju).normalize(), FOREARM + 0.06);
    });
  });
  function handOf(rig, i, out) {
    const o = (i ? BONE.FOREARM_R : BONE.FOREARM_L) * 8, a = rig.pose;
    q.set(a[o], a[o + 1], a[o + 2], a[o + 3]);
    return out.copy(handBind[i][rig.female]).applyQuaternion(q).multiplyScalar(a[o + 7]).add(v3.set(a[o + 4], a[o + 5], a[o + 6]));
  }
  const hand = new THREE.Vector3(), grip = new THREE.Vector3(), tip = new THREE.Vector3(), pel = new THREE.Vector3();

  function placeStick(mesh, index, from, to, colour, thin) {
    dir3.subVectors(to, from);
    const len = dir3.length();
    if (len < 0.05) return false;
    dir3.divideScalar(len);
    q.setFromUnitVectors(DOWN, dir3);
    m4.compose(from, q, sc.set(thin, len, thin));
    mesh.setMatrixAt(index, m4);
    mesh.setColorAt(index, colour);
    return true;
  }

  api.update = function update(dt, camera) {
    if (winter.value < 0.5 || !trails.length || !api.enabled) {
      if (wasActive) deactivate();
      wasActive = false;
      return;
    }
    dt = Math.min(dt, 0.1) * api.timeScale;
    const cam = camera.position;
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    // The trail near the camera (every second, or at once after a jump); groups that have fallen behind are dropped,
    // new ones turn up out of sight
    refresh -= dt;
    const moved = nearAt ? Math.hypot(cam.x - nearAt.x, cam.z - nearAt.z) : Infinity;
    if (refresh <= 0 || moved > 120 || !wasActive) {
      near = nearbyStretches(trails, cam.x, cam.z, RADIUS);
      const fill = moved > 400 || !wasActive;
      nearAt = { x: cam.x, z: cam.z };
      refresh = 1;
      for (const g of groups) {
        if (!g.active) continue;
        const p = trailPoint(g.trail, g.s, tp, g.hint);
        if (Math.hypot(p.x - cam.x, p.z - cam.z) > RADIUS * 1.15) g.active = false;
      }
      const want = Math.min(MAX, Math.floor(near.total * PER_METRE));
      let count = activeWalkers();
      for (const g of groups) {
        if (count >= want) break;
        if (g.active) continue;
        if (spawn(g, fill ? 0 : 200, cam, Math.min(3, want - count))) count += g.size;
      }
      stats.near = Math.round(near.total);
    }
    wasActive = true;

    // Pace: slower uphill (and steeply down), never through the group ahead going the same way
    for (const g of groups) {
      if (!g.active) continue;
      const a = trailPoint(g.trail, Math.min(g.trail.len, g.s + 2), tp, g.hint), ay = groundHeight(a.x, a.z);
      const b = trailPoint(g.trail, Math.max(0, g.s - 2), tq, g.hint), by = groundHeight(b.x, b.z);
      const grade = (ay - by) / 4 * g.dir;
      let v = g.base * (1 - Math.min(0.35, Math.max(0, grade) * 1.6) - Math.min(0.15, Math.max(0, -grade - 0.12)));
      for (const o of groups) {
        if (o === g || !o.active || o.trail !== g.trail || o.dir !== g.dir) continue;
        const gap = (o.s - g.s) * g.dir;
        if (gap > 0 && gap < 4.5) v = Math.min(v, o.v * (gap < 3 ? 0.8 : 1));
      }
      g.v += (v - g.v) * Math.min(1, dt * 1.5);
    }

    for (const l of lods) l.count = 0;
    let poles = 0, dogs = 0, active = 0, groupsActive = 0;
    for (const g of groups) {
      if (!g.active) continue;
      g.s += g.v * g.dir * dt;
      // At a trail's end: gone if out of sight, else they turn round (and cross to the other side)
      if (g.s <= 0 || g.s >= g.trail.len) {
        g.s = Math.max(0, Math.min(g.trail.len, g.s));
        const p = trailPoint(g.trail, g.s, tp, g.hint);
        sphere.center.set(p.x, groundAt(p.x, p.z) + 1, p.z);
        sphere.radius = 3;
        if (!frustum.intersectsSphere(sphere) || cam.distanceTo(sphere.center) > 150) { g.active = false; continue; }
        g.dir = -g.dir;
        for (const w of g.members) w.lateral = -w.lateral; // (where they stand; they cross over at a walk)
      }
      groupsActive++;
      const center = trailPoint(g.trail, g.s, tp, g.hint);
      g.hint = center.i;
      g.onRoad = g.trail.road.charCodeAt(center.i - 1) === 49; // ('1')
      const cy = groundAt(center.x, center.z);
      sphere.center.set(center.x, cy + 1, center.z);
      sphere.radius = 4;
      const distance = cam.distanceTo(sphere.center);
      const inView = frustum.intersectsSphere(sphere);
      for (let k = 0; k < g.size; k++) {
        const w = g.members[k], [ahead, formationRight] = FORMATION[g.size][k], right = formationRight + g.offset;
        w.lateral += (right - w.lateral) * Math.min(1, dt * 0.8);
        const p = memberPoint(g, ahead, w.lateral, tq);
        const rig = w.rig;
        rig.update(dt, p.x, p.z, Math.atan2(p.hx, p.hz), rigGround, g, 0, inView);
        active++;
        if (!inView) continue;
        const lod = lods[distance > NEAR_LOD ? 1 : 0];
        if (lod.count < MAX) lod.pose.value.array.set(rig.pose, lod.count++ * stride * 4);
        // Trekking poles: from the fist down to the snow beside the feet, the tip trailing the hand's swing
        if (w.poles && distance < POLE_DRAW) {
          const fx = Math.sin(rig.yaw), fz = Math.cos(rig.yaw);
          pel.set(rig.x, 0, rig.z);
          for (let i = 0; i < 2; i++) {
            handOf(rig, i, hand);
            const fwd = (hand.x - pel.x) * fx + (hand.z - pel.z) * fz;
            const side = i ? -1 : 1;
            tip.set(hand.x + fx * (fwd * 0.9 - 0.12) + fz * side * 0.08, 0, hand.z + fz * (fwd * 0.9 - 0.12) - fx * side * 0.08);
            tip.y = groundAt(tip.x, tip.z, g.onRoad) - 0.04;
            if (placeStick(poleMesh, poles, grip.copy(hand).addScaledVector(UP, 0.06), tip, w.poleColor, 1)) poles++;
          }
        }
      }
      // The dog: trotting a lead's length ahead of its person, a little to the outside
      if (g.dog && dogs < MAX_DOGS) {
        const owner = g.members[g.dog.owner];
        const [ahead] = FORMATION[g.size][g.dog.owner];
        const p = memberPoint(g, ahead + 1.5, Math.min(1.75, owner.lateral + 0.35), tq);
        const y = groundAt(p.x, p.z, g.onRoad);
        g.dogPhase = (g.dogPhase + dt * g.v / (0.55 * g.dogScale) * Math.PI) % TAU;
        if (inView && distance < DOG_DRAW) {
          q.setFromAxisAngle(UP, Math.atan2(p.hx, p.hz));
          m4.compose(v3.set(p.x, y, p.z), q, sc.setScalar(g.dogScale));
          dogMesh.setMatrixAt(dogs, m4);
          dogMesh.setColorAt(dogs, g.dogColor);
          gaitAttr.setXY(dogs, g.dogPhase, 0.42);
          dogs++;
          // the lead from the owner's right hand to the collar
          if (distance < POLE_DRAW && poles < poleMesh.instanceMatrix.count) {
            handOf(owner.rig, 1, hand);
            tip.set(p.x + p.hx * 0.3 * g.dogScale, y + 0.52 * g.dogScale, p.z + p.hz * 0.3 * g.dogScale);
            if (placeStick(poleMesh, poles, hand, tip, g.leadColor, 0.45)) poles++;
          }
        }
      }
    }
    for (const l of lods) {
      l.mesh.count = l.count;
      if (!l.count) continue;
      const attr = l.pose.value;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, l.count * stride * 4);
      attr.needsUpdate = true;
    }
    poleMesh.count = poles;
    dogMesh.count = dogs;
    for (const mesh of [poleMesh, dogMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    if (dogs) gaitAttr.needsUpdate = true;
    stats.active = active;
    stats.groups = groupsActive;
    stats.drawn = lods[0].count + lods[1].count;
    stats.dogs = dogs;
    stats.poles = poles;
  };
  api.position = (g) => { const p = trailPoint(g.trail, g.s, {}, g.hint); return { x: p.x, y: groundAt(p.x, p.z), z: p.z }; }; // (probes)

  // Not drawn in summer; drawn while the loading screen compiles the shaders (main.js sets __slopdavos.ready afterwards)
  Object.defineProperty(group, 'visible', {
    get: () => winter.value > 0.5 || !(typeof window !== 'undefined' && window.__slopdavos?.ready),
    set() {}
  });
  group.userData.winterHikers = api;
  scene.add(group);
  return api;
}
