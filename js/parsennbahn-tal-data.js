// The Parsennbahn's valley station in Davos Dorf (Promenade 157, 7260 Davos Dorf; OSM w219434717, the station node
// n286674751 at its north-west corner; js/parsennbahn-tal.js): its volumes, the floors' grid, the shop front and the
// entrance, the bands, the lettering and the flags. Pure data and frame maths, shared by the browser module, the tests
// and js/landmark-buildings-data.js (PARSENN, the outlines as the older tests read them).
//
// Sources: swissBUILDINGS3D (tile 11/1752/1022, batch 11, its floor at y −3.07): the roofs' outlines and heights below,
// each a prism down to the ground; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The station
// stands on the slope at the foot of the Parsenn: the Promenade before its east-south-east front at y −3.1 to −2.1, the
// ground climbing to +5 along its north side and to +18 behind its west end. Its parts: the main block along the
// Promenade (flat roof 11.99), the low wing round its north-east end and along its back (6.34; at the north-east end the
// entrance pavilion), the funicular's hall behind them (its roof falling towards the Promenade, a height per corner),
// the west block up the slope (14.57) and its sloping west end. The track runs in under the hall from the west, all in
// the cut below the ground (js/funicular-track.js; the station's platform is the mission's, js/missions-parsenn.js).
//
// The look after Mapillary's street views of 2013–2015 (CC BY-SA): from the south-east (2014, the best two) the
// Promenade front's north end and the north-east end: white walls with red-orange window frames, the dark-brown band
// along the roof's edge with a red socket under each flagpole, the cantilevered balcony band with its blue and yellow
// stripes over the shop, a blue stripe along the top floor's foot, "DAVOS KLOSTERS mountains" on the north-east end, the
// pavilion before it with the entrance under "parsenn" and its star, the tall blue "parsenn" banners on the roof; from
// the north-east (2015, down the Promenade) the north-east end with its three banners and the row of banners along the
// Promenade front; from the east (2013, 2014, behind the Seehof Seeli) the long front. The west block, the hall's walls
// and the wing's north side towards the ramp are guessed (no photograph shows them).
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const PARSENNBAHN_TAL = {
  osm: 'w219434717',
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: 647.1, z: -1444.9, r: 3 },
  floor: -3.07, // the survey's floor (the lowest ground under the building)
  // The floors of the main block: the shop's floor on the Promenade, then three floors of `storey`, the top floor's top
  // at `line` (its windows' grid counts down from it); the dark band from `line` to over the roof
  storey: 3.0,
  line: 11.2,
  shopTop: 2.2, // the shop's ceiling (the first floor's foot)
  band: { y0: 11.2, y1: 12.35, out: 0.18 },
  // The volumes. `ring`: [x, z] or, for a sloping roof, [x, z, roof height]; `top` a flat roof's height. `skin`:
  // 'windowed' (the floors' windows), 'closed' (plain white walls: the hall's, the wing's)
  parts: [
    { id: 'main', kind: 'main', top: 11.99, skin: 'windowed',
      ring: [[644.3, -1427.0], [654.5, -1419.5], [675.9, -1448.9], [666.1, -1456.1], [654.9, -1440.6], [649.8, -1444.3], [645.7, -1438.7], [650.4, -1435.3]] },
    { id: 'wing', kind: 'wing', top: 6.34, skin: 'closed',
      ring: [[644.6, -1448.5], [654.9, -1440.7], [666.1, -1456.1], [674.2, -1450.2], [677.4, -1454.4], [669.7, -1459.5], [661.3, -1460.9], [655.2, -1464.9],
        [653.5, -1465.3], [650.2, -1465.4], [647.9, -1463.7], [653.5, -1459.6]] },
    // (the survey's outline doubles back on itself between 649.8/−1444.3 and 654.9/−1440.7: the spike is left out)
    { id: 'hall', kind: 'hall', skin: 'closed',
      ring: [[626.2, -1441.3, 12.4], [644.6, -1427.4, 7.2], [650.4, -1435.4, 7.2], [645.7, -1438.8, 8.5], [649.8, -1444.3, 8.5], [644.6, -1448.5, 10.1],
        [653.5, -1459.6, 10.0], [647.9, -1463.7, 11.5], [629.1, -1440.1, 11.7]] },
    { id: 'west', kind: 'west', top: 14.57, skin: 'windowed', line: 14.3,
      ring: [[621.4, -1446.3], [629.1, -1440.1], [647.9, -1463.7], [648.3, -1464.2], [640.6, -1470.3], [635.3, -1463.6], [628.1, -1454.6]] },
    { id: 'west-end', kind: 'west', skin: 'closed',
      ring: [[616.1, -1457.5, 15.6], [624.3, -1449.9, 12.8], [627.4, -1453.8, 12.9], [619.4, -1461.1, 15.6]] }
  ],
  // The walls named below, a on the left for someone standing before them (wallFrame: the outside on (−u.z, u.x))
  // The Promenade front (facing east-south-east): the shop glazed under the balcony band
  shop: { a: [654.5, -1419.5], b: [675.9, -1448.9], glass: [-1.9, 1.85] },
  // The balcony band along the second floor (its foot at `y`), `out` before the front, its parapet `rail` high
  balcony: { y: 5.2, out: 1.5, rail: 1.1 },
  // The blue stripe at the top floor's foot, round the Promenade front and the north-east end
  stripe: 8.2,
  // The pavilion's front on the Promenade (facing east-south-east): the doors, "parsenn" and the star over them
  entrance: { a: [674.2, -1450.2], b: [677.4, -1454.4], doors: [0.5, 4.8], doorTop: 1.1, sign: { s: [0.35, 4.95], y: [2.55, 3.7] } },
  // The main block's north-east end (facing north-east, over the pavilion): "DAVOS KLOSTERS mountains" on the floor
  // over the pavilion's roof, by the Promenade's corner (the wall kept free of windows there)
  davos: { a: [675.9, -1448.9], b: [666.1, -1456.1], s: [0.7, 3.2], y: [6.6, 7.85], clear: [0.2, 3.8] },
  // The pavilion's north-east face: a picture panel (the photographs show a poster there)
  panel: { a: [677.4, -1454.4], b: [669.7, -1459.5], s: [0.8, 7.6], y: [1.0, 4.4] },
  // The banners: poles along the Promenade front's band (s m along it) and three on the roof behind the north-east end
  // (`in` m in from it); `pole` m over the roof's band, the banner `w` wide and `h` long
  flags: { front: [3.2, 8.3, 13.4, 18.5, 23.6, 28.7, 33.4], end: [6.6, 8.4, 10.2], in: 2.6, pole: 6.6, w: 1.0, h: 3.5 }
};

