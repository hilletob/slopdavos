// The church of the Freie Evangelische Gemeinde Davos on the Promenade (7270 Davos Platz; js/feg-davos.js): the nave
// under its steep saddle roof with the ridge turret and its spire, the polygonal choir on the east, the sacristy beside
// it, the low porch against the west gable, the windows' grid and the buttresses. Pure data and frame maths, shared by
// the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1748/1015, batches 4, 7, 0 and 5): the walls below are its walls at the ground, the
// roofs its sloped triangles cleaned into planes; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js).
// The nave (batch 4) is a block of 16.2 × 12.3 m turned 24° from the grid, its long walls along the Promenade (south-
// west) and the hillside (north-east); its saddle roof's ridge (y 10.4) runs west-north-west, the eaves at y 3.6 three
// quarters of a metre out, the verges as far out over the gables. On its east gable the choir (batch 7), 8.3 m wide,
// ends in three sides under a hipped roof (ridge y 8.6, eaves y 4.2); in the corner north of it the sacristy (batch 0)
// under a lean-to roof; against the west gable a porch 3 m deep (batch 5) under a hipped lean-to roof (y 3.8 at the
// gable, eaves y 2.7). The ground lies at y −5.7 along the Promenade and rises behind the north-east wall to −3.4 and
// steeply up the hillside beyond. OpenStreetMap's footprint is w117012118 (up to 1.5 m off the surveyed walls).
// The look after Mapillary's street views (CC BY-SA). 2026 from the Promenade south of it (1616606479337235, the camera
// at x −69, z −628 looking north-north-west, in the WEF week, the church dressed as a pavilion with banners between its
// piers): the south-west long wall with its piers of rubble stone, the grey slate roof over a red-brown fascia, the
// slender dark spire on its turret on the ridge near the west gable. 2014 from the road up the hillside north-east of it
// (166944568653175, 803299537276230, 843323872931691): the choir behind the cream house of w117012148 (the
// congregation's other house, the one those photographs show whole: not this building), its walls of light rubble stone
// with small round-arched windows and a corbel table under the eaves, the steep hipped roof, the spire over the nave
// behind with a cross on its tip. The photographs from the east and the south-west in 2026 (26101112999495631,
// 4234549913459443, 902396495706832; 781133365000140, 864306983143541, 874377272067880) look along the Promenade past it
// (a stone retaining wall, trees, WEF pavilions): not this building. The north-east wall, the west gable and its
// porch, the door and the windows of the nave (behind the banners) are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The church's frame: t along the south-west long wall (towards the choir, east-south-east), c across the nave
// (towards the hillside, north-north-east), from the nave's west corner on the Promenade. World x = o.x + t·u.x +
// c·v.x, z likewise
const U = (() => { const x = 14.8, z = -6.7, l = Math.hypot(x, z); return [x / l, z / l]; })();
// (v is u turned a quarter the other way round than in the world's x, z: the frame is mirrored)
export const FRAME = { o: [-79.2, -641.6], u: U, v: [U[1], -U[0]] };
/** World [x, z] of a point (t, c) of the church's frame */
export const toWorld = (t, c) => [FRAME.o[0] + FRAME.u[0] * t + FRAME.v[0] * c, FRAME.o[1] + FRAME.u[1] * t + FRAME.v[1] * c];
/** The church's frame [t, c] of a world point */
export const toLocal = (x, z) => { const dx = x - FRAME.o[0], dz = z - FRAME.o[1]; return [dx * FRAME.u[0] + dz * FRAME.u[1], dx * FRAME.v[0] + dz * FRAME.v[1]]; };
const W = (t, c) => toWorld(t, c).map((q) => Math.round(q * 100) / 100);

const LEN = 16.2, WID = 12.3, RIDGE_C = 6.15;

