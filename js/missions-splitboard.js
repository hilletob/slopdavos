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
//               skier, the two halves as skis and the poles, to the snowboarder on the splitboard's own model). At the
//               transition a figure of joints (poseBoard) works on that model step by step as Space is held: each half held
//               up, its skin peeled from the tail, folded and stowed; the halves slid together, the clips closed, the
//               bindings across and pinned, stepped in; the camera close on it (transCamera). The marker poles (bamboo, an
//               orange top), the gates of red flags, a cairn
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

// --- The splitboard: the transition on the summit, then under the rider's feet ------------------------------------------
// Its own little model in the board's frame (`board.group`: x across, the seam of the joined board at x = 0; z along it to
// the nose, the way down; y up). Two halves, each its own outline (the straight inner edge, the sidecut, half of the rounded
// nose and tail) extruded to the board's thickness, the steel edge and the sidewall round it, the base below, the topsheet
// on top (one design over both halves, mapped in the joined board's coordinates so that it lines up once they are
// together), the tip and the tail bent up. On each half its binding, along the half in ski mode (on the touring bracket),
// the pucks it goes onto across the seam in ride mode, its pin; the skin on the base (a ribbon: the tip loop, the tail
// clip); the far half has the hooks at nose and tail, the near one the clips that close over the seam.
// The rider at the transition is a figure of joints in the same frame (two-bone IK: the hands on the work, a knee in the
// snow) at -x, facing +x. Drawn, the frame is mirrored across the board's long axis (MIRROR: x to -x, the board group's and
// the rider's matrices): the rider at +x, facing -x, the left foot to the nose, regular, the way the snowboarder of
// js/winter-sports.js stands on the board, so that once the straps are closed the ride goes on with the same board under
// the same feet (poseFigure poses the board with the rider). (Left and right in the poses below are those of the frame as
// made: drawn, his left hand does what they call the right one's work.)
const DEG = Math.PI / 180;
const HALF_W = 0.135, HALF_L = 1.6, THICK = 0.014;
const NOSE = 0.17; // m of the rounded nose and tail
/** The tip and the tail bent up: the base's height at z along the half */
const kick = (z) => { const a = Math.max(0, Math.abs(z) - (HALF_L / 2 - 0.24)) / 0.24; return 0.075 * a * a; };
const SKIN = { L: 1.5, tip: 0.75, w: HALF_W * 0.8, n: 44 }; // the skin from its tip loop (z = 0.75) back to its tail clip
const STANCE = { z: 0.25, duck: 15 * DEG, y: THICK + 0.017 }; // the bindings in ride mode: ±0.25 m, duck ±15°, on the pucks
const SLOT = [HALF_W / 2, -HALF_W / 2 - 0.2]; // the halves on the snow: the far one (side +1) at its place in the board, the near one 20 cm off
const SIDES = [1, -1];
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
const SKIN_ORDER = [1, 0]; // the near half's skin first
const ease = (v) => v * v * (3 - 2 * v);
const ph = (f, a, b) => ease(clamp((f - a) / (b - a), 0, 1));
const lin = (f, a, b) => clamp((f - a) / (b - a), 0, 1);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

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
  x.save(); x.translate(64, 820); x.rotate(Math.PI / 2);
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
/** Laid flat (y up), shifted so that the half's middle is at x = 0 (its inner edge at -side·W/2), the nose and tail bent up */
function layHalf(geo, side, lift = 0) {
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, p.getY(i) + lift + kick(p.getZ(i)));
    p.setX(i, p.getX(i) - side * HALF_W / 2);
  }
  geo.computeVertexNormals();
  return geo;
}
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

