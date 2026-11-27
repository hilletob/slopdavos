import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, worldNoise } from './building-kit.js';
import {
  TINZENBLICK, curvePieces, curvePoint, curveSegments, footY, onCurve, onWall, outwardRing, sameWall, stackPosts, stackRanges, wallFrame,
  wallStretches
} from './tinzenblick-data.js';

export { TINZENBLICK };

// The apartment house Tinzenblick rebuilt by hand (js/tinzenblick-data.js), standing in for its swissBUILDINGS3D
// volume, which the streamed tiles drew as one white block with the town houses' windows: the half-round block in white
// plaster, its top floor round the curve clad in grey-green shingles, a window in white frames on every stretch of the
// curve and the balconies' doors behind the five stacks of balconies on their turquoise posts (rails, striped awnings),
// small windows on the straight side towards the slope (some of them louvred), the stairs' tall windows by the notch,
// the glazed entrance in the notch, the name under the peak's outline on the west wing. Six meshes: the walls, the
// cladding (the walls' material; the phone's own colour), the roofs, the glass, the trim (one vertex-coloured mesh) and
// the name (one canvas atlas).

excludeBuildings([TINZENBLICK.exclude]);
// (the player's walls on the surveyed house and its entrance, not on OSM's outline: js/landmarks.js; the balconies hang
// over the ground, their posts are colliders)
SURVEYED_FOOTPRINTS.set(TINZENBLICK.osm, [TINZENBLICK.house.ring, TINZENBLICK.entrance.ring]);

const STOREY = TINZENBLICK.storey;
const LINE = TINZENBLICK.house.line, TOP = TINZENBLICK.house.top, FOOT = footY();
// v of a wall: metres up the floors' grid, the top floor's top at 40 storeys (the ground floor's foot at 36); each kind
// of wall KIND storeys further up (0 the curve's windows, 1 the balconies' doors, 2 the straight side's small windows);
// closed walls carry v − CLOSED
const UP = 40 * STOREY;
const KIND = 100 * STOREY;
const CLOSED = 400 * STOREY;
// The windows of each kind: half width, sill and head over a floor's foot; the bays along a wall from its middle
const WIN = [{ half: 0.55, lo: 0.9, hi: 2.3 }, { half: 0.5, lo: 0.06, hi: 2.3 }, { half: 0.34, lo: 1.2, hi: 1.95 }];
const BAY = 2.6, BAY_REAR = 3.4;
// Where the shingles begin on the curve: a little under the top floor's foot
const CLAD_Y = FOOT + 3 * STOREY - 0.35;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.6, 0.61, 0.59], SHINGLE = [0.19, 0.235, 0.225], PLINTH = [0.3, 0.3, 0.29], FRAME = [0.52, 0.53, 0.52];
const TEAL = [0.12, 0.3, 0.27];

