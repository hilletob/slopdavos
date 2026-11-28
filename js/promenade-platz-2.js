import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { SURVEYED_FOOTPRINTS } from './landmarks.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { SHOP_EXCLUSIONS } from './shops.js';
import { SHOPS_DATA } from './shops-data.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import {
  HOUSES, KIND, PARTS, PROMENADE_PLATZ_2, facesPromenade, freeParts, groundOutlines, hipCorners, insideOther, namedWall, onWall,
  outwardRing, part, partWalls, pointInRing, wallFrame
} from './promenade-platz-2-data.js';

export { PROMENADE_PLATZ_2, PARTS, HOUSES };

// Two stretches of houses on the Promenade in Davos Platz rebuilt by hand (js/promenade-platz-2-data.js), standing in
// for their swissBUILDINGS3D volumes, which the streamed tiles drew as white blocks with the town houses' windows.
// The look after Mapillary's street views (CC BY-SA; the camera's place and heading checked against the outlines for
// each, several showing the house next door; the views of January 2026 are of the World Economic Forum, the houses
// dressed in banners and glass pavilions, read for the shapes only):
// - the grey house by the Kongresszentrum (w117012139): green-grey plaster, green window frames, the hipped roof on
//   deep brown eaves, its east wing lighter with small iron balconies and a flat roof on a green edge (762574531070902
//   of 2015 from the east, 1230695521753666 of 2026 from the south-east; 880558941341119 and 1403311738182401 show
//   the Infosys pavilion and the English Church, not it);
// - der Frisör's pavilion before it: a one-storey shop front in dark brown timber with the tall board "der FRISÖR" on
//   its east end (762574531070902; in 2026 a glass pavilion stands on it, 739566478846533);
// - the cream house (w117012319): cream plaster, brown-framed windows, the stacks of timber balconies on its end
//   towards the Kongresszentrum, the deep dark eaves (762574531070902, 739566478846533; in 2026 its balconies wrapped in
//   black banners, 825848887152037);
// - the white house (w116881261): white, beige roller blinds, the four brown garage doors on the lane under it, the
//   balconies with green-grey screens over them, the low hipped roof on brown eaves (565821314389212, 2864876863754817,
//   508967833616684, all 2015 from the lane south of it; filed under the grey house and the cream house too);
// - the grey block (w116881242): dark grey panels, ribbon windows behind louvres, a flat roof on a white edge (the left
//   edge of the same photographs; its own 502264860901811 and 210815683847784 show the retaining walls up the street);
// - the Haus Trauffer (w123382365): salmon plaster, the shop floor in dark green-grey with Schuler Bücher's glazing,
//   two floors of windows, a flat roof on a thin dark eave (296587421865407, 2611514099153587 from the north), its
//   neighbour (w123382393) in sand-coloured plaster (1187120151742413), their backs over the slope with the timber
//   balconies (2794918157438716, 147016017376828 from the south-east);
// - the Meng shop's house (w219449799): storey-high glazing in grey frames under a dark roof band, Augenoptik
//   Schneider's board (829718621227814 from the north);
// - 47 Grad's house (w1529620021): white, four floors of plain windows over the shops, a flat roof (829718621227814,
//   1372398356476991 from the north-east).
// Guessed: the ARGO Laden's house (behind the hoardings of 2015 in every photograph: a low white shop house), Mountain's
// Akt (a low cream house before 47 Grad's: only its roof shows over the street), the low strip north of 47 Grad's, the
// backs up and down the slopes, the grey house's back, the colours of the low parts.
// Windows are drawn by the walls' material from their uv (metres along the wall from its middle, the floors' grid up
// it, each house's floors stretched to it, its kind of windows in v's offset); the shops' glazing on the walls facing
// the Promenade, their fascia and the businesses' boards (js/shops-data.js, lettered here). Five meshes: the walls,
// the roofs, the trim (one vertex-coloured mesh), the shops' glass and the decals (one canvas atlas).

excludeBuildings(PROMENADE_PLATZ_2.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js)
for (const [osm, rings] of groundOutlines()) SURVEYED_FOOTPRINTS.set(osm, rings);
for (const id of PROMENADE_PLATZ_2.shops) SHOP_EXCLUSIONS.add(id);

