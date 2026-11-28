import * as THREE from 'three/webgpu';
import { abs, attribute, float, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { SHOPS_DATA } from './shops-data.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  HIP, HOUSES, PARTS, PROMENADE_PLATZ, facesPromenade, freeParts, groundOutlines, insideOther, namedWall, onWall, outwardRing, part,
  partWalls, pointInRing, wallFrame
} from './promenade-platz-data.js';

export { PROMENADE_PLATZ, PARTS, HOUSES };

// The row of houses on the Promenade in Davos Platz rebuilt by hand (js/promenade-platz-data.js), standing in for their
// swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows.
// The look after Mapillary's street views (2013–2015, CC BY-SA; the camera's place and heading checked against the
// outlines for each, several showing the house next door):
// - Promenade 60: salmon plaster, the shops on the Promenade under a dark red band, five floors to the cornice, the
//   attic set back under the hipped roof (from the north, 486268765852756 and 872668696923585: the red-brown house
//   behind the green Benetton house; the pink house with BALLY and the lantern seen from the south is its southern part
//   or the Arkaden, not in the survey here);
// - the Bike Academy's house: white, the shops between stone-clad piers under a broad white fascia (BUCHERER and ROLEX
//   in 2013–2015: 303229444739407, 209198624046125, 501062784365732), the balcony bands with plastered parapets, the
//   deep eaves on a timber soffit; the round white tower and the low wings behind it from the lane up the slope
//   (472980507484971 and 212556497301489, filed under the yellow block);
// - the yellow block: four floors of plain windows over the shops under cream awnings (3894118067361892,
//   215602779971464), the low wing with its awnings before it on the Promenade (303229444739407);
// - the cream house: six floors, the stacks of timber balconies on its west end (809681693309484, 183640123583694),
//   the shops under red awnings;
// - the grey house: rough grey plaster with white-framed windows over the shop band (Tchibo's in 2013:
//   514058336640124, 454972505764622);
// - the mint-green block: flat-roofed, its shops on the Promenade (490831359008041 under its canopy), mint-green over
//   the slope (515903866443428, 372570637370858, 2015, the hoarding before it is the site across the lane);
// - the Blue Lemon's house: apricot plaster, the shop front in white plaster with quoins and the navy board, the timber
//   balconies, the deep brown eaves (297912768443495, 931148957644842);
// - the Haus Fortuna: pale mint-white over a grey shop floor, the Ang'n Hus: warm beige with the timber balcony under its
//   eaves (1187120151742413, 490831359008041, 2015; the camera's places put the names one house off: read as the order
//   along the street).
// Guessed: the Raiffeisen's block (built after the photographs: the survey's box, a plain modern front), the back
// fronts up the slope and down it, the low shops and the link between the Ang'n Hus and the Haus Fortuna, the colours
// of the back wings.
// Windows are drawn by the walls' material from their uv (metres along the wall from its middle, the floors' grid up
// it, each house's floors stretched to it); the shops' glazing on the walls facing the Promenade, their fascia and the
// businesses' boards (js/shops-data.js, lettered here: the generic boards would stand on OpenStreetMap's outlines,
// off these walls). Five meshes: the walls, the roofs, the trim (one vertex-coloured mesh), the shops' glass and the
// decals (one canvas atlas).

excludeBuildings(PROMENADE_PLATZ.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js)
for (const [osm, rings] of groundOutlines()) SURVEYED_FOOTPRINTS.set(osm, rings);
for (const id of PROMENADE_PLATZ.shops) SHOP_EXCLUSIONS.add(id);

const { storey: STOREY, win: WIN, bay: BAY } = PROMENADE_PLATZ;
// v of a wall: the floors' grid in grid metres, a house's ground floor's foot at 40 storeys; closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
const FASCIA = 0.7; // the shops' band under the first floor
const ATTIC = 1.9; // Promenade 60's attic storey

