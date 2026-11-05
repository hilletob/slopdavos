import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BODY_SPECS, buildCarGeometry, createLoftedCarMaterial, buildLightbarGeometry, createLightbarMaterial, buildSteerableWheelGeo } from './actor-models.js';
import { createPoliceCar } from './missions-props.js';
import { PersonCrowd, PersonRig, rollHairstyle } from './pedestrians.js';
import { releaseVehicle } from './hijack.js';
import { t, setLocalizedText } from './i18n.js';
import {
  ESCORT, ESCORT_ROUTE, WEF_GATES, ROADBLOCK, PICKUP, DROPOFF, escortRadio, escortBlocked, escortDelay, escortScore, roadblockPush, projectRoute, trailAt,
  MARCH, MARCH_ROUTE, MARCH_RHYTHM, MARCH_SLOGANS, FENCE, RALLY, marchCall, marchChoose, chantQuality, marchScore, yieldStep
} from './missions-data-wef.js';

// js/missions-wef.js
// The runtime of the WEF week's two missions (js/missions-data-wef.js has their definitions and logic):
//  - wefEscort: beside the policeCar feature of js/missions.js (the patrol car, K for the blue light): the three black
//    limousines and the chase car (one instanced draw of the traffic's estate, with its shared material), the security
//    gates with their fences, soldiers and barriers, the roadblock, J for the radio.
//  - wefMarch: the crowd (js/pedestrians.js PersonCrowd, mixed hairstyles by rollHairstyle) in ranks behind the player on
//    the recorded trail, the banner and the placards (an atlas drawn with t(), so in the player's language), the liaison's
//    car at the tail, the beat lane, the chant, the three calm answers.
// The traffic: js/traffic.js has no notion of a siren and the patrol car is not its player's business, so holdTraffic
// here works on its vehicles from outside (hooks.traffic, as js/gta.js gets it): the route ahead is a closure, what stands
// on it further off goes back to the traffic's pool (it respawns out of view); whatever is within reach of the convoy
// brakes to a stop (impactTime: a driver who does not accelerate) and eases out to the kerb (dl, the lane offset the
// traffic itself keeps); it drives on when the convoy has passed; what is already on a junction clears it. The convoy's
// cars are solid bodies for the traffic too (hooks.trafficBodies, like the trams). Everything is built on entry and
// disposed with the run (js/missions.js disposeTree).

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const setText = (node, text) => { if (node.textContent !== t(text)) setLocalizedText(node, text); };

// --- Styles -------------------------------------------------------------------------------------------------------------
const STYLE = `
.wf-hud{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:12;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#fff;width:min(460px,calc(100vw - 16px))}
.wf-card{width:100%;box-sizing:border-box;background:rgba(10,12,20,.78);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:8px 12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:13px}
.wf-row{display:flex;gap:12px;justify-content:space-between;align-items:baseline}
.wf-row b{font-size:17px;font-variant-numeric:tabular-nums}
.wf-label{opacity:.7;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-right:5px}
.wf-bar{position:relative;height:7px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden;margin-top:6px}
.wf-bar span{position:absolute;inset:0;transform-origin:left;background:#4fd67a}
.wf-bar.warn span{background:#ffc21a}.wf-bar.bad span{background:#ff5a4f}
.wf-say{min-height:18px;font-weight:700;text-align:center;text-shadow:0 1px 8px rgba(0,0,0,.8);font-size:14px}
.wf-pad{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(max(16px,env(safe-area-inset-bottom)) + 190px);z-index:13;display:none;flex-direction:column;gap:10px;align-items:flex-end}
.wf-btn{pointer-events:auto;touch-action:manipulation;border:0;border-radius:999px;min-height:50px;min-width:92px;padding:10px 18px;font:800 15px Inter,system-ui,sans-serif;color:#fff;background:linear-gradient(180deg,#3f8bff,#2257c9);box-shadow:0 5px 16px rgba(0,0,0,.35);cursor:pointer}
.wf-btn.sec{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);box-shadow:none}
.wf-btn.chant{background:linear-gradient(180deg,#ff8a4f,#d4552e);min-width:150px;min-height:56px;font-size:17px}
.wf-btn.chant.hit{filter:brightness(1.35)}
.wf-btn kbd{font:inherit;opacity:.7;margin-left:6px;font-size:12px}
body.touch-enabled .wf-pad{display:flex}
@media (pointer:coarse){.wf-pad{display:flex}}
.wf-pad.wf-pad-all{display:flex}
body.touch-enabled .wf-btn kbd{display:none}
body.touch-enabled .wf-hud{bottom:auto;top:calc(max(12px,env(safe-area-inset-top)) + 188px)}
.wf-lane{position:relative;height:26px;border-radius:13px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:6px}
.wf-lane i{position:absolute;left:34px;top:0;bottom:0;width:4px;background:#fff;opacity:.8}
.wf-lane u{position:absolute;left:0;top:5px;width:16px;height:16px;border-radius:50%;background:#ff8a4f;will-change:transform}
.wf-call{font:900 18px Inter,system-ui,sans-serif;text-align:center;min-height:24px;text-shadow:0 1px 8px rgba(0,0,0,.8)}
.wf-call.resp{color:#ffe14f}
.wf-dialog{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:30;width:min(440px,calc(100vw - 24px));box-sizing:border-box;background:rgba(10,12,20,.92);border:1px solid rgba(255,255,255,.2);border-radius:16px;padding:16px;color:#fff;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;gap:10px}
.wf-dialog[hidden],.wf-hud[hidden],.wf-pad[hidden]{display:none!important}
.wf-dialog h3{margin:0;font-size:16px}
.wf-dialog p{margin:0;font-size:14px;opacity:.85}
.wf-dialog .wf-btn{width:100%;text-align:left;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);box-shadow:none}
`;
function ensureStyle(run) {
  const s = el('style');
  s.textContent = STYLE;
  document.head.append(s);
  run.cleanups.push(() => s.remove());
}

