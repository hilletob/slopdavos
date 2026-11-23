// js/missions-jetpack.js
// The runtime of js/missions-data-jetpack.js, as a feature of js/missions.js (JETPACK_FEATURES, merged into its FEATURES):
//   jetpack — the flight: the controllers' personDriver steps the flight model (W/S lean and brake, A/D turn, Space climbs,
//             Q sinks; a touch screen: the stick and the two buttons) and places the walker; their personPoser stands it
//             upright in the air, leaning into the flight, the hands on the pack's grips (the skinned PersonRig's bones,
//             js/missions-paraglide.js poseHarness), or lets it walk on the ground. The pack on the back: two tanks, the
//             nozzles out at the shoulders, their flames and a trail of steam in the January air. The gates of light (the
//             next one bright with a beam down to the ground, the later ones faint), the pads painted on the ground and
//             the pit crew's fuel drums, its green column of light over the roofs while the tank wants filling, the hose
//             and a ring of light rising round the pilot while it fills, the pack's roar and the pump's ticking, and the
//             HUD at the bottom: the pit crew's way and distance (or the filling tank), the tank, the height over the
//             ground, the climb, the gates.
//             The houses are solid (the controllers' floor plans): a wall stops the flight, a roof can be landed on.
// The camera is the chase camera following the walker. Everything goes with the run's group and its cleanups.
import * as THREE from 'three/webgpu';
import { groundHeight } from './terrain.js';
import { QUALITY } from './quality.js';
import { t } from './i18n.js';
import { ParticleBatch } from './missions-fx.js';
import { poseHarness, bonePoint, walkerShadow, saveWalker, restoreWalker } from './missions-paraglide.js';
import { drapeRing, RING_DEPTH } from './missions-props.js';
import { JP, GATES, PAD, START, TOWN_GATES, stepJet, gatePoint, coursePoints, jetWorld } from './missions-data-jetpack.js';
import { el } from './dom.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const touch = () => !!globalThis.document?.body?.classList.contains('touch-enabled');
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);

const STYLE = `
.jp-hud { position: fixed; left: 50%; bottom: max(54px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 12;
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 14px; pointer-events: none; font-size: 12px; }
.jp-hud[hidden] { display: none; }
.jp-row { display: flex; gap: 14px; align-items: flex-end; }
.jp-cell { display: flex; flex-direction: column; align-items: center; min-width: 54px; }
.jp-k { font-size: 10px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
.jp-v { white-space: nowrap; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.15; }
.jp-v.is-up { color: #5be08c; } .jp-v.is-down { color: #8fd3ff; }
.jp-tank { display: flex; align-items: center; gap: 8px; }
.jp-bar { position: relative; width: 250px; height: 12px; border-radius: 6px; background: rgba(255,255,255,0.14); overflow: hidden; }
.jp-bar span { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 50%; background: #ffb02e; }
.jp-bar.is-low span { background: #ff5a3c; } .jp-bar.is-filling span { background: #5be08c; }
.jp-pct { min-width: 44px; font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
.jp-bar.is-low + .jp-pct { color: #ff8a6b; }
.jp-flash { font-size: 15px; font-weight: 800; min-height: 18px; color: #ffc83d; }
.jp-call { display: flex; align-items: center; gap: 8px; padding: 3px 12px; border-radius: 999px; background: rgba(91,224,140,0.16);
  border: 1px solid rgba(91,224,140,0.55); color: #8ff0b2; font-size: 16px; font-weight: 800; white-space: nowrap; font-variant-numeric: tabular-nums; }
.jp-call[hidden] { display: none; }
.jp-call i { display: inline-block; width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent;
  border-bottom: 14px solid currentColor; font-style: normal; }
.jp-call.is-filling { background: rgba(91,224,140,0.3); color: #d9ffe6; font-size: 19px; animation: jp-pulse 0.8s ease-in-out infinite alternate; }
.jp-call.is-filling i { display: none; }
.jp-call.is-low { background: rgba(255,90,60,0.2); border-color: rgba(255,90,60,0.6); color: #ffb39e; }
.jp-bar.is-filling { height: 16px; box-shadow: 0 0 10px rgba(91,224,140,0.75); animation: jp-pulse 0.8s ease-in-out infinite alternate; }
@keyframes jp-pulse { from { opacity: 0.78; } to { opacity: 1; } }
body.touch-enabled .jp-hud { bottom: calc(max(12px, env(safe-area-inset-bottom)) + var(--touch-clear, 200px)); }
@media (max-width: 820px) {
  .jp-hud { padding: 6px 8px; gap: 4px; }
  .jp-row { gap: 8px; } .jp-cell { min-width: 42px; } .jp-v { font-size: 15px; } .jp-k { font-size: 8px; letter-spacing: 0.02em; }
  .jp-bar { width: 170px; } .jp-call { font-size: 13px; } .jp-call.is-filling { font-size: 15px; }
  body.touch-enabled .jp-hud { bottom: auto; top: calc(max(12px, env(safe-area-inset-top)) + 178px); }
}
`;
function ensureStyle() {
  if (document.getElementById('jp-style')) return;
  const s = document.createElement('style');
  s.id = 'jp-style';
  s.textContent = STYLE;
  document.head.append(s);
}

