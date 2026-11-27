import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, length, mix, smoothstep, step, uv, vec2, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { MEIERHOF, entranceAt, frontFrame, gableSpan, groundOutlines, onWall, outwardRing, part, pointInRing, ridge, wallFrame } from './meierhof-data.js';

export { MEIERHOF };

// The Hotel Meierhof rebuilt by hand (js/meierhof-data.js), standing in for its swissBUILDINGS3D volume, which the
// streamed tiles drew as one white block with the town houses' windows: the old house on the Promenade in white plaster
// with a window in a dark brown frame in every bay of every floor (drawn by the wall's material from its uv: metres
// along the wall from its middle, metres up the floors' grid), round-headed on the top floor, a band over the ground
// floor, the dark eaves round its flat strips, the gable over the middle with its attic's windows and the slate roof
// on dark boards; the oriel at the north-east corner on its corbel, "MEIERHOF" in gilt letters down the wall under it
// and across the front, the monogram with its three stars, the Swiss flag on the roof, the entrance under a canopy in
// the middle of the front; the west part, the low wing towards the garden, the glazed garden room and the stair in the
// same plaster. Five meshes: the walls, the roofs, the glass, the trim (one vertex-coloured mesh) and the lettering (one
// canvas atlas). The hotel's hanging sign (js/shops.js) gives way to its own lettering.

excludeBuildings([MEIERHOF.exclude]);
SHOP_EXCLUSIONS.add(MEIERHOF.osm);
// (the player's walls on the surveyed volumes, not on OSM's rectangle, which leaves out the garden room and the stair:
// js/landmarks.js)
SURVEYED_FOOTPRINTS.set(MEIERHOF.osm, groundOutlines());

