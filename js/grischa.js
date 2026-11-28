import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { groundHeight } from './terrain.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { GRISCHA, canopyEdges, groundRings, onWall, outwardRing, part, wallFrame, wallKind } from './grischa-data.js';

export { GRISCHA };

// The Hotel Grischa rebuilt by hand (js/grischa-data.js), standing in for its three swissBUILDINGS3D volumes, which the
// streamed tiles drew as white blocks with the town houses' windows: the block of six floors in red plaster with a
// white-framed window in every bay of every floor (drawn by the wall's material from its uv: metres along the wall from
// its middle, metres up the floors' grid), the shops' glazing under a dark fascia on the car park, the stair tower with
// its glazed strip, the attic clad in dark panels, the brown eaves; on the Talstrasse the podium's two glazed floors
// under the cantilevered canopy with its timber soffit and rail, the name on the band between them, the doors; the
// timber balconies over it and on the south-south-west front; "GRISCHA HOTEL" and the star on the car park's front,
// "RESTAURANT" over the shops. Six meshes: the walls, the attic, the roofs, the glass, the trim (one vertex-coloured
// mesh) and the lettering (one canvas atlas). The hotel's hanging sign (js/shops.js) gives way to its own lettering.

excludeBuildings(GRISCHA.exclude);
SHOP_EXCLUSIONS.add(GRISCHA.osm);
// (the player's walls on the surveyed block and hall, not on OSM's outline; the canopy hangs over the pavement:
// js/landmarks.js)
SURVEYED_FOOTPRINTS.set(GRISCHA.osm, groundRings());

