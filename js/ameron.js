import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { groundHeight } from './terrain.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, rectMask, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { AMERON, bays, colliderWalls, isClosed, isGlazed, onWall, outwardRing, part, wallFrame } from './ameron-data.js';

export { AMERON };

// The AMERON Mountain Hotel Davos rebuilt by hand (js/ameron-data.js), standing in for its three swissBUILDINGS3D
// volumes, which the streamed tiles drew as white blocks with the town houses' windows: the east wing on the Promenade,
// the taller middle block and the low south-west wing on the slope, in warm pale plaster with a tall French window in a
// bronze frame in every bay of every floor, a larch panel beside it and a glass rail across its foot (drawn by the wall's
// material from its uv: metres along the wall from its middle, metres up the floors' grid), a darker band at every
// floor's slab; the shop's glazed ground floor round the east wing and the middle block under a dark fascia, the shop's
// doors and name on the Promenade, the garage's gate; the hotel's entrance under a canopy on the Symondsstrasse; the
// balconies with glass rails towards the valley; the south-west wing's glazed restaurant; the name over the east wing's
// roof and on the parapet over the street; the machine room on the roof. Five meshes: the walls, the roofs, the glass,
// the trim (one vertex-coloured mesh) and the lettering (one canvas atlas). The hotel's hanging sign (js/shops.js) gives
// way to its own lettering.

excludeBuildings(AMERON.exclude);
SHOP_EXCLUSIONS.add(AMERON.osm);
// (the player's walls on the surveyed volumes, not on OSM's outline, which stood 3 m out in the north yard: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(AMERON.osm, AMERON.parts.map((p) => p.ring));

