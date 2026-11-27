import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, length, mix, smoothstep, step, uv, vec2, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { WEBER, annexRing, facesBack, frontOn, groundOutlines, onWall, outwardRing, wallFrame, wallStretches } from './weber-data.js';

export { WEBER };

// The house of the Bäckerei-Konditorei Weber rebuilt by hand (js/weber-data.js), standing in for its swissBUILDINGS3D
// volumes, which the streamed tiles drew as white blocks with the town houses' windows: the surveyed volumes, the block
// and the wing along the Promenade in pink plaster with white quoins, a painted frieze under the block's dark eave, a
// window in a white surround with a brown frame in every bay of every floor (drawn by the wall's material from its uv:
// metres along the wall from its middle, metres up the floors' grid), the crescent moon, the baker, "Weber" and the cup
// painted on the block's front towards the Parsenn, the bakery's and the café's shop fronts on the Promenade with their
// lettering, the restaurant's low annex, the back in white with arched windows and balconies on white posts, the low
// block's wall against the neighbour's AVIA garage closed. Six meshes: two plasters, the roofs, the glazing, the trim
// (one vertex-coloured mesh) and the decals (one canvas atlas).

excludeBuildings(WEBER.exclude);
// (the player's walls on the surveyed volumes at the ground, not on OSM's outline: js/landmarks.js; the annex's are
// returned by buildWeber)
SURVEYED_FOOTPRINTS.set(WEBER.osm, groundOutlines());
// (the house's own lettering instead of js/shops.js' generic signs for the bakery and the café)
for (const id of WEBER.shops) SHOP_EXCLUSIONS.add(id);

const { storey: STOREY, bay: BAY, win: WIN } = WEBER;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED, the walls with arched windows v + ARCHED (the grid is the same)
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
const ARCHED = 1000 * STOREY;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PINK = [0.52, 0.33, 0.34], WHITE = [0.58, 0.575, 0.55], FRAME = [0.1, 0.06, 0.035], SURROUND = [0.62, 0.61, 0.58];
function plasterMaterial(rgb, glow, near, fine) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  const V = uv().y;
  const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half + 0.12 });
  // (arched: the window's head a half circle, its surround following it)
  const arched = step(UP + 500 * STOREY, V);
  const archY = WIN.hi - WIN.half;
  const archMask = (hw) => {
    const r = length(vec2(bu, fv.sub(archY).max(0)));
    return mix(rect(hw, WIN.lo + WIN.half - hw, WIN.hi + hw - WIN.half), smoothstep(hw + 0.012, hw - 0.012, r).mul(step(WIN.lo + WIN.half - hw, fv)), arched);
  };
  const surround = archMask(WIN.half + 0.12).mul(open);
  const win = archMask(WIN.half).mul(open);
  const bars = smoothstep(0.04, 0.025, abs(bu)).max(smoothstep(0.035, 0.02, abs(fv.sub(WIN.lo + 1.0))).mul(float(1).sub(arched)));
  const pane = archMask(WIN.half - 0.07).mul(float(1).sub(bars.mul(near))).mul(open);
  const sill = rect(WIN.half + 0.16, WIN.lo - 0.1, WIN.lo).mul(open).mul(near);
  const wall = mix(vec3(...rgb).mul(0.94), vec3(...rgb).mul(1.05), worldNoise(0.3))
    .mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.04)));
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
  const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.85, id)));
  const span = WIN.hi - WIN.lo - 0.14;
  const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(span)), fv).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.07, 0.085, 0.095), worldNoise(0.07));
  let c = mix(wall, vec3(...SURROUND), surround.max(sill));
  c = mix(c, vec3(...FRAME), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.52, 0.48, 0.42), curtain);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.92), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (flats over the shops: windows lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 41, { share: 0.4, late: 0.1, tone: twoTones([1.0, 0.74, 0.46], [0.9, 0.88, 0.82], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.05));
  return m;
}
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.24, 0.235, 0.23], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.pink = SIMPLE_SKINS.windowed([0.48, 0.32, 0.33], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35);
    M.white = SIMPLE_SKINS.windowed([0.52, 0.515, 0.49], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35);
    M.glass = SIMPLE_SKINS.glow([0.07, 0.08, 0.085], 0.12, 0.7, [1.0, 0.82, 0.58], 0.25);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(60, 200), fine = fade(8, 28);
  const glow = nightGlow();
  M.pink = plasterMaterial(PINK, glow, near, fine);
  M.white = plasterMaterial(WHITE, glow, near, fine);
  // The shop windows and the annex's glazing: brown mullions every 1.4 m, a transom 1.9 m up; at night the shops are
  // shut: a faint glow behind most panes, the counter's lights behind a few
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.4)).sub(0.5));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.045, 0.025, abs(V.sub(1.9)))).max(smoothstep(0.06, 0.04, V)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.4)).mul(13.1).add(step(1.9, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.05, 0.06, 0.065), vec3(0.12, 0.13, 0.13), paneId), vec3(...FRAME), frame);
    m.roughnessNode = mix(float(0.1), float(0.65), frame);
    m.metalnessNode = mix(float(0.8), float(0.1), frame);
    m.emissiveNode = vec3(1.0, 0.84, 0.6).mul(float(1).sub(frame)).mul(mix(float(0.03), float(0.28), step(0.75, paneId))).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The painting, the frieze and the lettering: one canvas atlas --------------------------------------------------------
