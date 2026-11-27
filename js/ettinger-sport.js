import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  ETTINGER_SPORT, balconyFrame, frontOf, groundOutlines, isClosed, isTimber, isWall, offsetRing, onWall, outwardRing, partAt, wallFrame
} from './ettinger-sport-data.js';

export { ETTINGER_SPORT };

// The house of Ettinger Sport on the Promenade in Davos Dorf rebuilt by hand (js/ettinger-sport-data.js), standing in
// for its swissBUILDINGS3D volume, which the streamed tiles drew as one white block with the town houses' windows: the
// shop wing along the Promenade (big panes between dark timber posts on a granite plinth, the blue awning, the cream
// fascia with "ettinger sport" and "snowboard", the timber railing round its roof), the block at its south-western end
// (cream plaster, the shop floor glazed towards the Promenade, two floors of windows over it, dark timber on its end
// up the street, a roof slab out over its walls), its corner standing forward with the arch over the entrance's steps,
// the painting over it and two lamps, the balcony under its slab beside it, and the low hall behind in the slope.
// Windows are drawn by the walls' materials from their uv (metres along the wall from its middle, metres up the
// floors' grid). Six meshes: the plaster, the timber, the glass, the roofs, the trim (one vertex-coloured mesh) and the
// decals (one canvas atlas: the lettering, the railing's boards, the painting).

excludeBuildings([ETTINGER_SPORT.exclude]);
// (the player's walls on the surveyed volumes, not on OSM's outline, which stands up to 1.1 m off them: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(ETTINGER_SPORT.osm, groundOutlines());
// (the shop's name is on the fascia: no generic sign, js/shops.js)
SHOP_EXCLUSIONS.add(ETTINGER_SPORT.shop);

