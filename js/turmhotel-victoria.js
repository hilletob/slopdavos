import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, length, mix, smoothstep, step, uv, vec2, vec3 } from 'three/tsl';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { groundHeight } from './terrain.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { TURMHOTEL_VICTORIA, bays, groundOutlines, inTower, offsetRing, onWall, outwardRing, part, pointInRing, staffDoor, towerBay, towerPoint, towerU, wallFrame } from './turmhotel-victoria-data.js';

export { TURMHOTEL_VICTORIA };

// The Turmhotel Victoria rebuilt by hand (js/turmhotel-victoria-data.js), standing in for its two swissBUILDINGS3D
// volumes, which the streamed tiles drew as white blocks with the town houses' windows: the old hotel in white plaster
// with a window in a timber frame in every bay of every floor (drawn by the wall's material from its uv: metres along
// the wall from its middle, metres up the floors' grid), the balconies before the south front, the roof terrace's
// larch rail, the attic under its low hipped roof with wide timber eaves and the flags on it; the round tower at the
// south-east corner, its arched windows in pairs between red-and-white striped shutters (its own material, from metres
// round it and up), the cornice and the flared red-brown helm with the flag on its tip, the name's oval and "Turm
// Stübli · Fondue" round it over the ground floor's arches; the staff door of the mission (js/missions-data-victoria.js)
// in the middle of the south front under a small canopy; the neighbour's low blocks on the west, which the survey's
// batch holds, plain. Six meshes: the walls, the tower, the roofs, the helm, the trim (one vertex-coloured mesh) and the
// lettering (one canvas atlas). The hotel's hanging sign (js/shops.js) gives way to the tower's own lettering.

excludeBuildings(TURMHOTEL_VICTORIA.exclude);
SHOP_EXCLUSIONS.add(TURMHOTEL_VICTORIA.shop);
// (the player's walls on the surveyed volumes and the tower, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(TURMHOTEL_VICTORIA.osm, groundOutlines());

