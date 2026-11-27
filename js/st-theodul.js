import * as THREE from 'three/webgpu';
import { abs, attribute, float, fract, length, max, min, mix, smoothstep, step, uv, vec2, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, lateNight, nightGlow, worldNoise } from './building-kit.js';
import { ST_THEODUL, groundOutlines, innerWall, localRing, onWall, roofFacets, toWorld, towerSides, wallAt, wallFrame, wallTops, worldFrame } from './st-theodul-data.js';

export { ST_THEODUL };

// The Catholic church St. Theodul rebuilt by hand (js/st-theodul-data.js), standing in for its swissBUILDINGS3D volume,
// which the streamed tiles drew as a white block with the town houses' windows: the surveyed volumes in white
// roughcast under steep slate roofs (the nave's saddle roof with its gable to the west, the apse's pointed roof, the
// lean-tos along the north and the south side, the hipped wing in the south-west corner), the porch of three arches
// across the west front with the red door in the middle one, the round window in the gable, tall round-headed windows
// in leaded glass (a faint glow behind them in the evening); the square tower out of the north lean-to with a
// red-framed dial on each side, the belfry's arched openings, the narrower stage and the red-brown onion dome with its
// lantern, ball and cross. Six meshes: the walls, the roofs, the copper, the windows' glass, the trim (one
// vertex-coloured mesh) and the decals (one canvas atlas: the porch, the dials, the openings, the doors). The dials'
// hands are painted.

excludeBuildings([ST_THEODUL.exclude]);
// (the player's walls on the surveyed volumes, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(ST_THEODUL.osm, groundOutlines());

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.56, 0.55, 0.52], SLATE = [0.07, 0.074, 0.082], COPPER = [0.3, 0.09, 0.05];
const WARM = [1.0, 0.7, 0.4];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(SLATE, 0.8);
  M.roof.side = THREE.DoubleSide; // (the eaves' and verges' undersides)
  M.copper = SIMPLE_SKINS.snowRoof(COPPER, 0.5, 0.35);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, the windows glowing from dusk on, js/landmark-buildings.js SIMPLE_SKINS)
    M.plaster = SIMPLE_SKINS.plain(PLASTER, 0.95);
    M.glass = SIMPLE_SKINS.glow([0.06, 0.07, 0.075], 0.25, 0.3, WARM, 0.35);
    return M;
  }
  // White roughcast: a little weathering over the walls, a fine grain close by
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const grain = worldNoise(7).sub(0.5).mul(fade(8, 28)).mul(0.1);
    m.colorNode = mix(vec3(0.5, 0.49, 0.455), vec3(0.6, 0.59, 0.56), worldNoise(0.22)).mul(float(1).add(grain));
    M.plaster = m;
  }
  // Leaded glass in a stone surround: uv metres from the window's middle (u) and up from its spring line (v), aHalf
  // half its width; the round head over v 0; a post and a rail in the wide ones; diamond panes in lead, fading out by
  // 22 m; in the evening a warm glow behind them, dimmer towards midnight
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.2, metalness: 0.3 });
    const U = uv().x, V = uv().y, half = attribute('aHalf', 'float');
    const head = step(0, V);
    const edge = mix(half.sub(abs(U)), half.sub(length(vec2(U, V))), head);
    const wide = step(0.6, half);
    const frame = smoothstep(0.1, 0.075, edge).max(smoothstep(0.045, 0.03, abs(U)).mul(wide)).max(smoothstep(0.04, 0.025, abs(V)).mul(wide).mul(float(1).sub(head)));
    const d1 = fract(U.add(V).div(0.3)), d2 = fract(U.sub(V).div(0.3));
    const lead = smoothstep(0.07, 0.0, min(d1, float(1).sub(d1))).max(smoothstep(0.07, 0.0, min(d2, float(1).sub(d2)))).mul(fade(6, 22));
    const pane = mix(vec3(0.05, 0.062, 0.068), vec3(0.1, 0.11, 0.095), worldNoise(1.7));
    m.colorNode = mix(mix(pane, vec3(0.03, 0.03, 0.03), lead.mul(0.8)), vec3(0.55, 0.53, 0.49), frame);
    m.roughnessNode = mix(float(0.15), float(0.85), max(frame, lead.mul(0.5)));
    const open = float(1).sub(frame).mul(float(1).sub(lead.mul(0.7)));
    m.emissiveNode = vec3(...WARM).mul(open).mul(nightGlow()).mul(mix(float(0.45), float(0.12), lateNight()));
    M.glass = m;
  }
  return M;
}

