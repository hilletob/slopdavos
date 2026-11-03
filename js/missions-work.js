import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight, surfaceHeight } from './terrain.js';
import { ParticleBatch } from './missions-fx.js';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { BODY_SPECS, buildCarGeometry, createLoftedCarMaterial } from './actor-models.js';
import { TLM_TREES } from './tlm-trees-data.js';
import {
  MASK_BLOCKED, MASK_TARGET,
  SHOVEL, createShovelGrid, createShovel, stepShovel, shovelCleared,
  BLOWER, BLOWER_CARS, createBlowerRoute, createBlowerGrid, stepBlower, blowerCleared, blowerHitsCar, chuteLanding, routePoint, projectRoute, augerTake,
  MOWER, createLawnGrid, stepMower, lawnMown,
  GARBAGE, stepGarbage,
  ROSES, createRoseBushes, nearestBush, stepPicking,
  MUSHROOMS, createMushrooms, nearestMushroom
} from './missions-data-work.js';

// js/missions-work.js
// The runtime of the six work missions (js/missions-data-work.js has their definitions and the pure logic; js/missions.js
// takes WORK_FEATURES into its FEATURES):
//   shovel        — the snow map over the path of Dischmastrasse 19 as a mesh (one vertex a 25 cm cell, the snow's depth
//                   its height, cleared cells the gravel's colour; the heaps in the margin grow), the snow pusher in front
//                   of the walking pedestrian, the throws as a few lumps of snow in an arc (js/missions-fx.js particles).
//   workVehicle   — the player's car (js/controllers.js `car`, its physics) wears the mission's vehicle: the snow
//                   blower, the ride-on mower or the refuse truck (simple models of boxes and cylinders), with its own
//                   handling (car.drive), size (car.dims) and chase camera; the VW T3 hidden meanwhile, all of it given
//                   back at the end (as the patrol car of js/missions.js policeCar).
//   snowBlower    — the Bündastrasse's snow map (along the road), the auger turning, the chute's arc of snow, three
//                   parked cars with snow on their roofs (the traffic's sedan, instanced).
//   mower         — the lawn's map (the height and colour of the grass, the stripes of the cut), a tuft of grass a cell
//                   that the deck cuts down, the two flower beds; the driver on the seat (a PersonRig riding).
//   garbageRound  — the bins and bags at the ten collection points, loaded into the hopper while the truck stands.
//   alpineRoses   — the rhododendron bushes (one instanced mesh), the flowers of those in bloom (another), the
//                   reserve's posts, rope and signs.
//   mushrooms     — the mushrooms in the forest (four instanced meshes, only those within ~32 m drawn).
// Everything is built for the run and goes with its group (js/missions.js disposes it); the maps are plain arrays.

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; else if (a < -Math.PI) a += Math.PI * 2; return a; };
const hash = (i) => { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const mat = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.75, ...o });

// --- Shared: the hold key (Space / E, the touch button), a toast ---------------------------------------------------------
export function holdButton(run, label) {
  const b = el('button', 'panel mission-fire', label);
  b.type = 'button';
  const on = (v) => (e) => { e.preventDefault(); run.work.touchHold = v; };
  run.listen(b, 'pointerdown', on(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) run.listen(b, ev, on(false));
  document.body.append(b);
  run.cleanups.push(() => b.remove());
  return b;
}
/** Space or E held (taken from the controllers: no jump), the keyup and a lost focus let go */
function bindHold(run) {
  run.listen(window, 'keyup', (e) => { if (e.code === 'Space' || e.code === 'KeyE') run.work.keyHold = false; }, { capture: true });
  run.listen(window, 'blur', () => { run.work.keyHold = false; run.work.touchHold = false; });
}
function holdKey(run, e) {
  if (e.code !== 'Space' && e.code !== 'KeyE') return false;
  if (run.phase === 'intro') return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  run.work.keyHold = true;
  return true;
}
const holding = (run) => !!(run.work.keyHold || run.work.touchHold);

export function createToast(run) {
  const t = el('div');
  Object.assign(t.style, {
    position: 'fixed', left: '50%', top: '36%', transform: 'translate(-50%, -50%)', zIndex: 14, pointerEvents: 'none',
    font: '800 24px/1.15 system-ui, sans-serif', color: '#fff', textAlign: 'center', textShadow: '0 2px 6px rgba(0,0,0,0.75)', opacity: '0', transition: 'opacity 0.25s'
  });
  document.body.append(t);
  run.cleanups.push(() => t.remove());
  let left = 0;
  return {
    show(text, colour = '#fff', seconds = 1.4) { t.textContent = text; t.style.color = colour; t.style.opacity = '1'; left = seconds; },
    update(dt) { if (left > 0 && (left -= dt) <= 0) t.style.opacity = '0'; },
    hide() { left = 0; t.style.opacity = '0'; }
  };
}

/** The particle batch of the run (the throws, the chute, the clippings); torn down with it */
export function particles(run) {
  if (run.workParticles) return run.workParticles;
  const p = run.workParticles = new ParticleBatch(run.scene);
  run.storage(p.mesh);
  run.cleanups.push(() => { p.dispose(); run.workParticles = null; });
  return p;
}
/** A lump flying from (a) to (b) in `T` s (ballistic) */
export function lump(pb, a, b, T, { size = 0.35, grow = 0.6, r = 0.93, g = 0.95, bl = 1, alpha = 0.95 } = {}) {
  pb.spawn({ x: a.x, y: a.y, z: a.z, vx: (b.x - a.x) / T, vy: (b.y - a.y) / T + 0.5 * 9.81 * T, vz: (b.z - a.z) / T, gravity: 9.81, life: T + 0.15, size0: size, size1: size + grow, alpha, r, g, b: bl, kind: 'lump' });
}

// --- A work map as a mesh: one vertex a cell, its height and colour from the cell's value ----------------------------------
class GridMesh {
  /**
   * grid: js/missions-data-work.js createGrid; toWorld(u, v) -> { x, z } (grid metres); base(x, z): the ground under it;
   * height(h, k): m over the ground; colour(h, k, out: THREE.Color)
   */
  constructor(grid, { toWorld, base, height, colour, lift = 0.02, roughness = 0.9, name = 'WorkMap' }) {
    this.grid = grid; this.height = height; this.colour = colour;
    const { cols, rows, cell } = grid, n = cols * rows;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    this.base = new Float32Array(n);
    this.edge = new Uint8Array(n);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i, w = toWorld((i + 0.5) * cell, (j + 0.5) * cell);
      pos[k * 3] = w.x; pos[k * 3 + 2] = w.z;
      this.base[k] = base(w.x, w.z) + lift;
      this.edge[k] = i === 0 || j === 0 || i === cols - 1 || j === rows - 1 ? 1 : 0;
    }
    // (the winding so that the faces look up, whichever way the frame turns)
    const a = toWorld(1.5 * cell, 0.5 * cell), o = toWorld(0.5 * cell, 0.5 * cell), b = toWorld(0.5 * cell, 1.5 * cell);
    const up = (b.z - o.z) * (a.x - o.x) - (b.x - o.x) * (a.z - o.z) > 0;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)((cols - 1) * (rows - 1) * 6);
    let q = 0;
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const k = j * cols + i;
      if (up) idx.set([k, k + cols, k + 1, k + 1, k + cols, k + cols + 1], q);
      else idx.set([k, k + 1, k + cols, k + 1, k + cols + 1, k + cols], q);
      q += 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness }));
    this.mesh.name = name;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.normalT = 0;
    this.refresh();
  }
  refresh() { this.grid.dirty = null; this.range(0, this.grid.cols - 1, 0, this.grid.rows - 1); this.mesh.geometry.computeVertexNormals(); this.normalsDirty = false; }
  range(i0, i1, j0, j1) {
    const g = this.grid, geo = this.mesh.geometry, pos = geo.attributes.position.array, col = geo.attributes.color.array;
    // (one cell round the range: the neighbours' normals change too)
    for (let j = Math.max(0, j0); j <= Math.min(g.rows - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(g.cols - 1, i1); i++) {
      const k = j * g.cols + i, h = g.h[k];
      pos[k * 3 + 1] = this.base[k] + (this.edge[k] ? 0 : this.height(h, k));
      this.colour(h, k, _c);
      col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.normalsDirty = true;
  }
  /** Takes the grid's changes (call every frame); the normals at most ten times a second */
  update(dt) {
    const d = this.grid.dirty;
    if (d) { this.grid.dirty = null; this.range(d.i0 - 1, d.i1 + 1, d.j0 - 1, d.j1 + 1); }
    this.normalT += dt;
    if (this.normalsDirty && this.normalT > 0.1) { this.normalT = 0; this.normalsDirty = false; this.mesh.geometry.computeVertexNormals(); }
  }
}

/** Copies a fresh grid's values into the run's (a restart) */
function resetGrid(g, fresh) {
  g.h.set(fresh.h); g.mask.set(fresh.mask); g.dir.set(fresh.dir);
  g.dirty = { i0: 0, i1: g.cols - 1, j0: 0, j1: g.rows - 1 };
}

const SNOW = new THREE.Color(0.93, 0.94, 0.97), GRAVEL = new THREE.Color(0.27, 0.26, 0.25), ASPHALT = new THREE.Color(0.13, 0.135, 0.145);

// =====================================================================================================================
// 1. The snow shovel
function buildPusher() {
  const g = new THREE.Group();
  g.name = 'SnowPusher';
  const blade = new THREE.Mesh(new THREE.BoxGeometry(SHOVEL.bladeHalfW * 2, 0.32, 0.03).translate(0, 0.16, 0), mat(0xd23a1e, { roughness: 0.5 }));
  blade.rotation.x = -0.25;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 6).translate(0, 0.5, 0), mat(0x8a6236));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6).rotateZ(Math.PI / 2), mat(0x222222));
  const load = new THREE.Mesh(new THREE.BoxGeometry(SHOVEL.bladeHalfW * 1.9, 0.22, 0.32).translate(0, 0.11, 0.16), mat(0xeef2f8, { roughness: 0.95 }));
  g.add(blade, shaft, grip, load);
  for (const m of [blade, shaft, load]) m.castShadow = true;
  return { group: g, blade, shaft, grip, load };
}

