// The Schweizerhaus on the Promenade (7270 Davos Platz; js/schweizerhaus.js): a villa in the Swiss chalet style, its
// two wings under one saddle roof, the taller middle under its cross roof, the floors' grid, the timber arcade and
// loggias on its west front, the paintings on the north gable. Pure data and frame maths, shared by the browser module
// and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1748/1015, batches 6 and 10): the walls below are its walls at the ground, the
// roofs its sloped triangles cleaned into planes; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js).
// The house is a block of 13.1 × 14.9 m turned 2.7° from the grid. Its saddle roof (batch 6) runs north–south, the
// ridge at y 8.9 a little east of the middle, the eaves at y 4.5 (west) and 5.1 (east) about 0.75 m out, the verges
// 0.7 m out over the gables on the north and the south. Across it a middle 5.3 m wide (batch 10) rises to y 9.5 under a
// cross roof of its own (ridge y 11.2 east–west, eaves y 9.0 a metre out), its gables on the west and the east, the
// east one standing 1.4 m out of the front. The street lies along the north gable at y −6.0; the ground falls to −11.5
// along the south gable, where a lower floor shows. OpenStreetMap's footprint is w116881148 (up to 2 m north of the
// surveyed walls).
// The look after Mapillary's street views (CC BY-SA). 2014 from the north-west (3949143331847471, the camera on the
// street at x −50, z −638, looking south-east): the north gable on the left (cream plaster, three axes of windows in
// dark brown casings with dark green shutters, the middle a pair, two painted halberdiers flanking the window pair under
// the apex, a row of shields under it and three over the ground floor by the west corner, a "Bibliothek" board at that
// corner, fretwork bargeboards on carved brackets), the west front on the right (an arcade of timber arches on posts
// before the ground floor, the wings' loggias over it with their arches and a frieze of slats under the eaves, the
// middle's balcony and its gable with a window pair under the apex). The "DAVOS TODAY" banner along the north gable's
// ground floor and the cloths over the balconies are the WEF week's and are left out. 2015 from the east and the
// north-east (161610485886345, 213263120256679): the east gable of the middle between the wings' eaves, three window
// rows of single, pair, single without shutters, a darker ground floor, bands at the floors, brackets under the eaves.
// The photographs from the north (884251262453198, 1673411119535878, 478789920041205: into the sun) and from the east
// in 2026 (876807095065257: a crowd and a tent) show little. The south gable and the lower floor are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The house's frame: t along the north gable (east), c along the west front (south), from the north-west corner.
// World x = o.x + t·u.x + c·n.x, z likewise
const U = (() => { const x = 0.99893, z = -0.04634, l = Math.hypot(x, z); return [x / l, z / l]; })();
export const FRAME = { o: [-35.5, -624.8], u: U, n: [-U[1], U[0]] };
/** World [x, z] of a point (t, c) of the house's frame */
export const toWorld = (t, c) => [FRAME.o[0] + FRAME.u[0] * t + FRAME.n[0] * c, FRAME.o[1] + FRAME.u[1] * t + FRAME.n[1] * c];
/** The house's frame [t, c] of a world point */
export const toLocal = (x, z) => { const dx = x - FRAME.o[0], dz = z - FRAME.o[1]; return [dx * FRAME.u[0] + dz * FRAME.u[1], dx * FRAME.n[0] + dz * FRAME.n[1]]; };
const W = (t, c) => toWorld(t, c).map((v) => Math.round(v * 100) / 100);

// The wings' east wall (t), the middle's east gable (t), the middle between c0 and c1, the south gable (c)
const T1 = 13.1, TM = 14.53, C0 = 4.7, C1 = 10.0, CS = 14.92;

