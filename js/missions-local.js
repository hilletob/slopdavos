import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { surfaceHeight, groundHeight } from './terrain.js';
import { TLM_TREES } from './tlm-trees-data.js';
import { logoIndex, logoFor, logoImage, drawLogo } from './logos.js';
import { QUALITY } from './quality.js';
import {
  BREWERY, BEER_STOPS, beerStep,
  GIPFELI, createRoll, rollStep, rollPoints, rollVerdict, gipfeliNext, gipfeliScore,
  RACLETTE, createRaclette, racletteStep, racletteScrape, meltGrade,
  IBEX, legalIbex, ibexLabel, ibexScale, ibexRayHit, ballistics, ibexAlarm, herdCentre, stepHerd, huntShoot,
  SEEPROMENADE, SQUIRREL, squirrelSpots, stepSquirrels,
  COURT, TENNIS, createTennis, stepTennis,
  SLIDE, slideLength, slideCenterline, createRider, stepRider, slideAt, thetaEq,
  KIRCHNER, KIRCHNER_PALETTE, kirchnerIndex, nearestPalette, gridMode, templateEdges, scorePainting
} from './missions-data-local.js';

// js/missions-local.js
// The runtime of the eight missions at real places of Davos (js/missions-data-local.js has their definitions and the
// games' pure logic): js/missions.js merges LOCAL_FEATURES into its features, a mission asks for one by def.features.
//  - beerVan: the crates (a roof rack on the VW T3, a stack at the brewery door, the one in the player's arms) and the
//    brewery's logo on the van's flanks while the mission runs; the crate logic in js/missions-data-local.js beerStep.
//  - gipfeli / raclette / kirchner: a mini game on a canvas over the view (the walker waits meanwhile); the Kirchner
//    easel takes the view from the renderer for its template.
//  - ibexHunt: the herd on the steep flank (simple models: body, legs, curved horns), the rifle with its scope view
//    (zoom, breathing sway, wind), the herd's alarm.
//  - squirrels: larch trunks along the Seepromenade, the squirrels coming down them, the nut in the player's hand.
//  - tennis / waterslide: a small stage of their own high above the door (the court in the Färbi hall; the slide's
//    tube), unlit materials with the shading baked into vertex colours, built when entered and disposed with the run.
// Everything is built on demand and disposed with the run (the phone keeps nothing it does not need). The games run on
// the mission's frame time (dt), never on a clock of their own.

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const LIFT = 420; // m: the stages float this high above their door
const live = (run) => run.phase === 'running' || run.phase === 'ready';
const isTouch = () => document.body.classList.contains('touch-enabled') || matchMedia('(pointer: coarse)').matches;

// --- Styles -------------------------------------------------------------------------------------------------------------
const STYLE = `
.lm-hud{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:40;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#fff;width:min(620px,calc(100vw - 20px))}
.lm-hud[hidden],.lm-game[hidden],.lm-pad[hidden],.lm-scope[hidden]{display:none!important}
.lm-card{background:rgba(10,12,20,.78);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:8px 12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:13px;font-variant-numeric:tabular-nums;text-align:center}
.lm-card b{font-size:18px}
.lm-pop{font:900 26px Inter,system-ui,sans-serif;color:#ffe14f;text-shadow:0 2px 14px rgba(0,0,0,.6);min-height:32px;transition:transform .1s}
.lm-pop.bad{color:#ff6b6b}
.lm-game{position:fixed;inset:0;z-index:38;display:flex;align-items:flex-start;justify-content:center;padding-top:196px;box-sizing:border-box;background:rgba(6,8,14,.35);font-family:Inter,system-ui,sans-serif;color:#fff}
.lm-game-box{display:flex;flex-direction:column;gap:8px;align-items:center;max-width:calc(100vw - 16px)}
.lm-game canvas{border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.5);touch-action:none;max-width:calc(100vw - 16px);background:#222}
.lm-row{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}
.lm-btn{pointer-events:auto;border:0;border-radius:999px;padding:12px 22px;font:800 16px Inter,system-ui,sans-serif;color:#fff;background:linear-gradient(180deg,#ffb84f,#e0761c);box-shadow:0 6px 18px rgba(224,118,28,.4);touch-action:manipulation;user-select:none;-webkit-user-select:none}
.lm-btn.sec{background:rgba(255,255,255,.14);box-shadow:none;border:1px solid rgba(255,255,255,.25)}
.lm-btn.on,.lm-btn:active{filter:brightness(1.25);transform:scale(.97)}
.lm-pad{position:fixed;right:16px;bottom:120px;z-index:41;display:flex;flex-direction:column;gap:10px;align-items:flex-end;pointer-events:none}
.lm-pad .lm-btn{min-width:84px;min-height:52px}
.lm-swatch{width:38px;height:38px;border-radius:50%;border:3px solid rgba(255,255,255,.3);pointer-events:auto;touch-action:manipulation}
.lm-swatch.on{border-color:#fff;transform:scale(1.12)}
.lm-scope{position:fixed;inset:0;z-index:44;pointer-events:auto;touch-action:none;background:radial-gradient(circle at 50% 50%,rgba(0,0,0,0) 0,rgba(0,0,0,0) 37vmin,rgba(0,0,0,.96) 38vmin)}
.lm-scope::before,.lm-scope::after{content:'';position:absolute;left:50%;top:50%;background:#000}
.lm-scope::before{width:76vmin;height:2px;margin:-1px 0 0 -38vmin;background:linear-gradient(90deg,#000 0,#000 40%,transparent 40%,transparent 60%,#000 60%)}
.lm-scope::after{height:76vmin;width:2px;margin:-38vmin 0 0 -1px;background:linear-gradient(180deg,#000 0,#000 40%,transparent 40%,transparent 60%,#000 60%)}
.lm-scope-dot{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#e33}
.lm-scope-info{position:absolute;left:50%;top:calc(50% + 40vmin);transform:translateX(-50%);font:600 14px Inter,system-ui,sans-serif;color:#fff;text-align:center;text-shadow:0 1px 4px #000;white-space:nowrap}
.lm-scope-info.ok{color:#9dff8a}.lm-scope-info.no{color:#ff8a8a}
.lm-wind{display:inline-block;transition:transform .2s}
.lm-paint{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;justify-content:center}
.lm-paint-tools{display:flex;flex-direction:column;gap:8px;align-items:center;background:rgba(10,12,20,.8);border-radius:14px;padding:8px}
.lm-paint-wrap{position:relative}
.lm-motif{width:150px;border-radius:8px;display:block;border:2px solid rgba(255,255,255,.3)}
.lm-motif[hidden]{display:none}
.lm-paint-wrap img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.38;image-rendering:pixelated;border-radius:16px}
.lm-paint-wrap img[hidden]{display:none}
.lm-result img{max-width:100%;max-height:30vh;border-radius:10px;display:block;margin:6px auto}
.lm-gallery{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:6px}
.lm-gallery img{width:72px;height:48px;object-fit:cover;border-radius:6px;opacity:.9}
body.lm-indoor .gta-prompt,body.lm-indoor .touch-use,body.lm-indoor .mission-prompt{display:none!important}
body.lm-nojoy #touch-controls{display:none!important}
@media (max-width:640px){.lm-paint-tools{flex-direction:row;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 16px);padding:6px}.lm-motif{width:96px}.lm-paint-tools .lm-btn{padding:6px 10px!important;font-size:13px}.lm-swatch{width:30px;height:30px}.lm-pad{right:10px;bottom:150px}.lm-hud{bottom:8px}.lm-game{padding-top:calc(env(safe-area-inset-top,0px) + 168px)}}
`;
function addStyle(run) {
  const s = el('style');
  s.textContent = STYLE;
  document.head.append(s);
  run.cleanups.push(() => s.remove());
}

// --- Geometry helpers ---------------------------------------------------------------------------------------------------
/** Paints a geometry in one colour (vertex colours), shaded from above when `bake` (the unlit stages) */
function paint(g, col, bake = false) {
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.normal, count = g.attributes.position.count, c = new THREE.Color(col), out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const k = bake ? 0.62 + 0.38 * Math.max(0, n.getY(i)) + 0.12 * Math.max(0, n.getZ(i)) - 0.2 * Math.max(0, -n.getY(i)) : 1;
    out[i * 3] = c.r * k; out[i * 3 + 1] = c.g * k; out[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const merged = (parts) => mergeGeometries(parts);
const litMat = () => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
const unlitMat = (opts = {}) => new THREE.MeshBasicNodeMaterial({ vertexColors: true, ...opts });
const box = (w, h, d, x, y, z, col, bake = false, rotY = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rotY) g.rotateY(rotY); g.translate(x, y, z); return paint(g, col, bake); };
const ball = (r, sx, sy, sz, x, y, z, col, seg = 10) => { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.6 | 0)); g.scale(sx, sy, sz); g.translate(x, y, z); return paint(g, col); };
function meshOf(geometry, material) { const m = new THREE.Mesh(geometry, material); m.castShadow = m.receiveShadow = false; return m; }
function disposeTree(root) {
  const materials = new Set(), geometries = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material || [])) materials.add(m);
    if (o.isInstancedMesh) o.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
}
/** Text on a canvas, on a plane (unlit) */
function textPlane(text, w, h, { fg = '#fff', bg = 'rgba(0,0,0,0)', font = '800 120px Inter, Arial, sans-serif' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = Math.max(32, Math.round(512 * (h / w)));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = fg;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * 0.94);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return meshOf(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, depthWrite: false }));
}
/** A canvas sized for the device's pixels, drawn in CSS px */
function hiCanvas(w, h) {
  const c = el('canvas');
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.aspectRatio = `${w} / ${h}`;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas: c, ctx, w, h };
}
/** CSS px of the pointer on a canvas laid out at (w × h) CSS px, whatever its displayed size */
function canvasPoint(canvas, e, w, h) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
}
const fitWidth = (w, h) => Math.max(240, Math.min(w, (globalThis.innerWidth || w) - 20, ((globalThis.innerHeight || h) - 330) * (w / h)));

// --- The walker waits (a mini game, a stage): the pedestrian frozen at the door -----------------------------------------
function holdWalker(run, on, { joystick = false } = {}) {
  const cm = run.hooks.controllerManager;
  if (on) {
    if (run._lmHeld) return;
    run._lmHeld = { had: 'personDriver' in cm, prev: cm.personDriver };
    if (!joystick) document.body.classList.add('lm-nojoy'); // (the game's own controls instead)
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; };
    run.cleanups.push(() => holdWalker(run, false));
  } else if (run._lmHeld) {
    const h = run._lmHeld;
    run._lmHeld = null;
    document.body.classList.remove('lm-nojoy');
    if (h.had) cm.personDriver = h.prev ?? null; else delete cm.personDriver;
  }
}
/** Keys go to the game only (the walker would jump or step on them) */
const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };

// --- A stage high above the door ---------------------------------------------------------------------------------------
class Stage {
  constructor(run, door, build, { joystick = false } = {}) {
    this.run = run;
    this.origin = new THREE.Vector3(door.x, surfaceHeight(door.x, door.z) + LIFT, door.z);
    this.group = new THREE.Group();
    this.group.name = 'MissionStage';
    this.group.position.copy(this.origin);
    run.group.add(this.group);
    build(this.group);
    this.group.updateMatrixWorld(true);
    this.fade = el('div');
    this.fade.style.cssText = 'position:fixed;inset:0;background:#000;z-index:39;pointer-events:none;opacity:1;transition:opacity .5s';
    document.body.append(this.fade);
    requestAnimationFrame(() => requestAnimationFrame(() => { if (this.fade) this.fade.style.opacity = '0'; }));
    document.body.classList.add('lm-indoor');
    holdWalker(run, true, { joystick });
    this.snow = run.scene.getObjectByName('snowfall');
  }
  camera(cam, pos, look, up = null) {
    const o = this.origin;
    cam.position.set(o.x + pos.x, o.y + pos.y, o.z + pos.z);
    if (up) cam.up.copy(up); else cam.up.set(0, 1, 0);
    cam.lookAt(o.x + look.x, o.y + look.y, o.z + look.z);
    cam.updateMatrixWorld();
    if (this.snow) this.snow.visible = false;
  }
  dispose() {
    if (!this.group) return;
    this.group.removeFromParent();
    disposeTree(this.group);
    this.group = null;
    this.fade?.remove(); this.fade = null;
    document.body.classList.remove('lm-indoor', 'lm-nojoy');
    holdWalker(this.run, false);
    const cam = this.run.hooks.cameraSystem?.camera;
    if (cam) cam.up.set(0, 1, 0);
    if (this.snow) this.snow.visible = true;
    this.run.hooks.cameraSystem.resetForTeleport?.();
  }
}

