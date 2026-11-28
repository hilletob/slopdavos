// The houses along the Obere Strasse in Davos Platz from the Club Hotel (south-west) to the Kurpark (north-east)
// (js/obere-strasse-1.js): eighteen houses by hand in one module, each its surveyed volumes, its roofs and its look.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1742/1003–1004, 11/1743/1005–1009; the batches named at each house): the
// outlines below are its flat roofs' outlines (the walls under them), the pitched roofs its sloped triangles cleaned
// into planes; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js; x east, z south). The street runs
// from the end of the Albertistrasse (−946/639) north-north-east past the Club Hotel (−916/546) to the bend at
// −784/276, then north along x ≈ −770…−752 to the Kurpark (−751/33). Only two houses have
// photographs (Mapillary's street views, CC BY-SA, 2014–2026): the white block with the turret at the street's
// south-west end and the cream villa south of it; all the others are guessed in the town's style (white or cream render, brown or grey shutters, timber
// or glass balconies, flat roofs as the survey has them), each house's note saying so. The houses with no batch of
// their own (w97292364, w97292348, w97292337, the Evangelische Kirchgemeinde w123385309, the Kurpark w127671917) stay
// with js/buildings.js and the streamed tiles.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const STOREY = 2.9;
// a window (m over its storey's foot), its half width; the bays' spacing along a wall (scaled by a house's `bay`)
export const WIN = { lo: 0.9, hi: 2.2, half: 0.58 };
export const BAY = 2.7;

// --- Frames --------------------------------------------------------------------------------------------------------------
/** A frame along a→b: o = a, u the unit along, n = (−u.z, u.x) (the right of someone walking a→b, z south), L */
export function frame(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const u = [dx / L, dz / L];
  return { o: a, u, n: [-u[1], u[0]], L };
}
/** World [x, z] of (t, c) in a frame */
export const at = (F, t, c) => [F.o[0] + F.u[0] * t + F.n[0] * c, F.o[1] + F.u[1] * t + F.n[1] * c];
/** (t, c) of a world point in a frame */
export const local = (F, x, z) => { const dx = x - F.o[0], dz = z - F.o[1]; return [dx * F.u[0] + dz * F.u[1], dx * F.n[0] + dz * F.n[1]]; };
const R2 = (p) => p.map((v) => Math.round(v * 100) / 100);
/** A ring of `n` corners round c (x, z), radius r */
export const circleRing = (c, r, n = 12) => Array.from({ length: n }, (_, i) => R2([c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n)]));
/** A ring without corners closer than `d` m to the one before (the survey's arcs and slivers) */
export function dedupe(ring, d = 0.3) {
  const out = [];
  for (const p of ring) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) >= d) out.push(p);
  while (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < d) out.pop();
  return out;
}

// --- Colours (linear) ----------------------------------------------------------------------------------------------------
export const COLOURS = {
  white: [0.6, 0.6, 0.575], bright: [0.63, 0.63, 0.61], cream: [0.58, 0.53, 0.4], ivory: [0.58, 0.56, 0.49],
  beige: [0.5, 0.45, 0.36], sand: [0.45, 0.4, 0.31], grey: [0.4, 0.4, 0.39], pale: [0.53, 0.53, 0.5],
  ochre: [0.55, 0.44, 0.24], larch: [0.27, 0.13, 0.06], planks: [0.2, 0.105, 0.055]
};
const C = COLOURS;
// The shutters' kinds (the walls' material draws them beside every window): none, grey-green, white, brown
export const SHUTTERS = { none: 0, grey: 1, white: 2, brown: 3 };
const DARK = [0.1, 0.06, 0.035], LIGHT = [0.58, 0.58, 0.56], GREYC = [0.25, 0.25, 0.25];

// --- Frames of the pitched roofs -----------------------------------------------------------------------------------------
// The cream villa (w122816778): its north-east wall from its north corner to its east corner (the surveyed wall, 1.5 m
// inside OpenStreetMap's, whose line is the stair tower's front), c into the house (south-west)
const VF = frame([-939.2, 652.9], [-930.0, 665.9]);
// The white block's stair bay on its west end (w123384794): along its long side
const SB = { c: [-987.13, 617.33], u: [0.253, -0.968] };
// w127671912's corner tower: along its long side
const TW = { c: [-783.33, 248.43], u: [0.779, 0.627] };

/**
 * Each house: `id` (OpenStreetMap), `name`, `exclude` (swissBUILDINGS3D's batches' centres, r 3), `floor` (its storeys'
 * grid: the ground floor's foot), `base` (how far down its walls reach), `colour` (its render), `bands` ([yTop, colour]:
 * a colour under yTop), `shutters`, `bay` (its bays' spacing as a share of BAY), `plinth` (the grey render along its
 * foot, m over the ground), `timber` ({ from, colour }: planks over `from`), `parts` ({ ring, top } flat-roofed;
 * { ring, roofs: [i] } under the house's pitched roofs; { ring: null, setback, top } a top floor set back from part 0),
 * `ground` (the player's walls' outlines, the parts' union), `roofs` ({ a, b: the ridge's ends at the verges, y: the ridge, eaves, cL, cR: how far the eaves lie left and right of
 * a→b, hip: [h0, h1] or 'pyramid', skin }), `cones` ({ c, r, y0, y1 }: a turret's cone), `cornice` (an eaves slab round
 * the flat roofs: { out, thick, colour }), `balconies` ({ on: [a, b] a wall's segment, s0, s1, floors, depth, rail }).
 */
