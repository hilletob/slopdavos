import * as THREE from 'three/webgpu';
import { Fn, float, int, vec2, vec3, color, attribute, instanceIndex, attributeArray, varying, sin, abs, fract, mix, step, smoothstep, max, normalize } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PERSON_BONES as BONE, buildPersonGeometry, createPersonMaterial, PersonRig, poseBuffer } from './pedestrians.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { LAYOUT } from './loipen.js';
import { surfaceHeight, groundHeight } from './terrain.js';
import { winter } from './season.js';
import { QUALITY } from './quality.js';
import {
  CLASSIC, TECH, createSkiNetwork, createSkier, skierPosition, advanceSkier, keepApart, nearbyStretches, spawnSkier,
  chooseTechnique, paceOnGrade
} from './cross-country-routes.js';

// Cross-country skiers on the Loipen in winter (js/loipen.js draws the trails; js/cross-country-routes.js runs the
// traffic): classic skiers in the tracks (diagonal stride, double poling on the flat, a tuck downhill) and skaters on the
// skating lane (V2 1:1 and 2:1 with the skis in a V, pushing off sideways on the inner edge). The pedestrians' skinned
// body (js/pedestrians.js) in tight, bright race suits with a beanie or headband, on narrow skis with long poles: one
// instanced draw per body level of detail, one for all skis, one for all poles. Only around the camera (~450 m) and only
// in winter; the poses are worked out for the skiers in view.

const MAX = QUALITY.crossCountrySkiers; // skiers at most (48; 16 on the mobile profile, js/quality.js)
const RADIUS = 450; // m around the camera
const PER_METRE = 1 / 70; // skiers per metre of trail nearby (fewer where there is little trail)
const NEAR_LOD = 32; // m: the detailed body inside
const POLE_DRAW = 110; // m: poles (and skis, a little farther) drawn inside
const SKI_DRAW = 180;
const LIFT = 0.15; // the groomed trail lies 0.16 m above the terrain (loipen.js): the skis sit just in it
const SKI_THICK = 0.025;
const FOREARM = 0.255; // (pedestrians.js) forearm to the wrist; the grip is 7 cm further, in the palm

// ---------------------------------------------------------------------------------------------------------------------
// Look: bright race suits and tights, gloves, boots, a beanie or a headband (with a ponytail), sunglasses on some
// ---------------------------------------------------------------------------------------------------------------------
const SUIT = [0xd3202a, 0x1d5bc4, 0xf2c014, 0x13a07a, 0xea5b0c, 0x7a2fc0, 0x15171c, 0xe2407a, 0x0aa0cc, 0xf1f1ea, 0x9bd21f];
const ACCENT = [0x15171c, 0xf3f3ee, 0xf2c014, 0xd3202a, 0x1d5bc4, 0x9bd21f, 0xff7a1a];
const TIGHTS = [0x121318, 0x1b2232, 0x26262b, 0x2b1f3a];
const HAT = [0xd3202a, 0x15171c, 0xf3f3ee, 0x1d5bc4, 0xf2c014, 0xe2407a, 0x13a07a, 0x7d8a99];
const SKIN = [0xe0ab88, 0xc68863, 0xd9a077, 0xa96f4c, 0xeab995];
const HAIR = [0x1a1512, 0x3a2a1a, 0x6b4a2a, 0x8f6d43, 0xb48c58, 0x2a2624];
const SKI_COLORS = [0xf2f2ee, 0xd3202a, 0x15171c, 0x1d5bc4, 0xf2c014, 0x13a07a, 0xea5b0c];
const POLE_COLORS = [0x15171c, 0x2b2d33, 0xd3202a, 0xf2f2ee, 0x1d5bc4];

function palette(hex, t) {
  let acc = color(hex[0]);
  for (let i = 1; i < hex.length; i++) acc = mix(acc, color(hex[i]), step(float(i), t.mul(hex.length)));
  return acc;
}

