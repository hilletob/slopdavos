import * as THREE from 'three/webgpu';
import { abs, attribute, float, fract, length, max, min, mix, smoothstep, step, uv, vec2, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, lateNight, nightGlow, worldNoise } from './building-kit.js';
import {
  PAULUSKIRCHE, apseWindows, drumRing, groundOutlines, onWall, porchRoofAt, roofAt, toWorld, towerRing, turretRing, wallAt, walls,
  windowList, worldFrame
} from './pauluskirche-data.js';

export { PAULUSKIRCHE };

// The Pauluskirche (the Protestant church of Davos Platz) rebuilt by hand (js/pauluskirche-data.js), standing in for
// its swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows: the
// surveyed volumes in light grey plaster under steep slate roofs: the nave's saddle roof between stepped gables over an
// ochre frieze, the round apse half out of the south-west gable with its ledge, drum and cone, the stair turret on the
// east side, the gabled porch before the entrance gable with its arched doorway, the rose window in its pointed recess
// over it, tall round-headed windows in pairs between buttresses over small ones (leaded glass, a faint glow behind
// them in the evening); the slender tower at the gable's west corner with its slits, the round window under the
// cornice, the belfry's arched openings, a small gable on each side and the slate spire with its cross. Five meshes:
// the walls, the roofs, the windows' glass, the trim (one vertex-coloured mesh) and the decals (one canvas atlas: the
// rose window, the doorway, the louvres, the round windows, the slits).

excludeBuildings(PAULUSKIRCHE.exclude);
// (the player's walls on the surveyed volumes and the porch, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(PAULUSKIRCHE.osm, groundOutlines());

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.56, 0.56, 0.54], SLATE = [0.075, 0.08, 0.088];
const WARM = [1.0, 0.7, 0.4];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(SLATE, 0.8);
  M.roof.side = THREE.DoubleSide; // (the eaves' undersides)
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, the windows glowing from dusk on, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.plain(PLASTER, 0.95);
    M.glass = SIMPLE_SKINS.glow([0.06, 0.07, 0.075], 0.25, 0.3, WARM, 0.35);
    return M;
  }
  // Light grey plaster: a little weathering over the walls, a fine grain close by
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const grain = worldNoise(7).sub(0.5).mul(fade(8, 28)).mul(0.1);
    m.colorNode = mix(vec3(0.49, 0.49, 0.475), vec3(0.6, 0.6, 0.585), worldNoise(0.22)).mul(float(1).add(grain));
    M.plaster = m;
  }
  // Leaded glass in a stone surround: uv metres from the window's middle (u) and up from its spring line (v), aHalf
  // half its width; the round head over v 0; rectangular panes in lead, fading out by 22 m; in the evening a warm
  // glow behind them, dimmer towards midnight
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.2, metalness: 0.3 });
    const U = uv().x, V = uv().y, half = attribute('aHalf', 'float');
    const head = step(0, V);
    const edge = mix(half.sub(abs(U)), half.sub(length(vec2(U, V))), head);
    const frame = smoothstep(0.1, 0.075, edge);
    const d1 = fract(U.div(0.21).add(0.5)), d2 = fract(V.div(0.32));
    const lead = smoothstep(0.08, 0.0, min(d1, float(1).sub(d1))).max(smoothstep(0.06, 0.0, min(d2, float(1).sub(d2)))).mul(fade(6, 22));
    const pane = mix(vec3(0.05, 0.062, 0.07), vec3(0.11, 0.1, 0.085), worldNoise(1.7));
    m.colorNode = mix(mix(pane, vec3(0.03, 0.03, 0.03), lead.mul(0.8)), vec3(0.5, 0.48, 0.44), frame);
    m.roughnessNode = mix(float(0.15), float(0.85), max(frame, lead.mul(0.5)));
    const open = float(1).sub(frame).mul(float(1).sub(lead.mul(0.7)));
    m.emissiveNode = vec3(...WARM).mul(open).mul(nightGlow()).mul(mix(float(0.45), float(0.12), lateNight()));
    M.glass = m;
  }
  return M;
}

