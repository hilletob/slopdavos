import * as THREE from 'three/webgpu';
import { surfaceHeight } from './terrain.js';
import {
  CLUBS, clubById, BALL_R, HOLE_R, SURFACES, surfaceAt, createBall, strike, stepBall, previewFlight, slopeAt,
  currentHole, distanceToPin, beginShot, endShot, nextHole, createMeter, meterStart, meterPower, meterAccuracy, meterStep,
  accuracyLabel, METER, toPar, formatToPar, GREEN_SLOPE_BOOST, PUTT_MAX,
  landingFor, shotTable, powerFor, carryAt, windAgainstAim, lieToll, shotReport, alongAim
} from './missions-data-golf.js';

// js/missions-golf.js
// The golf mission's runtime (js/missions-data-golf.js has its definition and the pure game logic: the surfaces, the
// ball's flight, bounce and roll, the cup, the round's strokes and score), as a feature of js/missions.js (GOLF_FEATURES,
// merged into its FEATURES):
//   golf — the golfer at the ball (the controllers' personDriver holds it there, the personPoser writes its PersonRig's
//          bones: the stance, the turn, the arms on the grip by two-bone IK, the club swung round the shoulders in its
//          plane with the wrists' hinge), the club, the ball with its trail, the aim's preview (the arc and where it
//          lands; on the green the line and the slope's arrows), the swing meter, the wind, its own camera (behind the
//          ball, then after it in the air); between the shots the player walks to the ball (the hooks let go: the walk
//          as ever) or takes the cart (C: the camera swings over to the ball).
// Everything is built when the mission starts and goes with the run (its group, its DOM, the controllers' hooks).

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const LIFT = 0.05; // the course's turf over the terrain (js/golf.js drapes it so)
const turfY = (x, z) => surfaceHeight(x, z) + LIFT;
const ADDRESS_REACH = 2.2; // m: walking this close to the ball takes the stance
const TRAIL_MAX = 1200;

// --- The HUD's own pieces (injected once: no shared stylesheet edit) ---------------------------------------------------
const STYLE = `
.golf-hud { position: fixed; left: 50%; bottom: max(46px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 12;
  display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 12px; min-width: 300px; max-width: 780px; pointer-events: none;
  font-size: 13px; font-weight: 600; text-align: center; }
.golf-row { display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; }
.golf-card { font-size: 14px; letter-spacing: 0.01em; }
.golf-card b { font-weight: 800; }
.golf-clubs { display: flex; gap: 4px; pointer-events: auto; }
.golf-club { min-width: 40px; padding: 4px 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.08);
  color: inherit; font: inherit; font-size: 12px; cursor: pointer; line-height: 1.1; }
.golf-club small { display: block; font-size: 10px; opacity: 0.7; font-weight: 500; white-space: nowrap; }
.golf-club.is-on { background: #3aa655; border-color: #8fe0a2; color: #fff; }
.golf-wind { display: inline-flex; align-items: center; gap: 4px; }
.golf-wind svg { width: 18px; height: 18px; fill: #9fdcff; transition: transform 0.2s; }
.golf-meter { position: relative; width: 260px; height: 14px; border-radius: 7px; background: rgba(255,255,255,0.14); overflow: hidden; }
.golf-meter-fill { position: absolute; top: 0; bottom: 0; left: 20%; width: 0; background: linear-gradient(90deg, #3fd6ff, #ffffff 80%, #ff9a3d); }
.golf-meter-zone { position: absolute; top: 0; bottom: 0; background: rgba(80, 220, 140, 0.6); }
.golf-meter-line { position: absolute; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; background: #5be08c; }
.golf-meter-power { position: absolute; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; background: #ffc83d; }
.golf-meter-needle { position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1px; background: #fff; box-shadow: 0 0 4px #000; }
.golf-flash { font-size: 14px; font-weight: 800; min-height: 18px; min-width: 150px; text-align: left; }
.golf-flash.is-good { color: #5be08c; } .golf-flash.is-bad { color: #ff7a6b; } .golf-flash.is-gold { color: #ffc83d; }
.golf-big { position: fixed; left: 50%; top: 36%; transform: translate(-50%, -50%); z-index: 12; pointer-events: none; font-size: 52px;
  font-weight: 900; color: #fff; text-shadow: 0 3px 14px rgba(0,0,0,0.6); opacity: 0; transition: opacity 0.25s; white-space: nowrap; }
.golf-big.is-on { opacity: 1; }
.golf-cart { pointer-events: auto; padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.3); background: rgba(58,166,85,0.85);
  color: #fff; font: inherit; font-size: 12px; cursor: pointer; }
.golf-cart[hidden] { display: none; }
.golf-plan { font-size: 12px; font-weight: 600; gap: 8px; }
.golf-plan span:not(:empty) + span:not(:empty)::before { content: '·'; margin-right: 8px; opacity: 0.6; }
.golf-plan .golf-need { color: #ff8a80; } .golf-plan .golf-need.is-out { color: #ffc83d; }
.golf-wind-words { font-weight: 500; opacity: 0.85; }
.golf-meter-target { position: absolute; top: -3px; bottom: -3px; width: 4px; margin-left: -2px; background: #ff3b30; box-shadow: 0 0 0 1px #fff; }
.golf-meter-target[hidden] { display: none; }
.golf-readout { font-size: 13px; font-weight: 800; min-width: 92px; text-align: left; color: #ffe08a; }
.golf-steps[hidden] { display: none; }
.golf-steps { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; font-size: 11px; font-weight: 600; }
.golf-step { padding: 2px 7px; border-radius: 6px; background: rgba(255,255,255,0.08); opacity: 0.55; }
.golf-step.is-on { background: rgba(255,200,61,0.25); box-shadow: inset 0 0 0 1px #ffc83d; opacity: 1; }
.golf-step b { color: #ffc83d; margin-right: 3px; }
.golf-report { display: flex; flex-direction: column; gap: 1px; font-size: 12px; font-weight: 600; max-width: 520px; }
.golf-report[hidden] { display: none; }
.golf-report-lines span:not(:empty) + span:not(:empty)::before { content: ' · '; opacity: 0.6; }
.golf-report-tip { color: #ffe08a; }
.golf-mark { position: fixed; left: 0; top: 0; z-index: 11; pointer-events: none; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center;
  font-size: 13px; font-weight: 800; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8); white-space: nowrap; will-change: transform; }
.golf-mark[hidden] { display: none; }
.golf-mark-pin .golf-mark-label { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px 3px 6px; border-radius: 12px; background: rgba(200,20,20,0.88); box-shadow: 0 0 0 2px #fff, 0 2px 8px rgba(0,0,0,0.45); }
.golf-mark-pin svg { width: 14px; height: 14px; }
.golf-mark-pin .golf-mark-stem { width: 2px; height: 14px; background: #fff; box-shadow: 0 0 2px #000; }
.golf-mark-pin.is-edge .golf-mark-stem { display: none; }
.golf-mark-arrow { width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 11px solid #fff; margin-bottom: 2px; display: none; }
.golf-mark.is-edge .golf-mark-arrow { display: block; }
.golf-mark-land .golf-mark-label { padding: 1px 6px; border-radius: 9px; background: rgba(40,30,0,0.65); color: #ffd23d; font-size: 12px; box-shadow: 0 0 0 1px #ffd23d; }
body.touch-enabled .golf-hud { bottom: calc(max(12px, env(safe-area-inset-bottom)) + var(--touch-clear, 200px)); }
@media (max-width: 820px) { body.touch-enabled .golf-hud { bottom: calc(max(12px, env(safe-area-inset-bottom)) + var(--touch-clear, 200px) + 80px); } }
@media (max-width: 820px) { .golf-hud { min-width: 0; width: min(380px, calc(100vw - 16px)); box-sizing: border-box; padding: 5px 8px; font-size: 12px; gap: 3px; } .golf-meter { width: 200px; } .golf-big { font-size: 38px; } .golf-club { min-width: 34px; }
  .golf-step:not(.is-on) { display: none; } .golf-plan { font-size: 11px; gap: 6px; } .golf-report { font-size: 11px; } .golf-readout { min-width: 0; font-size: 12px; }
  .golf-card { font-size: 12px; } .golf-club { min-width: 30px; padding: 2px 4px; font-size: 11px; } .golf-club small { font-size: 9px; }
  .golf-wind-label, .golf-pin-dist { display: none; } .golf-row { gap: 6px; } .golf-flash { min-width: 0; font-size: 12px; } }
`;

