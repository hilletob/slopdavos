// The Central Sporthotel (Tobelmühlestrasse 5, 7270 Davos Platz; js/central-sporthotel.js): its volumes, the floors'
// grids, the balconies, the lettering and the hotel's crest. Pure data and frame maths, shared by the browser module and
// the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1745/1011, batch 4, one building of 30 m from its lowest floor to the lift's
// machine room): the roofs' outlines and heights below are its flat roofs, each a prism down to the ground; heights in
// the world frame (y = m a.s.l. − 1558, js/davos-frame.js). OpenStreetMap's footprint is w123382367. The ground falls
// from the lane on the west (y −7.5) to the car park on the east (−12.9); the Tobelmühlestrasse runs down along the
// south front, the Centralweg round the north and the east. The look after Mapillary's street views (CC BY-SA,
// 2013–2015): from the south-west corner (the podium in sand-coloured plaster with its round-arched windows, the
// "BÜNDNERSTÜBLI" and "RESTAURANT" on its band, "CENTRAL · PIANO BAR · RESTAURANT" by the entrance on the lane, the
// terrace on it behind a timber rail, the cream tower over it with its balconies, concrete fronts and dark timber rails,
// the red banner of the Bündnerstübli and the piano bar), and from the Tobelmühlestrasse below in the east (the
// podium's east front with six arches over the lower floor, the low glazed storey on it, the tower's closed east face
// with the crest and "CENTRAL SPORTHOTEL", balconies either side, the machine room on the roof).
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const CENTRAL = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: -501.4, z: -193.9, r: 3 },
  osm: 'w123382367',
  base: -14.0, // how far down the walls reach (under the car park on the east)
  // The podium's floors (absolute: the arched storey on the lane's level, the lower floor under it towards the east,
  // the band with the lettering over the arches up to the terrace)
  podium: { storey: 4.6, floor: -7.4, band: -2.8 },
  // The hotel's floors: 3 m each, the tower's five over the terrace (their tops at `line` − 3k)
  storey: 3.0,
  // The volumes, each a flat roof at `top` over its outline (world x, z). `kind`: whose wall material ('podium': the
  // arched storey; 'hotel': a window per bay and floor); `line` a floor's top on the hotel's grid; `from`: the walls
  // start there (a storey standing on a roof); `windows: false`: closed walls
  parts: [
    // the podium round the tower: restaurant, Bündnerstübli and the hall, the terrace on its roof
    { id: 'podium', kind: 'podium', top: -0.56,
      ring: [[-498.0, -194.4], [-499.7, -194.8], [-499.4, -196.2], [-487.9, -193.6], [-488.3, -191.7], [-478.1, -189.4], [-482.6, -168.9], [-489.8, -170.5],
        [-489.9, -170.0], [-499.6, -172.1], [-499.8, -170.9], [-511.3, -173.4], [-511.4, -172.8], [-524.2, -175.6], [-518.5, -201.4],
        [-517.8, -201.3], [-518.3, -198.7], [-516.8, -198.4], [-518.2, -190.7], [-516.4, -190.4], [-517.7, -184.4], [-519.4, -184.8], [-520.2, -180.4],
        [-503.3, -176.9], [-502.8, -179.3], [-502.0, -179.1], [-502.7, -176.1], [-484.9, -172.2], [-481.5, -187.4], [-497.1, -190.8], [-498.1, -186.8],
        [-499.6, -187.1]] },
    // the low glazed storey on the podium's east half (the wide windows over the arches), its skylight
    { id: 'pavilion', kind: 'hotel', top: 1.63, line: 2.1, from: -0.7,
      ring: [[-499.6, -187.1], [-498.1, -186.8], [-497.1, -190.8], [-481.5, -187.4], [-484.9, -172.2], [-502.7, -176.1], [-502.0, -179.1], [-502.8, -179.3], [-501.1, -187.3]] },
    { id: 'skylight', kind: 'glass', top: 3.57, from: 1.5, ring: [[-489.1, -182.2], [-494.6, -183.4], [-495.5, -179.5], [-489.9, -178.3]] },
    // the tower: five floors over the terrace, two more under it on the lane north of the podium
    { id: 'tower', kind: 'hotel', top: 14.62, line: 14.3,
      ring: [[-520.2, -180.4], [-503.3, -176.9], [-501.1, -187.3], [-499.6, -186.9], [-498.0, -194.4], [-499.7, -194.8], [-498.7, -199.6], [-498.0, -199.4],
        [-497.5, -201.6], [-497.2, -203.0], [-499.4, -203.5], [-509.7, -212.0], [-516.0, -210.0], [-518.3, -198.7], [-516.8, -198.4], [-518.2, -190.7],
        [-516.4, -190.4], [-517.7, -184.4], [-519.4, -184.8]] },
    { id: 'machine-room', kind: 'hotel', top: 17.48, line: 14.3, from: 14.4, windows: false, ring: [[-501.7, -199.7], [-503.0, -192.9], [-507.3, -193.7], [-506.0, -200.5]] },
    // the north wing on the Centralweg, a floor lower than the tower on the same grid
    { id: 'north-wing', kind: 'hotel', top: 12.28, line: 11.3,
      ring: [[-495.9, -210.8], [-497.3, -203.0], [-499.4, -203.5], [-509.7, -212.0], [-515.4, -210.2], [-514.0, -218.3], [-512.5, -219.0], [-511.4, -217.8],
        [-508.2, -219.2], [-499.9, -212.0], [-499.0, -212.6], [-498.3, -212.8], [-496.9, -211.6]] }
  ],
  // Walls named by their ends (a on the left for someone standing before the wall)
  walls: {
    // the podium's front on the lane (west): entrance, "CENTRAL · PIANO BAR · RESTAURANT", "BÜNDNERSTÜBLI"
    lane: { a: [-518.5, -201.4], b: [-524.2, -175.6] },
    // the podium's front on the Tobelmühlestrasse (south), its west stretch: "RESTAURANT"
    street: { a: [-524.2, -175.6], b: [-511.4, -172.8] },
    // the tower's closed east face with the crest
    crest: { a: [-499.6, -186.9], b: [-498.0, -194.4] },
    // the tower's face on the lane with the banner
    banner: { a: [-516.8, -198.4], b: [-518.2, -190.7] }
  },
  // The lettering on the podium's band (m along the wall, heights)
  signs: [
    { wall: 'lane', key: 'central', from: 0.6, to: 10.6, y0: -2.15, y1: -1.2 },
    { wall: 'lane', key: 'stuebli', from: 14.0, to: 23.0, y0: -2.25, y1: -1.1 },
    { wall: 'street', key: 'restaurant', from: 4.4, to: 10.8, y0: -2.15, y1: -1.2 }
  ],
  // The entrance on the lane: a door under one of the arches, `at` m along the wall (the nearest bay takes it); its foot
  entrance: { wall: 'lane', at: 10.8, foot: -7.6 },
  crest: { w: 4.2, y0: 8.6, y1: 12.8 },
  // the banner hangs over three floors; the stretch behind it keeps no windows
  banner: { from: 0.7, to: 4.3, y0: 2.3, y1: 11.9, clear: [0.3, 4.7] },
  // The balconies: along these walls of the tower and the north wing, at the floors' feet listed (the hotel's grid),
  // (`to`: m along the wall where they end, short of the podium), `out` m deep, the front's concrete parapet and the
  // timber rail on it, `inset` m short of the wall's ends
  balcony: { out: 1.35, parapet: 0.55, rail: 1.05, inset: 0.25 },
  balconies: [
    { a: [-520.2, -180.4], b: [-503.3, -176.9], floors: [2.3, 5.3, 8.3, 11.3] }, // the tower's south face
    { a: [-503.3, -176.9], b: [-501.1, -187.3], floors: [2.3, 5.3, 8.3, 11.3] }, // the east face south of the crest
    { a: [-499.7, -194.8], b: [-498.7, -199.6], floors: [2.3, 5.3, 8.3, 11.3] }, // the east face north of it
    { a: [-519.4, -184.8], b: [-520.2, -180.4], floors: [2.3, 5.3, 8.3, 11.3] }, // the lane's side: the south corner
    { a: [-516.4, -190.4], b: [-517.7, -184.4], floors: [2.3, 5.3, 8.3, 11.3] },
    { a: [-516.0, -210.0], b: [-518.3, -198.7], floors: [2.3, 5.3, 8.3, 11.3] }, // north of the podium
    { a: [-516.0, -210.0], b: [-518.3, -198.7], floors: [-0.7], to: 8.4 }, // (on the terrace's level: clear of the podium)
    { a: [-514.0, -218.3], b: [-515.4, -210.2], floors: [-0.7, 2.3, 5.3, 8.3] } // the north wing's end on the lane
  ]
};

export const part = (id) => CENTRAL.parts.find((p) => p.id === id);

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;

/** The stretches of the wall a → b kept free of windows ([from, to] m along it): behind the banner */
export function clearStretches(a, b) {
  const W = CENTRAL.walls.banner, c = CENTRAL.banner.clear;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (near(W.a, a) && near(W.b, b)) return [[c[0], c[1]]];
  if (near(W.a, b) && near(W.b, a)) return [[len - c[1], len - c[0]]];
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

/** Is the wall a → b closed (the crest's face)? */
export const isClosed = (a, b) => { const W = CENTRAL.walls.crest; return (near(W.a, a) && near(W.b, b)) || (near(W.a, b) && near(W.b, a)); };

/** The part of the hotel a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of CENTRAL.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** How high the hotel stands over a point just outside a wall of `self` (another part's roof, or −Infinity) */
export function coverAt(self, x, z) {
  let top = -Infinity;
  for (const p of CENTRAL.parts) if (p !== self && pointInRing(p.ring, x, z)) top = Math.max(top, p.top);
  return top;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
