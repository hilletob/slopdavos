import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { HAUS_FROHSINN, floorY, inAnnex, onWall, outwardRing, roofRing, soffitY, wallFrame, walls, groundOutlines } from './haus-frohsinn-data.js';

export { HAUS_FROHSINN };

// Haus Frohsinn rebuilt by hand (js/haus-frohsinn-data.js), standing in for its swissBUILDINGS3D volume, which the
// streamed tiles drew as a white block with the town houses' windows: the block of five floors in pale cream plaster
// over a grey plinth that grows to a storey down the slope, under a flat roof with a dark edge and a timber soffit
// reaching over the walls; along the south side the deep balconies between the closed ends (white slabs, dark timber
// rails, the partitions between the flats, thin white posts), a balcony door and a window in turn behind them, the
// ground floor's terrace on its stone wall with the entrance; the north side's rows of windows in dark brown frames
// (drawn by the wall's material from its uv: metres along the wall from its middle, metres up the floors' grid); the
// closed ends with their columns of windows and "FROHSINN" on the west end; the low annex at the north-east corner.
// Five meshes: the walls, the roofs, the glass, the trim (one vertex-coloured mesh) and the name (one canvas atlas).

excludeBuildings(HAUS_FROHSINN.exclude);
// (the player's walls on the surveyed walls and the terrace's edge, and the annex's, not on OSM's outline, which stands
// up to 1.1 m off them: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(HAUS_FROHSINN.osm, groundOutlines());
// (the annex has its own OSM footprint, w1529620015, standing 0.6 m out of its surveyed east wall: its walls on the survey too)
SURVEYED_FOOTPRINTS.set('w1529620015', [HAUS_FROHSINN.annex.ring]);

const H = HAUS_FROHSINN, STOREY = H.storey, BAY = H.bay, WIN = H.win, FOOT = H.foot;
// v of a wall: metres up the floors' grid, the ground floor's foot at 40 storeys (the south wall's at 140: the
// material tells it by that and puts its balcony doors in); closed walls carry v − CLOSED
const UP = 40 * STOREY, UP_SOUTH = 140 * STOREY, CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.55, 0.52, 0.42], FRAME = [0.1, 0.05, 0.025];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.25, 0.24, 0.23], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.5, 0.47, 0.38], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4, { bay: BAY, half: WIN.half });
    M.glass = SIMPLE_SKINS.glow([0.05, 0.06, 0.065], 0.1, 0.8, [1.0, 0.76, 0.5], 0.35);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420);
  const glow = nightGlow();
  // Cream plaster with a window per bay and floor: a dark brown frame with a post in its middle, a light sill; on the
  // south wall over the ground floor every other bay a balcony door; a curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const door = step(140.5, storey).mul(float(1).sub(step(0.25, fract(bay.mul(0.5)))));
    const lo = mix(float(WIN.lo), float(H.door), door);
    const rect = (hw, l, hi, e = 0.012) => smoothstep(hw + e, hw - e, abs(bu)).mul(smoothstep(l.sub(e), l.add(e), fv)).mul(smoothstep(hi + e, hi - e, fv));
    const win = rect(WIN.half, lo, WIN.hi).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu));
    const pane = rect(WIN.half - 0.08, lo.add(0.08), WIN.hi - 0.08).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.08, float(WIN.lo - 0.08), WIN.lo).mul(open).mul(near).mul(float(1).sub(door));
    const stain = rect(WIN.half, float(WIN.lo - 0.8), WIN.lo - 0.08, 0.2).mul(open).mul(near).mul(0.05);
    const wall = mix(vec3(...PLASTER).mul(0.94), vec3(...PLASTER).mul(1.05), worldNoise(0.3)).mul(float(1).sub(stain));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.3), float(0.9), step(0.85, id)));
    const curtain = step(float(WIN.hi - 0.08).sub(drawn.mul(float(WIN.hi - 0.16).sub(lo))), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.075, 0.09, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(0.48, 0.46, 0.4), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.55, 0.5, 0.42), curtain);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (flats: lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 71, { share: 0.45, late: 0.1, tone: twoTones([1.0, 0.74, 0.45], [0.92, 0.88, 0.8], 0.75) }).mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The panes of the windows modelled in the trim (the closed ends', the entrance's): each its own cell of the uv
  // (floor(u), floor(v)), lit or dark by it at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.6 });
    const cx = floor(U), cy = floor(V);
    m.colorNode = mix(vec3(0.03, 0.036, 0.042), vec3(0.08, 0.09, 0.1), hash(cx.mul(13.1).add(cy.mul(7.3))));
    m.emissiveNode = litWindow(cx, cy, 73, { share: 0.45, late: 0.1, tone: twoTones([1.0, 0.74, 0.45], [0.92, 0.88, 0.8], 0.75) }).mul(glow.mul(1.1));
    M.glass = m;
  }
  return M;
}

