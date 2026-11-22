// The tower of St. Johann (Davos Platz; js/st-johann.js): the church's landmark, the spire twisted on its axis. Its
// measures. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1745/1007, batch 16: the tower alone, 78 m from its foot to the spire's tip; the
// square shaft, its eaves, the four gables' tops and the tip below are its), heights in the world frame (y = m a.s.l.
// − 1558, js/davos-frame.js), the foot on the lowest ground under it as the streamed tiles set it. The look after a
// photograph (Wikimedia Commons, "St Johann Davos.jpg"): the roughcast shaft, a dial of plain strokes on each side,
// two pointed sound openings in each gable, the shingled spire turning an eighth of a turn on its way up, the ball
// on its tip.
import { wallFrame } from './spital-data.js';

export const ST_JOHANN = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles (the nave and the porch at the tower's
  // foot are other buildings, 7 m and 4 m off)
  exclude: { x: -549.9, z: 279.6, r: 2 },
  osm: 'w116881075',
  centre: [-549.9, 279.6],
  half: 3.95, // half the square shaft's side
  along: [0.976, 0.216], // the direction of its north and south sides (the square stands 12° off the frame's axes)
  base: -8.5, // how far down the walls reach (the foot at −6.1)
  eaves: 30.8, // the walls' top
  gable: 40.2, // the four gables' tops, the cross roof's ridges
  // the spire: an octagon from inside the cross roof up to the tip, turning `twist` on its way (rad, an eighth of a turn)
  spire: { from: 34.5, radius: 2.95, tip: 71.9, twist: Math.PI / 4, sides: 8, rings: 16 },
  ball: { y: 72.35, r: 0.32, rod: 74.6 },
  // a dial on each side: its middle's height, its radius; the sound openings in each gable (their foot, their height)
  dial: { y: 24.6, r: 2.9 },
  openings: { y: 32.0, h: 3.6, w: 2.6 },
  // a slit in the shaft under the dial
  slit: { y: 17.2, h: 1.5, w: 0.6 }
};

/** The shaft's four corners (world [x, z]), turned so that its walls face outwards (js/spital-data.js wallFrame) */
export function towerCorners(half = ST_JOHANN.half) {
  const [cx, cz] = ST_JOHANN.centre, [ux, uz] = ST_JOHANN.along, vx = -uz, vz = ux;
  // (u, v) → world; round (−,−), (−,+), (+,+), (+,−): the outside on −u.z, u.x of each side
  return [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, b]) => [cx + (a * ux + b * vx) * half, cz + (a * uz + b * vz) * half]);
}
/** The four sides' frames (a on the left for someone before the side) */
export function towerSides(half = ST_JOHANN.half) {
  const c = towerCorners(half);
  return c.map((a, i) => wallFrame(a, c[(i + 1) % 4]));
}

/** The spire's ring `k` of `rings`: its height, its radius and how far it has turned (rad) */
export function spireRing(k) {
  const { from, radius, tip, twist, rings } = ST_JOHANN.spire, t = k / rings;
  return { y: from + (tip - from) * t, r: radius * (1 - t), turn: twist * t };
}
