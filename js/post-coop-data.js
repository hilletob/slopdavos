// The post and Coop block at the Bahnhof Davos Platz (Talstrasse / Bahnhofstrasse, 7270 Davos Platz; js/post-coop.js):
// the post office with its curved roof, the round tower on the Silvrettaplatz, the Coop with its glazed corner tower,
// the shopfront under the square between them. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1744/1005 and 1006: batch 12 the post office, batch 7 the tower, batch 10 the Coop,
// batches 0 and 1 the canopy round the Coop's corner), OpenStreetMap's footprints w97292446 and w1530032380 (the post
// office's two blocks), w97292375 (the Coop) and the Silvrettaplatz; heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js). The forecourt on the Talstrasse lies at y −17.6, the Silvrettaplatz over the shops at −5.9, the
// Bahnhofstrasse along the Coop's west wall at −1.7 to −3.7. The look after two photographs: the east side seen from
// the station's forecourt (the post office's front with its yellow band, the tower before the shopfront, the Coop's
// closed block and its glazed offices) and the Coop's west side on the Bahnhofstrasse (light grey ceramic panels, the
// glazed corner tower under its glass canopy, the round windows of the restaurant).
import { outwardRing, ringArea2, wallFrame } from './spital-data.js';

export const POST_COOP = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [
    { x: -687, z: 419.4, r: 3 }, // the post office
    { x: -649.6, z: 402.5, r: 3 }, // the tower on the square
    { x: -651.2, z: 355.6, r: 3 }, // the Coop
    { x: -652, z: 328.3, r: 3 } // the canopy (two batches)
  ],
  osm: ['w97292446', 'w1530032380', 'w97292375'],
  // The Silvrettaplatz (OSM pedestrian area w1416686972): no level bench of its own (js/path-bench.js), which would fill
  // its edge 2.2 m over the forecourt before the shopfront; it lies on the terrain and the slab
  squareWay: 'w1416686972',
  // The levels: the forecourt, the square over the shops (the shopfronts' floors under it)
  forecourt: -17.6, square: -5.9,
  base: -18.4, // how far down the walls reach
  // The shops' floors (from the forecourt up to the square) and the floors over the square
  shop: { storey: 3.9, window: { lo: 0.55, hi: 3.25, half: 1.12 }, bay: 2.5 },
  upper: { storey: 3.3, window: { lo: 0.9, hi: 2.35, half: 0.72 }, bay: 3.0 },
  // The volumes: walls from the base up to `top` over the outline (world x, z), below the square in ceramic panels with
  // shop windows, over it in `upper` ('render': the post office's plaster, 'panel': the Coop's panels, closed, 'glass':
  // the Coop's offices, on their walls facing east); `windows: false`: closed all the way; `closedEast`: the plaster
  // closed on the front facing the forecourt (east); `roof: 'curved'`: the post office's roof (postRoof)
  parts: [
    { id: 'post-front', upper: 'render', roof: 'curved', closedEast: true,
      ring: [[-690.4, 392.7], [-689.9, 393.1], [-661.2, 412.2], [-673.7, 432.6], [-699.0, 416.6], [-700.1, 418.3], [-702.9, 416.5], [-704.5, 415.5]] },
    { id: 'post-rear', upper: 'render', top: 7.1, closedEast: true,
      ring: [[-702.9, 416.5], [-705.0, 419.8], [-706.8, 418.6], [-712.9, 428.2], [-682.9, 447.2], [-673.7, 432.6], [-699.0, 416.6], [-700.1, 418.3]] },
    { id: 'coop-hall', upper: 'panel', top: 7.36,
      ring: [[-632.8, 356.7], [-633.6, 355.1], [-634.5, 356.5], [-648.4, 347.9], [-645.5, 343.3], [-657.8, 335.7], [-658.7, 334.5], [-659.5, 333.4],
        [-660.1, 332.1], [-660.2, 330.6], [-660.1, 329.7], [-661.2, 331.6], [-675.0, 366.2], [-644.0, 385.8], [-634.0, 369.5], [-639.3, 366.3], [-633.2, 356.4]] },
    { id: 'coop-offices', upper: 'glass', top: 9.65,
      ring: [[-641.6, 337.3], [-643.4, 336.2], [-642.0, 333.9], [-641.0, 334.5], [-640.0, 332.9], [-651.6, 325.7], [-650.8, 326.4], [-649.9, 327.4],
        [-649.2, 328.7], [-648.9, 330.1], [-648.9, 331.5], [-649.3, 332.9], [-650.0, 334.1], [-650.9, 335.1], [-652.2, 335.9], [-653.5, 336.3],
        [-655.0, 336.4], [-656.4, 336.1], [-657.6, 335.5], [-645.5, 343.3], [-648.4, 347.9], [-634.5, 356.5], [-627.4, 345.0], [-635.5, 340.0],
        [-636.5, 341.5], [-642.0, 338.1]] },
    { id: 'coop-offices-south', upper: 'glass', top: 8.76, ring: [[-633.7, 369.7], [-639.3, 366.3], [-633.2, 356.4], [-627.6, 359.9]] },
    { id: 'coop-plant', upper: 'panel', top: 10.67, windows: false,
      ring: [[-636.5, 341.5], [-642.0, 338.1], [-641.6, 337.3], [-643.4, 336.2], [-642.0, 333.9], [-634.6, 338.5]] }
  ],
  // The post office's roof: low over its north front on the square, rising in a curve to the flat at the back; the
  // height over the distance from the north front (m, inwards). Surveyed: 2.2 at 2.2 m, 3.1 at 5.2, 4.8 at 8.4, 6.2 at
  // 12.2, 6.7 at 14.2, 7.5 over the flat behind
  postRoof: { front: [[-690.4, 392.7], [-661.2, 412.2]], profile: [[0, 1.6], [2.2, 2.2], [5.2, 3.1], [8.4, 4.8], [12.2, 6.2], [14.2, 6.8], [16.5, 7.5], [40, 7.5]] },
  // The shopfront under the square, between the post office's east corner and the Coop's (a → b, a on the left for
  // someone on the forecourt), `depth` m deep; the Coop's entrance in it and its sign. It stands 2.5 m before the line
  // between the two corners: the terrain's 8 m grid cannot hold the square's 11.7 m step and ramps up over the cell
  // before it, so the front stands where the ramp is down at the forecourt (the corners' line: 2.5 m behind it)
  // (`garage`: the underground car park's way out beside the tower, where the service road ends)
  shopfront: { a: [-659.1, 413.6], b: [-641.9, 387.2], depth: 13.5, entrance: [21.5, 26.5], entranceTop: -13.4, garage: [4.4, 9.6], garageTop: -13.9 },
  // The tower on the square, before the shopfront: a shaft, the wider drum with its band of windows, the small dome
  tower: { x: -649.8, z: 402.6, shaft: 4.0, drum: 5.2, ledge: -4.6, band: [-2.6, -0.8], top: 2.56, lantern: [3.5, 3.9], tip: 7.4, slot: [-14.6, -6.2] },
  // The Coop's corner tower on the Bahnhofstrasse: panels, glazed on its north-west side (`glass`: the middle of the
  // glazing as a direction and its half angle), the canopy round it at `canopy` (its outer edge, surveyed)
  coopTower: { x: -654.55, z: 330.9, r: 5.6, top: 10.47, base: -6, glass: { dir: [-0.75, -0.66], half: 0.95 },
    canopy: { y: 3.3, thick: 0.28,
      edge: [[-664.2, 333.3], [-662.7, 329.1], [-661.5, 326.7], [-659.9, 324.7], [-658.2, 323.5], [-656.2, 322.9], [-654.0, 322.8], [-651.8, 323.3], [-645.5, 327.2], [-639.7, 331.1]] } },
  // The Coop's west wall on the Bahnhofstrasse (a: its north end, at the corner tower; seen from the street a is on
  // the left): the round windows (s m along it, diameter), the lettering
  coopWest: { a: [-661.2, 331.6], b: [-675.0, 366.2],
    portholes: [[8.4, 2.1], [12.6, 2.1], [16.6, 2.1], [20.6, 2.1], [26.4, 0.85], [28.4, 0.85]],
    restaurant: [1.3, 5.9], sign: [22.6, 27.6] },
  // The post office's east front on the forecourt (a: its south end, on the left; `joint`: where the rear block's wall
  // meets the front block's), the yellow band with the name on the front block's, the round window and the shopping
  // centre's lettering on the rear block's (m along it from a)
  postEast: { a: [-682.9, 447.2], joint: [-673.7, 432.6], b: [-661.2, 412.2], band: [-5.9, -3.7], window: [7.2, 4.6, 2.6], shopping: [2.0, 6.5] }
};

