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
// ESE, the Eisbahn SSW and the Talstrasse WNW), the eaves sweeping down almost to the ground at the four corners between
// them. Heights over the arena floor (the terrain there, flat); read off swissBUILDINGS3D (tile 11/1747/1012, batches 1
// and 2: the apex 22.7 m, the gable tops 12.3–14.1 m, the corners and the outline at the ground).
export const EISSTADION = {
  id: 'eisstadion',
  name: 'Eisstadion Davos (Vaillant Arena)',
  apex: { x: -241.6, z: -312.5, h: 22.7 },
  // The outline, round from the south corner: corner, gable, corner, … (gables: the top `h`; plan: the outline's point
  // at the gable, which the gable's top stands `inset` m inside of)
  outline: [
    { corner: true, x: -246.3, z: -370.5 },
    { gable: 'NNE', x: -210.7, z: -359.1, h: 12.3 },
    { corner: true, x: -186.4, z: -331.0 },
    { gable: 'ESE', x: -201.5, z: -284.6, h: 13.9 },
    { corner: true, x: -230.9, z: -258.0 },
    { gable: 'SSW', x: -269.1, z: -270.2, h: 14.1 },
    { corner: true, x: -295.5, z: -300.3 },
    { gable: 'WNW', x: -283.9, z: -338.2, h: 13.9 }
  ],
  inset: 1.5,
  // The eaves at the corners, and the verges' convex kink (as in the photographs: steep near the corners, flatter up to
  // the gable): at `kinkAt` of the way from the corner to the gable, `kink` m over the straight line
  cornerH: 2.2, kinkAt: 0.38, kink: 2.6, thickness: 1.2,
  // The building under the roof: the OSM footprint (w37221744), its concrete base (stands, entrances) and the glass
  // walls above it up to the roof
  footprint: [
    [-285.5, -314.7], [-279.2, -339.4], [-267.3, -348], [-261, -351.3], [-248.7, -347.3], [-235.1, -360], [-214.2, -354.9],
    [-200.6, -338], [-208.6, -320.2], [-197.8, -311.1], [-204.1, -288.8], [-221, -273.5], [-233.9, -278.1], [-244.1, -269.3],
    [-266, -277.8], [-279.4, -294], [-276.1, -304.4]
  ],
  plinth: 4.5,
  // The north stand's glazed annex (2005, the "Nordside" restaurant and the boxes) in front of the NNE gable: the OSM
  // footprint's bay there, in two steps
  annex: { ring: [[-248.7, -347.3], [-235.1, -360], [-214.2, -354.9], [-200.6, -338]], low: 10.5, high: 14.0 },
  // swissBUILDINGS3D buildings it replaces (centres of the batch table, world x/z): the arena's roof (two batches, one
  // centre)
  exclude: [{ x: -240.9, z: -314.2, r: 2 }]
};

// The roof's corners in plan and height (the octagon with the verges' kinks): [{ x, z, h, kind }], round the outline
export function stadiumVerge(S = EISSTADION) {
  const n = S.outline.length, pts = [];
  const top = (g) => {
    const dx = g.x - S.apex.x, dz = g.z - S.apex.z, r = Math.hypot(dx, dz), k = (r - S.inset) / r;
    return { x: S.apex.x + dx * k, z: S.apex.z + dz * k, h: g.h, kind: 'gable', name: g.gable };
  };
  for (let i = 0; i < n; i++) {
    const p = S.outline[i], q = S.outline[(i + 1) % n];
    const a = p.corner ? { x: p.x, z: p.z, h: S.cornerH, kind: 'corner' } : top(p);
    const b = q.corner ? { x: q.x, z: q.z, h: S.cornerH, kind: 'corner' } : top(q);
    pts.push(a);
    // the kink, on the corner's side
    const t = a.kind === 'corner' ? S.kinkAt : 1 - S.kinkAt;
    pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: a.h + (b.h - a.h) * t + S.kink, kind: 'kink' });
  }
  return pts;
}

// The roof's facets: triangles [apex, verge i, verge i+1] in plan with heights
export function stadiumFacets(S = EISSTADION) {
  const v = stadiumVerge(S), A = S.apex;
  return v.map((p, i) => [{ x: A.x, z: A.z, h: A.h }, p, v[(i + 1) % v.length]]);
}

// The height of the roof's top over the arena floor at (x, z), or null outside the outline
export function stadiumRoofHeight(x, z, S = EISSTADION) {
  for (const [a, b, c] of stadiumFacets(S)) {
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
    const l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return l1 * a.h + l2 * b.h + l3 * c.h;
  }
  return null;
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

// Every swissBUILDINGS3D building the landmarks replace (js/swissbuildings3d.js excludeBuildings)
export const LANDMARK_EXCLUSIONS = [...EISSTADION.exclude, ...KONGRESS.exclude, ...PARSENN.exclude];