function ensureStyle() {
  if (document.getElementById('golf-style')) return;
  const s = document.createElement('style');
  s.id = 'golf-style';
  s.textContent = STYLE;
  document.head.append(s);
}


// =====================================================================================================================
// The golfer's pose: the skinned person's bones written straight into its PersonRig (js/pedestrians.js), as
// js/missions-ice.js poses the skater. The golfer stands side-on to the line (the target on its left), bent at the hips;
// the club and the hands turn as one round an axis through the shoulders (the swing plane through the ball), the wrists
// hinge the club up in the backswing; the chest and the pelvis turn with it, the arms reach the grip by two-bone IK.
const BONE = { PELVIS: 0, CHEST: 1, HEAD: 2 };
const LIMB = { upperArm: [3, 5], forearm: [4, 6], thigh: [7, 11], foot: [9, 13], toe: [10, 14] };
const SIDES = [1, -1];
const ARM_BIND_ABDUCTION = 0.14, ANKLE_H = 0.08, UPPER_ARM = 0.3, FOREARM = 0.255;
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _qC = new THREE.Quaternion(), _qU = new THREE.Quaternion(), _qL = new THREE.Quaternion(), _qR = new THREE.Quaternion();
const _pel = new THREE.Vector3(), _ch = new THREE.Vector3(), _v = new THREE.Vector3(), _sh = new THREE.Vector3(), _hip = new THREE.Vector3(), _t = new THREE.Vector3(), _an = new THREE.Vector3();
const _el = new THREE.Vector3(), _d = new THREE.Vector3(), _pole = new THREE.Vector3(), _front = new THREE.Vector3(), _up = new THREE.Vector3();
const qX = (o, a) => o.setFromAxisAngle(AX, a), qY = (o, a) => o.setFromAxisAngle(AY, a), qZ = (o, a) => o.setFromAxisAngle(AZ, a);

/** The stance for a club: the hips' and the chest's bend, the knees */
const stance = (putt) => (putt ? { hip: 0.5, chest: 0.32, drop: 0.07, feet: 0.17 } : { hip: 0.4, chest: 0.16, drop: 0.08, feet: 0.25 });

/** Where the pelvis, the chest and the shoulders' middle are (local to the golfer: x its left, y up, z forward) */
function torso(rig, st) {
  const s = rig.s, j = rig.bind;
  const pel = new THREE.Vector3(0, (0.955 - st.drop) * s, -0.06 * s);
  const qP = qX(new THREE.Quaternion(), st.hip);
  const ch = j[BONE.CHEST].clone().sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(qP).add(pel);
  const qC = qX(new THREE.Quaternion(), st.hip + st.chest);
  const mid = j[LIMB.upperArm[0]].clone().add(j[LIMB.upperArm[1]]).multiplyScalar(0.5).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(qC).add(ch);
  return { pel, ch, mid };
}

/** The address (local to the golfer): the pivot between the shoulders, the hands, the ball (where the club's head sits)
 *  and the swing plane's axis; cached a rig scale and club */
const _addr = new Map();
export function addressGeometry(rig, club) {
  const s = rig.s;
  const key = `${s.toFixed(3)}|${rig.female ? 1 : 0}|${club.id}`;
  if (_addr.has(key)) return _addr.get(key);
  const st = stance(club.putt);
  const { mid } = torso(rig, st);
  const arm = (UPPER_ARM + FOREARM + 0.05) * s * (club.putt ? 0.86 : 0.93);
  const beta = club.putt ? 0.12 : 0.28; // the arms' angle off the vertical, forward
  const grip = new THREE.Vector3(0, mid.y - arm * Math.cos(beta), mid.z + arm * Math.sin(beta));
  const L = club.length;
  const cosG = clamp((grip.y - BALL_R) / L, 0, 1);
  const ball = new THREE.Vector3(0, BALL_R, grip.z + L * Math.sqrt(1 - cosG * cosG));
  const toBall = ball.clone().sub(mid);
  const axis = new THREE.Vector3().crossVectors(AX, toBall).normalize(); // (a turn by +φ swings the hands to the right: the backswing)
  const g = { st, mid, grip, ball, axis, L, shaft: ball.clone().sub(grip).normalize() };
  _addr.set(key, g);
  return g;
}

/**
 * Poses `rig` as a golfer: its feet round (x, y, z) facing `yaw` (the target on its left), the club `club` swung by `phi`
 * (rad round the swing plane: > 0 the backswing, < 0 the follow-through; 0 the address). Returns the grip and the club
 * head in world space and the shaft's direction.
 */
export function poseGolfer(rig, x, y, z, yaw, club, phi = 0) {
  const s = rig.s, j = rig.bind;
  const geo = addressGeometry(rig, club);
  const st = geo.st;
  rig.x = x; rig.z = z; rig.yaw = yaw; rig.placed = true; rig.gait = 0; rig.run = 0; rig.speed = 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const W = (v, out) => out.set(x + v.x * cy + v.z * sy, y + v.y, z - v.x * sy + v.z * cy);
  const Wd = (v, out) => out.set(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy);
  const body = club.putt ? 0.08 : 1;
  // the turn: the pelvis a little, the chest more (to the right in the backswing, through to the target after)
  const turnP = -0.28 * phi * body, turnC = -0.62 * phi * body;
  const shift = (club.putt ? 0 : -0.05 * Math.tanh(phi)) * s; // (the weight back, then onto the front foot)
  qY(_qP, yaw + turnP).multiply(qX(_q, st.hip));
  W(_v.set(shift, (0.955 - st.drop) * s, -0.06 * s), _pel);
  rig.pelvisY = _pel.y;
  rig.writeBone(BONE.PELVIS, _qP, _pel);
  qY(_qC, yaw + turnC).multiply(qX(_q, st.hip + st.chest));
  _ch.copy(j[BONE.CHEST]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qP).add(_pel);
  rig.writeBone(BONE.CHEST, _qC, _ch);
  // the head down over the ball (it turns least; after the strike it comes up to follow the ball)
  const look = phi < -1 ? clamp((-phi - 1) / 1.5, 0, 1) : 0;
  qY(_qa, yaw + turnC * 0.25 + look * 0.9).multiply(qX(_q, st.hip + st.chest * 0.6 + 0.2 - look * 0.6));
  _v.copy(j[BONE.HEAD]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qC).add(_ch);
  rig.writeBone(BONE.HEAD, _qa, _v);
  // the club and the grip: turned round the swing plane's axis through the shoulders; the wrists' hinge on top
  const hinge = club.putt ? 0 : phi > 0 ? 1.15 * smooth(phi / 2.3) : -0.9 * smooth(-phi / 2.6);
  Wd(geo.axis, _up);
  const mid = W(geo.mid, new THREE.Vector3());
  const grip = W(geo.grip, new THREE.Vector3()).sub(mid).applyQuaternion(_q.setFromAxisAngle(_up, phi)).add(mid);
  const dir = Wd(geo.shaft, new THREE.Vector3()).applyQuaternion(_q.setFromAxisAngle(_up, phi + hinge)).normalize();
  const head = grip.clone().addScaledVector(dir, geo.L);
  // the arms: the left hand on top of the grip, the right below it
  _front.set(0, 0, 1).applyQuaternion(_qC);
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i];
    _sh.copy(j[LIMB.upperArm[i]]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qC).add(_ch);
    _t.copy(grip).addScaledVector(dir, i === 0 ? -0.02 : 0.08);
    _pole.set(side * 0.35, -1, -0.15);
    Wd(_pole, _pole);
    armIK(rig, i, _sh, _t, UPPER_ARM * s, (FOREARM + 0.07) * s, _pole, _front);
  }
  // the legs: the feet apart, the toes a little out; the back heel comes up through the strike
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i];
    const footYaw = yaw + side * 0.14;
    const heel = !club.putt && i === 1 && phi < -0.6 ? 0.06 * smooth((-phi - 0.6) / 1.2) : 0;
    W(_v.set(side * st.feet * s, ANKLE_H * s + heel, 0.02), _t);
    _hip.copy(j[LIMB.thigh[i]]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qP).add(_pel);
    rig.feet[i].contact = 1;
    _an.copy(rig.solveLeg(i, _hip, _t, footYaw));
    qY(_qa, footYaw).multiply(qX(_q, heel * 6));
    rig.writeBone(LIMB.foot[i], _qa, _an);
    _v.copy(j[LIMB.toe[i]]).sub(j[LIMB.foot[i]]).multiplyScalar(s).applyQuaternion(_qa).add(_an);
    qY(_q, footYaw);
    rig.writeBone(LIMB.toe[i], _q, _v);
  }
  return { grip, head, dir };
}

