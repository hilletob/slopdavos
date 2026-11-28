// The houses along the Promenade in Davos Platz from the Ettinger pavilion north past the Rathaus to the Pauluskirche
// (js/promenade-platz-nord.js): the house of Casty Wohnen, the tall white house of Barbaros Barbers and its low
// neighbour, the old Raiffeisen's olive house with its crests, the blue house of Peak Performance, the small house of
// the Bistro Gentiana, the ochre house over the shops of Musik Kollegger and Lieblingsstück with the low shop row and
// the Morosani Fiftyone behind them, the house of the Galerie am Postplatz with its painted diamonds, Ella's red bar, the
// white and anthracite house of the Kaffeeklatsch, the Coiffure's house, the two houses up the slope behind it and the
// Aldi. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1743/1005, 11/1743/1006, 11/1744/1006 to 11/1744/1009): the roofs' outlines and
// heights below are its flat roofs (none of these houses has a pitched roof in the survey), each a prism down under the
// ground; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The batches and the OpenStreetMap
// buildings they hold:
// - 1009 batch 11: Casty Wohnen's house (w123384617), its low part to the north standing beyond OSM's outline;
// - 1009 batch 15: the tall white house (w123384617's neighbour across the Promenade, w116881287), the low band round
//   its north end, and the low house east of it (w1529620014), which the same batch holds and which is rebuilt here;
// - 1009 batch 10: the old Raiffeisen's house (w123383538) and the stair's housing on its roof;
// - 1009 batches 13 and 4: Peak Performance's blue house (w123383530), the glazed shop on its north-east corner, the
//   back wings up the slope;
// - 1008 batch 1: the Bistro Gentiana's house (w123383540) and its low part to the north;
// - 1008 batch 7: the ochre house on the Promenade (w1529973396), the link behind it, the low shop row south of it, and
//   the Morosani Fiftyone (w123383534) behind them with its podium and the housing on its roof, which the same batch
//   holds and which are rebuilt here;
// - 1006 batch 2, 1007 batches 9, 16 and 20: the house of the Galerie am Postplatz (w1529981155): the corner block
//   on the square with the housing on its roof, the wings west of it and the low parts before it on the Promenade;
// - 1006 batch 5: Ella's bar (w97292369); 1006 batch 6: the Kaffeeklatsch's house (w97292312) and its low wings;
// - 1006 batch 3: the Coiffure's house (w97292354); 1743/1006 batch 8: w1529981154; 1743/1006 batch 4: w123385321;
// - 1743/1005 batch 5: the Aldi (w301616234): the hall over the whole site and the blocks on it.
// w123380397 (the UBS's, js/schweizerhof.js), w219449797 (Stau, Ochsner Sport) and w219454706 have no batch here and
// stay as they are.
// The look after Mapillary's street views (2013–2015, CC BY-SA): see js/promenade-platz-nord.js.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The Promenade's centre line (OpenStreetMap, world x, z) from the Ettinger pavilion north-west to the Aldi
export const PROMENADE = [
  [-607.1, -23.7], [-608.9, -17.1], [-619.3, 20.3], [-620.5, 25.7], [-627.8, 66.7], [-636.6, 150.7], [-639.1, 176.3],
  [-645.3, 237.1], [-647.2, 250.7], [-648.5, 262.6], [-649.9, 271.1], [-652.2, 279.2], [-654.9, 285.8], [-658.0, 291.9],
  [-660.7, 294.9], [-665.9, 299.5], [-673.5, 304.2], [-719.9, 333.6], [-733.1, 341.5], [-741.0, 348.0], [-746.5, 353.5],
  [-750.0, 357.6], [-756.5, 366.1], [-775.4, 396.4], [-794.4, 428.1]
];

