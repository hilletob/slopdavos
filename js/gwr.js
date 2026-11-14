import { GWR } from './gwr-data.js';

// The Federal Register of Buildings and Dwellings (GWR, © BFS; js/gwr-data.js, tools/build-gwr.mjs) for the facades of
// the swissBUILDINGS3D buildings (js/swissbuildings3d.js): each building takes the register entry nearest its surveyed
// centre (within MATCH_RADIUS) and from its class, storeys and year one of the facade kinds below.
export const FACADE = Object.freeze({
  UNKNOWN: 0, // no register entry: the facade is chosen at random by height (chalet, hotel, town house)
  CHALET: 1, // stone plinth, plaster, larch boarding above, small shuttered windows
  HOTEL: 2, // hotels, sanatoria and clinics: balcony bands on the south fronts
  TOWNHOUSE: 3, // plastered flats, windows in white frames, some shuttered, no shops
  PLAIN: 4, // offices, schools, industry, transport: wide windows, no shutters, windows on the ground floor too
  CHURCH: 5, // churches: tall narrow windows
  SHOPS: 6, // town house with shop fronts on the ground floor (retail, restaurants, mixed use)
  BARN: 7, // farm buildings: timber boarding over the plinth, no windows
  SHED: 8 // garages, stores, huts: plain walls, no windows
});
export const MATCH_RADIUS = 15;

// The facade kind of a register entry: k (GKLAS − 1000, or GKAT − 1000; + 1000 for mixed use), f storeys (GASTW, 0
// unknown), y year (0 unknown), r the building's random number in [0, 1)
export function gwrFacade(k, f, y, r) {
  const mixed = k >= 1000, cls = k % 1000;
  const low = f <= 3; // (unknown counts as low)
  const old = y > 0 && y < 1950;
  switch (cls) {
    case 110: case 121: // one- and two-family houses: chalets before 1950, about half of the newer ones
      if (mixed) return FACADE.SHOPS;
      return low && (old || r < 0.45) ? FACADE.CHALET : FACADE.TOWNHOUSE;
    case 20: // residential only, no class
      return low && (old || r < 0.45) ? FACADE.CHALET : FACADE.TOWNHOUSE;
    case 122: // blocks of flats: old small ones are chalets
      if (mixed) return FACADE.SHOPS;
      return low && y > 0 && y < 1919 ? FACADE.CHALET : FACADE.TOWNHOUSE;
    case 130: return mixed ? FACADE.SHOPS : FACADE.TOWNHOUSE; // homes for communities
    case 211: case 212: case 264: case 275: return FACADE.HOTEL; // hotels, holiday lodgings, clinics, collective lodgings
    case 230: case 231: case 30: case 40: return FACADE.SHOPS; // retail, restaurants, partly residential
    case 220: case 241: case 251: case 261: case 262: case 263: case 265: case 60: return FACADE.PLAIN;
    case 272: return FACADE.CHURCH;
    case 273: return low ? FACADE.CHALET : FACADE.TOWNHOUSE; // listed monuments
    case 271: case 276: case 277: case 278: return FACADE.BARN;
    case 242: case 252: case 274: case 10: case 80: return FACADE.SHED;
    default: return FACADE.UNKNOWN;
  }
}

// The storey height of a building `height` m tall (foot to ridge) with f storeys above ground; 0: the facade's default
export function gwrStoreyHeight(kind, f, height) {
  if (kind === FACADE.CHURCH) return Math.min(9, Math.max(4.5, height * 0.5));
  if (kind === FACADE.BARN || kind === FACADE.SHED || f < 2 || !(height > 0)) return 0;
  // (the roof above the top storey: half a storey on average)
  return Math.min(3.8, Math.max(2.5, height / (f + 0.5)));
}

// A grid of the register entries (CELL m) for the nearest-entry lookup
const CELL = 32;
let grid = null;
function buildGrid(data) {
  const cells = new Map();
  for (let i = 0; i < data.x.length; i++) {
    const key = `${Math.floor(data.x[i] / CELL)},${Math.floor(data.z[i] / CELL)}`;
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(i);
  }
  return cells;
}

// How many register entries lie within `radius` of (x, z), counting up to `max`: is this built-up land?
export function gwrCount(x, z, radius, max = Infinity) {
  grid ??= buildGrid(GWR);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), reach = Math.ceil(radius / CELL);
  let count = 0;
  for (let i = cx - reach; i <= cx + reach; i++) for (let j = cz - reach; j <= cz + reach; j++) {
    for (const n of grid.get(`${i},${j}`) || []) {
      if ((GWR.x[n] - x) ** 2 + (GWR.z[n] - z) ** 2 <= radius * radius && ++count >= max) return count;
    }
  }
  return count;
}

// The index of the register entry nearest (x, z) within `radius`, or -1
export function nearestGwr(x, z, radius = MATCH_RADIUS, data = GWR) {
  if (data === GWR) grid ??= buildGrid(GWR);
  const cells = data === GWR ? grid : buildGrid(data);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), reach = Math.ceil(radius / CELL);
  let best = -1, bestD = radius * radius;
  for (let i = cx - reach; i <= cx + reach; i++) for (let j = cz - reach; j <= cz + reach; j++) {
    for (const n of cells.get(`${i},${j}`) || []) {
      const d = (data.x[n] - x) ** 2 + (data.z[n] - z) ** 2;
      if (d <= bestD) { bestD = d; best = n; }
    }
  }
  return best;
}

// The register's facade for a building centred at (x, z): { kind, storeyH, entry } (kind UNKNOWN without an entry)
export function gwrBuilding(x, z, r, height) {
  const n = nearestGwr(x, z);
  if (n < 0) return { kind: FACADE.UNKNOWN, storeyH: 0, entry: -1 };
  let kind = gwrFacade(GWR.k[n], GWR.f[n], GWR.y[n], r);
  // (a big "shed" is a sports hall, a car park or a works building: windows after all)
  if (kind === FACADE.SHED && height > 10) kind = FACADE.PLAIN;
  return { kind, storeyH: gwrStoreyHeight(kind, GWR.f[n], height), entry: n };
}