const STOREY = MEIERHOF.storey, BAY = MEIERHOF.bay, WIN = MEIERHOF.win;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the old house's `line` at 40 of
// them, the other parts' at 20: the material rounds the heads of the windows on the 40th floor only); closed walls
// carry v − CLOSED
const UP_OLD = 40 * STOREY, UP = 20 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.6, 0.6, 0.58], FRAME = [0.09, 0.05, 0.03], SLATE = [0.17, 0.17, 0.18], EAVES = [0.11, 0.06, 0.035];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(SLATE, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.52, 0.52, 0.5], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4);
    M.glass = SIMPLE_SKINS.glow([0.08, 0.1, 0.11], 0.1, 0.8, [1.0, 0.84, 0.62], 0.4);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  // White plaster with a window per bay and floor: a dark brown frame, a post in its middle and a rail across its upper
  // part (on the top floor of the old house a round head instead), a light sill under it; a curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const top = step(38.5, storey).mul(step(storey, 39.5));
    const spring = WIN.hi - WIN.half; // (where a round head springs)
    const disc = (r) => smoothstep(r + 0.012, r - 0.012, length(vec2(bu, fv.sub(spring)))).mul(step(spring, fv));
    const arched = (inset) => rect(WIN.half - inset, WIN.lo + inset, spring).max(disc(WIN.half - inset));
    const win = mix(rect(WIN.half, WIN.lo, WIN.hi), arched(0), top).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu)).max(smoothstep(0.035, 0.02, abs(fv.sub(WIN.hi - 0.5))).mul(float(1).sub(top)));
    const pane = mix(rect(WIN.half - 0.08, WIN.lo + 0.08, WIN.hi - 0.08), arched(0.08), top).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.08, WIN.lo - 0.09, WIN.lo).mul(open).mul(near);
    // the plaster: a little weathering, a shade darker under the sills
    const stain = rect(WIN.half, WIN.lo - 0.75, WIN.lo - 0.09, 0.2).mul(open).mul(0.05);
    const wall = mix(vec3(...PLASTER).mul(0.92), vec3(...PLASTER).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.04)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.6, id).mul(mix(float(0.35), float(0.9), step(0.86, id)));
    const curtain = step(float(WIN.hi - 0.08).sub(drawn.mul(WIN.hi - WIN.lo - 0.16)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.075, 0.09, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(0.5, 0.5, 0.48), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.55, 0.5, 0.42), curtain);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (a hotel: rooms lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 37, { share: 0.45, late: 0.12, tone: twoTones([1.0, 0.75, 0.46], [0.95, 0.88, 0.76], 0.75) }).mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The garden room's glazing: dark brown posts every 1.2 m, a rail 1.1 m up, a faint glow at night and a few panes lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.2)).sub(0.5));
    const frame = smoothstep(0.45, 0.47, mu).max(smoothstep(0.05, 0.03, abs(V.sub(1.1)))).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.2)).mul(13.1).add(step(1.1, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.06, 0.075, 0.08), vec3(0.13, 0.15, 0.16), paneId), vec3(...FRAME), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.2), frame);
    m.emissiveNode = vec3(1.0, 0.84, 0.62).mul(float(1).sub(frame)).mul(mix(float(0.04), float(0.35), step(0.75, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The lettering, the monogram, the oriel's windows and the flag: one canvas atlas ------------------------------------
const ATLAS_SIZE = [1024, 1024];
export const ATLAS = {
  letters: [0, 0, 120, 924], // the name down the wall under the oriel (0.95 × 7.3 m)
  monogram: [128, 0, 256, 310], // the M under three stars (1.4 × 1.7 m)
  arch2: [400, 0, 160, 300], // the oriel's front: two round-headed windows over an iron rail
  arch: [576, 0, 134, 300], // ... its sides: one each
  flag: [720, 0, 128, 128],
  name: [128, 320, 896, 112], // the name across the front (6 × 0.75 m)
  board: [128, 440, 640, 100] // the board on the entrance's canopy (3.2 × 0.5 m)
};
const GOLD = '#c9a052', GOLD_DARK = '#6e4f1c';

/** A five-pointed star at (x, y), `r` its outer radius */
function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.42 : r;
    g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  g.closePath();
  g.fill();
}

/** Round-headed windows side by side in a cell w × h px: dark brown frames, dark glass, an iron rail across their foot */
function archWindows(g, w, h, n) {
  const gap = 10, ww = (w - gap * (n + 1)) / n, r = ww / 2, foot = h - 6, spring = 6 + r;
  for (let i = 0; i < n; i++) {
    const x = gap + i * (ww + gap);
    const shape = (inset) => {
      g.beginPath();
      g.moveTo(x + inset, foot - inset);
      g.lineTo(x + inset, spring);
      g.arc(x + r, spring, r - inset, Math.PI, 0);
      g.lineTo(x + ww - inset, foot - inset);
      g.closePath();
    };
    g.fillStyle = '#2a1a10'; shape(0); g.fill();
    g.fillStyle = '#1b2428'; shape(7); g.fill();
    g.fillStyle = '#2a1a10'; g.fillRect(x + r - 3, spring - r, 6, foot - spring + r);
    g.fillRect(x + 7, spring + 4, ww - 14, 5);
  }
  // the rail: a bar on top, uprights and scrolls under it
  const r0 = h * 0.72;
  g.strokeStyle = '#141414'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(2, r0); g.lineTo(w - 2, r0); g.moveTo(2, foot); g.lineTo(w - 2, foot); g.stroke();
  g.lineWidth = 2.5;
  for (let x = 8; x < w - 4; x += 14) { g.beginPath(); g.moveTo(x, r0); g.lineTo(x, foot); g.stroke(); }
  for (let x = 15; x < w - 8; x += 28) { g.beginPath(); g.arc(x, (r0 + foot) / 2, 6, 0, Math.PI * 2); g.stroke(); }
}

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // gilt letters: a dark edge under the gold
  const gilt = (t, x, y) => { g.fillStyle = GOLD_DARK; g.fillText(t, x + 2, y + 2); g.fillStyle = GOLD; g.fillText(t, x, y); };
  cell('letters', (w, h) => {
    g.font = '600 104px Georgia, "Times New Roman", serif';
    [...'MEIERHOF'].forEach((t, i) => gilt(t, w / 2, ((i + 0.5) * h) / 8));
  });
  cell('monogram', (w, h) => {
    g.font = '600 220px Georgia, "Times New Roman", serif';
    gilt('M', w / 2, h * 0.64);
    g.fillStyle = GOLD;
    for (const [x, y] of [[w * 0.3, 52], [w * 0.5, 34], [w * 0.7, 52]]) star(g, x, y, 22);
  });
  cell('arch2', (w, h) => archWindows(g, w, h, 2));
  cell('arch', (w, h) => archWindows(g, w, h, 1));
  cell('flag', (w, h) => {
    g.fillStyle = '#d5171c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(w * 0.4, h * 0.19, w * 0.2, h * 0.62); g.fillRect(w * 0.19, h * 0.4, w * 0.62, h * 0.2);
  });
  cell('name', (w, h) => {
    g.font = '500 84px Georgia, "Times New Roman", serif';
    gilt('M  E  I  E  R  H  O  F', w / 2, h / 2 + 4);
  });
  cell('board', (w, h) => {
    g.fillStyle = '#20140c'; g.fillRect(0, 0, w, h);
    g.font = '600 56px Georgia, "Times New Roman", serif';
    g.fillStyle = GOLD; g.fillText('HOTEL MEIERHOF', w / 2, h / 2 + 3, w - 40);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  plaster: PLASTER, frame: FRAME, eaves: EAVES, band: [0.5, 0.5, 0.48], plinth: [0.27, 0.27, 0.26], coping: [0.45, 0.45, 0.43],
  pane: [0.03, 0.038, 0.045], door: [0.06, 0.075, 0.08], step: [0.32, 0.32, 0.31], pole: [0.55, 0.56, 0.57]
};

/** A wall's point in the world: s along it, y up, `o` out of it */
const at = (F, s, y, o = 0) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };

/** A triangle of a roof, turned to face up */
function roofTri(B, a, b, c) {
  const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0;
  const t = up ? [a, b, c] : [a, c, b];
  B.tri('roof', t[0], t[1], t[2], t.map((p) => [p[0], p[2]]));
}
const roofQuad = (B, a, b, c, d) => { roofTri(B, a, b, c); roofTri(B, a, c, d); };

/** A quad into the trim, turned to face `dir` ([x, y, z]) */
function trimQuad(B, a, b, c, d, dir, colour) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const ok = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] >= 0;
  if (ok) B.quad('trim', a, b, c, d, undefined, { colour });
  else B.quad('trim', a, d, c, b, undefined, { colour });
}