// --- Merged scenery -------------------------------------------------------------------------------------------------------
function painted(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(hex), n = g.attributes.position.count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}
class Scenery {
  constructor(cm) { this.cm = cm; this.parts = []; }
  y(x, z) { return this.cm.getGroundHeight(x, z, 'car'); }
  box(x, y, z, w, h, d, yaw, hex) {
    this.parts.push(painted(new THREE.BoxGeometry(w, h, d).rotateY(yaw).translate(x, y, z), hex));
  }
  /** A site fence from a to b: posts and three rails, a panel every 3.5 m */
  fence(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 3.5)), yaw = Math.atan2(bz - az, -(bx - ax)) + Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const k0 = i / n, k1 = (i + 1) / n, x0 = ax + (bx - ax) * k0, z0 = az + (bz - az) * k0, x1 = ax + (bx - ax) * k1, z1 = az + (bz - az) * k1;
      const y0 = this.y(x0, z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, my = this.y(mx, mz), len = L / n;
      this.box(x0, y0 + 1.1, z0, 0.09, 2.2, 0.09, 0, 0x4d5358);
      for (const h of [0.4, 1.15, 2.05]) this.box(mx, my + h, mz, 0.05, 0.06, len, yaw, 0x7d858c);
      this.box(mx, my + 1.1, mz, 0.02, 1.8, len, yaw, 0x6c747b);
    }
  }
  /** A soldier in camouflage with a beret, the hands behind the back */
  soldier(x, z, yaw) {
    const y = this.y(x, z), add = (g, hex) => this.parts.push(painted(g.rotateY(yaw).translate(x, y, z), hex));
    add(new THREE.CapsuleGeometry(0.1, 0.5, 2, 6).translate(-0.12, 0.42, 0), 0x3f4a33);
    add(new THREE.CapsuleGeometry(0.1, 0.5, 2, 6).translate(0.12, 0.42, 0), 0x3f4a33);
    add(new THREE.CapsuleGeometry(0.21, 0.45, 2, 7).translate(0, 1.12, 0), 0x56603f);
    add(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.58, 0), 0xe0b896);
    add(new THREE.SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.55, 1.05).translate(0, 1.64, 0), 0x1f2a4d);
  }
  /** A pile of cleared snow */
  snow(x, z, r) {
    this.parts.push(painted(new THREE.SphereGeometry(r, 8, 5).scale(1.5, 0.5, 1).translate(x, this.y(x, z) + 0.1, z), 0xf1f5fa));
  }
  /** An army truck in olive */
  truck(x, z, yaw) {
    const y = this.y(x, z), add = (w, h, d, ox, oy, oz, hex) => this.parts.push(painted(new THREE.BoxGeometry(w, h, d).translate(ox, oy, oz).rotateY(yaw).translate(x, y, z), hex));
    add(2.3, 2.1, 4.2, 0, 1.75, -1, 0x4a5338);
    add(2.3, 1.7, 1.8, 0, 1.45, 2.1, 0x3d452f);
    add(2.35, 0.5, 6.3, 0, 0.55, 0, 0x22251d);
  }
  mesh(material) {
    const m = new THREE.Mesh(mergeGeometries(this.parts), material);
    for (const g of this.parts) g.dispose();
    this.parts.length = 0;
    m.name = 'WefScenery';
    m.castShadow = true;
    m.frustumCulled = false;
    return m;
  }
}
const sceneryMaterial = () => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });

/** A barrier arm of red and white, its pivot at the post: rotation.z lifts it. In `dir` across the road */
function barrierArm(material, x, y, z, yaw) {
  const parts = [];
  for (let i = 0; i < 5; i++) parts.push(painted(new THREE.BoxGeometry(1.4, 0.1, 0.08).translate(0.7 + i * 1.4, 0, 0), i % 2 ? 0xf2f2f0 : 0xd2232a));
  const arm = new THREE.Mesh(mergeGeometries(parts), material);
  for (const g of parts) g.dispose();
  arm.position.set(x, y + 1.05, z);
  arm.rotation.set(0, yaw, 0, 'YXZ');
  arm.castShadow = true;
  return arm;
}

const _p = { s: 0, d: 0 }, _tan = { x: 0, z: 0, dx: 0, dz: 1 };

/** A gate on the road at (gate.x, gate.z): fences along both kerbs, soldiers, a truck, a barrier arm to lift */
function buildGate(sc, material, gate, route, hw = 5) {
  projectRoute(route, gate.x, gate.z, 0, 0, 1e9, _p);
  const s0 = _p.s, side = (s, o) => { trailAt(route, s, _tan); return { x: _tan.x + _tan.dz * o, z: _tan.z - _tan.dx * o }; };
  for (const o of [hw, -hw]) {
    for (const [a, b] of [[-36, -18], [-18, -5], [5, 18], [18, 36]]) {
      const p = side(s0 + a, o), q = side(s0 + b, o);
      sc.fence(p.x, p.z, q.x, q.z);
    }
  }
  trailAt(route, s0, _tan);
  const tx = _tan.dx, tz = _tan.dz, nx = tz, nz = -tx, yaw = Math.atan2(tx, tz);
  sc.soldier(gate.x + nx * (hw + 1.3), gate.z + nz * (hw + 1.3), yaw + Math.PI / 2);
  sc.soldier(gate.x - nx * (hw + 1.3) + tx, gate.z - nz * (hw + 1.3) + tz, yaw - Math.PI / 2);
  sc.soldier(gate.x + nx * (hw + 1.3) - tx * 2.5, gate.z + nz * (hw + 1.3) - tz * 2.5, yaw + Math.PI / 2);
  sc.box(gate.x + nx * (hw + 3), sc.y(gate.x, gate.z) + 1.2, gate.z + nz * (hw + 3), 2.2, 2.4, 2.2, yaw, 0x8c9093); // the guard hut
  sc.truck(gate.x - nx * (hw + 3.4) - tx * 9, gate.z - nz * (hw + 3.4) - tz * 9, yaw);
  for (const k of [-24, -12, 12, 26]) sc.snow(gate.x + nx * (hw - 0.8) * (k % 2 ? 1 : -1) + tx * k, gate.z + nz * (hw - 0.8) * (k % 2 ? 1 : -1) + tz * k, 1.3);
  const px = gate.x + nx * hw, pz = gate.z + nz * hw;
  return barrierArm(material, px, sc.y(px, pz), pz, yaw + Math.PI / 2);
}

