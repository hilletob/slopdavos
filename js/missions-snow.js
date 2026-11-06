import * as THREE from 'three/webgpu';
import { groundHeight } from './terrain.js';
import { createRiderFigure } from './winter-sports.js';
import {
  createRider, stepRider, riderSpeed, travelHeading, SKI_PARAMS, BOARD_PARAMS, SNOW_GRAVITY,
  bigAirProfile, bigAirU, recordBigAirJump, BIG_AIR_JUMPS, MTB_CRASH_MS
} from './missions-data-snow.js';

// js/missions-snow.js
// The mountain missions' runtime (js/missions-data-snow.js has their definitions and the pure logic; js/missions.js
// takes these features into its FEATURES):
//   skis  — the pedestrian on skis (ski-slalom): js/controllers.js personDriver steps the rider (stepRider) instead of
//           walking, a skier of js/winter-sports.js stands in for the walker, posed by the turn (lean, crouch, the
//           skis across when braking); the slalom's gates (red and blue poles, instanced), the start house with its
//           light barrier and the finish banner.
//   board — the same on a snowboard (big-air): the kicker, its table and the landing hill (a mesh draped over the
//           terrain, the same profile added to the snow the rider rides on), tricks in the air, the score of a jump
//           shown as it lands, back up to the top of the in-run after each jump. A touch button grabs.
//   mtb   — the bike on the trail (mtb-race): gravity along the slope and the dirt's drag on top of the bike's own
//           physics (js/controllers.js updateCyclist knows no slope), a crash when a turn is too tight for the speed
//           (+5 s), the checkpoints as arches (instanced: the next one orange, the ones passed green).
// Everything is built for the run and goes with its group (js/missions.js disposes it): nothing stays in memory after.

