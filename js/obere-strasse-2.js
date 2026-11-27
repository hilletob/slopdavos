import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { BERGBAHNEN } from './bergbahnen-data.js';
import { funicularTrack } from './funicular-track.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, worldNoise } from './building-kit.js';
import {
  BAY, HALL, HOUSES, KINDS, STOREY, WIN, allParts, fronts, groundOutlines, onWall, outwardRing, partTop, pointInRing, upperFloors,
  wallFrame, wallNear
} from './obere-strasse-2-data.js';

export { HOUSES };

// The houses along the Obere Strasse in Davos Platz from the arthausHOTEL down past the Schatzalpbahn's valley station
// to the houses above the Post rebuilt by hand (js/obere-strasse-2-data.js), standing in for their swissBUILDINGS3D
// volumes, which the streamed tiles drew as white blocks with the town houses' windows: each house's surveyed volumes
// under their flat roofs and its sloped roofs as the survey has them, its render's colour, windows drawn by the walls'
// material from their uv (metres along the wall from its middle, metres up the house's floors' grid) in the house's
// kind (white-framed, wide behind blinds, dark-framed, between green or brown shutters), cornices, balconies on the
// fronts, shop fronts and garage doors, the station's lettering and banner. One merged mesh per material for the whole
// row: the walls (their colours as vertex colours), the roofs, the trim (vertex colours), the glass and the lettering.

for (const h of HOUSES) excludeBuildings(h.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js)
for (const [id, rings] of groundOutlines()) SURVEYED_FOOTPRINTS.set(id, rings);

