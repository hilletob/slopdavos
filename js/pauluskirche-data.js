// The Pauluskirche (the Protestant church of Davos Platz; js/pauluskirche.js): its volumes in the church's own frame,
// the nave's saddle roof and its stepped gables, the round apse with its drum and cone, the stair turret, the porch, the
// tower with its four gables and spire, the windows and the painted openings. Pure data and frame maths, shared by the
// browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1743/1004: batch 10 the nave, 13 the apse, 7 the tower, 20 the stair turret on
// the east side): the outlines at the ground, the eaves, the ridge, the apse's ledge, drum and apex, the tower's top,
// its gables and the spire's tip below are its; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js).
// The nave runs from its entrance gable in the north-east to the apse in the south-west, 32.7° west of south: in its
// own frame (s metres along the nave from the entrance gable, t metres across it, west-north-west positive) the
// survey's walls run straight. The ground lies at y −11.6 to −11.0 along the west side and round the apse and climbs
// to −9.5 before the entrance and along the east side's north end. OpenStreetMap's footprint is w97292342 (its east
// wall 0.6 m out of the survey's, its entrance gable 0.7 m in; it leaves out the tower's step out of the west wall and
// the stair turret). The look after Mapillary's street views (CC BY-SA, 2014–2015, all three from the north-east on
// the street along the west side, in snow):
// - the entrance gable (north-east) in light grey plaster under the steep slate roof, stepped coping on its rakes over
//   an ochre corbel frieze, a large rose window in a pointed recess high in it, a string course under it, the gabled
//   porch with its arched doorway before it (a little east of the gable's middle), a small arched window either side;
// - the slender square tower at the gable's west corner, half out of the west wall: plain plaster, a slit, a small
//   round window under a cornice, the belfry's arched openings, a small gable on each side, the slate spire and its
//   cross (no dial in the photographs);
// - the west side: tall round-headed windows in pairs between buttresses over smaller ones, the roof with snow.
// The east side, the apse and the stair turret show in no photograph: their windows are guessed after the west side.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

const AX = -7.9 / Math.hypot(7.9, 12.3), AZ = 12.3 / Math.hypot(7.9, 12.3); // the nave's axis, towards the apse

