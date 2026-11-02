import * as THREE from 'three/webgpu';
import { groundHeight } from './terrain.js';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { pointAt, riderSpeed, travelHeading } from './missions-data-snow.js';
import { createCourse, createSledge, resetSledge, stepSledge, SLEDGE_TRACK, SLEDGE_CRASH_MS, runHeading } from './missions-data-sledge.js';

// js/missions-sledge.js
// The horn sledge race's runtime (js/missions-data-sledge.js has its definition and the pure logic; js/missions.js takes
// SLEDGE_FEATURES into its FEATURES):
//   hornSledge — the pedestrian on a horn sledge: js/controllers.js personDriver steps the sledge (stepSledge) instead
//                of walking, its personPoser sits the skinned person on the front of the sledge, hands on the horns,
//                heels forward (PersonRig.ride, the cyclist's seat-and-grips pose with the sledge as its frame); the
//                partner behind is one more figure (a PersonCrowd of one), holding on, leaning with the bends.
//                The run: orange stakes along both edges (one instanced mesh), the nets on the outside of the bends
//                (one ribbon, a net texture drawn on a canvas), the start arch at the Jatzmeder, the finish banner.
// Everything is built for the run and goes with its group (js/missions.js disposes it): nothing stays after.

const SUBSTEP = 1 / 120;
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _c = new THREE.Color();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapNear = (a, ref) => a - Math.round((a - ref) / (Math.PI * 2)) * Math.PI * 2;

// --- The horn sledge ---------------------------------------------------------------------------------------------------
// (local frame: +z forward, +y up, the runners' soles at y = 0; ~2.1 m long, 0.6 m wide, the seat 0.36 m up)
const SEAT_Y = 0.36, RUNNER_HALF = 0.27;
export const SLEDGE_POSE = {
  driver: { seat: new THREE.Vector3(0, SEAT_Y, 0.12), bars: new THREE.Vector3(0, 0.74, 0.92), gripHalf: RUNNER_HALF, bracket: new THREE.Vector3(0, 0.16, 0.86), crankLength: 0, pedalHalf: 0.3, lean: -0.08 },
  partner: { seat: new THREE.Vector3(0, SEAT_Y, -0.52), bars: new THREE.Vector3(0, 0.62, 0.02), gripHalf: 0.16, bracket: new THREE.Vector3(0, 0.3, 0.1), crankLength: 0, pedalHalf: 0.36, lean: 0.12 }
};

function buildSledge() {
  const g = new THREE.Group();
  g.name = 'HornSledge';
  const wood = new THREE.MeshStandardNodeMaterial({ color: 0x9a6534, roughness: 0.75 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x5e3a1c, roughness: 0.8 });
  const iron = new THREE.MeshStandardNodeMaterial({ color: 0x2b2d30, roughness: 0.45, metalness: 0.7 });
  // the runners: flat along the snow, curving up in front into the horns (bent back over at their tips)
  const runner = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.05, -0.95), new THREE.Vector3(0, 0.035, -0.4), new THREE.Vector3(0, 0.035, 0.45),
    new THREE.Vector3(0, 0.1, 0.8), new THREE.Vector3(0, 0.36, 1.0), new THREE.Vector3(0, 0.62, 1.02), new THREE.Vector3(0, 0.78, 0.9), new THREE.Vector3(0, 0.8, 0.78)
  ]);
  const runnerGeo = new THREE.TubeGeometry(runner, 40, 0.035, 6, false);
  const shoe = new THREE.BoxGeometry(0.05, 0.012, 1.45).translate(0, 0.006, -0.22);
  for (const side of [1, -1]) {
    const r = new THREE.Mesh(runnerGeo, wood); r.position.x = side * RUNNER_HALF; r.castShadow = true; g.add(r);
    const s = new THREE.Mesh(shoe, iron); s.position.x = side * RUNNER_HALF; g.add(s);
    // the posts from the runner up to the seat's frame
    for (const z of [-0.78, -0.3, 0.18, 0.6]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.045, SEAT_Y - 0.06, 0.045), dark);
      p.position.set(side * RUNNER_HALF, (SEAT_Y - 0.06) / 2 + 0.04, z);
      g.add(p);
    }
    // the side rail of the seat
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.55), dark); rail.position.set(side * RUNNER_HALF, SEAT_Y - 0.03, -0.1); g.add(rail);
  }
  // the seat's slats, the cross bars between the runners, the bar between the horns
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.025, 0.17), wood);
    s.position.set(0, SEAT_Y + 0.01, -0.8 + i * 0.215);
    s.castShadow = true;
    g.add(s);
  }
  for (const z of [-0.78, 0.18, 0.6]) { const b = new THREE.Mesh(new THREE.BoxGeometry(RUNNER_HALF * 2, 0.04, 0.04), dark); b.position.set(0, 0.16, z); g.add(b); }
  const hornBar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, RUNNER_HALF * 2, 8).rotateZ(Math.PI / 2), dark);
  hornBar.position.set(0, 0.4, 0.99);
  g.add(hornBar);
  // the brake chain hanging off the back
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 8).scale(1, 1, 3).rotateY(Math.PI / 2), iron);
  chain.position.set(0, 0.1, -1.0);
  g.add(chain);
  return g;
}

