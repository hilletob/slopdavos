import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { CASA_BELLINA, coveredTo, firstRow, groundOutlines, isLoggia, onWall, outwardRing, partAt, wallFrame } from './casa-bellina-data.js';

export { CASA_BELLINA };

// The Casa Bellina rebuilt by hand (js/casa-bellina-data.js), standing in for its three swissBUILDINGS3D volumes, which
// the streamed tiles drew as white blocks with the town houses' windows: the west and east halves stepping down the
// slope and the low annex on the north-east, in white plaster; towards the street the five blocks' stacks of glazed
// balconies between white piers (frosted glass rails, pale yellow sun blinds drawn down to different depths, white
// slab edges: drawn by their own material from the wall's uv), elsewhere a window with a grey roller shutter in every
// bay of every floor; the lower floor and the garage where the ground falls on the north, the garage's gate on the
// east; the flat roofs' deep eaves on white rafters, the piers' heads with their steel flues over the roof; the
// entrance at the street's level with the name beside it; the terrace's rail on the annex. Five meshes: the plaster
// walls, the balconies' fronts, the roofs, the trim (one vertex-coloured mesh) and the name (one small canvas atlas).

excludeBuildings(CASA_BELLINA.exclude);
// (the player's walls on the surveyed volumes, not on OSM's outline, which stood up to 1.1 m off them: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(CASA_BELLINA.osm, groundOutlines());

