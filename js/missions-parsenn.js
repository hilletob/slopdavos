// js/missions-parsenn.js
// The runtime of js/missions-data-parsenn.js, as a feature of js/missions.js (PARSENN_FEATURES, merged into its FEATURES):
//   parsennCab — the machinist's cab at the front of the Parsennbahn's climbing car. The cars are js/bergbahnen.js' own:
//   the mission takes the two lines over (FUNICULAR_CONTROLS: their shuttles held, the drive's s set and the cars placed
//   in the same frame), so the other train comes down on the same rope and meets this one in the passing loop. The
//   camera sits behind the windscreen (the city's car bodies are boxes seen from outside: the cab's inside is the
//   mission's own, a few unlit boxes round the eye: the desk with its lever and lamps, the windscreen's frame); the
//   tunnels and the stations underground (Davos Dorf, the Weissfluhjoch) a lit tube along the track where the ground
//   hides it, the platforms beside the stops, the haul rope between the rails, the yellow stop line and the board.
//   The control desk's HUD at the right (the limit, the speed, the lever, the board, the next limit, the doors),
//   the keys in the register (js/actions.js: key bar, touch buttons, gamepad), the winch's hum, the horn, the chime.
// The player stays on foot at the valley station meanwhile (hidden). Everything goes with the run's group and its
// cleanups; the lines are given back to their own shuttles.
import * as THREE from 'three/webgpu';
import { fract, mix, smoothstep, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FUNICULAR_CONTROLS } from './bergbahnen.js';
import { QUALITY } from './quality.js';
import { t as tr } from './i18n.js';
import {
  PB, SECTIONS, parsennLines, createDrive, driveStep, driveLine, driveLimit, toBoard, nextLimit, leverStep, toggleDoors,
  soundHorn, emergencyBrake, setTimelapse, driveScore, fmtClock, fmtError
} from './missions-data-parsenn.js';

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SWALLOW = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'KeyB', 'KeyX', 'KeyT', 'KeyG', 'KeyE', 'KeyQ', 'KeyC', 'ShiftLeft', 'ShiftRight']);
const EYE = { back: 1.25, up: 2.15 }; // m behind the front, over the rails
const CAB_FOV = 66;

const STYLE = `
.pb-desk{position:fixed;right:16px;top:132px;z-index:40;font-family:Inter,system-ui,sans-serif;color:#fff;pointer-events:none;width:248px}
.pb-desk[hidden],.pb-fade[hidden]{display:none}
.pb-card{background:rgba(10,12,20,.8);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:10px 12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 6px 24px rgba(0,0,0,.35);font-variant-numeric:tabular-nums}
.pb-top{display:flex;gap:10px;align-items:center}
.pb-limit{width:54px;height:54px;flex:none;border-radius:50%;background:#fff;border:7px solid #d4001a;color:#111;display:flex;align-items:center;justify-content:center;font:900 19px Inter,system-ui,sans-serif;box-sizing:border-box}
.pb-speed{font:800 30px Inter,system-ui,sans-serif;line-height:1}
.pb-speed.is-over{color:#ff5b5b}
.pb-unit{font-size:12px;opacity:.75}
.pb-lever{margin-left:auto;display:flex;gap:6px;align-items:flex-end}
.pb-gauge{position:relative;width:14px;height:54px;border-radius:7px;background:rgba(255,255,255,.12);overflow:hidden}
.pb-gauge i{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,#2fd27a,#ffe14f);display:block}
.pb-gauge.is-brake i{background:#ff6b6b}
.pb-lv{font-size:12px;text-align:right;line-height:1.3}
.pb-lv b{font-size:15px}
.pb-rows{margin-top:8px;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:12.5px}
.pb-rows span:nth-child(odd){opacity:.7}
.pb-rows span:nth-child(even){text-align:right;font-weight:600}
.pb-board.is-near{color:#ffe14f}
.pb-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.pb-tag{font:700 11px Inter,system-ui,sans-serif;border-radius:999px;padding:3px 8px;background:rgba(255,255,255,.12)}
.pb-tag.is-on{background:#2fb3ff;color:#001}
.pb-tag.is-warn{background:#ff5b5b;color:#fff}
.pb-pop{position:fixed;left:50%;top:30%;transform:translateX(-50%);z-index:41;font:900 26px Inter,system-ui,sans-serif;color:#ffe14f;text-shadow:0 2px 14px rgba(0,0,0,.7);pointer-events:none;opacity:0;transition:opacity .25s;text-align:center;white-space:nowrap}
.pb-pop.is-on{opacity:1}
.pb-pop.bad{color:#ff6b6b}
.pb-fade{position:fixed;inset:0;background:#000;z-index:39;pointer-events:none;opacity:0}
body.pb-cab #touch-controls .touch-joystick,body.pb-cab .gta-prompt,body.pb-cab .mission-prompt{display:none!important}
@media (max-width:640px){.pb-desk{right:8px;top:calc(env(safe-area-inset-top,0px) + 150px);transform:scale(.82);transform-origin:top right}}
@media (max-height:520px){.pb-desk{right:8px;top:calc(env(safe-area-inset-top,0px) + 62px);transform:scale(.66);transform-origin:top right}.pb-minor,.pb-tags{display:none!important}}
`;

