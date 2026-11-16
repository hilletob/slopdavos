import * as THREE from 'three/webgpu';
import { attribute, texture, uv, vec4 } from 'three/tsl';
import { groundHeight, groundNormal } from './terrain.js';
import { QUALITY } from './quality.js';

// js/missions-fx.js
// The missions' effects (js/missions.js): one particle batch for the shots' smoke trails, the snow fountains of the
// impacts, the flashes and the avalanches' snow clouds (an InstancedMesh of camera-facing quads, MAX_PARTICLES at most
// unless a mission asks for more, one draw call), the camera's jolt when a blast's pressure wave arrives, and the sounds
// the city's audio system has no voice for: the detonation with its echoes off the mountains, the rumble of a slab
// running, the launcher's thump and the patrol car's two-tone siren, synthesised on the audio system's context.
//
// A blast (avalanche control: the launcher's shell, a hand charge thrown from the helicopter): the white-hot flash, a
// ring of snow dust blown flat over the surface by the pressure wave, a fountain of snow and a dark ball of smoke rolling
// up. When the slab goes, the fracture line zips across the slope at its crown (a row of dark marks, puffing snow), and
// the avalanche runs: a front that follows the fall line on the terrain (gathering speed on the steep, slowing in the
// run-out) sheds a dense core of tumbling snow and, behind and above it, the powder cloud that swells and hangs. All of
// it in the one batch: nothing is built per blast, the phones (QUALITY.mobile) get half the particles, bigger.

export const MAX_PARTICLES = 400;
/** The share of a blast's or an avalanche's particles a device gets (the phones: half, each a little bigger) */
export const FX_SHARE = QUALITY.mobile ? 0.5 : 1;
const FX_GROW = QUALITY.mobile ? 1.25 : 1;
const rnd = Math.random;

// --- Particles -------------------------------------------------------------------------------------------------------
function puffTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// How a particle fades over its life k (0-1): in quickly, out slowly; the flashes just vanish, the avalanche clouds swell
// before they thin, the fracture line stays dark until the cloud has passed
const FADE = {
  flash: (k) => 1 - k,
  avalanche: (k) => Math.min(1, k * 6) * (1 - k) ** 1.4,
  powder: (k) => Math.min(1, k * 4) * (1 - k) ** 1.2,
  dust: (k) => Math.min(1, k * 10) * (1 - k),
  crack: (k) => Math.min(1, k * 25) * (1 - k) ** 0.6
};
const fadeOf = (kind, k) => (FADE[kind] ? FADE[kind](k) : Math.min(1, k * 5) * (1 - k));