// The body's skinning (createPersonMaterial's vertex stage) with the skier's clothes instead of the city clothes.
// info: (seed, female, girth, hair): hair < 0.4 wears a beanie (over the hair shell), else a headband
function createSkierMaterial(pose, stride) {
  const mat = createPersonMaterial(pose);
  const info = varying(pose.element(int(instanceIndex).mul(stride).add(stride - 1)), 'vSkierInfo');
  const lane = (salt) => fract(sin(info.x.add(salt).mul(12.9898)).mul(43758.5453));
  const isPart = (p, id) => step(abs(p.sub(id)), 0.25);
  mat.colorNode = Fn(() => {
    const part = attribute('skin', 'vec4').w;
    const q = attribute('position', 'vec3');
    const along = attribute('extra', 'vec3').z;
    const suit = palette(SUIT, lane(3)).toVar();
    const accent = palette(ACCENT, lane(7)).toVar();
    const onePiece = step(lane(11), 0.35); // race suit: the legs in the suit's colours too
    const tights = mix(palette(TIGHTS, lane(13)), suit, onePiece);
    const skin = palette(SKIN, lane(17));
    const hair = palette(HAIR, lane(19));
    const hat = palette(HAT, lane(23));
    const gloves = mix(color(0x111216), accent, step(0.6, lane(29)));
    const beanie = step(info.w, 0.4);

    // Torso: suit with accent side panels and a chest band, a zip, tights below the waist, the neck bare
    const side = smoothstep(0.115, 0.125, abs(q.x));
    const band = smoothstep(0.006, 0.0, abs(q.y.sub(1.27)).sub(0.018)).mul(step(0.5, lane(31)));
    const zip = smoothstep(0.005, 0.002, abs(q.x)).mul(step(0.03, q.z)).mul(step(1.3, q.y));
    const top = mix(mix(suit, accent, max(side.mul(0.85), band)), color(0x202226), zip.mul(0.8));
    const waist = smoothstep(0.985, 0.995, q.y);
    const neck = smoothstep(1.495, 1.505, q.y);
    const torso = mix(mix(tights, top, waist), skin, neck);
    // Sleeves: accent cuffs; legs: an accent stripe down the outside on the race suits
    const sleeve = mix(suit, accent, smoothstep(0.88, 0.9, along));
    const outer = smoothstep(0.035, 0.045, abs(q.x).sub(0.09)).mul(onePiece);
    const legs = mix(tights, accent, outer);
    // Boots: dark, an accent cuff, grey soles
    const boots = mix(mix(color(0x16171b), accent, smoothstep(0.11, 0.12, q.y)), color(0x55575c), smoothstep(0.022, 0.015, q.y));
    // Head: face, sunglasses on some, beanie below the hairline or a headband round the forehead
    const hd = normalize(vec2(q.x, q.z.add(0.01)));
    const front = smoothstep(0.05, 0.075, q.z);
    const glasses = smoothstep(0.012, 0.008, abs(q.y.sub(1.628))).mul(smoothstep(0.075, 0.06, abs(q.x))).mul(front).mul(step(0.5, lane(37)));
    const hairline = hd.y.mul(0.055).add(1.62);
    const capLine = hairline.sub(0.018);
    const headband = smoothstep(0.022, 0.016, abs(q.y.sub(hd.y.mul(0.045).add(1.618)))).mul(float(1).sub(beanie));
    const face = mix(skin.mul(float(1).sub(smoothstep(0.011, 0.006, abs(abs(q.x).sub(0.031))).mul(smoothstep(0.0055, 0.002, abs(q.y.sub(1.627)))).mul(front).mul(0.7))), color(0x0c0d10), glasses);
    const hairOrHat = mix(hair, hat, beanie);
    const head = mix(mix(face, hairOrHat, smoothstep(capLine.sub(0.004), capLine.add(0.004), q.y).mul(beanie).add(
      smoothstep(hairline.sub(0.004), hairline.add(0.004), q.y).mul(float(1).sub(beanie)))), accent, headband);
    // The beanie's turned-up rim and ribs; the headband over the hair
    const rib = smoothstep(0.3, 0.5, abs(fract(hd.x.mul(18)).sub(0.5))).mul(0.12);
    const rim = smoothstep(capLine.add(0.035), capLine.add(0.03), q.y);
    const shell = mix(mix(hair, accent, headband), hat.mul(float(1).sub(rib).sub(rim.mul(0.15))), beanie);
    const longHair = hair;
    return mix(mix(mix(mix(mix(mix(mix(torso, legs, isPart(part, 1)), boots, isPart(part, 2)), sleeve, isPart(part, 3)),
      gloves, isPart(part, 4)), head, isPart(part, 5)), shell, isPart(part, 6)), longHair, isPart(part, 7));
  })();
  mat.roughnessNode = Fn(() => {
    const part = attribute('skin', 'vec4').w;
    // lycra has a sheen; skin, hair and knitwear are matt
    return mix(float(0.42), float(0.75), max(isPart(part, 5), step(5.5, part)));
  })();
  return mat;
}

// A ski: 4.5 cm wide, its tip turned up, the binding (dark) at the origin (the boot's toe), length 1 (scaled per ski)
function skiGeometry() {
  const g = new THREE.BoxGeometry(0.045, SKI_THICK, 1, 1, 1, 24);
  g.translate(0, SKI_THICK / 2, -0.04);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z > 0.36) p.setY(i, p.getY(i) + ((z - 0.36) / 0.1) ** 2 * 0.035); // tip
    if (z > 0.44) p.setX(i, p.getX(i) * (1 - (z - 0.44) * 5)); // rounded
  }
  const binding = new THREE.BoxGeometry(0.04, 0.02, 0.14);
  binding.translate(0, SKI_THICK + 0.01, -0.03);
  const dark = (geo, v) => geo.setAttribute('dark', new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count).fill(v), 1));
  dark(g, 0);
  dark(binding, 1);
  const merged = mergeGeometries([g.toNonIndexed(), binding.toNonIndexed()], false);
  merged.computeVertexNormals();
  return merged;
}