const ATLAS_SIZE = [1024, 768];
export const ATLAS = {
  mural: [0, 0, 320, 712], // the painting on the front towards the Parsenn (5.25 × 11.7 m)
  frieze: [328, 0, 512, 58], // a stretch of the frieze under the eave (FRIEZE m × its height)
  bakery: [328, 66, 696, 92], // the bakery's fascia
  cafe: [328, 166, 696, 92], // the café's fascia
  annex: [328, 266, 512, 96] // "Restaurant" on the annex' fascia
};
const SCRIPT = 'italic 600 {px}px "Brush Script MT", "Apple Chancery", "Lucida Calligraphy", Georgia, serif';
const script = (px) => SCRIPT.replace('{px}', px);
// the fascias' measures (m): the frieze's stretch, the lettering's height on each fascia
const cellAspect = (k) => ATLAS[k][2] / ATLAS[k][3];
export const FRIEZE = (WEBER.frieze.y1 - WEBER.frieze.y0) * cellAspect('frieze');

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // The painting: a crescent moon over the upper floors, the baker in his white cap beside "Weber" under it, the cup
  cell('mural', (w, h) => {
    const ink = '#7a3a44', cream = '#f6ead8';
    // the moon (a C opening to the east), its outline
    const mx = w * 0.56, my = h * 0.27, R = w * 0.4;
    g.beginPath(); g.arc(mx, my, R, 0, Math.PI * 2); g.arc(mx + R * 0.42, my - R * 0.08, R * 0.82, 0, Math.PI * 2, true);
    g.fillStyle = cream; g.fill('evenodd');
    g.lineWidth = 7; g.strokeStyle = ink;
    g.beginPath(); g.arc(mx, my, R, 0, Math.PI * 2); g.stroke();
    g.save(); g.beginPath(); g.arc(mx, my, R, 0, Math.PI * 2); g.clip();
    g.beginPath(); g.arc(mx + R * 0.42, my - R * 0.08, R * 0.82, 0, Math.PI * 2); g.stroke(); g.restore();
    // (its closed eye on the inner edge)
    g.lineWidth = 5; g.beginPath(); g.arc(mx - R * 0.48, my - R * 0.1, R * 0.08, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
    // the baker: a white cap, a round face, his apron, a tray of bread
    const bx = w * 0.24, by = h * 0.585;
    g.fillStyle = cream; g.strokeStyle = ink; g.lineWidth = 4;
    g.beginPath(); g.ellipse(bx, by - 46, 22, 16, 0, 0, Math.PI * 2); g.fill(); g.stroke(); // the cap
    g.beginPath(); g.arc(bx, by - 18, 15, 0, Math.PI * 2); g.fill(); g.stroke(); // the face
    g.beginPath(); g.moveTo(bx - 22, by + 54); g.lineTo(bx - 16, by + 2); g.lineTo(bx + 16, by + 2); g.lineTo(bx + 22, by + 54); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(bx + 14, by + 12); g.lineTo(bx + 44, by + 4); g.stroke(); // the arm with the tray
    g.fillStyle = '#c88a4a'; g.beginPath(); g.ellipse(bx + 50, by + 1, 16, 6, -0.2, 0, Math.PI * 2); g.fill(); g.stroke();
    // "Weber" in script
    g.fillStyle = ink; g.font = script(86);
    g.fillText('Weber', w * 0.66, h * 0.6, w * 0.62);
    // the cup on its saucer, steam over it
    const cx = w * 0.6, cy = h * 0.79;
    g.fillStyle = cream; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx - 34, cy - 24); g.lineTo(cx + 34, cy - 24); g.quadraticCurveTo(cx + 30, cy + 22, cx, cy + 24); g.quadraticCurveTo(cx - 30, cy + 22, cx - 34, cy - 24); g.fill(); g.stroke();
    g.beginPath(); g.arc(cx + 40, cy - 6, 11, -0.5 * Math.PI, 0.5 * Math.PI); g.stroke();
    g.beginPath(); g.ellipse(cx, cy + 28, 52, 9, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    for (const dx of [-14, 4, 20]) { g.beginPath(); g.moveTo(cx + dx, cy - 34); g.bezierCurveTo(cx + dx - 10, cy - 52, cx + dx + 10, cy - 62, cx + dx, cy - 80); g.stroke(); }
  });
  // The frieze: a running scroll between two lines, white on the pink (alpha elsewhere)
  cell('frieze', (w, h) => {
    g.strokeStyle = '#f1e6e2'; g.fillStyle = '#f1e6e2';
    g.fillRect(0, 2, w, 5); g.fillRect(0, h - 7, w, 5);
    g.lineWidth = 5;
    const n = 8, step = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * step;
      g.beginPath(); g.moveTo(x, h / 2); g.bezierCurveTo(x + step * 0.25, 10, x + step * 0.5, 10, x + step * 0.5, h / 2);
      g.bezierCurveTo(x + step * 0.5, h - 10, x + step * 0.75, h - 10, x + step, h / 2); g.stroke();
      g.beginPath(); g.arc(x + step * 0.25, h / 2 + 6, 5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x + step * 0.75, h / 2 - 6, 5, 0, Math.PI * 2); g.fill();
    }
  });
  // The fascias: cream lettering on the bakery's brown, as its signs have it (js/shops-data.js)
  const fascia = (key, small, big) => cell(key, (w, h) => {
    g.fillStyle = '#5b2a1c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a66b'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#f3e3c3';
    g.font = '600 30px Georgia, "Times New Roman", serif';
    g.textAlign = 'left'; g.fillText(small, 26, h / 2 + 2, w * 0.56);
    g.textAlign = 'right'; g.font = script(70); g.fillText(big, w - 30, h / 2 + 4, w * 0.36);
    g.textAlign = 'center';
  });
  fascia('bakery', 'BÄCKEREI · KONDITOREI', 'Weber');
  fascia('cafe', 'CAFÉ · RESTAURANT', 'Weber');
  cell('annex', (w, h) => {
    g.fillStyle = '#e8c21e'; g.font = 'italic 700 74px Georgia, "Times New Roman", serif';
    g.fillText('Restaurant', w / 2, h / 2 + 4, w - 24);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  quoin: [0.62, 0.61, 0.58], eave: [0.075, 0.05, 0.035], soffit: [0.11, 0.075, 0.05], frame: FRAME, door: [0.13, 0.075, 0.04],
  slab: [0.56, 0.555, 0.53], rail: [0.1, 0.065, 0.04], post: [0.6, 0.595, 0.57], canopy: [0.5, 0.5, 0.49], red: [0.45, 0.07, 0.07],
  pink: PINK, step: [0.3, 0.3, 0.29], coping: [0.42, 0.41, 0.39]
};

// The highest ground along a wall, half a metre out of it
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.5));
  for (let i = 0; i <= n; i++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * i) / n, 0.5)));
  return hi;
}

