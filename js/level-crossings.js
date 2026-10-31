import * as THREE from 'three/webgpu';
import { attribute, float, fract, mix, positionGeometry, smoothstep, step, uniform, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEVEL_CROSSINGS } from './level-crossings-data.js';
import { groundHeight, drapeOverlay } from './terrain.js';

// The level crossings of the RhB line (js/level-crossings-data.js, tools/fetch-level-crossings.mjs: OSM). Swiss
// practice (SSV Art. 93): crossings with barriers carry a road signal of two red lights side by side that flash
// alternately (Wechselblinklicht) on a black board, on a post at the right of each approach, with red-and-white
// barrier booms (half barriers close the approach lane, full barriers the whole road); crossings without barriers or
// lights — footpaths, farm tracks — are marked with the St Andrew's cross (white, red border). At road crossings the
// carriageway between the stop lines is laid with dark rubber panels, the rails flush.
// When an RhB train (js/rhb.js) approaches — about 25 s or 250 m out — the lights start, the booms come down after a
// few seconds, and they rise again once the last car has cleared the road. While closed, a body across each
// approach (pushed to trafficSystem's tram bodies) makes the traffic stop in front of the boom.

const SIDE = 3.4;           // posts and booms: metres either side of the track along the road
const STOP_LINE = 5.6;      // stop lines
const PANEL = 2.6;          // rubber panels reach this far either side of the track
const TRAIN_LENGTH = 78;    // a Capricorn unit and a little
const PRE_LIGHT = 4;        // s of flashing before the booms move
const LOWER = 6, RAISE = 5; // s for the booms to come down / go up
const CLEAR = 3;            // s after the train has cleared before they rise

// --- Materials ----------------------------------------------------------------------------------------------------------
function stripedBoomMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.1 });
  // Red and white bands 0.5 m long along the boom (+x from the pivot)
  // (all the booms are one instanced unit-length bar, stretched to each boom's length `aBoomLength`)
  const band = step(0.5, fract(positionGeometry.x.mul(attribute('aBoomLength', 'float')).div(1.0)));
  m.colorNode = mix(vec3(0.75, 0.02, 0.02), vec3(0.85, 0.85, 0.85), band);
  return m;
}

function lampMaterial(on) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0 });
  m.colorNode = mix(vec3(0.12, 0.01, 0.01), vec3(1, 0.1, 0.05), on);
  m.emissiveNode = vec3(1, 0.08, 0.03).mul(on).mul(6);
  return m;
}

function saltireMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 });
  // White arms with a red border: the border is the outer 18% across the arm (geometry y in [-0.5, 0.5])
  const border = smoothstep(0.30, 0.33, positionGeometry.y.abs());
  m.colorNode = mix(vec3(0.85, 0.85, 0.85), vec3(0.75, 0.02, 0.02), border);
  return m;
}

// --- Geometry --------------------------------------------------------------------------------------------------------------
// A strip on the ground from a to b (world x, z), `width` wide, draped on the terrain `lift` metres up
function groundStrip(ax, az, bx, bz, width, lift) {
  const L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L * width / 2, nz = (bx - ax) / L * width / 2;
  const p = [[ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz], [ax + nx, az + nz]];
  const g = new THREE.BufferGeometry();
  // (counter-clockwise from above: facing up)
  const tri = [0, 2, 1, 0, 3, 2];
  g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap((i) => [p[i][0], 0, p[i][1]]), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(tri.flatMap(() => [0, 1, 0]), 3));
  const out = drapeOverlay(g, { maxEdge: 2, lift });
  g.dispose();
  return out;
}

