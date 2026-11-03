import * as THREE from 'three/webgpu';
import { groundHeight } from './terrain.js';
import { EISSTADION, trackOutline, pointInRing } from './landmark-buildings-data.js';
import {
  SKATE_PARAMS, createSkater, stepSkater, skaterNeedle, TRACK, TRACK_LANES, trackPoint, spineDistance, LAP_LENGTH,
  RINK, HOCKEY, rinkLocal, rinkWorld, rinkHeadingLocal, rinkHeadingWorld, clampToRink, stepPenalty, crossingY, PENALTY_RESULT_TEXT,
  SHEET, CURLING, sheetLocal, sheetWorld, sheetHeading, throwStone, stepStones, settleStones, curlingScore, stonePoints, curlingSpeed
} from './missions-data-ice.js';

// js/missions-ice.js
// The ice missions' runtime (js/missions-data-ice.js has their definitions and the pure game logic), as features of
// js/missions.js (ICE_FEATURES, merged into its FEATURES):
//   skates     — the pedestrian on skates: the controllers' personDriver strokes, glides and leans by stepSkater, the
//                personPoser crouches the skinned person into a skater's stance (its PersonRig's bones written here:
//                the pelvis low, the back near flat, the legs pushing out in turn, the arms swinging), blades under the
//                boots; a rhythm bar for the strokes (the touch screens' action button becomes "Push")
//   speedTrack — the 400 m track's inner kerb blocks, the lane cones and the start/finish line (one instanced mesh)
//   hockey     — a rink inside the Eisstadion (ice with its markings, boards, both goals, the stands up to the roof),
//                a goalie, the puck and the stick; Space (the "Shoot" button) shoots where the skater looks
//   curling    — a sheet on the Eisbahn's hard court, eight stones, the aim line; the person delivers from the hack and
//                sweeps behind the stone; its own camera
// Everything is built when the mission starts and goes with the run (its group, its DOM, the controllers' hooks).

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';

// --- The HUD's own pieces (injected once: no shared stylesheet edit) ---------------------------------------------------
const STYLE = `
.ice-hud { position: fixed; left: 50%; bottom: max(54px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 12;
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 14px; min-width: 240px; pointer-events: none;
  font-size: 13px; font-weight: 600; text-align: center; }
.ice-hud .ice-row { display: flex; gap: 12px; align-items: center; justify-content: center; }
.ice-meter { position: relative; width: 220px; height: 12px; border-radius: 6px; background: rgba(255,255,255,0.14); overflow: hidden; }
.ice-meter-zone { position: absolute; top: 0; bottom: 0; background: rgba(80, 220, 140, 0.45); }
.ice-meter-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, #3fd6ff, #ffffff); }
.ice-meter-mark { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #ffc83d; }
.ice-meter-needle { position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1px; background: #fff; box-shadow: 0 0 4px #000; }
.ice-flash { font-size: 15px; font-weight: 800; letter-spacing: 0.02em; min-height: 18px; }
.ice-flash.is-good { color: #5be08c; } .ice-flash.is-bad { color: #ff7a6b; } .ice-flash.is-gold { color: #ffc83d; }
.ice-big { position: fixed; left: 50%; top: 38%; transform: translate(-50%, -50%); z-index: 12; pointer-events: none; font-size: 54px;
  font-weight: 900; color: #fff; text-shadow: 0 3px 14px rgba(0,0,0,0.6); opacity: 0; transition: opacity 0.25s; }
.ice-big.is-on { opacity: 1; }
.ice-tally { font-size: 18px; letter-spacing: 3px; }
.ice-keys { font-size: 11px; opacity: 0.75; font-weight: 500; }
body.touch-enabled .ice-hud { bottom: calc(max(12px, env(safe-area-inset-bottom)) + 200px); }
@media (max-width: 820px) { body.touch-enabled .ice-hud { bottom: auto; top: calc(max(12px, env(safe-area-inset-top)) + 188px); } }
body.touch-enabled .ice-keys { display: none; }
@media (max-width: 820px) { .ice-hud { min-width: 0; padding: 6px 10px; font-size: 12px; } .ice-meter { width: 170px; } .ice-big { font-size: 40px; } }
`;

function ensureStyle() {
  if (document.getElementById('ice-style')) return;
  const s = document.createElement('style');
  s.id = 'ice-style';
  s.textContent = STYLE;
  document.head.append(s);
}

export function buildIceHud(run) {
  ensureStyle();
  const hud = el('div', 'panel ice-hud');
  const flash = el('div', 'ice-flash');
  const big = el('div', 'ice-big');
  document.body.append(hud, big);
  run.cleanups.push(() => { hud.remove(); big.remove(); });
  return { hud, flash, big };
}

export function meter() {
  const m = el('div', 'ice-meter');
  const zone = el('span', 'ice-meter-zone'), fill = el('span', 'ice-meter-fill'), mark = el('span', 'ice-meter-mark'), needle = el('span', 'ice-meter-needle');
  m.append(zone, fill, mark, needle);
  mark.hidden = true;
  return { m, zone, fill, mark, needle };
}

/** The touch screens' action button ("Jump") relabelled for the mission; given back at the end */
export function touchLabel(run, text) {
  const label = document.querySelector('[data-touch-label="up"]');
  const button = document.querySelector('[data-touch-action="up"]');
  if (!label) return;
  if (run._touchLabelOld === undefined) {
    run._touchLabelOld = label.textContent;
    run.cleanups.push(() => { label.textContent = run._touchLabelOld; button?.setAttribute('aria-label', run._touchLabelOld); });
  }
  label.textContent = text;
  button?.setAttribute('aria-label', text);
}

/** The rising edge of a held key action (keys.up: Space, E, the touch button) */
export function edge(run, cm, action = 'up') {
  const on = !!cm.keys[action];
  const key = `_edge_${action}`;
  const was = !!run[key];
  run[key] = on;
  return on && !was;
}

// =====================================================================================================================
// The skater's pose: the skinned person's bones written straight into its PersonRig (js/pedestrians.js) — the same
// joints and helpers its walk uses (bind joints, writeBone, two-bone leg IK), posed for the ice
const BONE = { PELVIS: 0, CHEST: 1, HEAD: 2 };
const LIMB = { upperArm: [3, 5], forearm: [4, 6], thigh: [7, 11], foot: [9, 13], toe: [10, 14] };
const SIDES = [1, -1];
const ARM_BIND_ABDUCTION = 0.14, ANKLE_H = 0.08, FOREARM = 0.255;
export const BLADE_H = 0.09; // m: the boot's sole over the ice
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _qC = new THREE.Quaternion(), _qU = new THREE.Quaternion(), _qF = new THREE.Quaternion();
const _pel = new THREE.Vector3(), _ch = new THREE.Vector3(), _v = new THREE.Vector3(), _sh = new THREE.Vector3(), _hip = new THREE.Vector3(), _t = new THREE.Vector3(), _an = new THREE.Vector3();
const qX = (o, a) => o.setFromAxisAngle(AX, a), qY = (o, a) => o.setFromAxisAngle(AY, a), qZ = (o, a) => o.setFromAxisAngle(AZ, a);

/**
 * Poses `rig` as a skater standing on the ice at (x, y, z) facing `yaw`. o: crouch 0-1 (how low and flat), phase (the
 * stroke's, rad: the legs push out in turn), push 0-1 (how hard), lean (rad, into the turn: positive to the left),
 * arms 'swing' | 'back' | 'stick' | 'broom', lunge 0-1 (the curling delivery: the front knee deep, the back leg out
 * behind). Returns the feet { x, y, z, yaw } (the blades) and the hands (the stick, the broom).
 */
