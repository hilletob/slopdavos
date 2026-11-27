// The Spar Davos Dorf (Bahnhofstrasse, 7260 Davos Dorf; js/spar-dorf.js): the red block on the corner of the
// Bahnhofstrasse, its corner house with the shop's entrance and the name, the east house along the street with the
// Amavita, and the middle house behind them with the shop's hall, the stair tower and the west slab. Their volumes,
// the floors' grids, which walls stand free and which against the others, the fronts with their glazing, doors,
// canopies and boards. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1753/1023): batch 20 (one flat roof over the corner house, the east house and the
// strip between the hall and the tower), batch 12 (the corner's porch), batches 7, 8, 14 and 18 (the middle house);
// the roofs' outlines and heights below are its flat roofs, each a prism down to the ground; heights in the world frame
// (y = m a.s.l. − 1558, js/davos-frame.js). The ground falls from y 5.9 behind the block (west, by the church) to 0.6 at
// the corner on the Bahnhofstrasse: from the street the front houses stand three tall floors high. OpenStreetMap:
// w1527538708 the corner house (its outline matches the survey), w117012172 the east house, w1527538707 the middle
// house (up to 1.1 m off the survey; the west slab, batch 8, lies outside it, before w1527538706's south-west wall).
//
// The look after Mapillary's street views. From the south (2014, 2021, 2026, over the junction at the Bahnhofstrasse's
// bend): the corner, its south-west wall mostly closed with the porch before it and the board "SPAR" with the shops'
// names over the porch's glazing; its south-east front on the street: the shops' glazing under a deep canopy and a band
// of glass on each of the two floors over it, running on along the east house. From the east (2019, over the junction
// at the car park): the east house's front on the car park, closed red with the board "SPAR" on it, the glazing and a
// band of glass in its left part; to its right the middle house's north block, lower in the picture, red with small
// windows, a door under a little canopy, and the tall stair tower over the roofs behind. The middle house's walls
// towards the church and the tower's door are guessed in that manner. The red pylon with the shops' names stands at
// the car park's corner by the east house (not built here).
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const SPAR_DORF = {
  // swissBUILDINGS3D's batches (their centres): left out of the streamed tiles
  exclude: [
    { x: 797.5, z: -1525.7, r: 3 }, // batch 20, the corner house, the east house and the strip between
    { x: 791.4, z: -1507.3, r: 3 }, // batch 12, the corner's porch
    { x: 795.3, z: -1538.3, r: 3 }, // batch 18, the shop's hall
    { x: 791, z: -1530.6, r: 3 }, // batch 14, the stair tower
    { x: 779, z: -1543.2, r: 3 }, // batch 8, the west slab
    { x: 802, z: -1545.3, r: 3 } // batch 7, the north block
  ],
  osm: 'w1527538707', // the middle house
  corner: 'w1527538708', // the corner house
  shop: 'n1086729164', // the Spar (js/shops-data.js): its sign gives way to the boards
  base: -0.5, // how far down the walls reach (under the street at the corner)
  // The two grids of floors: the front houses' tall floors with their bands of glass, the middle house's with small
  // windows (m up from a floor's foot; a window `half` m each side of its bay's middle)
  front: { storey: 4.3, bay: 1.5, lo: 0.95, hi: 3.45, half: 0.7 },
  back: { storey: 3.0, bay: 2.6, lo: 0.95, hi: 2.35, half: 0.55 },
  // The volumes, each a flat roof at `top` over its outline (world x, z). `house`: whose (the OSM footprint the player's
  // walls are registered under; the east house keeps OSM's, which matches the survey). `grid`: 'front' or 'back';
  // `floor`: the ground floor's foot (the lowest ground along it); `from`: the ground floor's top, where the floors'
  // grid begins; `line`: the top of the floors (whole storeys over `from`), over it the parapet or the tower's closed
  // head. Without `from`: one closed floor up to the roof (the hall, the strip, the porch)
  parts: [
    // the corner house on the Bahnhofstrasse: the shops' floor and two
    { id: 'corner', house: 'w1527538708', grid: 'front', top: 15.56, floor: 0.6, from: 5.9, line: 14.5,
      ring: [[795.3, -1529.3], [787.3, -1518.7], [780.6, -1523.9], [776.9, -1519.1], [793.8, -1506.1], [805.7, -1521.6]] },
    // the porch before the corner house's south-west wall, at the corner: the shop's entrance
    { id: 'porch', house: 'w1527538708', top: 6.81, floor: 0.5,
      ring: [[786.7, -1508.2], [788.3, -1510.3], [793.8, -1506.1], [792.1, -1504.0]] },
    // the east house along the street (w117012172: the Amavita, the Pet's Shop, topclean), the same front
    { id: 'east', house: 'w117012172', grid: 'front', top: 15.56, floor: 1.1, from: 5.9, line: 14.5,
      ring: [[802.1, -1538.0], [802.4, -1537.8], [797.5, -1531.5], [795.3, -1529.3], [805.7, -1521.6], [818.0, -1537.7], [807.8, -1545.5]] },
    // the strip between the hall and the tower under batch 20's roof (its edge at 13.5 there)
    { id: 'strip', house: 'w1527538707', top: 13.5, floor: 4.0,
      ring: [[797.5, -1531.5], [790.5, -1536.9], [788.6, -1534.4], [795.3, -1529.3]] },
    // the middle house: the north block, three floors over the car park
    { id: 'north', house: 'w1527538707', grid: 'back', top: 14.8, floor: 3.3, from: 8.0, line: 14.0,
      ring: [[793.1, -1545.0], [802.1, -1538.0], [807.8, -1545.5], [798.8, -1552.4], [796.0, -1548.8]] },
    // the shop's hall, one tall floor
    { id: 'hall', house: 'w1527538707', top: 9.17, floor: 3.4,
      ring: [[788.2, -1538.7], [793.1, -1545.0], [802.4, -1537.8], [797.5, -1531.5]] },
    // the stair tower: a ground floor, two floors, the lift's closed head
    { id: 'tower', house: 'w1527538707', grid: 'back', top: 17.25, floor: 5.3, from: 9.3, line: 15.3,
      ring: [[786.7, -1531.9], [788.6, -1534.4], [790.4, -1533.0], [795.3, -1529.3], [793.4, -1526.8]] },
    // the west slab towards the church, 3 m deep: a ground floor and three
    { id: 'west', house: 'w1527538707', grid: 'back', top: 18.17, floor: 5.6, from: 8.6, line: 17.6,
      ring: [[788.2, -1538.7], [790.5, -1536.9], [788.6, -1534.4], [767.3, -1550.8], [769.2, -1553.3]] }
  ],
  // What else stands against the walls: w1527538706, up to `top` (guessed: lower than the west slab's top two floors,
  // as the photograph from the east shows the tower's block over it)
  neighbours: [
    { id: 'w1527538706', top: 11.6,
      ring: [[798.7, -1552.1], [800.5, -1554.5], [796.5, -1557.5], [793.7, -1553.8], [778.6, -1565.1], [769.5, -1553.0], [788.5, -1538.7]] }
  ],
  // The fronts (a on the left for someone standing before the wall; m along it): the ground floor's glazing spans up to
  // `top`, the doors in them, the canopy, the board (`key`: its atlas cell), `clear`: stretches of the floors over the
  // ground floor kept closed (round a board)
  fronts: [
    // the corner house's front on the street (south-east), under the canopy from a few metres off the corner on
    { id: 'corner-street', a: [793.8, -1506.1], b: [805.7, -1521.6], top: 4.9,
      glazing: [{ s0: 0.6, s1: 19.1 }], doors: [{ s: 6.0, w: 2.0, h: 2.5 }, { s: 15.0, w: 2.0, h: 2.5 }],
      canopy: { s0: 3.2, s1: 19.45, out: 1.9, y: 5.05, thick: 0.28 } },
    // the east house's front on the street: the pharmacy's doors (js/missions-data-pharmacy.js, 8 m before them)
    { id: 'east-street', a: [805.7, -1521.6], b: [818.0, -1537.7], top: 4.9,
      glazing: [{ s0: 0.3, s1: 19.9 }], doors: [{ s: 13.2, w: 2.0, h: 2.5 }, { s: 4.5, w: 2.0, h: 2.5 }],
      canopy: { s0: 0, s1: 20.2, out: 1.9, y: 5.05, thick: 0.28 } },
    // the east house's front on the car park (north-east): the glazing in its left part, the board "SPAR" on the closed
    // right part
    { id: 'east-car-park', a: [818.0, -1537.7], b: [807.8, -1545.5], top: 4.9,
      glazing: [{ s0: 0.5, s1: 6.4 }], doors: [{ s: 3.6, w: 2.0, h: 2.5 }],
      board: { key: 'spar', s: 9.4, w: 4.6, y0: 6.5, y1: 7.95 }, clear: [6.6, 12.8] },
    // the corner house's south-west wall: closed over the porch, windows in its north-west part
    { id: 'corner-west', a: [776.9, -1519.1], b: [793.8, -1506.1], clear: [12.2, 21.3] },
    // the porch: its glazing and doors, the board "SPAR" with the shops' names over them
    { id: 'porch-west', a: [786.7, -1508.2], b: [792.1, -1504.0], top: 3.9,
      glazing: [{ s0: 0.35, s1: 6.45 }], doors: [{ s: 3.4, w: 2.2, h: 2.5 }],
      board: { key: 'names', s: 3.4, w: 6.2, y0: 4.35, y1: 6.45 } },
    { id: 'porch-south', a: [792.1, -1504.0], b: [793.8, -1506.1], top: 3.9, glazing: [{ s0: 0.3, s1: 2.4 }] },
    // the middle house's north block on the car park: a door under a little canopy
    { id: 'north-car-park', a: [807.8, -1545.5], b: [798.8, -1552.4], doors: [{ s: 5.6, w: 1.2, h: 2.3, solid: true }],
      canopy: { s0: 4.6, s1: 6.6, out: 1.0, y: 2.75, thick: 0.16 } },
    // the west slab towards the church (guessed): the ground floor's glazing either side of a pier, a door in each
    { id: 'west-church', a: [767.3, -1550.8], b: [788.6, -1534.4], top: 8.25,
      glazing: [{ s0: 1.0, s1: 12.9 }, { s0: 14.0, s1: 25.9 }], doors: [{ s: 7.0, w: 1.8, h: 2.2 }, { s: 20.0, w: 1.8, h: 2.2 }] },
    // the stair tower's door (guessed) under a small canopy
    { id: 'tower-door', a: [786.7, -1531.9], b: [793.4, -1526.8], doors: [{ s: 4.6, w: 1.3, h: 2.4, solid: true }],
      canopy: { s0: 3.4, s1: 5.8, out: 1.1, y: 2.9, thick: 0.18 } }
  ]
};

