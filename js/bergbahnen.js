import * as THREE from 'three/webgpu';
import { fract, mix, mx_noise_float, positionGeometry, positionWorld, smoothstep, step, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BERGBAHNEN } from './bergbahnen-data.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { cityUniforms } from './tsl-materials.js';

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
  const parts = list.map(([w, h, d, x, y, z, colour, rx = 0, rz = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    const c = new THREE.Color(colour), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
  });
  return mergeGeometries(parts, false);
}
let sharedVehicleMaterial = null; // (one for all: the same shader)
const vehicleMaterial = () => (sharedVehicleMaterial ||= new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 }));
// A fixed bounding sphere round the polylines a moving vehicle set keeps to (its instances stay along them), padded by
// the vehicles' size: frustum culling for the instanced cars and cabins in the view and the shadow cascades
function linesSphere(lines, pad) {
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (const line of lines) for (const q of line.pts) box.expandByPoint(v.set(q.x, q.y, q.z));
  return box.expandByScalar(pad).getBoundingSphere(new THREE.Sphere());
}
// Any geometry in one colour (non-indexed, with a colour attribute, like boxes()), translated
function tinted(g, colour, x = 0, y = 0, z = 0) {
  g = g.index ? g.toNonIndexed() : g;
  g.translate(x, y, z);
  const c = new THREE.Color(colour), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
// A box tilted up the slope by `t` (about x), offset `d` across the slope (perpendicular) and `s` along it
const slopedBox = (w, h, l, x, d, s, colour, t) => [w, h, l, x, d * Math.cos(t) + s * Math.sin(t), -d * Math.sin(t) + s * Math.cos(t), colour, -t];

// --- Lettering decals ---------------------------------------------------------------------------------------------------------
// Signwriting (car names, numbers, the lines' names) drawn into a canvas once, on thin quads just off the sides
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const decalMaterial = (map) => new THREE.MeshStandardNodeMaterial({ map, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2 });
// Quads on both sides (x = ±half) from s0 to s1 along z and d0 to d1 up, mapped to the atlas rect [u0, v0, u1, v1] (v up),
// readable from outside on each side; `t` tilts them up the slope like slopedBox
function sideDecals(half, s0, s1, d0, d1, [u0, v0, u1, v1], t = 0) {
  const pos = [], uvs = [];
  for (const side of [1, -1]) {
    const x = side * half;
    // From outside, the right-hand side of the reader is -z on the +x side and +z on the -x side
    const ua = side > 0 ? u1 : u0, ub = side > 0 ? u0 : u1;
    const P = [[x, d0, s0], [x, d0, s1], [x, d1, s1], [x, d1, s0]], U = [[ua, v0], [ub, v0], [ub, v1], [ua, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...P[k]); uvs.push(...U[k]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (t) g.rotateX(-t);
  g.computeVertexNormals();
  return g;
}
// The atlas rect of a canvas region [x, y, w, h] (pixels, y down) of a W × H canvas
const rect = (x, y, w, h, W, H) => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];

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
// The funicular ways in tunnels (OSM tunnel=yes: the Parsennbahn's lower ~230 m under the Salzgäba slope, the short
// tunnels at the Schatzalpbahn's stations and the Parsennbahn's upper sections), as flat [x, z, …] polylines
const TUNNELS = (DAVOS_DATA.railways || []).filter((r) => r.kind === 'funicular' && r.tunnel).map((r) => r.pts);
function inTunnel(x, z) {
  for (const pts of TUNNELS) for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], dx = pts[i] - ax, dz = pts[i + 1] - az, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < 3) return true;
  }
  return false;
}
function carPath(f, side) {
  const raw = [];
  for (let i = 0; i < f.paths[0].length; i += 3) raw.push({ x: f.paths[0][i], y: f.paths[0][i + 1], z: f.paths[0][i + 2] });
  const line = polyline(raw);
  // Through a tunnel the track dives under the ground: down to 9 m below the surface ~30 m inside a portal
  const tunnel = raw.map((p) => inTunnel(p.x, p.z));
  const depth = raw.map((_, i) => {
    if (!tunnel[i]) return 0;
    let d = Infinity;
    for (let j = 0; j < raw.length; j++) if (!tunnel[j]) d = Math.min(d, Math.abs(line.cum[j] - line.cum[i]));
    if (d === Infinity) d = Math.min(line.cum[i], line.len - line.cum[i]);
    return Math.min(9, d * 0.3);
  });
  // Offset sideways through the loop (the OSM tracks rarely separate it)
  const pts = raw.map((p, i) => {
    const q = at(line, line.cum[i]), h = Math.hypot(q.dx, q.dz) || 1, o = loopOffset(line.cum[i], line.len) * side;
    return { x: p.x - (q.dz / h) * o, y: p.y - depth[i], z: p.z + (q.dx / h) * o, tunnel: tunnel[i] };
  });
  const out = polyline(pts);
  // The portals: where the track leaves a tunnel (index of the last point inside, and the direction out of it)
  out.portals = [];
  for (let i = 1; i < pts.length; i++) if (pts[i].tunnel !== pts[i - 1].tunnel) out.portals.push({ i: pts[i].tunnel ? i : i - 1, out: pts[i].tunnel ? -1 : 1 });
  return out;
}

