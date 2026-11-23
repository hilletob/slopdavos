import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { groundHeight } from './terrain.js';
import { QUALITY } from './quality.js';
import { t as tr } from './i18n.js';
import { cheerArms } from './missions-sport.js';
import {
  ROOF, ROLES, SPIT, yardToWorld, eyeAt, clampAim, startHock, releaseHock, setDuck, hockLevel, stepBreak, comboMult
} from './missions-data-samd.js';
import { el } from './dom.js';

// js/missions-samd.js
// The runtime of the long break on the SAMD's roof (js/missions-data-samd.js; SAMD_FEATURES merged into js/missions.js
// FEATURES):
//   samdRoof — once the walk has reached the side door, the boys are up: the walker frozen and out of sight, the camera
//              at the parapet looking down over the yard (the building's own parapet in front), the reticle on the ground
//              (mouse: where it points; touch: a drag moves it; W/A/S/D, the arrows or the d-pad: moved), Space / the
//              mouse button / the Hock button held to hock, let go to drop; C / Shift / the Duck button held to duck
//              behind the parapet. The yard's people are the city's figures (js/pedestrians.js, one small crowd of
//              their own), the dog and the cyclist simple meshes; the gobs, the splats on the ground and on the heads
//              are pooled meshes. A hit: the walker stops, turns to the school, shakes both fists (cheerArms) and
//              shouts (a speech bubble), the points pop. The HUD at the bottom: the wind's arrow (in the view's frame),
//              the hock and the suspicion. The Rektor, the teacher and the hands-off ones wear a tag.
// Everything goes with the run's group and its cleanups; the walker, the camera's field of view and the key bar are
// given back when the break ends or the run is torn down.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const isTouch = () => document.body.classList.contains('touch-enabled') || matchMedia('(pointer: coarse)').matches;
const MAX_PEOPLE = QUALITY.mobile ? 12 : 16;
const AIM_SPEED = 9; // m/s: the keys move the reticle
const rigGround = (_owner, x, z) => groundHeight(x, z); // (js/pedestrians.js PersonRig asks ground(owner, x, z))

const STYLE = `
.samd-hud{position:fixed;left:50%;bottom:calc(var(--keybar-clear,86px) + 10px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:31;pointer-events:none;
  display:flex;gap:14px;align-items:center;padding:7px 14px;border-radius:14px;background:rgba(10,14,22,.72);backdrop-filter:blur(6px);
  color:#fff;font:700 12px/1.2 Inter,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);white-space:nowrap}
.samd-hud[hidden],.samd-cross[hidden],.samd-big[hidden],.samd-tag[hidden],.samd-bubble[hidden]{display:none!important}
.samd-wind{display:flex;align-items:center;gap:6px}
.samd-wind i{display:inline-block;font-style:normal;font-size:20px;line-height:20px;color:#9fe3ff;transition:transform .2s}
.samd-meter{display:flex;align-items:center;gap:6px}
.samd-meter b{display:block;width:84px;height:8px;border-radius:4px;background:rgba(255,255,255,.18);overflow:hidden}
.samd-meter b span{display:block;height:100%;width:0;background:#9be15d;border-radius:4px}
.samd-meter.sus b span{background:linear-gradient(90deg,#ffd23f,#ff5a3c)}
.samd-meter.sus.hot{color:#ff8a6a}
.samd-layer{position:fixed;inset:0;z-index:30;pointer-events:none;overflow:hidden;font:800 12px/1.2 Inter,system-ui,sans-serif}
.samd-tag{position:absolute;left:0;top:0;transform:translate(-50%,-100%);padding:2px 7px;border-radius:9px;background:rgba(12,18,28,.75);color:#fff;white-space:nowrap}
.samd-tag.no{background:rgba(190,30,30,.85)}
.samd-tag.vip{background:rgba(214,160,20,.92);color:#1a1200}
.samd-bubble{position:absolute;left:0;top:0;transform:translate(-50%,-100%);max-width:220px;padding:6px 10px;border-radius:12px;background:#fff;color:#111;
  font:800 13px/1.25 "Comic Sans MS","Chalkboard SE",Inter,system-ui,sans-serif;box-shadow:0 3px 10px rgba(0,0,0,.35);text-align:center;white-space:normal}
.samd-bubble::after{content:'';position:absolute;left:50%;bottom:-7px;margin-left:-7px;border:7px solid transparent;border-bottom:0;border-top-color:#fff}
.samd-pop{position:absolute;left:0;top:0;transform:translate(-50%,-100%);font:900 20px/1 Inter,system-ui,sans-serif;color:#9dff6a;text-shadow:0 2px 4px #000;transition:opacity .2s}
.samd-pop.bad{color:#ff6a5a}
.samd-big{position:fixed;left:50%;top:32%;transform:translate(-50%,-50%);z-index:32;pointer-events:none;text-align:center;color:#fff;
  font:900 44px/1.05 Inter,system-ui,sans-serif;text-shadow:0 4px 18px rgba(0,0,0,.7)}
.samd-big small{display:block;font-size:18px;font-weight:700;margin-top:6px}
.samd-sidekick{position:fixed;left:50%;bottom:calc(var(--keybar-clear,86px) + 58px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:31;pointer-events:none;
  color:#fff;font:800 15px/1.2 Inter,system-ui,sans-serif;text-shadow:0 2px 6px #000,0 0 2px #000;white-space:nowrap}
@media (max-width:640px){.samd-hud{gap:8px;padding:6px 9px;font-size:11px}.samd-meter b{width:56px}.samd-big{font-size:32px}}
`;

