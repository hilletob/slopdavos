import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { groundHeight } from './terrain.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { BUENDNERHOF, balconiesOf, groundOutlines, isBalconyWall, isEntrance, onWall, outwardRing, part, pointInRing, wallFrame, wallStretches } from './buendnerhof-data.js';

export { BUENDNERHOF };

// The Hotel Bündnerhof rebuilt by hand (js/buendnerhof-data.js), standing in for its four swissBUILDINGS3D volumes,
// which the streamed tiles drew as white blocks with the town houses' windows: the six-storey main block in dusty
// pink-red plaster with a small window in a dark brown frame in every bay of every floor (drawn by the wall's material
// from its uv: metres along the wall from its middle, metres up the floors' grid), a dark eave round its flat roof; on
// the entrance front (north-north-east) the middle's doors under a canopy, two floors of wide windows and the name over
// them; dark timber balconies before balcony doors along the west end and the south-south-west faces; the two low wings
// before the east half and the glazed restaurant round the west end. On a slope the windows begin over the highest
// ground (or roof) before each stretch of a wall, a closed plinth under them. Six meshes: the walls with windows, the
// walls with balcony doors, the roofs, the glass, the trim (one vertex-coloured mesh) and the lettering (one canvas
// atlas). The hotel's hanging sign (js/shops.js) gives way to its own lettering.

excludeBuildings(BUENDNERHOF.exclude);
SHOP_EXCLUSIONS.add(BUENDNERHOF.osm);
// (the player's walls on the surveyed volumes, the hall round the west end among them, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(BUENDNERHOF.osm, groundOutlines());

const STOREY = BUENDNERHOF.storey, BAY = BUENDNERHOF.bay, WIN = BUENDNERHOF.win, DOOR = BUENDNERHOF.door;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.46, 0.25, 0.21], FRAME = [0.06, 0.036, 0.022], TIMBER = [0.15, 0.08, 0.04];
// A wall of pink plaster with a window `w` per bay and floor: a dark brown frame, a post between its two leaves and a
// transom over them (a balcony door: a post only), a pale sill under a window; a curtain drawn in some
function windowedWall(w, { sill, transom }, near, fine, glow, seed) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: w.half });
  const win = rect(w.half, w.lo, w.hi).mul(open);
  let bars = smoothstep(0.04, 0.025, abs(bu));
  if (transom) bars = bars.max(smoothstep(0.04, 0.025, abs(fv.sub(w.hi - 0.45))));
  const pane = rect(w.half - 0.07, w.lo + 0.07, w.hi - 0.07).mul(float(1).sub(bars.mul(near))).mul(open);
  const sl = sill ? rect(w.half + 0.07, w.lo - 0.08, w.lo).mul(open).mul(near) : float(0);
  // the plaster: weathered a little, a shade darker under the sills and along a floor's foot
  const stain = rect(w.half, w.lo - 0.7, w.lo - 0.08, 0.2).mul(open).mul(sill ? 0.06 : 0);
  const wall = mix(vec3(...PLASTER).mul(0.92), vec3(...PLASTER).mul(1.06), worldNoise(0.3))
    .mul(float(1).sub(stain)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)).add(seed));
  const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.86, id)));
  const blind = step(float(w.hi - 0.07).sub(drawn.mul(w.hi - w.lo - 0.14)), fv).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
  let c = mix(wall, vec3(0.5, 0.47, 0.44), sl);
  c = mix(c, vec3(...FRAME), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.5, 0.46, 0.4), blind);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(blind));
  m.roughnessNode = mix(float(0.92), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (a hotel: rooms lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), seed, { share: 0.4, late: 0.1, tone: twoTones([1.0, 0.74, 0.46], [0.96, 0.88, 0.74], 0.7) })
    .mul(pane).mul(mix(float(1), float(0.45), blind)).mul(glow.mul(1.1));
  return m;
}

