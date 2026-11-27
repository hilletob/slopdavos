import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { BRISTOL, groundOutlines, isShared, onWall, outwardRing, part, wallFrame } from './bristol-data.js';

export { BRISTOL };

// The house Bristol on the Promenade rebuilt by hand (js/bristol-data.js), standing in for its swissBUILDINGS3D volume,
// which the streamed tiles drew as one white block with the town houses' windows: the six-storey block in warm white
// plaster with a window in a brown timber frame in every bay of every floor (drawn by the wall's material from its uv:
// metres along the wall from its middle, metres up the floors' grid), its dark coping; the two-storey podium round its
// south and east sides with the shops' glazing under a dark fascia, the name and the doors on the Promenade, the
// garage's gate on the lane to the north, the railing round its terrace. The street views show only the house next door
// (js/bristol-data.js): the look is guessed. Five meshes: the walls, the roofs, the glass, the trim (one vertex-coloured
// mesh) and the lettering (one canvas atlas).

excludeBuildings([BRISTOL.exclude]);
// (its own lettering on the fascia: no hanging sign from js/shops.js)
SHOP_EXCLUSIONS.add(BRISTOL.osm);
// (the player's walls on the surveyed volumes, not on OSM's outline, which leaves the podium's east wing out:
// js/landmarks.js)
SURVEYED_FOOTPRINTS.set(BRISTOL.osm, groundOutlines());

const STOREY = BRISTOL.storey, BAY = BRISTOL.bay, WIN = BRISTOL.win;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.56, 0.54, 0.5], TIMBER = [0.17, 0.095, 0.05], BRONZE = [0.06, 0.05, 0.042];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.27, 0.265, 0.255], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.5, 0.48, 0.44], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35);
    M.glass = SIMPLE_SKINS.glow([0.08, 0.095, 0.1], 0.1, 0.8, [1.0, 0.86, 0.66], 0.25);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  // Warm white plaster with a window per bay and floor: a brown timber frame, a post between its two casements and a
  // rail across its upper third, a light sill under it; a curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const bars = smoothstep(0.045, 0.03, abs(bu)).max(smoothstep(0.04, 0.025, abs(fv.sub(WIN.hi - 0.5))));
    const pane = rect(WIN.half - 0.08, WIN.lo + 0.08, WIN.hi - 0.08).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.08, WIN.lo - 0.08, WIN.lo).mul(open).mul(near);
    // the plaster: a little weathering, a shade darker under the sills and at the foot of a floor
    const stain = rect(WIN.half, WIN.lo - 0.7, WIN.lo - 0.08, 0.2).mul(open).mul(0.05);
    const wall = mix(vec3(...PLASTER).mul(0.93), vec3(...PLASTER).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.88, id)));
    const span = WIN.hi - WIN.lo - 0.16;
    const curtain = step(float(WIN.hi - 0.08).sub(drawn.mul(span)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.075, 0.09, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(0.46, 0.45, 0.42), sill);
    c = mix(c, vec3(...TIMBER), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.5, 0.46, 0.4), curtain);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (flats: a window lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 47, { share: 0.4, late: 0.1, tone: twoTones([1.0, 0.74, 0.44], [0.9, 0.9, 0.96], 0.8) }).mul(pane).mul(mix(float(1), float(0.4), curtain)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The shops' glazing: bronze mullions every 1.6 m, a transom 2.1 m up; at night the shops are shut: a faint glow behind
  // most panes, a shop window lit behind a few
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.6)).sub(0.5));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.05, 0.03, abs(V.sub(2.1)))).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.6)).mul(13.1).add(step(2.1, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.05, 0.065, 0.075), vec3(0.12, 0.14, 0.15), paneId), vec3(...BRONZE), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.3), frame);
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(float(1).sub(frame)).mul(mix(float(0.03), float(0.3), step(0.75, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The lettering: one canvas atlas -----------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 256];
export const ATLAS = {
  name: [0, 0, 1024, 104], // the name on the fascia over the shops (5.0 × 0.51 m, its cell's proportions)
  parking: [0, 112, 128, 128] // the board over the garage's gate (0.7 × 0.7 m)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('name', (w, h) => {
    g.fillStyle = '#efe5cf';
    g.font = '600 84px Georgia, "Times New Roman", serif';
    g.fillText('B R I S T O L', w / 2, h / 2 + 4, w - 40);
  });
  cell('parking', (w, h) => {
    g.fillStyle = '#1c4f9c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffffff';
    g.font = 'bold 96px Helvetica, Arial, sans-serif';
    g.fillText('P', w / 2, h / 2 + 6);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  bronze: BRONZE, fascia: [0.05, 0.048, 0.046], coping: [0.2, 0.2, 0.195], sill: [0.4, 0.39, 0.36], plinth: [0.3, 0.29, 0.27],
  rail: [0.12, 0.12, 0.125], gate: [0.16, 0.16, 0.165], slat: [0.22, 0.22, 0.225], door: [0.03, 0.035, 0.04], step: [0.3, 0.3, 0.29]
};

// A strip of a wall from y0 to y1 into the plaster: windowed (its bays laid out from the wall's middle) or closed
function plaster(B, F, line, y0, y1, windows) {
  if (y1 - y0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const mid = F.len / 2, open = windows && F.len >= 2.4;
  const v = (y) => y - line + UP - (open ? 0 : CLOSED);
  B.quad('plaster', P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half: open ? mid : 0 });
}
// A strip of glazing from y0 to y1 (uv: metres along the wall, metres up from its foot)
function glass(B, F, y0, y1) {
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  B.quad('glass', P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), [[0, 0], [F.len, 0], [F.len, y1 - y0], [0, y1 - y0]]);
}

/** The highest ground along a wall, half a metre out of it */
export function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

// A volume: its walls from the base up to its roof (the shops' glazing or a closed plinth, the floors, the parapet), the
// coping round its roof, the roof. The walls the block and the podium share: the podium's are left out (inside the
// block), the block's begin at the terrace's floor
function buildPart(B, p) {
  const ring = outwardRing(p.ring), S = BRISTOL.shop, terrace = part('podium').line;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const shared = isShared(a, b);
    if (shared && p.id === 'podium') continue;
    if (shared) plaster(B, F, p.line, terrace, p.line, true);
    else {
      // Where the slope rises along a wall the windows begin over the highest ground along it: under that a closed plinth,
      // not panes cut by the ground; along the podium's low walls the shops' glazing
      const hi = groundAlong(F) + 0.25;
      const fromY = hi <= p.floor + WIN.lo ? p.floor : p.floor + Math.ceil((hi - p.floor - WIN.lo) / STOREY) * STOREY;
      const foot = Math.max(p.floor + 0.1, hi - 0.15);
      if (p.id === 'podium' && S.y1 - foot >= S.min) {
        plaster(B, F, p.line, BRISTOL.base, foot, false);
        glass(B, F, foot, S.y1);
        B.box('trim', F, -0.02, F.len + 0.02, 0, 0.14, S.fascia[0], S.fascia[1], C.fascia);
        B.box('trim', F, -0.02, F.len + 0.02, 0, 0.1, foot - 0.3, foot + 0.12, C.plinth);
        plaster(B, F, p.line, S.y1, p.line, true);
      } else {
        plaster(B, F, p.line, BRISTOL.base, Math.min(fromY, p.line), false);
        if (fromY < p.line) plaster(B, F, p.line, fromY, p.line, true);
      }
    }
    plaster(B, F, p.line, p.line, p.top, false);
    B.box('trim', F, -0.05, F.len + 0.05, -0.3, 0.07, p.top - 0.12, p.top + 0.12, C.coping);
  }
  flatRoof(B, ring, p.top);
}