const STOREY = GRISCHA.storey, BAY = GRISCHA.bay, WIN = GRISCHA.win;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
// the second floor's foot: the canopy's and the hall's roof, where the windows begin over them
const SECOND = GRISCHA.firstFloor + STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.3, 0.064, 0.054], WHITE = [0.58, 0.58, 0.56], PANEL = [0.1, 0.1, 0.098], DARK = [0.05, 0.05, 0.052];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.26, 0.26, 0.255], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.27, 0.07, 0.06], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4, { bay: BAY, half: WIN.half });
    M.attic = SIMPLE_SKINS.windowed([0.1, 0.1, 0.1], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.85, 0.3, { bay: BAY, half: WIN.half });
    M.glass = SIMPLE_SKINS.glow([0.08, 0.1, 0.11], 0.1, 0.8, [1.0, 0.86, 0.66], 0.3);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(8, 28);
  const glow = nightGlow();
  // A window per bay and floor: a frame (`frameC`), a post between its two leaves, a sill under it; a curtain drawn in
  // some; lit here and there at night (a hotel: many rooms in the evening, fewer towards midnight)
  const windows = (wall, frameC, seed) => {
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const post = smoothstep(0.045, 0.028, abs(bu));
    const pane = rect(WIN.half - 0.08, WIN.lo + 0.08, WIN.hi - 0.08).mul(float(1).sub(post.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.07, WIN.lo - 0.08, WIN.lo).mul(open).mul(near);
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(0.95), step(0.85, id)));
    const curtain = step(float(WIN.hi - 0.08).sub(drawn.mul(WIN.hi - WIN.lo - 0.16)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.075, 0.09, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(...WHITE).mul(0.85), sill);
    c = mix(c, vec3(...frameC), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.52, 0.48, 0.42), curtain);
    const shiny = pane.mul(float(1).sub(curtain));
    const emissive = litWindow(bay, storey.add(half.mul(3.3)), seed, { share: 0.5, late: 0.14, tone: twoTones([1.0, 0.75, 0.46], [0.96, 0.9, 0.78], 0.7) })
      .mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.1));
    return { c, shiny, emissive, fv };
  };
  // Red plaster, a little weathered, a shade darker under the sills; white frames
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const wall = mix(vec3(...PLASTER).mul(0.92), vec3(...PLASTER).mul(1.07), worldNoise(0.3));
    const { c, shiny, emissive } = windows(wall, WHITE, 37);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    m.emissiveNode = emissive;
    M.plaster = m;
  }
  // The attic: dark panels with joints every 1.3 m (fading out with distance), dark frames
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.15 });
    const joint = smoothstep(0.47, 0.49, abs(fract(U.div(1.3)).sub(0.5))).mul(fine);
    const wall = mix(vec3(...PANEL).mul(0.9), vec3(...PANEL).mul(1.1), worldNoise(0.2)).mul(float(1).sub(joint.mul(0.5)));
    const { c, shiny, emissive } = windows(wall, DARK, 53);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.7), float(0.12), shiny);
    m.metalnessNode = mix(float(0.15), float(0.55), shiny);
    m.emissiveNode = emissive;
    M.attic = m;
  }
  // The shops' and the podium's glazing: dark mullions every 1.5 m, a transom 2.6 m up; at night the shops are shut, a
  // faint glow behind most panes, the lights behind a few
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.5)).sub(0.5));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.05, 0.03, abs(V.sub(2.6)))).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.5)).mul(13.1).add(step(2.6, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.045, 0.06, 0.07), vec3(0.12, 0.14, 0.15), paneId), vec3(...DARK), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.3), frame);
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(float(1).sub(frame)).mul(mix(float(0.03), float(0.3), step(0.75, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The lettering: one canvas atlas -----------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  name: [0, 0, 1024, 240], // "GRISCHA HOTEL" and the star on the car park's front (5.3 × 1.24 m)
  restaurant: [0, 248, 512, 90], // the board over the shops (3.4 × 0.6 m)
  street: [0, 346, 1024, 140] // "GRISCHA" on the band under the canopy (5.8 × 0.79 m)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('name', (w) => {
    g.fillStyle = '#ece9e2';
    // the star over the name's middle
    const star = (cx, cy, r) => {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.42 : r;
        g.lineTo(cx + q * Math.cos(a), cy + q * Math.sin(a));
      }
      g.closePath(); g.fill();
    };
    star(w / 2, 26, 22);
    g.font = '600 132px Georgia, "Times New Roman", serif';
    g.fillText('G R I S C H A', w / 2, 118, w - 60);
    g.font = '600 44px Helvetica, Arial, sans-serif';
    g.fillText('H O T E L', w / 2, 210, w - 300);
  });
  cell('restaurant', (w, h) => {
    g.fillStyle = '#1a1a1c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ece9e2';
    g.font = '600 52px Helvetica, Arial, sans-serif';
    g.fillText('RESTAURANT', w / 2, h / 2 + 2, w - 40);
  });
  cell('street', (w, h) => {
    g.fillStyle = '#ece9e2';
    g.font = '500 104px Helvetica, Arial, sans-serif';
    g.fillText('G R I S C H A', w / 2, h / 2 + 4, w - 80);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  plaster: PLASTER, white: WHITE, dark: DARK, fascia: [0.04, 0.04, 0.043], eave: [0.14, 0.08, 0.045], panel: PANEL,
  timber: [0.3, 0.16, 0.07], soffit: [0.34, 0.2, 0.1], edge: [0.22, 0.22, 0.215], slab: [0.36, 0.35, 0.34], strip: [0.04, 0.055, 0.065],
  coping: [0.2, 0.2, 0.2], step: [0.3, 0.3, 0.29]
};

// A strip of a wall from y0 to y1 into `bucket` (the plaster or the attic): windowed (its bays laid out from the wall's
// middle) or closed; `line` the floors' grid's top floor's top
function wall(B, bucket, F, line, y0, y1, windows) {
  if (y1 - y0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const mid = F.len / 2, open = windows && F.len >= 2.4;
  const v = (y) => y - line + UP - (open ? 0 : CLOSED);
  B.quad(bucket, P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half: open ? mid : 0 });
}
// A strip of glazing from y0 to y1 (uv: metres along the wall, metres up from its foot)
function glass(B, F, y0, y1) {
  if (y1 - y0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  B.quad('glass', P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), [[0, 0], [F.len, 0], [F.len, y1 - y0], [0, y1 - y0]]);
}
// The highest ground along a wall, half a metre out of it
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}
// A flat underside over an outline at y, facing down, into the trim (the canopy's soffit)
function ceiling(B, ring, y, colour) {
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = [ring[i], ring[j], ring[k]].map((q) => [q[0], y, q[1]]);
    const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
    const t = up ? [p[0], p[2], p[1]] : p;
    B.tri('trim', t[0], t[1], t[2], undefined, { colour });
  }
}

