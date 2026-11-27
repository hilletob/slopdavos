// The Sport Hotel Parsenn (Promenade, 7260 Davos Dorf, by the Parsennbahn; js/sport-hotel-parsenn.js): its walls, the
// pitched roofs over them, the floors' grid, the restaurant's low front, the lettering on the gable over the Promenade.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1752/1022, batches 14, 5 and 17): the walls' outlines below are its walls at the
// ground, the roofs its sloped triangles cleaned into planes; heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js). The hotel is a block of 27.5 × 14.4 m under a saddle roof whose ridge (y 17.0) runs from the
// gable over the Promenade (north-west) to the gable towards the fire station (south-east), its eaves at 13.3 (north-
// east) and 13.6 (south-west); a cross wing on the west corner under a roof of its own, the ridge at 17.5 running
// south-west to a gable over the low front; the north-east slope runs on, flatter, over a narrow wing along the
// Promenade that ends in a point at the north (y 9.4) and over a small wing across the yard (batch 14 reaches there
// into OpenStreetMap's w1527538704, whose own batch 15 stays streamed); the restaurant's low front along the south-west
// side and round the south corner, flat-roofed at y 0.6 (batch 17). The ground lies flat round it, y −2.9 on the
// Promenade to −4.8 at the south corner. OpenStreetMap's footprint is w116881152.
// The look after Mapillary's street views (CC BY-SA): 2019 from the Promenade (the gable with "Hotel Parsenn" painted
// in script, a timber balcony, the timber terrace before it) and 2013 from the east (the gable over the fire station in
// the row): white plaster, windows in grey painted surrounds with white six-pane frames, painted grey quoins on the
// corners, a grey scroll band under the eaves and along the verges, dark timber eaves on purlin heads and rafters. The
// recorded camera of the 2019 view stands north-north-east of the hotel, where the survey has no gable: its gable is
// taken for the one over the Promenade. The courtyard sides, the wing in the yard and the restaurant's glazing are
// guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The hotel's frame: t along the ridge (from the Promenade's gable south-east), c across it (towards the north-east),
// from the ridge's end on the Promenade's gable. World x = o.x + t·u.x + c·n.x, z likewise
const U = (() => { const x = 0.8065, z = 0.5914, l = Math.hypot(x, z); return [x / l, z / l]; })();
export const FRAME = { o: [659.8, -1397.2], u: U, n: [U[1], -U[0]] };
/** World [x, z] of a point (t, c) of the hotel's frame */
export const toWorld = (t, c) => [FRAME.o[0] + FRAME.u[0] * t + FRAME.n[0] * c, FRAME.o[1] + FRAME.u[1] * t + FRAME.n[1] * c];
/** The hotel's frame [t, c] of a world point */
export const toLocal = (x, z) => { const dx = x - FRAME.o[0], dz = z - FRAME.o[1]; return [dx * FRAME.u[0] + dz * FRAME.u[1], dx * FRAME.n[0] + dz * FRAME.n[1]]; };
const W = (t, c) => toWorld(t, c).map((v) => Math.round(v * 100) / 100);