// --- Geometry --------------------------------------------------------------------------------------------------------
// Boxes [w, h, d, x, y, z, colour] in one geometry with vertex colours
function boxes(list) {
  return mergeGeometries(list.map(([w, h, d, x, y, z, colour, rx = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    const c = new THREE.Color(colour), n = g.attributes.position.count, col = new Float32Array(n * 3);
    // (unlit: a little shading baked in by the faces' direction)
    const nrm = g.attributes.normal;
    for (let i = 0; i < n; i++) { const k = 0.72 + 0.28 * Math.max(nrm.getY(i), 0) + 0.12 * Math.abs(nrm.getZ(i)); col.set([c.r * k, c.g * k, c.b * k], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
  }), false);
}

/**
 * A profile swept along a track (control.at(k, s)): `profile(s)` the cross-section's points [[right, up], ...] (the
 * same count everywhere), from s0 to s1 every `step` m; uv.x the point's index (0..1), uv.y the metres along; the
 * vertex colour `shade(s)`. Right is to the right looking up the line (js/bergbahnen.js swings path 0 that way).
 */
function sweep(ctrl, k, s0, s1, step, profile, shade = () => 1) {
  const rows = [], P = {};
  for (let s = s0; ; s += step) {
    const v = Math.min(s, s1), len = ctrl.paths[k].len;
    ctrl.at(k, v, P);
    if (v > len) { P.x += P.dx * (v - len); P.y += P.dy * (v - len); P.z += P.dz * (v - len); } // (on beyond the track's end)
    const h = Math.hypot(P.dx, P.dz) || 1, rx = -P.dz / h, rz = P.dx / h;
    rows.push({ s: v, pts: profile(v).map(([r, u]) => [P.x + rx * r, P.y + u, P.z + rz * r]), c: shade(v) });
    if (v >= s1) break;
  }
  const pos = [], uvs = [], col = [];
  const n = rows[0].pts.length;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    for (let j = 1; j < n; j++) {
      const quad = [[a, j - 1], [b, j - 1], [b, j], [a, j - 1], [b, j], [a, j]];
      for (const [row, q] of quad) { pos.push(...row.pts[q]); uvs.push(q / (n - 1), row.s); col.push(row.c, row.c, row.c); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// The tunnel's cross-section, and the station hall's (wider to the right, over the platform); blended over 8 m
const TUBE = [[2.3, -0.4], [2.45, 3.1], [1.5, 4.4], [-1.5, 4.4], [-2.45, 3.1], [-2.3, -0.4]];
const HALL = [[5.6, -0.4], [5.7, 4.9], [3.8, 5.8], [-1.8, 5.8], [-2.7, 4.4], [-2.5, -0.4]];
const blend = (w) => { const p = TUBE.map(([r, u], i) => [r + (HALL[i][0] - r) * w, u + (HALL[i][1] - u) * w]); return [...p, p[0]]; }; // (closed under the floor: nothing of the ground's underside shows)

function tunnelMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const along = uv().y, across = uv().x;
  // concrete, the ring joints every 6 m, a lamp every 12 m high on the right-hand wall (and its glow round it)
  const joint = smoothstep(0.0, 0.03, fract(along.div(6))).mul(smoothstep(1.0, 0.97, fract(along.div(6))));
  const lampAlong = fract(along.div(12)).sub(0.5).abs();
  const lampAcross = across.sub(0.19).abs();
  const lamp = smoothstep(0.06, 0.02, lampAlong).mul(smoothstep(0.035, 0.015, lampAcross));
  const glow = smoothstep(0.5, 0.0, lampAlong).mul(smoothstep(0.35, 0.0, lampAcross)).mul(0.35);
  const wall = mix(vec3(0.012, 0.012, 0.0115), vec3(0.022, 0.021, 0.02), joint).add(vec3(0.07, 0.055, 0.035).mul(glow));
  m.colorNode = mix(wall, vec3(1.0, 0.9, 0.72), lamp);
  return m;
}
// The track in the tunnels (js/bergbahnen.js lays none there): ballast, the sleepers every 0.8 m, the two rails
function floorMaterial(gauge) {
  const m = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  const x = uv().x.sub(0.5).mul(4.6), along = uv().y; // m across, m along
  const phase = fract(along.div(0.8));
  const sleeper = smoothstep(0.0, 0.04, phase).mul(smoothstep(0.38, 0.34, phase)).mul(smoothstep(1.3, 1.2, x.abs()));
  const rail = smoothstep(0.05, 0.03, x.abs().sub(gauge / 2).abs());
  const rope = smoothstep(0.03, 0.015, x.abs());
  const base = mix(vec3(0.025, 0.024, 0.022), vec3(0.08, 0.078, 0.075), sleeper);
  m.colorNode = mix(mix(base, vec3(0.3, 0.31, 0.32), rail), vec3(0.09, 0.085, 0.08), rope);
  return m;
}
// The platform: light concrete, the yellow safety line along its edge (the edge is the profile's first points)
function platformMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  const edge = smoothstep(0.49, 0.52, uv().x).mul(smoothstep(0.76, 0.73, uv().x)); // (the profile's third segment)
  m.colorNode = mix(vec3(0.3, 0.295, 0.285), vec3(0.62, 0.5, 0.05), edge); // (×0.15 underground: the vertex colour)
  return m;
}
const PLATFORM = [[2.1, -0.4], [2.1, 0.85], [2.3, 0.95], [2.6, 0.95], [5.0, 0.95]];

// The stop board: yellow, "HALT" in black, on a post; the stop line across the track
function haltTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f2c200'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#111'; g.fillRect(6, 6, 116, 116); g.fillStyle = '#f2c200'; g.fillRect(12, 12, 104, 104);
  g.fillStyle = '#111'; g.font = '900 40px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HALT', 64, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The cab round the eye (x left, y up, z ahead; unlit, the shading baked in): the desk under the windscreen with its
// panel, the windscreen's black frame, the side windows' pillars, the roof; the lever and the lamps apart
function cabGeometry() {
  const dark = 0x5a5f66, panel = 0x8a9097, frame = 0x2b2d31, red = 0xc2161f, grey = 0xb4b8bd;
  return boxes([
    [2.4, 0.62, 0.1, 0, -0.68, 1.18, red], // the front wall under the windscreen
    [2.1, 0.06, 0.6, 0, -0.4, 0.86, panel], // the desk top
    [1.1, 0.22, 0.05, 0.15, -0.3, 1.06, dark, -0.45], // the instrument hood, raked
    [0.13, 1.25, 0.13, 1.02, 0.24, 1.2, frame], [0.13, 1.25, 0.13, -1.02, 0.24, 1.2, frame], [0.07, 1.2, 0.08, 0, 0.24, 1.22, frame], // the windscreen's pillars and the post between its panes
    [2.4, 0.26, 0.14, 0, 0.84, 1.2, frame], [2.3, 0.1, 0.14, 0, -0.36, 1.21, frame], // its top and bottom
    [0.06, 1.0, 1.8, 1.32, -0.85, 0.3, red], [0.06, 1.0, 1.8, -1.32, -0.85, 0.3, red], // the walls under the side windows
    [0.1, 1.5, 0.1, 1.32, 0.35, -0.5, frame], [0.1, 1.5, 0.1, -1.32, 0.35, -0.5, frame], // the side windows' pillars
    [2.7, 0.1, 2.4, 0, 1.02, 0.1, 0xd8d8d6], // the roof's lining
    [0.42, 0.06, 0.3, -0.48, -0.36, 0.74, grey] // the lever's quadrant
  ]);
}

// --- Sound -----------------------------------------------------------------------------------------------------------
function tone(run, { freqs, seconds, type = 'square', level = 0.12, cutoff = 1800 }) {
  const A = run.audio;
  if (!A.live) return;
  const ctx = A.audio.context, now = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(level, now + 0.04);
  g.gain.setValueAtTime(level, now + seconds - 0.12); g.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
  lp.connect(g).connect(A.audio.mix);
  for (const f of freqs) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(lp); o.start(now); o.stop(now + seconds + 0.05); }
}
const horn = (run) => tone(run, { freqs: [415, 523], seconds: 1.0, level: 0.1 });
function chime(run) {
  tone(run, { freqs: [659], seconds: 0.45, type: 'sine', level: 0.12, cutoff: 4000 });
  setTimeout(() => { if (!run.disposed) tone(run, { freqs: [523], seconds: 0.6, type: 'sine', level: 0.12, cutoff: 4000 }); }, 380);
}
// The winch's hum and the rope's rumble, louder with the speed (built once the sound is on)
function hum(run, v, vmax, on) {
  const pb = run.pb, A = run.audio;
  if (!A.live) return;
  if (!pb.hum) {
    const ctx = A.audio.context;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const noise = A._noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(lp).connect(g); noise.connect(bp).connect(g); g.connect(A.audio.mix);
    o.start(); noise.start();
    pb.hum = { o, noise, g, lp };
    run.cleanups.push(() => { try { o.stop(); noise.stop(); g.disconnect(); } catch { /* (gone with the context) */ } pb.hum = null; });
  }
  const k = on ? clamp(v / vmax, 0, 1) : 0, ctx = A.audio.context;
  pb.hum.g.gain.setTargetAtTime(on ? 0.015 + 0.07 * k : 0, ctx.currentTime, 0.15);
  pb.hum.o.frequency.setTargetAtTime(40 + 45 * k, ctx.currentTime, 0.2);
}

// --- The feature -----------------------------------------------------------------------------------------------------
const parsennCab = {
  setup(run) {
    if (!document.getElementById('pb-style')) {
      const s = el('style'); s.id = 'pb-style'; s.textContent = STYLE; document.head.append(s);
      run.cleanups.push(() => s.remove());
    }
    const ctrls = SECTIONS.map((sec) => FUNICULAR_CONTROLS.get(sec.lineId) || null);
    const pb = run.pb = { ctrls, lines: parsennLines(), input: { up: false, down: false, brake: false }, hold: { up: 0, down: 0 }, active: false, popT: 0, fadeOut: 0, P: {}, Q: {}, look: { yaw: 0, pitch: 0 } };
    run.group.add(pb.world = new THREE.Group());
    pb.world.name = 'ParsennCab';
    if (ctrls.every(Boolean)) parsennCab.buildWorld(run);
    // the cab round the eye: placed with the camera every frame
    pb.cab = new THREE.Group();
    const unlit = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
    pb.cab.add(new THREE.Mesh(cabGeometry(), unlit));
    pb.lever = new THREE.Group();
    pb.lever.position.set(-0.48, -0.34, 0.74);
    const handle = new THREE.Mesh(boxes([[0.03, 0.13, 0.03, 0, 0.065, 0, 0x3a3d42], [0.07, 0.045, 0.045, 0, 0.14, 0, 0xd3202a]]), unlit);
    pb.lever.add(handle);
    pb.cab.add(pb.lever);
    pb.lamps = {};
    for (const [id, x, colour] of [['doors', 0.5, 0x2fd27a], ['brake', 0.4, 0xff3b30], ['timelapse', 0.3, 0x2fb3ff]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.035), new THREE.MeshBasicNodeMaterial({ color: colour }));
      m.position.set(x, -0.2, 1.04);
      m.userData.on = new THREE.Color(colour).multiplyScalar(2.2); m.userData.off = new THREE.Color(0x3a3d42);
      pb.cab.add(m); pb.lamps[id] = m;
    }
    pb.cab.traverse((o) => { o.frustumCulled = false; o.renderOrder = 2; });
    pb.cab.matrixAutoUpdate = false;
    pb.cab.visible = false;
    run.group.add(pb.cab);
    parsennCab.buildHud(run);
    // the register: the key bar's keys, the touch buttons, the gamepad (the keys themselves: key() below)
    const d = () => run.state?.drive;
    const act = (fn) => () => { const v = d(); if (!v || !live(run)) return false; parsennCab.begin(run); return fn(v); };
    run.button('up', null); run.button('down', null); // (the touch screens' jump and descend: the lever's now)
    run.actions([
      { id: 'pb-up', kind: 'hold', primary: true, label: 'Lever up', touchLabel: 'Faster', glyph: '▲', keys: ['KeyW'], kbd: ['W'], keyboard: false, pad: 'up', run: (on) => { pb.input.up = on; if (on) parsennCab.begin(run); } },
      { id: 'pb-down', kind: 'hold', primary: true, label: 'Lever down', touchLabel: 'Slower', glyph: '▼', keys: ['KeyS'], kbd: ['S'], keyboard: false, pad: 'down', run: (on) => { pb.input.down = on; if (on) parsennCab.begin(run); } },
      { id: 'pb-brake', kind: 'hold', primary: true, label: 'Brake', glyph: '■', keys: ['Space'], keyboard: false, pad: 'b', run: (on) => { pb.input.brake = on; if (on) parsennCab.begin(run); } },
      { id: 'pb-doors', primary: true, label: 'Doors', glyph: '⇆', keys: ['KeyF'], keyboard: false, pad: 'a', run: act((v) => toggleDoors(v)) },
      { id: 'pb-horn', label: 'Horn', icon: 'i-horn', keys: ['KeyB'], keyboard: false, pad: 'y', run: act((v) => soundHorn(v)) },
      { id: 'pb-emergency', label: 'Emergency brake', touchLabel: 'Emergency', glyph: '!', keys: ['KeyX'], keyboard: false, pad: 'l3', run: act((v) => emergencyBrake(v)) },
      { id: 'pb-timelapse', kind: 'toggle', label: 'Time-lapse ×4', touchLabel: '×4', glyph: '»', keys: ['KeyT'], keyboard: false, pad: 'x', state: () => !!d()?.timelapse, run: act((v) => setTimelapse(v, !v.timelapse)) }
    ]);
    // the keys' holds: up as well as down (js/missions.js hands features the keydown only)
    run.listen(window, 'keyup', (e) => {
      if (!pb.active) return;
      const m = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', Space: 'brake' }[e.code];
      if (m) { pb.input[m] = false; e.preventDefault(); e.stopImmediatePropagation(); }
    }, { capture: true });
    run.cleanups.push(() => document.body.classList.remove('pb-cab'));
  },

  buildWorld(run) {
    const pb = run.pb, mobile = QUALITY.mobile;
    const tube = tunnelMaterial(), plat = platformMaterial();
    const parts = { tube: [], platform: [] };
    pb.lines.forEach((line, k) => {
      const ctrl = pb.ctrls[k], path = ctrl.paths[0], len = path.len, step = mobile ? 4 : 2;
      // the stations' zones: the train's length and a few metres at either end
      const stationLen = line.trainLength + 10;
      const hallW = (s) => Math.max(clamp((stationLen - s) / 8 + 1, 0, 1), clamp((s - (len - stationLen)) / 8 + 1, 0, 1)); // (1 in a station)
      const floors = [];
      for (const [a, b] of line.tunnels) {
        const s0 = Math.max(0, a - 2), s1 = b > len - 1 ? len + PB.buffer + 6 : b + 2; // (the top station's hall runs on past the buffer)
        parts.tube.push(sweep(ctrl, 0, s0, s1, step, (s) => blend(hallW(s)), (s) => 1 + 4 * hallW(s)));
        floors.push(sweep(ctrl, 0, s0, s1, step, () => [[-2.3, 0.04], [2.3, 0.04]], (s) => 1 + 1.5 * hallW(s)));
        // the tunnel's ends: a wall behind the valley station and beyond the top one
        for (const [s, end] of [[s0, a < 1], [s1, b > len - 1]]) {
          if (!end) continue;
          const P = ctrl.at(0, s, {}), h = Math.hypot(P.dx, P.dz) || 1;
          if (s > len) { P.x += P.dx * (s - len); P.y += P.dy * (s - len); P.z += P.dz * (s - len); }
          const wall = new THREE.PlaneGeometry(9, 7);
          wall.rotateY(Math.atan2(P.dx / h, P.dz / h));
          wall.translate(P.x - (P.dz / h) * 1.5, P.y + 2.6, P.z + (P.dx / h) * 1.5);
          wall.setAttribute('color', new THREE.Float32BufferAttribute(new Array(wall.attributes.position.count * 3).fill(1.8), 3));
          wall.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(wall.attributes.position.count).fill(0).flatMap(() => [0.6, 3]), 2));
          wall.deleteAttribute('normal');
          parts.tube.push(wall.toNonIndexed());
        }
      }
      if (floors.length) {
        const f = new THREE.Mesh(mergeGeometries(floors, false), floorMaterial(ctrl.f.gauge));
        f.name = `ParsennTunnelTrack${k}`;
        pb.world.add(f);
      }
      // the platforms: at both stations, beside the stopped train
      const under = (s) => line.tunnels.some(([a, b]) => s >= a && s <= b);
      for (const [s0, s1] of [[0, stationLen], [len - stationLen, len]]) parts.platform.push(sweep(ctrl, 0, s0, s1, 2, () => PLATFORM, (s) => (under(s) ? 0.15 : 1)));
      // the haul rope between the rails, both trains' ends of it
      const rope = [];
      for (const p of ctrl.paths) for (let i = 1; i < p.pts.length; i += mobile ? 2 : 1) {
        const a = p.pts[Math.max(0, i - (mobile ? 2 : 1))], b = p.pts[i];
        rope.push(a.x, a.y + 0.12, a.z, b.x, b.y + 0.12, b.z);
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rope, 3));
      pb.world.add(new THREE.LineSegments(rg, new THREE.LineBasicNodeMaterial({ color: 0x3a3936 })));
      // the stop line across the track, the board at the platform's end
      const stop = ctrl.at(0, len - 0.3, {}), h = Math.hypot(stop.dx, stop.dz) || 1, yaw = Math.atan2(stop.dx / h, stop.dz / h);
      const line3 = new THREE.Mesh(boxes([[2.2, 0.06, 0.12, 0, 0.1, 0, 0xf2c200]]), new THREE.MeshBasicNodeMaterial({ vertexColors: true }));
      line3.position.set(stop.x, stop.y, stop.z); line3.rotation.y = yaw;
      const board = new THREE.Group();
      board.add(new THREE.Mesh(boxes([[0.1, 2.0, 0.1, 0, 1.0, 0.05, 0x8a8f96]]), new THREE.MeshBasicNodeMaterial({ vertexColors: true })));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicNodeMaterial({ map: pb.halt ||= haltTexture(), side: THREE.DoubleSide }));
      face.position.set(0, 1.95, 0); face.rotation.y = Math.PI; // (facing down the line)
      board.add(face);
      // (the board stands a few metres on, beside the buffer: in the driver's view as the front comes to the line)
      const ahead = 4;
      board.position.set(stop.x + stop.dx * ahead - (stop.dz / h) * 1.7, stop.y + stop.dy * ahead - 0.3, stop.z + stop.dz * ahead + (stop.dx / h) * 1.7);
      board.rotation.y = yaw;
      pb.world.add(line3, board);
    });
    const tm = new THREE.Mesh(mergeGeometries(parts.tube, false), tube);
    tm.name = 'ParsennTunnels';
    const pm = new THREE.Mesh(mergeGeometries(parts.platform, false), plat);
    pm.name = 'ParsennPlatforms';
    pb.world.add(tm, pm);
    pb.world.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  },

  buildHud(run) {
    const pb = run.pb;
    const desk = el('div', 'pb-desk'); desk.hidden = true;
    const card = el('div', 'pb-card');
    const top = el('div', 'pb-top');
    const limit = el('div', 'pb-limit', '36');
    const sp = el('div'); const speed = el('div', 'pb-speed', '0'); sp.append(speed, el('div', 'pb-unit', 'km/h'));
    const lever = el('div', 'pb-lever');
    const lv = el('div', 'pb-lv');
    const gauge = el('div', 'pb-gauge'); const fill = el('i'); gauge.append(fill);
    lever.append(lv, gauge);
    top.append(limit, sp, lever);
    const rows = el('div', 'pb-rows');
    const row = (label, minor = false) => { const k = el('span', minor ? 'pb-minor' : null, tr(label)), v = el('span', minor ? 'pb-minor' : null); rows.append(k, v); return v; };
    // (a phone held across: the minor rows and the tags step aside for the touch buttons)
    const r = { board: row('Stop board'), next: row('Next limit'), clock: row('Clock', true), due: row('Due'), doors: row('Doors', true), score: row('Score', true) };
    r.board.classList.add('pb-board');
    const tags = el('div', 'pb-tags');
    const tag = (text) => { const t = el('span', 'pb-tag', tr(text)); tags.append(t); return t; };
    const tg = { brake: tag('Brake'), emergency: tag('Emergency brake'), timelapse: tag('Time-lapse ×4') };
    card.append(top, rows, tags);
    desk.append(card);
    const pop = el('div', 'pb-pop');
    const fade = el('div', 'pb-fade');
    document.body.append(desk, pop, fade);
    run.cleanups.push(() => { desk.remove(); pop.remove(); fade.remove(); });
    pb.hud = { desk, limit, speed, lv, gauge, fill, r, tg, pop, fade, sig: {} };
  },

  /** The first input starts the clock (the controllers never see the cab's keys, so js/missions.js would not notice) */
  begin(run) {
    if (run.phase === 'ready') { run.phase = 'running'; run.startedAt = run.gameClock || 0; run.ui.panel.dataset.phase = 'running'; }
  },

  reset(run) {
    const pb = run.pb, cm = run.hooks.controllerManager;
    run.state.drive = null;
    pb.active = false;
    if (!pb.ctrls.every(Boolean)) return; // (the mountain railways left out: ?qset=skip:bergbahnen)
    for (const c of pb.ctrls) { c.hold(true); c.run.s = 0; c.place(); }
    pb.hidden = null;
    pb.ctrls[0].portalHoles(false); // (the tunnels' dark plates: the cab looks out through the portals)
    run.state.drive = createDrive(pb.lines);
    Object.assign(pb.input, { up: false, down: false, brake: false });
    pb.hold.up = pb.hold.down = 0;
    pb.fadeOut = 0; pb.popT = 0; pb.lastK = 0;
    pb.active = true;
    pb.cab.visible = true;
    pb.hud.desk.hidden = false;
    // the walker waits at the valley station, out of sight
    const ent = cm.getActiveEntity();
    if (ent?.mesh) { pb.walker = ent.mesh; ent.mesh.visible = false; }
    document.body.classList.add('pb-cab');
    const cs = run.hooks.cameraSystem;
    cs.resetOrbit?.(); if (cs) cs.orbitPitchOffset = 0;
  },

  teardown(run) {
    const pb = run.pb;
    for (const c of pb.ctrls) if (c) { c.hold(false); c.hideClimbing(false); c.portalHoles(true); }
    if (pb.walker) pb.walker.visible = true;
    pb.active = false;
    document.body.classList.remove('pb-cab');
    run.hooks.cameraSystem?.resetForTeleport?.();
  },

  ownControls: (run) => !!run.pb?.active,

  key(run, e) {
    const pb = run.pb, d = run.state?.drive;
    if (!pb.active || run.phase === 'intro' || !SWALLOW.has(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!live(run) || !d) return;
    parsennCab.begin(run);
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': pb.input.up = true; break;
      case 'KeyS': case 'ArrowDown': pb.input.down = true; break;
      case 'Space': pb.input.brake = true; break;
      case 'KeyF': toggleDoors(d); break;
      case 'KeyB': soundHorn(d); break;
      case 'KeyX': emergencyBrake(d); break;
      case 'KeyT': setTimelapse(d, !d.timelapse); break;
      default: break;
    }
  },

  flash(run, text, bad = false) {
    const H = run.pb.hud;
    H.pop.textContent = tr(text);
    H.pop.classList.toggle('bad', bad);
    H.pop.classList.add('is-on');
    run.pb.popT = 2.2;
  },

  update(run, ctx, dt) {
    const pb = run.pb, d = run.state?.drive;
    if (!pb.active || !d) return;
    if (run.phase === 'running') {
      // the lever: a notch at the press, then on while held
      for (const dir of ['up', 'down']) {
        if (!pb.input[dir]) { pb.hold[dir] = 0; continue; }
        const before = pb.hold[dir];
        pb.hold[dir] += dt;
        const step = PB.notch / PB.leverRate, delay = 0.3;
        const n = (t) => (t <= 0 ? 0 : 1 + Math.max(0, Math.floor((t - delay) / step)));
        for (let i = n(before); i < n(pb.hold[dir]); i++) leverStep(d, dir === 'up' ? 1 : -1);
      }
      driveStep(d, { dt, brake: pb.input.brake });
      // its events on the hold's own (the drive's are cleared next frame)
      for (const e of d.events.splice(0)) parsennCab.event(run, e);
    }
    // the train on the line (the drive's section: the cars placed now, before the frame is drawn)
    const c = pb.ctrls[d.k];
    if (pb.hidden !== d.k) { pb.hidden = d.k; pb.ctrls.forEach((x, i) => x.hideClimbing(i === d.k)); } // (the car the camera rides in)
    if (c) { c.run.s = clamp(d.s, 0, c.runLen + PB.buffer); c.place(); }
    if (pb.lastK !== d.k) { pb.lastK = d.k; pb.fadeOut = 1; }
    hum(run, d.v, driveLine(d).vmax, live(run) && (d.v > 0.02 || d.phase === 'run' || d.phase === 'ready'));
  },

  event(run, e) {
    switch (e.type) {
      case 'horn': horn(run); break;
      case 'doors': chime(run); break;
      case 'interlock': parsennCab.flash(run, 'Doors open: the drive is locked', true); break;
      case 'boarding': parsennCab.flash(run, 'Wait: the passengers are still boarding', true); break;
      case 'moving': parsennCab.flash(run, 'Doors only at a standstill', true); break;
      case 'not-here': parsennCab.flash(run, 'Not at the platform yet', true); break;
      case 'emergency': run.audio.thump(0.6); parsennCab.flash(run, 'Emergency brake!', true); break;
      case 'overrun': parsennCab.flash(run, 'Past the board: the limit switch trips', true); break;
      case 'buffer': run.audio.thump(0.9); parsennCab.flash(run, 'Into the buffer stop!', true); break;
      case 'timelapse-off': parsennCab.flash(run, 'Time-lapse off: a limit ahead'); break;
      case 'timelapse-no': parsennCab.flash(run, 'No time-lapse here', true); break;
      case 'depart': parsennCab.flash(run, e.late < 0 ? 'Left too early!' : e.horn ? 'Departure, with the horn' : 'Departure', e.late < 0); break;
      case 'arrived': parsennCab.flash(run, `${fmtError(e.result.error)} · +${e.result.total}`); break;
      case 'change': parsennCab.flash(run, 'Change to the upper car'); break;
      default: break;
    }
  },

  after(run, ctx, dt, cm, cs) {
    const pb = run.pb, d = run.state?.drive, H = pb.hud;
    if (!pb.active || !d) { pb.cab.visible = false; return; }
    // --- the camera in the cab
    const c = pb.ctrls[d.k], line = driveLine(d);
    const front = clamp(d.s, 0, c.runLen + PB.buffer) + 0.3 + c.trainLength;
    const eyeS = Math.min(front - EYE.back, c.paths[0].len - EYE.back);
    const P = c.at(0, eyeS, pb.P);
    const ex = P.x, ey = P.y + EYE.up, ez = P.z;
    // (the heading and the grade from a chord, smoother than the polyline's segments)
    const A = c.at(0, Math.max(0, eyeS - 4), pb.Q), bx = A.x, by = A.y, bz = A.z;
    const B = c.at(0, Math.min(c.paths[0].len, eyeS + 14), pb.Q);
    const hx = B.x - bx, hz = B.z - bz, hl = Math.hypot(hx, hz) || 1, grade = (B.y - by) / hl;
    const yaw = Math.atan2(hx, hz);
    // the look round: the camera system's drag (and the gamepad's right stick), easing back when let go
    if (!cs.isDragging && !(cs.userOrbitTimer > 0)) { cs.orbitYawOffset *= Math.exp(-dt * 1.5); cs.orbitPitchOffset *= Math.exp(-dt * 1.5); }
    cs.orbitYawOffset = clamp(cs.orbitYawOffset || 0, -1.6, 1.6);
    cs.orbitPitchOffset = clamp(cs.orbitPitchOffset || 0, -0.5, 0.6);
    const lookYaw = yaw + cs.orbitYawOffset, pitch = Math.atan(grade) * 0.3 - cs.orbitPitchOffset * 0.8;
    const cam = ctx.camera;
    if (cam.fov !== CAB_FOV) { cam.fov = CAB_FOV; cam.updateProjectionMatrix(); } // (wider than the chase camera's: the desk and the pillars in view)
    cam.position.set(ex, ey, ez);
    cam.up.set(0, 1, 0);
    cam.lookAt(ex + Math.sin(lookYaw) * Math.cos(pitch) * 50, ey + Math.sin(pitch) * 50, ez + Math.cos(lookYaw) * Math.cos(pitch) * 50);
    cam.updateMatrixWorld();
    // the cab round it (level: the car's ends stand plumb), the lever and the lamps
    pb.cab.visible = true;
    pb.cab.matrix.makeRotationY(yaw).setPosition(ex, ey, ez);
    pb.cab.matrixWorldNeedsUpdate = true;
    pb.lever.rotation.x = -0.7 + d.lever * 1.4;
    const lamp = (id, on) => { const m = pb.lamps[id]; m.material.color.copy(on ? m.userData.on : m.userData.off); };
    lamp('doors', d.doors === 'closed'); lamp('brake', pb.input.brake || d.emergency); lamp('timelapse', d.timelapse);
    // --- the change at Höhenweg: the screen goes dark, the upper car comes up
    let fade = 0;
    if (d.phase === 'change') fade = clamp(d.changeT / (PB.fade * 0.5), 0, 1);
    else if (pb.fadeOut > 0) { pb.fadeOut = Math.max(0, pb.fadeOut - dt / 0.8); fade = pb.fadeOut; }
    H.fade.style.opacity = String(fade);
    if (pb.popT > 0) { pb.popT -= dt; if (pb.popT <= 0) H.pop.classList.remove('is-on'); }
    // --- the desk
    H.desk.hidden = run.phase === 'done' || run.phase === 'failed' || run.phase === 'aborted';
    const set = (node, key, text) => { if (H.sig[key] !== text) { H.sig[key] = text; node.textContent = text; } };
    const limit = driveLimit(d), kmh = Math.round(d.v * 3.6);
    set(H.limit, 'limit', String(limit));
    set(H.speed, 'speed', String(kmh));
    H.speed.classList.toggle('is-over', kmh > limit + PB.tolerance);
    set(H.lv, 'lever', `${tr('Lever')} ${Math.round(d.lever * 100)} %\n→ ${Math.round(d.lever * line.topKmh)} km/h`);
    H.lv.style.whiteSpace = 'pre-line';
    H.fill.style.height = `${Math.round(d.lever * 100)}%`;
    H.gauge.classList.toggle('is-brake', pb.input.brake || d.emergency);
    const togo = toBoard(d);
    const near = Math.abs(togo);
    set(H.r.board, 'board', `${near < 1 ? `${Math.round(near * 100)} cm` : near < 10 ? `${near.toFixed(1)} m` : `${Math.round(togo)} m`}${togo < 0 ? ` ${tr('past')}` : ''}`);
    H.r.board.classList.toggle('is-near', Math.abs(togo) < 10);
    const next = nextLimit(line.limits, d.s, line.topKmh);
    set(H.r.next, 'next', next ? `${next.kmh} km/h ${tr('in')} ${Math.round(next.from - d.s)} m` : '—');
    set(H.r.clock, 'clock', fmtClock(d.t));
    const tt = d.timetable[d.k];
    const due = d.phase === 'boarding' || d.phase === 'ready' ? `${tr('dep.')} ${fmtClock(tt.depart)}` : `${tr('arr.')} ${fmtClock(tt.arrive)}`;
    set(H.r.due, 'due', due);
    set(H.r.doors, 'doors', `${tr(d.doors === 'open' ? 'open' : 'closed')} · ${d.aboard}/${line.section.passengers}`);
    set(H.r.score, 'score', String(driveScore(d)));
    H.tg.brake.classList.toggle('is-on', pb.input.brake && !d.emergency);
    H.tg.emergency.classList.toggle('is-warn', d.emergency);
    H.tg.timelapse.classList.toggle('is-on', d.timelapse);
  }
};

export const PARSENN_FEATURES = { parsennCab };