const SUBSTEP = 1 / 120;
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _P = new THREE.Vector3();
const _q = new THREE.Quaternion(), _c = new THREE.Color();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** A snow-white matte material (shared by the run's own snow props) */
const snowMaterial = () => new THREE.MeshStandardNodeMaterial({ color: 0xdfe8f2, roughness: 0.85, metalness: 0 });

/** A small HUD toast (the trick of a jump, a missed gate): inline styled, it goes with the run */
function createToast(run) {
  const t = document.createElement('div');
  t.className = 'mission-snow-toast';
  Object.assign(t.style, {
    position: 'fixed', left: '50%', top: '38%', transform: 'translate(-50%, -50%)', zIndex: 14, pointerEvents: 'none',
    font: '800 26px/1.15 system-ui, sans-serif', color: '#fff', textAlign: 'center', letterSpacing: '0.02em',
    textShadow: '0 2px 6px rgba(0,0,0,0.75)', opacity: '0', transition: 'opacity 0.25s'
  });
  document.body.append(t);
  run.cleanups.push(() => t.remove());
  let timer = 0;
  return {
    show(text, sub = '', colour = '#fff', seconds = 2.4) {
      t.replaceChildren(document.createTextNode(text));
      if (sub) { const s = document.createElement('div'); s.textContent = sub; s.style.font = '650 15px/1.3 system-ui, sans-serif'; s.style.opacity = '0.9'; t.append(s); }
      t.style.color = colour;
      t.style.opacity = '1';
      timer = seconds;
    },
    update(dt) { if (timer > 0 && (timer -= dt) <= 0) t.style.opacity = '0'; }
  };
}

// --- The rider (skis, board) -------------------------------------------------------------------------------------------
function riderFeature(kind) {
  const P = kind === 'board' ? BOARD_PARAMS : SKI_PARAMS;
  const board = kind === 'board';
  return {
    setup(run) {
      const cm = run.hooks.controllerManager;
      const s = run.snow = {
        P, board, rider: null, figure: null, touchGrab: false, steerSide: 1, toast: createToast(run), height: null,
        landings: [], person: cm.entities.person, saved: { chaseDistance: cm.entities.person.chaseDistance, chaseHeight: cm.entities.person.chaseHeight }
      };
      s.figure = run.storage(createRiderFigure(board ? { board: true, jacket: 0x6b3fb5, pants: 0x18191c, accent: 0xf0c419 } : { jacket: 0xd7261e, pants: 0x15161a, accent: 0xf2f2f0 }));
      run.group.add(s.figure);
      const park = run.def.park || null;
      s.height = park ? (x, z) => groundHeight(x, z) + bigAirProfile(x, z, park) : groundHeight;
      if (run.def.course === 'slalom') buildSlalomCourse(run, run.def.createState());
      if (park) buildBigAir(run, park);
      // the grab on touch screens: the jump button, held (the joystick spins and flips in the air)
      if (board) run.button('up', 'Grab');
      // the rider moves the pedestrian (js/controllers.js personDriver) while the mission lasts
      cm.personDriver = (dt) => drive(run, dt, cm);
      run.cleanups.push(() => { if (cm.personDriver) cm.personDriver = null; });
    },
    reset(run) {
      const cm = run.hooks.controllerManager;
      const s = run.snow;
      const st = run.resolveStart();
      placeRider(run, st.x, st.z, st.heading);
      cm.personDriver = (dt) => drive(run, dt, cm);
      cm.setEntityHidden('person', true);
      s.person.chaseDistance = board ? 7.5 : 6.4;
      s.person.chaseHeight = board ? 2.6 : 2.3;
      s.backT = 0; s.stillT = 0; s.left = false;
      s.landings.length = 0;
      s.gateColours = null;
    },
    teardown(run) {
      const cm = run.hooks.controllerManager;
      const s = run.snow;
      cm.personDriver = null;
      cm.setEntityHidden('person', cm.activeMode !== 'person');
      Object.assign(s.person, s.saved);
      s.person.slopePitch = 0;
      s.person.speed = 0;
      // (standing on the snow where the rider stopped)
      s.person.position.y = groundHeight(s.person.position.x, s.person.position.z);
    },
    update(run, ctx, dt) {
      const s = run.snow;
      s.toast.update(dt);
      if (run.def.course === 'slalom') updateSlalomCourse(run);
      if (run.def.park) updateBigAir(run, ctx, dt);
    },
    after(run) { poseFigure(run); }
  };
}

function placeRider(run, x, z, heading) {
  const s = run.snow;
  s.rider = createRider(x, s.height(x, z), z, heading);
  const p = s.person;
  p.position.set(x, s.rider.y, z);
  p.heading = heading;
  p.speed = 0;
  p.verticalVel = 0;
  run.lastPos?.copy(p.position);
  poseFigure(run);
}

/** The controllers' input for the rider: steer A/D, tuck W, brake S; in the air spin A/D, flip W/S, grab Space */
function riderInput(run, cm) {
  const k = cm.keys, s = run.snow;
  const num = (v) => (v === true ? 1 : Number(v) || 0);
  const left = num(k.left), right = num(k.right), fwd = num(k.forward), back = num(k.backward);
  return { steer: left - right, tuck: fwd, brake: back, spin: left - right, flip: fwd - back, grab: !!k.up || s.touchGrab };
}

function drive(run, dt, cm) {
  const s = run.snow, r = s.rider, p = s.person;
  if (!r) return;
  const live = run.phase === 'running' || run.phase === 'done';
  if (!live) {
    // held in the start gate until the first input (the stopwatch starts with it)
    r.vx = r.vy = r.vz = 0;
  } else {
    let input = riderInput(run, cm);
    if (run.phase === 'done') input = { steer: 0, tuck: 0, brake: 0.7, spin: 0, flip: 0, grab: false };
    if (input.steer) s.steerSide = Math.sign(input.steer);
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(SUBSTEP, left);
      const landing = stepRider(r, input, h, s.height, s.P);
      if (landing) s.landings.push(landing);
      left -= h;
    }
  }
  p.position.set(r.x, r.y + 0.03, r.z);
  const travel = travelHeading(r, r.heading);
  // (the camera follows the way the rider goes: through a spin it stays behind, not round and round)
  p.heading = r.airborne || r.crashT > 0 ? travel : r.heading;
  r.heading = wrapNear(r.heading, p.heading);
  p.speed = riderSpeed(r);
  p.verticalVel = r.vy;
  // the chase camera keeps the framing of level ground down the slope (js/cameras.js slopePitch)
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const pitch = Math.atan2(groundHeight(r.x - fx * 2, r.z - fz * 2) - groundHeight(r.x + fx * 2, r.z + fz * 2), 4);
  p.slopePitch = (p.slopePitch ?? pitch) + (pitch - (p.slopePitch ?? pitch)) * Math.min(1, dt * 4);
}

