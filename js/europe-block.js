import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { EUROPE_BLOCK, coveredAt, floorFeet, groundOutlines, onWall, outwardFrame, outwardRing, part, side, wallFrame } from './europe-block-data.js';

export { EUROPE_BLOCK };

// The block of The Hotel Europe on the Promenade rebuilt by hand (js/europe-block-data.js), standing in for its one
// swissBUILDINGS3D batch, which the streamed tiles drew as white blocks with the town houses' windows: the surveyed
// volumes in their plasters (the hotel's long block khaki, its older front salmon, the shops' block pale grey, the
// wings white, the courtyard cream), a window in a light frame in every bay of every floor (drawn by the wall's
// material from its uv: metres along the wall from its middle, metres up the floors' grid, each part's storey
// stretched to the grid's), the windows and a closed plinth starting over the highest ground along each wall; the
// shops' glazing under a dark fascia and a glass canopy along the Promenade, the loggias of the hotel's front, the
// Casino's glass box with its name on the corner, the café's green canopy on its posts, the white wings' balconies
// wherever a floor stands in the open air, HOTEL EUROPE over the door and on the south wing's roof under the flags, the
// car park's gate. Five meshes: the walls, the roofs, the glass, the trim (one vertex-coloured mesh) and the lettering
// (one canvas atlas). The hotel's hanging sign (js/shops.js) gives way to its own lettering; the other shops keep theirs.

excludeBuildings([EUROPE_BLOCK.exclude]);
SHOP_EXCLUSIONS.add(EUROPE_BLOCK.osm);
// (the player's walls on the surveyed volumes, not on OSM's outlines, which stood up to a metre off: js/landmarks.js)
for (const [osm, rings] of groundOutlines()) SURVEYED_FOOTPRINTS.set(osm, rings);

const BAY = 2.9; // a window's bay along a wall
const STOREY = EUROPE_BLOCK.storey;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
// A window in its storey (m up from the floor's foot, on the grid) and its half width
const WIN = { lo: 0.9, hi: 2.45, half: 0.62 };
const SHOP = EUROPE_BLOCK.shop;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const FRAME = [0.46, 0.46, 0.44];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.29, 0.29, 0.28], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the plasters' colours from the vertices, a lit band per floor at night,
    // js/landmark-buildings.js SIMPLE_SKINS)
    M.walls = SIMPLE_SKINS.windowed([0.92, 0.92, 0.92], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4, { bay: BAY, half: WIN.half });
    M.walls.vertexColors = true;
    M.glass = SIMPLE_SKINS.glow([0.1, 0.13, 0.13], 0.1, 0.8, [1.0, 0.84, 0.62], 0.35);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  // The plaster (its colour from the vertices) with a window per bay and floor: a light frame, a post in its middle and
  // a rail across its upper third, a sill under it; a blind or a curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const tint = attribute('color', 'vec3');
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const bars = smoothstep(0.045, 0.03, abs(bu)).max(smoothstep(0.04, 0.025, abs(fv.sub(WIN.hi - 0.5))));
    const pane = rect(WIN.half - 0.08, WIN.lo + 0.08, WIN.hi - 0.08).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.07, WIN.lo - 0.08, WIN.lo).mul(open).mul(near);
    const stain = rect(WIN.half, WIN.lo - 0.7, WIN.lo - 0.08, 0.2).mul(open).mul(0.05);
    const wall = tint.mul(mix(float(0.92), float(1.05), worldNoise(0.3))).mul(float(1).sub(stain)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.86, id)));
    const span = WIN.hi - WIN.lo - 0.16;
    const blind = step(float(WIN.hi - 0.08).sub(drawn.mul(span)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.09, 0.105), worldNoise(0.07));
    let c = mix(wall, vec3(...FRAME).mul(1.1), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.42, 0.4, 0.36), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (a hotel and flats: rooms lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 23, { share: 0.35, late: 0.1, tone: twoTones([1.0, 0.74, 0.44], [0.86, 0.9, 1.0], 0.8) })
      .mul(pane).mul(mix(float(1), float(0.4), blind)).mul(glow.mul(1.1));
    M.walls = m;
  }
  // The shops' and the Casino's glazing: slim grey posts every 1.5 m, a rail every 1.55 m; at night a faint glow
  // behind most panes, a few lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.5)).sub(0.5)), mv = abs(fract(V.div(1.55)).sub(0.5));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.46, 0.48, mv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.5)).mul(13.1).add(floor(V.div(1.55)).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.06, 0.085, 0.09), vec3(0.14, 0.18, 0.19), paneId), vec3(0.17, 0.19, 0.19), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.2), frame);
    const lit = mix(float(0.12), float(0.8), step(0.82, paneId));
    m.emissiveNode = vec3(1.0, 0.84, 0.62).mul(float(1).sub(frame)).mul(lit).mul(glow.mul(0.45));
    M.glass = m;
  }
  return M;
}

