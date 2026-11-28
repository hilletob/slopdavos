import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, worldNoise } from './building-kit.js';
import { ETTINGER_PLATZ, boardFrame, groundOutlines, onWall, outwardRing, wallFrame, wallOf } from './ettinger-platz-data.js';

export { ETTINGER_PLATZ };

// The house of Ettinger Fashion on the Promenade in Davos Platz rebuilt by hand (js/ettinger-platz-data.js), standing
// in for its swissBUILDINGS3D volume, which the streamed tiles drew as one white block with the town houses' windows:
// the low shop pavilion in white plaster, tall shop windows between dark brown posts on a granite plinth under a blue
// band, the blue awning along the Promenade, the closed end on the lane with "ettinger" and "sport" on it, the slab of
// its flat roof out over the walls with a dark edge, and the board on its post by the north-east corner. Five meshes:
// the plaster, the glass, the roof, the trim (one vertex-coloured mesh) and the decals (one canvas atlas: the lettering
// and the board).

excludeBuildings([ETTINGER_PLATZ.exclude]);
// (the player's walls on the surveyed walls, not on OSM's outline, which traced the roof's slab: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(ETTINGER_PLATZ.osm, groundOutlines());
// (the shop's name is on its wall and its board: no generic sign, js/shops.js)
SHOP_EXCLUSIONS.add(ETTINGER_PLATZ.shop);

const E = ETTINGER_PLATZ;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const WHITE = [0.6, 0.6, 0.58];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.24, 0.24, 0.235], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, the shop windows glowing faintly at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.plain([0.56, 0.56, 0.54], 0.9);
    M.glass = SIMPLE_SKINS.glow([0.07, 0.085, 0.095], 0.1, 0.8, [1.0, 0.86, 0.66], 0.14);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(8, 28);
  const glow = nightGlow();
  // White plaster: a little weathering, a shade greyer at its foot (v: metres over the plinth)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const foot = smoothstep(0.6, 0.0, V).mul(0.08);
    m.colorNode = mix(vec3(0.54, 0.54, 0.52), vec3(...WHITE).mul(1.04), worldNoise(0.3)).mul(float(1).sub(foot));
    M.plaster = m;
  }
  // The shop windows (u along the wall, v up from the glass' foot): big dark panes, a thin joint every 2.4 m and a
  // transom 2.75 m up, the goods behind them a shade lighter in the lower half; at night the shop is shut: a faint glow
  // behind most panes, a few lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.8 });
    const joint = smoothstep(0.485, 0.495, abs(fract(U.div(2.4)).sub(0.5))).mul(fine);
    const transom = smoothstep(0.035, 0.02, abs(V.sub(2.75))).mul(near.mul(0.85).add(0.15));
    const frame = joint.max(transom);
    const cell = floor(U.div(2.4));
    const paneId = hash(cell.mul(13.1).add(3.3));
    const goods = smoothstep(2.2, 0.6, V).mul(hash(floor(U.div(0.55)).mul(7.1).add(cell)).mul(0.06)).mul(fine);
    m.colorNode = mix(mix(vec3(0.05, 0.062, 0.072), vec3(0.12, 0.14, 0.15), paneId).add(goods), vec3(0.1, 0.035, 0.02), frame);
    m.roughnessNode = mix(float(0.08), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.1), frame);
    const on = litWindow(cell, float(0), 47, { share: 0.25, late: 0.08, tone: twoTones([1.0, 0.86, 0.66], [0.92, 0.94, 1.0], 0.6) });
    m.emissiveNode = vec3(1.0, 0.82, 0.6).mul(0.06).add(on.mul(0.55)).mul(float(1).sub(frame)).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The decals: one canvas atlas --------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 256];
