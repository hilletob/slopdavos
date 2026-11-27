import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, rectMask, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { SPAR_DORF, frontOn, gridOf, onWall, outwardRing, surveyedFootprints, wallCover, wallFrame, windowsFrom } from './spar-dorf-data.js';

export { SPAR_DORF };

// The Spar Davos Dorf rebuilt by hand (js/spar-dorf-data.js), standing in for its six swissBUILDINGS3D volumes, which
// the streamed tiles drew as white blocks with the town houses' windows: the red block on the corner of the
// Bahnhofstrasse. The corner house and the east house along the street, three tall floors: the shops' glazing under a
// deep canopy, a band of glass on each floor over it (drawn by the wall's material from its uv: metres along the wall
// from its middle, metres up the floors' grid); the porch at the corner with the board "SPAR" and the shops' names over
// its glazing; the board "SPAR" on the east house's closed front on the car park. The middle house behind them (the
// shop's hall, the north block, the stair tower, the west slab) with small windows; walls closed where the others
// stand against them, windows over their roofs. The grey coping round the flat roofs. Six meshes: the front houses'
// walls, the middle house's walls, the roofs, the glass, the trim (one vertex-coloured mesh) and the boards (one canvas
// atlas). The Spar's sign of js/shops.js gives way to the boards; the other shops' signs stay.

excludeBuildings(SPAR_DORF.exclude);
SHOP_EXCLUSIONS.add(SPAR_DORF.shop);
// (the player's walls on the surveyed volumes: the middle house's, not OSM's outline, which stood up to 1.1 m off them
// and left the west slab out; the corner house's with its porch. js/landmarks.js)
for (const [id, rings] of surveyedFootprints()) SURVEYED_FOOTPRINTS.set(id, rings);

