import * as THREE from 'three/webgpu';
import { color, float, positionGeometry, smoothstep, uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PersonCrowd, PersonRig, PERSON_BONES } from './pedestrians.js';
import { surfaceHeight } from './terrain.js';
import { routePoint } from './rhb-route.js';
import {
  HEADBANG, HEADBANG_LENGTH, BEAT_S, HEADBANG_SONG, createHeadbang, headbangTap, headbangAdvance, headbangMultiplier,
  FOOSBALL, FOOSBALL_RODS, PLAYER_RODS, createFoosball, foosballStep, manY,
  GONDOLA, GONDOLA_PIECES, rotateCells, pieceCells, createGondola, gondolaMove, gondolaRotate, gondolaDrop, gondolaDepart, gondolaStep, gondolaCabinScore, gondolaScore, gondolaPersons,
  RHB_DRIVE, createRhbDrive, rhbDriveStep, rhbLimitAt, rhbDriveScore
} from './missions-data-fun.js';

// js/missions-fun.js
// The runtime of the four fun missions (js/missions-data-fun.js has their definitions and the games' pure logic):
// js/missions.js merges FUN_FEATURES into its features, a mission asks for one by def.features.
//  - headbang / foosball: an interior (the BOX's stage and crowd; the Bar La Onda with its table football) built once
//    the player walks through the door, as a small group of its own high above the door (nothing of the city in view),
//    the camera inside it; disposed again with the run (the phone keeps no interior it does not need). Unlit
//    materials with the shading baked into vertex colours (no extra lights: they would recompile the city's shaders).
//    The people are the city's skinned figures (js/pedestrians.js PersonCrowd / PersonRig), self-lit.
//  - gondola: the Jakobshornbahn's valley station and its big cabin, the floor a grid the passengers (and their skis,
//    boards, prams, luggage, a dog) are packed into like Tetris; a packed cabin leaves, the next comes in.
//  - rhbDriver: the train the rhb mode drives (js/rhb.js takeOver), set at Davos Wolfgang; the HUD's speed, limit and
//    timetable.
// The keys are taken in the mission's capture listener (they never reach the walking pedestrian); on touch screens
// the games have their own buttons and drag on the view.

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const INTERIOR_LIFT = 400; // m: the interiors float this high above their door (out of sight of the town)

// --- Shared: styles, geometry, people ---------------------------------------------------------------------------------
const STYLE = `
.fun-hud{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:40;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#fff;width:min(560px,calc(100vw - 24px))}
.fun-hud[hidden]{display:none}
.fun-hud .panel{pointer-events:auto}
.fun-card{background:rgba(10,12,20,.78);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:8px 12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 6px 24px rgba(0,0,0,.35)}
.fun-row{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap}
.fun-big{font-size:26px;font-weight:800;letter-spacing:.01em;font-variant-numeric:tabular-nums}
.fun-sub{font-size:13px;opacity:.85;font-variant-numeric:tabular-nums}
.fun-btn{pointer-events:auto;border:0;border-radius:999px;padding:14px 28px;font:800 18px Inter,system-ui,sans-serif;color:#fff;background:linear-gradient(180deg,#ff4fd8,#a21cff);box-shadow:0 6px 18px rgba(162,28,255,.45);touch-action:manipulation;user-select:none;-webkit-user-select:none}
.fun-btn:active,.fun-btn.is-pressed{transform:scale(.96);filter:brightness(1.2)}
.fun-lane{position:relative;width:100%;height:46px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.1));border:1px solid rgba(255,255,255,.15);overflow:hidden}
.fun-lane-hit{position:absolute;left:18%;top:4px;bottom:4px;width:4px;margin-left:-2px;border-radius:2px;background:#fff;box-shadow:0 0 12px #ff4fd8}
.fun-lane-note{position:absolute;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#ff4fd8 55%,#7a0bd1);box-shadow:0 0 10px rgba(255,79,216,.8)}
.fun-lane-note.is-off{background:radial-gradient(circle at 35% 35%,#fff,#3fd6ff 55%,#0b5ad1);box-shadow:0 0 10px rgba(63,214,255,.8)}
.fun-lane-note.is-hit{opacity:0}
.fun-lane-note.is-miss{background:#555;box-shadow:none;opacity:.6}
.fun-judge{font:900 28px Inter,system-ui,sans-serif;letter-spacing:.06em;text-shadow:0 2px 14px rgba(0,0,0,.6);height:34px;transition:transform .08s}
.fun-judge.perfect{color:#ffe14f}.fun-judge.good{color:#7dffb0}.fun-judge.miss,.fun-judge.off{color:#ff6b6b}
.fun-judge.pop{transform:scale(1.25)}
.fun-goal{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);font:900 64px Inter,system-ui,sans-serif;color:#ffe14f;text-shadow:0 4px 30px rgba(0,0,0,.7);pointer-events:none;z-index:41;opacity:0;transition:opacity .2s}
.fun-goal.is-on{opacity:1}
.fun-queue{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.fun-group{pointer-events:auto;min-width:58px;border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:6px 8px;background:rgba(10,12,20,.8);color:#fff;font:700 13px Inter,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;gap:2px;touch-action:manipulation}
.fun-group b{font-size:20px}
.fun-group kbd{font:600 10px Inter,system-ui,sans-serif;opacity:.7}
.fun-group .dots{letter-spacing:2px;color:#3fd6ff}
.fun-toggle{pointer-events:auto;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:8px 14px;background:rgba(10,12,20,.8);color:#fff;font:700 13px Inter,system-ui,sans-serif}
.fun-toggle.is-on{background:#2fb3ff;color:#001}
.fun-next{display:flex;align-items:center;gap:6px}
.fun-next-grid{display:inline-grid;gap:2px}
.fun-next-grid span{width:12px;height:12px;border-radius:2px;background:rgba(255,255,255,.08)}
.fun-pad{min-width:52px;min-height:44px;font-size:20px;touch-action:manipulation}
.fun-send{padding:10px 20px;font-size:15px;background:linear-gradient(180deg,#2fb3ff,#0a6fd1);box-shadow:0 6px 18px rgba(10,111,209,.45)}
.fun-flash{color:#ffe14f;font-weight:800;min-height:18px}
.fun-rhb{position:fixed;left:16px;top:86px;z-index:40;font-family:Inter,system-ui,sans-serif;color:#fff;display:flex;gap:10px;align-items:stretch;pointer-events:none}
.fun-rhb[hidden]{display:none}
.fun-limit{width:58px;height:58px;border-radius:50%;background:#fff;border:7px solid #d4001a;color:#111;display:flex;align-items:center;justify-content:center;font:900 20px Inter,system-ui,sans-serif;box-sizing:border-box}
.fun-speed{font:800 30px Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums}
.fun-speed.is-over{color:#ff5b5b}
.fun-rhb table{border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.fun-rhb td{padding:1px 6px;white-space:nowrap}
.fun-rhb tr.is-next td{color:#ffe14f;font-weight:700}
.fun-rhb tr.is-done td{opacity:.6}
body.fun-indoor #touch-controls,body.fun-indoor .gta-prompt,body.fun-indoor .touch-use,body.fun-indoor .mission-prompt{display:none!important}
body.fun-indoor .hud-bottom-center{visibility:hidden}
@media (max-width:640px){body.fun-indoor .hud-bottom-right,body.fun-indoor .hud-bottom-left{visibility:hidden}}
@media (max-width:640px){.fun-hud{bottom:10px}.fun-big{font-size:21px}.fun-btn{padding:16px 34px}.fun-rhb{left:8px;bottom:auto;top:calc(env(safe-area-inset-top,0px) + 150px);transform:scale(.88);transform-origin:top left}}
`;

function addStyle(run) {
  const s = el('style');
  s.dataset.fun = '1';
  s.textContent = STYLE;
  document.head.append(s);
  run.cleanups.push(() => s.remove());
}

/** Boxes merged into one geometry, the shading baked into their vertex colours (lit from above, a little from the
 *  front): [w, h, d, x, y, z, colour, rotY?] */
function shadedBoxes(list) {
  const parts = [];
  const c = new THREE.Color();
  for (const [w, h, d, x, y, z, col, rot = 0] of list) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (rot) g.rotateY(rot);
    g.translate(x, y, z);
    shade(g, col, c);
    parts.push(g);
  }
  return mergeGeometries(parts);
}
function shade(g, col, c = new THREE.Color()) {
  const n = g.attributes.normal, count = g.attributes.position.count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const k = 0.62 + 0.38 * Math.max(0, n.getY(i)) + 0.16 * Math.max(0, n.getZ(i)) - 0.22 * Math.max(0, -n.getY(i)) + 0.06 * n.getX(i);
    c.set(col).multiplyScalar(k);
    colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}
const unlit = (opts = {}) => new THREE.MeshBasicNodeMaterial({ vertexColors: true, ...opts });
function mesh(geometry, material = unlit()) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = m.receiveShadow = false;
  return m;
}
/** A glowing sign: text on a canvas, on a plane */
function signPlane(text, w, h, { fg = '#ff4fd8', bg = 'rgba(0,0,0,0)', font = '900 160px Inter, Arial, sans-serif', glow = 30 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = Math.round(1024 * (h / w));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = fg; ctx.shadowBlur = glow; ctx.fillStyle = fg;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.55;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, depthWrite: false });
  return mesh(new THREE.PlaneGeometry(w, h), mat);
}

/** A crowd of the city's figures, self-lit (the interiors have no lights of their own): `tint` colours the glow */
function makeCrowd(max) {
  const crowd = new PersonCrowd(max, { farDistance: 1e9, castShadow: false });
  const tint = uniform(new THREE.Color(1, 1, 1));
  for (const m of crowd.meshes) {
    m.receiveShadow = false;
    m.material.emissiveNode = m.material.colorNode.mul(tint);
  }
  return { crowd, tint };
}
let seedN = 1;
const metalhead = (female = Math.random() < 0.35) => new PersonRig({ seed: (seedN++ * 0.6180339) % 1, female, hair: 0.75 + Math.random() * 0.25, girth: 0.95 + Math.random() * 0.2, scale: female ? 0.95 : 1 + Math.random() * 0.06 });
const guest = () => new PersonRig({ seed: (seedN++ * 0.6180339) % 1, female: Math.random() < 0.45, hair: Math.random(), girth: 0.92 + Math.random() * 0.2, scale: 0.94 + Math.random() * 0.1 });

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
/** Nods a figure's head: pitched forward by `angle` (rad) about the neck, tilted sideways by `tilt` (its pose solved) */
function nod(rig, angle, tilt = 0) {
  const a = rig.pose, o = PERSON_BONES.HEAD * 8;
  _q.set(a[o], a[o + 1], a[o + 2], a[o + 3]);
  _p.copy(rig.bind[PERSON_BONES.HEAD]).applyQuaternion(_q).multiplyScalar(rig.s).add(_t.set(a[o + 4], a[o + 5], a[o + 6]));
  _q2.setFromEuler(_e.set(angle, rig.yaw, tilt));
  rig.writeBone(PERSON_BONES.HEAD, _q2, _p);
}

