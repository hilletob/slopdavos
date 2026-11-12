// js/missions-paraglide.js
// The runtime of js/missions-data-paraglide.js, as a feature of js/missions.js (PARAGLIDE_FEATURES, merged into its FEATURES):
//   paraglider — the flight: the controllers' personDriver steps the flight model (the keys or the touch stick: A/D steer,
//                W the speed bar, S the brakes, Space the flare) and places the walker; their personPoser seats it in the
//                harness under the wing (the skinned PersonRig's bones written here), or lets it walk and run on the ground.
//                The wing: a curved canopy of cells in colours with its lines (one mesh and one line set, swung with the
//                bank). Over every thermal a cumulus at the cloud base and choughs circling in it, one at the pilot's height;
//                a windsock and a cross on the landing field at Glaris, both socks in the wind; the vario (its own instrument at the
//                right, like the pilots' on the riser: the altimeter, the climb, the speed over the ground, the wind) that beeps
//                in lift, buzzes softly near it and moans in strong sink; the HUD at the bottom (airtime, distance, points).
// The camera is the chase camera following the walker, pulled back and up while flying. Everything goes with the run's
// group and its cleanups (MissionRun.dispose).
// The free flight (js/paraglide-free.js, with the licence) runs the same feature on a run of its own: `run.free` (no
// landing field, no windsocks, no points), `run.thermalList` (the thermals the clouds and birds stand over) and
// `run.thermals` (those that work now, the time of day's: [] at night).
import * as THREE from 'three/webgpu';
import { groundHeight } from './terrain.js';
import { QUALITY } from './quality.js';
import { t } from './i18n.js';
import { touchLabel } from './missions-ice.js';
import { PG, LAUNCH, FIELD, THERMALS, H0, stepFlight, flightScore, thermalCentre, windAt, onGround } from './missions-data-paraglide.js';

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const touch = () => !!globalThis.document?.body?.classList.contains('touch-enabled');
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);

const STYLE = `
.pg-hud { position: fixed; left: 50%; bottom: max(54px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 12;
  display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 12px; pointer-events: none; font-size: 12px; }
.pg-hud[hidden] { display: none; }
.pg-row { display: flex; gap: 12px; align-items: flex-end; }
.pg-cell { display: flex; flex-direction: column; align-items: center; min-width: 52px; }
.pg-k { font-size: 10px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.06em; }
.pg-v { white-space: nowrap; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.15; }
.pg-u { font-size: 10px; opacity: 0.75; }
.pg-vario .pg-v.is-up { color: #5be08c; } .pg-vario .pg-v.is-down { color: #ff8a6b; }
.pg-bar { position: relative; width: 240px; height: 8px; border-radius: 4px; background: rgba(255,255,255,0.14); overflow: hidden; }
.pg-bar span { position: absolute; top: 0; bottom: 0; left: 50%; width: 0; }
.pg-bar span.is-up { background: #5be08c; } .pg-bar span.is-down { background: #ff8a6b; }
.pg-bar::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; background: #fff; }
.pg-flash { font-size: 15px; font-weight: 800; min-height: 18px; color: #ffc83d; }
.pg-instr { position: fixed; right: 16px; top: 50%; transform: translateY(-50%); z-index: 12; width: 176px; padding: 10px 12px 9px;
  pointer-events: none; border-radius: 14px; background: linear-gradient(#20262b, #14181c); color: #e9f2ea; border: 2px solid #3a434b;
  box-shadow: 0 6px 18px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.05); font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
.pg-instr[hidden] { display: none; }
.pg-instr-top { display: flex; justify-content: space-between; align-items: center; font-size: 9px; letter-spacing: 0.12em; opacity: 0.7; }
.pg-led { width: 9px; height: 9px; border-radius: 50%; background: #2d3a31; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4); }
.pg-led.on { background: #6dff9b; box-shadow: 0 0 8px #6dff9b; } .pg-led.sink { background: #ff7a5c; box-shadow: 0 0 8px #ff7a5c; }
.pg-instr-main { display: flex; gap: 8px; align-items: stretch; margin-top: 4px; }
.pg-vbar { position: relative; width: 12px; border-radius: 3px; background: #0b0e10; overflow: hidden; }
.pg-vbar::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: rgba(255,255,255,0.6); }
.pg-vbar span { position: absolute; left: 1px; right: 1px; }
.pg-vbar span.is-up { background: #5be08c; } .pg-vbar span.is-down { background: #ff8a6b; }
.pg-instr-vals { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.pg-i-k { font-size: 9px; opacity: 0.65; letter-spacing: 0.06em; text-transform: uppercase; }
.pg-i-alt { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.05; }
.pg-i-alt small, .pg-i-climb small { font-size: 10px; font-weight: 600; opacity: 0.7; margin-left: 2px; }
.pg-i-climb { font-size: 19px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.pg-i-climb.is-up { color: #5be08c; } .pg-i-climb.is-down { color: #ff8a6b; }
.pg-instr-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.1); }
.pg-i-v { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.pg-instr-foot .pg-i-k { white-space: nowrap; }
.pg-arrow { display: inline-block; width: 16px; height: 16px; line-height: 16px; text-align: center; font-size: 16px; font-weight: 900; color: #8fd3ff; transform-origin: 50% 50%; }
body.touch-enabled .pg-hud { bottom: calc(max(12px, env(safe-area-inset-bottom)) + var(--touch-clear, 200px)); }
@media (max-width: 820px) {
  .pg-hud { padding: 6px 8px; gap: 4px; }
  .pg-row { gap: 6px; } .pg-cell { min-width: 40px; } .pg-v { font-size: 15px; } .pg-k { font-size: 8px; white-space: nowrap; letter-spacing: 0.02em; }
  .pg-bar { width: 180px; }
  .pg-instr { right: 10px; width: 124px; padding: 7px 9px; } .pg-instr-foot { grid-template-columns: 1fr; gap: 1px; } .pg-i-alt { font-size: 19px; } .pg-i-climb { font-size: 16px; } .pg-i-v { font-size: 11px; }
  body.touch-enabled .pg-hud { bottom: auto; top: calc(max(12px, env(safe-area-inset-top)) + 178px); }
  body.touch-enabled .pg-instr { transform: none; top: calc(max(12px, env(safe-area-inset-top)) + 268px); } /* (under the HUD, clear of the stick) */
}
`;
function ensureStyle() {
  if (document.getElementById('pg-style')) return;
  const s = document.createElement('style');
  s.id = 'pg-style';
  s.textContent = STYLE;
  document.head.append(s);
}

