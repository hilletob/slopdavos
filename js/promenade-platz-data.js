// The row of houses along the Promenade in Davos Platz between the Hotel Europe and the Post (js/promenade-platz.js):
// Promenade 60 with its hipped roof, the white shop house of the Bike Academy (Bucherer's in 2013) with its round tower
// behind, the yellow block of Chronometrie Stäuble with the low shop wing of MOB Sportinetta, the cream house with the
// balconies (CACAO, Wollino, Odlo) and the grey one beside it (Bergsport Outlet, Tchibo's in 2013), the mint-green
// block of Herz Fashion over the slope, the new block of the Raiffeisen, and the block of the Blue Lemon, the Haus
// Fortuna and the Ang'n Hus with the low shops between them. Pure data and frame maths, shared by the browser module and
// the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1745/1011, 11/1745/1012 and 11/1746/1012): the roofs' outlines and heights below
// are its flat roofs, each a prism down under the ground, and its hipped roof over Promenade 60; heights in the world
// frame (y = m a.s.l. − 1558, js/davos-frame.js). The Promenade along the fronts lies at y −2.8 to −4.4; the ground
// climbs north-west up the valley's side to y 3–5 behind the houses on its north-west side and falls south-east to
// y −6 to −13 behind those on its south-east side. The batches and the OpenStreetMap buildings they hold:
// - 1011 batch 2: the northern 23 m of Promenade 60 (w123380413; Pizza Heaven's door on its north-west corner); its
//   southern part towards the Arkaden is in a batch the extraction did not reach and stays streamed, its outline on
//   OpenStreetMap's (cut at the surveyed south wall);
// - 1011 batch 10: the Bike Academy's house (w123384642), the round tower and the back wings up the slope;
// - 1011 batches 11 and 8, 1012 batches 12 and 8: the yellow block (w123384614), its low shop wing on the Promenade and
//   a shaft over its roof;
// - 1012 batch 3: the cream house (w123384625) with its low part and the grey house (w123384636);
// - 1012 batch 0: the mint-green block (w123382382), its end wings, the stair's housing and the podium on the slope;
// - 1746/1012 batch 7: one box of 41 × 18 m over w225902143 (the Raiffeisen, on the Promenade) and w225902144 (down the
//   slope behind it): the house built after 2015 on the site the photographs show behind hoardings (the survey has only
//   its box: its look is guessed);
// - 1746/1012 batch 11: one batch over the block between the Obere Strasse and the Promenade: the Blue Lemon's house
//   (w123384640), the Haus Fortuna (w123384629), the Ang'n Hus (w123384615) with its strip on the Promenade, the low
//   shops and the link between them (no outline of their own: given to their neighbours), and the low part on the
//   Promenade before w123384637, whose pitched house (1012 batch 11) stays streamed over it.
// w122930760 (across the Promenade from Promenade 60) and w123384613 (by the Post) lie in batches the extraction did not
// reach and stay as they were.
// The look after Mapillary's street views (2013–2015, CC BY-SA): see js/promenade-platz.js.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The Promenade's centre line here (OpenStreetMap, world x, z), from the Europe's corner north-east to the Post
export const PROMENADE = [
  [-574, -137], [-562, -180], [-560, -188], [-547, -226], [-544, -233], [-540, -238], [-535, -244], [-526, -252],
  [-515, -257], [-506, -261], [-491, -267], [-483, -272], [-477, -276], [-472, -281], [-453, -302], [-430, -326],
  [-391, -370], [-370, -391]
];

