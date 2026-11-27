// The houses along the Talstrasse between the Sportzentrum and Bünda (7270 Davos Platz; js/talstrasse-3.js): their
// surveyed volumes, the eaves over them, the floors' grids, the looks after the street views, balconies, doors, signs.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1748/1012, 11/1749/1012, 11/1749/1013, 11/1750/1013, 11/1750/1014,
// 11/1751/1014): the `ring`s below are the batches' walls at the ground, the `roof` rings their flat roofs (the eaves'
// outlines where they stand out of the walls), heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js), each
// house's floor on the lowest ground under it. Most roofs are flat in the survey; the street views show flat roofs with
// thin dark eaves, a shallow hipped roof on the Talstrasse 39-type block (w126271037) and a saddle roof on the timber
// house by the Sportzentrum (w121860616), whose ridge is put at the survey's height.
// The looks after Mapillary's street views (CC BY-SA), each photo's bearing checked against the outlines:
//   hall    w1388767245  (the new hall by the Sportzentrum, OSM one level): the one photo (2946900578888425, 2013, from the
//                        north-east) shows only trees where it stands; the look (larch boards over a glazed ground band)
//                        is guessed.
//   chalet  w121860616   the same photo, on its left: dark brown timber walls, red shutters, a saddle roof with a chimney
//                        over the gable on the road (north-east); its other sides and the plastered ground floor guessed.
//   block39 w126271037   3127700030786706 (2014, from the west), 869558540331480 and 332725011957837 (2021, the Talstrasse):
//                        cream plaster, the top floor in grey boards, blinds, wide eaves on a shallow hipped roof,
//                        balconies at the south end of the south-west side, the entrance under a canopy on the road.
//   office  w126271027   1677412462453702 (2014, from the north: its north-east side white with blinds) and 1469225790103991,
//                        1245120047747265 (2021, 2026: its north-west side on the road in grey boards with ribbon windows).
//   stiffler w116881208  1469225790103991, 332725011957837, 1245120047747265: the transport firm's grey hall, a white top
//                        band, the billboard "Transporte sind unser Geschäft" with STIFFLER on its front down the road
//                        (west-south-west), the canopy over the loading bay under it.
//   pink    w121860622   197785482286576, 385730616280893 (2021), 1086736595181382 (2014): the salmon staggered block of five
//                        floors, thin dark eaves, balconies with white slabs and brown fronts; its twin w121860628 (no batch,
//                        js/buildings.js) stands in front of it in the photos and shows the same.
//   garages w124874508 + w1528685220 (one batch): 1360521704329671, 2878492372397420 (2015, from the Hertistrasse),
//                        291035169298576 (2013), 282879700098810 (2014): white garages under a flat roof with a dark fascia,
//                        the doors on the Hertistrasse; the photos show them about 4 m high, the survey 5.5–6.2 m (kept).
//   herti   w124874496   1960711531278591 (2026), 252604280052992 and others (2021), 372111907451919 (2014): cream plaster,
//                        garages on the ground floor on its end along the Talstrasse (north-west), brown balconies on its south-west sides (guessed).
//   cresta  w124874480   839374266764129 (2021), 372111907451919 (2014): the Hotel Cresta Sun, peach plaster, long brown
//                        balconies on its south-west sides, HOTEL CRESTA SUN with the sun on its end towards the Talstrasse;
//                        the low wing between it and w124874496 (garages, timber over them) is in the same batch.
//   yellow  w117012334   5755873101104476 (2014, from the south-west), 261109372369610 (2016): yellow plaster, balconies with
//                        green glass fronts across the south-west side, a stair tower on the north-east side.
//   loggia  w117012170   253973119794759 (2014): white, green shutters, loggias with brown fronts on the road side.
//   bungalow w117012164  3692288030883389 (2014): a yellow storey with a deep dark fascia over a beige base.
//   annex   w117012140   466949517889844 (2014; its camera position is off), 542781003654226 (2021): cream plaster, four
//                        floors, glazed balconies; the yellow HOTEL CRESTA SUN board stands before it (not built).
// The doors and the sides no photo shows are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// Colours (linear)
const C = {
  white: [0.58, 0.575, 0.55], cream: [0.55, 0.51, 0.41], creamWarm: [0.58, 0.52, 0.37], salmon: [0.47, 0.25, 0.175],
  peach: [0.52, 0.33, 0.22], yellow: [0.55, 0.43, 0.16], yolk: [0.56, 0.42, 0.09], beige: [0.42, 0.31, 0.24],
  logs: [0.15, 0.08, 0.04], larch: [0.3, 0.17, 0.08], greyBoards: [0.27, 0.26, 0.245], metal: [0.29, 0.3, 0.31],
  metalLight: [0.52, 0.53, 0.53], concrete: [0.4, 0.4, 0.39], darkTimber: [0.11, 0.065, 0.04]
};
export const COLOURS = C;
// window kinds (the walls' material draws them): a white frame with a post; red shutters; green shutters; a ribbon of
// glazing in dark frames; blinds drawn down to a height of their own
export const KIND = { plain: 0, red: 1, green: 2, ribbon: 3, blinds: 4 };
// skins: plaster, horizontal boards, vertical boards or ribbed metal, logs
export const SKIN = { plaster: 0, boards: 1, ribs: 2, logs: 3 };