// The volumes, each a flat roof at `top` over its outline (world x, z) and a prism down from it to `base` (under the
// ground); `house` its look (HOUSES), `osm` the OpenStreetMap building whose player's walls it stands on; `over`: a
// housing standing on another part's roof (no walls at the ground)
export const PARTS = [
  // Casty Wohnen's house (1009 batch 11): the block on the Promenade (an L round the higher part up the slope), the
  // higher part, the low part to the north
  { id: 'casty', house: 'casty', osm: 'w123384617', base: -2.0, top: 8.12, fronts: [3, 4, 5],
    ring: [[-651.1, 8.0], [-645.5, 9.5], [-641.7, -4.7], [-651.5, -7.3], [-650.7, -10.6], [-635.0, -6.5], [-639.0, 8.6],
      [-625.8, 11.8], [-627.0, 16.1], [-640.5, 14.2], [-640.7, 14.9], [-652.1, 11.8]] },
  { id: 'castyBack', house: 'casty', osm: 'w123384617', base: -2.0, top: 11.2, parapet: 1.3,
    ring: [[-645.5, 9.5], [-651.1, 8.0], [-650.8, 7.0], [-662.5, 3.8], [-659.0, -9.3], [-641.7, -4.7]] },
  { id: 'castyNorth', house: 'castyLow', osm: 'w123384617', base: -2.0, top: 4.88,
    ring: [[-633.9, -13.5], [-640.5, -15.1], [-640.2, -16.3], [-656.5, -20.4], [-657.4, -14.6], [-658.7, -9.2], [-651.5, -7.3], [-650.7, -10.6],
      [-635.6, -6.6]] },
  // the tall white house across the Promenade (1009 batch 15), the low band round its north end, its low neighbour
  { id: 'white', house: 'white', osm: 'w116881287', base: -5.0, top: 18.15,
    ring: [[-592.7, 14.7], [-608.9, 10.2], [-613.1, 25.6], [-597.2, 30.1], [-595.4, 23.5], [-593.6, 24.0], [-591.7, 16.9], [-593.2, 16.5]] },
  { id: 'whiteLow', house: 'whiteLow', osm: 'w116881287', base: -5.0, top: 5.78,
    ring: [[-608.9, 10.2], [-612.6, 23.7], [-614.2, 23.2], [-609.8, 7.3], [-607.0, 5.9], [-598.5, 8.3], [-599.7, 12.7]] },
  { id: 'eastLow', house: 'eastLow', osm: 'w1529620014', base: -5.0, top: 5.78,
    ring: [[-592.7, 14.7], [-599.7, 12.7], [-598.7, 9.1], [-580.4, 14.3], [-582.8, 23.0], [-592.6, 20.3], [-591.7, 16.9], [-593.2, 16.5]] },
  // the old Raiffeisen's house (1009 batch 10) and the stair's housing on its roof
  { id: 'raif', house: 'raif', osm: 'w123383538', base: -1.8, top: 14.56, fronts: [3, 4],
    ring: [[-639.2, 40.9], [-646.9, 39.8], [-645.2, 28.2], [-628.0, 30.8], [-629.8, 42.7], [-633.5, 42.2], [-633.6, 43.3], [-639.4, 42.4]] },
  { id: 'raifStair', house: 'raif', osm: null, base: 14.3, top: 16.85, over: true,
    ring: [[-637.9, 32.2], [-638.6, 37.1], [-645.3, 36.1], [-644.6, 31.2]] },
  // Peak Performance's blue house (1009 batches 13 and 4): the block on the Promenade, the glazed shop on its corner,
  // the back wings up the slope
  { id: 'peak', house: 'peak', osm: 'w123383530', base: -1.7, top: 15.68,
    ring: [[-632.9, 55.7], [-635.7, 75.2], [-645.4, 73.7], [-645.7, 75.9], [-650.7, 75.2], [-648.1, 57.4], [-651.3, 56.9], [-650.7, 53.1]] },
  { id: 'peakShop', house: 'peakShop', osm: 'w123383530', base: -1.7, top: 5.98,
    ring: [[-631.9, 49.0], [-632.9, 55.7], [-640.2, 54.6], [-639.2, 47.9]] },
  { id: 'peakBackN', house: 'peakBack', osm: 'w123383530', base: -1.7, top: 9.0,
    ring: [[-639.2, 47.9], [-640.2, 54.6], [-650.7, 53.1], [-651.3, 56.9], [-648.1, 57.4], [-648.3, 58.6], [-662.1, 56.6], [-660.4, 44.7]] },
  { id: 'peakBackS', house: 'peakBack', osm: 'w123383530', base: -1.7, top: 8.53,
    ring: [[-653.7, 57.9], [-662.1, 56.6], [-660.4, 44.7], [-664.3, 44.1], [-666.0, 55.8], [-665.5, 55.9], [-667.8, 71.4], [-656.0, 73.1]] },
  { id: 'peakLow', house: 'peakBack', osm: 'w123383530', base: -0.4, top: 7.05,
    ring: [[-654.0, 59.4], [-655.9, 72.4], [-651.8, 73.0], [-649.9, 60.0]] },
  // the Bistro Gentiana's house (1008 batch 1) and its low part to the north
  { id: 'gentiana', house: 'gentiana', osm: 'w123383540', base: -1.6, top: 8.73, fronts: [3, 4],
    ring: [[-642.3, 84.9], [-649.6, 84.0], [-650.5, 91.0], [-636.0, 92.7], [-635.3, 86.4], [-642.3, 85.5]] },
  { id: 'gentianaN', house: 'gentiana', osm: 'w123383540', base: -1.6, top: 5.61,
    ring: [[-641.1, 83.8], [-641.3, 85.3], [-649.6, 84.2], [-649.3, 81.7], [-643.8, 82.3], [-643.9, 83.5]] },
  // the ochre house on the Promenade (1008 batch 7), the link behind it, the low shop row south of it and the low part
  // west of the row; the Morosani Fiftyone, its podium and the housing on its roof
  { id: 'ochre', house: 'ochre', osm: 'w1529973396', base: -1.5, top: 17.9,
    ring: [[-638.0, 115.5], [-638.2, 117.5], [-648.8, 116.2], [-648.1, 110.8], [-650.2, 110.5], [-648.2, 94.0], [-634.7, 95.7], [-635.5, 102.1],
      [-635.0, 102.2], [-636.6, 115.6]] },
  { id: 'ochreLink', house: 'ochre', osm: 'w1529973396', base: -1.5, top: 19.17,
    ring: [[-648.1, 110.8], [-654.3, 110.0], [-655.1, 116.1], [-648.9, 116.9]] },
  { id: 'shopRow', house: 'shopRow', osm: 'w1529973396', base: -1.5, top: 6.53, fronts: [0, 1],
    ring: [[-658.4, 142.2], [-641.3, 143.7], [-637.8, 115.5], [-638.0, 115.5], [-638.2, 117.5], [-648.8, 116.2], [-648.9, 116.9],
      [-655.1, 116.1]] },
  { id: 'shopWest', house: 'shopRow', osm: 'w1529973396', base: -1.5, top: 6.0,
    ring: [[-654.9, 113.4], [-657.3, 113.2], [-661.9, 126.0], [-664.2, 126.5], [-656.6, 127.5]] },
  { id: 'fiftyPodium', house: 'fiftyLow', osm: 'w123383534', base: -1.5, top: 7.98,
    ring: [[-669.2, 121.8], [-666.9, 112.7], [-659.5, 112.7], [-657.3, 113.9], [-661.9, 126.0], [-663.7, 125.3], [-670.7, 143.7], [-677.2, 141.6],
      [-676.8, 140.5], [-675.3, 141.1], [-674.0, 137.9], [-671.4, 135.8], [-671.9, 135.2], [-669.0, 132.9], [-670.1, 132.0], [-670.3, 131.0],
      [-667.6, 129.2], [-668.8, 127.6], [-666.8, 125.0], [-668.2, 123.7], [-667.7, 122.3]] },
  { id: 'fifty', house: 'fifty', osm: 'w123383534', base: -1.5, top: 21.66,
    ring: [[-666.6, 111.3], [-667.9, 111.0], [-667.9, 110.5], [-675.2, 108.9], [-685.0, 133.5], [-682.2, 134.6], [-683.9, 138.9], [-677.2, 141.6],
      [-676.8, 140.5], [-675.3, 141.1], [-674.0, 137.9], [-671.4, 135.8], [-671.9, 135.2], [-669.0, 132.9], [-670.1, 132.0], [-670.3, 131.0],
      [-667.6, 129.2], [-668.8, 127.6], [-666.8, 125.0], [-668.2, 123.7], [-667.7, 122.3], [-669.2, 121.8]] },
  { id: 'fiftyTop', house: 'fifty', osm: null, base: 21.3, top: 23.96, over: true,
    ring: [[-673.9, 116.7], [-677.7, 115.2], [-680.5, 122.3], [-676.7, 123.8]] },
  // the house of the Galerie am Postplatz (1006 batch 2, 1007 batches 9, 16, 20): the corner block on the square and
  // the housing on its roof, the wing west of it, the low middle wing (its roof round a lower court, drawn whole), the
  // south wing, the low parts before the corner block on the Promenade
  { id: 'galerie', house: 'galerie', osm: 'w1529981155', base: -1.2, top: 17.55,
    ring: [[-685.6, 286.3], [-688.3, 291.9], [-673.7, 299.0], [-665.4, 281.7], [-679.6, 274.8], [-680.9, 277.6], [-682.7, 276.7], [-686.9, 285.6]] },
  { id: 'galerieTop', house: 'galerie', osm: null, base: 17.3, top: 20.0, over: true,
    ring: [[-674.9, 290.6], [-682.8, 286.7], [-679.5, 279.9], [-671.6, 283.8]] },
  { id: 'galerieWest', house: 'galerieBack', osm: 'w1529981155', base: -1.2, top: 12.34,
    ring: [[-711.8, 276.2], [-706.9, 271.5], [-689.6, 273.9], [-683.0, 277.2], [-686.9, 285.6], [-685.6, 286.3], [-687.2, 289.6], [-711.0, 276.6]] },
  { id: 'galerieMid', house: 'galerieBack', osm: 'w1529981155', base: -1.2, top: 9.39,
    ring: [[-711.0, 276.6], [-698.7, 283.3], [-704.0, 293.5], [-709.4, 290.7], [-720.8, 284.7], [-711.8, 276.2]] },
  { id: 'galerieSouth', house: 'galerieBack', osm: 'w1529981155', base: -1.2, top: 13.25,
    ring: [[-694.3, 298.6], [-699.6, 308.6], [-711.8, 304.0], [-726.0, 289.7], [-720.8, 284.7], [-709.4, 290.7]] },
  { id: 'galerieFront', house: 'galerieLow', osm: 'w1529981155', base: -1.2, top: 6.11,
    ring: [[-688.5, 293.3], [-689.9, 296.2], [-684.8, 304.8], [-674.5, 298.6], [-682.9, 294.5], [-683.5, 295.8]] },
  { id: 'galerieEntry', house: 'galerieLow', osm: 'w1529981155', base: -1.2, top: 6.11,
    ring: [[-671.9, 297.1], [-673.2, 297.9], [-670.7, 292.7], [-668.8, 293.8]] },
  { id: 'galerieLink', house: 'galerieLow', osm: 'w1529981155', base: -1.2, top: 9.29,
    ring: [[-688.3, 289.0], [-692.2, 296.6], [-689.6, 297.8], [-688.0, 294.6], [-683.1, 297.1], [-682.0, 295.0], [-688.3, 291.9]] },
  // Ella's bar (1006 batch 5)
  { id: 'ella', house: 'ella', osm: 'w97292369', base: -2.0, top: 6.32,
    ring: [[-712.5, 311.4], [-741.6, 329.6], [-736.3, 338.1], [-707.2, 319.9]] },
  // the Kaffeeklatsch's house (1006 batch 6): the block on the Promenade, its low wings
  { id: 'kaffee', house: 'kaffee', osm: 'w97292312', base: -2.3, top: 15.8,
    ring: [[-700.0, 337.6], [-706.0, 328.4], [-701.3, 325.3], [-695.8, 321.4], [-690.6, 318.5], [-682.7, 330.6], [-688.4, 334.3], [-690.4, 331.2]] },
  { id: 'kaffeeWing', house: 'kaffeeLow', osm: 'w97292312', base: -2.3, top: 6.48,
    ring: [[-716.2, 350.5], [-727.2, 342.5], [-705.9, 328.6], [-700.0, 337.6], [-698.4, 336.4], [-696.0, 339.9], [-700.1, 342.6], [-701.3, 340.7]] },
  { id: 'kaffeeShop', house: 'kaffeeLow', osm: 'w97292312', base: -2.3, top: 6.48,
    ring: [[-688.5, 334.1], [-690.4, 331.2], [-698.3, 336.4], [-696.1, 339.5]] },
  // the Coiffure's house (1006 batch 3)
  { id: 'coiffure', house: 'coiffure', osm: 'w97292354', base: -5.5, top: 10.66,
    ring: [[-741.4, 354.6], [-749.6, 364.4], [-742.8, 368.3], [-741.7, 366.6], [-733.0, 371.6], [-729.6, 366.4], [-728.3, 367.2], [-726.7, 364.4],
      [-725.9, 364.9], [-722.4, 358.9], [-734.6, 351.8], [-737.2, 356.1], [-738.9, 355.1], [-739.5, 356.2]] },
  // the two houses up the slope west of the Promenade (1743/1006 batches 8 and 4)
  { id: 'slopeNorth', house: 'slopeNorth', osm: 'w1529981154', base: 0.4, top: 10.46,
    ring: [[-760.1, 334.6], [-768.9, 348.1], [-773.1, 345.4], [-776.0, 349.7], [-780.8, 346.7], [-769.1, 328.7]] },
  { id: 'slopeSouth', house: 'slopeSouth', osm: 'w123385321', base: -2.4, top: 16.0,
    ring: [[-781.1, 349.7], [-780.0, 346.9], [-764.4, 356.8], [-773.5, 370.9], [-775.2, 369.8], [-784.0, 362.2], [-783.5, 361.4], [-787.6, 358.8],
      [-784.7, 354.4], [-786.3, 353.4], [-783.6, 349.1], [-781.6, 350.4]] },
  // the Aldi (1743/1005 batch 5): the hall over the site (drawn under the east blocks too), the block on its north end, the two on its east end
  { id: 'aldiHall', house: 'aldiHall', osm: 'w301616234', base: -9.0, top: 2.0,
    ring: [[-770.6, 428.2], [-780.5, 444.8], [-791.8, 437.7], [-770.6, 404.0], [-747.5, 418.6], [-736.0, 408.5], [-725.5, 415.1],
      [-743.8, 444.3]] },
  { id: 'aldi', house: 'aldi', osm: 'w301616234', base: -9.0, top: 14.02,
    ring: [[-739.9, 406.5], [-750.2, 400.0], [-748.9, 397.8], [-755.6, 393.6], [-757.1, 396.0], [-763.7, 391.9], [-771.1, 403.7], [-747.5, 418.6]] },
  { id: 'aldiEast', house: 'aldi', osm: 'w301616234', base: -9.0, top: 10.83,
    ring: [[-736.0, 425.5], [-747.4, 418.4], [-736.1, 408.7], [-728.6, 413.3]] },
  { id: 'aldiEastN', house: 'aldi', osm: 'w301616234', base: -9.0, top: 10.92,
    ring: [[-739.9, 406.5], [-742.8, 404.6], [-741.3, 402.3], [-734.7, 406.4], [-736.1, 408.7], [-747.4, 418.4]] }
];

