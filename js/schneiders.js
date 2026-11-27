import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, rectMask, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { AXES, P, SCHNEIDERS, SIDES, dormer, floorFoot, groundOutlines, inAnnex, onWall, outwardRing, roofY, side, slopes, wallFrame } from './schneiders-data.js';

export { SCHNEIDERS };

// Schneider's rebuilt by hand (js/schneiders-data.js), standing in for its swissBUILDINGS3D volumes, which the streamed
// tiles drew as a white block: the old house on the Promenade in cream plaster under its gabled roof, a window in a
// light frame in every bay (drawn by the wall's material from its uv: metres along the wall from the bays' middle,
// metres up the floors' grid), red shutters beside them from the second floor up, wrought-iron grilles over the first
// floor's, painted quoins at the corners and a painted frieze under the eaves; the wall dormer over the middle of the
// north-east slope, the chimneys, the dark timber in the gables' apexes and the deep verges with their bargeboards; on
// the Promenade the shop front in dark timber with its glazing and doors under the awning ("CONFISERIE"),
// "Schneider's" in gilt letters on the wall over it, the timber balconies stacked by the west corner; the low annex
// with its garage door at the east corner. Five meshes: the walls, the roofs, the glass, the trim (one vertex-coloured
// mesh) and the decoration (one canvas atlas).

excludeBuildings(SCHNEIDERS.exclude);
// (the player's walls on the surveyed walls, not on OSM's outline, which puts the gable on the Promenade 0.8 m out and
// leaves out the annex: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(SCHNEIDERS.osm, groundOutlines());