/** A small sound: a click / pock / splash from noise and an oscillator on the city's mix (silent when off) */
function blip(run, kind = 'pock') {
  const a = run.hooks.audio;
  if (!a || !a.enabled || !a.context || a.context.state !== 'running' || !a.mix) return;
  const ctx = a.context, t = ctx.currentTime;
  const g = ctx.createGain();
  g.connect(a.mix);
  if (kind === 'splash' || kind === 'scrape' || kind === 'shot') {
    const n = Math.floor(ctx.sampleRate * (kind === 'splash' ? 0.9 : kind === 'shot' ? 0.5 : 0.25));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, kind === 'shot' ? 4 : 1.5);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = kind === 'scrape' ? 'highpass' : 'lowpass'; f.frequency.value = kind === 'splash' ? 1200 : kind === 'shot' ? 2400 : 2500;
    g.gain.value = kind === 'shot' ? 0.9 : 0.4;
    src.connect(f).connect(g); src.start(t);
    return;
  }
  const o = ctx.createOscillator(); o.type = kind === 'good' ? 'triangle' : 'sine';
  o.frequency.setValueAtTime(kind === 'good' ? 880 : kind === 'bad' ? 180 : 520, t);
  if (kind === 'good') o.frequency.setValueAtTime(1320, t + 0.08);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'good' ? 0.22 : 0.09));
  o.connect(g); o.start(t); o.stop(t + 0.25);
}

/** The bottom HUD card with a line and a pop for "+100" */
function bottomHud(run) {
  const hud = el('div', 'lm-hud');
  hud.hidden = true;
  const pop = el('div', 'lm-pop', '');
  const card = el('div', 'lm-card');
  hud.append(pop, card);
  document.body.append(hud);
  run.cleanups.push(() => hud.remove());
  let popT = null;
  return {
    hud, card, pop,
    show(on) { hud.hidden = !on; },
    set(html) { if (card.innerHTML !== html) card.innerHTML = html; },
    flash(text, bad = false) {
      pop.textContent = text; pop.className = `lm-pop${bad ? ' bad' : ''}`; pop.style.transform = 'scale(1.25)';
      clearTimeout(popT); popT = setTimeout(() => { pop.style.transform = ''; }, 120);
      clearTimeout(pop._t); pop._t = setTimeout(() => { pop.textContent = ''; }, 1500);
    }
  };
}
/** Touch buttons at the bottom right: [{ label, down(), up?() }] */
function touchPad(run, buttons) {
  const pad = el('div', 'lm-pad');
  pad.hidden = true;
  const out = {};
  for (const b of buttons) {
    const btn = el('button', 'lm-btn', b.label);
    btn.type = 'button';
    run.listen(btn, 'pointerdown', (e) => { e.preventDefault(); btn.classList.add('on'); b.down?.(e); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) run.listen(btn, ev, () => { if (btn.classList.contains('on')) { btn.classList.remove('on'); b.up?.(); } });
    pad.append(btn);
    out[b.id || b.label] = btn;
  }
  document.body.append(pad);
  run.cleanups.push(() => pad.remove());
  return { pad, buttons: out, show(on) { pad.hidden = !on; } };
}

// =====================================================================================================================
// 1. The beer van
// =====================================================================================================================
const NAVY = '#0b2a5b', GOLD = '#f5c518';
function crateGeometry() {
  const parts = [box(0.42, 0.26, 0.32, 0, 0.13, 0, NAVY), box(0.44, 0.03, 0.34, 0, 0.255, 0, '#142f66')];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const g = new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6);
    g.translate(-0.15 + i * 0.1, 0.29, -0.1 + j * 0.1);
    parts.push(paint(g, GOLD));
  }
  return merged(parts);
}

const BEER_FEATURE = {
  setup(run) {
    const cm = run.hooks.controllerManager;
    const bv = run.bv = { crateGeo: crateGeometry(), mat: litMat(), rack: new THREE.Group(), slots: [], decals: [], doorStack: [], carry: null, last: null };
    bv.rack.name = 'BeerRack';
    // the roof rack: a frame of bars and six crates (two rows of three)
    bv.rack.add(meshOf(merged([box(1.5, 0.04, 0.05, 0, 1.99, 1.0, '#222'), box(1.5, 0.04, 0.05, 0, 1.99, -1.6, '#222'), box(0.05, 0.08, 2.65, 0.72, 2.02, -0.3, '#333'), box(0.05, 0.08, 2.65, -0.72, 2.02, -0.3, '#333')]), bv.mat));
    for (let k = 0; k < 6; k++) {
      const m = meshOf(bv.crateGeo, bv.mat);
      m.position.set(k % 2 ? 0.3 : -0.3, 2.02, 0.55 - Math.floor(k / 2) * 0.62);
      m.visible = false;
      bv.rack.add(m); bv.slots.push(m);
    }
    const car = cm.entities.car;
    (car.chassisPivot || car.mesh).add(bv.rack);
    run.cleanups.push(() => { bv.rack.removeFromParent(); disposeTree(bv.rack); });
    // the logo on both flanks (js/logos.js: assets/logos/davoser-craft-beer.png)
    logoIndex().then((index) => {
      const e = logoFor(index, BREWERY.name);
      if (!e || run.disposed) return null;
      return logoImage(e).then((img) => {
        if (run.disposed) return;
        const c = document.createElement('canvas'); c.width = 512; c.height = 160;
        const g = c.getContext('2d');
        g.fillStyle = NAVY; g.beginPath(); g.roundRect(4, 4, 504, 152, 26); g.fill();
        drawLogo(g, img, e.aspect, 16, 10, 480, 140);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.6 });
        // the brewery's board over its door, facing the lane
        const door = BREWERY.door, out = BREWERY.facing;
        const board = meshOf(new THREE.PlaneGeometry(2.4, 0.75), mat);
        board.position.set(door.x - Math.sin(out) * 1.15, surfaceHeight(door.x, door.z) + 3.1, door.z - Math.cos(out) * 1.15);
        board.rotation.y = out;
        board.updateMatrixWorld();
        run.group.add(board);
        for (const side of [-1, 1]) {
          const d = meshOf(new THREE.PlaneGeometry(1.7, 0.53), mat);
          d.position.set(side * 0.938, 0.95, -0.55);
          d.rotation.y = side * Math.PI / 2;
          bv.rack.add(d); bv.decals.push(d);
        }
      });
    }).catch(() => {});
    // the stack at the brewery door and the crate in the arms
    const door = BREWERY.door, y0 = surfaceHeight(door.x, door.z);
    for (let k = 0; k < 6; k++) {
      const m = meshOf(bv.crateGeo, bv.mat);
      m.position.set(door.x + 1.2 + (k % 2) * 0.46, y0 + Math.floor(k / 2) * 0.3, door.z + 0.9);
      m.updateMatrix();
      run.group.add(m); bv.doorStack.push(m);
    }
    bv.carry = meshOf(bv.crateGeo, bv.mat);
    bv.carry.visible = false;
    run.group.add(bv.carry);
    bv.hud = bottomHud(run);
    addStyle(run);
  },
  reset(run) { run.bv.last = null; },
  teardown() {},
  update(run, ctx, dt, cm) {
    const bv = run.bv, st = run.state.beer;
    const car = cm.entities.car;
    const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    st.van = { x: car.position.x - f.x * 2.6, z: car.position.z - f.z * 2.6 };
    if (!live(run)) return;
    const stop = run.index >= 1 ? BEER_STOPS[run.index - 1] : null;
    const what = beerStep(st, ctx, st.van, stop);
    if (what === 'deliver') { blip(run, 'good'); bv.hud.flash(`Delivered: ${stop.name}`); }
    else if (what === 'pick' || what === 'stow') blip(run, 'pock');
  },
  after(run, ctx, dt, cm) {
    const bv = run.bv, st = run.state.beer;
    const inVan = st.phase === 'load' ? st.loaded * 3 : Math.max(0, 6 - st.delivered - (st.carrying ? 1 : 0));
    bv.slots.forEach((m, k) => { m.visible = k < inVan; });
    const atDoor = st.phase === 'load' ? 6 - st.loaded * 3 - (st.carrying ? 3 : 0) : 0;
    bv.doorStack.forEach((m, k) => { m.visible = k < atDoor; });
    const p = cm.entities.person;
    bv.carry.visible = st.carrying && ctx.mode === 'person';
    if (bv.carry.visible) {
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      bv.carry.position.set(p.position.x + fx * 0.38, p.position.y + 0.82, p.position.z + fz * 0.38);
      bv.carry.rotation.y = p.heading;
      bv.carry.scale.setScalar(st.phase === 'load' ? 1.15 : 1);
    }
    bv.hud.show(run.phase === 'running' || run.phase === 'ready');
    bv.hud.set(`<b>${st.delivered}/${BEER_STOPS.length}</b> bars · crates on the roof ${inVan}${st.carrying ? ' · carrying a crate' : ''}`);
  }
};

// =====================================================================================================================
// 2. The Gipfeli: rolling on a canvas, then the bike
// =====================================================================================================================
const GW = 600, GH = 400;
const GIPFELI_FEATURE = {
  // (js/missions.js hides the game's own controls while this is true: rolling the dough; the walk in and the ride out keep them)
  ownControls: (run) => !!run.gw?.open,
  setup(run) {
    addStyle(run);
    const game = el('div', 'lm-game');
    game.hidden = true;
    const boxEl = el('div', 'lm-game-box');
    const cv = hiCanvas(GW, GH);
    cv.canvas.style.width = `${fitWidth(GW, GH)}px`;
    const info = el('div', 'lm-card', '');
    const tap = el('button', 'lm-btn', 'Roll (tap steadily)');
    tap.type = 'button';
    boxEl.append(info, cv.canvas, tap);
    game.append(boxEl);
    document.body.append(game);
    run.cleanups.push(() => game.remove());
    const gw = run.gw = { game, cv, info, tap, open: false, drag: null, dp: 0, pushes: 0, verdictT: 0, verdict: '', t: 0, flour: Array.from({ length: 60 }, () => [Math.random() * GW, Math.random() * GH, Math.random() * 2 + 0.5]) };
    run.listen(cv.canvas, 'pointerdown', (e) => { e.preventDefault(); cv.canvas.setPointerCapture?.(e.pointerId); gw.drag = canvasPoint(cv.canvas, e, GW, GH); });
    run.listen(cv.canvas, 'pointermove', (e) => {
      if (!gw.drag) return;
      const p = canvasPoint(cv.canvas, e, GW, GH);
      gw.dp += Math.max(0, p.y - gw.drag.y) / 250; // (250 px: the dough's length)
      gw.drag = p;
    });
    for (const ev of ['pointerup', 'pointercancel']) run.listen(cv.canvas, ev, () => { gw.drag = null; });
    run.listen(tap, 'pointerdown', (e) => { e.preventDefault(); gw.pushes++; });
    gw.hud = bottomHud(run);
  },
  reset(run) { const gw = run.gw; gw.open = false; gw.game.hidden = true; gw.dp = 0; gw.pushes = 0; gw.verdictT = 0; holdWalker(run, false); },
  teardown(run) { run.gw.game.hidden = true; },
  key(run, e) {
    if (!run.gw.open) return;
    if (['KeyS', 'ArrowDown', 'Space', 'Enter'].includes(e.code) && run.phase !== 'intro') { swallow(e); if (!e.repeat) run.gw.pushes++; }
  },
  update(run, ctx, dt) {
    const gw = run.gw, g = run.state.gipfeli;
    const forming = run.def.objectives[run.index]?.id === 'form';
    if (forming && !gw.open && live(run)) { gw.open = true; gw.game.hidden = false; holdWalker(run, true); }
    if (!forming && gw.open) { gw.open = false; gw.game.hidden = true; holdWalker(run, false); }
    if (!gw.open || run.phase !== 'running') { gw.dp = 0; gw.pushes = 0; return; }
    gw.t += dt;
    if (gw.verdictT > 0) { gw.verdictT -= dt; if (gw.verdictT <= 0) gipfeliNext(g); gw.dp = 0; gw.pushes = 0; return; }
    const r = g.current;
    if (!r) return;
    const dragging = !!gw.drag;
    rollStep(r, dragging ? { dp: gw.dp } : { push: gw.pushes }, dt);
    gw.dp = 0; gw.pushes = 0;
    if (r.done) { gw.verdict = `${rollVerdict(r)} +${rollPoints(r)}`; gw.verdictT = 0.9; blip(run, r.quality > 0.6 ? 'good' : 'bad'); }
  },
  after(run, ctx) {
    const gw = run.gw, g = run.state.gipfeli;
    gw.hud.show(!gw.open && run.index >= 2 && run.phase === 'running');
    if (!gw.open) return;
    const { ctx: c } = gw.cv;
    const r = g.current || g.rolls[g.rolls.length - 1];
    drawGipfeliBoard(c, gw, r, g);
    const n = g.rolls.length + (g.current ? 1 : 0);
    gw.info.innerHTML = `Gipfeli <b>${Math.min(GIPFELI.count, n)}/${GIPFELI.count}</b> · ${gipfeliScore(g)} pts · drag down over the dough at an even pace`;
  }
};

