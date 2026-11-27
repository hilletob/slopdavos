import * as THREE from 'three/webgpu';
import { attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, nightGlow, worldNoise } from './building-kit.js';
import { MIGROS_DORF, glassFoot, groundStretches, onWall, outwardRing, panes, roofOutline, roofPlanes, roofTop, sharedWith, soffit, toFront, wallFrame, wallOf } from './migros-dorf-data.js';

export { MIGROS_DORF };

// The house of the Migros in Davos Dorf rebuilt by hand (js/migros-dorf-data.js), standing in for its swissBUILDINGS3D
// volumes, which the streamed tiles drew as white blocks with the town houses' windows: one tall storey under a flat
// roof, its deep eaves with a brown timber soffit and fascia all round; on
// the Promenade the shop's glazing between two piers of rough stone (dark posts, a transom at the doors' height, blinds
// behind the upper panes), the glass doors in the left third with the name in orange letters over them; the other sides
// closed white walls on a stone plinth, a staff door on the lane, the delivery gate in brown boards on the car park.
// Six meshes: the walls, the stone, the shop's glass, the roof, the trim (one vertex-coloured mesh) and the lettering
// (one canvas atlas).

excludeBuildings(MIGROS_DORF.exclude);
// (the name is drawn on the surveyed walls here: OpenStreetMap's, where js/shops.js would hang its board, stand off them)
SHOP_EXCLUSIONS.add(MIGROS_DORF.osm);
for (const id of MIGROS_DORF.shops) SHOP_EXCLUSIONS.add(id);
// (the player's walls on the surveyed volumes, not on OSM's outline: js/landmarks.js; only the eaves hang over the
// ground)
SURVEYED_FOOTPRINTS.set(MIGROS_DORF.osm, MIGROS_DORF.parts.map((p) => p.ring));

const S = MIGROS_DORF;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const PLASTER = [0.58, 0.565, 0.53], STONE = [0.27, 0.25, 0.22];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.2, 0.19, 0.18], 0.85);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, the shop's glass glowing faintly at night; js/landmark-buildings.js)
    M.plaster = SIMPLE_SKINS.plain([0.52, 0.505, 0.475], 0.92);
    M.stone = SIMPLE_SKINS.plain(STONE, 0.95);
    M.glass = SIMPLE_SKINS.glow([0.08, 0.095, 0.1], 0.15, 0.6, [1.0, 0.9, 0.74], 0.15);
    return M;
  }
  const U = uv().x, V = uv().y;
  const glow = nightGlow();
  // White plaster, a little weathered, darker at its foot
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    m.colorNode = mix(vec3(0.54, 0.525, 0.49), vec3(...PLASTER).mul(1.04), worldNoise(0.3));
    M.plaster = m;
  }
  // Rough grey-brown stone laid in uneven courses (uv: metres along and up), the joints fading out with distance
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const course = floor(V.div(0.34)), cv = fract(V.div(0.34));
    const su = U.add(hash(course.mul(17.3)).mul(0.6)), stone = floor(su.div(0.55)), cu = fract(su.div(0.55));
    const joint = smoothstep(0.1, 0.03, cv.min(float(1).sub(cv))).max(smoothstep(0.07, 0.02, cu.min(float(1).sub(cu)))).mul(fade(8, 28));
    const shade = hash(stone.mul(13.1).add(course.mul(7.7)));
    const c = mix(vec3(...STONE).mul(0.8), vec3(0.36, 0.33, 0.28), shade).mul(worldNoise(1.3).mul(0.2).add(0.9));
    m.colorNode = mix(mix(vec3(...STONE), c, fade(15, 60)), vec3(0.12, 0.115, 0.105), joint);
    M.stone = m;
  }
  // The shop's glazing: dark posts between the panes (aHalf carries a pane's width), the transom, blinds behind the
  // upper panes; at night shut, a faint glow behind most panes and a few lit
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.7 });
    const pw = attribute('aHalf', 'float');
    const q = U.div(pw), mu = fract(q), pane = floor(q);
    const frame = smoothstep(0.07, 0.05, mu.min(float(1).sub(mu)).mul(pw))
      .max(smoothstep(0.1, 0.08, V.sub(S.transom + 0.05).abs()))
      .mul(fade(40, 120).mul(0.7).add(0.3));
    const upper = step(S.transom + 0.15, V);
    const slat = smoothstep(0.3, 0.5, fract(U.div(0.1))).mul(fade(8, 28)).mul(0.12);
    const blinds = vec3(0.34, 0.33, 0.3).mul(float(1).sub(slat));
    const id = hash(pane.mul(13.1).add(pw.mul(31.7)));
    const glassC = mix(vec3(0.05, 0.062, 0.068), vec3(0.14, 0.13, 0.11), id.mul(0.5));
    m.colorNode = mix(mix(glassC, mix(glassC, blinds, 0.6), upper), vec3(0.04, 0.042, 0.045), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.7), float(0.2), frame);
    const level = mix(float(0.1), float(0.7), step(0.85, id)).mul(float(1).sub(upper.mul(0.6)));
    m.emissiveNode = vec3(1.0, 0.92, 0.78).mul(level).mul(float(1).sub(frame)).mul(glow);
    M.glass = m;
  }
  return M;
}

