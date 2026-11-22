import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, mx_noise_float, normalWorld, positionView, positionWorld, smoothstep, step, time, uv, vec3 } from 'three/tsl';
import { winter } from './season.js';
import { cityUniforms } from './tsl-materials.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, decalMaterial } from './spital.js';
import { onWall, outwardRing, wallFrame } from './spital-data.js';
import { RAETIA, RAETIA_ENTRANCE, annexFrame, dormerFrame, frontFrame, gableFrame, toLocal } from './raetia-center-data.js';

export { RAETIA, RAETIA_ENTRANCE };

// The Rätia Center on the Promenade rebuilt by hand (js/raetia-center-data.js), standing in for its swissBUILDINGS3D
// volume, which the streamed tiles drew as a white box with the town houses' windows under the aerial photograph: the
// surveyed roof in standing-seam zinc with four tall dormers framed in copper, the pavilion on the Promenade with its
// glazed ground floor under a band of copper, on it the lettering and the ibex, dark sheet walls beside it, the
// tenants' board and a row of posters on the south part, flags at the north end; the blocks behind in plaster with a
// window per bay and floor (drawn by the walls' material from their uv). Six meshes: the walls, the sheet metal (one
// vertex-coloured mesh with the seams drawn from its uv: zinc, copper, dark sheet), the gravel roofs, the glass, the
// trim and the lettering and boards (one canvas atlas). The house's businesses carry no boards of their own
// (js/shops.js): they are on the tenants' board.

excludeBuildings([RAETIA.exclude]);
for (const osm of RAETIA.shops) SHOP_EXCLUSIONS.add(osm);

const { bay: BAY, storey: STOREY, window: WIN } = RAETIA;
// v of a plaster wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the block's roof at 20 of
// them, so that v is positive down to the base); closed walls carry v − CLOSED
const UP = 20 * STOREY, CLOSED = 300 * STOREY;
const SEAM = 0.6; // the sheets' width between two standing seams
const PLASTER = [0.33, 0.3, 0.24];

