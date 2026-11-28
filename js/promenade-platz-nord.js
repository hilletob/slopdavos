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
  HOUSES, PARTS, PROMENADE_PLATZ_NORD, against, facesPromenade, groundOutlines, namedWall, onWall, outwardRing, part, partWalls, pointInRing,
  wallFrame
} from './promenade-platz-nord-data.js';

export { PROMENADE_PLATZ_NORD, PARTS, HOUSES };

// The houses along the Promenade in Davos Platz from the Ettinger pavilion north to the Pauluskirche rebuilt by hand
// (js/promenade-platz-nord-data.js), standing in for their swissBUILDINGS3D volumes, which the streamed tiles drew as
// white blocks with the town houses' windows.
// The look after Mapillary's street views (2013–2015, CC BY-SA; the camera's place and heading checked against the
// outlines for each, several showing the house next door):
// - Casty Wohnen's house: white, the shop's glazing on its east front over the forecourt with CASTY WOHNEN over the
//   door, a row of windows with grey blinds over it, the glazed south wing (805772083656182, from the east); the low
//   part north of it white over a grey plinth (the same photograph, its right side);
// - the tall white house across the Promenade: six floors of plain windows, the red-brown eaves, the stack of balconies
//   at the west end of its south front (279702390484074, 134622475254761 from the south-east), the shops under a dark
//   canopy on the Promenade (3752787094775343, Holzbernhard's in 2015); its low neighbour to the east is guessed;
// - the old Raiffeisen's house: olive-khaki plaster, white window surrounds, a light string course and frieze, the dark
//   red-brown canopy round the bank's ground floor, the deep dark eaves (3752787094775343, 4103854139645516,
//   513027166393824; the bank has moved since: no lettering);
// - Peak Performance's blue house: four floors of blue plaster with white corners over the shops, the glazed shop with
//   its white roof on the corner (568478124115526, 783562438967617); the back wings are guessed;
// - the Bistro Gentiana's house: pale yellow-green, the dark timber shop front on its corner, the white cornice
//   (2859297337667789, 371435637539724);
// - the ochre house: five floors over the shops, the dark band of ornament under the deep dark eaves (2859297337667789,
//   from the north), the stacks of balconies on its south end over the shop row (318741136282355, 1867608443408316,
//   from the south); the low shop row with its awnings (the same);
// - the house of the Galerie am Postplatz: white with pale pink lozenges painted all over, the blue band of Christoffel
//   Ferienwohnungen round its corner on the square, the dark eaves, two small balconies (511467986687678); its wings
//   behind are guessed;
// - Ella's bar: the low dark red pavilion with its glazing and the grey band under the roof (202000774867111,
//   164257425505961);
// - the Kaffeeklatsch's house: white with anthracite boarding up its corners, the dark band over the shops and the
//   glazed corner (164257425505961, 2966716220319402); its low wings glazed on the Promenade;
// - the Coiffure's house: taupe plaster, the red-brown eaves (371752554145468); the pale yellow house up the slope behind
//   it (the same photograph); the house north of it (w1529981154, hidden behind the trees there) is guessed;
// - the Aldi: guessed (the photographs from the north-east show the Post's hall before it and the ochre house beside).
// Guessed besides: the back fronts up the slope, the Morosani Fiftyone and its podium behind the shop row (pale ochre
// like the house before it, timber balconies), the colours of the back wings.
// Windows are drawn by the walls' material from their uv (metres along the wall from its middle, the floors' grid up
// it, each house's floors stretched to it); the shops' glazing on the walls facing the Promenade, their fascia and the
// businesses' boards (js/shops-data.js, lettered here: the generic boards would stand on OpenStreetMap's outlines,
// off these walls). Five meshes: the walls, the roofs, the trim (one vertex-coloured mesh), the shops' glass and the
// decals (one canvas atlas).

excludeBuildings(PROMENADE_PLATZ_NORD.exclude);
// (the player's walls on the surveyed walls at the ground, not on OSM's outlines: js/landmarks.js)
for (const [osm, rings] of groundOutlines()) SURVEYED_FOOTPRINTS.set(osm, rings);
for (const id of PROMENADE_PLATZ_NORD.shops) SHOP_EXCLUSIONS.add(id);

