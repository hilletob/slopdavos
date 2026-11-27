// The Hotel Meierhof (Promenade 135, 7260 Davos Dorf; js/meierhof.js): its volumes, the floors' grid, the gabled roof
// over the old house, the oriel at its corner on the Promenade with the name down the wall under it, the monogram, the
// entrance, the flag. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1751/1020, batch 4, one batch for the whole hotel): the roofs' outlines and heights
// below are its flat roofs, each a prism down under the ground, and the four sloped triangles of the old house's gabled
// roof; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The Promenade passes the north and the east
// fronts at y −0.5 to −1.3; the garden falls gently south-east, the ground on the west rises to y 2–3.
// OpenStreetMap's footprint is w118240455 (a rectangle; the surveyed garden room and stair on the south stand 8 m
// beyond it).
// The look after Mapillary's street views of 2015 (CC BY-SA), taken on the Promenade north-north-east of the hotel: the
// old house in white plaster, windows in dark brown frames, round-headed on the top floor, the oriel at the north-east
// corner on the top floor under the dark eaves, "MEIERHOF" in gilt letters down the wall under it and again across the
// front, the gilt monogram with three stars beside the oriel, the gable over the middle of the front, the Swiss flag on
// the roof; from the lane on the west (2013) the gabled roof's slope and the low wing's flat roof. The other sides, the
// west part, the low wing and the garden room are guessed. (The photographs from the south-west with dark timber
// balconies on every floor show the apartment house w118240641 next door, not the hotel.)
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const MEIERHOF = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: 546.3, z: -1157.9, r: 3 },
  osm: 'w118240455',
  // OpenStreetMap's footprint (for the tests)
  footprint: [[533.6, -1176.5], [564.6, -1171.0], [560.3, -1146.6], [529.2, -1152.1]],
  // The floors: 3.0 m each, the ground floor's windows over the Promenade from y −0.4 on (each part's `line` lies on
  // this grid); a window's bay along a wall
  storey: 3.0,
  foot: -0.4,
  bay: 2.7,
  base: -1.8, // how far down the walls reach (under the Promenade)
  // A window: m up from its floor's foot, its half width
  win: { lo: 0.85, hi: 2.35, half: 0.58 },
  // The volumes, each a flat roof at `top` over its outline (world x, z). `line`: the top floor's top (the windows'
  // grid counts down from it, the wall from there to the roof a parapet); `old`: the old house (its top floor's windows
  // round-headed, the dark eaves); `windows: false`: closed walls; `glazed`: its free walls glass
  parts: [
    // the old house: the ground floor and five floors, flat strips each side of the gable
    { id: 'house', top: 17.72, line: 17.6, old: true,
      ring: [[562.3, -1158.0], [564.8, -1172.8], [541.8, -1176.7], [539.4, -1161.9]] },
    // the west part on the Promenade: three floors
    { id: 'west', top: 9.08, line: 8.6,
      ring: [[533.1, -1177.4], [541.7, -1176.0], [539.4, -1161.9], [541.3, -1161.6], [540.4, -1156.3], [529.8, -1158.1]] },
    // the low wing towards the garden: two floors (the survey's sliver at its south-west corner, inside the stair, left out)
    { id: 'wing', top: 6.25, line: 5.6,
      ring: [[537.2, -1142.0], [537.6, -1142.8], [538.4, -1143.1], [539.5, -1149.6], [559.6, -1146.2], [561.4, -1156.9], [562.1, -1156.8],
        [562.4, -1158.0], [541.3, -1161.6], [540.4, -1156.3], [529.9, -1158.1], [527.7, -1145.2]] },
    // the garden room before the wing, glazed
    { id: 'garden-room', top: 5.74, line: 5.6, glazed: true,
      ring: [[538.4, -1143.1], [539.8, -1143.7], [540.8, -1143.4], [542.1, -1141.9], [541.5, -1139.6], [543.4, -1139.3], [545.0, -1148.7], [539.5, -1149.6]] },
    // the stair at the garden's corner
    { id: 'stair', top: 7.79, line: 5.6, windows: false,
      ring: [[536.6, -1139.0], [541.0, -1137.8], [542.1, -1141.9], [540.8, -1143.4], [539.8, -1143.7], [537.6, -1142.8]] }
  ],
  // The old house's gabled roof: the eaves' outline (its north and south walls on the house's), the eaves' and the
  // ridge's heights; the ridge runs north–south over the middle of the eaves' short sides. `overhang`: m out over the
  // gables and the eaves
  gable: {
    ring: [[547.4, -1175.7], [559.9, -1173.6], [557.5, -1158.9], [545.0, -1161.0]],
    eave: 19.9, ridge: 25.9, overhang: 0.6
  },
  // The north front on the Promenade (a → b as wallFrame wants it: a, the north-east corner, on the left)
  front: { a: [564.8, -1172.8], b: [541.8, -1176.7] },
  // On the front, m along it from the corner: the oriel on the top floor over its corbel, the name down the wall under
  // it, the monogram beside it, the top floor kept free of windows up to `topClear`; the name across the front between
  // the second and third floors' windows; the entrance (its doors in the middle of the front, under a canopy)
  oriel: { s: 1.65, w: 2.3, out: 0.9, y0: 14.6, corbel: 13.85 },
  letters: { s: 1.65, w: 0.95, y0: 6.3, y1: 13.6 },
  monogram: { s: 3.95, w: 1.4, y0: 15.25, y1: 16.95 },
  topClear: 4.92,
  name: { s0: 2.9, s1: 8.9, y0: 8.2, y1: 8.95 },
  entrance: { w: 1.9, h: 2.6, canopy: { w: 3.6, out: 1.7, thick: 0.28 }, board: { w: 3.2, h: 0.5 } },
  // The flag on the east strip of the roof: m along the front, m in (negative: behind the front), the pole's height,
  // the flag's side
  flag: { s: 2.5, o: -3.5, pole: 6.5, w: 1.8 }
};