const shovel = {
  setup(run) {
    const S = SHOVEL;
    const grid = createShovelGrid();
    const mesh = new GridMesh(grid, {
      toWorld: (u, v) => S.frame.toWorld(u, v), base: (x, z) => surfaceHeight(x, z), name: 'ShovelSnow',
      height: (h) => Math.max(0, h),
      colour: (h, k, out) => (grid.mask[k] === MASK_TARGET && h < 0.06 ? out.copy(GRAVEL).lerp(SNOW, clamp(h / 0.06, 0, 1)) : out.copy(SNOW)).multiplyScalar(0.94 + 0.06 * hash(k))
    });
    run.group.add(mesh.mesh);
    const pusher = buildPusher();
    run.group.add(pusher.group);
    run.work = { grid, mesh, pusher, sh: createShovel(), keyHold: false, touchHold: false, toast: createToast(run), g: {}, f: {} };
    bindHold(run);
    holdButton(run, 'Shovel');
  },
  reset(run) {
    const w = run.work;
    resetGrid(w.grid, createShovelGrid());
    w.mesh.refresh();
    w.sh = createShovel();
    w.keyHold = w.touchHold = false;
    w.toast.hide();
  },
  key(run, e) { holdKey(run, e); },
  update(run, ctx, dt, cm) {
    const w = run.work, st = run.state, p = cm.entities.person;
    const live = run.phase === 'ready' || run.phase === 'running';
    if (ctx.mode === 'person' && live) {
      const g = SHOVEL.frame.toGrid(p.position.x, p.position.z, w.g), f = SHOVEL.frame.dirToGrid(Math.sin(p.heading), Math.cos(p.heading), w.f);
      const ev = stepShovel(w.sh, w.grid, g, f, Math.abs(p.speed || 0), holding(run), dt);
      if (ev === 'throw') shovel.throwFx(run, p);
    } else stepShovel(w.sh, w.grid, { u: -99, v: -99 }, { u: 1, v: 0 }, 0, false, dt);
    if (st) { st.cleared = shovelCleared(w.grid); st.load = w.sh.load; st.throws = w.sh.throws; }
    w.mesh.update(dt);
    w.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
    shovel.posePusher(run, p, dt, ctx.mode === 'person');
  },
  throwFx(run, p) {
    const w = run.work, to = SHOVEL.frame.toWorld(w.sh.throwTo.u, w.sh.throwTo.v);
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const a = { x: p.position.x + fx * 0.6, y: p.position.y + 0.9, z: p.position.z + fz * 0.6 };
    const pb = particles(run);
    for (let i = 0; i < 9; i++) {
      const b = { x: to.x + (hash(i + w.sh.throws * 9) - 0.5) * 0.9, y: surfaceHeight(to.x, to.z) + 0.5, z: to.z + (hash(i * 3.1 + w.sh.throws) - 0.5) * 0.9 };
      lump(pb, a, b, 0.42 + i * 0.012, { size: 0.28, grow: 0.25 });
    }
    w.throwSide = Math.sign((to.x - p.position.x) * Math.cos(p.heading) - (to.z - p.position.z) * Math.sin(p.heading)) || 1;
  },
  /** The pusher in front of the pedestrian: its blade on the ground, the shaft up to the hands; swung up and to the side in a throw */
  posePusher(run, p, dt, visible) {
    const w = run.work, P = w.pusher;
    P.group.visible = visible;
    if (!visible) return;
    const h = p.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const k = w.sh.throwT > 0 ? Math.sin(Math.PI * (1 - w.sh.throwT / SHOVEL.throwS)) : 0;
    const side = (w.throwSide || 1) * k;
    const bx = p.position.x + fx * (SHOVEL.bladeAhead - 0.1) + lx * side * 0.6, bz = p.position.z + fz * (SHOVEL.bladeAhead - 0.1) + lz * side * 0.6;
    const by = Math.max(surfaceHeight(bx, bz), p.position.y - 0.2) + k * 0.9;
    const hx = p.position.x + fx * 0.28, hz = p.position.z + fz * 0.28, hy = p.position.y + 1.0 + k * 0.25;
    P.group.position.set(bx, by, bz);
    P.group.rotation.set(0, h, 0);
    P.group.updateMatrixWorld(true);
    // the shaft from the blade's back to the hands, the grip across its top (in the group's frame)
    _p.set(hx, hy, hz); P.group.worldToLocal(_p);
    const len = _p.length();
    P.shaft.scale.set(1, len, 1);
    P.shaft.quaternion.setFromUnitVectors(UP, _s.copy(_p).normalize());
    P.grip.position.copy(_p);
    P.blade.rotation.set(-0.25 - k * 0.9, 0, side * 0.6);
    P.load.scale.set(1, Math.max(0.01, w.sh.throwT > 0 ? (1 - k) * 0.5 : w.sh.load / SHOVEL.capacity), 1);
    P.load.rotation.copy(P.blade.rotation);
  }
};

