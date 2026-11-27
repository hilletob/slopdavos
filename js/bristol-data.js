// The house Bristol on the Promenade between Davos Platz and Dorf (js/bristol.js): the six-storey block and the
// two-storey podium wrapped round its south and east sides, the floors' grid, the shops' glazing and the name along the
// Promenade, the garage's gate on the lane to the north, the terrace on the podium's roof. Pure data and frame maths,
// shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1751/1017, batch 14, one building of 18.3 m from its lowest floor): the roofs'
// outlines and heights below are its two flat roofs, each a prism down under the ground; heights in the world frame
// (y = m a.s.l. − 1558, js/davos-frame.js). The podium's east wing stands back from the Promenade on its forecourt at
// y 4.3–4.7; the ground climbs west up the valley's side: 5–6 along the block's east walls, 6–8 along the podium's south
// wall, 8–9.4 along the block's west and north walls. OpenStreetMap's footprint is w118240447: the block within a metre
// or two; the podium's east wing (x 480–490) is not in it (no other footprint there either), so the batch holds only
// 43 % inside it. Both outlines below are registered as the house's walls.
// Mapillary's three street views (2015, from the Promenade north-east of the house, looking south-south-west) show the
// house next door, not the Bristol: the block with the dark mansard and the red arcade on the Promenade is w118240343
// (x 487–506, z −891…−922), which stands between the cameras and the Bristol and hides it. Its "P → 20 m" sign points
// down the lane between the two houses, where the garage's gate is put here. Everything else is drawn in the language
// of the town's flat-roofed houses of its kind and is guessed: warm white plaster, windows in brown timber frames in
// every bay, a dark coping; the podium's glazed shops under a dark fascia with the name, a railing round its terrace.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const BRISTOL = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: 475.3, z: -876.3, r: 3 },
  osm: 'w118240447',
  storey: 2.95,
  bay: 2.8,
  base: 2.4, // how far down the walls reach (under the forecourt, y 4.3)
  // a window in its storey (m up from the floor's foot) and its half width
  win: { lo: 0.9, hi: 2.3, half: 0.6 },
  // The volumes, each a flat roof at `top` over its outline (world x, z). `line`: the top floor's top (the windows' grid
  // counts down from it), the wall from there to the roof a closed parapet; `floor`: the ground floor's foot
  parts: [
    // the block: six floors from the Promenade's side (y 4.6), four over the slope on the west and the north
    {
      id: 'block', top: 22.69, line: 22.3, floor: 4.6,
      ring: [[480.1, -880.5], [481.0, -880.2], [481.4, -879.3], [481.1, -877.4], [480.0, -876.5], [478.9, -876.7], [478.2, -874.0], [480.5, -873.4],
        [479.6, -869.9], [480.3, -869.8], [478.2, -862.8], [479.1, -862.6], [479.5, -861.7], [478.6, -858.1], [477.5, -857.2], [473.2, -858.6],
        [472.7, -859.7], [472.9, -860.5], [469.4, -861.5], [468.5, -863.9], [467.8, -863.4], [464.9, -864.2], [463.2, -867.3], [461.7, -867.8],
        [460.1, -870.6], [461.2, -874.4], [462.4, -874.9], [464.2, -881.5], [463.6, -882.4], [462.8, -882.7], [462.3, -883.5], [462.9, -885.9],
        [463.8, -886.2], [464.9, -886.0], [465.9, -890.2], [463.2, -891.0], [462.8, -892.1], [463.9, -896.3], [465.1, -896.7], [466.0, -896.6],
        [466.0, -897.2], [475.8, -894.4], [475.5, -893.6], [476.4, -893.3], [477.1, -892.3], [476.3, -889.8], [477.8, -889.3], [476.9, -885.7],
        [478.1, -885.4], [477.3, -881.5], [480.1, -880.9]]
    },
    // the podium: the shops' ground floor and one floor over it, wrapped round the block's south and east walls, its
    // roof the terrace of the block's third floor (y 10.5) behind a parapet
    {
      id: 'podium', top: 11.35, line: 10.5, floor: 4.6,
      ring: [[476.9, -885.7], [478.1, -885.4], [477.3, -881.5], [480.1, -880.9], [480.1, -880.5], [481.0, -880.3], [481.4, -879.3], [481.1, -877.4],
        [480.0, -876.5], [478.9, -876.7], [478.2, -874.0], [480.5, -873.4], [479.6, -869.9], [480.3, -869.8], [478.2, -862.8], [479.1, -862.6],
        [479.5, -861.7], [478.6, -858.1], [477.5, -857.2], [473.2, -858.6], [472.7, -859.7], [472.9, -860.5], [469.4, -861.5], [468.5, -863.9],
        [467.8, -863.4], [467.5, -863.5], [466.2, -858.5], [478.8, -855.1], [482.4, -868.6], [485.5, -867.7], [490.4, -885.7], [477.8, -889.1]]
    }
  ],
  // The shops' glazing round the podium's ground floor, where the ground lies low enough along a wall (`min` m of
  // glass at least), from the ground up to `y1`, the fascia over it
  shop: { y1: 6.95, fascia: [6.95, 7.5], min: 1.3 },
  // The podium's east front on the Promenade (a on the left for someone standing before it: its south end): the name on
  // the fascia, `w` m wide in its middle, the doors under it
  front: { a: [485.5, -867.7], b: [490.4, -885.7], name: { w: 5.0 }, doors: [{ s: 5.0, w: 1.8 }, { s: 13.4, w: 1.8 }] },
  // The podium's north wall on the lane to the garage (a: its east end): the gate, `s` m along it, `w` wide
  gate: { a: [490.4, -885.7], b: [477.8, -889.1], s: 8.6, w: 3.2, h: 2.5 },
  // The terrace's railing on the podium's parapet: its height
  rail: 0.95
};

/** A part by its id */
export const part = (id) => BRISTOL.parts.find((p) => p.id === id);

// (the survey's two rings meet within 0.2 m)
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.25;
/** Is a → b (either way round) a wall of the ring? */
export function isEdge(ring, a, b) {
  return ring.some((q, i) => { const r = ring[(i + 1) % ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); });
}
/** Is the wall a → b one the block and the podium share (the podium's inner walls, the block's behind the podium)? */
export const isShared = (a, b) => isEdge(part('block').ring, a, b) && isEdge(part('podium').ring, a, b);

/** The windows' bays along a wall `len` m long: their middles (m along it), laid out from its middle */
export function bays(len, bay = BRISTOL.bay, half = BRISTOL.win.half) {
  const out = [], n = Math.floor((len / 2 - half - 0.4) / bay + 1e-9);
  for (let k = -n; k <= n; k++) out.push(len / 2 + k * bay);
  return len / 2 >= half + 0.4 ? out : [];
}

/** The part of the house a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of BRISTOL.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): both volumes reach the ground */
export const groundOutlines = () => BRISTOL.parts.map((p) => p.ring);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