// The podium's east front on the Promenade: the name on the fascia, the shops' doors (dark leaves in a bronze frame, a
// step before them)
function buildFront(B) {
  const Fr = BRISTOL.front, F = wallFrame(Fr.a, Fr.b), S = BRISTOL.shop, w = Fr.name.w;
  B.decal(F, (F.len - w) / 2, (F.len + w) / 2, 0.16, S.fascia[0] + 0.02, S.fascia[1] - 0.02, 'name');
  for (const D of Fr.doors) {
    const [x, z] = onWall(F, D.s, 0.6), y0 = groundHeight(x, z), y1 = y0 + 2.3;
    B.box('trim', F, D.s - D.w / 2 - 0.07, D.s + D.w / 2 + 0.07, 0, 0.1, y0, y1 + 0.08, C.bronze);
    for (const s of [D.s - D.w / 4, D.s + D.w / 4]) B.box('trim', F, s - D.w / 4 + 0.05, s + D.w / 4 - 0.05, 0.1, 0.12, y0 + 0.05, y1 - 0.05, C.door);
    B.box('trim', F, D.s - D.w / 2 - 0.3, D.s + D.w / 2 + 0.3, 0, 0.6, y0 - 0.5, y0 + 0.04, C.step);
  }
}

// The garage's gate in the podium's north wall on the lane: a dark frame, the slatted gate, the blue board over it
function buildGate(B) {
  const G = BRISTOL.gate, F = wallFrame(G.a, G.b);
  const [x, z] = onWall(F, G.s, 1.0), y0 = groundHeight(x, z), y1 = y0 + G.h;
  B.box('trim', F, G.s - G.w / 2 - 0.25, G.s + G.w / 2 + 0.25, 0, 0.16, y0 - 0.3, y1 + 0.25, C.fascia);
  B.box('trim', F, G.s - G.w / 2, G.s + G.w / 2, 0.16, 0.18, y0, y1, C.gate);
  for (let y = y0 + 0.25; y < y1; y += 0.25) B.box('trim', F, G.s - G.w / 2, G.s + G.w / 2, 0.18, 0.2, y - 0.025, y, C.slat);
  B.decal(F, G.s - 0.35, G.s + 0.35, 0.2, y1 + 0.5, y1 + 1.2, 'parking');
}

// The terrace's railing along the podium's outer walls: posts and a handrail on the parapet
function buildRail(B) {
  const p = part('podium'), ring = outwardRing(p.ring), r = BRISTOL.rail, y0 = p.top + 0.12, y1 = y0 + r;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (isShared(a, b)) continue;
    const F = wallFrame(a, b);
    if (F.len < 0.2) continue;
    B.box('trim', F, 0, F.len, -0.18, -0.12, y1 - 0.05, y1, C.rail);
    B.box('trim', F, 0, F.len, -0.17, -0.13, y0 + 0.35, y0 + 0.38, C.rail);
    const n = Math.max(1, Math.round(F.len / 1.5));
    for (let k = 0; k <= n; k++) { const s = (F.len * k) / n; B.box('trim', F, s - 0.03, s + 0.03, -0.18, -0.12, y0, y1, C.rail); }
  }
}

/**
 * Builds the house Bristol into `scene`. Returns { group, colliders } (no colliders of its own: the player's walls are
 * its surveyed outlines, registered above, and nothing stands free of them).
 */
export function buildBristol(scene) {
  const root = new THREE.Group();
  root.name = 'Bristol';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Bristol' }), M = materials();
  for (const p of BRISTOL.parts) buildPart(B, p);
  buildFront(B);
  buildGate(B);
  buildRail(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