// The houses: their look. `floor`: the ground floor's foot (on the Promenade); `shop`: its top (the shops' glazing and
// fascia under it on the walls facing the Promenade); `storey`: the floors over it; `skin`: the plaster (linear);
// `eave`: how far the roof's edge stands out and its colour, its underside; `fascia`: the shops' band; `pier`: the
// piers between the shop windows; `parapet`: the closed band under the roof
export const HOUSES = {
  p60: { name: 'Promenade 60', floor: -2.85, shop: 1.35, storey: 2.85, skin: [0.5, 0.3, 0.21], eave: { out: 0.7, h: 0.45, under: [0.36, 0.3, 0.26] }, fascia: [0.32, 0.07, 0.05], pier: [0.56, 0.5, 0.45], parapet: 0.3 },
  bike: { name: 'Bike Academy', floor: -3.0, shop: 1.2, storey: 2.87, skin: [0.6, 0.6, 0.58], eave: { out: 1.3, h: 0.35, under: [0.3, 0.17, 0.08] }, fascia: [0.62, 0.61, 0.58], pier: [0.3, 0.2, 0.15], parapet: 0.25 },
  yellow: { name: 'the yellow block', floor: -2.9, shop: 1.0, storey: 3.1, skin: [0.55, 0.45, 0.2], eave: { out: 0.45, h: 0.3, under: [0.5, 0.46, 0.38] }, fascia: [0.6, 0.6, 0.57], pier: [0.6, 0.6, 0.57], parapet: 0.3 },
  cream: { name: 'the cream house', floor: -3.3, shop: 0.9, storey: 2.93, skin: [0.56, 0.47, 0.29], eave: { out: 0.5, h: 0.3, under: [0.45, 0.4, 0.3] }, fascia: [0.58, 0.58, 0.56], pier: [0.58, 0.58, 0.56], parapet: 0.25 },
  grey: { name: 'the grey house', floor: -3.3, shop: 0.9, storey: 2.93, skin: [0.34, 0.33, 0.31], eave: { out: 0.4, h: 0.3, under: [0.3, 0.29, 0.27] }, fascia: [0.58, 0.58, 0.56], pier: [0.58, 0.58, 0.56], parapet: 0.25 },
  mint: { name: 'the mint-green block', floor: -3.8, shop: 0.4, storey: 3.07, skin: [0.32, 0.51, 0.42], eave: { out: 0.35, h: 0.3, under: [0.4, 0.44, 0.42] }, fascia: [0.55, 0.56, 0.55], pier: [0.55, 0.56, 0.55], parapet: 0.3 },
  raiffeisen: { name: 'the Raiffeisen', floor: -4.1, shop: 0.4, storey: 3.05, skin: [0.52, 0.52, 0.5], eave: { out: 0.3, h: 0.35, under: [0.3, 0.3, 0.3] }, fascia: [0.2, 0.2, 0.21], pier: [0.25, 0.25, 0.26], parapet: 0.45 },
  lemon: { name: 'the Blue Lemon', floor: -4.4, shop: -0.2, storey: 3.32, skin: [0.58, 0.34, 0.19], eave: { out: 0.9, h: 0.35, under: [0.2, 0.11, 0.06] }, fascia: [0.62, 0.62, 0.6], pier: [0.62, 0.62, 0.6], parapet: 0.3 },
  fortuna: { name: 'the Haus Fortuna', floor: -4.2, shop: 0.0, storey: 3.19, skin: [0.47, 0.56, 0.52], eave: { out: 0.4, h: 0.3, under: [0.45, 0.47, 0.46] }, fascia: [0.24, 0.24, 0.25], pier: [0.32, 0.32, 0.33], parapet: 0.3 },
  angn: { name: "the Ang'n Hus", floor: -4.1, shop: 0.1, storey: 3.16, skin: [0.52, 0.42, 0.35], eave: { out: 0.6, h: 0.3, under: [0.24, 0.14, 0.08] }, fascia: [0.58, 0.58, 0.56], pier: [0.58, 0.58, 0.56], parapet: 0.3 },
  shops: { name: 'the low shops', floor: -4.1, shop: 0.1, storey: 3.16, skin: [0.46, 0.45, 0.43], eave: { out: 0.3, h: 0.3, under: [0.4, 0.4, 0.39] }, fascia: [0.58, 0.58, 0.56], pier: [0.5, 0.5, 0.49], parapet: 0.3 }
};