// The colours of the sheet metal and the trim (linear)
const C = {
  zinc: [0.36, 0.38, 0.4], copper: [0.45, 0.185, 0.075], sheet: [0.04, 0.037, 0.035], concrete: [0.3, 0.3, 0.29], steel: [0.045, 0.047, 0.05],
  white: [0.8, 0.8, 0.78], post: [0.6, 0.61, 0.62], blue: [0.03, 0.14, 0.55], yellow: [0.85, 0.62, 0.05]
};

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(QUALITY.simpleMaterials ? C.zinc : [0.3, 0.295, 0.28], 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night; the zinc roof is the roofs' mesh there)
    M.wall = SIMPLE_SKINS.windowed(PLASTER, STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4);
    M.sheet = SIMPLE_SKINS.plain([1, 1, 1], 0.5, 0.5, { vertexColors: true });
    M.glass = SIMPLE_SKINS.glow([0.16, 0.2, 0.22], 0.08, 0.85, [1.0, 0.86, 0.66], 0.12);
    return M;
  }
  const U = uv().x, V = uv().y;
  const dist = positionView.z.negate();
  const near = float(1).sub(smoothstep(140, 420, dist)), fine = float(1).sub(smoothstep(30, 110, dist));
  const noise = (s) => mx_noise_float(positionWorld.mul(s)).mul(0.5).add(0.5);
  const glow = smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow), late = smoothstep(1.3, 1.55, cityUniforms.uInteriorGlow);
  // The plaster of the blocks behind: a window in a light frame per bay and floor, a few lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 });
    const half = attribute('aHalf', 'float'); // half the wall's length; 0: a closed wall
    const v = V.add(step(V, -1).mul(CLOSED));
    const bay = floor(U.div(BAY).add(0.5)), bu = U.sub(bay.mul(BAY));
    const storey = floor(v.div(STOREY)), fv = v.sub(storey.mul(STOREY));
    const open = step(abs(bay.mul(BAY)).add(WIN.half + 0.4), half);
    const rect = (hw, lo, hi, e = 0.012) => smoothstep(hw + e, hw - e, abs(bu)).mul(smoothstep(lo - e, lo + e, fv)).mul(smoothstep(hi + e, hi - e, fv));
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const pane = rect(WIN.half - 0.08, WIN.lo + 0.08, WIN.hi - 0.08).mul(float(1).sub(smoothstep(0.04, 0.025, abs(bu)).mul(near))).mul(open);
    const weather = noise(0.4).mul(0.65).add(mx_noise_float(positionWorld.mul(vec3(1.4, 0.1, 1.4))).mul(0.18).add(0.18));
    const plaster = mix(vec3(0.29, 0.265, 0.21), vec3(0.37, 0.34, 0.27), weather);
    const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.085, 0.1), noise(0.07));
    const h = hash(bay.mul(157.1).add(storey.add(half.mul(3.3)).mul(311.7)).add(3));
    const slot = time.div(mix(float(300), float(900), hash(h.mul(977)))).add(hash(h.mul(531))).floor();
    const on = step(hash(h.mul(1.3e4).floor().add(slot.mul(7)).add(3)), mix(float(0.4), float(0.12), late));
    let c = mix(plaster, vec3(0.62, 0.62, 0.6), win);
    c = mix(c, glassC, pane);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.93), float(0.12), pane);
    m.metalnessNode = pane.mul(0.5);
    m.emissiveNode = mix(vec3(1.0, 0.7, 0.4), vec3(0.85, 0.88, 1.0), step(0.6, hash(h.mul(733)))).mul(on).mul(pane).mul(glow.mul(1.05));
    M.wall = m;
  }
  // The sheet metal: the vertex's colour (zinc, copper, dark sheet), a standing seam every 60 cm across u, each sheet a
  // shade of its own; white in winter where it faces up
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.48, metalness: 0.55 });
    const colour = attribute('color', 'vec3');
    const sheet = floor(U.div(SEAM)), su = abs(fract(U.div(SEAM)).sub(0.5));
    const seam = smoothstep(0.455, 0.48, su).mul(fine);
    const shade = hash(sheet.mul(17.3).add(floor(V.div(4)).mul(5.1))).mul(0.16).add(0.92);
    const stain = noise(0.5).mul(0.2).add(0.9);
    const c = colour.mul(shade).mul(stain).mul(float(1).sub(seam.mul(0.4)));
    const snow = smoothstep(0.35, 0.6, normalWorld.y).mul(winter);
    m.colorNode = mix(c, vec3(0.84, 0.86, 0.9), snow);
    m.roughnessNode = mix(float(0.48), float(0.9), snow);
    m.metalnessNode = mix(float(0.55), float(0), snow);
    M.sheet = m;
  }
  // The shop fronts' glass and the dormers': dark posts every 1.4 m, the panes mirroring the street; lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.85 });
    const mu = abs(fract(U.div(1.4)).sub(0.5));
    const frame = smoothstep(0.47, 0.482, mu).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.4)).mul(13.1));
    m.colorNode = mix(mix(vec3(0.07, 0.1, 0.115), vec3(0.14, 0.19, 0.21), paneId), vec3(0.03, 0.031, 0.033), frame);
    m.roughnessNode = mix(float(0.08), float(0.6), frame);
    m.metalnessNode = mix(float(0.85), float(0.3), frame);
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(float(1).sub(frame)).mul(paneId.mul(0.3).add(0.7)).mul(glow.mul(0.07));
    M.glass = m;
  }
  return M;
}

// --- The lettering, the boards and the posters: one canvas atlas -----------------------------------------------------------
const ATLAS_SIZE = [1024, 840];
export const ATLAS = {
  name: [0, 0, 1024, 230], // the lettering and the ibex on the copper band
  tenants: [0, 240, 660, 225],
  posters: [0, 475, 800, 200],
  ghost: [0, 685, 560, 150] // the lettering once more, pale on the glass
};
// The tenants, as the game's shop signs letter them: [text, its colour, the ground, weight and family]
const TENANTS = [
  ['DECATHLON', '#ffffff', '#0082c3', '900', 'Helvetica, Arial, sans-serif'], ['Mc PaperLand', '#b3261e', '#f6d21c', '800', 'Helvetica, Arial, sans-serif'],
  ['MIGROS OUTLET', '#ff6600', '#ffffff', '900', 'Helvetica, Arial, sans-serif'], ['DROPA', '#ffffff', '#c8102e', '800', 'Helvetica, Arial, sans-serif'],
  ['Schneider\'s · Swiss Boutique', '#5b2a1c', '#f3e3c3', '700', 'Georgia, "Times New Roman", serif'], ['Swisscom', '#ffffff', '#001155', '700', 'Helvetica, Arial, sans-serif']
];
const BLUE = '#1f4fc4', YELLOW = '#f2c21a';

