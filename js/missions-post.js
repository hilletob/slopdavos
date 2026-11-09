import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { painted, createHelper } from './missions-props.js';
import { VEHICLES, holdButton, createToast, particles, lump } from './missions-work.js';
import { BODY_SPECS, buildCarGeometry, buildSteerableWheelGeo, createLoftedCarMaterial } from './actor-models.js';
import { stepPost } from './missions-data-post.js';

// js/missions-post.js
// The runtime of the postman's round (js/missions-data-post.js has its definition and logic; js/missions.js takes
// POST_FEATURES into its FEATURES). The player's car is driven through js/missions-work.js workVehicle, which wears the
// vehicle registered here in its VEHICLES:
//   postVan     the Post's yellow delivery van: the traffic's lofted minibus body (js/actor-models.js BODY_SPECS.van)
//               painted yellow with a black POST band on its sides, the player's brake and indicator lights on it.
//   postRound   the eight post boxes: a yellow box with a rounded roof, the slot, a post horn on each side and a door
//               under the slot carrying the plate with the collection times, on a grey pillar; Space (or E, the touch
//               button) held while the van stands by a box empties it: the postman steps up, the door swings open, the
//               letters fly over to the van. The toast counts the boxes.
// Everything is built for the run and goes with its group (js/missions.js disposes it).

const vertexMat = (o = {}) => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, ...o });
const boxAt = (w, h, l, hex, x, y, z) => painted(new THREE.BoxGeometry(w, h, l), hex).translate(x, y, z);
const POST_YELLOW = 0xffcc00;