// --- The porch, the dials, the openings: one canvas atlas ----------------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  arcade: [0, 0, 640, 324],
  dial: [640, 0, 256, 256],
  louvre: [896, 0, 128, 224],
  oculus: [640, 256, 160, 160],
  door: [800, 256, 112, 204],
  opening: [912, 256, 112, 210],
  slit: [0, 330, 40, 80]
};
const STONE = '#cfc9bd', SHADE = '#25221f';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // a round-headed shape: x, w across, its foot at `foot`, the spring line `w / 2` under its top `top`
  const arch = (x, w, top, foot) => { g.beginPath(); g.moveTo(x, foot); g.lineTo(x, top + w / 2); g.arc(x + w / 2, top + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, foot); g.closePath(); };
  const shadeFill = (top, foot) => { const gr = g.createLinearGradient(0, top, 0, foot); gr.addColorStop(0, '#171513'); gr.addColorStop(0.7, '#2c2925'); gr.addColorStop(1, '#3d3934'); return gr; };
  // The porch: three round arches on square piers, the shade inside, the porch's back wall, the red door in the middle
  // arch (the photographs of 2013)
  cell('arcade', (w, h) => {
    const aw = 160, pier = 50, end = (w - 3 * aw - 2 * pier) / 2;
    for (let i = 0; i < 3; i++) {
      const x = end + i * (aw + pier);
      arch(x, aw, 2, h); g.fillStyle = shadeFill(2, h); g.fill();
      g.lineWidth = 5; g.strokeStyle = 'rgba(40,36,32,0.45)'; g.stroke();
      // the porch's floor
      g.fillStyle = '#4a4640'; g.fillRect(x + 3, h - 16, aw - 6, 16);
      if (i === 1) {
        // the door: two red leaves under a round head, a stone frame
        const dw = 118, dx = x + (aw - dw) / 2, top = h - 222;
        arch(dx - 8, dw + 16, top - 8, h - 16); g.fillStyle = '#7d776d'; g.fill();
        arch(dx, dw, top, h - 16); g.fillStyle = '#6f2618'; g.fill();
        g.strokeStyle = '#4a170e'; g.lineWidth = 3;
        for (let k = 1; k < 8; k++) { g.beginPath(); g.moveTo(dx + (dw * k) / 8, top + 18); g.lineTo(dx + (dw * k) / 8, h - 16); g.stroke(); }
        g.lineWidth = 5; g.beginPath(); g.moveTo(dx + dw / 2, top); g.lineTo(dx + dw / 2, h - 16); g.stroke();
        g.fillStyle = '#b08a3a'; g.fillRect(dx + dw / 2 - 12, h - 120, 6, 18); g.fillRect(dx + dw / 2 + 6, h - 120, 6, 18);
      }
    }
  });
  // The dial: the red frame on the plaster, a white face, a dark chapter ring with twelve marks, the gilt hands
  cell('dial', (w, h) => {
    const cx = w / 2, cy = h / 2;
    g.strokeStyle = '#8e2b1f'; g.lineWidth = 9; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = '#efebe0'; g.beginPath(); g.arc(cx, cy, 104, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#26221e'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 104, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 72, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r0 = i % 3 === 0 ? 76 : 82;
      g.lineWidth = i % 3 === 0 ? 10 : 7;
      g.beginPath(); g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); g.lineTo(cx + Math.sin(a) * 98, cy - Math.cos(a) * 98); g.stroke();
    }
    // (ten past ten, painted)
    g.strokeStyle = '#c4902c'; g.lineCap = 'round';
    for (const [a, len, lw] of [[(10 + 10 / 60) / 12, 54, 11], [10 / 60, 86, 7]]) {
      const t = a * Math.PI * 2;
      g.lineWidth = lw; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(t) * len, cy - Math.cos(t) * len); g.stroke();
    }
    g.fillStyle = '#c4902c'; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
  });
  // The belfry's opening: louvres in a round-headed opening
  cell('louvre', (w, h) => {
    arch(6, w - 12, 4, h); g.fillStyle = SHADE; g.fill();
    g.save(); g.clip();
    g.fillStyle = '#4b4540';
    for (let y = 70; y < h; y += 15) g.fillRect(0, y, w, 6);
    g.restore();
    arch(6, w - 12, 4, h); g.lineWidth = 6; g.strokeStyle = STONE; g.stroke();
  });
  // The round window: a stone ring, dark glass, a quatrefoil in lead
  cell('oculus', (w, h) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = STONE; g.beginPath(); g.arc(cx, cy, 78, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#26313a'; g.beginPath(); g.arc(cx, cy, 64, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d8d2c6'; g.lineWidth = 5;
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24, 24, 0, Math.PI * 2); g.stroke(); }
  });
  // A side door: boards under a round head, a stone frame
  cell('door', (w, h) => {
    arch(0, w, 0, h); g.fillStyle = STONE; g.fill();
    arch(10, w - 20, 10, h); g.fillStyle = '#5a3820'; g.fill();
    g.strokeStyle = '#3e2614'; g.lineWidth = 3;
    for (let k = 1; k < 5; k++) { const x = 10 + ((w - 20) * k) / 5; g.beginPath(); g.moveTo(x, 30); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = '#20201f'; g.fillRect(w - 30, h * 0.55, 6, 14);
  });
  // The porch's arch on the north side: the shade inside, its floor
  cell('opening', (w, h) => {
    arch(4, w - 8, 2, h); g.fillStyle = shadeFill(2, h); g.fill();
    g.fillStyle = '#4a4640'; g.fillRect(6, h - 14, w - 12, 14);
  });
  cell('slit', (w, h) => { arch(4, w - 8, 2, h - 2); g.fillStyle = SHADE; g.fill(); });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = {
  plinth: [0.3, 0.295, 0.28], stone: [0.55, 0.53, 0.49], cornice: [0.58, 0.57, 0.54], iron: [0.05, 0.05, 0.055], gilt: [0.75, 0.52, 0.12]
};

/** The highest ground before a wall from s0 to s1 (half a metre out) */
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 1.5));
  for (let i = 0; i <= n; i++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * i) / n, 0.5)));
  return hi;
}
function groundLow(F) {
  let lo = Infinity;
  for (let i = 0; i <= 6; i++) lo = Math.min(lo, groundHeight(...onWall(F, (F.len * i) / 6, 0.5)));
  return lo;
}