function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.27, 0.27, 0.26], 0.95);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.1 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.windowed([0.52, 0.53, 0.51], STOREY, WIN[0].lo / STOREY, WIN[0].hi / STOREY, 0.9, 0.35);
    M.clad = SIMPLE_SKINS.windowed([0.17, 0.21, 0.2], STOREY, WIN[0].lo / STOREY, WIN[0].hi / STOREY, 0.85, 0.35);
    M.glass = SIMPLE_SKINS.glow([0.1, 0.13, 0.14], 0.1, 0.6, [1.0, 0.82, 0.58], 0.5);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(60, 200), fine = fade(8, 28);
  const glow = nightGlow();
  // The walls: white plaster, the curve's top floor in shingles, a grey plinth under the ground floor; the windows of
  // each kind with their frames, the panes, a roller blind drawn in some, louvres in some of the small ones
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const half = attribute('aHalf', 'float');
    const closed = step(V, -1);
    const v0 = V.add(closed.mul(CLOSED));
    const kind = floor(v0.div(KIND).add(1e-4));
    const v = v0.sub(kind.mul(KIND));
    const rear = step(1.5, kind), door = step(0.5, kind).mul(float(1).sub(rear));
    const pick = (k) => mix(mix(float(WIN[0][k]), float(WIN[1][k]), door), float(WIN[2][k]), rear);
    const wh = pick('half'), lo = pick('lo'), hi = pick('hi');
    const bayW = mix(float(BAY), float(BAY_REAR), rear);
    const bay = floor(U.div(bayW).add(0.5)), bu = U.sub(bay.mul(bayW));
    const storey = floor(v.div(STOREY)), fv = v.sub(storey.mul(STOREY));
    const rect = (hw, a, b, e = 0.012) => smoothstep(hw.add(e), hw.sub(e), abs(bu)).mul(smoothstep(a.sub(e), a.add(e), fv)).mul(smoothstep(b.add(e), b.sub(e), fv));
    const open = float(1).sub(closed).mul(step(abs(bay.mul(bayW)).add(wh).add(0.25), half)).mul(step(35.5, storey)).mul(step(storey, 39.5));
    const win = rect(wh, lo, hi).mul(open);
    const pane = rect(wh.sub(0.07), lo.add(0.07), hi.sub(0.07)).mul(open);
    // (a post in the middle of the wide ones, a rail across the doors at a third)
    const bars = smoothstep(0.035, 0.02, abs(bu)).mul(float(1).sub(rear)).max(smoothstep(0.03, 0.018, abs(fv.sub(lo.add(0.95)))).mul(door)).mul(near);
    const sill = rect(wh.add(0.06), lo.sub(0.07), lo).mul(open).mul(float(1).sub(door)).mul(near);
    // the wall: plaster, the shingles (their diagonal seams fading out with distance), the plinth
    const clad = step(CLAD_Y - LINE + UP, v).mul(float(1).sub(rear));
    const seams = smoothstep(0.42, 0.48, abs(fract(U.add(v).mul(2.4)).sub(0.5))).max(smoothstep(0.42, 0.48, abs(fract(U.sub(v).mul(2.4)).sub(0.5)))).mul(fine);
    const plaster = mix(vec3(0.55, 0.56, 0.54), vec3(...PLASTER).mul(1.04), worldNoise(0.25));
    const shingles = mix(vec3(...SHINGLE), vec3(...SHINGLE).mul(1.15), worldNoise(0.9)).mul(float(1).sub(seams.mul(0.35)));
    const plinth = step(v, 36 * STOREY - 0.02).mul(float(1).sub(clad));
    let wall = mix(plaster, shingles, clad);
    wall = mix(wall, vec3(...PLINTH).mul(worldNoise(0.6).mul(0.15).add(0.92)), plinth);
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)).add(kind.mul(5.3)));
    const louvre = step(0.55, id).mul(rear).mul(smoothstep(0.3, 0.45, abs(fract(fv.mul(14)).sub(0.5)))).mul(fine).mul(pane);
    const drawn = step(0.55, id).mul(float(1).sub(rear)).mul(mix(float(0.35), float(1), step(0.85, id)));
    const blind = step(hi.sub(0.07).sub(drawn.mul(hi.sub(lo).sub(0.14))), fv).mul(pane).mul(near);
    const glassC = mix(vec3(0.02, 0.026, 0.03), vec3(0.08, 0.1, 0.11), worldNoise(0.07));
    let c = mix(wall, vec3(0.48, 0.48, 0.46), sill);
    c = mix(c, vec3(...FRAME), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.42, 0.42, 0.4), blind.max(louvre.mul(0.8)));
    c = mix(c, vec3(...FRAME), bars.mul(pane));
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind)).mul(float(1).sub(louvre));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    // (flats: lit here and there in the evening, fewer towards midnight; the small ones are bathrooms and the stairs)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)).add(kind.mul(7)), 23, { share: 0.38, late: 0.08, tone: twoTones([1.0, 0.74, 0.44], [0.86, 0.9, 1.0], 0.8) })
      .mul(pane).mul(mix(float(1), float(0.35), blind)).mul(glow.mul(1.1));
    M.plaster = m;
    M.clad = m;
  }
  // The entrance's glazing: dark frames every 1.27 m, a rail at the doors' head, lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.7 });
    const mu = abs(fract(U.div(1.27)).sub(0.5)), mv = abs(V.sub(2.15));
    const frame = smoothstep(0.455, 0.475, mu).max(smoothstep(0.05, 0.03, mv)).mul(near.mul(0.85).add(0.15));
    m.colorNode = mix(vec3(0.06, 0.08, 0.09), vec3(0.2, 0.21, 0.21), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.7), float(0.2), frame);
    m.emissiveNode = vec3(1.0, 0.84, 0.62).mul(float(1).sub(frame)).mul(glow.mul(0.45));
    M.glass = m;
  }
  return M;
}