export const PARSENN = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles (batch 15, OpenStreetMap's w1527538704
  // north-east of the yard, stays)
  exclude: [{ x: 669.3, z: -1394.2, r: 3 }, { x: 659.2, z: -1389.0, r: 3 }, { x: 672.3, z: -1376.2, r: 3 }],
  osm: 'w116881152',
  base: -5.4, // how far down the walls reach (under the lowest ground, −4.9)
  // The floors: the ground floor's top at 0.8 (the restaurant's roof just under it), four floors of 3.1 m over it to
  // `line` (13.2), just under the eaves; the attic in the gables
  storey: 3.1,
  ground: 0.8,
  line: 13.2,
  // The walls at the ground (world x, z): the hotel with the cross wing and the narrow wing along the Promenade (its
  // point at the north), the restaurant's low front, the wing across the yard
  hotel: [
    [654.2, -1389.3], // the west corner, on the Promenade
    [663.6, -1382.6], // the cross wing's gable over the restaurant (south-west), its step
    [663.0, -1381.8],
    [664.1, -1381.0],
    [665.9, -1383.4], // (over the restaurant's roof from here to the south corner)
    [677.5, -1374.9], // the south corner
    [686.0, -1386.5], // the east corner: the gable towards the fire station between
    W(5.3, 6.85), // the north-east eave wall on the yard
    [670.69, -1403.1], // the narrow wing's side on the yard, to its point
    [671.0, -1413.0] // the point at the north: the long wall on the Promenade from here back to the west corner
  ],
  // the restaurant: one tall floor before the south-west side and round the south corner, a terrace on its roof
  restaurant: {
    top: 0.6,
    ring: [[664.1, -1381.0], [678.5, -1370.4], [679.5, -1370.2], [680.4, -1370.5], [681.0, -1371.0], [682.2, -1372.7], [682.0, -1373.3], [678.3, -1376.0],
      [677.5, -1374.9], [665.9, -1383.4]],
    // its walls on the hotel's (no wall of its own there)
    inner: [[[678.3, -1376.0], [677.5, -1374.9]], [[677.5, -1374.9], [665.9, -1383.4]], [[665.9, -1383.4], [664.1, -1381.0]]],
    glass: { from: 0.7, below: 1.0 }, // the glazing from 0.7 m over its foot to 1 m under the roof
    rail: 1.0
  },
  // the hotel's walls standing on the restaurant's roof (the part under it is the restaurant's): from y 0.5 up
  overRestaurant: [[[664.1, -1381.0], [665.9, -1383.4]], [[665.9, -1383.4], [677.5, -1374.9]]],
  // the small wing across the yard (t 11.5–15.3, c 10.8–19.4), under the north-east slope run on
  yardWing: [W(11.5, 10.8), W(15.3, 10.8), W(15.3, 19.4), W(11.5, 19.4)],
  // The roofs: planes over outlines in the hotel's frame ([t, c]; the overhangs included), y = y0 + dt·(t − t0) +
  // dc·(c − c0). The visible roof is the highest one over a point; where two meet the lower runs on under the higher
  roofs: [
    // the saddle roof: its south-west slope to the eaves at 13.6, its north-east slope to 13.3
    { id: 'south-west', poly: [[-1.0, 0], [28.46, 0], [28.46, -8.52], [-1.0, -8.52]], at: [0, 0, 17.0], dt: 0, dc: 0.452 },
    { id: 'north-east', poly: [[5.3, 0], [28.4, 0], [28.4, 7.85], [5.3, 7.85]], at: [0, 0, 17.0], dt: 0, dc: -0.54 },
    // ... run on flatter over the narrow wing on the Promenade, to its point
    { id: 'narrow-wing', poly: [[-1.0, 0], [5.3, 0], [5.3, 6.85], [6.3, 6.85], [6.3, 11.6], [0.6, 20.0], [-1.0, 20.6]], at: [0, 0, 17.0], dt: 0, dc: -0.415 },
    // the cross wing's saddle roof, its ridge (17.5) across the hotel's, 1.9 m out over its gable
    { id: 'cross-north-west', poly: [[-1.34, -11.5], [6.18, -11.5], [6.18, -0.67], [-1.34, -0.67]], at: [6.18, 0, 17.5], dt: 0.465, dc: 0 },
    { id: 'cross-south-east', poly: [[6.18, -11.5], [14.04, -11.5], [14.04, -0.67], [6.18, -0.67]], at: [6.18, 0, 17.5], dt: -0.465, dc: 0 },
    // the wing across the yard, under the north-east slope's plane
    { id: 'yard-wing', poly: [[10.9, 10.2], [17.2, 10.2], [17.2, 20.2], [10.9, 20.2]], at: [0, 0, 17.0], dt: 0, dc: -0.415 }
  ],
  // The gable over the Promenade (a → b as wallFrame wants it: from the narrow wing's point to the west corner): the
  // lettering under the ridge's end, the upper floors kept free of windows there; the entrance in the cross wing's part
  front: {
    a: [671.0, -1413.0], b: [654.2, -1389.3],
    name: { w: 6.4, y0: 7.55, y1: 9.95 }, clear: 3.4, // (the lettering's middle under the ridge; the stretch ± clear)
    door: { s: 25.6, w: 1.9, h: 2.7, clear: 1.6 } // (s m along from a; the ground floor kept free ± clear)
  },
  // The balconies on the gable towards the fire station (its middle): dark timber, at these floors' feet
  balconies: { a: [677.5, -1374.9], b: [686.0, -1386.5], w: 3.8, out: 1.25, floors: [3.9, 7.0], rail: 1.05 },
  // A window: m up from its floor's foot, its half width; its painted surround
  win: { lo: 0.9, hi: 2.3, half: 0.58, surround: 0.14 },
  bay: 3.4,
  // the scroll band under the eaves and along the verges: its height, how far under the roof's edge it ends
  band: { h: 0.45, under: 0.25 },
  overhang: 1.0
};

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (either way round) one of the walls listed ([[a, b], …])? */
export const isListed = (list, a, b) => list.some(([p, q]) => (near(p, a) && near(q, b)) || (near(p, b) && near(q, a)));