/** A closure across the road at `at`, across `dir` (dx, dz), half width hw */
function buildClosure(sc, at, dx, dz, hw) {
  const nx = dz, nz = -dx;
  sc.fence(at.x - nx * hw, at.z - nz * hw, at.x + nx * hw, at.z + nz * hw);
  for (const k of [-3.2, 0, 3.2]) sc.soldier(at.x + nx * k - dx * 1.8, at.z + nz * k - dz * 1.8, Math.atan2(-dx, -dz));
  sc.snow(at.x + nx * (hw + 1), at.z + nz * (hw + 1), 1.6);
  sc.snow(at.x - nx * (hw + 1), at.z - nz * (hw + 1), 1.6);
}

// --- The traffic holds back -----------------------------------------------------------------------------------------------
const CLOSURE_R = 11; // m round each of the route's points ahead
/** The route's points ahead of arc length s, from `from` m on, every 25 m up to `to` m */
function closureAhead(route, s, from, to) {
  const out = [];
  for (let k = from; k <= to; k += 25) { const p = trailAt(route, s + k); out.push({ x: p.x, z: p.z }); }
  return out;
}

/** A view from above and behind in the chase camera's place, so that the convoy or the crowd behind the player shows.
 *  (V and a drag on the view still give the player's own cameras) */
function followCamera(run, ctx, dt, back, up, ahead) {
  const cs = run.hooks.cameraSystem, wf = run.wf, cam = ctx.camera;
  if (!cam || cs.activePresetId !== 'chase' || cs.isDragging || cs.userOrbitTimer > 0) { wf.camH = null; return; }
  if (wf.camH == null) wf.camH = ctx.heading;
  let d = ctx.heading - wf.camH;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  wf.camH += d * Math.min(1, dt * 1.6);
  const sx = Math.sin(wf.camH), sz = Math.cos(wf.camH);
  cam.position.set(ctx.x - sx * back, ctx.y + up, ctx.z - sz * back);
  cam.lookAt(ctx.x + sx * ahead, ctx.y + 1, ctx.z + sz * ahead);
  cam.updateMatrixWorld();
}

function holdTraffic(run, pts, radius, dt, closure = null) {
  const tr = run.hooks.traffic;
  if (!tr) return;
  const r2 = radius * radius;
  for (const list of [tr.cars, tr.buses, tr.bikes]) {
    for (const v of list || []) {
      if (!v.edge || v.parked || v.held) continue;
      // the closed route ahead: back to the pool (js/hijack.js releaseVehicle; the occupancy is rebuilt each frame)
      if (closure && closure.some((p) => Math.abs(v.x - p.x) < CLOSURE_R && Math.abs(v.z - p.z) < CLOSURE_R)) {
        v.conn = v.trail = v.commit = v.move = null;
        v.speed = 0;
        v._wefSide = 0;
        releaseVehicle(v);
        continue;
      }
      if (v.conn) continue; // (on a junction: it clears the way by driving on)
      let near = false;
      for (const p of pts) {
        const dx = v.x - p.x, dz = v.z - p.z;
        if (Math.abs(dx) < radius && Math.abs(dz) < radius && dx * dx + dz * dz < r2) { near = true; break; }
      }
      if (!near) { if (v._wefSide) v._wefSide = 0; continue; }
      const y = yieldStep(v.speed, v._wefSide || 0, dt);
      v.speed = y.speed;
      v.impactTime = Math.max(v.impactTime, 0.25); // (js/traffic.js: a driver who does not accelerate for a moment)
      if (!v.bus) { v._wefSide = y.side; v.dl = Math.max(v.dl, y.side); v.dlv = 0; }
    }
  }
}
function releaseTraffic(run) {
  run.hooks.vbd?.setClosure?.(null);
  const tr = run.hooks.traffic;
  if (!tr) return;
  for (const list of [tr.cars, tr.buses, tr.bikes]) for (const v of list || []) if (v._wefSide) v._wefSide = 0;
}

/** A traffic body (js/traffic.js tramBodies) for something on the trail */
function trafficBody(run, halfL = 2.4) {
  const b = { x: 0, z: -1e6, prevX: 0, prevZ: -1e6, y: 0, sin: 0, cos: 1, halfW: 0.95, halfL, mass: 1800, vx: 0, vz: 0, angularVel: 0, parked: 'wef' };
  run.hooks.trafficBodies?.push(b);
  run.trafficBodies.push(b);
  return b;
}
function placeBody(b, f, y) {
  b.prevX = b.x; b.prevZ = b.z;
  b.x = f.x; b.z = f.z; b.y = y;
  b.sin = f.dx; b.cos = f.dz;
  b.vx = f.dx * f.v; b.vz = f.dz * f.v;
}

// =========================================================================================================================
// 1. The escort
const LIMO_STRETCH = 1.12;
const CONVOY = 4;
const _m = new THREE.Matrix4(), _pos = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m2 = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _wp = new THREE.Vector3(), _ax = new THREE.Vector3(1, 0, 0), _one = new THREE.Vector3(1, 1, 1);

