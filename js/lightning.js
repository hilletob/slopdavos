import * as THREE from 'three/webgpu';
import { uniform, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';

// js/lightning.js
// The thunderstorm's lightning (js/weather.js `storm`): now and then a strike somewhere 0.5-8 km round the camera, more
// often the harder it storms. A strike is a flash (a few flickers within half a second: js/lighting.js lights the sky,
// the fill and the environment with it, setFlash) and, when it comes down within sight, its bolt: a jagged ribbon from
// the cloud base to the ground with a branch, turned to face the camera, as bright as the flash. The thunder is the
// audio's (onStrike: the distance and the direction, js/audio-system.js thunder), late by the sound's way.
// (Math.random: only the look and the sound depend on it, nothing the game keeps)

const SEGMENTS = 34, BRANCH = 14; // the bolt's segments, and its branch's
const MAX_QUADS = SEGMENTS + BRANCH;
const CLOUD_BASE = 1500; // metres above the ground where the bolt comes out of the cloud
const NEAR = 500, FAR = 8000; // metres, how far from the camera strikes fall
const BOLT_FAR = 6500; // farther than this only the flash is seen
// The flickers of one strike: [seconds after it, strength]
const FLICKERS = [[0, 1], [0.07, 0.35], [0.15, 0.85], [0.33, 0.3]];
const FLICKER_DECAY = 22; // 1/s

export function buildLightning(scene, { lighting, onStrike = null } = {}) {
  const positions = new Float32Array(MAX_QUADS * 4 * 3);
  const index = new Uint16Array(MAX_QUADS * 6);
  for (let q = 0; q < MAX_QUADS; q++) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const glow = uniform(0);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending });
  material.colorNode = vec3(2.6, 2.7, 3.4).mul(glow);
  const bolt = new THREE.Mesh(geometry, material);
  bolt.name = 'lightning';
  bolt.frustumCulled = false;
  bolt.visible = false;
  bolt.renderOrder = 11;
  scene.add(bolt);

  let storm = 0, nextIn = 4, strikeAt = -1, strength = 0, showBolt = false, clock = 0, quads = 0, holdUntil = -1;
  const path = [], branch = [];
  for (let i = 0; i <= SEGMENTS; i++) path.push(new THREE.Vector3());
  for (let i = 0; i <= BRANCH; i++) branch.push(new THREE.Vector3());
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _side = new THREE.Vector3(), _toCam = new THREE.Vector3();

  // A jagged line from `top` to `bottom` into `pts`: a random walk sideways, pulled back so that it ends where it should
  function jag(pts, top, bottom, rough) {
    const n = pts.length - 1;
    let ox = 0, oz = 0;
    const offs = [];
    for (let i = 0; i <= n; i++) {
      offs.push([ox, oz]);
      ox += (Math.random() - 0.5) * rough;
      oz += (Math.random() - 0.5) * rough;
    }
    const [ex, ez] = offs[n];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts[i].lerpVectors(top, bottom, t);
      pts[i].x += offs[i][0] - ex * t;
      pts[i].z += offs[i][1] - ez * t;
    }
  }

  function strike(camera) {
    const d = NEAR + Math.pow(Math.random(), 0.8) * (FAR - NEAR);
    // (more than half of them in front, where they are seen)
    const fwd = camera.getWorldDirection(_a);
    const ahead = Math.atan2(fwd.x, fwd.z);
    const angle = Math.random() < 0.6 ? ahead + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
    const x = camera.position.x + Math.sin(angle) * d, z = camera.position.z + Math.cos(angle) * d;
    let ground = groundHeight(x, z);
    if (!Number.isFinite(ground)) ground = camera.position.y - 100;
    strength = 0.35 + 0.65 * Math.max(0, 1 - d / FAR);
    showBolt = d < BOLT_FAR;
    strikeAt = clock;
    if (showBolt) {
      _a.set(x, ground + CLOUD_BASE, z);
      _b.set(x, ground, z);
      jag(path, _a, _b, 70);
      const from = path[Math.floor(SEGMENTS * (0.25 + Math.random() * 0.25))];
      _b.set(from.x + (Math.random() - 0.5) * 500, from.y - 300 - Math.random() * 400, from.z + (Math.random() - 0.5) * 500);
      jag(branch, from, _b, 50);
      layout(camera, d);
    }
    // (left or right of the view: -1 .. 1, for the thunder's pan)
    const right = Math.cos(ahead) * Math.sin(angle) - Math.sin(ahead) * Math.cos(angle);
    onStrike?.({ distance: d, pan: Math.max(-1, Math.min(1, -right)), strength });
  }

  // The ribbon's quads, each segment turned to face the camera; thinner on the branch
  function layout(camera, d) {
    const width = 2.5 + d * 0.0022;
    quads = 0;
    const add = (pts, w) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        _a.subVectors(p1, p0);
        _toCam.subVectors(camera.position, p0);
        _side.crossVectors(_a, _toCam).normalize().multiplyScalar(w / 2);
        const o = quads * 12;
        positions[o] = p0.x - _side.x; positions[o + 1] = p0.y - _side.y; positions[o + 2] = p0.z - _side.z;
        positions[o + 3] = p0.x + _side.x; positions[o + 4] = p0.y + _side.y; positions[o + 5] = p0.z + _side.z;
        positions[o + 6] = p1.x + _side.x; positions[o + 7] = p1.y + _side.y; positions[o + 8] = p1.z + _side.z;
        positions[o + 9] = p1.x - _side.x; positions[o + 10] = p1.y - _side.y; positions[o + 11] = p1.z - _side.z;
        quads++;
      }
    };
    add(path, width);
    add(branch, width * 0.55);
    posAttr.needsUpdate = true;
    geometry.setDrawRange(0, quads * 6);
  }

  return {
    bolt,
    /** How hard it storms (0 .. 1, js/weather.js) */
    setStorm(v) { storm = v; },
    /** A strike at once (the debug switch: __slopdavos.lightning(hold)); `hold` seconds: its flash stands still that long */
    strikeNow(camera, hold = 0) { strike(camera); holdUntil = hold > 0 ? clock + hold : -1; },
    /** Per frame */
    update(dt, camera) {
      clock += dt;
      if (storm > 0.3) {
        nextIn -= dt;
        if (nextIn <= 0) {
          strike(camera);
          nextIn = (5 + Math.random() * 20) / storm;
        }
      } else nextIn = Math.max(nextIn, 3);
      let flash = 0;
      if (strikeAt >= 0) {
        const t = clock - strikeAt;
        for (const [at, a] of FLICKERS) if (t >= at) flash += a * Math.exp(-(t - at) * FLICKER_DECAY);
        flash *= strength;
        if (clock < holdUntil) { flash = strength; strikeAt = clock; }
        if (t > 1) { strikeAt = -1; flash = 0; }
      }
      lighting.setFlash(flash);
      glow.value = flash;
      bolt.visible = showBolt && flash > 0.03;
    }
  };
}
