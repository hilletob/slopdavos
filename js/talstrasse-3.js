import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, positionWorld, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, worldNoise } from './building-kit.js';
import {
  ATLAS, ATLAS_SIZE, EXCLUDE, HOUSES, KIND, allParts, baseOf, faceWall, faceWalls, groundOutlines, lookFor, onWall, pointInRing,
  roofRingOf, saddleFrame, saddleY, wallFrame, wallTopOf, wallsOf
} from './talstrasse-3-data.js';

export { HOUSES, ATLAS };

// The houses along the Talstrasse between the Sportzentrum and Bünda rebuilt by hand (js/talstrasse-3-data.js), standing
// in for their swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows:
// each house's surveyed walls in its own plaster, boards, ribbed metal or logs, its windows drawn by the walls' material
// from their uv (bays along the wall from its middle, storeys up the house's grid) with white frames, shutters, blinds or
// ribbons of glazing, a few lit at night; flat roofs with their fascias and the eaves' soffits, a shallow hipped roof
// and a saddle roof; balconies, garage doors, house doors and canopies, the Stiffler hall's billboard and the Hotel
// Cresta Sun's name. One merged mesh per material for the whole row: the walls, the roofs, the trim (vertex-coloured)
// and the decals (one canvas atlas).

excludeBuildings(EXCLUDE);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js)
for (const [osm, rings] of groundOutlines()) SURVEYED_FOOTPRINTS.set(osm, rings);

// v of a wall: storeys up the house's grid, the floor at UP; closed walls carry v − CLOSED
const UP = 40;
const CLOSED = 300;

// --- A builder whose walls carry their windows' kind and their skin -------------------------------------------------------
class RowBuilder extends Builder {
  constructor(opts) {
    super(opts);
    this.extra = { win: [], skin: [] };
  }
  quad(name, a, b, c, d, uvs, opt = {}) {
    super.quad(name, a, b, c, d, uvs, opt);
    this.more(name, 6, opt);
  }
  tri(name, a, b, c, uvs, opt = {}) {
    super.tri(name, a, b, c, uvs, opt);
    this.more(name, 3, opt);
  }
  more(name, n, { win = [0, 0, 0, 0], skin = [0, 1] } = {}) {
    if (name !== 'walls') return;
    for (let i = 0; i < n; i++) { this.extra.win.push(...win); this.extra.skin.push(...skin); }
  }
  meshes(M) {
    const out = super.meshes(M);
    for (const m of out) {
      if (m.name !== `${this.name} walls`) continue;
      m.geometry.setAttribute('aWin', new THREE.Float32BufferAttribute(this.extra.win, 4));
      m.geometry.setAttribute('aSkin', new THREE.Float32BufferAttribute(this.extra.skin, 2));
    }
    return out;
  }
}

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.16, 0.155, 0.15];
// (a rectangle whose sizes are nodes: |x| < hw, lo < y < hi)
const rectN = (x, y, hw, lo, hi, e) => smoothstep(hw.add(e), hw.sub(e), abs(x)).mul(smoothstep(lo.sub(e), lo.add(e), y)).mul(smoothstep(hi.add(e), hi.sub(e), y));

