import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, fade, flatRoof, litWindow, nightGlow, rectMask, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { OSM_IDS, SCHULE_BUENDA, canopyRing, coverRuns, groundOutlines, newOpenings, onWall, outwardRing, partById, wallFrame, windowsFrom } from './schule-buenda-data.js';

export { SCHULE_BUENDA };

// The Schulhaus Bünda in Davos Dorf rebuilt by hand (js/schule-buenda-data.js), standing in for its swissBUILDINGS3D
// volumes, which the streamed tiles drew as white blocks with the town houses' windows: the new building of 2021 in
// off-white panels with fine joints, its window groups in deep reveals and dark frames, its ground floor and its wing on
// the courtyard glazed in light timber frames; the link and the entrance hall glazed on both sides; the old school white
// with window ribbons and solar panels on its roof; the sports hall in grey ribbed metal with dark glazing bands; the
// kindergarten in the old school's skin; two timber canopies on slender posts. Six meshes for all of it: three walls (the
// new building's panels, the old school's plaster with its windows drawn by the material from uv: metres along the wall
// from its middle, metres up the floors' grid; the hall's metal), the roofs, the glass and the trim (one vertex-coloured
// mesh). At night a school is mostly dark: a pane lit here and there.

excludeBuildings(SCHULE_BUENDA.excludes);
// (the player's walls on the surveyed volumes, not on OSM's outlines: js/landmarks.js)
for (const id of OSM_IDS) SURVEYED_FOOTPRINTS.set(id, groundOutlines(id));

