import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { loadPersonModel } from './person-models.js';
import { loadPersonClips } from './person-clips.js';
import { surfaceHeight } from './terrain.js';
import {
  SHOTS, createShots, shotsStep, shotsAction, shotsGauge, shotsSway, shotsScore,
  FLAEMMLI, createFlaemmli, flaemmliStep, flaemmliPress, flaemmliRelease, flaemmliGauge, flaemmliSway, flaemmliScore,
  PIZZA_ORDERS, PIZZA_STOPS, TOPPINGS, createPizzaShop, pizzaShopStep, pizzaPick, pizzaHeatStep, pizzaCarryStep, pizzaScore,
  popText, barRoundLine, pizzaLine, pizzaDriveLine, deliveryPopText
} from './missions-data-gastro.js';
import { el } from './dom.js';

// js/missions-gastro.js
// The runtime of the three gastro missions (js/missions-data-gastro.js has their definitions and the games' pure
// logic): js/missions.js merges GASTRO_FEATURES into its features.
//  - shots: the Ex Bar's bar room, built when entered high above the door (like js/missions-sport.js's pub): unlit
//    materials with the shading baked into vertex colours, the glass and its flame at the middle of the view, one gauge
//    and one button in the HUD; the camera rolls and strays with each drink.
//  - flaemmli: the Rot Liechtli's bar room, the same way, with the espresso cup, the sugar, the Williams, the shot glass
//    and a hand on the counter; the button is held for the sugar, the sip and the pour, tapped for the rest.
//  - pizzaRun: Pizza Heaven's kitchen, the same way, with the pizza on a small canvas and the toppings as buttons; then
//    the van with a roof sign, the box in the player's arms and a heat bar (the carrying: js/missions-data-local.js).
// Everything is built on demand and disposed with the run. The games run on the mission's frame time (dt).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const LIFT = 410; // m: the rooms float this high above their door (out of sight of the town)
const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
const setText = (node, t) => { if (node.textContent !== t) node.textContent = t; };
const gameKey = (code) => code === 'Space' || code === 'Enter' || code.startsWith('Key') || code.startsWith('Digit') || code.startsWith('Numpad') || code.startsWith('Arrow');

const STYLE = `
.gs-hud{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:40;display:flex;flex-direction:column;align-items:center;gap:8px;width:min(520px,calc(100vw - 16px));font-family:Inter,system-ui,sans-serif;color:#fff;pointer-events:none}
.gs-hud[hidden],.gs-veil[hidden]{display:none!important}
.gs-card{width:100%;box-sizing:border-box;background:rgba(10,12,20,.8);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:9px 12px;font-size:13px;font-weight:600;text-align:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.gs-pop{min-height:28px;font:900 22px Inter,system-ui,sans-serif;color:#ffe14f;text-shadow:0 2px 12px rgba(0,0,0,.7);text-align:center}
.gs-pop.bad{color:#ff7a7a}
.gs-gauge{position:relative;height:18px;margin-top:7px;border-radius:9px;background:rgba(255,255,255,.14);overflow:hidden}
.gs-gauge[data-off]{visibility:hidden}
.gs-zone{position:absolute;top:0;bottom:0;background:#3fbf6b}
.gs-needle{position:absolute;top:-2px;bottom:-2px;width:5px;margin-left:-2px;background:#fff;box-shadow:0 0 8px #fff}
.gs-act{pointer-events:auto;touch-action:manipulation;border:0;border-radius:999px;min-height:56px;min-width:210px;padding:12px 26px;font:800 18px Inter,system-ui,sans-serif;color:#fff;background:linear-gradient(180deg,#ef4657,#b3142a);box-shadow:0 6px 18px rgba(179,20,42,.45)}
.gs-act:active{transform:scale(.97);filter:brightness(1.2)}
.gs-act[disabled]{opacity:.35}
.gs-gauge.in .gs-zone{background:#57e08a;box-shadow:0 0 12px rgba(87,224,138,.75)}
.gs-caramel{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:11px;font-weight:700;color:#f0c987}
.gs-caramel[hidden]{display:none}
.gs-caramel i{flex:1;height:10px;border-radius:5px;background:rgba(255,255,255,.14);overflow:hidden}
.gs-caramel span{display:block;height:100%;transform-origin:left;background:linear-gradient(90deg,#f4ecd8,#e0a64a 60%,#a8611c)}
.gs-steps{display:flex;justify-content:center;gap:3px;margin-bottom:7px}
.gs-steps[hidden]{display:none}
.gs-step{display:flex;align-items:center;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.08);font-size:10.5px;font-weight:700;color:rgba(255,255,255,.5);white-space:nowrap;transition:background .2s,color .2s}
.gs-step.done{color:#8fe3ad}
.gs-step.done.bad{color:#ff9d9d}
.gs-step.on{background:#ffe14f;color:#201a00}
.gs-act.held{filter:brightness(1.35);transform:scale(.97)}
.gs-veil{position:fixed;inset:0;z-index:37;pointer-events:none;background:radial-gradient(circle at 50% 45%,rgba(120,10,20,0) 42%,rgba(90,6,16,.8) 100%)}
.gs-pizza{width:min(560px,calc(100vw - 12px))}
.gs-ticket{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:5px}
.gs-chip{padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.12);font-size:12px;font-weight:700}
.gs-chip.next{background:#ffe14f;color:#201a00}
.gs-chip.done{opacity:.45;text-decoration:line-through}
.gs-board{display:flex;gap:8px;align-items:center;justify-content:center;width:100%}
.gs-board canvas{width:clamp(96px,22vh,170px);aspect-ratio:1;border-radius:50%;flex:none}
.gs-tops{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;flex:1;min-width:0}
.gs-top{pointer-events:auto;touch-action:manipulation;border:1px solid rgba(255,255,255,.2);border-radius:11px;min-height:50px;padding:3px 2px;background:rgba(10,12,20,.82);color:#fff;font:700 11px Inter,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;gap:2px;overflow:hidden}
.gs-top:active{filter:brightness(1.5)}
.gs-top i{width:14px;height:14px;border-radius:50%;display:block}
.gs-top kbd{font:700 10px Inter,system-ui,sans-serif;opacity:.6}
.gs-heat{height:13px;margin-top:6px;border-radius:7px;background:rgba(255,255,255,.14);overflow:hidden}
.gs-heat span{display:block;height:100%;transform-origin:left;background:linear-gradient(90deg,#3f8fd6,#f2b632 45%,#e8391f)}
body.gs-indoor .gta-prompt,body.gs-indoor .touch-use,body.gs-indoor .mission-prompt,body.gs-indoor #touch-controls,body.gs-indoor .hud-bottom-left,body.gs-indoor .hud-bottom-right{display:none!important}
body.gs-indoor:not(.touch-enabled) .gs-hud{bottom:var(--keybar-clear,54px)}
@media (hover:none){.gs-top kbd{display:none}}
@media (max-width:560px){.gs-step:not(.on){padding:0;width:8px;height:8px;align-self:center;background:currentColor}.gs-step:not(.on) b{display:none}}
@media (max-width:520px){.gs-board{flex-direction:column;gap:6px}.gs-board canvas{width:clamp(84px,14vh,120px)}.gs-tops{width:100%;flex:none}.gs-top{font-size:10.5px}}
`;
function addStyle(run) {
  const s = el('style');
  s.textContent = STYLE;
  document.head.append(s);
  run.cleanups.push(() => s.remove());
}

// --- Geometry ------------------------------------------------------------------------------------------------------
/** A geometry in one colour (vertex colours), the light baked in from above */
function paint(g, col) {
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.normal, count = g.attributes.position.count, c = new THREE.Color(col), out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const k = 0.62 + 0.38 * Math.max(0, n.getY(i)) + 0.12 * Math.max(0, n.getZ(i)) - 0.2 * Math.max(0, -n.getY(i));
    out[i * 3] = c.r * k; out[i * 3 + 1] = c.g * k; out[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d, x, y, z, col) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return paint(g, col); };