function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: each wall's own colour, a lit band per storey at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], 1, 0.3, 0.74, 0.88, 0.35, { bay: 1, half: 0.2 });
    M.walls.vertexColors = true;
    return M;
  }
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const U = uv().x, V = uv().y;
  const half = attribute('aHalf', 'float'), W = attribute('aWin', 'vec4'), S = attribute('aSkin', 'vec2');
  const base = attribute('color', 'vec3');
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  // the skin: plaster (a little uneven), horizontal boards, vertical boards or ribbed metal, logs
  const is = (n, k) => step(abs(n.sub(k)), 0.5);
  const yW = positionWorld.y, um = U.mul(S.y);
  const plasterC = base.mul(worldNoise(0.4).mul(0.1).add(0.94));
  const bj = fract(yW.div(0.16));
  const boardsC = base.mul(float(1).sub(smoothstep(0.1, 0.0, bj).max(smoothstep(0.9, 1.0, bj)).mul(fine).mul(0.35)));
  const rib = fract(um.div(0.3));
  const ribsC = base.mul(mix(float(1), mix(float(0.86), float(1.07), smoothstep(0.25, 0.45, rib).mul(smoothstep(0.95, 0.75, rib))), fine));
  const course = floor(yW.div(0.19)), fc = fract(yW.div(0.19));
  const logJoint = smoothstep(0.12, 0.0, fc).max(smoothstep(0.88, 1.0, fc)).mul(fine).mul(0.45);
  const logsC = base.mul(hash(course.mul(17.3)).mul(0.3).add(0.85)).mul(float(1).sub(logJoint));
  let wall = mix(plasterC, boardsC, is(S.x, 1));
  wall = mix(wall, ribsC, is(S.x, 2));
  wall = mix(wall, logsC, is(S.x, 3));
  // the windows: a bay per window from the wall's middle, a storey per row; their kind
  const bay = floor(U.add(0.5)), bu = U.sub(bay), st = floor(V), fv = V.sub(st);
  const kind = W.w, ribbon = is(kind, 3), blindsK = is(kind, 4), shutters = is(kind, 1).add(is(kind, 2));
  const open = step(0, V).mul(step(abs(bay).add(0.5), half.add(0.001)));
  const wx = W.x, lo = W.y, hi = W.z;
  const frame = rectN(bu, fv, wx, lo, hi, float(0.006)).mul(open);
  const pane = rectN(bu, fv, wx.sub(0.03), lo.add(0.025), hi.sub(0.025), float(0.004)).mul(open);
  const post = smoothstep(0.014, 0.007, abs(bu)).mul(float(1).sub(ribbon)).mul(fine);
  const glass = pane.mul(float(1).sub(post));
  const sill = rectN(bu, fv, wx.add(0.03), lo.sub(0.03), lo, float(0.004)).mul(open).mul(float(1).sub(ribbon)).mul(near);
  // shutters beside the window, their louvres
  const shutter = rectN(abs(bu).sub(wx.mul(1.5).add(0.012)), fv, wx.mul(0.5), lo, hi, float(0.006)).mul(open).mul(shutters);
  const louvre = smoothstep(0.35, 0.5, fract(fv.mul(40))).mul(fine).mul(0.3);
  const shutterC = mix(vec3(0.42, 0.035, 0.025), vec3(0.05, 0.16, 0.07), is(kind, 2)).mul(float(1).sub(louvre));
  // blinds drawn down to a height of their own, or curtains
  const id = hash(bay.mul(37.7).add(st.mul(91.3)).add(half.mul(13.1)).add(lo.mul(71.9)));
  const drawn = step(0.35, id).mul(id).mul(0.85);
  const span = hi.sub(lo).sub(0.05);
  const blind = step(hi.sub(0.025).sub(drawn.mul(span)), fv).mul(glass).mul(blindsK);
  const blindC = vec3(0.33, 0.31, 0.28).mul(float(1).sub(smoothstep(0.4, 0.5, fract(fv.mul(55))).mul(fine).mul(0.25)));
  const curtain = step(0.7, id).mul(step(hi.sub(0.025).sub(mix(float(0.25), float(0.6), step(0.88, id)).mul(span)), fv)).mul(glass)
    .mul(float(1).sub(blindsK)).mul(float(1).sub(ribbon)).mul(near);
  const glassC = mix(vec3(0.02, 0.024, 0.028), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
  let c = mix(wall, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, shutterC, shutter);
  c = mix(c, mix(vec3(0.6, 0.6, 0.58), vec3(0.08, 0.08, 0.085), ribbon), frame);
  c = mix(c, glassC, glass);
  c = mix(c, blindC, blind);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  m.colorNode = c;
  const shiny = glass.mul(float(1).sub(blind)).mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.88), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (houses of flats and a hotel: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay, st.add(half.mul(3.3)).add(lo.mul(17.0)), 61, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(glass).mul(float(1).sub(blind.mul(0.6))).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1));
  M.walls = m;
  return M;
}

