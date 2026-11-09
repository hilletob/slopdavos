// Builds assets/models/person-clips.bin: motion-captured clips for the game's people (standing idles, talking,
// listening, writing a ticket), played by PersonRig.setClips (js/pedestrians.js) on the lofted crowds and the converted
// Rocketbox figures alike; loaded by js/person-clips.js.
//
// Source: the Microsoft Rocketbox Avatar Library's animations, https://github.com/microsoft/Microsoft-Rocketbox
// (Assets/Animations/all_animations_max_motextr_static: the root's travel taken out), MIT licence
// (Copyright (c) Microsoft Corporation). The clips go to tools/data/cache/rocketbox/animations/<name>.fbx:
//   B=https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Animations/all_animations_max_motextr_static
//   curl -o m_idle_neutral_03.fbx $B/m_idle_neutral_03.max.fbx   (... each of CLIPS below)
// and the reference avatars (their bind pose) to tools/data/cache/rocketbox/<Avatar>/<Avatar>.fbx.
//
// Retargeting: a game bone b is driven by one biped bone (tools/rocketbox-rig.mjs DRIVER). Its world rotation in the
// clip against its rotation in the avatar's bind pose turns the avatar's limb; tools/rocketbox-rig.mjs MAP[b].q turned
// the avatar's limb onto the game's bind pose, so the game bone's rotation is clip * bind^-1 * MAP[b].q^-1, in the
// game's bind frame (facing +Z). The joints are not stored: PersonRig chains them from the pelvis with its own segment
// lengths (any build, either sex, any scale). The root is the middle of the hips (m, relative to the ground under the
// person), lowered or raised once per clip so the lower ankle never sinks below the ankle's height over the ground.
// File: u32 header length, JSON header { fps, bones, clips: [{ name, frames, offset }] }, padding to 4, then per frame
// 15 quaternions and the hip centre as int16 (quaternions x 32767, the hip centre in mm).
// Usage: node tools/build-person-clips.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { ANKLE_H, BONE_COUNT, DRIVER, HIP_Y, TGT, avatarRig, loadFbx } from './rocketbox-rig.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, 'tools/data/cache/rocketbox');
const OUT = path.join(root, 'assets/models/person-clips.bin');
const FPS = 20;
const MAX_SECONDS = 30; // (longer clips cut: the next one follows anyway)
const REFERENCE = { m: 'Police_Male_01', f: 'Business_Female_01' };
const CLIPS = [
  'm_idle_neutral_03', 'm_idle_look_around_03', 'm_idle_scratch_head_02', 'm_idle_breathe_03',
  'f_idle_neutral_02', 'f_idle_look_around_01', 'f_idle_touch_hair_01', 'f_idle_breathe_02',
  'm_gestic_talk_neutral_03', 'm_gestic_listen_neutral_02', 'f_gestic_talk_neutral_02', 'f_gestic_listen_neutral_03',
  'm_documents_note'
];

// The game's skeleton as a chain (js/pedestrians.js PersonRig.applyClip chains the same way)
const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 8, 9, 0, 11, 12, 13];
const BIND = [
  new THREE.Vector3(0, 0.96, 0), new THREE.Vector3(0, 1.12, -0.01), TGT.head,
  TGT.shoulder(1), TGT.shoulder(1).add(new THREE.Vector3(Math.sin(0.14), -Math.cos(0.14), 0).multiplyScalar(0.3)),
  TGT.shoulder(-1), TGT.shoulder(-1).add(new THREE.Vector3(-Math.sin(0.14), -Math.cos(0.14), 0).multiplyScalar(0.3)),
  TGT.hip(1), TGT.knee(1), TGT.ankle(1), TGT.toe(1),
  TGT.hip(-1), TGT.knee(-1), TGT.ankle(-1), TGT.toe(-1)
];
const HIP_CENTRE = new THREE.Vector3(0, HIP_Y, 0);

const rigs = {};
const rigFor = (sex) => (rigs[sex] ??= avatarRig(loadFbx(path.join(CACHE, REFERENCE[sex], `${REFERENCE[sex]}.fbx`))));

