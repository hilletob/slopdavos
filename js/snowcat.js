import * as THREE from 'three/webgpu';
import {
  attribute, cameraPosition, cos, float, fract, mix, modelWorldMatrix, positionGeometry, positionLocal, sin, smoothstep, step, uniform, uv, vec2, vec3, vec4
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// js/snowcat.js
// The player's Pistenfahrzeug, modelled after a PistenBully 600 (built in code, no external model): a red body on two
// wide tracks (rubber belts with aluminium cleats over twin pneumatic road wheels, drive sprocket behind, idler in
// front), a cab with large windows under a roof rack carrying the LED light bar and an orange rotating beacon, the
// 12-way blade (centre section with two hinged wings) in front, a winch on the engine hood and the tiller with its
// rubber finisher mat behind. +z is forward, y up, the origin on the ground under the middle of the tracks.
//
// Draw calls: the whole body (paint, glass, lamps, beacon dome) is ONE merged mesh whose colours, roughness/metalness
// and lamp channels are vertex attributes; both belts are one mesh (cleats scrolled in the shader, cut out between the
// belts); the 20 road wheels, idlers and sprockets are one InstancedMesh (rolled by their instance matrices); plus the
// beacon's glow sprite. The contact shadow is added by the caller.

// Footprint (collisions, traffic) and the lamps' places on the model
const SNOWCAT_MODEL = {
  halfW: 2.2, // over the tracks / blade wings / tiller
  halfL: 3.6, // blade lip to the finisher's comb
  top: 3.45, // roof rack, light bar, beacon & winch boom
  mass: 9000,
  beacon: [0, 3.17, -0.35], // centre of the rotating beacon on the roof rack
  flood: [0, 3.09, 1.3], // the roof's LED light bar
  head: [0, 1.25, 2.42] // between the two headlamps in the nose
};
const BEACON_REV_PER_S = 1.6; // ~96 flashes a minute: one rotating reflector
// The tiller hangs on its hitch: raised (F) it turns up about the hitch's pivot, lowered its finisher lies on the snow
const TILLER_PIVOT = { y: 0.8, z: -2.3 };
const TILLER_RAISED = 0.33; // rad: the finisher's comb ~0.45 m off the snow

// Vertex "paints": colour, roughness, metalness and an emissive colour with its channel
// (0 none, 1 lamps & LEDs, 2 tail lamps, 3 beacon dome, 4 amber markers)
const P = {
  red: { c: 0xb3121b, r: 0.36, m: 0.3 },
  redDark: { c: 0x8a0d14, r: 0.45, m: 0.3 },
  black: { c: 0x1a1c1e, r: 0.62, m: 0.25 },
  rubber: { c: 0x0f1011, r: 0.92, m: 0 },
  steel: { c: 0x9ba2a8, r: 0.32, m: 0.8 },
  chrome: { c: 0xd5dadf, r: 0.18, m: 0.95 },
  grey: { c: 0x5c6267, r: 0.5, m: 0.45 },
  glass: { c: 0x0b1218, r: 0.05, m: 0.65 },
  orange: { c: 0xff6a00, r: 0.4, m: 0.1 },
  led: { c: 0xdfe6ee, r: 0.15, m: 0.1, e: [0.92, 0.96, 1.0], ch: 1 },
  lamp: { c: 0xfff6e0, r: 0.2, m: 0.1, e: [1.0, 0.95, 0.82], ch: 1 },
  tail: { c: 0x5a0a0a, r: 0.3, m: 0, e: [1.0, 0.04, 0.03], ch: 2 },
  beacon: { c: 0xff8a00, r: 0.22, m: 0, e: [1.0, 0.42, 0.0], ch: 3 },
  amber: { c: 0xc86a00, r: 0.3, m: 0, e: [1.0, 0.5, 0.0], ch: 4 }
};

// One geometry with the shared attribute set (position, normal, uv, tint, pbr, emi), non-indexed
function painted(geometry, paint, lift = 0) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count, c = new THREE.Color(paint.c);
  const tint = new Float32Array(n * 3), pbr = new Float32Array(n * 2), emi = new Float32Array(n * 4);
  const e = paint.e || [0, 0, 0];
  for (let i = 0; i < n; i++) {
    tint.set([c.r, c.g, c.b], i * 3);
    pbr.set([paint.r, paint.m], i * 2);
    emi.set([e[0], e[1], e[2], paint.ch || 0], i * 4);
  }
  g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
  g.setAttribute('pbr', new THREE.Float32BufferAttribute(pbr, 2));
  g.setAttribute('emi', new THREE.Float32BufferAttribute(emi, 4));
  g.setAttribute('lift', new THREE.Float32BufferAttribute(new Float32Array(n).fill(lift), 1)); // 1: part of the tiller
  return g;
}