// --- The wing --------------------------------------------------------------------------------------------------------------
// In its own frame: the origin between the two carabiners, +y up the lines, +z forward, +x the pilot's left.
const WING = { radius: 6.9, half: 1.0, cells: 30, chord: 2.75, tipChord: 1.35, thickness: 0.15, profile: 10 };
// the cells' colours from the left tip to the right: blue tips, a white band, orange and the sun-yellow centre
const CELL_COLOURS = (i, n) => {
  const u = Math.abs((i + 0.5) / n - 0.5) * 2; // 0 in the middle, 1 at the tips
  if (u > 0.78) return 0x1d4fa8;
  if (u > 0.62) return 0xf4f2ea;
  if (u > 0.2) return i % 2 ? 0xef6a1f : 0xe2541a;
  return 0xf5c21b;
};
const _col = new THREE.Color();
function wingRib(theta) {
  const k = theta / WING.half, c = WING.chord + (WING.tipChord - WING.chord) * k * k;
  return { cx: WING.radius * Math.sin(theta), cy: WING.radius * Math.cos(theta), nx: Math.sin(theta), ny: Math.cos(theta), c, le: 0.32 * c };
}
/** A point of the airfoil at `u` (0 the leading edge .. 1 the trailing edge), on the upper (side 1) or lower (-1) skin */
function airfoil(rib, u, side, out) {
  const y = 5 * WING.thickness * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4);
  const camber = 0.045 * Math.sin(Math.PI * Math.min(1, u * 1.15));
  const off = (camber + (side > 0 ? y : -0.55 * y)) * rib.c;
  out[0] = rib.cx + rib.nx * off; out[1] = rib.cy + rib.ny * off; out[2] = rib.le - u * rib.c;
  return out;
}
function buildWing() {
  const n = WING.cells, m = WING.profile, pos = [], col = [];
  const us = Array.from({ length: m + 1 }, (_, j) => (1 - Math.cos((j / m) * Math.PI)) / 2);
  const ribs = Array.from({ length: n + 1 }, (_, i) => wingRib(-WING.half + (2 * WING.half * i) / n));
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
  const quad = (p, q, r, s, hex) => {
    pos.push(...p, ...q, ...r, ...p, ...r, ...s);
    _col.setHex(hex);
    for (let k = 0; k < 6; k++) col.push(_col.r, _col.g, _col.b);
  };
  for (let i = 0; i < n; i++) {
    const top = CELL_COLOURS(i, n);
    const under = new THREE.Color(top).multiplyScalar(0.72).getHex();
    for (let j = 0; j < m; j++) {
      for (const side of [1, -1]) {
        airfoil(ribs[i], us[j], side, a); airfoil(ribs[i + 1], us[j], side, b);
        airfoil(ribs[i + 1], us[j + 1], side, c); airfoil(ribs[i], us[j + 1], side, d);
        quad([...a], [...b], [...c], [...d], side > 0 ? top : under);
      }
    }
    // the cell's opening at the leading edge, dark
    airfoil(ribs[i], 0.03, 1, a); airfoil(ribs[i + 1], 0.03, 1, b); airfoil(ribs[i + 1], 0.03, -1, c); airfoil(ribs[i], 0.03, -1, d);
    quad([...a], [...b], [...c], [...d], 0x2a1d14);
  }
  // the tips closed
  for (const i of [0, n]) for (let j = 0; j < m; j++) {
    airfoil(ribs[i], us[j], 1, a); airfoil(ribs[i], us[j + 1], 1, b); airfoil(ribs[i], us[j + 1], -1, c); airfoil(ribs[i], us[j], -1, d);
    quad([...a], [...b], [...c], [...d], CELL_COLOURS(i ? n - 1 : 0, n));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const canopy = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
  canopy.castShadow = !QUALITY.mobile;
  // the lines: from the risers (a hand's width either side of the origin) to the A, B, C rows and the trailing edge's brakes
  const lines = [];
  const riser = (x) => [x * 0.24, 0.35, 0.05];
  for (let i = 0; i <= n; i += 3) {
    const r = ribs[i], side = r.cx >= 0 ? 1 : -1, root = riser(side);
    for (const u of [0.1, 0.35, 0.62]) { airfoil(r, u, -1, a); lines.push(...root, ...a); }
    if (Math.abs(r.cx) > 1.8) { airfoil(r, 1, -1, a); lines.push(side * 0.3, 0.2, -0.05, ...a); }
  }
  // the risers down to the carabiners
  for (const s of [1, -1]) lines.push(...riser(s), s * 0.2, 0, 0);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const lineSet = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3a3a40 }));
  const group = new THREE.Group();
  group.add(canopy, lineSet);
  group.rotation.order = 'YXZ';
  canopy.frustumCulled = lineSet.frustumCulled = false;
  return group;
}

