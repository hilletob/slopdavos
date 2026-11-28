import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, positionWorld, smoothstep, step, uv, vec3 } from 'three/tsl';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { groundHeight } from './terrain.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { bays } from './seehof-data.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { HOTEL_POST_MOROSANI, groundOutlines, isRestaurantFront, isStreetSide, onWall, outwardRing, part, wallFrame, wallStretches } from './hotel-post-morosani-data.js';

export { HOTEL_POST_MOROSANI };

// The Hotel Post Morosani rebuilt by hand (js/hotel-post-morosani-data.js), standing in for its two swissBUILDINGS3D
// volumes, which the streamed tiles drew as white blocks with the town houses' windows: the old hotel along the
// Promenade in cream plaster, its tall ground floor with the Pöstli Corner's windows under maroon awnings, three floors
// of windows in brown surrounds with white sashes, a painted scalloped frieze over the ground floor and another under
// the broad brown eaves (drawn by the wall's material from its uv and the height), two balconies with grey board rails
// on the south front, the gilt POSTHOTEL letters and the post horn on a steel frame on the roof, the name painted on
// the north face; the low restaurant round the street corner, glazed under its dark fascia with the lettering, the
// entrance's canopy on the Promenade; the rear in white roughcast with dark timber boxes over its windows and the
// garage's mouth on the yard. Six meshes: the two walls, the roofs, the glass, the trim (one vertex-coloured mesh) and
// the lettering (one canvas atlas). The hotel's and the bar's hanging signs (js/shops.js) give way to its own.

excludeBuildings(HOTEL_POST_MOROSANI.exclude);
for (const osm of HOTEL_POST_MOROSANI.shops) SHOP_EXCLUSIONS.add(osm);
// (the player's walls on the surveyed volumes, not on OSM's outline, which stood up to 1.1 m off: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(HOTEL_POST_MOROSANI.osm, groundOutlines());

