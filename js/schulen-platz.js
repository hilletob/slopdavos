import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { SCHULEN, groundOutlines, onWall, outwardRing, wallFrame, windowsFrom } from './schulen-platz-data.js';

export { SCHULEN };

// The school buildings of Davos Platz rebuilt by hand (js/schulen-platz-data.js), standing in for their
// swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows: the
// Oberstufenschulhaus in brown exposed-aggregate concrete with ribbon windows and a clerestory over its middle, the
// building between in cream plaster with punched windows, rubble stone on its ends and plinth, its white stair towers
// with glass-block windows and the granite-grey bicycle shelter on the lane, the Primarschule in grey-brown concrete
// with window bands, every other bay closed by brown louvres; the glazed stair hall in red frames between the last two
// and its portico on the playground. Seven meshes for all of it: three walls (one per school, the windows drawn by the
// wall's material from its uv: metres along the wall from its middle, metres up the floors' grid), the roofs, the glass,
// the trim (one vertex-coloured mesh) and the decals (one canvas atlas). At night a school is mostly dark: a window lit
// here and there, the stair hall's lights on.

excludeBuildings(SCHULEN.excludes);
// (the player's walls on the surveyed volumes, not on OSM's outlines: js/landmarks.js; the stair hall keeps OSM's)
for (const s of SCHULEN.schools) SURVEYED_FOOTPRINTS.set(s.osm, groundOutlines(s.osm));

