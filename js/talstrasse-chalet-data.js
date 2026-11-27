// The timber chalet on the Talstrasse by the car park (7260 Davos Dorf, the Feuerwehrdepot north of it;
// js/talstrasse-chalet.js): its walls, the saddle roof over them, the low wing on its south corner, the floors' grid, the balconies.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1752/1021, batches 16 and 5): the walls below are its walls at the ground, the
// roof its sloped triangles cleaned into two planes; heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js). The house is a block of 10.7 × 9.8 m whose ridge (y 7.2) runs from the gable over the car park
// (south-west) to the gable towards the fire station (north-east), the eaves at y 4.1 about 1.5 m out on the north-west
// and south-east sides, the verges 1.5 m out over the gables. The wing, flat-roofed at y 1.92, wraps the house's south
// corner: along the south-east side for 6.5 m and 5.9 m out from it, its front on the car park 1.4 m before the gable.
// The ground falls from y −4.3 at the house's east corner to −6.35 along the gable on the car park. OpenStreetMap's
// footprint is w117012255 (up to 1.1 m off the surveyed walls: it follows the roof's edge). The survey's batches 4, 0
// and 21 (a low flat-roofed shed east of the wing, y 0.13, and slabs on the ground south of it) stand outside the
// footprint and stay streamed.
// The look after Mapillary's street views (CC BY-SA): 2013 from the car park south-west of it (506473807386958; the
// AVIA garage house w117012205 on its left, as the bearings say): the south-west gable, the ground floor in white
// plaster, the floors over it in dark brown logs, a balcony under the gable, deep eaves on dark rafters, the wing on
// the right in the same timber with a balcony along its front under its flat roof; 2025 the same gable at the right edge
// of the dashcam views from the Talstrasse (1246938857183467, 3195349350631307): white six-pane windows, the balcony,
// a chimney on the south-east slope. The red box with "MIGROS" in the 2025 views stands left of it, in front of the
// cream Sport Hotel Parsenn: not this house. The north-west, north-east and south-east sides and the doors are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The house's frame: t along the ridge (from the gable on the car park north-east), c across it (towards the south-
// east), from the house's west corner. World x = o.x + t·u.x + c·n.x, z likewise
const U = (() => { const x = 7.9, z = -10.1, l = Math.hypot(x, z); return [x / l, z / l]; })();
export const FRAME = { o: [669.6, -1329.9], u: U, n: [-U[1], U[0]] };
/** World [x, z] of a point (t, c) of the house's frame */
export const toWorld = (t, c) => [FRAME.o[0] + FRAME.u[0] * t + FRAME.n[0] * c, FRAME.o[1] + FRAME.u[1] * t + FRAME.n[1] * c];
/** The house's frame [t, c] of a world point */
export const toLocal = (x, z) => { const dx = x - FRAME.o[0], dz = z - FRAME.o[1]; return [dx * FRAME.u[0] + dz * FRAME.u[1], dx * FRAME.n[0] + dz * FRAME.n[1]]; };
const W = (t, c) => toWorld(t, c).map((v) => Math.round(v * 100) / 100);

// the house's length along the ridge and its width across it
const LEN = 9.76, WID = 10.68;