function disposeTree(root) {
  const materials = new Set(), geometries = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material || [])) materials.add(m);
    if (o.isInstancedMesh) o.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
}

// --- An interior: built at the door, entered with a fade, left (disposed) with the run -----------------------------------
class Interior {
  constructor(run, door, build) {
    this.run = run;
    this.origin = new THREE.Vector3(door.x, surfaceHeight(door.x, door.z) + INTERIOR_LIFT, door.z);
    this.group = new THREE.Group();
    this.group.name = 'MissionInterior';
    this.group.position.copy(this.origin);
    this.group.userData.terrain = 'absolute';
    run.group.add(this.group);
    build(this.group);
    this.group.updateMatrixWorld(true);
    this.fade = el('div');
    this.fade.style.cssText = 'position:fixed;inset:0;background:#000;z-index:39;pointer-events:none;opacity:1;transition:opacity .45s';
    document.body.append(this.fade);
    requestAnimationFrame(() => requestAnimationFrame(() => { if (this.fade) this.fade.style.opacity = '0'; }));
    document.body.classList.add('fun-indoor');
    const cm = run.hooks.controllerManager;
    this.hadDriver = 'personDriver' in cm;
    this.prevDriver = cm.personDriver;
    cm.personDriver = (dt, m) => { const p = m.entities.person; p.speed = 0; }; // (the walker waits at the door)
    this.snow = run.scene.getObjectByName('snowfall');
  }
  /** The camera at `pos` looking at `look` (interior coordinates) */
  camera(cam, pos, look) {
    const o = this.origin;
    cam.position.set(o.x + pos.x, o.y + pos.y, o.z + pos.z);
    cam.lookAt(o.x + look.x, o.y + look.y, o.z + look.z);
    cam.updateMatrixWorld();
    if (this.snow) this.snow.visible = false; // (no snowfall indoors)
  }
  dispose() {
    if (!this.group) return;
    this.group.removeFromParent();
    disposeTree(this.group);
    this.group = null;
    this.fade?.remove(); this.fade = null;
    document.body.classList.remove('fun-indoor');
    const cm = this.run.hooks.controllerManager;
    if (this.hadDriver) cm.personDriver = this.prevDriver ?? null; else delete cm.personDriver;
    this.run.hooks.cameraSystem.resetForTeleport?.();
  }
}

// --- Sound: a metal band from oscillators and noise (Web Audio, on the city's mix bus) -------------------------------------
class MetalBand {
  constructor(audio) {
    this.audio = audio;
    this.scheduled = -1; // the last 16th scheduled
    this.ctxStart = null; // the context's time at the song's t = 0
  }
  get live() { const a = this.audio; return !!(a && a.enabled && a.context && a.context.state === 'running' && a.mix); }
  get latency() { const c = this.audio?.context; return this.live ? (c.outputLatency || c.baseLatency || 0) : 0; }
  init() {
    if (this.out || !this.live) return !!this.out;
    const ctx = this.audio.context;
    this.out = ctx.createGain(); this.out.gain.value = 0.55;
    this.out.connect(this.audio.mix);
    const n = Math.floor(ctx.sampleRate * 0.6), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // the guitars' fuzz
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 9) * 0.9; }
    this.drive = ctx.createWaveShaper(); this.drive.curve = curve; this.drive.oversample = '2x';
    this.cab = ctx.createBiquadFilter(); this.cab.type = 'lowpass'; this.cab.frequency.value = 3200; this.cab.Q.value = 0.8;
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 70;
    this.gtrOut = ctx.createGain(); this.gtrOut.gain.value = 0.22;
    this.drive.connect(this.hp).connect(this.cab).connect(this.gtrOut).connect(this.out);
    return true;
  }
  /** The song's sections by beat (js/missions-data-fun.js HEADBANG_SONG) */
  sectionAt(beat) {
    let b = beat - HEADBANG.countIn;
    if (b < 0) return 'count';
    for (const part of HEADBANG_SONG) { if (b < part.bars * 4) return part.name; b -= part.bars * 4; }
    return 'end';
  }
  /** Schedules what falls within the next 0.25 s of song time t */
  pump(t) {
    if (!this.init()) return;
    const ctx = this.audio.context;
    if (this.ctxStart === null) this.ctxStart = ctx.currentTime - t + 0.05;
    const sixteenth = BEAT_S / 4;
    const until = t + 0.25;
    for (let k = this.scheduled + 1; k * sixteenth < until; k++) {
      this.scheduled = k;
      const at = this.ctxStart + k * sixteenth;
      if (at < ctx.currentTime - 0.01 || k * sixteenth > HEADBANG_LENGTH - HEADBANG.tail + BEAT_S) continue;
      this.step(k, at);
    }
  }
  step(k, at) {
    const beat = Math.floor(k / 4), sub = k % 4, inBar = beat % 4;
    const section = this.sectionAt(beat);
    if (section === 'end') return;
    if (section === 'count') { if (sub === 0) this.stick(at, inBar === 3); return; }
    const half = section === 'Intro riff' || section === 'Breakdown';
    // drums
    if (half) {
      if (sub === 0 && inBar === 0) this.kick(at);
      if (sub === 2 && inBar === 1) this.kick(at);
      if (sub === 0 && inBar === 2) this.snare(at);
      if (sub === 0) this.hat(at, 0.5);
    } else {
      if (sub === 0 && (inBar === 0 || inBar === 2)) this.kick(at);
      if (section === 'Chorus' || section === 'Finale') { if (sub === 2) this.kick(at, 0.7); }
      if (sub === 3 && inBar === 3 && section === 'Break') this.kick(at, 0.8);
      if (sub === 0 && (inBar === 1 || inBar === 3)) this.snare(at);
      if (sub === 0 || sub === 2) this.hat(at, sub === 0 ? 0.55 : 0.35);
    }
    if (k % 64 === 0 && beat > HEADBANG.countIn) this.crash(at);
    // the riff: palm-muted E chugs on the 8ths, power chords on the accents (E5 G5 A5 / E5 D5 C5 B5)
    const bar = Math.floor((beat - HEADBANG.countIn) / 4);
    const prog = section === 'Chorus' || section === 'Finale' ? [40, 43, 45, 43] : section === 'Break' ? [40, 38, 36, 35] : [40, 40, 43, 45];
    const root = prog[bar % 4];
    if (half) { if (sub === 0 && (inBar === 0 || inBar === 2)) this.chord(at, root, BEAT_S * 1.8, false); }
    else if (sub === 0 && inBar === 0) this.chord(at, root, BEAT_S * 0.9, false);
    else if (sub % 2 === 0) this.chord(at, inBar === 3 && sub === 2 ? root + 3 : 40, BEAT_S * 0.22, true);
  }
  env(at, peak, decay) {
    const g = this.audio.context.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    return g;
  }
  kick(at, v = 1) {
    const ctx = this.audio.context;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
    const g = this.env(at, 0.9 * v, 0.28);
    o.connect(g).connect(this.out); o.start(at); o.stop(at + 0.3);
    const click = ctx.createBufferSource(); click.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const cg = this.env(at, 0.25 * v, 0.02);
    click.connect(hp).connect(cg).connect(this.out); click.start(at, 0, 0.03);
  }
  snare(at) {
    const ctx = this.audio.context;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    const g = this.env(at, 0.6, 0.2);
    n.connect(bp).connect(g).connect(this.out); n.start(at, Math.random() * 0.3, 0.22);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(210, at); o.frequency.exponentialRampToValueAtTime(160, at + 0.08);
    const og = this.env(at, 0.35, 0.1);
    o.connect(og).connect(this.out); o.start(at); o.stop(at + 0.12);
  }
  hat(at, v) {
    const ctx = this.audio.context;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = this.env(at, 0.18 * v, 0.045);
    n.connect(hp).connect(g).connect(this.out); n.start(at, Math.random() * 0.4, 0.06);
  }
  crash(at) {
    const ctx = this.audio.context;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500;
    const g = this.env(at, 0.22, 1.2);
    n.connect(hp).connect(g).connect(this.out); n.start(at, 0, 0.6); n.stop(at + 1.3);
  }
  stick(at, accent) {
    const ctx = this.audio.context;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = accent ? 1800 : 1400;
    const g = this.env(at, 0.12, 0.03);
    o.connect(g).connect(this.out); o.start(at); o.stop(at + 0.05);
  }
  /** A power chord on MIDI `root` (root, fifth, octave), muted short or ringing */
  chord(at, root, len, muted) {
    const ctx = this.audio.context;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(muted ? 0.8 : 1, at + 0.006);
    g.gain.setTargetAtTime(0.0001, at + len * (muted ? 0.4 : 0.85), muted ? 0.025 : 0.08);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = muted ? 900 : 4000;
    g.connect(lp).connect(this.drive);
    for (const [st, det] of [[0, -6], [0, 7], [7, 0], [12, 3]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = 440 * Math.pow(2, (root + st - 69) / 12); o.detune.value = det;
      o.connect(g); o.start(at); o.stop(at + len + 0.4);
    }
  }
  cheer(strength = 1) {
    if (!this.init()) return;
    const ctx = this.audio.context, at = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700 + i * 650; bp.Q.value = 1.4;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12 * strength, at + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
      n.connect(bp).connect(g).connect(this.out); n.start(at, Math.random() * 0.5); n.stop(at + 1.7);
    }
  }
  dispose() { try { this.out?.disconnect(); } catch { /* gone */ } this.out = null; }
}

/** Short sounds for the table and the lift (clicks, a whistle, a buzzer) on the city's mix */
class Blips {
  constructor(audio) { this.audio = audio; }
  get live() { const a = this.audio; return !!(a && a.enabled && a.context && a.context.state === 'running' && a.mix); }
  tone(freq, len, { type = 'sine', vol = 0.15, slide = 0 } = {}) {
    if (!this.live) return;
    const ctx = this.audio.context, at = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, at + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(this.audio.mix); o.start(at); o.stop(at + len + 0.02);
  }
  click(v = 1) { this.tone(1800 + Math.random() * 600, 0.03, { type: 'triangle', vol: 0.12 * v }); }
  thud(v = 1) { this.tone(160, 0.08, { type: 'sine', vol: 0.25 * v, slide: 0.6 }); }
}

// =====================================================================================================================
// Headbang contest (the BOX)
// =====================================================================================================================
const BOX = { w: 14, d: 18, h: 6, stageD: 4.2, stageH: 0.85 };

