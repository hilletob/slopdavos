import * as THREE from 'three/webgpu';
import { fract, mix, mx_noise_float, positionWorld, smoothstep, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BERGBAHNEN } from './bergbahnen-data.js';

// The mountain railways of Davos (js/bergbahnen-data.js, tools/fetch-bergbahnen.mjs):
//  - the funiculars — Parsennbahn (Davos Dorf – Höhenweg – Weissfluhjoch, two trains of two cars per section) and
//    Schatzalpbahn (Davos Platz – Schatzalp, two cars): rails and sleepers up the slope, cars stepped like the real
//    ones, the two cars of a line tied to one rope (one climbs as the other descends) and passing each other on the
//    loop half-way, dwelling at the stations;
//  - the aerial tramways (Jakobshornbahn's two sections, the Parsennhüttenbahn, the Gipfelbahn, the Pischabahn...): two
//    track ropes over the pylons, two cabins shuttling between the stations, swaying as they start and stop;
//  - the circulating lifts — gondolas, chair lifts, T-bars and drag lifts: the loop of rope over the pylons, the
//    vehicles going up on one side and down on the other.
// Everything is in absolute heights (userData.terrain = 'absolute'); the vehicles move in update(dt).

const SAG = { cable_car: 0.035, gondola: 0.022, mixed_lift: 0.022, chair_lift: 0.02, 't-bar': 0.012, drag_lift: 0.012, platter: 0.012 };
const GAUGE = { cable_car: 10, gondola: 5.6, mixed_lift: 5.6, chair_lift: 5, 't-bar': 2.6, drag_lift: 2.6, platter: 2.6 }; // rope spacing
const LIFT_SPEED = (r) => (r.kind === 'gondola' || r.kind === 'mixed_lift' ? 5 : r.kind === 'chair_lift' ? ((r.occupancy || 2) >= 4 ? 5 : 2.3) : 3);

// --- Small helpers ----------------------------------------------------------------------------------------------------------
// Boxes [w, h, d, x, y, z, colour] merged into one geometry with vertex colours (rotation about x optional: [.., rx])
function boxes(list) {
  const parts = list.map(([w, h, d, x, y, z, colour, rx = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    const c = new THREE.Color(colour), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
  });
  return mergeGeometries(parts, false);
}
const vehicleMaterial = () => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });

// A polyline of points { x, y, z } with cumulative length: position and unit direction at distance s
function polyline(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
  return { pts, cum, len: cum[cum.length - 1] };
}
function at(line, s, out = {}) {
  const { pts, cum } = line;
  s = Math.max(0, Math.min(line.len, s));
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
  const a = pts[lo - 1], b = pts[lo], seg = cum[lo] - cum[lo - 1] || 1e-6, t = (s - cum[lo - 1]) / seg;
  out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
  out.dx = (b.x - a.x) / seg; out.dy = (b.y - a.y) / seg; out.dz = (b.z - a.z) / seg;
  return out;
}

// A shuttle (funicular cars, aerial tramway cabins): s runs 0 → len → 0, with acceleration, a top speed and a dwell at
// each end. Returns { s, v (signed m/s), a } after `dt`.
function shuttle(len, vmax, accel = 0.6, dwell = 40) {
  const st = { s: Math.random() * len, dir: 1, v: 0, wait: 0, a: 0 };
  st.update = (dt) => {
    if (st.wait > 0) { st.wait -= dt; st.v = 0; st.a = 0; return st; }
    const remaining = st.dir > 0 ? len - st.s : st.s;
    const brake = Math.sqrt(2 * accel * Math.max(0, remaining - 0.3));
    const target = Math.min(vmax, brake);
    const speed = Math.abs(st.v), next = speed < target ? Math.min(target, speed + accel * dt) : Math.max(target, speed - accel * 1.5 * dt);
    st.a = (next - speed) / Math.max(dt, 1e-3) * st.dir;
    st.v = next * st.dir;
    st.s += st.v * dt;
    if (remaining < 0.35 && next < 0.3) { st.s = st.dir > 0 ? len : 0; st.dir = -st.dir; st.wait = dwell; st.v = 0; }
    return st;
  };
  return st;
}