const { storey: STOREY, win: WIN, bay: BAY } = PROMENADE_PLATZ_2;
// v of a wall: the floors' grid in grid metres, a house's ground floor's foot at 40 storeys, its kind of windows
// KOFF m up per kind; closed walls carry v − CLOSED
const UP = 40 * STOREY;
const KOFF = 100 * STOREY;
const CLOSED = 600 * STOREY;
const FASCIA = 0.7; // the shops' band under the first floor

/** v of height y on a part's walls: the ground floor (and those under it) stretched to one grid storey, the floors over it */
export function vOf(p, y) {
  const H = HOUSES[p.house], k = KOFF * H.kind;
  if (y < H.shop) return k + UP + ((y - H.floor) * STOREY) / (H.shop - H.floor);
  return k + UP + STOREY + ((y - H.shop) * STOREY) / H.storey;
}

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.16, 0.14, 0.125];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof(ROOF, 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: each house's plaster from its vertices, a window per bay and floor lit at night,
    // js/landmark-buildings.js SIMPLE_SKINS)
    M.walls = SIMPLE_SKINS.windowed([1, 1, 1], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.88, 0.3, { bay: BAY, half: WIN.half });
    M.walls.vertexColors = true;
    M.glass = SIMPLE_SKINS.glow([0.05, 0.06, 0.07], 0.12, 0.5, [1.0, 0.8, 0.58], 0.25);
    return M;
  }
  const fine = fade(8, 28), near = fade(40, 160), glow = nightGlow();
  // The plaster in each house's colour (its vertices), weathered; the windows by kind: white, green or brown frames
  // (a post in the middle, a transom; curtains, or roller blinds in the brown), dark ribbons behind louvres, storey-high
  // glass between grey mullions
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const { half, v, bay, bu, storey, fv, open } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
  const kind = floor(v.div(KOFF));
  const is = (k) => step(abs(kind.sub(k)), 0.5);
  const ribbon = is(KIND.ribbon), glassy = is(KIND.glass), punched = float(1).sub(ribbon).sub(glassy);
  const rect = (hw, lo, hi, e = 0.012) => smoothstep(hw.add(e), hw.sub(e), abs(bu)).mul(smoothstep(lo.sub(e), lo.add(e), fv)).mul(smoothstep(hi.add(e), hi.sub(e), fv));
  const hw = mix(mix(float(WIN.half), float(BAY / 2 - 0.04), ribbon), float(BAY / 2 - 0.05), glassy);
  const lo = mix(float(WIN.lo), float(0.12), glassy), hi = mix(mix(float(WIN.hi), float(2.2), ribbon), float(2.9), glassy);
  const skin = attribute('color', 'vec3');
  const plaster = skin.mul(mix(float(0.93), float(1.05), worldNoise(0.35)));
  const win = rect(hw, lo, hi).mul(open);
  const tr = WIN.lo + (WIN.hi - WIN.lo) * 0.7;
  const bars = smoothstep(0.035, 0.02, abs(bu)).max(smoothstep(0.03, 0.018, abs(fv.sub(tr)))).mul(punched);
  // (the ribbons' louvres: slats every 0.12 m; the glass' transom over the door height)
  const slats = smoothstep(0.3, 0.5, abs(fract(fv.div(0.12)).sub(0.5)).mul(2)).mul(ribbon).mul(fine);
  const gbar = smoothstep(0.04, 0.02, abs(fv.sub(2.3))).mul(glassy);
  const pane = rect(hw.sub(0.07), lo.add(0.07), hi.sub(0.07)).mul(float(1).sub(bars.add(gbar).min(1).mul(fine))).mul(open);
  const sill = rect(float(WIN.half + 0.08), float(WIN.lo - 0.09), float(WIN.lo)).mul(open).mul(near).mul(punched);
  const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
  const drawn = step(0.55, id).mul(mix(float(0.25), float(0.65), step(0.85, id)));
  const span = WIN.hi - WIN.lo - 0.14;
  const blind = step(float(WIN.hi - 0.07).sub(drawn.mul(span)), fv).mul(pane).mul(near).mul(punched);
  const brown = is(KIND.brown);
  const frame = mix(mix(mix(vec3(0.56, 0.56, 0.54), vec3(0.05, 0.15, 0.08), is(KIND.green)), vec3(0.17, 0.09, 0.045), brown),
    vec3(0.25, 0.26, 0.27), ribbon.add(glassy));
  const glassC = mix(vec3(0.02, 0.024, 0.028), vec3(0.06, 0.075, 0.09), worldNoise(0.07));
  let c = mix(plaster, vec3(0.3, 0.29, 0.27), sill);
  c = mix(c, frame, win);
  c = mix(c, glassC, pane);
  c = mix(c, vec3(0.13, 0.13, 0.135), slats.mul(pane));
  // (curtains in the white and green frames, beige roller blinds in the brown)
  c = mix(c, mix(vec3(0.55, 0.52, 0.46), vec3(0.42, 0.34, 0.2), brown), blind);
  m.colorNode = c;
  const shiny = pane.mul(float(1).sub(blind)).mul(float(1).sub(slats));
  m.roughnessNode = mix(float(0.9), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (flats and offices: a window lit here and there in the evening, fewer towards midnight)
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 67, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.55), blind.add(slats).min(1))).mul(glow.mul(1.1));
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

