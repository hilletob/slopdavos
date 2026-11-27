import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { SAMD, onWall, outwardRing, wallFrame, wallStretches } from './samd-data.js';

export { SAMD };

// The SAMD's main building rebuilt by hand (js/samd-data.js), standing in for its swissBUILDINGS3D volume, which the
// streamed tiles drew as one white block with the town houses' windows: the surveyed volumes in white plaster, a window
// in a dark green frame in every bay of every floor (drawn by the wall's material from its uv: metres along the wall
// from its middle, metres up the floors' grid), the stair tower with its glazed strip, the school's name on its head
// and the flag over it, the name on the north wing's closed wall, the glazed porch in the corner on the yard, the
// dining hall's glass and the balconies towards the valley. Five meshes: the walls, the roofs, the glass, the trim
// (one vertex-coloured mesh) and the lettering (one canvas atlas). The long break on its roof is js/missions-samd.js.

excludeBuildings([SAMD.exclude]);
// (the player's walls on the surveyed volumes and the porch, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(SAMD.osm, [...SAMD.parts.map((p) => p.ring), SAMD.porch.ring]);

const BAY = 2.9; // a window's bay along a wall
const STOREY = SAMD.storey;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
// A window in its storey (m up from the floor's foot) and its half width
const WIN = { lo: 0.95, hi: 2.5, half: 0.64 };

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.6, 0.6, 0.575], GREEN = [0.03, 0.085, 0.075];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.3, 0.3, 0.29], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.5, 0.5, 0.48], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4);
    M.glass = SIMPLE_SKINS.glow([0.12, 0.17, 0.17], 0.1, 0.8, [1.0, 0.84, 0.62], 0.4);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  // White plaster with a window per bay and floor: a dark green frame, a post in its middle and a rail across its upper
  // third, a light sill under it; a blind drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const bars = smoothstep(0.045, 0.03, abs(bu)).max(smoothstep(0.04, 0.025, abs(fv.sub(WIN.hi - 0.52))));
    const pane = rect(WIN.half - 0.09, WIN.lo + 0.09, WIN.hi - 0.09).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.08, WIN.lo - 0.09, WIN.lo).mul(open).mul(near);
    // the plaster: a little weathering, a shade darker under the sills and at the foot of a floor
    const stain = rect(WIN.half, WIN.lo - 0.75, WIN.lo - 0.09, 0.2).mul(open).mul(0.05);
    const wall = mix(vec3(0.55, 0.55, 0.525), vec3(...PLASTER).mul(1.05), worldNoise(0.3)).mul(float(1).sub(stain)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.06)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.6, id).mul(mix(float(0.4), float(1), step(0.88, id)));
    const span = WIN.hi - WIN.lo - 0.18;
    const blind = step(float(WIN.hi - 0.09).sub(drawn.mul(span)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.028, 0.034), vec3(0.075, 0.095, 0.11), worldNoise(0.07));
    let c = mix(wall, vec3(0.5, 0.5, 0.48), sill);
    c = mix(c, vec3(...GREEN), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.4, 0.42, 0.4), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (a boarding school: the rooms lit in the evening, most of them dark towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 11, { share: 0.5, late: 0.12, tone: twoTones([1.0, 0.74, 0.44], [0.86, 0.9, 1.0], 0.8) }).mul(pane).mul(mix(float(1), float(0.4), blind)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The dining hall's and the porch's glazing: dark green posts every 1.2 m, a rail every 1.5 m, lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.2)).sub(0.5)), mv = abs(fract(V.div(1.5)).sub(0.5));
    const frame = smoothstep(0.45, 0.47, mu).max(smoothstep(0.455, 0.475, mv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.2)).mul(13.1).add(floor(V.div(1.5)).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.07, 0.1, 0.11), vec3(0.15, 0.2, 0.2), paneId), vec3(...GREEN), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.2), frame);
    m.emissiveNode = vec3(1.0, 0.84, 0.62).mul(float(1).sub(frame)).mul(paneId.mul(0.3).add(0.7)).mul(glow.mul(0.4));
    M.glass = m;
  }
  return M;
}

