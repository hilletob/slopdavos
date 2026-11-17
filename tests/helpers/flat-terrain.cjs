// Import stubs for js/terrain.js, js/davos-frame.js and js/air-obstacle-field.js: a flat world at y = 0 without bridges, so that the engine's
// unit tests keep testing behaviour (the relief has its own tests: terrain-grid.test.mjs, zurich.test.mjs).
const terrain = {
  groundHeight: () => 0,
  surfaceHeight: () => 0,
  cameraGround: () => 0,
  deckHeight: () => NaN,
  deckHalfWidth: () => 3,
  waterSurfaceHeight: () => 0,
  // The engine's own flat world: roadway at 0, raised sidewalks
  ROAD_TOP: 0,
  SIDEWALK_TOP: 0.22
};
const frame = {
  FRAME: { E0: 2683000, N0: 1247700, H0: 406 },
  lv95ToWorld: (E, N) => ({ x: E - 2683000, z: 1247700 - N })
};
// (no power lines, cables or masts in the air: js/air-obstacle-field.js has its own test, air-obstacles.test.mjs)
const airObstacles = { airObstacleContact: () => null };
module.exports = { flatTerrainImports: { './terrain.js': terrain, './davos-frame.js': frame, './air-obstacle-field.js': airObstacles } };
