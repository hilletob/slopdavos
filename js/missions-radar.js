import * as THREE from 'three/webgpu';
import { surfaceHeight } from './terrain.js';
import { t } from './i18n.js';
import { BODY_SPECS, buildCarGeometry, createLoftedCarMaterial } from './actor-models.js';
import {
  RADAR, FINES, LASER_SPOT, TRIPOD, AIM_HEADING, STOP_S, ROAD_LENGTH, STREAM, roadFrame, brakeSpeed, chooseDriver, laserTarget, createStream, stepStream
} from './missions-data-radar.js';

// js/missions-radar.js
// The runtime of the police speed check (js/missions-data-radar.js; RADAR_FEATURES merged into js/missions.js FEATURES):
//   radarCheck — the laser on its tripod beside the Talstrasse, the view through it (the camera at the laser, zoomed,
//                aimed by dragging or A/D; Space or a click measures), its display (the reading in big red digits, the
//                distance, the lock), the stop sign (E) and the fine at the stopped car (1-4, 0: let go).
//   The traffic (js/traffic.js, through hooks.traffic as js/missions-wef.js and js/gta.js work on it): the cars on the
//   stretch are handed to the check; some of them get a faster driver for the run (the vehicle's own desired speed v0,
//   given back when it leaves the stretch or the run ends), the stopped car brakes to the kerb 25 m past the laser and
//   waits there (its speed held, nudged sideways as the WEF escort makes the traffic yield), then drives on.
//   The town's traffic is thin out here, so the check brings its commuters along (js/missions-data-radar.js stepStream):
//   drawn here as instanced cars of the traffic's own models, solid for the traffic as bodies (js/traffic.js tramBodies).
// Everything goes with the run's group and its cleanups.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const mat = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.55, ...o });
const stepId = (run) => run.def.objectives[run.index]?.id;
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const LASER_FOV = 18;
const EYE = 1.62; // m: the officer's eye at the sight
const LASER_REACH = 2.6; // m from the laser's spot: Q looks through it

const STYLE = `
.radar-display{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:30;pointer-events:none;
  background:linear-gradient(#24282e,#15181c);border:2px solid #3a4048;border-radius:14px;padding:8px 14px 9px;min-width:250px;box-shadow:0 8px 28px rgba(0,0,0,.45);
  font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;color:#d9dde2}
.radar-display[hidden]{display:none}
.radar-head{display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:.12em;color:#8b939c;text-transform:uppercase}
.radar-sign{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#fff;border:4px solid #d0021b;color:#111;font:800 11px/1 Inter,Arial,sans-serif;letter-spacing:0}
.radar-lcd{margin:4px 0 2px;background:#0b0606;border-radius:8px;padding:2px 12px;display:flex;align-items:baseline;justify-content:flex-end;gap:8px;box-shadow:inset 0 0 12px rgba(0,0,0,.9)}
.radar-kmh{font-size:64px;font-weight:800;line-height:1.05;color:#ff3b2f;text-shadow:0 0 12px rgba(255,59,47,.75);font-variant-numeric:tabular-nums;letter-spacing:.04em}
.radar-kmh.is-dim{color:#4a1512;text-shadow:none}
.radar-kmh.is-error{font-size:30px;line-height:2.2;color:#ffb21a;text-shadow:0 0 10px rgba(255,178,26,.6)}
.radar-unit{font-size:15px;color:#ff6a5f}
.radar-row{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:#c7ccd2}
.radar-lockbar{height:4px;background:#2b2f35;border-radius:2px;margin-top:4px;overflow:hidden}
.radar-lockbar>span{display:block;height:100%;width:100%;background:#ff3b2f;transform-origin:left;transform:scaleX(0)}
.radar-session{margin-top:5px;font-size:12px;color:#9aa3ad;display:flex;justify-content:space-between;gap:10px}
.radar-toast{position:fixed;left:50%;bottom:calc(250px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:31;pointer-events:none;
  background:rgba(16,20,26,.88);color:#fff;border-radius:10px;padding:7px 14px;font:600 14px/1.3 Inter,system-ui,sans-serif;white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis}
.radar-toast[hidden]{display:none}
.radar-toast b{margin-left:8px}
.radar-toast b.is-plus{color:#5fe08a}.radar-toast b.is-minus{color:#ff6b5f}
.radar-scope{position:fixed;inset:0;z-index:5;pointer-events:none;background:radial-gradient(circle at 50% 50%,transparent 0,transparent 34vmin,rgba(0,0,0,.55) 46vmin,rgba(0,0,0,.85) 70vmin)}
.radar-scope[hidden],.radar-box[hidden]{display:none}
.radar-cross{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border:2px solid rgba(255,59,47,.9);border-radius:50%}
.radar-cross::before,.radar-cross::after{content:"";position:absolute;background:rgba(255,59,47,.9)}
.radar-cross::before{left:50%;top:-14px;bottom:-14px;width:2px;margin-left:-1px}
.radar-cross::after{top:50%;left:-14px;right:-14px;height:2px;margin-top:-1px}
.radar-dot{position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:#ff3b2f;box-shadow:0 0 6px #ff3b2f}
.radar-box{position:fixed;z-index:6;pointer-events:none;border:2px solid #ffb21a;border-radius:4px;box-shadow:0 0 8px rgba(255,178,26,.6);transform:translate(-50%,-50%)}
.radar-box.is-lock{border-color:#ff3b2f;box-shadow:0 0 10px rgba(255,59,47,.8)}
.radar-fine{position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:32;background:rgba(18,22,28,.94);color:#fff;border-radius:14px;padding:12px 14px;
  font:500 14px/1.35 Inter,system-ui,sans-serif;box-shadow:0 10px 32px rgba(0,0,0,.5);max-width:min(560px,94vw)}
.radar-fine[hidden]{display:none}
.radar-fine h3{margin:0 0 4px;font-size:16px}
.radar-fine p{margin:0 0 10px;color:#c9d0d8}
.radar-fine-buttons{display:flex;flex-wrap:wrap;gap:6px}
.radar-fine button{flex:1 1 30%;min-width:100px;border:0;border-radius:9px;padding:8px 8px;background:#2d6cdf;color:#fff;font:700 14px/1.2 Inter,system-ui,sans-serif;cursor:pointer}
.radar-fine button.is-letgo{background:#47505b}
.radar-fine button small{display:block;font-weight:500;font-size:11px;opacity:.8}
.radar-fine kbd{font:700 11px/1 ui-monospace,monospace;background:rgba(255,255,255,.18);border-radius:4px;padding:2px 4px;margin-right:6px}
`;