const S = SCHNEIDERS, STOREY = S.storey, BAY = S.bay, WIN = S.win, FOOT = S.foot, SH = S.shutter;
// v of a wall: metres up the floors' grid, the first floor's foot at 40 storeys (the material tells the floors by it:
// the grilles' floor, the shutters' from the 41st on); closed walls carry v − CLOSED
const UP = 40 * STOREY, CLOSED = 300 * STOREY;
// A windowed wall's aHalf: wide enough for every bay (the walls' strips say where windows are), one per side for the
// lights' pattern
const HALF = 50;
// m either side of a window's column taken by it with its shutters (and a little air)
const REACH = WIN.half + 0.06 + SH + 0.04;
const LINE = floorFoot(2); // the second floor's top: the eaves' walls end their windows there

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.46, 0.41, 0.3], FRAME = [0.5, 0.49, 0.45], SHUTTER = [0.36, 0.05, 0.04], TILE = [0.2, 0.18, 0.17];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(TILE, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.42, 0.36, 0.26], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4);
    M.glass = SIMPLE_SKINS.glow([0.07, 0.08, 0.085], 0.1, 0.8, [1.0, 0.82, 0.58], 0.3);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(8, 28);
  const glow = nightGlow();
  // Cream plaster with a window per bay and floor: a light frame with a post and a rail, a lighter surround, a stone
  // sill; red louvred shutters folded back beside it from the second floor up; a curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const shuttered = step(40.5, storey).mul(open);
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const surround = rect(WIN.half + 0.12, WIN.lo - 0.08, WIN.hi + 0.14, 0.02).mul(open).mul(near);
    const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.03, 0.015, abs(fv.sub(WIN.hi - 0.55))));
    const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.1, WIN.lo - 0.09, WIN.lo).mul(open).mul(near);
    const leaf = rectMask(abs(bu).sub(WIN.half + 0.06 + SH / 2), fv, SH / 2, WIN.lo, WIN.hi).mul(shuttered);
    const louvre = smoothstep(0.35, 0.5, abs(fract(fv.mul(9)).sub(0.5))).mul(fine).mul(0.45);
    const wall = mix(vec3(...PLASTER).mul(0.93), vec3(...PLASTER).mul(1.05), worldNoise(0.25));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.3), float(0.85), step(0.85, id)));
    const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(WIN.hi - WIN.lo - 0.14)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.08, 0.09, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(...PLASTER).mul(1.18), surround);
    c = mix(c, vec3(0.4, 0.39, 0.36), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.56, 0.52, 0.44), curtain);
    c = mix(c, vec3(...SHUTTER).mul(float(1).sub(louvre)), leaf);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (flats and the restaurant's rooms: lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 61, { share: 0.4, late: 0.1, tone: twoTones([1.0, 0.74, 0.45], [0.95, 0.87, 0.74], 0.7) }).mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The shop's glazing: dark glass, a warm display low in it; at night the shop shut, a faint glow behind most panes,
  // a few lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.75 });
    const paneId = hash(floor(U.div(1.25)).mul(13.1).add(step(1.9, V).mul(7.3)));
    const display = smoothstep(1.1, 0.7, V).mul(0.35);
    m.colorNode = mix(mix(vec3(0.05, 0.06, 0.065), vec3(0.11, 0.12, 0.13), paneId), vec3(0.3, 0.22, 0.14), display);
    m.emissiveNode = vec3(1.0, 0.82, 0.58).mul(mix(float(0.04), float(0.35), step(0.75, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The decoration: one canvas atlas ------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 816];
export const ATLAS = {
  quoin: [0, 0, 120, 436], // the painted quoins at a corner (0.9 m wide, a third of the height to the eaves), the corner on the left
  grille: [128, 0, 160, 284], // the wrought-iron grille over a first floor's window (1.24 × 2.27 m)
  frieze: [296, 0, 256, 90], // the painted frieze under the eaves (2 × 0.75 m, repeated)
  balustrade: [560, 0, 280, 200], // the balconies' sawn boards (1.4 × 0.95 m, repeated)
  valanceA: [0, 440, 1024, 96], // the awning's valance, its two halves (3.7 × 0.35 m each)
  valanceB: [0, 544, 1024, 96],
  name: [0, 648, 1024, 160] // "Schneider's" in gilt letters over the awning (5 × 0.75 m)
};
const GOLD = '#c9a052', GOLD_DARK = '#5e4318';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('quoin', (w, h) => {
    // blocks 0.41 m high, long and short in turn from the corner, a grey-blue line round each and a shadow under it
    const n = 8, bh = h / n;
    for (let i = 0; i < n; i++) {
      const bw = i % 2 ? w * 0.66 : w - 2, y = i * bh;
      g.fillStyle = '#d8cfb4'; g.fillRect(0, y + 2, bw, bh - 4);
      g.strokeStyle = '#6f7884'; g.lineWidth = 3; g.strokeRect(1.5, y + 2.5, bw - 3, bh - 5);
      g.fillStyle = 'rgba(70, 60, 45, 0.35)'; g.fillRect(4, y + bh - 7, bw - 6, 3);
    }
  });
  cell('grille', (w, h) => {
    // the window spans from 0.12 m over the cell's foot to 0.45 m under its top: a basket of bars over the sill, a
    // crown of scrolls over the head with a finial
    const k = h / 2.27, foot = h - 0.12 * k, sill = foot - 0.55 * k, head = 0.45 * k;
    g.strokeStyle = '#151515'; g.lineCap = 'round';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(6, foot); g.lineTo(w - 6, foot); g.moveTo(6, sill); g.lineTo(w - 6, sill); g.stroke();
    g.lineWidth = 3;
    for (let x = 14; x < w - 8; x += 22) { g.beginPath(); g.moveTo(x, sill); g.lineTo(x, foot); g.stroke(); }
    for (let x = 25; x < w - 14; x += 44) { g.beginPath(); g.arc(x, (sill + foot) / 2, 8, 0, Math.PI * 2); g.stroke(); }
    // the crown
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(8, head); g.lineTo(w - 8, head); g.stroke();
    g.lineWidth = 3;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(w / 2, head);
      g.bezierCurveTo(w / 2 + sx * 18, head - 36, w / 2 + sx * 52, head - 34, w / 2 + sx * 58, head - 12);
      g.arc(w / 2 + sx * 48, head - 12, 10, sx > 0 ? 0 : Math.PI, sx > 0 ? Math.PI : 0, sx < 0);
      g.stroke();
      g.beginPath(); g.arc(w / 2 + sx * 30, head - 8, 7, 0, Math.PI * 2); g.stroke();
    }
    g.beginPath(); g.moveTo(w / 2, head); g.lineTo(w / 2, head - 48); g.stroke();
    g.fillStyle = '#151515'; g.beginPath(); g.arc(w / 2, head - 52, 5, 0, Math.PI * 2); g.fill();
  });
  cell('frieze', (w, h) => {
    // a dark band, a running scroll in cream between two lines
    g.fillStyle = '#5a3d22'; g.fillRect(0, 8, w, h - 16);
    g.fillStyle = '#d6c69c'; g.fillRect(0, 8, w, 4); g.fillRect(0, h - 12, w, 4);
    g.strokeStyle = '#d6c69c'; g.lineWidth = 5;
    const n = 4, p = w / n, cy = h / 2;
    for (let i = 0; i < n; i++) {
      const x = i * p;
      g.beginPath();
      g.moveTo(x, cy + 16);
      g.bezierCurveTo(x + p * 0.3, cy + 16, x + p * 0.45, cy - 18, x + p * 0.62, cy - 4);
      g.arc(x + p * 0.55, cy - 4, p * 0.07, 0, Math.PI * 1.6);
      g.moveTo(x + p * 0.62, cy - 4);
      g.bezierCurveTo(x + p * 0.75, cy + 16, x + p * 0.9, cy + 16, x + p, cy + 16);
      g.stroke();
    }
  });
  cell('balustrade', (w, h) => {
    // boards 0.14 m wide between a top and a bottom rail, a heart sawn out of each and a slit between them
    g.fillStyle = '#3a2414';
    g.fillRect(0, 0, w, 18); g.fillRect(0, h - 18, w, 18);
    const bw = w / 10;
    for (let i = 0; i < 10; i++) g.fillRect(i * bw + 2, 18, bw - 4, h - 36);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 10; i++) {
      const cx = i * bw + bw / 2, cy = h * 0.45;
      g.beginPath();
      g.moveTo(cx, cy + 16);
      g.bezierCurveTo(cx - 16, cy + 2, cx - 10, cy - 14, cx, cy - 4);
      g.bezierCurveTo(cx + 10, cy - 14, cx + 16, cy + 2, cx, cy + 16);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(0, 0, 0, 0.25)'; g.fillRect(0, 16, w, 3);
  });
  const valance = (t) => (w, h) => {
    g.fillStyle = '#cfc8b6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7a1e14'; g.fillRect(0, h - 10, w, 6);
    g.font = '600 58px Georgia, "Times New Roman", serif';
    g.fillStyle = '#3b2416'; g.fillText(t, w / 2, h / 2 - 2, w - 60);
  };
  cell('valanceA', valance('C O N F I S E R I E'));
  cell('valanceB', valance('')); // (the TEA-ROOM is the pavilion's next door, js/schneiders-chalet.js)
  cell('name', (w, h) => {
    g.font = 'italic 600 132px Georgia, "Times New Roman", serif';
    g.fillStyle = GOLD_DARK; g.fillText('Schneider\'s', w / 2 + 3, h / 2 + 5, w - 40);
    g.fillStyle = GOLD; g.fillText('Schneider\'s', w / 2, h / 2 + 2, w - 40);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  timber: [0.1, 0.055, 0.03], board: [0.16, 0.09, 0.045], frame: FRAME, band: [0.5, 0.45, 0.33], plinth: [0.24, 0.23, 0.21],
  shop: [0.09, 0.05, 0.028], pane: [0.03, 0.038, 0.045], awning: [0.5, 0.48, 0.42], plaster: PLASTER, cap: [0.16, 0.16, 0.17],
  metal: [0.2, 0.2, 0.21], door: [0.2, 0.19, 0.17], brass: [0.55, 0.42, 0.18]
};

/** A wall's point in the world: s along it, y up, `o` out of it */
const at = (F, s, y, o = 0) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
/** A point of the roof's frame in the world */
const R3 = (u, w, y) => { const [x, z] = P(u, w); return [x, y, z]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** A polygon (convex, its points [x, y, z]) into `bucket`, turned to face `dir`, as a fan; `uvOf(p)` its uv */
function facing(B, bucket, pts, dir, { uvOf = (p) => [p[0], p[2]], colour = null } = {}) {
  const [a, b, c] = pts, u = sub(b, a), v = sub(c, a);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const q = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] >= 0 ? pts : [...pts].reverse();
  for (let i = 1; i < q.length - 1; i++) B.tri(bucket, q[0], q[i], q[i + 1], [q[0], q[i], q[i + 1]].map(uvOf), { colour });
}

/** A strip of a wall from s0 to s1, y0 to y1, into the plaster: windowed (aHalf `half`) or closed; u from the side's `mid` */
function plaster(B, sd, s0, s1, y0, y1, half = 0) {
  if (y1 - y0 < 0.01 || s1 - s0 < 0.01) return;
  const F = sd.F, mid = sd.mid, v = (y) => y - FOOT + UP - (half ? 0 : CLOSED);
  B.quad('plaster', at(F, s0, y0), at(F, s1, y0), at(F, s1, y1), at(F, s0, y1),
    [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half });
}

/**
 * The part of the rectangle s0–s1, y0–y1 of a gable under the roof (the roof's line over it: `roofAt`, a tent with its
 * kink at the side's middle), as polygons [[s, y], …] counter-clockwise seen from outside
 */
export function underRoof(sd, s0, s1, y0, y1) {
  const cuts = sd.mid > s0 && sd.mid < s1 ? [[s0, sd.mid], [sd.mid, s1]] : [[s0, s1]];
  const out = [];
  for (const [a, b] of cuts) {
    // the roof's line over a–b: y = ya + (s − a) × k
    const ya = sd.roofAt(a), k = (sd.roofAt(b) - ya) / (b - a);
    const f = ([s, y]) => ya + (s - a) * k - y; // ≥ 0 under the roof
    const poly = [[a, y0], [b, y0], [b, y1], [a, y1]], res = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
      if (fp >= 0) res.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); res.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    if (res.length >= 3) out.push(res);
  }
  return out;
}

/** The part of a gable's rectangle under the roof, closed plaster (or `colour`: into the trim) */
function gablePiece(B, sd, s0, s1, y0, y1, colour = null) {
  if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
  const F = sd.F, dir = [F.n[0], 0, F.n[1]];
  for (const poly of underRoof(sd, s0, s1, y0, y1)) {
    const pts = poly.map(([s, y]) => at(F, s, y));
    if (colour) facing(B, 'trim', pts, dir, { colour });
    else {
      const uvs = new Map(pts.map((p, i) => [p, [poly[i][0] - sd.mid, poly[i][1] - FOOT + UP - CLOSED]]));
      facing(B, 'plaster', pts, dir, { uvOf: (p) => uvs.get(p) });
    }
  }
}

/** The highest ground along a wall from s0 to s1, half a metre out of it (the annex's roof where it stands before it) */
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.5));
  for (let k = 0; k <= n; k++) {
    const s = s0 + ((s1 - s0) * k) / n, [x, z] = onWall(F, s, 0.5);
    hi = Math.max(hi, groundHeight(x, z), inAnnex(...onWall(F, s, 0.4)) ? S.annex.top : -Infinity);
  }
  return hi;
}

