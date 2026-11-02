// js/vehicle-depots.js
// The GTA mode (js/gta.js): where the player's vehicles stand in the world, and the rules for getting in and out.
// Pure data and functions (no three.js), shared by the game and the tests.
//
// There is one controlled entity per vehicle type (js/controllers.js). Every other vehicle of the type is a parked
// stand-in (a light copy of the model with a collider, js/gta.js): getting into one moves the real entity to its place
// and leaves a stand-in where the real one stood. So any number of places can each have their vehicle.
//
// World frame (js/davos-frame.js): x = E - 2782500, z = 1185500 - N (metres), heading = atan2(dx, dz) (0: south,
// pi/2: east). The places were picked with the terrain loaded (slope, buildings, roads and car parks round them);
// `season`: 'winter' (the snow groomers: in summer they stay in their sheds), 'all' otherwise.

/** The vehicle types the pedestrian can get into (the controllers' modes) and their names in the prompt */
export const VEHICLE_LABELS = {
  car: 'VW T3',
  cyclist: 'bike',
  helicopter: 'Rega H145',
  snowcat: 'snow groomer'
};

/**
 * How close (m) the pedestrian must stand to a parked vehicle's outline (its footprint, VEHICLE_FOOTPRINTS) to get in.
 * The helicopter's outline is its cabin, the rotor reaches past it.
 */
export const ENTER_RADIUS = { car: 3.5, cyclist: 3, helicopter: 6, snowcat: 5 };

/** Half width (across) and half length (along) of each vehicle's outline, m (the controllers' boxes) */
export const VEHICLE_FOOTPRINTS = {
  car: { halfW: 0.93, halfL: 2.33 },
  cyclist: { halfW: 0.3, halfL: 0.85 },
  helicopter: { halfW: 1.3, halfL: 4.6 },
  snowcat: { halfW: 2.2, halfL: 3.6 }
};

/** Getting out: the vehicle must stand still (m/s); the helicopter must have landed (height over the ground, m) */
export const EXIT_MAX_SPEED = 0.6;
export const EXIT_MAX_AGL = 0.5;
/** A train is boarded from within this distance of a car's side (m), while it stands at a platform */
export const BOARD_RADIUS = 6;

/** Where the game begins on a first visit: on foot by the Bahnhof Davos Platz, the bike stand and a T3 in sight */
export const GTA_START = { x: -638, z: 462, heading: -2.46 };

