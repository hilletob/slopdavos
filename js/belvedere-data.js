// The Grandhotel Belvédère (Promenade 89, 7270 Davos Platz; js/belvedere.js): the long hotel on the slope over the
// Promenade, across from the Kirchner Museum. Its volumes, its fronts, the balconies, the loggias, the old house with
// the dome. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1747/1014 batch 5: the hotel's wings; tile 11/1746/1014 batches 0–3: the old house
// at the west end, its dome, its hipped roof and the flat-roofed blocks beside it); OpenStreetMap's footprint
// w117012183. Heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js); the car park before the long wing
// lies at y −2, the Promenade before the east block at −6, the slope behind the house climbs to +9. The look after a
// photograph of the south-east front from above the Kirchner Museum: white plaster throughout; the long wing with six
// floors of balconies over a ground floor under a canopy, the glazed stair at its west end and the name on the roof; the
// east block with two groups of loggias under round arches over a lower front with a terrace; the old house in the
// west, neo-baroque, with arched windows on its main floor, the porch with its columns, the pediment and the slate
// dome with its dormers and lantern, a hipped slate roof beside it. The north sides are not on the photograph: plaster
// with a window per bay and floor.
import { wallFrame } from './spital-data.js';

// The old house's frame: `s` m along its front line (towards the east-north-east), `o` m out of it (towards the
// Promenade, south-south-east); its front walls lie on o ≈ 0
const OLD_ANGLE = Math.atan2(-0.6252, 0.7806), OLD_U = [Math.cos(OLD_ANGLE), Math.sin(OLD_ANGLE)], OLD_N = [-OLD_U[1], OLD_U[0]], OLD_O = -582.9;
/** The world point [x, z] `s` m along the old house's front line and `o` m before it */
export const oldLocal = (s, o) => [+(OLD_U[0] * s + OLD_N[0] * (o + OLD_O)).toFixed(2), +(OLD_U[1] * s + OLD_N[1] * (o + OLD_O)).toFixed(2)];
/** The old house's frame of a world point: [s, o] */
export const toOld = (x, z) => [x * OLD_U[0] + z * OLD_U[1], x * OLD_N[0] + z * OLD_N[1] - OLD_O];
/** A rectangle in the old house's frame, its corners round (world) */
const oldRect = (s0, s1, o0, o1) => [oldLocal(s0, o1), oldLocal(s1, o1), oldLocal(s1, o0), oldLocal(s0, o0)];