const { storey: STOREY, win: WIN, bay: BAY } = PROMENADE_PLATZ_NORD;
// v of a wall: the floors' grid in grid metres, a house's ground floor's foot at 40 storeys; closed walls carry v − CLOSED
const UP = 40 * STOREY;
const CLOSED = 300 * STOREY;
const FASCIA = 0.7; // the shops' band under the first floor
// The painted lozenges: the walls' colour carries +PATTERN in red (the desktop's material decodes it; the phone's plain
// skin gets the plain colour)
const PATTERN = 2;

/** v of height y on a part's walls: the ground floor (and those under it) stretched to one grid storey, the floors over it */
export function vOf(p, y) {
  const H = HOUSES[p.house];
  if (y < H.shop) return UP + ((y - H.floor) * STOREY) / (H.shop - H.floor);
  return UP + STOREY + ((y - H.shop) * STOREY) / H.storey;
}
const parapetOf = (p) => p.parapet ?? HOUSES[p.house].parapet;

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const ROOF = [0.17, 0.165, 0.16];
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
  // The plaster in each house's colour (its vertices), weathered, the lozenges where the colour carries them; a window
  // per bay: a white frame, a post in its middle and a transom, a sill under it, a curtain drawn in some
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const { half, v, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
  const raw = attribute('color', 'vec3');
  const pat = step(PATTERN - 0.5, raw.x);
  const skin = vec3(raw.x.sub(pat.mul(PATTERN)), raw.y, raw.z);
  const U = uv().x;
  const lozenge = fract(floor(U.div(0.9).add(v.div(1.2))).add(floor(U.div(0.9).sub(v.div(1.2)))).mul(0.5)).mul(2);
  const plaster = mix(skin, vec3(0.6, 0.4, 0.37), lozenge.mul(pat).mul(0.75)).mul(mix(float(0.93), float(1.05), worldNoise(0.35)));
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
  m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 67, { share: 0.3, late: 0.1, tone: twoTones([1.0, 0.82, 0.6], [0.9, 0.92, 1.0], 0.75) })
    .mul(pane).mul(mix(float(1), float(0.55), curtain)).mul(glow.mul(1.1));
  M.walls = m;
  // The shops' glass: uv metres along the glazing and up from its foot; a mullion every 1.8 m, a transom, a faint glow
  // from the shop behind at night, some displays lit
  const g = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.45 });
  const V = uv().y;
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
PROMENADE_PLATZ_NORD.shops.forEach((id, i) => { ATLAS[id] = [(i % 2) * SIGN[0], Math.floor(i / 2) * SIGN[1], SIGN[0], SIGN[1]]; });

/** The businesses lettered here (js/shops-data.js), by their OSM ids */
export const SHOPS = PROMENADE_PLATZ_NORD.shops.map((id) => SHOPS_DATA.find((s) => s.osm === id)).filter(Boolean);