// --- The pack ----------------------------------------------------------------------------------------------------------------
// In the chest's frame (the PersonRig's chest joint: +y up the spine, +z forward, +x the pilot's left): the frame and the
// tanks on the back, the nozzles out at the shoulders, the two arms forward to the grips.
const NOZZLE = { x: 0.43, y: 0.2, z: -0.2 };
function buildPack() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.32, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.7, metalness: 0.3 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff6a1f, roughness: 0.5, metalness: 0.2 });
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !QUALITY.mobile; g.add(m); return m; };
  add(new THREE.BoxGeometry(0.36, 0.5, 0.07).translate(0, 0.1, -0.15), dark); // the frame against the back
  for (const s of [1, -1]) {
    add(new THREE.CylinderGeometry(0.085, 0.085, 0.5, 12).translate(s * 0.125, 0.12, -0.27), steel); // the fuel tanks
    add(new THREE.SphereGeometry(0.085, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(s * 0.125, 0.37, -0.27), steel);
    // the pipe out to the nozzle, the nozzle's bell
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.32, 8).rotateZ(Math.PI / 2).translate(s * 0.29, 0.34, NOZZLE.z), steel);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 10).translate(s * NOZZLE.x, 0.3, NOZZLE.z), steel);
    add(new THREE.CylinderGeometry(0.045, 0.075, 0.14, 12, 1, true).translate(s * NOZZLE.x, NOZZLE.y - 0.03, NOZZLE.z), dark);
    // the arm forward under the pilot's own, the grip at its end
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.52, 8).rotateX(Math.PI / 2 - 0.25).translate(s * 0.27, -0.06, 0.1), steel);
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 8).translate(s * 0.27, -0.06, 0.37), dark);
  }
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 10).translate(0, 0.12, -0.31), orange); // the pressure bottle between them
  add(new THREE.BoxGeometry(0.3, 0.05, 0.09).translate(0, -0.17, -0.2), orange);
  // the flames: a bright core in a wider orange cone under each nozzle (scaled with the thrust)
  const flames = [];
  const core = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const outer = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const s of [1, -1]) {
    const f = new THREE.Group();
    f.position.set(s * NOZZLE.x, NOZZLE.y - 0.1, NOZZLE.z);
    f.add(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.5, 8).rotateX(Math.PI).translate(0, -0.25, 0), core));
    f.add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.8, 10).rotateX(Math.PI).translate(0, -0.4, 0), outer));
    g.add(f);
    flames.push(f);
  }
  return { pack: g, flames };
}

// --- The gates, the pads --------------------------------------------------------------------------------------------------
const GATE_NEXT = 0xffb02e, GATE_LATER = 0x7fd8ff;
function buildGates(run) {
  const pts = coursePoints(), gates = [];
  const geo = new THREE.TorusGeometry(JP.gateR - 0.6, 0.42, 8, 40);
  const p = { x: 0, y: 0, z: 0 };
  GATES.forEach((gate, i) => {
    const k = pts.findIndex((q) => q.id === gate.id), a = pts[k - 1], b = pts[k + 1];
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: GATE_LATER, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
    gatePoint(gate, groundHeight, p);
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); // (across the line from the waypoint before to the one after)
    m.frustumCulled = false;
    run.group.add(m);
    gates.push(m);
  });
  // the beam under the next gate, down to the ground
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: GATE_NEXT, transparent: true, opacity: 0.35, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  beam.frustumCulled = false;
  run.group.add(beam);
  return { gates, beam };
}

// The stick: seconds to full travel and back to the centre, and the response curve's exponent
const STICK_IN = 0.45, STICK_OUT = 0.12, STICK_CURVE = 1.6;

