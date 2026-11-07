import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight, groundNormal } from './terrain.js';
import { ParticleBatch } from './missions-fx.js';
import { createToast, particles } from './missions-work.js';
import {
  PFADI, PFADI_PLACES, PFADI_STEPS, trailMarks, stepCamp, stepPhase, needle
} from './missions-data-pfadi.js';

// js/missions-pfadi.js
// The runtime of js/missions-data-pfadi.js (PFADI_FEATURES, merged into js/missions.js FEATURES):
//   pfadi — the evening of the Pfadi Davos in the Mattawald. The walker is the game's own pedestrian (js/controllers.js),
//           Space (or E, or the touch button) is taken from the jump for the camp's work: held for the steps, pressed
//           for the strikes. Along the way the Pfadi trail signs (Wegzeichen: three sticks laid as an arrow). In the
//           forest a clearing (js/trees.js setClearing, as the tower crane's) round the camp, the Pfadi Davos flag on
//           its stick; the Spatz, its geometry posed from the held step (poseTent: the six cotton tarps laid out from
//           their bundles, buttoned, the ridge raised on the two wooden poles, the edges pegged, the guy lines
//           tensioned); the firewood on the forest floor and the pile by the fireplace; the fireplace (the stones, the
//           tinder, the kindling, the logs, each as its step is held); the gauge of the flint and steel and of the breath
//           (DOM); the sparks, the ember, the flames (additive particles), the smoke, the glow on the ground and on the
//           tent's cloth. (No real light: a new light in the scene would recompile every material of the town.)
// Everything goes with the run's group and its cleanups.

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (v) => v * v * (3 - 2 * v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const stepId = (run) => (run.phase === 'done' ? 'done' : PFADI_STEPS[run.index] || 'done');
const after = (run, id) => run.phase === 'done' || run.index > PFADI_STEPS.indexOf(id);
const mat = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.85, ...o });
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) Object.assign(e.style, css); if (text != null) e.textContent = text; return e; };
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// --- The tent's frame: x across, z along the ridge (+z the door, towards the fireplace), y up; on the forest floor -------
const T = PFADI.tent, TP = PFADI_PLACES.tent;
const COS = Math.cos(T.yaw), SIN = Math.sin(T.yaw);
const toWorld = (x, z) => ({ x: TP.x + x * COS + z * SIN, z: TP.z - x * SIN + z * COS });
const G0 = groundHeight(TP.x, TP.z);
/** A point of the tent's frame in the world: the cloth's foot on the ground under it, its top at the middle's height */
function tentPoint(x, y, z, out) {
  const w = toWorld(x, z);
  const g = groundHeight(w.x, w.z);
  return out.set(w.x, y + g + (G0 - g) * clamp(y / T.height, 0, 1), w.z);
}