function atlasTexture() {
  const { canvas, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  for (const s of SHOPS) {
    cell(s.osm, (w, h) => {
      const b = s.brand || {};
      g.fillStyle = b.background || '#33393f'; g.fillRect(0, 0, w, h);
      if (b.border) { g.strokeStyle = b.border; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }
      g.fillStyle = b.colour || '#ffffff';
      const family = b.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'Inter, "Helvetica Neue", Arial, sans-serif';
      let px = 40;
      g.font = `${b.weight || 700} ${px}px ${family}`;
      const text = b.text || s.name, tw = g.measureText(text).width;
      if (tw > w - 24) { px = Math.max(16, Math.floor((px * (w - 24)) / tw)); g.font = `${b.weight || 700} ${px}px ${family}`; }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
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
  // a glass door in a dark frame, its handle
  cell('door', (w, h) => {
    g.fillStyle = '#1c1c1c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2c3a42'; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#b9b9b9'; g.fillRect(w - 20, h * 0.45, 6, h * 0.18);
  });
  return canvasTexture(canvas);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = { plinth: [0.2, 0.195, 0.19], timber: [0.15, 0.075, 0.035], white: [0.58, 0.58, 0.56], slab: [0.48, 0.47, 0.45], frame: [0.1, 0.1, 0.1] };

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

// The walls' colour of a part: its house's skin, flagged for the lozenges on the desktop
function skinOf(p) {
  const H = HOUSES[p.house];
  return H.pattern && !QUALITY.simpleMaterials ? [H.skin[0] + PATTERN, H.skin[1], H.skin[2]] : H.skin;
}

/** A quad of wall from s0 to s1 between y0 and ya/yb (the tops at the ends), open (windows) or closed */
function wallQuad(B, p, F, s0, s1, y0, ya, yb, open, half, mid) {
  if (Math.max(ya, yb) - y0 < 0.005 || s1 - s0 < 0.005) return;
  const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
  const v = (y) => vOf(p, y) - (open ? 0 : CLOSED);
  const la = Math.min(y0, ya), lb = Math.min(y0, yb);
  B.quad('walls', P(s0, la), P(s1, lb), P(s1, yb), P(s0, ya), [[s0 - mid, v(la)], [s1 - mid, v(lb)], [s1 - mid, v(yb)], [s0 - mid, v(ya)]],
    { half: open ? half : 0, colour: skinOf(p) });
}

/** A wall's stretch s0–s1 from y0 up to the part's top, cut at the levels where its look changes */
function wallStretch(B, p, F, s0, s1, y0, top, { winFrom, openWall, half, mid }) {
  const H = HOUSES[p.house];
  const para = top - parapetOf(p);
  const cuts = [winFrom, H.shop, para].filter((y) => y > y0 && y < top).sort((a, b) => a - b);
  const levels = [y0, ...new Set(cuts)];
  for (let i = 0; i < levels.length; i++) {
    const lo = levels[i], hi = i + 1 < levels.length ? levels[i + 1] : top;
    if (lo >= hi) continue;
    const open = openWall && lo >= winFrom - 1e-6 && lo < para - 1e-6;
    wallQuad(B, p, F, s0, s1, lo, hi, hi, open, half, mid);
  }
}

// Is the wall against a part as high as its own (no eaves there)?
function againstTaller(p, F) {
  const [x, z] = onWall(F, F.len / 2, 0.3);
  return PARTS.some((q) => q !== p && q.top >= p.top - 0.35 && pointInRing(q.ring, x, z));
}

/** The walls that carry a shop front (room for the glazing over the ground): [{ p, i, F }] */
export function shopFronts() {
  const out = [];
  for (const p of PARTS) {
    if (p.over) continue;
    const H = HOUSES[p.house];
    if (!H.shops) continue;
    partWalls(p).forEach((F, i) => {
      if (F.len < 2.5 || against(p, F)) return;
      const chosen = p.fronts ? p.fronts.includes(i) : H.allFronts || facesPromenade(F, H.near);
      if (!chosen) return;
      if (groundAlong(F).hi + 0.12 > H.shop - FASCIA - 0.8) return;
      out.push({ p, i, F });
    });
  }
  return out;
}

// A part's walls: closed under the lowest windows clearing the ground, the shops' front on its shop fronts (the wall
// only over it), the closed band under the roof; a housing on a roof closed all round
function buildWalls(B, p, fronts) {
  const H = HOUSES[p.house];
  partWalls(p).forEach((F, i) => {
    const front = fronts.some((f) => f.p === p && f.i === i);
    const openWall = !p.over && !H.closed && F.len >= 2.0;
    const half = openWall ? F.len / 2 : 0, mid = F.len / 2;
    const y0 = front ? H.shop - FASCIA : p.base;
    const g = groundAlong(F);
    if (front) {
      // (under the shops' glazing: the wall from the base to the glass's foot, a plinth)
      wallStretch(B, p, F, 0, F.len, p.base, Math.max(p.base + 0.05, g.hi + 0.12), { winFrom: Infinity, openWall: false, half: 0, mid });
    }
    // on a slope: the bays' stretches each closed under its own lowest windows
    const stretches = [];
    if (front || p.over || g.hi - g.lo < 1.0 || !openWall) stretches.push([0, F.len]);
    else {
      const first = mid - (Math.floor(mid / BAY - 0.5) + 0.5) * BAY;
      let s = 0;
      for (let b = first; b < F.len - 0.05; b += BAY) { if (b > s + 0.05) { stretches.push([s, b]); s = b; } }
      stretches.push([s, F.len]);
    }
    for (const [s0, s1] of stretches) {
      const winFrom = p.over ? p.base : front ? H.shop : windowsFrom(p, F, s0, s1);
      wallStretch(B, p, F, s0, s1, y0, p.top - 0.02, { winFrom, openWall, half, mid });
    }
    if (!p.over && !front) plinth(B, F, p.base);
  });
}

// A plinth of grey render along a wall's foot, a little over the ground all along it
function plinth(B, F, base) {
  const n = Math.max(1, Math.ceil(F.len / 2.5));
  for (let k = 0; k < n; k++) {
    const a = (F.len * k) / n, b = (F.len * (k + 1)) / n;
    const ga = groundHeight(...onWall(F, a, 0.3)) + 0.3, gb = groundHeight(...onWall(F, b, 0.3)) + 0.3;
    if (Math.max(ga, gb) <= base + 0.05) continue;
    const P = (s, y) => { const [x, z] = onWall(F, s, 0.03); return [x, y, z]; };
    B.quad('trim', P(a, base), P(b, base), P(b, Math.max(gb, base + 0.05)), P(a, Math.max(ga, base + 0.05)), undefined, { colour: C.plinth });
  }
}

// A shop front: the glazing over the plinth between piers, the fascia band over it (a canopy standing out on some
// houses), an awning on others
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
  // the fascia band, the shops' boards' ground: flat on the wall, or a canopy over the pavement
  if (H.canopy) B.box('trim', F, -0.3, F.len + 0.3, -0.05, 1.4, glass1, H.shop, H.fascia);
  else B.box('trim', F, -0.05, F.len + 0.05, -0.05, 0.16, glass1, H.shop, H.fascia);
  if (H.awning && F.len > 3) {
    const P = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
    const y = glass1 - 0.05, a = 0.3, b = F.len - 0.3, aw = H.awning;
    // (its top, its underside in shade)
    B.quad('trim', P(a, 1.5, y - 0.55), P(b, 1.5, y - 0.55), P(b, 0.16, y), P(a, 0.16, y), undefined, { colour: aw });
    B.quad('trim', P(a, 0.16, y), P(b, 0.16, y), P(b, 1.5, y - 0.55), P(a, 1.5, y - 0.55), undefined, { colour: aw.map((c) => c * 0.6) });
    B.box('trim', F, a, b, 1.45, 1.55, y - 0.8, y - 0.55, aw);
  }
}

// The eaves: a band round the roof's edge standing `out` m out (mitred at the corners), its underside in the house's
// colour, a frieze under it on some houses; none where the wall stands against a part as high
function buildEaves(B, p) {
  const H = HOUSES[p.house], W = partWalls(p), n = W.length;
  const out = p.over ? 0.15 : H.eave.out, h = H.eave.h;
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
    if (H.frieze && !p.over && F.len > 1.5) B.box('trim', F, 0, F.len, -0.02, 0.05, y0 - 0.55, y0 - 0.05, H.frieze);
  }
}

// The string courses, and the bands up the corners (Peak Performance's white corners, the Kaffeeklatsch's boarding)
function buildBands(B, p) {
  const H = HOUSES[p.house];
  if (p.over || (!H.bands && !H.corners)) return;
  for (const F of partWalls(p)) {
    if (F.len < 1.5 || against(p, F)) continue;
    for (const y of H.bands || []) if (y < p.top - 0.5) B.box('trim', F, -0.04, F.len + 0.04, -0.02, 0.07, y - 0.18, y + 0.18, C.white);
    if (H.corners) {
      const w = Math.min(H.cornerWidth, F.len / 3), y0 = Math.max(p.base, groundAlong(F).lo - 0.3), y1 = p.top - H.eave.h;
      B.box('trim', F, -0.03, w, -0.03, 0.05, y0, y1, H.corners);
      B.box('trim', F, F.len - w, F.len + 0.03, -0.03, 0.05, y0, y1, H.corners);
    }
  }
}

// The roofs: flat over every part
function buildRoofs(B) {
  for (const p of PARTS) flatRoof(B, outwardRing(p.ring), p.top);
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

/** The balconies' places: { b, p, F, s0, s1, ys } (ys their floors' heights) */
export function balconyPlaces() {
  const out = [];
  for (const b of PROMENADE_PLATZ_NORD.balconies) {
    const p = part(b.part), H = HOUSES[p.house], F = namedWall(p, b.edge);
    if (!F) continue;
    const s0 = Math.max(0, b.s0 < 0 ? F.len + b.s0 : b.s0), s1 = Math.min(F.len, b.s1 < 0 ? F.len + b.s1 : b.s1);
    if (s1 - s0 < 1) continue;
    out.push({ b, p, F, s0, s1, ys: b.floors.map((k) => H.shop + (k - 1) * H.storey + 0.02) });
  }
  return out;
}

/** Where each business's board goes: { s (its shop), F (the wall), at (m along it), w (its width), y0, y1 } */
export function signPlaces(fronts = shopFronts()) {
  const placed = [];
  // (walls besides the shop fronts, for a business on none: a board over the door)
  const others = [];
  for (const p of PARTS) {
    if (p.over) continue;
    for (const F of partWalls(p)) if (F.len >= 3 && !against(p, F)) others.push({ p, F });
  }
  for (const s of SHOPS) {
    const [sx, sz] = PROMENADE_PLATZ_NORD.signAt[s.osm] || [s.x, s.z];
    const nearest = (list) => {
      let best = null;
      for (const f of list) {
        const t = Math.max(0, Math.min(f.F.len, (sx - f.F.a[0]) * f.F.u[0] + (sz - f.F.a[1]) * f.F.u[1]));
        const d = Math.hypot(sx - onWall(f.F, t)[0], sz - onWall(f.F, t)[1]);
        if (!best || d < best.d) best = { s, ...f, t, d };
      }
      return best;
    };
    let q = nearest(fronts);
    if (q && q.d < 14) q.front = true;
    else q = nearest(others);
    if (q && q.d < 14) placed.push(q);
  }
  // (the boards sharing a wall side by side)
  const byWall = new Map();
  for (const q of placed) { if (!byWall.has(q.F)) byWall.set(q.F, []); byWall.get(q.F).push(q); }
  for (const [F, list] of byWall) {
    list.sort((a, b) => a.t - b.t);
    const w = Math.max(1.2, Math.min(3.4, (F.len - 0.4 * list.length) / list.length));
    for (const q of list) q.w = w;
    // (from the left each at its business or after the one before, then from the right back within the wall)
    let prev = -Infinity;
    for (const q of list) { q.at = Math.max(q.t, w / 2 + 0.2, prev + w + 0.3); prev = q.at; }
    let next = Infinity;
    for (const q of [...list].reverse()) { q.at = Math.min(q.at, F.len - w / 2 - 0.2, next - w - 0.3); next = q.at; }
    for (const q of list) {
      const H = HOUSES[q.p.house];
      if (q.front) { q.y0 = H.shop - FASCIA + 0.08; q.y1 = H.shop - 0.08; } else {
        q.y0 = groundAlong(F, q.at - w / 2, q.at + w / 2).hi + 2.9; q.y1 = q.y0 + Math.min(0.75, w / 6);
      }
    }
  }
  return placed;
}

/** The camera spots for a look at the row (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  casty: [-614, 0.3, 4, -640, 4.0, 2],
  raiffeisen: [-618, 0.3, 6, -636, 6.0, 36],
  ochre: [-630, 0.7, 76, -642, 8.0, 105],
  galerie: [-650, 1.5, 288, -680, 8.0, 288],
  kaffeeklatsch: [-678, 1.0, 306, -705, 5.0, 325]
};

/**
 * Builds the row into `scene`. Returns { group, colliders }: none of its own: every wall stands on the surveyed
 * outlines (js/landmarks.js), the balconies, canopies and awnings hang over the ground.
 */
export function buildPromenadePlatzNord(scene) {
  const root = new THREE.Group();
  root.name = 'Promenade Platz Nord';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'walls', name: 'Promenade Platz Nord' }), M = materials();
  const fronts = shopFronts();
  for (const p of PARTS) {
    buildWalls(B, p, fronts);
    buildEaves(B, p);
    buildBands(B, p);
  }
  for (const { p, F } of fronts) shopFront(B, p, F);
  buildRoofs(B);
  for (const { b, F, s0, s1, ys } of balconyPlaces()) for (const y of ys) balcony(B, F, y, s0, s1, b.depth, b.rail);
  for (const q of signPlaces(fronts)) B.decal(q.F, q.at - q.w / 2, q.at + q.w / 2, q.front ? (HOUSES[q.p.house].canopy ? 1.43 : 0.19) : 0.05, q.y0, q.y1, q.s.osm);
  // the Kaffeeklatsch's door (js/missions-data-bars.js): a glass door on the house's front
  for (const [dx, dz] of PROMENADE_PLATZ_NORD.doors) {
    let best = null;
    for (const p of PARTS) {
      if (p.over) continue;
      for (const F of partWalls(p)) {
        const t = Math.max(0.6, Math.min(F.len - 0.6, (dx - F.a[0]) * F.u[0] + (dz - F.a[1]) * F.u[1]));
        const d = Math.hypot(dx - onWall(F, t)[0], dz - onWall(F, t)[1]);
        if (F.len > 1.4 && (!best || d < best.d)) best = { F, t, d };
      }
    }
    const g = groundAlong(best.F, best.t - 0.6, best.t + 0.6).hi + 0.05;
    B.decal(best.F, best.t - 0.55, best.t + 0.55, 0.05, g, g + 2.3, 'door');
  }
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  return { group: root, colliders: [] };
}

export { pointInRing };
