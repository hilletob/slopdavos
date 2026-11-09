import test from 'node:test';
import assert from 'node:assert/strict';
import { PersonRig } from '../js/pedestrians.js';

// A clip standing in the bind pose: every bone unturned, the hips' centre at the bind height (0.92 m) over the ground
function bindClip(frames = 40) {
  const stride = 15 * 4 + 3;
  const data = new Int16Array(frames * stride);
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < 15; b++) data[f * stride + b * 4 + 3] = 32767;
    data[f * stride + 61] = 920;
  }
  return { name: 'bind', fps: 20, frames, duration: (frames - 1) / 20, data };
}

// The joint a bone turns about, from the rig's pose (writeBone: translation = joint - q * bind * s)
function joint(rig, b) {
  const a = rig.pose, o = b * 8;
  const [x, y, z, w] = [a[o], a[o + 1], a[o + 2], a[o + 3]];
  const v = rig.bind[b], s = a[o + 7];
  // q * v (unit quaternion)
  const tx = 2 * (y * v.z - z * v.y), ty = 2 * (z * v.x - x * v.z), tz = 2 * (x * v.y - y * v.x);
  const r = [v.x + w * tx + (y * tz - z * ty), v.y + w * ty + (z * tx - x * tz), v.z + w * tz + (x * ty - y * tx)];
  return r.map((c, k) => c * s + a[o + 4 + k]);
}

test('a standing person blends into its clip and chains the joints with its own bind pose', () => {
  const rig = new PersonRig({ seed: 0.3, female: true, scale: 0.95 });
  rig.setClips([bindClip()]);
  const ground = () => 1.5;
  for (let i = 0; i < 120; i++) rig.update(1 / 60, 3, 4, Math.PI / 2, ground);
  assert.ok(rig.clipW > 0.99, `clip weight ${rig.clipW}`);
  // the bind pose turned to the heading, standing on the ground at (3, 4)
  const pelvis = joint(rig, 0);
  assert.ok(Math.abs(pelvis[0] - 3) < 1e-3 && Math.abs(pelvis[2] - 4) < 1e-3, `pelvis ${pelvis}`);
  assert.ok(Math.abs(pelvis[1] - (1.5 + 0.96 * 0.95)) < 2e-3, `pelvis height ${pelvis[1]}`);
  for (const b of [9, 13]) { // the ankles at their bind height over the ground
    assert.ok(Math.abs(joint(rig, b)[1] - (1.5 + 0.08 * 0.95)) < 2e-3, `ankle ${b} ${joint(rig, b)}`);
  }
  // the bones carry the heading's rotation (about +Y by pi/2)
  const a = rig.pose;
  assert.ok(Math.abs(Math.abs(a[1]) - Math.sin(Math.PI / 4)) < 1e-3 && Math.abs(Math.abs(a[3]) - Math.cos(Math.PI / 4)) < 1e-3);
});

test('the clip fades out as the walk starts, and a person without clips never shows one', () => {
  const rig = new PersonRig({ seed: 0.7 });
  rig.setClips([bindClip()]);
  const ground = () => 0;
  for (let i = 0; i < 90; i++) rig.update(1 / 60, 0, 0, 0, ground);
  assert.ok(rig.clipW > 0.95);
  let z = 0;
  for (let i = 0; i < 90; i++) { z += 1.4 / 60; rig.update(1 / 60, 0, z, 0, ground); }
  assert.ok(rig.clipW < 0.01, `clip weight walking ${rig.clipW}`);
  const plain = new PersonRig({ seed: 0.7 });
  for (let i = 0; i < 60; i++) plain.update(1 / 60, 0, 0, 0, ground);
  assert.equal(plain.clipW, 0);
});