export class ParticleBatch {
  /** `max`: how many particles at most (a blast with its avalanche wants ~1000 on a desktop) */
  constructor(scene, { max = MAX_PARTICLES } = {}) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const tint = attribute('aTint', 'vec4');
    this.texture = puffTexture();
    const puff = texture(this.texture, uv());
    mat.colorNode = vec4(tint.xyz, puff.a.mul(tint.w));
    const mesh = this.mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 990;
    mesh.name = 'MissionParticles';
    mesh.count = 0;
    scene.add(mesh);
    this.particles = [];
    this.releases = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._n = { x: 0, y: 1, z: 0 };
  }

  /** One particle: { x, y, z, vx, vy, vz, life (s), size0, size1, r, g, b, alpha, kind, gravity, drag, delay (s before
   *  it appears) } */
  spawn(p) {
    if (this.particles.length >= this.max) this.particles.shift();
    const q = { age: 0, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, size0: 1, size1: 3, alpha: 0.8, r: 1, g: 1, b: 1, kind: 'smoke', ...p };
    if (p.delay) q.age = -p.delay;
    this.particles.push(q);
  }

  /** Everything gone at once (a restart) */
  clear() { this.particles.length = 0; this.releases.length = 0; }

  /** The powder avalanche released at (x, z): `count` lumps of snow over `seconds`, `spread` m round the release point.
   *  With `run` (m) the avalanche has a front that rides down the fall line for that far, shedding the dense core and the
   *  powder cloud as it goes, `width` m across; `crack`: the fracture line zips across the crown first */
  avalanche(x, z, { count = 150, seconds = 2.2, spread = 26, run = 0, width = spread * 2, crack = false } = {}) {
    const n = groundNormal(x, z, this._n), h = Math.hypot(n.x, n.z) || 1e-3;
    const dx = n.x / h, dz = n.z / h;
    this.releases.push({ x, z, left: count, rate: count / seconds, spread, acc: 0, run, width, fx: x, fz: z, v: 4, travelled: 0, dx, dz, t: 0 });
    if (crack) this.fracture(x - dx * spread * 0.55, z - dz * spread * 0.55, dx, dz, width);
  }

  /** The slab's fracture line at its crown: across the slope (fall direction dx, dz), zipping out from the middle */
  fracture(cx, cz, dx, dz, width) {
    const step = QUALITY.mobile ? 3 : 1.8, half = width / 2;
    for (let s = -half, i = 0; s <= half; s += step, i++) {
      const wob = Math.sin(s * 0.33) * 1.6 + (rnd() - 0.5) * 0.8; // (a crack is never straight)
      const x = cx - dz * s + dx * wob, z = cz + dx * s + dz * wob, y = groundHeight(x, z);
      const delay = Math.abs(s) / 70; // (it runs out across the slope at ~70 m/s)
      this.spawn({ x, y: y + 0.45, z, life: 18, size0: 2.6 * FX_GROW, size1: 2.9 * FX_GROW, alpha: 0.9, r: 0.16, g: 0.2, b: 0.29, kind: 'crack', delay });
      if (i % 3 === 0) this.spawn({ x, y: y + 0.8, z, vx: dx * 3, vy: 2 + rnd() * 2, vz: dz * 3, drag: 1.5, life: 1.8 + rnd(), size0: 2, size1: 9 * FX_GROW, alpha: 0.7, r: 0.93, g: 0.95, b: 1, kind: 'dust', delay });
    }
  }

  /** One lump of an avalanche: on the old pattern a puff anywhere round the release point; with a front, the dense
   *  core (6 in 10) or the powder cloud, spread across the front and set off at its speed */
  _lump(r) {
    if (!r.run) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r.spread;
      const px = r.x + Math.cos(a) * d, pz = r.z + Math.sin(a) * d;
      const k = 0.66 + rnd() * 0.16;
      this.spawn({ x: px, y: groundHeight(px, pz) + 1.5, z: pz, kind: 'avalanche', life: 7 + rnd() * 3, size0: 12 + rnd() * 6, size1: 45 + rnd() * 20, alpha: 0.8 + rnd() * 0.2, r: k, g: k + 0.03, b: k + 0.1, lift: 5 + rnd() * 8 });
      return;
    }
    // (the front widens as it runs: the slab breaks up and fans out)
    const across = (rnd() - 0.5) * r.width * (0.7 + Math.min(0.6, r.travelled / 250)), back = rnd() * 14;
    const px = r.fx - r.dz * across - r.dx * back, pz = r.fz + r.dx * across - r.dz * back;
    const v = r.v * (0.75 + rnd() * 0.3), gy = groundHeight(px, pz);
    if (rnd() < 0.6) {
      // (the core in the shade of its own cloud: greyer and bluer than the snow it runs over, each lump its own tone)
      const k = 0.42 + rnd() * 0.38;
      this.spawn({ x: px, y: gy + 1.5, z: pz, vx: r.dx * v, vz: r.dz * v, kind: 'avalanche', life: 5 + rnd() * 3, size0: (5 + rnd() * 5) * FX_GROW, size1: (18 + rnd() * 14) * FX_GROW, alpha: 0.85 + rnd() * 0.15, r: k, g: k + 0.03, b: k + 0.11, lift: 1.5 + rnd() * 3, cap: 34, rise: 4 });
    } else {
      const k = 0.62 + rnd() * 0.38;
      this.spawn({ x: px, y: gy + 4, z: pz, vx: r.dx * v * 0.8, vz: r.dz * v * 0.8, kind: 'powder', life: 9 + rnd() * 5, size0: (12 + rnd() * 8) * FX_GROW, size1: (42 + rnd() * 34) * FX_GROW, alpha: 0.55 + rnd() * 0.2, r: k, g: k + 0.02, b: k + 0.06, lift: 6 + rnd() * 8, cap: 26, rise: 22, accel: 0.75 });
    }
  }

  update(dt, camera) {
    // The avalanches: their fronts ride down the fall line (faster on the steep, braking in the run-out), shedding lumps
    for (const r of this.releases) {
      r.t += dt;
      if (r.run && r.travelled < r.run) {
        const n = groundNormal(r.fx, r.fz, this._n), h = Math.hypot(n.x, n.z);
        if (h > 1e-3) { r.dx += (n.x / h - r.dx) * Math.min(1, dt * 3); r.dz += (n.z / h - r.dz) * Math.min(1, dt * 3); const l = Math.hypot(r.dx, r.dz) || 1; r.dx /= l; r.dz /= l; }
        r.v = Math.min(38, r.v + (2 + 14 * (h / (n.y || 1))) * dt);
        if (h < 0.15) r.v *= Math.max(0, 1 - 1.4 * dt); // (the run-out: flatter than ~8°)
        const step = r.v * dt;
        r.fx += r.dx * step; r.fz += r.dz * step; r.travelled += step;
      }
      r.acc += r.rate * dt;
      while (r.acc >= 1 && r.left > 0) { r.acc--; r.left--; this._lump(r); }
    }
    if (this.releases.length) this.releases = this.releases.filter((r) => r.left > 0);
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age < 0) continue; // (not yet: a fracture line's far ends)
      if (p.age >= p.life) { list[i] = list[list.length - 1]; list.pop(); continue; }
      if (p.kind === 'avalanche' || p.kind === 'powder') {
        // Down the fall line: the horizontal part of the surface normal points downhill; the cloud gathers speed, spreads
        // a little sideways and rides a few metres over the snow (the powder higher and higher as it swells)
        const n = groundNormal(p.x, p.z, this._n);
        const hx = n.x, hz = n.z, h = Math.hypot(hx, hz) || 1e-3;
        const accel = (3.0 + 9 * (h / (n.y || 1))) * (p.accel || 1); // steeper: faster
        p.vx += (hx / h) * accel * dt + (rnd() - 0.5) * 2.5 * dt;
        p.vz += (hz / h) * accel * dt + (rnd() - 0.5) * 2.5 * dt;
        const sp = Math.hypot(p.vx, p.vz), cap = p.cap || 24;
        if (sp > cap) { p.vx *= cap / sp; p.vz *= cap / sp; }
        if (h < 0.12) { p.vx *= Math.max(0, 1 - 1.2 * dt); p.vz *= Math.max(0, 1 - 1.2 * dt); } // the run-out: it slows on the flat
        p.x += p.vx * dt; p.z += p.vz * dt;
        const groundY = groundHeight(p.x, p.z);
        const k = p.age / p.life;
        p.y += ((groundY + p.lift + k * (p.rise ?? 8)) - p.y) * Math.min(1, dt * 2.5);
      } else {
        p.vy -= p.gravity * dt;
        if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; p.vz *= f; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.kind === 'snow') { const g = groundHeight(p.x, p.z); if (p.y < g + 0.3) { p.y = g + 0.3; p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; } }
        else if (p.kind === 'dust') { const g = groundHeight(p.x, p.z) + 0.3 + p.size0 * 0.4; if (p.y < g) p.y = g; }
      }
    }
    // Camera-facing quads (the ones still waiting for their moment left out)
    const mesh = this.mesh, tint = mesh.geometry.attributes.aTint.array;
    camera.getWorldQuaternion(this._q);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.age < 0) continue;
      const k = p.age / p.life;
      const size = p.size0 + (p.size1 - p.size0) * (p.kind === 'avalanche' || p.kind === 'powder' ? Math.sqrt(k) : k);
      this._p.set(p.x, p.y, p.z);
      this._s.set(size, size, size);
      this._m.compose(this._p, this._q, this._s);
      mesh.setMatrixAt(n, this._m);
      tint[n * 4] = p.r; tint[n * 4 + 1] = p.g; tint[n * 4 + 2] = p.b; tint[n * 4 + 3] = p.alpha * fadeOf(p.kind, k);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.attributes.aTint.needsUpdate = true;
    mesh.instanceMatrix.addUpdateRange?.(0, n * 16);
  }

  /** The smoke trail behind a shell at (x, y, z) */
  trail(x, y, z) {
    this.spawn({ x, y, z, vx: (rnd() - 0.5) * 0.8, vy: 0.6 + rnd() * 0.5, vz: (rnd() - 0.5) * 0.8, life: 1.6 + rnd() * 0.8, size0: 0.6, size1: 4.5, alpha: 0.42, r: 0.78, g: 0.78, b: 0.8, kind: 'smoke' });
  }

  /** A shell's impact: the blast */
  impact(x, y, z) { this.blast(x, y, z); }

  /** A detonation on the snow at (x, y, z): the white-hot flash and its glow, the ring of snow dust the pressure wave
   *  blows flat over the surface, a fountain of snow and a dark ball of smoke rolling up and greying; `scale` its size */
  blast(x, y, z, { scale = 1 } = {}) {
    const s = scale, q = FX_SHARE, g = FX_GROW;
    this.spawn({ x, y: y + 3 * s, z, life: 0.22, size0: 20 * s, size1: 34 * s, alpha: 1, r: 2.6, g: 2.3, b: 1.8, kind: 'flash' });
    this.spawn({ x, y: y + 4 * s, z, life: 0.8, size0: 34 * s, size1: 85 * s, alpha: 0.75, r: 1.9, g: 1.0, b: 0.42, kind: 'flash' });
    const ring = Math.round(34 * q);
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rnd() * 0.15, sp = (24 + rnd() * 12) * s;
      this.spawn({ x: x + Math.cos(a) * 2, y: y + 1, z: z + Math.sin(a) * 2, vx: Math.cos(a) * sp, vy: 0.5 + rnd() * 1.5, vz: Math.sin(a) * sp, drag: 2.6, life: 1.8 + rnd() * 0.9, size0: 3 * s * g, size1: 15 * s * g, alpha: 0.75, r: 0.9, g: 0.93, b: 1, kind: 'dust' });
    }
    const lumps = Math.round(40 * q);
    for (let i = 0; i < lumps; i++) {
      const a = rnd() * Math.PI * 2, sp = (5 + rnd() * 12) * s;
      this.spawn({ x, y: y + 0.5, z, vx: Math.cos(a) * sp * 0.5, vy: (10 + rnd() * 16) * s, vz: Math.sin(a) * sp * 0.5, gravity: 9.81, drag: 0.5, life: 1.8 + rnd() * 1.4, size0: 1.5 * g, size1: 6 * s * g, alpha: 0.95, r: 0.82, g: 0.85, b: 0.92, kind: 'snow' });
    }
    const smoke = Math.round(22 * q);
    for (let i = 0; i < smoke; i++) {
      const k = 0.16 + rnd() * 0.12;
      this.spawn({ x: x + (rnd() - 0.5) * 5 * s, y: y + (1 + rnd() * 4) * s, z: z + (rnd() - 0.5) * 5 * s, vx: (rnd() - 0.5) * 4, vy: (2.5 + rnd() * 4) * s, vz: (rnd() - 0.5) * 4, drag: 0.7, life: 5 + rnd() * 3, size0: 6 * s * g, size1: (30 + rnd() * 14) * s * g, alpha: 0.9, r: k, g: k, b: k * 0.96, kind: 'smoke' });
    }
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose(); // (its instance matrices)
    this.texture.dispose();
    this.particles.length = 0;
    this.releases = [];
  }
}