// A window: [half width (bays), from, to (of the storey)] and its kind
const win = (kind, half = 0.2, lo = 0.3, hi = 0.74) => [half, lo, hi, kind];

export const HOUSES = [
  {
    id: 'hall', osm: 'w1388767245', name: 'the hall by the Sportzentrum', floor: -19.33,
    look: { colour: C.larch, skin: SKIN.ribs, closed: true, storey: 2.9, bay: 3.0, fascia: C.darkTimber },
    parts: [
      // the glazed ground band, 6 m, the hall over it standing 0.5–0.9 m out on the south and west
      {
        ring: [[49.2, -331.4], [40.7, -342.3], [37.7, -345.6], [21.4, -337.8], [24.2, -331.6], [24.1, -330.8], [31.9, -328.7], [32.3, -330.4], [35.6, -329.5], [35.1, -327.9], [42.9, -325.8], [43.0, -326.2]],
        top: -13.5, roof: 'none',
        look: { colour: C.concrete, skin: SKIN.plaster, closed: false, floors: 2, win: win(KIND.ribbon, 0.5, 0.1, 0.9) }
      },
      {
        ring: [[40.1, -342.5], [40.8, -342.9], [49.9, -331.3], [43.4, -326.0], [43.3, -325.1], [34.5, -327.5], [34.9, -329.2], [32.7, -329.8], [32.2, -328.1], [23.6, -330.4], [23.7, -331.4], [20.8, -338.0], [37.9, -346.2]],
        from: -13.5, top: -0.21, ground: false
      }
    ],
    doors: [{ part: 0, deg: 330, at: 0.5, w: 2.0 }]
  },
  {
    id: 'chalet', osm: 'w121860616', name: 'the timber house by the Sportzentrum', floor: -18.82,
    look: {
      colour: C.logs, skin: SKIN.logs, storey: 2.88, floors: 5, bay: 2.5, win: win(KIND.red, 0.2, 0.3, 0.76),
      levels: { 0: { colour: C.white, skin: SKIN.plaster } }, fascia: C.darkTimber
    },
    parts: [
      {
        // north, east, south, west corners: the gables on the road (north-east) and away from it
        ring: [[64.3, -360.1], [70.9, -348.2], [59.4, -341.8], [50.7, -352.5]],
        top: 0.64,
        roof: { kind: 'saddle', gable: 0, eaves: -4.42, overhang: 0.8 }
      }
    ],
    chimney: { at: [61.4, -348.6], half: 0.4, top: 1.6 },
    doors: [{ part: 0, deg: 150, at: 0.3, w: 1.0 }]
  },
  {
    id: 'block39', osm: 'w126271037', name: 'the block with the timber top floor', floor: -17.85,
    look: {
      colour: C.cream, storey: 2.76, floors: 5, bay: 2.7, win: win(KIND.blinds, 0.2, 0.28, 0.76),
      levels: { 4: { colour: C.greyBoards, skin: SKIN.boards } }, fascia: C.white
    },
    parts: [
      {
        ring: [[110.7, -380.3], [108.0, -383.9], [95.6, -374.6], [104.9, -362.3], [116.9, -371.3]],
        top: -2.74,
        roof: { kind: 'hip', ring: [[108.1, -385.8], [93.3, -374.8], [104.4, -360.0], [119.1, -371.0]], eaves: -3.74 }
      }
    ],
    balconies: [{ part: 0, deg: 233, from: 0.66, to: 0.95, floors: [1, 2, 3], depth: 1.4, front: [0.16, 0.16, 0.16], slab: [0.45, 0.44, 0.42], rail: true }],
    doors: [{ part: 0, deg: 323, at: 0.3, w: 1.2, canopy: true }]
  },
  {
    id: 'office', osm: 'w126271027', name: 'the office house on the Talstrasse', floor: -17.6,
    look: {
      colour: C.white, storey: 2.93, floors: 4, bay: 2.6, win: win(KIND.blinds, 0.2, 0.28, 0.76), fascia: C.darkTimber,
      faces: [
        { deg: 323, colour: C.greyBoards, skin: SKIN.boards, bay: 3.0, win: win(KIND.ribbon, 0.5, 0.22, 0.82) },
        // (against w126271035)
        { deg: 141, closed: true }
      ]
    },
    parts: [
      {
        ring: [[110.7, -380.3], [121.8, -388.7], [128.4, -380.0], [127.5, -379.3], [128.4, -378.0], [118.6, -370.2], [118.0, -369.8], [116.9, -371.3]],
        top: -5.29,
        roof: { ring: [[110.1, -381.0], [121.7, -389.6], [129.9, -378.6], [128.7, -377.7], [118.6, -370.2], [118.0, -369.8], [116.9, -371.3], [110.7, -380.3]] }
      }
    ],
    doors: [{ part: 0, deg: 53, at: 0.35, w: 1.2 }]
  },
  {
    id: 'stiffler', osm: 'w116881208', name: 'the Stiffler hall', floor: -18.42,
    look: {
      colour: C.metal, skin: SKIN.ribs, closed: true, storey: 2.98, floors: 5, bay: 3.0,
      levels: { 4: { colour: C.metalLight } }, fascia: [0.2, 0.2, 0.21]
    },
    parts: [
      {
        ring: [[172.6, -406.6], [164.7, -420.0], [140.4, -405.8], [161.0, -370.5], [185.3, -384.8], [183.3, -388.2]],
        top: -3.0,
        // (its south-east side, against w1528797226, a full wall: the survey's notch down to y −8.4 there is closed by
        // two near-vertical triangles in the same plane)
        roof: { ring: [[140.4, -405.8], [161.0, -370.5], [185.3, -384.8], [164.7, -420.0]] }
      }
    ],
    billboard: { part: 0, deg: 240, from: 0.12, to: 0.52, y0: 7.2, y1: 13.2 },
    canopy: { part: 0, deg: 240, from: 0.5, to: 0.8, y: 5.0, depth: 4.0 },
    gates: [{ part: 0, deg: 240, from: 0.53, to: 0.77, n: 2, h: 4.2 }, { part: 0, deg: 330, from: 0.55, to: 0.85, n: 2, h: 4.2 }]
  },
  {
    id: 'pink', osm: 'w121860622', name: 'the salmon block', floor: -16.12,
    look: { colour: C.salmon, storey: 2.97, floors: 5, bay: 2.5, win: win(KIND.plain, 0.2, 0.28, 0.76), fascia: C.darkTimber },
    parts: [
      {
        ring: [[254.9, -470.2], [255.8, -467.2], [256.0, -466.3], [252.1, -465.2], [252.6, -463.3], [251.7, -463.0], [244.8, -461.1], [246.2, -457.1], [241.4, -455.8], [240.6, -458.9], [233.0, -456.9], [234.0, -453.5], [233.3, -453.3], [234.4, -449.1], [235.3, -449.3], [237.4, -442.0], [245.2, -444.2], [245.8, -442.3], [253.4, -444.4], [252.6, -447.3], [256.2, -448.3], [255.0, -452.6], [263.1, -454.9], [262.7, -456.3], [266.7, -457.4], [264.5, -465.1], [265.4, -465.3], [263.4, -472.5]],
        top: -0.59,
        roof: { ring: [[252.4, -464.2], [252.6, -463.3], [251.7, -463.0], [252.4, -460.3], [257.8, -461.8], [256.2, -467.4], [255.8, -467.2], [256.0, -466.3], [255.1, -466.0], [253.7, -470.9], [264.1, -473.8], [266.6, -464.6], [265.8, -464.4], [267.9, -456.7], [263.9, -455.6], [264.3, -454.1], [256.2, -451.9], [257.4, -447.6], [253.8, -446.6], [254.7, -443.7], [245.1, -441.0], [244.5, -442.9], [236.7, -440.8], [234.6, -448.1], [233.7, -447.9], [232.0, -454.0], [232.7, -454.2], [231.8, -457.6], [241.3, -460.2], [242.2, -456.8], [245.0, -457.5], [243.5, -461.8]] }
      },
      // the two stair towers over the roof
      { ring: [[240.8, -456.7], [242.6, -450.5], [247.9, -452.0], [246.2, -458.2]], top: 1.36, look: { closed: true } },
      { ring: [[250.9, -465.9], [252.4, -460.3], [257.8, -461.8], [256.2, -467.4]], top: 1.46, look: { closed: true } }
    ],
    // balconies on the sides facing west and south
    balconies: [
      { part: 0, deg: 255, tol: 30, from: 0.1, to: 0.9, floors: [1, 2, 3, 4], depth: 1.3, front: [0.17, 0.09, 0.045], slab: [0.56, 0.555, 0.54], all: true },
      { part: 0, deg: 165, tol: 30, from: 0.15, to: 0.85, floors: [1, 2, 3, 4], depth: 1.3, front: [0.17, 0.09, 0.045], slab: [0.56, 0.555, 0.54], all: true }
    ],
    doors: [{ part: 0, deg: 165, at: 0.5, w: 1.2 }]
  },
  {
    id: 'garages', osm: 'w124874508', name: 'the garages on the Hertistrasse', floor: -16.45,
    look: { colour: C.white, closed: true, storey: 2.9, bay: 3.0, fascia: C.darkTimber },
    parts: [{ ring: [[303.0, -494.5], [298.5, -489.4], [317.5, -472.8], [322.0, -477.9]], top: -10.22 }],
    gates: [{ part: 0, deg: 221, from: 0.04, to: 0.96, n: 8, h: 2.2 }]
  },
  {
    id: 'garages2', osm: 'w1528685220', name: 'the garages behind them', floor: -16.45,
    look: { colour: C.white, closed: true, storey: 2.9, bay: 3.0, fascia: C.darkTimber },
    parts: [{ ring: [[310.8, -487.6], [318.1, -481.3], [321.1, -484.6], [318.8, -486.6], [323.9, -492.3], [318.8, -496.8]], top: -10.99 }],
    gates: [{ part: 0, deg: 311, from: 0.06, to: 0.94, n: 4, h: 2.2 }]
  },
  {
    id: 'herti', osm: 'w124874496', name: 'the cream block with the garages', floor: -16.79,
    look: { colour: C.creamWarm, storey: 3.27, floors: 4, bay: 2.7, win: win(KIND.plain, 0.2, 0.28, 0.74), fascia: C.darkTimber },
    parts: [
      {
        ring: [[338.0, -513.2], [350.6, -501.5], [348.1, -498.7], [349.5, -497.4], [352.9, -501.0], [365.6, -489.2], [354.1, -476.7], [341.2, -488.6], [340.5, -487.9], [340.3, -487.7], [326.4, -500.7]],
        top: -2.91,
        // (the garages' ground floor on the Talstrasse: no windows there)
        look: { faces: [{ deg: 313, levels: { 0: { closed: true } } }] }
      }
    ],
    gates: [{ part: 0, deg: 313, from: 0.06, to: 0.94, n: 6, h: 2.3 }],
    balconies: [{ part: 0, deg: 223, from: 0.1, to: 0.9, floors: [1, 2, 3], depth: 1.4, front: [0.2, 0.1, 0.05], slab: [0.56, 0.555, 0.54], all: true }],
    doors: [{ part: 0, deg: 133, at: 0.5, w: 1.2 }]
  },
  {
    id: 'cresta', osm: 'w124874480', name: 'the Hotel Cresta Sun', floor: -16.79,
    look: { colour: C.peach, storey: 3.3, floors: 4, bay: 2.8, win: win(KIND.plain, 0.2, 0.28, 0.74), fascia: C.darkTimber },
    parts: [
      // the low wing between the hotel and w124874496: garages under timber
      {
        ring: [[348.1, -498.7], [349.5, -497.4], [352.9, -501.0], [364.8, -489.9], [365.1, -490.2], [363.4, -491.7], [368.7, -497.7], [370.3, -496.3], [379.4, -506.6], [378.1, -507.7], [375.8, -505.0], [360.7, -518.2], [365.1, -523.2], [363.7, -524.4], [346.7, -505.1], [350.6, -501.5]],
        top: -10.52,
        look: { storey: 2.88, floors: 2, levels: { 0: { colour: C.white, closed: true }, 1: { colour: C.darkTimber, skin: SKIN.boards } } }
      },
      { ring: [[369.9, -499.1], [358.3, -509.6], [352.5, -503.3], [364.2, -492.7]], top: -10.02, ground: false, look: { colour: C.darkTimber, skin: SKIN.boards, closed: true } },
      // the hotel
      {
        ring: [[386.6, -500.2], [390.6, -504.9], [392.0, -503.7], [397.5, -509.9], [394.6, -512.5], [396.1, -514.1], [388.1, -521.1], [387.4, -520.3], [385.6, -522.0], [383.4, -519.5], [370.6, -530.7], [367.6, -527.3], [368.2, -526.7], [360.7, -518.2], [375.8, -505.0], [378.1, -507.7]],
        top: -2.73
      },
      // a low annex on the hotel's north-east side (no OpenStreetMap outline of its own; guessed)
      { ring: [[375.0, -526.8], [379.4, -531.9], [384.4, -527.5], [380.0, -522.4]], top: -9.21, look: { colour: C.white, closed: true } }
    ],
    gates: [{ part: 0, deg: 311, from: 0.06, to: 0.94, n: 7, h: 2.3 }],
    balconies: [
      { part: 2, deg: 221, from: 0.03, to: 0.97, floors: [1, 2, 3], depth: 1.5, front: [0.2, 0.1, 0.05], slab: [0.56, 0.555, 0.54], all: true }
    ],
    // (between the second and the third floor's windows, over the low wing's roof)
    sign: { part: 2, deg: 311, from: 0.12, to: 0.88, y0: 9.2, y1: 10.7, key: 'cresta' },
    doors: [{ part: 2, deg: 311, at: 0.5, w: 1.6, canopy: true }]
  },
  {
    id: 'yellow', osm: 'w117012334', name: 'the yellow block with the glass balconies', floor: -15.5,
    look: { colour: C.yellow, storey: 3.17, floors: 5, bay: 2.6, win: win(KIND.plain, 0.2, 0.28, 0.76), fascia: C.darkTimber },
    parts: [
      { ring: [[285.8, -531.4], [298.0, -514.8], [310.9, -524.2], [298.7, -540.8]], top: 1.15, roof: { ring: [[285.1, -531.5], [297.9, -514.1], [311.6, -524.1], [298.8, -541.5]] } },
      // the stair tower on the north-east side
      { ring: [[302.0, -534.8], [305.6, -529.9], [307.7, -531.5], [304.1, -536.4]], top: 3.46, look: { closed: true } }
    ],
    balconies: [{ part: 0, deg: 234, from: 0.03, to: 0.97, floors: [1, 2, 3, 4], depth: 1.6, front: [0.2, 0.27, 0.25], slab: [0.56, 0.555, 0.54], glass: true }],
    doors: [{ part: 0, deg: 144, at: 0.5, w: 1.2, canopy: true }]
  },
  {
    id: 'loggia', osm: 'w117012170', name: 'the white block with the loggias', floor: -15.09,
    look: { colour: C.white, storey: 3.18, floors: 5, bay: 2.6, win: win(KIND.green, 0.19, 0.3, 0.76), fascia: C.darkTimber },
    parts: [
      {
        ring: [[340.7, -537.5], [337.8, -548.9], [338.7, -549.1], [336.9, -556.3], [331.2, -554.9], [331.6, -553.5], [315.2, -549.3], [319.7, -532.0]],
        top: 1.62,
        roof: { ring: [[336.9, -556.3], [338.7, -549.1], [337.8, -548.9], [340.7, -537.5], [319.7, -532.0], [315.2, -549.3], [331.6, -553.5], [331.2, -554.9]] }
      }
    ],
    balconies: [{ part: 0, deg: 165, from: 0.05, to: 0.5, floors: [1, 2, 3, 4], depth: 1.0, front: [0.2, 0.1, 0.05], slab: [0.56, 0.555, 0.54] }],
    doors: [{ part: 0, deg: 165, at: 0.75, w: 1.2 }]
  },
  {
    id: 'bungalow', osm: 'w117012164', name: 'the yellow bungalow', floor: -14.34,
    look: {
      colour: C.yolk, storey: 2.72, floors: 2, bay: 2.8, win: win(KIND.plain, 0.24, 0.3, 0.8), fascia: C.darkTimber, fasciaDepth: 0.5,
      levels: { 0: { colour: C.beige, closed: true } }
    },
    parts: [
      {
        ring: [[361.6, -559.4], [360.4, -564.1], [347.5, -560.8], [347.9, -559.3], [346.4, -558.9], [347.0, -556.5], [348.8, -556.9], [352.0, -544.2], [357.4, -545.6], [357.1, -546.8], [371.1, -550.4], [368.8, -559.4], [364.1, -558.2], [363.6, -560.0]],
        top: -8.3,
        roof: { ring: [[357.8, -546.4], [358.1, -545.2], [351.7, -543.6], [348.4, -556.3], [346.6, -555.9], [345.8, -559.3], [347.3, -559.7], [346.9, -561.2], [360.8, -564.7], [362.0, -560.0], [363.9, -560.6], [364.4, -558.8], [369.1, -560.0], [371.7, -550.0]] }
      }
    ],
    doors: [{ part: 0, deg: 165, at: 0.3, w: 1.1 }]
  },
  {
    id: 'annex', osm: 'w117012140', name: 'the cream house by the Cresta Sun', floor: -14.93,
    look: { colour: C.creamWarm, storey: 3.18, floors: 4, bay: 2.7, win: win(KIND.blinds, 0.2, 0.28, 0.76), fascia: C.white },
    parts: [
      {
        ring: [[441.8, -559.9], [421.2, -550.6], [422.2, -548.2], [417.5, -546.4], [416.5, -548.8], [404.3, -543.1], [407.3, -531.2], [423.5, -535.2], [423.2, -536.3], [429.9, -537.9], [429.5, -539.3], [439.1, -541.7], [438.8, -543.0], [445.6, -544.7]],
        top: -1.51,
        roof: { ring: [[442.1, -560.6], [446.2, -544.3], [439.4, -542.6], [439.7, -541.4], [430.1, -539.0], [430.5, -537.6], [423.8, -535.9], [424.1, -534.9], [406.9, -530.6], [403.7, -543.4], [416.8, -549.5], [417.8, -547.0], [421.6, -548.5], [420.6, -550.9]] }
      }
    ],
    balconies: [{ part: 0, deg: 256, from: 0.55, to: 0.95, floors: [1, 2, 3], depth: 1.5, front: [0.2, 0.25, 0.27], slab: [0.56, 0.555, 0.54], glass: true, closedBox: true }],
    doors: [{ part: 0, deg: 336, at: 0.5, w: 1.4, canopy: true }]
  }
];