function atlasTexture() {
  const c = document.createElement('canvas');
  [c.width, c.height] = ATLAS_SIZE;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const cell = (key, draw) => { const [x, y, w, h] = ATLAS[key]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h); g.restore(); };
  const rect = (x, y, w, h, colour) => { g.fillStyle = colour; g.fillRect(x, y, w, h); };
  const stroke = (pts, width, colour) => { g.strokeStyle = colour; g.lineWidth = width; g.beginPath(); pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.stroke(); };
  const relief = (on) => { g.shadowColor = on ? 'rgba(0, 0, 0, 0.5)' : 'transparent'; g.shadowBlur = on ? 4 : 0; g.shadowOffsetX = on ? 3 : 0; g.shadowOffsetY = on ? 4 : 0; };
  // An ibex in its leap, drawn freely: the body, the neck and the head, the long ringed horn, the legs flung out; in
  // a crescent open towards the leap
  const ibex = (cx, cy, s, colour) => {
    g.save(); g.translate(cx, cy); g.scale(s, s);
    g.strokeStyle = colour; g.lineWidth = 0.2; g.beginPath(); g.arc(0, 0, 0.88, Math.PI * 0.32, Math.PI * 1.62); g.stroke(); // the crescent
    g.fillStyle = colour;
    g.save(); g.rotate(-0.42); g.beginPath(); g.ellipse(0.08, 0.05, 0.56, 0.22, 0, 0, Math.PI * 2); g.fill(); g.restore(); // the body
    g.beginPath(); g.moveTo(0.38, -0.3); g.lineTo(0.66, -0.66); g.lineTo(0.98, -0.52); g.lineTo(0.94, -0.42); g.lineTo(0.72, -0.44); g.lineTo(0.62, -0.1); g.closePath(); g.fill(); // neck and head
    g.lineWidth = 0.12; g.beginPath(); g.moveTo(0.68, -0.66); g.quadraticCurveTo(0.42, -1.12, -0.12, -0.78); g.stroke(); // the horn
    g.lineWidth = 0.1;
    stroke([[0.5, -0.12], [0.86, -0.1], [1.06, 0.12]], 0.1, colour); // the forelegs
    stroke([[0.42, 0.0], [0.72, 0.14], [0.84, 0.38]], 0.1, colour);
    stroke([[-0.36, 0.28], [-0.7, 0.42], [-0.78, 0.76]], 0.11, colour); // the hind legs
    stroke([[-0.22, 0.34], [-0.44, 0.6], [-0.36, 0.9]], 0.11, colour);
    stroke([[-0.48, 0.2], [-0.62, 0.1]], 0.07, colour); // the tail
    g.restore();
  };
  const lettering = (w, h, top, bottom, blue, yellow, withIbex) => {
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const spaced = (text, x, y, gap) => { for (const ch of text) { g.fillText(ch, x, y); x += g.measureText(ch).width + gap; } return x; };
    g.font = `900 ${Math.round(h * 0.56)}px "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif`;
    g.fillStyle = blue;
    const end = spaced('RÄTIA', w * 0.03, top, h * 0.035);
    g.font = `900 ${Math.round(h * 0.34)}px "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif`;
    g.fillStyle = yellow;
    spaced('CENTER', w * 0.03, bottom, h * 0.085);
    if (withIbex) ibex(Math.min(w - h * 0.56, end + h * 0.62), h * 0.5, h * 0.42, blue);
  };
  cell('name', (w, h) => { relief(true); lettering(w, h, h * 0.55, h * 0.93, BLUE, YELLOW, true); relief(false); });
  cell('ghost', (w, h) => lettering(w, h, h * 0.55, h * 0.93, 'rgba(235, 238, 240, 0.6)', 'rgba(235, 238, 240, 0.6)', true));
  // The tenants' board: two columns of three plates
  cell('tenants', (w, h) => {
    rect(0, 0, w, h, '#e9e9e6');
    TENANTS.forEach(([text, colour, ground, weight, family], i) => {
      const cw = w / 2, ch = h / 3, x = (i % 2) * cw, y = Math.floor(i / 2) * ch;
      rect(x + 3, y + 3, cw - 6, ch - 6, ground);
      let px = 40;
      g.font = `${weight} ${px}px ${family}`;
      const tw = g.measureText(text).width;
      if (tw > cw - 40) { px = Math.floor(px * (cw - 40) / tw); g.font = `${weight} ${px}px ${family}`; }
      g.fillStyle = colour; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, x + cw / 2, y + ch / 2 + 2);
    });
  });
  // The posters: five of them, the house's name over a few lines
  cell('posters', (w, h) => {
    const grounds = ['#eef0f2', '#f6e27a', '#f6e27a', '#eef0f2', '#bcd7ee'], pw = 138, gap = (w - 5 * pw) / 4;
    grounds.forEach((ground, i) => {
      const x = i * (pw + gap);
      rect(x, 0, pw, h, '#b8b9ba');
      rect(x + 4, 4, pw - 8, h - 8, ground);
      g.fillStyle = BLUE; g.font = '900 24px "Arial Black", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('RÄTIA', x + pw / 2, 26);
      rect(x + 22, 42, pw - 44, 5, YELLOW);
      for (let k = 0; k < 6; k++) rect(x + 16, 66 + k * 18, (pw - 32) * (0.55 + 0.45 * ((i * 7 + k * 5) % 4) / 3), 6, 'rgba(40, 50, 70, 0.55)');
    });
  });
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// A volume: its walls from the base up to its roof (a flat one, or the one through its outline's heights), the roof
function buildPart(B, part, zinc) {
  const ring = outwardRing(part.ring), y0 = RAETIA.base;
  const top = (p) => p[2] ?? part.top;
  const high = Math.max(...ring.map(top));
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const F = wallFrame(a, b), ya = top(a), yb = top(b);
    if (F.len < 0.05) continue;
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    if (part.walls === 'sheet') {
      B.quad('sheet', P(0, y0), P(F.len, y0), P(F.len, yb), P(0, ya), [[0, 0], [F.len, 0], [F.len, yb - y0], [0, ya - y0]], { colour: C.sheet });
      continue;
    }
    const windows = part.walls === 'windows' && F.len >= 4, h = F.len / 2;
    const v = (y) => y - high + UP - (windows ? 0 : CLOSED);
    B.quad('wall', P(0, y0), P(F.len, y0), P(F.len, yb), P(0, ya), [[-h, v(y0)], [h, v(y0)], [h, v(yb)], [-h, v(ya)]], { half: windows ? h : 0 });
  }
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  const metal = part.roof === 'zinc' && zinc === 'sheet';
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = [ring[i], ring[j], ring[k]].map((q) => [q[0], top(q), q[1]]);
    // (facing up whichever way the triangulation turned)
    const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
    const t = up ? p : [p[0], p[2], p[1]];
    // (the zinc's seams run up the slope: u along the eaves)
    B.tri(metal ? 'sheet' : 'roof', t[0], t[1], t[2], t.map((q) => (metal ? toLocal(q[0], q[2]) : [q[0], q[2]])), { colour: metal ? C.zinc : null });
  }
}

