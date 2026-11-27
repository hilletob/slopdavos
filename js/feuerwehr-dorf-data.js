// The Feuerwehrdepot Dorf, Davos Dorf's fire station between the Sport Hotel Parsenn and the Pischa kiosk's car park
// (js/feuerwehr-dorf.js): the hall under its shallow saddle roof, the flat-roofed annex on its west side, the engines'
// doors on the forecourt, the floors' grid, the lettering. Pure data and frame maths, shared by the browser module and
// the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1752/1022, batches 10 and 1): the walls below are its walls at the ground, the
// roof its sloped triangles cleaned into two planes; heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js). The hall is a block of 12.5 × 12.6 m whose ridge (y 6.6) runs from the gable on the forecourt
// (south-south-west) to the gable towards the Pischa kiosk (north-north-east); its eaves reach about a metre out on
// every side, at y 4.0 over the annex (west-north-west) and 4.3 over the car park (east-south-east). The annex, flat-
// roofed at y 1.86, stands against the hall's west-north-west wall and reaches 4.7 m further towards the forecourt;
// its west corner meets the Parsenn restaurant's east tip (js/sport-hotel-parsenn-data.js), cut back here to touch it.
// The ground falls from y −3.6 at the hall's east corner to −4.8 at the annex's west corner. OpenStreetMap's footprint
// is w1387458859 (up to 1.1 m off the surveyed walls).
// The look after Mapillary's street views (CC BY-SA): 2013 from the service road east of the Pischa kiosk (167900218562917
// and 1253320315129384, their cameras some way off: the hall is the low house before the Parsenn's cream gable): the
// east-south-east side and the north-north-east gable in pale warm plaster, a window with dark timber frames under the
// eave, the shallow roof on deep dark timber eaves, the gable's apex in dark boards. 2025 dashcam views from the car
// park south of it (643920544997761 and the others; their GPS puts some of them on the Parsenn's site north-west of
// it, which cannot be): a flat-roofed block in pale green-grey plaster with two domed roof lights and a wide door of
// brown timber boards under a dark fascia, taken for the annex's forecourt side. The forecourt side of the hall (the
// engines' doors, brown timber as the annex's, and the lettering) and the west-north-west sides are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The hall's frame: t along the ridge (from the forecourt's gable north-north-east), c across it (towards the east-
// south-east), from the hall's corner at the forecourt and the annex. World x = o.x + t·u.x + c·n.x, z likewise
const U = (() => { const x = 0.573, z = -0.8195, l = Math.hypot(x, z); return [x / l, z / l]; })();
export const FRAME = { o: [693.6, -1370.2], u: U, n: [-U[1], U[0]] };
/** World [x, z] of a point (t, c) of the hall's frame */
export const toWorld = (t, c) => [FRAME.o[0] + FRAME.u[0] * t + FRAME.n[0] * c, FRAME.o[1] + FRAME.u[1] * t + FRAME.n[1] * c];
/** The hall's frame [t, c] of a world point */
export const toLocal = (x, z) => { const dx = x - FRAME.o[0], dz = z - FRAME.o[1]; return [dx * FRAME.u[0] + dz * FRAME.u[1], dx * FRAME.n[0] + dz * FRAME.n[1]]; };