// (keeps an unbounded angle near another: the heading wraps with the turns, the figure's basis doesn't mind)
const wrapNear = (a, ref) => a - Math.round((a - ref) / (Math.PI * 2)) * Math.PI * 2;

function poseFigure(run) {
  const s = run.snow, r = s.rider, fig = s.figure;
  if (!r || !fig) return;
  const air = r.air;
  // yaw: the skis' heading; across with the brake (a hockey stop, to the side of the last turn)
  const yaw = r.heading + (r.airborne ? 0 : r.brake * 1.15 * s.steerSide);
  _Z.set(Math.sin(yaw), 0, Math.cos(yaw));
  if (!r.airborne) {
    // pitched with the slope under the skis
    const h0 = s.height(r.x, r.z);
    _Z.y = (s.height(r.x + _Z.x * 0.8, r.z + _Z.z * 0.8) - h0) / 0.8;
    _Z.normalize();
  }
  _X.crossVectors(UP, _Z).normalize(); // left
  _Y.crossVectors(_Z, _X).normalize();
  // the lean into the turn (towards the left for a left turn), the edge
  // (drawn a little less than the physics' angle: a racer's hips go further in than the shoulders)
  const lean = r.crashT > 0 ? 1.35 * s.steerSide : r.airborne ? 0 : clamp(r.lean * 0.75, -0.8, 0.8);
  _Y.addScaledVector(_X, Math.tan(lean)).normalize();
  _X.crossVectors(_Y, _Z).normalize();
  _Z.crossVectors(_X, _Y).normalize();
  if (air && air.flip) {
    // the flip: about the rider's own left-right axis
    _q.setFromAxisAngle(_X, -air.flip);
    _Y.applyQuaternion(_q); _Z.applyQuaternion(_q);
  }
  const grab = air && (air.grab > 0 && (run.hooks.controllerManager.keys.up || s.touchGrab));
  const crouch = grab ? 0.72 : r.airborne ? 0.9 : 1 - Math.min(0.14, Math.abs(r.lean) * 0.15) - r.tuck * 0.16 - (s.board ? 0.03 : 0.05);
  _P.set(r.x, r.y + 0.03, r.z);
  _m.makeBasis(_X, _Y.multiplyScalar(crouch), _Z).setPosition(_P);
  fig.setMatrixAt(0, _m);
  fig.instanceMatrix.needsUpdate = true;
  const pose = fig.geometry.attributes.aPose;
  // the pole plant: the inside pole as the turn begins (skis only)
  const plant = s.board || r.airborne ? 0 : clamp(r.omega * 0.6, -1, 1) * (Math.abs(r.lean) < 0.25 ? 1 : 0);
  pose.array[0] = Math.sin(yaw); pose.array[1] = 0; pose.array[2] = Math.cos(yaw); pose.array[3] = plant;
  pose.needsUpdate = true;
  fig.visible = true;
}

// --- The slalom course -------------------------------------------------------------------------------------------------
const GATE_COLOURS = { red: 0xe0261d, blue: 0x1f5fd1, pass: 0x3fd66b, miss: 0x5b6068 };