/** The first floor's foot whose windows clear the ground `hi` (the windows begin there, a closed plinth under it) */
const windowsFrom = (hi) => FOOT + Math.ceil((hi - FOOT - WIN.lo) / STOREY) * STOREY;

/** A window modelled in the trim (where the wall's material draws none): frame and two panes, its sill */
function trimWindow(B, F, s, half, y0, y1) {
  B.box('trim', F, s - half, s + half, 0, 0.05, y0, y1, C.frame);
  B.box('trim', F, s - half + 0.07, s - 0.03, 0.05, 0.065, y0 + 0.07, y1 - 0.07, C.pane);
  B.box('trim', F, s + 0.03, s + half - 0.07, 0.05, 0.065, y0 + 0.07, y1 - 0.07, C.pane);
  B.box('trim', F, s - half - 0.05, s + half + 0.05, 0, 0.1, y0 - 0.07, y0, C.band);
}

/** The painted quoins at a wall's corner (`left`: the corner at s 0), from y0 to y1 in three blocks of the atlas' cell */
function quoins(B, F, left, y0, y1) {
  const w = S.quoins.w, s0 = left ? 0 : F.len - w, h = (y1 - y0) / 3;
  for (let i = 0; i < 3; i++) B.decal(F, s0, s0 + w, 0.02, y0 + i * h, y0 + (i + 1) * h, 'quoin', { mirror: !left });
}