const S = STOREY;
// v of a wall: metres up its house's floors' grid scaled to STOREY (the ground floor's foot at 40 storeys); closed
// walls carry v − CLOSED, timber ± TIMBER (all multiples of a storey: the window grid's place in its storey stays)
const UP = 40 * S, CLOSED = 300 * S, TIMBER = 1000 * S;
const vOf = (house, y) => ((y - house.floor) * S) / house.storey + UP;
// aHalf: the half length the bays are laid out on (in the grid's metres), + 1000 × the windows' kind + 10000 × the
// house's index (its lit windows of its own)
const halfCode = (hi, kind, half) => half + 1000 * kind + 10000 * hi;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.17, 0.165, 0.16];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  M.glass = SIMPLE_SKINS.glow([0.03, 0.036, 0.042], 0.1, 0.5, [1.0, 0.8, 0.56], 0.3);
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the houses' colours from the vertices, a lit band per floor at night)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], S, WIN.lo / S, WIN.hi / S, 0.85, 0.3);
    M.walls.vertexColors = true;
    return M;
  }
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const U = uv().x, V = uv().y, A = attribute('aHalf', 'float');
  const hi = floor(A.add(0.5).div(10000)), rest = A.sub(hi.mul(10000)), kind = floor(rest.add(0.5).div(1000)), half = rest.sub(kind.mul(1000));
  const is = (k) => step(k - 0.5, kind).mul(step(kind, k + 0.5));
  const blinds = is(KINDS.blinds), dark = is(KINDS.dark), green = is(KINDS.greenShutters);
  const shut = green.add(is(KINDS.brownShutters));
  const logs = step(2000, V).add(step(V, -2000));
  const bay = floor(U.div(BAY).add(0.5)), bu = U.sub(bay.mul(BAY));
  const storey = floor(V.div(S)), fv = V.sub(storey.mul(S));
  const wh = float(WIN.half).add(blinds.mul(1.0 - WIN.half));
  const top = float(WIN.hi);
  const open = step(abs(bay.mul(BAY)).add(wh).add(float(0.3).add(shut.mul(0.45))), half);
  const rect = (hw, lo, hiY, e = 0.012) => smoothstep(hw.add(e), hw.sub(e), abs(bu)).mul(smoothstep(lo.sub(e), lo.add(e), fv)).mul(smoothstep(hiY.add(e), hiY.sub(e), fv));
  const LO = float(WIN.lo);
  // the render with a little weathering; boards: a course every 0.2 m, each a shade of its own, dark joints
  const base = attribute('color', 'vec3');
  const render = base.mul(mix(float(0.95), float(1.05), worldNoise(0.4)));
  const fc = fract(V.div(0.2));
  const joint = smoothstep(0.12, 0.0, fc).max(smoothstep(0.88, 1.0, fc)).mul(fine).mul(0.45);
  const wood = base.mul(hash(V.div(0.2).floor().mul(17.3)).mul(0.3).add(0.85)).mul(float(1).sub(joint));
  const wall = mix(render, wood, logs);
  // the shutters beside each window (green or brown)
  const sh = rect(wh.add(0.5), LO, top).sub(rect(wh.add(0.06), LO.sub(0.02), top.add(0.02))).max(0).mul(open).mul(shut);
  const slats = smoothstep(0.02, 0.0, abs(fract(fv.div(0.09)).sub(0.5)).sub(0.4)).mul(fine).mul(0.25);
  const shC = mix(vec3(0.17, 0.085, 0.045), vec3(0.05, 0.16, 0.08), green).mul(float(1).sub(slats));
  // a window: its frame (white, aluminium or dark by the kind), a post and a rail, a sill under it, a curtain drawn in
  // some; blinds lowered some way in the wide ones
  const win = rect(wh, LO, top).mul(open);
  const rail = WIN.lo + (WIN.hi - WIN.lo) * 0.62;
  const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.03, 0.018, abs(fv.sub(rail))).mul(float(1).sub(blinds)));
  const pane = rect(wh.sub(0.07), LO.add(0.07), top.sub(0.07)).mul(float(1).sub(bars.mul(fine))).mul(open);
  const sill = rect(wh.add(0.07), LO.sub(0.09), LO).mul(open).mul(near);
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(hi.mul(13.1)));
  const drawn = step(0.6, id).mul(mix(float(0.3), float(0.7), step(0.85, id)));
  const span = top.sub(LO).sub(0.14);
  const curtain = step(top.sub(0.07).sub(drawn.mul(span)), fv).mul(pane).mul(near).mul(float(1).sub(blinds));
  const drop = hash(id.mul(71.3)).mul(0.75).add(0.1);
  const slat = smoothstep(0.25, 0.5, abs(fract(fv.div(0.08)).sub(0.5))).mul(fine).mul(0.3);
  const blind = step(top.sub(0.07).sub(drop.mul(span)), fv).mul(pane).mul(blinds);
  const frameC = mix(mix(vec3(0.6, 0.6, 0.57), vec3(0.3, 0.31, 0.32), blinds), vec3(0.06, 0.045, 0.035), dark);
  const glassC = mix(vec3(0.02, 0.024, 0.028), vec3(0.06, 0.075, 0.09), worldNoise(0.07));
  let c = mix(wall, shC, sh);
  c = mix(c, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, frameC, win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  c = mix(c, vec3(0.36, 0.36, 0.35).mul(float(1).sub(slat)), blind);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain)).mul(float(1).sub(blind));
  m.roughnessNode = mix(float(0.88), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (houses of flats and hotels: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay.add(hi.mul(31)), storey, 67, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain.add(blind).min(1))).mul(glow.mul(1.1));
  M.walls = m;
  return M;
}