function buildBox(group, fx) {
  const hw = BOX.w / 2, hd = BOX.d / 2, sz = -hd + BOX.stageD; // the stage's front edge (z)
  // the room: floor, walls, ceiling (inside faces), the stage, the PA, the amps, the drums, the bar at the back
  const room = [
    [BOX.w, 0.1, BOX.d, 0, -0.05, 0, 0x16161a],
    [BOX.w, BOX.h, 0.2, 0, BOX.h / 2, -hd - 0.1, 0x101014],
    [BOX.w, BOX.h, 0.2, 0, BOX.h / 2, hd + 0.1, 0x18181d],
    [0.2, BOX.h, BOX.d, -hw - 0.1, BOX.h / 2, 0, 0x1b1a20],
    [0.2, BOX.h, BOX.d, hw + 0.1, BOX.h / 2, 0, 0x1b1a20],
    [BOX.w, 0.2, BOX.d, 0, BOX.h + 0.1, 0, 0x0b0b0e],
    // stage
    [BOX.w - 0.4, BOX.stageH, BOX.stageD, 0, BOX.stageH / 2, -hd + BOX.stageD / 2, 0x26262c],
    [BOX.w - 0.4, 0.06, 0.08, 0, BOX.stageH + 0.03, sz, 0xc0c0c8],
    // amp stacks (black with grey grilles)
    ...[-3.2, -2.1, 2.1, 3.2].flatMap((x) => [[1.0, 1.1, 0.5, x, BOX.stageH + 0.55, -hd + 0.6, 0x0d0d0f], [0.86, 0.9, 0.04, x, BOX.stageH + 0.55, -hd + 0.86, 0x34343a], [1.0, 0.55, 0.5, x, BOX.stageH + 1.38, -hd + 0.6, 0x0d0d0f], [0.86, 0.12, 0.04, x, BOX.stageH + 1.42, -hd + 0.86, 0xb08a3a]]),
    // PA stacks either side of the stage
    ...[-1, 1].flatMap((s) => [[1.3, 2.6, 1.0, s * (hw - 1.0), 1.3, sz + 0.4, 0x0c0c0e], [1.1, 1.0, 0.04, s * (hw - 1.0), 0.75, sz + 0.92, 0x2a2a30], [1.1, 1.0, 0.04, s * (hw - 1.0), 1.95, sz + 0.92, 0x2a2a30]]),
    // drum riser and kit
    [3.0, 0.4, 2.0, 0, BOX.stageH + 0.2, -hd + 1.4, 0x2d2d33],
    [0.7, 0.6, 0.7, 0, BOX.stageH + 0.7, -hd + 1.3, 0x7a0b12],
    [0.45, 0.25, 0.45, -0.6, BOX.stageH + 0.95, -hd + 1.5, 0xc8c8d0], [0.45, 0.25, 0.45, 0.6, BOX.stageH + 0.95, -hd + 1.5, 0xc8c8d0],
    [0.04, 1.2, 0.04, -0.95, BOX.stageH + 1.0, -hd + 1.6, 0x9a9aa2], [0.7, 0.02, 0.7, -0.95, BOX.stageH + 1.6, -hd + 1.6, 0xd8b45a],
    [0.04, 1.3, 0.04, 0.95, BOX.stageH + 1.05, -hd + 1.6, 0x9a9aa2], [0.7, 0.02, 0.7, 0.95, BOX.stageH + 1.7, -hd + 1.6, 0xd8b45a],
    // mic stands
    ...[-2.2, 0, 2.2].flatMap((x) => [[0.03, 1.5, 0.03, x, BOX.stageH + 0.75, sz - 0.9, 0x9a9aa2], [0.07, 0.12, 0.07, x, BOX.stageH + 1.52, sz - 0.86, 0x222226]]),
    // light truss over the stage
    [BOX.w - 1, 0.25, 0.25, 0, BOX.h - 0.6, sz - 0.3, 0x5a5a62],
    // the bar at the back, the fence in front of the stage
    [6, 1.1, 0.7, -2.5, 0.55, hd - 0.8, 0x2e1c12], [6.2, 0.06, 0.8, -2.5, 1.12, hd - 0.8, 0x6b4a2a],
    [BOX.w - 2.4, 1.05, 0.08, 0, 0.53, sz + 0.75, 0x3c3c44],
    ...[-5, -3, -1, 1, 3, 5].map((x) => [0.06, 1.05, 0.5, x, 0.53, sz + 0.95, 0x3c3c44])
  ];
  group.add(mesh(shadedBoxes(room)));
  // the bottles behind the bar, glowing
  const bottles = [];
  for (let i = 0; i < 26; i++) bottles.push([0.08, 0.28, 0.08, -5.3 + i * 0.22, 1.7 + (i % 2) * 0.42, hd - 0.12, [0x3fd67a, 0xffb02e, 0x3fa0ff, 0xff4f6a][i % 4]]);
  group.add(mesh(shadedBoxes(bottles)));
  // the backdrop: the band's banner
  const banner = signPlane('BOX DAVOS', 8, 2, { fg: '#ff2a6d', bg: '#0a0a0c', font: '900 230px Impact, Inter, Arial, sans-serif', glow: 40 });
  banner.position.set(0, BOX.stageH + 3.1, -hd + 0.02);
  group.add(banner);
  const neon = signPlane('METAL NIGHT', 4, 0.8, { fg: '#3fd6ff', font: '900 150px Inter, Arial, sans-serif' });
  neon.position.set(-2.5, 3.2, hd - 0.02); neon.rotation.y = Math.PI;
  group.add(neon);
  // the beams: cones from the truss, additive, fading towards the floor
  const beamGeo = new THREE.CylinderGeometry(0.06, 0.9, 6, 20, 1, true).translate(0, -3, 0);
  fx.beams = [];
  const colours = [0xff2a6d, 0x7a3cff, 0x3fd6ff, 0xff2a6d, 0x7a3cff, 0x3fd6ff];
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshBasicNodeMaterial({ color: colours[i], transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const level = uniform(0.22);
    mat.opacityNode = smoothstep(float(-6), float(0), positionGeometry.y).mul(level);
    const b = mesh(beamGeo, mat);
    b.position.set(-5 + i * 2, BOX.h - 0.75, sz - 0.3);
    b.userData.level = level;
    group.add(b);
    fx.beams.push(b);
  }
  // the spots on the truss (lamp housings, their lenses glowing)
  const lens = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
  fx.lens = lens;
  for (let i = 0; i < 6; i++) {
    const l = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16), lens);
    l.position.set(-5 + i * 2, BOX.h - 0.78, sz - 0.3);
    group.add(l);
  }
  // a haze glow over the stage floor
  const haze = new THREE.MeshBasicNodeMaterial({ color: 0x7a3cff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.12 });
  const hazeMesh = mesh(new THREE.PlaneGeometry(BOX.w - 1, 3), haze);
  hazeMesh.rotation.x = -Math.PI / 2; hazeMesh.position.set(0, BOX.stageH + 0.02, -hd + 2.2);
  group.add(hazeMesh);
  fx.haze = haze;
}