// A pole from the grip (origin) down to the tip at y = -1 (scaled per pole): shaft, dark grip and strap, basket
function poleGeometry() {
  const parts = [];
  const add = (geo, dark) => {
    geo.setAttribute('dark', new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count).fill(dark), 1));
    parts.push(geo.index ? geo.toNonIndexed() : geo);
  };
  const shaft = new THREE.CylinderGeometry(0.0085, 0.006, 0.96, 6, 1, true);
  shaft.translate(0, -0.52, 0);
  add(shaft, 0);
  const grip = new THREE.CylinderGeometry(0.016, 0.013, 0.13, 8);
  grip.translate(0, -0.055, 0);
  add(grip, 1);
  const basket = new THREE.CylinderGeometry(0.032, 0.02, 0.012, 8);
  basket.translate(0, -0.94, 0);
  add(basket, 1);
  const tip = new THREE.ConeGeometry(0.006, 0.04, 5);
  tip.rotateX(Math.PI);
  tip.translate(0, -0.98, 0);
  add(tip, 1);
  return mergeGeometries(parts, false);
}

function createGearMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.05 });
  // (multiplied by the instance colour)
  m.colorNode = mix(vec3(1), vec3(0.08), attribute('dark', 'float'));
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// Poses: each technique gives the feet, pelvis, trunk, hands and poles for a phase of its cycle (metres for a 1.75 m
// skier, in the skier's frame: f forward, l to the left); blended when the technique changes
// ---------------------------------------------------------------------------------------------------------------------
// Parameter layout: per foot (7): f, l, lift, yaw, roll (outer edge up), heel lift, tail lift; pelvis (6) at 14: f, l,
// hip height (share of the leg), forward tilt, yaw, roll; trunk at 20: chest pitch; per hand (3) at 22: f, l, height;
// per pole (2) at 28: pushing, free angle back from vertical
const N_PARAM = 32;
const FOOT = (i) => i * 7, PEL = 14, CHEST = 20, HAND = (i) => 22 + i * 3, POLE = (i) => 28 + i * 2;
const SIDES = [1, -1];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/** Gait cycles per second for a technique at speed v */
export function cadence(tech, v, grade) {
  switch (tech) {
    case TECH.DIAGONAL: return 0.55 + 0.1 * v + Math.max(0, grade) * 1.5;
    case TECH.DOUBLE_POLE: return 0.72 + 0.05 * v;
    case TECH.V2: return 0.42 + 0.035 * v;
    case TECH.V2_ALT: return 0.46 + 0.03 * v + Math.max(0, grade) * 1.2;
    default: return 0.25;
  }
}

function diagonal(P, phase, v, grade) {
  const th = phase * TAU, s = Math.sin(th), c = Math.cos(th);
  const A = Math.max(0.25, Math.min(0.5, 0.16 + 0.065 * v - Math.max(0, grade) * 0.8));
  SIDES.forEach((sg, i) => {
    const f = sg * A * s;
    const rear = clamp01(-f / A);
    const swing = sg * c > 0 ? 1 : 0; // coming forward again
    const o = FOOT(i);
    P[o] = f;
    P[o + 1] = sg * 0.11; // in the grooves, 0.22 m apart
    P[o + 2] = rear * rear * 0.03 + swing * rear * 0.03;
    P[o + 3] = 0;
    P[o + 4] = 0;
    P[o + 5] = rear * 0.62;
    P[o + 6] = rear * rear * 0.12;
    // arms against the legs: the left hand forward with the right foot
    const h = HAND(i), front = -sg * s;
    P[h] = front * 0.48;
    P[h + 1] = sg * 0.23;
    P[h + 2] = 0.98 + 0.2 * front;
    P[POLE(i)] = sg * c > 0 ? 1 : 0; // pushing while the arm comes back
    P[POLE(i) + 1] = 0.85 - 0.25 * front; // (swinging forward, the tip trails at the angle it is planted at)
  });
  P[PEL] = 0.05;
  P[PEL + 1] = 0.025 * s;
  P[PEL + 2] = 0.9 + 0.02 * Math.cos(2 * th);
  P[PEL + 3] = 0.24;
  P[PEL + 4] = -0.12 * s;
  P[PEL + 5] = 0;
  P[CHEST] = 0.12;
}

function doublePole(P, phase, width) {
  const push = phase < 0.38;
  const e = push ? smooth(phase / 0.38) : 1 - smooth((phase - 0.38) / 0.62);
  const bend = push ? smooth(Math.min(1, phase / 0.32)) : 1 - smooth(Math.min(1, (phase - 0.38) / 0.4));
  SIDES.forEach((sg, i) => {
    const o = FOOT(i);
    P[o] = sg * 0.02;
    P[o + 1] = sg * width;
    P[o + 2] = 0;
    P[o + 3] = 0;
    P[o + 4] = 0;
    P[o + 5] = push ? 0 : Math.sin(Math.PI * (phase - 0.38) / 0.62) * 0.18; // up onto the toes before the plant
    P[o + 6] = 0;
    const h = HAND(i);
    P[h] = lerp(0.42, -0.36, e);
    P[h + 1] = sg * 0.24;
    P[h + 2] = lerp(1.28, 0.7, e) + (push ? 0 : -0.08 * Math.sin(Math.PI * e));
    P[POLE(i)] = push ? 1 : 0;
    P[POLE(i) + 1] = lerp(0.35, 1.15, e);
  });
  P[PEL] = -0.04 * e;
  P[PEL + 1] = 0;
  P[PEL + 2] = lerp(0.95, 0.84, e);
  P[PEL + 3] = lerp(0.16, 0.42, bend);
  P[PEL + 4] = 0;
  P[PEL + 5] = 0;
  P[CHEST] = lerp(0.12, 0.72, bend);
}

