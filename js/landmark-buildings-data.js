// Landmark buildings of Davos Platz rebuilt by hand (js/landmark-buildings.js): the Eisstadion (Vaillant Arena / the HCD's
// arena), the Kongresszentrum with the Kongress Hotel, the eau-là-là pool beside it, and the Natureisbahn. Pure data and
// geometry maths, shared by the browser module and the tests. World frame (js/davos-frame.js): x = LV95 E − 2782500,
// z = 1185500 − LV95 N, metres.
//
// Sources: swisstopo swissBUILDINGS3D 3.0 (data/swissbuildings3d, release 20260520) for the outlines and heights; the
// OpenStreetMap footprints (tools/data/cache/osm_davos.json: w37221744 Eisstadion, w219442526 / w219442529
// Kongresszentrum, w219442528 eau-là-là, w117012158 Kongress Hotel, w1304525522 / w262580839 the pitches of the
// Eisbahn); swisstopo SWISSIMAGE (wms.geo.admin.ch) for the roofs, the pool, the slide and the track; Mapillary street
// images (2013–2015) for the facades; for the architecture: Wikipedia (Zondacrypto/Vaillant Arena: a glued-laminated
// timber roof of 1979 on four concrete piers, the gables glazed in 1981), archiweb.cz / Degelo Architekten (the
// Kongresszentrum's extension 2010: a low building clad in larch, the entrance moved to the park) and davos.ch
// (eau-là-là: heated outdoor pool, the 80 m "Black Hole" slide).

// --- Eisstadion ------------------------------------------------------------------------------------------------------------
// The roof: two crossed gable roofs on an octagon, four glazed gables (towards the Kurgartenstrasse NNE, the car park
// ESE, the Eisbahn SSW and the Talstrasse WNW), the valleys between them running down to the four corners, where the
// roof rests on the concrete stands. swissBUILDINGS3D (tile 11/1747/1012, batches 1 and 2; LiDAR, revised 2022) models
// the arena as an open building — the roof alone — with its flat floor drawn at the roof's lowest point, 1547.7 m
// a.s.l.: 10.4 m over the ground (1537.3 m, the lowest terrain under the outline). The flat ring between the pitched
// roof and the outline is the stands' roof at that height (the orthophoto: the dark band round the roof, wide at the
// corners, a few metres at the gables). Measured from the eaves: the apex 22.7 m (1570.4 m a.s.l., 33.1 m over the
// ground), the gable tops 12.3–14.1 m (1560.0–1561.8 m, 22.7–24.5 m over the ground), the main ridge's kinks 16.7 m.
// All `h` below over the eaves; stadiumVerge / stadiumFacets / stadiumRoofHeight add `eaves` and give heights over the
// ground. (OSM w37221744 says height=16.5, a guess well under the survey.)
export const EISSTADION = {
  id: 'eisstadion',
  name: 'Eisstadion Davos (Vaillant Arena)',
  // the eaves (the stands' flat roofs, the pitched roof's lowest edge) over the ground at the foot
  eaves: 10.4,
  apex: { x: -241.6, z: -312.5, h: 22.7 },
  // The outline (the stands' outer wall), round from the south corner: corner, gable, corner, …; the gables with the
  // position of the top of the glazed gable (`top`, the end of the ridge) and its height
  outline: [
    { corner: true, x: -246.3, z: -370.5 },
    { gable: 'NNE', x: -210.7, z: -359.1, top: [-214.8, -353.9], h: 12.3 },
    { corner: true, x: -186.4, z: -331.0 },
    { gable: 'ESE', x: -201.5, z: -284.6, top: [-204.6, -288.1], h: 13.9 },
    { corner: true, x: -230.9, z: -258.0 },
    { gable: 'SSW', x: -269.1, z: -270.2, top: [-265.8, -275.4], h: 14.1 },
    { corner: true, x: -295.5, z: -300.3 },
    { gable: 'WNW', x: -283.9, z: -338.2, top: [-278.9, -336.6], h: 13.9 }
  ],
  // The pitched roof's edge, round from the south corner (the survey): [x, z, h] — the eaves points at the corners
  // (h 0; the middle one of each corner is the valley's foot) and the gable tops between them
  verge: [
    [-246.1, -269.0, 0], [-237.5, -277.0, 0], [-234.9, -279.3, 0], [-220.5, -274.0, 0],
    [-204.6, -288.1, 13.9], // ESE
    [-197.8, -309.6, 0], [-207.0, -319.4, 0], [-200.7, -338.0, 0],
    [-214.8, -353.9, 12.3], // NNE
    [-234.5, -360.5, 0], [-248.5, -347.0, 0], [-262.7, -350.5, 0],
    [-278.9, -336.6, 13.9], // WNW
    [-284.6, -316.8, 0], [-274.9, -305.5, 0], [-280.0, -286.6, 0],
    [-265.8, -275.4, 14.1] // SSW
  ],
  // The main ridge (WNW–ESE) is bent: the kinks a good 30 m off the apex
  kinks: [[-267.1, -329.0, 16.7], [-216.8, -296.1, 16.8]],
  // The roof's facets, the surveyed triangles: indices into [apex, …kinks, …verge]
  faces: [
    [18, 19, 17], [16, 1, 15], [2, 0, 5], [5, 0, 19], [4, 5, 19], [0, 1, 17], [3, 4, 19], [19, 0, 17], [17, 1, 16],
    [7, 2, 6], [2, 5, 6], [0, 2, 9], [13, 0, 11], [14, 1, 13], [15, 1, 14], [8, 2, 7], [9, 2, 8], [11, 0, 9], [1, 0, 13],
    [10, 11, 9], [12, 13, 11]
  ],
  thickness: 1.2,
  // The stands' glazed front all round (since the renovation of 2021; Wikimedia Commons, Vaillant Arena Davos 2022-09-25
  // 01–03): the ground floor set back behind square concrete piers under a ledge of concrete beams, the glass band from
  // the ledge to the eaves (heights over the foot); the lettering over the north stand's doors (the first edge)
  glazed: [0, 1, 2, 3, 4, 5, 6, 7],
  ground: { recess: 1.6, ledge: 3.0, glass: 3.7, pierStep: 6.5 },
  // the glazed gables stand this far inside the roof's edge (the overhang)
  glassInset: 1.0,
  // The north stand's glazed annex (2005, the "Nordside" restaurant and the boxes) in front of the NNE gable: the OSM
  // footprint's bay there (w37221744), the middle part of it rising over the stands' roof
  annex: { ring: [[-248.7, -347.3], [-235.1, -360], [-214.2, -354.9], [-200.6, -338]], from: 0.35, to: 0.65, high: 14.0 },
  // swissBUILDINGS3D buildings it replaces (centres of the batch table, world x/z): the arena's roof (two batches, one
  // centre)
  exclude: [{ x: -240.9, z: -314.2, r: 2 }]
};