// --- The atlas: the Stiffler billboard, the Cresta Sun's name, a door, a garage door ------------------------------------------
function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // the billboard: a white panel, the slogan on the left, a red lorry on the right, the firm's name on a blue band
  cell('stiffler', (w, h) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9aa0a4'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#c4281e'; g.font = 'bold 30px Arial, sans-serif'; g.textBaseline = 'top';
    g.fillText('Transporte', 22, 24); g.fillText('sind unser', 22, 60); g.fillText('Geschäft', 22, 96);
    // the lorry: its cab and its box
    g.fillStyle = '#b8231b'; g.fillRect(300, 40, 180, 100);
    g.fillStyle = '#d23a2e'; g.fillRect(250, 70, 56, 70);
    g.fillStyle = '#1d2a33'; g.fillRect(258, 78, 40, 26);
    g.fillStyle = '#202020';
    for (const x of [270, 330, 450]) { g.beginPath(); g.arc(x, 146, 14, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#1f4f9a'; g.fillRect(6, h - 84, w - 12, 78);
    g.fillStyle = '#ffffff'; g.font = 'bold 54px Arial, sans-serif'; g.textBaseline = 'middle';
    g.fillText('STIFFLER', 26, h - 45);
    g.font = 'bold 18px Arial, sans-serif'; g.fillText('stiffler-ag.ch', w - 150, h - 45);
  });
  // the hotel's name: the sun rising over a blue arc above HOTEL CRESTA SUN (transparent round it)
  cell('cresta', (w, h) => {
    g.fillStyle = '#f2c21b'; g.beginPath(); g.arc(w / 2, 58, 34, Math.PI, 0); g.fill();
    g.fillRect(w / 2 - 34, 56, 68, 4);
    g.strokeStyle = '#2a5ea8'; g.lineWidth = 7; g.beginPath(); g.arc(w / 2, 108, 62, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.fillStyle = '#23407a'; g.font = 'bold 40px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('HOTEL CRESTA SUN', w / 2, h - 34);
    g.textAlign = 'left';
  });
  // a house door: dark boards, a pane, a handle
  cell('door', (w, h) => {
    g.fillStyle = '#3b2416'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4c3020'; for (let i = 0; i < 4; i++) g.fillRect(3 + i * 9, 3, 7, h - 3);
    g.fillStyle = '#1b2329'; g.fillRect(w * 0.25, h * 0.12, w * 0.5, h * 0.3);
    g.fillStyle = '#b8b2a4'; g.fillRect(w * 0.75, h * 0.52, 5, 3);
  });
  // a garage door: light grey panels with their joints
  cell('gate', (w, h) => {
    g.fillStyle = '#c9c8c2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9d9c96'; for (let i = 1; i < 5; i++) g.fillRect(0, (i * h) / 5 - 1, w, 2);
    g.fillStyle = '#86857f'; g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h);
  });
  return canvasTexture(canvas);
}

// --- Geometry helpers -----------------------------------------------------------------------------------------------------
const C = { plinth: [0.2, 0.195, 0.19], step: [0.26, 0.255, 0.245], frame: [0.6, 0.6, 0.58], gateFrame: [0.3, 0.3, 0.3], chimney: [0.42, 0.41, 0.39], cap: [0.12, 0.12, 0.12] };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A quad facing away from `centre` (its corners turned round if they face it) */
function quadOut(B, bucket, pts, centre, opt = {}) {
  const [a, b, c, d] = pts;
  const n = cross(sub(b, a), sub(d, a)), m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  B.quad(bucket, ...(dot(n, sub(m, centre)) >= 0 ? [a, b, c, d] : [a, d, c, b]), undefined, opt);
}
/** A flat face over an outline facing down at `y` (the eaves' soffits, an upper part's underside) */
function flatUnder(B, ring, y, colour) {
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = [ring[i], ring[j], ring[k]].map((q) => [q[0], y, q[1]]);
    const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
    const t = up ? [p[0], p[2], p[1]] : p;
    B.tri('trim', t[0], t[1], t[2], undefined, { colour });
  }
}
// (a point inside a ring, its edges counting as inside within a few centimetres)
function pointInRingLoose(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// The highest ground along a wall, half a metre out of it (from s0 to s1)
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}

// Every part with its walls' top and its own extent in height, for the walls hidden behind a neighbouring part
const PARTS = allParts().map((q) => ({ ...q, from: q.part.from ?? baseOf(q.house), wallTop: wallTopOf(q.house, q.part), top: q.part.top }));
/** How high a part of the row covers the point (x, z) from the ground: the highest top of the parts standing there from below
 * `y0` (not `self`) */
function coveredTo(self, x, z, y0) {
  let h = -Infinity;
  for (const p of PARTS) {
    if (p.part === self || p.from > y0 + 0.05) continue;
    if (pointInRingLoose(p.part.ring, x, z)) h = Math.max(h, p.part.roof === 'none' ? p.top : Math.max(p.wallTop, p.top - 0.05));
  }
  return h;
}

