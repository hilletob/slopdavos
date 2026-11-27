import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { HARD_ROCK_HOTEL, alongRun, cafeRuns, groundOutlines, isCafeFront, onWall, outwardRing, part, partAt, wallFrame } from './hard-rock-hotel-data.js';

export { HARD_ROCK_HOTEL };

// The Hard Rock Hotel Davos and the rest of the old Kurhaus complex rebuilt by hand (js/hard-rock-hotel-data.js),
// standing in for its swissBUILDINGS3D volume, which the streamed tiles drew as one white block with the town houses'
// windows: the hotel's white blocks with tall windows in salmon surrounds under a cornice, the pyramid roof over the
// middle, the rail round the east wing's roof and the stone porch with its arches on the Tobelmühlestrasse; the
// Kurhaus' front of the 1970s on the square in warm grey concrete, its glazing in red frames, the red band with "CAFE",
// the piers and the frieze of tiles under the cornice; the white residence to the south with its balconies and the low
// link. Windows are drawn by the walls' materials from their uv (metres along the wall from its middle, metres up the
// floors' grid). Six meshes: the two walls, the roofs, the glass, the trim (one vertex-coloured mesh) and the decals (one
// canvas atlas). The English Church between it and the lane stays as the tiles draw it.

const H = HARD_ROCK_HOTEL;
excludeBuildings([H.exclude]);
// (the player's walls on the surveyed volumes and the porch, not on OSM's outlines, for each of the five buildings:
// js/landmarks.js)
for (const [id, rings] of groundOutlines()) SURVEYED_FOOTPRINTS.set(id, rings);

// v of a wall: metres up its grid, a floor's top at every multiple of the storey (the part's `line` at 40 of them);
// closed walls carry v − closed
const GRID = { old: { ...H.grid.old }, modern: { ...H.grid.modern } };
for (const g of Object.values(GRID)) { g.up = 40 * g.storey; g.closed = 300 * g.storey; }
const gridOf = (p) => (p.style === 'old' ? GRID.old : GRID.modern);
const bucketOf = (p) => (p.style === 'old' ? 'old' : 'modern');

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const WHITE = [0.6, 0.6, 0.575], SALMON = [0.56, 0.28, 0.2], CONCRETE = [0.4, 0.385, 0.35], RED = [0.4, 0.022, 0.028];
const TINT = { white: [0.58, 0.58, 0.56], concrete: CONCRETE };
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.2, 0.2, 0.2], 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    const w = (g, rgb) => SIMPLE_SKINS.windowed(rgb, g.storey, g.win.lo / g.storey, g.win.hi / g.storey, 0.9, 0.4);
    M.old = w(GRID.old, [0.56, 0.52, 0.49]);
    M.modern = w(GRID.modern, [0.46, 0.45, 0.42]);
    M.glass = SIMPLE_SKINS.glow([0.14, 0.05, 0.05], 0.2, 0.6, [1.0, 0.8, 0.55], 0.3);
    return M;
  }
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.09, 0.105), worldNoise(0.07));
  // The hotel: white plaster, a tall window per bay and floor in a salmon surround with a cap over it, white sashes with
  // a post and a transom, a blind drawn in some
  {
    const G = GRID.old, W = G.win;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: G.bay, storey: G.storey, closed: G.closed, winHalf: W.half });
    const surround = rect(W.half + 0.13, W.lo - 0.12, W.hi + 0.12).max(rect(W.half + 0.2, W.hi + 0.12, W.hi + 0.24)).mul(open);
    const sash = rect(W.half, W.lo, W.hi).mul(open);
    const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.035, 0.02, abs(fv.sub(W.hi - 0.62))));
    const pane = rect(W.half - 0.07, W.lo + 0.07, W.hi - 0.07).mul(float(1).sub(bars.mul(near))).mul(open);
    const wall = mix(vec3(...WHITE).mul(0.93), vec3(...WHITE).mul(1.04), worldNoise(0.3)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.6, id).mul(mix(float(0.35), float(1), step(0.88, id)));
    const blind = step(float(W.hi - 0.07).sub(drawn.mul(W.hi - W.lo - 0.14)), fv).mul(pane).mul(near);
    let c = mix(wall, vec3(...SALMON), surround.mul(near.mul(0.6).add(0.4)));
    c = mix(c, vec3(0.62, 0.61, 0.58), sash);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.5, 0.47, 0.42), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (a hotel: rooms lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 59, { share: 0.4, late: 0.1, tone: twoTones([1.0, 0.74, 0.46], [1.0, 0.86, 0.66], 0.6) }).mul(pane).mul(mix(float(1), float(0.45), blind)).mul(glow.mul(1.1));
    M.old = m;
  }
  // The residence, the link and the café's blocks: plaster in the wall's own tint (white or warm grey concrete, its
  // vertex colour), a window per bay and floor in a dark frame with a post, a sill under it
  {
    const G = GRID.modern, W = G.win;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: G.bay, storey: G.storey, closed: G.closed, winHalf: W.half });
    const tint = attribute('color', 'vec3');
    const frame = rect(W.half, W.lo, W.hi).mul(open);
    const bars = smoothstep(0.035, 0.02, abs(bu));
    const pane = rect(W.half - 0.06, W.lo + 0.06, W.hi - 0.06).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(W.half + 0.06, W.lo - 0.08, W.lo).mul(open).mul(near);
    const wall = tint.mul(mix(float(0.92), float(1.05), worldNoise(0.3))).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    let c = mix(wall, tint.mul(0.82), sill);
    c = mix(c, vec3(0.07, 0.072, 0.075), frame);
    c = mix(c, glassC, pane);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.92), float(0.12), pane);
    m.metalnessNode = pane.mul(0.55);
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 61, { share: 0.4, late: 0.1, tone: twoTones([1.0, 0.76, 0.48], [0.9, 0.9, 0.95], 0.7) }).mul(pane).mul(glow.mul(1.1));
    M.modern = m;
  }
  // The café's glazing: red frames every 1.5 m, a transom, the café shut at night: a faint glow behind most panes, a
  // few lit
  {
    const U = uv().x, V = uv().y;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.5)).sub(0.5)), mv = abs(fract(V.div(2.2)).sub(0.5));
    const frame = smoothstep(0.445, 0.465, mu).max(smoothstep(0.465, 0.48, mv)).mul(near.mul(0.8).add(0.2));
    const paneId = hash(floor(U.div(1.5)).mul(13.1).add(floor(V.div(2.2)).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.04, 0.05, 0.055), vec3(0.1, 0.11, 0.12), paneId), vec3(...RED), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.1), frame);
    const lit = mix(float(0.12), float(0.9), step(0.82, paneId));
    m.emissiveNode = vec3(1.0, 0.82, 0.58).mul(float(1).sub(frame)).mul(lit).mul(glow.mul(0.5));
    M.glass = m;
  }
  return M;
}

