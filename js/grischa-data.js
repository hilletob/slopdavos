// The Hotel Grischa (Talstrasse, 7270 Davos Platz; js/grischa.js): its volumes, the floors' grid, the shop fronts on
// the car park, the podium on the Talstrasse with its cantilevered canopy, the stair tower with its glazed strip, the
// attic, the balconies, the lettering. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1744/1005, batches 5, 10 and 3): the roofs' outlines and heights below are its
// flat roofs, each a prism down under the ground; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js).
// Batch 5 is the block (six floors, its roof at 0.85), batch 10 the attic over its middle with the stair tower on the
// north-north-east front (4.73), batch 3 the podium of two floors (−10.36) along the Talstrasse (east-south-east) and
// the south-south-west side. The ground is flat round it (y −17.9 on the Talstrasse, −17.0 at the west end).
// OpenStreetMap's footprint is w99094508; it stands up to a metre off the surveyed walls.
// The look after Mapillary's street views (CC BY-SA): from the north-east (2019, 169339548409417): the north-north-east
// front on the car park in red plaster with white-framed windows, five floors over the shops' glazing, "GRISCHA HOTEL"
// and a star between the second and the third floor, "RESTAURANT" over the shops, the stair tower with its glazed strip
// up to the dark attic, the eaves' brown fascia; balconies at the corner on the Talstrasse. From the south on the
// Talstrasse (2026, 4765492247005425, 1436128521832311, 2309014273247123): the podium's two glazed floors under a deep
// cantilevered canopy with a timber soffit and a grey edge, "GRISCHA" on the band between them, a timber rail on the
// canopy, red floors with timber balconies over it, the dark attic on top. (The nearest building on the left of those
// photos, red over a timber-clad ground floor with the restaurants' signs, is the neighbour w99094509; the dark timber
// building on their right is w221110634 across the street.) The west end and the south-south-west front over the
// podium are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const GRISCHA = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [{ x: -693.3, z: 467.6, r: 3 }, { x: -695.3, z: 467.7, r: 3 }, { x: -695.7, z: 478.7, r: 3 }],
  osm: 'w99094508',
  storey: 2.8,
  bay: 2.6,
  base: -19.5, // how far down the walls reach
  // The floors' grid: the top floor's top (the windows' grid counts down from it, five floors over the ground floor),
  // the first floor's foot (the shops' and the podium's level under it)
  line: 0.75,
  firstFloor: -13.25,
  // The volumes, each a flat roof at `top` over its outline (world x, z; turned as wallFrame wants them). `from`: where
  // its walls begin (the attic's stand on the block's roof); `line`: its top floor's top
  parts: [
    // the block: batch 5 with the stair tower's foot (batch 10's part that stands out of its front)
    { id: 'block', top: 0.85, line: 0.75,
      ring: [[-690.7, 460.7], [-690.2, 459.9], [-692.6, 458.3], [-693.1, 459.1], [-701.4, 453.8], [-704.3, 458.2], [-702.5, 459.3], [-705.6, 464.0],
        [-707.3, 462.9], [-710.5, 468.0], [-689.1, 481.7], [-680.0, 467.5]] },
    // the attic over the block's middle, the stair tower's head at its north-north-east end (batch 10)
    { id: 'attic', top: 4.73, line: 3.55, from: 0.85,
      ring: [[-690.2, 459.9], [-692.6, 458.3], [-693.1, 459.1], [-701.2, 471.7], [-692.9, 477.0], [-685.5, 465.4], [-691.3, 461.6], [-690.7, 460.7]] },
    // the podium's hall on the south-south-west side, against the neighbour (batch 3 but for its strip on the Talstrasse)
    { id: 'hall', top: -10.36, line: -10.45,
      ring: [[-689.1, 481.7], [-709.5, 468.7], [-709.8, 469.2], [-710.2, 469.0], [-713.2, 473.5], [-693.1, 486.9], [-692.5, 487.0]] }
  ],
  // The canopy over the Talstrasse's pavement (batch 3's strip before the block's and the hall's fronts): no posts, its
  // top the podium's roof, its soffit of timber
  canopy: {
    top: -10.36, under: -11.0,
    ring: [[-689.1, 481.7], [-692.5, 487.0], [-693.1, 486.9], [-693.2, 487.2], [-690.3, 489.0], [-678.7, 470.9], [-681.2, 469.3]],
    rail: 1.0 // the timber rail along its outer edges
  },
  // The stair tower's three faces (a → b as wallFrame wants them), closed red plaster; the glazed strip up its front
  tower: {
    faces: [[[-690.7, 460.7], [-690.2, 459.9]], [[-690.2, 459.9], [-692.6, 458.3]], [[-692.6, 458.3], [-693.1, 459.1]]],
    strip: { half: 0.5, y0: -17.4, y1: 4.1 }
  },
  // The fronts on the car park (north-north-east): the shops' glazing under a dark fascia, the first floor's windows
  // over them. `east`: the one between the corner on the Talstrasse and the tower, with the name and the restaurant's
  // board (s m along it from its east end)
  shops: {
    glass: -14.1, fascia: [-14.1, -13.35],
    walls: [[[-680.0, 467.5], [-690.7, 460.7]], [[-693.1, 459.1], [-701.4, 453.8]]],
    name: { s: 7.0, w: 5.3, y0: -8.1, y1: -6.86 },
    restaurant: { s: 6.6, w: 3.4, y0: -14.0, y1: -13.4 }
  },
  // The fronts on the Talstrasse under the canopy (the block's, then the hall's): two glazed floors, a dark band
  // between them with the name (s m along the block's front from its south end), the doors
  street: {
    walls: [[[-689.1, 481.7], [-680.0, 467.5]], [[-692.5, 487.0], [-689.1, 481.7]]],
    band: [-13.9, -12.95], glassTop: -11.0,
    name: { s: 1.2, w: 5.8, y0: -13.82, y1: -13.03 },
    doors: { s: 10.4, w: 3.6 }
  },
  // The block's south-south-west front: behind the hall up to its roof, the windows from the second floor up
  behindHall: [[-710.5, 468.0], [-689.1, 481.7]],
  // The balconies: a slab and a timber parapet along the Talstrasse's front and the south-south-west front, at the
  // feet of the third to the fifth floor (the second's is the podium's roof, with the canopy's rail)
  balconies: {
    walls: [[[-689.1, 481.7], [-680.0, 467.5]], [[-710.5, 468.0], [-689.1, 481.7]]],
    floors: [-7.65, -4.85, -2.05], from: 0.4, out: 1.3, rail: 1.0
  },
  // The eaves round the block's roof and the attic's
  eaves: { block: { out: 0.7, y0: 0.45, y1: 0.95 }, attic: { out: 0.45, y0: 4.43, y1: 4.85 } },
  // A window: m up from its floor's foot, its half width
  win: { lo: 0.85, hi: 2.25, half: 0.62 }
};