// The block: per wall the ground floor (the shops' glazing, the podium's fronts, a plinth), the floors' windows, the
// parapet; the eaves; the roof
function buildBlock(B) {
  const p = part('block'), ring = outwardRing(p.ring), base = GRISCHA.base, S = GRISCHA.shops, St = GRISCHA.street;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const kind = wallKind(p, a, b);
    const foot = groundAlong(F) + 0.3;
    if (kind === 'tower') { wall(B, 'plaster', F, p.line, base, p.top, false); continue; }
    if (kind === 'shop') {
      wall(B, 'plaster', F, p.line, base, foot, false);
      glass(B, F, foot, S.glass);
      wall(B, 'plaster', F, p.line, S.glass, GRISCHA.firstFloor, false);
      B.box('trim', F, 0, F.len, 0, 0.12, S.fascia[0], S.fascia[1], C.fascia);
      wall(B, 'plaster', F, p.line, GRISCHA.firstFloor, p.line, true);
    } else if (kind === 'street') {
      wall(B, 'plaster', F, p.line, base, foot, false);
      glass(B, F, foot, St.glassTop);
      B.box('trim', F, 0, F.len, 0, 0.12, St.band[0], St.band[1], C.fascia);
      wall(B, 'plaster', F, p.line, St.glassTop, SECOND, false);
      wall(B, 'plaster', F, p.line, SECOND, p.line, true);
    } else if (kind === 'behindHall') {
      wall(B, 'plaster', F, p.line, base, SECOND, false);
      wall(B, 'plaster', F, p.line, SECOND, p.line, true);
    } else {
      // (the windows begin on the lowest floor whose sills stand over the highest ground along the wall: under it a
      // closed plinth, no panes cut by the ground)
      let from = GRISCHA.firstFloor;
      if (from - STOREY + WIN.lo > foot) from -= STOREY;
      wall(B, 'plaster', F, p.line, base, from, false);
      wall(B, 'plaster', F, p.line, from, p.line, true);
    }
    wall(B, 'plaster', F, p.line, p.line, p.top, false);
    const E = GRISCHA.eaves.block;
    B.box('trim', F, -E.out, F.len + E.out, -0.2, E.out, E.y0, E.y1, C.eave, { top: 'roof' });
  }
  flatRoof(B, ring, p.top);
}

// The attic over the block's roof: dark panels with a window per bay, the tower's head in red plaster; its eaves
function buildAttic(B) {
  const p = part('attic'), ring = outwardRing(p.ring);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    if (wallKind(p, a, b) === 'tower') {
      wall(B, 'plaster', F, p.line, p.from, p.top, false);
      B.box('trim', F, -0.1, F.len + 0.1, -0.2, 0.15, p.top - 0.25, p.top + 0.12, C.coping, { top: 'roof' });
      continue;
    }
    wall(B, 'attic', F, p.line, p.from, p.line, true);
    wall(B, 'attic', F, p.line, p.line, p.top, false);
    const E = GRISCHA.eaves.attic;
    B.box('trim', F, -E.out, F.len + E.out, -0.2, E.out, E.y0, E.y1, C.dark, { top: 'roof' });
  }
  flatRoof(B, ring, p.top);
}

// The stair tower's glazed strip up its front, from the ground floor to under its head
function buildTower(B) {
  const T = GRISCHA.tower, [a, b] = T.faces[1], F = wallFrame(a, b), S = T.strip, mid = F.len / 2;
  B.box('trim', F, mid - S.half - 0.07, mid + S.half + 0.07, 0, 0.05, S.y0 - 0.07, S.y1 + 0.07, C.dark);
  B.box('trim', F, mid - S.half, mid + S.half, 0.05, 0.08, S.y0, S.y1, C.strip);
  // (a rail at every landing, half a floor up)
  for (let y = GRISCHA.firstFloor + STOREY / 2; y < S.y1 - 0.4; y += STOREY) B.box('trim', F, mid - S.half, mid + S.half, 0.08, 0.11, y - 0.04, y + 0.04, C.dark);
}