const STOREY = TURMHOTEL_VICTORIA.storey, BAY = TURMHOTEL_VICTORIA.bay, WIN = TURMHOTEL_VICTORIA.win, T = TURMHOTEL_VICTORIA.tower;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.6, 0.595, 0.57], TIMBER = [0.2, 0.1, 0.045], RED = [0.42, 0.03, 0.025];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.22, 0.2, 0.19], 0.9);
  // (the helm: copper gone red-brown)
  M.helm = SIMPLE_SKINS.snowRoof([0.2, 0.085, 0.045], 0.6, 0.3);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.55, 0.55, 0.53], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35, { bay: BAY, half: WIN.half });
    M.tower = SIMPLE_SKINS.windowed([0.56, 0.47, 0.46], T.storey, T.win.lo / T.storey, T.win.hi / T.storey, 0.9, 0.35, { bay: towerBay(), half: T.win.at + T.win.half });
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(8, 28);
  const glow = nightGlow();
  const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.075, 0.09, 0.1), worldNoise(0.07));
  // White plaster with a window per bay and floor: a timber frame, two casements and a transom light, a sill under it;
  // a curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu)).mul(step(fv, WIN.hi - 0.45)).max(smoothstep(0.04, 0.025, abs(fv.sub(WIN.hi - 0.45))));
    const pane = rect(WIN.half - 0.08, WIN.lo + 0.08, WIN.hi - 0.08).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.06, WIN.lo - 0.08, WIN.lo).mul(open).mul(near);
    const stain = rect(WIN.half, WIN.lo - 0.7, WIN.lo - 0.08, 0.2).mul(open).mul(0.05);
    const wall = mix(vec3(...PLASTER).mul(0.93), vec3(...PLASTER).mul(1.04), worldNoise(0.3)).mul(float(1).sub(stain));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.85, id)));
    const span = WIN.hi - WIN.lo - 0.16;
    const curtain = step(float(WIN.hi - 0.08).sub(drawn.mul(span)), fv).mul(pane).mul(near);
    let c = mix(wall, vec3(0.5, 0.49, 0.47), sill);
    c = mix(c, vec3(...TIMBER), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.52, 0.48, 0.42), curtain);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    // (a hotel: rooms lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 41, { share: 0.4, late: 0.1, tone: twoTones([1.0, 0.74, 0.46], [0.95, 0.88, 0.76], 0.7) }).mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The tower: white plaster, round it every 60° a pair of arched windows between two shutters striped red and white
  // on the slant (the stripes fade to their mean colour beyond ~25 m); the ground floor's arches taller, the Stübli's
  // panes behind them lit in the evening
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const TB = towerBay();
    const bay = floor(U.div(TB).add(0.5)), bu = U.sub(bay.mul(TB));
    const lv = floor(V.div(T.storey)), fv = V.sub(lv.mul(T.storey));
    const valid = step(-0.5, lv).mul(step(lv, T.levels - 0.5));
    const ground = step(lv, 0.5);
    const lo = mix(float(T.win.lo), float(T.arch.lo), ground), hi = mix(float(T.win.hi), float(T.arch.hi), ground);
    // (an arched opening: a rectangle up to its springing, a half circle over it)
    const arch = (x, y, hw, y0, y1, e = 0.015) => {
      const spring = y1.sub(hw);
      const box = smoothstep(hw + e, hw - e, abs(x)).mul(smoothstep(y0.sub(e), y0.add(e), y)).mul(smoothstep(spring.add(e), spring.sub(e), y));
      const top = smoothstep(hw + e, hw - e, length(vec2(x, y.sub(spring)))).mul(step(spring, y));
      return box.max(top);
    };
    const bw = abs(abs(bu).sub(T.win.at));
    const win = arch(bw, fv, T.win.half, lo, hi).mul(valid);
    const pane = arch(bw, fv, T.win.half - 0.06, lo.add(0.06), hi.sub(0.06)).mul(valid);
    const shutter = smoothstep(T.shutter.half + 0.012, T.shutter.half - 0.012, abs(abs(bu).sub(T.shutter.at)))
      .mul(smoothstep(lo.sub(0.012), lo.add(0.012), fv)).mul(smoothstep(hi.sub(0.08), hi.sub(0.11), fv)).mul(valid);
    const stripe = step(0.5, fract(abs(bu).add(fv).div(0.36)));
    const shutterC = mix(mix(vec3(...PLASTER), vec3(...RED), stripe), vec3(0.5, 0.31, 0.3), float(1).sub(fine));
    const wall = mix(vec3(...PLASTER).mul(0.93), vec3(...PLASTER).mul(1.04), worldNoise(0.3));
    let c = mix(wall, shutterC, shutter);
    c = mix(c, vec3(...TIMBER), win);
    c = mix(c, glassC, pane);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.92), float(0.12), pane);
    m.metalnessNode = pane.mul(0.5);
    const rooms = litWindow(bay, lv, 43, { share: 0.45, late: 0.12, tone: twoTones([1.0, 0.74, 0.46], [0.95, 0.88, 0.76], 0.7) }).mul(float(1).sub(ground));
    const stuebli = vec3(1.0, 0.7, 0.4).mul(ground).mul(0.75);
    m.emissiveNode = rooms.add(stuebli).mul(pane).mul(glow.mul(1.1));
    M.tower = m;
  }
  return M;
}

// --- The lettering and the flags: one canvas atlas -----------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  oval: [0, 0, 512, 256], // the name's oval on the tower (2.2 × 1.2 m)
  plate: [528, 0, 256, 96], // the plate by the staff door (0.62 × 0.25 m)
  flag: [800, 0, 128, 128], // the Swiss flag over the tower and on the roof
  pennant: [528, 112, 192, 128], // the hotel's flag on the roof
  stuebli: [0, 264, 1024, 86] // "Turm Stübli · Fondue" round the tower (7.8 × 0.65 m)
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('oval', (w, h) => {
    // a white oval with a red-brown ring, the name in serif capitals
    g.fillStyle = '#f4f1ea'; g.strokeStyle = '#7a2a1c'; g.lineWidth = 12;
    g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 10, h / 2 - 10, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 26, h / 2 - 26, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#5a1e14'; g.font = '600 104px Georgia, "Times New Roman", serif';
    g.fillText('VICTORIA', w / 2, h / 2 + 6, w - 110);
  });
  cell('plate', (w, h) => {
    g.fillStyle = '#e9e6de'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2a2a'; g.font = '600 38px Helvetica, Arial, sans-serif';
    g.fillText('PERSONAL · STAFF', w / 2, h / 2 + 2, w - 20);
  });
  cell('flag', (w, h) => {
    g.fillStyle = '#d5171c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(w * 0.4, h * 0.19, w * 0.2, h * 0.62); g.fillRect(w * 0.19, h * 0.4, w * 0.62, h * 0.2);
  });
  cell('pennant', (w, h) => {
    g.fillStyle = '#b3141c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.78, w, h * 0.1);
    g.font = 'italic 600 96px Georgia, "Times New Roman", serif';
    g.fillText('V', w / 2, h * 0.42);
  });
  cell('stuebli', (w, h) => {
    g.fillStyle = '#6b2318';
    g.font = 'italic 600 64px Georgia, "Times New Roman", serif';
    g.fillText('Turm Stübli  ·  Fondue', w / 2, h / 2 + 4, w - 40);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  coping: [0.46, 0.46, 0.44], larch: [0.3, 0.16, 0.07], eaves: [0.24, 0.12, 0.05], panel: [0.44, 0.41, 0.36], slab: [0.46, 0.45, 0.43],
  door: [0.07, 0.08, 0.09], frame: [0.13, 0.1, 0.08], canopy: [0.2, 0.22, 0.23], step: [0.33, 0.33, 0.32], pole: [0.6, 0.6, 0.6],
  cornice: [0.5, 0.49, 0.47], finial: [0.35, 0.18, 0.08]
};

// A strip of a wall from y0 to y1 into the plaster: windowed (its bays laid out from the wall's middle) or closed
function plaster(B, F, line, y0, y1, windows) {
  if (y1 - y0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const mid = F.len / 2, open = windows && F.len >= 2.4;
  const v = (y) => y - line + UP - (open ? 0 : CLOSED);
  B.quad('plaster', P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half: open ? mid : 0 });
}

// The highest ground along a wall, half a metre out of it
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, s, 0.5)));
  return hi;
}

