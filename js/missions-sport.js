import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { uniform } from 'three/tsl';
import { surfaceHeight, groundHeight } from './terrain.js';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { poseSkierRig, skierCadence, SKIER_TECH } from './cross-country.js';
import { poseSkater } from './missions-ice.js';
import {
  XC_PARAMS, XC_LINE, XC_LENGTH, XC_SPLITS, XC_PLAYER_BIB, createXcSkier, stepXc, xcNeedle, xcGrade, linePoint, createField,
  racerAt, aiSpeed, placeAt,
  MINIGOLF, MINIGOLF_SITE, WALDHUUS_COURSE, ICE_MINIGOLF, ARKADENPLATZ_COURSE, onLane, holeFrame, holeToWorld, holeHeight, windmillAngle, minigolfPutt, minigolfStep, minigolfNext, minigolfTotal, strokeName,
  BOARD, SECTORS, DART, scoreDart, swayAt, throwDart, createX01, x01Dart,
  BOWL, BOWL_SIGMA, SKATE, bowlSurface, floorEdge, createBoarder, stepBoarder, boarderSpeed, addTrick, comboValue, comboMultiplier, skateTotal, bowlToWorld, bowlHeadingToWorld, SCHUESSLA
} from './missions-data-sport.js';

// js/missions-sport.js
// The sport missions' runtime (js/missions-data-sport.js has their definitions and the pure game logic), as features of
// js/missions.js (SPORT_FEATURES, merged into its FEATURES):
//   xcSkis    — the pedestrian on cross-country skis: the controllers' personDriver strokes, poles and tucks by stepXc
//               (on the course's baked grade), steering with a light trail assist; the personPoser poses the skinned
//               person with the skiers' own technique poses (js/cross-country.js poseSkierRig), its skis and poles; the
//               rhythm bar, the technique's choice (1 / 2, buttons), the touch buttons "Kick" and "Double pole"
//   xcRace    — Davos Nordic's stadium on the Bünda (the start/finish arch, the fences and boards, the crowd), the split
//               gantries, the race field (js/cross-country.js api.race drives seven of its skiers at their fixed pace),
//               the countdown, the live place and the split flashes
//   iceMinigolf — the same game on 18 lanes of ice on the Arkadenplatz, with a stick and a puck
//   minigolf  — six lanes beside the Hotel Waldhuus (felt, boards, ramp, loop, posts, windmill, bend, bridge over the
//               water), the ball, the putter; aim and power (keys, hold-and-release, a slingshot drag), its camera
//   darts     — The Green Wildman's bar room (built at the door, high above it as js/missions-fun.js does its interiors),
//               the board drawn to regulation, the swaying crosshair, the throw, the chalk scoreboard
//   skateBowl — the Schüssla: the concrete bowl on its raised deck, coping, quarterpipes; the skateboarder (the skater's
//               pose from js/missions-ice.js tilted onto the wall), the board, the trick HUD, its camera
// Everything is built when the mission starts and goes with the run (its group, its DOM, the controllers' hooks).

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const fmtSec = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(1).padStart(4, '0')}`; };
const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const INTERIOR_LIFT = 400; // m: the bar room floats this high above its door (out of sight of the town)

// --- Styles (injected once a run; no shared stylesheet edit) ----------------------------------------------------------
const STYLE = `
.sport-hud{position:fixed;left:50%;bottom:max(54px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:12;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 14px;min-width:250px;pointer-events:none;font-size:13px;font-weight:600;text-align:center}
.sport-hud[hidden],.sport-hud [hidden]{display:none!important}
.sport-row{display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}
.sport-meter{position:relative;width:220px;height:12px;border-radius:6px;background:rgba(255,255,255,.14);overflow:hidden}
.sport-meter-zone{position:absolute;top:0;bottom:0;background:rgba(80,220,140,.45)}
.sport-meter-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#3fd6ff,#fff)}
.sport-meter-needle{position:absolute;top:-2px;bottom:-2px;width:3px;margin-left:-1px;background:#fff;box-shadow:0 0 4px #000}
.sport-flash{font-size:15px;font-weight:800;min-height:18px}
.sport-flash.is-good{color:#5be08c}.sport-flash.is-bad{color:#ff7a6b}.sport-flash.is-gold{color:#ffc83d}
.sport-big{position:fixed;left:50%;top:36%;transform:translate(-50%,-50%);z-index:12;pointer-events:none;font-size:58px;font-weight:900;color:#fff;text-shadow:0 3px 14px rgba(0,0,0,.6);opacity:0;transition:opacity .25s;text-align:center}
.sport-big.is-on{opacity:1}
.sport-big small{display:block;font-size:20px;font-weight:700}
.sport-choice{display:flex;gap:10px;pointer-events:auto}
.sport-choice button{pointer-events:auto;border:0;border-radius:12px;padding:12px 18px;font:800 15px Inter,system-ui,sans-serif;color:#fff;background:linear-gradient(180deg,#e3262f,#9d1219);box-shadow:0 6px 18px rgba(0,0,0,.35);touch-action:manipulation}
.sport-choice button.is-skate{background:linear-gradient(180deg,#2f7bff,#1847b5)}
.sport-choice kbd{font:600 11px Inter,system-ui,sans-serif;opacity:.75;margin-left:6px}
.sport-board{display:grid;grid-template-columns:repeat(6,auto);gap:2px 10px;font-size:12px;font-variant-numeric:tabular-nums}
.sport-board .is-now{color:#ffc83d}
.sport-cross{position:fixed;z-index:12;width:34px;height:34px;margin:-17px 0 0 -17px;pointer-events:none;border:2px solid rgba(255,255,255,.9);border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.5),inset 0 0 0 1px rgba(0,0,0,.5)}
.sport-cross::before,.sport-cross::after{content:'';position:absolute;background:#ff3b3b;left:50%;top:50%}
.sport-cross::before{width:2px;height:40px;margin:-20px 0 0 -1px}.sport-cross::after{width:40px;height:2px;margin:-1px 0 0 -20px}
.sport-cross[hidden]{display:none}
.sport-balance{position:relative;width:200px;height:10px;border-radius:5px;background:linear-gradient(90deg,#ff5b5b,#ffc83d 30%,#5be08c 45%,#5be08c 55%,#ffc83d 70%,#ff5b5b)}
.sport-balance span{position:absolute;top:-3px;width:4px;height:16px;margin-left:-2px;background:#fff;box-shadow:0 0 4px #000}
body.sport-indoor #touch-controls,body.sport-indoor .gta-prompt,body.sport-indoor .touch-use,body.sport-indoor .mission-prompt{display:none!important}
body.touch-enabled .sport-hud{bottom:calc(max(12px,env(safe-area-inset-bottom)) + var(--touch-clear, 200px))}
body.sport-indoor.touch-enabled .sport-hud{bottom:max(14px,env(safe-area-inset-bottom))}
@media (max-width:820px){body.touch-enabled:not(.sport-indoor) .sport-hud{bottom:auto;top:calc(max(12px,env(safe-area-inset-top)) + 188px)}.sport-hud{min-width:0;padding:6px 10px;font-size:12px}.sport-meter{width:170px}.sport-big{font-size:42px}}
`;
function addStyle(run) {
  if (run._sportStyle) return;
  const s = el('style');
  s.dataset.sport = '1';
  s.textContent = STYLE;
  document.head.append(s);
  run._sportStyle = s;
  run.cleanups.push(() => s.remove());
}
function hudPanel(run) {
  addStyle(run);
  const hud = el('div', 'panel sport-hud');
  const big = el('div', 'sport-big');
  document.body.append(hud, big);
  run.cleanups.push(() => { hud.remove(); big.remove(); });
  return { hud, big };
}
function meter(zoneFrom = null, zoneTo = 1) {
  const m = el('div', 'sport-meter');
  const zone = el('span', 'sport-meter-zone'), fill = el('span', 'sport-meter-fill'), needle = el('span', 'sport-meter-needle');
  m.append(zone, fill, needle);
  if (zoneFrom == null) zone.hidden = true;
  else { zone.style.left = `${zoneFrom * 100}%`; zone.style.right = `${(1 - zoneTo) * 100}%`; }
  return { m, zone, fill, needle, set(v) { needle.style.left = `${clamp(v, 0, 1) * 100}%`; fill.style.width = `${clamp(v, 0, 1) * 100}%`; } };
}
function bigText(run, node, text, sub = '', ms = 1100) {
  node.replaceChildren(document.createTextNode(text));
  if (sub) node.append(el('small', null, sub));
  node.classList.add('is-on');
  clearTimeout(node._t);
  if (ms) node._t = setTimeout(() => node.classList.remove('is-on'), ms);
}
const setText = (node, t) => { if (node.textContent !== t) node.textContent = t; };

/** The touch screens' jump (`up`) or descend (`down`) button relabelled, and shown, for the mission (js/actions.js) */
function touchButton(run, action, text) { run.button(action, text); }
/** The rising edge of a held key action (keys.up: Space, E, the touch button) */
function edge(run, cm, action = 'up') {
  const on = !!cm.keys[action];
  const key = `_sportEdge_${action}`;
  const was = !!run[key];
  run[key] = on;
  return on && !was;
}

/** Boxes merged into one geometry, the shading baked into their vertex colours: [w, h, d, x, y, z, colour, rotY?] */
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
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
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
/** Plain vertex colours (no baked shading: the lit outdoor props) */
function tint(g, col) {
  if (g.index) g = g.toNonIndexed();
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const unlit = (opts = {}) => new THREE.MeshBasicNodeMaterial({ vertexColors: true, ...opts });
const litMat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, ...opts });
function mesh(geometry, material, shadows = false) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = m.receiveShadow = shadows;
  return m;
}
/** Text on a canvas on a plane (a banner, a sign) */
function textPlane(lines, w, h, { fg = '#ffffff', bg = '#e3262f', font = '900 120px Inter, Arial, sans-serif', lit = false, glow = 0 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = Math.max(64, Math.round(1024 * (h / w)));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = fg;
  if (glow) { ctx.shadowColor = fg; ctx.shadowBlur = glow; }
  const list = [].concat(lines);
  list.forEach((t, i) => {
    const size = parseInt(font.match(/(\d+)px/)?.[1] || '100', 10) * (i ? 0.55 : 1);
    ctx.font = font.replace(/\d+px/, `${Math.round(Math.min(size, canvas.height / (list.length + 0.3)))}px`);
    ctx.fillText(t, canvas.width / 2, (canvas.height * (i + 0.5)) / list.length, canvas.width * 0.94);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = lit ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }) : new THREE.MeshBasicNodeMaterial({ map: tex, side: THREE.DoubleSide, transparent: bg === 'rgba(0,0,0,0)' });
  return mesh(new THREE.PlaneGeometry(w, h), mat);
}

/** A crowd of the city's figures (js/pedestrians.js), standing at given spots; `selfLit` for the indoor scenes */
function makeCrowd(spots, { selfLit = false, tintRGB = [1, 1, 1] } = {}) {
  const crowd = new PersonCrowd(spots.length, { farDistance: 60, castShadow: false });
  if (selfLit) {
    const t = uniform(new THREE.Color(...tintRGB));
    for (const m of crowd.meshes) { m.receiveShadow = false; m.material.emissiveNode = m.material.colorNode.mul(t); }
  }
  let n = 7;
  const people = spots.map((s) => {
    const rig = new PersonRig({ seed: (n++ * 0.6180339) % 1, female: Math.random() < 0.45, hair: Math.random(), girth: 0.92 + Math.random() * 0.2, scale: 0.94 + Math.random() * 0.1 });
    return { rig, ...s, phase: Math.random() * 6 };
  });
  return { crowd, people };
}
function poseCrowd(c, dt, ground, cheer = 0) {
  c.crowd.begin();
  for (const p of c.people) {
    p.rig.update(dt, p.x, p.z, p.yaw, ground);
    if (cheer) cheerArms(p.rig, p.phase += dt * 6, cheer);
    c.crowd.add(p.rig, 0);
  }
  c.crowd.end();
}
// (arms up and waving: the upper arms' bones lifted round their shoulder)
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _va = new THREE.Vector3(), _vb = new THREE.Vector3();
const AXX = new THREE.Vector3(1, 0, 0), AXY = new THREE.Vector3(0, 1, 0), AXZ = new THREE.Vector3(0, 0, 1);
export function cheerArms(rig, ph, amount) {
  const a = rig.pose;
  for (const [b, side] of [[3, 1], [5, -1]]) {
    const o = b * 8;
    // the shoulder (the bone's own origin in the world): its translation plus its rotated bind position
    _qa.set(a[o], a[o + 1], a[o + 2], a[o + 3]);
    _va.copy(rig.bind[b]).applyQuaternion(_qa).multiplyScalar(rig.s).add(_vb.set(a[o + 4], a[o + 5], a[o + 6]));
    _qb.setFromAxisAngle(AXY, rig.yaw).multiply(_qa.setFromAxisAngle(AXZ, side * (2.5 + 0.35 * Math.sin(ph + side)) * amount));
    rig.writeBone(b, _qb, _va);
    // (the forearm follows: hand up)
    const fo = (b + 1) * 8;
    _qa.copy(_qb);
    const fp = new THREE.Vector3().copy(rig.bind[b + 1]).sub(rig.bind[b]).multiplyScalar(rig.s).applyQuaternion(_qb).add(_va);
    rig.writeBone(b + 1, _qa, fp);
    void fo;
  }
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

class Blips {
  constructor(audio) { this.audio = audio; }
  get live() { const a = this.audio; return !!(a && a.enabled && a.context && a.context.state === 'running' && a.mix); }
  tone(freq, len, { type = 'sine', vol = 0.15, slide = 0, delay = 0 } = {}) {
    if (!this.live) return;
    const ctx = this.audio.context, at = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, at + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(this.audio.mix); o.start(at); o.stop(at + len + 0.02);
  }
  click(v = 1) { this.tone(1800 + Math.random() * 600, 0.03, { type: 'triangle', vol: 0.12 * v }); }
  thud(v = 1) { this.tone(160, 0.08, { type: 'sine', vol: 0.25 * v, slide: 0.6 }); }
  bell() { for (let i = 0; i < 3; i++) this.tone(520 + i * 7, 0.35, { type: 'square', vol: 0.05, delay: i * 0.13 }); }
  beep(high = false) { this.tone(high ? 1320 : 880, high ? 0.5 : 0.18, { type: 'square', vol: 0.07 }); }
}

// =====================================================================================================================
// 1. Davos Nordic: the skis
// =====================================================================================================================
const SKI_LIFT = 0.15; // (js/cross-country.js LIFT: the skis sit in the groomed trail, 0.16 m over the terrain)
const trailY = (x, z) => surfaceHeight(x, z, groundHeight(x, z)) + SKI_LIFT;

function createSkiGear() {
  const g = new THREE.Group();
  const ski = new THREE.BoxGeometry(0.045, 0.025, 1).translate(0, 0.0125, -0.04);
  const skiMat = new THREE.MeshStandardMaterial({ color: 0xd3202a, roughness: 0.45 });
  const pole = new THREE.CylinderGeometry(0.009, 0.006, 1, 6).translate(0, -0.5, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.5, metalness: 0.4 });
  const skis = [0, 1].map(() => { const m = new THREE.Mesh(ski, skiMat); m.matrixAutoUpdate = false; m.castShadow = true; g.add(m); return m; });
  const poles = [0, 1].map(() => { const m = new THREE.Mesh(pole, poleMat); m.castShadow = true; g.add(m); return m; });
  // the start number on the chest: a white bib, drawn as a plane following the chest
  return { group: g, skis, poles };
}

const _fwd = new THREE.Vector3(), _left = new THREE.Vector3(), _tip = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0), _qPole = new THREE.Quaternion();
const xcSkis = {
  // (js/missions.js hides the game's own controls while this is true: choosing the technique; the race itself is skiing)
  ownControls: (run) => !!run.state?.race && !run.state.race.style,
  setup(run) {
    const cm = run.hooks.controllerManager;
    const xc = run.xc = { skier: createXcSkier(0), P: XC_PARAMS.skate, phase: 0, gear: createSkiGear(), frozen: true, assist: true };
    run.group.add(xc.gear.group);
    const { hud, big } = hudPanel(run);
    xc.ui = { hud, big };
    const choice = el('div', 'sport-choice');
    const bClassic = el('button', null, 'Classic'); bClassic.type = 'button'; bClassic.append(el('kbd', null, '1'));
    const bSkate = el('button', 'is-skate', 'Skating'); bSkate.type = 'button'; bSkate.append(el('kbd', null, '2'));
    run.listen(bClassic, 'click', () => xcSkis.choose(run, 'classic'));
    run.listen(bSkate, 'click', () => xcSkis.choose(run, 'skate'));
    choice.append(bClassic, bSkate);
    const mt = meter(XC_PARAMS.skate.window, 1);
    const row = el('div', 'sport-row');
    xc.ui.speed = el('span', null, '0 km/h');
    xc.ui.clock = el('span', null, '0:00.0');
    xc.ui.place = el('span', null, '');
    row.append(el('span', null, 'Rhythm'), mt.m, xc.ui.speed);
    const row2 = el('div', 'sport-row');
    row2.append(el('span', null, `Bib ${XC_PLAYER_BIB}`), xc.ui.clock, xc.ui.place);
    xc.ui.flash = el('div', 'sport-flash');
    xc.ui.meter = mt;
    xc.ui.choice = choice;
    xc.ui.race = el('div');
    xc.ui.race.append(row, row2, xc.ui.flash);
    run.hints([[['W'], 'hold: stride · let go downhill: tuck'], [['Space'], 'in the green: power stroke'], [['Q'], 'hold: double pole (flat)'], [['A', 'D'], 'steer']]);
    xc.ui.race.hidden = true;
    hud.append(choice, xc.ui.race);
    cm.personDriver = (dt) => xcSkis.drive(run, dt, cm);
    cm.personPoser = (dt, p) => xcSkis.pose(run, dt, p);
    run.cleanups.push(() => {
      if (cm.personDriver) cm.personDriver = null;
      cm.personPoser = null;
      const p = cm.entities.person;
      p.rig.placed = false;
      p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
      p.speed = 0;
    });
  },
  reset(run) {
    const xc = run.xc;
    const p = run.hooks.controllerManager.entities.person;
    xc.skier = createXcSkier(p.heading);
    xc.ui.choice.hidden = false;
    xc.ui.race.hidden = true;
    run._sportEdge_up = true;
    touchButton(run, 'up', 'Kick');
    touchButton(run, 'down', 'Double pole');
  },
  choose(run, style) {
    const st = run.state?.race;
    if (!st || st.style || !live(run)) return;
    st.style = style;
    st.field = createField(style);
    st.skier = run.xc.skier;
    run.xc.P = XC_PARAMS[style];
    const mt = run.xc.ui.meter;
    mt.zone.style.left = `${run.xc.P.window * 100}%`;
    run.xc.ui.choice.hidden = true;
    run.xc.ui.race.hidden = false;
    // the player's lane: the right-hand classic track, or the right half of the skating lane
    const cm = run.hooks.controllerManager, p = cm.entities.person;
    const q = linePoint(XC_LINE, 0.5);
    const off = style === 'classic' ? 2.6 : 1.2;
    p.position.x = q.x - q.dz * off; p.position.z = q.z + q.dx * off;
    run.lastPos?.copy(p.position);
    run.audio.thump?.();
  },
  key(run, e) {
    if (!live(run)) return;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Numpad1' || e.code === 'Numpad2') {
      // (the digits switch the vehicle otherwise: never during the race)
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) xcSkis.choose(run, e.code.endsWith('1') ? 'classic' : 'skate');
    }
  },
  drive(run, dt, cm) {
    const p = cm.entities.person, xc = run.xc, sk = xc.skier, k = cm.keys, st = run.state?.race;
    const go = live(run) && st?.started && st.finishT === null;
    const s = st ? st.s : 0;
    const grade = st && st.off < 35 ? xcGrade(s) : 0;
    let steer = (+k.left || 0) - (+k.right || 0);
    // the trail assist: with no steering input, the skis follow the course gently (a point 14 m ahead)
    if (go && !steer && xc.assist && st.off < 12) {
      const a = linePoint(XC_LINE, Math.min(XC_LENGTH, s + 14));
      const want = Math.atan2(a.x - p.position.x, a.z - p.position.z);
      let d = want - sk.heading; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      steer = clamp(d * 2.2, -0.75, 0.75);
    }
    const input = go ? { forward: +k.forward || 0, back: +k.backward || 0, steer, push: edge(run, cm, 'up'), pole: !!k.down } : { forward: 0, back: 1, steer: 0, push: false, pole: false };
    if (!go) edge(run, cm, 'up');
    sk.heading = p.heading;
    const stroke = stepXc(sk, input, dt, xc.P, { grade, offTrack: !!st && st.off > 4 });
    if (go && (stroke === 'power' || (sk.last === 'early' && sk.lastAge === 0))) xcSkis.flash(run, stroke === 'power' ? ['Power stroke!', 'is-good'] : ['Too early: stumble', 'is-bad']);
    p.heading = sk.heading;
    p.speed = sk.speed;
    p.position.x += Math.sin(sk.heading) * sk.speed * dt;
    p.position.z += Math.cos(sk.heading) * sk.speed * dt;
    cm.resolveHorizontalCollision(p.position, 0.48, null, p);
    p.position.y = trailY(p.position.x, p.position.z);
    p.verticalVel = 0;
  },
  flash(run, [text, cls]) {
    const f = run.xc.ui.flash;
    f.textContent = text; f.className = `sport-flash ${cls}`;
    run.xc.flashAt = performance.now();
  },
  pose(run, dt, p) {
    const xc = run.xc, sk = xc.skier, rig = p.rig;
    const style = run.state?.race?.style || 'skate';
    const st = run.state?.race;
    const grade = st ? xcGrade(st.s) : 0;
    const T = SKIER_TECH;
    const tech = sk.tuck ? T.TUCK : sk.poling ? T.DOUBLE_POLE : style === 'classic' ? T.DIAGONAL : T.V2_ALT;
    // the gait follows the strokes: half a cycle a stroke (the rhythm's needle), standing still at rest
    const needle = xcNeedle(sk, xc.P);
    if (sk.speed > 0.2 && tech !== T.TUCK) xc.phase = (sk.side > 0 ? 0 : 0.5) + 0.5 * clamp(needle, 0, 1);
    else xc.phase = (xc.phase + skierCadence(tech, Math.max(sk.speed, 0.8), grade) * dt * Math.min(1, sk.speed / 1.5)) % 1;
    rig.yaw = p.heading; rig.x = p.position.x; rig.z = p.position.z; rig.placed = true; rig.speed = 0; rig.gait = 0; rig.run = 0;
    poseSkierRig(rig, tech, xc.phase % 1, sk.speed, grade, style === 'classic' ? 'classic' : 'skate', p.position.x, p.position.z, trailY);
    // skis and poles
    const gear = xc.gear;
    for (let i = 0; i < 2; i++) { gear.skis[i].matrix.copy(rig.skis[i]); gear.skis[i].matrixWorldNeedsUpdate = true; }
    _fwd.set(Math.sin(rig.yaw), 0, Math.cos(rig.yaw)); _left.set(Math.cos(rig.yaw), 0, -Math.sin(rig.yaw));
    const poleLen = (style === 'classic' ? 1.45 : 1.58) * rig.s;
    for (let i = 0; i < 2; i++) {
      const hand = rig.hands[i];
      const pushing = tech === T.TUCK ? 0 : Math.max(0, Math.sin((xc.phase + (i && tech === T.DIAGONAL ? 0.5 : 0)) * Math.PI * 2));
      const back = tech === T.TUCK ? 1.2 : 0.35 + 0.55 * pushing;
      _tip.copy(hand).addScaledVector(_fwd, -back * poleLen * 0.7).addScaledVector(_left, (i ? -1 : 1) * 0.12);
      _tip.y = hand.y - poleLen * (tech === T.TUCK ? 0.25 : 0.85);
      const dir = _tip.sub(hand).normalize();
      _qPole.setFromUnitVectors(_down, dir);
      gear.poles[i].position.copy(hand);
      gear.poles[i].quaternion.copy(_qPole);
      gear.poles[i].scale.set(1, poleLen, 1);
    }
  },
  update(run) {
    const xc = run.xc, st = run.state?.race;
    if (!st) return;
    if (!st.style) return;
    xc.ui.meter.set(xcNeedle(xc.skier, xc.P));
    setText(xc.ui.speed, `${(xc.skier.speed * 3.6).toFixed(0)} km/h`);
    setText(xc.ui.clock, st.started ? fmtSec(st.finishT ?? st.raceT) : `Start in ${Math.ceil(st.countdown)}`);
    if (st.started && st.field) {
      const place = st.finishT !== null ? st.place : livePlace(st);
      setText(xc.ui.place, `${ordinal(place)} of ${st.field.length + 1}`);
    }
    if (xc.flashAt && performance.now() - xc.flashAt > 900) { xc.ui.flash.textContent = ''; xc.flashAt = 0; }
  },
  after(run) { run.xc.ui.hud.hidden = !live(run); }
};
/** The player's place on the course now: the racers further along */
function livePlace(st) {
  let place = 1;
  for (const r of st.field) if (racerAt(r.tab, st.raceT) > st.s) place++;
  return place;
}

// =====================================================================================================================
// 1b. Davos Nordic: the stadium, the field, the countdown and the splits
// =====================================================================================================================
const at = (s, off = 0) => { const p = linePoint(XC_LINE, s); return { x: p.x - p.dz * off, z: p.z + p.dx * off, h: Math.atan2(p.dx, p.dz), dx: p.dx, dz: p.dz }; };

function buildArch(lines, s, width, { bg = '#e3262f', fg = '#fff', h = 4.2 } = {}) {
  const g = new THREE.Group();
  const p = at(s);
  const y = trailY(p.x, p.z);
  g.position.set(p.x, y, p.z);
  g.rotation.y = p.h; // (the banner across the trail, facing the skiers)
  const posts = shadedBoxes([[0.3, h, 0.3, -width / 2, h / 2, 0, 0x2b2d33], [0.3, h, 0.3, width / 2, h / 2, 0, 0x2b2d33], [width + 0.4, 0.25, 0.32, 0, h, 0, 0x2b2d33]]);
  g.add(mesh(posts, litMat(), true));
  const banner = textPlane(lines, width, 1.0, { bg, fg });
  banner.position.set(0, h - 0.62, 0.17);
  const back = banner.clone(); back.position.z = -0.17; back.rotation.y = Math.PI;
  g.add(banner, back);
  return g;
}

const xcRace = {
  setup(run) {
    const cc = run.scene.getObjectByName('CrossCountrySkiers')?.userData?.crossCountry || null;
    const R = run.xcRace = { cc, trail: { pts: XC_LINE.pts, cum: XC_LINE.cum, length: XC_LINE.length, lanes: [], ends: [[], []] }, racers: [], announced: 0, cheer: 0, blips: new Blips(run.hooks.audio), lastCount: null };
    const g = R.group = new THREE.Group();
    g.name = 'DavosNordic';
    run.group.add(g);
    // the start / finish arch, a timing clock beside it, the split gantries
    g.add(buildArch(['DAVOS NORDIC', 'START · FINISH'], 0.0, 8.5));
    XC_SPLITS.forEach((m, i) => g.add(buildArch([`SPLIT ${i + 1}`, `${(m / 1000).toFixed(1)} km`], m, 7.5, { bg: '#1d5bc4', h: 3.6 })));
    // the stadium: fences either side of the first and last 70 m (red boards), the grandstand crowd behind them
    const boards = [], spots = [];
    const fence = (s0, s1, side) => {
      for (let s = s0; s < s1; s += 2.5) {
        const p = at(s, side * 4.4);
        const y = groundHeight(p.x, p.z);
        boards.push([2.4, 0.9, 0.06, p.x, y + 0.45, p.z, (Math.floor(s / 2.5) % 3) ? 0xe3262f : 0xf2f2ee, p.h + Math.PI / 2]);
      }
    };
    for (const side of [-1, 1]) { fence(2, 70, side); fence(XC_LENGTH - 70, XC_LENGTH - 2, side); }
    // (the out- and the in-bound legs share the City-Trail here: one set of fences on its outer sides does both)
    g.add(mesh(shadedBoxes(boards), litMat(), false));
    let k = 0;
    for (const side of [-1, 1]) for (let s = 6; s < 66; s += 2.2) {
      const p = at(s, side * (5.3 + (k % 3) * 0.7));
      spots.push({ x: p.x + (Math.random() - 0.5) * 0.4, z: p.z + (Math.random() - 0.5) * 0.4, yaw: p.h - side * Math.PI / 2 });
      k++;
    }
    R.crowd = makeCrowd(spots.slice(0, 44));
    for (const m of R.crowd.crowd.meshes) g.add(m);
    R.ground = (x, z) => groundHeight(x, z);
    for (const p of R.crowd.people) p.rig.reset(p.x, p.z, p.yaw, R.ground);
    g.updateMatrixWorld(true);
  },
  reset(run) {
    const R = run.xcRace;
    R.announced = 0; R.lastCount = null; R.finished = false;
    if (R.cc) R.cc.race = null;
  },
  teardown(run) {
    const R = run.xcRace;
    if (R.cc) R.cc.race = null;
    // (the crowd's meshes go with the group)
  },
  update(run, ctx, dt) {
    const R = run.xcRace, st = run.state?.race;
    if (!st) return;
    // the field: on the grid before the gun, then at their pace
    if (st.field && R.cc) {
      if (!R.cc.race) R.cc.race = { trail: R.trail, racers: st.field.map(() => ({ s: 0, v: 0, style: st.style === 'classic' ? 'classic' : 'skate', offset: 0, grade: 0 })) };
      const t = st.started ? st.raceT : 0;
      st.field.forEach((r, i) => {
        const o = R.cc.race.racers[i];
        const s = racerAt(r.tab, t);
        const fade = clamp(1 - s / 60, 0, 1);
        o.s = Math.max(0.2, s + 0.5 - r.back * fade);
        o.offset = (st.style === 'classic' ? r.offset * 1.6 : r.offset) * fade + (1 - fade) * (st.style === 'classic' ? 2.6 : 1.0) * (i % 2 ? 1 : 0.6);
        o.grade = xcGrade(s);
        o.v = st.started && s < XC_LENGTH ? aiSpeed(r.base, o.grade) : 0;
        o.style = st.style === 'classic' ? 'classic' : 'skate';
      });
    }
    // the countdown and the gun
    const ui = run.xc?.ui;
    if (st.style && !st.started) {
      const n = Math.ceil(st.countdown);
      if (n !== R.lastCount) { R.lastCount = n; if (ui) bigText(run, ui.big, String(n), 'Davos Nordic', 0); R.blips.beep(false); }
    } else if (st.started && R.lastCount !== 0) {
      R.lastCount = 0;
      if (ui) bigText(run, ui.big, 'GO!', '', 900);
      R.blips.beep(true);
    }
    // the splits as they come
    if (st.splits.length > R.announced) {
      const sp = st.splits[R.announced++];
      if (ui) bigText(run, ui.big, `${ordinal(sp.place)}`, `Split ${R.announced} · ${fmtSec(sp.t)} · ${sp.gap >= 0 ? '+' : '−'}${Math.abs(sp.gap).toFixed(1)} s`, 2200);
      R.blips.bell();
    }
    if (st.finishT !== null && !R.finished) {
      R.finished = true;
      if (ui) bigText(run, ui.big, `${ordinal(st.place)} place`, fmtSec(st.finishT), 3000);
      R.blips.bell();
      R.cheer = 4;
    }
    // the crowd: cheering when the player is near the stadium
    const near = Math.hypot(ctx.x - XC_LINE.pts[0], ctx.z - XC_LINE.pts[1]) < 90;
    R.cheer = Math.max(0, R.cheer - dt);
    poseCrowd(R.crowd, dt, R.ground, near && (st.started || R.cheer > 0) ? 1 : 0);
  }
};

// =====================================================================================================================
// 2. Minigolf at the Hotel Waldhuus
// =====================================================================================================================
const FELT = 0xb44a3c, BOARD_COL = 0xd9d4cc, DITCH = 0x4a3b2a; // (the red Eternit lanes, their concrete boards)

/** A lane's height: level, just over the highest ground under it (the lanes stand on the path on low feet) */
function holeBaseY(i, course) {
  const f = holeFrame(i, course), h = course.holes[i];
  let m = -Infinity;
  for (const [x, y] of h.outline) { const p = holeToWorld(f, x, y); m = Math.max(m, groundHeight(p.x, p.z)); }
  const mid = holeToWorld(f, h.cup[0] / 2, h.cup[1] / 2);
  return Math.max(m, groundHeight(mid.x, mid.z)) + 0.16;
}

/** The light paved path under the lanes, draped over the terrain (the orthophoto's quads) */
function buildPath(course, look) {
  const pos = [];
  const N = look.pathAcross;
  for (const q of course.path) {
    const [a, b, c, d] = q;
    const len = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(d[0] - a[0], d[1] - a[1]));
    const M = Math.max(2, Math.ceil(len / 1.5));
    const P = (u, v) => { const x = (a[0] * (1 - u) + b[0] * u) * (1 - v) + (d[0] * (1 - u) + c[0] * u) * v, z = (a[1] * (1 - u) + b[1] * u) * (1 - v) + (d[1] * (1 - u) + c[1] * u) * v; return [x, groundHeight(x, z) + 0.035, z]; };
    const lu = Math.hypot(b[0] - a[0], b[1] - a[1]) >= Math.hypot(d[0] - a[0], d[1] - a[1]);
    const nu = lu ? M : N, nv = lu ? N : M;
    for (let i = 0; i < nu; i++) for (let k = 0; k < nv; k++) {
      const p00 = P(i / nu, k / nv), p10 = P((i + 1) / nu, k / nv), p01 = P(i / nu, (k + 1) / nv), p11 = P((i + 1) / nu, (k + 1) / nv);
      pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // (each quad's own winding: make every triangle face up)
  const a = g.attributes.position.array;
  for (let t = 0; t < a.length; t += 9) {
    const ux = a[t + 3] - a[t], uz = a[t + 5] - a[t + 2], vx = a[t + 6] - a[t], vz = a[t + 8] - a[t + 2];
    if (uz * vx - ux * vz < 0) for (let c = 0; c < 3; c++) { const v = a[t + 3 + c]; a[t + 3 + c] = a[t + 6 + c]; a[t + 6 + c] = v; }
  }
  g.computeVertexNormals();
  tint(g, look.path);
  return mesh(g, litMat({ roughness: 0.9 }), false);
}

/** One lane's static meshes (in its own frame: x across, y along, the felt at height 0 + holeHeight) */
function buildHole(hole, i, course, look) {
  const g = new THREE.Group();
  const felt = [], boards = [], dark = [], water = [];
  // the felt: a grid following the ramps; on the bridge hole only the bridge's plank between the banks
  const xs = [], ys = [];
  let x0 = Infinity, x1 = -Infinity;
  for (const [x] of hole.outline) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  for (let x = x0; x <= x1 + 1e-6; x += 0.08) xs.push(x);
  for (let y = 0; y <= hole.length + 1e-6; y += 0.1) ys.push(y);
  const inside = (x, y) => onLane(hole, x, y);
  const b = hole.bridge;
  const pos = [], col = [];
  const cF = new THREE.Color(look.felt);
  for (let iy = 0; iy < ys.length - 1; iy++) for (let ix = 0; ix < xs.length - 1; ix++) {
    const xa = xs[ix], xb = xs[ix + 1], ya = ys[iy], yb = ys[iy + 1];
    const cx = (xa + xb) / 2, cy = (ya + yb) / 2;
    if (!inside(cx, cy)) continue;
    if (b && cy > b.y0 && cy < b.y1) continue; // (the water there; the bridge separately)
    const H = (x, y) => holeHeight(hole, x, y).h;
    const quad = [[xa, ya], [xb, yb], [xb, ya], [xa, ya], [xa, yb], [xb, yb]]; // (counter-clockwise from above: facing up)
    for (const [x, y] of quad) { pos.push(x, H(x, y), y); col.push(cF.r, cF.g, cF.b); }
  }
  const feltGeo = new THREE.BufferGeometry();
  feltGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  feltGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  feltGeo.computeVertexNormals();
  felt.push(feltGeo);
  // the ramps' side faces (the boards follow them up)
  // the boards: a low white box along each wall segment, following the felt's height
  for (const [ax, ay, bx, by] of hole.walls) {
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-3) continue;
    const n = Math.max(1, Math.ceil(L / 0.6));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const px = ax + (bx - ax) * (t0 + t1) / 2, py = ay + (by - ay) * (t0 + t1) / 2;
      const h = holeHeight(hole, px, py).h;
      const box = new THREE.BoxGeometry(0.045, h + 0.09, L / n + 0.045).toNonIndexed();
      box.rotateY(Math.atan2(bx - ax, by - ay));
      box.translate(px, (h + 0.09) / 2, py);
      boards.push(shade(box, look.board));
    }
  }
  for (const c of hole.posts || []) {
    const cyl = new THREE.CylinderGeometry(c.r, c.r, 0.16, 14).toNonIndexed();
    cyl.translate(c.x, 0.08 + holeHeight(hole, c.x, c.y).h, c.y);
    boards.push(shade(cyl, look.post));
  }
  // the cup: a dark disc, the flag
  const cup = new THREE.CircleGeometry(course.phys.cupR, 20).rotateX(-Math.PI / 2).toNonIndexed();
  const ch = holeHeight(hole, hole.cup[0], hole.cup[1]).h;
  cup.translate(hole.cup[0], ch + 0.004, hole.cup[1]);
  dark.push(tint(cup, 0x0b0b0b));
  const flagPole = new THREE.CylinderGeometry(0.006, 0.006, 0.7, 6).toNonIndexed().translate(hole.cup[0] + 0.07, ch + 0.35, hole.cup[1]);
  boards.push(shade(flagPole, 0xffffff));
  // the tee: a rubber mat
  const tee = new THREE.BoxGeometry(0.3, 0.008, 0.3).toNonIndexed().translate(hole.tee[0], 0.004, hole.tee[1]);
  dark.push(tint(tee, 0x1b4b20));
  // the lane's concrete body under the felt, its outline down to the ground
  const body = new THREE.Shape(hole.outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const slab = new THREE.ExtrudeGeometry(body, { depth: 0.9, bevelEnabled: false, curveSegments: 4 }).rotateX(Math.PI / 2).translate(0, -0.006, 0);
  boards.push(shade(slab.toNonIndexed(), look.body));
  // the tube: a half pipe over the narrow channel
  if (hole.tube) {
    const t = hole.tube;
    const pipe = new THREE.CylinderGeometry(t.r + 0.02, t.r + 0.02, t.y1 - t.y0, 14, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 0, (t.y0 + t.y1) / 2);
    boards.push(shade(pipe.toNonIndexed(), 0x8e9aa3));
  }
  // features
  if (hole.loop) {
    const lp = hole.loop;
    const ring = new THREE.TorusGeometry(0.42, 0.035, 8, 40).toNonIndexed();
    ring.rotateY(Math.PI / 2);
    ring.translate(0, 0.45, (lp.y + lp.exitY) / 2);
    boards.push(shade(ring, 0x3fa9f5));
    const ring2 = ring.clone(); ring2.translate(0.16, 0, 0); boards.push(shade(ring2, 0x3fa9f5));
  }
  if (b) {
    const plank = new THREE.BoxGeometry(b.half * 2, 0.05, b.y1 - b.y0, 1, 1, 12).toNonIndexed();
    const pp = plank.attributes.position;
    for (let k = 0; k < pp.count; k++) { const y = pp.getZ(k) + (b.y0 + b.y1) / 2; pp.setY(k, pp.getY(k) + holeHeight(hole, 0, clamp(y, b.y0 + 1e-3, b.y1 - 1e-3)).h - 0.025); }
    plank.translate(0, 0, (b.y0 + b.y1) / 2);
    plank.computeVertexNormals();
    boards.push(shade(plank, 0x2f8f3a));
    const wat = new THREE.PlaneGeometry(x1 - x0, b.y1 - b.y0).rotateX(-Math.PI / 2).toNonIndexed().translate((x0 + x1) / 2, -0.1, (b.y0 + b.y1) / 2);
    water.push(tint(wat, DITCH));
  }
  // (built with z = y along the lane; the group's frame has the lane along −z: mirrored into it, winding kept)
  const matFelt = litMat({ roughness: look.feltRoughness });
  g.add(mesh(flipZ(mergeGeometries(felt.map(plain))), matFelt, false));
  g.add(mesh(flipZ(mergeGeometries(boards.map(plain))), litMat({ roughness: 0.6 }), true));
  g.add(mesh(flipZ(mergeGeometries(dark.map(plain))), litMat({ roughness: 0.9 }), false));
  if (water.length) g.add(mesh(flipZ(mergeGeometries(water.map(plain))), litMat({ roughness: 0.1, metalness: 0.2 }), false));
  // the flag's cloth with the hole's number
  const flag = textPlane([String(i + 1)], 0.22, 0.15, { bg: '#ffd200', fg: '#111', font: '900 600px Inter, Arial, sans-serif', lit: true });
  flag.position.set(hole.cup[0] + 0.18, ch + 0.62, -hole.cup[1]);
  flag.rotation.y = Math.PI / 2;
  g.add(flag);
  // the windmill: its house over the tunnel, the rotor in front
  if (hole.windmill) {
    const wm = hole.windmill;
    const house = shadedBoxes([[0.25, 0.7, wm.depth, -0.37, 0.35, -(wm.y + wm.depth / 2), 0xb5462e], [0.25, 0.7, wm.depth, 0.37, 0.35, -(wm.y + wm.depth / 2), 0xb5462e], [0.9, 0.58, wm.depth, 0, 0.41, -(wm.y + wm.depth / 2), 0xb5462e], [0.9, 0.06, wm.depth + 0.1, 0, 0.73, -(wm.y + wm.depth / 2), 0x5a2a1a]]);
    // (the tunnel: a dark opening in the front face)
    const hm = mesh(house, litMat(), true);
    g.add(hm);
    const hole2 = mesh(tint(new THREE.PlaneGeometry(0.16, 0.12).toNonIndexed(), 0x111111), litMat());
    hole2.position.set(0, 0.06, -wm.y + 0.002);
    g.add(hole2);
    const rotor = new THREE.Group();
    rotor.position.set(0, 0.5, -wm.y + 0.05);
    const bladeGeo = shadedBoxes([[0.1, 0.55, 0.015, 0, 0.3, 0, 0xf2e6c8]]);
    for (let k = 0; k < wm.blades; k++) { const bl = mesh(bladeGeo, litMat()); bl.rotation.z = Math.PI + (k * Math.PI * 2) / wm.blades; rotor.add(bl); }
    g.add(rotor);
    g.userData.rotor = rotor;
  }
  return g;
}

/** Plain attributes only (position, normal, colour): mergeable */
function plain(g) {
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
/** Mirrors a non-indexed geometry in z, keeping its triangles' winding (front faces stay front) */
function flipZ(g) {
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name];
    if (!a) continue;
    for (let i = 0; i < a.count; i++) a.setZ(i, -a.getZ(i));
  }
  for (const a of Object.values(g.attributes)) {
    const arr = a.array, k = a.itemSize;
    for (let t = 0; t + 2 < a.count; t += 3) for (let c = 0; c < k; c++) { const i1 = (t + 1) * k + c, i2 = (t + 2) * k + c; const v = arr[i1]; arr[i1] = arr[i2]; arr[i2] = v; }
    a.needsUpdate = true;
  }
  return g;
}

function createPutter() {
  const g = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.85, 6).translate(0, 0.425, 0), new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.8, roughness: 0.3 }), true);
  const head = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03).translate(0.0, 0.015, 0), new THREE.MeshStandardMaterial({ color: 0x222428, metalness: 0.6, roughness: 0.4 }), true);
  const grip = mesh(new THREE.CylinderGeometry(0.013, 0.012, 0.22, 8).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.8 }), true);
  g.add(shaft, head, grip);
  return g;
}

/** The hockey stick: the shaft up to the hands, the blade flat on the ice */
function createStick() {
  const g = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.05, 6).translate(0, 0.525, 0), new THREE.MeshStandardMaterial({ color: 0xc9a56b, roughness: 0.6 }), true);
  const blade = mesh(new THREE.BoxGeometry(0.26, 0.05, 0.016).translate(0.11, 0.025, 0), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.7 }), true);
  g.add(shaft, blade);
  return g;
}

const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(), _hit = new THREE.Vector3();
/** The game on one course (its physics, lanes and ground in the data; `look` what it is made of and how it is played) */
function minigolfFeature(course, look) {
const minigolf = {
  // (js/missions.js hides the game's own controls while this is true: the whole course: the player stands at the ball, A D aim and Space putts, the putt button stays)
  ownControls: (run) => !!run.state?.game && !run.state.game.done,
  setup(run) {
    const mg = run.mg = { bases: course.holes.map((h, i) => holeBaseY(i, course)), holes: [], aim: 0, power: 0, charging: false, chargeT: 0, drag: null, wait: 0, cam: null, overview: false, blips: new Blips(run.hooks.audio) };
    const g = mg.group = new THREE.Group();
    g.name = look.name;
    run.group.add(g);
    course.holes.forEach((hole, i) => {
      const f = holeFrame(i, course);
      const hg = buildHole(hole, i, course, look);
      hg.position.set(f.x, mg.bases[i], f.z);
      hg.rotation.y = f.heading + Math.PI; // (local +z (= y along) to the lane's direction, local +x to its right)
      g.add(hg);
      mg.holes.push({ frame: f, group: hg });
    });
    // the ball, the putter, the aim dots
    mg.ball = look.ball();
    mg.putter = look.club();
    const dotGeo = new THREE.SphereGeometry(0.018, 8, 6);
    mg.dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicNodeMaterial({ color: 0xffffff }), 12);
    mg.dots.frustumCulled = false;
    g.add(buildPath(course, look), mg.ball, mg.putter, run.storage(mg.dots));
    // HUD: the hole, the strokes, the power bar; the scorecard
    const { hud, big } = hudPanel(run);
    mg.ui = { hud, big, title: el('div', 'sport-flash is-gold'), line: el('div'), card: el('div', 'sport-board') };
    mg.ui.meter = meter();
    const row = el('div', 'sport-row');
    row.append(el('span', null, 'Power'), mg.ui.meter.m);
    hud.append(mg.ui.title, mg.ui.line, row, mg.ui.card);
    run.hints(look.keys);
    // the slingshot: drag from anywhere on the view, the ball goes the other way, the drag's length is the power
    const canvas = document.getElementById('canvas-container');
    run.listen(canvas, 'pointerdown', (e) => { if (!minigolf.ready(run) || e.button !== 0) return; mg.drag = { x: e.clientX, y: e.clientY, id: e.pointerId, power: 0 }; });
    run.listen(window, 'pointermove', (e) => { if (mg.drag && e.pointerId === mg.drag.id) minigolf.dragTo(run, e.clientX, e.clientY); });
    run.listen(window, 'pointerup', (e) => {
      if (!mg.drag || e.pointerId !== mg.drag.id) return;
      const p = mg.drag.power;
      mg.drag = null;
      if (p > 0.04) minigolf.putt(run, p);
    });
    const cm = run.hooks.controllerManager;
    cm.personDriver = (dt) => minigolf.drive(run, dt, cm);
    run.cleanups.push(() => {
      if (cm.personDriver) cm.personDriver = null;
      const p = cm.entities.person;
      p.rig.placed = false;
      p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
      run.hooks.cameraSystem.resetForTeleport?.();
    });
    g.updateMatrixWorld(true);
  },
  reset(run) {
    const mg = run.mg;
    mg.aim = 0; mg.power = 0; mg.charging = false; mg.drag = null; mg.wait = 0; mg.cam = null; mg.lastHole = -1;
    run._sportEdge_up = true;
    touchButton(run, 'up', look.button);
  },
  ready(run) { const g = run.state?.game; return live(run) && g && !g.done && !g.ball.moving && !g.ball.holed; },
  /** World position of a point on the current hole (x across, y along) at the felt's height + `lift` */
  world(run, x, y, lift = 0) {
    const mg = run.mg, g = run.state.game, f = holeFrame(g.hole, course);
    const p = holeToWorld(f, x, y);
    return new THREE.Vector3(p.x, mg.bases[g.hole] + holeHeight(course.holes[g.hole], x, y).h + lift, p.z);
  },
  dragTo(run, cx, cy) {
    const mg = run.mg, g = run.state?.game;
    if (!g) return;
    const cam = run.hooks.cameraSystem.camera;
    // the drag's start and end on the felt's plane: the ball goes from the end towards the start (and beyond)
    const toPlane = (sx, sy) => {
      _ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
      _ray.setFromCamera(_ndc, cam);
      const b = minigolf.world(run, g.ball.x, g.ball.y);
      _plane.set(new THREE.Vector3(0, 1, 0), -b.y);
      return _ray.ray.intersectPlane(_plane, new THREE.Vector3());
    };
    const a = toPlane(mg.drag.x, mg.drag.y), b = toPlane(cx, cy);
    if (!a || !b) return;
    const dx = a.x - b.x, dz = a.z - b.z, L = Math.hypot(dx, dz);
    if (L < 0.03) { mg.drag.power = 0; return; }
    const f = holeFrame(g.hole, course);
    // the world direction to the lane's frame: along (fx, fz), across to the right (rx, rz); aim positive to the left
    const along = dx * f.fx + dz * f.fz, across = dx * f.rx + dz * f.rz;
    mg.aim = Math.atan2(-across, along);
    mg.drag.power = clamp(L / 2.2, 0, 1);
    mg.power = mg.drag.power;
  },
  putt(run, power) {
    const mg = run.mg, g = run.state?.game;
    if (!g || !minigolf.ready(run)) return;
    if (minigolfPutt(g, mg.aim, power)) { mg.blips.click(1.4); mg.power = 0; }
  },
  key(run, e) {
    if (e.code === 'KeyV' && !e.repeat && live(run)) { run.mg.overview = !run.mg.overview; e.preventDefault(); }
  },
  drive(run, dt, cm) {
    const p = cm.entities.person, mg = run.mg, g = run.state?.game;
    p.speed = 0;
    if (!g) return;
    const k = cm.keys;
    if (minigolf.ready(run)) {
      mg.aim += ((+k.left || 0) - (+k.right || 0)) * 0.9 * dt;
      // hold Space (the touch "Putt"): the power swings up and down; let go: the putt
      if (k.up) { mg.charging = true; mg.chargeT += dt; const ph = (mg.chargeT / 1.6) % 2; mg.power = ph < 1 ? ph : 2 - ph; }
      else if (mg.charging) { mg.charging = false; mg.chargeT = 0; if (mg.power > 0.02) minigolf.putt(run, mg.power); }
    } else { mg.charging = false; mg.chargeT = 0; }
    // the player stands beside the ball, facing across the lane (a right-handed putt)
    const hole = course.holes[g.hole];
    const f = holeFrame(g.hole, course);
    const ca = Math.cos(mg.aim), sa = Math.sin(mg.aim);
    // the aim's direction in the lane (x, y) and the player's place: 0.42 m to the left of the line, a little behind
    const dirX = -sa, dirY = ca;
    const bx = g.ball.x, by = g.ball.y;
    const lx = bx - dirY * 0.62 - dirX * 0.05, ly = by + dirX * 0.62 - dirY * 0.05;
    const w = holeToWorld(f, g.ball.moving ? bx - 0.6 : lx, g.ball.moving ? by - 0.8 : ly);
    if (!g.ball.moving) { p.position.x = w.x; p.position.z = w.z; }
    // (on the path beside the lane; on the lane where the target circle reaches out under the feet)
    p.position.y = onLane(hole, lx, ly) ? mg.bases[g.hole] + holeHeight(hole, lx, ly).h : Math.max(groundHeight(p.position.x, p.position.z) + 0.035, mg.bases[g.hole] - 0.4);
    // facing the ball's line: the lane's heading turned by the aim, minus a quarter turn (the ball to the right)
    p.heading = f.heading + mg.aim - Math.PI / 2;
  },
  update(run, ctx, dt) {
    const mg = run.mg, g = run.state?.game;
    if (!g) return;
    // the game: the ball in small steps
    if (live(run)) {
      const h = 1 / 240;
      let n = Math.min(40, Math.round(Math.min(dt, 0.1) / h));
      while (n-- > 0) {
        const ev = minigolfStep(g, h);
        for (const e of ev) {
          if (e === 'wall' || e === 'post') mg.blips.click(0.7);
          else if (e === 'blade') mg.blips.thud(0.8);
          else if (e === 'water') { mg.blips.tone(300, 0.4, { slide: 0.4 }); bigText(run, mg.ui.big, 'In the ditch!', '+1 stroke, back to where it was hit'); }
          else if (e === 'cup') { mg.blips.tone(988, 0.25); mg.blips.tone(1318, 0.4, { delay: 0.12 }); }
          else if (e === 'loop') mg.blips.tone(700, 0.2, { slide: 1.6 });
        }
      }
      if (g.ball.holed) {
        if (!mg.wait) { mg.wait = 1.8; const s = g.strokes[g.hole]; bigText(run, mg.ui.big, strokeName(s, course.holes[g.hole].par), `${s} ${s === 1 ? 'stroke' : 'strokes'}`, 1700); }
        mg.wait -= dt;
        if (mg.wait <= 0) { mg.wait = 0; minigolfNext(g); mg.aim = 0; mg.cam = null; }
      }
    }
    // the windmills turn
    for (let i = 0; i < mg.holes.length; i++) {
      const rotor = mg.holes[i].group.userData.rotor;
      if (rotor) rotor.rotation.z = -windmillAngle(course.holes[i].windmill, g.clock);
    }
    // the HUD
    const hole = course.holes[Math.min(g.hole, course.holes.length - 1)];
    setText(mg.ui.title, `Hole ${g.hole + 1}/${course.holes.length} · ${hole.name} · par ${hole.par}`);
    setText(mg.ui.line, `Stroke ${g.strokes[g.hole] + (g.ball.moving || g.ball.holed ? 0 : 1)} · total ${minigolfTotal(g)}`);
    mg.ui.meter.set(mg.drag ? mg.drag.power : mg.power);
    if (mg.lastHole !== g.hole || mg.lastStrokes !== minigolfTotal(g)) {
      mg.lastHole = g.hole; mg.lastStrokes = minigolfTotal(g);
      mg.ui.card.replaceChildren(...course.holes.flatMap((h, i) => {
        const c = el('span', i === g.hole && !g.done ? 'is-now' : null, `${i + 1}: ${i < g.history.length || i === g.hole ? g.strokes[i] : '–'}`);
        return [c];
      }));
    }
  },
  after(run, ctx, dt) {
    const mg = run.mg, g = run.state?.game;
    mg.ui.hud.hidden = !live(run);
    if (!g || run.phase === 'intro' || run.phase === 'aborted') return;
    const hole = course.holes[g.hole];
    // the ball (in the loop: round the ring)
    let bp;
    if (g.ball.inLoop) {
      const lp = hole.loop, t = g.ball.loopT / course.phys.loopTime, a = t * Math.PI * 2;
      const cy = (lp.y + lp.exitY) / 2;
      bp = minigolfWorldLoop(run, cy - Math.sin(a) * 0.42, 0.45 - Math.cos(a) * 0.42, t);
    } else bp = minigolf.world(run, g.ball.x, g.ball.y, look.ballLift);
    if (g.ball.holed && g.ball.x === hole.cup[0]) bp.y -= 0.03;
    mg.ball.position.copy(bp);
    // the putter: behind the ball along the aim, swung back with the power while charging
    const f = holeFrame(g.hole, course);
    const dirX = -Math.sin(mg.aim), dirY = Math.cos(mg.aim);
    const back = 0.04 + (mg.charging || mg.drag ? mg.power * 0.3 : 0);
    const ph = minigolf.world(run, g.ball.x - dirX * back, g.ball.y - dirY * back);
    mg.putter.visible = !g.ball.moving && !g.ball.holed;
    mg.putter.position.copy(ph);
    // the shaft up to the player's hands (beside the ball, at the hips' height)
    const person = run.hooks.controllerManager.entities.person.position;
    _hit.set(person.x + (ph.x - person.x) * 0.3, person.y + 0.82, person.z + (ph.z - person.z) * 0.3).sub(ph).normalize();
    mg.putter.quaternion.setFromUnitVectors(_vUp, _hit);
    mg.putter.rotateY(f.heading + mg.aim + Math.PI / 2);
    // the aim dots: along the line, as far as the power reaches
    const m4 = new THREE.Matrix4();
    const show = minigolf.ready(run);
    const reach = 0.3 + 2.4 * (mg.drag ? mg.drag.power : mg.charging ? mg.power : 0.35);
    for (let k = 0; k < 12; k++) {
      const d = ((k + 1) / 12) * reach;
      const q = minigolf.world(run, g.ball.x + dirX * d, g.ball.y + dirY * d, 0.02);
      m4.makeTranslation(q.x, q.y, q.z);
      if (!show) m4.makeScale(0, 0, 0);
      mg.dots.setMatrixAt(k, m4);
    }
    mg.dots.instanceMatrix.needsUpdate = true;
    // the camera: behind the ball along the aim (following it while it rolls), or over the whole lane (V)
    const cam = ctx.camera;
    let pos, target;
    if (mg.overview) {
      const mid = minigolf.world(run, hole.width > 2 ? Math.sign(hole.cup[0] || 1) * (hole.width / 2 - 0.5) : 0, hole.length / 2);
      pos = mid.clone().add(new THREE.Vector3(-f.fx * 2, Math.max(hole.length, hole.width) * 0.95, -f.fz * 2));
      target = mid;
    } else {
      const ball = mg.ball.position;
      const vx = g.ball.moving ? g.ball.vx : dirX, vy = g.ball.moving ? g.ball.vy : dirY;
      const vl = Math.hypot(vx, vy) || 1;
      const ux = vx / vl, uy = vy / vl;
      const wx = f.rx * ux + f.fx * uy, wz = f.rz * ux + f.fz * uy;
      // (behind the ball and a little to the right: the player stands on its left)
      pos = new THREE.Vector3(ball.x - wx * 2.4 - wz * 0.75, ball.y + 1.75, ball.z - wz * 2.4 + wx * 0.75);
      target = new THREE.Vector3(ball.x + wx * 1.6, ball.y, ball.z + wz * 1.6);
    }
    if (!mg.cam) mg.cam = { pos: pos.clone(), look: target.clone() };
    const k = 1 - Math.exp(-dt * (g.ball.moving ? 3 : 6));
    mg.cam.pos.lerp(pos, k); mg.cam.look.lerp(target, k);
    cam.position.copy(mg.cam.pos);
    cam.lookAt(mg.cam.look);
    cam.updateMatrixWorld();
  }
};
return minigolf;
}
const minigolf = minigolfFeature(WALDHUUS_COURSE, {
  name: 'MinigolfWaldhuus', felt: FELT, feltRoughness: 0.95, board: BOARD_COL, post: 0xd43b2a, body: 0xa8a39a, path: 0xd8d2c6, pathAcross: 6,
  ball: () => mesh(new THREE.SphereGeometry(MINIGOLF.ballR, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.35 }), true),
  ballLift: MINIGOLF.ballR, club: createPutter, button: 'Putt',
  keys: [[['A', 'D'], 'aim'], [['Space'], 'hold, let go to putt'], [['Drag'], 'back from the ball and let go'], [['V'], 'overview']]
});
// Eis-Minigolf on the Arkadenplatz: the same game on rink ice between wooden boards, with a stick and a black puck
const iceMinigolf = minigolfFeature(ARKADENPLATZ_COURSE, {
  name: 'IceMinigolfArkadenplatz', felt: 0xdcebf4, feltRoughness: 0.25, board: 0xb98a55, post: 0x2b6fb3, body: 0xe6eef2, path: 0xeef5f9, pathAcross: 24,
  ball: () => mesh(new THREE.CylinderGeometry(ICE_MINIGOLF.ballR, ICE_MINIGOLF.ballR, 0.025, 20), new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.5 }), true),
  ballLift: 0.0125, club: createStick, button: 'Shoot',
  keys: [[['A', 'D'], 'aim'], [['Space'], 'hold, let go to shoot'], [['Drag'], 'back from the puck and let go'], [['V'], 'overview']]
});
function minigolfWorldLoop(run, y, h, t) {
  const g = run.state.game, f = holeFrame(g.hole, g.course);
  const p = holeToWorld(f, 0.08 * t, y);
  return new THREE.Vector3(p.x, run.mg.bases[g.hole] + h + MINIGOLF.ballR, p.z);
}

// =====================================================================================================================
// 3. Darts in The Green Wildman
// =====================================================================================================================
const PUB = { w: 8, d: 9, h: 3.1 };
// The board on the back wall (z = −d/2), its centre at BOARD.height; the oche 2.37 m out from its face; the camera a
// little behind and above the thrower's eye, closer than the oche so that the board fills the view
const BOARD_Z = -PUB.d / 2 + 0.06;

function boardTexture() {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = 0.225; // m: the canvas' half width (the board with its number ring)
  const px = (m) => (m / R) * (S / 2);
  g.translate(S / 2, S / 2);
  g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, S / 2, 0, Math.PI * 2); g.fill();
  const ring = (r0, r1, colA, colB) => {
    for (let i = 0; i < 20; i++) {
      const a0 = ((i * 18 - 9 - 90) * Math.PI) / 180, a1 = ((i * 18 + 9 - 90) * Math.PI) / 180;
      g.fillStyle = i % 2 ? colB : colA;
      g.beginPath(); g.arc(0, 0, px(r1), a0, a1); g.arc(0, 0, px(r0), a1, a0, true); g.closePath(); g.fill();
    }
  };
  ring(BOARD.trebleOut, BOARD.doubleIn, '#151515', '#efe3c4');
  ring(BOARD.outerBull, BOARD.trebleIn, '#151515', '#efe3c4');
  ring(BOARD.doubleIn, BOARD.doubleOut, '#d62a2a', '#1f8f3e');
  ring(BOARD.trebleIn, BOARD.trebleOut, '#d62a2a', '#1f8f3e');
  g.fillStyle = '#1f8f3e'; g.beginPath(); g.arc(0, 0, px(BOARD.outerBull), 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d62a2a'; g.beginPath(); g.arc(0, 0, px(BOARD.bull), 0, Math.PI * 2); g.fill();
  // the wires
  g.strokeStyle = 'rgba(200,200,205,.85)'; g.lineWidth = 2;
  for (const r of [BOARD.bull, BOARD.outerBull, BOARD.trebleIn, BOARD.trebleOut, BOARD.doubleIn, BOARD.doubleOut]) { g.beginPath(); g.arc(0, 0, px(r), 0, Math.PI * 2); g.stroke(); }
  for (let i = 0; i < 20; i++) {
    const a = ((i * 18 - 9 - 90) * Math.PI) / 180;
    g.beginPath(); g.moveTo(Math.cos(a) * px(BOARD.outerBull), Math.sin(a) * px(BOARD.outerBull)); g.lineTo(Math.cos(a) * px(BOARD.doubleOut), Math.sin(a) * px(BOARD.doubleOut)); g.stroke();
  }
  // the numbers
  g.fillStyle = '#f4f4f4'; g.font = `bold ${Math.round(px(0.022))}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  SECTORS.forEach((n, i) => { const a = ((i * 18 - 90) * Math.PI) / 180; g.fillText(String(n), Math.cos(a) * px(0.195), Math.sin(a) * px(0.195)); });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function chalkTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 640;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas: c, tex };
}
function drawChalk(ch, game) {
  const g = ch.canvas.getContext('2d'), W = ch.canvas.width, H = ch.canvas.height;
  g.fillStyle = '#1d2420'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 18; g.strokeRect(9, 9, W - 18, H - 18);
  g.fillStyle = '#eef0e8'; g.textAlign = 'center';
  g.font = 'bold 54px "Comic Sans MS", "Chalkboard", sans-serif';
  g.fillText('301', W / 2, 80);
  g.font = 'bold 120px "Comic Sans MS", "Chalkboard", sans-serif';
  g.fillText(String(game ? game.remaining : 301), W / 2, 210);
  g.font = '34px "Comic Sans MS", "Chalkboard", sans-serif';
  const log = game ? game.log.slice(-8) : [];
  log.forEach((l, i) => g.fillText(l.bust ? 'bust' : String(l.total), W / 2, 290 + i * 40));
  g.font = '26px "Comic Sans MS", "Chalkboard", sans-serif';
  g.fillText(game ? `darts: ${game.darts}` : 'game on', W / 2, H - 40);
  ch.tex.needsUpdate = true;
}

function createDart() {
  const g = new THREE.Group();
  const barrel = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0, 0.035), new THREE.MeshBasicNodeMaterial({ color: 0xb9c0c8 }));
  const shaft = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.04, 6).rotateX(Math.PI / 2).translate(0, 0, 0.08), new THREE.MeshBasicNodeMaterial({ color: 0x222222 }));
  const point = mesh(new THREE.ConeGeometry(0.0015, 0.025, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.0005), new THREE.MeshBasicNodeMaterial({ color: 0xdddddd }));
  const flight = new THREE.Group();
  const fm = new THREE.MeshBasicNodeMaterial({ color: 0x1e9e4a, side: THREE.DoubleSide });
  for (const r of [0, Math.PI / 2]) { const f = mesh(new THREE.PlaneGeometry(0.03, 0.028).translate(0, 0, 0.0).rotateY(Math.PI / 2), fm); f.rotation.z = r; f.position.z = 0.108; flight.add(f); }
  g.add(barrel, shaft, point, flight);
  return g;
}

function buildPub(group, parts) {
  const hw = PUB.w / 2, hd = PUB.d / 2;
  const wood = 0x4a2c1a, green = 0x1f4a33;
  const room = [
    [PUB.w, 0.1, PUB.d, 0, -0.05, 0, 0x3a2416], // the floor boards
    [PUB.w, PUB.h, 0.2, 0, PUB.h / 2, -hd - 0.1, green],
    [PUB.w, PUB.h, 0.2, 0, PUB.h / 2, hd + 0.1, green],
    [0.2, PUB.h, PUB.d, -hw - 0.1, PUB.h / 2, 0, green],
    [0.2, PUB.h, PUB.d, hw + 0.1, PUB.h / 2, 0, green],
    [PUB.w, 0.2, PUB.d, 0, PUB.h + 0.1, 0, 0x2a1a10],
    // wood panelling below the dado rail
    [PUB.w, 1.0, 0.04, 0, 0.5, -hd + 0.02, wood], [0.04, 1.0, PUB.d, -hw + 0.02, 0.5, 0, wood], [0.04, 1.0, PUB.d, hw - 0.02, 0.5, 0, wood],
    [PUB.w, 0.06, 0.06, 0, 1.02, -hd + 0.03, 0x2a1a10],
    // beams across the ceiling
    ...[-3, -1, 1, 3].map((z) => [PUB.w, 0.22, 0.2, 0, PUB.h - 0.11, z, 0x2a1a10]),
    // the bar counter along the right wall, its brass rail, the back bar with the bottles' shelves
    [0.7, 1.08, 5.0, hw - 1.6, 0.54, 0.8, wood], [0.82, 0.06, 5.1, hw - 1.6, 1.11, 0.8, 0x2a1a10], [0.04, 0.04, 5.0, hw - 2.0, 0.22, 0.8, 0xc9a24a],
    [0.4, 2.2, 5.0, hw - 0.2, 1.1, 0.8, 0x2a1a10], [0.36, 0.03, 4.8, hw - 0.25, 1.35, 0.8, 0x6b4a2a], [0.36, 0.03, 4.8, hw - 0.25, 1.75, 0.8, 0x6b4a2a],
    // the taps
    ...[-0.3, 0, 0.3, 0.6].map((z) => [0.06, 0.32, 0.06, hw - 1.75, 1.3, 0.8 + z, 0xc9a24a]),
    // tables and stools on the left
    ...[[-2.6, 1.6], [-2.6, 3.4], [-0.6, 3.2]].flatMap(([x, z]) => [[0.9, 0.05, 0.9, x, 0.74, z, wood], [0.08, 0.72, 0.08, x, 0.36, z, 0x2a1a10], [0.36, 0.05, 0.36, x + 0.7, 0.46, z, 0x6b2a1a], [0.36, 0.05, 0.36, x - 0.7, 0.46, z, 0x6b2a1a]]),
    // the board's cabinet and the surround on the back wall
    [0.95, 0.95, 0.06, -1.4, BOARD.height, -hd + 0.03, 0x2a1a10],
    // the oche: a brass strip on the floor 2.37 m out
    [0.62, 0.012, 0.04, -1.4, 0.006, BOARD_Z + BOARD.oche, 0xc9a24a],
    // the window at the front with the Promenade's dusk
    [3.2, 1.5, 0.04, -1.2, 1.7, hd - 0.02, 0x3c5d7a]
  ];
  group.add(mesh(shadedBoxes(room), unlit()));
  // the bottles on the back bar (small coloured boxes)
  const bottles = [];
  const cols = [0x2e6b2a, 0x7a3b12, 0xd8c47a, 0x3a1a0a, 0xa8d0e0, 0x5a1020];
  for (let i = 0; i < 26; i++) { const shelf = i % 2, z = -1.5 + (i >> 1) * 0.36; bottles.push([0.07, 0.26, 0.07, hw - 0.25, 1.5 + shelf * 0.4, 0.8 + z, cols[i % cols.length]]); }
  group.add(mesh(shadedBoxes(bottles), unlit()));
  // the board: its face (a disc with the texture), the black number ring round it
  const face = mesh(new THREE.CircleGeometry(0.225, 72), new THREE.MeshBasicNodeMaterial({ map: boardTexture() }));
  face.position.set(-1.4, BOARD.height, BOARD_Z + 0.004);
  group.add(face);
  parts.board = face;
  // the light over the board
  const lamp = shadedBoxes([[0.5, 0.06, 0.25, -1.4, BOARD.height + 0.62, -hd + 0.3, 0x15171c]]);
  group.add(mesh(lamp, unlit()));
  const glow = mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicNodeMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.08, depthWrite: false }));
  glow.position.set(-1.4, BOARD.height + 0.1, BOARD_Z + 0.03);
  group.add(glow);
  // the chalk scoreboard beside it
  const chalk = chalkTexture();
  const board2 = mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshBasicNodeMaterial({ map: chalk.tex }));
  board2.position.set(-0.45, BOARD.height - 0.05, -hd + 0.04);
  group.add(board2);
  parts.chalk = chalk;
  // the pub's name over the bar, the shamrock green
  const sign = textPlane(['THE GREEN WILDMAN'], 3.2, 0.42, { bg: '#123222', fg: '#e8c76a', font: '900 120px Georgia, serif' });
  sign.position.set(hw - 0.06, 2.62, 0.8); sign.rotation.y = -Math.PI / 2;
  group.add(sign);
  const flag = textPlane(['DARTS · 301'], 1.4, 0.3, { bg: '#1e9e4a', fg: '#fff', font: '900 140px Inter, Arial, sans-serif' });
  flag.position.set(-1.4, BOARD.height + 0.85, -hd + 0.05);
  group.add(flag);
}

const _proj = new THREE.Vector3();
const darts = {
  // (js/missions.js hides the game's own controls while this is true: at the oche; the walk to the door keeps them)
  ownControls: (run) => !!run.dd?.interior,
  setup(run) {
    addStyle(run);
    const dd = run.dd = { interior: null, aim: { x: 0, y: fieldCentreY(20, 3) }, charge: 0, charging: false, chargeT: 0, steadyT: 0, t: 0, flights: [], stuck: [], wait: 0, keys: { up: 0, down: 0, left: 0, right: 0 }, blips: new Blips(run.hooks.audio), rand: Math.random };
    const { hud, big } = hudPanel(run);
    dd.ui = { hud, big, title: el('div', 'sport-flash is-gold'), line: el('div'), flash: el('div', 'sport-flash'), meter: meter(DART.ideal - DART.band / 2, DART.ideal + DART.band / 2) };
    const row = el('div', 'sport-row');
    row.append(el('span', null, 'Throw'), dd.ui.meter.m);
    hud.append(dd.ui.title, dd.ui.line, row, dd.ui.flash);
    run.hints([[['Mouse', 'W', 'A', 'S', 'D'], 'aim'], [['Space', 'Click'], 'hold, let go in the green']]);
    hud.hidden = true;
    const cross = el('div', 'sport-cross');
    cross.hidden = true;
    document.body.append(cross);
    run.cleanups.push(() => cross.remove());
    dd.ui.cross = cross;
    // pointer: aim where it points (the board's plane); a press winds up (mouse), a swipe up throws (touch)
    const canvas = document.getElementById('canvas-container');
    let touch = null;
    run.listen(canvas, 'pointermove', (e) => {
      if (!dd.interior) return;
      if (e.pointerType === 'touch') {
        if (!touch || e.pointerId !== touch.id) return;
        touch.trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (touch.trail.length > 12) touch.trail.shift();
        // (aim follows the finger while it moves slowly; a fast flick is the throw)
        const last = touch.trail[touch.trail.length - 2];
        if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 14) darts.aimAt(run, e.clientX, e.clientY - 60);
        return;
      }
      darts.aimAt(run, e.clientX, e.clientY);
    });
    run.listen(canvas, 'pointerdown', (e) => {
      if (!dd.interior || !darts.canThrow(run)) return;
      if (e.pointerType === 'touch') { touch = { id: e.pointerId, trail: [{ x: e.clientX, y: e.clientY, t: performance.now() }] }; darts.aimAt(run, e.clientX, e.clientY - 60); return; }
      if (e.button === 0) { dd.charging = true; dd.chargeT = 0; }
    });
    run.listen(window, 'pointerup', (e) => {
      if (!dd.interior) return;
      if (e.pointerType === 'touch') {
        if (!touch || e.pointerId !== touch.id) return;
        const tr = touch.trail, now = performance.now();
        touch = null;
        const from = tr.find((p) => now - p.t < 160) || tr[0];
        const dy = from.y - e.clientY, dtm = Math.max(16, now - from.t);
        const v = (dy / dtm) * 1000; // px/s upwards
        if (dy > 40 && v > 500) darts.throw(run, clamp(v / 3600, 0, 1));
        return;
      }
      if (dd.charging) { dd.charging = false; darts.throw(run, dd.charge); }
    });
  },
  reset(run) {
    const dd = run.dd;
    dd.interior?.dispose(); dd.interior = null;
    dd.ui.hud.hidden = true; dd.ui.cross.hidden = true;
    dd.flights.length = 0; dd.stuck.length = 0; dd.wait = 0; dd.charging = false; dd.charge = 0;
    dd.aim = { x: 0, y: fieldCentreY(20, 3) };
    if (run.state) { run.state.game = null; run.state.inside = false; }
  },
  teardown(run) { run.dd.interior?.dispose(); run.dd.interior = null; },
  canThrow(run) { const dd = run.dd, g = run.state?.game; return live(run) && g && !g.done && !dd.flights.length && dd.wait <= 0 && g.darts < DART.maxDarts; },
  /** The board point (m from its centre, y up) under a screen point */
  aimAt(run, sx, sy) {
    const dd = run.dd;
    if (!dd.interior) return;
    const cam = run.hooks.cameraSystem.camera;
    _ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    _ray.setFromCamera(_ndc, cam);
    const o = dd.interior.origin;
    _plane.set(new THREE.Vector3(0, 0, 1), -(o.z + BOARD_Z));
    if (!_ray.ray.intersectPlane(_plane, _hit)) return;
    const nx = clamp(_hit.x - (o.x - 1.4), -0.24, 0.24), ny = clamp(_hit.y - (o.y + BOARD.height), -0.24, 0.24);
    if (Math.hypot(nx - dd.aim.x, ny - dd.aim.y) > 0.002) dd.steadyT = 0;
    dd.aim.x = nx; dd.aim.y = ny;
  },
  throw(run, power) {
    const dd = run.dd, g = run.state?.game;
    if (!darts.canThrow(run)) return;
    const sway = swayAt(dd.t, Math.min(1, dd.steadyT / 1.2));
    const hit = throwDart({ x: dd.aim.x, y: dd.aim.y }, sway, power, dd.rand);
    const res = scoreDart(hit.x, hit.y);
    const dart = createDart();
    dd.interior.group.add(dart);
    dd.flights.push({ mesh: dart, t: 0, hit, res, power });
    dd.charge = 0; dd.steadyT = 0;
    void g;
  },
  enter(run) {
    const dd = run.dd;
    const parts = dd.parts = {};
    const spots = [{ x: 2.2, z: 1.4, yaw: Math.PI / 2 }, { x: 2.3, z: 0.2, yaw: Math.PI / 2 + 0.3 }, { x: -2.0, z: 1.8, yaw: Math.PI }, { x: -3.2, z: 3.0, yaw: 0.9 }, { x: -0.1, z: 1.6, yaw: Math.PI - 0.6 }, { x: 0.6, z: 3.6, yaw: -2.6 }];
    const crowd = dd.crowd = makeCrowd(spots, { selfLit: true, tintRGB: [0.62, 0.52, 0.42] });
    dd.interior = new Interior(run, run.def.interior.door, (g) => { buildPub(g, parts); for (const m of crowd.crowd.meshes) g.add(m); });
    for (const p of crowd.people) p.rig.reset(p.x, p.z, p.yaw, () => 0);
    dd.game = createX01(301);
    run.state.game = dd.game;
    run.state.inside = true;
    drawChalk(parts.chalk, dd.game);
    dd.ui.hud.hidden = false;
    dd.ui.cross.hidden = false;
    run._sportEdge_up = true;
  },
  key(run, e) {
    const dd = run.dd;
    if (!dd.interior) return;
    const k = e.code;
    const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    const dir = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' }[k];
    if (dir) { take(); dd.keys[dir] = 1; return; }
    if (k === 'Space' || (k === 'Enter' && run.phase !== 'intro')) { take(); if (!e.repeat && darts.canThrow(run)) { dd.charging = true; dd.chargeT = 0; } }
  },
  update(run, ctx, dt) {
    const dd = run.dd;
    if (!dd.interior && run.index >= 1 && live(run)) {
      darts.enter(run);
      if (!dd.keyup) {
        dd.keyup = (e) => {
          const dir = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' }[e.code];
          if (dir) dd.keys[dir] = 0;
          if ((e.code === 'Space' || e.code === 'Enter') && dd.charging) { dd.charging = false; darts.throw(run, dd.charge); }
        };
        run.listen(window, 'keyup', dd.keyup, { capture: true });
      }
    }
    const g = run.state?.game;
    if (!dd.interior || !g) return;
    dd.t += dt;
    dd.steadyT += dt;
    // keys move the aim
    const mx = dd.keys.right - dd.keys.left, my = dd.keys.up - dd.keys.down;
    if (mx || my) { dd.aim.x = clamp(dd.aim.x + mx * 0.09 * dt, -0.24, 0.24); dd.aim.y = clamp(dd.aim.y + my * 0.09 * dt, -0.24, 0.24); dd.steadyT = 0; }
    // the wind-up: 0 → 1 in 0.9 s, then back down
    if (dd.charging) { dd.chargeT += dt; const ph = (dd.chargeT / 0.9) % 2; dd.charge = ph < 1 ? ph : 2 - ph; }
    dd.ui.meter.set(dd.charge);
    // the darts in flight: 0.32 s from the hand to the board
    for (let i = dd.flights.length - 1; i >= 0; i--) {
      const f = dd.flights[i];
      f.t += dt / 0.32;
      if (f.t >= 1) {
        dd.flights.splice(i, 1);
        const r = x01Dart(g, f.res);
        dd.blips.thud(0.9);
        if (f.res.score > 0) dd.stuck.push(f.mesh); else { f.mesh.removeFromParent(); disposeTree(f.mesh); }
        const flashTxt = r.result === 'bust' ? ['BUST', 'is-bad'] : r.result === 'checkout' ? [`Game shot! ${f.res.label}`, 'is-gold'] : [f.res.label === 'Miss' ? 'Miss' : `${f.res.label} · ${f.res.score}`, f.res.mult === 3 || f.res.num === 25 ? 'is-gold' : f.res.score ? 'is-good' : 'is-bad'];
        dd.ui.flash.textContent = flashTxt[0]; dd.ui.flash.className = `sport-flash ${flashTxt[1]}`;
        if (r.result === 'bust') bigText(run, dd.ui.big, 'BUST', `back to ${g.remaining}`, 1300);
        if (f.res.mult === 3 && f.res.num === 20) bigText(run, dd.ui.big, 'T20!', '', 700);
        drawChalk(dd.parts.chalk, g);
        if (r.turnOver && !g.done) dd.wait = 1.3;
        else if (f.res.score === 0 && f.mesh.parent) { /* (a miss falls) */ }
        if (f.res.score > 0) placeDart(run, f.mesh, f.hit, 1);
      } else placeDart(run, f.mesh, f.hit, f.t);
    }
    if (dd.wait > 0) {
      dd.wait -= dt;
      if (dd.wait <= 0) { for (const m of dd.stuck) { m.removeFromParent(); disposeTree(m); } dd.stuck.length = 0; }
    }
    setText(dd.ui.title, `301 double out · ${g.remaining} left`);
    setText(dd.ui.line, `Dart ${Math.min(DART.maxDarts, g.darts + 1)} of ${DART.maxDarts} · turn ${Math.floor(g.darts / 3) + 1}, dart ${(g.darts % 3) + 1}`);
  },
  after(run, ctx, dt) {
    const dd = run.dd;
    if (!live(run)) { dd.ui.hud.hidden = true; dd.ui.cross.hidden = true; }
    if (!dd.interior || run.phase === 'aborted') return;
    // the camera: from the oche's side, a little closer than the thrower, the board centred
    const cam = ctx.camera;
    const portrait = window.innerHeight > window.innerWidth;
    const dist = portrait ? 1.55 : 1.05;
    dd.interior.camera(cam, { x: -1.4 + 0.05, y: BOARD.height + 0.02, z: BOARD_Z + dist }, { x: -1.4, y: BOARD.height - (portrait ? 0.02 : 0.0), z: BOARD_Z });
    // the regulars
    poseCrowd(dd.crowd, dt, () => 0, 0);
    // the crosshair: the aim plus the sway, on screen
    const sw = swayAt(dd.t, Math.min(1, dd.steadyT / 1.2));
    const o = dd.interior.origin;
    _proj.set(o.x - 1.4 + dd.aim.x + sw.x, o.y + BOARD.height + dd.aim.y + sw.y, o.z + BOARD_Z).project(cam);
    const c = dd.ui.cross;
    c.style.left = `${((_proj.x + 1) / 2) * window.innerWidth}px`;
    c.style.top = `${((1 - _proj.y) / 2) * window.innerHeight}px`;
    c.hidden = !darts.canThrow(run) || !live(run);
  }
};
const fieldCentreY = (num, mult) => (num === 20 && mult === 3 ? (BOARD.trebleIn + BOARD.trebleOut) / 2 : 0); // (T20: straight up)
/** A dart along its flight (t 0-1: from the hand to the board), stuck in the board at t = 1 */
function placeDart(run, dart, hit, t) {
  // (in the room's own frame: the darts are children of its group)
  const tx = -1.4 + hit.x, ty = BOARD.height + hit.y, tz = BOARD_Z + 0.004;
  const sx = -1.4 + 0.18, sy = BOARD.height - 0.18, sz = BOARD_Z + 1.0;
  const e = t;
  dart.position.set(sx + (tx - sx) * e, sy + (ty - sy) * e + Math.sin(Math.PI * e) * 0.08, sz + (tz - sz) * e);
  dart.rotation.set(-0.12 * (1 - e) + 0.05, 0.08, 0);
  const off = Math.hypot(hit.x, hit.y) > BOARD.doubleOut + 0.05;
  dart.visible = !(t >= 1 && off);
}

