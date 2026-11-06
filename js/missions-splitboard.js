import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { createRiderFigure } from './winter-sports.js';
import { touchLabel, edge } from './missions-ice.js';
import { createToast, particles } from './missions-work.js';
import { createRider, stepRider, riderSpeed, travelHeading, BOARD_PARAMS } from './missions-data-snow.js';
import {
  SPLIT, SPLIT_PLACES, ASCENT_ROUTE, DESCENT_ROUTE, createSkinner, stepSkinner, stepTransition, slopeAt, slopeAlong,
  createTrail, addToTrail, trailEnd, createPartner, stepPartner, lineOffset, stepRisk, burialSpot, searchView, createRescue, stepRescue
} from './missions-data-splitboard.js';

// js/missions-splitboard.js
// The runtime of js/missions-data-splitboard.js (SPLITBOARD_FEATURES, merged into js/missions.js FEATURES):
//   splitboard — the tour on the Chörbschhorn. js/controllers.js personDriver moves the pedestrian meanwhile: standing for
//               the transceiver's check, on skins (stepSkinner) up from marker pole to marker pole, standing again for the
//               transition, then on the board (js/missions-data-snow.js stepRider) down through the gates. The walker is
//               hidden for a figure of js/winter-sports.js (createRiderFigure: one instance, its kind switched from the
//               skier, the two halves as skis and the poles, to the snowboarder; at the transition the skier without either)
//               stands by the board's two halves on the snow (their own little model, base up: the skins peeled off,
//               the halves turned over and slid together, the bindings turned across). The marker poles (bamboo, an orange top), the gates of red flags, a cairn
//               on the summit, and the track the player leaves in the snow: the two lines of the skins up, the board's groove
//               down (instanced quads, the oldest dropped).
//               Reto, the touring partner: a second figure of the same make, along your track behind you (js/missions-data-
//               splitboard.js stepPartner), his name over his head; the group check of the transceivers with a little
//               transceiver's display (the distance, the arrow), the same display for the search after an avalanche: the
//               slab's crown above you, the powder cloud (js/missions-fx.js avalanche), the debris down the slope, Reto under it.
// Everything goes with the run's group and its cleanups.

const SUBSTEP = 1 / 120;
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _P = new THREE.Vector3();
const _q = new THREE.Quaternion(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const objectiveId = (run) => run.def.objectives[run.index]?.id;
const mat = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.6, ...o });
const wrapNear = (a, ref) => a - Math.round((a - ref) / (Math.PI * 2)) * Math.PI * 2;
const num = (v) => (v === true ? 1 : Number(v) || 0);

/** What the player does in the step: 'check' | 'skin' | 'trans' | 'board' | 'rescue' */
function stage(run) {
  const id = objectiveId(run);
  if (run.phase === 'done') return 'board';
  const rs = run.state?.rescue;
  if (rs && rs.stage !== 'out' && !run.state.failed) return 'rescue';
  if (id === 'transceiver') return 'check';
  if (id === 'transition') return 'trans';
  // (the steps after the transition are the descent's)
  return run.index > run.def.objectives.findIndex((o) => o.id === 'transition') ? 'board' : 'skin';
}

/** A short beep (the transceiver; a step of the transition done) */
function beep(run, freq = 1760, seconds = 0.12, gain = 0.12) {
  const a = run.audio;
  if (!a?.live) return;
  const ctx = a.audio.context, o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.type = 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.setValueAtTime(gain, t + seconds - 0.02); g.gain.linearRampToValueAtTime(0, t + seconds);
  o.connect(g).connect(a.audio.mix);
  o.start(t); o.stop(t + seconds + 0.02);
}

// --- The props ---------------------------------------------------------------------------------------------------------
function buildPoles(run, cps) {
  const pole = new THREE.CylinderGeometry(0.025, 0.03, 1.9, 6).translate(0, 0.95, 0);
  const top = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6).translate(0, 1.75, 0);
  const poles = new THREE.InstancedMesh(pole, mat(0xd8c27a, { roughness: 0.7 }), cps.length);
  const tops = new THREE.InstancedMesh(top, new THREE.MeshBasicNodeMaterial({ color: 0xff7a1a }), cps.length);
  cps.forEach((c, i) => {
    _m.makeTranslation(c.x, groundHeight(c.x, c.z) - 0.1, c.z);
    poles.setMatrixAt(i, _m); tops.setMatrixAt(i, _m);
  });
  for (const m of [poles, tops]) { m.frustumCulled = false; m.castShadow = true; run.group.add(run.storage(m)); }
  poles.name = 'SplitboardPoles';
}

const FLAG = { red: 0xe0261d, pass: 0x3fd66b, miss: 0x5b6068 };
function buildGates(run, gates) {
  const n = gates.length * 2;
  const pole = new THREE.CylinderGeometry(0.03, 0.035, 2.4, 6).translate(0, 1.2, 0);
  const flag = new THREE.BufferGeometry();
  flag.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.35, 0, 0, 1.7, 0, 0.85, 2.05, 0], 3));
  flag.computeVertexNormals();
  const poles = new THREE.InstancedMesh(pole, mat(0x2a2d32), n);
  const flags = new THREE.InstancedMesh(flag, new THREE.MeshStandardNodeMaterial({ roughness: 0.7, side: THREE.DoubleSide }), n);
  let k = 0;
  for (const g of gates) for (const side of [1, -1]) {
    const x = g.x + g.nx * g.half * side, z = g.z + g.nz * g.half * side;
    // (the flags face up the line, pointing out of the gate)
    _m.makeRotationY(Math.atan2(g.tx, g.tz) + (side > 0 ? Math.PI / 2 : -Math.PI / 2)).setPosition(x, groundHeight(x, z) - 0.1, z);
    poles.setMatrixAt(k, _m); flags.setMatrixAt(k, _m);
    flags.setColorAt(k, _c.set(FLAG.red));
    k++;
  }
  for (const m of [poles, flags]) { m.frustumCulled = false; m.castShadow = true; run.group.add(run.storage(m)); }
  flags.name = 'SplitboardGates';
  return { flags, shown: gates.map(() => null) };
}

