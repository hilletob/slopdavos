import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { LIFT_CONTROLS } from './bergbahnen.js';
import { lotBays } from './parking.js';
import { BODY_SPECS, buildCarGeometry, createLoftedCarMaterial } from './actor-models.js';
import { ParticleBatch } from './missions-fx.js';
import { t } from './i18n.js';
import {
  TBAR, TBAR_LIFT_ID, tbarStep, tbarHandOver, tbarTimeTo, tbarSpeed, tbarFrontReady, createTbarGame,
  LAENDLER, LAENDLER_TEMPO, midiHz, thirdBelow, laendlerLevel,
  WAX, WAXES, createWaxBench, waxPick, waxStep, ironHeat, ironBand, waxFor, skiMelted,
  MARSHAL, ZONES, marshalZones, zoneFree, createMarshal, marshalStep, marshalGesture, marshalActive, marshalCarPose
} from './missions-data-resort.js';

// js/missions-resort.js
// The runtime of the three resort jobs (js/missions-data-resort.js has their definitions and the games' pure logic):
// js/missions.js merges RESORT_FEATURES into its features, a mission asks for one by def.features.
//  - tbarAttendant: the real T-bars of js/bergbahnen.js (LIFT_CONTROLS: the game drives the lift's clock, so the bar on
//    the timing strip is the bar on the rope), the lane of skiers (two instanced meshes), the hut with its Ländler.
//  - waxBench: the waxing bench on a canvas over the view, the walker waiting at the door.
//  - parkingMarshal: the traffic's car models (js/actor-models.js, as js/parking.js parks them) rolling up the real aisle
//    into the bays js/parking.js left free, green arrows over the free bays.
// Everything is built on demand and disposed with the run; the games run on the mission's frame time (dt).

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'running' || run.phase === 'ready';
const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };

const STYLE = `
.rs-hud{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:40;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#fff;width:min(640px,calc(100vw - 20px))}
.rs-hud[hidden],.rs-game[hidden],.rs-pad[hidden]{display:none!important}
.rs-card{background:rgba(10,12,20,.8);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:8px 12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:13px;font-variant-numeric:tabular-nums;text-align:center}
.rs-card b{font-size:18px}
.rs-pop{font:900 26px Inter,system-ui,sans-serif;color:#ffe14f;text-shadow:0 2px 14px rgba(0,0,0,.6);min-height:32px;text-align:center}
.rs-pop.bad{color:#ff6b6b}
.rs-strip{position:relative;width:100%;height:44px;border-radius:12px;background:rgba(10,12,20,.8);border:1px solid rgba(255,255,255,.18);overflow:hidden}
.rs-strip i{position:absolute;top:0;bottom:0;display:block}
.rs-strip .ok{background:rgba(120,230,120,.3)}
.rs-strip .best{background:rgba(120,240,120,.65)}
.rs-strip .bar{width:6px;margin-left:-3px;background:#fff;border-radius:3px;box-shadow:0 0 8px #fff;top:6px;bottom:6px}
.rs-btn{pointer-events:auto;border:0;border-radius:999px;padding:12px 22px;font:800 16px Inter,system-ui,sans-serif;color:#fff;background:linear-gradient(180deg,#4fb2ff,#1c76e0);box-shadow:0 6px 18px rgba(28,118,224,.4);touch-action:manipulation;user-select:none;-webkit-user-select:none}
.rs-btn:active,.rs-btn.on{filter:brightness(1.25);transform:scale(.97)}
.rs-pad{display:flex;gap:8px;justify-content:center;pointer-events:auto;flex-wrap:wrap}
.rs-pad .rs-btn{min-width:72px;min-height:52px;padding:8px 14px}
.rs-pad .rs-stop{background:linear-gradient(180deg,#ff6f61,#d6322a);box-shadow:none}
.rs-zone{display:inline-block;min-width:66px;padding:2px 6px;border-radius:8px;margin:0 3px;background:rgba(255,255,255,.12)}
.rs-zone.empty{background:rgba(255,80,80,.3)}
.rs-warn{background:#ffb300;color:#231;padding:2px 10px;border-radius:999px;font-weight:800}
.rs-game{position:fixed;inset:0;z-index:38;display:flex;align-items:flex-start;justify-content:center;padding-top:196px;box-sizing:border-box;background:rgba(14,11,8,.86);font-family:Inter,system-ui,sans-serif;color:#fff}
.rs-game-box{display:flex;flex-direction:column;gap:8px;align-items:center;max-width:calc(100vw - 16px)}
.rs-game canvas{border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.5);touch-action:none;max-width:calc(100vw - 16px);background:#222}
body.rs-busy .controls-hint,body.rs-busy .gta-prompt,body.rs-busy .touch-use,body.rs-busy .mission-prompt,body.rs-busy #touch-controls{display:none!important}
@media (max-width:640px){.rs-hud{bottom:8px}.rs-game{padding-top:calc(env(safe-area-inset-top,0px) + 168px)}}
@media (max-height:500px){.rs-game{padding-top:4px;z-index:46}.rs-game .rs-card{padding:2px 8px;font-size:11px}.rs-game .rs-card b{font-size:13px}.rs-game-box{gap:3px}.rs-hud{bottom:4px;gap:3px}.rs-hud .rs-card{padding:3px 8px;font-size:11px}.rs-hud .rs-card b{font-size:13px}.rs-pop{font-size:17px;min-height:20px}.rs-pad .rs-btn{min-height:38px;padding:3px 10px;font-size:13px}.rs-hud>.rs-btn{padding:6px 18px;font-size:14px}.rs-strip{height:26px}.rs-zone{min-width:44px}}
`;
function addStyle(run) {
  const s = el('style');
  s.textContent = STYLE;
  document.head.append(s);
  run.cleanups.push(() => s.remove());
}

// --- Geometry helpers ---------------------------------------------------------------------------------------------------
function paint(g, col) {
  g = g.index ? g.toNonIndexed() : g;
  const count = g.attributes.position.count, c = new THREE.Color(col), out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d, x, y, z, col, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y, z); return paint(g, col); };
const ball = (r, x, y, z, col, sy = 1) => { const g = new THREE.SphereGeometry(r, 8, 6); g.scale(1, sy, 1); g.translate(x, y, z); return paint(g, col); };
const litMat = () => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
const meshOf = (parts, mat) => { const m = new THREE.Mesh(mergeGeometries(parts), mat); for (const p of parts) p.dispose(); m.castShadow = true; m.receiveShadow = false; return m; };

/** Words on a board: an unlit plane */
function textPlane(text, w, h, fg, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = Math.max(32, Math.round(512 * (h / w)));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '800 72px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = fg;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * 0.94);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicNodeMaterial({ map: tex }));
}

