// Builds assets/models/quad.glb, the body and the wheels of the quad (js/quad.js), from
// "One-Piece Military Quad Bike "AM-1" – Print in Place, No Assembly" by qMeats
// (https://www.printables.com/model/1748892-one-piece-military-quad-bike-am-1-print-in-place-n), published there as
// Creative Commons Public Domain (CC0 1.0) — the credit stays in the file's asset.extras.
//
// The source is a print model in mm (binary STL, one fused watertight shell of 175k triangles, Z up, the quad along y,
// its front at -y). Here it is turned into the quad's object space (origin on the ground under the middle of the
// wheelbase, z forward, y up, metres; SCALE: the wheelbase 1.34 m) and taken apart:
//   - the four wheels are cut off along their cylinders (the game's wheels turn and steer); the front left one is kept
//     as the wheel, centred on its axle, the other three are dropped (js/quad.js mirrors it for the right side);
//   - the bars with their pod and mirrors are cut off above the tank (they turn with the steering);
//   - every triangle gets a colour and a surface by where it lies and where it faces (CLASSES, classify): the painted
//     bodywork (the colour comes from the game: `paint`), black plastic, the tube racks, the seat, the lamps' lenses;
//   - each of the three is simplified (meshoptimizer, the colours as attributes so that their seams stay).
// The GLB holds three meshes (body, steer, wheel), each POSITION (float), NORMAL (byte x 4, the last unused; not what
// glTF asks for: js/quad.js reads the file itself), COLOR_0 (unsigned byte, sRGB) and
// _SURF (unsigned byte x 4: paint, roughness, headlamp lens, tail lamp lens; /255) with 16- or 32-bit indices.
// Usage: node tools/build-quad.mjs [path/to/AM-1_new.stl] [--preview dir]   (the source goes to tools/data/cache/quad/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from 'meshoptimizer';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const previewAt = args.indexOf('--preview');
const PREVIEW = previewAt >= 0 ? path.resolve(args.splice(previewAt, 2)[1]) : null;
const SRC = path.resolve(args[0] || path.join(root, 'tools/data/cache/quad/AM-1_new.stl'));
const OUT = path.join(root, 'assets/models/quad.glb');

const SCALE = 0.031; // m per source mm
// (measured on the source, mm: the tyres' contact patches)
const SRC_X = 115.19, SRC_Y = 94.3; // the middle between the wheels
const WHEEL = { x: 0.4386, z: 0.67, r: 0.305, inner: 0.325 }; // centre |x|, |z|, radius (m); the cut's inner face
const TARGET = { body: 22000, steer: 2400, wheel: 2000 }; // triangles

// --- The source ---------------------------------------------------------------------------------------------------------
const stl = fs.readFileSync(SRC);
const count = stl.readUInt32LE(80);
if (84 + 50 * count !== stl.length) throw new Error('expected a binary STL');
// triangles: 9 floats each, in the quad's space: (x, y, z) = (X - SRC_X, Z, -(Y - SRC_Y)) * SCALE (a rotation)
const tri = new Float32Array(count * 9);
for (let t = 0; t < count; t++) {
  for (let k = 0; k < 3; k++) {
    const o = 84 + t * 50 + 12 + k * 12;
    tri[t * 9 + k * 3] = (stl.readFloatLE(o) - SRC_X) * SCALE;
    tri[t * 9 + k * 3 + 1] = stl.readFloatLE(o + 8) * SCALE;
    tri[t * 9 + k * 3 + 2] = -(stl.readFloatLE(o + 4) - SRC_Y) * SCALE;
  }
}

// --- Classes -------------------------------------------------------------------------------------------------------------
// [colour (sRGB hex), paint, roughness, head, tail]
const CLASSES = {
  paint: [0xffffff, 1, 0.36, 0, 0],
  plastic: [0x222427, 0, 0.8, 0, 0],
  tube: [0x18191b, 0, 0.45, 0, 0],
  seat: [0x121315, 0, 0.92, 0, 0],
  metal: [0x74797e, 0, 0.42, 0, 0],
  head: [0xfff4d2, 0, 0.2, 1, 0],
  tail: [0xd21a14, 0, 0.25, 0, 1],
  tyre: [0x17181a, 0, 0.95, 0, 0],
  rim: [0x7c8084, 0, 0.35, 0, 0],
  glass: [0x0c1418, 0, 0.15, 0, 0]
};
const NAMES = Object.keys(CLASSES);

