// The Hotel Post Morosani, the Posthotel (Promenade 42, 7270 Davos Platz; js/hotel-post-morosani.js): its volumes, the
// floors' grids, the restaurant's front along the street corner, the balconies, the gilt sign on the roof, the garage
// on the yard. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1744/1007, batches 22 and 23): the roofs' outlines and heights below are its flat
// roofs, each a prism down under the ground; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The
// Promenade along the west front lies at y −0.5, the street along the north falls from −0.6 to −2 eastwards, the yard
// on the east lies at −3.7 to −4.7. OpenStreetMap's footprint is w123380421 (it stands up to 1.1 m off the surveyed
// walls); batch 23, the little annex at the north-east corner, stands outside it. The Rätia Center (js/raetia-center.js)
// is the next house south, 6.5 m off.
// The look after Mapillary's street views (CC BY-SA):
// - from the Promenade south of it (2013, looking north): the old hotel's south and west fronts in cream plaster, a
//   tall ground floor with the Pöstli Corner's windows under maroon awnings, a painted scalloped frieze over it and
//   another under the broad brown timber eaves, three floors of windows in brown surrounds, two balconies with grey
//   board rails on the south front, the big gilt POSTHOTEL letters and the post horn on a frame on the roof. (The tall
//   orange MM there hangs on the frame of the dark house in front, the Rätia Center's: not the hotel's.)
// - from the north (2015, looking south): the low restaurant along the street with its dark fascia "Restaurant ·
//   Dancing · Posthotel · Bar · Morosani", glazed under it, a canopy round the corner on the Promenade; over it two
//   floors of the old hotel's north face with the hotel's name painted in gilt on a panel.
// - from the east (2013): white roughcast, windows with dark timber boxes over them, the garage's mouth in the low
//   wing on the yard. The east face of the old block over the low wings, the low wings' south side and the annex are
//   guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const HOTEL_POST_MOROSANI = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [{ x: -620.9, z: 202.4, r: 3 }, { x: -608.7, z: 186.6, r: 3 }],
  osm: 'w123380421',
  // the hanging signs of js/shops.js that give way to the hotel's own lettering: the hotel's, the Pöstli Corner Bar's
  shops: ['w123380421', 'n2134213009'],
  base: -6.0, // how far down the walls reach (under the yard on the east)
  // The old hotel's grid: the tall ground floor's top, three floors of `storey` over it up to `line`, the attic band
  // with its frieze from there to the eaves; a window per `bay`
  old: { gf: 3.8, storey: 3.4, line: 14.0, bay: 3.2, win: { lo: 0.95, hi: 2.55, half: 0.6 } },
  // The rear's grid (white roughcast): floors of `storey`, their tops on 0.6 + k × storey; a window per `bay`
  rough: { storey: 3.0, bay: 2.6, win: { lo: 0.9, hi: 2.2, half: 1.0 } },
  // The volumes, each a flat roof at `top` over its outline (world x, z). `style`: old (the hotel's cream block),
  // restaurant (its street faces the restaurant's front, the others roughcast), rough (the roughcast rear); `line`:
  // the top floor's top on the part's grid
  parts: [
    // the old hotel: the tall block along the Promenade
    { id: 'main', style: 'old', top: 15.75,
      ring: [[-634.1, 191.1], [-621.2, 192.5], [-622.4, 203.6], [-619.5, 203.9], [-620.0, 208.9], [-623.3, 208.5], [-624.8, 222.2], [-627.7, 221.9],
        [-627.8, 223.0], [-633.4, 222.4], [-633.3, 221.2], [-637.1, 220.8], [-636.7, 216.7], [-637.8, 216.5], [-637.0, 208.9], [-635.9, 209.1],
        [-635.2, 202.5], [-636.5, 202.4], [-635.9, 195.9], [-634.6, 196.0]] },
    // the restaurant: one tall floor round the old block's north and east, its front on the street corner
    { id: 'restaurant', style: 'restaurant', top: 7.46, line: 6.6,
      ring: [[-635.0, 180.9], [-609.8, 183.6], [-610.3, 188.9], [-607.6, 189.3], [-609.7, 191.0], [-609.9, 193.2], [-608.0, 195.5], [-606.1, 195.4],
        [-604.7, 194.4], [-606.3, 202.0], [-607.4, 209.9], [-610.8, 209.5], [-610.9, 210.3], [-614.7, 209.9], [-614.8, 210.6], [-623.4, 209.7],
        [-623.3, 208.5], [-620.0, 208.9], [-619.5, 203.9], [-622.4, 203.6], [-621.2, 192.5], [-634.1, 191.1], [-634.6, 196.0], [-635.9, 195.9],
        [-636.4, 200.6], [-637.0, 200.5]] },
    // the wing on the yard (the garage under it) and the stair house at the restaurant's east end
    { id: 'rear', style: 'rough', top: 6.92, line: 6.6,
      ring: [[-614.7, 209.9], [-614.8, 210.6], [-623.4, 209.7], [-624.7, 221.8], [-605.4, 223.9], [-603.8, 209.0], [-607.1, 208.7], [-607.4, 209.9],
        [-610.8, 209.5], [-610.9, 210.3]] },
    { id: 'stair', style: 'rough', top: 10.41, line: 9.6,
      ring: [[-605.3, 189.5], [-607.6, 189.3], [-609.7, 191.0], [-609.9, 193.2], [-608.0, 195.5], [-606.1, 195.4], [-604.7, 194.4], [-604.4, 194.2],
        [-603.9, 191.5]] },
    // the annex at the north-east corner (batch 23, outside OpenStreetMap's footprint)
    { id: 'annex', style: 'rough', top: 6.73, line: 6.6,
      ring: [[-608.6, 189.1], [-610.3, 188.9], [-609.9, 185.0], [-609.8, 184.0], [-607.1, 184.4], [-607.6, 189.2]] }
  ],
  // The restaurant's front (its north and west walls below), glazed from the ground up to `glassTo`, the dark fascia
  // with the lettering from y0 to y1
  restaurant: { glassTo: 3.8, fascia: [5.1, 6.5] },
  // The restaurant's north front (a → b as wallFrame wants it: east to west) and its west front on the Promenade
  // (north to south): the entrance's doors and the canopy over them (s m along, its width, depth, height)
  north: { a: [-609.8, 183.6], b: [-635.0, 180.9] },
  west: { a: [-635.0, 180.9], b: [-637.0, 200.5], doors: { s: 12.5, w: 3.2 }, canopy: { s: 12.5, w: 7.0, out: 2.2, y: 3.95, thick: 0.28 } },
  // The old block's north face over the restaurant's roof (east to west): the name painted on a panel at its east end,
  // kept free of windows ([from, to] m along it; the panel's heights)
  nameWall: { a: [-621.2, 192.5], b: [-634.1, 191.1], clear: [0.5, 6.1], panel: { y0: 8.0, y1: 13.6 } },
  // The old block's south front (west to east, its middle bay standing out 1.1 m): the gilt letters and the post horn
  // on a steel frame on the roof, `o` m in from this line, s m along it; the balconies on the middle bay
  south: {
    a: [-637.1, 220.8], b: [-624.8, 222.2],
    sign: { s0: 0.7, s1: 11.7, o: -1.3, y0: 16.15, y1: 17.75, horn: { s: 7.2, w: 1.9, y0: 17.85, y1: 19.05 }, posts: 5 },
    balcony: { a: [-633.4, 222.4], b: [-627.8, 223.0], out: 1.3, rail: 1.0, floors: [7.2, 10.6] },
    // the Pöstli Corner's awnings over the ground floor's windows (this front and the west front's southern bays)
    awning: { y: 3.35, drop: 0.55, out: 1.1 }
  },
  // The garage's mouth in the rear wing's east face on the yard (south to north): s m along, its width and height
  garage: { a: [-605.4, 223.9], b: [-603.8, 209.0], s: 7.4, w: 7.0, h: 3.2 },
  // The eaves round the old block's roof: out from the walls, their band's height
  eaves: { out: 1.0, y0: 15.4, y1: 15.85 }
};