// --- The tiles, the café's name and the porch's arches: one canvas atlas ------------------------------------------------
const ATLAS_SIZE = [512, 256];
export const ATLAS = {
  cafe: [0, 0, 320, 96], // "CAFE" on the red band (1.8 × 0.55 m)
  putto: [328, 0, 72, 96], // a tile of the frieze: a child (0.72 × 0.95 m)
  arms: [408, 0, 72, 96], // a tile of the frieze: a shield in a wreath
  arch: [0, 100, 120, 150] // an arch of the porch (its opening, the stone ring)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('cafe', (w, h) => {
    g.fillStyle = '#b3242a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = `italic bold ${Math.round(h * 0.6)}px Helvetica, Arial, sans-serif`;
    g.fillText('CAFE', w / 2, h * 0.54, w - 30);
  });
  // (the tiles in a pale frame on the cream frieze; simplified figures after the photographs, not copies)
  const tile = (w, h, ground) => {
    g.fillStyle = '#8f8676'; g.fillRect(0, 0, w, h);
    g.fillStyle = ground; g.fillRect(4, 4, w - 8, h - 8);
  };
  cell('putto', (w, h) => {
    tile(w, h, '#8fb0cf');
    g.fillStyle = '#ecd2b4';
    g.beginPath(); g.arc(w / 2, h * 0.22, 8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(w / 2, h * 0.47, 11, 17, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(w / 2 - 9, h * 0.6, 7, 24); g.fillRect(w / 2 + 2, h * 0.6, 7, 24);
    g.fillRect(w / 2 - 20, h * 0.36, 9, 6); g.fillRect(w / 2 + 11, h * 0.32, 9, 6);
    g.fillStyle = '#d8b25a'; g.fillRect(w / 2 - 12, h * 0.12, 24, 3);
  });
  cell('arms', (w, h) => {
    tile(w, h, '#e6dfcc');
    g.strokeStyle = '#4f7a3a'; g.lineWidth = 4;
    g.beginPath(); g.arc(w / 2, h / 2, 26, Math.PI * 0.15, Math.PI * 0.85, true); g.stroke();
    g.fillStyle = '#d6aa2c';
    g.beginPath(); g.moveTo(w / 2 - 15, h * 0.3); g.lineTo(w / 2 + 15, h * 0.3); g.lineTo(w / 2 + 15, h * 0.52);
    g.quadraticCurveTo(w / 2 + 14, h * 0.68, w / 2, h * 0.74); g.quadraticCurveTo(w / 2 - 14, h * 0.68, w / 2 - 15, h * 0.52); g.closePath(); g.fill();
    g.fillStyle = '#1f2f5a'; g.fillRect(w / 2 - 15, h * 0.3, 30, 10);
  });
  cell('arch', (w, h) => {
    const r = w / 2 - 6, spring = r + 6;
    g.fillStyle = '#b4ab99';
    g.beginPath(); g.moveTo(0, h); g.lineTo(0, r + 6); g.arc(w / 2, r + 6, w / 2, Math.PI, 0); g.lineTo(w, h); g.closePath(); g.fill();
    g.fillStyle = '#16171a';
    g.beginPath(); g.moveTo(10, h); g.lineTo(10, r + 6); g.arc(w / 2, r + 6, w / 2 - 10, Math.PI, 0); g.lineTo(w - 10, h); g.closePath(); g.fill();
    g.fillStyle = '#cbc3b1'; g.fillRect(w / 2 - 7, 0, 14, 16);
    g.fillStyle = '#9a917f'; g.fillRect(0, spring, 10, 5); g.fillRect(w - 10, spring, 10, 5);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  cornice: [0.56, 0.56, 0.54], concrete: [0.47, 0.455, 0.42], coping: [0.3, 0.3, 0.29], red: RED, rail: [0.18, 0.19, 0.19],
  stone: [0.42, 0.4, 0.35], slab: [0.52, 0.52, 0.5], panel: [0.5, 0.53, 0.55], step: [0.33, 0.33, 0.32]
};

/** A wall's corners in the world: s along it, y up */
const at = (F, s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };

/** The highest ground along a wall, half a metre before it */
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

/** A plastered wall from y0 to y1 of part p, with windows (its bays' half `half`) or closed, on its grid from its line */
function plaster(B, p, F, y0, y1, half) {
  if (y1 - y0 < 0.01) return;
  const g = gridOf(p), mid = F.len / 2, v = (y) => y - p.line + g.up - (half > 0 ? 0 : g.closed);
  const colour = p.style === 'old' ? null : TINT[p.tint];
  B.quad(bucketOf(p), at(F, 0, y0), at(F, F.len, y0), at(F, F.len, y1), at(F, 0, y1), [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half, colour });
}

/** The glazing of a wall from y0 to y1 (uv in metres along it and up from its foot) */
function glass(B, F, y0, y1) {
  if (y1 - y0 < 0.3) return;
  B.quad('glass', at(F, 0, y0), at(F, F.len, y0), at(F, F.len, y1), at(F, 0, y1), [[0, 0], [F.len, 0], [F.len, y1 - y0], [0, y1 - y0]]);
}

/**
 * The lowest floor's foot of a wall with windows: the floors counted down from the part's line while a window's sill
 * stays over the highest ground before the wall (no pane cut by the ground; a closed plinth under it)
 */
export function windowsFrom(p, hiGround) {
  const g = gridOf(p), k = Math.floor((p.line - (hiGround + 0.3 - g.win.lo)) / g.storey + 1e-9);
  return k > 0 ? p.line - k * g.storey : p.line;
}

// A volume: its walls from the base up to its roof (the floors with windows over a closed plinth, closed above its
// line), the café's front on the square, the cornice or coping, the roof
function buildPart(B, p) {
  const R = outwardRing(p.ring), g = gridOf(p), base = H.base;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.05) continue;
    if (isCafeFront(p, F)) { cafeWall(B, p, F); continue; }
    const windows = p.windows !== false && F.len >= 2 * (g.win.half + 0.4) + 0.2;
    if (!windows) plaster(B, p, F, base, p.top, 0);
    else {
      const from = windowsFrom(p, groundAlong(F));
      plaster(B, p, F, base, from, 0);
      plaster(B, p, F, from, p.line, F.len / 2);
      plaster(B, p, F, p.line, p.top, 0);
    }
    if (p.style === 'old') B.box('trim', F, 0, F.len, 0, 0.28, p.top - 0.38, p.top + 0.05, C.cornice);
    else if (p.style === 'modern') B.box('trim', F, 0, F.len, 0, 0.1, p.top - 0.12, p.top + 0.06, C.coping);
  }
  flatRoof(B, R, p.top);
  if (p.rail) buildRail(B, R, p.top);
  if (p.balconies) buildBalconies(B, p, R);
}

// A wall of the café's front: a closed plinth, the ground floor's glazing from the ground at each of its ends (the
// square falls along the front), the red band, the upper floor's windows, the frieze and the parapet with its cornice
// (the piers and the tiles along the whole front: buildCafeFront)
function cafeWall(B, p, F) {
  const K = H.cafe, g = GRID.modern, gf = p.line - g.storey, top = p.top;
  const foot = [0, F.len].map((s) => Math.min(gf - 0.3, groundHeight(...onWall(F, s, 0.5)) + 0.15));
  const low = Math.min(...foot), mid = F.len / 2, v = (y) => y - p.line + g.up - g.closed, colour = TINT[p.tint];
  B.quad('modern', at(F, 0, H.base), at(F, F.len, H.base), at(F, F.len, foot[1]), at(F, 0, foot[0]), [[-mid, v(H.base)], [mid, v(H.base)], [mid, v(foot[1])], [-mid, v(foot[0])]], { colour });
  B.quad('glass', at(F, 0, foot[0]), at(F, F.len, foot[1]), at(F, F.len, gf), at(F, 0, gf), [[0, foot[0] - low], [F.len, foot[1] - low], [F.len, gf - low], [0, gf - low]]);
  B.box('trim', F, 0, F.len, 0, 0.14, gf, gf + K.band, C.red);
  glass(B, F, gf + K.band, top - K.frieze);
  plaster(B, p, F, top - K.frieze, top + K.parapet, 0);
  B.box('trim', F, -0.02, F.len + 0.02, -0.25, 0.4, top + K.parapet - 0.2, top + K.parapet + 0.05, C.concrete);
}

// The café's front along each run of its walls: a square pier every few metres (from the ground to the frieze), the
// tiles of the frieze between them, putti and shields in turn; "CAFE" on the band. Returns the piers standing free on
// the square (for the colliders)
function buildCafeFront(B) {
  const K = H.cafe, piers = [];
  for (const p of H.parts.filter((q) => q.style === 'cafe')) {
    const top = p.top;
    for (const run of cafeRuns(p)) {
      for (const { F, s } of alongRun(run, K.pier)) {
        const [x, z] = onWall(F, s, K.pierOut / 2), y0 = groundHeight(x, z) - 0.3;
        B.box('trim', F, s - K.pierW / 2, s + K.pierW / 2, 0, K.pierOut, y0, top - K.frieze, C.concrete);
        // (a pier standing on a lower roof is no obstacle on the square)
        if (!partAt(x, z)) piers.push({ F, s, y0, y1: top - K.frieze });
      }
      alongRun(run, K.pier, true).forEach(({ F, s }, k) => {
        if (F.len < K.tile.w + 0.1) return;
        const s0 = Math.min(Math.max(0, s - K.tile.w / 2), F.len - K.tile.w), y = top - K.frieze + (K.frieze + K.parapet - 0.2) / 2;
        B.decal(F, s0, s0 + K.tile.w, 0.03, y - K.tile.h / 2, y + K.tile.h / 2, k % 2 ? 'arms' : 'putto');
      });
    }
  }
  const S = K.sign, F = wallFrame(S.a, S.b), gf = part('kurhaus').line - GRID.modern.storey;
  B.decal(F, (F.len - S.w) / 2, (F.len + S.w) / 2, 0.15, gf, gf + K.band, 'cafe');
  return piers;
}

// A rail round a roof's edge: two bars on posts every 2 m, 0.3 m in
function buildRail(B, R, top) {
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.3) continue;
    for (const y of [top + 0.5, top + 1.0]) B.box('trim', F, 0, F.len, -0.34, -0.28, y - 0.05, y, C.rail);
    const k = Math.max(1, Math.round(F.len / 2));
    for (let j = 0; j <= k; j++) { const s = (F.len * j) / k; B.box('trim', F, s - 0.03, s + 0.03, -0.34, -0.28, top, top + 1.0, C.rail); }
  }
}

