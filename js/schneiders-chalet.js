import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, rectMask, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { CHALET, backRing, doorAt, groundOutlines, isCafe, loggia, onWall, orielRing, outwardRing, part, sAt, vFrame, wallStretches, windowsFrom, windowsTo } from './schneiders-chalet-data.js';

export { CHALET };

// The house before Schneider's on the Promenade rebuilt by hand (js/schneiders-chalet-data.js), standing in for its
// swissBUILDINGS3D batch, which the streamed tiles drew as white blocks: the tea-room's dark timber front on the
// Promenade with "TEA-ROOM" over its glazing under a flat canopy; over it, set back, the winter garden's glazing with
// its awning towards the lane; the terrace round it on stone walls down the slope with its railing and planters; the
// two storeys of verandas against Schneider's south-west wall, their lattice rails, posts and red shutters, the oriel at
// their north-west end with its ornamented panels, the zigzag band under the eaves; the two plain annexes east of it.
// The windows of the plastered walls are drawn by the wall's material from its uv (metres along the wall from its
// middle, metres up Schneider's floors' grid). Six meshes: the walls, the stone, the roofs, the glass, the trim (one
// vertex-coloured mesh) and the decoration (one canvas atlas).

excludeBuildings(CHALET.exclude);
// (the tea-room's generic sign: this house draws its own front)
SHOP_EXCLUSIONS.add(CHALET.shop);
// (the player's walls on the surveyed volumes, not on OSM's outline, which leaves out the terrace, the verandas and the
// annexes: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(CHALET.osm, groundOutlines());