// --- The name: one canvas atlas -------------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 384];
export const ATLAS = { name: [0, 0, 1024, 384] };
const INK = '#4f7f7a';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  cell('name', (w, h) => {
    // the peak's outline (the Tinzenhorn's pyramid in lines, its flanks hatched) over the name
    g.strokeStyle = INK; g.lineWidth = 7; g.lineJoin = 'round';
    const cx = w * 0.5, top = 14, base = 236, spread = 150;
    g.beginPath(); g.moveTo(cx - spread, base); g.lineTo(cx, top); g.lineTo(cx + spread, base); g.stroke();
    g.lineWidth = 5;
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      g.beginPath(); g.moveTo(cx, top + 30 * t); g.lineTo(cx - spread * t, top + (base - top) * t); g.stroke();
      g.beginPath(); g.moveTo(cx + 8, top + 40 * t); g.lineTo(cx + spread * t * 0.9, top + (base - top) * t); g.stroke();
    }
    g.beginPath(); g.moveTo(cx - spread - 70, base); g.lineTo(cx + spread + 70, base); g.stroke();
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 104px Helvetica, Arial, sans-serif';
    if ('letterSpacing' in g) g.letterSpacing = '10px';
    g.fillText('TINZENBLICK', w / 2, 316, w - 24);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  coping: [0.13, 0.14, 0.14], slab: [0.5, 0.5, 0.48], rail: [0.2, 0.3, 0.29], hand: TEAL, post: TEAL, awning: [0.52, 0.43, 0.2],
  frame: [0.16, 0.17, 0.17], pane: [0.03, 0.04, 0.05], sill: [0.42, 0.42, 0.4], chimney: [0.45, 0.46, 0.47], step: [0.32, 0.32, 0.31]
};

/** The highest ground before a wall F from s0 to s1 */
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.5));
  for (let i = 0; i <= n; i++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * i) / n, 0.5)));
  return hi;
}

/** Where the windows of a kind begin on a wall whose highest ground is `hi`: the first floor whose sills clear it */
function windowsFrom(kind, hi) {
  const need = hi + 0.25 - FOOT - WIN[kind].lo;
  return need <= 0 ? FOOT : FOOT + Math.ceil(need / STOREY) * STOREY;
}

/** A stretch of wall s0–s1 from y0 to y1 into `bucket`: windows of `kind` (or closed) */
function wall(B, bucket, F, s0, s1, y0, y1, kind, windows) {
  if (y1 - y0 < 0.01 || s1 - s0 < 0.01) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const mid = (s0 + s1) / 2;
  const v = (y) => y - LINE + UP + kind * KIND - (windows ? 0 : CLOSED);
  B.quad(bucket, P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[s0 - mid, v(y0)], [s1 - mid, v(y0)], [s1 - mid, v(y1)], [s0 - mid, v(y1)]],
    { half: windows ? (s1 - s0) / 2 : 0 });
}

