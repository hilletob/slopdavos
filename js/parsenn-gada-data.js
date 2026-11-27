// The house north-east of the Sport Hotel Parsenn (Promenade, 7260 Davos Dorf; js/parsenn-gada.js), behind the hotel's
// narrow wing on the Promenade, where the Parsenn Gada bar is: its block under a saddle roof, the tower over the
// hotel's roofs, the low annex towards the fire station. Pure data and frame maths, shared by the browser module and
// the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1752/1022, batches 2, 15 and 3): the walls' outlines below are its walls at the
// ground, the roofs its sloped triangles cleaned into planes; heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js). The block (batch 2) stands across the hotel's frame (js/sport-hotel-parsenn-data.js): its ridge
// (y 14.0) runs along the hotel's c axis, from the tower north-north-east to the gable towards the Seeli, its eaves at
// 10.5 over the Promenade (west-north-west) and towards the yard (east-south-east). The tower (batch 15) stands where
// the block meets the hotel, 7 × 6 m, its walls up to 19.1 under a shallow hipped roof (20.3); in the yard between the
// hotel and the hotel's wing across it, its east-south-east face reaches the ground. The annex (batch 3): one block of
// two low floors against the block's east side, under a saddle roof whose ridge (5.0) runs to a gable east-south-east.
// The ground lies flat round it, y −2.6 on the north to −3.4 in the yard. OpenStreetMap's footprint is w1527538704; it
// also takes in the hotel's narrow wing on the Promenade and its wing across the yard, which js/sport-hotel-parsenn.js
// builds (batch 14 holds them): this house keeps off them, its walls standing against theirs.
// The look after Mapillary's street views (CC BY-SA), few of them: 2013 from the car park south-east (the tower over
// the hotel's roof, cream plaster, a dark timber balcony on its top floor under the broad eaves; the block behind trees)
// and 2013 from the Seeli north (the gable end in cream plaster under the shallow roof, a door with a small canopy in
// it, the low annex to its left with an arched door). The window rhythm, the frames and the other sides are guessed.
import { toLocal, toWorld } from './sport-hotel-parsenn-data.js';
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

const W = (t, c) => toWorld(t, c).map((v) => Math.round(v * 100) / 100);

export const PARSENN_GADA = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles (the tower, the annex, the block)
  exclude: [{ x: 671.8, z: -1398.4, r: 3 }, { x: 688.7, z: -1405.4, r: 3 }, { x: 677.9, z: -1407.7, r: 3 }],
  osm: 'w1527538704',
  base: -4.3, // how far down the walls reach (under the lowest ground, −3.4)
  // The floors: 3 m each, the ground floor's foot at −2.6 (over the ground all round), a floor's top at every
  // 0.4 + 3k: four floors under the block's eaves (to 9.4), six in the tower (to 18.4), two in the annex (to 3.4)
  storey: 3.0,
  foot: -2.6,
  line: 0.4, // the ground floor's top (the grid's zero)
  // The block (batch 2): its walls at the ground. Its west-south-west side stands against the hotel's narrow wing
  // (from its point on the Promenade, a, to o), the south side against the tower (k → o) and the hotel's wing across
  // the yard (i → j → k); the annex stands before its east side's foot (g → f → e)
  block: {
    ring: [
      [671.0, -1413.0], // a: the hotel's narrow wing's point on the Promenade
      [674.4, -1417.7], // the wall on the Promenade (west-north-west)
      [674.9, -1418.4],
      [675.2, -1418.0], // the gable towards the Seeli (north-north-east) from here
      [687.0, -1409.8], // e
      [688.7, -1408.6], // f: the east side over the annex
      [685.0, -1403.6], // g
      [684.0, -1404.4],
      W(15.3, 19.4), // i: the hotel's wing across the yard, its north corner
      W(11.5, 19.4), // j
      W(11.5, 11.35), // k: on the tower's north-east face
      [670.69, -1403.1] // o: the tower's west corner, the narrow wing's corner on the yard
    ],
    // the walls that are another's (the tower's, the hotel's): none of their own
    inner: [[W(11.5, 11.35), [670.69, -1403.1]]],
    // the walls standing against the hotel's: closed (their foot is the hotel's)
    closed: [[[670.69, -1403.1], [671.0, -1413.0]], [W(15.3, 19.4), W(11.5, 19.4)], [W(11.5, 19.4), W(11.5, 11.35)]],
    // the wall over the annex's roof (f → e, the annex's own under it): from there up
    overAnnex: [[[687.0, -1409.8], [688.7, -1408.6]]],
    // The saddle roof in the hotel's frame (t across the ridge, c along it): the ridge at t = 7.0, y 14.0; the slope
    // towards the Promenade falls 0.456 to the eaves at t −0.7 (10.5), the one towards the yard 0.332 to t 17.53;
    // the gable's verge at c 27.65. Its outline ([t, c]), its edges with a fascia (open, not against a wall)
    ridge: { t: 7.0, y: 14.0, west: 0.456, east: 0.332 },
    roof: [[-0.7, 19.94], [5.28, 11.07], [11.5, 11.35], [11.5, 19.4], [17.53, 19.4], [17.53, 27.65], [-0.7, 27.65]],
    fascia: [false, false, false, true, true, true, true],
    // The door in the gable towards the Seeli, under a small canopy (s m along the wall from its west end)
    door: { s: 5.2, w: 1.2, h: 2.3 }
  },
  // The tower (batch 15): its walls from the base up to 19.1, the hipped roof's eaves (18.9) out over them and its
  // short ridge (20.3) along the hotel's frame's t
  tower: {
    ring: [[667.1, -1397.8], [670.69, -1403.1], [676.6, -1399.0], [673.0, -1393.8]],
    top: 19.15,
    eaves: { y: 18.9, ring: [[666.3, -1397.6], [670.5, -1403.8], [677.3, -1399.2], [673.1, -1393.0]] },
    ridge: { y: 20.3, a: [671.2, -1399.1], b: [672.5, -1398.2] },
    // the timber balcony on the face towards the yard (east-south-east), at the top floor's foot
    balcony: { a: [673.0, -1393.8], b: [676.6, -1399.0], w: 3.0, out: 1.1, y: 15.4, rail: 1.05 }
  },
  // The annex (batch 3): its walls at the ground (e → g, inside the block, has none), the saddle roof in
  // the hotel's frame: the ridge at c 24.27 (5.0), the slope south-west falling 0.30 to c 19.35, the one north-east
  // 0.52 to c 27.2; the gable at t 21.8, its verge at 22.2
  annex: {
    ring: [[685.0, -1403.6], [686.2, -1402.8], [689.4, -1400.6], [692.9, -1405.6], [688.7, -1408.6], [687.0, -1409.8]],
    inner: [[[687.0, -1409.8], [685.0, -1403.6]]],
    ridge: { c: 24.27, y: 5.0, sw: 0.3, ne: 0.52 },
    roof: [[15.3, 19.35], [22.2, 19.35], [22.2, 27.2], [13.8, 27.2], [13.8, 26.25], [16.55, 26.25], [16.5, 20.1], [15.3, 20.1]],
    fascia: [true, true, true, true, false, false, false, false],
    // the arched door in the face towards the Seeli (north-north-east; its middle), the ground floor closed there
    door: { a: [692.9, -1405.6], b: [688.7, -1408.6], w: 1.5, h: 2.6 }
  },
  // A window: m up from its floor's foot, its half width; the bay along a wall
  win: { lo: 0.9, hi: 2.3, half: 0.55 },
  bay: 2.6
};

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (either way round) one of the walls listed ([[a, b], …])? */
export const isListed = (list, a, b) => list.some(([p, q]) => (near(p, a) && near(q, b)) || (near(p, b) && near(q, a)));