export const FEG_DAVOS = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles (the nave, the choir, the sacristy,
  // the porch)
  exclude: [{ x: -74.3, z: -650.6, r: 3 }, { x: -63.6, z: -655.6, r: 3 }, { x: -67.6, z: -660.4, r: 2 }, { x: -80.2, z: -645.9, r: 2 }],
  osm: 'w117012118',
  base: -6.4, // how far down the walls reach (under the lowest ground, −5.7 on the Promenade)
  len: LEN,
  wid: WID,
  // The volumes' walls at the ground ([t, c] of the frame) and their floors (the survey's)
  nave: { floor: -5.64, ring: [[0, 0], [LEN, 0], [LEN, WID], [0, WID]] },
  choir: { floor: -5.02, ring: [[LEN, 2.5], [21.74, 2.45], [24.25, 4.83], [24.27, 7.56], [21.87, 10.73], [LEN, 10.8]] },
  sacristy: { floor: -4.4, ring: [[LEN, 10.8], [20.27, 10.8], [20.27, 12.78], [LEN, 12.78]] },
  porch: { floor: -5.65, ring: [[-3.03, 0.63], [0, 0.63], [0, 10.22], [-3.03, 10.22]] },
  // The nave's saddle roof: the ridge (c, y) between the verges (t), the eaves (c) at `eaves` y
  roof: { t0: -0.73, t1: 16.94, ridge: [RIDGE_C, 10.4], c0: -0.75, c1: 13.06, eaves: 3.6 },
  // The choir's hipped roof: the ridge from the nave's gable to `ridgeEnd` (t) at y 8.6, the eaves' outline at y 4.2
  // (the north side drawn back to the sacristy's wall where it stands)
  choirRoof: {
    ridge: [RIDGE_C, 8.6], ridgeEnd: 21.65, eaves: 4.2,
    outline: [[LEN, 1.79], [21.99, 1.79], [24.97, 4.5], [25.03, 7.77], [22.24, 11.55], [20.27, 11.57], [20.27, 10.8], [LEN, 10.8]]
  },
  // The sacristy's lean-to: from the choir's wall (c, y) down to its eaves on the north, from the nave's gable east
  sacristyRoof: { t0: LEN, t1: 20.6, high: [10.8, 4.85], low: [13.5, 4.1] },
  // The porch's hipped lean-to: its top along the gable (c from, to) at y 3.8, the eaves round it at y 2.7
  porchRoof: { top: [2.06, 8.77, 3.8], eaves: { t: -3.75, c0: -0.15, c1: 10.98, y: 2.7 } },
  // The ridge turret near the west gable (t of its middle): a slated square belfry, the octagonal spire, the cross
  turret: { t: 3.0, half: 0.7, belfry: 12.5, spire: 19.6, cross: 20.5 },
  // The windows: round-arched in stone surrounds, their sill and their springing (m over the nave's floor), their half
  // width; one in the middle of each bay of `bay` m along a wall (the long walls' five between the buttresses)
  win: { lo: 2.6, spring: 6.0, half: 0.55 },
  bay: 3.25,
  // The buttresses of the long walls: at the bays' ends (t), their width and depth, their top
  buttress: { at: [LEN / 2 - 4.875, LEN / 2 - 1.625, LEN / 2 + 1.625, LEN / 2 + 4.875], half: 0.32, depth: 0.55, top: 1.6 },
  // The round window in the west gable over the porch's roof (c of its middle, y, radius)
  rose: { c: RIDGE_C, y: 6.2, r: 0.95 },
  // The door in the porch's south-west end, facing the Promenade (its width and height; guessed)
  door: { w: 1.7, h: 2.9 },
  // The corbel table under the eaves of the nave's long walls and the choir's sides (its height under the wall's top)
  corbel: 0.42
};

const D = FEG_DAVOS;

/** The nave's roof height at c (its upper face) */
export function naveRoofY(c) {
  const R = D.roof, [cr, yr] = R.ridge;
  const slope = (yr - R.eaves) / (c <= cr ? cr - R.c0 : R.c1 - cr);
  return yr - Math.abs(c - cr) * slope;
}

