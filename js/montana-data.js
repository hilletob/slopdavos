// The Hotel Montana (Bahnhofstrasse, 7260 Davos Dorf, by the station; js/montana.js): its volumes, the roofs over the
// gabled blocks, the floors' grid, the restaurant's wing with its round-arched windows, the bar and the Stube before
// the street front, the lettering, the balconies, the dormers. Pure data and frame maths, shared by the browser module
// and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1753/1023, batches 2, 15, 16, 17 and 21): the outlines and heights below are its
// roofs; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The hotel stands square to a frame
// turned 37° from north: its gabled blocks run north-east, the street front (the Bahnhofstrasse's turn by the station)
// faces north-east, the restaurant's wing reaches south-west along the street on its north-west side. The ground lies
// at y 1.2–1.5 along the street front, 0.6–1.0 along the wing and falls to −0.6 in the garden on the south.
// OpenStreetMap's footprint is w117012156 (it stands up to 1.1 m off the surveyed walls; the bar and the Stube, batch
// 21, lie partly outside it).
// The look after Mapillary's street views (CC BY-SA): from the west-south-west (2014) the wing's front on the street,
// cream plaster over a red-brown plinth, tall round-arched windows, "RESTAURANT MONTANA HOTEL BAR" on a pier, the
// north-east block's gable with its jerkinhead over it; from the north-east (2015, 2021) the street gable with a row of
// round-arched windows over the bar's roof, "MONTANA" over them, three windows a floor, balconies on the north-west
// side; from the north (2025) the bar's and the Stube's red-brown walls with white-framed windows, a white ledge, the
// Stube's door up its steps under the "Montana Stube" board. The garden side (south-east and south) is guessed: the
// veranda's glass, the balconies on the south block, the dormers on the slopes no photograph shows.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';
import { bays } from './seehof-data.js';