// --- The walls ----------------------------------------------------------------------------------------------------------------
/** The look of a storey k of a wall: the levels' override over the wall's look */
function levelLook(L, k) {
  const kk = Math.max(0, Math.min(k, Math.max(0, L.floors - 1)));
  return { ...L, ...(L.levels[kk] || {}) };
}

/**
 * A part's wall: from y0 (s) to its top topAt(s), split into zones of one look (a band below the first storey whose windows
 * clear the ground, the storeys with windows, the band over the last), each zone one quad per stretch.
 */
function buildWall(B, house, part, F, topAt, seg) {
  const L = lookFor(house, part, F);
  const { floor: fl } = house, st = L.storey, bay = L.bay;
  const mid = F.len / 2;
  const windows = !L.closed && F.len >= 1.6 * bay;
  const halfBays = windows ? mid / bay : 0;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  for (const { s0, s1, y0 } of seg) {
    // the first storey whose windows clear the highest ground along the stretch by 0.15 m
    const g = groundAlong(F, s0, s1);
    let k0 = 0;
    while (fl + k0 * st + L.win[1] * st < g + 0.15) k0++;
    // the zones: [lo, hi, look, open]
    const yMax = Math.max(topAt(s0), topAt(s1));
    const zones = [];
    const kMin = Math.floor((y0 - fl) / st), kMax = Math.ceil((yMax - fl) / st);
    for (let k = kMin; k <= kMax; k++) {
      const lo = Math.max(y0, fl + k * st), hi = Math.min(yMax, fl + (k + 1) * st);
      if (hi <= lo + 1e-4) continue;
      const lk = levelLook(L, k);
      const open = windows && !lk.closed && k >= k0 && k < L.floors;
      const key = JSON.stringify([lk.colour, lk.skin, lk.win, open]);
      const last = zones[zones.length - 1];
      if (last && last.key === key && Math.abs(last.hi - lo) < 1e-6) last.hi = hi;
      else zones.push({ lo, hi, look: lk, open, key });
    }
    for (const z of zones) {
      // (cut where the top crosses the zone's top, so that min(top, zone) stays straight on each piece)
      const cuts = [s0, s1];
      const ta = topAt(s0), tb = topAt(s1);
      if ((ta - z.hi) * (tb - z.hi) < 0) cuts.splice(1, 0, s0 + ((z.hi - ta) / (tb - ta)) * (s1 - s0));
      for (let i = 0; i + 1 < cuts.length; i++) {
        const a = cuts[i], b = cuts[i + 1];
        const ha = Math.min(z.hi, topAt(a)), hb = Math.min(z.hi, topAt(b));
        if (Math.max(ha - z.lo, hb - z.lo) < 0.005) continue;
        const la = Math.min(z.lo, ha), lb = Math.min(z.lo, hb);
        const v = (y) => (y - fl) / st + UP - (z.open ? 0 : CLOSED);
        const opt = { half: z.open ? halfBays : 0, colour: z.look.colour, win: z.look.win, skin: [z.look.skin, bay] };
        B.quad('walls', P(a, la), P(b, lb), P(b, hb), P(a, ha), [[(a - mid) / bay, v(la)], [(b - mid) / bay, v(lb)], [(b - mid) / bay, v(hb)], [(a - mid) / bay, v(ha)]], opt);
      }
    }
  }
}

// A plinth of grey render along a wall's foot, a little over the ground (where the wall reaches down to it)
function plinth(B, F, s0, s1, base) {
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.5));
  const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
  for (let k = 0; k < n; k++) {
    const a = s0 + ((s1 - s0) * k) / n, b = s0 + ((s1 - s0) * (k + 1)) / n;
    const ga = groundHeight(...onWall(F, a, 0.3)) + 0.3, gb = groundHeight(...onWall(F, b, 0.3)) + 0.3;
    B.quad('trim', P(a, base), P(b, base), P(b, Math.max(gb, base + 0.2)), P(a, Math.max(ga, base + 0.2)), undefined, { colour: C.plinth });
  }
}

