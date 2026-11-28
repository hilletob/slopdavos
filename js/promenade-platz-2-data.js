// Two stretches of houses on the Promenade in Davos Platz rebuilt by hand (js/promenade-platz-2.js): by the
// Kongresszentrum, the grey house with the green window frames and der Frisör's pavilion before it, the cream house
// with the timber balconies west of them (north of the street), the white house with the garages and the grey
// panelled block on the slope south of the street; and between the Post and the Hotel Central, on the south-east side
// of the street: the Haus Trauffer (Schuler Bücher), the low shop house of the ARGO Laden, and the block of the Meng
// shop and Augenoptik Schneider, Mountain's Akt and the white house of 47 Grad. Pure data and frame maths, shared by
// the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1747/1015, 11/1746/1012 and 11/1745/1011): the roofs' outlines and heights below
// are its flat roofs, each a prism down under the ground; heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js). The batches and the OpenStreetMap buildings they hold:
// - 1747/1015 batch 0: the grey house (w117012139): its main block (y 10.4), the back up the slope (11.9), the east
//   wing (9.2), the low strip before the east wing (−0.7), and der Frisör's pavilion (0.6) before its west half on the
//   Promenade, on no OpenStreetMap outline (the module brings its walls). Its main block's outline in the survey is
//   three overlapping faces of a roof at y 10.37–10.39 (a hipped roof the tile flattened): taken here as the block's
//   quadrilateral, the strip along its south-west side and a sliver along its west end, the hipped roof put back over
//   the quadrilateral after the photographs;
// - 1747/1015 batch 3: the cream house (w117012319): the main block (15.2), the band north-east of it (12.1) and the
//   wing on the Promenade (9.2);
// - 1747/1015 batch 1: the white house (w116881261), the hipped roof put back after the photographs;
// - 1747/1015 batch 4: the grey block (w116881242); its second ring, a slab at y −0.1 between it and the white house,
//   lies under the white house's roof and is not built;
// - 1746/1012 batch 2: one ring over the Haus Trauffer (w123382365, Schuler Bücher's corner) and its neighbour
//   (w123382393): cut on OpenStreetMap's party wall;
// - 1746/1012 batch 1: the ARGO Laden's house (w123382392);
// - 1745/1011 batch 12: the house of 47 Grad (w1529620021, 12.4), the low strip north of it (w1529620020, 3.5),
//   Mountain's Akt (w219449796, 3.7), the Meng shop's glass house (w219449799, 5.9) and its low east end (2.8).
// The ground: the Promenade lies at y −6.7 by the Kongresszentrum (the ground climbs north to y 10–25 behind the grey
// and the cream house and falls south to −12.7 at the white house's garages), at −4.2 by the Haus Trauffer (falling
// south-east to −10 behind it) and at −3.0 by 47 Grad (−7.8 behind it).
// The look after Mapillary's street views (CC BY-SA): see js/promenade-platz-2.js.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';
import { clipRing, partWalls } from './promenade-platz-data.js';

// The Promenade's centre lines (OpenStreetMap, world x, z): by the Kongresszentrum (east to west), and from the Hotel
// Europe's corner north-east to the Post
export const PROMENADE_LINES = [
  [[-61, -629], [-71, -628], [-93, -623], [-105, -619], [-122, -612], [-135, -605], [-144, -599], [-152, -592], [-156, -588],
    [-159, -586], [-163, -579], [-177, -554]],
  [[-574, -137], [-562, -180], [-560, -188], [-547, -226], [-544, -233], [-540, -238], [-535, -244], [-526, -252], [-515, -257],
    [-506, -261], [-491, -267], [-483, -272], [-477, -276], [-472, -281], [-453, -302], [-430, -326], [-391, -370], [-370, -391]]
];

// The windows' kinds the walls' material draws (carried in v, js/promenade-platz-2.js): white frames, green frames,
// brown frames with roller blinds, dark ribbons behind louvres, storey-high glass
export const KIND = { white: 0, green: 1, brown: 2, ribbon: 3, glass: 4 };

