import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { PARSENNBAHN_TAL, groundOutlines, isWall, onWall, outwardRing, plan, pointInRing, wallFrame, wallStretches } from './parsennbahn-tal-data.js';

export { PARSENNBAHN_TAL };

// The Parsennbahn's valley station in Davos Dorf rebuilt by hand (js/parsennbahn-tal-data.js), standing in for its
// swissBUILDINGS3D volume and for the rough station js/landmark-buildings.js built after a night photograph: the
// surveyed volumes in white plaster, on the main block a window in a red-orange frame in every bay of the three floors
// over the shop (drawn by the wall's material from its uv: metres along the wall from its middle, metres up the floors'
// grid), the shop's glazing on the Promenade under the balcony band with its blue and yellow stripes, the blue stripe
// at the top floor's foot, the dark-brown band along the roof's edge with a red socket under each flagpole, the
// pavilion's entrance with "parsenn" and its star over the doors, "DAVOS KLOSTERS mountains" on the north-east end, the
// tall blue banners on the roof. The walls between two volumes stand only where one rises over the other (the
// funicular's cut runs under the hall and the west block: no wall reaches down into it). Five meshes: the walls, the
// roofs, the glass, the trim (one vertex-coloured mesh) and the decals (one canvas atlas).

const P = PARSENNBAHN_TAL;
excludeBuildings([P.exclude]);
// (the player's walls on the surveyed volumes, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(P.osm, groundOutlines());

const BAY = 3.0; // a window's bay along a wall
const STOREY = P.storey;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the part's `line` at 40 of them);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
// A window in its storey (m up from the floor's foot) and its half width: wide panes as in the photographs
const WIN = { lo: 0.8, hi: 2.35, half: 1.05 };
const PIECE = 2.5; // the longest piece of wall (its foot follows the ground or the roof before it piece by piece)

// --- The roofs and the ground along the walls ----------------------------------------------------------------------------
// A sloping roof's triangles (the ring triangulated, each with its corners' heights)
const slopes = new Map();
function slopeTris(part) {
  if (!slopes.has(part)) {
    const r = part.ring;
    slopes.set(part, THREE.ShapeUtils.triangulateShape(r.map(([x, z]) => new THREE.Vector2(x, z)), []).map((t) => t.map((i) => r[i])));
  }
  return slopes.get(part);
}
/** A part's roof height over a point (in or by its outline) */
export function roofAt(part, x, z) {
  if (part.top !== undefined) return part.top;
  let best = null, bd = Infinity;
  for (const [a, b, c] of slopeTris(part)) {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d, l3 = 1 - l1 - l2;
    const y = l1 * a[2] + l2 * b[2] + l3 * c[2], out = Math.max(0, -l1, -l2, -l3);
    if (out < bd) { bd = out; best = y; }
  }
  return best;
}
/** The highest roof of another part over a point, or null (the walls between two volumes) */
function coverAt(x, z, self) {
  let y = null;
  for (const p of P.parts) if (p !== self && pointInRing(plan(p), x, z)) y = Math.max(y ?? -Infinity, roofAt(p, x, z));
  return y;
}
/** The highest ground along a wall from s0 to s1, half a metre before it */
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + (s1 - s0) * k / n, 0.5)));
  return hi;
}
/** The lowest ground along a wall from s0 to s1 (its foot goes under it) */
function groundUnder(F, s0, s1) {
  let lo = Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) for (const o of [0.5, -0.3]) lo = Math.min(lo, groundHeight(...onWall(F, s0 + (s1 - s0) * k / n, o)));
  return lo;
}
/** The first floor's foot whose windows clear `y` by 0.3 m (the part's floors' grid from its `line`) */
const windowsFrom = (line, y) => line - Math.max(0, Math.floor((line - (y + 0.3 - WIN.lo)) / STOREY)) * STOREY;

/**
 * The walls' pieces: { part, F (the wall's frame), s0, s1 (m along it), stretch ({ from, to, windows }), bottom: [y0, y1],
 * top: [y0, y1], covered (standing on another volume's roof) }. A wall's foot is half a metre under the lowest ground
 * before it (the funicular's cut lies little deeper under the west block), or, between two volumes, on the lower one's roof; where the other is as high, there is no wall.
 */