const E = ETTINGER_SPORT;
const BAY = 2.7; // a window's bay along a wall
const STOREY = E.storey;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
// A window in its storey (m up from the floor's foot) and its half width
const WIN = { lo: 0.9, hi: 2.3, half: 0.6 };

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const CREAM = [0.5, 0.45, 0.34], TIMBER = [0.17, 0.085, 0.04];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.26, 0.25, 0.24], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.46, 0.42, 0.32], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35);
    M.timber = SIMPLE_SKINS.windowed([0.15, 0.08, 0.04], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.85, 0.35);
    M.glass = SIMPLE_SKINS.glow([0.08, 0.1, 0.11], 0.1, 0.8, [1.0, 0.86, 0.66], 0.15);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(8, 28);
  const glow = nightGlow();
  const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
  // A window per bay and floor: a frame, a post in its middle, a sill; a curtain drawn in some; lit here and there at
  // night (flats over the shops)
  const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
  const pane = rect(WIN.half - 0.08, WIN.lo + 0.08, WIN.hi - 0.08).mul(float(1).sub(smoothstep(0.04, 0.025, abs(bu)).mul(near))).mul(open);
  const sill = rect(WIN.half + 0.07, WIN.lo - 0.08, WIN.lo).mul(open).mul(near);
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
  const drawn = step(0.62, id).mul(mix(float(0.35), float(1), step(0.9, id)));
  const blind = step(float(WIN.hi - 0.08).sub(drawn.mul(WIN.hi - WIN.lo - 0.16)), fv).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
  const lit = litWindow(bay, storey.add(half.mul(3.3)), 23, { share: 0.45, late: 0.1, tone: twoTones([1.0, 0.74, 0.46], [0.9, 0.9, 0.98], 0.8) })
    .mul(pane).mul(mix(float(1), float(0.4), blind)).mul(glow.mul(1.1));
  const shiny = pane.mul(float(1).sub(blind));
  const skin = (wall, frame, sillC) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    let c = mix(wall, vec3(...sillC), sill);
    c = mix(c, vec3(...frame), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.5, 0.48, 0.42), blind);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.9), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    m.emissiveNode = lit;
    return m;
  };
  // Cream plaster, a little weathering, a shade darker under the sills; white frames
  {
    const stain = rect(WIN.half, WIN.lo - 0.7, WIN.lo - 0.08, 0.2).mul(open).mul(0.05);
    const wall = mix(vec3(0.45, 0.405, 0.3), vec3(...CREAM).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain));
    M.plaster = skin(wall, [0.56, 0.55, 0.52], [0.42, 0.4, 0.36]);
  }
  // Dark-stained timber: vertical boards 0.14 m wide (fading out by 28 m), cream frames
  {
    const board = smoothstep(0.42, 0.48, abs(fract(U.div(0.14)).sub(0.5))).mul(fine).mul(0.35);
    const grain = hash(floor(U.div(0.14)).mul(17.3)).mul(0.25).add(0.88);
    const wall = vec3(...TIMBER).mul(grain).mul(float(1).sub(board)).mul(mix(float(0.9), float(1.08), worldNoise(0.5)));
    M.timber = skin(wall, [0.5, 0.46, 0.38], [0.2, 0.11, 0.06]);
  }
  // The shop windows: big dark panes with a thin mullion every 1.15 m and a transom; at night the shops are shut: a
  // faint glow behind most panes, a few lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.8 });
    const mu = abs(fract(U.div(1.15)).sub(0.5));
    const frame = smoothstep(0.465, 0.48, mu).max(smoothstep(0.03, 0.015, abs(V.sub(2.9)))).mul(near.mul(0.85).add(0.15));
    const cell = floor(U.div(1.15));
    const paneId = hash(cell.mul(13.1).add(7.7));
    m.colorNode = mix(mix(vec3(0.05, 0.065, 0.075), vec3(0.13, 0.15, 0.16), paneId), vec3(0.06, 0.04, 0.03), frame);
    m.roughnessNode = mix(float(0.08), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.1), frame);
    const on = litWindow(floor(U.div(3.45)), float(0), 61, { share: 0.25, late: 0.08, tone: twoTones([1.0, 0.86, 0.66], [0.92, 0.94, 1.0], 0.6) });
    m.emissiveNode = vec3(1.0, 0.82, 0.6).mul(0.06).add(on.mul(0.55)).mul(float(1).sub(frame)).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The decals: one canvas atlas --------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  ettinger: [0, 0, 768, 128],
  snowboard: [0, 136, 576, 128],
  rail: [584, 136, 184, 96],
  mural: [776, 0, 248, 330]
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // The fascia's letters: light grey, standing off the cream with a shadow under them (plain text, no logo)
  const letters = (text, w, h, px) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    g.fillStyle = 'rgba(70, 66, 58, 0.85)'; g.fillText(text, w / 2 + 3, h / 2 + 5, w - 12);
    g.fillStyle = '#d6d5cf'; g.fillText(text, w / 2, h / 2, w - 12);
  };
  cell('ettinger', (w, h) => letters('ettinger sport', w, h, 104));
  cell('snowboard', (w, h) => letters('snowboard', w, h, 104));
  // The railing's boards: dark timber, a narrow gap between them, a cut-out in each
  cell('rail', (w, h) => {
    const n = 8, bw = w / n;
    g.fillStyle = '#3a2216';
    for (let i = 0; i < n; i++) g.fillRect(i * bw + 1.5, 0, bw - 3, h);
    g.fillStyle = '#2a170e';
    g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i <= n; i++) {
      const x = i * bw;
      g.beginPath(); g.moveTo(x, h * 0.32); g.lineTo(x + 7, h / 2); g.lineTo(x, h * 0.68); g.lineTo(x - 7, h / 2); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  });
  // The faded painting over the arch: a frame, the mountains, a skier and a fir (simplified, in washed-out tones)
  cell('mural', (w, h) => {
    g.strokeStyle = 'rgba(120, 112, 96, 0.55)'; g.lineWidth = 5; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = 'rgba(126, 136, 140, 0.45)';
    g.beginPath(); g.moveTo(16, h * 0.55); g.lineTo(w * 0.3, h * 0.25); g.lineTo(w * 0.48, h * 0.42); g.lineTo(w * 0.7, h * 0.18); g.lineTo(w - 16, h * 0.5);
    g.lineTo(w - 16, h * 0.62); g.lineTo(16, h * 0.7); g.closePath(); g.fill();
    g.fillStyle = 'rgba(96, 112, 92, 0.5)';
    g.beginPath(); g.moveTo(w * 0.2, h * 0.88); g.lineTo(w * 0.28, h * 0.6); g.lineTo(w * 0.36, h * 0.88); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(92, 74, 62, 0.6)'; g.lineWidth = 6; g.lineCap = 'round';
    const k = (x, y) => [w * x, h * y];
    const line = (...pts) => { g.beginPath(); g.moveTo(...k(...pts[0])); for (const p of pts.slice(1)) g.lineTo(...k(...p)); g.stroke(); };
    line([0.62, 0.6], [0.58, 0.72], [0.5, 0.78]); // the body bent forward, a leg back
    line([0.58, 0.72], [0.64, 0.8]);
    line([0.6, 0.64], [0.72, 0.68]); // the arms, the poles
    line([0.42, 0.84], [0.78, 0.76]); // the skis
    g.fillStyle = 'rgba(92, 74, 62, 0.6)'; g.beginPath(); g.arc(...k(0.63, 0.56), 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(120, 112, 96, 0.45)'; g.lineWidth = 3;
    line([0.1, 0.92], [0.9, 0.92]);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  cream: [0.47, 0.43, 0.33], granite: [0.27, 0.26, 0.245], post: [0.07, 0.045, 0.03], awning: [0.025, 0.06, 0.17], beam: [0.11, 0.065, 0.04],
  rail: [0.13, 0.075, 0.045], slab: [0.42, 0.4, 0.34], mosaic: [0.16, 0.18, 0.17], step: [0.3, 0.29, 0.28], lamp: [0.08, 0.08, 0.085], coping: [0.36, 0.35, 0.32]
};

const P3 = (F, s, y, o = 0) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
/** The highest ground before a wall (half a metre out), or the roof of a part of the house standing there */
function footOf(F, self) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) {
    const [x, z] = onWall(F, Math.min(s, F.len), 0.5);
    const p = partAt(x, z);
    hi = Math.max(hi, p && p !== self ? p.top : groundHeight(x, z));
  }
  return hi;
}
/** A stretch of wall s0–s1 from y0 to y1 into `bucket`, with windows on the floors' grid of `line` or closed */
function wall(B, F, bucket, line, y0, y1, windows, s0 = 0, s1 = F.len) {
  if (y1 - y0 < 0.005 || s1 - s0 < 0.005) return;
  const v = (y) => y - line + UP - (windows ? 0 : CLOSED), mid = (s0 + s1) / 2;
  B.quad(bucket, P3(F, s0, y0), P3(F, s1, y0), P3(F, s1, y1), P3(F, s0, y1),
    [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half: windows && s1 - s0 >= 2.4 ? (s1 - s0) / 2 : 0 });
}
/** The first floor's foot (on the grid of `line`) whose windows clear the ground `hi` */
const windowsFrom = (line, hi) => line - Math.floor((line - hi - 0.25 + WIN.lo) / STOREY) * STOREY;