// --- The lettering and the flag: one canvas atlas ------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  roof: [0, 0, 1024, 128],
  door: [0, 132, 620, 92],
  casino: [0, 230, 560, 176],
  flag: [624, 132, 128, 128]
};

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // HOTEL EUROPE on the roof: white capitals on a dark board with a light rim
  cell('roof', (w, h) => {
    g.fillStyle = '#d9d9d4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1e22'; g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffffff'; g.font = 'bold 92px Helvetica, Arial, sans-serif';
    g.fillText('HOTEL EUROPE', w / 2, h / 2 + 4, w - 40);
  });
  // over the door: white capitals on the dark fascia
  cell('door', (w, h) => {
    g.fillStyle = '#f4f1ea'; g.font = '600 62px Georgia, "Times New Roman", serif';
    g.fillText('HOTEL EUROPE', w / 2, h / 2 + 3, w - 24);
  });
  // the Casino's name: yellow letters inside a thin ring
  cell('casino', (w, h) => {
    g.strokeStyle = '#f2d21b'; g.lineWidth = 7;
    g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 8, h / 2 - 8, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f5d520'; g.font = 'italic bold 112px Georgia, "Times New Roman", serif';
    g.fillText('CASINO', w / 2, h / 2 + 6, w - 70);
  });
  cell('flag', (w, h) => {
    g.fillStyle = '#d5171c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(w * 0.4, h * 0.19, w * 0.2, h * 0.62); g.fillRect(w * 0.19, h * 0.4, w * 0.62, h * 0.2);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  coping: [0.4, 0.4, 0.39], plinth: [0.2, 0.2, 0.2], fascia: [0.06, 0.075, 0.075], canopy: [0.1, 0.17, 0.15],
  slab: [0.55, 0.55, 0.53], railGlass: [0.26, 0.31, 0.33], rail: [0.55, 0.55, 0.53], column: [0.56, 0.56, 0.54],
  loggia: [0.05, 0.05, 0.06], parapet: [0.27, 0.16, 0.15], band: [0.12, 0.07, 0.045], board: [0.08, 0.09, 0.1],
  pole: [0.55, 0.56, 0.57], gate: [0.22, 0.24, 0.26], post: [0.32, 0.36, 0.34]
};

const P3 = (F, s, y, o = 0) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };

// The highest ground along a wall, half a metre out of it
function groundAlong(F) {
  let hi = -Infinity;
  for (let s = 0; s <= F.len + 0.01; s += Math.max(0.5, F.len / Math.ceil(F.len / 2))) hi = Math.max(hi, groundHeight(...onWall(F, Math.min(s, F.len), 0.5)));
  return hi;
}

// The stretches of a wall ([s0, s1]) where a point `o` m out of it at height y stands in the open air: no other part
// over it, and (`clear`) the ground that far under it
function freeRuns(F, p, o, y, { clear = 0, min = 1 } = {}) {
  const runs = [], n = Math.max(1, Math.round(F.len));
  const step = F.len / n;
  let start = null;
  for (let i = 0; i <= n; i++) {
    let free = false;
    if (i < n) {
      const [x, z] = onWall(F, (i + 0.5) * step, o);
      free = !coveredAt(x, z, y, p) && (!clear || groundHeight(x, z) < y - clear);
    }
    if (free && start === null) start = i * step;
    if (!free && start !== null) { if (i * step - start >= min) runs.push([start, i * step]); start = null; }
  }
  return runs;
}