// --- The lettering: one canvas atlas -------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  banner: [0, 0, 512, 256],
  strela: [512, 0, 512, 64],
  richmond: [512, 64, 512, 80],
  pizza: [512, 144, 512, 96]
};
function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  const text = (t, x, y, px, colour, weight = 800, font = 'sans-serif', align = 'center') => {
    g.font = `${weight} ${px}px ${font}`; g.fillStyle = colour; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y);
  };
  // the station's big picture: a blue sky over a white mountain, DAVOS SCHATZALP in its corner
  cell('banner', (w, h) => {
    g.fillStyle = '#1c4f9c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8eef6';
    g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.22, h * 0.45); g.lineTo(w * 0.34, h * 0.58); g.lineTo(w * 0.5, h * 0.3); g.lineTo(w * 0.7, h * 0.62);
    g.lineTo(w * 0.85, h * 0.5); g.lineTo(w, h * 0.72); g.lineTo(w, h); g.closePath(); g.fill();
    g.fillStyle = '#9fb4cc';
    g.beginPath(); g.moveTo(w * 0.5, h * 0.3); g.lineTo(w * 0.58, h * 0.75); g.lineTo(w * 0.42, h); g.lineTo(w * 0.62, h); g.lineTo(w * 0.7, h * 0.62); g.closePath(); g.fill();
    text('DAVOS', w * 0.82, h * 0.12, Math.round(h * 0.07), '#ffffff', 600);
    text('SCHATZALP', w * 0.82, h * 0.22, Math.round(h * 0.11), '#ffffff', 900);
  });
  cell('strela', (w, h) => {
    g.fillStyle = '#1d3f8f'; g.fillRect(0, 0, w, h);
    text('Schatzalp Strela', w / 2, h * 0.54, Math.round(h * 0.72), '#f2c200', 800);
  });
  cell('richmond', (w, h) => text('RICHMOND', w / 2, h * 0.54, Math.round(h * 0.8), '#c9a227', 800, 'serif'));
  cell('pizza', (w, h) => {
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w * 0.36, h);
    text('REMIXBAR', w * 0.18, h * 0.54, Math.round(h * 0.34), '#7fd34a', 900);
    g.fillStyle = '#b3121a'; g.fillRect(w * 0.38, 0, w * 0.62, h);
    text('PIZZA DA TONI', w * 0.69, h * 0.5, Math.round(h * 0.42), '#ffd84a', 900);
  });
  return canvasTexture(canvas);
}

// --- Geometry helpers ------------------------------------------------------------------------------------------------------
const TRIM = {
  plinth: [0.22, 0.215, 0.205], soffit: [0.09, 0.05, 0.028], concrete: [0.36, 0.35, 0.33], white: [0.6, 0.6, 0.58],
  timber: [0.14, 0.072, 0.038], metal: [0.07, 0.065, 0.06], glass: [0.2, 0.33, 0.33], sill: [0.3, 0.29, 0.27],
  pier: [0.28, 0.28, 0.28], garage: [0.32, 0.33, 0.34]
};
const PARTS = allParts();
// (the highest top of the row's parts standing on the ground at a point but `self`, or −Infinity)
function coverAt(self, x, z) {
  let y = -Infinity;
  for (const { house, part } of PARTS) {
    if (part === self || part.onRoof || !pointInRing(part.ring, x, z)) continue;
    y = Math.max(y, partTop(house, part, x, z));
  }
  return y;
}
// (a part on another's roof: walls from the roof under it)
function roofUnder(house, self, x, z) {
  let y = -Infinity;
  for (const part of house.parts) {
    if (part === self || part.onRoof || !pointInRing(part.ring, x, z)) continue;
    y = Math.max(y, partTop(house, part, x, z));
  }
  return y;
}
// The highest ground along a wall from s0 to s1, half a metre out of it
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 1.0));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}
/** The foot of the lowest storey of a house whose windows stand `y` or higher */
function storeyFrom(house, y) {
  const lo = (WIN.lo * house.storey) / S;
  return house.floor + Math.ceil((y - lo - house.floor) / house.storey - 1e-9) * house.storey;
}

// The Schatzalpbahn's hall into the valley station: js/bergbahnen.js' carve boxes over the track's first samples, the
// track's end carried on 6 m (oriented boxes { x, z, ux, uz, hl, hw, y0, y1 })
export const HALL_BOXES = (() => {
  const f = (BERGBAHNEN.funiculars || []).find((q) => /Schatzalp/.test(q.name));
  if (!f) return [];
  const p = funicularTrack(f)[0].slice(0, 8).map((q) => ({ x: q.x, y: q.y, z: q.z }));
  const A = p[1], B = p[0], h = Math.hypot(B.x - A.x, B.z - A.z) || 1, g = (B.y - A.y) / h;
  for (let d = 2; d <= HALL.beyond; d += 2) p.unshift({ x: B.x + ((B.x - A.x) / h) * d, y: B.y + g * d, z: B.z + ((B.z - A.z) / h) * d });
  const o = (HALL.right - HALL.left) / 2;
  return p.slice(1).map((Q, k) => {
    const P = p[k], L = Math.hypot(Q.x - P.x, Q.z - P.z) || 1, ux = (Q.x - P.x) / L, uz = (Q.z - P.z) / L;
    return { x: (P.x + Q.x) / 2 - uz * o, z: (P.z + Q.z) / 2 + ux * o, ux, uz, hl: L / 2 + 0.05, hw: (HALL.left + HALL.right) / 2 + 0.05,
      y0: Math.min(P.y, Q.y) - HALL.under, y1: Math.max(P.y, Q.y) + HALL.over };
  });
})();
const inBox = (b, x, y, z, pad = 0) => {
  const dx = x - b.x, dz = z - b.z;
  return Math.abs(dx * b.ux + dz * b.uz) < b.hl + pad && Math.abs(-dx * b.uz + dz * b.ux) < b.hw + pad && y > b.y0 - pad && y < b.y1 + pad;
};
export const inHall = (x, y, z, pad = 0) => HALL_BOXES.some((b) => inBox(b, x, y, z, pad));