function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.27, 0.26, 0.25], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.42, 0.24, 0.2], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35, { bay: BAY, half: WIN.half });
    M.loggia = SIMPLE_SKINS.windowed([0.42, 0.24, 0.2], STOREY, DOOR.lo / STOREY, DOOR.hi / STOREY, 0.9, 0.35, { bay: BAY, half: DOOR.half });
    M.glass = SIMPLE_SKINS.glow([0.08, 0.09, 0.1], 0.1, 0.8, [1.0, 0.82, 0.6], 0.35);
    return M;
  }
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  M.plaster = windowedWall(WIN, { sill: true, transom: true }, near, fine, glow, 31);
  M.loggia = windowedWall(DOOR, { sill: false, transom: false }, near, fine, glow, 47);
  // The restaurant's, the doors' and the wide windows' glass: dark brown mullions every 1.2 m, a transom 2.3 m up; at
  // night a faint glow behind most panes, a few lit
  {
    const U = uv().x, V = uv().y;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.2)).sub(0.5));
    const frame = smoothstep(0.45, 0.47, mu).max(smoothstep(0.05, 0.03, abs(V.sub(2.3)))).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.2)).mul(13.1).add(step(2.3, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.05, 0.06, 0.07), vec3(0.12, 0.13, 0.14), paneId), vec3(...FRAME), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.2), frame);
    m.emissiveNode = vec3(1.0, 0.82, 0.6).mul(float(1).sub(frame)).mul(mix(float(0.05), float(0.4), step(0.65, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The lettering: one canvas atlas -----------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 256];
export const ATLAS = {
  name: [0, 0, 1024, 150] // the name over the wide windows of the entrance front (8.2 × 1.2 m)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('name', (w, h) => {
    // (single letters set on the plaster, dark grey-brown, as in the photographs)
    g.fillStyle = '#4a3c36';
    g.font = '600 92px Georgia, "Times New Roman", serif';
    g.fillText('Hotel Bündnerhof', w / 2, h / 2 + 4, w - 40);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  frame: FRAME, timber: TIMBER, eave: [0.09, 0.055, 0.035], plinth: [0.24, 0.23, 0.22], slab: [0.36, 0.33, 0.31],
  canopy: [0.08, 0.05, 0.03], sill: [0.5, 0.47, 0.44], coping: [0.2, 0.2, 0.2]
};

// A strip of a wall from y0 to y1, s0 to s1 along it, into a wall bucket: windowed (its bays laid out from the wall's
// middle) or closed
function wallStrip(B, bucket, F, line, s0, s1, y0, y1, windows) {
  if (y1 - y0 < 0.01 || s1 - s0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const mid = F.len / 2, open = windows && F.len >= 2.4;
  const v = (y) => y - line + UP - (open ? 0 : CLOSED);
  B.quad(bucket, P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half: open ? mid : 0 });
}
// A pane of glass (uv: metres along it, metres up from its foot)
function pane(B, F, s0, s1, y0, y1, o = 0.02) {
  const P = (s, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  B.quad('glass', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[0, 0], [s1 - s0, 0], [s1 - s0, y1 - y0], [0, y1 - y0]]);
}
// A framed window by hand: the frame round it, a post every `post` m, the glass, a sill
function framed(B, F, s0, s1, y0, y1, post = 0) {
  B.box('trim', F, s0 - 0.08, s1 + 0.08, 0, 0.05, y0 - 0.08, y1 + 0.08, C.frame);
  pane(B, F, s0, s1, y0, y1, 0.06);
  if (post) for (let s = s0 + post; s < s1 - 0.2; s += post) B.box('trim', F, s - 0.04, s + 0.04, 0.05, 0.09, y0, y1, C.frame);
  B.box('trim', F, s0 - 0.12, s1 + 0.12, 0, 0.14, y0 - 0.14, y0 - 0.08, C.sill);
}
// The lowest ground along a stretch of a wall, half a metre out
function lowAlong(F, s0, s1) {
  let lo = Infinity;
  for (let s = s0; s <= s1 + 0.01; s += Math.max(0.5, (s1 - s0) / 4)) lo = Math.min(lo, groundHeight(...onWall(F, Math.min(s, s1), 0.5)));
  return lo;
}

// Does the corner at ring[i] stick out (convex)? (a step out along both walls' normals leaves the outline)
function convex(ring, i) {
  const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
  const F = wallFrame(a, b), G = wallFrame(b, c);
  return !pointInRing(ring, b[0] + (F.n[0] + G.n[0]) * 0.2, b[1] + (F.n[1] + G.n[1]) * 0.2);
}

// A volume: its walls from the base up to its roof (a closed plinth, the floors' windows, the band under the eave; the
// hall's glass), the eave round its roof, the roof
function buildPart(B, p) {
  const ring = outwardRing(p.ring), base = BUENDNERHOF.base, E = BUENDNERHOF.eave;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const balcony = isBalconyWall(a, b), bucket = balcony ? 'loggia' : 'plaster';
    if (p.glazed) buildHallWall(B, p, F);
    else if (isEntrance(a, b)) buildEntrance(B, p, F);
    else {
      for (const st of wallStretches(p, F, groundHeight, balcony ? DOOR : WIN)) {
        const fromY = Math.min(st.fromY, p.line);
        wallStrip(B, bucket, F, p.line, st.s0, st.s1, base, fromY, false);
        if (fromY < p.line) wallStrip(B, bucket, F, p.line, st.s0, st.s1, fromY, p.line, true);
        const lo = lowAlong(F, st.s0, st.s1);
        if (lo + 0.45 < fromY) B.box('trim', F, st.s0, st.s1, 0, 0.03, base, lo + 0.45, C.plinth);
      }
      wallStrip(B, bucket, F, p.line, 0, F.len, p.line, p.top, false);
    }
    // the eave: a dark board round the roof, out over the walls (closing round the corners that stick out)
    const e0 = convex(ring, i) ? -E.out : 0, e1 = convex(ring, (i + 1) % ring.length) ? E.out : 0;
    B.box('trim', F, e0, F.len + e1, -0.3, E.out, p.top - E.thick, p.top + 0.08, C.eave, { top: 'roof' });
  }
  flatRoof(B, ring, p.top);
}

// The hall's walls: the restaurant's glass over the highest ground before them, plaster under it and over it to the roof
// (a wall inside the main block stays plaster)
function buildHallWall(B, p, F) {
  const base = BUENDNERHOF.base;
  const [mx, mz] = onWall(F, F.len / 2, 0.5);
  const inside = pointInRing(part('main').ring, mx, mz);
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / 8)) hi = Math.max(hi, groundHeight(...onWall(F, Math.min(s, F.len), 0.5)));
  const g0 = Math.max(p.from, hi + 0.15), g1 = p.line - 0.3;
  if (inside || F.len < 1.5 || g1 - g0 < 2.0) {
    wallStrip(B, 'plaster', F, p.line, 0, F.len, base, p.top, false);
    return;
  }
  wallStrip(B, 'plaster', F, p.line, 0, F.len, base, g0, false);
  pane(B, F, 0, F.len, g0, g1);
  B.box('trim', F, 0, F.len, 0, 0.08, g1 - 0.1, g1 + 0.02, C.frame);
  B.box('trim', F, 0, F.len, 0, 0.1, g0 - 0.06, g0 + 0.06, C.frame);
  wallStrip(B, 'plaster', F, p.line, 0, F.len, g1, p.top, false);
  const lo = lowAlong(F, 0, F.len);
  if (lo + 0.45 < g0) B.box('trim', F, 0, F.len, 0, 0.03, base, lo + 0.45, C.plinth);
}

