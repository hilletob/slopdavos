import * as THREE from 'three/webgpu';
import { Fn, attribute, float, fract, max, normalWorld, positionLocal, positionWorld, sin, smoothstep, time, uniform, vec3, dot, floor, pow } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { parseAdit, aditUrl } from './silberberg-asset.js';
import { t } from './i18n.js';
import {
  MINE, ADITS, TOUR_STATIONS, createMine, createShift, stepShift, createWalker, stepWalk, railAt, stationPoint, mineSeedOfDay, shiftScore,
  GUIDE, GUIDE_SCRIPT, GUIDE_QUIZ, GUIDE_CALLS, createGuide, stepGuide, answerQuiz
} from './missions-data-mine.js';

// js/missions-mine.js
// The Silberberg mine's runtime (js/missions-data-mine.js has its definitions and the pure game; js/missions.js takes
// MINE_FEATURES into its FEATURES), for both its missions (def.mine.kind: 'ore' | 'tour'):
//   mine — the adits' portals in the world (timber frame, the dark opening, the spoil heap: built for the run only);
//          walked into (an objective with `inside: <adit>`), the gallery is built as a group of its own 400 m above its
//          portal (nothing of the town in view; the walker waits at the door, like js/missions-fun.js's interiors) and
//          seen through the miner's eyes. The galleries are the FHNW laser scans (assets/silberberg/*.bin, fetched when
//          the mission is set up): one closed mesh, coloured by the scan, drawn from both sides, inside a black hull —
//          and the camera's near plane drawn in to 5 cm while inside: no gap, no wall cut by the near plane, shows the
//          world behind the rock. Darkness: one material that lights itself from the oil lamp on the miner's head (a
//          warm cone from the camera) and a few lanterns — no scene lights (they would recompile the town's shaders);
//          the portal's cut glows with daylight. The ore spots glitter where the lamp falls on them. Web Audio: drips,
//          the hammer on rock, the hunt's rumble, all through a short cave reverb. The touch screens get a held Strike
//          button (the ore). On the tour Jöri leads: a miner of boxes with a lantern (the lamp-lit material inside,
//          a plain one waiting outside at the next portal), his lines at the bottom of the screen, his two questions
//          (keys 1–3 or tapped), the mountain's rumble in the stope, the draught that blows the visitor's lamp out.
// Everything goes with the run's group (js/missions.js disposes it).

const LIFT = 400; // m: the gallery floats this high above its portal
const NEAR = 0.05; // m: the camera's near plane inside
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4(), _c = new THREE.Color(), _s = new THREE.Vector3();
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

// --- The scans --------------------------------------------------------------------------------------------------------------
const adits = new Map(); // id → Promise<parsed adit>
/** The parsed scan of an adit (fetched once a session) */
export function loadAdit(id) {
  if (!adits.has(id)) {
    const p = fetch(aditUrl(id)).then((r) => { if (!r.ok) throw new Error(`${aditUrl(id)}: ${r.status}`); return r.arrayBuffer(); }).then(parseAdit);
    p.catch(() => adits.delete(id));
    adits.set(id, p);
  }
  return adits.get(id);
}

// --- The portals in the world ---------------------------------------------------------------------------------------------
function buildPortal(group, a, name) {
  const g = new THREE.Group();
  g.name = 'MinePortal';
  const y = groundHeight(a.x, a.z);
  g.position.set(a.x, y, a.z);
  g.rotation.y = a.heading; // (local +z: into the mountain)
  const wood = new THREE.MeshStandardNodeMaterial({ color: 0x5a3b22, roughness: 0.9 });
  const dark = new THREE.MeshBasicNodeMaterial({ color: 0x050403 });
  const rock = new THREE.MeshStandardNodeMaterial({ color: 0x7d746a, roughness: 1 });
  // the opening: a black box into the slope, the frame round its mouth, the rock face round it
  const hole = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.0, 4), dark); hole.position.set(0, 0.9, 2.15);
  const post = new THREE.BoxGeometry(0.22, 2.3, 0.22);
  const l = new THREE.Mesh(post, wood); l.position.set(-0.86, 1.0, 0);
  const r = new THREE.Mesh(post, wood); r.position.set(0.86, 1.0, 0);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 0.28), wood); cap.position.set(0, 2.2, 0);
  const face = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.4, 1.2), rock); face.position.set(0, 1.1, 1.0);
  const heap = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.4, 0.5, 1), rock); heap.position.set(3.0, -0.2, -2.4);
  g.add(face, hole, l, r, cap, heap);
  // the sign over the portal
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#3b2716'; x.fillRect(0, 0, 512, 96);
  x.fillStyle = '#f1e2c4'; x.font = '700 38px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(`Glück auf · ${name}`, 256, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.43, 0.06), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.8 }));
  sign.position.set(0, 2.68, -0.1); sign.rotation.y = Math.PI; // (it faces out of the mountain, towards -z)
  g.add(sign);
  for (const m of g.children) m.castShadow = true;
  group.add(g);
  return g;
}

