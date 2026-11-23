import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, max, mix, mx_noise_float, positionView, positionWorld, smoothstep, step, time, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { cityUniforms } from './tsl-materials.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, decalMaterial } from './spital.js';
import { onWall, outwardRing, pointInRing, wallFrame } from './spital-data.js';
import { BELVEDERE, balconyBays, clearStretches, facesFront, isOldFront, nameFrame, part, toOld, wallStretches } from './belvedere-data.js';

export { BELVEDERE };

// The Grandhotel Belvédère rebuilt by hand (js/belvedere-data.js), standing in for its swissBUILDINGS3D volumes, which
// the streamed tiles drew as white blocks with the town houses' windows: the long wing in white plaster with six floors
// of balconies over the ground floor's canopy, the glazed stair at its west end and the name standing on its roof; the
// east block with its two groups of loggias under round arches (a canvas decal) over the lower front and its terrace;
// the old house in the west with its front drawn after the photograph (arched windows on the main floor, pilasters,
// cornices: one canvas decal per wall), the porch with its columns, the pediment, the slate dome with its dormers and
// lantern and the hipped roof beside it. The windows elsewhere are drawn by the walls' material from their uv (a window
// per bay and floor; on the old house arched ones). Eight meshes: the hotel's walls, the old house's, the flat roofs,
// the slate, the glass, the trim (one vertex-coloured mesh), the decals. The hotel's fascia board (js/shops.js) gives
// way to the name on the roof.

excludeBuildings(BELVEDERE.exclude);
SHOP_EXCLUSIONS.add(BELVEDERE.osm);

const UP = 20 * 4.6, CLOSED = 300 * 4.6; // v: up the floors' grid from 20 storeys under each roof; closed walls − CLOSED
const PLASTER = [0.6, 0.585, 0.55], OLD_PLASTER = [0.6, 0.57, 0.5];
// The colours of the trim (linear)
const C = {
  white: [0.72, 0.71, 0.68], cornice: [0.66, 0.64, 0.6], grey: [0.2, 0.2, 0.2], slab: [0.55, 0.54, 0.51], rail: [0.75, 0.75, 0.73],
  canopy: [0.18, 0.19, 0.2], steel: [0.05, 0.052, 0.056], slate: [0.11, 0.13, 0.155], stone: [0.42, 0.4, 0.36], lead: [0.3, 0.33, 0.35]
};

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
// Plaster with a window in a white frame per bay and floor (an arched head on the old house), a few lit at night
function wallMaterial({ storey, bay, window: WIN }, plaster, arch) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const U = uv().x, V = uv().y;
  const dist = positionView.z.negate(), near = float(1).sub(smoothstep(140, 420, dist));
  const noise = (s) => mx_noise_float(positionWorld.mul(s)).mul(0.5).add(0.5);
  const glow = smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow), late = smoothstep(1.3, 1.55, cityUniforms.uInteriorGlow);
  const half = attribute('aHalf', 'float'); // half the wall's length; 0: a closed wall
  const v = V.add(step(V, -1).mul(CLOSED));
  const b = floor(U.div(bay).add(0.5)), bu = U.sub(b.mul(bay));
  const st = floor(v.div(storey)), fv = v.sub(st.mul(storey));
  const open = step(abs(b.mul(bay)).add(WIN.half + 0.4), half);
  const e = 0.015;
  // the opening: a rectangle, on the old house with a half round on it
  const shape = (hw, lo, hi) => {
    const rect = smoothstep(hw + e, hw - e, abs(bu)).mul(smoothstep(lo - e, lo + e, fv)).mul(smoothstep(hi + e, hi - e, fv));
    if (!arch) return rect;
    const r = bu.mul(bu).add(fv.sub(hi).mul(fv.sub(hi))).sqrt();
    return max(rect, smoothstep(hw + e, hw - e, r).mul(step(hi, fv)));
  };
  const win = shape(WIN.half + 0.1, WIN.lo - 0.1, WIN.hi).mul(open);
  const pane = shape(WIN.half - 0.04, WIN.lo, WIN.hi).mul(float(1).sub(smoothstep(0.035, 0.02, abs(bu)).mul(near))).mul(open);
  const weather = noise(0.35).mul(0.6).add(mx_noise_float(positionWorld.mul(vec3(1.4, 0.1, 1.4))).mul(0.2).add(0.2));
  const base = vec3(...plaster);
  const wall = mix(base.mul(0.9), base, weather);
  const glassC = mix(vec3(0.02, 0.026, 0.034), vec3(0.08, 0.095, 0.11), noise(0.07));
  const h = hash(b.mul(157.1).add(st.add(half.mul(3.3)).mul(311.7)).add(7));
  const slot = time.div(mix(float(300), float(900), hash(h.mul(977)))).add(hash(h.mul(531))).floor();
  const on = step(hash(h.mul(1.3e4).floor().add(slot.mul(7)).add(7)), mix(float(0.45), float(0.12), late));
  let c = mix(wall, vec3(0.78, 0.78, 0.76), win);
  c = mix(c, glassC, pane);
  m.colorNode = c;
  m.roughnessNode = mix(float(0.9), float(0.12), pane);
  m.metalnessNode = pane.mul(0.5);
  m.emissiveNode = mix(vec3(1.0, 0.72, 0.42), vec3(0.88, 0.9, 1.0), step(0.7, hash(h.mul(733)))).mul(on).mul(pane).mul(glow.mul(1.05));
  return m;
}

