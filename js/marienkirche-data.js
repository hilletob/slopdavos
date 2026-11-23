// The Marienkirche (the Roman Catholic church of Davos Platz, above the Promenade by the Strelastrasse;
// js/marienkirche.js): the tower before the north end of the nave, the transept, the choir, the sacristy. Its measures.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1743/1009, batches 3: the tower, 13: the nave, 7: the transept, 10: the sacristy;
// tile 11/1743/1008, batch 8: the choir), heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js), each
// floor on the lowest ground under it as the streamed tiles set it. The survey's roofs are kept: the nave's ridge with
// its hip over the choir, the transept's gables, the tower's low roof under the spire. The church stands 11.6° off the
// frame's axes: everything below is in its own frame, `a` m east and `b` m south of the tower's middle (toWorld). The
// look after a photograph of the tower from the north-west (davoskath.ch, "MK_DSC3701.jpg"): white plaster, quoins
// of grey stone, a plinth of rubble, three courses round the tower, round-arched windows in white surrounds, an oval
// sound opening on each side under the timber belfry, its wide roof, the slim spire with a gilt ball and a cross.
import { wallFrame } from './spital-data.js';

export const MARIENKIRCHE = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles (the next one, a house to the south,
  // is 12 m from the choir's)
  exclude: [
    { x: -838.9, z: 55.0, r: 1 }, // the tower
    { x: -843.0, z: 72.2, r: 1 }, // the nave
    { x: -842.0, z: 69.3, r: 1 }, // the transept
    { x: -846.7, z: 88.5, r: 1 }, // the choir
    { x: -835.5, z: 83.7, r: 1 } // the sacristy
  ],
  osm: 'w117012114',
  origin: [-838.95, 55.1], // the tower's middle (world x, z)
  east: [0.9797, 0.2004], // the direction of `a` (the direction of `b` is this turned a quarter to the south)
  base: 24, // how far down the walls reach (the ground: 28.5 east of the church, 33 west of it)
  plinth: 34.0, // the top of the rubble plinth, the tower's first course
  tower: {
    half: 4.5, // half the square shaft's side
    courses: [34.0, 43.0, 51.6], // the three courses round the shaft
    masonry: 60.0, // the plaster's top, the belfry's foot
    walls: 65.3, // the belfry's top, inside the roof
    // the roof: from the eaves (half the square's side, its height) by a kink up to the spire's foot
    roof: [{ half: 6.1, y: 64.2 }, { half: 4.0, y: 65.6 }, { half: 1.7, y: 68.4 }],
    spire: { from: 68.2, radius: 1.75, tip: 80.7, sides: 8 },
    ball: { y: 81.0, r: 0.32 },
    cross: { top: 83.1, arm: 82.4, span: 0.84 },
    // the windows on each free side: [the middle's height, width, height]
    windows: [[38.1, 1.9, 3.5], [47.2, 1.35, 2.5]],
    oval: { y: 55.9, w: 2.7, h: 3.1 }
  },
  // The parts under the roofs: a rectangle each ([a0, a1, b0, b1]: west, east, north, south)
  nave: { rect: [-7.8, 6.8, 1.5, 33.8], axis: -0.5, eaves: 44.7, over: 0.95, ridge: 53.7, ridgeEnd: 26.9 },
  transept: { rect: [-13.0, 12.7, 7.2, 22.0], axis: 14.6, eaves: 45.0, over: 1.0, ridge: 53.2 },
  choir: { rect: [-4.8, 3.8, 33.8, 36.5], axis: -0.5, eaves: 46.5, over: 1.05, ridge: 52.3, ridgeEnd: 32.6, ridgeFrom: 28.0 },
  sacristy: { rect: [6.8, 13.4, 22.0, 33.8], top: 35.8 },
  // the nave's tall windows: width, height, the sill's height
  window: { w: 1.5, h: 4.8, y: 36.6 }
};

const M = MARIENKIRCHE;
/** The world point `a` m east and `b` m south of the tower's middle: [x, z] */
export function toWorld(a, b) {
  const [ex, ez] = M.east;
  return [M.origin[0] + a * ex - b * ez, M.origin[1] + a * ez + b * ex];
}
/** A rectangle's four walls ([a0, a1, b0, b1]), each a wallFrame (its left end first for someone before it) with its
 *  side's name */
