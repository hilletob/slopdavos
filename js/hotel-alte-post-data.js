// The Hotel Alte Post above the Berglistutz (Davos Platz, below St. Johann's tower; js/hotel-alte-post.js): its
// volumes, the floors' grid, the pink house and the dark timber wing, the entrance on the lane, the letters on the roof.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1745/1006, batch 9, one building of 19.1 m from its lowest floor to its roof): the
// two flat roofs below, each a prism down to the ground; heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js). The lane along its north-west wall (the service way from the Berglistutz down to the
// Rathausstutz) lies at y −6.3 to −6.6, the ground at its south corner at −12.5: four floors over the lane, six over the
// south corner. OpenStreetMap's footprint is w457694788 ("Hotel Alte Post"). The look after Mapillary's street views of
// December 2013 taken from the lane south-west of it (1130128370787719, 809473636618497, 195388538931598; their
// bearings against the footprints put the cream four-storey house with the glazed porch on the left of those photos on
// w457694786, the neighbour west, and this hotel on their right, behind the low chalet w457694790): the narrow pink front
// with one white-framed window a floor and a small pediment, white pilasters at its corners, the long pink side along the
// lane, the dark timber wing beside it set back a little, with wide white-framed windows behind white curtains, and the
// gilt letters ALTE POST on a steel frame on its roof. Only the upper two or three floors of the south-west side show
// over the chalet; the lower floors, the south-east, north-east and north-west sides and the entrance are guessed. The
// views from the west (158117302902972, 768817960441307) look down the lane past w457694786: the hotel stands behind it.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const HOTEL_ALTE_POST = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: -571, z: 308.6, r: 3 },
  osm: 'w457694788',
  storey: 3.1,
  // the top floor's ceiling: the floors' feet at 2.8, −0.3, −3.4, −6.5 (the lane's), −9.6 and −12.7 (the survey's
  // lowest floor −12.88)
  line: 5.9,
  base: -13.6, // how far down the walls reach (under the south corner)
  bay: { pink: 2.2, timber: 2.0 },
  // a window in its storey (m up from the floor's foot) and its half width
  win: { pink: { lo: 0.95, hi: 2.35, half: 0.5 }, timber: { lo: 0.9, hi: 2.3, half: 0.62 } },
  // The volumes, each a flat roof at `top` over its outline (world x, z)
  parts: [
    // the long block along the lane and the timber wing at its south end (one roof)
    { id: 'west', top: 6.18,
      ring: [[-573.7, 300.4], [-581.5, 308.7], [-578.2, 312.4], [-578.9, 313.0], [-571.8, 320.7], [-563.6, 313.1], [-565.9, 310.7], [-566.4, 311.2],
        [-571.1, 306.0], [-569.4, 304.3], [-573.3, 300.5]] },
    // the north-east block towards the Berglistutz and the church, a metre higher
    { id: 'east', top: 7.24,
      ring: [[-566.4, 311.2], [-571.1, 306.0], [-569.4, 304.3], [-573.3, 300.5], [-569.5, 296.5], [-560.8, 303.3], [-562.5, 305.3], [-561.5, 306.2]] }
  ],
  // The timber wing's walls (either way round): the south-west front behind the pink house, the south-east side, its
  // east end; every other wall is pink plaster
  timber: [
    [[-578.9, 313.0], [-571.8, 320.7]],
    [[-571.8, 320.7], [-563.6, 313.1]],
    [[-563.6, 313.1], [-565.9, 310.7]],
    [[-565.9, 310.7], [-566.4, 311.2]]
  ],
  // The pink house's narrow front towards the lane's foot (a → b as wallFrame wants it): one window a floor, a small
  // pediment over the second floor's from the top
  front: { a: [-581.5, 308.7], b: [-578.2, 312.4], pediment: -0.3 },
  // A white band round the pink walls at a floor's foot (seen under the second floor's windows from the top)
  band: { y0: -0.6, y1: -0.3 },
  // The entrance in the north-west wall on the lane (s m along it from its north-east end): a door in a white frame, a
  // canopy, the name on a board over it
  door: { a: [-573.7, 300.4], b: [-581.5, 308.7], s: 3.5, w: 1.3, h: 2.45, canopy: { out: 1.1, y: 2.75 }, board: { w: 2.6, y0: 2.95, y1: 3.45 } },
  // The letters on their steel frame on the timber wing's roof, along its south-west front (s along it, o in from it)
  sign: { a: [-578.9, 313.0], b: [-571.8, 320.7], s0: 0.5, s1: 9.9, o: -1.2, y0: 7.1, y1: 8.2, posts: 5 },
  // Two chimneys on the roof: [x, z, half side, height over the roof]
  chimneys: [[-576.4, 309.6, 0.35, 1.2], [-571.6, 313.2, 0.3, 0.9]]
};

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** The part by its id */
export const part = (id) => HOTEL_ALTE_POST.parts.find((p) => p.id === id);
/** Is a → b (or b → a) a wall of the ring? */
export const isEdge = (ring, a, b) => ring.some((q, i) => { const r = ring[(i + 1) % ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
/** Is the wall a → b one the two parts share (inside the building)? */
export const isShared = (a, b) => HOTEL_ALTE_POST.parts.every((p) => isEdge(p.ring, a, b));
/** Is the wall a → b one of the timber wing's? */
export const isTimber = (a, b) => HOTEL_ALTE_POST.timber.some(([p, q]) => (near(p, a) && near(q, b)) || (near(p, b) && near(q, a)));
/** The floors' feet, from the lowest up */
export function floorFeet() {
  const H = HOTEL_ALTE_POST, out = [];
  for (let k = 6; k >= 1; k--) out.push(H.line - k * H.storey);
  return out;
}
/** The foot of the lowest floor whose windows clear the ground `hi` along a wall (null: none) */
export function firstWindowFloor(hi, lo) {
  for (const f of floorFeet()) if (f + lo >= hi) return f;
  return null;
}
/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): both volumes stand on the ground */
export const groundOutlines = () => HOTEL_ALTE_POST.parts.map((p) => p.ring);
/** The part of the hotel a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of HOTEL_ALTE_POST.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