// A shop floor: a granite plinth over the highest ground, the glazing up to `top`, the awning over it
function shopFloor(B, F, foot, top, awning) {
  const g = foot + E.shopFront.plinth;
  B.box('trim', F, 0, F.len, 0, 0.1, E.base, g, C.granite);
  B.quad('glass', P3(F, 0, g), P3(F, F.len, g), P3(F, F.len, top), P3(F, 0, top), [[0, 0], [F.len, 0], [F.len, top - g], [0, top - g]]);
  const n = Math.max(1, Math.round(F.len / E.shopFront.bay)), w = E.shopFront.post / 2;
  for (let i = 0; i <= n; i++) {
    const s = Math.min(F.len - w, Math.max(w, (i * F.len) / n));
    B.box('trim', F, s - w, s + w, 0, 0.14, g, top, C.post);
  }
  B.box('trim', F, 0, F.len, 0, 0.16, g - 0.06, g, C.granite);
  if (awning) {
    const { out } = awning, y0 = top + 0.12, y1 = top + awning.rise;
    // the cloth sloping out from the wall, both its sides; the valance along its edge; its ends
    const a = P3(F, 0, y1), b = P3(F, F.len, y1), c = P3(F, F.len, y0, out), d = P3(F, 0, y0, out);
    B.quad('trim', d, c, b, a, undefined, { colour: C.awning });
    B.quad('trim', a, b, c, d, undefined, { colour: C.awning });
    B.box('trim', F, 0, F.len, out - 0.03, out, y0 - 0.22, y0, C.awning);
    B.tri('trim', P3(F, 0, y0, out), P3(F, 0, y1), P3(F, 0, y0), undefined, { colour: C.awning });
    B.tri('trim', P3(F, F.len, y0), P3(F, F.len, y1), P3(F, F.len, y0, out), undefined, { colour: C.awning });
  }
}