export const PAULUSKIRCHE = {
  // swissBUILDINGS3D's buildings (their centres: the apse, the nave, the tower, the stair turret): left out of the
  // streamed tiles
  exclude: [
    { x: -787.9, z: 560.6, r: 3 }, { x: -783.6, z: 554.7, r: 3 }, { x: -783.3, z: 544.5, r: 3 }, { x: -781.1, z: 562.1, r: 3 }
  ],
  osm: 'w97292342',
  // The church's frame: the ridge's north-east end (world x, z) and the nave's axis (s), t across it (the axis turned a
  // quarter to the right: west-north-west)
  origin: [-778.65, 546.1],
  along: [AX, AZ],
  base: -12.6, // how far down the walls reach (the lowest ground under the church: −11.6)
  // The nave: from its entrance gable (s0) to the gable over the apse (s1), between its east and west walls; the ridge
  // (t, height) and the roof's pitch (rise per metre across), its eaves `eaves` out of the side walls (survey: 2.1–2.2);
  // the gables stand `parapet` over the roof, stepped
  nave: { s0: -0.1, s1: 18.1, east: -4.65, west: 4.95, ridge: 0.15, ridgeY: 9.3, pitch: 1.24, eaves: 0.95, parapet: 0.3, steps: 8 },
  string: -3.8, // the string course round the nave, under the tall windows and the rose
  // The apse: round, half out of the gable over it (its middle [s, t]); the lower wall up to the ledge, the ledge's
  // pent roof from the drum out (r0 at y0 to r1 at y1), the drum up to its eaves, the cone up to `apex`; `sides` faces
  apse: { centre: [17.15, 0.15], r: 4.65, ledge: -3.6, skirt: { r0: 4.2, y0: -3.45, r1: 5.5, y1: -3.9 }, drum: 4.2, eaves: 1.9, apex: 4.7, sides: 16 },
  // The stair turret on the east side (survey: 0.5 m off the wall; set against it here)
  turret: { centre: [14.8, -6.05], r: 1.45, eaves: -2.6, apex: -0.7, sides: 12 },
  // The porch before the entrance gable (OpenStreetMap's outline; the survey has none): its walls up to the eaves, the
  // gable to the ridge over its middle
  porch: { s0: -2.85, s1: -0.1, east: -3.55, west: 2.0, eaves: -6.6, ridgeY: -4.2, overhang: 0.2 },
  // The tower at the gable's west corner: [s0, s1] × [t0, t1], the band under the round window's cornice, the top of
  // the shaft, a gable on each side up to `gable`, the octagonal spire from its base (radius r at y0) to its tip; the
  // cross; the belfry's opening, the round window and the slit on its sides
  tower: {
    s0: -0.3, s1: 2.5, t0: 3.55, t1: 6.1, band: 12.0, top: 15.7, gable: 17.1,
    spire: { r: 1.15, y0: 15.75, y1: 23.8 },
    cross: { y0: 23.8, y1: 25.0, arm: 24.55, half: 0.3 },
    louvre: { y0: 12.6, y1: 15.0, half: 0.45 },
    oculus: { y: 10.7, half: 0.33 },
    slit: { y0: 6.6, y1: 7.8, half: 0.12 }
  },
  // The windows: a point [s, t] on an outer wall (the window's middle), the sill, the height to the round head's top,
  // half the width; `pair`: two of them this far either side of the point
  windows: [
    // the west side: four bays of tall pairs over single small ones (the photographs from the north-east)
    ...[4.4, 8.15, 11.85].flatMap((s) => [{ at: [s, 4.95], sill: -3.2, h: 5.6, half: 0.42, pair: 0.6 }, { at: [s, 4.95], sill: -7.6, h: 1.7, half: 0.36 }]),
    { at: [15.9, 4.95], sill: -3.2, h: 5.6, half: 0.42, pair: 0.6 },
    // the east side (guessed, as the west), the turret before the fourth bay: one window past it
    ...[4.4, 8.15, 11.85].flatMap((s) => [{ at: [s, -4.65], sill: -3.2, h: 5.6, half: 0.42, pair: 0.6 }, { at: [s, -4.65], sill: -7.6, h: 1.7, half: 0.36 }]),
    { at: [17.0, -4.65], sill: -3.2, h: 5.6, half: 0.42 },
    // the entrance gable either side of the porch
    { at: [-0.1, -4.08], sill: -7.5, h: 1.8, half: 0.28 },
    { at: [-0.1, 2.8], sill: -7.5, h: 1.8, half: 0.32 }
  ],
  // The painted openings and doors (the atlas' cells, js/pauluskirche.js): a point [s, t] on an outer wall (the
  // middle), the width, the foot (`ground`: over the highest ground before it) and the height
  openings: [
    // the rose window in its pointed recess over the string course
    { key: 'rose', at: [-0.1, 0.15], w: 4.2, y: -3.3, h: 9.6 },
    // the porch's arched doorway
    { key: 'door', at: [-2.85, -0.775], w: 2.0, ground: 0.12, h: 3.2 },
    // a round window high in the gable over the apse (guessed)
    { key: 'oculus', at: [18.1, 0.15], w: 1.3, y: 5.6, h: 1.3 }
  ],
  // The buttresses: [s, t] on a side wall (their middle), half their width, how far out, their top
  buttresses: [
    ...[6.3, 10.0, 13.7].map((s) => ({ at: [s, 4.95], half: 0.32, out: 0.55, top: -4.2 })),
    ...[6.3, 10.0].map((s) => ({ at: [s, -4.65], half: 0.32, out: 0.55, top: -4.2 })),
    // at the entrance gable's east corner, on the east wall
    { at: [0.3, -4.65], half: 0.3, out: 0.5, top: -4.6 }
  ]
};