function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.26, 0.255, 0.245], 0.93);
  M.slate = SIMPLE_SKINS.snowRoof(C.slate, 0.6, 0.15);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    const W = BELVEDERE.window, O = BELVEDERE.old;
    M.wall = SIMPLE_SKINS.windowed(PLASTER, BELVEDERE.storey, W.lo / BELVEDERE.storey, W.hi / BELVEDERE.storey, 0.9, 0.4);
    M.old = SIMPLE_SKINS.windowed(OLD_PLASTER, O.storey, O.window.lo / O.storey, O.window.hi / O.storey, 0.9, 0.4);
    M.glass = SIMPLE_SKINS.glow([0.12, 0.17, 0.18], 0.08, 0.85, [1.0, 0.86, 0.66], 0.15);
    return M;
  }
  M.wall = wallMaterial(BELVEDERE, PLASTER, false);
  M.old = wallMaterial(BELVEDERE.old, OLD_PLASTER, true);
  // The stair's glazing and the dormers' windows: posts every 1.2 m, a rail every 2.85 m, green-grey panes; lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.85 });
    const U = uv().x, V = uv().y;
    const near = float(1).sub(smoothstep(140, 420, positionView.z.negate()));
    const mu = abs(fract(U.div(1.2)).sub(0.5)), mv = abs(fract(V.div(BELVEDERE.storey)).sub(0.5));
    const frame = smoothstep(0.46, 0.475, mu).max(smoothstep(0.455, 0.47, mv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.2)).mul(13.1).add(floor(V.div(BELVEDERE.storey)).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.09, 0.15, 0.15), vec3(0.17, 0.25, 0.25), paneId), vec3(0.6, 0.6, 0.58), frame);
    m.roughnessNode = mix(float(0.08), float(0.6), frame);
    m.metalnessNode = mix(float(0.85), float(0.1), frame);
    m.emissiveNode = vec3(1.0, 0.86, 0.66).mul(float(1).sub(frame)).mul(paneId.mul(0.3).add(0.7)).mul(smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow).mul(0.25));
    M.glass = m;
  }
  return M;
}

// --- The old house's fronts, the loggias and the name: one canvas atlas ----------------------------------------------------
const PX = 20; // the old fronts' pixels per metre
const FRONT_TOP = { oldWest: part('old-west').top, oldA: part('old-link').top, oldB: part('old-link').top, oldC: part('old-link').top, oldD: part('old-link').top, oldHip: part('old-hip').top };
export const ATLAS = (() => {
  const A = {};
  let x = 0;
  for (const f of BELVEDERE.oldFront) {
    const w = Math.round(wallFrame(f.a, f.b).len * PX), h = Math.round((FRONT_TOP[f.key] - f.y0) * PX);
    A[f.key] = [x, 0, w, h];
    x += w + 6;
  }
  A.loggia = [0, 460, 240, 290];
  A.name = [256, 460, 760, 98];
  A.nameBack = [256, 570, 760, 98];
  return A;
})();
const ATLAS_SIZE = [1024, 760];

