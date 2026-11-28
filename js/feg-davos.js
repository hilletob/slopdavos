import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, length, max, mix, smoothstep, step, vec2, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  FEG_DAVOS, bays, choirFaces, choirRoofY, groundOutlines, naveRoofY, naveWall, onWall, outwardRing, parts, pointInRing, porchRoofY, sacristyRoofY, toLocal,
  toWorld, wallFrame
} from './feg-davos-data.js';

export { FEG_DAVOS };

// The church of the Freie Evangelische Gemeinde Davos rebuilt by hand (js/feg-davos-data.js), standing in for its
// swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows: the nave, the
// polygonal choir, the sacristy and the porch in light rubble stone, tall round-arched windows with leaded panes in
// stone surrounds (drawn by the walls' material from their uv: metres along the wall from its middle, metres up from
// the nave's floor), the buttresses between the nave's bays, a corbel table under the eaves, steep grey slate roofs over
// a red-brown fascia, the round window in the west gable, the slated belfry on the ridge with its tall octagonal spire,
// the ball and the cross, the door in the porch. Four meshes: the walls, the roofs and the spire, the trim (one vertex-
// coloured mesh) and the decoration (one canvas atlas).

excludeBuildings(FEG_DAVOS.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(FEG_DAVOS.osm, groundOutlines());

const D = FEG_DAVOS;
const FLOOR = D.nave.floor; // the windows' grid counts from the nave's floor
const STOREY = 40; // (one storey: the church's windows are one row)
const UP = 4 * STOREY;
const CLOSED = 300 * STOREY;
const vOf = (y, lift = 0) => y - FLOOR - lift + UP;
const WIN = D.win;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const STONE = [0.34, 0.31, 0.255], SURROUND = [0.42, 0.395, 0.34], SLATE = [0.085, 0.09, 0.1];

function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(SLATE, 0.75, 0.05);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the stone's mean colour, a lit band at the windows' height at night, js/landmark-buildings.js
    // SIMPLE_SKINS)
    M.walls = SIMPLE_SKINS.windowed([0.3, 0.28, 0.23], STOREY, WIN.lo / STOREY, (WIN.spring + WIN.half) / STOREY, 0.92, 0.15, { bay: D.bay, half: WIN.half });
    return M;
  }
  const fine = fade(8, 28), near = fade(40, 160);
  const glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 });
  const { half, v, bay, bu, fv } = windowGrid({ bay: D.bay, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
  const open = step(abs(bay.mul(D.bay)).add(WIN.half + 0.4), half);
  // the round-arched opening of half width `hw` from `lo` up (its arch springing at WIN.spring)
  const arch = (hw, lo, e = 0.015) => {
    const side = smoothstep(hw + e, hw - e, abs(bu)).mul(smoothstep(lo - e, lo + e, fv)).mul(smoothstep(WIN.spring + e, WIN.spring - e, fv));
    const top = smoothstep(hw + e, hw - e, length(vec2(bu, fv.sub(WIN.spring)))).mul(step(WIN.spring - 0.001, fv));
    return max(side, top).mul(open);
  };
  const surround = arch(WIN.half + 0.16, WIN.lo - 0.14);
  const win = arch(WIN.half, WIN.lo);
  const pane = arch(WIN.half - 0.07, WIN.lo + 0.07);
  // the leads: a lattice of lozenges, a bar across every metre (fading out with distance)
  const la = abs(fract(bu.add(fv).div(0.32)).sub(0.5)), lb = abs(fract(bu.sub(fv).div(0.32)).sub(0.5));
  const lead = smoothstep(0.44, 0.48, max(la, lb)).max(smoothstep(0.47, 0.485, abs(fract(fv).sub(0.5)))).mul(fine);
  // the rubble stone: courses of ~0.3 m, each stone of a length and a shade of its own, the mortar's joints
  const U = bu.add(bay.mul(D.bay)); // (metres along the wall from its middle)
  const course = floor(v.div(0.3)), cv = fract(v.div(0.3));
  const len = hash(course.mul(13.7)).mul(0.45).add(0.45);
  const su = U.add(hash(course.mul(7.1)).mul(2)).div(len), stone = floor(su), cu = fract(su);
  const shade = hash(stone.mul(31.3).add(course.mul(17.9)));
  const joint = smoothstep(0.1, 0.0, cv).max(smoothstep(0.9, 1.0, cv)).max(smoothstep(0.06, 0.0, cu)).max(smoothstep(0.94, 1.0, cu)).mul(fine);
  let c = vec3(...STONE).mul(shade.mul(0.3).add(0.82)).mul(mix(float(0.95), float(1.05), worldNoise(0.25)));
  c = mix(c, vec3(0.44, 0.42, 0.38), joint.mul(0.7));
  c = mix(c, vec3(...SURROUND).mul(mix(float(0.96), float(1.04), shade)), surround.mul(near));
  c = mix(c, vec3(0.05, 0.045, 0.04), win);
  // the glass: dark, each light of the lattice a little tinted (amber, green, blue)
  const tint = hash(floor(bu.add(fv).div(0.32)).mul(7.3).add(floor(bu.sub(fv).div(0.32)).mul(3.1)));
  const glassC = mix(mix(vec3(0.05, 0.045, 0.03), vec3(0.03, 0.05, 0.04), step(0.5, tint)), vec3(0.03, 0.04, 0.065), step(0.8, tint));
  c = mix(c, mix(glassC, vec3(0.04, 0.04, 0.04), lead), pane);
  m.colorNode = c;
  m.roughnessNode = mix(float(0.93), float(0.2), pane);
  m.metalnessNode = pane.mul(0.3);
  // (a church: a few windows faintly lit of an evening, warm through the coloured lights)
  m.emissiveNode = litWindow(bay, half.mul(3.3), 53, { share: 0.25, late: 0.05, tone: twoTones([1.0, 0.72, 0.4], [1.0, 0.85, 0.6], 0.6), vary: false })
    .mul(pane).mul(float(1).sub(lead.mul(0.8))).mul(tint.mul(0.5).add(0.5)).mul(glow.mul(0.8));
  M.walls = m;
  return M;
}

// --- The decoration: one canvas atlas ------------------------------------------------------------------------------------
const ATLAS_SIZE = [512, 512];
export const ATLAS = {
  rose: [0, 0, 256, 256],
  door: [264, 0, 128, 256],
  louvre: [400, 0, 96, 160],
  corbel: [0, 264, 256, 64]
};
const STONE_CSS = '#a39a86', STONE_DARK = '#6d6656';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // the round window: a stone ring, the tracery of six round lobes round a small circle, dark leaded glass
  cell('rose', (w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2 - 2;
    g.fillStyle = STONE_CSS; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1a22'; g.beginPath(); g.arc(cx, cy, R * 0.8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = STONE_CSS; g.lineWidth = 9;
    for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.43, cy + Math.sin(a) * R * 0.43, R * 0.35, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.arc(cx, cy, R * 0.18, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = STONE_DARK; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R - 2, 0, Math.PI * 2); g.stroke();
  });
  // the door: two leaves of dark oak under a round-arched head, iron hinges, the arch's stone (outside it transparent)
  cell('door', (w, h) => {
    const r = w / 2;
    g.fillStyle = STONE_CSS; g.beginPath(); g.moveTo(0, h); g.lineTo(0, r); g.arc(r, r, r, Math.PI, 0); g.lineTo(w, h); g.closePath(); g.fill();
    g.fillStyle = '#3a2414'; g.beginPath(); g.moveTo(10, h); g.lineTo(10, r); g.arc(r, r, r - 10, Math.PI, 0); g.lineTo(w - 10, h); g.closePath(); g.fill();
    g.strokeStyle = '#24160c'; g.lineWidth = 3;
    for (let x = 22; x < w - 12; x += 14) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x, h); g.stroke(); }
    g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, 12); g.lineTo(w / 2, h); g.stroke();
    g.fillStyle = '#1c1c1c'; for (const y of [h * 0.35, h * 0.75]) { g.fillRect(12, y, w / 2 - 22, 7); g.fillRect(w / 2 + 10, y, w / 2 - 22, 7); }
    g.fillStyle = '#9a7a3a'; g.fillRect(w / 2 - 12, h * 0.55, 6, 12); g.fillRect(w / 2 + 6, h * 0.55, 6, 12);
  });
  // the belfry's louvres: slanted slats in a dark frame, under a round arch
  cell('louvre', (w, h) => {
    g.fillStyle = '#1e2024'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3c4046';
    for (let y = 30; y < h - 8; y += 14) g.fillRect(10, y, w - 20, 7);
    g.fillStyle = '#2a2d32'; g.beginPath(); g.arc(w / 2, 30, w / 2 - 10, Math.PI, 0); g.fill();
  });
  // the corbel table: a band of small round arches on corbels under a stone string course
  cell('corbel', (w, h) => {
    g.fillStyle = STONE_CSS; g.fillRect(0, 0, w, h * 0.3);
    const n = 8, a = w / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = STONE_CSS; g.beginPath(); g.moveTo(i * a, h * 0.3); g.lineTo(i * a + a, h * 0.3); g.lineTo(i * a + a, h * 0.5);
      g.arc(i * a + a / 2, h * 0.5, a / 2 - 4, 0, Math.PI, true); g.closePath(); g.fill();
      g.fillRect(i * a - 5, h * 0.3, 10, h * 0.7);
    }
    g.strokeStyle = STONE_DARK; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h * 0.3); g.lineTo(w, h * 0.3); g.stroke();
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = {
  stone: [0.3, 0.28, 0.235], plinth: [0.22, 0.205, 0.18], fascia: [0.13, 0.045, 0.025], soffit: [0.15, 0.07, 0.04], ridge: [0.07, 0.075, 0.08],
  slate: [0.07, 0.075, 0.085], iron: [0.05, 0.05, 0.05], gilt: [0.55, 0.42, 0.15], step: [0.27, 0.26, 0.24]
};
const P3 = (t, c, y) => { const [x, z] = toWorld(t, c); return [x, y, z]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A quad facing `dir` (its corners turned round if they face away), into `bucket` */
function quadTo(B, bucket, pts, dir, opt = {}, uvs = undefined) {
  const [a, b, c, d] = pts;
  if (dot(cross(sub(b, a), sub(d, a)), dir) >= 0) B.quad(bucket, a, b, c, d, uvs, opt);
  else B.quad(bucket, a, d, c, b, uvs && [uvs[0], uvs[3], uvs[2], uvs[1]], opt);
}
/** A polygon of the frame ([t, c, y] round it, planar) triangulated, facing up (or down), into `bucket` */
function face(B, bucket, pts, { down = false, dy = 0, colour = null } = {}) {
  const contour = pts.map(([t, c]) => new THREE.Vector2(t, c));
  for (const tri of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = tri.map((i) => P3(pts[i][0], pts[i][1], pts[i][2] + dy));
    const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const q = (n[1] > 0) !== down ? p : [p[0], p[2], p[1]];
    B.tri(bucket, q[0], q[1], q[2], q.map((r) => [r[0], r[2]]), { colour });
  }
}
/** A beam from p to q ([x, y, z]): `hw` half its width (level), `hh` half its height, into the trim */
function beam(B, p, q, hw, hh, colour) {
  const d = sub(q, p), L = Math.hypot(...d);
  if (L < 1e-3) return;
  const dn = d.map((x) => x / L);
  let side = [-dn[2], 0, dn[0]];
  const sl = Math.hypot(side[0], side[2]);
  side = sl < 1e-3 ? [1, 0, 0] : side.map((x) => x / sl);
  const up = cross(side, dn);
  const k = (o, sx, sy) => [o[0] + side[0] * sx * hw + up[0] * sy * hh, o[1] + side[1] * sx * hw + up[1] * sy * hh, o[2] + side[2] * sx * hw + up[2] * sy * hh];
  const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], opt = { colour };
  const P = [k(p, -1, -1), k(p, 1, -1), k(p, 1, 1), k(p, -1, 1)], Q = [k(q, -1, -1), k(q, 1, -1), k(q, 1, 1), k(q, -1, 1)];
  const out = (f) => sub(f.reduce((s, x) => [s[0] + x[0] / 4, s[1] + x[1] / 4, s[2] + x[2] / 4], [0, 0, 0]), m);
  for (let i = 0; i < 4; i++) { const f = [P[i], P[(i + 1) % 4], Q[(i + 1) % 4], Q[i]]; quadTo(B, 'trim', f, out(f), opt); }
  quadTo(B, 'trim', P, sub(p, q), opt);
  quadTo(B, 'trim', Q, d, opt);
}
/** A quad of the atlas' cell `key` (corners: bottom left, bottom right, top right, top left seen from `out`) */
function decalQuad(B, pts, key, out) {
  const [ax, ay, aw, ah] = ATLAS[key], [Wd, H] = ATLAS_SIZE;
  const u0 = ax / Wd, u1 = (ax + aw) / Wd, v0 = 1 - (ay + ah) / H, v1 = 1 - ay / H;
  quadTo(B, 'decal', pts, out, {}, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
}

// The highest ground along a wall, half a metre out of it (from s0 to s1)
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5)));
  return hi;
}

