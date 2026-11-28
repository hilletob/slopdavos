import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { GREDIGHAUS, bayAt, firstFloor, groundOutlines, onWall, outwardRing, part, pointInRing, wallFrame, wallSpec } from './gredighaus-data.js';

export { GREDIGHAUS };

// The Gredighaus rebuilt by hand (js/gredighaus-data.js), standing in for its swissBUILDINGS3D volumes, which the
// streamed tiles drew as a white block with the town houses' windows: the house of five floors in cream plaster, a
// window in a white frame in every bay of the four floors over the shops (drawn by the wall's material from its uv:
// metres along the wall from its middle, metres up the floors' grid), the terracotta strips up the window columns with
// an arched window at their heads, the white quoins, the frieze and the dark eave; the shops behind round columns under
// the canopy on the square and along the Promenade, "GREDIGHAUS" over it; the low wing against the north-east wall.
// Five meshes: the walls, the roofs, the shops' glass, the trim (one vertex-coloured mesh) and the decals (one canvas
// atlas).

excludeBuildings(GREDIGHAUS.exclude);
// (the player's walls on the surveyed outlines, not on OSM's: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(GREDIGHAUS.osm, groundOutlines());

const G = GREDIGHAUS, WIN = G.window, STOREY = G.storey, BAY = G.bay;
// v of a wall: metres up the floors' grid, a floor's foot at every multiple of STOREY (the part's `grid` at 40 of
// them); closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const CREAM = [0.44, 0.37, 0.25];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.2, 0.195, 0.19], 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.4, 0.34, 0.24], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35, { bay: BAY, half: WIN.half });
    M.glass = SIMPLE_SKINS.glow([0.06, 0.065, 0.07], 0.15, 0.6, [1.0, 0.82, 0.58], 0.15);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  // Cream plaster with a window per bay and floor: a white frame, a post in its middle and a rail across its upper
  // part, a light sill; a blind drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu)).max(smoothstep(0.035, 0.02, abs(fv.sub(WIN.hi - 0.5))));
    const pane = rect(WIN.half - 0.08, WIN.lo + 0.08, WIN.hi - 0.08).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.07, WIN.lo - 0.08, WIN.lo).mul(open).mul(near);
    const stain = rect(WIN.half, WIN.lo - 0.7, WIN.lo - 0.08, 0.2).mul(open).mul(0.05);
    const wall = mix(vec3(0.4, 0.335, 0.225), vec3(...CREAM).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain))
      .mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.85, id)));
    const blind = step(float(WIN.hi - 0.08).sub(drawn.mul(WIN.hi - WIN.lo - 0.16)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(0.5, 0.49, 0.45), sill);
    c = mix(c, vec3(0.56, 0.55, 0.51), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.36, 0.33, 0.28), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (flats and offices: lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 23, { share: 0.38, late: 0.1, tone: twoTones([1.0, 0.74, 0.44], [0.86, 0.9, 1.0], 0.82) })
      .mul(pane).mul(mix(float(1), float(0.4), blind)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The shops' glazing: dark red-brown frames, a post every 1.6 m and a transom; at night shut, a faint glow behind
  // most panes and a few lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.7 });
    const mu = abs(fract(U.div(1.6)).sub(0.5)), transom = smoothstep(0.06, 0.04, abs(V.sub(2.35)));
    const frame = smoothstep(0.455, 0.475, mu).max(transom).max(smoothstep(0.08, 0.05, V)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.6)).mul(13.1).add(floor(V.div(2.35)).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.05, 0.06, 0.065), vec3(0.11, 0.12, 0.12), paneId), vec3(0.17, 0.05, 0.035), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.7), float(0.1), frame);
    const lit = mix(float(0.12), float(0.9), step(0.86, paneId));
    m.emissiveNode = vec3(1.0, 0.82, 0.58).mul(float(1).sub(frame)).mul(lit).mul(glow.mul(0.6));
    M.glass = m;
  }
  return M;
}