// =====================================================================================================================
// 2.-4. The work vehicles on the player's car
function wheel(r, w, colour = 0x1d1e20) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), mat(colour, { roughness: 0.9 }));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 10).rotateZ(Math.PI / 2), mat(0xb8b8b0, { roughness: 0.4, metalness: 0.5 }));
  tyre.castShadow = true;
  g.add(tyre, hub);
  return g;
}
const box = (w, h, l, colour, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat(colour, o)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
const glassMat = () => mat(0x223040, { roughness: 0.15, metalness: 0.3 });
const glass = (w, h, l, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), glassMat()); m.position.set(x, y, z); return m; };

/** The rotary snow blower: a short four-wheeled carrier, the cab, the auger housing in front, the chute on top */
function buildBlowerModel() {
  const g = new THREE.Group();
  g.name = 'SnowBlower';
  const orange = 0xf07d1a, dark = 0x2a2b2e;
  g.add(box(2.1, 0.9, 3.2, orange, 0, 1.0, -0.3));
  const cab = box(1.6, 1.25, 1.5, orange, 0, 2.05, -0.75);
  g.add(cab);
  for (const [w, h, l, x, y, z] of [[1.5, 0.75, 0.04, 0, 2.2, 0.01], [0.04, 0.7, 1.2, 0.81, 2.2, -0.75], [0.04, 0.7, 1.2, -0.81, 2.2, -0.75]]) g.add(glass(w, h, l, x, y, z));
  g.add(box(0.5, 0.12, 0.3, 0xffb300, 0, 2.75, -0.75, { emissive: 0xff8f00, emissiveIntensity: 0.6 })); // the beacon
  // the auger housing: a half drum across the front
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, BLOWER.workHalf * 2, 20, 1, true, Math.PI, Math.PI).rotateZ(Math.PI / 2), mat(orange, { side: THREE.DoubleSide }));
  housing.position.set(0, 0.62, BLOWER.ahead);
  g.add(housing);
  g.add(box(BLOWER.workHalf * 2, 0.08, 0.5, dark, 0, 0.04, BLOWER.ahead + 0.15));
  const auger = new THREE.Group();
  auger.position.set(0, 0.55, BLOWER.ahead + 0.05);
  for (let i = 0; i < 6; i++) {
    const flight = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 4, 12, Math.PI).rotateY(Math.PI / 2), mat(0x9aa0a6, { metalness: 0.6, roughness: 0.4 }));
    flight.position.x = -BLOWER.workHalf + 0.25 + i * ((BLOWER.workHalf * 2 - 0.5) / 5);
    flight.rotation.x = i * 0.9;
    auger.add(flight);
  }
  auger.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, BLOWER.workHalf * 2 - 0.1, 8).rotateZ(Math.PI / 2), mat(0x6b7075, { metalness: 0.5 })));
  g.add(auger);
  // the chute: a tube up from the housing, its deflector turned to the throwing side
  const chute = new THREE.Group();
  chute.position.set(0, 1.1, BLOWER.ahead - 0.35);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.4, 12).translate(0, 0.7, 0), mat(orange));
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.7, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(0.3, 1.45, 0), mat(dark, { side: THREE.DoubleSide }));
  chute.add(tube, hood);
  g.add(chute);
  const wheels = [];
  for (const [x, z] of [[1.05, 0.75], [-1.05, 0.75], [1.05, -1.35], [-1.05, -1.35]]) { const w = wheel(0.52, 0.42); w.position.set(x, 0.52, z); g.add(w); wheels.push({ mesh: w, r: 0.52, front: z > 0 }); }
  return {
    group: g, wheels, auger, chute,
    drive: { speed: 6.5, reverseSpeed: 2.6, acceleration: 1.7, powerSpeed: 0, rolling: 0.45, drag: 0, coast: 1.4, brake: 5, wheelbase: 1.9, grip: 6.5, cornering: 5.5 },
    dims: { halfW: 1.25, halfL: 2.65, top: 2.9, mass: 4800 }, chase: [9.5, 3.6], label: 'Snow blower'
  };
}

/** The ride-on mower: a low body, the seat, the steering wheel, the cutting deck under its middle */
function buildMowerModel() {
  const g = new THREE.Group();
  g.name = 'RideOnMower';
  const red = 0xc0392b;
  g.add(box(0.95, 0.32, 1.7, red, 0, 0.5, 0.05));
  g.add(box(0.9, 0.36, 0.6, red, 0, 0.62, 0.58, { roughness: 0.5 })); // the bonnet
  g.add(box(1.25, 0.12, 0.95, 0x3a3d40, 0, 0.18, MOWER.deckAhead)); // the deck
  g.add(box(0.5, 0.1, 0.45, 0x1c1c1c, 0, 0.72, -0.35)); // the seat
  g.add(box(0.5, 0.42, 0.08, 0x1c1c1c, 0, 0.93, -0.58));
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6).translate(0, 0.25, 0), mat(0x222222));
  column.position.set(0, 0.72, 0.28); column.rotation.x = -0.45;
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 6, 16).rotateX(Math.PI / 2 - 0.45), mat(0x222222));
  sw.position.set(0, 1.16, 0.08);
  g.add(column, sw);
  g.add(box(0.12, 0.12, 0.3, 0x2f6b2f, 0.68, 0.24, -0.05)); // the side discharge
  const wheels = [];
  for (const [x, z, r, w] of [[0.48, -0.5, 0.3, 0.22], [-0.48, -0.5, 0.3, 0.22], [0.42, 0.62, 0.2, 0.14], [-0.42, 0.62, 0.2, 0.14]]) { const wh = wheel(r, w, 0x262626); wh.position.set(x, r, z); g.add(wh); wheels.push({ mesh: wh, r, front: z > 0 }); }
  return {
    group: g, wheels,
    drive: { speed: 2.7, reverseSpeed: 1.4, acceleration: 1.8, powerSpeed: 0, rolling: 0.6, drag: 0, coast: 2.2, brake: 5, wheelbase: 1.15, grip: 5, cornering: 5 },
    dims: { halfW: 0.62, halfL: 1.0, top: 1.4, mass: 380 }, chase: [5.2, 2.2], label: 'Ride-on mower',
    seat: { seat: new THREE.Vector3(0, 0.74, -0.33), bars: new THREE.Vector3(0, 1.16, 0.06), gripHalf: 0.15, bracket: new THREE.Vector3(0, 0.38, 0.42), crankLength: 0, pedalHalf: 0.17, lean: 0.06 }
  };
}

