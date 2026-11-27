// The school buildings of Davos Platz on the Schulstrasse (js/schulen-platz.js): the Oberstufenschulhaus Davos
// (w121860619) in the south, the school building between (w126271049), the Primarschule Davos Platz (w225912220) in the
// north, and the glazed stair hall linking the last two (w1529537263). Their volumes, the floors' grids, the stair
// towers on the lane, the bicycle shelter before the north one, the portico on the playground. Pure data and frame
// maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D: the Oberstufenschulhaus is batch 6 of tile 11/1745/1009 (the block of 35 × 35 m to its
// roof at 3.55, the clerestory over its middle to 5.77, the low annex on the north-east side to −7.08); the building
// between is batch 4 of tile 11/1745/1010 (a slab of 9 × 44 m to 2.70 along the lane, two stair towers on its lane side
// to 1.71); the Primarschule is batch 8 of the same tile (36 × 29 m to 0.04, the plant room on its roof to 2.59; its
// south-west wall reaching down to −8.0 only, where the stair hall's roof meets it). Batches 11 (the stair hall's floor
// at −16.4) and 12 (the forecourt's slab on the lane at −14.7) are flat slabs at or under the ground: left out, the
// hall built here on OpenStreetMap's outline. Heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The
// ground falls from the lane in the west (y −12 to −14.5) to the playground over the Turnhalle Tobelmühle in the east
// (−17) and the valley's edge beyond it (−19).
//
// The look after Mapillary's street views of 2013-12-28 (winter), walking down the Schulstrasse from the north (camera
// from z −131 to −77, looking 211°): the Primarschule's lane side in grey-brown exposed-aggregate concrete with its
// window bands, every other bay closed by dark brown louvres; the stair hall's glazing between it and the building
// between, with a poster in it; that building's north end in rubble stone over the hall's roof, its stair towers on
// the lane in white plaster with glass-block windows, the low granite-grey bicycle shelter with its posts before the
// north tower; at the lane's end the Oberstufenschulhaus' brown concrete with ribbon windows. The cream blocks over the
// stone wall on the right of those views stand across the lane (w126271007, w123380401: not these). The views of
// 2013-12-24 placed west of the lane show the playground over the Turnhalle with its parapet and the stair hall's east
// side: red-framed glazing with the stair behind it under a portico on square posts (placed by that). Guessed: the
// sides no view shows (the Oberstufenschulhaus but its north-east front, the building between's east side, the
// Primarschule's east and north sides), the clerestory's glazing, the name over the portico (a plain one), the poster.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const SCHULEN = {
  // swissBUILDINGS3D's batches (their centres): left out of the streamed tiles
  excludes: [
    { x: -484.5, z: -11.0, r: 3 }, // 11/1745/1009 batch 6: the Oberstufenschulhaus
    { x: -469.4, z: -56.0, r: 3 }, // 11/1745/1010 batch 4: the building between
    { x: -433.3, z: -94.8, r: 3 }, // 11/1745/1010 batch 8: the Primarschule
    { x: -449.9, z: -78.8, r: 3 }, // 11/1745/1010 batch 11: the stair hall's floor slab (under the ground)
    { x: -459.5, z: -86.0, r: 3 } // 11/1745/1010 batch 12: the forecourt's slab on the lane (at the ground)
  ],
  base: -21.0, // how far down the walls reach (under the lowest ground, −19)
  // The schools: `skin` the wall's material (js/schulen-platz.js), `storey` the floors' height; each part a flat roof
  // at `top` over its outline (world x, z), `line` its top floor's top (the windows' grid counts down from it).
  // `windows: false` closed walls; `minWindowed`: walls shorter than that closed; `foot`: walls from there (a part on a
  // roof); `clerestory`: glazed walls; `tower`: a stair tower in white plaster
  schools: [
    {
      id: 'oss', osm: 'w121860619', name: 'Oberstufenschulhaus Davos', skin: 'oss', storey: 3.6,
      parts: [
        // the block: four floors over the lane's end (north-west, ground −12), five towards the valley (−16)
        { id: 'oss-block', top: 3.55, line: 2.75, ring: [[-477.3, 12.7], [-508.3, -4.3], [-491.6, -34.6], [-460.7, -17.7]] },
        // the annex on the north-east side: one floor over the ground at its west end, two at its east end
        { id: 'oss-annex', top: -7.08, line: -8.05, ring: [[-481.4, -34.9], [-483.9, -30.4], [-465.1, -20.1], [-462.7, -24.6]] },
        { id: 'oss-head', top: 5.77, foot: 3.35, clerestory: true, ring: [[-472.8, -17.7], [-486.4, -25.1], [-488.8, -20.8], [-475.2, -13.4]] }
      ]
    },
    {
      id: 'mid', osm: 'w126271049', name: 'Schulhaus', skin: 'mid', storey: 3.4,
      parts: [
        // the slab along the lane: four floors over it (−12.1 to −13.9), five towards the playground; its ends closed
        { id: 'mid-block', top: 2.7, line: 2.0, minWindowed: 10, ring: [[-454.6, -73.0], [-462.8, -77.5], [-484.0, -39.0], [-475.9, -34.5]] },
        { id: 'mid-tower-n', top: 1.71, tower: true, ring: [[-469.9, -73.7], [-474.0, -66.2], [-470.2, -64.0], [-466.0, -71.5]] },
        { id: 'mid-tower-s', top: 1.71, tower: true, ring: [[-480.7, -45.0], [-484.5, -47.1], [-480.2, -54.9], [-476.4, -52.7]] }
      ]
    },
    {
      id: 'prim', osm: 'w225912220', name: 'Primarschule Davos Platz', skin: 'prim', storey: 3.45,
      parts: [
        // four floors over the lane (−14.1 to −15.2), five over the valley's edge in the east (−18.5)
        { id: 'prim-block', top: 0.04, line: -0.5, ring: [[-409.7, -98.5], [-442.7, -116.7], [-456.9, -91.0], [-423.9, -72.8]] },
        { id: 'prim-head', top: 2.59, foot: -0.2, windows: false, ring: [[-421.5, -98.2], [-436.6, -106.5], [-438.9, -102.2], [-423.9, -93.9]] }
      ]
    }
  ],
  // The stair hall between the Primarschule and the building between (OpenStreetMap's outline w1529537263, which its
  // walls' colliders stay on; its north corners set on the Primarschule's surveyed wall, 0.1–0.3 m out of OSM's): two floors of glazing in red frames on the lane
  // (west) and on the playground (east), its roof at −8.0 where the Primarschule's surveyed wall ends
  hall: {
    osm: 'w1529537263', top: -8.0,
    ring: [[-455.4, -90.17], [-442.7, -83.17], [-449.8, -70.6], [-462.7, -78.0]],
    west: { a: [-455.4, -90.17], b: [-462.7, -78.0] }, // a on the left seen from the lane
    east: { a: [-449.8, -70.6], b: [-442.7, -83.17] }, // a on the left seen from the playground
    mullion: 1.25, transom: 3.2,
    poster: { s: 1.4, w: 1.5, y0: 0.7, y1: 2.8 }, // on the west front, from its foot
    door: { s: 7.2, w: 2.0, h: 2.4 } // the doors in the east front (m along it, from its foot)
  },
  // The portico before the stair hall's east front, out on the playground: a flat roof on square posts, a red beam
  // under its edge with the name
  portico: { from: 0.4, to: 14.2, out: 3.4, posts: [0.9, 5.2, 9.5, 13.7], post: 0.46, postOut: 3.0, height: 3.6, beam: 0.42, slab: 0.26,
    name: { w: 7.2, h: 0.34 } },
  // The bicycle shelter before the north stair tower, on the lane (granite-grey): along the slab's west wall from its
  // north corner (`wall`, a on the left seen from the lane) to the tower, `out` m into the forecourt; its north side
  // closed, open to the lane between posts
  shelter: { wall: { a: [-462.8, -77.5], b: [-484.0, -39.0] }, s0: -0.3, s1: 6.75, out: 6.4, height: 3.2, posts: [0.0, 3.3, 6.6], post: 0.3 },
  // The aerials on the north stair tower's roof (m along its west face, m in from it, height)
  aerials: [[0.8, 1.0, 6.5], [2.0, 2.4, 5.5], [3.2, 1.2, 6.0]]
};