// The look of a part's wall: the house's look, the part's over it, a face's (by its compass direction) over that
export const DEFAULT_LOOK = { colour: C.white, skin: SKIN.plaster, closed: false, storey: 2.9, floors: 0, bay: 2.6, win: win(KIND.plain), levels: {}, fascia: C.darkTimber, fasciaDepth: 0.32 };

/** Compass degrees (0 north, 90 east; z south) a wall's outward normal points to */
export const compass = (F) => ((Math.atan2(F.n[0], -F.n[1]) * 180) / Math.PI + 360) % 360;
const angleOff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** The walls of a ring, turned so that their outside is on (−u.z, u.x) */
export function wallsOf(ring) {
  const R = outwardRing(ring);
  const out = [];
  for (let i = 0; i < R.length; i++) {
    const F = wallFrame(R[i], R[(i + 1) % R.length]);
    if (F.len > 0.05) out.push(F);
  }
  return out;
}
/** The longest wall of a ring whose outside faces `deg` (± tol) */
export function faceWall(ring, deg, tol = 40) {
  let best = null;
  for (const F of wallsOf(ring)) if (angleOff(compass(F), deg) <= tol && (!best || F.len > best.len)) best = F;
  return best;
}
/** Every wall of a ring whose outside faces `deg` (± tol) */
export const faceWalls = (ring, deg, tol = 40) => wallsOf(ring).filter((F) => angleOff(compass(F), deg) <= tol);

