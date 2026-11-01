// js/world-cells.js
// The cells of the streamed world (js/world-stream.js): the mobile profile (js/quality.js worldRadius) builds the
// streets, markings, track bed and car parks in square cells of WORLD_CELL m round the player and removes them again
// behind. Pure arithmetic, shared with the tests.

export const WORLD_CELL = 500; // m

/** The cell's key, as the streamer names it */
export const cellKey = (i, j) => `${i}/${j}`;

/** How far (x, z) is from the cell's square (0 inside it) */
export function cellDistance(i, j, x, z, cell = WORLD_CELL) {
  const minX = i * cell, maxX = minX + cell, minZ = j * cell, maxZ = minZ + cell;
  const dx = Math.max(minX - x, 0, x - maxX), dz = Math.max(minZ - z, 0, z - maxZ);
  return Math.hypot(dx, dz);
}

/** The cells ({ i, j, d }) whose squares come within `radius` of (x, z), nearest first */
export function cellsAround(x, z, radius, cell = WORLD_CELL) {
  const out = [];
  for (let j = Math.floor((z - radius) / cell); j <= Math.floor((z + radius) / cell); j++) {
    for (let i = Math.floor((x - radius) / cell); i <= Math.floor((x + radius) / cell); i++) {
      const d = cellDistance(i, j, x, z, cell);
      if (d <= radius) out.push({ i, j, d });
    }
  }
  out.sort((a, b) => a.d - b.d || a.j - b.j || a.i - b.i);
  return out;
}

/**
 * Which of the live cells (keys) to drop for a player at (x, z): those farther than radius + hysteresis from their
 * square, so that a player pacing along a cell's edge never has it built and torn down again and again.
 */
export function cellsToDrop(liveKeys, x, z, radius, hysteresis, cell = WORLD_CELL) {
  const out = [];
  for (const key of liveKeys) {
    const [i, j] = key.split('/').map(Number);
    if (cellDistance(i, j, x, z, cell) > radius + hysteresis) out.push(key);
  }
  return out;
}