/** An interior: built at the door (high above it), entered with a fade, disposed with the run */
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
    setTimeout(() => { this.fade?.remove(); this.fade = null; }, 900);
    document.body.classList.add('sport-indoor');
    const cm = run.hooks.controllerManager;
    this.hadDriver = 'personDriver' in cm;
    this.prevDriver = cm.personDriver;
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; }; // (the walker waits at the door)
    this.snow = run.scene.getObjectByName('snowfall');
  }
  camera(cam, pos, look) {
    const o = this.origin;
    cam.position.set(o.x + pos.x, o.y + pos.y, o.z + pos.z);
    cam.lookAt(o.x + look.x, o.y + look.y, o.z + look.z);
    cam.updateMatrixWorld();
    if (this.snow) this.snow.visible = false;
  }
  dispose() {
    if (!this.group) return;
    this.group.removeFromParent();
    disposeTree(this.group);
    this.group = null;
    this.fade?.remove(); this.fade = null;
    document.body.classList.remove('sport-indoor');
    const cm = this.run.hooks.controllerManager;
    if (this.hadDriver) cm.personDriver = this.prevDriver ?? null; else delete cm.personDriver;
    if (this.snow) this.snow.visible = true;
    this.run.hooks.cameraSystem.resetForTeleport?.();
  }
}