function drawGipfeliBoard(c, gw, r, g) {
  // the board
  const grd = c.createLinearGradient(0, 0, 0, GH);
  grd.addColorStop(0, '#b98552'); grd.addColorStop(1, '#8f6136');
  c.fillStyle = grd; c.fillRect(0, 0, GW, GH);
  c.strokeStyle = 'rgba(70,40,15,.18)'; c.lineWidth = 2;
  for (let y = 18; y < GH; y += 26) { c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(GW * 0.3, y + 6, GW * 0.6, y - 6, GW, y + 3); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,.55)';
  for (const [x, y, s] of gw.flour) { c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill(); }
  // the finished ones in a row at the left
  g.rolls.forEach((done, i) => drawCroissant(c, 52, 60 + i * 64, 0.55, done.quality));
  if (!r) return;
  const cx = GW * 0.47, top = 70, len = 260, base = 300;
  const p = r.p;
  // the dough triangle below the roll
  const yr = top + p * len, wr = base * (1 - p);
  c.fillStyle = '#f1dcb0';
  c.beginPath(); c.moveTo(cx - wr / 2, yr); c.lineTo(cx + wr / 2, yr); c.lineTo(cx, top + len + 28); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(160,120,60,.35)'; c.stroke();
  // the roll
  const th = 12 + 30 * p, rw = Math.max(40, base * (1 - p * 0.75));
  const rg = c.createLinearGradient(0, yr - th, 0, yr + th * 0.4);
  rg.addColorStop(0, '#f7e6c2'); rg.addColorStop(1, '#d8b47c');
  c.fillStyle = rg; c.beginPath(); c.roundRect(cx - rw / 2, yr - th, rw, th + 6, th / 2); c.fill();
  c.strokeStyle = 'rgba(150,100,40,.5)'; c.lineWidth = 1.5;
  for (let k = 1; k < 2 + p * 5; k++) { const x = cx - rw / 2 + (rw * k) / (2 + p * 5); c.beginPath(); c.moveTo(x, yr - th + 2); c.quadraticCurveTo(x + 8, yr - th / 2, x, yr + 4); c.stroke(); }
  // the hand's arrow
  if (!r.done) { c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '700 15px Inter, sans-serif'; c.textAlign = 'center'; c.fillText('↓ roll down ↓', cx, top + len + 58); }
  // the pace meter
  const mx = GW - 70, my = 50, mh = GH - 100;
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(mx, my, 26, mh, 13); c.fill();
  const toY = (v) => my + mh - clamp(v / GIPFELI.tear, 0, 1) * mh;
  c.fillStyle = 'rgba(80,220,120,.75)'; c.fillRect(mx + 3, toY(GIPFELI.band[1]), 20, toY(GIPFELI.band[0]) - toY(GIPFELI.band[1]));
  c.fillStyle = r.v > GIPFELI.band[1] ? '#ff6b6b' : r.v >= GIPFELI.band[0] ? '#7dffb0' : '#ffe14f';
  c.beginPath(); c.arc(mx + 13, toY(r.v), 9, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff'; c.font = '600 12px Inter, sans-serif'; c.textAlign = 'center';
  c.fillText('fast', mx + 13, my - 10); c.fillText('slow', mx + 13, my + mh + 18);
  if (gw.verdictT > 0) {
    drawCroissant(c, cx, GH / 2, 1.5, r.quality);
    c.font = '900 30px Inter, sans-serif'; c.fillStyle = '#ffe14f'; c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 5;
    c.strokeText(gw.verdict, cx, GH - 40); c.fillText(gw.verdict, cx, GH - 40);
  }
}
function drawCroissant(c, x, y, s, q) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const col = q > 0.8 ? '#d9922e' : q > 0.5 ? '#e0a64a' : '#e8c27a';
  c.fillStyle = col; c.strokeStyle = 'rgba(110,60,10,.55)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-44, 10); c.quadraticCurveTo(-30, -26, 0, -24); c.quadraticCurveTo(30, -26, 44, 10); c.quadraticCurveTo(28, -6, 0, -4); c.quadraticCurveTo(-28, -6, -44, 10); c.fill(); c.stroke();
  for (const k of [-20, -7, 7, 20]) { c.beginPath(); c.moveTo(k, -22); c.quadraticCurveTo(k + 4, -12, k, -5); c.stroke(); }
  c.restore();
}

// =====================================================================================================================
// 3. Raclette at Käch: the grill, the half wheel, the queue
// =====================================================================================================================
const RW = 640, RH = 420;
const meltColour = (m) => {
  const stops = [[0, [250, 236, 180]], [0.5, [252, 220, 120]], [0.66, [245, 190, 60]], [0.8, [205, 130, 40]], [0.92, [150, 80, 25]], [1.0, [40, 25, 15]]];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 1; i < stops.length; i++) if (m <= stops[i][0]) { a = stops[i - 1]; b = stops[i]; break; }
  const t = clamp((m - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
  return `rgb(${a[1].map((v, k) => Math.round(v + (b[1][k] - v) * t)).join(',')})`;
};
const RACLETTE_FEATURE = {
  // (js/missions.js hides the game's own controls while this is true: scraping the cheese; the walk to the stove keeps them)
  ownControls: (run) => !!run.rc?.open,
  setup(run) {
    addStyle(run);
    const game = el('div', 'lm-game');
    game.hidden = true;
    const boxEl = el('div', 'lm-game-box');
    const cv = hiCanvas(RW, RH);
    cv.canvas.style.width = `${fitWidth(RW, RH)}px`;
    const info = el('div', 'lm-card', '');
    const btn = el('button', 'lm-btn', 'Scrape!');
    btn.type = 'button';
    boxEl.append(info, cv.canvas, btn);
    game.append(boxEl);
    document.body.append(game);
    run.cleanups.push(() => game.remove());
    const rc = run.rc = { game, cv, info, open: false, swipe: null, knife: 0, plate: null, bubbles: Array.from({ length: 26 }, () => [Math.random(), Math.random(), Math.random()]) };
    run.listen(cv.canvas, 'pointerdown', (e) => { e.preventDefault(); cv.canvas.setPointerCapture?.(e.pointerId); rc.swipe = { ...canvasPoint(cv.canvas, e, RW, RH), t: performance.now() }; });
    run.listen(cv.canvas, 'pointermove', (e) => {
      if (!rc.swipe) return;
      const p = canvasPoint(cv.canvas, e, RW, RH);
      if (Math.abs(p.x - rc.swipe.x) > 120 && performance.now() - rc.swipe.t < 900) { rc.swipe = null; RACLETTE_FEATURE.scrape(run); }
    });
    for (const ev of ['pointerup', 'pointercancel']) run.listen(cv.canvas, ev, () => { rc.swipe = null; });
    run.listen(btn, 'pointerdown', (e) => { e.preventDefault(); RACLETTE_FEATURE.scrape(run); });
  },
  reset(run) { const rc = run.rc; rc.open = false; rc.game.hidden = true; rc.plate = null; rc.knife = 0; run.state.game = null; holdWalker(run, false); },
  teardown(run) { run.rc.game.hidden = true; },
  scrape(run) {
    const g = run.state.game;
    if (!g || run.phase !== 'running') return;
    const melt = g.melt;
    const r = racletteScrape(g);
    if (!r) return;
    run.rc.knife = 0.35;
    run.rc.plate = { melt, r, t: 1.6 };
    blip(run, 'scrape');
    setTimeout(() => { if (!run.disposed) blip(run, r.points >= 100 ? 'good' : r.points < 20 ? 'bad' : 'pock'); }, 120);
  },
  key(run, e) {
    if (!run.rc.open) return;
    if (['Space', 'Enter', 'KeyS', 'ArrowDown'].includes(e.code) && run.phase !== 'intro') { swallow(e); if (!e.repeat) RACLETTE_FEATURE.scrape(run); }
  },
  update(run, ctx, dt) {
    const rc = run.rc;
    const serving = run.def.objectives[run.index]?.id === 'serve';
    if (serving && !rc.open && live(run)) { rc.open = true; rc.game.hidden = false; run.state.game = createRaclette(7); holdWalker(run, true); }
    if (!serving && rc.open && run.phase !== 'running') { rc.open = false; rc.game.hidden = true; holdWalker(run, false); }
    if (!rc.open || run.phase !== 'running') return;
    racletteStep(run.state.game, dt);
    rc.knife = Math.max(0, rc.knife - dt);
    if (rc.plate) rc.plate.t -= dt;
  },
  after(run) {
    const rc = run.rc, g = run.state.game;
    if (run.phase === 'done' && rc.open) { rc.open = false; rc.game.hidden = true; holdWalker(run, false); }
    if (!rc.open || !g) return;
    drawRaclette(rc.cv.ctx, rc, g);
    rc.info.innerHTML = `<b>${Math.max(0, g.score)}</b> pts · ${g.served} plates · ${Math.max(0, Math.ceil(RACLETTE.length - g.t))} s · swipe across the cheese (or Space) to scrape`;
  }
};

function drawRaclette(c, rc, g) {
  const now = g.t;
  c.fillStyle = '#2b1d14'; c.fillRect(0, 0, RW, RH);
  const wood = c.createLinearGradient(0, 230, 0, RH);
  wood.addColorStop(0, '#6b4429'); wood.addColorStop(1, '#4a2e1b');
  c.fillStyle = wood; c.fillRect(0, 250, RW, RH - 250);
  // the grill: a hood with glowing rods
  const gx = 60, gw = 300;
  c.fillStyle = '#3a3a3e'; c.beginPath(); c.roundRect(gx - 10, 60, gw + 20, 34, 10); c.fill();
  for (let k = 0; k < 5; k++) { c.fillStyle = `rgba(255,${80 + 40 * Math.sin(now * 6 + k)},40,.9)`; c.fillRect(gx + 14 + k * 58, 92, 40, 5); }
  const glow = c.createRadialGradient(gx + gw / 2, 100, 10, gx + gw / 2, 120, 160);
  glow.addColorStop(0, 'rgba(255,120,40,.35)'); glow.addColorStop(1, 'rgba(255,120,40,0)');
  c.fillStyle = glow; c.fillRect(gx - 40, 90, gw + 80, 150);
  // the half wheel: the rind and the cut face, tilted up to the grill
  const cx = gx + gw / 2, cy = 190;
  c.fillStyle = '#c98a2e'; c.beginPath(); c.ellipse(cx, cy + 22, 140, 40, 0, 0, Math.PI); c.fill();
  c.fillRect(cx - 140, cy - 2, 280, 24);
  c.fillStyle = meltColour(g.melt); c.beginPath(); c.ellipse(cx, cy, 140, 38, 0, 0, Math.PI * 2); c.fill();
  // bubbles and brown spots
  for (const [u, v, s] of rc.bubbles) {
    const a = u * Math.PI * 2, rr = Math.sqrt(v);
    const bx = cx + Math.cos(a) * 128 * rr, by = cy + Math.sin(a) * 32 * rr;
    if (g.melt > 0.5) { c.fillStyle = `rgba(255,255,230,${0.25 + 0.3 * Math.sin(now * 5 + s * 9) ** 2})`; c.beginPath(); c.arc(bx, by, 2 + s * 4 * (g.melt - 0.4), 0, Math.PI * 2); c.fill(); }
    if (g.melt > 0.76) { c.fillStyle = `rgba(120,60,15,${Math.min(0.7, (g.melt - 0.76) * 3)})`; c.beginPath(); c.arc(bx + 5, by + 2, 3 + s * 5, 0, Math.PI * 2); c.fill(); }
  }
  if (g.melt > 0.95) { c.fillStyle = 'rgba(200,200,200,.25)'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(cx - 60 + k * 40, cy - 40 - ((now * 30 + k * 17) % 50), 14, 0, Math.PI * 2); c.fill(); } }
  // the knife's sweep
  if (rc.knife > 0) {
    const t = 1 - rc.knife / 0.35, kx = cx - 150 + t * 300;
    c.fillStyle = '#d9dde3'; c.beginPath(); c.moveTo(kx, cy - 30); c.lineTo(kx + 14, cy - 30); c.lineTo(kx + 8, cy + 50); c.lineTo(kx - 4, cy + 50); c.fill();
    c.fillStyle = '#5a3a22'; c.fillRect(kx - 2, cy - 70, 16, 40);
  }
  // the melt gauge
  const mx = 40, my = 290, mw = 340;
  const z = RACLETTE.zones, X = (m) => mx + (m / 1.05) * mw;
  c.fillStyle = '#f4ebc6'; c.fillRect(mx, my, mw, 20);
  c.fillStyle = '#f7c948'; c.fillRect(X(z.normal[0]), my, X(z.normal[1]) - X(z.normal[0]), 20);
  c.fillStyle = '#b8671f'; c.fillRect(X(z.crispy[0]), my, X(z.crispy[1]) - X(z.crispy[0]), 20);
  c.fillStyle = '#1a1210'; c.fillRect(X(z.burnt), my, X(1.05) - X(z.burnt), 20);
  c.font = '700 12px Inter, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff';
  c.fillText('raw', X(0.25), my + 38); c.fillText('normal', X((z.normal[0] + z.normal[1]) / 2), my + 38); c.fillText('crispy', X((z.crispy[0] + z.crispy[1]) / 2), my + 38); c.fillText('burnt', X(1.0), my + 38);
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(X(g.melt), my - 4); c.lineTo(X(g.melt) - 7, my - 14); c.lineTo(X(g.melt) + 7, my - 14); c.fill();
  c.fillRect(X(g.melt) - 1.5, my - 4, 3, 28);
  // the plate just served
  if (rc.plate && rc.plate.t > 0) {
    const px = 210, py = 370;
    c.fillStyle = '#f4f4f4'; c.beginPath(); c.ellipse(px, py, 70, 22, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = meltColour(rc.plate.melt); c.beginPath(); c.ellipse(px, py - 3, 46, 12, 0, 0, Math.PI * 2); c.fill();
    const r = rc.plate.r;
    c.font = '900 24px Inter, sans-serif'; c.fillStyle = r.points >= 100 ? '#ffe14f' : r.points < 20 ? '#ff6b6b' : '#fff';
    const label = !r.order ? 'Nobody waiting' : r.grade === 'burnt' ? `Burnt! ${r.points}` : r.grade === r.order ? `Just right! +${r.points}` : r.grade === 'raw' || r.grade === 'soft' ? `Too runny +${r.points}` : `Wanted ${r.order === 'crispy' ? 'extra crispy' : 'normal'} +${r.points}`;
    c.fillText(label, px, py - 34);
  }
  // the queue
  c.textAlign = 'left';
  c.font = '800 15px Inter, sans-serif'; c.fillStyle = '#fff'; c.fillText('Orders', 430, 40);
  g.queue.forEach((q, i) => {
    const y = 56 + i * 82;
    c.fillStyle = i === 0 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.08)'; c.beginPath(); c.roundRect(420, y, 200, 72, 12); c.fill();
    c.fillStyle = ['#e07a5f', '#81b29a', '#f2cc8f', '#3d85c6', '#c06c84'][q.id % 5];
    c.beginPath(); c.arc(450, y + 28, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffe0c4'; c.beginPath(); c.arc(450, y + 24, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = '700 15px Inter, sans-serif';
    c.fillText(q.kind === 'crispy' ? 'Extra crispy' : 'Normal', 474, y + 26);
    c.fillStyle = q.kind === 'crispy' ? '#b8671f' : '#f7c948'; c.beginPath(); c.arc(600, y + 22, 8, 0, Math.PI * 2); c.fill();
    const left = 1 - q.wait / RACLETTE.patience;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(474, y + 44, 130, 8);
    c.fillStyle = left > 0.5 ? '#7dffb0' : left > 0.25 ? '#ffe14f' : '#ff6b6b'; c.fillRect(474, y + 44, 130 * clamp(left, 0, 1), 8);
  });
  if (!g.queue.length) { c.fillStyle = 'rgba(255,255,255,.6)'; c.font = '600 14px Inter, sans-serif'; c.fillText('Waiting for guests …', 430, 70); }
  c.textAlign = 'center'; c.fillStyle = '#ffe9b0'; c.font = '800 18px Georgia, serif';
  c.fillText('Gourmet Käch · Raclette', 210, 30);
  c.font = '600 12px Inter, sans-serif'; c.fillStyle = 'rgba(255,255,255,.8)';
  c.fillText(`melt: ${meltGrade(g.melt)}`, X(g.melt), my - 20);
}

// =====================================================================================================================
// 4. The ibex hunt
// =====================================================================================================================
export function ibexGeometry(a) {
  const male = a.sex === 'm';
  const fur = male ? (a.age === 'old' ? '#5f4b38' : '#6e5a44') : '#8a7458', dark = '#3c3026', horn = '#4a3d30', belly = '#c9b79c';
  const parts = [
    ball(1, 0.27, 0.32, 0.62, 0, 0.8, 0, fur, 12), // the body
    ball(1, 0.2, 0.22, 0.3, 0, 0.66, 0.05, belly, 8),
    ball(1, 0.25, 0.3, 0.28, 0, 0.88, 0.38, fur, 10) // the shoulder
  ];
  const neck = new THREE.CylinderGeometry(0.1, 0.14, 0.45, 8); neck.rotateX(-0.75); neck.translate(0, 1.05, 0.62); parts.push(paint(neck, fur));
  parts.push(ball(1, 0.1, 0.12, 0.2, 0, 1.2, 0.86, fur, 10)); // the head
  parts.push(ball(1, 0.06, 0.06, 0.08, 0, 1.13, 1.02, dark, 6)); // the muzzle
  if (male && a.age !== 'kid') { const beard = new THREE.ConeGeometry(0.035, 0.14, 6); beard.rotateX(Math.PI); beard.translate(0, 1.02, 0.94); parts.push(paint(beard, dark)); }
  for (const [x, z] of [[-0.13, 0.42], [0.13, 0.42], [-0.13, -0.42], [0.13, -0.42]]) {
    const leg = new THREE.CylinderGeometry(0.045, 0.035, 0.62, 6); leg.translate(x, 0.31, z); parts.push(paint(leg, x < 0 ? fur : dark));
  }
  // the horns: arcs sweeping back over the neck, ridged (a ring of beads) on a buck
  for (const s of [-1, 1]) {
    const R = Math.max(0.05, a.horn * 0.62), pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, ang = t * 2.0; pts.push(new THREE.Vector3(s * (0.05 + t * 0.08 * a.horn), 1.3 + Math.sin(ang) * R, 0.82 - (1 - Math.cos(ang)) * R)); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, male ? 0.032 + a.horn * 0.02 : 0.018, 6, false);
    parts.push(paint(tube, horn));
  }
  const ear = new THREE.ConeGeometry(0.03, 0.09, 4);
  for (const s of [-1, 1]) { const e = ear.clone(); e.rotateZ(s * 1.0); e.translate(s * 0.09, 1.27, 0.78); parts.push(paint(e, fur)); }
  return merged(parts);
}

