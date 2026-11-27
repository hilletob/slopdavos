// The Pischa terminal on the Talstrasse in Davos Dorf (js/pischa-terminal.js): the small flat-roofed pavilion by the
// car park where the Pischa bus stops, over the stairs down into the footway under the Talstrasse. Its south-west end
// stands open on the stair head; the long side on the road carries poster vitrines between white piers.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1753/1022, batch 1): a flat roof over walls of 3.7 × 8.1 m, the roof about half a
// metre out over them all round (the walls below are its points at the ground, the roof's edge follows from the eaves
// and is tested against its ring). OpenStreetMap has no building here, only the way the pavilion stands over: the steps
// w854855706 (layer −1) from its south-west end down north-east along its length into the footway w37090166 under the
// Talstrasse; the footway w854855708 leaves the stair head round the west corner and runs along the north-west side.
// The height is the photographs', not the survey's: the survey's roof lies at y 3.52 (6.5 m over the ground), but the
// photos (2013–2015) show a pavilion some 3.5–4.5 m high (scaled against the cars parked by it; the tall spruces right
// behind it may have lifted the surveyed roof).
// The look after Mapillary's street views (CC BY-SA), all from the Talstrasse south-west of it looking north-east, the
// pavilion 27–32° by the bearings, left of the road beside the parked cars (the kiosk w1527538703 of js/pischa.js lies
// at 357–4°, out of these frames): 1489574358107855 (2013) and 471966840781651 (2013), 1931339623683203 (2015),
// 897857120792102 (2015), 260087815815389 (2014), 1158212667976374 (2015). They show the south-west end open between
// light timber posts under a light lintel, a rail across its left half, the dark stair head with a blue board with a
// white mountain line on its back wall (2015; in 2013 a blue "pischa" board hung under the eave instead), the deep
// dark timber fascia with two spot lamps, the south-east side at a slant: a white pier at the corner, a blue poster
// vitrine, more vitrines, and a red sign on the roof towards the north-east end (2015). The 2025 dashcam views
// (798736749239385, 738405785739709, from the north-west) are not used: a pale green box with roof lights stands in the
// line of sight, it may be this pavilion rebuilt or the kiosk's neighbour w1527538702. Guessed: the north-west and
// north-east sides (plain timber, a service door), the posters' content, the red sign's text, the far vitrines.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const PISCHA_TERMINAL = {
  key: 'pischa-terminal', // (js/landmarks.js SURVEYED_FOOTPRINTS: no OpenStreetMap building, the module's own key)
  // swissBUILDINGS3D's building (its centre): left out of the streamed tile
  exclude: [{ x: 729.1, z: -1364.4, r: 3 }],
  // The walls at the ground (world x, z): the survey's points at y −3.0
  ring: [[727.9, -1360.1], [733.1, -1366.3], [730.3, -1368.6], [725.1, -1362.5]],
  // the survey's roof outline, for the tests
  surveyRoof: [[724.4, -1362.4], [728.0, -1359.4], [733.8, -1366.3], [730.2, -1369.3]],
  // Heights over its floor (the floor a step over the highest ground along its walls): the walls up to the soffit, the
  // fascia over it up to the roof; the walls reach `foot` m under the lowest ground
  wall: 3.3, roof: 3.85, step: 0.06, foot: 0.6, thick: 0.2,
  plinth: 0.35, // the concrete plinth round the walls
  // The four sides (a on the left for someone standing before the wall), and how far the roof reaches out over each
  sides: {
    // the open end on the stair head, on the car park
    southwest: { a: [725.1, -1362.5], b: [727.9, -1360.1], eave: 0.53 },
    // the long side on the Talstrasse with the vitrines
    southeast: { a: [727.9, -1360.1], b: [733.1, -1366.3], eave: 0.54 },
    northeast: { a: [733.1, -1366.3], b: [730.3, -1368.6], eave: 0.48 },
    // along the footway
    northwest: { a: [730.3, -1368.6], b: [725.1, -1362.5], eave: 0.53 }
  },
  // The stair head behind the open end (m in from the south-west side): the landing, then the stairwell down to the
  // dark back wall; the posts at the corners, the lintel under the soffit, the rail across the left half of the opening
  // (s m from the west corner) and along the landing's edge
  hall: { landing: 1.1, depth: 2.7, post: 0.2, lintel: 0.22, rail: 1.0, frontRail: [0.2, 1.75] },
  // the blue board on the back wall (s from the west corner; y over the floor: low, down the stairs)
  board: { s0: 0.55, s1: 3.1, y0: 0.25, y1: 1.35 },
  // The south-east side's vitrines (s m from its south-west end): between the corner piers and thin posts
  piers: { end: 0.45, post: 0.2 },
  vitrine: { y0: 0.45, y1: 2.65, posters: ['mountain', 'timetable', 'event'] },
  // The north-west side: a service door towards the north end (s from its north end; guessed)
  door: { s0: 0.6, s1: 1.5, y1: 2.1 },
  // the spot lamps on the south-west fascia (s from the west corner) and the lamp under the stair head's ceiling
  spots: [0.9, 2.8],
  // The red sign on the roof towards the north-east end, facing south-west (m behind the south-west side; centred)
  sign: { back: 6.6, w: 1.7, y0: 0.35, y1: 1.0 }
};

