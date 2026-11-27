import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, nightGlow, worldNoise } from './building-kit.js';
import { KIRCHNER_MUSEUM as KM, hallWalls, onWall, outwardRing, sameWall, strayWalls, wallFrame } from './kirchner-museum-data.js';

export { KIRCHNER_MUSEUM } from './kirchner-museum-data.js';

// The Kirchner Museum Davos rebuilt by hand (js/kirchner-museum-data.js), standing in for its swissBUILDINGS3D volume,
// which the streamed tiles drew as one white block with the town houses' windows: the four exhibition cubes in their
// skin of matt greenish glass panels (drawn by the skin's material from its uv: metres along the wall from its middle,
// metres up from the ledge under the skylights' band) over a concrete plinth, the ledge and the coping; the low hall
// between them in dark glass between grey mullions over exposed concrete; the entrance between the two cubes on the
// Promenade, the name over its door and along the hall's front, the exhibition's poster on the east face. At night the
// skylights' band glows softly and the hall is lit. Five meshes: the skin, the hall's glass, the roofs, the trim (one
// vertex-coloured mesh: plinths, ledges, copings, the door) and the decals (one canvas atlas).

excludeBuildings([KM.exclude]);

const S = KM.skin, H = KM.hall;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.3, 0.3, 0.29], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, glowing at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.skin = SIMPLE_SKINS.glow([0.38, 0.43, 0.42], 0.4, 0.1, [0.95, 0.94, 0.88], 0.1);
    M.glass = SIMPLE_SKINS.glow([0.06, 0.07, 0.08], 0.12, 0.6, [1.0, 0.86, 0.66], 0.35);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(60, 260);
  const glow = nightGlow();
  // The cubes' skin: matt greenish glass panels a metre wide in thin aluminium joints; under the ledge (v < 0) rows of
  // panels, over it the skylights' band in one row, a shade lighter (the light ceilings behind it) and lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.12 });
    const P = S.panel, R = S.row;
    const band = step(0, V), lower = float(1).sub(band);
    const ju = smoothstep(P / 2 - 0.035, P / 2 - 0.018, abs(fract(U.div(P)).sub(0.5)).mul(P));
    const jv = smoothstep(R / 2 - 0.035, R / 2 - 0.018, abs(fract(V.div(R)).sub(0.5)).mul(R)).mul(lower);
    const joint = ju.max(jv).mul(near.mul(0.7).add(0.3));
    const row = floor(V.div(R)).mul(lower).sub(band.mul(7));
    const id = hash(floor(U.div(P)).mul(13.1).add(row.mul(7.7)));
    // (each panel a little lighter towards its head, where it mirrors the sky)
    const up = mix(fract(V.div(R)), V.div(S.band - S.coping).clamp(0, 1), band);
    let c = mix(vec3(0.33, 0.39, 0.38), vec3(0.42, 0.47, 0.455), id.mul(0.55).add(worldNoise(0.12).mul(0.45)));
    c = c.mul(up.mul(0.1).add(0.92));
    c = mix(c, c.mul(1.06).add(vec3(0.02, 0.02, 0.015)), band);
    m.colorNode = mix(c, vec3(0.25, 0.27, 0.27), joint);
    m.roughnessNode = mix(float(0.38), float(0.55), joint);
    m.emissiveNode = vec3(0.95, 0.94, 0.88).mul(band.mul(0.22).add(lower.mul(0.035))).mul(float(1).sub(joint)).mul(id.mul(0.2).add(0.9)).mul(glow);
    M.skin = m;
  }
  // The hall's glazing: dark panes between grey mullions every `bay` m, the foyer lit behind them at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.7 });
    const P = H.bay;
    const frame = smoothstep(P / 2 - 0.05, P / 2 - 0.035, abs(fract(U.div(P)).sub(0.5)).mul(P)).mul(near.mul(0.8).add(0.2));
    const id = hash(floor(U.div(P)).mul(17.3));
    const pane = mix(vec3(0.035, 0.045, 0.05), vec3(0.09, 0.11, 0.12), worldNoise(0.08)).add(vec3(0.015, 0.022, 0.03).mul(V.div(4).clamp(0, 1)));
    m.colorNode = mix(pane, vec3(0.16, 0.17, 0.17), frame);
    m.roughnessNode = mix(float(0.08), float(0.55), frame);
    m.metalnessNode = mix(float(0.7), float(0.3), frame);
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(float(1).sub(frame)).mul(id.mul(0.3).add(0.7)).mul(glow.mul(0.35));
    M.glass = m;
  }
  return M;
}