// The bed: a concrete track slab with sleepers every 0.8 m, and the rails; strips along the path (uv.x across, uv.y
// along), left out in the tunnels
function trackStrip(line, width, lift) {
  const positions = [], uvs = [], tmp = {};
  for (let i = 1; i < line.pts.length; i++) {
    const a = line.pts[i - 1], b = line.pts[i];
    if (a.tunnel && b.tunnel) continue;
    const d = at(line, (line.cum[i - 1] + line.cum[i]) / 2, tmp), h = Math.hypot(d.dx, d.dz) || 1;
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
// The Schatzalpbahn's steel track: dark steel sleepers on a trestle (no concrete slab), and the galvanised grating walkway
function steelBedMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.6 });
  const phase = fract(uv().y.div(1.0));
  const sleeper = smoothstep(0.0, 0.05, phase).mul(smoothstep(0.3, 0.25, phase));
  m.colorNode = mix(vec3(0.05, 0.05, 0.05), vec3(0.16, 0.16, 0.17), sleeper);
  m.opacityNode = sleeper.max(smoothstep(0.42, 0.5, uv().x.sub(0.5).abs()));
  m.alphaTest = 0.5;
  return m;
}
function gratingMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide });
  const gx = fract(uv().x.mul(12)), gy = fract(uv().y.div(0.06));
  const bar = step(0.75, gx).max(step(0.7, gy));
  m.colorNode = vec3(0.55, 0.57, 0.6);
  m.opacityNode = bar.max(smoothstep(0.46, 0.5, uv().x.sub(0.5).abs()));
  m.alphaTest = 0.5;
  return m;
}

// The Parsennbahn's car (Davos Klosters Mountains' photo after the revision): one long car per train, compartments
// stepped to the slope (each floor level), Parsenn red, tall narrow windows in dark frames with a white sunshade band,
// dark doors, a faceted nose at both ends with a huge dark windscreen in a black frame, small headlights, a dark-grey
// underframe with skirts and the running gear; the car runs along +z (uphill), its origin on the rails at its centre.
const PARSENN_RED = 0xd3202a;
function parsennCarGeometry(length, grade) {
  const n = Math.max(4, Math.round(length / 3.7)), step = length / n, w = 2.6, list = [];
  const glass = 0x1b242c, frame = 0x1c1d1f, shade = 0xe9eaea, dark = 0x2b2e32;
  for (let i = 0; i < n; i++) {
    const zc = -length / 2 + step * (i + 0.5), y0 = zc * grade, end = i === 0 ? -1 : i === n - 1 ? 1 : 0;
    list.push([w, 2.75, step + 0.03, 0, y0 + 1.72, zc, PARSENN_RED]);
    list.push([w - 0.12, 0.12, step + 0.02, 0, y0 + 3.15, zc, 0xb31822]); // the roof step
    list.push([w - 0.25, 0.32, step, 0, y0 + 0.2, zc, 0x303236]); // the skirt
    if (end) {
      // The nose: the windscreen raked back in its black frame, the chin with the headlights, the wiper
      const ze = zc + end * (step / 2);
      list.push([w - 0.08, 2.25, 0.1, 0, y0 + 2.05, ze + end * 0.02, frame, end * 0.28]);
      list.push([w - 0.34, 1.95, 0.12, 0, y0 + 2.1, ze + end * 0.05, glass, end * 0.28]);
      list.push([w - 0.2, 0.75, 0.45, 0, y0 + 0.75, ze + end * 0.12, PARSENN_RED]);
      for (const x of [-0.85, 0.85]) list.push([0.26, 0.12, 0.08, x, y0 + 0.92, ze + end * 0.36, 0xfff4d8]);
      list.push([0.9, 0.05, 0.05, -0.3, y0 + 1.35, ze + end * 0.2, frame, 0, 0.5]);
      // A window and the end of the side behind the cab
      for (const k of [-end * 0.22]) {
        const z = zc + k * step, ww = step * 0.32;
        list.push([w + 0.02, 1.85, ww + 0.1, 0, y0 + 1.95, z, frame]);
        list.push([w + 0.03, 1.72, ww, 0, y0 + 1.95, z, glass]);
        list.push([w + 0.04, 0.14, ww, 0, y0 + 2.2, z, shade]);
      }
      continue;
    }
    if (i === 1 || i === n - 2) {
      // A door bay: the dark door leaves with their window, and one side window
      list.push([w + 0.035, 2.35, 1.25, 0, y0 + 1.55, zc - step * 0.2, dark]);
      list.push([w + 0.04, 1.2, 0.95, 0, y0 + 2.0, zc - step * 0.2, glass]);
      const z = zc + step * 0.28, ww = step * 0.28;
      list.push([w + 0.02, 1.85, ww + 0.1, 0, y0 + 1.95, z, frame]);
      list.push([w + 0.03, 1.72, ww, 0, y0 + 1.95, z, glass]);
      list.push([w + 0.04, 0.14, ww, 0, y0 + 2.2, z, shade]);
      continue;
    }
    // Two tall windows
    for (const k of [-0.25, 0.25]) {
      const z = zc + k * step, ww = step * 0.38;
      list.push([w + 0.02, 1.85, ww + 0.1, 0, y0 + 1.95, z, frame]);
      list.push([w + 0.03, 1.72, ww, 0, y0 + 1.95, z, glass]);
      list.push([w + 0.04, 0.14, ww, 0, y0 + 2.2, z, shade]);
    }
  }
  // The inclined chassis and the running gear
  const tilt = Math.atan(grade), slopeLen = length / Math.cos(tilt);
  list.push([2.0, 0.45, slopeLen, 0, 0.22, 0, 0x2a2b2d, -tilt]);
  for (const e of [-1, 1]) list.push([2.1, 0.4, 2.2, 0, 0.12 + e * (length / 2 - 2) * grade, e * (length / 2 - 2), 0x1d1e20]);
  return boxes(list);
}
// Its lettering: "PARSENN" upright along both noses, the car number near the top of the nose, the yellow-dot "PARSENN"
// mark mid-side (drawn, not the original mark)
function parsennDecals(length, grade, number, atlas) {
  const n = Math.max(4, Math.round(length / 3.7)), step = length / n, half = 2.6 / 2 + 0.045, parts = [];
  for (const end of [-1, 1]) {
    const zc = end * (length / 2 - step / 2), y0 = zc * grade;
    const zA = zc + end * step * 0.12, zB = zc + end * step * 0.42;
    parts.push(sideDecals(half, Math.min(zA, zB), Math.max(zA, zB), y0 + 0.75, y0 + 2.6, atlas.vertical));
    const zN = zc + end * step * 0.46;
    parts.push(sideDecals(half, zN - 0.25, zN + 0.25, y0 + 2.75, y0 + 3.1, atlas.numbers[number]));
  }
  const y0 = 0;
  parts.push(sideDecals(half, -1.1, 1.1, y0 + 0.62, y0 + 1.02, atlas.logo));
  return mergeGeometries(parts, false);
}
function parsennAtlas() {
  const W = 1024, H = 512;
  const map = canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    // "PARSENN" upright (reading from the bottom), dark grey
    g.save(); g.translate(128, 256); g.rotate(-Math.PI / 2);
    g.fillStyle = '#3a3d42'; g.font = '700 120px "DIN Condensed", "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PARSENN', 0, 0); g.restore();
    // The mark: a yellow dot and the name
    g.fillStyle = '#f2c200'; g.beginPath(); g.arc(320, 64, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.font = '700 70px "DIN Condensed", "Arial Narrow", Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('PARSENN', 380, 66);
    // The numbers
    g.fillStyle = '#8a8d92'; g.font = '700 110px "DIN Condensed", "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center';
    g.fillText('1', 320, 192); g.fillText('2', 448, 192);
  });
  return { map, vertical: rect(16, 0, 224, 512, W, H), logo: rect(260, 0, 700, 128, W, H), numbers: { 1: rect(256, 128, 128, 128, W, H), 2: rect(384, 128, 128, 128, W, H) } };
}

