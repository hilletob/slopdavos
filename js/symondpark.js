import * as THREE from 'three/webgpu';
import { attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, worldNoise } from './building-kit.js';
import { SYMONDPARK, bays, glassFoot, onWall, ring, wallFrame, wallOf } from './symondpark-data.js';

export { SYMONDPARK };

// The SymondPark rebuilt by hand (js/symondpark-data.js), standing in for its swissBUILDINGS3D volume, which the
// streamed tiles drew as one white block with the town houses' windows: the surveyed block wrapped in its screen of
// dark grey-brown bars laid like bricks with open joints, light grey posts between its tall bays, the glazing of the
// two upper floors behind the joints (lit here and there at night); the shop's glazed ground floor where it opens onto
// the forecourt and the low ends of the side walls, a dark fascia over it, a closed plinth under it where the ground
// climbs; the entrance with its canopy in the middle of the south front, the shop's and the restaurant's names, the
// building's name high on the street's side. The screen and the glazing are drawn by their materials from the uv
// (metres along the wall from its corner, metres up from the shop's fascia; aHalf carries the wall's bay width). Five
// meshes: the screen, the glass, the roof, the trim (one vertex-coloured mesh) and the lettering (one canvas atlas).

excludeBuildings([SYMONDPARK.exclude]);
// (the names are drawn on the surveyed walls here: OpenStreetMap's walls, where js/shops.js would hang its boards,
// stand up to 0.9 m inside them)
SHOP_EXCLUSIONS.add(SYMONDPARK.osm);
for (const id of SYMONDPARK.shops) SHOP_EXCLUSIONS.add(id);
// (the player's walls on the surveyed outline, not on OSM's: js/landmarks.js; nothing hangs over the ground)
SURVEYED_FOOTPRINTS.set(SYMONDPARK.osm, [SYMONDPARK.ring]);

const S = SYMONDPARK, LINE = S.line, STOREY = S.storey;
// The screen's bricks: a course's height, a bar's length (each course shifted by half a bar), the open joints
const COURSE = 0.45, BAR = 1.3, JOINT_V = 0.085, JOINT_U = 0.17;
// A window behind the screen in its storey (m up from the floor)
const WIN = { lo: 0.85, hi: 2.95 };

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const BRICK = [0.19, 0.165, 0.14], POST = [0.34, 0.33, 0.31];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.28, 0.28, 0.27], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the screen's mean colour with a lit band per upper floor at night, the glass glowing faintly)
    M.screen = SIMPLE_SKINS.windowed([0.15, 0.135, 0.115], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.85, 0.25);
    M.glass = SIMPLE_SKINS.glow([0.08, 0.095, 0.1], 0.15, 0.6, [1.0, 0.88, 0.7], 0.18);
    return M;
  }
  const U = uv().x, V = uv().y, bw = attribute('aHalf', 'float');
  const glow = nightGlow();
  // (the joints are finer than a pixel from across the street: they and the bars' shades fade out early, or they
  // shimmer; far off the screen is its mean colour)
  const fine = fade(8, 28);
  // The screen: the posts between the bays, the bars laid like bricks with open joints, behind them the dark floors
  // and the upper floors' glazing, lit here and there at night (offices and practices)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    const fu = fract(U.div(bw)), bay = floor(U.div(bw));
    const post = smoothstep(0.14, 0.11, fu.min(float(1).sub(fu)).mul(bw));
    const course = floor(V.div(COURSE)), cv = fract(V.div(COURSE)).mul(COURSE);
    const bu = U.add(course.mul(BAR / 2)), brick = floor(bu.div(BAR)), bx = fract(bu.div(BAR)).mul(BAR);
    const joint = smoothstep(JOINT_V, JOINT_V - 0.02, cv).max(smoothstep(JOINT_U, JOINT_U - 0.03, bx));
    const storey = floor(V.div(STOREY)), fv = fract(V.div(STOREY)).mul(STOREY);
    const band = step(0, V).mul(step(storey, S.floors - 1)).mul(smoothstep(WIN.lo - 0.05, WIN.lo, fv)).mul(smoothstep(WIN.hi, WIN.hi - 0.05, fv));
    const behind = mix(vec3(0.02, 0.02, 0.022), mix(vec3(0.045, 0.055, 0.065), vec3(0.08, 0.09, 0.1), worldNoise(0.08)), band);
    const shade = hash(brick.mul(13.1).add(course.mul(7.7))).mul(0.3).add(0.85);
    const bar = vec3(...BRICK).mul(mix(float(1), shade, fine)).mul(worldNoise(0.25).mul(0.15).add(0.92));
    const open = mix(float(0.27), joint, fine).mul(float(1).sub(post));
    m.colorNode = mix(mix(bar, behind, open), vec3(...POST), post);
    m.roughnessNode = mix(float(0.85), float(0.3), open.mul(band));
    const lit = litWindow(bay, storey.add(bw.mul(7.3)), 23, { share: 0.4, late: 0.08, tone: twoTones([1.0, 0.86, 0.66], [0.88, 0.93, 1.0], 0.6) });
    m.emissiveNode = lit.mul(band).mul(open).mul(glow.mul(1.6));
    M.screen = m;
  }
  // The shop's glazing: dark posts at a quarter of a bay, a transom, the shop behind the panes; at night shut, a faint
  // glow behind most panes and a few lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.7 });
    const q = U.mul(4).div(bw), mu = fract(q), pane = floor(q);
    const frame = smoothstep(0.035, 0.015, mu.min(float(1).sub(mu)).mul(bw.div(4)))
      .max(smoothstep(0.045, 0.025, V.sub(S.glass - 1.0 - LINE).abs()))
      .max(smoothstep(0.06, 0.03, V.sub(S.glass - LINE).abs()));
    const id = hash(pane.mul(13.1).add(bw.mul(31.7)));
    const glassC = mix(vec3(0.05, 0.065, 0.07), vec3(0.13, 0.125, 0.11), id.mul(0.5));
    m.colorNode = mix(glassC, vec3(0.07, 0.07, 0.075), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.7), float(0.2), frame);
    const level = mix(float(0.1), float(0.75), step(0.85, id));
    m.emissiveNode = vec3(1.0, 0.92, 0.78).mul(level).mul(float(1).sub(frame)).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The lettering: one canvas atlas -------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  migros: [0, 0, 896, 202],
  restaurant: [0, 210, 1000, 48],
  name: [0, 266, 1024, 130]
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // (plain letters, no traced logo)
  cell('migros', (w, h) => { g.fillStyle = '#ff6a00'; g.font = 'bold 190px Helvetica, Arial, sans-serif'; g.fillText('MIGROS', w / 2, h / 2 + 6, w - 20); });
  cell('restaurant', (w, h) => { g.fillStyle = '#f0ede6'; g.font = 'bold 40px Helvetica, Arial, sans-serif'; g.fillText('MIGROS RESTAURANT', w / 2, h / 2 + 2, w - 20); });
  cell('name', (w, h) => { g.fillStyle = '#dcd8cf'; g.font = '104px Helvetica, Arial, sans-serif'; g.fillText('S Y M O N D P A R K', w / 2, h / 2 + 4, w - 20); });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  coping: [0.36, 0.36, 0.35], fascia: [0.06, 0.062, 0.066], plinth: [0.26, 0.26, 0.25], frame: [0.07, 0.07, 0.075],
  canopy: [0.09, 0.09, 0.095], step: [0.3, 0.3, 0.29], door: [0.04, 0.05, 0.055]
};