function buildCairn(run) {
  const S = SPLIT_PLACES.summit, y = groundHeight(S.x, S.z);
  const stones = [];
  for (let k = 0; k < 8; k++) {
    const r = 0.62 - k * 0.065;
    stones.push(new THREE.DodecahedronGeometry(r, 0).translate(S.x + 2.6 + (k % 2) * 0.08, y + 0.25 + k * 0.27, S.z - 1.8 - (k % 3) * 0.06));
  }
  const cairn = new THREE.Mesh(mergeGeometries(stones), mat(0x6a6862, { roughness: 0.9 }));
  for (const g of stones) g.dispose();
  cairn.castShadow = true;
  cairn.name = 'ChoerbschhornCairn';
  // the summit's iron pole on top of it, a little snow on the stones' tops left out
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), mat(0x3a3d42, { metalness: 0.5, roughness: 0.5 }));
  rod.position.set(S.x + 2.64, y + 2.6, S.z - 1.84);
  run.group.add(cairn, rod);
}

// The board's two halves at the transition: on the snow in front of the rider, base up with the skins on. Each half is its
// own outline (the straight inner edge, the sidecut, half of the rounded nose and tail) extruded to the board's thickness,
// the steel edge and the sidewall round it, the base below, the topsheet on top: one design over both halves (a canvas,
// mapped in the joined board's coordinates, so that it lines up once they are together), the tip and the tail bent up.
const HALF_W = 0.135, HALF_L = 1.6, THICK = 0.014;
const NOSE = 0.17; // m of the rounded nose and tail
function topsheetTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 1024;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 1024);
  gr.addColorStop(0, '#0f2f4f'); gr.addColorStop(0.55, '#1f6f86'); gr.addColorStop(1, '#0f2f4f');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 1024);
  // the diagonal band, the ridge line of the Chörbschhorn over it, the name along the board
  x.fillStyle = '#e2553a';
  x.beginPath(); x.moveTo(0, 520); x.lineTo(128, 400); x.lineTo(128, 470); x.lineTo(0, 590); x.closePath(); x.fill();
  x.fillStyle = '#f2c14e';
  x.beginPath(); x.moveTo(0, 600); x.lineTo(128, 480); x.lineTo(128, 492); x.lineTo(0, 612); x.closePath(); x.fill();
  x.strokeStyle = '#f4f6f8'; x.lineWidth = 5; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(0, 230); x.lineTo(30, 190); x.lineTo(48, 205); x.lineTo(78, 140); x.lineTo(98, 175); x.lineTo(128, 160); x.stroke();
  x.save(); x.translate(64, 820); x.rotate(-Math.PI / 2);
  x.fillStyle = 'rgba(244,246,248,0.92)'; x.font = '800 34px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('CHÖRBSCH', 0, 0);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** The outline of one half in the joined board's coordinates (x across: 0 the joint, `side` the half; y along) */
function halfShape(side) {
  const sh = new THREE.Shape(), L = HALF_L / 2, W = HALF_W, cut = 0.01;
  const outer = (y) => W - cut * (1 - (y / (L - NOSE)) ** 2);
  sh.moveTo(0, -L);
  sh.lineTo(0, L);
  sh.absellipse(0, L - NOSE, W, NOSE, Math.PI / 2, side > 0 ? 0 : Math.PI, side > 0, 0);
  for (let k = 0; k <= 12; k++) { const y = (L - NOSE) - (2 * (L - NOSE) * k) / 12; sh.lineTo(side * outer(y), y); }
  sh.absellipse(0, -(L - NOSE), W, NOSE, side > 0 ? 0 : Math.PI, -Math.PI / 2, side > 0, 0);
  // (absellipse draws from the end of the last segment: the shape is closed back at the joint's tail)
  return sh;
}
/** Laid flat (y up), shifted so that the half's middle is at x = 0, the nose and tail bent up */
function layHalf(geo, side, lift = 0) {
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, L = HALF_L / 2;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), a = Math.max(0, Math.abs(z) - (L - 0.24)) / 0.24;
    p.setY(i, p.getY(i) + lift + 0.075 * a * a);
    p.setX(i, p.getX(i) - side * HALF_W / 2);
  }
  geo.computeVertexNormals();
  return geo;
}
function buildBoardHalves(run) {
  const g = new THREE.Group();
  g.name = 'SplitboardHalves';
  const top = new THREE.MeshStandardNodeMaterial({ map: topsheetTexture(), roughness: 0.35 });
  const base = mat(0x121316, { roughness: 0.3 }), edge = mat(0xc9ced3, { metalness: 0.8, roughness: 0.25 });
  const skinMat = mat(0x7a2fb5, { roughness: 0.95 }), clip = mat(0xd8dde2, { metalness: 0.7, roughness: 0.3 });
  const dark = mat(0x2a2d32, { roughness: 0.6 }), strap = mat(0xe2553a, { roughness: 0.6 }), steel = mat(0xb8bcc0, { metalness: 0.7, roughness: 0.3 });
  const halves = [], skins = [], bindings = [];
  for (const side of [1, -1]) {
    const h = new THREE.Group();
    const shape = halfShape(side);
    // the core: its caps the base (the top cap under the topsheet), its sides the steel edge and the sidewall
    const core = layHalf(new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false, curveSegments: 10 }), side);
    const body = new THREE.Mesh(core, [base, edge]);
    // the topsheet, mapped over the joined board
    const sheet = new THREE.ShapeGeometry(shape, 10);
    const uv = sheet.attributes.uv, sp = sheet.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (sp.getX(i) + HALF_W) / (2 * HALF_W), (sp.getY(i) + HALF_L / 2) / HALF_L);
    const topMesh = new THREE.Mesh(layHalf(sheet, side, THICK + 0.0006), top);
    h.add(body, topMesh);
    // the hooks and the clips on the inner edge, the puck plates for the bindings
    for (const z of [-0.5, 0.5]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.07), clip); c.position.set(-side * (HALF_W / 2 - 0.016), THICK + 0.006, z); h.add(c); }
    for (const z of [-0.25, 0.25]) { const pk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 12), steel); pk.position.set(-side * 0.02, THICK + 0.004, z); h.add(pk); }
    // the binding: a baseplate, the highback, two straps; in ski mode along the half
    const bind = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.28), dark);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.17, 0.025), dark);
    back.position.set(0, 0.09, -0.135); back.rotation.x = 0.18;
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.05), strap), s2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.045), strap);
    s1.position.set(0, 0.06, -0.02); s2.position.set(0, 0.045, 0.1);
    bind.add(plate, back, s1, s2);
    bind.position.set(0, THICK + 0.011, 0);
    h.add(bind);
    // the skin: on the base (shown flipped up while the half lies base up), hinged at the tip with its clip
    const skinL = HALF_L - 0.28;
    const skin = new THREE.Group();
    const sk = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 0.8, 0.004, skinL).translate(-side * 0.005, 0, -skinL / 2), skinMat);
    const tipClip = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 0.7, 0.008, 0.03), clip);
    tipClip.position.set(0, -0.002, 0.01);
    skin.add(sk, tipClip);
    skin.position.set(0, -0.003, skinL / 2);
    h.add(skin);
    h.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(h);
    halves.push(h); skins.push(skin); bindings.push(bind);
  }
  g.visible = false;
  run.group.add(g);
  return { group: g, halves, skins, bindings };
}

