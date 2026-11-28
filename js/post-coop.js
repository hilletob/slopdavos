import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, mx_noise_float, positionView, positionWorld, smoothstep, step, time, uv, vec3 } from 'three/tsl';
import { TERRAIN, groundHeight } from './terrain.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { cityUniforms } from './tsl-materials.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, decalMaterial } from './building-kit.js';
import { onWall } from './spital-data.js';
import { POST_COOP, canopyInner, inCoopGlass, lowerForecourt, outwardRing, partTop, postRoofY, shopfrontFrame, upperBucket, wallFrame } from './post-coop-data.js';

export { POST_COOP };

// The post and Coop block at the Bahnhof Davos Platz rebuilt by hand (js/post-coop-data.js), standing in for its
// swissBUILDINGS3D volumes, which the streamed tiles drew as white boxes with the town houses' windows: the post
// office in ochre plaster over the shops' ceramic panels, its curved roof, the yellow band with the lettering; the
// round tower on the Silvrettaplatz in concrete, its drum with a band of windows and the small dome; the shopfront under
// the square with the Coop's entrance; the Coop in light grey panels, its glazed offices towards the Talstrasse, its
// corner tower on the Bahnhofstrasse glazed on one side under the glass canopy, the round windows of the restaurant and
// the lettering on the roofs. Windows are drawn by the walls' materials from their uv (metres along a wall from its
// middle, metres over the forecourt). Seven meshes: the panels, the plaster, the concrete, the glass, the roofs, the
// trim (one vertex-coloured mesh) and the decals (one canvas atlas).

excludeBuildings(POST_COOP.exclude);
// (before the terrain's meshes are built: the forecourt runs up to the shopfront, js/post-coop-data.js lowerForecourt)
lowerForecourt(TERRAIN);
for (const r of DAVOS_DATA.roads) if (r.id === POST_COOP.squareWay) r.noBench = true;