// The windows of each school's wall (m): the bay along the wall, the window's foot and head over its floor's foot, its
// half width (punched windows) or the band's (ribbons)
const SKIN = {
  oss: { storey: 3.6, bay: 1.3, lo: 0.95, hi: 2.55, half: 0.66, mean: [0.24, 0.2, 0.165] },
  mid: { storey: 3.4, bay: 2.6, lo: 0.95, hi: 2.35, half: 0.6, mean: [0.5, 0.46, 0.36] },
  prim: { storey: 3.45, bay: 1.45, lo: 0.85, hi: 2.7, half: 0.73, mean: [0.21, 0.185, 0.155] }
};
// v of a wall: metres up the floors' grid, a floor's top at every multiple of the storey (the part's `line` at 40 of
// them); closed walls carry v − CLOSED, the rubble stone v − 2 CLOSED
const up = (k) => 40 * SKIN[k].storey;
const closed = (k) => 300 * SKIN[k].storey;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const GLOW_TONE = twoTones([1.0, 0.86, 0.66], [0.86, 0.92, 1.0], 0.55);
const GLASS = [0.03, 0.04, 0.045];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.27, 0.26, 0.24], 0.95);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a faint band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    for (const k of Object.keys(SKIN)) {
      const S = SKIN[k];
      M[k] = SIMPLE_SKINS.windowed(S.mean, S.storey, S.lo / S.storey, S.hi / S.storey, 0.9, 0.1);
    }
    M.glass = SIMPLE_SKINS.glow([0.08, 0.1, 0.11], 0.15, 0.6, [1.0, 0.86, 0.66], 0.3);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(60, 220), fine = fade(10, 30);
  const glow = nightGlow();
  // the panes' glass and the lights behind (a school: few lit, fewer towards midnight); a blind drawn in some
  const glassOf = (bay, storey, half, seed) => {
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)).add(seed));
    const tone = mix(vec3(0.02, 0.026, 0.03), vec3(0.07, 0.085, 0.095), worldNoise(0.07));
    const lit = litWindow(bay, storey.add(half.mul(3.3)), seed, { share: 0.07, late: 0.02, tone: GLOW_TONE });
    return { id, tone, lit };
  };
  // The Oberstufenschulhaus: brown exposed-aggregate concrete, a ribbon window per floor with a dark post every bay
  {
    const S = SKIN.oss, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: S.bay, storey: S.storey, closed: closed('oss'), winHalf: S.half });
    const band = rect(S.half, S.lo, S.hi).mul(open);
    const post = smoothstep(S.bay / 2 - 0.07, S.bay / 2 - 0.045, abs(bu)).mul(near);
    const pane = rect(S.half, S.lo + 0.07, S.hi - 0.07).mul(float(1).sub(post)).mul(open);
    const grain = worldNoise(2.3), speck = step(0.7, worldNoise(17)).mul(fine).mul(0.1);
    const wall = mix(vec3(0.2, 0.165, 0.135), vec3(0.28, 0.235, 0.19), grain).mul(float(1).sub(speck))
      .mul(float(1).sub(rect(S.half + 0.1, S.lo - 0.35, S.lo - 0.02, 0.05).mul(open).mul(0.1))); // (the band's sill)
    const { id, tone, lit } = glassOf(bay, storey, half, 21);
    const blind = step(float(S.hi - 0.07).sub(step(0.62, id).mul(0.9)), fv).mul(pane).mul(near);
    let c = mix(wall, vec3(0.03, 0.028, 0.025), band);
    c = mix(c, tone, pane);
    c = mix(c, vec3(0.42, 0.4, 0.36), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    m.emissiveNode = lit.mul(pane).mul(glow.mul(1.1));
    M.oss = m;
  }
  // The building between: cream plaster, a window in a dark brown frame per bay and floor; rubble stone on its plinth
  // and its ends
  {
    const S = SKIN.mid, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: S.bay, storey: S.storey, closed: closed('mid'), winHalf: S.half });
    const win = rect(S.half, S.lo, S.hi).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu)).mul(near);
    const pane = rect(S.half - 0.08, S.lo + 0.08, S.hi - 0.08).mul(float(1).sub(bars)).mul(open);
    const sill = rect(S.half + 0.07, S.lo - 0.08, S.lo).mul(open).mul(near);
    const plaster = mix(vec3(0.46, 0.42, 0.32), vec3(0.56, 0.52, 0.4), worldNoise(0.35));
    // the rubble stone: courses of 0.32 m, stones of 0.3–0.8 m staggered by course, a stone's tone of its own
    const stoneMask = step(V, -1.5 * closed('mid'));
    const sv = V.add(worldNoise(1.1).mul(0.12)), course = floor(sv.div(0.32));
    const su = U.add(hash(course.mul(7.1)).mul(3)).div(mix(float(0.45), float(0.75), hash(course.mul(3.3))));
    const stoneId = hash(floor(su).mul(17.3).add(course.mul(5.9)));
    const joint = smoothstep(0.38, 0.47, abs(fract(sv.div(0.32)).sub(0.5))).max(smoothstep(0.4, 0.48, abs(fract(su).sub(0.5)))).mul(fine);
    const stone = mix(mix(vec3(0.17, 0.16, 0.14), vec3(0.32, 0.3, 0.26), stoneId), vec3(0.4, 0.39, 0.36), joint.mul(0.8));
    const { id, tone, lit } = glassOf(bay, storey, half, 33);
    const blind = step(float(S.hi - 0.08).sub(step(0.6, id).mul(0.8)), fv).mul(pane).mul(near);
    let c = mix(plaster, vec3(0.52, 0.5, 0.45), sill);
    c = mix(c, vec3(0.09, 0.055, 0.035), win);
    c = mix(c, tone, pane);
    c = mix(c, vec3(0.5, 0.47, 0.4), blind);
    c = mix(c, stone, stoneMask);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    m.emissiveNode = lit.mul(pane).mul(glow.mul(1.1));
    M.mid = m;
  }
  // The Primarschule: grey-brown concrete, a band of windows per floor, every other bay closed by dark brown louvres
  {
    const S = SKIN.prim, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, open, rect } = windowGrid({ bay: S.bay, storey: S.storey, closed: closed('prim'), winHalf: S.half });
    const band = rect(S.half, S.lo, S.hi).mul(open);
    const post = smoothstep(S.bay / 2 - 0.06, S.bay / 2 - 0.035, abs(bu)).mul(near);
    const inner = rect(S.half, S.lo + 0.06, S.hi - 0.06).mul(float(1).sub(post)).mul(open);
    // (the louvres: every other bay, a few more and fewer; their slats upright)
    const odd = step(0.25, fract(bay.mul(0.5)));
    const flip = step(0.86, hash(bay.mul(5.3).add(storey.mul(11.7)).add(half.mul(2.9))));
    const louvre = abs(odd.sub(flip)).mul(inner);
    const slat = smoothstep(0.3, 0.45, abs(fract(bu.div(0.11)).sub(0.5))).mul(fine);
    const pane = inner.mul(float(1).sub(louvre));
    const grain = worldNoise(2.0), speck = step(0.72, worldNoise(15)).mul(fine).mul(0.1);
    const wall = mix(vec3(0.18, 0.16, 0.135), vec3(0.25, 0.22, 0.185), grain).mul(float(1).sub(speck));
    const { tone, lit } = glassOf(bay, storey, half, 47);
    let c = mix(wall, vec3(0.04, 0.03, 0.022), band);
    c = mix(c, tone, pane);
    c = mix(c, mix(vec3(0.075, 0.038, 0.02), vec3(0.04, 0.02, 0.012), slat), louvre);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.92), float(0.12), pane).sub(louvre.mul(0.25));
    m.metalnessNode = pane.mul(0.5);
    m.emissiveNode = lit.mul(pane).mul(glow.mul(1.1));
    M.prim = m;
  }
  // The glass of the stair hall and the clerestory (their frames are trim): panes of 1.25 × 1.6 m in two tones, the
  // hall's lights on at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.7 });
    const paneId = hash(floor(U.div(1.25)).mul(13.1).add(floor(V.div(1.6)).mul(7.3)));
    m.colorNode = mix(vec3(...GLASS), vec3(0.1, 0.12, 0.13), paneId.mul(0.6).add(worldNoise(0.1).mul(0.4)));
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(paneId.mul(0.4).add(0.6)).mul(glow.mul(0.3));
    M.glass = m;
  }
  return M;
}