/** A part's roof height at the ring's point i (a flat roof's `top`, or the point's own) */
export const cornerTop = (part, i) => (part.top ?? part.ring[i][2]);
/** The highest roof of a part (a flat roof's `top`) */
export const partTop = (part) => part.top ?? Math.max(...part.ring.map((q) => q[2]));
/** The plan of a part's ring ([[x, z], …]) */
export const plan = (part) => part.ring.map((q) => [q[0], q[1]]);

/** Is a → b (or b → a) the wall w ({ a, b })? */
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
export const isWall = (w, a, b) => (near(w.a, a) && near(w.b, b)) || (near(w.a, b) && near(w.b, a));

/** The stretches of the wall a → b kept free of windows ([from, to] m along it): the lettering on the north-east end */
export function clearStretches(a, b) {
  const D = PARSENNBAHN_TAL.davos, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (near(D.a, a) && near(D.b, b)) return [D.clear];
  if (near(D.a, b) && near(D.b, a)) return [[len - D.clear[1], len - D.clear[0]]];
  return [];
}

/** A wall cut into its stretches: [{ from, to, windows }] */
export function wallStretches(a, b, windows = true) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!windows) return [{ from: 0, to: len, windows: false }];
  const out = [];
  let at = 0;
  for (const [c0, c1] of clearStretches(a, b)) {
    if (c0 - at > 0.01) out.push({ from: at, to: c0, windows: true });
    if (c1 - c0 > 0.01) out.push({ from: c0, to: c1, windows: false });
    at = c1;
  }
  if (len - at > 0.01) out.push({ from: at, to: len, windows: true });
  return out;
}

/** The parts a point lies in */
export const partsAt = (x, z) => PARSENNBAHN_TAL.parts.filter((p) => pointInRing(plan(p), x, z));

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): every part stands on the ground */
export const groundOutlines = () => PARSENNBAHN_TAL.parts.map(plan);

// The parts as js/landmark-buildings-data.js had them (flat rings, heights over the survey's floor, a sloping roof's per
// corner) and the street fronts' outward normals, for the tests that read the landmarks' outlines
export const PARSENN = {
  parts: PARSENNBAHN_TAL.parts.map((p) => ({
    kind: p.kind, h: partTop(p) - PARSENNBAHN_TAL.floor, ring: p.ring.flatMap((q) => [q[0], q[1]]),
    ...(p.top === undefined ? { roof: p.ring.map((q) => q[2] - PARSENNBAHN_TAL.floor) } : {})
  })),
  fronts: [[0.81, 0.59], [0.58, -0.81]],
  exclude: [PARSENNBAHN_TAL.exclude]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