function atlasTexture() {
  const c = document.createElement('canvas');
  [c.width, c.height] = ATLAS_SIZE;
  const g = c.getContext('2d');
  const cell = (key, draw) => { const [x, y, w, h] = ATLAS[key]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h); g.restore(); };
  const rect = (x, y, w, h, colour) => { g.fillStyle = colour; g.fillRect(x, y, w, h); };
  const PLAST = '#efe9dd', LIGHT = '#f7f4ee', SHADE = 'rgba(90, 80, 60, 0.28)', GLASS = '#2b3644', GLASS2 = '#46576a';
  // A window: its white frame, the panes with a post and a transom, an arched head if `arch`
  const opening = (cx, y0, y1, hw, arch) => {
    const path = (grow) => {
      g.beginPath();
      if (arch) { g.moveTo(cx - hw - grow, y0 + grow); g.lineTo(cx - hw - grow, y1 + hw); g.arc(cx, y1 + hw, hw + grow, Math.PI, 0); g.lineTo(cx + hw + grow, y0 + grow); }
      else g.rect(cx - hw - grow, y1 - grow, (hw + grow) * 2, y0 - y1 + grow * 2);
      g.closePath();
    };
    g.fillStyle = SHADE; g.save(); g.translate(2, 3); path(PX * 0.18); g.fill(); g.restore();
    g.fillStyle = LIGHT; path(PX * 0.18); g.fill();
    const grad = g.createLinearGradient(0, y1, 0, y0);
    grad.addColorStop(0, GLASS2); grad.addColorStop(1, GLASS);
    g.fillStyle = grad; path(-PX * 0.06); g.fill();
    g.strokeStyle = LIGHT; g.lineWidth = PX * 0.09;
    g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx, y1 + (arch ? hw * 0.2 : 0)); g.stroke();
    const t = arch ? y1 + hw : y1 + (y0 - y1) * 0.3;
    g.beginPath(); g.moveTo(cx - hw, t); g.lineTo(cx + hw, t); g.stroke();
  };
  // A band across the front (a string course or a cornice) with its shadow under it
  const band = (Y, h, colour = LIGHT) => { rect(0, Y + h, 4000, PX * 0.22, SHADE); rect(0, Y, 4000, h, colour); };
  // An old front `w` × `h` px down from its top at `top` (m): the plinth, the ground floor's windows, the main floor's
  // arched ones (on the projection three tall ones between pilasters, the porch's doors under them), the attic's
  const oldFront = (f) => (w, h) => {
    const top = FRONT_TOP[f.key], Y = (y) => (top - y) * PX, risalit = !!f.risalit, hipped = f.key === 'oldHip';
    rect(0, 0, w, h, PLAST);
    // the rusticated plinth and ground floor's joints
    rect(0, Y(0.5), w, h - Y(0.5), '#c9c2b4');
    g.fillStyle = 'rgba(120, 110, 95, 0.35)';
    for (let y = 0.5; y < 4.2; y += 0.55) g.fillRect(0, Y(y), w, 1.5);
    band(Y(4.6), PX * 0.4);
    const bays = (pitch, margin = 0.9) => {
      const n = Math.max(1, Math.floor((w / PX - 2 * margin) / pitch) + 1), out = [];
      for (let i = 0; i < n; i++) out.push(w / 2 + (i - (n - 1) / 2) * pitch * PX);
      return out;
    };
    if (risalit) {
      // pilasters at the ends and between the bays
      const xs = bays(3.0, 1.4);
      const pil = [PX * 0.2, ...xs.slice(1).map((x, i) => (x + xs[i]) / 2), w - PX * 0.2];
      for (const x of pil) { rect(x - PX * 0.32, Y(top - 0.8), PX * 0.64, Y(4.6) - Y(top - 0.8), LIGHT); rect(x + PX * 0.32, Y(top - 0.8), 3, Y(4.6) - Y(top - 0.8), SHADE); }
      for (const x of xs) opening(x, Y(5.0), Y(11.0), PX * 0.95, true);
      for (const x of xs) opening(x, Y(13.4), Y(15.2), PX * 0.55, false);
      for (const x of xs) { // the porch's doors
        g.fillStyle = '#3a3029'; g.fillRect(x - PX * 0.75, Y(3.4), PX * 1.5, Y(-0.9) - Y(3.4));
        g.strokeStyle = LIGHT; g.lineWidth = PX * 0.12; g.strokeRect(x - PX * 0.75, Y(3.4), PX * 1.5, Y(-0.9) - Y(3.4));
      }
    } else {
      const xs = bays(3.4);
      for (const x of xs) opening(x, Y(1.0), Y(3.6), PX * 0.6, false);
      for (const x of xs) opening(x, Y(5.3), Y(hipped ? 8.6 : 10.0), PX * 0.7, !hipped);
      if (hipped) for (const x of xs) opening(x, Y(10.4), Y(13.0), PX * 0.62, false);
      else for (let y = 13.0; y + 2.4 < top - 0.6; y += 3.0) for (const x of xs) opening(x, Y(y), Y(y + 1.7), PX * 0.5, false);
      if (!hipped) { rect(0, Y(12.4), w, PX * 0.3, LIGHT); rect(0, Y(12.1), w, PX * 0.12, SHADE); }
      // pilasters at the ends
      rect(0, Y(top - 0.6), PX * 0.55, h, LIGHT); rect(w - PX * 0.55, Y(top - 0.6), PX * 0.55, h, LIGHT);
    }
    // the cornice under the roof
    rect(0, 0, w, PX * 0.7, '#e3ddd0'); rect(0, PX * 0.7, w, PX * 0.25, SHADE);
  };
  for (const f of BELVEDERE.oldFront) cell(f.key, oldFront(f));

  // The loggias: three bays of four floors, white piers and slabs, the shaded recess with the rooms' windows, the
  // railings, round arches on the top floor
  cell('loggia', (w, h) => {
    const n = 3, bw = w / n, fl = h / BELVEDERE.loggia.floors, pier = bw * 0.11;
    rect(0, 0, w, h, '#f2efe8');
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < BELVEDERE.loggia.floors; k++) {
        const x0 = i * bw + pier, x1 = (i + 1) * bw - pier, y0 = k * fl + fl * 0.09, y1 = (k + 1) * fl - fl * 0.06;
        g.save();
        g.beginPath();
        if (k === 0) { const r = (x1 - x0) / 2; g.moveTo(x0, y1); g.lineTo(x0, y0 + r); g.arc((x0 + x1) / 2, y0 + r, r, Math.PI, 0); g.lineTo(x1, y1); g.closePath(); }
        else g.rect(x0, y0, x1 - x0, y1 - y0);
        g.clip();
        const grad = g.createLinearGradient(0, y0, 0, y1);
        grad.addColorStop(0, '#5f6870'); grad.addColorStop(1, '#8d959b');
        g.fillStyle = grad; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        // the rooms' glazing at the back of the loggia
        rect(x0 + (x1 - x0) * 0.18, y1 - fl * 0.78, (x1 - x0) * 0.64, fl * 0.72, '#2f3a46');
        rect((x0 + x1) / 2 - 1, y1 - fl * 0.78, 2, fl * 0.72, '#a9b0b5');
        // the railing
        rect(x0, y1 - fl * 0.34, x1 - x0, 3, '#f7f6f2');
        g.fillStyle = 'rgba(247, 246, 242, 0.85)';
        for (let x = x0 + 4; x < x1; x += 6) g.fillRect(x, y1 - fl * 0.34, 1.5, fl * 0.34);
        g.restore();
      }
    }
    for (let k = 1; k < BELVEDERE.loggia.floors; k++) rect(0, k * fl - 1, w, 3, 'rgba(90, 80, 60, 0.25)');
  });

  // The name standing on the roof: white capitals, a dark rim; behind it the letters' backs, plain
  const name = (w, h, back) => {
    g.font = `600 ${Math.round(h * 0.82)}px "Didot", "Bodoni 72", "Times New Roman", Georgia, serif`;
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const text = 'BELVEDERE', widths = [...text].map((ch) => g.measureText(ch).width);
    const gap = (w - widths.reduce((a, b) => a + b, 0)) / (text.length - 1);
    let x = 0;
    [...text].forEach((ch, i) => {
      const at = back ? w - x - widths[i] : x;
      g.fillStyle = back ? '#8c8f92' : '#fbfbf8';
      g.strokeStyle = 'rgba(30, 34, 40, 0.45)'; g.lineWidth = 1;
      g.save();
      if (back) { g.translate(at + widths[i], 0); g.scale(-1, 1); g.translate(-at - widths[i], 0); }
      g.strokeText(ch, at, h * 0.9); g.fillText(ch, at, h * 0.9);
      g.restore();
      x += widths[i] + gap;
    });
  };
  cell('name', (w, h) => name(w, h, false));
  cell('nameBack', (w, h) => name(w, h, true));
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const P3 = (F, s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
// Whether a face through p0, p1, p2 ([x, y, z]) taken in that order faces up
const facesUp = (p0, p1, p2) => (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]) > 0;
/** A roof's face (three or four points, [x, y, z]) turned to face up, uv in metres over the plan */
function upFace(B, bucket, pts) {
  const q = facesUp(pts[0], pts[1], pts[2]) ? pts : [...pts].reverse();
  const uvs = q.map((r) => [r[0], r[2] + r[1]]);
  if (q.length === 3) B.tri(bucket, q[0], q[1], q[2], uvs);
  else { B.tri(bucket, q[0], q[1], q[2], [uvs[0], uvs[1], uvs[2]]); B.tri(bucket, q[0], q[2], q[3], [uvs[0], uvs[2], uvs[3]]); }
}