function tuck(P, phase, width) {
  const sway = Math.sin(phase * TAU) * 0.02;
  SIDES.forEach((sg, i) => {
    const o = FOOT(i);
    P[o] = sg * 0.04;
    P[o + 1] = sg * width;
    P[o + 2] = P[o + 3] = P[o + 4] = P[o + 5] = P[o + 6] = 0;
    const h = HAND(i);
    P[h] = 0.4;
    P[h + 1] = sg * 0.16;
    P[h + 2] = 0.7 + sway;
    P[POLE(i)] = 0;
    P[POLE(i) + 1] = 1.72; // under the arms, pointing back
  });
  P[PEL] = -0.06;
  P[PEL + 1] = sway;
  P[PEL + 2] = 0.72;
  P[PEL + 3] = 0.55;
  P[PEL + 4] = 0;
  P[PEL + 5] = 0;
  P[CHEST] = 0.5;
}

// Skating: each leg glides (set down near the middle, drifting out), pushes off sideways on its inner edge and is
// brought back in the air; the left glides in the first half of the cycle. 1:1 poles with every push, 2:1 with every
// second (on the left glide)
function skate(P, phase, grade, polesPerCycle) {
  const alpha = 0.25 + Math.max(0, grade) * 2; // the V opens uphill
  SIDES.forEach((sg, i) => {
    const w = (phase + (i ? 0.5 : 0)) % 1;
    const o = FOOT(i);
    let f, l, lift = 0, yaw = sg * alpha, roll, heel = 0, tail = 0;
    if (w < 0.5) {
      const g = w / 0.5;
      f = 0.12 - 0.12 * g; l = 0.06 + 0.24 * g; roll = 0.05 * g;
    } else if (w < 0.82) {
      const e = smooth((w - 0.5) / 0.32);
      f = -0.22 * e; l = 0.3 + 0.24 * e; roll = 0.05 + 0.27 * e; heel = 0.25 * e * e;
    } else {
      const r = (w - 0.82) / 0.18, e = smooth(r), up = Math.sin(Math.PI * r);
      f = lerp(-0.22, 0.12, e); l = lerp(0.54, 0.06, e); lift = 0.1 * up; roll = 0.32 * (1 - e); heel = 0.25 * (1 - e);
      tail = -0.1 * up; yaw = sg * alpha * (0.5 + 0.5 * e);
    }
    P[o] = f; P[o + 1] = sg * l; P[o + 2] = lift; P[o + 3] = yaw; P[o + 4] = sg * roll; P[o + 5] = heel; P[o + 6] = tail;
  });
  const sway = Math.sin(phase * TAU);
  P[PEL] = 0;
  P[PEL + 1] = 0.13 * sway;
  P[PEL + 2] = 0.9 - 0.04 * Math.abs(Math.cos(phase * TAU));
  P[PEL + 3] = 0.2 + Math.max(0, grade) * 0.8;
  P[PEL + 4] = 0.14 * sway;
  P[PEL + 5] = -0.05 * sway;
  // Poles
  const psi = (phase * polesPerCycle) % 1;
  const pushEnd = polesPerCycle > 1 ? 0.35 : 0.24;
  const push = psi < pushEnd;
  const e = push ? smooth(psi / pushEnd) : 1 - smooth((psi - pushEnd) / (1 - pushEnd));
  SIDES.forEach((sg, i) => {
    const h = HAND(i);
    // (2:1: the strong side's arm a little higher, as in the offset)
    const strong = polesPerCycle > 1 ? 0 : (i === 0 ? 0.06 : -0.04);
    P[h] = lerp(0.36, -0.24, e);
    P[h + 1] = sg * 0.27;
    P[h + 2] = lerp(1.42 + strong, 0.84, e);
    P[POLE(i)] = push ? 1 : 0;
    P[POLE(i) + 1] = lerp(0.3, 1.1, e);
  });
  P[CHEST] = lerp(0.12, 0.5, push ? smooth(psi / pushEnd) : e);
}

function techniquePose(P, tech, phase, v, grade, style) {
  const width = style === CLASSIC ? 0.11 : 0.15;
  switch (tech) {
    case TECH.DIAGONAL: diagonal(P, phase, v, grade); break;
    case TECH.DOUBLE_POLE: doublePole(P, phase, width); break;
    case TECH.V2: skate(P, phase, grade, 2); break;
    case TECH.V2_ALT: skate(P, phase, grade, 1); break;
    default: tuck(P, phase, width);
  }
  // Lean into the hill
  P[PEL + 3] += Math.max(-0.1, Math.min(0.25, grade * 1.2));
}