const HEADBANG_FEATURE = {
  setup(run) {
    addStyle(run);
    const hud = el('div', 'fun-hud');
    hud.hidden = true;
    const card = el('div', 'fun-card');
    const score = el('div', 'fun-big', '0');
    const sub = el('div', 'fun-sub', '');
    const row = el('div', 'fun-row'); row.append(score, sub); card.append(row);
    const judge = el('div', 'fun-judge', '');
    const lane = el('div', 'fun-lane');
    lane.append(el('span', 'fun-lane-hit'));
    const notes = [];
    for (let i = 0; i < 14; i++) { const n = el('span', 'fun-lane-note'); n.hidden = true; lane.append(n); notes.push(n); }
    const bang = el('button', 'fun-btn', 'BANG');
    bang.type = 'button';
    run.listen(bang, 'pointerdown', (e) => { e.preventDefault(); bang.classList.add('is-pressed'); HEADBANG_FEATURE.tap(run, e.timeStamp); });
    run.listen(bang, 'pointerup', () => bang.classList.remove('is-pressed'));
    hud.append(judge, card, lane, bang);
    document.body.append(hud);
    run.cleanups.push(() => hud.remove());
    // a tap on the view counts too (touch screens)
    const canvas = document.getElementById('canvas-container');
    run.listen(canvas, 'pointerdown', (e) => { if (e.pointerType === 'touch' && run.hb?.interior) HEADBANG_FEATURE.tap(run, e.timeStamp); });
    run.hb = { hud, score, sub, judge, lane, notes, interior: null, band: null, fx: {}, rigs: [], player: null, t0: 0, nodAt: -1e9, cheerAt: -1e9, lastJudge: null };
  },
  reset(run) {
    const hb = run.hb;
    hb.interior?.dispose(); hb.interior = null;
    hb.band?.dispose(); hb.band = new MetalBand(run.hooks.audio);
    hb.hud.hidden = true;
    hb.rigs = []; hb.player = null; hb.lastJudge = null;
    run.state.game = null; run.state.inside = false;
  },
  teardown(run) {
    run.hb.band?.dispose();
    run.hb.interior?.dispose();
    run.hb.interior = null;
  },
  enter(run) {
    const hb = run.hb;
    const fx = hb.fx = {};
    const { crowd, tint } = makeCrowd(40);
    hb.crowd = crowd; hb.tint = tint;
    hb.interior = new Interior(run, run.def.interior.door, (g) => { buildBox(g, fx); for (const m of crowd.meshes) g.add(m); });
    // the people: the band on the stage, the crowd, the player front and centre (long hair, of course)
    const hd = BOX.d / 2, sz = -hd + BOX.stageD;
    hb.rigs = [];
    const add = (rig, x, z, yaw, y, role) => { hb.rigs.push({ rig, x, z, yaw, y, role, phase: Math.random(), energy: 0.6 + Math.random() * 0.4, jump: 0 }); return rig; };
    const ground = (y) => () => y;
    for (const [x, zOff] of [[-2.2, -0.6], [0, -0.55], [2.2, -0.6]]) add(metalhead(false), x, sz + zOff - 0.6, 0, BOX.stageH, 'band');
    add(metalhead(false), 0, -hd + 1.75, 0, BOX.stageH + 0.4, 'drums');
    const rows = [[sz + 1.9, [-4.5, -3.3, -1.1, 1.1, 2.3, 3.6, 4.7]], [sz + 3.0, [-5, -3.8, -2.6, -1.5, 1.4, 2.7, 3.9, 5]], [sz + 4.3, [-4.3, -2.9, -1.6, -0.2, 1.3, 2.6, 4.1]], [sz + 5.7, [-3.4, -1.9, 0.6, 2.0, 3.6]]];
    for (const [z, xs] of rows) for (const x of xs) {
      if (x > 0.4 && x < 2.9 && z > sz + 2.4) continue; // (the camera looks over the player's shoulder from there)
      add(metalhead(), x + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.4, Math.PI + (Math.random() - 0.5) * 0.4, 0, 'crowd');
    }
    hb.player = add(new PersonRig({ seed: 0.137, hair: 1, girth: 1.02 }), 0, sz + 1.9, Math.PI, 0, 'player');
    for (const r of hb.rigs) r.rig.reset(r.x, r.z, r.yaw, ground(r.y));
    hb.ground = ground;
    hb.hud.hidden = false;
    hb.t0 = performance.now() + 1400; // (the fade, a breath, then the drummer counts in)
    run.state.game = createHeadbang();
    run.state.inside = true;
  },
  songTime(run, stamp = performance.now()) { return (stamp - run.hb.t0) / 1000; },
  tap(run, stamp = performance.now()) {
    const hb = run.hb, g = run.state.game;
    if (!g || g.done || run.phase !== 'running' && run.phase !== 'ready') return;
    const t = HEADBANG_FEATURE.songTime(run, stamp) - hb.band.latency;
    if (t < -BEAT_S) return;
    const r = headbangTap(g, t);
    hb.nodAt = performance.now();
    HEADBANG_FEATURE.judge(run, r.grade);
    if (r.grade === 'perfect' || r.grade === 'good') {
      if (g.combo > 0 && g.combo % 16 === 0) { hb.band.cheer(Math.min(1.6, 0.6 + g.combo / 40)); hb.cheerAt = performance.now(); }
    }
  },
  judge(run, grade) {
    const j = run.hb.judge;
    j.textContent = grade === 'perfect' ? 'PERFECT' : grade === 'good' ? 'GOOD' : grade === 'miss' ? 'MISS' : 'OFF BEAT';
    j.className = `fun-judge ${grade} pop`;
    clearTimeout(run.hb.judgeTimer);
    run.hb.judgeTimer = setTimeout(() => { j.classList.remove('pop'); }, 90);
  },
  key(run, e) {
    if (!run.hb.interior) return;
    if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'KeyK' || (e.code === 'Enter' && run.phase !== 'intro')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) HEADBANG_FEATURE.tap(run, e.timeStamp);
    }
  },
  update(run, ctx, dt) {
    const hb = run.hb;
    if (!hb.interior && run.index >= 1) HEADBANG_FEATURE.enter(run);
    const g = run.state.game;
    if (!g) return;
    const t = HEADBANG_FEATURE.songTime(run);
    const before = g.miss;
    headbangAdvance(g, t - hb.band.latency);
    if (g.miss > before) HEADBANG_FEATURE.judge(run, 'miss');
    if (t > -0.3 && !g.done) hb.band.pump(t);
  },
  after(run, ctx, dt) {
    const hb = run.hb;
    if (!hb.interior || run.phase === 'aborted') return;
    const g = run.state.game;
    const t = HEADBANG_FEATURE.songTime(run);
    const now = performance.now();
    const playing = g && t >= 0 && t < HEADBANG_LENGTH - HEADBANG.tail;
    const beatPhase = ((t / BEAT_S) % 1 + 1) % 1;
    const halfTime = playing && /Intro|Breakdown/.test(hb.band.sectionAt(Math.floor(t / BEAT_S)));
    const phase2 = (((t / (BEAT_S * (halfTime ? 2 : 1))) % 1) + 1) % 1;
    const hype = g ? Math.min(1, 0.35 + g.combo / 24) : 0.3;
    const cheering = now - hb.cheerAt < 1500 || (g?.done && run.phase === 'done');
    // the figures
    hb.crowd.begin();
    for (const r of hb.rigs) {
      const air = (r.role === 'crowd' && cheering) ? Math.max(0, Math.sin((now / 1000) * 7 + r.phase * 6)) * 0.25 : 0;
      r.rig.update(dt, r.x, r.z, r.yaw, hb.ground(r.y), null, air);
      let a = 0;
      if (r.role === 'player') {
        const s = (now - hb.nodAt) / 1000;
        a = s < 0.07 ? (s / 0.07) * 0.85 : 0.85 * Math.exp(-(s - 0.07) / 0.11);
        a -= 0.08;
      } else if (playing) {
        const p = (phase2 + r.phase * 0.08) % 1;
        const amp = (r.role === 'crowd' ? 0.55 * hype * r.energy : 0.8) * (r.role === 'drums' ? 0.5 : 1);
        a = amp * Math.pow(Math.max(0, Math.cos(p * Math.PI * 2)), 3) - 0.1;
      }
      nod(r.rig, a, r.role === 'band' ? Math.sin(now / 900 + r.phase * 5) * 0.12 : 0);
      hb.crowd.add(r.rig, 0);
    }
    hb.crowd.end();
    // the lights: beams sweeping on the beat, a flash on every perfect hit
    const flash = g?.last && g.last.grade === 'perfect' && now - hb.nodAt < 120;
    hb.fx.beams.forEach((b, i) => {
      b.rotation.z = Math.sin(now / 700 + i * 1.3) * 0.5;
      b.rotation.x = 0.35 + Math.sin(now / 900 + i) * 0.25;
      b.userData.level.value = (playing ? 0.14 + 0.2 * Math.pow(1 - beatPhase, 3) : 0.08) + (flash ? 0.25 : 0);
    });
    const c = playing ? new THREE.Color().setHSL((0.83 + Math.sin(now / 2400) * 0.12 + 1) % 1, 0.8, 0.5) : new THREE.Color(0x6a5a8a);
    hb.tint.value.copy(c).multiplyScalar(0.35 + (playing ? 0.35 * Math.pow(1 - beatPhase, 2) : 0.1) + (flash ? 0.3 : 0)).addScalar(0.22);
    // the camera: behind the player's right shoulder, the stage ahead
    const p = hb.player;
    const x = hb.rigs.find((r) => r.rig === p);
    const sway = Math.sin(now / 1700) * 0.15;
    hb.interior.camera(ctx.camera, { x: x.x + 1.25 + sway, y: 2.05, z: x.z + 2.1 }, { x: x.x - 0.45, y: 1.45, z: x.z - 4.5 });
    // the HUD: the lane (2.2 s ahead), the score
    if (g) {
      const span = 2.2, base = t - (hb.band.latency || 0);
      let k = 0;
      for (let i = Math.max(0, g.next - 3); i < g.chart.length && k < hb.notes.length; i++) {
        const dtn = g.chart[i].t - base;
        if (dtn > span) break;
        if (dtn < -0.35) continue;
        const n = hb.notes[k++];
        n.hidden = false;
        n.style.left = `${18 + (dtn / span) * 80}%`;
        const st = g.judged[i];
        n.className = `fun-lane-note${g.chart[i].beat % 1 ? ' is-off' : ''}${st === 1 || st === 2 ? ' is-hit' : st === 3 ? ' is-miss' : ''}`;
      }
      for (; k < hb.notes.length; k++) hb.notes[k].hidden = true;
      const sc = g.score.toLocaleString('en-US');
      if (hb.score.textContent !== sc) hb.score.textContent = sc;
      const left = Math.max(0, HEADBANG_LENGTH - Math.max(0, t));
      const line = t < 0 ? 'Get ready … the drummer counts in' : `×${headbangMultiplier(g.combo)} · streak ${g.combo} · ${Math.ceil(left)} s`;
      if (hb.sub.textContent !== line) hb.sub.textContent = line;
    }
    if (run.phase === 'done' || run.phase === 'failed') hb.hud.hidden = true;
  }
};

// =====================================================================================================================
// Table football (the Bar La Onda)
// =====================================================================================================================
const TABLE_TOP = 0.9; // m: the playing field's height in the bar
const ROD_H = 0.075; // the rods over the field

function fieldTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 580;
  const x = c.getContext('2d');
  for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#1f7a3a' : '#238443'; x.fillRect((i * c.width) / 12, 0, c.width / 12 + 1, c.height); }
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 5;
  x.strokeRect(8, 8, c.width - 16, c.height - 16);
  x.beginPath(); x.moveTo(c.width / 2, 8); x.lineTo(c.width / 2, c.height - 8); x.stroke();
  x.beginPath(); x.arc(c.width / 2, c.height / 2, 70, 0, Math.PI * 2); x.stroke();
  for (const s of [0, 1]) {
    const gx = s ? c.width - 8 : 8, dir = s ? -1 : 1;
    x.strokeRect(Math.min(gx, gx + dir * 120), c.height / 2 - 150, 120, 300);
    x.strokeRect(Math.min(gx, gx + dir * 50), c.height / 2 - 90, 50, 180);
  }
  x.fillStyle = '#fff'; x.beginPath(); x.arc(c.width / 2, c.height / 2, 8, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildBar(group, fb) {
  const W = 11, D = 9, H = 3.1, hw = W / 2, hd = D / 2;
  const L = FOOSBALL.length, Wt = FOOSBALL.width;
  const room = [
    [W, 0.1, D, 0, -0.05, 0, 0x4a2e1c],
    [W, H, 0.2, 0, H / 2, -hd - 0.1, 0x7a3326], [W, H, 0.2, 0, H / 2, hd + 0.1, 0x7a3326],
    [0.2, H, D, -hw - 0.1, H / 2, 0, 0x6e2e22], [0.2, H, D, hw + 0.1, H / 2, 0, 0x6e2e22],
    [W, 0.2, D, 0, H + 0.1, 0, 0x2a1a12],
    // the counter along the back wall, the shelves behind it
    [6.5, 1.1, 0.7, -1.2, 0.55, -hd + 1.6, 0x3b2214], [6.7, 0.06, 0.85, -1.2, 1.13, -hd + 1.6, 0x9a6a3a],
    [6.5, 0.05, 0.3, -1.2, 1.5, -hd + 0.2, 0x5a3a22], [6.5, 0.05, 0.3, -1.2, 1.95, -hd + 0.2, 0x5a3a22],
    // bar stools
    ...[-3.6, -2.4, -1.2, 0, 1.2].flatMap((x) => [[0.05, 0.75, 0.05, x, 0.37, -hd + 2.35, 0x8a8a90], [0.38, 0.06, 0.38, x, 0.78, -hd + 2.35, 0x8a1e2a]]),
    // tables with chairs
    ...[[-3.6, 1.6], [3.6, 2.2], [3.8, -1.6]].flatMap(([x, z]) => [[0.8, 0.05, 0.8, x, 0.74, z, 0x6b4a2a], [0.08, 0.72, 0.08, x, 0.36, z, 0x2a2a2e],
      [0.42, 0.05, 0.42, x + 0.75, 0.45, z, 0x5a3a22], [0.42, 0.5, 0.05, x + 0.95, 0.72, z, 0x5a3a22], [0.42, 0.05, 0.42, x - 0.75, 0.45, z, 0x5a3a22], [0.42, 0.5, 0.05, x - 0.95, 0.72, z, 0x5a3a22]]),
    // the table football: the box, the legs, the cushions, the goal mouths, the handles' bearings
    [L + 0.16, 0.22, Wt + 0.12, 0, TABLE_TOP - 0.12, 0, 0x2c3e66],
    ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => [0.08, TABLE_TOP - 0.2, 0.08, sx * (L / 2 - 0.02), (TABLE_TOP - 0.2) / 2, sz * (Wt / 2 - 0.02), 0x1d2a48]),
    [L + 0.16, 0.14, 0.06, 0, TABLE_TOP + 0.06, -Wt / 2 - 0.03, 0x34497a], [L + 0.16, 0.14, 0.06, 0, TABLE_TOP + 0.06, Wt / 2 + 0.03, 0x34497a],
    ...[-1, 1].flatMap((s) => [[0.08, 0.14, (Wt - FOOSBALL.goal) / 2, s * (L / 2 + 0.04), TABLE_TOP + 0.06, -(Wt + FOOSBALL.goal) / 4, 0x34497a], [0.08, 0.14, (Wt - FOOSBALL.goal) / 2, s * (L / 2 + 0.04), TABLE_TOP + 0.06, (Wt + FOOSBALL.goal) / 4, 0x34497a],
      [0.1, 0.06, FOOSBALL.goal, s * (L / 2 + 0.05), TABLE_TOP - 0.02, 0, 0x0a0a0c]])
  ];
  group.add(mesh(shadedBoxes(room)));
  // bottles on the shelves, glowing a little
  const bottles = [];
  for (let i = 0; i < 40; i++) bottles.push([0.07, 0.26, 0.07, -4.2 + (i % 20) * 0.31, 1.66 + Math.floor(i / 20) * 0.45, -hd + 0.2, [0x3fd67a, 0xffb02e, 0x9fd8ff, 0xd84f2a, 0xf2e6c9][i % 5]]);
  group.add(mesh(shadedBoxes(bottles)));
  const sign = signPlane('La Onda', 3.2, 0.9, { fg: '#ff9b3d', font: 'italic 900 230px Georgia, Inter, serif', glow: 45 });
  sign.position.set(-1.2, 2.55, -hd + 0.02);
  group.add(sign);
  // the lamp over the table (its shade, its glowing bulb)
  group.add(mesh(shadedBoxes([[0.02, 1.0, 0.02, 0, H - 0.5, 0, 0x222222], [0.9, 0.12, 0.4, 0, H - 1.05, 0, 0x1f4a2a]])));
  const bulb = mesh(new THREE.BoxGeometry(0.8, 0.02, 0.3), new THREE.MeshBasicNodeMaterial({ color: 0xfff1c8 }));
  bulb.position.set(0, H - 1.12, 0);
  group.add(bulb);
  for (const [x, z] of [[-3.6, 1.6], [3.6, 2.2], [3.8, -1.6], [-2.5, -hd + 1.6], [0.5, -hd + 1.6]]) {
    const b = mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicNodeMaterial({ color: 0xffd28a }));
    b.position.set(x, H - 0.75, z);
    group.add(b);
  }
  // the field
  const field = mesh(new THREE.PlaneGeometry(L, Wt), new THREE.MeshBasicNodeMaterial({ map: fieldTexture() }));
  field.rotation.x = -Math.PI / 2;
  field.position.y = TABLE_TOP;
  group.add(field);
  // the rods (steel, a handle on the owner's side) and the men (red: the player; blue: La Onda)
  fb.rods = FOOSBALL_RODS.map((r) => {
    const own = r.team === 'p' ? 1 : -1; // the handle side: the player stands at +z
    const g = shade(new THREE.CylinderGeometry(0.008, 0.008, Wt + 0.5, 8).rotateX(Math.PI / 2).toNonIndexed(), 0xc8ccd2);
    const handle = shade(new THREE.CylinderGeometry(0.017, 0.017, 0.12, 10).rotateX(Math.PI / 2).translate(0, 0, own * (Wt / 2 + 0.28)).toNonIndexed(), 0x111114);
    const rod = mesh(mergeGeometries([g, handle]));
    rod.position.set(r.x, TABLE_TOP + ROD_H, 0);
    group.add(rod);
    return rod;
  });
  const man = mergeGeometries([
    shade(new THREE.BoxGeometry(0.026, 0.035, 0.018).translate(0, 0.012, 0).toNonIndexed(), 0xffffff), // the head
    shade(new THREE.BoxGeometry(0.03, 0.05, 0.022).translate(0, -0.03, 0).toNonIndexed(), 0xffffff), // the shirt
    shade(new THREE.BoxGeometry(0.024, 0.03, 0.026).translate(0, -0.062, 0).toNonIndexed(), 0xdddddd) // the foot
  ]);
  const total = (team) => FOOSBALL_RODS.filter((r) => r.team === team).reduce((a, r) => a + r.men, 0);
  fb.men = {
    p: new THREE.InstancedMesh(man, new THREE.MeshBasicNodeMaterial({ vertexColors: true, color: 0xe0242e }), total('p')),
    a: new THREE.InstancedMesh(man, new THREE.MeshBasicNodeMaterial({ vertexColors: true, color: 0x2a6bff }), total('a'))
  };
  for (const m of Object.values(fb.men)) { m.frustumCulled = false; group.add(m); }
  // the selected rod's marker, the ball
  fb.marker = mesh(new THREE.BoxGeometry(0.03, 0.004, Wt), new THREE.MeshBasicNodeMaterial({ color: 0xffe14f, transparent: true, opacity: 0.45, depthWrite: false }));
  fb.marker.position.y = TABLE_TOP + 0.002;
  group.add(fb.marker);
  fb.ball = mesh(shade(new THREE.SphereGeometry(FOOSBALL.ball, 16, 12).toNonIndexed(), 0xf6f2e8));
  group.add(fb.ball);
}