export const HOUSES = [
  {
    // The white block with the turret at the street's south-west end (batch 11 of 11/1742/1004): the east block under a flat
    // roof at 11.4 round the turret's north half, the west block (14.2) and the rounded middle (14.8) between them, the
    // round turret on the street corner (its cone from 12.1 to 13.7), a stair bay with a pyramid roof (16.3) on the west
    // end. Photographs from the street south-west of it, 2014, 2015 and 2026 (466692887945605, 807604980185104,
    // 1598327112087659): white render, rounded balconies with white solid parapets round the street sides, the turret
    // with its grey cone; 272199167943802 (from the east, 2015) shows only the trees before it. The balconies here are
    // straight (their curves guessed away), its north side and the stair bay are guessed.
    id: 'w123384794', name: 'the white block with the turret',
    exclude: [{ x: -968.9, z: 614.0, r: 3 }],
    floor: -2.4, base: -3.0, colour: C.bright, shutters: SHUTTERS.none, bay: 0.95, plinth: 0.35,
    parts: [
      {
        ring: [[-963.9, 613.9], [-964.6, 613.6], [-963.6, 610.1], [-964.6, 609.8], [-963.4, 605.5], [-959.9, 606.4], [-958.9, 602.6], [-950.5, 604.9],
          [-950.7, 606.1], [-951.5, 605.9], [-952.4, 609.4], [-949.7, 610.2], [-950.9, 614.7], [-952.0, 614.4], [-953.4, 619.5], [-953.9, 620.5],
          [-954.6, 620.9], [-955.8, 620.9], [-956.7, 620.6], [-957.7, 620.3], [-958.7, 620.4], [-959.5, 621.0], [-960.0, 621.9], [-959.9, 622.9],
          [-960.5, 624.1], [-961.3, 624.8], [-962.1, 624.9], [-967.4, 623.5], [-967.6, 624.2], [-968.3, 624.4], [-969.1, 624.8], [-973.5, 623.6],
          [-973.4, 623.3], [-972.7, 623.5], [-972.0, 621.1], [-967.8, 622.2], [-966.8, 621.8], [-965.5, 621.7], [-964.0, 621.1], [-962.9, 620.3],
          [-962.0, 619.0], [-961.7, 617.6], [-962.0, 615.9], [-963.0, 614.6]],
        top: 11.37
      },
      {
        ring: [[-965.6, 613.3], [-965.8, 614.0], [-971.0, 612.5], [-973.3, 620.7], [-972.0, 621.1], [-972.7, 623.5], [-985.8, 619.9], [-984.6, 615.8],
          [-987.0, 615.1], [-984.0, 604.5], [-963.6, 610.1], [-964.6, 613.6]],
        top: 14.17
      },
      {
        ring: [[-961.7, 617.6], [-962.0, 615.9], [-963.0, 614.6], [-963.9, 613.9], [-965.6, 613.3], [-965.8, 614.0], [-971.0, 612.5], [-973.3, 620.7],
          [-967.8, 622.2], [-966.8, 621.8], [-965.5, 621.7], [-964.0, 621.1], [-962.9, 620.3], [-962.0, 619.0]],
        top: 14.77
      },
      // the turret on the street corner
      { ring: circleRing([-957.95, 622.35], 2.0, 12), top: 12.1 },
      // the stair bay on the west end
      { ring: [[-985.8, 619.9], [-989.6, 618.9], [-988.5, 614.7], [-984.6, 615.8]], roofs: [0] }
    ],
    roofs: [
      { a: [SB.c[0] - SB.u[0] * 2.47, SB.c[1] - SB.u[1] * 2.47], b: [SB.c[0] + SB.u[0] * 2.47, SB.c[1] + SB.u[1] * 2.47], y: 16.3, eaves: 14.35, cL: 2.27, cR: 2.27, hip: 'pyramid', skin: 'roof' }
    ],
    cones: [{ c: [-957.95, 622.35], r: 2.35, y0: 11.95, y1: 13.7 }],
    cornice: { out: 0.45, thick: 0.3, colour: LIGHT, parts: [0, 1, 2] },
    balconies: [
      { on: [[-972.7, 623.5], [-985.8, 619.9]], s0: 0.8, s1: 12.6, floors: [3.4, 6.3, 9.2], depth: 1.5, rail: 'white' },
      { on: [[-962.1, 624.9], [-967.4, 623.5]], s0: 0.3, s1: 5.2, floors: [3.4, 6.3], depth: 1.3, rail: 'white' },
      { on: [[-949.7, 610.2], [-950.9, 614.7]], s0: 0.2, s1: 4.4, floors: [3.4, 6.3], depth: 1.3, rail: 'white' }
    ]
  },
  {
    // The cream villa south of the street's end (batch 3 of 11/1742/1003). The survey has only its stair tower on
    // the north-east front (walls from the ground to 10.9, a pyramid cap to 13.0, its foot meeting the house's eaves at
    // 9.0); the house itself is missing from the tiles (drawn by nothing so far): its walls here are OpenStreetMap's
    // outline with the north-east wall where the survey's tower meets it, its saddle roof (ridge 15.8, eaves 9.0 on
    // the walls) running north-west to south-east, the gable towards the Albertistrasse. Photographs 2015 from the
    // north-east (489746122080129, 157454652962769): cream render, dark brown shutters, the steep roof, a small
    // pointed roof on the front by the gable (the tower). The heights of the roof, the south-west side and the back are
    // guessed; 244655707566546 and 236162518522659 (from the west, 2021) show the white block with the turret instead.
    id: 'w122816778', name: 'the cream villa',
    exclude: [{ x: -937.4, z: 655.6, r: 3 }],
    floor: -6.0, base: -7.4, colour: C.cream, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.45,
    parts: [
      { ring: [[-939.2, 652.9], [-930.0, 665.9], [-941.8, 674.3], [-946.9, 667.1], [-948.3, 668.1], [-952.5, 662.2]], roofs: [0] },
      { ring: [[-938.5, 653.9], [-937.6, 653.0], [-936.3, 653.4], [-935.2, 654.7], [-935.0, 656.3], [-936.0, 657.2]], roofs: [1] }
    ],
    roofs: [
      { a: at(VF, -0.7, 8.1), b: at(VF, 16.65, 8.1), y: 15.8, eaves: 8.33, cL: 8.9, cR: 8.9, skin: 'roof' },
      { a: [-937.82, 652.8], b: [-934.96, 656.84], y: 13.0, eaves: 10.6, cL: 1.47, cR: 1.47, hip: 'pyramid', skin: 'roof' }
    ]
  },
  {
    // The block north of the white block (batch 12 of 11/1742/1004): one flat roof at 15.1 over five storeys. No
    // photograph: white render, brown shutters, timber balconies towards the street, guessed.
    id: 'w97292456', name: 'the block west of the Club Hotel',
    exclude: [{ x: -944.8, z: 574.2, r: 3 }],
    floor: 0.34, base: -0.4, colour: C.white, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-948.3, 586.8], [-948.9, 587.6], [-957.2, 581.8], [-942.6, 560.9], [-932.4, 568.0], [-934.6, 575.1], [-936.8, 575.1], [-940.0, 584.8], [-944.4, 584.5], [-945.9, 586.9]], top: 15.06 }],
    cornice: { out: 0.5, thick: 0.3, colour: DARK },
    balconies: [
      { on: [[-932.4, 568.0], [-934.6, 575.1]], s0: 0.5, s1: 6.9, floors: [3.24, 6.14, 9.04], depth: 1.3, rail: 'timber' },
      { on: [[-942.6, 560.9], [-932.4, 568.0]], s0: 2.0, s1: 10.4, floors: [6.14, 9.04], depth: 1.3, rail: 'timber' }
    ]
  },
  {
    // Haus Freia (batch 0 of 11/1742/1004): the square main block to 17.0 with a top floor set back to 20.9, the wings
    // on its west, lower as the ground rises (16.2, 15.2, 13.5), and the long low wing up the slope (10.4). No photograph: cream render,
    // brown shutters, a dark eaves slab, guessed.
    id: 'w123384807', name: 'Haus Freia',
    exclude: [{ x: -935.3, z: 547.1, r: 3 }],
    // (the player's walls on the parts' union: their overlapping rings left walls inside the house)
    ground: [[[-920.1, 546.1], [-930.5, 541.0], [-941.1, 536.2], [-944.2, 535.3], [-950.6, 545.6], [-939.4, 552.9], [-937.0, 554.0], [-926.0, 559.0]]],
    floor: 1.46, base: 0.8, colour: C.ivory, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-931.1, 541.1], [-933.7, 544.2], [-936.1, 549.4], [-937.0, 554.0], [-926.0, 559.0], [-920.1, 546.1]], top: 17.03 },
      { ring: null, setback: 1.0, top: 20.9 },
      { ring: [[-931.1, 541.1], [-932.7, 544.6], [-933.7, 544.2], [-935.4, 547.9], [-935.2, 546.4], [-939.3, 544.5], [-938.5, 542.7], [-943.2, 540.6], [-941.1, 536.2], [-930.5, 541.0]], top: 16.21 },
      { ring: [[-938.5, 542.7], [-942.8, 540.8], [-944.0, 543.4], [-939.1, 545.6]], top: 13.54 },
      { ring: [[-935.6, 548.4], [-937.0, 547.7], [-939.4, 552.9], [-937.0, 554.0]], top: 15.2 },
      { ring: [[-935.2, 546.4], [-938.7, 544.8], [-939.1, 545.6], [-944.0, 543.4], [-942.8, 540.8], [-943.2, 540.6], [-941.1, 536.2], [-944.2, 535.3], [-950.6, 545.6], [-939.2, 552.6], [-937.0, 547.7]], top: 10.35 }
    ],
    cornice: { out: 0.45, thick: 0.3, colour: DARK }
  },
  {
    // The block west of the Club Hotel's tower (batch 13 of 11/1742/1004): one flat roof at 20.1 over six storeys (the
    // survey's roof cut into slivers, its outline joined here). No photograph: white render, grey shutters, glass
    // balconies on the south and the street, guessed.
    id: 'w97292398', name: 'the block west of the Club Tower',
    exclude: [{ x: -922.1, z: 519.6, r: 3 }],
    floor: 2.5, base: 1.9, colour: C.white, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [{
      ring: [[-911.2, 510.1], [-923.4, 505.9], [-929.4, 523.1], [-931.1, 522.5], [-933.1, 528.2], [-930.4, 529.2], [-930.9, 530.5], [-922.7, 533.4],
        [-921.2, 529.2], [-920.6, 529.4], [-917.6, 520.8], [-914.0, 520.3], [-912.1, 515.0], [-912.8, 514.7]],
      top: 20.12
    }],
    cornice: { out: 0.4, thick: 0.35, colour: GREYC },
    balconies: [
      { on: [[-911.2, 510.1], [-923.4, 505.9]], s0: 1.2, s1: 11.6, floors: [5.4, 8.3, 11.2, 14.1], depth: 1.5, rail: 'glass' },
      { on: [[-920.6, 529.4], [-917.6, 520.8]], s0: 0.8, s1: 8.3, floors: [5.4, 8.3, 11.2, 14.1], depth: 1.4, rail: 'glass' }
    ]
  },
  {
    // The block west of the street on the hill (batch 1 of 11/1743/1005): the north wing under a flat roof at 20.4 and
    // the south wing (17.6), standing in the slope (the ground from 4.2 on the street to 8.7 behind). No photograph:
    // beige render, brown shutters, timber balconies towards the street, guessed.
    id: 'w97292378', name: 'the block on the hill',
    exclude: [{ x: -898.2, z: 454.8, r: 3 }],
    floor: 4.16, base: 3.5, colour: C.beige, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [
      {
        ring: [[-889.6, 457.4], [-890.3, 457.1], [-890.7, 458.0], [-891.9, 458.0], [-894.3, 456.9], [-896.0, 460.5], [-902.6, 457.4],
          [-902.3, 456.7], [-906.7, 454.5], [-903.8, 448.4], [-904.7, 448.0], [-915.5, 470.5], [-906.7, 474.8], [-905.5, 472.3], [-901.1, 474.4],
          [-899.8, 471.8], [-897.6, 472.8], [-894.2, 465.7], [-893.5, 466.0]],
        top: 17.58
      },
      {
        ring: [[-891.9, 458.0], [-894.3, 456.9], [-896.0, 460.5], [-902.6, 457.4], [-902.3, 456.7], [-907.6, 454.1], [-903.6, 445.8], [-902.6, 446.3],
          [-897.5, 435.6], [-896.8, 436.0], [-896.4, 435.2], [-880.9, 442.6], [-884.8, 450.8], [-885.2, 450.6], [-889.1, 458.7], [-890.7, 458.0]],
        top: 20.44
      }
    ],
    cornice: { out: 0.5, thick: 0.3, colour: DARK },
    balconies: [
      { on: [[-880.9, 442.6], [-884.8, 450.8]], s0: 0.6, s1: 8.5, floors: [7.06, 9.96, 12.86, 15.76], depth: 1.4, rail: 'timber' },
      { on: [[-896.4, 435.2], [-880.9, 442.6]], s0: 2.0, s1: 15.2, floors: [9.96, 12.86, 15.76], depth: 1.4, rail: 'timber' }
    ]
  },
  {
    // The long house east of the street north of the Club Hotel (batch 21 of 11/1743/1005): three flat roofs stepping
    // down the slope eastwards (16.3 on the street, 14.7, 13.1). No photograph: white render, grey shutters, timber
    // balconies on the south side, guessed.
    id: 'w97292308', name: 'the long house east of the street',
    exclude: [{ x: -874.6, z: 502.4, r: 3 }],
    floor: -2.64, base: -3.3, colour: C.white, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-866.6, 500.6], [-867.4, 499.2], [-855.4, 503.7], [-859.4, 514.2], [-871.3, 509.7], [-871.0, 508.8], [-869.9, 509.2]], top: 13.1 },
      { ring: [[-882.1, 504.6], [-882.4, 505.5], [-870.2, 510.1], [-869.9, 509.2], [-866.6, 500.6], [-866.3, 499.6], [-878.5, 495.0], [-878.8, 495.9], [-877.6, 496.4], [-880.8, 505.1]], top: 14.74 },
      { ring: [[-877.2, 495.5], [-889.8, 490.7], [-893.8, 501.2], [-881.2, 506.0], [-880.8, 505.1], [-877.6, 496.4]], top: 16.33 }
    ],
    cornice: { out: 0.45, thick: 0.3, colour: DARK },
    balconies: [
      { on: [[-882.4, 505.5], [-870.2, 510.1]], s0: 0.8, s1: 12.2, floors: [3.16, 6.06, 8.96], depth: 1.4, rail: 'timber' },
      { on: [[-871.3, 509.7], [-859.4, 514.2]], s0: 0.8, s1: 11.8, floors: [3.16, 6.06, 8.96], depth: 1.4, rail: 'timber' }
    ]
  },
  {
    // The house north of it (batches 2 and 3 of 11/1743/1005): the house under a flat roof at 13.4 and the low annex on
    // its east (5.7, not in OpenStreetMap). No photograph: cream render, brown shutters, guessed.
    id: 'w97292323', name: 'the cream house with the annex',
    exclude: [{ x: -868.3, z: 484.5, r: 3 }, { x: -861.6, z: 487.1, r: 3 }],
    floor: -0.81, base: -1.4, colour: C.cream, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-865.2, 477.5], [-867.8, 481.3], [-873.2, 477.6], [-877.4, 483.8], [-866.0, 491.6], [-859.2, 481.6]], top: 13.36 },
      { ring: [[-862.7, 492.4], [-865.9, 490.5], [-860.0, 481.9], [-857.4, 483.4]], top: 5.65, colour: C.pale }
    ],
    cornice: { out: 0.4, thick: 0.28, colour: DARK }
  },
  {
    // The tall block north of it (batch 17 of 11/1743/1005): seven storeys to a flat roof at 22.5, the low wings on its
    // north (9.7, 10.0) and east (11.3). No photograph: pale render, grey shutters, glass balconies on the south,
    // guessed.
    id: 'w97292472', name: 'the tall block',
    exclude: [{ x: -864.8, z: 459.8, r: 3 }],
    ground: [[[-873.2, 449.5], [-881.0, 466.0], [-866.6, 472.9], [-862.3, 464.0], [-852.2, 469.6], [-848.3, 462.6], [-853.2, 459.8], [-857.56, 457.8],
      [-855.9, 455.0], [-866.2, 449.0], [-869.9, 446.9], [-871.76, 450.18]]],
    floor: -0.15, base: -0.9, colour: C.pale, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-873.2, 449.5], [-881.0, 466.0], [-866.6, 472.9], [-862.0, 463.4], [-858.7, 456.4], [-871.3, 450.4]], top: 22.52 },
      { ring: [[-865.2, 450.2], [-866.5, 449.4], [-866.2, 449.0], [-855.9, 455.0], [-857.8, 458.2], [-859.1, 457.1], [-858.7, 456.4], [-866.6, 452.6]], top: 9.65 },
      { ring: [[-865.2, 450.2], [-866.6, 452.6], [-871.3, 450.4], [-872.0, 450.6], [-869.9, 446.9], [-864.9, 449.8]], top: 10.0 },
      { ring: [[-862.5, 463.1], [-862.7, 463.6], [-852.2, 469.6], [-848.3, 462.6], [-853.2, 459.8], [-858.0, 457.6], [-859.1, 457.1], [-862.0, 463.4]], top: 11.25 }
    ],
    cornice: { out: 0.4, thick: 0.3, colour: GREYC },
    balconies: [{ on: [[-881.0, 466.0], [-866.6, 472.9]], s0: 1.0, s1: 15.0, floors: [5.65, 8.55, 11.45, 14.35, 17.25], depth: 1.5, rail: 'glass' }]
  },
  {
    // The block with the stepped front south of the Evangelische Kirchgemeinde (batches 10 and 6 of 11/1743/1006): six storeys to
    // a flat roof at 25.9, the front on the street stepping back flat by flat, and the low garage block in the slope
    // west of it (13.0, not in OpenStreetMap). No photograph: sand render, brown shutters, timber balconies on the south,
    // guessed.
    id: 'w117012149', name: 'the block with the stepped front',
    exclude: [{ x: -809.0, z: 301.5, r: 3 }, { x: -824.3, z: 320.1, r: 3 }],
    floor: 8.51, base: 6.7, colour: C.sand, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [
      {
        ring: [[-796.4, 293.2], [-806.0, 286.3], [-808.9, 290.5], [-809.8, 289.9], [-812.0, 293.4], [-811.2, 294.1], [-821.6, 309.5], [-820.7, 310.1],
          [-821.1, 310.8], [-809.0, 316.6], [-808.4, 315.6], [-807.7, 316.0], [-804.7, 309.8], [-804.1, 310.2], [-802.1, 306.3], [-803.1, 305.9],
          [-800.3, 301.0], [-799.6, 301.4], [-797.3, 296.8], [-798.1, 296.1]],
        top: 25.94
      },
      {
        ring: [[-818.6, 309.6], [-819.4, 309.1], [-816.5, 304.7], [-817.3, 304.1], [-835.9, 332.2], [-832.3, 334.6], [-831.7, 333.6], [-828.0, 336.1],
          [-824.0, 330.1], [-819.8, 332.9], [-813.0, 322.5], [-817.0, 319.8], [-812.7, 313.2], [-819.0, 310.2]],
        top: 12.99, colour: C.pale
      }
    ],
    cornice: { out: 0.45, thick: 0.3, colour: DARK },
    balconies: [{ on: [[-821.1, 310.8], [-809.0, 316.6]], s0: 0.8, s1: 12.6, floors: [14.31, 17.21, 20.11], depth: 1.4, rail: 'timber' }]
  },
  {
    // The block east of the street opposite it (batch 0 of 11/1743/1006): the main block to 25.1, its wing round
    // its west and south (22.3) and the low L of the ground floors round its south (11.1). No photograph: white render,
    // grey shutters, guessed.
    id: 'w123385325', name: 'the block below the bend',
    exclude: [{ x: -779.7, z: 314.8, r: 3 }],
    floor: 4.97, base: 4.3, colour: C.white, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [
      {
        ring: [[-772.5, 321.1], [-774.5, 323.5], [-778.3, 324.2], [-783.7, 320.1], [-783.8, 318.8], [-782.9, 317.6], [-785.1, 315.8], [-785.9, 316.7],
          [-789.5, 317.2], [-793.8, 323.1], [-790.1, 325.8], [-788.9, 326.3], [-787.5, 326.2], [-786.2, 325.7], [-781.5, 329.1], [-780.8, 328.2],
          [-775.9, 331.8], [-765.2, 317.2], [-769.1, 314.4], [-768.8, 315.9], [-769.1, 316.4], [-768.7, 318.4], [-770.4, 320.6]],
        top: 11.12
      },
      {
        ring: [[-786.7, 308.0], [-788.0, 307.1], [-786.5, 305.1], [-788.0, 304.0], [-793.3, 311.1], [-792.9, 315.2], [-790.0, 317.3], [-785.9, 316.7],
          [-785.1, 315.8], [-782.9, 317.6], [-783.8, 318.8], [-783.7, 320.1], [-778.3, 324.2], [-774.5, 323.5], [-770.4, 320.6],
          [-768.7, 318.4], [-769.1, 316.4], [-773.1, 321.9], [-776.0, 322.4], [-779.1, 320.1], [-779.0, 317.1], [-782.3, 314.6], [-783.2, 315.7], [-789.2, 311.3]],
        top: 22.34
      },
      {
        ring: [[-771.7, 309.8], [-778.2, 305.0], [-776.7, 303.0], [-781.0, 299.9], [-781.7, 300.9], [-785.7, 297.9], [-789.4, 303.0], [-786.5, 305.1],
          [-788.0, 307.1], [-786.7, 308.0], [-789.2, 311.3], [-783.1, 315.7], [-782.3, 314.6], [-779.0, 317.1], [-779.1, 320.1], [-776.0, 322.4],
          [-773.1, 321.9], [-768.8, 315.9], [-769.4, 312.8], [-772.3, 310.6]],
        top: 25.1
      }
    ],
    cornice: { out: 0.4, thick: 0.3, colour: GREYC }
  },
  {
    // The house at the bend (batch 8 of 11/1743/1007): three storeys to a flat roof at 23.2. No photograph: cream
    // render, brown shutters, timber balconies on the street, guessed.
    id: 'w1529977470', name: 'the house at the bend',
    exclude: [{ x: -794.8, z: 241.3, r: 3 }],
    floor: 13.24, base: 12.5, colour: C.cream, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-785.5, 238.7], [-790.4, 245.0], [-791.2, 244.2], [-796.0, 249.9], [-796.5, 250.5], [-798.9, 248.7], [-800.2, 250.3], [-804.1, 248.7], [-803.3, 244.1], [-793.9, 232.1]], top: 23.24 }],
    cornice: { out: 0.5, thick: 0.28, colour: DARK },
    balconies: [{ on: [[-785.5, 238.7], [-790.4, 245.0]], s0: 0.6, s1: 7.4, floors: [16.14, 19.04], depth: 1.3, rail: 'timber' }]
  },
  {
    // The block with the corner tower at the bend (batches 6 and 11 of 11/1743/1007): five storeys to a flat roof at
    // 26.9, the square tower on its street corner rising to 28.5 under a pyramid roof (the survey's lantern on it, to
    // 32.2, folded into the pyramid). No photograph: white render, grey shutters, guessed.
    id: 'w127671912', name: 'the block with the corner tower',
    exclude: [{ x: -787.9, z: 253.5, r: 3 }, { x: -783.7, z: 248.8, r: 3 }],
    ground: [[[-791.4, 242.8], [-799.1, 252.0], [-795.2, 255.3], [-796.6, 257.0], [-787.9, 264.3], [-786.4, 262.5], [-784.4, 264.2], [-776.7, 255.1],
      [-781.9, 250.8], [-780.1, 248.6], [-784.2, 245.3], [-785.9, 247.4]]],
    floor: 10.95, base: 10.3, colour: C.white, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [
      {
        ring: [[-785.9, 247.4], [-791.4, 242.8], [-799.1, 252.0], [-795.2, 255.3], [-796.6, 257.0], [-787.9, 264.3], [-786.4, 262.5], [-784.4, 264.2],
          [-776.7, 255.1], [-781.9, 250.8], [-783.2, 252.4], [-787.3, 249.2], [-786.5, 248.2]],
        top: 26.87
      },
      { ring: [[-786.5, 248.2], [-784.2, 245.3], [-780.1, 248.6], [-782.5, 251.6]], roofs: [0], colour: C.ivory }
    ],
    roofs: [
      { a: [TW.c[0] - TW.u[0] * 3.6, TW.c[1] - TW.u[1] * 3.6], b: [TW.c[0] + TW.u[0] * 3.6, TW.c[1] + TW.u[1] * 3.6], y: 32.2, eaves: 28.3, cL: 3.2, cR: 3.2, hip: 'pyramid', skin: 'roof' }
    ],
    cornice: { out: 0.4, thick: 0.3, colour: GREYC, parts: [0] }
  },
  {
    // The block north of the bend (batches 0 and 30 of 11/1743/1008, the same building twice): five storeys to a flat
    // roof at 29.2, a lower band along its east and south (26.6). The survey's slab at the ground round it (14.7) is
    // left out. No photograph: ivory render, brown shutters, glass balconies on the street, guessed.
    id: 'w123385338', name: 'the block north of the bend',
    exclude: [{ x: -789.0, z: 186.6, r: 3 }],
    // (the core and the band in one outline: the band, 1.3–1.9 m wide, between two walls let the player in)
    ground: [[[-797.0, 174.2], [-800.9, 189.4], [-801.2, 190.5], [-785.0, 199.3], [-784.0, 199.4], [-783.1, 199.0], [-782.3, 198.0], [-779.7, 178.7], [-781.0, 178.3]]],
    floor: 14.71, base: 14.1, colour: C.ivory, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-797.0, 174.2], [-800.9, 189.4], [-787.8, 195.3], [-786.5, 195.3], [-783.7, 193.8], [-782.9, 192.9], [-781.0, 178.3]], top: 29.19 },
      {
        ring: [[-800.9, 189.4], [-801.2, 190.5], [-785.0, 199.3], [-784.0, 199.4], [-783.1, 199.0], [-782.3, 198.0], [-779.7, 178.7], [-781.0, 178.3],
          [-782.9, 192.9], [-783.7, 193.8], [-786.5, 195.3], [-787.8, 195.3]],
        top: 26.59
      }
    ],
    cornice: { out: 0.4, thick: 0.3, colour: DARK },
    balconies: [{ on: [[-779.7, 178.7], [-782.3, 198.0]], s0: 1.5, s1: 17.0, floors: [20.51, 23.41], depth: 1.4, rail: 'glass' }]
  },
  {
    // The tall block beside the Hotel National (batch 28 of 11/1743/1008): six storeys to a flat roof at 32.8. No
    // photograph: white render, grey shutters, glass balconies towards the street, guessed.
    id: 'w1529974852', name: 'the tall block beside the National',
    exclude: [{ x: -773.5, z: 149.0, r: 3 }],
    floor: 13.7, base: 13.1, colour: C.white, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [{
      ring: [[-762.3, 144.1], [-766.1, 157.4], [-767.4, 157.0], [-768.0, 159.1], [-784.8, 154.2], [-784.2, 153.2], [-781.5, 143.8], [-782.8, 143.4],
        [-782.0, 139.0], [-773.0, 141.6], [-772.8, 141.0]],
      top: 32.78
    }],
    cornice: { out: 0.4, thick: 0.35, colour: GREYC },
    balconies: [{ on: [[-762.3, 144.1], [-766.1, 157.4]], s0: 1.5, s1: 12.3, floors: [16.6, 19.5, 22.4, 25.3, 28.2], depth: 1.5, rail: 'glass' }]
  },
  {
    // The big block on the slope above the street (batch 25 of 11/1743/1008): seven storeys on the street side to a
    // flat roof at 36.2, the ground rising 8 m to its back. No photograph: pale render, grey shutters, glass balconies on
    // the street, guessed.
    id: 'w965238323', name: 'the big block on the slope',
    exclude: [{ x: -785.2, z: 104.2, r: 3 }],
    floor: 15.82, base: 15.2, colour: C.pale, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-769.2, 115.9], [-783.5, 114.9], [-783.4, 113.8], [-802.8, 112.4], [-801.4, 92.6], [-767.8, 94.9]], top: 36.23 }],
    cornice: { out: 0.5, thick: 0.35, colour: GREYC },
    balconies: [{ on: [[-767.8, 94.9], [-769.2, 115.9]], s0: 1.5, s1: 19.5, floors: [18.72, 21.62, 24.52, 27.42, 30.32], depth: 1.6, rail: 'glass' }]
  },
  {
    // The block by the Kurpark (batch 8 of 11/1743/1009): a flat roof at 29.9 over four storeys on the street. No
    // photograph: cream render, brown shutters, timber balconies towards the street, guessed.
    id: 'w127671945', name: 'the block by the Kurpark',
    exclude: [{ x: -771.3, z: 72.5, r: 3 }],
    floor: 16.02, base: 15.4, colour: C.cream, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-759.7, 62.2], [-761.3, 84.5], [-783.0, 82.9], [-781.4, 60.7]], top: 29.85 }],
    cornice: { out: 0.55, thick: 0.3, colour: DARK },
    balconies: [{ on: [[-759.7, 62.2], [-761.3, 84.5]], s0: 1.5, s1: 20.8, floors: [18.92, 21.82, 24.72], depth: 1.4, rail: 'timber' }]
  },
  {
    // The low house north of it by the Kurpark (batch 14 of 11/1743/1009): two storeys to a flat roof at 22.2. No
    // photograph: white render, brown shutters, guessed.
    id: 'w1529974854', name: 'the low house by the Kurpark',
    exclude: [{ x: -768.1, z: 54.3, r: 3 }],
    floor: 16.36, base: 15.7, colour: C.white, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-760.8, 51.2], [-775.2, 50.6], [-775.5, 57.4], [-761.1, 58.0]], top: 22.21 }],
    cornice: { out: 0.4, thick: 0.25, colour: DARK }
  }
];

