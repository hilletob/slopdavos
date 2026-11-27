// The block of The Hotel Europe on the Promenade, Davos Platz (Promenade 63–65; js/europe-block.js): the hotel's long
// block on the Promenade with its attic, the block with the shops (Coop Pronto, Meerkämper, the hairdresser) and its
// stair towers, the hotel's older front and its white south wing over the Casino's glass box, the white wings up the
// slope behind, the courtyard's low parts and the annex by the Schatzalpbahn. Pure data and frame maths, shared by the
// browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1744/1010, batch 24: one batch over the whole block, 94 × 111 m): the roofs'
// outlines and heights below are its flat roofs, each a prism down under the ground; heights in the world frame
// (y = m a.s.l. − 1558, js/davos-frame.js). The Promenade along the east fronts lies at y −1.5 to −2.3; the ground
// climbs west up the valley's side to 8–11 behind the wings. Two of the survey's outlines were cut up by its
// triangulation: the hotel's attic (two crossing pieces at 21.98 and 22.19, one outline here at 22.1) and the Casino's
// (a spike back along the hotel's east wall, dropped). OpenStreetMap maps the block as w123384638 (The Hotel Europe),
// w1529973404 (Promenade 63, the Casino's block), w1529973403 and w1529973405 (the courtyard's back and the annex) and
// w1529973402 (the wings up the slope); the survey's low terraces at the west end (y 12.6 and 13.7) and the courtyard's
// pieces between have no outline of their own and are given to their neighbours. w127653804 (west of the Schatzalpbahn)
// and w123380404 (the Graubündner Kantonalbank, across the Promenade; its south-west corner is
// js/landmark-buildings-data.js ARKADEN's) are not in the batch and stay as they were.
// The look after Mapillary's street views (2013–2016, CC BY-SA): the Promenade from the north-east (the hotel's long
// front in warm khaki plaster with its loggias, the Ex Bar on the corner, the shops' glazing under a glass canopy),
// from the south (the hotel's older front in salmon plaster with HOTEL EUROPE over its door, the shops' block in pale
// grey beyond), from the south-west across the Kulturplatz (the Casino's glass box with its name, the white south wing
// with its balconies and HOTEL EUROPE on its roof, the flags), up the lane from the south (the café's glazing under its
// green glass canopy, the white wings' balconies over a brown band), and from the Schatzalpbahn's track on the north-west
// (the hotel's back over the low annex). The arcade with the red shop fronts, the coffered ceiling and "Thöny" in the
// photographs is the Arkaden's across the Promenade (js/landmark-buildings.js). The courtyard, the back block's and the
// west wings' far sides are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const EUROPE_BLOCK = {
  // swissBUILDINGS3D's batch (its centre): left out of the streamed tiles
  exclude: { x: -629.6, z: -86.9, r: 3 },
  // the hotel (its hanging sign, js/shops.js, gives way to its own lettering)
  osm: 'w123384638',
  storey: 3.1, // the grid the walls' material draws (a part's own storey is stretched to it)
  base: -5.5, // how far down the walls reach (under the Promenade)
  // The shops' ground floor along the Promenade: glazing to `glass`, the fascia to `top`, the glass canopy over it
  shop: { glass: 1.95, top: 2.6, canopy: { y: 2.75, out: 1.9 } },
  // The volumes, each a flat roof at `top` over its outline (world x, z). `line`: the top floor's top (the windows' grid
  // counts down from it, `storey` apart; over it a closed parapet); `skin`: the plaster's colour (`east`: its walls
  // facing the Promenade in another); `shop`: its walls on the Promenade glazed at the ground floor; `glass`: its walls
  // facing south and east glazed to that height (the Casino); `balconies`: its walls facing those sides carry a balcony
  // at each floor in the open air; `osm`: the OpenStreetMap building whose walls it gives
  parts: [
    // The Hotel Europe's long block on the Promenade: a shop floor and five hotel floors, the attic set back over them
    { id: 'europe', osm: 'w123384638', top: 19.81, line: 18.6, storey: 3.2, skin: 'khaki', shop: true,
      ring: [[-600.3, -143.0], [-582.9, -137.9], [-595.2, -96.4], [-597.2, -97.0], [-599.0, -91.1], [-609.9, -94.3], [-609.0, -97.4], [-612.4, -98.4],
        [-611.5, -101.2], [-614.5, -102.1], [-606.0, -130.7], [-604.1, -130.1]] },
    { id: 'europe-attic', osm: 'w123384638', top: 22.1, line: 21.8, storey: 3.2, skin: 'khaki',
      ring: [[-585.7, -136.0], [-597.1, -131.3], [-599.5, -132.0], [-608.7, -100.9], [-611.4, -101.7], [-612.4, -98.4], [-609.0, -97.4], [-609.9, -94.3],
        [-599.0, -91.1], [-597.2, -97.0]] },
    // the low annex behind it, by the Schatzalpbahn's station
    { id: 'annex', osm: 'w1529973405', top: 5.66, line: 4.9, storey: 3.1, skin: 'cream',
      ring: [[-612.3, -131.9], [-616.8, -115.8], [-616.5, -114.0], [-615.9, -113.0], [-614.3, -111.9], [-611.8, -111.2], [-606.2, -130.2]] },
    // Promenade 63: the shops' block, its two stair towers, the bay of the shops' first floors before it
    { id: 'shops', osm: 'w1529973404', top: 19.05, line: 18.1, storey: 3.1, skin: 'pale', shop: true,
      ring: [[-614.3, -102.7], [-614.5, -102.7], [-617.3, -93.4], [-614.0, -92.5], [-613.4, -94.6], [-607.2, -92.8], [-608.9, -87.0], [-610.4, -87.4],
        [-612.5, -80.1], [-611.2, -79.7], [-613.4, -72.0], [-604.9, -69.5], [-601.9, -79.7], [-600.6, -81.4], [-600.8, -83.4], [-599.4, -88.7],
        [-597.2, -88.2], [-594.6, -96.9], [-595.0, -97.0], [-595.2, -96.4], [-597.2, -97.0], [-599.0, -91.1], [-609.9, -94.3], [-609.0, -97.4],
        [-612.4, -98.4], [-611.5, -101.2], [-614.5, -102.1]] },
    { id: 'stair-north', osm: 'w1529973404', top: 21.28, line: 21.2, storey: 3.1, skin: 'pale',
      ring: [[-607.2, -92.8], [-608.9, -87.0], [-610.4, -87.4], [-612.5, -80.1], [-617.0, -81.4], [-617.5, -79.7], [-619.5, -80.2], [-617.6, -86.6], [-615.9, -86.1], [-613.4, -94.6]] },
    { id: 'stair-south', osm: 'w1529973404', top: 21.66, line: 21.2, storey: 3.1, skin: 'pale',
      ring: [[-619.5, -73.8], [-619.7, -73.0], [-621.9, -73.7], [-620.9, -77.3], [-618.4, -76.5], [-617.0, -81.4], [-611.2, -79.7], [-613.4, -72.0]] },
    { id: 'bay', osm: 'w1529973404', top: 10.39, line: 8.8, storey: 3.1, skin: 'pale', shop: true,
      ring: [[-601.1, -75.7], [-602.9, -69.0], [-604.9, -69.5], [-601.9, -79.7], [-600.6, -81.4], [-600.8, -83.4], [-599.4, -88.7], [-597.7, -88.3], [-599.5, -80.7], [-598.9, -78.7]] },
    // the hotel's older front on the Promenade (salmon) with its white south wing over the Casino
    { id: 'hotel', osm: 'w1529973404', top: 22.46, line: 21.2, storey: 3.1, skin: 'white', east: 'salmon', shop: true, balconies: ['south'],
      ring: [[-619.5, -73.8], [-619.7, -73.0], [-621.9, -73.7], [-625.7, -60.6], [-606.5, -55.1], [-602.5, -68.8]] },
    // the Casino's glass box on the corner of the Promenade, the café under its canopy on the south
    { id: 'casino', osm: 'w1529973404', top: 9.67, line: 8.4, storey: 3.1, skin: 'grey', glass: 8.4,
      ring: [[-624.6, -60.3], [-625.1, -58.6], [-628.8, -59.7], [-629.3, -60.5], [-635.4, -62.2], [-641.8, -41.5], [-633.2, -38.8], [-634.0, -36.2],
        [-620.3, -31.9], [-618.3, -31.9], [-616.3, -32.4], [-613.8, -33.9], [-612.7, -35.3], [-606.5, -55.1]] },
    // the salmon house west of it with the car park's gate
    { id: 'gate-house', osm: 'w1529973404', top: 11.33, line: 10.3, storey: 3.1, skin: 'salmon',
      ring: [[-633.2, -38.8], [-642.2, -41.6], [-643.9, -36.2], [-634.9, -33.4]] },
    // the courtyard's low parts and the back block (w1529973403; its far sides guessed)
    { id: 'court-south', osm: 'w1529973404', top: 9.16, line: 8.3, storey: 3.1, skin: 'cream',
      ring: [[-622.6, -71.3], [-622.8, -70.7], [-629.7, -72.7], [-628.1, -78.4], [-626.7, -78.0], [-625.6, -81.8], [-617.5, -79.6], [-618.4, -76.5], [-620.9, -77.3]] },
    { id: 'court', osm: 'w1529973403', top: 9.95, line: 9.0, storey: 3.1, skin: 'cream',
      ring: [[-617.7, -86.4], [-623.9, -88.1], [-625.6, -81.8], [-617.5, -79.6], [-617.5, -79.7], [-619.5, -80.2]] },
    { id: 'court-low', osm: 'w1529973403', top: 5.03, line: 4.2, storey: 3.1, skin: 'cream',
      ring: [[-617.6, -86.6], [-617.7, -86.4], [-623.9, -88.1], [-622.7, -92.1], [-627.0, -93.3], [-626.1, -96.4], [-618.6, -94.3], [-613.7, -111.7],
        [-611.8, -111.2], [-614.3, -102.7], [-614.5, -102.7], [-617.3, -93.4], [-614.0, -92.5], [-615.9, -86.1]] },
    { id: 'back', osm: 'w1529973403', top: 17.51, line: 16.6, storey: 3.1, skin: 'cream',
      ring: [[-643.8, -89.7], [-645.6, -83.3], [-626.7, -78.0], [-622.7, -92.1], [-640.7, -97.2], [-642.8, -89.3]] },
    // the hotel's white wings up the slope (w1529973402), the brown band of the east wing's first floor over the
    // Casino's roof; the terraces at the west end guessed alike
    { id: 'wing-east', osm: 'w1529973402', top: 20.72, line: 19.7, storey: 3.1, skin: 'white', balconies: ['south'], band: [9.67, 13.4],
      ring: [[-641.6, -64.4], [-641.8, -63.5], [-640.3, -63.0], [-638.5, -62.5], [-638.3, -62.6], [-637.9, -63.0], [-629.3, -60.5], [-628.8, -59.7],
        [-625.1, -58.6], [-624.6, -60.3], [-625.7, -60.6], [-622.8, -70.7], [-638.4, -75.2], [-638.5, -75.0], [-637.4, -74.7], [-640.5, -64.0]] },
    { id: 'wing-west', osm: 'w1529973402', top: 23.51, line: 22.5, storey: 3.1, skin: 'white', balconies: ['south'],
      ring: [[-642.0, -80.4], [-648.0, -82.2], [-648.5, -80.3], [-656.1, -82.5], [-659.8, -69.7], [-640.5, -64.0], [-637.4, -74.7], [-640.0, -75.4],
        [-639.2, -78.0], [-642.4, -79.0]] },
    { id: 'wing-low', osm: 'w1529973402', top: 12.06, line: 11.2, storey: 3.1, skin: 'white',
      ring: [[-638.4, -75.2], [-638.5, -75.0], [-640.0, -75.4], [-639.2, -78.0], [-642.4, -79.0], [-642.0, -80.4], [-646.8, -81.8], [-646.2, -84.0],
        [-645.5, -83.8], [-645.6, -83.3], [-628.1, -78.4], [-629.7, -72.7]] },
    { id: 'terrace', osm: 'w1529973402', top: 12.57, line: 11.6, storey: 3.1, skin: 'white', balconies: ['south', 'east'],
      ring: [[-657.5, -69.0], [-662.4, -59.0], [-655.2, -50.7], [-653.4, -52.4], [-654.7, -54.0], [-650.9, -67.1]] },
    { id: 'terrace-west', osm: 'w1529973402', top: 13.67, line: 12.7, storey: 3.1, skin: 'white', balconies: ['south', 'east'],
      ring: [[-671.7, -36.4], [-674.5, -41.0], [-673.7, -41.5], [-676.7, -46.6], [-662.4, -59.0], [-655.2, -50.7]] }
  ],
  // The plaster's colours (linear)
  skins: {
    khaki: [0.45, 0.38, 0.26], salmon: [0.53, 0.35, 0.3], pale: [0.52, 0.51, 0.47], white: [0.6, 0.6, 0.58],
    cream: [0.47, 0.43, 0.35], grey: [0.24, 0.26, 0.26]
  },
  // The loggias of the hotel's front on the Promenade (a → b its wall, north at b): the bays (from the wall's middle,
  // as the walls' material lays them out) recessed behind a solid parapet on every hotel floor
  loggias: { part: 'europe', a: [-595.2, -96.4], b: [-582.9, -137.9], bays: [-6, -4, -2, 0, 2, 4, 5, 6, 7] },
  // HOTEL EUROPE on the white wing's roof, over the Casino (its south wall a → b), the flags behind it; and over the
  // hotel's door on the older front (its wall on the Promenade)
  roofName: { part: 'hotel', a: [-625.7, -60.6], b: [-606.5, -55.1], w: 11.5, h: 1.35, back: 0.55, lift: 0.35, flags: [4.5, 9.6, 14.7], pole: 6.5 },
  doorName: { part: 'hotel', a: [-606.5, -55.1], b: [-602.5, -68.8], w: 5.6, door: [5.0, 8.6] },
  // The Casino's name on its rounded corner (the chord over the curve, a → b), standing out of the glass on brackets
  casinoName: { part: 'casino', a: [-612.7, -35.3], b: [-620.3, -31.9], w: 6.4, y0: 5.9, y1: 7.9 },
  // The car park's gate in the salmon house's south wall
  gate: { part: 'gate-house', a: [-643.9, -36.2], b: [-634.9, -33.4], w: 5.2, h: 2.8 },
  // The café's green glass canopy along the Casino's south front (its wall a → b)
  cafe: { part: 'casino', a: [-634.0, -36.2], b: [-620.3, -31.9], y: 3.6, out: 2.6 }
};