// --- The tripod with the laser, the stop sign --------------------------------------------------------------------------
function buildTripod() {
  const g = new THREE.Group();
  g.name = 'RadarTripod';
  const metal = mat(0x2a2d31, { metalness: 0.6, roughness: 0.4 });
  const head = new THREE.Group();
  const H = 1.32;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const foot = new THREE.Vector3(Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42), top = new THREE.Vector3(0, H - 0.08, 0);
    const len = foot.distanceTo(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, len, 6), metal);
    leg.position.copy(foot).add(top).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    leg.castShadow = true;
    g.add(leg);
  }
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10), metal);
  mount.position.y = H - 0.04;
  g.add(mount);
  // the laser: a dark grey body with its yellow-banded nose, the sight on top, the display at the back
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.3), mat(0x3b4046, { roughness: 0.5 }));
  body.position.set(0, 0.07, 0);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 16).rotateX(Math.PI / 2), mat(0xf2c200, { roughness: 0.45 }));
  nose.position.set(0, 0.07, 0.17);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.036, 16), mat(0x101820, { metalness: 0.4, roughness: 0.15 }));
  lens.position.set(0, 0.07, 0.201);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.12), mat(0x15181c));
  sight.position.set(0, 0.155, 0.02);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.05), new THREE.MeshBasicNodeMaterial({ color: 0xff3b2f }));
  screen.position.set(0, 0.08, -0.151);
  screen.rotation.y = Math.PI;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), mat(0x15181c));
  grip.position.set(0, -0.04, -0.06);
  grip.rotation.x = -0.25;
  head.add(body, nose, lens, sight, screen, grip);
  for (const m of head.children) m.castShadow = true;
  head.position.y = H;
  g.add(head);
  g.userData.head = head;
  return g;
}

function buildStopSign() {
  const g = new THREE.Group();
  g.name = 'RadarStopSign';
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 8), mat(0x1c1f23));
  stick.position.y = -0.2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 24).rotateX(Math.PI / 2), mat(0xd0021b));
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.016, 24).rotateX(Math.PI / 2), mat(0xffffff, { roughness: 0.4 }));
  g.add(stick, rim, face);
  for (const m of g.children) m.castShadow = true;
  return g;
}

// --- The commuters' cars -------------------------------------------------------------------------------------------------
const STREAM_SLOTS = 14; // per body kind
const SWISS = [0xc3c7cb, 0x8e9399, 0x5a5f66, 0x2f3338, 0x15181c, 0xf1f2f3, 0xe6e7e8, 0x1f2f4d, 0x2b3f63, 0x8e1b1b, 0x2e3d33, 0x5a4636, 0xb22d23, 0x6f8fa8];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _one = new THREE.Vector3(1, 1, 1), _pos = new THREE.Vector3(), _c = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

