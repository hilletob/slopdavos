import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { TALSTRASSE_BLOCK, groundOutlines, isInner, onWall, outwardRing, part, pointInRing, rampY, wallFrame } from './talstrasse-block-data.js';

export { TALSTRASSE_BLOCK };

// The house of the former AVIA garage on the Talstrasse rebuilt by hand (js/talstrasse-block-data.js), standing in for its
// swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows: the house as
// the dashcam views of 2025 show it, the block of six floors over the shop, its front towards the forecourt dark
// glazing (drawn by its material from its uv: metres along the wall from its middle, metres up the floors' grid)
// behind balconies with glass balustrades and white slab edges, its other walls in white plaster with narrow windows,
// the low garage's L in white with the red-pink band under its roof's edge, the shop's glazing in pink-magenta frames,
// the gate, the house's door, the covered ramp on the south-east. Five meshes: the plaster, the front's glazing, the
// glass (the shop's, the balustrades', the ground floor's windows), the trim (one vertex-coloured mesh) and the roofs.

excludeBuildings(TALSTRASSE_BLOCK.exclude);
// (the player's walls on the surveyed volumes, not on OSM's outline: js/landmarks.js; the ramp's are returned below)
SURVEYED_FOOTPRINTS.set(TALSTRASSE_BLOCK.osm, groundOutlines());