/** The player's figure on the job: legs and body in one mesh, two arm meshes that gesture. Light: the walker is hidden */
function buildWorker(vest) {
  const group = new THREE.Group();
  const mat = litMat();
  const body = meshOf([
    box(0.16, 0.85, 0.2, -0.13, 0.43, 0, '#23304a'), box(0.16, 0.85, 0.2, 0.13, 0.43, 0, '#23304a'),
    box(0.46, 0.62, 0.26, 0, 1.15, 0, vest), box(0.47, 0.06, 0.27, 0, 1.2, 0, '#e9e9d8'), box(0.47, 0.06, 0.27, 0, 1.02, 0, '#e9e9d8'),
    ball(0.13, 0, 1.6, 0, '#e8bb96'), ball(0.14, 0, 1.66, 0, '#20262e', 0.7),
    box(0.18, 0.1, 0.3, -0.13, 0.05, 0.04, '#111'), box(0.18, 0.1, 0.3, 0.13, 0.05, 0.04, '#111')
  ], mat);
  const arm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.29, 1.42, 0);
    pivot.add(meshOf([box(0.12, 0.6, 0.13, 0, -0.3, 0, vest), box(0.11, 0.1, 0.12, 0, -0.64, 0, '#e8bb96')], mat));
    group.add(pivot);
    return pivot;
  };
  const left = arm(1), right = arm(-1); // (the figure faces +z: its left at +x)
  group.add(body);
  return { group, left, right, gest: null, gestT: 0 };
}
/** Arm poses: the rotation about the shoulder's forward axis z and side axis x */
const WORKER_POSES = {
  idle: [[0.12, 0], [-0.12, 0]],
  hand: [[0.2, -1.4], [-0.2, -1.4]],
  left: [[1.5, 0], [-0.12, 0]],
  right: [[0.12, 0], [-1.5, 0]],
  straight: [[0.25, -2.9], [-0.25, -2.9]],
  stop: [[0.2, -1.5], [2.9, 0]]
};
function poseWorker(w, dt) {
  w.gestT = Math.max(0, w.gestT - dt);
  const pose = WORKER_POSES[w.gestT > 0 && w.gest ? w.gest : 'idle'], k = Math.min(1, dt * 14);
  const wave = w.gestT > 0 && w.gest !== 'hand' && w.gest !== 'stop' ? Math.sin(w.gestT * 16) * 0.22 : 0;
  w.left.rotation.z += (pose[0][0] + wave - w.left.rotation.z) * k; w.left.rotation.x += (pose[0][1] - w.left.rotation.x) * k;
  w.right.rotation.z += (pose[1][0] - wave - w.right.rotation.z) * k; w.right.rotation.x += (pose[1][1] - w.right.rotation.x) * k;
}

/** The walker waits (the mission's own controls, camera and figure): frozen and out of sight */
function holdPlayer(run, on) {
  const cm = run.hooks.controllerManager;
  if (on) {
    if (run._rsHeld) return;
    run._rsHeld = { had: 'personDriver' in cm, prev: cm.personDriver };
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; };
    document.body.classList.add('rs-busy');
    cm.setEntityHidden?.('person', true);
  } else if (run._rsHeld) {
    const h = run._rsHeld;
    run._rsHeld = null;
    document.body.classList.remove('rs-busy');
    cm.setEntityHidden?.('person', false);
    if (h.had) cm.personDriver = h.prev ?? null; else delete cm.personDriver;
    run.hooks.cameraSystem?.resetForTeleport?.();
  }
}

/** A small sound on the city's mix (silent when off) */
function blip(run, kind = 'pock') {
  const a = run.hooks.audio;
  if (!a || !a.enabled || !a.context || a.context.state !== 'running' || !a.mix) return;
  const ctx = a.context, t = ctx.currentTime, g = ctx.createGain();
  g.connect(a.mix);
  if (kind === 'scrape' || kind === 'thud' || kind === 'hiss') {
    const n = Math.floor(ctx.sampleRate * (kind === 'hiss' ? 0.5 : 0.22)), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = kind === 'thud' ? 'lowpass' : 'highpass'; f.frequency.value = kind === 'thud' ? 500 : 3000;
    g.gain.value = kind === 'thud' ? 0.8 : 0.25;
    src.connect(f).connect(g); src.start(t);
    return;
  }
  if (kind === 'honk') {
    for (const f of [392, 494]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.28); }
    g.gain.setValueAtTime(0.09, t); g.gain.setValueAtTime(0.0001, t + 0.28);
    return;
  }
  const o = ctx.createOscillator(); o.type = kind === 'good' ? 'triangle' : 'sine';
  o.frequency.setValueAtTime(kind === 'good' ? 880 : kind === 'bad' ? 180 : 520, t);
  if (kind === 'good') o.frequency.setValueAtTime(1320, t + 0.08);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'good' ? 0.22 : 0.09));
  o.connect(g); o.start(t); o.stop(t + 0.25);
}

/** The bottom HUD: a pop line, optional nodes, a card */
function bottomHud(run, nodes = []) {
  const hud = el('div', 'rs-hud');
  hud.hidden = true;
  const pop = el('div', 'rs-pop', ''), card = el('div', 'rs-card');
  hud.append(pop, ...nodes, card);
  document.body.append(hud);
  run.cleanups.push(() => hud.remove());
  return {
    hud, card, pop,
    show(on) { hud.hidden = !on; },
    set(html) { if (card._html !== html) { card._html = html; card.innerHTML = html; } },
    flash(text, bad = false) {
      pop.textContent = text; pop.className = `rs-pop${bad ? ' bad' : ''}`;
      clearTimeout(pop._t); pop._t = setTimeout(() => { pop.textContent = ''; }, 1400);
    }
  };
}

// =====================================================================================================================
// The Ländler: synthesised on the audio system's context, a bar at a time, the level following the distance to the hut
// =====================================================================================================================
class Laendler {
  constructor(run) { this.run = run; this.bus = null; this.next = 0; this.bar = 0; this.level = 0; this.notes = 0; }

  get ctx() { const a = this.run.hooks.audio; return a && a.enabled && a.context && a.context.state === 'running' && a.mix ? a.context : null; }

  ensure(ctx) {
    if (this.bus) return;
    const a = this.run.hooks.audio;
    const out = ctx.createGain(); out.gain.value = 0;
    // the hut's little radio: the top and the bottom cut, a slap back off its wall
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const slap = ctx.createDelay(0.3); slap.delayTime.value = 0.085;
    const slapGain = ctx.createGain(); slapGain.gain.value = 0.16;
    const bus = ctx.createGain();
    bus.connect(hp).connect(lp).connect(out);
    lp.connect(slap).connect(slapGain).connect(out);
    out.connect(a.mix);
    // the accordion's bellows: its reeds beat, its level breathes a little
    const box = ctx.createGain(); box.gain.value = 0.9;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.4;
    const depth = ctx.createGain(); depth.gain.value = 0.09;
    lfo.connect(depth).connect(box.gain);
    const boxLp = ctx.createBiquadFilter(); boxLp.type = 'lowpass'; boxLp.frequency.value = 2600;
    box.connect(boxLp).connect(bus);
    // the clarinet: hollow, odd harmonics
    const clar = ctx.createBiquadFilter(); clar.type = 'lowpass'; clar.frequency.value = 1500; clar.Q.value = 0.8;
    const clarGain = ctx.createGain(); clarGain.gain.value = 0.8;
    clar.connect(clarGain).connect(bus);
    lfo.start();
    this.bus = bus; this.out = out; this.box = box; this.clar = clar; this.lfo = lfo;
    this.next = ctx.currentTime + 0.1;
    this.bar = 0;
  }

  voice(ctx, dest, type, hz, at, dur, level, detune = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.012);
    g.gain.setValueAtTime(level, at + Math.max(0.02, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at); o.stop(at + dur + 0.02);
    this.notes++;
  }

  scheduleBar(ctx, bar, at) {
    const beat = 60 / LAENDLER_TEMPO;
    // oom-pah-pah
    this.voice(ctx, this.bus, 'triangle', midiHz(bar.bass), at, beat * 0.85, 0.26);
    this.voice(ctx, this.bus, 'sine', midiHz(bar.bass), at, beat * 0.85, 0.16);
    for (const b of [1, 2]) {
      for (const pc of bar.tones.slice(0, 3)) {
        // the chord in the octave over middle C's lower neighbour: G3-F#4
        const m = 55 + ((pc - 55 % 12 + 12) % 12);
        this.voice(ctx, this.box, 'sawtooth', midiHz(m), at + b * beat, beat * 0.42, 0.06);
      }
    }
    // the tune: two reeds a few cents apart, the Örgeli's beating; the clarinet a third below on the repeats
    let t = at;
    for (const n of bar.notes) {
      const dur = n.beats * beat;
      if (n.midi != null) {
        this.voice(ctx, this.box, 'sawtooth', midiHz(n.midi), t, dur * 0.92, 0.1, -7);
        this.voice(ctx, this.box, 'sawtooth', midiHz(n.midi), t, dur * 0.92, 0.1, 7);
        if (bar.clarinet) this.voice(ctx, this.clar, 'square', midiHz(thirdBelow(n.midi)), t, dur * 0.95, 0.1);
      }
      t += dur;
    }
  }