// --- Small helpers ---------------------------------------------------------------------------------------------------
/** A stick of radius r from a to b (Vector3s) as a matrix for a unit cylinder along y (height 1, its foot at 0) */
function stickMatrix(a, b, r, out) {
  _n.subVectors(b, a);
  const len = _n.length() || 1e-6;
  _q.setFromUnitVectors(UP, _n.multiplyScalar(1 / len));
  return out.compose(a, _q, _s.set(r, len, r));
}
const unitStick = () => new THREE.CylinderGeometry(1, 1, 1, 6, 1).translate(0, 0.5, 0);
function tint(g, colour) {
  const c = new THREE.Color(colour), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** A merged mesh of sticks [[a, b, r, colour], …] (local coordinates), vertex colours under one material */
function sticks(list, material) {
  const parts = list.map(([a, b, r, colour]) => {
    const g = unitStick();
    g.applyMatrix4(stickMatrix(new THREE.Vector3(...a), new THREE.Vector3(...b), r, new THREE.Matrix4()));
    g.deleteAttribute('uv');
    return tint(g, colour);
  });
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  return m;
}
function radialTexture(stops) {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [k, col] of stops) grad.addColorStop(k, col);
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- The trail signs ---------------------------------------------------------------------------------------------------
function buildMarks(run) {
  const marks = trailMarks();
  const B = 0x6b4a2b, L = 0x8a6438;
  // three sticks: the shaft and the arrow's head, pointing along +z
  const geo = mergeGeometries([[[0, 0.03, -0.55], [0, 0.03, 0.55], 0.025, B], [[0, 0.03, 0.55], [-0.3, 0.03, 0.22], 0.022, L], [[0, 0.03, 0.55], [0.3, 0.03, 0.22], 0.022, L]].map(([a, b, r, colour]) => {
    const g = unitStick();
    g.applyMatrix4(stickMatrix(new THREE.Vector3(...a), new THREE.Vector3(...b), r, new THREE.Matrix4()));
    g.deleteAttribute('uv');
    return tint(g, colour);
  }));
  const stone = new THREE.DodecahedronGeometry(0.12, 0).translate(0.35, 0.06, -0.5);
  stone.deleteAttribute('uv');
  // (mergeGeometries wants all indexed or none: the dodecahedron is not, so the sticks go non-indexed too)
  const merged = mergeGeometries([geo.toNonIndexed(), tint(stone, 0x8c8a84)]);
  geo.dispose(); stone.dispose();
  const mesh = new THREE.InstancedMesh(merged, mat(0xffffff, { vertexColors: true }), marks.length);
  marks.forEach((k, i) => {
    groundNormal(k.x, k.z, _n);
    _q.setFromUnitVectors(UP, _n).multiply(new THREE.Quaternion().setFromAxisAngle(UP, k.heading));
    mesh.setMatrixAt(i, _m.compose(_p.set(k.x, groundHeight(k.x, k.z) + 0.01, k.z), _q, _s.set(1.5, 1.5, 1.5)));
  });
  mesh.name = 'PfadiTrailSigns';
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  run.group.add(run.storage(mesh));
}

// --- The Spatz ---------------------------------------------------------------------------------------------------------
// The cloth: each roof side a grid from the ridge (u = 0) to the eave (u = 1) and along the ridge (v), two tarps a side
// (their seam at v = 0.5); the ends two triangles (base to apex). Posed from the held step (poseTent).
const NU = 8, NV = 18, NR = 8;
const SEAMS = [1 / 3, 2 / 3]; // (three tarps a side: six in all)
// the Spatz's cotton in its usual sand-to-hazel brown, the seams and the door slit darker
const CLOTH = new THREE.Color(0x8c6c46), SEAM = new THREE.Color(0x5c4430), SLIT = new THREE.Color(0x2c2218);
function buildTent(run) {
  const verts = [], cols = [], idx = [];
  const grid = (nu, nv, kind, side) => {
    const base = verts.length;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      verts.push({ kind, side, u: i / nu, v: j / nv });
      const c = CLOTH.clone().multiplyScalar(0.92 + hash(base + i * 31 + j) * 0.12);
      if (kind === 'roof' && SEAMS.some((v) => Math.abs(j / nv - v) < 0.5 / nv)) c.lerp(SEAM, 0.65);
      if (kind === 'roof' && i === 0) c.lerp(SEAM, 0.5); // (the ridge's seam)
      if (kind === 'end' && side > 0 && Math.abs(j / nv - 0.5) < 0.04 && i < nu) c.copy(SLIT);
      cols.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = base + i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  };
  grid(NU, NV, 'roof', -1); grid(NU, NV, 'roof', 1);
  grid(NR, 12, 'end', -1); grid(NR, 12, 'end', 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts.length * 3), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  const cloth = new THREE.Mesh(geo, mat(0xffffff, { vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  cloth.material.emissive = new THREE.Color(0xff7a2a);
  cloth.material.emissiveIntensity = 0;
  cloth.castShadow = cloth.receiveShadow = true;
  cloth.frustumCulled = false;
  cloth.name = 'PfadiSpatz';
  // the buttons along the seams: the ridge, the tarps' two seams on each side, the four edges to the ends
  const buttons = [];
  for (let j = 0; j <= 18; j++) buttons.push({ seam: 'ridge', v: j / 18 });
  for (const v of SEAMS) for (const side of [-1, 1]) for (let i = 1; i <= 7; i++) buttons.push({ seam: 'mid', side, u: i / 8, v });
  for (const side of [-1, 1]) for (const end of [0, 1]) for (let i = 1; i <= 7; i++) buttons.push({ seam: 'edge', side, end, u: i / 8 });
  buttons.sort((a, b) => (a.seam === 'ridge' ? a.v : 2 + (a.u ?? 0)) - (b.seam === 'ridge' ? b.v : 2 + (b.u ?? 0)));
  const btnMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), mat(0x1a140c, { roughness: 0.5 }), buttons.length);
  // the poles (two), the pegs (eave eight, guy four), the guy lines (four, eight segments each)
  const wood = mat(0x9a7448, { roughness: 0.8 });
  const poles = new THREE.InstancedMesh(unitStick(), wood, 2);
  const pegs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.008, 0.36, 5).translate(0, 0.18, 0), mat(0xc9b089), 12);
  const SEG = 8;
  const lines = new THREE.InstancedMesh(unitStick(), mat(0xd8cfb8, { roughness: 0.9 }), 4 * SEG);
  for (const m of [btnMesh, poles, pegs, lines]) { m.frustumCulled = false; m.castShadow = true; }
  const group = new THREE.Group();
  group.add(cloth, btnMesh, poles, pegs, lines);
  run.group.add(run.storage(group));
  return { cloth, verts, buttons, btnMesh, poles, pegs, lines, SEG, posed: null };
}