// A profile in the side view ([z, y] points) extruded across x from x0 to x1 (rotated, not mirrored: faces stay outward)
function prismGeometry(points, x0, x1) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 6 });
  g.rotateY(Math.PI / 2);
  g.translate(x0, 0, 0);
  return g;
}

// A box along the segment a -> b (thickness w x h), e.g. arms, pillars, booms
function beamGeometry(a, b, w, h = w) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.BoxGeometry(w, h, len);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

// A cylinder along the segment a -> b (hydraulic rams, rails, poles)
function rodGeometry(a, b, r, segments = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

// Track layout: per side the belt runs around the drive sprocket (rear, raised), the idler (front) and four pairs of
// road wheels; [z, y, wheel radius]
const TRACK = { x: 1.48, width: 1.25, belt: 0.06 };
const TRACK_WHEELS = [
  [-2.0, 0.62, 0.4, 'sprocket'], [2.0, 0.55, 0.38, 'idler'],
  [-1.3, 0.38, 0.32], [-0.43, 0.38, 0.32], [0.44, 0.38, 0.32], [1.3, 0.38, 0.32]
];

// The belt's centre line in the side view: the convex hull around the wheels (plus the belt's thickness), resampled
// evenly, running clockwise (along the ground from the front to the back) as [z, y, arc length]
function beltLoop() {
  const pts = [];
  for (const [z, y, r] of TRACK_WHEELS) {
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      pts.push([z + (r + TRACK.belt) * Math.cos(a), y + (r + TRACK.belt) * Math.sin(a)]);
    }
  }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1)).reverse(); // CCW -> clockwise
  // Resample at ~5 cm
  const seg = [];
  let total = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(l);
    total += l;
  }
  const count = Math.ceil(total / 0.05), out = [];
  let i = 0, start = 0;
  for (let k = 0; k < count; k++) {
    const s = (k / count) * total;
    while (start + seg[i] < s) { start += seg[i]; i = (i + 1) % hull.length; }
    const a = hull[i], b = hull[(i + 1) % hull.length], t = seg[i] ? (s - start) / seg[i] : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, s]);
  }
  return { points: out, length: total };
}

