// The Hotel Schweizerhof Morosani (Promenade 50, 7270 Davos Platz; js/schweizerhof.js) and the house south of it
// (the UBS's, OpenStreetMap w123380397, which the same surveyed building holds): their volumes, the floors' grids, the
// arcade along the Promenade, the entrance porch, the balconies of the tall block, the lettering. Pure data and frame
// maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1744/1008, batch 15, hotel and south house as one building): the roofs' outlines
// and heights below are its flat roofs, each a prism down under the ground; heights in the world frame
// (y = m a.s.l. − 1558, js/davos-frame.js). The Promenade along the west fronts lies at y −0.8 to −1.2, the
// Guggerbachstrasse along the north falls from −1.8 to −7, the yard and the lane on the east lie at −4 to −9.
// OpenStreetMap's footprints are w123380406 (the hotel) and w123380397. The look after Mapillary's street views of
// 2013–2015 (CC BY-SA): from the Guggerbachstrasse (north) the low annexes in pale plaster with plain windows and a
// balcony on the north wing; from the Promenade (south) the UBS's house with its grey concrete posts, the windows in
// brown timber frames between white bands, the hotel's board "Morosani Schweizerhof" on it, and beyond it the hotel's
// front along the street: shops under a first floor that stands out over the pavement, a terrace with the second
// floor set back over it. The tall block's south face over the yard is not on any photograph (guessed: white plaster,
// balconies along it).
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const SCHWEIZERHOF = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles (the SAMD's batch is 70 m east)
  exclude: { x: -596.5, z: 93.4, r: 3 },
  osm: 'w123380406',
  base: -10.5, // how far down the walls reach (under the lane east of the hotel)
  // Two grids of floors: the hotel's (white plaster) and the south house's (concrete posts, timber windows)
  storey: { hotel: 2.9, modern: 3.3 },
  // The volumes, each a flat roof at `top` over its outline (world x, z). `line`: a floor's top on the part's grid;
  // `windows: false`: closed walls; `collide`: outside OpenStreetMap's footprints, so its walls are colliders;
  // `shop`: the modern parts' glazed ground floor on the Promenade, up to this height
  parts: [
    // the north wing on the corner of the Promenade and the Guggerbachstrasse: the ground floor and two over it (its
    // west wall on OpenStreetMap's line, where the pizzeria's sign hangs: the survey's corner lay 0.7 m out)
    { id: 'north-wing', style: 'hotel', top: 7.72, line: 7.42,
      ring: [[-604.3, 54.2], [-607.2, 53.7], [-606.5, 49.2], [-610.8, 48.5], [-611.3, 51.9], [-617.7, 50.8], [-617.8, 51.5], [-619.0, 51.3], [-616.3, 37.9], [-602.1, 40.3]] },
    // the annexes along the Guggerbachstrasse, stepping down with it (outside the hotel's footprint)
    { id: 'annex-west', style: 'hotel', top: 6.23, line: 5.93, collide: true,
      ring: [[-586.1, 46.9], [-587.4, 55.3], [-591.0, 54.6], [-597.1, 53.7], [-597.3, 55.3], [-602.1, 54.5], [-604.3, 54.2], [-602.2, 40.7], [-599.6, 42.7], [-592.7, 43.7]] },
    { id: 'annex-mid', style: 'hotel', top: 4.15, line: 3.85, collide: true, ring: [[-573.4, 49.9], [-574.7, 57.6], [-587.4, 55.3], [-586.2, 47.8]] },
    { id: 'annex-east', style: 'hotel', top: 3.04, line: 2.74, collide: true,
      ring: [[-564.0, 62.2], [-565.9, 61.8], [-565.4, 59.4], [-574.7, 57.6], [-573.4, 50.0], [-562.7, 55.0]] },
    // the tall block: seven floors over the Promenade, nine over the yard; the strip along its north side a floor lower,
    // the lift's head on its roof
    { id: 'north-strip', style: 'hotel', top: 17.22, line: 16.92,
      ring: [[-571.5, 61.2], [-591.2, 57.9], [-590.7, 54.8], [-591.0, 54.6], [-565.4, 59.4], [-567.2, 68.6], [-567.5, 68.6], [-566.5, 63.0], [-571.7, 62.2]] },
    { id: 'tower', style: 'hotel', top: 20.2, line: 19.9,
      ring: [[-566.5, 63.0], [-568.4, 74.2], [-569.7, 73.9], [-570.2, 76.9], [-607.6, 69.8], [-605.4, 56.8], [-612.0, 55.7], [-610.8, 48.5], [-606.5, 49.2],
        [-607.2, 53.7], [-602.1, 54.5], [-602.7, 58.1], [-592.7, 59.8], [-592.1, 56.2], [-597.3, 55.3], [-597.1, 53.7], [-590.7, 54.8], [-591.2, 57.9],
        [-571.5, 61.2], [-571.7, 62.2]] },
    { id: 'head', style: 'hotel', top: 22.46, line: 22.16, windows: false, ring: [[-592.7, 59.8], [-602.7, 58.1], [-602.1, 54.5], [-592.1, 56.2]] },
    // the west block on the Promenade: six floors (the ground floor's foot under the street)
    { id: 'west-block', style: 'hotel', top: 17.93, line: 17.4,
      ring: [[-605.4, 56.8], [-612.0, 55.7], [-611.3, 51.9], [-617.7, 50.8], [-620.8, 68.0], [-604.8, 70.9], [-604.7, 70.4], [-607.6, 69.8]] },
    // the front along the Promenade: the body with its set-back second floor, and round it the band of the floors
    // under the terrace (its west side the arcade over the shops: SCHWEIZERHOF.arcade)
    { id: 'body', style: 'hotel', top: 10.24, line: 10.03,
      ring: [[-604.7, 70.4], [-604.8, 70.9], [-611.4, 69.7], [-612.4, 70.3], [-614.0, 71.8], [-614.6, 73.7], [-621.6, 72.9], [-626.2, 121.7], [-608.2, 123.4],
        [-603.7, 79.7], [-602.4, 79.8], [-601.5, 71.0]] },
    { id: 'band', style: 'hotel', top: 7.43, line: 7.13,
      ring: [[-611.4, 69.7], [-620.8, 68.0], [-620.1, 64.2], [-622.6, 64.0], [-628.0, 125.5], [-606.5, 127.4], [-602.4, 79.8], [-603.7, 79.7], [-608.2, 123.4],
        [-626.2, 121.7], [-621.6, 72.9], [-614.6, 73.7], [-614.0, 71.8], [-612.4, 70.3]] },
    // the east wing on the lane, and the low link between it and the tall block
    { id: 'east-link', style: 'hotel', top: 7.43, line: 7.13, ring: [[-571.5, 82.6], [-584.0, 80.1], [-583.0, 74.5], [-570.4, 76.9]] },
    { id: 'east-wing', style: 'hotel', top: 9.03, line: 8.73,
      ring: [[-571.0, 82.7], [-584.4, 80.0], [-587.2, 94.0], [-573.9, 96.6], [-573.1, 92.4], [-571.6, 92.7], [-570.5, 87.1], [-571.8, 86.8]] },
    // the south house (the UBS's): a low link to the hotel between the two footprints, a closed stair tower, the
    // house of four floors (its west wall on OpenStreetMap's line, where the bank's sign hangs)
    { id: 'link', style: 'modern', top: 7.12, line: 6.82, shop: 3.52, collide: true,
      ring: [[-616.2, 126.5], [-616.7, 131.7], [-619.4, 131.3], [-619.6, 132.8], [-628.0, 131.9], [-627.4, 125.6]] },
    { id: 'stair', style: 'modern', top: 16.45, line: 16.15, windows: false, collide: true, ring: [[-617.4, 142.8], [-620.8, 142.4], [-619.4, 131.3], [-616.1, 131.7]] },
    { id: 'south', style: 'modern', top: 14.19, line: 13.89, shop: 3.99,
      ring: [[-619.6, 132.8], [-628.1, 132.0], [-629.7, 146.9], [-603.3, 149.8], [-602.8, 145.2], [-598.1, 145.6], [-597.0, 135.1], [-616.2, 133.1], [-617.4, 142.8], [-620.8, 142.4]] }
  ],
  // The arcade along the Promenade: the band's west wall (a → b as wallFrame wants it: a the north end) stands out
  // over the pavement from the soffit up; the shops' glass and their fascia (where js/shops.js hangs the boards of
  // Angerer Sport and the Amavita, 4.5 m over the street) stand on `front`, OpenStreetMap's wall, under it
  arcade: { part: 'band', wall: [[-622.6, 64.0], [-628.0, 125.5]], front: [[-620.3, 64.1], [-626.8, 125.3]], fascia: 3.2, soffit: 4.6, street: -1.0 },
  // The hotel's entrance: a glazed porch of one tall floor on OpenStreetMap's bump before the west block (its east side
  // reaching into the block), the doors and the name on its front to the street
  porch: { ring: [[-618.0, 54.7], [-621.5, 54.6], [-622.4, 60.6], [-619.2, 61.0]], front: [[-621.5, 54.6], [-622.4, 60.6]], y0: -1.1, top: 4.4, fascia: 2.7,
    door: { w: 1.9, h: 2.55 }, name: { w: 5.6, y0: 3.05, y1: 3.95 } },
  // The balconies along the tall block's south face over the yard (a → b, m along it): a run over the yard on every
  // floor from the first, a run over the east link's roof on the floors above it (their slabs at the floors' feet)
  balconies: { a: [-607.6, 69.8], b: [-570.2, 76.9], runs: [{ s0: 7.4, s1: 24.0, floors: [-0.4, 2.5, 5.4, 8.3, 11.2, 14.1, 17.0] }, { s0: 26.0, s1: 36.8, floors: [8.3, 11.2, 14.1, 17.0] }],
    out: 1.4, rail: 1.0 },
  // The name in standing letters on the roofs: over the west block's front to the Promenade, over the tall block's
  // south face to the valley (a → b of the wall under them; the letters `w` × `h`, `back` m in from the edge)
  names: [
    { part: 'west-block', a: [-617.7, 50.8], b: [-620.8, 68.0], w: 13.0, h: 1.4, back: 0.5 },
    { part: 'tower', a: [-607.6, 69.8], b: [-570.2, 76.9], w: 15.0, h: 1.6, back: 0.6 }
  ],
  // The hotel's board on the south house's front to the Promenade, at its north end over the shops (m along the wall)
  board: { a: [-628.1, 132.0], b: [-629.7, 146.9], s0: 0.9, w: 4.0, y0: 4.9, h: 1.25 },
  // OpenStreetMap's footprints (the player's walls, js/buildings.js), for the tests
  footprints: {
    hotel: [[-570.7, 76.8], [-571.6, 82.4], [-570.9, 82.4], [-571.7, 86.7], [-570.5, 87], [-571.6, 92.6], [-572.7, 92.1], [-573.4, 96.5], [-586.9, 93.9], [-583.4, 77.1],
      [-601.4, 73.5], [-606.9, 127.1], [-626.8, 125.3], [-621.3, 72.4], [-620.8, 67.6], [-619.6, 61], [-622.4, 60.6], [-621.5, 54.6], [-619.8, 54.7], [-616.1, 37.5],
      [-602, 40], [-604.2, 53.6], [-592.3, 56.3], [-591.9, 54.8], [-590.4, 55.1], [-590.2, 54.3], [-565, 59.4], [-565.6, 63.2], [-566.2, 63.1], [-568.3, 74.7],
      [-567.7, 74.7], [-568.2, 77.2]],
    south: [[-628, 132.4], [-619.4, 133.4], [-619.2, 131.6], [-615.7, 132], [-615.9, 133.5], [-597.4, 135.7], [-598.5, 145.3], [-603.3, 144.7], [-603.9, 149.9], [-629.7, 146.8]]
  }
};

