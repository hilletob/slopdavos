import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { t } from './i18n.js';
import { painted, createHelper } from './missions-props.js';
import { VEHICLES, createToast, particles, lump } from './missions-work.js';
import { BODY_SPECS, buildCarGeometry, buildCarSidePatch, buildSteerableWheelGeo, createLoftedCarMaterial } from './actor-models.js';
import {
  QUAD, QUAD_BUMPS, QUAD_PATCHES, QUAD_GATES, QUAD_ROUTE, QUAD_GATE_LIST, quadNextGate, bumpAt, stepQuad,
  BIO, BIO_PLANT, BIO_HOPPER, BIO_DIGESTERS, BIO_BARREL, BIO_BED, BIO_BED_SLOTS, BIO_ROUTE, bioLoad, rejectBarrel, stopAtBed, stepBioStops
} from './missions-data-rural.js';

// js/missions-rural.js
// The runtime of the two rural missions (js/missions-data-rural.js has their definitions and logic; js/missions.js takes
// RURAL_FEATURES into its FEATURES). Both drive the player's car through js/missions-work.js workVehicle, which wears the
// vehicle registered here in its VEHICLES:
//   quadCourse  the quad: merged boxes and fat wheels (two draw calls and its rider), its body hopping and rocking in the
//               vehicle's pose() hook; the bumps, the mud and snow patches and the gates' flags as one merged mesh draped
//               on the terrain; the handling swapped through car.drive on the surfaces and in the air.
//   bioRound    the open transporter (a lofted dropside lorry, buildBioTruck), the round barrels (full, empty, the plastic in the two bad ones: three instanced
//               meshes) standing at the stops, going up from the side, stacked on the bed and tipped at the plant; the
//               reject key, the load gauge in the mission panel, the flies and the stink cloud (the run's particle
//               batch), the biogas plant with its hopper. The stops' logic is the refuse round's (stepGarbage).
// Everything is built for the run and goes with its group (js/missions.js disposes it).

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const vertexMat = (o = {}) => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02, ...o });
const boxAt = (w, h, l, hex, x, y, z, rx = 0, ry = 0, rz = 0) => painted(new THREE.BoxGeometry(w, h, l), hex).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
const cylAt = (r0, r1, h, seg, hex, x, y, z, rx = 0, rz = 0) => painted(new THREE.CylinderGeometry(r0, r1, h, seg), hex).rotateX(rx).rotateZ(rz).translate(x, y, z);
const carGround = (run, x, z) => run.hooks.controllerManager.getGroundHeight(x, z, 'car');

// =====================================================================================================================
// 1. The quad
function buildQuadModel() {
  const g = new THREE.Group();
  g.name = 'Quad';
  const orange = 0xd9601a, dark = 0x1f2124, steel = 0x6d7276, seat = 0x15171a;
  const body = mergeGeometries([
    boxAt(0.62, 0.2, 1.5, dark, 0, 0.42, 0), // the frame
    boxAt(0.5, 0.26, 0.5, steel, 0, 0.42, -0.02), // the engine
    boxAt(0.5, 0.24, 0.5, orange, 0, 0.74, 0.22), // the tank
    boxAt(0.42, 0.14, 0.7, seat, 0, 0.77, -0.3), // the seat
    boxAt(1.02, 0.07, 0.62, orange, 0, 0.72, 0.68), boxAt(1.02, 0.07, 0.62, orange, 0, 0.72, -0.68), // the mudguards
    boxAt(0.6, 0.05, 0.42, steel, 0, 0.83, 0.7), boxAt(0.6, 0.05, 0.42, steel, 0, 0.83, -0.72), // the racks
    boxAt(0.74, 0.26, 0.06, dark, 0, 0.56, 1.1), // the bull bar
    boxAt(0.3, 0.1, 0.05, 0xfff3c0, 0, 0.72, 1.0), // the lamp
    boxAt(0.3, 0.05, 0.42, dark, 0.46, 0.34, -0.04), boxAt(0.3, 0.05, 0.42, dark, -0.46, 0.34, -0.04), // the footrests
    cylAt(0.05, 0.05, 0.55, 8, steel, 0.24, 0.48, -0.86, Math.PI / 2), // the exhaust
    cylAt(0.022, 0.022, 0.42, 6, dark, 0, 0.98, 0.34, -0.5), // the bars' column
    cylAt(0.02, 0.02, 0.66, 6, dark, 0, 1.17, 0.27, 0, Math.PI / 2) // the bars
  ]);
  const mesh = new THREE.Mesh(body, vertexMat({ roughness: 0.55 }));
  mesh.castShadow = true;
  g.add(mesh);
  // (the four fat wheels: one geometry, one material)
  const R = 0.31, W = 0.3;
  const wheelGeo = mergeGeometries([cylAt(R, R, W, 14, 0x17181a, 0, 0, 0, 0, Math.PI / 2), cylAt(R * 0.52, R * 0.52, W + 0.02, 10, 0xb0b0a8, 0, 0, 0, 0, Math.PI / 2), boxAt(W + 0.03, R * 1.85, 0.06, 0x2a2b2d, 0, 0, 0)]);
  const wheelMat = vertexMat({ roughness: 0.92 });
  const wheels = [];
  for (const [x, z] of [[0.56, 0.68], [-0.56, 0.68], [0.56, -0.68], [-0.56, -0.68]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, R, z);
    w.castShadow = true;
    g.add(w);
    wheels.push({ mesh: w, r: R, front: z > 0, y: R });
  }
  return {
    group: g, wheels, drive: QUAD.drive,
    dims: { halfW: 0.72, halfL: 1.08, top: 1.25, mass: 340 }, chase: [5.8, 2.3], label: 'Quad',
    seat: { seat: new THREE.Vector3(0, 0.8, -0.26), bars: new THREE.Vector3(0, 1.17, 0.27), gripHalf: 0.28, bracket: new THREE.Vector3(0, 0.42, 0.02), crankLength: 0, pedalHalf: 0.3, lean: 0.2 }
  };
}
VEHICLES.quad = buildQuadModel;