// The roof's points with heights over the ground: [apex, …kinks, …verge] as { x, z, h, kind }
export function stadiumPoints(S = EISSTADION) {
  const pt = ([x, z, h], kind) => ({ x, z, h: S.eaves + h, kind });
  return [
    { x: S.apex.x, z: S.apex.z, h: S.eaves + S.apex.h, kind: 'apex' },
    ...S.kinks.map((k) => pt(k, 'kink')),
    ...S.verge.map((v) => pt(v, v[2] > 0 ? 'gable' : 'eaves'))
  ];
}

// The pitched roof's edge in plan and height over the ground, round the roof: [{ x, z, h, kind: 'eaves' | 'gable', name }]
export function stadiumVerge(S = EISSTADION) {
  const pts = stadiumPoints(S).slice(1 + S.kinks.length);
  for (const p of pts) if (p.kind === 'gable') p.name = S.outline.find((g) => g.gable && Math.hypot(g.top[0] - p.x, g.top[1] - p.z) < 0.5)?.gable;
  return pts;
}

// The roof's facets: triangles [{ x, z, h }, …] with heights over the ground
export function stadiumFacets(S = EISSTADION) {
  const P = stadiumPoints(S);
  return S.faces.map((f) => f.map((i) => P[i]));
}

// The height of the roof's top over the ground at (x, z): the pitched roof's facet there, the stands' flat roof (the
// eaves) elsewhere inside the outline, or null outside it
export function stadiumRoofHeight(x, z, S = EISSTADION) {
  for (const [a, b, c] of stadiumFacets(S)) {
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
    const l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return l1 * a.h + l2 * b.h + l3 * c.h;
  }
  return pointInRing(S.outline.map((p) => [p.x, p.z]), x, z) ? S.eaves : null;
}

