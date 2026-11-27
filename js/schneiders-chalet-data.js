// The house before Schneider's on the Promenade (its tea-room and winter garden, today's Hugo's; OpenStreetMap
// w1529620022, unnamed; js/schneiders-chalet.js): its volumes, the floors' grid, the verandas against Schneider's
// south-west wall with the oriel at their north-west end, the tea-room's front on the Promenade, the winter garden's
// glazing and awning, the terraces on their stone walls down the slope, the two low annexes east of it. Pure data and
// frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1745/1011, batch 13, 45 × 35 m): five flat roofs, each a prism down to the ground;
// heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The Promenade passes the north-west front at
// y −3.3; the ground falls to −10.2 along the south-east and to −6.4 down the lane on the south-west. The batch is not
// one house: the low block on OSM's footprint (its roof at 2.87, 6.2 m over the Promenade), the terrace and the
// tea-room round it (−0.06), a strip 15 m long against Schneider's south-west wall up to 12.28 (Schneider's own
// batch, tile 1012 batch 21, reaches 2.5 m less far: the strip is the verandas, js/schneiders.js stops at its wall)
// and two annexes east of the block that no OSM building holds (−3.53 and −1.22). All of them are rebuilt here, the
// strip from Schneider's wall on (the part of it inside Schneider's house is js/schneiders.js').
// The look after Mapillary's street views (CC BY-SA): from the lane west of the house (2013) the glazed winter garden
// with its awning over the stone wall and the planters, the two storeys of timber verandas over it with red shutters
// and lattice rails, the oriel at the corner with its ornamented panels, the dark band with its cream zigzag under the
// eaves (the dormers over it are Schneider's roof); from the Promenade north-east of it (2015) the tea-room's dark
// timber front with "TEA-ROOM" over its glazing under a flat canopy. The south-east side (the terrace's wall towards the
// valley) and the annexes are guessed: no photo shows them.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';
import { P, uw, AXES, SCHNEIDERS, groundOutlines as schneidersOutlines } from './schneiders-data.js';

/** A point given in Schneider's roof frame (u along its ridge from the south-east, w across from the north-east) */
const Q = (u, w) => P(u, w).map((v) => Math.round(v * 100) / 100);

// The verandas' strip in Schneider's frame: along its south-west wall (w 13.3) from u0 to u1, out to `front`; the
// loggias' back wall at `back`, the oriel from `oriel` to the north-west end, its outer corners cut by `chamfer`
const V = { u0: 0.2, u1: 15.2, w0: 13.35, back: 14.4, front: 15.8, oriel: 12.6, chamfer: 0.65 };

export const CHALET = {
  // swissBUILDINGS3D's batch (its centre): left out of the streamed tiles
  exclude: [{ x: -483.6, z: -249.5, r: 3 }],
  osm: 'w1529620022',
  // the restaurant js/shops-data.js places inside (Hugo's): its generic sign left out, this house draws its own front
  shop: 'n9356746862',
  street: -3.3,
  base: -11.5, // how far down the walls reach (under the ground on the south-east)
  // The floors' grid, Schneider's: a floor's foot at `foot` + k × `storey`; a window from `lo` to `hi` m up its floor,
  // `half` m either side of its column, a bay along a wall
  foot: SCHNEIDERS.foot,
  storey: SCHNEIDERS.storey,
  win: { lo: 1.0, hi: 2.7, half: 0.55 },
  shutter: 0.5,
  bay: 2.6,
  // The volumes, each a flat roof at `top` over its outline (world x, z), its walls down to the ground. `kind`:
  // 'garden' the block whose top floor is the winter garden (glazed over the terrace), 'terrace' the terrace round it
  // (the tea-room's front where the ground is the Promenade's, stone walls down the slope), 'veranda' the strip against
  // Schneider's, 'annex' plain plastered blocks
  parts: [
    { id: 'garden', kind: 'garden', top: 2.87,
      ring: [[-484.3, -264.2], [-485.1, -265.2], [-497.7, -255.2], [-488.6, -243.7], [-489.1, -243.3], [-483.9, -236.8], [-470.8, -247.2], [-475.0, -252.4],
        [-476.1, -251.6], [-485.4, -263.3]] },
    { id: 'terrace', kind: 'terrace', top: -0.06,
      ring: [[-485.5, -264.9], [-485.6, -265.1], [-501.1, -252.8], [-504.0, -248.5], [-502.8, -246.9], [-505.9, -242.8], [-499.0, -234.2], [-494.2, -238.0],
        [-489.1, -231.6], [-470.7, -246.3], [-471.1, -246.9], [-483.9, -236.8], [-489.1, -243.3], [-488.6, -243.7], [-497.7, -255.2]] },
    { id: 'veranda', kind: 'veranda', top: 12.28, ring: [Q(V.u0, V.w0), Q(V.u1, V.w0), Q(V.u1, V.front), Q(V.u0, V.front)] },
    { id: 'annex-north', kind: 'annex', top: -3.53,
      ring: [[-471.9, -248.6], [-475.0, -252.4], [-471.1, -255.5], [-471.4, -255.9], [-468.7, -258.0], [-465.4, -253.9], [-463.7, -255.3], [-463.6, -255.2]] },
    { id: 'annex-east', kind: 'annex', top: -1.22,
      ring: [[-468.1, -258.5], [-468.7, -258.0], [-465.4, -253.9], [-461.5, -257.0], [-464.8, -261.2], [-465.4, -260.7], [-464.0, -259.0], [-466.8, -256.8]] }
  ],
  veranda: {
    ...V,
    // the loggias' floors (Schneider's first and second floors' feet), the rails' height, the posts along the front
    // (m along it from the south-east end), the deep beam under the roof with the zigzag band
    floors: [4.9, 8.9], rail: 1.0, posts: [0.15, 3.2, 6.25, 9.3, 12.3], beam: 0.6
  },
  // The terrace: its walls are the tea-room's front where the lowest ground along them lies over `cafeAbove`, stone
  // further down; the tea-room's glazing up to `head`, the fascia over it with the name, the flat canopy `canopy` m out
  terrace: { cafeAbove: -4.8, head: -0.95, canopy: 0.7, name: { w: 2.6, h: 0.5 }, door: 1.7 },
  // The winter garden over the terrace: a closed sill to `sill` m over the terrace, glass up to `head` m under the
  // roof's edge; the awning on its walls facing the lane (west), `out` m from the glazing's head, `drop` lower at its edge
  garden: { sill: 0.5, head: 0.42, awning: { out: 1.3, drop: 0.55, valance: 0.3 } }
};

