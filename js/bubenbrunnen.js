import * as THREE from 'three/webgpu';
import { float, mix, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, worldNoise } from './building-kit.js';
import { onWall, wallFrame } from './spital-data.js';
import { BUBENBRUNNEN, FACE_FIGURES, basinBox, hexagon, octagon, polygon } from './bubenbrunnen-data.js';

export { BUBENBRUNNEN };

// The fountain of red sandstone on the traffic island before St. Theodul in Davos Dorf (js/bubenbrunnen-data.js): the
// octagonal basin on its two steps, the six slender posts over the rim round the pillar in the middle, the six-sided
// block above them with a boy in a hexagonal frame carved on each face (drawn simply after the photographs, one canvas
// atlas), the small pointed cap. Still water in the basin in summer; in winter snow lies on the water, the rim, the
// steps and the cap (SIMPLE_SKINS.snowRoof: what faces up). Five meshes: the stone, its tops, the cap, the water and
// the carved faces. One collider: the basin.

const S = BUBENBRUNNEN;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
function materials() {
  const M = {};
  M.top = SIMPLE_SKINS.snowRoof(S.sandstone, 0.9);
  M.cap = SIMPLE_SKINS.snowRoof(S.slate, 0.7);
  M.water = SIMPLE_SKINS.snowRoof(S.water, 0.06, 0.1);
  if (QUALITY.simpleMaterials) {
    M.stone = SIMPLE_SKINS.plain(S.sandstone, 0.9);
    return M;
  }
  // Red sandstone: blotched a little in tone, a fine grain close by
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const grain = worldNoise(9).sub(0.5).mul(fade(6, 24)).mul(0.14);
  m.colorNode = mix(vec3(0.28, 0.1, 0.075), vec3(0.36, 0.14, 0.1), worldNoise(1.3)).mul(float(1).add(grain));
  M.stone = m;
  return M;
}

// --- The carved faces: one canvas atlas, a cell per figure --------------------------------------------------------------
const ATLAS_SIZE = [768, 256];
export const ATLAS = { boy0: [0, 0, 256, 256], boy1: [256, 0, 256, 256], boy2: [512, 0, 256, 256] };
const STONE = '#9a4a3a', LIGHT = '#b8634f', DEEP = '#2a0f0a';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  const hex = (cx, cy, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i / 6) * Math.PI * 2; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); };
  // a figure as round-ended strokes (limbs) and a head, lit from above left: the shadow first, offset, then the stone
  const figure = (limbs, head) => {
    for (const [dx, dy, colour] of [[5, 6, DEEP], [0, 0, LIGHT]]) {
      g.strokeStyle = colour; g.fillStyle = colour; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [w, ...pts] of limbs) {
        g.lineWidth = w; g.beginPath();
        pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x + dx, y + dy));
        g.stroke();
      }
      g.beginPath(); g.arc(head[0] + dx, head[1] + dy, head[2], 0, Math.PI * 2); g.fill();
    }
  };
  const frame = (w, h, draw) => {
    const cx = w / 2, cy = h / 2;
    // the face's stone, the hexagonal frame standing out, the hollow inside it (carved through: dark)
    g.fillStyle = STONE; g.fillRect(0, 0, w, h);
    hex(cx, cy, 118); g.fillStyle = LIGHT; g.fill();
    hex(cx, cy, 100); g.fillStyle = DEEP; g.fill();
    hex(cx + 3, cy + 4, 96); g.fillStyle = '#4a1d14'; g.fill();
    g.save(); hex(cx, cy, 100); g.clip(); draw(cx, cy); g.restore();
    hex(cx, cy, 118); g.lineWidth = 4; g.strokeStyle = '#6e2a1e'; g.stroke();
  };
  // standing, the arms raised to the frame
  cell('boy0', (w, h) => frame(w, h, (cx, cy) => figure([
    [22, [cx, cy - 30], [cx, cy + 25]],
    [15, [cx, cy - 22], [cx - 40, cy - 60], [cx - 62, cy - 70]], [15, [cx, cy - 22], [cx + 40, cy - 60], [cx + 62, cy - 70]],
    [17, [cx, cy + 22], [cx - 24, cy + 60], [cx - 30, cy + 88]], [17, [cx, cy + 22], [cx + 24, cy + 60], [cx + 30, cy + 88]]
  ], [cx, cy - 52, 17])));
  // climbing, crouched, one knee up, the hands on the frame
  cell('boy1', (w, h) => frame(w, h, (cx, cy) => figure([
    [22, [cx - 10, cy - 20], [cx + 8, cy + 22]],
    [15, [cx - 8, cy - 14], [cx - 52, cy - 30], [cx - 78, cy - 10]], [15, [cx - 8, cy - 14], [cx + 30, cy - 52], [cx + 58, cy - 62]],
    [17, [cx + 8, cy + 20], [cx + 50, cy + 12], [cx + 52, cy + 56]], [17, [cx + 8, cy + 20], [cx - 22, cy + 52], [cx - 4, cy + 84]]
  ], [cx - 20, cy - 44, 17])));
  // on his hands, the legs up and bent
  cell('boy2', (w, h) => frame(w, h, (cx, cy) => figure([
    [22, [cx, cy + 22], [cx + 4, cy - 22]],
    [15, [cx, cy + 18], [cx - 30, cy + 56], [cx - 34, cy + 86]], [15, [cx, cy + 18], [cx + 30, cy + 56], [cx + 36, cy + 86]],
    [17, [cx + 4, cy - 20], [cx - 30, cy - 52], [cx - 64, cy - 46]], [17, [cx + 4, cy - 20], [cx + 38, cy - 56], [cx + 30, cy - 86]]
  ], [cx, cy + 46, 17])));
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
/** The highest and the lowest ground under the steps */
export function groundUnder() {
  let hi = -Infinity, lo = Infinity;
  for (const [x, z] of [S.centre, ...octagon(S.steps[0].apothem)]) { const y = groundHeight(x, z); hi = Math.max(hi, y); lo = Math.min(lo, y); }
  return { hi, lo };
}