// A strip of a wall from y0 to y1, s0 to s1 along it, into a plaster: windowed (its bays laid out from the strip's
// middle) or closed
function plaster(B, bucket, F, line, s0, s1, y0, y1, windows, arched = false) {
  if (y1 - y0 < 0.01 || s1 - s0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const h = (s1 - s0) / 2, open = windows && s1 - s0 >= 2.4;
  const v = (y) => y - line + UP - (open ? 0 : CLOSED) + (open && arched ? ARCHED : 0);
  B.quad(bucket, P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[-h, v(y0)], [h, v(y0)], [h, v(y1)], [-h, v(y1)]], { half: open ? h : 0 });
}
// A strip of glazing from y0 to y1, s0 to s1 along a wall (uv: metres along it, metres up from its foot)
function glass(B, F, s0, s1, y0, y1, o = 0) {
  const P = (s, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  B.quad('glass', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[s0, 0], [s1, 0], [s1, y1 - y0], [s0, y1 - y0]]);
}

// The foot of the lowest floor whose windows clear the ground along a wall (`hi`): the floors' feet lie a STOREY apart
// under the part's line
const firstFloor = (line, hi) => line - Math.floor((line - hi + WIN.lo) / STOREY) * STOREY;

// A volume: its walls from the base up to its roof (a shop front on the ground floor where there is one, the floors'
// windows over the highest ground along the wall, the stretch of the painting closed), the roof over them
function buildPart(B, p) {
  const ring = outwardRing(p.ring), base = WEBER.base;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const back = p.id === 'block' && facesBack(F);
    const bucket = back ? 'white' : p.skin;
    const front = frontOn(a, b);
    const hi = groundAlong(F) + 0.25;
    if (front) {
      buildFront(B, p, F, front, bucket, hi);
      continue;
    }
    for (const st of wallStretches(a, b)) {
      const from = st.windows ? Math.min(firstFloor(p.line, hi), p.line) : p.line;
      plaster(B, bucket, F, p.line, st.from, st.to, base, from, false);
      plaster(B, bucket, F, p.line, st.from, st.to, from, p.line, st.windows, back);
      plaster(B, bucket, F, p.line, st.from, st.to, p.line, p.top, false);
    }
  }
  flatRoof(B, ring, p.top);
  // (a coping round the low parts' roofs)
  if (p.id !== 'block') for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len > 0.3) B.box('trim', F, 0, F.len, -0.25, 0.04, p.top - 0.02, p.top + 0.12, C.coping, { top: 'roof' });
  }
}

