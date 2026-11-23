import * as THREE from 'three/webgpu';
import { attribute, cos, float, floor, fract, hash, mix, mx_noise_float, positionView, positionWorld, sin, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial } from './building-kit.js';
import { onWall } from './spital-data.js';
import { ST_JOHANN, spireRing, towerSides } from './st-johann-data.js';

export { ST_JOHANN };

// The tower of St. Johann rebuilt by hand (js/st-johann-data.js), standing in for its swissBUILDINGS3D volume, which
// the streamed tiles drew white with the churches' tall windows in stripes up the shaft and the spire: the roughcast
// shaft with a course under the eaves, the four gables and the cross roof behind them, the shingled spire turning an
// eighth of a turn up to its tip, the gilt ball; a dial on each side, two pointed sound openings in each gable and a
// slit under the dial from one small canvas atlas. The dials' hands show the game's time: the eight of them are one
// mesh, turned about their axes in the vertex shader by two uniforms (setTime). The masonry and the ball are one
// vertex-coloured material, the shingles another, the decals a third. (The nave keeps its streamed volume.)

excludeBuildings([ST_JOHANN.exclude]);

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
function materials() {
  const M = {};
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  if (QUALITY.simpleMaterials) {
    M.shingles = SIMPLE_SKINS.plain([0.2, 0.1, 0.055], 0.8);
    return M;
  }
  // Larch shingles gone red-brown: rows of 22 cm, every shingle a shade of its own, the rows' shadow lines
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0 });
  const U = uv().x, V = uv().y;
  const fine = float(1).sub(smoothstep(30, 110, positionView.z.negate()));
  const row = floor(V.div(0.22)), col = floor(U.add(fract(row.mul(0.5)).mul(0.14)).div(0.14));
  const shade = hash(row.mul(57.3).add(col.mul(131.7))).sub(0.5).mul(0.35).mul(fine);
  const edge = smoothstep(0.12, 0.0, fract(V.div(0.22))).mul(fine);
  const weather = mx_noise_float(positionWorld.mul(0.5)).mul(0.5).add(0.5);
  m.colorNode = mix(vec3(0.17, 0.08, 0.045), vec3(0.27, 0.135, 0.07), weather.add(shade)).mul(float(1).sub(edge.mul(0.4)));
  M.shingles = m;
  return M;
}

// --- The dial and the openings: one canvas atlas -----------------------------------------------------------------------
const ATLAS_SIZE = [512, 512];
export const ATLAS = {
  dial: [0, 0, 384, 384],
  openings: [388, 0, 120, 166],
  slit: [388, 180, 40, 100]
};
function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.lineCap = 'butt';
  // a pointed opening: a slot under a pointed arch
  const lancet = (x, y, w, h, colour) => {
    g.fillStyle = colour; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w * 0.9);
    g.quadraticCurveTo(x, y + w * 0.25, x + w / 2, y); g.quadraticCurveTo(x + w, y + w * 0.25, x + w, y + w * 0.9);
    g.lineTo(x + w, y + h); g.closePath(); g.fill();
  };
  const DARK = '#1c1a18';
  // The dial: twelve plain strokes on the plaster (longer at the quarters), the hands' boss, a small arched opening
  // over their axis
  cell('dial', (w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2 - 6;
    g.strokeStyle = DARK;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, quarter = i % 3 === 0;
      g.lineWidth = quarter ? 11 : 8;
      g.beginPath(); g.moveTo(cx + Math.sin(a) * R * (quarter ? 0.74 : 0.8), cy - Math.cos(a) * R * (quarter ? 0.74 : 0.8)); g.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); g.stroke();
    }
    lancet(cx - 13, cy - 62, 26, 48, DARK);
    // (the hands are a mesh, turning with the game's clock: handsMesh)
    g.fillStyle = '#2a2622'; g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill();
  });
  // The gable's two sound openings, a post between them
  cell('openings', (w, h) => { lancet(6, 4, 46, h - 6, DARK); lancet(68, 4, 46, h - 6, DARK); });
  cell('slit', (w, h) => lancet(4, 2, w - 8, h - 4, DARK));
  return canvasTexture(c);
}

