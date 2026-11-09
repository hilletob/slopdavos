// Shared by tools/build-rocketbox.mjs (the figures) and tools/build-person-clips.mjs (their motion): reading a
// Microsoft Rocketbox FBX in Node, and the map from its 3ds Max biped onto the 15-bone skeleton & bind pose of
// js/pedestrians.js (its male body, bindJoints(false)).
import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// ---- the game's skeleton & bind pose (js/pedestrians.js BONE, bindJoints(false), PART) ------------------------------
export const BONE = { PELVIS: 0, CHEST: 1, HEAD: 2, UPPER_ARM_L: 3, FOREARM_L: 4, UPPER_ARM_R: 5, FOREARM_R: 6, THIGH_L: 7, SHIN_L: 8, FOOT_L: 9, TOE_L: 10, THIGH_R: 11, SHIN_R: 12, FOOT_R: 13, TOE_R: 14 };
export const BONE_COUNT = 15;
export const PART = { BODY: 0, HEAD: 5 };
export const THIGH = 0.42, SHIN = 0.42, ANKLE_H = 0.08, HIP_X = 0.09, UPPER_ARM = 0.3, FOREARM = 0.255, ARM_BIND_ABDUCTION = 0.14;
export const HIP_Y = ANKLE_H + SHIN + THIGH;
export const PELVIS_Y = 0.96;
const SHOULDER = [0.185, 1.43, -0.015];
const SHOULDER_F = [0.165, 1.415, -0.015]; // (js/pedestrians.js shoulderJoint(female))
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const armDir = (side) => V(side * Math.sin(ARM_BIND_ABDUCTION), -Math.cos(ARM_BIND_ABDUCTION), 0);
export const TGT = {
  head: V(0, 1.52, -0.012),
  shoulder: (side) => V(side * SHOULDER[0], SHOULDER[1], SHOULDER[2]),
  hip: (side) => V(side * HIP_X, HIP_Y, 0),
  knee: (side) => V(side * HIP_X, ANKLE_H + SHIN, 0),
  ankle: (side) => V(side * HIP_X, ANKLE_H, 0),
  toe: (side) => V(side * HIP_X, 0.02, 0.135)
};

/** An FBX file parsed by three's FBXLoader (textures left out) */
export function loadFbx(file) {
  globalThis.self ??= globalThis;
  globalThis.window ??= globalThis;
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  const buf = fs.readFileSync(file);
  const scene = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  scene.updateMatrixWorld(true);
  return scene;
}

/** biped bone name -> game bone */
export function targetOf(name) {
  const n = name.replace(/^Bip01_?/, '');
  const m = /^([LR])_(\w+?)(\d*)$/.exec(n);
  if (m) {
    const L = m[1] === 'L', part = m[2];
    if (part === 'Thigh') return L ? BONE.THIGH_L : BONE.THIGH_R;
    if (part === 'Calf') return L ? BONE.SHIN_L : BONE.SHIN_R;
    if (part === 'Foot') return L ? BONE.FOOT_L : BONE.FOOT_R;
    if (part === 'Toe') return L ? BONE.TOE_L : BONE.TOE_R;
    if (part === 'Clavicle') return BONE.CHEST;
    if (part === 'UpperArm') return L ? BONE.UPPER_ARM_L : BONE.UPPER_ARM_R;
    if (part === 'Forearm' || part === 'Hand' || part === 'Finger') return L ? BONE.FOREARM_L : BONE.FOREARM_R;
  }
  if (n === '' || n === 'Pelvis' || n === 'Spine') return BONE.PELVIS;
  if (n === 'Spine1' || n === 'Spine2') return BONE.CHEST;
  return BONE.HEAD; // neck, head, eyes, jaw & the face
}

/** The biped bone whose motion drives each game bone (tools/build-person-clips.mjs) */
export const DRIVER = ['Pelvis', 'Spine2', 'Head', 'L_UpperArm', 'L_Forearm', 'R_UpperArm', 'R_Forearm', 'L_Thigh', 'L_Calf', 'L_Foot', 'L_Toe0', 'R_Thigh', 'R_Calf', 'R_Foot', 'R_Toe0'];

/**
 * The skinned mesh of an avatar and its maps onto the game's bind pose: joint(name) & bindQuaternion(name) of a biped
 * bone in the bind pose (cm, Y up, facing +Z, +X on the avatar's left — the game's axes), and MAP[gameBone] =
 * { fn(p): biped point (cm) -> game bind pose (m), q: the rotation it turns the limb by }. `female`: onto the female
 * bind pose (narrower shoulders). `scale`: the avatar's size against the game's body (by the shoulders' height), the
 * PersonRig scale that gives it back; the maps divide it out, so every figure is built at the bind pose's size.
 */