// Is the wall's middle, a step out of it, open ground (not another part of the hotel, nor the tower)?
const facesOut = (F) => { const [x, z] = onWall(F, F.len / 2, 0.3); return !TURMHOTEL_VICTORIA.parts.some((q) => !q.neighbour && pointInRing(q.ring, x, z)) && !inTower(x, z); };

// A volume: its walls from the base up to its roof (a closed plinth up to the first floor whose windows clear the
// highest ground along the wall, the floors' windows, the parapet), the coping, the roof
function buildPart(B, p) {
  const ring = outwardRing(p.ring), base = TURMHOTEL_VICTORIA.base;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const hi = groundAlong(F);
    let fromY = p.line;
    while (fromY - STOREY >= 2.4 && fromY - STOREY + WIN.lo >= hi + 0.1) fromY -= STOREY;
    plaster(B, F, p.line, base, fromY, false);
    plaster(B, F, p.line, fromY, p.line, true);
    plaster(B, F, p.line, p.line, p.top, false);
    if (p.id !== 'wing') B.box('trim', F, -0.05, F.len + 0.05, -0.3, 0.06, p.top - 0.12, p.top + 0.14, C.coping);
    // the roof terrace's larch rail along the front's outer walls
    if (p.id === 'front' && F.len > 1 && facesOut(F)) B.box('trim', F, 0, F.len, -0.28, -0.2, p.top + 0.14, p.top + 1.05, C.larch);
  }
  if (p.id !== 'wing') flatRoof(B, ring, p.top);
}

// The wing's low hipped roof: the eaves out over the walls, the slopes up to a flat top, the timber soffit with its
// rafters' ends and the fascia; the flags along its south edge
function buildWingRoof(B, D) {
  const p = part('wing'), W = TURMHOTEL_VICTORIA.wingRoof, R = outwardRing(p.ring);
  const E = offsetRing(p.ring, W.overhang), I = offsetRing(p.ring, -W.inset);
  const slope = W.rise / W.inset, yWall = p.top + 0.15, yE = yWall - W.overhang * slope, yI = yWall + W.rise;
  const n = R.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    B.quad('roof', [E[i][0], yE, E[i][1]], [E[j][0], yE, E[j][1]], [I[j][0], yI, I[j][1]], [I[i][0], yI, I[i][1]]);
    // the soffit, facing down, from the wall out to the eaves' edge
    B.quad('trim', [R[i][0], yE, R[i][1]], [R[j][0], yE, R[j][1]], [E[j][0], yE, E[j][1]], [E[i][0], yE, E[i][1]], undefined, { colour: C.eaves });
    const F = wallFrame(R[i], R[j]);
    B.box('trim', F, -W.overhang * 0.95, F.len + W.overhang * 0.95, W.overhang - 0.12, W.overhang, yE - 0.28, yE + 0.04, C.eaves);
    for (let s = 0.45; s < F.len - 0.2; s += 0.9) B.box('trim', F, s - 0.06, s + 0.06, 0, W.overhang - 0.12, yE - 0.2, yE, C.eaves);
  }
  flatRoof(B, I, yI);
  // the flags: on the top's south edge
  let south = 0;
  for (let i = 0; i < n; i++) if (wallFrame(I[i], I[(i + 1) % n]).n[1] > wallFrame(I[south], I[(south + 1) % n]).n[1]) south = i;
  const S = wallFrame(I[south], I[(south + 1) % n]);
  for (const f of W.flags) flag(B, D, ...onWall(S, S.len * f, -0.6), yI, yI + W.pole, f === 0.5 ? 'flag' : 'pennant');
}

