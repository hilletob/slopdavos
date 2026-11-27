// The house with the mansard and the red arcade on the Promenade, next to the Bristol in Davos Platz (js/promenade-mansard.js):
// the tall block under its slate mansard with the risalit in its north front, the higher block behind it to the west,
// the wings on the lane to the south, and the one-storey wing with the open arcade on the Promenade to the north; the
// floors' grid, the mansard's slopes and dormers, the arcades, the shops' boards. Pure data and frame maths, shared by
// the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1751/1017, batch 7, one building of 25.8 m from its lowest floor): the roofs'
// outlines and heights below are its flat roofs, each a prism down under the ground; heights in the world frame
// (y = m a.s.l. − 1558, js/davos-frame.js). The survey knows the mansard only as the flat at its top (y 27.86); its
// slopes, the eaves and the dormers are from the photographs. The Promenade runs past the east fronts at y 4.3–4.5; the
// ground climbs steeply west of x ≈ 497 to a terrace at y 9.5–10.5 along the west walls, so the low wing's roof
// (y 11.21) lies there less than a metre over the ground. OpenStreetMap's footprint is w118240343.
// Mapillary's five street views (2013 and 2015, from the Promenade north-east of the house, looking south-south-west)
// show its north and east sides: light grey plaster, four rows of windows in dark frames over a ground floor of round
// arches in a deep red band, the slate mansard with its round-headed dormers over a deep white cornice, the risalit in
// the middle of the north front rising into the mansard as a wall dormer, the low wing's arcade along the street, the
// "Free-Style" and "P → 20 m" boards on the short front between the two. The west, the south (the lane to the
// Bristol's garage) and the higher block's roof are not in any photograph and are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const PROMENADE_MANSARD = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: 496.5, z: -907.2, r: 3 },
  osm: 'w118240343',
  storey: 3.0,
  bay: 2.4,
  base: 2.5, // how far down the walls reach (under the Promenade, y 4.3)
  street: 4.3, // the Promenade's level along the east fronts
  floor1: 11.2, // the first floor's foot: the arcade's ground floor and its red band end here (the low wing's roof)
  eave: 20.2, // three floors over it: the cornice under the mansard
  // a window in its storey (m up from the floor's foot) and its half width
  win: { lo: 0.9, hi: 2.4, half: 0.6 },
  // The ground floor's red band along the street (and round the tall block): the arches spring at `spring`, the band
  // ends at `top` under the low wing's coping
  band: { spring: 7.4, top: 10.95 },
  // The volumes, each a prism from the base up to `top` over its outline (world x, z). `line`: a floor's top on the
  // windows' grid (none on the low wing); `windowsTo`: the last floor's top with windows, closed above. `mansard`: the
  // block's roof, its steep slopes from the eaves `d1` m in up to `brk`, the upper slopes `d2` m in up to the top, on the
  // walls `slope` lists (indices of the outline as given); the other walls rise straight to the top
  parts: [
    // the low wing on the Promenade: the shops under the open arcade, the bump with Free-Style's door by the block's
    // corner; its roof the terrace over the ground floor, level with the slope behind
    {
      id: 'arcade', top: 11.21,
      ring: [[500.4, -906.3], [504.5, -905.2], [504.4, -904.8], [505.4, -904.5], [506.6, -909.1], [502.1, -910.3], [504.9, -920.8], [492.7, -924.0],
        [488.6, -908.9], [492.4, -907.9], [492.6, -908.5], [495.6, -907.7], [495.8, -908.5], [500.7, -907.1]]
    },
    // the block under the mansard: the survey's roof at y 27.86 with its north front straightened behind the risalit
    // (the risalit is its own part) and the jogs under a metre in its east front and over the south-east wing dropped
    {
      id: 'block', top: 27.86, line: 20.2, windowsTo: 26.2,
      ring: [[492.6, -908.5], [504.5, -905.2], [503.4, -897.8], [498.9, -895.3], [498.4, -893.5], [491.6, -895.3], [492.1, -897.0], [489.7, -897.7],
        [490.2, -899.5], [491.8, -899.1], [492.2, -900.7], [493.0, -900.5], [493.4, -901.8], [494.8, -901.4], [495.5, -904.1], [491.7, -905.1]],
      mansard: { d1: 1.2, brk: 25.8, d2: 3.0, slope: [0, 1, 15] }
    },
    // the risalit in the middle of the north front: up through the eaves as a wall dormer, a slate hood over it
    { id: 'risalit', top: 23.9, line: 20.2, windowsTo: 23.2, ring: [[495.6, -907.7], [495.8, -908.5], [500.7, -907.1], [500.4, -906.3]] },
    // the higher block to the west, over the slope (flat-roofed, its top 2.2 m over the mansard's; guessed)
    {
      id: 'west', top: 30.06, line: 20.2, windowsTo: 29.2,
      ring: [[494.8, -901.4], [495.5, -904.1], [491.7, -905.1], [487.9, -906.1], [486.4, -900.5], [491.8, -899.1], [492.2, -900.7], [493.0, -900.5], [493.4, -901.8]]
    },
    // the wings on the lane to the south: two corner blocks one floor over the eaves, the stair between them (guessed)
    {
      id: 'south-east', top: 24.35, line: 20.2, windowsTo: 23.2,
      ring: [[498.4, -893.5], [498.9, -895.3], [501.5, -894.6], [502.4, -898.1], [503.4, -897.8], [503.6, -898.8], [503.9, -898.8], [501.6, -890.3], [497.5, -891.4], [498.1, -893.6]]
    },
    {
      id: 'south-west', top: 24.35, line: 20.2, windowsTo: 23.2,
      ring: [[489.7, -897.7], [492.1, -897.0], [491.6, -895.3], [491.9, -895.2], [491.3, -893.0], [488.1, -893.9], [489.6, -899.7], [490.2, -899.5]]
    },
    { id: 'stair', top: 27.13, line: 20.2, windowsTo: 26.2, ring: [[491.3, -892.9], [491.9, -895.2], [498.1, -893.6], [497.4, -891.2]] }
  ],
  // The open arcade along the low wing's east front (a: its south end at the bump, b: its north end), `n` arches between
  // square pillars `pillar` m wide; the shops' fronts `depth` m back under its ceiling; its north end opens in one arch
  arcade: { a: [502.1, -910.3], b: [504.9, -920.8], n: 4, pillar: 0.55, depth: 2.4, band: 0.5 },
  // The blind arches of the block's ground floor on the Promenade: shop windows `depth` m behind the band
  blind: [
    { part: 'block', a: [504.5, -905.2], b: [503.4, -897.8], n: 3 },
    { part: 'south-east', a: [503.9, -898.8], b: [501.6, -890.3], n: 3 }
  ],
  blindDepth: 0.3,
  // The bump by the block's corner: its north face with the parking sign, its east face with Free-Style's door and
  // board; finnis.ch's board over the arcade's southern arch
  bump: { north: { a: [506.6, -909.1], b: [502.1, -910.3] }, east: { a: [505.4, -904.5], b: [506.6, -909.1] } },
  boards: {
    parking: { wall: 'bumpNorth', s: 1.1, w: 0.85, y0: 6.15, y1: 7.2 },
    freestyle: { wall: 'bumpEast', s: 2.4, w: 2.6, y0: 7.5, y1: 8.0 },
    finnis: { wall: 'arcade', bay: 0, w: 2.1, y0: 9.05, y1: 9.5 }
  },
  // The dormers on the block's mansard: m along the walls of `slope` (by index of the block's outline), on the steep
  // slope (round-headed, white) and on the upper one (small)
  dormers: {
    lower: [[0, 1.8], [0, 10.4], [1, 3.75]], half: 0.55, from: 20.75, to: 22.9, front: 0.0, back: -1.15,
    upper: [[0, 6.75], [1, 3.75]], upperHalf: 0.38, upperFrom: 25.95, upperTo: 27.15
  },
  // The shops whose boards are drawn here (js/shops-data.js; their generic signs left out, js/shops.js)
  shops: ['n12919367406', 'n3287588697']
};