/** The plane of a roof at (t, c) */
export const planeY = (r, t, c) => r.at[2] + r.dt * (t - r.at[0]) + r.dc * (c - r.at[1]);
/** The roof over a world point: { y, roof } (the highest one), or null */
export function roofAt(x, z) {
  const [t, c] = toLocal(x, z);
  let best = null;
  for (const r of PARSENN.roofs) {
    if (!pointInRing(r.poly, t, c)) continue;
    const y = planeY(r, t, c);
    if (!best || y > best.y) best = { y, roof: r };
  }
  return best;
}
/** The roof's height over a world point (−Infinity where none) */
export const roofY = (x, z) => roofAt(x, z)?.y ?? -Infinity;

/** The outlines the walls stand on at the ground (the player's walls, js/landmarks.js SURVEYED_FOOTPRINTS) */
export const groundOutlines = () => [PARSENN.hotel, PARSENN.restaurant.ring, PARSENN.yardWing];

/** Is the world point inside one of the outlines? */
export const inside = (x, z) => groundOutlines().some((r) => pointInRing(r, x, z));

/** The front's frame and where the ridge's end stands on it (s m along from a) */
export function frontApex() {
  const F = wallFrame(PARSENN.front.a, PARSENN.front.b);
  // (the ridge's end: c = 0 on the front)
  const [, ca] = toLocal(...F.a), [, cb] = toLocal(...PARSENN.front.b);
  return { F, s: (ca / (ca - cb)) * F.len };
}

/**
 * The stretches of a wall a → b kept free of windows ([from, to] m along it): `upper` for the floors over the ground
 * floor (the lettering's on the front), `ground` for the ground floor (the entrance's)
 */
export function clearStretches(a, b) {
  const Fr = PARSENN.front, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out = { upper: [], ground: [] };
  const flip = near(a, Fr.b) && near(b, Fr.a);
  if (!(near(a, Fr.a) && near(b, Fr.b)) && !flip) return out;
  const { s } = frontApex(), D = Fr.door;
  const map = ([p, q]) => (flip ? [len - q, len - p] : [p, q]);
  out.upper.push(map([s - Fr.clear, s + Fr.clear]));
  out.ground.push(map([D.s - D.clear, D.s + D.clear]));
  return out;
}

/** A wall cut into its stretches: [{ from, to, windows }] (the clear ones without windows) */
export function cutStretches(len, clear, windows = true) {
  if (!windows) return [{ from: 0, to: len, windows: false }];
  const out = [];
  let at = 0;
  for (const [c0, c1] of [...clear].sort((p, q) => p[0] - q[0])) {
    const from = Math.max(at, Math.min(len, c0)), to = Math.max(from, Math.min(len, c1));
    if (from - at > 0.01) out.push({ from: at, to: from, windows: true });
    if (to - from > 0.01) out.push({ from, to, windows: false });
    at = to;
  }
  if (len - at > 0.01) out.push({ from: at, to: len, windows: true });
  return out;
}

/**
 * The highest floor line whose windows still fit under a wall's top at `top` (their heads under the scroll band), at
 * most the top floor's; the ground floor's top if none
 */
export function windowLine(top) {
  const { storey, ground, line, win, band } = PARSENN;
  let L = ground;
  for (let y = ground + storey; y <= line + 0.01; y += storey) if (y - storey + win.hi <= top - band.h - band.under - 0.05) L = y;
  return Math.round(L * 100) / 100;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