// =====================================================================================================================
// 4. The Schüssla
// =====================================================================================================================
const CONCRETE = 0xa9a6a0, COPING = 0xd8dde3;

function bowlDeckY() {
  let m = -Infinity;
  const ex = BOWL.fa + BOWL.R + BOWL.deck, ez = BOWL.fb + BOWL.R + BOWL.deck;
  for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) { const p = bowlToWorld((i / 4) * ex, (k / 4) * ez); m = Math.max(m, groundHeight(p.x, p.z)); }
  return m + BOWL.R + 0.35;
}

/** The bowl in its own frame (x along, z across, y from the deck): floor, transitions, coping, deck, walls */
function buildBowl() {
  const g = new THREE.Group();
  const parts = [];
  // the floor's edge, walked round: N points with their outward normals (the rounded rectangle)
  const edge = [];
  const ax = BOWL.fa - BOWL.fc, az = BOWL.fb - BOWL.fc;
  const corner = (cx, cz, a0) => { for (let k = 0; k <= 8; k++) { const a = a0 + (k / 8) * (Math.PI / 2); edge.push({ x: cx + Math.cos(a) * BOWL.fc, z: cz + Math.sin(a) * BOWL.fc, nx: Math.cos(a), nz: Math.sin(a) }); } };
  const side = (x0, z0, x1, z1, nx, nz, n) => { for (let k = 1; k < n; k++) { const t = k / n; edge.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, nx, nz }); } };
  corner(ax, az, 0); side(ax, BOWL.fb, -ax, BOWL.fb, 0, 1, 10);
  corner(-ax, az, Math.PI / 2); side(-BOWL.fa, az, -BOWL.fa, -az, -1, 0, 4);
  corner(-ax, -az, Math.PI); side(-ax, -BOWL.fb, ax, -BOWL.fb, 0, -1, 10);
  corner(ax, -az, Math.PI * 1.5); side(BOWL.fa, -az, BOWL.fa, az, 1, 0, 4);
  // the transition: rings from the floor's edge (θ = 0) up to the coping (θ = π/2)
  const RINGS = 10, n = edge.length;
  const pos = [];
  const ringPt = (e, th) => [e.x + e.nx * BOWL.R * Math.sin(th), BOWL.R * (1 - Math.cos(th)) - BOWL.R, e.z + e.nz * BOWL.R * Math.sin(th)];
  for (let r = 0; r < RINGS; r++) {
    const t0 = (r / RINGS) * Math.PI / 2, t1 = ((r + 1) / RINGS) * Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a = edge[i], b = edge[(i + 1) % n];
      const p00 = ringPt(a, t0), p01 = ringPt(b, t0), p10 = ringPt(a, t1), p11 = ringPt(b, t1);
      pos.push(...p00, ...p01, ...p10, ...p01, ...p11, ...p10); // (facing into the bowl)
    }
  }
  const trans = new THREE.BufferGeometry();
  trans.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  trans.computeVertexNormals();
  parts.push(tint(trans, CONCRETE));
  // the floor
  const sh = new THREE.Shape();
  edge.forEach((e, i) => (i ? sh.lineTo(e.x, -e.z) : sh.moveTo(e.x, -e.z)));
  const floor = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, -BOWL.R, 0);
  parts.push(tint(floor, 0x9e9b95));
  // the deck: the outer rectangle with the rim cut out
  const ox = BOWL.fa + BOWL.R + BOWL.deck, oz = BOWL.fb + BOWL.R + BOWL.deck;
  const deck = new THREE.Shape();
  deck.moveTo(-ox, -oz); deck.lineTo(ox, -oz); deck.lineTo(ox, oz); deck.lineTo(-ox, oz); deck.closePath();
  const hole = new THREE.Path();
  edge.forEach((e, i) => { const p = ringPt(e, Math.PI / 2); (i ? hole.lineTo(p[0], -p[2]) : hole.moveTo(p[0], -p[2])); });
  deck.holes.push(hole);
  parts.push(tint(new THREE.ShapeGeometry(deck).rotateX(-Math.PI / 2), 0xb3b0aa));
  // the walls of the raised block (down to below the ground) and a staircase on one end
  for (const [w, d, x, z] of [[2 * ox, 0.3, 0, oz], [2 * ox, 0.3, 0, -oz], [0.3, 2 * oz, ox, 0], [0.3, 2 * oz, -ox, 0]]) {
    parts.push(shade(new THREE.BoxGeometry(w, 6, d).translate(x, -3.0, z), 0x8f8c86));
  }
  for (let k = 0; k < 8; k++) parts.push(shade(new THREE.BoxGeometry(1.4, 0.32, 0.34).translate(-ox - 0.6 - k * 0.34 * 0.0, -0.16 - k * 0.32, -oz + 1.2 + k * 0.34), 0x8f8c86));
  // (no quarterpipes: the real pad is just the bowl and a narrow deck; the pump track lies east of it)
  g.add(mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => { if (!p.attributes.normal) p.computeVertexNormals(); if (!p.attributes.color) tint(p, CONCRETE); for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'color'].includes(k)) p.deleteAttribute(k); return p; })), litMat({ roughness: 0.92 }), true));
  // the coping: a steel pipe round the rim
  const rim = edge.map((e) => { const p = ringPt(e, Math.PI / 2); return new THREE.Vector3(p[0] + e.nx * 0.03, -0.03, p[2] + e.nz * 0.03); });
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 160, 0.035, 8, true);
  g.add(mesh(tube, new THREE.MeshStandardMaterial({ color: COPING, metalness: 0.85, roughness: 0.3 }), true));
  // a painted name on the deck
  const name = textPlane(['SCHÜSSLA'], 4.2, 0.9, { bg: 'rgba(0,0,0,0)', fg: '#ff4fd8', font: '900 200px Inter, Arial, sans-serif', lit: false });
  name.rotation.x = -Math.PI / 2;
  name.rotation.z = Math.PI;
  name.scale.setScalar(0.55);
  name.position.set(0, 0.01, oz - 0.45);
  g.add(name);
  return g;
}