// --- The pilot in the harness ------------------------------------------------------------------------------------------------
// (the bones as js/missions-ice.js poseSkater writes them: js/pedestrians.js PersonRig, the same constants)
const BONE = { PELVIS: 0, CHEST: 1, HEAD: 2 };
const LIMB = { upperArm: [3, 5], forearm: [4, 6], thigh: [7, 11], foot: [9, 13], toe: [10, 14] };
const SIDES = [1, -1];
const ARM_BIND_ABDUCTION = 0.14;
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const qX = (o, a) => o.setFromAxisAngle(AX, a), qZ = (o, a) => o.setFromAxisAngle(AZ, a);
const _q = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _qC = new THREE.Quaternion(), _qH = new THREE.Quaternion(), _qU = new THREE.Quaternion(), _qF = new THREE.Quaternion();
const _pel = new THREE.Vector3(), _ch = new THREE.Vector3(), _v = new THREE.Vector3(), _sh = new THREE.Vector3(), _hip = new THREE.Vector3(), _t = new THREE.Vector3(), _an = new THREE.Vector3();
/**
 * Seated in the harness under the carabiners at `C`, the whole of it turned by `Q` (heading, bank, pitch): leaning back a
 * little, the legs out in front (down for the landing, `legsDown` 0-1), the hands up at the brake handles (pulled down by `brakes`
 * [left, right], 0-1). Returns the pelvis' and the head's joints (the harness and the helmet follow them).
 */
export function poseHarness(rig, C, Q, yaw, brakes, legsDown, out) {
  const s = rig.s, j = rig.bind;
  rig.x = C.x; rig.z = C.z; rig.yaw = yaw; rig.placed = true; rig.gait = 0; rig.run = 0; rig.speed = 0;
  _pel.set(0, -0.42 - 0.12 * legsDown, -0.04).applyQuaternion(Q).add(C);
  rig.pelvisY = _pel.y;
  _qP.copy(Q).multiply(qX(_q, -0.32 + 0.3 * legsDown));
  rig.writeBone(BONE.PELVIS, _qP, _pel);
  _qC.copy(_qP).multiply(qX(_q, 0.12));
  _ch.copy(j[BONE.CHEST]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qP).add(_pel);
  rig.writeBone(BONE.CHEST, _qC, _ch);
  _qH.copy(Q).multiply(qX(_q, 0.08));
  _v.copy(j[BONE.HEAD]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qC).add(_ch);
  rig.writeBone(BONE.HEAD, _qH, _v);
  out.head.copy(_v); out.headQ.copy(_qH); out.pelvis.copy(_pel); out.pelvisQ.copy(_qP);
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i], pull = brakes[i];
    // the upper arm raised forward and up, the elbow bent: the brake handle by the riser; pulled, down to the hip
    const flex = 2.55 - 1.7 * pull, elbow = 1.1 - 0.6 * pull, abd = 0.32 - 0.12 * pull;
    _sh.copy(j[LIMB.upperArm[i]]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qC).add(_ch);
    _qU.copy(_qC).multiply(qZ(_q, side * (abd - ARM_BIND_ABDUCTION))).multiply(qX(_q, -flex));
    rig.writeBone(LIMB.upperArm[i], _qU, _sh);
    _v.copy(j[LIMB.forearm[i]]).sub(j[LIMB.upperArm[i]]).multiplyScalar(s).applyQuaternion(_qU).add(_sh);
    _qF.copy(_qU).multiply(qX(_q, -elbow));
    rig.writeBone(LIMB.forearm[i], _qF, _v);
    // the legs: the feet out in front, a little apart; for the landing down under the body
    _t.set(side * 0.13, -0.42 - 0.38 * legsDown, 0.5 - 0.42 * legsDown).applyQuaternion(Q).add(_pel);
    _hip.copy(j[LIMB.thigh[i]]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qP).add(_pel);
    rig.feet[i].contact = 0;
    _an.copy(rig.solveLeg(i, _hip, _t, yaw));
    _qF.copy(Q).multiply(qX(_q, -0.5 * (1 - legsDown)));
    rig.writeBone(LIMB.foot[i], _qF, _an);
    _v.copy(j[LIMB.toe[i]]).sub(j[LIMB.foot[i]]).multiplyScalar(s).applyQuaternion(_qF).add(_an);
    rig.writeBone(LIMB.toe[i], _qF, _v);
  }
}
const _boneQ = new THREE.Quaternion();
export function bonePoint(rig, bone, out, up = 0, q = null) {
  const a = rig.pose, o = bone * 8;
  _boneQ.set(a[o], a[o + 1], a[o + 2], a[o + 3]);
  if (q) q.copy(_boneQ);
  out.copy(rig.bind[bone]).multiplyScalar(rig.s);
  out.y += up;
  return out.applyQuaternion(_boneQ).add({ x: a[o + 4], y: a[o + 5], z: a[o + 6] });
}