// A shop front: a plinth, the glazing between two piers up to y1, the fascia with its lettering, the floors over it;
// the bakery's door, a canopy where the front has one
function buildFront(B, p, F, front, bucket, hi) {
  const base = WEBER.base, line = p.line, pier = 0.5;
  // (the ground floor's top: the lowest floor's foot at least 3 m over the ground)
  const top = line - Math.floor((line - hi - 3.0) / STOREY) * STOREY;
  const foot = Math.max(hi + 0.1, groundAlong(F, pier, F.len - pier) + (front.plinth ?? 0.35));
  plaster(B, bucket, F, line, 0, F.len, base, foot, false);
  plaster(B, bucket, F, line, 0, pier, foot, top, false);
  plaster(B, bucket, F, line, F.len - pier, F.len, foot, top, false);
  plaster(B, bucket, F, line, pier, F.len - pier, front.y1, top, false);
  glass(B, F, pier, F.len - pier, foot, front.y1);
  plaster(B, bucket, F, line, 0, F.len, top, line, true);
  plaster(B, bucket, F, line, 0, F.len, line, p.top, false);
  if (front.fascia) {
    const [f0, f1] = front.fascia, h = f1 - f0, w = h * cellAspect(front.name);
    const m = F.len / 2;
    B.box('trim', F, pier, F.len - pier, 0, 0.08, f0 - 0.04, f1 + 0.04, C.door);
    B.decal(F, m - w / 2, m + w / 2, 0.1, f0, f1, front.name);
  }
  if (front.door !== undefined) {
    // the door: a brown frame and a leaf with a glass panel, flush with the glazing's plane
    const s = front.door, d = front.doorHalf, y1 = Math.min(front.y1, foot + 2.35);
    B.box('trim', F, s - d - 0.08, s + d + 0.08, 0, 0.05, foot, y1 + 0.08, C.door);
    B.box('trim', F, s - d + 0.08, s + d - 0.08, 0.05, 0.07, foot + 0.9, y1 - 0.15, [0.04, 0.045, 0.05]);
  }
  if (front.canopy) {
    const K = front.canopy;
    B.box('trim', F, 0, F.len, 0, K.out, K.y - 0.22, K.y, C.canopy, { top: 'roof' });
    B.box('trim', F, 0, F.len, K.out, K.out + 0.05, K.y - 0.32, K.y + 0.04, C.red);
  }
}