// --- The rose window, the doorway, the openings: one canvas atlas ----------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  rose: [0, 0, 224, 512],
  door: [224, 0, 160, 256],
  louvre: [384, 0, 96, 256],
  oculus: [480, 0, 128, 128],
  slit: [608, 0, 40, 128]
};
const STONE = '#c9c3b6', SHADE = '#24211e', GLASS = '#26303a';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // a round-headed shape: x, w across, its foot at `foot`, its top at `top`
  const arch = (x, w, top, foot) => { g.beginPath(); g.moveTo(x, foot); g.lineTo(x, top + w / 2); g.arc(x + w / 2, top + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, foot); g.closePath(); };
  // a pointed one: two arcs of radius w meeting at the top
  const pointed = (x, w, top, foot) => {
    const spring = top + w * 0.866;
    g.beginPath(); g.moveTo(x, foot); g.lineTo(x, spring);
    g.arc(x + w, spring, w, Math.PI, Math.PI * 4 / 3); g.arc(x, spring, w, Math.PI * 5 / 3, 0);
    g.lineTo(x + w, foot); g.closePath();
  };
  // The rose window: a pointed recess in a stone moulding, the rose in it (a ring of eight foils round a small round
  // one, dark leaded glass), two small lancets under it
  cell('rose', (w, h) => {
    pointed(4, w - 8, 4, h); g.fillStyle = STONE; g.fill();
    pointed(14, w - 28, 16, h); g.fillStyle = '#9d9a92'; g.fill();
    const cx = w / 2, cy = 190, R = 88;
    g.fillStyle = STONE; g.beginPath(); g.arc(cx, cy, R + 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = GLASS; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = STONE; g.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath(); g.arc(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56, 26, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22); g.lineTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30); g.stroke();
    }
    g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    // the lancets under it, the sill
    for (const x of [cx - 58, cx + 14]) {
      arch(x - 4, 52, 316, 452); g.fillStyle = STONE; g.fill();
      arch(x, 44, 320, 448); g.fillStyle = GLASS; g.fill();
    }
    g.fillStyle = STONE; g.fillRect(18, 452, w - 36, 12);
  });
  // The porch's doorway: a stone arch, two dark timber leaves with panels, the fanlight
  cell('door', (w, h) => {
    arch(0, w, 0, h); g.fillStyle = STONE; g.fill();
    arch(14, w - 28, 14, h); g.fillStyle = '#4a3020'; g.fill();
    const spring = 14 + (w - 28) / 2;
    g.fillStyle = GLASS; g.beginPath(); g.moveTo(14, spring); g.arc(w / 2, spring, (w - 28) / 2, Math.PI, 0); g.closePath(); g.fill();
    g.strokeStyle = '#2e1d12'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(14, spring); g.lineTo(w - 14, spring); g.moveTo(w / 2, spring); g.lineTo(w / 2, h); g.stroke();
    g.lineWidth = 3;
    for (const x of [24, w / 2 + 10]) for (const y of [spring + 18, spring + 86]) g.strokeRect(x, y, w / 2 - 34, 56);
    g.fillStyle = '#b08a3a'; g.fillRect(w / 2 - 10, h * 0.62, 5, 14); g.fillRect(w / 2 + 5, h * 0.62, 5, 14);
  });
  // The belfry's opening: louvres in a round-headed opening
  cell('louvre', (w, h) => {
    arch(6, w - 12, 4, h); g.fillStyle = SHADE; g.fill();
    g.save(); g.clip();
    g.fillStyle = '#4b4540';
    for (let y = 60; y < h; y += 16) g.fillRect(0, y, w, 7);
    g.restore();
    arch(6, w - 12, 4, h); g.lineWidth = 6; g.strokeStyle = STONE; g.stroke();
  });
  // A small round window: a stone ring, dark glass, a cross in lead
  cell('oculus', (w, h) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = STONE; g.beginPath(); g.arc(cx, cy, 60, 0, Math.PI * 2); g.fill();
    g.fillStyle = GLASS; g.beginPath(); g.arc(cx, cy, 48, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d0cabd'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx - 48, cy); g.lineTo(cx + 48, cy); g.moveTo(cx, cy - 48); g.lineTo(cx, cy + 48); g.stroke();
  });
  cell('slit', (w, h) => { arch(4, w - 8, 2, h - 2); g.fillStyle = SHADE; g.fill(); });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = {
  plinth: [0.27, 0.265, 0.25], stone: [0.48, 0.46, 0.42], cornice: [0.52, 0.51, 0.48], coping: [0.4, 0.395, 0.38],
  frieze: [0.5, 0.4, 0.24], iron: [0.05, 0.05, 0.055]
};
const N = PAULUSKIRCHE.nave, P = PAULUSKIRCHE.porch, T = PAULUSKIRCHE.tower, A = PAULUSKIRCHE.apse, R = PAULUSKIRCHE.turret;
const BASE = PAULUSKIRCHE.base;