// A part's walls: each wall cut where a neighbouring part (of this house or the next) stands before it, from that part's
// top up; the walls' tops under the roof
function buildPartWalls(B, house, part) {
  const from = part.from ?? baseOf(house);
  let topAt, bends = () => [];
  if (part.roof && part.roof.kind === 'saddle') {
    const S = saddleFrame(part);
    topAt = (F) => (s) => saddleY(part, S, S.loc(onWall(F, s, -0.05))[1]) - 0.06;
    // (a gable's top bends where it crosses the ridge)
    bends = (F) => {
      const ca = S.loc(F.a)[1], cb = S.loc(onWall(F, F.len))[1];
      return (ca - S.cr) * (cb - S.cr) < 0 ? [((S.cr - ca) / (cb - ca)) * F.len] : [];
    };
  } else {
    const t = wallTopOf(house, part);
    topAt = () => () => t;
  }
  for (const F of wallsOf(part.ring)) {
    const top = topAt(F);
    // the stretches: where the part before the wall (0.3 m out) changes
    const seg = [];
    const step = 0.5, n = Math.max(1, Math.ceil(F.len / step));
    let cur = null;
    for (let k = 0; k < n; k++) {
      const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
      const cov = coveredTo(part, ...onWall(F, (a + b) / 2, 0.3), from);
      const y0 = Math.max(from, cov - 0.02);
      if (cur && Math.abs(cur.y0 - y0) < 1e-6) cur.s1 = b;
      else seg.push((cur = { s0: a, s1: b, y0 }));
    }
    for (const sb of bends(F)) {
      const i = seg.findIndex((q) => q.s0 < sb - 1e-6 && q.s1 > sb + 1e-6);
      if (i >= 0) seg.splice(i, 1, { ...seg[i], s1: sb }, { ...seg[i], s0: sb });
    }
    const visible = seg.filter((q) => q.y0 < Math.max(top(q.s0), top(q.s1)) - 0.01);
    buildWall(B, house, part, F, top, visible);
    if (part.from === undefined) for (const q of visible) if (q.y0 <= from + 1e-6) plinth(B, F, q.s0, q.s1, from);
  }
}

// --- The roofs ----------------------------------------------------------------------------------------------------------------
function buildRoof(B, house, part) {
  const L = lookFor(house, part), fd = L.fasciaDepth;
  const roof = part.roof || {};
  const soffit = L.fascia.map((v) => v * 0.8);
  if (part.from !== undefined) flatUnder(B, part.ring, part.from, soffit);
  if (roof === 'none') return;
  if (roof.kind === 'saddle') return saddleRoof(B, house, part, L);
  const ring = roofRingOf(part);
  if (roof.kind === 'hip') {
    const y = roof.eaves;
    const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cz = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    const apex = [cx, part.top, cz];
    for (const F of wallsOf(ring)) {
      const a = [F.a[0], y, F.a[1]], bb = onWall(F, F.len), b = [bb[0], y, bb[1]];
      // (facing up and out: counter-clockwise seen from above the slope)
      const n = cross(sub(b, a), sub(apex, a));
      if (n[1] >= 0) B.tri('roof', a, b, apex, [[a[0], a[2]], [b[0], b[2]], [apex[0], apex[2]]]);
      else B.tri('roof', a, apex, b, [[a[0], a[2]], [apex[0], apex[2]], [b[0], b[2]]]);
    }
    fascia(B, ring, y, 0.22, L.fascia);
    flatUnder(B, ring, y - 0.22, soffit);
    return;
  }
  flatRoof(B, ring, part.top);
  fascia(B, ring, part.top, fd, L.fascia);
  if (roof.ring) flatUnder(B, ring, part.top - fd, soffit);
}
// The fascia round a roof's outline: `depth` down from its top `y`
function fascia(B, ring, y, depth, colour) {
  for (const F of wallsOf(ring)) {
    const P = (s, yy) => { const [x, z] = onWall(F, s); return [x, yy, z]; };
    B.quad('trim', P(0, y - depth), P(F.len, y - depth), P(F.len, y + 0.03), P(0, y + 0.03), undefined, { colour });
  }
}
// The chalet's saddle roof: its two planes over the walls with their overhang, the soffits, the fascia round them, the
// ridge's cap, a small window in each gable
function saddleRoof(B, house, part, L) {
  const S = saddleFrame(part);
  const P = (t, c, dy = 0) => { const [x, z] = S.toWorld(t, c); return [x, saddleY(part, S, c) + dy, z]; };
  const mid = S.toWorld((S.t0 + S.t1) / 2, S.cr);
  for (const [c0, c1] of [[S.c0, S.cr], [S.cr, S.c1]]) {
    const q = [P(S.t0, c0), P(S.t0, c1), P(S.t1, c1), P(S.t1, c0)];
    quadOut(B, 'roof', q, [mid[0], -40, mid[1]]);
    quadOut(B, 'trim', q.map((p) => [p[0], p[1] - 0.08, p[2]]), [mid[0], 40, mid[1]], { colour: [0.09, 0.05, 0.028] });
  }
  const centre = [mid[0], part.roof.eaves, mid[1]];
  for (const t of [S.t0, S.t1]) for (const [c0, c1] of [[S.c0, S.cr], [S.cr, S.c1]]) quadOut(B, 'trim', [P(t, c0, 0.03), P(t, c1, 0.03), P(t, c1, -0.28), P(t, c0, -0.28)], centre, { colour: L.fascia });
  for (const c of [S.c0, S.c1]) quadOut(B, 'trim', [P(S.t0, c, 0.03), P(S.t1, c, 0.03), P(S.t1, c, -0.28), P(S.t0, c, -0.28)], centre, { colour: L.fascia });
  const R = wallFrame(S.toWorld(S.t0, S.cr), S.toWorld(S.t1, S.cr));
  B.box('trim', R, 0, R.len, -0.14, 0.14, part.top - 0.02, part.top + 0.1, ROOF.map((v) => v * 0.8));
  // the gables' small windows under the ridge
  for (const F of wallsOf(part.ring)) {
    const [, cm] = S.loc(onWall(F, F.len / 2));
    if (Math.abs(cm - S.cr) > 1) continue;
    const y = part.roof.eaves + 1.0;
    B.box('trim', F, F.len / 2 - 0.5, F.len / 2 + 0.5, 0, 0.05, y, y + 1.1, C.frame);
    B.box('trim', F, F.len / 2 - 0.4, F.len / 2 + 0.4, 0.05, 0.07, y + 0.1, y + 1.0, [0.025, 0.03, 0.035]);
  }
}