/** The course's ground and flags: one merged mesh */
function buildCourse(run) {
  const parts = [];
  const earth = new THREE.Color(0x6a5230), grass = new THREE.Color(0x56702e), c = new THREE.Color();
  // the mounds: a grid draped on the ground, its height from bumpAt
  const b0 = {};
  for (const b of QUAD_BUMPS) {
    const nx = 8, nz = 12, s = Math.sin(b.heading), co = Math.cos(b.heading);
    const pos = [], col = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const across = (i / nx - 0.5) * 2 * b.halfW, along = (j / nz - 0.5) * 2 * b.halfL;
      const x = b.x + s * along + co * across, z = b.z + co * along - s * across;
      bumpAt(x, z, b0, [b]);
      pos.push(x, carGround(run, x, z) + b0.h - 0.01, z);
      c.copy(grass).lerp(earth, Math.min(1, b0.h / (b.h * 0.35)));
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * (nx + 1) + i; idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2); }
    parts.push(gridGeometry(pos, col, idx));
  }
  // the patches: discs draped on the ground, a dappled edge
  const MUD = new THREE.Color(0x2a1f14), MUD2 = new THREE.Color(0x4a3822), SNOW = new THREE.Color(0xe6ebf2), SNOW2 = new THREE.Color(0xb9c2cc);
  QUAD_PATCHES.forEach((p, n) => {
    const rings = 4, seg = 20, pos = [p.x, carGround(run, p.x, p.z) + 0.05, p.z], col = [], idx = [];
    const [a, e] = p.kind === 'snow' ? [SNOW, SNOW2] : [MUD, MUD2];
    col.push(a.r, a.g, a.b);
    for (let i = 1; i <= rings; i++) for (let j = 0; j < seg; j++) {
      const w = (j / seg) * Math.PI * 2, r = (p.r * i) / rings * (1 + 0.1 * Math.sin(w * 3 + n) * (i / rings));
      const x = p.x + Math.cos(w) * r, z = p.z + Math.sin(w) * r;
      pos.push(x, carGround(run, x, z) + 0.05, z);
      c.copy(a).lerp(e, i === rings ? 1 : 0.15 * (j % 3));
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < seg; j++) idx.push(0, 1 + (j + 1) % seg, 1 + j);
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < seg; j++) {
      const a0 = 1 + i * seg + j, a1 = 1 + i * seg + (j + 1) % seg, b1 = a0 + seg, b2 = a1 + seg;
      idx.push(a0, a1, b1, a1, b2, b1);
    }
    parts.push(gridGeometry(pos, col, idx));
  });
  // the gates: either side of the way a tall pole striped red and white, a traffic cone at its foot, a pennant on top
  // (the number boards: buildGateBoards)
  for (const g of QUAD_GATE_LIST) {
    if (g.finish) continue;
    const ax = Math.cos(g.heading), az = -Math.sin(g.heading);
    for (const side of [-1, 1]) {
      const px = g.x + ax * side * QUAD.gateHalf, pz = g.z + az * side * QUAD.gateHalf, y = carGround(run, px, pz);
      for (let k = 0; k < 8; k++) parts.push(cylAt(0.07, 0.07, 0.5, 8, k % 2 ? 0xf4f4f0 : 0xe0301e, px, y + 0.25 + k * 0.5, pz));
      parts.push(cylAt(0.04, 0.3, 0.75, 12, 0xff6a13, px, y + 0.38, pz), boxAt(0.62, 0.05, 0.62, 0x1b1c1e, px, y + 0.025, pz, 0, g.heading));
      for (const h of [0.22, 0.5]) parts.push(cylAt(0.04 + 0.26 * (1 - h / 0.75) + 0.012, 0.04 + 0.26 * (1 - (h + 0.08) / 0.75) + 0.012, 0.08, 12, 0xf4f4f0, px, y + h + 0.04, pz));
      parts.push(boxAt(0.03, 0.55, 0.95, side > 0 ? 0xe2471a : 0xf0c419, px + ax * side * 0.5, y + 3.7, pz + az * side * 0.5, 0, g.heading + Math.PI / 2));
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), vertexMat({ roughness: 0.88, side: THREE.DoubleSide }));
  mesh.name = 'QuadCourse';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  run.group.add(mesh);
}

/** The gates' numbers: a board on each pole, both faces, facing the way in (one canvas of the numbers, one draw call) */
function numberAtlas(n) {
  const cols = 8, rows = Math.ceil(n / cols), c = document.createElement('canvas');
  c.width = cols * 128; c.height = rows * 128;
  const x = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const cx = (i % cols) * 128, cy = Math.floor(i / cols) * 128;
    x.fillStyle = '#ffffff'; x.fillRect(cx + 4, cy + 4, 120, 120);
    x.lineWidth = 10; x.strokeStyle = '#e0301e'; x.strokeRect(cx + 9, cy + 9, 110, 110);
    x.fillStyle = '#16181b'; x.font = '900 76px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(i + 1), cx + 64, cy + 68);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, cols, rows };
}

function buildGateBoards(run) {
  const gates = QUAD_GATE_LIST.filter((g) => !g.finish), { tex, cols, rows } = numberAtlas(gates.length), parts = [];
  for (const g of gates) {
    const i = g.n - 1, u0 = (i % cols) / cols, v1 = 1 - Math.floor(i / cols) / rows, u1 = u0 + 1 / cols, v0 = v1 - 1 / rows;
    const ax = Math.cos(g.heading), az = -Math.sin(g.heading);
    for (const side of [-1, 1]) {
      const px = g.x + ax * side * QUAD.gateHalf, pz = g.z + az * side * QUAD.gateHalf, y = carGround(run, px, pz);
      // (two planes back to back, so the number reads the right way round from both sides)
      for (const back of [0, 1]) {
        const q = new THREE.PlaneGeometry(0.95, 0.95);
        const uv = q.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
        q.rotateY(g.heading + Math.PI + (back ? Math.PI : 0)).translate(px - Math.sin(g.heading) * (back ? -0.09 : 0.09), y + 2.75, pz - Math.cos(g.heading) * (back ? -0.09 : 0.09));
        parts.push(q);
      }
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.5, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25 }));
  mesh.name = 'QuadGateNumbers';
  mesh.frustumCulled = false;
  run.group.add(mesh);
}