export const MONTANA = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [
    { x: 822.9, z: -1498.2, r: 3 }, { x: 828.2, z: -1514.0, r: 3 }, { x: 844.6, z: -1497.3, r: 3 },
    { x: 839.4, z: -1506.9, r: 3 }, { x: 839.0, z: -1517.0, r: 3 }
  ],
  osm: 'w117012156',
  // js/shops-data.js' hanging signs on it, which give way to its own lettering: the hotel, the bar, the Stube
  signs: ['n2282077534', 'n2282077533', 'n2282027482'],
  storey: 3.1,
  line: 19.8, // the top full floor's top, at the gabled blocks' eaves: the windows' grid counts down from it
  floor: 1.2, // the ground floor's foot (six floors up to the eaves, an attic in the gables)
  base: -1.5, // how far down the walls reach (under the garden)
  bay: 2.7, // a window's bay along the hotel's walls (three windows across a gable)
  arched: 3, // the floor (counted from the ground floor's 0) with round-arched windows, over the bar's roof
  // The volumes. `kind`: 'hotel' (the cream walls with the hotel's windows), 'hall' (the restaurant's wing: a tall
  // ground floor with round-arched windows, a floor over it), 'annex' (the bar and the Stube: red-brown, white-framed
  // windows), 'glazed' (the veranda); a flat roof at `top` over `ring`, or `roof` over a gabled block whose `ring` is
  // its four corners a, b, c, d: a → b and c → d its eaves (heights `eaves`), the ridge at `ridge` through the point
  // `through`, `hip`: a jerkinhead [the gables' top, how far in the ridge ends]
  parts: [
    // the restaurant's wing along the street on the north-west (batch 2), the strip before the south block with it
    { id: 'wing', kind: 'hall', top: 9.65,
      ring: [[825.3, -1501.0], [836.0, -1492.9], [834.9, -1491.4], [824.0, -1499.1], [810.5, -1481.1], [801.7, -1487.7], [818.4, -1510.0], [818.9, -1509.8], [826.8, -1504.0], [824.8, -1501.3]] },
    // the veranda in the garden (batch 2)
    { id: 'veranda', kind: 'glazed', top: 5.12, ring: [[821.0, -1495.2], [831.0, -1487.8], [834.1, -1491.9], [824.0, -1499.1]] },
    // the south block's flat roof under the gables (batch 2's two roofs at 19.3 and 19.4)
    { id: 'south', kind: 'hotel', top: 19.35, ring: [[827.9, -1505.5], [824.8, -1501.3], [842.4, -1488.2], [844.6, -1491.1], [836.6, -1497.1], [837.6, -1498.4]] },
    // the north-west block (batch 15): its gables to the street and over the wing, jerkinheads (its corners squared:
    // the survey's eaves run 0.5 m apart from parallel)
    { id: 'west', kind: 'hotel', ring: [[818.5, -1509.9], [829.2, -1524.1], [837.8, -1517.6], [827.2, -1503.4]],
      roof: { eaves: [19.8, 19.8], ridge: 25.6, through: [823.3, -1507.1], hip: [24.3, 0.7] } },
    // the cross wing (batch 17): its ridge across the north-west block's, its gable over that one's ridge
    { id: 'cross', kind: 'hotel', ring: [[824.9, -1508.0], [843.0, -1494.4], [850.5, -1504.4], [832.4, -1518.0]],
      roof: { eaves: [21.0, 20.4], ridge: 27.4, through: [828.0, -1512.2] } },
    // the south-east block (batch 16)
    { id: 'east', kind: 'hotel', ring: [[836.0, -1496.3], [844.4, -1507.5], [853.2, -1500.8], [844.8, -1489.6]],
      roof: { eaves: [20.8, 19.8], ridge: 26.2, through: [840.5, -1494.1] } },
    // the street front's flat-topped block (batch 17's flat roof), over the cross wing's ridge
    { id: 'tower', kind: 'hotel', top: 27.5, ring: [[846.6, -1498.5], [850.5, -1503.8], [844.4, -1508.4], [840.4, -1503.0]] },
    // the bar before the street gable and the Stube before the cross wing (batch 21), two floors
    { id: 'bar', kind: 'annex', top: 10.83, ring: [[836.3, -1515.8], [840.5, -1520.4], [838.1, -1523.9], [834.0, -1526.5], [830.6, -1522.8], [837.6, -1517.6]] },
    { id: 'stube', kind: 'annex', top: 10.39, ring: [[843.8, -1515.5], [847.4, -1509.5], [845.5, -1507.4], [835.5, -1514.8], [836.3, -1515.8], [840.3, -1520.1]] }
  ],
  // The restaurant's wing: its tall ground floor (the arched windows) up to `hall`, the floor over it to `upper`, the
  // cornice between them, a rail round its roof's terrace
  wing: { floor: 1.2, hall: 5.6, upper: 9.0, rail: 1.0 },
  // The bar and the Stube: their floor (the street's level), the ground floor's top, the white ledge over it (its depth)
  annex: { floor: 1.36, ground: 5.6, ledge: 0.7 },
  // The veranda's glass from its sill (over the garden) to under its roof
  veranda: { sill: 0.9, head: 4.65 },
  // The lettering, each on the wall of `part` nearest `at` (its middle), `w` wide from y0 to y1; `clear`: the ground
  // floor's stretch kept free of windows round it (m)
  letters: [
    // the wing's front on the street, the second pier from its south-west end (the photograph of 2014)
    { key: 'restaurant', part: 'wing', at: [805.9, -1493.3], w: 3.3, y0: 2.15, y1: 4.75, clear: 3.9 },
    // ... and its south-west end, between two arched windows
    { key: 'restaurant', part: 'wing', at: [806.1, -1484.4], w: 3.3, y0: 2.15, y1: 4.75, clear: 3.8 },
    // the street gable: the name over the arched windows, under the next floor's
    { key: 'name', part: 'west', at: [833.6, -1520.9], w: 6.4, y0: 13.25, y1: 14.25 }
  ],
  // The Stube's door up its steps from the street (the wall of the Stube nearest `at`, the door `w` wide), the board
  // with its name out from the wall beside it (`s` m from the door's middle, `out`, its foot and height)
  door: { part: 'stube', at: [842.05, -1517.8], w: 1.5, h: 2.35, steps: 2, board: { s: -1.75, out: 1.45, y: 3.2, h: 0.95 } },
  // The bar's big window on the street, "BAR" in its transom (the wall of the bar nearest `at`)
  bar: { part: 'bar', at: [836.05, -1525.2] },
  // Balconies: on the wall of `part` nearest `at` (snapped to a window's bay; `run`: along the whole wall), `out` m
  // deep, at the floors' feet `floors` (m)
  balconies: [
    // the north-west block's side on the street, by its gable (the photographs of 2015 and 2021)
    { part: 'west', at: [827.1, -1521.3], w: 2.4, out: 1.2, floors: [7.4, 10.5, 13.6, 16.7] },
    // the south block's face to the valley, over the wing's roof (guessed)
    { part: 'south', at: [833.6, -1494.8], run: true, out: 1.3, floors: [10.5, 13.6, 16.7] }
  ],
  // Dormers on the slopes: the gabled block, the eave (0: a → b, 1: c → d), m along it from its a/d end
  dormers: [
    { part: 'west', side: 0, at: [4.6, 8.9, 13.2] },
    { part: 'cross', side: 0, at: [6.5, 10.8, 15.0] },
    { part: 'cross', side: 1, at: [7.6, 12.4] },
    { part: 'east', side: 1, at: [3.5, 7.0, 10.5] }
  ],
  // Chimneys on the north-west block's ridge (m along it from a)
  chimneys: [5.2, 12.8]
};

