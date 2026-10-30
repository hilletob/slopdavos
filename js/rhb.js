import * as THREE from 'three/webgpu';
import { float, mix, normalGeometry, positionGeometry, smoothstep, step, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { surfaceHeight, groundHeight, deckHeight } from './terrain.js';
import { buildLine, routePoint, project } from './rhb-route.js';
import { vehicleContact, resolveVehicleContact, sweptVehicleContact } from './vehicle-physics.js';

// The Rhaetian Railway through Davos (js/rhb-route.js): red four-car RhB multiple units, in the spirit of the ABe 4/16
// "Capricorn" that has run Landquart – Davos since 2022, ply the single-track line Wolfgang – Davos Dorf –
// Kongress/Eisstadion – Davos Platz – Frauenkirch and back, stopping at every station. The line is cut into blocks
// between the stations with a passing loop (Dorf, Platz, Frauenkirch) and the ends of the map; a train enters a block
// only when no other train holds it, so opposing trains wait for each other and cross on the loops, each on its own
// track. Beyond the map's edge a train turns back after a while. Every car is a solid body: the player bounces off it,
// and the traffic (traffic.js) brakes behind it. (No freely licensed model of the real units exists: the cars are built
// here from an extruded body profile, the end cars with a raked nose.)
// The player can take over one train (the "RhB" mode, takeOver): no steering, bound to the rails, the throttle and the
// brake are the player's, but the train protection is not: it reserves the next block in good time and, when it cannot,
// brakes the train to a stop at the passing loop until the opposing train is through. At the edge of the map the driver
// changes ends and the train goes back.

const END = 19.6, MID = 18.4, GAP = 0.5;
// The cars from the front: an end car, two intermediate cars (pantograph on the first), the other end car turned round
const CARS = [{ len: END, end: true, flip: false }, { len: MID, end: false }, { len: MID, end: false }, { len: END, end: true, flip: true }];
const WIDTH = 2.65, HALF_WIDTH = WIDTH / 2, MASS = 4e4;
const MAX_SPEED = 16.7, ACCEL = 0.55, BRAKE = 0.7, DWELL = [35, 55], TURN = [60, 120]; // 60 km/h; seconds
const TRAIN_LENGTH = CARS.reduce((a, c) => a + c.len + GAP, 0);
const TRAINS = 2;

// --- Rolling stock -----------------------------------------------------------------------------------------------------------
// A car body along +z (centred), floor 0.42 m and roof 3.72 m above the rails: the cross-section is extruded, with
// slightly sloping sides under the roof's shoulders. An end car's front (+z) is raked back and narrowed over 3.4 m into
// the nose; an intermediate car may carry a pantograph.
function carGeometry(length, { nose = false, pantograph = false } = {}) {
  const profile = [[-1.2, 0.42], [1.2, 0.42], [HALF_WIDTH, 0.78], [HALF_WIDTH, 2.95], [1.17, 3.5], [0.7, 3.72], [-0.7, 3.72], [-1.17, 3.5], [-HALF_WIDTH, 2.95], [-HALF_WIDTH, 0.78]];
  const shape = new THREE.Shape();
  shape.moveTo(...profile[0]);
  for (const p of profile.slice(1)) shape.lineTo(...p);
  shape.closePath();
  let g = new THREE.ExtrudeGeometry(shape, { depth: length, steps: Math.ceil(length / 0.7), bevelEnabled: false });
  g.clearGroups();
  g.translate(0, 0, -length / 2);
  if (nose) {
    const pos = g.attributes.position, N = 3.4;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const u = Math.min(1, Math.max(0, (z - (length / 2 - N)) / N)), t = u * u * (3 - 2 * u);
      if (t <= 0) continue;
      const up = Math.max(0, y - 1.1);
      pos.setXYZ(i, x * (1 - 0.1 * t * (up / 2.6)), y - 0.3 * t * t * up, z - 1.35 * t * (up / 2.6));
    }
  }
  g.computeVertexNormals();
  if (pantograph) {
    // Base frame, arms and the collector bow, raised against the contact wire (CONTACT_WIRE above the rails)
    const parts = [[1.6, 0.18, 2.2, 0, 3.82, 0], [0.08, 0.08, 2.0, -0.5, 4.25, 0.2], [0.08, 0.08, 2.0, 0.5, 4.25, 0.2], [1.9, 0.06, 0.12, 0, 4.72, 0.9]];
    const boxes = parts.map(([w, h, d, x, y, z], k) => {
      const b = new THREE.BoxGeometry(w, h, d);
      if (k === 1 || k === 2) b.rotateX(-0.45);
      b.translate(x, y, z - length / 4);
      return b.toNonIndexed();
    });
    g = mergeGeometries([g.index ? g.toNonIndexed() : g, ...boxes], false);
  }
  return g;
}