// The volumes, each a flat roof at `top` over its outline (world x, z) and a prism down under the ground (`base`);
// `house` its look. Promenade 60's main volume carries the attic storey and the hipped roof over it (`hip`)
export const PARTS = [
  // Promenade 60 (1011 batch 2): the walls at the ground (the eaves' outline stands 0.7 m out of them), the attic set
  // back from them under the hipped roof
  { id: 'p60', house: 'p60', osm: 'w123380413', base: -7.1, top: 15.63,
    ring: [[-556.9, -173.5], [-561.3, -158.7], [-541.3, -152.7], [-536.9, -167.5]],
    // the south wall stands against the streamed southern part, which reaches y 7.0: closed under it
    party: { below: 7.0, toward: [-0.29, 0.96] } },
  { id: 'p60attic', house: 'p60', osm: null, base: 15.3, top: 17.5, attic: true,
    ring: [[-555.9, -172.4], [-559.8, -158.7], [-542.5, -153.8], [-538.7, -167.5]] },
  // the Bike Academy's house (1011 batch 10): the front block on the Promenade, the back wings, the round tower
  { id: 'bike', house: 'bike', osm: 'w123384642', base: -3.5, top: 9.81,
    ring: [[-565.6, -199.3], [-578.1, -210.8], [-574.1, -207.4], [-573.3, -207.1], [-572.5, -207.3], [-571.7, -207.9], [-571.1, -208.9],
      [-568.2, -208.1], [-566.4, -214.0], [-572.1, -220.1], [-575.8, -221.9], [-578.0, -223.1], [-571.0, -236.6], [-555.2, -229.0], [-564.0, -202.6]] },
  { id: 'bikeWest', house: 'bike', osm: 'w123384642', base: 3.0, top: 9.81,
    ring: [[-579.1, -214.5], [-581.9, -215.6], [-583.3, -212.9], [-580.3, -210.3], [-579.2, -211.7], [-579.7, -213.3]] },
  { id: 'bikeBack', house: 'bike', osm: 'w123384642', base: 3.0, top: 11.14,
    ring: [[-568.2, -208.1], [-571.1, -209.0], [-570.9, -209.8], [-571.2, -210.6], [-576.9, -215.5], [-577.8, -215.5], [-578.8, -214.9],
      [-579.1, -214.5], [-582.0, -215.6], [-578.1, -223.1], [-572.1, -220.1], [-566.4, -214.0]] },
  { id: 'bikeTower', house: 'bike', osm: 'w123384642', base: 3.0, top: 12.1, tower: true,
    ring: [[-579.2, -211.7], [-574.1, -207.4], [-573.3, -207.1], [-572.5, -207.3], [-571.7, -207.9], [-571.1, -208.9], [-570.9, -209.8],
      [-571.2, -210.6], [-576.9, -215.5], [-577.8, -215.5], [-578.8, -214.9], [-579.4, -214.3], [-579.7, -213.3], [-579.5, -212.1]] },
  // the yellow block (1011 batches 11 and 8, 1012 batches 12 and 8): the back half, the front half on the Promenade,
  // the shaft over the roof, the low shop wing
  { id: 'yellowBack', house: 'yellow', osm: 'w123384614', base: -3.4, top: 13.67,
    ring: [[-551.6, -248.9], [-553.8, -251.1], [-551.0, -254.0], [-553.7, -256.3], [-556.1, -254.8], [-568.2, -241.2], [-569.7, -238.6],
      [-559.5, -233.7], [-553.6, -246.2], [-553.0, -246.8], [-553.4, -247.1]] },
  { id: 'yellow', house: 'yellow', osm: 'w123384614', base: -3.4, top: 13.38,
    ring: [[-551.6, -248.9], [-553.8, -251.1], [-550.8, -254.3], [-548.2, -251.7], [-545.9, -254.1], [-548.5, -256.7], [-543.3, -262.3],
      [-535.0, -254.6], [-547.2, -241.4], [-553.4, -247.1]] },
  { id: 'yellowShaft', house: 'yellow', osm: 'w123384614', base: -3.4, top: 19.69, shaft: true,
    ring: [[-548.2, -251.7], [-551.9, -255.4], [-549.6, -257.8], [-545.9, -254.1]] },
  { id: 'yellowWing', house: 'yellow', osm: 'w123384614', base: -3.5, top: 4.2,
    ring: [[-553.6, -246.2], [-559.5, -233.8], [-553.0, -230.5], [-551.3, -231.1], [-544.6, -244.2], [-547.2, -241.4]] },
  // the cream house and the grey one (1012 batch 3)
  { id: 'cream', house: 'cream', osm: 'w123384625', base: -4.0, top: 15.54,
    ring: [[-514.8, -270.4], [-515.6, -273.1], [-514.0, -273.5], [-514.6, -275.5], [-508.2, -277.3], [-505.8, -278.0], [-506.1, -278.6],
      [-493.3, -287.6], [-492.9, -286.9], [-487.5, -279.0], [-486.7, -279.6], [-484.9, -276.8], [-487.4, -275.1], [-493.2, -271.0],
      [-497.0, -269.4], [-501.7, -268.0], [-508.1, -266.1], [-507.9, -265.3], [-513.0, -264.0]] },
  { id: 'creamLow', house: 'cream', osm: 'w123384625', base: -4.0, top: 6.01,
    ring: [[-481.3, -281.3], [-485.7, -278.1], [-486.7, -279.6], [-487.5, -279.0], [-492.9, -286.9], [-487.9, -290.5]] },
  { id: 'grey', house: 'grey', osm: 'w123384636', base: -4.0, top: 15.36,
    ring: [[-467.6, -298.0], [-480.4, -300.0], [-482.5, -297.6], [-485.7, -300.5], [-491.4, -295.5], [-480.8, -280.6], [-467.0, -295.8]] },
  // the mint-green block (1012 batch 0): the podium on the slope (a strip round the block's south-east and north-east
  // sides), the end wings, the block, the stair's housing
  { id: 'mintPodium', house: 'mint', osm: 'w123382382', base: -9.5, top: 1.34,
    ring: [[-467.7, -277.0], [-455.8, -265.9], [-443.0, -279.7], [-442.5, -279.3], [-437.7, -284.4], [-438.4, -285.1], [-433.5, -290.4],
      [-437.6, -294.2], [-445.9, -297.2], [-437.7, -289.7], [-439.7, -287.6], [-455.5, -270.3], [-457.7, -268.1], [-467.6, -277.2]] },
  { id: 'mintNorth', house: 'mint', osm: 'w123382382', base: -9.5, top: 10.47,
    ring: [[-437.7, -289.7], [-448.0, -299.2], [-449.9, -297.1], [-439.7, -287.6]] },
  { id: 'mintSouth', house: 'mint', osm: 'w123382382', base: -9.5, top: 10.47,
    ring: [[-455.6, -270.4], [-465.8, -279.8], [-467.9, -277.5], [-457.7, -268.1]] },
  { id: 'mint', house: 'mint', osm: 'w123382382', base: -9.5, top: 12.67,
    ring: [[-457.2, -289.2], [-465.8, -279.8], [-455.5, -270.3], [-439.6, -287.5], [-449.9, -297.1], [-454.6, -292.0], [-451.5, -289.1],
      [-450.6, -290.1], [-448.0, -287.7], [-451.5, -283.9]] },
  { id: 'mintStair', house: 'mint', osm: 'w123382382', base: -9.5, top: 15.13, shaft: true,
    ring: [[-450.6, -290.1], [-451.5, -289.1], [-455.4, -292.8], [-458.0, -290.0], [-451.5, -283.9], [-448.0, -287.7]] },
  // the Raiffeisen's block (1746/1012 batch 7): its half on the Promenade and its half down the slope
  { id: 'raiffeisen', house: 'raiffeisen', osm: 'w225902143', base: -13.6, top: 19.13,
    ring: [[-412.4, -337.5], [-424.9, -324.1], [-410.3, -310.4], [-397.8, -323.8]] },
  { id: 'raiffeisenBack', house: 'raiffeisen', osm: 'w225902144', base: -13.6, top: 19.13,
    ring: [[-397.8, -323.8], [-410.3, -310.4], [-394.7, -295.9], [-382.2, -309.4]] },
  // the block of 1746/1012 batch 11: the Blue Lemon's house, the Haus Fortuna, the Ang'n Hus and its strip on the
  // Promenade, the low shops before and behind the link between them, the link, the low part before w123384637
  { id: 'lemon', house: 'lemon', osm: 'w123384640', base: -5.0, top: 9.76,
    ring: [[-405.7, -361.0], [-417.8, -372.4], [-400.3, -391.5], [-403.0, -394.0], [-400.0, -397.4], [-385.6, -384.2], [-390.8, -378.6]] },
  { id: 'fortuna', house: 'fortuna', osm: 'w123384629', base: -5.0, top: 15.97,
    ring: [[-405.7, -361.0], [-417.9, -372.6], [-428.8, -360.7], [-416.9, -349.8]] },
  { id: 'angn', house: 'angn', osm: 'w123384615', base: -5.0, top: 15.92,
    ring: [[-436.7, -333.7], [-445.1, -341.4], [-441.7, -346.4], [-442.0, -346.6], [-438.6, -350.3], [-437.9, -349.6], [-434.0, -353.9], [-425.4, -346.1]] },
  { id: 'angnStrip', house: 'angn', osm: 'w123384615', base: -5.0, top: 12.94,
    ring: [[-434.1, -331.3], [-436.7, -333.7], [-425.4, -346.1], [-422.8, -343.7]] },
  { id: 'shopsFront', house: 'shops', osm: 'w123384615', base: -5.0, top: 2.93,
    ring: [[-420.5, -346.2], [-422.8, -343.7], [-429.5, -349.8], [-431.8, -351.9], [-429.5, -354.4]] },
  { id: 'link', house: 'shops', osm: 'w123384615', base: -5.0, top: 10.0,
    ring: [[-429.2, -354.7], [-431.8, -351.9], [-434.0, -353.9], [-436.4, -351.3], [-434.1, -359.2]] },
  { id: 'shopsBack', house: 'shops', osm: 'w123384629', base: -5.0, top: 2.93,
    ring: [[-425.8, -364.0], [-427.8, -365.8], [-433.9, -359.1], [-429.3, -354.8], [-426.1, -358.3], [-428.8, -360.7]] },
  { id: 'podium', house: 'shops', osm: null, base: -5.0, top: 3.18,
    ring: [[-448.6, -334.6], [-443.6, -340.0], [-440.8, -337.4], [-434.1, -331.3], [-448.1, -315.3], [-449.1, -316.2]] }
];