// ---------------------------------------------------------------------------------------------------------------------
// The rig: the pedestrians' skeleton posed from the parameters, standing on its skis
// ---------------------------------------------------------------------------------------------------------------------
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _qp = new THREE.Quaternion(), _qch = new THREE.Quaternion(), _qu = new THREE.Quaternion(), _ql = new THREE.Quaternion();
const _fwd = new THREE.Vector3(), _left = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _pel = new THREE.Vector3(), _chest = new THREE.Vector3(), _sh = new THREE.Vector3(), _elbow = new THREE.Vector3(), _hand = new THREE.Vector3();
const _hint = new THREE.Vector3(), _hip = new THREE.Vector3(), _toe = new THREE.Vector3(), _ankle = [new THREE.Vector3(), new THREE.Vector3()];
const _hipOff = [new THREE.Vector3(), new THREE.Vector3()];
const _qSki = [new THREE.Quaternion(), new THREE.Quaternion()], _qFoot = [new THREE.Quaternion(), new THREE.Quaternion()];
const _toeAt = [new THREE.Vector3(), new THREE.Vector3()];
const _footYaw = [0, 0];
const qX = (o, a) => o.setFromAxisAngle(AX, a), qY = (o, a) => o.setFromAxisAngle(AY, a), qZ = (o, a) => o.setFromAxisAngle(AZ, a);
const UP = new THREE.Vector3(0, 1, 0);

class SkierRig extends PersonRig {
  constructor(o) {
    super(o);
    const j = this.bind;
    this.thigh = j[BONE.THIGH_L].distanceTo(j[BONE.SHIN_L]);
    this.shin = j[BONE.SHIN_L].distanceTo(j[BONE.FOOT_L]);
    this.upperArm = j[BONE.UPPER_ARM_L].distanceTo(j[BONE.FOREARM_L]);
    const arm = new THREE.Vector3().subVectors(j[BONE.FOREARM_L], j[BONE.UPPER_ARM_L]);
    this.armBind = Math.atan2(arm.x, -arm.y); // the arms hang a little out from the body in the bind pose
    this.toeVec = new THREE.Vector3().subVectors(j[BONE.TOE_L], j[BONE.FOOT_L]); // ankle to the ball of the foot
    this.toeHeight = j[BONE.TOE_L].y; // the ball of the foot above the sole
    this.skis = [new THREE.Matrix4(), new THREE.Matrix4()];
    this.hands = [new THREE.Vector3(), new THREE.Vector3()];
  }

  /**
   * Poses the body for the parameters P at (x, z) heading `this.yaw`; `ground(x, z)` the trail's surface (the bottom of
   * the skis), `grade` the slope ahead. Fills this.skis (matrices, length `skiLength`) and this.hands (the grips).
   */
  skiPose(P, x, z, ground, grade, skiLength) {
    const s = this.s, j = this.bind, yaw = this.yaw;
    const leg = (this.thigh + this.shin) * s;
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    _left.set(Math.cos(yaw), 0, -Math.sin(yaw));
    // Skis and feet
    for (let i = 0; i < 2; i++) {
      const o = FOOT(i);
      const fx = x + (_fwd.x * P[o] + _left.x * P[o + 1]) * s, fz = z + (_fwd.z * P[o] + _left.z * P[o + 1]) * s;
      const gy = ground(fx, fz) + P[o + 2] * s;
      const footYaw = _footYaw[i] = yaw + P[o + 3];
      const pitch = -Math.atan(grade * Math.cos(P[o + 3])) + P[o + 6];
      qY(_qSki[i], footYaw).multiply(qX(_qa, pitch)).multiply(qZ(_qb, P[o + 4]));
      this.skis[i].compose(_v.set(fx, gy, fz), _qSki[i], _w.set(1, 1, skiLength));
      // the ball of the foot on the ski, the heel lifting off it
      _toeAt[i].set(0, SKI_THICK + this.toeHeight * s, 0).applyQuaternion(_qSki[i]).add(_v);
      _qFoot[i].copy(_qSki[i]).multiply(qX(_qa, P[o + 5]));
      _ankle[i].copy(this.toeVec).multiplyScalar(-s).applyQuaternion(_qFoot[i]).add(_toeAt[i]);
    }
    // Pelvis: as high as the hip height asks and the legs reach
    qY(_qp, yaw + P[PEL + 4]).multiply(qX(_qa, P[PEL + 3])).multiply(qZ(_qb, P[PEL + 5]));
    _pel.set(x + (_fwd.x * P[PEL] + _left.x * P[PEL + 1]) * s, 0, z + (_fwd.z * P[PEL] + _left.z * P[PEL + 1]) * s);
    let y = (_ankle[0].y + _ankle[1].y) / 2 + P[PEL + 2] * leg;
    for (let i = 0; i < 2; i++) {
      _hipOff[i].copy(j[i ? BONE.THIGH_R : BONE.THIGH_L]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qp);
      const dx = _pel.x + _hipOff[i].x - _ankle[i].x, dz = _pel.z + _hipOff[i].z - _ankle[i].z;
      const reach = Math.sqrt(Math.max(0.01, (0.995 * leg) ** 2 - dx * dx - dz * dz));
      y = Math.min(y, _ankle[i].y + reach - _hipOff[i].y);
    }
    if (i0(y)) y = (_ankle[0].y + _ankle[1].y) / 2 + 0.8 * leg;
    _pel.y = y;
    this.writeBone(BONE.PELVIS, _qp, _pel);
    // Trunk and head (looking ahead along the trail)
    _qch.copy(_qp).multiply(qX(_qa, P[CHEST])).multiply(qY(_qb, -1.4 * P[PEL + 4]));
    _chest.copy(j[BONE.CHEST]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qp).add(_pel);
    this.writeBone(BONE.CHEST, _qch, _chest);
    qY(_qa, yaw).multiply(qX(_qb, 0.3 * (P[PEL + 3] + P[CHEST]) - 0.12));
    _v.copy(j[BONE.HEAD]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qch).add(_chest);
    this.writeBone(BONE.HEAD, _qa, _v);
    // Arms: two-bone IK to the grips, elbows back and out
    const gy0 = ground(x, z);
    for (let i = 0; i < 2; i++) {
      const sg = SIDES[i], h = HAND(i);
      const upper = i ? BONE.UPPER_ARM_R : BONE.UPPER_ARM_L, fore = i ? BONE.FOREARM_R : BONE.FOREARM_L;
      _sh.copy(j[upper]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qch).add(_chest);
      _hand.set(_pel.x + (_fwd.x * P[h] + _left.x * P[h + 1]) * s, gy0 + P[h + 2] * s, _pel.z + (_fwd.z * P[h] + _left.z * P[h + 1]) * s);
      const l1 = this.upperArm * s, l2 = (FOREARM + 0.07) * s;
      _v.subVectors(_hand, _sh);
      let dist = _v.length();
      _v.divideScalar(dist || 1);
      dist = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min((l1 + l2) * 0.999, dist));
      _hint.copy(_fwd).multiplyScalar(-0.8).addScaledVector(_left, sg * 0.3).addScaledVector(UP, -0.5);
      _hint.addScaledVector(_v, -_hint.dot(_v)).normalize();
      const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
      _elbow.copy(_sh).addScaledVector(_v, l1 * cosA).addScaledVector(_hint, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
      this.hands[i].copy(_sh).addScaledVector(_v, dist);
      this.basis(_w.subVectors(_sh, _elbow), _fwd, _qu).multiply(qZ(_qa, -sg * this.armBind));
      this.writeBone(upper, _qu, _sh);
      this.basis(_w.subVectors(_elbow, this.hands[i]), _fwd, _ql).multiply(qZ(_qa, -sg * this.armBind));
      this.writeBone(fore, _ql, _elbow);
    }
    // Legs: IK to the ankles (knees over the skis), feet on the skis
    for (let i = 0; i < 2; i++) {
      _hip.copy(_pel).add(_hipOff[i]);
      const ankle = this.solveLeg(i, _hip, _ankle[i], _footYaw[i]);
      _ankle[i].copy(ankle);
      this.writeBone(i ? BONE.FOOT_R : BONE.FOOT_L, _qFoot[i], _ankle[i]);
      _toe.copy(this.toeVec).multiplyScalar(s).applyQuaternion(_qFoot[i]).add(_ankle[i]);
      this.writeBone(i ? BONE.TOE_R : BONE.TOE_L, _qSki[i], _toe);
    }
  }
}
const i0 = (y) => !(y === y); // NaN