function buildStreamCars(run) {
  const root = new THREE.Group();
  root.name = 'RadarCommuters';
  const meshes = {};
  for (const kind of new Set(STREAM.kinds)) {
    const spec = BODY_SPECS[kind];
    const geo = buildCarGeometry(spec, true);
    geo.setAttribute('paintColor', new THREE.InstancedBufferAttribute(new Float32Array(STREAM_SLOTS * 3), 3));
    geo.setAttribute('carState', new THREE.InstancedBufferAttribute(new Float32Array(STREAM_SLOTS * 4), 4));
    const material = createLoftedCarMaterial(spec);
    material.userData.shared = true; // (cached by js/actor-models.js, the traffic's own)
    const mesh = new THREE.InstancedMesh(geo, material, STREAM_SLOTS);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    for (let i = 0; i < STREAM_SLOTS; i++) mesh.setMatrixAt(i, HIDDEN);
    root.add(mesh);
    meshes[kind] = { mesh, free: [...Array(STREAM_SLOTS).keys()].reverse() };
  }
  run.storage(root);
  run.group.add(root);
  // a body for each car the traffic must not drive into (parked far away while unused)
  const bodies = [];
  for (let i = 0; i < 24; i++) {
    const b = { x: 0, z: -1e6, prevX: 0, prevZ: -1e6, y: 0, sin: 0, cos: 1, halfW: 0.95, halfL: 2.35, mass: 1500, vx: 0, vz: 0, angularVel: 0, parked: 'radar' };
    run.hooks.trafficBodies?.push(b);
    run.trafficBodies.push(b);
    bodies.push(b);
  }
  return { root, meshes, bodies, slots: new Map() };
}

function renderStream(run, dt) {
  const R = run.radar, W = R.streamCars, cm = run.hooks.controllerManager;
  const cars = R.stream?.cars || [];
  const live = new Set(cars.map((c) => c.id));
  for (const [id, slot] of W.slots) if (!live.has(id)) { slot.m.mesh.setMatrixAt(slot.i, HIDDEN); slot.m.free.push(slot.i); slot.m.dirty = true; W.slots.delete(id); }
  R.blinkT = (R.blinkT || 0) + dt;
  let b = 0;
  for (const c of cars) {
    let slot = W.slots.get(c.id);
    if (!slot) {
      const m = W.meshes[c.body] || W.meshes.sedan;
      if (!m.free.length) continue;
      slot = { m, i: m.free.pop() };
      W.slots.set(c.id, slot);
      _c.setHex(SWISS[c.paint % SWISS.length]);
      slot.m.mesh.geometry.attributes.paintColor.array.set([_c.r, _c.g, _c.b], slot.i * 3);
      slot.m.mesh.geometry.attributes.paintColor.needsUpdate = true;
    }
    const yaw = Math.atan2(c.tx, c.tz);
    const y = cm.getGroundHeight(c.x, c.z, 'car');
    const yF = cm.getGroundHeight(c.x + c.tx * 2, c.z + c.tz * 2, 'car'), yB = cm.getGroundHeight(c.x - c.tx * 2, c.z - c.tz * 2, 'car');
    _e.set(-Math.atan2(yF - yB, 4), yaw, 0);
    _m.compose(_pos.set(c.x, y, c.z), _q.setFromEuler(_e), _one);
    slot.m.mesh.setMatrixAt(slot.i, _m);
    slot.m.dirty = true;
    // the lamps (js/traffic.js carState: brake, left, right indicator, livery): the right indicator while it pulls in,
    // the hazard lights while it stands at the kerb
    const st = slot.m.mesh.geometry.attributes.carState.array, o = slot.i * 4;
    const brake = c.acc < -0.8 || c.speed < 0.3 ? 1 : 0;
    const pulling = c.held && (Math.abs(c.lat - RADAR.stopLat) > 0.15 || c.speed > 0.3), standing = c.held && !pulling;
    const on = R.blinkT % 0.8 < 0.4 ? 1 : 0;
    const left = standing ? on : 0, right = pulling || standing ? on : 0;
    if (st[o] !== brake || st[o + 1] !== left || st[o + 2] !== right) {
      st[o] = brake; st[o + 1] = left; st[o + 2] = right;
      slot.m.mesh.geometry.attributes.carState.needsUpdate = true;
    }
    // its body for the traffic
    const body = W.bodies[b++];
    if (body) {
      body.prevX = body.x; body.prevZ = body.z;
      Object.assign(body, { x: c.x, z: c.z, y, sin: c.tx, cos: c.tz, vx: c.tx * c.speed, vz: c.tz * c.speed });
    }
  }
  for (; b < W.bodies.length; b++) { const body = W.bodies[b]; if (body.z !== -1e6) Object.assign(body, { x: 0, z: -1e6, prevX: 0, prevZ: -1e6, vx: 0, vz: 0 }); }
  for (const m of Object.values(W.meshes)) if (m.dirty) { m.mesh.instanceMatrix.needsUpdate = true; m.dirty = false; }
}