/** The halves' pose at the transition: tr { step, t } (js/missions-data-splitboard.js stepTransition) */
function poseHalves(h, tr, x, z, heading) {
  const steps = SPLIT.transition, f = (k) => (tr.done || tr.step > k ? 1 : tr.step === k ? clamp(tr.t / steps[k].hold, 0, 1) : 0);
  const e = (v) => v * v * (3 - 2 * v);
  const y = groundHeight(x, z);
  h.group.position.set(x, y + 0.03, z);
  h.group.rotation.set(0, heading, 0);
  const j = f(2), flip = e(clamp(j * 2, 0, 1)), join = e(clamp(j * 2 - 1, 0, 1)), bind = e(f(3));
  h.halves.forEach((half, i) => {
    const side = i === 0 ? 1 : -1;
    // on the snow base up, the skins on top; turned over, then slid together edge to edge
    half.position.set(side * (0.32 - (0.32 - HALF_W / 2) * join), 0.01 + 0.085 * (1 - flip) + 0.18 * Math.sin(Math.PI * flip), 0);
    half.rotation.z = side * Math.PI * (1 - flip);
    // the skin: peeled off from the tip back, folded up and gone
    const p = e(f(i));
    const skin = h.skins[i];
    skin.visible = p < 0.999;
    skin.rotation.x = -p * 2.6;
    skin.position.y = -0.003 - p * 0.04;
    // the binding: along the half in ski mode, across the joined board to ride
    h.bindings[i].rotation.y = side * bind * 1.2;
    h.bindings[i].position.set(-side * bind * HALF_W / 2, THICK + 0.011, side * bind * 0.25);
  });
}

// The track in the snow: thin quads, the oldest dropped
const TRACK_MAX = 1400;
function buildTrack(run) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardNodeMaterial({ color: 0xb9c8da, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }), TRACK_MAX);
  m.frustumCulled = false;
  m.renderOrder = 2;
  m.receiveShadow = true;
  for (let i = 0; i < TRACK_MAX; i++) m.setMatrixAt(i, ZERO);
  m.name = 'SplitboardTrack';
  run.group.add(run.storage(m));
  return { mesh: m, next: 0, last: null, dirty: false };
}
function addTrack(tr, x, z, height, width, offsets) {
  const last = tr.last;
  if (!last) { tr.last = { x, z }; return; }
  const dx = x - last.x, dz = z - last.z, L = Math.hypot(dx, dz);
  if (L < 1.6) return;
  if (L > 8) { tr.last = { x, z }; return; } // (a jump, a restart)
  const h = Math.atan2(dx, dz), lx = Math.cos(h), lz = -Math.sin(h);
  for (const o of offsets) {
    const ax = last.x + lx * o, az = last.z + lz * o, bx = x + lx * o, bz = z + lz * o;
    const ya = height(ax, az) + 0.04, yb = height(bx, bz) + 0.04;
    _Z.set(bx - ax, yb - ya, bz - az);
    const len = _Z.length();
    _Z.divideScalar(len);
    _X.crossVectors(UP, _Z).normalize();
    _Y.crossVectors(_Z, _X);
    _m.makeBasis(_X.multiplyScalar(width), _Y, _Z.multiplyScalar(len + 0.05)).setPosition((ax + bx) / 2, (ya + yb) / 2, (az + bz) / 2);
    tr.mesh.setMatrixAt(tr.next, _m);
    tr.next = (tr.next + 1) % TRACK_MAX;
  }
  tr.last = { x, z };
  tr.dirty = true;
}

