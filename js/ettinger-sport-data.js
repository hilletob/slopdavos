// The house of Ettinger Sport on the Promenade in Davos Dorf (OpenStreetMap w117012151; js/ettinger-sport.js): its
// volumes, the floors' grid, the shop fronts on the Promenade, the entrance under the arch, the balcony, the lettering
// and the timber railing on the shop wing's roof. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1752/1022, batch 9; floor on y −3.4, the Promenade's level before it): the roofs'
// outlines and heights below are its flat roofs, each a prism down to the ground; heights in the world frame
// (y = m a.s.l. − 1558, js/davos-frame.js). The batch holds three things: the house on the Promenade's north-west side
// (its south-western block at 7.79, two floors over the shop floor; the shop wing at 4.66 along the Promenade to the
// Parsennbahn's station), the low hall behind them in the slope (the same roof at 4.66, outside OpenStreetMap's
// footprint, round the house w117138549, whose ground lies at +1.5 to +2.5: it shows 2–3 m of wall) and a small box at
// that house's north corner. The ground behind rises from −3.4 on the Promenade to +2 in the yard.
// The look after Mapillary's street views of 2013 and 2015: from the north-east along the Promenade (the shop wing:
// a tall shop floor of big panes between dark timber posts on a granite plinth, a blue awning, a cream fascia with
// "ettinger sport" and "snowboard" in grey letters, a dark timber railing round its roof; the cream corner of the block
// standing a little forward with a big arch over the entrance's steps, a faded painting over it, two lamps on its
// head; the balcony under a slab beside it; cream plaster with two floors of windows over the shop floor), and from
// the south up the Promenade (the block's south-south-west end: a shop floor under two floors in dark timber). The
// block's north-west back and the hall behind are not in any photograph: guessed (plaster, few windows).
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const ETTINGER_SPORT = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: 631.8, z: -1409.5, r: 3 },
  osm: 'w117012151',
  shop: 'n1086729100', // Ettinger Sport (js/shops-data.js): lettered here, no generic sign
  street: -3.4, // the Promenade before the shop fronts
  base: -5.0, // how far down the walls reach
  storey: 3.15,
  // The volumes, each a flat roof at `top` over its outline (world x, z). `line`: an upper floor's top (the windows'
  // grid counts down from it); `ground`: the shop floor's top (the fascia's)
  parts: [
    // the block: the shop floor, two floors over it, a roof slab on top
    { id: 'block', top: 7.79, line: 7.5, ground: 1.2,
      ring: [[615.4, -1393.1], [615.8, -1392.5], [627.3, -1384.4], [628.3, -1384.3], [629.3, -1384.4], [630.4, -1385.0], [637.5, -1395.1], [638.2, -1394.6],
        [641.5, -1399.4], [627.1, -1409.4], [621.7, -1401.7], [620.9, -1402.3], [615.4, -1394.3], [615.3, -1393.6]] },
    // the shop wing along the Promenade and the hall behind it in the slope, one roof
    { id: 'wing', top: 4.66, line: 1.2, ground: 1.2,
      ring: [[629.8, -1425.3], [629.8, -1427.9], [631.7, -1429.9], [631.6, -1431.1], [645.0, -1421.7], [645.6, -1421.9], [653.4, -1416.5], [641.5, -1399.4],
        [627.1, -1409.4], [621.7, -1401.7], [620.9, -1402.3], [609.9, -1409.9], [617.7, -1421.0], [618.9, -1421.2], [621.8, -1418.9], [625.0, -1419.2],
        [625.5, -1419.8], [626.7, -1419.9], [628.2, -1421.9], [628.2, -1423.2]] },
    // the small box at the neighbour's north corner (closed)
    { id: 'shed', top: 4.66, line: 1.2, ground: 1.2, windows: false, ring: [[626.6, -1433.8], [627.0, -1434.3], [628.4, -1433.3], [626.6, -1433.0]] }
  ],
  // The walls by what they show (a, b as in the part's ring, either way round)
  fronts: {
    // the shop wing on the Promenade (its south-east wall): plinth, glazing, awning, fascia with the lettering
    wing: [[653.4, -1416.5], [641.5, -1399.4]],
    // the block's shop floor on the Promenade (south-east) and at its south-south-west end
    blockSE: [[630.4, -1385.0], [637.5, -1395.1]],
    blockSSW: [[615.8, -1392.5], [627.3, -1384.4]],
    // the corner standing forward, with the arch
    tower: [[638.2, -1394.6], [641.5, -1399.4]]
  },
  // walls whose upper floors are dark timber (the block's south-south-west end)
  timber: [[[615.8, -1392.5], [627.3, -1384.4]]],
  // walls without windows: the shop wing's end at the station, the tower's face
  closed: [[[653.4, -1416.5], [645.6, -1421.9]], [[638.2, -1394.6], [641.5, -1399.4]], [[637.5, -1395.1], [638.2, -1394.6]]],
  // The shop wing's front: the granite plinth over the street, the glazing up to the awning, the fascia over it;
  // the dark posts between the panes (m along the wall, from its south-west end), the lettering (from, to, y0, y1)
  shopFront: {
    plinth: 0.55, glassTop: 1.0, awning: { rise: 0.5, out: 0.85 }, cornice: [4.36, 4.66], post: 0.32, bay: 3.45,
    letters: [{ key: 'ettinger', from: 1.6, to: 9.4, y0: 2.2, y1: 3.5 }, { key: 'snowboard', from: 11.6, to: 17.6, y0: 2.3, y1: 3.45 }]
  },
  // The railing round the shop wing's roof: on its front and its end at the station (dark timber, boards with cut-outs)
  railing: { end: [[653.4, -1416.5], [645.6, -1421.9]], height: 0.95, post: 2.4 },
  // The arch in the tower's face: its width, the springing over the street, the recess, the steps up to the door; the
  // painting over it, the two lamps on its head
  arch: { width: 3.5, spring: -0.3, depth: 1.4, steps: 4, rise: 0.17, tread: 0.32, mural: { w: 3.2, y0: 2.0, y1: 6.2 }, lamps: [1.1, 4.7] },
  // The balcony beside the tower: the survey's strip before the block's front (its roof at 4.66), the floor at the
  // first floor
  balcony: { ring: [[636.1, -1391.7], [638.2, -1394.6], [637.5, -1395.1], [635.4, -1392.2]], floor: 1.2, rail: 1.05, roof: [4.46, 4.66] },
  // the roof slab over the block, out over its walls
  eaves: 0.45
};

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is the wall a → b the wall `w` ([a, b], either way round)? */
export const isWall = (w, a, b) => (near(w[0], a) && near(w[1], b)) || (near(w[0], b) && near(w[1], a));
/** The part with the id */
export const part = (id) => ETTINGER_SPORT.parts.find((p) => p.id === id);
/** What the wall a → b shows: 'wing', 'blockSE', 'blockSSW', 'tower' or null */
export function frontOf(a, b) {
  for (const [k, w] of Object.entries(ETTINGER_SPORT.fronts)) if (isWall(w, a, b)) return k;
  return null;
}
export const isTimber = (a, b) => ETTINGER_SPORT.timber.some((w) => isWall(w, a, b));
export const isClosed = (a, b) => ETTINGER_SPORT.closed.some((w) => isWall(w, a, b));