// --- The hands ---------------------------------------------------------------------------------------------------------
// The hour and the minute hand of the four dials, one mesh: every vertex carries its dial's middle (aAxis), the dial's
// direction to the right for someone before it (aRight), and its place on the hand pointing at twelve (position: x
// across, y along, z out of the wall); aHand says which hand (0 the hour's, 1 the minute's). The two angles (rad,
// clockwise from twelve) are uniforms.
const hourAngle = uniform(0), minuteAngle = uniform(0);
/** The hands' angles at `minute` of the day (rad, clockwise from twelve): [hour hand, minute hand] */
export const handAngles = (minute) => [((minute / 720) % 1) * Math.PI * 2, ((minute / 60) % 1) * Math.PI * 2];
function handsMesh(sides) {
  const T = ST_JOHANN, pos = [], axis = [], right = [], hand = [], nrm = [];
  for (const F of sides) {
    const [ax, az] = onWall(F, F.len / 2, 0);
    // (a flat tapering blade from a little behind the axis to its tip: two triangles)
    [[T.dial.r * 0.52, 0.2, 0.06], [T.dial.r * 0.84, 0.13, 0.09]].forEach(([len, width, out], k) => {
      const q = [[-width / 2, -len * 0.14], [width / 2, -len * 0.14], [width * 0.3, len], [-width * 0.3, len]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(q[i][0], q[i][1], out); axis.push(ax, T.dial.y, az); right.push(F.u[0], 0, F.u[1]); hand.push(k); nrm.push(F.n[0], 0, F.n[1]);
      }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aAxis', new THREE.Float32BufferAttribute(axis, 3));
  g.setAttribute('aRight', new THREE.Float32BufferAttribute(right, 3));
  g.setAttribute('aHand', new THREE.Float32BufferAttribute(hand, 1));
  // (the vertices lie round the origin until the shader places them: the bounds are the tower's)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(T.centre[0], T.dial.y, T.centre[1]), T.half * 2);
  g.boundingBox = new THREE.Box3().setFromCenterAndSize(g.boundingSphere.center, new THREE.Vector3(T.half * 4, T.dial.r * 2.2, T.half * 4));
  const m = new THREE.MeshStandardNodeMaterial({ color: 0x15130f, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  const p = attribute('position', 'vec3'), r = attribute('aRight', 'vec3'), a = mix(hourAngle, minuteAngle, attribute('aHand', 'float'));
  // clockwise for someone before the dial: twelve is up, three is to the right
  const x = p.x.mul(cos(a)).add(p.y.mul(sin(a))), y = p.y.mul(cos(a)).sub(p.x.mul(sin(a)));
  const out = vec3(r.z.negate(), 0, r.x); // (the wall's outward normal: −u.z, u.x)
  m.positionNode = attribute('aAxis', 'vec3').add(r.mul(x)).add(vec3(0, 1, 0).mul(y)).add(out.mul(p.z));
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'St. Johann hands';
  return mesh;
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = { plaster: [0.34, 0.315, 0.265], course: [0.27, 0.25, 0.21], gilt: [0.75, 0.52, 0.12], rod: [0.12, 0.12, 0.13] };

/**
 * Builds the tower into `scene`. Returns { group, colliders, setTime } (no colliders: the walls are OpenStreetMap's
 * footprint's, js/buildings.js); setTime(minute of the day) turns the dials' hands.
 */
export function buildStJohann(scene) {
  const T = ST_JOHANN;
  const root = new THREE.Group();
  root.name = 'St. Johann';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'none', name: 'St. Johann' }), M = materials();
  const side = T.half * 2, rise = T.gable - T.eaves, sides = towerSides();
  for (const F of sides) {
    const P = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
    // the shaft's side, the course under the eaves, the gable over it
    B.quad('trim', P(0, 0, T.base), P(side, 0, T.base), P(side, 0, T.eaves), P(0, 0, T.eaves), undefined, { colour: C.plaster });
    B.box('trim', F, -0.14, side + 0.14, 0, 0.14, T.eaves - 0.45, T.eaves - 0.15, C.course);
    B.tri('trim', P(0, 0, T.eaves), P(side, 0, T.eaves), P(side / 2, 0, T.gable), undefined, { colour: C.plaster });
    // the cross roof: from this side's eaves up to the ridge through the tower's middle (the gables to its left and
    // right stand before it), and the two verges of this side's gable, a hand before the plaster
    B.quad('shingles', P(0, 0, T.eaves), P(side, 0, T.eaves), P(side, -T.half, T.gable), P(0, -T.half, T.gable), [[0, 0], [side, 0], [side, Math.hypot(T.half, rise)], [0, Math.hypot(T.half, rise)]]);
    const verge = Math.hypot(side / 2, rise);
    for (const [s0, s1] of [[0, side / 2], [side, side / 2]]) {
      // (a board along the gable's edge, its top face in shingles)
      const a = P(s0, 0.18, T.eaves - 0.1), b = P(s1, 0.18, T.gable + 0.12), a2 = P(s0, -0.3, T.eaves - 0.1), b2 = P(s1, -0.3, T.gable + 0.12);
      const up = s0 < s1 ? [a, b, b2, a2] : [a, a2, b2, b]; // (facing up either way)
      B.quad('shingles', ...up, [[0, 0], [0.48, 0], [0.48, verge], [0, verge]]);
      const lo = (p) => [p[0], p[1] - 0.22, p[2]];
      B.quad('trim', ...(s0 < s1 ? [lo(a), lo(b), b, a] : [lo(b), lo(a), a, b]), undefined, { colour: C.course });
    }
    // the dial, the sound openings in the gable, the slit under the dial
    const mid = side / 2;
    B.decal(F, mid - T.dial.r, mid + T.dial.r, 0.03, T.dial.y - T.dial.r, T.dial.y + T.dial.r, 'dial');
    B.decal(F, mid - T.openings.w / 2, mid + T.openings.w / 2, 0.03, T.openings.y, T.openings.y + T.openings.h, 'openings');
    B.decal(F, mid - T.slit.w / 2, mid + T.slit.w / 2, 0.03, T.slit.y, T.slit.y + T.slit.h, 'slit');
  }
  // the spire: ring over ring, each turned a little further
  const { sides: faces, rings } = T.spire, [cx, cz] = T.centre, a0 = Math.atan2(T.along[1], T.along[0]);
  const ring = (k) => {
    const q = spireRing(k);
    return Array.from({ length: faces }, (_, i) => { const a = a0 + q.turn + (i / faces) * Math.PI * 2; return [cx + Math.cos(a) * q.r, q.y, cz + Math.sin(a) * q.r]; });
  };
  for (let k = 0; k < rings; k++) {
    const lo = ring(k), hi = ring(k + 1), q0 = spireRing(k), q1 = spireRing(k + 1);
    const w0 = 2 * q0.r * Math.sin(Math.PI / faces), w1 = 2 * q1.r * Math.sin(Math.PI / faces);
    for (let i = 0; i < faces; i++) {
      const j = (i + 1) % faces;
      // (seen from outside the angle grows to the left: lo[j] is on the left of lo[i]; uv in metres, the face's middle at u 0)
      B.quad('shingles', lo[j], lo[i], hi[i], hi[j], [[i * 3 - w0 / 2, q0.y], [i * 3 + w0 / 2, q0.y], [i * 3 + w1 / 2, q1.y], [i * 3 - w1 / 2, q1.y]]);
    }
  }
  const meshes = B.meshes({ ...M, decal: decalMaterial(atlasTexture()) });
  root.add(...meshes, handsMesh(sides));
  // the ball on the tip and its rod (their own small geometries, in the masonry's material)
  const ball = new THREE.SphereGeometry(T.ball.r, 14, 10);
  ball.translate(cx, T.ball.y, cz);
  const rod = new THREE.CylinderGeometry(0.025, 0.04, T.ball.rod - T.spire.tip + 0.6, 6);
  rod.translate(cx, (T.ball.rod + T.spire.tip - 0.6) / 2, cz);
  for (const [geo, colour] of [[ball, C.gilt], [rod, C.rod]]) {
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(colour, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, M.trim);
    mesh.name = 'St. Johann finial';
    mesh.castShadow = true;
    root.add(mesh);
  }
  scene.add(root);
  const setTime = (minute) => { [hourAngle.value, minuteAngle.value] = handAngles(minute); };
  setTime(10 * 60 + 10);
  return { group: root, colliders: [], setTime };
}