// --- Balconies, doors, garage doors, signs ---------------------------------------------------------------------------------
/** Is a point (x, z) at height y inside another part of the row than `self`? */
const insideOther = (self, x, z, y) => PARTS.some((p) => p.part !== self && p.from <= y && p.top > y && pointInRingLoose(p.part.ring, x, z));

function balconies(B, house, spec) {
  const part = house.parts[spec.part], L = lookFor(house, part);
  const walls = spec.all ? faceWalls(part.ring, spec.deg, spec.tol ?? 40).filter((F) => F.len >= 3.5) : [faceWall(part.ring, spec.deg, spec.tol ?? 40)];
  for (const F of walls) {
    if (!F) continue;
    const s0 = spec.from * F.len, s1 = spec.to * F.len, d = spec.depth;
    for (const k of spec.floors) {
      const y = house.floor + k * L.storey;
      if (y > wallTopOf(house, part) - 1.2) continue;
      // (none inside a neighbouring part)
      if ([s0 + 0.3, (s0 + s1) / 2, s1 - 0.3].some((s) => insideOther(part, ...onWall(F, s, d / 2), y + 0.5))) continue;
      B.box('trim', F, s0, s1, 0, d, y - 0.2, y, spec.slab);
      const h = spec.closedBox ? L.storey - 0.25 : 1.0;
      // the front and its two ends (glass, timber or metal)
      B.box('trim', F, s0, s1, d - 0.06, d, y, y + h, spec.front);
      B.box('trim', F, s0, s0 + 0.06, 0, d - 0.06, y, y + h, spec.front);
      B.box('trim', F, s1 - 0.06, s1, 0, d - 0.06, y, y + h, spec.front);
      if (spec.glass || spec.rail) B.box('trim', F, s0, s1, d - 0.08, d + 0.02, y + h, y + h + 0.05, [0.15, 0.15, 0.15]);
    }
  }
}

function door(B, house, spec) {
  const part = house.parts[spec.part], F = faceWall(part.ring, spec.deg);
  if (!F) return;
  const s = spec.at * F.len, half = spec.w / 2;
  const g = groundAlong(F, s - half - 0.3, s + half + 0.3), y0 = Math.max(g + 0.12, house.floor), y1 = y0 + 2.15;
  const base = baseOf(house);
  B.box('trim', F, s - half - 0.1, s + half + 0.1, 0, 0.06, y0, y1 + 0.1, C.frame);
  B.decal(F, s - half, s + half, 0.07, y0, y1, 'door');
  B.box('trim', F, s - half - 0.3, s + half + 0.3, 0, 0.6, base, y0, C.step);
  if (spec.canopy) B.box('trim', F, s - half - 0.7, s + half + 0.7, 0, 1.5, y1 + 0.3, y1 + 0.45, [0.5, 0.5, 0.49]);
}