// The old school's windows (m): the bay along the wall, the ribbon's foot and head over its floor's foot, the ribbon's
// half width in a bay
const ALT = { storey: 3.6, bay: 1.3, lo: 0.95, hi: 2.35, half: 0.65, mean: [0.5, 0.5, 0.48] };
// v of an old school's wall: metres up the floors' grid, a floor's top at every multiple of the storey (the part's
// `line` at 40 of them); closed walls carry v − CLOSED
const UP = 40 * ALT.storey, CLOSED = 300 * ALT.storey;
// The sports hall's glazing bands (m over its foot) and its concrete base
const HALL = { bands: [[3.0, 5.0], [10.4, 12.4]], base: 1.1, mullion: 2.4 };
const N = SCHULE_BUENDA.neu, O = SCHULE_BUENDA.open;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const GLOW_TONE = twoTones([1.0, 0.86, 0.66], [0.86, 0.92, 1.0], 0.55);
const PANEL = [0.58, 0.575, 0.55], METAL = [0.25, 0.255, 0.26];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.27, 0.265, 0.25], 0.95);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: plain colours, a band per floor of the old school and the hall's high band at night,
    // js/landmark-buildings.js SIMPLE_SKINS)
    M.neu = SIMPLE_SKINS.plain(PANEL, 0.8);
    M.alt = SIMPLE_SKINS.windowed(ALT.mean, ALT.storey, ALT.lo / ALT.storey, ALT.hi / ALT.storey, 0.9, 0.1);
    M.halle = SIMPLE_SKINS.windowed(METAL, 100, HALL.bands[1][0] / 100, HALL.bands[1][1] / 100, 0.6, 0.08);
    M.glass = SIMPLE_SKINS.glow([0.05, 0.06, 0.07], 0.15, 0.5, [1.0, 0.86, 0.66], 0.12);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(60, 220), fine = fade(8, 28);
  const glow = nightGlow();
  // The new building: smooth off-white panels of 1.25 m with fine joints, a joint at every half floor
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
    const vj = smoothstep(0.012, 0.004, abs(fract(U.div(1.25).add(0.5)).sub(0.5)).mul(1.25));
    const hj = smoothstep(0.012, 0.004, abs(fract(V.div(N.storey / 2).add(0.5)).sub(0.5)).mul(N.storey / 2));
    const joint = vj.max(hj).mul(fine);
    const tone = mix(vec3(0.55, 0.545, 0.52), vec3(0.6, 0.595, 0.57), worldNoise(0.6)).mul(hash(floor(U.div(1.25)).mul(7.3).add(floor(V.div(N.storey / 2)).mul(3.1))).mul(0.04).add(0.98));
    m.colorNode = mix(tone, vec3(0.3, 0.3, 0.29), joint);
    M.neu = m;
  }
  // The old school: white plaster, a ribbon window per floor with a dark post every bay; a blind drawn in some
  {
    const S = ALT, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: S.bay, storey: S.storey, closed: CLOSED, winHalf: S.half });
    const band = rect(S.half, S.lo, S.hi).mul(open);
    const post = smoothstep(S.bay / 2 - 0.06, S.bay / 2 - 0.035, abs(bu)).mul(near);
    const pane = rect(S.half, S.lo + 0.06, S.hi - 0.06).mul(float(1).sub(post)).mul(open);
    const plaster = mix(vec3(0.5, 0.5, 0.48), vec3(0.58, 0.58, 0.555), worldNoise(0.4));
    const sill = rect(S.half + 0.05, S.lo - 0.1, S.lo - 0.01).mul(open).mul(near);
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)).add(57));
    const tone = mix(vec3(0.02, 0.026, 0.03), vec3(0.07, 0.085, 0.095), worldNoise(0.07));
    const lit = litWindow(bay, storey.add(half.mul(3.3)), 57, { share: 0.06, late: 0.02, tone: GLOW_TONE });
    const blind = step(float(S.hi - 0.06).sub(step(0.6, id).mul(0.8)), fv).mul(pane).mul(near);
    let c = mix(plaster, vec3(0.36, 0.36, 0.35), sill);
    c = mix(c, vec3(0.05, 0.05, 0.05), band);
    c = mix(c, tone, pane);
    c = mix(c, vec3(0.5, 0.48, 0.42), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    m.emissiveNode = lit.mul(pane).mul(glow.mul(1.1));
    M.alt = m;
  }
  // The sports hall: vertical grey ribs of 0.3 m, a concrete base, dark glazing bands with mullions on the walls that
  // carry them (aHalf > 0), a band lit here and there at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.35 });
    const half = attribute('aHalf', 'float');
    const rib = smoothstep(0.3, 0.42, abs(fract(U.div(0.3)).sub(0.5))).mul(fine);
    const metal = mix(vec3(...METAL), vec3(0.17, 0.175, 0.18), rib).mul(worldNoise(0.25).mul(0.08).add(0.96));
    const concrete = mix(vec3(0.26, 0.25, 0.23), vec3(0.31, 0.3, 0.28), worldNoise(1.7));
    const isBase = step(V, HALL.base);
    const along = smoothstep(half.sub(1.0), half.sub(1.03), abs(U));
    let band = float(0);
    for (const [lo, hi] of HALL.bands) band = band.add(rectMask(float(0), V, 1, lo, hi));
    band = band.mul(along).mul(step(0.5, half));
    const cell = floor(U.div(HALL.mullion));
    const mull = smoothstep(0.06, 0.035, float(HALL.mullion / 2).sub(abs(U.sub(cell.add(0.5).mul(HALL.mullion))))).mul(near);
    const pane = band.mul(float(1).sub(mull));
    const lit = litWindow(cell, floor(V.div(5)), 71, { share: 0.12, late: 0.03, tone: GLOW_TONE });
    let c = mix(metal, concrete, isBase);
    c = mix(c, vec3(0.06, 0.06, 0.065), band);
    c = mix(c, mix(vec3(0.02, 0.025, 0.03), vec3(0.06, 0.075, 0.085), worldNoise(0.08)), pane);
    m.colorNode = c;
    m.roughnessNode = mix(mix(float(0.55), float(0.9), isBase), float(0.1), pane);
    m.metalnessNode = mix(mix(float(0.35), float(0), isBase), float(0.5), pane);
    m.emissiveNode = lit.mul(pane).mul(glow.mul(0.9));
    M.halle = m;
  }
  // The glass: dark panes in two tones, few lit at night (a corridor, a classroom late)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.7 });
    const cx = floor(U.div(O.pane)), cy = floor(V.div(N.storey));
    const paneId = hash(cx.mul(13.1).add(cy.mul(7.3)));
    m.colorNode = mix(vec3(0.025, 0.032, 0.036), vec3(0.08, 0.095, 0.105), paneId.mul(0.6).add(worldNoise(0.1).mul(0.4)));
    m.emissiveNode = litWindow(cx, cy, 83, { share: 0.07, late: 0.02, tone: GLOW_TONE }).mul(glow.mul(0.9));
    M.glass = m;
  }
  return M;
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  panel: [0.55, 0.545, 0.52], cap: [0.42, 0.42, 0.41], frame: [0.045, 0.045, 0.05], spandrel: [0.09, 0.09, 0.095],
  timber: [0.45, 0.3, 0.18], timberDark: [0.3, 0.19, 0.11], white: [0.55, 0.55, 0.53], coping: [0.33, 0.33, 0.33],
  metalCap: [0.2, 0.205, 0.21], plinth: [0.24, 0.235, 0.22], solar: [0.025, 0.035, 0.06], solarFrame: [0.35, 0.36, 0.38], post: [0.4, 0.27, 0.16]
};