function buildBoard(run) {
  const g = new THREE.Group();
  g.name = 'Splitboard';
  g.matrixAutoUpdate = false;
  const top = new THREE.MeshStandardNodeMaterial({ map: topsheetTexture(), roughness: 0.35 });
  const base = mat(0x121316, { roughness: 0.3 }), steelEdge = mat(0xc9ced3, { metalness: 0.8, roughness: 0.25 });
  const plush = mat(0x7a2fb5, { roughness: 0.95 }), glue = mat(0xa9b1ba, { roughness: 0.3, side: THREE.BackSide });
  const steel = mat(0xc4c9ce, { metalness: 0.75, roughness: 0.3 }), dark = mat(0x26292e, { roughness: 0.6 });
  const strapM = mat(0xe2553a, { roughness: 0.6 }), orange = mat(0xff7a1a, { roughness: 0.5 });
  const halves = [];
  SIDES.forEach((side, i) => {
    const h = new THREE.Group();
    const shape = halfShape(side);
    // the core: its caps the base (the top cap under the topsheet), its sides the steel edge and the sidewall
    const core = layHalf(new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false, curveSegments: 10 }), side);
    const body = new THREE.Mesh(core, [base, steelEdge]);
    const sheet = new THREE.ShapeGeometry(shape, 10);
    const uv = sheet.attributes.uv, sp = sheet.attributes.position;
    // (u from +x to -x: drawn mirrored, the name reads the right way round)
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (HALF_W - sp.getX(k)) / (2 * HALF_W), (sp.getY(k) + HALF_L / 2) / HALF_L);
    h.add(body, new THREE.Mesh(layHalf(sheet, side, THICK + 0.0006), top));
    const inner = -side * HALF_W / 2, yTop = THICK + 0.004;
    // the hooks at nose and tail: the far half's reach over the seam, the near half's catch under them
    for (const z of [-0.64, 0.64]) {
      const hk = side > 0 ? box(0.05, 0.008, 0.05, steel) : box(0.03, 0.006, 0.05, steel);
      hk.position.set(side > 0 ? inner + 0.004 : inner - 0.016, yTop + kick(z), z);
      h.add(hk);
    }
    // the clips over the seam (the near half's levers, the far half's catches), open while the halves are apart
    const clips = [];
    for (const z of [0.45, -0.45]) {
      if (side > 0) { const c = box(0.03, 0.006, 0.04, steel); c.position.set(inner + 0.02, yTop, z); h.add(c); continue; }
      const seat = box(0.026, 0.008, 0.04, dark);
      seat.position.set(inner - 0.016, yTop, z);
      const lever = new THREE.Group();
      const arm = box(0.075, 0.012, 0.04, steel), tab = box(0.016, 0.02, 0.042, orange);
      arm.position.x = 0.0375; tab.position.set(0.07, 0.008, 0);
      lever.add(tab);
      lever.add(arm);
      lever.position.set(inner - 0.012, yTop + 0.006, z);
      h.add(seat, lever);
      clips.push(lever);
    }
    // the pucks under the ride stance (one of each binding's two on each half), the touring bracket the binding pivots on in ski mode
    for (const z of [-STANCE.z, STANCE.z]) { const pk = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 12), steel); pk.position.set(-side * 0.0225, THICK + 0.003, z); h.add(pk); }
    const bracket = box(0.09, 0.012, 0.03, steel);
    bracket.position.set(0, THICK + 0.006, 0.15);
    h.add(bracket);
    // the binding: a baseplate, the highback, two straps (open until stepped in), the pin
    const bind = new THREE.Group();
    const plate = box(0.1, 0.022, 0.28, dark);
    const back = box(0.1, 0.17, 0.025, dark);
    back.position.set(0, 0.09, -0.135); back.rotation.x = 0.18;
    const straps = [];
    for (const [z, d] of [[-0.03, 0.05], [0.1, 0.045]]) {
      const pivot = new THREE.Group(), sb = box(0.115, 0.03, d, strapM);
      sb.position.set(-0.0575, 0.03, 0);
      pivot.add(sb);
      pivot.position.set(0.055, 0.02, z);
      straps.push(pivot);
    }
    const pin = new THREE.Group(), rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 6).rotateX(Math.PI / 2), steel), ring = box(0.024, 0.024, 0.008, orange);
    ring.position.z = 0.05;
    pin.add(rod, ring);
    pin.position.set(0.058, -0.004, 0.09);
    bind.add(plate, back, ...straps, pin);
    h.add(bind);
    // the skin: a ribbon (its glue side the back faces), the tip loop and the tail clip; in the board's frame, not the half's
    const n = SKIN.n, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let k = 0; k < n; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const skinFace = new THREE.Mesh(geo, plush), skinBack = new THREE.Mesh(geo, glue);
    const tipLoop = box(SKIN.w * 0.9, 0.006, 0.02, steel), tailClip = box(SKIN.w * 0.8, 0.01, 0.035, dark);
    for (const o of [skinFace, skinBack]) o.frustumCulled = false;
    for (const o of [skinFace, skinBack, tipLoop, tailClip]) { o.matrixAutoUpdate = false; g.add(o); }
    h.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    skinFace.castShadow = true;
    g.add(h);
    halves.push({ root: h, side, bind, straps, pin, clips, skin: { geo, meshes: [skinFace, skinBack], tipLoop, tailClip, w: V(1, 0, 0) } });
  });
  const worker = buildWorker({ jacket: 0x1f8f8a, pants: 0x23262b, accent: 0xe2553a });
  worker.root.matrixAutoUpdate = false;
  run.group.add(worker.root);
  g.visible = false;
  run.group.add(g);
  return { group: g, halves, worker, frame: new THREE.Matrix4(), toW: new THREE.Matrix4(), toB: new THREE.Matrix4(), handsB: [V(), V()] };
}

// The rider at the transition: segments between joints (a unit cylinder, scaled and turned onto each), boxes for the boots,
// the gloves, the hips and the pack, the head with the helmet and the goggles
function buildWorker(look) {
  const root = new THREE.Group();
  root.name = 'Splitboard rider';
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1).translate(0, 0.5, 0), cube = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.SphereGeometry(1, 14, 10), dome = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const M = { jacket: mat(look.jacket), pants: mat(look.pants), accent: mat(look.accent, { roughness: 0.4 }), skin: mat(0xe0b49a), dark: mat(0x141518), lens: mat(0xf07a1a, { metalness: 0.6, roughness: 0.2 }), pack: mat(0x2c3540, { roughness: 0.8 }) };
  const part = (geo, m) => { const o = new THREE.Mesh(geo, m); o.matrixAutoUpdate = false; o.castShadow = true; root.add(o); return o; };
  const w = {
    root,
    torso: part(cyl, M.jacket), hips: part(cube, M.pants), pack: part(cube, M.pack),
    head: part(ball, M.skin), helmet: part(dome, M.accent), goggles: part(cube, M.lens), frame: part(cube, M.dark),
    thigh: [part(cyl, M.pants), part(cyl, M.pants)], shin: [part(cyl, M.pants), part(cyl, M.pants)], boot: [part(cube, M.dark), part(cube, M.dark)],
    upper: [part(cyl, M.jacket), part(cyl, M.jacket)], fore: [part(cyl, M.jacket), part(cyl, M.jacket)], glove: [part(cube, M.dark), part(cube, M.dark)],
    hands: [V(), V()] // where the gloves are (after the IK: the skin's ends go with them)
  };
  return w;
}