// --- The lamp-lit material ---------------------------------------------------------------------------------------------
const LANTERNS = 3;
/** Lit by the lamp and the lanterns; `scan`: the colour and the daylight from the scan's attributes (not multiplied) */
function lampMaterial(L, { sparkle = false, scan = false, tint = null } = {}) {
  const m = new THREE.MeshBasicNodeMaterial({ vertexColors: !sparkle && !scan && !tint, side: scan ? THREE.DoubleSide : THREE.FrontSide });
  m.colorNode = Fn(() => {
    const toP = positionWorld.sub(L.pos);
    const dist = toP.length().max(0.05);
    const dirN = toP.div(dist);
    const cone = smoothstep(0.55, 0.92, dot(dirN, L.dir)).mul(1.1).add(0.08);
    const att = float(1).div(dist.mul(dist).mul(0.22).add(1));
    // (both faces: the light from whichever side looks at the lamp)
    const facing = dot(normalWorld, dirN.negate()).abs().mul(0.7).add(0.3);
    let light = vec3(1.0, 0.8, 0.52).mul(cone.mul(att).mul(facing).mul(L.power));
    for (let i = 0; i < LANTERNS; i++) {
      const d = positionWorld.distance(L.lanterns[i]);
      light = light.add(vec3(1.0, 0.58, 0.24).mul(L.lanternPower).div(d.mul(d).mul(0.9).add(1)).mul(0.6));
    }
    // (the show mine's electric light on the tour: a dim, warm fill; none on the ore shift)
    light = light.add(vec3(1.0, 0.86, 0.66).mul(L.ambient));
    let col = light.add(0.004);
    if (scan) {
      // the scan's colour, grained: two octaves of value noise on the rock (cm and dm), the light kept off the bloom
      const day = attribute('day', 'float');
      // (smooth: sums of sines across the three axes, not the voxels' cubes)
      const q = positionWorld;
      const g1 = sin(q.x.mul(9.1).add(sin(q.y.mul(7.3)).mul(1.7))).mul(sin(q.z.mul(8.7).add(sin(q.x.mul(5.9)).mul(1.9)))).mul(sin(q.y.mul(10.3).add(q.z.mul(3.1))));
      const g2 = sin(q.x.mul(2.3).add(q.z.mul(1.7)).add(sin(q.y.mul(3.1)).mul(2.0))).mul(sin(q.y.mul(2.9).sub(q.x.mul(1.3))));
      const grain = g1.mul(0.16).add(g2.mul(0.18)).add(0.88);
      col = attribute('color', 'vec3').mul(grain).mul(col.min(vec3(1.4))).mul(0.85).add(vec3(0.85, 0.9, 1.0).mul(day).mul(L.day));
    }
    if (tint) { const c = new THREE.Color(tint); col = col.mul(vec3(c.r, c.g, c.b)); }
    if (sparkle) {
      // glitter: facets that catch the lamp in turn
      const h = fract(sin(dot(floor(positionLocal.mul(30)), vec3(12.9898, 78.233, 37.719)).add(time.mul(1.3))).mul(43758.5453));
      col = col.add(vec3(1.6).mul(pow(h, 18).mul(3).mul(light.length())));
    }
    return col;
  })();
  void max;
  return m;
}