// --- The church's frame ------------------------------------------------------------------------------------------------
const [OX, OZ] = PAULUSKIRCHE.origin, [UX, UZ] = PAULUSKIRCHE.along;
/** [s, t] in the church's frame → world [x, z] */
export const toWorld = ([s, t]) => [OX + s * UX - t * UZ, OZ + s * UZ + t * UX];
/** world [x, z] → [s, t] */
export const toLocal = ([x, z]) => { const dx = x - OX, dz = z - OZ; return [dx * UX + dz * UZ, -dx * UZ + dz * UX]; };
/** A frame of the church's frame in the world (for js/building-kit.js' Builder) */
export function worldFrame(F) {
  const a = toWorld(F.a), b = toWorld(onWall(F, F.len));
  return wallFrame(a, b);
}

// --- The volumes' outlines (church frame) ------------------------------------------------------------------------------
const N = PAULUSKIRCHE.nave, P = PAULUSKIRCHE.porch, T = PAULUSKIRCHE.tower, A = PAULUSKIRCHE.apse, R = PAULUSKIRCHE.turret;
const rect = (s0, s1, t0, t1) => outwardRing([[s0, t0], [s1, t0], [s1, t1], [s0, t1]]);
/** A regular polygon round `c` (a face across the nave's axis at angle 0), its walls facing out */
export const polygon = (c, r, sides) => outwardRing(Array.from({ length: sides }, (_, i) => {
  const a = ((i + 0.5) / sides) * Math.PI * 2;
  return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
}));

export const naveRing = () => rect(N.s0, N.s1, N.east, N.west);
export const porchRing = () => rect(P.s0, P.s1, P.east, P.west);
export const towerRing = () => rect(T.s0, T.s1, T.t0, T.t1);
export const apseRing = () => polygon(A.centre, A.r, A.sides);
export const drumRing = () => polygon(A.centre, A.drum, A.sides);
export const turretRing = () => polygon(R.centre, R.r, R.sides);

/** The nave's roof over [s, t] (its saddle; the eaves' height beyond them) */
export const roofAt = (s, t) => N.ridgeY - N.pitch * Math.abs(t - N.ridge);
/** The porch's roof over [s, t] */
export const porchRoofAt = (s, t) => P.ridgeY - ((P.ridgeY - P.eaves) * Math.abs(t - (P.east + P.west) / 2)) / ((P.west - P.east) / 2);

/** Is [s, t] inside the nave (`m` m in from its walls)? */
export const inNave = (s, t, m = 0) => s > N.s0 + m && s < N.s1 - m && t > N.east + m && t < N.west - m;

// --- The walls -----------------------------------------------------------------------------------------------------------
/**
 * Every outer wall: { id, part, F (church frame, a on the left seen from outside), top(s) (the wall's top m along it),
 * gable (a gable wall: its top follows a roof's rakes) }; the walls standing within the nave (the apse's, the drum's
 * and the turret's inner faces, the porch's back) are left out, the drum's faces under the nave's roof too
 */