/** How far the chase camera tilts up (rad) to keep the next gate in view: part of the gate's elevation, never down */
function gateTilt(run, f) {
  const g = GATES[f.gate];
  if (!g || (g.leg > 0 && !f.refuelled)) return 0; // (the pad, the terrace: low ahead)
  const d = Math.hypot(g.x - f.x, g.z - f.z);
  if (d < 20) return 0; // (flying through: the ring fills the screen anyway)
  return clamp(Math.atan2(run.jp.gates[f.gate].position.y - (f.y + 1.5), d) * 0.75, 0, 0.42);
}

/** The pit crew's corner of the pad: fuel drums, a can, a little flag on a pole */
function buildPit(x, z, heading) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc8322b, roughness: 0.55, metalness: 0.3 });
  const band = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.6 });
  for (const [dx, dz] of [[0, 0], [0.75, 0.1], [0.36, 0.7]]) {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 14).translate(dx, 0.44, dz), red));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.07, 14).translate(dx, 0.6, dz), band));
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.16).translate(1.5, 0.23, 0.5), red)); // a jerrycan
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 6).translate(-0.7, 1.6, 0.2), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.5, metalness: 0.4 })));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.02).translate(-0.24, 2.9, 0.2), new THREE.MeshStandardMaterial({ color: 0xff6a1f, roughness: 0.7, side: THREE.DoubleSide })));
  g.position.set(x, groundHeight(x, z), z);
  g.rotation.y = heading;
  return g;
}

// The pads as the pit crew painted them: a dark disc with a green ring and a fuel pump in white, for the start's drums
// and the pit crew's on the Promenade (one canvas, draped over the paving)
const FUEL = 0x5be08c; // (the HUD's tank bar while it fills)
function padTexture() {
  const n = QUALITY.mobile ? 128 : 256, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), m = n / 2, k = n / 256;
  g.fillStyle = 'rgba(16,24,20,0.55)';
  g.beginPath(); g.arc(m, m, 124 * k, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#5be08c'; g.lineWidth = 12 * k;
  g.beginPath(); g.arc(m, m, 114 * k, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 5 * k; g.setLineDash([14 * k, 10 * k]);
  g.beginPath(); g.arc(m, m, 96 * k, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  // the pump: its body with the window, the nozzle on its hose to the right
  g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff';
  g.fillRect(m - 42 * k, m - 52 * k, 56 * k, 104 * k);
  g.fillStyle = '#5be08c'; g.fillRect(m - 32 * k, m - 42 * k, 36 * k, 26 * k);
  g.lineWidth = 8 * k; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(m + 14 * k, m - 30 * k); g.lineTo(m + 36 * k, m - 12 * k); g.lineTo(m + 36 * k, m + 30 * k); g.lineTo(m + 48 * k, m + 30 * k); g.lineTo(m + 48 * k, m - 6 * k); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function buildPadMark(material, x, z, r) {
  const s = r + 1.2, m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 8, 8).rotateX(-Math.PI / 2), material);
  m.scale.set(s, 1, s);
  const y = groundHeight(x, z);
  m.position.set(x, y, z);
  drapeRing(m, x, y, z, s, 0.25); // (over the Arkadenplatz' paving, 0.18 m over the ground)
  m.renderOrder = 978;
  return m;
}
/** The pit crew's column of light: green, far above the roofs round the Arkadenplatz, fading upwards; a ring rides up it */
const BEACON_H = 170;
function buildBeacon(x, z) {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 64;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#000'); grad.addColorStop(0.6, '#555'); grad.addColorStop(1, '#fff');
  g.fillStyle = grad; g.fillRect(0, 0, 1, 64);
  const fade = new THREE.CanvasTexture(c);
  const mat = (opacity) => new THREE.MeshBasicMaterial({ color: FUEL, transparent: true, opacity, alphaMap: fade, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y, z);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, BEACON_H, 16, 1, true).translate(0, BEACON_H / 2, 0), mat(0.55));
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, BEACON_H, 10, 1, true).translate(0, BEACON_H / 2, 0), mat(0.9));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.45, 6, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: FUEL, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  for (const m of [column, core, ring]) { m.frustumCulled = false; m.renderOrder = 981; group.add(m); }
  group.visible = false;
  group.userData = { column, core, ring, fade };
  return group;
}
/** While the tank fills: the crew's hose from the drums to the pack (two lengths sagging to the paving), a ring of light
 *  rising round the pilot again and again */