// The walls' buckets and their grids: v of a wall is metres up the floors' grid, a floor's top at every multiple of the
// storey (the part's `line` at 40 of them); closed walls carry v − CLOSED
const BUCKET = { front: 'bands', back: 'punched' };
const UP = (g) => 40 * g.storey;
const CLOSED = (g) => 300 * g.storey;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const RED = [0.46, 0.036, 0.024], FRAME = [0.035, 0.037, 0.04], SILL = [0.3, 0.3, 0.3];
function materials() {
  const M = {};
  const Fg = SPAR_DORF.front, Bg = SPAR_DORF.back;
  M.roof = SIMPLE_SKINS.snowRoof([0.24, 0.24, 0.235], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.bands = SIMPLE_SKINS.windowed([0.2, 0.04, 0.035], Fg.storey, Fg.lo / Fg.storey, Fg.hi / Fg.storey, 0.6, 0.25);
    M.punched = SIMPLE_SKINS.windowed([0.38, 0.034, 0.024], Bg.storey, Bg.lo / Bg.storey, Bg.hi / Bg.storey, 0.9, 0.25);
    M.glass = SIMPLE_SKINS.glow([0.06, 0.075, 0.085], 0.1, 0.8, [1.0, 0.88, 0.7], 0.12);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(8, 28);
  const glow = nightGlow();
  const wall = (streak) => mix(vec3(...RED).mul(0.92), vec3(...RED).mul(1.06), worldNoise(0.25)).mul(float(1).sub(streak));
  const glassC = mix(vec3(0.03, 0.04, 0.05), vec3(0.11, 0.13, 0.15), worldNoise(0.06));
  // A wall's material: red plaster with the windows of grid `g`; `band`: the windows run on from bay to bay as one band
  // of glass between dark posts (the front houses), else each a window of its own in a dark frame (the middle house)
  const windowed = (g, band, seed) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const { half, bay, bu, storey, fv, open } = windowGrid({ bay: g.bay, storey: g.storey, closed: CLOSED(g), winHalf: g.half });
    const hw = band ? g.bay / 2 + 0.02 : g.half;
    const win = rectMask(bu, fv, hw, g.lo, g.hi).mul(open);
    const post = band ? smoothstep(g.bay / 2 - 0.07, g.bay / 2 - 0.05, abs(bu)).mul(near) : float(0);
    const pane = rectMask(bu, fv, band ? hw : g.half - 0.07, g.lo + 0.08, g.hi - 0.08).mul(float(1).sub(post)).mul(open);
    const sill = rectMask(bu, fv, hw + (band ? 0 : 0.06), g.lo - 0.1, g.lo).mul(open).mul(near);
    // a shade darker under the sills (the streaks fade with distance)
    const streak = rectMask(bu, fv, hw, g.lo - 0.9, g.lo - 0.1, 0.25).mul(open).mul(fine).mul(0.06);
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.3), float(0.95), step(0.85, id)));
    const blind = step(float(g.hi - 0.08).sub(drawn.mul(g.hi - g.lo - 0.16)), fv).mul(pane).mul(near);
    let c = mix(wall(streak), vec3(...SILL), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.42, 0.42, 0.4), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(mix(float(0.9), float(0.5), win), float(0.1), shiny);
    m.metalnessNode = shiny.mul(0.6);
    // (shops' offices and flats: some lit in the evening, few towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), seed, { share: 0.35, late: 0.08, tone: twoTones([0.95, 0.93, 0.86], [1.0, 0.76, 0.46], 0.45) })
      .mul(pane).mul(mix(float(1), float(0.45), blind)).mul(glow.mul(1.05));
    return m;
  };
  M.bands = windowed(SPAR_DORF.front, true, 47);
  M.punched = windowed(SPAR_DORF.back, false, 53);
  // The shops' glazing: dark posts every 1.5 m, a transom 2.6 m up; at night the shops are shut: a faint glow behind
  // most panes, the lights of the shop windows behind a few
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.5)).sub(0.5));
    const frame = smoothstep(0.46, 0.475, mu).max(smoothstep(0.045, 0.025, abs(V.sub(2.6)))).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.5)).mul(13.1).add(step(2.6, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.045, 0.06, 0.07), vec3(0.13, 0.15, 0.16), paneId), vec3(...FRAME), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.3), frame);
    m.emissiveNode = vec3(1.0, 0.9, 0.74).mul(float(1).sub(frame)).mul(mix(float(0.03), float(0.3), step(0.75, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The boards: one canvas atlas --------------------------------------------------------------------------------------
const ATLAS_SIZE = [512, 256];
export const ATLAS = {
  spar: [0, 0, 512, 144], // the name on the east house's front on the car park (4.6 × 1.45 m)
  names: [0, 148, 512, 108] // the name and the shops' over the porch at the corner (6.2 × 2.1 m, drawn 512 × 108: stretched)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('spar', (w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2001a'; g.fillRect(0, 0, w, 64);
    g.fillStyle = '#ffffff'; g.font = '900 54px Helvetica, Arial, sans-serif'; g.fillText('SPAR', w / 2, 34, w - 60);
    g.fillStyle = '#33393f'; g.font = 'bold 26px Helvetica, Arial, sans-serif';
    g.fillText('Amavita  ·  Pet\'s Shop  ·  topclean', w / 2, 92, w - 30);
    g.fillText('Dörfji', w / 2, 124, w - 30);
  });
  cell('names', (w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2001a'; g.fillRect(0, 0, w, 54);
    g.fillStyle = '#ffffff'; g.font = '900 46px Helvetica, Arial, sans-serif'; g.fillText('SPAR', w / 2, 29, w - 60);
    g.fillStyle = '#33393f'; g.font = 'bold 24px Helvetica, Arial, sans-serif';
    g.fillText('Pet\'s Shop  ·  Dörfji  ·  Amavita', w / 2, 82, w - 30);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  coping: [0.3, 0.3, 0.3], fascia: [0.04, 0.042, 0.045], plinth: [0.22, 0.22, 0.21], frame: FRAME,
  door: [0.06, 0.07, 0.075], board: [0.8, 0.8, 0.8], canopy: [0.33, 0.34, 0.35]
};

// A piece of a part's wall from s0 to s1 along it and y0 to y1: windowed (its bays laid out from the wall's middle) or
// closed, into the bucket of the part's grid
function plaster(B, F, p, y0, y1, windows, s0 = 0, s1 = F.len) {
  if (y1 - y0 < 0.01 || s1 - s0 < 0.01) return;
  const g = gridOf(p), line = p.line ?? p.top;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const mid = F.len / 2, open = windows && F.len >= 2.4;
  const v = (y) => y - line + UP(g) - (open ? 0 : CLOSED(g));
  B.quad(BUCKET[p.grid || 'back'], P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half: open ? mid : 0 });
}
// A pane of the shops' glazing from s0 to s1, y0 to y1 (uv: metres along the wall, metres up from its foot)
function glass(B, F, s0, s1, y0, y1) {
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  B.quad('glass', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[s0, 0], [s1, 0], [s1, y1 - y0], [s0, y1 - y0]]);
}
// The ground along a wall from s0 to s1, half a metre out of it: its lowest and highest
function groundAlong(F, s0 = 0, s1 = F.len) {
  let lo = Infinity, hi = -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 0.5));
  for (let i = 0; i <= n; i++) {
    const y = groundHeight(...onWall(F, s0 + (s1 - s0) * i / n, 0.5));
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return { lo, hi };
}