/** A part by its id */
export const part = (id) => MONTANA.parts.find((p) => p.id === id);

/** The part of the hotel a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of MONTANA.parts) if (pointInRing(p.ring, x, z) && (!best || partTop(p) > partTop(best))) best = p;
  return best;
}

/**
 * A gabled block's frame: a its corner, u along its eaves (a → b), w across (towards d), L and W its length and
 * width, r the ridge's distance from a → b; at(s, t) the world point s along, t across
 */
export function gableFrame(p) {
  const [a, b, , d] = p.ring;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let w = [-u[1], u[0]];
  if ((d[0] - a[0]) * w[0] + (d[1] - a[1]) * w[1] < 0) w = [-w[0], -w[1]];
  const W = (d[0] - a[0]) * w[0] + (d[1] - a[1]) * w[1];
  const T = p.roof.through, r = (T[0] - a[0]) * w[0] + (T[1] - a[1]) * w[1];
  const at = (s, t) => [a[0] + u[0] * s + w[0] * t, a[1] + u[1] * s + w[1] * t];
  return { a, u, w, L, W, r, at };
}

/**
 * A gabled block's roof in its frame: the eaves' heights E0 (t = 0) and E1 (t = W), the ridge R at t = r, the
 * jerkinhead (where the slopes meet the gables' flat top hh: t0, t1; the ridge ends `hin` in from the gables), and the
 * gables' profile [[t, y], …] from t = 0 to t = W
 */
export function gableRoof(p) {
  const G = gableFrame(p), [E0, E1] = p.roof.eaves, R = p.roof.ridge;
  const [hh, hin] = p.roof.hip || [R, 0];
  const k0 = (R - E0) / G.r, k1 = (R - E1) / (G.W - G.r);
  const t0 = (hh - E0) / k0, t1 = G.W - (hh - E1) / k1;
  const profile = hin > 0 ? [[0, E0], [t0, hh], [t1, hh], [G.W, E1]] : [[0, E0], [G.r, R], [G.W, E1]];
  return { ...G, E0, E1, R, hh, hin, k0, k1, t0, t1, profile };
}

/** The roof's height over a point of a gabled block (its frame's s, t) */
export function roofHeight(p, s, t) {
  const Q = gableRoof(p);
  const slope = t <= Q.r ? Q.E0 + Q.k0 * t : Q.E1 + Q.k1 * (Q.W - t);
  if (Q.hin <= 0) return slope;
  const end = Math.min(s, Q.L - s);
  return Math.min(slope, Q.hh + ((Q.R - Q.hh) / Q.hin) * end);
}