// A volume: its walls from the base up to its roof's planes (a gable's peak where the lowest plane changes), a plinth
// along its outer walls, the roof's facets
function buildPart(B, p) {
  const ring = localRing(p), base = ST_THEODUL.base;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = worldFrame(wallFrame(a, b));
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    const tops = wallTops(p, a, b);
    for (let k = 0; k + 1 < tops.length; k++) {
      const q = tops[k], r = tops[k + 1];
      if (r.s - q.s < 1e-4) continue;
      B.quad('plaster', P(q.s, base), P(r.s, base), P(r.s, r.y), P(q.s, q.y), [[q.s, base], [r.s, base], [r.s, r.y], [q.s, q.y]]);
    }
    if (!innerWall(p, a, b)) {
      const top = Math.max(groundAlong(F) + 0.12, groundLow(F) + 0.5);
      B.box('trim', F, -0.06, F.len + 0.06, 0, 0.06, base, top, C.plinth);
    }
  }
  for (const { plane, poly } of roofFacets(p)) {
    const contour = poly.map(([s, t]) => new THREE.Vector2(s, t));
    for (const tri of THREE.ShapeUtils.triangulateShape(contour, [])) {
      const pts = tri.map((k) => { const [s, t] = poly[k], [x, z] = toWorld([s, t]); return [x, plane[0] + plane[1] * s + plane[2] * t, z]; });
      // (facing up whichever way the triangulation turned)
      const up = (pts[1][2] - pts[0][2]) * (pts[2][0] - pts[0][0]) - (pts[1][0] - pts[0][0]) * (pts[2][2] - pts[0][2]) > 0;
      const t3 = up ? pts : [pts[0], pts[2], pts[1]];
      B.tri('roof', t3[0], t3[1], t3[2], t3.map((q) => [q[0], q[2]]));
    }
  }
}