const FOOSBALL_FEATURE = {
  setup(run) {
    addStyle(run);
    const hud = el('div', 'fun-hud');
    hud.hidden = true;
    const card = el('div', 'fun-card');
    const score = el('div', 'fun-big', '0 : 0');
    const sub = el('div', 'fun-sub', '');
    const row = el('div', 'fun-row'); row.append(score, sub); card.append(row);
    const buttons = el('div', 'fun-row');
    const shoot = el('button', 'fun-btn', 'SHOOT');
    shoot.type = 'button';
    shoot.style.background = 'linear-gradient(180deg,#ff8a2b,#d4421a)';
    run.listen(shoot, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); run.fb.kick = true; shoot.classList.add('is-pressed'); });
    run.listen(shoot, 'pointerup', () => shoot.classList.remove('is-pressed'));
    const auto = el('button', 'fun-toggle is-on', 'Auto rod');
    auto.type = 'button';
    run.listen(auto, 'click', () => { const fb = run.fb; fb.rod = fb.rod === null ? fb.game?.active ?? null : null; });
    buttons.append(auto, shoot);
    hud.append(card, buttons);
    document.body.append(hud);
    const goal = el('div', 'fun-goal', 'GOAL!');
    document.body.append(goal);
    run.cleanups.push(() => { hud.remove(); goal.remove(); });
    // the pointer: its height over the table slides the rod (a drag on touch screens), a click / short tap shoots
    const canvas = document.getElementById('canvas-container');
    let down = null;
    run.listen(canvas, 'pointermove', (e) => { const fb = run.fb; if (!fb.interior) return; if (e.pointerType !== 'touch' || down) { fb.pointerY = e.clientY; fb.pointerAt = performance.now(); } });
    run.listen(canvas, 'pointerdown', (e) => { if (!run.fb.interior) return; down = { x: e.clientX, y: e.clientY, t: performance.now() }; run.fb.pointerY = e.clientY; run.fb.pointerAt = performance.now(); });
    run.listen(canvas, 'pointerup', (e) => {
      if (!down || !run.fb.interior) { down = null; return; }
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 280) run.fb.kick = true;
      down = null;
    });
    run.fb = { hud, score, sub, auto, goal, interior: null, game: null, rod: null, keys: { up: false, down: false }, kick: false, pointerY: null, pointerAt: 0, acc: 0, blips: new Blips(run.hooks.audio), kickAnim: new Float32Array(8), parts: {} };
  },
  reset(run) {
    const fb = run.fb;
    fb.interior?.dispose(); fb.interior = null;
    fb.hud.hidden = true;
    fb.game = null; fb.rod = null; fb.kick = false; fb.pointerY = null;
    run.state.game = null; run.state.inside = false;
  },
  teardown(run) { run.fb.interior?.dispose(); run.fb.interior = null; },
  enter(run) {
    const fb = run.fb;
    const parts = fb.parts = {};
    const { crowd, tint } = makeCrowd(12);
    fb.crowd = crowd;
    tint.value.setRGB(0.55, 0.45, 0.38);
    fb.interior = new Interior(run, run.def.interior.door, (g) => { buildBar(g, parts); for (const m of crowd.meshes) g.add(m); });
    // the two players at the long sides of the table, a few regulars at the counter and a table
    const ground = () => 0;
    fb.people = [
      { rig: guest(), x: 0, z: FOOSBALL.width / 2 + 0.45, yaw: Math.PI },
      { rig: guest(), x: 0, z: -FOOSBALL.width / 2 - 0.45, yaw: 0 },
      { rig: guest(), x: -3.2, z: -2.2, yaw: Math.PI }, { rig: guest(), x: -1.9, z: -2.15, yaw: Math.PI + 0.3 },
      { rig: guest(), x: 3.0, z: 2.9, yaw: 0.6 }, { rig: guest(), x: 2.4, z: -1.1, yaw: -0.5 }, { rig: guest(), x: -1.2, z: 1.5, yaw: 2.4 }
    ];
    for (const p of fb.people) p.rig.reset(p.x, p.z, p.yaw, ground);
    fb.ground = ground;
    fb.game = createFoosball((Math.random() * 1e9) | 0);
    fb.game.serveIn = 1.6;
    run.state.game = fb.game;
    run.state.inside = true;
    fb.hud.hidden = false;
  },
  key(run, e) {
    const fb = run.fb;
    if (!fb.interior) return;
    const k = e.code;
    const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (k === 'KeyW' || k === 'ArrowUp') { take(); fb.keys.up = true; fb.pointerY = null; return; }
    if (k === 'KeyS' || k === 'ArrowDown') { take(); fb.keys.down = true; fb.pointerY = null; return; }
    if (k === 'Space' || (k === 'Enter' && run.phase !== 'intro')) { take(); if (!e.repeat) fb.kick = true; return; }
    if (/^Digit[1-4]$/.test(k)) { take(); fb.rod = PLAYER_RODS[Number(k.slice(5)) - 1]; return; }
    if (k === 'KeyQ' || k === 'Tab') { take(); fb.rod = null; return; }
    if (k === 'KeyA' || k === 'KeyD' || k === 'ArrowLeft' || k === 'ArrowRight') take(); // (the walker stays put)
  },
  update(run, ctx, dt) {
    const fb = run.fb;
    if (!fb.interior && run.index >= 1) {
      FOOSBALL_FEATURE.enter(run);
      // (keys held from before: released on keyup, which the capture listener does not see)
      const up = (e) => { if (e.code === 'KeyW' || e.code === 'ArrowUp') fb.keys.up = false; if (e.code === 'KeyS' || e.code === 'ArrowDown') fb.keys.down = false; };
      if (!fb.keyup) { fb.keyup = up; run.listen(window, 'keyup', up, { capture: true }); }
    }
    const g = fb.game;
    if (!g || g.done) return;
    // the pointer's height over the table, as the active rod's offset
    let target;
    if (fb.pointerY != null && performance.now() - fb.pointerAt < 4000 && fb.screen) {
      const { top, bottom } = fb.screen;
      const u = (fb.pointerY - top) / (bottom - top || 1); // 0 at y = +W/2 (the far cushion), 1 at -W/2
      const y = FOOSBALL.width / 2 - u * FOOSBALL.width;
      const rod = g.rods[fb.rod ?? g.active];
      // the man nearest the pointer goes there
      let best = 0, bd = Infinity;
      for (let k = 0; k < rod.men; k++) { const want = y - manY(rod, 0, k); const d = Math.abs(Math.max(-rod.range, Math.min(rod.range, want)) - want); if (d < bd - 1e-4 || (Math.abs(d - bd) < 1e-4 && Math.abs(want - rod.off) < Math.abs(best - rod.off))) { bd = d; best = want; } }
      target = best;
    }
    const move = (fb.keys.up ? 1 : 0) - (fb.keys.down ? 1 : 0);
    fb.acc += Math.min(dt, 0.05) * FOOSBALL.timeScale;
    const h = 1 / 120;
    while (fb.acc >= h) {
      fb.acc -= h;
      const events = foosballStep(g, h, { rod: fb.rod, move, target, kick: fb.kick });
      fb.kick = false;
      for (const ev of events) {
        if (ev.type === 'hit') { if (ev.kick) fb.blips.thud(1); else fb.blips.click(0.7); if (ev.kick) fb.kickAnim[ev.rod] = 1; }
        else if (ev.type === 'cushion') fb.blips.click(0.4);
        else if (ev.type === 'kick') fb.kickAnim[ev.rod] = 1;
        else if (ev.type === 'goal') {
          fb.blips.tone(ev.team === 'p' ? 880 : 220, 0.5, { type: 'square', vol: 0.08, slide: ev.team === 'p' ? 1.5 : 0.7 });
          fb.goal.textContent = ev.team === 'p' ? 'GOAL!' : 'La Onda scores';
          fb.goal.style.color = ev.team === 'p' ? '#ffe14f' : '#7fb0ff';
          fb.goal.classList.add('is-on');
          clearTimeout(fb.goalTimer);
          fb.goalTimer = setTimeout(() => fb.goal.classList.remove('is-on'), 1100);
        }
      }
    }
    for (const r of g.rods) if (r.kick > 0) fb.kickAnim[g.rods.indexOf(r)] = Math.max(fb.kickAnim[g.rods.indexOf(r)], 1);
  },
  after(run, ctx, dt) {
    const fb = run.fb;
    if (!fb.interior || run.phase === 'aborted') return;
    const g = fb.game, p = fb.parts;
    // the rods, the men (a kick swings them round the rod), the ball
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), axis = new THREE.Vector3(0, 0, 1);
    const n = { p: 0, a: 0 };
    g.rods.forEach((rod, i) => {
      p.rods[i].position.z = -rod.off;
      fb.kickAnim[i] = Math.max(0, fb.kickAnim[i] - dt / 0.22);
      const k = fb.kickAnim[i];
      const swing = (rod.team === 'p' ? 1 : -1) * Math.sin(k * Math.PI) * 1.25;
      q.setFromAxisAngle(axis, -swing);
      for (let j = 0; j < rod.men; j++) {
        pos.set(rod.x, TABLE_TOP + ROD_H, -manY(rod, rod.off, j));
        p.men[rod.team].setMatrixAt(n[rod.team]++, m4.compose(pos, q, one));
      }
    });
    for (const m of Object.values(p.men)) m.instanceMatrix.needsUpdate = true;
    const b = g.ball;
    p.ball.visible = b.live;
    p.ball.position.set(b.x, TABLE_TOP + FOOSBALL.ball, -b.y);
    p.ball.rotation.z -= (b.vx * dt) / FOOSBALL.ball; p.ball.rotation.x += (-b.vy * dt) / FOOSBALL.ball;
    const active = fb.rod ?? g.active;
    p.marker.position.x = g.rods[active].x;
    fb.auto.classList.toggle('is-on', fb.rod === null);
    // the people
    fb.crowd.begin();
    for (const person of fb.people) { person.rig.update(dt, person.x, person.z, person.yaw, fb.ground); nod(person.rig, 0.25); fb.crowd.add(person.rig, 0); }
    fb.crowd.end();
    // the camera: over the table, high enough that the whole field fits the screen's width (portrait phones)
    const cam = ctx.camera;
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    const fit = Math.max((FOOSBALL.length + 0.3) / 2 / (tanV * cam.aspect), (FOOSBALL.width + 0.25) / 2 / tanV / 0.78);
    const d = Math.max(1.0, fit);
    fb.interior.camera(cam, { x: 0, y: TABLE_TOP + d * 0.93, z: d * 0.36 }, { x: 0, y: TABLE_TOP, z: 0.02 });
    // where the table's long sides are on screen (the pointer's scale)
    const o = fb.interior.origin;
    const top = new THREE.Vector3(o.x + g.rods[active].x, o.y + TABLE_TOP, o.z - FOOSBALL.width / 2).project(cam);
    const bottom = new THREE.Vector3(o.x + g.rods[active].x, o.y + TABLE_TOP, o.z + FOOSBALL.width / 2).project(cam);
    fb.screen = { top: (1 - top.y) / 2 * window.innerHeight, bottom: (1 - bottom.y) / 2 * window.innerHeight };
    // the HUD
    const s = `${g.score.p} : ${g.score.a}`;
    if (fb.score.textContent !== s) fb.score.textContent = s;
    const line = `You (red) vs La Onda (blue) · ${FOOSBALL_RODS[active].role}${fb.rod === null ? ' (auto)' : ''}`;
    if (fb.sub.textContent !== line) fb.sub.textContent = line;
    if (run.phase === 'done' || run.phase === 'failed') fb.hud.hidden = true;
  }
};

// =====================================================================================================================
// The Jakobshornbahn's cabin, packed like Tetris
// =====================================================================================================================
const CELL = 0.5; // m a grid cell on the cabin floor
const cellX = (c) => (c - GONDOLA.cols / 2 + 0.5) * CELL;
const cellZ = (r) => (GONDOLA.rows / 2 - r - 0.5) * CELL; // row 0 at the front wall (+z, by the camera), the door at -z

function cabinFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 64 * GONDOLA.cols; c.height = 64 * GONDOLA.rows;
  const x = c.getContext('2d');
  x.fillStyle = '#3b4048'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 2;
  for (let i = 0; i <= GONDOLA.cols; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, c.height); x.stroke(); }
  for (let j = 0; j <= GONDOLA.rows; j++) { x.beginPath(); x.moveTo(0, j * 64); x.lineTo(c.width, j * 64); x.stroke(); }
  x.fillStyle = 'rgba(255,210,63,.55)'; x.fillRect(0, 0, c.width, 6); // the door's sill (the top: the door side)
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildStation(group, gp) {
  const W = GONDOLA.cols * CELL, D = GONDOLA.rows * CELL;
  // the station: its concrete platform, the red portal behind the door, the waiting area
  group.add(mesh(shadedBoxes([
    [34, 0.2, 30, 0, -0.45, -2, 0x5d636b],
    [34, 9, 0.3, 0, 4, -7.5, 0x6d7278], [0.3, 9, 30, -17, 4, -2, 0x6d7278], [0.3, 9, 30, 17, 4, -2, 0x6d7278], [34, 9, 0.3, 0, 4, 13, 0x6d7278],
    [1.4, 6, 1.0, -6.5, 2.6, -6.6, 0xc8102e], [1.4, 6, 1.0, 6.5, 2.6, -6.6, 0xc8102e], [14.4, 1.2, 1.0, 0, 5.4, -6.6, 0xc8102e],
    [0.15, 1.0, 5, -W / 2 - 1.4, 0.15, -4.4, 0xc8ccd2], [0.15, 1.0, 5, W / 2 + 1.4, 0.15, -4.4, 0xc8ccd2], // the queue's rails
    [2.2, 0.1, 0.6, 0, -0.3, -D / 2 - 0.45, 0xffd23f] // the gap to the door
  ])));
  const sign = signPlane('JAKOBSHORNBAHN', 7, 0.9, { fg: '#ffffff', bg: '#c8102e', font: '900 120px Inter, Arial, sans-serif', glow: 0 });
  sign.position.set(0, 5.4, -6.08);
  group.add(sign);
  // the cabin: its floor (the grid), the walls (red below, dark glass above), the door gap at the back
  const cabin = new THREE.Group();
  cabin.name = 'GondolaCabin';
  const floor = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicNodeMaterial({ map: cabinFloorTexture() }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  const t = 0.08, h = 0.55, doorW = 1.6;
  cabin.add(floor, mesh(shadedBoxes([
    [W + 0.3, 0.3, D + 0.3, 0, -0.16, 0, 0x2a2d32],
    [W + 2 * t, h, t, 0, h / 2, D / 2 + t / 2, 0xc8102e], // the front wall
    [t, h, D, -W / 2 - t / 2, h / 2, 0, 0xc8102e], [t, h, D, W / 2 + t / 2, h / 2, 0, 0xc8102e],
    [(W - doorW) / 2 + t, h, t, -(W + doorW) / 4 - t / 2, h / 2, -D / 2 - t / 2, 0xc8102e], [(W - doorW) / 2 + t, h, t, (W + doorW) / 4 + t / 2, h / 2, -D / 2 - t / 2, 0xc8102e],
    // the glazing's frame: corner posts and the roof ring (seen from above: a thin outline)
    ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => [0.07, 2.1, 0.07, sx * (W / 2 + t / 2), 1.05, sz * (D / 2 + t / 2), 0x1c1f24])
  ])));
  const glass = new THREE.MeshBasicNodeMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  for (const [w, x, z, ry] of [[D, -W / 2 - t / 2, 0, Math.PI / 2], [D, W / 2 + t / 2, 0, Math.PI / 2]]) { // (no front pane: the camera looks in over it)
    const g = mesh(new THREE.PlaneGeometry(w, 1.5), glass);
    g.position.set(x, h + 0.75, z); g.rotation.y = ry;
    cabin.add(g);
  }
  // the tiles under the passengers (one per cell, coloured by their piece) and their gear (boxes)
  const total = GONDOLA.cols * GONDOLA.rows + 8;
  gp.tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.92, 0.03, CELL * 0.92), new THREE.MeshBasicNodeMaterial({ color: 0xffffff }), total);
  gp.gear = new THREE.InstancedMesh(shade(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), 0xffffff), new THREE.MeshBasicNodeMaterial({ vertexColors: true }), 64);
  const white = new THREE.Color(1, 1, 1);
  for (const m of [gp.tiles, gp.gear]) { m.frustumCulled = false; m.count = 0; for (let i = 0; i < m.instanceMatrix.count; i++) m.setColorAt(i, white); cabin.add(m); }
  group.add(cabin);
  gp.cabin = cabin;
}

