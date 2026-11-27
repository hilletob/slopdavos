// The Hotel Seehof Davos (Promenade 159, 7260 Davos Dorf; js/seehof.js): its volumes, the floors' grids, the old
// hotel's mansards, the tower's hipped roof, the entrance under the tower, the shops along the Promenade, the balconies
// of the new wing. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1752/1023, batch 14, the whole hotel as one building): the roofs' outlines and
// heights below are its flat roofs, each a prism down under the ground; the tower's roof its six sloped triangles;
// heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The Promenade along the south-east front lies
// at y −1 to +1, the hillside behind the hotel climbs to y 12–18. OpenStreetMap's footprint is w117012182. The look
// after Mapillary's street views of 2013–2019 (CC BY-SA), taken from the Promenade and the car park south-east of it:
// - the new wing (south-west half): pale plaster, a low glazed hall with the shops along the street, over it five floors
//   with four stacks of loggia balconies (grey rails, ochre awnings under the slabs), dormers over the eaves and a
//   recessed attic floor with a rail round its roof; at its south-west end a narrower block of eight floors;
// - the tower between the wings: the old hotel's cream and corner stones, seven floors over the ground floor, a hipped
//   roof seen end-on from the street (pointed, with a finial), the entrance with its canopy at its foot;
// - the old hotel (north-east half): cream plaster over a grey rusticated ground floor, the corners in diamond-patterned
//   quoins, tall windows in brown stone surrounds, small iron balconies, a slate mansard with a dormer over every window
//   and the hotel's name standing on its roof; its lower north-east wing ends the same way by the church St. Theodul.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const SEEHOF = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles (St. Theodul's batch is 48 m east)
  exclude: { x: 696.2, z: -1509.8, r: 3 },
  osm: 'w117012182',
  base: -3.0, // how far down the walls reach (under the Promenade)
  // The front towards the Promenade faces south-east: n · SE > 0 (a wall's outward normal, x east, z south)
  se: [0.77, 0.64],
  // Two grids of floors: the new wing's low storeys and the old hotel's tall ones (the ground floor's top at 5.0, the
  // rusticated base under it)
  storey: { modern: 2.7, old: 3.3 },
  plinth: 5.0,
  // The volumes, each a flat roof at `top` over its outline (world x, z). `style`: modern (pale plaster, the new wing
  // and the annexes on the hill), old (cream, quoins; `mansard`: the walls end at `eave`, a slate slope `inset` m deep
  // rises to the top), shop (the glazed hall and the shops along the street; `collide`: outside OpenStreetMap's
  // footprint, so its walls are colliders). `line`: a floor's top on the part's grid
  parts: [
    // the shops' front along the Promenade, one tall floor (the Paarsenn's red fascia)
    { id: 'shops', style: 'shop', top: 5.62, collide: true, fascia: [4.3, 5.62],
      ring: [[694.6, -1482.0], [696.7, -1480.4], [691.5, -1473.5], [686.4, -1477.4], [686.9, -1478.1], [688.0, -1477.3], [693.0, -1484.2], [703.1, -1497.8],
        [705.2, -1500.8], [707.6, -1498.8], [701.1, -1490.4]] },
    // the glazed hall behind it, the length of the new wing (the shops under it, a glazed floor over them)
    { id: 'hall', style: 'shop', top: 8.77, collide: true, fascia: [4.3, 5.62],
      ring: [[668.0, -1470.8], [670.2, -1473.4], [674.3, -1470.0], [702.1, -1503.5], [705.2, -1500.8], [688.0, -1477.3], [686.9, -1478.1], [677.4, -1466.2]] },
    // the new wing round its attic (five floors over the hall, eight at the south-west block), and the attic
    { id: 'wing', style: 'modern', top: 22.27, line: 22.27,
      ring: [[655.0, -1481.5], [667.8, -1470.5], [670.2, -1473.4], [674.3, -1470.0], [702.1, -1503.5], [702.3, -1503.7], [701.7, -1504.2], [690.1, -1514.2],
        [693.2, -1517.8], [693.7, -1518.4], [705.9, -1508.0], [706.2, -1508.3], [691.0, -1521.4], [676.3, -1503.6], [679.3, -1501.0], [681.7, -1503.6],
        [679.1, -1505.7], [685.1, -1512.9], [692.6, -1506.4], [691.7, -1505.3], [695.0, -1502.5], [674.9, -1479.1], [676.8, -1477.4], [672.6, -1472.5],
        [656.9, -1486.2], [658.7, -1488.3], [658.3, -1488.3], [656.8, -1489.6], [652.7, -1485.6], [656.0, -1482.8]] },
    { id: 'attic', style: 'modern', top: 24.93, line: 24.97, rail: true,
      ring: [[656.9, -1486.2], [672.6, -1472.5], [676.8, -1477.4], [674.9, -1479.1], [695.0, -1502.5], [691.7, -1505.3], [692.6, -1506.4], [685.1, -1512.9],
        [679.1, -1505.7], [681.7, -1503.6], [679.3, -1501.0], [674.6, -1505.1], [657.5, -1489.3], [658.4, -1488.5]] },
    // the annexes on the hillside behind (kitchens, staff): plain, flat-roofed
    { id: 'annex-west', style: 'modern', top: 10.91, line: 10.61,
      ring: [[702.0, -1526.0], [703.2, -1527.6], [705.9, -1525.5], [702.0, -1521.0], [700.7, -1519.4], [696.8, -1522.8], [693.6, -1519.1], [691.0, -1521.4],
        [690.2, -1520.7], [694.7, -1525.2], [695.4, -1524.6], [698.7, -1522.0]] },
    { id: 'annex-north', style: 'modern', top: 10.91, line: 10.61,
      ring: [[701.9, -1537.5], [706.2, -1540.5], [711.0, -1536.3], [705.3, -1529.7], [707.8, -1527.7], [717.8, -1539.4], [718.1, -1539.2], [722.4, -1544.9],
        [717.9, -1550.2], [702.5, -1538.1]] },
    { id: 'annex-high', style: 'modern', top: 14.34, line: 14.04,
      ring: [[701.9, -1537.5], [706.2, -1540.5], [711.0, -1536.3], [705.3, -1529.7], [704.4, -1530.4], [698.9, -1534.9], [700.6, -1536.6]] }, // (a 0.5 m zigzag left out)
    { id: 'annex-stair', style: 'modern', top: 14.85, line: 14.55,
      ring: [[705.9, -1525.5], [707.8, -1527.7], [698.9, -1534.9], [691.5, -1527.8], [698.7, -1522.0], [703.2, -1527.6]] },
    // the old hotel: the ground floor and three over it to the cornice, the mansard over them (the risalit on its east
    // corner: a 0.8 m kink of its side left out)
    { id: 'old', style: 'old', top: 19.68, line: 14.9, mansard: { eave: 14.9, inset: 1.4 },
      ring: [[730.5, -1525.4], [732.4, -1524.3], [730.0, -1519.9], [728.0, -1519.9], [725.5, -1515.4], [716.1, -1520.9], [705.9, -1508.6], [693.6, -1519.1], [696.8, -1522.8], [700.7, -1519.4],
        [717.8, -1539.4], [722.8, -1535.2], [724.6, -1537.0], [733.4, -1531.4]] },
    // ... and its north-east wing, a floor lower
    { id: 'old-east', style: 'old', top: 16.21, line: 11.6, mansard: { eave: 11.6, inset: 1.3 },
      ring: [[730.0, -1533.5], [739.3, -1546.0], [729.0, -1553.7], [718.1, -1539.2], [722.8, -1535.2], [724.6, -1537.0]] },
    // the tower: its walls to the eaves, the hipped roof over them (js/seehof.js), seven floors over the ground floor
    { id: 'tower', style: 'old', top: 25.1, line: 24.8, quoins: true,
      ring: [[690.1, -1514.2], [703.0, -1503.0], [706.7, -1507.3], [693.7, -1518.4]] }
  ],
  // The tower's hipped roof: from its walls' top to the ridge (surveyed: two points at y 27.8), a finial on the end
  // over the street
  towerRoof: { eave: 25.1, ridge: [[693.8, -1514.4], [702.4, -1507.1]], top: 27.8, finial: 2.6 },
  // The entrance at the tower's foot, on its face to the street (a → b as wallFrame wants it): the doors, the canopy
  // over them with the name on its edge. js/missions-data-gastro.js's door (707.1, −1505.6) stands a metre before it
  entrance: { a: [703.0, -1503.0], b: [706.7, -1507.3], door: { s: 4.1, w: 2.2, y0: 0.4, y1: 3.3 }, canopy: { out: 3.0, y: 3.7, thick: 0.32, over: 0.3 } },
  // The loggia balconies of the new wing over the hall: stacks along its front (m along it from its south-west end:
  // the middle and the width), a slab at each floor from `y0` up, `out` m before the wall
  balconies: { a: [674.3, -1470.0], b: [702.1, -1503.5], stacks: [[4.2, 4.6], [15.6, 4.6], [27.0, 4.6], [38.6, 4.6]], out: 1.6, y0: 11.47, floors: 5, rail: 1.0 },
  // The dormers over the new wing's front, between the stacks (m along the same wall), on its roof at the eaves
  dormers: { at: [9.0, 10.8, 20.4, 22.2, 31.8, 33.6, 41.6], half: 0.7, depth: 1.6, height: 2.1 },
  // The old hotel's iron balconies: on its fronts to the street, at every other window of these floors (their floor)
  ironBalconies: { floors: [8.3, 11.6], half: 0.85, out: 0.75 },
  // The hotel's name standing on the old hotel's mansard over its front by the tower (over the ring's wall `wall`, in the
  // middle of the mansard's top edge there), and the windows: bays along a wall from its middle, the corner stones' width
  name: { part: 'old', wall: [705.9, -1508.6, 716.1, -1520.9], w: 11.0, h: 1.15 },
  bay: { modern: 2.6, old: 3.1 },
  quoin: 0.8
};