// The entrance front: the three lower floors by hand (the doors under a canopy and a window each side, two wide windows
// on each floor over them, the name), the floors over them by the wall's material
function buildEntrance(B, p, F) {
  const En = BUENDNERHOF.entrance, base = BUENDNERHOF.base, mid = F.len / 2, S = STOREY;
  const handTop = p.from + En.floors * S;
  wallStrip(B, 'plaster', F, p.line, 0, F.len, base, handTop, false);
  wallStrip(B, 'plaster', F, p.line, 0, F.len, handTop, p.line, true);
  wallStrip(B, 'plaster', F, p.line, 0, F.len, p.line, p.top, false);
  const lo = lowAlong(F, 0, F.len);
  B.box('trim', F, 0, F.len, 0, 0.03, base, lo + 0.3, C.plinth);
  // the doors on the path's level (their sill on the ground before them), the canopy over them
  const D = En.door, K = En.canopy;
  const y0 = groundHeight(...onWall(F, mid, 1.0)) + 0.05, y1 = y0 + D.h;
  B.box('trim', F, mid - D.w / 2 - 0.12, mid + D.w / 2 + 0.12, 0, 0.08, y0, y1 + 0.12, C.frame);
  pane(B, F, mid - D.w / 2, mid + D.w / 2, y0, y1, 0.09);
  B.box('trim', F, mid - 0.04, mid + 0.04, 0.09, 0.13, y0, y1, C.frame);
  for (const s of [mid - D.w / 4, mid + D.w / 4]) B.box('trim', F, s - 0.3, s + 0.3, 0.09, 0.15, y0 + 1.0, y0 + 1.05, C.sill); // (the push bars)
  B.box('trim', F, mid - D.w / 2 - 0.4, mid + D.w / 2 + 0.4, 0, 1.2, y0 - 0.25, y0, C.slab);
  const ky = Math.max(y1 + 0.35, p.from + 2.75);
  B.box('trim', F, mid - K.w / 2, mid + K.w / 2, 0, K.out, ky, ky + K.thick, C.canopy, { top: 'roof' });
  // the ground floor's windows each side
  const L = En.low;
  for (const s of [mid - L.at, mid + L.at]) framed(B, F, s - L.half, s + L.half, Math.max(p.from + L.lo, lo + 0.6), p.from + L.hi, L.half);
  // the wide windows on the two floors over the doors
  const W = En.wide;
  for (const f of W.floors) {
    const yf = p.from + f * S;
    for (const s of [mid - W.at, mid + W.at]) framed(B, F, s - W.half, s + W.half, yf + W.lo, yf + W.hi, (2 * W.half) / 3);
  }
  const N = En.name;
  B.decal(F, mid - N.w / 2, mid + N.w / 2, 0.05, N.y0, N.y1, 'name');
}