const STOREY = AMERON.storey, BAY = AMERON.bay, WIN = AMERON.win, PANEL = AMERON.panel;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.52, 0.49, 0.44], BRONZE = [0.075, 0.058, 0.042], LARCH = [0.3, 0.16, 0.07];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.26, 0.26, 0.255], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.45, 0.41, 0.36], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4, { bay: BAY, half: AMERON.open });
    M.glass = SIMPLE_SKINS.glow([0.08, 0.1, 0.11], 0.1, 0.8, [1.0, 0.88, 0.7], 0.5);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  // Warm pale plaster, a tall French window per bay and floor: a bronze frame with a post between its two leaves, a
  // glass rail across its foot; a larch panel of vertical boards to its right; the slab's band at every floor's foot
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: AMERON.open });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const post = smoothstep(0.04, 0.025, abs(bu));
    const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(post.mul(near))).mul(open);
    const rail = smoothstep(0.035, 0.015, abs(fv.sub(WIN.lo + WIN.rail))).mul(win).mul(near);
    const balustrade = step(fv, WIN.lo + WIN.rail).mul(pane);
    const panel = rectMask(bu.sub(PANEL.at), fv, PANEL.half, WIN.lo, WIN.hi).mul(open);
    const boards = smoothstep(0.42, 0.47, abs(fract(U.div(0.12)).sub(0.5))).mul(fine);
    const larch = mix(vec3(...LARCH).mul(0.85), vec3(...LARCH).mul(1.15), hash(floor(U.div(0.12)).mul(17.3).add(storey.mul(5.1)))).mul(float(1).sub(boards.mul(0.4)));
    const slab = smoothstep(0.2, 0.18, fv).mul(near.mul(0.7).add(0.3));
    const wall = mix(vec3(...PLASTER).mul(0.94), vec3(...PLASTER).mul(1.05), worldNoise(0.3));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.6, id).mul(mix(float(0.3), float(0.9), step(0.85, id)));
    const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(WIN.hi - WIN.lo - 0.14)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.075, 0.09, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(0.34, 0.33, 0.31), slab);
    c = mix(c, larch, panel);
    c = mix(c, vec3(...BRONZE), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.5, 0.47, 0.42), curtain);
    c = mix(c, c.mul(1.25).add(vec3(0.02, 0.03, 0.03)), balustrade.mul(near).mul(0.6));
    c = mix(c, vec3(0.3, 0.3, 0.3), rail);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(mix(float(0.92), float(0.75), panel), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (a hotel: most rooms lit in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 29, { share: 0.55, late: 0.15, tone: twoTones([1.0, 0.76, 0.48], [0.96, 0.9, 0.78], 0.7) }).mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The shop's and the restaurant's glazing: bronze mullions every 1.5 m, a transom 2.6 m up, a few panes lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.5)).sub(0.5));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.05, 0.03, abs(V.sub(2.6)))).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.5)).mul(13.1).add(step(2.6, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.05, 0.065, 0.075), vec3(0.12, 0.14, 0.15), paneId), vec3(...BRONZE), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.3), frame);
    // (at night the shop is shut: a faint glow behind most panes, the shop window's lights behind some)
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(float(1).sub(frame)).mul(mix(float(0.03), float(0.3), step(0.7, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The lettering: one canvas atlas -----------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  name: [0, 0, 1024, 240], // the name over the east wing's roof (14 × 3.4 m) and on the parapet (5.4 × 1.2 m)
  canopy: [0, 248, 512, 76] // the board on the entrance's canopy (4.4 × 0.65 m)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('name', (w) => {
    g.fillStyle = '#3a2a1a';
    g.font = '600 150px Georgia, "Times New Roman", serif';
    g.fillText('A M E R O N', w / 2, 92, w - 40);
    g.font = '600 40px Helvetica, Arial, sans-serif';
    g.fillText('M O U N T A I N   H O T E L   D A V O S', w / 2, 205, w - 160);
  });
  cell('canopy', (w, h) => {
    g.fillStyle = '#1d1712'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2cf9e';
    g.font = '600 50px Georgia, "Times New Roman", serif';
    g.fillText('A M E R O N', w / 2, h / 2 + 2, w - 30);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  bronze: BRONZE, fascia: [0.045, 0.045, 0.048], coping: [0.22, 0.22, 0.215], slab: [0.42, 0.41, 0.39], glassRail: [0.17, 0.22, 0.22],
  rail: [0.3, 0.3, 0.3], gate: [0.12, 0.12, 0.125], slat: [0.2, 0.2, 0.205], plant: [0.3, 0.3, 0.295], step: [0.3, 0.3, 0.29]
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

// The highest ground along a wall, half a metre out of it
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

// A volume: its walls from the base up to its roof (the shop's glazing or a plinth, the hotel's floors, the parapet),
// the coping round its roof, the roof
function buildPart(B, p) {
  const ring = outwardRing(p.ring), base = AMERON.base;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    if (isClosed(a, b)) plaster(B, F, p.line, base, p.top, false);
    else {
      // Where the slope rises along a wall (the west and the north yard stand up to 7 m over the Promenade), the glazing
      // and the windows begin over the highest ground along it: under that a closed plinth, not panes cut by the ground
      const hi = groundAlong(F) + 0.25;
      const fromY = hi <= p.from - WIN.lo ? p.from : p.from + Math.ceil((hi - p.from - WIN.lo) / STOREY) * STOREY;
      if (p.shop && hi < p.from - 1.6) {
        const foot = Math.max(p.floor + 0.3, hi), [f0, f1] = p.shop.fascia;
        plaster(B, F, p.line, base, foot, false);
        glass(B, F, foot, p.from);
        B.box('trim', F, 0, F.len, 0, 0.12, f0, f1, C.fascia);
      } else plaster(B, F, p.line, base, Math.min(fromY, p.line), false);
      if (isGlazed(p, a, b) && hi < p.glazed.y1 - 1.6) {
        glass(B, F, Math.max(p.from, hi), p.glazed.y1);
        if (hi > p.from) plaster(B, F, p.line, p.from, hi, false);
        B.box('trim', F, 0, F.len, 0, 0.1, p.glazed.y1 - 0.12, p.glazed.y1 + 0.05, C.bronze);
        plaster(B, F, p.line, p.glazed.y1, p.line, true);
      } else if (fromY < p.line) plaster(B, F, p.line, fromY, p.line, true);
      plaster(B, F, p.line, p.line, p.top, false);
    }
    B.box('trim', F, -0.05, F.len + 0.05, -0.3, 0.06, p.top - 0.12, p.top + 0.14, C.coping);
  }
  flatRoof(B, ring, p.top);
}

// The east front on the Promenade: the shop's doors under a canopy, the garage's gate
function buildPromenade(B) {
  const Pm = AMERON.promenade, F = wallFrame(Pm.a, Pm.b), D = Pm.doors, K = D.canopy, foot = part('east').floor;
  for (let s = D.s - D.w / 2; s <= D.s + D.w / 2 + 0.01; s += D.w / 4) B.box('trim', F, s - 0.06, s + 0.06, 0, 0.1, foot, D.y1, C.bronze);
  B.box('trim', F, D.s - D.w / 2 - 0.06, D.s + D.w / 2 + 0.06, 0, 0.1, D.y1 - 0.12, D.y1, C.bronze);
  B.box('trim', F, D.s - K.w / 2, D.s + K.w / 2, 0, K.out, K.y, K.y + K.thick, C.fascia, { top: 'roof' });
  // the gate: a dark opening in the glazing's line, its slats
  const G = Pm.gate;
  B.box('trim', F, G.s - G.w / 2 - 0.25, G.s + G.w / 2 + 0.25, 0, 0.08, G.y0, G.y1 + 0.25, C.fascia);
  B.box('trim', F, G.s - G.w / 2, G.s + G.w / 2, 0.08, 0.1, G.y0, G.y1, C.gate);
  for (let y = G.y0 + 0.3; y < G.y1; y += 0.3) B.box('trim', F, G.s - G.w / 2, G.s + G.w / 2, 0.1, 0.12, y - 0.03, y, C.slat);
}

// The hotel's entrance on the Symondsstrasse: the doors' frames, the step, the canopy with the name's board on it; the
// name on the parapet over it
function buildEntrance(B) {
  const St = AMERON.street, F = wallFrame(St.a, St.b), E = St.entrance, K = E.canopy;
  for (let s = E.s - E.w / 2; s <= E.s + E.w / 2 + 0.01; s += E.w / 4) B.box('trim', F, s - 0.07, s + 0.07, 0, 0.12, E.y0, E.y1, C.bronze);
  B.box('trim', F, E.s - E.w / 2 - 0.07, E.s + E.w / 2 + 0.07, 0, 0.12, E.y1 - 0.14, E.y1, C.bronze);
  B.box('trim', F, E.s - E.w / 2 - 0.6, E.s + E.w / 2 + 0.6, 0, 1.4, E.y0 - 0.6, E.y0 + 0.1, C.step);
  B.box('trim', F, E.s - K.w / 2, E.s + K.w / 2, 0, K.out, K.y, K.y + K.thick, C.bronze, { top: 'roof' });
  const bw = 4.4;
  B.box('trim', F, E.s - bw / 2, E.s + bw / 2, K.out - 0.14, K.out - 0.06, K.y + K.thick, K.y + K.thick + 0.65, C.fascia);
  B.decal(F, E.s - bw / 2, E.s + bw / 2, K.out - 0.05, K.y + K.thick, K.y + K.thick + 0.65, 'canopy');
  const Pa = St.parapet;
  B.decal(F, Pa.s - Pa.w / 2, Pa.s + Pa.w / 2, 0.05, Pa.y0, Pa.y1, 'name');
}

// The name on the middle block's closed east face, over the east wing's roof
function buildName(B) {
  const W = AMERON.nameWall, F = wallFrame(W.a, W.b), n = W.name;
  B.decal(F, (F.len - n.w) / 2, (F.len + n.w) / 2, 0.05, n.y0, n.y1, 'name');
}

// The balconies towards the valley: before every window of the south faces, a slab, glass panels on three sides, a
// handrail
function buildBalconies(B) {
  const Bc = AMERON.balconies, w = Bc.w / 2, o = Bc.out, r = Bc.rail;
  for (const W of Bc.walls) {
    const F = wallFrame(W.a, W.b), line = part(W.part).line;
    for (const s of bays(F.len, BAY, F.len / 2, AMERON.open)) {
      const [x] = onWall(F, s);
      for (const y of Bc.floors) {
        if (y > line - STOREY + 0.01) continue;
        if (x > Bc.low[0] && x < Bc.low[1] && y < Bc.lowFrom) continue;
        B.box('trim', F, s - w, s + w, 0, o, y - 0.22, y, C.slab, { top: 'roof' });
        B.box('trim', F, s - w + 0.04, s + w - 0.04, o - 0.06, o - 0.03, y + 0.05, y + r - 0.05, C.glassRail);
        for (const e of [s - w + 0.02, s + w - 0.05]) B.box('trim', F, e, e + 0.03, 0, o - 0.06, y + 0.05, y + r - 0.05, C.glassRail);
        B.box('trim', F, s - w, s + w, o - 0.07, o - 0.01, y + r - 0.05, y + r, C.rail);
      }
    }
  }
}

// The machine room on the middle block's roof
function buildPlant(B) {
  const Pl = AMERON.plant, F = wallFrame(AMERON.street.a, AMERON.street.b), top = part('middle').top;
  B.box('trim', F, Pl.s[0], Pl.s[1], Pl.o[0], Pl.o[1], top, top + Pl.h, C.plant, { top: 'roof' });
  for (let s = Pl.s[0] + 0.6; s < Pl.s[1] - 0.3; s += 0.6) B.box('trim', F, s - 0.02, s + 0.02, Pl.o[1], Pl.o[1] + 0.03, top + 0.4, top + Pl.h - 0.3, C.slat);
}

/**
 * Builds the AMERON into `scene`. Returns { group, colliders }: the walls that stand outside OpenStreetMap's footprint
 * (whose walls are js/buildings.js'), at world heights (baseY set, so liftColliders leaves them be).
 */
export function buildAmeron(scene) {
  const root = new THREE.Group();
  root.name = 'AMERON';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'AMERON' }), M = materials();
  for (const p of AMERON.parts) buildPart(B, p);
  buildPromenade(B);
  buildEntrance(B);
  buildName(B);
  buildBalconies(B);
  buildPlant(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  const colliders = [];
  for (const { a, b, y0, y1 } of colliderWalls()) {
    const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2, hz = 0.2;
    const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } });
  }
  return { group: root, colliders };
}