// A piece's gear, as boxes in cell units: [cx, cz (cells, the piece's centre of those cells), sx, sy, sz (m), colour]
function gearBoxes(kind, cells) {
  const out = [];
  const def = GONDOLA_PIECES[kind];
  for (const prop of def.props) {
    const cs = prop.cells.map((i) => cells[i]);
    const x = cs.reduce((a, p) => a + cellX(p[0]), 0) / cs.length, z = cs.reduce((a, p) => a + cellZ(p[1]), 0) / cs.length;
    const spanX = (Math.max(...cs.map((p) => p[0])) - Math.min(...cs.map((p) => p[0]))) * CELL, spanZ = (Math.max(...cs.map((p) => p[1])) - Math.min(...cs.map((p) => p[1]))) * CELL;
    if (prop.type === 'skis') { const along = spanX > spanZ; for (const o of [-0.06, 0.06]) out.push([x + (along ? 0 : o), 0.05, z + (along ? o : 0), along ? spanX + 0.4 : 0.07, 0.03, along ? 0.07 : spanZ + 0.4, 0xffd23f]); }
    else if (prop.type === 'board') out.push([x, 0.05, z, Math.max(0.28, spanX + 0.3), 0.04, Math.max(0.28, spanZ + 0.3), 0x22c55e]);
    else if (prop.type === 'pram') { out.push([x, 0.35, z, 0.36, 0.3, 0.42, 0x2a5bd7], [x, 0.12, z, 0.3, 0.2, 0.36, 0x1c1f24]); }
    else if (prop.type === 'case') out.push([x, 0.3, z, 0.34, 0.55, 0.2, 0xd84f2a]);
    else if (prop.type === 'bag') out.push([x, 0.2, z, 0.32, 0.35, 0.25, 0x333a45]);
    else if (prop.type === 'dog') out.push([x, 0.28, z, 0.18, 0.2, 0.42, 0xa8733d], [x, 0.42, z + 0.22, 0.14, 0.14, 0.16, 0x8a5a2a]);
  }
  return out;
}

const GONDOLA_FEATURE = {
  setup(run) {
    addStyle(run);
    const hud = el('div', 'fun-hud');
    hud.hidden = true;
    const card = el('div', 'fun-card');
    const big = el('div', 'fun-big', '0');
    const sub = el('div', 'fun-sub', '');
    const next = el('div', 'fun-next');
    const row = el('div', 'fun-row'); row.append(big, sub, next); card.append(row);
    const flash = el('div', 'fun-flash', '');
    const pad = el('div', 'fun-row');
    const btn = (label, fn, cls = 'fun-toggle') => { const b = el('button', cls, label); b.type = 'button'; run.listen(b, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }); return b; };
    pad.append(
      btn('◀', () => GONDOLA_FEATURE.act(run, 'left'), 'fun-toggle fun-pad'), btn('⟳', () => GONDOLA_FEATURE.act(run, 'rotate'), 'fun-toggle fun-pad'),
      btn('▼', () => GONDOLA_FEATURE.act(run, 'drop'), 'fun-toggle fun-pad'), btn('▶', () => GONDOLA_FEATURE.act(run, 'right'), 'fun-toggle fun-pad'),
      btn('Send cabin', () => GONDOLA_FEATURE.act(run, 'depart'), 'fun-btn fun-send'));
    hud.append(flash, card, pad);
    document.body.append(hud);
    run.cleanups.push(() => hud.remove());
    // swipes on the view: sideways moves (a cell every 36 px), down drops, a tap turns
    const canvas = document.getElementById('canvas-container');
    let sw = null;
    run.listen(canvas, 'pointerdown', (e) => { if (run.gp.interior) sw = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, used: false }; });
    run.listen(canvas, 'pointermove', (e) => {
      if (!sw || !run.gp.interior) return;
      const cells = Math.trunc((e.clientX - sw.x) / 36);
      while (sw.moved < cells) { GONDOLA_FEATURE.act(run, 'right'); sw.moved++; sw.used = true; }
      while (sw.moved > cells) { GONDOLA_FEATURE.act(run, 'left'); sw.moved--; sw.used = true; }
    });
    run.listen(canvas, 'pointerup', (e) => {
      if (!sw || !run.gp.interior) { sw = null; return; }
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      if (!sw.used && dy > 50 && Math.abs(dy) > Math.abs(dx)) GONDOLA_FEATURE.act(run, 'drop');
      else if (!sw.used && Math.hypot(dx, dy) < 10 && performance.now() - sw.t < 300) GONDOLA_FEATURE.act(run, 'rotate');
      sw = null;
    });
    run.gp = { hud, big, sub, next, flash, interior: null, parts: {}, rigs: new Map(), blips: new Blips(run.hooks.audio), startIn: 0, sig: '' };
  },
  reset(run) {
    const gp = run.gp;
    gp.interior?.dispose(); gp.interior = null;
    gp.rigs = new Map();
    gp.hud.hidden = true;
    run.state.game = null;
  },
  teardown(run) { run.gp.interior?.dispose(); run.gp.interior = null; },
  enter(run) {
    const gp = run.gp;
    const parts = gp.parts = {};
    const { crowd, tint } = makeCrowd(72);
    tint.value.setRGB(0.5, 0.5, 0.52);
    gp.crowd = crowd;
    gp.interior = new Interior(run, run.def.interior.door, (g) => {
      buildStation(g, parts);
      for (const m of crowd.meshes) parts.cabin.add(m); // (the passengers ride with the cabin)
      // the queue behind the door (they wait on the platform)
      const queue = new PersonCrowd(10, { farDistance: 1e9, castShadow: false });
      for (const m of queue.meshes) { m.material.emissiveNode = m.material.colorNode.mul(0.5); g.add(m); }
      gp.queue = { crowd: queue, rigs: Array.from({ length: 8 }, (_, i) => ({ rig: guest(), x: -1.6 + (i % 4) * 1.05 + (Math.random() - 0.5) * 0.3, z: -3.4 - Math.floor(i / 4) * 0.9 - Math.random() * 0.3 })) };
      for (const q of gp.queue.rigs) q.rig.reset(q.x, q.z, 0, () => -0.35);
    });
    gp.game = createGondola((Math.random() * 1e9) | 0);
    gp.startIn = 1.2;
    run.state.game = gp.game;
    gp.hud.hidden = false;
  },
  act(run, what) {
    const g = run.state.game, gp = run.gp;
    if (!g || g.done || gp.startIn > 0 || !(run.phase === 'running' || run.phase === 'ready')) return;
    if (what === 'left' || what === 'right') { if (gondolaMove(g, what === 'left' ? -1 : 1)) gp.blips.click(0.5); }
    else if (what === 'rotate') { if (gondolaRotate(g)) gp.blips.click(0.8); }
    else if (what === 'drop') { gondolaDrop(g); GONDOLA_FEATURE.events(run, g.events); g.events = []; }
    else if (what === 'depart') { if (g.placed.length || g.piece) { gondolaDepart(g, 'sent'); GONDOLA_FEATURE.events(run, g.events); g.events = []; } }
  },
  events(run, events) {
    const gp = run.gp;
    for (const ev of events) {
      if (ev.type === 'lock') gp.blips.thud(0.7);
      if (ev.type === 'depart') {
        gp.blips.tone(660, 0.25, { type: 'triangle', vol: 0.1, slide: 1.5 });
        gp.flash.textContent = `Cabin ${ev.cabin}: ${ev.persons} passengers · ${Math.round(ev.fill * 100)} % full${ev.rows ? ` · ${ev.rows} full row${ev.rows > 1 ? 's' : ''}` : ''}${ev.holes ? ` · ${ev.holes} holes` : ''} → ${ev.points >= 0 ? '+' : ''}${ev.points}`;
        gp.flash.style.color = ev.points >= 200 ? '#7dffb0' : ev.points > 0 ? '#ffe14f' : '#ff6b6b';
        clearTimeout(gp.flashTimer);
        gp.flashTimer = setTimeout(() => { gp.flash.textContent = ''; }, 3500);
      }
    }
  },
  key(run, e) {
    if (!run.gp.interior) return;
    const k = e.code;
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'rotate', KeyW: 'rotate', ArrowDown: 'drop', KeyS: 'drop', Space: 'drop', KeyE: 'depart', Enter: 'depart' };
    if (!map[k] || (k === 'Enter' && run.phase === 'intro')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat || map[k] === 'left' || map[k] === 'right') GONDOLA_FEATURE.act(run, map[k]);
  },
  update(run, ctx, dt) {
    const gp = run.gp;
    if (!gp.interior && run.index >= 1) GONDOLA_FEATURE.enter(run);
    const g = run.state.game;
    if (!g) return;
    if (gp.startIn > 0) { gp.startIn -= dt; return; }
    gondolaStep(g, Math.min(dt, 0.1));
    GONDOLA_FEATURE.events(run, g.events);
  },
  after(run, ctx, dt) {
    const gp = run.gp, g = run.state.game;
    if (!gp.interior || !g || run.phase === 'aborted') return;
    const p = gp.parts;
    // the cabin leaving (up and away to the right) and the next one coming in from the left
    const u = g.departing ? 1 - g.departing / GONDOLA.depart : 0;
    const out = u > 0 && u < 0.5 ? (u / 0.5) ** 2 : 0, back = u >= 0.5 ? (1 - (u - 0.5) / 0.5) ** 2 : 0;
    p.cabin.position.set(out * 14 - back * 14, out * 4, 0);
    const showLoad = !(u >= 0.5);
    // the tiles and the gear
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
    let nt = 0, ng = 0;
    const pieces = showLoad ? [...g.placed.map((pl) => ({ ...pl, active: false })), ...(g.piece ? [{ ...g.piece, cells: pieceCells(g.piece), active: true }] : [])] : [];
    for (const pc of pieces) {
      col.set(GONDOLA_PIECES[pc.kind].colour);
      if (pc.active) col.lerp(new THREE.Color(1, 1, 1), 0.35 + 0.15 * Math.sin(performance.now() / 120));
      for (const [c, r] of pc.cells) {
        p.tiles.setMatrixAt(nt, m4.compose(pos.set(cellX(c), pc.active ? 0.03 : 0.016, cellZ(r)), q.identity(), scl.set(1, 1, 1)));
        p.tiles.setColorAt(nt++, col);
      }
      for (const [x, y, z, sx, sy, sz, colour] of gearBoxes(pc.kind, pc.cells)) {
        if (ng >= 64) break;
        p.gear.setMatrixAt(ng, m4.compose(pos.set(x, y, z), q.identity(), scl.set(sx, sy, sz)));
        p.gear.setColorAt(ng++, col.set(colour));
      }
    }
    p.tiles.count = nt; p.gear.count = ng;
    for (const m of [p.tiles, p.gear]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    // the passengers: a figure per person, standing on their cells (the active piece's walk in from the door)
    const live = new Set();
    gp.crowd.begin();
    for (const pc of pieces) {
      const def = GONDOLA_PIECES[pc.kind];
      def.people.forEach((ci, i) => {
        const key = `${pc.id}:${i}`;
        live.add(key);
        const [c, r] = pc.cells[ci];
        const x = cellX(c), z = cellZ(r);
        let rig = gp.rigs.get(key);
        if (!rig) {
          rig = def.kids?.includes(ci) ? new PersonRig({ seed: (seedN++ * 0.618) % 1, scale: 0.62, hair: Math.random() }) : guest();
          rig.reset(x, -GONDOLA.rows * CELL / 2 - 0.6, 0, () => 0);
          gp.rigs.set(key, rig);
        }
        rig.update(dt, x, z, Math.PI, () => 0); // (facing the front window)
        gp.crowd.add(rig, 0);
      });
    }
    for (const key of gp.rigs.keys()) if (!live.has(key)) gp.rigs.delete(key);
    gp.crowd.end();
    gp.queue.crowd.begin();
    for (const w of gp.queue.rigs) { w.rig.update(dt, w.x, w.z, Math.PI, () => -0.35); gp.queue.crowd.add(w.rig, 0); }
    gp.queue.crowd.end();
    // the camera: in front of the cabin, high, the door at the top of the screen; the whole floor fits the width
    const cam = ctx.camera;
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    // (the mission's panel covers the top of the screen: the floor sits in the lower part, the door just under the panel)
    const d = Math.max(3.4, (GONDOLA.cols * CELL + 1.0) / 2 / (tanV * cam.aspect), (GONDOLA.rows * CELL + 1.2) / 2 / tanV / 0.62);
    gp.interior.camera(cam, { x: 0, y: d * 0.96, z: d * 0.27 + 0.2 }, { x: 0, y: 0, z: -0.75 });
    // the HUD
    const score = String(gondolaScore(g));
    if (gp.big.textContent !== score) gp.big.textContent = score;
    const now = gondolaCabinScore(g.grid, g.placed);
    const line = gp.startIn > 0 ? 'The cabin comes in …' : g.departing ? 'The cabin is leaving …' : `${gondolaPersons(g)} up · cabin ${g.cabin}: ${now.persons} aboard, ${Math.round(now.fill * 100)} % · ${Math.ceil(Math.max(0, GONDOLA.seconds - g.t))} s`;
    if (gp.sub.textContent !== line) gp.sub.textContent = line;
    if (g.next !== gp.sig) {
      gp.sig = g.next;
      const def = GONDOLA_PIECES[g.next];
      const cells = rotateCells(def.cells, 0);
      const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
      const grid = el('span', 'fun-next-grid');
      grid.style.gridTemplateColumns = `repeat(${w}, 12px)`;
      for (let r = h - 1; r >= 0; r--) for (let c = 0; c < w; c++) { const s = el('span'); if (cells.some((p) => p[0] === c && p[1] === r)) s.style.background = def.colour; grid.append(s); }
      gp.next.replaceChildren(el('span', 'fun-sub', 'Next'), grid, el('span', 'fun-sub', def.label));
    }
    if (run.phase === 'done' || run.phase === 'failed') gp.hud.hidden = true;
  }
};

