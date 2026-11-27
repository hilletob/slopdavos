// The house of the Bäckerei-Konditorei Weber (Promenade 148, 7260 Davos Dorf, opposite the Parsennbahn; js/weber.js):
// its volumes, the floors' grid, the shop fronts, the painting on the front towards the Parsenn, the balconies at the
// back, the restaurant's low annex. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1752/1021 and 11/1752/1022, batch 12 of each, meeting at the tiles' edge): the
// roofs' outlines and heights below are its flat roofs, each a prism down to the ground; heights in the world frame
// (y = m a.s.l. − 1558, js/davos-frame.js). The house: a block of five floors (roof at 13.45) at the north end, on the
// corner of the Promenade (north-west, the ground at −3.4) and the lane to the Parsennbahn (north-east), a wing of two
// floors along the Promenade (4.47) and the garage's low block behind them on the lane to the south (3.1 to 3.85, the
// ground falling to −4.7). OpenStreetMap's footprint is w117012220, which stands up to 1.1 m off these walls.
// The look after Mapillary's street views: 284358909841439 (2019, from the Promenade north of the Sport Hotel
// Parsenn, whose white front with "Hotel Parsenn" painted on it fills the left of the picture) shows the block's front
// towards the Parsenn at the end of the street: pink plaster, white quoins, a painted frieze under a dark eave, a big
// crescent moon, a baker, "Weber" in script and a cup painted on its west half, windows on its east half, and before it
// the restaurant's low pink annex with "Restaurant" on its fascia. 534421814226074 and 1896954003806616 (2013, from
// the lane to the south) show the back: the block's south-west wall white with balconies on white posts and arched
// windows, the wing's pink south end. The low white front with its big windows under a canopy and a red band in those
// photographs, "Garage Graf" on it, faces the camera (south-south-west): it is the AVIA garage's, the low L of the house
// next door (js/talstrasse-block-data.js), not the east-south-east wall of the low block here, which stands against the
// L's west wall (from 644.1/−1345.0 on; the survey's batches meet there): that wall is closed. The Promenade's fronts
// (the bakery's and the café's) and the block's east walls are guessed: no photo shows them.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const WEBER = {
  // swissBUILDINGS3D's batches (their centres): left out of the streamed tiles
  exclude: [{ x: 642.1, z: -1352.9, r: 3 }, { x: 641.9, z: -1363.3, r: 3 }],
  osm: 'w117012220',
  // the businesses in the house (js/shops-data.js), whose generic signs give way to the house's own lettering
  shops: ['n13316557620', 'n13316557621'],
  storey: 3.05,
  base: -6.5, // how far down the walls reach (under the lane at the garage)
  win: { lo: 0.95, hi: 2.45, half: 0.55 }, // a window in its storey (m up from the floor's foot), its half width
  bay: 2.6,
  // The volumes, each a flat roof at `top` over its outline (world x, z). `line`: the top floor's top (the windows'
  // grid counts down from it); `skin`: the plaster's colour
  parts: [
    // the block: five floors over the Promenade (the ground floor 3.85 m, four of 3.05), the parapet under the eave
    { id: 'block', top: 13.45, line: 12.65, skin: 'pink',
      ring: [[635.4, -1369.1], [636.4, -1368.5], [642.0, -1364.7], [652.6, -1357.7], [656.8, -1363.9], [657.3, -1363.6], [659.8, -1367.4], [656.2, -1369.8],
        [656.6, -1370.5], [653.1, -1372.8], [653.6, -1373.5], [643.0, -1380.6]] },
    // the wing along the Promenade: the café on the ground floor, one floor over it (its north end, which the survey
    // runs a metre into the block, cut at the block's corner)
    { id: 'wing', top: 4.47, line: 3.6, skin: 'pink',
      ring: [[635.4, -1369.1], [624.3, -1350.2], [631.8, -1345.6], [632.4, -1346.5], [638.5, -1356.9], [643.4, -1365.0], [642.6, -1365.6], [642.0, -1364.7],
        [636.4, -1368.5]] },
    // the low block behind the wing (its two roofs of 3.07 and 3.16 as one; `garage` after the photographs' Garage Graf,
    // which is the neighbour's), its east-south-east wall against the AVIA garage's L from 644.1/−1345.0 on
    { id: 'garage', top: 3.1, line: 2.5, skin: 'white',
      ring: [[641.0, -1340.2], [644.1, -1345.0], [655.3, -1362.5], [654.8, -1362.8], [652.4, -1359.1], [643.1, -1355.3]] },
    // the low parts between the wing and the garage
    { id: 'link', top: 3.16, line: 2.5, skin: 'white', ring: [[643.4, -1365.0], [642.6, -1365.6], [638.2, -1358.3], [643.1, -1355.3]] },
    { id: 'back', top: 3.85, line: 3.0, skin: 'white', ring: [[629.9, -1346.9], [635.8, -1343.3], [643.1, -1355.3], [637.1, -1358.9]] }
  ],
  // The shop fronts on the ground floor (a on the left for someone standing before the wall): glazing between piers from
  // over the ground (`plinth` m, 0.35 if not given) up to `y1`, a fascia with the lettering from f0 to f1, a canopy if
  // given. The bakery's on the block's Promenade front with the door the mission walks to (js/missions-data-local.js
  // WEBER) `door` m along it; the café's along the wing
  fronts: [
    { id: 'bakery', a: [643.0, -1380.6], b: [635.4, -1369.1], y1: -0.75, fascia: [-0.6, 0.15], name: 'bakery', door: 5.62, doorHalf: 0.75 },
    { id: 'cafe', a: [635.4, -1369.1], b: [624.3, -1350.2], y1: -0.75, fascia: [-0.6, 0.1], name: 'cafe', door: 8.0, doorHalf: 0.75 }
  ],
  // Walls without windows (a, b either way round): the low block's against the AVIA garage's L (js/talstrasse-block-data.js)
  closed: [[[644.1, -1345.0], [655.3, -1362.5]]],
  // The painting on the block's front towards the Parsenn (the east end a): the stretch of it kept free of windows on
  // every floor, the painting over the floors above the annex
  mural: { a: [653.6, -1373.5], b: [643.0, -1380.6], clear: [7.4, 12.76], s0: 7.45, s1: 12.48, y0: 1.2, y1: 12.4 },
  // The frieze under the eave on the pink walls (y), the eave's depth
  frieze: { y0: 12.72, y1: 13.18 },
  eave: { y0: 13.18, y1: 13.52, out: 0.65 },
  // The balconies at the back: along the block's south-west wall, at the two upper floors (their slabs' tops), white
  // posts up to the eave between them
  balconies: { a: [636.4, -1368.5], b: [652.6, -1357.7], from: 0.6, to: 18.9, out: 1.35, floors: [6.55, 9.6], rail: 1.0, posts: 6 },
  // The restaurant's low annex before the block's front towards the Parsenn: from `s0` m along it to its west corner,
  // `depth` m out, `height` over the ground; its door in its front `door` m along it
  annex: { s0: 5.0, depth: 3.0, height: 3.3, door: 3.6 },
  // The mission's spots (js/missions-data-local.js WEBER): the door to the Promenade, the bike in the street
  door: { x: 639.6, z: -1376.1, r: 2.2 },
  bike: { x: 628.6, z: -1369.0 }
};

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (either way round) the wall `w` ({ a, b })? Returns 1 (as given), −1 (reversed) or 0 */
export function sameWall(w, a, b) {
  if (near(w.a, a) && near(w.b, b)) return 1;
  if (near(w.a, b) && near(w.b, a)) return -1;
  return 0;
}