/**
 * A strip of a wall from s0 to s1, y0 to y1, into the plaster: windowed (u from `mid`, the bays' half `half`, the grid's
 * `line` and `up`) or closed
 */
function plaster(B, F, s0, s1, y0, y1, { line, up, windows = false, mid = (s0 + s1) / 2, half = (s1 - s0) / 2 }) {
  if (y1 - y0 < 0.01 || s1 - s0 < 0.01) return;
  const v = (y) => y - line + up - (windows ? 0 : CLOSED);
  B.quad('plaster', at(F, s0, y0), at(F, s1, y0), at(F, s1, y1), at(F, s0, y1),
    [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half: windows ? half : 0 });
}

// The highest ground along a wall, half a metre out of it
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 2));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}

/** Is the ground before a wall free at s (no other part of the hotel 0.4 m out of it reaching over `y`)? */
function freeAt(p, F, s, y = 0) {
  const [x, z] = onWall(F, s, 0.4);
  return !MEIERHOF.parts.some((q) => q !== p && q.top > y && pointInRing(q.ring, x, z));
}

/** The first floor's foot whose windows clear the ground `hi` (the windows begin there, a closed plinth under it) */
function windowsFrom(hi) {
  const k = Math.max(0, Math.ceil((hi - MEIERHOF.foot - WIN.lo) / STOREY));
  return MEIERHOF.foot + k * STOREY;
}

/** A window modelled in the trim (where the wall's material draws none: the gable, the attic): frame and two panes */
function trimWindow(B, F, s, half, y0, y1) {
  B.box('trim', F, s - half, s + half, 0, 0.05, y0, y1, C.frame);
  B.box('trim', F, s - half + 0.08, s - 0.03, 0.05, 0.065, y0 + 0.08, y1 - 0.08, C.pane);
  B.box('trim', F, s + 0.03, s + half - 0.08, 0.05, 0.065, y0 + 0.08, y1 - 0.08, C.pane);
  B.box('trim', F, s - half - 0.05, s + half + 0.05, 0, 0.12, y0 - 0.08, y0, C.band);
}