/** A part's look for a wall: the house's, the part's, then the face's that matches the wall (its levels merged) */
export function lookFor(house, part, F = null) {
  const L = { ...DEFAULT_LOOK, ...house.look, ...(part.look || {}) };
  L.levels = { ...(house.look.levels || {}), ...((part.look && part.look.levels) || {}) };
  if (F) {
    for (const f of [...(house.look.faces || []), ...((part.look && part.look.faces) || [])]) {
      if (angleOff(compass(F), f.deg) > (f.tol ?? 30)) continue;
      const { levels, ...rest } = f;
      Object.assign(L, rest);
      if (levels) L.levels = { ...L.levels, ...levels };
    }
  }
  delete L.faces; delete L.deg; delete L.tol;
  return L;
}

/** Where a part's walls start: under the house's floor */
export const baseOf = (house) => house.floor - 0.8;
/** The part's walls' top: under its roof's slab (flat), the eaves (hipped), the eaves at the eaves' sides (saddle) */
export function wallTopOf(house, part) {
  const roof = part.roof || {};
  const fd = lookFor(house, part).fasciaDepth;
  if (roof === 'none') return part.top;
  if (roof.kind === 'hip') return roof.eaves - 0.12;
  if (roof.kind === 'saddle') return roof.eaves;
  return part.top - fd + 0.02;
}
/** A part's roof outline (the eaves' outline, or its walls') */
export const roofRingOf = (part) => (part.roof && part.roof.ring) || part.ring;