/** A part by its id */
export const part = (id) => EUROPE_BLOCK.parts.find((p) => p.id === id);

/** The wall a → b turned so that its normal points out of `ring` */
export function outwardFrame(ring, a, b) {
  const F = wallFrame(a, b);
  const [x, z] = onWall(F, F.len / 2, 0.3);
  return pointInRing(ring, x, z) ? wallFrame(b, a) : F;
}

/** The parts standing over (x, z) higher than y (leaving `except` out) */
export function coveredAt(x, z, y, except = null) {
  return EUROPE_BLOCK.parts.some((p) => p !== except && p.top > y && pointInRing(p.ring, x, z));
}

/** The part of the block a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of EUROPE_BLOCK.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

/** Which way a wall faces: 'east', 'south', 'west' or 'north' (its outward normal's nearest compass side; z is south) */
export function side(F) {
  const [nx, nz] = F.n;
  if (Math.abs(nx) >= Math.abs(nz)) return nx > 0 ? 'east' : 'west';
  return nz > 0 ? 'south' : 'north';
}

/** The floors' feet of a part from the top floor down to `lowest` (their heights) */
export function floorFeet(p, lowest) {
  const out = [];
  for (let y = p.line - p.storey; y >= lowest - 1e-6; y -= p.storey) out.push(Math.round(y * 1000) / 1000);
  return out;
}

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS), by OpenStreetMap building: every
 * part reaches the ground; the attic stands inside the hotel's block and gives none */
export function groundOutlines() {
  const out = new Map();
  for (const p of EUROPE_BLOCK.parts) {
    if (p.id === 'europe-attic') continue;
    if (!out.has(p.osm)) out.set(p.osm, []);
    out.get(p.osm).push(p.ring);
  }
  return out;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