const S = CHALET, STOREY = S.storey, BAY = S.bay, WIN = S.win, FOOT = S.foot, SH = S.shutter, VE = S.veranda;
// v of a wall: metres up the floors' grid, the first floor's foot at 40 storeys; the verandas' walls (red shutters by
// their windows) 100 storeys higher; closed walls carry v − CLOSED
const UP = 40 * STOREY, SHUT = 100 * STOREY, CLOSED = 300 * STOREY;
// (the stone walls' concrete foot: v − CONCRETE)
const CONCRETE = 1000;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.46, 0.41, 0.3], FRAME = [0.52, 0.5, 0.46], SHUTTER = [0.36, 0.05, 0.04], STONE = [0.22, 0.21, 0.2];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.24, 0.23, 0.22], 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.42, 0.36, 0.26], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4, { bay: BAY, half: WIN.half });
    M.glass = SIMPLE_SKINS.glow([0.07, 0.08, 0.085], 0.1, 0.8, [1.0, 0.82, 0.58], 0.3);
    M.stone = SIMPLE_SKINS.plain([0.2, 0.195, 0.185], 0.95);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(8, 28);
  const glow = nightGlow();
  // Cream plaster with a window per bay and floor: a light frame with a post and a rail, a lighter surround, a sill;
  // on the verandas' walls red louvred shutters folded back beside it; a curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const shuttered = step(139.5, storey).mul(open);
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const surround = rect(WIN.half + 0.12, WIN.lo - 0.08, WIN.hi + 0.14, 0.02).mul(open).mul(near);
    const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.03, 0.015, abs(fv.sub(WIN.hi - 0.55))));
    const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(bars.mul(near))).mul(open);
    const sill = rect(WIN.half + 0.1, WIN.lo - 0.09, WIN.lo).mul(open).mul(near);
    const leaf = rectMask(abs(bu).sub(WIN.half + 0.06 + SH / 2), fv, SH / 2, WIN.lo, WIN.hi).mul(shuttered);
    const louvre = smoothstep(0.35, 0.5, abs(fract(fv.mul(9)).sub(0.5))).mul(fine).mul(0.45);
    const wall = mix(vec3(...PLASTER).mul(0.92), vec3(...PLASTER).mul(1.04), worldNoise(0.25));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.3), float(0.85), step(0.85, id)));
    const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(WIN.hi - WIN.lo - 0.14)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.08, 0.09, 0.1), worldNoise(0.07));
    let c = mix(wall, vec3(...PLASTER).mul(1.18), surround);
    c = mix(c, vec3(0.4, 0.39, 0.36), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.56, 0.52, 0.44), curtain);
    c = mix(c, vec3(...SHUTTER).mul(float(1).sub(louvre)), leaf);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(curtain));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (rooms over the tea-room: lit here and there in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 67, { share: 0.4, late: 0.1, tone: twoTones([1.0, 0.74, 0.45], [0.95, 0.87, 0.74], 0.7) }).mul(pane).mul(mix(float(1), float(0.45), curtain)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The tea-room's and the winter garden's glazing: dark timber posts every 1.2 m and a rail across, dark glass, a warm
  // room low behind it; at night the tea-room shut: a faint glow behind most panes, a few lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.7 });
    const mu = abs(fract(U.div(1.2)).sub(0.5)), rail = smoothstep(0.035, 0.02, abs(V.sub(2.0)));
    const frame = smoothstep(0.455, 0.475, mu).max(rail).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.2)).mul(13.1).add(step(2.0, V).mul(7.3)));
    const room = smoothstep(1.1, 0.6, V).mul(0.35);
    const glassC = mix(mix(vec3(0.05, 0.06, 0.065), vec3(0.11, 0.12, 0.13), paneId), vec3(0.3, 0.22, 0.14), room);
    m.colorNode = mix(glassC, vec3(0.08, 0.045, 0.025), frame);
    m.roughnessNode = mix(float(0.1), float(0.7), frame);
    m.metalnessNode = mix(float(0.7), float(0), frame);
    m.emissiveNode = vec3(1.0, 0.82, 0.58).mul(mix(float(0.04), float(0.35), step(0.8, paneId))).mul(float(1).sub(frame)).mul(glow);
    M.glass = m;
  }
  // The terrace's walls: grey rubble stone in courses of about 0.35 m (each stone a shade of its own, the joints dark),
  // on a foot of board-marked concrete down the slope (v under −CONCRETE / 2)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const concrete = step(V, -CONCRETE / 2), v = V.add(concrete.mul(CONCRETE));
    const row = floor(v.div(0.35)), off = hash(row.mul(17.3)).mul(0.6);
    const cell = floor(U.add(off).div(0.62)), fu = fract(U.add(off).div(0.62)), fr = fract(v.div(0.35));
    const shade = hash(row.mul(31.7).add(cell.mul(7.9)));
    const joint = smoothstep(0.06, 0.02, fu.min(float(1).sub(fu))).max(smoothstep(0.1, 0.04, fr.min(float(1).sub(fr)))).mul(fine);
    const stone = mix(vec3(...STONE).mul(0.75), vec3(...STONE).mul(1.3), shade).mul(float(1).sub(joint.mul(0.55)));
    const boards = smoothstep(0.03, 0.01, abs(fract(v.div(0.6)).sub(0.5)).sub(0.47).abs()).mul(fine).mul(0.08);
    const conc = mix(vec3(0.26, 0.26, 0.25), vec3(0.31, 0.31, 0.3), worldNoise(0.3)).mul(float(1).sub(boards));
    m.colorNode = mix(stone, conc, concrete);
    M.stone = m;
  }
  return M;
}

