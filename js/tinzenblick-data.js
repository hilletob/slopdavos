// The apartment house Tinzenblick (Davos Platz; js/tinzenblick.js): a half-round block, its straight side towards the
// slope in the north-north-west, the round side towards the valley; the floors' grid, the balcony stacks round the
// curve, the entrance in the notch of the straight side, the stairs' windows beside it, the name on the west wing.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1745/1006, batch 3, the house alone: the neighbours w116881146 and w116881149
// stand 20 m off): the roofs' outlines and heights below are its flat roofs, each a prism down under the ground;
// heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The ground falls from the straight side
// (y −21.4 to −22.9 along it) to the round one (−23.6 in the south-west, −25.0 in the south-east). OpenStreetMap's
// footprint is w116881162; it leaves out the notch as the survey's main roof does (the notch is the low entrance).
// Mapillary's street views (CC BY-SA): from the street south of it (2015) the round side: white plaster on three
// floors, the top floor clad in grey-green shingles under a thin dark roof edge, the balconies stacked on slim
// turquoise posts with their rails and striped awnings, a window in white frames on each stretch between them; from
// the north (2019) a plain pale wall with small windows, some of them louvred; from the road by the railway in the
// west (2013) the straight side's west wing with "TINZENBLICK" under the outline of a peak, the stairs' tall windows
// by the notch. The notch's entrance and the east end's balconies are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const TINZENBLICK = {
  // swissBUILDINGS3D's building (its centre, in the notch): left out of the streamed tiles
  exclude: { x: -476.3, z: 328.6, r: 3 },
  osm: 'w116881162',
  storey: 2.9,
  floors: 4,
  base: -26.5, // how far down the walls reach (under the round side's garden)
  // The house: its flat roof at `top` over the outline; `line` the top floor's top (the four floors count down from
  // it, the ground floor's foot at line − 4 storeys = −23.1, on the ground of the round side's west half)
  house: {
    top: -10.6, line: -11.5,
    ring: [[-494.5, 336.1], [-495.9, 333.7], [-482.4, 325.8], [-481.0, 327.8], [-473.8, 329.4], [-472.0, 322.5], [-473.3, 320.4], [-459.8, 312.5],
      [-459.6, 312.8], [-457.6, 317.6], [-456.8, 322.9], [-457.3, 328.1], [-459.1, 333.1], [-462.1, 337.4], [-466.1, 340.8], [-470.9, 343.2],
      [-476.0, 344.3], [-481.3, 344.1], [-486.3, 342.6], [-490.8, 339.8]]
  },
  // The entrance in the notch of the straight side: one floor under a flat roof; its front faces the slope
  entrance: {
    top: -18.91,
    ring: [[-481.0, 327.8], [-482.4, 325.8], [-473.3, 320.4], [-472.0, 322.5], [-473.8, 329.4]],
    front: { a: [-473.3, 320.4], b: [-482.4, 325.8] },
    door: { half: 1.9, head: -19.35 } // the glazing round the doors, its half width and its head
  },
  // The round side from the west wing's tip to the east wing's (the outline's points in this order, the valley on the
  // right of someone walking along it)
  curve: [[-494.5, 336.1], [-490.8, 339.8], [-486.3, 342.6], [-481.3, 344.1], [-476.0, 344.3], [-470.9, 343.2], [-466.1, 340.8], [-462.1, 337.4],
    [-459.1, 333.1], [-457.3, 328.1], [-456.8, 322.9], [-457.6, 317.6], [-459.6, 312.8]],
  // The balcony stacks round the curve: `count` of them `width` m wide, `pitch` m apart (along the curve), the middle
  // one on the curve's middle (the street views place three: on the west tip, south of the middle and on the middle);
  // a slab at each floor over the ground floor, `out` m out, a rail `rail` m high
  stacks: { count: 5, pitch: 14.75, width: 7.6, out: 1.6, rail: 1.0, floors: [1, 2, 3] },
  // The straight side's two walls (a on the left for someone standing before them, in the north-north-west)
  westWing: { a: [-482.4, 325.8], b: [-495.9, 333.7] },
  eastWing: { a: [-459.8, 312.5], b: [-473.3, 320.4] },
  // The stairs' tall windows by the notch: m along each wing's wall, its half width
  stairs: { west: 1.1, east: 14.5, half: 0.4 },
  // The name on the west wing: from s0 to s1 along it, y0 to y1 (the peak's outline over "TINZENBLICK", between the
  // top floor's windows and the next floor's, the stretch kept free of windows)
  name: { s0: 8.0, s1: 13.4, y0: -15.1, y1: -13.1, clear: [7.6, 13.8] },
  chimney: { x: -488.6, z: 335.2, half: 0.22, h: 1.7 }
};

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (either way round) the wall p → q? */
export const sameWall = (a, b, p, q) => (near(a, p) && near(b, q)) || (near(a, q) && near(b, p));

/** The ground floor's foot (world y) */
export const footY = () => TINZENBLICK.house.line - TINZENBLICK.floors * TINZENBLICK.storey;