// ---------------------------------------------------------------------------------------------------------------------
// The skiers
// ---------------------------------------------------------------------------------------------------------------------
export function buildCrossCountry(scene) {
  const group = new THREE.Group();
  group.name = 'CrossCountrySkiers';
  group.userData.terrain = 'absolute'; // placed in world heights
  const net = createSkiNetwork(DAVOS_DATA.loipen || [], LAYOUT);
  let seed = 4711;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 1) >>> 0) / 4294967296;

  // Bodies: one instanced, skinned draw per level of detail (pose buffers as in PersonCrowd)
  const probe = new SkierRig({});
  const stride = probe.pose.length / 4;
  const lods = [1, 0].map((detail) => {
    const pose = poseBuffer(MAX * stride); // (js/pedestrians.js: a texture on the WebGL 2 fallback)
    const mesh = new THREE.Mesh(buildPersonGeometry(detail), createSkierMaterial(pose, stride));
    mesh.name = detail ? 'CrossCountrySkiersNear' : 'CrossCountrySkiersFar';
    mesh.count = 1; // one (degenerate) skier until the first frame, so the pipelines compile up front
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return { pose, mesh, count: 0 };
  });
  const gear = (geometry, count, name) => {
    const mesh = new THREE.InstancedMesh(geometry, createGearMaterial(), count);
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < count; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    mesh.count = 1;
    mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
    group.add(mesh);
    return mesh;
  };
  const skiMesh = gear(skiGeometry(), MAX * 2, 'CrossCountrySkis');
  const poleMesh = gear(poleGeometry(), MAX * 2, 'CrossCountryPoles');

  // The skiers: traffic records (cross-country-routes.js) with a rig, colours and pole state each
  const skiers = Array.from({ length: MAX }, (_, i) => {
    const sk = createSkier(i, rand);
    const female = rand() < 0.42;
    const headband = rand() < 0.45;
    sk.rig = new SkierRig({
      seed: 100 + i * 37.3 + rand() * 10,
      scale: (female ? 0.94 : 1.0) * (0.96 + rand() * 0.09),
      female,
      girth: 0.88 + rand() * 0.1,
      hair: headband ? (female && rand() < 0.7 ? 0.8 + rand() * 0.2 : 0.45) : 0.15 + rand() * 0.2
    });
    sk.skiColor = new THREE.Color(SKI_COLORS[Math.floor(rand() * SKI_COLORS.length)]);
    sk.poleColor = new THREE.Color(POLE_COLORS[Math.floor(rand() * POLE_COLORS.length)]);
    sk.P = new Float32Array(N_PARAM);
    sk.Ptmp = new Float32Array(N_PARAM);
    sk.blend = 1;
    sk.prevTech = sk.tech;
    sk.phase = rand();
    sk.poles = [0, 1].map(() => ({ planted: false, used: false, tip: new THREE.Vector3(), dir: new THREE.Vector3(0, -1, 0), length: 1 }));
    return sk;
  });
  const positions = skiers.map(() => ({}));

  let near = { stretches: [], total: 0 }, nearAt = null, refresh = 0, wasActive = false;
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), tipDir = new THREE.Vector3(), out = new THREE.Vector3();
  const stats = { active: 0, drawn: 0, near: 0, classic: 0, skate: 0, techniques: {} };
  const api = { group, skiers, stats, net, timeScale: 1, enabled: true };
  const groundAt = (x, z) => surfaceHeight(x, z, groundHeight(x, z)) + LIFT;
  api.position = (sk) => { const p = skierPosition(sk, {}); p.y = groundAt(p.x, p.z); return p; }; // (probes, screenshots)

  function deactivate() {
    for (const sk of skiers) sk.active = false;
    for (const l of lods) l.mesh.count = 0;
    skiMesh.count = poleMesh.count = 0;
    stats.active = stats.drawn = 0;
  }

  // Poles: planted in the snow while pushing (the tip stays put), else swinging from the hand towards the angle the
  // technique gives
  function updatePole(sk, i, hand, fwd, left, dt, poleLength) {
    const pole = sk.poles[i], P = sk.P, sg = SIDES[i];
    const pushing = P[POLE(i)] > 0.5;
    pole.length = poleLength;
    if (pushing && !pole.planted && !pole.used) {
      const h = Math.max(0.05, hand.y - groundAt(hand.x, hand.z) + 0.05);
      const back = Math.sqrt(Math.max(0, poleLength * poleLength - h * h));
      pole.tip.copy(hand).addScaledVector(fwd, -back * 0.92).addScaledVector(left, sg * 0.1);
      pole.tip.y = groundAt(pole.tip.x, pole.tip.z) - 0.05; // a little into the snow
      pole.planted = pole.used = true;
    }
    if (!pushing) pole.used = false;
    if (pole.planted && (!pushing || pole.tip.distanceTo(hand) > poleLength * 1.06 || pole.tip.distanceTo(hand) < poleLength * 0.6)) pole.planted = false;
    if (pole.planted) {
      pole.dir.subVectors(pole.tip, hand);
      pole.length = Math.min(poleLength * 1.06, pole.dir.length());
      pole.dir.normalize();
      return;
    }
    const beta = P[POLE(i) + 1];
    tipDir.copy(UP).multiplyScalar(-Math.cos(beta)).addScaledVector(fwd, -Math.sin(beta)).addScaledVector(left, sg * 0.12).normalize();
    pole.dir.lerp(tipDir, 1 - Math.exp(-dt * 10)).normalize();
    // (never into the snow)
    const tipY = hand.y + pole.dir.y * poleLength, floor = groundAt(hand.x + pole.dir.x * poleLength, hand.z + pole.dir.z * poleLength) - 0.03;
    if (tipY < floor) {
      const dy = Math.max(-1, (floor - hand.y) / poleLength), horiz = Math.hypot(pole.dir.x, pole.dir.z) || 1, k = Math.sqrt(1 - dy * dy) / horiz;
      pole.dir.set(pole.dir.x * k, dy, pole.dir.z * k);
    }
  }

  api.update = function update(dt, camera) {
    if (winter.value < 0.5 || !net.trails.length || !api.enabled) {
      if (wasActive) deactivate();
      wasActive = false;
      return;
    }
    dt *= api.timeScale;
    const cam = camera.position;
    // The trail near the camera (refreshed every second, or at once after a jump)
    refresh -= dt;
    const moved = nearAt ? Math.hypot(cam.x - nearAt.x, cam.z - nearAt.z) : Infinity;
    if (refresh <= 0 || moved > 120 || !wasActive) {
      near = nearbyStretches(net, cam.x, cam.z, RADIUS);
      const fill = moved > 400 || !wasActive; // (after a jump the skiers are placed anywhere around)
      nearAt = { x: cam.x, z: cam.z };
      refresh = 1;
      const want = Math.min(MAX, Math.floor(near.total * PER_METRE));
      let count = 0;
      for (const sk of skiers) {
        if (!sk.active) continue;
        const p = skierPosition(sk, positions[sk.id]);
        if (Math.hypot(p.x - cam.x, p.z - cam.z) > RADIUS * 1.15) sk.active = false;
        else count++;
      }
      for (const sk of skiers) {
        if (count >= want) break;
        if (sk.active) continue;
        // (new skiers turn up out of sight, beyond 220 m, once the camera has settled)
        if (spawnSkier(sk, near, skiers, rand, { cx: cam.x, cz: cam.z, minDistance: fill ? 0 : 220, spacing: 20 })) {
          count++;
          sk.rig.placed = false;
          for (const pole of sk.poles) pole.planted = pole.used = false;
        }
      }
      stats.near = Math.round(near.total);
    }
    wasActive = true;

    // Traffic: pace for the slope, technique, keeping apart, then on along the trails
    for (const sk of skiers) {
      if (!sk.active) continue;
      const p = skierPosition(sk, positions[sk.id]);
      const ahead = groundAt(p.x + p.hx * 3, p.z + p.hz * 3), behind = groundAt(p.x - p.hx * 3, p.z - p.hz * 3);
      sk.grade += ((ahead - behind) / 6 - sk.grade) * Math.min(1, dt * 2);
      sk.target = paceOnGrade(sk.base, sk.grade);
      // switching technique at the end of a cycle's half, blending the poses over a third of a second
      const tech = chooseTechnique(sk, sk.grade);
      if (tech !== sk.tech && sk.blend >= 1) {
        sk.prevTech = sk.tech;
        sk.tech = tech;
        sk.blend = 0;
      }
    }
    keepApart(skiers, positions);
    for (const sk of skiers) if (sk.active) advanceSkier(sk, dt, rand);

    // Poses for the skiers in view
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    for (const l of lods) l.count = 0;
    let skis = 0, poles = 0, active = 0, classic = 0;
    const techniques = {};
    for (const sk of skiers) {
      if (!sk.active) continue;
      active++;
      if (sk.style === CLASSIC) classic++;
      techniques[sk.tech] = (techniques[sk.tech] || 0) + 1;
      const p = skierPosition(sk, positions[sk.id]);
      const rig = sk.rig;
      // heading: turns at most ~2.5 rad/s (round at a dead end)
      const yaw = Math.atan2(p.hx, p.hz);
      if (!rig.placed) { rig.yaw = yaw; rig.placed = true; }
      let dy = yaw - rig.yaw;
      dy -= Math.round(dy / TAU) * TAU;
      rig.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, dy));
      sk.phase = (sk.phase + cadence(sk.tech, Math.max(sk.v, 0.8), sk.grade) * dt * Math.min(1, sk.v / 1.5)) % 1;
      sk.blend = Math.min(1, sk.blend + dt * 3);
      const y = groundAt(p.x, p.z);
      sphere.center.set(p.x, y + 1, p.z);
      sphere.radius = 2.5;
      const distance = cam.distanceTo(sphere.center);
      if (!frustum.intersectsSphere(sphere)) continue;
      techniquePose(sk.P, sk.tech, sk.phase, sk.v, sk.grade, sk.style);
      if (sk.blend < 1) {
        techniquePose(sk.Ptmp, sk.prevTech, sk.phase, sk.v, sk.grade, sk.style);
        const w = smooth(sk.blend);
        for (let k = 0; k < N_PARAM; k++) sk.P[k] = lerp(sk.Ptmp[k], sk.P[k], w);
      }
      const classicStyle = sk.style === CLASSIC;
      rig.skiPose(sk.P, p.x, p.z, groundAt, sk.grade, (classicStyle ? 2.0 : 1.8) * rig.s);
      const lod = lods[distance > NEAR_LOD ? 1 : 0];
      if (lod.count < MAX) lod.pose.value.array.set(rig.pose, lod.count++ * stride * 4);
      if (distance < SKI_DRAW) {
        for (let i = 0; i < 2; i++) {
          skiMesh.setMatrixAt(skis, rig.skis[i]);
          skiMesh.setColorAt(skis++, sk.skiColor);
        }
      }
      const fwd = _fwd.set(Math.sin(rig.yaw), 0, Math.cos(rig.yaw)), left = _left.set(Math.cos(rig.yaw), 0, -Math.sin(rig.yaw));
      const poleLength = (classicStyle ? 1.45 : 1.58) * rig.s;
      for (let i = 0; i < 2; i++) {
        updatePole(sk, i, rig.hands[i], fwd, left, dt, poleLength);
        if (distance >= POLE_DRAW) continue;
        const pole = sk.poles[i];
        q.setFromUnitVectors(out.set(0, -1, 0), pole.dir);
        // (the grip's top a few centimetres above the fist)
        m4.compose(_v.copy(rig.hands[i]).addScaledVector(pole.dir, -0.05), q, sc.set(1, pole.length + 0.05, 1));
        poleMesh.setMatrixAt(poles, m4);
        poleMesh.setColorAt(poles++, sk.poleColor);
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
    skiMesh.count = skis;
    poleMesh.count = poles;
    for (const mesh of [skiMesh, poleMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    stats.active = active;
    stats.drawn = lods[0].count + lods[1].count;
    stats.classic = classic;
    stats.skate = active - classic;
    stats.techniques = techniques;
  };

  // Not drawn in summer; drawn while the loading screen compiles the shaders (main.js sets __slopdavos.ready afterwards)
  Object.defineProperty(group, 'visible', {
    get: () => winter.value > 0.5 || !(typeof window !== 'undefined' && window.__slopdavos?.ready),
    set() {}
  });
  group.userData.crossCountry = api;
  scene.add(group);
  return api;
}