// --- The camera's jolt ---------------------------------------------------------------------------------------------
/** The pressure wave of a blast, felt in the camera: kicks that arrive with the sound (`delay`) and die away; applied
 *  after the camera is placed for the frame (a feature's after()), as a few hundredths of a radian of shaking */
export class CameraShake {
  constructor() { this.kicks = []; this.t = 0; }
  /** A jolt of `strength` rad at its peak, `delay` s from now, gone after `seconds` */
  kick(strength, { delay = 0, seconds = 0.9 } = {}) { if (strength > 0) this.kicks.push({ at: this.t + delay, strength, seconds }); }
  /** The jolt a detonation `distance` m away gives the camera (a launcher's shell 400 m off: ~1°) */
  static strengthAt(distance, severity = 1) { return Math.min(0.045, 7 / Math.max(50, distance)) * severity; }
  clear() { this.kicks.length = 0; }
  apply(camera, dt) {
    this.t += dt;
    if (!this.kicks.length) return;
    let a = 0;
    for (const k of this.kicks) { const u = this.t - k.at; if (u >= 0 && u < k.seconds) a += k.strength * (1 - u / k.seconds) ** 2; }
    this.kicks = this.kicks.filter((k) => this.t < k.at + k.seconds);
    if (a < 1e-5 || !camera) return;
    const t = this.t;
    camera.rotateX((Math.sin(t * 61) * 0.6 + Math.sin(t * 37.3) * 0.4) * a);
    camera.rotateY((Math.sin(t * 53.1 + 1.3) * 0.6 + Math.sin(t * 29.7) * 0.4) * a * 0.8);
    camera.rotateZ(Math.sin(t * 44.7 + 0.7) * a * 0.4);
    camera.updateMatrixWorld();
  }
}