export const BELVEDERE = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [
    { x: -251.6, z: -548.3, r: 3 }, // the wings (tile 11/1747/1014 batch 5)
    { x: -328.3, z: -493.4, r: 2 }, // the dome
    { x: -316.3, z: -503.2, r: 2 }, // the hipped roof
    { x: -321.3, z: -490.5, r: 2 }, // the link behind the front
    { x: -335.6, z: -487.0, r: 2 } // the west block
  ],
  osm: 'w117012183',
  base: -8, // how far down the walls reach (under the Promenade before the east block)
  // The hotel's floors, counted down from each wing's roof; a window in its storey, the bays along a wall
  storey: 2.85, bay: 3.0, window: { lo: 0.6, hi: 2.3, half: 0.68 },
  // The old house: its higher floors, arched windows
  old: { storey: 4.6, bay: 3.4, window: { lo: 1.0, hi: 3.2, half: 0.62 } },
  // The volumes: a flat roof at `top` over the outline (world x, z); `walls`: 'hotel' (the wings' plaster), 'old' (the
  // old house's) or 'closed'; `roof`: 'flat', 'terrace' (a railing round it), 'hip' (up to a ridge along
  // its longer sides at `peak`), 'dome' (js/belvedere.js buildDome); `balconies`: its walls towards the Promenade carry
  // them; `plainFront`: those walls without windows
  parts: [
    { id: 'long-wing', top: 18.15, walls: 'hotel', roof: 'flat', balconies: true,
      ring: [[-241.4, -565.2], [-242.0, -562.9], [-263.1, -551.2], [-265.2, -554.5], [-270.6, -550.4], [-271.6, -551.4], [-277.7, -547.1], [-276.8, -545.9], [-281.0, -542.8], [-278.5, -539.9], [-288.5, -531.6], [-291.1, -534.8], [-300.4, -527.1], [-294.2, -519.7], [-296.1, -518.1], [-292.2, -512.6], [-268.0, -532.9], [-267.5, -532.4], [-261.0, -537.0], [-261.5, -537.7], [-239.9, -549.8], [-238.2, -549.3], [-233.1, -539.9], [-234.9, -538.9], [-231.8, -533.3], [-223.1, -538.0], [-226.5, -544.3], [-223.8, -545.8], [-233.0, -562.7]] },
    { id: 'east-block', top: 17.39, walls: 'hotel', roof: 'flat', balconies: true, balconyFrom: 5.5,
      ring: [[-223.1, -538.0], [-226.5, -544.3], [-223.8, -545.8], [-224.8, -547.6], [-202.8, -559.6], [-206.5, -566.3], [-199.8, -569.9], [-191.3, -554.3], [-201.5, -548.8], [-202.0, -549.6], [-214.8, -542.6], [-214.3, -541.8], [-223.6, -536.7]] },
    { id: 'north-block', top: 17.84, walls: 'hotel', roof: 'flat',
      ring: [[-208.6, -565.1], [-215.4, -577.6], [-189.7, -591.7], [-182.9, -579.2]] },
    // the lower front before the east block (its roof a terrace) and the low wings behind it
    { id: 'east-front', top: 5.29, walls: 'hotel', roof: 'terrace',
      ring: [[-224.8, -537.1], [-231.8, -533.3], [-234.9, -538.9], [-233.1, -539.9], [-238.2, -549.3], [-239.9, -549.8], [-247.9, -545.4], [-246.3, -543.1], [-244.0, -541.3], [-241.3, -540.0], [-238.6, -539.8], [-235.6, -534.5], [-234.5, -535.1], [-232.1, -530.8], [-219.4, -538.0], [-217.0, -533.7], [-212.7, -536.1], [-212.2, -535.2], [-201.9, -541.0], [-202.4, -541.9], [-197.8, -544.5], [-200.5, -549.3], [-201.5, -548.8], [-214.3, -541.8], [-223.6, -536.7]] },
    { id: 'court-1', top: 5.29, walls: 'hotel', roof: 'flat',
      ring: [[-224.8, -547.6], [-207.5, -557.5], [-211.9, -565.1], [-213.9, -564.0], [-215.0, -566.1], [-210.5, -568.6], [-208.6, -565.1], [-206.5, -566.3], [-202.8, -559.6]] },
    { id: 'court-2', top: 5.6, walls: 'hotel', roof: 'flat',
      ring: [[-224.8, -547.7], [-232.0, -560.9], [-229.7, -560.0], [-229.3, -561.3], [-228.5, -563.4], [-227.3, -565.1], [-226.0, -566.0], [-224.8, -563.8], [-222.4, -565.1], [-222.7, -565.6], [-220.3, -567.0], [-220.6, -567.5], [-217.0, -569.5], [-213.9, -564.0], [-211.9, -565.1], [-207.5, -557.5]] },
    { id: 'court-3', top: 6.1, walls: 'hotel', roof: 'flat',
      ring: [[-229.3, -561.3], [-229.7, -560.0], [-232.0, -560.9], [-233.0, -562.7], [-235.2, -563.4], [-234.2, -565.4], [-232.4, -568.3], [-229.9, -570.5], [-228.3, -571.7], [-227.7, -571.1], [-225.9, -572.0], [-226.3, -572.8], [-224.0, -574.0], [-220.3, -567.0], [-222.7, -565.6], [-222.4, -565.1], [-224.8, -563.8], [-226.0, -566.0], [-227.3, -565.1], [-228.5, -563.4]] },
    { id: 'north-low-1', top: 4.16, walls: 'hotel', roof: 'flat',
      ring: [[-195.7, -588.4], [-199.5, -595.3], [-221.0, -583.2], [-217.9, -577.8], [-222.9, -574.9], [-224.0, -574.0], [-223.1, -572.3], [-220.6, -567.5], [-217.0, -569.5], [-215.4, -577.6]] },
    { id: 'north-low-2', top: 4.11, walls: 'hotel', roof: 'flat', ring: [[-210.5, -568.6], [-215.0, -566.1], [-217.0, -569.5], [-215.4, -577.6]] },
    { id: 'north-low-3', top: 4.11, walls: 'hotel', roof: 'flat', ring: [[-198.4, -567.4], [-199.8, -569.9], [-188.7, -576.0], [-187.3, -573.6]] },
    { id: 'east-low', top: 0.84, walls: 'hotel', roof: 'flat',
      ring: [[-184.7, -567.7], [-195.5, -562.0], [-198.4, -567.4], [-187.3, -573.6], [-188.7, -576.0], [-182.9, -579.2], [-189.5, -591.2], [-185.4, -593.3], [-178.6, -580.4]] },
    // the two-storeyed wing between the long wing and the old house (its roof a terrace), the low parts behind it
    { id: 'low-wing', top: 9.19, walls: 'hotel', roof: 'terrace',
      ring: [[-294.2, -519.7], [-300.3, -527.0], [-316.8, -513.2], [-316.3, -512.7], [-306.9, -501.6], [-306.7, -501.1], [-292.5, -513.1], [-296.1, -518.1]] },
    { id: 'low-back-1', top: 8.45, walls: 'hotel', roof: 'flat', ring: [[-312.6, -516.7], [-314.5, -519.0], [-324.5, -510.6], [-322.1, -507.8], [-316.4, -512.6], [-316.8, -513.2]] },
    { id: 'low-back-2', top: 8.45, walls: 'hotel', roof: 'flat', ring: [[-310.7, -518.3], [-313.4, -521.6], [-308.4, -525.7], [-305.7, -522.5]] },
    // the old house: the west block, the link behind the front, the dome, the hipped roof
    { id: 'old-west', top: 19.81, walls: 'old', roof: 'flat',
      ring: [[-341.1, -485.1], [-344.1, -488.6], [-335.8, -495.6], [-327.1, -485.2], [-335.4, -478.2], [-337.2, -480.4], [-339.7, -478.3], [-343.7, -483.0]] },
    { id: 'old-link', top: 17.15, walls: 'old', roof: 'flat',
      ring: [[-322.1, -500.4], [-325.9, -497.2], [-325.6, -496.8], [-320.3, -490.5], [-326.9, -485.0], [-327.1, -485.2], [-331.9, -481.1], [-332.3, -480.8], [-331.8, -480.1], [-326.9, -484.2], [-325.9, -483.1], [-322.4, -486.0], [-322.1, -485.5], [-314.4, -492.0], [-314.8, -492.4], [-310.1, -496.3], [-311.4, -497.8], [-311.8, -497.5], [-316.4, -493.6], [-321.8, -500.0]] },
    // (the dome stands over the porch's projection, as on the photograph, as wide as its four dormers; the survey's dome
    // batch, 9.5 m wide, sits 5 m west of it)
    { id: 'old-dome', top: 19.81, walls: 'old', roof: 'dome', plainFront: true, dome: { top: 27.2, inset: 3.6 }, ring: oldRect(47.6, 66.6, -14.6, 0.3) },
    { id: 'old-hip', top: 16.7, walls: 'old', roof: 'hip', peak: 20.8, ring: oldRect(66.6, 74.4, -15.3, 0.27) }
  ],
  // The old house's front on the photograph, one decal on each of its walls facing the Promenade (`a` on the left for
  // someone before it), from `y0` (under the ground) up to the wall's top; `risalit`: the projection with the porch
  oldFront: [
    { key: 'oldWest', a: [-335.4, -478.2], b: [-327.1, -485.2], y0: -2.5 },
    { key: 'oldA', a: [-331.8, -480.1], b: [-326.9, -484.2], y0: -2.5 },
    { key: 'oldB', a: [-325.9, -483.1], b: [-322.4, -486.0], y0: -2.5 },
    { key: 'oldC', a: [-322.1, -485.5], b: [-314.4, -492.0], y0: -2.5, risalit: true },
    { key: 'oldD', a: [-314.8, -492.4], b: [-310.1, -496.3], y0: -2.5 },
    { key: 'oldHip', a: oldLocal(66.6, 0.27), b: oldLocal(74.4, 0.27), y0: -3.0 }
  ],
  // The porch before the projection (along its wall, oldC): columns on a step, a balustrade on its flat roof
  porch: { from: 2.0, to: 8.1, depth: 2.6, top: 4.2, floor: -0.9 },
  // The pediment over the projection: its rise, how far it reaches back into the dome's block
  pediment: { rise: 2.4, back: 2.9 },
  // The dome's dormers: along its front (m from its left end), their width and height
  dormers: { at: [3.5, 7.5, 11.5, 15.5], w: 1.3, h: 1.6 },
  // The loggias of the east block's front: on the wall from `a` to `b`, `from` to `to` m along it, arches under its roof
  loggias: [
    { a: [-223.6, -536.7], b: [-214.3, -541.8], from: 0.4, to: 10.2 },
    { a: [-201.5, -548.8], b: [-191.3, -554.3], from: 0.6, to: 11.0 }
  ],
  loggia: { y0: 5.29, y1: 17.39, floors: 4, bay: 3.2 },
  // The canopy over the long wing's ground floor: under its first balconies, `out` m deep, where the car park is low
  canopy: { y: 1.05, out: 3.2, maxGround: -0.6 },
  // The balconies: `depth` m out, the bay's width less `gap`, on every floor over the ground floor
  balcony: { depth: 1.35, gap: 0.5, rail: 1.0, floors: 6 },
  // The glazed stair at the long wing's west end (on the front wall from `a` to `b`, `from` to `to` m along it)
  stair: { a: [-292.2, -512.6], b: [-268.0, -532.9], from: 0.6, to: 4.4 },
  // The name on the roof: over the long wing's front from `a` to `b`, `from` m along it, `w` m long, its letters `h` high
  name: { a: [-292.2, -512.6], b: [-268.0, -532.9], from: 5.0, w: 17.0, h: 2.2, back: 2.0 }
};