// Poses (the board's frame, facing +x, the left side -z): the pelvis P, the chest C (between the shoulders), the ankles, the
// feet's direction, the knees' hint
const standPose = (x, z, c = 0) => {
  const P = V(x - 0.14 * c, 0.93 - 0.45 * c, z);
  return { P, C: P.clone().add(V(0.04 + 0.3 * c, 0.5 - 0.12 * c, 0)), feet: [V(x + 0.02, 0.1, z - 0.13), V(x + 0.02, 0.1, z + 0.13)], fdir: [V(1, 0, -0.2), V(1, 0, 0.2)], knee: [V(1, 0, -0.25), V(1, 0, 0.25)] };
};
// On one knee at the board: the nose side's knee (+z, towards the camera) in the snow, sat back on its heel; the other foot
// planted ahead and out to the tail side, its knee up and out of the way; the back low enough over the work for the hands
// to reach it without folding him up (lean: the chest further over it; reach: the chest along the board, -1 to 1)
const kneelPose = (x, z, lean = 1, reach = 0) => {
  const P = V(x, 0.33, z);
  return {
    P, C: P.clone().add(V(0.24 + 0.08 * lean, 0.46 - 0.05 * lean, 0.14 * reach)),
    feet: [V(x + 0.16, 0.09, z - 0.36), V(x - 0.12, 0.1, z + 0.2)], fdir: [V(0.7, 0, -0.7), V(-1, -0.5, 0.1)],
    knee: [V(0.5, 1, -0.9), V(1, -0.3, 0.5)]
  };
};
const RIDE_DIR = [V(Math.sin(Math.PI / 2 + STANCE.duck), 0, Math.cos(Math.PI / 2 + STANCE.duck)), V(Math.sin(Math.PI / 2 - STANCE.duck), 0, Math.cos(Math.PI / 2 - STANCE.duck))];
const boardPose = (c = 0) => {
  const y = 0.012 + STANCE.y + 0.011 + 0.09, feet = [fromB(V(-0.03, y, -STANCE.z)), fromB(V(-0.03, y, STANCE.z))];
  const P = V(0.02 - 0.06 * c, (feet[0].y + feet[1].y) / 2 + 0.72 - 0.22 * c, 0);
  return { P, C: P.clone().add(V(0.1 + 0.3 * c, 0.48 - 0.12 * c, 0)), feet, fdir: [RIDE_DIR[0].clone(), RIDE_DIR[1].clone()], knee: [V(1, 0, -0.45), V(1, 0, 0.45)] };
};
function lerpPose(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const l = (u, v) => u.clone().lerp(v, t);
  return { P: l(a.P, b.P), C: l(a.C, b.C), feet: [l(a.feet[0], b.feet[0]), l(a.feet[1], b.feet[1])], fdir: [l(a.fdir[0], b.fdir[0]), l(a.fdir[1], b.fdir[1])], knee: [l(a.knee[0], b.knee[0]), l(a.knee[1], b.knee[1])] };
}
/** A hand at rest by the hip (s: -1 the left, +1 the right) */
const restHand = (pose, s) => bodyB(V(pose.P.x + 0.08, pose.P.y + 0.02, pose.P.z + s * 0.25));
// The body's coordinates: the board's frame's x and z, but the height straight up from the snow's plane (the board's frame
// leans with the slope, the rider stands upright): to the rider's level frame (bodyW), to the board's frame (bodyB), and
// back from the board's frame (fromB: the bindings' spots for the feet)
let CUR = null; // (the board posed)
const bodyW = (p, out = V()) => out.set(p.x, 0, p.z).applyMatrix4(CUR.toW).setY(out.y + p.y);
const bodyB = (p) => bodyW(p).applyMatrix4(CUR.toB);
function fromB(p) {
  const q = p.clone().applyMatrix4(CUR.toW), e = CUR.toW.elements; // (columns: x 0-2, z 8-10)
  const det = e[0] * e[10] - e[8] * e[2], x = (q.x * e[10] - e[8] * q.z) / det, z = (e[0] * q.z - q.x * e[2]) / det;
  return V(x, q.y - (x * e[1] + z * e[9]), z);
}

const _a = V(), _b = V(), _d = V(), _n = V(), _j = V(), _bx = V(), _by = V(), _bz = V(), _hx = V(), _hy = V(), _hz = V(), _t = V();
/** Two-bone IK: from A towards T, the middle joint bent towards `hint`; the joint into J, the end (T, if it reaches) into E */
function ik(A, T, l1, l2, hint, J, E) {
  _d.subVectors(T, A);
  let L = _d.length();
  _d.divideScalar(L || 1);
  L = clamp(L, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
  const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _n.copy(hint).addScaledVector(_d, -hint.dot(_d));
  if (_n.lengthSq() < 1e-8) _n.set(0, 1, 0);
  _n.normalize();
  J.copy(A).addScaledVector(_d, a).addScaledVector(_n, h);
  E.copy(A).addScaledVector(_d, L);
}
/** A unit cylinder from a to b, its section rx (along `side`) by rz */
function placeSeg(o, a, b, rx, rz, side) {
  _by.subVectors(b, a);
  const len = _by.length();
  _by.divideScalar(len || 1);
  _bx.copy(side).addScaledVector(_by, -side.dot(_by));
  if (_bx.lengthSq() < 1e-8) _bx.set(0, 0, 1).addScaledVector(_by, -_by.z);
  _bx.normalize();
  _bz.crossVectors(_bx, _by);
  o.matrix.makeBasis(_bx.multiplyScalar(rx), _by.multiplyScalar(len), _bz.multiplyScalar(rz)).setPosition(a);
}
/** A unit box (or sphere) at c, its axes X, Y, Z scaled by sx, sy, sz */
function placeBox(o, c, X, Y, Z, sx, sy, sz) {
  o.matrix.makeBasis(_a.copy(X).multiplyScalar(sx), _b.copy(Y).multiplyScalar(sy), _t.copy(Z).multiplyScalar(sz)).setPosition(c);
}

const _J = [V(), V()], _E = V(), _hip = V(), _sh = V(), _fz = V(), _fy = V(), _fx = V(), _hc = V();
/** The rider in a pose, the hands at `hands` (as far as the arms reach), the head turned to `look` */
function poseWorker(w, pose, hands, look) {
  const { P, C } = pose;
  // the body's frame: Y up the spine, Z forward, X to the left
  _hy.subVectors(C, P).normalize();
  _hz.set(1, 0, 0).addScaledVector(_hy, -_hy.x).normalize();
  _hx.crossVectors(_hy, _hz);
  const bY = _hy.clone(), bZ = _hz.clone(), bX = _hx.clone();
  placeSeg(w.torso, _a.copy(P).addScaledVector(bY, -0.04), _b.copy(C).addScaledVector(bY, 0.03), 0.175, 0.12, bX);
  placeBox(w.hips, _j.copy(P).addScaledVector(bY, 0.02), bX, bY, bZ, 0.32, 0.17, 0.21);
  placeBox(w.pack, _j.copy(C).addScaledVector(bY, -0.2).addScaledVector(bZ, -0.17), bX, bY, bZ, 0.28, 0.4, 0.14);
  // the head looks at the work (not further round than the shoulders let it, the chin up off the chest: bent over, the
  // face still shows)
  _hc.copy(C).addScaledVector(bY, 0.2).addScaledVector(bZ, 0.02);
  _fz.subVectors(look, _hc).normalize().add(_t.set(bZ.x, 0, bZ.z).normalize().multiplyScalar(0.7)).normalize();
  _fy.copy(bY).addScaledVector(_fz, -bY.dot(_fz)).normalize();
  _fx.crossVectors(_fy, _fz);
  placeBox(w.head, _hc, _fx, _fy, _fz, 0.095, 0.105, 0.1);
  placeBox(w.helmet, _j.copy(_hc).addScaledVector(_fy, 0.015), _fx, _fy, _fz, 0.122, 0.125, 0.135);
  placeBox(w.goggles, _j.copy(_hc).addScaledVector(_fy, 0.005).addScaledVector(_fz, 0.098), _fx, _fy, _fz, 0.19, 0.06, 0.03);
  placeBox(w.frame, _j.copy(_hc).addScaledVector(_fy, 0.005).addScaledVector(_fz, 0.088), _fx, _fy, _fz, 0.205, 0.075, 0.02);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1; // (bX is the left: the left hip, shoulder at +bX)
    // the leg: hip, knee, ankle; the boot along the foot, its top up the shin
    _hip.copy(P).addScaledVector(bX, s * 0.1);
    ik(_hip, pose.feet[i], 0.44, 0.43, pose.knee[i], _J[i], _E);
    placeSeg(w.thigh[i], _hip, _J[i], 0.075, 0.08, bX);
    placeSeg(w.shin[i], _J[i], _E, 0.06, 0.065, bX);
    _fz.copy(pose.fdir[i]).normalize();
    _fy.subVectors(_J[i], _E).addScaledVector(_fz, -_t.subVectors(_J[i], _E).dot(_fz)).normalize();
    _fx.crossVectors(_fy, _fz);
    placeBox(w.boot[i], _j.copy(_E).addScaledVector(_fy, -0.035).addScaledVector(_fz, 0.05), _fx, _fy, _fz, 0.115, 0.13, 0.3);
    // the arm: shoulder, elbow (down, out and back), the glove
    _sh.copy(C).addScaledVector(bX, s * 0.195).addScaledVector(bY, -0.04);
    _n.copy(bY).multiplyScalar(-1).addScaledVector(bX, s * 0.7).addScaledVector(bZ, -0.4);
    ik(_sh, hands[i], 0.3, 0.28, _n.clone(), _J[i], _E);
    placeSeg(w.upper[i], _sh, _J[i], 0.055, 0.055, bX);
    placeSeg(w.fore[i], _J[i], _E, 0.047, 0.047, bX);
    _fz.subVectors(_E, _J[i]).normalize();
    w.hands[i].copy(_E).addScaledVector(_fz, 0.045);
    _fy.copy(bY).addScaledVector(_fz, -bY.dot(_fz));
    if (_fy.lengthSq() < 1e-6) _fy.copy(bZ);
    _fy.normalize();
    _fx.crossVectors(_fy, _fz);
    placeBox(w.glove[i], w.hands[i], _fx, _fy, _fz, 0.085, 0.1, 0.11);
  }
}