export const ATLAS = {
  ettinger: [0, 0, 512, 256],
  board: [512, 0, 512, 256]
};
const BLUE = '#1f3274', GREY = '#8d939b';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // "ettinger" in blue, "sport" in grey under its right half (plain text, no logo)
  const letters = (w, h, px) => {
    g.textBaseline = 'alphabetic';
    g.font = `bold ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    g.textAlign = 'center'; g.fillStyle = BLUE; g.fillText('ettinger', w / 2, h * 0.5, w - 24);
    g.font = `bold ${Math.round(px * 0.8)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    g.textAlign = 'right'; g.fillStyle = GREY; g.fillText('sport', w * 0.84, h * 0.86, w * 0.6);
  };
  cell('ettinger', (w, h) => letters(w, h, 118));
  // The board: white with a grey edge, the same lettering
  cell('board', (w, h) => {
    g.fillStyle = '#f2f2ef'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a8d90'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    letters(w, h, 112);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  granite: [0.27, 0.265, 0.255], post: [0.1, 0.035, 0.02], band: [0.02, 0.055, 0.2], awning: [0.025, 0.06, 0.19],
  slab: [0.2, 0.2, 0.205], coping: [0.3, 0.3, 0.3], soffit: [0.45, 0.45, 0.44], door: [0.24, 0.24, 0.25], step: [0.32, 0.31, 0.3],
  pole: [0.4, 0.41, 0.42]
};

const P3 = (F, s, y, o = 0) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
/** The highest ground before a wall (half a metre out) */
export function footOf(F) {
  let hi = -Infinity;
  const n = Math.max(1, Math.ceil(F.len / 0.75));
  for (let k = 0; k <= n; k++) { const [x, z] = onWall(F, (k * F.len) / n, 0.5); hi = Math.max(hi, groundHeight(x, z)); }
  return hi;
}
/** A stretch of plaster s0–s1 from y0 to y1 (uv: metres along, metres over the plinth `foot`) */
function plaster(B, F, s0, s1, y0, y1, foot) {
  if (y1 - y0 < 0.005 || s1 - s0 < 0.005) return;
  B.quad('plaster', P3(F, s0, y0), P3(F, s1, y0), P3(F, s1, y1), P3(F, s0, y1), [[s0, y0 - foot], [s1, y0 - foot], [s1, y1 - foot], [s0, y1 - foot]]);
}

// A wall: the plinth along it, its shop windows (posts, the blue band over them, the doors), plaster round them up
// under the slab, the lettering, the awning
function buildWall(B, i, top) {
  const W = E.walls[i], F = wallOf(i);
  if (F.len < 0.05) return;
  const foot = footOf(F), g = foot + E.plinth, gt = E.glassTop;
  B.box('trim', F, 0, F.len, 0, 0.06, E.base, g, C.granite);
  // the stretches without glass, full height; over the glass the plaster from the band up
  let at = 0;
  for (const [s0, s1] of W.glass || []) {
    plaster(B, F, at, s0, g, top, g);
    B.quad('glass', P3(F, s0, g), P3(F, s1, g), P3(F, s1, gt), P3(F, s0, gt), [[s0, 0], [s1, 0], [s1, gt - g], [s0, gt - g]]);
    plaster(B, F, s0, s1, gt, top, g);
    B.box('trim', F, s0, s1, 0, 0.1, E.band[0], E.band[1], C.band);
    B.box('trim', F, s0, s1, 0, 0.12, g - 0.05, g, C.granite);
    at = s1;
  }
  plaster(B, F, at, F.len, g, top, g);
  for (const s of W.posts || []) {
    const s0 = Math.max(0, s - 0.14), s1 = Math.min(F.len, s + 0.14);
    B.box('trim', F, s0, s1, 0, 0.12, g, E.band[0], C.post);
  }
  // the doors: a brown frame round the glazed leaves, a post between them, a step before them
  for (const [d0, d1] of W.doors || []) {
    const dt = foot + 2.45, m = (d0 + d1) / 2;
    B.box('trim', F, d0, d1, 0, 0.13, dt, dt + 0.12, C.post);
    for (const s of [d0, m, d1]) B.box('trim', F, s - 0.05, s + 0.05, 0, 0.13, foot + 0.05, dt, C.post);
    B.box('trim', F, d0, d1, 0, 0.13, foot + 0.05, g - 0.05, [0.06, 0.07, 0.08]); // (the door's glass down to the sill)
    B.box('trim', F, d0 - 0.2, d1 + 0.2, 0, 0.55, E.base, foot + 0.12, C.step);
  }
  // a plain door at the back
  if (W.backDoor) {
    const [d0, d1] = W.backDoor;
    B.box('trim', F, d0 - 0.08, d1 + 0.08, 0, 0.04, foot + 0.1, foot + 2.3, C.granite);
    B.box('trim', F, d0, d1, 0.04, 0.07, foot + 0.12, foot + 2.2, C.door);
    B.box('trim', F, d0 - 0.25, d1 + 0.25, 0, 0.6, E.base, foot + 0.1, C.step);
  }
  if (W.letters) { const L = W.letters; B.decal(F, L.from, L.to, 0.03, L.y0, L.y1, L.key); }
  // the awning: the cloth sloping out from over the band, both its sides; the valance along its edge; its ends
  if (W.awning) {
    const { out, rise, valance } = W.awning, y1 = E.band[1] + 0.15, y0 = y1 - rise;
    const a = P3(F, 0, y1), b = P3(F, F.len, y1), c = P3(F, F.len, y0, out), d = P3(F, 0, y0, out);
    B.quad('trim', d, c, b, a, undefined, { colour: C.awning });
    B.quad('trim', a, b, c, d, undefined, { colour: C.awning });
    B.box('trim', F, 0, F.len, out - 0.03, out, y0 - valance, y0, C.awning);
    B.tri('trim', P3(F, 0, y0, out), P3(F, 0, y1), P3(F, 0, y0), undefined, { colour: C.awning });
    B.tri('trim', P3(F, F.len, y0), P3(F, F.len, y1), P3(F, F.len, y0, out), undefined, { colour: C.awning });
  }
}

// The roof: the slab out over the walls (its dark edge, a coping on it, its underside), the flat roof inside
function buildRoof(B) {
  const R = E.roof, ring = outwardRing(R.ring);
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len < 0.02) continue;
    B.quad('trim', P3(F, 0, R.soffit), P3(F, F.len, R.soffit), P3(F, F.len, R.edge), P3(F, 0, R.edge), undefined, { colour: C.slab });
    if (F.len > 0.7) B.box('trim', F, 0.05, F.len - 0.05, -0.3, 0, R.top, R.edge, C.coping, { top: 'roof' });
  }
  flatRoof(B, ring, R.top);
  // (the underside, facing down)
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = [ring[i], ring[j], ring[k]].map((q) => [q[0], R.soffit, q[1]]);
    const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
    const t = up ? [p[0], p[2], p[1]] : p;
    B.tri('trim', t[0], t[1], t[2], undefined, { colour: C.soffit });
  }
}