  /** Each frame: keeps the next bar scheduled, the level at `level` (0-1) */
  update(level) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.ensure(ctx);
    this.out.gain.setTargetAtTime(0.4 * level, ctx.currentTime, 0.25);
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05; // (the page was away)
    while (this.next < ctx.currentTime + 0.35) {
      this.scheduleBar(ctx, LAENDLER[this.bar % LAENDLER.length], this.next);
      this.next += (3 * 60) / LAENDLER_TEMPO;
      this.bar++;
    }
  }

  stop() {
    if (!this.bus) return;
    const a = this.run.hooks.audio, ctx = a?.context, out = this.out, lfo = this.lfo;
    this.bus = null;
    try { out.gain.setTargetAtTime(0, ctx.currentTime, 0.2); } catch { /* gone */ }
    setTimeout(() => { try { lfo.stop(); out.disconnect(); } catch { /* gone */ } }, 1500);
  }
}

// =====================================================================================================================
// 1. The T-bar attendant
// =====================================================================================================================
const SUITS = ['#d6322a', '#1c76e0', '#f0a020', '#2aa66a', '#8a3fc7', '#f2f2f2', '#14213d', '#e86aa6', '#00a3a3', '#b4531f'];
const MAX_SKIERS = 72, MAX_RODS = 18;

function skierGeometries() {
  const suit = mergeGeometries([
    box(0.13, 0.48, 0.16, -0.12, 0.42, 0.02, '#fff', -0.25), box(0.13, 0.48, 0.16, 0.12, 0.42, 0.02, '#fff', -0.25),
    box(0.38, 0.56, 0.24, 0, 1.0, -0.02, '#fff', 0.12), box(0.1, 0.5, 0.11, -0.25, 1.02, 0.06, '#fff', -0.5), box(0.1, 0.5, 0.11, 0.25, 1.02, 0.06, '#fff', -0.5)
  ]);
  const gear = mergeGeometries([
    ball(0.115, 0, 1.42, 0.02, '#e8bb96'), ball(0.13, 0, 1.47, 0.0, '#22262c', 0.82), box(0.17, 0.05, 0.03, 0, 1.43, 0.12, '#f4c430'),
    box(0.09, 0.03, 1.7, -0.12, 0.03, 0.1, '#20242c'), box(0.09, 0.03, 1.7, 0.12, 0.03, 0.1, '#20242c'),
    box(0.15, 0.2, 0.28, -0.12, 0.14, 0.02, '#333'), box(0.15, 0.2, 0.28, 0.12, 0.14, 0.02, '#333'),
    box(0.02, 1.05, 0.02, -0.32, 0.56, 0.12, '#999', 0.28), box(0.02, 1.05, 0.02, 0.32, 0.56, 0.12, '#999', 0.28)
  ]);
  return { suit, gear };
}

function buildHut() {
  const mat = litMat();
  const hut = meshOf([
    box(3.6, 2.5, 3, 0, 1.25, 0, '#7a4f2a'), box(3.9, 0.12, 3.5, -0.0, 2.72, 0.55, '#3a2615', 0.42), box(3.9, 0.12, 3.5, -0.0, 2.72, -0.55, '#3a2615', -0.42),
    box(1.6, 0.8, 0.06, 0.4, 1.28, 1.52, '#a9d2e8'), box(0.9, 2, 0.06, -1.1, 1, 1.52, '#3e2a18'),
    box(0.5, 0.34, 0.22, 0.9, 0.9, 1.62, '#222'), // the radio on the sill
    box(0.1, 3.4, 0.1, 2.1, 1.7, 1.2, '#b5b5b5'), box(0.5, 0.4, 0.3, 2.1, 3.4, 1.2, '#d0d0d0')
  ], mat);
  const sign = textPlane('Hauptertäli', 2.6, 0.5, '#fff', '#1c5d99');
  sign.position.set(0, 2.02, 1.56);
  sign.scale.setScalar(0.8);
  hut.add(sign);
  return hut;
}