// =====================================================================================================================
// The van
function bandTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#16181b'; x.fillRect(0, 18, 512, 60);
  x.fillStyle = '#ffcc00'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 52px system-ui, sans-serif'; x.fillText('POST', 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildPostVan() {
  const g = new THREE.Group();
  g.name = 'PostVan';
  const spec = BODY_SPECS.van;
  const bodyMat = createLoftedCarMaterial(spec, POST_YELLOW);
  bodyMat.userData.shared = true; // (cached by js/actor-models.js: not the run's to dispose)
  const body = new THREE.Mesh(buildCarGeometry(spec, false), bodyMat);
  body.castShadow = true;
  g.add(body);
  // the black band with the lettering along both sides, under the windows
  const bandMat = new THREE.MeshStandardNodeMaterial({ map: bandTexture(), transparent: true, alphaTest: 0.05, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
  // (flat panels just off the body's widest line: the van's sides are near flat between the axles)
  const halfW = Math.max(...spec.halfWidth.map((w) => w[1]));
  for (const side of [-1, 1]) g.add(new THREE.Mesh(new THREE.PlaneGeometry(2.85, 0.32).rotateY(side * Math.PI / 2).translate(side * (halfW + 0.012), 0.72, -0.68), bandMat));
  // the wheels: the traffic's, scaled to the van (YXZ: the spin about the axle, then the steer)
  const wheelMat = createLoftedCarMaterial(BODY_SPECS.sedan, 0x30343a);
  wheelMat.userData.shared = true;
  const R = spec.wheelRadius, scale = R / BODY_SPECS.sedan.wheelRadius, wheels = [];
  for (const side of [-1, 1]) {
    const geo = buildSteerableWheelGeo(BODY_SPECS.sedan, side);
    for (const z of [spec.wheelZ, -spec.wheelZ]) {
      const w = new THREE.Mesh(geo, wheelMat);
      w.scale.setScalar(scale);
      w.rotation.order = 'YXZ';
      w.position.set(side * spec.wheelX, R, z);
      w.castShadow = true;
      g.add(w);
      wheels.push({ mesh: w, r: R, front: z > 0 });
    }
  }
  return {
    group: g, wheels,
    // (the T3's tuning with the longer wheelbase and a little less punch: a loaded delivery van)
    drive: { speed: 30, reverseSpeed: 9, acceleration: 4.4, powerSpeed: 13, rolling: 0.18, drag: 0.0012, coast: 0.6, brake: 9.5, wheelbase: 2 * spec.wheelZ, grip: 9.5, cornering: 10 },
    dims: { halfW: 0.96, halfL: 2.45, top: 2.0, mass: 2400 }, chase: [7.8, 2.1], label: 'Post van',
    // (the player car's brake, indicator and reverse lights on the body)
    pose(group, car) {
      const s = car.carState?.value, lit = bodyMat.userData.carState?.value;
      if (s && lit) lit.copy(s);
    }
  };
}
VEHICLES.postVan = buildPostVan;

// =====================================================================================================================
// The post boxes
/** The plate on the door: "Leerung" and the box's collection times (the boxes' own language: German) */
function plateTexture(times) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f7f2'; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#16181b'; x.lineWidth = 6; x.strokeRect(3, 3, 250, 122);
  x.fillStyle = '#16181b'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '800 30px system-ui, sans-serif'; x.fillText('Leerung', 128, 32);
  const lines = times.split(' · ');
  lines.forEach((l, i) => { x.font = `700 ${lines.length > 1 ? 28 : 34}px system-ui, sans-serif`; x.fillText(l, 128, lines.length > 1 ? 70 + i * 32 : 84); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A post horn (a simplified one: the coiled tube, the bell, the mouthpiece) in the x-y plane, facing +z */
function hornGeometry(hex) {
  return mergeGeometries([
    painted(new THREE.TorusGeometry(0.06, 0.011, 6, 24, Math.PI * 1.6), hex).rotateZ(0.5),
    painted(new THREE.ConeGeometry(0.035, 0.07, 12, 1, true), hex).rotateZ(Math.PI / 2).translate(-0.085, 0.03, 0),
    painted(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 6), hex).rotateZ(Math.PI / 2).translate(0.07, -0.045, 0)
  ].map((p) => (p.index ? p.toNonIndexed() : p)));
}

// The box's measures: the pillar to 0.95 m, the body 0.44 wide, 0.56 high, 0.30 deep, the half-round roof on it
const BOX = { w: 0.44, h: 0.56, d: 0.3, foot: 0.95 };
function buildBoxStatic() {
  const { w, h, d, foot } = BOX, top = foot + h;
  const yellow = POST_YELLOW, grey = 0x70757a, dark = 0x1b1d20;
  const parts = [
    painted(new THREE.CylinderGeometry(0.045, 0.05, foot, 10), grey).translate(0, foot / 2, -0.02), // the pillar
    boxAt(0.18, 0.03, 0.18, grey, 0, 0.015, -0.02), // its foot plate
    boxAt(w, h, d, yellow, 0, foot + h / 2, 0), // the body
    painted(new THREE.CylinderGeometry(d / 2, d / 2, w, 16, 1, false, 0, Math.PI), yellow).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(0, top, 0), // the round roof
    boxAt(w + 0.02, 0.025, d + 0.02, 0xe0b400, 0, top - 0.01, 0), // the roof's edge
    boxAt(0.3, 0.05, 0.03, 0xe0b400, 0, top - 0.08, d / 2 + 0.02), // the slot's hood
    boxAt(0.26, 0.022, 0.012, dark, 0, top - 0.115, d / 2 + 0.006), // the slot
    boxAt(w - 0.02, 0.012, 0.012, 0xe0b400, 0, foot + 0.33, d / 2 + 0.006) // the door's top seam
  ];
  // the post horn on both sides
  for (const s of [-1, 1]) parts.push(hornGeometry(dark).rotateY(s * Math.PI / 2).translate(s * (w / 2 + 0.004), foot + 0.34, 0));
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  return g;
}

const postRound = {
  setup(run) {
    const cm = run.hooks.controllerManager;
    const staticGeo = buildBoxStatic();
    const staticMat = vertexMat();
    const doorGeo = mergeGeometries([boxAt(BOX.w - 0.03, 0.3, 0.018, POST_YELLOW, (BOX.w - 0.03) / 2, 0, 0.009), boxAt(0.02, 0.06, 0.02, 0x1b1d20, BOX.w - 0.07, 0.02, 0.025)].map((p) => (p.index ? p.toNonIndexed() : p)));
    const plateGeo = new THREE.PlaneGeometry(0.3, 0.15).translate((BOX.w - 0.03) / 2, -0.04, 0.0195);
    const boxes = run.def.createState().boxes.map((b) => {
      const y = cm.getGroundHeight(b.x, b.z, 'person');
      const root = new THREE.Group();
      root.name = `PostBox ${b.where}`;
      root.position.set(b.x, y, b.z);
      root.rotation.y = b.yaw;
      const body = new THREE.Mesh(staticGeo, staticMat);
      body.castShadow = true;
      root.add(body);
      // the door on its hinge at the left edge, the plate on it
      const door = new THREE.Group();
      door.position.set(-(BOX.w - 0.03) / 2, BOX.foot + 0.16, BOX.d / 2);
      const panel = new THREE.Mesh(doorGeo, staticMat);
      panel.castShadow = true;
      const plate = new THREE.Mesh(plateGeo, new THREE.MeshStandardNodeMaterial({ map: plateTexture(b.times), roughness: 0.5 }));
      door.add(panel, plate);
      root.add(door);
      run.group.add(root);
      return { root, door, y, open: 0 };
    });
    // the postman: steps up to the box being emptied
    const postman = createHelper();
    postman.visible = false;
    run.group.add(postman);
    run.work = { boxes, postman, toast: createToast(run), keyHold: false, touchHold: false, spawnAcc: 0, linger: 0, last: null };
    holdButton(run, 'Empty', { icon: 'i-hand', when: () => postRound.canHold(run) });
    run.listen(window, 'keyup', (e) => { if (e.code === 'Space' || e.code === 'KeyE') run.work.keyHold = false; }, { capture: true });
    run.listen(window, 'blur', () => { run.work.keyHold = false; run.work.touchHold = false; });
  },
  /** The hold applies: the van stands by a box not yet emptied */
  canHold(run) { const st = run.state; return !!(st?.near && st.still && (run.phase === 'ready' || run.phase === 'running')); },
  key(run, e) {
    if (e.code !== 'Space' && e.code !== 'KeyE') return;
    if (run.phase === 'intro' || !postRound.canHold(run)) return; // (Space stays the handbrake elsewhere)
    e.preventDefault();
    e.stopImmediatePropagation();
    run.work.keyHold = true;
  },
  reset(run) {
    const w = run.work;
    for (const b of w.boxes) { b.open = 0; b.door.rotation.y = 0; }
    w.postman.visible = false;
    w.keyHold = w.touchHold = false;
    w.linger = 0; w.last = null;
    w.toast.hide();
  },
  update(run, ctx, dt, cm) {
    const w = run.work, st = run.state, car = cm.entities.car;
    const live = run.phase === 'ready' || run.phase === 'running';
    let ev = null;
    if (live && ctx.mode === 'car') ev = stepPost(st, { x: car.position.x, z: car.position.z, speed: car.speed || 0 }, w.keyHold || w.touchHold, dt);
    else { st.near = null; st.emptying = null; }
    if (!st.near) w.keyHold = false;
    const e = st.emptying;
    if (e) { w.last = e; w.linger = 0.9; } else w.linger = Math.max(0, w.linger - dt);
    // the doors: the one being emptied swings open, the others close again
    st.boxes.forEach((b, i) => {
      const r = w.boxes[i], target = b === w.last && w.linger > 0 ? 1 : 0;
      r.open += (target - r.open) * Math.min(1, dt * 6);
      r.door.rotation.y = -1.9 * r.open;
    });
    // the postman in front of the box, the letters flying to the van
    const b = w.last && w.linger > 0 ? w.last : null;
    w.postman.visible = !!b;
    if (b) {
      const r = w.boxes[b.i], fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      w.postman.position.set(b.x + fx * 0.65, r.y, b.z + fz * 0.65);
      w.postman.rotation.y = b.yaw + Math.PI;
      const arm = w.postman.userData.wave;
      if (arm) arm.rotation.z = e ? -1.2 + 0.25 * Math.sin(performance.now() / 120) : -0.5;
      if (e) {
        w.spawnAcc += dt * (8 + b.letters / 12);
        const pb = particles(run);
        while (w.spawnAcc >= 1) {
          w.spawnAcc--;
          const a = { x: b.x + fx * 0.3 + (Math.random() - 0.5) * 0.2, y: r.y + BOX.foot + 0.15, z: b.z + fz * 0.3 + (Math.random() - 0.5) * 0.2 };
          const c = { x: car.position.x + (Math.random() - 0.5) * 0.6, y: car.position.y + 1.1, z: car.position.z + (Math.random() - 0.5) * 0.6 };
          lump(pb, a, c, 0.55 + Math.random() * 0.2, { size: 0.07, grow: 0.02, r: 1, g: 0.99, bl: 0.94, alpha: 1 });
        }
      }
    }
    if (ev === 'emptied') { w.toast.show(`Emptied ${st.emptied}/${st.boxes.length}`, '#ffd84a', 1.3); }
    w.toast.update(dt);
  }
};

export const POST_FEATURES = { postRound };