/** v of height y on a part's walls: the ground floor (and those under it) stretched to one grid storey, the floors over it */
export function vOf(p, y) {
  const H = HOUSES[p.house];
  if (p.attic) return UP + 50 * STOREY + ((y - p.base) * STOREY) / ATTIC;
  if (y < H.shop) return UP + ((y - H.floor) * STOREY) / (H.shop - H.floor);
  return UP + STOREY + ((y - H.shop) * STOREY) / H.storey;
}

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.17, 0.165, 0.16];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: each house's plaster from its vertices, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.88, 0.3, { bay: BAY, half: WIN.half });
    M.walls.vertexColors = true;
    M.glass = SIMPLE_SKINS.glow([0.05, 0.06, 0.07], 0.12, 0.5, [1.0, 0.8, 0.58], 0.25);
    return M;
  }
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  // The plaster in each house's colour (its vertices), weathered; a window per bay: a white frame, a post in its middle and
  // a transom, a sill under it, a curtain drawn in some
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const { half, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
  const skin = attribute('color', 'vec3');
  const plaster = skin.mul(mix(float(0.93), float(1.05), worldNoise(0.35)));
  const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
  const tr = WIN.lo + (WIN.hi - WIN.lo) * 0.7;
  const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.03, 0.018, abs(fv.sub(tr))));
  const pane = rect(WIN.half - 0.07, WIN.lo + 0.07, WIN.hi - 0.07).mul(float(1).sub(bars.mul(fine))).mul(open);
  const sill = rect(WIN.half + 0.08, WIN.lo - 0.09, WIN.lo).mul(open).mul(near);
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
  const drawn = step(0.55, id).mul(mix(float(0.25), float(0.65), step(0.85, id)));
  const span = WIN.hi - WIN.lo - 0.14;
  const curtain = step(float(WIN.hi - 0.07).sub(drawn.mul(span)), fv).mul(pane).mul(near);
  const glassC = mix(vec3(0.02, 0.024, 0.028), vec3(0.06, 0.075, 0.09), worldNoise(0.07));
  let c = mix(plaster, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, vec3(0.56, 0.56, 0.54), win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.55, 0.52, 0.46), curtain);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(curtain));
  m.roughnessNode = mix(float(0.9), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (flats and offices: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 61, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1));
  M.walls = m;
  // The shops' glass: uv metres along the glazing and up from its foot; a mullion every 1.8 m, a transom, a faint glow
  // from the shop behind at night, some displays lit
  const g = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.45 });
  const U = uv().x, V = uv().y;
  const d = abs(fract(U.div(1.8).add(0.5)).sub(0.5)).mul(1.8);
  const mull = smoothstep(0.06, 0.035, d).max(smoothstep(0.05, 0.03, abs(V.sub(2.35)))).mul(fade(10, 40));
  const cell = U.div(1.8).add(0.5).floor();
  const lit = step(0.55, hash(cell.mul(19.3).add(7.1)));
  g.colorNode = mix(mix(vec3(0.03, 0.036, 0.042), vec3(0.07, 0.065, 0.06), smoothstep(1.6, 0.2, V)), vec3(0.09, 0.09, 0.09), mull);
  g.roughnessNode = mix(float(0.1), float(0.6), mull);
  g.emissiveNode = vec3(1.0, 0.8, 0.58).mul(mix(float(0.06), float(0.32), lit)).mul(float(1).sub(mull)).mul(glow);
  M.glass = g;
  return M;
}

// --- The atlas: the businesses' boards, the timber balconies' boards, a door ----------------------------------------------
const ATLAS_SIZE = [1024, 512];
const SIGN = [384, 64];
export const ATLAS = { boards: [768, 0, 256, 128], door: [768, 160, 96, 192] };
PROMENADE_PLATZ.shops.forEach((id, i) => { ATLAS[id] = [(i % 2) * SIGN[0], Math.floor(i / 2) * SIGN[1], SIGN[0], SIGN[1]]; });

/** The businesses lettered here (js/shops-data.js), by their OSM ids */
export const SHOPS = PROMENADE_PLATZ.shops.map((id) => SHOPS_DATA.find((s) => s.osm === id)).filter(Boolean);