const O = HOTEL_POST_MOROSANI.old, R = HOTEL_POST_MOROSANI.rough;
// v of a wall: metres up its grid, a floor's top at every multiple of the storey (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const GRID = {
  old: { storey: O.storey, bay: O.bay, win: O.win },
  rough: { storey: R.storey, bay: R.bay, win: R.win }
};
for (const g of Object.values(GRID)) { g.up = 40 * g.storey; g.closed = 300 * g.storey; }

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const CREAM = [0.5, 0.44, 0.31], RUST = [0.3, 0.14, 0.06], ROUGH = [0.58, 0.58, 0.555], TIMBER = [0.1, 0.055, 0.028];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.3, 0.3, 0.29], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    const w = (g, rgb) => SIMPLE_SKINS.windowed(rgb, g.storey, g.win.lo / g.storey, g.win.hi / g.storey, 0.9, 0.4, { bay: g.bay, half: g.win.half });
    M.old = w(GRID.old, [0.45, 0.39, 0.28]);
    M.rough = w(GRID.rough, [0.52, 0.52, 0.5]);
    M.glass = SIMPLE_SKINS.glow([0.08, 0.1, 0.11], 0.1, 0.8, [1.0, 0.84, 0.62], 0.3);
    return M;
  }
  const U = uv().x, V = uv().y, Y = positionWorld.y;
  const near = fade(140, 420), fine = fade(25, 80), finest = fade(8, 28);
  const glow = nightGlow();
  const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.09, 0.105), worldNoise(0.07));
  // The old hotel: cream plaster, a window per bay and floor in a brown painted surround, a white sash with a post and a
  // transom; the scalloped frieze in rust over the ground floor and under the eaves (by the height, on every wall)
  {
    const G = GRID.old, W = G.win;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: G.bay, storey: G.storey, closed: G.closed, winHalf: W.half });
    const surround = rect(W.half + 0.14, W.lo - 0.12, W.hi + 0.12).max(rect(W.half + 0.22, W.lo - 0.2, W.lo - 0.1)).mul(open);
    const sash = rect(W.half, W.lo, W.hi).mul(open);
    const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.035, 0.02, abs(fv.sub(W.hi - 0.6))));
    const pane = rect(W.half - 0.08, W.lo + 0.08, W.hi - 0.08).mul(float(1).sub(bars.mul(near))).mul(open);
    // the friezes: a band of rust scallops (0.8 m each) between two lines
    const band = (y0, y1) => {
      const yb = Y.sub(y0).div(y1 - y0), t = fract(U.div(0.8)).sub(0.5);
      const inBand = step(0, yb).mul(step(yb, 1));
      const scallop = step(yb, float(0.25).add(float(0.5).mul(float(1).sub(t.mul(t).mul(4))))).mul(inBand);
      const lines = smoothstep(0.1, 0.04, abs(yb.sub(0.02))).max(smoothstep(0.1, 0.04, abs(yb.sub(0.98)))).mul(inBand);
      return scallop.mul(0.75).max(lines).mul(near.mul(0.6).add(0.4));
    };
    const frieze = band(O.gf + 0.08, O.gf + 0.62).max(band(O.line + 0.3, O.line + 0.9));
    const cream = mix(vec3(...CREAM).mul(0.93), vec3(...CREAM).mul(1.05), worldNoise(0.25)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    let c = mix(cream, vec3(...RUST), frieze);
    c = mix(c, vec3(0.27, 0.14, 0.065), surround.mul(near.mul(0.7).add(0.3)));
    c = mix(c, vec3(0.6, 0.6, 0.57), sash);
    c = mix(c, glassC, pane);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.92), float(0.12), pane);
    m.metalnessNode = pane.mul(0.55);
    // (a hotel: rooms lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 53, { share: 0.45, late: 0.12, tone: twoTones([1.0, 0.72, 0.42], [1.0, 0.86, 0.64], 0.6) }).mul(pane).mul(glow.mul(1.1));
    M.old = m;
  }
  // The rear: white roughcast (its grain fades out by 28 m), a wide window per bay and floor in a dark frame with a
  // dark timber box over it, the rooms behind lit here and there
  {
    const G = GRID.rough, W = G.win;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const { half, bay, bu, storey, open, rect } = windowGrid({ bay: G.bay, storey: G.storey, closed: G.closed, winHalf: W.half });
    const frame = rect(W.half, W.lo, W.hi).mul(open);
    const box = rect(W.half + 0.1, W.hi, W.hi + 0.42).mul(open);
    const posts = smoothstep(0.035, 0.02, abs(abs(bu).sub(W.half / 3))).max(smoothstep(0.035, 0.02, abs(bu)));
    const pane = rect(W.half - 0.07, W.lo + 0.07, W.hi - 0.07).mul(float(1).sub(posts.mul(near))).mul(open);
    const grain = worldNoise(9).mul(finest).mul(0.12);
    const wall = mix(vec3(...ROUGH).mul(0.93), vec3(...ROUGH).mul(1.04), worldNoise(0.2)).mul(float(1).sub(grain));
    let c = mix(wall, vec3(...TIMBER), box.mul(near.mul(0.7).add(0.3)));
    c = mix(c, vec3(0.06, 0.045, 0.03), frame);
    c = mix(c, glassC, pane);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.95), float(0.12), pane);
    m.metalnessNode = pane.mul(0.55);
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 61, { share: 0.35, late: 0.1, tone: twoTones([1.0, 0.74, 0.46], [0.92, 0.92, 0.88], 0.75) }).mul(pane).mul(glow.mul(1.05));
    M.rough = m;
  }
  // The restaurant's and the ground floor's glazing: brown mullions every 1.2 m, a transom 2.4 m up; at night a faint
  // glow behind most panes and the bar's lights behind a few
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.2)).sub(0.5));
    const frame = smoothstep(0.45, 0.47, mu).max(smoothstep(0.05, 0.03, abs(V.sub(2.4)))).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.2)).mul(13.1).add(step(2.4, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.05, 0.06, 0.07), vec3(0.12, 0.13, 0.14), paneId), vec3(0.12, 0.065, 0.035), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.2), frame);
    m.emissiveNode = vec3(1.0, 0.8, 0.56).mul(float(1).sub(frame)).mul(mix(float(0.04), float(0.32), step(0.68, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The lettering, the post horn, the awnings' valance: one canvas atlas ------------------------------------------------
const ATLAS_SIZE = [1024, 1024];
export const ATLAS = {
  sign: [0, 0, 1024, 150], // the gilt letters on the roof (11 × 1.6 m)
  fasciaA: [0, 152, 1024, 108], // the restaurant's north fascia, its east half and its west half (2 × 12.7 × 1.4 m)
  fasciaB: [0, 262, 1024, 108],
  west: [0, 372, 1024, 76], // the west fascia (19.7 × 1.4 m)
  panel: [0, 452, 512, 520], // the name painted on the north face (5.6 × 5.6 m)
  horn: [520, 452, 256, 160], // the post horn over the letters (1.9 × 1.2 m)
  awning: [520, 616, 504, 60], // the awnings' valance (3.2 × 0.36 m)
  parking: [784, 452, 96, 96] // the garage's sign (0.6 m)
};
const GILT = '#f2bf1c';
const FASCIA_TEXT = 'RESTAURANT  ✦  DANCING  ✦  POSTHOTEL  ✦  BAR  ✦  MOROSANI';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // the standing letters: bold gilt, a thin dark edge
  cell('sign', (w, h) => {
    g.font = `bold ${Math.round(h * 0.86)}px Helvetica, Arial, sans-serif`;
    g.lineWidth = 4; g.strokeStyle = '#5a3d06'; g.fillStyle = GILT;
    g.strokeText('POSTHOTEL', w / 2, h * 0.54, w - 8);
    g.fillText('POSTHOTEL', w / 2, h * 0.54, w - 8);
  });
  // the restaurant's fascia: gilt capitals on dark brown, one line over the two cells (the west half drawn shifted)
  for (const [key, dx] of [['fasciaA', 0], ['fasciaB', -1024]]) {
    cell(key, (w, h) => {
      g.fillStyle = '#1c120b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8b25a'; g.fillRect(0, 6, w, 3); g.fillRect(0, h - 9, w, 3);
      g.font = `600 ${Math.round(h * 0.56)}px Georgia, 'Times New Roman', serif`;
      g.fillText(FASCIA_TEXT, 1024 + dx, h / 2 + 2, 2000);
    });
  }
  cell('west', (w, h) => {
    g.fillStyle = '#1c120b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8b25a'; g.fillRect(0, 5, w, 2); g.fillRect(0, h - 7, w, 2);
    g.font = `600 ${Math.round(h * 0.58)}px Georgia, 'Times New Roman', serif`;
    g.fillText('POSTHOTEL   MOROSANI', w / 2, h / 2 + 2, w - 300);
  });
  // the name painted on the north face: a framed panel a shade darker than the plaster, gilt letters in two lines
  cell('panel', (w, h) => {
    g.fillStyle = 'rgba(150, 128, 88, 0.55)'; g.fillRect(14, 14, w - 28, h - 28);
    g.strokeStyle = '#7a5a2a'; g.lineWidth = 6; g.strokeRect(20, 20, w - 40, h - 40);
    g.lineWidth = 3; g.strokeStyle = '#5a3d10'; g.fillStyle = '#d6a93a';
    g.font = `bold 150px Georgia, 'Times New Roman', serif`;
    for (const [t, y] of [['POST', h * 0.33], ['HOTEL', h * 0.68]]) { g.strokeText(t, w / 2, y, w - 70); g.fillText(t, w / 2, y, w - 70); }
  });
  // a post horn, drawn plainly: the coil, the mouthpiece, the bell
  cell('horn', (w, h) => {
    g.strokeStyle = GILT; g.fillStyle = GILT; g.lineWidth = 16;
    g.beginPath(); g.ellipse(w * 0.42, h * 0.52, w * 0.2, h * 0.3, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 10;
    g.beginPath(); g.moveTo(w * 0.04, h * 0.3); g.lineTo(w * 0.3, h * 0.3); g.stroke();
    g.beginPath(); g.moveTo(w * 0.6, h * 0.42); g.quadraticCurveTo(w * 0.78, h * 0.3, w * 0.97, h * 0.08); g.lineTo(w * 0.97, h * 0.72); g.quadraticCurveTo(w * 0.8, h * 0.52, w * 0.6, h * 0.6); g.closePath(); g.fill();
  });
  cell('awning', (w, h) => {
    g.fillStyle = '#6e1424'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2e8dc';
    g.font = `italic 600 ${Math.round(h * 0.62)}px Georgia, 'Times New Roman', serif`;
    g.fillText('pöstli corner', w / 2, h / 2 + 2, w - 40);
  });
  cell('parking', (w, h) => {
    g.fillStyle = '#1e4fa3'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(h * 0.72)}px Helvetica, Arial, sans-serif`;
    g.fillText('P', w / 2, h / 2 + 3);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  eaves: [0.13, 0.065, 0.03], soffit: [0.2, 0.11, 0.05], coping: [0.3, 0.3, 0.29], fascia: [0.035, 0.024, 0.016], frame: [0.12, 0.065, 0.035],
  rail: [0.3, 0.3, 0.29], slab: [0.42, 0.41, 0.39], awning: [0.17, 0.015, 0.025], steel: [0.3, 0.3, 0.31], dark: [0.02, 0.02, 0.022],
  step: [0.33, 0.33, 0.32], lintel: [0.5, 0.5, 0.48]
};

// The highest ground along a wall, half a metre out of it
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

// A strip of a wall from y0 to y1 into a wall's bucket: windowed (its bays laid out from the wall's middle) or closed;
// `line` the top floor's top on the grid, s0–s1 the stretch along the wall
function strip(B, bucket, F, line, y0, y1, windows, s0 = 0, s1 = F.len) {
  if (y1 - y0 < 0.01 || s1 - s0 < 0.01) return;
  const G = GRID[bucket], P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const mid = (s0 + s1) / 2, open = windows && s1 - s0 >= 2.4;
  const v = (y) => y - line + G.up - (open ? 0 : G.closed);
  B.quad(bucket, P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half: open ? (s1 - s0) / 2 : 0 });
}
// A strip of glazing (uv: metres along the wall, metres up from its foot)
function glass(B, F, s0, s1, y0, y1) {
  const P = (s, y) => { const [x, z] = onWall(F, s, 0.02); return [x, y, z]; };
  B.quad('glass', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[s0, 0], [s1, 0], [s1, y1 - y0], [s0, y1 - y0]]);
}

// Where the windows of a roughcast wall begin: the first floor whose windows clear the highest ground along it
function roughFrom(F, line) {
  const hi = groundAlong(F) + 0.25;
  let foot = line - R.storey;
  while (foot - R.storey + R.win.lo > hi) foot -= R.storey;
  return foot;
}

// The old block: closed under its ground floor's top, a window per bay and floor up to the top floor's top, the attic
// band with the frieze, the eaves round the roof; on the street sides the ground floor's windows (glass in brown frames)
function buildOld(B, p) {
  const ring = outwardRing(p.ring), base = HOTEL_POST_MOROSANI.base, E = HOTEL_POST_MOROSANI.eaves;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    strip(B, 'old', F, O.line, base, O.gf, false);
    for (const st of wallStretches(a, b)) strip(B, 'old', F, O.line, O.gf, O.line, st.windows, st.from, st.to);
    strip(B, 'old', F, O.line, O.line, p.top, false);
    if (F.len > 0.3) {
      B.box('trim', F, -0.05, F.len + 0.05, 0, E.out, E.y0, E.y1, C.eaves, { top: 'roof' });
      B.box('trim', F, -0.05, F.len + 0.05, -0.01, E.out - 0.08, E.y0 - 0.12, E.y0, C.soffit);
    }
    if (isStreetSide(F) && F.len >= 2.4) groundWindows(B, F);
  }
  flatRoof(B, ring, p.top);
}

// The old block's ground floor on the street: a tall window per bay in a brown frame, a sill under it
function groundWindows(B, F) {
  const foot = groundAlong(F) + 0.7, y1 = O.gf - 0.55, half = 0.8;
  if (y1 - foot < 1.4) return;
  for (const s of bays(F.len, O.bay, F.len / 2, half)) {
    glass(B, F, s - half, s + half, foot, y1);
    B.box('trim', F, s - half - 0.1, s + half + 0.1, 0, 0.08, y1, y1 + 0.12, C.frame);
    B.box('trim', F, s - half - 0.1, s + half + 0.1, 0, 0.12, foot - 0.1, foot, C.lintel);
    for (const e of [s - half - 0.1, s + half]) B.box('trim', F, e, e + 0.1, 0, 0.08, foot, y1, C.frame);
    B.box('trim', F, s - 0.04, s + 0.04, 0, 0.06, foot, y1, C.frame);
  }
}

// A roughcast wall: closed up to the first floor whose windows clear the ground, then windowed to the top floor's top,
// the parapet; the coping round the roof
function roughWall(B, F, p) {
  const base = HOTEL_POST_MOROSANI.base, from = Math.min(roughFrom(F, p.line), p.line);
  strip(B, 'rough', F, p.line, base, from, false);
  strip(B, 'rough', F, p.line, from, p.line, true);
  strip(B, 'rough', F, p.line, p.line, p.top, false);
}

// The restaurant's street front: glazed from over the highest ground up to `glassTo`, plaster over it with the dark
// fascia, the coping
function restaurantFront(B, F, p) {
  const Rs = HOTEL_POST_MOROSANI.restaurant, base = HOTEL_POST_MOROSANI.base, [f0, f1] = Rs.fascia;
  const foot = groundAlong(F) + 0.35;
  strip(B, 'old', F, O.line, base, foot, false);
  glass(B, F, 0.3, F.len - 0.3, foot, Rs.glassTo);
  for (const s of [0, F.len - 0.3]) strip(B, 'old', F, O.line, foot, Rs.glassTo, false, s, s + 0.3);
  B.box('trim', F, 0.3, F.len - 0.3, 0, 0.1, Rs.glassTo - 0.12, Rs.glassTo, C.frame);
  strip(B, 'old', F, O.line, Rs.glassTo, p.top, false);
  B.box('trim', F, 0, F.len, 0, 0.14, f0, f1, C.fascia);
}

function buildPart(B, p) {
  if (p.style === 'old') return buildOld(B, p);
  const ring = outwardRing(p.ring);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    if (p.style === 'restaurant' && isRestaurantFront(a, b)) restaurantFront(B, F, p);
    else roughWall(B, F, p);
    if (F.len > 0.3) B.box('trim', F, -0.05, F.len + 0.05, -0.3, 0.06, p.top - 0.12, p.top + 0.14, C.coping);
  }
  flatRoof(B, ring, p.top);
}

// The restaurant's fascias with the lettering, the entrance's doors and canopy on the Promenade
function buildRestaurant(B) {
  const H = HOTEL_POST_MOROSANI, [f0, f1] = H.restaurant.fascia;
  const N = wallFrame(H.north.a, H.north.b), m = N.len / 2;
  B.decal(N, 0.4, m, 0.15, f0 + 0.03, f1 - 0.03, 'fasciaA');
  B.decal(N, m, N.len - 0.4, 0.15, f0 + 0.03, f1 - 0.03, 'fasciaB');
  const W = wallFrame(H.west.a, H.west.b);
  B.decal(W, 0.4, W.len - 0.4, 0.15, f0 + 0.03, f1 - 0.03, 'west');
  const D = H.west.doors, K = H.west.canopy, foot = groundAlong(W) + 0.35;
  for (const s of [D.s - D.w / 2, D.s, D.s + D.w / 2]) B.box('trim', W, s - 0.06, s + 0.06, 0, 0.1, foot, foot + 2.5, C.frame);
  B.box('trim', W, D.s - D.w / 2 - 0.06, D.s + D.w / 2 + 0.06, 0, 0.1, foot + 2.5, foot + 2.62, C.frame);
  B.box('trim', W, K.s - K.w / 2, K.s + K.w / 2, 0, K.out, K.y, K.y + K.thick, C.fascia, { top: 'roof' });
}

// The old block's south front: the balconies on its middle bay, the awnings over the ground floor's windows (and the
// west front's southern ones), the letters and the post horn on their frame on the roof
function buildSouth(B) {
  const S = HOTEL_POST_MOROSANI.south, Bc = S.balcony, F = wallFrame(Bc.a, Bc.b);
  for (const y of Bc.floors) {
    B.box('trim', F, 0.2, F.len - 0.2, 0, Bc.out, y - 0.22, y, C.slab, { top: 'roof' });
    // the rail: grey boards with a cut-out between them, a handrail
    B.box('trim', F, 0.2, F.len - 0.2, Bc.out - 0.06, Bc.out, y + 0.1, y + Bc.rail - 0.08, C.rail);
    for (const e of [0.2, F.len - 0.26]) B.box('trim', F, e, e + 0.06, 0, Bc.out - 0.06, y + 0.1, y + Bc.rail - 0.08, C.rail);
    B.box('trim', F, 0.15, F.len - 0.15, 0, Bc.out + 0.05, y + Bc.rail - 0.08, y + Bc.rail, C.eaves);
    for (const s of [0.5, F.len - 0.5]) B.box('trim', F, s - 0.08, s + 0.08, 0, Bc.out - 0.1, y - 0.6, y - 0.22, C.eaves);
  }
  // the awnings: a maroon slope over each window of the ground floor, its valance with the bar's name
  const A = S.awning, main = part('main');
  const ring = outwardRing(main.ring);
  for (let i = 0; i < ring.length; i++) {
    const W = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (W.len < 2.4 || !isStreetSide(W)) continue;
    const south = W.n[1] > 0.7, mz = onWall(W, W.len / 2)[1];
    if (!south && mz < 208) continue; // (the west front's southern bays only)
    for (const s of bays(W.len, O.bay, W.len / 2, 0.8)) {
      const P = (u, o, y) => { const [x, z] = onWall(W, u, o); return [x, y, z]; };
      const s0 = s - 1.0, s1 = s + 1.0, y0 = A.y, y1 = A.y - A.drop;
      B.quad('trim', P(s0, 0.02, y0), P(s0, A.out, y1), P(s1, A.out, y1), P(s1, 0.02, y0), undefined, { colour: C.awning });
      B.quad('trim', P(s0, A.out, y1), P(s0, 0.02, y0), P(s1, 0.02, y0), P(s1, A.out, y1), undefined, { colour: C.awning });
      B.decal(W, s0, s1, A.out + 0.01, y1 - 0.36, y1, 'awning');
      for (const e of [s0, s1 - 0.03]) B.box('trim', W, e, e + 0.03, 0, A.out, y1 - 0.36, y1, C.awning);
    }
  }
  // the sign on the roof: posts and two rails of a steel frame, the letters on its front and (mirrored) its back
  const Sg = S.sign, R0 = wallFrame(S.a, S.b), top = main.top;
  for (let k = 0; k < Sg.posts; k++) {
    const s = Sg.s0 + 0.3 + ((Sg.s1 - Sg.s0 - 0.6) * k) / (Sg.posts - 1);
    B.box('trim', R0, s - 0.05, s + 0.05, Sg.o - 0.2, Sg.o - 0.1, top - 0.1, Sg.y1 + 0.1, C.steel);
    B.box('trim', R0, s - 0.04, s + 0.04, Sg.o - 1.4, Sg.o - 0.2, top, top + 0.12, C.steel);
  }
  for (const y of [Sg.y0 + 0.15, Sg.y1 - 0.15]) B.box('trim', R0, Sg.s0 + 0.2, Sg.s1 - 0.2, Sg.o - 0.2, Sg.o - 0.12, y - 0.04, y + 0.04, C.steel);
  const Hn = Sg.horn;
  B.box('trim', R0, Hn.s - 0.04, Hn.s + 0.04, Sg.o - 0.2, Sg.o - 0.12, Sg.y1 - 0.1, Hn.y1 - 0.2, C.steel);
  const front = (o) => ({ a: onWall(R0, 0, o), u: R0.u, n: R0.n });
  const back = (o) => ({ a: onWall(R0, R0.len, o), u: [-R0.u[0], -R0.u[1]], n: [-R0.n[0], -R0.n[1]] });
  B.decal(front(Sg.o), Sg.s0, Sg.s1, 0, Sg.y0, Sg.y1, 'sign');
  B.decal(front(Sg.o), Hn.s - Hn.w / 2, Hn.s + Hn.w / 2, 0, Hn.y0, Hn.y1, 'horn');
  const L = R0.len;
  B.decal(back(Sg.o - 0.32), L - Sg.s1, L - Sg.s0, 0, Sg.y0, Sg.y1, 'sign', { mirror: true });
  B.decal(back(Sg.o - 0.32), L - Hn.s - Hn.w / 2, L - Hn.s + Hn.w / 2, 0, Hn.y0, Hn.y1, 'horn', { mirror: true });
}

// The name painted on the old block's north face, over the restaurant's roof
function buildNamePanel(B) {
  const W = HOTEL_POST_MOROSANI.nameWall, F = wallFrame(W.a, W.b);
  B.decal(F, W.clear[0] + 0.1, W.clear[1] - 0.1, 0.03, W.panel.y0, W.panel.y1, 'panel');
}

// The garage's mouth in the rear wing's east face: the dark inside, the lintel and the jambs, the sign beside it
function buildGarage(B) {
  const G = HOTEL_POST_MOROSANI.garage, F = wallFrame(G.a, G.b);
  const [x, z] = onWall(F, G.s, 0.5), y0 = groundHeight(x, z) - 0.05, y1 = y0 + G.h, s0 = G.s - G.w / 2, s1 = G.s + G.w / 2;
  B.box('trim', F, s0, s1, 0, 0.03, y0, y1, C.dark);
  B.box('trim', F, s0 - 0.3, s1 + 0.3, 0, 0.18, y1, y1 + 0.35, C.lintel);
  for (const e of [s0 - 0.3, s1]) B.box('trim', F, e, e + 0.3, 0, 0.18, y0, y1, C.lintel);
  B.decal(F, s0 - 1.3, s0 - 0.7, 0.04, y0 + 1.9, y0 + 2.5, 'parking');
}

/**
 * Builds the Hotel Post Morosani into `scene`. Returns { group, colliders }: none of its own (the player's walls stand
 * on its surveyed outlines, js/landmarks.js SURVEYED_FOOTPRINTS; the canopy, the awnings and the balconies hang over
 * the ground).
 */
export function buildHotelPostMorosani(scene) {
  const root = new THREE.Group();
  root.name = 'Hotel Post Morosani';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['old', 'rough'], name: 'Hotel Post Morosani' }), M = materials();
  for (const p of HOTEL_POST_MOROSANI.parts) buildPart(B, p);
  buildRestaurant(B);
  buildSouth(B);
  buildNamePanel(B);
  buildGarage(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
