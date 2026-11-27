// The Gredighaus (Promenade, 7260 Davos Dorf; js/gredighaus.js): its two volumes, the floors' grid, the walls with
// their shop fronts, canopy, terracotta strips and lettering. Pure data and frame maths, shared by the browser module
// and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1754/1024, batches 13 and 3): batch 13 the house of five floors under a flat roof
// at y 18.72, batch 3 a strip along its street front and a low wing against its north-east wall, one flat roof at 7.70;
// heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The street (the Promenade, south-east) and the
// square before the south-west front lie at y 1.3; behind the house the ground climbs to y 4–7 on the north-west.
// OpenStreetMap's footprint is w117012324 (up to 1.1 m off the surveyed walls). The look after Mapillary's street
// views (CC BY-SA): from the south on the Promenade (2015, 2026) the south-west front in cream plaster, white quoins on
// its corners, a terracotta strip up its middle window column ending in an arched window, "GREDIGHAUS" over the
// ground floor's canopy, the shops under the canopy on round columns, the white frieze and the dark eave; the street
// front's window columns each in a terracotta strip with an arched head. From the north-east along the street (2025)
// the north-east wall in cream with the broad quoin on its east corner, windows from the second floor up over the low
// wing's dark roof. The north-west walls against the slope are guessed (no photo shows them).
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The corners of the house's surveyed outline (world x, z): P3 the south corner on the street, P2 the east corner,
// P1 the north one, P4 the west one; P5–P0 the stair's step on the slope
const P = {
  0: [878.3, -1631.5], 1: [881.9, -1636.3], 2: [891.9, -1628.8], 3: [882.1, -1615.7],
  4: [872.1, -1623.2], 5: [874.6, -1626.5], 6: [873.5, -1627.3], 7: [877.3, -1632.3]
};
// The low wing's corners: Q0 on the house's north-east wall, C1 where the street strip's front meets the line of that
// wall, Q4 its east corner on the street, Q5 its north one
const Q = { 0: [883.1, -1635.4], c1: [893.2, -1627.8], 4: [896.4, -1632.2], 5: [886.1, -1639.6] };

export const GREDIGHAUS = {
  // swissBUILDINGS3D's two batches (their centres): left out of the streamed tiles
  exclude: [{ x: 882, z: -1626, r: 3 }, { x: 889.3, z: -1627.5, r: 3 }],
  osm: 'w117012324',
  base: 0, // how far down the walls reach (under the street at y 1.3)
  // The floors: the ground floor's shops up to the canopy, four floors of 3.1 m over it (the first one's foot at
  // `floor1`), the white frieze under the eave from `frieze`
  floor1: 5.15, storey: 3.1, floors: 4, frieze: 17.55,
  // The volumes, each a flat roof at `top` over its outline; `grid`: a floor's foot (the windows' grid counts from it),
  // `windowTop`: no window over it
  parts: [
    { id: 'house', top: 18.72, grid: 5.15, windowTop: 17.55, ring: [P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7]] },
    // the low wing against the north-east wall: two floors, its front on the street flush with the canopy's
    { id: 'wing', top: 7.7, grid: 1.2, windowTop: 7.7, ring: [Q[0], P[2], Q.c1, Q[4], Q[5]] }
  ],
  // The walls with something of their own (a on the left for someone standing before the wall, outside):
  // `shop` [from, to] m along it: glazing under the canopy; `columns` m along it; `canopy` [from, to, depth];
  // `strips`: the window bays (from the wall's middle, in bays) in a terracotta strip; `quoins` [from, to, foot];
  // `above`: the lowest window over this height (a roof before the wall); `windows`: small ones in the ground floor
  // [m along, half width]; `door` [from, to]; `letters` { bay, w, y0, y1 }
  walls: [
    // the south-west front on the square, the photographs' side: three window columns, the middle one in a strip; the
    // canopy and the shops on its south-east two thirds, a door and three small windows west of them
    { id: 'south-west', a: P[4], b: P[3], shop: [4.2, 12.5], columns: [4.2, 8.3, 12.3], canopy: [4.0, 12.5, 1.8], strips: [0],
      quoins: [[0, 0.75, 0], [11.55, 12.5, 5.95]], windows: [[1.15, 0.28], [1.9, 0.28]], door: [2.5, 3.5],
      letters: { bay: 1, w: 2.8, y0: 8.12, y1: 8.52 } },
    // the street front on the Promenade: five window columns, each in a strip; shops and the canopy all along
    { id: 'south-east', a: P[3], b: P[2], shop: [0, 16.36], columns: [0.2, 3.4, 6.6, 9.8, 13.0, 16.16], canopy: [-1.8, 16.36, 1.86],
      strips: [-2, -1, 0, 1, 2] },
    // the north-east wall over the low wing
    { id: 'north-east', a: P[2], b: P[1], above: 7.7, quoins: [[0, 0.95, 7.7], [11.6, 12.5, 0]] },
    // the low wing's street front: a shop
    { id: 'wing-street', a: Q.c1, b: Q[4], shop: [0, 5.44], columns: [0.2, 5.24] }
  ],
  shopTop: 4.6, // the glazing's head (the fascia over it up to the canopy)
  canopy: [5.55, 5.95], // the canopy's slab
  eave: { y0: 18.45, y1: 18.76, out: 0.5 },
  wingEave: { y0: 7.25, y1: 7.8, out: 0.25 },
  // a window: its sill and head over its floor's foot, its half width; the bays along a wall from its middle
  window: { lo: 0.85, hi: 2.35, half: 0.58 },
  bay: 3.2,
  strip: 0.2, // the terracotta beside a window in a strip
  arch: 0.75 // the arched head over the top window of a strip
};

export const part = (id) => GREDIGHAUS.parts.find((p) => p.id === id);

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** The wall a → b's own things (GREDIGHAUS.walls), or null */
export function wallSpec(a, b) {
  return GREDIGHAUS.walls.find((w) => near(w.a, a) && near(w.b, b)) || null;
}

/** Does a window of bay `i` (counted from the wall's middle) fit in a wall `len` m long? (as js/building-kit.js
 *  windowGrid opens it) */
export const bayOpen = (len, i) => Math.abs(i * GREDIGHAUS.bay) + GREDIGHAUS.window.half + 0.4 < len / 2;

/** The centre of bay `i` m along a wall `len` m long */
export const bayAt = (len, i) => len / 2 + i * GREDIGHAUS.bay;

/** The first floor (0: the first over the shops) whose windows clear `hi` (the highest ground, or a roof, before the
 *  wall) */
export function firstFloor(hi) {
  const G = GREDIGHAUS;
  return Math.max(0, Math.ceil((hi - G.floor1 - G.window.lo) / G.storey - 1e-9));
}

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the house and the low wing (the
 *  canopy hangs over the pavement) */
export const groundOutlines = () => GREDIGHAUS.parts.map((p) => p.ring);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
