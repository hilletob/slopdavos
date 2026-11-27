// The houses along the Promenade between the Bristol and the Seehof, towards Davos Dorf (js/promenade-nord.js): five
// houses by hand in one module, each its surveyed volumes, its roofs and its look. Pure data and frame maths, shared by
// the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1751/1017, 1018 and 1019): each house's batches are left out of the streamed
// tiles and rebuilt here whole (none of them holds a neighbour: their walls were matched to the OpenStreetMap
// footprints round them; the Pflanzenbrocki's two batches lie only 23 and 45 % inside OSM's outline because OSM cuts
// the house differently, not because they hold another house). The outlines below are the survey's walls at the
// ground (slivers of its rings cleaned), heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js; x east,
// z south). The Promenade runs here from the Bristol's corner (502/−872) north-north-east to the Freitag's (553/−1071);
// the ground falls from it to the east (4.3 on the street at the Excellent, 1–2 behind the houses east of it) and
// rises west of it (up to 7.5 behind the Pflanzenbrocki). The survey has every roof flat; Mapillary's 2013 and 2015
// photographs (CC BY-SA) show shallow hipped roofs on deep dark eaves over the Kuoni's house and the Hotel Dischma:
// hips there, their eaves a little under the surveyed tops. Each house's note says which photographs show it, which
// showed a neighbour, and what is guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const STOREY = 2.9;
// a window (m over its storey's foot), its half width; the bays' spacing along a wall
export const WIN = { lo: 0.9, hi: 2.2, half: 0.58 };
export const BAY = 2.6;

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

/**
 * A hipped roof over a ring: its ridge along `dir` ([x, z], need not be unit) through the ring's middle, the eaves
 * `over` m out of the walls all round at `eaves`, rising `slope` m per metre to the ridge. Returns
 * { a, b, y, eaves, cL, cR, hip } as roofY reads it.
 */
export function hipRoof(ring, dir, { eaves, slope, over = 0.9 }) {
  const F0 = frame([0, 0], dir);
  const ts = ring.map(([x, z]) => local(F0, x, z)[0]), cs = ring.map(([x, z]) => local(F0, x, z)[1]);
  const t0 = Math.min(...ts) - over, t1 = Math.max(...ts) + over, c0 = Math.min(...cs) - over, c1 = Math.max(...cs) + over;
  const cm = (c0 + c1) / 2, half = (c1 - c0) / 2, L = t1 - t0;
  const hip = Math.min(half, L / 2);
  return { a: R2(at(F0, t0, cm)), b: R2(at(F0, t1, cm)), y: eaves + slope * half, eaves, cL: half, cR: half, hip: [hip, hip] };
}

// --- Colours (linear) ----------------------------------------------------------------------------------------------------
export const COLOURS = {
  white: [0.6, 0.6, 0.58], salmon: [0.56, 0.36, 0.28], orange: [0.5, 0.14, 0.065], ochre: [0.46, 0.36, 0.17],
  grey: [0.42, 0.43, 0.43], larch: [0.3, 0.16, 0.07], brown: [0.12, 0.068, 0.036], dark: [0.06, 0.058, 0.055],
  cream: [0.62, 0.6, 0.55]
};
const C = COLOURS;

// --- The houses -----------------------------------------------------------------------------------------------------------
// (the outlines the hipped roofs are laid over)
const KUONI = [[523.9, -915.7], [537.9, -911.9], [542.9, -930.4], [542.5, -930.5], [545.2, -941.1], [531.7, -944.7]];
const DISCHMA_MAIN = [[540.2, -991.5], [555.5, -987.8], [558.1, -998.4], [556.4, -998.8], [558.2, -1005.9], [557.0, -1006.2], [558.2, -1010.8], [557.6, -1011.0], [545.7, -1013.9]];
const DISCHMA_WING = [[545.7, -1013.9], [557.6, -1011.0], [559.3, -1018.1], [559.8, -1020.0], [548.1, -1022.8]];