// The Schatzalpbahn's car (photo): a short car, a parallelogram up the slope; Schatzalp yellow below with a jagged
// mountain-crest edge into the blue upper body, large windows in thin blue frames along the whole side, a blue roof with
// a light-grey box at the upper end, the dark underframe; lettering "DAVOS SCHATZALP" with the "S" disc twice, and the
// car's name on the blue frieze over the windows.
const SCHATZALP_BLUE = 0x1d4fa3, SCHATZALP_YELLOW = 0xf4d10a;
// (built level, then sheared up the slope: the ends stay plumb, the profile a parallelogram)
const shear = (g, grade) => g.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, 0, 0, grade));
function schatzalpCarGeometry(length, grade) {
  const t = 0, w = 2.4, glass = 0x1d2a33, list = [];
  list.push(slopedBox(w, 1.25, length, 0, 0.98, 0, SCHATZALP_YELLOW, t));
  list.push(slopedBox(w, 1.7, length, 0, 2.45, 0, SCHATZALP_BLUE, t));
  const k = 6, seg = length / k;
  for (let i = 0; i < k; i++) list.push(slopedBox(w + 0.03, 1.15, seg - 0.22, 0, 2.2, -length / 2 + seg * (i + 0.5), glass, t));
  for (const e of [-1, 1]) list.push(slopedBox(w - 0.25, 1.15, 0.08, 0, 2.2, e * (length / 2 + 0.02), glass, t));
  list.push(slopedBox(w - 0.1, 0.12, length - 0.1, 0, 3.36, 0, 0x163f85, t));
  list.push(slopedBox(1.6, 0.4, 2.4, 0, 3.6, length / 2 - 1.5, 0xc9ccd0, t));
  list.push(slopedBox(2.0, 0.35, length - 0.6, 0, 0.2, 0, 0x26282b, t));
  for (const e of [-1, 1]) list.push(slopedBox(2.1, 0.45, 1.6, 0, 0.05, e * (length / 2 - 1.6), 0x1b1c1e, t));
  return shear(boxes(list), grade);
}
function schatzalpDecals(length, grade, name, atlas) {
  const half = 2.4 / 2 + 0.045;
  return shear(mergeGeometries([
    sideDecals(half, -length / 2 + 0.05, length / 2 - 0.05, 0.36, 1.62, atlas.band),
    sideDecals(half, -length / 2 + 0.3, length / 2 - 0.3, 2.9, 3.28, atlas.names[name])
  ], false), grade);
}
function schatzalpAtlas(names) {
  const W = 2048, H = 512;
  const map = canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    // The band (0..256): yellow with the blue crest above a zigzag of peaks, "DAVOS SCHATZALP" and the "S" disc twice
    g.fillStyle = '#1d4fa3'; g.fillRect(0, 0, W, 256);
    g.fillStyle = '#f4d10a'; g.beginPath(); g.moveTo(0, 256); g.lineTo(0, 70);
    const peaks = 22;
    for (let i = 0; i < peaks; i++) {
      const x0 = (i / peaks) * W, x1 = ((i + 0.5) / peaks) * W, x2 = ((i + 1) / peaks) * W;
      g.lineTo(x0, 70 + ((i * 37) % 3) * 6); g.lineTo(x1, 26 + ((i * 53) % 4) * 9); g.lineTo(x2, 70 + ((i * 29) % 3) * 6);
    }
    g.lineTo(W, 256); g.closePath(); g.fill();
    for (const cx of [210, W - 210]) {
      g.fillStyle = '#1d4fa3'; g.beginPath(); g.arc(cx, 158, 86, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.font = '800 150px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('S', cx, 166);
    }
    g.fillStyle = '#1d4fa3'; g.textBaseline = 'middle';
    g.font = '600 46px Arial, sans-serif'; g.textAlign = 'right'; g.fillText('DAVOS', 610, 196);
    g.font = '900 150px "Arial Black", Impact, sans-serif'; g.textAlign = 'left'; g.fillText('SCHATZALP', 630, 170);
    // The names on the blue frieze (256..512, one row each)
    names.forEach((n, i) => {
      const y = 256 + i * 128;
      g.fillStyle = '#1d4fa3'; g.fillRect(0, y, W, 128);
      g.fillStyle = '#ffffff'; g.font = '700 80px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`«${n}»`, W / 2, y + 66);
    });
  });
  return { map, band: rect(0, 0, W, 256, W, H), names: Object.fromEntries(names.map((n, i) => [n, rect(0, 256 + i * 128, W, 128, W, H)])) };
}
// The cars' names: «Zauberberg» is on the photo; the other car's name could not be found (it carries the same here)
const SCHATZALP_NAMES = ['ZAUBERBERG'];

