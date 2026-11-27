// The house of the Migros in Davos Dorf (on the Promenade, south of the Weber's; js/migros-dorf.js): its two volumes
// under one flat roof with deep timber eaves, the shop's glazed front on the Promenade between two stone piers,
// the entrance, the staff door and the delivery gate on the other sides, the lettering. Pure data and frame maths,
// shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1752/1021, batches 22 and 9): two flat roofs, the main block at y 4.29 (an L round
// the east block) and the east block at 4.09, each a prism from its floor (−5.3 and −5.8, the lowest ground under them)
// to its roof; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The tiles' roofs stand 7.9 m over
// the Promenade, where the photograph shows one storey of 5 m: the roof is laid at the photograph's height. The ground: the Promenade along the west front at y −3.6 to
// −3.7, the lane on the south falling from −3.7 to −5.8, the car park on the east at −5.0 to −5.3, the north side from
// −3.6 at its west end to −5.0. OpenStreetMap's footprint is w117012298 (up to 1.1 m off the surveyed walls);
// OpenStreetMap places the Migros (n797682885) in it, near the Promenade.
// The look after the user's photograph of the Promenade's front (the Weber's pink wall on its left, the north): one
// tall storey of shop glazing along the whole front, dark posts, a transom at the doors' height, blinds behind the upper
// panes; the glass doors in the left third with "MIGROS" in orange letters over them; a pier of rough grey-brown stone
// at each corner, the south one the full height; a flat roof with deep eaves and a brown timber soffit and fascia
// (the user: "Migros Dorf hat ein Flachdach"); no upper floor. Mapillary's street views (CC BY-SA, 2013 and 2025) do not show
// the house (the near shops and the low house w117012205 stand before it). The north, east and south sides are
// guessed: closed white walls on a stone plinth, a staff door on the lane, the delivery gate in brown boards on the car
// park.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const MIGROS_DORF = {
  // swissBUILDINGS3D's batches (their centres): left out of the streamed tiles
  exclude: [{ x: 627.6, z: -1324.9, r: 3 }, { x: 632.8, z: -1315.7, r: 3 }],
  osm: 'w117012298',
  // the shop js/shops.js would hang a generic board on: the name is drawn by the module instead
  shops: ['n797682885'],
  base: -7.5, // how far down the walls reach (under the car park)
  floor: -3.5, // the shop's floor, on the Promenade's level
  glass: 1.05, // the top of the shop's glazing (a dark head over it up to the soffit)
  transom: 2.6, // the transom over the doors, m over the floor (blinds behind the panes over it)
  // The ground floor is glazed where the ground along a stretch lies `clear` m under the glazing's top at most
  clear: 3.2,
  // The volumes (world x, z): the outlines the walls stand on. The main block wraps round the east block on the north
  // and the west; the walls between them are left out
  parts: [
    { id: 'main', ring: [[639.6, -1320.25], [644.5, -1332.4], [620.5, -1342.0], [610.6, -1317.3], [623.1, -1312.3], [628.1, -1324.8]] },
    { id: 'east', ring: [[637.5, -1306.6], [642.5, -1319.1], [639.6, -1320.25], [628.1, -1324.8], [623.1, -1312.3]] }
  ],
  // The roof, laid out in the Promenade front's frame (s along it from its north end, o out of it: < 0 inside): flat,
  // its top `ridge` high (`pitch` 0; the planes still meet on the line o = `ridgeO`); `thick` the
  // eaves' depth from the top to the soffit. Its outline: the house's (the east block reaching 3.1 m further back on the
  // south half) with the eaves out over it, `front` over the Promenade, `side` at the ends and the back
  roof: {
    ridge: 1.65, ridgeO: -13.45, pitch: 0, thick: 0.5,
    eaves: { front: 1.8, side: 1.2 },
    // the house's extent in that frame: s from 0 to `len`, o down to `back` (the main block's back) and `backEast`
    // (the east block's) from `jog` on
    len: 26.61, back: -25.85, backEast: -28.95, jog: 13.1
  },
  // The named outer walls (a → b, a on the left for someone standing before the wall)
  walls: {
    // the front on the Promenade, facing west-north-west (a the north end)
    west: { a: [620.5, -1342.0], b: [610.6, -1317.3] },
    // the north side towards the Weber's, facing north-north-east (a the east end)
    north: { a: [644.5, -1332.4], b: [620.5, -1342.0] },
    // the south side on the lane, facing south-south-west (a the west end): the main block's part of it
    south: { a: [610.6, -1317.3], b: [623.1, -1312.3] },
    // the main block's side on the car park, facing east-south-east (a the south end)
    east: { a: [639.6, -1320.25], b: [644.5, -1332.4] }
  },
  // The stone piers at the front's corners ([from, to] m along it, how far they stand out): the glazing between them
  piers: { wall: 'west', north: [0, 1.1], south: [25.3, 26.61], out: 0.14 },
  // The shop's glazing ([from, to] m along a named wall)
  glazed: { west: [[1.1, 25.3]] },
  // The entrance in the front's left third: glass doors in the glazing (centre `s`, width `w`, their top `h` over the
  // floor), the frames standing a little out
  entrance: { wall: 'west', s: 6.3, w: 3.4, h: 2.5 },
  // A staff door in the lane's side (centre, width, height)
  staffDoor: { wall: 'south', s: 10.0, w: 1.1, h: 2.2 },
  // The delivery gate on the car park's side: boards in a frame from the ground up `h`
  gate: { wall: 'east', s0: 5.6, s1: 9.8, h: 3.8 },
  // The lettering (decals from the atlas): its wall, where along it (s0–s1, m from a) and its heights, `out` m before it
  lettering: [
    // the name on the panes over the doors
    { key: 'migros', wall: 'west', s0: 4.85, s1: 7.75, y0: -0.6, y1: 0.0, out: 0.05 }
  ]
};

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;