// A volume: its walls from the base up to its roof (cut into stretches with and without windows), its roof, the
// cornice round it
function buildPart(B, p) {
  const ring = outwardRing(p.ring), top = p.top, y0 = BELVEDERE.base, old = p.walls === 'old';
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const plain = isOldFront(a, b) || (p.plainFront && facesFront(F));
    const stretches = old || plain ? [{ from: 0, to: F.len, windows: !plain }] : wallStretches(a, b);
    for (const st of stretches) {
      const len = st.to - st.from, mid = (st.from + st.to) / 2, windows = st.windows && len >= 2.5;
      const v = (y) => y - top + UP - (windows ? 0 : CLOSED);
      B.quad(old ? 'old' : 'wall', P3(F, st.from, 0, y0), P3(F, st.to, 0, y0), P3(F, st.to, 0, top), P3(F, st.from, 0, top),
        [[st.from - mid, v(y0)], [st.to - mid, v(y0)], [st.to - mid, v(top)], [st.from - mid, v(top)]], { half: windows ? len / 2 : 0 });
    }
    // the cornice (on the hotel a slab standing out over the plaster, on the old house a moulding)
    if (old) B.box('trim', F, -0.3, F.len + 0.3, -0.1, 0.45, top - 0.55, top, C.cornice);
    else B.box('trim', F, -0.25, F.len + 0.25, -0.3, 0.25, top - 0.3, top + 0.3, C.white);
    if (p.roof === 'terrace') B.box('trim', F, 0, F.len, -0.12, 0.02, top + 0.3, top + 1.1, C.rail);
  }
  if (p.roof === 'flat' || p.roof === 'terrace' || p.roof === 'dome') {
    const contour = ring.map(([x, z]) => new THREE.Vector2(x, z)), y = top + (old ? 0 : 0.25);
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) upFace(B, 'roof', [ring[i], ring[j], ring[k]].map(([x, z]) => [x, y, z]));
  }
  if (p.roof === 'hip') buildHip(B, p);
  if (p.roof === 'dome') buildDome(B, p);
}

