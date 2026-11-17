import { WORLD_BOUNDS } from './davos-frame.js';

// js/heat-trail.js
// Where the players go, for the public heat map (heatmap.html, js/heatmap-page.js): the world in cells of HEAT_CELL
// metres, and a count for every cell the player enters, by the group of the way of travel. Standing counts nothing, a
// teleport neither. Only a signed-in player's trail is collected (js/account-sync.js starts it and sends the cells with
// the cloud save's rhythm, supabase/migrations/*_heatmap.sql heat_add); the server keeps the counts per cell with no
// player beside them.

export const HEAT_CELL = 16; // m
export const HEAT_ORIGIN = [WORLD_BOUNDS[0], WORLD_BOUNDS[1]];
export const HEAT_SIZE = [Math.ceil((WORLD_BOUNDS[2] - WORLD_BOUNDS[0]) / HEAT_CELL), Math.ceil((WORLD_BOUNDS[3] - WORLD_BOUNDS[1]) / HEAT_CELL)];
/** The groups, by their index on the wire and in the table */
export const HEAT_GROUPS = ['foot', 'wheels', 'snow', 'air', 'rail'];
export const SEND_CELLS = 2000; // (cells a call: heat_add takes no more)
const JUMP = 150; // m in one frame: a teleport, not travel (as js/play-stats.js)
const MAX_CELLS = 6000; // (kept while the network is away; the trail beyond is dropped)

const GROUP_OF = {
  walk: 0, climbing: 0, waterslide: 0,
  car: 1, bus: 1, bike: 1, cargobike: 1, quad: 1, 'snow-blower': 1, mower: 1, 'garbage-truck': 1, truck: 1, crane: 1,
  skateboard: 1, toboggan: 1,
  ski: 2, snowboard: 2, 'xc-ski': 2, sledge: 2, snowshoe: 2, snowcat: 2, skates: 2,
  helicopter: 3, paraglider: 3,
  'train-driver': 4, 'train-passenger': 4
};

/** The group (index into HEAT_GROUPS) of a way of travel (js/play-stats.js TRAVEL_KINDS) */
export const heatGroup = (kind) => GROUP_OF[kind] ?? 0;

/** The cell of a place: [ix, iz], or null outside the world */
export function heatCell(x, z) {
  const ix = Math.floor((x - HEAT_ORIGIN[0]) / HEAT_CELL), iz = Math.floor((z - HEAT_ORIGIN[1]) / HEAT_CELL);
  return ix >= 0 && iz >= 0 && ix < HEAT_SIZE[0] && iz < HEAT_SIZE[1] ? [ix, iz] : null;
}

const keyOf = (g, ix, iz) => (g * 4096 + ix) * 4096 + iz;

export function createHeatTrail({ max = MAX_CELLS } = {}) {
  const cells = new Map(); // key -> count
  let on = false;
  let last = null; // { key, x, z }: where the player was last frame
  const add = (key, n) => {
    if (cells.has(key)) cells.set(key, cells.get(key) + n);
    else if (cells.size < max) cells.set(key, n);
  };

  return {
    /** From now on the trail is collected (a signed-in player) */
    start() { on = true; },
    get size() { return cells.size; },
    /** Every frame: `kind` the way of travel (travelKind()), `position` the player's { x, z } */
    tick(kind, position) {
      if (!on || !position) return;
      const cell = heatCell(position.x, position.z);
      if (!cell) { last = null; return; }
      const key = keyOf(heatGroup(kind), cell[0], cell[1]);
      const moved = last && key !== last.key && Math.hypot(position.x - last.x, position.z - last.z) < JUMP;
      if (moved) add(key, 1);
      last = { key, x: position.x, z: position.z };
    },
    /** Up to `limit` cells off the trail, as heat_add takes them: [g, ix, iz, n, …] */
    take(limit = SEND_CELLS) {
      const flat = [];
      for (const [key, n] of cells) {
        if (flat.length >= limit * 4) break;
        flat.push(Math.floor(key / (4096 * 4096)), Math.floor(key / 4096) % 4096, key % 4096, n);
        cells.delete(key);
      }
      return flat;
    },
    /** Cells that did not get through, back on the trail */
    restore(flat) {
      for (let i = 0; i + 3 < flat.length; i += 4) add(keyOf(flat[i], flat[i + 1], flat[i + 2]), flat[i + 3]);
    }
  };
}
