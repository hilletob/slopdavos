// The Kirchner Museum Davos (Promenade 82, 7270 Davos Platz; js/kirchner-museum.js): its four exhibition cubes, the
// lower hall joining them, the glass skin's grid, the entrance, the lettering and the exhibition's poster. Pure data and
// frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1747/1014, batch 4, one building of 15.4 m from its lowest floor to the cubes'
// roofs): the roofs' outlines and heights below are its flat roofs, each a prism down to the ground; heights in the world
// frame (y = m a.s.l. − 1558, js/davos-frame.js). The hall's surveyed outline runs twice along two cubes' walls (slivers
// of no width); its ring below leaves them out. The terrace on the Promenade (north-west) lies at y −5.5 to −6, the
// ground falls towards the Kurpark (south-east) to −13 and lower. OpenStreetMap's footprint is w110590703. The look after
// Mapillary's street views of 2013–2015 (CC BY-SA) along the Promenade and from the lane below its east side: the cubes
// clad in matt greenish glass panels about a metre wide over a low concrete plinth, a ledge under the clear band of the
// skylights round their heads, a thin metal coping; the low hall with dark glazing in grey mullions; the entrance in the
// narrow gap between the two cubes on the Promenade; the exhibition's poster on the north-east cube's east face.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const KIRCHNER_MUSEUM = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: -220, z: -492.3, r: 3 },
  osm: 'w110590703',
  // OpenStreetMap's footprint (the player's walls, js/buildings.js)
  footprint: [[-245.6, -490.3], [-242.4, -492.1], [-230.7, -498.8], [-232.8, -502.5], [-203.5, -519.3], [-193.8, -502.4], [-207.9, -494.4],
    [-205.4, -490], [-226.4, -478.1], [-223.1, -472.4], [-232.3, -467.1]],
  base: -16.5, // how far down the walls reach (under the Kurpark's side)
  // The glass skin of the cubes: panels `panel` m wide; the band of the skylights `band` m under the roof, over a ledge;
  // under it rows of panels `row` m high counted down from the ledge; a concrete plinth `plinth` m over the lowest ground
  // along a wall; the coping's height
  skin: { panel: 1.0, band: 3.4, row: 2.3, plinth: 0.45, coping: 0.2 },
  // The four exhibition cubes, each a flat roof at `top` over its outline (world x, z)
  cubes: [
    { id: 'cube-sw', top: 3.03, ring: [[-223.6, -471.6], [-230.0, -483.1], [-239.2, -477.9], [-232.8, -466.4]] },
    { id: 'cube-se', top: 3.03, ring: [[-223.9, -479.0], [-229.0, -488.0], [-211.1, -498.1], [-206.0, -489.1]] },
    { id: 'cube-nw', top: 3.19, ring: [[-210.3, -502.6], [-215.5, -511.9], [-233.7, -501.7], [-228.5, -492.4]] },
    { id: 'cube-ne', top: 3.19, ring: [[-194.2, -501.5], [-203.6, -518.3], [-212.7, -513.1], [-203.3, -496.4]] }
  ],
  // The low hall between them: its walls along the cubes are theirs; where it stands free, dark glass in mullions `bay`
  // m apart, at most `glass` m of it under the fascia, exposed concrete under that
  hall: {
    top: -1.73, bay: 1.3, glass: 4.0, fascia: 0.4, plinth: 0.5,
    ring: [[-226.4, -483.4], [-229.3, -481.8], [-230.0, -483.1], [-239.2, -477.9], [-246.0, -489.9], [-231.6, -498.0], [-228.5, -492.4],
      [-210.3, -502.6], [-215.5, -511.9], [-212.7, -513.1], [-203.3, -496.4], [-208.4, -493.5], [-211.1, -498.1], [-229.0, -488.0]]
  },
  // The entrance: the hall's glass front in the gap between the two cubes on the Promenade (a on the left for someone
  // standing before it), a double door in its middle, the name over it
  entrance: { a: [-212.7, -513.1], b: [-215.5, -511.9], door: 0.95, height: 2.4, sign: { w: 2.6, y0: 2.6, y1: 3.05 } },
  // The name along the hall's front on the Promenade, west of the cubes: white letters on the glass under the fascia
  lettering: { a: [-231.6, -498.0], b: [-246.0, -489.9], w: 8.4, y0: -2.83, y1: -2.23 },
  // The exhibition's poster on the north-east cube's east face (over the lane below), near its north corner
  poster: { a: [-194.2, -501.5], b: [-203.6, -518.3], fromEnd: 1.2, w: 4.6, y0: -4.9, y1: 1.5 }
};

/** The cube or the hall a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const c of KIRCHNER_MUSEUM.cubes) if (pointInRing(c.ring, x, z) && (!best || c.top > best.top)) best = c;
  if (!best && pointInRing(KIRCHNER_MUSEUM.hall.ring, x, z)) best = { id: 'hall', ...KIRCHNER_MUSEUM.hall };
  return best;
}

/** The hall's walls standing free (not along a cube): [{ a, b, F }], turned to face out */
export function hallWalls() {
  const ring = outwardRing(KIRCHNER_MUSEUM.hall.ring), out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    const [x, z] = onWall(F, F.len / 2, 0.25);
    if (KIRCHNER_MUSEUM.cubes.some((c) => pointInRing(c.ring, x, z))) continue;
    out.push({ a, b, F });
  }
  return out;
}

/** The distance of a point from a ring's outline */
export function distToRing(ring, x, z) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return d;
}

/** The cubes' walls with an end more than `limit` m outside OpenStreetMap's footprint (whose walls are the player's):
 *  they get colliders of their own. [{ a, b, top }] */
export function strayWalls(limit = 0.7) {
  const out = [], F = KIRCHNER_MUSEUM.footprint;
  const stray = ([x, z]) => !pointInRing(F, x, z) && distToRing(F, x, z) > limit;
  for (const c of KIRCHNER_MUSEUM.cubes) {
    c.ring.forEach((a, i) => { const b = c.ring[(i + 1) % c.ring.length]; if (stray(a) || stray(b)) out.push({ a, b, top: c.top }); });
  }
  return out;
}

/** Is a → b the wall p → q (either way round)? */
export function sameWall(a, b, p, q) {
  const near = (s, t) => Math.hypot(s[0] - t[0], s[1] - t[1]) < 0.06;
  return (near(a, p) && near(b, q)) || (near(a, q) && near(b, p));
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