// --- The chalet's saddle roof ---------------------------------------------------------------------------------------------
/** The saddle roof's frame: t along the ridge (from the gable away from the road), c across it, the eaves' and the ridge's c */
export function saddleFrame(part) {
  const R = part.ring, g = part.roof.gable, n = R.length;
  const a = R[g], b = R[(g + 1) % n], c = R[(g + 2) % n], d = R[(g + 3) % n];
  const m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m0 = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
  const L = Math.hypot(m1[0] - m0[0], m1[1] - m0[1]);
  const u = [(m1[0] - m0[0]) / L, (m1[1] - m0[1]) / L], nn = [-u[1], u[0]];
  const loc = ([x, z]) => [(x - m0[0]) * u[0] + (z - m0[1]) * u[1], (x - m0[0]) * nn[0] + (z - m0[1]) * nn[1]];
  const ts = R.map((p) => loc(p)[0]), cs = R.map((p) => loc(p)[1]);
  const c0 = Math.min(...cs), c1 = Math.max(...cs), ov = part.roof.overhang;
  const toWorld = (t, cc) => [m0[0] + u[0] * t + nn[0] * cc, m0[1] + u[1] * t + nn[1] * cc];
  return { o: m0, u, n: nn, loc, toWorld, t0: Math.min(...ts) - ov, t1: Math.max(...ts) + ov, c0: c0 - ov, c1: c1 + ov, cr: (c0 + c1) / 2, w0: c0, w1: c1 };
}
/** The saddle roof's height at c across it (its upper face), the eaves at the walls' line */
export function saddleY(part, S, c) {
  const { eaves } = part.roof, ridge = part.top, half = (S.w1 - S.w0) / 2;
  return ridge - ((ridge - eaves) * Math.abs(c - S.cr)) / half;
}