// A flagpole from y0 to y1 at (x, z), its flag on both sides at its top
function flag(B, D, x, z, y0, y1, key) {
  const F = wallFrame([x - 1, z], [x + 1, z]);
  B.box('trim', F, 0.96, 1.04, -0.04, 0.04, y0, y1, C.pole);
  B.box('trim', F, 0.93, 1.07, -0.07, 0.07, y1, y1 + 0.12, C.pole);
  const fw = 1.3, fh = key === 'flag' ? 1.3 : 0.87;
  D.push([wallFrame([x, z], [x + 1, z]), 0.05, 0.05 + fw, 0.01, y1 - fh - 0.05, y1 - 0.05, key]);
  D.push([wallFrame([x, z], [x - 1, z]), -0.05 - fw, -0.05, 0.01, y1 - fh - 0.05, y1 - 0.05, key]);
}

// The tower: its wall round from the base to its top (uv: metres round it, metres up from its floor), the cornice, the
// flared helm up to its tip, the soffit under the flare, the finial and the flag
function buildTower(B, D) {
  const N = T.segments, base = TURMHOTEL_VICTORIA.base;
  const P = (b, y, r = T.r) => { const [x, z] = towerPoint(b, r); return [x, y, z]; };
  const tip = [T.c[0], T.tip, T.c[1]];
  for (let i = 0; i < N; i++) {
    const b0 = (360 * i) / N, b1 = (360 * (i + 1)) / N;
    const u0 = towerU(b0), u1 = towerU(b1), v = (y) => y - T.floor;
    // (seen from outside the higher bearing is on the left)
    B.quad('tower', P(b1, base), P(b0, base), P(b0, T.wall), P(b1, T.wall), [[u1, v(base)], [u0, v(base)], [u0, v(T.wall)], [u1, v(T.wall)]]);
    const F = wallFrame(towerPoint(b1), towerPoint(b0));
    B.box('trim', F, -0.02, F.len + 0.02, 0, 0.16, T.cornice[0], T.cornice[1], C.cornice);
    B.box('trim', F, -0.02, F.len + 0.02, 0, 0.08, T.floor + T.storey - 0.12, T.floor + T.storey, C.cornice);
    B.quad('helm', P(b1, T.flare.y, T.flare.r), P(b0, T.flare.y, T.flare.r), P(b0, T.eave.y, T.eave.r), P(b1, T.eave.y, T.eave.r));
    B.tri('helm', P(b1, T.eave.y, T.eave.r), P(b0, T.eave.y, T.eave.r), tip);
    B.quad('trim', P(b1, T.wall), P(b0, T.wall), P(b0, T.flare.y, T.flare.r), P(b1, T.flare.y, T.flare.r), undefined, { colour: C.eaves });
  }
  const F = wallFrame([T.c[0] - 1, T.c[1]], [T.c[0] + 1, T.c[1]]);
  B.box('trim', F, 0.86, 1.14, -0.14, 0.14, T.tip - 0.2, T.tip + 0.25, C.finial);
  flag(B, D, T.c[0], T.c[1], T.tip + 0.25, T.pole[1], 'flag');
}

// A decal round the tower: from bearing `left` to `right` (seen from outside the higher bearing on the left), y0–y1
function towerDecal(B, left, right, y0, y1, key) {
  const [ax, ay, aw, ah] = ATLAS[key], [W, H] = ATLAS_SIZE;
  const u0 = ax / W, u1 = (ax + aw) / W, v0 = 1 - (ay + ah) / H, v1 = 1 - ay / H;
  const n = Math.max(2, Math.ceil((left - right) / 6)), r = T.r + 0.05;
  const P = (b, y) => { const [x, z] = towerPoint(b, r); return [x, y, z]; };
  for (let k = 0; k < n; k++) {
    const ba = left - ((left - right) * k) / n, bb = left - ((left - right) * (k + 1)) / n;
    const ua = u0 + ((u1 - u0) * k) / n, ub = u0 + ((u1 - u0) * (k + 1)) / n;
    B.quad('decal', P(ba, y0), P(bb, y0), P(bb, y1), P(ba, y1), [[ua, v0], [ub, v0], [ub, v1], [ua, v1]]);
  }
}

