import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { GKB_PLATZ, LINE, STOREY, floorFoot, groundOutlines, offsetRing, onWall, outwardRing, wallFrame, wallOf } from './gkb-platz-data.js';

export { GKB_PLATZ };

// The Graubündner Kantonalbank on the Promenade rebuilt by hand (js/gkb-platz-data.js), standing in for its
// swissBUILDINGS3D volume, which the streamed tiles drew as a white block with the town houses' windows: the surveyed
// block in white plaster with ribbon windows in dark frames, grey blinds drawn in many (drawn by the wall's material from
// its uv: metres along the wall from its middle, metres up the floors' grid); the glazed ground floor on the Promenade
// with its posts and the entrance, the shutters on the lane, the white fascia over them with the bank's name, the name
// again under the roof of the closed north wall over the Arkaden with the vents' slots, the balconies with solid
// parapets over the lane, the flat roof's deep dark overhang. Five meshes: the walls, the roof, the glass, the trim (one
// vertex-coloured mesh) and the lettering (one canvas atlas). The bank's generic sign (js/shops.js) gives way to it.

excludeBuildings([GKB_PLATZ.exclude]);
SHOP_EXCLUSIONS.add(GKB_PLATZ.shop);
// (the player's walls on the surveyed outline, not on OSM's, which stood up to 1.1 m off it; OSM's north half, the
// Arkaden's, keeps its walls: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(GKB_PLATZ.osm, groundOutlines());

const WIN = GKB_PLATZ.win, BAY = GKB_PLATZ.bay, G = GKB_PLATZ.ground;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the top floor's top at 40 of
// them); closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.58, 0.575, 0.55], FRAME = [0.055, 0.055, 0.058], BLIND = [0.36, 0.37, 0.37];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.24, 0.24, 0.235], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.5, 0.5, 0.48], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.3);
    M.glass = SIMPLE_SKINS.glow([0.07, 0.085, 0.095], 0.1, 0.8, [1.0, 0.86, 0.66], 0.25);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(8, 28);
  const glow = nightGlow();
  // White plaster with a ribbon of windows on every floor: a window per bay in a dark frame, its post between two, a
  // light sill under the ribbon; grey blinds drawn in many, their slats near by
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(BAY / 2 + 0.01, WIN.lo, WIN.hi).mul(open);
    const pane = rect(WIN.half - 0.04, WIN.lo + 0.07, WIN.hi - 0.07).mul(open);
    const sill = rect(BAY / 2 + 0.01, WIN.lo - 0.1, WIN.lo).mul(open).mul(near);
    const stain = rect(BAY / 2, WIN.lo - 0.7, WIN.lo - 0.1, 0.2).mul(open).mul(0.04);
    const wall = mix(vec3(0.54, 0.535, 0.51), vec3(...PLASTER).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain));
    // (the blinds of an office: drawn far in some windows, half in others, up in the rest)
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.45, id).mul(mix(float(0.45), float(0.95), step(0.8, id)));
    const span = WIN.hi - WIN.lo - 0.14;
    const blind = step(float(WIN.hi - 0.07).sub(drawn.mul(span)), fv).mul(pane);
    const slat = smoothstep(0.3, 0.45, abs(fract(fv.div(0.08)).sub(0.5))).mul(fine).mul(0.25);
    const glassC = mix(vec3(0.025, 0.032, 0.04), vec3(0.08, 0.1, 0.115), worldNoise(0.07));
    let c = mix(wall, vec3(0.5, 0.5, 0.48), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(...BLIND).mul(float(1).sub(slat)), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    // (offices: a few lit in the evening, fewer late)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 23, { share: 0.16, late: 0.04, tone: twoTones([1.0, 0.9, 0.74], [0.85, 0.92, 1.0], 0.5) })
      .mul(pane).mul(mix(float(1), float(0.45), blind)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The ground floor's glazing: dark glass with posts every 1.45 m and a transom, a faint light behind it at night
  // (the bank shut), a few panes brighter
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.45)).sub(0.5)), tv = abs(V.sub(2.45));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.05, 0.035, tv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.45)).mul(13.1));
    m.colorNode = mix(mix(vec3(0.05, 0.065, 0.075), vec3(0.12, 0.15, 0.16), paneId), vec3(...FRAME), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.2), frame);
    const lit = mix(float(0.18), float(0.9), step(0.82, paneId));
    m.emissiveNode = vec3(1.0, 0.88, 0.7).mul(float(1).sub(frame)).mul(lit).mul(glow.mul(0.45));
    M.glass = m;
  }
  return M;
}