// The block's dressings: white quoins at its outer corners, the frieze and the dark eave round its roof
function buildBlockTrim(B) {
  const p = WEBER.parts.find((q) => q.id === 'block'), ring = outwardRing(p.ring), n = ring.length;
  const frames = ring.map((a, i) => wallFrame(a, ring[(i + 1) % n]));
  const E = WEBER.eave, Fz = WEBER.frieze;
  for (let i = 0; i < n; i++) {
    const F = frames[i], prev = frames[(i + n - 1) % n], next = frames[(i + 1) % n];
    if (F.len < 0.3) continue;
    // (a corner is outer where the next wall turns away from this one's outside)
    const outerStart = prev.u[0] * F.n[0] + prev.u[1] * F.n[1] > 0.3;
    const outerEnd = next.u[0] * F.n[0] + next.u[1] * F.n[1] < -0.3;
    const pink = !facesBack(F);
    // the eave: a dark board round the roof, out over the walls, reaching past the outer corners
    const s0 = outerStart ? -E.out : 0, s1 = F.len + (outerEnd ? E.out : 0);
    B.box('trim', F, s0, s1, 0, E.out, E.y0, E.y1, C.eave, { top: 'roof' });
    B.box('trim', F, s0, s1, E.out - 0.04, E.out, E.y0 - 0.12, E.y0, C.soffit);
    if (!pink || F.len < 2) continue;
    // the frieze, in stretches as long as the cell's, filling the wall
    const k = Math.max(1, Math.round(F.len / FRIEZE)), w = F.len / k;
    for (let j = 0; j < k; j++) B.decal(F, j * w, (j + 1) * w, 0.03, Fz.y0, Fz.y1, 'frieze');
    // the quoins: blocks long and short in turn, up to the frieze
    const y0 = groundAlong(F) - 0.2;
    for (const [at, dir] of [[outerStart, 1], [outerEnd, -1]]) {
      if (!at) continue;
      let j = 0;
      for (let y = y0; y < Fz.y0 - 0.1; y += 0.56, j++) {
        const wide = j % 2 ? 0.32 : 0.55, sA = dir > 0 ? 0 : F.len - wide, sB = dir > 0 ? wide : F.len;
        B.box('trim', F, sA, sB, 0, 0.04, y, Math.min(y + 0.5, Fz.y0 - 0.1), C.quoin);
      }
    }
  }
}

// The painting on the front towards the Parsenn
function buildMural(B) {
  const M = WEBER.mural, F = wallFrame(M.a, M.b);
  B.decal(F, M.s0, M.s1, 0.03, M.y0, M.y1, 'mural');
}

// The balconies at the back: a white slab and a dark timber rail at each upper floor, white posts up to the eave
function buildBalconies(B) {
  const Bc = WEBER.balconies, F = wallFrame(Bc.a, Bc.b);
  for (const y of Bc.floors) {
    B.box('trim', F, Bc.from, Bc.to, 0, Bc.out, y - 0.18, y, C.slab);
    B.box('trim', F, Bc.from, Bc.to, Bc.out - 0.06, Bc.out, y + Bc.rail - 0.08, y + Bc.rail, C.rail);
    B.box('trim', F, Bc.from, Bc.to, Bc.out - 0.05, Bc.out - 0.02, y + 0.1, y + Bc.rail - 0.08, C.rail);
    for (const s of [Bc.from, Bc.to]) B.box('trim', F, s - 0.03, s + 0.03, 0, Bc.out, y, y + Bc.rail, C.rail);
  }
  for (let i = 0; i <= Bc.posts; i++) {
    const s = Bc.from + 0.1 + ((Bc.to - Bc.from - 0.2) * i) / Bc.posts;
    B.box('trim', F, s - 0.1, s + 0.1, Bc.out - 0.2, Bc.out, Bc.floors[0] - 0.18, WEBER.eave.y0, C.post);
  }
}