// --- The lettering and the flag: one canvas atlas ------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  tower: [0, 0, 704, 256],
  wing: [0, 258, 588, 252],
  flag: [720, 0, 128, 128]
};
const INK = '#1f2b2a';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
  // The school's name in three lines, as on the tower's head and on the wing (the wing's with the school's kinds under it)
  const lines = (w, y0, step, px) => {
    g.font = `bold ${px}px Helvetica, Arial, sans-serif`;
    ['SCHWEIZERISCHE', 'ALPINE', 'MITTELSCHULE'].forEach((t, i) => g.fillText(t, w / 2, y0 + i * step, w - 16));
  };
  cell('tower', (w) => lines(w, 48, 80, 72));
  cell('wing', (w) => {
    lines(w, 40, 66, 58);
    g.font = 'bold 19px Helvetica, Arial, sans-serif';
    g.fillText('GYMNASIUM · HANDELSMITTELSCHULE · INTERNAT', w / 2, 228, w - 40);
  });
  cell('flag', (w, h) => {
    g.fillStyle = '#d5171c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(w * 0.4, h * 0.19, w * 0.2, h * 0.62); g.fillRect(w * 0.19, h * 0.4, w * 0.62, h * 0.2);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  plaster: PLASTER, green: GREEN, strip: [0.05, 0.075, 0.085], bar: [0.3, 0.32, 0.31], canopy: [0.07, 0.075, 0.08], slab: [0.5, 0.5, 0.48],
  rail: [0.16, 0.19, 0.19], pole: [0.55, 0.56, 0.57], pane: [0.03, 0.04, 0.05], step: [0.33, 0.33, 0.32]
};

// A volume: its walls from the base up to its roof (cut into stretches with and without windows), the roof over them
function buildPart(B, part) {
  const ring = outwardRing(part.ring), top = part.top, y0 = SAMD.base;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    // (the dining hall's walls towards the valley: glass from its floor up, plaster under it)
    if (part.glazed && F.n[1] > 0.3 && F.len > 1.2) {
      const foot = part.top - 3.9;
      B.quad('glass', P(0, foot), P(F.len, foot), P(F.len, top - 0.35), P(0, top - 0.35), [[0, 0], [F.len, 0], [F.len, top - 0.35 - foot], [0, top - 0.35 - foot]]);
      B.quad('plaster', P(0, y0), P(F.len, y0), P(F.len, foot), P(0, foot), [[0, y0 - CLOSED], [F.len, y0 - CLOSED], [F.len, foot - CLOSED], [0, foot - CLOSED]]);
      B.quad('plaster', P(0, top - 0.35), P(F.len, top - 0.35), P(F.len, top), P(0, top), [[0, y0 - CLOSED], [F.len, y0 - CLOSED], [F.len, y0 + 0.35 - CLOSED], [0, y0 + 0.35 - CLOSED]]);
      continue;
    }
    for (const st of wallStretches(a, b, part.windows !== false)) {
      const len = st.to - st.from, mid = (st.from + st.to) / 2;
      const windows = st.windows && len >= 2.4;
      const v = (y) => y - part.line + UP - (windows ? 0 : CLOSED);
      B.quad('plaster', P(st.from, y0), P(st.to, y0), P(st.to, top), P(st.from, top),
        [[st.from - mid, v(y0)], [st.to - mid, v(y0)], [st.to - mid, v(top)], [st.from - mid, v(top)]], { half: windows ? len / 2 : 0 });
    }
  }
  flatRoof(B, ring, top);
}

// The stair tower: the glazed strip up its north face, the name on its head, the flag
function buildTower(B) {
  const T = SAMD.tower;
  const N = wallFrame(T.north.a, T.north.b), S = T.north.strip, mid = N.len / 2;
  B.box('trim', N, mid - S.half - 0.07, mid + S.half + 0.07, 0, 0.05, S.y0 - 0.07, S.y1 + 0.07, C.green);
  B.box('trim', N, mid - S.half, mid + S.half, 0.05, 0.08, S.y0, S.y1, C.strip);
  for (let y = S.y0 + 1.65; y < S.y1 - 0.5; y += 1.65) B.box('trim', N, mid - S.half, mid + S.half, 0.08, 0.11, y - 0.035, y + 0.035, C.bar);
  B.box('trim', N, mid - 0.03, mid + 0.03, 0.08, 0.11, S.y0, S.y1, C.bar);
  const W = wallFrame(T.west.a, T.west.b), n = T.west.name;
  B.decal(W, n.at, n.at + n.w, 0.04, n.y0, n.y1, 'tower');
  const top = SAMD.parts.find((p) => p.id === 'attic').top;
  const F = T.flag, y1 = top + F.pole;
  B.box('trim', W, F.s - 0.05, F.s + 0.05, -1.05, -0.95, top - 0.2, y1, C.pole);
  // the flag out from the pole towards the valley's wind (along the west face), both its sides
  const [px, pz] = onWall(W, F.s + 0.06, -1.0);
  const front = { a: [px, pz], u: W.u, n: W.n }, back = { a: [px + W.u[0] * F.w, pz + W.u[1] * F.w], u: [-W.u[0], -W.u[1]], n: [-W.n[0], -W.n[1]] };
  B.decal(front, 0, F.w, 0.01, y1 - F.w - 0.1, y1 - 0.1, 'flag');
  B.decal(back, 0, F.w, 0.01, y1 - F.w - 0.1, y1 - 0.1, 'flag');
}