/** The refuse truck: the cab, the body, the hopper at the back with its packer plate */
function buildGarbageModel() {
  const g = new THREE.Group();
  g.name = 'RefuseTruck';
  const white = 0xf2f2ee, green = 0x56702e, dark = 0x2a2b2e;
  g.add(box(2.4, 0.45, 8.2, dark, 0, 0.95, 0)); // the chassis
  g.add(box(2.45, 2.25, 2.0, white, 0, 2.15, 3.05)); // the cab
  g.add(glass(2.2, 0.95, 0.05, 0, 2.65, 4.07));
  for (const x of [1.23, -1.23]) g.add(glass(0.05, 0.85, 1.3, x, 2.65, 3.3));
  g.add(box(2.5, 0.16, 2.02, 0xf07d1a, 0, 1.45, 3.05)); // the cab's orange band
  g.add(box(0.6, 0.12, 0.25, 0xffb300, 0, 3.33, 2.6, { emissive: 0xff8f00, emissiveIntensity: 0.6 }));
  g.add(box(2.5, 2.7, 4.9, green, 0, 2.55, -0.2)); // the body
  for (const x of [1.26, -1.26]) g.add(box(0.03, 0.28, 4.9, 0xf07d1a, x, 1.6, -0.2));
  // the hopper: a tail gate leaning back, the packer plate inside swinging down through the loading sill
  const gate = new THREE.Group();
  gate.position.set(0, 1.3, -2.65);
  gate.add(box(2.5, 2.4, 1.3, green, 0, 1.1, -0.55));
  gate.add(box(2.3, 0.35, 0.5, dark, 0, -0.05, -1.05)); // the loading sill
  const packer = new THREE.Group();
  packer.position.set(0, 1.6, -0.8);
  packer.add(box(2.1, 1.3, 0.08, 0x8c9298, 0, -0.65, 0, { metalness: 0.5, roughness: 0.4 }));
  gate.add(packer);
  g.add(gate);
  g.add(box(0.5, 0.06, 0.3, 0x9a9a9a, 0.85, 0.55, -4.25), box(0.5, 0.06, 0.3, 0x9a9a9a, -0.85, 0.55, -4.25)); // the crew's steps
  const wheels = [];
  for (const [x, z] of [[1.08, 2.7], [-1.08, 2.7], [1.08, -1.45], [-1.08, -1.45], [1.08, -2.65], [-1.08, -2.65]]) { const w = wheel(0.52, 0.38); w.position.set(x, 0.52, z); g.add(w); wheels.push({ mesh: w, r: 0.52, front: z > 0 }); }
  return {
    group: g, wheels, packer,
    drive: { speed: 12.5, reverseSpeed: 3.2, acceleration: 1.5, powerSpeed: 6, rolling: 0.25, drag: 0.0009, coast: 0.5, brake: 6, wheelbase: 4.15, grip: 6.5, cornering: 4.6 },
    dims: { halfW: 1.25, halfL: 4.35, top: 3.4, mass: 17000 }, chase: [14, 4.6], label: 'Refuse truck'
  };
}

export const VEHICLES = { blower: buildBlowerModel, mower: buildMowerModel, garbage: buildGarbageModel }; // (js/missions-rural.js adds its own)

const workVehicle = {
  setup(run) {
    const cm = run.hooks.controllerManager, car = cm.entities.car;
    const v = run.vehicle = VEHICLES[run.def.vehicle]();
    run.group.add(v.group);
    const saved = { visible: car.mesh.visible, drive: car.drive, dims: car.dims, chaseDistance: car.chaseDistance, chaseHeight: car.chaseHeight, label: car.label };
    Object.assign(car, { drive: v.drive, dims: v.dims, chaseDistance: v.chase[0], chaseHeight: v.chase[1], label: v.label });
    car.mesh.visible = false;
    run.cleanups.push(() => {
      Object.assign(car, { drive: saved.drive, dims: saved.dims, chaseDistance: saved.chaseDistance, chaseHeight: saved.chaseHeight, label: saved.label });
      car.mesh.visible = saved.visible;
    });
    if (v.seat) {
      // the driver on the open seat (the mower)
      const crowd = new PersonCrowd(1, { farDistance: 1e9 });
      for (const m of crowd.meshes) run.group.add(m);
      v.driver = { crowd, rig: new PersonRig({ seed: 0.2718, girth: 1.05, hair: 0.3 }) };
    }
  },
  reset(run) {
    const car = run.hooks.controllerManager.entities.car;
    car.speed = 0; car.vx = 0; car.vz = 0; car.angularVel = 0;
    car.mesh.visible = false;
    workVehicle.follow(run, 0, run.hooks.controllerManager);
  },
  after(run, ctx, dt, cm) { workVehicle.follow(run, dt, cm); },
  follow(run, dt, cm) {
    const car = cm.entities.car, v = run.vehicle, g = v.group;
    car.mesh.visible = false;
    g.position.copy(car.position);
    if (car.chassisPivot) g.position.y += car.chassisPivot.position.y;
    // (the pitch and the roll of the car's sprung chassis, js/controllers.js; the slope from the mesh's own tilt)
    g.rotation.set((car.mesh.rotation.x || 0) + (car.chassisPivot?.rotation.x || 0), car.heading, (car.mesh.rotation.z || 0) + (car.chassisPivot?.rotation.z || 0), 'YXZ');
    for (const w of v.wheels) {
      w.mesh.rotation.x += ((car.speed || 0) * dt) / w.r;
      if (w.front) w.mesh.rotation.y = car.steerAngle || 0;
    }
    v.pose?.(g, car, dt); // (a vehicle's own body motion over the physics: the quad of js/missions-rural.js)
    g.updateMatrixWorld(true);
    if (v.driver) {
      v.driver.rig.ride(g, 0, v.seat);
      v.driver.crowd.begin();
      v.driver.crowd.add(v.driver.rig, 0);
      v.driver.crowd.end();
    }
  }
};

// --- The snow blower on the Bündastrasse -------------------------------------------------------------------------------
function buildParkedCars(run, route) {
  const spec = BODY_SPECS.sedan;
  const geo = buildCarGeometry(spec, true);
  const n = BLOWER_CARS.length;
  const paint = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  geo.setAttribute('paintColor', paint);
  geo.setAttribute('carState', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
  const material = createLoftedCarMaterial(spec);
  material.userData.shared = true; // (the traffic's cached material: not the run's to dispose)
  const cars = new THREE.InstancedMesh(geo, material, n);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.16, 2.3).translate(0, 0.08, 0), mat(0xeef2f8, { roughness: 0.95 }), n);
  BLOWER_CARS.forEach((c, i) => {
    const p = routePoint(route, c.s, c.d);
    const y = run.hooks.controllerManager.getGroundHeight(p.x, p.z, 'car');
    _q.setFromAxisAngle(UP, p.heading);
    cars.setMatrixAt(i, _m.compose(_p.set(p.x, y, p.z), _q, _s.set(1, 1, 1)));
    caps.setMatrixAt(i, _m.compose(_p.set(p.x, y + (spec.roofY ?? 1.42), p.z), _q, _s.set(1, 1, 1)));
    paint.array.set(c.colour, i * 3);
    c.x = p.x; c.z = p.z; c.heading = p.heading;
  });
  for (const m of [cars, caps]) { m.castShadow = true; m.frustumCulled = false; run.group.add(run.storage(m)); }
  return cars;
}