// Promenade 60's hipped roof (1011 batch 2): its foot on the attic's outline (y 17.5 on the north side, 17.9 on the
// south side) and its ridge (y 22.1)
export const HIP = {
  foot: [[-555.9, 17.5, -172.4], [-559.8, 17.9, -158.7], [-542.5, 17.9, -153.8], [-538.7, 17.5, -167.5]],
  ridge: [[-553.0, 22.1, -164.3], [-545.4, 22.1, -162.1]]
};

export const PROMENADE_PLATZ = {
  // swissBUILDINGS3D's batches (their centres): left out of the streamed tiles
  exclude: [
    { x: -549.1, z: -163.1, r: 3 }, { x: -569.1, z: -217.9, r: 3 }, { x: -560.3, z: -244.9, r: 3 }, { x: -552, z: -238.7, r: 3 },
    { x: -544.3, z: -251.9, r: 3 }, { x: -548.9, z: -254.8, r: 2 }, { x: -491.2, z: -282.5, r: 3 }, { x: -450.7, z: -282.6, r: 3 },
    { x: -403.5, z: -316.8, r: 3 }, { x: -420.5, z: -356.5, r: 3 }
  ],
  // the grid the walls' material draws: every house's floors are stretched to it
  storey: 3.0,
  // a window (grid metres over its storey's foot) and its half width; the bays along a wall from its middle
  win: { lo: 0.9, hi: 2.3, half: 0.6 },
  bay: 2.7,
  // the walls facing the Promenade (their middle within `near` m of its centre line, facing it): the shops' glazing
  near: 13,
  // Promenade 60's southern part (OpenStreetMap's outline, not in the extracted survey): cut at the surveyed south wall
  p60Osm: [[-556.6, -175.1], [-536.6, -169.3], [-536.8, -168.1], [-536.2, -167.6], [-537.3, -163.8], [-538.4, -163.4], [-539.7, -159.2],
    [-539.0, -158.6], [-539.9, -154.5], [-541.5, -153.3], [-547.4, -132.1], [-547.9, -132.3], [-548.5, -130.1], [-551.2, -130.8],
    [-551.5, -129.6], [-560.3, -132.1], [-559.4, -135.2], [-567.1, -137.4], [-561.0, -158.7], [-561.8, -159.8], [-560.4, -164.9],
    [-559.7, -165.0], [-558.1, -168.8], [-558.9, -169.6], [-557.9, -174.0], [-556.9, -174.2]],
  // The balconies: on a part's wall (its index in partWalls, or 'front' / 'west'), from s0 to s1 m along it (a negative
  // s: from its far end), on the floors
  // `floors` (storeys over the shops: 1 the first), `depth` m out; `rail`: 'timber' (dark boards) or 'white' (a
  // plastered parapet)
  balconies: [
    // the cream house: the stacks on its west end and along the two west pieces of its front (the photographs from the
    // south-west)
    { part: 'cream', edge: 'west', s0: 0.4, s1: 6.0, floors: [1, 2, 3, 4], depth: 1.4, rail: 'timber' },
    { part: 'cream', edge: 0, s0: 0.5, s1: -0.3, floors: [1, 2, 3, 4], depth: 1.3, rail: 'timber' },
    { part: 'cream', edge: 2, s0: 0.3, s1: -0.5, floors: [1, 2, 3, 4], depth: 1.3, rail: 'timber' },
    // the Bike Academy's house: the bands of the first and second floor along the Promenade, the second deeper
    { part: 'bike', edge: 'front', s0: 0.5, s1: -0.5, floors: [1], depth: 0.8, rail: 'white' },
    { part: 'bike', edge: 'front', s0: 4.0, s1: -4.0, floors: [2], depth: 1.5, rail: 'white' },
    // the Blue Lemon's house: two timber balconies on its front
    { part: 'lemon', edge: 'front', s0: 4.0, s1: 8.0, floors: [1, 2], depth: 1.0, rail: 'timber' },
    { part: 'lemon', edge: 'front', s0: 17.5, s1: 21.5, floors: [1], depth: 1.0, rail: 'timber' },
    // the Ang'n Hus: a timber balcony under its eaves on the Promenade
    { part: 'angnStrip', edge: 'front', s0: 2.0, s1: -2.0, floors: [4], depth: 1.0, rail: 'timber' },
    // Promenade 60: a balcony over the shops on the Promenade
    { part: 'p60', edge: 'front', s0: 3.0, s1: -3.0, floors: [1], depth: 0.9, rail: 'white' }
  ],
  // The shops the module letters itself (js/shops-data.js's businesses: their boards sit on its walls, not on
  // OpenStreetMap's outlines): their OSM ids
  shops: ['n13367522730', 'n12109173093', 'n6184860858', 'n6184860857', 'n9443121573', 'n6187785506', 'n12071997512',
    'n12109173095', 'n4774889694', 'n12839278305', 'n6184866629', 'n6187778929', 'n6184860856'],
  // Promenade 60's door for the pizza mission (js/missions-data-gastro.js PIZZA_HEAVEN) and the Bar La Onda's
  // (js/missions-data-fun.js, js/missions-data-local.js): kept outside the walls
  doors: [[-559.1, -173.4], [-488.4, -306.5], [-486.6, -302.6], [-484.7, -304.2], [-486.7, -308.9]]
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

/** Does a wall face the Promenade (its middle near the centre line, facing it)? */
export function facesPromenade(F) {
  const [mx, mz] = onWall(F, F.len / 2);
  const p = promenadeNear(mx, mz);
  if (p.d > PROMENADE_PLATZ.near || p.d < 1e-6) return false;
  return (F.n[0] * (p.x - mx) + F.n[1] * (p.z - mz)) / p.d > 0.6;
}

/** Is a point (with a margin of `m` m round it) inside one of the parts other than `skip`? */
export function insideOther(x, z, skip, m = 0) {
  return PARTS.some((q) => q !== skip && !q.attic && (pointInRing(q.ring, x, z) || (m > 0 && nearRing(q.ring, x, z, m))));
}
// (within m of a ring's edges)
function nearRing(ring, x, z, m) {
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < m) return true;
  }
  return false;
}

