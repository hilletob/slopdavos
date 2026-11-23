import * as THREE from 'three/webgpu';
import { color, float, fract, max, min, mix, positionGeometry, positionView, smoothstep, step, uv } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { airObstacleField, KIND, PYLON_FROM } from './air-obstacle-field.js';
import { cullInstanced } from './scene-culling.js';

// The registered air navigation obstacles of Davos, drawn (js/air-obstacle-field.js has the geometry and the contact
// test; the data is the BAZL's obstacle register, js/air-obstacles-data.js):
// - the overhead power lines: lattice pylons (the 50 m ones of the line down the Landwasser valley to Filisur) and
//   wooden poles with their conductors;
// - the material and transport cables across the side valleys: a single rope high over the ground, with the orange
//   marker balls such spans carry;
// - the single masts (aerials), banded red and white.
// Four instanced meshes, cut into 1 km squares, and one line set for the whole map (a few hundred instances, ~5000
// line segments).

const UP = new THREE.Vector3(0, 1, 0);

// Unit height (scaled by the mast's): a tapering four-sided lattice tower with its crossarm, its faces cut into
// diagonals by the material
function pylonGeometry() {
  const tower = new THREE.CylinderGeometry(0.018, 0.09, 1, 4, 1, true);
  tower.rotateY(Math.PI / 4);
  tower.translate(0, 0.5, 0);
  const parts = [tower];
  // (the crossarm and the earth wire's peak: boxes, their uv zeroed so that the material leaves them whole)
  for (const [y, w, t] of [[0.84, 0.32, 0.012], [0.99, 0.1, 0.01]]) {
    const arm = new THREE.BoxGeometry(w, t, t);
    arm.translate(0, y, 0);
    arm.attributes.uv.array.fill(0);
    parts.push(arm);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

function pylonMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide, alphaTest: 0.5 });
  // The tower's faces (uv.x: four faces round, uv.y: up): the corner legs, the diagonals and the horizontal girts
  const face = fract(uv().x.mul(4));
  const line = (v, w) => step(min(v, float(1).sub(v)), w);
  const rows = float(9);
  const diag = max(line(fract(face.add(uv().y.mul(rows))), 0.07), line(fract(face.sub(uv().y.mul(rows))), 0.07));
  const lattice = max(max(line(face, 0.09), diag), line(fract(uv().y.mul(rows)), 0.05));
  m.opacityNode = lattice; // (uv 0 on the crossarms: whole)
  m.colorNode = color(0x8d9499);
  return m;
}

// A wooden pole with a short crossarm (unit height)
function poleGeometry() {
  const pole = new THREE.CylinderGeometry(0.11, 0.15, 1, 7, 1);
  pole.translate(0, 0.5, 0);
  const arm = new THREE.BoxGeometry(1.8, 0.012, 0.1);
  arm.translate(0, 0.95, 0);
  return mergeGeometries([pole, arm].map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// A slender mast, banded red and white (unit height)
function aerialGeometry() {
  const g = new THREE.CylinderGeometry(0.22, 0.42, 1, 8, 1);
  g.translate(0, 0.5, 0);
  return g;
}

function aerialMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.2 });
  const band = step(0.5, fract(positionGeometry.y.mul(3.5)));
  m.colorNode = mix(color(0xc6281f), color(0xeeeeea), band);
  return m;
}