/** Two-bone arm IK from the shoulder to the hand, the elbow towards `pole` (the bones as js/pedestrians.js lays them:
 *  +Y from the child joint up to this one, the arm's bind abduction taken out) */
function armIK(rig, i, root, target, l1, l2, pole, front) {
  _d.subVectors(target, root);
  const length = _d.length();
  _d.divideScalar(length || 1);
  const dist = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min((l1 + l2) * 0.999, length));
  _v.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  _el.copy(root).addScaledVector(_d, l1 * cosA).addScaledVector(_v, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
  _an.copy(root).addScaledVector(_d, dist);
  const tilt = SIDES[i] * ARM_BIND_ABDUCTION;
  rig.basis(_t.subVectors(root, _el), front, _qL).multiply(qZ(_q, -tilt));
  rig.writeBone(LIMB.upperArm[i], _qL, root);
  rig.basis(_t.subVectors(_el, _an), front, _qR).multiply(qZ(_q, -tilt));
  rig.writeBone(LIMB.forearm[i], _qR, _el);
}

// --- The props: the club, the ball, the trail, the aim ------------------------------------------------------------------
function createClub() {
  const g = new THREE.Group();
  g.name = 'GolfClub';
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0045, 1, 6).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.8, roughness: 0.3 }));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.26, 8).translate(0, -0.11, 0), new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.8 }));
  const head = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.6, roughness: 0.35 }));
  g.add(shaft, grip, head);
  g.userData = { shaft, head };
  return g;
}
const HEAD_SIZE = { driver: [0.115, 0.06, 0.1], wood: [0.095, 0.045, 0.08], iron7: [0.075, 0.045, 0.016], wedge: [0.075, 0.05, 0.018], putter: [0.1, 0.025, 0.03] };

function placeClub(clubMesh, club, pose, yaw) {
  const { shaft, head } = clubMesh.userData;
  clubMesh.position.copy(pose.grip);
  clubMesh.quaternion.setFromUnitVectors(_v.set(0, -1, 0), pose.dir);
  shaft.scale.set(1, club.length, 1);
  const hs = HEAD_SIZE[club.id] || HEAD_SIZE.iron7;
  head.scale.set(hs[0], hs[1], hs[2]);
  head.position.set(0, -club.length + hs[1] * 0.4, 0);
  // (the face square to the line: the head's long side along the target line)
  head.rotation.set(0, 0, 0);
  _qa.copy(clubMesh.quaternion).invert();
  _t.set(Math.cos(yaw), 0, -Math.sin(yaw)).applyQuaternion(_qa); // (the target line in the club's frame)
  head.rotation.y = Math.atan2(_t.x, _t.z) + Math.PI / 2;
}

function createLine(color, max, opacity = 0.9) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  g.setDrawRange(0, 0);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  line.frustumCulled = false;
  line.renderOrder = 3;
  return line;
}
function setLine(line, pts) {
  const a = line.geometry.attributes.position, n = Math.min(pts.length, a.count);
  for (let i = 0; i < n; i++) a.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
  a.needsUpdate = true;
  line.geometry.setDrawRange(0, n);
  if (n < 2) line.visible = false; // (nothing to draw: no empty draw call)
  else if (line === line.parent?.userData?.trail) line.visible = true;
}

/** The mission's own flag on the hole being played: a white pole, a bright red flag (unlit, no fog: it reads from the
 *  tee), and a red beam of light above it that fades in with the distance; js/golf.js's small pins stay on the others */
function createFlag() {
  const g = new THREE.Group();
  g.name = 'GolfMissionFlag';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 8).translate(0, 1.2, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.55).translate(0.4 + 0.03, 2.4 - 0.275, 0), new THREE.MeshBasicMaterial({ color: 0xff2a1f, side: THREE.DoubleSide, fog: false }));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.renderOrder = 2;
  const flagPivot = new THREE.Group();
  flagPivot.add(flag);
  g.add(pole, flagPivot, beam);
  g.userData = { pole, flag: flagPivot, beam };
  return g;
}

/** Where a world point lies on the screen: { x, y } in CSS px, `edge` when it is off the screen or behind the camera
 *  (then it is pulled onto the screen's edge, `angle` pointing towards it) */
const _pv = new THREE.Vector3();
function screenPoint(cam, x, y, z, margin = 28, top = 70) {
  const W = window.innerWidth, H = window.innerHeight;
  _pv.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
  const behind = _pv.z > -0.1;
  _pv.set(x, y, z).project(cam);
  let sx = (_pv.x * 0.5 + 0.5) * W, sy = (-_pv.y * 0.5 + 0.5) * H;
  if (behind) { sx = W - sx; sy = H + 1e4; } // (behind: below the screen, mirrored)
  const on = !behind && sx >= margin && sx <= W - margin && sy >= top && sy <= H - margin;
  if (on) return { x: sx, y: sy, edge: false, angle: 0 };
  const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
  const kx = (dx > 0 ? W - margin - cx : cx - margin) / Math.max(1e-6, Math.abs(dx));
  const ky = (dy > 0 ? H - margin - cy : cy - top) / Math.max(1e-6, Math.abs(dy));
  const k = Math.min(1, kx, ky);
  return { x: cx + dx * k, y: cy + dy * k, edge: true, angle: Math.atan2(dx, -dy) };
}