// A hipped roof over a rectangle: the ridge along its longer sides, `peak` high, as far in from the ends as the roof is
// half deep (its four planes of one pitch)
function buildHip(B, p) {
  const r = outwardRing(p.ring), y0 = p.top, y1 = p.peak;
  const l01 = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]), l12 = Math.hypot(r[2][0] - r[1][0], r[2][1] - r[1][1]);
  const [a, b, c, d] = l01 >= l12 ? r : [r[1], r[2], r[3], r[0]]; // a→b a long side
  const L = Math.max(l01, l12), D = Math.min(l01, l12), k = Math.min(0.49, D / 2 / L);
  const mid = (p0, p1, t) => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
  const ad = mid(a, d, 0.5), bc = mid(b, c, 0.5);
  const r0 = mid(ad, bc, k), r1 = mid(ad, bc, 1 - k);
  const Y = (q, y) => [q[0], y, q[1]];
  const face = (...pts) => upFace(B, 'slate', pts);
  face(Y(a, y0), Y(b, y0), Y(r1, y1), Y(r0, y1));
  face(Y(b, y0), Y(c, y0), Y(r1, y1));
  face(Y(c, y0), Y(d, y0), Y(r0, y1), Y(r1, y1));
  face(Y(d, y0), Y(a, y0), Y(r0, y1));
}