// The hall on the south-south-west: its front under the canopy glazed over both floors with the band, its west end
// glazed, its wall towards the neighbour closed; the coping, the roof
function buildHall(B) {
  const p = part('hall'), ring = outwardRing(p.ring), base = GRISCHA.base, St = GRISCHA.street;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const kind = wallKind(p, a, b), foot = groundAlong(F) + 0.3;
    if (kind === 'street' || kind === 'glazed') {
      wall(B, 'plaster', F, p.line, base, foot, false);
      glass(B, F, foot, St.glassTop);
      B.box('trim', F, 0, F.len, 0, 0.12, St.band[0], St.band[1], C.fascia);
      wall(B, 'plaster', F, p.line, St.glassTop, p.top, false);
    } else wall(B, 'plaster', F, p.line, base, p.top, false);
    if (kind !== 'street') B.box('trim', F, -0.05, F.len + 0.05, -0.25, 0.06, p.top - 0.12, p.top + 0.12, C.coping, { top: 'roof' });
  }
  flatRoof(B, ring, p.top);
}

// The canopy over the Talstrasse's pavement: its top (the podium's roof), the timber soffit, the grey edge, the timber
// rail along it
function buildCanopy(B) {
  const K = GRISCHA.canopy, ring = outwardRing(K.ring);
  flatRoof(B, ring, K.top);
  ceiling(B, ring, K.under, C.soffit);
  for (const [a, b] of canopyEdges()) {
    const F = wallFrame(a, b);
    B.box('trim', F, -0.02, F.len + 0.02, -0.22, 0.02, K.under - 0.02, K.top + 0.1, C.edge, { top: 'roof' });
    B.box('trim', F, 0, F.len, -0.34, -0.24, K.top, K.top + K.rail - 0.06, C.timber);
    B.box('trim', F, 0, F.len, -0.37, -0.21, K.top + K.rail - 0.06, K.top + K.rail, C.timber);
  }
}

// The fronts on the Talstrasse and the car park: the names, the restaurant's board, the doors
function buildFronts(B) {
  const S = GRISCHA.shops, St = GRISCHA.street;
  {
    const [a, b] = S.walls[0], F = wallFrame(a, b), n = S.name, r = S.restaurant;
    B.decal(F, n.s - n.w / 2, n.s + n.w / 2, 0.04, n.y0, n.y1, 'name');
    B.decal(F, r.s - r.w / 2, r.s + r.w / 2, 0.14, r.y0, r.y1, 'restaurant');
  }
  {
    const [a, b] = St.walls[0], F = wallFrame(a, b), n = St.name, D = St.doors, foot = groundAlong(F) + 0.3;
    B.decal(F, n.s, n.s + n.w, 0.14, n.y0, n.y1, 'street');
    // the doors: a dark frame, two leaves, a mat of stone before them
    const y1 = foot + 2.5;
    for (const s of [D.s - D.w / 2, D.s, D.s + D.w / 2]) B.box('trim', F, s - 0.06, s + 0.06, 0, 0.1, foot, y1, C.dark);
    B.box('trim', F, D.s - D.w / 2 - 0.06, D.s + D.w / 2 + 0.06, 0, 0.1, y1 - 0.12, y1, C.dark);
    B.box('trim', F, D.s - D.w / 2 - 0.4, D.s + D.w / 2 + 0.4, 0, 1.2, foot - 0.6, foot - 0.22, C.step);
  }
}

// The balconies: a slab and a timber parapet along the Talstrasse's front and the south-south-west front at the third
// to the fifth floor
function buildBalconies(B) {
  const Bc = GRISCHA.balconies, o = Bc.out, r = Bc.rail;
  for (const [a, b] of Bc.walls) {
    const F = wallFrame(a, b), s0 = Bc.from, s1 = F.len - Bc.from;
    for (const y of Bc.floors) {
      B.box('trim', F, s0, s1, 0, o, y - 0.2, y, C.slab, { top: 'roof' });
      B.box('trim', F, s0, s1, o - 0.08, o, y, y + r, C.timber);
      for (const s of [s0, s1 - 0.08]) B.box('trim', F, s, s + 0.08, 0, o - 0.08, y, y + r, C.timber);
    }
  }
}

/**
 * Builds the Hotel Grischa into `scene`. Returns { group, colliders }: none of its own (the player's walls stand on the
 * block's and the hall's surveyed outlines, js/landmarks.js; the canopy has no posts).
 */
export function buildGrischa(scene) {
  const root = new THREE.Group();
  root.name = 'Grischa';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['plaster', 'attic'], name: 'Grischa' }), M = materials();
  buildBlock(B);
  buildAttic(B);
  buildTower(B);
  buildHall(B);
  buildCanopy(B);
  buildFronts(B);
  buildBalconies(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