// --- The name, the poster in the stair hall and the glass blocks: one canvas atlas -------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  name: [0, 0, 1024, 48], // on the portico's beam (7.2 × 0.34 m)
  poster: [0, 56, 256, 360], // in the stair hall's glazing on the lane (1.5 × 2.1 m)
  glassblock: [272, 56, 192, 256] // a stair tower's window of glass blocks (1.2 × 1.6 m)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('name', (w, h) => {
    g.fillStyle = '#f2efe8'; g.font = `bold ${Math.round(h * 0.72)}px Helvetica, Arial, sans-serif`;
    g.fillText('SCHULHAUS DAVOS PLATZ', w / 2, h * 0.54, w - 24);
  });
  // (a children's poster, drawn freely: coloured squares, a sun, a house, a tree)
  cell('poster', (w, h) => {
    g.fillStyle = '#f4f1e6'; g.fillRect(0, 0, w, h);
    const colours = ['#e8442e', '#f2b51c', '#3f8fd4', '#4bab4f', '#9a4fc0', '#ef7fb0'];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = colours[(i * 3 + j * 5) % 6];
      g.fillRect(16 + j * 58, 190 + i * 26, 46, 20);
    }
    g.fillStyle = '#f2b51c'; g.beginPath(); g.arc(w * 0.75, 52, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8442e'; g.beginPath(); g.moveTo(30, 110); g.lineTo(90, 60); g.lineTo(150, 110); g.closePath(); g.fill();
    g.fillStyle = '#3f8fd4'; g.fillRect(42, 110, 96, 62);
    g.fillStyle = '#4bab4f'; g.beginPath(); g.arc(200, 120, 28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a4a24'; g.fillRect(194, 140, 12, 32);
    g.strokeStyle = '#2b2b2b'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
  cell('glassblock', (w, h) => {
    g.fillStyle = '#b9b8b1'; g.fillRect(0, 0, w, h);
    const n = 6, m = 8, cw = (w - 12) / n, ch = (h - 12) / m;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const x = 6 + i * cw, y = 6 + j * ch;
      const grd = g.createLinearGradient(x, y, x + cw, y + ch);
      grd.addColorStop(0, '#9fb3b8'); grd.addColorStop(1, '#6f8389');
      g.fillStyle = grd; g.fillRect(x + 2, y + 2, cw - 4, ch - 4);
    }
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  coping: [0.3, 0.29, 0.27], white: [0.6, 0.6, 0.575], red: [0.3, 0.025, 0.02], dark: [0.04, 0.038, 0.035], granite: [0.13, 0.13, 0.125],
  post: [0.46, 0.43, 0.38], slab: [0.42, 0.41, 0.39], plinth: [0.22, 0.21, 0.2], aerial: [0.5, 0.5, 0.5], door: [0.05, 0.05, 0.055]
};

/** A wall's corner in the world: s along it, y up */
const at = (F, s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };

/** The highest (or lowest) ground along a wall, half a metre before it, from s0 to s1 */
export function groundAlong(F, { s0 = 0, s1 = F.len, low = false, out = 0.5 } = {}) {
  let y = low ? Infinity : -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.5));
  for (let i = 0; i <= n; i++) {
    const g = groundHeight(...onWall(F, s0 + (s1 - s0) * i / n, out));
    y = low ? Math.min(y, g) : Math.max(y, g);
  }
  return y;
}

/** A school's wall from y0 to y1 on a part's grid: `kind` 'win' (windows), 'plain' (closed) or 'stone' (rubble) */
function wall(B, skin, line, F, y0, y1, kind) {
  if (y1 - y0 < 0.01) return;
  const mid = F.len / 2, off = kind === 'win' ? 0 : kind === 'plain' ? closed(skin) : 2 * closed(skin);
  const v = (y) => y - line + up(skin) - off;
  B.quad(skin, at(F, 0, y0), at(F, F.len, y0), at(F, F.len, y1), at(F, 0, y1), [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half: kind === 'win' ? mid : 0 });
}

/** A strip of glass from y0 to y1 (uv: metres along the wall, up from its foot), its frames (`step` apart, a transom) */
function glazing(B, F, y0, y1, frame, { step = 1.25, transom = null } = {}) {
  if (y1 - y0 < 0.3) return;
  B.quad('glass', at(F, 0, y0), at(F, F.len, y0), at(F, F.len, y1), at(F, 0, y1), [[0, 0], [F.len, 0], [F.len, y1 - y0], [0, y1 - y0]]);
  const n = Math.max(1, Math.round(F.len / step));
  for (let i = 0; i <= n; i++) {
    const s = F.len * i / n;
    B.box('trim', F, Math.max(0, s - 0.045), Math.min(F.len, s + 0.045), 0, 0.1, y0, y1, frame);
  }
  for (const y of [y0, y1 - 0.08, ...(transom !== null && y0 + transom < y1 - 0.5 ? [y0 + transom] : [])]) B.box('trim', F, 0, F.len, 0, 0.1, y, y + 0.08, frame);
}

/** The glass-block windows of a stair tower's face on the lane: one a floor over the ground, on the school's grid */
export function glassBlocks(F, line, storey, top, ground) {
  const out = [];
  for (let foot = line - storey; foot > ground - storey; foot -= storey) {
    const y0 = foot + 0.9, y1 = y0 + 1.6;
    if (y0 > ground + 0.4 && y1 < top - 0.5) out.push({ s0: F.len / 2 - 0.6, s1: F.len / 2 + 0.6, y0, y1 });
  }
  return out;
}

// A school's volume: its walls from the base (or its foot) up to its roof, cut into a closed plinth under the windows
// over the highest ground along each wall, the floors with windows and the parapet; the coping, the roof
function buildPart(B, school, p) {
  const ring = outwardRing(p.ring), skin = school.skin, S = SKIN[skin], y0 = p.foot ?? SCHULEN.base, top = p.top;
  const line = p.line ?? top;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    if (p.tower) {
      // (a stair tower in white plaster; glass blocks on its face on the lane)
      B.quad('trim', at(F, 0, y0), at(F, F.len, y0), at(F, F.len, top), at(F, 0, top), undefined, { colour: C.white });
      if (F.n[0] < -0.7) for (const w of glassBlocks(F, school.parts[0].line, S.storey, top, groundAlong(F))) B.decal(F, w.s0, w.s1, 0.04, w.y0, w.y1, 'glassblock');
    } else if (p.clerestory) {
      wall(B, skin, line, F, y0, y0 + 0.45, 'plain');
      glazing(B, F, y0 + 0.45, top - 0.4, C.dark, { step: 1.3 });
      wall(B, skin, line, F, top - 0.4, top, 'plain');
    } else if (p.windows === false || F.len < (p.minWindowed ?? 2.4)) {
      wall(B, skin, line, F, y0, top, skin === 'mid' ? 'stone' : 'plain');
    } else {
      const from = windowsFrom(p.line, S.storey, groundAlong(F) + 0.25, S.lo);
      wall(B, skin, line, F, y0, from, skin === 'mid' ? 'stone' : 'plain');
      wall(B, skin, line, F, from, p.line, 'win');
      wall(B, skin, line, F, p.line, top, 'plain');
    }
    B.box('trim', F, -0.05, F.len + 0.05, -0.28, 0.06, top - 0.14, top + 0.1, p.tower ? C.white : C.coping);
  }
  flatRoof(B, ring, top);
}