// =====================================================================================================================
// The RhB driver
// =====================================================================================================================
const RHB_FEATURE = {
  setup(run) {
    addStyle(run);
    const hud = el('div', 'fun-rhb');
    hud.hidden = true;
    const card = el('div', 'fun-card');
    const top = el('div', 'fun-row');
    top.style.justifyContent = 'flex-start';
    const limit = el('div', 'fun-limit', '60');
    const speedBox = el('div');
    const speed = el('div', 'fun-speed', '0');
    const unit = el('div', 'fun-sub', 'km/h');
    speedBox.append(speed, unit);
    const info = el('div', 'fun-sub');
    info.style.maxWidth = '220px';
    top.append(limit, speedBox, info);
    const table = el('table');
    card.append(top, table);
    hud.append(card);
    document.body.append(hud);
    run.cleanups.push(() => hud.remove());
    // the stop board at the platform: a post with a white board
    const board = mesh(shadedBoxes([[0.1, 2.6, 0.1, 0, 1.3, 0, 0x8a8f96], [0.7, 0.9, 0.06, 0, 2.6, 0, 0xffffff], [0.5, 0.5, 0.07, 0, 2.6, 0, 0xff7a00]]));
    board.visible = false;
    run.group.add(board);
    run.rd = { hud, limit, speed, info, table, board, train: null, sig: '' };
  },
  reset(run) {
    const rd = run.rd;
    const cm = run.hooks.controllerManager;
    const rail = cm.railway;
    run.state.drive = null;
    if (!rail?.line || !rail.trains?.length) return;
    const line = rail.line;
    const order = [RHB_DRIVE.from, ...RHB_DRIVE.stops];
    const stops = order.map((name) => { const st = line.stations.find((s) => s.name === name); return st ? { name, s: st.south } : null; });
    if (stops.some((s) => !s)) return;
    // the train: the one the rhb mode drives, set at Wolfgang's platform southbound; the other one waits beyond the
    // map's edge until the run is over (it would meet this one on the single track)
    let train = rail.trains.find((t) => t.manual);
    if (!train && cm.activeMode === 'rhb') train = rail.takeOver(true);
    if (!train) return;
    for (const t of rail.trains) if (t !== train) { t.off = Math.max(t.off, 900); t.dir = 'north'; t.speed = 0; t.dwell = 0; t.block = -1; }
    for (const b of rail.blocks || []) b.owner = null;
    Object.assign(train, { dir: 'south', s: stops[0].s, speed: 0, off: 0, dwell: 0, served: stops[0].s, block: 0, y: undefined });
    if (rail.blocks?.[0]) rail.blocks[0].owner = train;
    rail.setControls(0, 0);
    rail.update(0, {});
    if (cm.activeMode === 'rhb') {
      cm.updateRhB(0);
      run.lastPos.copy(cm.getActiveEntity().position); // (the jump to the platform is not a teleport)
      run.hooks.cameraSystem.resetForTeleport?.();
    }
    rd.train = train;
    rd.line = line;
    run.state.drive = createRhbDrive(stops);
    rd.sig = '';
    rd.hud.hidden = false;
  },
  teardown(run) { run.rd.board.visible = false; },
  update(run, ctx, dt) {
    const rd = run.rd, d = run.state.drive;
    if (!d || !rd.train) return;
    const t = rd.train;
    rhbDriveStep(d, { t: run.phase === 'running' ? ctx.t / 1000 : 0, s: t.dir === 'south' ? t.s : d.s, speed: t.speed, dt });
    const stop = d.timetable[d.index];
    if (stop) {
      const p = routePoint(rd.line.south, stop.s, {});
      ctx.stopTarget = { x: p.x, z: p.z, r: 3, style: 'pad' };
      // the board a few metres beside the track, on the platform side
      const ox = -p.dz * 2.6, oz = p.dx * 2.6;
      rd.board.position.set(p.x + ox, surfaceHeight(p.x + ox, p.z + oz), p.z + oz);
      rd.board.rotation.y = Math.atan2(p.dx, p.dz) + Math.PI;
      rd.board.visible = true;
    } else rd.board.visible = false;
  },
  after(run) {
    const rd = run.rd, d = run.state.drive;
    if (!d) return;
    const kmh = Math.round(d.speed * 3.6);
    const limit = rhbLimitAt(d.sections, d.s);
    rd.speed.textContent = String(kmh);
    rd.speed.classList.toggle('is-over', kmh > limit + RHB_DRIVE.tolerance);
    rd.limit.textContent = String(limit);
    // the next lower limit ahead
    let ahead = null;
    for (const sec of d.sections) if (sec.from > d.s && sec.from - d.s < 1500 && sec.kmh < limit && (!ahead || sec.from < ahead.from)) ahead = sec;
    const stop = d.timetable[d.index];
    const parts = [];
    if (stop) parts.push(`Stop board ${stop.name.replace('Davos ', '')}: ${Math.round(stop.s - d.s)} m`);
    if (ahead) parts.push(`${ahead.kmh} km/h in ${Math.round(ahead.from - d.s)} m`);
    if (d.phase === 'halt') parts.push(d.halt.dwell < RHB_DRIVE.dwell ? `Doors open · ${Math.ceil(RHB_DRIVE.dwell - d.halt.dwell)} s` : 'Doors closed: depart');
    parts.push(`Score ${rhbDriveScore(d)}`);
    const text = parts.join(' · ');
    if (rd.info.textContent !== text) rd.info.textContent = text;
    // the timetable: due and actual
    const sig = `${d.index}|${d.results.length}|${Math.floor(d.t)}`;
    if (sig !== rd.sig) {
      rd.sig = sig;
      const fmt = (s) => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
      rd.table.replaceChildren(...d.timetable.map((st, i) => {
        const tr = el('tr', i === d.index ? 'is-next' : i < d.index ? 'is-done' : '');
        const r = d.results[i];
        const actual = r ? (r.missed ? 'missed' : `${fmt(st.arrive + r.delay)} (${r.delay >= 0 ? '+' : '−'}${Math.abs(Math.round(r.delay))} s)`) : i === d.index ? `now ${fmt(d.t)}` : '';
        tr.append(el('td', null, st.name.replace('Davos ', '')), el('td', null, fmt(st.arrive)), el('td', null, actual), el('td', null, r ? `${r.total} pts` : ''));
        return tr;
      }));
    }
    if (run.phase === 'done') rd.board.visible = false;
  }
};

export const FUN_FEATURES = { headbang: HEADBANG_FEATURE, foosball: FOOSBALL_FEATURE, gondola: GONDOLA_FEATURE, rhbDriver: RHB_FEATURE };