/**
 * Each house: `id` (OpenStreetMap), `name`, `exclude` (swissBUILDINGS3D's batches' centres, r 3), `floor` (its
 * storeys' grid: a storey's foot, on the street), `base` (how far down its walls reach), `colour` (its plaster),
 * `timber` (its walls clad in horizontal boards), `plinth` (the grey render along its foot, m over the ground),
 * `parts` ({ ring, top } flat-roofed, { ring, roofs: [i] } under the house's hipped roof; per part `colour`, `bands`
 * ([yTop, colour]: a colour under yTop), `closed` (no windows)), `roofs` (hipRoof's), `cornice` (an eaves slab round
 * flat roofs: { out, thick, colour, parts? }), `shops` ({ on: a wall's segment, left to right seen from outside, s0, s1
 * along it, top: the fascia's top, fascia: its height, piers, canopy: { depth, colour, posts }, signs: [{ key, s }]:
 * atlas keys centred at s on the fascia or the canopy, signAt}), `bays` ({ on, s0, s1, out, floors, colour }: a stack
 * of bay windows), `letters` ({ on, s0, s1, y0, y1, key, board }: lettering on a wall, on a timber board), `doors`
 * ({ on, s, w }), `shopIds` (the businesses whose signs it letters itself: js/shops-data.js' osm ids, left out of
 * js/shops.js).
 */