/** The stretches of the wall a → b kept free of windows ([from, to] m along it): the painting's */
export function clearStretches(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), m = WEBER.mural, way = sameWall(m, a, b);
  if (way === 1) return [[m.clear[0], Math.min(len, m.clear[1])]];
  if (way === -1) return [[Math.max(0, len - m.clear[1]), len - m.clear[0]]];
  return [];
}

/** Is a → b (either way round) one of the closed walls? */
export const isClosed = (a, b) => WEBER.closed.some(([p, q]) => sameWall({ a: p, b: q }, a, b) !== 0);

/** A wall cut into its stretches: [{ from, to, windows }] (the clear ones without windows; a closed wall all of it) */
export function wallStretches(a, b, windows = true) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!windows || isClosed(a, b)) return [{ from: 0, to: len, windows: false }];
  const out = [];
  let at = 0;
  for (const [c0, c1] of clearStretches(a, b)) {
    if (c0 - at > 0.01) out.push({ from: at, to: c0, windows: true });
    if (c1 - c0 > 0.01) out.push({ from: c0, to: c1, windows: false });
    at = c1;
  }
  if (len - at > 0.01) out.push({ from: at, to: len, windows: true });
  return out;
}

/** The shop front on the wall a → b (as given, a on the left), or null */
export const frontOn = (a, b) => WEBER.fronts.find((f) => sameWall(f, a, b) === 1) || null;

/** The block's walls facing the back (south-west): white plaster with arched windows, as the photos of 2013 show */
export const facesBack = (F) => F.n[0] * -0.56 + F.n[1] * 0.83 > 0.9;

/** The annex's outline (world x, z): before the block's front from s0 to its west corner, `depth` out */
export function annexRing() {
  const F = wallFrame(WEBER.mural.a, WEBER.mural.b), A = WEBER.annex;
  return [onWall(F, F.len, 0), onWall(F, A.s0, 0), onWall(F, A.s0, A.depth), onWall(F, F.len, A.depth)];
}

/** The part of the house a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of WEBER.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the volumes' at the ground (the
 *  annex brings its own colliders, js/weber.js) */
export const groundOutlines = () => WEBER.parts.map((p) => p.ring);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
