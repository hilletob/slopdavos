import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, max, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { CENTRAL, coverAt, isClosed, onWall, outwardRing, wallFrame, wallStretches } from './central-sporthotel-data.js';

export { CENTRAL };

// The Central Sporthotel rebuilt by hand (js/central-sporthotel-data.js), standing in for its swissBUILDINGS3D volume,
// which the streamed tiles drew as one white block with the town houses' windows: the podium in sand-coloured plaster
// with a round-arched window per bay on the lane's level and square ones on the lower floor towards the east (drawn by
// its wall material from the uv: metres along the wall from its middle, metres up the podium's floors), the dark band
// under its lettering, the terrace on its roof behind a timber rail, the entrance's door on the lane and the lanterns
// between the arches; the cream tower and the north wing with a window per bay and floor, the balconies along their
// faces (concrete fronts, dark timber rails), the closed east face with the crest and "CENTRAL SPORTHOTEL", the red
// banner of the Bündnerstübli and the piano bar on the lane's side; the low glazed storey on the podium's east half
// with its skylight, the machine room on the tower. Six meshes: the podium's walls, the hotel's, the roofs, the glass,
// the trim (one vertex-coloured mesh) and the lettering (one canvas atlas). The hotel's fascia board and hanging sign
// (js/shops.js) give way to its own lettering.

excludeBuildings([CENTRAL.exclude]);
SHOP_EXCLUSIONS.add(CENTRAL.osm);
// (the player's walls on the surveyed volumes standing on the ground, not on OSM's outline: js/landmarks.js)
SURVEYED_FOOTPRINTS.set(CENTRAL.osm, CENTRAL.parts.filter((p) => p.from === undefined).map((p) => p.ring));