// --- The name: one canvas atlas ------------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 128];
export const ATLAS = {
  name: [0, 0, 1024, 128] // "FROHSINN" in dark capitals (4 × 0.5 m)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('name', (w, h) => {
    g.font = '500 92px Georgia, "Times New Roman", serif';
    g.fillStyle = '#2a2622';
    // (spaced capitals, as painted on the wall)
    const t = 'FROHSINN', step = (w * 0.78) / t.length;
    for (let i = 0; i < t.length; i++) g.fillText(t[i], w * 0.11 + step * (i + 0.5), h / 2 + 4, step);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  plaster: [0.52, 0.49, 0.4], plinth: [0.2, 0.2, 0.19], stone: [0.22, 0.2, 0.17], frame: FRAME, band: [0.47, 0.45, 0.38],
  slab: [0.5, 0.49, 0.45], timber: [0.13, 0.07, 0.035], cap: [0.09, 0.05, 0.025], post: [0.56, 0.57, 0.56],
  fascia: [0.07, 0.045, 0.03], soffit: [0.24, 0.13, 0.06], annex: [0.3, 0.3, 0.28], coping: [0.4, 0.4, 0.38], door: [0.16, 0.15, 0.14]
};

/** A wall's point in the world: s along it, y up, `o` out of it */
const at = (F, s, y, o = 0) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };

/** The highest ground along a wall from s0 to s1, half a metre out of it */
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.5));
  for (let k = 0; k <= n; k++) { const [x, z] = onWall(F, s0 + ((s1 - s0) * k) / n, 0.5); hi = Math.max(hi, groundHeight(x, z)); }
  return hi;
}

/** A stretch of wall from s0 to s1, y0 to y1, into the plaster: windowed (u from the wall's middle, `up` its grid) or closed */
function plaster(B, F, s0, s1, y0, y1, { windows = false, up = UP } = {}) {
  const mid = F.len / 2, v = (y) => y - FOOT + up - (windows ? 0 : CLOSED);
  B.quad('plaster', at(F, s0, y0), at(F, s1, y0), at(F, s1, y1), at(F, s0, y1),
    [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half: windows ? F.len / 2 : 0 });
}

let paneCell = 0;
/** A window modelled in the trim: its dark frame, the pane (into the glass, a uv cell of its own), the sill */
function trimWindow(B, F, s, half, y0, y1, { sill = true } = {}) {
  B.box('trim', F, s - half, s + half, 0, 0.05, y0, y1, C.frame);
  const k = paneCell++, P = (ss, y) => at(F, ss, y, 0.06);
  B.quad('glass', P(s - half + 0.08, y0 + 0.08), P(s + half - 0.08, y0 + 0.08), P(s + half - 0.08, y1 - 0.08), P(s - half + 0.08, y1 - 0.08),
    [[k + 0.1, 0.1], [k + 0.9, 0.1], [k + 0.9, 0.9], [k + 0.1, 0.9]]);
  B.box('trim', F, s - 0.025, s + 0.025, 0.06, 0.075, y0 + 0.08, y1 - 0.08, C.frame);
  if (sill) B.box('trim', F, s - half - 0.06, s + half + 0.06, 0, 0.1, y0 - 0.07, y0, C.band);
}