export function walls() {
  const out = [];
  const add = (id, part, ring, top, keep = () => true, gable = false) => ring.forEach((a, i) => {
    const F = wallFrame(a, ring[(i + 1) % ring.length]), [ms, mt] = onWall(F, F.len / 2, 0.2);
    if (keep(ms, mt)) out.push({ id: `${id}${i}`, part, F, top: top(F), gable });
  });
  const nave = naveRing(), flat = (y) => () => () => y;
  // the nave's side walls under the eaves, its gables up to the rakes and the parapet
  nave.forEach((a, i) => {
    const F = wallFrame(a, nave[(i + 1) % 4]), side = Math.abs(F.u[0]) > 0.5;
    const id = side ? (F.n[1] > 0 ? 'west' : 'east') : (F.n[0] < 0 ? 'entrance' : 'apse-gable');
    const top = side ? () => roofAt(0, a[1]) : (s) => { const [ss, tt] = onWall(F, s); return roofAt(ss, tt) + N.parapet; };
    out.push({ id, part: 'nave', F, top, gable: !side });
  });
  add('porch-', 'porch', porchRing(), (F) => (Math.abs(F.u[0]) > 0.5 ? () => P.eaves : (s) => { const [ss, tt] = onWall(F, s); return porchRoofAt(ss, tt); }),
    (s, t) => !inNave(s, t), true);
  add('apse-', 'apse', apseRing(), flat(A.ledge), (s, t) => !inNave(s, t));
  add('drum-', 'drum', drumRing(), flat(A.eaves), (s, t) => !inNave(s, t));
  add('turret-', 'turret', turretRing(), flat(R.eaves), (s, t) => !inNave(s, t));
  add('tower-', 'tower', towerRing(), flat(T.top));
  return out;
}

/** The outer wall a point [s, t] lies on: { wall, s (m along it) }, or null */
export function wallAt([s, t], list = walls()) {
  for (const w of list) {
    const F = w.F, ds = (s - F.a[0]) * F.u[0] + (t - F.a[1]) * F.u[1], dn = (s - F.a[0]) * F.n[0] + (t - F.a[1]) * F.n[1];
    if (Math.abs(dn) < 0.1 && ds > 0.05 && ds < F.len - 0.05) return { wall: w, s: ds };
  }
  return null;
}

/** The windows one by one (a pair as two): { at, sill, h, half } */
export function windowList() {
  return PAULUSKIRCHE.windows.flatMap((w) => {
    if (!w.pair) return [w];
    // (the pair along the wall: the axis for the side walls, across it for the gables)
    const W = wallAt(w.at), [du, dv] = W.wall.F.u;
    return [-1, 1].map((k) => ({ ...w, at: [w.at[0] + du * w.pair * k, w.at[1] + dv * w.pair * k], pair: 0 }));
  });
}

/** The windows in the apse's lower wall and its drum (guessed): three each, on the faces furthest along the axis */
export function apseWindows() {
  const mid = (r, i) => { const a = r[i], b = r[(i + 1) % r.length]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const far = (r) => r.map((_, i) => mid(r, i)).sort((p, q) => q[0] - p[0]).slice(0, 3);
  return [
    ...far(apseRing()).map((at) => ({ at, sill: -8.6, h: 2.2, half: 0.38 })),
    ...far(drumRing()).map((at) => ({ at, sill: -2.6, h: 3.4, half: 0.36 }))
  ];
}

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS), world [x, z]: the nave with the
 *  tower's step out of the west wall, the porch before it and the apse beyond it as one outline; the stair turret */
export function groundOutlines() {
  // the apse's faces beyond the nave's gable, from its west wall round to its east wall
  const arc = apseRing().filter(([s]) => s > N.s1 + 0.01).sort((p, q) => Math.atan2(q[1] - A.centre[1], q[0] - A.centre[0]) - Math.atan2(p[1] - A.centre[1], p[0] - A.centre[0]));
  const yAt = (s, sign) => A.centre[1] + sign * Math.sqrt(Math.max(0, A.r ** 2 - (s - A.centre[0]) ** 2));
  const ring = [
    [P.s0, P.east], [P.s0, P.west], [P.s1, P.west], [N.s0, T.t0], [T.s0, T.t0], [T.s0, T.t1], [T.s1, T.t1], [T.s1, N.west],
    [N.s1, N.west], [N.s1, yAt(N.s1, 1)], ...arc, [N.s1, yAt(N.s1, -1)], [N.s1, N.east], [N.s0, N.east], [N.s0, P.east]
  ];
  return [outwardRing(ring), turretRing()].map((r) => r.map(toWorld));
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