// A tunnel portal: a concrete frame round the opening (dark inside), wing walls; along `dir` out of the tunnel
function portalGeometry(gauge) {
  const w = Math.max(4.2, gauge + 3.2), h = 4.6;
  return boxes([
    [w + 1.4, 0.9, 1.2, 0, h + 0.45, 0, 0xa7a49d],
    [0.7, h, 1.2, -(w / 2 + 0.35), h / 2, 0, 0xa09d96],
    [0.7, h, 1.2, w / 2 + 0.35, h / 2, 0, 0xa09d96],
    [w, h, 0.2, 0, h / 2, -0.6, 0x0b0c0d],
    [0.5, 2.6, 5, -(w / 2 + 2.0), 1.1, -1.8, 0x9c9992, 0, 0.0],
    [0.5, 2.6, 5, w / 2 + 2.0, 1.1, -1.8, 0x9c9992, 0, 0.0]
  ]);
}

// Safety railing along the track (posts every 2.5 m and a handrail), left out in the tunnels
function railing(line, offset, posts, rails) {
  const tmp = {};
  for (let s = 0; s < line.len; s += 2.5) {
    const q = at(line, s, tmp), h = Math.hypot(q.dx, q.dz) || 1;
    const i = line.cum.findIndex((c) => c >= s);
    if (line.pts[Math.max(0, i)]?.tunnel) continue;
    const x = q.x - (q.dz / h) * offset, z = q.z + (q.dx / h) * offset;
    posts.push({ x, y: q.y, z });
  }
  for (let k = 1; k < posts.length; k++) {
    const a = posts[k - 1], b = posts[k];
    if (Math.hypot(a.x - b.x, a.z - b.z) > 3.5) continue;
    rails.push(a.x, a.y + 1.05, a.z, b.x, b.y + 1.05, b.z);
  }
}

