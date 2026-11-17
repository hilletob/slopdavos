import * as THREE from 'three/webgpu';
import { texture, uv, vec2, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { EISSTADION, stadiumFacets, stadiumVerge } from './landmark-buildings-data.js';
import { RINK, rinkWorld, rinkLocal } from './missions-data-ice.js';
import { rinkShape, rinkTexture, buildStands, rinkIceY, rinkSound, buildIceHud, meter, edge, touchLabel } from './missions-ice.js';
import { buildZamboniModel } from './missions-rink.js';
import { createToast, particles } from './missions-work.js';
import { QUALITY } from './quality.js';
import {
  ZAMBONI, createZamboniIce, resetZamboniIce, createMachine, stepMachine, stepConditioner, stepFilm, iceShare, bandShare,
  puddleArea, machineWorld, inTunnel
} from './missions-data-zamboni.js';

// js/missions-zamboni.js
// The runtime of js/missions-data-zamboni.js (ZAMBONI_FEATURES, merged into js/missions.js FEATURES):
//   zamboni — the Eisstadion in the second intermission: the rink (js/missions-ice.js, as the penalty shoot-out's: the
//             ice with its markings, the boards and the glass, the stands up to the roof) with the resurfacer's gate in
//             the west end boards and its tunnel, the crowd in the stands (one instanced mesh of seated figures in HCD
//             yellow and blue, the seats left empty by those queueing for a beer), the video cube over centre ice
//             with the score and the intermission's clock. The ice's state is a small texture over the markings (a
//             texel a 0.5 m cell: rough and scratched, the warm film, puddles) that a node material blends with a
//             scratch pattern. The resurfacer is js/missions-rink.js's model in the Eisstadion's lettering; the
//             player is its driver: the controllers' personDriver drives it (js/missions-data-zamboni.js stepMachine,
//             the eased steer of cm.turnInput), the personPoser seats the skinned person at its wheel, Space (the
//             touch button "Conditioner") lowers and raises the conditioner, V shows the ice from above. Its own
//             chase camera inside the hall; the steam off the warm water, the knock on the boards.
// Everything is built for the run and goes with its group and its cleanups (the textures in the node material, which
// the group's disposal does not see, explicitly).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const HL = RINK.halfL, HW = RINK.halfW, G = ZAMBONI.gate;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// --- The ice -----------------------------------------------------------------------------------------------------------
/** The rink's outline as a flat mesh in the root's frame (x along the rink, z across: the rink's y); `v(y)` its texture v */
function iceGeometry(v) {
  const geo = new THREE.ShapeGeometry(rinkShape(HL, HW, RINK.corner), 12);
  const uva = geo.attributes.uv, pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) uva.setXY(i, (pa.getX(i) + HL) / (2 * HL), v(pa.getY(i)));
  return geo.rotateX(Math.PI / 2); // (shape x → local x, shape y → local z = the rink's y)
}