export function poseSkater(rig, x, y, z, yaw, o = {}) {
  const s = rig.s, j = rig.bind;
  const crouch = o.crouch ?? 0.6, phase = o.phase ?? 0, push = o.push ?? 0, lean = o.lean ?? 0, lunge = o.lunge ?? 0;
  rig.x = x; rig.z = z; rig.yaw = yaw; rig.placed = true; rig.gait = 0; rig.run = 0; rig.speed = 0;
  const lx = Math.cos(yaw), lz = -Math.sin(yaw); // the skater's left
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  // the pelvis: low and tipped forward, swaying over the pushing leg, leaning into the turn
  const sway = Math.sin(phase) * 0.07 * push;
  const tilt = 0.06 + 0.62 * crouch + 0.25 * lunge;
  const h = (0.955 - 0.25 * crouch - 0.28 * lunge) * s + BLADE_H;
  qY(_qP, yaw).multiply(qZ(_q, -lean)).multiply(qX(_q, tilt));
  _pel.set(x + lx * (sway + Math.sin(lean) * h * 0.85) - fx * 0.05 * crouch, y + h * Math.cos(lean), z + lz * (sway + Math.sin(lean) * h * 0.85) - fz * 0.05 * crouch);
  rig.pelvisY = _pel.y;
  rig.writeBone(BONE.PELVIS, _qP, _pel);
  // the chest flat over the knees, the head up looking ahead
  _qC.copy(_qP).multiply(qX(_q, 0.12 + 0.42 * crouch + 0.2 * lunge)).multiply(qY(_q, -Math.sin(phase) * 0.12 * push));
  _ch.copy(j[BONE.CHEST]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qP).add(_pel);
  rig.writeBone(BONE.CHEST, _qC, _ch);
  qY(_qa, yaw).multiply(qZ(_q, -lean * 0.5)).multiply(qX(_q, 0.1 - 0.15 * crouch));
  _v.copy(j[BONE.HEAD]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qC).add(_ch);
  rig.writeBone(BONE.HEAD, _qa, _v);
  // arms
  const hands = [];
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i];
    let flex, elbow, abd;
    if (o.arms === 'back') { flex = -0.35; elbow = 1.1; abd = 0.02; }
    else if (o.arms === 'stick' || o.arms === 'broom') { flex = (o.arms === 'broom' ? 0.45 + 0.6 * crouch : 1.05) + (i ? 0.2 : 0); elbow = 0.65; abd = side * 0.05 + 0.08; }
    else { const sw = Math.sin(phase + (i ? Math.PI : 0)) * push; flex = 0.15 + sw * 0.95; elbow = 0.35 + Math.max(0, sw) * 0.4; abd = 0.12 + Math.max(0, -sw) * 0.25; }
    _sh.copy(j[LIMB.upperArm[i]]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qC).add(_ch);
    _qU.copy(_qC).multiply(qZ(_q, side * (abd - ARM_BIND_ABDUCTION))).multiply(qX(_q, -flex));
    rig.writeBone(LIMB.upperArm[i], _qU, _sh);
    _v.copy(j[LIMB.forearm[i]]).sub(j[LIMB.upperArm[i]]).multiplyScalar(s).applyQuaternion(_qU).add(_sh);
    _qF.copy(_qU).multiply(qX(_q, -elbow));
    rig.writeBone(LIMB.forearm[i], _qF, _v);
    hands.push(new THREE.Vector3(0, -FOREARM * s, 0).applyQuaternion(_qF).add(_v));
  }
  // legs: the stroke pushes one foot out to the side and back, the other glides under the body; the delivery's lunge
  const feet = [];
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i];
    const p = phase + (i ? Math.PI : 0);
    const out = Math.max(0, Math.sin(p)) * push, lift = Math.max(0, -Math.sin(p)) * push;
    let lat = side * (0.13 + 0.42 * out), back = -0.28 * out + 0.12 * lift * Math.cos(p) + 0.08 * crouch, up = 0.13 * lift;
    if (lunge) { // (the left foot slides in front under the body, the right trails behind)
      if (i === 0) { lat = 0.05; back = 0.35 * lunge; up = 0; } else { lat = -0.18; back = -1.05 * lunge; up = 0; }
    }
    const footYaw = yaw + side * (0.08 + 0.35 * out);
    _t.set(x + lx * (lat + Math.sin(lean) * 0.25) + fx * back, y + BLADE_H + ANKLE_H * s + up, z + lz * (lat + Math.sin(lean) * 0.25) + fz * back);
    _hip.copy(j[LIMB.thigh[i]]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qP).add(_pel);
    rig.feet[i].contact = 1;
    _an.copy(rig.solveLeg(i, _hip, _t, footYaw));
    const pitch = lunge && i === 1 ? 0.9 * lunge : 0;
    qY(_qa, footYaw).multiply(qX(_q, pitch));
    rig.writeBone(LIMB.foot[i], _qa, _an);
    _v.copy(j[LIMB.toe[i]]).sub(j[LIMB.foot[i]]).multiplyScalar(s).applyQuaternion(_qa).add(_an);
    rig.writeBone(LIMB.toe[i], _qa, _v);
    feet.push({ x: _an.x, y: _an.y, z: _an.z, yaw: footYaw, pitch });
  }
  return { feet, hands };
}

// The blades under the boots (two thin steel runners)
function createBlades() {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.012, 0.075, 0.42);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9d2dc, metalness: 0.9, roughness: 0.25 });
  const boot = new THREE.BoxGeometry(0.11, 0.05, 0.3);
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Group();
    const blade = new THREE.Mesh(geo, mat); blade.position.set(0, -ANKLE_H - 0.045, 0.04);
    const sole = new THREE.Mesh(boot, bootMat); sole.position.set(0, -ANKLE_H - 0.005, 0.03);
    b.add(blade, sole);
    g.add(b);
  }
  return g;
}

function placeBlades(blades, feet) {
  feet.forEach((f, i) => {
    const b = blades.children[i];
    b.position.set(f.x, f.y, f.z);
    b.rotation.set(f.pitch || 0, f.yaw, 0, 'YXZ');
  });
}

// --- The ice surfaces: their height, flat ---------------------------------------------------------------------------
let _trackY = null;
export function trackIceY() {
  // (as js/landmark-buildings.js lays the Natureisbahn's ice: just over the highest ground under its outline)
  if (_trackY === null) _trackY = Math.max(...trackOutline().map(([x, z]) => groundHeight(x, z)), groundHeight(TRACK.x, TRACK.z)) + 0.14;
  return _trackY;
}
function maxGroundOver(toWorld, halfA, halfB, n = 8) {
  let m = -Infinity;
  for (let i = 0; i <= n; i++) for (let k = 0; k <= n; k++) {
    const p = toWorld(-halfA + (2 * halfA * i) / n, -halfB + (2 * halfB * k) / n);
    m = Math.max(m, groundHeight(p.x, p.z));
  }
  return m;
}
let _rinkY = null, _sheetY = null;
export const rinkIceY = () => (_rinkY ??= maxGroundOver((a, b) => rinkWorld(a, b), RINK.halfL + 3, RINK.halfW + 3) + 0.12);
export const sheetIceY = () => (_sheetY ??= maxGroundOver((a, b) => sheetWorld(a, b), SHEET.halfL, SHEET.halfW + 0.5, 12) + 0.16);