// --- The walls ---------------------------------------------------------------------------------------------------------------
// One wall of a part: its top (the part's roof) and its foot (the base, the top of a part before it, or the roof under
// it) sampled every 0.5 m, cut into runs where both are straight, each run into slices at the levels where its look
// changes (the windows' band, the boards, the hall's box)
function wall(B, hi, house, part, F, hall) {
  const n = Math.max(1, Math.ceil(F.len / 0.5));
  const sK = [], top = [], bot = [];
  for (let k = 0; k <= n; k++) {
    const s = (F.len * k) / n;
    sK.push(s);
    const [xi, zi] = onWall(F, s, -0.05);
    top.push(partTop(house, part, xi, zi));
    bot.push(part.onRoof ? Math.max(house.base, roofUnder(house, part, xi, zi), coverAt(part, ...onWall(F, s, 0.3))) : Math.max(house.base, coverAt(part, ...onWall(F, s, 0.3))));
  }
  const kind = part.kind ?? house.kind, scale = BAY / house.bay;
  const mid = F.len / 2, half = mid * scale;
  const mainTop = Math.max(...house.parts.filter((p) => p.top !== undefined).map((p) => p.top), -Infinity);
  const tFrom = house.timber ? mainTop - house.timber.over : Infinity;
  // the band of windows' top: the last storey whose windows fit under the wall's lowest top
  const hiM = (WIN.hi * house.storey) / S, minTop = Math.min(...top);
  let snap = house.floor;
  while (snap + house.storey + hiM + 0.2 <= minTop) snap += house.storey;
  const bandTop = part.closed ? -Infinity : snap + hiM + 0.2;
  // the hall's levels where this wall crosses its box
  const hallLv = [];
  if (hall) for (const b of HALL_BOXES) if (sK.some((s) => { const q = onWall(F, s); return inBox(b, q[0], (b.y0 + b.y1) / 2, q[1], 0.3); })) hallLv.push(b.y0, b.y1);
  const hallCuts = [];
  if (hallLv.length) for (let k = 0; k < n; k++) {
    const a = onWall(F, sK[k]), b = onWall(F, sK[k + 1]), ya = (Math.min(...hallLv) + Math.max(...hallLv)) / 2;
    if (inHall(a[0], ya, a[1]) !== inHall(b[0], ya, b[1])) {
      // (the box's side between the two samples: halved down to a centimetre)
      let lo = sK[k], up = sK[k + 1];
      const inLo = inHall(a[0], ya, a[1]);
      for (let it = 0; it < 6; it++) { const m = (lo + up) / 2, q = onWall(F, m); if (inHall(q[0], ya, q[1]) === inLo) lo = m; else up = m; }
      hallCuts.push((lo + up) / 2);
    }
  }
  // runs where top and foot are straight
  const runs = [];
  let k0 = 0;
  const straight = (a, b) => {
    for (let k = a + 1; k < b; k++) {
      const f = (sK[k] - sK[a]) / (sK[b] - sK[a]);
      if (Math.abs(top[a] + (top[b] - top[a]) * f - top[k]) > 0.01 || Math.abs(bot[a] + (bot[b] - bot[a]) * f - bot[k]) > 0.01) return false;
    }
    return true;
  };
  for (let k = 1; k <= n; k++) if (!straight(k0, k)) { runs.push([k0, k - 1]); k0 = k - 1; }
  runs.push([k0, n]);
  for (const [ka, kb] of runs) {
    const sa = sK[ka], sb = sK[kb];
    if (sb - sa < 1e-6) continue;
    const ta = top[ka], tb = top[kb], ba = bot[ka], bb = bot[kb];
    if (ta - ba < 0.01 && tb - bb < 0.01) continue;
    // the windows from: over the highest ground along the run where it stands free, over the part before it elsewhere
    const covered = Math.max(ba, bb) > house.base + 0.01;
    const from = covered ? Math.max(ba, bb) + 0.3 : groundAlong(F, sa, sb) + Math.max(0.15, (house.plinth || 0.3) + 0.1);
    const win0 = part.closed ? Infinity : storeyFrom(house, from);
    const levels = [win0, bandTop, tFrom, ...hallLv].filter((y) => Number.isFinite(y)).sort((p, q) => p - q);
    const T = (s) => ta + ((tb - ta) * (s - sa)) / (sb - sa), Bt = (s) => ba + ((bb - ba) * (s - sa)) / (sb - sa);
    const cuts = [sa, sb, ...hallCuts.filter((s) => s > sa && s < sb)];
    for (const L of levels) for (const [ya, yb] of [[ta, tb], [ba, bb]]) {
      if ((ya - L) * (yb - L) < 0) cuts.push(sa + ((L - ya) / (yb - ya)) * (sb - sa));
    }
    if ((ta - ba) * (tb - bb) < 0) cuts.push(sa + ((ba - ta) / ((tb - ta) - (bb - ba))) * (sb - sa));
    cuts.sort((p, q) => p - q);
    const edges = [-Infinity, ...levels, Infinity];
    for (let j = 0; j + 1 < cuts.length; j++) {
      const s0 = cuts[j], s1 = cuts[j + 1];
      if (s1 - s0 < 1e-4) continue;
      for (let e = 0; e + 1 < edges.length; e++) {
        const lo = edges[e], up = edges[e + 1];
        const a0 = Math.max(Bt(s0), lo), a1 = Math.min(T(s0), up), b0 = Math.max(Bt(s1), lo), b1 = Math.min(T(s1), up);
        if (a1 - a0 < 0.002 && b1 - b0 < 0.002) continue;
        const ym = (Math.max(a0, b0) + Math.min(a1, b1)) / 2, yc = (a0 + a1 + b0 + b1) / 4;
        // (the hall's opening: no wall)
        if (hallLv.length) { const q = onWall(F, (s0 + s1) / 2); if (inHall(q[0], yc, q[1])) continue; }
        const open = ym >= win0 - 1e-6 && ym <= bandTop + 1e-6;
        const logs = yc >= tFrom;
        const colour = logs ? house.timber.colour : part.colour || house.colour;
        const off = (logs ? (open ? TIMBER : -TIMBER) : 0) - (open ? 0 : CLOSED);
        const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
        const Vv = (y) => vOf(house, y) + off, Uu = (s) => (s - mid) * scale;
        const A0 = Math.min(a0, a1), B0 = Math.min(b0, b1);
        B.quad('walls', P(s0, A0), P(s1, B0), P(s1, Math.max(b0, b1)), P(s0, Math.max(a0, a1)),
          [[Uu(s0), Vv(A0)], [Uu(s1), Vv(B0)], [Uu(s1), Vv(Math.max(b0, b1))], [Uu(s0), Vv(Math.max(a0, a1))]],
          { half: open ? halfCode(hi, kind, half) : 0, colour });
      }
    }
  }
  if (!part.onRoof) plinth(B, house, F, sK, bot);
}
// A plinth of grey render along a wall's foot, `plinth` m over the ground where the wall stands free
function plinth(B, house, F, sK, bot) {
  const h = house.plinth || 0.3, n = Math.max(1, Math.ceil(F.len / 4.0));
  for (let k = 0; k < n; k++) {
    const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
    const ia = Math.round((a / F.len) * (sK.length - 1)), ib = Math.round((b / F.len) * (sK.length - 1));
    if (bot[ia] > house.base + 0.01 || bot[ib] > house.base + 0.01) continue;
    const ga = groundHeight(...onWall(F, a, 0.3)) + h, gb = groundHeight(...onWall(F, b, 0.3)) + h;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('trim', P(a, house.base), P(b, house.base), P(b, Math.max(gb, house.base + 0.2)), P(a, Math.max(ga, house.base + 0.2)), undefined, { colour: TRIM.plinth });
  }
}