/** A quad turned to face `want` ([x, y, z]), into the trim with `colour` */
function face(B, p, want, colour, bucket = 'trim') {
  const [a, b, , d] = p;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const q = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0 ? p : [p[0], p[3], p[2], p[1]];
  B.quad(bucket, ...q, undefined, { colour });
}
/** Both sides of a quad */
const panel = (B, p, want, colour) => { face(B, p, want, colour); face(B, p, want.map((x) => -x), colour); };

// The house: the curve's pieces (windows or the balconies' doors, the shingles over them), the straight side's walls
// (small windows, the stretches kept clear), the coping, the roof
function buildHouse(B) {
  const E = TINZENBLICK.entrance;
  for (const p of curvePieces()) {
    const kind = p.door ? 1 : 0;
    const from = Math.min(windowsFrom(kind, groundAlong(p.F, p.s0, p.s1)), CLAD_Y);
    wall(B, 'plaster', p.F, p.s0, p.s1, TINZENBLICK.base, from, kind, false);
    wall(B, 'plaster', p.F, p.s0, p.s1, from, CLAD_Y, kind, true);
    wall(B, 'clad', p.F, p.s0, p.s1, CLAD_Y, TOP, kind, true);
  }
  const ring = outwardRing(TINZENBLICK.house.ring), eRing = E.ring;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    B.box('trim', F, -0.03, F.len + 0.03, -0.3, 0.1, TOP - 0.28, TOP + 0.08, C.coping);
    if (onCurve(a, b)) continue;
    // (the walls over the entrance's roof begin their windows over it)
    const overEntrance = eRing.some((q, k) => sameWall(a, b, q, eRing[(k + 1) % eRing.length]));
    for (const st of wallStretches(a, b)) {
      const hi = overEntrance ? E.top : groundAlong(F, st.from, st.to);
      const from = st.windows && st.to - st.from >= 1.4 ? windowsFrom(2, hi) : TOP;
      wall(B, 'plaster', F, st.from, st.to, TINZENBLICK.base, from, 2, false);
      wall(B, 'plaster', F, st.from, st.to, from, TOP, 2, true);
    }
  }
  flatRoof(B, ring, TOP);
  // the chimney's steel flue on the roof
  const K = TINZENBLICK.chimney, Fk = { a: [K.x - K.half, K.z], u: [1, 0], n: [0, 1] };
  B.box('trim', Fk, 0, 2 * K.half, -K.half, K.half, TOP - 0.1, TOP + K.h, C.chimney);
  B.box('trim', Fk, -0.05, 2 * K.half + 0.05, -K.half - 0.05, K.half + 0.05, TOP + K.h, TOP + K.h + 0.08, C.chimney);
}

// The entrance in the notch: plaster round the glazed front, the doors, a step, its coping and roof
function buildEntrance(B) {
  const E = TINZENBLICK.entrance, F = wallFrame(E.front.a, E.front.b), m = F.len / 2, D = E.door;
  const floorY = groundHeight(...onWall(F, m, 0.8)) + 0.12;
  const base = TINZENBLICK.base;
  wall(B, 'plaster', F, 0, m - D.half, base, E.top, 2, false);
  wall(B, 'plaster', F, m + D.half, F.len, base, E.top, 2, false);
  wall(B, 'plaster', F, m - D.half, m + D.half, base, floorY, 2, false);
  wall(B, 'plaster', F, m - D.half, m + D.half, D.head, E.top, 2, false);
  const P = (s, y) => { const [x, z] = onWall(F, s, 0.02); return [x, y, z]; };
  B.quad('glass', P(m - D.half, floorY), P(m + D.half, floorY), P(m + D.half, D.head), P(m - D.half, D.head),
    [[0, 0], [2 * D.half, 0], [2 * D.half, D.head - floorY], [0, D.head - floorY]]);
  // the frame round the glazing, the doors' leaves, the step
  B.box('trim', F, m - D.half - 0.1, m + D.half + 0.1, 0, 0.08, D.head, D.head + 0.1, C.frame);
  for (const s of [m - D.half - 0.05, m + D.half + 0.05]) B.box('trim', F, s - 0.05, s + 0.05, 0, 0.08, floorY, D.head, C.frame);
  for (const s of [m - 0.9, m, m + 0.9]) B.box('trim', F, s - 0.04, s + 0.04, 0.02, 0.09, floorY, floorY + 2.15, C.frame);
  B.box('trim', F, m - 0.94, m + 0.94, 0.02, 0.09, floorY + 2.12, floorY + 2.2, C.frame);
  B.box('trim', F, m - D.half, m + D.half, 0, 0.9, floorY - 0.6, floorY, C.step);
  // the coping along its front, the roof
  B.box('trim', F, -0.03, F.len + 0.03, -0.3, 0.1, E.top - 0.25, E.top + 0.08, C.coping);
  flatRoof(B, outwardRing(E.ring), E.top);
}