export const SCHWEIZERHAUS = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles (the wings, the middle)
  exclude: [{ x: -28.6, z: -617.7, r: 3 }, { x: -27.9, z: -617.8, r: 3 }],
  osm: 'w116881148',
  base: -12.4, // how far down the walls reach (under the lowest ground, −11.6 at the south-east corner)
  t1: T1,
  // The volumes' walls at the ground (world x, z): the north wing, the middle (its east end standing out), the south wing
  parts: [
    { id: 'north-wing', ring: [W(0, 0), W(T1, 0), W(T1, C0), W(0, C0)] },
    { id: 'middle', ring: [W(0, C0), W(TM, C0), W(TM, C1), W(0, C1)] },
    { id: 'south-wing', ring: [W(0, C1), W(T1, C1), W(T1, CS), W(0, CS)] }
  ],
  middle: { c0: C0, c1: C1, t1: TM },
  len: CS,
  // The saddle roof over the wings: from the west eaves (t, y) over the ridge to the east eaves, between the verges (c)
  roof: { c0: -0.7, c1: 15.62, west: [-0.77, 4.5], ridge: [7.0, 8.9], east: [13.85, 5.1] },
  // The middle's cross roof: from the north eaves (c, y) over the ridge to the south eaves, between its verges (t); over
  // the saddle roof its eaves draw back to the middle's walls (`valley`: t where they leave the full overhang and where
  // they reach the wall, on the west and the east)
  cross: { t0: -0.95, t1: 15.58, north: [3.66, 9.0], ridge: [7.37, 11.2], south: [11.08, 9.0], valley: { west: [3.05, 4.1], east: [11.05, 9.98] } },
  // The floors: the ground floor's foot at `floor`, storeys of `storey` (tall rooms: the photographs' window rows), a
  // lower floor under it where the ground falls; the wings closed over their first floor (`attic`) but on the gables,
  // where the second floor's windows lie under the roof; the middle's ends closed over its second floor
  floor: -5.4,
  storey: 4.2,
  attic: { wing: -1.2 + 4.2, gable: 3.0 + 4.2, middle: 3.0 + 4.2 },
  // a window (m over its storey's foot); the bays along a wall from its middle: the main walls' (`bay`: the middle one a
  // pair, the others single, with shutters), the middle's gables' (`gableBay`: single, pair, single, no shutters)
  win: { lo: 0.9, hi: 2.95, single: 0.5, pair: 0.95, shutter: 0.45 },
  bay: 3.6,
  gableWin: { single: 0.45, pair: 0.85 },
  gableBay: 1.8,
  // The timber before the west front: a terrace at the ground floor and a balcony at the first along the whole front
  // (c from c0 to c1, `depth` out), an arcade of arches on posts under the balcony, the wings' loggias over it up to a
  // head under the eaves
  front: {
    c0: 0.15, c1: CS - 0.15, depth: 1.1, slab: 0.2, railing: 0.95,
    terrace: -5.4, balcony: -1.2, head: 4.15,
    posts: 9, // the arcade's spans
    loggias: [[0.15, C0 - 0.15], [C1 + 0.15, CS - 0.15]],
    loggiaSpans: 3,
    arch: 1.0 // the arches' height under the slab or the head
  },
  // The house door: under the arcade in the middle's west gable (c of its middle, its width), the ground floor's windows
  // left out there
  door: { c: (C0 + C1) / 2, w: 1.5, h: 2.7 },
  // The window pair under the apex of the middle's west gable (y of its foot and top, the half width of each, the gap)
  atticPair: { y0: 7.75, y1: 8.95, half: 0.36, gap: 0.22 },
  // On the north gable (u: metres from its middle towards the west, as the photograph reads it): the two halberdiers
  // flanking the window pair of the second floor, the shields under it, the three shields over the ground floor by the
  // west corner, the library's board at that corner, the arched hood over the pair
  north: {
    figures: [{ u: -2.05, w: 0.72 }, { u: 2.05, w: 0.72 }], figureY: [3.55, 6.15],
    shields: { w: 2.7, y0: 3.2, y1: 3.75 },
    corner: { u0: 5.05, u1: 6.45, y0: -1.05, y1: -0.5 },
    sign: { u0: 5.02, u1: 5.47, y0: -4.65, y1: -2.55 },
    hood: { w: 2.3, y0: 5.95, y1: 6.75 }
  }
};