/** The block's roof at (t, c) of the hotel's frame */
export function blockRoofY(t) {
  const R = PARSENN_GADA.block.ridge;
  return t < R.t ? R.y - R.west * (R.t - t) : R.y - R.east * (t - R.t);
}
/** The annex's roof at c of the hotel's frame */
export function annexRoofY(c) {
  const R = PARSENN_GADA.annex.ridge;
  return c < R.c ? R.y - R.sw * (R.c - c) : R.y - R.ne * (c - R.c);
}
/** The tower's roof over a world point (its four planes; the eaves' height outside them) */
export function towerRoofY(x, z) {
  const T = PARSENN_GADA.tower, E = T.eaves.ring, [p, q] = [T.ridge.a, T.ridge.b];
  // (the height over each face's plane, the lowest of the four: a hipped roof)
  const faces = [[E[0], E[1], p], [E[1], E[2], p], [E[2], E[3], q], [E[3], E[0], q]];
  let y = Infinity;
  for (const [a, b, r] of faces) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    const d = (p0) => Math.abs((p0[0] - a[0]) * dz - (p0[1] - a[1]) * dx) / l; // distance from the eave's line
    y = Math.min(y, T.eaves.y + ((T.ridge.y - T.eaves.y) * d([x, z])) / d(r));
  }
  return y;
}

/** The height of the roof over a wall's point: the block's or the annex's (by which ring the wall is of) */
export const blockTop = (x, z) => blockRoofY(toLocal(x, z)[0]);
export const annexTop = (x, z) => annexRoofY(toLocal(x, z)[1]);

/** A roof's outline ([t, c]) in the world ([x, z]) */
export const roofRing = (poly) => poly.map(([t, c]) => toWorld(t, c));

/** The parts of a roof's outline on either side of the line t = at (each [[t, c], …], or null when empty) */
export function splitAtT(poly, at) {
  const lo = [], hi = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (p[0] <= at) lo.push(p);
    if (p[0] >= at) hi.push(p);
    if ((p[0] - at) * (q[0] - at) < 0) {
      const k = (at - p[0]) / (q[0] - p[0]), x = [at, p[1] + (q[1] - p[1]) * k];
      lo.push(x); hi.push(x);
    }
  }
  return [lo.length >= 3 ? lo : null, hi.length >= 3 ? hi : null];
}

/** The highest floor's top whose windows fit under a wall's top at `top` (the ground floor's foot if none) */
export function windowLine(top) {
  const { storey, line, win } = PARSENN_GADA;
  let L = line - storey;
  for (let y = line; y - storey + win.hi <= top - 0.3 + 1e-9; y += storey) L = y;
  return Math.round(L * 100) / 100;
}

/** The outlines the walls stand on at the ground (the player's walls, js/landmarks.js SURVEYED_FOOTPRINTS) */
export const groundOutlines = () => [PARSENN_GADA.block.ring, PARSENN_GADA.tower.ring, PARSENN_GADA.annex.ring];

/** Is the world point inside one of the outlines? */
export const inside = (x, z) => groundOutlines().some((r) => pointInRing(r, x, z));

/** The door in the block's gable: the wall's frame (facing out) and the door's middle along it */
export function blockDoor() {
  // (the gable from its east end to its west end: so it faces out, north-north-east)
  const R = PARSENN_GADA.block.ring, F = wallFrame(R[4], R[3]);
  return { F, s: F.len - PARSENN_GADA.block.door.s };
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing, toLocal, toWorld };