export const part = (id) => SPAR_DORF.parts.find((p) => p.id === id);
export const front = (id) => SPAR_DORF.fronts.find((f) => f.id === id);
/** The grid of a part's floors */
export const gridOf = (p) => SPAR_DORF[p.grid || 'back'];

/** The part of the block a point lies on (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of SPAR_DORF.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/**
 * How high a wall of part `p` (a → b, as outwardRing runs) stands covered by what stands against it: the highest roof
 * 0.6 m out of it at a quarter, the middle or three quarters of its length (another part, the neighbour), or −Infinity
 * where it stands free
 */
export function wallCover(p, a, b) {
  const F = wallFrame(a, b);
  let cover = -Infinity;
  for (const t of [0.25, 0.5, 0.75]) {
    const [x, z] = onWall(F, F.len * t, 0.6);
    for (const q of SPAR_DORF.parts) if (q !== p && pointInRing(q.ring, x, z)) cover = Math.max(cover, q.top);
    for (const n of SPAR_DORF.neighbours) if (pointInRing(n.ring, x, z)) cover = Math.max(cover, n.top);
  }
  return cover;
}

/** Where a part's windows begin on a wall covered up to `cover`: the first floor's foot at or over it (null: none) */
export function windowsFrom(p, cover) {
  if (p.from === undefined) return null;
  const st = gridOf(p).storey;
  const y = cover <= p.from ? p.from : p.from + Math.ceil((cover - p.from) / st - 1e-9) * st;
  return y < p.line - 0.01 ? y : null;
}

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (either way round) the wall `w` ({ a, b })? */
export const isWall = (w, a, b) => (near(w.a, a) && near(w.b, b)) || (near(w.a, b) && near(w.b, a));
/** The front on the wall a → b (as outwardRing runs), or null */
export const frontOn = (a, b) => SPAR_DORF.fronts.find((f) => near(f.a, a) && near(f.b, b)) || null;

/** The outlines the player's walls stand on, per OSM footprint (js/landmarks.js SURVEYED_FOOTPRINTS) */
export function surveyedFootprints() {
  const out = new Map();
  for (const p of SPAR_DORF.parts) {
    if (p.house === 'w117012172') continue; // (OSM's outline of the east house matches the survey)
    if (!out.has(p.house)) out.set(p.house, []);
    out.get(p.house).push(p.ring);
  }
  return out;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