export function wallPieces() {
  const out = [];
  for (const part of P.parts) {
    const ring = outwardRing(part.ring);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
      if (F.len < 0.05) continue;
      const tA = part.top ?? a[2], tB = part.top ?? b[2], topAt = (s) => tA + (tB - tA) * (s / F.len);
      for (const stretch of wallStretches(a, b, part.skin === 'windowed')) {
        const n = Math.max(1, Math.ceil((stretch.to - stretch.from) / PIECE));
        for (let k = 0; k < n; k++) {
          const s0 = stretch.from + (stretch.to - stretch.from) * k / n, s1 = stretch.from + (stretch.to - stretch.from) * (k + 1) / n;
          const probe = (s) => coverAt(...onWall(F, Math.min(F.len - 0.1, Math.max(0.1, s)), 0.3), part);
          const c0 = probe(s0), c1 = probe(s1), top = [topAt(s0), topAt(s1)];
          const covered = c0 !== null && c1 !== null;
          let bottom;
          if (covered) bottom = [Math.min(c0, top[0]), Math.min(c1, top[1])];
          else { const g = groundUnder(F, s0, s1) - 0.5; bottom = [g, g]; }
          if (bottom[0] >= top[0] - 0.02 && bottom[1] >= top[1] - 0.02) continue;
          out.push({ part, F, a, b, s0, s1, stretch, bottom, top, covered });
        }
      }
    }
  }
  return out;
}

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.6, 0.6, 0.58], RED = [0.62, 0.075, 0.03];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.26, 0.25, 0.24], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.55, 0.55, 0.53], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.35);
    M.glass = SIMPLE_SKINS.glow([0.09, 0.11, 0.12], 0.15, 0.6, [1.0, 0.84, 0.62], 0.15);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  // White plaster with a wide window per bay and floor: a red-orange frame, a post in its middle, a light sill under
  // it; a blind drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const post = smoothstep(0.05, 0.035, abs(bu)).mul(near);
    const pane = rect(WIN.half - 0.1, WIN.lo + 0.1, WIN.hi - 0.1).mul(float(1).sub(post)).mul(open);
    const sill = rect(WIN.half + 0.06, WIN.lo - 0.08, WIN.lo).mul(open).mul(near);
    const stain = rect(WIN.half, WIN.lo - 0.7, WIN.lo - 0.08, 0.2).mul(open).mul(0.05);
    const wall = mix(vec3(0.55, 0.55, 0.53), vec3(...PLASTER).mul(1.05), worldNoise(0.3)).mul(float(1).sub(stain)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.62, id).mul(mix(float(0.35), float(1), step(0.9, id)));
    const span = WIN.hi - WIN.lo - 0.2;
    const blind = step(float(WIN.hi - 0.1).sub(drawn.mul(span)), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.09, 0.105), worldNoise(0.07));
    let c = mix(wall, vec3(0.5, 0.5, 0.48), sill);
    c = mix(c, vec3(...RED), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.42, 0.42, 0.4), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (offices and staff rooms: a few lit in the evening, fewer towards midnight)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 23, { share: 0.3, late: 0.08, tone: twoTones([1.0, 0.8, 0.52], [0.86, 0.9, 1.0], 0.75) }).mul(pane).mul(mix(float(1), float(0.4), blind)).mul(glow.mul(1.1));
    M.plaster = m;
  }
  // The shop's and the entrance's glazing: dark frames every 1.6 m, a transom 2.6 m up; at night the shop is shut, a faint
  // glow behind the panes and a few lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const mu = abs(fract(U.div(1.6)).sub(0.5)), transom = smoothstep(0.05, 0.03, abs(V.sub(2.6)));
    const frame = smoothstep(0.46, 0.475, mu).max(transom).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.6)).mul(13.1).add(step(2.6, V).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.06, 0.08, 0.09), vec3(0.14, 0.17, 0.18), paneId), vec3(0.11, 0.12, 0.13), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.2), frame);
    const lit = float(0.1).add(step(0.82, paneId).mul(0.5));
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(float(1).sub(frame)).mul(lit).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The lettering, the panel and the banners: one canvas atlas --------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  parsenn: [0, 0, 640, 160],
  davos: [0, 176, 320, 160],
  panel: [336, 176, 400, 200],
  flag: [768, 0, 128, 448]
};
const VIOLET = '#a8489a', NAVY = '#1d3a78', FLAG = '#2565b2';