// A stretch of plaster from y0 to y1 (closed, or with the windows' grid)
function plaster(B, F, p, tint, y0, y1, windows) {
  if (y1 - y0 < 0.01) return;
  const mid = F.len / 2, k = STOREY / p.storey;
  const open = windows && F.len >= 2.4;
  const v = (y) => (y - p.line) * k + UP - (open ? 0 : CLOSED);
  B.quad('walls', P3(F, 0, y0), P3(F, F.len, y0), P3(F, F.len, y1), P3(F, 0, y1),
    [[-mid, v(y0)], [mid, v(y0)], [mid, v(y1)], [-mid, v(y1)]], { half: open ? mid : 0, colour: tint });
}
// A strip of glazing from y0 to y1 (uv: metres along the wall, metres up from its foot)
function glass(B, F, y0, y1) {
  B.quad('glass', P3(F, 0, y0), P3(F, F.len, y0), P3(F, F.len, y1), P3(F, 0, y1), [[0, 0], [F.len, 0], [F.len, y1 - y0], [0, y1 - y0]]);
}

// Is the whole wall inside a part at least as high (a wall between two volumes)?
function hidden(F, p) {
  for (let s = 0.25; s < F.len; s += 1) { const [x, z] = onWall(F, s, 0.25); if (!coveredAt(x, z, p.top - 0.05, p)) return false; }
  const [x, z] = onWall(F, F.len - 0.25, 0.25);
  return coveredAt(x, z, p.top - 0.05, p);
}

// A volume: its walls from the base up to its roof (a closed plinth under the windows, the shops' glazing on the
// Promenade, the Casino's glass), the coping round its roof, the roof
function buildPart(B, p) {
  const ring = outwardRing(p.ring), base = EUROPE_BLOCK.base, k = p.storey / STOREY;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05 || hidden(F, p)) continue;
    const sd = side(F);
    const tint = EUROPE_BLOCK.skins[p.east && sd === 'east' ? p.east : p.skin];
    const hi = groundAlong(F);
    B.box('trim', F, 0, F.len, -0.3, 0.06, p.top, p.top + 0.1, C.coping, { top: 'roof' });
    if (p.glass && (sd === 'south' || sd === 'east') && hi < p.glass - 2.5) {
      // the Casino's glass from the ground to its fascia
      const foot = hi + 0.1;
      plaster(B, F, p, C.plinth, base, foot, false);
      glass(B, F, foot, p.glass);
      plaster(B, F, p, tint, p.glass, p.top, false);
      continue;
    }
    if (p.shop && sd === 'east' && hi < SHOP.top - 2.2) {
      // the shops on the Promenade: their glazing over a low plinth, the fascia, the canopy where it stands free
      const foot = hi + 0.12;
      plaster(B, F, p, C.plinth, base, foot, false);
      glass(B, F, foot, SHOP.glass);
      plaster(B, F, p, C.fascia, SHOP.glass, SHOP.top, false);
      B.box('trim', F, 0, F.len, 0, 0.12, SHOP.glass, SHOP.top, C.fascia);
      for (const [s0, s1] of freeRuns(F, p, 0.6, SHOP.canopy.y, { min: 0.5 })) B.box('trim', F, s0, s1, 0, SHOP.canopy.out, SHOP.canopy.y, SHOP.canopy.y + 0.1, C.canopy);
      plaster(B, F, p, tint, SHOP.top, Math.min(p.line, p.top), true);
      plaster(B, F, p, tint, Math.min(p.line, p.top), p.top, false);
      continue;
    }
    // elsewhere the windows begin at the first floor whose sill clears the highest ground along the wall
    const feet = floorFeet(p, base).reverse();
    const fromY = feet.find((f) => f + WIN.lo * k >= hi + 0.3) ?? p.line;
    plaster(B, F, p, tint, base, Math.min(fromY, p.top), false);
    if (fromY < p.line) plaster(B, F, p, tint, fromY, p.line, true);
    plaster(B, F, p, tint, Math.max(fromY, p.line), p.top, false);
  }
  flatRoof(B, ring, p.top);
}