// The block's walls: the shop floor towards the Promenade, the floors over it (timber on its end up the street), the
// corner with the arch; the roof slab out over them
function buildBlock(B) {
  const p = E.parts.find((q) => q.id === 'block'), ring = outwardRing(p.ring);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const front = frontOf(a, b);
    if (front === 'tower') { buildTower(B, F, p); continue; }
    const upper = isTimber(a, b) ? 'timber' : 'plaster';
    const hi = footOf(F, p);
    if (front === 'blockSE' || front === 'blockSSW') {
      shopFloor(B, F, hi, p.ground - 0.6, E.shopFront.awning);
      wall(B, F, 'plaster', p.line, p.ground - 0.6, p.ground, false);
      wall(B, F, upper, p.line, p.ground, p.line, true);
      wall(B, F, upper, p.line, p.line, p.top, false);
      continue;
    }
    const windows = !isClosed(a, b) && F.len >= 2.4;
    const from = windows ? Math.min(p.line, windowsFrom(p.line, hi)) : p.top;
    wall(B, F, 'plaster', p.line, E.base, Math.min(from, p.ground), false);
    if (from < p.ground) wall(B, F, 'plaster', p.line, from, p.ground, true);
    if (from > p.ground) wall(B, F, upper, p.line, p.ground, from, false);
    if (windows) {
      wall(B, F, upper, p.line, Math.max(from, p.ground), p.line, true);
      wall(B, F, upper, p.line, p.line, p.top, false);
    }
  }
  // the roof slab, out over the walls
  const slab = offsetRing(ring, E.eaves), y0 = p.line, y1 = p.top;
  for (let i = 0; i < slab.length; i++) {
    const a = slab[i], b = slab[(i + 1) % slab.length], F = wallFrame(a, b);
    if (F.len < 0.02) continue;
    B.quad('trim', P3(F, 0, y0), P3(F, F.len, y0), P3(F, F.len, y1), P3(F, 0, y1), undefined, { colour: C.slab });
  }
  flatRoof(B, slab, y1);
  soffit(B, slab, y0, C.slab);
}

// An outline's underside, facing down, into the trim
function soffit(B, ring, y, colour) {
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = [ring[i], ring[j], ring[k]].map((q) => [q[0], y, q[1]]);
    const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
    const t = up ? [p[0], p[2], p[1]] : p;
    B.tri('trim', t[0], t[1], t[2], undefined, { colour });
  }
}