function clearStream(run) {
  const W = run.radar?.streamCars;
  if (!W) return;
  for (const [, slot] of W.slots) { slot.m.mesh.setMatrixAt(slot.i, HIDDEN); slot.m.free.push(slot.i); slot.m.mesh.instanceMatrix.needsUpdate = true; }
  W.slots.clear();
  for (const body of W.bodies) Object.assign(body, { x: 0, z: -1e6, prevX: 0, prevZ: -1e6, vx: 0, vz: 0 });
}

/** What the commuters brake for: the traffic's cars on the stretch, the player (on foot or in the patrol car) on the road */
function streamObstacles(run, cm) {
  const R = run.radar, out = R.obstacles;
  out.length = 0;
  for (const rec of R.visits.values()) out.push({ s: rec.s, lat: rec.lat, speed: rec.v.speed, half: 2.3 });
  for (const [ent, half] of [[cm.getActiveEntity(), cm.activeMode === 'person' ? 0.4 : 2.3], [cm.activeMode === 'person' ? cm.entities.car : null, 2.3]]) {
    if (!ent) continue;
    const f = roadFrame(ent.position.x, ent.position.z);
    if (f.off < 5.5) out.push({ s: f.s, lat: f.lat, speed: 0, half });
  }
  return out;
}

// --- The traffic ---------------------------------------------------------------------------------------------------------
// The cars on the stretch, as the check sees them; each visit of the stretch gets an id of its own (the traffic hands
// its vehicles out again elsewhere when they leave)
function trafficCars(run) {
  const R = run.radar, tr = run.hooks.traffic;
  const seen = new Set();
  for (const v of tr?.cars || []) {
    if (!v.edge || v.parked) continue;
    const f = roadFrame(v.x, v.z);
    if (f.off > 7 || f.s <= 0.5 || f.s >= ROAD_LENGTH - 0.5 || v.tx * f.dx + v.tz * f.dz < 0.6) continue;
    let rec = R.visits.get(v);
    if (!rec) { rec = { id: ++R.nextId, v, kmh: null, v0: v.v0, car: { id: 0, x: 0, z: 0, tx: 0, tz: 1, speed: 0 } }; rec.car.id = rec.id; R.visits.set(v, rec); R.byId.set(rec.id, rec); }
    seen.add(v);
    rec.s = f.s; rec.lat = f.lat;
    Object.assign(rec.car, { x: v.x, z: v.z, tx: v.tx, tz: v.tz, speed: v.speed });
    R.cars.push(rec.car);
  }
  // the ones gone from the stretch: their own driver back
  for (const [v, rec] of R.visits) if (!seen.has(v) && rec.id !== R.heldId) endVisit(R, v, rec);
}
/** Where the car with this id is now: the traffic's vehicle or the commuter */
function carAt(R, id) {
  if (typeof id === 'number') return R.byId.get(id)?.v || null;
  return R.stream?.cars.find((c) => c.id === id) || null;
}
function endVisit(R, v, rec) {
  if (rec.kmh != null) v.v0 = rec.v0;
  R.visits.delete(v);
  R.byId.delete(rec.id);
}

/** Newly seen cars well up the road get their driver for the run: a speeder, one just at the limit, or the traffic's own */
function assignDrivers(run, check) {
  const R = run.radar;
  for (const rec of R.visits.values()) {
    if (rec.assigned || rec.s > RADAR.siteS - 90) { rec.assigned = true; continue; }
    rec.assigned = true;
    const d = chooseDriver(check);
    if (!d) continue;
    rec.kmh = d.kmh;
    rec.v0 = rec.v.v0;
    rec.v.v0 = d.kmh / 3.6;
    rec.v.speed = Math.max(rec.v.speed, rec.v.v0 * 0.8); // (out of sight still: up to its pace sooner)
  }
}

/** The stopped car: braking evenly to the kerb at the stop point, then standing there until the officer is done */
function holdStopped(run, check, dt) {
  const R = run.radar, st = check.stop;
  const rec = st ? R.byId.get(st.id) : null;
  if (R.heldId && (!rec || rec.id !== R.heldId)) releaseHeld(R);
  if (!rec) return;
  R.heldId = rec.id;
  const v = rec.v, f = roadFrame(v.x, v.z);
  const cap = STOP_S - f.s < 0.6 || st.phase === 'stopped' ? 0 : brakeSpeed(st, f.s);
  v.speed = Math.min(v.speed, cap);
  v.impactTime = Math.max(v.impactTime || 0, 0.3); // (js/traffic.js: a driver who does not accelerate for a moment)
  if (!v.bus) {
    v.dl += clamp(RADAR.stopLat - f.lat, -1.4 * dt, 1.4 * dt);
    v.dlv = 0;
  }
}
function releaseHeld(R) {
  const rec = R.byId.get(R.heldId);
  R.heldId = 0;
  if (!rec) return;
  rec.v.impactTime = 0;
  if (rec.kmh != null) { rec.v.v0 = rec.v0; rec.kmh = null; } // (calmer now)
}
function releaseAll(run) {
  const R = run.radar;
  if (!R) return;
  releaseHeld(R);
  for (const [v, rec] of [...R.visits]) endVisit(R, v, rec);
}