export const school = (id) => SCHULEN.schools.find((s) => s.id === id);
export const allParts = () => SCHULEN.schools.flatMap((s) => s.parts.map((p) => ({ ...p, school: s })));
export const partById = (id) => allParts().find((p) => p.id === id);

/**
 * Where a wall's windows begin: the foot of the lowest floor whose windows (from `lo` over its foot) clear the highest
 * ground along the wall (`hiGround`); `line` the top floor's top. Under it a closed plinth. Returns `line` if none fits.
 */
export function windowsFrom(line, storey, hiGround, lo) {
  const k = Math.floor((line - (hiGround - lo)) / storey + 1e-9);
  return k < 1 ? line : line - k * storey;
}

/** The outlines registered for the player's walls, per OSM id: the volumes standing on the ground (not the roof heads) */
export function groundOutlines(id) {
  const s = SCHULEN.schools.find((x) => x.osm === id);
  return s.parts.filter((p) => p.foot === undefined).map((p) => p.ring);
}

/** The shelter's outline (world x, z) */
export function shelterRing() {
  const S = SCHULEN.shelter, F = wallFrame(S.wall.a, S.wall.b);
  return [onWall(F, S.s0, 0), onWall(F, S.s0, S.out), onWall(F, S.s1, S.out), onWall(F, S.s1, 0)];
}

/** The portico's outline (world x, z) */
export function porticoRing() {
  const P = SCHULEN.portico, E = SCHULEN.hall.east, F = wallFrame(E.a, E.b);
  return [onWall(F, P.from, 0), onWall(F, P.to, 0), onWall(F, P.to, P.out), onWall(F, P.from, P.out)];
}

/** The part a point lies on (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of allParts()) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