// --- The decoration: one canvas atlas ------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  name: [0, 0, 640, 124], // "TEA-ROOM" over the tea-room's glazing (2.6 × 0.5 m)
  rail: [648, 0, 376, 214], // the verandas' lattice rail (1.55 × 0.9 m, repeated)
  frieze: [0, 132, 512, 96], // the dark band with its cream zigzag under the eaves (2 × 0.38 m, repeated)
  valance: [0, 236, 512, 64], // the awning's valance (2.4 × 0.3 m, repeated)
  panel: [520, 222, 200, 156], // the oriel's ornamented panel under a window (0.9 × 0.7 m)
  oval: [728, 222, 240, 150] // the oval board at the lane's corner (0.8 × 0.5 m)
};
const GOLD = '#c9a052', GOLD_DARK = '#4e3714', TIMBER = '#2c1a0e', CREAM = '#e4d8b8';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  cell('name', (w, h) => {
    g.fillStyle = '#1e1209'; g.fillRect(0, 0, w, h);
    g.strokeStyle = GOLD; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
    g.font = '700 78px Georgia, "Times New Roman", serif';
    g.fillStyle = GOLD_DARK; g.fillText('TEA-ROOM', w / 2 + 3, h / 2 + 5, w - 60);
    g.fillStyle = GOLD; g.fillText('TEA-ROOM', w / 2, h / 2 + 2, w - 60);
  });
  cell('rail', (w, h) => {
    // a handrail and a foot rail, posts at the ends, a lattice of crossed laths between them (the gaps cut out)
    g.fillStyle = TIMBER;
    g.fillRect(0, 0, w, 20); g.fillRect(0, h - 22, w, 22); g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    g.strokeStyle = TIMBER; g.lineWidth = 9; g.lineCap = 'square';
    const n = 6, p = w / n;
    g.save(); g.beginPath(); g.rect(14, 20, w - 28, h - 42); g.clip();
    for (let i = -n; i <= 2 * n; i++) {
      g.beginPath(); g.moveTo(i * p, 20); g.lineTo(i * p + (h - 42), h - 22); g.stroke();
      g.beginPath(); g.moveTo(i * p, h - 22); g.lineTo(i * p + (h - 42), 20); g.stroke();
    }
    g.restore();
    g.fillStyle = 'rgba(0, 0, 0, 0.3)'; g.fillRect(0, 18, w, 3);
  });
  cell('frieze', (w, h) => {
    // a dark band, a cream zigzag between two cream lines, dots in its teeth
    g.fillStyle = '#24160c'; g.fillRect(0, 0, w, h);
    g.fillStyle = CREAM; g.fillRect(0, 10, w, 5); g.fillRect(0, h - 15, w, 5);
    g.strokeStyle = CREAM; g.lineWidth = 6; g.lineJoin = 'miter';
    const n = 8, p = w / n, y0 = 24, y1 = h - 24;
    g.beginPath(); g.moveTo(0, y1);
    for (let i = 0; i < n; i++) { g.lineTo(i * p + p / 2, y0); g.lineTo((i + 1) * p, y1); }
    g.stroke();
    g.fillStyle = '#b8402c';
    for (let i = 0; i < n; i++) { g.beginPath(); g.arc(i * p + p / 2, y1 - 6, 5, 0, Math.PI * 2); g.fill(); }
  });
  cell('valance', (w, h) => {
    // cream cloth, a thin red stripe, its foot cut in scallops
    g.fillStyle = '#ddd5c2'; g.fillRect(0, 0, w, h - 18);
    g.fillStyle = '#8a2418'; g.fillRect(0, 8, w, 5);
    g.fillStyle = '#ddd5c2';
    const n = 12, p = w / n;
    for (let i = 0; i < n; i++) { g.beginPath(); g.arc(i * p + p / 2, h - 18, p / 2, 0, Math.PI); g.fill(); }
  });
  cell('panel', (w, h) => {
    // a white panel in a dark frame, a red and ochre sunburst rising from its foot
    g.fillStyle = TIMBER; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ece6d6'; g.fillRect(12, 12, w - 24, h - 24);
    const cx = w / 2, cy = h - 16, r = h - 40;
    for (let i = 0; i < 9; i++) {
      const a0 = Math.PI + (i * Math.PI) / 9, a1 = a0 + Math.PI / 9;
      g.fillStyle = i % 2 ? '#c8962e' : '#a8281c';
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a0, a1); g.closePath(); g.fill();
    }
    g.fillStyle = '#ece6d6'; g.beginPath(); g.arc(cx, cy, r * 0.28, Math.PI, 0); g.fill();
  });
  cell('oval', (w, h) => {
    // a timber oval with a cream border and a flourish (its lettering cannot be read in the photographs)
    g.fillStyle = '#6a4424'; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = CREAM; g.lineWidth = 5; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 16, h / 2 - 14, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.22, h / 2); g.bezierCurveTo(w * 0.4, h * 0.25, w * 0.6, h * 0.75, w * 0.78, h / 2); g.stroke();
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  timber: [0.1, 0.055, 0.03], board: [0.16, 0.09, 0.045], frame: FRAME, pane: [0.03, 0.038, 0.045], cap: [0.3, 0.3, 0.29],
  metal: [0.06, 0.06, 0.065], plinth: [0.24, 0.23, 0.21], awning: [0.55, 0.53, 0.47], brass: [0.55, 0.42, 0.18],
  planter: [0.12, 0.08, 0.05], green: [0.03, 0.08, 0.035], band: [0.5, 0.45, 0.33]
};