const inWheel = (x, y, z, grow = 0) => {
  if (Math.abs(x) < WHEEL.inner) return 0;
  const dz = Math.abs(z) - WHEEL.z, dy = y - WHEEL.r;
  if (dz * dz + dy * dy > (WHEEL.r + 0.012 + grow) ** 2) return 0;
  return (z > 0 ? 1 : 3) + (x > 0 ? 0 : 1); // 1: front left (+x), 2: front right, 3: rear left, 4: rear right
};
// the bars, pod and mirrors: above the tank, between the front rack and the seat
const inSteer = (x, y, z) => y > 0.93 && z > 0.12 && z < 0.56 && !(y < 0.99 && z > 0.42);

// Where the colours meet along a plane, the triangles are cut along it first (a straight seam, not a saw's edge)
const SPLITS = [[1, 0.345], [1, 0.86], [2, 0.985], [2, 0.13], [2, -0.66], [0, 0.215], [0, -0.215], [1, 0.62], [1, 0.71], [0, 0.4], [0, -0.4]];
const wheelRing = (y, z) => Math.hypot(Math.abs(z) - WHEEL.z, y - WHEEL.r) < WHEEL.r + 0.035;

/** The class of a triangle of the body from its centre (x, y, z) and its normal */
function classify(x, y, z, nx, ny, nz) {
  const ax = Math.abs(x);
  // the bull bar and the lamps' guards in front; the headlamps behind them
  if (z > 0.985) return 'tube';
  if (z > 0.86 && nz > 0.35 && y > 0.61 && y < 0.76 && ax > 0.17 && ax < 0.42) return 'head';
  if (z < -0.8 && nz < -0.5 && y > 0.62 && y < 0.71 && ax > 0.215 && ax < 0.4) return 'tail';
  // the racks over the bodywork, the cage with its backrest, the hitch
  if (y > 0.86 && z > 0.45) return 'tube';
  if (y > 0.86 && z < -0.5) return z > -0.9 && z < -0.66 && y > 0.93 && ax < 0.215 ? 'seat' : 'tube';
  if (z < -1.1 && y < 0.5) return 'metal';
  // the seat
  if (y > 0.74 && z < 0.13 && z > -0.66 && ax < 0.215 && ny > 0.1) return 'seat';
  // the grille between the lamps
  if (z > 0.9 && ax < 0.16 && y > 0.5 && y < 0.74 && nz > 0.2) return 'plastic';
  // under the bodywork: the skid plate, the frame, the engine; the skirts and footboards; the wheel houses
  if (y < 0.345) return ax < 0.3 ? 'metal' : 'plastic';
  if (ax < 0.2 && y < 0.6 && z > -0.5 && z < 0.5) return 'metal';
  if (wheelRing(y, z) || ny < -0.55) return 'plastic';
  return 'paint';
}
function classifySteer(x, y, z, nx, ny, nz) {
  const ax = Math.abs(x);
  if (ax < 0.13 && z > 0.36 && y > 1.0 && nz > 0.5) return 'head'; // (the pod's lamp)
  if (ax < 0.13 && y > 1.0 && z > 0.2) return ny > 0.75 && z < 0.34 ? 'glass' : 'paint'; // the pod, its dial
  if (ax > 0.3 && y > 1.12) return 'plastic'; // the mirrors
  return 'tube';
}
function classifyWheel(x, y, z) { // (about the axle: x from the wheel's middle, outwards +)
  const r = Math.hypot(y, z);
  if (r > 0.185) return 'tyre';
  return r < 0.06 || x > 0.02 ? 'rim' : 'plastic';
}