// The roof over each part: the height of its upper face at a point (t, c) of the frame
const ROOF_OF = {
  nave: (t, c) => naveRoofY(c),
  choir: (t, c) => choirRoofY(t, c),
  sacristy: (t, c) => sacristyRoofY(c),
  porch: (t, c) => porchRoofY(t, c)
};
// Which walls carry windows: the nave's long walls, the choir's sides and apse (not its north side by the sacristy),
// the sacristy's north wall, the porch's west wall
function windowed(id, F) {
  const n = toLocalDir(F.n);
  if (id === 'nave') return Math.abs(n[1]) > 0.9;
  if (id === 'choir') return !(n[1] > 0.9);
  if (id === 'sacristy') return n[1] > 0.9;
  if (id === 'porch') return n[0] < -0.9;
  return false;
}
// a world direction in the frame
const toLocalDir = ([x, z]) => { const [t0, c0] = toLocal(0, 0), [t1, c1] = toLocal(x, z); return [t1 - t0, c1 - c0]; };

// Where the top of a wall bends (its roof's faces change): found by sampling every 5 cm
function bends(F, top) {
  const out = [], step = 0.05;
  for (let s = step; s < F.len - step; s += step) {
    const d2 = top(s - step) - 2 * top(s) + top(s + step);
    if (Math.abs(d2) > 1e-3) out.push(s);
  }
  // (a run of samples round one bend: keep its middle)
  const merged = [];
  for (const s of out) { if (merged.length && s - merged[merged.length - 1].at(-1) < 0.11) merged[merged.length - 1].push(s); else merged.push([s]); }
  return merged.map((r) => r[Math.floor(r.length / 2)]);
}