/** The curve's segments: [{ F, from, to }] (from, to: metres along the curve) */
export function curveSegments() {
  const C = TINZENBLICK.curve, out = [];
  let at = 0;
  for (let i = 0; i + 1 < C.length; i++) {
    const F = wallFrame(C[i], C[i + 1]);
    out.push({ F, from: at, to: at + F.len, i });
    at += F.len;
  }
  return out;
}
/** The curve's length */
export const curveLength = () => { const S = curveSegments(); return S[S.length - 1].to; };

/** The point `arc` m along the curve and `out` m before it (at a corner out along the mitred normal) */
export function curvePoint(arc, out = 0) {
  const S = curveSegments();
  let k = S.findIndex((g) => arc <= g.to + 1e-6);
  if (k < 0) k = S.length - 1;
  const g = S[k], s = arc - g.from;
  let n = g.F.n;
  const corner = (h) => { const m = [g.F.n[0] + h.F.n[0], g.F.n[1] + h.F.n[1]], l = Math.hypot(...m), c = (m[0] * g.F.n[0] + m[1] * g.F.n[1]) / l; return [m[0] / l / c, m[1] / l / c]; };
  if (s < 1e-6 && k > 0) n = corner(S[k - 1]);
  else if (s > g.F.len - 1e-6 && k + 1 < S.length) n = corner(S[k + 1]);
  const [x, z] = onWall(g.F, s);
  return [x + n[0] * out, z + n[1] * out];
}

/** The balcony stacks: [{ from, to }] m along the curve (clipped to its ends) */
export function stackRanges() {
  const T = TINZENBLICK.stacks, L = curveLength(), out = [];
  for (let k = 0; k < T.count; k++) {
    const c = L / 2 + (k - (T.count - 1) / 2) * T.pitch;
    out.push({ from: Math.max(0, c - T.width / 2), to: Math.min(L, c + T.width / 2) });
  }
  return out;
}

/**
 * The round side's walls cut at the stacks: [{ F, s0, s1, door }] (s0, s1 m along the segment's frame; `door`: behind a
 * stack, the balconies' doors)
 */
export function curvePieces() {
  const out = [], R = stackRanges();
  for (const g of curveSegments()) {
    const cuts = [g.from, g.to];
    for (const r of R) for (const c of [r.from, r.to]) if (c > g.from + 0.05 && c < g.to - 0.05) cuts.push(c);
    cuts.sort((p, q) => p - q);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const m = (cuts[i] + cuts[i + 1]) / 2;
      out.push({ F: g.F, s0: cuts[i] - g.from, s1: cuts[i + 1] - g.from, door: R.some((r) => m > r.from && m < r.to) });
    }
  }
  return out;
}

/** Is a → b (either way) a wall of the round side? */
export function onCurve(a, b) {
  const C = TINZENBLICK.curve;
  for (let i = 0; i + 1 < C.length; i++) if (sameWall(a, b, C[i], C[i + 1])) return true;
  return false;
}

/** The stretches of a straight-side wall a → b kept free of windows ([from, to] m along it): the stairs, the name */
export function clearStretches(a, b) {
  const T = TINZENBLICK, len = Math.hypot(b[0] - a[0], b[1] - a[1]), out = [];
  const add = (W, c0, c1) => {
    if (near(W.a, a) && near(W.b, b)) out.push([c0, c1]);
    else if (near(W.a, b) && near(W.b, a)) out.push([len - c1, len - c0]);
  };
  const st = T.stairs.half + 0.5;
  add(T.westWing, T.stairs.west - st, T.stairs.west + st);
  add(T.eastWing, T.stairs.east - st, T.stairs.east + st);
  add(T.westWing, T.name.clear[0], T.name.clear[1]);
  return out.map(([p, q]) => [Math.max(0, p), Math.min(len, q)]).sort((p, q) => p[0] - q[0]);
}

/** A straight-side wall cut into its stretches: [{ from, to, windows }] */
export function wallStretches(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), out = [];
  let at = 0;
  for (const [c0, c1] of clearStretches(a, b)) {
    if (c0 - at > 0.01) out.push({ from: at, to: c0, windows: true });
    if (c1 - c0 > 0.01) out.push({ from: Math.max(at, c0), to: c1, windows: false });
    at = Math.max(at, c1);
  }
  if (len - at > 0.01) out.push({ from: at, to: len, windows: true });
  return out;
}

/** The posts of the balcony stacks standing on the ground: [[x, z]] (each stack's two ends and its middle) */
export function stackPosts() {
  const o = TINZENBLICK.stacks.out - 0.06;
  return stackRanges().flatMap((r) => [r.from + 0.06, (r.from + r.to) / 2, r.to - 0.06].map((s) => curvePoint(s, o)));
}

/** The part of the house a point lies in ('house', 'entrance'), or null */
export function partAt(x, z) {
  if (pointInRing(TINZENBLICK.house.ring, x, z)) return 'house';
  if (pointInRing(TINZENBLICK.entrance.ring, x, z)) return 'entrance';
  return null;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