export const DEPOTS = [
  // --- Snow groomers (winter) ----------------------------------------------------------------------------------------
  // on the Bündawiese in Davos Dorf beside the City-Trail (the groomer's start before the GTA mode)
  { id: 'cat-buenda', type: 'snowcat', x: 900, z: -1062, heading: 1.889, season: 'winter', label: 'Bünda, Davos Dorf' },
  // by the Jakobshornbahn's valley station, at the foot of the Bolgen slope (clear of the car park)
  { id: 'cat-jakobshorn', type: 'snowcat', x: -478, z: 578, heading: 2.6, season: 'winter', label: 'Talstation Jakobshorn' },
  // at the Parsennbahn's Höhenweg station (the funicular's change of sections, the Parsenn pistes)
  { id: 'cat-hoehenweg', type: 'snowcat', x: -563, z: -2634, heading: -1.6, season: 'winter', label: 'Parsenn Höhenweg' },
  // at the Rinerhorn's mountain station (Jatzmeder): the valley station at Glaris lies beyond the map's south-west edge
  { id: 'cat-rinerhorn', type: 'snowcat', x: -1856, z: 5764, heading: 1.5, season: 'winter', label: 'Rinerhorn (Jatzmeder)' },
  // on the Schatzalp's terrace by the funicular's top station
  { id: 'cat-schatzalp', type: 'snowcat', x: -1101.8, z: -588, heading: 0.6, season: 'winter', label: 'Schatzalp' },
  // at the start of the Dischma trail (the mission's "Dischmatal Warm-Up", OSM w1034080622), beside the track
  { id: 'cat-dischma', type: 'snowcat', x: 1568, z: -160, heading: 1.51, season: 'winter', label: 'Dischma-Loipe' },

  // --- Rega H145 (on level ground: slope under 8°) ---------------------------------------------------------------------
  // on the Spital Davos' landing pad (js/helipad.js HELIPAD: x -1139, z 924.5, turned 0.17 rad)
  { id: 'heli-spital', type: 'helicopter', x: -1139, z: 924.5, heading: 0.17, season: 'all', label: 'Spital Davos helipad' },
  // below the Jakobshorn's summit station (the cable car's Sektion 2 top, 2590 m), on the flat by the ridge
  { id: 'heli-jakobshorn', type: 'helicopter', x: 1596.9, z: 2534.5, heading: -2.4, season: 'all', label: 'Jakobshorn' },
  // on the Weissfluhjoch (the Parsennbahn's top station, 2663 m), south-east of the station
  { id: 'heli-weissfluhjoch', type: 'helicopter', x: -1878.8, z: -4136.6, heading: 2.4, season: 'all', label: 'Weissfluhjoch' },
  // on the Schatzalp's meadow below the hotel
  { id: 'heli-schatzalp', type: 'helicopter', x: -1153.8, z: -516, heading: 2.2, season: 'all', label: 'Schatzalp meadow' },

  // --- VW T3 ----------------------------------------------------------------------------------------------------------
  // in the roadside bays of the Talstrasse by the Bahnhof Davos Platz (OSM w852636741), in view of the start
  { id: 'car-platz', type: 'car', x: -651.2, z: 445.4, heading: -0.598, season: 'all', label: 'Bahnhof Davos Platz' },
  // on the Dischmastrasse in Davos Dorf (the van's place before the GTA mode, js/controllers.js CAR_HOME)
  { id: 'car-dischma', type: 'car', x: 678.5, z: -1163.9, heading: -1.631, season: 'all', label: 'Dischmastrasse' },
  // beside the Berglistutz at the Postplatz, a few steps off the Promenade (the car park itself is full of cars)
  { id: 'car-promenade', type: 'car', x: -601.3, z: 281.6, heading: 1.294, season: 'all', label: 'Postplatz, Promenade' },

  // --- Bikes (stands) -------------------------------------------------------------------------------------------------
  { id: 'bike-platz', type: 'cyclist', x: -644, z: 454, heading: 0.95, season: 'all', label: 'Bahnhof Davos Platz' },
  { id: 'bike-dorf', type: 'cyclist', x: 903.3, z: -1599.6, heading: 0.67, season: 'all', label: 'Bahnhof Davos Dorf' },
  // on the Talstrasse by the Seehof Seeli (the cyclist's start before the GTA mode)
  { id: 'bike-seehof', type: 'cyclist', x: 782.9, z: -1422.3, heading: -0.15, season: 'all', label: 'Seehof Seeli' }
];

/** Is a depot (or a parked vehicle with a season) in use in this season? */
export const inSeason = (item, winter) => !item.season || item.season === 'all' || (item.season === 'winter') === !!winter;

/** The season of a vehicle type left somewhere by the player (the groomers only in winter) */
export const seasonOf = (type) => (type === 'snowcat' ? 'winter' : 'all');

/**
 * Distance (m) from (x, z) to the outline of a vehicle of `type` standing at (vx, vz) with `heading`: 0 inside.
 */
export function distanceToVehicle(type, vx, vz, heading, x, z) {
  const f = VEHICLE_FOOTPRINTS[type] || { halfW: 0.5, halfL: 0.5 };
  const sn = Math.sin(heading || 0), cs = Math.cos(heading || 0);
  const dx = x - vx, dz = z - vz;
  const along = dx * sn + dz * cs;
  const across = dx * cs - dz * sn;
  return Math.hypot(Math.max(0, Math.abs(across) - f.halfW), Math.max(0, Math.abs(along) - f.halfL));
}