function buildHarness() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.8 });
  // the seat board and the back protector, a pod behind
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.42).translate(0, -0.1, 0.06), mat));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.16).translate(0, 0.18, -0.2), mat));
  const accent = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.12, 0.17).translate(0, 0.38, -0.2), new THREE.MeshStandardMaterial({ color: 0xe2541a, roughness: 0.6 }));
  g.add(accent);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.4 }));
  return { harness: g, helmet };
}

// --- The thermals' clouds and birds --------------------------------------------------------------------------------------
function cloudGeometry(seed) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const parts = [];
  const puffs = 9;
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2 + rnd(), r = 25 + rnd() * 45, size = 32 + rnd() * 30;
    const p = new THREE.IcosahedronGeometry(size, 1);
    p.scale(1, 0.7 + rnd() * 0.4, 1);
    p.translate(Math.cos(a) * r, size * 0.55 + rnd() * 20, Math.sin(a) * r);
    parts.push(p.index ? p.toNonIndexed() : p);
  }
  const top = new THREE.IcosahedronGeometry(48, 1).scale(1, 0.85, 1).translate(0, 60, 0);
  parts.push(top);
  // one buffer (the puffs flattened at the bottom: a cumulus' base is a level line)
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) { const a = p.attributes.position.array; for (let i = 0; i < a.length; i += 3) { pos[o++] = a[i]; pos[o++] = Math.max(0, a[i + 1]); pos[o++] = a[i + 2]; } p.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function birdGeometry() {
  // a chough from above: two swept wings and the body, its wingtips up (scaled below 0 in y: down)
  const v = [
    0, 0, 0.32, 0.75, 0.22, -0.1, 0.18, 0.02, -0.12,
    0, 0, 0.32, -0.18, 0.02, -0.12, -0.75, 0.22, -0.1,
    0, 0.01, 0.38, 0.07, 0, -0.3, -0.07, 0, -0.3,
    0, 0.01, -0.22, 0.14, 0, -0.48, -0.14, 0, -0.48
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
const BIRDS_PER = 3;

function buildWindsock() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 5, 6).translate(0, 2.5, 0), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.5, metalness: 0.4 })));
  const sock = new THREE.Group();
  sock.position.set(0, 4.85, 0);
  for (let k = 0; k < 4; k++) {
    const r0 = 0.28 - k * 0.045, r1 = 0.28 - (k + 1) * 0.045;
    sock.add(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 0.42, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.21 + k * 0.42), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xf4f2ea : 0xe2541a, roughness: 0.7, side: THREE.DoubleSide })));
  }
  g.add(sock);
  g.userData.sock = sock;
  return g;
}
function buildCross(y) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.9, emissive: 0x404040 });
  const g = new THREE.Group();
  for (const r of [Math.PI / 4, -Math.PI / 4]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 2.2), mat);
    m.rotation.y = r;
    g.add(m);
  }
  g.position.set(FIELD.x, y + 0.1, FIELD.z);
  return g;
}

// --- The vario's sound ----------------------------------------------------------------------------------------------------
class Vario {
  constructor(audio) { this.audio = audio; this.next = 0; this.tone = null; this.beepAt = -1; this.nextBuzz = 0; }
  /** When the last beep began (performance.now() ms): the instrument's LED blinks with it, sound or not */
  blink(climb, on) {
    const now = performance.now();
    if (!on || climb < 0.15) return false;
    const period = 620 / (1 + climb * 0.9);
    if (now - this.beepAt > period) this.beepAt = now;
    return now - this.beepAt < period * 0.45;
  }
  ok() {
    const a = this.audio;
    return a && a.enabled && a.context && a.context.state === 'running' && a.mix;
  }
  update(climb, on) {
    if (!this.ok()) return;
    const ctx = this.audio.context, now = ctx.currentTime;
    // sinking hard: a low steady tone
    const sinkTone = on && climb < -2.6;
    if (sinkTone && !this.tone) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 220; g.gain.value = 0;
      o.connect(g).connect(this.audio.mix); o.start();
      g.gain.setTargetAtTime(0.025, now, 0.08);
      this.tone = { o, g };
    } else if (!sinkTone && this.tone) this.stopTone();
    if (this.tone) this.tone.o.frequency.setTargetAtTime(240 + climb * 12, now, 0.1);
    // the edge of a thermal (the air sinking less than the wing): a soft crackle, short low blips (the pilots' 'buzzer')
    if (on && climb > -0.6 && climb < 0.15 && now >= this.nextBuzz) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 380 + climb * 120;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.02, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      o.connect(g).connect(this.audio.mix);
      o.start(now); o.stop(now + 0.08);
      this.nextBuzz = now + 0.11 + Math.random() * 0.09;
    }
    // climbing: beeps, higher and quicker the stronger the lift
    if (!on || climb < 0.15 || now < this.next) return;
    const period = 0.62 / (1 + climb * 0.9), f = 620 + climb * 170;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.008);
    g.gain.setValueAtTime(0.06, now + period * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, now + period * 0.5);
    o.connect(g).connect(this.audio.mix);
    o.start(now); o.stop(now + period * 0.55);
    this.next = now + period;
  }
  stopTone() {
    if (!this.tone) return;
    const { o, g } = this.tone, ctx = this.audio.context;
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    o.stop(ctx.currentTime + 0.3);
    this.tone = null;
  }
  dispose() { try { this.stopTone(); } catch { /* (the context gone) */ } }
}