// A volume: its walls from the base up to its roof (a closed plinth where the ground rises, the floors with their
// windows, the parapet), the eaves or the coping round its roof, the roof
function buildPart(B, p) {
  const ring = outwardRing(p.ring), base = MEIERHOF.base, up = p.old ? UP_OLD : UP;
  const front = MEIERHOF.front;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const hi = groundAlong(F);
    const g = { line: p.line, up };
    if (p.glazed && F.len > 1.0 && freeAt(p, F, F.len / 2)) {
      // the garden room: glass from a low sill up to under its roof
      const foot = hi + 0.4, y1 = p.top - 0.35;
      plaster(B, F, 0, F.len, base, foot, g);
      B.quad('glass', at(F, 0, foot), at(F, F.len, foot), at(F, F.len, y1), at(F, 0, y1), [[0, 0], [F.len, 0], [F.len, y1 - foot], [0, y1 - foot]]);
      plaster(B, F, 0, F.len, y1, p.top, g);
    } else if (p.windows === false || F.len < 2.4) {
      plaster(B, F, 0, F.len, base, p.top, g);
    } else {
      const from = Math.min(windowsFrom(hi + 0.25), p.line);
      plaster(B, F, 0, F.len, base, from, g);
      const isFront = p.id === 'house' && Math.hypot(a[0] - front.a[0], a[1] - front.a[1]) < 0.05 && Math.hypot(b[0] - front.b[0], b[1] - front.b[1]) < 0.05;
      if (isFront) {
        // the front on the Promenade: its top floor free of windows by the oriel and the monogram (the bays laid out
        // from the whole front's middle, so that the top floor's windows stand over the others)
        const tf = p.line - STOREY, W = { ...g, windows: true, mid: F.len / 2, half: F.len / 2 };
        plaster(B, F, 0, F.len, from, tf, W);
        plaster(B, F, 0, MEIERHOF.topClear, tf, p.line, g);
        plaster(B, F, MEIERHOF.topClear, F.len, tf, p.line, W);
      } else plaster(B, F, 0, F.len, from, p.line, { ...g, windows: true });
      plaster(B, F, 0, F.len, p.line, p.top, g);
    }
    // the plinth's stone band over the ground
    B.box('trim', F, 0, F.len, 0, 0.03, base, hi + 0.35, C.plinth);
    if (p.old) {
      // the band over the ground floor, where the wall is free
      if (freeAt(p, F, F.len / 2, MEIERHOF.foot + STOREY)) B.box('trim', F, -0.06, F.len + 0.06, 0, 0.07, MEIERHOF.foot + STOREY - 0.1, MEIERHOF.foot + STOREY + 0.12, C.band);
      // the dark eaves round the flat strips (none under the gable, whose wall rises on)
      const span = gableSpan(a, b);
      const runs = span ? [[-0.6, span[0]], [span[1], F.len + 0.6]] : [[-0.6, F.len + 0.6]];
      for (const [s0, s1] of runs) if (s1 - s0 > 0.1) B.box('trim', F, s0, s1, -0.05, 0.6, p.top - 0.3, p.top + 0.14, C.eaves, { top: 'roof' });
    } else B.box('trim', F, -0.04, F.len + 0.04, -0.25, 0.06, p.top - 0.12, p.top + 0.12, C.coping);
  }
  flatRoof(B, ring, p.top);
}

