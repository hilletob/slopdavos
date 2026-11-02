import * as THREE from 'three/webgpu';
import { attribute, float, max, mix, positionLocal, select, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKI_PISTES } from './ski-pistes-data.js';
import { groundHeight } from './terrain.js';
import { winter, isWinter } from './season.js';
import { QUALITY } from './quality.js';

// js/winter-sports.js
// Skiers and snowboarders on the downhill runs (js/ski-pistes-data.js), in winter and near the camera only.
// - A small population (up to MAX) lives within RADIUS of the camera: each rides a run down in linked turns (a sine
//   across the run's fall line: short swings, long carved arcs, the boarders' heel- and toe-side turns), leaning into
//   every turn as far as its speed and radius ask (atan(a / g)), crouched lower in the turn, the skiers planting the
//   inside pole as they change edges. At the foot of a run they carry on down the next one (OSM: the runs passing
//   within 30 m, tools/fetch-ski-pistes.mjs), else they reappear at a run out of sight (as if back from the lift).
// - Cheap rigid figures, bright ski clothes and a helmet (with goggles), skis and poles or a board: one merged geometry
//   for both kinds (the other kind's triangles collapse per instance), instanced: a near level of detail (with poles,
//   casting shadows) and a far one, so two draw calls in all.

const MAX = QUALITY.skiers; // figures at most (72; 24 on the mobile profile, js/quality.js)
const RADIUS = 750; // around the camera (m)
const NEAR = 110; // the detailed figures within this distance
const FAR = 1100; // none drawn beyond
const SAMPLE = 25; // spawn points along the runs every SAMPLE m
const CELL = 250;
const G = 9.81;

// --- Figures ----------------------------------------------------------------------------------------------------------
// Local frame: +z forward (the direction of travel), +y up, +x left; the feet at y = 0.
// Parts: 0 jacket, 1 trousers, 2 accent (helmet, skis, board), 3 skin, 4 dark (boots, gloves, goggle frame),
// 5 pole metal, 6 goggle lens
const PART = { jacket: 0, pants: 1, accent: 2, skin: 3, dark: 4, metal: 5, lens: 6 };

function withAttributes(g, part, kind, poleSide = 0, poleFrom = null, poleTo = null) {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  // figure = (part, kind, pole): the kind of figure the vertex belongs to (0 skier, 1 snowboarder); pole: along the
  // pole (0 at the hand, 1 at the tip), signed by its side (+1 left, -1 right), 0 elsewhere. (One vertex buffer:
  // WebGPU allows 8 in all, the instance matrix and the per-instance look and pose included.)
  const f = new Float32Array(n * 3);
  const p = geo.attributes.position, len = poleFrom ? poleFrom.distanceTo(poleTo) : 1, v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    f[i * 3] = part; f[i * 3 + 1] = kind;
    f[i * 3 + 2] = poleSide ? poleSide * Math.min(1, v.fromBufferAttribute(p, i).distanceTo(poleFrom) / len) : 0;
  }
  geo.setAttribute('figure', new THREE.Float32BufferAttribute(f, 3));
  return geo;
}

class FigureBuilder {
  constructor(detail) { this.detail = detail; this.parts = []; }
  // A tube from a to b, radii ra → rb, its cross-section squashed to `flat` across (along local x of the tube)
  tube(a, b, ra, rb, part, kind, { flat = 1, pole = 0 } = {}) {
    const seg = this.detail ? 8 : 4;
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const g = new THREE.CylinderGeometry(rb, ra, len, seg, 1, false);
    g.scale(1, 1, flat);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    g.applyQuaternion(q);
    g.translate(A.x, A.y, A.z);
    this.parts.push(withAttributes(g, part, kind, pole, A, B));
  }
  box(c, s, part, kind, rot = [0, 0, 0]) {
    const g = new THREE.BoxGeometry(...s);
    g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
    g.translate(...c);
    this.parts.push(withAttributes(g, part, kind));
  }
  sphere(c, r, part, kind, { top = false, scale = [1, 1, 1] } = {}) {
    const g = new THREE.SphereGeometry(r, this.detail ? 10 : 5, this.detail ? (top ? 4 : 7) : 3, 0, Math.PI * 2, 0, top ? Math.PI * 0.55 : Math.PI);
    g.scale(...scale);
    g.translate(...c);
    this.parts.push(withAttributes(g, part, kind));
  }
  build() {
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    g.computeBoundingSphere();
    return g;
  }
}