// =====================================================================================================================
const skates = {
  setup(run) {
    const cfg = run.def.skates || { params: 'speed', ice: 'track' };
    const cm = run.hooks.controllerManager;
    const P = SKATE_PARAMS[cfg.params] || SKATE_PARAMS.speed;
    const surf = cfg.ice === 'rink' ? rinkIceY : trackIceY;
    const ice = run.ice = { cfg, P, surf, skater: createSkater(0), feet: null, pushEnabled: cfg.params !== 'hockey', bladeless: false };
    run.blades = createBlades();
    run.group.add(run.blades);
    // HUD: the rhythm bar (the green zone: a push there is a power stroke), the speed, the last stroke
    const { hud, flash, big } = buildIceHud(run);
    ice.ui = { hud, flash, big };
    if (ice.pushEnabled) {
      const mt = meter();
      ice.ui.meter = mt;
      mt.zone.style.left = `${P.window * 100}%`; mt.zone.style.right = '0';
      const row = el('div', 'ice-row');
      ice.ui.speed = el('span', null, '0 km/h');
      row.append(el('span', null, 'Rhythm'), mt.m, ice.ui.speed);
      hud.append(row, flash, el('div', 'ice-keys', 'W hold: stroke · Space in the green: power stroke · A/D lean · S brake'));
    }
    cm.personDriver = (dt) => skates.drive(run, dt, cm);
    cm.personPoser = (dt, p) => skates.pose(run, dt, p);
    run.cleanups.push(() => {
      if (cm.personDriver) cm.personDriver = null;
      cm.personPoser = null;
      const p = cm.entities.person;
      p.rig.placed = false; // (the walk starts afresh where the skater stands)
      p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
      p.speed = 0;
    });
  },
  reset(run) {
    const p = run.hooks.controllerManager.entities.person;
    run.ice.skater = createSkater(p.heading);
    run.ice.prevStroke = null;
    run._edge_up = true; // (the Enter / Start press: no push yet)
    if (run.ice.pushEnabled) touchLabel(run, 'Push');
  },
  /** The controllers' personDriver: the skater's stroke, glide and turn on the ice */
  drive(run, dt, cm) {
    const p = cm.entities.person, ice = run.ice, sk = ice.skater, P = ice.P, k = cm.keys;
    if (run.ice.override) { run.ice.override(dt, p, cm); return; }
    const go = live(run) && !ice.frozen;
    const input = go ? {
      forward: +k.forward || 0, back: +k.backward || 0, steer: (+k.left || 0) - (+k.right || 0),
      push: ice.pushEnabled && edge(run, cm, 'up')
    } : { forward: 0, back: 1, steer: 0, push: false };
    sk.heading = p.heading;
    let offIce = false;
    if (ice.cfg.ice === 'track') offIce = spineDistance(p.position.x, p.position.z) > TRACK_LANES.ice;
    const stroke = stepSkater(sk, input, dt, P, { offIce });
    if (stroke || sk.last === 'early') skates.feedback(run, stroke || (sk.lastAge === 0 ? 'early' : null));
    p.heading = sk.heading;
    p.speed = sk.speed;
    p.position.x += Math.sin(sk.heading) * sk.speed * dt;
    p.position.z += Math.cos(sk.heading) * sk.speed * dt;
    if (ice.contain) ice.contain(p, sk); // (a sheet of another mission's own: js/missions-outdoor.js, the Seehof Seeli)
    else if (ice.cfg.ice === 'rink') {
      const l = rinkLocal(p.position.x, p.position.z);
      if (clampToRink(l, 0.45)) { sk.speed *= 0.35; const w = rinkWorld(l.x, l.y); p.position.x = w.x; p.position.z = w.z; }
    } else {
      cm.resolveHorizontalCollision(p.position, 0.48, null, p);
      // (the snow bank round the ice: no further than a few metres off it)
      const d = spineDistance(p.position.x, p.position.z);
      if (d > TRACK_LANES.ice + 6) sk.speed *= 0.9;
    }
    p.position.y = ice.surf();
    p.verticalVel = 0;
    // (the stats the summary shows)
    const race = run.state?.race;
    if (race && stroke) { race.strokes++; if (stroke === 'power') race.power++; }
    if (race && sk.last === 'early' && sk.lastAge === 0) race.stumbles++;
  },
  feedback(run, kind) {
    const f = run.ice.ui.flash;
    if (!kind || !run.ice.pushEnabled) return;
    if (kind === 'power') { f.textContent = 'Power stroke!'; f.className = 'ice-flash is-good'; }
    else if (kind === 'early') { f.textContent = 'Too early: stumble'; f.className = 'ice-flash is-bad'; }
    else return;
    run.ice.flashAt = performance.now();
  },
  pose(run, dt, p) {
    const ice = run.ice, sk = ice.skater;
    if (ice.poseOverride) { const r = ice.poseOverride(dt, p); if (r) placeBlades(run.blades, r.feet); return; }
    const v = sk.speed;
    // the stroke's phase: half a turn a stroke, the push easing in with speed
    const period = ice.P.period * (0.6 + 0.4 * Math.min(1, v / 6));
    ice.phase = (sk.side > 0 ? 0 : Math.PI) + Math.PI * clamp(sk.t / period, 0, 1);
    const effort = clamp(v / 3, 0, 1) * (sk.t < period * 1.6 ? 1 : 0.35);
    ice.push = (ice.push ?? 0) + (effort - (ice.push ?? 0)) * Math.min(1, dt * 5);
    const hockey = ice.cfg.params === 'hockey';
    const crouch = hockey ? 0.62 + 0.18 * clamp(v / 6, 0, 1) : 0.35 + 0.65 * clamp(v / 7, 0, 1);
    const arms = hockey ? 'stick' : v > 9 && Math.abs(sk.omega) < 0.05 && ice.push < 0.5 ? 'back' : 'swing';
    const r = poseSkater(p.rig, p.position.x, p.position.y, p.position.z, p.heading, { crouch, phase: ice.phase, push: ice.push, lean: sk.lean, arms });
    ice.hands = r.hands;
    placeBlades(run.blades, r.feet);
  },
  update(run) {
    const ice = run.ice;
    if (ice.ui.meter) {
      const n = skaterNeedle(ice.skater, ice.P);
      ice.ui.meter.needle.style.left = `${n * 100}%`;
      ice.ui.meter.fill.style.width = `${n * 100}%`;
      const kmh = `${(ice.skater.speed * 3.6).toFixed(0)} km/h`;
      if (ice.ui.speed.textContent !== kmh) ice.ui.speed.textContent = kmh;
    }
    if (ice.flashAt && performance.now() - ice.flashAt > 900) { ice.ui.flash.textContent = ''; ice.flashAt = 0; }
  }
};

// =====================================================================================================================
// The 400 m track's markings: the inner kerb's blocks, the cones between the lanes on the curves, the start/finish line
const speedTrack = {
  setup(run) {
    const y = trackIceY();
    const pts = [];
    for (let s = 0; s < LAP_LENGTH; s += 6) pts.push({ ...trackPoint(s, TRACK_LANES.inner - TRACK_LANES.line), kind: 0 });
    const S = 2 * TRACK.half, C = Math.PI * TRACK_LANES.line;
    for (const c0 of [S, 2 * S + C]) for (let s = 4; s < C; s += 8) pts.push({ ...trackPoint(c0 + s, TRACK_LANES.divider - TRACK_LANES.line), kind: 1 });
    const geo = new THREE.ConeGeometry(0.11, 0.3, 8).translate(0, 0.15, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const cones = new THREE.InstancedMesh(geo, mat, pts.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    pts.forEach((p, i) => {
      m.makeTranslation(p.x, y, p.z);
      cones.setMatrixAt(i, m);
      cones.setColorAt(i, c.set(p.kind ? 0x2f6bff : 0xff5a1f));
    });
    cones.frustumCulled = false;
    run.group.add(run.storage(cones));
    // the start/finish line across both lanes, red
    const a = trackPoint(0, TRACK_LANES.inner - TRACK_LANES.line), b = trackPoint(0, TRACK_LANES.outer - TRACK_LANES.line);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, len).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8202a, polygonOffset: true, polygonOffsetFactor: -2 }));
    line.position.set((a.x + b.x) / 2, y + 0.015, (a.z + b.z) / 2);
    line.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    run.group.add(line);
  }
};

