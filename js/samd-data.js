// The SAMD's main building, the Schweizerische Alpine Mittelschule Davos (Guggerbachstrasse 2, 7270 Davos Platz;
// js/samd.js): its volumes, the floors' grid, the stair tower with its lettering, the lettering wall and the porch on
// the yard, the balconies towards the valley. Pure data and frame maths, shared by the browser module, the tests and
// the mission on its roof (js/missions-data-samd.js).
//
// Sources: swissBUILDINGS3D (tile 11/1745/1008, batch 1, one building of 25.8 m from its lowest floor to the attic):
// the roofs' outlines and heights below are its flat roofs, each a prism down to the ground; heights in the world frame
// (y = m a.s.l. − 1558, js/davos-frame.js). The yard on the Guggerbachstrasse (north) lies at y −10.3 to −11.1, the
// playground towards the valley (south) at −13.2 to −13.6. OpenStreetMap's footprint is w1390001415. The look after
// photographs: the yard side seen from over the Guggerbachstrasse (the six-storey block with its stair tower, the
// glazed strip up it and the school's name on its head under the flag, the lower wing with the name on its closed wall,
// the porch in the corner between them; Mapillary's street views of 2014 show the same sides) and the valley side
// (Wikimedia Commons, "Schweizerische Alpine Mittelschule Davos.jpg" and "Innenhof SAMD.jpg", Artaxerxes1970, CC BY-SA:
// white plaster, windows in dark green frames, two floors of balconies under the attic, the glazed dining hall before
// the block).
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const SAMD = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: -527.9, z: 97.2, r: 3 },
  osm: 'w1390001415',
  storey: 3.3,
  base: -15.2, // how far down the walls reach (under the playground)
  // The volumes, each a flat roof at `top` over its outline (world x, z). `line`: a floor's top (the windows' grid
  // counts down from it; the tall block's six floors over the yard end on the yard's level). `windows: false`: closed
  // walls; `glazed`: its walls facing the valley are the dining hall's glass
  parts: [
    // the dining hall before the block, one floor over the playground
    { id: 'dining-hall', top: -7.18, line: -7.0, glazed: true,
      ring: [[-527.8, 107.2], [-529.4, 108.1], [-529.0, 109.4], [-529.6, 110.9], [-531.3, 111.6], [-540.4, 108.3], [-539.1, 104.7], [-537.2, 105.3], [-532.3, 90.8],
        [-531.4, 91.0], [-530.5, 88.4], [-529.8, 88.7], [-530.9, 91.2], [-522.3, 94.7], [-521.6, 97.3], [-523.4, 98.3], [-523.0, 99.7], [-524.9, 100.7],
        [-524.4, 102.1], [-526.4, 103.2], [-525.9, 104.7], [-527.9, 105.7]] },
    { id: 'dining-east', top: -7.18, line: -7.0, glazed: true, ring: [[-508.4, 97.2], [-515.8, 94.3], [-516.7, 96.6], [-509.4, 100.0]] },
    { id: 'link', top: -3.89, line: -4.1, ring: [[-529.8, 88.7], [-530.9, 91.2], [-516.9, 96.9], [-515.8, 94.3], [-519.7, 92.7]] },
    { id: 'east-step', top: -3.65, line: -4.1, windows: false, ring: [[-503.5, 102.4], [-509.6, 99.6], [-508.4, 97.2], [-502.2, 99.6]] },
    { id: 'south-annex', top: -1.75, line: -2.05, ring: [[-545.1, 117.6], [-538.5, 119.8], [-536.0, 112.3], [-541.1, 110.6], [-543.7, 118.0]] },
    // the wings round the inner yard, west of the block
    { id: 'west-wing', top: 2.59, line: 2.29,
      ring: [[-537.2, 105.3], [-539.1, 104.7], [-538.6, 103.2], [-549.9, 99.4], [-550.4, 100.9], [-551.8, 100.4], [-546.9, 85.8], [-532.3, 90.8]] },
    // (its north wall on the yard carries the name: closed, js/samd.js)
    { id: 'north-wing', top: 3.44, line: 3.14,
      ring: [[-529.6, 82.6], [-534.3, 81.0], [-533.8, 79.6], [-545.8, 75.5], [-549.1, 85.1], [-531.4, 91.0], [-530.5, 88.4], [-531.7, 87.9]] },
    { id: 'south-wing', top: 4.68, line: 4.38,
      ring: [[-554.7, 107.4], [-556.5, 106.8], [-558.6, 113.0], [-543.7, 118.0], [-538.6, 103.2], [-549.9, 99.4], [-551.6, 104.5], [-548.7, 105.5], [-550.3, 110.2], [-555.1, 108.6]] },
    { id: 'south-wing-stair', top: 5.98, line: 4.38, windows: false, ring: [[-553.5, 103.9], [-555.1, 108.6], [-550.3, 110.2], [-548.7, 105.5]] },
    // the six-storey block: its west half (the roof the mission's boys lie on), the east half round the attic, the
    // attic with the stair tower's head on the yard side
    { id: 'block-west', top: 9.4, line: 9.1, ring: [[-515.4, 81.7], [-519.8, 80.0], [-519.5, 79.2], [-527.1, 76.2], [-531.7, 87.9], [-519.7, 92.7]] },
    { id: 'block-east', top: 10.61, line: 9.1,
      ring: [[-514.2, 80.6], [-514.8, 80.4], [-519.7, 92.7], [-502.1, 99.7], [-497.0, 86.7], [-503.8, 83.9], [-504.1, 84.6], [-511.3, 81.8], [-512.7, 85.4],
        [-509.8, 86.5], [-510.7, 88.8], [-502.6, 92.0], [-504.0, 95.5], [-517.9, 90.0]] },
    { id: 'attic', top: 12.2, line: 12.4,
      ring: [[-511.3, 81.8], [-514.2, 80.6], [-517.9, 90.0], [-504.0, 95.5], [-502.6, 92.0], [-510.7, 88.8], [-509.8, 86.5], [-512.7, 85.4]] }
  ],
  // The stair tower's two faces on the yard (a on the left for someone standing before the wall): its north face with
  // the glazed strip from the yard to the head, and the head's west face over the block's roof with the school's name
  // (kept free of windows)
  tower: {
    north: { a: [-511.3, 81.8], b: [-514.2, 80.6], strip: { half: 0.62, y0: -9.4, y1: 10.9 } },
    west: { a: [-514.2, 80.6], b: [-517.9, 90.0], name: { at: 0.45, w: 6.6, y0: 9.62, y1: 12.02 }, clear: [0, 10.2] },
    flag: { s: 1.2, pole: 7.2, w: 2.3 } // the pole on the head (m along the west face, a step in), the flag's side
  },
  // The north wing's wall on the yard: closed but for two windows under its roof, the name on it
  nameWall: { a: [-533.8, 79.6], b: [-545.8, 75.5], name: { w: 7.0, y0: -3.3, y1: -0.3 }, windows: [[2.6, 0.75], [10.0, 0.75]], window: [0.55, 2.35] },
  // The porch in the corner between the block and the north wing (inside OpenStreetMap's footprint, whose walls are the
  // player's): a glazed vestibule under a flat canopy; its front faces the yard
  porch: { ring: [[-534.3, 81.0], [-532.9, 75.0], [-527.1, 77.1], [-529.6, 82.6]], height: 3.1, canopy: 0.7, front: { a: [-527.1, 77.1], b: [-532.9, 75.0] } },
  // The balconies towards the valley: along the block's south wall, at the two floors under the attic
  balconies: { a: [-519.7, 92.7], b: [-502.1, 99.7], from: 0.6, to: 18.3, out: 1.25, floors: [2.5, 5.8], rail: 1.0 },
  // The roof the mission plays on (js/missions-data-samd.js): the block's west half, its edge over the yard
  roof: { part: 'block-west', top: 9.4 }
};

/** The stretches of a part's wall a → b kept free of windows ([from, to] m along it): the tower's head, the name wall */
export function clearStretches(a, b) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out = [];
  for (const w of [{ ...SAMD.tower.west }, { a: SAMD.nameWall.a, b: SAMD.nameWall.b, clear: [0, 99] }]) {
    const c = [Math.min(len, w.clear[0]), Math.min(len, w.clear[1])];
    if (near(w.a, a) && near(w.b, b)) out.push(c);
    else if (near(w.a, b) && near(w.b, a)) out.push([len - c[1], len - c[0]]);
  }
  return out;
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

/** The part of the SAMD a point lies on (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of SAMD.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