/** A part by its id */
export const part = (id) => GRISCHA.parts.find((p) => p.id === id);

/** The part of the hotel a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of GRISCHA.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b one of the walls listed (pairs [a, b], either way round)? */
export const among = (list, a, b) => list.some(([p, q]) => (near(a, p) && near(b, q)) || (near(a, q) && near(b, p)));

/**
 * What a wall a → b of a part is: 'tower' (closed, the stair tower's), 'shop' (glazed under a fascia), 'street' (the
 * fronts under the canopy), 'behindHall' (the block's wall over the hall), 'party' (the hall's wall towards the
 * neighbour, closed), 'glazed' (the hall's west end), 'plain' (windows over a plinth)
 */
export function wallKind(p, a, b) {
  if (among(GRISCHA.tower.faces, a, b)) return 'tower';
  if (among(GRISCHA.shops.walls, a, b)) return 'shop';
  if (among(GRISCHA.street.walls, a, b)) return 'street';
  if (among([GRISCHA.behindHall], a, b)) return 'behindHall';
  if (p.id === 'hall') {
    const F = wallFrame(a, b);
    return F.n[1] > 0.5 ? 'party' : F.len > 2 ? 'glazed' : 'party';
  }
  return 'plain';
}

/** The outer edges of the canopy (those that face open ground, not a wall of the hotel): [[a, b]] */
export function canopyEdges() {
  const R = outwardRing(GRISCHA.canopy.ring), out = [];
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], F = wallFrame(a, b);
    if (F.len < 0.5) continue;
    const [x, z] = onWall(F, F.len / 2, 0.3);
    if (!partAt(x, z)) out.push([a, b]);
  }
  return out;
}

/** The rings the player's walls stand on at the ground (js/landmarks.js SURVEYED_FOOTPRINTS): the block with the
 *  tower's foot and the hall; the canopy hangs over the pavement */
export const groundRings = () => [part('block').ring, part('hall').ring];

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