// A five-pointed star (centre x, y, outer radius r)
function star(g, x, y, r, fill) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.42 : r;
    g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  g.closePath(); g.fillStyle = fill; g.fill();
}

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textBaseline = 'middle';
  // "parsenn" over the doors, the star (blue over yellow) before it
  cell('parsenn', (w, h) => {
    star(g, 74, h / 2 - 22, 50, '#f2c318');
    star(g, 70, h / 2 - 26, 44, '#2a55b8');
    g.font = 'bold 118px Helvetica, Arial, sans-serif'; g.textAlign = 'left'; g.fillStyle = VIOLET;
    g.fillText('parsenn', 140, h / 2 + 8, w - 150);
  });
  // "DAVOS KLOSTERS mountains" in three lines
  cell('davos', (w) => {
    g.textAlign = 'left'; g.fillStyle = NAVY;
    g.font = 'bold 52px Helvetica, Arial, sans-serif';
    g.fillText('DAVOS', 20, 34, w - 30);
    g.fillText('KLOSTERS', 20, 86, w - 30);
    g.font = 'italic 36px Helvetica, Arial, sans-serif';
    g.fillText('mountains', 20, 134, w - 30);
  });
  // The picture panel on the pavilion's side: the mountains over the valley, simply
  cell('panel', (w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#5d8fc8'); sky.addColorStop(1, '#bcd5ea');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e9eef3';
    g.beginPath(); g.moveTo(0, h * 0.78); g.lineTo(w * 0.18, h * 0.42); g.lineTo(w * 0.3, h * 0.55); g.lineTo(w * 0.5, h * 0.2); g.lineTo(w * 0.68, h * 0.5);
    g.lineTo(w * 0.82, h * 0.36); g.lineTo(w, h * 0.62); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
    g.fillStyle = '#7d8a96';
    g.beginPath(); g.moveTo(w * 0.5, h * 0.2); g.lineTo(w * 0.56, h * 0.5); g.lineTo(w * 0.62, h * 0.42); g.lineTo(w * 0.68, h * 0.5); g.closePath(); g.fill();
    g.fillStyle = '#2f4f3c'; g.fillRect(0, h * 0.86, w, h * 0.14);
    g.strokeStyle = '#33373c'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  });
  // A banner: blue, the star at its head, "parsenn" down it
  cell('flag', (w, h) => {
    g.fillStyle = FLAG; g.fillRect(0, 0, w, h);
    star(g, w / 2, 52, 30, '#ffffff');
    g.save(); g.translate(w / 2, 250); g.rotate(Math.PI / 2);
    g.font = 'bold 66px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffffff';
    g.fillText('parsenn', 0, 4, 300);
    g.restore();
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  white: [0.56, 0.56, 0.54], red: RED, blue: [0.02, 0.12, 0.42], sky: [0.2, 0.45, 0.72], yellow: [0.75, 0.55, 0.06],
  band: [0.07, 0.045, 0.03], coping: [0.34, 0.34, 0.33], fascia: [0.12, 0.13, 0.15], pole: [0.55, 0.56, 0.57], door: [0.03, 0.07, 0.22]
};

// A quad of wall from s0 to s1, its foot y0 (at each end) and its top y1 (at each end); `line` the part's floors' grid
function wallQuad(B, F, s0, s1, y0, y1, { mid, half, line, windows }) {
  const Q = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const v = (y) => y - line + UP - (windows ? 0 : CLOSED);
  B.quad('plaster', Q(s0, y0[0]), Q(s1, y0[1]), Q(s1, y1[1]), Q(s0, y1[0]),
    [[s0 - mid, v(y0[0])], [s1 - mid, v(y0[1])], [s1 - mid, v(y1[1])], [s0 - mid, v(y1[0])]], { half: windows ? half : 0 });
}

// The walls: piece by piece, closed under the first windows that clear the ground (or the roof before them), the shop's
// glazing on the Promenade front
function buildWalls(B, pieces) {
  const fromCache = new Map();
  for (const w of pieces) {
    const { part, F, s0, s1, stretch, bottom, top } = w;
    const line = part.line ?? P.line, windows = stretch.windows && stretch.to - stretch.from >= 2.4;
    const opt = { mid: (stretch.from + stretch.to) / 2, half: (stretch.to - stretch.from) / 2, line, windows };
    const closed = { ...opt, windows: false };
    const parapet = part.top === undefined ? 0.15 : part.id === 'main' ? 0 : 0.3;
    const t = [top[0] + parapet, top[1] + parapet];
    const shop = part.id === 'main' && isWall(P.shop, w.a, w.b);
    if (!windows) { wallQuad(B, F, s0, s1, bottom, t, closed); continue; }
    // the windows' foot: over the highest ground along the whole wall; over the roof before this piece, a window's foot
    // may hide behind that roof's fascia (the pavilion's, under the floor with the lettering)
    let from;
    if (w.covered) from = windowsFrom(line, Math.max(...bottom) - 0.7);
    else {
      const key = `${part.id} ${F.a} ${F.u}`;
      if (!fromCache.has(key)) fromCache.set(key, windowsFrom(line, groundAlong(F)));
      from = fromCache.get(key);
    }
    if (part.id === 'main') from = Math.max(from, P.shopTop);
    const f = [Math.max(bottom[0], Math.min(from, t[0])), Math.max(bottom[1], Math.min(from, t[1]))];
    if (shop) {
      // the shop: a plinth, the glazing, the fascia over it (the balcony band's foot)
      const g0 = Math.max(P.shop.glass[0], groundAlong(F) + 0.15), g1 = P.shop.glass[1];
      wallQuad(B, F, s0, s1, bottom, [g0, g0], closed);
      const Q = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
      B.quad('glass', Q(s0, g0), Q(s1, g0), Q(s1, g1), Q(s0, g1), [[s0, 0], [s1, 0], [s1, g1 - g0], [s0, g1 - g0]]);
      wallQuad(B, F, s0, s1, [g1, g1], f, closed);
    } else if (f[0] > bottom[0] + 0.01 || f[1] > bottom[1] + 0.01) wallQuad(B, F, s0, s1, bottom, f, closed);
    if (t[0] > f[0] + 0.01 || t[1] > f[1] + 0.01) wallQuad(B, F, s0, s1, f, t, opt);
  }
}

// The roofs, and round their edges the main block's dark band, the wing's fascia, the west block's coping
function buildRoofs(B, pieces) {
  for (const part of P.parts) {
    if (part.top !== undefined) flatRoof(B, plan(part), part.top);
    else flatRoof(B, part.ring, (q) => q[2]);
  }
  for (const w of pieces) {
    const { part, F, s0, s1, top } = w;
    if (part.top === undefined || Math.min(...top) - Math.max(...w.bottom) < 0.4) continue;
    if (part.id === 'main') B.box('trim', F, s0, s1, -0.25, P.band.out, P.band.y0, P.band.y1, C.band);
    else if (part.id === 'wing') B.box('trim', F, s0, s1, -0.25, 0.12, part.top - 0.4, part.top + 0.25, C.band);
    else B.box('trim', F, s0, s1, -0.32, 0.05, part.top + 0.3, part.top + 0.4, C.coping);
  }
}

// The Promenade front: the shop's fascia, the balcony band with its stripes, the blue stripe at the top floor's foot
// (round the north-east end too), the sockets under the banners
function buildFront(B) {
  const F = wallFrame(P.shop.a, P.shop.b), L = F.len, g1 = P.shop.glass[1];
  B.box('trim', F, 0, L, 0, 0.1, g1, g1 + 0.3, C.fascia);
  const { y, out, rail } = P.balcony;
  B.box('trim', F, 0, L, 0, out, y - 0.25, y, C.white);
  B.box('trim', F, 0, L, out - 0.14, out, y, y + rail, C.white);
  for (const s of [0, L - 0.14]) B.box('trim', F, s, s + 0.14, 0, out - 0.14, y, y + rail, C.white);
  for (const [y0, y1, c] of [[0.28, 0.44, C.blue], [0.5, 0.58, C.sky], [0.64, 0.72, C.yellow]]) B.box('trim', F, 0, L, out, out + 0.02, y + y0, y + y1, c);
  const E = wallFrame(P.davos.a, P.davos.b);
  for (const W of [F, E]) {
    B.box('trim', W, 0, W.len, 0, 0.14, P.stripe - 0.25, P.stripe + 0.05, C.white);
    B.box('trim', W, 0, W.len, 0.14, 0.16, P.stripe - 0.18, P.stripe - 0.04, C.blue);
  }
  for (const s of P.flags.front) B.box('trim', F, s - 0.15, s + 0.15, P.band.out, P.band.out + 0.25, P.band.y0 - 0.2, P.band.y1 + 0.35, C.red);
}

// The pavilion's entrance: the doors' glazing and frames, the lettering over them; the panel on its side; the lettering
// on the north-east end
function buildEntrance(B) {
  const E = P.entrance, F = wallFrame(E.a, E.b), [d0, d1] = E.doors;
  const y0 = groundAlong(F) + 0.05, y1 = E.doorTop;
  const Q = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
  B.quad('glass', Q(d0, y0), Q(d1, y0), Q(d1, y1), Q(d0, y1), [[d0, 0], [d1, 0], [d1, y1 - y0], [d0, y1 - y0]]);
  for (let k = 0; k <= 4; k++) { const s = d0 + (d1 - d0) * k / 4; B.box('trim', F, s - 0.06, s + 0.06, 0, 0.1, y0, y1, C.door); }
  B.box('trim', F, d0 - 0.06, d1 + 0.06, 0, 0.1, y1, y1 + 0.14, C.door);
  B.box('trim', F, d0 - 0.4, d1 + 0.4, -0.2, 0.06, y0 - 0.6, y0, C.coping);
  B.decal(F, E.sign.s[0], E.sign.s[1], 0.04, E.sign.y[0], E.sign.y[1], 'parsenn');
  const N = wallFrame(P.panel.a, P.panel.b);
  B.box('trim', N, P.panel.s[0] - 0.08, P.panel.s[1] + 0.08, 0, 0.05, P.panel.y[0] - 0.08, P.panel.y[1] + 0.08, C.fascia);
  B.decal(N, P.panel.s[0], P.panel.s[1], 0.07, P.panel.y[0], P.panel.y[1], 'panel');
  const D = P.davos, W = wallFrame(D.a, D.b);
  B.decal(W, D.s[0], D.s[1], 0.04, D.y[0], D.y[1], 'davos');
}

// The banners: a pole, the crossbar at its head, the banner hanging from it (both its sides)
function banner(B, F, s, o, foot, head) {
  const { w, h } = P.flags;
  B.box('trim', F, s - 0.05, s + 0.05, o - 0.05, o + 0.05, foot, head, C.pole);
  B.box('trim', F, s, s + w + 0.08, o - 0.025, o + 0.025, head - 0.08, head - 0.03, C.pole);
  const y1 = head - 0.1, y0 = y1 - h, s0 = s + 0.07, s1 = s0 + w;
  B.decal(F, s0, s1, o, y0, y1, 'flag');
  const back = { a: onWall(F, s1, o), u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]], len: w };
  B.decal(back, 0, w, 0, y0, y1, 'flag');
}
function buildFlags(B) {
  const F = wallFrame(P.shop.a, P.shop.b), E = wallFrame(P.davos.a, P.davos.b), fl = P.flags;
  for (const s of fl.front) banner(B, F, s, P.band.out + 0.125, P.band.y1 + 0.35, P.band.y1 + fl.pole);
  const top = P.parts.find((p) => p.id === 'main').top;
  for (const s of fl.end) banner(B, E, s, -fl.in, top, P.band.y1 + fl.pole + 0.5);
}

/** The banners' poles (world [x, z]): for the tests */
export function flagPoles() {
  const F = wallFrame(P.shop.a, P.shop.b), E = wallFrame(P.davos.a, P.davos.b);
  return [...P.flags.front.map((s) => onWall(F, s, P.band.out + 0.125)), ...P.flags.end.map((s) => onWall(E, s, -P.flags.in))];
}

/**
 * Builds the Parsennbahn's valley station into `scene`. Returns { group, colliders } (no colliders of its own: the
 * player's walls stand on the surveyed outlines, js/landmarks.js SURVEYED_FOOTPRINTS; the balcony band hangs over the
 * Promenade, the banners stand on the roof).
 */
export function buildParsennbahnTal(scene) {
  const root = new THREE.Group();
  root.name = 'Parsennbahn Talstation';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Parsennbahn' }), M = materials();
  const pieces = wallPieces();
  buildWalls(B, pieces);
  buildRoofs(B, pieces);
  buildFront(B);
  buildEntrance(B);
  buildFlags(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