// --- Kongresszentrum, Kongress Hotel, eau-là-là ---------------------------------------------------------------------------
// One swissBUILDINGS3D building (tile 11/1749/1014, batch 0, 1514 triangles: the whole complex with the hotel) plus the
// eau-là-là's west wing (11/1748/1014 batch 1) and the canopy over the passage to the park (11/1749/1015 batches 0 and
// 5). Their flat roofs, cut into the parts at one height each (h: over the complex's foot, the lowest ground under it;
// rings: world [x, z, x, z, …]), and what each part is:
//   gisel  — Ernst Gisel's congress house (1969, extended in stages): board-marked concrete, ribbon windows, its roofs
//            under rows of solar panels
//   hall   — the extension by Degelo (2010): the 1800-seat hall, a low box clad in vertical larch boards, the glazed
//            funnel of the main entrance towards the park and the Talstrasse under the overhanging roof
//   north  — the wing along the Promenade, larch over a curved concrete base
//   eau    — the eau-là-là (Promenade 90): dark timber, glazed towards the pool and the park (south-west)
//   hotel  — the Kongress Hotel (Promenade 94): white plaster, rows of windows with timber panels
//   canopy — the roof over the passage "Eingang Park" between the congress house and the pool
export const KONGRESS = {
  id: 'kongress',
  name: 'Kongresszentrum Davos, Kongress Hotel, eau-là-là',
  // the direction of Gisel's grid (the complex is turned 48° against the LV95 grid): the solar panels' rows
  gridAngle: 48 * Math.PI / 180,
  parts: [
    { kind: 'hotel', h: 35, ring: [177.1, -608.4, 180.6, -611.5, 177.3, -615.3, 173.8, -612.2] },
    { kind: 'hotel', h: 34.5, ring: [181.4, -618.8, 177.3, -615.3, 180.6, -611.5, 186.8, -617, 184.3, -619.8, 182.2, -618] },
    { kind: 'hotel', h: 32.5, ring: [172.8, -596.6, 180, -602.8, 180.7, -602, 189.4, -605.1, 198, -602.3, 198.5, -612.1, 199.2, -612.6, 199.6, -614.1, 198.3, -615.2, 198.1, -621.2, 190.5, -623.8, 185.7, -619.2, 177.8, -628.2, 165.2, -616.8, 166.4, -614.5, 160.9, -609.8] },
    { kind: 'gisel', h: 20.75, ring: [133.4, -603.5, 132.8, -612.1, 128.9, -608.6] },
    { kind: 'north', h: 20.5, ring: [120, -619.1, 118.3, -621, 117.9, -627.7, 59.2, -625.4, 59, -622.7, 61.1, -622.9, 61.1, -620.8, 59.5, -619.5, 57.8, -616.7, 56.8, -613.5, 56.7, -607.8, 53.7, -605.1, 57.6, -600.8, 60.4, -598.6, 63.8, -596.7, 67.8, -596.1, 68.1, -597.8, 71.4, -597.8, 76.3, -599.1, 79.1, -601.2, 88.3, -590.9] },
    { kind: 'gisel', h: 20.5, ring: [137.4, -607, 132.8, -612.1, 133.4, -603.5] },
    { kind: 'gisel', h: 19.75, ring: [149.5, -624.8, 133.9, -610.9, 152.7, -621.2] },
    { kind: 'gisel', h: 19.5, ring: [152.7, -621.2, 133.9, -610.9, 137.1, -607.3] },
    { kind: 'gisel', h: 18.75, ring: [118.7, -622, 118.3, -623.2, 124.3, -623.6, 126.1, -624.3, 126.7, -625.5, 126.6, -626.5, 124.3, -628, 118, -627.5, 118.2, -622] },
    { kind: 'hall', h: 18.5, ring: [125, -569.3, 155.8, -534.5, 124.1, -506.4, 124.9, -505.6, 170.2, -508.7, 172.9, -586.1, 147.3, -588.8] },
    { kind: 'gisel', h: 18.5, ring: [116.9, -596.4, 112, -592.1, 115.2, -588.5, 120.1, -592.9] },
    { kind: 'gisel', h: 18.25, ring: [125.8, -570, 111.8, -585.8, 104.3, -579.2] },
    { kind: 'gisel', h: 17.25, ring: [142.5, -601, 140.1, -598.9, 141.8, -596.9, 156.6, -610, 151.5, -615.7, 155.3, -619, 150.9, -624.1, 150.5, -623.7, 152.7, -621.2, 137.1, -607.3] },
    { kind: 'gisel', h: 16.75, ring: [112.1, -592, 110.5, -590.6, 104.3, -597.6, 92.1, -586.8, 101.6, -576.1, 104.7, -578.8, 104.3, -579.2, 111.8, -585.8, 112.1, -585.4, 117.4, -590.1, 115.2, -588.5] },
    { kind: 'eau', h: 16.5, ring: [124.5, -528.9, 104.6, -551.3, 94.5, -542.4, 114.4, -520] },
    { kind: 'gisel', h: 16, ring: [150.5, -623.7, 149.3, -625.5, 131.8, -624.1, 132.1, -621.9, 126.5, -621.4, 121.5, -617, 128.9, -608.7, 132.8, -612.1, 133.9, -610.9, 149.5, -624.8] },
    { kind: 'gisel', h: 16, ring: [142.5, -601, 137.3, -606.9, 133.4, -603.5, 134.6, -602.3, 135, -602.7, 139.8, -597.2, 140.8, -598.1, 140.1, -598.9] },
    { kind: 'eau', h: 15.25, ring: [105, -550.9, 105.8, -551.7, 99.3, -559, 84, -545.5, 96.5, -531.3, 100.9, -535.1, 94.5, -542.4, 104.6, -551.3] },
    { kind: 'gisel', h: 15, ring: [121.5, -617, 122.2, -617.5, 118.9, -621.2, 118.5, -620.8, 120, -619.1, 111.5, -611.6, 138.5, -581.1, 147.3, -588.8, 140.1, -597.4, 139.8, -597.2, 135, -602.7, 134.6, -602.3] },
    { kind: 'eau', h: 14.5, ring: [99.1, -558.9, 93.1, -565.7, 76, -550.6, 84.7, -540.9, 86.6, -542.5, 84, -545.5] },
    { kind: 'gisel', h: 13.75, ring: [125.3, -569, 118.7, -563.1, 137.2, -542.4, 143.7, -548.2] },
    { kind: 'gisel', h: 13.75, ring: [114.8, -594.6, 116.9, -596.4, 120.1, -592.9, 118, -591, 131.9, -575.3, 138.5, -581.1, 111.5, -611.6, 105, -605.7] },
    { kind: 'gisel', h: 13.5, ring: [150.2, -529.5, 144.8, -535.6, 129.2, -521.8, 134.6, -515.7] },
    { kind: 'eau', h: 13.5, ring: [105.7, -551.8, 118.5, -563.2, 104.7, -578.8, 91.7, -567.2, 81, -579.3, 68.1, -567.8, 65.4, -570.8, 59.7, -565.8, 76.9, -546.4, 78.5, -547.8, 76, -550.6, 93.1, -565.7] },
    { kind: 'gisel', h: 12.75, ring: [150.2, -529.5, 155.8, -534.5, 143.7, -548.2, 137.3, -542.5, 144, -535, 144.8, -535.6] },
    { kind: 'eau', h: 12.75, ring: [68.1, -567.8, 78.5, -577.1, 67.2, -589.8, 55.9, -579.8, 48.2, -580.1, 41.8, -587.6, 28, -575.3, 40.7, -561, 62.2, -559.9, 65.3, -556.4, 66.8, -557.7, 59.7, -565.8, 65.4, -570.8] },
    { kind: 'gisel', h: 12.5, ring: [111.5, -543.5, 123.2, -530.4, 136.9, -542.6, 125.3, -555.7] },
    { kind: 'gisel', h: 12.25, ring: [114.8, -594.6, 105, -605.7, 88.3, -590.9, 87.8, -591.4, 76.3, -581.2, 79.3, -577.8, 81, -579.3, 84.8, -575, 94.7, -583.8, 92.1, -586.8, 104.3, -597.6, 110.5, -590.6] },
    { kind: 'gisel', h: 12.25, ring: [128.6, -572.5, 131.9, -575.3, 118, -591, 112.1, -585.4, 125.5, -570.3, 128.3, -572.8] },
    { kind: 'gisel', h: 12, ring: [123.2, -530.4, 124.5, -528.9, 121, -525.8, 128, -518, 130.6, -520.2, 129.2, -521.8, 133.1, -525.3, 126.2, -533.1] },
    { kind: 'eau', h: 12, ring: [105, -550.9, 111.5, -543.5, 114.6, -546.2, 107.9, -553.8] },
    { kind: 'eau', h: 12, ring: [100.9, -535.1, 96.5, -531.3, 86.6, -542.5, 85.8, -541.9, 109.3, -515.4, 114.4, -520] },
    { kind: 'eau', h: 11.75, ring: [77.9, -582.6, 72.3, -588.9, 69.9, -586.8, 78.5, -577.1, 79.3, -577.8, 76.3, -581.2] },
    { kind: 'eau', h: 11.75, ring: [94, -569.3, 87.1, -577.1, 84.8, -575, 91.7, -567.2] },
    { kind: 'canopy', h: 11.5, ring: [68.2, -597.8, 67.2, -589.8, 69.9, -586.8, 72.3, -588.9, 77.9, -582.6, 87.8, -591.4, 79.1, -601.2, 76.3, -599.1, 71.4, -597.8] },
    { kind: 'eau', h: 9.25, ring: [60, -583.5, 50, -594.8, 41.8, -587.6, 48.2, -580.1, 55.9, -579.8] }
  ],
  // The hall's main entrance: the glazed funnel in the middle of its south front (the edge of the hall's ring nearest
  // the Talstrasse), `from`–`to` along that edge, and the roof's overhang there
  entrance: { from: 0.32, to: 0.62, overhang: 3.5 },
  // The eau-là-là's glazing: its walls facing the pool and the park (outward normal within 55° of south-west)
  eauGlassDir: [-0.749, 0.664],
  // The heated outdoor pool (an oval; centre, half-axes, turned about y) with its whirlpool, and the slide's helix
  // beside the pool hall (SWISSIMAGE)
  pool: { x: 89.4, z: -521.6, a: 9.2, b: 6.8, yaw: -0.12 },
  whirlpool: { x: 97.0, z: -524.0, r: 2.0 },
  slide: { x: 119.5, z: -515.5, r: 4.0, turns: 2.25, top: 11.5, bottom: 1.2, tube: 0.65 },
  exclude: [
    { x: 114.7, z: -566.5, r: 2 }, // the complex with the hotel
    { x: 50.9, z: -587.3, r: 1.5 }, // the eau-là-là's west wing
    { x: 77.5, z: -591.9, r: 1.5 }, { x: 67.8, z: -593.8, r: 1.5 } // the canopy
  ]
};