// The residence's balconies: on its long walls facing south, a slab, a pale panel and a rail at every floor over the
// ground floor
function buildBalconies(B, p, R) {
  const Bc = H.balconies, g = GRID.modern;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.n[1] < Bc.facing || F.len < Bc.minLen) continue;
    const s0 = Bc.inset, s1 = F.len - Bc.inset, o = Bc.out, low = groundAlong(F) + 2.2;
    for (let y = p.line - g.storey; y > low; y -= g.storey) {
      B.box('trim', F, s0, s1, 0, o, y - 0.18, y, C.slab);
      B.box('trim', F, s0, s1, o - 0.06, o, y + Bc.rail - 0.06, y + Bc.rail, C.rail);
      B.box('trim', F, s0 + 0.03, s1 - 0.03, o - 0.05, o - 0.02, y + 0.08, y + Bc.rail - 0.1, C.panel);
      for (const s of [s0, s1]) B.box('trim', F, s - 0.04, s, 0, o, y, y + Bc.rail, C.rail);
    }
  }
}

/** A triangle of a roof, turned to face up */
function roofTri(B, a, b, c) {
  const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0;
  const t = up ? [a, b, c] : [a, c, b];
  B.tri('roof', t[0], t[1], t[2], t.map((q) => [q[0], q[2]]));
}