const D = SCHWEIZERHAUS;

/** The saddle roof's height at t (its upper face) */
export function mainRoofY(t) {
  const [tw, yw] = D.roof.west, [tr, yr] = D.roof.ridge, [te, ye] = D.roof.east;
  return t <= tr ? yw + ((t - tw) * (yr - yw)) / (tr - tw) : yr - ((t - tr) * (yr - ye)) / (te - tr);
}
/** The cross roof's height at c (its upper face) */
export function crossRoofY(c) {
  const [cn, yn] = D.cross.north, [cr, yr] = D.cross.ridge, [cs, ys] = D.cross.south;
  return c <= cr ? yn + ((c - cn) * (yr - yn)) / (cr - cn) : yr - ((c - cr) * (yr - ys)) / (cs - cr);
}
/** The roofs' height over a point (t, c) of the frame: the higher of the two where both reach, null off them */
export function roofYAt(t, c) {
  let y = null;
  const R = D.roof, X = D.cross;
  if (t >= R.west[0] && t <= R.east[0] && c >= R.c0 && c <= R.c1) y = mainRoofY(t);
  if (t >= X.t0 && t <= X.t1 && pointInRing(crossOutline(), t, c)) y = Math.max(y ?? -Infinity, crossRoofY(c));
  return y;
}
/**
 * The cross roof's outline in the frame ([t, c]): the full overhang at its gables, drawn back to the middle's walls
 * over the saddle roof
 */
export function crossOutline() {
  const X = D.cross, [wa, wb] = X.valley.west, [ea, eb] = X.valley.east;
  const cn = X.north[0], cs = X.south[0];
  return [[X.t0, cn], [wa, cn], [wb, C0], [eb, C0], [ea, cn], [X.t1, cn], [X.t1, cs], [ea, cs], [eb, C1], [wb, C1], [wa, cs], [X.t0, cs]];
}

/** The outline the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the house's walls at the ground */
export const groundOutline = () => [W(0, 0), W(T1, 0), W(T1, C0), W(TM, C0), W(TM, C1), W(T1, C1), W(T1, CS), W(0, CS)];
/** Is a point inside the house? */
export const insideHouse = (x, z) => pointInRing(groundOutline(), x, z);

/** The west front's frame (s = c, from the north end, facing west) */
export const westFront = () => wallFrame(toWorld(0, 0), toWorld(0, CS));
/** The north gable's frame (facing the street; s from its east end) */
export const northGable = () => wallFrame(toWorld(T1, 0), toWorld(0, 0));

/** The arcade's posts on the west front: c of each */
export function arcadePosts() {
  const F = D.front, out = [];
  for (let k = 0; k <= F.posts; k++) out.push(F.c0 + ((F.c1 - F.c0) * k) / F.posts);
  return out;
}
/** The loggias' posts on the wings: c of each */
export function loggiaPosts() {
  const F = D.front, out = [];
  for (const [a, b] of F.loggias) for (let k = 0; k <= F.loggiaSpans; k++) out.push(a + ((b - a) * k) / F.loggiaSpans);
  return out;
}

/**
 * The bays of a wall laid out from its middle: [{ u, kind: 'pair' | 'single', ext }] with `ext` the half width they take
 * (casing and shutters); only those that fit (0.3 m of plaster left at each end)
 */
export function bays(len, gable = false) {
  const half = len / 2, bay = gable ? D.gableBay : D.bay, out = [];
  for (let k = -6; k <= 6; k++) {
    const pair = k === 0;
    const ext = gable ? (pair ? D.gableWin.pair : D.gableWin.single) : (pair ? D.win.pair : D.win.single) + D.win.shutter;
    if (Math.abs(k * bay) + ext + 0.3 <= half) out.push({ u: k * bay, kind: pair ? 'pair' : 'single', ext });
  }
  return out;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