/** A wall's point in the world: s along it, y up, `o` out of it */
const at = (F, s, y, o = 0) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };

/** A stretch of plaster from s0 to s1, y0 to y1: windowed (its bays from `mid`, aHalf `half`) or closed (half 0) */
function plaster(B, F, s0, s1, y0, y1, { half = 0, mid = (s0 + s1) / 2, shut = false } = {}) {
  if (y1 - y0 < 0.01 || s1 - s0 < 0.01) return;
  const v = (y) => y - FOOT + UP + (shut ? SHUT : 0) - (half ? 0 : CLOSED);
  B.quad('plaster', at(F, s0, y0), at(F, s1, y0), at(F, s1, y1), at(F, s0, y1),
    [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]], { half });
}

/** The ground along a wall from s0 to s1, half a metre out of it: [lowest, highest] */
function groundAlong(F, s0 = 0, s1 = F.len) {
  let lo = Infinity, hi = -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.0));
  for (let k = 0; k <= n; k++) {
    const y = groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5));
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return [lo, hi];
}

/**
 * A plastered wall from its foot (`from`: the roof before it, or the ground) up to `top`: closed under the first floor
 * whose windows clear what stands before it, windowed up to the last floor whose windows fit under the roof, closed over
 */
function windowedWall(B, st, top, { shut = false } = {}) {
  const { F, s0, s1 } = st, len = s1 - s0;
  const y0 = Number.isFinite(st.from) ? Math.max(S.base, st.from) : S.base;
  const clear = Number.isFinite(st.from) ? st.from + 0.1 : groundAlong(F, s0, s1)[1] + 0.25;
  const w0 = windowsFrom(clear), w1 = windowsTo(top);
  if (len < 2.4 || w1 <= w0 + 0.5) { plaster(B, F, s0, s1, y0, top); return; }
  plaster(B, F, s0, s1, y0, w0);
  plaster(B, F, s0, s1, w0, w1, { half: len / 2, shut });
  plaster(B, F, s0, s1, w1, top);
}

/** A window modelled in the trim (where the wall's material draws none): frame, two panes, its sill */
function trimWindow(B, F, s, half, y0, y1) {
  B.box('trim', F, s - half, s + half, 0, 0.05, y0, y1, C.frame);
  B.box('trim', F, s - half + 0.07, s - 0.03, 0.05, 0.065, y0 + 0.07, y1 - 0.07, C.pane);
  B.box('trim', F, s + 0.03, s + half - 0.07, 0.05, 0.065, y0 + 0.07, y1 - 0.07, C.pane);
  B.box('trim', F, s - half - 0.05, s + half + 0.05, 0, 0.1, y0 - 0.07, y0, C.band);
}

/** A decal cell repeated along a wall from s0 to s1 (each about `w` m) */
function repeat(B, F, s0, s1, o, y0, y1, key, w) {
  const n = Math.max(1, Math.round((s1 - s0) / w)), d = (s1 - s0) / n;
  for (let i = 0; i < n; i++) B.decal(F, s0 + i * d, s0 + (i + 1) * d, o, y0, y1, key);
}

/** The glass of a wall from s0 to s1, y0 to y1 (uv: m along it, m up from y0) */
function glass(B, F, s0, s1, y0, y1) {
  if (y1 - y0 < 0.05) return;
  B.quad('glass', at(F, s0, y0), at(F, s1, y0), at(F, s1, y1), at(F, s0, y1), [[s0, 0], [s1, 0], [s1, y1 - y0], [s0, y1 - y0]]);
}

