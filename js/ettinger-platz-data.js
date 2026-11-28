// The house of Ettinger Fashion on the Promenade in Davos Platz (OpenStreetMap w116881169; js/ettinger-platz.js): the
// low shop pavilion between the Promenade and the lane north of it, its walls, the shop windows on three sides, the
// lettering, the roof slab out over the walls and the board on its post by the north-east corner. Pure data and frame
// maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1744/1009, batch 0; floor on y −1.48): one flat roof at 5.32 (its edge at 5.5)
// over an outline that stands 0.5–0.6 m out of the walls (the roof's slab: its walls stand on the points at the floor,
// the ring below); heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). OpenStreetMap traced the
// roof's edge, not the walls. The ground: −1.4 on the Promenade (east) and the square to the south, rising to −0.9 in
// the lane on the west.
// The look after Mapillary's street views of 2013 and 2015: from the south up the Promenade (the south front: white
// plaster, a big display window in a dark brown frame under a blue band, a closed stretch at its west end, glazing
// round the south-east corner, the blue awning along the Promenade, the dark-edged slab on top, the board "ettinger
// sport" on its post beyond the north-east corner) and from the north-east down the Promenade (the north front on the
// lane: the entrance by the corner, two display windows between brown posts, the closed white end with "ettinger" in
// blue and "sport" in grey under it). The Promenade's front is seen only along it: glazing behind the awning, its posts
// and door guessed. The west wall on the lane behind is in no photograph: guessed (closed white plaster, a back door).
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const ETTINGER_PLATZ = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: -626.4, z: -3.7, r: 3 },
  osm: 'w116881169',
  shop: 'n6184860860', // Ettinger Fashion (js/shops-data.js): lettered here, no generic sign
  floor: -1.48,
  base: -3.0, // how far down the walls reach
  // The walls at the ground (world x, z), outward: each wall a → b has the outside on its left-hand normal (wallFrame).
  // A 0.5 m step in the north wall and a 0.6 m step in the south wall, as the roof has them
  ring: [[-619.1, -10.6], [-624.2, -11.9], [-624.3, -11.4], [-629.8, -12.8], [-633.7, 2.1], [-627.7, 3.7], [-627.8, 4.3], [-623.3, 5.5]],
  // The roof: the survey's outline (the slab's edge), its top and the edge's, the slab's underside
  roof: {
    ring: [[-623.0, 6.1], [-628.4, 4.7], [-628.3, 4.1], [-634.3, 2.5], [-630.2, -13.4], [-624.2, -11.9], [-624.1, -12.4], [-618.5, -10.9]],
    top: 5.32, edge: 5.5, soffit: 4.9
  },
  // The shop floor's heights: the granite plinth over the highest ground before a wall, the glazing up to `glassTop`,
  // the blue band over it, white plaster up to the slab
  plinth: 0.35, glassTop: 2.6, band: [2.6, 2.85],
  // The walls by index in `ring` (wall i: ring[i] → ring[i + 1]; s m along it from ring[i]): what each shows.
  // `glass`: shop windows [from, to]; `doors`: glazed doors [from, to] (within the glass); `posts`: the brown posts
  // between the panes (m along); `letters`: the lettering on a closed stretch; `backDoor`: a plain door
  walls: [
    // north front, its eastern part (on the lane): the entrance by the corner, a display window
    { side: 'north', glass: [[0.15, 5.26]], doors: [[0.45, 2.15]], posts: [0.15, 2.35, 5.26] },
    { side: 'north' }, // the step
    // north front, its western part: the display window's end, then the closed end with the lettering
    { side: 'north', glass: [[0, 2.0]], posts: [2.0], letters: { key: 'ettinger', from: 2.35, to: 5.35, y0: 2.35, y1: 3.85 } },
    // west wall on the lane: closed (guessed), a back door
    { side: 'west', backDoor: [9.6, 10.6] },
    // south front, its western part: a closed stretch at the west end, the big display window
    { side: 'south', glass: [[1.3, 6.21]], posts: [1.3, 6.21] },
    { side: 'south' }, // the step
    // south front, its eastern part: glazing to the corner
    { side: 'south', glass: [[0, 4.66]], posts: [0, 2.35, 4.66] },
    // east front on the Promenade: glazing its whole length under the awning, a door in the middle (guessed)
    { side: 'east', glass: [[0, 16.64]], doors: [[7.9, 9.7]], posts: [0, 2.75, 5.5, 7.9, 9.7, 12.2, 14.5, 16.64], awning: { out: 0.95, rise: 0.5, valance: 0.22 } }
  ],
  // The board on its post by the north-east corner (in the frame of the north front's eastern part: s from its east
  // end, a little past it, o out over the lane): both its faces lettered
  board: { s: -1.1, o: 1.6, w: 1.8, y0: 3.7, y1: 4.6, post: 0.07 }
};

/** Wall i's ends a → b (outward) */
export const wallEnds = (i) => {
  const r = ETTINGER_PLATZ.ring;
  return [r[i], r[(i + 1) % r.length]];
};
/** Wall i's frame (wallFrame: u along it, n out) */
export const wallOf = (i) => wallFrame(...wallEnds(i));

/** The board's frame: the north front's (wall 0) u and n, its middle at `mid`, its post's foot (x, z) */
export function boardFrame() {
  const F = wallOf(0), B = ETTINGER_PLATZ.board;
  const [x, z] = onWall(F, B.s, B.o);
  const a = [x - F.u[0] * B.w / 2, z - F.u[1] * B.w / 2];
  return { F: { a, u: F.u, n: F.n, len: B.w }, x, z };
}

/** Does the point lie inside the house (its walls at the ground)? */
export const inside = (x, z) => pointInRing(ETTINGER_PLATZ.ring, x, z);

/** The outlines the player's walls stand on at the ground (the roof's slab hangs over it: left out) */
export const groundOutlines = () => [ETTINGER_PLATZ.ring];

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