// --- Reto, the transceiver, the avalanche --------------------------------------------------------------------------------
/** Where Reto stands for the group check: in front of you, a little to the right, facing you (where the camera sees him) */
const checkSpot = (sk) => ({ x: sk.x + Math.sin(sk.heading) * 3.2 - Math.cos(sk.heading) * 1.4, z: sk.z + Math.cos(sk.heading) * 3.2 + Math.sin(sk.heading) * 1.4 });
const RETO_LOOK = { jacket: 0xf2c014, pants: 0x1c2a4a, accent: 0x1f5fd1 };
function nameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(12,18,28,0.72)';
  x.beginPath(); x.roundRect(40, 8, 176, 48, 24); x.fill();
  x.fillStyle = '#ffd34d'; x.font = '800 32px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(name, 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  tag.scale.set(1.6, 0.4, 1);
  tag.renderOrder = 950;
  return tag;
}

/** The transceiver's display (bottom middle): the mode, the distance, the arrow; hidden while not needed */
function buildTransceiver(run) {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', left: '50%', bottom: '118px', transform: 'translateX(-50%)', zIndex: 14, pointerEvents: 'none',
    width: '150px', padding: '10px 12px 12px', borderRadius: '16px', background: 'linear-gradient(#1b2633, #0f161f)',
    border: '2px solid #ff7a1a', boxShadow: '0 6px 18px rgba(0,0,0,0.45)', color: '#e9f2ff', textAlign: 'center',
    font: '700 13px/1.2 system-ui, sans-serif', display: 'none'
  });
  const mode = document.createElement('div'), arrow = document.createElement('div'), dist = document.createElement('div');
  mode.style.cssText = 'letter-spacing:0.08em;font-size:11px;color:#ffb27a';
  arrow.style.cssText = 'font-size:34px;line-height:40px;height:40px;transition:transform 0.1s';
  dist.style.cssText = 'font:800 22px/1.1 ui-monospace, Menlo, monospace;color:#9ff0b0';
  box.append(mode, arrow, dist);
  document.body.append(box);
  run.cleanups.push(() => box.remove());
  return {
    show(m, d, angle) {
      box.style.display = 'block';
      if (mode.textContent !== m) mode.textContent = m;
      const txt = d == null ? '– – –' : `${d.toFixed(1)} m`;
      if (dist.textContent !== txt) dist.textContent = txt;
      arrow.textContent = angle == null ? '·' : '▲';
      arrow.style.transform = `rotate(${angle == null ? 0 : (-angle * 180) / Math.PI}deg)`;
    },
    hide() { box.style.display = 'none'; }
  };
}

/** The slab's crown: a wall of snow 0.7 m high across the slope, `ahead` m uphill of (x, z), 44 m wide */
function buildCrown(x, z, up, ahead = 14) {
  const ux = Math.sin(up), uz = Math.cos(up), ax = Math.cos(up), az = -Math.sin(up);
  const cx = x + ux * ahead, cz = z + uz * ahead, pos = [], idx = [];
  const n = 23;
  for (let k = 0; k < n; k++) {
    const w = (k / (n - 1) - 0.5) * 44, jag = Math.sin(k * 2.3) * 1.2;
    const px = cx + ax * w + ux * jag, pz = cz + az * w + uz * jag, g = groundHeight(px, pz);
    pos.push(px, g + 0.7, pz, px - ux * 0.5, g - 0.05, pz - uz * 0.5);
    if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ color: 0x8fa6bf, roughness: 0.9, side: THREE.DoubleSide }));
  m.name = 'AvalancheCrown';
  return m;
}
/** The debris: lumps of snow over the track of the slab, from (ax, az) down to (bx, bz) */
function buildDebris(run, ax, az, bx, bz) {
  const n = 60, m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(0xeef3f8, { roughness: 1 }), n);
  const L = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / L, tz = (bz - az) / L;
  for (let i = 0; i < n; i++) {
    const f = 0.3 + 0.75 * Math.random(), w = (Math.random() - 0.5) * (10 + 16 * f);
    const x = ax + (bx - ax) * f + tz * w, z = az + (bz - az) * f - tx * w;
    const r = 0.5 + Math.random() * 1.1;
    _m.compose(_P.set(x, groundHeight(x, z) + r * 0.15, z), _q.setFromAxisAngle(UP, Math.random() * 6), _Z.set(r * 1.4, r * 0.45, r));
    m.setMatrixAt(i, _m);
  }
  m.castShadow = true; m.frustumCulled = false; m.name = 'AvalancheDebris';
  run.group.add(run.storage(m));
  return m;
}