// --- Meshes ---------------------------------------------------------------------------------------------------------------
function paint(g, col) {
  g = g.index ? g.toNonIndexed() : g;
  const count = g.attributes.position.count, c = new THREE.Color(col), out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d, x, y, z, col, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return paint(g, col); };
const cyl = (r, h, x, y, z, col, axis = 'y') => { const g = new THREE.CylinderGeometry(r, r, h, 10); if (axis === 'x') g.rotateZ(Math.PI / 2); g.translate(x, y, z); return paint(g, col); };
const torusX = (r, t, x, y, z, col) => { const g = new THREE.TorusGeometry(r, t, 6, 18); g.rotateY(Math.PI / 2); g.translate(x, y, z); return paint(g, col); };

/** Bläss, the caretaker's Appenzeller: black and tan with the white blaze, along +z */
function dogGeometry() {
  return mergeGeometries([
    box(0.26, 0.24, 0.62, 0, 0.42, 0, '#1f1a16'), box(0.22, 0.08, 0.5, 0, 0.31, 0, '#c48a3e'), // body, the tan belly
    box(0.2, 0.2, 0.24, 0, 0.6, 0.38, '#1f1a16'), box(0.1, 0.1, 0.14, 0, 0.55, 0.53, '#e9e2d6'), // head, the white muzzle
    box(0.06, 0.1, 0.05, -0.08, 0.73, 0.36, '#1f1a16'), box(0.06, 0.1, 0.05, 0.08, 0.73, 0.36, '#1f1a16'), // ears
    ...[[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]].map(([x, z]) => box(0.07, 0.32, 0.07, x, 0.16, z, '#c48a3e')),
    box(0.06, 0.06, 0.22, 0, 0.6, -0.36, '#1f1a16', -0.9) // the curled tail
  ]);
}
/** A cyclist on a city bike, along +z (a simple figure: the bike is quick, nobody looks closely) */
function cyclistGeometry() {
  return mergeGeometries([
    torusX(0.34, 0.035, 0, 0.34, 0.55, '#202020'), torusX(0.34, 0.035, 0, 0.34, -0.55, '#202020'),
    box(0.05, 0.05, 1.0, 0, 0.6, 0, '#c22d2d', 0.25), box(0.05, 0.5, 0.05, 0, 0.62, -0.2, '#c22d2d'), box(0.5, 0.04, 0.04, 0, 1.0, 0.45, '#333'),
    box(0.34, 0.55, 0.24, 0, 1.25, -0.08, '#2a6fdb', -0.35), box(0.22, 0.24, 0.22, 0, 1.66, 0.04, '#e0b48e'), box(0.25, 0.12, 0.27, 0, 1.8, 0.03, '#f2f2f2'), // jacket, head, helmet
    box(0.12, 0.5, 0.14, -0.1, 0.78, -0.05, '#1c2333', 0.5), box(0.12, 0.5, 0.14, 0.1, 0.78, -0.05, '#1c2333', 0.5), // legs
    box(0.08, 0.45, 0.08, -0.18, 1.18, 0.22, '#2a6fdb', 1.1), box(0.08, 0.45, 0.08, 0.18, 1.18, 0.22, '#2a6fdb', 1.1) // arms to the bars
  ]);
}

