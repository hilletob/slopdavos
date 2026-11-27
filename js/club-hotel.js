import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { CLUB_HOTEL, balconyWalls, entranceWall, floorFeet, onWall, outwardRing, walls } from './club-hotel-data.js';

export { CLUB_HOTEL };

// The Club Hotel Davos's house on the Promenade rebuilt by hand (js/club-hotel-data.js), standing in for its
// swissBUILDINGS3D volume, which the streamed tiles drew as one white block with the town houses' windows: the surveyed
// volume in white plaster, a window in a dark frame in every bay of every floor (drawn by the wall's material from its
// uv: metres along the wall from its middle, metres up the floors' grid; the taller ground floor's stretched to its
// height), a closed plinth where the ground climbs towards the Obere Strasse, a balcony with a closed grey parapet
// before every step of the south front on every floor high enough over the ground, the lobby's glazing and the entrance
// under a flat canopy on the Promenade, the white coping round the flat roof. Four meshes: the walls, the roof, the
// glass and the trim (one vertex-coloured mesh). No lettering of its own: the photographs show none on this house (the
// name down the blue tower across the Promenade is the other house's), the hotel's sign stays js/shops.js'.

excludeBuildings([CLUB_HOTEL.exclude]);
// (the player's walls on the surveyed outline, not on OSM's: js/landmarks.js. The balconies hang over the ground, the
// canopy has no posts: no colliders of its own)
SURVEYED_FOOTPRINTS.set(CLUB_HOTEL.osm, [CLUB_HOTEL.ring]);

const H = CLUB_HOTEL, WIN = H.win, STOREY = H.storey, BAY = H.bay;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the top floor's at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
// The ground floor's height stretched onto one storey of the grid
const GF = STOREY / (H.ground - H.floor);

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.58, 0.58, 0.56], FRAME = [0.045, 0.045, 0.05];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.3, 0.3, 0.29], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.5, 0.5, 0.49], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35);
    M.glass = SIMPLE_SKINS.glow([0.08, 0.1, 0.11], 0.1, 0.7, [1.0, 0.82, 0.58], 0.5);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  // White plaster with a window per bay and floor: a dark frame, a post in its middle, a light sill under it; a
  // curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const post = smoothstep(0.04, 0.025, abs(bu)).mul(near);
    const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(post)).mul(open);
    const sill = rect(WIN.half + 0.06, WIN.lo - 0.07, WIN.lo).mul(open).mul(near);
    // the plaster: a little weathering, a shade darker under the sills and at the foot of a floor
    const stain = rect(WIN.half, WIN.lo - 0.7, WIN.lo - 0.07, 0.2).mul(open).mul(0.05);
    const wall = mix(vec3(0.53, 0.53, 0.51), vec3(...PLASTER).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.85, id)));
    const span = WIN.hi - WIN.lo - 0.14;
    const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(span)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(0.42, 0.42, 0.41), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.46, 0.43, 0.38), curtain);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    // (a hotel: rooms lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 23, { share: 0.38, late: 0.1, tone: twoTones([1.0, 0.76, 0.46], [0.9, 0.92, 1.0], 0.82) }).mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The lobby's glazing: dark posts every 1.4 m, a transom at 2.4 m, warm light behind at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.75 });
    const mu = abs(fract(U.div(1.4)).sub(0.5)), tv = abs(V.sub(2.4));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.06, 0.04, tv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.4)).mul(13.1));
    m.colorNode = mix(mix(vec3(0.05, 0.065, 0.075), vec3(0.12, 0.15, 0.16), paneId), vec3(...FRAME), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.75), float(0.2), frame);
    m.emissiveNode = vec3(1.0, 0.8, 0.55).mul(float(1).sub(frame)).mul(paneId.mul(0.3).add(0.7)).mul(glow.mul(0.55));
    M.glass = m;
  }
  return M;
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  coping: [0.62, 0.62, 0.6], slab: [0.48, 0.48, 0.46], parapet: [0.27, 0.28, 0.28], frame: FRAME,
  canopy: [0.55, 0.55, 0.53], door: [0.04, 0.05, 0.055], step: [0.33, 0.33, 0.32]
};

