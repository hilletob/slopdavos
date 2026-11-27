// The house of Sport Hofmänner (Mattastrasse, 7270 Davos Platz; js/hofmaenner.js): its volumes, the floors' grid,
// which stretch of every wall stands free of the lower and higher volumes round it, the shop's entrance on the
// Mattastrasse, the loggias and balconies of the tower, the boards on the car park. Pure data and frame maths, shared
// by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1747/1008, batch 3, the whole complex, no neighbour in it): the roofs' outlines
// and heights below are its flat roofs, each a prism; heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js). The ground round it is nearly level, y −22.3 to −23.1 (the car park on the Landwasser to the
// north-west, the Mattastrasse along the south-west and south). OpenStreetMap's footprint is w124794963 (up to 1.1 m off
// the surveyed walls). The look after Mapillary's street views of 2019 (CC BY-SA) from across the Landwasser, north-west
// of the house: the tower in ochre plaster with dark windows, a stack of loggias with dark timber rails in its recess
// and balconies on its south-west corner, a dark eaves band and the dark attic set back over it; the low wings on
// both sides of it in dark brown timber, the shops' glazing along the car park under a tall dark band with the ARGO
// shops' boards (ARGOlada on the tower's foot, ARGOwäscherei on the south-west wing), the entrance under a canopy in the
// tower's recess. The Mattastrasse's side (Sport Hofmänner's entrance, js/missions-data-resort.js), the east and the
// roofs are guessed in the same language.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const HOFMAENNER = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: -242.3, z: 159.8, r: 3 },
  osm: 'w124794963',
  shop: 'n4068557218', // Sport Hofmänner (js/shops-data.js): its generic sign gives way to the board drawn here
  base: -23.6, // how far down the walls reach (under the car park)
  storey: 2.85, // the tower's floors
  // The volumes, each a flat roof at `top` over its outline (world x, z), its walls from `from` (the base, or the roof
  // it stands on) up. `kind`: 'low' the wings (the shops' glazing, the dark band over it), 'tower' (a dark foot, five
  // floors of ochre plaster to `line`), 'upper' and 'attic' (one floor of dark timber with windows over the roof before
