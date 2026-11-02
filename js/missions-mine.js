import * as THREE from 'three/webgpu';
import { Fn, float, fract, max, normalWorld, positionLocal, positionWorld, sin, smoothstep, time, uniform, vec3, dot, floor, pow } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { MINE, MINE_ADIT, DIRS, generateMine, createShift, stepShift, isCarved, cellCentre, mineSeedOfDay, shiftScore } from './missions-data-mine.js';

// js/missions-mine.js
// The Silberberg mine's runtime (js/missions-data-mine.js has its definition and the pure game; js/missions.js takes
// MINE_FEATURES into its FEATURES):
//   mine — the adit's portal in the world (timber frame, the dark opening, the spoil heap: built for the run only);
//          walked into, the gallery is built as a group of its own 400 m above the portal (nothing of the town in
//          view; the walker waits at the door, like js/missions-fun.js's interiors) and seen through the miner's
//          eyes. Darkness: one material for the rock, the timbering and the rails that lights itself from the oil
//          lamp on the miner's head (a warm cone from the camera, falling off with the distance) and the few
//          lanterns hung at the drifts — no scene lights (they would recompile the town's shaders). The ore spots
//          glitter where the lamp falls on them. The walls are a voxel mesh of the mine's cells, every corner nudged
//          by a hash of its position (rough rock, no cracks). Web Audio: drips, the hammer on rock, the hunt's
//          rumble, all through a short cave reverb. The touch screens get a held Strike button.
// Everything goes with the run's group (js/missions.js disposes it).

const LIFT = 400; // m: the gallery floats this high above its portal
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4(), _c = new THREE.Color(), _s = new THREE.Vector3();

// --- The portal in the world ---------------------------------------------------------------------------------------------
function buildPortal(group) {
  const a = MINE_ADIT;
  const g = new THREE.Group();
  g.name = 'MinePortal';
  const y = groundHeight(a.x, a.z);
  g.position.set(a.x, y, a.z);
  g.rotation.y = a.heading;
  const wood = new THREE.MeshStandardNodeMaterial({ color: 0x5a3b22, roughness: 0.9 });
  const dark = new THREE.MeshBasicNodeMaterial({ color: 0x050403 });
  const rock = new THREE.MeshStandardNodeMaterial({ color: 0x7d746a, roughness: 1 });
  // the opening: a black box into the slope, the frame round its mouth
  const hole = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.3, 4), dark); hole.position.set(0, 1.0, 2.0);
  const post = new THREE.BoxGeometry(0.24, 2.6, 0.24);
  const l = new THREE.Mesh(post, wood); l.position.set(-1.12, 1.1, 0);
  const r = new THREE.Mesh(post, wood); r.position.set(1.12, 1.1, 0);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.3, 0.3), wood); cap.position.set(0, 2.45, 0);
  // the rock face round it (the black box stands 0.15 m proud of it: the opening), the spoil heap, the rails out
  const face = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.6, 1.2), rock); face.position.set(0, 1.2, 1.0);
  const heap = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.4, 0.55, 1), rock); heap.position.set(3.2, -0.2, -2.4);
  const rail = new THREE.BoxGeometry(0.05, 0.06, 4.5);
  const iron = new THREE.MeshStandardNodeMaterial({ color: 0x3a3632, roughness: 0.5, metalness: 0.6 });
  for (const x of [MINE.railX - 0.3, MINE.railX + 0.3]) { const m = new THREE.Mesh(rail, iron); m.position.set(x, 0.03, -1.8); g.add(m); }
  hole.position.z = 0.15 + 2.0;
  g.add(face, hole, l, r, cap, heap);
  // the sign over the portal
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#3b2716'; x.fillRect(0, 0, 512, 96);
  x.fillStyle = '#f1e2c4'; x.font = '700 40px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Glück auf · Silberberg', 256, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.06), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.8 }));
  sign.position.set(0, 2.95, -0.1); sign.rotation.y = Math.PI; // (it faces out of the mountain, towards -z)
  g.add(sign);
  for (const m of g.children) m.castShadow = true;
  group.add(g);
  return g;
}