/** The post office's roof height at (x, z) */
export function postRoofY(x, z) {
  const [[ax, az], [bx, bz]] = POST_COOP.postRoof.front;
  const F = wallFrame([ax, az], [bx, bz]);
  // (inwards: the front runs west to east, so wallFrame's normal points into the block)
  const d = (x - ax) * F.n[0] + (z - az) * F.n[1];
  const P = POST_COOP.postRoof.profile;
  if (d <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    if (d <= P[i][0]) { const [d0, y0] = P[i - 1], [d1, y1] = P[i]; const t = (d - d0) / (d1 - d0); return y0 + (y1 - y0) * (t * t * (3 - 2 * t) * 0.35 + t * 0.65); }
  }
  return P[P.length - 1][1];
}

/** A part's roof height at (x, z) */
export const partTop = (part, x, z) => (part.roof === 'curved' ? postRoofY(x, z) : part.top);

/** The bucket of a wall's stretch over the square: the part's `upper`, the offices' glass on their walls facing east */
export function upperBucket(part, F) {
  if (part.upper === 'glass') return F.n[0] > 0.25 ? 'glass' : 'panel';
  return part.upper;
}

/** The Coop's corner tower: is the direction (from its centre) in the glazed side? */
export function inCoopGlass(dx, dz) {
  const T = POST_COOP.coopTower, l = Math.hypot(dx, dz) || 1, g = T.glass.dir, gl = Math.hypot(g[0], g[1]);
  return Math.acos(Math.max(-1, Math.min(1, (dx * g[0] + dz * g[1]) / (l * gl)))) <= T.glass.half;
}