/** A wall's corner in the world: s along it, o out of it, y up */
const at = (F, s, y, o = 0) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };

/** The highest (or lowest) ground along a wall, half a metre before it, from s0 to s1 */
export function groundAlong(F, { s0 = 0, s1 = F.len, low = false, out = 0.5 } = {}) {
  let y = low ? Infinity : -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.5));
  for (let i = 0; i <= n; i++) {
    const g = groundHeight(...onWall(F, s0 + ((s1 - s0) * i) / n, out));
    y = low ? Math.min(y, g) : Math.max(y, g);
  }
  return y;
}

/** A quad on a wall's plane from s0 to s1, y0 to y1, `o` before it, into `bucket` with uv `uvOf(s, y)` */
function wallQuad(B, bucket, F, s0, s1, y0, y1, uvOf, opt = {}, o = 0) {
  B.quad(bucket, at(F, s0, y0, o), at(F, s1, y0, o), at(F, s1, y1, o), at(F, s0, y1, o), [uvOf(s0, y0), uvOf(s1, y0), uvOf(s1, y1), uvOf(s0, y1)], opt);
}

/** A wall of panels from y0 to y1 with rectangular holes ([{ s0, s1, y0, y1 }]): the cells of the holes' grid outside them */
function panelWall(B, F, y0, y1, holes) {
  const mid = F.len / 2, uvOf = (s, y) => [s - mid, y - N.foot];
  const ss = [...new Set([0, F.len, ...holes.flatMap((h) => [h.s0, h.s1])])].sort((a, b) => a - b);
  const ys = [...new Set([y0, y1, ...holes.flatMap((h) => [h.y0, h.y1]).filter((y) => y > y0 && y < y1)])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < ss.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const sm = (ss[i] + ss[i + 1]) / 2, ym = (ys[j] + ys[j + 1]) / 2;
      if (holes.some((h) => sm > h.s0 && sm < h.s1 && ym > h.y0 && ym < h.y1)) continue;
      wallQuad(B, 'neu', F, ss[i], ss[i + 1], ys[j], ys[j + 1], uvOf);
    }
  }
}