function buildSlalomCourse(run, state) {
  const gates = state.gates;
  const n = gates.length * 2;
  // the poles: 1.8 m, a little flag on each
  const poleGeo = new THREE.CylinderGeometry(0.03, 0.034, 1.9, 6).translate(0, 0.95, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardNodeMaterial({ roughness: 0.45 }), n);
  const flagGeo = new THREE.PlaneGeometry(0.8, 0.55).translate(0.42, 1.55, 0);
  const flags = new THREE.InstancedMesh(flagGeo, new THREE.MeshStandardNodeMaterial({ roughness: 0.7, side: THREE.DoubleSide }), n);
  let k = 0;
  for (const g of gates) {
    for (const side of [1, -1]) {
      const x = g.x + g.nx * g.half * side, z = g.z + g.nz * g.half * side;
      const y = groundHeight(x, z) - 0.05;
      // the flags face up the run, pointing out of the gate
      _m.makeRotationY(Math.atan2(g.tx, g.tz) + (side > 0 ? 0 : Math.PI)).setPosition(x, y, z);
      poles.setMatrixAt(k, _m);
      flags.setMatrixAt(k, _m);
      _c.set(GATE_COLOURS[g.colour]);
      poles.setColorAt(k, _c);
      flags.setColorAt(k, _c);
      k++;
    }
  }
  for (const m of [poles, flags]) { m.castShadow = true; m.frustumCulled = false; run.group.add(run.storage(m)); }
  poles.name = 'SlalomPoles'; flags.name = 'SlalomFlags';
  run.slalom = { poles, flags, shown: gates.map(() => null) };

  // the start house beside the start (the racer's camera behind stays clear of it), the light barrier across the line
  const pts = state.pts;
  const sx = pts[0], sz = pts[1];
  const head = Math.atan2(pts[2] - sx, pts[3] - sz);
  const fx = Math.sin(head), fz = Math.cos(head);
  const wood = new THREE.MeshStandardNodeMaterial({ color: 0x8a5a33, roughness: 0.8 });
  const red = new THREE.MeshStandardNodeMaterial({ color: 0xd42a20, roughness: 0.55 });
  const house = new THREE.Group();
  house.name = 'SlalomStartHouse';
  const walls = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.5, 2.6), wood); walls.position.set(0, 1.25, -0.6); // (open at the front)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 3.4), red); roof.position.set(0, 2.62, -0.4); roof.rotation.x = -0.12;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.5, 0.06), red); banner.position.set(0, 2.25, 0.72);
  house.add(walls, roof, banner);
  const lx0 = Math.cos(head), lz0 = -Math.sin(head);
  house.position.set(sx - fx * 1.5 + lx0 * 4.2, groundHeight(sx - fx * 1.5 + lx0 * 4.2, sz - fz * 1.5 + lz0 * 4.2), sz - fz * 1.5 + lz0 * 4.2);
  house.rotation.y = head;
  const post = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8).translate(0, 0.55, 0);
  const lx = Math.cos(head), lz = -Math.sin(head);
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(post, red);
    const x = sx + fx * 1.2 + lx * 1.6 * side, z = sz + fz * 1.2 + lz * 1.6 * side;
    m.position.set(x, groundHeight(x, z), z);
    run.group.add(m);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.015, 0.015), new THREE.MeshBasicNodeMaterial({ color: 0xff2a1a }));
  beam.position.set(sx + fx * 1.2, groundHeight(sx + fx * 1.2, sz + fz * 1.2) + 0.85, sz + fz * 1.2);
  beam.rotation.y = head;
  run.group.add(house, beam);

  // the finish banner over the finish line
  const f = state.finishLine;
  const fh = Math.atan2(f.tx, f.tz);
  const finish = new THREE.Group();
  finish.name = 'SlalomFinish';
  const ground = groundHeight(f.x, f.z);
  const tall = new THREE.CylinderGeometry(0.16, 0.16, 5, 10).translate(0, 2.5, 0);
  for (const side of [1, -1]) {
    const x = f.x + f.nx * f.half * side, z = f.z + f.nz * f.half * side;
    const m = new THREE.Mesh(tall, red);
    m.position.set(x, groundHeight(x, z), z);
    run.group.add(m);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 64;
  const c2 = canvas.getContext('2d');
  c2.fillStyle = '#d42a20'; c2.fillRect(0, 0, 1024, 64);
  c2.fillStyle = '#fff'; c2.font = '800 40px system-ui, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillText('ZIEL · FINISH · DAVOS VERTICAL', 512, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(f.half * 2, 1.1, 0.08), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.6 }));
  sign.position.set(0, 4.4, 0);
  finish.add(sign);
  finish.position.set(f.x, Math.max(ground, groundHeight(f.x + f.nx * f.half, f.z + f.nz * f.half), groundHeight(f.x - f.nx * f.half, f.z - f.nz * f.half)), f.z);
  finish.rotation.y = fh;
  run.group.add(finish);
}