/** The tent's shape from its step: { step, f } (js/missions-data-pfadi.js stepPhase of PFADI.tentSteps) */
function tentShape(ph) {
  const k = (i) => (ph.step > i ? 1 : ph.step === i ? ph.f : 0);
  return { lay: ease(k(0)), button: k(1), raise: ease(k(2)), peg: k(3), guys: ease(k(4)) };
}
const _w = new THREE.Vector3();
function poseTent(tent, ph) {
  const S = tentShape(ph), H = T.height, L = T.length, SL = Math.hypot(T.half, H);
  const h = H * S.raise, b = Math.sqrt(Math.max(0, SL * SL - h * h));
  const gap = 0.14 * (1 - S.button); // (the tarps apart until buttoned)
  const sag = (0.11 * (1 - S.guys) + 0.025) * S.raise; // (the ridge sags until the guy lines take it)
  const lift = 0.07 * (1 - S.peg) * S.raise; // (the eaves loose until pegged)
  // a point of the cloth in the tent's frame (laid out flat, raised, pegged), then folded towards its tarp's bundle
  const roof = (side, u, v, out) => {
    const z = (v - 0.5) * L + (v < 1 / 3 ? -gap : v > 2 / 3 ? gap : 0);
    const y = h * (1 - u) - sag * Math.sin(Math.PI * v) * (1 - u) + lift * u * (0.5 + 0.5 * Math.sin(v * 9 + side));
    out.set(side * (b * u + gap), y + 0.015, z);
    // the bundle: each of the six tarps rolled up at its own spot beside the tent
    const bx = side * 0.8, bz = (v < 1 / 3 ? -1.1 : v < 2 / 3 ? 0 : 1.1);
    out.x = bx + (out.x - bx) * (0.12 + 0.88 * S.lay);
    out.z = bz + (out.z - bz) * (0.12 + 0.88 * S.lay);
    out.y += 0.08 * (1 - S.lay) * (1 - u);
    return out;
  };
  const end = (side, r, t, out) => {
    // the triangle from its base (r = 0: from -b to +b at the end) to its apex; flat on the ground before the ridge rises
    const zEnd = side * (L / 2 + gap);
    const apexZ = zEnd + side * Math.sqrt(Math.max(0, H * H - h * h));
    const x = (t - 0.5) * 2 * (b + gap) * (1 - r);
    out.set(x, h * r + 0.015, zEnd + (apexZ - zEnd) * r);
    const bz = side * (L / 2 + 0.6);
    out.x = out.x * (0.12 + 0.88 * S.lay);
    out.z = bz + (out.z - bz) * (0.12 + 0.88 * S.lay);
    return out;
  };
  const pos = tent.cloth.geometry.attributes.position;
  for (let i = 0; i < tent.verts.length; i++) {
    const q = tent.verts[i];
    if (q.kind === 'roof') roof(q.side, q.u, q.v, _w); else end(q.side, q.u, q.v, _w);
    tentPoint(_w.x, _w.y, _w.z, _w);
    pos.setXYZ(i, _w.x, _w.y, _w.z);
  }
  pos.needsUpdate = true;
  tent.cloth.geometry.computeVertexNormals();
  tent.cloth.geometry.computeBoundingSphere();
  // the buttons: as many as the buttoning has got to, on the cloth
  const nb = Math.floor(tent.buttons.length * S.button + 1e-6);
  tent.buttons.forEach((bt, i) => {
    if (i >= nb) { tent.btnMesh.setMatrixAt(i, ZERO); return; }
    if (bt.seam === 'ridge') roof(1, 0, bt.v, _w);
    else if (bt.seam === 'mid') roof(bt.side, bt.u, bt.v, _w);
    else roof(bt.side, bt.u, bt.end, _w);
    _w.y += 0.012;
    tentPoint(_w.x, _w.y, _w.z, _w);
    tent.btnMesh.setMatrixAt(i, _m.makeTranslation(_w.x, _w.y, _w.z));
  });
  tent.btnMesh.instanceMatrix.needsUpdate = true;
  // the poles: from their foot at each end to the apex and 12 cm beyond (lying on the cloth before the ridge rises)
  const tops = [];
  [-1, 1].forEach((side, i) => {
    if (S.lay < 0.6) { tent.poles.setMatrixAt(i, ZERO); tops.push(null); return; }
    const zEnd = side * (L / 2 + 0.03);
    const apexZ = zEnd + side * Math.sqrt(Math.max(0, H * H - h * h));
    _a.set(0.25 * (1 - S.raise) * side, 0, zEnd);
    _b.set(0, h + 0.02, apexZ).sub(_a).setLength(H + 0.14).add(_a);
    const A = tentPoint(_a.x, Math.max(0.03, _a.y), _a.z, new THREE.Vector3()), B = tentPoint(_b.x, Math.max(0.04, _b.y), _b.z, new THREE.Vector3());
    tent.poles.setMatrixAt(i, stickMatrix(A, B, 0.035, _m));
    tops.push(B);
  });
  tent.poles.instanceMatrix.needsUpdate = true;
  // the pegs: the eave's eight one after another while pegging (driven from 25 cm up), the guy lines' four at their start
  const eave = [];
  for (const side of [-1, 1]) for (const v of [0, 1 / 3, 2 / 3, 1]) eave.push({ x: side * (b + 0.06), z: (v - 0.5) * L });
  const guyPegs = [{ x: 0, z: -(L / 2 + 2.2) }, { x: 0, z: L / 2 + 2.2 }, { x: -(b + 1.4), z: 0 }, { x: b + 1.4, z: 0 }];
  eave.forEach((p, i) => {
    const k = clamp(S.peg * eave.length - i, 0, 1);
    if (k <= 0) { tent.pegs.setMatrixAt(i, ZERO); return; }
    tentPoint(p.x, 0, p.z, _w);
    tent.pegs.setMatrixAt(i, _m.makeTranslation(_w.x, _w.y - 0.22 + 0.25 * (1 - ease(k)), _w.z));
  });
  guyPegs.forEach((p, i) => {
    const k = clamp(S.guys * 3, 0, 1);
    if (ph.step < 4) { tent.pegs.setMatrixAt(8 + i, ZERO); return; }
    tentPoint(p.x, 0, p.z, _w);
    tent.pegs.setMatrixAt(8 + i, _m.makeTranslation(_w.x, _w.y - 0.22 + 0.25 * (1 - k), _w.z));
  });
  tent.pegs.instanceMatrix.needsUpdate = true;
  // the guy lines: from the pole tops and from a third of the way down the roof to their pegs, slack until tensioned
  const from = [tops[0], tops[1], tentPoint(-b * 0.35, h * 0.65, 0, new THREE.Vector3()), tentPoint(b * 0.35, h * 0.65, 0, new THREE.Vector3())];
  const slack = 0.35 * (1 - S.guys);
  for (let g = 0; g < 4; g++) {
    const A = from[g];
    if (ph.step < 4 || !A) { for (let s = 0; s < tent.SEG; s++) tent.lines.setMatrixAt(g * tent.SEG + s, ZERO); continue; }
    const P = tentPoint(guyPegs[g].x, 0.06, guyPegs[g].z, new THREE.Vector3());
    for (let s = 0; s < tent.SEG; s++) {
      const u0 = s / tent.SEG, u1 = (s + 1) / tent.SEG;
      _a.lerpVectors(A, P, u0); _a.y -= slack * 4 * u0 * (1 - u0);
      _b.lerpVectors(A, P, u1); _b.y -= slack * 4 * u1 * (1 - u1);
      tent.lines.setMatrixAt(g * tent.SEG + s, stickMatrix(_a, _b, 0.009, _m));
    }
  }
  tent.lines.instanceMatrix.needsUpdate = true;
}

