// The Turmhotel Victoria (Alte Flüelastrasse 2, 7260 Davos Dorf; js/turmhotel-victoria.js): its volumes, the round
// tower with its helm, the floors' grid, the balconies on the south front, the staff door of the mission, the lettering.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1754/1025, batch 10: the tower, batch 6: the hotel and, on its west, a piece of the
// neighbour w117012159): the roofs' outlines and heights below are its flat roofs, each a prism down under the ground,
// and the tower's sloped triangles (a flared helm from r 4 at y 19.8 to r 3 at 21.4, up to its tip at 26.0); heights in
// the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The forecourt on the south lies at y 2.7–3.3, the ground
// falls to 1.4 along the north-east side. OpenStreetMap's footprint is w117012157 (up to 1.1 m off the surveyed walls).
// Mapillary's street views (CC BY-SA): from the east (2021, 2025) the old white hotel with the round tower at its
// south-east corner under a pointed red-brown helm with a flag, arched windows in pairs with red-and-white striped
// shutters, the name in an oval and "Turm Stübli · Fondue" round the tower over the arches of its ground floor, five
// floors of plain windows on the north-east face with a roof terrace over them and the attic behind; from the south
// (2014) the south front with a balcony before every bay (pale concrete sides, larch rails), the terrace's rail along
// its roof, the attic set back under wide timber eaves, flags on the roof. The north-west side and the hotel's entrance
// are guessed; the low block on the west (the neighbour's piece the survey's batch holds) is guessed plain.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';
import { bays } from './seehof-data.js';

export const TURMHOTEL_VICTORIA = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [{ x: 981.7, z: -1751.1, r: 3 }, { x: 956.9, z: -1750.7, r: 3 }],
  osm: 'w117012157',
  // the hotel's point in OSM, where js/shops.js hangs its generic sign (the tower carries the name here)
  shop: 'n623883946',
  // OpenStreetMap's footprint (its walls were js/buildings.js' colliders)
  footprint: [[956.6, -1773.9], [971.6, -1763.0], [971.8, -1762.0], [983.3, -1754.5], [985.5, -1752.3], [985.7, -1750.8], [985.4, -1749.2], [983.9, -1747.9], [981.7, -1747.5], [980.1, -1747.1], [955.7, -1743.1], [945.6, -1755.5], [944.4, -1757.0]],
  storey: 2.9,
  bay: 3.1,
  base: -0.5, // how far down the walls reach
  // The volumes, each a flat roof at `top` over its outline (world x, z). `line`: the top floor's top (the windows' grid
  // counts down from it), the wall from there to the roof a closed parapet. `neighbour`: the piece of w117012159 that
  // swissBUILDINGS3D's batch 6 holds (rebuilt plain, its walls stay OSM's)
  parts: [
    // the front: five floors along the south front (the staff door), round the attic's south side as a terrace and,
    // on the east, up to the tower (its chords there run inside the tower)
    { id: 'front', top: 17.73, line: 17.4,
      ring: [[955.8, -1742.3], [980.5, -1747.2], [981.3, -1748.2], [979.0, -1751.1], [982.3, -1754.0], [982.0, -1754.8], [980.5, -1756.3], [971.6, -1762.5], [973.7, -1749.6], [954.4, -1744.9]] },
    // the wing: six floors, the top one the attic over the front's terrace, under a low hipped roof with wide eaves
    { id: 'wing', top: 21.04, line: 20.3,
      ring: [[954.4, -1744.9], [973.7, -1749.6], [971.5, -1763.0], [956.7, -1773.7], [944.8, -1757.4]] },
    // the neighbour's low blocks on the slope west of the hotel
    { id: 'west', top: 12.67, line: 12.3, neighbour: true,
      ring: [[941.3, -1731.0], [955.1, -1743.1], [945.6, -1755.2], [931.6, -1743.0]] },
    { id: 'west-strip', top: 10.84, line: 10.5, neighbour: true,
      ring: [[940.4, -1727.6], [940.9, -1727.0], [959.0, -1743.0], [955.8, -1742.3], [955.1, -1743.1], [941.3, -1731.0], [942.6, -1729.4]] }
  ],
  // The round tower at the south-east corner: its centre and radius, its floor, the wall's top; the helm flaring out to
  // `flare` at the wall's top, back in to the tower's radius at `eave`, up to the tip; the cornice under it. Its floors
  // `storey` m each from the floor: a pair of arched windows between two striped shutters, each `group`, every 60° round
  // the tower (bearings 30, 90, 150, …: compass degrees, 0 north, 90 east); the ground floor's arches taller
  tower: {
    c: [981.7, -1751.1], r: 3.05, floor: 2.0, wall: 19.8, segments: 32,
    flare: { r: 4.05, y: 19.8 }, eave: { r: 3.05, y: 21.4 }, tip: 26.0, cornice: [18.75, 19.05],
    storey: 4.2, levels: 4, group: 90, every: 60,
    win: { at: 0.42, half: 0.3, lo: 1.0, hi: 2.6 }, arch: { lo: 0.8, hi: 3.2 }, shutter: { at: 0.97, half: 0.25 },
    // the flagpole over the tip
    pole: [26.0, 29.2]
  },
  // The lettering on the tower: the name's oval between the first and second floor's windows, "Turm Stübli · Fondue"
  // round it over the ground floor's arches (bearings from–to, heights)
  oval: { bearing: 112, w: 2.2, y0: 9.2, y1: 10.4 },
  stuebli: { from: 28, to: 172, y0: 5.4, y1: 6.05 },
  // The south front on the Alte Flüelastrasse (a → b, west to east): the staff door of the mission
  // (js/missions-data-victoria.js VICTORIA.door) in the middle bay, its width and height over the ground (with a transom
  // light, over the ground floor's window behind it); the canopy over it; the plate beside it
  south: {
    a: [955.8, -1742.3], b: [980.5, -1747.2],
    door: { w: 1.3, h: 2.45, canopy: { w: 1.9, out: 0.9, y: 2.75, thick: 0.14 }, plate: { at: 1.1, w: 0.62, y0: 1.35, y1: 1.6 } }
  },
  // The balconies: one before every bay of these walls at these floors' feet (a slab, a pale concrete side panel and a
  // larch rail)
  balconies: [
    { a: [955.8, -1742.3], b: [980.5, -1747.2], floors: [5.8, 8.7, 11.6, 14.5] },
    // the wing's south-west face over the neighbour's block
    { a: [944.8, -1757.4], b: [954.4, -1744.9], floors: [14.5, 17.4] }
  ],
  balcony: { w: 2.5, out: 1.3, rail: 1.0, panel: 0.8 },
  // The wing's roof: the eaves `overhang` m out, rising `rise` m to a flat top `inset` m in from the walls; the flags
  // on it (along its south edge, of the top's south wall)
  wingRoof: { overhang: 0.95, rise: 1.25, inset: 3.0, flags: [0.25, 0.5, 0.75], pole: 3.6 },
  // A window: m up from its floor's foot, its half width
  win: { lo: 0.85, hi: 2.35, half: 0.55 },
  // the start of the mission, the door (js/missions-data-victoria.js VICTORIA)
  mission: { door: { x: 968.1, z: -1744.1, r: 2.4 }, start: { x: 970.2, z: -1735.5 } }
};