function updateSlalomCourse(run) {
  const c = run.slalom, st = run.state;
  if (!c || !st?.results) return;
  let changed = false;
  for (let i = 0; i < st.results.length; i++) {
    const res = st.results[i];
    if (c.shown[i] === res) continue;
    c.shown[i] = res;
    _c.set(res === 'pass' ? GATE_COLOURS.pass : res === 'miss' ? GATE_COLOURS.miss : GATE_COLOURS[st.gates[i].colour]);
    // (the poles keep their colour; the flags tell passed and missed)
    c.flags.setColorAt(i * 2, _c); c.flags.setColorAt(i * 2 + 1, _c);
    if (res === 'miss') run.snow.toast.show(`Gate ${i + 1} missed`, '+3 s', '#ffb3a8', 1.6);
    changed = true;
  }
  if (changed) c.flags.instanceColor.needsUpdate = true;
}

// --- The big air ---------------------------------------------------------------------------------------------------------
function buildBigAir(run, park) {
  const k = park.kicker;
  const ax = Math.sin(k.heading), az = Math.cos(k.heading);
  // a grid along the axis, u from the kicker's foot, v across; draped over the terrain with the profile on top, sunk
  // under the snow where the profile is nil
  const u0 = -3, u1 = park.kickerLength + park.table + (park.kickerHeight * 0.75) / park.landingDrop + 3;
  const vHalf = park.landingWidth / 2 + 4;
  const du = 0.6, dv = 0.8;
  const nu = Math.ceil((u1 - u0) / du) + 1, nv = Math.ceil((2 * vHalf) / dv) + 1;
  const pos = new Float32Array(nu * nv * 3);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u = u0 + i * du, v = -vHalf + j * dv;
      const x = k.x + ax * u + az * v, z = k.z + az * u - ax * v;
      const e = bigAirProfile(x, z, park);
      const o = (i * nv + j) * 3;
      pos[o] = x; pos[o + 1] = groundHeight(x, z) + (e > 0.02 ? e + 0.02 : -0.35); pos[o + 2] = z;
    }
  }
  const idx = [];
  for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv - 1; j++) {
    const a = i * nv + j, b = a + 1, c = a + nv, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // (the winding: the normals up)
  if (geo.attributes.normal.array[1] < 0) { geo.index.array.reverse(); geo.computeVertexNormals(); }
  const kicker = new THREE.Mesh(geo, snowMaterial());
  kicker.name = 'BigAirKicker';
  kicker.receiveShadow = true;
  kicker.castShadow = true;
  run.group.add(kicker);
  // the lip's edge marked with a blue line, orange poles along the in-run and the landing
  const lipU = park.kickerLength;
  const lipX = k.x + ax * lipU, lipZ = k.z + az * lipU;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(park.kickerWidth, 0.06, 0.12), new THREE.MeshStandardNodeMaterial({ color: 0x1f5fd1, roughness: 0.5 }));
  lip.position.set(lipX, groundHeight(lipX, lipZ) + bigAirProfile(lipX - ax * 0.05, lipZ - az * 0.05, park) + 0.03, lipZ);
  lip.rotation.y = k.heading;
  run.group.add(lip);
  const marks = [];
  for (let u = -60; u <= u1 + 10; u += 10) {
    const half = u < lipU ? park.kickerWidth / 2 + 2.5 : park.landingWidth / 2 + 1;
    for (const side of [1, -1]) marks.push([k.x + ax * u + az * half * side, k.z + az * u - ax * half * side]);
  }
  const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6).translate(0, 0.7, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardNodeMaterial({ color: 0xff7a1a, roughness: 0.5 }), marks.length);
  marks.forEach(([x, z], i) => { _m.makeTranslation(x, groundHeight(x, z) + bigAirProfile(x, z, park) - 0.05, z); poles.setMatrixAt(i, _m); });
  poles.frustumCulled = false;
  run.group.add(run.storage(poles));
}