function buildConvoy(run) {
  const spec = BODY_SPECS.sedan, root = new THREE.Group();
  root.name = 'WefConvoy';
  const geo = buildCarGeometry(spec, true);
  const paint = new Float32Array(3 * CONVOY), state = new Float32Array(4 * CONVOY);
  for (let i = 0; i < CONVOY; i++) {
    const police = i === CONVOY - 1;
    paint.set(police ? [0.92, 0.93, 0.94] : [0.018, 0.02, 0.025], i * 3);
    state.set([0, 0, 0, police ? 1 : 0], i * 4);
  }
  geo.setAttribute('paintColor', new THREE.InstancedBufferAttribute(paint, 3));
  geo.setAttribute('carState', new THREE.InstancedBufferAttribute(state, 4));
  const mat = createLoftedCarMaterial(spec);
  mat.userData.shared = true; // (cached by js/actor-models.js, the traffic's own)
  const bodies = new THREE.InstancedMesh(geo, mat, CONVOY);
  bodies.castShadow = true;
  bodies.frustumCulled = false;
  const wheelMat = createLoftedCarMaterial(spec, 0x202326);
  wheelMat.userData.shared = true;
  const wheels = [-1, 1].map((sideSign) => {
    const m = new THREE.InstancedMesh(buildSteerableWheelGeo(spec, sideSign), wheelMat, CONVOY * 2);
    m.frustumCulled = false;
    m.castShadow = true;
    m.userData.side = sideSign;
    return m;
  });
  const barMat = createLightbarMaterial();
  barMat.userData.shared = true;
  const bar = new THREE.InstancedMesh(buildLightbarGeometry(spec), barMat, 1);
  bar.frustumCulled = false;
  bar.castShadow = true;
  root.add(bodies, ...wheels, bar);
  return { root, bodies, wheels, bar, spec, state, spin: 0 };
}

function placeConvoy(w, convoy, cm, dt) {
  const { bodies, wheels, bar, spec, state } = w;
  let brakeChanged = false, spinMean = 0;
  convoy.forEach((f, i) => {
    const police = i === CONVOY - 1, stretch = police ? 1 : LIMO_STRETCH, yaw = Math.atan2(f.dx, f.dz);
    const y = cm.getGroundHeight(f.x, f.z, 'car');
    const yF = cm.getGroundHeight(f.x + f.dx * 2, f.z + f.dz * 2, 'car'), yB = cm.getGroundHeight(f.x - f.dx * 2, f.z - f.dz * 2, 'car');
    _e.set(-Math.atan2(yF - yB, 4), yaw, 0);
    _q.setFromEuler(_e);
    _m.compose(_pos.set(f.x, y, f.z), _q, _s.set(1, 1, stretch));
    bodies.setMatrixAt(i, _m);
    if (police) { _m.compose(_pos, _q, _one); bar.setMatrixAt(0, _m); }
    spinMean += f.v;
    const brake = f.v < 0.3 ? 1 : 0;
    if (state[i * 4] !== brake) { state[i * 4] = brake; brakeChanged = true; }
    _m.compose(_pos, _q, _one);
    for (const wm of wheels) {
      [spec.wheelZ * stretch, -spec.wheelZ * stretch].forEach((wz, k) => {
        _m2.compose(_wp.set(wm.userData.side * spec.wheelX, spec.wheelRadius, wz), _wq.setFromAxisAngle(_ax, w.spin), _one);
        _m2.premultiply(_m);
        wm.setMatrixAt(i * 2 + k, _m2);
      });
    }
  });
  w.spin += (spinMean / CONVOY) * dt / 0.35;
  if (brakeChanged) bodies.geometry.attributes.carState.needsUpdate = true;
  bodies.instanceMatrix.needsUpdate = true;
  bar.instanceMatrix.needsUpdate = true;
  for (const wm of wheels) wm.instanceMatrix.needsUpdate = true;
}