/** A part by its id */
export const part = (id) => SEEHOF.parts.find((p) => p.id === id);

/**
 * A ring moved `d` m inwards (mitred: each wall parallel to its own, the corners where the moved walls meet), turned as
 * outwardRing turns it, its points one for one with that ring's
 */
export function insetRing(ring, d) {
  const R = outwardRing(ring), n = R.length;
  const N = R.map((a, i) => wallFrame(a, R[(i + 1) % n]).n);
  return R.map((p, i) => {
    const n1 = N[(i - 1 + n) % n], n2 = N[i];
    const k = d / Math.max(0.3, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] - (n1[0] + n2[0]) * k, p[1] - (n1[1] + n2[1]) * k];
  });
}

/** Do two walls of a ring cross (other than at their shared corners)? */
export function selfCrosses(ring) {
  const n = ring.length;
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = ring[i], b = ring[(i + 1) % n], c = ring[j], e = ring[(j + 1) % n];
      if (side(a, b, c) * side(a, b, e) < 0 && side(c, e, a) * side(c, e, b) < 0) return true;
    }
  }
  return false;
}

/** Does the wall a → b face the street (south-east)? */
export const facesStreet = (F, min = 0.5) => F.n[0] * SEEHOF.se[0] + F.n[1] * SEEHOF.se[1] > min;

/** The part of the hotel a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of SEEHOF.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** The middles of the windows' bays along a wall `len` m long (as the wall's material lays them out from its middle) */
export function bays(len, bay, half, winHalf = 0.6) {
  const out = [];
  for (let k = -Math.floor(half / bay) - 1; k <= Math.floor(half / bay) + 1; k++) if (Math.abs(k * bay) + winHalf + 0.4 <= half) out.push(len / 2 + k * bay);
  return out;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