const out = [];
let offset = 0;
for (const name of CLIPS) {
  const file = path.join(CACHE, 'animations', `${name}.fbx`);
  const rig = rigFor(name[0]);
  const bindQ = DRIVER.map((d) => rig.bindQuaternion(d));
  const mapQi = rig.MAP.map((m) => m.q.clone().invert());
  const scene = loadFbx(file);
  const clip = scene.animations[0];
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const drivers = DRIVER.map((d) => scene.getObjectByName(`Bip01_${d}`));
  const thighs = ['L_Thigh', 'R_Thigh'].map((d) => scene.getObjectByName(`Bip01_${d}`));
  if (drivers.some((o) => !o) || thighs.some((o) => !o)) throw new Error('missing biped bones in ' + name);
  const srcHip = thighs.map((o) => rig.joint(o.name.slice(6)));
  const srcHipCentre = srcHip[0].clone().add(srcHip[1]).multiplyScalar(0.5);

  const frames = Math.max(2, Math.floor(Math.min(clip.duration, MAX_SECONDS) * FPS));
  const data = new Float32Array(frames * (BONE_COUNT * 4 + 3));
  const prev = [];
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let lowest = Infinity;
  const joints = BIND.map(() => new THREE.Vector3());
  for (let f = 0; f < frames; f++) {
    mixer.setTime(f / FPS);
    scene.updateMatrixWorld(true);
    const o = f * (BONE_COUNT * 4 + 3);
    const qs = [];
    for (let b = 0; b < BONE_COUNT; b++) {
      drivers[b].matrixWorld.decompose(p, q, s);
      const g = q.clone().multiply(bindQ[b].clone().invert()).multiply(mapQi[b]).normalize();
      if (prev[b] && prev[b].dot(g) < 0) g.set(-g.x, -g.y, -g.z, -g.w); // (one hemisphere along the clip)
      prev[b] = g;
      qs.push(g);
      data.set([g.x, g.y, g.z, g.w], o + b * 4);
    }
    // the hips' centre: the clip's travel of it from the bind pose, 1:100
    const hc = new THREE.Vector3().setFromMatrixPosition(thighs[0].matrixWorld)
      .add(new THREE.Vector3().setFromMatrixPosition(thighs[1].matrixWorld)).multiplyScalar(0.5);
    const h = HIP_CENTRE.clone().add(hc.sub(srcHipCentre).multiplyScalar(0.01));
    data.set([h.x, h.y, h.z], o + BONE_COUNT * 4);
    // chain the joints (as PersonRig does) for the ankles' height
    joints[0].copy(BIND[0]).sub(HIP_CENTRE).applyQuaternion(qs[0]).add(h);
    for (let b = 1; b < BONE_COUNT; b++) {
      const a = PARENT[b];
      joints[b].copy(BIND[b]).sub(BIND[a]).applyQuaternion(qs[a]).add(joints[a]);
    }
    lowest = Math.min(lowest, joints[9].y, joints[13].y);
  }
  const lift = ANKLE_H - lowest;
  const i16 = new Int16Array(data.length);
  for (let f = 0; f < frames; f++) {
    const o = f * (BONE_COUNT * 4 + 3);
    for (let k = 0; k < BONE_COUNT * 4; k++) i16[o + k] = Math.round(data[o + k] * 32767);
    i16[o + BONE_COUNT * 4] = Math.round(data[o + BONE_COUNT * 4] * 1000);
    i16[o + BONE_COUNT * 4 + 1] = Math.round((data[o + BONE_COUNT * 4 + 1] + lift) * 1000);
    i16[o + BONE_COUNT * 4 + 2] = Math.round(data[o + BONE_COUNT * 4 + 2] * 1000);
  }
  out.push({ name, frames, offset, buf: Buffer.from(i16.buffer) });
  offset += i16.length;
  console.log(`${name}: ${(frames / FPS).toFixed(1)} s, ${frames} frames, ankle lift ${(lift * 100).toFixed(1)} cm, ref ${REFERENCE[name[0]]}`);
}

const header = Buffer.from(JSON.stringify({
  fps: FPS, bones: BONE_COUNT,
  source: 'Microsoft Rocketbox Avatar Library animations (MIT, Copyright (c) Microsoft Corporation), https://github.com/microsoft/Microsoft-Rocketbox',
  clips: out.map(({ name, frames, offset: o }) => ({ name, frames, offset: o }))
}), 'utf8');
const len = Buffer.alloc(4);
len.writeUInt32LE(header.length, 0);
const pad = Buffer.alloc((4 - ((4 + header.length) % 4)) % 4, 0x20);
fs.writeFileSync(OUT, Buffer.concat([len, header, pad, ...out.map((c) => c.buf)]));
console.log(`${path.relative(root, OUT)}: ${out.length} clips, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