/** The highest ground before a wall from s0 to s1 (half a metre out) */
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 1.5));
  for (let i = 0; i <= n; i++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * i) / n, 0.5)));
  return hi;
}
function groundLow(F) {
  let lo = Infinity;
  for (let i = 0; i <= 6; i++) lo = Math.min(lo, groundHeight(...onWall(F, (F.len * i) / 6, 0.5)));
  return lo;
}

/** A triangle or a quad facing up (or out, for the steep ones) whichever way its points run */
function upTri(B, bucket, a, b, c, opt = {}) {
  const up = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]) < 0;
  const t = up ? [a, b, c] : [a, c, b];
  B.tri(bucket, t[0], t[1], t[2], t.map((q) => [q[0] + q[2] * 0.3, q[1]]), opt);
}
const upQuad = (B, bucket, a, b, c, d, opt) => { upTri(B, bucket, a, b, c, opt); upTri(B, bucket, a, c, d, opt); };
/** A world point [x, y, z] from the church's frame [s, t] and a height */
const W3 = (s, t, y) => { const [x, z] = toWorld([s, t]); return [x, y, z]; };

// A wall from the base up to its top: one quad per stretch between its ends and its peak (a gable's)
function buildWall(B, w) {
  const F = worldFrame(w.F), L = w.F.len;
  const P3 = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  let peak = 0;
  for (let i = 0; i <= 64; i++) if (w.top((L * i) / 64) > w.top(peak) + 1e-6) peak = (L * i) / 64;
  const cuts = [...new Set([0, peak, L])].sort((p, q) => p - q);
  for (let k = 0; k + 1 < cuts.length; k++) {
    const s0 = cuts[k], s1 = cuts[k + 1];
    if (s1 - s0 < 1e-4) continue;
    B.quad('plaster', P3(s0, BASE), P3(s1, BASE), P3(s1, w.top(s1)), P3(s0, w.top(s0)), [[s0, BASE], [s1, BASE], [s1, w.top(s1)], [s0, w.top(s0)]]);
  }
  // the plinth along it
  const top = Math.max(groundAlong(F) + 0.12, groundLow(F) + 0.5);
  if (top < w.top(0) - 0.5) B.box('trim', F, -0.04, L + 0.04, 0, 0.07, BASE, top, C.plinth);
  return { F, peak };
}

// The nave's gables: the stepped coping on the rakes from either end up to the peak, the ochre frieze under it
function buildCoping(B, w, F, peak) {
  const L = w.F.len;
  for (const [from, to] of [[0, peak], [L, peak]]) {
    for (let i = 0; i < N.steps; i++) {
      const a = from + ((to - from) * i) / N.steps, b = from + ((to - from) * (i + 1)) / N.steps;
      const lo = w.top(a), hi = w.top(b) + 0.12, s0 = Math.min(a, b), s1 = Math.max(a, b);
      B.box('trim', F, s0 - 0.02, s1 + 0.02, -0.45, 0.1, lo - 0.25, hi, C.coping);
      B.box('trim', F, s0 + 0.05, s1 - 0.05, 0, 0.06, lo - 0.6, lo - 0.25, C.frieze);
    }
  }
}

// The nave: its walls, the stepped gables, the string course, the saddle roof (flush with the gables, the eaves out of
// the side walls)
function buildNave(B, list) {
  for (const w of list.filter((x) => x.part === 'nave')) {
    const { F, peak } = buildWall(B, w);
    if (w.gable) buildCoping(B, w, F, peak);
    // the string course (on the entrance gable over the porch's ridge)
    B.box('trim', F, -0.06, w.F.len + 0.06, 0, 0.1, PAULUSKIRCHE.string - 0.1, PAULUSKIRCHE.string + 0.12, C.cornice);
  }
  const eave = (t) => roofAt(0, t);
  for (const side of [N.east - N.eaves, N.west + N.eaves]) {
    upQuad(B, 'roof', W3(N.s0, side, eave(side)), W3(N.s1, side, eave(side)), W3(N.s1, N.ridge, N.ridgeY), W3(N.s0, N.ridge, N.ridgeY));
  }
  // the ridge's capping
  const F = { a: toWorld([N.s0, N.ridge]), u: PAULUSKIRCHE.along, n: [-PAULUSKIRCHE.along[1], PAULUSKIRCHE.along[0]] };
  B.box('trim', F, 0, N.s1 - N.s0, -0.12, 0.12, N.ridgeY - 0.05, N.ridgeY + 0.12, C.coping);
}

