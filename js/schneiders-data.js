// Schneider's (confiserie, tea-room and restaurant; the Promenade, 7270 Davos Platz; js/schneiders.js): the house's
// walls, the floors' grid, the gabled roof with the wall dormer on its north-east slope, the shop front on the Promenade
// with its awning and lettering, the stacked timber balconies, the low annex at the east corner. Pure data and frame
// maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1745/1012, batch 21, the house; batch 5, the annex): the gabled roof's eaves and
// ridge, the wall dormer's eaves and peak, the walls' feet and the annex's flat roof; heights in the world frame
// (y = m a.s.l. − 1558, js/davos-frame.js). The house stands square to the Promenade, which passes its north-west
// gable at y −3.4; the ground falls along the north-east and south-west sides to y −8.3 to −10 on the south-east, where
// the lowest floor lies at −8.65. The ridge runs north-west – south-east, off the middle: the north-east slope comes
// down to y 9.95, the south-west one only to 12.9. OpenStreetMap's footprint is w110590690 (its corners up to 1.1 m off
// the surveyed walls; the gable on the Promenade 0.8 m out, where the balconies stand).
// The look after Mapillary's street views (CC BY-SA): from the Promenade north-east of the house (2015) the cream
// plaster, the windows with red shutters, wrought-iron grilles over the first floor's, the painted quoins at the north
// corner, the wall dormer on the north-east slope, the chimneys, the timber balconies stacked by the west corner of the
// gable on the Promenade, the dark timber in the gable's apex and its deep verges, the awning over the ground floor;
// from the west (2013) the same gable over the shop front. The shop front's lettering, the south-east gable, the
// south-west wall (against the chalet next door, w1529620022) and the annex are guessed. (The big chalet with the
// oriels, "café" and "CONFISERIE" over its shop window in the photographs from the west is the house next door,
// w1529620022, not this one.)
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The roof's frame: `u` along the ridge from the south-east eaves (the east corner of the roof) to the north-west ones,
// `w` across it from the north-east eaves to the south-west ones (both in metres)
const E0 = [-463.6, -261.2], N0 = [-473.5, -273.7];
const UL = Math.hypot(N0[0] - E0[0], N0[1] - E0[1]);
const U = [(N0[0] - E0[0]) / UL, (N0[1] - E0[1]) / UL], W = [U[1], -U[0]];
/** The world point (x, z) at u along the ridge, w across it */
export const P = (u, w) => [E0[0] + U[0] * u + W[0] * w, E0[1] + U[1] * u + W[1] * w];
/** The roof frame's coordinates (u, w) of a world point */
export const uw = (x, z) => { const dx = x - E0[0], dz = z - E0[1]; return [dx * U[0] + dz * U[1], dx * W[0] + dz * W[1]]; };
export const AXES = { U, W };

export const SCHNEIDERS = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [{ x: -474, z: -263.1, r: 3 }, { x: -465.8, z: -258.5, r: 3 }],
  osm: 'w110590690',
  // OpenStreetMap's footprint (for the tests)
  footprint: [[-463, -262.8], [-473.9, -253.4], [-484, -265.1], [-473.2, -274.5]],
  // The walls in the roof's frame: u from the south-east gable to the north-west one (on the Promenade), w from the
  // north-east wall to the south-west one
  walls: { u0: 0.7, u1: 15.15, w0: 0.7, w1: 13.3 },
  // The roof: the eaves' outline (u 0 – length, w 0 – width), the ridge `ridgeW` across at `ridge`, the north-east
  // eaves at `eaveNE`, the south-west ones at `eaveSW`
  roof: { length: UL, width: 14.09, ridgeW: 8.1, ridge: 18.5, eaveNE: 9.95, eaveSW: 12.9 },
  // The wall dormer over the middle of the north-east wall: its half width, its eaves and its peak, its roof `over` m
  // out over its walls and `front` m before its face
  dormer: { half: 2.85, eave: 13.9, peak: 16.8, over: 0.35, front: 0.4 },
  // The floors: the ground floor on the Promenade from y −3.3, the first floor's foot at `foot`, 4 m each from there
  // (the ground floor, the first and second floors under the north-east eaves; the attic and the gable's top floor in
  // the gables and the dormer); a window's bay along a wall
  street: -3.3,
  foot: 0.9,
  storey: 4.0,
  bay: 2.6,
  base: -11, // how far down the walls reach (under the ground on the south-east)
  // A window: m up from its floor's foot, its half width; the red shutters beside it (`shutter` m wide each, from the
  // second floor up)
  win: { lo: 1.0, hi: 2.7, half: 0.55 },
  shutter: 0.5,
  // The floors in the windows' grid: 0 the first floor (its windows behind wrought-iron grilles), 1 the second, 2 the
  // attic, 3 the gable's top floor; −1 the ground floor, −2 the one under it on the south-east
  // The walls (a → b as wallFrame wants them): `mid` where the bays are laid out from (m along the wall), `cols` the
  // bays (k: a window at mid + k × bay) of the floors up to the second, `attic` and `top` those in the gable
  sides: {
    ne: { a: 'E', b: 'N', kind: 'eaves', cols: [-2, -1, 0, 1, 2], dormer: [0] },
    nw: { a: 'N', b: 'W', kind: 'gable', cols: [-2, -1, 0, 1], attic: [-1, 0, 1], top: [0] },
    sw: { a: 'W', b: 'S', kind: 'party' },
    se: { a: 'S', b: 'E', kind: 'gable', cols: [-1, 0, 1, 2], attic: [-1, 0, 1], top: [0] }
  },
  // The gables' timber apex from this height up
  timber: 16.0,
  // The shop front on the Promenade (m along the gable from the north corner): the shop windows, the doors, the glazing's
  // sill and head; the awning (from the wall at `y`, `out` m, its edge `drop` lower, the valance under it), the name in
  // gilt letters on the wall over it
  shop: {
    windows: [[1.2, 6.2], [8.6, 11.5]], door: [6.7, 8.1], sill: -2.9, head: -0.2,
    awning: { s0: 1.0, s1: 8.4, y: 0.85, out: 1.5, drop: 0.7, valance: 0.35 },
    name: { s0: 1.1, s1: 6.1, y0: 0.95, y1: 1.7 }
  },
  // The timber balconies stacked by the west corner of the gable on the Promenade: m along it, m out, the floors' feet
  balconies: { s0: 8.6, s1: 11.4, out: 1.2, levels: [0.9, 4.9, 8.9] },
  // The painted quoins: m wide, from y0 up to the eaves
  quoins: { w: 0.9, y0: 0.9 },
  // The chimneys: (u, w) on the roof, m over it
  chimneys: [[3.0, 6.6, 1.0], [12.6, 6.6, 1.0], [6.8, 10.65, 0.8]],
  // The annex at the east corner (batch 5): a flat roof at `top` over its outline, a garage door in its south-east wall
  annex: {
    top: -5.63,
    ring: [[-466.9, -255.7], [-468.7, -258.0], [-468.1, -258.5], [-465.4, -260.7], [-464.8, -261.2], [-462.9, -258.9]],
    door: { w: 2.6, h: 2.3 }
  }
};