// The walls of every part: from the base up to its roof (a step under its upper face), the windows where they fit and
// clear the ground (`lift`: how far a wall's windows stand higher where the ground rises before it)
function buildWalls(B) {
  const all = parts();
  const others = (id) => all.filter((p) => p.id !== id);
  const info = [];
  for (const part of all) {
    const R = outwardRing(part.ring), roof = ROOF_OF[part.id];
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 0.05) continue;
      // (a wall standing against another part all along is hidden)
      const against = (s) => others(part.id).some((p) => pointInRing(p.ring, ...onWall(F, s, 0.3)));
      if (against(0.1) && against(F.len / 2) && against(F.len - 0.1)) continue;
      const top = (s) => roof(...toLocal(...onWall(F, s, -0.02))) - 0.06;
      let lift = 0, lay = null;
      if (windowed(part.id, F) && bays(F.len).length) {
        lift = Math.max(0, groundAlong(F) + 0.25 - (FLOOR + WIN.lo));
        const head = FLOOR + WIN.spring + WIN.half + 0.16 + lift;
        if (head < Math.min(top(0), top(F.len)) - D.corbel - 0.1) lay = { mid: F.len / 2, half: F.len / 2 };
      }
      const pts = [0, ...bends(F, top), F.len];
      const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1], ya = top(a), yb = top(b);
        const v = (y) => vOf(y, lift) - (lay ? 0 : CLOSED), mid = lay ? lay.mid : (a + b) / 2;
        B.quad('walls', P(a, D.base), P(b, D.base), P(b, yb), P(a, ya), [[a - mid, v(D.base)], [b - mid, v(D.base)], [b - mid, v(yb)], [a - mid, v(ya)]], { half: lay ? lay.half : 0 });
      }
      plinth(B, F, (s) => against(s));
      info.push({ part: part.id, F, top, lift, windows: !!lay });
    }
  }
  return info;
}
// A plinth of darker stone along a wall's foot, a little over the ground (not where another part stands before it)
function plinth(B, F, hidden) {
  const n = Math.max(1, Math.ceil(F.len / 1.0));
  for (let k = 0; k < n; k++) {
    const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
    if (hidden((a + b) / 2)) continue;
    const ga = groundHeight(...onWall(F, a, 0.3)) + 0.4, gb = groundHeight(...onWall(F, b, 0.3)) + 0.4;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.04); return [x, y, z]; };
    B.quad('trim', P(a, D.base), P(b, D.base), P(b, Math.max(gb, D.base + 0.2)), P(a, Math.max(ga, D.base + 0.2)), undefined, { colour: C.plinth });
  }
}