// it, or over `from`),
  // 'head' (a closed stair head)
  parts: [
    // the south-west wing along the Mattastrasse and the car park
    { id: 'south-wing', kind: 'low', from: -23.6, top: -14.25,
      ring: [[-252.9, 157.0], [-255.3, 155.2], [-258.7, 159.4], [-267.6, 152.4], [-277.3, 164.7], [-273.5, 167.7], [-275.8, 170.7], [-272.9, 172.9],
        [-274.9, 175.4], [-267.0, 181.7], [-268.2, 183.2], [-264.6, 186.0], [-264.2, 185.6], [-261.1, 187.9], [-261.0, 187.7], [-259.6, 185.9],
        [-260.0, 185.6], [-258.8, 184.1], [-251.4, 189.8], [-252.3, 190.9], [-248.2, 194.1], [-247.4, 193.1], [-247.0, 193.4], [-246.8, 193.6],
        [-244.8, 195.2], [-242.4, 192.2], [-239.2, 193.4], [-231.7, 183.8], [-232.1, 176.8], [-234.9, 174.5], [-235.8, 175.8], [-239.6, 172.8],
        [-240.6, 174.2], [-243.4, 170.9], [-242.9, 170.2], [-245.8, 167.9], [-243.4, 164.8], [-245.6, 163.1], [-246.3, 164.0], [-249.9, 160.5],
        [-253.8, 158.1]] },
    // the strip round the north-east block, along the car park and the east
    { id: 'north-wing', kind: 'low', from: -23.6, top: -14.25,
      ring: [[-225.5, 164.5], [-226.4, 163.8], [-224.1, 160.9], [-228.8, 157.2], [-219.5, 145.3], [-226.6, 139.8], [-228.7, 142.6], [-237.2, 135.9],
        [-235.0, 133.2], [-242.0, 127.7], [-251.2, 139.5], [-255.1, 136.5], [-244.7, 123.2], [-230.5, 134.3], [-229.5, 133.1], [-222.9, 138.3],
        [-224.0, 139.7], [-207.3, 152.7], [-221.5, 170.8], [-227.3, 166.3]] },
    // the lower strip along the east and the south corner on the Mattastrasse, where Sport Hofmänner's door is
    { id: 'east-strip', kind: 'low', from: -23.6, top: -15.26,
      ring: [[-229.8, 168.1], [-234.9, 174.5], [-232.1, 176.8], [-231.7, 183.8], [-239.2, 193.4], [-242.4, 192.2], [-244.0, 194.2], [-238.2, 196.5],
        [-229.1, 184.8], [-230.1, 177.4], [-227.3, 173.8], [-227.9, 173.3], [-226.4, 171.5], [-222.9, 174.2], [-220.4, 171.0], [-221.2, 170.4],
        [-221.5, 170.8], [-227.3, 166.3], [-229.4, 168.3]] },
    // the north-east block: a floor of dark timber over the strip round it (its foot hidden by the strip and the tower)
    { id: 'north-block', kind: 'upper', from: -23.6, top: -11.28,
      ring: [[-243.7, 141.2], [-245.8, 143.8], [-251.2, 139.5], [-242.0, 127.7], [-235.0, 133.2], [-237.2, 135.9], [-228.7, 142.6], [-226.6, 139.8],
        [-219.5, 145.3], [-228.8, 157.2], [-233.1, 153.8], [-234.0, 155.0], [-235.0, 154.3], [-232.0, 150.4], [-236.2, 147.1], [-236.5, 147.4],
        [-240.0, 144.7], [-239.7, 144.3]] },
    // the tower: from the car park (its north-west face) and from the wings' roofs to the eaves
    { id: 'tower', kind: 'tower', from: -23.6, top: -3.41, line: -3.45,
      ring: [[-242.9, 170.2], [-245.8, 167.9], [-243.4, 164.8], [-245.6, 163.1], [-246.3, 164.0], [-249.9, 160.5], [-253.8, 158.1], [-252.9, 157.0],
        [-255.3, 155.2], [-258.7, 159.4], [-268.9, 151.4], [-266.6, 148.5], [-265.4, 149.4], [-260.6, 143.3], [-260.8, 143.2], [-261.2, 142.9],
        [-258.4, 138.0], [-257.1, 138.9], [-255.2, 136.4], [-245.8, 143.8], [-243.7, 141.2], [-239.7, 144.3], [-240.0, 144.7], [-236.5, 147.4],
        [-236.2, 147.1], [-232.0, 150.4], [-235.0, 154.3], [-234.0, 155.0], [-233.1, 153.8], [-224.1, 160.9], [-226.4, 163.8], [-225.6, 164.5],
        [-229.4, 168.3], [-229.8, 168.1], [-235.8, 175.8], [-239.6, 172.8], [-240.6, 174.2], [-243.4, 170.9]] },
    // the attic set back on the tower (the survey's roof at −0.65 with the two stair heads cut out of it)
    { id: 'attic', kind: 'attic', from: -3.41, top: -0.65,
      ring: [[-228.7, 161.6], [-234.4, 157.2], [-234.1, 156.8], [-234.3, 156.6], [-234.2, 156.4], [-238.1, 153.3], [-236.4, 151.3], [-243.6, 145.6],
        [-244.9, 147.3], [-247.3, 145.4], [-247.8, 146.0], [-254.8, 140.5], [-262.9, 150.7], [-257.9, 154.6], [-255.5, 151.5], [-239.0, 164.4],
        [-241.5, 167.5], [-236.4, 171.5]] },
    { id: 'head-west', kind: 'head', from: -0.65, top: 1.81, ring: [[-249.9, 144.4], [-254.1, 149.8], [-251.4, 151.9], [-247.2, 146.5]] },
    { id: 'head-east', kind: 'head', from: -0.65, top: 1.91,
      ring: [[-239.5, 157.4], [-241.5, 159.9], [-238.4, 162.3], [-234.1, 156.8], [-236.6, 154.8], [-239.0, 157.8]] }
  ],
  // The wings' ground floor: the shops' glazing from a little over the ground up to `glass`, the dark band over it to
  // the roof; the tower's foot: glazing to `glass`, its dark band to `foot`, where the ochre floors begin
  low: { glass: -18.6 },
  tower: { glass: -19.4, foot: -17.7 },
  // A window in its storey (m up from the floor's foot), its half width, the bay along the walls
  win: { lo: 0.9, hi: 2.3, half: 0.62 },
  bay: 3.2,
  // Sport Hofmänner's entrance on the Mattastrasse: the east strip's south face (a on the left for someone standing
  // before it); the doors at `s` m along it, the canopy over them, the board on the band over the glazing
  entrance: { a: [-244.0, 194.2], b: [-238.2, 196.5], s: 5.1, w: 1.8, y1: -20.2, canopy: { s0: 3.6, s1: 6.3, out: 1.5, y: -19.95 },
    board: { s: 2.9, w: 4.4, y0: -18.35, y1: -17.45 } },
  // The tower's entrance from the car park under a canopy in the recess of its north-west face
  porch: { a: [-260.6, 143.3], b: [-265.4, 149.4], canopy: { s0: 0.3, s1: 7.5, out: 2.1, y: -19.6 } },
  // The ARGO shops' boards on the car park (a, b a wall, `s` the board's middle along it)
  boards: [
    { key: 'lada', a: [-266.6, 148.5], b: [-268.9, 151.4], s: 1.85, w: 2.9, y0: -19.15, y1: -18.4 },
    { key: 'wasch', a: [-267.6, 152.4], b: [-277.3, 164.7], s: 8.5, w: 4.4, y0: -17.9, y1: -17.15 }
  ],
  // The tower's balconies: `out` m before the wall a → b (a loggia's: to the face beside it), from s0 to s1 along it, a
  // slab and a rail at the foot of every tower floor that stands free of the wings' roofs; `wall`: the loggia's back wall
  // dark timber
  balconies: [
    { a: [-260.6, 143.3], b: [-265.4, 149.4], s0: 0, s1: 7.8, out: 0.8, wall: true },
    { a: [-255.3, 155.2], b: [-252.9, 157.0], s0: 0, s1: 3.0, out: 1.3, wall: true },
    { a: [-245.6, 163.1], b: [-243.4, 164.8], s0: 0, s1: 2.8, out: 1.0, wall: true },
    { a: [-266.6, 148.5], b: [-268.9, 151.4], s0: 0.2, s1: 3.5, out: 1.3 },
    { a: [-268.9, 151.4], b: [-258.7, 159.4], s0: 0.2, s1: 4.2, out: 1.3 },
    { a: [-235.8, 175.8], b: [-229.8, 168.1], s0: 2.4, s1: 9.2, out: 1.3 }
  ],
  rail: 1.0
};