// --- Taking it apart ----------------------------------------------------------------------------------------------------
/** A triangle (9 floats) cut along the plane axis = value: the pieces (itself if it does not cross) */
function splitTriangle(p, axis, value) {
  const d = [p[axis] - value, p[3 + axis] - value, p[6 + axis] - value];
  if (d.every((v) => v >= -1e-6) || d.every((v) => v <= 1e-6)) return [p];
  const V = (i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  const cut = (i, j) => { const a = V(i), b = V(j), f = d[i] / (d[i] - d[j]); return a.map((v, k) => v + (b[k] - v) * f); };
  // the corner alone on its side (i), the other two (j, k) in the triangle's order
  let i = 0;
  for (let c = 0; c < 3; c++) if (Math.sign(d[c]) !== 0 && Math.sign(d[(c + 1) % 3]) !== Math.sign(d[c]) && Math.sign(d[(c + 2) % 3]) !== Math.sign(d[c])) i = c;
  const j = (i + 1) % 3, k = (i + 2) % 3;
  const ij = cut(i, j), ik = cut(i, k);
  return [[...V(i), ...ij, ...ik], [...ij, ...V(j), ...V(k)], [...ij, ...V(k), ...ik]];
}
const source = [];
for (let t = 0; t < count; t++) {
  let list = [Array.from(tri.subarray(t * 9, t * 9 + 9))];
  const inside = [0, 3, 6].map((k) => inWheel(list[0][k], list[0][k + 1], list[0][k + 2]));
  if (!(inside[0] && inside[0] === inside[1] && inside[0] === inside[2])) for (const [axis, value] of SPLITS) list = list.flatMap((q) => splitTriangle(q, axis, value));
  source.push(...list);
}
const parts = { body: [], steer: [], wheel: [] }; // each: [{ p: 9 floats, c: class index }]
const tally = {};
for (const p of source) {
  const ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2], vx = p[6] - p[0], vy = p[7] - p[1], vz = p[8] - p[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (!(l > 1e-12)) continue;
  nx /= l; ny /= l; nz /= l;
  const cx = (p[0] + p[3] + p[6]) / 3, cy = (p[1] + p[4] + p[7]) / 3, cz = (p[2] + p[5] + p[8]) / 3;
  const w = [0, 3, 6].map((k) => inWheel(p[k], p[k + 1], p[k + 2]));
  let name, into;
  if (w[0] && w[0] === w[1] && w[0] === w[2]) {
    if (w[0] !== 1) continue; // (the other three wheels)
    for (const k of [0, 3, 6]) { p[k] -= WHEEL.x; p[k + 1] -= WHEEL.r; p[k + 2] -= WHEEL.z; }
    name = classifyWheel(cx - WHEEL.x, cy - WHEEL.r, cz - WHEEL.z);
    into = parts.wheel;
  } else if ([0, 3, 6].every((k) => inSteer(p[k], p[k + 1], p[k + 2]))) {
    name = classifySteer(cx, cy, cz, nx, ny, nz);
    into = parts.steer;
  } else {
    name = classify(cx, cy, cz, nx, ny, nz);
    into = parts.body;
  }
  tally[name] = (tally[name] || 0) + 1;
  into.push({ p, c: NAMES.indexOf(name), n: [nx, ny, nz] });
}
console.log('triangles', count, '->', Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])), tally);