// The corbel table under the eaves of the walls that carry windows: pieces of the atlas' band, sheared to the wall's top
function buildCorbels(B, info) {
  for (const w of info) {
    if (!w.windows || w.part === 'porch' || w.part === 'sacristy') continue;
    const F = w.F, n = Math.max(1, Math.round(F.len / 1.6));
    for (let k = 0; k < n; k++) {
      const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
      const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
      const ta = w.top(a) - 0.04, tb = w.top(b) - 0.04;
      decalQuad(B, [P(a, ta - D.corbel), P(b, tb - D.corbel), P(b, tb), P(a, ta)], 'corbel', [F.n[0], 0, F.n[1]]);
    }
  }
}

// The buttresses between the nave's bays on both long walls: a stepped pier of stone with a sloped cap
function buildButtresses(B) {
  const Bt = D.buttress, out = [];
  for (const side of ['south', 'north']) {
    const F = naveWall(side);
    for (const t of Bt.at) {
      const s = side === 'south' ? t : F.len - t;
      B.box('trim', F, s - Bt.half, s + Bt.half, 0, Bt.depth, D.base, Bt.top - 2.2, C.stone);
      B.box('trim', F, s - Bt.half + 0.05, s + Bt.half - 0.05, 0, Bt.depth - 0.17, Bt.top - 2.2, Bt.top, C.stone);
      // (the caps: a slope from the pier's face back to the wall)
      const cap = (o0, o1, y0, h, hw) => {
        const [x0, z0] = onWall(F, s - hw, o1), [x1, z1] = onWall(F, s + hw, o1), [x2, z2] = onWall(F, s + hw, o0), [x3, z3] = onWall(F, s - hw, o0);
        quadTo(B, 'trim', [[x0, y0, z0], [x1, y0, z1], [x2, y0 + h, z2], [x3, y0 + h, z3]], [F.n[0], 1, F.n[1]], { colour: C.stone });
        for (const [sx, sgn] of [[s - hw, -1], [s + hw, 1]]) {
          const [ax, az] = onWall(F, sx, o0), [bx, bz] = onWall(F, sx, o1);
          const a = [bx, y0, bz], b = [ax, y0 + h, az], c = [ax, y0, az];
          // (each side facing out along the wall)
          if (dot(cross(sub(b, a), sub(c, a)), [F.u[0] * sgn, 0, F.u[1] * sgn]) >= 0) B.tri('trim', a, b, c, undefined, { colour: C.stone });
          else B.tri('trim', a, c, b, undefined, { colour: C.stone });
        }
      };
      cap(0, Bt.depth, Bt.top - 2.2, 0.35, Bt.half);
      cap(0, Bt.depth - 0.17, Bt.top, 0.4, Bt.half - 0.05);
      out.push({ F, s });
    }
  }
  return out;
}