/** The slope's arrows round the putt (one mesh: flat chevrons pointing downhill, the steeper the warmer) */
function slopeArrows(from, pin, heightAt) {
  const pos = [], col = [];
  const mx = (from.x + pin.x) / 2, mz = (from.z + pin.z) / 2;
  const d = Math.hypot(pin.x - from.x, pin.z - from.z);
  const step = clamp(d / 8, 0.9, 2.4), n = 6;
  const c = new THREE.Color();
  for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) {
    const x = mx + i * step, z = mz + k * step;
    if (surfaceAt(x, z) !== 'green') continue;
    const sl = slopeAt(heightAt, x, z, 0.5);
    const g = Math.hypot(sl.x, sl.z);
    if (g < 0.002) continue;
    const ux = -sl.x / g, uz = -sl.z / g, px = -uz, pz = ux; // downhill, across
    const L = step * 0.24, W2 = step * 0.11;
    const y = heightAt(x, z) + 0.03;
    const tip = [x + ux * L, z + uz * L], l = [x - ux * L * 0.4 + px * W2, z - uz * L * 0.4 + pz * W2], r = [x - ux * L * 0.4 - px * W2, z - uz * L * 0.4 - pz * W2];
    for (const p of [tip, r, l]) pos.push(p[0], heightAt(p[0], p[1]) + 0.03 || y, p[1]);
    c.setHSL(clamp(0.55 - g * 8, 0, 0.55), 0.9, 0.6);
    for (let m = 0; m < 3; m++) col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// =====================================================================================================================
const golf = {
  setup(run) {
    ensureStyle();
    const cm = run.hooks.controllerManager;
    const G = run.golf = { mode: 'address', meter: createMeter(), ball: null, t: 0, cam: null, phi: 0, preview: null, dirty: true, flashAt: 0, bigAt: 0, upWas: true, fwdWas: false, backWas: false, downAt: 0 };
    // the props (only while the mission runs: they go with the run's group)
    G.club = createClub();
    G.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.35 }));
    G.ballMesh.castShadow = true;
    G.trail = createLine(0xffffff, TRAIL_MAX, 0.85);
    G.arc = createLine(0xffd23d, 256, 0.75);
    G.putLine = createLine(0xffffff, 64, 0.9);
    G.landing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    G.landing.renderOrder = 3;
    G.cupRing = new THREE.Mesh(new THREE.RingGeometry(HOLE_R + 0.01, HOLE_R + 0.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    G.cupRing.renderOrder = 3;
    G.arrows = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide }));
    G.arrows.renderOrder = 3;
    G.arrows.frustumCulled = false;
    G.flag = createFlag();
    run.group.add(G.club, G.ballMesh, G.trail, G.arc, G.putLine, G.landing, G.cupRing, G.arrows, G.flag);
    run.group.userData.trail = G.trail;
    G.arrows.visible = false;
    golf.buildHud(run);
    // aim by dragging across the view (a mouse or a finger off the joystick)
    const canvas = document.getElementById('canvas-container');
    let last = null;
    run.listen(canvas, 'pointerdown', (e) => { last = e.clientX; });
    run.listen(window, 'pointermove', (e) => {
      if (last === null) return;
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) { last = null; return; }
      if (golf.canAim(run)) { run.state.round.aim -= (e.clientX - last) * (golf.club(run).putt ? 0.0012 : 0.0025); G.dirty = true; }
      last = e.clientX;
    });
    run.listen(window, 'pointerup', () => { last = null; });
    G.cm = cm;
    run.cleanups.push(() => golf.release(run, true));
  },
  reset(run) {
    const G = run.golf;
    run.button('up', 'Swing'); // (the touch screens' jump button, js/actions.js)
    Object.assign(G, { mode: 'address', meter: createMeter(), t: 0, cam: null, phi: 0, dirty: true, flashAt: 0, upWas: true, holedT: 0, lastEvent: null });
    run.state.walkTo = null;
    run.state.hint = null;
    G.ball = golf.newBall(run);
    setLine(G.trail, []);
    G.ui.flash.textContent = '';
    G.ui.big.classList.remove('is-on');
    golf.showReport(run, null);
    golf.address(run, true);
  },
  teardown(run) { const cs = run.hooks.cameraSystem; cs.orbitYawOffset = 0; },
  /** The game's key bar and the joystick away while the golfer plays (the golf HUD says what the keys do); walking
   *  to the ball keeps them, and on touch so does the address before the swing (the joystick aims and picks the club) */
  ownControls(run) {
    const G = run.golf;
    if (!G || G.mode === 'walk' || G.mode === 'done') return false;
    return !(document.body.classList.contains('touch-enabled') && G.mode === 'address' && G.meter.phase === 'idle');
  },
  key(run, e) {
    if (run.phase === 'intro' || !run.state?.round) return;
    const m = /^Digit([1-5])$/.exec(e.code);
    if (m && golf.canAim(run)) { e.preventDefault(); golf.setClub(run, CLUBS[+m[1] - 1].id); return; }
    if (e.code === 'KeyC' && !e.repeat) { e.preventDefault(); golf.cart(run); }
  },
  club: (run) => clubById(run.state.round.club),
  canAim: (run) => live(run) && run.golf.mode === 'address' && run.golf.meter.phase === 'idle',
  setClub(run, id) {
    if (!golf.canAim(run)) return;
    run.state.round.club = id;
    run.golf.dirty = true;
    run.golf.picked = true; // (the player's own pick: kept)
  },
  newBall(run) {
    const r = run.state.round;
    return createBall(r.ball.x, r.ball.z, turfY(r.ball.x, r.ball.z), r.ball.lie);
  },
  env(run) {
    const r = run.state.round, h = currentHole(r);
    return { heightAt: turfY, surfaceAt, wind: r.wind, pin: h.pin, greenBoost: GREEN_SLOPE_BOOST };
  },

  // --- The modes ----------------------------------------------------------------------------------------------------
  /** The stance at the ball: the controllers' hooks hold and pose the golfer */
  address(run, snap = false) {
    const G = run.golf, cm = run.hooks.controllerManager, p = cm.entities.person;
    G.mode = 'address';
    G.meter = createMeter();
    G.phi = 0;
    if (G.at !== `${G.ball.x},${G.ball.z}`) { G.at = `${G.ball.x},${G.ball.z}`; G.picked = false; } // (a new lie: the round picks again)
    G.dirty = true;
    G.fwdWas = G.backWas = G.upWas = true; // (a key still held from the walk changes nothing: it must be let go first)
    run.state.walkTo = null;
    run.state.inFlight = false;
    cm.personDriver = (dt) => golf.drive(run, dt, cm);
    cm.personPoser = (dt, person) => golf.pose(run, dt, person);
    golf.placeGolfer(run);
    if (snap) G.cam = null;
    run.lastPos.copy(p.position);
    golf.buildGreenAids(run);
  },
  /** The golfer's feet beside the ball: side-on to the aim, the club's head behind the ball */
  placeGolfer(run) {
    const G = run.golf, p = run.hooks.controllerManager.entities.person, r = run.state.round;
    const geo = addressGeometry(p.rig, golf.club(run));
    const yaw = r.aim - Math.PI / 2;
    G.yaw = yaw;
    const b = G.ball;
    p.position.set(b.x - Math.sin(yaw) * geo.ball.z, surfaceHeight(b.x, b.z), b.z - Math.cos(yaw) * geo.ball.z);
    p.heading = yaw;
    p.speed = 0;
  },
  /** The hooks let go: the player walks (to the ball) as ever */
  release(run, final = false) {
    const cm = run.hooks.controllerManager, p = cm.entities.person;
    if (cm.personDriver) cm.personDriver = null;
    cm.personPoser = null;
    p.rig.placed = false;
    p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
    p.speed = 0;
    if (!final && run.golf) run.golf.club.visible = false;
  },
  walk(run) {
    const G = run.golf, cm = run.hooks.controllerManager, p = cm.entities.person;
    const d = Math.hypot(G.ball.x - p.position.x, G.ball.z - p.position.z);
    if (d < ADDRESS_REACH + 1.2) return golf.address(run);
    G.mode = 'walk';
    golf.release(run);
    p.heading = Math.atan2(G.ball.x - p.position.x, G.ball.z - p.position.z);
    run.hooks.cameraSystem.orbitYawOffset = 0;
    run.state.walkTo = { x: G.ball.x, z: G.ball.z };
    G.cam = null;
  },
  /** The cart: the golfer is taken to the ball (or the next tee), the camera swings over */
  cart(run) {
    const G = run.golf;
    if (!live(run) || (G.mode !== 'walk' && G.mode !== 'settled')) return;
    // (the camera swings over from where it is)
    const cam = run.hooks.cameraSystem.camera;
    if (!G.cam && cam) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      G.cam = { x: cam.position.x, y: cam.position.y, z: cam.position.z, lx: cam.position.x + f.x * 20, ly: cam.position.y + f.y * 20, lz: cam.position.z + f.z * 20 };
    }
    golf.address(run);
    G.mode = 'cart';
    G.t = 0;
    golf.say(run, 'Cart to the ball', true);
  },

  drive(run, dt, cm) {
    const p = cm.entities.person;
    p.speed = 0;
    p.verticalVel = 0;
    run.lastPos.copy(p.position);
  },
  pose(run, dt, p) {
    const G = run.golf;
    const club = golf.club(run);
    const pose = poseGolfer(p.rig, p.position.x, p.position.y, p.position.z, G.yaw, club, G.phi);
    placeClub(G.club, club, pose, G.yaw + Math.PI / 2);
    G.club.visible = true;
    G.head = pose.head;
  },

  update(run, ctx, dt, cm) {
    const G = run.golf, r = run.state.round, k = cm.keys;
    if (!r || !G.ball) return;
    const up = !!k.up, upEdge = up && !G.upWas, upFall = !up && G.upWas;
    G.upWas = up;
    const now = performance.now();
    if (live(run)) {
      if (G.mode === 'address') golf.updateAddress(run, dt, k, up, upEdge, upFall, now);
      else if (G.mode === 'down') golf.updateDown(run, dt);
      else if (G.mode === 'flight') golf.updateFlight(run, dt);
      else if (G.mode === 'settled') golf.updateSettled(run, dt);
      else if (G.mode === 'walk') {
        const p = cm.entities.person;
        if (Math.hypot(G.ball.x - p.position.x, G.ball.z - p.position.z) < ADDRESS_REACH) golf.address(run);
      } else if (G.mode === 'cart') { G.t += dt; if (G.t > 1.6) { G.mode = 'address'; } }
      else if (G.mode === 'holed') golf.updateHoled(run, dt);
    }
    golf.render(run, ctx, dt);
  },

  updateAddress(run, dt, k, up, upEdge, upFall, now) {
    const G = run.golf, r = run.state.round, m = G.meter, club = golf.club(run);
    if (m.phase === 'idle') {
      const steer = (+k.left || 0) - (+k.right || 0);
      if (steer) { r.aim += steer * dt * (club.putt ? 0.25 : 0.6); G.dirty = true; }
      const fwd = !!k.forward, back = !!k.backward;
      if ((fwd && !G.fwdWas) || (back && !G.backWas)) {
        const i = CLUBS.findIndex((c) => c.id === r.club);
        golf.setClub(run, CLUBS[(i + (fwd ? -1 : 1) + CLUBS.length) % CLUBS.length].id);
      }
      G.fwdWas = fwd; G.backWas = back;
      if (G.dirty) golf.placeGolfer(run);
      if (upEdge) { meterStart(m); G.downAt = now; run.state.hint = 'Stop the power at the red mark: press again (or let go)'; golf.showReport(run, null); G.ui.flash.textContent = ''; }
    } else if (m.phase === 'power') {
      if (upEdge) meterPower(m);
      else if (upFall && now - G.downAt > 250) meterPower(m);
      if (m.phase === 'accuracy') { run.state.hint = 'Strike on the green line: early hooks left, late slices right'; G.dirty = true; }
    } else if (m.phase === 'accuracy') {
      if (upEdge) meterAccuracy(m);
    }
    meterStep(m, dt);
    // the backswing follows the needle up; at the top it waits for the strike
    const top = club.putt ? 0.12 + 0.55 * Math.sqrt(m.power || m.value) : 2.25 * Math.min(1, 0.25 + 0.75 * (m.power || m.value));
    if (m.phase === 'power') G.phi = club.putt ? 0.12 + 0.55 * Math.sqrt(m.value) : 2.25 * Math.min(1, 0.25 + 0.75 * m.value);
    else if (m.phase === 'accuracy') G.phi = top;
    else if (m.phase === 'idle') { G.phi = 0; if (!run.state.hint || G.lastHintIdle !== true) { run.state.hint = club.putt ? 'Space / Swing: putt (A/D aim)' : 'Space / Swing: start the swing (W/S club, A/D aim)'; G.lastHintIdle = true; } }
    if (m.phase !== 'idle') G.lastHintIdle = false;
    if (m.phase === 'done') {
      G.mode = 'down';
      G.t = 0;
      G.top = G.phi;
      G.strike = { power: m.power, accuracy: m.accuracy };
      run.state.hint = null;
      if (run.phase === 'ready') { run.phase = 'running'; run.startedAt = run.gameClock || 0; run.ui.panel.dataset.phase = 'running'; }
    }
  },
  updateDown(run, dt) {
    const G = run.golf, club = golf.club(run);
    const T = club.putt ? 0.35 : 0.24;
    G.t += dt;
    G.phi = G.top * (1 - smooth(G.t / T));
    if (G.t >= T) golf.launch(run);
  },
  launch(run) {
    const G = run.golf, r = run.state.round, club = golf.club(run);
    beginShot(r);
    run.state.inFlight = true;
    G.shot = { from: { x: G.ball.x, z: G.ball.z }, heading: r.aim, club, power: G.strike.power, accuracy: G.strike.accuracy, lie: G.ball.lie, wind: r.wind, pin: currentHole(r).pin, need: G.need?.reach ? G.need.power : null };
    strike(G.ball, { club, power: G.strike.power, accuracy: G.strike.accuracy, heading: r.aim });
    G.mode = 'flight';
    G.t = 0;
    G.follow = 0;
    G.shotHeading = r.aim;
    run.state.hint = null;
    golf.say(run, club.putt ? `${Math.round(G.strike.power * 100)}% · ${accuracyLabel(G.strike.accuracy)}` : `${club.label} ${Math.round(G.strike.power * 100)}% · ${accuracyLabel(G.strike.accuracy)}`, G.strike.accuracy === 0);
    run.audio?.thump?.();
    golf.hideAids(run);
  },
  updateFlight(run, dt) {
    const G = run.golf, club = golf.club(run);
    G.t += dt;
    // the follow-through
    G.phi = club.putt ? -0.5 * smooth(G.t / 0.35) * (0.3 + G.strike.power) : -2.55 * smooth(G.t / 0.45);
    const b = G.ball;
    stepBall(b, dt, golf.env(run));
    setLine(G.trail, b.path.length > TRAIL_MAX ? b.path.slice(-TRAIL_MAX) : b.path.concat([{ x: b.x, y: b.y, z: b.z }]));
    if (b.state !== 'air' && b.state !== 'roll') {
      G.mode = 'settled';
      G.t = 0;
      if (b.state === 'water') golf.say(run, 'Splash! In the water', false);
      else if (b.state === 'out') golf.say(run, 'Out of bounds', false);
      else if (b.state === 'holed') golf.big(run, 'In the hole!');
      else if (b.carry) golf.say(run, `${Math.round(Math.hypot(b.x - b.from.x, b.z - b.from.z))} m · ${SURFACES[b.lie]?.label || ''}`, b.lie === 'green' || b.lie === 'fairway');
      if (G.shot) golf.showReport(run, shotReport({ ...G.shot, carry: b.carry, end: b.state === 'holed' ? G.shot.pin : { x: b.x, z: b.z }, state: b.state }, golf.env(run)));
    }
  },
  updateSettled(run, dt) {
    const G = run.golf, r = run.state.round, b = G.ball;
    G.t += dt;
    if (b.state === 'holed') { b.y = Math.max(b.y - dt * 0.3, turfY(b.x, b.z) - 0.08); }
    if (G.t < (b.state === 'holed' ? 2.2 : 1.3)) return;
    const ev = endShot(r, b);
    G.lastEvent = ev;
    run.state.inFlight = false;
    if (ev.result) {
      const res = ev.result;
      golf.big(run, res.name);
      golf.say(run, `${res.name}: ${res.strokes} on a par ${res.par}${res.bonus ? ` · bonus +${res.bonus}` : ''}`, res.strokes <= res.par);
      G.mode = 'holed';
      G.t = 0;
      return;
    }
    if (ev.text) golf.say(run, ev.text, ev.kind === 'rest');
    G.ball = golf.newBall(run);
    setLine(G.trail, []);
    golf.walk(run);
  },
  updateHoled(run, dt) {
    const G = run.golf, r = run.state.round;
    G.t += dt;
    if (G.t < 2.4) return;
    G.ui.big.classList.remove('is-on');
    if (!nextHole(r)) { G.mode = 'done'; golf.release(run); return; }
    G.ball = golf.newBall(run);
    setLine(G.trail, []);
    golf.showReport(run, null); // (a new hole: the last one's report goes)
    G.mode = 'settled'; // (the cart takes the golfer on to the next tee)
    golf.cart(run);
    golf.say(run, `${currentHole(r).name} · Par ${currentHole(r).par} · ${Math.round(currentHole(r).length)} m`, true);
  },

  // --- The aids: the preview arc and its landing, the putt's line and the slope ---------------------------------------
  buildGreenAids(run) {
    const G = run.golf, r = run.state.round, h = currentHole(r);
    const putt = golf.club(run).putt;
    G.arrows.visible = false;
    if (G.ball.lie === 'green' || putt) {
      G.arrows.geometry.dispose();
      G.arrows.geometry = slopeArrows(G.ball, h.pin, turfY);
      G.arrows.visible = G.arrows.geometry.attributes.position.count > 0;
    }
  },
  hideAids(run) {
    const G = run.golf;
    G.arc.visible = G.landing.visible = G.putLine.visible = G.arrows.visible = false;
  },
  updateAids(run) {
    const G = run.golf, r = run.state.round, club = golf.club(run), b = G.ball, m = G.meter;
    const show = G.mode === 'address' || G.mode === 'cart' || G.mode === 'down';
    if (!show) { golf.hideAids(run); return; }
    const env = golf.env(run);
    if (G.dirty) {
      G.dirty = false;
      const h = currentHole(r);
      // the plan, from the flight model itself: the carry at each power (the wind and the lie in), the power the pin
      // needs, and what the wind and the lie do to a full swing
      G.table = shotTable(b, { club, heading: r.aim, lie: b.lie }, env);
      G.need = powerFor(G.table, Math.hypot(h.pin.x - b.x, h.pin.z - b.z) + (club.putt ? 0.3 : 0)); // (a putt a little past: it drops)
      // (the round's own pick, the putter on a green, cannot get there, say over the rough from the next hole's green: the wedge)
      if (club.putt && !G.need.reach && !G.picked) { r.club = 'wedge'; G.dirty = true; return; }
      G.full = G.table[G.table.length - 1].d;
      if (club.putt) { G.windFull = null; G.lieLoss = 0; } // (the putt's forecast runs along the ground: the fringe and the slope in)
      else {
        const windy = landingFor(b, { club, power: 1, heading: r.aim, lie: b.lie }, env);
        const calm = landingFor(b, { club, power: 1, heading: r.aim, lie: b.lie }, { ...env, wind: null });
        const clean = landingFor(b, { club, power: 1, heading: r.aim, lie: b.lie === 'tee' ? 'tee' : 'fairway' }, { ...env, wind: null });
        G.windFull = alongAim(windy.x - calm.x, windy.z - calm.z, r.aim);
        G.lieLoss = clean.d > 1 ? Math.max(0, 1 - calm.d / clean.d) : 0;
      }
      if (club.putt) {
        const L = Math.min(Math.hypot(h.pin.x - b.x, h.pin.z - b.z) + 1.5, PUTT_MAX);
        const pts = [];
        for (let i = 0; i <= 40; i++) { const s = (L * i) / 40, x = b.x + Math.sin(r.aim) * s, z = b.z + Math.cos(r.aim) * s; pts.push({ x, y: turfY(x, z) + 0.02, z }); }
        setLine(G.putLine, pts);
        G.preview = null;
      }
      G.previewPower = -1;
      if (G.ball.lie === 'green' || club.putt) golf.buildGreenAids(run);
      else G.arrows.visible = false;
    }
    // the arc and its ring: at the address the shot at the red mark (the pin's power; a full swing when it is out of
    // reach), so that the ring shows the wind's drift to aim off by; in the swing they follow the needle (then stay)
    const pw = Math.max(0.02, m.phase === 'idle' ? (G.need?.reach ? G.need.power : 1) : m.phase === 'power' ? m.value : m.power);
    if (Math.abs(pw - G.previewPower) > 0.003) {
      G.previewPower = pw;
      // (the putter: no arc, the ring where the putt would stop, along the ground)
      G.preview = club.putt ? { points: null, landing: landingFor(b, { club, power: pw, heading: r.aim, lie: b.lie }, env) } : previewFlight(b, { club, power: pw, heading: r.aim, lie: b.lie }, env);
      if (G.preview.points) setLine(G.arc, G.preview.points);
      const l = G.preview.landing;
      G.carryNow = l ? Math.hypot(l.x - b.x, l.z - b.z) : carryAt(G.table, pw);
      if (l) {
        const d = G.carryNow;
        G.landing.position.set(l.x, turfY(l.x, l.z) + (club.putt ? 0.03 : 0.15), l.z);
        const sc = club.putt ? 0.3 : Math.max(1.5, d * 0.03);
        G.landing.scale.set(sc, 1, sc);
      }
    }
    G.putLine.visible = !!club.putt;
    G.arc.visible = !club.putt && !!G.preview?.points;
    G.landing.visible = !!G.preview?.landing;
  },

  // --- Rendering: the ball, the cup, the HUD, the camera --------------------------------------------------------------
  render(run, ctx, dt) {
    const G = run.golf, r = run.state.round, b = G.ball, h = currentHole(r);
    G.ballMesh.position.set(b.x, b.y, b.z);
    const cam = ctx.camera;
    const dc = cam ? Math.hypot(cam.position.x - b.x, cam.position.y - b.y, cam.position.z - b.z) : 10;
    const sc = clamp(dc / 14, 1, 22);
    G.ballMesh.scale.setScalar(sc);
    G.ballMesh.visible = !(b.state === 'holed' && G.mode === 'holed');
    if (h) {
      G.cupRing.position.set(h.pin.x, turfY(h.pin.x, h.pin.z) + 0.02, h.pin.z);
      const near = Math.hypot(h.pin.x - b.x, h.pin.z - b.z) < 40;
      G.cupRing.visible = near;
      G.cupRing.scale.setScalar(clamp(dc / 30, 1, 4));
    }
    if (G.mode === 'walk' || G.mode === 'done') G.club.visible = false;
    golf.renderFlag(run, cam, dt);
    golf.updateAids(run);
    golf.renderHud(run);
  },
  /** The hole's flag: real size near it, growing with the distance (so that it stays a few dozen pixels tall from the
   *  tee), flying with the wind; the beam above it fades in from 30 m off */
  renderFlag(run, cam, dt) {
    const G = run.golf, r = run.state.round, h = currentHole(r), F = G.flag;
    F.visible = !!h && G.mode !== 'done';
    if (!F.visible) return;
    const y = turfY(h.pin.x, h.pin.z);
    F.position.set(h.pin.x, y, h.pin.z);
    const dc = cam ? Math.hypot(cam.position.x - h.pin.x, cam.position.y - y, cam.position.z - h.pin.z) : 30;
    const s = clamp(dc / 28, 1, 14);
    const { pole, flag, beam } = F.userData;
    pole.scale.set(s, s, s);
    flag.scale.set(s, s, s);
    G.flagT = (G.flagT || 0) + dt;
    const w = r.wind;
    flag.rotation.y = Math.atan2(-w.z, w.x) + Math.sin(G.flagT * 3.1) * 0.12; // (local +x: the flag flies down the wind)
    const fade = smooth((dc - 30) / 50);
    beam.visible = fade > 0.01;
    beam.material.opacity = 0.32 * fade;
    beam.scale.set(0.16 * s, 70 * Math.max(1, s * 0.6), 0.16 * s);
    beam.position.y = 2.4 * s;
    G.flagTop = y + 2.4 * s;
  },
  /** The screen's markers: the pin with its distance from the ball (on the screen's edge when it is out of the view),
   *  and the carry at the yellow ring */
  renderMarks(run, cam) {
    const G = run.golf, u = G.ui, r = run.state.round, h = currentHole(r), b = G.ball;
    const showPin = !!(cam && h && live(run) && G.mode !== 'holed' && G.mode !== 'done');
    u.pinMark.hidden = !showPin;
    if (showPin) {
      const p = screenPoint(cam, h.pin.x, G.flagTop ?? turfY(h.pin.x, h.pin.z) + 2.4, h.pin.z, 34, 90);
      const d = Math.round(Math.hypot(h.pin.x - b.x, h.pin.z - b.z));
      const text = `${d} m`;
      if (u.pinText.textContent !== text) u.pinText.textContent = text;
      u.pinMark.classList.toggle('is-edge', p.edge);
      u.pinMark.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, ${p.edge ? '-50%' : '-100%'})`;
      u.pinArrow.style.transform = p.edge ? `rotate(${p.angle.toFixed(3)}rad)` : '';
    }
    const showLand = !!(cam && G.landing.visible && G.preview?.landing);
    u.landMark.hidden = !showLand;
    if (showLand) {
      const l = G.landing.position;
      const p = screenPoint(cam, l.x, l.y + 0.5, l.z, 20, 60);
      u.landMark.hidden = p.edge;
      const text = `${Math.round(G.carryNow ?? 0)} m`;
      if (u.landText.textContent !== text) u.landText.textContent = text;
      u.landMark.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  },

  buildHud(run) {
    const G = run.golf;
    const hud = el('div', 'panel golf-hud');
    const card = el('div', 'golf-row golf-card');
    const clubs = el('div', 'golf-clubs');
    const chips = CLUBS.map((c, i) => {
      const b = el('button', 'golf-club');
      b.type = 'button';
      b.append(document.createTextNode(c.short), el('small', null, c.putt ? `${PUTT_MAX} m` : `${c.carry} m`));
      b.title = `${c.label} (${i + 1})`;
      b.dataset.club = c.id;
      run.listen(b, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); golf.setClub(run, c.id); });
      clubs.append(b);
      return b;
    });
    const info = el('div', 'golf-row');
    const wind = el('span', 'golf-wind');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 2.5 19 20l-7-4-7 4z');
    arrow.append(path);
    const windText = el('span'), windWords = el('span', 'golf-wind-words');
    wind.append(el('span', 'golf-wind-label', 'Wind'), arrow, windText, windWords);
    const pin = el('span', 'golf-pin-dist'), lie = el('span');
    info.append(wind, pin, lie);
    const meter = el('div', 'golf-meter');
    const zone = el('span', 'golf-meter-zone'), fill = el('span', 'golf-meter-fill'), line = el('span', 'golf-meter-line'), power = el('span', 'golf-meter-power'), needle = el('span', 'golf-meter-needle');
    const target = el('span', 'golf-meter-target');
    target.title = 'The power the pin needs';
    meter.append(fill, zone, line, target, power, needle);
    const span = 1 - METER.below;
    const at = (v) => `${((v - METER.below) / span) * 100}%`;
    line.style.left = at(0);
    zone.style.left = at(-METER.perfect); zone.style.width = `${((2 * METER.perfect) / span) * 100}%`;
    fill.style.left = at(0);
    const flash = el('div', 'golf-flash');
    const readout = el('div', 'golf-readout');
    // the plan: the club's full swing from here (the wind and the lie in), what the pin needs, the wind's and the lie's share
    const plan = el('div', 'golf-row golf-plan');
    const planClub = el('span'), planNeed = el('span', 'golf-need'), planWind = el('span'), planLie = el('span');
    plan.append(planClub, planNeed, planWind, planLie);
    // the swing's three presses, the one due lit
    const steps = el('div', 'golf-steps');
    const stepTexts = ['Start the swing', 'Stop the power at the red mark', 'Strike on the green line (early: hook left · late: slice right)'];
    const stepKeys = [];
    const stepEls = stepTexts.map((t, i) => { const s = el('span', 'golf-step'); const k = el('b', null, 'Space'); stepKeys.push(k); s.append(el('b', null, `${i + 1}`), k, el('span', null, t)); steps.append(s); return s; });
    // the report after a shot: what it did and why
    const report = el('div', 'golf-report');
    report.hidden = true;
    const reportLines = el('div', 'golf-report-lines'), reportTip = el('div', 'golf-report-tip');
    report.append(reportLines, reportTip);
    // the screen's markers
    const pinMark = el('div', 'golf-mark golf-mark-pin');
    const pinArrow = el('span', 'golf-mark-arrow'), pinLabel = el('span', 'golf-mark-label'), pinText = el('span');
    const flagIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    flagIcon.setAttribute('viewBox', '0 0 16 16');
    flagIcon.innerHTML = '<path d="M3 1h1.6v14H3z" fill="#fff"/><path d="M4.6 1.5 13 4.6 4.6 7.8z" fill="#fff"/>';
    pinLabel.append(flagIcon, el('span', null, 'Pin'), pinText);
    pinMark.append(pinArrow, pinLabel, el('span', 'golf-mark-stem'));
    const landMark = el('div', 'golf-mark golf-mark-land');
    const landText = el('span', 'golf-mark-label');
    landMark.append(landText);
    pinMark.hidden = landMark.hidden = true;
    const foot = el('div', 'golf-row');
    const cart = el('button', 'golf-cart', 'Cart to the ball (C)');
    cart.type = 'button';
    run.listen(cart, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); golf.cart(run); });
    foot.append(cart);
    run.hints([[['W', 'S', '1-5'], 'club'], [['A', 'D', 'Drag'], 'aim'], [['Space'], 'swing'], [['C'], 'cart']]);
    const mid = el('div', 'golf-row');
    mid.append(clubs, info);
    const low = el('div', 'golf-row');
    low.append(meter, readout, flash);
    hud.append(card, mid, plan, low, steps, report, foot);
    const big = el('div', 'golf-big');
    document.body.append(hud, big, pinMark, landMark);
    run.cleanups.push(() => { hud.remove(); big.remove(); pinMark.remove(); landMark.remove(); });
    G.ui = { steps, hud, card, chips, arrow, windText, windWords, pin, lie, meter, fill, power, needle, target, flash, readout, cart, big, at,
      planClub, planNeed, planWind, planLie, stepEls, stepKeys, report, reportLines, reportTip, pinMark, pinArrow, pinText, landMark, landText };
  },
  renderHud(run) {
    const G = run.golf, u = G.ui, r = run.state.round, h = currentHole(r);
    if (!h) return;
    const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    const tp = toPar(r);
    set(u.card, `${h.name} · Par ${h.par} · ${Math.round(h.length)} m · Stroke ${r.strokes + (G.mode === 'flight' || G.mode === 'settled' ? 0 : 1)} · Total ${formatToPar(tp)}`);
    for (const c of u.chips) c.classList.toggle('is-on', c.dataset.club === r.club);
    const rel = (r.wind.dir - r.aim) * 180 / Math.PI;
    u.arrow.style.transform = `rotate(${-rel}deg)`;
    set(u.windText, `${r.wind.speed.toFixed(1)} m/s`);
    set(u.pin, `Pin ${Math.round(distanceToPin(r))} m`);
    const lieKey = G.mode === 'flight' ? G.ball.lie : r.ball?.lie;
    set(u.lie, SURFACES[lieKey]?.label || '');
    const m = G.meter;
    const v = m.phase === 'idle' ? 0 : m.phase === 'done' ? m.power : m.value;
    u.needle.style.left = u.at(v);
    const pw = m.phase === 'power' ? m.value : m.power;
    u.fill.style.width = `${(Math.max(0, pw) / (1 - METER.below)) * 100}%`;
    u.power.hidden = !(m.phase === 'accuracy' || m.phase === 'done');
    if (!u.power.hidden) u.power.style.left = u.at(m.power);
    // the wind in words against the aim, the plan, the pin's mark on the meter, the needle's carry, the step due
    set(u.windWords, windAgainstAim(r.wind, r.aim).words);
    const club = golf.club(run);
    const aiming = G.mode === 'address' || G.mode === 'down';
    if (aiming && G.table) {
      set(u.planClub, `${club.label}: full ${club.putt ? 'stroke' : 'swing'} ${Math.round(G.full)} m`);
      set(u.planNeed, G.need.reach ? `the pin needs ${Math.round(G.need.power * 100)} %` : 'the pin is out of reach');
      u.planNeed.classList.toggle('is-out', !G.need.reach);
      const wl = G.windFull ? Math.round(G.windFull.long) : 0;
      set(u.planWind, wl ? `wind ${wl > 0 ? '+' : '−'}${Math.abs(wl)} m` : '');
      const loss = Math.round((G.lieLoss || 0) * 100);
      set(u.planLie, loss >= 2 ? `${SURFACES[G.ball.lie]?.label || ''} −${loss} %` : '');
    } else { set(u.planClub, ''); set(u.planNeed, ''); set(u.planWind, ''); set(u.planLie, ''); }
    u.target.hidden = !(aiming && G.need?.reach);
    if (!u.target.hidden) u.target.style.left = u.at(G.need.power);
    const swinging = m.phase === 'power' || m.phase === 'accuracy';
    set(u.readout, swinging ? `${Math.round(Math.max(0, pw) * 100)} % → ${Math.round(G.carryNow ?? 0)} m` : '');
    const due = !aiming ? -1 : m.phase === 'idle' ? 0 : m.phase === 'power' ? 1 : m.phase === 'accuracy' ? 2 : -1;
    const key = document.body.classList.contains('touch-enabled') ? 'Swing' : 'Space';
    u.stepEls.forEach((s, i) => s.classList.toggle('is-on', i === due));
    u.steps.hidden = due < 0;
    for (const k of u.stepKeys) set(k, key);
    u.cart.hidden = !(G.mode === 'walk');
    if (G.flashAt && performance.now() - G.flashAt > 2600) { u.flash.textContent = ''; G.flashAt = 0; }
    if (G.bigAt && performance.now() - G.bigAt > 2200) { u.big.classList.remove('is-on'); G.bigAt = 0; }
  },
  /** The report after a shot (null: away, at the next swing) */
  showReport(run, rep) {
    const u = run.golf.ui;
    u.report.hidden = !rep;
    u.reportLines.replaceChildren(...(rep ? rep.lines.map((t) => el('span', null, t)) : []));
    u.reportTip.textContent = rep?.tip || '';
  },
  say(run, text, good) {
    const f = run.golf.ui.flash;
    f.textContent = text;
    f.className = `golf-flash ${good ? 'is-good' : 'is-bad'}`;
    run.golf.flashAt = performance.now();
  },
  big(run, text) {
    const b = run.golf.ui.big;
    b.textContent = text;
    b.classList.add('is-on');
    run.golf.bigAt = performance.now();
  },

  /** The camera: behind the ball along the aim at the address; after the ball in the air and while it rolls; down at
   *  the cup when it drops; the cart's swing between. Walking: the game's own camera */
  after(run, ctx, dt) {
    const G = run.golf;
    if (run.phase === 'intro' || !G?.ball || G.mode === 'done' || ctx.mode !== 'person') { if (G?.ui) golf.renderMarks(run, null); return; }
    // (the screen's markers here, once the camera stands where it is drawn from this frame)
    if (G.mode === 'walk') { golf.renderMarks(run, ctx.camera); return; }
    const r = run.state.round, b = G.ball, h = currentHole(r);
    const club = golf.club(run);
    let ex, ey, ez, lx, ly, lz, rate = 3;
    const cam0 = ctx.camera;
    if (G.mode === 'address' || G.mode === 'cart' || G.mode === 'down') {
      const fx = Math.sin(r.aim), fz = Math.cos(r.aim);
      // (high enough over the ball that the arc bends away into the distance instead of standing up like a pole)
      const back = club.putt ? 2.6 : 5.6, up = club.putt ? 1.2 : 2.5, ahead = club.putt ? Math.min(6, distanceToPin(r)) + 1 : 30;
      ex = b.x - fx * back; ez = b.z - fz * back; ey = Math.max(turfY(ex, ez), b.y) + up;
      lx = b.x + fx * ahead; lz = b.z + fz * ahead; ly = club.putt ? turfY(lx, lz) : Math.max(b.y, turfY(lx, lz)) + 0.6;
      // (a phone upright: the view tipped down a little, the horizon, the flag and the ring higher, clear of the HUD)
      if (!club.putt && cam0 && cam0.aspect < 0.8) ly -= 3.2;
      rate = G.mode === 'cart' ? 2.2 : 5;
    } else if (G.mode === 'holed' && h) {
      const fx = Math.sin(G.shotHeading ?? r.aim), fz = Math.cos(G.shotHeading ?? r.aim);
      ex = h.pin.x - fx * 2.6; ez = h.pin.z - fz * 2.6; ey = turfY(ex, ez) + 1.1;
      lx = h.pin.x; lz = h.pin.z; ly = turfY(lx, lz);
      rate = 2;
    } else {
      const hd = G.shotHeading ?? r.aim, fx = Math.sin(hd), fz = Math.cos(hd);
      const putt = club.putt;
      const back = putt ? 3.2 : 15, up = putt ? 1.3 : 5.5;
      ex = b.x - fx * back; ez = b.z - fz * back; ey = Math.max(turfY(ex, ez) + 1.5, b.y + up * (putt ? 1 : 0.5) + (putt ? 0 : 2.5));
      lx = b.x; ly = b.y; lz = b.z;
      rate = putt ? 4 : 3.2;
    }
    const s = G.cam || (G.cam = { x: ex, y: ey, z: ez, lx, ly, lz });
    const k = 1 - Math.exp(-dt * rate);
    s.x += (ex - s.x) * k; s.y += (ey - s.y) * k; s.z += (ez - s.z) * k;
    const kl = 1 - Math.exp(-dt * rate * 2.5);
    s.lx += (lx - s.lx) * kl; s.ly += (ly - s.ly) * kl; s.lz += (lz - s.lz) * kl;
    const cam = ctx.camera;
    cam.position.set(s.x, s.y, s.z);
    cam.lookAt(s.lx, s.ly, s.lz);
    cam.updateMatrixWorld();
    golf.renderMarks(run, cam);
  }
};

export const GOLF_FEATURES = { golf };