// --- The gallery: the scan's mesh, the rails, the black hull ----------------------------------------------------------------
function buildGallery(a, L, { rails = true } = {}) {
  const g = new THREE.Group();
  const n = a.header.mesh.vertices;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  const col = new Float32Array(n * 3), day = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) col[i * 3 + k] = Math.pow(a.colours[i * 4 + k] / 255, 2.2);
    day[i] = a.colours[i * 4 + 3] / 255;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('day', new THREE.BufferAttribute(day, 1));
  geo.setIndex(new THREE.BufferAttribute(a.index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const rock = new THREE.Mesh(geo, lampMaterial(L, { scan: true }));
  rock.name = 'MineRock';
  g.add(rock);
  // the hull: black all round, beyond the rock (whatever might show through the scan sees nothing)
  const { min, max: mx } = a.header.mesh;
  const hull = new THREE.Mesh(new THREE.BoxGeometry(mx[0] - min[0] + 8, mx[1] - min[1] + 8, mx[2] - min[2] + 8), new THREE.MeshBasicNodeMaterial({ color: 0x000000, side: THREE.BackSide }));
  hull.position.set((min[0] + mx[0]) / 2, (min[1] + mx[1]) / 2, (min[2] + mx[2]) / 2);
  g.add(hull);
  if (rails && a.header.rail.length > 1) {
    const parts = [];
    const box = (w, h, d, x, y, z, rotY, colour) => {
      const b = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      b.rotateY(rotY); b.translate(x, y, z);
      const k = b.attributes.position.count, c = new Float32Array(k * 3);
      _c.set(colour);
      for (let q = 0; q < k; q++) { const f = 0.85 + 0.3 * hash3(x + q, y, z); c[q * 3] = _c.r * f; c[q * 3 + 1] = _c.g * f; c[q * 3 + 2] = _c.b * f; }
      b.setAttribute('color', new THREE.BufferAttribute(c, 3));
      b.deleteAttribute('uv');
      parts.push(b);
    };
    const R = a.header.rail;
    for (let i = 0; i + 1 < R.length; i++) {
      const [x0, y0, z0] = R[i], [x1, y1, z1] = R[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, tx = (x1 - x0) / len, tz = (z1 - z0) / len;
      for (const s of [-0.28, 0.28]) box(0.05, 0.07, len + 0.04, cx + tz * s, cy + 0.17, cz - tx * s, rot, 0x6a645c);
      box(0.75, 0.06, 0.16, cx, cy + 0.11, cz, rot, 0x4a3522);
    }
    const tg = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    tg.computeVertexNormals();
    g.add(new THREE.Mesh(tg, lampMaterial(L)));
  }
  return g;
}

/** A station's plaque: a small board on a post with its title, lit by the lamp */
function buildPlaque(L, text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#2e2014'; x.fillRect(0, 0, 256, 96);
  x.fillStyle = '#f1e2c4'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let px = 40;
  do x.font = `700 ${px}px Georgia, serif`; while (x.measureText(text).width > 236 && --px > 16);
  x.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicNodeMaterial({ map: tex });
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), m); board.position.y = 1.35;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), m); back.position.y = 1.35; back.rotation.y = Math.PI;
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), new THREE.MeshBasicNodeMaterial({ color: 0xffb04a })); lamp.position.y = 1.62;
  g.add(board, back, lamp);
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
  /** The mountain settling: a low, long rumble and a few stones falling */
  quake() {
    if (!this.init()) return;
    const ctx = this.audio.context, now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(1.2, now + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
    src.connect(lp).connect(g).connect(this.bus); src.start(now); src.stop(now + 2.8);
    for (let i = 0; i < 7; i++) {
      const at = now + 0.6 + Math.random() * 1.8;
      const s = ctx.createBufferSource(); s.buffer = this.noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 1800; bp.Q.value = 2;
      const sg = ctx.createGain(); sg.gain.setValueAtTime(0.25, at); sg.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
      s.connect(bp).connect(sg).connect(this.bus); s.start(at, Math.random() * 0.5, 0.08);
    }
  }
  /** The draught: a breath of air through the gallery */
  whoosh() {
    if (!this.init()) return;
    const ctx = this.audio.context, now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(300, now); bp.frequency.exponentialRampToValueAtTime(1400, now + 0.7); bp.frequency.exponentialRampToValueAtTime(400, now + 1.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.6, now + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    src.connect(bp).connect(g).connect(this.bus); src.start(now); src.stop(now + 2);
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

// --- Jöri, the guide -------------------------------------------------------------------------------------------------------
/**
 * A miner of boxes: black Bergkittel, leather apron, the Fahrhut, a lantern in his right hand. `mat(colour)` gives the
 * materials (the lamp-lit one inside, a plain one outside). userData: legs, arms (to swing), lantern (its local point).
 */
function buildMiner(mat) {
  const g = new THREE.Group();
  g.name = 'Joeri';
  const part = (w, h, d, x, y, z, colour, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(colour)); m.position.set(x, y, z); parent.add(m); return m; };
  const legs = [-0.1, 0.1].map((x) => {
    const hip = new THREE.Group(); hip.position.set(x, 0.86, 0); g.add(hip);
    part(0.13, 0.8, 0.14, 0, -0.42, 0, 0x2b2622, hip);
    part(0.15, 0.08, 0.24, 0, -0.84, 0.04, 0x1a1512, hip);
    return hip;
  });
  part(0.42, 0.62, 0.24, 0, 1.17, 0, 0x1c1a19); // the Bergkittel
  part(0.36, 0.42, 0.04, 0, 0.88, -0.13, 0x5a3a20); // the Arschleder, behind
  part(0.4, 0.06, 0.26, 0, 1.0, 0, 0x6b4a2c); // the belt
  part(0.17, 0.08, 0.17, 0, 1.52, 0, 0xd9b08c); // the neck
  part(0.22, 0.24, 0.22, 0, 1.66, 0, 0xd9b08c); // the head
  part(0.24, 0.08, 0.04, 0, 1.6, 0.11, 0x6a5038); // the beard
  part(0.3, 0.03, 0.3, 0, 1.79, 0, 0x151312); // the Fahrhut's brim
  part(0.2, 0.17, 0.2, 0, 1.88, 0, 0x151312); // its crown
  const arms = [-0.27, 0.27].map((x) => {
    const sh = new THREE.Group(); sh.position.set(x, 1.42, 0); g.add(sh);
    part(0.11, 0.6, 0.12, 0, -0.3, 0, 0x1c1a19, sh);
    part(0.1, 0.1, 0.1, 0, -0.63, 0, 0xd9b08c, sh);
    return sh;
  });
  // the lantern, in the right hand (a frog lamp: a squat body, the flame's glow)
  const lamp = new THREE.Group(); lamp.position.set(0, -0.72, 0.06); arms[1].add(lamp);
  part(0.12, 0.14, 0.12, 0, -0.06, 0, 0x5a4a30, lamp);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.07), new THREE.MeshBasicNodeMaterial({ color: 0xffc46a })); glow.position.set(0, -0.05, 0.05); lamp.add(glow);
  g.userData = { legs, arms, lamp: glow };
  return g;
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
.mine-station{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:41;width:min(460px,calc(100vw - 32px));box-sizing:border-box;pointer-events:none;background:rgba(14,10,6,.86);border:1px solid rgba(255,220,160,.25);border-radius:14px;padding:12px 16px;color:#f3e6cc;font:500 14px/1.45 Inter,system-ui,sans-serif;opacity:0;transition:opacity .4s}
.mine-station b{display:block;font:800 17px/1.2 Georgia,serif;color:#ffd36b;margin-bottom:4px}
.mine-say{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:41;width:min(520px,calc(100vw - 32px));box-sizing:border-box;pointer-events:none;background:rgba(14,10,6,.86);border:1px solid rgba(255,200,120,.3);border-radius:14px;padding:11px 16px;color:#f3e6cc;font:500 15px/1.45 Inter,system-ui,sans-serif;opacity:0;transition:opacity .3s}
.mine-say b{color:#ffc46a;font:800 15px Georgia,serif;margin-right:6px}
.mine-quiz{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:42;width:min(520px,calc(100vw - 32px));box-sizing:border-box;background:rgba(14,10,6,.92);border:1px solid rgba(255,200,120,.45);border-radius:14px;padding:12px 16px;color:#f3e6cc;font:500 15px/1.45 Inter,system-ui,sans-serif}
.mine-quiz[hidden]{display:none}
.mine-quiz b{color:#ffc46a;font:800 15px Georgia,serif;margin-right:6px}
.mine-quiz div{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}
.mine-quiz button{flex:1 1 120px;border:1px solid rgba(255,200,120,.5);background:rgba(255,196,106,.12);color:#ffe2b0;border-radius:10px;padding:9px 10px;font:700 14px Inter,system-ui,sans-serif;cursor:pointer}
.mine-quiz button:hover{background:rgba(255,196,106,.25)}
`;

/** The adit an objective wants the walker in (null: outside) */
const wantedAdit = (run) => (run.phase === 'running' || run.phase === 'ready' ? run.def.objectives[run.index]?.inside ?? null : null);

const mineFeature = {
  setup(run) {
    const s = document.createElement('style');
    s.textContent = STYLE;
    document.head.append(s);
    run.cleanups.push(() => s.remove());
    const kind = run.def.mine?.kind || 'ore';
    const ids = kind === 'tour' ? ['dalvazzer', 'hilfsstollen'] : [run.def.mine?.adit || 'hilfsstollen'];
    const parsed = {};
    for (const id of ids) {
      buildPortal(run.group, ADITS[id], id === 'dalvazzer' ? 'Dalvazzer' : 'Hilfsstollen');
      loadAdit(id).then((a) => { parsed[id] = a; }, (e) => console.warn('[mine] scan', id, e));
    }
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
    const station = el('div'); station.className = 'mine-station';
    document.body.append(hud, toast, station);
    // the guide's words and questions
    const say = el('div'); say.className = 'mine-say';
    const quiz = el('div'); quiz.className = 'mine-quiz'; quiz.hidden = true;
    document.body.append(say, quiz);
    run.cleanups.push(() => { hud.remove(); toast.remove(); station.remove(); say.remove(); quiz.remove(); document.body.classList.remove('mine-indoor'); });
    run.mine = { kind, parsed, hud, oil, oilFill, basket, toast, toastT: 0, station, stationT: 0, touchStrike: false, inside: null, audio: null, lastIndex: 0,
      say, quiz, queue: [], line: null, lineT: 0, greeted: false, outside: null };
    if (kind === 'tour') {
      // Jöri waiting outside, at the next portal (a plain material: the daylight lights him)
      const plain = new Map();
      const mat = (c) => { if (!plain.has(c)) plain.set(c, new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.85 })); return plain.get(c); };
      const outside = buildMiner(mat);
      for (const o of outside.children) o.castShadow = true;
      outside.visible = false;
      run.group.add(outside);
      run.mine.outside = outside;
      // the answers: 1–3 (before the game's own keys see them), or tapped
      run.listen(window, 'keydown', (e) => {
        if (!run.state?.quiz?.pending) return;
        const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
        if (n == null) return;
        e.preventDefault(); e.stopPropagation();
        mineFeature.answer(run, n);
      }, true);
    }
  },
  /** The guide says a line (now, or after what he is saying) */
  queue(run, lines) { if (lines?.length) run.mine.queue.push(...lines); },
  answer(run, n) {
    const M = run.mine;
    const r = answerQuiz(run.state, n);
    if (!r) return;
    M.quiz.hidden = true;
    M.audio?.answer?.(r.right);
    M.line = null; M.lineT = 0;
    M.queue.unshift({ text: r.say, right: r.right });
  },
  reset(run) {
    mineFeature.leave(run);
    run.mine.audio?.dispose(); run.mine.audio = new MineAudio(run.hooks.audio);
    run.mine.hud.hidden = true;
    run.mine.lastIndex = 0;
    run.mine.station.style.opacity = '0';
    Object.assign(run.mine, { queue: [], line: null, lineT: 0, greeted: false });
    run.mine.say.style.opacity = '0';
    run.mine.quiz.hidden = true;
    if (run.state) { run.state.shift = null; run.state.walk = null; run.state.points = null; }
  },
  teardown(run) {
    mineFeature.leave(run);
    run.mine.audio?.dispose();
  },
  /** Into the mountain: the gallery built, the walker parked at the door, the camera ours */
  enter(run, id) {
    const M = run.mine, a = M.parsed[id];
    const L = {
      pos: uniform(new THREE.Vector3()), dir: uniform(new THREE.Vector3(0, 0, 1)), power: uniform(1), day: uniform(1), ambient: uniform(M.kind === 'tour' ? 0.5 : 0),
      lanterns: Array.from({ length: LANTERNS }, () => uniform(new THREE.Vector3(0, -1e4, 0))), lanternPower: uniform(1)
    };
    const A = ADITS[id];
    const origin = new THREE.Vector3(A.x, groundHeight(A.x, A.z) + LIFT, A.z);
    const group = new THREE.Group();
    group.name = 'MineInterior';
    group.position.copy(origin);
    const ore = M.kind === 'ore';
    group.add(buildGallery(a, L, { rails: ore }));
    let mine = null, veins = null, hunt = null, tools = null;
    const lamps = [];
    if (ore) {
      const seed = run.state.seed ?? (run.state.seed = Number(new URLSearchParams(location.search).get('seed')) || mineSeedOfDay());
      mine = createMine(a, seed);
      veins = buildVeins(mine, L);
      placeVeins(veins, mine);
      group.add(run.storage(veins));
      hunt = buildHunt(L);
      group.add(hunt);
      tools = buildTools(L);
      run.group.add(tools.hammer, tools.chisel);
      for (const s of [30, 110, 190]) { const p = railAt(mine.rail, s); lamps.push(new THREE.Vector3(p.x - p.tz * 0.5, p.y + 1.7, p.z + p.tx * 0.5)); }
      run.state.shift = createShift(mine);
    } else {
      // the tour: a plaque with a lantern at each of this adit's stations
      const pts = {};
      for (const [key, st] of Object.entries(TOUR_STATIONS)) {
        if (st.adit !== id) continue;
        const p = stationPoint(a, st);
        pts[key] = p;
        const f = a.floor.at(p.x, p.z);
        const plaque = buildPlaque(L, t(st.title));
        plaque.position.set(p.x, f ? f.y : p.y, p.z);
        plaque.rotation.y = Math.atan2(-p.x, -p.z); // (towards the portal: the way one comes)
        group.add(plaque);
        if (lamps.length < LANTERNS) lamps.push(new THREE.Vector3(p.x, (f ? f.y : p.y) + 1.62, p.z));
      }
      run.state.points = pts;
      run.state.walk = { adit: id, ...createWalker(a) };
    }
    // Jöri inside: lamp-lit, a few metres ahead (the first lantern is his)
    let guide = null, miner = null;
    if (!ore) {
      guide = createGuide(a, createMine(a, 1));
      const lit = new Map();
      miner = buildMiner((c) => { if (!lit.has(c)) lit.set(c, lampMaterial(L, { tint: c })); return lit.get(c); });
      group.add(miner);
      lamps.unshift(new THREE.Vector3(guide.x, guide.y + 1, guide.z));
      lamps.length = Math.min(lamps.length, LANTERNS);
    }
    lamps.forEach((p, i) => L.lanterns[i].value.copy(p).add(origin));
    run.group.add(group);
    group.updateMatrixWorld(true);
    const cm = run.hooks.controllerManager;
    const fade = el('div', 'position:fixed;inset:0;background:#000;z-index:39;pointer-events:none;opacity:1;transition:opacity .6s');
    document.body.append(fade);
    requestAnimationFrame(() => requestAnimationFrame(() => { fade.style.opacity = '0'; }));
    document.body.classList.add('mine-indoor');
    const prevDriver = cm.personDriver;
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; }; // (the walker waits at the door)
    M.inside = { id, a, group, mine, L, hunt, veins, tools, guide, miner, origin, fade, prevDriver, bob: 0, shake: 0, quake: 0, dark: false, camera: null, prevNear: null, snow: run.scene.getObjectByName('snowfall') };
    M.hud.hidden = !ore;
  },
  leave(run) {
    const M = run.mine, I = M?.inside;
    if (!I) return;
    if (run.state?.quiz?.pending && run.phase === 'running') mineFeature.answer(run, -1); // (walked off without an answer)
    I.group.removeFromParent();
    const dispose = (root) => root.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } if (o.isInstancedMesh) o.dispose(); });
    dispose(I.group);
    if (I.tools) { I.tools.hammer.removeFromParent(); I.tools.chisel.removeFromParent(); dispose(I.tools.hammer); dispose(I.tools.chisel); }
    I.fade.remove();
    if (I.camera && I.prevNear != null) { I.camera.near = I.prevNear; I.camera.updateProjectionMatrix(); }
    if (I.snow) I.snow.visible = true;
    document.body.classList.remove('mine-indoor');
    const cm = run.hooks.controllerManager;
    cm.personDriver = I.prevDriver ?? null;
    run.hooks.cameraSystem?.resetForTeleport?.();
    M.inside = null;
    M.hud.hidden = true;
  },
  toast(run, text, colour = '#f3e6cc', secs = 1.6) {
    const M = run.mine;
    M.toast.textContent = text; M.toast.style.color = colour; M.toast.style.opacity = '1'; M.toastT = secs;
  },
  /** The guide's lines, one after the other; a question waits for its answer; the events with their lines */
  talk(run, dt) {
    const M = run.mine, I = M.inside;
    if (M.lineT > 0) M.lineT -= dt;
    if (M.line && M.lineT > 0) return;
    if (run.state?.quiz?.pending) return; // (the question stays until answered)
    if (M.line) { M.line = null; M.say.style.opacity = '0'; }
    const next = M.queue.shift();
    if (!next) return;
    if (next.quiz) {
      const q = GUIDE_QUIZ[next.quiz];
      if (!run.state.quiz || run.state.quiz.answers[next.quiz] != null) return;
      run.state.quiz.pending = next.quiz;
      M.quiz.replaceChildren(el('b', null, `${GUIDE.name}:`), document.createTextNode(t(q.question)));
      const row = el('div');
      q.options.forEach((o, i) => {
        const b = el('button', null, `${i + 1} · ${t(o)}`); b.type = 'button';
        run.listen(b, 'click', (e) => { e.preventDefault(); mineFeature.answer(run, i); });
        row.append(b);
      });
      M.quiz.append(row);
      M.quiz.hidden = false;
      M.say.style.opacity = '0';
      return;
    }
    M.line = next;
    M.lineT = GUIDE.lineS(next.text);
    M.say.replaceChildren(el('b', null, `${GUIDE.name}:`), document.createTextNode(t(next.text)));
    M.say.style.color = next.right === false ? '#ffb4a8' : '';
    M.say.style.opacity = '1';
    if (next.event === 'rumble') { M.audio?.quake(); if (I) I.quake = 2.6; }
    if (next.event === 'draught') { M.audio?.whoosh(); if (I) I.dark = true; }
    if (next.event === 'relight') { if (I) I.dark = false; M.audio?.strike?.('barren'); }
  },
  /** Jöri outside: at the portal the objective walks to, facing the visitor; he greets once */
  guideOutside(run, ctx) {
    const M = run.mine, o = M.outside;
    if (!o) return;
    const obj = run.def.objectives[run.index];
    const id = obj?.id === 'dalvazzer' ? 'dalvazzer' : obj?.id === 'hilfsstollen' ? 'hilfsstollen' : null;
    o.visible = !!id && !M.inside && (run.phase === 'running' || run.phase === 'ready');
    if (!o.visible) return;
    const A = ADITS[id];
    // (beside the door, a step up the slope towards the portal)
    const sx = A.door.x - A.out[1] * 1.6 - A.out[0] * 0.8, sz = A.door.z + A.out[0] * 1.6 - A.out[1] * 0.8;
    o.position.set(sx, groundHeight(sx, sz), sz);
    o.rotation.y = Math.atan2(ctx.x - sx, ctx.z - sz);
    const t0 = performance.now() / 1000;
    o.userData.arms[0].rotation.x = 0.1 * Math.sin(t0 * 1.3);
    if (id === 'dalvazzer' && !M.greeted && Math.hypot(ctx.x - sx, ctx.z - sz) < 16) { M.greeted = true; mineFeature.queue(run, GUIDE_SCRIPT.dalvazzer.greet); }
  },
  update(run, ctx, dt, cm) {
    const M = run.mine;
    // the objectives done and begun: what Jöri says to them
    if (run.index !== M.lastIndex) {
      if (M.kind === 'tour' && run.index > M.lastIndex) {
        // (what he meant to say setting off for a station already reached, he leaves unsaid)
        M.queue = M.queue.filter((l) => !l.walk);
        if (M.line?.walk) M.lineT = Math.min(M.lineT, 0.6);
        for (let i = M.lastIndex; i < run.index; i++) mineFeature.queue(run, GUIDE_SCRIPT[run.def.objectives[i]?.id]?.arrive);
        // (what he says setting off, he says walking)
        mineFeature.queue(run, GUIDE_SCRIPT[run.def.objectives[run.index]?.id]?.start?.map((l) => ({ ...l, walk: true })));
      }
      M.lastIndex = run.index;
    }
    if (M.kind === 'tour') mineFeature.guideOutside(run, ctx);
    mineFeature.talk(run, dt);
    if (M.stationT > 0 && (M.stationT -= dt) <= 0) M.station.style.opacity = '0';
    if (M.toastT > 0 && (M.toastT -= dt) <= 0) M.toast.style.opacity = '0';
    // in and out of the adits, as the objectives want
    const want = wantedAdit(run);
    if (M.inside && M.inside.id !== want && !(M.kind === 'ore' && run.state.shift?.over)) mineFeature.leave(run);
    if (want && !M.inside && M.parsed[want] && !(M.kind === 'ore' && run.state.shift)) mineFeature.enter(run, want);
    const I = M.inside;
    if (!I) return;
    if (run.phase !== 'running' && run.phase !== 'ready') return;
    const k = cm.keys, num = (v) => (v === true ? 1 : Number(v) || 0);
    const input = { forward: num(k.forward), back: num(k.backward), turn: num(k.left) - num(k.right), strike: !!k.up || M.touchStrike };
    let left = Math.min(dt, 0.1);
    if (M.kind === 'tour') {
      const w = run.state.walk;
      // (in the dark after the draught: not a step)
      const still = I.dark ? { ...input, forward: 0, back: 0 } : input;
      while (left > 1e-6) { const h = Math.min(1 / 60, left); stepWalk(w, I.a, still, h); left -= h; }
      // Jöri: on to the objective's station (out to the portal on the way out), still while he talks or asks
      const obj = run.def.objectives[run.index];
      const goal = obj?.station ? run.state.points?.[obj.station] : obj?.id === 'out' ? { x: 0, z: 0 } : null;
      const talking = !!(M.line && !M.line.walk) || !!run.state.quiz?.pending;
      if (stepGuide(I.guide, w, I.a, goal, Math.min(dt, 0.1), { hold: talking }) === 'call' && !M.line && !M.queue.length) {
        mineFeature.queue(run, [{ text: GUIDE_CALLS[Math.floor(Math.random() * GUIDE_CALLS.length)], walk: true }]);
      }
      M.audio?.drip(dt);
      return;
    }
    const g = run.state.shift;
    if (!g) return;
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
    const M = run.mine, I = M.inside;
    const w = M.kind === 'ore' ? run.state?.shift : run.state?.walk;
    if (!I || !w || run.phase === 'aborted') return;
    const cam = ctx.camera;
    if (cam.near !== NEAR) { I.camera = cam; I.prevNear = cam.near; cam.near = NEAR; cam.updateProjectionMatrix(); }
    // the miner's eyes: ducking under a low roof, a little bob as it walks, the shake of a strike
    I.bob += dt * (Math.abs(w.moving || 0) > 0.05 ? 8 : 0);
    I.shake = Math.max(0, I.shake - dt);
    I.quake = Math.max(0, (I.quake || 0) - dt);
    const sh = I.shake * (Math.random() - 0.5) * 0.4 + Math.min(1, I.quake) * (Math.random() - 0.5) * 0.05;
    const f = I.a.floor.at(w.x, w.z);
    const eyeH = clamp((f ? f.ceil : w.y + 2) - w.y - 0.18, 0.95, 1.55);
    I.eyeH = I.eyeH == null ? eyeH : I.eyeH + (eyeH - I.eyeH) * Math.min(1, dt * 6);
    const eye = _v.set(w.x, w.y + I.eyeH + Math.sin(I.bob) * 0.025, w.z).add(I.origin);
    cam.position.copy(eye);
    _e.set(-0.17 + sh, w.heading + Math.PI + sh * 0.5, 0);
    cam.quaternion.setFromEuler(_e);
    cam.updateMatrixWorld();
    if (I.snow) I.snow.visible = false;
    // the lamp on the head: the camera's view, a little down; its oil gutters at the end
    const L = I.L;
    L.pos.value.copy(eye).add(_s.set(0.08, 0.12, 0).applyQuaternion(cam.quaternion));
    L.dir.value.set(0, -0.12, -1).applyQuaternion(cam.quaternion).normalize();
    const t = performance.now() / 1000;
    const flicker = 0.93 + 0.05 * Math.sin(t * 13) * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 31);
    const lamp = M.kind === 'ore' ? w.lamp : MINE.lamp;
    const low = lamp < MINE.lampLow ? (lamp / MINE.lampLow) * (0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 9)) : 1;
    L.power.value = w.over === 'dark' || I.dark ? 0 : flicker * Math.max(0.15, low);
    L.lanternPower.value = 0.9 + 0.1 * Math.sin(t * 5.1);
    if (M.kind !== 'ore') {
      // Jöri: walking (legs and arms swinging), his lantern the first of the lanterns
      const G = I.guide, m = I.miner;
      if (G && m) {
        I.gait = (I.gait || 0) + dt * (G.moving ? G.moving * 4.2 : 0);
        const sw = G.moving ? Math.sin(I.gait) : 0;
        m.position.set(G.x, G.y + (G.moving ? Math.abs(Math.cos(I.gait)) * 0.03 : 0), G.z);
        m.rotation.y = G.heading;
        m.userData.legs[0].rotation.x = sw * 0.5; m.userData.legs[1].rotation.x = -sw * 0.5;
        m.userData.arms[0].rotation.x = -sw * 0.4; m.userData.arms[1].rotation.x = -0.35 + sw * 0.15;
        m.updateMatrixWorld(true);
        m.userData.lamp.getWorldPosition(L.lanterns[0].value);
        L.lanterns[0].value.y += 0.05;
        // (the lantern brighter than the plaques': it is what the visitor follows; in the draught's dark it is
        // all there is, and dim)
        L.lanternPower.value *= I.dark ? 0.55 : 1.25;
        L.ambient.value = I.dark ? 0 : 0.5;
      }
      return;
    }
    const g = w;
    // the hunt on its rails, its heap
    const hp = railAt(I.mine.rail, g.hunt.s);
    I.hunt.position.set(hp.x, hp.y, hp.z);
    I.hunt.rotation.y = Math.atan2(hp.tx, hp.tz);
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