// The balconies of the white wings: a slab, a glass rail and its top rail at every floor in the open air (no other part
// over it, the ground well under it), columns at the runs' ends and every two bays; the brown band of the east wing
function buildBalconies(B) {
  for (const p of EUROPE_BLOCK.parts) {
    const ring = outwardRing(p.ring);
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 3) continue;
      if (p.band && side(F) === 'south') {
        for (const [s0, s1] of freeRuns(F, p, 0.3, (p.band[0] + p.band[1]) / 2, { min: 1 })) B.box('trim', F, s0, s1, 0, 0.08, p.band[0], p.band[1], C.band);
      }
      if (!p.balconies?.includes(side(F))) continue;
      for (const y of floorFeet(p, EUROPE_BLOCK.base)) {
        // (none before the brown band: its floor is closed)
        if (y < 3 || (p.band && side(F) === 'south' && y < p.band[1])) continue;
        for (const [s0, s1] of freeRuns(F, p, 0.9, y + 0.5, { clear: 1.5, min: 2.5 })) {
          const out = 1.45;
          B.box('trim', F, s0, s1, 0, out, y - 0.22, y, C.slab);
          B.box('trim', F, s0 + 0.05, s1 - 0.05, out - 0.1, out - 0.05, y, y + 0.95, C.railGlass);
          B.box('trim', F, s0, s1, out - 0.14, out, y + 0.95, y + 1.02, C.rail);
          const up = Math.min(y + p.storey - 0.22, p.top);
          const n = Math.max(1, Math.round((s1 - s0) / (2 * BAY)));
          for (let j = 0; j <= n; j++) {
            const s = Math.min(s1 - 0.14, Math.max(s0 + 0.14, s0 + (j * (s1 - s0)) / n));
            B.box('trim', F, s - 0.13, s + 0.13, out - 0.3, out - 0.04, y, up, C.column);
          }
        }
      }
    }
  }
}

// The loggias of the hotel's front on the Promenade: a dark recess behind a solid parapet in the chosen bays of every
// hotel floor, the slab's edge under it
function buildLoggias(B) {
  const L = EUROPE_BLOCK.loggias, p = part(L.part), F = outwardFrame(p.ring, L.a, L.b), mid = F.len / 2;
  for (const y of floorFeet(p, SHOP.top)) {
    for (const k of L.bays) {
      const s = mid + k * BAY;
      B.box('trim', F, s - 1.2, s + 1.2, 0, 0.03, y + 0.05, y + p.storey - 0.3, C.loggia);
      B.box('trim', F, s - 1.25, s + 1.25, 0.03, 0.12, y, y + 1.05, C.parapet);
      B.box('trim', F, s - 1.3, s + 1.3, 0, 0.14, y - 0.16, y, C.slab);
    }
  }
}

// The lettering: HOTEL EUROPE on a board behind the south wing's parapet (both faces) and the flags behind it, over the
// hotel's door on the fascia; the Casino's name on brackets before its rounded corner
function buildLettering(B) {
  {
    const R = EUROPE_BLOCK.roofName, p = part(R.part), F = outwardFrame(p.ring, R.a, R.b);
    const s0 = (F.len - R.w) / 2, s1 = s0 + R.w, y0 = p.top + R.lift, y1 = y0 + R.h, o = -R.back;
    B.decal(F, s0, s1, o, y0, y1, 'roof');
    B.box('trim', F, s0, s1, o - 0.12, o - 0.01, y0, y1, C.board);
    const back = { a: onWall(F, s1, o - 0.13), u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]] };
    B.decal(back, 0, R.w, 0, y0, y1, 'roof');
    for (const s of [s0 + 1.2, (s0 + s1) / 2, s1 - 1.2]) B.box('trim', F, s - 0.05, s + 0.05, o - 0.12, o - 0.02, p.top, y0, C.board);
    // the flags behind it, flying along the wall
    for (const s of R.flags) {
      const top = p.top + R.pole, po = -2.4;
      B.box('trim', F, s - 0.05, s + 0.05, po - 0.05, po + 0.05, p.top, top, C.pole);
      const [x, z] = onWall(F, s + 0.06, po);
      const front = { a: [x, z], u: F.u, n: F.n }, rear = { a: [x + F.u[0] * 1.6, z + F.u[1] * 1.6], u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]] };
      B.decal(front, 0, 1.6, 0.01, top - 1.7, top - 0.1, 'flag');
      B.decal(rear, 0, 1.6, 0.01, top - 1.7, top - 0.1, 'flag');
    }
  }
  {
    const D = EUROPE_BLOCK.doorName, p = part(D.part), F = outwardFrame(p.ring, D.a, D.b);
    const m = (D.door[0] + D.door[1]) / 2;
    B.decal(F, m - D.w / 2, m + D.w / 2, 0.14, SHOP.glass + 0.06, SHOP.top - 0.06, 'door');
  }
  {
    const N = EUROPE_BLOCK.casinoName, p = part(N.part), F = outwardFrame(p.ring, N.a, N.b);
    // (out beyond the curve's bulge over the chord)
    let bulge = 0;
    for (const [x, z] of p.ring) {
      const dx = x - F.a[0], dz = z - F.a[1], s = dx * F.u[0] + dz * F.u[1];
      if (s > 0 && s < F.len) bulge = Math.max(bulge, dx * F.n[0] + dz * F.n[1]);
    }
    const o = bulge + 0.35, s0 = (F.len - N.w) / 2, s1 = s0 + N.w;
    B.decal(F, s0, s1, o, N.y0, N.y1, 'casino');
    const back = { a: onWall(F, s1, o - 0.02), u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]] };
    B.decal(back, 0, N.w, 0, N.y0, N.y1, 'casino');
    const ym = (N.y0 + N.y1) / 2;
    for (const s of [s0 + 0.8, s1 - 0.8]) B.box('trim', F, s - 0.04, s + 0.04, 0, o - 0.03, ym - 0.04, ym + 0.04, C.pole);
  }
}