// --- Exclusions, outlines -------------------------------------------------------------------------------------------------
// swissBUILDINGS3D's buildings (their centres) left out of the streamed tiles: one batch a house; w124874508's holds
// w1528685220 too, w124874480's holds w124874496 and the low wing between them. The hall's batches 0, 2, 7 and 28 (slabs
// on the ground west of it, under 0.5 m) stay streamed.
export const EXCLUDE = [
  { x: 35.3, z: -335.5, r: 3 }, { x: 60.8, z: -350.9, r: 3 }, { x: 106.2, z: -372.9, r: 3 }, { x: 120, z: -379.7, r: 3 },
  { x: 162.9, z: -395.3, r: 3 }, { x: 249.9, z: -457.3, r: 3 }, { x: 311.4, z: -484.6, r: 3 }, { x: 362, z: -504.2, r: 3 },
  { x: 298.4, z: -527.8, r: 3 }, { x: 328, z: -544.2, r: 3 }, { x: 358.8, z: -554.3, r: 3 }, { x: 425, z: -545.6, r: 3 }
];

/** The outlines the player's walls stand on, by OSM id (js/landmarks.js SURVEYED_FOOTPRINTS): the parts on the ground */
export function groundOutlines() {
  const out = new Map();
  for (const h of HOUSES) {
    const rings = h.parts.filter((p) => p.ground !== false).map((p) => p.ring);
    out.set(h.osm, [...(out.get(h.osm) || []), ...rings]);
  }
  // (the hotel's batch holds w124874496 and the low wing: the cream block on its own id)
  return out;
}

/** Is a point inside any of the row's houses (at the ground)? */
export const insideRow = (x, z) => [...groundOutlines().values()].some((rings) => rings.some((r) => pointInRing(r, x, z)));

/** Every part of the row with its house: [{ house, part, index }] */
export const allParts = () => HOUSES.flatMap((house) => house.parts.map((part, index) => ({ house, part, index })));

/** The atlas' cells ([x, y, w, h] px) in a canvas of ATLAS_SIZE */
export const ATLAS_SIZE = [1024, 256];
export const ATLAS = {
  stiffler: [0, 0, 512, 256],
  cresta: [528, 0, 480, 160],
  door: [528, 176, 40, 80],
  gate: [584, 176, 96, 80]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