// =====================================================================================================================
// The penalty shoot-out: the rink in the Eisstadion
function rinkShape(halfL, halfW, r) {
  const sh = new THREE.Shape();
  sh.moveTo(-halfL + r, -halfW);
  sh.lineTo(halfL - r, -halfW); sh.absarc(halfL - r, -halfW + r, r, -Math.PI / 2, 0, false);
  sh.lineTo(halfL, halfW - r); sh.absarc(halfL - r, halfW - r, r, 0, Math.PI / 2, false);
  sh.lineTo(-halfL + r, halfW); sh.absarc(-halfL + r, halfW - r, r, Math.PI / 2, Math.PI, false);
  sh.lineTo(-halfL, -halfW + r); sh.absarc(-halfL + r, -halfW + r, r, Math.PI, Math.PI * 1.5, false);
  return sh;
}

function rinkTexture() {
  const W = 1024, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const X = (x) => ((x + RINK.halfL) / (2 * RINK.halfL)) * W, Y = (y) => ((y + RINK.halfW) / (2 * RINK.halfW)) * H, M = W / (2 * RINK.halfL);
  g.fillStyle = '#eef4f8'; g.fillRect(0, 0, W, H);
  const line = (x, col, w) => { g.fillStyle = col; g.fillRect(X(x) - (w * M) / 2, 0, w * M, H); };
  line(0, '#c8202a', 0.3); line(-7.14, '#1f4fb5', 0.3); line(7.14, '#1f4fb5', 0.3); line(-HOCKEY.goalX, '#c8202a', 0.08); line(HOCKEY.goalX, '#c8202a', 0.08);
  const circle = (x, y, r, col, w = 0.06) => { g.strokeStyle = col; g.lineWidth = w * M; g.beginPath(); g.arc(X(x), Y(y), r * M, 0, Math.PI * 2); g.stroke(); };
  circle(0, 0, 4.5, '#1f4fb5');
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { circle(sx * 20, sy * 7, 4.5, '#c8202a'); g.fillStyle = '#c8202a'; g.beginPath(); g.arc(X(sx * 20), Y(sy * 7), 0.3 * M, 0, Math.PI * 2); g.fill(); }
  for (const sx of [-1, 1]) {
    // the goal crease, light blue
    g.fillStyle = 'rgba(80, 160, 230, 0.55)';
    g.beginPath(); g.arc(X(sx * HOCKEY.goalX), Y(0), 1.83 * M, sx > 0 ? Math.PI / 2 : -Math.PI / 2, sx > 0 ? Math.PI * 1.5 : Math.PI / 2, false); g.fill();
  }
  // the centre: an HCD-ish yellow-blue spot
  g.fillStyle = '#1f4fb5'; g.beginPath(); g.arc(X(0), Y(0), 1.2 * M, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd200'; g.font = `bold ${Math.round(0.9 * M)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HCD', X(0), Y(0));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildGoal(mat, netMat) {
  const g = new THREE.Group();
  const post = new THREE.CylinderGeometry(0.03, 0.03, 1.22, 8);
  for (const y of [-HOCKEY.postY, HOCKEY.postY]) { const p = new THREE.Mesh(post, mat); p.position.set(0, 0.61, y); g.add(p); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.83, 8).rotateX(Math.PI / 2), mat); bar.position.set(0, 1.22, 0); g.add(bar);
  // the net: back, top, sides (a box open at the front)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.83, 1.0).rotateY(Math.PI / 2), netMat); back.position.set(1.0, 0.5, 0); g.add(back);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.83).rotateX(-Math.PI / 2), netMat); top.position.set(0.5, 1.1, 0); top.rotation.z = -0.2; g.add(top);
  for (const y of [-HOCKEY.postY, HOCKEY.postY]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.22), netMat); s.position.set(0.5, 0.61, y); g.add(s); }
  return g;
}

function buildGoalie() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.5 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  // (local: +x towards the shooter, +z the goalie's left... built facing -x of the rink, see place)
  const pad = new THREE.BoxGeometry(0.28, 0.82, 0.3);
  add(pad, white, 0.05, 0.42, 0.24); add(pad, white, 0.05, 0.42, -0.24);
  add(new THREE.BoxGeometry(0.42, 0.62, 0.62), red, -0.05, 1.05, 0); // the jersey
  add(new THREE.BoxGeometry(0.16, 0.42, 0.2), red, 0.05, 1.05, 0.42); add(new THREE.BoxGeometry(0.16, 0.42, 0.2), red, 0.05, 1.05, -0.42); // the arms
  add(new THREE.BoxGeometry(0.22, 0.3, 0.06), white, 0.18, 0.9, -0.55); // the blocker
  add(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), white, 0.18, 0.95, 0.56); // the catcher
  add(new THREE.SphereGeometry(0.15, 14, 10), white, 0.02, 1.48, 0); // the mask
  add(new THREE.BoxGeometry(0.02, 0.14, 0.2), dark, 0.16, 1.45, 0); // its cage
  add(new THREE.BoxGeometry(0.06, 0.06, 0.95), dark, 0.32, 0.04, -0.15); // the stick's paddle
  return g;
}

/** The stands: a bowl from behind the boards up to the arena's outer wall under the eaves (rows in HCD blue and
 *  yellow), sampled round the rink by rays from its centre */
function buildStands(y0, top) {
  const outline = EISSTADION.outline.map((p) => [p.x, p.z]);
  const N = 120, ROWS = 14;
  const inner = [], outer = [];
  const inRect = (lx, ly, hx, hy, r) => { const ax = Math.abs(lx), ay = Math.abs(ly); if (ax > hx || ay > hy) return false; if (ax > hx - r && ay > hy - r) return Math.hypot(ax - (hx - r), ay - (hy - r)) <= r; return true; };
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
    let lo = 0, hi = 60;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (inRect(cx * m, cy * m, RINK.halfL + 1.6, RINK.halfW + 1.6, RINK.corner + 1.6)) lo = m; else hi = m; }
    inner.push(rinkWorld(cx * lo, cy * lo));
    lo = 0; hi = 90;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; const w = rinkWorld(cx * m, cy * m); if (pointInRing(outline, w.x, w.z)) lo = m; else hi = m; }
    outer.push(rinkWorld(cx * (lo - 1.8), cy * (lo - 1.8)));
  }
  const pos = [], col = [];
  const blue = new THREE.Color(0x1d3f8f), yellow = new THREE.Color(0xf2c400), grey = new THREE.Color(0x5b6068);
  for (let r = 0; r < ROWS; r++) {
    const f0 = r / ROWS, f1 = (r + 1) / ROWS;
    const c = r === 0 ? grey : r % 5 === 4 ? yellow : blue;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const P = (k, f) => [inner[k].x + (outer[k].x - inner[k].x) * f, y0 + (top - y0) * f, inner[k].z + (outer[k].z - inner[k].z) * f];
      const a = P(i, f0), b = P(j, f0), cc = P(j, f1), d = P(i, f1);
      pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x222631, emissiveIntensity: 0.6 });
  return new THREE.Mesh(geo, mat);
}