// The car park's gate; the café's green glass canopy on its posts (returned: they stand free, the player's colliders)
function buildFront(B) {
  {
    const G = EUROPE_BLOCK.gate, p = part(G.part), F = outwardFrame(p.ring, G.a, G.b), m = F.len / 2;
    const y0 = groundHeight(...onWall(F, m, 0.5));
    B.box('trim', F, m - G.w / 2, m + G.w / 2, 0, 0.05, y0 - 0.3, y0 + G.h, C.gate);
    for (let y = y0 + 0.35; y < y0 + G.h; y += 0.35) B.box('trim', F, m - G.w / 2, m + G.w / 2, 0.05, 0.07, y - 0.02, y + 0.02, C.board);
    B.box('trim', F, m - G.w / 2 - 0.25, m + G.w / 2 + 0.25, 0, 0.12, y0 + G.h, y0 + G.h + 0.3, C.plinth);
  }
  const posts = [];
  {
    const K = EUROPE_BLOCK.cafe, p = part(K.part), F = outwardFrame(p.ring, K.a, K.b);
    B.box('trim', F, 0.2, F.len - 0.2, 0, K.out, K.y, K.y + 0.1, C.canopy);
    B.box('trim', F, 0.2, F.len - 0.2, K.out - 0.08, K.out, K.y - 0.12, K.y + 0.12, C.post);
    for (const s of [1.2, F.len / 2, F.len - 1.2]) {
      const o = K.out - 0.3, y0 = groundHeight(...onWall(F, s, o)) - 0.3;
      B.box('trim', F, s - 0.11, s + 0.11, o - 0.11, o + 0.11, y0, K.y, C.post);
      posts.push({ F, s, o, y0, y1: K.y });
    }
  }
  return posts;
}

/**
 * Builds the block of The Hotel Europe into `scene`. Returns { group, colliders }: the player's walls stand on the
 * surveyed outlines (js/landmarks.js SURVEYED_FOOTPRINTS); the colliders are the café canopy's posts, which stand free
 * of them (at world heights, baseY set, so liftColliders leaves them be).
 */
export function buildEuropeBlock(scene) {
  const root = new THREE.Group();
  root.name = 'Europe block';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Europe block' }), M = materials();
  for (const p of EUROPE_BLOCK.parts) buildPart(B, p);
  buildBalconies(B);
  buildLoggias(B);
  buildLettering(B);
  const posts = buildFront(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  const colliders = posts.map(({ F, s, o, y0, y1 }) => {
    const [cx, cz] = onWall(F, s, o), hx = 0.15, hz = 0.15;
    const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } };
  });
  return { group: root, colliders };
}