// --- Natureisbahn ----------------------------------------------------------------------------------------------------------
// Europe's largest natural ice rink (18 000 m², since 1894; Talstrasse 41): in winter the running track, the football
// pitch inside it and the hard court beside it lie under ice; in summer they are the sports ground (the orthophoto).
// The track's outline: a 400 m stadium shape fitted to SWISSIMAGE (centre, long axis, half the straights, radius).
export const EISBAHN = {
  track: { x: -271.5, z: -162.5, ux: 0.551, uz: -0.835, half: 44.5, r: 44.0 },
  court: [[-303.3, -199.4], [-333.9, -223.6], [-370.8, -177.1], [-340.2, -153]]
};

export function trackOutline(t = EISBAHN.track, n = 24) {
  const vx = -t.uz, vz = t.ux, pts = [];
  for (const s of [1, -1]) {
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + Math.PI * i / n;
      const lx = s * (t.half + t.r * Math.cos(a)), lz = s * t.r * Math.sin(a);
      pts.push([t.x + t.ux * lx + vx * lz, t.z + t.uz * lx + vz * lz]);
    }
  }
  return pts;
}

// --- Polygon helpers ------------------------------------------------------------------------------------------------------
export const ringPoints = (flat) => { const p = []; for (let i = 0; i < flat.length; i += 2) p.push([flat[i], flat[i + 1]]); return p; };
export function pointInRing(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function ringArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

// --- Parsennbahn, Talstation Davos Dorf ------------------------------------------------------------------------------------
// The funicular's valley station (Promenade 157, OSM w219434717; the station node n286674751 at its north-west corner):
// the parts of the swissBUILDINGS3D building (tile 11/1752/1022, batch 11, ground 1552 m ellipsoidal) with their roof
// heights over the ground: the main block along the Promenade (flat roof, 15 m), the low wing at its north-east end (the
// end towards the Bahnhofstrasse, 9.4 m), the funicular's hall behind them (its roof falling towards the Promenade, a
// height per corner), the west block (17.6 m) and its sloping south-west end. The look from a night photograph of the
// Promenade (elektron.ch): white walls with red window frames and red-white bands, the glazed shop on the ground floor,
// the "DAVOS KLOSTERS mountains" lettering on the end towards the Bahnhofstrasse, the banner "EIN HOCH AUF DAS TIEF" over
// the shop, the blue-white "parsenn" entrance and the tall "Parsenn" flags on the roof.
export const PARSENN = {
  parts: [
    { kind: 'main', h: 15.0, ring: [644.3, -1427.0, 654.6, -1419.5, 676.0, -1449.0, 666.1, -1456.1, 654.9, -1440.7, 649.8, -1444.3, 645.7, -1438.8, 650.4, -1435.4] },
    { kind: 'wing', h: 9.4, ring: [644.6, -1448.5, 654.9, -1440.7, 666.1, -1456.1, 674.2, -1450.3, 677.4, -1454.5, 669.7, -1459.6, 661.3, -1460.9, 655.2, -1465.0, 653.5, -1465.3, 650.3, -1465.5, 648.0, -1463.7, 653.6, -1459.6] },
    { kind: 'hall', h: 15.5, ring: [626.2, -1441.3, 644.6, -1427.4, 650.4, -1435.4, 645.7, -1438.8, 649.8, -1444.3, 654.9, -1440.7, 644.6, -1448.5, 653.6, -1459.6, 648.0, -1463.7, 629.1, -1440.2],
      roof: [15.5, 10.2, 10.2, 11.6, 11.6, 10.2, 13.1, 13.0, 14.6, 14.8] },
    { kind: 'west', h: 17.6, ring: [621.4, -1446.3, 629.1, -1440.2, 648.0, -1463.7, 648.3, -1464.2, 640.7, -1470.3, 635.3, -1463.7, 628.1, -1454.7] },
    { kind: 'west', h: 18.6, ring: [616.1, -1457.6, 624.4, -1449.9, 627.4, -1453.8, 619.4, -1461.2], roof: [18.6, 15.9, 16.0, 18.6] }
  ],
  // The street fronts (outward normals): the Promenade's side and the end towards the Bahnhofstrasse, glazed below
  fronts: [[0.81, 0.59], [0.58, -0.81]],
  // The end towards the Bahnhofstrasse: the main block's (a → b, above the wing) and the wing's below it
  endMain: [[676.0, -1449.0], [666.1, -1456.1]],
  endWing: [[677.4, -1454.5], [669.7, -1459.6]],
  exclude: [{ x: 647.1, z: -1444.9, r: 2 }]
};

// The platform canopies of the stations (swissBUILDINGS3D top triangles: x, y, z per corner, y the engine height)
// (Davos Dorf's canopy runs on along the next building to the north-east, as OSM's roof w1461939840 and the orthophoto have
// it; the survey ends at the block: the last four triangles, at the survey's slope)
const CANOPY_DORF = [909.9, 8.53, -1583.5, 909.5, 8.56, -1583.7, 901.8, 8.6, -1573.3, 901.8, 8.6, -1573.3, 909.5, 8.56, -1583.7, 898.7, 8.84, -1575.3, 898.7, 8.84, -1575.3, 909.5, 8.56, -1583.7, 909.9, 8.84, -1592.3, 909.9, 8.84, -1592.3, 909.5, 8.56, -1583.7, 913.4, 8.57, -1590, 909.5, 8.56, -1583.7, 914.6, 8.56, -1591.4, 913.4, 8.57, -1590, 913.4, 8.57, -1590, 914.6, 8.56, -1591.4, 926.6, 8.58, -1610.3, 923.2, 8.84, -1612.5, 926.6, 8.58, -1610.3, 929.8, 8.84, -1622.3, 930.1, 8.84, -1622.8, 929.8, 8.84, -1622.3, 937.5, 8.26, -1618, 929.8, 8.84, -1622.3, 926.6, 8.58, -1610.3, 937.5, 8.26, -1618, 937.5, 8.26, -1618, 926.6, 8.58, -1610.3, 922.6, 8.26, -1595.3, 926.6, 8.58, -1610.3, 914.6, 8.56, -1591.4, 922.6, 8.26, -1595.3, 914.6, 8.56, -1591.4, 914.9, 8.54, -1591.2, 922.6, 8.26, -1595.3, 914.9, 8.54, -1591.2, 909.9, 8.53, -1583.5, 922.6, 8.26, -1595.3, 909.9, 8.53, -1583.5, 901.8, 8.6, -1573.3, 922.6, 8.26, -1595.3, 922.6, 8.26, -1595.3, 901.8, 8.6, -1573.3, 887.1, 8.26, -1541.3, 889.8, 8.84, -1561.9, 879.5, 8.84, -1546.2, 892.7, 8.62, -1560, 879.5, 8.84, -1546.2, 887.1, 8.26, -1541.3, 892.7, 8.62, -1560, 887.1, 8.26, -1541.3, 901.8, 8.6, -1573.3, 892.7, 8.62, -1560, 937.5, 8.26, -1618, 969.3, 8.26, -1667.4, 966.6, 8.6, -1669.3, 937.5, 8.26, -1618, 966.6, 8.6, -1669.3, 936.4, 8.6, -1622.8, 937.5, 8.26, -1618, 936.4, 8.6, -1622.8, 930.1, 8.84, -1622.8, 936.4, 8.6, -1622.8, 929.8, 8.84, -1622.3, 930.1, 8.84, -1622.8];
const CANOPY_PLATZ = [-581.9, -11.43, 385.4, -590.1, -10.85, 398.9, -579.6, -10.79, 386.9, -579.6, -10.79, 386.9, -590.1, -10.85, 398.9, -577.6, -11.43, 388.3, -590.1, -10.85, 398.9, -598.4, -10.84, 411.3, -577.6, -11.43, 388.3, -598.4, -10.84, 411.3, -603.6, -10.84, 419.2, -577.6, -11.43, 388.3, -624.6, -11.02, 453.4, -577.6, -11.43, 388.3, -620.9, -11.01, 447.6, -621.6, -10.9, 447.1, -620.9, -11.01, 447.6, -613.3, -10.91, 434.8, -620.9, -11.01, 447.6, -577.6, -11.43, 388.3, -613.3, -10.91, 434.8, -577.6, -11.43, 388.3, -603.6, -10.84, 419.2, -613.3, -10.91, 434.8, -603.6, -10.84, 419.2, -613.5, -10.83, 434.1, -613.3, -10.91, 434.8, -613.3, -10.91, 434.8, -613.5, -10.83, 434.1, -613.8, -10.83, 434.5, -633.7, -11.44, 439.4, -625.3, -11.44, 426.8, -636, -11.44, 437.9, -640.5, -11.44, 451, -643.3, -11.44, 449.2, -654, -11.44, 471.2, -647, -11.35, 475.9, -648.4, -10.82, 486.4, -643.1, -10.82, 478.5, -643.1, -10.82, 478.5, -648.4, -10.82, 486.4, -642.9, -10.85, 478.6, -642.9, -10.85, 478.6, -648.4, -10.82, 486.4, -642.8, -10.86, 478.7, -642.8, -10.86, 478.7, -648.4, -10.82, 486.4, -642.8, -10.86, 478.7, -629.1, -10.89, 458.3, -642.5, -10.87, 478.2, -628.4, -10.99, 458.8, -628.4, -10.99, 458.8, -642.5, -10.87, 478.2, -628.1, -11.01, 458.9, -642.5, -10.87, 478.2, -642.8, -10.86, 478.7, -628.1, -11.01, 458.9, -624.6, -11.02, 453.4, -628.1, -11.01, 458.9, -577.6, -11.43, 388.3, -577.6, -11.43, 388.3, -628.1, -11.01, 458.9, -688.7, -10.87, 558.3, -628.1, -11.01, 458.9, -642.8, -10.86, 478.7, -688.7, -10.87, 558.3, -642.8, -10.86, 478.7, -648.4, -10.82, 486.4, -688.7, -10.87, 558.3, -688.7, -10.87, 558.3, -648.4, -10.82, 486.4, -693.9, -10.79, 554.8, -693.9, -10.79, 554.8, -648.4, -10.82, 486.4, -696.8, -11.44, 552.8, -696.8, -11.44, 552.8, -648.4, -10.82, 486.4, -652.8, -11.44, 483.2, -648.4, -10.82, 486.4, -647, -11.35, 475.9, -652.8, -11.44, 483.2, -647, -11.35, 475.9, -647.5, -11.42, 475.6, -652.8, -11.44, 483.2, -647.5, -11.42, 475.6, -647.7, -11.44, 475.4, -652.8, -11.44, 483.2, -647.7, -11.44, 475.4, -654, -11.44, 471.2, -652.8, -11.44, 483.2, -652.8, -11.44, 483.2, -654, -11.44, 471.2, -661.6, -11.44, 477, -654, -11.44, 471.2, -643.3, -11.44, 449.2, -661.6, -11.44, 477, -661.6, -11.44, 477, -643.3, -11.44, 449.2, -628.1, -11.44, 424.9, -643.3, -11.44, 449.2, -636, -11.44, 437.9, -628.1, -11.44, 424.9, -636, -11.44, 437.9, -625.3, -11.44, 426.8, -628.1, -11.44, 424.9, -628.1, -11.44, 424.9, -625.3, -11.44, 426.8, -618.4, -11.44, 431, -625.3, -11.44, 426.8, -618.5, -11.44, 431.3, -618.4, -11.44, 431, -618.5, -11.44, 431.3, -613.8, -10.84, 434.4, -618.4, -11.44, 431, -613.8, -10.84, 434.4, -613.5, -10.83, 434.1, -618.4, -11.44, 431, -618.4, -11.44, 431, -613.5, -10.83, 434.1, -608.4, -11.43, 416, -613.5, -10.83, 434.1, -603.6, -10.84, 419.2, -608.4, -11.43, 416, -608.7, -11.43, 405, -613.4, -11.43, 412.7, -606.6, -11.43, 406.3, -613.4, -11.43, 412.7, -608.4, -11.43, 416, -606.6, -11.43, 406.3, -606.6, -11.43, 406.3, -608.4, -11.43, 416, -603.1, -11.43, 408.4, -608.4, -11.43, 416, -603.6, -10.84, 419.2, -603.1, -11.43, 408.4, -603.6, -10.84, 419.2, -598.4, -10.84, 411.3, -603.1, -11.43, 408.4, -603.1, -11.43, 408.4, -598.4, -10.84, 411.3, -596, -11.43, 397.4, -598.4, -10.84, 411.3, -590.1, -10.85, 398.9, -596, -11.43, 397.4, -590.1, -10.85, 398.9, -581.9, -11.43, 385.4, -596, -11.43, 397.4];

// --- Bahnhof Davos Dorf ----------------------------------------------------------------------------------------------------
// The RhB station (Bahnhofstrasse 8 / 8b, OSM w111016579, w758933266): the swissBUILDINGS3D buildings of tiles
// 11/1754/1023 and 1024 (2014 survey; heights over the platform, the lowest ground under the block): the four-storey
// block over the station's ground floor (flat roof 15.4 m), the long low station building to its south-west (7.4 m,
// its roof running on into the platform canopy), the link between them (7.2 m) and the canopy over the house platform
// (the survey's "Flugdach": 7.4 m at the wall, 6.9 m at the platform edge; its top triangles as they come, world
// x, y, z with y the engine height). The look from the RhB's photograph of the platform: the block clad in fine white
// tiles, its windows in red-brown frames, some behind red-brown roller shutters, a stack of glazed loggias with
// red-brown parapets on the track side; the station building rendered white over a grey plinth, its windows and doors
// under the steel canopy with its raking brackets, the blue name plate and the clock.
export const DORF = {
  block: { h: 15.4, ring: [903.4, -1596.5, 913.4, -1590.0, 926.6, -1610.3, 916.5, -1616.9, 911.8, -1609.7, 910.6, -1610.4, 908.5, -1607.2, 909.8, -1606.3] },
  station: { h: 7.4, ring: [892.5, -1558.7, 909.6, -1584.8, 899.0, -1591.8, 881.9, -1565.7] },
  link: { h: 7.2, ring: [903.7, -1596.4, 912.3, -1590.7, 908.2, -1584.6, 899.6, -1590.1] },
  // the track side (the outward normal of the platform fronts)
  track: [0.84, 0.55],
  canopy: CANOPY_DORF,
  exclude: [{ x: 895.8, z: -1575.3, r: 1.5 }, { x: 908.5, z: -1582.1, r: 1.5 }, { x: 907.3, z: -1590.0, r: 1.5 }, { x: 915.0, z: -1603.5, r: 1.5 }]
};

// --- Bahnhof Davos Platz ---------------------------------------------------------------------------------------------------
// Rudolf Gaberel's station of 1947–49 (Talstrasse 4, OSM w712452961; listed, category B). swissBUILDINGS3D has it only as
// an open building (tile 11/1744/1005 batch 0, "Flugdach": its roofs, nothing under them), the platform canopies with
// it; the heights over the station square (the lowest ground under the footprint): the one-storey base along the whole
// street front, its flat roof 6.45 m, the two-storey north-east block and the south-west wing standing on it (10.7 m),
// the tall hall between them (14.2 m) all but flush with the street. The look from the photograph on Wikimedia Commons
// (Davos_Platz_Bahnhof_1K4A3198): cream-yellow render, white pilasters and window frames, a copper-brown band where the
// upper walls meet the base's roof, the hall's street front one great grid of windows over a ribbed plinth, the name
// plate on the north-east block, "Rhätische Bahn" over the hall's doors and the kiosk at the north-east end.
export const PLATZ = {
  base: { h: 6.45, ring: [-628.1, 424.9, -613.3, 434.8, -621.6, 447.1, -620.9, 447.6, -628.1, 458.9, -629.1, 458.3, -642.9, 478.6, -647.0, 475.9, -652.8, 483.2, -661.6, 477.0] },
  blocks: [
    { kind: 'block', h: 10.7, ring: [-613.3, 434.8, -621.6, 447.1, -633.7, 439.4, -625.3, 426.8] },
    { kind: 'hall', h: 14.2, ring: [-636.0, 437.9, -620.9, 447.6, -628.1, 458.9, -643.3, 449.2] },
    { kind: 'block', h: 10.7, ring: [-654.0, 471.2, -642.9, 478.6, -629.1, 458.3, -640.5, 451.0] }
  ],
  // the street front (outward normal)
  street: [-0.841, -0.541],
  // the platform canopies the survey draws with it (top triangles, world x, y, z; y the engine height)
  canopy: CANOPY_PLATZ,
  exclude: [{ x: -637.1, z: 471.9, r: 1.5 }]
};

// --- Arkadenplatz, Kulturplatz Davos ---------------------------------------------------------------------------------------
// The square on the Promenade (OSM w110590701, "Roter Arkadenplatz", over the underground car park) with the arcaded
// wings on its north (Promenade 58) and south sides and the Kulturplatz (Promenade 58C) closing it to the east. The
// wings' roofs from swissBUILDINGS3D (tile 11/1745/1010, batches 13 and 3; heights over the square's level), the look
// from the Kulturplatz's visualisation (kulturplatz-davos.ch): white rendered wings on tall square piers, a frieze with
// painted panels over the arcades, red shop fronts behind them; the Kulturplatz a long brick hall between concrete
// pilasters, glazed in its middle bays, under a light frieze; the square paved red, open to the Promenade, parasols over
// the café tables.
export const ARKADEN = {
  // the square (its paving) and the level of the square over the engine's zero
  square: [-572.9, -112.2, -541.3, -103.2, -539.2, -101.8, -538.5, -100.4, -538.2, -98.6, -538.1, -96.9, -549.9, -55.5, -551.3, -54.5, -553.3, -54.4, -556.5, -54.9, -586.7, -63.3],
  level: -1.6,
  // the paving's top over the ground: it lies on the terrain, over the pedestrian area's overlay (js/city-grid.js, at the
  // roads' height); cars drive on it, people walk on it
  paving: 0.18,
  wings: [
    // the north wing (Promenade 58): its arcade along the square from the Promenade round the curved corner
    { kind: 'arcade', h: 9.9, ring: [-573.5, -113.0, -539.9, -103.3, -538.6, -102.2, -537.5, -100.4, -537.0, -98.5, -522.4, -94.2, -519.5, -104.0, -525.7, -114.7, -569.4, -127.4], arcade: [0, 4], street: [8, 0] },
    // the south wing, along the square to the Kulturplatz
    { kind: 'arcade', h: 9.65, ring: [-587.1, -62.5, -581.9, -48.8, -556.9, -41.5, -553.9, -38.4, -550.6, -36.8, -537.1, -43.4, -549.7, -54.8, -550.9, -53.7, -552.9, -53.1, -554.9, -53.2], arcade: [6, 10] },
    { kind: 'arcade', h: 9.4, ring: [-582.4, -47.4, -581.9, -48.8, -587.1, -62.5, -590.8, -49.8] },
    // the Kulturplatz: its front the edge towards the square (from the south wing to the north wing)
    { kind: 'brick', h: 9.4, ring: [-549.7, -54.8, -536.7, -99.5, -536.4, -98.8, -522.7, -94.8, -521.4, -99.3, -520.9, -99.2, -537.1, -43.4], front: 0 }
  ],
  arcadeDepth: 3.4, arcadeHigh: 7.2, pier: 0.9, pierStep: 3.4,
  // the parasols (SWISSIMAGE)
  parasols: [[-571.2, -93.4], [-574.8, -79.0], [-553.8, -80.8], [-561.4, -74.8]],
  exclude: [{ x: -546.6, z: -110.8, r: 1.5 }, { x: -555.7, z: -67.8, r: 1.5 }]
};

// --- The stations' platforms ------------------------------------------------------------------------------------------------
// Raised 0.35 m over the ground and walked on (js/terrain.js addRaisedSidewalk). Davos Dorf: the OSM platforms (w758933265,
// the house platform, and w1461939839, the narrow one between tracks 1 and 2); Davos Platz, which OSM lacks: the island
// platform under its canopy (w712452971) and the house platform from the canopy's track-side edge (w113626474) 6 m in
// towards the station. Every edge pushed to 1.45 m or more from the tracks' centrelines (a metre-gauge car is 2.65 m
// wide); `track`: the edges along a track (the white line, the edge stones). (Davos Dorf's house platform reaches 2.3 m
// further in than OSM's, under the surveyed walls: no strip of bare ground between them)
export const PLATFORM_RISE = 0.35;
export const PLATFORMS = [
  { ring: [991.2, -1701, 873.61, -1519.98, 866.93, -1510.18, 862.17, -1513.26, 925.57, -1610.96, 925.87, -1610.86, 986.47, -1704.17], track: [0, 1] },
  { ring: [881.1, -1525.4, 992.01, -1695.19, 993.49, -1694.44, 882.25, -1524.66], track: [0, 2] },
  { ring: [-668.9, 541.6, -663.9, 544.9, -600.1, 447.3, -594.9, 438.5, -591.3, 431.5, -584.6, 417.5, -587, 416.1], track: [1, 2, 3, 4, 6] },
  { ring: [-577.6, 388.5, -689.9, 558.9, -694.92, 555.62, -648.62, 486.92, -644.12, 479.52, -582.62, 385.22], track: [0] }
];

// Every swissBUILDINGS3D building the landmarks replace (js/swissbuildings3d.js excludeBuildings)
export const LANDMARK_EXCLUSIONS = [...EISSTADION.exclude, ...KONGRESS.exclude, ...PARSENN.exclude, ...DORF.exclude, ...PLATZ.exclude, ...ARKADEN.exclude];