// The stair hall: glazing in red frames from the highest ground along each free front up to its roof, a plinth under
// it, the poster in the west front, the doors in the east one; its roof
function buildHall(B) {
  const H = SCHULEN.hall;
  const fronts = [H.west, H.east, { a: H.ring[3], b: H.ring[2] }];
  let east = null;
  for (const f of fronts) {
    const F = wallFrame(f.a, f.b), foot = groundAlong(F, { out: 0.3 }) + 0.05, low = groundAlong(F, { low: true, out: 0.3 });
    B.box('trim', F, 0, F.len, -0.05, 0.12, low - 1.2, foot, C.plinth);
    glazing(B, F, foot, H.top - 0.5, C.red, { step: H.mullion, transom: H.transom });
    B.box('trim', F, -0.05, F.len + 0.05, -0.05, 0.14, H.top - 0.5, H.top + 0.12, C.red);
    if (f === H.west) B.decal(F, H.poster.s, H.poster.s + H.poster.w, 0.12, foot + H.poster.y0, foot + H.poster.y1, 'poster');
    if (f === H.east) {
      east = { F, foot };
      const D = H.door;
      B.box('trim', F, D.s - D.w / 2 - 0.1, D.s + D.w / 2 + 0.1, 0.1, 0.16, foot, foot + D.h + 0.1, C.red);
      B.box('trim', F, D.s - D.w / 2, D.s - 0.03, 0.16, 0.18, foot + 0.05, foot + D.h, C.door);
      B.box('trim', F, D.s + 0.03, D.s + D.w / 2, 0.16, 0.18, foot + 0.05, foot + D.h, C.door);
    }
  }
  flatRoof(B, outwardRing(H.ring), H.top);
  return east;
}

