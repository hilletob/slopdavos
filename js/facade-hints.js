// What street photographs say about the streamed houses' outsides (js/facade-hints-data.js, written by
// tools/build-facade-hints.mjs from looks recorded per OpenStreetMap building): the wall's colour, how much of it is
// timber, the kind of house, its storeys and its roof's colour. js/swissbuildings3d.js asks hintAt() with each surveyed
// building's centre and lets a confident hint come before the register's guess and the measured colour.
import { FACADE_HINTS } from './facade-hints-data.js';
import { FACADE } from './gwr.js';

const CELL = 64;
const KINDS = { townhouse: FACADE.TOWNHOUSE, chalet: FACADE.CHALET, hotel: FACADE.HOTEL, block: FACADE.TOWNHOUSE, office: FACADE.PLAIN, shop: FACADE.SHOPS, barn: FACADE.BARN, shed: FACADE.SHED, church: FACADE.CHURCH };
let grid = null;

function inRing(r, x, z) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function build() {
  grid = new Map();
  for (const [id, h] of Object.entries(FACADE_HINTS.buildings)) {
    const ring = h.ring;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) { x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]); z0 = Math.min(z0, ring[i + 1]); z1 = Math.max(z1, ring[i + 1]); }
    const entry = { id, ...h };
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = cx * 100003 + cz;
        (grid.get(k) || grid.set(k, []).get(k)).push(entry);
      }
    }
  }
}

/**
 * The hint for the building whose OpenStreetMap outline holds (x, z), or null: { id, wall: [r, g, b] sRGB 0–255,
 * timber 0–100, kind (its name), storeys, roof: [r, g, b] sRGB 0–255 or null, roofKind ('flat', 'tiles', …), shop,
 * balconies, confidence }
 */
export function hintAt(x, z) {
  if (!grid) build();
  const list = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
  if (!list) return null;
  for (const h of list) if (inRing(h.ring, x, z)) return h;
  return null;
}

/** The facade kind a hint asks for (js/gwr.js FACADE): shops on the ground floor and balcony bands taken into account */
export function hintKind(h) {
  let kind = KINDS[h.kind] ?? FACADE.UNKNOWN;
  if (h.shop && (kind === FACADE.TOWNHOUSE || kind === FACADE.PLAIN)) kind = FACADE.SHOPS;
  if (h.kind === 'block' && h.balconies) kind = FACADE.HOTEL;
  if (h.timber >= 45 && kind !== FACADE.BARN && kind !== FACADE.CHURCH && kind !== FACADE.SHED) kind = FACADE.CHALET;
  return kind;
}

/** A storey height from the hint's storeys over the building's surveyed height (0: leave it to the register) */
export function hintStoreyHeight(h, height) {
  if (!(h.storeys > 0)) return 0;
  const pitched = h.roofKind !== 'flat';
  const s = height / (h.storeys + (pitched ? 0.8 : 0.25));
  return s >= 2.4 && s <= 4.2 ? s : 0;
}

export { KINDS as HINT_KINDS };
