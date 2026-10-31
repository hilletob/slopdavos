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
    // The picket fence (local [x, z] segments): along the Dischmastrasse in front of the west gable, and round the
    // corner in front of the south front (photo 2)
    fence: [[[-9.35, -9.6], [-9.35, 8.6]], [[-9.35, 8.6], [9.5, 8.6]]],
    height: 10.6, eaves: 6.2, plinth: 1.1,
    // The swissBUILDINGS3D building it replaces: everything whose surveyed centre lies within r of (x, z)
    exclude: { x: 789.4, z: -1049.9, r: 6 }
  }
];

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