export const TALSTRASSE_CHALET = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles (the house, the wing)
  exclude: [{ x: 676.8, z: -1330.5, r: 3 }, { x: 680.7, z: -1323.5, r: 3 }],
  osm: 'w117012255',
  base: -6.8, // how far down the walls reach (under the lowest ground, −6.35)
  len: LEN,
  wid: WID,
  // The house's walls at the ground (world x, z): the gable on the car park from the west corner, the south-east side,
  // the gable towards the fire station, the north-west side
  house: [W(0, 0), W(0, WID), W(LEN, WID), W(LEN, 0)],
  // The wing: its front on the car park, its south-east side, its side towards the fire station, back along the
  // house's south-east side to its south corner, along the house's gable to the front's west end
  wing: {
    top: 1.92,
    ring: [W(-1.37, 7.5), W(-1.37, 16.6), W(6.4, 16.6), W(6.45, WID), W(0, WID), W(0, 7.5)],
    // its balcony along the front on the car park: its floor (y), how far out, from s0 to s1 m along the front
    balcony: { y: -3.5, depth: 1.1, s0: 0.4, s1: 8.7 }
  },
  // The roof: its two planes from the eaves (c, y) to the ridge (c, y), from gable to gable (t)
  roof: { t0: -1.5, t1: 11.28, west: [-1.5, 4.1], ridge: [5.0, 7.2], east: [12.14, 4.1] },
  // The floors: the ground floor in white plaster from `floor`, the floors over it in logs (`timber` on), storeys of
  // `storey`; walls closed over `attic` (the gables' apexes)
  floor: -6.3,
  storey: 2.8,
  timber: -3.5,
  attic: 4.9,
  // a window (m over its storey's foot) and its half width; the bays along a wall from its middle
  win: { lo: 0.85, hi: 2.15, half: 0.55 },
  bay: 2.4,
  // The balconies on the gables (wall 'south' the car park's, 'north' the fire station's): their floor (y), how far out,
  // from s0 to s1 m along the gable from its left end seen from outside
  balconies: [
    { wall: 'south', y: -0.7, depth: 1.2, s0: 0.5, s1: 7.0 },
    { wall: 'south', y: 2.1, depth: 1.2, s0: 0.5, s1: 10.2 },
    { wall: 'north', y: 2.1, depth: 1.0, s0: 1.5, s1: 9.2 }
  ],
  railing: 1.0, // the railings' height
  // the house door on the car park's gable (s m along it from its left end, seen from outside), the wing's on its
  // south-east side (guessed both)
  doors: [{ wall: 'south', s: 1.2, w: 1.0 }, { wall: 'wingEast', s: 2.68, w: 0.95 }],
  // the chimney on the south-east slope (t, c of its middle), its half side and its top
  chimney: { t: 7.2, c: 7.6, half: 0.4, top: 7.9 }
};

/** The roof's height at a point c across the house's frame (its upper face) */
export function roofY(c) {
  const R = TALSTRASSE_CHALET.roof, [cw, yw] = R.west, [cr, yr] = R.ridge, [ce, ye] = R.east;
  return c <= cr ? yw + ((c - cw) * (yr - yw)) / (cr - cw) : yr - ((c - cr) * (yr - ye)) / (ce - cr);
}
/** The roof's outline (world x, z) */
export function roofRing() {
  const R = TALSTRASSE_CHALET.roof;
  return [[R.t0, R.west[0]], [R.t0, R.east[0]], [R.t1, R.east[0]], [R.t1, R.west[0]]].map(([t, c]) => toWorld(t, c));
}

/** The house's wall with its outward side towards `side` ('south' the car park's gable, 'east', 'north', 'west') */
export function houseWall(side) {
  const R = outwardRing(TALSTRASSE_CHALET.house);
  const want = { south: [-FRAME.u[0], -FRAME.u[1]], north: FRAME.u, east: FRAME.n, west: [-FRAME.n[0], -FRAME.n[1]] }[side];
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.n[0] * want[0] + F.n[1] * want[1] > 0.95) return F;
  }
  return null;
}
/** The wing's longest outer wall facing `side` (as houseWall), not one against the house */
export function wingWall(side) {
  const R = outwardRing(TALSTRASSE_CHALET.wing.ring);
  const want = { south: [-FRAME.u[0], -FRAME.u[1]], north: FRAME.u, east: FRAME.n, west: [-FRAME.n[0], -FRAME.n[1]] }[side];
  let best = null;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (pointInRing(TALSTRASSE_CHALET.house, ...onWall(F, F.len / 2, 0.3))) continue;
    if (F.n[0] * want[0] + F.n[1] * want[1] > 0.95 && (!best || F.len > best.len)) best = F;
  }
  return best;
}
/** A wall by the name the data use: a side of the house, or 'wingSouth', 'wingEast', 'wingNorth' */
export const namedWall = (name) => (name.startsWith('wing') ? wingWall(name.slice(4).toLowerCase()) : houseWall(name));

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the house and the wing */
export const groundOutlines = () => [TALSTRASSE_CHALET.house, TALSTRASSE_CHALET.wing.ring];

/** Is a point inside the house or its wing? */
export const insideHouse = (x, z) => groundOutlines().some((r) => pointInRing(r, x, z));

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
