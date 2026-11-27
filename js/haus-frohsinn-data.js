// Haus Frohsinn, the apartment house on the slope west of the Central Sporthotel (Davos Platz; js/haus-frohsinn.js):
// its block, the balconies along its south side, the low annex at its north-east corner, the floors' grid, the windows
// of its closed ends and the name on the west end. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1746/1011, batch 8): the block's flat roof at y 2.1 over a rectangle of
// 26.5 × 12.7 m turned some 25° off the east, and the annex's flat roof at −12.06 over the L hugging the block's
// north-east corner (OpenStreetMap's w1529620015, a building of its own there; the batch holds both, so both are
// rebuilt here). Heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The ground falls from −14.9 at
// the west end to −17.4 at the east end. OpenStreetMap's footprint is w116881194. The look after Mapillary's street
// views (CC BY-SA): from the west in 2015 (the closed west end in pale cream plaster with "FROHSINN" in dark letters
// and one column of windows, the balconies along the south side), from the south-east in 2013 (the balcony front: deep
// balconies between the closed ends, dark timber rails, thin white posts, the stone wall under the ground floor's
// terrace where the street falls away; the east end with its windows), from the north-east in 2013 (the north side's
// rows of windows over the low annex). Five floors over a plinth that grows to a storey towards the east.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const HAUS_FROHSINN = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: [{ x: -427.5, z: -163.2, r: 3 }],
  osm: 'w116881194',
  // The block's corners as surveyed: north-west, south-west, south-east, north-east (the roof's edge; its walls stand
  // on it, the roof reaches a little over it)
  ring: [[-438.6, -174.4], [-444.0, -162.9], [-420.0, -151.7], [-414.6, -163.2]],
  top: 2.1, // the roof's top
  fascia: 0.5, // the roof's dark edge (its underside, the timber soffit, at top − fascia)
  eave: 0.3, // how far the roof reaches over the walls
  base: -18.6, // how far down the walls reach (under the street at the east end)
  foot: -14.4, // the ground floor's floor: half a metre over the highest ground, at the west end
  storey: 3.2,
  floors: 5, // the ground floor and four over it; the top floor ends under the soffit
  bay: 3.3, // a window's bay on the long sides
  win: { lo: 0.9, hi: 2.3, half: 0.6 }, // a window in its storey (m up from the floor) and its half width
  door: 0.05, // a balcony door's foot in its storey
  // The balconies: between the closed ends, `depth` m before the south wall (their rails on the survey's south edge),
  // a slab at each floor over the ground floor, the ground floor's terrace on a stone wall; the partitions between the
  // flats and the white posts at shares of the wall's length
  balconies: { depth: 1.7, rail: 1.05, partitions: [1 / 3, 2 / 3], posts: [1 / 6, 1 / 2, 5 / 6] },
  // The closed ends' windows: columns `cols` (m along the wall from its left end, seen from outside)
  ends: {
    west: { cols: [4.6] },
    east: { cols: [4.0, 7.4, 10.8] }
  },
  // The name on the west end: s along the wall (from its north end), at the second floor's windows' height
  name: { s0: 5.8, s1: 9.8, y0: -6.65, y1: -6.15 },
  // The entrance: the ground floor's bay `bay` of the south wall (counted from its middle, west negative)
  entrance: { bay: -3, half: 0.6, height: 2.35 },
  // The chimney on the roof: s along the west end from its north end, `o` m into the roof
  chimney: { s: 3.2, o: 3.0, w: 0.9, d: 0.6, h: 1.2 },
  // The annex at the north-east corner (one floor, flat roof; its west and south edges stand on the block's walls)
  annex: {
    osm: 'w1529620015',
    top: -12.06,
    ring: [[-414.5, -156.6], [-417.1, -157.8], [-414.6, -163.2], [-417.5, -164.6], [-416.7, -166.5], [-411.1, -163.9]],
    door: { w: 2.4, h: 2.2 }
  }
};

const H = HAUS_FROHSINN;
/** A floor's foot: k = 0 the ground floor */
export const floorY = (k) => H.foot + k * H.storey;
/** The roof's underside (the soffit), where the walls end */
export const soffitY = () => H.top - H.fascia;

const unit = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };

/**
 * The block's walls, each a frame (a on the left for someone standing before it): the closed west and east ends over
 * the full depth, the north side, the balconies' outer line on the survey's south edge and the south wall `depth` m
 * behind it. `house`: the outline of the rooms (the south wall set back)
 */
export function walls() {
  const [NW, SW, SE, NE] = H.ring, d = H.balconies.depth;
  const w = unit(SW, NW), e = unit(SE, NE);
  const SWi = [SW[0] + w[0] * d, SW[1] + w[1] * d], SEi = [SE[0] + e[0] * d, SE[1] + e[1] * d];
  return {
    west: wallFrame(NW, SW),
    east: wallFrame(SE, NE),
    north: wallFrame(NE, NW),
    front: wallFrame(SW, SE),
    south: wallFrame(SWi, SEi),
    house: [NW, SWi, SEi, NE]
  };
}

/** The roof's outline: the survey's rectangle grown by the eaves on every side */
export function roofRing() {
  const ring = outwardRing(H.ring), n = ring.length, e = H.eave;
  // each edge moved out by e, the corners where the moved edges meet
  const lines = ring.map((a, i) => { const F = wallFrame(a, ring[(i + 1) % n]); return { p: onWall(F, 0, e), u: F.u }; });
  return lines.map((L, i) => {
    const P = lines[(i + n - 1) % n];
    // P.p + t P.u = L.p + s L.u
    const det = P.u[0] * -L.u[1] - P.u[1] * -L.u[0];
    const dx = L.p[0] - P.p[0], dz = L.p[1] - P.p[1];
    const t = (dx * -L.u[1] - dz * -L.u[0]) / det;
    return [P.p[0] + P.u[0] * t, P.p[1] + P.u[1] * t];
  });
}

/** The outlines the player's walls stand on at the ground: the block with its terrace, the annex */
export const groundOutlines = () => [H.ring, H.annex.ring];

/** Is (x, z) in the annex? */
export const inAnnex = (x, z) => pointInRing(H.annex.ring, x, z);

/** The window columns of the south and north walls: u (m from the wall's middle) of every bay whose window fits */
export function bayCentres(len) {
  const out = [];
  for (let k = -20; k <= 20; k++) if (Math.abs(k * H.bay) + H.win.half + 0.4 <= len / 2) out.push(k * H.bay);
  return out;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