// The skin as a ribbon: its first `stuck` m (from the tip) on the base of `half`, the rest hanging from there (or from
// `from`, the hand holding its tip) to `to` (the hand holding its tail), `len` m of it
const _sp = [], _sw = V(), _s0 = V(), _s1 = V(), _sq = V();
for (let k = 0; k <= SKIN.n; k++) _sp.push(V());
const basePoint = (half, s, out) => { const z = SKIN.tip - s; return out.set(0, kick(z) - 0.0035, z).applyMatrix4(half.root.matrix); };
function hangPoint(a, b, sag, u, out) { return out.copy(a).lerp(b, u).setY(out.y - sag * 4 * u * (1 - u)); }
/** How far a rope of `len` from a to b sags (a parabola, its length matched) */
function sagFor(a, b, len) {
  const chord = a.distanceTo(b);
  if (chord >= len) return 0;
  let lo = 0, hi = len;
  for (let it = 0; it < 18; it++) {
    const mid = (lo + hi) / 2;
    let L = 0;
    hangPoint(a, b, mid, 0, _s0);
    for (let k = 1; k <= 16; k++) { hangPoint(a, b, mid, k / 16, _s1); L += _s0.distanceTo(_s1); _s0.copy(_s1); }
    if (L > len) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
function poseSkin(half, stuck, from, to, len, visible) {
  const sk = half.skin;
  for (const o of [...sk.meshes, sk.tipLoop, sk.tailClip]) o.visible = visible;
  if (!visible) return;
  const n = SKIN.n, total = stuck + len;
  const nStuck = stuck <= 0 ? 0 : len <= 1e-3 ? n : Math.max(1, Math.min(n - 1, Math.round((n * stuck) / total)));
  for (let k = 0; k <= nStuck && nStuck > 0; k++) basePoint(half, (stuck * k) / nStuck, _sp[k]);
  if (nStuck < n) {
    const a = nStuck > 0 ? _sp[nStuck] : (from || basePoint(half, 0, _sp[0]));
    const A = _s0.copy(a).clone(), B = to.clone(), sag = sagFor(A, B, len);
    for (let k = nStuck; k <= n; k++) hangPoint(A, B, sag, (k - nStuck) / (n - nStuck), _sp[k]);
  }
  // the width across: the half's on the base, level across the hanging part (the way it was, where that is not clear)
  _sw.setFromMatrixColumn(half.root.matrix, 0).normalize();
  const pos = sk.geo.attributes.position.array, hw = SKIN.w / 2;
  for (let k = 0; k <= n; k++) {
    if (k > nStuck || nStuck === 0) {
      _sq.subVectors(_sp[Math.min(n, k + 1)], _sp[Math.max(0, k - 1)]);
      _t.set(-_sq.z, 0, _sq.x);
      if (_t.lengthSq() > 1e-6) { _t.normalize(); if (_t.dot(sk.w) < 0) _t.negate(); sk.w.lerp(_t, 0.5).normalize(); }
    } else sk.w.copy(_sw);
    const p = _sp[k], o = k * 6;
    pos[o] = p.x + sk.w.x * hw; pos[o + 1] = p.y + sk.w.y * hw; pos[o + 2] = p.z + sk.w.z * hw;
    pos[o + 3] = p.x - sk.w.x * hw; pos[o + 4] = p.y - sk.w.y * hw; pos[o + 5] = p.z - sk.w.z * hw;
  }
  sk.geo.attributes.position.needsUpdate = true;
  sk.geo.computeVertexNormals();
  // the tip loop and the tail clip at the ends, across the ribbon
  for (const [o, k0, k1] of [[sk.tipLoop, 0, 1], [sk.tailClip, n, n - 1]]) {
    _bz.subVectors(_sp[k0], _sp[k1]).normalize();
    _bx.set(pos[k0 * 6] - pos[k0 * 6 + 3], pos[k0 * 6 + 1] - pos[k0 * 6 + 4], pos[k0 * 6 + 2] - pos[k0 * 6 + 5]).normalize();
    _by.crossVectors(_bz, _bx);
    o.matrix.makeBasis(_bx, _by, _bz).setPosition(_sp[k0]);
  }
}

const _q1 = new THREE.Quaternion(), _p1 = V();
/** The board's frame on the snow at (x, z) along `heading`: on the slope's plane there (the summit is a ridge, ~15° across) */
function snowFrame(x, z, heading, out) {
  const e = 1.2, h0 = groundHeight(x, z);
  _Y.set(-(groundHeight(x + e, z) - groundHeight(x - e, z)) / (2 * e), 1, -(groundHeight(x, z + e) - groundHeight(x, z - e)) / (2 * e)).normalize();
  _Z.set(Math.sin(heading), 0, Math.cos(heading));
  _Z.addScaledVector(_Y, -_Z.dot(_Y)).normalize();
  _X.crossVectors(_Y, _Z);
  return out.makeBasis(_X, _Y, _Z).setPosition(x, h0 + 0.03, z);
}
const ZAXIS = V(0, 0, 1);
/** Held up on its tail in front of the rider, the base (the skin) towards him and a little towards the camera */
const UPRIGHT = { tail: V(-0.4, 0, 0.22), face: V(-Math.cos(55 * DEG), 0, Math.sin(55 * DEG)) };
function uprightPose(pos, quat) {
  const f = UPRIGHT.face;
  _bz.set(0, 1, 0).addScaledVector(f, -0.12).normalize(); // (the tip leans a little away from him)
  _by.copy(f).multiplyScalar(-1).addScaledVector(_bz, f.dot(_bz)).normalize(); // the topsheet away from him
  _bx.crossVectors(_by, _bz);
  quat.setFromRotationMatrix(_m.makeBasis(_bx, _by, _bz));
  pos.copy(UPRIGHT.tail).addScaledVector(_by, -kick(HALF_L / 2)).addScaledVector(_bz, HALF_L / 2);
}
/** A point on a half (its own coordinates) in the board's frame */
const onHalf = (half, x, y, z, out = V()) => out.set(x, y, z).applyMatrix4(half.root.matrix);

/**
 * The transition's pose: tr { step, t, done } (js/missions-data-splitboard.js stepTransition). The steps: the skins off
 * (each half held up on its tail, the skin peeled from the tail to the tip, the tip loop off, folded glue to glue and
 * stowed in the jacket), the halves laid together (the near one tipped onto its inner edge, slid in under the hooks, laid
 * flat), the clips closed, the bindings across onto the pucks and pinned, stepped in and the straps closed.
 */
function poseBoard(b, tr) {
  CUR = b;
  const steps = SPLIT.transition, n = steps.length;
  const k = tr.done ? n : tr.step, f = tr.done ? 1 : clamp(tr.t / steps[k].hold, 0, 1);
  const F = (j) => (k > j ? 1 : k === j ? f : 0);
  const at = (id) => F(steps.findIndex((s) => s.id === id));
  const pSkin = [at('skin1'), at('skin2')], pJoin = at('join'), pClip = at('clips'), pBind = at('bind'), pStrap = at('strap');
  // the halves
  b.halves.forEach((half, i) => {
    const root = half.root;
    let x = SLOT[i], tilt = 0;
    if (i === 1) {
      tilt = -0.32 * ph(pJoin, 0.18, 0.34) * (1 - ph(pJoin, 0.72, 0.9));
      x = SLOT[1] + (-HALF_W / 2 - SLOT[1]) * ph(pJoin, 0.3, 0.72);
    }
    root.position.set(x, 0.012 + Math.sin(-tilt) * HALF_W / 2, 0);
    root.quaternion.setFromAxisAngle(ZAXIS, tilt);
    const p = pSkin[SKIN_ORDER.indexOf(i)], held = ph(p, 0.02, 0.14) * (1 - ph(p, 0.6, 0.74));
    if (held > 0) {
      uprightPose(_p1, _q1);
      root.position.lerp(_p1, held).y += 0.18 * Math.sin(Math.PI * held) * (1 - held);
      root.quaternion.slerp(_q1, held);
    }
    root.updateMatrix();
    // the clips: open until the halves are together
    half.clips.forEach((c, j) => { c.rotation.z = 2.5 * (1 - ph(pClip, j ? 0.6 : 0.16, j ? 0.82 : 0.38)); });
  });
  // the bindings: lifted off the touring bracket, turned across, onto the pucks, the pin in; the straps closed on the boots
  const bm = [ph(pBind, 0.08, 0.4), ph(pBind, 0.56, 0.88)]; // (the far half's binding to the front, the near one's to the back)
  b.halves.forEach((half, i) => {
    const m = bm[i], bind = half.bind, root = half.root;
    const rz = i === 0 ? STANCE.z : -STANCE.z, ry = Math.PI / 2 + (i === 0 ? -STANCE.duck : STANCE.duck);
    bind.position.set((0 - root.position.x) * m, THICK + 0.011 + (STANCE.y - THICK - 0.011) * m + 0.07 * Math.sin(Math.PI * m), rz * m);
    bind.rotation.y = ry * m;
    const pinOut = i === 0 ? ph(pBind, 0.02, 0.08) - ph(pBind, 0.4, 0.47) : ph(pBind, 0.5, 0.56) - ph(pBind, 0.88, 0.95);
    half.pin.position.z = 0.09 + 0.1 * pinOut;
    const close = i === 0 ? ph(pStrap, 0.5, 0.62) : ph(pStrap, 0.66, 0.78);
    half.straps.forEach((s) => { s.rotation.z = -2.2 * (1 - close); });
    bind.updateMatrix();
  });
  // the rider, the skins
  const hands = [null, null];
  let pose, look = null;
  const near = b.halves[1];
  if (pJoin <= 0) {
    // the skins: the half he works on, its skin
    const j = pSkin[0] < 1 ? 0 : 1, p = pSkin[j], half = b.halves[SKIN_ORDER[j]];
    const peel = lin(p, 0.2, 0.56);
    const c = 0.95 * ph(p, 0.04, 0.16) * (1 - ph(p, 0.2, 0.46)) + 0.45 * Math.sin(Math.PI * lin(p, 0.58, 0.76));
    pose = standPose(-0.78, 0.04, c);
    // the left hand on the half's edge near the tip (on the side towards -z), then the tip loop; the right on the tail
    // clip, peeling up the base, holding the tail; together to fold it, into the jacket
    _t.setFromMatrixColumn(half.root.matrix, 0);
    const edgeX = (_t.z > 0 ? -1 : 1) * HALF_W / 2;
    const grip = onHalf(half, edgeX, THICK, 0.42), tipPt = basePoint(half, 0, V());
    const sPeel = SKIN.L * (1 - peel), out = V().setFromMatrixColumn(half.root.matrix, 1).multiplyScalar(-1);
    const along = V().setFromMatrixColumn(half.root.matrix, 2);
    const peelHand = basePoint(half, sPeel, V()).addScaledVector(out, 0.14).addScaledVector(along, -0.04);
    const restL = restHand(pose, -1), restR = restHand(pose, 1);
    const foldL = bodyB(V(pose.P.x + 0.36, pose.P.y + 0.4, -0.05)), foldR = bodyB(V(pose.P.x + 0.36, pose.P.y + 0.4, 0.07));
    const chest = bodyB(pose.C.clone().add(V(0.14, -0.1, 0.0)));
    let L = restL.clone().lerp(grip, ph(p, 0, 0.08));
    L.lerp(tipPt, ph(p, 0.7, 0.76)).lerp(foldL, ph(p, 0.78, 0.88)).lerp(chest, ph(p, 0.9, 0.96)).lerp(restL, ph(p, 0.97, 1));
    let R = restR.clone().lerp(basePoint(half, SKIN.L, V()).addScaledVector(out, 0.05), ph(p, 0.1, 0.18));
    if (p >= 0.2) R = peelHand.clone();
    if (p > 0.56) R = basePoint(half, 0, V()).addScaledVector(out, 0.14).addScaledVector(along, -0.04).lerp(foldR, ph(p, 0.6, 0.86));
    R.lerp(chest, ph(p, 0.9, 0.96)).lerp(restR, ph(p, 0.97, 1));
    hands[0] = L; hands[1] = R;
    look = p < 0.2 ? grip.clone().lerp(basePoint(half, SKIN.L, V()), ph(p, 0.06, 0.14)) : p < 0.6 ? basePoint(half, sPeel, V()) : bodyB(V(pose.P.x + 0.4, 0.8, 0.02));
    placeWorker(b, pose, hands, look);
    const hb = b.handsB;
    // the skin: on the base; the tail end in the right hand, peeled up to the tip; from the tip loop alone; in both hands,
    // folded (shorter and shorter as it is folded again) and gone into the jacket
    b.halves.forEach((h2, i) => { if (h2 !== half) poseSkin(h2, SKIN.L, null, null, 0, pSkin[SKIN_ORDER.indexOf(i)] < 1); });
    if (p < 0.2) poseSkin(half, SKIN.L, null, null, 0, true);
    else if (p < 0.56) poseSkin(half, sPeel, null, hb[1], SKIN.L - sPeel, true);
    else if (p < 0.76) poseSkin(half, 0, null, hb[1], SKIN.L, true);
    else poseSkin(half, 0, hb[0], hb[1], SKIN.L + (0.3 - SKIN.L) * ph(p, 0.86, 0.96), p < 0.965);
  } else {
    for (const h2 of b.halves) poseSkin(h2, 0, null, null, 0, false);
    if (pClip <= 0) {
      // the near half: hands on it, tipped onto its inner edge, slid in, laid flat
      // (down on the knee clear of the near half, along with it as it slides in)
      pose = lerpPose(standPose(-0.78, 0.04), kneelPose(-0.72, 0, 1.2), ph(pJoin, 0, 0.2));
      if (pJoin > 0.3) pose = lerpPose(pose, kneelPose(-0.5, 0, 1.1), ph(pJoin, 0.3, 0.72));
      const restL = restHand(pose, -1), restR = restHand(pose, 1), on = ph(pJoin, 0.08, 0.2) * (1 - ph(pJoin, 0.9, 1));
      hands[0] = restL.lerp(onHalf(near, 0.01, THICK + 0.03, -0.32), on);
      hands[1] = restR.lerp(onHalf(near, 0.01, THICK + 0.03, 0.32), on);
      look = onHalf(near, 0.06, 0, 0);
    } else if (pBind <= 0) {
      // the clips: the right hand closes the front one, the left the back one
      const reach = ph(pClip, 0, 0.14) * (1 - ph(pClip, 0.38, 0.5)) - ph(pClip, 0.42, 0.54) * (1 - ph(pClip, 0.84, 0.96));
      pose = kneelPose(-0.5, 0, 1.1, reach);
      const tipOf = (c) => { c.updateMatrix(); return V(0.07, 0.03, 0).applyMatrix4(c.matrix).applyMatrix4(near.root.matrix); };
      const hand = (c, a0, a1) => restHand(pose, c ? -1 : 1).lerp(tipOf(near.clips[c]), ph(pClip, a0, a0 + 0.12) * (1 - ph(pClip, a1, a1 + 0.1)));
      hands[0] = hand(1, 0.46, 0.84); hands[1] = hand(0, 0.04, 0.4);
      look = V(0, 0, pClip < 0.5 ? 0.45 : -0.45);
    } else if (pStrap <= 0) {
      // the bindings: the right hand the front one, the left the back one
      pose = kneelPose(-0.5, 0, 1.1, 0.6 * (ph(pBind, 0, 0.1) * (1 - ph(pBind, 0.42, 0.5)) - ph(pBind, 0.46, 0.56) * (1 - ph(pBind, 0.92, 1))));
      const bpt = (i) => { const h2 = b.halves[i]; return onHalf(h2, h2.bind.position.x, h2.bind.position.y + 0.08, h2.bind.position.z); };
      hands[1] = restHand(pose, 1).lerp(bpt(0), ph(pBind, 0.0, 0.08) * (1 - ph(pBind, 0.47, 0.54)));
      hands[0] = restHand(pose, -1).lerp(bpt(1), ph(pBind, 0.48, 0.56) * (1 - ph(pBind, 0.95, 1)));
      look = bpt(pBind < 0.5 ? 0 : 1);
    } else {
      // up, onto the board (the front foot first), bent down to the straps, up into the stance
      const p = pStrap;
      const stood = lerpPose(kneelPose(-0.5, 0, 1.1), standPose(-0.62, 0), ph(p, 0, 0.18));
      pose = lerpPose(stood, boardPose(0.35), ph(p, 0.18, 0.44));
      pose = lerpPose(pose, boardPose(1), ph(p, 0.44, 0.52) * (1 - ph(p, 0.8, 0.94)));
      pose = lerpPose(pose, boardPose(0.12), ph(p, 0.8, 0.94));
      const target = boardPose(0.35), from = standPose(-0.62, 0);
      if (p >= 0.18) for (const [i, a0, a1] of [[1, 0.18, 0.3], [0, 0.3, 0.44]]) {
        const u = ph(p, a0, a1);
        pose.feet[i] = from.feet[i].clone().lerp(target.feet[i], u);
        pose.feet[i].y += 0.18 * Math.sin(Math.PI * u);
        pose.fdir[i] = from.fdir[i].clone().lerp(target.fdir[i], u);
      }
      const strap = (i) => { const h2 = b.halves[i]; return onHalf(h2, h2.bind.position.x, h2.bind.position.y + 0.1, h2.bind.position.z); };
      const out = (s) => bodyB(V(pose.P.x + 0.16, pose.P.y + 0.14, s * 0.62));
      hands[1] = restHand(pose, 1).lerp(strap(0), ph(p, 0.44, 0.52) * (1 - ph(p, 0.62, 0.68))).lerp(out(1), ph(p, 0.84, 0.98));
      hands[0] = restHand(pose, -1).lerp(strap(1), ph(p, 0.6, 0.68) * (1 - ph(p, 0.78, 0.84))).lerp(out(-1), ph(p, 0.84, 0.98));
      look = p < 0.5 ? strap(0) : p < 0.82 ? strap(1) : V(1.5, 1.2, 2.5);
    }
    placeWorker(b, pose, hands, look);
  }
}

/**
 * The rider stands upright on the slope while the board lies on it: the poses are made in the board's frame (b.toW takes
 * them to the rider's level frame: the positions, the feet's directions; the spine stays upright), the hands back to the
 * board's frame for the skin's ends (b.handsB)
 */
function placeWorker(b, pose, hands, look) {
  const M = b.toW, P = bodyW(pose.P);
  const lv = { P, C: P.clone().add(_t.subVectors(pose.C, pose.P)), feet: pose.feet.map((f) => bodyW(f)), fdir: pose.fdir.map((d) => d.clone().transformDirection(M)), knee: pose.knee };
  poseWorker(b.worker, lv, hands.map((h) => h.clone().applyMatrix4(M)), look.clone().applyMatrix4(M));
  b.worker.hands.forEach((h, i) => b.handsB[i].copy(h).applyMatrix4(b.toB));
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
      gates, board: buildBoard(run), track: buildTrack(run), toast: createToast(run), halfAt: null, posePin: null, handoff: 0, handoffQ: new THREE.Quaternion(),
      skinner: null, rider: null, stage: null, person, steerSide: 1, landings: [],
      saved: { label: person.label, topSpeedKmh: person.topSpeedKmh, chaseDistance: person.chaseDistance, chaseHeight: person.chaseHeight }, savedTargetY: person.cameraTargetOffset.y, sprayAcc: 0, beepT: 0
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
    s.board.group.visible = false;
    s.halfAt = null;
    s.handoff = 0;
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
    s.person.cameraTargetOffset.y = s.savedTargetY;
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
        const last = done.id === SPLIT.transition.at(-1).id;
        beep(run, last ? 1600 : 900, 0.08, 0.07);
        if (last) s.toast.show('Board together: drop in!', '#fff', 1.8);
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
    if (s.stage === 'trans' && run.state && s.halfAt) {
      // (s.posePin { step, f }: a step held still, for the probe scripts)
      const pin = s.posePin, steps = SPLIT.transition;
      poseBoard(s.board, pin ? { step: Math.min(pin.step, steps.length - 1), t: pin.step >= steps.length ? 0 : pin.f * steps[pin.step].hold, done: pin.step >= steps.length } : run.state.trans);
    }
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
  const s = run.split, prev = s.stage;
  s.stage = now;
  const sk = s.skinner, b = s.board;
  setRide(s, now === 'board');
  s.person.cameraTargetOffset.y = s.savedTargetY;
  if (now === 'trans') {
    // on the summit: the board's halves on the snow beside the walker, along the way down (to the first gate), the walker
    // at their side (x = -0.78 in the board's frame as made, +0.78 drawn: MIRROR); the transition's own camera (drive)
    const g = run.state?.down.gates[0];
    const h = g ? Math.atan2(g.x - sk.x, g.z - sk.z) : sk.heading;
    s.halfAt = { x: sk.x - Math.cos(h) * 0.78, z: sk.z + Math.sin(h) * 0.78, heading: h };
    snowFrame(s.halfAt.x, s.halfAt.z, h, b.frame);
    b.group.matrix.multiplyMatrices(b.frame, MIRROR);
    b.worker.root.matrix.makeRotationY(h).setPosition(_P.setFromMatrixPosition(b.frame)).multiply(MIRROR);
    b.toB.copy(b.group.matrix).invert().multiply(b.worker.root.matrix);
    b.toW.copy(b.toB).invert();
    b.group.visible = b.worker.root.visible = true;
    poseBoard(b, run.state?.trans || { step: 0, t: 0, done: false });
    setKind(s, 2);
    s.toast.show(`Chörbschhorn · ${SPLIT_PLACES.summit.ele} m`, '#fff', 3.2);
  } else b.group.visible = b.worker.root.visible = false;
  cm.setEntityHidden('person', true);
  if (now === 'rescue') {
    // off the board (if on it) and walking, the transceiver on search
    if (s.rider) { const r = s.rider; Object.assign(sk, { x: r.x, z: r.z, y: groundHeight(r.x, r.z), heading: travelHeading(r, r.heading), speed: 0, kickT: 0 }); s.rider = null; }
    setKind(s, 0);
    touchLabel(run, 'Probe/Dig');
    return;
  }
  if (now === 'board' && !s.rider) {
    // from the transition: on the board as it lies, the way it points; else (after a rescue) where the walker stood, to the next gate
    const g = run.state?.down.gates[Math.min(run.state.down.next, run.state.down.gates.length - 1)];
    if (prev === 'trans' && s.halfAt) {
      s.rider = createRider(s.halfAt.x, groundHeight(s.halfAt.x, s.halfAt.z), s.halfAt.z, s.halfAt.heading);
      // (the board as it lay on the slope: the ride's frame takes over within half a second, poseFigure)
      s.handoff = 1;
      s.handoffQ.setFromRotationMatrix(b.frame);
    }
    else s.rider = createRider(sk.x, groundHeight(sk.x, sk.z), sk.z, g ? Math.atan2(g.x - sk.x, g.z - sk.z) : sk.heading);
    s.person.chaseDistance = 7.5;
    s.person.chaseHeight = 2.8;
    s.track.last = null;
    touchLabel(run, 'Grab');
  }
  if (now === 'board') {
    // the splitboard under the feet, joined, the rider without the figure's own board (poseFigure poses it with him)
    poseBoard(b, { step: SPLIT.transition.length, t: 0, done: true });
    b.worker.root.visible = false;
    b.group.visible = true;
    setKind(s, 3);
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
  if (st === 'trans' && s.halfAt) {
    // beside you, watching (behind the board's tail, at your side of it)
    const A = s.halfAt, h = A.heading, bx = 1.25, bz = -2.2;
    x = A.x + Math.cos(h) * bx + Math.sin(h) * bz; z = A.z - Math.sin(h) * bx + Math.cos(h) * bz;
    yaw = Math.atan2(A.x - x, A.z - z);
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
    s.handoff = Math.max(0, s.handoff - dt * 2);
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
  if (stg === 'trans' && s.halfAt) { transCamera(run, p); return; }
  // the chase camera keeps the framing of level ground on the slope (js/cameras.js slopePitch)
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const pitch = Math.atan2(groundHeight(p.position.x - fx * 2, p.position.z - fz * 2) - groundHeight(p.position.x + fx * 2, p.position.z + fz * 2), 4);
  p.slopePitch = (p.slopePitch ?? pitch) + (pitch - (p.slopePitch ?? pitch)) * Math.min(1, dt * 4);
}

// The transition's camera, close on the board and the hands: from in front of the rider, off to his left (the board's
// nose side), higher while the skins come off (a half held up), lower over the board on the snow. The chase camera made to
// frame it: the hidden pedestrian stands in for the spot looked at, its heading the way the camera looks, its target
// offset tipping the view down onto it (js/cameras.js chase: the look point 5.2 m ahead at 1.55 m + the offset).
// at, from: [x, z] in the board's frame as made (x across, the rider at -x; z to the nose)
const TRANS_CAM = {
  skins: { at: [-0.5, 0.15], from: [0.9, 2.4], h: 1.5, look: 0.8 },
  board: { at: [-0.25, 0], from: [1.65, 1.15], h: 0.55, look: 0.32 },
  stepIn: { at: [-0.1, 0], from: [2.1, 1.5], h: 1.4, look: 0.75 }
};
function transCamera(run, p) {
  const s = run.split, A = s.halfAt, tr = run.state?.trans;
  const step = s.posePin ? s.posePin.step : tr?.done ? SPLIT.transition.length : tr?.step ?? 0;
  const c = step < 2 ? TRANS_CAM.skins : step < 5 ? TRANS_CAM.board : TRANS_CAM.stepIn;
  // (the board's x axis drawn: MIRROR)
  const h = A.heading, xx = -Math.cos(h), xz = Math.sin(h), zx = Math.sin(h), zz = Math.cos(h);
  const ax = A.x + xx * c.at[0] + zx * c.at[1], az = A.z + xz * c.at[0] + zz * c.at[1];
  const ox = xx * c.from[0] + zx * c.from[1], oz = xz * c.from[0] + zz * c.from[1], D = Math.hypot(ox, oz);
  p.position.set(ax, groundHeight(A.x, A.z) + 0.03, az);
  p.heading = Math.atan2(-ox, -oz);
  p.chaseDistance = D;
  p.chaseHeight = c.h;
  p.cameraTargetOffset.y = c.look + ((c.look - c.h) * 5.2) / D - 1.55;
  p.speed = 0;
  p.slopePitch = 0;
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
  fig.visible = st !== 'trans'; // (at the transition: the board's own rider, js poseBoard)
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
    if (s.handoff > 0) {
      _q.setFromRotationMatrix(_m.makeBasis(_X, _Y, _Z)).slerp(s.handoffQ, ease(s.handoff));
      _X.set(1, 0, 0).applyQuaternion(_q); _Y.set(0, 1, 0).applyQuaternion(_q); _Z.set(0, 0, 1).applyQuaternion(_q);
    }
    const crouch = r.airborne ? 0.88 : 1 - Math.min(0.14, Math.abs(r.lean) * 0.15) - r.tuck * 0.16 - 0.03;
    _P.set(r.x, r.y + 0.03, r.z);
    // the splitboard under the feet, leaning and turning with him (not crouching)
    if (s.board.group.visible) s.board.group.matrix.makeBasis(_X, _Y, _Z).setPosition(_P).multiply(MIRROR);
    _m.makeBasis(_X, _Y.multiplyScalar(crouch), _Z).setPosition(_P);
    pose.array[0] = Math.sin(yaw); pose.array[1] = 0; pose.array[2] = Math.cos(yaw); pose.array[3] = 0;
  } else {
    const sk = s.skinner, yaw = sk.heading;
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