function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  for (const s of SHOPS) {
    cell(s.osm, (w, h) => {
      const b = s.brand || {};
      g.fillStyle = b.background || '#33393f'; g.fillRect(0, 0, w, h);
      g.fillStyle = b.colour || '#ffffff';
      const family = b.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'Inter, "Helvetica Neue", Arial, sans-serif';
      let px = 40;
      g.font = `${b.weight || 700} ${px}px ${family}`;
      const text = b.text || s.name, tw = g.measureText(text).width;
      if (tw > w - 24) { px = Math.max(16, Math.floor((px * (w - 24)) / tw)); g.font = `${b.weight || 700} ${px}px ${family}`; }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
      // the Blue Lemon's lemon
      if (/lemon/i.test(text)) {
        g.fillStyle = '#f2d23a'; g.beginPath(); g.ellipse(w - 22, h / 2, 13, 9, -0.4, 0, Math.PI * 2); g.fill();
      }
    });
  }
  // the timber balconies: upright boards, a gap between each pair (left transparent)
  cell('boards', (w, h) => {
    const n = 14, bw = w / n;
    for (let i = 0; i < n; i++) {
      const k = ((i * 53) % 13) / 13;
      g.fillStyle = `rgb(${70 + k * 14}, ${38 + k * 7}, ${22 + k * 4})`;
      g.fillRect(i * bw + 2, 0, bw - 4, h);
    }
  });
  // a shop's glass door in a dark frame, its handle
  cell('door', (w, h) => {
    g.fillStyle = '#1c1c1c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2c3a42'; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#b9b9b9'; g.fillRect(w - 20, h * 0.45, 6, h * 0.18);
  });
  return canvasTexture(canvas);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = {
  plinth: [0.2, 0.195, 0.19], timber: [0.15, 0.075, 0.035], white: [0.58, 0.58, 0.56], slab: [0.48, 0.47, 0.45],
  louvre: [0.1, 0.1, 0.1], awning: { yellow: [0.6, 0.55, 0.42], cream: [0.42, 0.05, 0.04] }, frame: [0.1, 0.1, 0.1]
};

// The highest and the lowest ground along a wall, half a metre out of it (from s0 to s1)
function groundAlong(F, s0 = 0, s1 = F.len) {
  let hi = -Infinity, lo = Infinity;
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  for (let k = 0; k <= n; k++) {
    const g = groundHeight(...onWall(F, s0 + ((s1 - s0) * k) / n, 0.5));
    hi = Math.max(hi, g); lo = Math.min(lo, g);
  }
  return { hi, lo };
}
// The foot of the lowest storey of a part whose windows clear the ground (highest along s0–s1) by 0.15 m
function windowsFrom(p, F, s0, s1) {
  const H = HOUSES[p.house], g = groundAlong(F, s0, s1).hi;
  const lo = (y0, h) => y0 + (WIN.lo * h) / STOREY;
  if (p.attic) return p.base;
  // the storeys from the ground floor down (ground floor's height), then up
  const gf = H.shop - H.floor;
  let y = H.floor;
  while (y - gf > p.base && lo(y - gf, gf) >= g + 0.15) y -= gf;
  if (lo(y, gf) >= g + 0.15) return y;
  if (lo(H.floor, gf) >= g + 0.15) return H.floor;
  y = H.shop;
  while (lo(y, H.storey) < g + 0.15) y += H.storey;
  return y;
}

/** A quad of wall from s0 to s1 between y0 and y1 (ya1/yb1 the tops at the ends), open (windows) or closed */
function wallQuad(B, p, F, s0, s1, y0, ya, yb, open, half, mid) {
  if (Math.max(ya, yb) - y0 < 0.005 || s1 - s0 < 0.005) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const v = (y) => vOf(p, y) - (open ? 0 : CLOSED);
  const la = Math.min(y0, ya), lb = Math.min(y0, yb);
  B.quad('walls', P(s0, la), P(s1, lb), P(s1, yb), P(s0, ya), [[s0 - mid, v(la)], [s1 - mid, v(lb)], [s1 - mid, v(yb)], [s0 - mid, v(ya)]],
    { half: open ? half : 0, colour: HOUSES[p.house].skin });
}