// A window: the glass (the round head as strips), a stone sill under it
function buildWindow(B, w) {
  const W = wallAt(w.at), F = worldFrame(W.F), hw = w.half, spring = w.h - hw;
  // uv: metres from the window's middle, metres up from its spring line
  const P = (u, v) => { const [x, z] = onWall(F, W.s + u, 0.03); return [x, w.sill + spring + v, z]; };
  B.quad('glass', P(-hw, -spring), P(hw, -spring), P(hw, 0), P(-hw, 0), [[-hw, -spring], [hw, -spring], [hw, 0], [-hw, 0]], { half: hw });
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (1 - i / n), a1 = Math.PI * (1 - (i + 1) / n);
    const u0 = Math.cos(a0) * hw, u1 = Math.cos(a1) * hw, v0 = Math.sin(a0) * hw, v1 = Math.sin(a1) * hw;
    B.quad('glass', P(u0, 0), P(u1, 0), P(u1, v1), P(u0, v0), [[u0, 0], [u1, 0], [u1, v1], [u0, v0]], { half: hw });
  }
  B.box('trim', F, W.s - hw - 0.1, W.s + hw + 0.1, 0, 0.12, w.sill - 0.14, w.sill + 0.02, C.stone);
}

// A painted opening or door: over the highest ground before it (a plinth under it where the ground falls away)
function buildOpening(B, o) {
  const W = wallAt(o.at), F = worldFrame(W.F), s0 = W.s - o.w / 2, s1 = W.s + o.w / 2;
  const y0 = o.y ?? groundAlong(F, s0, s1) + o.ground;
  B.decal(F, s0, s1, 0.04, y0, y0 + o.h, o.key);
}

// A solid of revolution round (x, z): profile [[r, y], …], `sides` faces, into `bucket` (`colour`: the trim's)
function lathe(B, bucket, [cx, cz], profile, sides, colour = null) {
  const a0 = Math.atan2(ST_THEODUL.along[1], ST_THEODUL.along[0]) + Math.PI / sides;
  const ring = ([r, y]) => Array.from({ length: sides }, (_, i) => { const a = a0 + (i / sides) * Math.PI * 2; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; });
  for (let k = 0; k + 1 < profile.length; k++) {
    const lo = ring(profile[k]), hi = ring(profile[k + 1]);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      B.quad(bucket, lo[j], lo[i], hi[i], hi[j], [[j, profile[k][1]], [i, profile[k][1]], [i, profile[k + 1][1]], [j, profile[k + 1][1]]], colour ? { colour } : {});
    }
  }
}