// --- The lettering and the poster: one canvas atlas ----------------------------------------------------------------------
const ATLAS_SIZE = [1024, 1024];
export const ATLAS = {
  poster: [0, 0, 560, 780],
  door: [580, 0, 420, 72],
  lettering: [0, 800, 1024, 72]
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  const font = (px, weight = 'bold') => { g.font = `${weight} ${px}px Helvetica, Arial, sans-serif`; };
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('door', (w, h) => { font(46); g.fillStyle = '#f1f1ec'; g.fillText('KIRCHNER MUSEUM DAVOS', w / 2, h / 2 + 2, w - 12); });
  cell('lettering', (w, h) => { font(60); g.fillStyle = '#f1f1ec'; g.fillText('K I R C H N E R   M U S E U M   D A V O S', w / 2, h / 2 + 3, w - 20); });
  // The exhibition's poster: a red sheet, a mountain valley drawn freely in strong flat colours with black outlines
  // (no artwork reproduced), the title under it
  cell('poster', (w, h) => {
    g.fillStyle = '#c3302a'; g.fillRect(0, 0, w, h);
    const x0 = 28, y0 = 28, pw = w - 56, ph = 520;
    g.save(); g.beginPath(); g.rect(x0, y0, pw, ph); g.clip();
    g.fillStyle = '#2f5fb3'; g.fillRect(x0, y0, pw, ph);
    g.fillStyle = '#f2c230'; g.beginPath(); g.arc(x0 + pw * 0.78, y0 + 90, 46, 0, Math.PI * 2); g.fill();
    const shape = (fill, pts) => {
      g.beginPath(); g.moveTo(x0 + pts[0][0] * pw, y0 + pts[0][1] * ph);
      for (const [px, py] of pts.slice(1)) g.lineTo(x0 + px * pw, y0 + py * ph);
      g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 7; g.strokeStyle = '#141414'; g.stroke();
    };
    shape('#b04fa0', [[-0.05, 0.62], [0.22, 0.2], [0.42, 0.5], [0.62, 0.16], [1.05, 0.58], [1.05, 1.1], [-0.05, 1.1]]);
    shape('#e8792a', [[-0.05, 0.7], [0.2, 0.44], [0.36, 0.62], [0.55, 0.38], [0.8, 0.6], [1.05, 0.46], [1.05, 1.1], [-0.05, 1.1]]);
    shape('#3e9a4a', [[-0.05, 0.8], [0.3, 0.72], [0.65, 0.8], [1.05, 0.74], [1.05, 1.1], [-0.05, 1.1]]);
    shape('#f0e04a', [[0.1, 1.1], [0.42, 0.8], [0.58, 0.8], [0.9, 1.1]]);
    for (const [hx, hy, s] of [[0.2, 0.83, 1], [0.72, 0.82, 0.8]]) {
      shape('#f4efe0', [[hx, hy], [hx + 0.1 * s, hy], [hx + 0.1 * s, hy + 0.07 * s], [hx, hy + 0.07 * s]]);
      shape('#c3302a', [[hx - 0.02 * s, hy], [hx + 0.05 * s, hy - 0.06 * s], [hx + 0.12 * s, hy]]);
    }
    g.restore();
    g.fillStyle = '#ffffff'; g.textAlign = 'left';
    font(40); g.fillText('Ernst Ludwig Kirchner', x0, 600, pw);
    font(30, 'normal'); g.fillText('Davoser Bergwelten', x0, 646, pw);
    font(24); g.fillText('Kirchner Museum Davos', x0, 730, pw);
    g.textAlign = 'center';
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  concrete: [0.27, 0.27, 0.26], hallConcrete: [0.25, 0.25, 0.24], ledge: [0.3, 0.31, 0.31], coping: [0.36, 0.37, 0.37],
  fascia: [0.11, 0.12, 0.12], door: [0.06, 0.065, 0.07], handle: [0.55, 0.56, 0.57], landing: [0.3, 0.3, 0.29]
};

/** The lowest ground along a wall (a step out of it) */
function lowestGround(F) {
  let low = Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 1.5))) low = Math.min(low, groundHeight(...onWall(F, s, 0.3)));
  return low;
}

