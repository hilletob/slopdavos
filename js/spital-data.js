// The Spital Davos (Promenade 4, 7270 Davos Platz; js/spital.js): its volumes, the floors' grid, the entrance hall, the
// murals and the signs. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1741/1001, batch 4, one building of 40 m from its lowest floor to the penthouse):
// the roofs' outlines and heights below are its flat roofs, each a prism down to the ground; heights in the world frame
// (y = m a.s.l. − 1558, js/davos-frame.js), set by the Rega pad on the west wing (1562.7 m, js/helipad.js). The forecourt
// with the car park lies at 1551 m (y −7), the valley side 16 m lower. The look after a photograph of the forecourt:
// board-marked concrete, windows in timber frames, the coloured reliefs on the ward block, the glazed entrance hall
// under its canopy with the lettering, the blue H.

export const SPITAL = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: -1109.8, z: 918.5, r: 8 },
  osm: 'w93469657',
  // The floors: 3.25 m each, counted down from the ward block's roof (the west wing's roof is three floors below it,
  // the rim round the block one)
  floors: { top: 12.45, storey: 3.25 },
  // How far down the walls reach (under the ground on the valley side)
  base: -27,
  // The volumes, each a flat roof at `top` over its outline (world x, z); `windows: false`: closed walls;
  // `collide`: walls OpenStreetMap's footprint lacks (the terraces towards the valley), for the player
  parts: [
    { id: 'terrace-south', top: -18.8, windows: false, collide: true, roof: 'terrace',
      ring: [[-1087.1, 937.1], [-1100.9, 939.4], [-1098.6, 953.0], [-1067.7, 947.8], [-1069.0, 940.1], [-1086.1, 943.0]] },
    { id: 'terrace-east', top: -18.05, windows: false, collide: true, roof: 'terrace',
      ring: [[-1087.1, 937.1], [-1089.0, 925.6], [-1061.8, 921.0], [-1062.2, 918.9], [-1060.6, 918.6], [-1057.3, 938.1], [-1086.1, 943.0]] },
    { id: 'north-annex', top: -4.05,
      ring: [[-1066.4, 894.2], [-1071.0, 895.0], [-1072.2, 888.3], [-1086.9, 890.8], [-1104.2, 893.7], [-1105.0, 888.9], [-1066.9, 882.4], [-1062.0, 911.5], [-1063.4, 911.7]] },
    { id: 'south-annex', top: -3.8,
      ring: [[-1113.7, 941.5], [-1115.2, 933.0], [-1098.1, 930.1], [-1098.6, 927.2], [-1089.0, 925.6], [-1087.1, 937.1]] },
    // (the Rega pad stands on this roof, js/helipad.js)
    { id: 'west-wing', top: 2.7,
      ring: [[-1129.1, 911.3], [-1133.8, 912.1], [-1133.3, 915.1], [-1143.4, 916.8], [-1152.4, 910.0], [-1161.7, 923.5], [-1145.5, 934.1], [-1116.0, 928.0], [-1115.2, 933.0], [-1098.1, 930.1], [-1098.6, 927.2], [-1099.1, 923.8], [-1101.5, 909.6], [-1128.6, 914.1]] },
    { id: 'rim', top: 9.2,
      ring: [[-1098.6, 927.2], [-1099.1, 923.8], [-1069.7, 918.9], [-1073.9, 893.6], [-1085.4, 895.6], [-1084.1, 903.7], [-1082.0, 903.3], [-1081.3, 907.4], [-1089.5, 908.8], [-1091.5, 896.9], [-1086.0, 896.0], [-1086.9, 890.8], [-1072.2, 888.3], [-1071.0, 895.0], [-1066.4, 894.2], [-1061.8, 921.0]] },
    { id: 'ward-block', top: 12.45,
      ring: [[-1086.0, 896.0], [-1086.9, 890.8], [-1104.2, 893.7], [-1099.1, 923.8], [-1069.7, 918.9], [-1073.9, 893.6], [-1085.4, 895.6], [-1084.1, 903.7], [-1082.0, 903.3], [-1081.3, 907.4], [-1089.5, 908.8], [-1091.5, 896.9]] },
    { id: 'penthouse', top: 15.2, windows: false,
      ring: [[-1089.5, 914.1], [-1099.4, 915.8], [-1100.6, 908.9], [-1090.6, 907.2]] }
  ],
  // The reliefs on the ward block: on the wall from `a` to `b` (its outer face seen from outside: a on the left), `at`
  // metres along it to the relief's left edge, `w` × `h` m, its foot at `y`; `clear`: the stretch of the wall kept
  // free of windows ([from, to] m along it). The atlas' cells: js/spital.js ATLAS
  murals: [
    // the west front over the car park: the sun, at its north end
    { key: 'sun', a: [-1104.2, 893.7], b: [-1099.1, 923.8], at: 0.9, w: 9.4, h: 11.6, y: 0.3, clear: [0, 11.2] },
    // ... and the star with its dot and crescent at the south end, over the entrance hall
    { key: 'star', a: [-1104.2, 893.7], b: [-1099.1, 923.8], at: 26.9, w: 2.9, h: 6.2, y: 4.4, clear: [26.2, 30.6] },
    // the north front: the two spirals and the blue dot
    { key: 'spirals', a: [-1086.9, 890.8], b: [-1104.2, 893.7], at: 1.4, w: 5.2, h: 4.2, y: 3.4, clear: [0, 8.0] }
  ],
  // The entrance hall before the west wing's north wall, on the forecourt: along the wall from `a` (the ward block's
  // corner) to `b`, from `from` to `to` m, `depth` m out; two glazed floors, the canopy over the doors
  hall: {
    a: [-1101.5, 909.6], b: [-1128.6, 914.1], from: 0.6, to: 25.6, depth: 3.6,
    floor: 3.3, top: 7.0, // the canopy's level and the hall's roof, over the forecourt
    canopy: { from: 6.4, to: 23.6, out: 2.6, thick: 0.5 },
    door: 15.2, doorWidth: 2.6, // (before the mission's door, js/missions-data-care.js CAST_DOOR)
    // the stele with the name and the blue H on its post, off the hall's west end (along the wall, out from it)
    stele: [27.6, 1.5], sign: [29.6, 2.4]
  }
};