// --- The feature -------------------------------------------------------------------------------------------------------
const splitboard = {
  setup(run) {
    const cm = run.hooks.controllerManager;
    const state = run.def.createState();
    const figure = run.storage(createRiderFigure({ board: false, jacket: 0x1f8f8a, pants: 0x23262b, accent: 0xe2553a }));
    run.group.add(figure);
    buildPoles(run, state.up.cps);
    const gates = buildGates(run, state.down.gates);
    buildCairn(run);
    const person = cm.entities.person;
    // Reto: the same figure in his colours, his name over his head
    const reto = run.storage(createRiderFigure({ board: false, ...RETO_LOOK }));
    reto.name = 'Partner Reto';
    const tag = nameTag(SPLIT.partner.name);
    run.group.add(reto, tag);
    run.split = {
      figure, reto, tag, lvs: buildTransceiver(run), crown: null, debris: null, trail: null, partner: null, wasExposed: false,
      gates, halves: buildBoardHalves(run), track: buildTrack(run), toast: createToast(run),
      skinner: null, rider: null, stage: null, person, steerSide: 1, landings: [],
      saved: { label: person.label, topSpeedKmh: person.topSpeedKmh, chaseDistance: person.chaseDistance, chaseHeight: person.chaseHeight }, sprayAcc: 0, beepT: 0
    };
    cm.personDriver = (dt) => drive(run, dt, cm);
    run.cleanups.push(() => { if (cm.personDriver) cm.personDriver = null; });
  },
  reset(run) {
    const cm = run.hooks.controllerManager, s = run.split;
    const st = run.resolveStart();
    s.skinner = createSkinner(st.x, st.z, st.heading, groundHeight);
    s.trail = createTrail(st.x, st.z, st.heading);
    s.partner = createPartner();
    stepPartner(s.partner, s.trail, 0, 0, groundHeight, 'up');
    for (const k of ['crown', 'debris']) if (s[k]) { s[k].removeFromParent(); s[k].geometry.dispose(); s[k] = null; }
    s.lvs.hide();
    s.wasExposed = false;
    s.rider = null;
    s.stage = null;
    s.landings.length = 0;
    s.gates.shown.fill(null);
    for (let i = 0; i < s.gates.flags.count; i++) s.gates.flags.setColorAt(i, _c.set(FLAG.red));
    s.gates.flags.instanceColor.needsUpdate = true;
    for (let i = 0; i < TRACK_MAX; i++) s.track.mesh.setMatrixAt(i, ZERO);
    s.track.mesh.instanceMatrix.needsUpdate = true;
    s.track.next = 0; s.track.last = null;
    s.halves.group.visible = false;
    s.toast.hide();
    cm.personDriver = (dt) => drive(run, dt, cm);
    cm.setEntityHidden('person', true);
    s.person.chaseDistance = 6.2;
    s.person.chaseHeight = 2.6;
    placePerson(run, s.skinner.x, s.skinner.y, s.skinner.z, s.skinner.heading);
    touchLabel(run, 'Space');
  },
  teardown(run) {
    const cm = run.hooks.controllerManager, s = run.split;
    if (!s) return;
    cm.personDriver = null;
    cm.setEntityHidden('person', cm.activeMode !== 'person');
    Object.assign(s.person, s.saved);
    if (s.saved.topSpeedKmh === undefined) delete s.person.topSpeedKmh;
    setHudLabel(s.saved.label);
    s.person.slopePitch = 0;
    s.person.speed = 0;
    s.person.position.y = groundHeight(s.person.position.x, s.person.position.z);
  },
  update(run, ctx, dt, cm) {
    const s = run.split, st = run.state;
    s.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
    const now = stage(run);
    if (now !== s.stage) enterStage(run, now, cm);
    if (!st || !live(run)) return;
    const hold = !!cm.keys.up;
    const me = s.person.position, P = s.partner;
    if (now === 'check' && !st.check.done) {
      const done = stepTransition(st.check, hold, dt, SPLIT.groupCheck);
      // (his transceiver on search hears yours, then yours hears his: the beeps quicker the nearer, as a real one)
      const at = checkSpot(s.skinner), d = Math.hypot(at.x - me.x, at.z - me.z);
      s.beepT -= dt;
      if (hold && s.beepT <= 0) { s.beepT = 0.22; beep(run, st.check.step === 0 ? 1180 : 1440, 0.06, 0.08); }
      if (st.check.step === 0) s.lvs.show(`${SPLIT.partner.name.toUpperCase()} · SEARCH`, hold ? d : null, null);
      else s.lvs.show('YOU · SEARCH', hold ? d : null, hold ? Math.atan2(at.x - me.x, at.z - me.z) - s.person.heading : null);
      if (done) {
        beep(run, 2100, 0.2, 0.1);
        s.toast.show(done.id === 'send' ? `${SPLIT.partner.name} hears you: sending ✓` : `You hear ${SPLIT.partner.name}: receiving ✓`, '#9ff0b0', 1.6);
      }
      if (st.check.done) { s.lvs.hide(); touchLabel(run, 'Kick turn'); }
    }
    if (now === 'rescue') updateRescue(run, hold, dt);
    else if (now === 'skin' || now === 'board') {
      if (s.lvs) s.lvs.hide();
      updateRisk(run, now, dt);
    }
    // Reto along the track (buried: not)
    if (now !== 'check' && now !== 'rescue') {
      const lead = trailEnd(s.trail, me.x, me.z);
      stepPartner(P, s.trail, lead, dt, groundHeight, now === 'board' ? 'down' : now === 'trans' ? 'trans' : 'up');
      st.retoBehind = P.behind;
      st.retoSpaced = P.spaced;
    }
    if (now === 'trans' && st.retoBehind <= SPLIT.partner.beside + 8) {
      const done = stepTransition(st.trans, hold, dt);
      if (done) {
        beep(run, done.id === 'bind' ? 1600 : 900, 0.08, 0.07);
        if (done.id === 'bind') s.toast.show('Board together: drop in!', '#fff', 1.8);
      }
    }
    // the gates passed and missed: the flags' colour
    const res = st.down.results;
    let changed = false;
    for (let i = 0; i < res.length; i++) {
      if (s.gates.shown[i] === res[i]) continue;
      s.gates.shown[i] = res[i];
      _c.set(res[i] === 'pass' ? FLAG.pass : res[i] === 'miss' ? FLAG.miss : FLAG.red);
      s.gates.flags.setColorAt(i * 2, _c); s.gates.flags.setColorAt(i * 2 + 1, _c);
      if (res[i] === 'miss') s.toast.show(`Gate ${i + 1} missed: +${SPLIT.down.missMs / 1000} s`, '#ffb3a8', 1.6);
      changed = true;
    }
    if (changed) s.gates.flags.instanceColor.needsUpdate = true;
  },
  after(run) {
    const s = run.split;
    poseFigure(run);
    posePartner(run);
    if (s.track.dirty) { s.track.mesh.instanceMatrix.needsUpdate = true; s.track.dirty = false; }
    if (s.stage === 'trans' && run.state) poseHalves(s.halves, run.state.trans, s.halfAt.x, s.halfAt.z, s.halfAt.heading);
  }
};

function placePerson(run, x, y, z, heading) {
  const p = run.split.person;
  p.position.set(x, y + 0.03, z);
  p.heading = heading;
  p.speed = 0;
  p.verticalVel = 0;
  run.lastPos?.copy(p.position);
}