const _ndc = new THREE.Vector2(), _ray = new THREE.Raycaster(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3(), _p = new THREE.Vector3();

/** A small sound on the city's mix (silent when off): the spit, the splat, the bell */
function blip(run, kind) {
  const a = run.hooks.audio;
  if (!a || !a.enabled || !a.context || a.context.state !== 'running' || !a.mix) return;
  const ctx = a.context, t = ctx.currentTime, g = ctx.createGain();
  g.connect(a.mix);
  if (kind === 'bell') {
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = i % 2 ? 1180 : 1320;
      og.gain.setValueAtTime(0.0001, t + i * 0.22); og.gain.exponentialRampToValueAtTime(0.22, t + i * 0.22 + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.5);
      o.connect(og).connect(g); o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.55);
    }
    return;
  }
  const len = kind === 'spit' ? 0.12 : 0.22;
  const n = Math.floor(ctx.sampleRate * len), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, kind === 'spit' ? 2 : 3);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = kind === 'spit' ? 'bandpass' : 'lowpass'; f.frequency.value = kind === 'spit' ? 2600 : 700;
  g.gain.value = kind === 'spit' ? 0.35 : 0.6;
  src.connect(f).connect(g); src.start(t);
}

// --- The feature ------------------------------------------------------------------------------------------------------------
const samdRoof = {
  // (the game's own controls step aside while the boys are on the roof)
  ownControls: (run) => !!run.samd?.up,
  setup(run) {
    const css = el('style'); css.textContent = STYLE; document.head.append(css); run.cleanups.push(() => css.remove());
    const S = run.samd = { up: false, aim: yardToWorld(0, 20), keys: { up: 0, down: 0, left: 0, right: 0 }, rigs: new Map(), tags: new Map(), bubbles: [], pops: [], duckK: 0, fov: null, held: null, t: 0, bigT: 0 };
    // the yard's people
    S.crowd = new PersonCrowd(MAX_PEOPLE, { farDistance: 40, castShadow: !QUALITY.mobile });
    for (const m of S.crowd.meshes) run.group.add(m);
    // the dog and the cyclist, the gobs, the splats, the reticle (shared geometries and materials)
    const vmat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8 });
    S.dogGeo = dogGeometry(); S.bikeGeo = cyclistGeometry();
    S.dogs = []; S.bikes = [];
    for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(S.dogGeo, vmat); d.visible = false; S.dogs.push(d); const b = new THREE.Mesh(S.bikeGeo, vmat); b.visible = false; S.bikes.push(b); run.group.add(d, b); }
    const gobMat = new THREE.MeshStandardNodeMaterial({ color: 0xdfe8c8, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.88 });
    const gobGeo = new THREE.SphereGeometry(1, 10, 8);
    S.gobs = [];
    for (let i = 0; i < SPIT.maxGobs; i++) { const g = new THREE.Mesh(gobGeo, gobMat); g.visible = false; S.gobs.push(g); run.group.add(g); }
    const splatGeo = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
    const splatMat = new THREE.MeshBasicNodeMaterial({ color: 0xe6efd0, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    S.splats = [];
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(splatGeo, splatMat); m.visible = false; m.renderOrder = 5; S.splats.push({ mesh: m, t: 0 }); run.group.add(m); }
    S.blobs = [];
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(gobGeo, gobMat); m.visible = false; m.scale.set(0.14, 0.06, 0.14); S.blobs.push({ mesh: m, t: 0, id: 0 }); run.group.add(m); }
    S.splatI = 0; S.blobI = 0;
    const ringMat = new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const fillMat = new THREE.MeshBasicNodeMaterial({ color: 0x9be15d, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const reticle = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 28).rotateX(-Math.PI / 2), ringMat);
    const cross = new THREE.Mesh(mergeGeometries([new THREE.PlaneGeometry(0.06, 0.5).rotateX(-Math.PI / 2), new THREE.PlaneGeometry(0.5, 0.06).rotateX(-Math.PI / 2)]), ringMat);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2), fillMat);
    for (const m of [ring, cross, fill]) m.renderOrder = 996;
    reticle.add(ring, cross, fill);
    reticle.visible = false;
    S.reticle = reticle; S.fill = fill;
    run.group.add(reticle);
    // the HUD: the wind, the hock, the suspicion; Mätti's line; the tags, bubbles and pops over the yard; the big text
    const hud = el('div', 'samd-hud'); hud.hidden = true;
    const wind = el('span', 'samd-wind'); S.windLabel = el('span', null, 'Wind'); S.windArrow = el('i', null, '↑'); S.windSpeed = el('span', null, '');
    wind.append(S.windLabel, S.windArrow, S.windSpeed);
    const hock = el('span', 'samd-meter'); S.hockLabel = el('span', null, 'Hock'); const hb = el('b'); S.hockBar = el('span'); hb.append(S.hockBar); hock.append(S.hockLabel, hb);
    const sus = el('span', 'samd-meter sus'); S.susLabel = el('span', null, 'Suspicion'); const sb = el('b'); S.susBar = el('span'); sb.append(S.susBar); sus.append(S.susLabel, sb);
    S.susBox = sus;
    hud.append(wind, hock, sus);
    const layer = el('div', 'samd-layer');
    const side = el('div', 'samd-sidekick'); side.hidden = true;
    const big = el('div', 'samd-big'); big.hidden = true;
    document.body.append(hud, layer, side, big);
    run.cleanups.push(() => { hud.remove(); layer.remove(); side.remove(); big.remove(); });
    Object.assign(S, { hud, layer, side, big });
    // the controls: the register's (key bar, touch buttons, gamepad); the keys themselves go through key() below
    const roof = () => S.up && live(run);
    const st = () => run.state?.brk;
    const aimKey = (dir) => (on) => { S.keys[dir] = on ? 1 : 0; };
    run.actions([
      { kind: 'hint', kbd: isTouch() ? ['Drag'] : ['Mouse', 'W', 'A', 'S', 'D'], label: 'aim', when: roof },
      { id: 'samd-hock', kind: 'hold', primary: true, label: 'Hock, let go to drop', touchLabel: 'Hock', glyph: '💧', keys: ['Space'], kbd: ['Space', 'Click'], keyboard: false, pad: 'a', when: roof,
        run: (on) => { const b = st(); if (!b) return; if (on) startHock(b); else samdRoof.drop(run); } },
      { id: 'samd-duck', kind: 'hold', primary: true, label: 'Duck', touchLabel: 'Duck', glyph: '⬇', keys: ['KeyC'], kbd: ['C'], keyboard: false, pad: 'b', when: roof,
        run: (on) => { const b = st(); if (b) setDuck(b, on); } },
      ...['up', 'down', 'left', 'right'].map((dir) => ({ id: `samd-${dir}`, kind: 'hold', label: 'aim', pad: dir, touch: false, hint: false, when: roof, run: aimKey(dir) }))
    ]);
    // the pointer: the mouse points at the yard (its button hocks); a finger drags the reticle along
    const canvas = document.getElementById('canvas-container');
    let touch = null;
    run.listen(canvas, 'pointermove', (e) => {
      if (!roof()) return;
      if (e.pointerType === 'touch') {
        if (!touch || touch.id !== e.pointerId) return;
        const a = samdRoof.groundAt(run, touch.x, touch.y), b = samdRoof.groundAt(run, e.clientX, e.clientY);
        touch.x = e.clientX; touch.y = e.clientY;
        if (a && b) S.aim = clampAim(S.aim.x + (b.x - a.x) * 1.2, S.aim.z + (b.z - a.z) * 1.2);
        return;
      }
      const p = samdRoof.groundAt(run, e.clientX, e.clientY);
      if (p) S.aim = clampAim(p.x, p.z);
    });
    run.listen(canvas, 'pointerdown', (e) => {
      if (!roof()) return;
      if (e.pointerType === 'touch') { touch = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
      if (e.button === 0) { const b = st(); if (b) { startHock(b); S.mouseHock = true; } }
    });
    run.listen(window, 'pointerup', (e) => {
      if (touch && e.pointerId === touch.id) { touch = null; return; }
      if (S.mouseHock) { S.mouseHock = false; samdRoof.drop(run); }
    });
    run.listen(window, 'keyup', (e) => {
      const dir = AIM_KEYS[e.code];
      if (dir) S.keys[dir] = 0;
      if (e.code === 'Space' && S.keyHock) { S.keyHock = false; samdRoof.drop(run); }
      if ((e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && run.state?.brk) setDuck(run.state.brk, false);
    }, { capture: true });
    run.listen(window, 'blur', () => { S.keys = { up: 0, down: 0, left: 0, right: 0 }; });
  },
  reset(run) {
    const S = run.samd;
    samdRoof.down(run);
    for (const r of S.rigs.keys()) S.rigs.delete(r);
    for (const tag of S.tags.values()) tag.remove();
    S.tags.clear();
    for (const b of S.bubbles) b.node.remove();
    for (const p of S.pops) p.node.remove();
    S.bubbles.length = 0; S.pops.length = 0;
    for (const s of S.splats) s.mesh.visible = false;
    for (const b of S.blobs) b.mesh.visible = false;
    S.aim = yardToWorld(0, 20);
    S.big.hidden = true; S.side.hidden = true;
  },
  teardown(run) { samdRoof.down(run); },
  key(run, e) {
    const S = run.samd;
    if (!S.up || !live(run)) return;
    const swallow = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    const dir = AIM_KEYS[e.code];
    if (dir) { swallow(); S.keys[dir] = 1; return; }
    const b = run.state?.brk;
    if (e.code === 'Space') { swallow(); if (!e.repeat && b && startHock(b)) S.keyHock = true; return; }
    if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { swallow(); if (b) setDuck(b, true); }
  },
  /** The yard's ground under a screen point */
  groundAt(run, sx, sy) {
    const cam = run.hooks.cameraSystem?.camera;
    if (!cam) return null;
    _ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    _ray.setFromCamera(_ndc, cam);
    // (the yard slopes a couple of metres: the plane is moved to the ground where the ray met it, twice)
    let y = groundHeight(ROOF.x, ROOF.z);
    for (let i = 0; i < 3; i++) {
      _plane.constant = -y;
      if (!_ray.ray.intersectPlane(_plane, _hit)) return null;
      y = groundHeight(_hit.x, _hit.z);
    }
    return { x: _hit.x, z: _hit.z };
  },
  drop(run) {
    const b = run.state?.brk;
    if (!b || b.mouth !== 'hocking') return;
    releaseHock(b, run.samd.aim, groundHeight);
  },
  /** Up through the hatch: the walker waits below, out of sight; the camera is the boys' */
  up(run) {
    const S = run.samd, cm = run.hooks.controllerManager, cam = run.hooks.cameraSystem?.camera;
    if (S.up) return;
    S.up = true;
    S.held = { had: 'personDriver' in cm, prev: cm.personDriver };
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; };
    cm.setEntityHidden?.('person', true);
    if (cam) S.fov = cam.fov;

    run.state.brk.onRoof = true;
    run.hooks.actions?.notify();
  },
  /** Back down (the bell, the Hausmeister, a restart, the end of the run) */
  down(run) {
    const S = run.samd;
    if (!S?.up) return;
    S.up = false;
    const cm = run.hooks.controllerManager, cam = run.hooks.cameraSystem?.camera;
    const h = S.held; S.held = null;
    if (h) { if (h.had) cm.personDriver = h.prev ?? null; else delete cm.personDriver; }
    cm.setEntityHidden?.('person', false);
    if (cam && S.fov) { cam.fov = S.fov; cam.updateProjectionMatrix(); S.fov = null; }
    S.reticle.visible = false; S.hud.hidden = true; S.side.hidden = true;
    for (const tag of S.tags.values()) tag.hidden = true;
    S.keys = { up: 0, down: 0, left: 0, right: 0 };
    run.hooks.cameraSystem?.resetForTeleport?.();
    run.hooks.actions?.notify();
  },
  update(run, ctx, dt) {
    const S = run.samd, b = run.state?.brk;
    if (!b) return;
    if (!S.up && run.index >= 1 && live(run) && !b.over) samdRoof.up(run);
    S.t += dt;
    // the keys move the reticle in the view's frame: W away over the yard, A / D along it
    const mx = S.keys.right - S.keys.left, my = S.keys.up - S.keys.down;
    if (S.up && (mx || my)) S.aim = clampAim(S.aim.x + (ROOF.U.x * mx + ROOF.V.x * my) * AIM_SPEED * dt, S.aim.z + (ROOF.U.z * mx + ROOF.V.z * my) * AIM_SPEED * dt);
    stepBreak(b, dt, groundHeight);
    for (const e of b.events.splice(0)) samdRoof.event(run, e);
  },
  event(run, e) {
    const S = run.samd, b = run.state.brk;
    if (e.kind === 'spit') blip(run, 'spit');
    else if (e.kind === 'hit') {
      blip(run, 'splat');
      const blob = S.blobs[S.blobI++ % S.blobs.length];
      blob.id = e.id; blob.t = 5; blob.mesh.visible = true;
      const w = b.walkers.find((x) => x.id === e.id);
      if (w) S.bubbles.push({ node: S.layer.appendChild(el('div', 'samd-bubble', tr(e.line))), id: e.id, t: 2.8 });
      const pop = el('div', `samd-pop${e.points < 0 ? ' bad' : ''}`, `${e.points > 0 ? '+' : ''}${e.points}${e.combo >= 2 && e.points > 0 ? ` ×${comboMult(e.combo).toFixed(2).replace(/0$/, '')}` : ''}`);
      S.pops.push({ node: S.layer.appendChild(pop), x: e.x, y: e.y + 0.4, z: e.z, t: 1.3 });
    } else if (e.kind === 'splat') {
      blip(run, 'splat');
      const s = S.splats[S.splatI++ % S.splats.length];
      s.t = 6; s.mesh.visible = true; s.mesh.position.set(e.x, e.y + 0.03, e.z);
    } else if (e.kind === 'warn') blip(run, 'spit');
    else if (e.kind === 'caught') samdRoof.big(run, 'The Hausmeister!', 'Caught at the parapet: detention', 4);
    else if (e.kind === 'bell') { blip(run, 'bell'); samdRoof.big(run, 'Ring!', 'The long break is over', 3); }
    else if (e.kind === 'rektor') samdRoof.big(run, 'The Rektor!', 'Crossing the yard to the Aula', 1.8);
  },
  big(run, title, sub, s) {
    const S = run.samd;
    S.big.replaceChildren(document.createTextNode(tr(title)), el('small', null, tr(sub)));
    S.big.hidden = false; S.bigT = s;
  },
  after(run, ctx, dt) {
    const S = run.samd, b = run.state?.brk;
    if (!b) return;
    if (S.bigT > 0 && (S.bigT -= dt) <= 0) S.big.hidden = true;
    if (S.up && !live(run)) samdRoof.down(run);
    // the people of the yard
    S.crowd.begin();
    const seen = new Set();
    let di = 0, bi = 0;
    for (const w of b.walkers) {
      seen.add(w.id);
      const R = ROLES[w.role];
      if (w.role === 'dog' || w.role === 'cyclist') {
        const m = w.role === 'dog' ? S.dogs[di++] : S.bikes[bi++];
        if (!m) continue;
        const trot = w.role === 'dog' && w.state === 'walk' ? Math.abs(Math.sin(S.t * 12 + w.seed * 9)) * 0.05 : 0;
        m.visible = true; m.position.set(w.x, groundHeight(w.x, w.z) + trot, w.z); m.rotation.set(0, w.heading, w.state === 'react' && w.role === 'cyclist' ? 0.15 * Math.sin(S.t * 20) : 0);
        continue;
      }
      let rig = S.rigs.get(w.id);
      if (!rig) {
        const female = w.role === 'hausmutter' || (w.role !== 'rektor' && w.seed < 0.45);
        rig = new PersonRig({ seed: w.seed, female, hair: w.role === 'rektor' ? 0 : w.seed, girth: w.role === 'rektor' || w.role === 'hausmutter' ? 1.14 : 0.92 + w.seed * 0.15, scale: w.role === 'toddler' ? 0.55 : w.role === 'pupil' ? 0.94 + w.seed * 0.06 : 0.98 + w.seed * 0.05 });
        S.rigs.set(w.id, rig);
      }
      rig.update(dt, w.x, w.z, w.heading, rigGround);
      if (w.state === 'react') cheerArms(rig, S.t * 9 + w.seed * 5, 0.85); // (both fists shaken up at the roof)
      S.crowd.add(rig, Math.hypot(w.x - ctx.camera.position.x, w.z - ctx.camera.position.z));
      void R;
    }
    S.crowd.end();
    for (let i = di; i < S.dogs.length; i++) S.dogs[i].visible = false;
    for (let i = bi; i < S.bikes.length; i++) S.bikes[i].visible = false;
    for (const id of [...S.rigs.keys()]) if (!seen.has(id)) S.rigs.delete(id);
    // the gobs in flight (bigger with the hock), the splats fading, the blobs on the heads
    S.gobs.forEach((m, i) => {
      const g = b.gobs[i];
      m.visible = !!g;
      if (g) { m.position.set(g.x, g.y, g.z); const r = 0.05 * g.size; m.scale.set(r, r * (1 + Math.min(1.5, -g.vy * 0.08)), r); }
    });
    for (const s of S.splats) { if (!s.mesh.visible) continue; s.t -= dt; const k = clamp(s.t / 6, 0, 1); s.mesh.scale.setScalar(0.18 + 0.12 * k); if (s.t <= 0) s.mesh.visible = false; }
    for (const bl of S.blobs) {
      if (!bl.mesh.visible) continue;
      bl.t -= dt;
      const w = b.walkers.find((x) => x.id === bl.id);
      if (!w || bl.t <= 0) { bl.mesh.visible = false; continue; }
      bl.mesh.position.set(w.x, groundHeight(w.x, w.z) + ROLES[w.role].height + 0.02, w.z);
    }
    if (!S.up) { for (const p of S.pops) p.node.hidden = true; for (const bb of S.bubbles) bb.node.hidden = true; return; }
    // the camera: at the parapet, down over the yard (ducked: down behind it, looking up at the sky)
    const cam = ctx.camera;
    S.duckK += ((b.ducked ? 1 : 0) - S.duckK) * Math.min(1, dt * 8);
    const eye = eyeAt(groundHeight);
    const gy = groundHeight(ROOF.x, ROOF.z);
    const look = yardToWorld(0, 17.5);
    const portrait = window.innerHeight > window.innerWidth;
    cam.position.set(eye.x, eye.y - S.duckK * 0.2, eye.z); // (ducked the view goes up to the sky: the head stays clear of the parapet's own geometry)
    cam.up.set(0, 1, 0);
    cam.lookAt(look.x, gy + S.duckK * 30, look.z);
    const fov = portrait ? 68 : 50;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    // the reticle (and its fill with the hock)
    S.reticle.visible = !b.ducked && !b.over;
    if (S.reticle.visible) {
      S.reticle.position.set(S.aim.x, groundHeight(S.aim.x, S.aim.z) + 0.05, S.aim.z);
      const h = hockLevel(b);
      S.fill.scale.setScalar(Math.max(0.01, h));
      S.reticle.scale.setScalar(1 + 0.4 * h);
    }
    // the tags over the Rektor, the teachers and the hands-off ones
    const W = window.innerWidth, H = window.innerHeight;
    const place = (node, x, y, z) => {
      _p.set(x, y, z).project(cam);
      const on = _p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1;
      if (node.hidden === on) node.hidden = !on;
      if (on) node.style.transform = `translate(${((_p.x + 1) / 2 * W).toFixed(1)}px,${((1 - _p.y) / 2 * H).toFixed(1)}px) translate(-50%,-100%)`;
    };
    for (const w of b.walkers) {
      const R = ROLES[w.role];
      if (!(R.forbidden || w.role === 'rektor' || w.role === 'teacher') || S.bubbles.some((bb) => bb.id === w.id)) { S.tags.get(w.id)?.toggleAttribute('hidden', true); continue; }
      let tag = S.tags.get(w.id);
      if (!tag) { tag = el('div', `samd-tag ${R.forbidden ? 'no' : w.role === 'rektor' ? 'vip' : ''}`, `${tr(R.label)}${R.forbidden ? ' ✕' : ` +${R.points}`}`); S.layer.append(tag); S.tags.set(w.id, tag); }
      place(tag, w.x, groundHeight(w.x, w.z) + R.height + 0.45, w.z);
    }
    for (const [id, tag] of S.tags) if (!seen.has(id)) { tag.remove(); S.tags.delete(id); }
    // the shouts and the points
    for (let i = S.bubbles.length - 1; i >= 0; i--) {
      const bb = S.bubbles[i];
      bb.t -= dt;
      const w = b.walkers.find((x) => x.id === bb.id);
      if (bb.t <= 0 || !w) { bb.node.remove(); S.bubbles.splice(i, 1); continue; }
      place(bb.node, w.x, groundHeight(w.x, w.z) + ROLES[w.role].height + 1.1, w.z);
    }
    for (let i = S.pops.length - 1; i >= 0; i--) {
      const p = S.pops[i];
      p.t -= dt; p.y += dt * 1.2;
      if (p.t <= 0) { p.node.remove(); S.pops.splice(i, 1); continue; }
      place(p.node, p.x, p.y, p.z);
      p.node.style.opacity = String(clamp(p.t / 0.4, 0, 1));
    }
    // the HUD: the wind's arrow turned into the view (up: away over the yard), the hock, the suspicion; Mätti
    S.hud.hidden = false;
    const wv = b.windNow, vx = wv.x * ROOF.U.x + wv.z * ROOF.U.z, vy = wv.x * ROOF.V.x + wv.z * ROOF.V.z;
    S.windArrow.style.transform = `rotate(${Math.atan2(vx, vy).toFixed(2)}rad)`;
    setText(S.windLabel, tr('Wind'));
    setText(S.windSpeed, `${wv.speed.toFixed(1)} m/s`);
    setText(S.hockLabel, tr(b.mouth === 'reload' ? 'Collecting' : 'Hock'));
    S.hockBar.style.width = `${Math.round((b.mouth === 'reload' ? 0 : hockLevel(b)) * 100)}%`;
    S.hockBar.style.background = b.hockT > SPIT.hockS * 2 ? '#ff6a5a' : '';
    setText(S.susLabel, tr('Suspicion'));
    S.susBar.style.width = `${Math.round(clamp(b.suspicion, 0, 1) * 100)}%`;
    S.susBox.classList.toggle('hot', b.suspicion >= SPIT.sus.warn);
    const line = b.note ? `Mätti: ${tr(b.note)}` : '';
    S.side.hidden = !line;
    if (line) setText(S.side, line);
  }
};
const AIM_KEYS = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };

export const SAMD_FEATURES = { samdRoof };