// The block with the winter garden: its glazing over the terrace (a closed sill, dark corner posts, the fascia under
// the roof's coping), the awning on the walls facing the lane; plastered walls with windows over the annexes' roofs
function buildGarden(B) {
  const p = part('garden'), top = p.top, G = S.garden, A = G.awning;
  for (const st of wallStretches(p)) {
    const { F, s0, s1 } = st;
    B.box('trim', F, s0 - 0.02, s1 + 0.02, -0.3, 0.08, top - 0.05, top + 0.15, C.cap);
    if (!(st.from > -0.5)) { windowedWall(B, st, top); continue; }
    const y0 = st.from, ys = y0 + G.sill, yh = top - G.head;
    plaster(B, F, s0, s1, y0, ys);
    glass(B, F, s0, s1, ys, yh);
    B.box('trim', F, s0, s1, 0, 0.1, yh, top - 0.05, C.timber);
    B.box('trim', F, s0, s1, 0, 0.08, ys - 0.06, ys, C.board);
    if (s1 - s0 > 0.4) for (const s of [s0 + 0.06, s1 - 0.06]) B.box('trim', F, s - 0.06, s + 0.06, 0, 0.1, ys, yh, C.timber);
    // the awning towards the lane: a sloped cloth from the fascia, its valance, the arms
    if (F.n[0] < -0.45 && F.n[1] > -0.3 && s1 - s0 > 2) {
      const a0 = s0 + 0.15, a1 = s1 - 0.15, yw = yh + 0.05, ye = yw - A.drop, yv = ye - A.valance;
      B.quad('trim', at(F, a0, yw), at(F, a1, yw), at(F, a1, ye, A.out), at(F, a0, ye, A.out), [[0, 0], [1, 0], [1, 1], [0, 1]], { colour: C.awning });
      B.quad('trim', at(F, a1, yw - 0.03), at(F, a0, yw - 0.03), at(F, a0, ye - 0.03, A.out), at(F, a1, ye - 0.03, A.out), [[0, 0], [1, 0], [1, 1], [0, 1]], { colour: C.awning });
      repeat(B, F, a0, a1, A.out + 0.01, yv, ye, 'valance', 2.4);
      for (let s = a0 + 0.2; s < a1; s += 2.4) B.box('trim', F, s - 0.03, s + 0.03, 0, A.out, ye - 0.06, ye, C.metal);
    }
  }
  flatRoof(B, outwardRing(p.ring), top + 0.1);
}