// The corner standing forward: the arch over the steps up to the glazed door in its recess, the painting over it, two
// lamps on its head
function buildTower(B, F, p) {
  const A = E.arch, r = A.width / 2, mid = F.len / 2, a0 = mid - r, a1 = mid + r;
  const street = E.street, door = street + A.steps * A.rise, spring = A.spring, apex = spring + r;
  const line = p.line;
  // the piers either side, the wall over the arch (in strips down to the curve)
  wall(B, F, 'plaster', line, E.base, p.top, false, 0, a0);
  wall(B, F, 'plaster', line, E.base, p.top, false, a1, F.len);
  wall(B, F, 'plaster', line, apex, p.top, false, a0, a1);
  const N = 12, arc = [];
  for (let k = 0; k <= N; k++) { const t = Math.PI * (1 - k / N); arc.push([mid + r * Math.cos(t), spring + r * Math.sin(t)]); }
  const v = (y) => y - line + UP - CLOSED;
  for (let k = 0; k < N; k++) {
    const [s0, y0] = arc[k], [s1, y1] = arc[k + 1];
    B.quad('plaster', P3(F, s0, y0), P3(F, s1, y1), P3(F, s1, apex), P3(F, s0, apex), [[s0 - mid, v(y0)], [s1 - mid, v(y1)], [s1 - mid, v(apex)], [s0 - mid, v(apex)]]);
    // the arch's soffit, back into the recess
    B.quad('trim', P3(F, s1, y1), P3(F, s0, y0), P3(F, s0, y0, -A.depth), P3(F, s1, y1, -A.depth), undefined, { colour: C.mosaic });
  }
  // the jambs under the springing, the recess' floor, the door's glazing at its back
  B.quad('trim', P3(F, a0, street - 0.2), P3(F, a0, street - 0.2, -A.depth), P3(F, a0, spring, -A.depth), P3(F, a0, spring), undefined, { colour: C.mosaic });
  B.quad('trim', P3(F, a1, street - 0.2, -A.depth), P3(F, a1, street - 0.2), P3(F, a1, spring), P3(F, a1, spring, -A.depth), undefined, { colour: C.mosaic });
  B.quad('glass', P3(F, a0, door, -A.depth), P3(F, a1, door, -A.depth), P3(F, a1, apex, -A.depth), P3(F, a0, apex, -A.depth),
    [[0, 0], [A.width, 0], [A.width, apex - door], [0, apex - door]]);
  B.box('trim', F, mid - 0.04, mid + 0.04, -A.depth, -A.depth + 0.08, door, spring + 0.4, C.post);
  B.box('trim', F, a0, a1, -A.depth, -A.depth + 0.08, spring + 0.35, spring + 0.47, C.post);
  // the steps: the top one the recess' floor, each lower one a tread further out
  for (let k = 1; k <= A.steps; k++) B.box('trim', F, a0 - 0.15 * (A.steps - k), a1 + 0.15 * (A.steps - k), -A.depth, (A.steps - k) * A.tread, E.base, street + k * A.rise, C.step);
  // the painting over the arch, the lamps on the head
  const M = A.mural;
  B.decal(F, mid - M.w / 2, mid + M.w / 2, 0.03, M.y0, M.y1, 'mural');
  for (const s of A.lamps) {
    B.box('trim', F, s - 0.03, s + 0.03, 0, 0.55, p.top - 0.85, p.top - 0.79, C.lamp);
    B.box('trim', F, s - 0.09, s + 0.09, 0.42, 0.62, p.top - 0.98, p.top - 0.84, C.lamp);
  }
}

// The balcony beside the corner: its slab at the first floor, a dark timber railing, the slab over it
function buildBalcony(B) {
  const { F, from, to, out } = balconyFrame(), Bc = E.balcony;
  B.box('trim', F, from, to, 0, out, Bc.floor - 0.18, Bc.floor, C.slab);
  B.box('trim', F, from, to, out - 0.06, out, Bc.floor, Bc.floor + Bc.rail, C.rail);
  B.box('trim', F, from, from + 0.06, 0, out - 0.06, Bc.floor, Bc.floor + Bc.rail, C.rail);
  B.box('trim', F, from - 0.02, to, -0.02, out + 0.04, Bc.floor + Bc.rail, Bc.floor + Bc.rail + 0.05, C.beam);
  B.box('trim', F, from, to, 0, out, Bc.roof[0], Bc.roof[1], C.slab);
}

