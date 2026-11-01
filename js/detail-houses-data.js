// Hand-built houses (js/detail-houses.js): where they stand and how big they are. Pure data and frame maths, shared by
// the browser module and the tests.
//
// Each house has a local frame: x along the ridge, z towards its front (the eaves side with the lean-to), y up from the
// foot of the house; `frame()` gives the world position and the rotation about y (three.js: local x → (cos θ, −sin θ), local z → (sin θ, cos θ)).

export const DETAIL_HOUSES = [
  {
    id: 'dischmastrasse-19',
    address: 'Dischmastrasse 19, 7260 Davos Dorf',
    // geo.admin.ch address point (LV95) and the OSM footprint w126895345 (world x, z), whose west side faces the
    // Dischmastrasse; the swissBUILDINGS3D building (tile 11/1753/1019, batch 10, Einzelhaus, 10.97 m) stands there
    lv95: [2783293.5, 1186549.75],
    footprint: [[782.5, -1053.3], [793.3, -1056.4], [796.1, -1046.6], [785.3, -1043.5]],
    // The ridge runs east–west, from the west gable (A, the balcony, facing the Dischmastrasse) to the east gable (B,
    // the door with its outdoor stair); the eaves side with the lean-to faces south (D–C). (First modelled a quarter
    // turn clockwise, ridge along the street; turned 90° counter-clockwise after the owner's check.)
    ridgeFrom: 0, ridgeTo: 1, streetSide: [3, 2],
    // The picket fence (local [x, z] segments) along the parcel (AV parcel 1390: a triangle that runs out to a point
    // south of the house between the Dischmastrasse and its straight eastern boundary): the street side from the
    // north corner to the point, back up the eastern boundary (with its bend) and along the north boundary
    fence: [[[-19.02, -12.27], [-17.52, 30.29]], [[-17.52, 30.29], [13.34, 7.52]], [[13.34, 7.52], [11.11, -9.35]], [[11.11, -9.35], [-19.02, -12.27]]],
    // The swissBUILDINGS3D building it replaces: everything whose surveyed centre lies within r of (x, z)
    exclude: { x: 789.4, z: -1049.9, r: 6 },
    // The house as measured on the owner's 3D scan ("Grialetsch", Scaniverse/LiDAR, 2026-10-31) and built from those
    // numbers (js/detail-houses.js), its walls wearing photographs of themselves baked out of the scan by
    // tools/build-detail-house-scan.mjs. Everything here is in the house's local frame: x along the ridge to the east
    // gable, z to the south front, y up from the ground; the walls centred on the footprint's centre. The scan is metric
    // (the door 2.0 m; the roof's outline 11.0 × 11.3 m against swissBUILDINGS3D's 11.07 × 11.37 m) and level; its roof
    // a low Davos roof — 18.6°, the ridge 8.35 m over the ground and 0.6 m north of the middle (swissBUILDINGS3D: the
    // ridge 1.7 m over the eaves), not the 38° of the first, photo-based model.
    model: {
      atlas: 'assets/models/dischmastrasse-19-facades.jpg',
      // the scan's raw frame → this one: turned by yaw (degrees) about y, then moved by (dx, dz)
      scanFrame: { yaw: 4.5, dx: 0.535, dz: 0.045 },
      // the log walls' outer faces; the white plinth below plinthTop
      walls: { x: [-4.215, 4.215], z: [-4.875, 4.875] }, plinthTop: 1.9,
      // the gable roof (from the verges' top edges on both gables): the ridge at z, y; slope rise/run; its outline;
      // the mono-pitch roofs over the lean-to (falling south) and over the porch before the door (falling east): x, z
      // their extent, y0 / y1 the top face at the first / second edge along `fall`
      roof: { ridgeZ: -0.6, ridgeY: 8.35, slope: 0.337, x: [-5.55, 5.65], z: [-5.85, 5.65], thickness: 0.18 },
      leanRoofs: [{ fall: 'z', x: [-4.7, 0.5], z: [4.875, 6.2], y0: 4.95, y1: 4.45 }, { fall: 'x', x: [5.05, 6.75], z: [-1.2, 2.15], y0: 5.4, y1: 4.55 }],
      // the lean-to (Schopf) on the south front, flush with the west gable; the porch with the front door on the east
      // gable (the door facing south onto the landing); the Laube, a closed gallery on the east gable above the stair's
      // foot; the landing and the outdoor stair down to the south; the balcony on the west gable
      leanTo: { x: [-4.215, 0.4], z: [4.875, 5.6], top: 4.75 },
      porch: { x: [4.215, 6.0], z: [-0.85, 1.3], top: 4.8 },
      laube: { x: [4.215, 4.95], z: [1.3, 4.95], floor: 1.95 },
      landing: { x: [4.95, 6.0], z: [1.3, 2.3], y: 1.95 },
      stair: { x: [5.1, 5.95], z: [2.3, 4.75] },
      balcony: { x: [-5.45, -4.215], z: [-2.8, 1.8], floor: 4.3, rail: 5.15 },
      // in the plinth: the garage door (west), [face, from, to along it, y0, y1]
      doors: [['W', -3.6, -1.3, 0, 1.75]],
      // the windows' glazing (read off orthographic views of the scan): face, from/to along it (S, N: x; E, W: z),
      // height from/to; each sits in whichever wall of that face it lies on. They glow at night
      windows: [
        ['S', -3.0, -0.75, 2.8, 3.9], ['S', 1.35, 2.75, 3.1, 3.9], ['S', 2.05, 3.2, 0.35, 1.1], ['S', 5.1, 5.8, 3.1, 3.85],
        ['E', 2.4, 3.8, 5.55, 6.2], ['E', -3.75, -2.25, 5.4, 6.5], ['E', 2.35, 3.5, 3.25, 4.0], ['E', -0.2, 1.2, 2.8, 3.95],
        ['E', -3.7, -2.25, 2.85, 4.0], ['E', -1.6, -0.85, 0.9, 1.45],
        ['W', -3.7, -2.2, 5.6, 6.7], ['W', -3.55, -2.05, 2.8, 3.95], ['W', 0.9, 2.75, 2.8, 3.9], ['W', 4.05, 5.5, 2.8, 3.9],
        ['W', 1.1, 2.2, 0.4, 1.2]
      ],
      // The photographs: orthographic views of the scan, one per direction (the outward axis and its sign), over
      // `a` (x for S/N, z for E/W) and y, of the front-most surface within `slab` (on the outward axis; so the trees,
      // the car, the neighbours stay out); packed into one atlas (facadeLayout()). (The plinth below plinthTop is
      // plastered here, not photographed: only the lean-to's and the porch's feet are)
      bakes: {
        S: { axis: 'z', out: 1, a: [-4.3, 5.0], y: [-0.6, 6.6], slab: [4.5, 5.8] },
        N: { axis: 'z', out: -1, a: [-4.3, 4.3], y: [1.8, 6.8], slab: [-5.3, -4.5] },
        W: { axis: 'x', out: -1, a: [-4.95, 5.65], y: [1.8, 8.2], slab: [-4.8, -3.85] },
        E: { axis: 'x', out: 1, a: [-4.95, 5.0], y: [1.8, 8.2], slab: [3.85, 5.15] },
        porchE: { axis: 'x', out: 1, a: [-0.9, 1.35], y: [-0.6, 4.85], slab: [5.6, 6.3] },
        porchS: { axis: 'z', out: 1, a: [4.2, 6.05], y: [-0.6, 4.85], slab: [1.0, 2.0] },
        leanToE: { axis: 'x', out: 1, a: [4.85, 5.65], y: [-0.6, 4.8], slab: [0.1, 0.9] }
      }
    }
  }
];