/** A part by its id */
export const part = (id) => TURMHOTEL_VICTORIA.parts.find((p) => p.id === id);

/** The point of the tower's circle (or of radius r) at a compass bearing (degrees: 0 north, 90 east; z is south) */
export function towerPoint(bearing, r = TURMHOTEL_VICTORIA.tower.r) {
  const [cx, cz] = TURMHOTEL_VICTORIA.tower.c, t = (bearing * Math.PI) / 180;
  return [cx + r * Math.sin(t), cz - r * Math.cos(t)];
}
/** The tower's outline: its polygon of `segments` corners */
export function towerRing(r = TURMHOTEL_VICTORIA.tower.r) {
  const n = TURMHOTEL_VICTORIA.tower.segments;
  return Array.from({ length: n }, (_, i) => towerPoint((360 * i) / n, r));
}
/** u of the tower's wall at a bearing: metres round it, 0 at the middle window group, growing to the viewer's right */
export const towerU = (bearing) => (TURMHOTEL_VICTORIA.tower.r * ((TURMHOTEL_VICTORIA.tower.group - bearing) * Math.PI)) / 180;
/** The tower's window groups' bay along its wall (m) */
export const towerBay = () => (TURMHOTEL_VICTORIA.tower.r * TURMHOTEL_VICTORIA.tower.every * Math.PI) / 180;

/** Inside the hotel (a part's outline or the tower)? */
export function partAt(x, z, { neighbours = true } = {}) {
  let best = null;
  for (const p of TURMHOTEL_VICTORIA.parts) if ((neighbours || !p.neighbour) && pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}
export const inTower = (x, z) => pointInRing(towerRing(), x, z);

/**
 * A ring moved `d` m out of its walls (in where negative): each corner where its walls' moved lines meet. The ring is
 * turned as wallFrame wants it first (outwardRing).
 */
export function offsetRing(ring, d) {
  const R = outwardRing(ring), n = R.length, out = [];
  for (let i = 0; i < n; i++) {
    const A = wallFrame(R[(i + n - 1) % n], R[i]), B = wallFrame(R[i], R[(i + 1) % n]);
    // (the corner moved along the bisector of the two walls' normals)
    const bx = A.n[0] + B.n[0], bz = A.n[1] + B.n[1], k = 1 + A.n[0] * B.n[0] + A.n[1] * B.n[1];
    out.push([R[i][0] + (bx * d) / k, R[i][1] + (bz * d) / k]);
  }
  return out;
}

/** Is the ring convex? */
export function isConvex(ring) {
  let sign = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[(i + 2) % ring.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-6) continue;
    if (sign && Math.sign(cr) !== sign) return false;
    sign = Math.sign(cr);
  }
  return true;
}

/** The floors' feet of a part from the ground floor up (its `line` counted down by the storey to above `lowest`) */
export function floorsOf(p, lowest = 2.5) {
  const out = [];
  for (let y = p.line - TURMHOTEL_VICTORIA.storey; y >= lowest - 1e-6; y -= TURMHOTEL_VICTORIA.storey) out.unshift(Math.round(y * 100) / 100);
  return out;
}

/** The staff door's place on the south front: s m along it (the middle bay), the point before it (world) */
export function staffDoor() {
  const S = TURMHOTEL_VICTORIA.south, F = wallFrame(S.a, S.b), s = F.len / 2;
  return { F, s, at: onWall(F, s, 0), before: onWall(F, s, 0.8) };
}

/**
 * The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the hotel's two volumes and the
 * tower (the neighbour's blocks keep OSM's walls)
 */
export const groundOutlines = () => [...TURMHOTEL_VICTORIA.parts.filter((p) => !p.neighbour).map((p) => p.ring), towerRing()];

export { bays, outwardRing, ringArea2, wallFrame, onWall, pointInRing };