// The ground floor of a free wall up to `top`: closed plaster, the front's glazing where it has some (over a closed
// plinth up to the highest ground along it), its frame and the fascia over it; the concrete plinth along the foot
function groundFloor(B, F, p, f, top) {
  let at = 0;
  for (const sp of (f && f.glazing) || []) {
    plaster(B, F, p, SPAR_DORF.base, top, false, at, sp.s0);
    const foot = groundAlong(F, sp.s0, sp.s1).hi + 0.15;
    plaster(B, F, p, SPAR_DORF.base, foot, false, sp.s0, sp.s1);
    glass(B, F, sp.s0, sp.s1, foot, f.top);
    plaster(B, F, p, f.top, top, false, sp.s0, sp.s1);
    for (const s of [sp.s0, sp.s1]) B.box('trim', F, s - 0.08, s + 0.08, 0, 0.1, foot, f.top, C.frame);
    B.box('trim', F, sp.s0 - 0.08, sp.s1 + 0.08, 0, 0.1, foot - 0.08, foot, C.frame);
    B.box('trim', F, sp.s0 - 0.2, sp.s1 + 0.2, 0, 0.16, f.top, Math.min(top - 0.05, f.top + 0.6), C.fascia);
    at = sp.s1;
  }
  plaster(B, F, p, SPAR_DORF.base, top, false, at, F.len);
  const { lo, hi } = groundAlong(F);
  B.box('trim', F, -0.04, F.len + 0.04, 0, 0.05, lo - 0.6, Math.min(hi + 0.35, lo + 1.2), C.plinth);
}

// The floors from y0 to the part's line: windowed, closed on the front's `clear` stretch
function floors(B, F, p, y0, f) {
  const c = f && f.clear;
  if (!c) { plaster(B, F, p, y0, p.line, true); return; }
  plaster(B, F, p, y0, p.line, true, 0, c[0]);
  plaster(B, F, p, y0, p.line, false, c[0], Math.min(c[1], F.len));
  plaster(B, F, p, y0, p.line, true, Math.min(c[1], F.len), F.len);
}