// --- Funiculars -------------------------------------------------------------------------------------------------------------
// The passing loop: half-way up, the two cars swing apart (±1.7 m from the centre line over ~60 m)
const loopOffset = (s, len) => {
  const d = Math.abs(s - len / 2), ease = (u) => u * u * (3 - 2 * u);
  return d > 95 ? 0 : d < 35 ? 1.7 : 1.7 * ease(1 - (d - 35) / 60);
};
function carPath(f, side) {
  const raw = [];
  for (let i = 0; i < f.paths[0].length; i += 3) raw.push({ x: f.paths[0][i], y: f.paths[0][i + 1], z: f.paths[0][i + 2] });
  const line = polyline(raw);
  // Offset sideways through the loop (the OSM tracks rarely separate it)
  const pts = raw.map((p, i) => {
    const q = at(line, line.cum[i]), h = Math.hypot(q.dx, q.dz) || 1, o = loopOffset(line.cum[i], line.len) * side;
    return { x: p.x - (q.dz / h) * o, y: p.y, z: p.z + (q.dx / h) * o };
  });
  return polyline(pts);
}

// The bed: a concrete track slab with sleepers every 0.8 m, and the rails; strips along the path (uv.x across, uv.y along)
function trackStrip(line, width, lift) {
  const positions = [], uvs = [], tmp = {};
  for (let i = 1; i < line.pts.length; i++) {
    const a = line.pts[i - 1], b = line.pts[i], d = at(line, (line.cum[i - 1] + line.cum[i]) / 2, tmp), h = Math.hypot(d.dx, d.dz) || 1;
    const nx = -d.dz / h, nz = d.dx / h;
    const p = (q, side) => [q.x + nx * side * width / 2, q.y + lift, q.z + nz * side * width / 2];
    const t = (s, side) => [(side + 1) / 2, s];
    positions.push(...p(a, -1), ...p(b, 1), ...p(b, -1), ...p(a, -1), ...p(a, 1), ...p(b, 1)); // counter-clockwise from above
    uvs.push(...t(line.cum[i - 1], -1), ...t(line.cum[i], 1), ...t(line.cum[i], -1), ...t(line.cum[i - 1], -1), ...t(line.cum[i - 1], 1), ...t(line.cum[i], 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}
function bedMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  const grit = mx_noise_float(positionWorld.mul(7)).mul(0.5).add(0.5);
  const phase = fract(uv().y.div(0.8));
  const sleeper = smoothstep(0.0, 0.04, phase).mul(smoothstep(0.42, 0.38, phase)).mul(smoothstep(0.92, 0.86, uv().x.sub(0.5).abs().mul(2)));
  m.colorNode = mix(mix(vec3(0.12, 0.115, 0.11), vec3(0.2, 0.19, 0.18), grit), vec3(0.32, 0.31, 0.3), sleeper);
  return m;
}

// A funicular car of `length` m for a line of mean gradient `grade`: compartments in steps (each floor level, as the
// cars are built for the slope), the line's colour below a glazed band, a light roof; the car runs along +z, its
// origin on the rails at its centre.
function funicularCarGeometry(length, grade, colour, trim) {
  const n = Math.max(3, Math.round(length / 3.2)), step = length / n, list = [];
  const glass = 0x16202a;
  for (let i = 0; i < n; i++) {
    const z = -length / 2 + step * (i + 0.5), y0 = z * grade; // the floor of this compartment
    list.push([2.4, 1.1, step - 0.08, 0, y0 + 0.75, z, colour]);
    list.push([2.36, 1.0, step - 0.3, 0, y0 + 1.8, z, glass]);
    for (const k of [-0.5, 0, 0.5]) list.push([2.4, 1.0, 0.1, 0, y0 + 1.8, z + k * (step - 0.3), trim]); // window pillars
    list.push([2.42, 0.18, step - 0.02, 0, y0 + 2.4, z, trim]);
  }
  // The inclined chassis and the bogies
  const tilt = Math.atan(grade), slopeLen = length / Math.cos(tilt);
  list.push([1.8, 0.35, slopeLen, 0, 0.32, 0, 0x2a2b2d, -tilt]);
  list.push([2.0, 0.3, 1.6, 0, 0.18 - (length / 2 - 1.5) * grade, -length / 2 + 1.5, 0x1d1e20]);
  list.push([2.0, 0.3, 1.6, 0, 0.18 + (length / 2 - 1.5) * grade, length / 2 - 1.5, 0x1d1e20]);
  return boxes(list);
}

function buildFuniculars(group) {
  const lines = [];
  const bed = bedMaterial(), steel = new THREE.MeshStandardNodeMaterial({ color: 0xa8acb0, roughness: 0.3, metalness: 0.85 });
  for (const f of BERGBAHNEN.funiculars) {
    const paths = [carPath(f, 1), carPath(f, -1)];
    // Track: the bed and the two rails, along both cars' paths (they coincide outside the loop)
    const beds = [], rails = [];
    for (const p of paths) {
      beds.push(trackStrip(p, f.gauge + 1.1, 0.06));
      for (const o of [-f.gauge / 2, f.gauge / 2]) {
        const off = polyline(p.pts.map((q, i) => { const d = at(p, p.cum[i]), h = Math.hypot(d.dx, d.dz) || 1; return { x: q.x - (d.dz / h) * o, y: q.y, z: q.z + (d.dx / h) * o }; }));
        rails.push(trackStrip(off, 0.07, 0.2));
      }
    }
    for (const [list, material] of [[beds, bed], [rails, steel]]) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), material);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // Cars: `cars` per train, two trains on one rope
    const grade = f.rise / f.length;
    const mesh = new THREE.InstancedMesh(funicularCarGeometry(f.carLength, grade, f.colour, f.trim), vehicleMaterial(), f.cars * 2);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = f.label;
    group.add(mesh);
    lines.push({ f, paths, mesh, run: shuttle(paths[0].len - f.cars * (f.carLength + 0.6), f.speed, 0.7, 45) });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), probe = {};
  return (dt) => {
    for (const l of lines) {
      const { f, paths, mesh, run } = l;
      run.update(dt);
      let k = 0;
      // Train 0 climbs on path 0 from the valley; train 1 descends on path 1 (its distance from the valley is the rest)
      for (const [p, sTrain] of [[paths[0], run.s], [paths[1], paths[1].len - (run.s + f.cars * (f.carLength + 0.6))]]) {
        for (let c = 0; c < f.cars; c++) {
          const s = sTrain + (c + 0.5) * (f.carLength + 0.6);
          at(p, s, probe);
          q.setFromAxisAngle(up, Math.atan2(probe.dx, probe.dz));
          mesh.setMatrixAt(k++, m.compose(pos.set(probe.x, probe.y, probe.z), q, one));
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}

// --- Ropeways ---------------------------------------------------------------------------------------------------------------
// The rope between two supports: a parabola sagging `sag` of the span, sampled every ~8 m; both ropes (offset ± w/2)
function ropeLine(supports, offset, sag) {
  const pts = [];
  for (let i = 1; i < supports.length; i++) {
    const a = supports[i - 1], b = supports[i], span = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / (span || 1), dz = (b.z - a.z) / (span || 1);
    const n = Math.max(2, Math.ceil(span / 8));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      pts.push({ x: a.x + (b.x - a.x) * t - dz * offset, y: a.y + (b.y - a.y) * t - 4 * sag * span * t * (1 - t), z: a.z + (b.z - a.z) * t + dx * offset });
    }
  }
  return polyline(pts);
}

function cabinGeometry(occupancy) {
  const big = occupancy >= 50, w = big ? 3.4 : 2.6, l = big ? (occupancy >= 90 ? 6.6 : 5.2) : 3.6, h = big ? 2.7 : 2.4;
  const red = 0xc8102e, glass = 0x18222c, roof = 0xd9dcdf, steel = 0x4a4d50;
  const hang = big ? 5.5 : 3.5;
  return boxes([
    [0.5, 0.6, big ? 4 : 1.6, 0, -0.3, 0, steel], // the carriage on the rope
    [0.22, hang, 0.22, 0, -hang / 2 - 0.5, 0, steel], // the hanger
    [w, 0.35, l, 0, -hang - 0.6, 0, roof],
    [w, 1.2, l, 0, -hang - 1.4, 0, glass],
    [w + 0.02, h - 1.55, l + 0.02, 0, -hang - 2.05 - (h - 1.55) / 2, 0, red]
  ]);
}
function gondolaGeometry() {
  return boxes([[0.15, 2.6, 0.15, 0, -1.3, 0, 0x4a4d50], [1.9, 0.9, 1.9, 0, -2.9, 0, 0x16202a], [2.0, 0.9, 2.0, 0, -3.8, 0, 0xc8102e], [1.8, 0.2, 1.8, 0, -2.35, 0, 0xd9dcdf]]);
}
function chairGeometry(seats) {
  const w = Math.max(1.2, seats * 0.55);
  return boxes([[0.1, 2.3, 0.1, 0, -1.15, 0, 0x55585c], [w, 0.12, 0.6, 0, -2.4, 0.15, 0x2b2d30], [w, 0.6, 0.08, 0, -2.05, -0.15, 0x2b2d30], [w * 0.9, 0.06, 0.06, 0, -1.6, 0.55, 0x55585c]]);
}
function tbarGeometry() {
  return boxes([[0.06, 3.0, 0.06, 0, -1.5, 0, 0x5c5f63], [1.0, 0.08, 0.08, 0, -3.0, 0, 0x2b2d30], [0.25, 0.25, 0.3, 0, -0.1, 0, 0x2b2d30]]);
}

function buildRopeways(group) {
  const ropes = [], pylons = [], movers = [];
  const geoms = { cabin: new Map(), gondola: gondolaGeometry(), chair: new Map(), tbar: tbarGeometry() };
  const instancedSets = new Map(); // geometry -> [{ line, s-function }]
  const addVehicle = (geometry, entry) => {
    if (!instancedSets.has(geometry)) instancedSets.set(geometry, []);
    instancedSets.get(geometry).push(entry);
  };
  for (const r of BERGBAHNEN.ropeways) {
    const w = GAUGE[r.kind] || 4, sag = SAG[r.kind] || 0.02;
    const right = ropeLine(r.supports, w / 2, sag), left = ropeLine(r.supports, -w / 2, sag);
    for (const line of [right, left]) for (let i = 1; i < line.pts.length; i++) ropes.push(line.pts[i - 1].x, line.pts[i - 1].y, line.pts[i - 1].z, line.pts[i].x, line.pts[i].y, line.pts[i].z);
    // Pylons (the stations of the circulating lifts as low frames too)
    for (let i = 0; i < r.supports.length; i++) {
      const s = r.supports[i];
      const a = r.supports[Math.max(0, i - 1)], b = r.supports[Math.min(r.supports.length - 1, i + 1)];
      pylons.push({ x: s.x, z: s.z, base: s.ground - 0.5, top: s.y + 0.4, yaw: Math.atan2(b.x - a.x, b.z - a.z), width: w + 1.2, heavy: r.kind === 'cable_car', station: s.kind === 'station' });
    }
    if (r.kind === 'cable_car') {
      const geometry = geoms.cabin.get(r.occupancy >= 90 ? 100 : r.occupancy >= 50 ? 60 : 20) || (() => { const g = cabinGeometry(r.occupancy || 20); geoms.cabin.set(r.occupancy >= 90 ? 100 : r.occupancy >= 50 ? 60 : 20, g); return g; })();
      const v = r.duration ? Math.min(12, r.length / (r.duration * 60)) : 8;
      const run = shuttle(right.len, v, 0.5, 40);
      movers.push(run);
      addVehicle(geometry, { line: right, s: () => run.s, sway: () => run.a });
      addVehicle(geometry, { line: left, s: () => left.len - run.s, sway: () => -run.a });
    } else {
      // Circulating: vehicles evenly spaced round the loop (up on the right, down on the left)
      const speed = LIFT_SPEED(r), occ = r.occupancy || (r.kind === 'gondola' ? 8 : 2), cap = r.capacity || 1000;
      const spacing = Math.max(12, (speed * 3600 * occ) / cap), loopLen = right.len + left.len;
      const count = Math.min(400, Math.floor(loopLen / spacing));
      const clock = { t: Math.random() * loopLen };
      movers.push({ update: (dt) => { clock.t = (clock.t + speed * dt) % loopLen; } });
      const geometry = r.kind === 'gondola' || r.kind === 'mixed_lift' ? geoms.gondola
        : r.kind === 'chair_lift' ? (geoms.chair.get(occ) || (() => { const g = chairGeometry(occ); geoms.chair.set(occ, g); return g; })())
        : geoms.tbar;
      for (let k = 0; k < count; k++) {
        const s0 = k * spacing;
        addVehicle(geometry, {
          line: null,
          place: (out) => {
            const p = (clock.t + s0) % loopLen;
            if (p < right.len) { at(right, p, out); out.down = false; } else { at(left, left.len - (p - right.len), out); out.dx = -out.dx; out.dz = -out.dz; out.down = true; }
            return out;
          },
          tbar: geometry === geoms.tbar
        });
      }
    }
  }
  // Ropes
  const ropeGeometry = new THREE.BufferGeometry();
  ropeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ropes, 3));
  const ropeLines = new THREE.LineSegments(ropeGeometry, new THREE.LineBasicNodeMaterial({ color: 0x1e2022 }));
  ropeLines.name = 'Ropeway ropes';
  group.add(ropeLines);
  // Pylons: a mast (unit height, scaled) and a crossarm; heavy lattice towers for the aerial tramways
  const mastGeometry = boxes([[0.5, 1, 0.5, 0, 0.5, 0, 0x8a9096]]);
  const heavyGeometry = boxes([[2.2, 1, 2.2, 0, 0.5, 0, 0x7c8288]]);
  const armGeometry = boxes([[1, 0.45, 0.45, 0, 0, 0, 0x6c7277]]);
  const steelMaterial = vehicleMaterial();
  for (const [geometry, list] of [[mastGeometry, pylons.filter((p) => !p.heavy && !p.station)], [heavyGeometry, pylons.filter((p) => p.heavy && !p.station)], [armGeometry, pylons]]) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geometry, steelMaterial, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw + (geometry === armGeometry ? Math.PI / 2 : 0));
      if (geometry === armGeometry) m.compose(new THREE.Vector3(p.x, p.top - 0.3, p.z), q, new THREE.Vector3(p.width, 1, 1));
      else m.compose(new THREE.Vector3(p.x, p.base, p.z), q, new THREE.Vector3(1, p.top - p.base, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Vehicles
  const sets = [];
  for (const [geometry, entries] of instancedSets) {
    const mesh = new THREE.InstancedMesh(geometry, vehicleMaterial(), entries.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = geometry !== geoms.tbar;
    mesh.frustumCulled = false;
    group.add(mesh);
    sets.push({ mesh, entries });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), short = new THREE.Vector3(1, 0.35, 1), probe = {};
  let time = 0;
  return (dt) => {
    time += dt;
    for (const run of movers) run.update(dt);
    for (const { mesh, entries } of sets) {
      entries.forEach((en, i) => {
        if (en.line) at(en.line, en.s(), probe); else en.place(probe);
        // Hanging plumb, turned along the rope; a tramway cabin swings with its acceleration, the others gently
        const swing = en.sway ? Math.max(-0.08, Math.min(0.08, en.sway() * 0.06)) + Math.sin(time * 0.9 + i) * 0.006 : Math.sin(time * 1.3 + i * 1.7) * 0.02;
        e.set(swing, Math.atan2(probe.dx, probe.dz), 0);
        mesh.setMatrixAt(i, m.compose(pos.set(probe.x, probe.y, probe.z), q.setFromEuler(e), en.tbar && probe.down ? short : one));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}

export function buildBergbahnen(scene) {
  const group = new THREE.Group();
  group.name = 'Bergbahnen';
  group.userData.terrain = 'absolute';
  const updateFuniculars = buildFuniculars(group);
  const updateRopeways = buildRopeways(group);
  scene.add(group);
  group.userData.stats = { funiculars: BERGBAHNEN.funiculars.length, ropeways: BERGBAHNEN.ropeways.length };
  return { group, update(dt) { dt = Math.min(dt, 0.1); updateFuniculars(dt); updateRopeways(dt); } };
}