export const HOUSES = [
  {
    // The Hotel Excellent (batch 9: the block at 17.02 wrapping a core of a storey more, the low wing on its south side
    // at 7.69; batch 15: the core at 21.75, which reaches the ground at the recess on the block's north-west corner).
    // The photographs (all 2013–2015 from the Promenade north of it, looking south): 500840154270323 (from 512/−925)
    // its west front on the street left of the frame — salmon-pink plaster, a deep flat canopy over the restaurant's
    // ground floor on thin posts, storeys of plain windows, dark brown eaves slabs, the core's storey over the block;
    // 503517830681606 and 790009975277994 the same behind the Kuoni's house; on their right the white house with the
    // red arcade and the dark mansard is w118240343 across the street (js/promenade-mansard.js), not this one. The
    // canopy's lettering, the back (east) and the south side are guessed; the balconies of the core's south-west corner
    // in 500840154270323 are left out.
    id: 'w118240371', name: 'Hotel Excellent',
    exclude: [{ x: 525.1, z: -888.4, r: 3 }, { x: 526.2, z: -884.9, r: 3 }],
    floor: 4.3, base: 1.4, colour: C.salmon, plinth: 0.35,
    parts: [
      {
        // the block round the core (open to the street where the core comes down to it)
        ring: [[526.0, -899.0], [526.5, -898.9], [527.3, -901.5], [538.1, -898.5], [535.5, -889.5], [537.4, -889.0], [533.1, -873.6], [532.2, -873.9], [531.8, -872.3], [528.9, -873.1], [523.0, -874.8], [514.9, -877.1], [515.3, -878.5], [514.0, -878.9], [514.6, -881.2], [528.4, -877.3], [529.0, -879.4], [533.7, -878.1], [536.0, -886.0], [535.0, -886.3], [535.8, -889.3], [533.7, -889.9], [535.7, -896.8]],
        top: 17.02
      },
      {
        // the core
        ring: [[528.4, -877.3], [529.0, -879.4], [533.7, -878.1], [536.0, -886.0], [535.0, -886.3], [535.8, -889.3], [533.7, -889.9], [535.7, -896.8], [526.0, -899.0], [523.5, -889.9], [521.0, -890.6], [520.3, -888.1], [517.2, -888.9], [516.7, -887.2], [516.3, -887.3], [514.6, -881.2]],
        top: 21.75
      },
      // the low wing on the south side
      { ring: [[521.6, -869.9], [527.5, -868.3], [528.9, -873.1], [523.0, -874.8]], top: 7.69 }
    ],
    cornice: { out: 0.7, thick: 0.45, colour: C.brown },
    shops: [
      // the restaurant on the street under its deep canopy on posts
      {
        on: [[516.3, -887.3], [514.0, -878.9]], s0: 0.4, s1: 8.3, top: 7.2, fascia: 0.6, piers: [0.3, 0.2, 0.15],
        canopy: { depth: 2.8, colour: C.brown, posts: true }, signs: [{ key: 'excellent', s: 4.35 }], signAt: 'canopy'
      }
    ],
    shopIds: ['n3287588701']
  },
  {
    // The Kuoni's house (batch 19: one flat roof at 14.22): the shops on the Promenade, two storeys over them. 2013 from
    // the Promenade north of it, 790009975277994 and 128439255939611 (filed under the Excellent and here) close by:
    // white plaster, the shops' dark frames under a dark band all along the street, "KUONI" on it (at the north end in
    // 2013), two storeys of windows, a shallow roof on deep dark brown eaves. 474266040359858 and 496417351724667 show
    // the Hotel Concordia (w126895457) north of it on the left and the Pflanzenbrocki's house on the right; this house
    // only far off. The shops' order is OpenStreetMap's (X-Hair, Tabac & Souvenirs, BeeYou, Kuoni from north to
    // south); their lettering in plain type; the back (east) is guessed.
    id: 'w116881237', name: 'the Kuoni\'s house',
    exclude: [{ x: 534.6, z: -928.4, r: 3 }],
    floor: 4.2, base: 1.6, colour: C.white, plinth: 0.35,
    parts: [{ ring: KUONI, roofs: [0] }],
    roofs: [hipRoof(KUONI, [7.8, -29.0], { eaves: 13.55, slope: 0.17, over: 1.0 })],
    shops: [
      {
        on: [[531.7, -944.7], [523.9, -915.7]], s0: 0.5, s1: 29.5, top: 7.1, fascia: 0.75, piers: [0.1, 0.095, 0.09],
        canopy: { depth: 1.3, colour: C.dark },
        signs: [{ key: 'xhair', s: 3.6 }, { key: 'tabac', s: 9.2 }, { key: 'beeyou', s: 14.4 }, { key: 'kuoni', s: 20.6 }], signAt: 'canopy'
      }
    ],
    shopIds: ['n3287588693', 'n12068195585', 'n12082599271', 'n6184778522']
  },
  {
    // The Pflanzenbrocki's house at the corner of the Horlaubenstrasse (batch 20: its west half at 19.68; batch 17: its
    // east half on the street at 20.15). 2013 from the Promenade's pavement north of it, 474266040359858 (filed under
    // the Kuoni's: the house on the right, its bearing 191° from 532/−997) and 2015 1881284498713685 (right of the
    // middle): orange-red plaster, a white ground floor with the shop's big panes on the street, four storeys of windows
    // with dark frames, a flat roof's dark edge, white bay windows stacked at the corner on the lane with painted
    // ornaments round them, a chimney. Its other photographs (162245375806039, 476240323726062, 484272229388271,
    // 503654127668771) look past it: the Bergsport's house (w118240615) and the Hotel Dischma fill them. The
    // lettering (Pflanzenbrocki came after the photographs' antiques shop), the west half up the slope and the
    // ornaments are guessed.
    id: 'w118240624', name: 'the Pflanzenbrocki\'s house',
    exclude: [{ x: 507.9, z: -986.4, r: 3 }, { x: 518.5, z: -983.3, r: 3 }],
    floor: 3.9, base: 3.2, colour: C.orange, plinth: 0.3,
    parts: [
      { ring: [[502.1, -981.3], [510.9, -979.0], [514.1, -991.2], [505.4, -993.5]], top: 19.68, bands: [[6.7, C.white]] },
      { ring: [[510.5, -977.7], [522.5, -974.5], [526.4, -988.9], [514.4, -992.1], [514.1, -991.2], [510.9, -979.0]], top: 20.15, bands: [[6.7, C.white]] }
    ],
    cornice: { out: 0.45, thick: 0.35, colour: C.dark },
    shops: [
      { on: [[522.5, -974.5], [526.4, -988.9]], s0: 0.6, s1: 14.3, top: 6.7, fascia: 0.7, piers: [0.58, 0.58, 0.56], fasciaColour: C.cream, signs: [{ key: 'pflanzen', s: 8.0 }] }
    ],
    bays: [{ on: [[526.4, -988.9], [514.4, -992.1]], s0: 0.8, s1: 3.6, out: 0.65, floors: [6.8, 9.7, 12.6, 15.5], colour: C.cream }],
    shopIds: ['n3287588704']
  },
  {
    // The Hotel Dischma with the Dorfkeller (batch 13: the hotel at 17.81, its north wing at 14.98, a narrow wing along
    // its east side at 11.38). 2013 and 2015 from the Promenade north of it, 293696668896695, 484272229388271 and
    // 877079032839673 (from 543–548/−1046…−1057, looking south), and 1881284498713685 (filed under the
    // Pflanzenbrocki's: on the left, from 539/−1016): ochre plaster with white stucco frames, a grey-white ground floor,
    // a white flat-roofed porch at the wing's corner on the street, a dark brown board down the front with "HOTEL",
    // further along the dark timber panel with "DISCHMA — Hotel, Dorfbeiz, Restaurant, Bar-Dancing", shallow hipped
    // roofs on deep eaves, a flag on the roof. On their right the Bergsport's house and the orange Pflanzenbrocki's.
    // The Dorfkeller's door on the wing's north side by the lane (the Craft Beer mission's door, 561.2/−1020.3), the
    // back and the east wing are guessed; the porch is drawn as the wing's white ground floor under a slab.
    id: 'w126895319', name: 'Hotel Dischma',
    exclude: [{ x: 550.8, z: -1005.3, r: 3 }],
    floor: 3.4, base: 1.3, colour: C.ochre, plinth: 0.4,
    parts: [
      { ring: DISCHMA_MAIN, roofs: [0], bands: [[6.6, C.grey]] },
      { ring: DISCHMA_WING, roofs: [1], bands: [[6.6, C.white]] },
      {
        ring: [[556.4, -998.8], [557.4, -998.5], [560.6, -1011.5], [559.9, -1011.7], [561.3, -1017.6], [559.3, -1018.1], [557.6, -1011.0], [558.2, -1010.8], [557.0, -1006.2], [558.2, -1005.9]],
        top: 11.38, bands: [[6.6, C.grey]]
      }
    ],
    roofs: [
      hipRoof(DISCHMA_MAIN, [5.5, -22.4], { eaves: 17.0, slope: 0.2, over: 0.9 }),
      hipRoof(DISCHMA_WING, [11.9, 2.9], { eaves: 14.2, slope: 0.2, over: 0.9 })
    ],
    cornice: { out: 0.35, thick: 0.3, colour: C.brown, parts: [2] },
    shops: [
      // the porch on the street: the wing's white ground floor under a white slab
      { on: [[548.1, -1022.8], [545.7, -1013.9]], s0: 0.5, s1: 8.6, top: 6.4, fascia: 0.5, piers: [0.6, 0.6, 0.58], canopy: { depth: 0.9, colour: C.cream } },
      { on: [[545.7, -1013.9], [540.2, -991.5]], s0: 4.6, s1: 22.4, top: 6.4, fascia: 0.4, piers: [0.42, 0.43, 0.43], fasciaColour: C.grey }
    ],
    letters: [
      // the board with HOTEL by the wing, the panel with DISCHMA further along the front
      { on: [[545.7, -1013.9], [540.2, -991.5]], s0: 0.2, s1: 1.4, y0: 7.4, y1: 13.4, key: 'hotel', board: C.brown },
      { on: [[545.7, -1013.9], [540.2, -991.5]], s0: 1.8, s1: 4.6, y0: 10.2, y1: 15.6, key: 'dischma', board: C.brown },
      { on: [[559.8, -1020.0], [548.1, -1022.8]], s0: 0.3, s1: 3.3, y0: 6.0, y1: 6.75, key: 'dorfkeller' }
    ],
    doors: [{ on: [[559.8, -1020.0], [548.1, -1022.8]], s: 1.6, w: 1.2 }],
    shopIds: ['n797667060', 'n5324573076']
  },
  {
    // The Freitag Store's house (batch 2 of 11/1751/1019: one flat roof at 12.19), west of the Promenade where it bends
    // north-east. 2013 from the Promenade's far side north-east of it, 600987217525727 (on the right): larch boards
    // all over, a flat roof's thin edge, the shop's panes on the ground floor round the corner, two storeys of windows,
    // chimneys; 2014 from the north (338149517668548, 383915416072302) the same boards behind the spruces. The two
    // from the south-west (458426638775337, 286476946308859, from 506/−1015…−1022) show the pink house w118240614 and
    // the cream w118240603, not this one. The FREITAG lettering and the west side up the slope are guessed; the
    // loggia on its north-west corner is left out.
    id: 'w118240628', name: 'the Freitag Store\'s house',
    exclude: [{ x: 535.8, z: -1069.5, r: 3 }],
    floor: 1.9, base: 1.2, colour: C.larch, timber: true, plinth: 0.3,
    parts: [
      { ring: [[524.0, -1067.0], [535.0, -1063.5], [534.8, -1062.8], [544.5, -1060.9], [547.4, -1075.7], [536.7, -1077.8], [536.5, -1076.6], [526.7, -1078.0]], top: 12.19 }
    ],
    cornice: { out: 0.3, thick: 0.25, colour: C.dark },
    shops: [
      { on: [[544.5, -1060.9], [547.4, -1075.7]], s0: 0.5, s1: 14.6, top: 4.8, fascia: 0.6, piers: [0.08, 0.08, 0.08], fasciaColour: C.dark, signs: [{ key: 'freitag', s: 9.0 }] },
      { on: [[547.4, -1075.7], [536.7, -1077.8]], s0: 0.5, s1: 6.8, top: 4.8, fascia: 0.6, piers: [0.08, 0.08, 0.08], fasciaColour: C.dark }
    ],
    shopIds: ['n12026409445']
  }
];

