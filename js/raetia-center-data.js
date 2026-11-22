// The Rätia Center (Promenade 40, 7270 Davos Platz; js/raetia-center.js): the shopping centre at the Postplatz, its low
// front on the Promenade under the big metal roof. Its volumes, the roof's planes, the front's measures. Pure data and
// frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1744/1007, batch 21, one building): the roof that climbs from the eaves on the
// Promenade (3.5 m over the street) to the flat roofs 16.7 m up, a strip of it 1.7 m lower along the north side, the
// flat-roofed pavilion before it, the plant floor on top and two lower blocks towards the valley; OpenStreetMap's
// footprint w64491215. Heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js); the Promenade lies at
// y 0 before the front, the valley side 7 m lower. The pavilion's front, which the survey draws with a jog of 0.9 m,
// is one straight wall here. The look after a photograph of the front from across the Promenade: standing-seam zinc
// with four tall dormers framed in copper, a copper band with the lettering and the ibex over the glazed entrance,
// dark sheet walls beside it, the tenants' board and a row of posters on the south part. The sides and the back are
// not on the photograph: dark sheet under the roof's slope, plaster with windows on the blocks behind.
import { wallFrame } from './spital-data.js';

// The house's own frame: from the south-west corner `s` m north along the eaves, `r` m east (up the roof's slope)
const ORIGIN = [-640.3, 260.2], EAVES_END = [-636.4, 245.5];
const E = (() => { const dx = EAVES_END[0] - ORIGIN[0], dz = EAVES_END[1] - ORIGIN[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
const H = [-E[1], E[0]];
/** The world point `s` m along the eaves from the south-west corner and `r` m up the slope's run */
export const local = (s, r) => [ORIGIN[0] + E[0] * s + H[0] * r, ORIGIN[1] + E[1] * s + H[1] * r];
/** A world point in the house's frame: [s, r] */
export const toLocal = (x, z) => [(x - ORIGIN[0]) * E[0] + (z - ORIGIN[1]) * E[1], (x - ORIGIN[0]) * H[0] + (z - ORIGIN[1]) * H[1]];

const EAVES = 3.5, FLAT = 16.67;

export const RAETIA = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: -616.3, z: 249.7, r: 6 },
  osm: 'w64491215',
  // The house's businesses (OSM, js/shops-data.js): their fascia boards hung 4.5 m up OpenStreetMap's walls, over the
  // eaves; the house carries the tenants' board instead
  shops: ['w64491215', 'n6184860865', 'n11057190937', 'n6184860864', 'n12615344583', 'n5523199936', 'n4537977467', 'n11057190938'],
  ground: 0, // the Promenade before the front
  base: -9, // how far down the walls reach (under the ground on the valley side)
  eaves: EAVES, flat: FLAT,
  // The blocks' floors, counted down from each block's roof; a window in its storey, the bays along a wall
  storey: 3.3, bay: 3.0, window: { lo: 0.95, hi: 2.45, half: 1.0 },
  // The volumes: a flat roof at `top` over the outline (world x, z), or a roof through the outline's own heights
  // ([x, z, y]); `walls`: 'sheet' (dark standing-seam sheet), 'windows' (plaster, a window per bay and floor) or
  // 'closed' (plaster); `roof`: 'zinc' or gravel
  parts: [
    // the big roof: from the eaves on the Promenade up to the flat roofs
    { id: 'slope', walls: 'sheet', roof: 'zinc',
      ring: [[-640.3, 260.2, EAVES], [-636.4, 245.5, EAVES], [-635.1, 245.9, 4.6], [-632.4, 236.1, 4.6], [-618.3, 239.9, FLAT], [-624.9, 264.4, FLAT]] },
    // ... and its strip along the north side, 1.7 m lower
    { id: 'slope-north', walls: 'sheet', roof: 'zinc',
      ring: [[-633.0, 235.8, 2.7], [-631.4, 230.7, 2.9], [-614.8, 235.2, FLAT], [-616.2, 240.5, FLAT], [-618.3, 239.9, 15.0], [-631.8, 236.2, 3.7]] },
    { id: 'top', top: FLAT, walls: 'windows',
      ring: [[-614.8, 235.2], [-616.2, 240.5], [-618.3, 239.9], [-624.9, 264.4], [-602.6, 270.4], [-598.3, 254.8], [-599.5, 254.5], [-595.7, 240.3], [-596.3, 240.0], [-609.9, 236.4]] },
    { id: 'plant', top: 19.38, walls: 'windows',
      ring: [[-602.0, 260.9], [-615.5, 257.2], [-609.9, 236.4], [-596.3, 240.0]] },
    { id: 'east', top: 12.28, walls: 'windows',
      ring: [[-592.2, 241.1], [-595.7, 240.3], [-599.5, 254.5], [-596.2, 255.9]] },
    { id: 'east-south', top: 13.45, walls: 'closed',
      ring: [[-598.2, 262.4], [-600.2, 261.8], [-598.3, 254.8], [-596.3, 255.4]] }
  ],
  // The pavilion before the roof's north half, on the Promenade: its front from `a` (the north end, on the left for
  // someone before it) to `b`, `depth` m back to the roof; the glazed ground floor up to `glass`, the band over it up to
  // the flat roof at `top` and a parapet round that; the band is dark sheet up to `dark` m along the front, copper from
  // there on, the lettering on the copper; the doors under it
  annex: {
    a: [-635.8, 229.2], b: [-639.6, 244.5], depth: 5.0, top: 4.55, parapet: 0.45, glass: 2.75, out: 0.45, dark: 4.2,
    name: { from: 5.3, w: 9.4 }, doors: [9.0, 10.7, 12.4], ghost: { from: 4.7, w: 3.7 }, flags: [0.8, 2.2, 3.6]
  },
  // The south part of the front, under the eaves: from `a` (its north end, at the pavilion) to `b` (the house's
  // south-west corner); a parapet up to `top`, glazed up to `glassTo` m along it, the tenants' board and the posters
  front: {
    a: EAVES_END, b: ORIGIN, top: 4.3, glassTo: 5.6,
    board: { from: 9.7, w: 4.4, y: 2.6, h: 1.5 }, posters: { from: 9.5, w: 4.8, y: 0.95, h: 1.2 }
  },
  // The tenants' board once more on the gable towards the Postplatz (along the south wall from the corner)
  gable: { a: ORIGIN, b: [-624.9, 264.4], board: { from: 5.2, w: 4.4, y: 2.9, h: 1.5 } },
  // The dormers on the big roof: `s` m along the eaves to its middle, its front `r` m up the slope's run, `w` wide,
  // the front `h` high (from north to south; the southernmost stands higher on the roof)
  dormers: [
    { s: 22.7, r: 4.0, w: 3.0, h: 3.4 }, { s: 18.3, r: 3.0, w: 3.0, h: 3.4 }, { s: 13.4, r: 3.6, w: 3.0, h: 3.4 }, { s: 8.2, r: 7.0, w: 3.0, h: 3.4 }
  ]
};

// The big roof's plane: its rise per metre of run, from the eaves to the flat roofs' edge
const TOP_RUN = toLocal(-624.9, 264.4)[1];
export const SLOPE = { rise: (FLAT - EAVES) / TOP_RUN, run: TOP_RUN };
/** The big roof's height `r` m up its run */
export const slopeHeight = (r) => EAVES + SLOPE.rise * r;

const ANNEX = wallFrame(RAETIA.annex.a, RAETIA.annex.b), FRONT = wallFrame(RAETIA.front.a, RAETIA.front.b), GABLE = wallFrame(RAETIA.gable.a, RAETIA.gable.b);
export const annexFrame = () => ANNEX;
export const frontFrame = () => FRONT;
export const gableFrame = () => GABLE;
/** A dormer's frame (its front, a west wall: the north end on the left), the heights of its foot and its top and how
 *  far back its roof runs into the slope */
export function dormerFrame(d) {
  const foot = slopeHeight(d.r);
  return { F: wallFrame(local(d.s + d.w / 2, d.r), local(d.s - d.w / 2, d.r)), foot, top: foot + d.h, back: d.h / SLOPE.rise };
}

/** The spot before the doors (world), on the Promenade's pavement */
export const RAETIA_ENTRANCE = (() => {
  const s = RAETIA.annex.doors[1], o = RAETIA.annex.out + 1.4;
  return { x: Math.round((ANNEX.a[0] + ANNEX.u[0] * s + ANNEX.n[0] * o) * 10) / 10, z: Math.round((ANNEX.a[1] + ANNEX.u[1] * s + ANNEX.n[1] * o) * 10) / 10 };
})();