// The dormers: a copper box out of the slope, its front a dark pane
function buildDormers(B) {
  for (const d of RAETIA.dormers) {
    const { F, foot, top, back } = dormerFrame(d);
    B.box('sheet', F, 0, d.w, -back - 0.3, 0, foot - 0.5, top, C.copper);
    B.box('sheet', F, -0.06, d.w + 0.06, -0.5, 0.1, top, top + 0.1, C.copper); // the front's drip
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    const mid = [0.7, 0.5]; // (the middle of a pane: no post)
    B.quad('glass', P(0.2, foot + 0.25), P(d.w - 0.2, foot + 0.25), P(d.w - 0.2, top - 0.2), P(0.2, top - 0.2), [mid, mid, mid, mid]);
  }
}

// The front on the Promenade: the pavilion with its glass and its bands, the south part under the eaves, the boards
function buildFront(B) {
  const A = RAETIA.annex, F = annexFrame(), L = F.len, g0 = RAETIA.ground;
  const sill = g0 + 0.15, head = g0 + A.glass, roof = A.top, top = roof + A.parapet;
  B.box('trim', F, -0.05, L + 0.05, -A.depth, 0.06, RAETIA.base, sill, C.concrete);
  B.box('glass', F, 0.1, L - 0.1, -A.depth, 0, sill, head);
  // the band over the glass, standing out over it: dark sheet at the north end, copper from there on; its parapet
  for (const [s0, s1, colour] of [[-0.12, A.dark, C.sheet], [A.dark, L + 0.12, C.copper]]) {
    B.box('sheet', F, s0, s1, -A.depth, A.out, head, roof, colour, { top: 'roof' });
    B.box('sheet', F, s0, s1, A.out - 0.25, A.out, roof, top, colour);
  }
  B.box('sheet', F, -0.12, 0.13, -A.depth + 1.4, A.out - 0.25, roof, top, C.sheet);
  B.box('sheet', F, L - 0.13, L + 0.12, -A.depth + 1.4, A.out - 0.25, roof, top, C.copper);
  // the lettering on the copper, and once more on the glass beside the doors
  const nameH = A.name.w * ATLAS.name[3] / ATLAS.name[2];
  B.decal(F, A.name.from, A.name.from + A.name.w, A.out + 0.02, head + 0.07, head + 0.07 + nameH, 'name');
  const ghostH = A.ghost.w * ATLAS.ghost[3] / ATLAS.ghost[2];
  B.decal(F, A.ghost.from, A.ghost.from + A.ghost.w, 0.03, g0 + 1.25, g0 + 1.25 + ghostH, 'ghost');
  // the doors: their frames before the glass, a threshold
  const d0 = A.doors[0], d1 = A.doors.at(-1);
  for (const s of A.doors) B.box('trim', F, s - 0.05, s + 0.05, 0, 0.09, sill, g0 + 2.4, C.steel);
  B.box('trim', F, d0 - 0.05, d1 + 0.05, 0, 0.09, g0 + 2.4, g0 + 2.52, C.steel);
  B.box('trim', F, d0 - 0.3, d1 + 0.3, 0.06, 0.6, g0 - 0.5, g0 + 0.13, C.concrete);
  // the flags before the dark band
  A.flags.forEach((s, i) => {
    B.box('trim', F, s - 0.04, s + 0.04, 0.7, 0.78, g0 - 0.5, g0 + 7, C.post);
    B.box('trim', F, s + 0.05, s + 0.6, 0.73, 0.75, g0 + 5.1, g0 + 6.9, C.white);
    B.box('trim', F, s + 0.05, s + 0.6, 0.72, 0.76, g0 + 5.7, g0 + 6.3, [C.blue, C.yellow, C.blue][i]);
  });

  // the south part: dark sheet up to a parapet with a copper edge, glazed beside the pavilion, a concrete plinth
  const W = RAETIA.front, G = frontFrame();
  B.box('sheet', G, 0, G.len, -0.3, 0.03, RAETIA.base, W.top, C.sheet, { top: 'roof' });
  B.box('sheet', G, -0.02, G.len + 0.06, -0.34, 0.08, W.top, W.top + 0.12, C.copper);
  B.box('trim', G, W.glassTo, G.len + 0.04, 0.03, 0.12, RAETIA.base, g0 + 0.7, C.concrete);
  const P = (s, y) => { const [x, z] = onWall(G, s, 0.05); return [x, y, z]; };
  B.quad('glass', P(0.05, sill), P(W.glassTo, sill), P(W.glassTo, head), P(0.05, head), [[0, 0], [W.glassTo, 0], [W.glassTo, head - sill], [0, head - sill]]);
  B.box('trim', G, 0, W.glassTo + 0.08, 0.03, 0.1, g0 - 0.3, sill, C.concrete);
  B.box('trim', G, W.glassTo, W.glassTo + 0.08, 0.03, 0.1, sill, head, C.steel);
  const board = (frame, b) => {
    B.box('trim', frame, b.from - 0.08, b.from + b.w + 0.08, 0.03, 0.09, g0 + b.y - 0.08, g0 + b.y + b.h + 0.08, C.white);
    B.decal(frame, b.from, b.from + b.w, 0.1, g0 + b.y, g0 + b.y + b.h, 'tenants');
  };
  board(G, W.board);
  B.decal(G, W.posters.from, W.posters.from + W.posters.w, 0.05, g0 + W.posters.y, g0 + W.posters.y + W.posters.h, 'posters');
  // the tenants' board on the gable towards the Postplatz
  board(gableFrame(), RAETIA.gable.board);
}

/**
 * Builds the Rätia Center into `scene`. Returns { group, colliders } (no colliders of its own: nothing of it stands
 * outside the walls of OpenStreetMap's footprint, which are js/buildings.js').
 */
export function buildRaetiaCenter(scene) {
  const root = new THREE.Group();
  root.name = 'Rätia Center';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'wall', name: 'Rätia Center' }), M = materials();
  const zinc = QUALITY.simpleMaterials ? 'roof' : 'sheet';
  for (const part of RAETIA.parts) buildPart(B, part, zinc);
  buildDormers(B);
  buildFront(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