// --- The view through the laser -----------------------------------------------------------------------------------------
function setLaser(run, on) {
  const R = run.radar, cm = run.hooks.controllerManager, cam = run.hooks.cameraSystem?.camera;
  if (R.laserOn === on) return;
  R.laserOn = on;
  const person = cm.entities.person;
  if (on) {
    if (cm.activeMode === 'person') cm.teleportActiveTo(LASER_SPOT.x, LASER_SPOT.z, R.aim);
    run.lastPos?.copy(cm.getActiveEntity().position); // (the step onto the spot is no teleport)
    if (person?.mesh) { R.personHidden = person.mesh.visible; person.mesh.visible = false; }
    if (cam) { R.fov = cam.fov; cam.fov = LASER_FOV; cam.updateProjectionMatrix(); }
  } else {
    if (person?.mesh && R.personHidden != null) { person.mesh.visible = R.personHidden; R.personHidden = null; }
    if (cam && R.fov) { cam.fov = R.fov; cam.updateProjectionMatrix(); R.fov = null; }
    R.panL = R.panR = false;
  }
  run.hooks.actions?.notify();
}
const nearLaser = (run, cm) => {
  const p = cm.getActiveEntity().position;
  return cm.activeMode === 'person' && Math.hypot(p.x - LASER_SPOT.x, p.z - LASER_SPOT.z) <= LASER_REACH;
};

// --- The display -----------------------------------------------------------------------------------------------------------
function buildHud(run) {
  const R = run.radar;
  const style = el('style');
  style.textContent = STYLE;
  document.head.append(style);
  const box = el('div', 'radar-display');
  const head = el('div', 'radar-head');
  R.ui = {};
  R.ui.title = el('span', null, 'LASER · KAPO GR');
  const sign = el('span', 'radar-sign', String(RADAR.limit));
  head.append(R.ui.title, sign);
  const lcd = el('div', 'radar-lcd');
  R.ui.kmh = el('span', 'radar-kmh is-dim', '---');
  R.ui.unit = el('span', 'radar-unit', 'km/h');
  lcd.append(R.ui.kmh, R.ui.unit);
  const row = el('div', 'radar-row');
  R.ui.dist = el('span', null, '---.- m');
  R.ui.status = el('span', null, 'READY');
  row.append(R.ui.dist, R.ui.status);
  const bar = el('div', 'radar-lockbar');
  R.ui.lock = el('span');
  bar.append(R.ui.lock);
  const session = el('div', 'radar-session');
  R.ui.score = el('span');
  R.ui.time = el('span');
  session.append(R.ui.score, R.ui.time);
  box.append(head, lcd, row, bar, session);
  box.hidden = true;
  const toast = el('div', 'radar-toast');
  toast.hidden = true;
  const scope = el('div', 'radar-scope');
  scope.append(el('div', 'radar-cross'), el('div', 'radar-dot'));
  scope.hidden = true;
  const target = el('div', 'radar-box');
  target.hidden = true;
  const fine = el('div', 'radar-fine');
  fine.hidden = true;
  R.ui.fineHead = el('h3');
  R.ui.fineText = el('p');
  const buttons = el('div', 'radar-fine-buttons');
  R.ui.fineButtons = [...FINES.map((f) => f.key), 0].map((k) => {
    const b = el('button', k === 0 ? 'is-letgo' : null);
    b.type = 'button';
    b.addEventListener('click', () => { R.input.fine = k; });
    buttons.append(b);
    return { k, b };
  });
  fine.append(R.ui.fineHead, R.ui.fineText, buttons);
  document.body.append(box, toast, scope, target, fine);
  Object.assign(R.ui, { box, toast, scope, target, fine });
  run.cleanups.push(() => { for (const n of [style, box, toast, scope, target, fine]) n.remove(); });
}

const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const _p = new THREE.Vector3();