function instanced(geometry, material, masts, name, yawOf) {
  const mesh = new THREE.InstancedMesh(geometry, material, masts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  masts.forEach((mast, i) => {
    const wide = mast.kind === KIND.power && mast.h >= PYLON_FROM;
    mesh.setMatrixAt(i, m.compose(p.set(mast.x, mast.base - 0.3, mast.z), q.setFromAxisAngle(UP, yawOf(mast)), wide ? s.set(mast.h, mast.h + 0.3, mast.h) : s.set(1, mast.h + 0.3, 1)));
  });
  mesh.name = name;
  mesh.castShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function buildAirObstacles(scene) {
  const { masts, wires } = airObstacleField(groundHeight);
  const group = new THREE.Group();
  group.name = 'AirObstacles';
  group.userData.terrain = 'absolute';
  // A mast's crossarm lies across its line: the direction of the nearest conductor's first segment
  const yawOf = (mast) => {
    let best = null, bd = 9;
    for (const w of wires) {
      if (!w.mid || w.kind !== mast.kind) continue;
      const n = w.pts.length;
      for (const [i, j] of [[0, 3], [n - 3, n - 6]]) {
        const d = Math.hypot(w.pts[i] - mast.x, w.pts[i + 2] - mast.z);
        if (d < bd) { bd = d; best = Math.atan2(w.pts[j] - w.pts[i], w.pts[j + 2] - w.pts[i + 2]); }
      }
    }
    return best ?? 0;
  };
  const pylons = masts.filter((m) => m.kind === KIND.power && m.h >= PYLON_FROM);
  const poles = masts.filter((m) => (m.kind === KIND.power && m.h < PYLON_FROM) || m.kind === KIND.cable);
  const aerials = masts.filter((m) => m.kind === KIND.pole);
  const wood = new THREE.MeshStandardNodeMaterial({ color: 0x5b4a3a, roughness: 0.9, metalness: 0 });
  if (pylons.length) group.add(instanced(pylonGeometry(), pylonMaterial(), pylons, 'Power line pylons', yawOf));
  if (poles.length) group.add(instanced(poleGeometry(), wood, poles, 'Power line poles', yawOf));
  if (aerials.length) group.add(instanced(aerialGeometry(), aerialMaterial(), aerials, 'Aerial masts', () => 0));

  // The conductors and cables: thin lines that fade with distance (a one-pixel line reads as a hard stroke from afar,
  // where a real wire is barely seen: that is what makes it an obstacle)
  const positions = [];
  for (const w of wires) for (let i = 0; i + 3 < w.pts.length; i += 3) positions.push(w.pts[i], w.pts[i + 1], w.pts[i + 2], w.pts[i + 3], w.pts[i + 4], w.pts[i + 5]);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lineMaterial = new THREE.LineBasicNodeMaterial({ color: 0x4a4f55, transparent: true, depthWrite: false });
  lineMaterial.opacityNode = float(0.9).mul(float(1).sub(smoothstep(700, 2600, positionView.z.negate())));
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  lines.name = 'Power lines and cables';
  group.add(lines);

  // Marker balls on the cables' long spans, every ~70 m
  const balls = [];
  for (const w of wires) {
    if (w.kind !== KIND.cable || w.len < 150) continue;
    const n = w.pts.length / 3 - 1, count = Math.max(2, Math.round(w.len / 70));
    for (let k = 1; k <= count; k++) {
      const f = (k / (count + 1)) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
      balls.push([0, 1, 2].map((c) => w.pts[i * 3 + c] + (w.pts[i * 3 + 3 + c] - w.pts[i * 3 + c]) * t));
    }
  }
  if (balls.length) {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshStandardNodeMaterial({ color: 0xf06a1d, roughness: 0.5, metalness: 0 }), balls.length);
    const m = new THREE.Matrix4();
    balls.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
    mesh.name = 'Cable marker balls';
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  group.userData.stats = { pylons: pylons.length, poles: poles.length, aerials: aerials.length, wires: wires.length, balls: balls.length };
  scene.add(group);
  // The instanced sets span the whole map: cut into squares the view culls; the small ones also hidden where they
  // shrink to a pixel (the pylons stand out over the valley at any distance)
  const reach = { 'Power line pylons': Infinity, 'Power line poles': 1500, 'Aerial masts': 2500, 'Cable marker balls': 1200 };
  for (const mesh of [...group.children]) if (mesh.isInstancedMesh) cullInstanced(mesh, { cell: 1000, maxDistance: reach[mesh.name] ?? Infinity });
  return group;
}