// --- The lettering and the arches' heads: one canvas atlas ----------------------------------------------------------------
const ATLAS_SIZE = [1024, 128];
export const ATLAS = {
  letters: [0, 0, 768, 110],
  arch: [776, 0, 200, 96] // 1.56 × 0.75 m at 128 px a metre
};
const TERRACOTTA = [0.35, 0.09, 0.05];

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // The name in bronze capitals with a dark shadow under them
  cell('letters', (w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.round(h * 0.86)}px Georgia, "Times New Roman", serif`;
    g.fillStyle = 'rgba(40, 26, 14, 0.55)';
    g.fillText('GREDIGHAUS', w / 2 + 3, h / 2 + 4, w - 12);
    g.fillStyle = '#7a5530';
    g.fillText('GREDIGHAUS', w / 2, h / 2, w - 12);
  });
  // The arched head of a strip's top window: terracotta round a half-round light in a white frame with a post
  cell('arch', (w, h) => {
    g.fillStyle = '#93462f'; g.fillRect(0, 0, w, h);
    const r = (G.window.half / (2 * (G.window.half + G.strip))) * w;
    g.fillStyle = '#e4dccb';
    g.beginPath(); g.arc(w / 2, h, r, Math.PI, 2 * Math.PI); g.fill();
    g.fillStyle = '#1b2125';
    g.beginPath(); g.arc(w / 2, h, r - 10, Math.PI, 2 * Math.PI); g.fill();
    g.fillStyle = '#e4dccb'; g.fillRect(w / 2 - 3, h - r, 6, r);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  cream: CREAM, white: [0.6, 0.59, 0.55], terracotta: TERRACOTTA, sill: [0.52, 0.51, 0.47], eave: [0.07, 0.05, 0.04],
  canopy: [0.55, 0.52, 0.45], column: [0.45, 0.38, 0.26], fascia: [0.17, 0.05, 0.035], plinth: [0.2, 0.2, 0.19],
  wingEave: [0.11, 0.12, 0.13], frame: [0.56, 0.55, 0.51], pane: [0.03, 0.035, 0.04], door: [0.16, 0.085, 0.045]
};

/** The highest ground along a wall from s0 to s1 m, half a metre before it */
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.5));
  for (let i = 0; i <= n; i++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + (s1 - s0) * i / n, 0.5)));
  return hi;
}

// A wall's plaster from s0 to s1, y0 to y1: with windows (`windows`) or closed
function plaster(B, F, p, s0, s1, y0, y1, windows) {
  if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const mid = F.len / 2, v = (y) => y - p.grid + UP - (windows ? 0 : CLOSED);
  B.quad('plaster', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1),
    [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half: windows ? F.len / 2 : 0 });
}

// The shops from s0 to s1: the glazing set back behind the wall's face over a plinth, the fascia over it up to `fascia`
// (the canopy), the columns
function buildShop(B, F, p, spec, fascia = G.canopy[0]) {
  const [s0, s1] = [Math.max(0, spec.shop[0]), Math.min(F.len, spec.shop[1])];
  const foot = groundAlong(F, s0, s1) + 0.15, top = G.shopTop, back = -0.3;
  const Q = (s, y) => { const [x, z] = onWall(F, s, back); return [x, y, z]; };
  B.quad('glass', Q(s0, foot), Q(s1, foot), Q(s1, top), Q(s0, top), [[0, 0], [s1 - s0, 0], [s1 - s0, top - foot], [0, top - foot]]);
  B.box('trim', F, s0, s1, back - 0.05, back + 0.06, G.base, foot, C.plinth);
  // the soffit between the glazing's head and the wall's face, the fascia
  B.box('trim', F, s0, s1, back - 0.05, 0, top - 0.12, top, C.fascia);
  plaster(B, F, p, s0, s1, top, G.floor1, false);
  B.box('trim', F, s0, s1, 0, 0.05, top, fascia, C.fascia);
  for (const s of spec.columns || []) B.box('trim', F, s - 0.2, s + 0.2, back - 0.05, 0.05, G.base, fascia, C.column);
}

// The terracotta strip up a window column from floor k0 to the top: its sides, the spandrels, the sills, the arched head
function buildStrip(B, F, c, k0) {
  const w = WIN.half, sw = WIN.half + G.strip;
  const foot = (j) => G.floor1 + j * STOREY;
  const top = foot(G.floors - 1) + WIN.hi;
  const bottom = foot(k0) + WIN.lo - 0.35;
  B.box('trim', F, c - sw, c - w, 0, 0.04, bottom, top, C.terracotta);
  B.box('trim', F, c + w, c + sw, 0, 0.04, bottom, top, C.terracotta);
  B.box('trim', F, c - w, c + w, 0, 0.04, bottom, foot(k0) + WIN.lo, C.terracotta);
  for (let j = k0; j < G.floors - 1; j++) B.box('trim', F, c - w, c + w, 0, 0.04, foot(j) + WIN.hi, foot(j + 1) + WIN.lo, C.terracotta);
  for (let j = k0; j < G.floors; j++) B.box('trim', F, c - w - 0.08, c + w + 0.08, 0, 0.08, foot(j) + WIN.lo - 0.07, foot(j) + WIN.lo, C.sill);
  B.decal(F, c - sw, c + sw, 0.045, top, top + G.arch, 'arch');
}

// The ground floor's west end on the square: small windows and the house's door (guessed: behind a parked car in the
// photographs)
function buildGroundWest(B, F, spec) {
  for (const [s, hw] of spec.windows || []) {
    const y = groundHeight(...onWall(F, s, 0.5)) + 1.6;
    B.box('trim', F, s - hw, s + hw, 0, 0.04, y, y + 0.7, C.frame);
    B.box('trim', F, s - hw + 0.06, s + hw - 0.06, 0.04, 0.05, y + 0.06, y + 0.64, C.pane);
  }
  if (spec.door) {
    const [d0, d1] = spec.door, y = groundHeight(...onWall(F, (d0 + d1) / 2, 0.5));
    B.box('trim', F, d0 - 0.1, d1 + 0.1, 0, 0.05, y, y + 2.5, C.frame);
    B.box('trim', F, d0, d1, 0.05, 0.07, y + 0.15, y + 2.4, C.door);
    B.box('trim', F, d0 + 0.15, d1 - 0.15, 0.07, 0.08, y + 1.1, y + 2.1, C.pane);
    B.box('trim', F, d0 - 0.3, d1 + 0.3, 0, 0.45, y - 0.5, y + 0.15, C.plinth);
  }
}

// The house: its walls (closed under the first floor whose windows clear the ground, the shops on the square and the
// street), the strips, quoins, canopy, frieze and eave, the roof
function buildHouse(B) {
  const p = part('house'), ring = outwardRing(p.ring);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const spec = wallSpec(a, b);
    const windows = F.len >= 2.4;
    let hi = groundAlong(F) + 0.25;
    if (spec?.above) hi = Math.max(hi, spec.above + 0.25);
    const k0 = spec?.shop ? 0 : firstFloor(hi);
    const from = windows ? G.floor1 + k0 * STOREY : p.windowTop;
    if (spec?.shop) {
      const [s0, s1] = [Math.max(0, spec.shop[0]), Math.min(F.len, spec.shop[1])];
      plaster(B, F, p, 0, s0, G.base, G.floor1, false);
      plaster(B, F, p, s1, F.len, G.base, G.floor1, false);
      buildShop(B, F, p, spec);
    } else plaster(B, F, p, 0, F.len, G.base, from, false);
    plaster(B, F, p, 0, F.len, from, p.windowTop, true);
    plaster(B, F, p, 0, F.len, p.windowTop, p.top, false);
    if (spec?.strips) for (const k of spec.strips) buildStrip(B, F, bayAt(F.len, k), k0);
    for (const [q0, q1, foot] of spec?.quoins || []) B.box('trim', F, q0, q1, 0, 0.05, Math.max(G.base, foot), G.frieze, C.white);
    if (spec?.canopy) {
      const [c0, c1, depth] = spec.canopy;
      B.box('trim', F, c0, c1, 0, depth, G.canopy[0], G.canopy[1], C.canopy, { top: 'roof' });
    }
    if (spec) buildGroundWest(B, F, spec);
    // the white frieze, the dark eave over it
    B.box('trim', F, 0, F.len, 0, 0.06, G.frieze, G.eave.y0, C.white);
    B.box('trim', F, -G.eave.out, F.len + G.eave.out, -0.05, G.eave.out, G.eave.y0, G.eave.y1, C.eave, { top: 'roof' });
  }
  flatRoof(B, ring, p.top);
}

// The low wing: two floors against the house's north-east wall, its street front a shop, the dark sheet round its roof
function buildWing(B) {
  const p = part('wing'), house = part('house'), ring = outwardRing(p.ring);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    // (its wall against the house stands inside it)
    if (pointInRing(house.ring, ...onWall(F, F.len / 2, 0.3))) continue;
    const spec = wallSpec(a, b);
    if (spec?.shop) {
      // (no canopy here: the fascia ends under the first floor's sills)
      buildShop(B, F, p, spec, G.floor1 - 0.12);
      plaster(B, F, p, 0, F.len, G.floor1, p.top, true);
    } else {
      const hi = groundAlong(F) + 0.25, windows = F.len >= 2.4;
      const k = windows ? Math.max(0, Math.ceil((hi - p.grid - WIN.lo) / STOREY - 1e-9)) : 9;
      const from = Math.min(p.top, p.grid + k * STOREY);
      plaster(B, F, p, 0, F.len, G.base, from, false);
      plaster(B, F, p, 0, F.len, from, p.top, true);
    }
    B.box('trim', F, -G.wingEave.out, F.len + G.wingEave.out, -0.05, G.wingEave.out, G.wingEave.y0, G.wingEave.y1, C.wingEave, { top: 'roof' });
  }
  flatRoof(B, ring, p.top);
}

// The name over the canopy on the square, under the window column nearest the street
function buildLetters(B) {
  const spec = G.walls.find((w) => w.letters), L = spec.letters, F = wallFrame(spec.a, spec.b), c = bayAt(F.len, L.bay);
  B.decal(F, c - L.w / 2, c + L.w / 2, 0.03, L.y0, L.y1, 'letters');
}

/**
 * Builds the Gredighaus into `scene`. Returns { group, colliders } (none of its own: the player's walls stand on the
 * surveyed outlines, js/buildings.js; the columns stand within them, the canopy over the pavement).
 */
export function buildGredighaus(scene) {
  const root = new THREE.Group();
  root.name = 'Gredighaus';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Gredighaus' }), M = materials();
  buildHouse(B);
  buildWing(B);
  buildLetters(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