/** A part by its id */
export const part = (id) => SCHWEIZERHOF.parts.find((p) => p.id === id);

/** The part of the building a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of SCHWEIZERHOF.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** How far a point lies out of the arcade's shop front (m, towards the street; negative behind it) */
export function outOfFront([x, z]) {
  const F = wallFrame(...SCHWEIZERHOF.arcade.front);
  return (x - F.a[0]) * F.n[0] + (z - F.a[1]) * F.n[1];
}

/**
 * A wall of the arcade's part cut where it crosses the shop front: [{ from, to, open }] (m along it; `open`: the piece
 * out over the pavement, built from the soffit up). The arcade's wall itself is open its whole length.
 */
export function arcadePieces(a, b) {
  const F = wallFrame(a, b), da = outOfFront(a), db = outOfFront(b), e = 0.3;
  // (a wall along the front, or behind it: closed; one out over the pavement or ending on the front: open)
  if (Math.max(da, db) <= e) return [{ from: 0, to: F.len, open: false }];
  if (Math.min(da, db) >= 0) return [{ from: 0, to: F.len, open: true }];
  const s = (F.len * da) / (da - db);
  return da > 0 ? [{ from: 0, to: s, open: true }, { from: s, to: F.len, open: false }] : [{ from: 0, to: s, open: false }, { from: s, to: F.len, open: true }];
}

/** Do two walls of a ring cross (other than at their shared corners)? */
export function selfCrosses(ring) {
  const n = ring.length;
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = ring[i], b = ring[(i + 1) % n], c = ring[j], d = ring[(j + 1) % n];
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
    }
  }
  return false;
}

/** The middles of the windows' bays along a wall `len` m long (as the wall's material lays them out from its middle) */
export function bays(len, bay, winHalf) {
  const out = [], half = len / 2;
  for (let k = -Math.floor(half / bay) - 1; k <= Math.floor(half / bay) + 1; k++) if (Math.abs(k * bay) + winHalf + 0.4 <= half) out.push(half + k * bay);
  return out;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