const STOREY = CASA_BELLINA.storey, BAY = CASA_BELLINA.bay, WIN = CASA_BELLINA.win, L = CASA_BELLINA.loggia;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.6, 0.6, 0.585], BLIND = [0.47, 0.4, 0.23], FROSTED = [0.27, 0.31, 0.32], FRAME = [0.42, 0.43, 0.44];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.28, 0.28, 0.275], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.55, 0.55, 0.535], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4, { bay: BAY, half: WIN.half });
    M.loggia = SIMPLE_SKINS.windowed([0.44, 0.4, 0.28], STOREY, L.rail / STOREY, L.open / STOREY, 0.85, 0.35, { bay: 0 });
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(8, 28);
  const glow = nightGlow();
  // White plaster with a window per bay and floor: a light grey frame, a post in its middle, a sill; a grey roller
  // shutter drawn down in some (its slats fading out with distance)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const post = smoothstep(0.04, 0.025, abs(bu));
    const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(post.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.06, WIN.lo - 0.07, WIN.lo).mul(open).mul(near);
    const wall = mix(vec3(...PLASTER).mul(0.93), vec3(...PLASTER).mul(1.04), worldNoise(0.3)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fade(25, 80)).mul(0.05)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.85, id)));
    const span = WIN.hi - WIN.lo - 0.14;
    const shutter = step(float(WIN.hi - 0.07).sub(drawn.mul(span)), fv).mul(pane);
    const slats = smoothstep(0.38, 0.5, abs(fract(fv.div(0.06)).sub(0.5))).mul(fine).mul(0.25);
    const glassC = mix(vec3(0.02, 0.027, 0.033), vec3(0.075, 0.09, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(0.5, 0.5, 0.49), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.3, 0.305, 0.31).mul(float(1).sub(slats)), shutter);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(shutter));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (flats: lit here and there in the evening, fewer towards midnight; a shutter lets a little through its slats)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 41, { share: 0.4, late: 0.1, tone: twoTones([1.0, 0.74, 0.46], [0.9, 0.9, 1.0], 0.8) })
      .mul(pane).mul(mix(float(1), float(0.12), shutter)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The balconies' fronts: per floor the white slab's edge, the frosted glass rail with its posts and handrail, the
  // opening over it (dark glazing behind, its frames) and the sun blinds of each panel drawn down to a depth of their
  // own, the blinds' box under the slab over it; white piers at the front's ends
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const half = attribute('aHalf', 'float');
    const inner = half.sub(L.pier);
    // the panels: as many of about L.panel m as fit between the piers, laid out from the front's west end
    const count = floor(inner.mul(2 / L.panel).add(0.5)).max(1);
    const pw = inner.mul(2).div(count);
    const x = U.add(inner), k = floor(x.div(pw));
    const pier = step(inner, abs(U));
    const storey = floor(V.div(STOREY)), fv = V.sub(storey.mul(STOREY));
    // (metres to the nearest post: at every panel's edge and its middle)
    const hp = pw.mul(0.5), dPost = float(0.5).sub(abs(fract(x.div(hp)).sub(0.5))).mul(hp);
    const slab = step(fv, L.slab);
    const rail = step(L.slab, fv).mul(step(fv, L.rail));
    const handrail = smoothstep(0.035, 0.015, abs(fv.sub(L.rail - 0.03))).mul(near);
    const opening = step(L.rail, fv).mul(step(fv, L.open));
    const box = step(L.open, fv);
    const id = hash(k.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = float(0.12).add(step(0.3, id).mul(0.45)).add(step(0.55, id).mul(0.43));
    const blind = opening.mul(step(float(L.open).sub(drawn.mul(L.open - L.rail)), fv));
    const hem = blind.mul(smoothstep(0.06, 0.03, fv.sub(float(L.open).sub(drawn.mul(L.open - L.rail))))).mul(near);
    const posts = smoothstep(0.05, 0.03, dPost).mul(fine);
    const frames = smoothstep(0.045, 0.025, dPost).max(smoothstep(0.03, 0.015, abs(fv.sub(L.rail + 0.12)))).mul(opening).mul(float(1).sub(blind)).mul(near);
    const glassC = mix(vec3(0.025, 0.032, 0.04), vec3(0.08, 0.095, 0.105), worldNoise(0.07));
    const frosted = mix(vec3(...FROSTED).mul(0.92), vec3(...FROSTED).mul(1.08), hash(k.mul(5.3).add(storey.mul(2.9))));
    const cloth = vec3(...BLIND).mul(float(1).sub(smoothstep(0.42, 0.5, abs(fract(x.div(hp)).sub(0.5))).mul(fine).mul(0.25)));
    let c = mix(glassC, vec3(0.55, 0.55, 0.54), frames);
    c = mix(c, cloth, blind);
    c = mix(c, vec3(0.3, 0.27, 0.2), hem);
    c = mix(c, mix(frosted, vec3(0.2, 0.21, 0.22), posts), rail);
    c = mix(c, vec3(0.36, 0.37, 0.37), handrail.mul(rail));
    c = mix(c, vec3(0.42, 0.42, 0.42), box);
    c = mix(c, vec3(...PLASTER).mul(0.95), slab);
    c = mix(c, vec3(...PLASTER), pier);
    m.colorNode = c;
    const glazing = opening.mul(float(1).sub(blind)).mul(float(1).sub(pier)).mul(float(1).sub(frames));
    m.roughnessNode = mix(mix(float(0.9), float(0.35), rail.mul(float(1).sub(pier))), float(0.12), glazing);
    m.metalnessNode = glazing.mul(0.5).add(rail.mul(float(1).sub(pier)).mul(0.15));
    // (the living rooms behind: lit here and there in the evening, glowing through the drawn blinds)
    m.emissiveNode = litWindow(k.add(half.mul(7.1)), storey, 53, { share: 0.45, late: 0.12, tone: twoTones([1.0, 0.76, 0.5], [0.95, 0.88, 0.74], 0.7) })
      .mul(opening).mul(float(1).sub(pier)).mul(mix(float(1), float(0.4), blind)).mul(glow.mul(1.1));
    M.loggia = m;
  }
  return M;
}