/** A part's highest point (a flat roof's top, a gabled block's ridge) */
export const partTop = (p) => (p.roof ? p.roof.ridge : p.top);

/** The windows' v of a height on the hotel's grid: metres up from the grid's origin, a floor's foot at every storey */
export const UP = 40 * MONTANA.storey;
export const hotelV = (y) => y - MONTANA.line + UP;

/**
 * The top of the windowed stretch of a hotel wall under a roof (or a gable's eave) at `top`: the top of the highest
 * floor whose window fits under it (a window's head `head` m over its floor's foot)
 */
export function windowedTop(top, head = 2.4) {
  const S = MONTANA.storey, n = Math.floor((top - head - 0.15 - MONTANA.line) / S);
  return Math.min(top, MONTANA.line + (n + 1) * S);
}

/**
 * The stretch of a gable's wall over its eaves that holds the attic's windows: where the profile stands `need` m over
 * the line (the window's head and a margin), [t from, t to] in the gabled block's frame, or null
 */
export function atticStretch(p, need = 2.65) {
  const Q = gableRoof(p), y = MONTANA.line + need;
  const pr = Q.profile;
  let from = null, to = null;
  for (let i = 0; i + 1 < pr.length; i++) {
    const [ta, ya] = pr[i], [tb, yb] = pr[i + 1];
    if (ya < y && yb >= y) from = ta + ((y - ya) / (yb - ya)) * (tb - ta);
    if (ya >= y && yb < y) to = ta + ((ya - y) / (ya - yb)) * (tb - ta);
  }
  return from !== null && to !== null && to > from ? [from, to] : null;
}

/** The wall (outward, as wallFrame wants it) of a part nearest a point: { F, s } (s: the point's place along it) */
export function wallNear(p, x, z) {
  const R = outwardRing(p.ring);
  let best = null;
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len < 0.5) continue;
    const s = Math.max(0, Math.min(F.len, (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1]));
    const [qx, qz] = onWall(F, s);
    const d = Math.hypot(qx - x, qz - z);
    if (!best || d < best.d) best = { F, s, d, i };
  }
  return best;
}

/** Is a point (x, z) inside a part other than `p`? (a wall facing it is hidden, a rail or ledge there is left out) */
export const insideOther = (p, x, z) => MONTANA.parts.some((q) => q !== p && pointInRing(q.ring, x, z));

/**
 * The stretches of a part's wall F along its ground floor kept free of windows (the lettering's piers, the Stube's
 * door): [[from, to], …] m along it
 */
export function clearStretches(p, F) {
  const out = [];
  const items = [...MONTANA.letters.filter((l) => l.part === p.id && l.clear), ...(MONTANA.door.part === p.id ? [{ ...MONTANA.door, clear: MONTANA.door.w + 1.0 }] : [])];
  for (const l of items) {
    const W = wallNear(p, l.at[0], l.at[1]);
    if (W.F.a !== F.a || Math.abs(W.F.len - F.len) > 1e-9) continue;
    out.push([Math.max(0, W.s - l.clear / 2), Math.min(F.len, W.s + l.clear / 2)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** A wall cut into its stretches along the ground floor: [{ from, to, windows }] */
export function wallStretches(p, F) {
  const out = [];
  let at = 0;
  for (const [c0, c1] of clearStretches(p, F)) {
    if (c0 - at > 0.01) out.push({ from: at, to: c0, windows: true });
    out.push({ from: c0, to: c1, windows: false });
    at = c1;
  }
  if (F.len - at > 0.01) out.push({ from: at, to: F.len, windows: true });
  return out;
}

/** The outlines the walls stand on at the ground (every part: none hangs over the ground) */
export const groundOutlines = () => MONTANA.parts.map((p) => p.ring);

export { bays, outwardRing, ringArea2, wallFrame, onWall, pointInRing };