// The stairs' tall windows by the notch on both wings: one at each half landing
function buildStairs(B) {
  const T = TINZENBLICK, h = T.stairs.half;
  for (const [W, s] of [[T.westWing, T.stairs.west], [T.eastWing, T.stairs.east]]) {
    const F = wallFrame(W.a, W.b), g = groundHeight(...onWall(F, s, 0.5));
    for (let k = 0; k < T.floors; k++) {
      const y0 = FOOT + k * STOREY + 1.5, y1 = Math.min(y0 + 1.75, LINE - 0.3);
      if (y0 < g + 0.3) continue;
      B.box('trim', F, s - h, s + h, 0, 0.03, y0, y1, C.frame);
      B.box('trim', F, s - h + 0.07, s + h - 0.07, 0.03, 0.045, y0 + 0.07, y1 - 0.07, C.pane);
      B.box('trim', F, s - h - 0.05, s + h + 0.05, 0, 0.1, y0 - 0.07, y0, C.sill);
    }
  }
}

// The name on the west wing
function buildName(B) {
  const T = TINZENBLICK, F = wallFrame(T.westWing.a, T.westWing.b), n = T.name;
  B.decal(F, n.s0, n.s1, 0.03, n.y0, n.y1, 'name');
}

// The balcony stacks round the curve: at each floor over the ground floor a slab following the curve, its rail of
// turquoise panels with a handrail, the rails across its ends; the striped awning's valance under each slab and under
// the roof; the posts from the ground to the roof's edge
function buildStacks(B) {
  const S = TINZENBLICK.stacks, segs = curveSegments(), up = [0, 1, 0], down = [0, -1, 0];
  const P = (arc, o, y) => { const [x, z] = curvePoint(arc, o); return [x, y, z]; };
  for (const r of stackRanges()) {
    const arcs = [r.from, ...segs.map((g) => g.to).filter((a) => a > r.from + 0.05 && a < r.to - 0.05), r.to];
    // the outward direction of a stretch between two arcs (its segment's normal)
    const outOf = (a0, a1) => { const g = segs.find((q) => (a0 + a1) / 2 <= q.to + 1e-6) || segs[segs.length - 1]; return [g.F.n[0], 0, g.F.n[1]]; };
    const along = (a0, a1) => { const p = curvePoint(a0), q = curvePoint(a1); return [q[0] - p[0], 0, q[1] - p[1]]; };
    const floors = S.floors.map((k) => FOOT + k * STOREY);
    for (const y of floors) {
      for (let i = 0; i + 1 < arcs.length; i++) {
        const a0 = arcs[i], a1 = arcs[i + 1], n = outOf(a0, a1);
        face(B, [P(a0, 0, y), P(a1, 0, y), P(a1, S.out, y), P(a0, S.out, y)], up, C.slab);
        face(B, [P(a0, 0, y - 0.18), P(a1, 0, y - 0.18), P(a1, S.out, y - 0.18), P(a0, S.out, y - 0.18)], down, C.slab);
        face(B, [P(a0, S.out, y - 0.18), P(a1, S.out, y - 0.18), P(a1, S.out, y), P(a0, S.out, y)], n, C.slab);
        // the rail: its panel, the handrail over it
        panel(B, [P(a0, S.out - 0.05, y + 0.1), P(a1, S.out - 0.05, y + 0.1), P(a1, S.out - 0.05, y + S.rail - 0.07), P(a0, S.out - 0.05, y + S.rail - 0.07)], n, C.rail);
        face(B, [P(a0, S.out - 0.1, y + S.rail), P(a1, S.out - 0.1, y + S.rail), P(a1, S.out + 0.02, y + S.rail), P(a0, S.out + 0.02, y + S.rail)], up, C.hand);
        face(B, [P(a0, S.out + 0.02, y + S.rail - 0.08), P(a1, S.out + 0.02, y + S.rail - 0.08), P(a1, S.out + 0.02, y + S.rail), P(a0, S.out + 0.02, y + S.rail)], n, C.hand);
      }
      // the slab's ends and the rails across them
      for (const [a, sgn] of [[r.from, -1], [r.to, 1]]) {
        const d = along(r.from, r.to), l = Math.hypot(d[0], d[2]), e = [(sgn * d[0]) / l, 0, (sgn * d[2]) / l];
        face(B, [P(a, 0, y - 0.18), P(a, S.out, y - 0.18), P(a, S.out, y), P(a, 0, y)], e, C.slab);
        panel(B, [P(a, 0.05, y + 0.1), P(a, S.out - 0.05, y + 0.1), P(a, S.out - 0.05, y + S.rail - 0.07), P(a, 0.05, y + S.rail - 0.07)], e, C.rail);
        face(B, [P(a, 0, y + S.rail), P(a, S.out, y + S.rail), P(a, S.out, y + S.rail + 0.04), P(a, 0, y + S.rail + 0.04)], e, C.hand);
      }
    }
    // the awnings' valances: under each slab and under the roof's edge, at the slab's outer edge
    for (const yAbove of [...floors.map((y) => y - 0.18), TOP - 0.3]) {
      for (let i = 0; i + 1 < arcs.length; i++) {
        const a0 = arcs[i], a1 = arcs[i + 1], n = outOf(a0, a1);
        panel(B, [P(a0, S.out - 0.12, yAbove - 0.26), P(a1, S.out - 0.12, yAbove - 0.26), P(a1, S.out - 0.12, yAbove), P(a0, S.out - 0.12, yAbove)], n, C.awning);
      }
    }
  }
  // the posts
  for (const [x, z] of stackPosts()) {
    const F = { a: [x - 0.05, z], u: [1, 0], n: [0, 1] }, g = groundHeight(x, z);
    B.box('trim', F, 0, 0.1, -0.05, 0.05, g - 0.3, TOP - 0.3, C.post);
  }
}

/**
 * Builds the Tinzenblick into `scene`. Returns { group, colliders }: the balconies' posts on the ground, at world
 * heights (baseY set, so liftColliders leaves them be); the house's and the entrance's walls are the registered outlines'.
 */
export function buildTinzenblick(scene) {
  const root = new THREE.Group();
  root.name = 'Tinzenblick';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['plaster', 'clad'], name: 'Tinzenblick' }), M = materials();
  buildHouse(B);
  buildEntrance(B);
  buildStairs(B);
  buildName(B);
  buildStacks(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  const colliders = [];
  for (const [cx, cz] of stackPosts()) {
    const y0 = groundHeight(cx, cz), y1 = TOP - 0.3, hx = 0.08, hz = 0.08, cs = 1, sn = 0;
    colliders.push({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } });
  }
  return { group: root, colliders };
}