// --- The run's props ---------------------------------------------------------------------------------------------------
/** The net's mesh on a canvas: the holes stay transparent, the colour map's alpha cuts them (alphaTest) */
function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.strokeStyle = '#ff6a12'; x.lineWidth = 5;
  x.strokeRect(0, 0, 64, 64);
  x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 64); x.moveTo(0, 32); x.lineTo(64, 32); x.stroke();
  x.fillStyle = '#ff6a12'; x.fillRect(0, 0, 64, 9); // (the top band)
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTexture(text, bg = '#b5652b') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 96;
  const c2 = canvas.getContext('2d');
  c2.fillStyle = bg; c2.fillRect(0, 0, 1024, 96);
  c2.fillStyle = '#fff'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
  let px = 54;
  do c2.font = `800 ${px}px system-ui, sans-serif`; while (c2.measureText(text).width > 960 && (px -= 2) > 20); // (the whole text on the banner)
  c2.fillText(text, 512, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** An arch across the run at arc length s (two posts, a banner) */
function buildArch(course, s, text, colour) {
  const p = pointAt(course.pts, s);
  const h = runHeading(course, s);
  const half = SLEDGE_TRACK.half + 1.2;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ color: colour, roughness: 0.6 });
  const post = new THREE.CylinderGeometry(0.12, 0.12, 4.2, 8).translate(0, 2.1, 0);
  const lx = Math.cos(h), lz = -Math.sin(h);
  let top = -Infinity;
  for (const side of [1, -1]) {
    const x = p.x + lx * half * side, z = p.z + lz * half * side;
    const m = new THREE.Mesh(post, mat);
    const y = groundHeight(x, z);
    top = Math.max(top, y);
    m.position.set(x, y - 0.1, z);
    g.add(m);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.4, 0.95, 0.08), new THREE.MeshStandardNodeMaterial({ map: bannerTexture(text, '#' + new THREE.Color(colour).getHexString()), roughness: 0.6 }));
  sign.position.set(p.x, top + 3.6, p.z);
  sign.rotation.y = h + Math.PI; // (the text faces the rider coming down)
  g.add(sign);
  return g;
}