const P = PROMENADE_MANSARD;
/** A part by its id */
export const part = (id) => P.parts.find((p) => p.id === id);

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/**
 * The frame of the wall p – q of a ring (either way round), turned as outwardRing turns it (n out of the ring): null
 * if it is not a wall of the ring
 */
export function edgeFrame(ring, p, q) {
  const R = outwardRing(ring);
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length];
    if ((near(a, p) && near(b, q)) || (near(a, q) && near(b, p))) return wallFrame(a, b);
  }
  return null;
}

/** The index in outwardRing(ring) of the wall given by its index in the ring as written */
export function outwardIndex(ring, i) {
  const n = ring.length;
  return ringArea2(ring) < 0 ? i : (n - 2 - i + n) % n;
}

/**
 * The block's outline moved in by `ds[i]` m at each wall i of outwardRing(ring) (0: the wall stays): each corner where
 * the two moved walls meet (if they run nearly parallel, the vertex moved by the larger), its points one for one
 */
export function insetEdges(R, ds) {
  const n = R.length, F = R.map((a, i) => wallFrame(a, R[(i + 1) % n]));
  return R.map((p, i) => {
    const j = (i - 1 + n) % n, f0 = F[j], f1 = F[i], d0 = ds[j], d1 = ds[i];
    // the moved walls: a point and the direction of each
    const p0 = [f0.a[0] - f0.n[0] * d0, f0.a[1] - f0.n[1] * d0], p1 = [f1.a[0] - f1.n[0] * d1, f1.a[1] - f1.n[1] * d1];
    const cr = f0.u[0] * f1.u[1] - f0.u[1] * f1.u[0];
    if (Math.abs(cr) < 0.15) {
      const d = Math.max(d0, d1), m = d === d1 ? f1.n : f0.n;
      return [p[0] - m[0] * d, p[1] - m[1] * d];
    }
    const t = ((p1[0] - p0[0]) * f1.u[1] - (p1[1] - p0[1]) * f1.u[0]) / cr;
    return [p0[0] + f0.u[0] * t, p0[1] + f0.u[1] * t];
  });
}