// The height of the house's roof (its top face) at local z
export function scanRoofY(roof, z) {
  return roof.ridgeY - roof.slope * Math.abs(z - roof.ridgeZ);
}

// The facade atlas' layout: every bake its rectangle (px, top-left origin) at one scale (px per metre), the largest
// that packs them (shelves, tallest first, PAD px apart) into size²
export function facadeLayout(bakes, size = 2048, pad = 4) {
  const keys = Object.keys(bakes);
  const pack = (s) => {
    const items = keys.map((k) => ({ k, w: Math.ceil((bakes[k].a[1] - bakes[k].a[0]) * s), h: Math.ceil((bakes[k].y[1] - bakes[k].y[0]) * s) }))
      .sort((p, q) => q.h - p.h || (p.k < q.k ? -1 : 1));
    let x = 0, y = 0, shelf = 0;
    const rects = {};
    for (const it of items) {
      if (it.w + 2 * pad > size) return null;
      if (x + it.w + 2 * pad > size) { y += shelf; x = 0; shelf = 0; }
      if (y + it.h + 2 * pad > size) return null;
      rects[it.k] = { x: x + pad, y: y + pad, w: it.w, h: it.h };
      x += it.w + 2 * pad; shelf = Math.max(shelf, it.h + 2 * pad);
    }
    return rects;
  };
  let lo = 1, hi = 1000;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (pack(m)) lo = m; else hi = m; }
  const scale = Math.floor(lo * 100) / 100;
  return { size, scale, rects: pack(scale) };
}

// The uv of the point (a, y) of a bake in the atlas (glTF orientation: v down)
export function facadeUV(layout, bake, key, a, y) {
  const r = layout.rects[key];
  return [(r.x + (a - bake.a[0]) * layout.scale) / layout.size, (r.y + (bake.y[1] - y) * layout.scale) / layout.size];
}

// The local frame of a house: centre, length along the ridge, depth across it, rotation about y
export function frame(house) {
  const f = house.footprint;
  const a = f[house.ridgeFrom], d = f[house.ridgeTo];
  const cx = f.reduce((s, p) => s + p[0], 0) / f.length, cz = f.reduce((s, p) => s + p[1], 0) / f.length;
  const ux = d[0] - a[0], uz = d[1] - a[1], length = Math.hypot(ux, uz);
  // across: the other side of the footprint at A (its neighbour that isn't the ridge's other end)
  const next = (house.ridgeFrom + 1) % f.length, prev = (house.ridgeFrom + f.length - 1) % f.length;
  const b = f[next === house.ridgeTo ? prev : next];
  const depth = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // local x = u; local z = the outward normal of the front (eaves) side
  const [s0, s1] = house.streetSide.map((i) => f[i]);
  const mx = (s0[0] + s1[0]) / 2 - cx, mz = (s0[1] + s1[1]) / 2 - cz;
  let vx = -uz / length, vz = ux / length;
  if (vx * mx + vz * mz < 0) { vx = -vx; vz = -vz; }
  const theta = Math.atan2(-uz, ux); // local x (1, 0, 0) → (cos θ, −sin θ) = u
  return { cx, cz, length, depth, theta, u: [ux / length, uz / length], v: [vx, vz] };
}

// World (x, z) of a local (x, z)
export function toWorld(fr, lx, lz) {
  const cs = Math.cos(fr.theta), sn = Math.sin(fr.theta);
  return [fr.cx + lx * cs + lz * sn, fr.cz - lx * sn + lz * cs];
}