const S = SCHNEIDERS;
/** The roof's height at w across it (its upper face) */
export function roofY(w) {
  const R = S.roof;
  return w <= R.ridgeW ? R.eaveNE + ((R.ridge - R.eaveNE) * w) / R.ridgeW : R.ridge - ((R.ridge - R.eaveSW) * (w - R.ridgeW)) / (R.width - R.ridgeW);
}
/** The slopes' rises per metre across: north-east, south-west */
export const slopes = () => [(S.roof.ridge - S.roof.eaveNE) / S.roof.ridgeW, (S.roof.ridge - S.roof.eaveSW) / (S.roof.width - S.roof.ridgeW)];

/** The walls' corners (world x, z) */
export function corners() {
  const { u0, u1, w0, w1 } = S.walls;
  return { E: P(u0, w0), N: P(u1, w0), W: P(u1, w1), S: P(u0, w1) };
}
/** The house's outline, its walls running as wallFrame wants them */
export const houseRing = () => outwardRing([corners().E, corners().N, corners().W, corners().S]);

/**
 * A side of the house: its frame, the roof's height over it at s (m along it), the wall's top, its bays' middle and
 * the windows' columns (m along it) of its floors
 */
export function side(id) {
  const D = S.sides[id], C = corners(), F = wallFrame(C[D.a], C[D.b]);
  const { w0, w1 } = S.walls, bay = S.bay;
  // w across the roof at s along this wall (the gables), or the wall's own w (the eaves' walls)
  const wAt = { ne: () => w0, sw: () => w1, nw: (s) => w0 + s, se: (s) => w1 - s }[id];
  const roofAt = (s) => roofY(wAt(s));
  const mid = id === 'nw' ? S.roof.ridgeW - w0 : id === 'se' ? w1 - S.roof.ridgeW : F.len / 2;
  const col = (ks = []) => ks.map((k) => mid + k * bay);
  return { id, F, kind: D.kind, roofAt, mid, cols: col(D.cols), attic: col(D.attic), top: col(D.top), dormer: col(D.dormer) };
}
export const SIDES = ['ne', 'nw', 'sw', 'se'];

/** A floor's foot (k: 0 the first floor, −1 the ground floor) */
export const floorFoot = (k) => S.foot + k * S.storey;
/** A window's reach either side of its column with its shutters */
export const reach = () => S.win.half + 0.06 + S.shutter;

/** The first floor's foot whose windows clear the ground `hi` (the windows begin there, a closed plinth under it) */
export function windowsFrom(hi) {
  const k = Math.ceil((hi - S.foot - S.win.lo) / S.storey);
  return S.foot + k * S.storey;
}

/** The wall dormer: its middle and its ends (m along the north-east wall), its back's w (where its eaves meet the roof) */
export function dormer() {
  const { F, mid } = side('ne'), D = S.dormer, [k1] = slopes();
  return { F, mid, s0: mid - D.half, s1: mid + D.half, wBack: (D.eave - S.roof.eaveNE) / k1, wPeak: (D.peak - S.roof.eaveNE) / k1 };
}

/** The ridge's ends (world x, z): south-east, north-west */
export const ridgeEnds = () => [P(0, S.roof.ridgeW), P(S.roof.length, S.roof.ridgeW)];

/** Is a point inside the annex? */
export const inAnnex = (x, z) => pointInRing(S.annex.ring, x, z);

/** The outlines the walls stand on at the ground, for the player (js/landmarks.js SURVEYED_FOOTPRINTS) */
export const groundOutlines = () => [houseRing(), S.annex.ring];

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