// --- Roofs ------------------------------------------------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** A triangle facing up (or down) whichever way its corners run */
function triUp(B, bucket, [a, b, c], up, opt) {
  const n = cross(sub(b, a), sub(c, a));
  if (Math.abs(n[1]) < 1e-9 && Math.hypot(...n) < 1e-9) return;
  B.tri(bucket, ...((n[1] >= 0) === up ? [a, b, c] : [a, c, b]), undefined, opt);
}
// The survey's sloped roofs: each triangle (the snow on it), its soffit a little under it
function slopedRoof(B, house) {
  for (const t of house.tris) {
    const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
    // (the survey's upright slivers at a ridge's end: left out)
    if (Math.abs(n[1]) < 0.35 * Math.hypot(...n)) continue;
    triUp(B, 'roof', t, true);
    triUp(B, 'trim', t.map((p) => [p[0], p[1] - 0.12, p[2]]), false, { colour: TRIM.soffit });
  }
}
// A band round a flat part's top: a box along every edge whose wall stands free up there
function band(B, part, out, h, colour, y) {
  const R = outwardRing(part.ring);
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 1.2) continue;
    const [x, z] = onWall(F, F.len / 2, 0.3);
    if (coverAt(part, x, z) >= y - 0.05) continue;
    lightBox(B, F, -out, F.len + out, -0.05, out, y - h, y + 0.03, colour);
  }
}
// A box against a wall without its back and ends (a cornice's run, a balcony's slab): its front, top and underside
function lightBox(B, F, s0, s1, o0, o1, y0, y1, colour) {
  const P = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  B.quad('trim', P(s0, o1, y0), P(s1, o1, y0), P(s1, o1, y1), P(s0, o1, y1), undefined, { colour });
  B.quad('trim', P(s0, o1, y1), P(s1, o1, y1), P(s1, o0, y1), P(s0, o0, y1), undefined, { colour });
  B.quad('trim', P(s0, o0, y0), P(s1, o0, y0), P(s1, o1, y0), P(s0, o1, y0), undefined, { colour });
}