/** A wall's stretch s0–s1 from y0 up to its top (topAt(s)), cut at the levels where its look changes */
function wallStretch(B, p, F, s0, s1, y0, topAt, { winFrom, closedUnder = -Infinity, openWall, half, mid }) {
  const H = HOUSES[p.house];
  const ta = topAt(s0), tb = topAt(s1);
  const para = Math.min(ta, tb) - H.parapet;
  const cuts = [y0, winFrom, closedUnder, H.shop, para].filter((y) => y > y0 && y < Math.max(ta, tb)).sort((a, b) => a - b);
  const levels = [y0, ...new Set(cuts)];
  for (let i = 0; i < levels.length; i++) {
    const lo = levels[i], hiA = i + 1 < levels.length ? Math.min(levels[i + 1], ta) : ta, hiB = i + 1 < levels.length ? Math.min(levels[i + 1], tb) : tb;
    if (lo >= Math.max(hiA, hiB)) continue;
    const open = openWall && lo >= winFrom - 1e-6 && lo >= closedUnder - 1e-6 && lo < para - 1e-6;
    wallQuad(B, p, F, s0, s1, lo, Math.max(hiA, lo), Math.max(hiB, lo), open, half, mid);
  }
}

// The tops of Promenade 60's attic: the hipped roof's foot at its corners
function atticTop(F) {
  const at = (q) => HIP.foot.reduce((a, f) => (Math.hypot(f[0] - q[0], f[2] - q[1]) < Math.hypot(a[0] - q[0], a[2] - q[1]) ? f : a))[1];
  const ya = at(F.a), yb = at(onWall(F, F.len));
  return (s) => ya + ((yb - ya) * s) / F.len - 0.03;
}

// Is the wall against another part (its middle a little out of it inside another's outline)?
const against = (p, F) => insideOther(...onWall(F, F.len / 2, 0.3), p);
// Is the wall against a part as high as its own (no eaves there)?
function againstTaller(p, F) {
  const [x, z] = onWall(F, F.len / 2, 0.3);
  return PARTS.some((q) => q !== p && !q.attic && q.top >= p.top - 0.35 && pointInRing(q.ring, x, z));
}

/** The walls facing the Promenade that carry a shop front (room for the glazing over the ground): [{ p, i, F }] */
export function shopFronts() {
  const out = [];
  for (const p of PARTS) {
    if (p.attic || p.shaft || p.tower) continue;
    const H = HOUSES[p.house];
    partWalls(p).forEach((F, i) => {
      if (F.len < 1.5 || !facesPromenade(F) || against(p, F)) return;
      if (groundAlong(F).hi + 0.12 > H.shop - FASCIA - 0.8) return;
      out.push({ p, i, F });
    });
  }
  return out;
}

// A part's walls: closed under the lowest windows clearing the ground and under the neighbour's roof on a party wall,
// the shops' front on the walls facing the Promenade (the wall only over it), the closed band under the roof
function buildWalls(B, p, fronts) {
  const H = HOUSES[p.house];
  partWalls(p).forEach((F, i) => {
    const topAt = p.attic ? atticTop(F) : () => p.top - 0.02;
    const front = fronts.some((f) => f.p === p && f.i === i);
    const party = p.party && F.n[0] * p.party.toward[0] + F.n[1] * p.party.toward[1] > 0.8 ? p.party.below : -Infinity;
    const openWall = !p.shaft && F.len >= 2.0 && !p.tower;
    const half = openWall ? F.len / 2 : 0, mid = F.len / 2;
    const y0 = front ? H.shop - FASCIA : p.base;
    if (front) {
      // (under the shops' glazing: the wall from the base to the glass's foot, a plinth)
      const g = groundAlong(F);
      wallStretch(B, p, F, 0, F.len, p.base, () => Math.max(p.base + 0.05, g.hi + 0.12), { winFrom: Infinity, openWall: false, half: 0, mid });
    }
    // on a slope: the bays' stretches each closed under its own lowest windows
    const g = groundAlong(F);
    const stretches = [];
    if (front || g.hi - g.lo < 1.0 || !openWall) stretches.push([0, F.len]);
    else {
      const first = mid - (Math.floor(mid / BAY - 0.5) + 0.5) * BAY;
      let s = 0;
      for (let b = first; b < F.len - 0.05; b += BAY) { if (b > s + 0.05) { stretches.push([s, b]); s = b; } }
      stretches.push([s, F.len]);
    }
    for (const [s0, s1] of stretches) {
      const winFrom = p.attic ? p.base : front ? H.shop : windowsFrom(p, F, s0, s1);
      wallStretch(B, p, F, s0, s1, y0, topAt, { winFrom, closedUnder: party, openWall, half, mid });
    }
    if (!p.attic && !front) plinth(B, F, p.base);
  });
}