function addSkier(f, near) {
  const K = 0;
  for (const s of [1, -1]) {
    const x = 0.11 * s;
    f.box([x, 0.025, 0.02], [0.085, 0.028, 1.62], PART.accent, K); // ski
    if (near) f.box([x, 0.06, 0.88], [0.085, 0.024, 0.16], PART.accent, K, [-0.5, 0, 0]); // its tip
    f.box([x, 0.15, 0.0], [0.12, 0.24, 0.3], PART.dark, K); // boot
    f.tube([x, 0.24, 0.04], [0.12 * s, 0.56, 0.24], 0.06, 0.065, PART.pants, K); // shin
    f.tube([0.12 * s, 0.56, 0.24], [0.1 * s, 0.9, 0.0], 0.07, 0.085, PART.pants, K); // thigh
    f.tube([0.2 * s, 1.32, 0.12], [0.26 * s, 1.1, 0.3], 0.055, 0.05, PART.jacket, K); // upper arm
    f.tube([0.26 * s, 1.1, 0.3], [0.25 * s, 1.03, 0.5], 0.05, 0.045, PART.jacket, K); // forearm
    if (near) {
      f.box([0.25 * s, 1.02, 0.53], [0.08, 0.09, 0.1], PART.dark, K); // glove
      f.tube([0.25 * s, 1.04, 0.53], [0.33 * s, 0.04, -0.32], 0.011, 0.009, PART.metal, K, { pole: s }); // pole
    }
  }
  f.tube([0, 0.84, 0.0], [0, 1.36, 0.15], 0.16, 0.185, PART.jacket, K, { flat: 0.68 }); // torso
  if (near) f.tube([0, 1.34, 0.15], [0, 1.45, 0.18], 0.05, 0.05, PART.skin, K); // neck
  f.sphere([0, 1.54, 0.2], 0.1, PART.skin, K, { scale: [0.92, 1.08, 1] }); // head
  f.sphere([0, 1.555, 0.19], 0.125, PART.accent, K, { top: true, scale: [0.95, 1, 1.1] }); // helmet
  if (near) {
    f.box([0, 1.53, 0.305], [0.2, 0.065, 0.03], PART.lens, K); // goggles
    f.box([0, 1.53, 0.29], [0.215, 0.08, 0.02], PART.dark, K); // their frame
  }
}

function addBoarder(f, near) {
  const K = 1;
  // Board along the direction of travel, the rider standing across it facing +x (the toe side), front foot ahead
  f.box([0, 0.022, 0], [0.27, 0.022, 1.36], PART.accent, K);
  if (near) for (const e of [1, -1]) f.box([0, 0.05, 0.73 * e], [0.27, 0.02, 0.14], PART.accent, K, [0.45 * e, 0, 0]);
  for (const e of [1, -1]) {
    const z = 0.25 * e;
    f.box([0.0, 0.13, z], [0.28, 0.22, 0.13], PART.dark, K); // boot (and binding)
    f.tube([0.02, 0.22, z], [0.2, 0.52, z * 0.85], 0.06, 0.065, PART.pants, K); // shin
    f.tube([0.2, 0.52, z * 0.85], [0.0, 0.86, z * 0.5], 0.07, 0.085, PART.pants, K); // thigh
    f.tube([0.06, 1.3, 0.19 * e], [0.12, 1.12, 0.42 * e], 0.055, 0.05, PART.jacket, K); // upper arm, out for balance
    f.tube([0.12, 1.12, 0.42 * e], [0.18, 1.0, 0.6 * e], 0.05, 0.045, PART.jacket, K); // forearm
    if (near) f.box([0.18, 0.99, 0.63 * e], [0.1, 0.09, 0.08], PART.dark, K); // glove
  }
  f.tube([0, 0.84, 0], [0.12, 1.34, 0.03], 0.17, 0.19, PART.jacket, K, { flat: 1.45 }); // torso, wide along z
  if (near) f.tube([0.12, 1.33, 0.03], [0.14, 1.44, 0.04], 0.05, 0.05, PART.skin, K);
  f.sphere([0.15, 1.53, 0.05], 0.1, PART.skin, K, { scale: [1, 1.08, 0.92] });
  f.sphere([0.145, 1.545, 0.05], 0.125, PART.accent, K, { top: true, scale: [1.1, 1, 0.95] });
  if (near) {
    // Goggles looking ahead over the front shoulder (towards +x+z)
    f.box([0.215, 1.52, 0.135], [0.2, 0.065, 0.03], PART.lens, K, [0, Math.PI / 4, 0]);
    f.box([0.205, 1.52, 0.125], [0.215, 0.08, 0.02], PART.dark, K, [0, Math.PI / 4, 0]);
  }
}