const TBAR_FEATURE = {
  // (js/missions.js hides the game's own controls while this is true: at the loading point; the walk there keeps them)
  ownControls: (run) => !!run.tb?.open,
  setup(run) {
    addStyle(run);
    const strip = el('div', 'rs-strip');
    const ok = el('i', 'ok'), best = el('i', 'best');
    const span = 3; // s shown either side of the mark… the mark at 25 %
    const X = (s) => 25 + (s / span) * 75;
    ok.style.left = `${X(-TBAR.window)}%`; ok.style.width = `${X(TBAR.window) - X(-TBAR.window)}%`;
    best.style.left = `${X(-TBAR.perfect)}%`; best.style.width = `${X(TBAR.perfect) - X(-TBAR.perfect)}%`;
    strip.append(ok, best);
    const bars = [el('i', 'bar'), el('i', 'bar')];
    strip.append(...bars);
    const hand = el('button', 'rs-btn', 'Hand over!');
    hand.type = 'button';
    const hud = bottomHud(run, [strip, hand]);
    run.listen(hand, 'pointerdown', (e) => { e.preventDefault(); TBAR_FEATURE.press(run); });
    const canvas = document.getElementById('canvas-container');
    run.listen(canvas, 'pointerdown', () => { if (run.tb.open) TBAR_FEATURE.press(run); });

    const { suit, gear } = skierGeometries();
    const suitMesh = new THREE.InstancedMesh(suit, litMat(), MAX_SKIERS), gearMesh = new THREE.InstancedMesh(gear, litMat(), MAX_SKIERS);
    const rodMesh = new THREE.InstancedMesh(mergeGeometries([box(0.05, 1, 0.05, 0, -0.5, 0, '#55585c'), box(1, 0.06, 0.06, 0, -1, 0, '#2b2d30')]), litMat(), MAX_RODS);
    const c = new THREE.Color();
    for (let i = 0; i < MAX_SKIERS; i++) suitMesh.setColorAt(i, c.set(SUITS[i % SUITS.length]));
    for (const m of [suitMesh, gearMesh, rodMesh]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; run.group.add(run.storage(m)); }

    const hut = buildHut();
    hut.position.set(TBAR.hut.x, 0, TBAR.hut.z);
    hut.rotation.y = Math.atan2(TBAR.right.x, TBAR.right.z); // (its front to the lane)
    run.group.add(hut);
    const worker = buildWorker('#ee6c1e');
    worker.group.visible = false;
    run.group.add(worker.group);
    run.tb = { hud, strip, bars, span, X, suitMesh, gearMesh, rodMesh, hut, worker, open: false, music: new Laendler(run), control: null, base: null, t0: 0, kick: null, kickT: 0, particles: null, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ'), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), probe: {}, camK: 0 };
    const pb = new ParticleBatch(run.scene);
    run.storage(pb.mesh);
    run.tb.particles = pb;
    run.cleanups.push(() => pb.dispose());
  },
  placeWorld(run) {
    const tb = run.tb;
    tb.hut.position.y = groundHeight(TBAR.hut.x, TBAR.hut.z) - 0.1;
    tb.worker.group.position.set(TBAR.spot.x, groundHeight(TBAR.spot.x, TBAR.spot.z), TBAR.spot.z);
    tb.worker.group.rotation.y = Math.atan2(-TBAR.right.x, -TBAR.right.z);
  },
  reset(run) {
    const tb = run.tb;
    TBAR_FEATURE.release(run);
    tb.open = false; tb.hud.show(false); tb.worker.group.visible = false;
    tb.suitMesh.count = tb.gearMesh.count = tb.rodMesh.count = 0;
    run.state.game = null;
    holdPlayer(run, false);
    TBAR_FEATURE.placeWorld(run);
  },
  /** The lift back to its own clock */
  release(run) {
    const tb = run.tb, c = tb.control;
    if (c) { c.clock.speed = tb.base; c.clock.kick = null; }
    tb.control = null;
  },
  teardown(run) {
    TBAR_FEATURE.release(run);
    run.tb.music.stop();
    holdPlayer(run, false);
  },
  open(run) {
    const tb = run.tb;
    tb.open = true;
    run.state.game = createTbarGame(11);
    holdPlayer(run, true);
    tb.worker.group.visible = true;
    tb.hud.show(true);
    // the game takes over the real lift: the clock so that bar `count - 1` is firstGap short of the loading point (the
    // bars after it come round spacing by spacing)
    const c = LIFT_CONTROLS.get(TBAR_LIFT_ID);
    if (c) {
      tb.control = c; tb.base = c.clock.speed;
      c.clock.speed = 0;
      tb.t0 = ((TBAR.loadS - TBAR.firstGap - (c.count - 1) * c.spacing) % c.loopLen + c.loopLen) % c.loopLen;
    }
  },
  press(run) {
    const g = run.state.game;
    if (!g || run.phase !== 'running' || g.done) return;
    tbarHandOver(g);
    run.tb.worker.gest = 'hand'; run.tb.worker.gestT = 0.35;
  },
  key(run, e) {
    if (!run.tb.open) return;
    if (['Space', 'Enter', 'KeyJ', 'KeyF'].includes(e.code) && run.phase !== 'intro') { swallow(e); if (!e.repeat) TBAR_FEATURE.press(run); }
  },
  events(run, g) {
    const tb = run.tb, H = tb.hud;
    for (const e of g.events) {
      if (e.kind === 'perfect') { H.flash('Perfect! +2'); blip(run, 'good'); }
      else if (e.kind === 'good') { H.flash('Up they go +2'); blip(run, 'pock'); }
      else if (e.kind === 'knock') {
        H.flash(e.early ? 'Too early: whoops, down he goes!' : 'Too late: the bar got him!', true);
        blip(run, 'thud');
        const y = groundHeight(TBAR.load.x, TBAR.load.z);
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * 6.28;
          tb.particles.spawn({ x: TBAR.load.x, y: y + 0.3, z: TBAR.load.z, vx: Math.cos(a) * 1.8, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * 1.8, gravity: 6, life: 0.9, size0: 0.25, size1: 0.8, alpha: 0.9, r: 1, g: 1, b: 1, kind: 'smoke' });
        }
      } else if (e.kind === 'empty') { H.flash('Empty bar!', true); blip(run, 'bad'); } else if (e.kind === 'nobody') { H.flash('Nobody in place yet', true); }
      if (e.kind === 'knock' || e.kind === 'empty') { tb.kick = e.bar; tb.kickT = 2.4; }
    }
    g.events.length = 0;
  },
  update(run, ctx, dt) {
    const tb = run.tb;
    // the radio plays from the moment the player is near
    if (run.phase !== 'done') tb.music.update(laendlerLevel(Math.hypot(ctx.x - TBAR.hut.x, ctx.z - TBAR.hut.z)));
    if (!tb.open && run.def.objectives[run.index]?.id === 'operate' && live(run)) TBAR_FEATURE.open(run);
    const g = run.state.game;
    if (!g || run.phase !== 'running') return;
    tbarStep(g, Math.min(dt, 0.1));
    TBAR_FEATURE.events(run, g);
  },
  after(run, ctx, dt) {
    const tb = run.tb, g = run.state.game;
    if (run.phase === 'done') { tb.music.stop(); tb.hud.show(false); }
    poseWorker(tb.worker, dt);
    tb.particles.update(dt, ctx.camera);
    if (!tb.open || !g) return;
    const c = tb.control, { m, q, e, p, s, probe } = tb;
    if (c) {
      c.clock.t = (tb.t0 + g.s) % c.loopLen;
      tb.kickT = Math.max(0, tb.kickT - dt);
      if (tb.kickT > 0) {
        // the bar nobody took swings wildly, dying away
        c.clock.kick = { index: c.count - 1 - tb.kick, value: Math.sin(tb.kickT * 9) * 0.5 * (tb.kickT / 2.4) };
      } else c.clock.kick = null;
    }
    // --- the skiers ---
    const yaw = TBAR.heading, D = TBAR.dir, R = TBAR.right;
    let n = 0, rods = 0;
    const put = (x, z, h, sideOff, pitch, id, scale = 1, roll = 0) => {
      if (n >= MAX_SKIERS) return;
      const px = x + R.x * sideOff, pz = z + R.z * sideOff;
      e.set(pitch, h, roll);
      q.setFromEuler(e);
      s.setScalar(scale);
      m.compose(p.set(px, groundHeight(px, pz) + 0.04, pz), q, s);
      tb.suitMesh.setMatrixAt(n, m); tb.gearMesh.setMatrixAt(n, m);
      tb.suitMesh.setColorAt(n, _col.set(SUITS[(id * 7 + (sideOff > 0 ? 3 : 0)) % SUITS.length]));
      n++;
    };
    const scaleOf = (kind) => (kind === 'kids' ? 0.68 : 1);
    // the lane: pairs behind the loading point
    g.queue.forEach((pair) => {
      const x = TBAR.load.x - D.x * pair.pos, z = TBAR.load.z - D.z * pair.pos;
      const wob = Math.sin(g.t * 3 + pair.id) * 0.02;
      put(x, z, yaw + wob, -0.48, 0, pair.id, scaleOf(pair.kind));
      put(x, z, yaw - wob, 0.48, 0, pair.id, scaleOf(pair.kind));
    });
    // on the way up: under their bar
    for (const a of g.sent) {
      const on = g.s - a.s0;
      if (on < 0 || on > 420) continue;
      const q2 = c ? c.place(TBAR.loadS + on, probe) : null;
      const x = q2 ? q2.x : TBAR.load.x + D.x * on, z = q2 ? q2.z : TBAR.load.z + D.z * on;
      const h = q2 ? Math.atan2(q2.dx, q2.dz) : yaw;
      put(x, z, h, -0.44, -0.12, a.id, scaleOf(a.kind));
      put(x, z, h, 0.44, -0.12, a.id, scaleOf(a.kind));
      if (q2 && rods < MAX_RODS) {
        // the spring line from the bar on the rope down to the hips, the T across the seat
        const top = q2.y - 3, hip = groundHeight(x, z) + 0.92 * scaleOf(a.kind);
        e.set(0, h, 0); q.setFromEuler(e);
        s.set(1, Math.max(0.1, top - hip), 1);
        m.compose(p.set(x, top, z), q, s);
        tb.rodMesh.setMatrixAt(rods++, m);
      }
    }
    // down in the snow: skis in the air
    for (const f of g.fallen) {
      const k = clamp(f.t / 0.35, 0, 1), away = 0.9 + f.t * 0.4;
      const x = TBAR.load.x + R.x * away, z = TBAR.load.z + R.z * away;
      put(x, z, yaw + 0.5, -0.5, -1.45 * k, f.id, scaleOf(f.kind), 0.3 * Math.sin(f.t * 9) * (1 - k * 0.5));
      put(x - D.x * 0.8, z - D.z * 0.8, yaw - 0.4, 0.5, -1.45 * k, f.id, scaleOf(f.kind), -0.2);
    }
    tb.suitMesh.count = tb.gearMesh.count = n;
    tb.rodMesh.count = rods;
    for (const im of [tb.suitMesh, tb.gearMesh, tb.rodMesh]) { im.instanceMatrix.needsUpdate = true; }
    if (tb.suitMesh.instanceColor) tb.suitMesh.instanceColor.needsUpdate = true;
    // --- the attendant's view: over the shoulder across the loading point, the lane to one side, the bars coming ---
    const cam = ctx.camera, gy = groundHeight(TBAR.spot.x, TBAR.spot.z);
    cam.position.set(TBAR.spot.x + R.x * 5.6 + D.x * 0.5, gy + 3.2, TBAR.spot.z + R.z * 5.6 + D.z * 0.5);
    cam.up.set(0, 1, 0);
    cam.lookAt(TBAR.load.x - D.x * 3.5 - R.x * 0.5, groundHeight(TBAR.load.x, TBAR.load.z) + 1.55, TBAR.load.z - D.z * 3.5 - R.z * 0.5);
    cam.updateMatrixWorld();
    // --- the HUD ---
    const to = tbarTimeTo(g);
    tb.bars.forEach((b, i) => {
      const inS = i === 0 ? to : to + TBAR.spacing / tbarSpeed(g.t);
      const pct = tb.X(inS);
      b.hidden = pct > 100 || pct < 0 || (i === 0 && g.handled);
      b.style.left = `${pct}%`;
    });
    const ready = tbarFrontReady(g);
    tb.hud.set(`<b>${g.skiers}</b> ${g.skiers === 1 ? 'skier' : 'skiers'} up · ${Math.max(0, Math.ceil(TBAR.length - g.t))} s · rope ${tbarSpeed(g.t).toFixed(1)} m/s${ready ? ' · next pair ready' : ' · moving up …'}${g.queue[0]?.kind === 'kids' ? ' · kids: careful!' : ''}`);
  }
};
const _col = new THREE.Color();