const { storey: STOREY, bay: BAY, win: WIN, line: LINE, groundFloor: GF, base: BASE } = TALSTRASSE_BLOCK;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (LINE at 40 of them); closed
// walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
const v = (y, open = true) => y - LINE + UP - (open ? 0 : CLOSED);

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const WHITE = [0.6, 0.6, 0.58], FRAME = [0.1, 0.105, 0.11], PINK = [0.5, 0.06, 0.2], BAND = [0.5, 0.12, 0.16];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.3, 0.3, 0.29], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.52, 0.52, 0.5], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.3, { bay: BAY, half: WIN.half });
    M.front = SIMPLE_SKINS.windowed([0.5, 0.5, 0.49], STOREY, 0.3 / STOREY, 2.7 / STOREY, 0.5, 0.3, { bay: 0 });
    M.glass = SIMPLE_SKINS.glow([0.08, 0.09, 0.1], 0.12, 0.7, [1.0, 0.84, 0.62], 0.15);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(60, 220), fine = fade(8, 28);
  const glow = nightGlow();
  // White plaster with a narrow window per bay and floor in a dark frame, a sill under it, a blind drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const pane = rect(WIN.half - 0.06, WIN.lo + 0.06, WIN.hi - 0.06).mul(float(1).sub(smoothstep(0.035, 0.02, abs(bu)).mul(near))).mul(open);
    const sill = rect(WIN.half + 0.05, WIN.lo - 0.06, WIN.lo).mul(open).mul(near);
    const wall = mix(vec3(...WHITE).mul(0.93), vec3(...WHITE).mul(1.04), worldNoise(0.3)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.04)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.85, id)));
    const blind = step(float(WIN.hi - 0.06).sub(drawn.mul(WIN.hi - WIN.lo - 0.12)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.07, 0.085, 0.095), worldNoise(0.07));
    let c = mix(wall, vec3(0.5, 0.5, 0.49), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.42, 0.41, 0.39), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    // (flats: lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 23, { share: 0.4, late: 0.1, tone: twoTones([1.0, 0.74, 0.46], [0.9, 0.88, 0.82], 0.75) })
      .mul(pane).mul(mix(float(1), float(0.45), blind)).mul(glow.mul(1.05));
    M.plaster = m;
  }
  // The front's glazing behind the balconies: floor-high panes in dark frames every 1.5 m, a white slab's edge at the
  // foot of each floor, curtains drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.6 });
    const storey = floor(V.div(STOREY)), fv = V.sub(storey.mul(STOREY));
    const pu = floor(U.div(1.5)), mu = abs(fract(U.div(1.5)).sub(0.5));
    const slab = smoothstep(0.3, 0.28, fv);
    const frame = smoothstep(0.46, 0.475, mu).max(smoothstep(0.36, 0.34, fv)).max(smoothstep(2.72, 2.74, fv)).mul(near.mul(0.8).add(0.2));
    const id = hash(pu.mul(17.3).add(storey.mul(51.7)));
    const curtain = step(0.7, id).mul(smoothstep(0.5, 0.48, mu)).mul(near);
    let c = mix(mix(vec3(0.035, 0.042, 0.05), vec3(0.09, 0.105, 0.115), worldNoise(0.05)), vec3(...FRAME), frame);
    c = mix(c, vec3(0.4, 0.39, 0.37), curtain.mul(float(1).sub(frame)));
    c = mix(c, vec3(...WHITE), slab);
    m.colorNode = c;
    const shiny = float(1).sub(frame.max(slab)).mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.75), float(0.08), shiny);
    m.metalnessNode = shiny.mul(0.6);
    m.emissiveNode = litWindow(pu, storey, 29, { share: 0.35, late: 0.1, tone: twoTones([1.0, 0.76, 0.5], [0.92, 0.9, 0.85], 0.7) })
      .mul(float(1).sub(frame.max(slab))).mul(mix(float(1), float(0.5), curtain)).mul(glow);
    M.front = m;
  }
  // The shop's and the ground floor's glazing, the balustrades: dark glass, a frame every 1.5 m (pink-magenta on the
  // shop, uv's v over 100), a transom 2.4 m up; at night the shop is shut: a faint glow behind most panes
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.75 });
    const shop = step(100, V), sv = V.sub(shop.mul(100));
    const mu = abs(fract(U.div(1.5)).sub(0.5));
    const frame = smoothstep(0.46, 0.475, mu).max(smoothstep(0.045, 0.025, abs(sv.sub(2.4))).mul(shop)).max(smoothstep(0.06, 0.04, sv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.5)).mul(13.1).add(step(2.4, sv).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.05, 0.06, 0.065), vec3(0.12, 0.13, 0.135), paneId), mix(vec3(...FRAME), vec3(...PINK), shop), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.75), float(0.1), frame);
    m.emissiveNode = vec3(1.0, 0.84, 0.6).mul(float(1).sub(frame)).mul(mix(float(0.03), float(0.25), step(0.8, paneId))).mul(shop).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  white: WHITE, band: BAND, pink: PINK, frame: FRAME, edge: [0.42, 0.42, 0.41], slab: [0.56, 0.56, 0.54], rail: [0.2, 0.21, 0.22],
  gate: [0.22, 0.22, 0.23], door: [0.12, 0.1, 0.09], step: [0.33, 0.33, 0.32], concrete: [0.27, 0.27, 0.26], mouth: [0.03, 0.03, 0.03]
};

/** The highest ground along a wall (half a metre before it) */
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
const sameWall = (F, a, b) => (near(F.a, a) && near(onWall(F, F.len), b)) || (near(F.a, b) && near(onWall(F, F.len), a));

// A stretch of plaster wall from y0 to y1 (windows from the ground floor's top up where `open`)
function plaster(B, F, y0, y1, open = true) {
  if (y1 - y0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const mid = F.len / 2, windows = open && F.len >= 2.4 && y0 >= GF - 0.01;
  B.quad('plaster', P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1),
    [[-mid, v(y0, windows)], [mid, v(y0, windows)], [mid, v(y1, windows)], [-mid, v(y1, windows)]], { half: windows ? mid : 0 });
}