function buildFilling() {
  const hoseMat = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6 });
  const geo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6).translate(0, 0.5, 0);
  const hose = [new THREE.Mesh(geo, hoseMat), new THREE.Mesh(geo, hoseMat)];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: FUEL, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const group = new THREE.Group();
  group.add(...hose, ring);
  for (const m of group.children) m.frustumCulled = false;
  group.visible = false;
  return { group, hose, ring };
}
const _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _h0 = new THREE.Vector3(), _h1 = new THREE.Vector3();
// The pit crews' drums: at the pad on the Promenade and at the start (buildPit)
const PITS = [{ x: PAD.x + PAD.r + 1.5, z: PAD.z + 1, heading: 0.6 }, { x: START.x + 5, z: START.z + 4, heading: 2.2 }];
const START_R = 6; // (js/missions-data-jetpack.js START_PAD)
/** A length of hose (a unit cylinder up +y) from a to b */
function lay(mesh, a, b) {
  _b.subVectors(b, a);
  const len = _b.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(_up, _b.multiplyScalar(1 / Math.max(1e-6, len)));
  mesh.scale.set(1, len, 1);
}

// --- The pack's roar --------------------------------------------------------------------------------------------------------
class Roar {
  constructor(audio) { this.audio = audio; this.node = null; }
  ok() {
    const a = this.audio;
    return a && a.enabled && a.context && a.context.state === 'running' && a.mix;
  }
  update(thrust) {
    if (!this.ok()) { if (this.node) this.stop(); return; }
    const ctx = this.audio.context, now = ctx.currentTime;
    if (!this.node) {
      if (thrust <= 0.02) return;
      const len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf; src.loop = true;
      band.type = 'bandpass'; band.Q.value = 0.7; band.frequency.value = 500;
      g.gain.value = 0;
      src.connect(band).connect(g).connect(this.audio.mix);
      src.start();
      this.node = { src, band, g };
    }
    this.node.g.gain.setTargetAtTime(0.11 * thrust, now, 0.06);
    this.node.band.frequency.setTargetAtTime(420 + 900 * thrust, now, 0.08);
  }
  /** A short tone: a gate passed (up), a penalty (down) */
  blip(freq, to = freq, len = 0.14, vol = 0.07) {
    if (!this.ok()) return;
    const ctx = this.audio.context, now = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, now); o.frequency.exponentialRampToValueAtTime(to, now + len);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + len);
    o.connect(g).connect(this.audio.mix);
    o.start(now); o.stop(now + len + 0.02);
  }
  stop() {
    if (!this.node) return;
    try { this.node.g.gain.value = 0; this.node.src.stop(); } catch { /* (the context gone) */ }
    this.node = null;
  }
}

// --- The feature ------------------------------------------------------------------------------------------------------------
const BONE = { PELVIS: 0, CHEST: 1 };
const PELVIS_STAND = 0.96; // (js/pedestrians.js PELVIS_Y: the pelvis over the soles, standing)
const HANDS = [0.86, 0.86]; // (js/missions-paraglide.js poseHarness: the arms forward and down, at the grips)
const _C = new THREE.Vector3(), _Q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _qq = new THREE.Quaternion(), _n = new THREE.Vector3();