// --- The lettering: one canvas atlas -------------------------------------------------------------------------------------
const ATLAS_SIZE = [1024, 256];
export const ATLAS = { migros: [0, 0, 768, 160] };

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // (plain letters, no traced logo)
  cell('migros', (w, h) => { g.fillStyle = '#ff6600'; g.font = 'bold 150px Helvetica, Arial, sans-serif'; g.fillText('MIGROS', w / 2, h / 2 + 6, w - 24); });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  head: [0.05, 0.052, 0.055], frame: [0.05, 0.055, 0.06], step: [0.3, 0.3, 0.29], door: [0.16, 0.17, 0.17],
  gate: [0.2, 0.1, 0.045], batten: [0.15, 0.075, 0.033], soffit: [0.3, 0.16, 0.07], fascia: [0.22, 0.115, 0.05]
};

/** The highest ground along a wall from s0 to s1, half a metre before it */
function groundAlong(F, s0, s1) {
  let hi = -Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.8));
  for (let i = 0; i <= n; i++) hi = Math.max(hi, groundHeight(...onWall(F, s0 + ((s1 - s0) * i) / n, 0.5)));
  return hi;
}

/** The soffit over a point `s` m along a wall */
const soffitAt = (F, s) => soffit(toFront(...onWall(F, s))[1]);

// Plaster on a wall from s0 to s1, from y0 up to the soffit (cut at the ridge's line, where the soffit turns)
function plasterToSoffit(B, F, s0, s1, y0) {
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const o0 = toFront(...onWall(F, s0))[1], o1 = toFront(...onWall(F, s1))[1], r = S.roof.ridgeO;
  const cuts = [s0];
  if ((o0 - r) * (o1 - r) < 0) cuts.push(s0 + ((s1 - s0) * (r - o0)) / (o1 - o0));
  cuts.push(s1);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1], ya = soffitAt(F, a), yb = soffitAt(F, b);
    B.quad('plaster', P(a, y0), P(b, y0), P(b, yb), P(a, ya), [[a, y0], [b, y0], [b, yb], [a, ya]]);
  }
}

// An outer wall: the ground floor stretch by stretch (the shop's glazing over a plinth with a dark head over it, or the
// closed wall on a stone plinth stepping down the ground), up to the soffit
function buildWall(B, part, a, b) {
  const F = wallFrame(a, b);
  if (F.len < 0.05 || sharedWith(part, a, b)) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  for (const st of groundStretches(a, b)) {
    const foot = st.glazed ? glassFoot(groundAlong(F, st.from, st.to)) : null;
    if (foot !== null) {
      B.box('stone', F, st.from, st.to, -0.05, 0.06, S.base, foot);
      const { w } = panes(st.to - st.from);
      B.quad('glass', P(st.from, foot), P(st.to, foot), P(st.to, S.glass), P(st.from, S.glass),
        [[0, foot - S.floor], [st.to - st.from, foot - S.floor], [st.to - st.from, S.glass - S.floor], [0, S.glass - S.floor]], { half: w });
      B.box('trim', F, st.from, st.to, -0.02, 0.05, S.glass, Math.max(soffitAt(F, st.from), soffitAt(F, st.to)) + 0.02, C.head);
      continue;
    }
    plasterToSoffit(B, F, st.from, st.to, S.base);
    // the plinth stepping down the ground, at most 6 m a step
    const n = Math.max(1, Math.ceil((st.to - st.from) / 6)), d = (st.to - st.from) / n;
    for (let i = 0; i < n; i++) {
      const s0 = st.from + i * d, s1 = s0 + d;
      B.box('stone', F, s0, s1, -0.05, 0.06, S.base, groundAlong(F, s0, s1) + 0.5);
    }
  }
}

// The stone piers at the front's corners, returning a metre along the side walls
function buildPiers(B) {
  const Pr = S.piers, W = wallOf(Pr.wall), top = soffit(0) + 0.02;
  B.box('stone', W, Pr.north[0] - Pr.out, Pr.north[1], -0.05, Pr.out, S.base, top);
  B.box('stone', W, Pr.south[0], Pr.south[1] + Pr.out, -0.05, Pr.out, S.base, top);
  const N = wallOf('north'), So = wallOf('south');
  B.box('stone', N, N.len - 1.0, N.len, -0.05, Pr.out, S.base, soffitAt(N, N.len - 1.0) + 0.02);
  B.box('stone', So, 0, 1.0, -0.05, Pr.out, S.base, soffitAt(So, 1.0) + 0.02);
}