// The portico before the stair hall on the playground: square posts, a red beam with the name, a flat roof. Returns its
// posts (for the colliders)
function buildPortico(B, east) {
  const P = SCHULEN.portico, F = east.F;
  let hi = east.foot;
  for (const s of P.posts) hi = Math.max(hi, groundHeight(...onWall(F, s, P.postOut)));
  const roof = hi + P.height, posts = [];
  for (const s of P.posts) {
    const g = groundHeight(...onWall(F, s, P.postOut)), h = P.post / 2;
    B.box('trim', F, s - h, s + h, P.postOut - h, P.postOut + h, g - 0.5, roof - P.beam, C.post);
    posts.push({ F, s, o: P.postOut, y0: g, y1: roof });
  }
  B.box('trim', F, P.from, P.to, P.postOut - 0.25, P.postOut + 0.25, roof - P.beam, roof, C.red);
  B.box('trim', F, P.from, P.to, 0, P.out, roof, roof + P.slab, C.slab, { top: 'roof' });
  const mid = (P.from + P.to) / 2, N = P.name;
  B.decal(F, mid - N.w / 2, mid + N.w / 2, P.postOut + 0.27, roof - P.beam / 2 - N.h / 2, roof - P.beam / 2 + N.h / 2, 'name');
  return posts;
}

