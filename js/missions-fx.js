import * as THREE from 'three/webgpu';
import { attribute, texture, uv, vec4 } from 'three/tsl';
import { groundHeight, groundNormal } from './terrain.js';

// js/missions-fx.js
// The missions' effects (js/missions.js): one particle batch for the shots' smoke trails, the snow fountains of the
// impacts, the flashes and the avalanches' snow clouds (an InstancedMesh of camera-facing quads, MAX_PARTICLES at most,
// one draw call), and the sounds the city's audio system has no voice for: the dull detonation with its echo off the
// slopes, the launcher's thump and the patrol car's two-tone siren, synthesised on the audio system's context.

export const MAX_PARTICLES = 400;

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

export class ParticleBatch {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const tint = attribute('aTint', 'vec4');
    this.texture = puffTexture();
    const puff = texture(this.texture, uv());
    mat.colorNode = vec4(tint.xyz, puff.a.mul(tint.w));
    const mesh = this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 990;
    mesh.name = 'MissionParticles';
    mesh.count = 0;
    scene.add(mesh);
    this.particles = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._n = { x: 0, y: 1, z: 0 };
  }

  /** One particle: { x, y, z, vx, vy, vz, life (s), size0, size1, r, g, b, alpha, kind, gravity, drag } */
  spawn(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ age: 0, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, size0: 1, size1: 3, alpha: 0.8, r: 1, g: 1, b: 1, kind: 'smoke', ...p });
  }

  /** The powder cloud of an avalanche released at (x, z): `count` lumps of snow set off down the fall line over
   *  `seconds`, spread `spread` m across (the batch emits them over the following frames) */
  avalanche(x, z, { count = 150, seconds = 2.2, spread = 26 } = {}) {
    this.releases = this.releases || [];
    this.releases.push({ x, z, left: count, rate: count / seconds, spread, acc: 0 });
  }

  update(dt, camera) {
    // The avalanches' releases: a few lumps a frame from the release point, scattered across the slope
    if (this.releases) {
      for (const r of this.releases) {
        r.acc += r.rate * dt;
        while (r.acc >= 1 && r.left > 0) {
          r.acc--; r.left--;
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r.spread;
          const px = r.x + Math.cos(a) * d, pz = r.z + Math.sin(a) * d;
          this.spawn({ x: px, y: groundHeight(px, pz) + 1.5, z: pz, kind: 'avalanche', life: 7 + Math.random() * 3, size0: 12 + Math.random() * 6, size1: 45 + Math.random() * 20, alpha: 0.8 + Math.random() * 0.2, ...(() => { const k = 0.66 + Math.random() * 0.16; return { r: k, g: k + 0.03, b: k + 0.1 }; })(), speed: 0, lift: 5 + Math.random() * 8 });
        }
      }
      this.releases = this.releases.filter((r) => r.left > 0);
    }
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) { list[i] = list[list.length - 1]; list.pop(); continue; }
      if (p.kind === 'avalanche') {
        // Down the fall line: the horizontal part of the surface normal points downhill; the cloud gathers speed, spreads
        // a little sideways and rides a few metres over the snow
        const n = groundNormal(p.x, p.z, this._n);
        const hx = n.x, hz = n.z, h = Math.hypot(hx, hz) || 1e-3;
        const accel = 3.0 + 9 * (h / (n.y || 1)); // steeper: faster
        p.vx += (hx / h) * accel * dt + (Math.random() - 0.5) * 2.5 * dt;
        p.vz += (hz / h) * accel * dt + (Math.random() - 0.5) * 2.5 * dt;
        const sp = Math.hypot(p.vx, p.vz), cap = 24;
        if (sp > cap) { p.vx *= cap / sp; p.vz *= cap / sp; }
        if (h < 0.12) { p.vx *= Math.max(0, 1 - 1.2 * dt); p.vz *= Math.max(0, 1 - 1.2 * dt); } // the run-out: it slows on the flat
        p.x += p.vx * dt; p.z += p.vz * dt;
        const groundY = groundHeight(p.x, p.z);
        const k = p.age / p.life;
        p.y += ((groundY + p.lift + k * 8) - p.y) * Math.min(1, dt * 2.5);
      } else {
        p.vy -= p.gravity * dt;
        if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; p.vz *= f; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.kind === 'snow') { const g = groundHeight(p.x, p.z); if (p.y < g + 0.3) { p.y = g + 0.3; p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; } }
      }
    }
    // Camera-facing quads
    const mesh = this.mesh, tint = mesh.geometry.attributes.aTint.array;
    camera.getWorldQuaternion(this._q);
    for (let i = 0; i < list.length; i++) {
      const p = list[i], k = p.age / p.life;
      const size = p.size0 + (p.size1 - p.size0) * (p.kind === 'avalanche' ? Math.sqrt(k) : k);
      // (in quickly, out slowly: the avalanche clouds swell before they thin; the flashes just vanish)
      const fade = p.kind === 'flash' ? 1 - k : p.kind === 'avalanche' ? Math.min(1, k * 6) * (1 - k) ** 1.4 : Math.min(1, k * 5) * (1 - k);
      this._p.set(p.x, p.y, p.z);
      this._s.set(size, size, size);
      this._m.compose(this._p, this._q, this._s);
      mesh.setMatrixAt(i, this._m);
      tint[i * 4] = p.r; tint[i * 4 + 1] = p.g; tint[i * 4 + 2] = p.b; tint[i * 4 + 3] = p.alpha * fade;
    }
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.attributes.aTint.needsUpdate = true;
    mesh.instanceMatrix.addUpdateRange?.(0, list.length * 16);
  }

  /** The smoke trail behind a shell at (x, y, z) */
  trail(x, y, z) {
    this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.8, vy: 0.6 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.8, life: 1.6 + Math.random() * 0.8, size0: 0.6, size1: 4.5, alpha: 0.42, r: 0.78, g: 0.78, b: 0.8, kind: 'smoke' });
  }

  /** A shell's impact: the flash, a fountain of snow and a cloud that hangs for a while */
  impact(x, y, z) {
    this.spawn({ x, y: y + 2, z, life: 0.35, size0: 10, size1: 22, alpha: 1, r: 1.6, g: 1.1, b: 0.5, kind: 'flash' });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 12;
      this.spawn({ x, y: y + 0.5, z, vx: Math.cos(a) * s * 0.45, vy: 9 + Math.random() * 11, vz: Math.sin(a) * s * 0.45, gravity: 9.81, drag: 0.6, life: 1.6 + Math.random() * 1.2, size0: 1.5, size1: 5, alpha: 0.95, r: 0.8, g: 0.83, b: 0.9, kind: 'snow' });
    }
    for (let i = 0; i < 10; i++) {
      this.spawn({ x: x + (Math.random() - 0.5) * 4, y: y + 1 + Math.random() * 3, z: z + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 3 + Math.random() * 2, size0: 3, size1: 16, alpha: 0.75, r: 0.32, g: 0.31, b: 0.3, kind: 'smoke' });
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

  _noise(seconds) {
    const ctx = this.audio.context, n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** The launcher's thump at the player */
  thump() {
    if (!this.live) return;
    const ctx = this.audio.context, now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noise(0.25);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, now); lp.frequency.exponentialRampToValueAtTime(120, now + 0.22);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    src.connect(lp).connect(g).connect(this.audio.mix);
    src.start(now);
  }

  /** The detonation `distance` m away: dull, late by the speed of sound, with its echoes off the slopes */
  boom(distance = 400, severity = 1) {
    if (!this.live) return;
    const ctx = this.audio.context, at = ctx.currentTime + distance / 340;
    const loud = Math.min(1, 320 / Math.max(80, distance)) * severity;
    const out = ctx.createGain(); out.gain.value = 0.9 * loud;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(260, at); lp.frequency.exponentialRampToValueAtTime(70, at + 1.2);
    const src = ctx.createBufferSource(); src.buffer = this._noise(1.4);
    const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, at); env.gain.exponentialRampToValueAtTime(1, at + 0.012); env.gain.exponentialRampToValueAtTime(0.001, at + 1.3);
    src.connect(env).connect(lp).connect(out);
    // the body: a 48 Hz thump falling away
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(60, at); osc.frequency.exponentialRampToValueAtTime(28, at + 0.6);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, at); og.gain.exponentialRampToValueAtTime(0.9, at + 0.02); og.gain.exponentialRampToValueAtTime(0.001, at + 0.7);
    osc.connect(og).connect(out);
    // the echoes: two feedback delays into a dull filter
    const echo = ctx.createGain(); echo.gain.value = 0.45;
    for (const [time, fb] of [[0.37, 0.42], [0.61, 0.33]]) {
      const d = ctx.createDelay(2); d.delayTime.value = time;
      const f = ctx.createGain(); f.gain.value = fb;
      const el = ctx.createBiquadFilter(); el.type = 'lowpass'; el.frequency.value = 160;
      out.connect(d); d.connect(el).connect(f).connect(d); el.connect(echo);
    }
    out.connect(this.audio.mix); echo.connect(this.audio.mix);
    src.start(at); osc.start(at); src.stop(at + 1.5); osc.stop(at + 0.8);
    setTimeout(() => { try { out.disconnect(); echo.disconnect(); } catch { /* gone */ } }, (distance / 340 + 6) * 1000);
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