// The north wing's closed wall on the yard: the name, two windows under the roof
function buildNameWall(B) {
  const W = SAMD.nameWall, F = wallFrame(W.a, W.b), n = W.name;
  B.decal(F, (F.len - n.w) / 2, (F.len + n.w) / 2, 0.04, n.y0, n.y1, 'wing');
  const line = SAMD.parts.find((p) => p.id === 'north-wing').line;
  for (const floorTop of [line, line - 2 * STOREY]) {
    for (const [s, half] of W.windows) {
      const y0 = floorTop - STOREY + W.window[0] + 0.4, y1 = floorTop - STOREY + W.window[1] + 0.15;
      B.box('trim', F, s - half, s + half, 0, 0.04, y0, y1, C.green);
      B.box('trim', F, s - half + 0.09, s - 0.03, 0.04, 0.06, y0 + 0.09, y1 - 0.09, C.pane);
      B.box('trim', F, s + 0.03, s + half - 0.09, 0.04, 0.06, y0 + 0.09, y1 - 0.09, C.pane);
    }
  }
}

// The porch in the corner: a glazed vestibule, its canopy, the door's frame, a step
function buildPorch(B) {
  const P = SAMD.porch, ring = outwardRing(P.ring);
  let low = Infinity, y0 = -Infinity;
  for (const [x, z] of ring) { const y = groundHeight(x, z); low = Math.min(low, y); y0 = Math.max(y0, y); }
  const top = y0 + P.height;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    const Q = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    B.quad('glass', Q(0, y0 + 0.25), Q(F.len, y0 + 0.25), Q(F.len, top), Q(0, top), [[0, 0], [F.len, 0], [F.len, top - y0 - 0.25], [0, top - y0 - 0.25]]);
    B.box('trim', F, -0.05, F.len + 0.05, -0.2, 0.06, low - 1, y0 + 0.25, C.step);
    // the canopy's edge over this side
    B.box('trim', F, -P.canopy, F.len + P.canopy, -0.3, P.canopy, top, top + 0.22, C.canopy, { top: 'roof' });
    for (const s of [0.08, F.len - 0.08]) B.box('trim', F, s - 0.08, s + 0.08, -0.08, 0.08, y0, top, C.green);
  }
  flatRoof(B, ring, top + 0.2);
  // the doors in the front
  const F = wallFrame(P.front.a, P.front.b), m = F.len / 2;
  for (const s of [m - 1.0, m, m + 1.0]) B.box('trim', F, s - 0.05, s + 0.05, 0, 0.09, y0 + 0.25, y0 + 2.4, C.green);
  B.box('trim', F, m - 1.05, m + 1.05, 0, 0.09, y0 + 2.4, y0 + 2.52, C.green);
  B.box('trim', F, m - 1.6, m + 1.6, 0, 1.2, low - 1, y0 + 0.12, C.step);
  return { y0, top };
}

// The balconies towards the valley: a slab and a rail at each of the two floors under the attic
function buildBalconies(B) {
  const Bc = SAMD.balconies, F = wallFrame(Bc.a, Bc.b);
  for (const y of Bc.floors) {
    B.box('trim', F, Bc.from, Bc.to, 0, Bc.out, y - 0.16, y, C.slab);
    B.box('trim', F, Bc.from, Bc.to, Bc.out - 0.05, Bc.out, y + Bc.rail - 0.06, y + Bc.rail, C.rail);
    B.box('trim', F, Bc.from, Bc.to, Bc.out - 0.04, Bc.out - 0.01, y + 0.12, y + Bc.rail - 0.16, C.rail);
    for (let s = Bc.from; s <= Bc.to + 0.01; s += (Bc.to - Bc.from) / 6) B.box('trim', F, s - 0.04, s + 0.04, Bc.out - 0.06, Bc.out, y, y + Bc.rail, C.rail);
    for (const s of [Bc.from, Bc.to]) B.box('trim', F, s - 0.03, s + 0.03, 0, Bc.out, y + Bc.rail - 0.06, y + Bc.rail, C.rail);
  }
}

/**
 * Builds the SAMD's main building into `scene`. Returns { group, colliders } (no colliders of its own: the walls of
 * OpenStreetMap's footprint are js/buildings.js', and the porch stands inside it).
 */
export function buildSamd(scene) {
  const root = new THREE.Group();
  root.name = 'SAMD';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'SAMD' }), M = materials();
  for (const part of SAMD.parts) buildPart(B, part);
  buildTower(B);
  buildNameWall(B);
  buildPorch(B);
  buildBalconies(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