// --- The feature ------------------------------------------------------------------------------------------------------------
const _C = new THREE.Vector3(), _Q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _qq = new THREE.Quaternion();
const _cc = { x: 0, z: 0 };

/** The walker's soft contact shadow (js/controllers.js: the plane under its feet), looked up again when the figure's
 *  mesh was rebuilt */
export function walkerShadow(p) {
  if (p._walkerShadow?.parent !== p.mesh || !p._walkerShadow) p._walkerShadow = p.mesh?.children.find((c) => c.renderOrder === 998) || null;
  return p._walkerShadow;
}
/** What a flight changes on the walker (the paraglider's, the jetpack's), to put back after it */
export const saveWalker = (person) => ({ label: person.label, topSpeedKmh: person.topSpeedKmh, chaseDistance: person.chaseDistance, chaseHeight: person.chaseHeight, target: person.cameraTargetOffset.y });
/** The walker back on its own feet after a flight: the speed cluster, the drivers, the chase camera, the shadow */
export function restoreWalker(cm, person, saved) {
  if (saved.topSpeedKmh === undefined) delete person.topSpeedKmh; else person.topSpeedKmh = saved.topSpeedKmh;
  person.label = saved.label;
  const hudLabel = document.getElementById('hud-active-mode');
  if (hudLabel) hudLabel.textContent = saved.label;
  cm.personDriver = null;
  cm.personPoser = null;
  const p = cm.entities.person;
  p.rig.placed = false;
  p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
  p.speed = 0;
  p.chaseDistance = saved.chaseDistance; p.chaseHeight = saved.chaseHeight; p.cameraTargetOffset.y = saved.target;
  const shadow = walkerShadow(p);
  if (shadow) shadow.visible = true;
}

/** The thermals the flight flies in (the free flight's: the time of day's), and those whose clouds stand */
const flightThermals = (run) => run.thermals || THERMALS;
const cloudThermals = (run) => run.thermalList || THERMALS;