// The houses: their look. `floor`: the ground floor's foot (on the Promenade); `shop`: its top (the shops' glazing and
// fascia under it on the walls facing the Promenade); `storey`: the floors over it; `skin`: the plaster (linear);
// `kind`: the windows (KIND); `eave`: how far the roof's edge stands out, its height, its underside; `fascia`: the
// shops' band; `pier`: the piers between the shop windows; `parapet`: the closed band under the roof; `shops`: false
// where the walls on the Promenade carry no shop front
export const HOUSES = {
  grey: { name: 'the grey house', floor: -6.8, shop: -3.0, storey: 3.1, skin: [0.34, 0.36, 0.32], kind: KIND.green, eave: { out: 0.8, h: 0.4, under: [0.2, 0.11, 0.06] }, fascia: [0.2, 0.21, 0.2], pier: [0.3, 0.31, 0.29], parapet: 0.95 },
  greyEast: { name: 'the grey house\'s east wing', floor: -6.8, shop: -3.0, storey: 3.05, skin: [0.5, 0.51, 0.48], kind: KIND.green, eave: { out: 0.35, h: 0.35, under: [0.1, 0.25, 0.14] }, fascia: [0.2, 0.21, 0.2], pier: [0.3, 0.31, 0.29], parapet: 0.0 },
  frisor: { name: 'der Frisör', floor: -6.8, shop: -2.6, storey: 2.9, skin: [0.2, 0.1, 0.05], kind: KIND.brown, eave: { out: 0.35, h: 0.5, under: [0.14, 0.07, 0.035] }, fascia: [0.17, 0.085, 0.04], pier: [0.2, 0.1, 0.05], parapet: 0.28 },
  cream: { name: 'the cream house', floor: -6.7, shop: -3.0, storey: 2.95, skin: [0.55, 0.47, 0.33], kind: KIND.brown, eave: { out: 1.1, h: 0.4, under: [0.16, 0.08, 0.04] }, fascia: [0.3, 0.15, 0.07], pier: [0.5, 0.43, 0.31], parapet: 0.5 },
  white: { name: 'the white house', floor: -6.8, shop: -3.7, storey: 2.8, skin: [0.6, 0.6, 0.57], kind: KIND.brown, eave: { out: 0.7, h: 0.3, under: [0.24, 0.12, 0.06] }, fascia: [0.25, 0.25, 0.24], pier: [0.45, 0.44, 0.4], parapet: 0.3 },
  panel: { name: 'the grey block', floor: -6.7, shop: -3.7, storey: 3.0, skin: [0.17, 0.18, 0.19], kind: KIND.ribbon, eave: { out: 0.25, h: 0.35, under: [0.55, 0.55, 0.53] }, fascia: [0.17, 0.18, 0.19], pier: [0.17, 0.18, 0.19], parapet: 0.6, shops: false },
  trauffer: { name: 'the Haus Trauffer', floor: -4.3, shop: -0.3, storey: 3.0, skin: [0.55, 0.37, 0.3], kind: KIND.brown, eave: { out: 0.45, h: 0.35, under: [0.18, 0.12, 0.09] }, fascia: [0.17, 0.2, 0.19], pier: [0.2, 0.23, 0.22], parapet: 0.45 },
  traufferWest: { name: 'the Haus Trauffer\'s neighbour', floor: -4.3, shop: -0.3, storey: 3.0, skin: [0.46, 0.42, 0.32], kind: KIND.brown, eave: { out: 0.45, h: 0.35, under: [0.18, 0.12, 0.09] }, fascia: [0.17, 0.2, 0.19], pier: [0.2, 0.23, 0.22], parapet: 0.45 },
  argo: { name: 'the ARGO Laden\'s house', floor: -4.1, shop: -0.1, storey: 3.0, skin: [0.56, 0.56, 0.54], kind: KIND.white, eave: { out: 0.3, h: 0.35, under: [0.12, 0.28, 0.24] }, fascia: [0.12, 0.28, 0.24], pier: [0.5, 0.5, 0.48], parapet: 0.8 },
  grad: { name: 'the house of 47 Grad', floor: -3.0, shop: 0.9, storey: 2.78, skin: [0.6, 0.6, 0.58], kind: KIND.white, eave: { out: 0.4, h: 0.3, under: [0.45, 0.45, 0.43] }, fascia: [0.3, 0.3, 0.3], pier: [0.55, 0.55, 0.53], parapet: 0.4 },
  annex: { name: 'the low strip by 47 Grad', floor: -3.0, shop: 0.9, storey: 2.25, skin: [0.47, 0.47, 0.45], kind: KIND.white, eave: { out: 0.25, h: 0.3, under: [0.4, 0.4, 0.39] }, fascia: [0.3, 0.3, 0.3], pier: [0.45, 0.45, 0.43], parapet: 0.3 },
  akt: { name: 'Mountain\'s Akt', floor: -3.0, shop: 0.9, storey: 2.5, skin: [0.58, 0.54, 0.46], kind: KIND.white, eave: { out: 0.5, h: 0.35, under: [0.2, 0.12, 0.07] }, fascia: [0.12, 0.1, 0.09], pier: [0.5, 0.47, 0.4], parapet: 0.33 },
  meng: { name: 'the Meng shop\'s glass house', floor: -3.0, shop: 0.9, storey: 3.0, skin: [0.36, 0.37, 0.38], kind: KIND.glass, eave: { out: 0.7, h: 1.1, under: [0.08, 0.08, 0.085] }, fascia: [0.3, 0.31, 0.32], pier: [0.34, 0.35, 0.36], parapet: 2.0 }
};