/** An opening's reveal (its four faces, `d` deep, in `colour`) and what fills it: glass with frames, or a timber door */
function opening(B, F, h) {
  const timber = h.kind !== 'group', d = timber ? 0.2 : O.depth, { s0, s1, y0, y1 } = h;
  const colour = C.panel, opt = { colour };
  B.quad('trim', at(F, s0, y0), at(F, s0, y0, -d), at(F, s0, y1, -d), at(F, s0, y1), undefined, opt); // the left jamb
  B.quad('trim', at(F, s1, y0, -d), at(F, s1, y0), at(F, s1, y1), at(F, s1, y1, -d), undefined, opt); // the right one
  B.quad('trim', at(F, s0, y0), at(F, s1, y0), at(F, s1, y0, -d), at(F, s0, y0, -d), undefined, opt); // the sill
  B.quad('trim', at(F, s0, y1, -d), at(F, s1, y1, -d), at(F, s1, y1), at(F, s0, y1), undefined, opt); // the head
  const frame = timber ? C.timber : C.frame, fw = timber ? 0.06 : 0.045;
  if (h.kind === 'door') {
    // (two timber leaves, a dark slit between, the frame)
    B.box('trim', F, s0, s1, -d - 0.04, -d + 0.02, y0, y1, C.timber);
    B.box('trim', F, (s0 + s1) / 2 - 0.015, (s0 + s1) / 2 + 0.015, -d + 0.02, -d + 0.03, y0, y1 - 0.05, C.timberDark);
    B.box('trim', F, s0 + 0.08, s0 + 0.12, -d + 0.02, -d + 0.08, y0 + 0.9, y0 + 1.1, C.frame);
    return;
  }
  wallQuad(B, 'glass', F, s0, s1, y0, y1, (s, y) => [s + F.a[0] * 0.37, y - N.foot], {}, -d);
  // the frame round it, the mullions between its panes, a transom in the timber glazing, the spandrel at the floor
  // between the top two floors
  const g = -d + 0.06;
  B.box('trim', F, s0, s0 + fw, -d, g, y0, y1, frame);
  B.box('trim', F, s1 - fw, s1, -d, g, y0, y1, frame);
  B.box('trim', F, s0, s1, -d, g, y0, y0 + fw, frame);
  B.box('trim', F, s0, s1, -d, g, y1 - fw, y1, frame);
  for (let i = 1; i < h.panes; i++) {
    const s = s0 + ((s1 - s0) * i) / h.panes;
    B.box('trim', F, s - fw / 2, s + fw / 2, -d, g, y0, y1, frame);
  }
  if (timber && y1 - y0 > 3) B.box('trim', F, s0, s1, -d, g, y0 + 2.6, y0 + 2.6 + fw, frame);
  if (!timber && y0 < O.spandrel[0] && y1 > O.spandrel[1]) B.box('trim', F, s0, s1, -d, g + 0.02, ...O.spandrel, C.spandrel);
}

// The new building, its wing and the lift's head: panelled walls round their openings from the base (or the foot on the
// roof) to the roof, a plinth where the ground falls under the floor, the parapet's cap, the roof
function buildNew(B, p) {
  const ring = outwardRing(p.ring), y0 = p.foot ?? SCHULE_BUENDA.base;
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len < 0.05) continue;
    const runs = coverRuns(p, F);
    if (runs.every((r) => r.cover >= p.top - 0.05)) continue; // (hidden behind a taller part)
    const glazeFoot = Math.max(N.foot, groundAlong(F) + 0.05);
    const holes = newOpenings(p, F, runs, glazeFoot);
    panelWall(B, F, y0, p.top, holes);
    for (const h of holes) opening(B, F, h);
    // (a darker plinth under the floor where the ground falls away)
    const low = groundAlong(F, { low: true });
    if (p.foot === undefined && low < N.foot - 0.1) B.box('trim', F, 0, F.len, -0.02, 0.03, low - 0.4, N.foot, C.plinth);
    B.box('trim', F, -0.04, F.len + 0.04, -0.3, 0.05, p.top - 0.06, p.top + 0.06, C.cap);
  }
  flatRoof(B, ring, p.top);
}

