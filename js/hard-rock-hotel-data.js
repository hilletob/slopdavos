// The Hard Rock Hotel Davos and the rest of the old Kurhaus complex east of the Kulturplatz (Promenade, 7270 Davos Platz;
// js/hard-rock-hotel.js): its volumes, the floors' grids, the Kurhaus café's front on the square, the porch on the
// Tobelmühlestrasse, the residence's balconies. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1745/1010, batch 6: the whole complex, 72 × 67 m, up to the pyramid roof's tip at
// y 19.8): the roofs' outlines and heights below are its flat roofs, each a prism down to the ground; heights in the
// world frame (y = m a.s.l. − 1558, js/davos-frame.js). The ground falls from the church's lane in the west (y −7)
// to the garden in the east (−15). The batch holds six OpenStreetMap buildings: the hotel w225910169 (the old Kurhaus'
// white blocks round the pyramid roof), its east wings w1529620019 and w225910172, the Kurhaus' front of the 1970s on
// the square w225910176 (and the café's east part, which no OSM outline holds), the residence w123380401 to the south
// and the low link between it and the east wings. The English Church (w225910175, tile 11/1745/1011 batch 1, its
// apse and spire) stays as the tiles draw it; the hotel's roofs that the survey runs on under the church's roof are
// left out (they stood inside it).
//
// The look after Mapillary's street views of 2013 (CC BY-SA): the café's front from the square (now the Kulturplatz's
// site): warm grey concrete, the ground floor's glazing in red frames, a red band with "CAFE", the upper floor's windows
// recessed between square piers, a frieze of tiles with putti and coats of arms under the cornice; the hotel's north
// front from the Tobelmühlestrasse (east): white plaster, tall windows in salmon surrounds, a stone porch with arches by
// the church. The views from the north-west and most from the east show the Central Sporthotel across the lane (its
// arched windows, its balcony tower with its name, the "STÜBLI"), not this building. The residence's balconies, the
// south and east sides of the hotel and the east wings' faces are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const HARD_ROCK_HOTEL = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: -495.8, z: -130.5, r: 3 },
  osm: 'w225910169',
  base: -16.0, // how far down the walls reach (under the garden in the east)
  // The floors' grids: `old` the Kurhaus hotel's white blocks, `modern` the residence, the link and the café's blocks
  grid: {
    old: { storey: 3.3, bay: 2.9, win: { lo: 0.85, hi: 2.6, half: 0.5 } },
    modern: { storey: 3.0, bay: 2.7, win: { lo: 0.9, hi: 2.3, half: 0.62 } }
  },
  // The volumes, each a flat roof at `top` over its outline (world x, z), on the OSM building `osm`. `style`: old,
  // modern or cafe (modern walls, the café's front on the walls facing the square); `line`: a floor's top (the windows'
  // grid counts down from it; closed above it); `windows: false` closed walls; `tint` a modern wall's plaster
  parts: [
    // the hotel: the white blocks round the pyramid roof (the U on three sides, the strip on the south), on one grid of
    // 3.3 m floors from the Tobelmühlestrasse (y −9): a tall ground floor and six floors
    { id: 'main', osm: 'w225910169', style: 'old', top: 11.56, line: 11.3,
      ring: [[-501.4, -159.3], [-502.1, -157.1], [-512.4, -160.2], [-515.7, -149.2], [-518.8, -150.1], [-520.0, -145.9], [-519.9, -145.9],
        [-519.7, -146.4], [-512.1, -144.1], [-508.9, -154.7], [-498.9, -151.7], [-502.1, -141.1], [-501.5, -140.9], [-496.4, -157.7]] },
    { id: 'south', osm: 'w225910169', style: 'old', top: 12.35, line: 11.3,
      ring: [[-519.7, -146.4], [-520.5, -143.9], [-495.7, -136.3], [-494.9, -138.9], [-502.1, -141.1], [-512.1, -144.1]] },
    // the square under the pyramid roof, a floor over the blocks round it
    { id: 'tower', osm: 'w225910169', style: 'old', top: 14.3, line: 14.0,
      ring: [[-502.1, -141.0], [-512.1, -144.1], [-508.9, -154.7], [-498.9, -151.7]] },
    // the east wing, a floor lower, a rail round its roof; the strip on its south side; the stair's head behind it
    { id: 'east-wing', osm: 'w225910169', style: 'old', top: 8.59, line: 8.0, rail: true,
      ring: [[-484.8, -136.8], [-494.0, -139.6], [-493.1, -142.6], [-494.4, -143.0], [-493.1, -147.4], [-499.0, -149.2], [-496.5, -157.3],
        [-479.4, -152.1], [-480.7, -147.8], [-479.9, -147.6], [-481.5, -142.4], [-482.2, -142.6], [-484.9, -133.8], [-485.6, -134.0]] },
    { id: 'east-strip', osm: 'w225910169', style: 'old', top: 9.31, line: 8.0,
      ring: [[-495.0, -138.6], [-495.5, -137.0], [-485.6, -134.0], [-484.8, -136.8], [-494.0, -139.6], [-494.4, -138.4]] },
    { id: 'east-head', osm: 'w225910169', style: 'old', top: 11.07, line: 8.0, windows: false,
      ring: [[-493.1, -147.4], [-499.0, -149.2], [-500.3, -144.8], [-494.4, -143.0]] },
    // the lower block on the Tobelmühlestrasse towards the church (its west end runs on under the church's roof)
    { id: 'north', osm: 'w225910169', style: 'old', top: 8.59, line: 8.0,
      ring: [[-518.8, -150.1], [-523.1, -163.7], [-514.6, -161.1], [-514.5, -161.4], [-514.3, -162.2], [-512.8, -161.7], [-512.7, -162.3],
        [-501.5, -158.8], [-502.1, -157.1], [-512.4, -160.2]] },
    { id: 'north-link', osm: 'w225910169', style: 'old', top: 8.7, line: 8.0, windows: false,
      ring: [[-515.7, -149.2], [-512.4, -160.2], [-514.6, -161.1]] },
    { id: 'church-corner', osm: 'w225910169', style: 'old', top: 9.31, line: 8.0,
      ring: [[-519.7, -147.0], [-524.6, -148.5], [-525.5, -145.5], [-520.5, -143.9], [-519.9, -145.9], [-520.0, -145.9]] },
    // the east block (w1529620019) on the garden, five floors, its stair's head; the garden wing (w225910172) east of it
    { id: 'east-block', osm: 'w1529620019', style: 'old', top: 4.82, line: 4.7,
      ring: [[-482.2, -142.6], [-484.1, -136.3], [-476.7, -134.0], [-472.0, -149.4], [-479.5, -151.7], [-480.7, -147.8], [-480.4, -147.7],
        [-480.0, -149.0], [-475.8, -147.7], [-477.1, -143.3], [-480.9, -144.5], [-481.5, -142.4]] },
    { id: 'east-block-head', osm: 'w1529620019', style: 'old', top: 7.12, line: 4.7,
      ring: [[-477.1, -143.3], [-480.9, -144.5], [-479.9, -147.6], [-480.4, -147.7], [-480.0, -149.0], [-475.8, -147.7]] },
    { id: 'garden-wing', osm: 'w225910172', style: 'old', top: 1.81, line: 1.4,
      ring: [[-464.1, -131.3], [-469.6, -133.0], [-469.1, -134.4], [-476.0, -136.5], [-472.3, -148.6], [-459.9, -144.8]] },
    { id: 'garden-head', osm: 'w225910172', style: 'old', top: 2.64, line: 1.4,
      ring: [[-469.9, -131.9], [-476.8, -134.1], [-476.0, -136.5], [-469.1, -134.4]] },
    // the Kurhaus' front of the 1970s on the square (w225910176) with its curved corner, two floors; the café's east
    // part, two floors over the lower ground
    { id: 'kurhaus', osm: 'w225910176', style: 'cafe', top: -2.08, line: -2.5, tint: 'concrete',
      ring: [[-525.2, -146.5], [-526.6, -146.9], [-532.1, -128.7], [-530.2, -128.2], [-528.6, -125.9], [-526.8, -124.2], [-524.0, -123.3],
        [-521.5, -123.2], [-518.8, -124.1], [-517.5, -124.8], [-516.0, -124.3], [-512.1, -137.0], [-503.1, -134.3], [-501.9, -138.3], [-520.5, -143.9]] },
    { id: 'cafe-east', osm: 'w225910176', style: 'cafe', top: -6.09, line: -6.4, tint: 'concrete',
      ring: [[-512.1, -137.0], [-515.0, -127.4], [-499.3, -122.8], [-495.2, -136.9], [-495.5, -137.0], [-495.7, -136.3], [-501.9, -138.3], [-503.1, -134.3]] },
    // the residence to the south (w123380401), white, five floors over the garden, its stair's head; the low link
    // north of it
    { id: 'residence', osm: 'w123380401', style: 'modern', top: 1.18, line: 0.88, tint: 'white', balconies: true,
      ring: [[-488.1, -100.2], [-488.3, -99.0], [-495.8, -100.6], [-496.1, -98.7], [-506.1, -100.8], [-502.2, -119.3], [-494.1, -117.6],
        [-494.3, -116.8], [-481.4, -114.0], [-482.1, -110.7], [-471.1, -108.4], [-473.5, -97.1]] },
    { id: 'residence-head', osm: 'w123380401', style: 'modern', top: 3.63, line: 0.88, tint: 'white',
      ring: [[-484.6, -109.5], [-484.9, -109.6], [-484.4, -112.1], [-492.5, -113.8], [-493.6, -108.5], [-490.8, -107.9], [-491.0, -107.4],
        [-487.0, -106.5], [-487.1, -105.9], [-485.5, -105.6]] },
    { id: 'link', osm: 'w123380401', style: 'modern', top: -9.27, line: -9.6, tint: 'concrete',
      ring: [[-474.7, -109.2], [-482.1, -110.7], [-481.4, -114.0], [-491.0, -116.0], [-487.1, -134.4], [-485.6, -134.0], [-484.9, -133.8],
        [-484.1, -136.3], [-476.8, -134.1], [-469.9, -132.0]] }
  ],
  // The pyramid roof over the tower's square: its tip (the survey's)
  pyramid: { tip: [-505.5, 19.8, -147.9] },
  // The café's front: the walls of the `cafe` parts facing the square (their outward normal's z over `facing`); the
  // ground floor's glazing up to the floor line under the top floor, the red band over it, the upper floor's windows
  // up to the frieze `frieze` m under the roof, the parapet `parapet` m over it; square piers every `pier` m along the
  // front, `pierW` wide, standing `pierOut` m out; the tiles between them
  cafe: { facing: 0.35, band: 0.55, frieze: 1.05, parapet: 0.45, pier: 5.2, pierW: 0.6, pierOut: 0.5, tile: { w: 0.72, h: 0.95 },
    // "CAFE" on the red band where the 2013 views have it, a fifth of the front from the curved corner (a on the left
    // for someone standing before the wall)
    sign: { a: [-524.0, -123.3], b: [-521.5, -123.2], w: 1.8 } },
  // The porch on the Tobelmühlestrasse by the church (the 2013 view from the east: grey stone, an arch to the lane and
  // one to the east), standing 2.6 m out of the lower block's north wall at its west end: a box `height` m over the
  // highest ground under it, its back a metre into the block
  porch: { ring: [[-508.67, -160.0], [-513.63, -161.55], [-512.56, -164.98], [-507.6, -163.43]], height: 4.4 },
  // The residence's balconies: on its long walls facing south, at every floor over the ground floor
  balconies: { facing: 0.8, minLen: 8, out: 1.3, rail: 1.0, inset: 0.6 }
};

