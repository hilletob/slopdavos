// The SymondPark (Symondsstrasse, Davos Platz; js/symondpark.js): its volume, the floors behind its screen, the bays
// of the screen, the shop's glazed ground floor, the entrance on the forecourt, the lettering. Pure data and frame
// maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1750/1015, batch 16, one plain block of 20 triangles): the flat roof's outline and
// height below, a prism from its floor (y −1.38) to the roof (10.87); heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js). The ground climbs north up the valley's side: the forecourt on the south at y −1.4, the street on
// the west from −1.3 at its south end to 2.5 at its north end, the east side from −1.4 to 3.0, the north side at
// 2.5–3.5 (the building pit of 2013 was dug into the slope there). So the shop's floor opens onto the forecourt and the
// lower ends of the west and east walls, and two floors stand over the ground on the north. OpenStreetMap's footprint
// is w342094552 (some 0.4–0.9 m inside the surveyed walls); OpenStreetMap places a Migros (n3718116857) and the
// Migros restaurant (n3718116858, on the south wall) in it.
// The look after Mapillary's street views (CC BY-SA): from the street south-west of it (2015-12-28: the south front and
// the west side along the street, foreshortened) and from the east (2015-02-21: the east end behind trees, a billboard
// on it). The block (built 2014–15) is wrapped in a screen of dark grey-brown bars laid like bricks with open joints,
// divided into tall bays by light grey posts, the glazing behind the joints; a glazed ground floor shows at the south
// end of the east side. The ground floor on the south, the entrance, the lettering and the north side are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const SYMONDPARK = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: 228.6, z: -667.9, r: 3 },
  osm: 'w342094552',
  // the businesses js/shops.js would hang a generic board on (OpenStreetMap's walls, inside the surveyed ones here):
  // the name is drawn by the module instead
  shops: ['n3718116857', 'n3718116858'],
  // the surveyed outline (world x, z), its floor and its flat roof
  ring: [[215.7, -681.3], [217.2, -653.0], [241.4, -654.4], [239.8, -682.7]],
  floor: -1.38,
  top: 10.87,
  base: -3.5, // how far down the walls reach (under the forecourt)
  // The floors: the shop's tall ground floor (its glazing up to `glass`, a dark fascia over it up to `line`), then
  // `floors` upper floors of `storey` each, the screen ending at `screenTop` under the coping
  glass: 2.9,
  line: 3.3,
  storey: 3.65,
  floors: 2,
  screenTop: 10.6,
  // The screen's bays: about `bay` m wide, laid out from each wall's corners
  bay: 4.8,
  // A bay of the ground floor is glazed where the ground along it lies `clear` m under the glazing's top at most
  // (else the screen comes down into the ground there)
  clear: 2.0,
  // The south front on the forecourt (a → b, west to east): the entrance in its middle bay under a canopy, the
  // restaurant in its east bays
  south: {
    a: [217.2, -653.0], b: [241.4, -654.4],
    door: { w: 2.4, h: 2.5, canopy: { w: 7.2, out: 2.6, y0: 2.62, y1: 2.86 }, step: { w: 3.6, out: 1.3 } }
  },
  // The west side along the street (a → b, north to south)
  west: { a: [215.7, -681.3], b: [217.2, -653.0] },
  // The lettering (decals from the atlas): its wall, where along it (s0–s1, m from a) and its heights, `out` m before it
  lettering: [
    // the shop's name on the screen over the entrance
    { key: 'migros', wall: 'south', s0: 9.0, s1: 15.2, y0: 3.9, y1: 5.3, out: 0.04 },
    // the restaurant's name on the fascia of the east bays
    { key: 'restaurant', wall: 'south', s0: 16.0, s1: 22.4, y0: 2.95, y1: 3.25, out: 0.1 },
    // the building's name high on the street's side, near its south end
    { key: 'name', wall: 'west', s0: 18.4, s1: 27.0, y0: 8.8, y1: 9.9, out: 0.04 }
  ]
};

/** The surveyed outline turned as wallFrame wants it (the outside on −u.z, u.x) */
export const ring = () => outwardRing(SYMONDPARK.ring);

/** The bays of a wall `len` m long: their number and width (the posts at both corners) */
export function bays(len) {
  const n = Math.max(1, Math.round(len / SYMONDPARK.bay));
  return { n, w: len / n };
}

/** The glazing's foot in a bay of the ground floor, the highest ground along it `hi` (null: no glazing, the screen
 *  comes down) */
export function glassFoot(hi) {
  const S = SYMONDPARK, foot = Math.max(S.floor + 0.3, hi + 0.25);
  return foot <= S.glass - S.clear ? foot : null;
}

/** The floors' tops over the shop: the line, each upper floor's top (the last under the coping) */
export const floorTops = () => Array.from({ length: SYMONDPARK.floors }, (_, i) => SYMONDPARK.line + (i + 1) * SYMONDPARK.storey);

/** A named wall's frame (`south`, `west`) */
export const wallOf = (name) => wallFrame(SYMONDPARK[name].a, SYMONDPARK[name].b);

/** Is the point inside the building? */
export const inside = (x, z) => pointInRing(SYMONDPARK.ring, x, z);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