// The terrace round it: the tea-room's front where the ground is the Promenade's (glazing between dark timber posts,
// the fascia with the name, the flat canopy, the door), stone walls on a concrete foot down the slope with a coping, a
// railing and planters on top
function buildTerrace(B) {
  const p = part('terrace'), top = p.top, T = S.terrace;
  const st = wallStretches(p).map((x) => ({ ...x, ground: groundAlong(x.F, x.s0, x.s1) }));
  const cafes = st.filter((x) => isCafe(x.ground[0]));
  const front = cafes.reduce((a, b) => (b.s1 - b.s0 > a.s1 - a.s0 ? b : a), cafes[0]);
  for (const x of st) {
    const { F, s0, s1, ground: [lo, hi] } = x, len = s1 - s0;
    if (isCafe(lo)) {
      const sill = hi + 0.12;
      // (the front on the Promenade: the door, the rest glazed over the plinth)
      const door = x === front ? doorAt(F, s0, s1) : null, dw = 0.85;
      const spans = door === null ? [[s0, s1]] : [[s0, door - dw], [door + dw, s1]];
      for (const [a, b] of spans) {
        plaster(B, F, a, b, S.base, sill);
        B.box('trim', F, a, b, 0, 0.06, S.base, sill, C.plinth);
        glass(B, F, a, b, sill, T.head);
      }
      B.box('trim', F, s0, s1, 0, 0.1, T.head, top, C.timber);
      B.box('trim', F, s0 - 0.1, s1 + 0.1, -0.1, T.canopy, top - 0.02, top + 0.16, C.timber, { top: 'trim' });
      const n = Math.max(1, Math.round(len / 1.6));
      for (let k = 0; k <= n; k++) {
        const s = s0 + (len * k) / n;
        if (door === null || Math.abs(s - door) > dw + 0.1) B.box('trim', F, Math.max(s0, s - 0.07), Math.min(s1, s + 0.07), 0, 0.12, sill, T.head, C.timber);
      }
      if (door !== null) {
        const m = (s0 + s1) / 2, N = T.name;
        B.decal(F, m - N.w / 2, m + N.w / 2, 0.11, T.head + 0.17, T.head + 0.17 + N.h, 'name');
        // the door towards Schneider's (the end nearer its west corner): two glazed leaves, a transom, brass handles
        const g = groundAlong(F, door - dw, door + dw)[1];
        plaster(B, F, door - dw, door + dw, S.base, g + 0.05);
        glass(B, F, door - dw, door + dw, g + 0.05, T.head);
        B.box('trim', F, door - dw - 0.08, door + dw + 0.08, 0, 0.14, T.head - 0.55, T.head - 0.45, C.timber);
        for (const [a, b] of [[door - dw - 0.08, door - dw + 0.06], [door - 0.04, door + 0.04], [door + dw - 0.06, door + dw + 0.08]]) B.box('trim', F, a, b, 0, 0.14, g, T.head, C.timber);
        for (const sd of [door - 0.15, door + 0.15]) B.box('trim', F, sd - 0.02, sd + 0.02, 0.14, 0.2, g + 0.95, g + 1.35, C.brass);
      } else if (len > 2) {
        B.decal(F, (s0 + s1) / 2 - 0.4, (s0 + s1) / 2 + 0.4, 0.11, T.head + 0.12, T.head + 0.62, 'oval');
      }
      continue;
    }
    // the stone wall: concrete under the ground's highest point less 0.6 m, stone over it
    const yc = Math.min(top - 2.5, Math.max(hi - 0.6, top - 4.5));
    B.quad('stone', at(F, s0, S.base), at(F, s1, S.base), at(F, s1, yc), at(F, s0, yc), [[s0, S.base - CONCRETE], [s1, S.base - CONCRETE], [s1, yc - CONCRETE], [s0, yc - CONCRETE]]);
    B.quad('stone', at(F, s0, yc), at(F, s1, yc), at(F, s1, top), at(F, s0, top), [[s0, yc], [s1, yc], [s1, top], [s0, top]]);
    B.box('trim', F, s0 - 0.05, s1 + 0.05, -0.4, 0.06, top - 0.1, top + 0.1, C.cap);
    // the railing on the coping
    B.box('trim', F, s0, s1, -0.2, -0.14, top + 1.0, top + 1.06, C.metal);
    B.box('trim', F, s0, s1, -0.19, -0.15, top + 0.45, top + 0.48, C.metal);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let k = 0; k <= n; k++) { const s = s0 + 0.05 + ((len - 0.1) * k) / n; B.box('trim', F, s - 0.025, s + 0.025, -0.2, -0.14, top + 0.1, top + 1.0, C.metal); }
    // a planter with a small conifer on the longer walls
    if (len > 4) {
      const m = (s0 + s1) / 2;
      B.box('trim', F, m - 0.45, m + 0.45, -0.95, -0.3, top + 0.1, top + 0.55, C.planter, { top: 'trim' });
      B.box('trim', F, m - 0.25, m + 0.25, -0.88, -0.38, top + 0.55, top + 1.05, C.green);
      B.box('trim', F, m - 0.13, m + 0.13, -0.76, -0.5, top + 1.05, top + 1.45, C.green);
    }
  }
  flatRoof(B, outwardRing(p.ring), top + 0.1);
}