// The restaurant's annex before the block's front towards the Parsenn: pink walls with big windows, "Restaurant" on
// its fascia, its door; returns its walls (for the colliders) and its heights
function buildAnnex(B) {
  const A = WEBER.annex, ring = outwardRing(annexRing()), M = WEBER.mural;
  let y0 = -Infinity, low = Infinity;
  for (const [x, z] of ring) { const y = groundHeight(x, z); y0 = Math.max(y0, y); low = Math.min(low, y); }
  const top = y0 + A.height, block = wallFrame(M.a, M.b), walls = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    // (its back stands against the block)
    const o = (q) => (q[0] - block.a[0]) * block.n[0] + (q[1] - block.a[1]) * block.n[1];
    if (Math.abs(o(a)) < 0.05 && Math.abs(o(b)) < 0.05) continue;
    walls.push([a, b]);
    const isFront = Math.abs(F.u[0] * block.u[0] + F.u[1] * block.u[1]) > 0.9;
    plaster(B, 'pink', F, 0, 0, F.len, WEBER.base, y0 + 0.55, false);
    plaster(B, 'pink', F, 0, 0, 0.35, y0 + 0.55, top, false);
    plaster(B, 'pink', F, 0, F.len - 0.35, F.len, y0 + 0.55, top, false);
    plaster(B, 'pink', F, 0, 0.35, F.len - 0.35, y0 + 2.5, top, false);
    if (isFront) {
      const d = A.door;
      glass(B, F, 0.35, d - 0.6, y0 + 0.55, y0 + 2.5);
      glass(B, F, d + 0.6, F.len - 0.35, y0 + 0.55, y0 + 2.5);
      plaster(B, 'pink', F, 0, d - 0.6, d + 0.6, y0 + 0.55, y0 + 0.62, false);
      B.box('trim', F, d - 0.6, d + 0.6, 0, 0.05, y0 + 0.05, y0 + 2.5, C.door);
      B.box('trim', F, d - 0.45, d + 0.45, 0.05, 0.07, y0 + 0.9, y0 + 2.3, [0.04, 0.045, 0.05]);
      B.box('trim', F, d - 0.9, d + 0.9, 0, 0.6, low - 0.6, y0 + 0.05, C.step);
      const h = 0.62, w = h * cellAspect('annex');
      B.decal(F, (F.len - w) / 2, (F.len + w) / 2, 0.02, y0 + 2.58, y0 + 2.58 + h, 'annex');
    } else glass(B, F, 0.35, F.len - 0.35, y0 + 0.55, y0 + 2.5);
    B.box('trim', F, -0.05, F.len + 0.05, -0.1, 0.12, top - 0.05, top + 0.15, C.coping, { top: 'roof' });
  }
  flatRoof(B, ring, top);
  return { walls, y0: low - 0.5, top: top + 0.15 };
}

/**
 * Builds the house of the Bäckerei Weber into `scene`. Returns { group, colliders }: the walls of the restaurant's
 * annex (it stands out of the surveyed outlines, whose walls are js/buildings.js'), at world heights (baseY set, so
 * liftColliders leaves them be).
 */
export function buildWeber(scene) {
  const root = new THREE.Group();
  root.name = 'Weber';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['pink', 'white'], name: 'Weber' }), M = materials();
  for (const p of WEBER.parts) buildPart(B, p);
  buildBlockTrim(B);
  buildMural(B);
  buildBalconies(B);
  const annex = buildAnnex(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  const colliders = [];
  for (const [a, b] of annex.walls) {
    const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2, hz = 0.2;
    const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: annex.y0, minY: annex.y0, maxY: annex.top, obb: { cx, cz, hx, hz, cs, sn } });
  }
  return { group: root, colliders };
}