function updateBigAir(run, ctx, dt) {
  const s = run.snow, st = run.state, r = s.rider, park = run.def.park;
  if (!r || !st) return;
  st.airborne = r.airborne;
  // the landings of the frame: a jump off the kicker scores
  for (const landing of s.landings.splice(0)) {
    if (landing.time < 0.35) continue;
    const jump = recordBigAirJump(st, landing, park);
    if (!jump) continue;
    const colour = jump.quality === 'clean' ? '#fff' : jump.quality === 'sketchy' ? '#ffd27a' : '#ff8f80';
    s.toast.show(jump.quality === 'crash' ? 'Crash!' : jump.name, `${jump.quality === 'crash' ? 'no score' : `${jump.quality} landing`} · ${jump.points} pts · ${landing.time.toFixed(1)} s air`, colour, 2.8);
    s.backT = st.jumps.length < BIG_AIR_JUMPS ? 3.2 : 0;
    st.note = st.jumps.length < BIG_AIR_JUMPS ? 'Back up for the next jump …' : null;
  }
  if (run.phase !== 'running') return;
  // back up to the top: after a jump, past the kicker without one, or stopped on the way
  const u = bigAirU(r.x, r.z, park);
  const sp = riderSpeed(r);
  s.stillT = sp < 0.6 && !r.airborne ? s.stillT + dt : 0;
  let back = false;
  if (s.backT > 0) { if ((s.backT -= dt) <= 0) back = true; }
  else if (!r.airborne && (u > park.kickerLength + 3 || s.stillT > 4)) {
    back = true;
    st.note = u > park.kickerLength + 3 ? 'Missed the kicker: back to the top' : 'Stopped: back to the top';
    s.toast.show(u > park.kickerLength + 3 ? 'Missed the kicker' : 'Back to the top', 'Try again: this one does not count', '#ffd27a', 2);
  }
  if (back) {
    const start = run.resolveStart();
    placeRider(run, start.x, start.z, start.heading);
    run.hooks.cameraSystem?.resetForTeleport?.();
    s.stillT = 0;
    setTimeout(() => { if (!run.disposed && st.note && !st.airborne) st.note = null; }, 2500);
  }
}

// --- The mountain bike -------------------------------------------------------------------------------------------------
const BIKE_TURN_RATE = 2.15; // rad/s at full lock (js/controllers.js updateCyclist)
const ARCH_COLOURS = { next: 0xff7a1a, ahead: 0xf2f2f0, done: 0x3fd66b };

function buildCheckpointArches(run, cps) {
  // two posts and a banner, 5 m wide, one instanced mesh
  const parts = [
    new THREE.BoxGeometry(0.16, 3, 0.16).translate(2.5, 1.5, 0),
    new THREE.BoxGeometry(0.16, 3, 0.16).translate(-2.5, 1.5, 0),
    new THREE.BoxGeometry(5.3, 0.6, 0.08).translate(0, 2.85, 0)
  ];
  const geo = mergeBoxes(parts);
  const arches = new THREE.InstancedMesh(geo, new THREE.MeshStandardNodeMaterial({ roughness: 0.6 }), cps.length);
  cps.forEach((c, i) => {
    _m.makeRotationY(Math.atan2(c.tx, c.tz)).setPosition(c.x, groundHeight(c.x, c.z) - 0.05, c.z);
    arches.setMatrixAt(i, _m);
    arches.setColorAt(i, _c.set(ARCH_COLOURS.ahead));
  });
  arches.castShadow = true;
  arches.frustumCulled = false;
  arches.name = 'MtbCheckpoints';
  run.group.add(run.storage(arches));
  return { arches, shown: -1 };
}