// A plinth of grey render along a wall's foot, a little over the ground all along it
function plinth(B, F, base) {
  const n = Math.max(1, Math.ceil(F.len / 1.0));
  for (let k = 0; k < n; k++) {
    const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
    const ga = groundHeight(...onWall(F, a, 0.3)) + 0.3, gb = groundHeight(...onWall(F, b, 0.3)) + 0.3;
    if (Math.max(ga, gb) <= base + 0.05) continue;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('trim', P(a, base), P(b, base), P(b, Math.max(gb, base + 0.05)), P(a, Math.max(ga, base + 0.05)), undefined, { colour: C.plinth });
  }
}

// A shop front: the glazing over the plinth between piers, the fascia band over it, an awning on some houses
function shopFront(B, p, F) {
  const H = HOUSES[p.house], g = groundAlong(F);
  const glass0 = g.hi + 0.12, glass1 = H.shop - FASCIA;
  if (glass1 - glass0 > 0.8) {
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.02); return [x, y, z]; };
    B.quad('glass', P(0, glass0), P(F.len, glass0), P(F.len, glass1), P(0, glass1), [[0, 0], [F.len, 0], [F.len, glass1 - glass0], [0, glass1 - glass0]]);
    // the piers: at the ends and every ~3.6 m
    const n = Math.max(1, Math.round(F.len / 3.6));
    for (let k = 0; k <= n; k++) {
      const s = (F.len * k) / n, w = k === 0 || k === n ? 0.3 : 0.22;
      B.box('trim', F, Math.max(0, s - w), Math.min(F.len, s + w), -0.05, 0.1, p.base, glass1, H.pier);
    }
  }
  // the fascia band, the shops' boards' ground
  B.box('trim', F, -0.05, F.len + 0.05, -0.05, 0.16, glass1, H.shop, H.fascia);
  const awning = C.awning[p.house];
  if (awning && F.len > 3) {
    const P = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
    const y = glass1 - 0.05, a = 0.3, b = F.len - 0.3;
    // (its top, its underside in shade)
    B.quad('trim', P(a, 1.5, y - 0.55), P(b, 1.5, y - 0.55), P(b, 0.16, y), P(a, 0.16, y), undefined, { colour: awning });
    B.quad('trim', P(a, 0.16, y), P(b, 0.16, y), P(b, 1.5, y - 0.55), P(a, 1.5, y - 0.55), undefined, { colour: awning.map((c) => c * 0.6) });
    B.box('trim', F, a, b, 1.45, 1.55, y - 0.8, y - 0.55, awning);
  }
}