const IBEX_FEATURE = {
  setup(run) {
    addStyle(run);
    const ih = run.ih = { meshes: [], mat: litMat(), scoped: false, fov0: null, yaw: 0, pitch: 0, sway: 0, breath: 4, holding: false, recover: 0, fov: 5, kick: 0, rifle: null, info: null, last: null };
    // the rifle at the shoulder (a stock, the barrel, the scope)
    const rifle = new THREE.Group();
    rifle.add(meshOf(merged([box(0.06, 0.1, 0.42, 0, 0, -0.1, '#5a3b22'), box(0.03, 0.03, 0.62, 0, 0.03, 0.42, '#222'), box(0.05, 0.05, 0.3, 0, 0.1, 0.2, '#111')]), litMat()));
    run.group.add(rifle);
    ih.rifle = rifle;
    // the scope's view: a black ring, the crosshair, the range and the animal under it
    const scope = el('div', 'lm-scope');
    scope.hidden = true;
    scope.append(el('div', 'lm-scope-dot'));
    const info = el('div', 'lm-scope-info', '');
    scope.append(info);
    document.body.append(scope);
    run.cleanups.push(() => scope.remove());
    ih.scope = scope; ih.info = info;
    let drag = null;
    run.listen(scope, 'pointerdown', (e) => { e.preventDefault(); scope.setPointerCapture?.(e.pointerId); drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, button: e.button }; });
    run.listen(scope, 'pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      const k = (ih.fov * Math.PI / 180) / (globalThis.innerHeight || 800);
      ih.yaw -= dx * k * 0.9; ih.pitch = clamp(ih.pitch - dy * k * 0.9, -0.6, 0.6);
    });
    run.listen(scope, 'pointerup', (e) => { if (drag && drag.moved < 8 && performance.now() - drag.t < 350 && drag.button === 0) IBEX_FEATURE.fire(run); drag = null; });
    run.listen(scope, 'contextmenu', (e) => { e.preventDefault(); IBEX_FEATURE.toggleScope(run, false); });
    run.listen(scope, 'wheel', (e) => { e.preventDefault(); ih.fov = clamp(ih.fov * (e.deltaY > 0 ? 1.15 : 0.87), 2.2, 14); }, { passive: false });
    // right click on the view: the scope
    const canvas = document.getElementById('canvas-container');
    run.listen(canvas, 'contextmenu', (e) => { if (run.def.objectives[run.index]?.id === 'hunt') { e.preventDefault(); IBEX_FEATURE.toggleScope(run, true); } });
    ih.pad = touchPad(run, [
      { id: 'scope', label: 'Scope', down: () => IBEX_FEATURE.toggleScope(run) },
      { id: 'breath', label: 'Breath', down: () => { ih.holding = true; }, up: () => { ih.holding = false; } },
      { id: 'fire', label: 'Fire', down: () => IBEX_FEATURE.fire(run) }
    ]);
    ih.hud = bottomHud(run);
  },
  reset(run) {
    const ih = run.ih;
    IBEX_FEATURE.toggleScope(run, false);
    for (const m of ih.meshes) { m.removeFromParent(); m.geometry.dispose(); }
    ih.meshes = [];
    for (const a of run.state.hunt.herd) {
      const m = meshOf(ibexGeometry(a), ih.mat);
      m.castShadow = true;
      m.scale.setScalar(ibexScale(a));
      m.rotation.order = 'YXZ';
      run.group.add(m);
      ih.meshes.push(m);
    }
    ih.breath = 4; ih.recover = 0; ih.kick = 0; ih.last = null;
  },
  teardown(run) { IBEX_FEATURE.toggleScope(run, false); },
  toggleScope(run, on = null) {
    const ih = run.ih, cam = run.hooks.cameraSystem?.camera;
    const want = on === null ? !ih.scoped : on;
    if (want && (run.def.objectives[run.index]?.id !== 'hunt' || run.phase !== 'running' && run.phase !== 'ready')) return;
    if (want === ih.scoped || !cam) return;
    ih.scoped = want;
    ih.scope.hidden = !want;
    if (want) {
      ih.fov0 = cam.fov;
      const d = new THREE.Vector3(); cam.getWorldDirection(d);
      ih.yaw = Math.atan2(d.x, d.z); ih.pitch = Math.asin(clamp(d.y, -1, 1));
      // (aim at the herd when the view looked elsewhere)
      const c = herdCentre(run.state.hunt.herd), p = run.hooks.controllerManager.entities.person.position;
      const toHerd = Math.atan2(c.x - p.x, c.z - p.z);
      if (Math.abs(((ih.yaw - toHerd + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.5) { ih.yaw = toHerd; ih.pitch = Math.atan2(groundHeight(c.x, c.z) + 0.8 - (p.y + 1.6), Math.hypot(c.x - p.x, c.z - p.z)); }
      holdWalker(run, true);
    } else {
      if (ih.fov0) { cam.fov = ih.fov0; cam.updateProjectionMatrix(); }
      holdWalker(run, false);
    }
    ih.pad.buttons.scope?.classList.toggle('on', want);
  },
  key(run, e) {
    const ih = run.ih;
    if (run.phase === 'intro') return;
    const hunting = run.def.objectives[run.index]?.id === 'hunt';
    if (e.code === 'KeyZ' && hunting) { swallow(e); if (!e.repeat) IBEX_FEATURE.toggleScope(run); return; }
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && ih.scoped) { ih.holding = true; return; }
    if ((e.code === 'Space' || e.code === 'KeyF' || e.code === 'Enter') && ih.scoped) { swallow(e); if (!e.repeat) IBEX_FEATURE.fire(run); return; }
    if (e.code === 'Escape' && ih.scoped) { swallow(e); IBEX_FEATURE.toggleScope(run, false); }
  },
  fire(run) {
    const ih = run.ih, h = run.state.hunt;
    if (!ih.scoped || run.phase !== 'running' && run.phase !== 'ready' || h.done || h.ammo <= 0) return;
    if (ih.kick > 0.3) return; // (working the bolt)
    const o = ih.eye.clone();
    const d = IBEX_FEATURE.aimDir(run, true);
    // the bullet's path: the wind and the drop at the range of what the line meets
    const first = ibexRayHit(h.herd, o, d);
    let range = first ? first.t : 200;
    const dev = ballistics(range, h.wind, ih.yaw);
    const right = new THREE.Vector3(-Math.cos(ih.yaw), 0, Math.sin(ih.yaw));
    const shot = d.clone().multiplyScalar(range).addScaledVector(right, dev.side).add(new THREE.Vector3(0, -dev.drop, 0)).normalize();
    // the terrain in the way
    const hit = ibexRayHit(h.herd, o, shot);
    range = hit ? hit.t : 600;
    let blocked = false;
    for (let s = 4; s < range; s += 3) { const x = o.x + shot.x * s, y = o.y + shot.y * s, z = o.z + shot.z * s; if (y < groundHeight(x, z) - 0.2) { blocked = true; break; } }
    const before = hit && !blocked ? hit.animal : null;
    const res = huntShoot(h, o, blocked ? new THREE.Vector3(0, -1, 0) : shot);
    blip(run, 'shot');
    run.audio?.boom?.(250, 0.35);
    ih.kick = 0.9;
    ih.pitch += 0.012;
    if (res) { ih.hud.flash(`${res.text} (${res.points >= 0 ? '+' : ''}${res.points})`, res.points < 0); ih.info.textContent = res.text; if (before && res.kind === 'clean') blip(run, 'good'); }
  },
  /** The line of sight: the yaw and pitch with the breathing sway */
  aimDir(run, withSway = true) {
    const ih = run.ih;
    const sx = withSway ? ih.swayX : 0, sy = withSway ? ih.swayY : 0;
    const yaw = ih.yaw + sx, pitch = ih.pitch + sy;
    return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
  },
  update(run, ctx, dt, cm) {
    const ih = run.ih, h = run.state.hunt;
    // the herd lives on
    const rand = h.rand;
    if (live(run)) {
      const alarm = ibexAlarm(h.herd, { x: ctx.x, z: ctx.z, speed: Math.abs(ctx.speed) }, h.wind);
      h.alarm = clamp(h.alarm + alarm.add * dt, 0, 1.2);
      h.alarmWhy = h.alarm > 0.15 ? alarm.why : null;
      if (h.alarm >= 1) { stepHerd(h.herd, 0, rand, { flee: { x: ctx.x, z: ctx.z } }); h.alarm = 0.4; h.flees++; ih.hud.flash('The herd bolts!', true); }
    }
    stepHerd(h.herd, dt, rand);
    h.herd.forEach((a, i) => {
      const m = ih.meshes[i];
      if (!m) return;
      a.y = groundHeight(a.x, a.z);
      m.visible = a.state !== 'gone' || a.down < 7;
      m.position.set(a.x, a.y - (a.state === 'gone' ? Math.min(1.5, (a.down - 4) * 0.5) : 0), a.z);
      m.rotation.y = a.heading;
      // lying down (no blood: it lies on its side, then fades into the slope)
      m.rotation.z = a.state === 'down' || a.state === 'gone' ? -Math.min(1, a.down) * 1.45 : 0;
      if (a.state === 'gone') a.down += dt;
    });
    // the sway: breathing, steadied while the breath is held (4 s, then it comes back worse)
    ih.sway += dt;
    if (ih.holding && ih.breath > 0 && ih.recover <= 0) ih.breath -= dt;
    else { ih.breath = Math.min(4, ih.breath + dt * 0.8); if (ih.breath <= 0) ih.recover = 2.5; }
    if (ih.breath <= 0 && ih.recover <= 0) ih.recover = 2.5;
    ih.recover = Math.max(0, ih.recover - dt);
    const steady = ih.holding && ih.breath > 0 && ih.recover <= 0;
    const amp = steady ? 0.00018 : ih.recover > 0 ? 0.0028 : 0.0011;
    ih.swayX = Math.sin(ih.sway * 0.9) * amp + Math.sin(ih.sway * 2.3) * amp * 0.4;
    ih.swayY = Math.sin(ih.sway * 1.3 + 1) * amp * 0.8 + Math.cos(ih.sway * 0.4) * amp * 0.5;
    ih.kick = Math.max(0, ih.kick - dt);
    // the keys pan the scope slowly
    if (ih.scoped) {
      const k = cm.keys, rate = (ih.fov * Math.PI / 180) * 0.35;
      if (k.left) ih.yaw += rate * dt; if (k.right) ih.yaw -= rate * dt;
      if (k.forward) ih.pitch += rate * dt; if (k.backward) ih.pitch -= rate * dt;
    }
  },
  after(run, ctx, dt, cm) {
    const ih = run.ih, h = run.state.hunt;
    const p = cm.entities.person;
    ih.eye = new THREE.Vector3(p.position.x, p.position.y + 1.62, p.position.z);
    const hunting = run.def.objectives[run.index]?.id === 'hunt' && (run.phase === 'running' || run.phase === 'ready');
    if (!hunting && ih.scoped) IBEX_FEATURE.toggleScope(run, false);
    ih.pad.show(hunting && isTouch());
    // the rifle: on the shoulder, along the view
    const cam = ctx.camera;
    const yaw = ih.scoped ? ih.yaw : p.heading;
    ih.rifle.visible = ctx.mode === 'person' && !ih.scoped;
    ih.rifle.position.set(p.position.x + Math.cos(yaw) * -0.22 + Math.sin(yaw) * 0.2, p.position.y + 1.32, p.position.z - Math.sin(yaw) * -0.22 + Math.cos(yaw) * 0.2);
    ih.rifle.rotation.set(-0.15, yaw, 0, 'YXZ');
    if (ih.scoped) {
      const d = IBEX_FEATURE.aimDir(run);
      d.y += ih.kick > 0.6 ? (ih.kick - 0.6) * 0.04 : 0;
      cam.position.copy(ih.eye);
      cam.up.set(0, 1, 0);
      cam.lookAt(ih.eye.x + d.x * 100, ih.eye.y + d.y * 100, ih.eye.z + d.z * 100);
      if (cam.fov !== ih.fov) { cam.fov = ih.fov; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld();
      // the rangefinder and the animal on the line
      const hit = ibexRayHit(h.herd, ih.eye, IBEX_FEATURE.aimDir(run, false));
      let text, cls = '';
      if (hit) {
        const a = hit.animal, legal = legalIbex(a);
        text = `${ibexLabel(a)} · horns ${Math.round(a.horn * 100)} cm · ${Math.round(hit.t)} m · ${legal ? 'may be taken' : 'protected'}${hit.zone === 'vitals' ? ' · ✚ vitals' : ''}`;
        cls = legal ? 'ok' : 'no';
      } else {
        let range = null;
        const d0 = IBEX_FEATURE.aimDir(run, false);
        for (let s = 5; s < 900; s += 4) { if (ih.eye.y + d0.y * s < groundHeight(ih.eye.x + d0.x * s, ih.eye.z + d0.z * s)) { range = s; break; } }
        text = range ? `${range} m` : '— m';
      }
      const windRel = (h.wind.dir - ih.yaw) * 180 / Math.PI;
      text += ` · wind ${h.wind.speed.toFixed(1)} m/s ${Math.sin(h.wind.dir - ih.yaw) > 0.3 ? '←' : Math.sin(h.wind.dir - ih.yaw) < -0.3 ? '→' : Math.cos(windRel * Math.PI / 180) > 0 ? '↑' : '↓'} · ${h.ammo} rounds${ih.holding && ih.breath > 0 && ih.recover <= 0 ? ' · holding breath' : ih.recover > 0 ? ' · out of breath' : ''}`;
      if (!ih.last || performance.now() - ih.last > 120) { ih.info.textContent = text; ih.info.className = `lm-scope-info ${cls}`; ih.last = performance.now(); }
    }
    // the HUD: the wind and the herd
    const c = herdCentre(h.herd);
    const toHerd = Math.atan2(c.x - p.position.x, c.z - p.position.z);
    const windDeg = ((h.wind.dir - (ih.scoped ? ih.yaw : toHerd)) * 180) / Math.PI;
    ih.hud.show(run.phase === 'running' || run.phase === 'ready');
    ih.hud.set(`Wind <span class="lm-wind" style="transform:rotate(${windDeg}deg)">↑</span> ${h.wind.speed.toFixed(1)} m/s · herd ${Math.round(Math.hypot(c.x - p.position.x, c.z - p.position.z))} m · unease ${'●'.repeat(Math.round(h.alarm * 5))}${'○'.repeat(Math.max(0, 5 - Math.round(h.alarm * 5)))} · ${h.ammo} rounds · legal: old bucks ≥ ${Math.round(IBEX.legalHorn * 100)} cm`);
  }
};
// (Shift released: the breath goes)
function bindKeyUps(run, fn) { run.listen(window, 'keyup', fn, { capture: true }); }

// =====================================================================================================================
// 5. The squirrels on the Seepromenade
// =====================================================================================================================
function squirrelGeometry() {
  const fur = '#a8481c', belly = '#f1e2c8';
  const parts = [ball(1, 0.06, 0.07, 0.11, 0, 0.1, 0, fur), ball(1, 0.04, 0.05, 0.05, 0, 0.09, 0.06, belly, 8), ball(0.05, 1, 1, 1.1, 0, 0.17, 0.1, fur, 8)];
  for (const s of [-1, 1]) { const e = new THREE.ConeGeometry(0.015, 0.045, 4); e.translate(s * 0.025, 0.225, 0.09); parts.push(paint(e, fur)); }
  parts.push(ball(0.012, 1, 1, 1, 0.03, 0.185, 0.145, '#111', 5), ball(0.012, 1, 1, 1, -0.03, 0.185, 0.145, '#111', 5));
  // the bushy tail, curling up behind
  for (let i = 0; i < 7; i++) { const t = i / 6, a = t * 2.4; parts.push(ball(0.045 + 0.02 * Math.sin(t * Math.PI), 1, 1, 1, 0, 0.1 + Math.sin(a) * 0.17, -0.1 - Math.cos(a) * 0.1 + 0.1 * t, fur, 8)); }
  for (const [x, z] of [[-0.04, 0.06], [0.04, 0.06], [-0.05, -0.05], [0.05, -0.05]]) { const l = new THREE.CylinderGeometry(0.012, 0.012, 0.07, 4); l.translate(x, 0.035, z); parts.push(paint(l, fur)); }
  return merged(parts);
}
const SQUIRREL_FEATURE = {
  setup(run) {
    addStyle(run);
    const sq = run.sq = { offering: false, meshes: [], mat: litMat(), geo: squirrelGeometry(), nut: null, trunks: null };
    for (let i = 0; i < SQUIRREL.maxActive + 1; i++) { const m = meshOf(sq.geo, sq.mat); m.visible = false; m.rotation.order = 'YXZ'; m.castShadow = true; run.group.add(m); sq.meshes.push(m); }
    const nut = new THREE.SphereGeometry(0.025, 8, 6); nut.scale(1, 1.25, 1);
    sq.nut = meshOf(paint(nut, '#7a4a20'), litMat());
    sq.nut.visible = false;
    run.group.add(sq.nut);
    // the trees along the trail: the single trees of swissTLM3D near it, a larch trunk at every other spot
    const trees = [];
    for (const t of TLM_TREES.trees) if (t[0] > 1640 && t[0] < 2320 && t[1] > -3060 && t[1] < -2230) trees.push({ x: t[0], z: t[1] });
    sq.trees = trees;
    sq.hud = bottomHud(run);
    sq.pad = touchPad(run, [{ id: 'nut', label: 'Nut (hold)', down: () => { sq.touchHold = true; }, up: () => { sq.touchHold = false; } }]);
    bindKeyUps(run, (e) => { if (e.code === 'KeyE' || e.code === 'Space') sq.keyHold = false; });
  },
  reset(run) {
    const sq = run.sq;
    const g = run.state.game;
    g.spots = squirrelSpots(SEEPROMENADE, 14, sq.trees);
    // the trunks (an instanced larch stem where no tree of the survey stands)
    if (sq.trunks) { sq.trunks.removeFromParent(); sq.trunks.geometry.dispose(); sq.trunks.material.dispose(); sq.trunks.dispose(); }
    const spots = g.spots.filter((s) => !sq.trees.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < 0.3));
    const stem = new THREE.CylinderGeometry(0.09, 0.2, 9, 7); stem.translate(0, 4.5, 0);
    const trunks = new THREE.InstancedMesh(paint(stem, '#5b4030'), litMat(), Math.max(1, spots.length));
    const mx = new THREE.Matrix4();
    spots.forEach((s, i) => trunks.setMatrixAt(i, mx.makeTranslation(s.x, groundHeight(s.x, s.z) - 0.1, s.z)));
    trunks.count = spots.length;
    trunks.castShadow = true;
    run.storage(trunks);
    run.group.add(trunks);
    sq.trunks = trunks;
    sq.keyHold = sq.touchHold = false;
  },
  key(run, e) {
    if ((e.code === 'KeyE' || e.code === 'Space') && run.phase !== 'intro') { swallow(e); run.sq.keyHold = true; }
  },
  update(run, ctx, dt) {
    const sq = run.sq, g = run.state.game;
    sq.offering = (sq.keyHold || sq.touchHold) && ctx.mode === 'person';
    if (run.def.objectives[run.index]?.id !== 'feed' || run.phase !== 'running') return;
    const before = g.fed, fled = g.fled;
    stepSquirrels(g, { x: ctx.x, z: ctx.z, speed: Math.abs(ctx.speed), offering: sq.offering }, dt, Math.random);
    if (g.fed > before) { blip(run, 'good'); sq.hud.flash(`+${g.last.points}${g.streak > 1 ? ` · streak ${g.streak}` : ''}`); }
    if (g.fled > fled) { blip(run, 'bad'); sq.hud.flash('Scared it away!', true); }
  },
  after(run, ctx, dt, cm) {
    const sq = run.sq, g = run.state.game;
    const p = cm.entities.person;
    sq.meshes.forEach((m, i) => {
      const s = g.squirrels[i];
      m.visible = !!s;
      if (!s) return;
      const onTrunk = s.y > 0.02;
      const toP = Math.atan2(p.position.x - s.spot.x, p.position.z - s.spot.z);
      const gx = onTrunk ? s.spot.x + Math.sin(toP) * 0.2 : s.x, gz = onTrunk ? s.spot.z + Math.cos(toP) * 0.2 : s.z;
      m.position.set(gx, groundHeight(gx, gz) + s.y + (s.hop || 0), gz);
      m.rotation.y = onTrunk ? toP + Math.PI : s.heading;
      m.rotation.x = onTrunk ? (s.state === 'down' ? Math.PI / 2 : -Math.PI / 2) : (s.state === 'eat' ? -0.5 : 0);
      m.scale.setScalar(2.2); // (a little larger than life: seen from the path)
    });
    sq.nut.visible = sq.offering;
    if (sq.offering) { const fx = Math.sin(p.heading), fz = Math.cos(p.heading); sq.nut.position.set(p.position.x + fx * 0.42, p.position.y + 0.35, p.position.z + fz * 0.42); }
    const feeding = run.def.objectives[run.index]?.id === 'feed' && run.phase === 'running';
    sq.hud.show(feeding);
    sq.pad.show(feeding && isTouch());
    sq.hud.set(`<b>${g.fed}</b> fed · ${g.score} pts · ${Math.max(0, Math.ceil(SQUIRREL.length - g.t))} s${sq.offering ? ' · holding out a nut' : ' · hold E to hold out a nut'}`);
  }
};

// =====================================================================================================================
// 6. Tennis in the Färbi hall
// =====================================================================================================================
function courtTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  const sx = 512 / 18, sz = 1024 / 36; // the hall floor 18 × 36 m
  g.fillStyle = '#3c7a4a'; g.fillRect(0, 0, 512, 1024);
  const X = (x) => 256 + x * sx, Z = (z) => 512 + z * sz;
  g.fillStyle = '#2f5f9e'; g.fillRect(X(-5.485), Z(-11.885), 10.97 * sx, 23.77 * sz);
  g.strokeStyle = '#fff'; g.lineWidth = 3;
  const line = (x0, z0, x1, z1) => { g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); };
  for (const x of [-5.485, 5.485, -COURT.halfW, COURT.halfW]) line(x, -COURT.halfL, x, COURT.halfL);
  for (const z of [-COURT.halfL, COURT.halfL]) line(-5.485, z, 5.485, z);
  for (const z of [-COURT.service, COURT.service]) line(-COURT.halfW, z, COURT.halfW, z);
  line(0, -COURT.service, 0, COURT.service);
  line(0, -COURT.halfL, 0, -COURT.halfL + 0.3); line(0, COURT.halfL, 0, COURT.halfL - 0.3);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