/** The parts by id */
export const part = (id) => BELVEDERE.parts.find((p) => p.id === id);

/** The south-east fronts: the photograph's side. A wall faces it when its outward normal points this way */
export const FRONT = OLD_N;
export const facesFront = (F, min = 0.85) => F.n[0] * FRONT[0] + F.n[1] * FRONT[1] > min;

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05;
/** The stretches of the wall a → b kept free of windows ([from, to] m along it): the loggias and the stair */
export function clearStretches(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), out = [];
  for (const m of [...BELVEDERE.loggias, BELVEDERE.stair]) {
    if (near(m.a, a) && near(m.b, b)) out.push([m.from, m.to]);
    else if (near(m.a, b) && near(m.b, a)) out.push([len - m.to, len - m.from]);
  }
  return out.sort((p, q) => p[0] - q[0]);
}
/** A wall cut into its stretches: [{ from, to, windows }] */
export function wallStretches(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), out = [];
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
/** Whether the wall a → b (either way round) is one the old house's front decals cover */
export const isOldFront = (a, b) => BELVEDERE.oldFront.some((f) => (near(f.a, a) && near(f.b, b)) || (near(f.a, b) && near(f.b, a)));

/** The balconies' places along a front wall of `len` m: the bays' middles (m along it), laid out from its middle as
 *  the wall's material lays out its windows, clear of the wall's ends and of `clear` stretches */
export function balconyBays(len, clear = []) {
  const { bay } = BELVEDERE, out = [];
  const n = Math.floor(len / 2 / bay);
  for (let k = -n; k <= n; k++) {
    const s = len / 2 + k * bay, half = (bay - BELVEDERE.balcony.gap) / 2;
    if (s - half < 0.4 || s + half > len - 0.4) continue;
    if (clear.some(([c0, c1]) => s + half > c0 - 0.2 && s - half < c1 + 0.2)) continue;
    out.push(s);
  }
  return out;
}

export const nameFrame = () => wallFrame(BELVEDERE.name.a, BELVEDERE.name.b);