const STOREY = CENTRAL.storey, BAY = 2.8;
const PS = CENTRAL.podium.storey, PBAY = 3.3;
// v of a wall: metres up its floors' grid (the hotel's: a floor's top at every multiple of STOREY, the part's `line` at
// 40 of them; the podium's: the arched storey's foot at 20 of them); closed walls carry v − CLOSED
const UP = 40 * STOREY, CLOSED = 300 * STOREY;
const PUP = 20 * PS, PCLOSED = 300 * PS;
// A window in its storey (m up from the floor's foot) and its half width: the hotel's tall ones (balcony doors behind
// the balconies), the podium's arches (the half round on `hi`) and its lower floor's
const WIN = { lo: 0.35, hi: 2.4, half: 0.82 };
const ARCH = { lo: 0.55, hi: 3.0, half: 0.95 };
const LOW = { lo: 1.3, hi: 3.4, half: 0.7 };

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const SAND = [0.42, 0.335, 0.215], CREAM = [0.56, 0.5, 0.36], WOOD = [0.1, 0.052, 0.026];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.27, 0.265, 0.25], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.podium = SIMPLE_SKINS.windowed([0.37, 0.3, 0.2], PS, ARCH.lo / PS, (ARCH.hi + ARCH.half) / PS, 0.9, 0.45);
    M.hotel = SIMPLE_SKINS.windowed([0.5, 0.45, 0.33], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4);
    M.glass = SIMPLE_SKINS.glow([0.1, 0.12, 0.13], 0.1, 0.8, [1.0, 0.8, 0.55], 0.4);
    return M;
  }
  const near = fade(140, 420), fine = fade(25, 80);
  const glow = nightGlow();
  const glassC = mix(vec3(0.02, 0.025, 0.03), vec3(0.075, 0.085, 0.095), worldNoise(0.07));
  // The podium: sand plaster; on the lane's storey a round-arched window per bay in a dark timber frame (a post and a
  // transom where the half round starts), on the lower floor a square one; the dark band under the lettering
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey: st, fv, open, rect } = windowGrid({ bay: PBAY, storey: PS, closed: PCLOSED, winHalf: ARCH.half });
    const arched = step(19.5, st).mul(step(st, 20.5)), lower = step(st, 19.5), band = step(20.5, st);
    const e = 0.015;
    const arch = (hw, lo, hi) => max(rect(hw, lo, hi, e), smoothstep(hw + e, hw - e, bu.mul(bu).add(fv.sub(hi).mul(fv.sub(hi))).sqrt()).mul(step(hi, fv)));
    const win = arch(ARCH.half + 0.1, ARCH.lo - 0.1, ARCH.hi).mul(arched).add(rect(LOW.half + 0.08, LOW.lo - 0.08, LOW.hi + 0.08).mul(lower)).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu)).max(smoothstep(0.035, 0.02, abs(fv.sub(ARCH.hi))).mul(arched)).mul(near);
    const pane = arch(ARCH.half - 0.03, ARCH.lo, ARCH.hi).mul(arched).add(rect(LOW.half - 0.04, LOW.lo, LOW.hi).mul(lower)).mul(open).mul(float(1).sub(bars));
    // the plaster's weathering, a shade darker at the foot; the band's dark frieze over the arches
    const wall = mix(vec3(...SAND).mul(0.88), vec3(...SAND), worldNoise(0.3)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.06)));
    const frieze = band.mul(step(fv, 0.16)).mul(step(0.02, fv));
    let c = mix(wall, vec3(0.12, 0.075, 0.045), frieze);
    c = mix(c, vec3(...WOOD), win);
    c = mix(c, glassC, pane);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.92), float(0.15), pane);
    m.metalnessNode = pane.mul(0.5);
    // (the restaurants and the bar: most of the arches lit in the evening)
    m.emissiveNode = litWindow(bay, st.add(half.mul(3.3)), 23, { share: 0.75, late: 0.3, tone: twoTones([1.0, 0.7, 0.4], [1.0, 0.6, 0.32], 0.5) }).mul(pane).mul(glow.mul(1.1));
    M.podium = m;
  }
  // The hotel: cream plaster, a tall window per bay and floor in a dark timber frame with a post, a curtain drawn in some
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, bay, bu, storey: st, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half + 0.07, WIN.lo - 0.07, WIN.hi + 0.07).mul(open);
    const bars = smoothstep(0.04, 0.025, abs(bu)).max(smoothstep(0.035, 0.02, abs(fv.sub(WIN.hi - 0.5)))).mul(near);
    const pane = rect(WIN.half - 0.04, WIN.lo, WIN.hi).mul(float(1).sub(bars)).mul(open);
    const wall = mix(vec3(...CREAM).mul(0.9), vec3(...CREAM), worldNoise(0.3)).mul(float(1).sub(smoothstep(0.03, 0.012, fv).mul(fine).mul(0.05)));
    const id = hash(bay.mul(37.7).add(st.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(pane).mul(near).mul(smoothstep(0.32, 0.3, abs(bu).sub(WIN.half - 0.34).abs()));
    let c = mix(wall, vec3(...WOOD), win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.42, 0.36, 0.26), drawn);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(drawn));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.5);
    m.emissiveNode = litWindow(bay, st.add(half.mul(3.3)), 17, { share: 0.45, late: 0.1, tone: twoTones([1.0, 0.74, 0.44], [0.9, 0.92, 1.0], 0.8) }).mul(pane).mul(mix(float(1), float(0.5), drawn)).mul(glow.mul(1.1));
    M.hotel = m;
  }
  // The skylight and the glazed storey's roof light: dark posts every 1.2 m, a rail every 1.5 m, lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.8 });
    const U = uv().x, V = uv().y;
    const mu = abs(fract(U.div(1.2)).sub(0.5)), mv = abs(fract(V.div(1.5)).sub(0.5));
    const frame = smoothstep(0.45, 0.47, mu).max(smoothstep(0.455, 0.475, mv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.2)).mul(13.1).add(floor(V.div(1.5)).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.07, 0.09, 0.1), vec3(0.14, 0.17, 0.18), paneId), vec3(0.06, 0.05, 0.045), frame);
    m.roughnessNode = mix(float(0.1), float(0.6), frame);
    m.metalnessNode = mix(float(0.8), float(0.2), frame);
    m.emissiveNode = vec3(1.0, 0.8, 0.55).mul(float(1).sub(frame)).mul(paneId.mul(0.3).add(0.7)).mul(glow.mul(0.35));
    M.glass = m;
  }
  return M;
}