// Both belts as one geometry: outer & inner faces and the two edges; uv.x = arc length (m), uv.y = 0..1 across
function buildBeltGeometry() {
  const { points, length } = beltLoop();
  const pos = [], nor = [], uvs = [];
  const n = points.length;
  const outward = (i) => {
    const a = points[(i - 1 + n) % n], b = points[(i + 1) % n];
    const tz = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tz, ty) || 1;
    return [-ty / l, tz / l]; // [nz, ny] for the clockwise loop
  };
  const tri = (verts, normal) => {
    // verts: 3 x { p: [x, y, z], n: [x, y, z], uv: [u, v] }, wound to face `normal`
    const [a, b, c] = verts;
    const ux = b.p[0] - a.p[0], uy = b.p[1] - a.p[1], uz = b.p[2] - a.p[2];
    const vx = c.p[0] - a.p[0], vy = c.p[1] - a.p[1], vz = c.p[2] - a.p[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const order = cx * normal[0] + cy * normal[1] + cz * normal[2] < 0 ? [a, c, b] : [a, b, c];
    for (const v of order) { pos.push(...v.p); nor.push(...v.n); uvs.push(...v.uv); }
  };
  const quad = (a, b, c, d, normal) => { tri([a, b, c], normal); tri([a, c, d], normal); };
  for (const side of [-1, 1]) {
    const x0 = side * TRACK.x - TRACK.width / 2, x1 = side * TRACK.x + TRACK.width / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [z0, y0, s0] = points[i], [z1, y1] = points[j];
      const s1 = j === 0 ? length : points[j][2];
      const [nz0, ny0] = outward(i), [nz1, ny1] = outward(j);
      const t = TRACK.belt;
      const o = (x, z, y, nz, ny, u, v) => ({ p: [x, y, z], n: [0, ny, nz], uv: [u, v] });
      const inn = (x, z, y, nz, ny, u, v) => ({ p: [x, y - ny * t, z - nz * t], n: [0, -ny, -nz], uv: [u, v] });
      const midN = [0, (ny0 + ny1) / 2, (nz0 + nz1) / 2];
      quad(o(x0, z0, y0, nz0, ny0, s0, 0), o(x1, z0, y0, nz0, ny0, s0, 1), o(x1, z1, y1, nz1, ny1, s1, 1), o(x0, z1, y1, nz1, ny1, s1, 0), midN);
      quad(inn(x0, z0, y0, nz0, ny0, s0, 0), inn(x1, z0, y0, nz0, ny0, s0, 1), inn(x1, z1, y1, nz1, ny1, s1, 1), inn(x0, z1, y1, nz1, ny1, s1, 0),
        [0, -midN[1], -midN[2]]);
      for (const [x, v, nx] of [[x0, 0, -1], [x1, 1, 1]]) {
        const e = (z, y, nz, ny, u, inner) => ({ p: [x, y - (inner ? ny * t : 0), z - (inner ? nz * t : 0)], n: [nx, 0, 0], uv: [u, v] });
        quad(e(z0, y0, nz0, ny0, s0, false), e(z1, y1, nz1, ny1, s1, false), e(z1, y1, nz1, ny1, s1, true), e(z0, y0, nz0, ny0, s0, true), [nx, 0, 0]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return { geometry: g, length };
}

// The belts' material: aluminium cleats (Stege) across four rubber belts, open between the belts (cut out), scrolled
// with each side's trackPhase (m) so the cleats stay put on the snow while the groomer drives
function createBeltMaterial(phaseLeft, phaseRight, loopLength) {
  const pitch = loopLength / Math.round(loopLength / 0.3); // a whole number of cleats around the loop
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  const phase = mix(phaseLeft, phaseRight, step(0, positionGeometry.x));
  const along = fract(uv().x.add(phase).div(pitch));
  const cleat = float(1).sub(smoothstep(0.22, 0.26, along)).mul(smoothstep(0.0, 0.03, along));
  const across = fract(uv().y.mul(3).add(0.5)).sub(0.5).abs(); // distance to the nearest belt (0 at its middle)
  const belt = float(1).sub(smoothstep(0.2, 0.24, across));
  const solid = cleat.max(belt);
  m.colorNode = mix(vec3(0.03, 0.032, 0.035), vec3(0.42, 0.44, 0.46).mul(along.mul(2).add(0.6).min(1)), cleat);
  m.roughnessNode = mix(float(0.92), float(0.38), cleat);
  m.metalnessNode = mix(float(0), float(0.75), cleat);
  m.opacityNode = solid;
  m.alphaTest = 0.5;
  return m;
}

// The body material: everything comes from the vertex attributes; the lamp channels glow with lampGlow (0 by day,
// 1 at night while driven), the beacon dome with a bright lobe that turns with beamDir (its reflector)
function createBodyMaterial({ lampGlow, beaconOn, beamDir, tillerLift }) {
  const m = new THREE.MeshStandardNodeMaterial();
  // The tiller's parts (lift 1) turn about the hitch's cross axis by tillerLift (normals left as they are: a few degrees)
  const angle = tillerLift.mul(attribute('lift', 'float'));
  const py = positionLocal.y.sub(TILLER_PIVOT.y), pz = positionLocal.z.sub(TILLER_PIVOT.z);
  m.positionNode = vec3(positionLocal.x,
    py.mul(cos(angle)).sub(pz.mul(sin(angle))).add(TILLER_PIVOT.y),
    py.mul(sin(angle)).add(pz.mul(cos(angle))).add(TILLER_PIVOT.z));
  const emi = attribute('emi', 'vec4'), pbr = attribute('pbr', 'vec2');
  const ch = emi.w;
  const channel = (k) => float(1).sub(ch.sub(k).abs().min(1));
  const [bx, , bz] = SNOWCAT_MODEL.beacon;
  const toVertex = vec2(positionGeometry.x.sub(bx), positionGeometry.z.sub(bz));
  const lobe = toVertex.normalize().dot(beamDir).max(0).pow(6);
  const lamp = lampGlow.mul(6).add(0.04);
  const tail = lampGlow.min(1).mul(2.2).add(0.03);
  const beacon = beaconOn.mul(lobe.mul(16).add(0.9)).add(0.05);
  m.colorNode = attribute('tint', 'vec3');
  m.roughnessNode = pbr.x;
  m.metalnessNode = pbr.y;
  m.emissiveNode = emi.xyz.mul(channel(1).mul(lamp).add(channel(2).mul(tail)).add(channel(3).mul(beacon)).add(channel(4).mul(0.35)));
  return m;
}

// The whole body, merged
function buildBodyGeometry() {
  const parts = [];
  let lift = 0; // set for the tiller's parts, which turn up when it is raised
  const add = (geometry, paint) => parts.push(painted(geometry, paint, lift));
  const box = (w, h, d, x, y, z, paint, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z);
    add(g, paint);
  };
  const cyl = (rt, rb, h, x, y, z, paint, axis = 'y', seg = 16) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    add(g, paint);
  };
  const both = (fn) => { fn(-1); fn(1); };

  // --- Chassis & running gear (black frame between the tracks, the bogie beams inside them)
  box(1.7, 0.6, 4.45, 0, 0.72, -0.02, P.black);
  both((s) => {
    box(0.18, 0.2, 3.3, s * TRACK.x, 0.38, 0, P.black); // bogie beam between the twin road wheels
    for (const [z] of TRACK_WHEELS.slice(2)) box(0.62, 0.12, 0.12, s * (TRACK.x - 0.3), 0.38, z, P.black); // axles
  });

  // --- Hull: red deck, black mudguards over the tracks, red nose with the headlamps
  box(2.44, 0.46, 4.3, 0, 1.23, -0.12, P.red);
  both((s) => {
    const [a, b] = s < 0 ? [-2.12, -1.2] : [1.2, 2.12];
    add(prismGeometry([[-2.25, 1.12], [1.8, 1.12], [2.35, 0.9], [2.35, 0.97], [1.83, 1.19], [-2.25, 1.19]], a, b), P.black);
    box(0.06, 0.1, 4.1, s * 2.11, 1.12, -0.2, P.black); // the guard's rolled edge
  });
  add(prismGeometry([[1.3, 1.0], [2.42, 1.0], [2.42, 1.44], [2.02, 1.76], [1.3, 1.76]], -1.12, 1.12), P.red);
  box(0.9, 0.22, 0.02, 0, 1.22, 2.425, P.black); // grille between the lamps
  for (let k = 0; k < 3; k++) box(0.86, 0.025, 0.02, 0, 1.15 + k * 0.07, 2.44, P.grey);
  both((s) => {
    cyl(0.12, 0.12, 0.06, s * 0.72, 1.25, 2.43, P.lamp, 'z', 18); // headlamps
    cyl(0.145, 0.145, 0.04, s * 0.72, 1.25, 2.415, P.black, 'z', 18); // their bezels
    box(0.14, 0.08, 0.03, s * 0.98, 1.25, 2.43, P.amber); // indicators
  });
  box(1.9, 0.16, 0.18, 0, 1.0, 2.36, P.black); // bumper / blade mount
  box(0.28, 0.16, 0.12, 0, 0.92, 2.48, P.steel); // towing eye

  // --- Cab: red lower band, large glazing all round, black pillars, red roof with a sun visor
  const CAB = { x: 0.97, z0: -0.52, z1: 1.42, zTop: 1.25, y0: 1.46, yBelt: 1.76, yTop: 2.82 };
  box(2.02, CAB.yBelt - CAB.y0, CAB.z1 - CAB.z0, 0, (CAB.y0 + CAB.yBelt) / 2, (CAB.z0 + CAB.z1) / 2, P.red);
  add(prismGeometry([[CAB.z0 + 0.02, CAB.yBelt], [CAB.z1 - 0.02, CAB.yBelt], [CAB.zTop, CAB.yTop], [CAB.z0 + 0.02, CAB.yTop]], -CAB.x, CAB.x), P.glass);
  both((s) => {
    const x = s * (CAB.x + 0.01);
    add(beamGeometry([x, CAB.yBelt, CAB.z1 - 0.02], [x, CAB.yTop, CAB.zTop], 0.07), P.black); // A pillar
    box(0.07, CAB.yTop - CAB.yBelt, 0.07, x, (CAB.yBelt + CAB.yTop) / 2, CAB.z0 + 0.02, P.black); // C pillar
    box(0.07, CAB.yTop - CAB.yBelt, 0.06, x, (CAB.yBelt + CAB.yTop) / 2, 0.42, P.black); // door frame
    box(0.05, 0.05, CAB.z1 - CAB.z0, x, CAB.yBelt + 0.02, (CAB.z0 + CAB.z1) / 2, P.black); // window sill
    box(0.04, 0.04, 0.22, x + s * 0.02, 2.0, 0.25, P.chrome); // door handle
    add(rodGeometry([x + s * 0.04, 1.85, -0.45], [x + s * 0.04, 2.6, -0.45], 0.022), P.chrome); // grab handle
    // Mirror on its arm off the A pillar
    add(beamGeometry([x, 2.42, 1.3], [s * 1.38, 2.38, 1.36], 0.04), P.black);
    box(0.05, 0.32, 0.2, s * 1.4, 2.28, 1.36, P.black);
    box(0.02, 0.27, 0.16, s * 1.4, 2.28, 1.42, P.glass);
    // Steps up to the door on the mudguard
    box(0.34, 0.04, 0.3, s * 1.32, 1.26, 0.55, P.steel);
  });
  box(1.94, 0.06, 0.07, 0, CAB.yBelt + 0.02, CAB.z1 - 0.01, P.black); // windscreen's lower frame
  box(2.0, 0.07, 0.07, 0, CAB.yTop - 0.02, CAB.zTop, P.black); // its upper frame
  add(beamGeometry([-0.55, 1.85, CAB.z1 - 0.01], [-0.15, 2.45, CAB.z1 - 0.1], 0.025), P.black); // wipers
  add(beamGeometry([0.25, 1.85, CAB.z1 - 0.01], [0.65, 2.45, CAB.z1 - 0.1], 0.025), P.black);
  box(2.12, 0.1, 2.0, 0, 2.87, 0.38, P.red); // roof
  box(2.0, 0.04, 0.22, 0, 2.86, 1.42, P.black, -0.25); // sun visor

  // --- Roof rack (Dachträger) with the LED light bar in front, work lamps at the back and the beacon in the middle
  both((s) => {
    for (const z of [-0.45, 1.2]) box(0.05, 0.1, 0.05, s * 0.88, 2.97, z, P.black); // posts
    box(0.06, 0.06, 1.85, s * 0.88, 3.03, 0.38, P.black); // rails
    box(0.24, 0.13, 0.08, s * 0.72, 3.05, -0.52, P.lamp); // rear work lamps (face backwards)
    box(0.27, 0.16, 0.06, s * 0.72, 3.05, -0.48, P.black);
    box(0.2, 0.12, 0.06, s * 0.88, 2.73, 1.34, P.lamp); // work lamps under the roof's front corners
  });
  for (const z of [-0.45, 0.38]) box(1.8, 0.05, 0.05, 0, 3.03, z, P.black); // cross bars
  box(1.92, 0.15, 0.2, 0, 3.09, 1.28, P.black); // light bar housing
  for (let k = 0; k < 10; k++) box(0.15, 0.08, 0.02, -0.81 + k * 0.18, 3.09, 1.385, P.led);
  const [bx, by, bz] = SNOWCAT_MODEL.beacon;
  cyl(0.15, 0.17, 0.08, bx, 3.08, bz, P.black, 'y', 20); // beacon base
  cyl(0.125, 0.135, 0.2, bx, by, bz, P.beacon, 'y', 24); // dome
  {
    const cap = new THREE.SphereGeometry(0.125, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.translate(bx, by + 0.1, bz);
    add(cap, P.beacon);
  }

  // --- Engine hood behind the cab, with louvres, tail lamps, exhaust
  add(prismGeometry([[-2.36, 1.46], [-0.5, 1.46], [-0.5, 2.26], [-1.95, 2.26], [-2.36, 1.96]], -1.18, 1.18), P.red);
  both((s) => {
    for (let k = 0; k < 4; k++) box(0.03, 0.035, 1.0, s * 1.185, 1.68 + k * 0.11, -1.35, P.black); // side louvres
    box(0.24, 0.13, 0.04, s * 0.92, 1.72, -2.37, P.tail);
    box(0.12, 0.08, 0.04, s * 0.92, 1.58, -2.37, P.amber);
  });
  box(1.2, 0.34, 0.03, 0, 1.72, -2.375, P.black); // rear grille
  for (let k = 0; k < 4; k++) box(1.15, 0.025, 0.02, 0, 1.6 + k * 0.08, -2.39, P.grey);
  cyl(0.06, 0.06, 0.6, 0.95, 2.5, -0.7, P.steel, 'y', 10); // exhaust stack
  cyl(0.075, 0.06, 0.1, 0.95, 2.82, -0.7, P.black, 'y', 10);

  // --- Winch on the hood: turret, red drum housing, boom reaching back over the tiller with its sheave
  cyl(0.5, 0.52, 0.14, 0, 2.33, -1.35, P.black, 'y', 24);
  box(0.95, 0.5, 0.8, 0, 2.65, -1.35, P.red);
  cyl(0.24, 0.24, 1.0, 0, 2.66, -1.35, P.grey, 'x', 18); // drum ends showing
  add(beamGeometry([0, 2.9, -1.0], [0, 3.32, -2.85], 0.2, 0.18), P.black);
  cyl(0.15, 0.15, 0.12, 0, 3.3, -2.88, P.steel, 'x', 16);
  add(rodGeometry([0, 3.2, -2.95], [0, 1.3, -3.05], 0.012, 6), P.grey); // rope down to its hook
  box(0.08, 0.12, 0.08, 0, 1.26, -3.05, P.orange);

  // --- 12-way blade: centre section and two wings on hinges, red moldboards with a steel cutting edge; push frame and
  // rams behind it, marker poles on the wing tips
  const BLADE = { z: 2.98, half: 1.12, wing: 1.06, wingAngle: 0.42, height: 1.12 };
  const moldboard = () => {
    const front = [], back = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const z = BLADE.z + 0.55 * (t - 0.5) ** 2 + 0.08 * t ** 4;
      front.push([z, 0.04 + BLADE.height * t]);
      back.push([z - 0.06, 0.04 + BLADE.height * t]);
    }
    return front.concat(back.reverse());
  };
  add(prismGeometry(moldboard(), -BLADE.half, BLADE.half), P.red);
  box(BLADE.half * 2, 0.12, 0.07, 0, 0.1, BLADE.z + 0.15, P.steel); // cutting edge
  both((s) => {
    // Wings: built from the hinge outwards, swung forward about it
    const [a, b] = s > 0 ? [0, BLADE.wing] : [-BLADE.wing, 0];
    const wingParts = [painted(prismGeometry(moldboard(), a, b), P.red), painted((() => {
      const g = new THREE.BoxGeometry(BLADE.wing, 0.12, 0.07);
      g.translate(s * BLADE.wing / 2, 0.1, BLADE.z + 0.15);
      return g;
    })(), P.steel)];
    for (const g of wingParts) {
      g.translate(0, 0, -BLADE.z);
      g.rotateY(-s * BLADE.wingAngle);
      g.translate(s * BLADE.half, 0, BLADE.z);
      parts.push(g);
    }
    cyl(0.06, 0.06, BLADE.height + 0.05, s * BLADE.half, 0.6, BLADE.z - 0.05, P.steel, 'y', 10); // hinge
    // Marker pole at the wing tip
    const tipX = s * (BLADE.half + BLADE.wing * Math.cos(BLADE.wingAngle)), tipZ = BLADE.z + BLADE.wing * Math.sin(BLADE.wingAngle) - 0.05;
    add(rodGeometry([tipX, BLADE.height, tipZ], [tipX, BLADE.height + 0.75, tipZ], 0.018, 6), P.orange);
    add(rodGeometry([tipX, BLADE.height + 0.75, tipZ], [tipX, BLADE.height + 0.95, tipZ], 0.02, 6), P.black);
    // Push arms, lift and wing rams
    add(beamGeometry([s * 0.75, 0.72, 2.2], [s * 0.85, 0.55, BLADE.z - 0.1], 0.16), P.black);
    add(rodGeometry([s * 0.55, 1.36, 2.4], [s * 0.6, 1.0, BLADE.z - 0.08], 0.055), P.black);
    add(rodGeometry([s * 0.57, 1.18, 2.7], [s * 0.6, 1.0, BLADE.z - 0.08], 0.035), P.chrome);
    add(rodGeometry([s * 0.7, 0.75, BLADE.z - 0.12], [s * 1.25, 0.75, BLADE.z - 0.08], 0.05), P.black);
    add(rodGeometry([s * 1.25, 0.75, BLADE.z - 0.08], [s * 1.75, 0.75, BLADE.z + 0.12], 0.03), P.chrome);
    for (const x of [0.4, 0.9]) box(0.06, BLADE.height * 0.8, 0.14, s * x, 0.58, BLADE.z - 0.09, P.redDark); // ribs
  });
  box(1.9, 0.16, 0.16, 0, 0.6, BLADE.z - 0.12, P.black); // C-frame's cross beam

  // --- Tiller behind: hitch, red rotor housing, black side plates and flaps, the rubber finisher mat with its comb
  lift = 1;
  both((s) => add(beamGeometry([s * 0.6, 0.78, -2.25], [s * 0.75, 0.55, -2.75], 0.14), P.black));
  add(rodGeometry([0, 1.44, -2.36], [0, 0.85, -2.72], 0.055), P.black);
  add(rodGeometry([0, 1.12, -2.55], [0, 0.85, -2.72], 0.035), P.chrome);
  box(0.9, 0.2, 0.25, 0, 0.62, -2.72, P.black); // hitch frame
  const TILLER = { z: -2.95, y: 0.36, r: 0.38, half: 2.15 };
  const housing = [];
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI;
    housing.push([TILLER.z + TILLER.r * Math.cos(a), TILLER.y + TILLER.r * Math.sin(a)]);
  }
  housing.push([TILLER.z - TILLER.r, 0.12], [TILLER.z + TILLER.r, 0.12]);
  add(prismGeometry(housing, -TILLER.half, TILLER.half), P.red);
  both((s) => {
    box(0.05, 0.62, 0.95, s * (TILLER.half + 0.02), 0.4, TILLER.z, P.black); // side plates
    box(0.05, 0.3, 0.4, s * (TILLER.half + 0.02), 0.22, TILLER.z - 0.45, P.black); // side flaps of the mat
  });
  box(TILLER.half * 2, 0.06, 0.2, 0, TILLER.y + TILLER.r + 0.02, TILLER.z + 0.05, P.black); // top rail
  add(prismGeometry([[-3.3, 0.34], [-3.34, 0.3], [-3.38, 0.27], [-3.4, 0.24], [-3.6, 0.03], [-3.6, 0.0], [-3.36, 0.21], [-3.3, 0.29]],
    -TILLER.half, TILLER.half), P.rubber);
  for (let k = 0; k < 42; k++) box(0.035, 0.02, 0.06, -2.07 + k * 0.101, 0.015, -3.62, P.rubber); // comb teeth

  return mergeGeometries(parts);
}