function gates(B, house, spec) {
  const part = house.parts[spec.part], F = faceWall(part.ring, spec.deg);
  if (!F) return;
  const a = spec.from * F.len, b = spec.to * F.len, w = (b - a) / spec.n;
  for (let i = 0; i < spec.n; i++) {
    const s0 = a + i * w + 0.25, s1 = a + (i + 1) * w - 0.25;
    if (insideOther(part, ...onWall(F, (s0 + s1) / 2, 0.5), house.floor + 1)) continue;
    const y0 = Math.max(house.floor, groundAlong(F, s0, s1) - 0.02);
    B.box('trim', F, s0 - 0.08, s1 + 0.08, 0, 0.04, y0, y0 + spec.h + 0.08, C.gateFrame);
    B.decal(F, s0, s1, 0.05, y0, y0 + spec.h, 'gate');
  }
}

// --- The row ----------------------------------------------------------------------------------------------------------------
/** Camera spots along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // from the Talstrasse by the WEF gate, east: the block with the timber top floor, the office house, the Stiffler hall
  block39: [74, -16.9, -394, 112, -9, -378],
  // from the Talstrasse by the salmon twin, east-north-east: the salmon block, the garages, the Cresta Sun beyond
  pink: [200, -14.85, -452, 255, -6, -462],
  // from the Talstrasse at the Hertistrasse, east: the cream block, the low wing and the Hotel Cresta Sun; the yellow block left
  cresta: [318, -13.6, -522, 368, -6, -512]
};

/**
 * Builds the row into `scene`. Returns { group, colliders }: no colliders of its own (the player's walls stand on the
 * surveyed outlines, js/landmarks.js; balconies and canopies hang over the ground, the doors' steps stand within 0.6 m
 * of the walls).
 */
export function buildTalstrasse3(scene) {
  const root = new THREE.Group();
  root.name = 'Talstrasse Sportzentrum–Bünda';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new RowBuilder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Talstrasse 3' }), M = materials();
  for (const house of HOUSES) {
    for (const part of house.parts) {
      buildPartWalls(B, house, part);
      buildRoof(B, house, part);
    }
    for (const spec of house.balconies || []) balconies(B, house, spec);
    for (const spec of house.doors || []) door(B, house, spec);
    for (const spec of house.gates || []) gates(B, house, spec);
    if (house.chimney) {
      const { at, half, top } = house.chimney, part = house.parts[0], S = saddleFrame(part);
      const F = wallFrame([at[0] - S.u[0] * half - S.n[0] * half, at[1] - S.u[1] * half - S.n[1] * half], [at[0] + S.u[0] * half - S.n[0] * half, at[1] + S.u[1] * half - S.n[1] * half]);
      const yr = saddleY(part, S, S.loc(at)[1]) - 0.6;
      B.box('trim', F, 0, 2 * half, 0, 2 * half, yr, top, C.chimney);
      B.box('trim', F, -0.08, 2 * half + 0.08, -0.08, 2 * half + 0.08, top, top + 0.12, C.cap);
    }
    if (house.billboard) {
      const { part: pi, deg, from, to, y0, y1 } = house.billboard, F = faceWall(house.parts[pi].ring, deg);
      B.box('trim', F, from * F.len - 0.15, to * F.len + 0.15, 0, 0.12, house.floor + y0 - 0.15, house.floor + y1 + 0.15, [0.5, 0.52, 0.53]);
      B.decal(F, from * F.len, to * F.len, 0.13, house.floor + y0, house.floor + y1, 'stiffler');
    }
    if (house.canopy) {
      const { part: pi, deg, from, to, y, depth } = house.canopy, F = faceWall(house.parts[pi].ring, deg);
      B.box('trim', F, from * F.len, to * F.len, 0, depth, house.floor + y, house.floor + y + 0.35, [0.45, 0.46, 0.47]);
    }
    if (house.sign) {
      const { part: pi, deg, from, to, y0, y1, key } = house.sign, F = faceWall(house.parts[pi].ring, deg);
      B.decal(F, from * F.len, to * F.len, 0.04, house.floor + y0, house.floor + y1, key);
    }
  }
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}

export { pointInRing, KIND };