function buildRun(run, course) {
  const T = SLEDGE_TRACK;
  // the stakes along both edges, every 12 m, orange and black in turn
  const marks = [];
  for (let s = 6; s < course.length; s += 12) {
    const p = pointAt(course.pts, s), h = runHeading(course, s, 3);
    const lx = Math.cos(h), lz = -Math.sin(h);
    for (const side of [1, -1]) marks.push([p.x + lx * (T.half + 0.5) * side, p.z + lz * (T.half + 0.5) * side, marks.length % 4 < 2]);
  }
  const stakeGeo = new THREE.CylinderGeometry(0.025, 0.03, 1.3, 5).translate(0, 0.6, 0);
  const stakes = new THREE.InstancedMesh(stakeGeo, new THREE.MeshStandardNodeMaterial({ roughness: 0.5 }), marks.length);
  marks.forEach(([x, z, orange], i) => {
    stakes.setMatrixAt(i, _m.makeTranslation(x, groundHeight(x, z) - 0.05, z));
    stakes.setColorAt(i, _c.set(orange ? 0xff6a12 : 0x1b1c1f));
  });
  stakes.frustumCulled = false;
  stakes.name = 'SledgeStakes';
  run.group.add(run.storage(stakes));

  // the nets on the outside of the bends: one ribbon, 1.1 m high, posts every 4 m
  const pos = [], uv = [], idx = [], posts = [];
  for (const b of course.bends) {
    const off = b.side * (T.half + T.netGap);
    let u = 0, prev = null;
    for (let s = b.s0; s <= b.s1 + 1e-6; s += 2) {
      const p = pointAt(course.pts, s), h = runHeading(course, s, 3);
      const x = p.x + Math.cos(h) * off, z = p.z - Math.sin(h) * off;
      const y = groundHeight(x, z) - 0.05;
      if (prev) u += Math.hypot(x - prev[0], z - prev[1]);
      const base = pos.length / 3;
      pos.push(x, y, z, x, y + 1.1, z);
      uv.push(u / 1.1, 0, u / 1.1, 1);
      if (prev) idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
      if (Math.round(s - b.s0) % 4 === 0) posts.push([x, y, z]);
      prev = [x, z];
    }
  }
  if (pos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const net = new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ map: netTexture(), alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.8 }));
    net.name = 'SledgeNets';
    net.frustumCulled = false;
    run.group.add(net);
    const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.25, 5).translate(0, 0.62, 0);
    const pm = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardNodeMaterial({ color: 0x2a2a2a, roughness: 0.6 }), posts.length);
    posts.forEach(([x, y, z], i) => pm.setMatrixAt(i, _m.makeTranslation(x, y, z)));
    pm.frustumCulled = false;
    run.group.add(run.storage(pm));
  }
  run.group.add(buildArch(course, 3, 'START · HORNSCHLITTENRENNEN RINERHORN', 0xb5652b), buildArch(course, course.length - 2, 'ZIEL · FINISH · GLARIS', 0xd42a20));
}

// --- The HUD: speed, the tip meter ---------------------------------------------------------------------------------------
function buildHud(run) {
  const box = document.createElement('div');
  box.className = 'panel mission-sledge-hud';
  Object.assign(box.style, {
    position: 'fixed', left: '50%', bottom: 'calc(62px + env(safe-area-inset-bottom, 0px))', transform: 'translateX(-50%)', zIndex: 14, pointerEvents: 'none',
    display: 'flex', gap: '12px', alignItems: 'center', padding: '7px 14px', borderRadius: '12px', font: '700 15px/1.2 system-ui, sans-serif',
    color: '#fff', background: 'rgba(12,14,20,0.7)', fontVariantNumeric: 'tabular-nums'
  });
  const speed = document.createElement('span');
  speed.textContent = '0 km/h';
  speed.style.minWidth = '64px';
  const meter = document.createElement('span');
  Object.assign(meter.style, { position: 'relative', width: '110px', height: '9px', borderRadius: '5px', background: 'rgba(255,255,255,0.18)', overflow: 'hidden' });
  const fill = document.createElement('span');
  Object.assign(fill.style, { position: 'absolute', left: 0, top: 0, bottom: 0, width: '0%', background: '#3fd66b', borderRadius: '5px' });
  meter.append(fill);
  const label = document.createElement('span');
  label.textContent = 'Tilt';
  label.style.opacity = '0.75';
  box.append(speed, label, meter);
  document.body.append(box);
  run.cleanups.push(() => box.remove());
  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'fixed', left: '50%', top: '38%', transform: 'translate(-50%, -50%)', zIndex: 14, pointerEvents: 'none',
    font: '800 28px/1.15 system-ui, sans-serif', color: '#ff8f80', textAlign: 'center', textShadow: '0 2px 6px rgba(0,0,0,0.75)', opacity: '0', transition: 'opacity 0.25s'
  });
  document.body.append(toast);
  run.cleanups.push(() => toast.remove());
  return { box, speed, fill, toast, toastT: 0 };
}

function showToast(hud, text, colour = '#ff8f80', seconds = 2) {
  hud.toast.textContent = text;
  hud.toast.style.color = colour;
  hud.toast.style.opacity = '1';
  hud.toastT = seconds;
}