/**
 * A wall of a part by its name in the balconies' list: 'front' its longest wall facing the Promenade, 'west' the
 * longest facing west (smaller x), or an index into partWalls
 */
export function namedWall(p, name) {
  const W = partWalls(p);
  if (typeof name === 'number') return W[name];
  const pick = (ok) => W.filter(ok).reduce((a, F) => (!a || F.len > a.len ? F : a), null);
  if (name === 'front') return pick(facesPromenade);
  if (name === 'west') return pick((F) => F.n[0] < -0.7);
  return null;
}

/** The outward ring of a polygon cut to the side of the line a→b where the side test s(x, z) ≥ 0 (Sutherland–Hodgman) */
export function clipRing(ring, a, b, keepLeft) {
  const side = ([x, z]) => ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) * (keepLeft ? 1 : -1);
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length], sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([Math.round((p[0] + (q[0] - p[0]) * t) * 100) / 100, Math.round((p[1] + (q[1] - p[1]) * t) * 100) / 100]);
    }
  }
  return out;
}

/** Promenade 60's southern part: OpenStreetMap's outline south of the surveyed south wall */
export function p60South() {
  const [, a, b] = part('p60').ring; // the south wall: from its west end to its east end
  // (keep the side away from the surveyed part: the side its centre is not on)
  const c = part('p60').ring.reduce((s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4], [0, 0]);
  const left = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
  return clipRing(PROMENADE_PLATZ.p60Osm, a, b, !left);
}

/** The outlines the player's walls stand on, per OpenStreetMap building (js/landmarks.js SURVEYED_FOOTPRINTS) */
export function groundOutlines() {
  const out = new Map();
  for (const p of PARTS) {
    if (!p.osm) continue;
    if (!out.has(p.osm)) out.set(p.osm, []);
    out.get(p.osm).push(p.ring);
  }
  out.get('w123380413').push(p60South());
  return out;
}

/** The parts standing on no OpenStreetMap outline of theirs (the module brings their walls' colliders) */
export const freeParts = () => PARTS.filter((p) => !p.osm && !p.attic);

/** Is a point inside one of the outlines the walls stand on? */
export const insideRow = (x, z) => [...groundOutlines().values()].flat().some((r) => pointInRing(r, x, z)) || freeParts().some((p) => pointInRing(p.ring, x, z));

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