// The volumes, each a flat roof at `top` over its outline (world x, z) and a prism down under the ground (`base`);
// `house` its look, `osm` the OpenStreetMap building it stands for (null: on none), `hip` a hipped roof over it from
// `top` rising `hip` m (its outline a quadrilateral)
export const PARTS = [
  // --- by the Kongresszentrum ---
  // the grey house (1747/1015 batch 0): the main block under its hipped roof, the strip on its south-west side and the
  // sliver on its west end at its eaves' height, the back up the slope, the east wing, the low strip before it
  { id: 'grey', house: 'grey', osm: 'w117012139', base: -8.0, top: 10.38, hip: 2.6,
    ring: [[-101.0, -630.0], [-110.1, -638.3], [-119.2, -631.2], [-116.3, -622.7]] },
  { id: 'greySW', house: 'grey', osm: 'w117012139', base: -8.0, top: 10.38,
    ring: [[-119.2, -631.2], [-121.1, -635.0], [-110.9, -639.9], [-110.1, -638.3]] },
  { id: 'greyW', house: 'grey', osm: 'w117012139', base: -8.0, top: 10.38,
    ring: [[-116.3, -622.7], [-120.1, -630.8], [-119.2, -631.2]] },
  { id: 'greyE', house: 'grey', osm: 'w117012139', base: -8.0, top: 10.38,
    ring: [[-107.2, -639.7], [-110.1, -638.3], [-101.0, -630.0], [-105.3, -638.9], [-106.6, -638.3]] },
  { id: 'greyBack', house: 'grey', osm: 'w117012139', base: -8.0, top: 11.92,
    ring: [[-107.2, -639.7], [-110.1, -638.3], [-113.7, -646.0], [-103.3, -650.9], [-99.0, -641.9], [-106.6, -638.3]] },
  { id: 'greyEast', house: 'greyEast', osm: 'w117012139', base: -8.0, top: 9.2,
    ring: [[-103.0, -634.2], [-105.3, -638.9], [-99.0, -641.9], [-100.6, -645.1], [-99.3, -645.7], [-98.2, -643.4], [-97.5, -643.7], [-94.8, -638.1]] },
  { id: 'greyLow', house: 'greyEast', osm: 'w117012139', base: -8.0, top: -0.66, low: true,
    ring: [[-102.4, -633.0], [-103.0, -634.2], [-94.8, -638.1], [-97.3, -643.3], [-95.9, -644.0], [-92.9, -637.5]] },
  // der Frisör's pavilion before the grey house's west half (in the same batch; no OpenStreetMap outline)
  { id: 'frisor', house: 'frisor', osm: null, base: -8.0, top: 0.58, low: true,
    ring: [[-119.2, -631.2], [-119.4, -631.6], [-131.7, -625.8], [-127.6, -617.3], [-124.4, -616.6], [-112.1, -622.5], [-113.0, -624.3],
      [-116.3, -622.7], [-120.1, -630.8]] },
  // the cream house (1747/1015 batch 3): the main block, the band north-east of it, the wing on the Promenade
  { id: 'cream', house: 'cream', osm: 'w117012319', base: -8.0, top: 15.22,
    ring: [[-141.9, -628.4], [-142.8, -627.8], [-144.1, -629.8], [-143.2, -630.3], [-149.0, -639.4], [-166.2, -628.3], [-157.5, -614.8],
      [-156.0, -615.8], [-153.2, -611.5], [-148.9, -614.2], [-149.3, -614.7], [-144.7, -617.8], [-145.2, -618.6], [-138.4, -623.0]] },
  { id: 'creamBand', house: 'cream', osm: 'w117012319', base: -8.0, top: 12.12,
    ring: [[-151.0, -608.5], [-153.2, -611.5], [-148.9, -614.2], [-149.3, -614.7], [-144.7, -617.8], [-145.2, -618.6], [-138.4, -623.0],
      [-136.3, -619.4], [-143.1, -615.0], [-142.5, -614.1]] },
  { id: 'creamWing', house: 'cream', osm: 'w117012319', base: -8.0, top: 9.24,
    ring: [[-142.5, -614.1], [-143.1, -615.0], [-136.3, -619.4], [-134.0, -616.2], [-140.8, -611.7], [-140.4, -611.1],
      [-149.2, -605.4], [-151.0, -608.5]] },
  // the white house (1747/1015 batch 1; its north-east corner's jog of 0.3 m left out) under its hipped roof
  // (its garages' storey on the south side closed: `closedUnder`)
  { id: 'white', house: 'white', osm: 'w116881261', base: -13.5, top: 2.21, hip: 1.9, closedUnder: { edge: 3, y: -9.9 },
    ring: [[-114.3, -594.2], [-119.3, -603.9], [-131.6, -597.6], [-126.4, -587.5]] },
  // the grey panelled block (1747/1015 batch 4)
  { id: 'panel', house: 'panel', osm: 'w116881242', base: -15.0, top: -0.06,
    ring: [[-125.3, -600.6], [-125.7, -601.1], [-142.3, -590.6], [-134.4, -581.5]] },
  // --- between the Post and the Hotel Central ---
  // the Haus Trauffer and its neighbour (1746/1012 batch 2, cut on OpenStreetMap's party wall: traufferCut)
  { id: 'trauffer', house: 'trauffer', osm: 'w123382365', base: -10.5, top: 6.14, cut: 'east' },
  { id: 'traufferWest', house: 'traufferWest', osm: 'w123382393', base: -10.5, top: 6.14, cut: 'west' },
  // the ARGO Laden's house (1746/1012 batch 1)
  { id: 'argo', house: 'argo', osm: 'w123382392', base: -7.5, top: 3.7,
    ring: [[-420.5, -315.7], [-428.0, -322.6], [-437.1, -312.6], [-443.6, -305.5], [-442.4, -302.4], [-432.9, -300.6], [-428.8, -305.0], [-429.6, -305.7]] },
  // 1745/1011 batch 12: 47 Grad's house, the low strip north of it, Mountain's Akt, the Meng shop's glass house and its
  // low east end
  { id: 'grad', house: 'grad', osm: 'w1529620021', base: -6.5, top: 12.42,
    ring: [[-542.0, -224.8], [-546.3, -213.3], [-535.2, -209.1], [-530.9, -220.7]] },
  { id: 'annex', house: 'annex', osm: 'w1529620020', base: -6.5, top: 3.45,
    ring: [[-545.4, -215.6], [-545.9, -215.7], [-547.7, -211.1], [-536.1, -206.7], [-535.2, -209.1], [-546.3, -213.3]] },
  { id: 'akt', house: 'akt', osm: 'w219449796', base: -8.3, top: 3.73,
    ring: [[-528.6, -229.3], [-528.8, -229.0], [-537.5, -232.7], [-537.8, -232.8], [-543.1, -223.2], [-542.6, -223.0], [-542.0, -224.8],
      [-530.9, -220.7], [-531.5, -218.9], [-529.0, -217.9], [-525.2, -228.1]] },
  { id: 'meng', house: 'meng', osm: 'w219449799', base: -8.3, top: 5.9,
    ring: [[-524.5, -246.2], [-532.0, -239.8], [-537.7, -232.8], [-528.8, -229.0], [-524.2, -235.0]] },
  { id: 'mengEast', house: 'meng', osm: 'w219449799', base: -8.3, top: 2.82, low: true,
    ring: [[-524.5, -234.6], [-525.8, -232.9], [-528.6, -229.3], [-525.5, -228.2], [-525.2, -228.1], [-525.2, -227.9], [-521.4, -232.2]] }
];