// A cube: on every wall a concrete plinth, the glass skin over it up to the roof, the ledge under the skylights' band,
// a metal angle at its left corner, the coping along its head; the roof
function buildCube(B, cube) {
  const ring = outwardRing(cube.ring), top = cube.top, ledge = top - S.band;
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len < 0.05) continue;
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    const foot = Math.min(ledge - S.row, Math.max(KM.base + 0.5, lowestGround(F) + S.plinth)), mid = F.len / 2;
    B.quad('trim', P(0, KM.base), P(F.len, KM.base), P(F.len, foot), P(0, foot), undefined, { colour: C.concrete });
    B.quad('skin', P(0, foot), P(F.len, foot), P(F.len, top), P(0, top),
      [[-mid, foot - ledge], [mid, foot - ledge], [mid, top - ledge], [-mid, top - ledge]]);
    B.box('trim', F, 0, F.len, 0, 0.07, ledge - 0.06, ledge + 0.05, C.ledge);
    B.box('trim', F, 0, 0.07, 0, 0.05, foot, top - S.coping, C.ledge);
    B.box('trim', F, -0.06, F.len + 0.06, -0.12, 0.06, top - S.coping, top + 0.06, C.coping, { top: 'roof' });
  }
  flatRoof(B, ring, top);
}

// The hall: where it stands free, exposed concrete up to its glass (or the ground), the glass, the fascia; the roof over
// all of it. The entrance's wall has its glass down to the ground and the door in it
function buildHall(B) {
  const top = H.top;
  let entrance = null;
  for (const { a, b, F } of hallWalls()) {
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    const isEntrance = sameWall(a, b, KM.entrance.a, KM.entrance.b);
    const low = lowestGround(F);
    const foot = isEntrance ? groundHeight(...onWall(F, F.len / 2, 0.3)) + 0.02 : Math.max(low + H.plinth, top - H.fascia - H.glass);
    const mid = F.len / 2, y1 = top - H.fascia;
    B.quad('trim', P(0, KM.base), P(F.len, KM.base), P(F.len, foot), P(0, foot), undefined, { colour: C.hallConcrete });
    B.quad('glass', P(0, foot), P(F.len, foot), P(F.len, y1), P(0, y1), [[-mid, 0], [mid, 0], [mid, y1 - foot], [-mid, y1 - foot]]);
    B.box('trim', F, -0.05, F.len + 0.05, -0.1, 0.05, y1, top + 0.08, C.fascia, { top: 'roof' });
    if (isEntrance) entrance = { F, foot, low };
  }
  flatRoof(B, outwardRing(H.ring), top);
  return entrance;
}

// The entrance: the double door's frame and handles, the landing before it, the name over it
function buildEntrance(B, { F, foot, low }) {
  const E = KM.entrance, m = F.len / 2, d = E.door, y1 = foot + E.height;
  for (const s of [m - d, m + d]) B.box('trim', F, s - 0.06, s + 0.06, 0, 0.09, foot, y1, C.door);
  B.box('trim', F, m - d - 0.06, m + d + 0.06, 0, 0.09, y1, y1 + 0.12, C.door);
  B.box('trim', F, m - 0.03, m + 0.03, 0, 0.07, foot, y1, C.door);
  for (const s of [m - 0.14, m + 0.1]) B.box('trim', F, s, s + 0.04, 0.07, 0.12, foot + 0.6, foot + 1.6, C.handle);
  B.box('trim', F, m - 1.4, m + 1.4, 0, 1.2, low - 1, foot + 0.02, C.landing);
  B.decal(F, m - E.sign.w / 2, m + E.sign.w / 2, 0.03, foot + E.sign.y0, foot + E.sign.y1, 'door');
}

/**
 * Builds the Kirchner Museum into `scene`. Returns { group, colliders } (colliders at world heights: baseY set, so
 * liftColliders leaves them be). The walls of OpenStreetMap's footprint are js/buildings.js'; the surveyed cubes stand
 * within half a metre of it but at two corners (the north-west cube's west one, the south-west cube's south one), whose
 * walls get thin colliders of their own.
 */
export function buildKirchnerMuseum(scene) {
  const root = new THREE.Group();
  root.name = 'Kirchner Museum';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, name: 'Kirchner Museum' }), M = materials();
  for (const cube of KM.cubes) buildCube(B, cube);
  const entrance = buildHall(B);
  if (entrance) buildEntrance(B, entrance);
  const L = KM.lettering, LF = wallFrame(L.a, L.b);
  B.decal(LF, (LF.len - L.w) / 2, (LF.len + L.w) / 2, 0.03, L.y0, L.y1, 'lettering');
  const Po = KM.poster, PF = wallFrame(Po.a, Po.b);
  B.decal(PF, PF.len - Po.fromEnd - Po.w, PF.len - Po.fromEnd, 0.05, Po.y0, Po.y1, 'poster');
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  const colliders = [];
  for (const { a, b, top } of strayWalls()) {
    const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2, hz = 0.22;
    const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: KM.base, minY: KM.base, maxY: top, obb: { cx, cz, hx, hz, cs, sn } });
  }
  return { group: root, colliders };
}
