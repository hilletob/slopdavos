import * as THREE from 'three/webgpu';
import { abs, float, mix, positionWorld, smoothstep, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { HOTEL_ALTE_POST, firstWindowFloor, groundOutlines, isShared, isTimber, onWall, outwardRing, wallFrame } from './hotel-alte-post-data.js';

export { HOTEL_ALTE_POST };

// The Hotel Alte Post rebuilt by hand (js/hotel-alte-post-data.js), standing in for its swissBUILDINGS3D volume, which
// the streamed tiles drew as a white block with the town houses' windows: the surveyed volumes, the long house along
// the lane and the north-east block in pink plaster with a window in a white frame per bay and floor (drawn by the
// wall's material from its uv: metres along the wall from its middle, metres up the floors' grid), white curtains behind
// the panes, white pilasters at the corners, a white band round it, a pediment over a window of the narrow front; the
// wing at its south end in dark timber boards with wide white-framed windows; the dark eaves round the flat roofs, two
// chimneys, the gilt letters ALTE POST on their steel frame over the wing, the entrance on the lane with its canopy and
// the name over the door. The windows begin over the highest ground along each wall, a closed plinth under them. Five
// meshes: the two walls, the roofs, the trim (one vertex-coloured mesh) and the lettering (one canvas atlas). The hotel's
// hanging sign (js/shops.js) gives way to its own.

excludeBuildings([HOTEL_ALTE_POST.exclude]);
SHOP_EXCLUSIONS.add(HOTEL_ALTE_POST.osm);
// (the player's walls on the surveyed volumes, not on OSM's outline, which stood up to 1.1 m off: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(HOTEL_ALTE_POST.osm, groundOutlines());

const H = HOTEL_ALTE_POST, STOREY = H.storey, LINE = H.line;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (LINE at 40 of them); closed
// stretches carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PINK = [0.55, 0.3, 0.27], WHITE = [0.6, 0.6, 0.575], TIMBER = [0.11, 0.065, 0.038];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.28, 0.27, 0.26], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    const w = (rgb, W) => SIMPLE_SKINS.windowed(rgb, STOREY, W.lo / STOREY, W.hi / STOREY, 0.9, 0.35);
    M.pink = w([0.5, 0.29, 0.26], H.win.pink);
    M.timber = w([0.13, 0.08, 0.05], H.win.timber);
    return M;
  }
  const near = fade(140, 420), fine = fade(25, 80), finest = fade(8, 28);
  const glow = nightGlow();
  const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
  const curtainC = vec3(0.5, 0.5, 0.48);
  // A window in its bay: the white frame round it, a sash with a post in the middle, the curtains drawn to its sides;
  // the rooms lit here and there in the evening, fewer towards midnight (the curtains glow a little)
  const windowOf = (W, bay, seed) => {
    const { half, bay: b, bu, storey, fv, open, rect } = windowGrid({ bay, storey: STOREY, closed: CLOSED, winHalf: W.half });
    const frame = rect(W.half + 0.1, W.lo - 0.1, W.hi + 0.1).mul(open);
    const sill = rect(W.half + 0.16, W.lo - 0.16, W.lo - 0.06).mul(open).mul(near);
    const post = smoothstep(0.04, 0.025, abs(bu)).mul(near);
    const pane = rect(W.half - 0.06, W.lo + 0.06, W.hi - 0.06).mul(float(1).sub(post)).mul(open);
    const curtain = smoothstep(W.half - 0.36, W.half - 0.33, abs(bu)).mul(pane).mul(near.mul(0.8).add(0.2));
    const lit = litWindow(b, storey.add(half.mul(3.3)), seed, { share: 0.42, late: 0.1, tone: twoTones([1.0, 0.72, 0.42], [1.0, 0.86, 0.64], 0.6) });
    return { frame, sill, pane, curtain, fv, emissive: lit.mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1)) };
  };
  const paint = (m, wall, w) => {
    let c = mix(wall, vec3(...WHITE), w.frame.max(w.sill));
    c = mix(c, glassC, w.pane);
    c = mix(c, curtainC, w.curtain);
    m.colorNode = c;
    const shiny = w.pane.mul(float(1).sub(w.curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    m.emissiveNode = w.emissive;
  };
  // The pink plaster: a little weathering, a shade darker at the foot of a floor
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const w = windowOf(H.win.pink, H.bay.pink, 71);
    const wall = mix(vec3(...PINK).mul(0.92), vec3(...PINK).mul(1.05), worldNoise(0.3)).mul(float(1).sub(smoothstep(0.03, 0.012, w.fv).mul(fine).mul(0.05)));
    paint(m, wall, w);
    M.pink = m;
  }
  // The timber wing: dark boards laid across, their joints fading out by 28 m
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const w = windowOf(H.win.timber, H.bay.timber, 79);
    const joint = smoothstep(0.43, 0.48, abs(positionWorld.y.div(0.19).fract().sub(0.5))).mul(finest);
    const wall = mix(vec3(...TIMBER).mul(0.85), vec3(...TIMBER).mul(1.2), worldNoise(0.8)).mul(float(1).sub(joint.mul(0.35)));
    paint(m, wall, w);
    M.timber = m;
  }
  return M;
}