// --- The firewood, the pile, the fireplace ----------------------------------------------------------------------------
const BARK = 0x5a4330, SPLIT_WOOD = 0xc29a66, TWIG = 0x7a5c3e;
function woodGeometry(kind) {
  const list = kind === 'twigs'
    ? [0, 1, 2, 3, 4, 5].map((i) => [[-0.3 + hash(i) * 0.05, 0.04 + i * 0.012, -0.05 + hash(i + 3) * 0.1], [0.32, 0.03 + hash(i + 7) * 0.05, -0.06 + hash(i + 9) * 0.12], 0.008, TWIG])
    : kind === 'kindling'
      ? [0, 1, 2, 3].map((i) => [[-0.25, 0.03 + (i % 2) * 0.03, -0.06 + i * 0.04], [0.25, 0.03 + (i % 2) * 0.03, -0.06 + i * 0.04], 0.02, i % 2 ? SPLIT_WOOD : 0xa8814f])
      : [[[-0.32, 0.06, 0], [0.32, 0.06, 0], 0.055, BARK]];
  const parts = list.map(([a, b, r, colour]) => {
    const g = unitStick();
    g.applyMatrix4(stickMatrix(new THREE.Vector3(...a), new THREE.Vector3(...b), r, new THREE.Matrix4()));
    g.deleteAttribute('uv');
    return tint(g, colour);
  });
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}
const PILE = { x: 0.4, z: 1.25 }; // the pile beside the fireplace (in the tent's frame from the fire: across, along)
function buildWood(run) {
  const material = mat(0xffffff, { vertexColors: true });
  const items = run.state.wood.map((w) => {
    const m = new THREE.Mesh(woodGeometry(w.kind), material);
    m.castShadow = true;
    groundNormal(w.x, w.z, _n);
    m.quaternion.setFromUnitVectors(UP, _n).multiply(new THREE.Quaternion().setFromAxisAngle(UP, hash(w.i + 20) * Math.PI));
    m.position.set(w.x, groundHeight(w.x, w.z), w.z);
    m.scale.setScalar(1.6); // (bigger than life: they have to be found on a screen, as the mushrooms)
    run.group.add(m);
    // the same piece in the pile by the fireplace, shown once it is picked
    const p = new THREE.Mesh(m.geometry, material);
    const F = PFADI_PLACES.fire, kinds = { twigs: 0, kindling: 1, log: 2 };
    const across = 1.3 + kinds[w.kind] * 0.18, along = -0.35 + (w.i % 3) * 0.3;
    const x = F.x + across * COS + along * SIN, z = F.z - across * SIN + along * COS;
    p.position.set(x, groundHeight(x, z) + (w.kind === 'log' ? (w.i % 3) * 0.05 : 0), z);
    p.rotation.y = T.yaw + (w.kind === 'log' ? 0 : 0.3);
    p.castShadow = true;
    p.visible = false;
    run.group.add(p);
    return { item: m, pile: p };
  });
  return items;
}