function buildHall(group, tn) {
  const floor = meshOf(new THREE.PlaneGeometry(18, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ map: courtTexture() }));
  group.add(floor);
  const W = 18, L = 36, H = 9;
  const walls = [
    box(W, H, 0.3, 0, H / 2, -L / 2, '#2c4a6e', true), box(W, H, 0.3, 0, H / 2, L / 2, '#2c4a6e', true),
    box(0.3, H, L, -W / 2, H / 2, 0, '#35587f', true), box(0.3, H, L, W / 2, H / 2, 0, '#35587f', true),
    box(W, 0.3, L, 0, H, 0, '#d9dde2', true),
    box(W, 2.2, 0.32, 0, 1.1, -L / 2 + 0.05, '#1f6b3a', true), box(W, 2.2, 0.32, 0, 1.1, L / 2 - 0.05, '#1f6b3a', true)
  ];
  // the ceiling's light bands, the net posts, a bench
  for (let k = -3; k <= 3; k++) walls.push(box(1.2, 0.08, 30, k * 2.4, H - 0.2, 0, '#ffffff', false));
  walls.push(box(0.1, 1.07, 0.1, -5.9, 0.53, 0, '#ddd', true), box(0.1, 1.07, 0.1, 5.9, 0.53, 0, '#ddd', true));
  walls.push(box(3, 0.45, 0.5, -8.2, 0.23, 6, '#8a5a32', true), box(3, 0.45, 0.5, -8.2, 0.23, -6, '#8a5a32', true));
  group.add(meshOf(merged(walls), unlitMat()));
  // the net: a dark mesh with its white band
  const net = document.createElement('canvas'); net.width = 256; net.height = 32;
  const g = net.getContext('2d');
  g.fillStyle = 'rgba(20,20,20,.55)'; g.fillRect(0, 0, 256, 32);
  g.strokeStyle = 'rgba(0,0,0,.8)'; for (let x = 0; x < 256; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 32); g.stroke(); }
  for (let y = 0; y < 32; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 4);
  const nt = new THREE.CanvasTexture(net); nt.colorSpace = THREE.SRGBColorSpace;
  const netMesh = meshOf(new THREE.PlaneGeometry(11.9, COURT.net), new THREE.MeshBasicNodeMaterial({ map: nt, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  netMesh.position.set(0, COURT.net / 2, 0);
  group.add(netMesh);
  const sign = textPlane('TC DAVOS · SPORTHALLE FÄRBI', 12, 1.2, { fg: '#ffe14f', bg: '#14304f', font: '800 64px Inter, Arial, sans-serif' });
  sign.position.set(0, 4.2, -L / 2 + 0.2);
  group.add(sign);
  // the ball, its shadow, the rackets
  tn.ball = meshOf(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicNodeMaterial({ color: 0xe6ff3a }));
  tn.shadow = meshOf(new THREE.CircleGeometry(0.07, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  tn.shadow.position.y = 0.01;
  group.add(tn.ball, tn.shadow);
  const racket = () => {
    const ring = new THREE.TorusGeometry(0.14, 0.012, 6, 18); ring.scale(1, 1.3, 1); ring.translate(0, 0.42, 0);
    const grip = new THREE.CylinderGeometry(0.014, 0.016, 0.3, 6); grip.translate(0, 0.13, 0);
    const strings = new THREE.CircleGeometry(0.135, 16); strings.scale(1, 1.3, 1); strings.translate(0, 0.42, 0);
    const r = new THREE.Group();
    r.add(meshOf(merged([paint(ring, '#222', true), paint(grip, '#c33', true)]), unlitMat()));
    r.add(meshOf(strings, new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })));
    return r;
  };
  tn.rP = racket(); tn.rA = racket();
  group.add(tn.rP, tn.rA);
  // the two players: the city's figures, self-lit
  tn.crowd = new PersonCrowd(2, { farDistance: 1e9, castShadow: false });
  tn.tint = uniform(new THREE.Color(1.05, 1.05, 1.05));
  for (const m of tn.crowd.meshes) { m.receiveShadow = false; m.material.emissiveNode = m.material.colorNode.mul(tn.tint); group.add(m); }
  tn.rigP = new PersonRig({ seed: 0.23, female: false, hair: 0.3, girth: 1 });
  tn.rigA = new PersonRig({ seed: 0.71, female: false, hair: 0.1, girth: 1.08 });
}
const TENNIS_FEATURE = {
  setup(run) {
    addStyle(run);
    run.tn = { stage: null, swing: false, hud: bottomHud(run), pad: touchPad(run, [{ id: 'swing', label: 'Swing', down: () => { run.tn.swing = true; } }]), lastPts: 0 };
    const canvas = document.getElementById('canvas-container');
    run.listen(canvas, 'pointerdown', (e) => { if (run.tn.stage && e.pointerType !== 'touch' && e.button === 0) run.tn.swing = true; });
  },
  reset(run) { const tn = run.tn; tn.stage?.dispose(); tn.stage = null; run.state.game = null; tn.swing = false; },
  teardown(run) { run.tn.stage?.dispose(); run.tn.stage = null; },
  key(run, e) {
    if (!run.tn.stage) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ') { swallow(e); if (!e.repeat && run.phase !== 'intro') run.tn.swing = true; }
  },
  enter(run) {
    const tn = run.tn;
    tn.stage = new Stage(run, run.def.objectives[0] ? { x: run.def.start.x, z: run.def.start.z } : run.def.start, (g) => buildHall(g, tn), { joystick: true });
    run.state.game = createTennis(5);
    const t = run.state.game;
    tn.rigP.reset(t.p.x, t.p.z, Math.PI, () => 0);
    tn.rigA.reset(t.a.x, t.a.z, 0, () => 0);
    tn.lastPts = 0;
  },
  update(run, ctx, dt, cm) {
    const tn = run.tn;
    if (!tn.stage && run.index >= 1 && live(run)) TENNIS_FEATURE.enter(run);
    const t = run.state.game;
    if (!t || run.phase !== 'running') { tn.swing = false; return; }
    const k = cm.keys;
    const steer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const input = { x: steer, z: (k.backward ? 1 : 0) - (k.forward ? 1 : 0), swing: tn.swing, steer: steer || null };
    const before = t.ball.lastHit, pts = t.score.p + t.score.a;
    stepTennis(t, input, Math.min(dt, 1 / 30));
    tn.swing = false;
    if (t.ball.lastHit !== before && t.ball.lastHit) blip(run, 'pock');
    if (t.score.p + t.score.a !== pts) {
      const l = t.last;
      blip(run, l.who === 'p' ? 'good' : 'bad');
      tn.hud.flash(`${l.who === 'p' ? 'Your point' : 'Coach\'s point'}: ${l.why}`, l.who !== 'p');
    } else if (t.last?.why === 'fault' && t.last.at === t.t) tn.hud.flash('Fault', true);
  },
  after(run, ctx, dt) {
    const tn = run.tn, t = run.state.game;
    tn.pad.show(!!tn.stage && isTouch() && run.phase === 'running');
    tn.hud.show(!!tn.stage && run.phase === 'running');
    if (!tn.stage || !t) return;
    const b = t.ball;
    tn.ball.position.set(b.x, b.y, b.z);
    tn.shadow.position.set(b.x, 0.01, b.z);
    tn.ball.visible = tn.shadow.visible = t.phase !== 'between' || b.live;
    const ground = () => 0;
    tn.rigP.update(dt, t.p.x, t.p.z, Math.PI, ground, null, 0);
    tn.rigA.update(dt, t.a.x, t.a.z, 0, ground, null, 0);
    tn.crowd.begin(); tn.crowd.add(tn.rigP, 0); tn.crowd.add(tn.rigA, 0); tn.crowd.end();
    // the rackets: at the right hand, swung through
    const place = (r, s, facing) => {
      const sw = s.swing > 0 ? 1 - s.swing / 0.35 : 0;
      const f = facing; // +1: faces +z (the coach), −1: faces −z (the player)
      r.position.set(s.x - 0.35 * f, 0.85, s.z + 0.1 * f);
      r.rotation.set(0, 0, 0);
      r.rotation.y = f > 0 ? 0 : Math.PI;
      r.rotation.x = -0.4 + Math.sin(sw * Math.PI) * 1.4 * -1;
      r.rotation.z = (f > 0 ? 1 : -1) * (0.9 - sw * 2.2);
    };
    place(tn.rP, t.p, -1); place(tn.rA, t.a, 1);
    // the camera: behind and above the player, the court ahead
    tn.stage.camera(ctx.camera, { x: t.p.x * 0.55, y: 4.2, z: clamp(t.p.z + 5.2, 9, 17.3) }, { x: t.p.x * 0.3, y: 0.4, z: -4 });
    const serve = t.phase === 'serve' ? (t.server === 'p' ? (t.toss ? ' · Space at the top!' : ' · your serve: Space') : ' · coach serves') : '';
    tn.hud.set(`You <b>${t.score.p}</b> : <b>${t.score.a}</b> Coach${serve}${t.fault && t.phase === 'serve' ? ' · second serve' : ''}`);
  }
};

// =====================================================================================================================
// 7. The waterslide
// =====================================================================================================================
function slideTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, '#0d1b4a'); grd.addColorStop(0.5, '#132a6b'); grd.addColorStop(1, '#0d1b4a');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 64);
  // the LED rings and a few stars
  g.fillStyle = '#35f0ff'; g.fillRect(0, 0, 10, 64);
  g.fillStyle = '#ff4fd8'; g.fillRect(128, 0, 6, 64);
  g.fillStyle = 'rgba(255,255,255,.8)'; for (let k = 0; k < 18; k++) g.fillRect(Math.random() * 256, Math.random() * 64, 2, 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function buildSlide(group, ws) {
  const pts = slideCenterline(1);
  ws.line = pts;
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
  const L = slideLength();
  const tex = slideTexture();
  tex.repeat.set(L / 3, 1);
  const tube = new THREE.TubeGeometry(curve, Math.round(L * 2), SLIDE.tube + 0.04, QUALITY.mobile ? 12 : 18, false);
  group.add(meshOf(tube, new THREE.MeshBasicNodeMaterial({ map: tex, side: THREE.DoubleSide })));
  // the water film: a thin bright strip along the bottom
  const strip = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const p of pts) strip.push(new THREE.Vector3(p.x, p.y - SLIDE.tube + 0.06, p.z));
  const end = pts[pts.length - 1];
  // the pool at the end
  const pool = new THREE.Group();
  pool.position.set(end.x + Math.sin(end.heading) * 4, end.y - 1.6, end.z + Math.cos(end.heading) * 4);
  pool.rotation.y = end.heading;
  pool.add(meshOf(merged([box(9, 0.4, 12, 0, -0.3, 2, '#bfe6f0', true), box(0.4, 1.4, 12, -4.5, 0.3, 2, '#e9f4f7', true), box(0.4, 1.4, 12, 4.5, 0.3, 2, '#e9f4f7', true), box(9, 1.4, 0.4, 0, 0.3, 8, '#e9f4f7', true), box(40, 0.3, 40, 0, -0.6, 2, '#3b3f45', true)]), unlitMat()));
  const water = meshOf(new THREE.PlaneGeometry(8.6, 11.6).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: 0x29b6d6, transparent: true, opacity: 0.8 }));
  water.position.set(0, 0.5, 2);
  pool.add(water);
  group.add(pool);
  ws.pool = pool;
  // the splash: droplets thrown up at the finish
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicNodeMaterial({ color: 0xe8fbff }), 60);
  drops.count = 0;
  drops.frustumCulled = false;
  group.add(drops);
  ws.drops = drops;
  ws.dropState = Array.from({ length: 60 }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  void up; void strip;
}
const WATERSLIDE_FEATURE = {
  setup(run) {
    addStyle(run);
    run.ws = { stage: null, countdown: 0, hud: bottomHud(run), splashT: 0, pad: touchPad(run, [{ id: 'l', label: '◀ Lean', down: () => { run.ws.tl = true; }, up: () => { run.ws.tl = false; } }, { id: 'r', label: 'Lean ▶', down: () => { run.ws.tr = true; }, up: () => { run.ws.tr = false; } }]) };
  },
  reset(run) { const ws = run.ws; ws.stage?.dispose(); ws.stage = null; run.state.rider = null; ws.countdown = 0; ws.splashT = 0; ws.tl = ws.tr = false; },
  teardown(run) { run.ws.stage?.dispose(); run.ws.stage = null; },
  update(run, ctx, dt, cm) {
    const ws = run.ws;
    if (!ws.stage && run.index >= 1 && live(run)) {
      ws.stage = new Stage(run, { x: run.def.start.x, z: run.def.start.z }, (g) => { buildSlide(g, ws); run.storage(g); });
      run.state.rider = null;
      ws.countdown = 2.4;
    }
    if (!ws.stage || run.phase !== 'running') return;
    if (ws.countdown > 0) { ws.countdown -= dt; if (ws.countdown <= 0) run.state.rider = createRider(); return; }
    const r = run.state.rider;
    if (!r) return;
    const k = cm.keys;
    const steer = ((k.left || ws.tl) ? 1 : 0) - ((k.right || ws.tr) ? 1 : 0);
    const was = r.done;
    // (small steps: the bends are tight)
    for (let i = 0, n = Math.max(1, Math.ceil(dt / 0.01)); i < n; i++) stepRider(r, steer, dt / n);
    if (r.done && !was) { ws.splashT = 0.001; blip(run, 'splash'); WATERSLIDE_FEATURE.splash(run); }
  },
  splash(run) {
    const ws = run.ws, end = ws.line[ws.line.length - 1];
    ws.dropState.forEach((d) => {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      Object.assign(d, { x: end.x + Math.sin(end.heading) * 2.5, y: end.y - 1.1, z: end.z + Math.cos(end.heading) * 2.5, vx: Math.cos(a) * s, vy: 3 + Math.random() * 4, vz: Math.sin(a) * s });
    });
  },
  after(run, ctx, dt) {
    const ws = run.ws;
    const sliding = !!ws.stage && (run.phase === 'running' || run.phase === 'done');
    ws.pad.show(sliding && isTouch() && run.phase === 'running');
    ws.hud.show(sliding);
    if (!ws.stage) return;
    const r = run.state.rider || createRider();
    const L = ws.line, s = clamp(r.s, 0, slideLength() - 0.01);
    const at = (q) => { const i = clamp(Math.floor(q), 0, L.length - 2), f = clamp(q - i, 0, 1); const a = L[i], b = L[i + 1]; return new THREE.Vector3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f); };
    const P = at(s), Q = at(s + 1.5);
    const T = Q.clone().sub(P).normalize();
    const R = new THREE.Vector3().crossVectors(T, new THREE.Vector3(0, 1, 0)).normalize();
    const U = new THREE.Vector3().crossVectors(R, T).normalize();
    const th = r.theta, rr = SLIDE.tube - 0.32;
    const off = R.clone().multiplyScalar(Math.sin(th) * rr).addScaledVector(U, -Math.cos(th) * rr);
    const eye = P.clone().add(off).addScaledVector(U, 0.3);
    const ahead = at(s + 5).add(off.clone().multiplyScalar(0.6));
    const up = off.clone().negate().normalize().lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize();
    if (r.done) {
      ws.splashT += dt;
      const end = L[L.length - 1];
      const c = { x: end.x - Math.sin(end.heading) * 3, y: end.y + 1.8, z: end.z - Math.cos(end.heading) * 3 };
      ws.stage.camera(ctx.camera, c, { x: end.x + Math.sin(end.heading) * 4, y: end.y - 1.2, z: end.z + Math.cos(end.heading) * 4 });
    } else ws.stage.camera(ctx.camera, eye, ahead, up);
    // the droplets
    if (ws.splashT > 0) {
      const m = new THREE.Matrix4();
      ws.drops.count = ws.dropState.length;
      ws.dropState.forEach((d, i) => { d.vy -= 9.81 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; ws.drops.setMatrixAt(i, m.makeTranslation(d.x, d.y, d.z)); });
      ws.drops.instanceMatrix.needsUpdate = true;
    }
    const seg = slideAt(r.s);
    const eq = thetaEq(r.v, seg.curve), dev = (r.theta - eq) * Math.sign(seg.curve || 1);
    const line = seg.curve === 0 ? 'straight' : dev > SLIDE.rubFree ? 'too high: braking!' : dev < -SLIDE.joltFree ? 'too low: bumpy' : 'ideal line';
    ws.hud.set(ws.countdown > 0 ? `<b>${Math.ceil(ws.countdown)}</b> … get ready` : r.done ? `<b>Splash!</b> ${(r.t).toFixed(1)} s on the slide` : `<b>${(r.v * 3.6).toFixed(0)}</b> km/h · ${line} · ${Math.round(slideLength() - r.s)} m to go`);
  }
};