// The dome: a bell of slate over the block's rectangle from its cornice, steep at the foot and flattening to a lead
// deck, the lantern and its spike on it; three dormers towards the Promenade
function buildDome(B, p) {
  const r = outwardRing(p.ring), y0 = p.top + 0.1, { top, inset } = p.dome, H = top - y0;
  // the rectangle's frame: its middle, the half sizes along its two axes
  const cx = r.reduce((s, q) => s + q[0], 0) / 4, cz = r.reduce((s, q) => s + q[1], 0) / 4;
  // (the rectangle's two axes: each side moves in by k, its corners along the axes)
  const ax = [[r[1][0] - r[0][0], r[1][1] - r[0][1]], [r[3][0] - r[0][0], r[3][1] - r[0][1]]].map(([x, z]) => { const l = Math.hypot(x, z); return [x / l, z / l]; });
  const ring = (t) => {
    const k = inset * (1 - Math.cos(t * Math.PI / 2)) ** 0.8, y = y0 + H * Math.sin(t * Math.PI / 2);
    return { k, y, pts: r.map(([x, z]) => {
      const s0 = Math.sign((x - cx) * ax[0][0] + (z - cz) * ax[0][1]), s1 = Math.sign((x - cx) * ax[1][0] + (z - cz) * ax[1][1]);
      return [x - (s0 * ax[0][0] + s1 * ax[1][0]) * k, y, z - (s0 * ax[0][1] + s1 * ax[1][1]) * k];
    }) };
  };
  const N = 7, steps = Array.from({ length: N + 1 }, (_, i) => ring(i / N)), rings = steps.map((q) => q.pts);
  let vAt = 0;
  for (let i = 0; i < N; i++) {
    const lo = rings[i], hi = rings[i + 1], dv = Math.hypot(steps[i + 1].y - steps[i].y, steps[i + 1].k - steps[i].k);
    for (let j = 0; j < 4; j++) {
      const k = (j + 1) % 4, w0 = Math.hypot(lo[k][0] - lo[j][0], lo[k][2] - lo[j][2]), w1 = Math.hypot(hi[k][0] - hi[j][0], hi[k][2] - hi[j][2]);
      B.quad('slate', lo[j], lo[k], hi[k], hi[j], [[-w0 / 2, vAt], [w0 / 2, vAt], [w1 / 2, vAt + dv], [-w1 / 2, vAt + dv]]);
    }
    vAt += dv;
  }
  upFace(B, 'slate', rings[N]);
  // the lantern: a box with its own little roof and the spike
  const L = wallFrame([cx, cz], [cx + (r[1][0] - r[0][0]), cz + (r[1][1] - r[0][1])]);
  B.box('trim', L, -1.1, 1.1, -1.1, 1.1, top - 0.1, top + 1.5, C.white);
  B.box('trim', L, -1.3, 1.3, -1.3, 1.3, top + 1.5, top + 1.75, C.lead);
  B.box('trim', L, -0.75, 0.75, -0.75, 0.75, top + 1.75, top + 2.2, C.lead);
  B.box('trim', L, -0.06, 0.06, -0.06, 0.06, top + 2.2, top + 4.4, C.steel);
  B.box('trim', L, -0.18, 0.18, -0.18, 0.18, top + 3.2, top + 3.5, [0.5, 0.42, 0.2]);
  // the dormers on the slope towards the Promenade, a third of the way up
  const front = r.map((q, i) => wallFrame(q, r[(i + 1) % 4])).find((F) => facesFront(F));
  if (!front) return;
  const D = BELVEDERE.dormers, t = 0.35, yb = y0 + H * Math.sin(t * Math.PI / 2), back = inset * (1 - Math.cos(t * Math.PI / 2)) ** 0.8;
  for (const at of D.at) {
    const s = at;
    B.box('trim', front, s - D.w / 2, s + D.w / 2, -back - 1.6, -back + 0.15, yb - 0.6, yb + D.h, C.white);
    B.box('trim', front, s - D.w / 2 - 0.12, s + D.w / 2 + 0.12, -back - 1.6, -back + 0.3, yb + D.h, yb + D.h + 0.18, C.lead);
    const q = (u, y) => P3(front, s + u, -back + 0.17, y);
    B.quad('glass', q(-D.w / 2 + 0.22, yb), q(D.w / 2 - 0.22, yb), q(D.w / 2 - 0.22, yb + D.h - 0.25), q(-D.w / 2 + 0.22, yb + D.h - 0.25), [[0.6, 0.5], [0.6, 0.5], [0.6, 0.5], [0.6, 0.5]]);
  }
}