/** A wall's frame: `u` along it (a → b, a on the left for someone looking at the wall from outside), `n` out of the
 *  building, its length */
export function wallFrame(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const u = [dx / len, dz / len];
  return { a, u, n: [-u[1], u[0]], len };
}
/** A ring turned so that its walls run as wallFrame wants them (the outside on −u.z, u.x) */
export const outwardRing = (ring) => (ringArea2(ring) < 0 ? ring : [...ring].reverse());
/** The world point `s` m along a wall and `out` m before it */
export const onWall = (f, s, out = 0) => [f.a[0] + f.u[0] * s + f.n[0] * out, f.a[1] + f.u[1] * s + f.n[1] * out];

/** Twice the signed area of a ring ([[x, z], …]) */
export function ringArea2(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; s += p[0] * q[1] - q[0] * p[1]; }
  return s;
}
export function pointInRing(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** The stretches of the wall a → b kept free of windows ([from, to] m along it), from the murals on that wall
 *  (either way round) */
export function clearStretches(a, b) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), out = [];
  for (const m of SPITAL.murals) {
    if (near(m.a, a) && near(m.b, b)) out.push([m.clear[0], m.clear[1]]);
    else if (near(m.a, b) && near(m.b, a)) out.push([len - m.clear[1], len - m.clear[0]]);
  }
  return out.sort((p, q) => p[0] - q[0]);
}

/** A wall cut into its stretches: [{ from, to, windows }] (the clear ones without windows) */
export function wallStretches(a, b, windows = true) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!windows) return [{ from: 0, to: len, windows: false }];
  const out = [];
  let at = 0;
  for (const [c0, c1] of clearStretches(a, b)) {
    const from = Math.max(at, Math.min(len, c0)), to = Math.max(from, Math.min(len, c1));
    if (from - at > 0.01) out.push({ from: at, to: from, windows: true });
    if (to - from > 0.01) out.push({ from, to, windows: false });
    at = to;
  }
  if (len - at > 0.01) out.push({ from: at, to: len, windows: true });
  return out;
}

const HALL = wallFrame(SPITAL.hall.a, SPITAL.hall.b);
export const hallFrame = () => HALL;
/** The spot before the hall's doors (world), a step out on the forecourt */
export const SPITAL_ENTRANCE = (() => { const [x, z] = onWall(HALL, SPITAL.hall.door, SPITAL.hall.depth + 1.2); return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 }; })();