function buildFigureGeometry(near) {
  const f = new FigureBuilder(near ? 1 : 0);
  addSkier(f, near);
  addBoarder(f, near);
  return f.build();
}

function createFigureMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0 });
  const figure = attribute('figure', 'vec3');
  const part = figure.x;
  // Per instance: look = (jacket, trousers, accent as 0xRRGGBB, kind); pose = (world direction of travel, signed pole
  // plant: + left, - right)
  const look = attribute('aLook', 'vec4'), pose = attribute('aPose', 'vec4');
  const unpack = (c) => vec3(c.div(65536).floor(), c.div(256).floor().mod(256), c.mod(256)).div(255).pow(vec3(2.2));
  const pick = (k) => part.sub(k).abs().lessThan(0.5);
  m.colorNode = select(pick(0), unpack(look.x),
    select(pick(1), unpack(look.y),
      select(pick(2), unpack(look.z),
        select(pick(3), vec3(0.78, 0.55, 0.42),
          select(pick(4), vec3(0.045, 0.045, 0.05),
            select(pick(5), vec3(0.55, 0.57, 0.6), vec3(0.95, 0.45, 0.08)))))));
  m.roughnessNode = select(pick(6), float(0.2), select(pick(5), float(0.35), float(0.62)));
  m.metalnessNode = select(pick(6).or(pick(5)), float(0.6), float(0));
  // (applied after the instance transform: world-space offsets) The planting pole's tip swings forward;
  // the other kind's triangles collapse to a point
  const plant = max(figure.z.mul(pose.w), 0);
  const moved = positionLocal.add(pose.xyz.mul(plant.mul(0.62))).add(vec3(0, plant.mul(0.12), 0));
  m.positionNode = select(figure.y.sub(look.w).abs().lessThan(0.5), moved, vec3(0, -1e4, 0).mul(winter.add(1)));
  return m;
}

// --- Runs ------------------------------------------------------------------------------------------------------------
const POPULARITY = { novice: 1, easy: 1, intermediate: 0.85, advanced: 0.5, freeride: 0.12 };

function prepareRuns() {
  return SKI_PISTES.runs.map((r, index) => {
    const n = r.pts.length / 2;
    const cum = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
    for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(r.pts[k * 2] - r.pts[k * 2 - 2], r.pts[k * 2 + 1] - r.pts[k * 2 - 1]);
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      const dx = r.pts[b * 2] - r.pts[a * 2], dz = r.pts[b * 2 + 1] - r.pts[a * 2 + 1], L = Math.hypot(dx, dz) || 1;
      tx[k] = dx / L; tz[k] = dz / L;
    }
    const length = cum[n - 1];
    return {
      index, run: r, n, cum, tx, tz, length, half: r.w / 2,
      grade: Math.max(0.03, (r.drop || 0) / Math.max(1, length)),
      weight: (POPULARITY[r.d] ?? 0.5) * (r.road ? 0.5 : 1)
    };
  }).filter((p) => p.length > 30);
}

// Position (x, z) and unit tangent (tx, tz) at arc length s along a prepared run
function sampleRun(p, s, out) {
  const { cum, n, run } = p;
  s = Math.min(Math.max(s, 0), p.length);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const seg = cum[hi] - cum[lo] || 1, t = (s - cum[lo]) / seg;
  out.x = run.pts[lo * 2] + (run.pts[hi * 2] - run.pts[lo * 2]) * t;
  out.z = run.pts[lo * 2 + 1] + (run.pts[hi * 2 + 1] - run.pts[lo * 2 + 1]) * t;
  // (the tangent blends from vertex to vertex: no kinks at the corners)
  let ux = p.tx[lo] + (p.tx[hi] - p.tx[lo]) * t, uz = p.tz[lo] + (p.tz[hi] - p.tz[lo]) * t;
  const L = Math.hypot(ux, uz) || 1;
  out.tx = ux / L; out.tz = uz / L;
  return out;
}