// The old house's front: the decals, the porch with its columns and balustrade, the pediment over the projection
function buildOldFront(B, colliders) {
  for (const f of BELVEDERE.oldFront) {
    const F = wallFrame(f.a, f.b);
    B.decal(F, 0, F.len, 0.04, f.y0, FRONT_TOP[f.key], f.key);
  }
  const R = BELVEDERE.oldFront.find((f) => f.risalit), F = wallFrame(R.a, R.b), top = FRONT_TOP[R.key];
  // the pediment: a gable over the projection's cornice, reaching back into the dome's block
  const { rise, back } = BELVEDERE.pediment, y0 = top, y1 = top + rise;
  const g = (s, o, y) => P3(F, s, o, y);
  B.tri('trim', g(-0.2, 0.45, y0), g(F.len + 0.2, 0.45, y0), g(F.len / 2, 0.45, y1), undefined, { colour: C.white });
  upFace(B, 'slate', [g(F.len / 2, 0.6, y1 + 0.15), g(F.len / 2, -back, y1 + 0.15), g(-0.4, -back, y0 - 0.05), g(-0.4, 0.6, y0 - 0.05)]);
  upFace(B, 'slate', [g(F.len + 0.4, 0.6, y0 - 0.05), g(F.len + 0.4, -back, y0 - 0.05), g(F.len / 2, -back, y1 + 0.15), g(F.len / 2, 0.6, y1 + 0.15)]);
  B.box('trim', F, -0.4, F.len + 0.4, -0.2, 0.6, y0 - 0.35, y0 + 0.05, C.cornice);
  // the porch: a step, four columns, its flat roof, the balustrade on it
  const P = BELVEDERE.porch, mid = (P.from + P.to) / 2;
  const ground = Math.min(...[P.from, mid, P.to].map((s) => groundHeight(...onWall(F, s, P.depth + 0.5))));
  B.box('trim', F, P.from - 0.5, P.to + 0.5, 0, P.depth + 0.9, ground - 0.8, P.floor, C.stone);
  for (let i = 0; i < 4; i++) {
    const s = P.from + 0.35 + i * (P.to - P.from - 0.7) / 3;
    B.box('trim', F, s - 0.24, s + 0.24, P.depth - 0.5, P.depth - 0.02, P.floor, P.top - 0.3, C.white);
    B.box('trim', F, s - 0.32, s + 0.32, P.depth - 0.58, P.depth + 0.06, P.top - 0.4, P.top - 0.25, C.cornice);
  }
  B.box('trim', F, P.from, P.to, 0, P.depth + 0.1, P.top - 0.3, P.top, C.cornice, { top: 'roof' });
  B.box('trim', F, P.from, P.to, P.depth - 0.12, P.depth + 0.08, P.top, P.top + 0.95, C.white);
  for (const s of [P.from, P.to - 0.2]) B.box('trim', F, s, s + 0.2, 0, P.depth + 0.08, P.top, P.top + 0.95, C.white);
  colliders.push(obb(onWall(F, P.from - 0.5, (P.depth + 0.9) / 2), onWall(F, P.to + 0.5, (P.depth + 0.9) / 2), P.depth + 0.9, ground - 0.8, P.top + 1));
}