// The roofs: the nave's two planes, the choir's hipped faces, the sacristy's and the porch's lean-tos; soffits under
// them, the red-brown fascia round the eaves and up the verges, the ridges' caps
function buildRoofs(B) {
  const R = D.roof, [cr, yr] = R.ridge;
  const nave = [
    [[R.t0, R.c0, R.eaves], [R.t1, R.c0, R.eaves], [R.t1, cr, yr], [R.t0, cr, yr]],
    [[R.t0, cr, yr], [R.t1, cr, yr], [R.t1, R.c1, R.eaves], [R.t0, R.c1, R.eaves]]
  ];
  const choir = choirFaces();
  const S = D.sacristyRoof, [ch, yh] = S.high, [cl, yl] = S.low;
  const sacristy = [[[S.t0, ch, yh], [S.t1, ch, yh], [S.t1, cl, yl], [S.t0, cl, yl]]];
  const Pr = D.porchRoof, [pc0, pc1, pt] = Pr.top, E = Pr.eaves;
  const porch = [
    [[E.t, E.c0, E.y], [0, E.c0, E.y], [0, pc0, pt]],
    [[E.t, E.c0, E.y], [0, pc0, pt], [0, pc1, pt], [E.t, E.c1, E.y]],
    [[E.t, E.c1, E.y], [0, pc1, pt], [0, E.c1, E.y]]
  ];
  for (const f of [...nave, ...choir, ...sacristy, ...porch]) {
    face(B, 'roof', f);
    face(B, 'trim', f, { down: true, dy: -0.1, colour: C.soffit });
  }
  // the fascia: the nave's eaves and verges, the choir's eaves, the lean-tos' outer edges
  const fascia = (p, q) => beam(B, [p[0], p[1] - 0.08, p[2]], [q[0], q[1] - 0.08, q[2]], 0.035, 0.11, C.fascia);
  for (const c of [R.c0, R.c1]) fascia(P3(R.t0, c, R.eaves), P3(R.t1, c, R.eaves));
  for (const t of [R.t0, R.t1]) { fascia(P3(t, R.c0, R.eaves), P3(t, cr, yr)); fascia(P3(t, cr, yr), P3(t, R.c1, R.eaves)); }
  const o = D.choirRoof.outline;
  for (let i = 0; i < 5; i++) fascia(P3(o[i][0], o[i][1], D.choirRoof.eaves), P3(o[i + 1][0], o[i + 1][1], D.choirRoof.eaves));
  fascia(P3(S.t1, ch, yh), P3(S.t1, cl, yl)); fascia(P3(S.t0, cl, yl), P3(S.t1, cl, yl));
  fascia(P3(E.t, E.c0, E.y), P3(E.t, E.c1, E.y)); fascia(P3(E.t, E.c0, E.y), P3(0, E.c0, E.y)); fascia(P3(E.t, E.c1, E.y), P3(0, E.c1, E.y));
  // the ridges' caps: the nave's, the choir's and its hips
  beam(B, P3(R.t0, cr, yr + 0.04), P3(R.t1, cr, yr + 0.04), 0.12, 0.06, C.ridge);
  const [rc, ry] = D.choirRoof.ridge, re = [D.choirRoof.ridgeEnd, rc, ry];
  beam(B, P3(D.len, rc, ry + 0.04), P3(re[0], rc, ry + 0.04), 0.1, 0.05, C.ridge);
  for (const i of [1, 2, 3, 4]) beam(B, P3(o[i][0], o[i][1], D.choirRoof.eaves + 0.04), P3(re[0], re[1], re[2] + 0.04), 0.08, 0.05, C.ridge);
}