const hockey = {
  setup(run) {
    const y = rinkIceY();
    const root = new THREE.Group();
    root.name = 'IceRink';
    // the ice (lit like under the arena's floodlights: its colour also as emission)
    const tex = rinkTexture();
    const iceGeo = new THREE.ShapeGeometry(rinkShape(RINK.halfL, RINK.halfW, RINK.corner), 12);
    const uv = iceGeo.attributes.uv, pa = iceGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) uv.setXY(i, (pa.getX(i) + RINK.halfL) / (2 * RINK.halfL), 1 - (pa.getY(i) + RINK.halfW) / (2 * RINK.halfW));
    iceGeo.rotateX(Math.PI / 2); // (shape x → local x, shape y → local z = rink y)
    const ice = new THREE.Mesh(iceGeo, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.28, roughness: 0.15, metalness: 0.0, side: THREE.DoubleSide }));
    ice.receiveShadow = true;
    root.add(ice);
    // the boards (white, a yellow kick strip) and the glass over them
    const ring = rinkShape(RINK.halfL, RINK.halfW, RINK.corner).getSpacedPoints(160);
    const wall = (h0, h1, colour, opts = {}) => {
      const pos = [];
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i], b = ring[i + 1];
        pos.push(a.x, h0, a.y, b.x, h0, b.y, b.x, h1, b.y, a.x, h0, a.y, b.x, h1, b.y, a.x, h1, a.y);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, side: THREE.DoubleSide, emissive: colour, emissiveIntensity: 0.25, ...opts }));
    };
    root.add(wall(0, 0.2, 0xf2c400), wall(0.2, 1.1, 0xf4f6f8), wall(1.1, 2.9, 0xcfe6ff, { transparent: true, opacity: 0.16, depthWrite: false, emissiveIntensity: 0 }));
    // the goals at both ends (the one shot at: +x)
    const red = new THREE.MeshStandardMaterial({ color: 0xd8202a, roughness: 0.4 });
    const net = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const goal = buildGoal(red, net);
    goal.position.set(HOCKEY.goalX, 0, 0);
    const goal2 = buildGoal(red, net);
    goal2.position.set(-HOCKEY.goalX, 0, 0); goal2.rotation.y = Math.PI;
    root.add(goal, goal2);
    // (the root in the rink's frame: local x along u, local z = rink y)
    root.position.set(RINK.x, y, RINK.z);
    root.rotation.y = Math.atan2(RINK.ux, RINK.uz) - Math.PI / 2;
    run.group.add(root);
    // the stands up to the arena's wall under the eaves
    const floor = Math.min(...EISSTADION.outline.map((p) => groundHeight(p.x, p.z)));
    run.group.add(buildStands(y + 1.15, floor + EISSTADION.eaves - 0.6));
    // the goalie, the puck, the stick
    run.goalie = buildGoalie();
    run.group.add(run.goalie);
    run.puck = new THREE.Mesh(new THREE.CylinderGeometry(HOCKEY.puckR, HOCKEY.puckR, 0.025, 16), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.5 }));
    run.group.add(run.puck);
    run.stick = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.0).translate(0, 0, 0.5), new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.5 }));
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.015).translate(0.1, 0, 0), new THREE.MeshStandardMaterial({ color: 0xf2c400, roughness: 0.5 }));
    run.stick.add(shaft, blade);
    run.stickBlade = blade;
    run.group.add(run.stick);
    // the aim: a red mark on the goal line where the shot would go
    run.aimMark = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.85, depthWrite: false }));
    run.group.add(run.aimMark);
    // HUD: the tally ●○, the result
    const ui = run.ice.ui;
    ui.tally = el('div', 'ice-tally');
    ui.aimText = el('span');
    const row = el('div', 'ice-row'); row.append(ui.tally, ui.aimText);
    ui.hud.append(row, ui.flash, el('div', 'ice-keys', 'W skate · A/D steer · S stop · Space shoot · drag to aim'));
    // a click (not a drag) on the view shoots too
    let down = null;
    const canvas = document.getElementById('canvas-container');
    run.listen(canvas, 'pointerdown', (e) => { if (e.pointerType !== 'touch' && e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    run.listen(canvas, 'pointerup', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 300) run._clickShot = true; down = null; });
  },
  reset(run) {
    touchLabel(run, 'Shoot');
    run.iceCam = null;
    run.hooks.cameraSystem.orbitYawOffset = 0;
    run._clickShot = false;
    run._edge_up = true;
    hockey.render(run);
  },
  teardown(run) { run.hooks.cameraSystem.orbitYawOffset = 0; },
  aim(run, p) {
    // where the skater looks: the heading and the camera's drag (the view direction), in the rink's frame
    const off = clamp(run.hooks.cameraSystem.orbitYawOffset || 0, -0.6, 0.6);
    return rinkHeadingLocal(p.heading + off);
  },
  update(run, ctx, dt, cm) {
    const g = run.state.game, p = cm.entities.person;
    const l = rinkLocal(p.position.x, p.position.z);
    const carrier = { x: l.x, y: l.y, heading: rinkHeadingLocal(p.heading) };
    const aim = hockey.aim(run, p);
    let shot = null;
    const pressed = edge(run, cm, 'up') || run._clickShot;
    run._clickShot = false;
    if (run.phase === 'running' && g.phase === 'skate' && pressed) { shot = aim; run.audio?.thump?.(); }
    if (run.phase === 'running' || run.phase === 'ready') {
      const before = g.phase;
      const r = run.phase === 'running' ? stepPenalty(g, dt, carrier, shot) : null;
      if (before !== 'result' && g.phase === 'result') hockey.announce(run, g.result);
      if (r === 'next') {
        // back to the centre spot for the next one
        const w = rinkWorld(-1.5, 0);
        p.position.set(w.x, rinkIceY(), w.z);
        p.heading = rinkHeadingWorld(0);
        run.ice.skater = createSkater(p.heading);
        run.lastPos.copy(p.position);
        run.hooks.cameraSystem.orbitYawOffset = 0;
        run.hooks.cameraSystem.resetForTeleport?.();
        run.ice.ui.flash.textContent = '';
        run.iceCam = null;
      }
    }
    // the aim mark on the goal line
    const cy = g.phase === 'skate' ? crossingY(g.puck.x, g.puck.y, aim, HOCKEY.goalX) : null;
    run.aimMark.visible = cy !== null && Math.abs(cy) < 3 && run.phase !== 'intro';
    if (run.aimMark.visible) { const w = rinkWorld(HOCKEY.goalX - 0.02, cy); run.aimMark.position.set(w.x, rinkIceY() + 0.02, w.z); }
    const inGoal = cy !== null && Math.abs(cy) < HOCKEY.postY - HOCKEY.puckR;
    const t = cy === null ? '' : inGoal ? 'on target' : 'off target';
    if (run.ice.ui.aimText.textContent !== t) { run.ice.ui.aimText.textContent = t; run.ice.ui.aimText.style.color = inGoal ? '#5be08c' : '#ff7a6b'; }
    hockey.render(run);
    if (run.ice.bigAt && performance.now() - run.ice.bigAt > 1600) { run.ice.ui.big.classList.remove('is-on'); run.ice.bigAt = 0; }
  },
  // the camera: over the skater's shoulder, high enough to see the goalie over him, along the view (heading + drag)
  camera(run, ctx, dt, cm) {
    if (run.phase === 'intro') return;
    const p = cm.entities.person, cs = run.hooks.cameraSystem, cam = ctx.camera;
    const yaw = p.heading + clamp(cs.orbitYawOffset || 0, -0.6, 0.6);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), y = run.ice.surf(); // (rinkIceY, or the pond's: js/missions-outdoor.js)
    const want = { x: p.position.x - fx * 4.6 - fz * 0.5, y: y + 2.7, z: p.position.z - fz * 4.6 + fx * 0.5, lx: p.position.x + fx * 9, ly: y + 0.6, lz: p.position.z + fz * 9 };
    const c = run.iceCam || (run.iceCam = { ...want });
    const k = Math.min(1, dt * 6);
    for (const key of Object.keys(want)) c[key] += (want[key] - c[key]) * k;
    cam.position.set(c.x, c.y, c.z);
    cam.lookAt(c.lx, c.ly, c.lz);
    cam.updateMatrixWorld();
  },
  announce(run, result) {
    const ui = run.ice.ui;
    ui.big.textContent = result === 'goal' ? 'GOAL!' : result === 'save' ? 'SAVE' : result === 'post' ? 'POST!' : 'MISS';
    ui.big.style.color = result === 'goal' ? '#ffc83d' : '#ffffff';
    ui.big.classList.add('is-on');
    run.ice.bigAt = performance.now();
    ui.flash.textContent = PENALTY_RESULT_TEXT[result] || '';
    ui.flash.className = `ice-flash ${result === 'goal' ? 'is-gold' : 'is-bad'}`;
    if (result === 'goal') run.audio?.boom?.(30, 0.35);
  },
  render(run) {
    const g = run.state?.game;
    if (!g) return;
    const y = rinkIceY();
    // the goalie: across his line, crouched, diving to the side he goes
    const gl = g.goalie;
    const w = rinkWorld(HOCKEY.goalieX, gl.y);
    run.goalie.position.set(w.x, y, w.z);
    run.goalie.rotation.set(0, rinkHeadingWorld(Math.PI) - Math.PI / 2, 0, 'YXZ');
    const dir = Math.sign(gl.target - gl.y) || Math.sign(gl.y) || 1;
    run.goalie.rotation.x = gl.dive * 0.9 * -dir;
    const pw = rinkWorld(g.puck.x, g.puck.y);
    run.puck.position.set(pw.x, y + 0.0125, pw.z);
    // the tally
    const tally = Array.from({ length: HOCKEY.attempts }, (_, i) => (i < g.results.length ? (g.results[i] === 'goal' ? '●' : '✕') : '○')).join(' ');
    if (run.ice.ui.tally.textContent !== tally) run.ice.ui.tally.textContent = tally;
  },
  after(run, ctx, dt, cm) {
    hockey.camera(run, ctx, dt, cm);
    // the stick: from the skater's hands to the puck (or ahead on the ice once it is away)
    const p = cm.entities.person, g = run.state.game;
    const hands = run.ice.hands;
    if (!hands) return;
    const h = hands[0].clone().lerp(hands[1], 0.5);
    let tx, tz;
    if (g.phase === 'skate') { const pw = rinkWorld(g.puck.x, g.puck.y); tx = pw.x; tz = pw.z; }
    else { tx = p.position.x + Math.sin(p.heading) * 1.1 - Math.cos(p.heading) * 0.3; tz = p.position.z + Math.cos(p.heading) * 1.1 + Math.sin(p.heading) * 0.3; }
    const ty = rinkIceY() + 0.04;
    run.stick.position.copy(h);
    run.stick.lookAt(tx, ty, tz);
    run.stick.scale.set(1, 1, Math.hypot(tx - h.x, ty - h.y, tz - h.z));
    run.stickBlade.scale.set(1, 1, 1 / run.stick.scale.z);
    run.stickBlade.position.set(0, 0, 1);
  }
};