function buildFireplace(run) {
  const F = PFADI_PLACES.fire, y = groundHeight(F.x, F.z);
  const g = new THREE.Group();
  g.position.set(F.x, y, F.z);
  groundNormal(F.x, F.z, _n);
  g.quaternion.setFromUnitVectors(UP, _n);
  run.group.add(g);
  const stones = [];
  const stoneMat = mat(0x7d7b74, { roughness: 0.95 });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2, r = 0.55;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11 + hash(i) * 0.05, 0), stoneMat);
    s.scale.set(1.2, 0.7, 1);
    s.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
    s.rotation.set(hash(i + 1) * 3, a, hash(i + 2));
    s.castShadow = true;
    g.add(s);
    stones.push({ mesh: s, y: 0.05 });
  }
  const tinder = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.05, 6, 10).rotateX(Math.PI / 2), mat(0xc8a768, { roughness: 1 }));
  tinder.position.y = 0.04;
  g.add(tinder);
  const charMat = mat(0xffffff, { vertexColors: true });
  charMat.emissive = new THREE.Color(0xff5a10);
  charMat.emissiveIntensity = 0;
  const tipi = (n, len, r, top, colour, phase) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + phase;
    const m = sticks([[[Math.cos(a) * len * 0.55, 0.0, Math.sin(a) * len * 0.55], [Math.cos(a) * 0.02, top, Math.sin(a) * 0.02], r, colour]], charMat);
    g.add(m);
    return m;
  });
  const kindling = tipi(7, 0.42, 0.013, 0.36, SPLIT_WOOD, 0.2);
  const logs = tipi(4, 0.8, 0.045, 0.5, BARK, 0.6);
  // the ember in the tinder, the glow on the ground
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicNodeMaterial({ color: 0xff6a1a, transparent: true, opacity: 0 }));
  ember.position.y = 0.06;
  g.add(ember);
  // (a grid draped over the forest floor, its texture a soft falloff: no edge where a flat plane would cut the slope)
  const glowMat = new THREE.MeshBasicNodeMaterial({ map: radialTexture([[0, 'rgba(255,165,85,1)'], [0.12, 'rgba(255,140,60,0.75)'], [0.3, 'rgba(255,115,40,0.35)'], [0.5, 'rgba(255,100,30,0.14)'], [0.72, 'rgba(255,90,25,0.04)'], [1, 'rgba(255,90,20,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const R = 3.5, glowGeo = new THREE.PlaneGeometry(2 * R, 2 * R, 14, 14).rotateX(-Math.PI / 2);
  const gp = glowGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) { const x = F.x + gp.getX(i), z = F.z + gp.getZ(i); gp.setXYZ(i, x, groundHeight(x, z) + 0.05, z); }
  glowGeo.computeBoundingSphere();
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.renderOrder = 5;
  glow.frustumCulled = false;
  run.group.add(glow);
  return { group: g, stones, tinder, kindling, logs, ember, glow, charMat, y };
}

function poseFireplace(fp, ring) {
  const ph = stepPhase(ring, PFADI.ringSteps);
  const k = (i) => (ph.step > i ? 1 : ph.step === i ? ph.f : 0);
  fp.stones.forEach((s, i) => {
    const v = clamp(k(0) * fp.stones.length - i, 0, 1);
    s.mesh.visible = v > 0;
    s.mesh.position.y = s.y + 0.35 * (1 - ease(v));
  });
  fp.tinder.visible = k(1) > 0;
  fp.tinder.scale.setScalar(0.2 + 0.8 * ease(k(1)));
  fp.kindling.forEach((m, i) => { const v = clamp(k(2) * fp.kindling.length - i, 0, 1); m.visible = v > 0; m.scale.setScalar(0.3 + 0.7 * ease(v)); });
  fp.logs.forEach((m, i) => { const v = clamp(k(3) * fp.logs.length - i, 0, 1); m.visible = v > 0; m.scale.setScalar(0.4 + 0.6 * ease(v)); });
}

// --- The flag: a stick with the Pfadi Davos logo on a red pennant ---------------------------------------------------------
function buildFlag(run) {
  const x0 = -2.7, z0 = 2.6; // (in the tent's frame: beside its door)
  const w = toWorld(x0, z0), y = groundHeight(w.x, w.z);
  const g = new THREE.Group();
  g.position.set(w.x, y, w.z);
  g.rotation.y = T.yaw + Math.PI / 2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 2.1, 6).translate(0, 1.05, 0), mat(0x8e6a42));
  pole.castShadow = true;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = '#e55447'; x.fillRect(0, 0, 256, 192);
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(128, 96, 78, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => { x.drawImage(img, 68, 36, 120, 120); tex.needsUpdate = true; };
  img.src = run.def.logo;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46, 8, 1).translate(0.33, 1.8, 0), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
  flag.castShadow = true;
  g.add(pole, flag);
  run.group.add(g);
  return flag;
}

// --- The gauge (DOM): the flint and steel's needle and its green; the ember and the breath --------------------------------
function buildGauge(run) {
  const box = el('div', {
    position: 'fixed', right: '22px', bottom: '200px', zIndex: 14, pointerEvents: 'none', display: 'none',
    padding: '10px 14px 12px', borderRadius: '14px', background: 'rgba(12,16,24,0.72)', backdropFilter: 'blur(6px)', color: '#fff',
    font: '700 12px/1.2 system-ui, sans-serif', letterSpacing: '0.08em', width: '300px'
  });
  const row = (label, green) => {
    const wrap = el('div', { margin: '4px 0 8px' });
    const name = el('div', { opacity: '0.85', marginBottom: '5px' }, label);
    const bar = el('div', { position: 'relative', height: '14px', borderRadius: '7px', background: 'rgba(255,255,255,0.14)', overflow: 'hidden' });
    if (green) bar.append(el('div', { position: 'absolute', top: 0, bottom: 0, left: `${green[0] * 100}%`, width: `${(green[1] - green[0]) * 100}%`, background: '#3fd66b' }));
    const fill = el('div', { position: 'absolute', top: 0, bottom: 0, left: 0, width: '0%', background: 'linear-gradient(90deg,#ff8a2a,#ffd166)' });
    const mark = el('div', { position: 'absolute', top: '-2px', bottom: '-2px', width: '4px', marginLeft: '-2px', left: '0%', background: '#fff', borderRadius: '2px', boxShadow: '0 0 6px #fff' });
    bar.append(fill, mark);
    wrap.append(name, bar);
    box.append(wrap);
    return { wrap, fill, mark, name };
  };
  const S = PFADI.strike;
  const flint = row('FLINT AND STEEL', [S.lo, S.hi]);
  const ember = row('EMBER');
  const breath = row('BREATH');
  document.body.append(box);
  run.cleanups.push(() => box.remove());
  return { box, flint, ember, breath };
}

// --- The feature -------------------------------------------------------------------------------------------------------
const LABELS = { tent: 'Hold', wood: 'Pick up', ring: 'Hold', spark: 'Strike', blow: 'Blow' };
const pfadi = {
  setup(run) {
    run.state = run.def.createState(); // (the props are built from it; setup() makes a fresh one before reset)
    buildMarks(run);
    const pf = run.pf = {
      tent: buildTent(run), fireplace: buildFireplace(run), flag: buildFlag(run), gauge: buildGauge(run), toast: createToast(run),
      keyHold: false, touchHold: false, pressed: false, wasTouch: false, trees: null, cleared: false, tentKey: '', flicker: 0, spawn: 0, smoke: 0,
      flames: null, stage: null, person: run.hooks.controllerManager.entities.person, camSaved: null
    };
    pf.woodMeshes = buildWood(run);
    const flames = pf.flames = new ParticleBatch(run.scene);
    flames.mesh.material.blending = THREE.AdditiveBlending;
    flames.mesh.name = 'PfadiFlames';
    run.storage(flames.mesh);
    run.cleanups.push(() => flames.dispose());
    // the logo in the HUD's head (js/missions.js shows it in the briefing too: def.logo)
    const head = run.ui.title?.parentNode;
    if (head) {
      const logo = el('img', { height: '26px', width: '26px', marginRight: '6px', verticalAlign: 'middle', flex: '0 0 auto' });
      logo.src = run.def.logo; logo.alt = 'Pfadi Davos logo';
      head.prepend(logo);
    }
    // Space / E: held for the work, pressed for the strikes (taken from the jump); the touch button the same
    run.listen(window, 'keyup', (e) => { if (e.code === 'Space' || e.code === 'KeyE') pf.keyHold = false; }, { capture: true });
    run.listen(window, 'blur', () => { pf.keyHold = false; pf.touchHold = false; });
    run.button('up', null);
    run.actions(Object.entries(LABELS).map(([id, label]) => ({
      id: `pfadi-${id}`, kind: 'hold', primary: true, label, icon: id === 'spark' || id === 'blow' ? 'i-fire' : 'i-hand', keys: ['Space', 'KeyE'], kbd: ['Space'], keyboard: false, pad: 'a',
      when: () => stepId(run) === id, run: (on) => { if (on && !pf.touchHold) pf.pressed = true; pf.touchHold = on; }
    })));
    run.cleanups.push(() => pfadi.clearing(run, false));
  },
  reset(run) {
    const pf = run.pf;
    pf.keyHold = pf.touchHold = pf.pressed = false;
    pf.tentKey = '';
    pf.stage = null;
    pf.toast.hide();
    for (const w of pf.woodMeshes) { w.item.visible = true; w.pile.visible = false; }
    pf.flames.particles.length = 0;
    pf.gauge.box.style.display = 'none';
    poseTent(pf.tent, stepPhase(run.state.tent, PFADI.tentSteps));
    poseFireplace(pf.fireplace, run.state.ring);
  },
  key(run, e) {
    if (e.code !== 'Space' && e.code !== 'KeyE') return;
    if (run.phase === 'intro') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat && !run.pf.keyHold) run.pf.pressed = true;
    run.pf.keyHold = true;
  },
  teardown(run) { pfadi.clearing(run, false); pfadi.workCamera(run, false); },
  /** At the work the chase camera stands back and higher: the tent or the fireplace over the walker's shoulder */
  workCamera(run, on) {
    const pf = run.pf, p = pf?.person;
    if (!p || !!pf.camSaved === on) return;
    if (on) { pf.camSaved = { d: p.chaseDistance, h: p.chaseHeight }; p.chaseDistance = 6.8; p.chaseHeight = 3.6; }
    else { p.chaseDistance = pf.camSaved.d; p.chaseHeight = pf.camSaved.h; pf.camSaved = null; }
  },
  /** The camp's clearing in the tree field (js/trees.js), while the run lasts */
  clearing(run, on) {
    const pf = run.pf;
    if (!pf) return;
    if (on && !pf.trees) pf.trees = run.scene?.getObjectByName('Trees')?.userData.field || null;
    if (!pf.trees || pf.cleared === on) return;
    pf.cleared = on;
    pf.trees.setClearing(on ? { x: PFADI_PLACES.camp.x, z: PFADI_PLACES.camp.z, r: 11.5 } : null);
  },
  update(run, ctx, dt) {
    const pf = run.pf, st = run.state;
    if (!st) return;
    pfadi.clearing(run, !run.disposed);
    pf.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
    const id = stepId(run);
    if (id !== pf.stage) { pf.stage = id; run.hooks.actions?.notify(); }
    pfadi.workCamera(run, live(run) && (id === 'tent' ? st.nearTent : (id === 'ring' || id === 'spark' || id === 'blow') && st.nearFire));
    const hold = !!(pf.keyHold || pf.touchHold);
    const press = pf.pressed;
    pf.pressed = false;
    if (live(run) && ctx.mode === 'person' && id !== 'done') {
      const events = stepCamp(st, id, { x: ctx.x, z: ctx.z, hold, press }, dt);
      for (const ev of events) pfadi.event(run, ev);
    }
    // the gauge
    const G = pf.gauge;
    const showFlint = id === 'spark' && st.nearFire, showBlow = id === 'blow' && st.nearFire && !st.blow.caught;
    G.box.style.display = showFlint || showBlow ? 'block' : 'none';
    G.flint.wrap.style.display = showFlint ? 'block' : 'none';
    G.breath.wrap.style.display = showBlow ? 'block' : 'none';
    if (showFlint) { G.flint.mark.style.left = `${needle(st.flint.t) * 100}%`; G.ember.fill.style.width = `${st.flint.ember * 100}%`; }
    if (showBlow) {
      G.ember.fill.style.width = `${st.blow.glow * 100}%`;
      G.breath.fill.style.width = `${(st.blow.breath / PFADI.blow.breath) * 100}%`;
      G.breath.fill.style.background = st.blow.out ? '#ff5a4a' : 'linear-gradient(90deg,#7ec8ff,#d8f0ff)';
    }
    G.ember.mark.style.display = 'none';
    G.breath.mark.style.display = 'none';
  },
  event(run, ev) {
    const pf = run.pf, F = PFADI_PLACES.fire;
    if (ev.type === 'step' && ev.last) pf.toast.show(ev.id === 'guys' ? 'The Spatz stands!' : 'The fireplace is ready', '#c8f0a0', 1.6);
    if (ev.type === 'picked') {
      const w = pf.woodMeshes[ev.i];
      w.item.visible = false; w.pile.visible = true;
      pf.keyHold = pf.touchHold = false; // (one at a time: Space again for the next)
      pf.toast.show(ev.kind === 'twigs' ? 'Dry twigs ✓' : ev.kind === 'kindling' ? 'Kindling ✓' : 'A log ✓', '#f3d9a4', 0.9);
    }
    if (ev.type === 'strike') {
      const y = pf.fireplace.y + 0.1;
      const n = ev.good ? 26 : 8;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * (ev.good ? 2.2 : 1.2);
        pf.flames.spawn({ x: F.x + Math.cos(a) * 0.05, y: y + 0.25, z: F.z + Math.sin(a) * 0.05, vx: Math.cos(a) * s, vy: ev.good ? -0.5 + Math.random() * 2 : 1 + Math.random(), vz: Math.sin(a) * s, gravity: 7, drag: 1.5, life: 0.25 + Math.random() * 0.35, size0: 0.05, size1: 0.02, alpha: 1, r: 3.2, g: 2.2, b: 0.9, kind: 'spark' });
      }
      if (!ev.good) pf.toast.show('Missed the steel', '#ffb3a8', 0.8);
      else if (!run.state.flint.lit) pf.toast.show('Sparks in the tinder!', '#ffd28a', 0.8);
      run.audio?.live && click(run, ev.good);
    }
    if (ev.type === 'lit') pf.toast.show('An ember in the tinder!', '#ffb066', 1.4);
    if (ev.type === 'out') pf.toast.show('Out of breath', '#a8d8ff', 0.9);
    if (ev.type === 'caught') pf.toast.show('It catches!', '#ffcf6a', 1.6);
  },
  after(run, ctx, dt) {
    const pf = run.pf, st = run.state;
    if (!st) return;
    // the tent, posed when its step moved
    const ph = stepPhase(st.tent, PFADI.tentSteps);
    const key = `${ph.step}:${ph.f.toFixed(3)}`;
    if (key !== pf.tentKey) { pf.tentKey = key; poseTent(pf.tent, ph); }
    poseFireplace(pf.fireplace, st.ring);
    pfadi.fire(run, ctx, dt);
    pf.flames.update(dt, ctx.camera);
  },
  /** The ember, the flames, the smoke, the glow: from the flint's ember, the breath's glow, the fire's level */
  fire(run, ctx, dt) {
    const pf = run.pf, st = run.state, fp = pf.fireplace, F = PFADI_PLACES.fire;
    const b = st.blow, fire = run.index >= PFADI_STEPS.indexOf('blow') || run.phase === 'done' ? (b.caught ? 0.3 + 0.7 * b.fire : 0) : 0;
    const ember = b.caught ? 1 : run.index >= PFADI_STEPS.indexOf('blow') ? b.glow : st.flint.ember;
    pf.flicker += dt * (8 + Math.random() * 6);
    const fl = 0.82 + 0.12 * Math.sin(pf.flicker) + 0.08 * Math.sin(pf.flicker * 2.7 + 1);
    fp.ember.material.opacity = ember > 0.02 ? clamp(ember * (b.blowing ? 1 : 0.75) * fl, 0, 1) : 0;
    fp.ember.scale.setScalar(0.6 + ember * 0.8);
    fp.charMat.emissiveIntensity = fire * 0.5 * fl;
    fp.glow.material.opacity = clamp((fire * 0.55 + ember * 0.1) * fl, 0, 1);
    pf.tent.cloth.material.emissiveIntensity = fire * 0.035 * fl; // (a warm touch on the brown cotton, not an orange tent)
    const y = fp.y + 0.08;
    // the flames: a column of additive puffs, yellow at the core, orange to red as they rise and shrink
    if (fire > 0) {
      pf.spawn += dt * (25 + 55 * fire);
      while (pf.spawn >= 1) {
        pf.spawn--;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (0.12 + 0.22 * fire), core = Math.random() < 0.45;
        pf.flames.spawn({ x: F.x + Math.cos(a) * r, y: y + 0.05 + Math.random() * 0.12, z: F.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 0.6, vy: 0.9 + Math.random() * (0.6 + fire), vz: -Math.sin(a) * r * 0.6, life: 0.35 + Math.random() * (0.3 + 0.35 * fire), size0: (core ? 0.32 : 0.45) * (0.6 + 0.7 * fire), size1: 0.04, alpha: core ? 0.75 : 0.55, r: core ? 2.6 : 2.2, g: core ? 1.7 : 0.75, b: core ? 0.55 : 0.12, kind: 'flame' });
      }
      // now and then a spark flying up
      if (Math.random() < dt * 3 * fire) pf.flames.spawn({ x: F.x, y: y + 0.4, z: F.z, vx: (Math.random() - 0.5) * 0.8, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 0.8, gravity: 0.6, life: 1 + Math.random(), size0: 0.04, size1: 0.02, alpha: 1, r: 3, g: 1.8, b: 0.6, kind: 'spark' });
    } else if (ember > 0.05 && Math.random() < dt * (b.blowing ? 14 : 3)) {
      // the ember's glow in the tinder: a few tiny sparks while blowing
      pf.flames.spawn({ x: F.x + (Math.random() - 0.5) * 0.08, y: y, z: F.z + (Math.random() - 0.5) * 0.08, vy: 0.3 + Math.random() * (b.blowing ? 1.2 : 0.3), vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3, life: 0.3 + Math.random() * 0.3, size0: 0.1, size1: 0.03, alpha: 0.9, r: 2.4, g: 0.9, b: 0.2, kind: 'spark' });
    }
    // the smoke: thick and pale while it catches, thinner once it burns
    const smoke = fire > 0 ? 2 + 2 * (1 - b.fire) : ember > 0.3 ? 1.2 : 0;
    pf.smoke += dt * smoke;
    if (pf.smoke >= 1) {
      pf.smoke = 0;
      const pb = particles(run), k = 0.55 + Math.random() * 0.15 + (fire > 0 ? 0 : 0.2);
      pb.spawn({ x: F.x + (Math.random() - 0.5) * 0.3, y: y + 0.6 + fire * 0.4, z: F.z + (Math.random() - 0.5) * 0.3, vx: 0.15 + (Math.random() - 0.5) * 0.3, vy: 0.55 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.3, life: 4 + Math.random() * 2, size0: 0.4, size1: 3.2, alpha: fire > 0 ? 0.32 : 0.22, r: k, g: k, b: k * 1.02, kind: 'smoke' });
    }
  }
};

/** The strike's sound: a short metallic click, brighter for a good one */
function click(run, good) {
  const a = run.audio, ctx = a.audio.context, t = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.18));
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; f.type = 'highpass'; f.frequency.value = good ? 3200 : 1800; g.gain.value = good ? 0.35 : 0.2;
  src.connect(f).connect(g).connect(a.audio.mix);
  src.start(t);
}

export const PFADI_FEATURES = { pfadi };