// The Haus Trauffer's batch: one ring over both houses, cut on OpenStreetMap's party wall (from its foot on the
// Promenade's wall to its end at the courtyard)
export const TRAUFFER = {
  ring: [[-390.0, -339.8], [-394.0, -343.3], [-388.9, -349.0], [-387.3, -347.4], [-388.8, -345.7], [-386.2, -343.4], [-384.0, -345.8],
    [-383.2, -345.1], [-377.9, -351.1], [-390.5, -362.5], [-407.6, -343.5], [-395.3, -332.5], [-392.3, -335.9], [-392.9, -336.5]],
  party: [[-398.1, -354.0], [-391.3, -347.1]]
};
for (const p of PARTS) {
  if (!p.cut) continue;
  const [a, b] = TRAUFFER.party;
  // (the east part: the side the corner on the Post's side, (−377.9, −351.1), is on)
  const side = (q) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
  const eastLeft = side([-377.9, -351.1]) > 0;
  p.ring = clipRing(TRAUFFER.ring, a, b, p.cut === 'east' ? eastLeft : !eastLeft);
}

export const PROMENADE_PLATZ_2 = {
  // swissBUILDINGS3D's batches (their centres): left out of the streamed tiles
  exclude: [
    { x: -112.3, z: -633.8, r: 3 }, { x: -150.1, z: -622.4, r: 3 }, { x: -122.9, z: -595.8, r: 3 }, { x: -133.6, z: -591.2, r: 3 },
    { x: -392.7, z: -347.5, r: 3 }, { x: -432, z: -311.5, r: 3 }, { x: -534.7, z: -226.4, r: 3 }
  ],
  // the grid the walls' material draws: every house's floors are stretched to it
  storey: 3.0,
  // a window (grid metres over its storey's foot) and its half width; the bays along a wall from its middle
  win: { lo: 0.9, hi: 2.3, half: 0.6 },
  bay: 2.7,
  // the walls facing the Promenade (their middle within `near` m of a centre line, facing it): the shops' glazing
  near: 14,
  // The balconies: on a part's wall (its index in partWalls), from s0 to s1 m along it (a negative s: from its far end),
  // their floors' heights (y) and `depth` m out; `rail`: 'timber' (dark boards), 'white' (a plastered parapet),
  // 'screen' (green-grey panels under a white rail), 'iron' (dark bars)
  balconies: [
    // the cream house: the timber stacks on the wing's and the main block's ends towards the Kongresszentrum (the
    // photograph of 2015 from the east)
    { part: 'creamWing', edge: 4, s0: 0.3, s1: -0.3, ys: [-0.05, 2.9, 5.85], depth: 1.2, rail: 'timber' },
    { part: 'creamBand', edge: 2, s0: 0.3, s1: -0.3, ys: [8.8], depth: 1.2, rail: 'timber' },
    { part: 'cream', edge: 13, s0: 0.4, s1: -0.4, ys: [5.85, 8.8, 11.75], depth: 1.2, rail: 'timber' },
    // the white house: the balconies over the garages and under the eaves on its south side, their green-grey screens
    { part: 'white', edge: 3, s0: 0.4, s1: 9.0, ys: [-9.85, -0.85], depth: 1.3, rail: 'screen' },
    // the grey house's east wing: small balconies with iron railings on its front over the low strip
    { part: 'greyEast', edge: 7, s0: 1.0, s1: -1.0, ys: [0.05, 3.1, 6.15], depth: 0.6, rail: 'iron' },
    // the Haus Trauffer's back towards the slope: timber balconies stacked on its south-east side
    { part: 'trauffer', edge: 'back', s0: 1.0, s1: -1.0, ys: [-4.3, -0.3, 2.7], depth: 1.2, rail: 'timber' },
    { part: 'traufferWest', edge: 'back', s0: 0.4, s1: -0.4, ys: [-4.3, -0.3, 2.7], depth: 1.2, rail: 'timber' }
  ],
  // The shops the module letters itself (js/shops-data.js's businesses: their boards sit on its walls, not on
  // OpenStreetMap's outlines): their OSM ids
  shops: ['n6184860853', 'n9356746864', 'n13318930169', 'n9356731531', 'n9356731530', 'n12839278304'],
  // the white house's garages (on its south wall, from s0, `n` doors `w` wide each from the lane's level y0, the garage
  // storey closed under y1; the ground the game draws humps 2 m along the wall where the lane is level)
  garages: { part: 'white', edge: 3, s0: 0.6, n: 4, w: 2.6, y0: -12.8, y1: -9.9 },
  // der Frisör's tall board on the pavilion's east end (its wall, s along it)
  frisor: { part: 'frisor', edge: 5, s: 1.0 }
};