// A prism over a ring (wallFrame order: outside out) from y0 to y1, its sides into `side`, its top into `top`
function prism(B, ring, y0, y1, side = 'stone', top = 'top') {
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    B.quad(side, P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), [[0, y0], [F.len, y0], [F.len, y1], [0, y1]]);
  }
  if (top) flatRoof(B, ring, y1, { bucket: top });
}
// The inside of a ring's walls (facing in) from y0 to y1
function hollow(B, ring, y0, y1) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i + 1) % ring.length], b = ring[i], F = wallFrame(a, b);
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    B.quad('stone', P(0, y0), P(F.len, y0), P(F.len, y1), P(0, y1), [[0, y0], [F.len, y0], [F.len, y1], [0, y1]]);
  }
}
// The band between two rings (an annulus of quads) at `y`, facing up (or down, `down`)
function annulus(B, outer, inner, y, bucket = 'top', down = false) {
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    let q = [[outer[i][0], y, outer[i][1]], [outer[j][0], y, outer[j][1]], [inner[j][0], y, inner[j][1]], [inner[i][0], y, inner[i][1]]];
    // (the quad's normal, (b − a) × (d − a), up or down as asked)
    const [a, b, , d] = q, ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    if ((ny > 0) === down) q = [q[0], q[3], q[2], q[1]];
    B.quad(bucket, ...q, q.map((p) => [p[0], p[2]]));
  }
}

/**
 * Builds the fountain into `scene`. Returns { group, colliders } (one: the basin).
 */
export function buildBubenbrunnen(scene) {
  const root = new THREE.Group();
  root.name = 'Bubenbrunnen';
  root.userData.terrain = 'absolute'; // its heights are the ground's (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, name: 'Bubenbrunnen' }), M = materials();
  const { hi, lo } = groundUnder(), base = lo - 0.25, y = (h) => hi + h;
  // the steps
  let below = base;
  for (const st of S.steps) { prism(B, octagon(st.apothem), below, y(st.top)); below = y(st.top) - 0.02; }
  // the basin: its wall, the rim standing out a little, the inside down to the water, the water
  const bs = S.basin, outer = octagon(bs.apothem), rim = octagon(bs.apothem + bs.rim), inner = octagon(bs.apothem - bs.wall);
  prism(B, outer, y(S.steps[1].top) - 0.02, y(bs.top - 0.1), 'stone', null);
  prism(B, rim, y(bs.top - 0.1), y(bs.top), 'stone', null);
  annulus(B, rim, inner, y(bs.top));
  hollow(B, inner, y(bs.water - 0.05), y(bs.top));
  flatRoof(B, inner, y(bs.water), { bucket: 'water' });
  // the pillar in the middle, from the water up to the block
  prism(B, polygon(8, S.pillar.r), y(bs.water - 0.05), y(S.pillar.top), 'stone', null);
  // six posts on the rim under the block's corners
  for (const [px, pz] of hexagon(S.posts.radius)) {
    const h = S.posts.half;
    prism(B, [[px + h, pz - h], [px - h, pz - h], [px - h, pz + h], [px + h, pz + h]], y(bs.top), y(S.posts.top), 'stone', null);
  }
  // the block: a band under it, its six carved faces, a band over it; the cap
  const K = S.block, hexOut = hexagon(K.radius + 0.06), hexIn = hexagon(K.radius);
  prism(B, hexOut, y(K.bottom), y(K.bottom + K.band), 'stone', null);
  annulus(B, hexOut, hexagon(0.01), y(K.bottom), 'stone', true); // (its underside, seen from beside the basin)
  prism(B, hexIn, y(K.bottom + K.band), y(K.top - K.band), 'stone', null);
  prism(B, hexOut, y(K.top - K.band), y(K.top), 'stone', null);
  hexIn.forEach((a, i) => {
    const F = wallFrame(a, hexIn[(i + 1) % 6]);
    B.decal(F, 0.02, F.len - 0.02, 0.012, y(K.bottom + K.band), y(K.top - K.band), `boy${FACE_FIGURES[i]}`);
  });
  const C = S.cap, eaves = hexagon(C.eaves), apex = [S.centre[0], y(C.apex), S.centre[1]];
  prism(B, eaves, y(K.top), y(C.y0), 'stone', null);
  eaves.forEach((a, i) => {
    const b = eaves[(i + 1) % 6];
    B.tri('cap', [a[0], y(C.y0), a[1]], [b[0], y(C.y0), b[1]], apex, [[0, 0], [1, 0], [0.5, 1]]);
  });
  prism(B, polygon(6, 0.06, 0), y(C.apex - 0.05), y(C.knob), 'cap', 'cap');
  M.decal = decalMaterial(atlasTexture(), { roughness: 0.9 });
  root.add(...B.meshes(M));
  scene.add(root);
  const [minX, minZ, maxX, maxZ] = basinBox();
  return { group: root, colliders: [{ minX, maxX, minZ, maxZ, baseY: base, minY: base, maxY: y(bs.top) }] };
}