// The rings cleaned of the survey's slivers; Haus Freia's top floor set back from its main block
for (const h of HOUSES) for (const p of h.parts) if (p.ring) p.ring = dedupe(p.ring);
for (const h of HOUSES) for (const p of h.parts) if (p.setback) p.ring = insetRing(h.parts[0].ring, p.setback);

// --- Rings ----------------------------------------------------------------------------------------------------------------
/** A ring moved `d` m inwards (each edge parallel, the corners where they meet) */
export function insetRing(ring, d) {
  const R = outwardRing(ring), n = R.length, out = [];
  const lines = R.map((a, i) => { const F = wallFrame(a, R[(i + 1) % n]); return { p: onWall(F, 0, -d), u: F.u }; });
  for (let i = 0; i < n; i++) {
    const A = lines[(i + n - 1) % n], B = lines[i];
    const den = A.u[0] * B.u[1] - A.u[1] * B.u[0];
    if (Math.abs(den) < 1e-6) { out.push(B.p); continue; }
    const t = ((B.p[0] - A.p[0]) * B.u[1] - (B.p[1] - A.p[1]) * B.u[0]) / den;
    out.push(R2([A.p[0] + A.u[0] * t, A.p[1] + A.u[1] * t]));
  }
  return out;
}

/** The roof's frame (a→b), its length */
export const roofFrame = (R) => frame(R.a, R.b);
/** The ridge's ends inside the eaves' outline: [h0, h1] */
export function hips(R) {
  const L = roofFrame(R).L;
  return R.hip === 'pyramid' ? [L / 2, L / 2] : R.hip || [0, 0];
}
/** A roof's height (its upper face) over a world point, or null outside its outline */
export function roofY(R, x, z) {
  const F = roofFrame(R), [t, c] = local(F, x, z);
  if (t < -1e-6 || t > F.L + 1e-6 || c < -R.cL - 1e-6 || c > R.cR + 1e-6) return null;
  const drop = R.y - R.eaves;
  let y = R.y - drop * (c >= 0 ? c / R.cR : -c / R.cL);
  const [h0, h1] = hips(R);
  if (h0 > 0 && t < h0) y = Math.min(y, R.y - (drop * (h0 - t)) / h0);
  if (h1 > 0 && t > F.L - h1) y = Math.min(y, R.y - (drop * (t - (F.L - h1))) / h1);
  return y;
}
/** A roof's outline (world x, z) */
export function roofRing(R) {
  const F = roofFrame(R);
  return [at(F, 0, -R.cL), at(F, F.L, -R.cL), at(F, F.L, R.cR), at(F, 0, R.cR)];
}