function createSkateboard() {
  const g = new THREE.Group();
  const deck = mesh(new THREE.BoxGeometry(0.21, 0.018, 0.8).translate(0, 0.075, 0), new THREE.MeshStandardMaterial({ color: 0x9b5cff, roughness: 0.6 }), true);
  const grip = mesh(new THREE.BoxGeometry(0.205, 0.004, 0.78).translate(0, 0.086, 0), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 }), false);
  const wheelGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.032, 10).rotateZ(Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ color: 0xf2f2e6, roughness: 0.5 });
  g.add(deck, grip);
  for (const z of [-0.27, 0.27]) for (const x of [-0.085, 0.085]) { const w = mesh(wheelGeo, wm); w.position.set(x, 0.028, z); g.add(w); }
  return g;
}

const _qTilt = new THREE.Quaternion(), _qB = new THREE.Quaternion(), _vT = new THREE.Vector3(), _vN = new THREE.Vector3(), _vUp = new THREE.Vector3(0, 1, 0), _piv = new THREE.Vector3();
/** Tilts a posed rig about the pivot (the board's contact) by the quaternion (the wall's normal) */
function tiltRig(rig, q, pivot) {
  const a = rig.pose, n = rig.bind.length;
  for (let b = 0; b < n; b++) {
    const o = b * 8;
    _qB.set(a[o], a[o + 1], a[o + 2], a[o + 3]).premultiply(q);
    a[o] = _qB.x; a[o + 1] = _qB.y; a[o + 2] = _qB.z; a[o + 3] = _qB.w;
    _vT.set(a[o + 4], a[o + 5], a[o + 6]).sub(pivot).applyQuaternion(q).add(pivot);
    a[o + 4] = _vT.x; a[o + 5] = _vT.y; a[o + 6] = _vT.z;
  }
}