// --- Welding, simplifying -----------------------------------------------------------------------------------------------
await MeshoptSimplifier.ready;
function build(list, target) {
  // welded by position and class: the classes' seams keep two vertices
  const map = new Map(), pos = [], cls = [], idx = [];
  for (const t of list) {
    const tri3 = [];
    for (let k = 0; k < 9; k += 3) {
      const key = `${Math.round(t.p[k] * 2e4)},${Math.round(t.p[k + 1] * 2e4)},${Math.round(t.p[k + 2] * 2e4)},${t.c}`;
      let i = map.get(key);
      if (i === undefined) { i = cls.length; map.set(key, i); pos.push(t.p[k], t.p[k + 1], t.p[k + 2]); cls.push(t.c); }
      tri3.push(i);
    }
    if (tri3[0] !== tri3[1] && tri3[1] !== tri3[2] && tri3[0] !== tri3[2]) idx.push(...tri3);
  }
  const positions = new Float32Array(pos), n = cls.length;
  // (the class as a one-hot attribute: a collapse across a seam of colours costs)
  const attrs = new Float32Array(n * NAMES.length);
  for (let i = 0; i < n; i++) attrs[i * NAMES.length + cls[i]] = 1;
  const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(idx), positions, 3, attrs, NAMES.length, NAMES.map(() => 0.6), null, target * 3, 0.02, ['Prune']);
  // compact, smooth normals within a class (area-weighted; hard where faces meet at more than ~50°)
  const used = new Map(), outPos = [], outCls = [], outIdx = [];
  for (const i of simplified) {
    let j = used.get(i);
    if (j === undefined) { j = outCls.length; used.set(i, j); outPos.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]); outCls.push(cls[i]); }
    outIdx.push(j);
  }
  const faceN = [], vertFaces = outCls.map(() => []);
  for (let t = 0; t < outIdx.length; t += 3) {
    const [a, b, c] = [outIdx[t] * 3, outIdx[t + 1] * 3, outIdx[t + 2] * 3];
    const ux = outPos[b] - outPos[a], uy = outPos[b + 1] - outPos[a + 1], uz = outPos[b + 2] - outPos[a + 2];
    const vx = outPos[c] - outPos[a], vy = outPos[c + 1] - outPos[a + 1], vz = outPos[c + 2] - outPos[a + 2];
    faceN.push([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
    for (const k of [0, 1, 2]) vertFaces[outIdx[t + k]].push(t / 3);
  }
  const COS = Math.cos((50 * Math.PI) / 180);
  const fPos = [], fNor = [], fCls = [], fIdx = [], fmap = new Map();
  for (let t = 0; t < outIdx.length; t += 3) {
    const fn = faceN[t / 3], fl = Math.hypot(...fn) || 1;
    for (const k of [0, 1, 2]) {
      const v = outIdx[t + k];
      const nrm = [0, 0, 0];
      for (const f of vertFaces[v]) {
        const o = faceN[f], ol = Math.hypot(...o) || 1;
        if ((o[0] * fn[0] + o[1] * fn[1] + o[2] * fn[2]) / (ol * fl) >= COS) { nrm[0] += o[0]; nrm[1] += o[1]; nrm[2] += o[2]; }
      }
      const nl = Math.hypot(...nrm) || 1;
      const q = nrm.map((c) => Math.round((c / nl) * 127));
      const key = `${v}|${q.join(',')}`;
      let j = fmap.get(key);
      if (j === undefined) {
        j = fCls.length; fmap.set(key, j);
        fPos.push(outPos[v * 3], outPos[v * 3 + 1], outPos[v * 3 + 2]);
        fNor.push(nrm[0] / nl, nrm[1] / nl, nrm[2] / nl);
        fCls.push(outCls[v]);
      }
      fIdx.push(j);
    }
  }
  return { pos: fPos, nor: fNor, cls: fCls, idx: fIdx, error };
}
const meshes = Object.fromEntries(Object.entries(parts).map(([name, list]) => [name, build(list, TARGET[name])]));
for (const [name, m] of Object.entries(meshes)) console.log(`${name}: ${m.idx.length / 3} triangles, ${m.cls.length} vertices, error ${m.error.toFixed(4)}`);

// --- Preview (--preview dir): the classes' colours, splatted ---------------------------------------------------------
if (PREVIEW) {
  const sharp = (await import('sharp')).default;
  fs.mkdirSync(PREVIEW, { recursive: true });
  // (the simplified meshes, as the game gets them)
  const all = [];
  for (const [name, m] of Object.entries(meshes)) {
    const off = name === 'wheel' ? [WHEEL.x, WHEEL.r, WHEEL.z] : [0, 0, 0];
    for (let t = 0; t < m.idx.length; t += 3) {
      const p = [0, 1, 2].flatMap((k) => [0, 1, 2].map((d) => m.pos[m.idx[t + k] * 3 + d] + off[d]));
      const ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2], vx = p[6] - p[0], vy = p[7] - p[1], vz = p[8] - p[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(...n) || 1;
      all.push({ p, c: m.cls[m.idx[t]], n: n.map((v) => v / l), tint: name === 'steer' });
      if (name === 'wheel') for (const [sx, sz] of [[-1, 1], [1, -1], [-1, -1]]) all.push({ p: p.map((v, i) => (i % 3 === 0 ? v * sx : i % 3 === 2 ? (v - WHEEL.z) * 1 + WHEEL.z * sz : v)), c: m.cls[m.idx[t]], n: [n[0] * sx / l, n[1] / l, n[2] / l] });
    }
  }
  const SHOW = { paint: 0xd9601a };
  const views = {
    side: [[0, 0, 1], [0, 1, 0]], other: [[0, 0, -1], [0, 1, 0]], front: [[-1, 0, 0], [0, 1, 0]], rear: [[1, 0, 0], [0, 1, 0]], top: [[0, 0, 1], [1, 0, 0]], below: [[0, 0, 1], [-1, 0, 0]],
    q1: [[-0.7, 0, 0.7], [0, 1, 0]], q2: [[0.7, 0, -0.7], [0, 1, 0]]
  };
  const S = 900, span = 2.6;
  for (const [name, [right, up]] of Object.entries(views)) {
    const fwd = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
    const img = Buffer.alloc(S * S * 3, 255), depth = new Float32Array(S * S).fill(-Infinity);
    const cxm = 0, cym = name === 'top' ? 0 : 0.62;
    // a grid every 0.1 m (darker every 0.5 m) in the flat views
    if (!name.startsWith('q')) {
      for (let g = -13; g <= 13; g++) {
        const px = Math.round(S / 2 + ((g * 0.1) / span) * S), shade = g % 5 === 0 ? 150 : 225;
        const py = Math.round(S / 2 - ((g * 0.1 - cym) / span) * S);
        for (let i = 0; i < S; i++) {
          if (px >= 0 && px < S) img.fill(g === 0 ? 90 : shade, (i * S + px) * 3, (i * S + px) * 3 + 3);
          if (py >= 0 && py < S) img.fill(g === 0 ? 90 : shade, (py * S + i) * 3, (py * S + i) * 3 + 3);
        }
      }
    }
    const L = [0.35, 0.8, 0.5];
    for (const t of all) {
      const [hex] = CLASSES[NAMES[t.c]], col = t.tint && process.env.TINT ? 0xff30d0 : SHOW[NAMES[t.c]] ?? hex;
      const lit = 0.3 + 0.7 * Math.abs((t.n[0] * (right[0] * L[0] + up[0] * L[1] + fwd[0] * L[2]) + t.n[1] * (right[1] * L[0] + up[1] * L[1] + fwd[1] * L[2]) + t.n[2] * (right[2] * L[0] + up[2] * L[1] + fwd[2] * L[2])) / Math.hypot(...L));
      const rgb = [(col >> 16) & 255, (col >> 8) & 255, col & 255].map((v) => Math.min(255, Math.round((v * 0.9 + 22) * lit)));
      const p = t.p;
      const area = Math.hypot(p[3] - p[0], p[4] - p[1], p[5] - p[2]) * Math.hypot(p[6] - p[0], p[7] - p[1], p[8] - p[2]) * 0.5;
      const n = Math.max(3, Math.ceil(area * (S / span) ** 2 * 3));
      for (let i = 0; i < n; i++) {
        let a = Math.random(), b = Math.random();
        if (a + b > 1) { a = 1 - a; b = 1 - b; }
        const x = p[0] + (p[3] - p[0]) * a + (p[6] - p[0]) * b, y = p[1] + (p[4] - p[1]) * a + (p[7] - p[1]) * b, z = p[2] + (p[5] - p[2]) * a + (p[8] - p[2]) * b;
        const sx = Math.round(S / 2 + ((x * right[0] + y * right[1] + z * right[2] - cxm) / span) * S);
        const sy = Math.round(S / 2 - ((x * up[0] + y * up[1] + z * up[2] - cym) / span) * S);
        if (sx < 0 || sy < 0 || sx >= S || sy >= S) continue;
        const d = x * fwd[0] + y * fwd[1] + z * fwd[2];
        if (d > depth[sy * S + sx]) { depth[sy * S + sx] = d; img.set(rgb, (sy * S + sx) * 3); }
      }
    }
    await sharp(img, { raw: { width: S, height: S, channels: 3 } }).png().toFile(path.join(PREVIEW, `${name}.png`));
  }
  console.log('preview ->', PREVIEW, `(${S}px = ${span} m; grid 0.1 m)`);
}

// --- GLB ----------------------------------------------------------------------------------------------------------------
const chunks = [], views = [], accessors = [];
let offset = 0;
const addView = (buf, target) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
  chunks.push(buf);
  offset += buf.length;
  return views.length - 1;
};
const bounds = (arr) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], arr[i + k]); max[k] = Math.max(max[k], arr[i + k]); }
  return { min: min.map(Math.fround), max: max.map(Math.fround) };
};
const add = (a) => accessors.push(a) - 1;
const gltfMeshes = [], nodes = [];
for (const [name, m] of Object.entries(meshes)) {
  const nv = m.cls.length;
  const colour = new Uint8Array(nv * 4), surf = new Uint8Array(nv * 4), normal = new Int8Array(nv * 4);
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) normal[i * 4 + k] = Math.round(m.nor[i * 3 + k] * 127);
    const [hex, paint, rough, head, tail] = CLASSES[NAMES[m.cls[i]]];
    colour.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], i * 4);
    surf.set([paint * 255, Math.round(rough * 255), head * 255, tail * 255], i * 4);
  }
  const wide = nv > 65535;
  const attributes = {
    POSITION: add({ bufferView: addView(Buffer.from(new Float32Array(m.pos).buffer), 34962), componentType: 5126, count: nv, type: 'VEC3', ...bounds(m.pos) }),
    NORMAL: add({ bufferView: addView(Buffer.from(normal.buffer), 34962), componentType: 5120, normalized: true, count: nv, type: 'VEC4' }),
    COLOR_0: add({ bufferView: addView(Buffer.from(colour), 34962), componentType: 5121, normalized: true, count: nv, type: 'VEC4' }),
    _SURF: add({ bufferView: addView(Buffer.from(surf), 34962), componentType: 5121, normalized: true, count: nv, type: 'VEC4' })
  };
  const indices = add({ bufferView: addView(Buffer.from((wide ? new Uint32Array(m.idx) : new Uint16Array(m.idx)).buffer), 34963), componentType: wide ? 5125 : 5123, count: m.idx.length, type: 'SCALAR' });
  gltfMeshes.push({ name, primitives: [{ attributes, indices, mode: 4 }] });
  nodes.push({ name, mesh: gltfMeshes.length - 1, ...(name === 'wheel' ? { translation: [WHEEL.x, WHEEL.r, WHEEL.z] } : {}) });
}
const binary = Buffer.concat(chunks);
const out = {
  asset: {
    version: '2.0',
    generator: 'tools/build-quad.mjs',
    extras: {
      title: 'One-Piece Military Quad Bike "AM-1" – Print in Place, No Assembly', author: 'qMeats',
      source: 'https://www.printables.com/model/1748892-one-piece-military-quad-bike-am-1-print-in-place-n',
      license: 'CC0 1.0 (Creative Commons Public Domain, as published on Printables)',
      modified: 'wheels and bars cut off, rescaled, re-oriented, simplified, coloured; tools/build-quad.mjs',
      wheel: WHEEL
    }
  },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes, meshes: gltfMeshes, accessors, bufferViews: views,
  buffers: [{ byteLength: binary.length }]
};
let json = Buffer.from(JSON.stringify(out), 'utf8');
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const binPadded = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.write('glTF', 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
const chunkHeader = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.writeFileSync(OUT, Buffer.concat([header, chunkHeader(json.length, 0x4e4f534a), json, chunkHeader(binPadded.length, 0x004e4942), binPadded]));
console.log(`${path.relative(root, OUT)}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} kB`);
