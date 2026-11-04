// js/missions-hike.js
// The runtime of js/missions-data-hike.js:
//  - hikeTrail: red and white waymarks along the line (one merged mesh, their white tops self-lit so that they read before
//    dawn), a cairn at its end, and the hike's walk, time and time off the path. The walking itself is the controllers' own.
//  - sunriseClock: the one mission clock that moves. js/game-clock.js holds it for a mission; this moves the held time on, in
//    half minutes, so the light steps are no more than the world's usual, and lets it go on past the sunrise.
//  - headlamp: the lamp on the walker's forehead and its pool of light on the ground (see LAMP: no light in the scene).
//  - wildlife: the chamois and ibex along the way, one instanced mesh for each look.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { groundHeight } from './terrain.js';
import { gameClock, dayOf, MINUTES_PER_DAY } from './game-clock.js';
import { waterAt } from './city-config.js';
import { QUALITY } from './quality.js';
import { ibexGeometry } from './missions-local.js';
import {
  stepHike, lineLengths, pointAt, dawnMinute, dawnStart, sunriseMinute, DAWN, LAMP, lampVertexCount, lampStrength, lampPool,
  WILD, createWildlife, resetWildlife, stepWildlife, wildHop
} from './missions-data-hike.js';

const MARK_EVERY = 45; // m between the waymarks
const live = (run) => run.phase === 'ready' || run.phase === 'running';