// =====================================================================================================================
// Curling
function sheetTexture() {
  const W = 128, H = Math.round(W * (2 * SHEET.halfL) / (2 * SHEET.halfW)), c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const M = W / (2 * SHEET.halfW);
  const Y = (s) => H / 2 - s * M, X = (t) => W / 2 + t * M;
  g.fillStyle = '#f1f5f8'; g.fillRect(0, 0, W, H);
  for (const end of [-1, 1]) {
    const ty = Y(end * SHEET.tee);
    const rings = [[1.83, '#1f5fd0'], [1.22, '#f1f5f8'], [0.61, '#d0202a'], [0.15, '#f1f5f8']];
    for (const [r, col] of rings) { g.fillStyle = col; g.beginPath(); g.arc(X(0), ty, r * M, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#26324a';
    g.fillRect(0, ty - 0.6, W, 1.2); // the tee line
    g.fillRect(0, Y(end * SHEET.back) - 0.6, W, 1.2); // the back line
    g.fillStyle = '#d0202a';
    g.fillRect(0, Y(end * SHEET.hog) - 1.5, W, 3); // the hog line
    g.fillStyle = '#111'; g.fillRect(X(-0.25), Y(end * SHEET.hack) - 2, 0.18 * M, 4); g.fillRect(X(0.07), Y(end * SHEET.hack) - 2, 0.18 * M, 4); // the hacks
  }
  g.fillStyle = '#26324a';
  g.fillRect(X(0) - 0.5, Y(SHEET.hack), 1, (2 * SHEET.hack) * M); // the centre line
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildStone(granite, handle) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(granite.geo, granite.mat); body.position.y = 0.055; body.castShadow = true;
  const top = new THREE.Mesh(handle.geo, handle.mat); top.position.set(0, 0.125, -0.02);
  g.add(body, top);
  return g;
}

const curling = {
  setup(run) {
    const cm = run.hooks.controllerManager;
    const y = sheetIceY();
    const S = SHEET;
    const root = new THREE.Group();
    root.name = 'CurlingSheet';
    // the sheet, on a base reaching down to the court (it slopes a little)
    const tex = sheetTexture();
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2 * S.halfW, 2 * S.halfL).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.12 }));
    sheet.receiveShadow = true;
    sheet.rotation.y = Math.PI; // (the texture's top, +s, towards the far house)
    const low = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const w = sheetWorld(a * S.halfL, b * S.halfW); return groundHeight(w.x, w.z); }));
    const baseH = Math.max(0.2, y - low + 0.3);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2 * S.halfW + 0.6, baseH, 2 * S.halfL + 0.6).translate(0, -baseH / 2 - 0.01, 0), new THREE.MeshStandardMaterial({ color: 0xdfe7ee, roughness: 0.8 }));
    // the dividers along the sides and the bumpers at the ends
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x23324f, roughness: 0.6 });
    const side = new THREE.BoxGeometry(0.12, 0.12, 2 * S.halfL);
    for (const t of [-1, 1]) { const b = new THREE.Mesh(side, bumperMat); b.position.set(t * (S.halfW + 0.06), 0.06, 0); root.add(b); }
    const end = new THREE.BoxGeometry(2 * S.halfW + 0.24, 0.25, 0.15);
    for (const s of [-1, 1]) { const b = new THREE.Mesh(end, bumperMat); b.position.set(0, 0.12, s * (S.halfL + 0.07)); root.add(b); }
    root.add(sheet, base);
    root.position.set(S.x, y, S.z);
    root.rotation.y = sheetHeading(); // (local +z along +s, local +x … see the stones: placed in world from s/t)
    run.group.add(root);
    // the stones (one geometry, the granite and the red handles shared by all eight)
    const granite = { geo: new THREE.CylinderGeometry(CURLING.stoneR, CURLING.stoneR * 0.92, 0.11, 24), mat: new THREE.MeshStandardMaterial({ color: 0x7d838c, roughness: 0.45 }) };
    const handle = { geo: new THREE.BoxGeometry(0.05, 0.035, 0.2), mat: new THREE.MeshStandardMaterial({ color: 0xd8202a, roughness: 0.4 }) };
    run.stones = Array.from({ length: CURLING.stones }, () => { const st = buildStone(granite, handle); st.visible = false; run.group.add(st); return st; });
    // the aim line, faint, from the hack to beyond the house
    run.aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1).translate(0, 0.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb800, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    run.aimLine.renderOrder = 2;
    run.group.add(run.aimLine);
    // the broom
    run.broom = new THREE.Group();
    const handleM = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.3, 6).translate(0, -0.65, 0), new THREE.MeshStandardMaterial({ color: 0x2a2f38 }));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.09), new THREE.MeshStandardMaterial({ color: 0xd8202a }));
    head.position.y = -1.3;
    run.broom.add(handleM, head);
    run.broomHead = head;
    run.group.add(run.broom);
    run.blades = createBlades();
    run.blades.visible = false;
    run.group.add(run.blades);
    // HUD: power bar (the yellow mark: the weight for the tee), the curl, the stones and the score
    const { hud, flash, big } = buildIceHud(run);
    const mt = meter();
    mt.zone.hidden = true; mt.mark.hidden = false;
    const ui = run.curlUi = { hud, flash, big, meter: mt, curl: el('span'), info: el('span'), aim: el('span') };
    const row = el('div', 'ice-row'); row.append(el('span', null, 'Power'), mt.m);
    const row2 = el('div', 'ice-row'); row2.append(ui.curl, ui.aim, ui.info);
    hud.append(row2, row, flash, el('div', 'ice-keys', 'A/D or drag: aim · W/S: curl · hold Space: power, let go: throw · hold Space: sweep'));
    // the weight for the tee (no sweeping) on the bar: v = sqrt(2 · decel · distance)
    const vTee = Math.sqrt(2 * CURLING.decel * (SHEET.tee - CURLING.release));
    mt.mark.style.left = `${clamp((vTee - CURLING.minV) / (CURLING.maxV - CURLING.minV), 0, 1) * 100}%`;
    // aim by dragging across the view (mouse or a finger off the joystick)
    const canvas = document.getElementById('canvas-container');
    let last = null;
    run.listen(canvas, 'pointerdown', (e) => { last = e.clientX; });
    run.listen(window, 'pointermove', (e) => {
      if (last === null || !(e.buttons & 1) && e.pointerType === 'mouse') { if (e.pointerType === 'mouse') last = null; return; }
      const g = run.state?.game;
      if (g && g.phase === 'aim' && !run.curl.charging && live(run)) g.aim = clamp(g.aim + (e.clientX - last) * 0.00012, -CURLING.aimMax, CURLING.aimMax);
      last = e.clientX;
    });
    run.listen(window, 'pointerup', () => { last = null; });
    run.curl = { mode: 'aim', t: 0, charging: false, settle: 0, follow: null };
    cm.personDriver = (dt) => curling.drive(run, dt, cm);
    cm.personPoser = (dt, p) => curling.pose(run, dt, p);
    run.cleanups.push(() => {
      cm.personDriver = null; cm.personPoser = null;
      const p = cm.entities.person;
      p.rig.placed = false;
      p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
    });
  },
  reset(run) {
    touchLabel(run, 'Throw');
    Object.assign(run.curl, { mode: 'aim', t: 0, charging: false, settle: 0, deliver: null, armed: false, cam: null });
    run._edge_up = true;
    for (const st of run.stones) st.visible = false;
    curling.toHack(run);
  },
  teardown(run) { const cs = run.hooks.cameraSystem; cs.orbitYawOffset = 0; },
  toHack(run) {
    const cm = run.hooks.controllerManager, p = cm.entities.person;
    const w = sheetWorld(-SHEET.hack + 0.3, 0);
    p.position.set(w.x, sheetIceY(), w.z);
    p.heading = sheetHeading();
    p.speed = 0;
    run.lastPos.copy(p.position);
  },
  // the person: at the hack while aiming, sliding out with the stone on the delivery, then sweeping alongside it
  drive(run, dt, cm) {
    const p = cm.entities.person, c = run.curl, g = run.state?.game;
    p.verticalVel = 0;
    if (!g) return;
    if (c.mode === 'deliver') {
      const d = c.deliver;
      d.t += dt;
      const f = clamp(d.t / d.time, 0, 1);
      const ease = 1 - (1 - f) * (1 - f);
      const s = -SHEET.hack + 0.3 + (CURLING.release - 0.75 + SHEET.hack - 0.3) * ease;
      const w = sheetWorld(s, 0);
      p.position.set(w.x, sheetIceY(), w.z);
      p.speed = 2;
    } else if (c.mode === 'travel' && g.current >= 0) {
      const st = g.stones[g.current];
      const want = st.inPlay ? sheetWorld(Math.min(st.s - 1.1, SHEET.tee - 4.2), st.t + 0.75 * (st.t > 1.2 ? -1 : 1)) : null; // (the sweeper stays out of the house)
      if (want) {
        const k = Math.min(1, dt * 6);
        p.position.x += (want.x - p.position.x) * k;
        p.position.z += (want.z - p.position.z) * k;
      }
      p.speed = st.moving ? Math.hypot(st.vs, st.vt) : 0;
      p.position.y = sheetIceY();
    } else p.speed = 0;
    run.lastPos.copy(p.position); // (the walk back to the hack is no teleport)
  },
  pose(run, dt, p) {
    const c = run.curl, cm = run.hooks.controllerManager;
    let r;
    const yaw = sheetHeading();
    if (c.mode === 'deliver' || (c.mode === 'aim' && c.charging)) {
      r = poseSkater(p.rig, p.position.x, p.position.y - BLADE_H + 0.02, p.position.z, yaw, { crouch: 0.5, lunge: c.mode === 'deliver' ? 1 : 0.7, arms: 'swing', push: 0 });
    } else if (c.mode === 'travel' && cm.keys.up) {
      c.sweepPhase = (c.sweepPhase || 0) + dt * 14;
      r = poseSkater(p.rig, p.position.x, p.position.y - BLADE_H + 0.02, p.position.z, yaw, { crouch: 0.55, arms: 'broom', push: 0.25, phase: c.sweepPhase });
    } else {
      r = poseSkater(p.rig, p.position.x, p.position.y - BLADE_H + 0.02, p.position.z, yaw, { crouch: 0.12, arms: 'broom', push: 0 });
    }
    run.curlHands = r.hands;
  },
  update(run, ctx, dt, cm) {
    const g = run.state.game, c = run.curl, k = cm.keys, ui = run.curlUi;
    const running = run.phase === 'running' || run.phase === 'ready';
    if (running && g.phase === 'aim' && c.mode === 'aim') {
      const steer = (+k.right || 0) - (+k.left || 0);
      if (steer) g.aim = clamp(g.aim + steer * 0.03 * dt, -CURLING.aimMax, CURLING.aimMax);
      if (edge(run, cm, 'forward')) g.curl = 1;
      if (edge(run, cm, 'backward')) g.curl = -1;
      // the power: grows while Space is held (up and down again past full), the throw on letting go
      if (!k.up) c.armed = true;
      if (k.up && c.armed) {
        if (!c.charging) { c.charging = true; g.charge = 0; g.chargeDir = 1; }
        g.charge += g.chargeDir * dt / 1.7;
        if (g.charge >= 1) { g.charge = 1; g.chargeDir = -1; }
        if (g.charge <= 0) { g.charge = 0; g.chargeDir = 1; }
      } else if (c.charging) {
        c.charging = false;
        if (run.phase === 'ready') { run.phase = 'running'; run.startedAt = run.gameClock || 0; run.ui.panel.dataset.phase = 'running'; }
        g.power = g.charge;
        c.mode = 'deliver';
        c.armed = false;
        c.deliver = { t: 0, time: 1.3, power: g.charge, aim: g.aim, curl: g.curl };
        run.audio?.thump?.();
      }
    }
    if (c.mode === 'deliver' && c.deliver.t >= c.deliver.time) {
      throwStone(g, c.deliver.power, c.deliver.aim, c.deliver.curl);
      c.mode = 'travel';
      c.settle = 0;
    }
    if (c.mode === 'travel') {
      const moving = stepStones(g, dt * CURLING.simSpeed, !!k.up);
      if (!moving) {
        c.settle += dt;
        if (c.settle > 1.4) {
          const phase = settleStones(g);
          const cur = g.stones[g.current];
          curling.say(run, cur.out === 'hog' ? 'Hogged: short of the hog line, removed' : cur.out ? 'Out of play' : stonePoints(cur.s, cur.t) ? `In the house: ${stonePoints(cur.s, cur.t)} points` : 'Short of the house', !cur.out && stonePoints(cur.s, cur.t) > 0);
          if (phase === 'aim') { c.mode = 'aim'; g.aim = 0; g.charge = 0; c.armed = !k.up; curling.toHack(run); }
          else c.mode = 'done';
        }
      }
    }
    curling.render(run, cm);
    // HUD
    const pct = `${((g.charge || 0) * 100).toFixed(1)}%`;
    if (ui.meter.fill.style.width !== pct) { ui.meter.fill.style.width = pct; ui.meter.needle.style.left = pct; }
    const curlT = g.curl > 0 ? 'Curl ↻ right' : 'Curl ↺ left';
    if (ui.curl.textContent !== curlT) ui.curl.textContent = curlT;
    const aimT = `Aim ${g.aim >= 0 ? '+' : '−'}${Math.abs(g.aim * 180 / Math.PI).toFixed(1)}°`;
    if (ui.aim.textContent !== aimT) ui.aim.textContent = aimT;
    const info = `Stone ${Math.min(CURLING.stones, g.stones.length + (c.mode === 'aim' ? 1 : 0))}/${CURLING.stones} · ${curlingScore(g)} pts`;
    if (ui.info.textContent !== info) ui.info.textContent = info;
    if (c.flashAt && performance.now() - c.flashAt > 2200) { ui.flash.textContent = ''; c.flashAt = 0; }
  },
  say(run, text, good) {
    const f = run.curlUi.flash;
    f.textContent = text;
    f.className = `ice-flash ${good ? 'is-good' : 'is-bad'}`;
    run.curl.flashAt = performance.now();
  },
  render(run, cm) {
    const g = run.state.game, c = run.curl, y = sheetIceY();
    const yaw = sheetHeading();
    g.stones.forEach((st, i) => {
      const m = run.stones[i];
      m.visible = st.inPlay;
      if (!st.inPlay) return;
      const w = sheetWorld(st.s, st.t);
      m.position.set(w.x, y, w.z);
      st.rot = (st.rot || 0) + (st.moving ? st.spin * -0.8 * (1 / 60) : 0);
      m.rotation.y = yaw + st.rot;
    });
    // the stone in the hand: at the hack while aiming, sliding out on the delivery
    const next = run.stones[g.stones.length];
    if (next) {
      const p = cm.entities.person;
      next.visible = c.mode === 'aim' || c.mode === 'deliver';
      if (next.visible) { next.position.set(p.position.x + Math.sin(yaw) * 0.75, y, p.position.z + Math.cos(yaw) * 0.75); next.rotation.y = yaw; }
    }
    // the aim line from the release point
    run.aimLine.visible = c.mode === 'aim' && live(run);
    if (run.aimLine.visible) {
      const a = sheetWorld(CURLING.release, 0);
      const len = SHEET.tee - CURLING.release + 2;
      run.aimLine.position.set(a.x, y + 0.01, a.z);
      run.aimLine.scale.set(1, 1, len);
      // (the plane's +y was turned onto -z: along heading + aim, turned the other way round by rotation.y)
      run.aimLine.rotation.y = yaw - g.aim + Math.PI; // (aim positive: to the right, the heading turning down)
    }
  },
  after(run, ctx, dt, cm) {
    const g = run.state.game, c = run.curl, cam = ctx.camera, yaw = sheetHeading();
    const fx = Math.sin(yaw), fz = Math.cos(yaw), y = sheetIceY();
    const hands = run.curlHands;
    // the broom from the hands down to the ice in front
    if (hands) {
      const h = hands[0].clone().lerp(hands[1], 0.5);
      const p = cm.entities.person;
      const sweeping = c.mode === 'travel' && cm.keys.up;
      const off = sweeping ? Math.sin((c.sweepPhase || 0)) * 0.25 : 0;
      const tx = p.position.x + fx * 0.9 + Math.cos(yaw) * off * -1, tz = p.position.z + fz * 0.9 - Math.sin(yaw) * off * -1;
      const ty = y + (sweeping ? 0.03 : 0.25);
      run.broom.position.copy(h);
      const L = Math.hypot(tx - h.x, ty - h.y, tz - h.z);
      run.broom.lookAt(tx, ty, tz);
      run.broom.rotateX(-Math.PI / 2);
      run.broom.scale.set(1, L / 1.3, 1);
      run.broomHead.scale.set(1, 1.3 / L, 1);
      run.broom.visible = c.mode !== 'deliver';
    }
    if (run.phase === 'intro') return;
    // the camera: behind the hack looking down the sheet while aiming; behind the stone while it slides; over the house
    let ex, ey, ez, lx, ly, lz;
    const cur = g.stones[g.current];
    if ((c.mode === 'travel' || c.mode === 'done') && cur) {
      const ss = cur.inPlay ? cur.s : SHEET.tee;
      const near = SHEET.tee - ss < 9 || !cur.moving;
      const eye = sheetWorld(near ? SHEET.tee - 7.5 : ss - 5.5, 0), look = sheetWorld(near ? SHEET.tee : ss + 6, cur.inPlay ? cur.t * 0.5 : 0);
      ex = eye.x; ey = y + (near ? 4.2 : 2.4); ez = eye.z; lx = look.x; ly = y; lz = look.z;
    } else {
      const eye = sheetWorld(-SHEET.hack - 4.2, 0), look = sheetWorld(SHEET.tee - 4, 0);
      ex = eye.x; ey = y + 2.6; ez = eye.z; lx = look.x; ly = y; lz = look.z;
    }
    const s = c.cam || (c.cam = { x: ex, y: ey, z: ez, lx, ly, lz });
    const k = Math.min(1, dt * 3);
    s.x += (ex - s.x) * k; s.y += (ey - s.y) * k; s.z += (ez - s.z) * k; s.lx += (lx - s.lx) * k; s.ly += (ly - s.ly) * k; s.lz += (lz - s.lz) * k;
    cam.position.set(s.x, s.y, s.z);
    cam.lookAt(s.lx, s.ly, s.lz);
    cam.updateMatrixWorld();
  }
};

export const ICE_FEATURES = { skates, speedTrack, hockey, curling };
void stonePoints; void curlingSpeed; void sheetLocal;
