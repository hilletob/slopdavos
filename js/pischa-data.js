// The Pischa kiosk by the car park at the Seehofseeli in Davos Dorf (js/pischa.js): the ski area's small timber hut for
// tickets and information where the Pischa bus leaves, under its flat roof with the deep eave and the lettered fascia.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D has no building here (js/unsurveyed-buildings-data.js), so the outline is OpenStreetMap's,
// w1527538703 (32 m², the same ring as DAVOS_DATA.buildings; the tests compare them), and the height is the photograph's.
// Its neighbour on the north-west, w1527538702 (36 m², sharing the kiosk's north-west wall), and the shed w1527538701
// by the Feuerwehrdepot stay js/buildings.js' plain boxes. The look after Mapillary's street view 167900218562917
// (2013, CC BY-SA), taken from the service road north-east of the kiosk looking south-west (the GPS put the camera
// some 15 m north-east of where it stood): the north-east front with "PISCHABUS" on the fascia, the door, the ski
// area's poster over a painted concrete panel ("zum Pischa Bus"), the flag pole at its east corner, and the south-east
// side seen at a slant under its deep eave, hung with posters. The south-west and north-west sides are guessed (no photo
// shows them; the north-west one is hidden by the neighbour), so is the ticket window on the south-east side.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const PISCHA = {
  osm: 'w1527538703',
  neighbour: 'w1527538702', // (the box on the north-west, against the kiosk's north-west wall)
  // OpenStreetMap's outline (world x, z), as DAVOS_DATA.buildings has it
  ring: [[715.3, -1381.3], [710.9, -1376.2], [707.3, -1379.2], [707.9, -1379.8], [711.7, -1384.4]],
  // Heights over its floor (the floor a step over the highest ground along its walls): the walls up to the eave's
  // soffit, the fascia over it up to the roof; the walls reach `foot` m under the lowest ground
  wall: 3.0, roof: 3.5, step: 0.08, foot: 0.6,
  plinth: 0.8, // the concrete plinth round the timber walls
  // The four sides (a on the left for someone standing before the wall), and how far the roof reaches out over each
  sides: {
    // the front on the car park, north-east (the photo's): smaller z is north
    front: { a: [715.3, -1381.3], b: [711.7, -1384.4], eave: 0.5 },
    // (against the neighbour: the eave a hand over its roof, to cover the outline's jog at the west corner)
    northwest: { a: [711.7, -1384.4], b: [707.9, -1379.8], eave: 0.12 },
    southwest: { a: [707.3, -1379.2], b: [710.9, -1376.2], eave: 0.35 },
    // the side at a slant in the photo, the soffit of its deep eave seen from below
    southeast: { a: [710.9, -1376.2], b: [715.3, -1381.3], eave: 1.1 }
  },
  // The front (s m from its east end, y m over the floor): the door, the painted concrete panel to the north corner,
  // the ski area's poster over it, the lettering on the fascia (centred on the wall)
  door: { s0: 0.6, s1: 1.6, y1: 2.1 },
  mural: { s0: 1.8, s1: 4.65, y0: 0.05, y1: 1.2 },
  poster: { s0: 2.2, s1: 3.95, y0: 1.35, y1: 2.85 },
  lettering: { w: 3.2, y0: 3.07, y1: 3.43 },
  // The south-east side (s m from its south end): the ticket window with its counter (guessed), the notice board, two
  // posters towards the front
  window: { s0: 1.4, s1: 2.9, y0: 1.0, y1: 2.1 },
  notice: { s0: 3.3, s1: 4.5, y0: 1.1, y1: 2.1 },
  sidePosters: [{ key: 'winter', s0: 4.75, s1: 5.75, y0: 1.0, y1: 2.5 }, { key: 'side', s0: 5.82, s1: 6.62, y0: 0.9, y1: 2.6 }],
  // The flag pole off the front's east corner (along the front, out of it) and its banner hanging from an arm
  flag: { s: 0.2, out: 0.75, height: 8.5, w: 0.8, h: 2.4 }
};

const side = (k) => PISCHA.sides[k];
/** The frame of a side (wallFrame of js/spital-data.js) */
export const sideFrame = (k) => wallFrame(side(k).a, side(k).b);

/** The floor: a step over the highest ground along the walls (`ground(x, z)`, js/terrain.js groundHeight); and the
 *  lowest ground */
export function floorOf(ground) {
  let hi = -Infinity, lo = Infinity;
  const ring = PISCHA.ring;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (const t of [0, 0.25, 0.5, 0.75]) {
      const y = ground(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      hi = Math.max(hi, y); lo = Math.min(lo, y);
    }
  }
  return { floor: hi + PISCHA.step, low: lo };
}

/** The roof's outline ([[x, z], …], outward like the walls): the four sides moved out by their eaves, met at the corners */
export function roofOutline() {
  const order = ['front', 'northwest', 'southwest', 'southeast'];
  const lines = order.map((k) => { const F = sideFrame(k); return { p: onWall(F, 0, side(k).eave), u: F.u }; });
  return order.map((_, i) => {
    const L = lines[(i + order.length - 1) % order.length], M = lines[i];
    // L.p + t L.u = M.p + r M.u
    const det = L.u[0] * -M.u[1] - L.u[1] * -M.u[0];
    const dx = M.p[0] - L.p[0], dz = M.p[1] - L.p[1];
    const t = (dx * -M.u[1] - dz * -M.u[0]) / det;
    return [L.p[0] + L.u[0] * t, L.p[1] + L.u[1] * t];
  });
}

/** The pole's foot (world x, z) */
export function flagPole() {
  const F = PISCHA.flag;
  return onWall(sideFrame('front'), F.s, F.out);
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