// The eaves: a band round the roof's edge standing `out` m out (mitred at the corners), its underside in the house's
// colour; none where the wall stands against a part as high
function buildEaves(B, p) {
  const H = HOUSES[p.house], W = partWalls(p), n = W.length;
  if (p.attic || p.shaft) return;
  const out = p.tower ? 0.15 : H.eave.out, h = H.eave.h;
  const ext = (A, Bf) => {
    const dot = Math.max(-1, Math.min(1, A.u[0] * Bf.u[0] + A.u[1] * Bf.u[1]));
    const t = Math.tan(Math.acos(dot) / 2), convex = Bf.u[0] * A.n[0] + Bf.u[1] * A.n[1] < 0;
    return Math.max(-3 * out, Math.min(3 * out, (convex ? 1 : -1) * out * t));
  };
  for (let i = 0; i < n; i++) {
    const F = W[i];
    if (againstTaller(p, F)) continue;
    const e0 = ext(W[(i + n - 1) % n], F), e1 = ext(F, W[(i + 1) % n]);
    const P = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
    const y1 = p.top + 0.08, y0 = p.top - h;
    // the front, the underside, the top over the overhang
    B.quad('trim', P(-e0, out, y0), P(F.len + e1, out, y0), P(F.len + e1, out, y1), P(-e0, out, y1), undefined, { colour: H.eave.under });
    B.quad('trim', P(F.len + e1, out, y0), P(-e0, out, y0), P(0, 0, y0), P(F.len, 0, y0), undefined, { colour: H.eave.under });
    B.quad('roof', P(-e0, out, y1), P(F.len + e1, out, y1), P(F.len, 0, y1), P(0, 0, y1));
  }
}

// The roofs: flat over every part but the attic, the hipped roof over Promenade 60's attic
function buildRoofs(B) {
  for (const p of PARTS) if (!p.attic) flatRoof(B, outwardRing(p.ring), p.top);
  const [f0, f1, f2, f3] = HIP.foot, [r0, r1] = HIP.ridge;
  const up = (a, b, c) => {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny > 0) B.tri('roof', a, b, c); else B.tri('roof', a, c, b);
  };
  up(f0, f1, r0); up(f2, f3, r1);
  up(f1, f2, r1); up(f1, r1, r0);
  up(f3, f0, r0); up(f3, r0, r1);
}

// A balcony on a wall from s0 to s1, `depth` out, its floor at `y`: the slab, the railing (timber boards from the atlas
// on rails, or a plastered parapet)
function balcony(B, F, y, s0, s1, depth, rail) {
  B.box('trim', F, s0, s1, 0, depth, y - 0.18, y, C.slab);
  const sides = [
    { G: F, a: s0, b: s1, o: depth },
    { G: wallFrame(onWall(F, s0, 0), onWall(F, s0, depth)), a: 0, b: depth, o: 0 },
    { G: wallFrame(onWall(F, s1, depth), onWall(F, s1, 0)), a: 0, b: depth, o: 0 }
  ];
  for (const { G, a, b, o } of sides) {
    if (rail === 'white') { B.box('trim', G, a, b, o - 0.12, o, y, y + 1.0, C.white); continue; }
    B.box('trim', G, a, b, o - 0.07, o + 0.02, y + 0.92, y + 1.0, C.timber);
    B.box('trim', G, a, b, o - 0.07, o + 0.02, y, y + 0.06, C.timber);
    B.decal(G, a + 0.02, b - 0.02, o - 0.03, y + 0.06, y + 0.92, 'boards');
  }
}

function buildBalconies(B) {
  for (const b of PROMENADE_PLATZ.balconies) {
    const p = part(b.part), H = HOUSES[p.house], F = namedWall(p, b.edge);
    if (!F) continue;
    const s0 = Math.max(0, b.s0 < 0 ? F.len + b.s0 : b.s0), s1 = Math.min(F.len, b.s1 < 0 ? F.len + b.s1 : b.s1);
    if (s1 - s0 < 1) continue;
    for (const k of b.floors) balcony(B, F, H.shop + (k - 1) * H.storey + 0.02, s0, s1, b.depth, b.rail);
  }
}