const S = CHALET;
export const part = (id) => S.parts.find((p) => p.id === id);

/** The neighbours' volumes whose walls cover ours (Schneider's house to its eaves, its annex), with the parts' own */
function volumes() {
  const [house, annex] = schneidersOutlines();
  return [...S.parts.map((p) => ({ id: p.id, ring: p.ring, top: p.top })), { id: 'schneiders', ring: house, top: SCHNEIDERS.roof.eaveSW }, { id: 'schneiders-annex', ring: annex, top: SCHNEIDERS.annex.top }];
}

/**
 * How high a wall's outside is covered at (x, z): the highest other volume there (−Infinity: open), `self` left out,
 * `extra` volumes ({ ring, top }) added
 */
export function coverAt(x, z, self, extra = []) {
  let top = -Infinity;
  for (const v of [...volumes(), ...extra]) if (v.id !== self && pointInRing(v.ring, x, z)) top = Math.max(top, v.top);
  return top;
}

/**
 * A part's walls cut into stretches by what covers them (the parts, Schneider's, `extra`): [{ F, i, s0, s1, from }]
 * (from: the height the wall shows from, −Infinity on the ground), the covered ones (from ≥ the part's top) left out
 */
export function wallStretches(p, extra = []) {
  const ring = outwardRing(p.ring), out = [];
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len < 0.05) continue;
    const n = Math.max(1, Math.round(F.len / 0.5)), cov = [];
    for (let k = 0; k < n; k++) cov.push(coverAt(...onWall(F, ((k + 0.5) * F.len) / n, 0.15), p.id, extra));
    let k0 = 0;
    for (let k = 1; k <= n; k++) {
      if (k < n && cov[k] === cov[k0]) continue;
      if (cov[k0] < p.top) out.push({ F, i, s0: (k0 * F.len) / n, s1: (k * F.len) / n, from: cov[k0] });
      k0 = k;
    }
  }
  return out;
}

/** The first floor's foot whose windows clear `hi` (the windows begin there, a closed wall under it) */
export function windowsFrom(hi) {
  const k = Math.ceil((hi - S.foot - S.win.lo) / S.storey);
  return S.foot + k * S.storey;
}
/** The top of the windowed band under a roof at `top`: the foot of the floor over the last whose windows fit under it */
export function windowsTo(top) {
  const k = Math.floor((top - 0.25 - S.foot - S.win.hi) / S.storey);
  return Math.min(top, S.foot + (k + 1) * S.storey);
}

// --- The verandas ----------------------------------------------------------------------------------------------------
/** The verandas' front (w = front), its frame running so that its outside faces away from Schneider's (+w) */
export function vFrame(w = V.front, u0 = V.u0, u1 = V.u1) {
  const a = Q(u1, w), b = Q(u0, w), F = wallFrame(a, b);
  return F.n[0] * AXES.U[1] - F.n[1] * AXES.U[0] > 0 ? F : wallFrame(b, a);
}
/** m along the front frame of a point at u along Schneider's ridge */
export function sAt(F, u) {
  const [x, z] = Q(u, V.front);
  return (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1];
}
/** The loggias' stretch along the front (m), the oriel's */
export function loggia() {
  const F = vFrame(), a = sAt(F, V.u0), b = sAt(F, V.oriel), c = sAt(F, V.u1);
  return { F, s0: Math.min(a, b), s1: Math.max(a, b), oriel: [Math.min(b, c), Math.max(b, c)] };
}
/** The loggias' back block (from the first deck to the roof) and the oriel's outline (its outer corners cut) */
export const backRing = () => [Q(V.u0, V.w0), Q(V.oriel, V.w0), Q(V.oriel, V.back), Q(V.u0, V.back)];
export const orielRing = () => {
  const c = V.chamfer;
  return [Q(V.oriel, V.w0), Q(V.u1, V.w0), Q(V.u1, V.front - c), Q(V.u1 - c, V.front), Q(V.oriel + c, V.front), Q(V.oriel, V.front - c)];
};

// --- The terrace ------------------------------------------------------------------------------------------------------
/** Is a stretch of the terrace's wall the tea-room's front (the lowest ground along it over cafeAbove)? */
export const isCafe = (low) => low > S.terrace.cafeAbove;
/** The tea-room's door: its middle along a front stretch s0–s1, `door` m in from the end nearer Schneider's west corner */
export function doorAt(F, s0, s1) {
  const c = Q(V.u1, V.w0), d = (s) => { const [x, z] = onWall(F, s); return Math.hypot(x - c[0], z - c[1]); };
  return d(s0) < d(s1) ? s0 + S.terrace.door : s1 - S.terrace.door;
}

/** The outlines the walls stand on at the ground, for the player (js/landmarks.js SURVEYED_FOOTPRINTS): every part */
export const groundOutlines = () => S.parts.map((p) => p.ring);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing, uw };