// One road wheel (radius & width 1, axle along x): a pneumatic tyre on a grey rim with spokes, so its turning shows
function buildWheelGeometry() {
  const parts = [];
  const tyre = new THREE.LatheGeometry([
    [0.62, -0.5], [0.86, -0.5], [0.97, -0.4], [1.0, -0.2], [1.0, 0.2], [0.97, 0.4], [0.86, 0.5], [0.62, 0.5]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 22);
  parts.push(painted(tyre.rotateZ(Math.PI / 2), P.rubber));
  const rim = new THREE.CylinderGeometry(0.63, 0.63, 0.9, 22);
  parts.push(painted(rim.rotateZ(Math.PI / 2), P.grey));
  for (let k = 0; k < 3; k++) {
    for (const x of [-0.46, 0.46]) {
      const spoke = new THREE.BoxGeometry(0.02, 1.15, 0.14).rotateX((k * Math.PI) / 3);
      spoke.translate(x, 0, 0);
      parts.push(painted(spoke, P.steel));
    }
  }
  const hub = new THREE.CylinderGeometry(0.18, 0.18, 0.96, 12).rotateZ(Math.PI / 2);
  parts.push(painted(hub, P.black));
  return mergeGeometries(parts);
}

// Builds the model: { group, trackPhases [left, right], lampGlow, beacon: { on, dir, world }, wheels, ... }
function buildSnowcatModel() {
  const group = new THREE.Group();
  const lampGlow = uniform(0);
  const beaconOn = uniform(1);
  const beamDir = uniform(new THREE.Vector2(0, 1)); // the reflector's direction in the model frame (x, z)
  const beamWorld = uniform(new THREE.Vector3(0, 0, 1)); // ... and in the world (for the glow sprite)
  const tillerLift = uniform(0); // rad, 0 lowered ... TILLER_RAISED

  const body = new THREE.Mesh(buildBodyGeometry(), createBodyMaterial({ lampGlow, beaconOn, beamDir, tillerLift }));
  body.name = 'SnowcatBody';
  group.add(body);

  const trackPhases = [uniform(0), uniform(0)];
  const belt = buildBeltGeometry();
  const belts = new THREE.Mesh(belt.geometry, createBeltMaterial(trackPhases[0], trackPhases[1], belt.length));
  belts.name = 'SnowcatTracks';
  group.add(belts);

  // Wheels: twin road wheels on four axles, the idler and the sprocket per side
  const wheelSlots = [];
  for (const side of [-1, 1]) {
    for (const [z, y, r, kind] of TRACK_WHEELS) {
      if (kind) wheelSlots.push({ side, x: side * TRACK.x, y, z, r, w: 0.95 });
      else for (const o of [-0.3, 0.3]) wheelSlots.push({ side, x: side * TRACK.x + o, y, z, r, w: 0.42 });
    }
  }
  const wheels = new THREE.InstancedMesh(buildWheelGeometry(), createBodyMaterial({ lampGlow, beaconOn, beamDir, tillerLift }), wheelSlots.length);
  wheels.name = 'SnowcatWheels';
  wheels.frustumCulled = false; // the instances stay within the group's footprint
  group.add(wheels);
  const m = new THREE.Matrix4(), rot = new THREE.Matrix4();
  const rollWheels = (phaseLeft, phaseRight) => {
    wheelSlots.forEach((w, i) => {
      // Rolling forward (phase falling) turns the wheels' tops forward
      rot.makeRotationX(-(w.side < 0 ? phaseLeft : phaseRight) / w.r);
      m.makeScale(w.w, w.r, w.r).premultiply(rot).setPosition(w.x, w.y, w.z);
      wheels.setMatrixAt(i, m);
    });
    wheels.instanceMatrix.needsUpdate = true;
  };
  rollWheels(0, 0);

  // The beacon's glow: an additive sprite that flares whenever the reflector sweeps past the camera
  const glowMaterial = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const center = modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xyz;
  const facing = beamWorld.dot(cameraPosition.sub(center).normalize()).max(0).pow(12);
  const radial = float(1).sub(uv().sub(0.5).length().mul(2)).max(0);
  glowMaterial.colorNode = vec3(1.0, 0.5, 0.1);
  glowMaterial.opacityNode = radial.pow(2.2).mul(beaconOn).mul(facing.mul(1.6).add(0.12));
  const glow = new THREE.Sprite(glowMaterial);
  glow.name = 'SnowcatBeaconGlow';
  glow.position.set(SNOWCAT_MODEL.beacon[0], SNOWCAT_MODEL.beacon[1] + 0.05, SNOWCAT_MODEL.beacon[2]);
  glow.scale.set(1.5, 1.5, 1);
  glow.renderOrder = 999;
  group.add(glow);

  return { group, body, belts, wheels, glow, trackPhases, lampGlow, beacon: { on: beaconOn, dir: beamDir, world: beamWorld }, tillerLift, rollWheels };
}

export { buildSnowcatModel, SNOWCAT_MODEL, BEACON_REV_PER_S, TILLER_RAISED };