// A plane through three points [t, c, y]: y at (t, c)
function planeThrough(p, q, r) {
  const a = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], b = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return (t, c) => p[2] - (n[0] * (t - p[0]) + n[1] * (c - p[1])) / n[2];
}
/** The choir roof's faces: [t, c, y] round each (the south side, the three of the apse, the north side) */
export function choirFaces() {
  const R = D.choirRoof, [cr, yr] = R.ridge, e = R.eaves, o = R.outline;
  const r0 = [LEN, cr, yr], r1 = [R.ridgeEnd, cr, yr];
  const at = (i) => [o[i][0], o[i][1], e];
  // (the north side's points along the sacristy at the plane's height there)
  const north = planeThrough(at(4), at(5), r1);
  return [
    [at(0), at(1), r1, r0],
    [at(1), at(2), r1],
    [at(2), at(3), r1],
    [at(3), at(4), r1],
    [at(4), at(5), [o[6][0], o[6][1], north(o[6][0], o[6][1])], [o[7][0], o[7][1], north(o[7][0], o[7][1])], r0, r1]
  ];
}
/** The choir roof's height over (t, c): the lowest of its faces' planes */
export function choirRoofY(t, c) {
  return Math.min(...choirFaces().map((f) => planeThrough(f[0], f[1], f[2])(t, c)));
}
/** The sacristy's roof height at c */
export function sacristyRoofY(c) {
  const [ch, yh] = D.sacristyRoof.high, [cl, yl] = D.sacristyRoof.low;
  return yh + ((c - ch) * (yl - yh)) / (cl - ch);
}
/** The porch's roof height over (t, c): the lowest of its three planes */
export function porchRoofY(t, c) {
  const P = D.porchRoof, [c0, c1, yt] = P.top, E = P.eaves;
  const west = E.y + ((t - E.t) * (yt - E.y)) / (0 - E.t);
  const south = E.y + ((c - E.c0) * (yt - E.y)) / (c0 - E.c0);
  const north = E.y + ((E.c1 - c) * (yt - E.y)) / (E.c1 - c1);
  return Math.min(west, south, north, yt);
}

/** The parts with their outlines in the world (x, z) */
export const parts = () => ['nave', 'choir', 'sacristy', 'porch'].map((id) => ({ id, floor: D[id].floor, ring: D[id].ring.map(([t, c]) => W(t, c)) }));
/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the four parts' walls at the ground */
export const groundOutlines = () => parts().map((p) => p.ring);
/** Is a point inside the church? */
export const insideChurch = (x, z) => groundOutlines().some((r) => pointInRing(r, x, z));
/** The highest roof over a world point, null off the church */
export function roofAt(x, z) {
  const [t, c] = toLocal(x, z);
  let y = null;
  const R = D.roof;
  if (t >= R.t0 && t <= R.t1 && c >= R.c0 && c <= R.c1) y = naveRoofY(c);
  if (pointInRing(D.choirRoof.outline, t, c)) y = Math.max(y ?? -Infinity, choirRoofY(t, c));
  return y;
}

/** The frame of a wall of the nave by side: 'south' (the Promenade's, south-west), 'north' (north-east), 'west', 'east' */
export function naveWall(side) {
  const [a, b] = { south: [[0, 0], [LEN, 0]], north: [[LEN, WID], [0, WID]], west: [[0, WID], [0, 0]], east: [[LEN, 0], [LEN, WID]] }[side];
  return wallFrame(toWorld(...a), toWorld(...b));
}

/** The bays of a wall of `len` m from its middle: u of each window that fits (0.4 m of wall left beside it) */
export function bays(len) {
  const out = [];
  for (let k = -6; k <= 6; k++) if (Math.abs(k * D.bay) + D.win.half + 0.4 <= len / 2) out.push(k * D.bay);
  return out;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