// The entrance: the glass doors' dark frames standing out of the glazing, a step before them
function buildEntrance(B) {
  const E = S.entrance, F = wallOf(E.wall), half = E.w / 2;
  const foot = glassFoot(groundAlong(F, E.s - half, E.s + half)), h = S.floor + E.h;
  for (const s of [E.s - half, E.s - half / 2, E.s + half / 2, E.s + half]) B.box('trim', F, s - 0.06, s + 0.06, 0, 0.25, foot, h, C.frame);
  B.box('trim', F, E.s - half - 0.06, E.s + half + 0.06, 0, 0.25, h, h + 0.14, C.frame);
  B.box('trim', F, E.s - half - 0.4, E.s + half + 0.4, 0, 0.9, groundHeight(...onWall(F, E.s, 0.9)) - 0.4, foot, C.step);
}

// The staff door in the lane's side: its frame and leaf
function buildStaffDoor(B) {
  const D = S.staffDoor, F = wallOf(D.wall), half = D.w / 2;
  const y0 = groundAlong(F, D.s - half, D.s + half) + 0.05;
  B.box('trim', F, D.s - half - 0.08, D.s + half + 0.08, 0, 0.08, y0 - 0.05, y0 + D.h + 0.08, C.frame);
  B.box('trim', F, D.s - half, D.s + half, 0.08, 0.11, y0, y0 + D.h, C.door);
}

// The delivery gate: its frame, the boards, the battens over them
function buildGate(B) {
  const G = S.gate, F = wallOf(G.wall);
  const y0 = groundAlong(F, G.s0, G.s1) + 0.02, y1 = y0 + G.h;
  B.box('trim', F, G.s0 - 0.12, G.s1 + 0.12, 0, 0.09, y0 - 0.3, y1 + 0.12, C.frame);
  B.box('trim', F, G.s0, G.s1, 0.09, 0.13, y0, y1, C.gate);
  for (let s = G.s0 + 0.35; s < G.s1 - 0.2; s += 0.5) B.box('trim', F, s - 0.04, s + 0.04, 0.13, 0.16, y0 + 0.05, y1 - 0.05, C.batten);
}

// A plane of the roof (an outline in the front's frame) at heights y(o): its triangles facing up or down
function roofPlane(B, outline, y, bucket, down, colour = null) {
  const W = wallOf('west');
  const pts = outline.map(([s, o]) => { const [x, z] = onWall(W, s, o); return [x, y(o), z]; });
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(outline.map(([s, o]) => new THREE.Vector2(s, o)), [])) {
    const p = [pts[i], pts[j], pts[k]];
    const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
    const t = up !== down ? p : [p[0], p[2], p[1]];
    B.tri(bucket, t[0], t[1], t[2], t.map((q) => [q[0], q[2]]), { colour });
  }
}

// The roof: its two planes meeting at the ridge, the timber soffit under the eaves, the fascia boards round its edge
function buildRoof(B) {
  const Pl = roofPlanes(), R = S.roof;
  for (const plane of [Pl.front, Pl.back]) {
    roofPlane(B, plane, roofTop, 'roof', false);
    roofPlane(B, plane, soffit, 'trim', true, C.soffit);
  }
  // the fascia boards round the outline, facing out, a little over the roof and under the soffit
  const W = wallOf('west'), O = outwardRing(roofOutline().map(([s, o]) => onWall(W, s, o)));
  for (let i = 0; i < O.length; i++) {
    const F = wallFrame(O[i], O[(i + 1) % O.length]);
    if (F.len < 0.01) continue;
    const t0 = roofTop(toFront(...O[i])[1]) + 0.05, t1 = roofTop(toFront(...O[(i + 1) % O.length])[1]) + 0.05;
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    const d = R.thick + 0.12;
    B.quad('trim', P(0, t0 - d), P(F.len, t1 - d), P(F.len, t1), P(0, t0), undefined, { colour: C.fascia });
  }
}

/**
 * Builds the house of the Migros in Davos Dorf into `scene`. Returns { group, colliders } (none of its own: the
 * player's walls stand on the surveyed outlines, js/buildings.js via SURVEYED_FOOTPRINTS; the eaves hang over the
 * ground, the entrance's step is a kerb's height).
 */
export function buildMigrosDorf(scene) {
  const root = new THREE.Group();
  root.name = 'Migros Davos Dorf';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['glass'], name: 'Migros Davos Dorf' }), M = materials();
  for (const part of S.parts) {
    const ring = outwardRing(part.ring);
    for (let i = 0; i < ring.length; i++) buildWall(B, part, ring[i], ring[(i + 1) % ring.length]);
  }
  buildPiers(B);
  buildEntrance(B);
  buildStaffDoor(B);
  buildGate(B);
  buildRoof(B);
  for (const L of S.lettering) B.decal(wallOf(L.wall), L.s0, L.s1, L.out, L.y0, L.y1, L.key);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
