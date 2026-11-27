// The house of the former AVIA garage on the Talstrasse (7260 Davos Dorf, between the Weber's house and the Migros;
// js/talstrasse-block.js): its volumes, the floors' grid, the glazed front with its balconies, the shop on the ground floor,
// the doors, the covered ramp on its south-east side. Pure data and frame maths, shared by the browser module and the
// tests.
//
// Sources: swissBUILDINGS3D (tile 11/1752/1021, batches 6, 11, 2 and 18): the block, a flat roof at y 16.72 over a near
// square of 16 m from its floor on −5.45 (batch 6, inside OpenStreetMap's footprint w117012205 to a metre); the low
// L round its south-west and north-west sides, a flat roof at 2.56 (batch 11; its north-west leg stands on the strip
// OpenStreetMap gives to the Weber's house w117012220, between the block and the Weber's low block, whose closed
// east-south-east wall its west wall meets, and its north end against the Weber's block's corner, cut at its walls:
// js/weber-data.js. The 2013 photographs of the Weber's back show the L's own front here: "Garage Graf", big windows
// under a canopy, the red band); a sloped slab along the block's south-east wall, from the ground at its south end to −2.4 at its
// north end (batches 2 and 18, the same slab twice: its top and its sides), taken for a covered ramp. Heights in the
// world frame (y = m a.s.l. − 1558, js/davos-frame.js). The ground: the forecourt on the south-west at y −4.9 to −5.4,
// the yard on the north-east at −4.5 to −4.9.
// The look after Mapillary's dashcam views of 2025 from the car park south of the house (1246938857183467,
// 797878189358395, 1067277362187767: the Migros' red box on the left, the timber chalet w117012255 on the right, this
// house between them, behind the low white garage): the block of today, a modern house of six floors over the shop, its
// front towards the forecourt (south-west) dark glazing behind balconies with glass balustrades, a white slab's edge at
// every floor, its south-east end in white plaster with narrow windows, a thin light roof edge; the ground floor a shop
// behind glazing in pink-magenta frames. The street views of 2013 (202404088156463, 506473807386958) show the house
// before: the AVIA garage, white with a red-pink band under the roof's edge, the block then two timber floors over it;
// the survey's block of 22 m and its ramp are of the house rebuilt since, and its garage's white walls with the pink
// band are kept from them. Guessed: the north-west and north-east sides, the ground floor towards the yard, the ramp.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const TALSTRASSE_BLOCK = {
  // swissBUILDINGS3D's batches (their centres): left out of the streamed tiles (the ramp's two batches share one centre)
  exclude: [{ x: 661.3, z: -1347.6, r: 3 }, { x: 653.7, z: -1348.0, r: 3 }, { x: 667.6, z: -1338.9, r: 3 }],
  osm: 'w117012205',
  storey: 2.8,
  line: 16.2, // the top floor's top: the floors' grid counts down from it (2.8 m a floor)
  groundFloor: -0.6, // the ground floor's top (the shop's; its foot on the ground, 4.3 m under it)
  base: -7.0, // how far down the walls reach
  bay: 2.4,
  win: { lo: 0.75, hi: 2.4, half: 0.45 }, // a window in its storey (m up from the floor's foot), its half width
  // The volumes, each a flat roof at `top` over its outline (world x, z)
  parts: [
    // the block: the shop's ground floor and six floors over it
    { id: 'block', top: 16.72,
      ring: [[664.2, -1356.7], [668.5, -1354.0], [667.8, -1352.8], [672.2, -1349.9], [663.6, -1336.7], [650.5, -1345.1], [659.0, -1358.4], [663.5, -1355.5]] },
    // the L round the block's south-west and north-west sides: the shop on the ground floor, a floor over it, its roof
    // the terrace before the block's first floor. Its north end, which the survey ran 0.5 m into the Weber's block
    // (js/weber-data.js), cut at that block's walls (the corner 652.6/−1357.7 and where its walls cross the L's)
    { id: 'garage', top: 2.56,
      ring: [[644.1, -1345.0], [661.7, -1333.7], [663.6, -1336.7], [650.5, -1345.1], [659.0, -1358.4], [659.3, -1358.2], [660.1, -1359.4], [655.68, -1362.25],
        [652.6, -1357.7], [652.34, -1357.87]] }
  ],
  // The block's front towards the forecourt (south-west; a on the left for someone standing before it): glazing over
  // the garage's roof, a balcony with a glass balustrade at each floor from the second up, white end walls `end` m wide
  front: { a: [650.5, -1345.1], b: [663.6, -1336.7], balconies: [5.0, 7.8, 10.6, 13.4], from: 0.35, out: 1.3, rail: 1.05, end: 0.45 },
  edge: { out: 0.3, depth: 0.3 }, // the block's roof edge, light grey
  // The shop's glazing on the ground floor: on the garage's front (south-west), from `s0` to `s1` m along it, from its
  // plinth over the highest ground along the wall up to `head` m over that ground; pink-magenta frames and fascia
  shop: { a: [644.1, -1345.0], b: [661.7, -1333.7], s0: 1.2, s1: 19.9, plinth: 0.3, head: 3.3, fascia: 0.5, door: 15.6 },
  // The other openings in the ground floor (a → b as the walls run, the outside on (−u.z, u.x): js/spital-data.js
  // wallFrame): windows [s, width], doors [s, width, height, kind], m along the wall from a; the sill and the head over
  // the highest ground along the wall
  openings: [
    // the block's south-east end beyond the ramp: a gate
    { id: 'gate', a: [663.6, -1336.7], b: [672.2, -1349.9], sill: 0.9, head: 2.9, windows: [], doors: [[13.2, 3.2, 3.1, 'gate']] },
    // the yard (north-east): a window, the house's door under a little canopy
    { id: 'yard-east', a: [672.2, -1349.9], b: [667.8, -1352.8], sill: 0.9, head: 2.9, windows: [[2.6, 1.9]], doors: [] },
    { id: 'yard-door', a: [668.5, -1354.0], b: [664.2, -1356.7], sill: 0.9, head: 2.9, windows: [], doors: [[2.5, 1.15, 2.3, 'house']] },
    // the garage's north end on the lane by the Weber's house
    { id: 'garage-north', a: [660.1, -1359.4], b: [655.68, -1362.25], sill: 0.9, head: 2.9, windows: [[2.85, 1.9]], doors: [] }
  ],
  // The red-pink band under the garage's roof's edge, the coping over it (m under / over the roof)
  band: { y0: -0.36, y1: 0, out: 0.12, coping: 0.07, copingOut: 0.2 },
  // The covered ramp along the block's south-east wall (batches 2 and 18): its outline (world x, z) and its slab's
  // plane through the surveyed corners, y = y0 + gx (x − x0) + gz (z − z0)
  ramp: {
    ring: [[661.7, -1333.7], [664.5, -1331.9], [673.6, -1341.9], [669.4, -1345.7], [663.6, -1336.7]],
    plane: { x0: 661.7, z0: -1333.7, y0: -5.3, gx: 0.133, gz: -0.153 },
    corners: [[661.7, -1333.7, -5.3], [664.5, -1331.9, -5.2], [673.6, -1341.9, -2.4], [669.4, -1345.7, -2.4], [663.6, -1336.7, -4.5]],
    slab: 0.3 // the slab's thickness at its edge
  }
};

export const part = (id) => TALSTRASSE_BLOCK.parts.find((p) => p.id === id);

/** The ramp's slab: its top at (x, z) */
export function rampY(x, z) {
  const P = TALSTRASSE_BLOCK.ramp.plane;
  return P.y0 + P.gx * (x - P.x0) + P.gz * (z - P.z0);
}

/** The part of the house a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of TALSTRASSE_BLOCK.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** Does the wall a → b of part `p` face into another part (the garage's L against the block)? */
export function isInner(p, a, b) {
  const F = wallFrame(a, b);
  if (F.len < 0.05) return true;
  const [x, z] = onWall(F, F.len / 2, 0.15);
  return TALSTRASSE_BLOCK.parts.some((o) => o !== p && pointInRing(o.ring, x, z));
}

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the block and the garage's L, both on
 * the ground; the ramp, flush with the ground at its south end, returns its own walls (js/talstrasse-block.js) */
export const groundOutlines = () => TALSTRASSE_BLOCK.parts.map((p) => p.ring);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
