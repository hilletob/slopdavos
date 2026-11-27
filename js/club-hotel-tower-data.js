// The Club Hotel Davos's tower house on the Promenade (Davos Platz; js/club-hotel-tower.js): its volumes, the floors'
// grid, the walls painted deep blue, the lettering down its side, the low annex south of it, the garage's deck and the
// terrace round its west end, the hotel's sign on the Promenade. Pure data and frame maths, shared by the browser module
// and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1743/1004, batch 14): the tower's flat roof at y 22.09 over its whole outline (a
// slab ~36 m long, its north-east face stepped back twice, its south-west face a saw-tooth of ~4 m steps), the annex's
// at 5.11 (OpenStreetMap's w1529981152), the garage's deck at 3.74 between the tower, the annex and the hotel's other
// house (js/club-hotel.js; its outline here pulled 0.1 m out of that house's, which the survey's crossed by 0.6 m) and a
// terrace at 2.73 along the tower's west end; the batch's floor on −3.67. Heights in the world frame (y = m a.s.l. −
// 1558, js/davos-frame.js). The ground falls from the Obere Strasse on the west (2.4–2.9) to the Promenade on the east
// (−2.5) and the garage's lane south of the tower (−3.5): eight floors over the Promenade, six over the Obere Strasse.
// OpenStreetMap's footprint is w219455924 (up to 1.1 m off the surveyed walls).
// The look after Mapillary's street views of 2015 (CC BY-SA) down the Promenade from the north-east (43–77 m off): the
// north-east face clad in a light blue with its step back in a deep blue, "club hotel" in pale lower-case letters
// reading upwards beside the step, a window in a dark frame with a light curtain in every bay of every floor, narrower
// ones in the deep blue, the brown fascia round the flat roof, a small housing on it; along the Promenade (seen edge-on
// from 23 m) the south-east end, windows on its north half, the south half closed, the deep blue jog between them; the
// sign "club hotel ▲ Eingang / Garage ▶" at the corner. The south-west face, the north-west end on the Obere Strasse,
// the annex and the garage are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const CLUB_HOTEL_TOWER = {
  // swissBUILDINGS3D's batch (its centre): left out of the streamed tiles. It holds the tower, the annex, the garage's
  // deck and the terrace, all rebuilt here
  exclude: { x: -898, z: 556.3, r: 3 },
  osm: 'w219455924',
  // The tower's roof outline (world x, z): the north-east face from the Promenade's corner, its step back (the deep blue
  // stretch), the long face, a recess, the end towards the Obere Strasse, the saw-tooth south-west face
  ring: [[-875.4, 549.6], [-876.0, 549.3], [-871.0, 542.0], [-874.6, 539.5], [-880.3, 537.9], [-879.7, 535.9], [-890.6, 528.1],
    [-891.6, 531.3], [-894.3, 530.2], [-893.7, 528.4], [-901.6, 522.9], [-908.0, 541.7], [-904.3, 543.1], [-904.7, 544.1],
    [-901.1, 545.4], [-901.5, 546.4], [-897.8, 547.7], [-898.2, 548.8], [-893.1, 550.7], [-893.0, 549.4], [-890.3, 550.4],
    [-890.9, 551.5], [-887.0, 552.8], [-887.5, 553.9], [-883.6, 555.3], [-884.0, 556.4], [-880.3, 557.7]],
  top: 22.09,
  base: -4.0, // how far down the walls reach (under the garage's lane)
  // The floors: eight storeys of `storey` from `floor` (the Promenade's level) up to `line`, the top floor's top; the
  // wall from there to the roof the parapet behind the fascia
  floor: -2.6,
  storey: 2.95,
  line: 21.0,
  bay: 3.1,
  // A window: m up from its floor's foot, half its width (the light blue's; the deep blue's narrow ones `narrow`)
  win: { lo: 0.8, hi: 2.3, half: 0.72 },
  narrow: 0.36,
  // The walls in deep blue: every wall shorter than `short` (the jogs of the saw-tooth and the recesses) and these (a
  // point of each: the north-east face's step back)
  short: 3.5,
  deep: [[-877.45, 538.7]],
  // Closed walls (a point of each): the south half of the end on the Promenade
  closed: [[-877.85, 553.65]],
  // "club hotel" down the north-east face's first stretch (a point of it), at its end towards the step back (`next`, the
  // step's corner): `w` wide, `inset` from that corner, from y0 to y1; the windows only on the stretch before it
  lettering: { wall: [-872.8, 540.75], next: [-874.6, 539.5], w: 1.3, inset: 0.35, y0: 4.3, y1: 12.9, text: 'club hotel' },
  // The lift's housing on the roof: a box from a to b, `depth` m to the south-west of that line, `h` high
  housing: { a: [-891.2, 538.7], b: [-887.8, 540.7], depth: 3.0, h: 2.0 },
  // The annex south of the tower (OpenStreetMap's w1529981152): two floors of `storey` up to `line` under its flat roof
  annex: {
    osm: 'w1529981152',
    ring: [[-902.4, 571.1], [-904.0, 570.5], [-899.8, 558.9], [-901.6, 558.3], [-900.9, 556.2], [-889.5, 560.2], [-894.8, 575.1], [-902.8, 572.3]],
    top: 5.11, line: 4.6, storey: 3.75
  },
  // The garage's deck (no OpenStreetMap outline): between the tower's south-west face, the annex and the hotel's other
  // house, down its west side to the Obere Strasse's houses; closed walls, the garage's door on its face to the lane
  deck: {
    ring: [[-899.8, 558.9], [-901.6, 558.3], [-900.9, 556.2], [-899.8, 556.5], [-897.4, 549.1], [-898.2, 548.8], [-898.1, 548.7],
      [-910.4, 544.7], [-924.7, 584.0], [-923.4, 584.7], [-919.6, 573.8], [-913.6, 575.9], [-915.2, 580.3], [-905.0, 584.0],
      [-907.0, 589.5], [-906.2, 590.0], [-900.7, 573.0], [-902.8, 572.3], [-902.4, 571.1], [-904.0, 570.5]],
    top: 3.74
  },
  // The terrace along the tower's west end and the first steps of its south-west face (no OpenStreetMap outline)
  terrace: {
    ring: [[-906.8, 538.1], [-907.9, 537.8], [-910.2, 544.8], [-898.1, 548.7], [-897.8, 547.7], [-901.5, 546.4], [-901.1, 545.4],
      [-904.7, 544.1], [-904.3, 543.1], [-908.0, 541.7]],
    top: 2.73
  },
  // The garage's door: in the deck's wall facing the lane (a point of it), `w` wide, `h` high over the lane
  garage: { wall: [-898.6, 552.8], w: 3.4, h: 2.5 },
  // The hotel's sign at the Promenade's corner: a white panel on two posts facing the traffic from the north-east
  // (`facing`), `w` × `h`, its foot `y` over the ground
  sign: { x: -869.3, z: 540.4, facing: [0.515, -0.857], w: 1.3, h: 0.75, y: 1.0 }
};