// --- The name by the door: one small canvas atlas ------------------------------------------------------------------------
const ATLAS_SIZE = [512, 128];
export const ATLAS = { name: [0, 0, 512, 128] };

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  cell('name', (w, h) => {
    g.fillStyle = '#e9e6dd'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a8c8e'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#2c2e30'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '500 64px Helvetica, Arial, sans-serif';
    g.fillText('CASA BELLINA', w / 2, h / 2 + 3, w - 40);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  plinth: [0.4, 0.4, 0.39], white: [0.58, 0.58, 0.57], fascia: [0.44, 0.45, 0.46], flue: [0.42, 0.43, 0.45],
  door: [0.05, 0.06, 0.07], frame: [0.3, 0.31, 0.32], gate: [0.22, 0.23, 0.24], slat: [0.3, 0.31, 0.32],
  rail: [0.3, 0.31, 0.32], glassRail: [0.24, 0.28, 0.29], step: [0.33, 0.33, 0.32]
};

// The highest ground along a wall, half a metre out of it
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

// A strip of a wall from y0 to y1 into `bucket` (the plaster or the balconies' fronts): windowed (its bays laid out
// from the wall's middle) or closed
function strip(B, bucket, F, line, y0, y1, windows) {
  if (y1 - y0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const mid = F.len / 2, open = windows && F.len >= 2.4;
  const v = (y) => y - line + UP - (open ? 0 : CLOSED);
  B.quad(bucket, P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half: open ? mid : 0 });
}
// The plinth: a grey strip from y0 to y1 (into the trim)
function plinth(B, F, y0, y1) {
  if (y1 - y0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  B.quad('trim', P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), undefined, { colour: C.plinth });
}

// A volume: each wall from the ground (or from the roof of the part standing before it) up to its roof: the plinth,
// the floors (the balconies' fronts towards the street, windows elsewhere), the parapet; the eaves; the roof
function buildPart(B, p) {
  const ring = outwardRing(p.ring), base = CASA_BELLINA.base, E = CASA_BELLINA.eaves;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const cover = coveredTo(p, a, b);
    if (cover >= p.top - 0.01) continue; // (inside a taller part)
    const y0 = Math.max(base, cover);
    const loggia = isLoggia(a, b);
    // (the windows begin over the highest ground along the wall, or over the roof before it: a closed plinth under them;
    // on the north, where the ground falls, from the floor under the ground floor)
    const hi = Math.max(groundAlong(F) + 0.25, cover + 0.05);
    const fromY = Math.max(y0, firstRow({ ...p, cellar: p.cellar && !loggia && F.n[1] < -0.3 }, hi, loggia ? L.slab : WIN.lo));
    const windows = p.line - fromY > 2.0 && F.len >= 2.4;
    if (cover > -Infinity && !windows) strip(B, 'plaster', F, p.line, y0, p.top, false);
    else {
      if (cover > -Infinity) strip(B, 'plaster', F, p.line, y0, fromY, false);
      else plinth(B, F, y0, fromY);
      if (windows) strip(B, loggia ? 'loggia' : 'plaster', F, p.line, fromY, p.line, true);
      strip(B, 'plaster', F, p.line, windows ? p.line : fromY, p.top, false);
    }
    if (loggia && windows) buildLoggiaRelief(B, F, p, fromY);
    // the eaves: a fascia round the roof, out over the wall (on the annex a coping only)
    const out = p.terrace ? 0.08 : E.out, thick = p.terrace ? 0.14 : E.thick;
    B.box('trim', F, -out, F.len + out, -0.3, out, p.top - thick, p.top + 0.05, C.fascia, { top: 'roof' });
    if (p.terrace && cover < p.top) buildRail(B, F, p.top);
  }
  flatRoof(B, ring, p.top);
}

// The relief of a balconies' front: the slabs' edges at every floor, the piers at its ends, the rafters under the eaves
function buildLoggiaRelief(B, F, p, fromY) {
  const E = CASA_BELLINA.eaves;
  for (let y = fromY; y < p.line - 0.5; y += STOREY) B.box('trim', F, 0, F.len, 0, 0.1, y, y + L.slab, C.white);
  for (const s of [0, F.len - L.pier]) B.box('trim', F, s, s + L.pier, 0, 0.12, fromY, p.top - E.thick, C.white);
  const n = Math.max(2, Math.round(F.len / E.rafter));
  for (let i = 0; i <= n; i++) {
    const s = Math.min(F.len - 0.05, Math.max(0.05, (F.len * i) / n));
    B.box('trim', F, s - 0.04, s + 0.04, 0, E.out - 0.06, p.top - E.thick - 0.16, p.top - E.thick, C.white);
  }
}

