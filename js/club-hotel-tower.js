import * as THREE from 'three/webgpu';
import { abs, float, hash, mix, smoothstep, step, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { CLUB_HOTEL } from './club-hotel-data.js';
import { CLUB_HOTEL_TOWER, isClosed, isDeep, letteringSpan, onWall, outwardRing, pointInRing, ringWalls, volumes, wallAt, wallFrame, walls } from './club-hotel-tower-data.js';

export { CLUB_HOTEL_TOWER };

// The Club Hotel Davos's tower house on the Promenade rebuilt by hand (js/club-hotel-tower-data.js), standing in for
// its swissBUILDINGS3D batch, which the streamed tiles drew as white blocks with the town houses' windows: the tower's
// surveyed volume clad in light blue, its jogs and the north-east face's step back in deep blue, a window in a dark frame
// in every bay of every floor (drawn by the wall's material from its uv: metres along the wall from its middle, metres
// up the floors' grid; narrow ones in the deep blue), a closed plinth where the ground climbs to the Obere Strasse, the
// brown fascia round the flat roof, the lift's housing on it, "club hotel" reading upwards down the north-east face
// beside the step back; the annex south of it, the garage's deck with its door on the lane and the terrace round the
// west end, all in the white of the hotel's other house (js/club-hotel.js); the hotel's sign on two posts at the
// Promenade's corner. Six meshes: the light blue, the deep blue, the white, the roofs, the trim (one vertex-coloured
// mesh) and the lettering (one canvas atlas). Its own lettering stands for js/shops.js' generic sign on this house;
// the other house keeps its.

excludeBuildings([CLUB_HOTEL_TOWER.exclude]);
SHOP_EXCLUSIONS.add(CLUB_HOTEL_TOWER.osm);
// (the player's walls on the surveyed outlines, not on OSM's: js/landmarks.js. The deck, the terrace and the sign have no
// OpenStreetMap outline: their walls are returned as colliders)
SURVEYED_FOOTPRINTS.set(CLUB_HOTEL_TOWER.osm, [CLUB_HOTEL_TOWER.ring]);
SURVEYED_FOOTPRINTS.set(CLUB_HOTEL_TOWER.annex.osm, [CLUB_HOTEL_TOWER.annex.ring]);

const H = CLUB_HOTEL_TOWER, WIN = H.win, STOREY = H.storey, BAY = H.bay;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the top floor's at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- The atlas ---------------------------------------------------------------------------------------------------------
const ATLAS_SIZE = [256, 1024];
const ATLAS = { lettering: [0, 0, 128, 1024], sign: [128, 0, 128, 74] };
function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // "club hotel" in pale lower-case letters reading upwards (their tops to the left)
  cell('lettering', (w, h) => {
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-Math.PI / 2);
    g.fillStyle = '#dce2f4';
    g.font = `500 ${Math.round(w * 0.74)}px "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(H.lettering.text, 0, 2, h * 0.97);
    g.restore();
  });
  // The sign at the corner: white, a green band with the name, the arrows to the entrance and to the garage
  cell('sign', (w, h) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f6b3c'; g.fillRect(4, 4, w - 8, h * 0.36);
    g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(h * 0.26)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('club hotel', w / 2, 4 + h * 0.18);
    g.fillStyle = '#1e2a3a'; g.font = `bold ${Math.round(h * 0.2)}px Arial, sans-serif`; g.textAlign = 'left';
    g.fillText('▲ Eingang', 8, h * 0.58);
    g.fillText('Garage ▶', 8, h * 0.82);
    g.strokeStyle = '#7a7a76'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
  return canvasTexture(canvas);
}

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const LIGHT = [0.13, 0.2, 0.56], DEEP = [0.03, 0.045, 0.27], WHITE = [0.58, 0.58, 0.56], FRAME = [0.05, 0.045, 0.045];
// A wall with a window in every bay of every floor: a dark frame, a post in the wide ones' middle, a sill, a light
// curtain drawn in some; hotel rooms lit here and there in the evening
function windowedWall(base, winHalf, seed, { post = true, sill = [0.5, 0.52, 0.56] } = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const near = fade(140, 420), fine = fade(25, 80);
  const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf });
  const win = rect(winHalf, WIN.lo, WIN.hi).mul(open);
  const mullion = post ? smoothstep(0.04, 0.025, abs(bu)).mul(near) : float(0);
  const pane = rect(winHalf - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(mullion)).mul(open);
  const sl = rect(winHalf + 0.05, WIN.lo - 0.06, WIN.lo).mul(open).mul(near);
  const stain = rect(winHalf, WIN.lo - 0.7, WIN.lo - 0.06, 0.2).mul(open).mul(0.05);
  const wall = mix(vec3(...base).mul(0.93), vec3(...base).mul(1.05), worldNoise(0.3)).mul(float(1).sub(stain)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)).add(seed));
  const drawn = step(0.45, id).mul(mix(float(0.4), float(1), step(0.8, id)));
  const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(WIN.hi - WIN.lo - 0.14)), fv).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.025, 0.035), vec3(0.07, 0.085, 0.11), worldNoise(0.07));
  let c = mix(wall, vec3(...sill), sl);
  c = mix(c, vec3(...FRAME), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.5, 0.49, 0.46), curtain);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.9), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), seed, { share: 0.36, late: 0.1, tone: twoTones([1.0, 0.76, 0.46], [0.9, 0.92, 1.0], 0.82) })
    .mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(nightGlow().mul(1.1));
  return m;
}
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.3, 0.3, 0.29], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  M.decal = decalMaterial(atlasTexture());
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.light = SIMPLE_SKINS.windowed([0.12, 0.18, 0.5], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35);
    M.deep = SIMPLE_SKINS.windowed([0.03, 0.045, 0.25], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.25);
    M.white = SIMPLE_SKINS.windowed([0.52, 0.52, 0.5], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.3);
    return M;
  }
  M.light = windowedWall(LIGHT, WIN.half, 31);
  M.deep = windowedWall(DEEP, H.narrow, 47, { post: false, sill: [0.2, 0.22, 0.3] });
  M.white = windowedWall(WHITE, WIN.half, 59, { sill: [0.44, 0.44, 0.43] });
  return M;
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  fascia: [0.27, 0.13, 0.055], housing: [0.12, 0.18, 0.5], housingTop: [0.3, 0.3, 0.29], coping: [0.6, 0.6, 0.58],
  door: [0.17, 0.18, 0.19], doorFrame: [0.4, 0.4, 0.39], lintel: [0.5, 0.5, 0.48], post: [0.45, 0.46, 0.47], panel: [0.7, 0.7, 0.68]
};

const P = (F, s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
// The stretch s0–s1 of a wall as a wall of its own
const sub = (F, s0, s1) => ({ a: onWall(F, s0), u: F.u, n: F.n, len: s1 - s0 });
// A stretch of a wall from y0 to y1 on a floors' grid whose top floor ends at `line`, its storeys `sw` m high (stretched
// onto STOREY), with windows or closed
function strip(B, bucket, F, y0, y1, line, sw, windows) {
  if (y1 - y0 < 0.01) return;
  const mid = F.len / 2, open = windows && F.len >= 1.6, k = STOREY / sw;
  const v = (y) => (y - line) * k + UP - (open ? 0 : CLOSED);
  B.quad(bucket, P(F, 0, y0), P(F, F.len, y0), P(F, F.len, y1), P(F, 0, y1), [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half: open ? mid : 0 });
}
// A wall from `base` to `top`: closed up to the first storey whose windows clear the ground along it, windows to `line`,
// closed above
function face(B, bucket, F, { base, line, top, sw, ground, windows = true }) {
  const hi = ground + 0.25, lo = WIN.lo * sw / STOREY;
  let lowest = line;
  while (lowest - sw > base && lowest - sw + lo >= hi) lowest -= sw;
  if (!windows) lowest = line;
  strip(B, bucket, F, base, lowest, line, sw, false);
  strip(B, bucket, F, lowest, line, line, sw, true);
  strip(B, bucket, F, line, top, line, sw, false);
}

// The ground here: the terrain, or the deck's or the terrace's top where they stand
const LOW = volumes().filter((v) => v.name === 'deck' || v.name === 'terrace');
function groundAt(x, z) {
  let y = groundHeight(x, z);
  for (const v of LOW) if (pointInRing(v.ring, x, z)) y = Math.max(y, v.top);
  return y;
}
/** The highest ground along a wall, half a metre out of it (the deck and the terrace counted) */
export function groundAlong(F, ground = groundAt) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, ground(...onWall(F, s, 0.5)));
  return hi;
}
/** The lowest terrain along a wall, half a metre out of it */
export function groundBelow(F) {
  let lo = Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) lo = Math.min(lo, groundHeight(...onWall(F, s, 0.5)));
  return lo;
}

// The tower: light blue walls with their windows, the deep blue ones, the lettering's wall with its windows only
// before it, the fascia round the roof, the roof and the lift's housing
function buildTower(B) {
  const L = letteringSpan();
  for (const w of walls()) {
    const { F } = w;
    if (F.len < 0.05) continue;
    const bucket = isDeep(w) ? 'deep' : 'light', ground = groundAlong(F);
    const opt = { base: H.base, line: H.line, top: H.top, sw: STOREY, ground, windows: !isClosed(w) };
    if (w === L.w) {
      const [s0, s1] = L.atB ? [0, L.windowsTo] : [L.windowsTo, F.len];
      const [c0, c1] = L.atB ? [L.windowsTo, F.len] : [0, L.windowsTo];
      face(B, bucket, sub(F, s0, s1), opt);
      face(B, bucket, sub(F, c0, c1), { ...opt, windows: false });
      B.decal(F, L.s0, L.s1, 0.03, H.lettering.y0, H.lettering.y1, 'lettering');
    } else face(B, bucket, F, opt);
    // the brown fascia round the roof
    B.box('trim', F, -0.08, F.len + 0.08, -0.3, 0.12, H.top - 0.5, H.top + 0.06, C.fascia);
  }
  flatRoof(B, outwardRing(H.ring), H.top);
  // the lift's housing
  const K = H.housing, F = wallFrame(K.a, K.b);
  B.box('trim', F, 0, F.len, -K.depth, 0, H.top - 0.1, H.top + K.h, C.housing, { top: 'roof' });
  B.box('trim', F, -0.1, F.len + 0.1, -K.depth - 0.1, 0.1, H.top + K.h, H.top + K.h + 0.18, C.fascia);
}

// What stands before a wall of a low piece (the annex, the deck, the terrace): the tallest of the other volumes, the
// tower and the hotel's other house whose outline holds the point 0.3 m out of its middle (−Infinity: none)
const OTHERS = [...volumes(), { name: 'club hotel', ring: CLUB_HOTEL.ring, top: CLUB_HOTEL.top }];
function coveredTo(F, self) {
  const [x, z] = onWall(F, F.len / 2, 0.3);
  let y = -Infinity;
  for (const v of OTHERS) if (v.name !== self && pointInRing(v.ring, x, z)) y = Math.max(y, v.top);
  return y;
}

// The annex: white walls with two floors of windows, the coping, the roof
function buildAnnex(B) {
  const A = H.annex;
  for (const { F } of ringWalls(A.ring)) {
    if (F.len < 0.05) continue;
    const cover = coveredTo(F, 'annex');
    if (cover >= A.top) continue;
    face(B, 'white', F, { base: Math.max(H.base, cover), line: A.line, top: A.top, sw: A.storey, ground: groundAlong(F) });
    B.box('trim', F, -0.05, F.len + 0.05, -0.25, 0.08, A.top - 0.3, A.top + 0.12, C.coping);
  }
  flatRoof(B, outwardRing(A.ring), A.top);
}

/** The walls of the deck and the terrace standing free (not inside another volume): [{ F, from, top }] */
export function lowWalls() {
  const out = [];
  for (const [name, piece] of [['deck', H.deck], ['terrace', H.terrace]]) {
    for (const { F } of ringWalls(piece.ring)) {
      if (F.len < 0.05) continue;
      const cover = coveredTo(F, name);
      if (cover >= piece.top) continue;
      out.push({ F, name, from: cover, top: piece.top });
    }
  }
  return out;
}

// The deck and the terrace: closed white walls with a coping, their flat tops, the garage's door
function buildLow(B) {
  for (const { F, from, top } of lowWalls()) {
    face(B, 'white', F, { base: Math.max(H.base, from), line: top, top, sw: STOREY, ground: 0, windows: false });
    B.box('trim', F, -0.04, F.len + 0.04, -0.25, 0.06, top - 0.25, top + 0.1, C.coping);
  }
  flatRoof(B, outwardRing(H.deck.ring), H.deck.top);
  flatRoof(B, outwardRing(H.terrace.ring), H.terrace.top);
  // the garage's door on the lane: a grey sectional door in a light frame, a lintel over it
  const G = garageDoor();
  const { F, s0, s1, foot } = G;
  B.box('trim', F, s0, s1, 0, 0.05, foot, foot + H.garage.h, C.door);
  for (let y = foot + 0.5; y < foot + H.garage.h - 0.1; y += 0.5) B.box('trim', F, s0 + 0.05, s1 - 0.05, 0.05, 0.07, y - 0.02, y + 0.02, C.doorFrame);
  for (const s of [s0 - 0.15, s1]) B.box('trim', F, s, s + 0.15, 0, 0.12, foot, foot + H.garage.h + 0.15, C.doorFrame);
  B.box('trim', F, s0 - 0.3, s1 + 0.3, 0, 0.25, foot + H.garage.h + 0.15, foot + H.garage.h + 0.45, C.lintel);
}

/** The garage's door: its wall, its stretch along it and its foot on the lane */
export function garageDoor() {
  const w = wallAt(ringWalls(H.deck.ring), H.garage.wall), F = w.F, m = F.len / 2;
  return { F, s0: m - H.garage.w / 2, s1: m + H.garage.w / 2, foot: groundHeight(...onWall(F, m, 1)) };
}

/** The sign's frame (u along its panel, n towards the traffic) and its foot */
export function signFrame() {
  const S = H.sign, u = [S.facing[1], -S.facing[0]];
  const a = [S.x - u[0] * S.w / 2, S.z - u[1] * S.w / 2], b = [S.x + u[0] * S.w / 2, S.z + u[1] * S.w / 2];
  // (wallFrame's n is (−u.z, u.x): the facing)
  return { a, b, F: wallFrame(a, b), foot: groundHeight(S.x, S.z) };
}

// The sign at the Promenade's corner: two posts, the panel with its face from the atlas
function buildSign(B) {
  const S = H.sign, { F, foot } = signFrame(), y0 = foot + S.y, y1 = y0 + S.h;
  for (const s of [0.08, S.w - 0.16]) B.box('trim', F, s, s + 0.08, -0.08, 0, foot - 0.2, y1 + 0.05, C.post);
  B.box('trim', F, 0, S.w, -0.03, 0.02, y0, y1, C.panel);
  B.decal(F, 0.02, S.w - 0.02, 0.025, y0 + 0.02, y1 - 0.02, 'sign');
}

/** An oriented collider box along a wall a → b (thin, centred on it), from `baseY` up to `top` */
function wallCollider(a, b, baseY, top, hz = 0.22) {
  const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY, minY: baseY, maxY: top, obb: { cx, cz, hx, hz, cs, sn } };
}

/** The colliders: the deck's and the terrace's free walls, the sign's posts and panel (world heights, baseY set) */
export function colliders() {
  const out = [];
  for (const { F, top } of lowWalls()) {
    const base = groundBelow(F) - 0.5;
    if (top - base < 0.3) continue;
    out.push(wallCollider(F.a, onWall(F, F.len), base, top));
  }
  const { a, b, foot } = signFrame();
  out.push(wallCollider(a, b, foot - 0.2, foot + H.sign.y + H.sign.h, 0.1));
  return out;
}

/**
 * Builds the Club Hotel's tower house, its annex, the garage's deck, the terrace and the sign into `scene`. Returns
 * { group, colliders } (the tower's and the annex's walls stand on their surveyed outlines, js/landmarks.js; the
 * colliders are the deck's, the terrace's and the sign's).
 */
export function buildClubHotelTower(scene) {
  const root = new THREE.Group();
  root.name = 'Club Hotel tower';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['light', 'deep', 'white'], name: 'Club Hotel tower' }), M = materials();
  buildTower(B);
  buildAnnex(B);
  buildLow(B);
  buildSign(B);
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: colliders() };
}