function enterStage(run, now, cm) {
  const s = run.split;
  s.stage = now;
  const sk = s.skinner;
  setRide(s, now === 'board');
  if (now === 'trans') {
    // on the summit: the walker stands, the halves on the snow before them
    const h = sk.heading, fx = Math.sin(h), fz = Math.cos(h);
    s.halfAt = { x: sk.x + fx * 1.3, z: sk.z + fz * 1.3, heading: h + Math.PI / 2 };
    s.halves.group.visible = true;
    setKind(s, 2);
    s.toast.show(`Chörbschhorn · ${SPLIT_PLACES.summit.ele} m`, '#fff', 3.2);
  } else s.halves.group.visible = false;
  cm.setEntityHidden('person', true);
  if (now === 'rescue') {
    // off the board (if on it) and walking, the transceiver on search
    if (s.rider) { const r = s.rider; Object.assign(sk, { x: r.x, z: r.z, y: groundHeight(r.x, r.z), heading: travelHeading(r, r.heading), speed: 0, kickT: 0 }); s.rider = null; }
    setKind(s, 0);
    touchLabel(run, 'Probe/Dig');
    return;
  }
  if (now === 'board' && !s.rider) {
    // the next gate's direction, the board under the feet where the walker stood
    const g = run.state?.down.gates[Math.min(run.state.down.next, run.state.down.gates.length - 1)];
    const head = g ? Math.atan2(g.x - sk.x, g.z - sk.z) : sk.heading;
    s.rider = createRider(sk.x, groundHeight(sk.x, sk.z), sk.z, head);
    s.person.chaseDistance = 7.5;
    s.person.chaseHeight = 2.8;
    s.track.last = null;
    setKind(s, 1);
    touchLabel(run, 'Grab');
  }
  if (now === 'skin' || now === 'check') {
    setKind(s, 0);
    touchLabel(run, now === 'skin' ? 'Kick turn' : 'Space');
  }
  if (now === 'trans') touchLabel(run, 'Hold');
}

const _rs = {};
/** The load on the snowpack where you are; the slab when it goes */
function updateRisk(run, now, dt) {
  const s = run.split, st = run.state, p = s.person.position;
  if (!st.check.done || run.phase !== 'running') return;
  const sl = slopeAt(groundHeight, p.x, p.z, _rs), down = now === 'board';
  const travel = down && s.rider ? travelHeading(s.rider, s.rider.heading) : s.skinner.heading;
  const go = stepRisk(st.risk, { slope: sl.slope, off: lineOffset(down ? DESCENT_ROUTE : ASCENT_ROUTE, p.x, p.z), down, travel, up: sl.up }, dt);
  if (st.risk.exposed && !s.wasExposed) { s.toast.show('Avalanche danger!', '#ffb36b', 1.6); beep(run, 520, 0.18, 0.08); }
  s.wasExposed = st.risk.exposed;
  if (go) release(run, sl.up);
}

/** The slab goes: the crown above you, the cloud, Reto under the debris (a second one ends the tour) */
function release(run, up) {
  const s = run.split, st = run.state, p = s.person.position, P = s.partner;
  s.crown?.removeFromParent();
  s.crown = buildCrown(p.x, p.z, up);
  run.group.add(s.crown);
  const pb = particles(run);
  const ux = Math.sin(up), uz = Math.cos(up);
  pb.avalanche(p.x + ux * 10, p.z + uz * 10, { count: 170, seconds: 2.6, spread: 22 });
  run.audio?.boom?.(120, 0.8);
  if (st.risk.releases > 1) {
    st.failed = `A second avalanche: you and ${SPLIT.partner.name} get out of it, but the tour ends here. Keep to the marked line in steep ground.`;
    return;
  }
  // Reto, behind you in the slope: buried down the fall line from where he was
  const b = burialSpot(groundHeight, P.x, P.z);
  P.buried = true;
  s.debris?.removeFromParent();
  s.debris = buildDebris(run, P.x, P.z, b.x, b.z);
  st.rescue = createRescue(b.x, b.z);
  st.risk.exposed = false;
  st.rescues++;
  st.extraMs += SPLIT.rescue.penaltyMs;
  st.penaltyMs = st.down.penaltyMs + st.extraMs;
  s.toast.show(`Avalanche! ${SPLIT.partner.name} is buried`, '#ff8f80', 3);
}

/** The search: the transceiver's display, the beeps; the probe and the shovel with Space; Reto out again */
function updateRescue(run, hold, dt) {
  const s = run.split, st = run.state, rs = st.rescue, p = s.person.position;
  const v = searchView(p.x, p.z, s.person.heading, rs.x, rs.z);
  s.lvs.show(rs.stage === 'search' ? 'SEARCH' : rs.stage === 'probe' ? 'PROBE' : 'DIG', v.mode === 'none' ? null : v.dist, v.mode === 'none' ? null : v.arrow);
  s.beepT -= dt;
  if (v.mode !== 'none' && s.beepT <= 0) { s.beepT = clamp(v.dist / 25, 0.08, 1.2); beep(run, 1500, 0.05, 0.07); }
  const done = stepRescue(rs, p.x, p.z, hold, dt);
  if (done === 'search') s.toast.show('Fine search: probe here', '#fff', 1.6);
  if (done === 'probe') { beep(run, 700, 0.15, 0.08); s.toast.show('Probe hit! Dig', '#fff', 1.6); }
  if (done === 'dig') {
    // out, unhurt; on along your track with you
    const P = s.partner;
    P.buried = false;
    P.s = trailEnd(s.trail, p.x, p.z) - 2;
    st.risk.load = 0;
    s.lvs.hide();
    s.toast.show(`${SPLIT.partner.name} is out, unhurt. Back to the marked line!`, '#9ff0b0', 3);
    touchLabel(run, s.rider ? 'Grab' : 'Kick turn');
  }
}