// --- The feature ---------------------------------------------------------------------------------------------------------
const hornSledge = {
  setup(run) {
    const cm = run.hooks.controllerManager;
    const course = createCourse();
    const person = cm.entities.person;
    const sledge = buildSledge();
    run.group.add(sledge);
    buildRun(run, course);
    // the partner on the back seat: one more of the city's figures
    const crowd = new PersonCrowd(1, { farDistance: 1e9 });
    for (const m of crowd.meshes) run.group.add(m);
    const partner = new PersonRig({ seed: 0.4142, female: true, hair: 0.8, girth: 0.98, scale: 0.96 });
    run.sl = {
      course, sledge, crowd, partner, person, sl: null, hud: buildHud(run), roll: 0, steerSide: 1,
      saved: { chaseDistance: person.chaseDistance, chaseHeight: person.chaseHeight }
    };
    cm.personDriver = (dt) => hornSledge.drive(run, dt, cm);
    cm.personPoser = (dt, p) => hornSledge.pose(run, dt, p);
    run.cleanups.push(() => {
      if (cm.personDriver) cm.personDriver = null;
      cm.personPoser = null;
      const p = cm.entities.person;
      p.rig.placed = false; // (the walk starts afresh where the sledge stopped)
      p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
      p.speed = 0;
      p.slopePitch = 0;
      Object.assign(p, run.sl.saved);
    });
  },
  reset(run) {
    const cm = run.hooks.controllerManager;
    const S = run.sl;
    S.sl = createSledge(S.course, groundHeight, 0);
    const r = S.sl.rider;
    const p = S.person;
    p.position.set(r.x, r.y, r.z);
    p.heading = r.heading;
    p.speed = 0;
    p.verticalVel = 0;
    p.chaseDistance = 6.2;
    p.chaseHeight = 2.4;
    run.lastPos?.copy(p.position);
    cm.personDriver = (dt) => hornSledge.drive(run, dt, cm);
    cm.personPoser = (dt, pp) => hornSledge.pose(run, dt, pp);
    cm.setEntityHidden?.('person', false);
    S.roll = 0;
    S.hud.toastT = 0;
    S.hud.toast.style.opacity = '0';
  },
  teardown(run) {
    const cm = run.hooks.controllerManager;
    cm.personDriver = null;
    cm.personPoser = null;
  },
  input(run, cm) {
    const k = cm.keys;
    const num = (v) => (v === true ? 1 : Number(v) || 0);
    return { steer: num(k.left) - num(k.right), tuck: num(k.forward), brake: num(k.backward) };
  },
  drive(run, dt, cm) {
    const S = run.sl, sl = S.sl, p = S.person;
    if (!sl) return;
    const r = sl.rider;
    const live = run.phase === 'running' || run.phase === 'done';
    if (!live) {
      r.vx = r.vy = r.vz = 0; // (held at the start until the first input: the stopwatch starts with it)
    } else {
      let input = hornSledge.input(run, cm);
      if (run.phase === 'done') input = { steer: 0, tuck: 0, brake: 1 };
      if (input.steer) S.steerSide = Math.sign(input.steer);
      let left = Math.min(dt, 0.1);
      while (left > 1e-6) {
        const h = Math.min(SUBSTEP, left);
        const ev = stepSledge(sl, input, h, groundHeight, S.course);
        if (ev) hornSledge.event(run, ev);
        left -= h;
      }
    }
    p.position.set(r.x, r.y, r.z);
    p.heading = sl.crashT > 0 ? travelHeading(r, r.heading) : r.heading;
    r.heading = wrapNear(r.heading, p.heading);
    p.speed = riderSpeed(r);
    p.verticalVel = r.vy;
    // the chase camera keeps the framing of level ground down the slope (js/cameras.js slopePitch)
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const pitch = Math.atan2(groundHeight(r.x - fx * 2, r.z - fz * 2) - groundHeight(r.x + fx * 2, r.z + fz * 2), 4);
    p.slopePitch = (p.slopePitch ?? pitch) + (pitch - (p.slopePitch ?? pitch)) * Math.min(1, dt * 4);
    // the state the objectives read
    const st = run.state;
    if (st) {
      st.crashT = sl.crashT; st.tip = sl.tip; st.off = Math.abs(sl.proj.d) > SLEDGE_TRACK.half && sl.offT > 0.4;
      st.crashes = sl.crashes; st.nets = sl.nets;
      if (run.phase === 'running') st.topSpeed = Math.max(st.topSpeed, p.speed);
    }
  },
  event(run, ev) {
    const S = run.sl, st = run.state, sl = S.sl;
    if (ev === 'crash') {
      if (st) { st.penaltyMs += SLEDGE_CRASH_MS; st.why = sl.last; }
      showToast(S.hud, sl.last === 'net' ? 'Into the net!' : sl.last === 'lost' ? 'Off the run!' : 'Tipped over!', '#ff8f80', 2);
      S.hud.toast.append(Object.assign(document.createElement('div'), { textContent: `+${SLEDGE_CRASH_MS / 1000} s`, style: 'font:650 15px system-ui,sans-serif;opacity:.9' }));
      run.audio?.thump?.();
    } else if (ev === 'net') {
      showToast(S.hud, 'Caught by the net', '#ffd27a', 1.2);
    } else if (ev === 'back') {
      run.hooks.cameraSystem?.resetForTeleport?.();
      run.lastPos?.copy(S.person.position);
    }
  },
  /** The sledge on the snow and the two on it (the controllers' personPoser) */
  pose(run, dt, p) {
    const S = run.sl, sl = S.sl;
    if (!sl) return;
    const r = sl.rider, g = S.sledge;
    // the sledge's frame: along its heading, on the slope (the snow's height under the front and back of the runners,
    // and across them), rolled a little into the turn — and over on its side when it tipped
    const crashed = sl.crashT > 0;
    const targetRoll = crashed ? 1.45 * (sl.tipSide || S.steerSide) : -clamp(sl.latG, -1, 1) * 0.12 + Math.sign(sl.latG) * Math.min(0.5, sl.tip * 0.5);
    S.roll += (targetRoll - S.roll) * Math.min(1, dt * (crashed ? 6 : 10));
    const yaw = r.heading;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    const hF = groundHeight(r.x + fx * 0.9, r.z + fz * 0.9), hB = groundHeight(r.x - fx * 0.9, r.z - fz * 0.9);
    const hL = groundHeight(r.x + lx * 0.3, r.z + lz * 0.3), hR = groundHeight(r.x - lx * 0.3, r.z - lz * 0.3);
    _Z.set(fx * 1.8, r.airborne ? 0 : hF - hB, fz * 1.8).normalize();
    _X.set(lx * 0.6, r.airborne ? 0 : hL - hR, lz * 0.6).normalize();
    _Y.crossVectors(_Z, _X).normalize();
    // (the roll about the sledge's length: positive leans it to the left... into a left turn the riders lean left)
    _Y.applyAxisAngle(_Z, S.roll); _X.applyAxisAngle(_Z, S.roll);
    _X.crossVectors(_Y, _Z).normalize();
    _m.makeBasis(_X, _Y, _Z).setPosition(r.x, r.y + 0.01 + (crashed ? 0.25 * Math.abs(Math.sin(S.roll)) : 0), r.z);
    g.matrixAutoUpdate = false;
    g.matrix.copy(_m);
    g.matrixWorldNeedsUpdate = true;
    g.updateMatrixWorld(true);
    // the driver in front (the player's own figure), the partner behind
    const D = SLEDGE_POSE.driver, Pp = SLEDGE_POSE.partner;
    p.rig.ride(g, 0, { ...D, lean: D.lean + r.tuck * 0.55 - r.brake * 0.12 });
    p.rig.placed = true;
    p.rig.x = r.x; p.rig.z = r.z; p.rig.yaw = yaw;
    S.partner.ride(g, 0, { ...Pp, lean: Pp.lean + r.tuck * 0.5 + r.brake * 0.1 });
    S.crowd.begin();
    S.crowd.add(S.partner, 0);
    S.crowd.end();
  },
  update(run, ctx, dt) {
    const S = run.sl, sl = S.sl, hud = S.hud;
    if (!sl) return;
    if (hud.toastT > 0 && (hud.toastT -= dt) <= 0) hud.toast.style.opacity = '0';
    const kmh = `${Math.round(riderSpeed(sl.rider) * 3.6)} km/h`;
    if (hud.speed.textContent !== kmh) hud.speed.textContent = kmh;
    // the tilt: how close the sledge is to its tip limit (the lateral acceleration), red once it starts to go over
    const level = sl.tip > 0 ? 0.75 + 0.25 * sl.tip : clamp(Math.abs(sl.latG) / SLEDGE_TRACK.tipG, 0, 1) * 0.75;
    hud.fill.style.width = `${Math.round(level * 100)}%`;
    hud.fill.style.background = sl.tip > 0 ? '#ff4b3e' : level > 0.55 ? '#ffc21a' : '#3fd66b';
    hud.box.hidden = run.phase === 'intro' || run.phase === 'done';
  }
};

export const SLEDGE_FEATURES = { hornSledge };
export { resetSledge };