// --- The lettering: one canvas atlas -------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 128];
export const ATLAS = { name: [0, 0, 1024, 128] };
const INK = '#26313c';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
  // the bank's name in plain upright letters, as over its fronts
  cell('name', (w, h) => {
    g.font = 'bold 80px Helvetica, Arial, sans-serif';
    g.fillText('Graubündner Kantonalbank', w / 2, h / 2 + 4, w - 24);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  frame: FRAME, post: [0.1, 0.105, 0.11], plinth: [0.2, 0.2, 0.195], fascia: [0.56, 0.555, 0.53], slab: [0.07, 0.072, 0.075],
  soffit: [0.4, 0.4, 0.39], shutter: [0.3, 0.31, 0.31], groove: [0.16, 0.165, 0.17], parapet: [0.55, 0.545, 0.52], rail: [0.12, 0.13, 0.13],
  step: [0.3, 0.3, 0.29], slot: [0.1, 0.1, 0.1]
};
const P3 = (F, s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };

/** The highest ground along a wall, half a metre before it */
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += F.len / Math.ceil(F.len / 1.5)) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

/** A stretch of plaster from y0 to y1, its windows drawn or closed */
function plaster(B, F, y0, y1, windows) {
  if (y1 - y0 < 0.01) return;
  const mid = F.len / 2, v = (y) => y - LINE + UP - (windows ? 0 : CLOSED);
  B.quad('plaster', P3(F, 0, y0), P3(F, F.len, y0), P3(F, F.len, y1), P3(F, 0, y1),
    [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half: windows ? mid : 0 });
}

/** The glazing from y0 to y1 (uv in metres along the wall and up from its foot) */
function glass(B, F, s0, s1, y0, y1) {
  B.quad('glass', P3(F, s0, y0), P3(F, s1, y0), P3(F, s1, y1), P3(F, s0, y1), [[s0, 0], [s1, 0], [s1, y1 - y0], [s0, y1 - y0]]);
}

// A wall: its ground floor after its kind, the floors' ribbons over it, up to the roof's slab
function buildWall(B, name) {
  const W = GKB_PLATZ.walls[name], F = wallOf(name), base = GKB_PLATZ.base, top = GKB_PLATZ.eaves.y;
  const hi = groundAlong(F) + 0.25;
  if (W.kind === 'closed') { plaster(B, F, base, top, false); return; }
  if (W.kind === 'back') {
    // the grid of windows from the lowest floor whose windows clear the ground along the wall, a plinth under it
    let k = 1;
    while (floorFoot(k - 1) + WIN.lo > hi + 0.3) k--;
    plaster(B, F, base, floorFoot(k), false);
    plaster(B, F, floorFoot(k), top, true);
    return;
  }
  // the Promenade's glazing or the lane's shutters over a plinth, the fascia over them, the floors over it
  const foot = Math.max(G.floor + 0.25, hi);
  plaster(B, F, base, foot, false);
  if (W.kind === 'shop') glass(B, F, 0, F.len, foot, G.glass);
  else plaster(B, F, foot, G.glass, false);
  plaster(B, F, G.glass, G.fascia, false);
  plaster(B, F, G.fascia, top, true);
  B.box('trim', F, -0.05, F.len + 0.05, 0, 0.14, base, foot, C.plinth);
  // the fascia's edges, a shade out of the wall
  B.box('trim', F, 0, F.len, 0, 0.1, G.glass, G.glass + 0.12, C.fascia);
  B.box('trim', F, 0, F.len, 0, 0.06, G.fascia - 0.08, G.fascia, C.fascia);
  if (W.kind === 'shop') {
    const D = GKB_PLATZ.door, d0 = D.s - D.w / 2, d1 = D.s + D.w / 2;
    for (const s of [0.1, F.len - 0.1]) B.box('trim', F, s - 0.1, s + 0.1, 0, 0.18, foot, G.glass, C.post);
    // the posts between the panes of the shop front, a heavier pier every three
    for (let s = 0.35, i = 0; s <= F.len - 0.3; s += (F.len - 0.7) / 15, i++) {
      if (s > d0 - 0.1 && s < d1 + 0.1) continue;
      const w = i % 3 === 0 ? 0.2 : 0.06;
      B.box('trim', F, s - w, s + w, 0, i % 3 === 0 ? 0.18 : 0.08, foot, G.glass, C.post);
    }
    // the entrance: a deeper frame, the doors' posts and their transom, the step before it
    B.box('trim', F, d0 - 0.2, d0, 0, 0.3, foot, G.glass, C.frame);
    B.box('trim', F, d1, d1 + 0.2, 0, 0.3, foot, G.glass, C.frame);
    B.box('trim', F, d0 - 0.2, d1 + 0.2, 0, 0.3, G.glass - 0.25, G.glass, C.frame);
    B.box('trim', F, D.s - 0.04, D.s + 0.04, 0.02, 0.1, foot, G.glass - 0.25, C.frame);
    B.box('trim', F, d0 - 0.3, d1 + 0.3, 0, 0.9, foot - 0.6, foot, C.step);
  } else {
    // the lane's shutters: grey panels with their grooves, a frame round them
    B.box('trim', F, 0.3, F.len - 0.3, 0, 0.05, foot, G.glass, C.shutter);
    for (let s = 0.3; s <= F.len - 0.29; s += (F.len - 0.6) / 4) B.box('trim', F, s - 0.08, s + 0.08, 0, 0.12, foot, G.glass, C.post);
    for (let y = foot + 0.5; y < G.glass - 0.2; y += 0.5) B.box('trim', F, 0.38, F.len - 0.38, 0.05, 0.065, y - 0.02, y + 0.02, C.groove);
  }
}