// The ridge turret: the slated belfry with its louvres on four sides, a cornice, the octagonal spire, the ball and the
// cross
function buildTurret(B) {
  const T = D.turret, [cr] = D.roof.ridge, h = T.half;
  const F = wallFrame(toWorld(T.t - h, cr - h), toWorld(T.t + h, cr - h)); // (its side towards the Promenade)
  // (the belfry from inside the roof up; the roof's slopes cover its foot)
  const foot = naveRoofY(cr - h) - 0.1;
  B.box('trim', F, 0, 2 * h, -2 * h, 0, foot, T.belfry, C.slate);
  B.box('trim', F, -0.1, 2 * h + 0.1, -2 * h - 0.1, 0.1, T.belfry, T.belfry + 0.16, C.fascia);
  // the louvres: one on each side
  const sides = [
    { G: F, a: 0, o: 0 },
    { G: wallFrame(onWall(F, 2 * h, 0), onWall(F, 2 * h, -2 * h)), a: 0, o: 0 },
    { G: wallFrame(onWall(F, 2 * h, -2 * h), onWall(F, 0, -2 * h)), a: 0, o: 0 },
    { G: wallFrame(onWall(F, 0, -2 * h), onWall(F, 0, 0)), a: 0, o: 0 }
  ];
  for (const { G } of sides) B.decal(G, h - 0.36, h + 0.36, 0.02, T.belfry - 1.45, T.belfry - 0.25, 'louvre');
  // the spire: eight faces from the belfry's cornice to the tip
  const [mx, mz] = onWall(F, h, -h), r = h + 0.05, y0 = T.belfry + 0.16, y1 = T.spire;
  const ring = [];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; ring.push([mx + Math.cos(a) * r, y0, mz + Math.sin(a) * r]); }
  const tip = [mx, y1, mz];
  for (let k = 0; k < 8; k++) {
    const p = ring[k], q = ring[(k + 1) % 8];
    const n = cross(sub(q, p), sub(tip, p)), outward = [(p[0] + q[0]) / 2 - mx, 0, (p[2] + q[2]) / 2 - mz];
    if (dot(n, outward) >= 0) B.tri('roof', p, q, tip); else B.tri('roof', q, p, tip);
  }
  // the ball and the cross on the tip
  beam(B, [mx, y1 - 0.1, mz], [mx, y1 + 0.18, mz], 0.12, 0.12, C.gilt);
  beam(B, [mx, y1 + 0.18, mz], [mx, T.cross, mz], 0.035, 0.035, C.iron);
  const [ux, uz] = F.u;
  beam(B, [mx - ux * 0.28, T.cross - 0.32, mz - uz * 0.28], [mx + ux * 0.28, T.cross - 0.32, mz + uz * 0.28], 0.035, 0.035, C.iron);
}