const { forecourt: Y0, square: SQUARE, base: BASE, shop: SHOP, upper: UPPER } = POST_COOP;
const SQ = SQUARE - Y0; // the square's level in v (metres over the forecourt)

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.27, 0.27, 0.26], 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.panel = SIMPLE_SKINS.windowed([0.34, 0.345, 0.34], SHOP.storey, SHOP.window.lo / SHOP.storey, SHOP.window.hi / SHOP.storey, 0.7, 0.45, { bay: SHOP.bay, half: SHOP.window.half });
    M.render = SIMPLE_SKINS.windowed([0.42, 0.34, 0.2], UPPER.storey, UPPER.window.lo / UPPER.storey, UPPER.window.hi / UPPER.storey, 0.9, 0.4, { bay: UPPER.bay, half: UPPER.window.half });
    M.concrete = SIMPLE_SKINS.plain([0.3, 0.3, 0.29], 0.9);
    M.glass = SIMPLE_SKINS.glow([0.12, 0.16, 0.18], 0.1, 0.8, [1.0, 0.84, 0.62], 0.4);
    return M;
  }
  const U = uv().x, V = uv().y;
  const dist = positionView.z.negate();
  const near = float(1).sub(smoothstep(140, 420, dist)), fine = float(1).sub(smoothstep(20, 70, dist));
  const noise = (s) => mx_noise_float(positionWorld.mul(s)).mul(0.5).add(0.5);
  const glow = smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow), late = smoothstep(1.3, 1.55, cityUniforms.uInteriorGlow);
  // A window lit or dark, re-rolled every 5–15 min (shops and offices: few of them late)
  const lit = (cx, cy, seed, share) => {
    const h = hash(cx.mul(157.1).add(cy.mul(311.7)).add(seed));
    const slot = time.div(mix(float(300), float(900), hash(h.mul(977)))).add(hash(h.mul(531))).floor();
    const on = step(hash(h.mul(1.3e4).floor().add(slot.mul(7)).add(seed)), mix(float(share), float(share * 0.25), late));
    return mix(vec3(1.0, 0.8, 0.56), vec3(0.85, 0.9, 1.0), step(0.6, hash(h.mul(733)))).mul(on).mul(hash(h.mul(41)).mul(0.4).add(0.8));
  };
  const half = attribute('aHalf', 'float'); // half the wall's length; 0: a closed wall
  const box = (x, y, hw, lo, hi, e = 0.012) => smoothstep(hw + e, hw - e, abs(x)).mul(smoothstep(lo - e, lo + e, y)).mul(smoothstep(hi + e, hi - e, y));
  const glassC = mix(vec3(0.025, 0.032, 0.04), vec3(0.08, 0.1, 0.115), noise(0.07));
  // A wall: its colour, a window per bay and floor (`G`: the floors' grid, `v0` its first floor's foot in v, `only`:
  // windows below (−1) or over (+1) the square), the frame's colour
  const wall = ({ colour, G, v0, only, frame, seed, share, tiles }) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    const vv = V.sub(v0);
    const bay = floor(U.div(G.bay).add(0.5)), bu = U.sub(bay.mul(G.bay));
    const storey = floor(vv.div(G.storey)), fv = vv.sub(storey.mul(G.storey));
    const zone = only < 0 ? step(V, SQ - 0.05).mul(step(0.2, V)) : step(SQ, V);
    const open = step(abs(bay.mul(G.bay)).add(G.window.half + 0.35), half).mul(zone);
    const win = box(bu, fv, G.window.half, G.window.lo, G.window.hi).mul(open);
    const pane = box(bu, fv, G.window.half - 0.07, G.window.lo + 0.07, G.window.hi - 0.07).mul(float(1).sub(smoothstep(0.035, 0.02, abs(bu)).mul(near))).mul(open);
    const weather = noise(0.3).mul(0.6).add(mx_noise_float(positionWorld.mul(vec3(1.5, 0.12, 1.5))).mul(0.2).add(0.2));
    let c = mix(colour[0], colour[1], weather);
    if (tiles) {
      // ceramic panels: a joint every `tiles` metres both ways, each panel a shade of its own
      const tu = floor(U.div(tiles)), tv = floor(V.div(tiles));
      const joint = smoothstep(0.47, 0.49, abs(fract(U.div(tiles)).sub(0.5))).max(smoothstep(0.47, 0.49, abs(fract(V.div(tiles)).sub(0.5)))).mul(fine.mul(0.8).add(0.2));
      c = c.mul(hash(tu.mul(17.3).add(tv.mul(41.9))).mul(0.07).add(0.965)).mul(float(1).sub(joint.mul(0.28)));
    }
    c = mix(c, frame, win);
    c = mix(c, glassC, pane);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.85), float(0.1), pane);
    m.metalnessNode = pane.mul(0.55);
    m.emissiveNode = lit(bay, storey.add(half.mul(3.3)), seed, share).mul(pane).mul(glow.mul(1.1));
    return m;
  };
  // The ceramic panels: shop windows in the floors under the square, closed over it
  M.panel = wall({ colour: [vec3(0.31, 0.315, 0.31), vec3(0.37, 0.375, 0.37)], G: SHOP, v0: 0, only: -1, frame: vec3(0.16, 0.165, 0.17), seed: 3, share: 0.55, tiles: 1.25 });
  // The post office's plaster: a window per bay over the square
  M.render = wall({ colour: [vec3(0.4, 0.32, 0.19), vec3(0.47, 0.39, 0.25)], G: UPPER, v0: SQ, only: 1, frame: vec3(0.55, 0.55, 0.53), seed: 7, share: 0.35 });
  // The tower's concrete: the formwork's lines every 0.5 m
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const boards = smoothstep(0.42, 0.5, abs(fract(V.div(0.5)).sub(0.5))).mul(fine);
    const weather = noise(0.35).mul(0.6).add(mx_noise_float(positionWorld.mul(vec3(1.6, 0.12, 1.6))).mul(0.2).add(0.2));
    m.colorNode = mix(vec3(0.27, 0.27, 0.26), vec3(0.34, 0.34, 0.325), weather).mul(float(1).sub(boards.mul(0.12)));
    M.concrete = m;
  }
  // The glazing (the offices, the bands, the Coop's tower): slim posts every 1.5 m, a rail at every floor, lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.85 });
    const mu = abs(fract(U.div(1.5)).sub(0.5)), mv = abs(fract(V.div(UPPER.storey)).sub(0.5));
    const frame = smoothstep(0.46, 0.475, mu).max(smoothstep(0.455, 0.47, mv)).mul(near.mul(0.85).add(0.15));
    const cellU = floor(U.div(1.5)), cellV = floor(V.div(UPPER.storey)), paneId = hash(cellU.mul(13.1).add(cellV.mul(7.3)));
    m.colorNode = mix(mix(vec3(0.09, 0.13, 0.15), vec3(0.18, 0.24, 0.27), paneId), vec3(0.32, 0.33, 0.34), frame);
    m.roughnessNode = mix(float(0.08), float(0.5), frame);
    m.metalnessNode = mix(float(0.85), float(0.4), frame);
    m.emissiveNode = lit(cellU, cellV, 11, 0.5).mul(float(1).sub(frame)).mul(glow.mul(0.6));
    M.glass = m;
  }
  return M;
}