// =====================================================================================================================
// 8. Paint a Kirchner
// =====================================================================================================================
const PW = 720, PH = 480, TPL_W = 192, TPL_H = 128;
const GALLERY_KEY = 'slopdavos-kirchner-gallery';
const readGallery = () => { try { return JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]') || []; } catch { return []; } };
const BG = [244, 239, 228];

const KIRCHNER_FEATURE = {
  // (js/missions.js hides the game's own controls while this is true: at the easel; the walk there keeps them)
  ownControls: (run) => !!run.kp?.open,
  setup(run) {
    addStyle(run);
    const game = el('div', 'lm-game');
    game.hidden = true;
    const boxEl = el('div', 'lm-game-box');
    const info = el('div', 'lm-card', '');
    const row = el('div', 'lm-paint');
    const wrap = el('div', 'lm-paint-wrap');
    const canvas = el('canvas');
    canvas.width = PW; canvas.height = PH;
    const dispW = Math.max(240, Math.min(PW, (globalThis.innerWidth || PW) - (isTouch() ? 20 : 140), ((globalThis.innerHeight || PH) - 300) * 1.5));
    canvas.style.width = `${dispW}px`; canvas.style.aspectRatio = `${PW} / ${PH}`; canvas.style.background = `rgb(${BG.join(',')})`;
    const tplImg = el('img'); tplImg.hidden = true; tplImg.alt = '';
    wrap.append(canvas, tplImg);
    const tools = el('div', 'lm-paint-tools');
    const motif = el('img', 'lm-motif'); motif.alt = 'The view'; motif.title = 'The view (your motif)'; motif.hidden = true;
    const kp = run.kp = { motif, game, canvas, ctx: canvas.getContext('2d', { willReadFrequently: false }), info, tplImg, colour: 0, size: 18, open: false, drawing: null, template: null, captureN: 0, shown: false, png: null };
    const swatches = KIRCHNER_PALETTE.map((p, i) => {
      const s = el('button', `lm-swatch${i === 0 ? ' on' : ''}`); s.type = 'button'; s.style.background = p.hex; s.title = p.name;
      run.listen(s, 'pointerdown', (e) => { e.preventDefault(); kp.colour = i; swatches.forEach((x, k) => x.classList.toggle('on', k === i)); });
      return s;
    });
    const sizes = [['S', 6], ['M', 18], ['L', 42]].map(([label, px]) => {
      const b = el('button', `lm-btn sec${px === 18 ? ' on' : ''}`, label); b.type = 'button'; b.style.padding = '6px 12px';
      run.listen(b, 'pointerdown', (e) => { e.preventDefault(); kp.size = px; sizes.forEach((x) => x.classList.toggle('on', x === b)); });
      return b;
    });
    const contour = el('button', 'lm-btn sec', 'Contour'); contour.type = 'button'; contour.style.padding = '6px 12px';
    run.listen(contour, 'pointerdown', (e) => { e.preventDefault(); kp.colour = 7; kp.size = 5; swatches.forEach((x, k) => x.classList.toggle('on', k === 7)); sizes.forEach((x) => x.classList.toggle('on', x.textContent === 'S')); });
    const tpl = el('button', 'lm-btn sec', 'Template'); tpl.type = 'button'; tpl.style.padding = '6px 12px';
    run.listen(tpl, 'pointerdown', (e) => { e.preventDefault(); tplImg.hidden = !tplImg.hidden; tpl.classList.toggle('on', !tplImg.hidden); });
    const clear = el('button', 'lm-btn sec', 'Clear'); clear.type = 'button'; clear.style.padding = '6px 12px';
    run.listen(clear, 'pointerdown', (e) => { e.preventDefault(); kp.ctx.clearRect(0, 0, PW, PH); });
    const done = el('button', 'lm-btn', 'Done'); done.type = 'button';
    run.listen(done, 'pointerdown', (e) => { e.preventDefault(); KIRCHNER_FEATURE.finish(run); });
    const swRow = el('div', 'lm-row'); swRow.style.maxWidth = '100px'; swRow.append(...swatches);
    tools.append(motif, swRow, ...sizes, contour, tpl, clear, done);
    row.append(wrap, tools);
    boxEl.append(info, row);
    game.append(boxEl);
    document.body.append(game);
    run.cleanups.push(() => game.remove());
    // painting: round strokes in the colour, joined
    const at = (e) => canvasPoint(canvas, e, PW, PH);
    run.listen(canvas, 'pointerdown', (e) => {
      if (run.phase !== 'running' || !kp.template) return;
      e.preventDefault(); canvas.setPointerCapture?.(e.pointerId);
      kp.drawing = at(e);
      KIRCHNER_FEATURE.stroke(run, kp.drawing, kp.drawing);
    });
    run.listen(canvas, 'pointermove', (e) => { if (!kp.drawing) return; const p = at(e); KIRCHNER_FEATURE.stroke(run, kp.drawing, p); kp.drawing = p; });
    for (const ev of ['pointerup', 'pointercancel']) run.listen(canvas, ev, () => { kp.drawing = null; });
  },
  stroke(run, a, b) {
    const kp = run.kp, c = kp.ctx;
    c.strokeStyle = KIRCHNER_PALETTE[kp.colour].hex; c.lineWidth = kp.size; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x + 0.01, b.y); c.stroke();
  },
  reset(run) {
    const kp = run.kp;
    kp.open = false; kp.game.hidden = true; kp.template = null; kp.captureN = 0; kp.shown = false; kp.png = null;
    kp.ctx.clearRect(0, 0, PW, PH);
    run.state.paint = null;
    holdWalker(run, false);
  },
  teardown(run) { run.kp.game.hidden = true; },
  key(run, e) { if (run.kp.open && (e.code === 'Space' || e.code === 'Enter')) swallow(e); },
  /** The view as Kirchner's palette: the renderer's picture, posterised; a synthetic valley when it cannot be read */
  capture(run) {
    const kp = run.kp;
    const src = globalThis.__slopdavosBuild?.renderer?.domElement || document.querySelector('#canvas-container canvas');
    const small = document.createElement('canvas'); small.width = TPL_W; small.height = TPL_H;
    const g = small.getContext('2d', { willReadFrequently: true });
    let ok = false;
    try {
      const sw = src.width, sh = src.height, k = Math.min(sw / TPL_W, sh / TPL_H);
      g.drawImage(src, (sw - TPL_W * k) / 2, (sh - TPL_H * k) / 2, TPL_W * k, TPL_H * k, 0, 0, TPL_W, TPL_H);
      const d = g.getImageData(0, 0, TPL_W, TPL_H).data;
      let sum = 0; for (let i = 0; i < d.length; i += 16) sum += d[i] + d[i + 1] + d[i + 2];
      ok = sum / (d.length / 16) > 30;
    } catch { ok = false; }
    if (!ok) {
      // (a valley: sky, mountains, the slopes, the village)
      const sky = g.createLinearGradient(0, 0, 0, TPL_H * 0.45); sky.addColorStop(0, '#3a6fd8'); sky.addColorStop(1, '#9cc4f0');
      g.fillStyle = sky; g.fillRect(0, 0, TPL_W, TPL_H);
      g.fillStyle = '#6b6f8a'; g.beginPath(); g.moveTo(0, 70); g.lineTo(40, 30); g.lineTo(80, 55); g.lineTo(120, 22); g.lineTo(160, 48); g.lineTo(192, 35); g.lineTo(192, 128); g.lineTo(0, 128); g.fill();
      g.fillStyle = '#f0f0f5'; g.beginPath(); g.moveTo(108, 34); g.lineTo(120, 22); g.lineTo(132, 34); g.fill();
      g.fillStyle = '#3f8f4a'; g.beginPath(); g.moveTo(0, 85); g.quadraticCurveTo(96, 60, 192, 80); g.lineTo(192, 128); g.lineTo(0, 128); g.fill();
      g.fillStyle = '#c9542f'; for (let k = 0; k < 7; k++) g.fillRect(20 + k * 24, 98 + (k % 2) * 6, 14, 10);
    }
    kp.motif.src = small.toDataURL('image/jpeg', 0.85); kp.motif.hidden = false;
    const d = g.getImageData(0, 0, TPL_W, TPL_H).data;
    const idx = new Int8Array(TPL_W * TPL_H);
    for (let i = 0; i < idx.length; i++) idx[i] = kirchnerIndex(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    // the template: a mode filter (flat areas), the palette, black where the family changes
    const out = g.createImageData(TPL_W, TPL_H);
    const fam = (v) => KIRCHNER_PALETTE[v].family;
    const flat = new Int8Array(idx.length);
    const cnt = new Uint8Array(8);
    for (let y = 0; y < TPL_H; y++) for (let x = 0; x < TPL_W; x++) {
      cnt.fill(0);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = clamp(x + i, 0, TPL_W - 1), yy = clamp(y + j, 0, TPL_H - 1); cnt[idx[yy * TPL_W + xx]]++; }
      let b = 0; for (let v = 1; v < 8; v++) if (cnt[v] > cnt[b]) b = v;
      flat[y * TPL_W + x] = b;
    }
    const PAL = KIRCHNER_PALETTE.map((p) => [parseInt(p.hex.slice(1, 3), 16), parseInt(p.hex.slice(3, 5), 16), parseInt(p.hex.slice(5, 7), 16)]);
    for (let y = 0; y < TPL_H; y++) for (let x = 0; x < TPL_W; x++) {
      const i = y * TPL_W + x, v = flat[i];
      const edge = (x + 1 < TPL_W && fam(flat[i + 1]) !== fam(v)) || (y + 1 < TPL_H && fam(flat[i + TPL_W]) !== fam(v));
      const c = edge ? PAL[7] : PAL[v];
      out.data[i * 4] = c[0]; out.data[i * 4 + 1] = c[1]; out.data[i * 4 + 2] = c[2]; out.data[i * 4 + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    kp.tplImg.src = small.toDataURL('image/png');
    const [cols, rows] = KIRCHNER.grid;
    const cells = gridMode(flat, TPL_W, TPL_H, cols, rows, { ignore: 0 });
    kp.template = { cells, edges: templateEdges(cells, cols, rows), fromView: ok };
    run.state.paint = { t: 0, result: null };
  },
  /** The painting on the grid: its colours (the background is empty), black contours */
  analyse(run) {
    const kp = run.kp;
    const w = 96, h = 64;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(kp.canvas, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const img = new Int8Array(w * h);
    for (let i = 0; i < img.length; i++) img[i] = d[i * 4 + 3] < 60 ? -1 : nearestPalette(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    const [cols, rows] = KIRCHNER.grid;
    const cells = gridMode(img, w, h, cols, rows);
    const edges = new Uint8Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      let black = 0, n = 0;
      for (let y = Math.floor(cy * h / rows); y < Math.floor((cy + 1) * h / rows); y++) for (let x = Math.floor(cx * w / cols); x < Math.floor((cx + 1) * w / cols); x++) { n++; if (img[y * w + x] === 7) black++; }
      edges[cy * cols + cx] = black / Math.max(1, n) > 0.06 ? 1 : 0;
    }
    return { cells, edges };
  },
  finish(run) {
    const kp = run.kp, p = run.state.paint;
    if (!p || p.result || run.phase !== 'running') return;
    p.result = scorePainting(kp.template, KIRCHNER_FEATURE.analyse(run));
    // the picture on its primed canvas, saved; a thumbnail in the gallery (six at most)
    const out = document.createElement('canvas'); out.width = PW; out.height = PH;
    const g = out.getContext('2d');
    g.fillStyle = `rgb(${BG.join(',')})`; g.fillRect(0, 0, PW, PH); g.drawImage(kp.canvas, 0, 0);
    g.font = 'italic 600 16px Georgia, serif'; g.fillStyle = 'rgba(20,16,20,.7)'; g.textAlign = 'right';
    g.fillText(`Davos, ${new Date().toLocaleDateString('de-CH')}`, PW - 14, PH - 12);
    kp.png = out.toDataURL('image/png');
    try {
      const th = document.createElement('canvas'); th.width = 240; th.height = 160;
      th.getContext('2d').drawImage(out, 0, 0, 240, 160);
      const gal = readGallery();
      gal.unshift({ at: Date.now(), points: p.result.points, img: th.toDataURL('image/jpeg', 0.7) });
      localStorage.setItem(GALLERY_KEY, JSON.stringify(gal.slice(0, 6)));
    } catch { /* (storage full or off: no gallery) */ }
    kp.open = false; kp.game.hidden = true; holdWalker(run, false);
  },
  update(run, ctx, dt) {
    const kp = run.kp;
    const painting = run.def.objectives[run.index]?.id === 'paint';
    if (painting && !kp.open && live(run) && !run.state.paint?.result) { kp.open = true; kp.captureN = 0; holdWalker(run, true); }
    if (!kp.open) return;
    const p = run.state.paint;
    if (p && !p.result && run.phase === 'running') { p.t += dt; if (p.t >= KIRCHNER.length) KIRCHNER_FEATURE.finish(run); }
  },
  after(run, ctx, dt, cm) {
    const kp = run.kp;
    // the easel's view (the template is taken from it): from the forecourt, a little raised, over the valley
    if (kp.open) {
      const e = KIRCHNER.easel, h = KIRCHNER.view.heading;
      const y = surfaceHeight(e.x, e.z) + (KIRCHNER.view.height ?? 7);
      ctx.camera.position.set(e.x, y, e.z);
      ctx.camera.up.set(0, 1, 0);
      ctx.camera.lookAt(e.x + Math.sin(h) * 100, y + Math.tan(KIRCHNER.view.pitch) * 100, e.z + Math.cos(h) * 100);
      ctx.camera.updateMatrixWorld();
      if (!kp.template) {
        kp.captureN++;
        // (a few frames for the view to settle, then the picture right after this frame is drawn)
        if (kp.captureN === 6) queueMicrotask(() => { if (!run.disposed && kp.open) { KIRCHNER_FEATURE.capture(run); kp.game.hidden = false; } });
      }
      const p = run.state.paint;
      if (p) kp.info.innerHTML = `<b>${Math.max(0, Math.ceil(KIRCHNER.length - p.t))} s</b> · paint the view in Kirchner's colours · "Template" shows the posterised view${kp.template && !kp.template.fromView ? ' (a sketch: the view could not be read)' : ''}`;
    }
    // the finish dialog: the picture, its download, the gallery
    if (run.phase === 'done' && kp.png && !kp.shown && run.ui.overlay && !run.ui.overlay.hidden) {
      const panel = run.ui.overlay.querySelector('.mission-dialog');
      const buttons = panel?.querySelector('.mission-dialog-buttons');
      if (panel && buttons) {
        kp.shown = true;
        const fig = el('div', 'lm-result');
        const img = el('img'); img.src = kp.png; img.alt = 'Your painting';
        const a = el('a', 'mission-btn mission-btn-secondary', 'Download PNG');
        a.href = kp.png; a.download = `kirchner-davos-${new Date().toISOString().slice(0, 10)}.png`;
        const gal = el('div', 'lm-gallery');
        for (const it of readGallery().slice(1)) { const t = el('img'); t.src = it.img; t.title = `${it.points} pts`; gal.append(t); }
        fig.append(img, a);
        if (gal.childElementCount) fig.append(el('p', 'mission-dialog-note', 'Your earlier pictures'), gal);
        panel.insertBefore(fig, buttons);
      }
    }
  }
};

// (the ibex hunt: Shift up — the held breath goes)
const IBEX_SETUP = IBEX_FEATURE.setup;
IBEX_FEATURE.setup = (run) => { IBEX_SETUP(run); bindKeyUps(run, (e) => { if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') run.ih.holding = false; }); };

export const LOCAL_FEATURES = {
  beerVan: BEER_FEATURE,
  gipfeli: GIPFELI_FEATURE,
  raclette: RACLETTE_FEATURE,
  ibexHunt: IBEX_FEATURE,
  squirrels: SQUIRREL_FEATURE,
  tennis: TENNIS_FEATURE,
  waterslide: WATERSLIDE_FEATURE,
  kirchner: KIRCHNER_FEATURE
};