// --- The lettering: one canvas atlas -------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 256];
export const ATLAS = {
  sign: [0, 0, 1024, 128], // the gilt letters on the roof (9.4 × 1.1 m)
  board: [0, 132, 512, 100] // the name over the door (2.6 × 0.5 m)
};
const GILT = '#f2c230';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // the standing letters: bold gilt capitals, a thin dark edge
  cell('sign', (w, h) => {
    g.font = `bold ${Math.round(h * 0.86)}px Helvetica, Arial, sans-serif`;
    g.lineWidth = 4; g.strokeStyle = '#6a4a08'; g.fillStyle = GILT;
    g.strokeText('ALTE  POST', w / 2, h * 0.54, w - 8);
    g.fillText('ALTE  POST', w / 2, h * 0.54, w - 8);
  });
  // the board over the door: dark green, gilt serif letters
  cell('board', (w, h) => {
    g.fillStyle = '#1c2b22'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a44a'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#e2bd5c';
    g.font = `600 ${Math.round(h * 0.46)}px Georgia, 'Times New Roman', serif`;
    g.fillText('Hotel Alte Post', w / 2, h / 2 + 2, w - 40);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  white: WHITE, eaves: [0.1, 0.06, 0.035], soffit: [0.16, 0.1, 0.06], steel: [0.16, 0.17, 0.18], door: [0.13, 0.07, 0.035],
  canopy: [0.09, 0.06, 0.04], plinth: [0.3, 0.29, 0.27], step: [0.33, 0.33, 0.32], chimney: [0.42, 0.4, 0.37], cap: [0.2, 0.2, 0.2]
};

/** The highest ground along a wall, half a metre before it */
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

// A stretch of wall from y0 to y1 into `bucket`: with windows (half the wall's length as aHalf) or closed
function wall(B, bucket, F, y0, y1, windows) {
  if (y1 - y0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const m = F.len / 2, v = (y) => y - LINE + UP - (windows ? 0 : CLOSED);
  B.quad(bucket, P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), [[-m, v(y0)], [m, v(y0)], [m, v(y1)], [-m, v(y1)]], { half: windows ? m : 0 });
}

// A volume: its walls (pink or timber; a closed plinth under the lowest windows clearing the ground, the floors with
// windows, the parapet closed; a grey plinth), the eaves round its roof, the roof
function buildPart(B, p) {
  const ring = outwardRing(p.ring);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const shared = isShared(a, b);
    // (the lower roof's walls shared with the higher block stand inside it)
    if (shared && p.top < Math.max(...H.parts.map((q) => q.top))) continue;
    const bucket = isTimber(a, b) ? 'timber' : 'pink', W = H.win[bucket];
    const foot = shared || F.len < 2.4 ? null : firstWindowFloor(groundAlong(F) + 0.25, W.lo);
    if (foot === null) { wall(B, bucket, F, H.base, p.top, false); continue; }
    wall(B, bucket, F, H.base, foot, false);
    // (a grey plinth over the closed floors under the lowest windows, where the ground falls away along the wall)
    B.box('trim', F, -0.04, F.len + 0.04, 0, 0.05, H.base, foot + 0.3, C.plinth);
    wall(B, bucket, F, foot, LINE, true);
    wall(B, bucket, F, LINE, p.top, false);
    // the dark eaves over the wall, a little out
    B.box('trim', F, -0.3, F.len + 0.3, 0, 0.32, p.top - 0.32, p.top + 0.06, C.eaves, { top: 'roof' });
    B.box('trim', F, -0.3, F.len + 0.3, 0, 0.3, p.top - 0.42, p.top - 0.32, C.soffit);
    if (bucket === 'pink') {
      // the white band at a floor's foot, the pilasters at the corners
      B.box('trim', F, 0, F.len, 0, 0.06, H.band.y0, H.band.y1, C.white);
      for (const s of [0, F.len - 0.42]) B.box('trim', F, s, s + 0.42, 0, 0.07, foot - 0.3, LINE, C.white);
    }
  }
  flatRoof(B, ring, p.top - 0.02);
}