// The long wing's and the east block's balconies, the canopy over the ground floor, the glazed stair, the loggias
function buildHotelFront(B, colliders) {
  const { storey, balcony: BA, canopy: CA } = BELVEDERE;
  const others = BELVEDERE.parts;
  const inside = (pt, y, self) => others.some((q) => q !== self && q.top > y && pointInRing(q.ring, pt[0], pt[1]));
  for (const p of others.filter((q) => q.balconies)) {
    const ring = outwardRing(p.ring);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
      if (F.len < 4 || !facesFront(F, 0.8)) continue;
      const clear = clearStretches(a, b), bays = balconyBays(F.len, clear);
      const ground = groundHeight(...onWall(F, F.len / 2, 3));
      const canopy = p.id === 'long-wing' && ground < CA.maxGround && !inside(onWall(F, F.len / 2, 1), CA.y, p);
      for (let k = 1; k <= BA.floors; k++) {
        const foot = p.top - (BA.floors + 1 - k) * storey;
        if (foot < ground + 2 || foot < (p.balconyFrom ?? -Infinity) || (canopy && k === 1)) continue;
        for (const s of bays) {
          if (inside(onWall(F, s, BA.depth / 2), foot, p)) continue;
          const hw = (BELVEDERE.bay - BA.gap) / 2;
          B.box('trim', F, s - hw, s + hw, 0, BA.depth, foot - 0.22, foot, C.slab);
          B.box('trim', F, s - hw, s + hw, BA.depth - 0.06, BA.depth, foot, foot + BA.rail, C.rail);
          for (const e of [s - hw, s + hw - 0.05]) B.box('trim', F, e, e + 0.05, 0, BA.depth, foot, foot + BA.rail, C.rail);
        }
      }
      if (canopy) {
        // a flat roof on thin posts, a glazed veranda under it
        B.box('trim', F, 0, F.len, 0, CA.out, CA.y - 0.35, CA.y, C.canopy, { top: 'roof' });
        B.box('trim', F, 0, F.len, CA.out - 0.08, CA.out, CA.y, CA.y + 0.9, C.rail);
        const n = Math.max(1, Math.round(F.len / 6));
        for (let j = 0; j <= n; j++) {
          const s = 0.15 + j * (F.len - 0.3) / n, gy = groundHeight(...onWall(F, s, CA.out - 0.2));
          B.box('trim', F, s - 0.08, s + 0.08, CA.out - 0.3, CA.out - 0.14, gy - 0.4, CA.y - 0.35, C.white);
          colliders.push(obb(onWall(F, s - 0.12, CA.out - 0.22), onWall(F, s + 0.12, CA.out - 0.22), 0.24, gy - 0.4, CA.y));
        }
      }
    }
  }
  // the glazed stair at the long wing's west end, standing a hand out of the wall
  const S = BELVEDERE.stair, SF = wallFrame(S.a, S.b), top = part('long-wing').top;
  const sy = groundHeight(...onWall(SF, (S.from + S.to) / 2, 2)) - 0.5;
  B.box('glass', SF, S.from, S.to, -0.2, 0.25, sy, top - 0.6);
  // the loggias: a decal over each, the slabs standing out a little
  const LG = BELVEDERE.loggia;
  for (const l of BELVEDERE.loggias) {
    const F = wallFrame(l.a, l.b);
    B.decal(F, l.from, l.to, 0.05, LG.y0, LG.y1 - 0.35, 'loggia');
    for (let k = 1; k < LG.floors; k++) {
      const y = LG.y0 + k * (LG.y1 - 0.35 - LG.y0) / LG.floors;
      B.box('trim', F, l.from, l.to, 0, 0.18, y - 0.12, y + 0.06, C.white);
    }
    for (const s of [l.from - 0.35, l.to]) B.box('trim', F, s, s + 0.35, 0, 0.18, LG.y0, LG.y1, C.white);
  }
}

// The name standing on the long wing's roof: a steel frame, the letters on it, their backs towards the slope
function buildName(B) {
  const N = BELVEDERE.name, F = nameFrame(), y0 = part('long-wing').top + 0.3 + 0.6, o = -N.back;
  for (let s = N.from; s <= N.from + N.w + 0.01; s += N.w / 4) B.box('trim', F, s - 0.06, s + 0.06, o - 0.6, o, y0 - 0.6, y0 + N.h * 0.85, C.steel);
  B.box('trim', F, N.from, N.from + N.w, o - 0.06, o, y0 - 0.05, y0 + 0.05, C.steel);
  B.decal(F, N.from, N.from + N.w, o + 0.02, y0, y0 + N.h, 'name');
  const back = { a: onWall(F, N.from + N.w, o - 0.08), u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]] };
  B.decal(back, 0, N.w, 0, y0, y0 + N.h, 'nameBack');
}

// A thin oriented box between two points (world x, z), `thick` m across, at world heights (baseY set)
function obb(a, b, thick, y0, y1) {
  const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2, hz = thick / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } };
}

/**
 * Builds the Grandhotel Belvédère into `scene`. Returns { group, colliders } (colliders at world heights: the porch and
 * the canopy's posts; the walls of OpenStreetMap's footprint are js/buildings.js').
 */
export function buildBelvedere(scene) {
  const root = new THREE.Group();
  root.name = 'Grandhotel Belvédère';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['wall', 'old'], name: 'Belvédère' }), M = materials();
  const colliders = [];
  for (const p of BELVEDERE.parts) buildPart(B, p);
  buildOldFront(B, colliders);
  buildHotelFront(B, colliders);
  buildName(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders };
}

/** (for the tests) the old house's frame of a world point */
export const oldFrameOf = toOld;