// The porch: its walls, the gable over the doorway, the saddle roof running into the entrance gable
function buildPorch(B, list) {
  for (const w of list.filter((x) => x.part === 'porch')) {
    const { F } = buildWall(B, w);
    B.box('trim', F, -0.05, w.F.len + 0.05, 0, 0.08, P.eaves - 0.18, P.eaves, C.cornice);
  }
  const mid = (P.east + P.west) / 2, o = P.overhang;
  for (const side of [P.east - o, P.west + o]) {
    const y = porchRoofAt(0, side);
    upQuad(B, 'roof', W3(P.s0 - o, side, y), W3(P.s1, side, y), W3(P.s1, mid, P.ridgeY + 0.05), W3(P.s0 - o, mid, P.ridgeY + 0.05));
  }
}

// A cone over a ring (church frame) from its eaves (`out` m beyond it) to an apex
function cone(B, ring, centre, out, y0, apex) {
  const [cs, ct] = centre, top = W3(cs, ct, apex);
  const pt = ([s, t]) => { const ds = s - cs, dt = t - ct, r = Math.hypot(ds, dt), k = (r + out) / r; return W3(cs + ds * k, ct + dt * k, y0 - out * (apex - y0) / r); };
  ring.forEach((a, i) => upTri(B, 'roof', pt(a), pt(ring[(i + 1) % ring.length]), top));
}

// The apse: its lower wall, the ledge's pent roof, the drum and its cone; the stair turret and its cone
function buildApse(B, list) {
  for (const w of list.filter((x) => ['apse', 'drum', 'turret'].includes(x.part))) {
    const { F } = buildWall(B, w);
    if (w.part !== 'turret') B.box('trim', F, -0.02, w.F.len + 0.02, 0, 0.1, w.top(0) - 0.2, w.top(0), C.cornice);
  }
  const S = A.skirt, n = A.sides;
  const at = (i, r, y) => { const a = ((i + 0.5) / n) * Math.PI * 2; return W3(A.centre[0] + Math.cos(a) * r, A.centre[1] + Math.sin(a) * r, y); };
  for (let i = 0; i < n; i++) upQuad(B, 'roof', at(i, S.r0, S.y0), at(i + 1, S.r0, S.y0), at(i + 1, S.r1, S.y1), at(i, S.r1, S.y1));
  cone(B, drumRing(), A.centre, 0.3, A.eaves, A.apex);
  cone(B, turretRing(), R.centre, 0.2, R.eaves, R.apex);
}

// A window: the glass (the round head as strips), a stone sill under it
function buildWindow(B, w) {
  const W = wallAt(w.at), F = worldFrame(W.wall.F), hw = w.half, spring = w.h - hw;
  // uv: metres from the window's middle, metres up from its spring line
  const P3 = (u, v) => { const [x, z] = onWall(F, W.s + u, 0.03); return [x, w.sill + spring + v, z]; };
  B.quad('glass', P3(-hw, -spring), P3(hw, -spring), P3(hw, 0), P3(-hw, 0), [[-hw, -spring], [hw, -spring], [hw, 0], [-hw, 0]], { half: hw });
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (1 - i / n), a1 = Math.PI * (1 - (i + 1) / n);
    const u0 = Math.cos(a0) * hw, u1 = Math.cos(a1) * hw, v0 = Math.sin(a0) * hw, v1 = Math.sin(a1) * hw;
    B.quad('glass', P3(u0, 0), P3(u1, 0), P3(u1, v1), P3(u0, v0), [[u0, 0], [u1, 0], [u1, v1], [u0, v0]], { half: hw });
  }
  B.box('trim', F, W.s - hw - 0.1, W.s + hw + 0.1, 0, 0.12, w.sill - 0.14, w.sill + 0.02, C.stone);
}

// A painted opening or door: over the highest ground before it
function buildOpening(B, o) {
  const W = wallAt(o.at), F = worldFrame(W.wall.F), s0 = W.s - o.w / 2, s1 = W.s + o.w / 2;
  const y0 = o.y ?? groundAlong(F, s0, s1) + o.ground;
  B.decal(F, s0, s1, 0.04, y0, y0 + o.h, o.key);
}