// The pediment over the narrow front's window: a flat white triangle and its cornice
function buildFront(B) {
  const Fr = H.front, F = wallFrame(Fr.a, Fr.b), m = F.len / 2, W = H.win.pink;
  const y = Fr.pediment + W.hi + 0.12, P = (s, o, yy) => { const [x, z] = onWall(F, s, o); return [x, yy, z]; };
  B.box('trim', F, m - W.half - 0.25, m + W.half + 0.25, 0, 0.12, y, y + 0.1, C.white);
  B.tri('trim', P(m - W.half - 0.2, 0.1, y + 0.1), P(m + W.half + 0.2, 0.1, y + 0.1), P(m, 0.1, y + 0.55), undefined, { colour: C.white });
}

// The entrance on the lane: the door in its frame, a step, the canopy, the name over it
function buildDoor(B) {
  const D = H.door, F = wallFrame(D.a, D.b);
  const g = groundHeight(...onWall(F, D.s, 0.8)), y0 = g + 0.12, s0 = D.s - D.w / 2, s1 = D.s + D.w / 2;
  B.box('trim', F, s0 - 0.14, s1 + 0.14, 0, 0.08, y0, y0 + D.h + 0.14, C.white);
  B.box('trim', F, s0, s1, 0.08, 0.1, y0, y0 + D.h, C.door);
  B.box('trim', F, D.s - 0.02, D.s + 0.02, 0.1, 0.12, y0 + 0.1, y0 + D.h - 0.1, C.eaves);
  B.box('trim', F, s0 - 0.5, s1 + 0.5, 0, 0.6, g - 0.6, y0, C.step);
  const K = D.canopy;
  B.box('trim', F, s0 - 0.6, s1 + 0.6, 0, K.out, y0 + K.y, y0 + K.y + 0.14, C.canopy, { top: 'roof' });
  const Bd = D.board;
  B.decal(F, D.s - Bd.w / 2, D.s + Bd.w / 2, 0.05, y0 + Bd.y0, y0 + Bd.y1, 'board');
}

// The letters on their steel frame over the timber wing, along its south-west front: posts and two rails, the letters
// on its front and (mirrored) on its back
function buildSign(B) {
  const S = H.sign, F = wallFrame(S.a, S.b), top = H.parts.find((p) => p.id === 'west').top;
  for (let k = 0; k < S.posts; k++) {
    const s = S.s0 + 0.3 + ((S.s1 - S.s0 - 0.6) * k) / (S.posts - 1);
    B.box('trim', F, s - 0.05, s + 0.05, S.o - 0.2, S.o - 0.1, top - 0.05, S.y1 + 0.05, C.steel);
    B.box('trim', F, s - 0.04, s + 0.04, S.o - 1.3, S.o - 0.2, top - 0.05, top + 0.08, C.steel);
  }
  for (const y of [S.y0 + 0.12, S.y1 - 0.06]) B.box('trim', F, S.s0, S.s1, S.o - 0.2, S.o - 0.12, y - 0.04, y + 0.04, C.steel);
  const front = { a: onWall(F, 0, S.o), u: F.u, n: F.n };
  const back = { a: onWall(F, F.len, S.o - 0.32), u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]] };
  B.decal(front, S.s0, S.s1, 0, S.y0, S.y1, 'sign');
  B.decal(back, F.len - S.s1, F.len - S.s0, 0, S.y0, S.y1, 'sign', { mirror: true });
}

// The chimneys on the roof
function buildChimneys(B) {
  const F = wallFrame([0, 0], [1, 0]), top = H.parts.find((p) => p.id === 'west').top;
  for (const [x, z, r, h] of H.chimneys) {
    // (a frame along x: s is x, o is z)
    B.box('trim', F, x - r, x + r, z - r, z + r, top - 0.1, top + h, C.chimney);
    B.box('trim', F, x - r - 0.06, x + r + 0.06, z - r - 0.06, z + r + 0.06, top + h, top + h + 0.08, C.cap);
  }
}

/**
 * Builds the Hotel Alte Post into `scene`. Returns { group, colliders }: none of its own (the player's walls stand on
 * its surveyed outlines, js/landmarks.js SURVEYED_FOOTPRINTS; the step before the door is low, the canopy hangs).
 */
export function buildHotelAltePost(scene) {
  const root = new THREE.Group();
  root.name = 'Hotel Alte Post';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['pink', 'timber'], name: 'Hotel Alte Post' }), M = materials();
  for (const p of H.parts) buildPart(B, p);
  buildFront(B);
  buildDoor(B);
  buildSign(B);
  buildChimneys(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
