import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { surfaceHeight } from './terrain.js';
import {
  FLAEMMLI, createFlaemmli, flaemmliStep, flaemmliAction, flaemmliGauge, flaemmliSway, flaemmliScore,
  PIZZA_ORDERS, PIZZA_STOPS, TOPPINGS, createPizzaShop, pizzaShopStep, pizzaPick, pizzaHeatStep, pizzaCarryStep, pizzaScore
} from './missions-data-gastro.js';

// js/missions-gastro.js
// The runtime of the two gastro missions (js/missions-data-gastro.js has their definitions and the games' pure logic):
// js/missions.js merges GASTRO_FEATURES into its features.
//  - flaemmli: the Rot Liechtli's bar room, built when entered high above the door (like js/missions-sport.js's pub):
//    unlit materials with the shading baked into vertex colours, the glass and its flame at the middle of the view, one
//    gauge and one button in the HUD; the camera rolls and strays with each drink.
//  - pizzaRun: Pizza Heaven's kitchen, the same way, with the pizza on a small canvas and the toppings as buttons; then
//    the van with a roof sign, the box in the player's arms and a heat bar (the carrying: js/missions-data-local.js).
// Everything is built on demand and disposed with the run. The games run on the mission's frame time (dt).

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
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
body.gs-indoor .gta-prompt,body.gs-indoor .touch-use,body.gs-indoor .mission-prompt,body.gs-indoor #touch-controls,body.gs-indoor .hud-bottom-center,body.gs-indoor .hud-bottom-left,body.gs-indoor .hud-bottom-right{display:none!important}
@media (hover:none){.gs-top kbd{display:none}}
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
/** A soft round glow on a plane (a small radial texture, tinted by the material's colour) */
function glow(w, h, color, opacity) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d'), r = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, '#fff'); r.addColorStop(0.35, '#777'); r.addColorStop(1, '#000');
  c.fillStyle = r; c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return meshOf(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicNodeMaterial({ color, map: tex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
}

/** People standing about: the instanced crowd the pubs of js/missions-sport.js use, self-lit by its colour */
function makeCrowd(spots, group) {
  const crowd = new PersonCrowd(spots.length, { farDistance: 40, castShadow: false });
  for (const m of crowd.meshes) { m.receiveShadow = false; m.material.emissiveNode = m.material.colorNode; group.add(m); }
  const people = spots.map((s, i) => {
    const rig = new PersonRig({ seed: ((i + 3) * 0.6180339) % 1, female: !!s.female, hair: (i * 0.37) % 1, girth: 1 + (i % 3) * 0.08, scale: 1, ...s.look });
    rig.reset(s.x, s.z, s.yaw, () => 0);
    return { rig, ...s };
  });
  return { crowd, people };
}
function poseCrowd(c, dt, pose = null) {
  c.crowd.begin();
  for (const p of c.people) { p.rig.update(dt, p.x, p.z, p.yaw, () => 0); pose?.(p); c.crowd.add(p.rig, 0); }
  c.crowd.end();
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
function flashPop(node, last) {
  node.textContent = last.points ? `${last.text}  ${last.points > 0 ? '+' : ''}${last.points}` : last.text;
  node.className = `gs-pop${last.good ? '' : ' bad'}`;
  clearTimeout(node._t);
  node._t = setTimeout(() => { node.textContent = ''; }, 1500);
}

// =====================================================================================================================
// 1. Flämmli
// =====================================================================================================================
const COUNTER_Y = 1.08, GLASS_H = 0.075;
const WOOD = 0x3c2214, DARK = 0x3a2416, RED = 0x7a1a1f;
function buildBar(group, parts) {
  const W = 7, D = 6, H = 2.9, hw = W / 2, hd = D / 2;
  const room = [
    box(W, 0.1, D, 0, -0.05, 0, 0x2a1810),
    box(W, H, 0.2, 0, H / 2, -hd - 0.1, RED), box(W, H, 0.2, 0, H / 2, hd + 0.1, RED),
    box(0.2, H, D, -hw - 0.1, H / 2, 0, RED), box(0.2, H, D, hw + 0.1, H / 2, 0, RED),
    box(W, 0.2, D, 0, H + 0.1, 0, 0x180c08),
    ...[-2, 0, 2].map((z) => box(W, 0.2, 0.18, 0, H - 0.1, z, DARK)),
    // the counter across the room, its top and the back bar behind the landlord
    box(5.2, COUNTER_Y - 0.05, 0.7, -0.3, (COUNTER_Y - 0.05) / 2, -0.25, WOOD), box(5.3, 0.05, 0.8, -0.3, COUNTER_Y - 0.025, -0.25, 0x5a3320),
    box(5.2, 2.3, 0.3, -0.3, 1.15, -hd + 0.2, DARK), box(5, 0.03, 0.26, -0.3, 1.25, -hd + 0.38, 0x7a5230), box(5, 0.03, 0.26, -0.3, 1.7, -hd + 0.38, 0x7a5230)
  ];
  group.add(solid(room));
  const bottleCols = [0x2e6b2a, 0x7a3b12, 0xd8c47a, 0x3a1a0a, 0xa8d0e0, 0x5a1020];
  const bottles = [];
  for (let i = 0; i < 28; i++) { const shelf = i % 2, x = -2.4 + (i >> 1) * 0.34; bottles.push(cyl(0.035, 0.045, 0.27, x, 1.4 + shelf * 0.45, -hd + 0.38, bottleCols[i % 6], 6)); }
  group.add(solid(bottles));
  // the name over the back bar and the red lamp the pub is named after
  const sign = textPlane('ROT LIECHTLI', 2.4, 0.36, { bg: '#190a08', fg: '#ff4a55' });
  sign.position.set(-0.3, 2.42, -hd + 0.36);
  group.add(sign);
  group.add(solid([cyl(0.1, 0.14, 0.14, 1.15, 2.33, -0.9, 0xff2c36, 12), box(0.015, 0.45, 0.015, 1.15, 2.65, -0.9, 0x111111)]));
  const halo = glow(1.1, 1.1, 0xff2030, 0.3);
  halo.position.set(1.15, 2.33, -0.88);
  group.add(halo);
  parts.halo = halo;
  // the shot: glass, spirit, flame (a group, so that it can be lifted), the empties beside it
  const glass = new THREE.Group();
  const glassMesh = meshOf(new THREE.CylinderGeometry(0.024, 0.019, GLASS_H, 14, 1, true), new THREE.MeshBasicNodeMaterial({ color: 0xbfe0f0, transparent: true, opacity: 0.32, depthWrite: false }));
  glassMesh.position.y = GLASS_H / 2;
  const spirit = meshOf(new THREE.CylinderGeometry(0.0215, 0.019, GLASS_H * 0.72, 12), new THREE.MeshBasicNodeMaterial({ color: 0xd9a12b, transparent: true, opacity: 0.85 }));
  spirit.position.y = GLASS_H * 0.36;
  const flameMat = new THREE.MeshBasicNodeMaterial({ color: 0x4f9dff, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const coreMat = new THREE.MeshBasicNodeMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flameGeo = new THREE.LatheGeometry([[0.012, 0], [0.021, 0.018], [0.018, 0.042], [0.009, 0.072], [0, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 10);
  const flame = meshOf(flameGeo, flameMat);
  const core = meshOf(flameGeo, coreMat);
  flame.position.y = core.position.y = GLASS_H * 0.74;
  const flameGlow = glow(0.28, 0.28, 0x4f9dff, 0.25);
  flameGlow.position.y = GLASS_H + 0.05;
  glass.add(glassMesh, spirit, flame, core, flameGlow);
  glass.position.set(0, COUNTER_Y, 0.02);
  group.add(glass);
  Object.assign(parts, { glass, spirit, flame, core, flameGlow, flameMat });
  // the empties: one geometry, shown as the evening goes on
  const emptyMat = new THREE.MeshBasicNodeMaterial({ color: 0xc8e4f2, transparent: true, opacity: 0.4, depthWrite: false });
  const emptyGeo = new THREE.CylinderGeometry(0.024, 0.019, GLASS_H, 10, 1, true);
  parts.empties = [];
  for (let i = 0; i < FLAEMMLI.rounds; i++) {
    const m = meshOf(emptyGeo, emptyMat);
    m.position.set(0.14 + (i % 3) * 0.075, COUNTER_Y + GLASS_H / 2, -0.04 - Math.floor(i / 3) * 0.08);
    m.visible = false;
    group.add(m);
    parts.empties.push(m);
  }
  // the lighter
  const lighter = new THREE.Group();
  lighter.add(solid([box(0.022, 0.06, 0.012, 0, 0, 0, 0xc23a2c), box(0.022, 0.012, 0.012, 0, 0.036, 0, 0xcfd3d8)]));
  const small = meshOf(new THREE.ConeGeometry(0.007, 0.032, 8), new THREE.MeshBasicNodeMaterial({ color: 0xffb648, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  small.position.y = 0.06;
  lighter.add(small);
  lighter.visible = false;
  group.add(lighter);
  parts.lighter = lighter;
}

const FLAME_BLUE = new THREE.Color(0x4f9dff), FLAME_YELLOW = new THREE.Color(0xffc14a), FLAME_RED = new THREE.Color(0xff4a20);
const _flameCol = new THREE.Color();

const flaemmli = {
  setup(run) {
    addStyle(run);
    const hud = el('div', 'gs-hud');
    hud.hidden = true;
    const pop = el('div', 'gs-pop');
    const card = el('div', 'gs-card');
    const line = el('div');
    const label = el('div');
    const gauge = el('div', 'gs-gauge'), zone = el('span', 'gs-zone'), needle = el('span', 'gs-needle');
    gauge.append(zone, needle);
    card.append(line, label, gauge);
    const act = el('button', 'gs-act', 'Order a Flämmli');
    act.type = 'button';
    hud.append(pop, card, act);
    const veil = el('div', 'gs-veil');
    veil.hidden = true;
    document.body.append(veil, hud);
    run.cleanups.push(() => { hud.remove(); veil.remove(); });
    run.fl = { room: null, parts: null, crowd: null, ui: { hud, pop, line, label, gauge, zone, needle, act, veil }, seq: 0, lift: 0, swayT: 0, shown: 0 };
    run.listen(act, 'pointerdown', (e) => { e.preventDefault(); flaemmli.press(run); });
  },
  reset(run) {
    const fl = run.fl;
    fl.room?.dispose(); fl.room = null;
    fl.ui.hud.hidden = true; fl.ui.veil.hidden = true;
    fl.seq = 0; fl.lift = 0; fl.swayT = 0; fl.shown = 0;
    if (run.state) { run.state.game = null; run.state.inside = false; }
  },
  teardown(run) { run.fl.room?.dispose(); run.fl.room = null; },
  key(run, e) {
    if (!run.fl.room || !gameKey(e.code)) return;
    swallow(e);
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) flaemmli.press(run);
  },
  press(run) {
    const g = run.state?.game;
    if (!g || !live(run)) return;
    const what = flaemmliAction(g);
    if (!what) return;
    blip(run, what === 'light' || what === 'blow' ? 'fwoosh' : what === 'miss' ? 'bad' : 'pock');
    if (what === 'drink') run.fl.lift = 0.55;
  },
  enter(run) {
    const fl = run.fl;
    const parts = fl.parts = {};
    fl.room = new Room(run, run.def.interior.door, (group) => {
      buildBar(group, parts);
      fl.crowd = makeCrowd([{ x: window.innerHeight > window.innerWidth ? -0.42 : -0.72, z: -1.15, yaw: 0.35 }, { x: 1.35, z: 0.42, yaw: -1.9, female: true }, { x: -1.55, z: 0.5, yaw: 1.9 }], group);
    });
    run.state.game = createFlaemmli(11);
    run.state.inside = true;
    fl.ui.hud.hidden = false;
  },
  update(run, ctx, dt) {
    const fl = run.fl;
    if (!fl.room && run.def.objectives[run.index]?.id === 'flaemmli' && live(run)) flaemmli.enter(run);
    const g = run.state?.game;
    if (!fl.room || !g) return;
    const before = g.step;
    flaemmliStep(g, dt);
    fl.swayT += dt;
    if (fl.lift > 0) fl.lift = Math.max(0, fl.lift - dt);
    if (before === 'burn' && g.step === 'pause') blip(run, 'bad');
    if (g.last && g.last.seq !== fl.seq) { fl.seq = g.last.seq; flashPop(fl.ui.pop, g.last); if (g.last.good) blip(run, 'good'); }
  },
  after(run, ctx, dt) {
    const fl = run.fl;
    if (!live(run)) fl.ui.hud.hidden = true;
    fl.ui.veil.hidden = !fl.room || run.phase === 'aborted' || !run.state?.game?.drinks;
    if (!fl.room || run.phase === 'aborted') return;
    const g = run.state.game, p = fl.parts;
    if (!g) return;
    // the camera: at the bar, looking down at the glass with the landlord behind it; it strays with each drink
    const portrait = window.innerHeight > window.innerWidth;
    const s = flaemmliSway(fl.swayT, g.drinks);
    fl.room.camera(ctx.camera, { x: s.x, y: 1.46 + s.y, z: portrait ? 1.5 : 1.02 }, { x: s.lookX, y: COUNTER_Y + (portrait ? 0.3 : 0.2) + s.lookY, z: -0.3 }, s.roll);
    poseCrowd(fl.crowd, dt);
    // the glass: none while ordering; lifted to the lips when downed; the flame by the step
    const drinking = fl.lift > 0;
    p.glass.visible = drinking || (g.step !== 'order' && g.step !== 'pause');
    p.spirit.visible = !drinking;
    if (drinking) {
      const k = 1 - fl.lift / 0.55;
      p.glass.position.set(0, COUNTER_Y + Math.sin(Math.min(1, k * 1.4) * Math.PI / 2) * 0.24, 0.02 + k * 0.32);
      p.glass.rotation.x = -k * 1.9;
    } else { p.glass.position.set(0, COUNTER_Y, 0.02); p.glass.rotation.x = 0; }
    const burning = g.step === 'burn';
    p.flame.visible = p.core.visible = p.flameGlow.visible = burning;
    if (burning) {
      const L = g.level;
      const flick = 1 + 0.12 * Math.sin(g.t * 31) + 0.08 * Math.sin(g.t * 47 + 1);
      const h = (0.35 + 1.5 * Math.min(1, L / 0.62) + Math.max(0, L - 0.72) * 2.4) * flick;
      p.flame.scale.set(0.8 + L * 0.5, h, 0.8 + L * 0.5);
      p.core.scale.set(0.45, h * 0.55, 0.45);
      // yellow as it catches, blue in its prime, orange-red when the glass is getting too hot
      if (L < 0.45) _flameCol.copy(FLAME_YELLOW).lerp(FLAME_BLUE, L / 0.45);
      else if (L < 0.72) _flameCol.copy(FLAME_BLUE);
      else _flameCol.copy(FLAME_BLUE).lerp(FLAME_RED, clamp((L - 0.72) / 0.2, 0, 1));
      p.flameMat.color.copy(_flameCol);
      p.flameGlow.material.color.copy(_flameCol);
      p.flameGlow.quaternion.copy(ctx.camera.quaternion);
    }
    // the lighter swings over the bar
    const gauge = flaemmliGauge(g);
    p.lighter.visible = g.step === 'light';
    if (p.lighter.visible) p.lighter.position.set((gauge.value - 0.5) * 0.46, COUNTER_Y + GLASS_H + 0.05, 0.02);
    p.halo.quaternion.copy(ctx.camera.quaternion);
    p.halo.material.opacity = 0.26 + 0.05 * Math.sin(fl.swayT * 1.7);
    if (fl.shown !== g.drinks) { fl.shown = g.drinks; p.empties.forEach((m, i) => { m.visible = i < g.drinks; }); }
    // the HUD: one line, one gauge, one button
    const ui = fl.ui;
    setText(ui.line, `Round ${g.round} of ${FLAEMMLI.rounds} · ${flaemmliScore(g)} pts · ${g.strikes}/${FLAEMMLI.strikes} mishaps`);
    setText(ui.label, gauge.label);
    ui.gauge.toggleAttribute('data-off', gauge.value === null);
    if (gauge.value !== null) {
      ui.zone.style.left = `${gauge.lo * 100}%`; ui.zone.style.width = `${(gauge.hi - gauge.lo) * 100}%`;
      ui.needle.style.left = `${gauge.value * 100}%`;
    }
    ui.act.disabled = !gauge.button;
    setText(ui.act, gauge.button || '…');
    ui.veil.style.opacity = `${clamp(g.drinks / FLAEMMLI.rounds, 0, 1) * 0.85}`;
  }
};

// =====================================================================================================================
// 2. Pizza Heaven
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
      flashPop(pz.ui.drivePop, { text: `${stop.short}: ${Math.round(d.heat * 100)} % hot`, points: d.points, good: d.heat > 0.25 });
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
        setText(pz.ui.line, `Pizza ${Math.min(s.order + 1, PIZZA_ORDERS.length)} of ${PIZZA_ORDERS.length}: ${order.name} for ${stop.short}`);
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
    setText(pz.ui.dline, `Hot pizzas ${Math.round(st.heat * 100)} % · ${st.delivered}/${PIZZA_STOPS.length} delivered · ${pizzaScore(run.state)} pts${st.carrying ? ' · carrying a box' : ''}`);
    pz.ui.heatFill.style.transform = `scaleX(${st.heat})`;
  }
};

export const GASTRO_FEATURES = { flaemmli, pizzaRun };
// (the indoor framework, for js/missions-bars.js)
export { el, clamp, live, swallow, gameKey, addStyle, paint, box, cyl, solid, meshOf, textPlane, glow, makeCrowd, poseCrowd, Room, blip, flashPop };