const skateBowl = {
  setup(run) {
    const sb = run.sb = { deckY: bowlDeckY(), blips: new Blips(run.hooks.audio), cam: null, flashAt: 0 };
    const g = sb.group = buildBowl();
    g.name = 'Schuessla';
    const c0 = bowlToWorld(0, 0);
    g.position.set(c0.x, sb.deckY, c0.z);
    g.rotation.y = SCHUESSLA.heading - Math.PI / 2; // (bowl +x along the heading)
    run.group.add(g);
    sb.board = createSkateboard();
    run.group.add(sb.board);
    // a few locals on the deck
    const spots = [[-BOWL.fa - BOWL.R - 0.5, -1.2, Math.PI / 2], [-BOWL.fa - BOWL.R - 0.5, 0.4, Math.PI / 2 + 0.3], [BOWL.fa + BOWL.R + 0.5, 1.0, -Math.PI / 2], [2.0, BOWL.fb + BOWL.R + 0.5, Math.PI], [-1.5, -(BOWL.fb + BOWL.R + 0.5), 0.1]].map(([x, z, yaw]) => { const p = bowlToWorld(x, z); return { x: p.x, z: p.z, yaw: bowlHeadingToWorld(yaw) }; });
    sb.crowd = makeCrowd(spots);
    for (const m of sb.crowd.crowd.meshes) run.group.add(m);
    sb.ground = () => sb.deckY;
    for (const p of sb.crowd.people) p.rig.reset(p.x, p.z, p.yaw, sb.ground);
    const { hud, big } = hudPanel(run);
    sb.ui = { hud, big, time: el('span', 'sport-flash is-gold'), score: el('span', 'sport-flash'), combo: el('div', 'sport-flash is-good'), trick: el('div', 'sport-flash'), bal: el('div', 'sport-balance') };
    sb.ui.balNeedle = el('span'); sb.ui.bal.append(sb.ui.balNeedle); sb.ui.bal.hidden = true;
    const row = el('div', 'sport-row'); row.append(sb.ui.time, sb.ui.score);
    hud.append(row, sb.ui.combo, sb.ui.trick, sb.ui.bal);
    run.hints([[['W'], 'pump'], [['A', 'D'], 'carve / spin · grind: balance'], [['Space'], 'hold: grab · grind: drop in']]);
    const cm = run.hooks.controllerManager;
    cm.personDriver = (dt) => skateBowl.drive(run, dt, cm);
    cm.personPoser = (dt, p) => skateBowl.pose(run, dt, p);
    run.cleanups.push(() => {
      if (cm.personDriver) cm.personDriver = null;
      cm.personPoser = null;
      const p = cm.entities.person;
      p.rig.placed = false;
      // (back on the deck's edge, not in the air over the bowl)
      const out = bowlToWorld(0, -(BOWL.fb + BOWL.R + BOWL.deck + 1.5));
      p.position.set(out.x, cm.getGroundHeight(out.x, out.z, 'person'), out.z);
      p.speed = 0;
      run.hooks.cameraSystem.resetForTeleport?.();
    });
    g.updateMatrixWorld(true);
  },
  reset(run) {
    const sb = run.sb;
    sb.cam = null;
    run._sportEdge_up = true;
    touchButton(run, 'up', 'Grab');
  },
  drive(run, dt, cm) {
    const p = cm.entities.person, sb = run.sb, st = run.state, k = cm.keys;
    if (!st) return;
    const dropKey = edge(run, cm, 'up');
    if (!st.started) {
      // on the deck at the coping, ready to drop in
      const w = bowlToWorld(0, -(BOWL.fb + BOWL.R + 0.25));
      p.position.set(w.x, sb.deckY, w.z);
      p.heading = bowlHeadingToWorld(0);
      p.speed = 0;
      if (live(run) && (k.forward || dropKey)) {
        st.started = true;
        st.boarder = createBoarder(0.3, -(BOWL.fb + BOWL_SIGMA - 0.05));
        st.boarder.vz = 1.2; st.boarder.vx = 0.4;
        sb.blips.thud(1);
      }
      return;
    }
    const b = st.boarder;
    if (!st.over && live(run)) {
      const ev = stepBoarder(b, { pump: !!k.forward, back: +k.backward || 0, steer: (+k.left || 0) - (+k.right || 0), grab: !!k.up, drop: dropKey }, Math.min(dt, 0.05));
      for (const e of ev) skateBowl.event(run, e);
    } else if (b.mode === 'air' || b.mode === 'grind') {
      for (const e of stepBoarder(b, { pump: false, steer: 0, grab: false, drop: true }, Math.min(dt, 0.05))) skateBowl.event(run, e);
    } else {
      // (after the whistle: rolling out)
      stepBoarder(b, { pump: false, back: 1, steer: 0 }, Math.min(dt, 0.05));
    }
    const s = bowlSurface(b.px, b.pz);
    const w = bowlToWorld(s.x, s.z);
    p.position.set(w.x, sb.deckY + s.y + (b.mode === 'air' ? b.air.y : 0) + (b.mode === 'grind' ? 0.05 : 0), w.z);
    p.speed = boarderSpeed(b);
  },
  event(run, e) {
    const sb = run.sb, st = run.state;
    if (e.type === 'air') sb.blips.click(0.8);
    else if (e.type === 'grind') sb.blips.tone(240, 0.3, { type: 'sawtooth', vol: 0.05 });
    if (e.trick) {
      const combo = addTrick(st.score, e.trick);
      st.last = e.trick;
      if (e.trick.ok) {
        sb.blips.thud(0.9);
        setText(sb.ui.trick, `${e.trick.name} +${e.trick.points}`); sb.ui.trick.className = 'sport-flash is-good';
        if (combo && combo.count > 1) bigText(run, sb.ui.big, `×${comboMultiplier(combo)}`, e.trick.name, 900);
      } else {
        sb.blips.tone(150, 0.35, { slide: 0.5, vol: 0.2 });
        setText(sb.ui.trick, `${e.trick.name}: combo lost`); sb.ui.trick.className = 'sport-flash is-bad';
        bigText(run, sb.ui.big, 'Bail!', '', 800);
      }
      sb.flashAt = performance.now();
    }
  },
  pose(run, dt, p) {
    const sb = run.sb, st = run.state, b = st?.boarder;
    const rig = p.rig;
    let yawB = 0, crouch = 0.45, arms = 'swing', tiltQ = null, s = null;
    if (!b) {
      yawB = 0;
      const r = poseSkater(rig, p.position.x, p.position.y, p.position.z, bowlHeadingToWorld(yawB), { crouch: 0.2, phase: 0, push: 0, lean: 0, arms: 'swing' });
      skateBowl.placeBoard(run, p.position, bowlHeadingToWorld(yawB), null, r);
      return;
    }
    s = bowlSurface(b.px, b.pz);
    if (b.mode === 'air') {
      // facing out of the bowl at the takeoff, turning with the spin; grabbed: tucked
      const out = Math.atan2(b.air.tx * 0 + s.ox, s.oz);
      yawB = out + b.air.spin;
      crouch = b.air.grab > 0.05 || run.hooks.controllerManager.keys.up ? 1 : 0.6;
      arms = crouch >= 1 ? 'back' : 'swing';
    } else if (b.mode === 'grind') {
      yawB = Math.atan2(b.grind.tx, b.grind.tz);
      crouch = 0.55;
      arms = 'swing';
    } else {
      yawB = b.heading;
      crouch = b.mode === 'bail' ? 1 : 0.35 + 0.4 * Math.min(1, s.theta / 1.2);
      // on the wall: the body tilted onto it (the wall's normal), the board along the way up or down
      if (s.theta > 0.02) {
        const w = bowlToWorld(s.x + s.nx, s.z + s.nz), c = bowlToWorld(s.x, s.z);
        _vN.set(w.x - c.x, s.ny, w.z - c.z).normalize();
        tiltQ = _qTilt.setFromUnitVectors(_vUp, _vN);
        // (the board's heading on the wall: its direction projected back to the floor plane: the unrolled one)
      }
    }
    const yaw = bowlHeadingToWorld(yawB);
    const lean = b.mode === 'ride' ? clamp(-((+run.hooks.controllerManager.keys.left || 0) - (+run.hooks.controllerManager.keys.right || 0)) * 0.25, -0.3, 0.3) : 0;
    const r = poseSkater(rig, p.position.x, p.position.y, p.position.z, yaw, { crouch, phase: Math.PI / 2, push: 0, lean, arms });
    if (tiltQ) { _piv.copy(p.position); tiltRig(rig, tiltQ, _piv); }
    skateBowl.placeBoard(run, p.position, yaw, tiltQ, r);
  },
  placeBoard(run, pos, yaw, tiltQ, r) {
    const bd = run.sb.board;
    bd.position.copy(pos);
    bd.quaternion.setFromAxisAngle(_vUp, yaw);
    if (tiltQ) bd.quaternion.premultiply(tiltQ);
    // (the feet's yaw is the stance's: the board under them, along the travel)
    void r;
  },
  update(run, ctx, dt) {
    const sb = run.sb, st = run.state;
    if (!st) return;
    const left = Math.max(0, SKATE.runTime - st.t);
    setText(sb.ui.time, st.started ? `${left.toFixed(1)} s` : 'Drop in: W');
    setText(sb.ui.score, `${skateTotal(st.score)} pts`);
    const c = st.score.combo;
    setText(sb.ui.combo, c && c.count > 1 ? `Combo ×${comboMultiplier(c)} · ${comboValue(c)}` : '');
    const b = st.boarder;
    sb.ui.bal.hidden = !(b && b.mode === 'grind');
    if (b && b.mode === 'grind') sb.ui.balNeedle.style.left = `${clamp((b.grind.b + 1) / 2, 0, 1) * 100}%`;
    if (sb.flashAt && performance.now() - sb.flashAt > 1600) { sb.ui.trick.textContent = ''; sb.flashAt = 0; }
    if (st.over && !sb.whistled) { sb.whistled = true; sb.blips.beep(true); bigText(run, sb.ui.big, 'Time!', `${skateTotal(st.score)} pts`, 2000); }
    poseCrowd(sb.crowd, dt, sb.ground, st.score.combo && st.score.combo.count > 2 ? 1 : 0);
  },
  after(run, ctx, dt) {
    const sb = run.sb;
    sb.ui.hud.hidden = !live(run);
    if (run.phase === 'intro' || run.phase === 'aborted') return;
    // the camera: up on the deck's far side, looking down into the bowl at the skater
    const p = run.hooks.controllerManager.entities.person.position;
    const c = bowlToWorld(0, 0);
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1;
    const back = 6.5 + Math.min(4, d * 0.4);
    const pos = new THREE.Vector3(c.x - (dx / d) * back * 0.55 + dx * 0.1, sb.deckY + 4.6, c.z - (dz / d) * back * 0.55 + dz * 0.1);
    const look = new THREE.Vector3(p.x, Math.max(p.y, sb.deckY - BOWL.R) + 0.6, p.z);
    if (!sb.cam) sb.cam = { pos: pos.clone(), look: look.clone() };
    const k = 1 - Math.exp(-dt * 3.5);
    sb.cam.pos.lerp(pos, k); sb.cam.look.lerp(look, 1 - Math.exp(-dt * 8));
    const cam = ctx.camera;
    cam.position.copy(sb.cam.pos);
    cam.lookAt(sb.cam.look);
    cam.updateMatrixWorld();
  }
};

export const SPORT_FEATURES = { xcSkis, xcRace, minigolf, iceMinigolf, darts, skateBowl };
// (test hooks: the probe scripts read the bowl's surface, the board's fields)
export const __sportInternals = { bowlSurface, floorEdge, BOWL_SIGMA, MINIGOLF_SITE };