/** The canopy's inner edge: each outer point brought back onto the tower's round or the offices' north wall */
export function canopyInner() {
  const T = POST_COOP.coopTower;
  const north = wallFrame([-640.0, 332.9], [-651.6, 325.7]);
  return T.canopy.edge.map(([x, z]) => {
    const dx = x - T.x, dz = z - T.z, l = Math.hypot(dx, dz);
    if (x < -651) return [T.x + dx / l * T.r, T.z + dz / l * T.r];
    // (onto the wall: back along its normal)
    const off = (x - north.a[0]) * north.n[0] + (z - north.a[1]) * north.n[1];
    return [x - north.n[0] * off, z - north.n[1] * off];
  });
}

/**
 * Lays the terrain's nodes before the shopfront and under the square's slab over it at the forecourt's level (the 8 m
 * grid ramps the square's step out over the forecourt otherwise: a grass bank before the shops). `T`: js/terrain.js
 * TERRAIN ({ cols, rows, cell, minX, minZ, heights }); the nodes from `inside` m behind the front to `outside` m before
 * it, along it with `margin` m beyond its ends (on to the Coop's garage door under its block). Returns how many nodes
 * it lowered.
 */
export function lowerForecourt(T, { inside = 6.5, outside = 10, margin = [3, 10] } = {}) {
  const F = shopfrontFrame(), { a, b } = POST_COOP.shopfront, y = POST_COOP.forecourt + 0.1;
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  let n = 0;
  for (let j = 0; j < T.rows; j++) {
    const z = T.minZ + j * T.cell;
    if (Math.abs(z - mz) > 40) continue;
    for (let i = 0; i < T.cols; i++) {
      const x = T.minX + i * T.cell;
      if (Math.abs(x - mx) > 40) continue;
      const s = (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1], o = (x - F.a[0]) * F.n[0] + (z - F.a[1]) * F.n[1];
      if (s < -margin[0] || s > F.len + margin[1] || o <= -inside || o >= outside) continue;
      const k = j * T.cols + i;
      if (T.heights[k] > y) { T.heights[k] = y; n++; }
    }
  }
  return n;
}

/** The shopfront's frame (a → b, n towards the forecourt) */
export const shopfrontFrame = () => wallFrame(POST_COOP.shopfront.a, POST_COOP.shopfront.b);

export { outwardRing, ringArea2, wallFrame };