const snowBlower = {
  setup(run) {
    const route = createBlowerRoute();
    const grid = createBlowerGrid(route);
    const cm = run.hooks.controllerManager;
    const pt = {};
    const mesh = new GridMesh(grid, {
      toWorld: (u, v) => routePoint(route, u, v - BLOWER.half, pt), base: (x, z) => cm.getGroundHeight(x, z, 'car'), name: 'RoadSnow',
      height: (h) => Math.max(0, h),
      colour: (h, k, out) => (h < 0.08 ? out.copy(ASPHALT).lerp(SNOW, clamp(h / 0.08, 0, 1)) : out.copy(SNOW)).multiplyScalar(0.93 + 0.07 * hash(k))
    });
    run.group.add(mesh.mesh);
    buildParkedCars(run, route);
    run.work = { route, grid, mesh, prev: new THREE.Vector3(), lastHit: -1e9, toast: createToast(run), proj: {}, spawnAcc: 0 };
    holdButton(run, 'Chute').addEventListener('pointerdown', () => snowBlower.turnChute(run));
  },
  reset(run) {
    const w = run.work;
    resetGrid(w.grid, createBlowerGrid(w.route));
    w.mesh.refresh();
    w.prev.copy(run.hooks.controllerManager.entities.car.position);
    w.lastHit = -1e9;
    if (run.state) run.state.chute = -1;
    w.toast.hide();
  },
  key(run, e) { if (e.code === 'KeyV' && !e.repeat && run.phase !== 'intro') { e.preventDefault(); snowBlower.turnChute(run); } },
  turnChute(run) { if (run.state) run.state.chute = -(run.state.chute || -1); },
  update(run, ctx, dt, cm) {
    const w = run.work, st = run.state, car = cm.entities.car, v = run.vehicle;
    const live = run.phase === 'ready' || run.phase === 'running';
    const proj = projectRoute(w.route, car.position.x, car.position.z, w.proj);
    const a = wrapPi(car.heading - Math.atan2(proj.tx, proj.tz));
    const p = { s: proj.s, d: proj.d };
    st.burying = false; st.choke = false;
    if (live && ctx.mode === 'car') {
      // the parked cars: hit, the blower is stopped and set back
      for (const c of BLOWER_CARS) {
        if (!blowerHitsCar(p, a, c)) continue;
        car.position.x = w.prev.x; car.position.z = w.prev.z;
        car.speed = Math.min(0, car.speed) * 0.3; car.vx = car.vz = 0;
        const now = performance.now();
        if (now - w.lastHit > 2500 && run.phase === 'running') {
          w.lastHit = now; st.hits++; st.penaltyMs += BLOWER.hitMs;
          w.toast.show(`Parked car hit! +${BLOWER.hitMs / 1000} s`, '#ff8f80', 2);
          run.audio?.thump?.();
        }
      }
      const speed = car.speed || 0;
      const vol = stepBlower(w.grid, p, { u: Math.cos(a), v: Math.sin(a) }, speed);
      if (vol > 0) {
        st.choke = augerTake(speed) < 1;
        const side = st.chute || -1;
        const land = chuteLanding(p, a, side);
        // burying a parked car: the landing spot near one
        for (const c of BLOWER_CARS) if (Math.hypot(land.s - c.s, land.d - c.d) < BLOWER.buryRadius && run.phase === 'running') { st.burying = true; st.buried += dt; st.penaltyMs += dt * BLOWER.buryRate * 1000; }
        snowBlower.chuteFx(run, car, land, vol, dt);
      }
      st.s = p.s;
    }
    w.prev.copy(car.position);
    st.cleared = blowerCleared(w.grid);
    w.mesh.update(dt);
    w.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
    // the auger turns while it eats snow (and idles otherwise); the chute faces its side
    if (v) {
      v.auger.rotation.x += dt * (Math.abs(car.speed) > 0.2 ? 9 : 2.5);
      const target = (st.chute || -1) > 0 ? Math.PI : 0;
      v.chute.rotation.y += (target - v.chute.rotation.y) * Math.min(1, dt * 5);
    }
  },
  chuteFx(run, car, land, vol, dt) {
    const w = run.work, pb = particles(run);
    w.spawnAcc += Math.min(1, vol / Math.max(dt, 1e-3) / 0.6) * 55 * dt;
    if (w.spawnAcc < 1) return;
    const h = car.heading, fx = Math.sin(h), fz = Math.cos(h);
    const o = { x: car.position.x + fx * (BLOWER.ahead - 0.35), y: car.position.y + 2.7, z: car.position.z + fz * (BLOWER.ahead - 0.35) };
    const tgt = routePoint(w.route, land.s, land.d);
    while (w.spawnAcc >= 1) {
      w.spawnAcc--;
      const b = { x: tgt.x + (Math.random() - 0.5) * 3, y: groundHeight(tgt.x, tgt.z) + 0.3, z: tgt.z + (Math.random() - 0.5) * 3 };
      lump(pb, o, b, 0.95 + Math.random() * 0.25, { size: 0.3, grow: 0.9, alpha: 0.85 });
    }
  }
};