/** The block's mansard: its outline turned outward, the insets per wall and the two moved outlines */
export function mansardRings() {
  const b = part('block'), M = b.mansard, R = outwardRing(b.ring);
  const slope = new Set(M.slope.map((i) => outwardIndex(b.ring, i)));
  const d1 = R.map((_, i) => (slope.has(i) ? M.d1 : 0)), d2 = R.map((_, i) => (slope.has(i) ? M.d2 : 0));
  return { R, slope, d1, d2, I1: insetEdges(R, d1), I2: insetEdges(R, d2) };
}

/**
 * The windows' layout on a wall `len` m long: centred (one window in its middle, `even` false) or paired (two either
 * side of its middle), whichever fits more windows `bay` m apart with `margin` m left at its ends; and their middles
 */
export function windowLayout(len, bay = P.bay, half = P.win.half, margin = 0.4) {
  const h = len / 2, edge = half + margin;
  const odd = h >= edge ? 2 * Math.floor((h - edge) / bay + 1e-9) + 1 : 0;
  const even = h >= bay / 2 + edge ? 2 * Math.floor((h - edge - bay / 2) / bay + 1 + 1e-9) : 0;
  const isEven = even > odd, count = Math.max(odd, even), at = [];
  for (let k = 0; k < count; k++) at.push(h + (k - (count - 1) / 2) * bay);
  return { even: isEven, count, at };
}

/** The pillars ([s0, s1] m along the wall) and the arches' openings between them of a row of `n` arches */
export function arches(len, n, pillar = P.arcade.pillar) {
  const open = (len - (n + 1) * pillar) / n, pillars = [], openings = [];
  for (let k = 0; k <= n; k++) pillars.push([k * (pillar + open), k * (pillar + open) + pillar]);
  for (let k = 0; k < n; k++) openings.push([pillars[k][1], pillars[k + 1][0]]);
  return { pillars, openings, open };
}

/** The arcade's frames: its east front and the north end's opening (from the corner pillar to the shops' wall) */
export function arcadeFrames() {
  const L = part('arcade').ring, A = P.arcade;
  const east = edgeFrame(L, A.a, A.b);
  const north = edgeFrame(L, A.b, [492.7, -924.0]);
  return { east, north };
}

/** The low wing's outline at the ground: its east wall on the shops' fronts under the arcade, not on the band */
export function arcadeGround() {
  const A = P.arcade, { east } = arcadeFrames();
  const inward = (q) => [q[0] - east.n[0] * A.depth, q[1] - east.n[1] * A.depth];
  return part('arcade').ring.map((q) => (near(q, A.a) ? inward(A.a) : near(q, A.b) ? inward(A.b) : q));
}

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the parts that reach the ground */
export const groundOutlines = () => [arcadeGround(), ...P.parts.filter((p) => p.id !== 'arcade' && p.id !== 'risalit').map((p) => p.ring)];

/** The part of the house a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of P.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** How high the other parts cover a wall of `self` from outside: the lowest roof over the points 0.3 m out of it */
export function coveredTo(self, F) {
  let lo = Infinity;
  const k = Math.max(2, Math.ceil(F.len / 0.5));
  for (let i = 0; i <= k; i++) {
    const s = Math.min(F.len - 0.05, Math.max(0.05, (F.len * i) / k)), [x, z] = onWall(F, s, 0.3);
    let top = -Infinity;
    for (const p of P.parts) if (p !== self && pointInRing(p.ring, x, z)) top = Math.max(top, p.top);
    lo = Math.min(lo, top);
  }
  return lo;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