// --- Sounds --------------------------------------------------------------------------------------------------------
/** The missions' own sounds on the city's audio system (js/audio-system.js: its context and mix bus); silent while the
 *  sound is off or the context has not been unlocked by a gesture yet */
export class MissionAudio {
  constructor(audioSystem) {
    this.audio = audioSystem;
    this.sirenNodes = null;
  }

  get live() {
    const a = this.audio;
    return !!(a && a.enabled && a.context && a.context.state === 'running' && a.mix);
  }

  /** White noise, `seconds` long: one buffer of 2 s kept and looped (a few blasts a mission make no new buffers) */
  _noise() {
    const ctx = this.audio.context;
    if (!this._noiseBuf || this._noiseBuf.sampleRate !== ctx.sampleRate) {
      const n = Math.floor(ctx.sampleRate * 2), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
    }
    return this._noiseBuf;
  }
  _noiseSource() {
    const src = this.audio.context.createBufferSource();
    src.buffer = this._noise();
    src.loop = true;
    src.loopStart = 0; src.loopEnd = src.buffer.duration;
    return src;
  }

  /** The launcher's thump at the player (a charge thrown out of the helicopter's door: a softer one) */
  thump(level = 0.5) {
    if (!this.live) return;
    const ctx = this.audio.context, now = ctx.currentTime;
    const src = this._noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, now); lp.frequency.exponentialRampToValueAtTime(120, now + 0.22);
    const g = ctx.createGain(); g.gain.setValueAtTime(level, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    src.connect(lp).connect(g).connect(this.audio.mix);
    src.start(now, Math.random()); src.stop(now + 0.35);
  }