function renderHud(run, check, ctx) {
  const R = run.radar, u = R.ui, L = check.laser;
  const on = stepId(run) === 'check' && live(run);
  u.box.hidden = !on;
  u.scope.hidden = !(on && R.laserOn);
  if (!on) { u.toast.hidden = true; u.target.hidden = true; u.fine.hidden = true; return; }
  // the reading
  u.kmh.classList.toggle('is-dim', L.phase === 'idle' || L.phase === 'lock');
  u.kmh.classList.toggle('is-error', L.phase === 'error');
  const blink = Math.floor(check.t * 6) % 2 === 0;
  setText(u.kmh, L.phase === 'shown' ? String(L.kmh).padStart(3, '0') : L.phase === 'error' ? `E ${L.error}` : L.phase === 'lock' ? (blink ? '- - -' : '') : '---');
  u.unit.hidden = L.phase === 'error';
  setText(u.dist, L.dist != null && L.phase !== 'idle' ? `${L.dist.toFixed(1)} m` : '---.- m');
  setText(u.status, L.phase === 'lock' ? 'MEASURING' : L.phase === 'shown' ? 'READING' : L.phase === 'error' ? 'ERROR' : R.laserOn ? 'READY' : 'STANDBY');
  u.lock.style.transform = `scaleX(${L.phase === 'lock' ? clamp(L.lock / RADAR.lockTime, 0, 1) : L.phase === 'shown' ? 1 : 0})`;
  setText(u.score, `${t('Points')} ${Math.round(check.score)} · ${t('Stopped')} ${check.counts.stops}`);
  setText(u.time, check.t < RADAR.length ? clock(RADAR.length - check.t) : t('Time is up'));
  // the latest word
  const m = check.msg;
  const fresh = m && check.t - m.t < 3.2;
  u.toast.hidden = !fresh;
  if (fresh && u.toast.dataset.key !== `${m.t}|${m.text}`) {
    u.toast.dataset.key = `${m.t}|${m.text}`;
    u.toast.replaceChildren(document.createTextNode(m.text));
    if (m.points) u.toast.append(el('b', m.points > 0 ? 'is-plus' : 'is-minus', `${m.points > 0 ? '+' : ''}${m.points}`));
  }
  // the car in the laser's cone (the lock: the one being measured)
  const cam = ctx.camera;
  const lockCar = L.phase === 'lock' ? carAt(R, L.target) : null;
  const hover = !lockCar && R.laserOn ? laserTarget(R.cars, LASER_SPOT, R.aim) : null;
  const car = lockCar || (hover ? carAt(R, hover.car.id) : null);
  if (car && cam && R.laserOn) {
    _p.set(car.x, surfaceHeight(car.x, car.z) + 0.8, car.z).project(cam);
    const visible = _p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1;
    u.target.hidden = !visible;
    if (visible) {
      const d = Math.hypot(car.x - LASER_SPOT.x, car.z - LASER_SPOT.z);
      const px = clamp((2.2 / Math.max(d, 1)) / Math.tan((LASER_FOV * Math.PI) / 360) * innerHeight * 0.5, 14, 240);
      Object.assign(u.target.style, { left: `${((_p.x + 1) / 2) * innerWidth}px`, top: `${((1 - _p.y) / 2) * innerHeight}px`, width: `${px * 1.3}px`, height: `${px}px` });
      u.target.classList.toggle('is-lock', !!lockCar);
    }
  } else u.target.hidden = true;
  // the fine
  const st = check.stop;
  u.fine.hidden = !st?.atCar;
  if (st?.atCar) {
    setText(u.fineHead, t('Traffic stop'));
    setText(u.fineText, st.kmh != null
      ? `${t('Reading')} ${st.kmh} km/h · ${t('limit')} ${RADAR.limit} km/h · ${t('tolerance')} ${RADAR.tolerance} km/h`
      : t('No reading for this car'));
    const deLang = /^de\b/.test(document.documentElement.lang || '');
    for (const { k, b } of u.fineButtons) {
      const label = k === 0 ? t('Let go') : deLang ? FINES[k - 1].de : FINES[k - 1].label;
      const sub = k === 0 ? t('no offence') : FINES[k - 1].range;
      const key = String(k);
      if (b.dataset.label !== label + sub) {
        b.dataset.label = label + sub;
        b.replaceChildren(el('kbd', null, key), document.createTextNode(label), el('small', null, sub));
      }
    }
  }
}

function beep(run, high) {
  const a = run.audio?.audio;
  if (!run.audio?.live) return;
  const ctx = a.context, now = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = high ? 2200 : 1400;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + (high ? 0.18 : 0.08));
  o.connect(g).connect(a.mix);
  o.start(now);
  o.stop(now + 0.2);
}

// --- The feature ---------------------------------------------------------------------------------------------------------
const PAN_KEYS = { KeyA: 'L', ArrowLeft: 'L', KeyD: 'R', ArrowRight: 'R', KeyW: 'U', ArrowUp: 'U', KeyS: 'D', ArrowDown: 'D' };
const FINE_KEYS = { Digit0: 0, Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Numpad0: 0, Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4 };