const painted = (geo, hex) => {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[3 * i] = c.r; a[3 * i + 1] = c.g; a[3 * i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
};

/** The worn path, draped over the ground: pale enough to find by first light, a little self-lit for before it */
function buildPath(route) {
  const lengths = lineLengths(route), total = lengths[lengths.length - 1], pos = [], HALF = 0.75, STEP = 4;
  let prev = null;
  for (let s = 0; s <= total; s += STEP) {
    const p = pointAt(route, lengths, s), q = pointAt(route, lengths, s + 1.5), dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    const nx = dz / L * HALF, nz = -dx / L * HALF;
    const cur = [[p.x + nx, 0, p.z + nz], [p.x - nx, 0, p.z - nz]].map((v) => { v[1] = groundHeight(v[0], v[2]) + 0.14; return v; });
    if (prev) pos.push(...prev[0], ...cur[0], ...cur[1], ...prev[0], ...cur[1], ...prev[1]);
    prev = cur;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xb0a288, roughness: 1, emissive: 0x8a8068, emissiveIntensity: 0.3, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  return m;
}

function buildMarks(route) {
  const lengths = lineLengths(route), total = lengths[lengths.length - 1];
  const body = [], glow = [];
  for (let s = 12; s < total; s += MARK_EVERY) {
    const p = pointAt(route, lengths, s), y = groundHeight(p.x, p.z);
    // a little to the side of the line, as a stake stands beside a path
    const q = pointAt(route, lengths, s + 2), dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    const x = p.x + (dz / L) * 1.1, z = p.z - (dx / L) * 1.1;
    const ground = Math.min(y, groundHeight(x, z));
    body.push(painted(new THREE.BoxGeometry(0.09, 1.2, 0.09).translate(x, ground + 0.6, z), 0xb3261e));
    // white, red, white, as a Swiss mountain path is marked
    glow.push(painted(new THREE.BoxGeometry(0.1, 0.16, 0.1).translate(x, ground + 1.12, z), 0xffffff));
    glow.push(painted(new THREE.BoxGeometry(0.1, 0.16, 0.1).translate(x, ground + 0.8, z), 0xffffff));
  }
  const end = route[route.length - 1], y = groundHeight(end[0], end[1]);
  for (let k = 0; k < 7; k++) { // the cairn
    const r = 0.75 - k * 0.09;
    body.push(painted(new THREE.DodecahedronGeometry(r, 0).translate(end[0] + 2.2 + (k % 2) * 0.1, y + 0.3 + k * 0.32, end[1] + 1.4 - (k % 3) * 0.08), 0x6a6862));
  }
  const solid = new THREE.Mesh(mergeGeometries(body), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  const lit = new THREE.Mesh(mergeGeometries(glow), new MeshBasicNodeMaterial({ vertexColors: true }));
  for (const g of [...body, ...glow]) g.dispose();
  solid.castShadow = false;
  solid.frustumCulled = lit.frustumCulled = false;
  return [solid, lit];
}

const hikeTrail = {
  setup(run) {
    const route = run.def.createState().hike.route;
    const marks = run.hikeMarks = [...buildMarks(route), buildPath(route)];
    for (const m of marks) run.group.add(m);
  },
  update(run, ctx, dt) {
    const h = run.state?.hike;
    if (h && run.phase === 'running') stepHike(h, ctx.x, ctx.z, dt);
  }
};

const sunriseClock = {
  setup(run) { run.dawn = { day: dayOf(gameClock.total), shown: -1, watch: 0 }; },
  reset(run) {
    run.dawn.day = dayOf(gameClock.total);
    run.dawn.shown = -1; run.dawn.watch = 0;
  },
  update(run, ctx, dt) {
    const h = run.state?.hike, d = run.dawn;
    if (!h || !live(run)) return;
    const rise = sunriseMinute();
    let minute = dawnMinute(h);
    if (h.arrivedAt !== null) {
      // on the summit: the clock runs up to the sunrise and a little past it, in a set time however early you came
      d.watch += dt;
      const from = d.from ?? (d.from = minute), t = Math.min(1, d.watch / DAWN.watch);
      minute = Math.max(from, from + (Math.max(rise, from) + DAWN.afterglow - from) * t);
      if (t >= 1) run.state.watched = true;
    }
    minute = Math.max(dawnStart(), Math.min(rise + 40, minute));
    const step = Math.round(minute * 2) / 2;
    if (step !== d.shown) { d.shown = step; gameClock.jumpTo(d.day * MINUTES_PER_DAY + step); }
  }
};

// --- The headlamp ------------------------------------------------------------------------------------------------------
const LAMP_COLOUR = new THREE.Color(0xfff1d6);
const LAMP_GAIN = 0.55;
function buildLampPool() {
  const n = lampVertexCount(), g = new THREE.BufferGeometry(), index = [];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  for (let a = 0; a < LAMP.rays - 1; a++) for (let i = 0; i < LAMP.rings - 1; i++) {
    const p = a * LAMP.rings + i, q = p + LAMP.rings;
    index.push(p, p + 1, q, q, p + 1, q + 1);
  }
  g.setIndex(index);
  const m = new THREE.Mesh(g, new MeshBasicNodeMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.frustumCulled = false;
  m.renderOrder = 5;
  return m;
}
function buildLampHead() {
  const lamp = new THREE.Group();
  const strap = new THREE.TorusGeometry(0.108, 0.011, 6, 22).rotateX(Math.PI / 2).scale(0.95, 1, 1.18);
  lamp.add(new THREE.Mesh(strap, new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.9 })));
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.036, 0.026).translate(0, 0, 0.134), new THREE.MeshStandardMaterial({ color: 0x30363c, roughness: 0.5 }));
  lamp.add(body);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 12).translate(0, 0, 0.148), new MeshBasicNodeMaterial({ color: 0xffffff }));
  lamp.add(lens);
  return { lamp, lensMat: lens.material };
}
const _lampAt = new THREE.Vector3();
const headlamp = {
  setup(run) {
    const pool = buildLampPool(), { lamp, lensMat } = buildLampHead();
    run.group.add(pool, lamp);
    run.lamp = { pool, head: lamp, lensMat, lit: new Float32Array(lampVertexCount()), rig: null };
  },
  teardown(run) { if (run.lamp?.rig) run.lamp.rig.trackHead = false; },
  update(run, ctx, dt, cm) {
    const L = run.lamp, person = cm.entities.person, rig = person.rig;
    if (!L.rig) { L.rig = rig; rig.trackHead = true; }
    const q = rig.headQuaternion, head = rig.headPosition;
    if (head) {
      L.head.quaternion.copy(q);
      L.head.position.set(0, 0.155, -0.006).applyQuaternion(q).add(head);
    } else L.head.position.set(ctx.x, ctx.y + 1.72, ctx.z);
    const power = lampStrength(((gameClock.total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY);
    L.pool.visible = power > 0.01;
    L.lensMat.color.setScalar(0.25 + 0.75 * power);
    if (!L.pool.visible) return;
    _lampAt.set(0, 0, 0.14).applyQuaternion(L.head.quaternion).add(L.head.position);
    const g = L.pool.geometry, pos = g.attributes.position, col = g.attributes.color;
    lampPool(_lampAt.x, _lampAt.y, _lampAt.z, ctx.heading, groundHeight, pos.array, L.lit);
    for (let i = 0; i < L.lit.length; i++) {
      const v = L.lit[i] * power * LAMP_GAIN;
      col.array[3 * i] = v * LAMP_COLOUR.r; col.array[3 * i + 1] = v * LAMP_COLOUR.g; col.array[3 * i + 2] = v * LAMP_COLOUR.b;
    }
    pos.needsUpdate = col.needsUpdate = true;
  },
  after(run) { if (run.lamp && !live(run)) run.lamp.pool.visible = false; }
};

// --- The animals -------------------------------------------------------------------------------------------------------
const part = (geo, hex) => painted(geo, hex);
const blob = (sx, sy, sz, x, y, z, hex, seg = 10) => part(new THREE.SphereGeometry(1, seg, Math.max(6, seg * 0.6 | 0)).scale(sx, sy, sz).translate(x, y, z), hex);
/** A chamois: lighter of build than the ibex, a dark stripe down the back, the pale face with its dark bands, short hooked horns */
function chamoisGeometry() {
  const fur = 0x94714a, dark = 0x2f261d, pale = 0xe2d6bd, horn = 0x17130f;
  const parts = [
    blob(0.2, 0.25, 0.5, 0, 0.78, 0, fur, 12), blob(0.205, 0.05, 0.42, 0, 1.0, 0, dark, 8), blob(0.17, 0.14, 0.34, 0, 0.64, 0, 0xb59a74, 8),
    blob(0.19, 0.25, 0.22, 0, 0.84, 0.34, fur, 10),
    part(new THREE.CylinderGeometry(0.075, 0.11, 0.42, 8).rotateX(-0.6).translate(0, 1.08, 0.5), fur),
    blob(0.08, 0.095, 0.17, 0, 1.28, 0.68, pale, 10),
    blob(0.083, 0.03, 0.15, 0.03, 1.29, 0.7, dark, 6), blob(0.083, 0.03, 0.15, -0.03, 1.29, 0.7, dark, 6),
    blob(0.05, 0.05, 0.06, 0, 1.24, 0.84, dark, 6),
    blob(0.04, 0.06, 0.05, 0, 0.92, -0.5, dark, 6)
  ];
  for (const [x, z] of [[-0.1, 0.36], [0.1, 0.36], [-0.1, -0.36], [0.1, -0.36]]) {
    parts.push(part(new THREE.CylinderGeometry(0.034, 0.024, 0.64, 6).translate(x, 0.32, z), dark));
  }
  for (const s of [-1, 1]) {
    const pts = [[0.035, 1.34, 0.66], [0.045, 1.46, 0.65], [0.05, 1.54, 0.6], [0.05, 1.53, 0.53]].map(([x, y, z]) => new THREE.Vector3(s * x, y, z));
    parts.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.012, 5, false), horn));
    parts.push(part(new THREE.ConeGeometry(0.025, 0.1, 4).rotateZ(s * 1.0).translate(s * 0.085, 1.36, 0.6), fur));
  }
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}
const LOOKS = {
  chamois: () => chamoisGeometry(),
  buck: () => ibexGeometry({ sex: 'm', age: 'old', horn: 0.85 }),
  nanny: () => ibexGeometry({ sex: 'f', age: 'old', horn: 0.3 })
};
const lookOf = (a, i) => (a.kind === 'chamois' ? 'chamois' : i % 3 === 0 ? 'buck' : 'nanny');
const _dummy = new THREE.Object3D();
_dummy.rotation.order = 'YXZ';
const wildlife = {
  setup(run) {
    const w = createWildlife(run.def.createState().hike.route, run.def.wildlife);
    const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    const herds = {};
    w.animals.forEach((a, i) => { (herds[lookOf(a, i)] ||= []).push(a); });
    run.wild = { w, meshes: Object.entries(herds).map(([look, animals]) => {
      const m = new THREE.InstancedMesh(LOOKS[look](), mat, animals.length);
      m.frustumCulled = false;
      m.castShadow = !QUALITY.mobile;
      run.group.add(m);
      return { m, animals };
    }) };
    wildlife.place(run);
  },
  reset(run) { resetWildlife(run.wild.w); wildlife.place(run); },
  place(run) {
    for (const { m, animals } of run.wild.meshes) {
      animals.forEach((a, i) => {
        const sx = Math.sin(a.heading), cx = Math.cos(a.heading);
        const y = groundHeight(a.x, a.z), slope = (groundHeight(a.x + sx * 0.7, a.z + cx * 0.7) - groundHeight(a.x - sx * 0.7, a.z - cx * 0.7)) / 1.4;
        _dummy.position.set(a.x, y - 0.02 + wildHop(a), a.z);
        _dummy.rotation.set(-Math.atan(slope) * 0.8, a.heading, 0);
        _dummy.scale.setScalar(WILD[a.kind].scale * (a.young ? 0.72 : 1));
        _dummy.updateMatrix();
        m.setMatrixAt(i, _dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  },
  update(run, ctx, dt) {
    stepWildlife(run.wild.w, dt, ctx.x, ctx.z, waterAt);
    wildlife.place(run);
  }
};

export const HIKE_FEATURES = { hikeTrail, sunriseClock, headlamp, wildlife };