function mergeBoxes(parts) {
  const pos = [], nor = [], idx = [];
  for (const g of parts) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    for (const i of g.index.array) idx.push(base + i);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

const mtbFeature = {
  setup(run) {
    run.mtb = { ...buildCheckpointArches(run, run.def.createState().cps), wobble: 0, toast: createToast(run) };
  },
  reset(run) {
    Object.assign(run.mtb, { shown: -1, wobble: 0, crashT: 0 });
  },
  teardown(run) {
    const bike = run.hooks.controllerManager.entities.cyclist;
    if (bike?.leanPivot) bike.leanPivot.rotation.z = bike.leanAngle = 0;
  },
  update(run, ctx, dt, cm) {
    const m = run.mtb, st = run.state;
    m.toast.update(dt);
    // the arches' colours: the next one orange, the passed ones green
    if (st && m.shown !== st.next) {
      for (let i = 0; i < st.cps.length; i++) m.arches.setColorAt(i, _c.set(i < st.next ? ARCH_COLOURS.done : i === st.next ? ARCH_COLOURS.next : ARCH_COLOURS.ahead));
      m.arches.instanceColor.needsUpdate = true;
      m.shown = st.next;
    }
    const bike = cm.entities.cyclist;
    if (ctx.mode !== 'cyclist' || !bike || !st) return;
    if (run.phase !== 'running') return;
    // gravity along the trail and the dirt's drag (for the next frame: the controllers have moved the bike already)
    const fx = Math.sin(bike.heading), fz = Math.cos(bike.heading), x = bike.position.x, z = bike.position.z;
    const grade = (groundHeight(x + fx * 1.5, z + fz * 1.5) - groundHeight(x - fx * 1.5, z - fz * 1.5)) / 3;
    const along = -SNOW_GRAVITY * Math.sin(Math.atan(grade)) * 0.85;
    const v = bike.speed || 0;
    bike.speed = v + along * dt * (v >= -0.1 ? 1 : 0.4) - Math.sign(v) * Math.min(Math.abs(v), 0.0035 * v * v * dt);
    // the crash: a turn tighter than the tyres hold at this speed, held for a moment (the lateral acceleration over
    // 1.7 g for 0.4 s: full lock above ~8 m/s; the bike's own steering turns as fast at any speed)
    // (from the steering input: js/controllers.js turns the bike at 2.15 rad/s at full lock, whatever the speed; the
    // input, unlike the heading's change per frame, does not jitter with the frame rate)
    const num = (k) => (k === true ? 1 : Number(k) || 0);
    const turn = num(cm.keys.left) - num(cm.keys.right);
    const latG = Math.abs(v * turn * BIKE_TURN_RATE) / SNOW_GRAVITY;
    if (m.crashT > 0) {
      m.crashT -= dt;
      st.crashT = m.crashT;
      bike.speed = 0;
      bike.leanAngle = 1.25 * Math.sign(bike.leanAngle || 1);
      bike.leanPivot.rotation.z = bike.leanAngle;
      return;
    }
    st.crashT = 0;
    m.wobble = latG > 1.7 ? m.wobble + dt : Math.max(0, m.wobble - dt * 2);
    st.wobble = m.wobble;
    if (m.wobble > 0.4) {
      m.wobble = 0;
      m.crashT = 1.6;
      st.crashes++;
      st.penaltyMs += MTB_CRASH_MS;
      bike.speed = 0;
      m.toast.show('Crash!', `Too fast for that turn: +${MTB_CRASH_MS / 1000} s`, '#ff8f80', 2);
      run.audio?.thump?.();
    }
  }
};

export const SNOW_FEATURES = { skis: riderFeature('ski'), board: riderFeature('board'), mtb: mtbFeature };