export const part = (id) => HOFMAENNER.parts.find((p) => p.id === id);
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b a wall of the part, in its outward order (a on the left seen from outside)? */
export function isOutwardWall(p, a, b) {
  const r = outwardRing(p.ring);
  return r.some((q, i) => near(q, a) && near(r[(i + 1) % r.length], b));
}

/** The highest roof standing round (x, z) of the parts other than `self` that reach up from under its top, or null */
export function coverAt(self, x, z) {
  let top = null;
  for (const q of HOFMAENNER.parts) {
    if (q === self || q.from >= self.top || !pointInRing(q.ring, x, z)) continue;
    if (top === null || q.top > top) top = q.top;
  }
  return top;
}

/**
 * A wall a → b of part `p` cut where the volumes before it change: [{ from, to, y0, ground }], s along the wall, y0
 * where it stands free (the part's own foot, or the roof of the lower volume before it); stretches hidden by a volume
 * as high as the part are left out. `ground`: free down to the ground (the shops' glazing).
 */
export function wallStretches(p, a, b) {
  const F = wallFrame(a, b);
  const cover = (s) => coverAt(p, ...onWall(F, s, 0.3));
  // (sampled every half metre, each change found to a centimetre between its samples: no slit between the stretches)
  const n = Math.max(1, Math.ceil(F.len / 0.5)), at = (i) => F.len * (i + 0.5) / n;
  const cuts = [0], covers = [cover(at(0))];
  for (let i = 1; i < n; i++) {
    const c = cover(at(i));
    if (c === covers[covers.length - 1]) continue;
    let lo = at(i - 1), hi = at(i);
    while (hi - lo > 0.01) { const m = (lo + hi) / 2; if (cover(m) === c) hi = m; else lo = m; }
    cuts.push((lo + hi) / 2); covers.push(c);
  }
  cuts.push(F.len);
  const out = [];
  covers.forEach((c, i) => {
    if (c !== null && c >= p.top - 0.01) return;
    const y0 = c === null ? p.from : Math.max(p.from, c);
    out.push({ from: cuts[i], to: cuts[i + 1], y0, ground: c === null && p.from <= HOFMAENNER.base + 0.01 });
  });
  return out;
}

/** The outlines the walls stand on at the ground (the player's walls): the wings, the north-east block, the tower */
export const groundOutlines = () => HOFMAENNER.parts.filter((p) => p.kind !== 'attic' && p.kind !== 'head').map((p) => p.ring);

/** The part a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of HOFMAENNER.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