const cyl = (r0, r1, h, x, y, z, col, seg = 12) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); return paint(g, col); };
function meshOf(geometry, material) { const m = new THREE.Mesh(geometry, material); m.castShadow = m.receiveShadow = false; m.frustumCulled = false; return m; }
const solid = (parts) => meshOf(mergeGeometries(parts), new THREE.MeshBasicNodeMaterial({ vertexColors: true }));
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
function textPlane(text, w, h, { fg = '#fff', bg = '#000', font = '900 110px Inter, Arial, sans-serif' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = Math.max(32, Math.round(512 * (h / w)));
  const c = canvas.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, canvas.width, canvas.height);
  c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = fg;
  c.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * 0.92);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return meshOf(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicNodeMaterial({ map: tex }));
}
/** A soft glow on a plane (a small texture, tinted by the material's colour): round, or `rise` a light from below */
function glow(w, h, color, opacity, rise = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d'), r = rise ? c.createLinearGradient(0, 64, 0, 0) : c.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, '#fff'); r.addColorStop(0.35, '#777'); r.addColorStop(1, '#000');
  c.fillStyle = r; c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return meshOf(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicNodeMaterial({ color, map: tex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
}
/** A glow lying flat (the light a lamp or a flame throws on the counter) */
function pool(size, color, opacity) { const m = glow(size, size, color, opacity); m.rotation.x = -Math.PI / 2; return m; }
/** A plane with a picture drawn on a canvas: draw(c, w, h) */
function drawnPlane(w, h, px, draw, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = Math.max(16, Math.round(px * (h / w)));
  draw(canvas.getContext('2d'), canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return meshOf(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicNodeMaterial({ map: tex, ...opts }));
}
/** Boards with their grain, the joints between them and the lamps' light in the middle (a counter's top, a panelled wall) */
function drawWood(c, w, h, { base, dark, light, boards = 4, along = true, shine = 0.5, seed = 3 }) {
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  const n = boards, size = (along ? h : w) / n, len = along ? w : h;
  for (let b = 0; b < n; b++) {
    c.globalAlpha = 0.1 + rnd() * 0.16; c.fillStyle = rnd() < 0.5 ? dark : light;
    if (along) c.fillRect(0, b * size, w, size); else c.fillRect(b * size, 0, size, h);
    for (let i = 0; i < 26; i++) { // the grain: long thin streaks
      const at = b * size + rnd() * size, from = rnd() * len, run = len * (0.15 + rnd() * 0.5);
      c.globalAlpha = 0.05 + rnd() * 0.12; c.fillStyle = rnd() < 0.6 ? dark : light;
      if (along) c.fillRect(from, at, run, 1 + rnd() * 1.5); else c.fillRect(at, from, 1 + rnd() * 1.5, run);
    }
    c.globalAlpha = 0.55; c.fillStyle = dark;
    if (along) c.fillRect(0, b * size, w, 2); else c.fillRect(b * size, 0, 2, h);
  }
  c.globalAlpha = 1;
  if (shine > 0) {
    const g = c.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, w * 0.42);
    g.addColorStop(0, `rgba(255,214,160,${shine * 0.3})`); g.addColorStop(1, 'rgba(255,214,160,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const v = c.createLinearGradient(0, 0, w, 0);
    v.addColorStop(0, 'rgba(0,0,0,.5)'); v.addColorStop(0.3, 'rgba(0,0,0,0)'); v.addColorStop(0.7, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
  }
}

/** People standing about: the instanced crowd the pubs of js/missions-sport.js use, self-lit by its colour. A spot with
 *  `figure` (an id of js/player-figure.js FIGURES: the people the player chooses from) is one of those once its model
 *  is loaded, standing as they do (the mocap idle); until then, and without one, the lofted figure. */
function makeCrowd(spots, group) {
  const crowd = new PersonCrowd(spots.length, { farDistance: 40, castShadow: false });
  for (const m of crowd.meshes) { m.receiveShadow = false; m.material.emissiveNode = m.material.colorNode; group.add(m); }
  const people = spots.map((s, i) => {
    const rig = new PersonRig({ seed: ((i + 3) * 0.6180339) % 1, female: !!s.female, hair: (i * 0.37) % 1, girth: 1 + (i % 3) * 0.08, scale: 1, ...s.look });
    rig.reset(s.x, s.z, s.yaw, () => 0);
    return { rig, own: null, ...s };
  });
  const c = { crowd, people, figures: [] };
  for (const id of new Set(spots.map((s) => s.figure).filter(Boolean))) {
    Promise.all([loadPersonModel(id), loadPersonClips().catch(() => null)]).then(([model, clips]) => {
      let top = group;
      while (top.parent) top = top.parent;
      if (!top.isScene) return; // (the room is gone)
      const mine = people.filter((p) => p.figure === id);
      // (its own copy of the geometry: the room's disposal frees it, the cached one stays the player's)
      const own = new PersonCrowd(mine.length, { farDistance: Infinity, castShadow: false, dress: { model: { ...model, geometry: model.geometry.clone() } } });
      for (const m of own.meshes) { m.receiveShadow = false; m.material.emissiveNode = m.material.colorNode; group.add(m); }
      for (const p of mine) {
        p.own = own;
        p.rig.setBuild({ scale: model.scale, female: model.female });
        if (clips) p.rig.setClips(clips.idle(model.female));
      }
      c.figures.push(own);
    }).catch((e) => console.warn('[missions-gastro] figure', id, e));
  }
  return c;
}
function poseCrowd(c, dt, pose = null) {
  c.crowd.begin();
  for (const f of c.figures) f.begin();
  for (const p of c.people) { p.rig.update(dt, p.x, p.z, p.yaw, () => 0); pose?.(p); (p.own || c.crowd).add(p.rig, 0); }
  c.crowd.end();
  for (const f of c.figures) f.end();
}

// --- A room high above the door --------------------------------------------------------------------------------------
class Room {
  constructor(run, door, build) {
    this.run = run;
    this.origin = new THREE.Vector3(door.x, surfaceHeight(door.x, door.z) + LIFT, door.z);
    this.group = new THREE.Group();
    this.group.name = 'MissionInterior';
    this.group.position.copy(this.origin);
    this.group.userData.terrain = 'absolute';
    run.group.add(this.group);
    build(this.group);
    this.group.updateMatrixWorld(true);
    this.fade = el('div');
    this.fade.style.cssText = 'position:fixed;inset:0;background:#000;z-index:39;pointer-events:none;opacity:1;transition:opacity .45s';
    document.body.append(this.fade);
    requestAnimationFrame(() => requestAnimationFrame(() => { if (this.fade) this.fade.style.opacity = '0'; }));
    setTimeout(() => { this.fade?.remove(); this.fade = null; }, 900);
    document.body.classList.add('gs-indoor');
    const cm = run.hooks.controllerManager;
    this.hadDriver = 'personDriver' in cm;
    this.prevDriver = cm.personDriver;
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; }; // (the walker waits at the door)
    this.snow = run.scene.getObjectByName('snowfall');
  }
  camera(cam, pos, look, roll = 0) {
    const o = this.origin;
    cam.position.set(o.x + pos.x, o.y + pos.y, o.z + pos.z);
    cam.lookAt(o.x + look.x, o.y + look.y, o.z + look.z);
    if (roll) cam.rotateZ(roll);
    cam.updateMatrixWorld();
    if (this.snow) this.snow.visible = false;
  }
  dispose() {
    if (!this.group) return;
    this.group.removeFromParent();
    disposeTree(this.group);
    this.group = null;
    this.fade?.remove(); this.fade = null;
    document.body.classList.remove('gs-indoor');
    const cm = this.run.hooks.controllerManager;
    if (this.hadDriver) cm.personDriver = this.prevDriver ?? null; else delete cm.personDriver;
    if (this.snow) this.snow.visible = true;
    this.run.hooks.cameraSystem.resetForTeleport?.();
  }
}

/** A small sound on the city's mix (silent when off): 'pock' | 'good' | 'bad' | 'fwoosh' */
function blip(run, kind = 'pock') {
  const a = run.hooks.audio;
  if (!a || !a.enabled || !a.context || a.context.state !== 'running' || !a.mix) return;
  const ctx = a.context, t = ctx.currentTime;
  const g = ctx.createGain();
  g.connect(a.mix);
  if (kind === 'fwoosh') {
    const n = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    g.gain.value = 0.4;
    src.connect(f).connect(g); src.start(t);
    return;
  }
  const o = ctx.createOscillator(); o.type = kind === 'good' ? 'triangle' : 'sine';
  o.frequency.setValueAtTime(kind === 'good' ? 880 : kind === 'bad' ? 180 : 520, t);
  if (kind === 'good') o.frequency.setValueAtTime(1320, t + 0.08);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'good' ? 0.22 : 0.09));
  o.connect(g); o.start(t); o.stop(t + 0.25);
}
/** A soft rush while something is poured (`kind` 'sugar' | 'pour', null: quiet); `st` keeps what sounds */
function holdNoise(run, st, kind) {
  if (st.noiseKind === kind) return;
  st.noiseKind = kind;
  const a = run.hooks.audio, ctx = a?.context;
  if (st.noise) {
    try { st.noise.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03); st.noise.src.stop(ctx.currentTime + 0.2); } catch { /* (the context is gone) */ }
    st.noise = null;
  }
  if (!kind || !a || !a.enabled || !ctx || ctx.state !== 'running' || !a.mix) return;
  const n = ctx.sampleRate, buf = ctx.createBuffer(1, n, n), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter();
  if (kind === 'sugar') { f.type = 'highpass'; f.frequency.value = 3800; } else { f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 1.4; }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.setTargetAtTime(kind === 'sugar' ? 0.07 : 0.2, ctx.currentTime, 0.04);
  src.connect(f).connect(g).connect(a.mix); src.start();
  st.noise = { src, g };
}
function flashPop(node, last) {
  node.textContent = popText(last); // (with its points after two spaces, in both languages)
  node.className = `gs-pop${last.good ? '' : ' bad'}`;
  clearTimeout(node._t);
  node._t = setTimeout(() => { node.textContent = ''; }, 1500);
}

// =====================================================================================================================
// The bar rooms: the Ex Bar (shots) and the Rot Liechtli (Flämmli)
// =====================================================================================================================
const COUNTER_Y = 1.08, GLASS_H = 0.075;
const WOOD = 0x3c2214, DARK = 0x3a2416;
const LOOKS = {
  exbar: { wall: 0x1d2a4a, beam: 0x10141f, name: 'EX BAR', fg: '#59c8ff', bg: '#070b16', lamp: 0x3aa8ff, halo: 0x2a7cff, top: { base: '#2b2f3a', dark: '#11131a', light: '#59607a' }, lampAt: { x: 1.15, y: 2.33, z: -0.9 } },
  // (the pub's name is its lamp: the red light hangs low over the counter, in the view from the stool)
  rot: { wall: 0x7a1a1f, beam: DARK, name: 'ROT LIECHTLI', fg: '#ff4a55', bg: '#190a08', lamp: 0xff2c36, halo: 0xff2030, top: { base: '#5a2f1c', dark: '#24110a', light: '#9a6238' }, lampAt: { x: 0.95, y: 1.74, z: -0.72 }, decor: 'rot' },
  // (the Berghotel Schatzalp's Stübli: the Fondue Night's Flämmli, js/missions-fondue.js)
  schatzalp: { wall: 0x8a5a32, beam: 0x4a2c16, name: 'SCHATZALP', fg: '#ffe3a8', bg: '#2a1608', lamp: 0xffb45a, halo: 0xffa040, top: { base: '#7a5230', dark: '#3a2212', light: '#c79a62' }, lampAt: { x: 1.05, y: 1.8, z: -0.72 }, decor: 'stuebli' }
};
const BAR = { W: 7, D: 6, H: 2.9 };
/** A bottle on the back bar: body, shoulder, neck, cap and a paper label (i: which one of the row) */
function bottleParts(x, y, z, i) {
  const cols = [0x2e6b2a, 0x7a3b12, 0xd8c47a, 0x3a1a0a, 0xa8d0e0, 0x5a1020, 0x1f3a5a, 0xc98a2a];
  const col = cols[(i * 5 + (i >> 2)) % cols.length], r = 0.03 + ((i * 7) % 5) * 0.003, h = 0.15 + ((i * 3) % 4) * 0.022, neck = 0.05 + ((i * 5) % 3) * 0.015;
  const square = i % 7 === 3 ? 4 : 10;
  return [
    cyl(r, r, h, x, y + h / 2, z, col, square), cyl(0.011, r, 0.035, x, y + h + 0.0175, z, col, square), cyl(0.011, 0.011, neck, x, y + h + 0.035 + neck / 2, z, col, 8),
    cyl(0.013, 0.013, 0.014, x, y + h + 0.035 + neck + 0.007, z, i % 3 ? 0x1a1a1a : 0xc9a13a, 8),
    cyl(r + 0.0012, r + 0.0012, h * 0.42, x, y + h * 0.45, z, [0xf0e6cc, 0xe8d9a0, 0x1c1c1c, 0xd9d2c0][i % 4], square)
  ];
}
/** The room, the counter, the back bar with its bottles, the name and the lamp: `look` from LOOKS */
function buildBar(group, parts, look, logo = null) {
  const { W, D, H } = BAR, hw = W / 2, hd = D / 2, WALL = look.wall;
  const room = [
    box(W, 0.1, D, 0, -0.05, 0, 0x2a1810),
    box(W, H, 0.2, 0, H / 2, -hd - 0.1, WALL), box(W, H, 0.2, 0, H / 2, hd + 0.1, WALL),
    box(0.2, H, D, -hw - 0.1, H / 2, 0, WALL), box(0.2, H, D, hw + 0.1, H / 2, 0, WALL),
    box(W, 0.2, D, 0, H + 0.1, 0, 0x180c08),
    ...[-2, 0, 2].map((z) => box(W, 0.2, 0.18, 0, H - 0.1, z, look.beam)),
    // the counter across the room with its panelled front and a brass rail, and the back bar behind the landlord
    box(5.2, COUNTER_Y - 0.05, 0.7, -0.3, (COUNTER_Y - 0.05) / 2, -0.25, WOOD), box(5.3, 0.05, 0.8, -0.3, COUNTER_Y - 0.025, -0.25, 0x5a3320),
    ...[-2.4, -1.35, -0.3, 0.75, 1.8].map((x) => box(0.9, 0.7, 0.02, x, 0.5, 0.11, 0x4a2a18)),
    (() => { const g = new THREE.CylinderGeometry(0.018, 0.018, 5.1, 8); g.rotateZ(Math.PI / 2); g.translate(-0.3, 0.22, 0.2); return paint(g, 0xc9a13a); })(),
    box(5.2, 2.3, 0.3, -0.3, 1.15, -hd + 0.2, DARK), box(5, 0.03, 0.3, -0.3, 1.25, -hd + 0.42, 0x7a5230), box(5, 0.03, 0.3, -0.3, 1.7, -hd + 0.42, 0x7a5230),
    box(5, 0.035, 0.012, -0.3, 1.252, -hd + 0.572, 0xb08a4a), box(5, 0.035, 0.012, -0.3, 1.702, -hd + 0.572, 0xb08a4a),
    // a till and a stack of saucers at the back of the counter
    box(0.3, 0.2, 0.26, -2.2, 1.365, -hd + 0.45, 0x26262a), box(0.24, 0.1, 0.02, -2.2, 1.4, -hd + 0.585, 0x9fd6b8),
    ...[0, 1, 2, 3, 4].map((i) => cyl(0.06, 0.05, 0.007, 1.95, COUNTER_Y + 0.004 + i * 0.008, -0.42, 0xf4f1ea, 16)),
    cyl(0.03, 0.025, 0.05, 1.95, COUNTER_Y + 0.066, -0.42, 0xf7f4ee, 14)
  ];
  group.add(solid(room));
  // the counter's top: boards along the bar, the lamps' light on them
  const top = drawnPlane(5.3, 0.8, 1024, (c, w, h) => drawWood(c, w, h, { ...look.top, boards: 4, shine: 0.6 }));
  top.rotation.x = -Math.PI / 2;
  top.position.set(-0.3, COUNTER_Y + 0.0012, -0.25);
  group.add(top);
  // the bottles: two shelves, lit from below
  const bottles = [];
  for (let i = 0; i < 44; i++) {
    const shelf = i % 2, x = -2.0 + (i >> 1) * 0.2 + (shelf ? 0.05 : 0);
    if (shelf === 0 && x < -1.9) continue; // (the till stands there)
    bottles.push(...bottleParts(x, 1.265 + shelf * 0.45, -hd + 0.44, i));
  }
  group.add(solid(bottles));
  for (const y of [1.265, 1.715]) {
    const back = glow(5, 0.4, look.halo, 0.42, true);
    back.position.set(-0.3, y + 0.2, -hd + 0.356);
    group.add(back);
  }
  // the name over the back bar and the lamp on its cord, its light on the counter
  const sign = textPlane(look.name, 2.4, 0.36, { bg: look.bg, fg: look.fg });
  sign.position.set(-0.3, 2.42, -hd + 0.36);
  group.add(sign);
  const L = look.lampAt;
  group.add(solid([cyl(0.05, 0.15, 0.13, L.x, L.y, L.z, look.lamp, 14), cyl(0.02, 0.05, 0.03, L.x, L.y + 0.08, L.z, 0x2a2a2a, 10), box(0.012, H - L.y - 0.09, 0.012, L.x, (H + L.y + 0.09) / 2, L.z, 0x111111)]));
  const bulb = meshOf(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicNodeMaterial({ color: 0xfff0e0 }));
  bulb.position.set(L.x, L.y - 0.06, L.z);
  group.add(bulb);
  const halo = glow(1.1, 1.1, look.halo, 0.3);
  halo.position.set(L.x, L.y - 0.03, L.z + 0.02);
  group.add(halo);
  parts.halo = halo;
  const lit = pool(1.5, look.halo, 0.22);
  lit.position.set(L.x, COUNTER_Y + 0.003, Math.max(L.z, -0.45));
  group.add(lit);
  if (look.decor === 'rot') decorRot(group, look);
  else if (look.decor === 'stuebli') decorStuebli(group, look, logo, parts);
}
/** The Rot Liechtli: red velvet in folds along the walls, a slate with the house's drink, a string of small red lights */
function decorRot(group, look) {
  const { W, D, H } = BAR, hw = W / 2, hd = D / 2, folds = [];
  for (let i = 0; i < 40; i++) {
    const z = -hd + 0.08 + i * 0.15, col = i % 2 ? 0x8f2026 : 0x5c1217;
    folds.push(box(0.07, H - 0.2, 0.09, -hw + 0.035, H / 2 - 0.1, z, col), box(0.07, H - 0.2, 0.09, hw - 0.035, H / 2 - 0.1, z, col));
  }
  for (let i = 0; i < 8; i++) folds.push(box(0.09, H - 0.2, 0.07, 2.42 + i * 0.15, H / 2 - 0.1, -hd + 0.035, i % 2 ? 0x8f2026 : 0x5c1217));
  folds.push(box(W, 0.14, 0.12, 0, H - 0.27, -hd + 0.06, 0x3a0c10), box(0.12, 0.14, D, -hw + 0.06, H - 0.27, 0, 0x3a0c10), box(0.12, 0.14, D, hw - 0.06, H - 0.27, 0, 0x3a0c10));
  group.add(solid(folds));
  // the slate on the back bar's upper shelf
  const slate = drawnPlane(0.5, 0.36, 512, (c, w, h) => {
    c.fillStyle = '#16181a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8a5a32'; c.lineWidth = 22; c.strokeRect(0, 0, w, h);
    c.fillStyle = '#f4efe2'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '900 92px Georgia, serif'; c.fillText('Flämmli', w / 2, h * 0.34);
    c.font = '700 44px Georgia, serif'; c.fillStyle = '#ff9aa0'; c.fillText('Espresso · Zucker', w / 2, h * 0.6);
    c.fillText('Williams · Feuer', w / 2, h * 0.78);
  });
  slate.position.set(2.05, 1.92, -hd + 0.6);
  slate.rotation.x = -0.14;
  group.add(slate);
  // small red lights along the upper shelf's edge
  const dots = [], halos = new THREE.Group();
  for (let i = 0; i < 17; i++) {
    const x = -2.7 + i * 0.3;
    dots.push(cyl(0.012, 0.012, 0.016, x, 1.672, -hd + 0.585, i % 2 ? 0xff5a4a : 0xffb060, 6));
    const h = glow(0.16, 0.16, i % 2 ? look.halo : 0xffa040, 0.3);
    h.position.set(x, 1.672, -hd + 0.6);
    halos.add(h);
  }
  group.add(solid(dots), halos);
}
/** The Schatzalp's Stübli: Arve panelling, a window on the night, a candle; the camp's logo on a pennant and a table tent */
function decorStuebli(group, look, logo, parts) {
  const { W, D, H } = BAR, hw = W / 2, hd = D / 2;
  const panel = (w, x, z, ry) => {
    const m = drawnPlane(w, H, 1024, (c, cw, ch) => {
      drawWood(c, cw, ch, { base: '#9a6a3c', dark: '#4a2c14', light: '#d2a468', boards: Math.round(w / 0.28), along: false, shine: 0, seed: Math.round(w * 10 + x) });
      c.fillStyle = 'rgba(40,20,8,.55)'; c.fillRect(0, ch * 0.62, cw, ch * 0.02); // (the dado rail's shadow)
      const g = c.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)');
      c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    });
    m.position.set(x, H / 2, z);
    m.rotation.y = ry;
    group.add(m);
  };
  panel(D, -hw + 0.004, 0, Math.PI / 2);
  panel(D, hw - 0.004, 0, -Math.PI / 2);
  panel(W, 0, -hd + 0.004, 0);
  // a window beside the back bar: the valley's lights under the Jakobshorn at night, snow on the bars
  const view = drawnPlane(0.95, 0.95, 512, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a1230'); sky.addColorStop(1, '#27406e');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) c.fillRect((i * 97) % w, (i * 53) % (h * 0.5), 2, 2);
    c.fillStyle = '#c9d6ea'; c.beginPath(); c.moveTo(0, h * 0.62);
    for (const [x, y] of [[0.18, 0.4], [0.3, 0.5], [0.46, 0.3], [0.6, 0.47], [0.78, 0.36], [1, 0.55]]) c.lineTo(x * w, y * h);
    c.lineTo(w, h); c.lineTo(0, h); c.fill();
    c.fillStyle = '#16233f'; c.fillRect(0, h * 0.74, w, h * 0.26);
    for (let i = 0; i < 46; i++) { c.fillStyle = i % 3 ? '#ffd27a' : '#fff2c8'; c.fillRect((i * 71) % w, h * 0.78 + ((i * 37) % (h * 0.18)), 4, 3); }
    c.fillStyle = '#5a3a1e'; c.fillRect(w / 2 - 8, 0, 16, h); c.fillRect(0, h / 2 - 8, w, 16);
    c.lineWidth = 26; c.strokeStyle = '#5a3a1e'; c.strokeRect(0, 0, w, h);
    c.fillStyle = '#f2f5fa'; c.fillRect(13, h / 2 - 16, w - 26, 9); c.fillRect(13, h - 24, w - 26, 12);
  });
  view.position.set(2.9, 1.55, -hd + 0.012);
  group.add(view);
  // a candle on the counter (its flame: parts.candle, flickering in after())
  const CX = -0.36, CZ = -0.3;
  group.add(solid([cyl(0.045, 0.055, 0.012, CX, COUNTER_Y + 0.006, CZ, 0xc9a13a, 14), cyl(0.012, 0.016, 0.03, CX, COUNTER_Y + 0.027, CZ, 0xc9a13a, 10), cyl(0.011, 0.011, 0.11, CX, COUNTER_Y + 0.097, CZ, 0xf3ead2, 10)]));
  const candle = meshOf(new THREE.ConeGeometry(0.008, 0.035, 8), new THREE.MeshBasicNodeMaterial({ color: 0xffc46a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  candle.position.set(CX, COUNTER_Y + 0.172, CZ);
  const candleHalo = glow(0.34, 0.34, 0xffa040, 0.34);
  candleHalo.position.set(CX, COUNTER_Y + 0.17, CZ + 0.01);
  const candlePool = pool(0.7, 0xffa040, 0.2);
  candlePool.position.set(CX, COUNTER_Y + 0.0035, CZ);
  group.add(candle, candleHalo, candlePool);
  parts.candle = { flame: candle, halo: candleHalo, pool: candlePool };
  if (!logo) return;
  // the camp's logo (white, on the camp's navy): a pennant over the back bar, a table tent on the counter
  const tex = new THREE.TextureLoader().load(logo);
  tex.colorSpace = THREE.SRGBColorSpace;
  const A = 417 / 168;
  const pennant = meshOf(new THREE.PlaneGeometry(1.5, 1.5 / A), new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true }));
  pennant.position.set(1.95, 2.38, -hd + 0.37);
  const cloth = solid([box(1.7, 1.5 / A + 0.2, 0.01, 1.95, 2.38, -hd + 0.36, 0x16245a)]);
  const tent = meshOf(new THREE.PlaneGeometry(0.15, 0.15 / A), new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true }));
  tent.position.set(0.52, COUNTER_Y + 0.047, -0.2);
  tent.rotation.x = -0.3;
  const card = solid([(() => { const g = new THREE.BoxGeometry(0.17, 0.09, 0.003); g.rotateX(-0.3); g.translate(0.52, COUNTER_Y + 0.045, -0.203); return paint(g, 0x16245a); })()]);
  group.add(cloth, pennant, card, tent);
}
/** A flame on a lathe with its bright core and a glow (a group; its .flame, .core, .glow, .mat) */
const FLAME_GEO = () => new THREE.LatheGeometry([[0.012, 0], [0.021, 0.018], [0.018, 0.042], [0.009, 0.072], [0, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 10);
function makeFlame(colour = 0x4f9dff) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicNodeMaterial({ color: colour, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const coreMat = new THREE.MeshBasicNodeMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const geo = FLAME_GEO();
  const tipMat = new THREE.MeshBasicNodeMaterial({ color: 0xffa23a, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flame = meshOf(geo, mat), core = meshOf(geo, coreMat), tip = meshOf(geo, tipMat);
  const halo = glow(0.28, 0.28, colour, 0.25);
  halo.position.y = 0.05;
  g.add(flame, core, tip, halo);
  Object.assign(g, { flame, core, tip, halo, mat });
  return g;
}
/** A flame lives: it leans and licks, its orange tip a beat behind the blue body (after its scale is set) */
function lick(fg, t, wild = 0) {
  const a = 0.07 + 0.1 * wild;
  fg.flame.rotation.set(a * Math.sin(t * 9.1 + 1), 0, a * (Math.sin(t * 7.3) + 0.5 * Math.sin(t * 17.1)));
  fg.core.rotation.set(a * 0.5 * Math.sin(t * 9.1 + 0.6), 0, a * 0.5 * Math.sin(t * 7.3 - 0.4));
  const f = fg.flame.scale;
  fg.tip.scale.set(f.x * 0.62, f.y * (1.16 + 0.12 * Math.sin(t * 23) + 0.3 * wild), f.z * 0.62);
  fg.tip.rotation.set(a * 1.5 * Math.sin(t * 9.1 + 0.3), 0, a * 1.5 * Math.sin(t * 7.3 - 0.7));
  fg.tip.material.opacity = 0.16 + 0.3 * wild + 0.06 * Math.sin(t * 31);
}
/** The lighter, its small flame on top */
function makeLighter() {
  const lighter = new THREE.Group();
  lighter.add(solid([box(0.022, 0.06, 0.012, 0, 0, 0, 0xc23a2c), box(0.022, 0.012, 0.012, 0, 0.036, 0, 0xcfd3d8)]));
  const small = meshOf(new THREE.ConeGeometry(0.007, 0.032, 8), new THREE.MeshBasicNodeMaterial({ color: 0xffb648, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  small.position.y = 0.06;
  lighter.add(small);
  lighter.visible = false;
  return lighter;
}
/** The empties, shown as the evening goes on */
function makeEmpties(group, n, x0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const m = makeShotGlass(0, false);
    m.position.set(x0 + (i % 3) * 0.075, COUNTER_Y, -0.04 - Math.floor(i / 3) * 0.08);
    m.visible = false;
    group.add(m);
    out.push(m);
  }
  return out;
}
/** The shot glass, open, see-through: a group with its .spirit */
const GLASS = {
  wall: () => new THREE.CylinderGeometry(0.024, 0.019, GLASS_H, 18, 1, true).translate(0, GLASS_H / 2, 0),
  foot: () => new THREE.CylinderGeometry(0.0195, 0.0185, 0.014, 18).translate(0, 0.007, 0),
  rim: () => new THREE.TorusGeometry(0.024, 0.0011, 5, 24).rotateX(Math.PI / 2).translate(0, GLASS_H, 0),
  shine: () => new THREE.CylinderGeometry(0.0243, 0.0193, GLASS_H * 0.8, 3, 1, true, 0.5, 0.32).translate(0, GLASS_H / 2, 0)
};
function makeShotGlass(spiritColour = 0xd9a12b, withSpirit = true) {
  const glass = new THREE.Group();
  const see = (color, opacity, extra = {}) => new THREE.MeshBasicNodeMaterial({ color, transparent: true, opacity, depthWrite: false, ...extra });
  glass.add(meshOf(GLASS.wall(), see(0xbfe0f0, 0.14, { side: THREE.DoubleSide })), meshOf(GLASS.foot(), see(0xd6ecf6, 0.42)),
    meshOf(GLASS.rim(), see(0xffffff, 0.75)), meshOf(GLASS.shine(), see(0xffffff, 0.28)));
  if (!withSpirit) return glass;
  const spirit = meshOf(new THREE.CylinderGeometry(0.0212, 0.0193, GLASS_H * 0.6, 14).translate(0, 0.014 + GLASS_H * 0.3, 0), new THREE.MeshBasicNodeMaterial({ color: spiritColour, transparent: true, opacity: 0.85 }));
  glass.add(spirit);
  glass.spirit = spirit;
  return glass;
}

const FLAME_BLUE = new THREE.Color(0x4f9dff), FLAME_YELLOW = new THREE.Color(0xffc14a), FLAME_RED = new THREE.Color(0xff4a20);
const _flameCol = new THREE.Color();
/** The flame's colour and size: `level` 0-1 of its life (shots) */
function poseShotFlame(fg, level, t, camera) {
  const L = level;
  const flick = 1 + 0.12 * Math.sin(t * 31) + 0.08 * Math.sin(t * 47 + 1);
  const h = (0.35 + 1.5 * Math.min(1, L / 0.62) + Math.max(0, L - 0.72) * 2.4) * flick;
  fg.flame.scale.set(0.8 + L * 0.5, h, 0.8 + L * 0.5);
  fg.core.scale.set(0.45, h * 0.55, 0.45);
  // yellow as it catches, blue in its prime, orange-red when the glass is getting too hot
  if (L < 0.45) _flameCol.copy(FLAME_YELLOW).lerp(FLAME_BLUE, L / 0.45);
  else if (L < 0.72) _flameCol.copy(FLAME_BLUE);
  else _flameCol.copy(FLAME_BLUE).lerp(FLAME_RED, clamp((L - 0.72) / 0.2, 0, 1));
  fg.mat.color.copy(_flameCol);
  fg.halo.material.color.copy(_flameCol);
  fg.halo.quaternion.copy(camera.quaternion);
  lick(fg, t, clamp((L - 0.72) / 0.28, 0, 1));
}
/** A flame by its strength (Flämmli): small and yellow when weak, a tall blue one when strong, orange tips when wild */
function poseStrength(fg, f, t, camera, scale = 1) {
  const flick = 1 + 0.14 * Math.sin(t * 29) + 0.09 * Math.sin(t * 43 + 1) + (f < 0.3 ? 0.18 * Math.sin(t * 17) : 0);
  const h = (0.15 + 1.9 * clamp(f, 0, 1.1)) * flick * scale;
  fg.flame.scale.set((0.9 + f * 0.7) * scale, h, (0.9 + f * 0.7) * scale);
  fg.core.scale.set(0.5 * scale, h * 0.5, 0.5 * scale);
  if (f < 0.35) _flameCol.copy(FLAME_YELLOW).lerp(FLAME_BLUE, f / 0.35);
  else if (f < 0.82) _flameCol.copy(FLAME_BLUE);
  else _flameCol.copy(FLAME_BLUE).lerp(FLAME_RED, clamp((f - 0.82) / 0.18, 0, 1));
  fg.mat.color.copy(_flameCol);
  fg.halo.material.color.copy(_flameCol);
  fg.halo.material.opacity = 0.12 + 0.25 * clamp(f, 0, 1);
  fg.halo.quaternion.copy(camera.quaternion);
  lick(fg, t, clamp((f - 0.8) / 0.2, 0, 1));
}
/** The landlord behind the counter and two guests at it: their figures (js/player-figure.js FIGURES) */
const barPeople = ([landlord, her, him]) => [
  { x: window.innerHeight > window.innerWidth ? -0.42 : -0.72, z: -1.15, yaw: 0.35, figure: landlord },
  { x: 1.35, z: 0.42, yaw: -1.9, female: true, figure: her }, { x: -1.55, z: 0.5, yaw: 1.9, figure: him }
];
/** The HUD of a bar game: the pop, a card with a line, a label, a gauge (and a caramel bar), one big button */
function barHud(run, firstButton, stepNames = null) {
  addStyle(run);
  const hud = el('div', 'gs-hud');
  hud.hidden = true;
  const pop = el('div', 'gs-pop');
  const card = el('div', 'gs-card');
  const line = el('div');
  const label = el('div');
  const gauge = el('div', 'gs-gauge'), zone = el('span', 'gs-zone'), needle = el('span', 'gs-needle');
  gauge.append(zone, needle);
  const caramel = el('div', 'gs-caramel'), caramelTrack = el('i'), caramelFill = el('span');
  caramelTrack.append(caramelFill);
  caramel.append(el('b', null, 'Caramel'), caramelTrack);
  caramel.hidden = true;
  // (a game of several steps a round shows them in a row: the one at hand, the ones done)
  const steps = el('div', 'gs-steps');
  steps.hidden = !stepNames;
  const stepNodes = (stepNames || []).map((name) => { const n = el('span', 'gs-step'); n.append(el('b', null, name)); steps.append(n); return n; });
  card.append(steps, line, label, gauge, caramel);
  const act = el('button', 'gs-act', firstButton);
  act.type = 'button';
  hud.append(pop, card, act);
  const veil = el('div', 'gs-veil');
  veil.hidden = true;
  document.body.append(veil, hud);
  run.cleanups.push(() => { hud.remove(); veil.remove(); });
  return { hud, pop, line, label, gauge, zone, needle, caramel, caramelFill, act, veil, stepNodes };
}
function showGauge(ui, gauge) {
  setText(ui.label, gauge.label);
  ui.gauge.toggleAttribute('data-off', gauge.value === null);
  if (gauge.value !== null) {
    ui.zone.style.left = `${gauge.lo * 100}%`; ui.zone.style.width = `${(gauge.hi - gauge.lo) * 100}%`;
    ui.needle.style.left = `${gauge.value * 100}%`;
  }
  ui.gauge.classList.toggle('in', gauge.value !== null && gauge.value >= gauge.lo && gauge.value <= gauge.hi);
  ui.act.disabled = !gauge.button;
  setText(ui.act, gauge.button || '…');
}

// --- 1. Flaming shots in the Ex Bar -----------------------------------------------------------------------------------
const shots = {
  setup(run) {
    run.sh = { room: null, parts: null, crowd: null, ui: barHud(run, 'Order a shot'), seq: 0, lift: 0, swayT: 0, shown: 0 };
    run.listen(run.sh.ui.act, 'pointerdown', (e) => { e.preventDefault(); shots.press(run); });
    // the key bar at the bar (js/actions.js; the room's own controls replace the walker's): the big button's key
    run.actions([{ kind: 'hint', kbd: ['Space', 'Enter'], label: 'the red button', when: () => !!run.sh.room }]);
  },
  reset(run) {
    const sh = run.sh;
    sh.room?.dispose(); sh.room = null;
    sh.ui.hud.hidden = true; sh.ui.veil.hidden = true;
    sh.seq = 0; sh.lift = 0; sh.swayT = 0; sh.shown = 0;
    if (run.state) { run.state.game = null; run.state.inside = false; }
  },
  teardown(run) { run.sh.room?.dispose(); run.sh.room = null; },
  ownControls: (run) => !!run.sh.room, // (at the bar: js/missions.js hides the game's controls)
  key(run, e) {
    if (!run.sh.room || !gameKey(e.code)) return;
    swallow(e);
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) shots.press(run);
  },
  press(run) {
    const g = run.state?.game;
    if (!g || !live(run)) return;
    const what = shotsAction(g);
    if (!what) return;
    blip(run, what === 'light' || what === 'blow' ? 'fwoosh' : what === 'miss' ? 'bad' : 'pock');
    if (what === 'drink') run.sh.lift = 0.55;
  },
  enter(run) {
    const sh = run.sh;
    const parts = sh.parts = {};
    sh.room = new Room(run, run.def.interior.door, (group) => {
      buildBar(group, parts, LOOKS.exbar);
      const glass = makeShotGlass(0x7a2a10), fg = makeFlame();
      fg.position.y = GLASS_H * 0.78;
      glass.add(fg);
      glass.position.set(0, COUNTER_Y, 0.02);
      group.add(glass);
      parts.lighter = makeLighter();
      group.add(parts.lighter);
      parts.empties = makeEmpties(group, SHOTS.rounds, 0.14);
      Object.assign(parts, { glass, fg });
      sh.crowd = makeCrowd(barPeople(['m04', 'f01', 'm02']), group);
    });
    run.state.game = createShots(11);
    run.state.inside = true;
    sh.ui.hud.hidden = false;
  },
  update(run, ctx, dt) {
    const sh = run.sh;
    if (!sh.room && run.def.objectives[run.index]?.id === 'shots' && live(run)) shots.enter(run);
    const g = run.state?.game;
    if (!sh.room || !g) return;
    const before = g.step;
    shotsStep(g, dt);
    sh.swayT += dt;
    if (sh.lift > 0) sh.lift = Math.max(0, sh.lift - dt);
    if (before === 'burn' && g.step === 'pause') blip(run, 'bad');
    if (g.last && g.last.seq !== sh.seq) { sh.seq = g.last.seq; flashPop(sh.ui.pop, g.last); if (g.last.good) blip(run, 'good'); }
  },
  after(run, ctx, dt) {
    const sh = run.sh;
    if (!live(run)) sh.ui.hud.hidden = true;
    sh.ui.veil.hidden = !sh.room || run.phase === 'aborted' || !run.state?.game?.drinks;
    if (!sh.room || run.phase === 'aborted') return;
    const g = run.state.game, p = sh.parts;
    if (!g) return;
    // the camera: at the bar, looking down at the glass with the barkeeper behind it; it strays with each drink
    const portrait = window.innerHeight > window.innerWidth;
    const s = shotsSway(sh.swayT, g.drinks);
    sh.room.camera(ctx.camera, { x: s.x, y: 1.46 + s.y, z: portrait ? 1.5 : 1.02 }, { x: s.lookX, y: COUNTER_Y + (portrait ? 0.3 : 0.2) + s.lookY, z: -0.3 }, s.roll);
    poseCrowd(sh.crowd, dt);
    // the glass: none while ordering; lifted to the lips when downed; the flame by the step
    const drinking = sh.lift > 0;
    p.glass.visible = drinking || (g.step !== 'order' && g.step !== 'pause');
    p.glass.spirit.visible = !drinking;
    if (drinking) {
      const k = 1 - sh.lift / 0.55;
      p.glass.position.set(0, COUNTER_Y + Math.sin(Math.min(1, k * 1.4) * Math.PI / 2) * 0.24, 0.02 + k * 0.32);
      p.glass.rotation.x = -k * 1.9;
    } else { p.glass.position.set(0, COUNTER_Y, 0.02); p.glass.rotation.x = 0; }
    p.fg.visible = g.step === 'burn';
    if (p.fg.visible) poseShotFlame(p.fg, g.level, g.t, ctx.camera);
    // the lighter swings over the bar
    const gauge = shotsGauge(g);
    p.lighter.visible = g.step === 'light';
    if (p.lighter.visible) p.lighter.position.set((gauge.value - 0.5) * 0.46, COUNTER_Y + GLASS_H + 0.05, 0.02);
    p.halo.quaternion.copy(ctx.camera.quaternion);
    p.halo.material.opacity = 0.26 + 0.05 * Math.sin(sh.swayT * 1.7);
    if (sh.shown !== g.drinks) { sh.shown = g.drinks; p.empties.forEach((m, i) => { m.visible = i < g.drinks; }); }
    // the HUD: one line, one gauge, one button
    const ui = sh.ui;
    setText(ui.line, barRoundLine(g.round, SHOTS.rounds, shotsScore(g), g.strikes, SHOTS.strikes));
    showGauge(ui, gauge);
    ui.veil.style.opacity = `${clamp(g.drinks / SHOTS.rounds, 0, 1) * 0.85}`;
  }
};

// --- 2. Flämmli in the Rot Liechtli -----------------------------------------------------------------------------------
// The set on the counter (x across, z towards the player): the espresso cup on its saucer in the middle, the sugar
// dispenser to its left, the Williams bottle to its right at the back, the shot glass to its right at the front.
const CUP = { x: -0.03, z: 0.03, r: 0.032, h: 0.055 }, SHOT = { x: 0.11, z: 0.09 };
const SUGAR_AT = { x: -0.17, z: -0.02 }, BOTTLE_AT = { x: 0.2, z: -0.07 };
const COFFEE = new THREE.Color(0x3a1e0e), SUGAR_WHITE = new THREE.Color(0xf6f1e4), CARAMEL = new THREE.Color(0x9a5414), WILLIAMS = new THREE.Color(0xf2ead0);
const _c = new THREE.Color();
const STEPS_SHOWN = ['sugar', 'sip', 'williams', 'light', 'flambe', 'ready', 'smother', 'drink'];
const STEP_NAMES = ['Sugar', 'Sip', 'Williams', 'Light it', 'Flambé', 'Pour over', 'Smother', 'Ex'];
const HAND_YAW = 0.6;
const LIFT_T = 0.85; // s the glass takes from the counter to the lips, stuck to the palm
const ease = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const mix = (a, b, k) => a + (b - a) * k;
/** The hand: a palm, four fingers a little bent, the thumb, the wrist out of a sleeve (its origin: the palm's middle) */
function makeHand() {
  const SKIN = 0xe0ac8a, SHADE = 0xcf9878;
  const limb = (r, len, tilt, yaw, x, y, z, col) => { const g = new THREE.CapsuleGeometry(r, len, 4, 8); g.rotateX(-Math.PI / 2 + tilt); g.rotateY(yaw); g.translate(x, y, z); return paint(g, col); };
  const palm = new THREE.SphereGeometry(1, 14, 8);
  palm.scale(0.038, 0.012, 0.041); palm.computeVertexNormals();
  const parts = [paint(palm, SKIN)];
  [[-0.027, 0.036, 0.1], [-0.009, 0.046, 0.03], [0.009, 0.043, -0.03], [0.026, 0.032, -0.1]].forEach(([x, len, yaw]) => {
    parts.push(limb(0.0078, len, -0.16, yaw, x, -0.003, -0.038 - len / 2, SKIN), limb(0.0072, len * 0.45, -0.5, yaw, x - yaw * 0.06, -0.012, -0.045 - len * 1.12, SHADE));
  });
  parts.push(limb(0.009, 0.03, -0.1, 0.75, -0.046, -0.003, -0.012, SKIN));
  // (the forearm comes level from the drinker's side: HAND_YAW turns the whole hand, so that it does not hide the glass)
  parts.push(limb(0.021, 0.1, 0.05, 0, 0, -0.004, 0.088, SKIN), limb(0.031, 0.5, 0.05, 0, 0, -0.02, 0.4, 0x2f3d55), limb(0.033, 0.012, 0.05, 0, 0, -0.008, 0.15, 0x3a4a66));
  const hand = solid(parts);
  hand.visible = false;
  return hand;
}
function buildFlaemmliSet(group, parts, rounds = FLAEMMLI.rounds) {
  // the saucer with its spoon and the cup (white porcelain, open at the top: a lathe, its inside dark)
  const saucerGeo = new THREE.LatheGeometry([[0, 0.003], [0.03, 0.003], [0.05, 0.007], [0.06, 0.012], [0.058, 0.0135], [0.032, 0.006], [0, 0.006]].map(([x, y]) => new THREE.Vector2(x, y)), 26);
  const spoon = [(() => { const g = new THREE.BoxGeometry(0.004, 0.0015, 0.05); g.rotateY(0.5); g.translate(0.046, 0.014, 0.012); return paint(g, 0xc8ccd2); })(),
    (() => { const g = new THREE.SphereGeometry(1, 8, 6); g.scale(0.007, 0.002, 0.01); g.computeVertexNormals(); g.rotateY(0.5); g.translate(0.033, 0.014, -0.012); return paint(g, 0xdadde2); })()];
  const saucer = meshOf(mergeGeometries([paint(saucerGeo, 0xf4f1ea), ...spoon]), new THREE.MeshBasicNodeMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const cupOut = [[0.02, 0.006], [0.023, 0.003], [CUP.r - 0.005, 0.008], [CUP.r - 0.001, 0.02], [CUP.r, CUP.h * 0.6], [CUP.r + 0.002, CUP.h - 0.002], [CUP.r + 0.0015, CUP.h], [CUP.r - 0.002, CUP.h], [CUP.r - 0.003, CUP.h * 0.6], [CUP.r - 0.006, 0.014], [0, 0.011]];
  const cupGeo = new THREE.LatheGeometry(cupOut.map(([x, y]) => new THREE.Vector2(x, y)), 28);
  const cupMesh = meshOf(paint(cupGeo, 0xf7f4ee), new THREE.MeshBasicNodeMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const handle = solid([(() => { const t = new THREE.TorusGeometry(0.014, 0.0038, 8, 16, Math.PI * 1.2); t.rotateZ(-Math.PI * 0.6); t.translate(CUP.r + 0.006, CUP.h * 0.55, 0); return paint(t, 0xf7f4ee); })()]);
  // what is in the cup: one disc (coffee, then Williams) with the espresso's crema round its edge, the sugar heap (a
  // rounded cone), the flame
  const fill = meshOf(new THREE.CircleGeometry(CUP.r - 0.004, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: COFFEE }));
  const crema = meshOf(new THREE.RingGeometry(CUP.r - 0.011, CUP.r - 0.004, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: 0xa8713a, transparent: true, opacity: 0.9 }));
  crema.position.y = 0.0006;
  fill.add(crema);
  const heapGeo = new THREE.LatheGeometry([[CUP.r - 0.007, -0.01], [CUP.r - 0.012, -0.004], [0.012, 0.004], [0.005, 0.009], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
  const heap = meshOf(heapGeo, new THREE.MeshBasicNodeMaterial({ color: SUGAR_WHITE }));
  const cupFlame = makeFlame();
  const cup = new THREE.Group();
  cup.add(saucer);
  const bowl = new THREE.Group(); // (what tilts and swirls: the cup with its handle and contents)
  bowl.add(cupMesh, handle, fill, heap, cupFlame);
  cup.add(bowl);
  cup.position.set(CUP.x, COUNTER_Y, CUP.z);
  group.add(cup);
  // the espresso's steam, and the smoke of a flame gone out: three wisps
  const steam = [0, 1, 2].map(() => { const m = glow(0.06, 0.09, 0xffffff, 0); m.visible = false; group.add(m); return m; });
  // the light the flames throw on the counter
  const cupPool = pool(0.62, 0x4f9dff, 0), shotPool = pool(0.42, 0x4f9dff, 0);
  cupPool.position.set(CUP.x, COUNTER_Y + 0.004, CUP.z);
  shotPool.position.set(SHOT.x, COUNTER_Y + 0.004, SHOT.z);
  group.add(cupPool, shotPool);
  // the sugar dispenser: a glass body with sugar in it and a steel spout; its stream
  const sugar = new THREE.Group();
  sugar.add(meshOf(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 18, 1, true).translate(0, 0.05, 0), new THREE.MeshBasicNodeMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.3, depthWrite: false })));
  sugar.add(solid([cyl(0.027, 0.027, 0.055, 0, 0.0285, 0, 0xf2eee4, 16), cyl(0.031, 0.031, 0.004, 0, 0.002, 0, 0xb8bec6, 16), cyl(0.0315, 0.031, 0.006, 0, 0.103, 0, 0xb8bec6, 16), cyl(0.012, 0.031, 0.016, 0, 0.114, 0, 0xc6ccd4, 16), cyl(0.005, 0.009, 0.03, 0.018, 0.128, 0, 0xb8bec6, 8)]));
  const sugarStream = meshOf(new THREE.CylinderGeometry(0.0016, 0.0032, 1, 6).translate(0, -0.5, 0), new THREE.MeshBasicNodeMaterial({ color: 0xffffff }));
  sugarStream.visible = false;
  group.add(sugarStream);
  sugar.position.set(SUGAR_AT.x, COUNTER_Y, SUGAR_AT.z);
  group.add(sugar);
  // the Williams: a tall clear bottle with the pear schnapps in it, the pear-yellow label, a dark cap; its stream
  const bottle = new THREE.Group();
  bottle.add(meshOf(new THREE.CylinderGeometry(0.035, 0.037, 0.2, 18).translate(0, 0.1, 0), new THREE.MeshBasicNodeMaterial({ color: 0xe8f0e0, transparent: true, opacity: 0.42, depthWrite: false })));
  bottle.add(meshOf(new THREE.CylinderGeometry(0.0355, 0.0375, 0.18, 3, 1, true, 0.55, 0.3).translate(0, 0.1, 0), new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false })));
  bottle.add(solid([cyl(0.031, 0.033, 0.12, 0, 0.066, 0, 0xf3ecc8, 16), cyl(0.0372, 0.0372, 0.07, 0, 0.09, 0, 0xd8c23a, 18), cyl(0.012, 0.035, 0.05, 0, 0.225, 0, 0xe0e8dc, 14), cyl(0.012, 0.012, 0.03, 0, 0.262, 0, 0xe0e8dc, 12), cyl(0.0132, 0.0132, 0.022, 0, 0.286, 0, 0x2a2a2a, 10)]));
  const label = drawnPlane(0.066, 0.06, 256, (c, w, h) => {
    c.fillStyle = '#e4cf48'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#7a8a2a'; c.beginPath(); c.ellipse(w / 2, h * 0.36, w * 0.13, h * 0.2, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(w / 2, h * 0.22, w * 0.075, h * 0.12, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a2a08'; c.fillRect(w / 2 - 2, h * 0.04, 4, h * 0.1);
    c.font = '900 44px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('WILLIAMS', w / 2, h * 0.72, w * 0.9);
    c.font = '700 22px Georgia, serif'; c.fillText('Birnenbrand · 40 %', w / 2, h * 0.9, w * 0.9);
  });
  label.position.set(0, 0.09, 0.0376);
  bottle.add(label);
  const pourStream = meshOf(new THREE.CylinderGeometry(0.003, 0.0022, 1, 6).translate(0, -0.5, 0), new THREE.MeshBasicNodeMaterial({ color: 0xf6eed6, transparent: true, opacity: 0.8 }));
  pourStream.visible = false;
  group.add(pourStream);
  bottle.position.set(BOTTLE_AT.x, COUNTER_Y, BOTTLE_AT.z);
  group.add(bottle);
  // the shot glass, its flame
  const shot = makeShotGlass(0xd99a3a);
  const shotFlame = makeFlame();
  shotFlame.position.y = GLASS_H * 0.78;
  shot.add(shotFlame);
  shot.position.set(SHOT.x, COUNTER_Y, SHOT.z);
  group.add(shot);
  const hand = makeHand();
  group.add(hand);
  const lighter = makeLighter();
  group.add(lighter);
  Object.assign(parts, { cup, bowl, fill, crema, heap, cupFlame, steam, cupPool, shotPool, sugar, sugarStream, bottle, pourStream, shot, shotFlame, hand, lighter });
  parts.empties = makeEmpties(group, rounds, 0.24).map((m) => { m.position.z += 0.1; return m; });
}

// (a mission other than the Rot Liechtli's sets `flaemmli: { look, rounds }` on its definition, the Fondue Night one round
// in the Schatzalp's Stübli; its objective 'flaemmli' ends with the game, and the room goes with the next objective)
const flaemmliSpec = (run) => ({ look: 'rot', rounds: FLAEMMLI.rounds, leave: false, ...run.def.flaemmli });
const FL_STATE = () => ({ seq: 0, swayT: 0, shown: 0, swirlT: 0, pourT: 0, handT: 0, lift: 0, down: false, wide: 1, sipK: 0, sugarK: 0, bottleK: 0, smokeT: 0, prevStep: null, marks: {} });
const flaemmli = {
  setup(run) {
    const fl = run.fl = { room: null, parts: null, crowd: null, ui: barHud(run, 'Order a Flämmli', STEP_NAMES), noise: null, noiseKind: null, ...FL_STATE() };
    const up = (e) => { if (fl.down) { e?.preventDefault?.(); flaemmli.release(run); } };
    run.listen(fl.ui.act, 'pointerdown', (e) => { e.preventDefault(); try { fl.ui.act.setPointerCapture(e.pointerId); } catch { /* (a synthetic event) */ } flaemmli.press(run); });
    run.listen(fl.ui.act, 'pointerup', up);
    run.listen(fl.ui.act, 'pointercancel', up);
    run.listen(fl.ui.act, 'lostpointercapture', up);
    run.listen(fl.ui.act, 'contextmenu', (e) => e.preventDefault());
    // (js/missions.js hands the features only keydown: the held steps need the key coming up too)
    run.listen(window, 'keyup', (e) => { if (fl.room && (e.code === 'Space' || e.code === 'Enter')) { swallow(e); flaemmli.release(run); } }, { capture: true });
    run.listen(window, 'blur', () => flaemmli.release(run));
    run.actions([{ kind: 'hint', kbd: ['Space', 'Enter'], label: 'the red button (held: keep the key down)', when: () => !!fl.room }]);
  },
  leave(run) {
    const fl = run.fl;
    holdNoise(run, fl, null);
    fl.room?.dispose(); fl.room = null;
    fl.ui.hud.hidden = true; fl.ui.veil.hidden = true;
  },
  reset(run) {
    flaemmli.leave(run);
    Object.assign(run.fl, FL_STATE());
    if (run.state) { run.state.game = null; run.state.inside = false; }
  },
  teardown(run) { flaemmli.leave(run); },
  ownControls: (run) => !!run.fl.room, // (at the bar: js/missions.js hides the game's controls)
  key(run, e) {
    if (!run.fl.room || !gameKey(e.code)) return;
    swallow(e);
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) flaemmli.press(run);
  },
  press(run) {
    const fl = run.fl, g = run.state?.game;
    if (!g || !live(run)) return;
    fl.down = true;
    const what = flaemmliPress(g);
    if (!what) return;
    blip(run, what === 'light' || what === 'pour' || what === 'wild' ? 'fwoosh' : what === 'miss' ? 'bad' : 'pock');
    if (what === 'swirl' || what === 'wild') fl.swirlT = 0.45;
    if (what === 'pour') fl.pourT = 0.7;
    if (what === 'smother') fl.handT = 0.3;
    if (what === 'drink') fl.lift = LIFT_T;
  },
  release(run) {
    const fl = run.fl, g = run.state?.game;
    fl.down = false;
    if (!g || !live(run)) return;
    if (flaemmliRelease(g)) blip(run, 'pock');
  },
  enter(run) {
    const fl = run.fl, spec = flaemmliSpec(run);
    const parts = fl.parts = {};
    fl.room = new Room(run, run.def.interior.door, (group) => {
      buildBar(group, parts, LOOKS[spec.look] || LOOKS.rot, run.def.logo || null);
      buildFlaemmliSet(group, parts, spec.rounds);
      fl.crowd = makeCrowd(barPeople(spec.look === 'schatzalp' ? ['m02', 'f04', 'm04'] : ['m02', 'f02', 'm04']), group);
    });
    run.state.game = createFlaemmli(11, spec.rounds);
    run.state.inside = true;
    fl.ui.hud.hidden = false;
    fl.wide = 1; fl.prevStep = null; fl.marks = {};
  },
  update(run, ctx, dt) {
    const fl = run.fl;
    const here = run.def.objectives[run.index]?.id === 'flaemmli';
    if (!fl.room && here && live(run)) flaemmli.enter(run);
    // (a mission that goes on after the Flämmli: out of the room with the next objective)
    if (fl.room && !here && flaemmliSpec(run).leave) { flaemmli.leave(run); return; }
    const g = run.state?.game;
    if (!fl.room || !g) return;
    const before = g.step;
    flaemmliStep(g, dt);
    fl.swayT += dt;
    for (const k of ['swirlT', 'pourT', 'handT', 'lift', 'smokeT']) if (fl[k] > 0) fl[k] = Math.max(0, fl[k] - dt);
    if ((before === 'flambe' || before === 'ready' || before === 'smother') && (g.step === 'pause' || g.step === 'light')) blip(run, 'bad');
    if (g.last && g.last.seq !== fl.seq) { fl.seq = g.last.seq; flashPop(fl.ui.pop, g.last); if (g.last.good) blip(run, 'good'); }
  },
  after(run, ctx, dt) {
    const fl = run.fl;
    if (!live(run)) { fl.ui.hud.hidden = true; holdNoise(run, fl, null); }
    fl.ui.veil.hidden = !fl.room || run.phase === 'aborted' || !run.state?.game?.drinks;
    if (!fl.room || run.phase === 'aborted') return;
    const g = run.state.game, p = fl.parts;
    if (!g) return;
    const F = FLAEMMLI, step = g.step, cam = ctx.camera, t = g.t;
    // a step is left: how it went (the row of steps), and a flame that went out leaves its smoke over the cup
    if (step !== fl.prevStep) {
      const was = fl.prevStep;
      if (was) fl.marks[was] = !g.last || g.last.good;
      if ((was === 'flambe' || was === 'ready') && (step === 'light' || step === 'pause' || step === 'drink')) fl.smokeT = 1.5;
      if (step === 'order') fl.marks = {};
      fl.prevStep = step;
    }
    // the camera: the room from the stool while ordering and between the rounds (the name, the lamp, the guests); then
    // close, the cup and the shot glass in the middle of the view
    const portrait = window.innerHeight > window.innerWidth;
    const s = flaemmliSway(fl.swayT, g.drinks);
    fl.wide += (((step === 'order' || step === 'pause') && fl.lift <= 0 ? 1 : 0) - fl.wide) * Math.min(1, dt * 2.4); // (the glass is downed up close)
    const w = ease(fl.wide);
    fl.room.camera(cam,
      { x: 0.03 + s.x - 0.1 * w, y: mix(1.4, 1.58, w) + s.y, z: mix(portrait ? 1.05 : 0.72, portrait ? 2.5 : 1.75, w) },
      { x: 0.03 + s.lookX - 0.2 * w, y: mix(COUNTER_Y + (portrait ? 0.1 : 0.02), 1.55, w) + s.lookY, z: mix(-0.1, -1.6, w) }, s.roll);
    poseCrowd(fl.crowd, dt);
    p.halo.quaternion.copy(cam.quaternion);
    p.halo.material.opacity = 0.26 + 0.05 * Math.sin(fl.swayT * 1.7);
    if (p.candle) {
      const k = 1 + 0.16 * Math.sin(fl.swayT * 11) + 0.1 * Math.sin(fl.swayT * 23.7);
      p.candle.flame.scale.set(1, k, 1);
      p.candle.flame.rotation.z = 0.12 * Math.sin(fl.swayT * 6.1);
      p.candle.halo.quaternion.copy(cam.quaternion);
      p.candle.halo.material.opacity = 0.26 + 0.08 * k;
      p.candle.pool.material.opacity = 0.12 + 0.07 * k;
    }
    const served = step !== 'order' && step !== 'pause';
    const ORDER = ['serve', ...STEPS_SHOWN], at = ORDER.indexOf(step);
    const before = (a) => at <= ORDER.indexOf(a);
    const gauge = flaemmliGauge(g);
    // the set comes with the order (the landlord pushes it over the counter) and goes with the pause (he clears it)
    const slide = step === 'serve' ? -(1 - ease(g.stepT / F.serve)) * 0.24 : 0;
    p.cup.visible = served || fl.lift > 0;
    p.cup.position.z = CUP.z + slide;
    p.sugar.visible = served && before('sip');
    p.bottle.visible = served && before('light');
    p.shot.visible = served || fl.lift > 0;
    // the cup: the coffee drunk down, the Williams poured in, the sugar heap growing and turning to caramel
    const sugarAmt = step === 'sugar' ? gauge.value : g.sugar;
    p.heap.visible = served && sugarAmt > 0.03 && !before('serve');
    const heapK = clamp(sugarAmt / 0.6, 0.15, 1.5);
    p.heap.scale.set(Math.min(1, 0.5 + heapK * 0.5), heapK, Math.min(1, 0.5 + heapK * 0.5));
    p.heap.position.y = 0.012 + 0.01 * heapK;
    const flaming = step === 'flambe' || step === 'ready' || step === 'smother';
    const car = flaming ? clamp(g.caramel, 0, 1) : 0;
    p.heap.material.color.copy(_c.copy(SUGAR_WHITE).lerp(CARAMEL, car));
    // (the caramel bubbles as it comes)
    if (flaming && car > 0.2) p.heap.scale.y *= 1 + 0.07 * car * Math.sin(t * 19);
    let level = 0, col = COFFEE;
    if (step === 'serve' || step === 'sugar') level = 0.8;
    else if (step === 'sip') level = 0.8 * (1 - clamp(gauge.value / F.hold.sip.zone[1], 0, 1)) + 0.05;
    else if (step === 'williams') { const left = clamp((F.hold.sip.zone[0] - g.sip) / F.hold.sip.zone[0], 0, 1) * 0.8; level = left + gauge.value * 0.45; col = left > 0.05 && gauge.value < 0.2 ? COFFEE : WILLIAMS; }
    else if (step === 'light' || step === 'flambe' || step === 'ready') { level = 0.08 + g.williams * 0.4 * clamp(g.fuel, 0, 1); col = WILLIAMS; }
    p.fill.visible = served && level > 0.04 && step !== 'smother' && step !== 'drink';
    p.fill.position.y = 0.012 + (CUP.h - 0.016) * clamp(level, 0, 1);
    p.fill.material.color.copy(col === WILLIAMS ? _c.copy(WILLIAMS).lerp(CARAMEL, car) : col);
    p.crema.visible = col === COFFEE;
    // what is held eases into place: the cup to the lips, the dispenser and the bottle over the cup
    const sipping = step === 'sip' && g.holding, sugaring = step === 'sugar' && g.holding, wPour = step === 'williams' && g.holding;
    const toward = (key, on, rate) => { fl[key] += ((on ? 1 : 0) - fl[key]) * Math.min(1, dt * rate); return ease(fl[key]); };
    const sipK = toward('sipK', sipping, 9), sugarK = toward('sugarK', sugaring, 12), bottleK = toward('bottleK', wPour, 12);
    const pouring = fl.pourT > 0;
    // the sip: the cup lifted to the lips while held, tipped further as it empties
    p.bowl.position.set(0, 0.17 * sipK, 0.26 * sipK);
    p.bowl.rotation.set(-(0.55 + 0.5 * (step === 'sip' ? gauge.value : 0)) * sipK, 0, 0);
    let pourK = 0;
    if (pouring) { // the cup over the shot glass, tipped: its lip over the glass
      pourK = 1 - fl.pourT / 0.7;
      const go = ease(pourK * 2.6) * ease((1 - pourK) * 5 + 0.2), tip = ease(pourK * 1.9) * ease((1 - pourK) * 5);
      p.bowl.position.set((SHOT.x - CUP.x - 0.058) * go, 0.125 * go, (SHOT.z - CUP.z) * go);
      p.bowl.rotation.set(0, 0, -1.6 * tip);
    } else if (fl.swirlT > 0) { // a swirl: a small circle
      const k = fl.swirlT / 0.45;
      p.bowl.position.x += 0.008 * k * Math.sin(k * 14); p.bowl.position.z += 0.008 * k * Math.cos(k * 14);
      p.bowl.rotation.z = 0.14 * k * Math.sin(k * 14); p.bowl.rotation.x = 0.14 * k * Math.cos(k * 14);
    }
    // the sugar dispenser: tipped over the cup while held
    // (tipped about its foot: the spout's tip, 0.14 m up, comes to lie 0.127 m to the side and 0.058 m lower)
    p.sugar.position.set(mix(SUGAR_AT.x, CUP.x - 0.127, sugarK), COUNTER_Y + 0.145 * sugarK, mix(SUGAR_AT.z, CUP.z, sugarK) + slide);
    p.sugar.rotation.z = -2.0 * sugarK - (sugaring ? 0.03 * Math.sin(t * 26) : 0); // (shaken a little as it runs)
    p.sugarStream.visible = sugaring && sugarK > 0.8;
    if (p.sugarStream.visible) { const j = 1 + 0.35 * Math.sin(t * 47); p.sugarStream.position.set(CUP.x + 0.002 * Math.sin(t * 26), COUNTER_Y + 0.087, CUP.z); p.sugarStream.scale.set(j, 0.062, j); }
    // the Williams: tipped over the cup while held
    // (tipped about its foot: the neck's end, 0.275 m up, comes to lie 0.26 m to the side and 0.09 m lower)
    p.bottle.position.set(mix(BOTTLE_AT.x, CUP.x + 0.275, bottleK), COUNTER_Y + 0.19 * bottleK, mix(BOTTLE_AT.z, CUP.z, bottleK) + slide);
    p.bottle.rotation.z = 1.9 * bottleK;
    p.pourStream.visible = (wPour && bottleK > 0.8) || (pouring && pourK > 0.3 && pourK < 0.86);
    if (p.pourStream.visible) {
      if (wPour) { p.pourStream.position.set(CUP.x, COUNTER_Y + 0.094, CUP.z); p.pourStream.scale.set(1, 0.066, 1); p.pourStream.material.color.copy(WILLIAMS); }
      else { p.pourStream.position.set(SHOT.x, COUNTER_Y + 0.105, SHOT.z); p.pourStream.scale.set(1.3, 0.085, 1.3); p.pourStream.material.color.copy(_c.copy(WILLIAMS).lerp(CARAMEL, 0.7)); }
    }
    // the cup's flame, its light on the counter
    const burning = step === 'flambe' || step === 'ready';
    p.cupFlame.visible = burning || (pouring && step === 'smother' && pourK < 0.8);
    if (p.cupFlame.visible) { p.cupFlame.position.y = CUP.h * 0.5; p.cupFlame.rotation.z = -p.bowl.rotation.z; poseStrength(p.cupFlame, burning ? g.flame : 0.5, t, cam, 1.25); }
    p.cupPool.material.opacity = burning ? (0.1 + 0.3 * clamp(g.flame, 0, 1)) * (1 + 0.12 * Math.sin(t * 29)) : 0;
    if (burning) p.cupPool.material.color.copy(p.cupFlame.mat.color);
    // the steam of the hot espresso; the smoke of a flame gone out
    const hot = step === 'serve' || step === 'sugar' ? 1 : step === 'sip' ? 1 - clamp(gauge.value / F.hold.sip.zone[1], 0, 1) : 0;
    const smoke = fl.smokeT / 1.5, wisp = Math.max(hot * (1 - sipK), smoke);
    p.steam.forEach((m, i) => {
      m.visible = wisp > 0.02 && p.cup.visible;
      if (!m.visible) return;
      const ph = (fl.swayT * (smoke > 0 ? 0.8 : 0.42) + i / 3) % 1;
      m.position.set(CUP.x + 0.014 * ph * Math.sin(fl.swayT * 1.7 + i * 2.1), COUNTER_Y + CUP.h + 0.012 + ph * (smoke > 0 ? 0.2 : 0.13), CUP.z + slide);
      m.scale.setScalar((0.6 + ph * 1.3) * (smoke > 0 ? 1.5 : 1));
      m.material.opacity = wisp * (smoke > 0 ? 0.3 : 0.17) * Math.sin(Math.PI * ph);
      m.quaternion.copy(cam.quaternion);
    });
    // the lighter swings over the cup
    p.lighter.visible = step === 'light';
    if (p.lighter.visible) p.lighter.position.set(CUP.x + (gauge.value - 0.5) * 0.4, COUNTER_Y + CUP.h + 0.05, CUP.z);
    // the shot glass: empty, then burning; the hand over it; downed
    const poured = (step === 'smother' && (!pouring || pourK > 0.5)) || step === 'drink';
    p.shot.spirit.visible = poured;
    p.shotFlame.visible = step === 'smother' && poured && fl.handT <= 0;
    if (p.shotFlame.visible) poseStrength(p.shotFlame, 0.45 + 0.25 * g.heat, t, cam, 0.7 * (pouring ? ease((pourK - 0.5) * 4) : 1));
    p.shotPool.material.opacity = p.shotFlame.visible ? (0.16 + 0.14 * g.heat) * (1 + 0.12 * Math.sin(t * 31)) : 0;
    if (p.shotFlame.visible) p.shotPool.material.color.copy(p.shotFlame.mat.color);
    const handOn = step === 'drink' || fl.handT > 0;
    p.hand.visible = (step === 'smother' && !pouring) || handOn;
    p.hand.rotation.set(0, HAND_YAW, 0);
    if (p.hand.visible) {
      // (it hovers lower as the glass warms, then claps down)
      const hover = step === 'smother' ? 0.11 - 0.035 * g.heat + 0.004 * Math.sin(t * 5) : 0;
      const k = fl.handT > 0 ? ease(fl.handT / 0.3) : 0;
      p.hand.position.set(SHOT.x, COUNTER_Y + GLASS_H + 0.011 + (handOn ? 0.11 * k : hover), SHOT.z + 0.012);
    }
    p.shot.position.set(SHOT.x, COUNTER_Y, SHOT.z + slide);
    p.shot.rotation.set(0, 0, 0);
    if (fl.lift > 0) { // the glass sticks to the palm: lifted off the counter on it, shown round, then to the lips
      const k = 1 - fl.lift / LIFT_T, up = ease(k / 0.4), tip = ease((k - 0.45) / 0.55);
      const a = -1.75 * tip, y = COUNTER_Y + 0.13 * up + 0.1 * tip, z = SHOT.z + 0.34 * tip;
      const x = SHOT.x + (k < 0.45 ? 0.006 * Math.sin(k * 60) * (1 - up * 0.5) : 0); // (a little shake: it holds)
      p.shot.position.set(x, y, z);
      p.shot.rotation.x = a;
      p.shot.spirit.visible = k < 0.75;
      // (the palm on the rim, turning with the glass about its foot)
      const oy = GLASS_H + 0.011, oz = 0.012;
      p.hand.visible = true;
      p.hand.position.set(x, y + oy * Math.cos(a) - oz * Math.sin(a), z + oy * Math.sin(a) + oz * Math.cos(a));
      p.hand.rotation.x = a;
    }
    if (fl.shown !== g.drinks) { fl.shown = g.drinks; p.empties.forEach((m, i) => { m.visible = i < g.drinks; }); }
    holdNoise(run, fl, sugaring ? 'sugar' : wPour ? 'pour' : null);
    // the HUD
    const ui = fl.ui;
    setText(ui.line, barRoundLine(g.round, g.rounds, flaemmliScore(g), g.strikes, F.strikes));
    showGauge(ui, gauge);
    ui.act.classList.toggle('held', !!g.holding);
    ui.caramel.hidden = gauge.caramel === null;
    if (gauge.caramel !== null) ui.caramelFill.style.transform = `scaleX(${gauge.caramel})`;
    const now = STEPS_SHOWN.indexOf(step);
    ui.stepNodes.forEach((n, i) => {
      const id = STEPS_SHOWN[i], done = id in fl.marks && i !== now;
      n.classList.toggle('on', i === now);
      n.classList.toggle('done', done);
      n.classList.toggle('bad', done && !fl.marks[id]);
    });
    ui.veil.style.opacity = `${clamp(g.drinks / F.rounds, 0, 1) * 0.85}`; // (one Flämmli sways one third as much)
  }
};

// =====================================================================================================================
// 3. Pizza Heaven
// =====================================================================================================================
const PZ = 260;
function buildKitchen(group) {
  const W = 6, D = 5, H = 2.8, hw = W / 2, hd = D / 2, TILE = 0xd8d2c4;
  const room = [
    box(W, 0.1, D, 0, -0.05, 0, 0x7d3a26),
    box(W, H, 0.2, 0, H / 2, -hd - 0.1, TILE), box(W, H, 0.2, 0, H / 2, hd + 0.1, TILE),
    box(0.2, H, D, -hw - 0.1, H / 2, 0, TILE), box(0.2, H, D, hw + 0.1, H / 2, 0, TILE),
    box(W, 0.2, D, 0, H + 0.1, 0, 0xf1ece0),
    box(W, 0.9, 0.04, 0, 0.45, -hd + 0.02, 0xa8352a),
    // the work table with its marble top, the topping trays
    box(3.6, 0.9, 0.8, 0, 0.45, -0.5, 0x8c8f94), box(3.7, 0.05, 0.9, 0, 0.925, -0.5, 0xe8e6e0),
    // the oven in the back wall: the brick dome, its mouth, the fire
    box(2.0, 1.9, 0.9, -1.1, 0.95, -hd + 0.45, 0x8e4a33), box(1.0, 0.55, 0.05, -1.1, 1.05, -hd + 0.92, 0x170b07),
    box(0.8, 0.3, 0.02, -1.1, 0.95, -hd + 0.95, 0xff8a2a),
    // shelves with boxes
    box(1.9, 0.04, 0.34, 1.65, 1.6, -hd + 0.18, 0x6b4a2a), box(1.9, 0.04, 0.34, 1.65, 1.1, -hd + 0.18, 0x6b4a2a),
    ...[0, 1, 2, 3, 4].flatMap((i) => [box(0.3, 0.05, 0.3, 1.0 + i * 0.32, 1.65, -hd + 0.18, 0xc23a2c), box(0.3, 0.05, 0.3, 1.0 + i * 0.32, 1.71, -hd + 0.18, 0xf2efe6), box(0.3, 0.05, 0.3, 1.0 + i * 0.32, 1.15, -hd + 0.18, 0xc23a2c)])
  ];
  TOPPINGS.forEach((t, i) => { room.push(box(0.32, 0.05, 0.26, -1.25 + i * 0.36, 0.975, -0.72, t.colour)); });
  group.add(solid(room));
  const sign = textPlane('PIZZA HEAVEN', 2.4, 0.42, { bg: '#b3261a', fg: '#fff3d6' });
  sign.position.set(1.65, 2.0, -hd + 0.03);
  group.add(sign);
  const heat = glow(2.0, 1.2, 0xff7a1e, 0.2);
  heat.position.set(-1.1, 1.05, -hd + 1.0);
  group.add(heat);
}

/** Where a topping's bits lie on the pizza: repeatable by the topping's index (a sunflower) */
function scatter(i, n) {
  const out = [];
  let a = (i + 1) * 8.03;
  for (let k = 0; k < n; k++) { a += 2.399963; const r = Math.sqrt((k + 0.5) / n) * 0.82; out.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return out;
}
function drawPizza(c, S, tops) {
  c.clearRect(0, 0, S, S);
  const R = S / 2, r = R * 0.86;
  c.save();
  c.translate(R, R);
  c.fillStyle = '#d9a760'; c.beginPath(); c.arc(0, 0, R - 2, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#efd19a'; c.beginPath(); c.arc(0, 0, R * 0.88, 0, Math.PI * 2); c.fill();
  for (const id of tops) {
    const idx = TOPPINGS.findIndex((t) => t.id === id);
    c.fillStyle = TOPPINGS[idx].colour;
    if (id === 'tomato') { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); continue; }
    for (const [x, y] of scatter(idx, id === 'mozzarella' ? 16 : id === 'basil' ? 7 : 10)) {
      const px = x * r, py = y * r;
      c.beginPath();
      if (id === 'mozzarella') c.arc(px, py, R * 0.15, 0, Math.PI * 2);
      else if (id === 'basil') c.ellipse(px, py, R * 0.09, R * 0.045, x * 6, 0, Math.PI * 2);
      else if (id === 'salami') c.arc(px, py, R * 0.1, 0, Math.PI * 2);
      else if (id === 'pineapple') c.rect(px - R * 0.06, py - R * 0.04, R * 0.12, R * 0.08);
      else if (id === 'buendner') c.ellipse(px, py, R * 0.12, R * 0.06, y * 5, 0, Math.PI * 2);
      else if (id === 'mushroom') c.ellipse(px, py, R * 0.075, R * 0.055, x * 4, 0, Math.PI * 2);
      else c.ellipse(px, py, R * 0.1, R * 0.07, x * 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

/** The van's roof sign, and the box in the player's arms */
function buildCarGear(run, car) {
  const roof = new THREE.Group();
  roof.name = 'PizzaRoofSign';
  const face = (rotY, z) => {
    const p = textPlane('PIZZA HEAVEN', 1.0, 0.3, { bg: '#b3261a', fg: '#fff3d6' });
    p.position.set(0, 2.2, z); p.rotation.y = rotY;
    return p;
  };
  roof.add(solid([box(1.0, 0.3, 0.12, 0, 2.2, 0, 0xb3261a), box(0.7, 0.05, 0.3, 0, 2.03, 0, 0x222222)]), face(0, 0.062), face(Math.PI, -0.062));
  (car.chassisPivot || car.mesh).add(roof);
  run.cleanups.push(() => { roof.removeFromParent(); disposeTree(roof); });
  const carry = solid([box(0.36, 0.05, 0.36, 0, 0, 0, 0xc23a2c), box(0.37, 0.006, 0.37, 0, 0.028, 0, 0xf2efe6)]);
  carry.visible = false;
  run.group.add(carry);
  return carry;
}

const pizzaRun = {
  setup(run) {
    addStyle(run);
    const shopHud = el('div', 'gs-hud gs-pizza');
    shopHud.hidden = true;
    const pop = el('div', 'gs-pop');
    const card = el('div', 'gs-card');
    const line = el('div'), ticket = el('div', 'gs-ticket');
    card.append(line, ticket);
    const board = el('div', 'gs-board');
    const cv = el('canvas');
    cv.width = cv.height = PZ;
    const tops = el('div', 'gs-tops');
    TOPPINGS.forEach((t, i) => {
      const b = el('button', 'gs-top');
      b.type = 'button';
      const dot = el('i');
      dot.style.background = t.colour;
      b.append(dot, el('span', null, t.name), el('kbd', null, `${i + 1}`));
      run.listen(b, 'pointerdown', (e) => { e.preventDefault(); pizzaRun.pick(run, t.id); });
      tops.append(b);
    });
    board.append(cv, tops);
    shopHud.append(pop, card, board);
    // the drive: a heat bar at the bottom
    const driveHud = el('div', 'gs-hud');
    driveHud.hidden = true;
    const drivePop = el('div', 'gs-pop');
    const dcard = el('div', 'gs-card');
    const dline = el('div');
    const heat = el('div', 'gs-heat'), heatFill = el('span');
    heat.append(heatFill);
    dcard.append(dline, heat);
    driveHud.append(drivePop, dcard);
    document.body.append(shopHud, driveHud);
    run.cleanups.push(() => { shopHud.remove(); driveHud.remove(); });
    run.pz = {
      room: null, crowd: null, carry: buildCarGear(run, run.hooks.controllerManager.entities.car), seq: 0, ticketKey: '',
      ui: { shopHud, pop, line, ticket, c: cv.getContext('2d'), driveHud, drivePop, dline, heatFill }
    };
    run.actions([{ kind: 'hint', kbd: ['1–8'], label: 'the toppings, in the order of the ticket', when: () => !!run.pz.room }]);
  },
  reset(run) {
    const pz = run.pz;
    pz.room?.dispose(); pz.room = null;
    pz.ui.shopHud.hidden = true; pz.ui.driveHud.hidden = true;
    pz.seq = 0; pz.ticketKey = '';
    pz.carry.visible = false;
    if (run.state) { run.state.shop = null; run.state.inside = false; }
  },
  teardown(run) { run.pz.room?.dispose(); run.pz.room = null; },
  ownControls: (run) => !!run.pz.room, // (only in the kitchen; the drive needs the car's controls)
  key(run, e) {
    if (!run.pz.room || !gameKey(e.code)) return;
    swallow(e);
    const m = /^(?:Digit|Numpad)([1-8])$/.exec(e.code);
    if (m && !e.repeat) pizzaRun.pick(run, TOPPINGS[+m[1] - 1].id);
  },
  pick(run, id) {
    const s = run.state?.shop;
    if (!s || !live(run)) return;
    const r = pizzaPick(s, id);
    if (r) blip(run, r === 'wrong' ? 'bad' : r === 'pizza' ? 'good' : 'pock');
  },
  enter(run) {
    const pz = run.pz;
    pz.room = new Room(run, run.def.interior.door, (group) => {
      buildKitchen(group);
      pz.crowd = makeCrowd([{ x: 1.7, z: -1.6, yaw: 0.3, female: true }], group);
    });
    run.state.shop = createPizzaShop();
    run.state.inside = true;
    pz.ui.shopHud.hidden = false;
  },
  update(run, ctx, dt, cm) {
    const pz = run.pz, id = run.def.objectives[run.index]?.id;
    const st = run.state?.run;
    if (!st) return;
    const car = cm.entities.car;
    st.van = { x: car.position.x - Math.sin(car.heading) * 2.6, z: car.position.z - Math.cos(car.heading) * 2.6 };
    if (!live(run)) return;
    if (id === 'toppings' && !pz.room) pizzaRun.enter(run);
    if (pz.room && id !== 'toppings') { pz.room.dispose(); pz.room = null; pz.ui.shopHud.hidden = true; }
    const s = run.state.shop;
    if (pz.room && s) {
      pizzaShopStep(s, dt);
      if (s.last && s.last.seq !== pz.seq) { pz.seq = s.last.seq; flashPop(pz.ui.pop, s.last); }
    }
    if (!s?.done) return;
    pizzaHeatStep(st, dt);
    const stop = PIZZA_STOPS.find((p) => `deliver-${p.id}` === id);
    if (!stop) return;
    const what = pizzaCarryStep(st, ctx, st.van, stop);
    if (what === 'deliver') {
      const d = st.drops[st.drops.length - 1];
      blip(run, 'good');
      flashPop(pz.ui.drivePop, { text: deliveryPopText(stop, d.heat), points: d.points, good: d.heat > 0.25 });
    } else if (what === 'pick') blip(run, 'pock');
  },
  after(run, ctx, dt, cm) {
    const pz = run.pz, st = run.state?.run, s = run.state?.shop;
    if (!live(run)) { pz.ui.shopHud.hidden = true; pz.ui.driveHud.hidden = true; pz.carry.visible = false; return; }
    if (pz.room && s) {
      const portrait = window.innerHeight > window.innerWidth;
      pz.room.camera(ctx.camera, { x: portrait ? 0 : 0.2, y: 1.62, z: portrait ? 2.2 : 1.15 }, { x: 0, y: portrait ? 0.7 : 0.98, z: -1.2 });
      poseCrowd(pz.crowd, dt);
      const order = PIZZA_ORDERS[Math.min(s.order, PIZZA_ORDERS.length - 1)];
      const key = `${s.order}/${s.picked}`;
      if (key !== pz.ticketKey) {
        pz.ticketKey = key;
        const stop = PIZZA_STOPS.find((p) => p.id === order.stop);
        setText(pz.ui.line, pizzaLine(s, order, stop));
        pz.ui.ticket.replaceChildren(...order.tops.map((tid, i) => el('span', `gs-chip${i < s.picked ? ' done' : i === s.picked ? ' next' : ''}`, TOPPINGS.find((x) => x.id === tid).name)));
        drawPizza(pz.ui.c, PZ, order.tops.slice(0, s.picked));
      }
      return;
    }
    if (!s?.done) return;
    const p = cm.entities.person;
    pz.carry.visible = st.carrying && ctx.mode === 'person';
    if (pz.carry.visible) {
      pz.carry.position.set(p.position.x + Math.sin(p.heading) * 0.38, p.position.y + 1.02, p.position.z + Math.cos(p.heading) * 0.38);
      pz.carry.rotation.y = p.heading;
    }
    pz.ui.driveHud.hidden = false;
    setText(pz.ui.dline, pizzaDriveLine(st, pizzaScore(run.state)));
    pz.ui.heatFill.style.transform = `scaleX(${st.heat})`;
  }
};

export const GASTRO_FEATURES = { shots, flaemmli, pizzaRun };
// (the indoor framework, for js/missions-bars.js)
export { el, clamp, live, swallow, gameKey, addStyle, paint, box, cyl, solid, meshOf, textPlane, glow, makeCrowd, poseCrowd, Room, blip, flashPop };
