// js/geo.js
// The mapped town as the engine's modules read it: the geodata of js/davos-geodata.js (made by
// tools/build-davos-geodata.mjs) under the names they look for. The world frame is js/davos-frame.js (x east, z south,
// the origin on the Promenade between Davos Platz and the Kongresszentrum, grid north up).
import { DAVOS_DATA } from './davos-geodata.js';

const [minX, minZ, maxX, maxZ] = DAVOS_DATA.meta.bounds;

export const GEO = {
  // (the streets follow the mapped ways, not a grid: the irregular path of the road network, the traffic and the map)
  irregular: true,
  frame: { bearingDeg: 0, units: 'm' },
  // the mapped area's outline (the map's frame, js/city-config.js MAP_FRAME)
  mapFrame: [minX, minZ, maxX, minZ, maxX, maxZ, minX, maxZ],
  // the lakes and rivers drawn on the map (js/town-map.js), with the bounds a view must see to draw them
  waters: { bounds: { minX, maxX, minZ, maxZ }, water: DAVOS_DATA.water },
  parks: DAVOS_DATA.parks.map((p) => ({ name: p.name, kind: p.kind, rings: [p.ring], holes: p.holes })),
  landmarks: DAVOS_DATA.landmarks,
  roadGraph: DAVOS_DATA.roadGraph,
  town: DAVOS_DATA
};