/** Skate marks: thin arcs and strokes on black, tiled over the rough ice (its red channel) */
function scratchTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  for (let i = 0; i < 180; i++) {
    const x = hash(i) * S, y = hash(i + 50) * S, r = 30 + hash(i + 90) * 160, a0 = hash(i + 130) * Math.PI * 2;
    g.strokeStyle = `rgba(255,255,255,${0.25 + hash(i + 170) * 0.55})`;
    g.lineWidth = 0.6 + hash(i + 210) * 1.6;
    g.beginPath(); g.arc(x, y, r, a0, a0 + 0.25 + hash(i + 250) * 0.6); g.stroke();
  }
  // snow dust from the stops
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${hash(i + 400) * 0.5})`; g.fillRect(hash(i + 700) * S, hash(i + 1300) * S, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The overlay's material: the map's texels (r: rough, g: the film, b: a puddle) over the scratch pattern */
function overlayMaterial(cov, scratch) {
  const c = texture(cov, uv());
  const s = texture(scratch, uv().mul(vec2(9, 4.5))).r;
  const haze = c.r.mul(s.mul(0.35).add(0.58)), wet = c.g.mul(0.55), pud = c.b.mul(0.78);
  const sum = haze.add(wet).add(pud);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.colorNode = vec3(0.6, 0.64, 0.68).mul(s.mul(0.45).add(0.75)).mul(haze).add(vec3(0.04, 0.12, 0.22).mul(wet)).add(vec3(0.06, 0.16, 0.3).mul(pud)).div(sum.max(0.001));
  m.opacityNode = sum.min(0.92);
  return m;
}

/** The map into the texture's bytes (only the changed range) */
function paintIce(z, d) {
  const g = z.grid, data = z.covData;
  for (let j = Math.max(0, d.j0); j <= Math.min(g.rows - 1, d.j1); j++) for (let i = Math.max(0, d.i0); i <= Math.min(g.cols - 1, d.i1); i++) {
    const k = j * g.cols + i, o = k * 4;
    data[o] = g.done[k] ? 0 : 255;
    data[o + 1] = Math.round(clamp(g.film[k], 0, 1) * 255);
    data[o + 2] = g.puddle[k] ? 255 : 0;
    data[o + 3] = 255;
  }
  z.covTex.needsUpdate = true;
}

// --- The hall ----------------------------------------------------------------------------------------------------------
/** The boards (a yellow kick strip, white, the glass) round the rink, open at the gate */
function buildBoards() {
  const ring = rinkShape(HL, HW, RINK.corner).getSpacedPoints(220);
  const open = (p) => p.x < -HL + 0.05 && Math.abs(p.y - G.y) < G.halfW;
  const wall = (h0, h1, colour, opts = {}) => {
    const pos = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      if (open(a) || open(b)) continue;
      pos.push(a.x, h0, a.y, b.x, h0, b.y, b.x, h1, b.y, a.x, h0, a.y, b.x, h1, b.y, a.x, h1, a.y);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, side: THREE.DoubleSide, emissive: colour, emissiveIntensity: 0.25, ...opts }));
  };
  return [wall(0, 0.2, 0xf2c400), wall(0.2, 1.1, 0xf4f6f8), wall(1.1, 2.9, 0xcfe6ff, { transparent: true, opacity: 0.16, depthWrite: false, emissiveIntensity: 0 })];
}

/** The gate: its two leaves swung back against the tunnel's walls, the tunnel (a box seen from within: its walls and
 *  roof dark, its end towards the ice open, as its outer faces are not drawn), a concrete slab over it, the blue lintel,
 *  the rubber floor, a strip light under its roof */
function buildGate() {
  const g = new THREE.Group();
  g.name = 'ZamboniGate';
  const D = G.depth, W = G.halfW + 0.15, H = 3.0, x0 = -HL - D / 2;
  const lit = (color, k, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: color, emissiveIntensity: k, ...o });
  const hollow = new THREE.Mesh(new THREE.BoxGeometry(D, H, 2 * W).translate(x0, H / 2 + 0.005, G.y), lit(0x2c3036, 0.5, { side: THREE.BackSide }));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(D, 0.3, 2 * W + 0.6).translate(x0 - 0.2, H + 0.15, G.y), lit(0x9a9da0, 0.18));
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 2 * W + 0.6).translate(-HL - 0.15, H + 0.1, G.y), lit(0x1d3f8f, 0.35, { roughness: 0.5 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(D, 2 * W).rotateX(-Math.PI / 2).translate(x0, 0.012, G.y), lit(0x202226, 0.2, { roughness: 0.95 }));
  const strip = new THREE.Mesh(new THREE.BoxGeometry(D * 0.8, 0.05, 0.25).translate(x0, H - 0.04, G.y), new THREE.MeshBasicMaterial({ color: 0xfff2d0 }));
  g.add(hollow, roof, lintel, floor, strip);
  const leafMat = lit(0xf4f6f8, 0.25, { roughness: 0.6 });
  for (const sy of [1, -1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(G.halfW * 1.9, 1.1, 0.08).translate(-HL - G.halfW * 0.95 - 0.05, 0.55, G.y + sy * (G.halfW - 0.06)), leafMat));
  return g;
}

/** The hall's inside above the stands: the stands' flat roof (the outline less the pitched roof's verge) at the eaves,
 *  the glazed gables under the verge, the pitched roof's facets from below (the landmark's roof is drawn from outside
 *  only), dark; the floodlights' bars over the ice in the rink's frame (added to the root) */
function buildCeiling(floor) {
  const S = EISSTADION, T = S.thickness + 0.05, mat = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.9, emissive: 0x1b1e24, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const verge = stadiumVerge();
  const shape = new THREE.Shape(S.outline.map((p) => new THREE.Vector2(p.x, -p.z)));
  shape.holes.push(new THREE.Path(verge.map((p) => new THREE.Vector2(p.x, -p.z))));
  const flat = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, floor + S.eaves - 0.3, 0); // (shape y = −z)
  const pos = [];
  const v = (p, h) => pos.push(p.x, floor + h, p.z);
  for (let i = 0; i < verge.length; i++) {
    const a = verge[i], b = verge[(i + 1) % verge.length];
    if (a.h - S.eaves > 0.01 || b.h - S.eaves > 0.01) { v(a, S.eaves - 0.3); v(b, S.eaves - 0.3); v(b, b.h - T); v(a, S.eaves - 0.3); v(b, b.h - T); v(a, a.h - T); }
  }
  for (const [a, b, c] of stadiumFacets()) { v(a, a.h - T); v(b, b.h - T); v(c, c.h - T); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.name = 'HallCeiling';
  g.add(new THREE.Mesh(flat, mat), new THREE.Mesh(geo, mat));
  return g;
}
function buildFloodlights() {
  const bar = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  const g = new THREE.Group();
  for (const y of [-10, -3.5, 3.5, 10]) g.add(new THREE.Mesh(new THREE.BoxGeometry(44, 0.12, 0.3).translate(0, 23, y), bar));
  return g;
}

/** The crowd: seated figures on the stands' bowl (js/missions-ice.js buildStands), facing the ice; a share of the seats
 *  empty in the intermission. One instanced mesh with a colour per figure */
function buildCrowd(run, stands) {
  const { inner, outer, y0, top } = stands.userData.bowl;
  const share = QUALITY.mobile ? 0.22 : 0.48, ROWS = 18, SUB = 3;
  const N = inner.length, seats = [];
  const centre = rinkWorld(0, 0);
  const palette = [0xf2c400, 0x1d3f8f, 0x1d3f8f, 0xf2c400, 0x2a2d33, 0x2a2d33, 0xe8e8e8, 0x55595e, 0xb3202a, 0x6b4f3a, 0x14305e];
  for (let r = 0; r < ROWS; r++) {
    const f = (r + 0.55) / ROWS;
    for (let i = 0; i < N; i++) for (let s = 0; s < SUB; s++) {
      const k = i * SUB + s + r * 1000;
      if (hash(k) > share) continue;
      const t = s / SUB, a = inner[i], b = inner[(i + 1) % N], c = outer[i], d = outer[(i + 1) % N];
      const ix = a.x + (b.x - a.x) * t, iz = a.z + (b.z - a.z) * t, ox = c.x + (d.x - c.x) * t, oz = c.z + (d.z - c.z) * t;
      const x = ix + (ox - ix) * f, z = iz + (oz - iz) * f;
      const l = rinkLocal(x, z);
      if (l.x < -HL + 1 && Math.abs(l.y - G.y) < G.halfW + 1.5 && f < 0.35) continue; // (over the tunnel's mouth)
      seats.push({ x, z, y: y0 + (top - y0) * f, k });
    }
  }
  const geo = new THREE.BoxGeometry(0.46, 0.66, 0.36).translate(0, 0.33, 0);
  const head = new THREE.BoxGeometry(0.2, 0.22, 0.22).translate(0, 0.78, 0);
  const merged = new THREE.BufferGeometry();
  // (a torso and a head as one geometry: two boxes' positions and normals)
  const parts = [geo, head];
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const p of parts) {
    pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array);
    for (const i of p.index.array) idx.push(i + base);
    base += p.attributes.position.count;
    p.dispose();
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  merged.setIndex(idx);
  const mesh = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ roughness: 0.9, emissive: 0x30343c, emissiveIntensity: 0.6 }), seats.length);
  seats.forEach((s, i) => {
    const yaw = Math.atan2(centre.x - s.x, centre.z - s.z) + (hash(s.k + 5) - 0.5) * 0.5;
    _q.setFromAxisAngle(UP, yaw);
    const h = 0.92 + hash(s.k + 9) * 0.16;
    mesh.setMatrixAt(i, _m.compose(_p.set(s.x, s.y + 0.08, s.z), _q, _s.set(h, h, h)));
    mesh.setColorAt(i, _c.setHex(palette[Math.floor(hash(s.k + 13) * palette.length)]));
  });
  mesh.frustumCulled = false;
  mesh.name = 'ZamboniCrowd';
  return run.storage(mesh);
}

/** The video cube over centre ice: the score and the intermission's clock on its four faces (one canvas) */
function buildCube() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  g.name = 'VideoCube';
  const frame = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.2, 6.4), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6 }));
  g.add(frame);
  const face = new THREE.MeshBasicMaterial({ map: tex });
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 3.75), face);
    const a = (i * Math.PI) / 2;
    p.position.set(Math.sin(a) * 3.22, 0, Math.cos(a) * 3.22);
    p.rotation.y = a;
    g.add(p);
  }
  // the cables up to the roof
  const cable = new THREE.MeshBasicMaterial({ color: 0x0b0c0e });
  for (const [x, z] of [[2.8, 2.8], [-2.8, 2.8], [2.8, -2.8], [-2.8, -2.8]]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 12, 4).translate(x, 8.1, z), cable));
  return { group: g, canvas: c, tex, shown: null };
}

function paintCube(cube, left) {
  const text = fmtClock(left);
  if (cube.shown === text) return;
  cube.shown = text;
  const g = cube.canvas.getContext('2d'), W = cube.canvas.width, H = cube.canvas.height;
  g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 64px system-ui, sans-serif';
  g.fillStyle = '#ffd200'; g.fillText('HCD', W * 0.2, 62);
  g.fillStyle = '#ffffff'; g.fillText('ZSC', W * 0.8, 62);
  g.font = '800 84px system-ui, sans-serif';
  g.fillStyle = '#ff5a2a'; g.fillText('2 : 1', W / 2, 66);
  g.font = '700 34px system-ui, sans-serif';
  g.fillStyle = '#9fb4d8'; g.fillText('PAUSE', W / 2, 150);
  g.font = '800 104px ui-monospace, Menlo, monospace';
  g.fillStyle = left < 60000 ? '#ff4a3a' : '#ffd200';
  g.fillText(text, W / 2, 238);
  g.strokeStyle = '#1d3f8f'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);
  cube.tex.needsUpdate = true;
}

// --- The feature -------------------------------------------------------------------------------------------------------
const zamboni = {
  setup(run) {
    const cm = run.hooks.controllerManager;
    const y = rinkIceY();
    const root = new THREE.Group();
    root.name = 'ZamboniRink';
    root.position.set(RINK.x, y, RINK.z);
    root.rotation.y = Math.atan2(RINK.ux, RINK.uz) - Math.PI / 2; // (local x along the rink, local z its y)
    run.group.add(root);
    const grid = createZamboniIce();
    const z = run.zam = { y, root, grid, m: createMachine(), view: 'chase', cam: null, filmT: 0, shareT: 0, paintT: 0, steamAcc: 0, knockT: 0, puddleT: 0, lowT: 0 };
    // the ice: the markings (the penalty shoot-out's texture), and over it the map's overlay
    const marks = rinkTexture();
    const ice = new THREE.Mesh(iceGeometry((ly) => 1 - (ly + HW) / (2 * HW)), new THREE.MeshStandardMaterial({ map: marks, emissiveMap: marks, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.12, side: THREE.DoubleSide }));
    ice.receiveShadow = true;
    z.covData = new Uint8Array(grid.cols * grid.rows * 4);
    z.covTex = new THREE.DataTexture(z.covData, grid.cols, grid.rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    z.covTex.magFilter = z.covTex.minFilter = THREE.LinearFilter;
    z.covTex.generateMipmaps = false;
    z.scratch = scratchTexture();
    const overlay = new THREE.Mesh(iceGeometry((ly) => (ly + HW) / (2 * HW)), overlayMaterial(z.covTex, z.scratch));
    overlay.position.y = 0.008;
    overlay.renderOrder = 2;
    run.cleanups.push(() => { z.covTex.dispose(); z.scratch.dispose(); });
    root.add(ice, overlay, ...buildBoards(), buildGate());
    // the stands, the crowd on them, the video cube
    const floor = Math.min(...EISSTADION.outline.map((p) => groundHeight(p.x, p.z)));
    const stands = buildStands(y + 1.15, floor + EISSTADION.eaves - 0.6);
    run.group.add(stands, buildCrowd(run, stands), buildCeiling(floor));
    root.add(buildFloodlights());
    z.cube = buildCube();
    z.cube.group.position.set(0, 14.5, 0);
    root.add(z.cube.group);
    // the machine, in the Eisstadion's lettering (its materials lit a little from within: the arena's floodlights)
    const v = z.v = buildZamboniModel({ decal: ['HCD', 'Eisstadion Davos · Vaillant Arena'] });
    v.group.traverse((o) => {
      for (const mt of [].concat(o.material || [])) if (mt.isMeshStandardMaterial && mt.color && !mt.map && mt.emissive && mt.emissive.getHex() === 0) { mt.emissive.copy(mt.color); mt.emissiveIntensity = 0.22; }
    });
    run.group.add(v.group);
    // the HUD: the ice done, the conditioner, the water and the snow tank
    const { hud, flash, big } = buildIceHud(run);
    const ui = z.ui = { hud, flash, big, ice: el('span', null, 'Ice 0 %'), cond: el('span', null, 'Conditioner off') };
    ui.water = meter(); ui.snow = meter();
    for (const mt of [ui.water, ui.snow]) { mt.zone.style.display = 'none'; mt.needle.style.display = 'none'; mt.m.style.width = '110px'; }
    ui.water.fill.style.background = 'linear-gradient(90deg, #2f7fd8, #7cc4ff)';
    ui.snow.fill.style.background = 'linear-gradient(90deg, #c9d3dc, #ffffff)';
    const row1 = el('div', 'ice-row'), row2 = el('div', 'ice-row');
    row1.append(ui.ice, ui.cond);
    row2.append(el('span', null, 'Water'), ui.water.m, el('span', null, 'Snow tank'), ui.snow.m);
    hud.append(row1, row2, flash);
    z.toast = createToast(run);
    // the keys: the driving in the key bar, Space for the conditioner (the touch screens' jump button), V the view
    run.hints([[['W'], 'drive'], [['S'], 'brake · back up'], [['A', 'D'], 'steer'], [['Space'], 'conditioner on/off']]);
    run.actions([{ id: 'zamboni-view', label: 'Overview', icon: 'i-eye', keys: ['KeyV'], keyboard: false, pad: 'x', run: () => zamboni.toggleView(run) }]);
    // the cluster at the bottom right: the machine and its speed (the person's, js/main.js); the camera is the mission's
    run.vehiclePanel({ label: 'Ice resurfacer', topSpeedKmh: 15, camera: false });
    // the driver: the controllers' person drives the machine and sits at its wheel meanwhile
    cm.personDriver = (dt) => zamboni.drive(run, dt, cm);
    cm.personPoser = (dt, p) => zamboni.pose(run, dt, p);
    run.cleanups.push(() => {
      if (cm.personDriver) cm.personDriver = null;
      cm.personPoser = null;
      const p = cm.entities.person;
      p.rig.placed = false;
      p.speed = 0;
    });
  },
  reset(run) {
    const z = run.zam, cm = run.hooks.controllerManager, p = cm.entities.person;
    resetZamboniIce(z.grid);
    paintIce(z, { i0: 0, i1: z.grid.cols - 1, j0: 0, j1: z.grid.rows - 1 });
    z.grid.dirty = null;
    z.m = createMachine();
    z.view = 'chase';
    z.cam = null;
    z.toast.hide();
    z.cube.shown = null;
    paintCube(z.cube, ZAMBONI.timeLimitMs);
    run._edge_up = true; // (the Enter of the start: no toggle yet)
    touchLabel(run, 'Conditioner');
    run.hooks.cameraSystem.orbitYawOffset = 0;
    zamboni.place(run, p);
    p.rig.placed = false;
    run.lastPos.copy(p.position);
    run.hooks.cameraSystem.resetForTeleport?.();
  },
  teardown(run) { run.hooks.cameraSystem.orbitYawOffset = 0; },
  key(run, e) {
    if (e.code !== 'KeyV' || run.phase === 'intro') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) zamboni.toggleView(run);
  },
  toggleView(run) { if (run.zam) { run.zam.view = run.zam.view === 'chase' ? 'overview' : 'chase'; run.zam.cam = null; } },
  /** The person (and the machine's model) where the machine is */
  place(run, p) {
    const z = run.zam, w = machineWorld(z.m);
    p.position.set(w.x, z.y, w.z);
    p.heading = w.heading;
    p.speed = z.m.v;
    p.verticalVel = 0;
    const g = z.v.group;
    g.position.set(w.x, z.y, w.z);
    g.rotation.set(0, w.heading, 0);
    g.updateMatrixWorld(true);
  },
  /** The controllers' personDriver: the machine on the ice */
  drive(run, dt, cm) {
    const z = run.zam, k = cm.keys, m = z.m, p = cm.entities.person;
    const steer = cm.turnInput ? cm.turnInput(dt) : (+k.left || 0) - (+k.right || 0);
    const go = live(run) && !run.state?.finished;
    // (before the start and after the finish: the brake held, and no backing up out of the tunnel)
    if (!go) m.v = Math.sign(m.v) * Math.max(0, Math.abs(m.v) - ZAMBONI.machine.brake * dt);
    const r = stepMachine(m, go ? { forward: +k.forward || 0, back: +k.backward || 0, steer } : { forward: 0, back: 0, steer: 0 }, dt);
    if (r.impact >= ZAMBONI.bump && run.phase === 'running') z.knock = r.impact;
    else if (r.impact > 0.4) rinkSound(run, 'boards', clamp(r.impact / 2, 0.2, 0.5));
    zamboni.place(run, p);
    // the wheels: rolling, the front pair steered
    for (const w of z.v.wheels) {
      w.mesh.rotation.x += (m.v * dt) / w.r;
      w.mesh.rotation.y = w.front ? m.steer : 0;
    }
  },
  pose(run, _dt, p) {
    const v = run.zam.v;
    p.rig.ride(v.group, 0, v.seat);
    // (where the figure is, for the figure's own placing: as the sledges do, js/missions-sledge.js)
    p.rig.placed = true;
    p.rig.x = p.position.x; p.rig.z = p.position.z; p.rig.yaw = p.heading;
  },
  update(run, ctx, dt, cm) {
    const z = run.zam, st = run.state, m = z.m, g = z.grid;
    const running = run.phase === 'running' && !st.finished;
    // Space: the conditioner down or up (not before the start, not after the finish)
    if (edge(run, cm, 'up') && live(run) && !st.finished) {
      m.on = !m.on;
      if (m.on && m.water <= 0) { m.on = false; z.toast.show('The water tank is empty', '#ff9e8a', 1.6); }
    }
    if (st.finished && m.on) m.on = false;
    const t = (ctx.t || 0) / 1000;
    if (running) {
      const out = stepConditioner(g, m, dt, t);
      if (out.puddles && performance.now() - z.puddleT > 1500) { z.puddleT = performance.now(); z.toast.show('Water on wet ice: a puddle!', '#7cc4ff', 1.6); }
      if (m.on && m.v > ZAMBONI.conditioner.minSpeed && m.water > 0) zamboni.steam(run, dt);
    }
    if (z.knock) {
      st.bumps = m.bumps;
      rinkSound(run, 'boards', 1);
      z.toast.show(`Hard knock on the boards! −${ZAMBONI.points.bump}`, '#ff9e8a', 1.8);
      z.knock = 0;
    }
    stepFilm(g, dt);
    if (m.water <= 0 && !st.dry) { st.dry = true; m.on = false; }
    if (m.water > 0 && m.water < 0.12 && performance.now() - z.lowT > 12000 && running) { z.lowT = performance.now(); z.toast.show('Water tank almost empty', '#ffc83d', 1.8); }
    // the shares for the steps and the HUD, five times a second
    z.shareT -= dt;
    if (z.shareT <= 0) {
      z.shareT = 0.2;
      Object.assign(st, { ice: iceShare(g), band: bandShare(g), puddleM2: puddleArea(g), water: m.water, snow: m.snow, on: m.on, bumps: m.bumps });
      st.inTunnel = inTunnel(m.x, m.y);
      const ui = z.ui, ice = `Ice ${Math.floor(st.ice * 100)} %`, cond = m.on ? 'Conditioner on' : 'Conditioner off';
      if (ui.ice.textContent !== ice) ui.ice.textContent = ice;
      if (ui.cond.textContent !== cond) { ui.cond.textContent = cond; ui.cond.style.color = m.on ? '#5be08c' : '#ffc83d'; }
      ui.water.fill.style.width = `${m.water * 100}%`;
      ui.snow.fill.style.width = `${m.snow * 100}%`;
    }
    // the ice's texture: the changed cells, up to fifteen times a second
    z.paintT -= dt;
    if (g.dirty && z.paintT <= 0) { z.paintT = 1 / 15; paintIce(z, g.dirty); g.dirty = null; }
    paintCube(z.cube, ZAMBONI.timeLimitMs - (run.phase === 'running' ? ctx.t || 0 : 0));
    z.toast.update(dt);
    run.workParticles?.update(dt, ctx.camera);
  },
  /** A little steam off the warm water behind the conditioner */
  steam(run, dt) {
    const z = run.zam, m = z.m;
    z.steamAcc += dt * (QUALITY.mobile ? 8 : 16);
    if (z.steamAcc < 1) return;
    const pb = particles(run), w = machineWorld(m), fx = Math.sin(w.heading), fz = Math.cos(w.heading), lx = Math.cos(w.heading), lz = -Math.sin(w.heading);
    const C = ZAMBONI.conditioner;
    while (z.steamAcc >= 1) {
      z.steamAcc--;
      const s = (Math.random() - 0.5) * C.halfW * 2, back = C.back + 0.7;
      pb.spawn({ x: w.x - fx * back + lx * s, y: z.y + 0.05, z: w.z - fz * back + lz * s, vx: 0, vy: 0.45, vz: 0, gravity: 0, life: 1.2, size0: 0.14, size1: 0.6, alpha: 0.13, r: 0.92, g: 0.95, b: 1, kind: 'lump' });
    }
  },
  after(run, ctx, dt) {
    const z = run.zam, v = z.v;
    if (v.beacon) v.beacon.material.emissiveIntensity = live(run) ? 0.6 + 0.6 * Math.max(0, Math.sin(performance.now() / 120)) : 0.3;
    zamboni.camera(run, ctx, dt);
  },
  /** The camera: behind and over the machine along its heading (and the drag's offset), kept inside the hall; in the
   *  tunnel it waits on the ice and looks into the gate; V: the whole ice from above the west end */
  camera(run, ctx, dt) {
    const z = run.zam, m = z.m, cam = ctx.camera, cs = run.hooks.cameraSystem, y = z.y;
    let want;
    if (z.view === 'overview') {
      const p = rinkWorld(-HL - 1, 0), l = rinkWorld(3, 0);
      want = { x: p.x, y: y + 21, z: p.z, lx: l.x, ly: y, lz: l.z };
    } else if (m.x < -HL + 1.5) {
      // (out of the tunnel's mouth: from the ice, the gate in view)
      const p = rinkWorld(-HL + 10.5, G.y - 5.5), l = rinkWorld(m.x - 0.5, m.y);
      want = { x: p.x, y: y + 3.8, z: p.z, lx: l.x, ly: y + 1.2, lz: l.z };
    } else {
      const off = clamp(cs.orbitYawOffset || 0, -Math.PI, Math.PI);
      const a = m.a - off; // (the drag turns the view round the machine; in the rink's frame a turn to the left is −a)
      let cx = m.x - Math.cos(a) * 9.5, cy = m.y - Math.sin(a) * 9.5;
      // (not into the stands: inside the boards and a little over them)
      cx = clamp(cx, -HL - 1.5, HL + 1.5); cy = clamp(cy, -HW - 1.5, HW + 1.5);
      const p = rinkWorld(cx, cy), l = rinkWorld(m.x + Math.cos(m.a) * 5, m.y + Math.sin(m.a) * 5);
      want = { x: p.x, y: y + 6.4, z: p.z, lx: l.x, ly: y + 0.4, lz: l.z };
    }
    const c = z.cam || (z.cam = { ...want });
    const k = Math.min(1, dt * 4);
    for (const key of Object.keys(want)) c[key] += (want[key] - c[key]) * k;
    cam.position.set(c.x, c.y, c.z);
    cam.lookAt(c.lx, c.ly, c.lz);
    cam.updateMatrixWorld();
  }
};

export const ZAMBONI_FEATURES = { zamboni };