// =====================================================================================================================
// 2. The waxing bench
// =====================================================================================================================
const WW = 640, WH = 430;
const SKI_X0 = 48, SKI_X1 = 592, SKI_Y = [190, 262], SKI_H = 34, SWATCH_Y = 356;
const canvasPoint = (canvas, e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * WW, y: ((e.clientY - r.top) / r.height) * WH }; };
const swatchRect = (i) => ({ x: 34 + i * 118, y: SWATCH_Y, w: 102, h: 56 });

const WAX_FEATURE = {
  // (js/missions.js hides the game's own controls while this is true: at the wax bench; the walk to the shop keeps them)
  ownControls: (run) => !!run.wx?.open,
  setup(run) {
    addStyle(run);
    const game = el('div', 'rs-game');
    game.hidden = true;
    const box_ = el('div', 'rs-game-box');
    const canvas = el('canvas');
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(WW * dpr); canvas.height = Math.round(WH * dpr);
    const roomH = (globalThis.innerHeight || WH) - ((globalThis.innerHeight || WH) <= 500 ? 36 : 280); // (a phone on its side: the bench takes the whole height)
    canvas.style.width = `${Math.max(240, Math.min(WW, (globalThis.innerWidth || WW) - 20, roomH * (WW / WH)))}px`;
    canvas.style.aspectRatio = `${WW} / ${WH}`;
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    const info = el('div', 'rs-card', '');
    box_.append(info, canvas);
    game.append(box_);
    document.body.append(game);
    run.cleanups.push(() => game.remove());
    run.wx = { game, canvas, c, info, open: false, finger: null, keys: { left: false, right: false }, pop: null };
    run.listen(canvas, 'pointerdown', (e) => {
      e.preventDefault();
      const p = canvasPoint(canvas, e), b = run.state.bench;
      if (!b || run.phase !== 'running') return;
      if (b.pair.stage === 'wax') {
        WAXES.forEach((w, i) => { const r = swatchRect(i); if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) WAX_FEATURE.pick(run, w.id); });
        return;
      }
      canvas.setPointerCapture?.(e.pointerId);
      run.wx.finger = clamp((p.x - SKI_X0) / (SKI_X1 - SKI_X0), 0, 1);
    });
    run.listen(canvas, 'pointermove', (e) => { if (run.wx.finger != null) { const p = canvasPoint(canvas, e); run.wx.finger = clamp((p.x - SKI_X0) / (SKI_X1 - SKI_X0), 0, 1); } });
    for (const ev of ['pointerup', 'pointercancel']) run.listen(canvas, ev, () => { run.wx.finger = null; });
    run.listen(window, 'keyup', (e) => {
      if (e.code === 'ArrowRight' || e.code === 'KeyD') run.wx.keys.right = false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') run.wx.keys.left = false;
    }, { capture: true });
  },
  reset(run) {
    const wx = run.wx;
    wx.open = false; wx.game.hidden = true; wx.finger = null; wx.keys.left = wx.keys.right = false; wx.pop = null;
    run.state.bench = null;
    holdPlayer(run, false);
  },
  teardown(run) { run.wx.game.hidden = true; holdPlayer(run, false); },
  pick(run, id) {
    const b = run.state.bench;
    if (b && waxPick(b, id)) blip(run, 'pock');
  },
  key(run, e) {
    const wx = run.wx;
    if (!wx.open || run.phase === 'intro') return;
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 }[e.code];
    if (n !== undefined) { swallow(e); if (!e.repeat && run.phase === 'running') WAX_FEATURE.pick(run, WAXES[n].id); return; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { swallow(e); wx.keys.right = true; }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { swallow(e); wx.keys.left = true; }
  },
  update(run, ctx, dt) {
    const wx = run.wx;
    if (!wx.open && run.def.objectives[run.index]?.id === 'bench' && live(run)) {
      wx.open = true; wx.game.hidden = false; run.state.bench = createWaxBench(5);
      holdPlayer(run, true);
    }
    const b = run.state.bench;
    if (!wx.open || !b || run.phase !== 'running') return;
    const push = (wx.keys.right ? 1 : 0) - (wx.keys.left ? 1 : 0);
    waxStep(b, { u: wx.finger, push }, Math.min(dt, 0.05));
    for (const e of b.events) {
      if (e.kind === 'burn') blip(run, 'hiss');
      else if (e.kind === 'scrape' || e.kind === 'brush') blip(run, 'scrape');
      else if (e.kind === 'pair') { wx.pop = { text: `${b.last.customer}: ${b.last.points} pts`, good: e.points >= 70, t: 1.8 }; blip(run, e.points >= 70 ? 'good' : 'bad'); } else if (e.kind === 'wax-wrong') wx.pop = { text: `${e.off === 1 ? 'Close, but' : 'Wrong:'} ${waxFor(b.pair.temp).name} was the wax`, good: false, t: 1.6 };
    }
    b.events.length = 0;
    if (wx.pop) { wx.pop.t -= dt; if (wx.pop.t <= 0) wx.pop = null; }
  },
  after(run) {
    const wx = run.wx, b = run.state.bench;
    if (run.phase === 'done' && wx.open) { wx.open = false; wx.game.hidden = true; holdPlayer(run, false); }
    if (!wx.open || !b) return;
    drawBench(wx.c, wx, b);
    const left = Math.max(0, Math.ceil(WAX.length - b.t));
    const stage = { wax: 'read the board, pick the wax (1-5 or tap)', iron: 'drag the iron, or hold → and keep it in the band', scrape: 'scrape, tip to tail: drag, or hold →', brush: 'brush, tip to tail: drag, or hold →' }[b.pair.stage] || '';
    const html = `<b>${b.score}</b> pts · ${b.pairs.length} pairs · ${left} s · ${stage}`;
    if (wx.info._html !== html) { wx.info._html = html; wx.info.innerHTML = html; }
  }
};