// --- The atlas: the businesses' boards, der Frisör's, the timber balconies' boards, the garage doors -------------------
const ATLAS_SIZE = [1024, 512];
const SIGN = [384, 64];
export const ATLAS = { boards: [768, 0, 256, 128], garage: [768, 144, 128, 128], frisor: [912, 144, 80, 368] };
PROMENADE_PLATZ_2.shops.forEach((id, i) => { ATLAS[id] = [(i % 2) * SIGN[0], Math.floor(i / 2) * SIGN[1], SIGN[0], SIGN[1]]; });

/** The businesses lettered here (js/shops-data.js), by their OSM ids */
export const SHOPS = PROMENADE_PLATZ_2.shops.map((id) => SHOPS_DATA.find((s) => s.osm === id)).filter(Boolean);

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
      const text = (b.text || s.name).replace('`', '’');
      const tw = g.measureText(text).width;
      if (tw > w - 24) { px = Math.max(16, Math.floor((px * (w - 24)) / tw)); g.font = `${b.weight || 700} ${px}px ${family}`; }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
  }
  // der Frisör's tall board: white, the red diamond, the name upright
  cell('frisor', (w, h) => {
    g.fillStyle = '#ecebe6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b3262a';
    g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2 + 26, 40); g.lineTo(w / 2, 70); g.lineTo(w / 2 - 26, 40); g.closePath(); g.fill();
    g.save(); g.translate(w / 2 + 10, h - 14); g.rotate(-Math.PI / 2);
    g.fillStyle = '#2b2b2b'; g.font = '700 38px Inter, "Helvetica Neue", Arial, sans-serif'; g.textBaseline = 'middle';
    g.fillText('FRISÖR', 0, 0);
    g.font = '400 18px Inter, "Helvetica Neue", Arial, sans-serif'; g.fillText('der', 0, -30);
    g.restore();
  });
  // the timber balconies: upright boards, a gap between each pair (left transparent)
  cell('boards', (w, h) => {
    const n = 14, bw = w / n;
    for (let i = 0; i < n; i++) {
      const k = ((i * 53) % 13) / 13;
      g.fillStyle = `rgb(${70 + k * 14}, ${38 + k * 7}, ${22 + k * 4})`;
      g.fillRect(i * bw + 2, 0, bw - 4, h);
    }
  });
  // a garage door: brown boards in a frame, its handle
  cell('garage', (w, h) => {
    g.fillStyle = '#3a2516'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      const k = ((i * 37) % 11) / 11;
      g.fillStyle = `rgb(${88 + k * 16}, ${55 + k * 9}, ${32 + k * 5})`;
      g.fillRect(6 + i * ((w - 12) / 12) + 1, 6, (w - 12) / 12 - 2, h - 8);
    }
    g.fillStyle = '#c8c8c8'; g.fillRect(w / 2 - 8, h * 0.78, 16, 5);
  });
  return canvasTexture(canvas);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = {
  plinth: [0.2, 0.195, 0.19], timber: [0.15, 0.075, 0.035], white: [0.58, 0.58, 0.56], slab: [0.48, 0.47, 0.45],
  screen: [0.17, 0.2, 0.17], iron: [0.05, 0.05, 0.05], garageBand: [0.4, 0.38, 0.32]
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

/** A quad of wall from s0 to s1 between y0 and its tops ya, yb at the ends, open (windows) or closed */
function wallQuad(B, p, F, s0, s1, y0, ya, yb, open, half, mid) {
  if (Math.max(ya, yb) - y0 < 0.005 || s1 - s0 < 0.005) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const v = (y) => vOf(p, y) - (open ? 0 : CLOSED);
  const la = Math.min(y0, ya), lb = Math.min(y0, yb);
  B.quad('walls', P(s0, la), P(s1, lb), P(s1, yb), P(s0, ya), [[s0 - mid, v(la)], [s1 - mid, v(lb)], [s1 - mid, v(yb)], [s0 - mid, v(ya)]],
    { half: open ? half : 0, colour: HOUSES[p.house].skin });
}

/** A wall's stretch s0–s1 from y0 up to its top, cut at the levels where its look changes */
function wallStretch(B, p, F, s0, s1, y0, top, { winFrom, closedUnder = -Infinity, openWall, half, mid }) {
  const H = HOUSES[p.house];
  const para = top - H.parapet;
  const cuts = [winFrom, closedUnder, H.shop, para].filter((y) => y > y0 && y < top).sort((a, b) => a - b);
  const levels = [y0, ...new Set(cuts)];
  for (let i = 0; i < levels.length; i++) {
    const lo = levels[i], hi = i + 1 < levels.length ? levels[i + 1] : top;
    if (lo >= hi) continue;
    const open = openWall && lo >= winFrom - 1e-6 && lo >= closedUnder - 1e-6 && lo < para - 1e-6;
    wallQuad(B, p, F, s0, s1, lo, hi, hi, open, half, mid);
  }
}

// Is the wall against another part (its middle a little out of it inside another's outline)?
const against = (p, F) => insideOther(...onWall(F, F.len / 2, 0.3), p);
// Is the wall against a part as high as its own (no eaves there)?
function againstTaller(p, F) {
  const [x, z] = onWall(F, F.len / 2, 0.3);
  return PARTS.some((q) => q !== p && q.top >= p.top - 0.35 && pointInRing(q.ring, x, z));
}

/** The walls facing the Promenade that carry a shop front (room for the glazing over the ground): [{ p, i, F }] */
export function shopFronts() {
  const out = [];
  for (const p of PARTS) {
    const H = HOUSES[p.house];
    if (H.shops === false) continue;
    partWalls(p).forEach((F, i) => {
      if (F.len < 1.5 || !facesPromenade(F) || against(p, F)) return;
      if (groundAlong(F).hi + 0.12 > H.shop - FASCIA - 0.8) return;
      out.push({ p, i, F });
    });
  }
  return out;
}

// A part's walls: closed under the lowest windows clearing the ground, the shops' front on the walls facing the
// Promenade (the wall only over it), the closed band under the roof; the low parts closed all over
function buildWalls(B, p, fronts) {
  const H = HOUSES[p.house];
  partWalls(p).forEach((F, i) => {
    const top = p.top - 0.02;
    const front = fronts.some((f) => f.p === p && f.i === i);
    const openWall = !p.low && F.len >= 2.0;
    const half = openWall ? F.len / 2 : 0, mid = F.len / 2;
    const closedUnder = p.closedUnder && p.closedUnder.edge === i ? p.closedUnder.y : -Infinity;
    const y0 = front ? H.shop - FASCIA : p.base;
    const g = groundAlong(F);
    if (front) {
      // (under the shops' glazing: the wall from the base to the glass's foot, a plinth)
      wallStretch(B, p, F, 0, F.len, p.base, Math.max(p.base + 0.05, g.hi + 0.12), { winFrom: Infinity, openWall: false, half: 0, mid });
    }
    // on a slope: the bays' stretches each closed under its own lowest windows
    const stretches = [];
    if (front || g.hi - g.lo < 1.0 || !openWall) stretches.push([0, F.len]);
    else {
      const first = mid - (Math.floor(mid / BAY - 0.5) + 0.5) * BAY;
      let s = 0;
      for (let b = first; b < F.len - 0.05; b += BAY) { if (b > s + 0.05) { stretches.push([s, b]); s = b; } }
      stretches.push([s, F.len]);
    }
    for (const [s0, s1] of stretches) {
      const winFrom = front ? H.shop : windowsFrom(p, F, s0, s1);
      wallStretch(B, p, F, s0, s1, y0, top, { winFrom, closedUnder, openWall, half, mid });
    }
    if (!front) plinth(B, F, p.base);
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

// A shop front: the glazing over the plinth between piers, the fascia band over it
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
}

// The eaves of a flat roof: a band round the roof's edge standing `out` m out (mitred at the corners), its underside in
// the house's colour; none where the wall stands against a part as high
function buildEaves(B, p) {
  const H = HOUSES[p.house], W = partWalls(p), n = W.length;
  const out = p.low ? Math.min(0.2, H.eave.out) : H.eave.out, h = p.low ? 0.3 : H.eave.h;
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

// A hipped roof over a quadrilateral part: its four slopes from the foot out of the walls to the ridge, the brown
// soffit under the overhang, the fascia round its foot
function hipRoof(B, p) {
  const H = HOUSES[p.house], out = H.eave.out;
  const { foot: [f0, f1, f2, f3], ridge: [r0, r1] } = hipCorners(p, out);
  const up = (a, b, c) => {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny > 0) B.tri('roof', a, b, c); else B.tri('roof', a, c, b);
  };
  up(f0, f1, r0); up(f2, f3, r1);
  up(f1, f2, r1); up(f1, r1, r0);
  up(f3, f0, r0); up(f3, r0, r1);
  // the soffit: from each wall's top out to the foot (facing down), the fascia (a band 0.25 m down from the foot)
  const R = outwardRing(p.ring), foot = [f0, f1, f2, f3];
  for (let i = 0; i < 4; i++) {
    const a = R[i], b = R[(i + 1) % 4];
    // (the foot corners nearest to the wall's ends)
    const near = (q) => foot.reduce((m, f) => (Math.hypot(f[0] - q[0], f[2] - q[1]) < Math.hypot(m[0] - q[0], m[2] - q[1]) ? f : m));
    const fa = near(a), fb = near(b), y = p.top - 0.02;
    B.quad('trim', [b[0], y, b[1]], [a[0], y, a[1]], [fa[0], fa[1], fa[2]], [fb[0], fb[1], fb[2]], undefined, { colour: H.eave.under });
    B.quad('trim', [fa[0], fa[1] - 0.25, fa[2]], [fb[0], fb[1] - 0.25, fb[2]], [fb[0], fb[1] + 0.02, fb[2]], [fa[0], fa[1] + 0.02, fa[2]], undefined, { colour: H.eave.under });
  }
}

// The roofs: flat over every part but the hipped ones, the hipped roofs
function buildRoofs(B) {
  for (const p of PARTS) {
    if (p.hip) hipRoof(B, p);
    else flatRoof(B, outwardRing(p.ring), p.top);
  }
}

// A balcony on a wall from s0 to s1, `depth` out, its floor at `y`: the slab, the railing (timber boards from the atlas
// on rails, a plastered parapet, green-grey screens, iron bars)
function balcony(B, F, y, s0, s1, depth, rail) {
  B.box('trim', F, s0, s1, 0, depth, y - 0.18, y, C.slab);
  const sides = [
    { G: F, a: s0, b: s1, o: depth },
    { G: wallFrame(onWall(F, s0, 0), onWall(F, s0, depth)), a: 0, b: depth, o: 0 },
    { G: wallFrame(onWall(F, s1, depth), onWall(F, s1, 0)), a: 0, b: depth, o: 0 }
  ];
  for (const { G, a, b, o } of sides) {
    if (rail === 'white') { B.box('trim', G, a, b, o - 0.12, o, y, y + 1.0, C.white); continue; }
    if (rail === 'screen') {
      B.box('trim', G, a, b, o - 0.05, o, y + 0.08, y + 0.9, C.screen);
      B.box('trim', G, a, b, o - 0.06, o + 0.01, y + 0.9, y + 0.98, C.white);
      continue;
    }
    if (rail === 'iron') {
      B.box('trim', G, a, b, o - 0.04, o, y + 0.92, y + 0.98, C.iron);
      B.box('trim', G, a, b, o - 0.03, o, y + 0.12, y + 0.92, C.iron.map((c) => c + 0.02));
      continue;
    }
    B.box('trim', G, a, b, o - 0.07, o + 0.02, y + 0.92, y + 1.0, C.timber);
    B.box('trim', G, a, b, o - 0.07, o + 0.02, y, y + 0.06, C.timber);
    B.decal(G, a + 0.02, b - 0.02, o - 0.03, y + 0.06, y + 0.92, 'boards');
  }
}

/** The balconies' places: [{ b (the entry), p, F, s0, s1 }] */
export function balconyPlaces() {
  const out = [];
  for (const b of PROMENADE_PLATZ_2.balconies) {
    const p = part(b.part), F = namedWall(p, b.edge);
    if (!F) continue;
    const s0 = Math.max(0, b.s0 < 0 ? F.len + b.s0 : b.s0), s1 = Math.min(F.len, b.s1 < 0 ? F.len + b.s1 : b.s1);
    if (s1 - s0 >= 1) out.push({ b, p, F, s0, s1 });
  }
  return out;
}

function buildBalconies(B) {
  for (const { b, F, s0, s1 } of balconyPlaces()) for (const y of b.ys) balcony(B, F, y, s0, s1, b.depth, b.rail);
}

// The white house's garages: the garage storey's band in beige-grey, a brown door per garage
function buildGarages(B) {
  const G = PROMENADE_PLATZ_2.garages, p = part(G.part), F = partWalls(p)[G.edge];
  for (let k = 0; k < G.n; k++) {
    const s0 = G.s0 + k * G.w, s1 = s0 + G.w - 0.35;
    B.decal(F, s0, s1, 0.05, G.y0, G.y0 + 2.3, 'garage');
  }
  const P = (s, y) => { const [x, z] = onWall(F, s, 0.025); return [x, y, z]; };
  B.quad('trim', P(0, p.base), P(F.len, p.base), P(F.len, G.y1), P(0, G.y1), undefined, { colour: C.garageBand });
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

/** The camera spots for a look at the rows (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  kongress: [-86, -6.1, -612, -128, 2.0, -624],
  garages: [-138, -13.7, -568, -124, -6.0, -594],
  trauffer: [-378, -2.7, -378, -400, 1.0, -350],
  grad: [-526, -1.5, -258, -540, 3.0, -228]
};

/** An oriented collider box along a wall a → b (thin, centred on it), from `baseY` up to `top` */
function wallCollider(a, b, baseY, top, hz = 0.22) {
  const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY, minY: baseY, maxY: top, obb: { cx, cz, hx, hz, cs, sn } };
}

/** The colliders the module brings: the walls of the parts standing on no OpenStreetMap outline (der Frisör's) */
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
 * Builds the rows into `scene`. Returns { group, colliders }: the walls of der Frisör's pavilion (on no outline of its
 * own); the other walls stand on the surveyed outlines (js/landmarks.js), the balconies and eaves hang over the ground.
 */
export function buildPromenadePlatz2(scene) {
  const root = new THREE.Group();
  root.name = 'Promenade Platz 2';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Promenade Platz 2' }), M = materials();
  const fronts = shopFronts();
  for (const p of PARTS) {
    buildWalls(B, p, fronts);
    if (!p.hip) buildEaves(B, p);
  }
  for (const { p, F } of fronts) shopFront(B, p, F);
  buildRoofs(B);
  buildBalconies(B);
  buildGarages(B);
  for (const q of signPlaces(fronts)) {
    const H = HOUSES[q.p.house];
    B.decal(q.F, q.at - q.w / 2, q.at + q.w / 2, 0.19, H.shop - FASCIA + 0.08, H.shop - 0.08, q.s.osm);
  }
  // der Frisör's tall board on the pavilion's east end
  {
    const f = PROMENADE_PLATZ_2.frisor, p = part(f.part), F = partWalls(p)[f.edge], H = HOUSES[p.house];
    const g = groundAlong(F).hi;
    B.decal(F, f.s - 0.42, f.s + 0.42, 0.06, g + 0.5, Math.min(p.top - 0.4, H.shop + 0.4), 'frisor');
  }
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: rowColliders() };
}

export { pointInRing };