// --- The lamp-lit material ---------------------------------------------------------------------------------------------
const LANTERNS = 3;
function lampMaterial(L, { sparkle = false } = {}) {
  const m = new THREE.MeshBasicNodeMaterial({ vertexColors: !sparkle });
  m.colorNode = Fn(() => {
    const toP = positionWorld.sub(L.pos);
    const dist = toP.length().max(0.05);
    const dirN = toP.div(dist);
    const cone = smoothstep(0.6, 0.93, dot(dirN, L.dir)).mul(1.1).add(0.07);
    const att = float(1).div(dist.mul(dist).mul(0.2).add(1));
    const facing = max(dot(normalWorld, dirN.negate()), 0).mul(0.7).add(0.3);
    let light = vec3(1.0, 0.8, 0.52).mul(cone.mul(att).mul(facing).mul(L.power));
    for (let i = 0; i < LANTERNS; i++) {
      const d = positionWorld.distance(L.lanterns[i]);
      light = light.add(vec3(1.0, 0.58, 0.24).mul(L.lanternPower).div(d.mul(d).mul(1.1).add(1)).mul(0.6));
    }
    // (the vertex colours, or the instances' colours, multiply this: js node materials' diffuse colour)
    let col = light.add(0.004);
    if (sparkle) {
      // glitter: facets that catch the lamp in turn
      const h = fract(sin(dot(floor(positionLocal.mul(30)), vec3(12.9898, 78.233, 37.719)).add(time.mul(1.3))).mul(43758.5453));
      col = col.add(vec3(1.6).mul(pow(h, 18).mul(3).mul(light.length())));
    }
    return col;
  })();
  return m;
}

// --- The gallery: a voxel mesh of the mine's cells -------------------------------------------------------------------------
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const jitter = (x, y, z, out) => {
  const k = 0.14;
  out.set((hash3(x, y, z) - 0.5) * k * 2, (hash3(z, x, y) - 0.5) * k * (y < 0.01 ? 0.2 : 1.4), (hash3(y, z, x) - 0.5) * k * 2);
  return out;
};