// The tower: the shaft out of the lean-to, its band and cornice, the narrower stage, the onion dome, the spike, the
// ball and the cross; the dials and openings on its sides
function buildTower(B) {
  const T = ST_THEODUL.tower, base = ST_THEODUL.base;
  const centre = toWorld(T.centre);
  for (const L of towerSides()) {
    const F = worldFrame(L), mid = F.len / 2;
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    B.quad('plaster', P(0, base), P(F.len, base), P(F.len, T.cornice), P(0, T.cornice), [[0, base], [F.len, base], [F.len, T.cornice], [0, T.cornice]]);
    B.box('trim', F, -0.1, F.len + 0.1, 0, 0.1, T.band - 0.15, T.band + 0.1, C.cornice);
    B.box('trim', F, -0.25, F.len + 0.25, 0, 0.25, T.cornice, T.ledge, C.cornice);
    B.decal(F, mid - T.dial.half, mid + T.dial.half, 0.04, T.dial.y - T.dial.half, T.dial.y + T.dial.half, 'dial');
    B.decal(F, mid - T.louvre.half, mid + T.louvre.half, 0.04, T.louvre.y0, T.louvre.y1, 'louvre');
    B.decal(F, mid - T.slit.half, mid + T.slit.half, 0.04, T.slit.y0, T.slit.y1, 'slit');
  }
  const corners = (h) => towerSides(h).map((L) => toWorld(L.a));
  flatRoof(B, corners(T.half + 0.25), T.ledge, { bucket: 'trim', colour: C.cornice });
  for (const L of towerSides(T.stage.half)) {
    const F = worldFrame(L), mid = F.len / 2, y0 = T.ledge, y1 = T.stage.top;
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    B.quad('plaster', P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), [[0, y0], [F.len, y0], [F.len, y1], [0, y1]]);
    B.box('trim', F, -0.12, F.len + 0.12, 0, 0.12, y1 - 0.12, y1 + 0.1, C.cornice);
    B.decal(F, mid - T.small.half, mid + T.small.half, 0.04, T.small.y0, T.small.y1, 'louvre');
  }
  flatRoof(B, corners(T.stage.half + 0.12), T.stage.top + 0.1, { bucket: 'copper' });
  lathe(B, 'copper', centre, T.onion, 16);
  // the spike, its ball, the cross (its arms across the nave's axis)
  const F = { a: centre, u: ST_THEODUL.along, n: [-ST_THEODUL.along[1], ST_THEODUL.along[0]] };
  B.box('trim', F, -0.04, 0.04, -0.04, 0.04, T.spike.y0, T.cross.y0, C.iron);
  const r = T.spike.r, ball = [];
  for (let k = 0; k <= 6; k++) { const a = Math.PI * (k / 6 - 0.5); ball.push([Math.max(0.001, Math.cos(a) * r), T.spike.ball + Math.sin(a) * r]); }
  lathe(B, 'trim', centre, ball, 10, C.gilt);
  const X = T.cross;
  B.box('trim', F, -0.045, 0.045, -0.045, 0.045, X.y0, X.y1, C.gilt);
  B.box('trim', F, -0.045, 0.045, -X.half, X.half, X.arm - 0.045, X.arm + 0.045, C.gilt);
}

// The cross on the west gable's top
function buildGableCross(B) {
  const X = ST_THEODUL.gableCross, F = { a: toWorld(X.at), u: ST_THEODUL.along, n: [-ST_THEODUL.along[1], ST_THEODUL.along[0]] };
  B.box('trim', F, -0.05, 0.05, -0.05, 0.05, X.y0 - 0.3, X.y1, C.iron);
  B.box('trim', F, -0.05, 0.05, -X.half, X.half, X.arm - 0.05, X.arm + 0.05, C.iron);
}

/**
 * Builds the church into `scene`. Returns { group, colliders } (no colliders of its own: the player's walls stand on
 * the surveyed outlines, js/buildings.js; nothing stands free of them).
 */
export function buildStTheodul(scene) {
  const root = new THREE.Group();
  root.name = 'St. Theodul';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'glass', name: 'St. Theodul' }), M = materials();
  for (const p of ST_THEODUL.parts) buildPart(B, p);
  for (const w of ST_THEODUL.windows) buildWindow(B, w);
  for (const o of ST_THEODUL.openings) buildOpening(B, o);
  buildTower(B);
  buildGableCross(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
