import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, nightGlow, worldNoise } from './building-kit.js';
import { PISCHA_TERMINAL, alongLongSide, floorOf, groundOutline, onWall, roofOutline, sideFrame, vitrines, wallFrame } from './pischa-terminal-data.js';

export { PISCHA_TERMINAL };

// The Pischa terminal on the Talstrasse rebuilt by hand (js/pischa-terminal-data.js), standing in for swissBUILDINGS3D's
// grey box: dark-stained timber walls under the flat roof with its deep dark fascia, the south-west end open on the stair
// head between light timber posts (the landing, the rail, the dark stairwell with the blue board on its back wall), the
// poster vitrines between white piers on the side towards the road, the red sign on the roof. Six meshes: the walls, the
// roof, the vitrines' light boxes, the lamp, the trim (one vertex-coloured mesh) and the posters and lettering (one
// canvas atlas). At night it is shut: the light boxes glow faintly, one lamp burns over the stairs.

excludeBuildings(PISCHA_TERMINAL.exclude);
// (no OpenStreetMap building here, so js/buildings.js raises no walls: the module returns them; the outline is
// registered for the player's walls' probe)
SURVEYED_FOOTPRINTS.set(PISCHA_TERMINAL.key, [groundOutline()]);

const T = PISCHA_TERMINAL;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const TIMBER = [0.1, 0.058, 0.032], CONCRETE = [0.26, 0.26, 0.25];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.2, 0.2, 0.19], 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, js/landmark-buildings.js SIMPLE_SKINS)
    M.timber = SIMPLE_SKINS.plain([0.095, 0.056, 0.032], 0.88);
    M.glass = SIMPLE_SKINS.glow([0.05, 0.065, 0.09], 0.2, 0.3, [0.85, 0.9, 1.0], 0.18);
    M.lamp = SIMPLE_SKINS.glow([0.5, 0.48, 0.42], 0.5, 0, [1.0, 0.82, 0.55], 2.0);
    return M;
  }
  const U = uv().x, V = uv().y;
  const fine = fade(8, 28);
  // Vertical boards 12 cm wide, each a shade of its own, the joints dark (fading out by 28 m); the concrete plinth
  // under them (v: metres over the floor)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
    const board = fract(U.div(0.12));
    const joint = smoothstep(0.08, 0.0, board).max(smoothstep(0.92, 1.0, board)).mul(fine);
    const id = hash(floor(U.div(0.12)).mul(17.3));
    const wood = mix(vec3(...TIMBER).mul(0.8), vec3(...TIMBER).mul(1.2), id).mul(worldNoise(1.3).mul(0.3).add(0.85)).mul(float(1).sub(joint.mul(0.45)));
    const concrete = mix(vec3(...CONCRETE).mul(0.85), vec3(...CONCRETE).mul(1.1), worldNoise(0.9));
    const plinth = step(V, T.plinth);
    const drip = smoothstep(0.03, 0.0, abs(V.sub(T.plinth))).mul(fine);
    m.colorNode = mix(wood, concrete, plinth).mul(float(1).sub(drip.mul(0.5)));
    m.roughnessNode = mix(float(0.88), float(0.95), plinth);
    M.timber = m;
  }
  // The vitrines' light boxes behind the posters: dark glass, a faint cold light at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.5 });
    m.colorNode = mix(vec3(0.035, 0.05, 0.075), vec3(0.07, 0.09, 0.12), worldNoise(0.6));
    m.emissiveNode = vec3(0.85, 0.9, 1.0).mul(nightGlow().mul(0.18));
    M.glass = m;
  }
  // The lamp over the stairs
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0 });
    m.colorNode = vec3(0.5, 0.48, 0.42);
    m.emissiveNode = vec3(1.0, 0.82, 0.55).mul(nightGlow().mul(2.0));
    M.lamp = m;
  }
  return M;
}

// --- The boards, the posters and the sign: one canvas atlas ------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  board: [0, 0, 560, 240], // 2.55 × 1.1 m
  sign: [568, 0, 340, 130], // 1.7 × 0.65 m
  mountain: [0, 248, 256, 256], // the vitrines' posters, ~2 × 2 m
  timetable: [264, 248, 256, 256],
  event: [528, 248, 256, 256]
};
const BLUE = '#1d3f8f', YELLOW = '#f2c230', SANS = 'Helvetica, Arial, sans-serif';

/** A five-pointed star (centre x, y, outer radius r) */
function star(g, x, y, r, colour) {
  g.fillStyle = colour;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.42 : r;
    g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  g.closePath();
  g.fill();
}