// The plinth under the ground floor's foot, from the base up, and the bands over the ground floor and under the top one
function plinthAndBands(B, F, s0 = 0, s1 = F.len) {
  B.box('trim', F, s0, s1, -0.3, 0.03, H.base, FOOT, C.plinth);
  for (const y of [floorY(1), floorY(H.floors - 1)]) B.box('trim', F, s0, s1, 0, 0.04, y - 0.12, y, C.band);
}

// A closed end: plaster over the full depth (the balconies' side wall), its column(s) of windows, the plinth and bands
function buildEnd(B, F, cols, { annexed = false } = {}) {
  plaster(B, F, 0, F.len, FOOT, soffitY());
  plinthAndBands(B, F);
  for (const s of cols) {
    for (let k = 0; k < H.floors; k++) {
      const y0 = floorY(k) + WIN.lo, y1 = floorY(k) + 2.15;
      // (none behind the annex)
      if (annexed && y0 < H.annex.top + 0.3 && inAnnex(...onWall(F, s, 0.5))) continue;
      trimWindow(B, F, s, 0.45, y0, y1);
    }
  }
}

// The north side: a window per bay and floor, drawn by the material
function buildNorth(B, F) {
  plaster(B, F, 0, F.len, FOOT, soffitY(), { windows: true });
  plinthAndBands(B, F);
}

// The south side: the wall behind the balconies (a door and a window in turn), the partitions, the slabs with their
// rails, the posts, the terrace on its stone wall with the entrance, its rail where the street falls away
function buildSouth(B) {
  const W = walls(), S = W.south, len = S.len, Bc = H.balconies, d = Bc.depth;
  plaster(B, S, 0, len, FOOT, soffitY(), { windows: true, up: UP_SOUTH });
  // the partitions between the flats (and the ends' inner faces: the closed ends' thickness)
  for (const f of Bc.partitions) B.box('trim', S, len * f - 0.12, len * f + 0.12, 0, d - 0.05, FOOT, soffitY(), C.plaster);
  for (const [s0, s1] of [[0.02, 0.3], [len - 0.3, len - 0.02]]) B.box('trim', S, s0, s1, 0, d, FOOT, soffitY(), C.plaster);
  // the terrace: its deck at the ground floor's foot, the stone wall under its edge
  B.box('trim', S, 0.3, len - 0.3, 0, d, H.base, FOOT, C.stone);
  // the slabs and the rails, a floor at a time
  for (let k = 1; k < H.floors; k++) {
    const y = floorY(k);
    B.box('trim', S, 0.3, len - 0.3, 0, d, y - 0.22, y, C.slab);
    rail(B, S, 0.3, len - 0.3, y);
  }
  // the terrace's rail where it stands over the street
  const F = W.front;
  let from = null;
  const steps = Math.ceil(len / 1.0);
  for (let i = 0; i <= steps; i++) {
    const s = 0.3 + ((len - 0.6) * i) / steps, [x, z] = onWall(F, s, 0.5);
    const high = i < steps && FOOT - groundHeight(x, z) > 0.7;
    if (high && from === null) from = s;
    if ((!high || i === steps) && from !== null) { rail(B, S, from, s, FOOT); from = null; }
  }
  // the white posts from the terrace to the soffit
  for (const f of Bc.posts) B.box('trim', S, len * f - 0.05, len * f + 0.05, d - 0.32, d - 0.22, FOOT, soffitY(), C.post);
  // the entrance in the ground floor's bay: a dark frame round a glazed door (over the window the material draws there)
  const E = H.entrance, s = len / 2 + E.bay * BAY;
  B.box('trim', S, s - E.half - 0.08, s + E.half + 0.08, 0, 0.06, FOOT, FOOT + E.height + 0.08, C.frame);
  const k = paneCell++, P = (ss, y) => at(S, ss, y, 0.07);
  B.quad('glass', P(s - E.half + 0.06, FOOT + 0.1), P(s + E.half - 0.06, FOOT + 0.1), P(s + E.half - 0.06, FOOT + E.height - 0.06), P(s - E.half + 0.06, FOOT + E.height - 0.06),
    [[k + 0.1, 0.1], [k + 0.9, 0.1], [k + 0.9, 0.9], [k + 0.1, 0.9]]);
  B.box('trim', S, s - E.half, s + E.half, 0.07, 0.09, FOOT + 1.0, FOOT + 1.06, C.frame);
}