/** Reto: on skins behind you, standing beside you at the transition, on the board behind you; under the snow: not seen */
function posePartner(run) {
  const s = run.split, P = s.partner, fig = s.reto;
  if (!P || !s.skinner) return;
  const st = s.stage, buried = P.buried;
  fig.visible = s.tag.visible = !buried;
  if (buried) return;
  const look = fig.geometry.attributes.aLook, kind = st === 'board' ? 1 : st === 'trans' && run.state?.trans.step >= 2 ? 2 : 0;
  if (look.array[3] !== kind) { look.array[3] = kind; look.needsUpdate = true; }
  let x = P.x, z = P.z, yaw = P.heading;
  if (st === 'trans') {
    // beside you, facing the same way
    const h = s.skinner.heading;
    x = s.skinner.x + Math.cos(h) * SPLIT.partner.beside; z = s.skinner.z - Math.sin(h) * SPLIT.partner.beside; yaw = h;
  } else if (st === 'check') {
    ({ x, z } = checkSpot(s.skinner));
    yaw = Math.atan2(s.skinner.x - x, s.skinner.z - z);
  }
  const y = groundHeight(x, z);
  _Z.set(Math.sin(yaw), 0, Math.cos(yaw));
  _Z.y = (groundHeight(x + _Z.x * 0.8, z + _Z.z * 0.8) - y) / 0.8;
  _Z.normalize();
  _X.crossVectors(UP, _Z).normalize();
  _Y.set(0, 1, 0).addScaledVector(_Z, kind === 1 ? 0 : 0.12).normalize();
  _X.crossVectors(_Y, _Z).normalize();
  _Z.crossVectors(_X, _Y).normalize();
  const moving = P.speed > 0.3 ? 1 : 0, ph = P.stride * Math.PI;
  const crouch = kind === 1 ? 0.9 : 1 - 0.03 * moving * Math.abs(Math.sin(ph)) - 0.02;
  _m.makeBasis(_X, _Y.multiplyScalar(crouch), _Z).setPosition(_P.set(x, y + 0.03, z));
  fig.setMatrixAt(0, _m);
  fig.instanceMatrix.needsUpdate = true;
  const pose = fig.geometry.attributes.aPose;
  pose.array[0] = Math.sin(yaw); pose.array[1] = 0; pose.array[2] = Math.cos(yaw); pose.array[3] = kind === 0 ? moving * Math.sin(ph) * 0.9 : 0;
  pose.needsUpdate = true;
  s.tag.position.set(x, y + 2.25, z);
}

/** The speed cluster's name (js/main.js writes it only when the mode changes; its bar goes by person.topSpeedKmh) */
function setHudLabel(text) {
  const el = typeof document !== 'undefined' && document.getElementById('hud-active-mode');
  if (el) el.textContent = text;
}
function setRide(s, board) {
  s.person.label = board ? 'Snowboard' : 'Splitboard';
  s.person.topSpeedKmh = board ? 90 : 50; // (on skins: the run downhill, `glide`)
  setHudLabel(s.person.label);
}

/** The figure's kind (js/winter-sports.js createRiderFigure): 0 on skis, 1 on the board, 2 neither (at the transition) */
function setKind(s, kind) {
  const look = s.figure.geometry.attributes.aLook;
  if (look.array[3] === kind) return;
  look.array[3] = kind;
  look.needsUpdate = true;
}

const _sl = {};
function drive(run, dt, cm) {
  const s = run.split, st = run.state, p = s.person;
  if (!s.skinner) return;
  const k = cm.keys;
  const stg = s.stage || stage(run);
  const running = run.phase === 'running' || run.phase === 'done';
  const kickEdge = edge(run, cm, 'up');
  if (stg === 'board' && s.rider) {
    const r = s.rider;
    if (running) {
      let input = { steer: num(k.left) - num(k.right), tuck: num(k.forward), brake: num(k.backward), spin: num(k.left) - num(k.right), flip: num(k.forward) - num(k.backward), grab: !!k.up };
      if (run.phase === 'done') input = { steer: 0, tuck: 0, brake: 0.8, spin: 0, flip: 0, grab: false };
      if (input.steer) s.steerSide = Math.sign(input.steer);
      let left = Math.min(dt, 0.1);
      while (left > 1e-6) { const h = Math.min(SUBSTEP, left); const l = stepRider(r, input, h, groundHeight, BOARD_PARAMS); if (l) s.landings.push(l); left -= h; }
    }
    p.position.set(r.x, r.y + 0.03, r.z);
    const travel = travelHeading(r, r.heading);
    p.heading = r.airborne || r.crashT > 0 ? travel : r.heading;
    r.heading = wrapNear(r.heading, p.heading);
    p.speed = riderSpeed(r);
    p.verticalVel = r.vy;
    if (st && run.phase === 'running') st.topSpeed = Math.max(st.topSpeed, p.speed);
    addTrack(s.track, r.x, r.z, groundHeight, 0.32, [0]);
    spray(run, r, dt);
    for (const l of s.landings.splice(0)) if (l.quality === 'crash') s.toast.show('Wipe-out!', '#ffb3a8', 1.4);
  } else {
    const sk = s.skinner;
    const rescue = stg === 'rescue';
    const moving = (stg === 'skin' || rescue) && run.phase !== 'done' && live(run);
    const input = moving
      ? { forward: num(k.forward), back: num(k.backward), steer: num(k.left) - num(k.right), kick: kickEdge && !rescue }
      : { forward: 0, back: 0, steer: 0, kick: false };
    stepSkinner(sk, input, Math.min(dt, 0.1), groundHeight);
    if (st && moving) {
      st.slipping = sk.slipping;
      if (sk.slipping) st.slipT += dt;
      st.kicks = sk.kicks;
      const sl = slopeAt(groundHeight, sk.x, sk.z, _sl);
      st.steepHint = sl.slope > SPLIT.skin.grip + 0.05 && slopeAlong(sl, sk.heading) > SPLIT.skin.grip;
      if (kickEdge) beep(run, 420, 0.05, 0.04);
    }
    p.position.set(sk.x, sk.y + 0.03, sk.z);
    p.heading = sk.heading;
    p.speed = Math.abs(sk.speed);
    p.verticalVel = 0;
    if (stg === 'skin' || rescue) addTrack(s.track, sk.x, sk.z, groundHeight, 0.12, [0.11, -0.11]);
  }
  // the track Reto follows
  if (s.trail && (stg === 'skin' || stg === 'board' || stg === 'rescue')) addToTrail(s.trail, p.position.x, p.position.z);
  // the chase camera keeps the framing of level ground on the slope (js/cameras.js slopePitch)
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const pitch = Math.atan2(groundHeight(p.position.x - fx * 2, p.position.z - fz * 2) - groundHeight(p.position.x + fx * 2, p.position.z + fz * 2), 4);
  p.slopePitch = (p.slopePitch ?? pitch) + (pitch - (p.slopePitch ?? pitch)) * Math.min(1, dt * 4);
}