const side = (k) => PISCHA_TERMINAL.sides[k];
/** The frame of a side (wallFrame of js/spital-data.js) */
export const sideFrame = (k) => wallFrame(side(k).a, side(k).b);

/** The floor: a step over the highest ground along the walls (`ground(x, z)`, js/terrain.js groundHeight); and the
 *  lowest ground */
export function floorOf(ground) {
  let hi = -Infinity, lo = Infinity;
  const ring = PISCHA_TERMINAL.ring;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (const t of [0, 0.25, 0.5, 0.75]) {
      const y = ground(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      hi = Math.max(hi, y); lo = Math.min(lo, y);
    }
  }
  return { floor: hi + PISCHA_TERMINAL.step, low: lo };
}

/** The roof's outline ([[x, z], …], outward like the walls): the four sides moved out by their eaves, met at the corners */
export function roofOutline() {
  const order = ['southwest', 'southeast', 'northeast', 'northwest'];
  const lines = order.map((k) => { const F = sideFrame(k); return { p: onWall(F, 0, side(k).eave), u: F.u }; });
  return order.map((_, i) => {
    const L = lines[(i + order.length - 1) % order.length], M = lines[i];
    const det = L.u[0] * -M.u[1] - L.u[1] * -M.u[0];
    const dx = M.p[0] - L.p[0], dz = M.p[1] - L.p[1];
    const t = (dx * -M.u[1] - dz * -M.u[0]) / det;
    return [L.p[0] + L.u[0] * t, L.p[1] + L.u[1] * t];
  });
}

/** Where a long side's wall meets a line `back` m in from the south-west side ([x, z]): k 'southeast' or 'northwest' */
export function alongLongSide(k, back) {
  const F = sideFrame(k), S = sideFrame('southwest');
  // the point a + u t of the long side whose distance in from the south-west side is `back`
  const p0 = k === 'southeast' ? side(k).a : side(k).b, dir = k === 'southeast' ? F.u : [-F.u[0], -F.u[1]];
  const d0 = -((p0[0] - S.a[0]) * S.n[0] + (p0[1] - S.a[1]) * S.n[1]);
  const rate = -(dir[0] * S.n[0] + dir[1] * S.n[1]);
  const t = (back - d0) / rate;
  return [p0[0] + dir[0] * t, p0[1] + dir[1] * t];
}

/** The outline the player's walls stand on at the ground: the walls, the open end replaced by the landing's edge (the
 *  rail over the stairwell; one walks onto the landing under the roof) */
export function groundOutline() {
  const r = PISCHA_TERMINAL.ring, back = PISCHA_TERMINAL.hall.landing;
  return [alongLongSide('southeast', back), r[1], r[2], alongLongSide('northwest', back)].map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]);
}

/** The vitrines along the south-east side: [{ s0, s1 }] m from its south-west end, three bays between the piers */
export function vitrines() {
  const F = sideFrame('southeast'), P = PISCHA_TERMINAL.piers, n = PISCHA_TERMINAL.vitrine.posters.length;
  const w = (F.len - 2 * P.end - (n - 1) * P.post) / n;
  return Array.from({ length: n }, (_, i) => { const s0 = P.end + i * (w + P.post); return { s0, s1: s0 + w }; });
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