// --- Balconies, shop fronts, garage doors, lettering ------------------------------------------------------------------------
// A stack of balconies on a front: a slab on every storey over the ground floor and a parapet round its three sides
// (sea-green glass, white concrete, dark timber boards; or a metal rail)
function balconies(B, house, part, F, Bl) {
  const s0 = 1.0, s1 = Math.min(F.len - 1.0, 1.0 + 12), d = Bl.depth;
  if (s1 - s0 < 3) return;
  const tops = [0.25, 0.5, 0.75].map((f) => partTop(house, part, ...onWall(F, s0 + (s1 - s0) * f, -0.3)));
  const floors = upperFloors(house, Math.min(...tops));
  const ground = groundAlong(F, s0, s1);
  const colour = { glass: TRIM.glass, concrete: TRIM.white, timber: TRIM.timber, metal: TRIM.metal }[Bl.rail];
  for (const y of floors) {
    if (y < ground + 2.2) continue;
    lightBox(B, F, s0, s1, 0, d, y - 0.2, y, TRIM.concrete);
    // (the parapet: its front and its ends in one, a box from the slab's edge up)
    if (Bl.rail === 'metal') B.box('trim', F, s0, s1, d - 0.06, d, y + 0.92, y + 1.0, colour);
    else B.box('trim', F, s0, s1, d - 0.1, d, y, y + 1.0, colour);
  }
}
// A shop front: glass between piers from the ground to its fascia, a sill, the fascia
function shopFront(B, house, part, F, garage) {
  const s0 = 0.6, s1 = F.len - 0.6;
  if (s1 - s0 < 2) return;
  const g = groundAlong(F, s0, s1), top = Math.min(g + 3.4, Math.min(...[0.1, 0.5, 0.9].map((f) => partTop(house, part, ...onWall(F, F.len * f, -0.3)))) - 0.3);
  const fa = top - 0.5, y0 = g + (garage ? 0.02 : 0.35);
  if (fa - y0 < 2.0) return;
  const P = (s, y, o) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  const n = Math.max(1, Math.round((s1 - s0) / (garage ? 3.2 : 3.0)));
  if (garage) {
    for (let k = 0; k < n; k++) {
      const a = s0 + ((s1 - s0) * k) / n + 0.25, b = s0 + ((s1 - s0) * (k + 1)) / n - 0.25;
      B.box('trim', F, a, b, 0, 0.04, g - 0.3, Math.min(g + 2.4, fa), TRIM.garage);
    }
  } else {
    B.box('trim', F, s0 - 0.1, s1 + 0.1, 0, 0.12, house.base, y0, TRIM.sill);
    B.quad('glass', P(s0, y0, 0.04), P(s1, y0, 0.04), P(s1, fa, 0.04), P(s0, fa, 0.04));
  }
  for (let k = 0; k <= n; k++) {
    const s = s0 + ((s1 - s0) * k) / n;
    B.box('trim', F, s - 0.12, s + 0.12, 0, 0.1, house.base, fa, TRIM.pier);
  }
  B.box('trim', F, s0 - 0.2, s1 + 0.2, 0, 0.16, fa, top, TRIM.pier);
}
/** The fronts carrying a house's shops (or garage doors): those within the shops' radius of their point */
export function shopWalls(house) {
  const Sp = house.shops || house.garage;
  if (!Sp) return [];
  return fronts(house).filter(({ F }) => F.len >= 3 && Math.hypot(...[0, 1].map((i) => onWall(F, F.len / 2)[i] - Sp.near[i])) <= Sp.r);
}
/** The fronts carrying a house's balconies: its longest fronts (not those with shops' glazing only) */
export function balconyWalls(house) {
  if (!house.balconies) return [];
  return fronts(house).filter(({ part, F }) => F.len >= 5 && !part.closed).sort((a, b) => b.F.len - a.F.len).slice(0, house.balconies.walls);
}