// A volume: its walls from the base up to its roof (closed under the ground floor's top, windows over it; the block's
// front glazed over the garage's roof), the band and the coping round the garage's roof, the block's roof edge, the roof
function buildPart(B, p) {
  const ring = outwardRing(p.ring), garageTop = part('garage').top, Fr = TALSTRASSE_BLOCK.front;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const inner = isInner(p, a, b);
    if (p.id === 'garage') {
      if (inner) continue;
      plaster(B, F, BASE, GF, false);
      plaster(B, F, GF, p.top);
      const N = TALSTRASSE_BLOCK.band;
      B.box('trim', F, -N.out, F.len + N.out, 0, N.out, p.top + N.y0, p.top + N.y1, C.band);
      B.box('trim', F, -N.copingOut, F.len + N.copingOut, -0.1, N.copingOut, p.top, p.top + N.coping, C.white);
      continue;
    }
    // the block: behind the garage's L only over its roof
    const foot = inner ? garageTop - 0.05 : BASE;
    if (sameWall(F, Fr.a, Fr.b)) {
      plaster(B, F, foot, garageTop, false);
      buildFront(B, F, garageTop, p.top);
    } else {
      plaster(B, F, foot, Math.max(foot, GF), false);
      plaster(B, F, Math.max(foot, GF), p.top);
    }
    const E = TALSTRASSE_BLOCK.edge;
    B.box('trim', F, -E.out, F.len + E.out, -0.1, E.out, p.top - E.depth, p.top + 0.04, C.edge, { top: 'roof' });
  }
  flatRoof(B, ring, p.top + (p.id === 'block' ? 0.04 : TALSTRASSE_BLOCK.band.coping));
}

// The block's front over the garage's roof: the glazing between white end walls, a balcony at each floor (its slab, its
// glass balustrade on slim posts), the balustrade round the terrace on the garage's roof
function buildFront(B, F, y0, y1) {
  const Fr = TALSTRASSE_BLOCK.front, e = Fr.end;
  const P = (s, y, o = 0) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  const top = y1 - TALSTRASSE_BLOCK.edge.depth;
  // (the glazing's uv: metres along from its left end, v on the floors' grid without the window's offset)
  const gv = (y) => y - LINE + UP;
  B.quad('front', P(e, y0, 0.02), P(F.len - e, y0, 0.02), P(F.len - e, top, 0.02), P(e, top, 0.02), [[0, gv(y0)], [F.len - 2 * e, gv(y0)], [F.len - 2 * e, gv(top)], [0, gv(top)]]);
  for (const [s0, s1] of [[0, e], [F.len - e, F.len]]) B.box('trim', F, s0, s1, -0.2, 0.12, y0, y1, C.white);
  plaster(B, F, y0, y1, false);
  const s0 = Fr.from, s1 = F.len - Fr.from;
  for (const y of Fr.balconies) {
    B.box('trim', F, s0, s1, 0, Fr.out, y - 0.28, y, C.slab);
    B.quad('glass', P(s0, y + 0.05, Fr.out - 0.08), P(s1, y + 0.05, Fr.out - 0.08), P(s1, y + Fr.rail - 0.05, Fr.out - 0.08), P(s0, y + Fr.rail - 0.05, Fr.out - 0.08),
      [[0, 0], [s1 - s0, 0], [s1 - s0, Fr.rail - 0.1], [0, Fr.rail - 0.1]]);
    B.box('trim', F, s0, s1, Fr.out - 0.12, Fr.out - 0.04, y + Fr.rail - 0.05, y + Fr.rail, C.rail);
    for (const s of [s0 + 0.05, s1 - 0.05]) B.box('trim', F, s - 0.04, s + 0.04, Fr.out - 0.12, Fr.out - 0.04, y, y + Fr.rail, C.rail);
  }
  // the terrace on the garage's roof: a balustrade along its edge
  const S = TALSTRASSE_BLOCK.shop, G = wallFrame(S.a, S.b), y = part('garage').top + TALSTRASSE_BLOCK.band.coping;
  B.quad('glass', P2(G, 0.3, y + 0.05, -0.15), P2(G, G.len - 0.3, y + 0.05, -0.15), P2(G, G.len - 0.3, y + 0.95, -0.15), P2(G, 0.3, y + 0.95, -0.15),
    [[0, 0], [G.len - 0.6, 0], [G.len - 0.6, 0.9], [0, 0.9]]);
  B.box('trim', G, 0.3, G.len - 0.3, -0.2, -0.1, y + 0.95, y + 1.0, C.rail);
}
const P2 = (F, s, y, o) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };

// The shop's glazing on the garage's front: pink-magenta frames and a fascia over it, the glazed door, a step
function buildShop(B) {
  const S = TALSTRASSE_BLOCK.shop, F = wallFrame(S.a, S.b);
  const g = groundAlong(F), y0 = g + S.plinth, y1 = g + S.head;
  // (uv's v over 100: the shop's frames, js/talstrasse-block.js materials)
  B.quad('glass', P2(F, S.s0, y0, 0.03), P2(F, S.s1, y0, 0.03), P2(F, S.s1, y1, 0.03), P2(F, S.s0, y1, 0.03),
    [[0, 100], [S.s1 - S.s0, 100], [S.s1 - S.s0, 100 + y1 - y0], [0, 100 + y1 - y0]]);
  B.box('trim', F, S.s0 - 0.12, S.s1 + 0.12, 0, 0.1, y1, y1 + S.fascia, C.pink);
  for (const s of [S.s0 - 0.12, S.s1]) B.box('trim', F, s, s + 0.12, 0, 0.1, y0 - 0.05, y1, C.pink);
  B.box('trim', F, S.s0 - 0.12, S.s1 + 0.12, 0, 0.12, y0 - 0.12, y0, C.step);
  // the door: its leaves darker in a pink frame, a step before it
  B.box('trim', F, S.door - 0.85, S.door + 0.85, 0.03, 0.08, y0, y0 + 2.4, C.pink);
  B.box('trim', F, S.door - 0.75, S.door + 0.75, 0.05, 0.1, y0 + 0.02, y0 + 2.3, C.frame);
  B.box('trim', F, S.door - 1.1, S.door + 1.1, 0, 0.9, g - 1, y0 - 0.12, C.step);
  return { g, y0, y1 };
}

// The other openings in the ground floor: windows (glass in a dark frame, a sill), doors (a gate, the house's door
// under a little canopy)
function buildOpenings(B) {
  for (const o of TALSTRASSE_BLOCK.openings) {
    const F = wallFrame(o.a, o.b), g = groundAlong(F);
    for (const [s, w] of o.windows) {
      const y0 = g + o.sill, y1 = g + o.head;
      B.box('trim', F, s - w / 2 - 0.08, s + w / 2 + 0.08, 0, 0.05, y0 - 0.08, y1 + 0.08, C.frame);
      B.quad('glass', P2(F, s - w / 2, y0, 0.06), P2(F, s + w / 2, y0, 0.06), P2(F, s + w / 2, y1, 0.06), P2(F, s - w / 2, y1, 0.06), [[0, 0], [w, 0], [w, y1 - y0], [0, y1 - y0]]);
      B.box('trim', F, s - w / 2 - 0.12, s + w / 2 + 0.12, 0, 0.12, y0 - 0.12, y0 - 0.06, C.slab);
    }
    for (const [s, w, h, kind] of o.doors) {
      if (kind === 'gate') {
        B.box('trim', F, s - w / 2 - 0.1, s + w / 2 + 0.1, 0, 0.05, g - 0.3, g + h + 0.1, C.frame);
        B.box('trim', F, s - w / 2, s + w / 2, 0.05, 0.08, g - 0.3, g + h, C.gate);
        for (let y = g + 0.5; y < g + h; y += 0.5) B.box('trim', F, s - w / 2, s + w / 2, 0.08, 0.1, y - 0.02, y + 0.02, C.rail);
      } else {
        B.box('trim', F, s - w / 2 - 0.08, s + w / 2 + 0.08, 0, 0.05, g, g + h + 0.08, C.frame);
        B.box('trim', F, s - w / 2, s + w / 2, 0.05, 0.08, g + 0.05, g + h, C.door);
        B.box('trim', F, s - w / 2 - 0.6, s + w / 2 + 0.6, 0, 1.0, g + h + 0.35, g + h + 0.47, C.edge, { top: 'roof' });
        B.box('trim', F, s - w / 2 - 0.3, s + w / 2 + 0.3, 0, 0.8, g - 1, g + 0.05, C.step);
      }
    }
  }
}