// A balcony's rail on the outer line: dark timber boards over a gap, a cap
function rail(B, S, s0, s1, y) {
  const d = H.balconies.depth, r = H.balconies.rail;
  B.box('trim', S, s0, s1, d - 0.1, d - 0.04, y + 0.12, y + r - 0.08, C.timber);
  B.box('trim', S, s0, s1, d - 0.14, d, y + r - 0.08, y + r, C.cap);
}

// The roof: flat over the survey's outline grown by the eaves, the dark edge round it, the timber soffit under it, a
// chimney
function buildRoof(B) {
  const ring = roofRing(), top = H.top, lo = soffitY();
  flatRoof(B, ring, top);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    B.quad('trim', [a[0], lo, a[1]], [b[0], lo, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], undefined, { colour: C.fascia });
  }
  // the soffit, facing down
  const [p, q, r, t] = ring.map(([x, z]) => [x, lo, z]);
  const n = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]); // (> 0: p, q, r turn to face up)
  if (n > 0) B.quad('trim', p, t, r, q, undefined, { colour: C.soffit });
  else B.quad('trim', p, q, r, t, undefined, { colour: C.soffit });
  // the chimney
  const Ch = H.chimney, W = walls().west;
  B.box('trim', W, Ch.s - Ch.w / 2, Ch.s + Ch.w / 2, -Ch.o - Ch.d, -Ch.o, top - 0.05, top + Ch.h, C.plaster);
  B.box('trim', W, Ch.s - Ch.w / 2 - 0.06, Ch.s + Ch.w / 2 + 0.06, -Ch.o - Ch.d - 0.06, -Ch.o + 0.06, top + Ch.h, top + Ch.h + 0.1, C.plinth);
}

// The annex: concrete walls under a flat roof with its coping, a garage door in its longest wall facing away from the
// house
function buildAnnex(B) {
  const An = H.annex, ring = outwardRing(An.ring);
  let door = null;
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len < 0.05) continue;
    B.quad('trim', at(F, 0, H.base), at(F, F.len, H.base), at(F, F.len, An.top), at(F, 0, An.top), undefined, { colour: C.annex });
    B.box('trim', F, -0.04, F.len + 0.04, -0.2, 0.06, An.top - 0.1, An.top + 0.12, C.coping);
    // (the house's walls lie west of it: a wall facing east-ish is the outer one)
    if (F.n[0] > 0.6 && (!door || F.len > door.len)) door = F;
  }
  if (door) {
    const s = door.len / 2, w = An.door.w / 2, g = groundAlong(door, s - w, s + w), y1 = g + An.door.h;
    B.box('trim', door, s - w - 0.1, s + w + 0.1, 0, 0.06, g, y1 + 0.1, C.band);
    B.box('trim', door, s - w, s + w, 0.06, 0.08, g, y1, C.door);
    for (let k = 1; k < 5; k++) B.box('trim', door, s - w, s + w, 0.08, 0.1, g + (y1 - g) * (k / 5) - 0.02, g + (y1 - g) * (k / 5) + 0.02, C.plinth);
  }
  flatRoof(B, ring, An.top + 0.12);
}

// The name on the west end
function buildName(B) {
  const n = H.name;
  B.decal(walls().west, n.s0, n.s1, 0.03, n.y0, n.y1, 'name');
}

/**
 * Builds Haus Frohsinn into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand on
 * the block's outline with its terrace and on the annex's, js/landmarks.js SURVEYED_FOOTPRINTS; the posts and rails
 * stand inside it).
 */
export function buildHausFrohsinn(scene) {
  const root = new THREE.Group();
  root.name = 'Haus Frohsinn';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Haus Frohsinn' }), M = materials();
  paneCell = 0;
  const W = walls();
  buildEnd(B, W.west, H.ends.west.cols);
  buildEnd(B, W.east, H.ends.east.cols, { annexed: true });
  buildNorth(B, W.north);
  buildSouth(B);
  buildRoof(B);
  buildAnnex(B);
  buildName(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