export function buildLevelCrossings(scene, rhb) {
  const group = new THREE.Group();
  group.name = 'LevelCrossings';
  group.userData.terrain = 'absolute';
  scene.add(group);
  const list = LEVEL_CROSSINGS?.crossings || [];
  const bodies = [];
  if (!list.length) return { group, bodies, update() {} };

  const phase = uniform(0); // the flasher: 0/1 alternating, shared
  const postMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x8b8f93, roughness: 0.5, metalness: 0.6 });
  const boardMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x0b0b0c, roughness: 0.6, metalness: 0.1 });
  const boomMaterial = stripedBoomMaterial();
  const saltire = saltireMaterial();
  const panelMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x1c1c1e, roughness: 0.95, metalness: 0 });
  const lineMaterial = new THREE.MeshStandardNodeMaterial({ color: 0xe8e8e8, roughness: 0.7, metalness: 0 });
  // All the lamps in one mesh: per vertex `aLamp` = (which half of the flash cycle, its crossing active)
  const aLamp = attribute('aLamp', 'vec2');
  const lampsMaterial = lampMaterial(mix(phase, float(1).sub(phase), aLamp.x).mul(aLamp.y));
  const staticParts = new Map([[postMaterial, []], [boardMaterial, []], [saltire, []], [panelMaterial, []], [lineMaterial, []], [lampsMaterial, []]]);
  const add = (material, g) => staticParts.get(material).push(g.index ? g.toNonIndexed() : g);
  let lampVertices = 0;
  const booms = [];
  const headMatrix = new THREE.Matrix4(), partMatrix = new THREE.Matrix4(), headQ = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0), unit = new THREE.Vector3(1, 1, 1);

  const crossings = [];
  for (const c of list) {
    const road = { x: c.dx, z: c.dz }, right = { x: -c.dz, z: c.dx };
    const w = c.width, half = w / 2;
    const at = (along, across) => ({ x: c.x + road.x * along + right.x * across, z: c.z + road.z * along + right.z * across });
    const yaw = Math.atan2(road.x, road.z); // facing along the road
    const state = { c, active: 0, lamps: [lampVertices, 0], closed: 0, timer: 0, booms: [], bodies: [], wasNear: false, release: 0 };
    const signals = !c.foot && (c.light || c.barrier !== 'no');

    // Road surface: rubber panels over the rails, white stop lines on each approach
    if (!c.foot) {
      const a = at(-PANEL, 0), b = at(PANEL, 0);
      add(panelMaterial, groundStrip(a.x, a.z, b.x, b.z, w, 0.14));
      if (signals) for (const side of [-1, 1]) {
        // The stop line across the approach lane (the right half of the road for traffic coming from that side)
        const l0 = at(side * STOP_LINE, side < 0 ? 0 : -half), l1 = at(side * STOP_LINE, side < 0 ? half : 0);
        add(lineMaterial, groundStrip(l0.x, l0.z, l1.x, l1.z, 0.4, 0.15));
      }
    }

    // Posts at the right of each approach: the signal board with its two lamps, the boom; or the St Andrew's cross
    for (const side of [-1, 1]) {
      // Approaching from side -1 the traffic heads +road and keeps right (+right); from +1 it heads -road (-right)
      const across = side < 0 ? half + 0.7 : -(half + 0.7);
      const p = at(side * SIDE, across), y = groundHeight(p.x, p.z);
      const face = side < 0 ? yaw + Math.PI : yaw; // the board faces the approaching traffic
      const post = new THREE.CylinderGeometry(0.06, 0.07, 2.9, 8).translate(0, 1.45, 0);
      add(postMaterial, post.applyMatrix4(new THREE.Matrix4().makeTranslation(p.x, y, p.z)));
      if (signals) {
        // The signal head (static: merged into the shared meshes in place)
        headMatrix.compose(new THREE.Vector3(p.x, y + 2.35, p.z), headQ.setFromAxisAngle(yAxis, face), unit);
        const place = (g, x, y0, z) => g.applyMatrix4(partMatrix.makeTranslation(x, y0, z).premultiply(headMatrix));
        add(boardMaterial, place(new THREE.BoxGeometry(0.95, 0.5, 0.06), 0, 0, 0));
        // The two lamps with their hoods, alternating
        for (const [lx, second] of [[-0.24, 0], [0.24, 1]]) {
          const lamp = place(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16).rotateX(Math.PI / 2), lx, 0, 0.05).toNonIndexed();
          const n = lamp.attributes.position.count;
          lamp.setAttribute('aLamp', new THREE.Float32BufferAttribute(new Float32Array(n * 2).map((_, k) => (k % 2 ? 0 : second)), 2));
          add(lampsMaterial, lamp);
          lampVertices += n;
          state.lamps[1] += n;
          add(boardMaterial, place(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), lx, 0.02, 0.11));
        }
        // A white board with "Achtung Bahn"-style border under the lights is left out; the cross marks unprotected ones
      } else {
        // St Andrew's cross: two arms 1.2 m long, 0.2 m wide, crossing at 2.2 m
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
          const arm = new THREE.BoxGeometry(1.2, 0.2, 0.03);
          arm.rotateZ(a);
          arm.applyMatrix4(new THREE.Matrix4().makeRotationY(face)).translate(p.x, y + 2.2, p.z);
          add(saltire, arm);
        }
      }
      if (c.barrier !== 'no' && !c.foot) {
        // The boom pivots at the post, across the road towards its centre (half barrier: to the centre line; full:
        // across all of it)
        const len = (c.barrier === 'full' ? w : half) + 0.4;
        const pivot = new THREE.Object3D();
        pivot.position.set(p.x, y + 1.0, p.z);
        // local +x points across the road, from the post towards the centre
        const dirX = side < 0 ? -right.x : right.x, dirZ = side < 0 ? -right.z : right.z;
        pivot.rotation.y = Math.atan2(-dirZ, dirX);
        pivot.updateMatrix();
        // (an instance of the shared boom & counterweight meshes, placed below)
        const boom = { index: booms.length, pivot: pivot.matrix, len, angle: NaN };
        booms.push(boom);
        state.booms.push(boom);
      }
      if (signals) {
        // The body that stops the traffic of this approach in front of the stop line (parked far away while open)
        const s = at(side * (STOP_LINE - 0.6), side < 0 ? half / 2 : -half / 2);
        const body = { x: 1e7, z: 1e7, prevX: 1e7, prevZ: 1e7, y: groundHeight(s.x, s.z), sin: Math.sin(yaw), cos: Math.cos(yaw),
          halfW: half / 2 + 0.3, halfL: 0.3, mass: 1e6, vx: 0, vz: 0, angularVel: 0, tram: true, home: s };
        bodies.push(body);
        state.bodies.push(body);
      }
    }
    if (signals || state.booms.length) crossings.push(state);
  }
  // The booms (all of them: two draws), their counterweight on the other side of the pivot
  let boomBars = null, boomWeights = null;
  const rotZ = new THREE.Matrix4(), stretch = new THREE.Matrix4(), boomMatrix = new THREE.Matrix4();
  const setBoom = (boom, angle) => {
    boom.angle = angle;
    boomMatrix.multiplyMatrices(boom.pivot, rotZ.makeRotationZ(angle));
    boomWeights.setMatrixAt(boom.index, boomMatrix);
    boomBars.setMatrixAt(boom.index, boomMatrix.multiply(stretch.makeScale(boom.len, 1, 1)));
    boomBars.instanceMatrix.needsUpdate = boomWeights.instanceMatrix.needsUpdate = true;
  };
  if (booms.length) {
    const bar = new THREE.BoxGeometry(1, 0.09, 0.09).translate(0.5, 0, 0);
    bar.setAttribute('aBoomLength', new THREE.InstancedBufferAttribute(new Float32Array(booms.map((b) => b.len)), 1));
    boomBars = new THREE.InstancedMesh(bar, boomMaterial, booms.length);
    boomWeights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.22, 0.2).translate(-0.25, 0, 0), postMaterial, booms.length);
    boomBars.name = 'Level crossing booms';
    boomWeights.name = 'Level crossing counterweights';
    boomBars.castShadow = true;
    for (const boom of booms) setBoom(boom, Math.PI / 2 * 0.98); // up
    for (const mesh of [boomBars, boomWeights]) {
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += 12; // (as they swing)
      group.add(mesh);
    }
  }

  let lampAttribute = null;
  for (const [material, parts] of staticParts) {
    if (!parts.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), material);
    mesh.receiveShadow = material !== lampsMaterial;
    mesh.castShadow = material !== panelMaterial && material !== lineMaterial && material !== lampsMaterial;
    if (material === lampsMaterial) lampAttribute = mesh.geometry.attributes.aLamp;
    group.add(mesh);
  }

  // A train is near a crossing while its front is within ~25 s / 250 m before it, or any of it is still on it
  function trainNear(c) {
    for (const t of rhb?.trains || []) {
      if (t.off > 0) continue;
      const sc = c[t.dir];
      if (!Number.isFinite(sc)) continue;
      const ahead = sc - t.s;
      if (ahead < Math.max(250, t.speed * 25) && ahead > -(TRAIN_LENGTH + 6)) return true;
    }
    return false;
  }

  let time = 0;
  function update(dt) {
    time += dt;
    phase.value = Math.floor(time * 1.6) % 2; // about 50 flashes a minute per lamp
    for (const st of crossings) {
      const near = trainNear(st.c);
      if (near) { st.release = CLEAR; st.timer += dt; } else if (st.timer > 0) {
        st.release -= dt;
        if (st.release <= 0) st.timer = Math.min(st.timer, PRE_LIGHT + LOWER) - dt * (LOWER / RAISE);
      }
      if (st.timer < 0) st.timer = 0;
      // 0: up … 1: down
      const down = Math.max(0, Math.min(1, (st.timer - PRE_LIGHT) / LOWER));
      // (instances of the shared boom meshes: only a moving boom rewrites its matrices)
      const angle = Math.PI / 2 * 0.98 * (1 - down);
      for (const boom of st.booms) if (boom.angle !== angle) setBoom(boom, angle);
      const active = st.timer > 0 ? 1 : 0;
      if (active !== st.active && lampAttribute) {
        st.active = active;
        for (let v = st.lamps[0]; v < st.lamps[0] + st.lamps[1]; v++) lampAttribute.array[v * 2 + 1] = active;
        lampAttribute.needsUpdate = true;
      }
      const closed = st.timer > 0.5;
      for (const b of st.bodies) {
        b.prevX = b.x; b.prevZ = b.z;
        if (closed) { b.x = b.home.x; b.z = b.home.z; } else { b.x = 1e7; b.z = 1e7; }
      }
    }
  }

  group.userData.stats = { crossings: list.length, signalled: crossings.length, bodies: bodies.length };
  return { group, bodies, update, crossings };
}
