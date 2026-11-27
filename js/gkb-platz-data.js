// The Graubündner Kantonalbank on the Promenade, Davos Platz (js/gkb-platz.js): its block, the floors' grid, the
// ground floor's glazing on the Promenade and its shutters on the lane, the lettering, the balconies over the lane, the
// roof's overhang. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1745/1010, batch 10: one flat roof at y 26.0 over a five-sided outline, 431 m²;
// the batch holds the bank alone): heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The Promenade
// before the west front lies at y −1.6 to −1.9; the lane along the south front falls from −1.9 to −3.3 and the yard
// behind the block to −5.4, so that the back shows a floor more. OpenStreetMap's footprint is w123380404; its north
// half (z −50 to −62) is js/landmark-buildings-data.js ARKADEN's third wing, which meets the bank's north wall (and the
// Arkaden's south wing beyond it). The look after Mapillary's street views of December 2013 (CC BY-SA): from the west
// across the Promenade (the west front and the south front on the lane: white plaster, ribbon windows in dark frames
// with grey blinds, the glazed ground floor under a white fascia with "Graubündner Kantonalbank" in dark letters, the
// same name round the corner over the lane's shuttered ground floor, the balconies with solid parapets on the lane, the
// flat roof's deep dark overhang), from the north down the Promenade (the closed north wall over the Arkaden with the
// name under its roof and the vents' slots) and from the east (the back's ribbon windows over the yard). Those
// photographs show four storeys over the Promenade (some 17 m), the survey 27.6 m: the floors here add up to the
// survey's height (seven over the ground floor); the window rhythm, the colours and the details are the photographs'.
// The south-east and east walls and the entrance's place are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const GKB_PLATZ = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: -586, z: -37.6, r: 3 },
  osm: 'w123380404',
  // the bank's node in js/shops-data.js (its generic sign gives way to the lettering)
  shop: 'n599060217',
  base: -6.4, // how far down the walls reach (under the yard behind)
  // The surveyed outline (world x, z) and its roof
  ring: [[-586.4, -24.6], [-599.0, -28.2], [-592.6, -50.3], [-573.0, -44.6], [-576.4, -32.9]],
  top: 26.0,
  // The roof's slab: its underside (the top floor's top), how far it stands out over the walls
  eaves: { y: 25.3, out: 0.9 },
  // The ground floor on the Promenade: its floor, the glazing's top, the fascia's top (the first floor's foot)
  ground: { floor: -1.6, glass: 2.0, fascia: 3.4 },
  floors: 7, // the floors over the ground floor
  // The walls (a on the left for someone standing before them): `kind` how the ground floor and the floors look:
  // shop (glazing on the Promenade), shutters (the lane), back (the grid of windows down to the yard), closed
  walls: {
    west: { a: [-592.6, -50.3], b: [-599.0, -28.2], kind: 'shop' },
    south: { a: [-599.0, -28.2], b: [-586.4, -24.6], kind: 'shutters' },
    southEast: { a: [-586.4, -24.6], b: [-576.4, -32.9], kind: 'back' },
    east: { a: [-576.4, -32.9], b: [-573.0, -44.6], kind: 'back' },
    north: { a: [-573.0, -44.6], b: [-592.6, -50.3], kind: 'closed' }
  },
  // A window in its storey (m up from the floor's foot), its half width and the bay along the wall: ribbon windows,
  // a narrow post of the frame between two
  win: { lo: 0.95, hi: 2.5, half: 0.62 },
  bay: 1.4,
  // The lettering (m along the wall, m up; as long as the atlas' cell is wide, 8 to 1): over the Promenade's glazing, over the lane's shutters, under the roof of
  // the north wall
  names: {
    west: { from: 12.2, to: 21.5, y0: 2.14, y1: 3.3 },
    south: { from: 0.8, to: 10.1, y0: 2.14, y1: 3.3 },
    north: { from: 2.6, to: 17.6, y0: 22.8, y1: 24.68 }
  },
  // The vents' slots in the north wall (m along it, their tops)
  vents: { at: [1.4, 18.9], y: 24.6 },
  // The entrance in the Promenade's glazing (m along the west wall, its width)
  door: { s: 7.0, w: 2.4 },
  // The balconies over the lane: along the south wall from the west corner, out of it, at the floors (counted from
  // the first floor over the ground floor), the parapet's height
  balconies: { from: 0.5, to: 7.6, out: 1.3, floors: [2, 3, 4, 5, 6], parapet: 1.0 }
};

/** A wall's frame by its name */
export const wallOf = (name) => wallFrame(GKB_PLATZ.walls[name].a, GKB_PLATZ.walls[name].b);

/** The floors' grid: the height of a floor (from the first floor over the ground floor), the top floor's top */
export const STOREY = (GKB_PLATZ.eaves.y - GKB_PLATZ.ground.fascia) / GKB_PLATZ.floors;
export const LINE = GKB_PLATZ.eaves.y;
/** The foot of upper floor k (1: the first floor over the ground floor; 0 and below: the back's lower floors) */
export const floorFoot = (k) => GKB_PLATZ.ground.fascia + (k - 1) * STOREY;

/** The ring offset `d` m outward (mitred corners): the roof's overhang */
export function offsetRing(ring, d) {
  const R = outwardRing(ring), n = R.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = R[(i + n - 1) % n], q = R[i], r = R[(i + 1) % n];
    const f0 = wallFrame(p, q), f1 = wallFrame(q, r);
    const mx = f0.n[0] + f1.n[0], mz = f0.n[1] + f1.n[1];
    const k = d / (1 + f0.n[0] * f1.n[0] + f0.n[1] * f1.n[1]);
    out.push([q[0] + mx * k, q[1] + mz * k]);
  }
  return out;
}

/** The outlines the player's walls stand on: the bank's, and the rest of OpenStreetMap's footprint north of it (the
 *  Arkaden's wings, js/landmark-buildings.js, which bring no walls of their own), on OSM's corners as before */
export function groundOutlines() {
  return [
    GKB_PLATZ.ring,
    [[-590.8, -49.8], [-573.0, -44.6], [-569.8, -57.6], [-587.3, -62.4]]
  ];
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