// The terrace's rail on the annex's roof: glass panels between posts, a handrail
function buildRail(B, F, top) {
  const r = CASA_BELLINA.rail;
  B.box('trim', F, 0.05, F.len - 0.05, -0.12, -0.08, top + 0.08, top + r - 0.06, C.glassRail);
  B.box('trim', F, 0, F.len, -0.14, -0.06, top + r - 0.06, top + r, C.rail);
  const n = Math.max(1, Math.round(F.len / 1.6));
  for (let i = 0; i <= n; i++) {
    const s = Math.min(F.len - 0.04, Math.max(0.04, (F.len * i) / n));
    B.box('trim', F, s - 0.03, s + 0.03, -0.14, -0.06, top, top + r, C.rail);
  }
}

// The entrance at the street's level under the east block's balconies: the glazed door in its frame, the step, the
// name beside it
function buildEntrance(B) {
  const En = CASA_BELLINA.entrance, F = wallFrame(...En.wall), D = En.door;
  const [gx, gz] = onWall(F, D.s, 0.6), g = groundHeight(gx, gz);
  const foot = partAt(...onWall(F, D.s, -0.5)).foot;
  const y1 = Math.max(g + 2.1, foot);
  // (the frame stands proud of the slab's edge over it)
  B.box('trim', F, D.s - D.w / 2 - 0.08, D.s + D.w / 2 + 0.08, 0, 0.14, g - 0.3, y1 + 0.08, C.frame);
  B.box('trim', F, D.s - D.w / 2, D.s + D.w / 2, 0.14, 0.16, g, y1, C.door);
  B.box('trim', F, D.s - 0.03, D.s + 0.03, 0.16, 0.18, g, y1, C.frame);
  B.box('trim', F, D.s - D.w / 2 - 0.4, D.s + D.w / 2 + 0.4, 0, 0.9, g - 0.6, g + 0.05, C.step);
  const N = En.name;
  B.decal(F, N.s[0], N.s[1], 0.03, g + N.y0, g + N.y1, 'name');
}

// The garage's gate in the annex's east wall: its frame and slats from the ramp's foot
function buildGate(B) {
  const G = CASA_BELLINA.gate, F = wallFrame(...G.wall);
  const g = groundHeight(...onWall(F, G.s, 0.6));
  B.box('trim', F, G.s - G.w / 2 - 0.2, G.s + G.w / 2 + 0.2, 0, 0.08, g - 0.3, g + G.h + 0.2, C.frame);
  B.box('trim', F, G.s - G.w / 2, G.s + G.w / 2, 0.08, 0.1, g - 0.3, g + G.h, C.gate);
  for (let y = g + 0.25; y < g + G.h; y += 0.25) B.box('trim', F, G.s - G.w / 2, G.s + G.w / 2, 0.1, 0.12, y - 0.03, y, C.slat);
}

// The piers' heads over the roof: a white block with a cap, two or three steel flues on it
function buildStacks(B) {
  const S = CASA_BELLINA.stacks;
  // (turned with the street front: along the long walls' line)
  const F0 = wallFrame(...CASA_BELLINA.loggias[3]);
  S.at.forEach(([x, z], i) => {
    const top = partAt(x, z).top;
    const F = { a: [x, z], u: F0.u, n: F0.n };
    B.box('trim', F, -S.w / 2, S.w / 2, -S.d / 2, S.d / 2, top - 0.2, top + S.h, C.white, { top: 'roof' });
    B.box('trim', F, -S.w / 2 - 0.06, S.w / 2 + 0.06, -S.d / 2 - 0.06, S.d / 2 + 0.06, top + S.h, top + S.h + 0.1, C.fascia, { top: 'roof' });
    const flues = i === 1 ? [-0.45, 0, 0.45] : [-0.3, 0.3];
    for (const s of flues) B.box('trim', F, s - 0.11, s + 0.11, -0.11, 0.11, top + S.h + 0.1, top + S.h + 0.95, C.flue);
  });
}

/**
 * Builds the Casa Bellina into `scene`. Returns { group, colliders }: none of its own (the player's walls stand on the
 * surveyed outlines, js/landmarks.js SURVEYED_FOOTPRINTS; nothing stands out of them at the ground but the door's step).
 */
export function buildCasaBellina(scene) {
  const root = new THREE.Group();
  root.name = 'Casa Bellina';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['plaster', 'loggia'], name: 'Casa Bellina' }), M = materials();
  for (const p of CASA_BELLINA.parts) buildPart(B, p);
  buildEntrance(B);
  buildGate(B);
  buildStacks(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}