const P = (F, s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
// The stretch s0–s1 of a wall as a wall of its own
const sub = (F, s0, s1) => ({ a: onWall(F, s0), u: F.u, n: F.n, len: s1 - s0 });
// A stretch of plaster from y0 to y1 on the upper floors' grid, with windows or closed
function plaster(B, F, y0, y1, windows) {
  if (y1 - y0 < 0.01) return;
  const mid = F.len / 2, open = windows && F.len >= 2.4;
  const v = (y) => y - H.line + UP - (open ? 0 : CLOSED);
  B.quad('plaster', P(F, 0, y0), P(F, F.len, y0), P(F, F.len, y1), P(F, 0, y1), [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half: open ? mid : 0 });
}
// The ground floor with its windows: its height stretched onto one storey of the grid
function groundFloor(B, F) {
  const mid = F.len / 2, open = F.len >= 2.4;
  const v = (y) => (y - H.floor) * GF + UP - 20 * STOREY - (open ? 0 : CLOSED);
  B.quad('plaster', P(F, 0, H.floor), P(F, F.len, H.floor), P(F, F.len, H.ground), P(F, 0, H.ground), [[-mid, v(H.floor)], [mid, v(H.floor)], [mid, v(H.ground)], [-mid, v(H.ground)]], { half: open ? mid : 0 });
}
// A strip of glazing from y0 to y1 between s0 and s1 (uv: metres along the wall, metres up from its foot)
function glass(B, F, s0, s1, y0, y1) {
  B.quad('glass', P(F, s0, y0), P(F, s1, y0), P(F, s1, y1), P(F, s0, y1), [[s0, 0], [s1, 0], [s1, y1 - y0], [s0, y1 - y0]]);
}

/** The highest ground along a wall, half a metre out of it */
export function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

// The walls: a closed plinth up to over the highest ground along each (the ground floor's windows where the ground lies
// low enough, the lobby's glazing on the Promenade), the upper floors' windows, the coping; the roof
function buildWalls(B) {
  const E = entranceWall();
  for (const { a, b, F } of walls()) {
    if (F.len < 0.05) continue;
    const ground = groundAlong(F), hi = ground + 0.25;
    if (E && a === E.a && b === E.b) {
      // the Promenade's face: the lobby's glazing in the middle of the ground floor, windows either side
      const foot = Math.max(H.floor, ground) + 0.05, mid = F.len / 2, g = H.entrance.glazing / 2, top = H.ground - 0.3;
      const L = sub(F, mid - g, mid + g);
      plaster(B, F, H.base, H.floor, false);
      plaster(B, L, H.floor, foot, false);
      glass(B, F, mid - g, mid + g, foot, top);
      plaster(B, L, top, H.ground, false);
      for (const [s0, s1] of [[0, mid - g], [mid + g, F.len]]) groundFloor(B, sub(F, s0, s1));
      B.box('trim', F, mid - g - 0.08, mid + g + 0.08, 0, 0.1, top - 0.08, top, C.frame);
    } else if (hi < H.floor + WIN.lo / GF) {
      plaster(B, F, H.base, H.floor, false);
      groundFloor(B, F);
    } else plaster(B, F, H.base, H.ground, false);
    // the upper floors: windows from the first storey whose windows clear the ground
    const lowest = hi <= H.ground + WIN.lo ? H.ground : H.ground + Math.ceil((hi - H.ground - WIN.lo) / STOREY) * STOREY;
    plaster(B, F, H.ground, Math.min(lowest, H.line), false);
    if (lowest < H.line) plaster(B, F, lowest, H.line, true);
    plaster(B, F, H.line, H.top, false);
    // the white coping round the roof
    B.box('trim', F, -0.06, F.len + 0.06, -0.3, 0.1, H.top - 0.42, H.top + 0.16, C.coping);
  }
  flatRoof(B, outwardRing(H.ring), H.top);
}

/** The floors a balcony stands at before a wall: the upper floors' feet `clear` m over the ground under it */
export function balconyFloors(F) {
  const Bc = H.balconies;
  let ground = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += F.len / 4) for (const o of [0.3, Bc.out]) ground = Math.max(ground, groundHeight(...onWall(F, s, o)));
  return floorFeet().filter((y) => y - Bc.slab - ground >= Bc.clear);
}

// The balconies on the south front: a slab, a closed grey parapet on the front and the open end, a handrail on it
function buildBalconies(B) {
  const Bc = H.balconies;
  for (const { F } of balconyWalls()) {
    const s0 = 0.05, s1 = F.len - 0.05, o = Bc.out;
    for (const y of balconyFloors(F)) {
      B.box('trim', F, s0, s1, 0, o, y - Bc.slab, y, C.slab);
      B.box('trim', F, s0, s1, o - 0.08, o, y, y + Bc.rail, C.parapet);
      for (const s of [s0, s1 - 0.08]) B.box('trim', F, s, s + 0.08, 0, o - 0.08, y, y + Bc.rail, C.parapet);
      B.box('trim', F, s0 - 0.02, s1 + 0.02, o - 0.1, o + 0.02, y + Bc.rail, y + Bc.rail + 0.05, C.coping);
    }
  }
}

// The entrance on the Promenade: the doors in the lobby's glazing, a step before them, the flat canopy over them
function buildEntrance(B) {
  const E = entranceWall();
  if (!E) return;
  const F = E.F, mid = F.len / 2, D = H.entrance, K = D.canopy;
  const foot = Math.max(H.floor, groundAlong(F)) + 0.05;
  const dh = D.doors / 2;
  for (const s of [mid - dh, mid, mid + dh]) B.box('trim', F, s - 0.05, s + 0.05, 0, 0.12, foot, foot + 2.3, C.door);
  B.box('trim', F, mid - dh - 0.05, mid + dh + 0.05, 0, 0.12, foot + 2.3, foot + 2.42, C.door);
  B.box('trim', F, mid - dh - 0.6, mid + dh + 0.6, 0, 1.2, foot - 0.6, foot + 0.02, C.step);
  const y = foot + K.y;
  B.box('trim', F, mid - K.w / 2, mid + K.w / 2, 0, K.out, y, y + K.thick, C.canopy);
}

/**
 * Builds the Club Hotel's house on the Promenade into `scene`. Returns { group, colliders } (no colliders of its own:
 * the player's walls stand on the surveyed outline, js/landmarks.js; the balconies hang over the ground and the canopy
 * has no posts).
 */
export function buildClubHotel(scene) {
  const root = new THREE.Group();
  root.name = 'Club Hotel';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ walls: 'plaster', name: 'Club Hotel' }), M = materials();
  buildWalls(B);
  buildBalconies(B);
  buildEntrance(B);
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