// --- The lettering, the round windows: one canvas atlas ---------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  coop: [0, 0, 330, 132],
  restaurant: [0, 140, 330, 150],
  porthole: [340, 0, 256, 256],
  roundWindow: [606, 0, 256, 256],
  band: [0, 300, 1024, 93], // (the front block's 23.9 m × 2.2 m)
  shopping: [0, 400, 640, 88],
  entrance: [650, 400, 360, 110],
  garage: [872, 0, 150, 140],
  noEntry: [872, 150, 100, 100]
};
const ORANGE = '#f0661e', GREY = '#6c7074';

function atlasTexture() {
  const c = document.createElement('canvas');
  [c.width, c.height] = ATLAS_SIZE;
  const g = c.getContext('2d');
  const cell = (key, draw) => { const [x, y, w, h] = ATLAS[key]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h); g.restore(); };
  const disc = (x, y, r, colour) => { g.fillStyle = colour; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  // (the shop's name in round, heavy lower case, as plain lettering)
  const coop = (x, y, size) => {
    g.fillStyle = ORANGE; g.font = `bold ${size}px "Arial Rounded MT Bold", "Helvetica Rounded", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText('coop', x, y);
  };
  cell('coop', (w, h) => coop(w / 2, h * 0.74, 118));
  cell('restaurant', (w, h) => {
    coop(w * 0.36, 78, 96);
    g.fillStyle = GREY; g.font = '600 44px Helvetica, Arial, sans-serif'; g.textAlign = 'left';
    g.fillText('restaurant', w * 0.36 - 30, 130);
  });
  // A round window: the light grey frame standing out, the dark pane, a white cross of mullions
  cell('porthole', (w, h) => {
    const r = w / 2;
    disc(r, r, r - 2, '#c9cccd');
    disc(r, r, r - 30, '#8d9295');
    disc(r, r, r - 40, '#2c3439');
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'rgba(190, 215, 230, 0.35)'); grad.addColorStop(0.5, 'rgba(190, 215, 230, 0.05)'); grad.addColorStop(1, 'rgba(190, 215, 230, 0.2)');
    disc(r, r, r - 40, grad);
    g.fillStyle = '#d7dadb'; g.fillRect(r - 5, 40, 10, w - 80); g.fillRect(40, r - 5, w - 80, 10);
  });
  // The post office's round window under its roof: a white frame, four lights
  cell('roundWindow', (w, h) => {
    const r = w / 2;
    disc(r, r, r - 2, '#e8e6e0');
    disc(r, r, r - 22, '#1f262c');
    g.fillStyle = '#e8e6e0'; g.fillRect(r - 6, 22, 12, w - 44); g.fillRect(22, r - 6, w - 44, 12);
  });
  // The yellow band along the post office's front, its name at the north end
  cell('band', (w, h) => {
    g.fillStyle = '#f2c500'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111111'; g.font = 'bold 60px Helvetica, Arial, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText('DIE POST', w - 60, h / 2 + 4);
  });
  cell('shopping', (w, h) => {
    g.fillStyle = '#2b2f33'; g.font = '600 70px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const text = 'SHOPPING', gap = 14, widths = [...text].map((ch) => g.measureText(ch).width + gap);
    let x = (w - (widths.reduce((a, b) => a + b, 0) - gap)) / 2;
    g.textAlign = 'left';
    [...text].forEach((ch, i) => { g.fillText(ch, x, h / 2 + 4); x += widths[i]; });
  });
  // The Coop's entrance under the square: the dark opening, glass doors, the lit shop inside
  cell('entrance', (w, h) => {
    g.fillStyle = '#15191c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a4248'; for (let x = 20; x < w; x += 80) g.fillRect(x, 30, 64, h - 30);
    g.fillStyle = 'rgba(255, 230, 190, 0.18)'; g.fillRect(0, 40, w, h - 40);
    g.fillStyle = '#9aa1a6'; for (let x = 16; x < w; x += 80) g.fillRect(x, 30, 5, h - 30);
    g.fillRect(0, 26, w, 6);
  });
  // The car park's way out: darkness, the ramp's ceiling lamps, the barrier's yellow and black
  cell('garage', (w, h) => {
    g.fillStyle = '#0b0d0f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c2125'; g.fillRect(0, h * 0.55, w, h * 0.45);
    g.fillStyle = 'rgba(255, 245, 220, 0.8)'; for (const [x, y, r] of [[w / 2, 22, 7], [w / 2, 44, 5], [w / 2, 60, 3.5]]) { g.fillRect(x - r * 3, y, r * 6, r * 0.8); }
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#111111' : '#f2c500'; g.fillRect(10 + i * ((w - 20) / 8), h * 0.62, (w - 20) / 8, 8); }
  });
  cell('noEntry', (w, h) => {
    disc(w / 2, h / 2, w / 2 - 2, '#ffffff');
    disc(w / 2, h / 2, w / 2 - 7, '#d0202a');
    g.fillStyle = '#ffffff'; g.fillRect(w * 0.2, h / 2 - 8, w * 0.6, 16);
  });
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

// The colours of the trim (linear)
const C = {
  panel: [0.34, 0.345, 0.34], steel: [0.3, 0.31, 0.32], dark: [0.04, 0.045, 0.05], white: [0.75, 0.75, 0.73],
  canopy: [0.42, 0.55, 0.55], canopyUnder: [0.55, 0.6, 0.6], concrete: [0.3, 0.3, 0.29], dome: [0.55, 0.56, 0.55],
  railing: [0.36, 0.38, 0.39], frame: [0.8, 0.8, 0.78], yellow: [0.86, 0.6, 0.0]
};

// --- Geometry ------------------------------------------------------------------------------------------------------------
const P3 = (F, s, y, out = 0) => { const [x, z] = onWall(F, s, out); return [x, y, z]; };

/** A quad turned to face `dir` ([x, y, z]); uvs in the order of the points */
function facing(B, bucket, pts, uvs, dir, opt) {
  const [a, b, , d] = pts;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] >= 0) B.quad(bucket, ...pts, uvs, opt);
  else B.quad(bucket, pts[0], pts[3], pts[2], pts[1], [uvs[0], uvs[3], uvs[2], uvs[1]], opt);
}

/** A wall's stretch from s0 to s1 (tops t0, t1) cut at the square: the panels under it, the part's own skin over it */
function wallPiece(B, F, s0, s1, t0, t1, mid, halfLen, upper, upperHalf = halfLen) {
  const v = (y) => y - Y0;
  const band = (bucket, y0a, y0b, y1a, y1b) => {
    if (Math.max(y1a - y0a, y1b - y0b) < 0.01) return;
    B.quad(bucket, P3(F, s0, y0a), P3(F, s1, y0b), P3(F, s1, y1b), P3(F, s0, y1a),
      [[s0 - mid, v(y0a)], [s1 - mid, v(y0b)], [s1 - mid, v(y1b)], [s0 - mid, v(y1a)]], { half: bucket === 'glass' ? 0 : y0a < SQUARE ? halfLen : upperHalf });
  };
  band('panel', BASE, BASE, Math.min(SQUARE, t0), Math.min(SQUARE, t1));
  if (Math.max(t0, t1) > SQUARE) band(upper, SQUARE, SQUARE, Math.max(SQUARE, t0), Math.max(SQUARE, t1));
}

// A volume: its walls (pieces of 1.5 m under the curved roof, so that their tops follow it), its roof
function buildPart(B, part) {
  const ring = outwardRing(part.ring);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const windows = part.windows !== false && F.len >= 4;
    const upperClosed = part.closedEast && F.n[0] > 0.8;
    const n = part.roof === 'curved' ? Math.max(1, Math.ceil(F.len / 1.5)) : 1;
    const top = (s) => { const [x, z] = onWall(F, s); return partTop(part, x, z); };
    for (let k = 0; k < n; k++) {
      const s0 = (F.len * k) / n, s1 = (F.len * (k + 1)) / n;
      wallPiece(B, F, s0, s1, top(s0), top(s1), F.len / 2, windows ? F.len / 2 : 0, upperBucket(part, F), windows && !upperClosed ? F.len / 2 : 0);
    }
    // (a slim coping along the roof's edge)
    if (part.roof !== 'curved') B.box('trim', F, 0, F.len, -0.25, 0.06, part.top - 0.05, part.top + 0.22, C.steel, { top: 'roof' });
  }
  if (part.roof === 'curved') return buildCurvedRoof(B);
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = [ring[i], ring[j], ring[k]].map(([x, z]) => [x, part.top, z]);
    const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
    const t = up ? p : [p[0], p[2], p[1]];
    B.tri('roof', t[0], t[1], t[2], t.map((q) => [q[0], q[2]]));
  }
}

// The post office's roof: a grid over its block (its north front to its back), each point at the profile's height
function buildCurvedRoof(B) {
  const q = [[-690.4, 392.7], [-661.2, 412.2], [-673.7, 432.6], [-704.5, 415.5]]; // round the block, the north front first
  const NS = 10, NT = 18;
  const at = (s, t) => {
    const x = (1 - t) * ((1 - s) * q[0][0] + s * q[1][0]) + t * ((1 - s) * q[3][0] + s * q[2][0]);
    const z = (1 - t) * ((1 - s) * q[0][1] + s * q[1][1]) + t * ((1 - s) * q[3][1] + s * q[2][1]);
    return [x, postRoofY(x, z), z];
  };
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NT; j++) {
      const p = [at(i / NS, j / NT), at((i + 1) / NS, j / NT), at((i + 1) / NS, (j + 1) / NT), at(i / NS, (j + 1) / NT)];
      facing(B, 'roof', p, p.map((r) => [r[0], r[2]]), [0, 1, 0]);
    }
  }
  // the eaves along the north front: a white band
  const F = wallFrame(q[1], q[0]);
  B.box('trim', F, 0, F.len, -0.1, 0.35, postRoofY(...onWall(F, 1)) - 0.25, postRoofY(...onWall(F, 1)) + 0.12, C.white, { top: 'roof' });
}

/** A round wall (centre, radius, y0 → y1, angles a0 → a1, n pieces), each piece's bucket from `pick(direction)` */
function roundWall(B, cx, cz, r, y0, y1, a0, a1, n, pick, colour = null) {
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n, tm = (t0 + t1) / 2;
    const p = (t, y) => [cx + Math.cos(t) * r, y, cz + Math.sin(t) * r];
    const bucket = pick(Math.cos(tm), Math.sin(tm));
    const u0 = r * t0, u1 = r * t1;
    facing(B, bucket, [p(t0, y0), p(t1, y0), p(t1, y1), p(t0, y1)], [[u0, y0 - Y0], [u1, y0 - Y0], [u1, y1 - Y0], [u0, y1 - Y0]], [Math.cos(tm), 0, Math.sin(tm)], colour ? { colour } : {});
  }
}
/** A flat ring (or a disc: r0 = 0) at y, facing up or down */
function annulus(B, bucket, cx, cz, r0, r1, y, n, up = true, colour = null) {
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
    const p = (t, r) => [cx + Math.cos(t) * r, y, cz + Math.sin(t) * r];
    const pts = [p(t0, r1), p(t1, r1), p(t1, Math.max(r0, 0.001)), p(t0, Math.max(r0, 0.001))];
    facing(B, bucket, pts, pts.map((q) => [q[0], q[2]]), [0, up ? 1 : -1, 0], colour ? { colour } : {});
  }
}

// The tower on the square: the shaft with its slit of windows, the ledge, the drum with its band of windows, the dome
function buildTower(B) {
  const T = POST_COOP.tower, N = 32, A = Math.PI * 2;
  const all = (b) => () => b;
  roundWall(B, T.x, T.z, T.shaft, BASE, T.ledge, 0, A, N, all('concrete'));
  // the slit facing the forecourt (east)
  const slit = 0.22;
  roundWall(B, T.x, T.z, T.shaft + 0.02, T.slot[0], T.slot[1], -slit, slit, 3, all('glass'));
  // the ledge under the drum
  annulus(B, 'trim', T.x, T.z, T.shaft, T.drum + 0.1, T.ledge, N, false, C.concrete);
  roundWall(B, T.x, T.z, T.drum + 0.1, T.ledge, T.ledge + 0.3, 0, A, N, all('trim'), C.concrete);
  annulus(B, 'trim', T.x, T.z, T.drum, T.drum + 0.1, T.ledge + 0.3, N, true, C.concrete);
  roundWall(B, T.x, T.z, T.drum, T.ledge + 0.3, T.band[0], 0, A, N, all('concrete'));
  roundWall(B, T.x, T.z, T.drum - 0.15, T.band[0], T.band[1], 0, A, N, all('glass'));
  roundWall(B, T.x, T.z, T.drum, T.band[1], T.top, 0, A, N, all('concrete'));
  // the band's sill and lintel (the glass sits back)
  annulus(B, 'trim', T.x, T.z, T.drum - 0.15, T.drum, T.band[0], N, true, C.concrete);
  annulus(B, 'trim', T.x, T.z, T.drum - 0.15, T.drum, T.band[1], N, false, C.concrete);
  // the roof, the railing round it, the lantern and the dome
  annulus(B, 'roof', T.x, T.z, T.lantern[0], T.drum, T.top, N);
  roundWall(B, T.x, T.z, T.drum - 0.05, T.top, T.top + 1.0, 0, A, N, all('trim'), C.railing);
  roundWall(B, T.x, T.z, T.lantern[0], T.top, T.lantern[1], 0, A, N, all('trim'), C.dark);
  const rings = 6;
  for (let k = 0; k < rings; k++) {
    const f0 = k / rings, f1 = (k + 1) / rings;
    const r = (f) => T.lantern[0] * Math.cos(f * Math.PI / 2), y = (f) => T.lantern[1] + (T.tip - T.lantern[1]) * Math.sin(f * Math.PI / 2);
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * A, t1 = ((i + 1) / N) * A, tm = (t0 + t1) / 2;
      const p = (t, f) => [T.x + Math.cos(t) * r(f), y(f), T.z + Math.sin(t) * r(f)];
      const pts = [p(t0, f0), p(t1, f0), p(t1, f1), p(t0, f1)];
      const ribs = i % 4 === 0 ? C.steel : C.dome;
      facing(B, 'trim', pts, [[0, 0], [1, 0], [1, 1], [0, 1]], [Math.cos(tm), 0.6, Math.sin(tm)], { colour: ribs });
    }
  }
}

// The shopfront under the square: the panels with their shop windows, the Coop's entrance and sign, the square's
// slab over it with the railing; its back wall towards the square, closed
function buildShopfront(B) {
  const S = POST_COOP.shopfront, F = shopfrontFrame(), len = F.len;
  const top = SQUARE + 0.05;
  const [e0, e1] = S.entrance;
  // the front: panels with windows either side of the entrance, the entrance's opening
  const piece = (s0, s1, windows) => {
    const mid = (s0 + s1) / 2, h = windows ? (s1 - s0) / 2 : 0;
    B.quad('panel', P3(F, s0, BASE), P3(F, s1, BASE), P3(F, s1, top), P3(F, s0, top), [[s0 - mid, BASE - Y0], [s1 - mid, BASE - Y0], [s1 - mid, top - Y0], [s0 - mid, top - Y0]], { half: h });
  };
  const [g0, g1] = S.garage;
  piece(0, g0, true);
  piece(g0, g1, false);
  piece(g1, e0, true);
  piece(e0, e1, false);
  piece(e1, len, true);
  // the car park's way out: a dark opening in a steel frame, the no-entry sign beside it
  B.box('trim', F, g0 - 0.3, g1 + 0.3, 0, 0.14, Y0 - 0.2, S.garageTop + 0.4, C.steel);
  B.decal(F, g0, g1, 0.15, Y0, S.garageTop, 'garage');
  B.decal(F, g1 + 0.45, g1 + 1.05, 0.05, Y0 + 2.2, Y0 + 2.8, 'noEntry');
  B.box('trim', F, e0 - 0.25, e1 + 0.25, 0, 0.12, Y0 - 0.2, S.entranceTop + 0.3, C.steel);
  B.decal(F, e0, e1, 0.13, Y0, S.entranceTop, 'entrance');
  const cw = 2.6, ch = cw * ATLAS.coop[3] / ATLAS.coop[2], cm = (e0 + e1) / 2;
  B.decal(F, cm - cw / 2, cm + cw / 2, 0.05, S.entranceTop + 0.55, S.entranceTop + 0.55 + ch, 'coop');
  // the back towards the square, the slab, the railing along the edge
  const back = { a: onWall(F, len, -S.depth), u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]], len };
  B.quad('panel', P3(back, 0, BASE), P3(back, len, BASE), P3(back, len, top), P3(back, 0, top), [[-len / 2, BASE - Y0], [len / 2, BASE - Y0], [len / 2, top - Y0], [-len / 2, top - Y0]], { half: 0 });
  // its ends (where they stand out of the two houses)
  for (const [s, dir] of [[0, -1], [len, 1]]) {
    const E = { a: onWall(F, s, dir < 0 ? -S.depth : 0), u: [-F.n[0] * dir, -F.n[1] * dir], n: [F.u[0] * dir, F.u[1] * dir] };
    const h = S.depth / 2;
    B.quad('panel', P3(E, 0, BASE), P3(E, S.depth, BASE), P3(E, S.depth, top), P3(E, 0, top), [[-h, BASE - Y0], [h, BASE - Y0], [h, top - Y0], [-h, top - Y0]], { half: 0 });
  }
  const slab = [P3(F, 0, top, -S.depth), P3(F, len, top, -S.depth), P3(F, len, top), P3(F, 0, top)];
  facing(B, 'roof', slab, slab.map((q) => [q[0], q[2]]), [0, 1, 0]);
  B.box('trim', F, 0, len, -0.3, 0.1, top - 0.4, top + 0.05, C.panel, { top: 'roof' });
  B.box('trim', F, 0, len, -0.12, -0.04, top + 0.05, top + 1.05, C.railing);
}

// The Coop's corner tower: panels, glazed on the north-west, the canopy round it, the two small windows, the lettering
function buildCoopTower(B) {
  const T = POST_COOP.coopTower, N = 36, A = Math.PI * 2;
  const pick = (dx, dz) => (inCoopGlass(dx, dz) ? 'glass' : 'panel');
  roundWall(B, T.x, T.z, T.r, T.base, T.top, 0, A, N, pick);
  annulus(B, 'roof', T.x, T.z, 0, T.r, T.top, N);
  roundWall(B, T.x, T.z, T.r + 0.04, T.top - 0.2, T.top + 0.25, 0, A, N, () => 'trim', C.steel);
  // the glazing's posts
  for (let i = 0; i < N; i++) {
    const t = (i / N) * A, dx = Math.cos(t), dz = Math.sin(t);
    if (!inCoopGlass(dx, dz)) continue;
    const F = { a: [T.x + dx * T.r, T.z + dz * T.r], u: [-dz, dx], n: [dx, dz] };
    B.box('trim', F, -0.06, 0.06, 0, 0.12, T.base, T.top - 0.2, C.steel);
  }
  // two small windows in white frames on its west side
  for (const t of [Math.PI * 0.94, Math.PI * 0.8]) {
    const dx = Math.cos(t), dz = Math.sin(t), F = { a: [T.x + dx * T.r, T.z + dz * T.r], u: [-dz, dx], n: [dx, dz] };
    B.box('trim', F, -0.48, 0.48, -0.05, 0.07, T.top - 3.4, T.top - 2.45, C.frame);
    B.box('trim', F, -0.36, 0.36, -0.05, 0.09, T.top - 3.3, T.top - 2.55, C.dark);
  }
  // the canopy: glass on a steel edge, round the tower and along the offices' north wall
  const Cn = T.canopy, outer = Cn.edge, inner = canopyInner();
  const y0 = Cn.y, y1 = Cn.y + Cn.thick;
  for (let i = 0; i + 1 < outer.length; i++) {
    const o0 = outer[i], o1 = outer[i + 1], n0 = inner[i], n1 = inner[i + 1];
    const top = [[o0[0], y1, o0[1]], [o1[0], y1, o1[1]], [n1[0], y1, n1[1]], [n0[0], y1, n0[1]]];
    facing(B, 'trim', top, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], { colour: C.canopy });
    const under = top.map(([x, , z]) => [x, y0, z]);
    facing(B, 'trim', under, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, -1, 0], { colour: C.canopyUnder });
    const ex = o1[1] - o0[1], ez = -(o1[0] - o0[0]); // (either normal; turned outwards from the tower below)
    const away = (o0[0] + o1[0]) / 2 - T.x, awayZ = (o0[1] + o1[1]) / 2 - T.z;
    const sgn = ex * away + ez * awayZ >= 0 ? 1 : -1;
    facing(B, 'trim', [[o0[0], y0, o0[1]], [o1[0], y0, o1[1]], [o1[0], y1, o1[1]], [o0[0], y1, o0[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], [ex * sgn, 0, ez * sgn], { colour: C.steel });
  }
  // the lettering standing on the tower's roof, towards the Bahnhofstrasse (and the same from behind)
  const dir = [-0.92, -0.4], l = Math.hypot(...dir), n = [dir[0] / l, dir[1] / l], u = [n[1], -n[0]];
  const w = 5.2, h = w * ATLAS.coop[3] / ATLAS.coop[2], y = T.top + 0.45;
  const S = { a: [T.x - u[0] * w / 2, T.z - u[1] * w / 2], u, n };
  B.box('trim', S, 0.2, w - 0.2, -0.05, 0.05, T.top, y + 0.1, C.steel);
  B.decal(S, 0, w, 0.07, y, y + h, 'coop');
  const Sb = { a: [T.x + u[0] * w / 2, T.z + u[1] * w / 2], u: [-u[0], -u[1]], n: [-n[0], -n[1]] };
  B.decal(Sb, 0, w, 0.07, y, y + h, 'coop');
}

// The Coop's west wall: the round windows, the restaurant's lettering, the lettering on the roof
function buildCoopWest(B) {
  const W = POST_COOP.coopWest, F = wallFrame(W.a, W.b);
  const ground = (s) => groundHeight(...onWall(F, s, 1.0));
  for (const [s, d] of W.portholes) {
    const cy = ground(s) + (d > 1.5 ? 2.7 : 3.0);
    B.box('trim', F, s - d * 0.42, s + d * 0.42, 0, 0.06, cy - d * 0.42, cy + d * 0.42, C.panel);
    B.decal(F, s - d / 2, s + d / 2, 0.08, cy - d / 2, cy + d / 2, 'porthole');
  }
  const [r0, r1] = W.restaurant, rh = (r1 - r0) * ATLAS.restaurant[3] / ATLAS.restaurant[2], ry = ground((r0 + r1) / 2) + 3.0;
  B.decal(F, r0, r1, 0.05, ry, ry + rh, 'restaurant');
  const [s0, s1] = W.sign, sh = (s1 - s0) * ATLAS.coop[3] / ATLAS.coop[2], top = POST_COOP.parts.find((p) => p.id === 'coop-hall').top;
  B.box('trim', F, s0 + 0.2, s1 - 0.2, -1.55, -1.45, top, top + 0.55, C.steel);
  B.decal(F, s0, s1, -1.42, top + 0.45, top + 0.45 + sh, 'coop');
  const back = { a: onWall(F, s1, -1.58), u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]] };
  B.decal(back, 0, s1 - s0, 0, top + 0.45, top + 0.45 + sh, 'coop');
}

// The post office's east front on the forecourt: the yellow band, the lettering, the round window
function buildPostEast(B) {
  const E = POST_COOP.postEast, R = wallFrame(E.a, E.joint), F = wallFrame(E.joint, E.b);
  // the band along both blocks' walls, the name on the front block's
  for (const W of [R, F]) B.box('trim', W, -0.06, W.len + 0.06, 0, 0.08, E.band[0], E.band[1], C.yellow);
  B.decal(F, 0.02, F.len - 0.02, 0.09, E.band[0] + 0.02, E.band[1] - 0.02, 'band');
  // the lettering on a light board under the band
  const [s0, s1] = E.shopping, sh = (s1 - s0) * ATLAS.shopping[3] / ATLAS.shopping[2], y1 = E.band[0] - 0.03;
  B.box('trim', R, s0 - 0.2, s1 + 0.2, 0, 0.05, y1 - sh - 0.08, y1, C.white);
  B.decal(R, s0, s1, 0.06, y1 - sh - 0.04, y1 - 0.04, 'shopping');
  const [ws, wy, wd] = E.window;
  B.decal(R, ws - wd / 2, ws + wd / 2, 0.05, wy - wd / 2, wy + wd / 2, 'roundWindow');
}

/**
 * Builds the post and Coop block into `scene`. Returns { group, colliders } (colliders at world heights: baseY set, so
 * liftColliders leaves them be; the walls of OpenStreetMap's footprints are js/buildings.js').
 */
export function buildPostCoop(scene) {
  const root = new THREE.Group();
  root.name = 'Post & Coop Davos Platz';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['panel', 'render'], name: 'Post & Coop' }), M = materials();
  for (const part of POST_COOP.parts) buildPart(B, part);
  buildShopfront(B);
  buildTower(B);
  buildCoopTower(B);
  buildCoopWest(B);
  buildPostEast(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  // Colliders: the shopfront under the square and the tower on it (OpenStreetMap has neither)
  const colliders = [];
  const wall = (a, b, y0, y1, thick) => {
    const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2, hz = thick / 2;
    const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } });
  };
  const F = shopfrontFrame();
  wall(onWall(F, 0, -0.5), onWall(F, F.len, -0.5), BASE, SQUARE + 1.05, 1.0);
  const T = POST_COOP.tower, r = T.drum * 0.8;
  wall([T.x - r, T.z], [T.x + r, T.z], BASE, T.tip, 2 * r);
  return { group: root, colliders };
}