// The board on its post by the north-east corner: the post from the ground up to it, its frame, both faces lettered.
// Returns the post's collider
function buildBoard(B) {
  const Bd = E.board, { F, x, z } = boardFrame(), foot = groundHeight(x, z), m = Bd.w / 2, p = Bd.post;
  B.box('trim', F, m - p, m + p, -p, p, foot - 0.3, Bd.y0, C.pole);
  B.box('trim', F, -0.03, Bd.w + 0.03, -0.03, 0.03, Bd.y0 - 0.04, Bd.y1 + 0.04, C.pole);
  B.decal(F, 0, Bd.w, 0.035, Bd.y0, Bd.y1, 'board');
  const back = { a: onWall(F, Bd.w, -0.035), u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]], len: Bd.w };
  B.decal(back, 0, Bd.w, 0, Bd.y0, Bd.y1, 'board');
  const h = p + 0.05;
  return wallCollider(onWall(F, m - h), onWall(F, m + h), foot - 0.3, Bd.y1, h);
}

/** An oriented collider box along a wall a → b (thin, centred on it), from `baseY` up to `top` */
function wallCollider(a, b, baseY, top, hz) {
  const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY, minY: baseY, maxY: top, obb: { cx, cz, hx, hz, cs, sn } };
}

/**
 * Builds the house of Ettinger Fashion into `scene`. Returns { group, colliders }: the board's post (the walls stand on
 * the surveyed outline, js/landmarks.js; the steps before the doors are low enough to walk up), at world heights.
 */
export function buildEttingerPlatz(scene) {
  const root = new THREE.Group();
  root.name = 'Ettinger Platz';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, name: 'Ettinger Platz' }), M = materials();
  for (let i = 0; i < E.walls.length; i++) buildWall(B, i, E.roof.soffit + 0.05);
  buildRoof(B);
  const post = buildBoard(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [post] };
}