// The balconies: before every bay of their walls, a slab, a pale concrete panel on the left, a larch rail on the rest
function buildBalconies(B) {
  const K = TURMHOTEL_VICTORIA.balcony, w = K.w / 2, o = K.out, r = K.rail;
  for (const W of TURMHOTEL_VICTORIA.balconies) {
    const F = wallFrame(W.a, W.b);
    for (const s of bays(F.len, BAY, F.len / 2, WIN.half)) {
      for (const y of W.floors) {
        B.box('trim', F, s - w, s + w, 0, o, y - 0.2, y, C.slab, { top: 'roof' });
        B.box('trim', F, s - w, s - w + K.panel, o - 0.1, o, y, y + r, C.panel);
        B.box('trim', F, s - w, s - w + 0.1, 0, o - 0.1, y, y + r, C.panel);
        B.box('trim', F, s - w + K.panel, s + w, o - 0.07, o - 0.01, y + 0.06, y + r, C.larch);
        B.box('trim', F, s + w - 0.07, s + w, 0, o - 0.07, y + 0.06, y + r, C.larch);
      }
    }
  }
}

// The staff door in the middle of the south front: its frame and leaf with a transom light, the step, the canopy, the
// plate beside it
function buildStaffDoor(B) {
  const S = TURMHOTEL_VICTORIA.south.door, { F, s } = staffDoor();
  const g = groundHeight(...onWall(F, s, 0.5)), w = S.w / 2, top = g + S.h;
  B.box('trim', F, s - w - 0.1, s - w, 0, 0.12, g, top + 0.1, C.frame);
  B.box('trim', F, s + w, s + w + 0.1, 0, 0.12, g, top + 0.1, C.frame);
  B.box('trim', F, s - w - 0.1, s + w + 0.1, 0, 0.12, top, top + 0.12, C.frame);
  B.box('trim', F, s - w, s + w, 0, 0.12, top - 0.5, top - 0.44, C.frame);
  B.box('trim', F, s - w, s + w, 0, 0.06, g, top - 0.5, C.door);
  B.box('trim', F, s - w, s + w, 0, 0.04, top - 0.44, top, C.canopy);
  B.box('trim', F, s + w - 0.2, s + w - 0.08, 0.06, 0.1, g + 1.0, g + 1.06, C.pole);
  B.box('trim', F, s - w - 0.3, s + w + 0.3, 0, 0.5, g - 0.3, g + 0.06, C.step);
  const K = S.canopy;
  B.box('trim', F, s - K.w / 2, s + K.w / 2, 0, K.out, g + K.y, g + K.y + K.thick, C.canopy, { top: 'roof' });
  const Pl = S.plate;
  B.box('trim', F, s + w + Pl.at - 0.03, s + w + Pl.at + Pl.w + 0.03, 0, 0.03, g + Pl.y0 - 0.03, g + Pl.y1 + 0.03, C.frame);
  B.decal(F, s + w + Pl.at, s + w + Pl.at + Pl.w, 0.035, g + Pl.y0, g + Pl.y1, 'plate');
}

/**
 * Builds the Turmhotel Victoria into `scene`. Returns { group, colliders }: none of its own (the player's walls stand
 * on the surveyed outlines and the tower, js/landmarks.js SURVEYED_FOOTPRINTS; the neighbour's blocks keep OSM's).
 */
export function buildTurmhotelVictoria(scene) {
  const root = new THREE.Group();
  root.name = 'Turmhotel Victoria';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Turmhotel Victoria' }), M = materials();
  const D = []; // the flags' decals, put on at the end
  for (const p of TURMHOTEL_VICTORIA.parts) buildPart(B, p);
  buildWingRoof(B, D);
  buildTower(B, D);
  buildBalconies(B);
  buildStaffDoor(B);
  const O = TURMHOTEL_VICTORIA.oval, half = (O.w / 2 / T.r) * (180 / Math.PI);
  towerDecal(B, O.bearing + half, O.bearing - half, O.y0, O.y1, 'oval');
  towerDecal(B, TURMHOTEL_VICTORIA.stuebli.to, TURMHOTEL_VICTORIA.stuebli.from, TURMHOTEL_VICTORIA.stuebli.y0, TURMHOTEL_VICTORIA.stuebli.y1, 'stuebli');
  for (const [F, s0, s1, o, y0, y1, key] of D) B.decal(F, s0, s1, o, y0, y1, key);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}

