import { wgs84ToLv95, lv95ToWgs84 } from './swiss-projection.js';

// The Davos world frame, shared by the data tools and the browser.
// 1 unit = 1 m, x = LV95 east, z = LV95 south (grid north = -z), y = height above the Davosersee (≈ 1558 m a.s.l.).
// The origin (LV95 2782500 / 1185500) lies on the Promenade between Davos Platz and the Kongresszentrum; LV95 is a
// conformal metric grid, so the frame is a plain offset.
export const FRAME = {
  name: 'Davos · Landwassertal & Dischma',
  E0: 2782500,
  N0: 1185500,
  H0: 1558,
  // LV95 extent of the mapped area [minE, minN, maxE, maxN]: Frauenkirch in the south-west, the Davosersee and Wolfgang
  // in the north, the Dischma up to Dürrboden in the south-east (10.8 × 13 km)
  lv95: [2779600, 1176800, 2790400, 1189800],
  // Grid spacing of the terrain model (tools/build-davos-terrain.mjs): 8 m keeps the 140 km² mesh at ~2.2 M vertices
  terrainCell: 8
};

export const lv95ToWorld = (east, north) => ({ x: east - FRAME.E0, z: FRAME.N0 - north });
export const worldToLv95 = (x, z) => ({ E: FRAME.E0 + x, N: FRAME.N0 - z });
export const lonLatToWorld = (lon, lat) => { const p = wgs84ToLv95(lon, lat); return lv95ToWorld(p.E, p.N); };
export const worldToLonLat = (x, z) => { const p = worldToLv95(x, z); return lv95ToWgs84(p.E, p.N); };

// World bounds [minX, minZ, maxX, maxZ]
export const WORLD_BOUNDS = [
  FRAME.lv95[0] - FRAME.E0, FRAME.N0 - FRAME.lv95[3], FRAME.lv95[2] - FRAME.E0, FRAME.N0 - FRAME.lv95[1]
];