// --- Clothes -----------------------------------------------------------------------------------------------------------
const JACKETS = [0xd7261e, 0x1f5fd1, 0xf2c014, 0xf06a12, 0x13a3a8, 0xe0368f, 0x2f9e44, 0xf4f4f2, 0x18191c, 0x6b3fb5, 0x9fd3f0, 0xc8e03a, 0x8b1e2e];
const PANTS = [0x15161a, 0x15161a, 0x1c2a4a, 0x3a3d42, 0xeeeeea, 0xb22222, 0x5b5642, 0x24467a, 0x2e2e33];
const ACCENTS = [0xf2f2f0, 0x111114, 0xd42a20, 0x1d4fbf, 0x6d7177, 0xf0c419, 0xe24a97, 0x2bb3a3, 0xffffff];

export function buildWinterSports(scene) {
  const group = new THREE.Group();
  group.name = 'Skiers & snowboarders';
  group.userData.terrain = 'absolute';
  const runs = prepareRuns();

  // Spawn points along the runs, in CELL cells
  const cells = new Map();
  for (const p of runs) {
    for (let s = 10; s < p.length - 15; s += SAMPLE) {
      const q = sampleRun(p, s, {});
      const key = `${Math.floor(q.x / CELL)},${Math.floor(q.z / CELL)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ p, s, x: q.x, z: q.z, w: p.weight });
    }
  }

  // Two instanced meshes (near & far), one draw call each; per-instance clothes, kind, pole plant & heading
  const makeMesh = (near) => {
    const geo = buildFigureGeometry(near);
    for (const name of ['aLook', 'aPose']) geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(geo, material, MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // (a few dozen figures around the camera: drawn as one batch)
    mesh.castShadow = near;
    mesh.receiveShadow = near;
    mesh.name = near ? 'Skiers near' : 'Skiers far';
    // One figure far below the map until the first update: the loading screen compiles the pipelines with it
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, -2000, 0));
    mesh.count = 1;
    group.add(mesh);
    return mesh;
  };
  const material = createFigureMaterial();
  const nearMesh = makeMesh(true), farMesh = makeMesh(false);
  const triangles = { near: nearMesh.geometry.attributes.position.count / 6, far: farMesh.geometry.attributes.position.count / 6 };

  // The population
  let seed = 12345;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 1) >>> 0) / 4294967296;
  const agents = [];
  for (let i = 0; i < MAX; i++) {
    const board = rand() < 0.3;
    const style = board ? 'board' : rand() < 0.45 ? 'carve' : 'short';
    agents.push({
      active: false, board, style,
      jacket: JACKETS[Math.floor(rand() * JACKETS.length)],
      pants: PANTS[Math.floor(rand() * PANTS.length)],
      accent: ACCENTS[Math.floor(rand() * ACCENTS.length)],
      skill: 0.75 + rand() * 0.5,
      wave: style === 'carve' ? 30 + rand() * 14 : style === 'board' ? 24 + rand() * 12 : 10 + rand() * 5,
      amp: style === 'carve' ? 5 + rand() * 3 : style === 'board' ? 4 + rand() * 3 : 1.5 + rand() * 1,
      p: null, s: 0, phase: rand() * Math.PI * 2, ox: 0, oz: 0,
      lane: rand() * 2 - 1, wait: 0,
      x: 0, y: 0, z: 0, basis: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], crouch: 1, plant: 0, fx: 0, fy: 0, fz: 1
    });
  }

  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sphere = new THREE.Sphere(new THREE.Vector3(), 3);
  const pick = (camX, camZ, { hidden = false } = {}) => {
    // A weighted random spawn point within RADIUS of the camera (out of sight if `hidden`: behind the camera, or far)
    const list = [];
    let total = 0;
    const r = Math.ceil(RADIUS / CELL);
    const cx = Math.floor(camX / CELL), cz = Math.floor(camZ / CELL);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const c = cells.get(`${cx + i},${cz + j}`);
      if (!c) continue;
      for (const q of c) {
        const d = Math.hypot(q.x - camX, q.z - camZ);
        if (d > RADIUS) continue;
        if (hidden) {
          sphere.center.set(q.x, groundHeight(q.x, q.z) + 1, q.z);
          if (d < 450 && frustum.intersectsSphere(sphere)) continue;
        }
        list.push(q); total += q.w;
      }
    }
    if (!list.length) return null;
    let t = rand() * total;
    for (const q of list) { t -= q.w; if (t <= 0) return q; }
    return list[list.length - 1];
  };
  const spawn = (a, camX, camZ, hidden) => {
    const q = pick(camX, camZ, { hidden });
    if (!q) { a.active = false; return; }
    a.active = true; a.p = q.p; a.s = Math.min(q.p.length - 5, q.s + (rand() - 0.5) * SAMPLE); a.ox = a.oz = 0;
    pace(a);
  };

  // Progress down the run (m/s): as fast as the turn shape allows at the lateral acceleration the rider takes on
  // (0.35-0.8 g, more on steeper runs), within 2.5-9 m/s
  const pace = (a) => {
    const amp = Math.max(0.4, Math.min(a.amp, a.p.half - 2.5));
    const accel = G * Math.min(0.8, (0.3 + a.p.grade * 0.6) * a.skill);
    a.speed = Math.min(9, Math.max(2.5, (a.wave / (Math.PI * 2)) * Math.sqrt(accel / amp)));
  };
  const tmp = {}, m4 = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), P = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), Yc = new THREE.Vector3();
  let lastCam = null, populated = 0;
  const stats = { active: 0, near: 0, far: 0, runs: runs.length };

  function step(a, dt, depth = 0) {
    const p = a.p;
    // Along the run at the skier's own pace; the turns across it
    const along = a.speed;
    a.s += along * dt;
    const omega = (Math.PI * 2 * along) / a.wave;
    a.phase += omega * dt;
    if (a.s >= p.length - 2) {
      // The run's foot: carry on down a linked run (gliding over from where this one ended), else back up
      const next = p.run.next;
      const fromX = a.x, fromZ = a.z;
      const nx = next.length ? next[Math.floor(rand() * next.length)] : null;
      const target = nx && runs.find((r) => r.index === nx[0]);
      if (!target || depth > 3) return false;
      a.p = target; a.s = target.cum[nx[1]];
      pace(a);
      if (!step(a, 0, depth + 1)) return false;
      // (gliding over from where the rider was: the offset fades out over the next seconds)
      a.ox += fromX - a.x; a.oz += fromZ - a.z; a.x = fromX; a.z = fromZ; a.y = groundHeight(fromX, fromZ) + 0.2;
      return true;
    }
    const decay = Math.exp(-dt * 0.7);
    a.ox *= decay; a.oz *= decay;
    sampleRun(a.p, a.s, tmp);
    const amp = Math.max(0.4, Math.min(a.amp, a.p.half - 2.5));
    // (each rider keeps to a line of their own across the run)
    const u = Math.max(-1, Math.min(1, a.lane)) * Math.max(0, a.p.half - 2.5 - amp) + amp * Math.sin(a.phase), du = amp * omega * Math.cos(a.phase), ddu = -amp * omega * omega * Math.sin(a.phase);
    // (right of the run: (-tz, tx))
    const rx = -tmp.tz, rz = tmp.tx;
    a.x = tmp.x + rx * u + a.ox; a.z = tmp.z + rz * u + a.oz;
    let hx = tmp.tx * along + rx * du, hz = tmp.tz * along + rz * du;
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl; hz /= hl;
    a.y = groundHeight(a.x, a.z) + 0.2;
    // Pitched with the slope along the heading, leaning into the turn (the lateral acceleration against gravity)
    const grade = groundHeight(a.x + hx, a.z + hz) - groundHeight(a.x, a.z);
    Z.set(hx, grade, hz).normalize();
    X.crossVectors(UP, Z).normalize(); // left
    Y.crossVectors(Z, X);
    // (the skis push back along a + g: the body leans towards the turn's centre, here the run's right for ddu > 0)
    const lean = Math.max(-0.8, Math.min(0.8, ddu / G));
    Y.addScaledVector(P.set(rx, 0, rz), lean).normalize();
    X.crossVectors(Y, Z).normalize();
    Z.crossVectors(X, Y);
    a.basis[0].copy(X); a.basis[1].copy(Y); a.basis[2].copy(Z);
    a.crouch = 1 - Math.min(0.14, Math.abs(lean) * 0.2) - (a.board ? 0.03 : 0.05);
    // The pole plant just before the edge change (sin(phase) through 0): the inside pole of the coming turn (for
    // cos(phase) > 0 the run's left, the figure's +x)
    const c = Math.cos(a.phase), sn = Math.sin(a.phase + 0.35 * Math.sign(c));
    a.plant = a.board ? 0 : Math.exp(-((sn / 0.3) ** 2)) * Math.sign(c) * (rx * X.x + rz * X.z <= 0 ? 1 : -1);
    a.fx = hx; a.fz = hz; a.fy = grade;
    return true;
  }

  function write(mesh, slot, a) {
    const [bx, by, bz] = a.basis;
    m4.makeBasis(bx, Yc.copy(by).multiplyScalar(a.crouch), bz).setPosition(P.set(a.x, a.y, a.z));
    mesh.setMatrixAt(slot, m4);
    const g = mesh.geometry.attributes;
    g.aLook.array.set([a.jacket, a.pants, a.accent, a.board ? 1 : 0], slot * 4);
    g.aPose.array.set([a.fx, a.fy, a.fz, a.plant], slot * 4);
  }

  function update(dt, camera) {
    const on = isWinter() && winter.value > 0.5;
    if (!on) {
      if (populated) { for (const a of agents) a.active = false; populated = 0; }
      nearMesh.count = farMesh.count = 0;
      nearMesh.visible = farMesh.visible = false;
      stats.active = stats.near = stats.far = 0;
      return;
    }
    const cam = camera.position;
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    // A jump of the camera (teleport, camera switch): repopulate around it anywhere, in sight or not
    const jumped = !lastCam || Math.hypot(cam.x - lastCam.x, cam.z - lastCam.z) > 300;
    lastCam = { x: cam.x, z: cam.z };
    if (jumped) {
      for (const a of agents) a.active = false;
      populated = 0;
    }
    // How many: as the runs nearby allow (a crowd on a single short run looks wrong)
    let nearbySamples = 0;
    const r = Math.ceil(RADIUS / CELL), cx = Math.floor(cam.x / CELL), cz = Math.floor(cam.z / CELL);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) nearbySamples += cells.get(`${cx + i},${cz + j}`)?.length || 0;
    const want = Math.min(MAX, Math.round(nearbySamples * 0.45));
    const step_dt = Math.min(dt, 0.05);
    let nearCount = 0, farCount = 0, active = 0;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (i >= want) { a.active = false; continue; }
      if (!a.active) {
        // (back from the lift after a while, so that the riders don't come down in a queue)
        if (a.wait > 0 && populated) { a.wait -= dt; continue; }
        spawn(a, cam.x, cam.z, populated >= want);
        if (!a.active) continue;
        a.phase = rand() * Math.PI * 2;
      }
      if (!step(a, step_dt) || Math.hypot(a.x - cam.x, a.z - cam.z) > RADIUS + 150) {
        // At the foot of a run that leads nowhere further, or out of the neighbourhood: off to the lift
        a.active = false;
        a.wait = 2 + rand() * 25;
        continue;
      }
      const d = Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z);
      active++;
      if (d < NEAR) write(nearMesh, nearCount++, a);
      else if (d < FAR) write(farMesh, farCount++, a);
    }
    populated = Math.max(populated, active);
    for (const [mesh, count] of [[nearMesh, nearCount], [farMesh, farCount]]) {
      mesh.count = count;
      mesh.visible = count > 0;
      if (!count) continue;
      mesh.instanceMatrix.needsUpdate = true;
      const g = mesh.geometry.attributes;
      g.aLook.needsUpdate = g.aPose.needsUpdate = true;
    }
    Object.assign(stats, { active, near: nearCount, far: farCount, want });
  }

  scene.add(group);
  const api = { group, update, stats: () => ({ ...stats, triangles }) };
  if (typeof window !== 'undefined') window.__winterSports = api; // (probe hook)
  return api;
}

/**
 * One figure of the same make for the player (js/missions-snow.js: the slalom skier, the big air's snowboarder): an
 * instanced mesh of one, the near level of detail with its own material. The caller poses it through its single
 * instance matrix (world space, the mesh itself left at the origin: the pole plant's offsets are world-space) and
 * aPose (x, y, z: the direction of travel, w: the pole plant, + left, - right).
 */
export function createRiderFigure({ board = false, jacket = 0xd7261e, pants = 0x15161a, accent = 0xf2f2f0 } = {}) {
  const geo = buildFigureGeometry(true);
  geo.setAttribute('aLook', new THREE.InstancedBufferAttribute(new Float32Array([jacket, pants, accent, board ? 1 : 0]), 4));
  geo.setAttribute('aPose', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 1, 0]), 4).setUsage(THREE.DynamicDrawUsage));
  const mesh = new THREE.InstancedMesh(geo, createFigureMaterial(), 1);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = board ? 'Player snowboarder' : 'Player skier';
  return mesh;
}