// A buttress against a side wall: the shaft, the set-back over it, a stone cap on each
function buildButtress(B, b) {
  const W = wallAt(b.at), F = worldFrame(W.wall.F), s0 = W.s - b.half, s1 = W.s + b.half;
  B.box('plaster', F, s0, s1, 0, b.out, BASE, b.top - 1.2);
  B.box('trim', F, s0 - 0.03, s1 + 0.03, 0, b.out + 0.05, b.top - 1.3, b.top - 1.15, C.stone);
  B.box('plaster', F, s0, s1, 0, b.out * 0.55, b.top - 1.15, b.top);
  B.box('trim', F, s0 - 0.03, s1 + 0.03, 0, b.out * 0.55 + 0.05, b.top, b.top + 0.12, C.stone);
}

// The tower: the shaft with its band and cornice, a gable on each side under a small saddle roof running into the
// spire, the flat cap between them, the octagonal spire and the cross; the openings on its sides
function buildTower(B, list) {
  const [cs, ct] = [(T.s0 + T.s1) / 2, (T.t0 + T.t1) / 2];
  for (const w of list.filter((x) => x.part === 'tower')) {
    const { F } = buildWall(B, w), L = w.F.len, mid = L / 2;
    const P3 = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
    B.box('trim', F, -0.1, L + 0.1, 0, 0.1, T.band - 0.15, T.band + 0.1, C.cornice);
    B.box('trim', F, -0.18, L + 0.18, 0, 0.18, T.top - 0.2, T.top, C.cornice);
    // the gable and its roof, back to the spire (the side's depth: the tower's other dimension)
    B.tri('plaster', P3(0, 0, T.top), P3(L, 0, T.top), P3(mid, 0, T.gable), [[0, T.top], [L, T.top], [mid, T.gable]]);
    const back = -(Math.abs(w.F.u[0]) > 0.5 ? T.t1 - T.t0 : T.s1 - T.s0) / 2 + 0.4;
    for (const [e, r] of [[-0.08, mid], [L + 0.08, mid]]) {
      const ye = T.top - 0.08;
      upQuad(B, 'roof', P3(e, 0.12, ye), P3(r, 0.12, T.gable + 0.06), P3(r, back, T.gable + 0.06), P3(e, back, ye));
    }
    B.decal(F, mid - T.louvre.half, mid + T.louvre.half, 0.04, T.louvre.y0, T.louvre.y1, 'louvre');
    B.decal(F, mid - T.oculus.half, mid + T.oculus.half, 0.04, T.oculus.y - T.oculus.half, T.oculus.y + T.oculus.half, 'oculus');
    // the slits on the sides towards the street (north-east and west-north-west)
    if (w.F.n[0] < -0.5 || w.F.n[1] > 0.5) B.decal(F, mid - T.slit.half, mid + T.slit.half, 0.04, T.slit.y0, T.slit.y1, 'slit');
  }
  flatRoof(B, towerRing().map(toWorld), T.top - 0.02, { bucket: 'roof' });
  // the spire: eight faces, one over each side's middle
  const S = T.spire, tip = W3(cs, ct, S.y1);
  for (let i = 0; i < 8; i++) {
    const p = (k) => { const a = ((k + 0.5) / 8) * Math.PI * 2; return W3(cs + Math.cos(a) * S.r, ct + Math.sin(a) * S.r, S.y0); };
    upTri(B, 'roof', p(i), p(i + 1), tip);
  }
  // the cross, its arms across the nave
  const F = { a: toWorld([cs, ct]), u: PAULUSKIRCHE.along, n: [-PAULUSKIRCHE.along[1], PAULUSKIRCHE.along[0]] }, X = T.cross;
  B.box('trim', F, -0.045, 0.045, -0.045, 0.045, X.y0 - 0.3, X.y1, C.iron);
  B.box('trim', F, -0.045, 0.045, -X.half, X.half, X.arm - 0.045, X.arm + 0.045, C.iron);
}

/**
 * Builds the church into `scene`. Returns { group, colliders } (no colliders of its own: the player's walls stand on
 * the surveyed outlines, js/buildings.js; nothing stands free of them).
 */
export function buildPauluskirche(scene) {
  const root = new THREE.Group();
  root.name = 'Pauluskirche';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'glass', name: 'Pauluskirche' }), M = materials();
  const list = walls();
  buildNave(B, list);
  buildPorch(B, list);
  buildApse(B, list);
  buildTower(B, list);
  for (const w of [...windowList(), ...apseWindows()]) buildWindow(B, w);
  for (const o of PAULUSKIRCHE.openings) buildOpening(B, o);
  for (const b of PAULUSKIRCHE.buttresses) buildButtress(B, b);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}