// The verandas against Schneider's south-west wall: the closed base over the winter garden's roof clad in timber, the
// loggias' back wall with its windows and red shutters, their decks, posts, lattice rails and the deep beam under the
// roof with its zigzag band; the oriel at the north-west end with its windows over ornamented panels
function buildVeranda(B) {
  const p = part('veranda'), top = p.top, [f0, f1] = VE.floors, depth = VE.front - VE.back;
  // the base up to the first deck: its walls where they show
  for (const st of wallStretches(p)) {
    const y0 = Number.isFinite(st.from) ? st.from : S.base;
    if (y0 < f0) plaster(B, st.F, st.s0, st.s1, y0, f0);
  }
  const L = loggia(), F = L.F;
  B.box('trim', F, 0, F.len, 0, 0.06, part('garden').top, f0 - 0.2, C.board);
  // the back block and the oriel over it (walls facing each other or Schneider's left out)
  const back = { id: 'veranda', ring: backRing(), top }, oriel = { id: 'veranda', ring: orielRing(), top };
  for (const st of wallStretches(back, [{ ring: oriel.ring, top }])) windowedWall(B, { ...st, from: f0 }, top, { shut: true });
  for (const st of wallStretches(oriel, [{ ring: back.ring, top }])) {
    const { F: OF, s0, s1 } = st, m = (s0 + s1) / 2, len = s1 - s0;
    plaster(B, OF, s0, s1, f0, top);
    // dark timber at its corners, a band at each floor, a window over an ornamented panel in each face
    for (const s of [s0, s1]) B.box('trim', OF, s - 0.07, s + 0.07, -0.02, 0.06, f0, top - VE.beam, C.timber);
    for (const y of [f0, f1]) {
      B.box('trim', OF, s0, s1, 0, 0.07, y - 0.12, y + 0.08, C.timber);
      if (len < 0.8) continue;
      const half = Math.min(0.45, len / 2 - 0.2);
      trimWindow(B, OF, m, half, y + 1.0, y + 2.75);
      B.decal(OF, m - half, m + half, 0.03, y + 0.15, y + 0.85, 'panel');
    }
    B.box('trim', OF, s0, s1, 0, 0.06, top - VE.beam, top, C.timber);
    if (len > 1) B.decal(OF, s0, s1, 0.07, top - VE.beam + 0.08, top - 0.06, 'frieze');
  }
  // the loggias: the decks, the deep beam with the band, the posts, the rails (lattice on the front, a plain return at
  // the south-east end)
  const { s0, s1 } = L, bo = -depth;
  for (const y of VE.floors) B.box('trim', F, s0, s1, bo, 0.05, y - 0.2, y, C.timber, { top: 'trim' });
  B.box('trim', F, s0, s1 + 0.02, bo, 0.08, top - VE.beam, top - 0.02, C.timber);
  repeat(B, F, s0, s1, 0.09, top - VE.beam + 0.08, top - 0.08, 'frieze', 2);
  const se = sAt(F, VE.u0), dir = Math.sign(sAt(F, VE.oriel) - se);
  for (const d of VE.posts) {
    const s = se + dir * d;
    if (s < s0 - 0.01 || s > s1 + 0.01) continue;
    B.box('trim', F, Math.max(s0, s - 0.1), Math.min(s1, s + 0.1), -0.2, 0.02, f0, top - VE.beam, C.timber);
  }
  for (const y of VE.floors) {
    const r = y + VE.rail;
    B.box('trim', F, s0, s1, -0.1, 0.02, r, r + 0.08, C.timber);
    repeat(B, F, s0, s1, 0.005, y, r, 'rail', 1.55);
    const e = dir > 0 ? s0 : s1;
    B.box('trim', F, e - 0.04, e + 0.04, bo, 0, r, r + 0.08, C.timber);
    B.box('trim', F, e - 0.03, e + 0.03, bo, 0, y + 0.1, y + 0.16, C.timber);
  }
  flatRoof(B, outwardRing(p.ring), top);
  B.box('trim', vFrame(), 0, vFrame().len, -0.02, 0.12, top - 0.04, top + 0.12, C.cap);
}

// The annexes east of the block: plastered walls with windows, a coping, a stone plinth, flat roofs
function buildAnnexes(B) {
  for (const p of S.parts.filter((q) => q.kind === 'annex')) {
    for (const st of wallStretches(p)) {
      windowedWall(B, st, p.top);
      B.box('trim', st.F, st.s0 - 0.03, st.s1 + 0.03, -0.25, 0.06, p.top - 0.15, p.top + 0.12, C.cap);
      if (!Number.isFinite(st.from)) B.box('trim', st.F, st.s0, st.s1, 0, 0.03, S.base, groundAlong(st.F, st.s0, st.s1)[1] + 0.3, C.plinth);
    }
    flatRoof(B, outwardRing(p.ring), p.top + 0.12);
  }
}

/**
 * Builds the house before Schneider's into `scene`. Returns { group, colliders }: no colliders of its own (the player's
 * walls stand on every part's outline, js/landmarks.js SURVEYED_FOOTPRINTS; the canopy and the awning hang over the
 * street without posts, the verandas stand over the winter garden's roof).
 */
export function buildSchneidersChalet(scene) {
  const root = new THREE.Group();
  root.name = 'Schneider\'s chalet';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Schneiders chalet' }), M = materials();
  buildGarden(B);
  buildTerrace(B);
  buildVeranda(B);
  buildAnnexes(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