function drawSki(c, y, cells, p, active, wax) {
  const w = SKI_X1 - SKI_X0, cw = w / cells.length, waxCol = wax ? WAXES.find((v) => v.id === wax)?.colour : null;
  // the base: black P-tex, a tip that bends up
  c.fillStyle = '#17191d';
  c.beginPath();
  c.moveTo(SKI_X0, y + SKI_H / 2); c.quadraticCurveTo(SKI_X0 + 4, y, SKI_X0 + 30, y); c.lineTo(SKI_X1, y); c.lineTo(SKI_X1, y + SKI_H); c.lineTo(SKI_X0 + 30, y + SKI_H); c.quadraticCurveTo(SKI_X0 + 4, y + SKI_H, SKI_X0, y + SKI_H / 2);
  c.fill();
  cells.forEach((cell, i) => {
    const x = SKI_X0 + i * cw;
    if (cell.burnt) { c.fillStyle = '#5a2c0e'; c.fillRect(x, y + 2, cw + 0.5, SKI_H - 4); c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(x + 4, y + 6, cw - 8, SKI_H - 12); }
    else if (cell.melted && waxCol) {
      c.fillStyle = waxCol; c.globalAlpha = p.stage === 'iron' ? 0.95 : p.stage === 'scrape' ? 0.25 + 0.7 * p.excess : 0.25;
      c.fillRect(x, y + 3, cw + 0.5, SKI_H - 6); c.globalAlpha = 1;
    } else if (waxCol && cell.heat > 0.3) { c.fillStyle = waxCol; c.globalAlpha = 0.25 + clamp(cell.heat, 0, 1) * 0.4; c.fillRect(x, y + 6, cw + 0.5, SKI_H - 12); c.globalAlpha = 1; }
  });
  if (p.stage === 'brush' && p.shine > 0) { c.fillStyle = `rgba(255,255,255,${p.shine * 0.25})`; c.fillRect(SKI_X0 + 12, y + 3, w - 12, SKI_H - 6); }
  c.fillStyle = active ? '#ffe14f' : 'rgba(255,255,255,.4)'; c.font = '700 11px Inter, sans-serif'; c.textAlign = 'left';
  c.fillText('tip', SKI_X0 - 28, y + SKI_H / 2 + 4);
}

function drawBench(c, wx, b) {
  const p = b.pair;
  // the workshop: pegboard behind, the bench
  c.fillStyle = '#3c3a38'; c.fillRect(0, 0, WW, WH);
  c.fillStyle = '#4a4744'; for (let x = 12; x < WW; x += 24) for (let y = 12; y < 164; y += 24) { c.beginPath(); c.arc(x, y, 1.6, 0, 6.3); c.fill(); }
  const wood = c.createLinearGradient(0, 168, 0, WH); wood.addColorStop(0, '#8d6238'); wood.addColorStop(1, '#5e3f22');
  c.fillStyle = wood; c.fillRect(0, 168, WW, WH - 168);
  // the board: the snow's temperature
  c.fillStyle = '#10261b'; c.beginPath(); c.roundRect(20, 14, 208, 136, 10); c.fill();
  c.strokeStyle = '#7a5a34'; c.lineWidth = 5; c.stroke();
  c.fillStyle = '#d9efe2'; c.textAlign = 'center'; c.font = '700 13px Inter, sans-serif'; c.fillText(`Loipe ${p.loipe}`, 124, 40);
  c.fillText(t('snow temperature'), 124, 60);
  c.font = '900 56px Inter, sans-serif'; c.fillStyle = '#fff'; c.fillText(`${p.temp > 0 ? '+' : p.temp < 0 ? '−' : ''}${Math.abs(p.temp)}°`, 124, 120);
  // the wax chart on the wall
  WAXES.forEach((w, i) => {
    const y = 18 + i * 27;
    c.fillStyle = w.colour; c.beginPath(); c.roundRect(244, y, 36, 22, 5); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '700 13px Inter, sans-serif';
    c.fillText(`${t(w.name)}  ${i === 0 ? `${t('above')} ${w.to}°` : i === WAXES.length - 1 ? `${t('below')} ${w.from}°` : `${w.from}° ${t('to')} ${w.to}°`}`, 288, y + 16);
  });
  // the customer
  c.fillStyle = '#ffe9b0'; c.textAlign = 'right'; c.font = '800 15px Inter, sans-serif'; c.fillText(p.customer, WW - 20, 40);
  c.font = '600 12px Inter, sans-serif'; c.fillStyle = 'rgba(255,255,255,.8)'; c.fillText(`${t('pair no.')} ${p.id}`, WW - 20, 58);
  const stage = ['wax', 'iron', 'scrape', 'brush'];
  stage.forEach((s, i) => {
    const on = s === p.stage, done = stage.indexOf(p.stage) > i;
    c.fillStyle = on ? '#ffe14f' : done ? '#7dffb0' : 'rgba(255,255,255,.35)';
    c.fillText(t(s[0].toUpperCase() + s.slice(1)), WW - 20, 84 + i * 18);
  });
  // the skis
  p.skis.forEach((cells, i) => drawSki(c, SKI_Y[i], cells, p, p.stage === 'iron' ? p.ski === i : true, p.wax));
  const toolX = SKI_X0 + p.u * (SKI_X1 - SKI_X0);
  if (p.stage === 'iron') {
    // the iron on the ski in hand
    const y = SKI_Y[p.ski] + SKI_H / 2;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(toolX - 36, y - 18, 78, 42, 12); c.fill();
    const heat = ironHeat(b.t);
    c.fillStyle = heat > 1.1 ? '#d84a2a' : '#c9ccd1'; c.beginPath(); c.roundRect(toolX - 40, y - 22, 80, 44, 10); c.fill();
    c.fillStyle = '#26282c'; c.beginPath(); c.roundRect(toolX - 26, y - 8, 52, 16, 6); c.fill();
    // the pace: the band that melts and does not burn, the iron's speed on it
    const [lo, hi] = ironBand(heat), S = (v) => 150 + clamp(v / 0.9, 0, 1) * 340;
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.roundRect(140, 366, 360, 26, 8); c.fill();
    c.fillStyle = 'rgba(255,90,60,.8)'; c.fillRect(150, 372, S(lo) - 150, 14);
    c.fillStyle = 'rgba(120,235,120,.9)'; c.fillRect(S(lo), 372, S(hi) - S(lo), 14);
    c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(S(hi), 372, 490 - S(hi), 14);
    c.fillStyle = '#fff'; c.fillRect(S(Math.abs(p.v)) - 2, 368, 4, 22);
    c.font = '700 12px Inter, sans-serif'; c.textAlign = 'center';
    c.fillText(t('too slow: burns'), 212, 408); c.fillText(t('even'), (S(lo) + S(hi)) / 2, 408); c.fillText(t('too fast: no melt'), 440, 408);
    c.textAlign = 'left'; c.fillText(`${t('iron')} ${Math.round(110 + (heat - 0.85) * 120)}°`, 20, 384);
    const pct = Math.round((skiMelted(p.skis[p.ski])) * 100);
    c.fillText(`${t('ski')} ${p.ski + 1}/2 · ${pct}%`, 512, 384);
  } else if (p.stage === 'scrape' || p.stage === 'brush') {
    const yTop = SKI_Y[0] - 16, yBot = SKI_Y[1] + SKI_H + 16;
    if (p.stage === 'scrape') { c.fillStyle = 'rgba(180,220,255,.85)'; c.beginPath(); c.roundRect(toolX - 9, yTop, 18, yBot - yTop, 4); c.fill(); }
    else {
      c.fillStyle = '#7a4c28'; c.beginPath(); c.roundRect(toolX - 16, yTop, 32, yBot - yTop, 6); c.fill();
      c.fillStyle = 'rgba(240,220,180,.9)'; for (let y = yTop + 4; y < yBot - 4; y += 7) c.fillRect(toolX - 12, y, 24, 2);
    }
    c.fillStyle = '#fff'; c.font = '700 14px Inter, sans-serif'; c.textAlign = 'center';
    const n = p.stage === 'scrape' ? `${Math.round((1 - p.excess) * 100)}% of the wax off` : `${Math.round(p.shine * 100)}% brushed`;
    c.fillText(`${t(p.stage === 'scrape' ? 'Scrape' : 'Brush')} ${t('tip → tail')} · ${n}`, WW / 2, 390);
    c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(SKI_X0, 402, SKI_X1 - SKI_X0, 6);
    c.fillStyle = '#7dffb0'; c.fillRect(SKI_X0, 402, (SKI_X1 - SKI_X0) * clamp(p.pass, 0, 1), 6);
  } else {
    // the waxes: five bars to pick from
    WAXES.forEach((w, i) => {
      const r = swatchRect(i);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(r.x + 3, r.y + 4, r.w, r.h, 9); c.fill();
      c.fillStyle = w.colour; c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, 9); c.fill();
      c.fillStyle = i === 0 ? '#222' : '#fff'; c.font = '800 15px Inter, sans-serif'; c.textAlign = 'center';
      c.fillText(`${i + 1} ${t(w.name)}`, r.x + r.w / 2, r.y + 34);
    });
    c.fillStyle = '#fff'; c.font = '700 14px Inter, sans-serif'; c.textAlign = 'center';
    c.fillText(t('Which wax for this snow?'), WW / 2, 342);
  }
  if (wx.pop) {
    c.font = '900 24px Inter, sans-serif'; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.65)'; c.strokeText(wx.pop.text, WW / 2, 178);
    c.fillStyle = wx.pop.good ? '#ffe14f' : '#ff8a7a'; c.fillText(t(wx.pop.text), WW / 2, 178);
  }
}