/** Chevrons on the ground all along the course, pointing on to the next gate: yellow and a little lit, on the mounds too */
function buildChevrons(run) {
  const pts = QUAD_ROUTE, pos = [], b = {};
  const put = (x, z, lift) => { bumpAt(x, z, b); pos.push(x, carGround(run, x, z) + b.h + lift, z); };
  let s = 0, next = 4;
  for (let i = 2; i < pts.length; i += 2) {
    const dx = pts[i] - pts[i - 2], dz = pts[i + 1] - pts[i - 1], L = Math.hypot(dx, dz);
    if (!L) continue;
    const fx = dx / L, fz = dz / L, lx = fz, lz = -fx;
    while (next <= s + L) {
      const u = next - s, cx = pts[i - 2] + fx * u, cz = pts[i - 1] + fz * u;
      next += QUAD.chevronStep;
      if (QUAD_GATE_LIST.some((g) => Math.hypot(g.x - cx, g.z - cz) < 5)) continue;
      // a V of two arms, the tip forward: each arm a quad 0.28 m wide
      for (const side of [-1, 1]) {
        const tip = [cx + fx * 0.6, cz + fz * 0.6], end = [cx - fx * 0.45 + lx * side * 1.1, cz - fz * 0.45 + lz * side * 1.1];
        const w = 0.2, ox = fx * w, oz = fz * w;
        const quad = [[tip[0] + ox, tip[1] + oz], [tip[0] - ox, tip[1] - oz], [end[0] - ox, end[1] - oz], [end[0] + ox, end[1] + oz]];
        for (const k of [0, 1, 2, 0, 2, 3]) put(quad[k][0], quad[k][1], 0.14);
      }
    }
    s += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardNodeMaterial({ color: 0xffa81a, emissive: 0xff7400, emissiveIntensity: 0.4, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'QuadChevrons';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  run.group.add(mesh);
}

/** Two columns of light: the next gate's bright, the one after it faint (where the way goes on) */
function buildBeams(run) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
  const beam = (hex, opacity) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicNodeMaterial({ color: hex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    m.renderOrder = 2;
    run.group.add(m);
    return m;
  };
  const ys = QUAD_GATE_LIST.map((g) => carGround(run, g.x, g.z));
  return { next: beam(0x3fd6ff, 0.32), after: beam(0xffb347, 0.16), ys, at: -1 };
}

function placeBeams(run) {
  const q = run.quad, B = q.beams, st = run.state;
  const k = st && (run.phase === 'ready' || run.phase === 'running' || run.phase === 'intro') ? quadNextGate(st, run.index) : -1;
  if (k === B.at) return;
  B.at = k;
  for (const [m, i, r, h] of [[B.next, k, 1.1, 34], [B.after, k + 1, 0.7, 22]]) {
    const g = i >= 0 ? QUAD_GATE_LIST[i] : null;
    m.visible = !!g;
    if (!g) continue;
    m.position.set(g.x, B.ys[i] - 0.5, g.z);
    m.scale.set(r, h, r);
  }
}

/** Positions, colours, indices as a geometry that merges with painted() ones */
function gridGeometry(pos, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
  return flat;
}

const quadCourse = {
  setup(run) {
    buildCourse(run);
    buildGateBoards(run);
    buildChevrons(run);
    const v = run.vehicle, q = run.quad = { s: 0, spray: 0, toast: createToast(run), b: {}, tilt: 0, beams: buildBeams(run) };
    // (on the radar and the full map: the course, the gates by number, the next one ringed)
    addRouteOverlay(run, QUAD_ROUTE, () => {
      const k = run.state ? quadNextGate(run.state, run.index) : 0;
      return QUAD_GATE_LIST.map((g, i) => ({ x: g.x, z: g.z, label: g.finish ? t('Finish') : String(g.n), done: i < k, next: i === k, square: g.finish }));
    }, '#ffc23a');
    // (the body over the car's physics: js/missions-work.js workVehicle.follow calls this before posing the rider)
    v.pose = (g, car, dt) => {
      const st = run.state;
      if (!st) return;
      const j = st.jump, speed = car.speed || 0;
      q.s += Math.abs(speed) * dt;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      bumpAt(car.position.x, car.position.z, q.b);
      const up = j.air ? j.hopY : q.b.h;
      // (the slope of the mound as driven: nose up on the way in, down on the way out)
      const along = q.b.bump ? fx * Math.sin(q.b.bump.heading) + fz * Math.cos(q.b.bump.heading) : 1;
      const want = j.air ? -clampTilt(j.vy * 0.045) : -Math.atan(q.b.slope * along);
      q.tilt += (want - q.tilt) * Math.min(1, dt * 12);
      // off the road it rocks with the ground, the faster the more (the wheels follow in opposite phase)
      const rough = (run.index === 1 ? 1 : 0.22) * Math.min(1, Math.abs(speed) / 12) * (j.air ? 0 : 1);
      const a = Math.sin(q.s * 1.9) + 0.6 * Math.sin(q.s * 3.7 + 1), b = Math.sin(q.s * 2.6 + 2);
      g.position.y += up + rough * 0.025 * b;
      g.rotation.x += q.tilt + rough * QUAD.chatter * 0.6 * b;
      g.rotation.z += rough * QUAD.chatter * a;
      for (const w of v.wheels) {
        const side = Math.sign(w.mesh.position.x);
        w.mesh.position.y = w.y + (j.air ? -0.08 : rough * 0.035 * side * a);
      }
    };
  },
  reset(run) {
    const q = run.quad;
    q.s = 0; q.tilt = 0; q.toast.hide(); q.beams.at = -2;
    run.hooks.controllerManager.entities.car.drive = run.vehicle.drive;
  },
  update(run, ctx, dt, cm) {
    const st = run.state, q = run.quad, car = cm.entities.car, v = run.vehicle;
    const live = run.phase === 'ready' || run.phase === 'running';
    if (live && ctx.mode === 'car') {
      const ev = stepQuad(st, { x: car.position.x, z: car.position.z, speed: car.speed || 0 }, dt);
      car.drive = st.jump.air ? QUAD.air : QUAD.surfaces[st.surface] || v.drive;
      if (ev === 'land') {
        // (the sprung chassis takes the landing; the harder, the more it bounces)
        const hard = Math.min(1, st.lastAir / 1.1);
        car.heaveVel = (car.heaveVel || 0) - 1.8 * hard;
        car.pitchVel = (car.pitchVel || 0) + 1.3 * hard;
        run.audio?.thump?.();
        if (st.cleanLanding) q.toast.show(`Air time ${st.lastAir.toFixed(1)} s: -${QUAD.airBonusMs / 1000} s`, '#ffd76a', 1.2);
      }
      if (st.surface && Math.abs(car.speed) > 2) quadCourse.spray(run, car, st.surface, dt);
    }
    placeBeams(run);
    q.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
  },
  spray(run, car, kind, dt) {
    const q = run.quad;
    q.spray += dt * 26;
    if (q.spray < 1) return;
    const pb = particles(run), fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const tint = kind === 'snow' ? { r: 0.92, g: 0.94, bl: 0.98 } : { r: 0.2, g: 0.15, bl: 0.09 };
    while (q.spray >= 1) {
      q.spray--;
      const side = Math.random() < 0.5 ? -0.5 : 0.5;
      const a = { x: car.position.x - fx * 0.7 + fz * side, y: car.position.y + 0.25, z: car.position.z - fz * 0.7 - fx * side };
      const back = 1.8 + Math.random() * 2.2;
      lump(pb, a, { x: a.x - fx * back + (Math.random() - 0.5) * 1.5, y: a.y - 0.1, z: a.z - fz * back + (Math.random() - 0.5) * 1.5 }, 0.45, { size: 0.14, grow: 0.12, alpha: 1, ...tint });
    }
  }
};
const clampTilt = (v) => (v < -0.4 ? -0.4 : v > 0.4 ? 0.4 : v);

// =====================================================================================================================
// 2. The green-waste round
// The open transporter: a 6.5-tonne dropside lorry of the kind the Davos Werkhof drives (Iveco Daily / Fuso Canter
// class). The cab and the platform are one lofted body of js/actor-models.js (the traffic's: its glass, seals, lamps,
// grille, Swiss plates, door seams and brake, reverse and turn lights painted by the one shader of the fleet, from the
// player car's own light state), on a spec of its own below: the short cab-over cab in front, the platform low behind
// it. On it, one merged mesh of fittings: the floor, the aluminium dropsides with their stakes and hinges, the headboard with the
// ladder guard before the rear window, the frame rails, the fuel tank, the side guards, the mudflaps, the truck mirrors;
// the door decals (Davos, green waste), the amber beacon on the roof; twin tyres at the back.
const TRUCK_DZ = 0.2; // the spec's axles are symmetric about its origin: the body sits this far forward on the truck's centre
const TRUCK_SPEC = {
  ...BODY_SPECS.truck,
  name: 'bio-flatbed',
  zFront: 2.55,
  zRear: -2.95,
  wheelRadius: 0.4,
  wheelZ: 1.55,
  wheelX: 0.84,
  archGap: 0.08,
  archFlare: 0.015,
  tuck: 0.05,
  lowerRound: 2.6,
  upperRound: 6,
  halfWidth: [[2.55, 0.98], [2.0, 1.0], [0.96, 1.0], [0.9, 1.0], [-2.95, 1.0]],
  sill: [[2.55, 0.5], [0.98, 0.5], [0.92, 0.62], [-2.95, 0.62]], // the cab's floor, the platform's frame behind it
  shoulder: [[2.55, 1.02], [0.98, 1.05], [0.92, 0.8], [-2.95, 0.8]],
  edge: [[2.5, 1.5], [2.1, 1.56], [0.98, 1.57], [0.92, BIO_BED.y - 0.004], [-2.95, BIO_BED.y - 0.004]], // the belt, the bed
  crown: [[2.5, 0.025], [0.98, 0.012], [0.92, 0.003], [-2.95, 0.003]],
  tumble: [[2.55, 0.06], [0.98, 0.05], [0.92, 0.0], [-2.95, 0.0]],
  nose: { halfWidth: [0.2, 0.86, 2.4], edge: [0.12, 1.42, 2.6], crown: [0.12, 0.01, 2], sill: [0.1, 0.52, 2], shoulder: [0.15, 0.95, 2.2] },
  tail: { halfWidth: [0.05, 0.97, 2.6], edge: [0.03, BIO_BED.y - 0.03, 4], crown: [0.03, 0, 2], sill: [0.05, 0.64, 2], shoulder: [0.05, 0.8, 2.4] },
  cabin: {
    ...BODY_SPECS.truck.cabin,
    cowl: 2.42, roofFront: 2.12, roofRear: 1.1, deck: 0.99,
    roofY: [[2.12, 2.42], [1.1, 2.41]],
    rail: [0.93, 0.93],
    inset: 0.025,
    bulge: 0.004,
    roofRound: 5,
    pillars: []
  },
  doors: [2.3, 1.06],
  handles: [1.24],
  headlight: [0.7, 0.86, 0.19, 0.075],
  taillight: [0.8, 0.8, 0.13, 0.065],
  grille: [1.12, 0.5, 0.15],
  intake: [0.73, 0.34, 0.028],
  plates: [0.85, 0.77],
  bumperLine: [0.97, 0.69],
  bumpers: [[0.6, 0.085], [0.55, 0.05]], // the front bumper, the underride bar at the back
  chrome: false,
  cladding: 0.66,
  rails: false,
  sign: false,
  rearWiper: false
};

function doorDecalTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = '#3f8a3a'; x.fillRect(0, 150, 512, 30); // the band low on the door
  // a leaf in a circle, the round's sign
  x.fillStyle = '#3f8a3a'; x.beginPath(); x.arc(78, 72, 58, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f4f6ef'; x.beginPath(); x.ellipse(78, 72, 20, 40, 0.7, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#3f8a3a'; x.lineWidth = 5; x.beginPath(); x.moveTo(56, 98); x.lineTo(100, 46); x.stroke();
  x.fillStyle = '#1f3b22'; x.textBaseline = 'middle';
  x.font = '800 64px system-ui, sans-serif'; x.fillText('DAVOS', 156, 52);
  x.fillStyle = '#3f8a3a'; x.font = '700 31px system-ui, sans-serif'; x.fillText(t('Green waste round'), 158, 112);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The fittings: one merged mesh of painted boxes and cylinders, in the truck's frame (z forward, y up from the ground) */
function truckFittings() {
  const B = BIO_BED, L = B.z1 - B.z0, zc = (B.z1 + B.z0) / 2;
  const alu = 0xc9ced3, aluDark = 0x8f969d, frame = 0x24272b, black = 0x141517, steel = 0x7b8187, guard = 0xa2a8ae;
  const boardH = 0.42, top = B.y + boardH, xs = B.halfW + 0.02, zt = B.z0 - 0.03;
  const parts = [];
  // the dropsides and the tailboard: aluminium planks with their ribs and a rail along the top
  for (const sx of [-1, 1]) {
    parts.push(boxAt(0.035, boardH, L, alu, sx * xs, B.y + boardH / 2, zc));
    for (const y of [B.y + 0.14, B.y + 0.28]) parts.push(boxAt(0.012, 0.018, L - 0.04, aluDark, sx * (xs + 0.02), y, zc));
    parts.push(boxAt(0.05, 0.035, L + 0.02, aluDark, sx * xs, top, zc));
    // the stakes and the hinges at the foot
    for (const z of [B.z0 + 0.03, zc, B.z1 - 0.03]) parts.push(boxAt(0.05, boardH + 0.05, 0.07, aluDark, sx * (xs + 0.012), B.y + (boardH + 0.05) / 2 - 0.02, z));
    for (const z of [B.z0 + 0.6, zc - 0.6, zc + 0.6, B.z1 - 0.6]) parts.push(cylAt(0.022, 0.022, 0.16, 8, steel, sx * (xs + 0.025), B.y + 0.02, z, Math.PI / 2));
    // the drop locks on the tailboard's ends
    parts.push(boxAt(0.04, 0.09, 0.06, steel, sx * (xs - 0.05), B.y + 0.26, zt - 0.03));
  }
  parts.push(boxAt(xs * 2 + 0.035, boardH, 0.035, alu, 0, B.y + boardH / 2, zt));
  // the floor: brown phenolic boards, their joints
  parts.push(boxAt(xs * 2 - 0.02, 0.016, L - 0.02, 0x5e4a36, 0, B.y - 0.006, zc));
  for (let i = 1; i < 6; i++) parts.push(boxAt(xs * 2 - 0.04, 0.003, 0.012, 0x3e3024, 0, B.y + 0.003, B.z0 + (L * i) / 6));
  for (const y of [B.y + 0.14, B.y + 0.28]) parts.push(boxAt(xs * 2 - 0.1, 0.018, 0.012, aluDark, 0, y, zt - 0.02));
  parts.push(boxAt(xs * 2 + 0.05, 0.035, 0.05, aluDark, 0, top, zt));
  // the headboard, and the ladder guard before the cab's rear window
  const zh = B.z1 + 0.035;
  parts.push(boxAt(xs * 2 + 0.03, 0.62, 0.04, aluDark, 0, B.y + 0.31, zh));
  for (const sx of [-1, 1]) parts.push(boxAt(0.06, 1.42, 0.06, frame, sx * (xs - 0.02), B.y + 0.71, zh));
  for (const y of [B.y + 0.62, 1.84, 2.1, B.y + 1.4]) parts.push(boxAt(xs * 2 - 0.04, 0.035, 0.035, frame, 0, y, zh));
  for (let i = -3; i <= 3; i++) parts.push(boxAt(0.025, 0.78, 0.025, frame, i * 0.27, B.y + 1.0, zh));
  // under the bed: the frame rails and their cross members, the fuel tank, the battery box, the side guards
  for (const sx of [-1, 1]) parts.push(boxAt(0.08, 0.2, 5.15, frame, sx * 0.42, 0.5, -0.3));
  for (const z of [-2.6, -0.4, 0.75]) parts.push(boxAt(0.84, 0.1, 0.1, frame, 0, 0.5, z));
  parts.push(boxAt(0.3, 0.32, 0.95, 0x2c3035, 0.72, 0.42, -0.25), cylAt(0.045, 0.045, 0.05, 10, steel, 0.88, 0.6, -0.55));
  parts.push(boxAt(0.3, 0.26, 0.5, black, -0.72, 0.44, 0.1));
  for (const sx of [-1, 1]) for (const y of [0.42, 0.56]) parts.push(boxAt(0.035, 0.06, 1.62, guard, sx * 0.975, y, -0.02));
  for (const sx of [-1, 1]) for (const z of [-0.8, 0.75]) parts.push(boxAt(0.12, 0.22, 0.04, frame, sx * 0.92, 0.5, z));
  // the mudflaps behind the twin tyres, the rear lamp brackets
  for (const sx of [-1, 1]) parts.push(boxAt(0.5, 0.36, 0.015, black, sx * 0.74, 0.3, -1.88), boxAt(0.5, 0.05, 0.06, frame, sx * 0.74, 0.5, -1.88));
  // the truck mirrors: an arm off the A pillar, a tall glass and a wide-angle one below it
  for (const sx of [-1, 1]) {
    parts.push(boxAt(0.22, 0.03, 0.03, black, sx * 1.07, 1.98, 2.36), boxAt(0.03, 0.4, 0.03, black, sx * 1.17, 1.8, 2.36));
    parts.push(boxAt(0.05, 0.3, 0.2, black, sx * 1.2, 1.9, 2.34, 0, sx * 0.12), boxAt(0.05, 0.13, 0.16, black, sx * 1.2, 1.64, 2.34, 0, sx * 0.2));
    parts.push(boxAt(0.005, 0.26, 0.17, 0x8fa0ab, sx * 1.2, 1.9, 2.233, 0, sx * 0.12));
  }
  // the step under each door, the beacon's foot, the wipers on the windscreen's foot, the sun visor
  for (const sx of [-1, 1]) parts.push(boxAt(0.12, 0.04, 0.42, frame, sx * 0.93, 0.42, 1.2));
  parts.push(boxAt(0.36, 0.06, 0.24, black, 0, 2.43, 1.95));
  for (const sx of [-1, 1]) parts.push(boxAt(0.6, 0.02, 0.02, black, sx * 0.36, 1.58, 2.62, -0.5, 0, sx * 0.08));
  parts.push(boxAt(1.84, 0.04, 0.18, 0xe6e8e4, 0, 2.38, 2.42, 0.25));
  return mergeGeometries(parts);
}

function buildBioTruck() {
  const g = new THREE.Group();
  g.name = 'GreenWasteTransporter';
  const spec = TRUCK_SPEC;
  // the body: the traffic's lofted cab and platform, white, with the player's brake and indicator lights
  const bodyMat = createLoftedCarMaterial(spec, 0xf1f2ee);
  bodyMat.userData.shared = true; // (cached by js/actor-models.js: not the run's to dispose)
  const body = new THREE.Mesh(buildCarGeometry(spec, false).translate(0, 0, TRUCK_DZ), bodyMat);
  body.castShadow = true;
  g.add(body);
  const fittings = new THREE.Mesh(truckFittings(), vertexMat({ roughness: 0.5, metalness: 0.25 }));
  fittings.castShadow = true;
  g.add(fittings);
  // the door decals hug the cab's sides
  const decalMat = new THREE.MeshStandardNodeMaterial({ map: doorDecalTexture(), transparent: true, alphaTest: 0.02, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [-1, 1]) g.add(new THREE.Mesh(buildCarSidePatch(spec, side, 1.08, 2.18, 0.92, 1.44, 0.006, 12, 4).translate(0, 0, TRUCK_DZ), decalMat));
  // the amber beacon, its light going round (vehicle.pose)
  const beaconMat = new THREE.MeshStandardNodeMaterial({ color: 0xffa214, emissive: 0xff8a00, emissiveIntensity: 0.4, roughness: 0.3, transparent: true, opacity: 0.92 });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.16, 12).translate(0, 2.54, 1.95), beaconMat);
  g.add(beacon);
  // the wheels: the traffic's, scaled to the truck; twins at the back. (YXZ: the spin about the axle, then the steer)
  const wheelMat = createLoftedCarMaterial(BODY_SPECS.sedan, 0x30343a);
  wheelMat.userData.shared = true;
  const R = spec.wheelRadius, scale = R / BODY_SPECS.sedan.wheelRadius, wheels = [];
  for (const side of [-1, 1]) {
    const geo = buildSteerableWheelGeo(BODY_SPECS.sedan, side);
    for (const [z, x] of [[spec.wheelZ, spec.wheelX], [-spec.wheelZ, spec.wheelX], [-spec.wheelZ, spec.wheelX - 0.27]]) {
      const w = new THREE.Mesh(geo, wheelMat);
      w.scale.setScalar(scale);
      w.rotation.order = 'YXZ';
      w.position.set(side * x, R, z + TRUCK_DZ);
      w.castShadow = true;
      g.add(w);
      wheels.push({ mesh: w, r: R, front: z > 0 });
    }
  }
  let spin = 0;
  return {
    group: g, wheels,
    drive: { speed: 13.5, reverseSpeed: 3.5, acceleration: 2.1, powerSpeed: 7, rolling: 0.25, drag: 0.0009, coast: 0.6, brake: 6.5, wheelbase: 2 * spec.wheelZ, grip: 7, cornering: 5.4 },
    dims: { halfW: 1.05, halfL: 2.75, top: 2.6, mass: 6500 }, chase: [9.5, 4.3], label: 'Open transporter',
    // (the player car's brake, indicator and reverse lights on the body; the beacon's flash)
    pose(group, car, dt) {
      const s = car.carState?.value, lit = bodyMat.userData.carState?.value;
      if (s && lit) lit.copy(s);
      spin += dt * 7;
      beaconMat.emissiveIntensity = 0.35 + 2.4 * Math.max(0, Math.sin(spin)) ** 6;
    }
  };
}
VEHICLES.bioTruck = buildBioTruck;

/** A round barrel, its foot at y 0: the drum with its hoops; `top`: what is seen in its open mouth */
function barrelGeometry(top) {
  const { r, h } = BIO_BARREL, body = 0x2f7f3a, hoop = 0x245f2c;
  return mergeGeometries([
    cylAt(r, r * 0.92, h, 14, body, 0, h / 2, 0),
    cylAt(r + 0.015, r + 0.015, 0.05, 14, hoop, 0, h * 0.35, 0), cylAt(r + 0.015, r + 0.015, 0.05, 14, hoop, 0, h * 0.72, 0),
    cylAt(r * 0.94, r * 0.94, 0.02, 14, top, 0, h - 0.04, 0)
  ]);
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#2f6b2f'; x.fillRect(0, 0, 512, 160);
  x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(8, 8, 496, 144);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '800 46px system-ui, sans-serif'; x.fillText(t('Biogas plant'), 256, 56);
  x.font = '600 32px system-ui, sans-serif'; x.fillText('Duchli Ranch', 256, 110);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The hopper at the plant's position, the two digesters behind it, a gas pipe with its flare, the sign */
function buildPlant(run) {
  const H = BIO_HOPPER, y0 = carGround(run, H.x, H.z);
  const concrete = 0x9a9a92, dark = 0x1d2315, mash = 0x4a5a22, roof = 0x3e6b34;
  const hopper = [
    boxAt(H.halfW * 2 + 0.5, 1.5, 0.25, concrete, 0, 0.75, H.halfL + 0.12), boxAt(H.halfW * 2 + 0.5, 1.5, 0.25, concrete, 0, 0.75, -H.halfL - 0.12),
    boxAt(0.25, 1.5, H.halfL * 2, concrete, H.halfW + 0.12, 0.75, 0), boxAt(0.25, 1.5, H.halfL * 2, concrete, -H.halfW - 0.12, 0.75, 0),
    boxAt(H.halfW * 2, 0.1, H.halfL * 2, dark, 0, 0.5, 0), boxAt(H.halfW * 1.6, 0.14, H.halfL * 1.5, mash, 0.2, 0.62, -0.1),
    boxAt(0.4, 2.3, 0.4, 0x8c9298, H.halfW + 0.6, 1.15, 0) // the auger's drive
  ].map((g) => g.rotateY(H.heading).translate(H.x, y0, H.z));
  const parts = [...hopper];
  for (const d of BIO_DIGESTERS) {
    const y = carGround(run, d.x, d.z);
    parts.push(cylAt(d.r, d.r, d.h, 24, 0xb5b0a2, d.x, y + d.h / 2, d.z));
    parts.push(painted(new THREE.SphereGeometry(d.r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1), roof).translate(d.x, y + d.h, d.z));
  }
  // the pipe from the hopper to the first digester, the flare
  const [a] = BIO_DIGESTERS;
  const dx = a.x - H.x, dz = a.z - H.z, L = Math.hypot(dx, dz);
  parts.push(boxAt(0.22, 0.22, L, 0x6d7276, (a.x + H.x) / 2, y0 + 1.9, (a.z + H.z) / 2, 0, Math.atan2(dx, dz)));
  const fx = a.x + 13, fz = a.z - 8, fy = carGround(run, fx, fz);
  parts.push(cylAt(0.12, 0.16, 6, 8, 0x6d7276, fx, fy + 3, fz));
  const mesh = new THREE.Mesh(mergeGeometries(parts), vertexMat({ roughness: 0.82 }));
  mesh.name = 'BiogasPlant';
  mesh.castShadow = mesh.receiveShadow = true;
  run.group.add(mesh);
  // the sign, on two posts by the Duchliweg
  const sx = H.x + 6.5, sz = H.z + 2.5, sy = carGround(run, sx, sz);
  const posts = new THREE.Mesh(mergeGeometries([cylAt(0.05, 0.05, 2, 6, 0x777a7c, -0.8, 1, 0), cylAt(0.05, 0.05, 2, 6, 0x777a7c, 0.8, 1, 0)]), vertexMat());
  posts.position.set(sx, sy, sz);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), new THREE.MeshStandardNodeMaterial({ map: signTexture(), roughness: 0.6, side: THREE.DoubleSide }));
  sign.position.set(sx, sy + 2.1, sz);
  const yaw = H.heading - Math.PI / 2;
  posts.rotation.y = yaw; sign.rotation.y = yaw;
  run.group.add(posts, sign);
}

/** The load gauge: two rows in the mission panel, the truck's load and what the village thinks of it */
function buildGauge(run) {
  const row = (label) => {
    const r = document.createElement('div');
    Object.assign(r.style, { display: 'flex', alignItems: 'center', gap: '8px', font: '600 12px/1.3 system-ui, sans-serif', marginTop: '4px' });
    const l = document.createElement('span');
    l.textContent = label;
    l.style.minWidth = '42px';
    const bar = document.createElement('div');
    Object.assign(bar.style, { flex: '1', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.18)', overflow: 'hidden' });
    const fill = document.createElement('span');
    Object.assign(fill.style, { display: 'block', height: '100%', width: '100%', transformOrigin: 'left', transform: 'scaleX(0)', background: '#7fb539' });
    bar.append(fill);
    r.append(l, bar);
    return { r, fill };
  };
  const load = row('Load'), smell = row('Smell');
  smell.fill.style.background = '#a7a83a';
  const box = document.createElement('div');
  box.append(load.r, smell.r);
  run.ui.panel.insertBefore(box, run.ui.hint);
  return { load: load.fill, smell: smell.fill, shown: -1 };
}

/** A mission's way on the radar and the full map (js/nyc-map.js overlays): the line, and its places from `points()`
 *  ({ x, z, label, done, next, square }: those done left out, the next ringed, square: a depot or a finish) */
function addRouteOverlay(run, route, points, hex) {
  const map = run.hooks.mapSystem;
  if (!map) return;
  const overlay = {
    draw(ctx, v, mini) {
      if (!run.state) return;
      ctx.save();
      ctx.lineJoin = ctx.lineCap = 'round';
      const path = () => {
        ctx.beginPath();
        for (let i = 0; i < route.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](v.toX(route[i]), v.toY(route[i + 1]));
      };
      path(); ctx.strokeStyle = 'rgba(10, 14, 8, 0.75)'; ctx.lineWidth = mini ? 5 : 6.5; ctx.stroke();
      path(); ctx.strokeStyle = hex; ctx.lineWidth = mini ? 2.6 : 3.4; ctx.stroke();
      const r = mini ? 3.4 : 5, label = !mini && v.s >= 0.4;
      ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const p of points()) {
        if (p.done) continue;
        const x = v.toX(p.x), y = v.toY(p.z);
        if (Math.abs(x) > v.w * 0.5 + 20 || Math.abs(y) > v.h * 0.5 + 20) continue;
        ctx.fillStyle = p.square ? '#ffffff' : hex; ctx.strokeStyle = 'rgba(10, 14, 8, 0.9)'; ctx.lineWidth = 1.6;
        if (p.square) { ctx.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4); ctx.strokeRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4); }
        else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        if (p.next) { ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.strokeStyle = '#3fd6ff'; ctx.lineWidth = 2.5; ctx.stroke(); }
        if (label || (p.next && !mini)) {
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8, 12, 20, 0.85)'; ctx.fillStyle = '#fff';
          ctx.strokeText(p.label, x, y + r + 3); ctx.fillText(p.label, x, y + r + 3);
        }
      }
      ctx.restore();
    }
  };
  (map.overlays ||= []).push(overlay);
  run.cleanups.push(() => { const i = map.overlays.indexOf(overlay); if (i >= 0) map.overlays.splice(i, 1); });
}