const wefEscort = {
  setup(run) {
    ensureStyle(run);
    const cm = run.hooks.controllerManager;
    const mat = sceneryMaterial();
    const sc = new Scenery(cm);
    const wf = run.wf = { arms: [], convoy: buildConvoy(run), bodies: [] };
    for (const g of WEF_GATES) {
      const arm = buildGate(sc, mat, g, ESCORT_ROUTE);
      arm.userData.gate = g;
      wf.arms.push(arm);
      run.group.add(arm);
    }
    // the Kongresszentrum's perimeter along the Talstrasse, and the door
    sc.fence(84, -388, 168, -438);
    sc.fence(190, -456, 196, -486);
    sc.soldier(DROPOFF.x + 5, DROPOFF.z + 6, Math.PI);
    sc.soldier(DROPOFF.x - 5, DROPOFF.z + 6, Math.PI);
    // the roadblock: a closure across the Promenade, the broken-down snow blower in orange in front of it
    const rb = ROADBLOCK, dx = 0.763, dz = 0.647; // (the Promenade's way here, towards the fence)
    buildClosure(sc, { x: rb.x - dx * 3, z: rb.z - dz * 3 }, -dx, -dz, 5);
    const ry = sc.y(rb.x, rb.z);
    sc.box(rb.x + dx * 2, ry + 1.2, rb.z + dz * 2, 2.4, 2.1, 4.2, Math.atan2(dx, dz), 0xe2701c);
    sc.box(rb.x + dx * 5, ry + 0.9, rb.z + dz * 5, 2.9, 1.5, 1.4, Math.atan2(dx, dz), 0xc9c9c4);
    // snow cleared to the kerbs along the way, and at the station
    for (const k of [120, 300, 480, 640, 860, 1040, 1300, 1560, 1900, 2240]) {
      trailAt(ESCORT_ROUTE, k, _tan);
      sc.snow(_tan.x + _tan.dz * 5.4, _tan.z - _tan.dx * 5.4, 1.5);
      sc.snow(_tan.x - _tan.dz * 5.4 + _tan.dx * 8, _tan.z + _tan.dx * 5.4 + _tan.dz * 8, 1.2);
    }
    sc.snow(PICKUP.x + 8, PICKUP.z - 10, 1.6);
    run.group.add(sc.mesh(mat));
    run.storage(wf.convoy.root);
    run.group.add(wf.convoy.root);
    for (let i = 0; i < CONVOY; i++) wf.bodies.push(trafficBody(run));
    wefEscort.buildHud(run);
  },
  buildHud(run) {
    const wf = run.wf;
    const hud = el('div', 'wf-hud');
    const card = el('div', 'wf-card');
    const row = el('div', 'wf-row');
    const stat = (label) => { const s = el('span'); s.append(el('span', 'wf-label', label)); const b = el('b', null, '–'); s.append(b); row.append(s); return b; };
    wf.ui = { hud, gap: stat('Gap'), composure: stat('Composure'), schedule: stat('Schedule') };
    const bar = el('div', 'wf-bar'), fill = el('span');
    bar.append(fill);
    wf.ui.bar = bar; wf.ui.fill = fill;
    wf.ui.say = el('div', 'wf-say');
    card.append(row, bar);
    hud.append(wf.ui.say, card);
    document.body.append(hud);
    const pad = el('div', 'wf-pad');
    const blue = el('button', 'wf-btn', 'Blue light'), radio = el('button', 'wf-btn sec', 'Radio');
    blue.type = radio.type = 'button';
    run.listen(blue, 'pointerdown', (e) => { e.preventDefault(); run.features.policeCar?.key(run, { code: 'KeyK', repeat: false }); });
    run.listen(radio, 'pointerdown', (e) => { e.preventDefault(); wefEscort.radio(run); });
    pad.append(blue, radio);
    document.body.append(pad);
    run.cleanups.push(() => { hud.remove(); pad.remove(); });
    wf.ui.pad = pad;
  },
  radio(run) {
    if (run.phase !== 'running' && run.phase !== 'ready') return;
    if (escortRadio(run.state.escort, { t: run.elapsed })) run.audio.thump();
  },
  reset(run) {
    const wf = run.wf;
    releaseTraffic(run);
    wf.camH = null;
    for (const a of wf.arms) a.rotation.z = 0;
    placeConvoy(wf.convoy, run.state.escort.convoy, run.hooks.controllerManager, 0);
    wf.lastSay = null;
  },
  teardown(run) { releaseTraffic(run); },
  key(run, e) {
    if (run.phase === 'intro') return;
    if (e.code === 'KeyJ' && !e.repeat) { e.preventDefault(); wefEscort.radio(run); }
    // (the door stays shut: F and G would climb out of the car and end the run)
    if (e.code === 'KeyF' || e.code === 'KeyG') { e.preventDefault(); e.stopImmediatePropagation(); }
  },
  update(run, ctx, dt, cm) {
    const st = run.state.escort, wf = run.wf;
    // the roadblock stops the car
    const ent = cm.getActiveEntity();
    const pushed = roadblockPush(ent.position.x, ent.position.z);
    if (pushed.hit) {
      ent.position.x = pushed.x; ent.position.z = pushed.z;
      ent.speed = 0;
      if ('vx' in ent) { ent.vx = 0; ent.vz = 0; }
      escortBlocked(st, ctx);
    }
    // the blue light clears the way ahead; the convoy's own cars are held for
    if (ctx.blueLight) holdTraffic(run, [{ x: ctx.x + Math.sin(ctx.heading) * 25, z: ctx.z + Math.cos(ctx.heading) * 25 }, ctx, st.convoy[0], st.convoy[3]], 32, dt, st.boarded ? closureAhead(ESCORT_ROUTE, st.routeS, 45, 145) : null);
    // the barriers lift as the car comes up
    for (const a of wf.arms) {
      const g = a.userData.gate, open = Math.hypot(ctx.x - g.x, ctx.z - g.z) < 60;
      a.rotation.z += clamp((open ? 1.45 : 0) - a.rotation.z, -1.4 * dt, 1.4 * dt);
    }
    st.convoy.forEach((f, i) => placeBody(wf.bodies[i], f, cm.getGroundHeight(f.x, f.z, 'car')));
  },
  after(run, ctx, dt, cm) {
    const st = run.state.escort, ui = run.wf.ui;
    placeConvoy(run.wf.convoy, st.convoy, cm, dt);
    followCamera(run, ctx, dt, 30, 13, 20);
    const gap = Math.round(st.gap), bad = st.gap > ESCORT.gapWarn, warn = st.gap > ESCORT.gapGood;
    ui.gap.textContent = st.boarded ? `${gap} m` : '–';
    ui.composure.textContent = `${Math.round(st.composure)}`;
    const delay = st.boarded ? Math.round(escortDelay(st)) : 0;
    ui.schedule.textContent = `${delay > 0 ? '+' : ''}${delay} s`;
    ui.bar.className = `wf-bar${bad ? ' bad' : warn ? ' warn' : ''}`;
    ui.fill.style.transform = `scaleX(${clamp(1 - st.gap / ESCORT.gapLost, 0, 1)})`;
    const showing = st.last && ctx.t - st.lastAt < 4000 ? st.last : '';
    setText(ui.say, showing);
    ui.hud.hidden = ui.pad.hidden = run.phase === 'done' || run.phase === 'intro' || run.phase === 'failed' || run.phase === 'aborted';
  }
};

// =========================================================================================================================
// 2. The march
const RANK = 5, RANK_GAP = 1.6, FILE_GAP = 1.25;
const SIGNS = ['FAIR TAXES', 'CLIMATE NOW', 'MORE FONDUE, FEWER HELICOPTERS'];

/** The banner and the placards' texture: drawn with t(), so in the player's language */
function drawAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f4efe2'; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#c0301e'; g.fillRect(0, 0, 1024, 14); g.fillRect(0, 114, 1024, 14);
  const fit = (text, x, y, w, size) => {
    let s = size;
    do { g.font = `900 ${s}px Inter,system-ui,sans-serif`; s -= 2; } while (g.measureText(text).width > w && s > 14);
    g.fillText(text, x, y);
  };
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#1b1b1b';
  fit(t('DAVOS FOR THE DAVOSERS'), 512, 66, 980, 74);
  const colours = ['#ffe14f', '#bfe8c4', '#ffd0c0'];
  SIGNS.forEach((text, i) => {
    const x = i * 341;
    g.fillStyle = colours[i]; g.fillRect(x + 2, 130, 337, 250);
    g.fillStyle = '#1b1b1b';
    const words = t(text).split(' '), lines = [];
    let line = '';
    for (const w of words) { if ((line + ' ' + w).length > 11 && line) { lines.push(line); line = w; } else line = line ? `${line} ${w}` : w; }
    lines.push(line);
    lines.forEach((l, k) => fit(l, x + 170, 255 + (k - (lines.length - 1) / 2) * 56, 310, 52));
  });
  g.fillStyle = '#3b2c20'; g.fillRect(0, 400, 1024, 112); // (the sticks' colour)
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
const STICK_UV = [0.5, 1 - 450 / 512];