/** A white mountain line over a blue ground (from x0 to x1 at the foot y) */
function ridge(g, x0, x1, y, h) {
  const w = x1 - x0;
  g.beginPath();
  g.moveTo(x0, y);
  [[0.12, 0.55], [0.25, 0.2], [0.36, 0.6], [0.5, 0.05], [0.62, 0.5], [0.72, 0.3], [0.86, 0.7], [1, 0.45]].forEach(([f, q]) => g.lineTo(x0 + w * f, y - h * (1 - q)));
  g.lineTo(x1, y);
  g.closePath();
  g.fill();
}

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // The blue board on the stairwell's back wall: the white mountain line, the star, the name (2015's board, drawn freely)
  cell('board', (w, h) => {
    g.fillStyle = '#21489c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f5fa'; ridge(g, 0, w, h * 0.58, h * 0.36);
    g.fillStyle = '#21489c'; ridge(g, 0, w, h * 0.58 + 10, h * 0.3);
    g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.62, w, 3);
    star(g, 44, h * 0.8, 20, '#ffffff'); star(g, 56, h * 0.78, 8, YELLOW);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `bold 48px ${SANS}`; g.fillText('pischa', 76, h * 0.81);
    g.font = `bold 20px ${SANS}`; g.fillText('DAVOS KLOSTERS', 250, h * 0.84);
  });
  // The red sign on the roof (its text guessed: unreadable in the photos)
  cell('sign', (w, h) => {
    g.fillStyle = '#b5121b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f4f4f1'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 58px ${SANS}`; g.fillText('PISCHA', w / 2, h * 0.42);
    g.font = `bold 18px ${SANS}`; g.fillText('BUS · TICKETS', w / 2, h * 0.8);
  });
  // The vitrines' posters: the ski area's (blue, the mountains), the bus's timetable, an event (guessed)
  cell('mountain', (w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1f56a8'); sky.addColorStop(1, '#8fbbe8');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5f7fb'; ridge(g, 0, w, h, h * 0.5);
    star(g, 40, 40, 22, BLUE); star(g, 50, 36, 9, YELLOW);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = `bold 40px ${SANS}`; g.fillText('pischa', 70, 54);
    g.fillStyle = '#16203a'; g.font = `bold 18px ${SANS}`; g.textAlign = 'center'; g.fillText('Freeride · Winterwandern', w / 2, h - 22);
  });
  cell('timetable', (w, h) => {
    g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, w, h);
    g.fillStyle = BLUE; g.fillRect(0, 0, w, 46);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `bold 22px ${SANS}`; g.fillText('Pischa Bus', 14, 24);
    g.fillStyle = '#16203a'; g.font = `15px ${SANS}`;
    for (let i = 0; i < 9; i++) {
      const y = 70 + i * 20;
      g.fillText(`${8 + i}`.padStart(2, '0'), 16, y);
      g.fillStyle = '#7a7f86'; g.fillRect(52, y - 2, w - 70, 2); g.fillStyle = '#16203a';
      for (let k = 0; k < 4; k++) g.fillText(`${(k * 15 + 5) % 60}`.padStart(2, '0'), 60 + k * 46, y);
    }
  });
  cell('event', (w, h) => {
    g.fillStyle = '#16203a'; g.fillRect(0, 0, w, h);
    g.fillStyle = YELLOW; g.beginPath(); g.arc(w * 0.7, h * 0.32, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e9edf3'; ridge(g, 0, w, h * 0.72, h * 0.3);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `bold 30px ${SANS}`; g.fillText('SONNENTERRASSE', w / 2, h - 46);
    g.font = `16px ${SANS}`; g.fillText('Bergrestaurant Pischa', w / 2, h - 20);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = {
  fascia: [0.085, 0.05, 0.03], soffit: [0.11, 0.07, 0.042], light: [0.4, 0.31, 0.18], pier: [0.6, 0.6, 0.58],
  frame: [0.045, 0.06, 0.085], dark: [0.012, 0.012, 0.014], stair: [0.03, 0.03, 0.032], concrete: [0.26, 0.26, 0.25],
  metal: [0.3, 0.31, 0.31], red: [0.42, 0.03, 0.03], door: [0.07, 0.042, 0.026], handle: [0.45, 0.45, 0.44]
};

/** A wall face in a side's frame, s0–s1 along it, `o` out of it, y0–y1; facing out (or in, `inward`); uv (s, m over the floor) */
function face(B, bucket, F, s0, s1, o, y0, y1, floorY, inward = false, colour = null) {
  const P = (s, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  const v0 = y0 - floorY, v1 = y1 - floorY;
  if (inward) B.quad(bucket, P(s1, y0), P(s0, y0), P(s0, y1), P(s1, y1), [[s1, v0], [s0, v0], [s0, v1], [s1, v1]], { colour });
  else B.quad(bucket, P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[s0, v0], [s1, v0], [s1, v1], [s0, v1]], { colour });
}

/** How far along a long side (s from its a) the stair head reaches `back` m in from the south-west side */
function sAlong(k, back) {
  const F = sideFrame(k), p = alongLongSide(k, back);
  return (p[0] - F.a[0]) * F.u[0] + (p[1] - F.a[1]) * F.u[1];
}

// The walls: timber on the plinth, from under the lowest ground up to the soffit; the stair head's inner faces
function buildWalls(B, floorY, base) {
  const top = floorY + T.wall, H = T.hall;
  for (const k of ['southeast', 'northeast', 'northwest']) {
    const F = sideFrame(k);
    face(B, 'timber', F, 0, F.len, 0, base, top, floorY);
  }
  // the long sides' inner faces round the stair head (the walls' thickness in)
  const SE = sideFrame('southeast'), NW = sideFrame('northwest');
  face(B, 'timber', SE, 0, sAlong('southeast', H.depth), -T.thick, floorY - 0.3, top, floorY, true);
  face(B, 'timber', NW, sAlong('northwest', H.depth), NW.len, -T.thick, floorY - 0.3, top, floorY, true);
}

// The stair head behind the open south-west end: the posts and the lintel, the landing, the stairwell, its back wall
// with the board, the rails, the lamp
function buildHall(B, floorY, base) {
  const F = sideFrame('southwest'), H = T.hall, top = floorY + T.wall, L = F.len, t = T.thick;
  B.box('trim', F, -0.03, H.post, -H.post - 0.02, 0.03, floorY - 0.05, top - H.lintel, C.light);
  B.box('trim', F, L - H.post, L + 0.03, -H.post - 0.02, 0.03, floorY - 0.05, top - H.lintel, C.light);
  B.box('trim', F, -0.03, L + 0.03, -0.24, 0.04, top - H.lintel, top, C.light);
  // the landing (concrete, a threshold out under the eave) and the stairwell beyond it, dark, down to the back wall
  B.box('trim', F, t, L - t, -H.landing, 0.3, base, floorY, C.concrete);
  const P = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  B.quad('trim', P(t, -H.landing, floorY - 0.02), P(L - t, -H.landing, floorY - 0.02), P(L - t, -H.depth, floorY - 0.02), P(t, -H.depth, floorY - 0.02), undefined, { colour: C.stair });
  // (the landing's edge over the stairs: a lighter nosing)
  B.box('trim', F, t, L - t, -H.landing - 0.02, -H.landing + 0.05, floorY - 0.04, floorY + 0.01, C.metal);
  face(B, 'trim', F, t - 0.02, L - t + 0.02, -H.depth, floorY - 0.3, top, floorY, false, C.dark);
  const Bo = T.board;
  B.box('trim', F, Bo.s0 - 0.04, Bo.s1 + 0.04, -H.depth, -H.depth + 0.03, floorY + Bo.y0 - 0.04, floorY + Bo.y1 + 0.04, C.frame);
  B.decal(F, Bo.s0, Bo.s1, -H.depth + 0.035, floorY + Bo.y0, floorY + Bo.y1, 'board');
  // the rail across the left half of the opening (light timber) and along the landing's edge (metal)
  const [r0, r1] = H.frontRail, ry = floorY + H.rail;
  B.box('trim', F, r0, r1, -0.1, -0.02, ry - 0.07, ry, C.light);
  for (const s of [r0 + 0.02, (r0 + r1) / 2, r1 - 0.06]) B.box('trim', F, s, s + 0.06, -0.09, -0.03, floorY, ry - 0.07, C.light);
  B.box('trim', F, t, L - t, -H.landing - 0.03, -H.landing + 0.02, ry - 0.05, ry, C.metal);
  for (const s of [t + 0.05, L / 2, L - t - 0.1]) B.box('trim', F, s, s + 0.05, -H.landing - 0.025, -H.landing + 0.015, floorY, ry - 0.05, C.metal);
  // the lamp under the ceiling over the stairs
  const mid = (H.landing + H.depth) / 2;
  B.box('lamp', F, L / 2 - 0.3, L / 2 + 0.3, -mid - 0.09, -mid + 0.09, top - 0.07, top - 0.005);
}

// The south-east side: the white piers, the vitrines with their light boxes and posters
function buildSoutheast(B, floorY) {
  const F = sideFrame('southeast'), P = T.piers, V = T.vitrine, top = floorY + T.wall;
  B.box('trim', F, -0.03, P.end, 0, 0.07, floorY - 0.1, top, C.pier);
  B.box('trim', F, F.len - P.end, F.len + 0.03, 0, 0.07, floorY - 0.1, top, C.pier);
  const list = vitrines();
  list.forEach(({ s0, s1 }, i) => {
    if (i) B.box('trim', F, s0 - P.post, s0, 0, 0.06, floorY - 0.1, top, C.pier);
    B.box('trim', F, s0, s1, 0, 0.04, floorY + V.y0 - 0.06, floorY + V.y1 + 0.06, C.frame);
    const Q = (s, y) => { const [x, z] = onWall(F, s, 0.045); return [x, y, z]; };
    B.quad('glass', Q(s0 + 0.05, floorY + V.y0), Q(s1 - 0.05, floorY + V.y0), Q(s1 - 0.05, floorY + V.y1), Q(s0 + 0.05, floorY + V.y1));
    // the poster, square in the middle of the light box
    const side = Math.min(s1 - s0 - 0.3, V.y1 - V.y0 - 0.3), sm = (s0 + s1) / 2, ym = floorY + (V.y0 + V.y1) / 2;
    B.decal(F, sm - side / 2, sm + side / 2, 0.05, ym - side / 2, ym + side / 2, V.posters[i]);
  });
}

// The north-west side: the service door (guessed)
function buildNorthwest(B, floorY) {
  const F = sideFrame('northwest'), D = T.door;
  B.box('trim', F, D.s0 - 0.06, D.s1 + 0.06, 0, 0.03, floorY - 0.02, floorY + D.y1 + 0.06, C.frame);
  B.box('trim', F, D.s0, D.s1, 0.03, 0.05, floorY, floorY + D.y1, C.door);
  B.box('trim', F, D.s1 - 0.17, D.s1 - 0.08, 0.05, 0.1, floorY + 1.0, floorY + 1.04, C.handle);
}

// The flat roof over the eaves: the fascia round it, the soffit under it, the roof on top; the spot lamps on the
// south-west fascia, the red sign on the roof
function buildRoof(B, floorY) {
  const out = roofOutline(), y0 = floorY + T.wall, y1 = floorY + T.roof;
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    B.quad('trim', [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], undefined, { colour: C.fascia });
  }
  flatRoof(B, out, y1);
  // (the soffit: the roof's triangles turned to face down)
  const tmp = new Builder();
  flatRoof(tmp, out, y0, { bucket: 'soffit' });
  const p = tmp.bucket('soffit').pos;
  for (let i = 0; i < p.length; i += 9) {
    B.tri('trim', [p[i], p[i + 1], p[i + 2]], [p[i + 6], p[i + 7], p[i + 8]], [p[i + 3], p[i + 4], p[i + 5]], undefined, { colour: C.soffit });
  }
  const F = sideFrame('southwest'), eave = T.sides.southwest.eave, ym = (y0 + y1) / 2;
  for (const s of T.spots) {
    B.box('trim', F, s - 0.04, s + 0.04, eave, eave + 0.12, ym - 0.03, ym + 0.03, C.metal);
    B.box('trim', F, s - 0.07, s + 0.07, eave + 0.12, eave + 0.24, ym - 0.06, ym + 0.08, C.metal);
  }
  // the red sign on two posts, its face to the south-west (the way the buses come up the Talstrasse)
  const S = T.sign, sm = F.len / 2, sy0 = y1 + S.y0, sy1 = y1 + S.y1;
  B.box('trim', F, sm - S.w / 2, sm + S.w / 2, -S.back - 0.06, -S.back, sy0, sy1, C.red);
  for (const s of [sm - S.w / 2 + 0.2, sm + S.w / 2 - 0.25]) B.box('trim', F, s, s + 0.05, -S.back - 0.12, -S.back - 0.07, y1, sy0 + 0.1, C.metal);
  B.decal(F, sm - S.w / 2 + 0.02, sm + S.w / 2 - 0.02, -S.back + 0.005, sy0 + 0.02, sy1 - 0.02, 'sign');
}

/** An oriented collider box along a wall a → b (thin, centred on it), from `baseY` up to `top` */
function wallCollider(a, b, baseY, top, hz = 0.22) {
  const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY, minY: baseY, maxY: top, obb: { cx, cz, hx, hz, cs, sn } };
}

/**
 * Builds the Pischa terminal into `scene`. Returns { group, colliders }: its three closed walls' and the landing's edge
 * over the stairs (the outline js/landmarks.js SURVEYED_FOOTPRINTS holds), at world heights (baseY set).
 */
export function buildPischaTerminal(scene) {
  const root = new THREE.Group();
  root.name = 'Pischa terminal';
  root.userData.terrain = 'absolute'; // its heights come from the ground here (main.js placeOnTerrain leaves it be)
  const { floor: floorY, low } = floorOf(groundHeight);
  const base = low - T.foot;
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, name: 'Pischa terminal' }), M = materials();
  buildWalls(B, floorY, base);
  buildHall(B, floorY, base);
  buildSoutheast(B, floorY);
  buildNorthwest(B, floorY);
  buildRoof(B, floorY);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  const top = floorY + T.roof, g = groundOutline();
  const colliders = g.map((a, i) => wallCollider(a, g[(i + 1) % g.length], base, top));
  return { group: root, colliders };
}
