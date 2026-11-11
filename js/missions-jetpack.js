// js/missions-jetpack.js
// The runtime of js/missions-data-jetpack.js, as a feature of js/missions.js (JETPACK_FEATURES, merged into its FEATURES):
//   jetpack — the flight: the controllers' personDriver steps the flight model (W/S lean and brake, A/D turn, Space climbs,
//             Q sinks; a touch screen: the stick and the two buttons) and places the walker; their personPoser stands it
//             upright in the air, leaning into the flight, the hands on the pack's grips (the skinned PersonRig's bones,
//             js/missions-paraglide.js poseHarness), or lets it walk on the ground. The pack on the back: two tanks, the
//             nozzles out at the shoulders, their flames and a trail of steam in the January air. The gates of light (the
//             next one bright with a beam down to the ground, the later ones faint), the pit crew's fuel drums at the pad,
//             the pack's roar, and the HUD at the bottom: the tank, the height over the ground, the climb, the gates.
//             The houses are solid (the controllers' floor plans): a wall stops the flight, a roof can be landed on.
// The camera is the chase camera following the walker. Everything goes with the run's group and its cleanups.
import * as THREE from 'three/webgpu';
import { groundHeight } from './terrain.js';
import { QUALITY } from './quality.js';
import { t } from './i18n.js';
import { ParticleBatch } from './missions-fx.js';
import { poseHarness, bonePoint } from './missions-paraglide.js';
import { JP, GATES, PAD, START, stepJet, gatePoint, coursePoints } from './missions-data-jetpack.js';

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const touch = () => !!globalThis.document?.body?.classList.contains('touch-enabled');
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };

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
body.touch-enabled .jp-hud { bottom: calc(max(12px, env(safe-area-inset-bottom)) + var(--touch-clear, 200px)); }
@media (max-width: 820px) {
  .jp-hud { padding: 6px 8px; gap: 4px; }
  .jp-row { gap: 8px; } .jp-cell { min-width: 42px; } .jp-v { font-size: 15px; } .jp-k { font-size: 8px; letter-spacing: 0.02em; }
  .jp-bar { width: 170px; }
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
const jpShadow = (p) => (p._jpShadow ??= p.mesh?.children.find((c) => c.renderOrder === 998) || null);

const jetpack = {
  // (the game's key hints give way to the flight's own; a touch screen keeps its stick, the steering)
  ownControls: (run) => !!run.state?.flight && !touch(),
  setup(run) {
    ensureStyle();
    const cm = run.hooks.controllerManager, person = cm.entities.person;
    const jp = run.jp = {
      ...buildPack(), ...buildGates(run), roar: new Roar(run.hooks.audio), time: 0, hudT: 0, flashT: 0, lean: 0, roll: 0, steamAcc: 0, shownGate: -1,
      pose: { head: new THREE.Vector3(), headQ: new THREE.Quaternion(), pelvis: new THREE.Vector3(), pelvisQ: new THREE.Quaternion() },
      saved: { label: person.label, chaseDistance: person.chaseDistance, chaseHeight: person.chaseHeight, target: person.cameraTargetOffset.y }
    };
    // the ground under the pilot: the terrain, or the roof below; the walls of the houses (the controllers' floor plans)
    jp.groundAt = (x, z, y) => {
      const g = groundHeight(x, z);
      if (y === Infinity) return g;
      const b = cm.insideBuilding?.(x, z, null);
      return b && b.maxY > g && y >= b.maxY - 1.2 ? b.maxY : g;
    };
    jp.solidAt = (x, y, z) => !!cm.insideBuilding?.(x, z, y + 1.2);
    run.group.add(jp.pack);
    // the pit crew's drums and flag at the pad and at the start
    run.group.add(buildPit(PAD.x + PAD.r + 1.5, PAD.z + 1, 0.6), buildPit(START.x + 5, START.z + 4, 2.2));
    // the steam
    const steam = jp.steam = new ParticleBatch(run.scene);
    steam.mesh.name = 'JetpackSteam';
    run.storage(steam.mesh);
    run.cleanups.push(() => steam.dispose());
    person.label = 'Jetpack';
    person.topSpeedKmh = 110;
    const hudLabel = document.getElementById('hud-active-mode'); // (js/main.js writes it only when the mode changes)
    if (hudLabel) hudLabel.textContent = 'Jetpack';
    // the HUD: the tank over the numbers
    const hud = el('div', 'panel jp-hud');
    const cell = (key) => { const c = el('div', 'jp-cell'), v = el('span', 'jp-v', '–'); c.append(el('span', 'jp-k', t(key)), v); return { c, v }; };
    const ui = jp.ui = { hud, agl: cell('Above ground'), climb: cell('Climb'), gate: cell('Gates'), pen: cell('Penalty'), bar: el('div', 'jp-bar'), fill: el('span'), pct: el('span', 'jp-pct', '100 %'), flash: el('div', 'jp-flash') };
    ui.bar.append(ui.fill);
    const tank = el('div', 'jp-tank');
    tank.append(el('span', 'jp-k', t('Tank')), ui.bar, ui.pct);
    const row = el('div', 'jp-row');
    row.append(ui.agl.c, ui.climb.c, ui.gate.c, ui.pen.c);
    hud.append(ui.flash, tank, row);
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
      delete person.topSpeedKmh;
      person.label = jp.saved.label;
      const label = document.getElementById('hud-active-mode');
      if (label) label.textContent = jp.saved.label;
      cm.personDriver = null;
      cm.personPoser = null;
      const p = cm.entities.person;
      p.rig.placed = false;
      p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
      p.speed = 0;
      p.chaseDistance = jp.saved.chaseDistance; p.chaseHeight = jp.saved.chaseHeight; p.cameraTargetOffset.y = jp.saved.target;
      if (jpShadow(p)) jpShadow(p).visible = true;
    });
  },
  reset(run) {
    const jp = run.jp, cs = run.hooks.cameraSystem;
    jp.lean = jp.roll = 0; jp.flashT = 0; jp.shownGate = -1;
    jp.ui.flash.textContent = '';
    const person = run.hooks.controllerManager.entities.person;
    person.rig.placed = false;
    person.chaseDistance = 7; person.chaseHeight = 2.6; person.cameraTargetOffset.y = -0.9;
    if (cs) { cs.orbitYawOffset = 0; cs.orbitPitchOffset = 0.12; cs.userOrbitTimer = 0; }
  },
  /** The controllers' personDriver: the flight stepped with the keys, the walker placed where it is */
  drive(run, dt, cm) {
    const p = cm.entities.person, f = run.state?.flight, jp = run.jp;
    if (!f || !live(run)) { p.speed = 0; return; }
    const k = cm.keys;
    const input = { pitch: (+k.forward || 0) - (+k.backward || 0), turn: (+k.left || 0) - (+k.right || 0), up: +k.up || 0, down: +k.down || 0 };
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
    if (jpShadow(p)) jpShadow(p).visible = !air || f.agl < 1.5;
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
    jp.steam.update(dt, ctx.camera);
    jp.roar.update(air ? f.thrust : 0);
    if (jp.flashT > 0) { jp.flashT -= dt; if (jp.flashT <= 0) jp.ui.flash.textContent = ''; }
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