export function avatarRig(scene, { female = false } = {}) {
  const SH = female ? SHOULDER_F : SHOULDER;
  let mesh = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) throw new Error('no skinned mesh');
  const bones = mesh.skeleton.bones;
  const bindMatrix = (name) => {
    const i = bones.findIndex((b) => b.name === `Bip01_${name}`);
    if (i < 0) throw new Error('no bone Bip01_' + name);
    return new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert();
  };
  const joint = (name) => new THREE.Vector3().setFromMatrixPosition(bindMatrix(name));
  const bindQuaternion = (name) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    bindMatrix(name).decompose(p, q, s);
    return q;
  };

  // Torso & head: y stretched so the biped's hips & shoulders land on the game's, x & z scaled to the bind pose's size
  const srcHipY = joint('L_Thigh').y, srcShoulderY = joint('L_UpperArm').y;
  const scale = (srcShoulderY * 0.01) / SH[1];
  const U = 0.01 / scale; // (cm of this avatar -> m of the bind pose)
  const torsoK = (SH[1] - HIP_Y) / ((srcShoulderY - srcHipY) * U);
  const torso = (p) => V(p.x * U, HIP_Y + (p.y - srcHipY) * U * torsoK, p.z * U);
  const neckSrc = joint('Neck');
  const neckTgt = torso(neckSrc);
  const head = (p) => neckTgt.clone().add(p.clone().sub(neckSrc).multiplyScalar(U));
  // A limb segment: from joint a to joint b in the biped onto from A along unit dir D, length len, in the game
  const segment = (a, b, A, D, len) => {
    const dir = b.clone().sub(a);
    const k = len / (dir.length() * U);
    const q = new THREE.Quaternion().setFromUnitVectors(dir.clone().normalize(), D);
    const axis = dir.clone().normalize();
    const fn = (p) => {
      const d = p.clone().sub(a).multiplyScalar(U);
      const along = d.dot(axis);
      d.addScaledVector(axis, along * (k - 1)); // stretched along the bone only
      return d.applyQuaternion(q).add(A);
    };
    return { fn, q };
  };
  const MAP = [];
  MAP[BONE.PELVIS] = { fn: torso, q: new THREE.Quaternion() };
  MAP[BONE.CHEST] = { fn: torso, q: new THREE.Quaternion() };
  MAP[BONE.HEAD] = { fn: head, q: new THREE.Quaternion() };
  for (const side of [1, -1]) {
    const s = side > 0 ? 'L' : 'R', L = side > 0;
    const hip = joint(`${s}_Thigh`), knee = joint(`${s}_Calf`), ankle = joint(`${s}_Foot`), toe = joint(`${s}_Toe0`);
    const shoulder = joint(`${s}_UpperArm`), elbow = joint(`${s}_Forearm`), wrist = joint(`${s}_Hand`);
    const down = V(0, -1, 0);
    MAP[L ? BONE.THIGH_L : BONE.THIGH_R] = segment(hip, knee, TGT.hip(side), down, THIGH);
    MAP[L ? BONE.SHIN_L : BONE.SHIN_R] = segment(knee, ankle, TGT.knee(side), down, SHIN);
    const footDir = TGT.toe(side).sub(TGT.ankle(side));
    const foot = segment(ankle, toe, TGT.ankle(side), footDir.clone().normalize(), footDir.length());
    MAP[L ? BONE.FOOT_L : BONE.FOOT_R] = foot;
    // the toes: turned with the foot, unstretched, from the ball of the foot
    MAP[L ? BONE.TOE_L : BONE.TOE_R] = { fn: (p) => p.clone().sub(toe).multiplyScalar(U).applyQuaternion(foot.q).add(TGT.toe(side)), q: foot.q };
    const shoulderTgt = V(side * SH[0], SH[1], SH[2]);
    MAP[L ? BONE.UPPER_ARM_L : BONE.UPPER_ARM_R] = segment(shoulder, elbow, shoulderTgt, armDir(side), UPPER_ARM);
    const elbowTgt = shoulderTgt.clone().addScaledVector(armDir(side), UPPER_ARM);
    MAP[L ? BONE.FOREARM_L : BONE.FOREARM_R] = segment(elbow, wrist, elbowTgt, armDir(side), FOREARM);
  }
  return { mesh, joint, bindQuaternion, MAP, torsoK, srcHipY, scale };
}