// --- Roofs ----------------------------------------------------------------------------------------------------------------
/** The roof's frame (a→b), its length */
export const roofFrame = (R) => frame(R.a, R.b);
/** The ridge's ends inside the eaves' outline: [h0, h1] */
export const hips = (R) => R.hip || [0, 0];
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
/** The parts' outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): every part reaches the ground */
export const groundOutlines = (house) => house.parts.map((p) => p.ring);
/** Is a point inside one of the row's houses? */
export const insideRow = (x, z) => HOUSES.some((h) => groundOutlines(h).some((r) => pointInRing(r, x, z)));

/**
 * A wall's frame from a segment (a, b) on a house's outline, turned so that it faces out of the house at height `y`
 * (its n leaving the parts that stand higher there)
 */
export function wallOut(house, a, b, y = -Infinity) {
  const F = wallFrame(a, b), [x, z] = onWall(F, F.len / 2, 0.4);
  return house.parts.some((p) => pointInRing(p.ring, x, z) && partTop(house, p, x, z) > y) ? wallFrame(b, a) : F;
}
/** The height a feature on a wall stands at (wallOut's y): a bay's lowest floor, a shop's top, lettering's foot */
export const featureY = (f) => (f.floors ? Math.min(...f.floors) : f.y0 ?? f.top ?? -Infinity);
/** The businesses whose signs the row letters itself (js/shops-data.js' osm ids) */
export const SHOP_IDS = HOUSES.flatMap((h) => h.shopIds || []);

/** The canopies' posts: [x, z] world points at the canopy's outer edge, every ~4 m (the restaurant's on the Excellent) */
export function canopyPosts(house, Sp) {
  if (!Sp.canopy || !Sp.canopy.posts) return [];
  const F = wallFrame(Sp.on[0], Sp.on[1]), d = Sp.canopy.depth - 0.2;
  const n = Math.max(1, Math.round((Sp.s1 - Sp.s0) / 4));
  const out = [];
  for (let k = 0; k <= n; k++) out.push(onWall(F, Sp.s0 + 0.2 + ((Sp.s1 - Sp.s0 - 0.4) * k) / n, d));
  return out;
}

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // the Promenade north of the Kuoni's house looking south (790009975277994's place): the Kuoni's, the Excellent beyond
  kuoni: [520, 5.8, -956, 528, 9.0, -900],
  // the Promenade by the Horlaubenstrasse looking south (1881284498713685's place): the Dischma left, the
  // Pflanzenbrocki's right
  dischma: [539, 5.2, -1016, 528, 9.0, -982],
  // the Promenade's far side north-east of the Freitag looking south-west (600987217525727's place)
  freitag: [562, 2.2, -1112, 541, 5.0, -1070]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