/** A flat sign with both faces readable; (u0, v0)-(u1, v1) in the atlas */
function signGeometry(w, h, u0, v0, u1, v1, y, z = 0) {
  const front = new THREE.PlaneGeometry(w, h), back = new THREE.PlaneGeometry(w, h).rotateY(Math.PI);
  for (const g of [front, back]) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    g.translate(0, y, z);
  }
  return [front, back];
}
function stickGeometry(h, x, r = 0.025) {
  const g = new THREE.CylinderGeometry(r, r, h, 5);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, STICK_UV[0], STICK_UV[1]);
  return g.translate(x, h / 2, 0);
}
const mergeOwn = (parts) => {
  const m = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  for (const g of parts) g.dispose();
  return m;
};

function drumOf(audio) {
  const live = () => !!(audio && audio.enabled && audio.context && audio.context.state === 'running' && audio.mix);
  let noise = null;
  return {
    live,
    beat(vol = 0.3) {
      if (!live()) return;
      const c = audio.context, at = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(50, at + 0.1);
      g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
      o.connect(g).connect(audio.mix); o.start(at); o.stop(at + 0.18);
    },
    megaphone() {
      if (!live()) return;
      const c = audio.context, at = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = 'square'; o.frequency.value = 410;
      f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
      g.gain.setValueAtTime(0.18, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      o.connect(f).connect(g).connect(audio.mix); o.start(at); o.stop(at + 0.24);
    },
    roar(vol = 0.2, dur = 1.1) {
      if (!live()) return;
      const c = audio.context, at = c.currentTime;
      if (!noise) {
        noise = c.createBuffer(1, c.sampleRate * 1.2, c.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noise;
      f.type = 'bandpass'; f.frequency.value = 780; f.Q.value = 0.8;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.1); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      s.connect(f).connect(g).connect(audio.mix); s.start(at, 0, dur);
    }
  };
}

const wefMarch = {
  // (js/missions.js hides the game's own controls while this is true: talking to the police liaison (answers 1 2 3); the march keeps them)
  ownControls: (run) => !!run.state?.march?.dialog,
  setup(run) {
    ensureStyle(run);
    const cm = run.hooks.controllerManager;
    const wf = run.wf = { people: [], placards: [], bodies: [], lastBar: -1, lastBeat: -1 };
    // the crowd
    const crowd = wf.crowd = new PersonCrowd(MARCH.maxCount, { farDistance: 45, castShadow: false });
    for (const m of crowd.meshes) run.group.add(m);
    for (let i = 0; i < MARCH.maxCount; i++) {
      const seed = ((i + 11) * 0.6180339) % 1, female = i % 2 === 0;
      const rig = new PersonRig({ seed, female, ...rollHairstyle(((i + 5) * 0.7548776) % 1, female), girth: 0.92 + ((i * 3) % 7) * 0.035, scale: 0.94 + ((i * 5) % 7) * 0.016, armSwing: 0.8 });
      wf.people.push({ rig, row: Math.floor(i / RANK), file: (i % RANK) - (RANK - 1) / 2, wob: (i * 2.4) % 6.28, y: 0, yAt: -1 });
    }
    // the banner and the placards
    const tex = wf.tex = drawAtlas();
    const mat = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.85, side: THREE.FrontSide });
    const bannerGeo = mergeOwn([...signGeometry(4.6, 0.72, 0, 1 - 128 / 512, 1, 1, 2.0), stickGeometry(2.4, -2.3), stickGeometry(2.4, 2.3)]);
    wf.banner = new THREE.Mesh(bannerGeo, mat);
    wf.banner.frustumCulled = false;
    wf.banner.castShadow = true;
    run.group.add(wf.banner);
    const each = Math.ceil(MARCH.maxCount / 4 / SIGNS.length);
    wf.signMeshes = SIGNS.map((_, i) => {
      const u0 = (i * 341 + 2) / 1024, u1 = (i * 341 + 339) / 1024;
      const geo = mergeOwn([...signGeometry(0.72, 0.54, u0, 1 - 380 / 512, u1, 1 - 130 / 512, 2.3), stickGeometry(2.1, 0)]);
      const m = new THREE.InstancedMesh(geo, mat, each);
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = true;
      return m;
    });
    for (const m of wf.signMeshes) run.group.add(m);
    // the megaphone in the player's hand
    const megaphone = wf.megaphone = new THREE.Mesh(mergeOwn([painted(new THREE.CylinderGeometry(0.13, 0.04, 0.34, 10).rotateX(Math.PI / 2).translate(0, 0, 0.17), 0xf2f2f0), painted(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6).translate(0, -0.1, 0.02), 0xd2232a)]), sceneryMaterial());
    megaphone.castShadow = true;
    run.group.add(megaphone);
    // the fence, soldiers, snow, a tail car
    const sc = new Scenery(cm), smat = sceneryMaterial();
    const dx = 0.763, dz = 0.647; // (along the Promenade, against the march)
    buildClosure(sc, FENCE, dx, dz, 5);
    for (const [ax, az, bx, bz] of [[FENCE.x + 3.3, FENCE.z - 3.8, FENCE.x + 26, FENCE.z - 28], [FENCE.x - 3.2, FENCE.z + 3.8, FENCE.x - 28, FENCE.z + 26]]) sc.fence(ax, az, bx, bz);
    for (const k of [50, 110, 170, 240, 320, 400]) {
      trailAt(MARCH_ROUTE, k, _tan);
      sc.snow(_tan.x + _tan.dz * 5.2, _tan.z - _tan.dx * 5.2, 1.4);
    }
    sc.snow(RALLY.x + 6, RALLY.z - 5, 1.8);
    run.group.add(sc.mesh(smat));
    wf.tailCar = run.storage(createPoliceCar());
    wf.tailCar.userData.lightbar.visible = true;
    run.group.add(wf.tailCar);
    run.storage(run.group);
    wf.body = trafficBody(run);
    wf.drum = drumOf(run.hooks.audio);
    wefMarch.buildHud(run);
  },
  buildHud(run) {
    const wf = run.wf;
    const hud = el('div', 'wf-hud'), card = el('div', 'wf-card'), row = el('div', 'wf-row');
    const stat = (label) => { const s = el('span'); s.append(el('span', 'wf-label', label)); const b = el('b', null, '–'); s.append(b); row.append(s); return b; };
    const ui = wf.ui = { hud, count: stat('Marchers'), morale: stat('Morale'), chant: stat('Chant'), call: el('div', 'wf-call'), say: el('div', 'wf-say'), lane: el('div', 'wf-lane'), notes: [] };
    ui.lane.append(el('i'));
    for (let i = 0; i < 5; i++) { const u = el('u'); ui.lane.append(u); ui.notes.push(u); }
    const button = el('button', 'wf-btn chant', 'Call');
    button.type = 'button';
    button.append(el('kbd', null, 'Space'));
    run.listen(button, 'pointerdown', (e) => { e.preventDefault(); wefMarch.call(run); });
    ui.button = button;
    card.append(row, ui.lane);
    hud.append(ui.say, ui.call, card);
    document.body.append(hud);
    const pad = ui.pad = el('div', 'wf-pad wf-pad-all');
    pad.append(button);
    document.body.append(pad);
    const dialog = el('div', 'wf-dialog');
    dialog.hidden = true;
    ui.dialog = dialog;
    ui.dialogTitle = el('h3', null, 'The police liaison');
    ui.dialogText = el('p');
    dialog.append(ui.dialogTitle, ui.dialogText);
    for (const [choice, label, key] of [['stop', 'Stop and talk', '1'], ['sit', 'Sit-in, in the snow', '2'], ['back', 'Turn back to the agreed route', '3']]) {
      const b = el('button', 'wf-btn', label);
      b.type = 'button';
      b.append(el('kbd', null, key));
      run.listen(b, 'pointerdown', (e) => { e.preventDefault(); wefMarch.choose(run, choice); });
      dialog.append(b);
    }
    document.body.append(dialog);
    run.cleanups.push(() => { hud.remove(); pad.remove(); dialog.remove(); });
  },
  call(run) {
    if (run.phase !== 'running' && run.phase !== 'ready') return;
    const since = run.wf.frameAt ? Math.min(0.05, (performance.now() - run.wf.frameAt) / 1000) : 0;
    const r = marchCall(run.state.march, { t: run.elapsed }, since);
    if (r?.grade === 'perfect' || r?.grade === 'good') run.wf.drum.megaphone();
    run.wf.ui.button.classList.add('hit');
    setTimeout(() => run.wf?.ui.button.classList.remove('hit'), 90);
  },
  choose(run, choice) {
    if (marchChoose(run.state.march, choice, { t: run.elapsed })) run.wf.drum.roar(0.14, 0.7);
  },
  key(run, e) {
    if (run.phase === 'intro') return;
    const st = run.state?.march;
    if (e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) wefMarch.call(run); }
    if (e.code === 'KeyF' || e.code === 'KeyG' || e.code === 'KeyT') { e.preventDefault(); e.stopImmediatePropagation(); }
    if (st?.dialog && !e.repeat) {
      const choice = { Digit1: 'stop', Digit2: 'sit', Digit3: 'back' }[e.code];
      if (choice) { e.preventDefault(); e.stopImmediatePropagation(); wefMarch.choose(run, choice); }
    }
  },
  reset(run) {
    const wf = run.wf;
    releaseTraffic(run);
    wf.camH = null;
    for (const p of wf.people) { p.rig.placed = false; p.yAt = -1; }
    wf.lastBar = -1; wf.lastBeat = -1;
    wefMarch.pose(run, 0, run.hooks.controllerManager);
  },
  teardown(run) { releaseTraffic(run); },
  update(run, ctx, dt, cm) {
    const st = run.state.march, wf = run.wf, ent = cm.getActiveEntity();
    // nobody runs with a megaphone; the talk with the liaison holds everybody up
    const max = st.dialog || st.action?.kind === 'sit' ? 0 : MARCH.playerMax;
    ent.speed = clamp(ent.speed, -Math.min(2.5, max || 0), max);
    holdTraffic(run, [ctx, st.crowd, st.tail], 32, dt, closureAhead(MARCH_ROUTE, st.routeS, 30, 105));
    // the VBD's buses (js/vbd.js, not the traffic's): the march's street is closed to them from behind the crowd to
    // well ahead, so that none comes towards it; they wait short of it or are diverted
    run.hooks.vbd?.setClosure?.({ pts: [ctx, st.crowd, st.tail, ...closureAhead(MARCH_ROUTE, Math.max(0, st.routeS - 60), 0, 420)], r: 16 });
    wf.frameAt = performance.now();
    placeBody(wf.body, st.tail, cm.getGroundHeight(st.tail.x, st.tail.z, 'car'));
    wefMarch.chantBeats(run);
  },
  /** The drum on the beat, the crowd's roar on the answer */
  chantBeats(run) {
    const st = run.state.march, wf = run.wf, beat = MARCH_RHYTHM.beat;
    if (st.dialog) return;
    const b = Math.floor(st.songT / beat);
    if (b === wf.lastBeat) return;
    wf.lastBeat = b;
    const k = b - MARCH_RHYTHM.countIn;
    if (k < 0) { wf.drum.beat(0.12); return; }
    const bar = Math.floor(k / 4), inBar = k % 4;
    wf.drum.beat(inBar === 0 ? 0.3 : 0.18);
    if (bar % 2 === 1 && inBar === 0) {
      // (the louder the better the chant went)
      wf.drum.roar(0.08 + 0.2 * (st.morale / 100), 1.3);
    }
  },
  pose(run, dt, cm) {
    const st = run.state.march, wf = run.wf, cam = run.hooks.cameraSystem.camera;
    const sit = st.action?.kind === 'sit' || st.arrived;
    let y = 0;
    const ground = () => y;
    wf.crowd.begin();
    wf.gameT = (wf.gameT || 0) + dt;
    const counts = wf.signMeshes.map(() => 0);
    const heldUp = st.dialog || st.action?.kind === 'stop';
    for (let i = 0; i < st.count; i++) {
      const p = wf.people[i], s = st.crowd.s - p.row * RANK_GAP;
      trailAt(st.trail, s, _tan);
      const nx = _tan.dz, nz = -_tan.dx, wob = Math.sin(wf.gameT * 0.7 + p.wob) * 0.18;
      const x = _tan.x + nx * (p.file * FILE_GAP + wob) + _tan.dx * Math.cos(p.wob) * 0.25, z = _tan.z + nz * (p.file * FILE_GAP + wob) + _tan.dz * Math.cos(p.wob) * 0.25;
      if (wf.gameT - p.yAt > 0.5 || p.yAt < 0) { p.y = cm.getGroundHeight(x, z, 'person'); p.yAt = wf.gameT + (i % 10) * 0.05; }
      y = p.y - (sit ? 0.5 : 0);
      const yaw = Math.atan2(_tan.dx, _tan.dz);
      p.rig.update(dt, x, z, yaw, ground);
      const d = cam ? Math.hypot(x - cam.position.x, z - cam.position.z) : 0;
      wf.crowd.add(p.rig, d);
      // every fourth marcher carries a placard (not the banner's front rank)
      if (p.row > 0 && i % 4 === 0) {
        const kind = (i >> 2) % SIGNS.length, m = wf.signMeshes[kind], n = counts[kind];
        if (n < m.instanceMatrix.count) {
          const hop = heldUp ? 0 : Math.sin(wf.gameT * 3 + p.wob) * 0.05;
          _e.set(0, yaw, Math.sin(wf.gameT * 2 + p.wob) * 0.08);
          _q.setFromEuler(_e);
          _m.compose(_pos.set(x + nx * 0.28, y + 0.1 + hop, z + nz * 0.28), _q, _one);
          m.setMatrixAt(n, _m);
          counts[kind]++;
        }
      }
    }
    wf.crowd.end();
    wf.signMeshes.forEach((m, k) => { m.count = counts[k]; m.instanceMatrix.needsUpdate = true; });
    // the banner, across the front rank
    trailAt(st.trail, st.crowd.s + 0.5, _tan);
    const by = cm.getGroundHeight(_tan.x, _tan.z, 'person');
    wf.banner.position.set(_tan.x, by - (sit ? 0.5 : 0), _tan.z);
    wf.banner.rotation.y = Math.atan2(_tan.dx, _tan.dz);
    // the tail car
    const f = st.tail, cy = cm.getGroundHeight(f.x, f.z, 'car');
    wf.tailCar.position.set(f.x, cy, f.z);
    wf.tailCar.rotation.y = Math.atan2(f.dx, f.dz);
    for (const w of wf.tailCar.userData.wheels) w.rotation.x += f.v * dt / 0.35;
    // the megaphone at the player's mouth
    const ent = cm.getActiveEntity(), h = ent.heading, up = 1.42;
    wf.megaphone.position.set(ent.position.x + Math.sin(h) * 0.32 + Math.cos(h) * -0.18, ent.position.y + up, ent.position.z + Math.cos(h) * 0.32 - Math.sin(h) * -0.18);
    wf.megaphone.rotation.set(0, h, 0);
  },
  after(run, ctx, dt, cm) {
    const st = run.state.march, wf = run.wf, ui = wf.ui;
    if (run.phase === 'done' || run.phase === 'failed' || run.phase === 'aborted') run.hooks.vbd?.setClosure?.(null); // (the street opens again)
    wefMarch.pose(run, dt, cm);
    followCamera(run, ctx, dt, 26, 13, 2);
    ui.count.textContent = `${st.count}`;
    ui.morale.textContent = `${Math.round(st.morale)}`;
    ui.chant.textContent = `${Math.round(chantQuality(st) * 100)} %`;
    // the lane: the notes come in from the right to the white line
    const chart = st.game.chart;
    let n = st.game.next;
    for (const u of ui.notes) {
      const note = chart[n];
      if (note && note.t - st.songT < 3.4 && !st.dialog) {
        u.style.display = '';
        u.style.transform = `translateX(${Math.round(28 + (note.t - st.songT) * 95)}px)`;
        n++;
      } else u.style.display = 'none';
    }
    // the slogan: the call while you call, the answer in the next bar
    const k = Math.floor(st.songT / MARCH_RHYTHM.beat) - MARCH_RHYTHM.countIn;
    if (k >= 0) {
      const bar = Math.floor(k / 4), pair = MARCH_SLOGANS[Math.floor(bar / 2) % MARCH_SLOGANS.length], resp = bar % 2 === 1;
      setText(ui.call, pair[resp ? 1 : 0]);
      ui.call.classList.toggle('resp', resp);
    } else setText(ui.call, 'Get ready …');
    const showing = st.say && ctx.t - st.sayAt < 4000 ? st.say : st.lastHit && ctx.t - st.lastHitAt < 500 ? ({ perfect: 'Perfect!', good: 'Good', off: 'Off the beat' })[st.lastHit] : '';
    setText(ui.say, showing);
    // the liaison's three answers
    const show = !!st.dialog;
    if (ui.dialog.hidden === show) {
      ui.dialog.hidden = !show;
      if (show) setText(ui.dialogText, st.dialog.reason === 'stray' ? 'You have left the registered route, and the fence is that way. What now?' : 'The crowd behind you wants to go on to the fence. The permit ends at the rally point. How do you answer?');
    }
    ui.hud.hidden = ui.pad.hidden = run.phase === 'done' || run.phase === 'intro' || run.phase === 'failed' || run.phase === 'aborted';
    if (ui.hud.hidden) ui.dialog.hidden = true;
  }
};

export const WEF_FEATURES = { wefEscort, wefMarch };
export { escortScore, marchScore };