const radarCheck = {
  // (the game's own controls step aside while the officer looks through the laser: nobody walks then)
  ownControls: (run) => !!run.radar?.laserOn,
  setup(run) {
    const R = run.radar = {
      laserOn: false, aim: AIM_HEADING, pitch: -0.012, cars: [], visits: new Map(), byId: new Map(), nextId: 0, heldId: 0,
      input: { measure: false, stop: false, fine: null }, pan: {}, signT: 0, lastPhase: 'idle', personHidden: null, fov: null
    };
    R.obstacles = [];
    R.stream = createStream(1 + Math.random() * 1e6);
    R.streamCars = buildStreamCars(run);
    R.tripod = buildTripod();
    R.sign = buildStopSign();
    run.group.add(R.tripod, R.sign);
    buildHud(run);
    const checking = () => stepId(run) === 'check' && live(run);
    const cm = run.hooks.controllerManager;
    run.actions([
      { id: 'radar-measure', primary: true, label: 'Measure', icon: 'i-fire', keys: ['Space'], keyboard: false, pad: 'a', when: () => checking() && R.laserOn, run: () => { R.input.measure = true; } },
      { id: 'radar-stop', primary: true, label: 'Stop sign', keys: ['KeyE'], keyboard: false, pad: 'b', when: () => checking() && cm.activeMode === 'person', run: () => { R.input.stop = true; } },
      { id: 'radar-laser', kind: 'toggle', primary: true, label: 'Laser', glyph: '◎', keys: ['KeyQ'], keyboard: false, pad: 'y', when: () => checking() && (R.laserOn || nearLaser(run, cm)), state: () => R.laserOn, run: () => setLaser(run, !R.laserOn) },
      { kind: 'hint', kbd: ['Drag', 'A', 'D'], label: 'Aim', when: () => checking() && R.laserOn }
    ]);
    // a drag on the view aims the laser, a click (not a drag) measures
    const canvas = document.getElementById('canvas-container');
    let down = null;
    run.listen(canvas, 'pointerdown', (e) => { if (R.laserOn && (e.pointerType !== 'mouse' || e.button === 0)) down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), id: e.pointerId }; });
    run.listen(window, 'pointermove', (e) => {
      if (!down || e.pointerId !== down.id || !R.laserOn) return;
      const k = (LASER_FOV / 56) * 0.0055;
      R.aim = wrap(R.aim - (e.clientX - down.lx) * k);
      R.pitch = clamp(R.pitch - (e.clientY - down.ly) * k, -0.12, 0.08);
      down.lx = e.clientX; down.ly = e.clientY;
    });
    run.listen(window, 'pointerup', (e) => {
      if (!down || e.pointerId !== down.id) return;
      if (R.laserOn && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 350) R.input.measure = true;
      down = null;
    });
    run.listen(window, 'keyup', (e) => { const p = PAN_KEYS[e.code]; if (p) R.pan[p] = false; });
    run.listen(window, 'blur', () => { R.pan = {}; });
  },
  teardown(run) {
    const R = run.radar;
    if (!R) return;
    setLaser(run, false);
    releaseAll(run);
  },
  reset(run) {
    const R = run.radar;
    setLaser(run, false);
    releaseAll(run);
    Object.assign(R, { aim: AIM_HEADING, pitch: -0.012, nextId: 0, heldId: 0, signT: 0, lastPhase: 'idle', pan: {}, started: false });
    R.input.measure = R.input.stop = false; R.input.fine = null;
    R.tripod.visible = false;
    R.sign.visible = false;
    clearStream(run);
    R.stream = createStream(1 + Math.random() * 1e6);
  },
  key(run, e) {
    const R = run.radar;
    if (stepId(run) !== 'check' || !live(run)) return;
    const cm = run.hooks.controllerManager;
    const swallow = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.code === 'KeyQ' && (R.laserOn || nearLaser(run, cm))) { swallow(); if (!e.repeat) setLaser(run, !R.laserOn); return; }
    if (e.code === 'KeyE' && cm.activeMode === 'person') { swallow(); if (!e.repeat) R.input.stop = true; return; }
    const st = run.state?.check?.stop;
    if (st?.atCar && e.code in FINE_KEYS) { swallow(); if (!e.repeat) R.input.fine = FINE_KEYS[e.code]; return; }
    if (!R.laserOn) return;
    if (e.code === 'Space' || e.code === 'Enter') { swallow(); if (!e.repeat) R.input.measure = true; return; }
    const p = PAN_KEYS[e.code];
    if (p) { swallow(); R.pan[p] = true; }
  },
  update(run, ctx, dt, cm) {
    const R = run.radar, id = stepId(run), check = run.state?.check;
    ctx.radarStep = live(run) ? id : null;
    R.tripod.visible = run.index >= 2 || (id === 'setup' && (run.state?.setup || 0) > 0);
    if (R.tripod.visible) {
      R.tripod.position.set(TRIPOD.x, surfaceHeight(TRIPOD.x, TRIPOD.z), TRIPOD.z);
      R.tripod.userData.head.rotation.set(-R.pitch, R.aim, 0, 'YXZ');
    }
    // the cars on the stretch: the traffic's and the commuters (they drive while the player is anywhere near)
    const p = cm.getActiveEntity().position;
    const checking = id === 'check' && live(run);
    R.cars.length = 0;
    if (live(run) && check && (checking || Math.hypot(p.x - LASER_SPOT.x, p.z - LASER_SPOT.z) < 900)) {
      trafficCars(run);
      if (checking) assignDrivers(run, check);
      stepStream(R.stream, check, dt, streamObstacles(run, cm));
      for (const c of R.stream.cars) R.cars.push(c);
    }
    if (!checking) { if (R.laserOn) setLaser(run, false); return; }
    // (the step has just begun: straight to the laser)
    if (!R.started) { R.started = true; if (nearLaser(run, cm)) setLaser(run, true); }
    if (R.laserOn && (cm.activeMode !== 'person' || !nearLaser(run, cm))) setLaser(run, false);
    // the aim: the keys pan it, a lock follows its car
    if (R.laserOn) {
      R.aim = wrap(R.aim + ((R.pan.L ? 1 : 0) - (R.pan.R ? 1 : 0)) * 0.22 * dt);
      R.pitch = clamp(R.pitch + ((R.pan.U ? 1 : 0) - (R.pan.D ? 1 : 0)) * 0.08 * dt, -0.12, 0.08);
      const lock = check.laser.phase === 'lock' ? carAt(R, check.laser.target) : null;
      if (lock) R.aim = wrap(R.aim + clamp(wrap(Math.atan2(lock.x - LASER_SPOT.x, lock.z - LASER_SPOT.z) - R.aim), -1.2 * dt, 1.2 * dt));
    }
    ctx.radar = { eye: { x: LASER_SPOT.x, z: LASER_SPOT.z }, aim: R.aim, laserOn: R.laserOn, player: { x: p.x, z: p.z, mode: cm.activeMode }, cars: R.cars, input: R.input };
    if (R.input.stop) R.signT = 2.5;
    if (R.input.measure && R.laserOn) beep(run, false);
  },
  after(run, ctx, dt, cm) {
    const R = run.radar, check = run.state?.check;
    if (!check) return;
    if (stepId(run) === 'check' && live(run)) holdStopped(run, check, dt);
    else if (R.heldId) releaseHeld(R);
    renderStream(run, dt);
    // (the reading's beep)
    if (check.laser.phase !== R.lastPhase) { if (check.laser.phase === 'shown') beep(run, true); R.lastPhase = check.laser.phase; }
    // (a stopped car is waiting: out of the laser's view once, so the walker and the stick come back to go to it; a phone
    // has no other way out while the display covers the small row)
    const stopPhase = check.stop?.phase || null;
    if (stopPhase === 'stopped' && R.lastStop !== 'stopped' && R.laserOn) setLaser(run, false);
    R.lastStop = stopPhase;
    R.input.measure = R.input.stop = false;
    R.input.fine = null;
    // the stop sign in the raised hand
    R.signT = Math.max(0, R.signT - dt);
    R.sign.visible = R.signT > 0 && cm.activeMode === 'person';
    if (R.sign.visible) {
      const e = cm.getActiveEntity(), h = AIM_HEADING;
      const x = e.position.x + Math.cos(h) * 0.4, z = e.position.z - Math.sin(h) * 0.4;
      R.sign.position.set(x, surfaceHeight(x, z) + 1.95, z);
      R.sign.rotation.set(0, h, 0);
    }
    renderHud(run, check, ctx);
    // the view through the laser
    const cam = ctx.camera;
    if (R.laserOn && cam && ctx.mode === 'person') {
      const y = surfaceHeight(LASER_SPOT.x, LASER_SPOT.z) + EYE;
      const c = Math.cos(R.pitch), dx = Math.sin(R.aim) * c, dz = Math.cos(R.aim) * c, dy = Math.sin(R.pitch);
      cam.position.set(LASER_SPOT.x - dx * 0.2, y, LASER_SPOT.z - dz * 0.2);
      cam.lookAt(LASER_SPOT.x + dx * 200, y + dy * 200, LASER_SPOT.z + dz * 200);
      cam.updateMatrixWorld();
    }
  }
};

export const RADAR_FEATURES = { radarCheck };