/** How high a part stands at a world point (the walls' top there): its flat roof, or its roofs' highest a step under them */
export function partTop(house, part, x, z) {
  if (part.top !== undefined) return part.top;
  let y = -Infinity;
  for (const i of part.roofs) { const r = roofY(house.roofs[i], x, z); if (r !== null) y = Math.max(y, r - 0.06); }
  return Number.isFinite(y) ? y : Math.min(...part.roofs.map((i) => house.roofs[i].eaves));
}
/**
 * The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the house's `ground` (its parts'
 * union where their rings overlap or touch), else every part but a set-back top
 */
export const groundOutlines = (house) => house.ground || house.parts.filter((p) => !p.setback).map((p) => p.ring);
/** Is a point inside one of the row's houses? */
export const insideRow = (x, z) => HOUSES.some((h) => groundOutlines(h).some((r) => pointInRing(r, x, z)));

/**
 * A wall's frame from a segment (a, b) on a house's outline, turned so that it faces out of the house (its n leaving
 * the parts that reach over `y`: a balcony over a low annex before its wall)
 */
export function wallOut(house, a, b, y = -Infinity) {
  const F = wallFrame(a, b), [x, z] = onWall(F, F.len / 2, 0.4);
  return house.parts.some((p) => p.ring && (p.top === undefined || p.top > y) && pointInRing(p.ring, x, z)) ? wallFrame(b, a) : F;
}

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // the street's south-west end by the Albertistrasse, looking west: the white block with the turret on the right, the
  // cream villa on the left
  end: [-926, -1.4, 632, -955, 4.0, 640],
  // by the tall block looking south-west along the street: the tall block and the cream house on the left, the block on
  // the hill on the right, the long house beyond
  middle: [-873, 6.4, 437, -900, 7.0, 500],
  // the bend looking north along the street: the block with the corner tower on the left, the blocks north of the bend
  bend: [-776, 12.3, 272, -772, 20.0, 215]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