/** The highest ground along a wall from s0 to s1, half a metre before it */
function groundAlong(F, s0, s1) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.8));
  for (let i = 0; i <= n; i++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * i) / n, 0.5)));
  return hi;
}

// A wall: bay by bay the shop's glazing (with the plinth under it and the fascia over it) where the ground lies low,
// else the screen down into the ground; the screen up to the coping
function buildWall(B, F) {
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const { n, w } = bays(F.len);
  const screen = (s0, s1, y0, y1) => B.quad('screen', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1),
    [[s0, y0 - LINE], [s1, y0 - LINE], [s1, y1 - LINE], [s0, y1 - LINE]], { half: w });
  const feet = [];
  for (let i = 0; i < n; i++) {
    const s0 = i * w, s1 = s0 + w;
    const foot = glassFoot(groundAlong(F, s0, s1));
    feet.push(foot);
    if (foot === null) { screen(s0, s1, S.base, S.screenTop); continue; }
    B.box('trim', F, s0, s1, -0.05, 0.04, S.base, foot, C.plinth);
    B.quad('glass', P(s0, foot), P(s1, foot), P(s1, S.glass), P(s0, S.glass),
      [[s0, foot - LINE], [s1, foot - LINE], [s1, S.glass - LINE], [s0, S.glass - LINE]], { half: w });
    B.box('trim', F, s0, s1, -0.05, 0.08, S.glass, LINE, C.fascia);
    screen(s0, s1, LINE, S.screenTop);
  }
  // the coping round the roof
  B.box('trim', F, -0.06, F.len + 0.06, -0.04, 0.07, S.screenTop, S.top + 0.1, C.coping);
  return { n, w, feet };
}

// The entrance in the south front's middle bay: the doors' frames, a step up to them, the canopy over them
function buildEntrance(B, F, wall) {
  const D = S.south.door, mid = F.len / 2, i = Math.floor(wall.n / 2), foot = wall.feet[i];
  if (foot === null) return;
  const h = foot + D.h, half = D.w / 2;
  for (const s of [mid - half, mid, mid + half]) B.box('trim', F, s - 0.06, s + 0.06, 0, 0.1, foot, h, C.frame);
  B.box('trim', F, mid - half - 0.06, mid + half + 0.06, 0, 0.1, h, h + 0.12, C.frame);
  B.box('trim', F, mid - half + 0.06, mid + half - 0.06, 0.02, 0.05, foot, h, C.door);
  const st = D.step;
  B.box('trim', F, mid - st.w / 2, mid + st.w / 2, 0, st.out, groundHeight(...onWall(F, mid, st.out)) - 0.6, foot, C.step);
  const cn = D.canopy;
  B.box('trim', F, mid - cn.w / 2, mid + cn.w / 2, 0, cn.out, cn.y0, cn.y1, C.canopy, { top: 'roof' });
}

/**
 * Builds the SymondPark into `scene`. Returns { group, colliders } (no colliders of its own: the player's walls stand
 * on the surveyed outline, js/buildings.js via SURVEYED_FOOTPRINTS, and the canopy hangs over the forecourt).
 */
export function buildSymondPark(scene) {
  const root = new THREE.Group();
  root.name = 'SymondPark';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['screen', 'glass'], name: 'SymondPark' }), M = materials();
  const R = ring();
  const south = wallOf('south');
  for (let k = 0; k < R.length; k++) {
    const F = wallFrame(R[k], R[(k + 1) % R.length]);
    const wall = buildWall(B, F);
    if (Math.abs(F.n[1] - south.n[1]) < 1e-6 && Math.abs(F.n[0] - south.n[0]) < 1e-6) buildEntrance(B, F, wall);
  }
  flatRoof(B, R, S.top);
  for (const L of S.lettering) B.decal(wallOf(L.wall), L.s0, L.s1, L.out, L.y0, L.y1, L.key);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