// The gable over the old house: its walls from the flat strips up to the eaves, the gables up to the ridge with the
// attic's windows, the slate roof on its dark boards
function buildGable(B) {
  const G = MEIERHOF.gable, R = outwardRing(G.ring), y0 = part('house').top, g = { line: part('house').line, up: UP_OLD };
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    plaster(B, F, 0, F.len, y0, G.eave, g);
    const m = F.len / 2;
    if (Math.abs(F.n[1]) > 0.8) {
      // a gable: the triangle up to the ridge; three rows of windows narrowing up it
      const v = (y) => y - g.line + g.up - CLOSED;
      B.tri('plaster', at(F, 0, G.eave), at(F, F.len, G.eave), at(F, m, G.ridge), [[-m, v(G.eave)], [m, v(G.eave)], [0, v(G.ridge)]]);
      for (const s of [-4.05, -1.35, 1.35, 4.05]) trimWindow(B, F, m + s, 0.55, y0 + 0.5, G.eave - 0.3);
      for (const s of [-1.0, 1.0]) trimWindow(B, F, m + s, 0.5, G.eave + 1.0, G.eave + 2.4);
      trimWindow(B, F, m, 0.32, G.eave + 3.4, G.eave + 4.3);
    } else {
      // a knee wall over the flat strip: low windows in the floors' columns
      for (let k = -Math.floor(m / BAY); k <= Math.floor(m / BAY); k++) if (Math.abs(k * BAY) + 1.0 <= m) trimWindow(B, F, m + k * BAY, 0.5, y0 + 0.45, G.eave - 0.35);
    }
  }
  // the roof: two slopes from the eaves to the ridge, out over the gables and the eaves; under them the dark boards
  const [rn, rs] = ridge(), ov = G.overhang;
  const dl = Math.hypot(rs[0] - rn[0], rs[1] - rn[1]), d = [(rs[0] - rn[0]) / dl, (rs[1] - rn[1]) / dl];
  const [p0, p1, p2, p3] = G.ring;
  for (const [en, es] of [[p1, p2], [p0, p3]]) {
    // e: across the ridge towards this side's eaves; the run from the ridge to them
    let e = [-d[1], d[0]];
    const run = (en[0] - rn[0]) * e[0] + (en[1] - rn[1]) * e[1];
    if (run < 0) e = [-e[0], -e[1]];
    const r = Math.abs(run), drop = ((G.ridge - G.eave) / r) * ov;
    const P = (q, along, out, y) => [q[0] + d[0] * along + e[0] * out, y, q[1] + d[1] * along + e[1] * out];
    const a = P(en, -ov, ov, G.eave - drop), b = P(es, ov, ov, G.eave - drop), c = P(rs, ov, 0, G.ridge), dd = P(rn, -ov, 0, G.ridge);
    roofQuad(B, a, b, c, dd);
    // the boards under the slope, the fascia along the eaves, the verge boards along the gables
    const t = 0.16, lo = (q) => [q[0], q[1] - t, q[2]];
    trimQuad(B, lo(a), lo(b), lo(c), lo(dd), [0, -1, 0], C.eaves);
    trimQuad(B, lo(a), lo(b), b, a, [e[0], 0, e[1]], C.eaves);
    trimQuad(B, lo(dd), lo(a), a, dd, [-d[0], 0, -d[1]], C.eaves);
    trimQuad(B, lo(b), lo(c), c, b, [d[0], 0, d[1]], C.eaves);
  }
}

// The oriel at the north-east corner of the front: a half octagon on the top floor, round-headed windows in its faces,
// its corbel tapering down the wall, the dark cap under the eaves; the name down the wall under it, the monogram beside
// it, the name across the front
function buildOriel(B) {
  const O = MEIERHOF.oriel, F = frontFrame(), house = part('house'), y1 = house.top - 0.3;
  const s0 = O.s - O.w / 2, s1 = O.s + O.w / 2, cut = 0.55;
  const plan = [[s0, 0], [s0 + cut, O.out], [s1 - cut, O.out], [s1, 0]].map(([s, o]) => onWall(F, s, o));
  const g = { line: house.line, up: UP_OLD };
  for (let i = 0; i < 3; i++) {
    const W = wallFrame(plan[i], plan[i + 1]);
    plaster(B, W, 0, W.len, O.y0, y1, g);
    const pad = 0.08;
    B.decal(W, pad, W.len - pad, 0.02, O.y0 + 0.25, y1 - 0.3, i === 1 ? 'arch2' : 'arch');
  }
  // its floor and the corbel under it, a wedge down to the wall
  const P = (q, y) => [q[0], y, q[1]];
  const k0 = onWall(F, O.s - 0.45, 0), k1 = onWall(F, O.s + 0.45, 0);
  // (each face from the oriel's foot down to the corbel's tip on the wall; the sides are triangles)
  trimQuad(B, P(plan[1], O.y0), P(plan[2], O.y0), P(k1, O.corbel), P(k0, O.corbel), [F.n[0], -0.6, F.n[1]], C.plaster);
  trimQuad(B, P(plan[0], O.y0), P(plan[1], O.y0), P(k0, O.corbel), P(k0, O.corbel), [-F.u[0] + F.n[0], -0.6, -F.u[1] + F.n[1]], C.plaster);
  trimQuad(B, P(plan[2], O.y0), P(plan[3], O.y0), P(k1, O.corbel), P(k1, O.corbel), [F.u[0] + F.n[0], -0.6, F.u[1] + F.n[1]], C.plaster);
  // the cap: a dark slab over it, under the eaves
  B.box('trim', F, s0 - 0.15, s1 + 0.15, 0, O.out + 0.15, y1, y1 + 0.3, C.eaves, { top: 'roof' });
  const L = MEIERHOF.letters, Mo = MEIERHOF.monogram, N = MEIERHOF.name;
  B.decal(F, L.s - L.w / 2, L.s + L.w / 2, 0.03, L.y0, L.y1, 'letters');
  B.decal(F, Mo.s - Mo.w / 2, Mo.s + Mo.w / 2, 0.03, Mo.y0, Mo.y1, 'monogram');
  B.decal(F, N.s0, N.s1, 0.03, N.y0, N.y1, 'name');
}