// --- The mower in the Kurpark ------------------------------------------------------------------------------------------------
const GRASS_TALL = new THREE.Color(0.06, 0.14, 0.025), STRIPE_A = new THREE.Color(0.2, 0.36, 0.07), STRIPE_B = new THREE.Color(0.08, 0.19, 0.035), SOIL = new THREE.Color(0.28, 0.18, 0.1), MUD = new THREE.Color(0.17, 0.12, 0.08);
const mower = {
  setup(run) {
    const grid = createLawnGrid();
    const F = MOWER.frame;
    const mesh = new GridMesh(grid, {
      toWorld: (u, v) => F.toWorld(u, v), base: (x, z) => surfaceHeight(x, z), name: 'Lawn', lift: 0.03,
      height: (h, k) => (grid.mask[k] === MASK_BLOCKED ? (h > 0 ? 0.07 : 0.03) : 0.015 + h * 0.07),
      colour: (h, k, out) => {
        if (grid.mask[k] === MASK_BLOCKED) return out.copy(h > 0 ? SOIL : MUD);
        if (h > 0) return out.copy(GRASS_TALL).multiplyScalar(0.85 + 0.3 * hash(k));
        // (the stripes: the direction of the last pass, light one way and dark the other)
        return out.copy(grid.dir[k] % 2 ? STRIPE_A : STRIPE_B).multiplyScalar(0.95 + 0.08 * hash(k));
      }
    });
    run.group.add(mesh.mesh);
    // a tuft of tall grass a cell; flowers on the beds
    const tuftGeo = mergeGeometries(Array.from({ length: 7 }, (_, i) => new THREE.PlaneGeometry(0.06, 0.26 - (i % 3) * 0.04).translate(0, 0.13 - (i % 3) * 0.02, 0).rotateX(0.18 * ((i % 2) * 2 - 1)).rotateY(i * 2.3).translate(Math.cos(i * 2.6) * 0.12, 0, Math.sin(i * 2.6) * 0.12)));
    { const pos = tuftGeo.attributes.position; for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.1) { pos.setX(i, pos.getX(i) * 0.98); } } // (a tuft: seven blades leaning out)
    const n = grid.cols * grid.rows;
    const tufts = new THREE.InstancedMesh(tuftGeo, mat(0x3c6a1c, { side: THREE.DoubleSide, roughness: 0.95 }), n);
    const flowerGeo = mergeGeometries([0, 1, 2, 3, 4].map((i) => new THREE.SphereGeometry(0.07, 6, 4).translate(Math.cos(i * 1.3) * 0.13, 0.2 + (i % 2) * 0.06, Math.sin(i * 1.3) * 0.13)));
    const flowers = new THREE.InstancedMesh(flowerGeo, mat(0xffffff, { roughness: 0.6 }), n);
    const palette = [0xd7263d, 0xf4d35e, 0x8e44ad, 0xff7b00, 0xf2f2f2];
    for (let k = 0; k < n; k++) {
      tufts.setColorAt(k, _c.setRGB(0.7 + 0.5 * hash(k + 7), 0.8 + 0.4 * hash(k + 3), 0.6 + 0.4 * hash(k)));
      flowers.setColorAt(k, _c.set(palette[Math.floor(hash(k * 1.7) * palette.length)]));
    }
    for (const m of [tufts, flowers]) { m.frustumCulled = false; m.receiveShadow = true; run.group.add(run.storage(m)); }
    run.work = { grid, mesh, tufts, flowers, g: {}, f: {}, toast: createToast(run), bedT: 0, clipAcc: 0 };
  },
  /** The tufts and flowers of the cells [i0..i1] × [j0..j1]: standing, cut or trodden */
  instances(run, i0, i1, j0, j1) {
    const w = run.work, g = w.grid, F = MOWER.frame;
    for (let j = Math.max(0, j0); j <= Math.min(g.rows - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(g.cols - 1, i1); i++) {
      const k = j * g.cols + i;
      const up = g.h[k] > 0;
      const blocked = g.mask[k] === MASK_BLOCKED;
      if (up) {
        const p = F.toWorld((i + 0.5 + (hash(k) - 0.5) * 0.4) * g.cell, (j + 0.5 + (hash(k + 1) - 0.5) * 0.4) * g.cell);
        _q.setFromAxisAngle(UP, hash(k + 2) * Math.PI);
        _m.compose(_p.set(p.x, surfaceHeight(p.x, p.z) + 0.02, p.z), _q, _s.set(1, 0.8 + 0.5 * hash(k + 5), 1));
      }
      w.tufts.setMatrixAt(k, up && !blocked ? _m : ZERO);
      w.flowers.setMatrixAt(k, up && blocked ? _m : ZERO);
    }
    w.tufts.instanceMatrix.needsUpdate = true;
    w.flowers.instanceMatrix.needsUpdate = true;
  },
  reset(run) {
    const w = run.work;
    resetGrid(w.grid, createLawnGrid());
    mower.instances(run, 0, w.grid.cols - 1, 0, w.grid.rows - 1);
    w.mesh.refresh();
    w.toast.hide();
  },
  update(run, ctx, dt, cm) {
    const w = run.work, st = run.state, car = cm.entities.car;
    const live = run.phase === 'ready' || run.phase === 'running';
    if (live && ctx.mode === 'car') {
      const g = MOWER.frame.toGrid(car.position.x, car.position.z, w.g), f = MOWER.frame.dirToGrid(Math.sin(car.heading), Math.cos(car.heading), w.f);
      const before = st.mown;
      const trodden = stepMower(w.grid, g, f, car.speed || 0);
      if (trodden && run.phase === 'running') {
        st.trodden += trodden; st.penaltyMs += trodden * MOWER.bedMs; w.bedT = 1.5;
        w.toast.show(`Flower bed! +${(trodden * MOWER.bedMs) / 1000} s`, '#ff8f80', 1.2);
      }
      st.mown = lawnMown(w.grid);
      if (st.mown > before) mower.clippings(run, car, dt);
    }
    w.bedT = Math.max(0, w.bedT - dt);
    st.onBed = w.bedT > 0;
    const d = w.grid.dirty;
    if (d) mower.instances(run, d.i0, d.i1, d.j0, d.j1);
    w.mesh.update(dt);
    w.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
  },
  clippings(run, car, dt) {
    const w = run.work;
    w.clipAcc += dt * 30;
    if (w.clipAcc < 1) return;
    const pb = particles(run), h = car.heading, lx = Math.cos(h), lz = -Math.sin(h);
    const o = { x: car.position.x - lx * 0.75, y: car.position.y + 0.25, z: car.position.z - lz * 0.75 };
    while (w.clipAcc >= 1) {
      w.clipAcc--;
      const b = { x: o.x - lx * (1 + Math.random()), y: o.y - 0.2, z: o.z - lz * (1 + Math.random()) };
      lump(pb, o, b, 0.35, { size: 0.08, grow: 0.06, r: 0.35, g: 0.6, bl: 0.18, alpha: 1 });
    }
  }
};

// --- The refuse round ---------------------------------------------------------------------------------------------------------
const garbageRound = {
  setup(run) {
    const stops = run.def.createState().stops;
    const bins = stops.filter((s) => s.kind === 'container');
    const bagCount = stops.reduce((n, s) => n + (s.kind === 'bags' ? s.n : 0), 0);
    const binGeo = mergeGeometries([new THREE.BoxGeometry(1.25, 1.1, 1.0).translate(0, 0.65, 0), new THREE.BoxGeometry(1.32, 0.08, 1.08).translate(0, 1.24, 0)]);
    const binMesh = new THREE.InstancedMesh(binGeo, mat(0x2e7d32, { roughness: 0.6 }), bins.length);
    binMesh.name = 'bins'; // (place(): an emptied bin stays at its place)
    const bagMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6).scale(1, 1.35, 1).translate(0, 0.38, 0), mat(0x8ad0e8, { roughness: 0.4 }), bagCount);
    for (const m of [binMesh, bagMesh]) { m.castShadow = true; m.frustumCulled = false; run.group.add(run.storage(m)); }
    // (each stop's instances and their rest poses)
    let b = 0, k = 0;
    const slots = stops.map((s) => {
      const y = groundHeight(s.x, s.z);
      const rest = [];
      if (s.kind === 'container') rest.push({ mesh: binMesh, index: b++, x: s.x, y, z: s.z, yaw: s.heading });
      else for (let i = 0; i < s.n; i++) rest.push({ mesh: bagMesh, index: k++, x: s.x + Math.cos(i * 2.1) * 0.55, y: groundHeight(s.x, s.z), z: s.z + Math.sin(i * 2.1) * 0.55, yaw: i });
      return rest;
    });
    run.work = { binMesh, bagMesh, slots, toast: createToast(run), pack: 0 };
  },
  reset(run) {
    for (const rest of run.work.slots) for (const r of rest) garbageRound.place(r, 0, null);
    run.work.binMesh.instanceMatrix.needsUpdate = run.work.bagMesh.instanceMatrix.needsUpdate = true;
    run.work.toast.hide();
  },
  /** An instance at rest (k = 0) or on its way into the hopper (k 0-1); gone at k >= 1 for a bag */
  place(r, k, hopper) {
    if (k >= 1 && r.mesh.name !== 'bins') { r.mesh.setMatrixAt(r.index, ZERO); return; }
    let x = r.x, y = r.y, z = r.z, tilt = 0;
    if (hopper && k > 0) {
      const e = k < 0.5 ? k * 2 : 1;
      x += (hopper.x - x) * e; z += (hopper.z - z) * e;
      y += Math.sin(Math.PI * Math.min(1, k * 1.3)) * 1.4 + (hopper.y - y) * e * 0.5;
      tilt = Math.sin(Math.PI * k) * 2.2;
    }
    _q.setFromEuler(new THREE.Euler(tilt, r.yaw, 0, 'YXZ'));
    r.mesh.setMatrixAt(r.index, _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1)));
  },
  update(run, ctx, dt, cm) {
    const w = run.work, st = run.state, car = cm.entities.car, v = run.vehicle;
    const live = run.phase === 'ready' || run.phase === 'running';
    let ev = null;
    if (live && ctx.mode === 'car') ev = stepGarbage(st, { x: car.position.x, z: car.position.z, heading: car.heading, speed: car.speed || 0 }, dt);
    const tail = { x: car.position.x - Math.sin(car.heading) * (GARBAGE.rear + 0.6), y: car.position.y + 1.2, z: car.position.z - Math.cos(car.heading) * (GARBAGE.rear + 0.6) };
    // the bins and bags of the stop being loaded travel into the hopper; a container is tipped and set back
    st.stops.forEach((s, i) => {
      const k = s.done ? 1 : (s.t || 0) / GARBAGE.loadS;
      for (const r of w.slots[i]) {
        if (r.mesh === w.binMesh) garbageRound.place(r, s.done ? 0 : k, k > 0 && !s.done ? tail : null);
        else garbageRound.place(r, k, tail);
      }
    });
    w.binMesh.instanceMatrix.needsUpdate = w.bagMesh.instanceMatrix.needsUpdate = true;
    if (ev === 'loaded') w.toast.show(`Collected ${st.collected}/${st.stops.length}`, '#c8f7a0', 1.2);
    // the packer swings while the crew loads or the truck unloads
    const working = !!st.loading || (st.atKma && st.unloadT > 0 && st.unloadT < GARBAGE.unloadS && run.index === 1);
    w.pack = working ? w.pack + dt * 2.2 : w.pack * Math.max(0, 1 - dt * 3);
    if (v?.packer) v.packer.rotation.x = -0.9 * Math.abs(Math.sin(w.pack));
    w.toast.update(dt);
  }
};