/** A part by its id */
export const part = (id) => HOTEL_POST_MOROSANI.parts.find((p) => p.id === id);

/** The part of the hotel a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of HOTEL_POST_MOROSANI.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** The floors' tops of the old block (the ground floor's and the three over it) */
export const oldFloors = () => { const O = HOTEL_POST_MOROSANI.old; return [O.gf, O.gf + O.storey, O.gf + 2 * O.storey, O.gf + 3 * O.storey]; };

/** Is the wall a → b (either way round) one of the restaurant's street fronts (its north or its west front)? */
export function isRestaurantFront(a, b) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
  return [HOTEL_POST_MOROSANI.north, HOTEL_POST_MOROSANI.west].some((W) => (near(a, W.a) && near(b, W.b)) || (near(a, W.b) && near(b, W.a)));
}

/** Is the wall (its frame) on the old block's street sides (west or south), where its ground floor has windows? */
export const isStreetSide = (F) => F.n[0] < -0.7 || F.n[1] > 0.7;

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** The stretches of a wall a → b kept free of windows ([from, to] m along it): the name's panel */
export function clearStretches(a, b) {
  const W = HOTEL_POST_MOROSANI.nameWall, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (near(W.a, a) && near(W.b, b)) return [W.clear];
  if (near(W.a, b) && near(W.b, a)) return [[len - W.clear[1], len - W.clear[0]]];
  return [];
}

/** A wall cut into its stretches: [{ from, to, windows }] */
export function wallStretches(a, b, windows = true) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!windows) return [{ from: 0, to: len, windows: false }];
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

/** The outlines the player's walls stand on at the ground (js/landmarks.js SURVEYED_FOOTPRINTS): every volume's */
export const groundOutlines = () => HOTEL_POST_MOROSANI.parts.map((p) => p.ring);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