function buildGallery(mine, L) {
  const C = MINE.cell, H = MINE.height;
  const pos = [], col = [], idx = [];
  const rockA = new THREE.Color(0x6d655c), rockB = new THREE.Color(0x4f4840), floorC = new THREE.Color(0x4a3a2c), ore = new THREE.Color(0x5e5146);
  const tint = new THREE.Color();
  const J = new THREE.Vector3();
  // a quad from corner p0 along u (nu steps) and v (nv steps)
  const quad = (p0, u, v, nu, nv, base) => {
    const start = pos.length / 3;
    for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
      const x = p0[0] + (u[0] * a) / nu + (v[0] * b) / nv, y = p0[1] + (u[1] * a) / nu + (v[1] * b) / nv, z = p0[2] + (u[2] * a) / nu + (v[2] * b) / nv;
      jitter(Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100, J);
      pos.push(x + J.x, y + J.y, z + J.z);
      const n = hash3(x * 0.7, y * 1.3, z * 0.9);
      tint.copy(base).lerp(base === floorC ? rockB : n > 0.85 ? ore : rockB, n * 0.6);
      col.push(tint.r, tint.g, tint.b);
    }
    for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) {
      const i0 = start + a * (nv + 1) + b, i1 = i0 + nv + 1;
      idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
    }
  };
  const cells = [...mine.list, [0, -1]]; // (and the portal's step outside)
  const carved = (i, k) => isCarved(mine, i, k) || (i === 0 && k === -1);
  for (const [i, k] of cells) {
    const x0 = i * C - C / 2, x1 = x0 + C, z0 = k * C, z1 = z0 + C;
    // (the winding: the faces seen from inside the cell)
    quad([x0, 0, z0], [0, 0, C], [C, 0, 0], 3, 3, floorC);
    quad([x0, H, z0], [C, 0, 0], [0, 0, C], 3, 3, rockA);
    DIRS.forEach(([di, dk], d) => {
      if (carved(i + di, k + dk)) return;
      if (i === 0 && k === -1 && d === 3) return; // (daylight there)
      if (d === 0) quad([x1, 0, z0], [0, 0, C], [0, H, 0], 3, 3, rockA);
      if (d === 2) quad([x0, 0, z1], [0, 0, -C], [0, H, 0], 3, 3, rockA);
      if (d === 1) quad([x1, 0, z1], [-C, 0, 0], [0, H, 0], 3, 3, rockA);
      if (d === 3) quad([x0, 0, z0], [C, 0, 0], [0, H, 0], 3, 3, rockA);
    });
  }
  const rockGeo = new THREE.BufferGeometry();
  rockGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  rockGeo.setIndex(idx);
  rockGeo.computeVertexNormals();
  // the timbering (a set every cell along the galleries: two posts and a cap), the rails and sleepers
  const parts = [];
  const box = (w, h, d, x, y, z, colour) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    _c.set(colour);
    for (let q = 0; q < n; q++) { const f = 0.85 + 0.3 * hash3(x + q, y, z); c[q * 3] = _c.r * f; c[q * 3 + 1] = _c.g * f; c[q * 3 + 2] = _c.b * f; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  const wood = 0x6b4a2c;
  for (const [i, k] of mine.list) {
    if (k < 1) continue;
    const alongZ = carved(i, k + 1) || carved(i, k - 1), alongX = carved(i + 1, k) || carved(i - 1, k);
    if (alongZ && alongX) continue; // (a junction: open)
    const c = cellCentre(i, k);
    const w = C / 2 - 0.16;
    if (alongZ) { box(0.18, H - 0.1, 0.18, c.x - w, (H - 0.1) / 2, c.z, wood); box(0.18, H - 0.1, 0.18, c.x + w, (H - 0.1) / 2, c.z, wood); box(C - 0.1, 0.2, 0.2, c.x, H - 0.18, c.z, wood); }
    else { box(0.18, H - 0.1, 0.18, c.x, (H - 0.1) / 2, c.z - w, wood); box(0.18, H - 0.1, 0.18, c.x, (H - 0.1) / 2, c.z + w, wood); box(0.2, 0.2, C - 0.1, c.x, H - 0.18, c.z, wood); }
  }
  const railLen = mine.mainCells * C + 1.2;
  for (const dx of [-0.3, 0.3]) box(0.05, 0.07, railLen, MINE.railX + dx, 0.09, railLen / 2 - 1.2, 0x55504a);
  for (let z = -1; z < mine.mainCells * C; z += 0.8) box(0.85, 0.06, 0.16, MINE.railX, 0.03, z, 0x3e2c1c);
  const timberGeo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  timberGeo.computeVertexNormals();
  const mat = lampMaterial(L);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(rockGeo, mat), new THREE.Mesh(timberGeo, mat));
  // daylight in the portal: a bright plane beyond the last step
  const day = new THREE.Mesh(new THREE.PlaneGeometry(C + 0.4, H + 0.4), new THREE.MeshBasicNodeMaterial({ color: 0xdfe9f5 }));
  day.position.set(0, H / 2, -C + 0.02);
  g.add(day);
  return g;
}

/** The ore spots: little clusters of crystals on the walls (one instanced mesh), coloured by their ore */
function buildVeins(mine, L) {
  const parts = [];
  const rnd = (n) => hash3(n, n * 1.7, n * 2.3);
  for (let n = 0; n < 9; n++) {
    const g = new THREE.OctahedronGeometry(0.045 + rnd(n) * 0.06, 0); // (non-indexed already)
    g.scale(1, 1, 0.5);
    g.rotateZ(rnd(n + 3) * 3);
    g.translate((rnd(n + 7) - 0.5) * 0.5, (rnd(n + 11) - 0.5) * 0.4, 0.02);
    g.deleteAttribute('uv');
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, lampMaterial(L, { sparkle: true }), mine.veins.length);
  mesh.frustumCulled = false;
  mine.veins.forEach((v, i) => {
    _c.set(MINE.ores[v.kind].colour);
    mesh.setColorAt(i, _c);
  });
  mesh.name = 'MineVeins';
  return mesh;
}