// The covered ramp: its concrete walls up to the sloped slab, the slab (into the roofs); a dark mouth in its north
// end, where the slab stands highest over the yard
function buildRamp(B) {
  const R = TALSTRASSE_BLOCK.ramp, ring = outwardRing(R.ring);
  const walls = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    // (the walls against the block and the garage are theirs)
    const [mx, mz] = onWall(F, F.len / 2, 0.3);
    if (TALSTRASSE_BLOCK.parts.some((p) => pointInRing(p.ring, mx, mz))) continue;
    const ya = rampY(...a), yb = rampY(...b);
    B.quad('trim', [a[0], BASE, a[1]], [b[0], BASE, b[1]], [b[0], yb, b[1]], [a[0], ya, a[1]], undefined, { colour: C.concrete });
    // the slab's edge a little out over the wall
    B.quad('trim', P2(F, 0, ya - R.slab, 0.08), P2(F, F.len, yb - R.slab, 0.08), P2(F, F.len, yb + 0.02, 0.08), P2(F, 0, ya + 0.02, 0.08), undefined, { colour: C.edge });
    walls.push({ F, ya, yb });
  }
  flatRoof(B, ring, (q) => rampY(q[0], q[1]) + 0.02);
  // the mouth: the wall where the slab stands 2 m and more over the ground all along
  const mouth = walls.find((w) => Math.min(w.ya, w.yb) - groundHeight(...onWall(w.F, w.F.len / 2, 0.5)) > 2);
  if (mouth) {
    const { F, ya, yb } = mouth, g = groundHeight(...onWall(F, F.len / 2, 0.5)), y1 = Math.min(ya, yb) - R.slab - 0.15;
    B.quad('trim', P2(F, 0.35, g, 0.02), P2(F, F.len - 0.35, g, 0.02), P2(F, F.len - 0.35, y1, 0.02), P2(F, 0.35, y1, 0.02), undefined, { colour: C.mouth });
  }
  return walls;
}

/** An oriented collider box along a wall a → b (thin, centred on it), from `baseY` up to `top` */
function wallCollider(a, b, baseY, top, hz = 0.22) {
  const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY, minY: baseY, maxY: top, obb: { cx, cz, hx, hz, cs, sn } };
}

/** The ramp's walls for the player where its slab stands 0.8 m and more over the ground (cut into metre-long pieces) */
export function rampColliders() {
  const R = TALSTRASSE_BLOCK.ramp, ring = outwardRing(R.ring), out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    const [mx, mz] = onWall(F, F.len / 2, 0.3);
    if (TALSTRASSE_BLOCK.parts.some((p) => pointInRing(p.ring, mx, mz))) continue;
    const n = Math.max(1, Math.round(F.len));
    for (let k = 0; k < n; k++) {
      const p = onWall(F, (k * F.len) / n), q = onWall(F, ((k + 1) * F.len) / n);
      const g = Math.min(groundHeight(...p), groundHeight(...q)), top = Math.min(rampY(...p), rampY(...q));
      if (top - g < 0.8) continue;
      out.push(wallCollider(p, q, g - 0.5, top));
    }
  }
  return out;
}

/**
 * Builds the house of the former AVIA garage into `scene`. Returns { group, colliders }: the ramp's walls (the block's
 * and the garage's stand on the surveyed outlines, js/landmarks.js SURVEYED_FOOTPRINTS), at world heights (baseY set,
 * so liftColliders leaves them be).
 */
export function buildTalstrasseBlock(scene) {
  const root = new THREE.Group();
  root.name = 'Talstrasse block';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ walls: 'plaster', name: 'AVIA garage' }), M = materials();
  for (const p of TALSTRASSE_BLOCK.parts) buildPart(B, p);
  buildShop(B);
  buildOpenings(B);
  buildRamp(B);
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: rampColliders() };
}