// =====================================================================================================================
// 5. The Alpenrosen
function signTexture(lines) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#1f6b34'; x.fillRect(0, 0, 256, 160);
  x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(8, 8, 240, 144);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach(([t, px], i) => { x.font = `800 ${px}px system-ui, sans-serif`; x.fillText(t, 128, 46 + i * 40); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const alpineRoses = {
  setup(run) {
    const bushes = createRoseBushes();
    const n = bushes.length;
    const bushGeo = new THREE.IcosahedronGeometry(0.55, 1).scale(1, 0.55, 1).translate(0, 0.22, 0);
    const bloomGeo = mergeGeometries(Array.from({ length: 9 }, (_, i) => new THREE.SphereGeometry(0.075, 6, 4).translate(Math.cos(i * 2.4) * 0.32 * Math.sqrt((i + 1) / 9), 0.48 + (i % 3) * 0.03, Math.sin(i * 2.4) * 0.32 * Math.sqrt((i + 1) / 9))));
    const bushMesh = new THREE.InstancedMesh(bushGeo, mat(0x2a4a1c, { roughness: 0.85, flatShading: true }), n);
    const bloomMesh = new THREE.InstancedMesh(bloomGeo, mat(0xd4246a, { roughness: 0.55 }), n);
    bushes.forEach((b, i) => {
      b.y = groundHeight(b.x, b.z);
      bushMesh.setMatrixAt(i, _m.compose(_p.set(b.x, b.y - 0.05, b.z), _q.setFromAxisAngle(UP, i), _s.set(b.size, b.size * (0.8 + 0.4 * hash(i)), b.size)));
      bushMesh.setColorAt(i, _c.setRGB(0.85 + 0.3 * hash(i + 4), 0.85 + 0.3 * hash(i + 9), 0.8 + 0.3 * hash(i)));
    });
    for (const m of [bushMesh, bloomMesh]) { m.castShadow = true; m.frustumCulled = false; run.group.add(run.storage(m)); }
    // the reserve: posts round it, a rope between them, two signs
    const Z = ROSES.zone, posts = Math.round((2 * Math.PI * Z.r) / 4.5);
    const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 6).translate(0, 0.5, 0), mat(0x7a5a3a), posts);
    const ropeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 1).translate(0, 0, 0.5), mat(0xe8e2d0), posts);
    const at = (i) => { const a = (i / posts) * Math.PI * 2, x = Z.x + Math.cos(a) * Z.r, z = Z.z + Math.sin(a) * Z.r; return { x, z, y: groundHeight(x, z) }; };
    for (let i = 0; i < posts; i++) {
      const p = at(i), q = at(i + 1);
      postMesh.setMatrixAt(i, _m.makeTranslation(p.x, p.y - 0.05, p.z));
      const len = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      _m.lookAt(_p.set(q.x, q.y + 0.8, q.z), _s.set(p.x, p.y + 0.8, p.z), UP);
      ropeMesh.setMatrixAt(i, _m.compose(_s.set(p.x, p.y + 0.8, p.z), _q.setFromRotationMatrix(_m), new THREE.Vector3(1, 1, len)));
    }
    for (const m of [postMesh, ropeMesh]) { m.frustumCulled = false; run.group.add(run.storage(m)); }
    const signMat = new THREE.MeshStandardNodeMaterial({ map: signTexture([['NATURSCHUTZ', 34], ['GEBIET', 34], ['Pflanzen nicht pflücken', 19]]), roughness: 0.6 });
    for (const a of [-0.9, 0.9 + Math.PI / 2, Math.PI + 0.4]) {
      const x = Z.x + Math.cos(a) * (Z.r + 0.4), z = Z.z + Math.sin(a) * (Z.r + 0.4), y = groundHeight(x, z);
      const s = new THREE.Group();
      s.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6).translate(0, 0.8, 0), mat(0x666666)));
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.03), [mat(0x1f6b34), mat(0x1f6b34), mat(0x1f6b34), mat(0x1f6b34), signMat, mat(0x1f6b34)]);
      board.position.y = 1.5;
      s.add(board);
      s.position.set(x, y - 0.05, z);
      s.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)); // (facing out of the reserve)
      run.group.add(s);
    }
    run.work = { bushMesh, bloomMesh, toast: createToast(run), keyHold: false, touchHold: false };
    bindHold(run);
    holdButton(run, 'Pick');
  },
  reset(run) {
    const w = run.work, bushes = run.state.bushes;
    bushes.forEach((b, i) => {
      b.y = groundHeight(b.x, b.z);
      w.bloomMesh.setMatrixAt(i, b.bloom ? _m.compose(_p.set(b.x, b.y - 0.05, b.z), _q.setFromAxisAngle(UP, i * 0.7), _s.set(b.size, b.size, b.size)) : ZERO);
      w.bushMesh.setColorAt(i, _c.setRGB(0.85 + 0.3 * hash(i + 4), 0.85 + 0.3 * hash(i + 9), 0.8 + 0.3 * hash(i)));
    });
    w.bloomMesh.instanceMatrix.needsUpdate = true;
    if (w.bushMesh.instanceColor) w.bushMesh.instanceColor.needsUpdate = true;
    w.keyHold = w.touchHold = false;
    w.toast.hide();
  },
  key(run, e) { holdKey(run, e); },
  update(run, ctx, dt, cm) {
    const w = run.work, st = run.state;
    const live = run.phase === 'ready' || run.phase === 'running';
    if (live && ctx.mode === 'person' && run.index === 0) {
      const b = nearestBush(st.bushes, ctx.x, ctx.z);
      if (stepPicking(st, b, holding(run), dt, ROSES.pickS) === 'done') {
        if (b.bloom) {
          b.picked = true; st.picked++;
          w.bloomMesh.setMatrixAt(b.i, ZERO);
          w.bloomMesh.instanceMatrix.needsUpdate = true;
          w.toast.show(`${st.picked}/${ROSES.goal}`, '#ff9ec4', 0.9);
          if (b.inZone) { st.penaltyMs += ROSES.zoneMs; w.toast.show('Picked in the reserve! +10 s', '#ff8f80', 1.6); }
        } else {
          b.damaged = true; st.damaged++; st.penaltyMs += ROSES.damageMs;
          w.bushMesh.setColorAt(b.i, _c.setRGB(2.2, 1.3, 0.6));
          w.bushMesh.instanceColor.needsUpdate = true;
          w.toast.show(`Not in flower: bush damaged +${ROSES.damageMs / 1000} s`, '#ff8f80', 1.6);
        }
        w.keyHold = false;
      }
    } else st.picking = null;
    w.toast.update(dt);
  }
};

