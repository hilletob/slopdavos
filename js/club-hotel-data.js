// The Club Hotel Davos's house on the Promenade at the Obere Strasse (Davos Platz; js/club-hotel.js): its volume, the
// floors' grid, the balconies on its stepped south front, the entrance on the Promenade. Pure data and frame maths,
// shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1743/1004, batch 19, one flat roof at y 15.17 over the whole outline, its floor on
// −2.5): the outline below is its roof's, a prism down under the ground; heights in the world frame (y = m a.s.l. −
// 1558, js/davos-frame.js). The ground falls from the Obere Strasse on the west (y 0 to 1) and the north end (1.0) to
// the Promenade on the east (−2.4) and the south-east corner (−2.5): six floors over the Promenade, five over the Obere
// Strasse. OpenStreetMap's footprint is w97292384 (up to 1.1 m off the surveyed walls).
// The look after Mapillary's street views (CC BY-SA): three of 2026 from the Promenade's corner at the Tanzbühlstrasse
// (south-west, 70–76 m off) show the stepped south front and, edge-on in its shade, the west face: white plaster, a
// balcony with a closed grey parapet before every step of the front on every floor, dark window frames, a thin white
// coping round the flat roof. Two of 2015 from the Promenade (north-east) show the house behind its trees, only the
// roof's edge and balconies. The blue tower with "club hotel" down its side in the fire station's views of 2015
// (js/feuerwehr-platz) is the hotel's other house across the Promenade (w219455924), not this one. The east face on the
// Promenade with the entrance, the north faces and the west face's windows are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const CLUB_HOTEL = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles. (Batch 14 of the same tile is another
  // house and stays.)
  exclude: { x: -916.6, z: 587.8, r: 3 },
  osm: 'w97292384',
  // The roof's outline (world x, z): the long west wing along the Obere Strasse, the stepped south front (four steps of
  // ~4 m, each 1.1 m further south going east), the diagonal corner on the Promenade, the east face, the north faces
  ring: [[-913.0, 601.7], [-916.6, 601.2], [-916.4, 600.1], [-920.2, 599.9], [-920.0, 598.9], [-923.9, 598.7], [-923.7, 597.6], [-927.8, 597.6],
    [-919.5, 574.0], [-913.8, 576.0], [-915.3, 580.5], [-905.2, 584.1], [-909.6, 596.7], [-909.0, 597.7]],
  top: 15.17,
  base: -3.6, // how far down the walls reach (under the Promenade)
  // The floors: the ground floor from the survey's floor to `ground` (taller, the lobby and the restaurant), then
  // storeys of `storey` up to `line`, the top floor's top; the wall from there to the roof the coping's
  floor: -2.5,
  ground: 0.9,
  storey: 2.8,
  line: 14.9,
  bay: 2.7,
  // A window: m up from its floor's foot (an upper storey's; the ground floor's stretched to its height), half its width
  win: { lo: 0.85, hi: 2.35, half: 0.62 },
  // The balconies: before every wall facing south (n.z > `facing`) longer than `minLen`, at every upper floor whose foot
  // stands `clear` m over the ground under the balcony; a slab, a closed parapet `rail` high, `out` m deep
  balconies: { facing: 0.5, minLen: 3, out: 1.3, rail: 1.05, slab: 0.2, clear: 2.4 },
  // The entrance on the Promenade: the east face (n.x > 0.8), the lobby's glazing over its ground floor (centred, `w`
  // wide), the doors (their width) and a flat canopy over them (its width, depth, height over the floor)
  entrance: { glazing: 8.4, doors: 2.4, canopy: { w: 5.4, out: 2.0, y: 3.1, thick: 0.25 } }
};

/** The outline's walls as wallFrame has them (the outside on n): [{ a, b, F }] */
export function walls() {
  const R = outwardRing(CLUB_HOTEL.ring);
  return R.map((a, i) => { const b = R[(i + 1) % R.length]; return { a, b, F: wallFrame(a, b) }; });
}

/** The upper floors' feet, from the first upper floor up */
export function floorFeet() {
  const H = CLUB_HOTEL, out = [];
  for (let y = H.ground; y < H.line - 0.5; y += H.storey) out.push(Math.round(y * 100) / 100);
  return out;
}

/** The walls the balconies stand before (facing south) */
export const balconyWalls = () => walls().filter((w) => w.F.n[1] > CLUB_HOTEL.balconies.facing && w.F.len > CLUB_HOTEL.balconies.minLen);

/** The east face on the Promenade (the entrance's wall) */
export const entranceWall = () => walls().filter((w) => w.F.n[0] > 0.8).sort((p, q) => q.F.len - p.F.len)[0];

/** Is a point inside the hotel's outline? */
export const inside = (x, z) => pointInRing(CLUB_HOTEL.ring, x, z);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