/** A part by its id */
export const part = (id) => HARD_ROCK_HOTEL.parts.find((p) => p.id === id);

/** The highest part over a point, or null */
export function partAt(x, z) {
  let best = null;
  for (const p of HARD_ROCK_HOTEL.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** The outlines the player's walls stand on, per OpenStreetMap building: every volume's (all stand on the ground), the
 *  porch's with the hotel's */
export function groundOutlines() {
  const out = new Map();
  for (const p of HARD_ROCK_HOTEL.parts) {
    if (!out.has(p.osm)) out.set(p.osm, []);
    out.get(p.osm).push(p.ring);
  }
  out.get(HARD_ROCK_HOTEL.osm).push(HARD_ROCK_HOTEL.porch.ring);
  return out;
}

/** Does the wall F of a `cafe` part belong to the café's front on the square? */
export const isCafeFront = (p, F) => p.style === 'cafe' && F.n[1] > HARD_ROCK_HOTEL.cafe.facing && F.len > 0.3;

/**
 * The café's front of a part: its walls on the square in ring order (outwardRing), as runs of walls following each
 * other: [[F, …], …]
 */
export function cafeRuns(p) {
  const R = outwardRing(p.ring), runs = [];
  let run = null;
  // (start after a wall that is not on the front, so that a run is not cut where the ring closes)
  const n = R.length, frames = R.map((a, i) => wallFrame(a, R[(i + 1) % n]));
  const start = Math.max(0, frames.findIndex((F) => !isCafeFront(p, F)));
  for (let k = 0; k < n; k++) {
    const F = frames[(start + k) % n];
    if (isCafeFront(p, F)) { if (!run) runs.push((run = [])); run.push(F); } else run = null;
  }
  return runs;
}

/**
 * Places along a run of walls about every `step` m of its length (the length cut into equal spans): [{ F, s }] (s along
 * the wall F); the spans' ends (the piers of the café's front, both ends of the run among them) or, `mid`, their middles
 * (the tiles between the piers).
 */
export function alongRun(run, step, mid = false) {
  const total = run.reduce((a, F) => a + F.len, 0), out = [];
  const n = Math.max(1, Math.round(total / step)), d = total / n;
  for (let t = mid ? d / 2 : 0; t <= total + 1e-6; t += d) {
    let left = t;
    for (const F of run) {
      if (left <= F.len + 1e-6) { out.push({ F, s: Math.min(left, F.len) }); break; }
      left -= F.len;
    }
  }
  return out;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