// The old school's walls and the kindergarten's: in stretches of the same cover, a closed plinth under the windows over
// the highest ground (or the neighbour's roof) before each, the floors with ribbons, the parapet; the coping, the roof
function buildOld(B, p) {
  const ring = outwardRing(p.ring), top = p.top, scale = ALT.storey / p.storey;
  // (v on the old school's grid: a part with lower floors has its grid stretched to them)
  const v = (y, off) => (y - p.line) * scale + UP - off;
  const quad = (F, s0, s1, y0, y1, kind) => {
    if (y1 - y0 < 0.01) return;
    const mid = F.len / 2, off = kind === 'win' ? 0 : CLOSED;
    wallQuad(B, 'alt', F, s0, s1, y0, y1, (s, y) => [s - mid, v(y, off)], { half: kind === 'win' ? mid : 0 });
  };
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len < 0.05) continue;
    const runs = coverRuns(p, F);
    if (runs.every((r) => r.cover >= top - 0.05)) continue;
    for (const r of runs) {
      if (r.cover >= top - 0.05) continue;
      if (F.len < 2.4) { quad(F, r.s0, r.s1, SCHULE_BUENDA.base, top, 'plain'); continue; }
      const hi = Math.max(groundAlong(F, { s0: r.s0, s1: r.s1 }), r.cover);
      const from = windowsFrom(p.line, p.storey, hi + 0.25, ALT.lo / scale);
      quad(F, r.s0, r.s1, SCHULE_BUENDA.base, from, 'plain');
      quad(F, r.s0, r.s1, from, p.line, 'win');
      quad(F, r.s0, r.s1, p.line, top, 'plain');
    }
    B.box('trim', F, -0.05, F.len + 0.05, -0.3, 0.08, top - 0.12, top + 0.1, C.coping);
  }
  flatRoof(B, ring, top);
}

// The sports hall: its metal walls from the base to the roof (v metres over its foot; the bands on every wall long
// enough), the coping, the roof
function buildHall(B, p) {
  const ring = outwardRing(p.ring);
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len < 0.05) continue;
    if (coverRuns(p, F).every((r) => r.cover >= p.top - 0.05)) continue;
    const mid = F.len / 2;
    wallQuad(B, 'halle', F, 0, F.len, SCHULE_BUENDA.base, p.top, (s, y) => [s - mid, y - SCHULE_BUENDA.hallFoot], { half: F.len > 8 ? mid : 0 });
    B.box('trim', F, -0.05, F.len + 0.05, -0.3, 0.1, p.top - 0.2, p.top + 0.08, C.metalCap);
  }
  flatRoof(B, ring, p.top);
}

// The link and the entrance hall: glazing in light timber frames on their free stretches (mullions every ~1.5 m, a
// transom), a plinth under it and a panelled fascia over it; closed panels over a lower neighbour's roof
function buildGlazed(B, p) {
  const ring = outwardRing(p.ring);
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len < 0.05) continue;
    for (const r of coverRuns(p, F)) {
      if (r.cover >= p.top - 0.05) continue;
      const len = r.s1 - r.s0;
      if (r.cover > -Infinity || len < 1.2) {
        B.box('trim', F, r.s0, r.s1, -0.05, 0.02, Math.max(SCHULE_BUENDA.base, r.cover), p.top, C.panel);
        continue;
      }
      const hi = groundAlong(F, { s0: r.s0, s1: r.s1, out: 0.3 }), low = groundAlong(F, { s0: r.s0, s1: r.s1, out: 0.3, low: true });
      const foot = hi + 0.08, head = p.top - 0.9;
      B.box('trim', F, r.s0, r.s1, -0.05, 0.06, low - 1.0, foot, C.plinth);
      wallQuad(B, 'glass', F, r.s0, r.s1, foot, head, (s, y) => [s + F.a[0] * 0.37, y - N.foot]);
      const n = Math.max(1, Math.round(len / 1.5));
      for (let k = 0; k <= n; k++) {
        const s = r.s0 + (len * k) / n;
        B.box('trim', F, Math.max(r.s0, s - 0.04), Math.min(r.s1, s + 0.04), 0, 0.12, foot, head, C.timber);
      }
      for (const y of [foot, foot + 2.7, head - 0.08]) if (y + 0.08 <= head) B.box('trim', F, r.s0, r.s1, 0, 0.12, y, y + 0.08, C.timber);
      B.box('trim', F, r.s0, r.s1, -0.05, 0.08, head, p.top, C.panel);
    }
    B.box('trim', F, -0.04, F.len + 0.04, -0.3, 0.1, p.top - 0.05, p.top + 0.07, C.cap);
  }
  flatRoof(B, ring, p.top);
}