/**
 * The vehicle the pedestrian at `player` ({ x, y?, z }) can get into: the nearest of `candidates` ({ type, x, y?, z,
 * heading, ... }) within its ENTER_RADIUS of the outline (and within 3 m of height, not one parked on a roof above),
 * or null. Returns the candidate with its `distance`.
 */
export function findEnterable(player, candidates, { radius = ENTER_RADIUS } = {}) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const r = radius[c.type];
    if (!(r > 0)) continue;
    if (Number.isFinite(player.y) && Number.isFinite(c.y) && Math.abs(player.y - c.y) > 3) continue;
    const d = distanceToVehicle(c.type, c.x, c.z, c.heading, player.x, player.z);
    if (d <= r && d < bestD) { best = c; bestD = d; }
  }
  return best ? { ...best, distance: bestD } : null;
}

/**
 * Can the player get out of the vehicle of `mode` now? `state`: { speed, agl (helicopter: height over the ground),
 * station (rhb: the station the train stands at, or null) }. Returns { ok, reason } (reason: why not, for the prompt).
 */
export function canExit(mode, { speed = 0, agl = 0, station = null } = {}) {
  if (mode === 'person') return { ok: false, reason: 'On foot' };
  if (mode === 'rhb') {
    if (Math.abs(speed) > 0.15) return { ok: false, reason: 'Wait for the next station' };
    if (!station) return { ok: false, reason: 'Only at a station' };
    return { ok: true, reason: null };
  }
  if (mode === 'helicopter' && !(agl < EXIT_MAX_AGL)) return { ok: false, reason: 'Land first' };
  if (Math.abs(speed) > EXIT_MAX_SPEED) return { ok: false, reason: 'Stop first' };
  return { ok: true, reason: null };
}

/**
 * Where the pedestrian steps out of a vehicle of `type` at (x, z, heading), in order of preference: by the driver's
 * door (the left: Swiss vehicles are left-hand drive; the left of heading h is (cos h, -sin h)), then the other side,
 * behind and in front, each a little farther out if the first is blocked. { x, z, heading } each, the pedestrian
 * facing the way the vehicle faces beside it (the chase camera behind it then stays clear of the vehicle), away from it
 * behind and in front.
 */
export function exitSpots(type, x, z, heading, footprint = null) {
  // (`footprint`: another body's { halfW, halfL, door } than the type's, a taken car or bus, js/hijack.js)
  const f = footprint || VEHICLE_FOOTPRINTS[type] || { halfW: 0.5, halfL: 0.5 };
  const sn = Math.sin(heading), cs = Math.cos(heading);
  const lx = cs, lz = -sn; // the left
  const out = [];
  const push = (across, along, face) => out.push({ x: x + lx * across + sn * along, z: z + lz * across + cs * along, heading: heading + face });
  // the cyclist steps off beside the bike; the helicopter's crew door is ahead of the middle
  const doorAlong = footprint?.door ?? (type === 'car' ? 0.9 : type === 'helicopter' ? 1.2 : type === 'snowcat' ? 0.6 : 0);
  for (const extra of [0.8, 1.6, 2.6]) {
    push(f.halfW + extra, doorAlong, 0);
    push(-(f.halfW + extra), doorAlong, 0);
  }
  for (const extra of [1, 2.2]) {
    push(0, -(f.halfL + extra), Math.PI);
    push(0, f.halfL + extra, 0);
  }
  return out;
}

/** The first of `spots` for which `isFree(spot)` holds, preferring those off the roads (`onRoad(spot)`), or null */
export function pickExitSpot(spots, isFree, onRoad = () => false) {
  let fallback = null;
  for (const s of spots) {
    if (!isFree(s)) continue;
    if (!onRoad(s)) return s;
    fallback ??= s;
  }
  return fallback;
}

/** The depots of a type nearest first to (x, z) */
export function depotsByDistance(depots, type, x, z) {
  return depots.filter((d) => d.type === type).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
}