/** A quad of the trim turned to face `want` ([x, y, z]) */
function facing(B, [a, b, c, d], want, colour) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const q = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0 ? [a, b, c, d] : [a, d, c, b];
  B.quad('trim', ...q, undefined, { colour });
}

// The roof's slab: its dark edge round the overhang, the light soffit under it, the roof over it all
function buildRoof(B) {
  const R = outwardRing(GKB_PLATZ.ring), O = offsetRing(GKB_PLATZ.ring, GKB_PLATZ.eaves.out);
  const y0 = GKB_PLATZ.eaves.y, y1 = GKB_PLATZ.top;
  for (let i = 0; i < R.length; i++) {
    const j = (i + 1) % R.length, a = O[i], b = O[j], n = wallFrame(a, b).n;
    // the edge, facing out; the soffit, facing down, from the wall out to the edge
    facing(B, [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], [n[0], 0, n[1]], C.slab);
    facing(B, [[R[i][0], y0, R[i][1]], [R[j][0], y0, R[j][1]], [b[0], y0, b[1]], [a[0], y0, a[1]]], [0, -1, 0], C.soffit);
  }
  flatRoof(B, O, y1);
}

// The balconies over the lane: a slab, a solid parapet and its rail at each floor
function buildBalconies(B) {
  const Bc = GKB_PLATZ.balconies, F = wallOf('south');
  for (const k of Bc.floors) {
    const y = floorFoot(k);
    B.box('trim', F, Bc.from, Bc.to, 0, Bc.out, y - 0.22, y, C.parapet);
    B.box('trim', F, Bc.from, Bc.to, Bc.out - 0.14, Bc.out, y, y + Bc.parapet - 0.08, C.parapet);
    for (const s of [Bc.from, Bc.to - 0.14]) B.box('trim', F, s, s + 0.14, 0, Bc.out - 0.14, y, y + Bc.parapet - 0.08, C.parapet);
    B.box('trim', F, Bc.from - 0.02, Bc.to + 0.02, -0.02, Bc.out + 0.02, y + Bc.parapet - 0.08, y + Bc.parapet, C.rail);
  }
}

// The lettering on the fascia and under the north wall's roof, the north wall's vents
function buildNames(B) {
  for (const [name, n] of Object.entries(GKB_PLATZ.names)) B.decal(wallOf(name), n.from, n.to, name === 'north' ? 0.03 : 0.04, n.y0, n.y1, 'name');
  const F = wallOf('north'), V = GKB_PLATZ.vents;
  for (const s of V.at) for (let i = 0; i < 3; i++) B.box('trim', F, s + i * 0.36, s + i * 0.36 + 0.14, 0, 0.04, V.y - 1.4, V.y, C.slot);
}

/**
 * Builds the Graubündner Kantonalbank into `scene`. Returns { group, colliders } (no colliders of its own: the
 * player's walls stand on the surveyed outline, js/landmarks.js, and nothing stands free of it).
 */
export function buildGkbPlatz(scene) {
  const root = new THREE.Group();
  root.name = 'Graubündner Kantonalbank';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'GKB Platz' }), M = materials();
  for (const name of Object.keys(GKB_PLATZ.walls)) buildWall(B, name);
  buildRoof(B);
  buildBalconies(B);
  buildNames(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