export function rectWalls([a0, a1, b0, b1]) {
  const W = (side, p, q) => ({ side, ...wallFrame(toWorld(...p), toWorld(...q)) });
  return {
    north: W('north', [a1, b0], [a0, b0]),
    west: W('west', [a0, b0], [a0, b1]),
    south: W('south', [a0, b1], [a1, b1]),
    east: W('east', [a1, b1], [a1, b0])
  };
}
/** A rectangle's corners in the world, in the walls' order */
export const rectRing = ([a0, a1, b0, b1]) => [[a1, b0], [a0, b0], [a0, b1], [a1, b1]].map((p) => toWorld(...p));

const T = M.tower;
export const towerRect = (half = T.half) => [-half, half, -half, half];

/** A gabled roof's height over a point `d` m from its ridge's line (a part with eaves, over, ridge, and its half width) */
export function roofHeight(part, halfWidth, d) {
  const run = halfWidth + part.over;
  return part.ridge - (part.ridge - part.eaves) * Math.min(1, Math.abs(d) / run);
}
/** Half the widths the roofs span: the nave's and the choir's across `a`, the transept's across `b` */
export const halfWidths = () => ({
  nave: (M.nave.rect[1] - M.nave.rect[0]) / 2,
  transept: (M.transept.rect[3] - M.transept.rect[2]) / 2,
  choir: (M.choir.rect[1] - M.choir.rect[0]) / 2
});

/**
 * The decals on the walls: { part, side, key, s0, s1, y0, y1 } (s along the wall from its left end, m). The tall windows
 * of the nave and the transept, the small ones beside the tower and on the sacristy, the tower's windows, ovals and
 * belfry. (The tower's south side is the nave's: only the oval and the belfry there. The quoins and the plinth's
 * rubble are laid by js/marienkirche.js along whole walls.)
 */
export function decals() {
  const out = [];
  const put = (part, F, key, mid, w, y0, h) => out.push({ part, side: F.side, key, s0: mid - w / 2, s1: mid + w / 2, y0, y1: y0 + h });
  const tw = rectWalls(towerRect());
  for (const F of Object.values(tw)) {
    const mid = F.len / 2;
    if (F.side !== 'south') {
      for (const [y, w, h] of T.windows) put('tower', F, 'towerArch', mid, w, y - h / 2, h);
    }
    put('tower', F, 'oval', mid, T.oval.w, T.oval.y - T.oval.h / 2, T.oval.h);
    put('tower', F, 'belfry', mid, F.len - 0.5, T.masonry + 0.35, 3.7);
  }
  put('tower', tw.north, 'slit', tw.north.len / 2, 0.55, M.plinth - 3.2, 1.1);
  const win = M.window;
  // the transept: three tall windows in each gable end (the middle one a little higher), a round one in the gable;
  // one in each arm's north and south wall
  const tr = rectWalls(M.transept.rect), nv = rectWalls(M.nave.rect);
  for (const F of [tr.west, tr.east]) {
    const mid = F.len / 2;
    for (const k of [-1, 0, 1]) put('transept', F, 'arch', mid + k * 3.3, win.w, win.y + (k ? 0 : 0.5), win.h);
    put('transept', F, 'oculus', mid, 1.3, 48.0, 1.3);
  }
  const armW = (M.nave.rect[0] - M.transept.rect[0]) / 2, armE = (M.transept.rect[1] - M.nave.rect[1]) / 2;
  // (north wall: its left end is the east one; south wall: the west one)
  put('transept', tr.north, 'arch', armE, win.w, win.y, win.h);
  put('transept', tr.north, 'arch', tr.north.len - armW, win.w, win.y, win.h);
  put('transept', tr.south, 'arch', armW, win.w, win.y, win.h);
  // the nave: a row of three small windows beside the tower, two tall ones between the transept and the choir
  const before = (M.transept.rect[2] - M.nave.rect[2]) / 2, after = M.nave.rect[3] - M.transept.rect[3];
  put('nave', nv.west, 'triple', before + 0.3, 2.7, M.plinth + 1.0, 1.75);
  put('nave', nv.east, 'triple', nv.east.len - before - 0.3, 2.7, M.plinth + 1.0, 1.75);
  for (const t of [0.3, 0.72]) {
    put('nave', nv.west, 'arch', nv.west.len - after + after * t, win.w, win.y, win.h);
    put('nave', nv.east, 'arch', after - after * t, win.w, win.y + 0.9, win.h - 0.9); // (over the sacristy's roof)
  }
  const sc = rectWalls(M.sacristy.rect);
  put('sacristy', sc.east, 'triple', sc.east.len / 2, 2.7, 32.3, 1.75);
  put('sacristy', sc.south, 'triple', sc.south.len / 2, 2.7, 32.3, 1.75);
  return out;
}