/** The camera spots for a look along the street */
export { VIEWS } from './obere-strasse-2-data.js';

/**
 * Builds the row into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand on the
 * surveyed outlines, js/landmarks.js; the balconies hang over the ground, the shop fronts' sills stand within 0.2 m of
 * the walls).
 */
export function buildObereStrasse2(scene) {
  const root = new THREE.Group();
  root.name = 'Obere Strasse 2';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Obere Strasse 2' }), M = materials();
  HOUSES.forEach((house, hi) => {
    const hall = house.id === 'w123384643';
    for (const part of house.parts) {
      const R = outwardRing(part.ring);
      for (let i = 0; i < R.length; i++) {
        const F = wallFrame(R[i], R[(i + 1) % R.length]);
        if (F.len >= 0.05) wall(B, hi, house, part, F, hall);
      }
      if (part.top !== undefined) flatRoof(B, R, part.top);
    }
    slopedRoof(B, house);
    const Cr = house.cornice;
    if (Cr) for (const p of house.parts) if (p.top !== undefined) band(B, p, Cr.out, Cr.h, Cr.colour, p.top);
    for (const { part, F } of balconyWalls(house)) balconies(B, house, part, F, house.balconies);
    for (const { part, F } of shopWalls(house)) shopFront(B, house, part, F, !!house.garage);
    for (const Sg of house.signs || []) {
      const w = wallNear(house, Sg.at, Sg.face);
      const s = Math.min(Math.max(w.s, Sg.w / 2), w.F.len - Sg.w / 2);
      B.decal(w.F, s - Sg.w / 2, s + Sg.w / 2, 0.2, Sg.y0, Sg.y1, Sg.key);
    }
    for (const sl of house.slabs) flatRoof(B, outwardRing(sl.ring), sl.top + 0.03, { bucket: 'trim', colour: TRIM.concrete });
  });
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
