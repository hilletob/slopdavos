import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { HOFMAENNER, coverAt, groundOutlines, onWall, outwardRing, part, wallFrame, wallStretches } from './hofmaenner-data.js';

export { HOFMAENNER };

// The house of Sport Hofmänner on the Mattastrasse rebuilt by hand (js/hofmaenner-data.js), standing in for its
// swissBUILDINGS3D volume, which the streamed tiles drew as one white block with the town houses' windows: the tower in
// ochre plaster with a window in a dark brown frame in every bay of its five floors (drawn by the wall's material from
// its uv: metres along the wall from its middle, metres up the floors' grid), its loggias' dark timber backs and rails,
// the balconies on its corners, the dark eaves band and the dark timber attic over it; the low wings round it in dark
// brown timber with the shops' glazing along the ground and a tall closed band over it; Sport Hofmänner's doors under a
// canopy on the Mattastrasse with its board, the entrance from the car park under a canopy in the tower's recess, the
// ARGO shops' boards. Six meshes: the plaster, the timber, the glass, the roofs, the trim (one vertex-coloured mesh) and
// the boards (one canvas atlas). The shop's generic sign (js/shops.js) gives way to its board here.

excludeBuildings([HOFMAENNER.exclude]);
SHOP_EXCLUSIONS.add(HOFMAENNER.shop);
// (the player's walls on the surveyed volumes standing on the ground, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(HOFMAENNER.osm, groundOutlines());