const jetpack = {
  // (the game's key hints give way to the flight's own; a touch screen keeps its stick, the steering)
  ownControls: (run) => !!run.state?.flight && !touch(),
  setup(run) {
    ensureStyle();
    const cm = run.hooks.controllerManager, person = cm.entities.person;
    const jp = run.jp = {
      ...buildPack(), ...buildGates(run), roar: new Roar(run.hooks.audio), time: 0, hudT: 0, flashT: 0, lean: 0, roll: 0, steamAcc: 0,
      pose: { head: new THREE.Vector3(), headQ: new THREE.Quaternion(), pelvis: new THREE.Vector3(), pelvisQ: new THREE.Quaternion() },
      saved: saveWalker(person)
    };
    // the ground under the pilot: the terrain, or the roof below; the walls of the houses (the controllers' floor plans)
    Object.assign(jp, jetWorld(groundHeight, (x, z, y) => cm.insideBuilding?.(x, z, y) || null));
    run.group.add(jp.pack);
    // the pit crew's drums and flag at the pad and at the start, the pads painted on the ground, the columns of light,
    // the hose and the ring for the filling
    run.group.add(...PITS.map((p) => buildPit(p.x, p.z, p.heading)));
    const padMat = new THREE.MeshBasicMaterial({ map: padTexture(), transparent: true, depthWrite: false, ...RING_DEPTH });
    run.group.add(buildPadMark(padMat, PAD.x, PAD.z, PAD.r), buildPadMark(padMat, START.x, START.z, START_R));
    jp.beacon = buildBeacon(PAD.x, PAD.z);
    jp.startBeacon = buildBeacon(START.x, START.z);
    jp.fill = buildFilling();
    jp.pumpT = 0;
    run.group.add(jp.beacon, jp.startBeacon, jp.fill.group);
    run.cleanups.push(() => { padMat.map.dispose(); jp.beacon.userData.fade.dispose(); jp.startBeacon.userData.fade.dispose(); });
    // the steam
    const steam = jp.steam = new ParticleBatch(run.scene);
    steam.mesh.name = 'JetpackSteam';
    run.storage(steam.mesh);
    run.cleanups.push(() => steam.dispose());
    person.label = 'Jetpack';
    person.topSpeedKmh = 110;
    run.vehiclePanel({ label: 'Jetpack', topSpeedKmh: 110 }); // (the cluster at the bottom right, js/main.js)
    // the HUD: the tank over the numbers
    const hud = el('div', 'panel jp-hud');
    const cell = (key) => { const c = el('div', 'jp-cell'), v = el('span', 'jp-v', '–'); c.append(el('span', 'jp-k', t(key)), v); return { c, v }; };
    const ui = jp.ui = { hud, agl: cell('Above ground'), climb: cell('Climb'), gate: cell('Gates'), pen: cell('Penalty'), bar: el('div', 'jp-bar'), fill: el('span'), pct: el('span', 'jp-pct', '100 %'), flash: el('div', 'jp-flash'),
      call: el('div', 'jp-call'), callArrow: el('i'), callText: el('span') };
    ui.bar.append(ui.fill);
    ui.call.append(ui.callArrow, ui.callText);
    ui.call.hidden = true;
    const tank = el('div', 'jp-tank');
    tank.append(el('span', 'jp-k', t('Tank')), ui.bar, ui.pct);
    const row = el('div', 'jp-row');
    row.append(ui.agl.c, ui.climb.c, ui.gate.c, ui.pen.c);
    hud.append(ui.flash, ui.call, tank, row);
    hud.hidden = true;
    document.body.append(hud);
    run.hints([[['Space'], 'climb'], [['Q'], 'sink'], [['W'], 'forward'], [['S'], 'brake'], [['A', 'D'], 'turn']]);
    run.button('up', 'Climb');
    run.button('down', 'Sink');
    // the walker is the pilot: driven and posed by the flight
    cm.personDriver = (dt) => jetpack.drive(run, dt, cm);
    cm.personPoser = (dt, p) => jetpack.pose(run, dt, p, cm);
    run.cleanups.push(() => {
      hud.remove();
      jp.roar.stop();
      restoreWalker(cm, person, jp.saved);
      person.slopePitch = 0;
    });
  },
  reset(run) {
    const jp = run.jp, cs = run.hooks.cameraSystem;
    jp.lean = jp.roll = 0; jp.flashT = 0;
    jp.ui.flash.textContent = '';
    const person = run.hooks.controllerManager.entities.person;
    person.rig.placed = false;
    person.chaseDistance = 7; person.chaseHeight = 2.6; person.cameraTargetOffset.y = -0.9; person.slopePitch = 0;
    jp.stick = { pitch: 0, turn: 0 };
    if (cs) { cs.orbitYawOffset = 0; cs.orbitPitchOffset = 0.12; cs.userOrbitTimer = 0; }
  },
  /** The controllers' personDriver: the flight stepped with the keys, the walker placed where it is */
  drive(run, dt, cm) {
    const p = cm.entities.person, f = run.state?.flight, jp = run.jp;
    if (!f || !live(run)) { p.speed = 0; return; }
    const k = cm.keys;
    // (the keys are on or off: the stick eases in, so that a tap is a small correction and a held key the full turn or
    // lean after half a second; let go, it centres quickly; the response curve keeps the first part of the travel fine)
    const st = jp.stick || (jp.stick = { pitch: 0, turn: 0 });
    // (a gamepad's or the touch stick's travel comes as a number and is followed as it is: only the keys ease)
    const analog = (a, b) => typeof k[a] === 'number' || typeof k[b] === 'number';
    const stickTo = (cur, want, direct) => {
      if (direct) return want;
      const out = Math.abs(want) > Math.abs(cur) && Math.sign(want) !== -Math.sign(cur);
      const rate = dt / (out ? STICK_IN : STICK_OUT);
      return cur + clamp(want - cur, -rate, rate);
    };
    st.pitch = stickTo(st.pitch, clamp((+k.forward || 0) - (+k.backward || 0), -1, 1), analog('forward', 'backward'));
    st.turn = stickTo(st.turn, clamp((+k.left || 0) - (+k.right || 0), -1, 1), analog('left', 'right'));
    const curve = (v) => Math.sign(v) * Math.abs(v) ** STICK_CURVE;
    const input = { pitch: curve(st.pitch), turn: curve(st.turn), up: +k.up || 0, down: +k.down || 0 };
    stepJet(f, input, dt, jp.groundAt, jp.solidAt);
    for (const e of f.events.splice(0)) jetpack.event(run, f, e);
    p.position.set(f.x, f.y, f.z);
    p.heading = f.heading;
    p.speed = f.speed;
    p.verticalVel = 0;
    // the camera: a little further back and higher in the air, and further still at speed
    const air = f.phase === 'air', ease = Math.min(1, dt * 1.5);
    const narrow = clamp(1 / (run.hooks.cameraSystem?.camera?.aspect || 1.6), 1, 1.6);
    // (on the ground too: back out of the pad's column of light, the pilot clear of the HUD)
    // (the camera looks 5 m ahead of the pilot: from a little above and at knee height the pilot stands mid-screen)
    p.chaseDistance += ((air ? 7.5 + f.speed * 0.12 : 7) * narrow - p.chaseDistance) * ease;
    p.chaseHeight += (2.6 - p.chaseHeight) * ease;
    p.cameraTargetOffset.y += (-0.9 - p.cameraTargetOffset.y) * ease;
    // (and up towards the next gate when it hangs high above: from the pad on the Arkadenplatz the Schatzalpbahn's first
    // gate is 100 m up behind the houses of the Promenade; js/cameras.js slopePitch tilts the chase camera's frame)
    p.slopePitch = (p.slopePitch || 0) + (-gateTilt(run, f) - (p.slopePitch || 0)) * Math.min(1, dt * 2);
    const shadow = walkerShadow(p);
    if (shadow) shadow.visible = !air || f.agl < 1.5;
  },
  event(run, f, e) {
    const jp = run.jp;
    if (e === 'gate') { jetpack.flash(run, `Gate ${f.gate}/${GATES.length}`); jp.roar.blip(660, 990); run.hooks.actions?.notify?.(); }
    else if (e === 'tumble') { jetpack.flash(run, 'Too fast: a tumble! +10 s'); jp.roar.blip(300, 120, 0.3, 0.1); }
    else if (e === 'bump') { jetpack.flash(run, 'A wall! +3 s'); jp.roar.blip(220, 110, 0.2, 0.1); }
    else if (e === 'refuelled') { jetpack.flash(run, 'Tank full: go!'); jp.roar.blip(520, 1040, 0.25); }
    else if (e === 'dry') { jetpack.flash(run, 'The tank is dry!'); jp.roar.blip(400, 90, 0.6, 0.1); }
  },
  flash(run, text) { run.jp.ui.flash.textContent = t(text); run.jp.flashT = 2.2; },
  /** The controllers' personPoser: walking on the ground; in the air upright under the thrust, leaning into the flight */
  pose(run, dt, p, cm) {
    const jp = run.jp, f = run.state?.flight, rig = p.rig;
    const air = f?.phase === 'air' && (live(run) || run.phase === 'done' || run.phase === 'failed');
    const k = Math.min(1, dt * 6);
    if (!air) {
      rig.update(dt, p.position.x, p.position.z, p.heading, (c, x, z) => jp.groundAt(x, z, p.position.y + 0.5), cm, 0);
      jp.lean = jp.roll = 0;
    } else {
      // the body leans with the push, banks into the turn (more at speed), the legs trail a little
      jp.lean += (f.lean * 0.9 - jp.lean) * k;
      jp.roll += (-f.turn * (0.12 + 0.3 * clamp(f.speed / 24, 0, 1)) - jp.roll) * k;
      _e.set(jp.lean, p.heading, jp.roll, 'YXZ');
      _Q.setFromEuler(_e);
      _C.set(p.position.x, p.position.y + (PELVIS_STAND + 0.54) * rig.s, p.position.z);
      poseHarness(rig, _C, _Q, p.heading, HANDS, 1, jp.pose);
    }
    // the pack on the chest joint (from the bones, whatever wrote them)
    bonePoint(rig, BONE.CHEST, _p, 0, _qq);
    jp.pack.position.copy(_p); jp.pack.quaternion.copy(_qq);
    jp.pack.scale.setScalar(rig.s);
    // the flames with the thrust, flickering
    const thrust = air ? f.thrust : 0;
    jp.flames.forEach((fl, i) => {
      fl.visible = thrust > 0.03;
      const flick = 0.85 + 0.3 * Math.sin(jp.time * 61 + i * 2.3) * Math.sin(jp.time * 37 + i);
      fl.scale.set(0.8 + 0.5 * thrust, (0.35 + 1.25 * thrust) * flick, 0.8 + 0.5 * thrust);
    });
  },
  update(run, ctx, dt) {
    const jp = run.jp, f = run.state?.flight;
    jp.time += dt;
    // the gates: the next one bright and breathing, the later ones faint, those flown through gone
    const next = f ? f.gate : 0;
    const open = (i) => GATES[i].leg === 0 || !!f?.refuelled;
    jp.gates.forEach((m, i) => {
      m.visible = i >= next;
      if (!m.visible) return;
      const isNext = i === next && open(i);
      m.material.color.setHex(isNext ? GATE_NEXT : GATE_LATER);
      m.material.opacity = isNext ? 0.82 + 0.16 * Math.sin(jp.time * 5) : open(i) ? 0.38 : 0.16;
      m.scale.setScalar(isNext ? 1 + 0.03 * Math.sin(jp.time * 5) : 1);
    });
    const g = GATES[next];
    jp.beam.visible = !!g && open(next);
    if (jp.beam.visible) {
      const m = jp.gates[next], ground = groundHeight(g.x, g.z), h = Math.max(1, m.position.y - JP.gateR - ground);
      jp.beam.position.set(g.x, ground + h / 2, g.z);
      jp.beam.scale.set(1, h, 1);
    }
    // the steam: puffs from the two nozzles, blown down and back, hanging in the cold air
    const air = f?.phase === 'air' && live(run);
    if (air && f.thrust > 0.05) {
      jp.steamAcc += dt * (QUALITY.mobile ? 22 : 45) * (0.4 + f.thrust);
      _n.set(0, -1, 0).applyQuaternion(jp.pack.quaternion);
      while (jp.steamAcc >= 1) {
        jp.steamAcc--;
        const s = Math.random() < 0.5 ? 1 : -1;
        _p.set(s * NOZZLE.x, NOZZLE.y - 0.5, NOZZLE.z).applyQuaternion(jp.pack.quaternion).add(jp.pack.position);
        const v = 4 + 3 * f.thrust, grey = 0.86 + Math.random() * 0.12;
        jp.steam.spawn({ x: _p.x, y: _p.y, z: _p.z, vx: _n.x * v + f.vx * 0.35 + (Math.random() - 0.5), vy: _n.y * v + f.vy * 0.35, vz: _n.z * v + f.vz * 0.35 + (Math.random() - 0.5), drag: 3, gravity: -0.5,
          life: 1.2 + Math.random() * 1.1, size0: 0.3, size1: 1.3 + Math.random() * 1.1, alpha: 0.55, r: grey, g: grey, b: grey + 0.02, kind: 'smoke' });
      }
    }
    jetpack.pads(run, f, dt);
    jp.steam.update(dt, ctx.camera);
    jp.roar.update(air ? f.thrust : 0);
    if (jp.flashT > 0) { jp.flashT -= dt; if (jp.flashT <= 0) jp.ui.flash.textContent = ''; }
  },
  /** The pads' columns of light, and the filling: the hose, the rising ring, the pump's ticking */
  pads(run, f, dt) {
    const jp = run.jp;
    // (the pit crew's column while the tank wants filling: after the town's gates, or a low tank over the town, when
    // the start's drums are a way out too; neither column over a pilot standing in it)
    const want = !!f && live(run) && !f.refuelled && (f.gate >= TOWN_GATES || f.fuel < 30);
    const standing = (s, r) => f.phase === 'ground' && Math.hypot(f.x - s.x, f.z - s.z) <= r + 1;
    jp.beacon.visible = want && !standing(PAD, PAD.r);
    jp.startBeacon.visible = want && f.gate < TOWN_GATES && !standing(START, START_R);
    for (const b of [jp.beacon, jp.startBeacon]) {
      if (!b.visible) continue;
      const u = b.userData, k = (jp.time * 0.45) % 1;
      u.ring.position.y = 3 + k * 80;
      u.ring.material.opacity = 0.9 * (1 - k);
      u.column.material.opacity = 0.42 + 0.14 * Math.sin(jp.time * 4);
    }
    const fill = jp.fill, filling = !!f?.refuelling && live(run);
    fill.group.visible = filling;
    if (!filling) { jp.pumpT = 0; return; }
    // the ring of light rising round the pilot, from the feet to over the head
    const p = run.hooks.controllerManager.entities.person.position, k = (jp.time * 0.9) % 1;
    fill.ring.position.set(p.x, p.y + 0.1 + k * 1.9, p.z);
    fill.ring.material.opacity = 0.95 * Math.sin(k * Math.PI);
    // the hose from the nearer drums down to the paving and up to the pack
    const pit = Math.hypot(f.x - PITS[0].x, f.z - PITS[0].z) < Math.hypot(f.x - PITS[1].x, f.z - PITS[1].z) ? PITS[0] : PITS[1];
    _h0.set(pit.x, groundHeight(pit.x, pit.z) + 0.9, pit.z);
    const pack = jp.pack.position;
    _h1.set((pit.x + pack.x) / 2, Math.min(_h0.y, pack.y) - 0.6, (pit.z + pack.z) / 2);
    _h1.y = Math.max(_h1.y, groundHeight(_h1.x, _h1.z) + 0.05);
    lay(fill.hose[0], _h0, _h1);
    lay(fill.hose[1], _h1, pack);
    // the pump ticks, higher as the tank fills
    jp.pumpT -= dt;
    if (jp.pumpT <= 0) { jp.pumpT = 0.2; jp.roar.blip(260 + f.fuel * 5, 230 + f.fuel * 5, 0.06, 0.035); }
  },
  after(run, ctx, dt) {
    const jp = run.jp, f = run.state?.flight, ui = jp.ui;
    const show = !!f && (live(run) || run.phase === 'done');
    ui.hud.hidden = !show;
    if (!show) { if (!live(run)) jp.roar.update(0); return; }
    // (the numbers ten times a second: no layout every frame)
    jp.hudT -= dt;
    if (jp.hudT > 0) return;
    jp.hudT = 0.1;
    ui.fill.style.transform = `scaleX(${clamp(f.fuel / 100, 0, 1).toFixed(3)})`;
    ui.bar.classList.toggle('is-low', f.fuel < 20 && !f.refuelling);
    ui.bar.classList.toggle('is-filling', !!f.refuelling);
    setText(ui.pct, `${Math.round(f.fuel)} %`);
    // the pit crew: the tank filling, or which way and how far while it wants filling
    if (f.refuelling) {
      ui.call.hidden = false;
      ui.call.className = 'jp-call is-filling';
      setText(ui.callText, `${t('Refuelling')} ${Math.round(f.fuel)} %`);
    } else if (!f.refuelled && (f.gate >= TOWN_GATES || f.fuel < 30)) {
      // (over the town a low tank can fill at the start's drums too: the nearer of the two)
      const dPad = Math.hypot(PAD.x - f.x, PAD.z - f.z), dStart = Math.hypot(START.x - f.x, START.z - f.z);
      const s = f.gate < TOWN_GATES && dStart < dPad ? START : PAD, d = s === START ? dStart : dPad;
      ui.call.hidden = false;
      ui.call.className = f.fuel < 20 ? 'jp-call is-low' : 'jp-call';
      setText(ui.callText, `${t('Pit crew')} · ${fmtDist(d)}`);
      const rel = wrap(Math.atan2(s.x - f.x, s.z - f.z) - f.heading);
      ui.callArrow.style.transform = `rotate(${(-rel).toFixed(2)}rad)`;
    } else ui.call.hidden = true;
    setText(ui.agl.v, `${Math.max(0, Math.round(f.agl))} m`);
    const vy = f.phase === 'air' ? f.vy : 0;
    setText(ui.climb.v, `${vy >= 0 ? '+' : '−'}${Math.abs(vy).toFixed(1)}`);
    ui.climb.v.classList.toggle('is-up', vy > 0.5);
    ui.climb.v.classList.toggle('is-down', vy < -0.5);
    setText(ui.gate.v, `${Math.min(f.gate, GATES.length)}/${GATES.length}`);
    setText(ui.pen.v, f.penaltyMs ? `+${Math.round(f.penaltyMs / 1000)} s` : '–');
  },
  teardown(run) { run.jp?.roar.stop(); }
};

export const JETPACK_FEATURES = { jetpack };