// The houses: their look. `floor`: the ground floor's foot (on the street); `shop`: its top (the shops' glazing and
// fascia under it on the shop fronts); `storey`: the floors over it; `skin`: the plaster (linear); `eave`: how far the
// roof's edge stands out, its height and its underside's colour; `fascia`: the shops' band; `pier`: the piers between
// the shop windows; `parapet`: the closed band under the roof (a part may have its own). `shops`: the walls facing the
// Promenade within `near` m carry shop fronts (a part's `fronts`: its walls by their index instead; `allFronts`: every
// wall not against another part); `closed`: walls without windows; `canopy`: the fascia a slab standing out over the
// pavement; `awning`: its colour; `corners`: bands of that colour up the corners, `cornerWidth` m wide; `frieze`: a
// band of that colour under the eaves; `bands`: light string courses at those heights; `pattern`: 'diamonds' (the
// painted lozenges); `guessed`: no photograph shows it (or not enough of it)
export const HOUSES = {
  casty: { name: "Casty Wohnen's house", floor: -1.4, shop: 3.1, storey: 3.4, skin: [0.6, 0.6, 0.58], eave: { out: 0.45, h: 0.35, under: [0.42, 0.45, 0.48] }, fascia: [0.08, 0.08, 0.09], pier: [0.6, 0.6, 0.58], parapet: 1.6, shops: true, near: 26 },
  castyLow: { name: 'the low part north of it', floor: -0.9, shop: 3.4, storey: 3.0, skin: [0.6, 0.6, 0.58], eave: { out: 0.25, h: 0.3, under: [0.16, 0.16, 0.17] }, fascia: [0.2, 0.2, 0.2], pier: [0.6, 0.6, 0.58], parapet: 1.4 },
  white: { name: 'the tall white house', floor: -1.5, shop: 2.6, storey: 2.95, skin: [0.6, 0.59, 0.56], eave: { out: 0.8, h: 0.35, under: [0.3, 0.12, 0.08] }, fascia: [0.1, 0.1, 0.1], pier: [0.2, 0.2, 0.2], parapet: 0.8 },
  whiteLow: { name: "its shops' band", floor: -1.6, shop: 3.3, storey: 2.95, skin: [0.58, 0.57, 0.54], eave: { out: 0.15, h: 0.3, under: [0.1, 0.1, 0.1] }, fascia: [0.09, 0.09, 0.1], pier: [0.15, 0.15, 0.15], parapet: 2.48, shops: true, canopy: true },
  eastLow: { name: 'the low house east of it', floor: -2.2, shop: 0.9, storey: 2.9, skin: [0.55, 0.52, 0.46], eave: { out: 0.5, h: 0.3, under: [0.3, 0.2, 0.15] }, fascia: [0.2, 0.2, 0.2], pier: [0.55, 0.52, 0.46], parapet: 0.5, guessed: true },
  raif: { name: "the old Raiffeisen's house", floor: -1.3, shop: 3.1, storey: 3.1, skin: [0.4, 0.37, 0.25], eave: { out: 1.0, h: 0.4, under: [0.12, 0.1, 0.09] }, fascia: [0.16, 0.06, 0.04], pier: [0.2, 0.1, 0.07], parapet: 2.15, shops: true, canopy: true, bands: [6.15], frieze: [0.55, 0.53, 0.47] },
  peak: { name: "Peak Performance's blue house", floor: -1.0, shop: 3.0, storey: 3.0, skin: [0.16, 0.3, 0.52], eave: { out: 0.5, h: 0.35, under: [0.5, 0.5, 0.49] }, fascia: [0.58, 0.58, 0.56], pier: [0.58, 0.58, 0.56], parapet: 0.68, shops: true, corners: [0.6, 0.6, 0.58], cornerWidth: 0.5 },
  peakShop: { name: 'its glazed shop', floor: -1.1, shop: 3.4, storey: 3.0, skin: [0.58, 0.58, 0.56], eave: { out: 0.6, h: 0.3, under: [0.58, 0.58, 0.56] }, fascia: [0.58, 0.58, 0.56], pier: [0.25, 0.25, 0.25], parapet: 2.58, shops: true, allFronts: true, closed: true },
  peakBack: { name: 'its back wings', floor: -1.0, shop: 3.0, storey: 3.0, skin: [0.5, 0.5, 0.48], eave: { out: 0.3, h: 0.3, under: [0.4, 0.4, 0.39] }, fascia: [0.3, 0.3, 0.3], pier: [0.5, 0.5, 0.48], parapet: 0.5, guessed: true },
  gentiana: { name: "the Bistro Gentiana's house", floor: -1.0, shop: 3.2, storey: 3.6, skin: [0.45, 0.44, 0.26], eave: { out: 0.6, h: 0.35, under: [0.55, 0.55, 0.52] }, fascia: [0.12, 0.07, 0.04], pier: [0.12, 0.07, 0.04], parapet: 1.93, shops: true, frieze: [0.58, 0.58, 0.55] },
  ochre: { name: 'the ochre house', floor: -0.9, shop: 3.1, storey: 2.84, skin: [0.5, 0.36, 0.12], eave: { out: 0.9, h: 0.4, under: [0.1, 0.09, 0.08] }, fascia: [0.55, 0.55, 0.52], pier: [0.55, 0.55, 0.52], parapet: 0.6, shops: true, frieze: [0.3, 0.16, 0.06] },
  shopRow: { name: 'the low shop row', floor: -0.9, shop: 3.5, storey: 2.9, skin: [0.5, 0.49, 0.46], eave: { out: 0.5, h: 0.3, under: [0.3, 0.3, 0.3] }, fascia: [0.2, 0.2, 0.21], pier: [0.5, 0.49, 0.46], parapet: 0.13, shops: true, awning: [0.42, 0.3, 0.18] },
  fiftyLow: { name: "the Fiftyone's podium", floor: 1.7, shop: 4.6, storey: 2.9, skin: [0.52, 0.5, 0.45], eave: { out: 0.3, h: 0.3, under: [0.4, 0.39, 0.37] }, fascia: [0.3, 0.3, 0.3], pier: [0.52, 0.5, 0.45], parapet: 0.48, guessed: true },
  fifty: { name: 'the Morosani Fiftyone', floor: 2.8, shop: 6.3, storey: 3.0, skin: [0.55, 0.47, 0.3], eave: { out: 0.8, h: 0.35, under: [0.2, 0.12, 0.07] }, fascia: [0.3, 0.3, 0.3], pier: [0.55, 0.47, 0.3], parapet: 0.36, guessed: true },
  galerie: { name: 'the house of the Galerie am Postplatz', floor: -0.6, shop: 3.2, storey: 3.3, skin: [0.62, 0.6, 0.57], eave: { out: 0.9, h: 0.35, under: [0.12, 0.1, 0.09] }, fascia: [0.05, 0.12, 0.45], pier: [0.5, 0.48, 0.46], parapet: 1.15, shops: true, pattern: 'diamonds' },
  galerieBack: { name: 'its wings', floor: -0.6, shop: 3.2, storey: 3.0, skin: [0.58, 0.56, 0.52], eave: { out: 0.6, h: 0.3, under: [0.12, 0.1, 0.09] }, fascia: [0.3, 0.3, 0.3], pier: [0.58, 0.56, 0.52], parapet: 0.5, guessed: true },
  galerieLow: { name: 'its low parts on the Promenade', floor: -0.6, shop: 3.4, storey: 2.7, skin: [0.58, 0.56, 0.52], eave: { out: 0.4, h: 0.3, under: [0.3, 0.3, 0.3] }, fascia: [0.05, 0.12, 0.45], pier: [0.45, 0.44, 0.42], parapet: 0.0, shops: true },
  ella: { name: "Ella's bar", floor: -1.4, shop: 3.6, storey: 2.9, skin: [0.33, 0.06, 0.05], eave: { out: 0.5, h: 0.45, under: [0.2, 0.2, 0.2] }, fascia: [0.17, 0.17, 0.18], pier: [0.33, 0.06, 0.05], parapet: 2.72, shops: true },
  kaffee: { name: "the Kaffeeklatsch's house", floor: -0.9, shop: 3.0, storey: 2.95, skin: [0.6, 0.59, 0.56], eave: { out: 0.7, h: 0.4, under: [0.12, 0.12, 0.13] }, fascia: [0.12, 0.12, 0.13], pier: [0.6, 0.59, 0.56], parapet: 0.95, shops: true, corners: [0.08, 0.085, 0.09], cornerWidth: 1.1 },
  kaffeeLow: { name: 'its low wings', floor: -1.0, shop: 3.4, storey: 3.0, skin: [0.58, 0.57, 0.54], eave: { out: 0.5, h: 0.3, under: [0.12, 0.12, 0.13] }, fascia: [0.12, 0.12, 0.13], pier: [0.12, 0.12, 0.13], parapet: 0.08, shops: true },
  coiffure: { name: "the Coiffure's house", floor: -1.8, shop: 1.4, storey: 3.0, skin: [0.36, 0.33, 0.28], eave: { out: 0.6, h: 0.35, under: [0.3, 0.06, 0.04] }, fascia: [0.3, 0.06, 0.04], pier: [0.36, 0.33, 0.28], parapet: 0.26 },
  slopeNorth: { name: 'the house up the slope (w1529981154)', floor: 0.6, shop: 3.4, storey: 2.9, skin: [0.55, 0.53, 0.47], eave: { out: 0.5, h: 0.3, under: [0.3, 0.2, 0.15] }, fascia: [0.3, 0.3, 0.3], pier: [0.55, 0.53, 0.47], parapet: 1.26, guessed: true },
  slopeSouth: { name: 'the pale yellow house up the slope', floor: -2.0, shop: 1.0, storey: 2.9, skin: [0.58, 0.5, 0.3], eave: { out: 0.3, h: 0.3, under: [0.55, 0.52, 0.45] }, fascia: [0.3, 0.3, 0.3], pier: [0.58, 0.5, 0.3], parapet: 0.5 },
  aldiHall: { name: "the Aldi's hall", floor: -2.8, shop: 2.0, storey: 3.0, skin: [0.5, 0.49, 0.46], eave: { out: 0.3, h: 0.3, under: [0.35, 0.35, 0.35] }, fascia: [0.0, 0.05, 0.22], pier: [0.5, 0.49, 0.46], parapet: 0.0, shops: true, closed: true, guessed: true },
  aldi: { name: 'the blocks on it', floor: -2.6, shop: 2.0, storey: 2.9, skin: [0.52, 0.5, 0.45], eave: { out: 0.4, h: 0.3, under: [0.35, 0.35, 0.35] }, fascia: [0.0, 0.05, 0.22], pier: [0.52, 0.5, 0.45], parapet: 0.42, shops: true, guessed: true }
};