// The shop wing and the hall behind: the shop front on the Promenade, closed walls elsewhere (the hall's are guessed),
// a coping round the roof, the timber railing on the front and the end at the station
function buildWing(B, p) {
  const ring = outwardRing(p.ring), S = E.shopFront;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    // (a wall against the block stands inside it)
    const [mx, mz] = onWall(F, F.len / 2, 0.3), other = partAt(mx, mz);
    if (other && other !== p) continue;
    if (frontOf(a, b) === 'wing') {
      shopFloor(B, F, footOf(F, p), S.glassTop, S.awning);
      wall(B, F, 'plaster', p.line, S.glassTop, S.cornice[0], false);
      B.box('trim', F, -0.02, F.len + 0.02, 0, 0.24, S.cornice[0], S.cornice[1], C.beam);
      for (const L of S.letters) B.decal(F, L.from, L.to, 0.04, L.y0, L.y1, L.key);
      railing(B, F, p.top);
      continue;
    }
    const end = isWall(E.railing.end, a, b);
    wall(B, F, 'plaster', p.line, E.base, p.top - (end ? S.cornice[1] - S.cornice[0] : 0.25), false);
    if (end) {
      B.box('trim', F, -0.02, F.len + 0.02, 0, 0.24, S.cornice[0], S.cornice[1], C.beam);
      railing(B, F, p.top);
    } else {
      B.box('trim', F, -0.04, F.len + 0.04, 0, 0.08, p.top - 0.25, p.top + 0.08, C.coping);
      const foot = footOf(F, p);
      B.box('trim', F, 0, F.len, 0, 0.05, E.base, foot + 0.3, C.granite);
    }
  }
  flatRoof(B, ring, p.top);
}

// The railing on a roof's edge: posts, a rail on top and at the foot, the boards with their cut-outs on both sides
function railing(B, F, y0) {
  const R = E.railing, h = R.height, o0 = -0.16, o1 = -0.06;
  const n = Math.max(1, Math.round(F.len / R.post));
  for (let i = 0; i <= n; i++) {
    const s = Math.min(F.len - 0.06, Math.max(0.06, (i * F.len) / n));
    B.box('trim', F, s - 0.06, s + 0.06, o0 - 0.01, o1 + 0.01, y0, y0 + h, C.rail);
  }
  B.box('trim', F, 0, F.len, o0 - 0.03, o1 + 0.03, y0 + h - 0.08, y0 + h, C.rail);
  B.box('trim', F, 0, F.len, o0, o1, y0, y0 + 0.08, C.rail);
  const m = Math.max(1, Math.round(F.len / 1.4)), w = F.len / m;
  const [bx, bz] = onWall(F, F.len, o0);
  const back = { a: [bx, bz], u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]], len: F.len };
  for (let k = 0; k < m; k++) {
    B.decal(F, k * w, (k + 1) * w, o1 + 0.005, y0 + 0.08, y0 + h - 0.08, 'rail');
    B.decal(back, k * w, (k + 1) * w, 0.005, y0 + 0.08, y0 + h - 0.08, 'rail');
  }
}

/**
 * Builds the house of Ettinger Sport into `scene`. Returns { group, colliders } (none of its own: the player's walls
 * stand on the surveyed outlines, js/landmarks.js; the steps under the arch are low enough to walk up).
 */
export function buildEttingerSport(scene) {
  const root = new THREE.Group();
  root.name = 'Ettinger Sport';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['plaster', 'timber'], name: 'Ettinger Sport' }), M = materials();
  buildBlock(B);
  buildBalcony(B);
  for (const p of E.parts) if (p.id !== 'block') buildWing(B, p);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}