/** A named wall's frame, outward (a on the left for someone before it) */
export function frontFrame(w) {
  for (const p of ETTINGER_SPORT.parts) {
    const ring = outwardRing(p.ring);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (isWall(w, a, b)) return wallFrame(a, b);
    }
  }
  return null;
}

/** The balcony in the frame of the block's front behind it: { F, from, to, out } (m along the front, m out of it) */
export function balconyFrame() {
  const F = frontFrame(ETTINGER_SPORT.fronts.blockSE);
  let from = Infinity, to = -Infinity, out = 0;
  for (const [x, z] of ETTINGER_SPORT.balcony.ring) {
    const dx = x - F.a[0], dz = z - F.a[1];
    const s = dx * F.u[0] + dz * F.u[1], o = dx * F.n[0] + dz * F.n[1];
    from = Math.min(from, s); to = Math.max(to, s); out = Math.max(out, o);
  }
  return { F, from: Math.max(0, from), to: Math.min(F.len, to), out };
}

/** The part a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of ETTINGER_SPORT.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** An outward ring (wallFrame's turn) moved `d` m out of its walls, its corners mitred (the roof slab's edge) */
export function offsetRing(ring, d) {
  return ring.map((p, i) => {
    const n1 = wallFrame(ring[(i - 1 + ring.length) % ring.length], p).n, n2 = wallFrame(p, ring[(i + 1) % ring.length]).n;
    const f = d / Math.max(0.3, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * f, p[1] + (n1[1] + n2[1]) * f];
  });
}

/** The outlines the player's walls stand on at the ground (the balcony hangs over it: left out) */
export const groundOutlines = () => ETTINGER_SPORT.parts.map((p) => p.ring);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