export const PROMENADE_PLATZ_NORD = {
  // swissBUILDINGS3D's batches (their centres): left out of the streamed tiles
  exclude: [
    { x: -644.4, z: -2.1, r: 3 }, { x: -597.3, z: 17.8, r: 3 }, { x: -637.4, z: 35.6, r: 3 }, { x: -649.8, z: 59.8, r: 3 },
    { x: -652.9, z: 66.2, r: 3 }, { x: -642.9, z: 87.2, r: 3 }, { x: -659.7, z: 119.3, r: 3 }, { x: -710.1, z: 296.6, r: 3 },
    { x: -687.1, z: 293.3, r: 3 }, { x: -713.1, z: 283.1, r: 3 }, { x: -693.2, z: 288.1, r: 3 }, { x: -724.4, z: 324.7, r: 3 },
    { x: -705, z: 334.5, r: 3 }, { x: -770.5, z: 339.1, r: 3 }, { x: -775.9, z: 358.8, r: 3 }, { x: -736, z: 361.7, r: 3 },
    { x: -758.9, z: 418.1, r: 3 }
  ],
  // the grid the walls' material draws: every house's floors are stretched to it
  storey: 3.0,
  // a window (grid metres over its storey's foot) and its half width; the bays along a wall from its middle
  win: { lo: 0.9, hi: 2.3, half: 0.6 },
  bay: 2.7,
  // the walls facing the Promenade (their middle within `near` m of its centre line, facing it): the shops' glazing
  near: 14,
  // The balconies: on a part's wall (its index in partWalls, or 'north' / 'south' / 'east' / 'west' / 'front'), from
  // s0 to s1 m along it (a negative s: from its far end), on the floors `floors` (storeys over the ground floor: 1 the
  // first), `depth` m out; `rail`: 'timber' (dark boards) or 'white' (a plastered parapet)
  balconies: [
    // the tall white house: the stack at the west end of its south front (279702390484074)
    { part: 'white', edge: 'south', s0: 0.4, s1: 5.2, floors: [1, 2, 3, 4, 5], depth: 1.3, rail: 'white' },
    // the ochre house: the stacks of balconies over the shop row (318741136282355)
    { part: 'ochre', edge: 'south', s0: 0.6, s1: -0.6, floors: [3, 4, 5], depth: 1.3, rail: 'timber' },
    // the Galerie's house: two small balconies on its east front (511467986687678)
    { part: 'galerie', edge: 'east', s0: 2.0, s1: 4.0, floors: [2, 3], depth: 0.7, rail: 'white' },
    // the Morosani Fiftyone: timber balconies along its long west front (guessed)
    { part: 'fifty', edge: 'west', s0: 2.0, s1: -2.0, floors: [1, 2, 3, 4, 5], depth: 1.2, rail: 'timber' }
  ],
  // The shops the module letters itself (js/shops-data.js's businesses: their boards sit on its walls, not on
  // OpenStreetMap's outlines): their OSM ids
  shops: ['n9443121575', 'n9443121578', 'n9443121579', 'n13944413323', 'n6184860862', 'n9443121581', 'n12839278303', 'n5124779147',
    'n1126920425', 'n13946813980', 'w123383534'],
  // where a board goes when not at the business's own point: Casty Wohnen's over its door on the house's east front,
  // the Bistro Gentiana's on its corner's north front (2859297337667789), the Morosani Fiftyone's on its north end
  signAt: { n9443121575: [-637.2, 1.5], n13944413323: [-638.8, 85.5], w123383534: [-671.0, 109.8] },
  // the Kaffeeklatsch's door (js/missions-data-bars.js KAFI): kept outside the walls, a glass door drawn on the wall
  doors: [[-693.6, 319.5]],
  // the barista mission's start before the Galerie's house (js/missions-data-bars.js)
  starts: [[-687.0, 305.0]]
};