/** The walls of an outline as wallFrame has them (the outside on n): [{ a, b, F }] */
export function ringWalls(ring) {
  const R = outwardRing(ring);
  return R.map((a, i) => { const b = R[(i + 1) % R.length]; return { a, b, F: wallFrame(a, b) }; });
}
/** The tower's walls */
export const walls = () => ringWalls(CLUB_HOTEL_TOWER.ring);

const mid = (w) => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
const near = (w, p, d = 0.6) => Math.hypot(mid(w)[0] - p[0], mid(w)[1] - p[1]) < d;
/** The wall of `list` whose middle is `p` */
export const wallAt = (list, p) => list.find((w) => near(w, p));
/** Is a tower wall painted deep blue? */
export const isDeep = (w) => w.F.len < CLUB_HOTEL_TOWER.short || CLUB_HOTEL_TOWER.deep.some((p) => near(w, p));
/** Is a tower wall closed? */
export const isClosed = (w) => CLUB_HOTEL_TOWER.closed.some((p) => near(w, p));

/** The upper floors' feet over the Promenade's floor, from the first up */
export function floorFeet() {
  const H = CLUB_HOTEL_TOWER, out = [];
  for (let y = H.floor; y < H.line - 0.5; y += H.storey) out.push(Math.round(y * 100) / 100);
  return out;
}

/** The lettering's wall and its stretch along it: { F, s0, s1, windowsTo } (s from the wall's a) */
export function letteringSpan() {
  const L = CLUB_HOTEL_TOWER.lettering, w = wallAt(walls(), L.wall);
  const F = w.F, atB = Math.hypot(w.b[0] - L.next[0], w.b[1] - L.next[1]) < 0.3;
  const s0 = atB ? F.len - L.inset - L.w : L.inset, s1 = s0 + L.w;
  return { w, F, s0, s1, atB, windowsTo: atB ? s0 - 0.25 : s1 + 0.25 };
}

/** The volumes standing on the ground here: [{ ring, top }] (the tower, the annex, the deck, the terrace) */
export function volumes() {
  const H = CLUB_HOTEL_TOWER;
  return [{ name: 'tower', ring: H.ring, top: H.top }, { name: 'annex', ring: H.annex.ring, top: H.annex.top },
    { name: 'deck', ring: H.deck.ring, top: H.deck.top }, { name: 'terrace', ring: H.terrace.ring, top: H.terrace.top }];
}

/** Is a point inside the tower's outline? */
export const inside = (x, z) => pointInRing(CLUB_HOTEL_TOWER.ring, x, z);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
