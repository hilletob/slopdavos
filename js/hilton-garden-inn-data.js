// The Hilton Garden Inn Davos (Tobelmühlestrasse 2, 7270 Davos Platz; js/hilton-garden-inn.js) and the low building west
// of it: their volumes, the floors' grid, the faces (which wall carries what), the loggias of the timber skin on the
// street, the balconies of the other sides, the ground floor on the street, the lettering. Pure data and frame maths,
// shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1749/1015, batch 2, the hotel and the low building west of it as one building):
// the roofs' outlines and heights below are its flat roofs, each a prism down under the ground; heights in the world
// frame (y = m a.s.l. − 1558, js/davos-frame.js). The street along the south front lies at y −3.2 to −2.3, the footpath
// along the north side climbs to y +1 to +2.7, the street on the east at −1.7. OpenStreetMap's footprints are
// w218877212 (the hotel) and w218877211 (the low building, which holds the butcher's, n2503295134); both lie some 2 m
// north of the surveyed walls. The look after Mapillary's street views of 2013–2015 (CC BY-SA):
// - the south front on the street (from its east end, looking west along it): a skin of vertical larch battens over
//   five floors, cut by loggias two rooms wide that step one room along from floor to floor, a timber fin between the
//   two rooms, white plaster and windows in white frames behind; under it, set back, the ground floor's long window on
//   a slate plinth, the entrance in a deep recess at its west end, a door and a grey garage door at its east end; at
//   the west end a white volume with the hotel's name;
// - the east end (from the street on the east, looking west): the south part closed white plaster with the name in red
//   letters, the north part 1.2 m further out with balconies;
// - the west side (from the footpath, looking east): white walls behind running balconies with slatted rails and
//   storey-high slatted panels between them, a white strip at the north corner; the low building before it, clad in
//   dark grey panels, glazed at its south-west corner. The north side was not photographed: balconies as on the west.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const HILTON = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles (the Kongress Hotel's lies 45 m south)
  exclude: { x: 146.4, z: -660.6, r: 3 },
  osm: 'w218877212',
  lowOsm: 'w218877211',
  base: -4.5, // how far down the walls reach (under the street)
  // The floors: the ground floor from the street to the first floor at 1.5, five floors of 3.1 m over it, the roof's
  // slab at 17.0 and its parapet to the surveyed 17.38
  first: 1.5,
  storey: 3.1,
  floors: 5,
  roofLevel: 17.0,
  top: 17.38,
  bay: 2.9, // a room's width along a wall (a window in each)
  depth: 1.4, // how far the loggias and balconies reach back from the outline
  rail: 1.05, // a balustrade's height
  // The hotel's outline (its flat roof at `top`): a long block on the street, two wings north round a court
  ring: [[160.0, -677.3], [160.4, -663.5], [182.2, -664.3], [181.8, -674.5], [200.5, -675.1], [201.2, -657.1], [200.0, -657.0], [200.4, -646.2],
    [152.0, -644.4], [151.9, -645.3], [141.8, -645.0], [140.6, -676.6]],
  // The low hall in the court between the wings (its flat roof at 5.05; glazed towards the footpath)
  court: { top: 5.05, ring: [[160.4, -663.5], [182.2, -664.3], [181.8, -674.2], [160.1, -673.5]] },
  // The low building west of the hotel (its flat roof at 6.0): dark grey panels, a shop on the street, glazed at its
  // south-west corner
  low: { top: 6.0, ring: [[141.8, -645.7], [92.2, -643.9], [91.5, -663.6], [141.0, -665.4]] },
  // The hotel's walls, each from `a` to `b` as wallFrame wants them (a on the left for someone standing before it).
  // style: plaster (closed white), loggia (the timber skin with loggias), balcony (running balconies); `ends`: white
  // plaster margins at the outline ([at a, at b], m; at least `depth` where two recessed faces meet at a convex
  // corner); `from`: the first floor (index) with balconies (the walls round the court start over its roof)
  faces: [
    { id: 'west', a: [140.6, -676.6], b: [141.8, -645.0], style: 'balcony', ends: [1.5, 0] },
    { id: 'south-west', a: [141.8, -645.0], b: [151.9, -645.3], style: 'plaster', name: { w: 6.4, h: 1.95, y: 11.0 }, shop: [1.0, 9.1] },
    { id: 'jog-west', a: [151.9, -645.3], b: [152.0, -644.4], style: 'plaster' },
    { id: 'south', a: [152.0, -644.4], b: [200.4, -646.2], style: 'loggia', ends: [0, 1.5] },
    { id: 'east-south', a: [200.4, -646.2], b: [200.0, -657.0], style: 'plaster', name: { w: 7.6, h: 2.3, y: 10.9 } },
    { id: 'jog-east', a: [200.0, -657.0], b: [201.2, -657.1], style: 'plaster' },
    { id: 'east-north', a: [201.2, -657.1], b: [200.5, -675.1], style: 'balcony', ends: [0, 1.5] },
    { id: 'east-wing-north', a: [200.5, -675.1], b: [181.8, -674.5], style: 'balcony', ends: [1.5, 1.5] },
    { id: 'east-wing-west', a: [181.8, -674.5], b: [182.2, -664.3], style: 'balcony', ends: [1.5, 0], from: 1 },
    { id: 'court-back', a: [182.2, -664.3], b: [160.4, -663.5], style: 'balcony', ends: [0, 0], from: 1 },
    { id: 'west-wing-east', a: [160.4, -663.5], b: [160.0, -677.3], style: 'balcony', ends: [0, 1.5], from: 1 },
    { id: 'west-wing-north', a: [160.0, -677.3], b: [140.6, -676.6], style: 'balcony', ends: [1.5, 1.5] }
  ],
  // The ground floor under the south front's skin (m along it from its west end): its wall `d` m back from the outline;
  // kind: plaster, entrance (the doors in a deep recess, two columns before it), glass (the long window on a slate
  // plinth), door (a plain door), garage (a grey sectional door)
  ground: [
    [0, 1.2, 'plaster', 0], [1.2, 11.5, 'entrance', 3.5], [11.5, 32.5, 'glass', 1.0], [32.5, 37.5, 'door', 1.0], [37.5, 44.5, 'garage', 1.0],
    [44.5, 46.9, 'plaster', 1.0], [46.9, 48.43, 'plaster', 0]
  ],
  street: -3.0, // the street before the south front
  plinth: -2.5, // the glass' foot (the slate plinth under it)
  lintel: 0.55, // the ground floor's glass' head
  // The loggias: two bays open, two closed, stepping one bay along from floor to floor
  loggia: { open: 2, period: 4, head: 0.35, fin: 0.9 },
  // The balconies' storey-high slatted panels: one bay in `period`, stepping `step` bays from floor to floor
  panels: { period: 5, step: 3 },
  // The low building: the shop's window and fascia on the street, the band of windows over it, the butcher's name over
  // its door (OpenStreetMap's node, js/shops-data.js), the glass at the south-west corner
  shop: { glass: [-2.6, 0.9], fascia: [0.9, 1.75], band: [2.8, 4.6], metzg: { x: 105.9, w: 6.4, h: 0.6 } },
  corner: { len: 7.5, y: [-2.6, 4.2] },
  // things on the roof: the lift's and the stair's housings (centre x, z, half sizes, height over the roof)
  roofBoxes: [[176.0, -655.5, 1.6, 1.3, 2.4], [150.0, -660.0, 1.4, 2.2, 2.6], [191.0, -668.0, 1.2, 1.2, 1.6]]
};