// The bicycle shelter on the lane: its closed north side, posts on the lane, a flat roof. Returns its colliders' boxes
function buildShelter(B) {
  const S = SCHULEN.shelter, F = wallFrame(S.wall.a, S.wall.b);
  const ground = groundAlong(F, { s0: S.s0, s1: S.s1, out: S.out / 2 }), low = groundAlong(F, { s0: S.s0, s1: S.s1, out: S.out, low: true });
  const roof = ground + S.height, boxes = [];
  B.box('trim', F, S.s0 - 0.25, S.s0, 0, S.out, low - 0.8, roof, C.granite);
  boxes.push({ F, s0: S.s0 - 0.25, s1: S.s0, o0: 0, o1: S.out, y0: low, y1: roof });
  for (const s of S.posts) {
    const h = S.post / 2;
    B.box('trim', F, s - h, s + h, S.out - 0.2 - h, S.out - 0.2 + h, low - 0.5, roof, C.granite);
    boxes.push({ F, s0: s - h, s1: s + h, o0: S.out - 0.2 - h, o1: S.out - 0.2 + h, y0: low, y1: roof });
  }
  B.box('trim', F, S.s0 - 0.25, S.s1, 0, S.out + 0.15, roof, roof + 0.3, C.granite, { top: 'roof' });
  return boxes;
}

// The aerials on the north stair tower's roof
function buildAerials(B) {
  const t = SCHULEN.schools[1].parts.find((p) => p.id === 'mid-tower-n'), F = wallFrame(t.ring[0], t.ring[1]);
  for (const [s, o, h] of SCHULEN.aerials) B.box('trim', F, s - 0.03, s + 0.03, -o - 0.03, -o + 0.03, t.top, t.top + h, C.aerial);
}

/** A thin oriented box collider in a wall's frame (s along it, o out of it), at world heights */
function collider({ F, s0, s1, o0, o1, y0, y1 }) {
  const [cx, cz] = onWall(F, (s0 + s1) / 2, (o0 + o1) / 2), hx = (s1 - s0) / 2, hz = (o1 - o0) / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } };
}

/**
 * Builds the three schools, the stair hall, its portico and the shelter into `scene`. Returns { group, colliders }:
 * the portico's posts and the shelter's posts and closed side (the walls are the surveyed outlines', js/buildings.js;
 * the stair hall's are OSM's), at world heights.
 */
export function buildSchulenPlatz(scene) {
  const root = new THREE.Group();
  root.name = 'Schulen Platz';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: Object.keys(SKIN), name: 'Schulen Platz' }), M = materials();
  for (const s of SCHULEN.schools) for (const p of s.parts) buildPart(B, s, p);
  const east = buildHall(B);
  const posts = buildPortico(B, east);
  const shelter = buildShelter(B);
  buildAerials(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  const colliders = [
    ...posts.map(({ F, s, o, y0, y1 }) => collider({ F, s0: s - SCHULEN.portico.post / 2, s1: s + SCHULEN.portico.post / 2, o0: o - SCHULEN.portico.post / 2, o1: o + SCHULEN.portico.post / 2, y0, y1 })),
    ...shelter.map(collider)
  ];
  return { group: root, colliders };
}
