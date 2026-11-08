import { nearestBerlinRoad } from './berlin-geometry.js';

// js/bus-bays.js — the bus bays (Haltebuchten): at these stops the street widens for the bus to pull in, out of the
// lane. OSM doesn't map them (no bus_bay tags in Davos); they were read off the 0.1 m SWISSIMAGE by eye, where the
// stop's yellow zigzag lies in the widening beside the through lane. Each by its stop's kerb marking
// (js/traffic-signs-data.js `mark`), a standard depth of 3 m (the photo's blur and the map's streets lying a metre or
// two off it don't allow a measured one).
// busBaySegments(): carriageway pieces for js/city-grid.js (the bay: the zigzag's length and 1 m either end at full
// depth, a 6 m taper either side at half of it, each reaching 0.6 m into the street), so that the asphalt, the curbs
// (the street's own is clipped where the bay lies) and the sidewalk behind follow; busBayShift(mark): how far the
// stop's post, zigzag and bench move out into it (js/traffic-signs.js).
export const BUS_BAY_MARKS = [
  [-2220.19, 3251.91, -2231.52, 3260.14], [-2206.47, 3250.59, -2194.97, 3242.62], // Landwasserstrasse, Frauenkirch
  [-1386.68, 1424.75, -1394.3, 1436.5], [-1395.57, 1453.44, -1389.53, 1440.82], // Landwasserstrasse, Spinabad
  [-1153.67, 892.56, -1162.08, 903.75], // Promenade, Islen
  [-150.45, -217.79, -159.97, -207.53], [-157.32, -202.46, -147.8, -212.72], // Talstrasse, Coop Pronto
  [232.35, -472.07, 220.31, -464.93], [221.32, -459.25, 233.36, -466.39], // Talstrasse
  [872.77, -1595.52, 864.13, -1584.5], [868.3, -1578.63, 876.94, -1589.65], // Bahnhofstrasse, Davos Dorf
  [1296.5, -1852.83, 1282.52, -1852.06], [1588.44, -1782.86, 1602.04, -1779.54], [1624.04, -1783.29, 1610.44, -1786.62],
  [1755.3, -1760.95, 1769.3, -1761.21], // Flüelastrasse
  // (confirmed by someone who knows them)
  [-651.26, 262.76, -653.54, 276.57], // Promenade
  [-345.63, 4.12, -337.05, -6.94], // Talstrasse
  [5.74, -629.91, 19.73, -630.45], // Promenade
  [232.02, -644.15, 218.03, -643.68], [216.25, -638.22, 230.24, -638.68], // Promenade, Eisstadion
  [493.34, -850, 489.78, -836.46], [494.48, -833.1, 498.04, -846.64], // Promenade
  [573.39, -1200.92, 570.96, -1187.13], // Promenade
  [1107.01, -1785.91, 1120.22, -1790.53] // Flüelastrasse
];
export const BUS_BAY_DEPTH = 3;
const OVERLAP = 0.6, TAPER = 6, END = 1;

const sameMark = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 0.05);

/** The bay of a stop's mark: { nx, nz (out of the street), depth, near (the street's segment), half, t0, t1 } or null */
function bayOf(mark) {
  const [ax, az, bx, bz] = mark, mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const near = nearestBerlinRoad(mx, mz, 10);
  if (!near) return null;
  let nx = mx - near.x, nz = mz - near.z;
  const nl = Math.hypot(nx, nz);
  if (nl < 0.5) return null;
  nx /= nl; nz /= nl;
  const ta = (ax - near.x) * near.ux + (az - near.z) * near.uz, tb = (bx - near.x) * near.ux + (bz - near.z) * near.uz;
  return { nx, nz, depth: BUS_BAY_DEPTH, near, half: near.width / 2, t0: Math.min(ta, tb), t1: Math.max(ta, tb) };
}

/** How far a stop moves out into its bay: { x, z } (0, 0 for a stop without one) */
export function busBayShift(mark) {
  if (!mark || !BUS_BAY_MARKS.some((m) => sameMark(m, mark))) return { x: 0, z: 0 };
  const b = bayOf(mark);
  return b ? { x: b.nx * b.depth, z: b.nz * b.depth } : { x: 0, z: 0 };
}

let segments = null;
/** The bays' carriageway pieces, in the form of berlin-geometry.js berlinRoadSegments */
export function busBaySegments() {
  if (segments) return segments;
  segments = [];
  BUS_BAY_MARKS.forEach((mark, k) => {
    const b = bayOf(mark);
    if (!b) return;
    const { near, nx, nz, half, depth } = b, ux = near.ux, uz = near.uz;
    // (which side of the street: index 1 of a road's sidewalk is its left, js/city-grid.js stripPoints)
    const left = nx * -uz + nz * ux > 0, own = near.road.sidewalk?.[left ? 1 : 0] || 0;
    const piece = (t0, t1, d, part) => {
      const width = d + OVERLAP, c = half - OVERLAP + width / 2;
      const P = (t) => ({ x: near.x + ux * t + nx * c, z: near.z + uz * t + nz * c });
      const a = P(t0), bb = P(t1), len = t1 - t0;
      // the sidewalk behind the bay where the street's own is narrower than the bay is deep (else what's left of it stays)
      const sidewalk = own && own <= d ? (left ? [0, own] : [own, 0]) : null;
      const road = { id: `bay${k}${part}`, kind: 'tertiary', name: near.road.name, width, oneway: true, bay: true, sidewalk,
        pts: [a.x, a.z, bb.x, bb.z] };
      segments.push({ a, b: bb, len, road, width, ux, uz, pedestrian: false, bridge: false });
    };
    piece(b.t0 - END - TAPER, b.t0 - END, depth / 2, 'a');
    piece(b.t0 - END, b.t1 + END, depth, 'b');
    piece(b.t1 + END, b.t1 + END + TAPER, depth / 2, 'c');
  });
  return segments;
}

/** The bays where a bus pulls in: [{ ax, az, bx, bz (the zigzag), cx, cz, nx, nz (out of the street), half, depth }] */
export function busBays() {
  return BUS_BAY_MARKS.map((mark) => {
    const b = bayOf(mark);
    if (!b) return null;
    const [ax, az, bx, bz] = mark;
    return { ax, az, bx, bz, cx: (ax + bx) / 2, cz: (az + bz) / 2, nx: b.nx, nz: b.nz, half: b.half, depth: b.depth };
  }).filter(Boolean);
}