/** The floors' levels: the floor of each storey over the ground floor */
export const levels = () => Array.from({ length: HILTON.floors }, (_, k) => HILTON.first + k * HILTON.storey);

/** A face by its id */
export const face = (id) => HILTON.faces.find((f) => f.id === id);

/**
 * The recess of a face: from `e0` to `e1` m along it (inside its margins), the bays' middle `c` and half `h` (the
 * walls' material lays the windows out from there)
 */
export function recess(f) {
  const F = wallFrame(f.a, f.b), [m0, m1] = f.ends || [0, 0];
  const e0 = m0, e1 = F.len - m1;
  return { F, e0, e1, c: (e0 + e1) / 2, h: (e1 - e0) / 2 };
}

/** The bays of a face's recess: their indices k (the middle at c + k · bay) that fit between its margins */
export function bayIndices(f) {
  const { h } = recess(f), B = HILTON.bay, K = Math.floor((h - B / 2) / B + 1e-9);
  const out = [];
  for (let k = -K; k <= K; k++) out.push(k);
  return out;
}
const mod = (a, n) => ((a % n) + n) % n;

/** The loggias of a face on floor `i`: [s0, s1] (m along it), each two bays wide, inside its margins */
export function loggias(f, i) {
  const { c, e0, e1 } = recess(f), B = HILTON.bay, L = HILTON.loggia, ks = bayIndices(f);
  const out = [];
  for (const k of ks) {
    if (mod(k - i, L.period) !== 0 || !ks.includes(k + L.open - 1)) continue;
    const s0 = c + (k - 0.5) * B + 0.15, s1 = c + (k + L.open - 0.5) * B - 0.15;
    if (s0 >= e0 + 0.3 && s1 <= e1 - 0.3) out.push([s0, s1]);
  }
  return out;
}

/** The slatted panels of a balcony face on floor `i`: [s0, s1], a bay each */
export function panels(f, i) {
  const { c } = recess(f), B = HILTON.bay, P = HILTON.panels;
  return bayIndices(f).filter((k) => mod(k + i * P.step, P.period) === 0).map((k) => [c + (k - 0.5) * B + 0.05, c + (k + 0.5) * B - 0.05]);
}

/** The part a point lies in ('hotel', 'court', 'low'), or null */
export function partAt(x, z) {
  if (pointInRing(HILTON.ring, x, z)) return 'hotel';
  if (pointInRing(HILTON.court.ring, x, z)) return 'court';
  if (pointInRing(HILTON.low.ring, x, z)) return 'low';
  return null;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