// The pyramid roof over the tower's square, from its cornice to the surveyed tip, a finial on it
function buildPyramid(B) {
  const T = part('tower'), tip = H.pyramid.tip, R = T.ring;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length];
    roofTri(B, [a[0], T.top, a[1]], [b[0], T.top, b[1]], tip);
  }
  const F = wallFrame(R[0], R[1]);
  const [ox, oz] = [tip[0] - R[0][0], tip[2] - R[0][1]];
  const s = ox * F.u[0] + oz * F.u[1], o = ox * F.n[0] + oz * F.n[1];
  B.box('trim', F, s - 0.06, s + 0.06, o - 0.06, o + 0.06, tip[1] - 0.3, tip[1] + 1.2, C.rail);
}

// The porch by the church: a box of grey stone over the highest ground under it, a cornice, an arch to the lane and one
// to the east, a step before each
function buildPorch(B) {
  const P = H.porch, R = outwardRing(P.ring);
  let low = Infinity, y0 = -Infinity;
  for (const [x, z] of R) { const y = groundHeight(x, z); low = Math.min(low, y); y0 = Math.max(y0, y); }
  y0 += 0.1;
  const top = y0 + P.height;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    B.quad('trim', at(F, 0, low - 1), at(F, F.len, low - 1), at(F, F.len, top), at(F, 0, top), undefined, { colour: C.stone });
    B.box('trim', F, -0.1, F.len + 0.1, 0, 0.18, top - 0.3, top + 0.05, C.cornice);
    B.box('trim', F, -0.05, F.len + 0.05, 0, 0.08, low - 1, y0 + 0.35, C.step);
    // (the arches: on the lane's side and the east side)
    if (F.n[1] < -0.8 || F.n[0] > 0.8) {
      const w = Math.min(2.4, F.len - 1.0), m = F.len / 2;
      B.decal(F, m - w / 2, m + w / 2, 0.09, y0, y0 + w * 1.25, 'arch');
      B.box('trim', F, m - w / 2, m + w / 2, 0, 0.9, low - 1, y0, C.step);
    }
  }
  flatRoof(B, R, top + 0.05, { bucket: 'trim', colour: C.coping });
}

/**
 * Builds the Hard Rock Hotel and the old Kurhaus complex into `scene`. Returns { group, colliders }: the café's piers
 * standing out on the square (the walls are the surveyed outlines', js/buildings.js), at world heights (baseY set, so
 * liftColliders leaves them be).
 */
export function buildHardRockHotel(scene) {
  const root = new THREE.Group();
  root.name = 'Hard Rock Hotel';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['old', 'modern'], name: 'Hard Rock Hotel' }), M = materials();
  for (const p of H.parts) buildPart(B, p);
  buildPyramid(B);
  buildPorch(B);
  const piers = buildCafeFront(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  const colliders = [];
  const K = H.cafe;
  for (const { F, s, y0, y1 } of piers) {
    const [cx, cz] = onWall(F, s, K.pierOut / 2), hx = K.pierW / 2, hz = K.pierOut / 2;
    const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } });
  }
  return { group: root, colliders };
}