/** The frieze under the eaves from s0 to s1, y0 to y1: the atlas' cell repeated, each about 2 m */
function frieze(B, F, s0, s1, y0, y1) {
  const n = Math.max(1, Math.round((s1 - s0) / 2)), w = (s1 - s0) / n;
  for (let i = 0; i < n; i++) B.decal(F, s0 + i * w, s0 + (i + 1) * w, 0.02, y0, y1, 'frieze');
}

/** The windows' strips of a wall's lower floors: [s0, s1] split halfway between the columns */
function strips(cols) {
  const edges = [cols[0] - REACH, ...cols.slice(1).map((c, i) => (c + cols[i]) / 2), cols[cols.length - 1] + REACH];
  return edges.slice(1).map((e, i) => [edges[i], e]);
}

// A side of the house: the closed plinth where the ground rises, the floors with their windows up to the second, then
// the eaves' wall with the frieze (the north-east and south-west) or the gable with the attic's and the top floor's
// windows and the timber apex (the north-west and the south-east); the quoins, the bands, the stone plinth
function buildSide(B, id, idx) {
  const sd = side(id), F = sd.F, len = F.len, base = S.base, half = HALF + idx;
  if (sd.kind === 'party') {
    // against the chalet next door: closed, the frieze under the eaves
    const top = sd.roofAt(0);
    plaster(B, sd, 0, len, base, top);
    frieze(B, F, 0, len, top - 1.0, top - 0.25);
    B.box('trim', F, 0, len, 0, 0.03, base, groundAlong(F) + 0.35, C.plinth);
    return;
  }
  // (the gable on the Promenade: the shop front under the first floor, buildShop)
  const low = id === 'nw' ? FOOT : base;
  const s0 = sd.cols[0] - REACH, s1 = sd.cols[sd.cols.length - 1] + REACH;
  plaster(B, sd, 0, s0, low, LINE);
  plaster(B, sd, s1, len, low, LINE);
  // the stone plinth over the ground, stepping down the slope with the windows (the Promenade's: the shop's)
  if (id !== 'nw') for (const [a, b] of [[0, s0], ...strips(sd.cols), [s1, len]]) B.box('trim', F, a, b, 0, 0.03, base, groundAlong(F, a, b) + 0.2, C.plinth);
  for (const [a, b] of strips(sd.cols)) {
    const from = id === 'nw' ? FOOT : Math.max(low, Math.min(LINE, windowsFrom(groundAlong(F, a, b) + 0.25)));
    plaster(B, sd, a, b, low, from);
    plaster(B, sd, a, b, from, LINE, half);
    // the wrought-iron grilles over the first floor's windows (the north-east and the north-west; none behind a balcony)
    const c = (a + b) / 2, Bl = S.balconies;
    if (id !== 'se' && from <= FOOT && !(id === 'nw' && c > Bl.s0 && c < Bl.s1)) B.decal(F, c - 0.62, c + 0.62, 0.04, FOOT + WIN.lo - 0.12, FOOT + WIN.hi + 0.45, 'grille');
  }
  if (sd.kind === 'eaves') {
    // the north-east wall up to the eaves; over its middle the dormer's wall with the attic's window
    const top = sd.roofAt(0), D = dormer(), D0 = S.dormer, c = sd.dormer[0];
    plaster(B, sd, 0, D.s0, LINE, top);
    plaster(B, sd, D.s1, len, LINE, top);
    plaster(B, sd, D.s0, c - REACH, LINE, D0.eave);
    plaster(B, sd, c + REACH, D.s1, LINE, D0.eave);
    plaster(B, sd, c - REACH, c + REACH, LINE, LINE + STOREY, half);
    plaster(B, sd, c - REACH, c + REACH, LINE + STOREY, D0.eave);
    // its gable, a small window in it
    const v = (y) => y - FOOT + UP - CLOSED;
    B.tri('plaster', at(F, D.s0, D0.eave), at(F, D.s1, D0.eave), at(F, c, D0.peak), [[D.s0 - sd.mid, v(D0.eave)], [D.s1 - sd.mid, v(D0.eave)], [c - sd.mid, v(D0.peak)]]);
    trimWindow(B, F, c, 0.32, D0.eave + 0.45, D0.eave + 1.55);
    frieze(B, F, 0, D.s0, top - 0.95, top - 0.2);
    frieze(B, F, D.s1, len, top - 0.95, top - 0.2);
    quoins(B, F, true, S.quoins.y0, top);
    quoins(B, F, false, S.quoins.y0, top);
  } else {
    // a gable: the attic's windows, the top floor's in the middle, the timber apex
    const bands = [[LINE, LINE + STOREY, sd.attic], [LINE + STOREY, S.timber, sd.top]];
    for (const [y0, y1, cols] of bands) {
      const a = cols[0] - REACH, b = cols[cols.length - 1] + REACH;
      gablePiece(B, sd, 0, a, y0, y1);
      plaster(B, sd, a, b, y0, y1, half);
      gablePiece(B, sd, b, len, y0, y1);
    }
    gablePiece(B, sd, 0, len, S.timber, S.roof.ridge + 0.5, C.timber);
    // the apex's battens and the beam at its foot
    B.box('trim', F, 0.2, len - 0.2, 0, 0.12, S.timber - 0.12, S.timber + 0.12, C.board);
    for (let s = sd.mid - 2.4; s <= sd.mid + 2.41; s += 0.6) {
      const y1 = sd.roofAt(s) - 0.2;
      if (y1 > S.timber + 0.3) B.box('trim', F, s - 0.04, s + 0.04, 0, 0.05, S.timber + 0.12, y1, C.board);
    }
    B.box('trim', F, -0.05, len + 0.05, 0, 0.08, LINE - 0.08, LINE + 0.1, C.band);
    const top = Math.min(sd.roofAt(0), sd.roofAt(len));
    if (id === 'nw') quoins(B, F, true, S.quoins.y0, top);
    else quoins(B, F, false, S.quoins.y0, top);
  }
  // the band over the ground floor (the Promenade's under its awning)
  if (id !== 'nw') B.box('trim', F, -0.05, len + 0.05, 0, 0.07, FOOT - 0.12, FOOT + 0.08, C.band);
}