// =====================================================================================================================
// 6. The mushrooms
let MUSHROOM_SITES = null; // (where they stand: the forest test over swissTLM3D is done once)
function forestTest() {
  const f = MUSHROOMS.field;
  const areas = (TLM_TREES?.areas || []).filter((a) => a.kind === 'forest' && a.rings[0].some((v, i) => i % 2 === 0 && v > f.x0 - 600 && v < f.x1 + 600 && a.rings[0][i + 1] > f.z0 - 600 && a.rings[0][i + 1] < f.z1 + 600));
  const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  return (x, z) => areas.some((a) => { let c = false; for (const r of a.rings) if (inRing(r, x, z)) c = !c; return c; });
}
function flyAgaricTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#d0201a'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#f6f2e8';
  for (let i = 0; i < 26; i++) { x.beginPath(); x.arc(hash(i) * 128, 10 + hash(i + 40) * 64, 3 + hash(i + 9) * 4, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#f1ead8'; x.fillRect(0, 96, 128, 32); // (the gills under the cap)
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const MUSH_LOOK = {
  porcini: { cap: 0x6e4220, stem: 0xe8dcc0, stemW: 1.45, shape: 'bolete' },
  bitter: { cap: 0x8a6438, stem: 0xa98a62, stemW: 1.3, shape: 'bolete' },
  chanterelle: { cap: 0xf0b622, stem: 0xf0b622, stemW: 0.7, shape: 'funnel' },
  falseChanterelle: { cap: 0xe9731a, stem: 0xd86a18, stemW: 0.55, shape: 'funnel' },
  flyAgaric: { cap: 0xffffff, stem: 0xf4f0e2, stemW: 1, shape: 'agaric' }
};
const MUSH_SCALE = 1.7; // (bigger than life: they have to be found on a screen)
const DRAW_RADIUS = 32;

const mushrooms = {
  setup(run) {
    MUSHROOM_SITES ||= createMushrooms(forestTest());
    const n = MUSHROOM_SITES.length;
    const capGeo = new THREE.SphereGeometry(0.075, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.09, 0);
    const funnelGeo = mergeGeometries([0, 1, 2].map((i) => new THREE.CylinderGeometry(0.045, 0.012, 0.075, 10, 1, false).translate(Math.cos(i * 2.1) * 0.06 * (i ? 1 : 0), 0.04, Math.sin(i * 2.1) * 0.06 * (i ? 1 : 0)).scale(1, 1 - i * 0.15, 1)));
    const stemGeo = new THREE.CylinderGeometry(0.022, 0.03, 0.1, 8).translate(0, 0.05, 0);
    const meshes = {
      stem: new THREE.InstancedMesh(stemGeo, mat(0xffffff, { roughness: 0.8 }), n),
      bolete: new THREE.InstancedMesh(capGeo, mat(0xffffff, { roughness: 0.6 }), n),
      funnel: new THREE.InstancedMesh(funnelGeo, mat(0xffffff, { roughness: 0.7 }), n),
      agaric: new THREE.InstancedMesh(capGeo.clone().scale(1.35, 1.1, 1.35), new THREE.MeshStandardNodeMaterial({ map: flyAgaricTexture(), roughness: 0.5 }), n)
    };
    for (const key of ['stem', 'bolete', 'funnel']) meshes[key].setColorAt(0, _c.set(0xffffff)); // (the colour attribute from the start: the pipeline is built with it)
    for (const m of Object.values(meshes)) { m.count = 0; m.castShadow = true; m.frustumCulled = false; run.group.add(run.storage(m)); }
    // (the colours once: per-instance colour index = the slot of the drawn list, so they are set as drawn)
    run.work = { meshes, toast: createToast(run), keyHold: false, touchHold: false, drawT: 1, drawnAt: null };
    bindHold(run);
    holdButton(run, 'Pick');
  },
  reset(run) {
    const w = run.work;
    run.state.items = MUSHROOM_SITES.map((m) => ({ ...m, picked: false, y: groundHeight(m.x, m.z) }));
    w.drawT = 1; w.drawnAt = null;
    w.keyHold = w.touchHold = false;
    w.toast.hide();
  },
  key(run, e) { holdKey(run, e); },
  /** The mushrooms within DRAW_RADIUS of (x, z) into the instanced meshes */
  draw(run, x, z) {
    const w = run.work, M = w.meshes, items = run.state.items;
    const counts = { stem: 0, bolete: 0, funnel: 0, agaric: 0 };
    for (const m of items) {
      if (m.picked || Math.abs(m.x - x) > DRAW_RADIUS || Math.abs(m.z - z) > DRAW_RADIUS) continue;
      const L = MUSH_LOOK[m.kind], s = m.size * MUSH_SCALE;
      _q.setFromAxisAngle(UP, m.yaw);
      const add = (key, sx, sy, colour) => {
        const mesh = M[key], k = counts[key]++;
        mesh.setMatrixAt(k, _m.compose(_p.set(m.x, m.y - 0.01, m.z), _q, _s.set(s * sx, s * sy, s * sx)));
        if (colour != null) mesh.setColorAt(k, _c.set(colour));
      };
      if (L.shape === 'funnel') add('funnel', 1, 1, L.cap);
      else {
        add('stem', L.stemW, L.shape === 'agaric' ? 1.5 : 1, L.stem);
        if (L.shape === 'agaric') add('agaric', 1, 1, null); else add('bolete', L.stemW * 0.85, 1, L.cap);
      }
    }
    for (const [key, mesh] of Object.entries(M)) {
      mesh.count = counts[key];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    w.drawnAt = { x, z };
  },
  update(run, ctx, dt, cm) {
    const w = run.work, st = run.state;
    if (!st.items) return;
    const live = run.phase === 'ready' || run.phase === 'running';
    let picked = false;
    if (live && ctx.mode === 'person' && run.index === 0) {
      const m = nearestMushroom(st.items, ctx.x, ctx.z, MUSHROOMS.reach);
      if (stepPicking(st, m, holding(run), dt, MUSHROOMS.pickS) === 'done') {
        m.picked = true;
        st.basket.push(m.kind);
        picked = true;
        w.keyHold = false;
        w.toast.show(`Into the basket (${st.basket.length}/${MUSHROOMS.basket})`, '#f3d9a4', 1.1);
      }
    } else st.picking = null;
    // (redrawn when the player has moved a few metres, or one was picked)
    w.drawT += dt;
    const moved = !w.drawnAt || Math.hypot(ctx.x - w.drawnAt.x, ctx.z - w.drawnAt.z) > 4;
    if (picked || (moved && w.drawT > 0.3)) { w.drawT = 0; mushrooms.draw(run, ctx.x, ctx.z); }
    w.toast.update(dt);
  }
};

export const WORK_FEATURES = { shovel, workVehicle, snowBlower, mower, garbageRound, alpineRoses, mushrooms };