const paraglider = {
  // (the game's key hints give way to the flight's own while airborne; a touch screen keeps its stick, the steering)
  ownControls: (run) => !!run.state?.flight && run.state.flight.phase === 'air' && !touch(),
  setup(run) {
    ensureStyle();
    const cm = run.hooks.controllerManager, person = cm.entities.person;
    const pg = run.pg = {
      wing: buildWing(), ...buildHarness(), clouds: [], time: 0, hudT: 0, pose: { head: new THREE.Vector3(), headQ: new THREE.Quaternion(), pelvis: new THREE.Vector3(), pelvisQ: new THREE.Quaternion() },
      socks: [], wind: { x: 0, z: 0, speed: 0, toward: 0 }, pitch: 0, roll: 0, deflate: 0, legs: 0, brakes: [0, 0], vario: new Vario(run.hooks.audio), flashT: 0,
      saved: saveWalker(person)
    };
    run.group.add(pg.wing, pg.harness, pg.helmet);
    // the speed cluster at the bottom right: a paraglider, its speed over the ground (js/main.js reads person.speed)
    person.label = 'Paraglider';
    person.topSpeedKmh = 60;
    const hudLabel = document.getElementById('hud-active-mode'); // (js/main.js writes it only when the mode changes)
    if (hudLabel) hudLabel.textContent = 'Paraglider';
    // the clouds and the birds over the thermals
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x9aa6b8, emissiveIntensity: 0.55 });
    cloudThermals(run).forEach((th, i) => {
      const c = new THREE.Mesh(cloudGeometry(i + 3), cloudMat);
      c.scale.setScalar(0.8 + (th.w - 2.5) * 0.35);
      c.frustumCulled = false;
      pg.clouds.push(c);
      run.group.add(c);
    });
    pg.birds = new THREE.InstancedMesh(birdGeometry(), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.8, side: THREE.DoubleSide }), cloudThermals(run).length * BIRDS_PER);
    pg.birds.frustumCulled = false;
    run.group.add(pg.birds);
    // the field: its cross and a windsock; a windsock at the launch (the free flight: none)
    if (!run.free) run.group.add(buildCross(groundHeight(FIELD.x, FIELD.z)));
    for (const [x, z] of run.free ? [] : [[FIELD.x + 34, FIELD.z - 20], [LAUNCH.x + 6, LAUNCH.z + 9]]) {
      const w = buildWindsock();
      w.position.set(x, groundHeight(x, z), z);
      run.group.add(w);
      pg.socks.push(w.userData.sock);
    }
    // the HUD
    const hud = el('div', 'panel pg-hud');
    const cell = (key, unit = '') => { const c = el('div', 'pg-cell'), v = el('span', 'pg-v', '–'); c.append(el('span', 'pg-k', t(key)), v, el('span', 'pg-u', unit)); return { c, v }; };
    const ui = pg.ui = {
      hud, agl: cell('Above ground'), time: cell('Airtime'), dist: cell('Distance'), pts: cell('Points'),
      flash: el('div', 'pg-flash')
    };
    ui.agl.c.classList.add('pg-agl');
    if (run.free) ui.pts.c.style.display = 'none'; // (the free flight scores nothing)
    const row = el('div', 'pg-row');
    row.append(ui.agl.c, ui.time.c, ui.dist.c, ui.pts.c);
    hud.append(row, ui.flash);
    run.hints([[['A', 'D'], 'steer'], [['W'], 'speed bar'], [['S'], 'brakes'], [['Space'], 'flare']]);
    hud.hidden = true;
    // the vario on the riser: the altimeter big, its climb bar, the speed over the ground and the wind
    const ins = el('div', 'pg-instr');
    const top = el('div', 'pg-instr-top'); ui.led = el('span', 'pg-led'); top.append(el('span', null, 'VARIO'), ui.led);
    const main = el('div', 'pg-instr-main'); ui.vbar = el('div', 'pg-vbar'); ui.vfill = el('span'); ui.vbar.append(ui.vfill);
    const vals = el('div', 'pg-instr-vals');
    ui.alt = el('div', 'pg-i-alt', '–'); ui.climb = el('div', 'pg-i-climb', '–');
    vals.append(el('span', 'pg-i-k', t('Altitude')), ui.alt, el('span', 'pg-i-k', t('Climb')), ui.climb);
    main.append(ui.vbar, vals);
    const foot = el('div', 'pg-instr-foot');
    ui.gs = el('span', 'pg-i-v', '–'); ui.windV = el('span', 'pg-i-v'); ui.arrow = el('span', 'pg-arrow', '↑'); ui.windT = el('span', null, '–');
    ui.windV.append(ui.arrow, ui.windT);
    const fc = (k, v) => { const c = el('div'); c.append(el('div', 'pg-i-k', t(k)), v); return c; };
    foot.append(fc('Ground speed', ui.gs), fc('Wind', ui.windV));
    ins.append(top, main, foot);
    ins.hidden = true;
    ui.instr = ins;
    document.body.append(hud, ins);
    // the walker is the pilot: driven and posed by the flight
    cm.personDriver = (dt) => paraglider.drive(run, dt, cm);
    cm.personPoser = (dt, p) => paraglider.pose(run, dt, p, cm);
    run.cleanups.push(() => {
      hud.remove();
      ins.remove();
      pg.vario.dispose();
      restoreWalker(cm, person, pg.saved);
    });
  },
  reset(run) {
    const pg = run.pg, cs = run.hooks.cameraSystem;
    pg.deflate = 0; pg.legs = 0; pg.pitch = 0; pg.roll = 0; pg.flashT = 0;
    pg.ui.flash.textContent = '';
    run.hooks.controllerManager.entities.person.rig.placed = false;
    touchLabel(run, 'Launch');
    // the camera from behind and to the side, above the wing laid out on the slope
    if (cs) { cs.orbitYawOffset = 0.75; cs.orbitPitchOffset = 0.3; cs.userOrbitTimer = 0; }
  },
  /** The controllers' personDriver: the flight stepped with the keys, the walker placed where it is */
  drive(run, dt, cm) {
    const p = cm.entities.person, f = run.state?.flight;
    if (!f || !live(run)) { p.speed = 0; return; }
    const k = cm.keys;
    const flare = k.up ? 1 : 0;
    const input = { steer: (+k.left || 0) - (+k.right || 0), accel: flare ? 0 : +k.forward || 0, brake: Math.max(+k.backward || 0, flare), go: !!(k.forward || k.up) };
    const before = f.phase;
    stepFlight(f, input, dt, groundHeight, flightThermals(run));
    if (f.phase !== before) paraglider.phaseChange(run, f);
    p.position.set(f.x, f.y, f.z);
    p.heading = f.heading;
    p.speed = onGround(f) ? 0 : f.gs || f.v; // (the speedometer reads the speed over the ground, as a GPS vario does)
    p.verticalVel = 0;
    // the camera: up behind the wing on the launch (it lies on the slope behind the pilot), pulled back under it in the air
    const air = f.phase === 'air', ground = f.phase === 'ready' || f.phase === 'inflate';
    const ease = Math.min(1, dt * 1.5);
    // (a phone held upright sees a narrow slice: back far enough for the wing's span)
    const narrow = clamp(1 / (run.hooks.cameraSystem?.camera?.aspect || 1.6), 1, 2);
    p.chaseDistance += ((air ? 13 : ground ? 15 : 13) * narrow - p.chaseDistance) * ease;
    p.chaseHeight += ((air ? 3.4 : ground ? 5.5 : 4) - p.chaseHeight) * ease;
    p.cameraTargetOffset.y += ((air ? 2.6 : ground ? 1.2 : 2.2) - p.cameraTargetOffset.y) * ease;
    // (the contact shadow under the feet stays on the ground)
    const shadow = walkerShadow(p);
    if (shadow) shadow.visible = !air;
  },
  phaseChange(run, f) {
    if (f.phase === 'air') { paraglider.flash(run, 'Airborne!'); touchLabel(run, 'Flare'); }
    if (f.phase === 'landed') paraglider.flash(run, f.landing.onField && !run.free ? 'Landed on the field!' : 'Landed');
    if (f.phase === 'crashed') paraglider.flash(run, 'Crash landing');
  },
  flash(run, text) { run.pg.ui.flash.textContent = t(text); run.pg.flashT = 2.5; },
  /** The controllers' personPoser: walking and running on the ground, seated in the harness in the air; the wing over it */
  pose(run, dt, p, cm) {
    const pg = run.pg, f = run.state?.flight, rig = p.rig;
    const air = f?.phase === 'air';
    // (before the start the walker may still be wherever the game left it: no wing in town)
    pg.wing.visible = pg.harness.visible = pg.helmet.visible = run.phase !== 'intro' && run.phase !== 'loading';
    if (p.crowd?.model) pg.helmet.visible = false; // (made for the lofted head: a Rocketbox figure flies without, js/player-figure.js)
    if (!air) rig.update(dt, p.position.x, p.position.z, p.heading, (c, x, z, near) => c.getGroundHeight(x, z, 'person', near), cm, 0);
    // the wing's attitude: laid out behind on the slope, up overhead with the inflation, banked and pitched in the air,
    // collapsing behind after the landing
    const k = Math.min(1, dt * 4);
    let pitch, roll = 0;
    const back = groundHeight(p.position.x - Math.sin(p.heading) * 6, p.position.z - Math.cos(p.heading) * 6) - groundHeight(p.position.x, p.position.z);
    const laid = -(Math.PI / 2 - Math.atan2(Math.max(0, back), 6)) + 0.08;
    if (!f || f.phase === 'ready') pitch = laid;
    else if (f.phase === 'inflate' || f.phase === 'run') { const e = f.inflate * f.inflate * (3 - 2 * f.inflate); pitch = laid * (1 - e) + 0.12 * e; }
    else if (air) { pitch = 0.06 + 0.1 * f.accel - 0.16 * f.brake; roll = -f.bank; }
    else {
      // landed: the wing sinks forward over the pilot's head and settles flat on the meadow in front
      pg.deflate = Math.min(1, pg.deflate + dt * 0.6);
      pitch = 0.06 + 1.3 * pg.deflate * pg.deflate;
    }
    if (!f || f.phase === 'ready') { pg.pitch = pitch; pg.roll = 0; }
    pg.pitch += (pitch - pg.pitch) * k; pg.roll += (roll - pg.roll) * k;
    _e.set(pg.pitch, p.heading, pg.roll, 'YXZ');
    _Q.setFromEuler(_e);
    const lift = !f || f.phase === 'ready' ? 0.35 : f.phase === 'inflate' ? 0.35 + 0.9 * f.inflate : 1.25;
    if (air) {
      // the pilot hangs from the carabiners: they swing with the bank, the pilot under them
      _C.set(p.position.x, p.position.y + 1.0, p.position.z);
      pg.legs += ((f.agl < 25 ? 1 : 0) - pg.legs) * Math.min(1, dt * 1.5);
      const steer = f.steer;
      pg.brakes[0] += (clamp(f.brake + Math.max(0, steer), 0, 1) - pg.brakes[0]) * k;
      pg.brakes[1] += (clamp(f.brake + Math.max(0, -steer), 0, 1) - pg.brakes[1]) * k;
      _e.set(0, p.heading, pg.roll * 0.85, 'YXZ');
      _qq.setFromEuler(_e);
      poseHarness(rig, _C, _qq, p.heading, pg.brakes, pg.legs, pg.pose);
      pg.wing.position.copy(_C);
    } else {
      _C.set(p.position.x, p.position.y + lift, p.position.z);
      pg.wing.position.copy(_C);
    }
    pg.wing.quaternion.copy(_Q);
    pg.wing.scale.set(1, 1 - 0.72 * pg.deflate, 1); // (collapsing: the arc flattens onto the ground)
    // the harness on the pelvis, the helmet on the head (from the bones, whatever wrote them)
    bonePoint(rig, BONE.PELVIS, _p, 0, _qq);
    pg.harness.position.copy(_p); pg.harness.quaternion.copy(_qq);
    bonePoint(rig, BONE.HEAD, _p, 0.075, _qq);
    pg.helmet.position.copy(_p); pg.helmet.quaternion.copy(_qq);
  },
  update(run, ctx, dt) {
    const pg = run.pg, f = run.state?.flight;
    pg.time += dt;
    // the clouds and birds follow the thermals' wander (the flight's own clock)
    const ft = f ? f.t : 0, py = f?.y ?? ctx.y;
    const working = !run.thermals || run.thermals.length > 0; // (the free flight at night: no thermals, no clouds over them)
    pg.birds.visible = working;
    cloudThermals(run).forEach((th, i) => {
      pg.clouds[i].visible = working;
      thermalCentre(th, ft, _cc);
      const g = groundHeight(_cc.x, _cc.z);
      thermalCentre(th, ft, _cc, PG.cloudBase - g); // (the cloud downwind of the thermal's foot, where its column leans to)
      pg.clouds[i].position.set(_cc.x, PG.cloudBase - 8, _cc.z);
      for (let b = 0; b < BIRDS_PER; b++) {
        const n = i * BIRDS_PER + b;
        // one at the pilot's height when the pilot is near, the others spread up the column
        const near = Math.hypot(ctx.x - _cc.x, ctx.z - _cc.z) < 700;
        const lo = g + 60, hi = PG.cloudBase - 120;
        const y = b === 0 && near ? clamp(py + 12, lo, hi) : lo + (hi - lo) * (0.3 + 0.32 * b);
        thermalCentre(th, ft, _cc, y - g); // (each bird in the column where it leans at its height)
        const r = 16 + b * 7, w = 0.32 + 0.05 * b, a = pg.time * w * PG.timeScale + b * 2.1 + th.phase;
        _p.set(_cc.x + Math.cos(a) * r, y + Math.sin(pg.time * 0.4 + b) * 3, _cc.z + Math.sin(a) * r);
        // flying along the circle (counter-clockwise seen from above), banked into it, a few beats now and then
        _e.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), -0.45, 'YXZ');
        _qq.setFromEuler(_e);
        const beat = Math.sin(pg.time * 2.3 + n) > 0.75 ? Math.sin(pg.time * 22 + n) : 1;
        _s.set(1.6, 1.6 * beat, 1.6);
        _m.compose(_p, _qq, _s);
        pg.birds.setMatrixAt(n, _m);
      }
    });
    pg.birds.instanceMatrix.needsUpdate = true;
    // the windsocks: down the wind, fuller the stronger it blows, a flutter
    windAt(ft, 0, pg.wind);
    for (const [i, sock] of pg.socks.entries()) {
      const flutter = Math.sin(pg.time * 7.3 + i * 2) * 0.05 + Math.sin(pg.time * 2.1 + i) * 0.04;
      sock.rotation.set(clamp(1.35 - pg.wind.speed * 0.32, 0.15, 1.3) + flutter, pg.wind.toward + flutter * 1.5, 0, 'YXZ');
    }
    pg.vario.update(f?.phase === 'air' ? f.vario : 0, live(run) && f?.phase === 'air');
    if (pg.flashT > 0) { pg.flashT -= dt; if (pg.flashT <= 0) pg.ui.flash.textContent = ''; }
  },
  after(run, ctx, dt) {
    const pg = run.pg, f = run.state?.flight, ui = pg.ui;
    const show = !!f && (live(run) || run.phase === 'done') && f.phase !== 'ready';
    ui.hud.hidden = !show;
    ui.instr.hidden = !show;
    if (show) {
      // the LED with every beep (every frame: the beeps are short)
      const vz0 = f.phase === 'air' ? f.vario : 0;
      const beeping = pg.vario.blink(vz0, live(run) && f.phase === 'air');
      ui.led.className = beeping ? 'pg-led on' : vz0 < -2.6 ? 'pg-led sink' : 'pg-led';
    }
    if (!show) { if (!live(run)) pg.vario.update(0, false); return; }
    // (the numbers ten times a second: no layout every frame)
    pg.hudT -= dt;
    if (pg.hudT > 0) return;
    pg.hudT = 0.1;
    const air = f.phase === 'air';
    setText(ui.agl.v, `${Math.max(0, Math.round(f.y - groundHeight(f.x, f.z)))} m`);
    const vz = air ? f.vario : 0;
    // the instrument
    ui.alt.innerHTML = `${Math.round(f.y + H0).toLocaleString('de-CH')}<small>m</small>`;
    ui.climb.innerHTML = `${vz >= 0 ? '+' : '−'}${Math.abs(vz).toFixed(1)}<small>m/s</small>`;
    ui.climb.classList.toggle('is-up', vz > 0.2);
    ui.climb.classList.toggle('is-down', vz < -1.6);
    const share = clamp(Math.abs(vz) / 5, 0, 1) * 50;
    ui.vfill.className = vz >= 0 ? 'is-up' : 'is-down';
    ui.vfill.style.height = `${share}%`;
    ui.vfill.style.top = vz >= 0 ? `${50 - share}%` : '50%';
    setText(ui.gs, `${Math.round((air ? f.gs : 0) * 3.6)} km/h`);
    const w = air && f.wind ? f.wind : windAt(f.t, 0, pg.wind);
    setText(ui.windT, `${Math.round(w.speed * 3.6)} km/h`);
    // the arrow: where the wind blows to, as seen in the pilot's heading (up: a tailwind; the heading grows to the left)
    ui.arrow.style.transform = `rotate(${((f.heading - w.toward) * 180 / Math.PI).toFixed(0)}deg)`;
    const s = Math.round(f.airtime);
    setText(ui.time.v, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    setText(ui.dist.v, fmtDist(f.maxDist));
    setText(ui.pts.v, `${flightScore(f)}`);
  },
  teardown(run) { run.pg?.vario.dispose(); }
};

export const PARAGLIDE_FEATURES = { paraglider };