// The round window in the west gable over the porch's roof, the door in the porch's end on the Promenade side with a step
function buildOpenings(B) {
  const Wg = naveWall('west'), Rz = D.rose;
  // (the west wall runs from the hillside's end: s = WID − c)
  const s = D.wid - Rz.c;
  B.decal(Wg, s - Rz.r, s + Rz.r, 0.04, Rz.y - Rz.r, Rz.y + Rz.r, 'rose');
  const P = D.porch.ring, F = wallFrame(toWorld(...P[0]), toWorld(...P[1])); // (its end facing the Promenade)
  const m = F.len / 2, d = D.door, g = groundAlong(F, m - d.w / 2, m + d.w / 2), y0 = Math.max(g + 0.15, D.porch.floor);
  B.decal(F, m - d.w / 2 - 0.12, m + d.w / 2 + 0.12, 0.04, y0, y0 + d.h + 0.12, 'door');
  B.box('trim', F, m - d.w / 2 - 0.35, m + d.w / 2 + 0.35, 0, 0.6, D.base, y0, C.step);
  return F;
}

/** The camera spots for a look at it (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  promenade: [-69, -4.0, -628, -73, 3.0, -650], // where the 2026 photograph was taken
  hillside: [-37, 6.5, -713, -66, 2.0, -656], // the 2014 photographs' road up the hillside
  west: [-104, -3.0, -640, -78, 2.0, -648]
};

/**
 * Builds the church into `scene`. Returns { group, colliders }: the buttresses before the nave's long walls, at world
 * heights (baseY set, so liftColliders leaves them be); the walls stand on the surveyed outlines (js/landmarks.js).
 */
export function buildFegDavos(scene) {
  const root = new THREE.Group();
  root.name = 'FEG Davos';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'FEG Davos' }), M = materials();
  const info = buildWalls(B);
  buildCorbels(B, info);
  const piers = buildButtresses(B);
  buildRoofs(B);
  buildTurret(B);
  buildOpenings(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: piers.map(({ F, s }) => pierCollider(F, s)) };
}

/** A buttress for the player: a box from under the ground up to its cap, before the wall */
function pierCollider(F, s) {
  const Bt = D.buttress, [cx, cz] = onWall(F, s, Bt.depth / 2), hx = Bt.half, hz = Bt.depth / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  const y0 = groundHeight(cx, cz) - 0.5, y1 = D.buttress.top + 0.4;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } };
}
/** The buttresses' colliders (the tests' and the probes' way to them) */
export function buttressColliders() {
  const out = [];
  for (const side of ['south', 'north']) {
    const F = naveWall(side);
    for (const t of D.buttress.at) out.push(pierCollider(F, side === 'south' ? t : F.len - t));
  }
  return out;
}