  /** The detonation `distance` m away: late by the speed of sound; close by a sharp crack over the thump, far off only
   *  the dull thud; then its echoes: the quick flutter off the near slopes and, a second and more later, the answers
   *  of the mountains across the valley */
  boom(distance = 400, severity = 1) {
    if (!this.live) return;
    const ctx = this.audio.context, at = ctx.currentTime + distance / 340;
    const loud = Math.min(1, 320 / Math.max(80, distance)) * severity;
    const near = Math.max(0, 1 - distance / 600); // (the crack carries only a few hundred metres)
    const out = ctx.createGain(); out.gain.value = 0.9 * loud;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(260 + 900 * near, at); lp.frequency.exponentialRampToValueAtTime(70, at + 1.2);
    const src = this._noiseSource();
    const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, at); env.gain.exponentialRampToValueAtTime(1, at + 0.012); env.gain.exponentialRampToValueAtTime(0.001, at + 1.3);
    src.connect(env).connect(lp).connect(out);
    if (near > 0) {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
      const ce = ctx.createGain(); ce.gain.setValueAtTime(0.0001, at); ce.gain.exponentialRampToValueAtTime(0.7 * near, at + 0.004); ce.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
      src.connect(hp).connect(ce).connect(out);
    }
    // the body: a 48 Hz thump falling away
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(60, at); osc.frequency.exponentialRampToValueAtTime(28, at + 0.6);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, at); og.gain.exponentialRampToValueAtTime(0.9, at + 0.02); og.gain.exponentialRampToValueAtTime(0.001, at + 0.7);
    osc.connect(og).connect(out);
    // the echoes: two feedback delays into a dull filter (the near slopes), three late taps (the far side of the valley)
    const echo = ctx.createGain(); echo.gain.value = 0.45;
    for (const [time, fb] of [[0.37, 0.42], [0.61, 0.33]]) {
      const d = ctx.createDelay(2); d.delayTime.value = time;
      const f = ctx.createGain(); f.gain.value = fb;
      const el = ctx.createBiquadFilter(); el.type = 'lowpass'; el.frequency.value = 160;
      out.connect(d); d.connect(el).connect(f).connect(d); el.connect(echo);
    }
    for (const [time, level] of [[1.15, 0.5], [1.9, 0.36], [2.85, 0.22]]) {
      const d = ctx.createDelay(3); d.delayTime.value = time;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      const g = ctx.createGain(); g.gain.value = level;
      out.connect(d); d.connect(f).connect(g).connect(echo);
    }
    out.connect(this.audio.mix); echo.connect(this.audio.mix);
    src.start(at, Math.random()); osc.start(at); src.stop(at + 1.5); osc.stop(at + 0.8);
    setTimeout(() => { try { out.disconnect(); echo.disconnect(); } catch { /* gone */ } }, (distance / 340 + 8) * 1000);
  }

  /** The slab running `distance` m away: a low roar that swells for a second, holds and dies away over `seconds`,
   *  starting `delay` s from now (and late by the speed of sound) */
  rumble(distance = 400, { seconds = 6, delay = 0, severity = 1 } = {}) {
    if (!this.live) return;
    const ctx = this.audio.context, at = ctx.currentTime + delay + distance / 340;
    const loud = Math.min(1, 300 / Math.max(80, distance)) * severity;
    const src = this._noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(240, at); lp.frequency.linearRampToValueAtTime(110, at + seconds);
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.55 * loud, at + 1.1);
    g.gain.setValueAtTime(0.55 * loud, at + seconds * 0.45); g.gain.exponentialRampToValueAtTime(0.0005, at + seconds);
    src.connect(lp).connect(lp2).connect(g).connect(this.audio.mix);
    src.start(at, Math.random()); src.stop(at + seconds + 0.1);
    setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, (delay + distance / 340 + seconds + 1) * 1000);
  }

  /** The patrol car's two-tone siren (Swiss "Wechselklang"), on or off */
  siren(on) {
    if (!on) {
      if (this.sirenNodes) { const { g, osc, lfo } = this.sirenNodes; const now = this.audio.context.currentTime; g.gain.setTargetAtTime(0.0001, now, 0.08); setTimeout(() => { try { osc.stop(); lfo.stop(); g.disconnect(); } catch { /* gone */ } }, 400); this.sirenNodes = null; }
      return;
    }
    if (this.sirenNodes || !this.live) return;
    const ctx = this.audio.context, now = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 470;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.1;
    const depth = ctx.createGain(); depth.gain.value = 55; // 415 / 525 Hz
    lfo.connect(depth).connect(osc.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.09, now + 0.3);
    osc.connect(lp).connect(g).connect(this.audio.mix);
    osc.start(now); lfo.start(now);
    this.sirenNodes = { g, osc, lfo };
  }

  dispose() { this.siren(false); }
}