function buildFuniculars(group) {
  const lines = [];
  const bed = bedMaterial(), steelBed = steelBedMaterial(), grating = gratingMaterial();
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0xa8acb0, roughness: 0.3, metalness: 0.85 });
  const posts = [], handrails = [], portals = [];
  const trackParts = new Map(); // material -> geometries
  const parsennMap = parsennAtlas(), schatzalpMap = schatzalpAtlas(SCHATZALP_NAMES);
  const parsennDecalMaterial = decalMaterial(parsennMap.map), schatzalpDecalMaterial = decalMaterial(schatzalpMap.map);
  for (const f of BERGBAHNEN.funiculars) {
    const parsenn = /Parsenn/.test(f.name), schatz = /Schatzalp/.test(f.name);
    // One car per train (Parsenn: ~200 places; the first section's car about 26 m, the second's ~20 m)
    const cars = 1, carLength = parsenn ? (f.gauge >= 1.1 ? 26 : 20) : f.carLength;
    const paths = [carPath(f, 1), carPath(f, -1)];
    // Track: the bed and the two rails, along both cars' paths (they coincide outside the loop)
    const beds = [], rails = [], walks = [];
    for (const p of paths) {
      beds.push(trackStrip(p, f.gauge + (schatz ? 0.5 : 1.1), schatz ? 0.12 : 0.06));
      for (const o of [-f.gauge / 2, f.gauge / 2]) {
        const off = polyline(p.pts.map((q, i) => { const d = at(p, p.cum[i]), h = Math.hypot(d.dx, d.dz) || 1; return { x: q.x - (d.dz / h) * o, y: q.y, z: q.z + (d.dx / h) * o, tunnel: q.tunnel }; }));
        rails.push(trackStrip(off, 0.07, 0.2));
      }
      p.portals.forEach((po) => portals.push({ p, ...po, gauge: f.gauge }));
    }
    // The walkway (Schatzalp: steel grating) and the railing, on the outside of the uphill-right track
    const outer = polyline(paths[0].pts.map((q, i) => { const d = at(paths[0], paths[0].cum[i]), h = Math.hypot(d.dx, d.dz) || 1, o = f.gauge / 2 + 1.0; return { x: q.x - (d.dz / h) * o, y: q.y, z: q.z + (d.dx / h) * o, tunnel: q.tunnel }; }));
    if (schatz) walks.push(trackStrip(outer, 0.8, 0.25));
    railing(paths[0], f.gauge / 2 + (schatz ? 1.45 : 1.0), posts, handrails);
    // (merged per material over all the lines below: one draw each)
    for (const [list, material] of [[beds, schatz ? steelBed : bed], [rails, steel], [walks, grating]]) {
      if (!trackParts.has(material)) trackParts.set(material, []);
      trackParts.get(material).push(...list);
    }
    // Cars: one per train, two trains on one rope; their lettering on separate decal meshes (numbered / named)
    const grade = f.rise / f.length;
    const geometry = parsenn ? parsennCarGeometry(carLength, grade) : schatz ? schatzalpCarGeometry(carLength, grade) : null;
    const body = new THREE.InstancedMesh(geometry, vehicleMaterial(), 2);
    const decals = [0, 1].map((t) => {
      if (!parsenn && !schatz) return null;
      const g = parsenn ? parsennDecals(carLength, grade, t + 1, parsennMap) : schatzalpDecals(carLength, grade, SCHATZALP_NAMES[t % SCHATZALP_NAMES.length], schatzalpMap);
      const mesh = new THREE.InstancedMesh(g, parsenn ? parsennDecalMaterial : schatzalpDecalMaterial, 1);
      return mesh;
    });
    const sphere = linesSphere(paths, carLength / 2 + 6);
    for (const mesh of [body, ...decals.filter(Boolean)]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = mesh.receiveShadow = mesh === body;
      mesh.boundingSphere = sphere;
      mesh.name = f.label;
      group.add(mesh);
    }
    lines.push({ f, paths, body, decals, cars, carLength, run: shuttle(paths[0].len - cars * (carLength + 0.6), f.speed, 0.7, 45) });
  }
  // Railing posts (instanced) and handrails (lines)
  for (const [material, list] of trackParts) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list, false), material);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (posts.length) {
    const post = new THREE.InstancedMesh(boxes([[0.06, 1.1, 0.06, 0, 0.55, 0, 0x8d9297]]), vehicleMaterial(), posts.length);
    const pm = new THREE.Matrix4();
    posts.forEach((p, i) => post.setMatrixAt(i, pm.makeTranslation(p.x, p.y, p.z)));
    group.add(post);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(handrails, 3));
    group.add(new THREE.LineSegments(hg, new THREE.LineBasicNodeMaterial({ color: 0x8d9297 })));
  }
  // Tunnel portals
  if (portals.length) {
    const seen = [], list = [];
    for (const po of portals) {
      const q = po.p.pts[po.i], d = at(po.p, po.p.cum[po.i]);
      if (seen.some((s) => Math.hypot(s.x - q.x, s.z - q.z) < 8)) continue; // (both paths share the portal)
      seen.push(q);
      // The surface at the portal: the track there is still near it (the dive starts inside)
      const yaw = Math.atan2(d.dx * po.out, d.dz * po.out);
      list.push({ x: q.x, y: q.y - 0.3, z: q.z, yaw });
    }
    const mesh = new THREE.InstancedMesh(portalGeometry(1.2), vehicleMaterial(), list.length);
    const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    list.forEach((p, i) => mesh.setMatrixAt(i, pm.compose(new THREE.Vector3(p.x, p.y, p.z), pq.setFromAxisAngle(up, p.yaw), one)));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), up = new THREE.Vector3(0, 1, 0), probe = {};
  return (dt) => {
    for (const l of lines) {
      const { f, paths, body, decals, cars, carLength, run } = l;
      run.update(dt);
      // Train 0 climbs on path 0 from the valley; train 1 descends on path 1 (its distance from the valley is the rest)
      [[paths[0], run.s], [paths[1], paths[1].len - (run.s + cars * (carLength + 0.6))]].forEach(([p, sTrain], t) => {
        const s = sTrain + 0.5 * (carLength + 0.6);
        at(p, s, probe);
        // Hidden deep in a tunnel (both ends well inside): the ground and the portal hide it near the portals anyway
        const point = (v) => { const k = p.cum.findIndex((c) => c >= v); return p.pts[k < 0 ? p.pts.length - 1 : k]; };
        const hidden = point(s - carLength / 2 - 12).tunnel && point(s + carLength / 2 + 12).tunnel;
        q.setFromAxisAngle(up, Math.atan2(probe.dx, probe.dz));
        m.compose(pos.set(probe.x, probe.y, probe.z), q, hidden ? zero : one);
        body.setMatrixAt(t, m);
        if (decals[t]) decals[t].setMatrixAt(0, m);
      });
      body.instanceMatrix.needsUpdate = true;
      for (const d of decals) if (d) d.instanceMatrix.needsUpdate = true;
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
// The Jakobshornbahn's cabins (photo): a rounded box glazed almost all round (dark tint, slim dark mullions) under a
// black rounded roof frame, a red lower band with a dark swoosh and fine vent slots at the front, a light-grey rub-rail
// at floor level and the grey underbody; a slender dark hanger rising at an angle from one side of the roof to the
// silver running carriage on the track ropes. Sized by capacity: Sektion 1 (100) and Sektion 2 (60).
const JAKOBSHORN = (occupancy) => occupancy >= 90 ? { w: 3.4, l: 7.2, h: 2.7, hang: 6.0 } : { w: 3.0, l: 5.6, h: 2.6, hang: 4.6 };
function jakobshornCabinGeometry(occupancy) {
  const { w, l, h, hang } = JAKOBSHORN(occupancy), top = -hang, floor = top - h;
  const black = 0x15171a, glass = 0x1a2128, red = 0xc0162b, grey = 0x5a5d60, rail = 0xc4c7ca, silver = 0xb9bdc1;
  const rounded = (W, H, L, y, colour, r = 0.35) => tinted(new RoundedBoxGeometry(W, H, L, 3, Math.min(r, H / 2 - 0.01)), colour, 0, y, 0);
  const parts = [
    rounded(w, 0.42, l, top - 0.21, black, 0.2), // the roof frame
    rounded(w - 0.04, h * 0.58, l - 0.04, top - 0.42 - h * 0.29, glass, 0.4),
    rounded(w + 0.02, h * 0.36, l + 0.02, floor + h * 0.18 + 0.06, red, 0.4),
    rounded(w - 0.4, 0.34, l - 0.7, floor - 0.1, grey, 0.15)
  ];
  const list = [
    [w + 0.1, 0.09, l + 0.06, 0, floor + 0.08, 0, rail], // the rub-rail
    [w - 0.6, 0.12, l - 0.8, 0, top + 0.05, 0, 0x2a2c2f] // the roof deck
  ];
  // Mullions: along the sides and across the ends
  const glassTop = top - 0.42, glassBottom = glassTop - h * 0.58, gy = (glassTop + glassBottom) / 2, gh = glassTop - glassBottom;
  for (let k = 1; k < 6; k++) { const z = -l / 2 + (l * k) / 6; list.push([w + 0.0, gh, 0.07, 0, gy, z, black]); }
  for (const x of [-w / 4, w / 4]) list.push([0.07, gh, l + 0.0, x, gy, 0, black]);
  // The silver carriage with its running wheels on the ropes, and the hanger rising from the roof's side to it
  const carriage = l * 0.55;
  list.push([0.7, 0.55, carriage, 0, -0.55, 0, silver], [0.9, 0.22, carriage * 0.8, 0, -0.95, 0, 0x8e9398]);
  for (let k = 0; k < 4; k++) list.push([0.2, 0.42, 0.42, 0, -0.18, -carriage / 2 + 0.4 + (k * (carriage - 0.8)) / 3, 0x3a3d40]);
  const dx = w * 0.25, rise = hang - 1.05, L = Math.hypot(dx, rise), rz = Math.asin(dx / L);
  for (const z of [-0.5, 0.5]) list.push([0.2, L, 0.2, dx / 2, top - 0.05 + rise / 2, z, 0x2a2c2f, 0, rz]);
  list.push([0.6, 0.25, 1.4, dx, top + 0.08, 0, 0x2a2c2f]);
  return mergeGeometries([...parts, boxes(list)], false);
}
function jakobshornAtlas() {
  const W = 2048, H = 512;
  const map = canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    const font = (px, weight = 800) => `${weight} ${px}px "Helvetica Neue", Arial, sans-serif`;
    // The big outline lettering (0..200)
    g.font = font(185, 900); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.strokeText('JAKOBSHORN', W / 2, 104);
    // The red band's swoosh and vent slots (200..328): transparent where the red shows
    g.fillStyle = '#1b1c1f';
    g.beginPath(); g.moveTo(0, 318); g.bezierCurveTo(600, 300, 1100, 250, W, 212); g.lineTo(W, 236); g.bezierCurveTo(1150, 276, 620, 318, 0, 328); g.closePath(); g.fill();
    for (let k = 0; k < 14; k++) g.fillRect(W - 380 + k * 22, 206, 9, 34);
    // The small name with the cabin number (328..512, numbers 1-4 in four slots)
    for (let n = 1; n <= 4; n++) {
      const x = (n - 1) * 512;
      g.fillStyle = '#ffffff'; g.font = font(58, 700); g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('JAKOBSHORN', x + 16, 424);
      g.font = font(110, 800); g.textAlign = 'right'; g.fillText(String(n), x + 500, 420);
    }
  });
  return { map, outline: rect(0, 0, W, 200, W, H), band: rect(0, 200, W, 128, W, H), numbers: [1, 2, 3, 4].map((n) => rect((n - 1) * 512, 340, 512, 160, W, H)) };
}
function jakobshornDecals(occupancy, number, atlas) {
  const { w, l, h, hang } = JAKOBSHORN(occupancy), top = -hang, floor = top - h, half = w / 2 + 0.035;
  const glassBottom = top - 0.42 - h * 0.58;
  return mergeGeometries([
    sideDecals(half, -l / 2 + 0.45, l / 2 - 0.45, glassBottom + 0.12, glassBottom + 0.12 + (l - 0.9) * 0.098, atlas.outline),
    sideDecals(half + 0.01, -l / 2 + 0.25, l / 2 - 0.25, floor + 0.12, floor + h * 0.36, atlas.band),
    sideDecals(half + 0.015, l / 2 - 1.75, l / 2 - 0.3, floor + 0.2, floor + 0.65, atlas.numbers[number - 1])
  ], false);
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
  // geometry & ropeway -> { geometry, material, sphere, entries: [{ line, s-function }] }: a set per lift, so that the
  // view and the shadow cascades cull the lifts out of sight
  const instancedSets = new Map();
  let sphere = null;
  const addVehicle = (geometry, entry, material = null) => {
    const key = geometry.uuid + '|' + sphere.uuid;
    if (!instancedSets.has(key)) instancedSets.set(key, { geometry, material: material || vehicleMaterial(), sphere, entries: [] });
    instancedSets.get(key).entries.push(entry);
  };
  const jakobshorn = { atlas: null, material: null, cabins: new Map(), number: 0 };
  for (const r of BERGBAHNEN.ropeways) {
    const w = GAUGE[r.kind] || 4, sag = SAG[r.kind] || 0.02;
    const right = ropeLine(r.supports, w / 2, sag), left = ropeLine(r.supports, -w / 2, sag);
    sphere = linesSphere([right, left], 12); // (the cabins hang up to ~10 m below the rope)
    sphere.uuid = THREE.MathUtils.generateUUID();
    for (const line of [right, left]) for (let i = 1; i < line.pts.length; i++) ropes.push(line.pts[i - 1].x, line.pts[i - 1].y, line.pts[i - 1].z, line.pts[i].x, line.pts[i].y, line.pts[i].z);
    // Pylons (the stations of the circulating lifts as low frames too)
    for (let i = 0; i < r.supports.length; i++) {
      const s = r.supports[i];
      const a = r.supports[Math.max(0, i - 1)], b = r.supports[Math.min(r.supports.length - 1, i + 1)];
      pylons.push({ x: s.x, z: s.z, base: s.ground - 0.5, top: s.y + 0.4, yaw: Math.atan2(b.x - a.x, b.z - a.z), width: w + 1.2, heavy: r.kind === 'cable_car', station: s.kind === 'station' });
    }
    if (r.kind === 'cable_car') {
      const key = r.occupancy >= 90 ? 100 : r.occupancy >= 50 ? 60 : 20, jak = /Jakobshorn/.test(r.name);
      const cache = jak ? jakobshorn.cabins : geoms.cabin;
      const geometry = cache.get(key) || (() => { const g = jak ? jakobshornCabinGeometry(key) : cabinGeometry(r.occupancy || 20); cache.set(key, g); return g; })();
      const v = r.duration ? Math.min(12, r.length / (r.duration * 60)) : 8;
      const run = shuttle(right.len, v, 0.5, 40);
      movers.push(run);
      const cabins = [{ line: right, s: () => run.s, sway: () => run.a }, { line: left, s: () => left.len - run.s, sway: () => -run.a }];
      for (const c of cabins) {
        c.phase = movers.length * 2 + cabins.indexOf(c);
        addVehicle(geometry, c);
        if (!jak) continue;
        // The lettering, numbered (Sektion 1: cabins 1 and 2, Sektion 2: 3 and 4), on its own mesh riding with the cabin
        jakobshorn.atlas ||= jakobshornAtlas();
        jakobshorn.material ||= decalMaterial(jakobshorn.atlas.map);
        addVehicle(jakobshornDecals(key, Math.min(4, ++jakobshorn.number), jakobshorn.atlas), c, jakobshorn.material);
      }
      if (jak && r.supports[0].kind === 'station' && /Sektion 1/.test(r.name)) buildValleyStation(group, r.supports[0], r.supports[1], w);
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
  const firstOf = new Map();
  for (const { geometry, material, sphere: bounds, entries } of instancedSets.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = geometry !== geoms.tbar;
    mesh.boundingSphere = bounds;
    if (firstOf.has(geometry)) mesh.userData.sharesPipelineWith = firstOf.get(geometry);
    else firstOf.set(geometry, mesh);
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
        const swing = en.sway ? Math.max(-0.08, Math.min(0.08, en.sway() * 0.06)) + Math.sin(time * 0.9 + (en.phase ?? i)) * 0.006 : Math.sin(time * 1.3 + i * 1.7) * 0.02;
        e.set(swing, Math.atan2(probe.dx, probe.dz), 0);
        mesh.setMatrixAt(i, m.compose(pos.set(probe.x, probe.y, probe.z), q.setFromEuler(e), en.tbar && probe.down ? short : one));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}

// --- The Jakobshornbahn's valley station ---------------------------------------------------------------------------------
// (photo) An angular, almost windowless volume clad in silver-grey vertical metal panels, its roof falling away from the
// ropes; on the rope side a huge open portal in a thick, glossy red rounded-square frame with red reveals, through
// which the machinery shows (steel framework, platforms, the big sheaves the ropes end on), lit warm at night; a light
// plinth with the glazed entrance, flags. Sized to swissBUILDINGS3D's building (hidden: its batches near the node).
const JAKOBSHORN_VALLEY = { x: -544.3, z: 456.5 };
excludeBuildings([{ x: -540.4, z: 458.7, r: 3 }, { x: -553.4, z: 450.4, r: 3 }, { x: -557.4, z: 458.1, r: 3 }]);

function roundedRect(path, x, y, w, h, r) {
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y);
  return path;
}
// Local frame: the origin at the rope node on the ground, +z along the ropes (out of the portal), +x to the left of them
function buildValleyStation(group, node, next, gauge) {
  const yaw = Math.atan2(next.x - node.x, next.z - node.z), ropeY = node.y - node.ground;
  const station = new THREE.Group();
  station.name = 'Jakobshornbahn Talstation';
  station.position.set(node.x, node.ground, node.z);
  station.rotation.y = yaw;
  const hole = { x: -6.5, y: 2.6, w: 13, h: Math.min(13, ropeY + 1.6), r: 2.8 };
  const holePath = (inset = 0) => roundedRect(new THREE.Path(), hole.x + inset, hole.y + inset, hole.w - 2 * inset, hole.h - 2 * inset, hole.r - inset);
  const top = hole.y + hole.h + 1.6;
  const extrude = (shape, depth) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 }); g.deleteAttribute('uv'); return g; };
  // The cladding: the back block (roof falling away) and the front wall round the portal
  const back = new THREE.Shape([new THREE.Vector2(-24, 0), new THREE.Vector2(-6, 0), new THREE.Vector2(-6, top), new THREE.Vector2(-24, top - 6.5)]);
  const backGeometry = extrude(back, 18);
  backGeometry.rotateY(-Math.PI / 2);
  backGeometry.translate(9, 0, 0);
  const front = roundedRect(new THREE.Shape(), -9, 0, 18, top, 0.01);
  front.holes.push(holePath());
  const frontGeometry = extrude(front, 8.5);
  frontGeometry.translate(0, 0, -6);
  const clad = new THREE.MeshStandardNodeMaterial({ roughness: 0.38, metalness: 0.7 });
  const seam = smoothstep(0.0, 0.04, fract(positionGeometry.x.add(positionGeometry.z).div(0.6))).mul(smoothstep(0.5, 0.46, fract(positionGeometry.x.add(positionGeometry.z).div(0.6)).sub(0.5).abs()));
  clad.colorNode = mix(vec3(0.38, 0.4, 0.42), vec3(0.6, 0.62, 0.64), seam.mul(0.7).add(mx_noise_float(positionGeometry.mul(vec3(0.6, 0.05, 0.6))).mul(0.15)));
  station.add(new THREE.Mesh(mergeGeometries([backGeometry, frontGeometry], false), clad));
  // The red frame and the reveals
  const frame = roundedRect(new THREE.Shape(), hole.x - 1.5, hole.y - 1.0, hole.w + 3, hole.h + 2.0, hole.r + 1.2);
  frame.holes.push(holePath());
  const frameGeometry = extrude(frame, 1.6);
  frameGeometry.translate(0, 0, 2.2);
  const reveal = roundedRect(new THREE.Shape(), hole.x, hole.y, hole.w, hole.h, hole.r);
  reveal.holes.push(holePath(0.12));
  const revealGeometry = extrude(reveal, 8.3);
  revealGeometry.translate(0, 0, -5.8);
  const red = new THREE.MeshStandardNodeMaterial({ color: 0xc8102e, roughness: 0.18, metalness: 0.1 });
  station.add(new THREE.Mesh(mergeGeometries([frameGeometry, revealGeometry], false), red));
  // Inside: the back wall, the platform, the framework, the platforms, the sheaves on the ropes' ends
  const steel = 0x3c4045, deck = 0x6f7378, list = [
    [hole.w, hole.h, 0.2, 0, hole.y + hole.h / 2, -5.85, 0x2d2b28],
    [hole.w - 0.4, 0.3, 8, 0, hole.y - 1.1, -1.6, 0x8b8a86],
    [hole.w - 0.6, 0.15, 3.2, 0, ropeY - 5.2, -3.8, deck],
    [hole.w - 0.6, 0.15, 2.4, 0, ropeY - 0.7, -4.3, deck]
  ];
  for (const x of [-5.6, -2, 2, 5.6]) list.push([0.35, hole.h, 0.35, x, hole.y + hole.h / 2, -5.3, steel]);
  for (const y of [ropeY - 5.2, ropeY - 0.7]) list.push([hole.w - 0.4, 0.3, 0.3, 0, y + 1.0, -2.25, 0x8d9297]); // handrails
  list.push([hole.w - 0.4, 0.6, 0.6, 0, ropeY + 1.2, -3.6, steel]); // the beam the sheaves hang from
  const machinery = [boxes(list)];
  for (const x of [-gauge / 2, gauge / 2]) {
    const sheave = new THREE.CylinderGeometry(2.0, 2.0, 0.35, 28, 1, true);
    sheave.rotateZ(Math.PI / 2);
    machinery.push(tinted(sheave, 0x9da2a7, x, ropeY - 2.0, -3.4));
    const hub = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 12);
    hub.rotateZ(Math.PI / 2);
    machinery.push(tinted(hub, 0x2b2d30, x, ropeY - 2.0, -3.4));
    for (let k = 0; k < 6; k++) machinery.push(boxes([[0.12, 3.9, 0.12, x, ropeY - 2.0, -3.4, 0x2b2d30, k * Math.PI / 6]]));
  }
  // The plinth with the glazed entrance on the south-west (-x) side, and two flagpoles
  machinery.push(boxes([
    [18.6, 3.0, 17.6, 0, 1.5, -15.2, 0xe6e4df],
    [0.12, 2.4, 6.0, -9.32, 1.35, -13.5, 0x22303a],
    [0.16, 0.2, 6.2, -9.36, 2.6, -13.5, 0x9a9ea2],
    [0.12, 9, 0.12, -11, 4.5, -3.5, 0xd5d8db], [0.12, 9, 0.12, -11, 4.5, -0.5, 0xd5d8db],
    [0.04, 1.2, 1.8, -11, 8.2, -2.6, 0x1f4fa8], [0.04, 1.2, 1.8, -11, 8.2, 0.4, 0xc8102e]
  ]));
  const inside = new THREE.Mesh(mergeGeometries(machinery, false), vehicleMaterial());
  station.add(inside);
  // Warm light inside at night: lamps under the beam and on the back wall
  const lamps = boxes([[hole.w - 1.4, 0.12, 0.5, 0, hole.y + hole.h - 0.4, -2.0, 0xfff1d0], [0.6, 0.3, 0.1, -4, ropeY - 3.5, -5.7, 0xfff1d0], [0.6, 0.3, 0.1, 4, ropeY - 3.5, -5.7, 0xfff1d0]]);
  const lampMaterial = new THREE.MeshStandardNodeMaterial({ color: 0xfff1d0, roughness: 0.5 });
  lampMaterial.emissiveNode = vec3(1.0, 0.72, 0.4).mul(smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow).mul(6));
  station.add(new THREE.Mesh(lamps, lampMaterial));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(hole.w - 0.3, hole.h - 0.3), new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false }));
  glow.material.colorNode = vec3(1.0, 0.68, 0.35);
  glow.material.opacityNode = smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow).mul(0.18);
  glow.position.set(0, hole.y + hole.h / 2, -5.6);
  station.add(glow);
  station.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = o !== glow; });
  group.add(station);
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