function placeVeins(mesh, mine) {
  mine.veins.forEach((v, i) => {
    const left = (v.kg - v.mined) / v.kg;
    const s = left <= 1e-6 ? 0.0001 : 0.45 + 0.55 * left;
    _q.setFromAxisAngle(_v.set(0, 1, 0), Math.atan2(v.nx, v.nz));
    _m.compose(_s.set(v.x - v.nx * 0.03, v.y, v.z - v.nz * 0.03), _q, _v.set(s * 1.4, s * 1.2, s * 1.2));
    mesh.setMatrixAt(i, _m);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function buildHunt(L) {
  const parts = [];
  const box = (w, h, d, x, y, z, colour) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    _c.set(colour);
    for (let q = 0; q < n; q++) { c[q * 3] = _c.r; c[q * 3 + 1] = _c.g; c[q * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  const W = MINE.huntWidth * 2 - 0.06, Lh = MINE.huntHalf * 2 - 0.1;
  box(W, 0.06, Lh, 0, 0.3, 0, 0x5a3e24); // the floor
  for (const s of [1, -1]) { box(0.06, 0.55, Lh, s * W / 2, 0.6, 0, 0x6b4a2c); box(W, 0.55, 0.06, 0, 0.6, s * Lh / 2, 0x6b4a2c); }
  for (const z of [-0.5, 0, 0.5]) box(W + 0.04, 0.05, 0.05, 0, 0.86, z * Lh * 0.9, 0x2e2b28); // (the iron bands)
  for (const s of [1, -1]) for (const z of [-0.45, 0.45]) box(0.06, 0.24, 0.24, s * 0.3, 0.14, z, 0x2a2724);
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  geo.computeVertexNormals();
  const mat = lampMaterial(L);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  // the load: a heap that grows
  const heapGeo = new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(W * 0.95, 1, Lh * 0.9).toNonIndexed();
  const n = heapGeo.attributes.position.count, c = new Float32Array(n * 3);
  for (let q = 0; q < n; q++) { const f = 0.7 + 0.5 * hash3(q, 1, 2); c[q * 3] = 0.42 * f; c[q * 3 + 1] = 0.4 * f; c[q * 3 + 2] = 0.38 * f; }
  heapGeo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  heapGeo.computeVertexNormals();
  const heap = new THREE.Mesh(heapGeo, mat);
  heap.position.y = 0.33;
  g.add(heap);
  g.userData.heap = heap;
  return g;
}

/** Schlägel und Eisen: the hammer in the right hand, the chisel in the left, in front of the camera */
function buildTools(L) {
  const parts = [];
  const box = (w, h, d, x, y, z, colour, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    _c.set(colour);
    for (let q = 0; q < n; q++) { c[q * 3] = _c.r; c[q * 3 + 1] = _c.g; c[q * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const hammer = new THREE.Group();
  const hGeo = mergeGeometries([box(0.022, 0.022, 0.26, 0, 0, -0.13, 0x7a5532), box(0.055, 0.055, 0.11, 0, 0, -0.28, 0x3c3a38, 0)]);
  hammer.add(new THREE.Mesh(hGeo, lampMaterial(L)));
  const chisel = new THREE.Group();
  const cGeo = mergeGeometries([box(0.018, 0.018, 0.2, 0, 0, -0.1, 0x4a4744), box(0.03, 0.04, 0.06, 0, 0, 0.02, 0x7a5532)]);
  chisel.add(new THREE.Mesh(cGeo, lampMaterial(L)));
  return { hammer, chisel };
}

// --- Sound -------------------------------------------------------------------------------------------------------------------
class MineAudio {
  constructor(audio) { this.audio = audio; this.nextDrip = 1; }
  get live() { const a = this.audio; return !!(a && a.enabled && a.context && a.context.state === 'running' && a.mix); }
  init() {
    if (this.out || !this.live) return !!this.out;
    const ctx = this.audio.context;
    this.out = ctx.createGain(); this.out.gain.value = 0.7;
    this.out.connect(this.audio.mix);
    // the cave: a convolver with a dark 2 s tail
    const n = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < 40 ? 0 : 1); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.verb.connect(lp).connect(wet).connect(this.out);
    this.dry = ctx.createGain(); this.dry.gain.value = 0.8; this.dry.connect(this.out);
    this.bus = ctx.createGain(); this.bus.connect(this.dry); this.bus.connect(this.verb);
    const nb = Math.floor(ctx.sampleRate * 1.0), buf = ctx.createBuffer(1, nb, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < nb; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // the mountain's hum, the hunt's rumble (looped noise, quiet until it rolls)
    const hum = ctx.createBufferSource(); hum.buffer = buf; hum.loop = true;
    const hlp = ctx.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 180;
    const hg = ctx.createGain(); hg.gain.value = 0.05;
    hum.connect(hlp).connect(hg).connect(this.bus); hum.start();
    const rum = ctx.createBufferSource(); rum.buffer = buf; rum.loop = true;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 320;
    this.rumble = ctx.createGain(); this.rumble.gain.value = 0;
    rum.connect(rlp).connect(this.rumble).connect(this.bus); rum.start();
    this.sources = [hum, rum];
    return true;
  }
  drip(dt) {
    if (!this.init()) return;
    if ((this.nextDrip -= dt) > 0) return;
    this.nextDrip = 0.6 + Math.random() * 2.6;
    const ctx = this.audio.context, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = 900 + Math.random() * 1400;
    o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 1.9, now + 0.05);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.08 + Math.random() * 0.06, now + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    o.connect(g).connect(pan).connect(this.bus); o.start(now); o.stop(now + 0.12);
  }
  strike(kind) {
    if (!this.init()) return;
    const ctx = this.audio.context, now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    src.connect(bp).connect(g).connect(this.bus); src.start(now, Math.random() * 0.5, 0.15);
    // the chisel's ring (galena rings brighter)
    for (const [f, v] of [[kind === 'galena' ? 2900 : 2300, 0.12], [kind === 'galena' ? 4700 : 3600, 0.06]]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const og = ctx.createGain(); og.gain.setValueAtTime(v, now); og.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      o.connect(og).connect(this.bus); o.start(now); o.stop(now + 0.3);
    }
  }
  load() {
    if (!this.init()) return;
    const ctx = this.audio.context, now = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const at = now + i * 0.05 + Math.random() * 0.03;
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700 + Math.random() * 600;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.35, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
      src.connect(lp).connect(g).connect(this.bus); src.start(at, Math.random() * 0.8, 0.12);
    }
  }
  roll(speed) {
    if (!this.out) return;
    this.rumble.gain.setTargetAtTime(Math.min(0.5, Math.abs(speed) * 0.25), this.audio.context.currentTime, 0.08);
  }
  dispose() {
    for (const s of this.sources || []) try { s.stop(); } catch { /* (stopped) */ }
    this.out?.disconnect();
    this.out = null;
  }
}

// --- The feature -----------------------------------------------------------------------------------------------------------
const STYLE = `
body.mine-indoor [data-touch-action="up"],body.mine-indoor .gta-prompt,body.mine-indoor .touch-use,body.mine-indoor .mission-prompt{display:none!important}
body.mine-indoor .hud-bottom-center{visibility:hidden}
@media (max-width:640px){body.mine-indoor .hud-bottom-right{visibility:hidden}}
.mine-hud{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:40;display:flex;gap:10px;align-items:center;pointer-events:none;font:700 14px/1.2 Inter,system-ui,sans-serif;color:#f3e6cc;font-variant-numeric:tabular-nums}
.mine-hud[hidden]{display:none}
.mine-card{display:flex;gap:12px;align-items:center;background:rgba(14,10,6,.78);border:1px solid rgba(255,220,160,.18);border-radius:12px;padding:7px 12px}
.mine-oil{position:relative;width:90px;height:8px;border-radius:4px;background:rgba(255,255,255,.15);overflow:hidden}
.mine-oil>span{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#ff9b2e,#ffd36b);border-radius:4px}
.mine-oil.is-low>span{background:#ff4b3e}
.mine-strike{pointer-events:auto;border:0;border-radius:999px;padding:16px 26px;font:800 17px Inter,system-ui,sans-serif;color:#1b1206;background:linear-gradient(180deg,#ffd36b,#e09a2b);box-shadow:0 6px 18px rgba(224,154,43,.4);touch-action:none;user-select:none;-webkit-user-select:none}
.mine-strike.is-on{transform:scale(.95);filter:brightness(1.15)}
.mine-toast{position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:41;pointer-events:none;font:800 24px/1.2 Inter,system-ui,sans-serif;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.8);opacity:0;transition:opacity .25s}
`;

const mineFeature = {
  setup(run) {
    const s = document.createElement('style');
    s.textContent = STYLE;
    document.head.append(s);
    run.cleanups.push(() => s.remove());
    buildPortal(run.group);
    const hud = el('div'); hud.className = 'mine-hud'; hud.hidden = true;
    const card = el('div'); card.className = 'mine-card';
    const oil = el('span'); oil.className = 'mine-oil'; const oilFill = el('span'); oil.append(oilFill);
    const lampText = el('span', null, 'Lamp');
    const basket = el('span', null, '');
    card.append(lampText, oil, basket);
    const strike = el('button', null, 'Strike'); strike.type = 'button'; strike.className = 'mine-strike';
    const on = (v) => (e) => { e.preventDefault(); run.mine.touchStrike = v; strike.classList.toggle('is-on', v); };
    run.listen(strike, 'pointerdown', on(true));
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) run.listen(strike, t, on(false));
    hud.append(card, strike);
    const toast = el('div'); toast.className = 'mine-toast';
    document.body.append(hud, toast);
    run.cleanups.push(() => { hud.remove(); toast.remove(); document.body.classList.remove('mine-indoor'); });
    run.mine = { hud, oil, oilFill, basket, toast, toastT: 0, touchStrike: false, inside: null, audio: null };
  },
  reset(run) {
    mineFeature.leave(run);
    run.mine.audio?.dispose(); run.mine.audio = new MineAudio(run.hooks.audio);
    run.mine.hud.hidden = true;
    run.state.shift = null;
  },
  teardown(run) {
    mineFeature.leave(run);
    run.mine.audio?.dispose();
  },
  /** Into the mountain: the gallery built, the walker parked at the door, the camera ours */
  enter(run) {
    const M = run.mine;
    const seed = run.state.seed ?? (run.state.seed = Number(new URLSearchParams(location.search).get('seed')) || mineSeedOfDay());
    const mine = generateMine(seed);
    const L = {
      pos: uniform(new THREE.Vector3()), dir: uniform(new THREE.Vector3(0, 0, 1)), power: uniform(1),
      lanterns: Array.from({ length: LANTERNS }, () => uniform(new THREE.Vector3(0, -1e4, 0))), lanternPower: uniform(1)
    };
    const origin = new THREE.Vector3(MINE_ADIT.x, groundHeight(MINE_ADIT.x, MINE_ADIT.z) + LIFT, MINE_ADIT.z);
    const group = new THREE.Group();
    group.name = 'MineInterior';
    group.position.copy(origin);
    group.add(buildGallery(mine, L));
    const veins = buildVeins(mine, L);
    placeVeins(veins, mine);
    group.add(run.storage(veins));
    const hunt = buildHunt(L);
    group.add(hunt);
    const tools = buildTools(L);
    run.group.add(tools.hammer, tools.chisel);
    // the lanterns: at the mouths of the first drifts, on the wall beside the walkway
    mine.branches.slice(0, LANTERNS).forEach((b, i) => {
      const c = cellCentre(0, b.k0 - 1);
      const p = new THREE.Vector3(c.x + MINE.cell / 2 - 0.22, 1.85, c.z).add(origin);
      L.lanterns[i].value.copy(p);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), new THREE.MeshBasicNodeMaterial({ color: 0xffb04a }));
      lamp.position.copy(p).sub(origin);
      group.add(lamp);
    });
    run.group.add(group);
    group.updateMatrixWorld(true);
    const cm = run.hooks.controllerManager;
    const fade = el('div', 'position:fixed;inset:0;background:#000;z-index:39;pointer-events:none;opacity:1;transition:opacity .6s');
    document.body.append(fade);
    requestAnimationFrame(() => requestAnimationFrame(() => { fade.style.opacity = '0'; }));
    document.body.classList.add('mine-indoor');
    const prevDriver = cm.personDriver;
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; }; // (the walker waits at the door)
    M.inside = { group, mine, L, hunt, veins, tools, origin, fade, prevDriver, bob: 0, shake: 0, snow: run.scene.getObjectByName('snowfall') };
    M.hud.hidden = false;
    run.state.shift = createShift(mine);
  },
  leave(run) {
    const M = run.mine, I = M?.inside;
    if (!I) return;
    I.group.removeFromParent();
    I.tools.hammer.removeFromParent(); I.tools.chisel.removeFromParent();
    const dispose = (root) => root.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) m.dispose(); if (o.isInstancedMesh) o.dispose(); });
    dispose(I.group); dispose(I.tools.hammer); dispose(I.tools.chisel);
    I.fade.remove();
    document.body.classList.remove('mine-indoor');
    const cm = run.hooks.controllerManager;
    cm.personDriver = I.prevDriver ?? null;
    run.hooks.cameraSystem?.resetForTeleport?.();
    M.inside = null;
  },
  toast(run, text, colour = '#f3e6cc', secs = 1.6) {
    const M = run.mine;
    M.toast.textContent = text; M.toast.style.color = colour; M.toast.style.opacity = '1'; M.toastT = secs;
  },
  update(run, ctx, dt, cm) {
    const M = run.mine;
    if (!M.inside && run.index >= 1 && !run.state.shift) mineFeature.enter(run);
    if (M.toastT > 0 && (M.toastT -= dt) <= 0) M.toast.style.opacity = '0';
    const I = M.inside, g = run.state.shift;
    if (!I || !g) return;
    // the shift runs with the stopwatch (the first step through the door started it)
    if (run.phase !== 'running' && run.phase !== 'ready') return;
    const k = cm.keys, num = (v) => (v === true ? 1 : Number(v) || 0);
    const input = { forward: num(k.forward), back: num(k.backward), turn: num(k.left) - num(k.right), strike: !!k.up || M.touchStrike };
    let left = Math.min(dt, 0.1);
    const events = [];
    while (left > 1e-6) { const h = Math.min(1 / 60, left); events.push(...stepShift(g, input, h)); left -= h; }
    for (const e of events) {
      if (e.type === 'ore') {
        const o = MINE.ores[e.kind];
        mineFeature.toast(run, `+${e.kg} kg ${o.label.toLowerCase()}`, e.kind === 'barren' ? '#bdb2a2' : o.colour, 1.3);
        M.audio?.strike(e.kind);
        I.shake = 0.12;
        placeVeins(I.veins, I.mine);
      } else if (e.type === 'empty') placeVeins(I.veins, I.mine);
      else if (e.type === 'full') mineFeature.toast(run, 'The basket is full', '#ffd36b');
      else if (e.type === 'load') { mineFeature.toast(run, `${Math.round(e.kg * 10) / 10} kg into the hunt`, '#ffd36b'); M.audio?.load(); }
      else if (e.type === 'deliver') { mineFeature.toast(run, `To day: +${Math.round(e.pts)} pts`, '#7dffb0', 2.2); run.hooks.flashPoints?.(Math.round(e.pts)); }
      else if (e.type === 'low') mineFeature.toast(run, 'The lamp gutters: get out!', '#ff8f80', 2.4);
      else if (e.type === 'dark') mineFeature.toast(run, 'The lamp has gone out', '#ff8f80', 3);
    }
    M.audio?.drip(dt);
    M.audio?.roll(g.hunt.moving / Math.max(1e-3, dt));
    // the HUD
    const frac = g.lamp / MINE.lamp;
    M.oilFill.style.width = `${(frac * 100).toFixed(1)}%`;
    M.oil.classList.toggle('is-low', g.lamp < MINE.lampLow);
    const t = `Basket ${Math.round(g.basket.kg * 10) / 10}/${MINE.basket} kg · Hunt ${Math.round(g.hunt.kg)} kg · ${shiftScore(g)} pts out`;
    if (M.basket.textContent !== t) M.basket.textContent = t;
    if (g.over) M.hud.hidden = true;
  },
  after(run, ctx, dt) {
    const M = run.mine, I = M.inside, g = run.state.shift;
    if (!I || !g || run.phase === 'aborted') return;
    const cam = ctx.camera;
    // the miner's eyes: a little bob as it walks, the shake of a strike
    const moving = Math.abs(run.hooks.controllerManager.keys.forward ? 1 : 0) || Math.abs(run.hooks.controllerManager.keys.backward ? 1 : 0);
    I.bob += dt * (moving ? 8 : 0);
    I.shake = Math.max(0, I.shake - dt);
    const sh = I.shake * (Math.random() - 0.5) * 0.4;
    const eye = _v.set(g.x, 1.6 + Math.sin(I.bob) * 0.025, g.z).add(I.origin);
    cam.position.copy(eye);
    _e.set(-0.1 + sh, g.heading + Math.PI + sh * 0.5, 0);
    cam.quaternion.setFromEuler(_e);
    cam.updateMatrixWorld();
    if (I.snow) I.snow.visible = false;
    // the lamp on the head: the camera's view, a little down; its oil gutters at the end
    const L = I.L;
    L.pos.value.copy(eye).add(_s.set(0.08, 0.12, 0).applyQuaternion(cam.quaternion));
    L.dir.value.set(0, -0.12, -1).applyQuaternion(cam.quaternion).normalize();
    const t = performance.now() / 1000;
    const flicker = 0.93 + 0.05 * Math.sin(t * 13) * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 31);
    const low = g.lamp < MINE.lampLow ? (g.lamp / MINE.lampLow) * (0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 9)) : 1;
    L.power.value = g.over === 'dark' ? 0 : flicker * Math.max(0.15, low);
    L.lanternPower.value = 0.9 + 0.1 * Math.sin(t * 5.1);
    // the hunt on its rails, its heap
    I.hunt.position.set(MINE.railX, 0, g.hunt.z);
    const heap = I.hunt.userData.heap;
    const fill = clamp(g.hunt.kg / 120, 0, 1);
    heap.visible = fill > 0.01;
    heap.scale.set(1, 0.15 + 0.85 * fill, 1);
    heap.position.y = 0.33 + 0.25 * fill;
    // the tools: the hammer swings at the chisel while striking
    const striking = g.mining && g.target;
    const ph = striking ? (g.mining.t / MINE.strikeS) : 1;
    const swing = striking ? (ph < 0.75 ? -1.1 * (ph / 0.75) : -1.1 + 1.6 * ((ph - 0.75) / 0.25)) : -0.25;
    const toolAt = (obj, x, y, z, rx, ry) => {
      obj.position.copy(eye).add(_s.set(x, y, z).applyQuaternion(cam.quaternion));
      obj.quaternion.copy(cam.quaternion).multiply(_q.setFromEuler(_e.set(rx, ry, 0)));
    };
    toolAt(I.tools.hammer, 0.3, -0.26, -0.6, swing, 0.55);
    toolAt(I.tools.chisel, 0.02, -0.24, -0.72, 0.3, -0.25);
    I.tools.chisel.visible = !!striking;
  }
};

export const MINE_FEATURES = { mine: mineFeature };