// The entrance in the middle of the front: the doors in their frame, a step, the canopy with the name's board on it
function buildEntrance(B) {
  const E = MEIERHOF.entrance, F = frontFrame(), s = entranceAt(), K = E.canopy, w = E.w / 2;
  const ground = groundAlong(F, s - 1.2, s + 1.2), sill = ground + 0.12, top = sill + E.h;
  B.box('trim', F, s - w - 0.12, s + w + 0.12, 0, 0.12, sill, top + 0.12, C.frame);
  B.box('trim', F, s - w + 0.06, s - 0.04, 0.12, 0.14, sill + 0.08, top - 0.06, C.door);
  B.box('trim', F, s + 0.04, s + w - 0.06, 0.12, 0.14, sill + 0.08, top - 0.06, C.door);
  for (const x of [s - 0.25, s + 0.25]) B.box('trim', F, x - 0.02, x + 0.02, 0.14, 0.2, sill + 0.95, sill + 1.25, C.pole);
  B.box('trim', F, s - w - 0.5, s + w + 0.5, 0, 1.1, ground - 0.5, sill, C.step);
  const ky = top + 0.45;
  B.box('trim', F, s - K.w / 2, s + K.w / 2, 0, K.out, ky, ky + K.thick, C.eaves, { top: 'roof' });
  const Bd = E.board;
  B.box('trim', F, s - Bd.w / 2, s + Bd.w / 2, K.out - 0.1, K.out - 0.04, ky + K.thick, ky + K.thick + Bd.h, C.eaves);
  B.decal(F, s - Bd.w / 2, s + Bd.w / 2, K.out - 0.03, ky + K.thick, ky + K.thick + Bd.h, 'board');
  return { sill, top };
}

// The Swiss flag on the east strip of the roof
function buildFlag(B) {
  const Fl = MEIERHOF.flag, F = frontFrame(), top = part('house').top, y1 = top + Fl.pole;
  B.box('trim', F, Fl.s - 0.05, Fl.s + 0.05, Fl.o - 0.05, Fl.o + 0.05, top, y1, C.pole);
  B.box('trim', F, Fl.s - 0.09, Fl.s + 0.09, Fl.o - 0.09, Fl.o + 0.09, y1, y1 + 0.12, C.band);
  // the flag out from the pole along the front, both its sides
  const [px, pz] = onWall(F, Fl.s + 0.06, Fl.o);
  const fr = { a: [px, pz], u: F.u, n: F.n }, bk = { a: [px + F.u[0] * Fl.w, pz + F.u[1] * Fl.w], u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]] };
  B.decal(fr, 0, Fl.w, 0.01, y1 - Fl.w - 0.1, y1 - 0.1, 'flag');
  B.decal(bk, 0, Fl.w, 0.01, y1 - Fl.w - 0.1, y1 - 0.1, 'flag');
}

/**
 * Builds the Hotel Meierhof into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand
 * on the parts' outlines, js/landmarks.js SURVEYED_FOOTPRINTS; the step before the doors is low enough to walk onto).
 */
export function buildMeierhof(scene) {
  const root = new THREE.Group();
  root.name = 'Hotel Meierhof';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Meierhof' }), M = materials();
  for (const p of MEIERHOF.parts) buildPart(B, p);
  buildGable(B);
  buildOriel(B);
  buildEntrance(B);
  buildFlag(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}