// =====================================================================================================================
// 3. The parking marshal
// =====================================================================================================================
const MAX_CARS = 34, MAX_ARROWS = 40;
const CAR_COLOURS = [0x16191e, 0xf0f3f7, 0xbec6cf, 0x52575e, 0x1d3b6c, 0x6e1f24, 0x28382e, 0x8a8f96, 0xb5121b, 0x0f5d8c];
const ZONE_COLOUR = { left: '#39d0ff', straight: '#7dff7d', right: '#ffb347' };

function carMesh(kind, run) {
  const geo = buildCarGeometry(BODY_SPECS[kind], true);
  geo.setAttribute('paintColor', new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARS * 3), 3));
  geo.setAttribute('carState', new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARS * 4), 4));
  const mesh = new THREE.InstancedMesh(geo, createLoftedCarMaterial(BODY_SPECS[kind]), MAX_CARS);
  mesh.count = 0;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  run.group.add(run.storage(mesh));
  return mesh;
}

const MARSHAL_FEATURE = {
  // (js/missions.js hides the game's own controls while this is true: directing the cars (the arrows are the signals); the walk there keeps them)
  ownControls: (run) => !!run.pm?.open,
  setup(run) {
    addStyle(run);
    const pad = el('div', 'rs-pad');
    const btns = [['left', '← Left'], ['straight', '↑ Straight'], ['right', 'Right →'], ['stop', 'Stop']].map(([id, label]) => {
      const b = el('button', `rs-btn${id === 'stop' ? ' rs-stop' : ''}`, label);
      b.type = 'button';
      run.listen(b, 'pointerdown', (e) => { e.preventDefault(); MARSHAL_FEATURE.gesture(run, id); });
      pad.append(b);
      return b;
    });
    void btns;
    const hud = bottomHud(run, [pad]);
    // the green arrows over the free bays
    const arrowGeo = paint(new THREE.ConeGeometry(0.42, 0.9, 4).rotateX(Math.PI), '#ffffff');
    const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicNodeMaterial({ vertexColors: true }), MAX_ARROWS);
    arrows.count = 0; arrows.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < MAX_ARROWS; i++) arrows.setColorAt(i, c.set('#ffffff'));
    run.group.add(run.storage(arrows));
    // the pointer over the car in hand
    const tag = new THREE.Mesh(paint(new THREE.ConeGeometry(0.5, 1.0, 4).rotateX(Math.PI), '#ffe14f'), new THREE.MeshBasicNodeMaterial({ vertexColors: true }));
    tag.visible = false;
    run.group.add(tag);
    // the skiers crossing at the marshal's feet: two instanced meshes as at the lift
    const { suit, gear } = skierGeometries();
    const suitMesh = new THREE.InstancedMesh(suit, litMat(), 6), gearMesh = new THREE.InstancedMesh(gear, litMat(), 6);
    for (let i = 0; i < 6; i++) suitMesh.setColorAt(i, c.set(SUITS[(i * 3 + 1) % SUITS.length]));
    for (const m of [suitMesh, gearMesh]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; run.group.add(run.storage(m)); }
    const worker = buildWorker('#f4e21a');
    worker.group.visible = false;
    run.group.add(worker.group);
    run.pm = { hud, arrows, tag, suitMesh, gearMesh, worker, open: false, zones: null, sedan: null, suv: null, colours: new Map(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ'), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), pose: {} };
  },
  reset(run) {
    const pm = run.pm;
    pm.open = false; pm.hud.show(false); pm.worker.group.visible = false; pm.tag.visible = false;
    pm.arrows.count = pm.suitMesh.count = pm.gearMesh.count = 0;
    if (pm.sedan) pm.sedan.count = pm.suv.count = 0;
    pm.colours.clear();
    run.state.game = null;
    holdPlayer(run, false);
  },
  teardown(run) { holdPlayer(run, false); },
  open(run) {
    const pm = run.pm;
    pm.open = true;
    pm.sedan ||= carMesh('sedan', run);
    pm.suv ||= carMesh('suv', run);
    const zones = marshalZones(lotBays(MARSHAL.lot));
    run.state.game = createMarshal(zones, 9);
    holdPlayer(run, true);
    const F = MARSHAL.frame;
    pm.worker.group.visible = true;
    const wx = F.x - F.dz * MARSHAL.marshalLat, wz = F.z + F.dx * MARSHAL.marshalLat;
    pm.worker.group.position.set(wx, groundHeight(wx, wz), wz);
    pm.worker.group.rotation.y = MARSHAL.heading + Math.PI; // (facing the cars)
    pm.hud.show(true);
  },
  gesture(run, what) {
    const g = run.state.game;
    if (!g || run.phase !== 'running' || g.done) return;
    marshalGesture(g, what);
    const w = run.pm.worker;
    // (the figure faces the cars: the car's left is the figure's right)
    w.gest = what === 'left' ? 'right' : what === 'right' ? 'left' : what; w.gestT = what === 'stop' ? 1.4 : 0.9;
  },
  key(run, e) {
    if (!run.pm.open || run.phase === 'intro') return;
    const what = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'straight', KeyW: 'straight', ArrowDown: 'stop', KeyS: 'stop', Space: 'stop' }[e.code];
    if (what) { swallow(e); if (!e.repeat) MARSHAL_FEATURE.gesture(run, what); }
  },
  events(run, g) {
    const H = run.pm.hud;
    for (const e of g.events) {
      if (e.kind === 'good') { H.flash('Parked +100'); blip(run, 'good'); }
      else if (e.kind === 'crooked') { H.flash('Crooked +40', true); blip(run, 'pock'); }
      else if (e.kind === 'blocker') { H.flash('Blocking the aisle! −80', true); blip(run, 'honk'); }
      else if (e.kind === 'close') { H.flash('Mind the skiers! −40', true); blip(run, 'honk'); }
      else if (e.kind === 'late') { H.flash('Too late: he\'ll park crooked', true); }
      else if (e.kind === 'full') { H.flash('Nothing free there!', true); blip(run, 'bad'); }
      else if (e.kind === 'guess') { H.flash('No sign from you: he does as he likes', true); }
      else if (e.kind === 'cross-warn') { H.flash('Skiers about to cross!'); }
      else if (e.kind === 'sent') blip(run, 'pock');
    }
    g.events.length = 0;
  },
  update(run, ctx, dt) {
    const pm = run.pm;
    if (!pm.open && run.def.objectives[run.index]?.id === 'marshal' && live(run)) MARSHAL_FEATURE.open(run);
    const g = run.state.game;
    if (!g || run.phase !== 'running') return;
    marshalStep(g, Math.min(dt, 0.1));
    MARSHAL_FEATURE.events(run, g);
  },
  after(run, ctx, dt) {
    const pm = run.pm, g = run.state.game;
    if (run.phase === 'done') pm.hud.show(false);
    poseWorker(pm.worker, dt);
    if (!pm.open || !g) return;
    const { m, q, e, p, s, pose } = pm;
    const F = MARSHAL.frame, D = { x: F.dx, z: F.dz }, R = { x: -F.dz, z: F.dx };
    // --- the cars ---
    const counts = { sedan: 0, suv: 0 };
    for (const c of g.cars) {
      const kind = c.suv ? 'suv' : 'sedan', mesh = pm[kind], i = counts[kind]++;
      if (i >= MAX_CARS) continue;
      marshalCarPose(c, F, pose);
      const spec = BODY_SPECS[kind], half = (spec.zFront - spec.zRear) / 2;
      const ux = Math.sin(pose.yaw), uz = Math.cos(pose.yaw), sx = -uz, sz = ux;
      const yf = groundHeight(pose.x + ux * half, pose.z + uz * half), yb = groundHeight(pose.x - ux * half, pose.z - uz * half);
      const yl = groundHeight(pose.x - sx * 0.85, pose.z - sz * 0.85), yr = groundHeight(pose.x + sx * 0.85, pose.z + sz * 0.85);
      e.set(-Math.atan2(yf - yb, 2 * half), pose.yaw, Math.atan2(yr - yl, 1.7));
      q.setFromEuler(e); s.set(1, 1, 1);
      m.compose(p.set(pose.x, (yf + yb) / 2 + 0.08, pose.z), q, s);
      mesh.setMatrixAt(i, m);
      const col = _col.setHex(CAR_COLOURS[c.paint % CAR_COLOURS.length]);
      const paintAttr = mesh.geometry.attributes.paintColor, state = mesh.geometry.attributes.carState;
      paintAttr.setXYZ(i, col.r, col.g, col.b);
      // the brake lamps while it stands in the way
      const braking = c.phase !== 'parked' && c.v < 1 ? 1 : 0;
      const turn = c.phase === 'aisle' && c.bay ? Math.sign(c.bay.lat) : 0;
      state.setXYZW(i, braking, turn < 0 ? 1 : 0, turn > 0 ? 1 : 0, 0);
    }
    for (const kind of ['sedan', 'suv']) {
      const mesh = pm[kind];
      mesh.count = Math.min(MAX_CARS, counts[kind]);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.paintColor.needsUpdate = true;
      mesh.geometry.attributes.carState.needsUpdate = true;
    }
    // --- the arrows over the free bays ---
    let n = 0;
    const bob = Math.sin(g.t * 3) * 0.12;
    for (const z of ZONES) {
      for (const b of g.zones[z]) {
        if (b.taken || n >= MAX_ARROWS) continue;
        s.set(1, 1, 1);
        m.compose(p.set(b.x, groundHeight(b.x, b.z) + 2.3 + bob, b.z), q.identity(), s);
        pm.arrows.setMatrixAt(n, m);
        pm.arrows.setColorAt(n, _col.set(ZONE_COLOUR[z]));
        n++;
      }
    }
    pm.arrows.count = n;
    pm.arrows.instanceMatrix.needsUpdate = true;
    if (pm.arrows.instanceColor) pm.arrows.instanceColor.needsUpdate = true;
    // --- the car in hand ---
    const active = marshalActive(g);
    pm.tag.visible = !!active;
    if (active) {
      marshalCarPose(active, F, pose);
      pm.tag.position.set(pose.x, groundHeight(pose.x, pose.z) + 2.5 + bob, pose.z);
    }
    // --- the skiers crossing ---
    const X = g.cross;
    let k = 0;
    if (X.state === 'on') {
      const f = 1 - X.t / MARSHAL.cross.time;
      for (let i = 0; i < 4; i++) {
        const lat = -9 + 18 * f + (i - 1.5) * 1.3, a = MARSHAL.cross.at + (i % 2) * 0.9;
        const x = F.x + D.x * a + R.x * lat, z = F.z + D.z * a + R.z * lat;
        e.set(0, MARSHAL.heading - Math.PI / 2, Math.sin(g.t * 7 + i) * 0.05);
        q.setFromEuler(e); s.set(1, 1, 1);
        m.compose(p.set(x, groundHeight(x, z) + 0.04, z), q, s);
        pm.suitMesh.setMatrixAt(k, m); pm.gearMesh.setMatrixAt(k, m);
        k++;
      }
    }
    pm.suitMesh.count = pm.gearMesh.count = k;
    pm.suitMesh.instanceMatrix.needsUpdate = pm.gearMesh.instanceMatrix.needsUpdate = true;
    // --- the view: high behind the line, looking the way the cars go ---
    const cam = ctx.camera, gy = groundHeight(F.x, F.z);
    cam.position.set(F.x - D.x * 19, gy + 12.5, F.z - D.z * 19);
    cam.up.set(0, 1, 0);
    cam.lookAt(F.x + D.x * 14, gy + 0.5, F.z + D.z * 14);
    cam.updateMatrixWorld();
    // --- the HUD ---
    const chip = (z, label) => { const free = zoneFree(g.zones[z]); return `<span class="rs-zone${free ? '' : ' empty'}" style="border-bottom:3px solid ${ZONE_COLOUR[z]}">${label} <b>${free}</b></span>`; };
    const warn = X.state === 'warn' ? ' <span class="rs-warn">Skiers coming: hold the car!</span>' : X.state === 'on' ? ' <span class="rs-warn">Skiers crossing!</span>' : '';
    const hand = active ? (active.held ? `held (${Math.ceil(MARSHAL.patience - active.waited)} s)` : `${Math.max(0, Math.round(-active.a))} m to the line`) : 'no car in sight';
    pm.hud.set(`<b>${Math.max(0, g.score)}</b> pts · ${g.good} good · ${g.crooked} crooked · ${g.blockers} blocking · ${Math.max(0, Math.ceil(MARSHAL.length - g.t))} s · ${hand}${warn}<br>${chip('left', '←')}${chip('straight', '↑')}${chip('right', '→')}`);
  }
};

export const RESORT_FEATURES = { tbarAttendant: TBAR_FEATURE, waxBench: WAX_FEATURE, parkingMarshal: MARSHAL_FEATURE };