/** Where each business's board goes: { s (its shop), F (the wall), at (m along it), w (its width) } */
export function signPlaces(fronts = shopFronts()) {
  const placed = [];
  for (const s of SHOPS) {
    let best = null;
    for (const f of fronts) {
      const dx = s.x - f.F.a[0], dz = s.z - f.F.a[1];
      const t = Math.max(0, Math.min(f.F.len, dx * f.F.u[0] + dz * f.F.u[1]));
      const d = Math.hypot(s.x - onWall(f.F, t)[0], s.z - onWall(f.F, t)[1]);
      if (!best || d < best.d) best = { s, ...f, t, d };
    }
    if (best && best.d < 14) placed.push(best);
  }
  // (the boards sharing a wall side by side)
  const byWall = new Map();
  for (const q of placed) { if (!byWall.has(q.F)) byWall.set(q.F, []); byWall.get(q.F).push(q); }
  for (const [F, list] of byWall) {
    list.sort((a, b) => a.t - b.t);
    const w = Math.max(1.2, Math.min(3.4, (F.len - 0.4 * list.length) / list.length));
    for (const q of list) q.w = w;
    let prev = -Infinity;
    for (const q of list) { q.at = Math.max(q.t, w / 2 + 0.2, prev + w + 0.3); prev = q.at; }
    const over = list[list.length - 1].at + w / 2 + 0.2 - F.len;
    if (over > 0) for (const q of list) q.at -= over;
  }
  return placed;
}

// The tower's louvred band under its top, a dark band round it
function towerBand(B, p) {
  for (const F of partWalls(p)) B.box('trim', F, -0.02, F.len + 0.02, -0.02, 0.05, p.top - 1.7, p.top - 0.5, C.louvre);
}

/** The camera spots for a look at the row (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  promenade60: [-571, -0.5, -136, -556, 6.0, -172],
  yellowBlock: [-523, -1.4, -253, -552, 4.0, -236],
  creamHouse: [-470, -1.7, -284, -500, 5.0, -270],
  blueLemon: [-399, -2.5, -361, -425, 6.0, -340]
};

/** An oriented collider box along a wall a → b (thin, centred on it), from `baseY` up to `top` */
function wallCollider(a, b, baseY, top, hz = 0.22) {
  const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY, minY: baseY, maxY: top, obb: { cx, cz, hx, hz, cs, sn } };
}

/** The colliders the module brings: the walls of the parts standing on no OpenStreetMap outline of theirs */
export function rowColliders() {
  const out = [];
  for (const p of freeParts()) {
    const R = outwardRing(p.ring);
    for (let i = 0; i < R.length; i++) {
      const a = R[i], b = R[(i + 1) % R.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.3) out.push(wallCollider(a, b, p.base, p.top));
    }
  }
  return out;
}

/**
 * Builds the row into `scene`. Returns { group, colliders }: the walls of the low part before w123384637 (on no
 * outline of its own); the other walls stand on the surveyed outlines (js/landmarks.js), the balconies and awnings hang
 * over the ground.
 */
export function buildPromenadePlatz(scene) {
  const root = new THREE.Group();
  root.name = 'Promenade Platz';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Promenade Platz' }), M = materials();
  const fronts = shopFronts();
  for (const p of PARTS) {
    buildWalls(B, p, fronts);
    buildEaves(B, p);
    if (p.tower) towerBand(B, p);
  }
  for (const { p, F } of fronts) shopFront(B, p, F);
  buildRoofs(B);
  buildBalconies(B);
  for (const q of signPlaces(fronts)) {
    const H = HOUSES[q.p.house];
    B.decal(q.F, q.at - q.w / 2, q.at + q.w / 2, 0.19, H.shop - FASCIA + 0.08, H.shop - 0.08, q.s.osm);
  }
  // Pizza Heaven's door on Promenade 60's front (js/missions-data-gastro.js): a glass door in the shops' glazing
  {
    const F = namedWall(part('p60'), 'front'), [dx, dz] = PROMENADE_PLATZ.doors[0];
    const t = Math.max(0.8, Math.min(F.len - 0.8, (dx - F.a[0]) * F.u[0] + (dz - F.a[1]) * F.u[1]));
    const g = groundAlong(F, t - 0.6, t + 0.6).hi + 0.12;
    B.decal(F, t - 0.55, t + 0.55, 0.05, g, g + 2.3, 'door');
  }
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: rowColliders() };
}

export { pointInRing };