/**
 * A slope of a roof: a, b along its eaves, c, d along its ridge (or its top edge); the dark boards under it, the
 * fascia along the eaves, the verge boards on the a–d and b–c edges where asked (`deep` m down: the bargeboards)
 */
function slope(B, a, b, c, d, { fascia = true, vergeA = false, vergeB = false, deep = 0.16 } = {}) {
  facing(B, 'roof', [a, b, c, d], [0, 1, 0], { uvOf: (p) => [p[0], p[2]] });
  const t = 0.16, lo = (q, k = t) => [q[0], q[1] - k, q[2]];
  const h = (p, q) => { const v = sub(p, q), l = Math.hypot(v[0], v[2]) || 1; return [v[0] / l, 0, v[2] / l]; };
  facing(B, 'trim', [lo(a), lo(b), lo(c), lo(d)], [0, -1, 0], { colour: C.board });
  if (fascia) facing(B, 'trim', [lo(a), lo(b), b, a], h([(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2], [(c[0] + d[0]) / 2, 0, (c[2] + d[2]) / 2]), { colour: C.timber });
  if (vergeA) facing(B, 'trim', [lo(d, deep), lo(a, deep), a, d], h(a, b), { colour: C.timber });
  if (vergeB) facing(B, 'trim', [lo(b, deep), lo(c, deep), c, b], h(b, a), { colour: C.timber });
}

// The roof: the north-east slope round the dormer, the south-west one, the dormer's own two slopes, the ridge's cap, the
// finials over the gables, the chimneys
function buildRoof(B) {
  const R = S.roof, L = R.length, RW = R.ridgeW, D = dormer(), D0 = S.dormer, u0 = S.walls.u0, w0 = S.walls.w0;
  const uL = u0 + D.s0, uR = u0 + D.s1, uc = u0 + D.mid, deep = 0.42;
  // the north-east slope: either side of the dormer down to the eaves, behind it from where its eaves meet the roof
  slope(B, R3(0, 0, R.eaveNE), R3(uL, 0, R.eaveNE), R3(uL, RW, R.ridge), R3(0, RW, R.ridge), { vergeA: true, vergeB: true, deep });
  slope(B, R3(uR, 0, R.eaveNE), R3(L, 0, R.eaveNE), R3(L, RW, R.ridge), R3(uR, RW, R.ridge), { vergeA: true, vergeB: true, deep });
  slope(B, R3(uL, D.wBack, D0.eave), R3(uR, D.wBack, D0.eave), R3(uR, RW, R.ridge), R3(uL, RW, R.ridge), { fascia: false });
  // the south-west slope
  slope(B, R3(L, R.width, R.eaveSW), R3(0, R.width, R.eaveSW), R3(0, RW, R.ridge), R3(L, RW, R.ridge), { vergeA: true, vergeB: true, deep });
  // the dormer's slopes: from its eaves (out over its walls) up to its peak, from before its face back into the roof
  const [k1] = slopes(), kd = (D0.peak - D0.eave) / D0.half, wf = w0 - D0.front;
  for (const [ue, sgn] of [[uL - D0.over, -1], [uR + D0.over, 1]]) {
    const ye = D0.eave - D0.over * kd, wbe = (ye - R.eaveNE) / k1;
    const a = R3(ue, wbe, ye), b = R3(ue, wf, ye), c = R3(uc, wf, D0.peak), d = R3(uc, D.wPeak, D0.peak);
    slope(B, a, b, c, d, { vergeB: true, deep: 0.3 });
    // its side wall under the eaves, down to the roof
    const us = sgn < 0 ? uL : uR, dir = [AXES.U[0] * sgn, 0, AXES.U[1] * sgn];
    facing(B, 'plaster', [R3(us, w0, roofY(w0)), R3(us, w0, D0.eave), R3(us, D.wBack, D0.eave)], dir,
      { uvOf: (p) => [Math.hypot(p[0] - R3(us, w0, 0)[0], p[2] - R3(us, w0, 0)[2]), p[1] - FOOT + UP - CLOSED] });
  }
  // the ridge's cap
  const ridge = wallFrame(P(0, RW), P(L, RW));
  B.box('trim', ridge, -0.05, L + 0.05, -0.13, 0.13, R.ridge - 0.06, R.ridge + 0.12, C.metal);
  // the finials over the gables (at the verges' apex)
  for (const u of [0, L]) {
    const f = wallFrame(P(u, RW - 0.06), P(u, RW + 0.06));
    B.box('trim', f, 0, 0.12, -0.06, 0.06, R.ridge, R.ridge + 1.15, C.timber);
    B.box('trim', f, -0.04, 0.16, -0.1, 0.1, R.ridge + 1.15, R.ridge + 1.3, C.brass);
  }
  // the chimneys: plastered stacks with a dark cap
  for (const [u, w, h] of S.chimneys) {
    const f = wallFrame(P(u - 0.3, w), P(u + 0.3, w)), y0 = Math.min(roofY(w - 0.3), roofY(w + 0.3)) - 0.3;
    const y1 = Math.max(roofY(w - 0.3), roofY(w + 0.3)) + h;
    B.box('trim', f, 0, 0.6, -0.28, 0.28, y0, y1, C.plaster);
    B.box('trim', f, -0.06, 0.66, -0.34, 0.34, y1, y1 + 0.1, C.cap);
    B.box('trim', f, 0.15, 0.45, -0.1, 0.1, y1 + 0.1, y1 + 0.35, C.cap);
  }
}

// The shop front on the Promenade under the first floor: the stone plinth, the glazing and the doors in dark timber
// between plastered piers, the awning with its valance over it, the name in gilt letters on the wall
function buildShop(B) {
  const sd = side('nw'), F = sd.F, len = F.len, Sh = S.shop, base = S.base;
  const openings = [...Sh.windows, Sh.door].sort((p, q) => p[0] - q[0]);
  // (the doors' sill level with the street)
  const [d0, d1] = Sh.door, dm = (d0 + d1) / 2, sill = groundAlong(F, d0, d1) + 0.05;
  plaster(B, sd, 0, len, Sh.head, FOOT);
  let s = 0;
  for (const [a, b] of openings) { plaster(B, sd, s, a, Sh.sill, Sh.head); s = b; }
  plaster(B, sd, s, len, Sh.sill, Sh.head);
  for (const [a, b, y1] of [[0, d0, Sh.sill], [d0, d1, sill], [d1, len, Sh.sill]]) {
    plaster(B, sd, a, b, base, y1);
    B.box('trim', F, a, b, 0, 0.05, base, y1, C.plinth);
  }
  const glass = (a, b, y0, y1) => B.quad('glass', at(F, a, y0), at(F, b, y0), at(F, b, y1), at(F, a, y1), [[a, y0 - Sh.sill], [b, y0 - Sh.sill], [b, y1 - Sh.sill], [a, y1 - Sh.sill]]);
  for (const [a, b] of Sh.windows) {
    glass(a, b, Sh.sill, Sh.head);
    // the frame round it, the posts every 1.25 m or so, the rail under the fanlights
    B.box('trim', F, a - 0.1, b + 0.1, 0, 0.12, Sh.sill - 0.1, Sh.sill + 0.06, C.shop);
    B.box('trim', F, a - 0.1, b + 0.1, 0, 0.12, Sh.head - 0.06, Sh.head + 0.1, C.shop);
    B.box('trim', F, a - 0.1, a + 0.05, 0, 0.12, Sh.sill, Sh.head, C.shop);
    B.box('trim', F, b - 0.05, b + 0.1, 0, 0.12, Sh.sill, Sh.head, C.shop);
    const n = Math.max(1, Math.round((b - a) / 1.25));
    for (let i = 1; i < n; i++) { const x = a + ((b - a) * i) / n; B.box('trim', F, x - 0.04, x + 0.04, 0, 0.1, Sh.sill, Sh.head, C.shop); }
    B.box('trim', F, a, b, 0, 0.1, Sh.head - 0.72, Sh.head - 0.64, C.shop);
  }
  // the doors: two glazed leaves in a dark frame, brass handles, a fanlight
  glass(d0, d1, sill, Sh.head);
  B.box('trim', F, d0 - 0.1, d1 + 0.1, 0, 0.14, Sh.head - 0.62, Sh.head - 0.52, C.shop);
  for (const [a, b] of [[d0 - 0.1, d0 + 0.08], [dm - 0.05, dm + 0.05], [d1 - 0.08, d1 + 0.1]]) B.box('trim', F, a, b, 0, 0.14, sill, Sh.head, C.shop);
  for (const [a, b] of [[d0, dm], [dm, d1]]) {
    B.box('trim', F, a, b, 0, 0.12, sill, sill + 0.25, C.shop);
    B.box('trim', F, a, b, 0, 0.12, Sh.head - 0.12, Sh.head, C.shop);
  }
  for (const x of [dm - 0.14, dm + 0.14]) B.box('trim', F, x - 0.02, x + 0.02, 0.14, 0.2, sill + 0.9, sill + 1.3, C.brass);
  // the awning: a sloped cloth from the wall, its valance lettered, its sides
  const A = Sh.awning, yw = A.y, ye = A.y - A.drop, yv = ye - A.valance;
  facing(B, 'trim', [at(F, A.s0, yw), at(F, A.s1, yw), at(F, A.s1, ye, A.out), at(F, A.s0, ye, A.out)], [F.n[0], 1, F.n[1]], { colour: C.awning });
  facing(B, 'trim', [at(F, A.s0, yw - 0.03), at(F, A.s1, yw - 0.03), at(F, A.s1, ye - 0.03, A.out), at(F, A.s0, ye - 0.03, A.out)], [0, -1, 0], { colour: C.awning });
  facing(B, 'trim', [at(F, A.s0, yv, A.out), at(F, A.s1, yv, A.out), at(F, A.s1, ye, A.out), at(F, A.s0, ye, A.out)], [F.n[0], 0, F.n[1]], { colour: C.awning });
  for (const [s, sg] of [[A.s0, -1], [A.s1, 1]]) facing(B, 'trim', [at(F, s, yw), at(F, s, ye, A.out), at(F, s, yv, A.out)], [F.u[0] * sg, 0, F.u[1] * sg], { colour: C.awning });
  // (the arms holding it)
  for (const s2 of [A.s0 + 0.2, (A.s0 + A.s1) / 2, A.s1 - 0.2]) B.box('trim', F, s2 - 0.03, s2 + 0.03, 0, A.out, ye - 0.06, ye, C.metal);
  const am = (A.s0 + A.s1) / 2;
  B.decal(F, A.s0, am, A.out + 0.01, yv, ye, 'valanceA');
  B.decal(F, am, A.s1, A.out + 0.01, yv, ye, 'valanceB');
  const N = Sh.name;
  B.decal(F, N.s0, N.s1, 0.03, N.y0, N.y1, 'name');
}

// The timber balconies stacked by the west corner of the gable on the Promenade: each a slab on two beams, a rail of
// sawn boards on three sides under a handrail, the corner posts
function buildBalconies(B) {
  const sd = side('nw'), F = sd.F, Bl = S.balconies, o = Bl.out, rail = 0.95;
  const left = { a: onWall(F, Bl.s0, 0), u: F.n, n: [-F.u[0], -F.u[1]] };
  const right = { a: onWall(F, Bl.s1, o), u: [-F.n[0], -F.n[1]], n: F.u };
  for (const y of Bl.levels) {
    B.box('trim', F, Bl.s0, Bl.s1, 0, o, y - 0.2, y, C.timber, { top: 'trim' });
    for (const s of [Bl.s0 + 0.25, Bl.s1 - 0.25]) B.box('trim', F, s - 0.08, s + 0.08, 0, o - 0.05, y - 0.5, y - 0.2, C.timber);
    // the handrail, the posts
    B.box('trim', F, Bl.s0, Bl.s1, o - 0.08, o, y + rail, y + rail + 0.08, C.timber);
    for (const s of [Bl.s0, Bl.s1 - 0.08]) {
      B.box('trim', F, s, s + 0.08, 0.05, o, y + rail, y + rail + 0.08, C.timber);
      B.box('trim', F, s, s + 0.08, o - 0.08, o, y, y + rail, C.timber);
    }
    // the sawn boards: on the front, two cells; on each side, one
    const m = (Bl.s0 + Bl.s1) / 2;
    B.decal(F, Bl.s0 + 0.08, m, o - 0.03, y, y + rail, 'balustrade');
    B.decal(F, m, Bl.s1 - 0.08, o - 0.03, y, y + rail, 'balustrade');
    B.decal(left, 0.05, o - 0.08, 0.04, y, y + rail, 'balustrade');
    B.decal(right, 0.08, o - 0.05, 0.04, y, y + rail, 'balustrade');
  }
}

// The annex at the east corner: plastered walls under a flat roof with its coping, the garage door in its south-east wall
function buildAnnex(B) {
  const An = S.annex, ring = outwardRing(An.ring), base = S.base;
  let door = null;
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len < 0.05) continue;
    const sd = { F, mid: F.len / 2 };
    plaster(B, sd, 0, F.len, base, An.top);
    B.box('trim', F, -0.04, F.len + 0.04, -0.25, 0.06, An.top - 0.15, An.top + 0.12, C.band);
    B.box('trim', F, 0, F.len, 0, 0.03, base, groundAlong(F) + 0.3, C.plinth);
    // (its south-east wall: the one facing away from the house)
    if ((!door || F.len > door.len) && F.n[0] * -AXES.U[0] + F.n[1] * -AXES.U[1] > 0.7) door = F;
  }
  if (door) {
    const s = door.len / 2, w = An.door.w / 2, g = groundAlong(door, s - w, s + w), y1 = g + An.door.h;
    B.box('trim', door, s - w - 0.1, s + w + 0.1, 0, 0.08, g, y1 + 0.1, C.band);
    B.box('trim', door, s - w, s + w, 0.08, 0.1, g, y1, C.door);
    for (let k = 1; k < 6; k++) B.box('trim', door, s - w, s + w, 0.1, 0.12, g + (y1 - g) * (k / 6) - 0.02, g + (y1 - g) * (k / 6) + 0.02, C.cap);
  }
  flatRoof(B, ring, An.top + 0.12);
}

/**
 * Builds Schneider's into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand on the
 * house's and the annex's outlines, js/landmarks.js SURVEYED_FOOTPRINTS; the awning and the balconies hang over the
 * street, the doors' sill is level with it).
 */
export function buildSchneiders(scene) {
  const root = new THREE.Group();
  root.name = 'Schneider\'s';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Schneiders' }), M = materials();
  SIDES.forEach((id, i) => buildSide(B, id, i));
  buildRoof(B);
  buildShop(B);
  buildBalconies(B);
  buildAnnex(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