// A front's doors (glass doors' frames in the glazing, or a solid leaf in its frame with a step), canopy and board
function frontDetails(B, F, f) {
  for (const D of f.doors || []) {
    const sp = (f.glazing || []).find((g) => D.s > g.s0 && D.s < g.s1);
    const foot = groundAlong(F, ...(sp ? [sp.s0, sp.s1] : [D.s - D.w / 2, D.s + D.w / 2])).hi + (sp ? 0.15 : 0.12);
    if (D.solid) {
      B.box('trim', F, D.s - D.w / 2 - 0.12, D.s + D.w / 2 + 0.12, 0, 0.07, foot, foot + D.h + 0.12, C.frame);
      B.box('trim', F, D.s - D.w / 2, D.s + D.w / 2, 0.07, 0.09, foot, foot + D.h, C.door);
      B.box('trim', F, D.s - D.w / 2 - 0.3, D.s + D.w / 2 + 0.3, 0, 0.6, foot - 0.4, foot, C.plinth);
    } else {
      for (const s of [D.s - D.w / 2, D.s, D.s + D.w / 2]) B.box('trim', F, s - 0.05, s + 0.05, 0.1, 0.16, foot, foot + D.h, C.frame);
      B.box('trim', F, D.s - D.w / 2 - 0.05, D.s + D.w / 2 + 0.05, 0.1, 0.16, foot + D.h - 0.1, foot + D.h, C.frame);
    }
  }
  const K = f.canopy;
  if (K) {
    // (over a solid door: its height over the door's step)
    const y = f.doors && f.doors[0].solid ? groundAlong(F, K.s0, K.s1).hi + 0.12 + K.y : K.y;
    B.box('trim', F, K.s0, K.s1, 0, K.out, y, y + K.thick, C.canopy, { top: 'roof' });
  }
  const Bd = f.board;
  if (Bd) {
    B.box('trim', F, Bd.s - Bd.w / 2 - 0.06, Bd.s + Bd.w / 2 + 0.06, 0, 0.1, Bd.y0 - 0.06, Bd.y1 + 0.06, C.board);
    B.decal(F, Bd.s - Bd.w / 2, Bd.s + Bd.w / 2, 0.11, Bd.y0, Bd.y1, Bd.key);
  }
}

// A volume: its walls from the base up to its roof (closed where the others stand against them, the floors' windows
// over their roofs; on a free wall the ground floor with the front's glazing and the floors over it), the parapet, the
// coping round its roof, the roof
function buildPart(B, p) {
  const ring = outwardRing(p.ring), g = gridOf(p);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const cover = wallCover(p, a, b), f = frontOn(a, b), top = p.from ?? p.top;
    if (cover === -Infinity) groundFloor(B, F, p, f, top);
    else plaster(B, F, p, SPAR_DORF.base, top, false);
    if (p.from !== undefined) {
      let from = windowsFrom(p, cover);
      // where the ground rises along a wall, the windows begin over its highest point
      if (from !== null && cover === -Infinity) {
        const hi = groundAlong(F).hi + 0.25;
        while (from !== null && hi > from + g.lo) from = from + g.storey < p.line - 0.01 ? from + g.storey : null;
      }
      if (from === null) plaster(B, F, p, p.from, p.top, false);
      else {
        plaster(B, F, p, p.from, from, false);
        floors(B, F, p, from, f);
        plaster(B, F, p, p.line, p.top, false);
      }
    }
    if (f && cover === -Infinity) frontDetails(B, F, f);
    B.box('trim', F, -0.05, F.len + 0.05, -0.3, 0.06, p.top - 0.12, p.top + 0.14, C.coping);
  }
  flatRoof(B, ring, p.top);
}

/**
 * Builds the Spar Davos Dorf into `scene`. Returns { group, colliders }: none of its own (its walls are the surveyed
 * outlines registered above and the east house's OSM outline; nothing stands free of them), at world heights.
 */
export function buildSparDorf(scene) {
  const root = new THREE.Group();
  root.name = 'Spar Davos Dorf';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['bands', 'punched'], name: 'Spar Davos Dorf' }), M = materials();
  for (const p of SPAR_DORF.parts) buildPart(B, p);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