/** A named wall's frame */
export const wallOf = (key) => wallFrame(MIGROS_DORF.walls[key].a, MIGROS_DORF.walls[key].b);

/** The named wall a → b is (or null) */
export function wallKey(a, b) {
  for (const [key, w] of Object.entries(MIGROS_DORF.walls)) if (near(w.a, a) && near(w.b, b)) return key;
  return null;
}

/** The other part sharing the edge a – b of `part` (either way round), or null */
export function sharedWith(part, a, b) {
  for (const p of MIGROS_DORF.parts) {
    if (p === part) continue;
    if (p.ring.some((q, i) => { const r = p.ring[(i + 1) % p.ring.length]; return (near(q, a) && near(r, b)) || (near(q, b) && near(r, a)); })) return p;
  }
  return null;
}

/** The ground floor of the wall a → b cut into its stretches: [{ from, to, glazed }] */
export function groundStretches(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), key = wallKey(a, b), out = [];
  let at = 0;
  for (const [g0, g1] of (key && MIGROS_DORF.glazed[key]) || []) {
    if (g0 - at > 0.01) out.push({ from: at, to: g0, glazed: false });
    out.push({ from: g0, to: g1, glazed: true });
    at = g1;
  }
  if (len - at > 0.01) out.push({ from: at, to: len, glazed: false });
  return out;
}

/** Where the shop's glazing starts over the highest ground `hi` along a stretch (a plinth under it), or null: too high */
export function glassFoot(hi) {
  const S = MIGROS_DORF, foot = Math.max(S.floor, hi + 0.15);
  return S.glass - foot >= S.clear ? foot : null;
}

/** The panes of a glazed stretch `len` m long: their number and width (about 3 m, as in the photograph) */
export function panes(len) {
  const n = Math.max(1, Math.round(len / 3.0));
  return { n, w: len / n };
}

// --- The roof --------------------------------------------------------------------------------------------------------
/** A world point (x, z) in the front's frame: [s, o] */
export function toFront(x, z) {
  const W = wallOf('west'), dx = x - W.a[0], dz = z - W.a[1];
  return [dx * W.u[0] + dz * W.u[1], dx * W.n[0] + dz * W.n[1]];
}
/** The roof's top over a point `o` m out of the front (o < 0: inside) */
export const roofTop = (o) => MIGROS_DORF.roof.ridge - MIGROS_DORF.roof.pitch * Math.abs(o - MIGROS_DORF.roof.ridgeO);
/** The soffit's height there (the eaves' underside, which the walls reach up to) */
export const soffit = (o) => roofTop(o) - MIGROS_DORF.roof.thick;

/** The roof's outline in the front's frame ([s, o], counter-clockwise seen from above), the ridge's ends on it */
export function roofOutline() {
  const R = MIGROS_DORF.roof, e = R.eaves;
  const s0 = -e.side, s1 = R.len + e.side, front = e.front, back = R.back - e.side, backEast = R.backEast - e.side, jog = R.jog - e.side;
  return [[s0, front], [s0, R.ridgeO], [s0, back], [jog, back], [jog, backEast], [s1, backEast], [s1, R.ridgeO], [s1, front]];
}
/** The roof's two planes in the front's frame: the front's (over the Promenade) and the back's */
export function roofPlanes() {
  const R = MIGROS_DORF.roof, o = roofOutline();
  return { front: [o[0], o[1], o[6], o[7]], back: [o[1], o[2], o[3], o[4], o[5], o[6]], ridgeO: R.ridgeO };
}

/** The part of the house a point lies on, or null */
export function partAt(x, z) {
  for (const p of MIGROS_DORF.parts) if (pointInRing(p.ring, x, z)) return p;
  return null;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