const SMELLS = [[0.3, 'The flies have found you'], [0.6, 'Cyclists overtake you holding their noses'], [0.9, 'Even the cows look the other way']];
const TAIL = 3; // m from the truck's centre to behind its bed: where the stink trails
const _a = new THREE.Vector3(), _e = new THREE.Euler();

const bioRound = {
  setup(run) {
    buildPlant(run);
    // (the way, the hotels' barrels still to fetch, the plant)
    addRouteOverlay(run, BIO_ROUTE, () => [
      ...run.state.stops.map((s) => ({ x: s.x, z: s.z, label: s.name, done: s.done, next: false })),
      { x: BIO_PLANT.x, z: BIO_PLANT.z, label: t('Biogas plant'), square: true }
    ], '#8fd14f');
    const stops = run.def.createState().stops, n = stops.length, H = BIO_BARREL.h;
    const shared = vertexMat({ roughness: 0.55 });
    // the barrels: the full ones (standing, on their way up and on the bed), the empties (set down at the stops, back on
    // the bed after the hopper); the plastic sticking out of the two bad ones. Three instanced meshes, one material
    const full = new THREE.InstancedMesh(barrelGeometry(0x5c6b28), shared, n);
    const empty = new THREE.InstancedMesh(barrelGeometry(0x14170f), shared, n * 2);
    const plasticGeo = mergeGeometries([
      painted(new THREE.IcosahedronGeometry(0.2, 1), 0xf4f6f8).scale(1.1, 0.8, 1).translate(0.05, H + 0.1, 0.05),
      painted(new THREE.IcosahedronGeometry(0.15, 1), 0x2a7fd6).scale(1, 0.9, 1.1).translate(-0.12, H + 0.14, -0.08),
      boxAt(0.3, 0.03, 0.22, 0xf4f6f8, 0.08, H - 0.02, 0.3, 0.6)
    ]);
    const plastic = new THREE.InstancedMesh(plasticGeo, shared, n);
    for (const m of [full, empty, plastic]) { m.frustumCulled = false; m.castShadow = true; run.group.add(run.storage(m)); }
    const rest = stops.map((s) => ({ x: s.x, y: carGround(run, s.x, s.z), z: s.z, yaw: s.heading }));
    // one of the crew: beside the barrel being lifted, and at the hopper
    const crew = createHelper();
    crew.visible = false;
    run.group.add(run.storage(crew));
    const toast = createToast(run);
    run.bio = { full, empty, plastic, rest, crew, toast, gauge: buildGauge(run), truck: null, stink: 0, flies: 0, smell: 0, lump: 0, loaded: 0, slotOf: new Map() };
    // (a tap: the big touch button, the gamepad's A, the key bar's Space; the jump button goes)
    run.button('up', null);
    run.actions([{ id: 'reject', primary: true, label: 'Reject', icon: 'i-close', keys: ['Space', 'KeyE'], kbd: ['Space'], keyboard: false, pad: 'a', run: () => bioRound.reject(run) }]);
  },
  reset(run) {
    const b = run.bio;
    b.smell = 0; b.truck = null; b.loaded = 0; b.slotOf.clear(); b.gauge.shown = -1;
    b.toast.hide();
  },
  key(run, e) {
    if (e.code !== 'Space' && e.code !== 'KeyE') return;
    if (run.phase === 'intro') return;
    e.preventDefault();
    e.stopImmediatePropagation(); // (no jump, no indicator)
    if (!e.repeat) bioRound.reject(run);
  },
  reject(run) {
    const b = run.bio, st = run.state, toast = b.toast;
    if (run.index !== 0 || !b.truck || !(run.phase === 'ready' || run.phase === 'running')) return;
    if (!stopAtBed(st, b.truck)) { toast.show('Stop with the load bed beside a barrel first', '#ffd76a', 1.2); return; }
    const r = rejectBarrel(st, b.truck);
    if (r === 'rejected') toast.show('Plastic! The barrel stays behind', '#c8f7a0', 1.6);
    else if (r === 'wrong') toast.show(`That one was clean: ${BIO.points.wrongReject} pts`, '#ff8f80', 1.6);
  },
  update(run, ctx, dt, cm) {
    const b = run.bio, st = run.state, car = cm.entities.car, toast = b.toast;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    b.truck = { x: car.position.x, z: car.position.z, heading: car.heading, speed: car.speed || 0 };
    const live = run.phase === 'ready' || run.phase === 'running';
    if (live && ctx.mode === 'car' && run.index === 0 && stepBioStops(st, b.truck, dt) === 'loaded') toast.show(`Barrel up: ${st.collected} on the bed`, '#c8f7a0', 1.2);
    if (st.justSpoiled) { st.justSpoiled = false; toast.show('Plastic in the load! The batch is spoiled', '#ff8f80', 2.4); run.audio?.thump?.(); }
    const load = bioLoad(st);
    // the gauge follows the barrels on the bed, and the village has its say
    const g = b.gauge, shown = Math.round(load * 100);
    if (shown !== g.shown) {
      g.shown = shown;
      g.load.style.transform = `scaleX(${load})`;
      g.smell.style.transform = `scaleX(${Math.min(1, load * 1.15 + (st.spoiled ? 0.15 : 0))})`;
    }
    if (run.index === 0 && !st.loading && b.smell < SMELLS.length && load >= SMELLS[b.smell][0]) toast.show(SMELLS[b.smell++][1], '#dfe6a0', 2.2);
    toast.update(dt);
    // the stink cloud behind the truck and the flies round its load
    const pb = particles(run);
    b.stink += dt * (load > 0 ? 4 + load * 9 : 0);
    while (b.stink >= 1) {
      b.stink--;
      pb.spawn({ x: car.position.x - fx * TAIL + (Math.random() - 0.5) * 1.6, y: car.position.y + 1.4 + Math.random(), z: car.position.z - fz * TAIL + (Math.random() - 0.5) * 1.6, vx: fx * car.speed * 0.25 + (Math.random() - 0.5) * 0.5, vy: 0.35, vz: fz * car.speed * 0.25 + (Math.random() - 0.5) * 0.5, life: 2 + Math.random() * 1.4, size0: 0.8, size1: 2.6 + load * 1.4, alpha: 0.07 + load * 0.09, r: 0.5, g: 0.56, b: 0.18, kind: 'smoke' });
    }
    b.flies += dt * (load > 0 ? 8 + load * 34 : 0);
    while (b.flies >= 1) {
      b.flies--;
      const a = Math.random() * Math.PI * 2, r = 0.7 + Math.random() * 1.2, along = BIO_BED.z0 + Math.random() * (BIO_BED.z1 - BIO_BED.z0);
      pb.spawn({ x: car.position.x + fx * along + Math.cos(a) * r, y: car.position.y + 1.2 + Math.random() * 1.8, z: car.position.z + fz * along + Math.sin(a) * r, vx: fx * car.speed + (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 2, vz: fz * car.speed + (Math.random() - 0.5) * 3, life: 0.5 + Math.random() * 0.4, size0: 0.07, size1: 0.07, alpha: 1, r: 0.02, g: 0.02, b: 0.02, kind: 'smoke' });
    }
    // the mash going down into the hopper
    if (run.index === 1 && st.atPlant && Math.abs(car.speed) < BIO.stopSpeed && st.unloaded < 1 && b.loaded) {
      b.lump += dt * 22;
      const a = { x: BIO_PLANT.x + (car.position.x - BIO_PLANT.x) * 0.3, y: car.position.y + 2.1, z: BIO_PLANT.z + (car.position.z - BIO_PLANT.z) * 0.3 };
      while (b.lump >= 1) { b.lump--; lump(pb, a, { x: BIO_PLANT.x + (Math.random() - 0.5) * 2, y: car.position.y + 0.7, z: BIO_PLANT.z + (Math.random() - 0.5) * 2 }, 0.5, { size: 0.22, grow: 0.15, r: 0.26, g: 0.36, bl: 0.1, alpha: 1 }); }
    }
    run.workParticles?.update(dt, ctx.camera);
  },
  /** The barrels' places, after the truck has been posed for this frame (those on the bed ride with it) */
  after(run, ctx, dt, cm) {
    const b = run.bio, st = run.state, v = run.vehicle, stops = st.stops, n = stops.length;
    const car = cm.entities.car, frame = v.group.matrixWorld;
    const put = (mesh, i, x, y, z, yaw, tilt = 0) => {
      _e.set(tilt, yaw, 0, 'YXZ');
      mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(1, 1, 1)));
    };
    const onBed = (slot) => _a.set(...BIO_BED_SLOTS[slot]).applyMatrix4(frame);
    let crewAt = null;
    stops.forEach((s, i) => {
      const r = b.rest[i];
      let shown = null; // [x, y, z, yaw, tilt] of the full barrel
      let groundEmpty = false, bedEmpty = null;
      if (s.rejected) shown = [r.x, r.y, r.z, r.yaw, 0];
      else if (!s.done) {
        const k = Math.min(1, (s.t || 0) / BIO.loadS);
        if (k <= 0) shown = [r.x, r.y, r.z, r.yaw, 0];
        else {
          // up from the side: an arc from where it stands onto its place on the bed
          const w = onBed(Math.min(b.loaded, BIO_BED_SLOTS.length - 1));
          const e = k * k * (3 - 2 * k);
          shown = [r.x + (w.x - r.x) * e, r.y + (w.y - r.y) * e + Math.sin(Math.PI * k) * 0.8, r.z + (w.z - r.z) * e, r.yaw + (car.heading - r.yaw) * e, 0];
          crewAt = r;
        }
      } else {
        groundEmpty = true; // (an empty set down in its place)
        if (!b.slotOf.has(i)) b.slotOf.set(i, Math.min(b.loaded++, BIO_BED_SLOTS.length - 1));
        const slot = b.slotOf.get(i), w = onBed(slot);
        // at the hopper one barrel after the other, the top ones first: tipped in, and back on the bed as an empty
        const order = b.loaded - 1 - slot, k = Math.max(0, Math.min(1, (st.unloaded || 0) * b.loaded - order));
        if (k <= 0) shown = [w.x, w.y, w.z, car.heading, 0];
        else if (k >= 1) bedEmpty = [w.x, w.y, w.z, car.heading];
        else {
          const e = Math.sin(Math.PI * k);
          shown = [w.x + (BIO_PLANT.x - w.x) * e * 0.7, w.y + e * 1.0, w.z + (BIO_PLANT.z - w.z) * e * 0.7, car.heading, e * 2.3];
        }
      }
      if (shown) put(b.full, i, ...shown); else b.full.setMatrixAt(i, ZERO);
      if (s.plastic && shown) put(b.plastic, i, ...shown); else b.plastic.setMatrixAt(i, ZERO);
      if (groundEmpty) put(b.empty, i, r.x, r.y, r.z, r.yaw); else b.empty.setMatrixAt(i, ZERO);
      if (bedEmpty) put(b.empty, n + i, ...bedEmpty); else b.empty.setMatrixAt(n + i, ZERO);
    });
    for (const m of [b.full, b.empty, b.plastic]) m.instanceMatrix.needsUpdate = true;
    // the crew's man
    const c = b.crew;
    if (crewAt) { c.visible = true; c.position.set(crewAt.x + 0.5, crewAt.y - 0.1, crewAt.z + 0.5); c.rotation.y = crewAt.yaw; }
    else if (run.index === 1 && st.atPlant && st.unloaded < 1) { c.visible = true; c.position.set(BIO_PLANT.x + 3.4, car.position.y - 0.1, BIO_PLANT.z + 1.6); c.rotation.y = 0; }
    else c.visible = false;
  }
};

export const RURAL_FEATURES = { quadCourse, bioRound };