/** A part by its id */
export const part = (id) => PARTS.find((p) => p.id === id);

/** The distance from a point to the Promenade's centre line, and the nearest point on it */
export function promenadeNear(x, z) {
  let best = { d: Infinity, x: 0, z: 0 };
  for (let i = 0; i + 1 < PROMENADE.length; i++) {
    const [ax, az] = PROMENADE[i], [bx, bz] = PROMENADE[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz };
  }
  return best;
}

/** The walls of a part: its outward ring's edges as frames (shorter than 5 cm left out) */
export function partWalls(p) {
  const R = outwardRing(p.ring), out = [];
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len >= 0.05) out.push(F);
  }
  return out;
}

/** Does a wall face the Promenade (its middle within `near` m of the centre line, facing it)? */
export function facesPromenade(F, near = PROMENADE_PLATZ_NORD.near) {
  const [mx, mz] = onWall(F, F.len / 2);
  const p = promenadeNear(mx, mz);
  if (p.d > near || p.d < 1e-6) return false;
  return (F.n[0] * (p.x - mx) + F.n[1] * (p.z - mz)) / p.d > 0.6;
}

/** Is a point inside one of the parts standing on the ground other than `skip`? */
export const insideOther = (x, z, skip) => PARTS.some((q) => q !== skip && !q.over && pointInRing(q.ring, x, z));