// --- The lettering, the crest and the banner: one canvas atlas ------------------------------------------------------------
const ATLAS_SIZE = [1024, 1024];
export const ATLAS = {
  stuebli: [0, 0, 1024, 128],
  restaurant: [0, 132, 768, 112],
  central: [0, 248, 1024, 96],
  crest: [0, 352, 448, 448],
  banner: [512, 352, 256, 672]
};
const INK = '#3b2616', GOLD = '#d9b45a';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const serif = (px, weight = 700) => `${weight} ${px}px Georgia, "Times New Roman", serif`;
  // The podium's band: dark brown capitals
  cell('stuebli', (w, h) => { g.fillStyle = INK; g.font = serif(104); g.fillText('BÜNDNERSTÜBLI', w / 2, h / 2 + 4, w - 20); });
  cell('restaurant', (w, h) => { g.fillStyle = INK; g.font = serif(96); g.fillText('RESTAURANT', w / 2, h / 2 + 4, w - 20); });
  cell('central', (w, h) => {
    g.font = serif(80);
    g.fillStyle = '#7a2a1c'; g.fillText('CENTRAL', w * 0.17, h / 2 + 3, w * 0.32);
    g.fillStyle = INK; g.font = serif(64); g.fillText('·  PIANO BAR  ·  RESTAURANT', w * 0.66, h / 2 + 3, w * 0.64);
  });
  // The crest on the tower's east face: a shield in a laurel wreath under a crown, the name under it
  cell('crest', (w) => {
    const cx = w / 2, cy = 150;
    g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 7;
    // the shield
    g.beginPath(); g.moveTo(cx - 52, cy - 62); g.lineTo(cx + 52, cy - 62); g.lineTo(cx + 52, cy + 6);
    g.quadraticCurveTo(cx + 52, cy + 58, cx, cy + 82); g.quadraticCurveTo(cx - 52, cy + 58, cx - 52, cy + 6); g.closePath(); g.stroke();
    g.font = serif(58); g.fillText('CS', cx, cy + 4);
    // the wreath: leaves along two arcs
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI / 2 + side * (0.35 + i * 0.27), r = 96;
        const x = cx + Math.cos(a) * r, y = cy + 10 + Math.sin(a) * r;
        g.save(); g.translate(x, y); g.rotate(a + side * 0.6); g.beginPath(); g.ellipse(0, 0, 17, 7, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
    // the crown
    g.beginPath(); g.moveTo(cx - 40, cy - 78); g.lineTo(cx - 44, cy - 112); g.lineTo(cx - 20, cy - 92); g.lineTo(cx, cy - 122);
    g.lineTo(cx + 20, cy - 92); g.lineTo(cx + 44, cy - 112); g.lineTo(cx + 40, cy - 78); g.closePath(); g.fill();
    g.font = serif(62); g.fillText('CENTRAL', cx, 330, w - 30);
    g.font = serif(50); g.fillText('SPORTHOTEL', cx, 398, w - 30);
  });
  // The banner: deep red, a gold border, an antlered stag's head drawn in a few strokes, the names
  cell('banner', (w, h) => {
    g.fillStyle = '#6e1419'; g.fillRect(0, 0, w, h);
    g.strokeStyle = GOLD; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = GOLD; g.font = serif(30); g.fillText('BÜNDNERSTÜBLI', w / 2, 70, w - 36);
    g.font = serif(36); g.fillText('PIANOBAR', w / 2, 116, w - 36);
    g.lineWidth = 6; g.lineCap = 'round';
    const cx = w / 2, cy = 330;
    g.beginPath(); g.moveTo(cx - 20, cy + 70); g.quadraticCurveTo(cx - 6, cy, cx - 28, cy - 30); g.moveTo(cx + 20, cy + 70); g.quadraticCurveTo(cx + 6, cy, cx + 28, cy - 30);
    g.moveTo(cx - 20, cy + 70); g.lineTo(cx, cy + 110); g.lineTo(cx + 20, cy + 70);
    for (const s of [-1, 1]) {
      g.moveTo(cx + s * 28, cy - 30); g.quadraticCurveTo(cx + s * 80, cy - 70, cx + s * 70, cy - 150);
      g.moveTo(cx + s * 44, cy - 50); g.lineTo(cx + s * 96, cy - 70);
      g.moveTo(cx + s * 62, cy - 85); g.lineTo(cx + s * 104, cy - 120);
      g.moveTo(cx + s * 70, cy - 120); g.lineTo(cx + s * 50, cy - 160);
    }
    g.stroke();
    g.font = serif(22, 400); g.fillText('★ ★ ★ ★', w / 2, 540, w - 40);
    g.font = serif(28); g.fillText('Central', w / 2, 584, w - 40);
    g.fillText('Sporthotel', w / 2, 618, w - 40);
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  coping: [0.5, 0.45, 0.33], podiumCoping: [0.38, 0.31, 0.21], concrete: CREAM, slab: [0.46, 0.42, 0.31], wood: WOOD,
  door: [0.075, 0.04, 0.02], lantern: [0.025, 0.025, 0.028], lamp: [0.9, 0.75, 0.45], machine: [0.45, 0.41, 0.31]
};

// The lowest roof over three points just outside a wall (another part's roof there, or −Infinity)
function cover(part, F) {
  let low = Infinity;
  for (const t of [0.1, 0.5, 0.9]) { const [x, z] = onWall(F, F.len * t, 0.3); low = Math.min(low, coverAt(part, x, z)); }
  return low;
}

// A volume: its walls from the base (or the roof beside them) up to its roof, the roof over them, a coping round it;
// on the podium a timber rail round the terrace. Walls behind a higher part are left out
function buildPart(B, part) {
  const ring = outwardRing(part.ring), top = part.top, base = part.from ?? CENTRAL.base;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const beside = cover(part, F);
    if (beside >= top - 0.01) continue;
    const y0 = Math.max(base, beside - 0.2);
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    if (part.kind === 'glass') {
      B.quad('glass', P(0, y0), P(F.len, y0), P(F.len, top), P(0, top), [[0, 0], [F.len, 0], [F.len, top - y0], [0, top - y0]]);
      continue;
    }
    const podium = part.kind === 'podium';
    const stretches = podium ? [{ from: 0, to: F.len, windows: true }] : wallStretches(a, b, part.windows !== false && !isClosed(a, b));
    for (const st of stretches) {
      const len = st.to - st.from, mid = (st.from + st.to) / 2;
      const windows = st.windows && len >= 2.4;
      const v = podium ? (y) => y - CENTRAL.podium.floor + PUP - (windows ? 0 : PCLOSED) : (y) => y - part.line + UP - (windows ? 0 : CLOSED);
      B.quad(podium ? 'podium' : 'hotel', P(st.from, y0), P(st.to, y0), P(st.to, top), P(st.from, top),
        [[st.from - mid, v(y0)], [st.to - mid, v(y0)], [st.to - mid, v(top)], [st.from - mid, v(top)]], { half: windows ? len / 2 : 0 });
    }
    B.box('trim', F, -0.06, F.len + 0.06, -0.06, 0.1, top - 0.06, top + 0.1, podium ? C.podiumCoping : C.coping);
    // the terrace's rail: posts, a hand rail and a rail between, a step in from the edge
    if (podium && beside === -Infinity && F.len > 1.2) {
      const n = Math.max(1, Math.round(F.len / 1.8));
      for (let k = 0; k <= n; k++) { const s = 0.15 + (F.len - 0.3) * k / n; B.box('trim', F, s - 0.05, s + 0.05, -0.3, -0.2, top + 0.1, top + 1.05, C.wood); }
      B.box('trim', F, 0.1, F.len - 0.1, -0.32, -0.18, top + 0.98, top + 1.08, C.wood);
      B.box('trim', F, 0.1, F.len - 0.1, -0.28, -0.22, top + 0.5, top + 0.56, C.wood);
    }
  }
  flatRoof(B, ring, top, part.kind === 'glass' ? { bucket: 'glass' } : {});
}

// The balconies: a slab with a concrete front, the cheeks at its ends, a dark timber rail on the front
function buildBalconies(B) {
  const D = CENTRAL.balcony;
  for (const bal of CENTRAL.balconies) {
    const F = wallFrame(bal.a, bal.b);
    const s0 = D.inset, s1 = Math.min(bal.to ?? F.len, F.len) - D.inset;
    for (const y of bal.floors) {
      B.box('trim', F, s0, s1, 0, D.out, y - 0.24, y, C.slab);
      B.box('trim', F, s0, s1, D.out - 0.16, D.out, y, y + D.parapet, C.concrete);
      for (const s of [s0, s1 - 0.16]) B.box('trim', F, s, s + 0.16, 0, D.out - 0.16, y, y + D.parapet, C.concrete);
      // the rail: slats on the front, a hand rail, its sides
      B.box('trim', F, s0 + 0.05, s1 - 0.05, D.out - 0.12, D.out - 0.05, y + D.parapet, y + D.rail, C.wood);
      B.box('trim', F, s0, s1, D.out - 0.16, D.out, y + D.rail, y + D.rail + 0.06, C.wood);
      for (const s of [s0, s1 - 0.1]) B.box('trim', F, s, s + 0.1, 0, D.out - 0.16, y + D.parapet, y + D.rail + 0.06, C.wood);
    }
  }
}

// The bays of a podium's wall: their middles (m along the wall) where the wall material puts an arch
function podiumBays(F) {
  const out = [];
  for (let k = -20; k <= 20; k++) if (Math.abs(k * PBAY) + ARCH.half + 0.4 <= F.len / 2) out.push(F.len / 2 + k * PBAY);
  return out;
}

// The podium's fronts on the lane and the street: the lettering on the band, the lanterns between the arches, the
// entrance's door under an arch
function buildFronts(B) {
  const W = (key) => wallFrame(CENTRAL.walls[key].a, CENTRAL.walls[key].b);
  for (const s of CENTRAL.signs) B.decal(W(s.wall), s.from, s.to, 0.03, s.y0, s.y1, s.key);
  for (const key of ['lane', 'street']) {
    const F = W(key), bays = podiumBays(F);
    for (let i = 0; i + 1 < bays.length; i += 2) {
      const s = (bays[i] + bays[i + 1]) / 2;
      B.box('trim', F, s - 0.03, s + 0.03, 0, 0.32, -4.2, -4.14, C.lantern);
      B.box('trim', F, s - 0.12, s + 0.12, 0.2, 0.44, -4.65, -4.2, C.lantern);
      B.box('trim', F, s - 0.09, s + 0.09, 0.23, 0.41, -4.6, -4.27, C.lamp);
    }
  }
  const E = CENTRAL.entrance, F = W(E.wall), bays = podiumBays(F);
  const s = bays.reduce((best, b) => (Math.abs(b - E.at) < Math.abs(best - E.at) ? b : best), bays[0]);
  const top = CENTRAL.podium.floor + ARCH.hi - 0.1;
  B.box('trim', F, s - ARCH.half - 0.1, s + ARCH.half + 0.1, 0, 0.06, E.foot, top, C.wood);
  for (const side of [-1, 1]) B.box('trim', F, side < 0 ? s - ARCH.half + 0.05 : s + 0.03, side < 0 ? s - 0.03 : s + ARCH.half - 0.05, 0.06, 0.1, E.foot + 0.05, top - 0.12, C.door);
  B.box('trim', F, s - 1.3, s + 1.3, 0, 0.5, E.foot - 0.5, E.foot + 0.12, C.podiumCoping);
  return s;
}

// The crest on the tower's east face, the banner on its side on the lane
function buildEmblems(B) {
  const K = wallFrame(CENTRAL.walls.crest.a, CENTRAL.walls.crest.b), c = CENTRAL.crest;
  B.decal(K, (K.len - c.w) / 2, (K.len + c.w) / 2, 0.03, c.y0, c.y1, 'crest');
  const N = wallFrame(CENTRAL.walls.banner.a, CENTRAL.walls.banner.b), bn = CENTRAL.banner;
  B.box('trim', N, bn.from - 0.1, bn.to + 0.1, 0, 0.12, bn.y1, bn.y1 + 0.08, C.lantern);
  B.decal(N, bn.from, bn.to, 0.08, bn.y0, bn.y1, 'banner');
}

/**
 * Builds the Central Sporthotel into `scene`. Returns { group, colliders } (no colliders of its own: the walls of
 * OpenStreetMap's footprint are js/buildings.js', and the balconies hang over the lane two floors up or more).
 */
export function buildCentralSporthotel(scene) {
  const root = new THREE.Group();
  root.name = 'Central Sporthotel';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: ['podium', 'hotel'], name: 'Central Sporthotel' }), M = materials();
  for (const part of CENTRAL.parts) buildPart(B, part);
  buildBalconies(B);
  buildFronts(B);
  buildEmblems(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}
