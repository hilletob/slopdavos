import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { ParticleBatch } from './missions-fx.js';
import { poseSkater } from './missions-ice.js';
import { t } from './i18n.js';
import {
  SHOE, createShoer, shoeStep, shoeRest, shoeTap, beatNeedle, onPackedLine, packedShare, shoeScore,
  CAST, CAST_STAGES, createCastGame, castStep, castPickLeg, castPickLength, castConfirm, castInk, castGaps, castLumps, padShare, wrapSpeed, wetWindow
} from './missions-data-care.js';

// js/missions-care.js
// The runtime of the two gentle jobs (js/missions-data-care.js has their definitions and the pure logic): js/missions.js
// merges CARE_FEATURES into its features, a mission asks for one by def.features.
//  - snowshoes: the controllers' personDriver steps the walker through the snow (shoeStep), the skin walks as ever and two
//    snowshoes follow its feet. One merged mesh holds the flags, the line's stakes, the zone's fence and the bench; the
//    packed line is one strip, the track one ring buffer of footprints (a single dynamic mesh, FOOTPRINTS at most).
//  - castRoom: the plaster room on a canvas over the view, the walker waiting at the door (as js/missions-resort.js waxBench).
// Everything is built on demand and goes with the run's group or its cleanups; the games run on the mission's frame time.

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'running' || run.phase === 'ready';
const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };

const STYLE = `
.cr-hud{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:40;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#fff;width:min(460px,calc(100vw - 20px))}
.cr-hud[hidden],.cr-game[hidden]{display:none!important}
.cr-card{background:rgba(10,12,20,.8);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:8px 12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:13px;font-variant-numeric:tabular-nums;text-align:center}
.cr-card b{font-size:18px}
.cr-pop{font:900 22px Inter,system-ui,sans-serif;color:#ffe14f;text-shadow:0 2px 14px rgba(0,0,0,.6);min-height:28px;text-align:center}
.cr-pop.bad{color:#ff6b6b}
.cr-row{display:flex;align-items:center;gap:8px;width:100%;font-size:12px;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,.7)}
.cr-row>span:first-child{width:62px;text-align:right}
.cr-bar{position:relative;flex:1;height:14px;border-radius:7px;background:rgba(10,12,20,.75);border:1px solid rgba(255,255,255,.2);overflow:hidden}
.cr-bar i{position:absolute;top:0;bottom:0;display:block}
.cr-bar .fill{left:0;background:linear-gradient(90deg,#ff7a59,#ffd34f 45%,#6fe27d)}
.cr-bar .zone{background:rgba(120,235,120,.55)}
.cr-bar .needle{width:4px;margin-left:-2px;background:#fff;box-shadow:0 0 6px #fff}
.cr-keys{font-size:12px;opacity:.85;text-shadow:0 1px 4px rgba(0,0,0,.7)}
body.touch-enabled .cr-keys{display:none}
body.touch-enabled .cr-hud{bottom:calc(max(12px,env(safe-area-inset-bottom)) + 200px)}
.cr-game{position:fixed;inset:0;z-index:38;display:flex;align-items:flex-start;justify-content:center;padding-top:196px;box-sizing:border-box;background:rgba(12,18,20,.88);font-family:Inter,system-ui,sans-serif;color:#fff}
.cr-game-box{display:flex;flex-direction:column;gap:8px;align-items:center;max-width:calc(100vw - 16px)}
.cr-game canvas{border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.5);touch-action:none;max-width:calc(100vw - 16px);background:#222}
body.cr-busy .controls-hint,body.cr-busy .gta-prompt,body.cr-busy .touch-use,body.cr-busy .mission-prompt,body.cr-busy #touch-controls{display:none!important}
@media (max-width:640px){.cr-game{padding-top:calc(env(safe-area-inset-top,0px) + 168px)}}
@media (max-height:500px){.cr-game{padding-top:4px;z-index:46}.cr-game .cr-card{padding:2px 8px;font-size:11px}.cr-game-box{gap:3px}.cr-hud{bottom:4px;gap:3px}.cr-pop{font-size:16px;min-height:18px}}
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
const box = (w, h, d, x, y, z, col, yaw = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (yaw) g.rotateY(yaw); g.translate(x, y, z); return paint(g, col); };
const litMat = () => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });

/** A small sound on the city's mix (silent when off) */
function blip(run, kind = 'pock') {
  const a = run.hooks.audio;
  if (!a || !a.enabled || !a.context || a.context.state !== 'running' || !a.mix) return;
  const ctx = a.context, now = ctx.currentTime, g = ctx.createGain();
  g.connect(a.mix);
  if (kind === 'crunch' || kind === 'flap') {
    const n = Math.floor(ctx.sampleRate * (kind === 'flap' ? 0.5 : 0.12)), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5) * (kind === 'flap' ? 0.5 + 0.5 * Math.sign(Math.sin(i / 320)) : 1);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'flap' ? 1400 : 2400;
    g.gain.value = kind === 'flap' ? 0.5 : 0.16;
    src.connect(f).connect(g); src.start(now);
    return;
  }
  const o = ctx.createOscillator(); o.type = kind === 'good' ? 'triangle' : 'sine';
  o.frequency.setValueAtTime(kind === 'good' ? 880 : kind === 'bad' ? 180 : 520, now);
  if (kind === 'good') o.frequency.setValueAtTime(1320, now + 0.08);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.3, now + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'good' ? 0.22 : 0.09));
  o.connect(g); o.start(now); o.stop(now + 0.25);
}

/** The touch screens' action button ("Jump") relabelled for the mission; given back at the end */
function touchLabel(run, text) {
  const label = document.querySelector('[data-touch-label="up"]'), button = document.querySelector('[data-touch-action="up"]');
  if (!label) return;
  const old = label.textContent;
  run.cleanups.push(() => { label.textContent = old; button?.setAttribute('aria-label', old); });
  label.textContent = t(text);
  button?.setAttribute('aria-label', t(text));
}

// =====================================================================================================================
// 1. Snowshoes
// =====================================================================================================================
const FOOTPRINTS = 600; // the ring buffer's cap
const STEP_LENGTH = 0.58; // m between two prints
const OVER_SNOW = 0.07; // m the strip and the prints lie over the ground

const STAKE_HEIGHT = 1.5;
/** The flags, the stakes along the line, the zone's fence and the bench: one merged mesh */
function buildScenery() {
  const parts = [];
  const flag = (p, col) => {
    const y = groundHeight(p.x, p.z);
    parts.push(box(0.07, 2.4, 0.07, p.x, y + 1.2, p.z, '#e8e8e0'));
    parts.push(box(0.75, 0.48, 0.03, p.x + 0.4, y + 2.15, p.z, col));
  };
  for (const p of SHOE.flags) flag(p, '#ff6a1f');
  flag(SHOE.finish, '#2fd16a');
  // the line's bamboo stakes, every 16 m on its right
  const L = SHOE.line;
  let carry = 8;
  for (let i = 0; i + 1 < L.length; i++) {
    const a = L[i], b = L[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    for (let s = carry; s < len; s += 16) {
      const x = a.x + ux * s - uz * 2.2, z = a.z + uz * s + ux * 2.2;
      const y = groundHeight(x, z);
      parts.push(box(0.05, STAKE_HEIGHT, 0.05, x, y + STAKE_HEIGHT / 2, z, '#c9a14e'), box(0.07, 0.2, 0.07, x, y + STAKE_HEIGHT - 0.1, z, '#ff6a1f'));
      carry = s + 16 - len;
    }
    if (carry >= len) carry -= len;
  }
  // the zone's fence: stakes striped red and yellow, a tape between them
  const Z = SHOE.zone, N = 28;
  const fence = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, x = Z.x + Math.cos(a) * Z.r, z = Z.z + Math.sin(a) * Z.r;
    fence.push({ x, z, y: groundHeight(x, z) });
  }
  fence.forEach((p, i) => {
    parts.push(box(0.08, 1.3, 0.08, p.x, p.y + 0.65, p.z, '#e23b2e'), box(0.09, 0.28, 0.09, p.x, p.y + 1.1, p.z, '#ffd21f'));
    const q = fence[(i + 1) % N], dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz);
    const tape = new THREE.BoxGeometry(0.03, 0.09, len);
    tape.rotateX(-Math.atan2(q.y - p.y, len));
    tape.rotateY(Math.atan2(dx, dz));
    tape.translate((p.x + q.x) / 2, (p.y + q.y) / 2 + 1.0, (p.z + q.z) / 2);
    parts.push(paint(tape, '#ffb21f'));
  });
  // the bench, looking out
  const B = SHOE.bench, by = groundHeight(B.x, B.z), v = B.view, fx = Math.sin(v), fz = Math.cos(v), rx = fz, rz = -fx;
  const at = (side, back) => ({ x: B.x + rx * side - fx * back, z: B.z + rz * side - fz * back });
  const seat = at(0, 0.05), rest = at(0, 0.32);
  parts.push(box(1.7, 0.07, 0.42, seat.x, by + 0.46, seat.z, '#7a5230', v));
  parts.push(box(1.7, 0.34, 0.05, rest.x, by + 0.8, rest.z, '#7a5230', v));
  for (const side of [-0.7, 0.7]) {
    const leg = at(side, 0.05), post = at(side, 0.32);
    parts.push(box(0.09, 0.46, 0.34, leg.x, by + 0.23, leg.z, '#4e3620', v), box(0.07, 0.96, 0.05, post.x, by + 0.48, post.z, '#4e3620', v));
  }
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geo, litMat());
  mesh.castShadow = true;
  return mesh;
}

/** The packed line: one strip draped over the ground, a point every 3 m */
function buildLineStrip() {
  const pts = [], L = SHOE.line, half = SHOE.lineHalf * 0.8;
  for (let i = 0; i + 1 < L.length; i++) {
    const a = L[i], b = L[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k < n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  pts.push(L[L.length - 1]);
  const pos = new Float32Array(pts.length * 6), index = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)], dx = q.x - o.x, dz = q.z - o.z, d = Math.hypot(dx, dz) || 1, nx = dz / d, nz = -dx / d;
    for (const [k, side] of [[0, -1], [1, 1]]) {
      const x = p.x + nx * half * side, z = p.z + nz * half * side;
      pos.set([x, groundHeight(x, z) + OVER_SNOW, z], i * 6 + k * 3);
    }
    if (i + 1 < pts.length) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(index);
  const mat = new THREE.MeshBasicNodeMaterial({ color: 0x8fb0cf, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

/** The sign of a snowshoe in the snow: an oval with its lattice */
function printTexture() {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(70,95,130,.62)';
  g.beginPath(); g.ellipse(24, 48, 21, 44, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(40,58,90,.75)'; g.lineWidth = 2;
  for (let y = 18; y < 84; y += 13) { g.beginPath(); g.moveTo(9, y); g.lineTo(39, y); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The track: a ring buffer of FOOTPRINTS quads in one dynamic mesh */
function buildPrints() {
  const pos = new Float32Array(FOOTPRINTS * 12), uv = new Float32Array(FOOTPRINTS * 8), index = new Uint16Array(FOOTPRINTS * 6);
  for (let i = 0; i < FOOTPRINTS; i++) {
    uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    const v = i * 4;
    index.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  const mat = new THREE.MeshBasicNodeMaterial({ map: printTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return {
    mesh, attr, next: 0, count: 0,
    /** A print at (x, z), its toe towards `heading` */
    stamp(x, z, heading) {
      const hw = 0.15, hl = 0.3, s = Math.sin(heading), c = Math.cos(heading), o = this.next * 12;
      const corners = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]];
      corners.forEach(([a, b], i) => {
        const px = x + c * a + s * b, pz = z - s * a + c * b;
        pos[o + i * 3] = px; pos[o + i * 3 + 1] = groundHeight(px, pz) + OVER_SNOW + 0.01; pos[o + i * 3 + 2] = pz;
      });
      this.next = (this.next + 1) % FOOTPRINTS;
      this.count = Math.min(FOOTPRINTS, this.count + 1);
      attr.needsUpdate = true;
    },
    clear() { pos.fill(0); this.next = 0; this.count = 0; attr.needsUpdate = true; }
  };
}

/** A grouse: two geometries (wings up, wings down) swapped while it flies */
function grouseGeometries() {
  const body = (wingY, wingTilt) => {
    const b = new THREE.SphereGeometry(0.16, 8, 6); b.scale(1, 0.85, 1.5); b.translate(0, 0.17, 0);
    const h = new THREE.SphereGeometry(0.08, 6, 5); h.translate(0, 0.3, 0.22);
    const parts = [paint(b, '#2a2b30'), paint(h, '#1b1c20'), box(0.07, 0.05, 0.05, 0, 0.36, 0.24, '#d8352b'), box(0.2, 0.03, 0.26, 0, 0.17, -0.3, '#17181c')];
    for (const side of [-1, 1]) {
      const w = new THREE.BoxGeometry(0.34, 0.02, 0.2);
      w.translate(side * 0.17, 0, 0);
      w.rotateZ(side * wingTilt);
      w.translate(side * 0.1, wingY, 0);
      parts.push(paint(w, '#3a3b40'));
    }
    const g = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    return g;
  };
  return [body(0.27, 0.7), body(0.2, -0.55)];
}

/** The snowshoes on the player's feet: two meshes, one geometry */
function shoeGeometry() {
  const deck = new THREE.CylinderGeometry(1, 1, 0.022, 14); deck.scale(0.13, 1, 0.31);
  const rim = new THREE.CylinderGeometry(1, 1, 0.012, 14); rim.scale(0.15, 1, 0.34); rim.translate(0, -0.012, 0);
  const strap = new THREE.BoxGeometry(0.17, 0.018, 0.05); strap.translate(0, 0.02, 0.03);
  const parts = [paint(deck, '#1e5f82'), paint(rim, '#10151c'), paint(strap, '#10151c')];
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}

const SNOWSHOES = {
  setup(run) {
    addStyle(run);
    const cm = run.hooks.controllerManager;
    const hud = el('div', 'cr-hud');
    hud.hidden = true;
    const pop = el('div', 'cr-pop', ''), card = el('div', 'cr-card', '');
    const row = (label, inner) => { const r = el('div', 'cr-row'); r.append(el('span', null, label), inner, el('span')); return r; };
    const stamina = el('div', 'cr-bar'), fill = el('i', 'fill');
    stamina.append(fill);
    const rhythm = el('div', 'cr-bar'), zone = el('i', 'zone'), needle = el('i', 'needle');
    const zoneW = Math.sin((SHOE.window / SHOE.beat) * Math.PI) * 100; // (where the needle is at the window's ends: beatNeedle)
    zone.style.left = `${50 - zoneW / 2}%`; zone.style.width = `${zoneW}%`;
    rhythm.append(zone, needle);
    hud.append(pop, row('Stamina', stamina), row('Rhythm', rhythm), card, el('div', 'cr-keys', 'W walk · A/D steer · Space on the beat: stride'));
    document.body.append(hud);
    run.cleanups.push(() => hud.remove());
    touchLabel(run, 'Step');
    // the world
    const group = new THREE.Group();
    group.name = 'Snowshoes';
    group.add(buildScenery(), buildLineStrip());
    const prints = buildPrints();
    group.add(prints.mesh);
    // the zone's two signs
    const signTex = zoneSignTexture();
    const signMat = new THREE.MeshBasicNodeMaterial({ map: signTex, side: THREE.DoubleSide });
    const signGeo = new THREE.PlaneGeometry(1.5, 0.75);
    for (const a of [-Math.PI * 0.36, Math.PI * 0.62]) {
      const x = SHOE.zone.x + Math.cos(a) * (SHOE.zone.r + 1), z = SHOE.zone.z + Math.sin(a) * (SHOE.zone.r + 1);
      const s = new THREE.Mesh(signGeo, signMat);
      s.position.set(x, groundHeight(x, z) + 1.5, z);
      s.rotation.y = Math.atan2(x - SHOE.zone.x, z - SHOE.zone.z);
      group.add(s);
    }
    // the birds and the shoes
    const birdGeos = grouseGeometries(), birdMat = litMat();
    const birds = SHOE.grouse.map((g) => { const m = new THREE.Mesh(birdGeos[0], birdMat); m.position.set(g.x, groundHeight(g.x, g.z) + 0.04, g.z); group.add(m); return m; });
    group.add(new THREE.Mesh(birdGeos[1], birdMat)); // (so that the group's teardown disposes it too)
    group.children[group.children.length - 1].visible = false;
    const shoeGeo = shoeGeometry(), shoeMat = litMat();
    const shoes = [new THREE.Mesh(shoeGeo, shoeMat), new THREE.Mesh(shoeGeo, shoeMat)];
    group.add(...shoes);
    run.group.add(group);
    const particles = new ParticleBatch(run.scene);
    run.cleanups.push(() => particles.dispose());
    run.sn = { hud, pop, card, fill, needle, prints, birds, birdGeos, shoes, particles, stepSide: 1, walked: 0, popT: 0, seen: 0 };
    cm.personDriver = (dt) => SNOWSHOES.drive(run, dt, cm);
    cm.personPoser = (dt, p) => SNOWSHOES.pose(run, dt, p, cm);
    run.cleanups.push(() => {
      cm.personDriver = null; cm.personPoser = null;
      const p = cm.entities.person;
      p.rig.placed = false; // (the walk starts afresh where the walker stands)
      p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
      p.speed = 0;
    });
  },
  reset(run) {
    const sn = run.sn, p = run.hooks.controllerManager.entities.person;
    run.state.shoer = createShoer(p.heading);
    sn.prints.clear();
    sn.walked = 0; sn.popT = 0; sn.pop.textContent = '';
    sn.hud.hidden = false;
    run._edge_up = true; // (the Enter / Start press: no step yet)
    sn.birds.forEach((m, i) => {
      const g = SHOE.grouse[i];
      m.position.set(g.x, groundHeight(g.x, g.z) + 0.04, g.z);
      m.geometry = sn.birdGeos[0];
      m.visible = true;
      m.userData.fly = null;
    });
  },
  /** The controllers' personDriver */
  drive(run, dt, cm) {
    const p = cm.entities.person, s = run.state?.shoer, sn = run.sn, k = cm.keys;
    if (!s) { p.speed = 0; return; }
    const on = !!k.up, was = !!run._edge_up;
    run._edge_up = on;
    if (run.state.seated) {
      shoeRest(s, dt);
      p.speed = 0;
      // on the seat, turning to the view
      const B = SHOE.bench, d = Math.atan2(Math.sin(B.view - p.heading), Math.cos(B.view - p.heading));
      p.heading += d * Math.min(1, dt * 2);
      s.heading = p.heading;
      p.position.x += (B.x - p.position.x) * Math.min(1, dt * 3);
      p.position.z += (B.z - p.position.z) * Math.min(1, dt * 3);
      p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person', p.position.y);
      return;
    }
    const go = live(run);
    s.heading = p.heading;
    if (go && on && !was && +k.forward > 0) SNOWSHOES.feedback(run, shoeTap(s));
    const sinH = Math.sin(p.heading), cosH = Math.cos(p.heading);
    const dir = s.speed < 0 ? -1 : 1, here = groundHeight(p.position.x, p.position.z);
    const grade = (groundHeight(p.position.x + sinH * dir * 1.5, p.position.z + cosH * dir * 1.5) - here) / 1.5;
    const packed = onPackedLine(p.position.x, p.position.z);
    const input = go ? { forward: +k.forward || 0, back: +k.backward || 0, steer: (+k.left || 0) - (+k.right || 0) } : { forward: 0, back: 0, steer: 0 };
    shoeStep(s, input, dt, { grade, packed });
    p.heading = s.heading;
    p.speed = s.speed;
    p.position.x += Math.sin(s.heading) * s.speed * dt;
    p.position.z += Math.cos(s.heading) * s.speed * dt;
    cm.resolveHorizontalCollision(p.position, 0.48, null, p);
    p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person', p.position.y);
    p.verticalVel = 0;
    // the track: a print each step, left and right of the way
    sn.walked += Math.abs(s.speed) * dt;
    if (sn.walked >= STEP_LENGTH) {
      sn.walked -= STEP_LENGTH;
      sn.stepSide = -sn.stepSide;
      const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
      sn.prints.stamp(p.position.x + rx * 0.17 * sn.stepSide, p.position.z + rz * 0.17 * sn.stepSide, s.heading);
      if (!packed) {
        sn.particles.spawn({ x: p.position.x + rx * 0.17 * sn.stepSide, y: p.position.y + 0.08, z: p.position.z + rz * 0.17 * sn.stepSide, vx: rx * 0.4 * sn.stepSide, vy: 0.9, vz: rz * 0.4 * sn.stepSide, gravity: 3, life: 0.5, size0: 0.14, size1: 0.4, alpha: 0.7, r: 1, g: 1, b: 1 });
        if (sn.stepSide > 0) blip(run, 'crunch');
      }
    }
  },
  feedback(run, kind) {
    if (kind === 'step') blip(run, 'crunch');
    else if (kind === 'stumble') { SNOWSHOES.flash(run, 'Off the beat: stumble', true); blip(run, 'bad'); }
  },
  flash(run, text, bad = false) {
    const sn = run.sn;
    sn.pop.textContent = t(text);
    sn.pop.classList.toggle('bad', bad);
    sn.popT = 2;
  },
  /** The controllers' personPoser: the walk as ever (or sitting), the shoes under its feet */
  pose(run, dt, p, cm) {
    const sn = run.sn, seated = run.state?.seated;
    if (seated) {
      const r = poseSkater(p.rig, p.position.x, p.position.y - 0.12, p.position.z, p.heading, { crouch: 1, phase: 0, push: 0, lean: 0, arms: 'swing' });
      r.feet.forEach((f, i) => { sn.shoes[i].position.set(f.x, p.position.y + 0.03, f.z); sn.shoes[i].rotation.set(0, f.yaw, 0, 'YXZ'); });
      return;
    }
    p.rig.update(dt, p.position.x, p.position.z, p.heading, (c, x, z, near) => c.getGroundHeight(x, z, 'person', near), cm, 0);
    p.rig.feet.forEach((f, i) => {
      const m = sn.shoes[i];
      m.position.set(f.ax, f.ay - 0.07, f.az);
      m.rotation.set(f.pitch || 0, p.heading, 0, 'YXZ');
    });
  },
  update(run, ctx, dt) {
    const sn = run.sn, st = run.state;
    for (const e of st.events) {
      if (e.kind === 'flag') { SNOWSHOES.flash(run, 'Flag!'); blip(run, 'good'); }
      else if (e.kind === 'zone') { SNOWSHOES.flash(run, 'Wildruhezone! The grouse need their peace', true); blip(run, 'bad'); }
      else if (e.kind === 'grouse') {
        const i = st.birds.indexOf(e.bird), m = sn.birds[i];
        const dx = e.bird.x - ctx.x, dz = e.bird.z - ctx.z, d = Math.hypot(dx, dz) || 1;
        m.userData.fly = { vx: (dx / d) * 9, vz: (dz / d) * 9, vy: 4.2, t: 0 };
        m.rotation.y = Math.atan2(dx, dz);
        for (let n = 0; n < 12; n++) { const a = n * 0.52; sn.particles.spawn({ x: m.position.x, y: m.position.y + 0.2, z: m.position.z, vx: Math.cos(a) * 1.6, vy: 1.6, vz: Math.sin(a) * 1.6, gravity: 3, life: 0.7, size0: 0.2, size1: 0.7, alpha: 0.8 }); }
        SNOWSHOES.flash(run, 'A grouse flies up!', true);
        blip(run, 'flap');
      }
    }
    st.events.length = 0;
    for (const m of sn.birds) {
      const f = m.userData.fly;
      if (!f) continue;
      f.t += dt;
      m.position.x += f.vx * dt; m.position.z += f.vz * dt; m.position.y += f.vy * dt;
      f.vy = Math.max(0.5, f.vy - dt * 0.8);
      m.geometry = sn.birdGeos[Math.floor(f.t * 11) % 2];
      if (f.t > 6) { m.visible = false; m.userData.fly = null; }
    }
    sn.particles.update(dt, ctx.camera);
    if (sn.popT > 0) { sn.popT -= dt; if (sn.popT <= 0) sn.pop.textContent = ''; }
  },
  after(run) {
    const sn = run.sn, st = run.state, s = st?.shoer;
    if (!s) return;
    if (run.phase === 'done' || run.phase === 'failed' || run.phase === 'aborted') { sn.hud.hidden = true; return; }
    sn.fill.style.width = `${s.stamina * 100}%`;
    sn.needle.style.left = `${beatNeedle(s) * 100}%`;
    const pct = Math.round(packedShare(st) * 100);
    const line = st.seated
      ? t('The view: Frauenkirch on the left, Davos Platz up the valley, the Strela above it')
      : `${shoeScore(st)} ${t('pts')} · ${pct} % ${t('on the line')}${s.blown ? ` · ${t('out of breath')}` : ''}`;
    if (sn.card.textContent !== line) sn.card.textContent = line;
  },
  teardown(run) { run.sn?.hud.remove(); }
};

function zoneSignTexture() {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1e4'; g.fillRect(0, 0, 384, 192);
  g.strokeStyle = '#c62f25'; g.lineWidth = 12; g.strokeRect(6, 6, 372, 180);
  g.fillStyle = '#1d1d1d'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 46px Inter, Arial, sans-serif'; g.fillText('Wildruhezone', 192, 72, 340);
  g.font = '600 26px Inter, Arial, sans-serif'; g.fillText(t('Winter home of the grouse'), 192, 130, 340);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// =====================================================================================================================
// 2. The plaster room
// =====================================================================================================================
const WW = 640, WH = 430;
const LEG_X0 = 66, LEG_X1 = 574, LEG_Y = 214, LEG_H = 60;
const BTN = [{ x: 80, y: 352, w: 220, h: 58 }, { x: 340, y: 352, w: 220, h: 58 }];
const DONE_BTN = { x: 430, y: 356, w: 180, h: 54 };
const BUCKET = { x: 220, y: 150, w: 200, h: 190 };
const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const canvasPoint = (canvas, e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * WW, y: ((e.clientY - r.top) / r.height) * WH }; };
const legU = (x) => clamp((x - LEG_X0) / (LEG_X1 - LEG_X0), 0, 1);

/** The walker waits at the door: frozen and out of sight */
function holdPlayer(run, on) {
  const cm = run.hooks.controllerManager;
  if (on) {
    if (run._crHeld) return;
    run._crHeld = { had: 'personDriver' in cm, prev: cm.personDriver };
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; };
    document.body.classList.add('cr-busy');
    cm.setEntityHidden?.('person', true);
  } else if (run._crHeld) {
    const h = run._crHeld;
    run._crHeld = null;
    document.body.classList.remove('cr-busy');
    cm.setEntityHidden?.('person', false);
    if (h.had) cm.personDriver = h.prev ?? null; else delete cm.personDriver;
    run.hooks.cameraSystem?.resetForTeleport?.();
  }
}

const CAST_ROOM = {
  setup(run) {
    addStyle(run);
    const game = el('div', 'cr-game');
    game.hidden = true;
    const box_ = el('div', 'cr-game-box');
    const canvas = el('canvas');
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(WW * dpr); canvas.height = Math.round(WH * dpr);
    const roomH = (globalThis.innerHeight || WH) - ((globalThis.innerHeight || WH) <= 500 ? 36 : 280); // (a phone on its side: the room takes the whole height)
    canvas.style.width = `${Math.max(240, Math.min(WW, (globalThis.innerWidth || WW) - 20, roomH * (WW / WH)))}px`;
    canvas.style.aspectRatio = `${WW} / ${WH}`;
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    const info = el('div', 'cr-card', '');
    box_.append(info, canvas);
    game.append(box_);
    document.body.append(game);
    run.cleanups.push(() => game.remove());
    const cx = run.cx = { game, canvas, c, info, open: false, finger: null, last: null, press: false, keys: { left: false, right: false, hold: false }, pop: null, strokes: [] };
    run.listen(canvas, 'pointerdown', (e) => {
      e.preventDefault();
      const g = run.state.room;
      if (!g || run.phase !== 'running' || g.done) return;
      const p = canvasPoint(canvas, e), stage = g.patient.stage;
      if (stage === 'xray') { BTN.forEach((r, i) => { if (inRect(p, r)) CAST_ROOM.pick(run, i); }); return; }
      if (stage === 'angle' && inRect(p, DONE_BTN)) { castConfirm(g); return; }
      if (stage === 'sign' && inRect(p, DONE_BTN)) { CAST_ROOM.finishSign(run); return; }
      if (stage === 'wet') { if (inRect(p, BUCKET)) { canvas.setPointerCapture?.(e.pointerId); cx.press = true; } return; }
      canvas.setPointerCapture?.(e.pointerId);
      if (stage === 'sign') { cx.strokes.push([p]); cx.last = p; return; }
      cx.finger = legU(p.x);
    });
    run.listen(canvas, 'pointermove', (e) => {
      const g = run.state.room;
      if (!g) return;
      const p = canvasPoint(canvas, e);
      if (g.patient.stage === 'sign' && cx.last) {
        castInk(g, Math.hypot(p.x - cx.last.x, p.y - cx.last.y));
        cx.strokes[cx.strokes.length - 1]?.push(p);
        cx.last = p;
      } else if (cx.finger != null) cx.finger = legU(p.x);
    });
    for (const ev of ['pointerup', 'pointercancel']) run.listen(canvas, ev, () => { cx.finger = null; cx.press = false; cx.last = null; });
    run.listen(window, 'keyup', (e) => {
      if (e.code === 'ArrowRight' || e.code === 'KeyD') cx.keys.right = false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') cx.keys.left = false;
      if (e.code === 'Space') cx.keys.hold = false;
    }, { capture: true });
  },
  reset(run) {
    const cx = run.cx;
    cx.open = false; cx.game.hidden = true; cx.finger = null; cx.press = false; cx.last = null; cx.pop = null; cx.strokes = [];
    cx.keys.left = cx.keys.right = cx.keys.hold = false;
    run.state.room = null;
    holdPlayer(run, false);
  },
  teardown(run) { run.cx.game.hidden = true; holdPlayer(run, false); },
  pick(run, i) {
    const g = run.state.room, p = g.patient;
    if (p.stage !== 'xray') return;
    if (!p.pickedLeg) castPickLeg(g, i === 0 ? 'left' : 'right');
    else castPickLength(g, i === 0 ? 'short' : 'long');
  },
  finishSign(run) {
    const g = run.state.room, p = g.patient;
    // (a keyboard: the hand signs by itself)
    if (p.ink <= 0) { castInk(g, 1); run.cx.strokes = [autoSignature()]; }
    castConfirm(g);
  },
  key(run, e) {
    const cx = run.cx;
    if (!cx.open || run.phase === 'intro') return;
    const g = run.state.room;
    if (e.code === 'Digit1' || e.code === 'Digit2') { swallow(e); if (!e.repeat && run.phase === 'running') CAST_ROOM.pick(run, e.code === 'Digit1' ? 0 : 1); return; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { swallow(e); cx.keys.right = true; return; }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { swallow(e); cx.keys.left = true; return; }
    if (e.code === 'Space') {
      swallow(e);
      if (e.repeat || !g || run.phase !== 'running') return;
      if (g.patient.stage === 'wet') cx.keys.hold = true;
      else if (g.patient.stage === 'sign') CAST_ROOM.finishSign(run);
      else castConfirm(g);
    }
  },
  update(run, ctx, dt) {
    const cx = run.cx;
    if (!cx.open && run.def.objectives[run.index]?.id === 'room' && live(run)) {
      cx.open = true; cx.game.hidden = false; run.state.room = createCastGame(7);
      holdPlayer(run, true);
    }
    const g = run.state.room;
    if (!cx.open || !g || run.phase !== 'running') return;
    const push = (cx.keys.right ? 1 : 0) - (cx.keys.left ? 1 : 0);
    castStep(g, { u: cx.finger, push, adjust: push, hold: cx.keys.hold || cx.press }, Math.min(dt, 0.05));
    for (const e of g.events) {
      if (e.kind === 'wrong-leg') { cx.pop = { text: 'That is the healthy leg!', good: false, t: 1.6 }; blip(run, 'bad'); }
      else if (e.kind === 'wrong-length') { cx.pop = { text: 'Wrong length: look where the break is', good: false, t: 1.6 }; blip(run, 'bad'); }
      else if (e.kind === 'right-leg') blip(run, 'good');
      else if (e.kind === 'wet') { cx.pop = e.err === 0 ? { text: 'Just right', good: true, t: 1.2 } : { text: e.soggy ? 'Too soggy' : 'Still dry', good: false, t: 1.2 }; blip(run, e.err === 0 ? 'good' : 'bad'); }
      else if (e.kind === 'wrapped') { cx.pop = { text: `${e.gaps} gaps · ${e.lumps} lumps`, good: !e.gaps && !e.lumps, t: 1.6 }; blip(run, 'pock'); }
      else if (e.kind === 'hardened') { cx.pop = { text: 'The plaster has set', good: false, t: 1.2 }; blip(run, 'pock'); }
      else if (e.kind === 'smoothed') { cx.pop = { text: 'Smooth as a groomed piste', good: true, t: 1.2 }; blip(run, 'good'); }
      else if (e.kind === 'patient') { cx.pop = { text: `${g.last.name}: ${e.points} pts`, sub: g.last.quip, good: e.points >= 170, t: 3 }; blip(run, 'good'); cx.strokes = []; }
      else if (e.kind === 'stage' && e.stage !== 'sign') blip(run, 'pock');
    }
    g.events.length = 0;
    if (cx.pop) { cx.pop.t -= dt; if (cx.pop.t <= 0) cx.pop = null; }
  },
  after(run) {
    const cx = run.cx, g = run.state.room;
    if (run.phase === 'done' && cx.open) { cx.open = false; cx.game.hidden = true; holdPlayer(run, false); }
    if (!cx.open || !g) return;
    drawRoom(cx.c, cx, g);
    const stage = STAGE_HELP[g.patient.stage] || '';
    const html = `<b>${g.score}</b> ${t('pts')} · ${t('Patient')} ${Math.min(g.i + 1, 3)}/3 · ${t(stage)}`;
    if (cx.info._html !== html) { cx.info._html = html; cx.info.innerHTML = html; }
  }
};

const STAGE_HELP = {
  xray: 'read the X-ray: which leg, how long a cast (1, 2 or tap)',
  angle: 'set the angle: A/D or drag, then Space',
  pad: 'pad with cotton wool: drag, or hold D',
  wet: 'hold the bandage in the bucket: hold Space, let go in the green',
  wrap: 'wrap in even turns: up with D, back with A, or drag',
  smooth: 'smooth it before it sets: rub up and down, or hold D',
  sign: 'sign the cast: draw, or Space'
};
const STAGE_NAMES = { xray: 'X-ray', angle: 'Angle', pad: 'Padding', wet: 'Bucket', wrap: 'Wrap', smooth: 'Smooth', sign: 'Sign' };

/** A signature for those without a finger on the screen */
function autoSignature() {
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push({ x: 210 + i * 5.5, y: LEG_Y + Math.sin(i * 0.9) * 12 * (1 - i / 60) + Math.sin(i * 0.23) * 5 });
  return pts;
}

function button(c, r, text, hot = false) {
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.roundRect(r.x + 3, r.y + 4, r.w, r.h, 12); c.fill();
  c.fillStyle = hot ? '#2c8fe0' : '#37566f'; c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, 12); c.fill();
  c.fillStyle = '#fff'; c.font = '800 17px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 12);
  c.textBaseline = 'alphabetic';
}

/** The leg from above: toes at the left, in the patient's skin colour, tapering */
function legPath(c, inset = 0) {
  const x0 = LEG_X0 - 34, x1 = LEG_X1 + 30, top = LEG_Y - LEG_H / 2 + inset, bot = LEG_Y + LEG_H / 2 - inset;
  c.beginPath();
  c.moveTo(x0, LEG_Y + 8);
  c.quadraticCurveTo(x0, top + 8, x0 + 42, top + 10);
  c.lineTo(x0 + 130, top + 14);
  c.quadraticCurveTo(x0 + 330, top + 2, x1, top - 6);
  c.lineTo(x1, bot + 6);
  c.quadraticCurveTo(x0 + 330, bot - 2, x0 + 130, bot - 12);
  c.lineTo(x0 + 42, bot - 8);
  c.quadraticCurveTo(x0, bot, x0, LEG_Y + 8);
  c.closePath();
}

function drawCells(c, p, stage) {
  const n = p.cells.length, w = (LEG_X1 - LEG_X0) / n;
  c.save();
  legPath(c);
  c.clip();
  p.cells.forEach((cell, i) => {
    const x = LEG_X0 + i * w, top = LEG_Y - LEG_H / 2 - 8, h = LEG_H + 16;
    if (stage === 'pad' || cell.layers < 0.25) {
      if (cell.pad > 0) {
        c.fillStyle = `rgba(250,248,240,${clamp(cell.pad, 0, 1) * 0.9})`;
        c.fillRect(x, top, w + 0.5, h);
        c.fillStyle = 'rgba(205,200,190,.8)';
        for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(x + ((k * 7 + i * 3) % w), top + ((k * 17 + i * 11) % h), 1.8, 0, 6.3); c.fill(); }
      }
    }
    if (cell.layers > 0.05) {
      const thin = cell.layers < CAST.wrap.gap, fat = cell.layers > CAST.wrap.lump;
      c.fillStyle = thin ? `rgba(244,240,228,${0.25 + cell.layers * 0.45})` : fat ? '#fffdf4' : '#f4f0e4';
      c.fillRect(x, top, w + 0.5, h);
      // the bandage's turns, slanted
      c.strokeStyle = thin ? 'rgba(160,150,130,.35)' : 'rgba(150,142,125,.55)'; c.lineWidth = 1;
      for (let k = -1; k < 2; k++) { c.beginPath(); c.moveTo(x + k * w, top); c.lineTo(x + (k + 1) * w, top + h); c.stroke(); }
      if (cell.smooth < 0.7 && stage !== 'wrap') {
        c.fillStyle = `rgba(150,142,125,${0.55 * (1 - cell.smooth)})`;
        for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + ((k * 5 + i * 7) % w), top + ((k * 23 + i * 13) % h), 2.4, 0, 6.3); c.fill(); }
      }
    }
  });
  c.restore();
  // what shows: a gap or a lump
  if (stage !== 'pad') p.cells.forEach((cell, i) => {
    if (cell.layers <= 0.05 && stage === 'wrap') return;
    const x = LEG_X0 + (i + 0.5) * w;
    if (cell.layers > CAST.wrap.lump) { c.fillStyle = '#fffdf4'; c.strokeStyle = 'rgba(190,120,60,.9)'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, LEG_Y - LEG_H / 2 + 2, w * 0.6, 8, 0, 0, 6.3); c.fill(); c.stroke(); }
    else if (cell.layers < CAST.wrap.gap && (stage !== 'wrap' || p.pass === 1 ? (i + 0.5) / p.cells.length > p.u : false)) { c.strokeStyle = '#e8503a'; c.lineWidth = 2; c.strokeRect(x - w / 2 + 1, LEG_Y - 10, w - 2, 20); }
  });
}

function drawXray(c, p) {
  c.fillStyle = '#0f1518'; c.beginPath(); c.roundRect(150, 74, 340, 262, 10); c.fill();
  c.strokeStyle = '#9ec4d6'; c.lineWidth = 3; c.stroke();
  // as X-rays hang: the patient's right leg on the viewer's left, each with its lead marker
  const legs = [{ x: 240, side: 'right', mark: 'R' }, { x: 400, side: 'left', mark: 'L' }];
  for (const l of legs) {
    c.fillStyle = 'rgba(190,215,225,.16)'; c.beginPath(); c.roundRect(l.x - 40, 92, 80, 226, 30); c.fill();
    c.strokeStyle = '#eaf4f8'; c.lineCap = 'round';
    // thigh's end, knee at the top; the shin bone; the fibula; the ankle at the bottom
    c.lineWidth = 15; c.beginPath(); c.moveTo(l.x - 2, 94); c.lineTo(l.x - 2, 122); c.stroke();
    c.beginPath(); c.arc(l.x - 2, 130, 12, 0, 6.3); c.fillStyle = '#eaf4f8'; c.fill();
    c.lineWidth = 11; c.beginPath(); c.moveTo(l.x - 5, 146); c.lineTo(l.x - 5, 288); c.stroke();
    c.lineWidth = 5; c.beginPath(); c.moveTo(l.x + 13, 150); c.lineTo(l.x + 11, 290); c.stroke();
    c.beginPath(); c.arc(l.x + 1, 298, 11, 0, 6.3); c.fill();
    c.fillStyle = '#ffe14f'; c.font = '900 22px Inter, sans-serif'; c.textAlign = 'center'; c.fillText(l.mark, l.x - 54, 110);
    if (p.leg === l.side) {
      // the crack: a dark zig-zag across the shin (nothing else to see)
      const y = 146 + p.at * 142;
      c.strokeStyle = '#0f1518'; c.lineWidth = 3.5; c.lineCap = 'butt';
      c.beginPath(); c.moveTo(l.x - 13, y - 4); c.lineTo(l.x - 7, y + 4); c.lineTo(l.x - 2, y - 3); c.lineTo(l.x + 3, y + 4); c.stroke();
      c.beginPath(); c.moveTo(l.x + 7, y - 2); c.lineTo(l.x + 16, y + 3); c.stroke();
    }
  }
  c.fillStyle = '#d8e6ec'; c.font = '700 13px Inter, sans-serif'; c.textAlign = 'center';
  c.fillText(t('By the ankle: short cast. Up by the knee: long cast.'), 320, 346);
  button(c, BTN[0], p.pickedLeg ? `1  ${t('Short cast')}` : `1  ${t('Left leg')}`, true);
  button(c, BTN[1], p.pickedLeg ? `2  ${t('Long cast')}` : `2  ${t('Right leg')}`, true);
}

function drawAngle(c, p) {
  const A = CAST.angle[p.length], long = p.length === 'long';
  const px = 300, py = 240, skin = '#e8bb96';
  const limb = (x, y, a, len, w, col) => { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; c.beginPath(); c.roundRect(0, -w / 2, len, w, w / 2); c.fill(); c.restore(); };
  const rad = (d) => (d * Math.PI) / 180;
  if (long) {
    // the knee, bent: the thigh lies flat, the shin hangs from it by the angle
    limb(px - 190, py, 0, 200, 50, skin);
    limb(px, py, rad(A.target), 200, 40, 'rgba(120,235,120,.45)');
    limb(px, py, rad(p.angle), 200, 40, skin);
    c.fillStyle = '#d9a981'; c.beginPath(); c.arc(px, py, 27, 0, 6.3); c.fill();
  } else {
    // the ankle: the shin lies flat, the foot stands off it by the angle
    limb(px - 230, py, 0, 240, 42, skin);
    limb(px, py, rad(-A.target), 96, 32, 'rgba(120,235,120,.45)');
    limb(px, py, rad(-p.angle), 96, 32, skin);
    c.fillStyle = '#d9a981'; c.beginPath(); c.arc(px, py, 22, 0, 6.3); c.fill();
  }
  c.fillStyle = '#fff'; c.font = '900 34px Inter, sans-serif'; c.textAlign = 'left';
  c.fillText(`${Math.round(p.angle)}°`, 440, 150);
  c.font = '700 14px Inter, sans-serif';
  c.fillStyle = '#c9f5cd'; c.fillText(`${t(long ? 'Knee' : 'Ankle')}: ${t('green is right')} (${A.target}°)`, 400, 176, 228);
  button(c, DONE_BTN, t('Hold it here'), true);
}

function drawWet(c, p) {
  const [lo, hi] = wetWindow(p), max = hi + CAST.wet.overflow, S = (v) => 150 + clamp(v / max, 0, 1) * 340;
  // the bucket
  c.fillStyle = '#7f96a6'; c.beginPath(); c.moveTo(BUCKET.x, BUCKET.y + 30); c.lineTo(BUCKET.x + BUCKET.w, BUCKET.y + 30); c.lineTo(BUCKET.x + BUCKET.w - 22, BUCKET.y + BUCKET.h); c.lineTo(BUCKET.x + 22, BUCKET.y + BUCKET.h); c.closePath(); c.fill();
  c.fillStyle = '#b8e0f2'; c.beginPath(); c.ellipse(BUCKET.x + BUCKET.w / 2, BUCKET.y + 30, BUCKET.w / 2, 14, 0, 0, 6.3); c.fill();
  const on = p.wetting;
  // the bandage roll, over the water or in it
  c.fillStyle = '#f7f3e8'; c.beginPath(); c.roundRect(BUCKET.x + 60, BUCKET.y + (on ? 16 : -44), 80, 42, 8); c.fill();
  c.strokeStyle = 'rgba(150,142,125,.6)'; c.lineWidth = 2; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(BUCKET.x + 60 + k * 20, BUCKET.y + (on ? 16 : -44)); c.lineTo(BUCKET.x + 60 + k * 20, BUCKET.y + (on ? 58 : -2)); c.stroke(); }
  if (on) { c.fillStyle = 'rgba(255,255,255,.8)'; for (let k = 0; k < 5; k++) { const y = BUCKET.y + 10 - ((p.wet * 40 + k * 17) % 30); c.beginPath(); c.arc(BUCKET.x + 70 + k * 15, y, 3, 0, 6.3); c.fill(); } }
  // the gauge
  c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.roundRect(140, 362, 360, 26, 8); c.fill();
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(150, 368, 340, 14);
  c.fillStyle = 'rgba(120,235,120,.9)'; c.fillRect(S(lo), 368, S(hi) - S(lo), 14);
  c.fillStyle = '#fff'; c.fillRect(S(p.wet) - 2, 364, 4, 22);
  c.font = '700 12px Inter, sans-serif'; c.textAlign = 'center';
  c.fillText(t('dry'), 170, 404); c.fillText(t('just right'), (S(lo) + S(hi)) / 2, 404); c.fillText(t('soggy'), 470, 404);
}

function drawLeg(c, p) {
  const stage = p.stage;
  c.fillStyle = '#e8bb96'; legPath(c); c.fill();
  c.strokeStyle = 'rgba(120,80,50,.4)'; c.lineWidth = 2; c.stroke();
  // toes
  c.fillStyle = '#e8bb96'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(LEG_X0 - 36, LEG_Y - 8 + k * 7, 4, 0, 6.3); c.fill(); }
  drawCells(c, p, stage);
  const x = LEG_X0 + p.u * (LEG_X1 - LEG_X0);
  if (stage === 'pad') {
    c.fillStyle = '#fbf9f2'; c.beginPath(); c.arc(x, LEG_Y - LEG_H / 2 - 18, 22, 0, 6.3); c.fill(); c.strokeStyle = '#d3cdbd'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#fff'; c.font = '700 14px Inter, sans-serif'; c.textAlign = 'center';
    c.fillText(`${t('cotton wool')} ${Math.round(padShare(p) * 100)} %`, WW / 2, 330);
  } else if (stage === 'wrap') {
    c.fillStyle = '#f7f3e8'; c.beginPath(); c.roundRect(x - 14, LEG_Y - LEG_H / 2 - 26, 28, LEG_H + 52, 8); c.fill(); c.strokeStyle = '#cfc8b6'; c.lineWidth = 2; c.stroke();
    // the pace: one layer a pass at the middle of the green
    const v0 = wrapSpeed(p), S = (v) => 150 + clamp(v / (v0 * 2), 0, 1) * 340;
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.roundRect(140, 352, 360, 26, 8); c.fill();
    c.fillStyle = 'rgba(255,170,70,.75)'; c.fillRect(150, 358, S(v0 * 0.8) - 150, 14);
    c.fillStyle = 'rgba(120,235,120,.9)'; c.fillRect(S(v0 * 0.8), 358, S(v0 * 1.25) - S(v0 * 0.8), 14);
    c.fillStyle = 'rgba(255,90,60,.7)'; c.fillRect(S(v0 * 1.25), 358, 490 - S(v0 * 1.25), 14);
    c.fillStyle = '#fff'; c.fillRect(S(Math.abs(p.v)) - 2, 354, 4, 22);
    c.font = '700 12px Inter, sans-serif'; c.textAlign = 'center';
    c.fillText(t('too slow: lumps'), 210, 394); c.fillText(t('even'), (S(v0 * 0.8) + S(v0 * 1.25)) / 2, 394); c.fillText(t('too fast: gaps'), 440, 394);
    c.font = '800 15px Inter, sans-serif';
    c.fillText(p.pass === 0 ? `${t('Up the leg')} →` : `← ${t('Back down')}`, WW / 2, 330);
  } else if (stage === 'smooth') {
    c.fillStyle = '#e8bb96'; c.beginPath(); c.roundRect(x - 24, LEG_Y - 20, 48, 40, 16); c.fill(); c.strokeStyle = 'rgba(120,80,50,.5)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.roundRect(140, 352, 360, 26, 8); c.fill();
    c.fillStyle = `rgb(${Math.round(120 + 135 * p.set)},${Math.round(235 - 120 * p.set)},90)`; c.fillRect(150, 358, 340 * p.set, 14);
    c.fillStyle = '#fff'; c.font = '700 13px Inter, sans-serif'; c.textAlign = 'center';
    c.fillText(`${t('the plaster sets')} ${Math.round(p.set * 100)} %`, WW / 2, 396);
    c.font = '800 15px Inter, sans-serif';
    c.fillText(`${t('Smooth')} ${Math.round((p.cells.reduce((a, cell) => a + cell.smooth, 0) / p.cells.length) * 100)} %`, WW / 2, 330);
  } else if (stage === 'sign') {
    button(c, DONE_BTN, t('Signed'), true);
    c.fillStyle = '#fff'; c.font = '800 15px Inter, sans-serif'; c.textAlign = 'left';
    c.fillText(`${castGaps(p)} ${t('gaps')} · ${castLumps(p)} ${t('lumps')}`, 40, 386);
  }
}

function drawRoom(c, cx, g) {
  const p = g.patient;
  // the room: pale green tiles, the couch
  c.fillStyle = '#b9d4cc'; c.fillRect(0, 0, WW, WH);
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1;
  for (let x = 0; x < WW; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 150); c.stroke(); }
  for (let y = 0; y < 150; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(WW, y); c.stroke(); }
  c.fillStyle = '#5c7d88'; c.fillRect(0, 150, WW, WH - 150);
  c.fillStyle = '#8fb0ba'; c.beginPath(); c.roundRect(14, 164, WW - 28, 116, 14); c.fill();
  // the patient
  c.fillStyle = '#1d3a44'; c.textAlign = 'left'; c.font = '800 16px Inter, sans-serif'; c.fillText(p.name, 16, 26);
  c.font = '600 12px Inter, sans-serif'; c.fillText(`${t('by Rega from')} ${t(p.from)}`, 16, 44);
  c.fillText(`${t('in the room')} ${Math.floor(p.t)} s / ${CAST.limit[p.i]} s`, 16, 60);
  // the steps
  c.textAlign = 'right'; c.font = '700 12px Inter, sans-serif';
  CAST_STAGES.forEach((s, i) => {
    const at = CAST_STAGES.indexOf(p.stage);
    c.fillStyle = i === at ? '#b5360d' : i < at ? '#1d7a48' : 'rgba(29,58,68,.55)';
    c.fillText(t(STAGE_NAMES[s]), WW - 14, 20 + i * 15);
  });
  if (p.stage === 'xray') drawXray(c, p);
  else if (p.stage === 'angle') drawAngle(c, p);
  else if (p.stage === 'wet') drawWet(c, p);
  else if (p.stage !== 'done') drawLeg(c, p);
  if (p.stage === 'sign' && cx.strokes.length) {
    c.strokeStyle = '#1a3a8a'; c.lineWidth = 2.5; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of cx.strokes) { c.beginPath(); s.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.stroke(); }
  }
  if (cx.pop) {
    c.textAlign = 'center';
    c.font = '900 24px Inter, sans-serif'; c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.65)';
    const text = t(cx.pop.text);
    c.strokeText(text, WW / 2, 118, WW - 30);
    c.fillStyle = cx.pop.good ? '#ffe14f' : '#ff8a7a'; c.fillText(text, WW / 2, 118, WW - 30);
    if (cx.pop.sub) {
      c.font = '700 14px Inter, sans-serif'; c.lineWidth = 4;
      const sub = t(cx.pop.sub);
      c.strokeText(sub, WW / 2, 142, WW - 30); c.fillStyle = '#fff'; c.fillText(sub, WW / 2, 142, WW - 30);
    }
  }
}

export const CARE_FEATURES = { snowshoes: SNOWSHOES, castRoom: CAST_ROOM };