// The balconies: a slab, a closed rail of dark boards on three sides, dividers between the rooms' balconies
function buildBalconies(B) {
  const Bc = BUENDNERHOF.balconies, o = Bc.out, r = Bc.rail, p = part('main');
  for (const [a, b] of Bc.walls) {
    const ring = outwardRing(p.ring);
    // (the wall as the ring runs it, so that its outside is the frame's)
    const i = ring.findIndex((q, k) => { const n = ring[(k + 1) % ring.length]; return (Math.hypot(q[0] - a[0], q[1] - a[1]) < 0.06 && Math.hypot(n[0] - b[0], n[1] - b[1]) < 0.06) || (Math.hypot(q[0] - b[0], q[1] - b[1]) < 0.06 && Math.hypot(n[0] - a[0], n[1] - a[1]) < 0.06); });
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    for (const { s0, s1, y } of balconiesOf(p, F, groundHeight)) {
      B.box('trim', F, s0, s1, 0, o, y - 0.18, y, C.slab, { top: 'roof' });
      B.box('trim', F, s0, s1, o - 0.06, o, y, y + r, C.timber);
      B.box('trim', F, s0 - 0.02, s1 + 0.02, o - 0.1, o + 0.03, y + r - 0.02, y + r + 0.06, C.eave);
      for (const e of [s0, s1 - 0.06]) B.box('trim', F, e, e + 0.06, 0, o - 0.06, y, y + r, C.timber);
    }
  }
}

/**
 * Builds the Hotel Bündnerhof into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls
 * stand on the surveyed outlines, js/landmarks.js SURVEYED_FOOTPRINTS; the canopy has no posts, the balconies hang a
 * floor or more over the ground).
 */
export function buildBuendnerhof(scene) {
  const root = new THREE.Group();
  root.name = 'Hotel Bündnerhof';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['plaster', 'loggia'], name: 'Bündnerhof' }), M = materials();
  for (const p of BUENDNERHOF.parts) buildPart(B, p);
  buildBalconies(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