const STOREY = HOFMAENNER.storey, BAY = HOFMAENNER.bay, WIN = HOFMAENNER.win;
// v of a wall: metres up the floors' grid, a floor's foot at every multiple of STOREY (the tower's `line`, or a timber
// floor's foot, at 40 of them); closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const OCHRE = [0.42, 0.25, 0.08], TIMBER = [0.085, 0.05, 0.03], FRAME = [0.05, 0.03, 0.018];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.2, 0.19, 0.18], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.36, 0.22, 0.08], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35, { bay: BAY, half: WIN.half });
    M.timber = SIMPLE_SKINS.windowed([0.08, 0.05, 0.03], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.85, 0.3, { bay: BAY, half: WIN.half });
    M.glass = SIMPLE_SKINS.glow([0.06, 0.07, 0.075], 0.1, 0.8, [1.0, 0.86, 0.66], 0.08);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(8, 28);
  const glow = nightGlow();
  const grid = () => windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
  const glassC = mix(vec3(0.02, 0.024, 0.028), vec3(0.07, 0.08, 0.09), worldNoise(0.07));
  // A window per bay and floor: a dark frame, a post in its middle, a curtain drawn in some; lit here and there at night
  const windowOf = (g, seed, share) => {
    const { half, bay, bu, storey, fv, open, rect } = g;
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const post = smoothstep(0.04, 0.025, abs(bu));
    const pane = rect(WIN.half - 0.08, WIN.lo + 0.08, WIN.hi - 0.08).mul(float(1).sub(post.mul(near))).mul(open);
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)).add(seed));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(0.95), step(0.85, id)));
    const curtain = step(float(WIN.hi - 0.08).sub(drawn.mul(WIN.hi - WIN.lo - 0.16)), fv).mul(pane).mul(near);
    const lit = litWindow(bay, storey.add(half.mul(3.3)), seed, { share, late: 0.1, tone: twoTones([1.0, 0.74, 0.45], [0.92, 0.88, 0.8], 0.75) })
      .mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.1));
    return { win, pane, curtain, lit, fv, open, rect };
  };
  // The tower's ochre plaster: a little weathering, a dark frame round every window, a light sill under it
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const w = windowOf(grid(), 7, 0.45);
    const sill = w.rect(WIN.half + 0.07, WIN.lo - 0.08, WIN.lo).mul(w.open).mul(near);
    const wall = mix(vec3(...OCHRE).mul(0.92), vec3(...OCHRE).mul(1.06), worldNoise(0.3));
    let c = mix(wall, vec3(0.3, 0.28, 0.25), sill);
    c = mix(c, vec3(...FRAME), w.win);
    c = mix(c, glassC, w.pane);
    c = mix(c, vec3(0.45, 0.42, 0.38), w.curtain);
    m.colorNode = c;
    const shiny = w.pane.mul(float(1).sub(w.curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    m.emissiveNode = w.lit;
    M.plaster = m;
  }
  // The dark brown timber: vertical boards (fading out with distance), the same windows in a lighter brown frame
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    const w = windowOf(grid(), 19, 0.35);
    const joint = smoothstep(0.43, 0.48, abs(fract(U.div(0.14)).sub(0.5))).mul(fine);
    const board = mix(vec3(...TIMBER).mul(0.85), vec3(...TIMBER).mul(1.15), hash(floor(U.div(0.14)).mul(17.3)).mul(fine).add(float(0.5).mul(float(1).sub(fine))));
    let c = board.mul(float(1).sub(joint.mul(0.35)));
    c = mix(c, vec3(0.16, 0.1, 0.06), w.win);
    c = mix(c, glassC, w.pane);
    c = mix(c, vec3(0.42, 0.39, 0.35), w.curtain);
    m.colorNode = c;
    const shiny = w.pane.mul(float(1).sub(w.curtain));
    m.roughnessNode = mix(float(0.85), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    m.emissiveNode = w.lit;
    M.timber = m;
  }
  // The shops' glazing: dark mullions every 1.5 m, a transom 2.5 m up; shut at night: a faint glow, a few panes lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.5)).sub(0.5));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.05, 0.03, abs(V.sub(2.5)))).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.5)).mul(13.1).add(step(2.5, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.045, 0.055, 0.065), vec3(0.11, 0.12, 0.13), paneId), vec3(...FRAME), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.3), frame);
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(float(1).sub(frame)).mul(mix(float(0.03), float(0.3), step(0.8, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The boards: one canvas atlas ----------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 256];
export const ATLAS = {
  hof: [0, 0, 640, 128], // Sport Hofmänner's board over its doors (4.4 × 0.9 m)
  lada: [648, 0, 376, 96], // ARGOlada on the tower's foot (2.9 × 0.75 m)
  wasch: [0, 136, 620, 96] // ARGOwäscherei on the south-west wing (4.4 × 0.75 m)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textBaseline = 'middle';
  cell('hof', (w, h) => {
    g.fillStyle = '#1b4f8a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.textAlign = 'center';
    g.font = '700 24px Helvetica, Arial, sans-serif';
    g.fillText('S P O R T', w / 2, 24);
    g.font = '800 72px Helvetica, Arial, sans-serif';
    g.fillText('Hofmänner', w / 2, 80, w - 40);
  });
  // (the ARGO shops' boards: white, the name in dark blue with the shop's word after it)
  const argo = (w, h, word, colour) => {
    g.fillStyle = '#eceff1'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7d8790'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.font = '700 54px Helvetica, Arial, sans-serif'; g.textAlign = 'left';
    const a = g.measureText('ARGO').width, b = g.measureText(word).width, x = (w - a - b) / 2;
    g.fillStyle = '#2d3e5c'; g.fillText('ARGO', x, h / 2);
    g.fillStyle = colour; g.fillText(word, x + a, h / 2);
  };
  cell('lada', (w, h) => argo(w, h, 'lada', '#b5523b'));
  cell('wasch', (w, h) => argo(w, h, 'wäscherei', '#2d6c9c'));
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  eaves: [0.07, 0.042, 0.026], coping: [0.11, 0.07, 0.045], ledge: [0.16, 0.15, 0.14], slab: [0.3, 0.28, 0.25], rail: [0.075, 0.045, 0.028],
  frame: FRAME, canopy: [0.06, 0.06, 0.065], blue: [0.02, 0.08, 0.22], step: [0.28, 0.28, 0.27]
};

// A wall's quad from y0 to y1 between s0 and s1 into `bucket`: windowed (a floor's foot at `foot`, the grid's line) or
// closed
function wallQuad(B, bucket, F, s0, s1, y0, y1, foot, windows) {
  if (y1 - y0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const h = (s1 - s0) / 2;
  const v = (y) => y - foot + UP - (windows ? 0 : CLOSED);
  B.quad(bucket, P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[-h, v(y0)], [h, v(y0)], [h, v(y1)], [-h, v(y1)]], { half: windows ? h : 0 });
}
// A strip of glazing from y0 to y1 (uv: metres along the wall, metres up from its foot)
function glass(B, F, s0, s1, y0, y1) {
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  B.quad('glass', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[s0, 0], [s1, 0], [s1, y1 - y0], [s0, y1 - y0]]);
}
// The highest ground along a stretch, half a metre out of it
function groundAlong(F, s0, s1) {
  let hi = -Infinity;
  for (let s = s0; s <= s1 + 0.01; s += Math.max(0.5, (s1 - s0) / Math.ceil((s1 - s0) / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

// The loggias' back walls (dark timber): is a → b one of them?
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
const isLoggia = (a, b) => HOFMAENNER.balconies.some((l) => l.wall && near(l.a, a) && near(l.b, b));

// A volume: its walls where they stand free (the shops' glazing on the ground, the timber band, the tower's floors),
// the eaves or the coping round its roof, the roof
function buildPart(B, p) {
  const ring = outwardRing(p.ring);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    for (const st of wallStretches(p, a, b)) {
      const { from: s0, to: s1, y0 } = st, len = s1 - s0, windows = len >= 2.4;
      let free = y0;
      if (st.ground) {
        // the shops' glazing from a little over the highest ground along it, a closed plinth under it
        const g = groundAlong(F, s0, s1) + 0.3, top = p.kind === 'tower' ? HOFMAENNER.tower.glass : HOFMAENNER.low.glass;
        wallQuad(B, 'timber', F, s0, s1, y0, g, 0, false);
        if (len >= 1.5) {
          glass(B, F, s0, s1, g, top);
          B.box('trim', F, s0, s1, 0, 0.2, top - 0.05, top + 0.08, C.ledge);
        } else wallQuad(B, 'timber', F, s0, s1, g, top, 0, false);
        free = top;
      }
      if (p.kind === 'low') wallQuad(B, 'timber', F, s0, s1, free, p.top, 0, false);
      else if (p.kind === 'tower') {
        if (st.ground) { wallQuad(B, 'timber', F, s0, s1, free, HOFMAENNER.tower.foot, 0, false); free = HOFMAENNER.tower.foot; }
        wallQuad(B, isLoggia(a, b) ? 'timber' : 'plaster', F, s0, s1, free, p.top, p.line, windows);
      } else if (p.kind === 'head') wallQuad(B, 'plaster', F, s0, s1, free, p.top, 0, false);
      else wallQuad(B, 'timber', F, s0, s1, free, p.top, y0, windows);
      // the eaves (the tower's and the attic's deep and dark), the wings' coping
      if (p.kind === 'tower' || p.kind === 'attic') B.box('trim', F, s0 - 0.05, s1 + 0.05, -0.3, 0.7, p.top - 0.5, p.top + 0.1, C.eaves, { top: 'roof' });
      else B.box('trim', F, s0 - 0.03, s1 + 0.03, -0.2, 0.15, p.top - 0.3, p.top + 0.12, C.coping, { top: 'roof' });
    }
  }
  flatRoof(B, ring, p.kind === 'tower' || p.kind === 'attic' ? p.top + 0.1 : p.top + 0.12);
}

/** The tower floors a balcony stands at: the floors' feet free of the wings' roofs along it (and well over the ground) */
export function balconyFloors(l) {
  const tower = part('tower'), F = wallFrame(l.a, l.b);
  let cover = -Infinity, ground = -Infinity;
  for (let s = l.s0; s <= l.s1 + 0.01; s += 0.5) {
    const [x, z] = onWall(F, Math.min(s, l.s1), 0.3);
    const c = coverAt(tower, x, z);
    if (c !== null) cover = Math.max(cover, c);
    const [gx, gz] = onWall(F, Math.min(s, l.s1), l.out);
    ground = Math.max(ground, groundHeight(gx, gz));
  }
  const out = [];
  for (let k = 5; k >= 1; k--) {
    const y = tower.line - k * STOREY;
    if (y >= cover + 0.3 && y >= ground + 3.5) out.push(y);
  }
  return out;
}

// The tower's balconies: a slab and a dark timber rail at the foot of every free floor; the projecting ones with rails
// at their ends too
function buildBalconies(B) {
  const R = HOFMAENNER.rail;
  for (const l of HOFMAENNER.balconies) {
    const F = wallFrame(l.a, l.b);
    for (const y of balconyFloors(l)) {
      B.box('trim', F, l.s0, l.s1, 0, l.out, y - 0.2, y, C.slab, { top: 'roof' });
      B.box('trim', F, l.s0, l.s1, l.out - 0.07, l.out, y, y + R, C.rail);
      if (!l.wall) for (const s of [l.s0, l.s1 - 0.07]) B.box('trim', F, s, s + 0.07, 0, l.out - 0.07, y, y + R, C.rail);
    }
  }
}

// Sport Hofmänner's entrance on the Mattastrasse: the doors' frames, the step, the canopy, the board over them
function buildEntrance(B) {
  const E = HOFMAENNER.entrance, F = wallFrame(E.a, E.b), K = E.canopy, Bd = E.board;
  const foot = groundAlong(F, E.s - E.w / 2, E.s + E.w / 2) + 0.3;
  for (const s of [E.s - E.w / 2, E.s, E.s + E.w / 2]) B.box('trim', F, s - 0.06, s + 0.06, 0, 0.12, foot, E.y1, C.frame);
  B.box('trim', F, E.s - E.w / 2 - 0.06, E.s + E.w / 2 + 0.06, 0, 0.12, E.y1 - 0.12, E.y1, C.frame);
  B.box('trim', F, E.s - E.w / 2 - 0.4, E.s + E.w / 2 + 0.4, 0, 0.9, foot - 1.0, foot, C.step);
  B.box('trim', F, K.s0, K.s1, 0, K.out, K.y, K.y + 0.2, C.blue, { top: 'roof' });
  B.box('trim', F, Bd.s - Bd.w / 2 - 0.05, Bd.s + Bd.w / 2 + 0.05, 0, 0.06, Bd.y0 - 0.05, Bd.y1 + 0.05, C.frame);
  B.decal(F, Bd.s - Bd.w / 2, Bd.s + Bd.w / 2, 0.07, Bd.y0, Bd.y1, 'hof');
}

// The entrance from the car park: a canopy over the tower's recess; the ARGO shops' boards
function buildCarPark(B) {
  const Pc = HOFMAENNER.porch, F = wallFrame(Pc.a, Pc.b), K = Pc.canopy;
  B.box('trim', F, K.s0, K.s1, 0, K.out, K.y, K.y + 0.22, C.canopy, { top: 'roof' });
  for (const b of HOFMAENNER.boards) {
    const W = wallFrame(b.a, b.b);
    B.box('trim', W, b.s - b.w / 2 - 0.04, b.s + b.w / 2 + 0.04, 0, 0.05, b.y0 - 0.04, b.y1 + 0.04, C.frame);
    B.decal(W, b.s - b.w / 2, b.s + b.w / 2, 0.06, b.y0, b.y1, b.key);
  }
}

/**
 * Builds the house of Sport Hofmänner into `scene`. Returns { group, colliders } (none of its own: the player's walls
 * stand on its surveyed outlines, js/landmarks.js, and its canopies hang free over the ground).
 */
export function buildHofmaenner(scene) {
  const root = new THREE.Group();
  root.name = 'Hofmänner';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['plaster', 'timber'], name: 'Hofmänner' }), M = materials();
  for (const p of HOFMAENNER.parts) buildPart(B, p);
  buildBalconies(B);
  buildEntrance(B);
  buildCarPark(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