export const FEUERWEHR_DORF = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [{ x: 702.1, z: -1371.9, r: 3 }, { x: 689.8, z: -1375.0, r: 3 }],
  osm: 'w1387458859',
  base: -5.3, // how far down the walls reach (under the lowest ground, −4.8)
  // The hall's walls at the ground (world x, z): the forecourt's gable from the annex's corner, the side on the car
  // park, the gable towards the kiosk, the side over the annex
  hall: [[693.6, -1370.2], [703.7, -1363.2], [710.8, -1373.4], [700.5, -1380.6]],
  // The annex's walls: against the hall's from its north corner to the forecourt, its forecourt side, the corner cut
  // back to the Parsenn restaurant's tip, the side towards the Parsenn, the side towards the shed (w1527538701)
  annex: {
    top: 1.86,
    ring: [[698.15, -1377.15], [693.6, -1370.2], [693.8, -1370.1], [691.1, -1366.2], [682.1, -1372.45], [682.3, -1372.7], [682.1, -1373.3], [681.85, -1373.5],
      [689.0, -1383.72]],
    fascia: 0.55, // the dark board over the door, its height under the roof's edge
    // the domed roof lights (t, c in the hall's frame; their base's side)
    domes: [[3.5, -6.0], [8.5, -6.5]], dome: 1.3
  },
  // The roof: its two planes from the eaves (c, y) to the ridge (c, y), from gable to gable (t)
  roof: { t0: -0.95, t1: 13.48, west: [-1.37, 4.0], ridge: [6.03, 6.6], east: [13.27, 4.3] },
  // The floors: the hall's floor a step over the forecourt; its tall ground floor (the engines' bays) to `upper`, the
  // floor over it from `upper` to `line`, the attic in the gables over it
  floor: -4.1,
  upper: 0.5,
  storey: 3.0,
  line: 3.5,
  // a window of the upper floor (m over its foot) and its half width; the bays along a wall from its middle
  win: { lo: 0.9, hi: 2.3, half: 0.6 },
  bay: 2.5,
  gable: 4.6, // the gables' boards from here up to the roof
  // The engines' doors on the forecourt's gable (s m along it from its west end: their middles), their width and top;
  // the lettering between their tops and the upper floor's windows
  doors: { at: [3.15, 9.15], w: 3.8, top: -0.2 },
  name: { w: 6.4, y0: 0.2, y1: 0.9 },
  // the annex's door on its forecourt side (s m from its east end), as wide as the photographs show it
  annexDoor: { s0: 0.6, s1: 4.9, top: -0.4 },
  // the small windows and doors of the ground floor, as trim (s m along the wall from its left end, seen from outside;
  // the wall named by its outward side)
  openings: {
    east: [{ s: 2.0, w: 1.1, door: true }, { s: 5.0, w: 1.3 }, { s: 7.6, w: 1.3 }, { s: 10.2, w: 1.3 }],
    north: [{ s: 3.6, w: 1.3 }, { s: 8.8, w: 1.3 }, { s: 11.2, w: 1.0, door: true }],
    annexWest: [{ s: 4.0, w: 1.6, hi: true }, { s: 9.4, w: 1.6, hi: true }],
    annexEast: [{ s: 2.3, w: 1.0, door: true }]
  }
};

/** The roof's height at a point c across the hall's frame (its upper face) */
export function roofY(c) {
  const R = FEUERWEHR_DORF.roof, [cw, yw] = R.west, [cr, yr] = R.ridge, [ce, ye] = R.east;
  return c <= cr ? yw + ((c - cw) * (yr - yw)) / (cr - cw) : yr - ((c - cr) * (yr - ye)) / (ce - cr);
}
/** The roof's outline (world x, z) */
export function roofRing() {
  const R = FEUERWEHR_DORF.roof;
  return [[R.t0, R.west[0]], [R.t0, R.east[0]], [R.t1, R.east[0]], [R.t1, R.west[0]]].map(([t, c]) => toWorld(t, c));
}

/** The hall's wall with its outward side towards `side` ('south' the forecourt's gable, 'east', 'north', 'west') */
export function hallWall(side) {
  const R = outwardRing(FEUERWEHR_DORF.hall);
  const want = { south: [-FRAME.u[0], -FRAME.u[1]], north: FRAME.u, east: FRAME.n, west: [-FRAME.n[0], -FRAME.n[1]] }[side];
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.n[0] * want[0] + F.n[1] * want[1] > 0.95) return F;
  }
  return null;
}
/** The annex's longest outer wall facing `want` (a world [x, z] unit vector) */
export function annexWall(want) {
  const R = outwardRing(FEUERWEHR_DORF.annex.ring);
  let best = null;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    // (not the wall it shares with the hall)
    if (pointInRing(FEUERWEHR_DORF.hall, ...onWall(F, F.len / 2, 0.3))) continue;
    if (F.n[0] * want[0] + F.n[1] * want[1] > 0.95 && (!best || F.len > best.len)) best = F;
  }
  return best;
}
export const annexSouth = () => annexWall([-FRAME.u[0], -FRAME.u[1]]);
export const annexWest = () => annexWall([-FRAME.n[0], -FRAME.n[1]]);
export const annexEast = () => annexWall(FRAME.n);
export const annexNorth = () => annexWall(FRAME.u);

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the hall and the annex */
export const groundOutlines = () => [FEUERWEHR_DORF.hall, FEUERWEHR_DORF.annex.ring];

/** Is a point inside the depot (the hall or the annex)? */
export const insideDepot = (x, z) => groundOutlines().some((r) => pointInRing(r, x, z));

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