// The solar panels on the old school's roof: low dark rows along its west wall
function buildSolar(B) {
  const S = SCHULE_BUENDA.solar, p = partById(S.part), r = outwardRing(p.ring);
  // (the west wall: the longest whose outside faces west)
  let F = null;
  for (let i = 0; i < r.length; i++) {
    const W = wallFrame(r[i], r[(i + 1) % r.length]);
    if (W.n[0] < -0.7 && (!F || W.len > F.len)) F = W;
  }
  for (const o of S.rows) {
    B.box('trim', F, S.s0, S.s1, -o - S.depth, -o, p.top + 0.28, p.top + 0.34, C.solar);
    B.box('trim', F, S.s0, S.s1, -o - 0.06, -o, p.top + 0.1, p.top + 0.34, C.solarFrame);
  }
}

/** A canopy: posts on the ground, a timber frame (beams along and across), a flat roof; its posts (for colliders) */
function buildCanopy(B, c) {
  const F = wallFrame(c.wall.a, c.wall.b), h = SCHULE_BUENDA.post / 2;
  let hi = -Infinity;
  for (const s of c.posts) hi = Math.max(hi, groundHeight(...onWall(F, s, c.postOut)));
  const roof = hi + c.height, posts = [];
  for (const s of c.posts) {
    const g = groundHeight(...onWall(F, s, c.postOut));
    B.box('trim', F, s - h, s + h, c.postOut - h, c.postOut + h, g - 0.4, roof - 0.3, C.post);
    posts.push({ F, s0: s - h, s1: s + h, o0: c.postOut - h, o1: c.postOut + h, y0: g, y1: roof });
    B.box('trim', F, s - 0.06, s + 0.06, 0, c.postOut, roof - 0.3, roof - 0.06, C.timber); // (a beam across to the wall)
  }
  B.box('trim', F, c.s0, c.s1, c.postOut - 0.1, c.postOut + 0.1, roof - 0.32, roof - 0.06, C.timber); // the beam along
  B.box('trim', F, c.s0, c.s1, 0, c.out, roof - 0.06, roof + 0.12, C.timber, { top: 'roof' });
  B.box('trim', F, c.s0, c.s1, c.out - 0.05, c.out, roof - 0.06, roof + 0.2, C.cap); // (the fascia's edge)
  return posts;
}

/** A thin oriented box collider in a wall's frame (s along it, o out of it), at world heights */
function collider({ F, s0, s1, o0, o1, y0, y1 }) {
  const [cx, cz] = onWall(F, (s0 + s1) / 2, (o0 + o1) / 2), hx = (s1 - s0) / 2, hz = (o1 - o0) / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } };
}

/** Canopy outlines, for the tests */
export const canopyRings = () => SCHULE_BUENDA.canopies.map(canopyRing);

/**
 * Builds the Schulhaus Bünda into `scene`. Returns { group, colliders }: the canopies' posts (the walls are the
 * surveyed outlines', js/buildings.js), at world heights.
 */
export function buildSchuleBuenda(scene) {
  const root = new THREE.Group();
  root.name = 'Schule Bünda';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ walls: ['alt', 'halle'], name: 'Schule Bünda' }), M = materials();
  for (const p of SCHULE_BUENDA.parts) {
    if (p.kind === 'neu' || p.kind === 'aula' || p.kind === 'head') buildNew(B, p);
    else if (p.kind === 'alt') buildOld(B, p);
    else if (p.kind === 'halle') buildHall(B, p);
    else buildGlazed(B, p);
  }
  buildSolar(B);
  const posts = SCHULE_BUENDA.canopies.flatMap((c) => buildCanopy(B, c));
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: posts.map(collider) };
}