/** A part by its id */
export const part = (id) => MEIERHOF.parts.find((p) => p.id === id);

/** The part of the hotel a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of MEIERHOF.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** The front's frame */
export const frontFrame = () => wallFrame(MEIERHOF.front.a, MEIERHOF.front.b);

/** The m along the front where the doors stand: its middle (a window's column, the gable's middle within 0.4 m) */
export const entranceAt = () => frontFrame().len / 2;

/**
 * The windows' columns of a windowed wall `len` m long (m along it): one per bay, laid out from its middle, as the wall's
 * material draws them (js/building-kit.js windowGrid: a window where it and 0.4 m round it fit in the wall)
 */
export function columns(len, bay = MEIERHOF.bay, winHalf = MEIERHOF.win.half) {
  const out = [], half = len / 2;
  for (let k = -Math.floor(half / bay); k <= Math.floor(half / bay); k++) if (Math.abs(k * bay) + winHalf + 0.4 <= half) out.push(half + k * bay);
  return out;
}

/**
 * Where a wall a → b runs along the gable's eaves outline (the gable's wall rising over it): [s0, s1] m along it, or
 * null
 */
export function gableSpan(a, b) {
  const F = wallFrame(a, b);
  const on = MEIERHOF.gable.ring.map(([x, z]) => {
    const dx = x - a[0], dz = z - a[1], s = dx * F.u[0] + dz * F.u[1], o = dx * F.n[0] + dz * F.n[1];
    return Math.abs(o) < 0.12 && s > -0.1 && s < F.len + 0.1 ? s : null;
  }).filter((s) => s !== null);
  return on.length >= 2 ? [Math.max(0, Math.min(...on)), Math.min(F.len, Math.max(...on))] : null;
}

/** The ridge's ends (north, south) in plan: the middles of the gable outline's short sides */
export function ridge() {
  const [p, q, r, s] = MEIERHOF.gable.ring;
  return [[(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], [(r[0] + s[0]) / 2, (r[1] + s[1]) / 2]];
}

/** The gable's half width (m from its middle along the wall) at height y */
export function gableHalf(y) {
  const G = MEIERHOF.gable, [p, q] = G.ring, w = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2;
  if (y <= G.eave) return w;
  return Math.max(0, (w * (G.ridge - y)) / (G.ridge - G.eave));
}

/** The outlines the walls stand on at the ground, for the player (js/landmarks.js SURVEYED_FOOTPRINTS): every part */
export const groundOutlines = () => MEIERHOF.parts.map((p) => p.ring);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