/** Does the wall stand against another part (its middle a little out of it inside another's outline)? */
export const against = (p, F) => insideOther(...onWall(F, F.len / 2, 0.3), p);

/**
 * A wall of a part by its name: 'front' its longest wall facing the Promenade, 'north' / 'south' / 'east' / 'west'
 * the longest facing that way (north: smaller z), or an index into partWalls
 */
export function namedWall(p, name) {
  const W = partWalls(p);
  if (typeof name === 'number') return W[name];
  const pick = (ok) => W.filter(ok).reduce((a, F) => (!a || F.len > a.len ? F : a), null);
  if (name === 'front') return pick((F) => facesPromenade(F, HOUSES[p.house].near));
  const dir = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[name];
  return dir ? pick((F) => F.n[0] * dir[0] + F.n[1] * dir[1] > 0.7) : null;
}

/** The outlines the player's walls stand on, per OpenStreetMap building (js/landmarks.js SURVEYED_FOOTPRINTS) */
export function groundOutlines() {
  const out = new Map();
  for (const p of PARTS) {
    if (!p.osm || p.over) continue;
    if (!out.has(p.osm)) out.set(p.osm, []);
    out.get(p.osm).push(p.ring);
  }
  return out;
}

/** Is a point inside one of the outlines the walls stand on? */
export const insideRow = (x, z) => [...groundOutlines().values()].flat().some((r) => pointInRing(r, x, z));

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