/** A part by its id */
export const part = (id) => PARTS.find((p) => p.id === id);

/** The distance from a point to the Promenade's nearest centre line, and the nearest point on it */
export function promenadeNear(x, z) {
  let best = { d: Infinity, x: 0, z: 0 };
  for (const L of PROMENADE_LINES) {
    for (let i = 0; i + 1 < L.length; i++) {
      const [ax, az] = L[i], [bx, bz] = L[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { d, x: px, z: pz };
    }
  }
  return best;
}

/** Does a wall face the Promenade (its middle near a centre line, facing it)? */
export function facesPromenade(F) {
  const [mx, mz] = onWall(F, F.len / 2);
  const p = promenadeNear(mx, mz);
  if (p.d > PROMENADE_PLATZ_2.near || p.d < 1e-6) return false;
  return (F.n[0] * (p.x - mx) + F.n[1] * (p.z - mz)) / p.d > 0.6;
}

/** Is a point inside one of the parts other than `skip`? */
export const insideOther = (x, z, skip) => PARTS.some((q) => q !== skip && pointInRing(q.ring, x, z));

/**
 * A wall of a part by its name in the balconies' list: an index into partWalls, 'back' its longest wall facing away
 * from the Promenade
 */
export function namedWall(p, name) {
  const W = partWalls(p);
  if (typeof name === 'number') return W[name];
  if (name === 'back') {
    return W.filter((F) => {
      const [mx, mz] = onWall(F, F.len / 2), q = promenadeNear(mx, mz);
      return (F.n[0] * (q.x - mx) + F.n[1] * (q.z - mz)) / q.d < -0.6 && !insideOther(...onWall(F, F.len / 2, 0.3), p);
    }).reduce((a, F) => (!a || F.len > a.len ? F : a), null);
  }
  return null;
}

/** The outlines the player's walls stand on, per OpenStreetMap building (js/landmarks.js SURVEYED_FOOTPRINTS) */
export function groundOutlines() {
  const out = new Map();
  for (const p of PARTS) {
    if (!p.osm) continue;
    if (!out.has(p.osm)) out.set(p.osm, []);
    out.get(p.osm).push(p.ring);
  }
  return out;
}

/** The parts standing on no OpenStreetMap outline of theirs (the module brings their walls' colliders) */
export const freeParts = () => PARTS.filter((p) => !p.osm);

/** Is a point inside one of the outlines the walls stand on? */
export const insideRow = (x, z) => PARTS.some((p) => pointInRing(p.ring, x, z));

/**
 * The corners of a hipped roof over a part (its outline a quadrilateral): the foot `out` m out of the walls at `y0`
 * (the eaves lowered by the overhang's fall), the ridge's ends over the middle of its long axis; [foot (×4, [x, y, z],
 * round the outward ring), ridge (×2: over the first short side's end, over the second's)]
 */
export function hipCorners(p, out) {
  const R = outwardRing(p.ring);
  const W = R.map((q, i) => wallFrame(q, R[(i + 1) % 4]));
  const rise = p.hip, len = W.map((F) => F.len);
  // (the short sides: 0 and 2, or 1 and 3)
  const k = len[0] + len[2] <= len[1] + len[3] ? 0 : 1;
  const half = Math.min(len[k], len[k + 2]) / 2;
  const fall = (out * rise) / half;
  // each corner pushed out along both its walls' normals
  const foot = R.map((q, i) => {
    const A = W[(i + 3) % 4], Bf = W[i];
    const nx = A.n[0] + Bf.n[0], nz = A.n[1] + Bf.n[1], dot = A.n[0] * Bf.n[0] + A.n[1] * Bf.n[1];
    const f = out / (1 + dot);
    return [q[0] + nx * f, p.top - fall, q[1] + nz * f];
  });
  const mid = (i) => { const a = R[i], b = R[(i + 1) % 4]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const m0 = mid(k), m1 = mid(k + 2), L = Math.hypot(m1[0] - m0[0], m1[1] - m0[1]);
  const d = Math.min(half, L / 2 - 0.01);
  const at = (m, o, t) => [m[0] + ((o[0] - m[0]) * t) / L, p.top + rise, m[1] + ((o[1] - m[1]) * t) / L];
  const r0 = at(m0, m1, d), r1 = at(m1, m0, d);
  // (the foot from the corner where the first short side starts: f0 f1 the first short side, f2 f3 the second)
  const order = [k, k + 1, k + 2, (k + 3) % 4].map((i) => foot[i % 4]);
  return { foot: order, ridge: [[r0[0], r0[1], r0[2]], [r1[0], r1[1], r1[2]]] };
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing, partWalls };