// RhB livery: carmine body, a black glazed band with the door leaves set in it, a dark underframe skirt, a grey roof and
// roof gear, a black raked windscreen and white headlights on the nose (colours in linear space)
function createCarMaterial(length, nose) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.38, metalness: 0.2 });
  const x = positionGeometry.x, y = positionGeometry.y, z = positionGeometry.z;
  const side = step(0.6, normalGeometry.x.abs()), front = step(0.35, normalGeometry.z);
  const half = length / 2;
  const band = smoothstep(1.5, 1.55, y).mul(smoothstep(2.78, 2.73, y));
  // Door leaves: two per side, a quarter in from each end; their glazing reaches lower than the windows
  const doorAt = z.abs().sub(half - 3.6).abs();
  const door = smoothstep(0.72, 0.68, doorAt).mul(side).mul(step(y, 2.9));
  const doorGlass = door.mul(smoothstep(1.05, 1.1, y)).mul(smoothstep(2.62, 2.57, y)).mul(smoothstep(0.5, 0.45, doorAt));
  const ends = smoothstep(half - 0.5, half - 0.6, z.abs());
  let glass = band.mul(side).mul(ends).max(doorGlass);
  let lights = float(0);
  if (nose) {
    glass = glass.max(front.mul(smoothstep(1.75, 1.8, y)).mul(step(half - 3.0, z))); // the raked windscreen
    lights = front.mul(smoothstep(0.32, 0.28, x.abs().sub(0.85).abs())).mul(smoothstep(0.95, 1.0, y)).mul(smoothstep(1.25, 1.2, y));
  }
  const skirt = smoothstep(0.82, 0.78, y);
  const roof = step(0.6, normalGeometry.y).max(step(3.75, y));
  const red = vec3(0.45, 0.01, 0.016), black = vec3(0.012, 0.014, 0.018);
  let body = mix(red, red.mul(0.82), door.mul(0.6)); // the door leaves' seams darken them a little
  body = mix(body, black, glass);
  body = mix(body, vec3(0.04, 0.04, 0.045), skirt);
  body = mix(body, vec3(0.28, 0.29, 0.3), roof);
  m.colorNode = mix(body, vec3(1, 0.97, 0.9), lights);
  m.emissiveNode = vec3(1, 0.95, 0.85).mul(lights).mul(2);
  m.roughnessNode = mix(float(0.36), float(0.06), glass);
  m.metalnessNode = mix(float(0.2), float(0.7), glass.max(roof.mul(0.5)));
  return m;
}

// --- Overhead line ----------------------------------------------------------------------------------------------------------
// 11 kV 16.7 Hz, as on the whole RhB network: a mast every ~50 m beside the track (one for the parallel tracks of a
// station: masts closer than 7 m to another are left out) with a cantilever over the track, the contact wire 4.95 m
// above the rails, staggered ±0.2 m from mast to mast so that it wears the pantographs evenly, and the catenary wire
// 1.1 m above it. None in the tunnels; on bridges the line follows the deck.
const CONTACT_WIRE = 4.95, MESSENGER = 1.1, SPAN = 50, MAST_OFFSET = 2.4;