/** Powder off the board's edge: in a hard turn, braking, at speed */
function spray(run, r, dt) {
  const s = run.split, sp = riderSpeed(r);
  if (r.airborne || sp < 6) return;
  const hard = Math.abs(r.lean) * sp / 10 + r.brake * sp / 8;
  if (hard < 0.4) return;
  s.sprayAcc += dt * 40 * Math.min(2, hard);
  if (s.sprayAcc < 1) return;
  const pb = particles(run), side = Math.sign(r.lean || s.steerSide);
  const lx = Math.cos(r.heading), lz = -Math.sin(r.heading);
  while (s.sprayAcc >= 1) {
    s.sprayAcc--;
    const out = -side * (1.5 + Math.random() * 2.5);
    pb.spawn({ x: r.x, y: r.y + 0.15, z: r.z, vx: r.vx * 0.3 + lx * out, vy: 1.5 + Math.random() * 2, vz: r.vz * 0.3 + lz * out, gravity: 6, life: 0.8, size0: 0.18, size1: 0.7, alpha: 0.5, r: 0.95, g: 0.97, b: 1, kind: 'lump' });
  }
}

function poseFigure(run) {
  const s = run.split, fig = s.figure, st = s.stage;
  if (!fig || !s.skinner) return;
  fig.visible = true;
  const pose = fig.geometry.attributes.aPose;
  if (st === 'board' && s.rider) {
    const r = s.rider, air = r.air;
    const yaw = r.heading + (r.airborne ? 0 : r.brake * 1.15 * s.steerSide);
    _Z.set(Math.sin(yaw), 0, Math.cos(yaw));
    if (!r.airborne) { const h0 = groundHeight(r.x, r.z); _Z.y = (groundHeight(r.x + _Z.x * 0.8, r.z + _Z.z * 0.8) - h0) / 0.8; _Z.normalize(); }
    _X.crossVectors(UP, _Z).normalize();
    _Y.crossVectors(_Z, _X).normalize();
    const lean = r.crashT > 0 ? 1.35 * s.steerSide : r.airborne ? 0 : clamp(r.lean * 0.75, -0.8, 0.8);
    _Y.addScaledVector(_X, Math.tan(lean)).normalize();
    _X.crossVectors(_Y, _Z).normalize();
    _Z.crossVectors(_X, _Y).normalize();
    if (air && air.flip) { _q.setFromAxisAngle(_X, -air.flip); _Y.applyQuaternion(_q); _Z.applyQuaternion(_q); }
    const crouch = r.airborne ? 0.88 : 1 - Math.min(0.14, Math.abs(r.lean) * 0.15) - r.tuck * 0.16 - 0.03;
    _P.set(r.x, r.y + 0.03, r.z);
    _m.makeBasis(_X, _Y.multiplyScalar(crouch), _Z).setPosition(_P);
    pose.array[0] = Math.sin(yaw); pose.array[1] = 0; pose.array[2] = Math.cos(yaw); pose.array[3] = 0;
  } else {
    const sk = s.skinner, yaw = st === 'trans' ? s.halfAt.heading - Math.PI / 2 : sk.heading;
    _Z.set(Math.sin(yaw), 0, Math.cos(yaw));
    const h0 = groundHeight(sk.x, sk.z);
    _Z.y = (groundHeight(sk.x + _Z.x * 0.8, sk.z + _Z.z * 0.8) - h0) / 0.8;
    _Z.normalize();
    _X.crossVectors(UP, _Z).normalize();
    _Y.set(0, 1, 0).addScaledVector(_Z, 0.12).normalize(); // (upright, leaning a little into the climb)
    _X.crossVectors(_Y, _Z).normalize();
    _Z.crossVectors(_X, _Y).normalize();
    // the stride: a bob, and the poles planted in turn
    const ph = sk.stride * Math.PI, moving = Math.abs(sk.speed) > 0.2 ? 1 : 0;
    const bob = 1 - 0.03 * moving * Math.abs(Math.sin(ph)) - 0.02;
    _P.set(sk.x, sk.y + 0.03, sk.z);
    _m.makeBasis(_X, _Y.multiplyScalar(bob), _Z).setPosition(_P);
    const plant = sk.kickT > 0 || st === 'trans' ? 0 : moving * Math.sin(ph) * 0.9;
    pose.array[0] = Math.sin(yaw); pose.array[1] = 0; pose.array[2] = Math.cos(yaw); pose.array[3] = plant;
  }
  fig.setMatrixAt(0, _m);
  fig.instanceMatrix.needsUpdate = true;
  pose.needsUpdate = true;
}

export const SPLITBOARD_FEATURES = { splitboard };