function buildOverheadLine(group) {
  const ways = DAVOS_DATA.railways.filter((r) => r.kind === 'narrow_gauge' && !r.tunnel && r.pts.length >= 4);
  const railTop = (r, x, z) => {
    const d = r.bridge ? deckHeight(x, z) : NaN;
    return (d === d ? d : groundHeight(x, z)) + 0.11;
  };
  const [minX, minZ, maxX, maxZ] = DAVOS_DATA.meta.bounds;
  const masts = [], cells = new Map(), wires = [];
  const near = (x, z) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const m of cells.get(`${Math.floor(x / 8) + i},${Math.floor(z / 8) + j}`) || []) if (Math.hypot(m.x - x, m.z - z) < 7) return true;
    }
    return false;
  };
  for (const r of ways) {
    // Points every SPAN metres along the way (and its two ends)
    const pts = [];
    for (let i = 0; i < r.pts.length; i += 2) pts.push({ x: r.pts[i], z: r.pts[i + 1] });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const len = cum[cum.length - 1], n = Math.max(1, Math.round(len / SPAN));
    const at = (s) => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1e-6, t = (s - cum[i - 1]) / seg;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
    };
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const p = at((len * k) / n);
      // Only over the map (some ways of other lines reach in from far beyond it)
      if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) { prev = null; continue; }
      const y = railTop(r, p.x, p.z);
      const stagger = (k % 2 ? 0.2 : -0.2), nx = -p.dz, nz = p.dx; // left of the direction of the way
      const wire = { x: p.x + nx * stagger, y: y + CONTACT_WIRE, z: p.z + nz * stagger, cx: p.x, cz: p.z };
      if (prev) {
        wires.push(prev.x, prev.y, prev.z, wire.x, wire.y, wire.z);
        wires.push(prev.cx, prev.y + MESSENGER, prev.cz, wire.cx, wire.y + MESSENGER, wire.cz);
        // A dropper half-way
        const hx = (prev.x + wire.x) / 2, hy = (prev.y + wire.y) / 2, hz = (prev.z + wire.z) / 2;
        wires.push(hx, hy, hz, hx, hy + MESSENGER, hz);
      }
      prev = wire;
      const mx = p.x + nx * MAST_OFFSET, mz = p.z + nz * MAST_OFFSET;
      if (near(mx, mz) || near(p.x - nx * MAST_OFFSET, p.z - nz * MAST_OFFSET)) continue;
      const mast = { x: mx, z: mz, base: groundHeight(mx, mz), top: y + CONTACT_WIRE + MESSENGER + 0.3, yaw: Math.atan2(-nx, -nz), wireY: y + CONTACT_WIRE };
      masts.push(mast);
      const key = `${Math.floor(mx / 8)},${Math.floor(mz / 8)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(mast);
    }
  }
  if (!masts.length) return;
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0x8b9095, roughness: 0.55, metalness: 0.6 });
  // Mast (an H-beam, unit height scaled per mast), and the cantilever: a tube from the mast to over the track and its stay
  const mastGeometry = new THREE.BoxGeometry(0.22, 1, 0.28);
  mastGeometry.translate(0, 0.5, 0);
  const armGeometry = mergeGeometries([
    new THREE.BoxGeometry(0.07, 0.07, MAST_OFFSET + 0.5).translate(0, 0, (MAST_OFFSET + 0.5) / 2).toNonIndexed(),
    new THREE.BoxGeometry(0.05, 0.05, MAST_OFFSET + 0.6).rotateX(-0.42).translate(0, 0.5, (MAST_OFFSET + 0.5) / 2).toNonIndexed(),
    new THREE.BoxGeometry(0.06, MESSENGER + 0.25, 0.06).translate(0, (MESSENGER + 0.25) / 2 - 0.1, MAST_OFFSET).toNonIndexed()
  ], false);
  const mastMesh = new THREE.InstancedMesh(mastGeometry, steel, masts.length);
  const armMesh = new THREE.InstancedMesh(armGeometry, steel, masts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  masts.forEach((mast, i) => {
    q.setFromAxisAngle(up, mast.yaw);
    mastMesh.setMatrixAt(i, m.compose(new THREE.Vector3(mast.x, mast.base - 0.3, mast.z), q, new THREE.Vector3(1, mast.top - mast.base + 0.3, 1)));
    armMesh.setMatrixAt(i, m.compose(new THREE.Vector3(mast.x, mast.wireY, mast.z), q, new THREE.Vector3(1, 1, 1)));
  });
  for (const mesh of [mastMesh, armMesh]) { mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const lines = new THREE.LineSegments(wireGeometry, new THREE.LineBasicNodeMaterial({ color: 0x2a2c2e }));
  lines.name = 'RhB overhead wires';
  group.add(lines);
  group.userData.overheadLine = { masts: masts.length, wireSegments: wires.length / 6 };
}

export function buildRhB(scene) {
  const group = new THREE.Group();
  group.name = 'RhB';
  group.userData.terrain = 'absolute';
  scene.add(group);
  buildOverheadLine(group);
  const line = buildLine(DAVOS_DATA.railways, DAVOS_DATA.stations || [], DAVOS_DATA.meta.bounds);
  const idle = { group, update() {}, collidePlayer() {}, bodies: [], trains: [], takeOver: () => null, setControls() {}, cab: () => null };
  if (!line || line.stations.length < 2) return idle;
  const routes = { south: line.south, north: line.north };

  // Blocks between the ends and the passing loops (southbound order): boundaries at the loops' platforms
  const loops = line.stations.filter((s) => s.loop);
  const blocks = Array.from({ length: loops.length + 1 }, () => ({ owner: null }));
  // Stop positions along each route (its own s), in its direction of travel
  const stopsOf = (dir) => line.stations
    .map((st) => ({ name: st.name, s: st[dir], loop: st.loop }))
    .sort((a, b) => a.s - b.s);
  const stops = { south: stopsOf('south'), north: stopsOf('north') };
  // The block a train is in, by the number of loops it has passed (southbound counts up, northbound down)
  const blockAhead = (t) => {
    const passed = stops[t.dir].filter((s) => s.loop && s.s <= t.s + 1).length;
    return t.dir === 'south' ? passed : loops.length - passed;
  };

  const rand = (() => { let s = 20261029; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 1) >>> 0) / 4294967296; })();
  // Two trains, entering from opposite ends a few minutes apart
  const trains = Array.from({ length: TRAINS }, (_, i) => ({
    dir: i % 2 ? 'north' : 'south', s: -40, speed: 0, dwell: 0, off: 10 + i * 240, served: -Infinity, block: -1
  }));

  // Instances: the end cars (two per train, the rear one turned round) and the intermediate cars (one with a pantograph)
  const meshes = {
    end: new THREE.InstancedMesh(carGeometry(END, { nose: true }), createCarMaterial(END, true), TRAINS * 2),
    pan: new THREE.InstancedMesh(carGeometry(MID, { pantograph: true }), createCarMaterial(MID, false), TRAINS),
    mid: new THREE.InstancedMesh(carGeometry(MID), createCarMaterial(MID, false), TRAINS)
  };
  for (const mesh of Object.values(meshes)) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  // One oriented box per car, for collisions (refreshed every frame; parked far away while off the map)
  const bodies = [];
  for (let i = 0; i < TRAINS * CARS.length; i++) {
    bodies.push({ x: 1e7, z: 1e7, prevX: 1e7, prevZ: 1e7, y: -1e4, sin: 0, cos: 1, halfW: HALF_WIDTH, halfL: CARS[i % CARS.length].len / 2, mass: MASS, vx: 0, vz: 0, angularVel: 0, tram: true });
  }

  // Distance to the player standing on the track ahead (a train brakes for whoever stands on the rails)
  const probe = {};
  function playerAhead(t, player) {
    if (!player) return Infinity;
    const f = routePoint(routes[t.dir], t.s, probe), dx = player.x - f.x, dz = player.z - f.z;
    if (Math.abs(dx) > 150 || Math.abs(dz) > 150) return Infinity;
    const ahead = dx * f.dx + dz * f.dz;
    return ahead > 0 && ahead < 140 && Math.abs(dz * f.dx - dx * f.dz) < HALF_WIDTH + 0.6 ? ahead : Infinity;
  }

  // --- Driven by the player ---------------------------------------------------------------------------------------------
  const MANUAL = { accel: 0.6, brake: 1.2, coast: 0.04, protect: 0.9 };
  const controls = { throttle: 0, brake: 0 };
  let manual = null;
  // The last distance along each route that is still inside the map (the routes begin and end beyond its edges)
  const exitS = {};
  for (const [dir, r] of Object.entries(routes)) {
    let last = 0;
    for (let s = 0, p = {}; s <= r.len; s += 5) if (line.inside(routePoint(r, s, p).x, p.z)) last = s;
    exitS[dir] = last;
  }
  const behindOf = (t, k, cur) => (t.dir === 'south' ? k < cur : k > cur);

  function stepManual(t, dt) {
    const route = routes[t.dir];
    if (t.off > 0) {
      // Taken over beyond the map's edge: back in as soon as the first block is free
      t.off = Math.min(t.off, 2) - dt;
      if (t.off <= 0) {
        const first = t.dir === 'south' ? 0 : loops.length;
        if (blocks[first].owner && blocks[first].owner !== t) { t.off = 1; return; }
        blocks[first].owner = t; t.block = first;
        Object.assign(t, { s: 0, speed: 0, served: -Infinity });
      }
      return;
    }
    t.dwell = 0;
    // The block the front is in must be ours; the ones behind are given back
    const cur = blockAhead(t);
    if (!blocks[cur].owner) blocks[cur].owner = t;
    blocks.forEach((b, k) => { if (b.owner === t && behindOf(t, k, cur)) b.owner = null; });
    t.block = cur;
    // Authority: to the map's edge, short of any passing loop whose next block cannot be had in time
    let limitS = blocks[cur].owner === t ? exitS[t.dir] : t.s;
    const braking = (t.speed * t.speed) / (2 * MANUAL.protect);
    for (const stop of stops[t.dir]) {
      if (!stop.loop || stop.s < t.s - 0.5 || stop.s > limitS) continue;
      const next = blockAhead({ dir: t.dir, s: stop.s + 2 });
      if (blocks[next].owner === t) continue;
      if (!blocks[next].owner && stop.s - t.s < braking + 60) { blocks[next].owner = t; continue; }
      limitS = Math.min(limitS, stop.s);
      break;
    }
    // The player's throttle and brake, then the protection's braking curve to the end of the authority
    if (controls.brake) t.speed = Math.max(0, t.speed - MANUAL.brake * controls.brake * dt);
    else if (controls.throttle) t.speed = Math.min(MAX_SPEED, t.speed + MANUAL.accel * controls.throttle * dt);
    else t.speed = Math.max(0, t.speed - MANUAL.coast * dt);
    t.speed = Math.min(t.speed, Math.sqrt(2 * MANUAL.protect * Math.max(0, limitS - t.s - 1)));
    t.s += t.speed * dt;
    // Stopped at the edge of the map: the driver changes ends (the rear car leads back the other way)
    if (t.s >= exitS[t.dir] - 2 && t.speed < 0.2 && controls.throttle) {
      const rear = routePoint(route, t.s - (TRAIN_LENGTH - GAP), {});
      t.dir = t.dir === 'south' ? 'north' : 'south';
      t.s = project(routes[t.dir], rear.x, rear.z).s;
      t.speed = 0; t.y = undefined; t.served = t.s;
    }
  }

  // Takes over a train on the map (true) or hands it back to the timetable (false); returns the driven train or null
  function takeOver(on) {
    if (!on) {
      if (manual) {
        // Back to the automatic run from where it stands: it keeps the block it is in and its next stop is ahead
        const t = manual, cur = t.off > 0 ? -1 : blockAhead(t);
        blocks.forEach((b, k) => { if (b.owner === t && k !== cur && behindOf(t, k, cur)) b.owner = null; });
        t.block = cur; t.served = t.s; t.manual = false;
      }
      manual = null; controls.throttle = controls.brake = 0;
      return null;
    }
    if (!manual) {
      manual = trains.find((t) => t.off <= 0) || trains[0];
      manual.manual = true; manual.dwell = 0;
    }
    return manual;
  }
  function setControls(throttle = 0, brake = 0) { controls.throttle = throttle; controls.brake = brake; }
  // The driver's seat of the driven train: the front car's cab, its heading and the train's speed
  const cabProbe = {};
  function cab() {
    if (!manual) return null;
    const route = routes[manual.dir], s = Math.max(0, manual.s - 2.4);
    const p = routePoint(route, s, cabProbe);
    const y = manual.y ?? surfaceHeight(p.x, p.z);
    return { x: p.x, y, z: p.z, heading: Math.atan2(p.dx, p.dz), speed: manual.speed, visible: manual.off <= 0 };
  }

  function step(dt, player) {
    for (const t of trains) {
      if (t === manual) { stepManual(t, dt); continue; }
      const route = routes[t.dir];
      // Off the map (beyond its edge, turning back): wait, then enter again as soon as the first block is free
      if (t.off > 0) {
        t.off -= dt;
        if (t.off <= 0) {
          const first = t.dir === 'south' ? 0 : loops.length;
          if (blocks[first].owner && blocks[first].owner !== t) { t.off = 1; continue; }
          blocks[first].owner = t; t.block = first;
          Object.assign(t, { s: 0, speed: MAX_SPEED * 0.6, served: -Infinity });
        }
        continue;
      }
      if (t.dwell > 0) {
        t.dwell -= dt;
        if (t.dwell > 0) continue;
      }
      // Authority: up to the next stop; at a loop, on into the next block only once it is ours
      const next = stops[t.dir].find((s) => s.s > t.served + 1 && s.s > t.s - 1);
      let limitS = route.len + TRAIN_LENGTH + 20;
      if (next) limitS = next.s;
      if (!next && t.s >= route.len + TRAIN_LENGTH) {
        // Gone beyond the map: free the last block and turn back
        if (blocks[t.block]?.owner === t) blocks[t.block].owner = null;
        t.dir = t.dir === 'south' ? 'north' : 'south';
        t.off = TURN[0] + rand() * (TURN[1] - TURN[0]); t.block = -1;
        continue;
      }
      let limit = Math.min(MAX_SPEED, Math.sqrt(2 * BRAKE * Math.max(0, limitS - t.s)));
      const blocked = playerAhead(t, player);
      if (blocked < Infinity) limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, blocked - 6)));
      t.speed = t.speed < limit ? Math.min(limit, t.speed + ACCEL * dt) : Math.max(limit, t.speed - BRAKE * 2 * dt);
      t.s += t.speed * dt;
      // At the platform: stop, release the block behind (at a loop), and dwell until the block ahead is ours
      if (next && t.s >= next.s - 0.6 && t.speed < 0.4) {
        t.speed = 0;
        if (next.loop) {
          const behind = t.block, ahead = blockAhead({ dir: t.dir, s: next.s + 2 });
          if (blocks[behind]?.owner === t) blocks[behind].owner = null;
          if (blocks[ahead].owner && blocks[ahead].owner !== t) { t.block = -1; t.dwell = 1; t.served = next.s - 2; continue; }
          blocks[ahead].owner = t; t.block = ahead;
        }
        t.served = next.s;
        t.dwell = DWELL[0] + rand() * (DWELL[1] - DWELL[0]);
      }
    }
  }
  function update(dt, { player = null } = {}) {
    step(Math.min(dt, 0.1), player);
    place();
  }

  // Vehicles: centred between their couplings along the route, pitched to the surface they cross; hidden in tunnels
  // and off the map
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ'), a = {}, b = {};
  function place() {
    let k = 0;
    trains.forEach((t, i) => {
      const route = routes[t.dir];
      let offset = 0;
      CARS.forEach((car, c) => {
        const len = car.len, body = bodies[k++];
        const s0 = t.s - offset, s1 = s0 - len;
        offset += len + GAP;
        const [mesh, index] = car.end ? [meshes.end, i * 2 + (c ? 1 : 0)] : c === 1 ? [meshes.pan, i] : [meshes.mid, i];
        const visible = t.off <= 0 && s1 > 0 && s0 < route.len;
        routePoint(route, s0, a); routePoint(route, s1, b);
        if (!visible || (a.tunnel && b.tunnel) || !line.inside((a.x + b.x) / 2, (a.z + b.z) / 2)) {
          mesh.setMatrixAt(index, m.compose(pos.set(0, -1e4, 0), q.identity(), zero));
          body.prevX = body.x = 1e7; body.prevZ = body.z = 1e7; body.y = -1e4;
          return;
        }
        const ya = surfaceHeight(a.x, a.z, t.y), yb = surfaceHeight(b.x, b.z, t.y);
        if (c === 0) t.y = ya;
        const yaw = Math.atan2(a.x - b.x, a.z - b.z), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
        euler.set(Math.atan2(yb - ya, len) * (car.flip ? -1 : 1), yaw + (car.flip ? Math.PI : 0), 0);
        mesh.setMatrixAt(index, m.compose(pos.set(cx, (ya + yb) / 2 + 0.17, cz), q.setFromEuler(euler), one)); // on the rails' heads
        body.prevX = body.x; body.prevZ = body.z;
        body.x = cx; body.z = cz; body.y = (ya + yb) / 2;
        body.sin = Math.sin(yaw); body.cos = Math.cos(yaw);
        body.vx = body.sin * t.speed; body.vz = body.cos * t.speed;
      });
    });
    for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
  }
  // Seven minutes of service before the start, so that both trains are already out on the line
  for (let i = 0; i < 4200; i++) step(0.1, null);
  place();
  for (const b of bodies) { b.prevX = b.x; b.prevZ = b.z; }

  // The player against the vehicles: a train does not give way, so the player takes the whole correction
  const contact = {}, playerBody = { x: 0, z: 0, prevX: 0, prevZ: 0, sin: 0, cos: 1, halfW: 0, halfL: 0, mass: 0, vx: 0, vz: 0, angularVel: 0 };
  function collidePlayer(pe, mode, controllers) {
    if (!pe || mode === 'helicopter' || mode === 'rhb') return; // (in the rhb mode the player is the train)
    const halfW = mode === 'cargobike' ? 0.38 : mode === 'cyclist' ? 0.35 : mode === 'person' ? 0.32 : 0.86;
    const halfL = mode === 'cargobike' ? 1.34 : mode === 'cyclist' ? 0.85 : mode === 'person' ? 0.32 : 2.18;
    for (const b of bodies) {
      const reach = b.halfL + halfL + HALF_WIDTH;
      if (Math.abs(pe.position.x - b.x) > reach + 2 || Math.abs(pe.position.z - b.z) > reach + 2) continue;
      if (pe.position.y > b.y + 4 || pe.position.y < b.y - 2) continue;
      const p = playerBody, heading = pe.heading || 0;
      p.x = pe.position.x; p.z = pe.position.z;
      p.prevX = pe.prevX ?? p.x; p.prevZ = pe.prevZ ?? p.z;
      p.sin = Math.sin(heading); p.cos = Math.cos(heading);
      p.halfW = halfW; p.halfL = halfL;
      p.mass = mode === 'car' ? 1700 : mode === 'cargobike' ? 140 : mode === 'cyclist' ? 95 : 80;
      p.vx = p.sin * (pe.speed || 0) + (pe.vx || 0);
      p.vz = p.cos * (pe.speed || 0) + (pe.vz || 0);
      p.angularVel = mode === 'car' ? pe.angularVel || 0 : 0;
      if (!sweptVehicleContact(p, b, contact) && !vehicleContact(p, b, contact)) continue;
      const speed = resolveVehicleContact(p, b, contact);
      pe.position.x = contact.ax + contact.nx * contact.depth;
      pe.position.z = contact.az + contact.nz * contact.depth;
      if (speed <= 0) continue;
      pe.speed = p.vx * p.sin + p.vz * p.cos;
      if (mode === 'car') { pe.vx = p.vx - p.sin * pe.speed; pe.vz = p.vz - p.cos * pe.speed; pe.angularVel = p.angularVel; }
      if (mode !== 'person') controllers?.reportCollision(pe, b, 'vehicle', contact.x, b.y + 0.6, contact.z, contact.nx, 0, contact.nz, speed);
    }
  }

  group.userData.stats = { trains: TRAINS, length: Math.round(line.south.len), stations: line.stations.map((s) => s.name), loops: loops.map((s) => s.name) };
  return { group, update, collidePlayer, bodies, trains, line, blocks, takeOver, setControls, cab };
}
