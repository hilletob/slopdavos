// js/hijack.js
// The GTA mode (js/gta.js): taking over the vehicles on the road. The player on foot steps up to a car of the street
// traffic (js/traffic.js) that stands or crawls (at a signal, in a queue), to a VBD bus standing at a stop with its doors
// open (js/vbd.js), or to a bike standing at a signal, and takes it: the driver gets out and walks off, the vehicle
// leaves its system (its pool slot is held, not freed: no gap, no new vehicle in its place) and the player drives it on the
// player car's physics (js/controllers.js updateCar, with the vehicle's size, mass and handling). Got out of, it stands
// where the player left it (parked in its own system, drawn with its own instances, solid) until the player is
// RELEASE_DISTANCE away; then it goes back into service.
// The cars parked in the car parks (js/parking.js) are empty and can be got into too (no driver, no fist). They have no
// slot of their own: the player's car wears the parked car's body (its kind, its paint), and for what follows, driving it
// and leaving it standing, it borrows a traffic car of the same kind out of the pool (the farthest away; borrowVehicle),
// so that the left-standing logic above holds for it as it is. Meanwhile the bay stands empty (createLotRegistry, kept
// by bay, not by car: the mobile profile rebuilds the cells of js/parking.js). When a left car goes back into service, the
// pool car gets its own paint back and the parked car is back in its bay, as soon as the player is away (bayIsClear).
// Pure data and functions (no three.js), shared by the game and the tests.

/** How close (m) the pedestrian must stand to the outline of a car / bus / bike to take it */
export const TAKE_RADIUS = { car: 3, bus: 3.5, bike: 2 };
/** A car is taken only while it stands or crawls (m/s); a bus only while it stands at a stop (doors open) */
export const TAKE_MAX_SPEED = { car: 4, bus: 0.3, bike: 0.3 };
/** A vehicle the player left behind goes back into service once the player is this far away (m) */
export const RELEASE_DISTANCE = 600;
/** At most this many taken vehicles stand about at once (the oldest goes back first) */
export const MAX_LEFT = 6;

/** The traffic's body classes (js/traffic.js KINDS) in the prompt */
export const TRAFFIC_LABELS = { sedan: 'estate car', hatch: 'hatchback', suv: 'SUV', van: 'minibus', taxi: 'taxi', police: 'patrol car' };
export const trafficLabel = (car) => (car?.isPolice ? TRAFFIC_LABELS.police : TRAFFIC_LABELS[car?.bodyType] || 'car');

/**
 * The player car's handling for a body (js/controllers.js CAR_DRIVE's fields): the cars on the van's tuning with their
 * own wheelbase (sharper, quicker than the T3), the bus slow, heavy and wide-turning (its wheelbase sets the turning
 * circle: ~6 m for the solo Citaro, the articulated one driven as one rigid bus with its front car's).
 */
export function driveFor(kind, { wheelbase = 2.6, police = false } = {}) {
  if (kind === 'bus') {
    return { speed: 16, reverseSpeed: 4, acceleration: 1.3, powerSpeed: 7, rolling: 0.25, drag: 0.0009, coast: 0.45, brake: 5.5, wheelbase, grip: 6.5, cornering: 4.2 };
  }
  return { speed: police ? 46 : 41, reverseSpeed: 11, acceleration: police ? 6.2 : 5.4, powerSpeed: 17, rolling: 0.17, drag: 0.0011, coast: 0.6, brake: 10, wheelbase, grip: 10.5, cornering: 11.5 };
}

/** Distance (m) from (x, z) to the outline of a box (half width, half length) at (vx, vz) facing `heading`: 0 inside */
export function distanceToBox(halfW, halfL, vx, vz, heading, x, z) {
  const sn = Math.sin(heading || 0), cs = Math.cos(heading || 0);
  const dx = x - vx, dz = z - vz;
  const along = dx * sn + dz * cs, across = dx * cs - dz * sn;
  return Math.hypot(Math.max(0, Math.abs(across) - halfW), Math.max(0, Math.abs(along) - halfL));
}

// --- The traffic pool (js/traffic.js): a vehicle's service state --------------------------------------------------------
// In service: v.edge set (driving) or null (waiting to be spawned). Taken: `held` (the player drives it: neither driven,
// drawn nor spawned). Left behind: `parked` (standing still at its pose: drawn and solid, not driven or spawned).
/** Can the pool hand v out to a new place (spawn it)? Not while the player has it */
export const inService = (v) => !v.held && !v.parked;
/** The player takes v: out of its lane (the occupancy is rebuilt from the edges each frame), its slot kept */
export function holdVehicle(v) {
  v.held = true;
  v.parked = false;
  v.edge = null; v.conn = null; v.trail = null; v.commit = null; v.move = null;
  v.speed = 0; v.acc = 0; v.blink = 0;
  return v;
}
/** The player left v at { x, z, yaw, y? }: it stands there */
export function parkVehicle(v, { x, z, yaw, y }) {
  v.held = false;
  v.parked = true;
  v.edge = null;
  v.x = v.prevX = x; v.z = v.prevZ = z;
  v.yaw = yaw; v.tx = Math.sin(yaw); v.tz = Math.cos(yaw);
  v.yawOffset = v.yawVel = v.pitch = v.pitchVel = v.roll = v.rollVel = v.vx = v.vz = 0;
  v.speed = 0; v.acc = 0; v.blink = 0; v.steer = 0;
  v.y = Number.isFinite(y) ? y : undefined;
  return v;
}
/** Back into service: the pool spawns it somewhere out of view, as any vehicle that left the area */
export function releaseVehicle(v) {
  v.held = false;
  v.parked = false;
  v.edge = null;
  return v;
}

/**
 * The traffic car the pedestrian at `player` ({ x, y?, z }) can take: the nearest of `cars` on the road (edge set, not
 * a bike or bus) standing or crawling (speed < TAKE_MAX_SPEED.car) within TAKE_RADIUS.car of its outline ({ half,
 * halfWidth } of the traffic) and 3 m of height. Returns { car, distance } or null.
 */
export function findTakeableCar(player, cars, { radius = TAKE_RADIUS.car, maxSpeed = TAKE_MAX_SPEED.car, parked = false } = {}) {
  let best = null, bestD = Infinity;
  for (const v of cars || []) {
    if (v.bus || v.bike || v.held) continue;
    if (parked ? !v.parked : (!v.edge || v.parked)) continue;
    if (!(Math.abs(v.speed || 0) < maxSpeed)) continue;
    if (Number.isFinite(player.y) && Number.isFinite(v.y) && Math.abs(player.y - v.y) > 3) continue;
    const yaw = (v.yaw || 0) + (v.yawOffset || 0);
    const d = distanceToBox(v.halfWidth ?? 0.9, v.half ?? 2.3, v.x, v.z, yaw, player.x, player.z);
    if (d <= radius && d < bestD) { best = v; bestD = d; }
  }
  return best ? { car: best, distance: bestD } : null;
}

/** A bike of the traffic standing (at a signal) within TAKE_RADIUS.bike: { bike, distance } or null */
export function findTakeableBike(player, bikes, { radius = TAKE_RADIUS.bike } = {}) {
  let best = null, bestD = Infinity;
  for (const v of bikes || []) {
    if (!v.bike || !v.edge || v.held || !(Math.abs(v.speed || 0) < TAKE_MAX_SPEED.bike)) continue;
    if (Number.isFinite(player.y) && Number.isFinite(v.y) && Math.abs(player.y - v.y) > 3) continue;
    const d = distanceToBox(v.halfWidth ?? 0.3, v.half ?? 0.9, v.x, v.z, (v.yaw || 0) + (v.yawOffset || 0), player.x, player.z);
    if (d <= radius && d < bestD) { best = v; bestD = d; }
  }
  return best ? { bike: best, distance: bestD } : null;
}

/**
 * The VBD bus the pedestrian can drive off: one standing at a stop with its doors open (`dwell` > 0, standing still, in
 * service), or one the player left parked; within TAKE_RADIUS.bus of its body's outline (js/vbd.js bodies: { x, z, y,
 * sin, cos, halfW, halfL }). `buses[i]` goes with `bodies[i]`. Returns { bus, index, distance } or null.
 */
export function findTakeableBus(player, buses, bodies, { radius = TAKE_RADIUS.bus } = {}) {
  let best = null, bestD = Infinity;
  (buses || []).forEach((b, i) => {
    const body = bodies?.[i];
    if (!body || b.held) return;
    const atStop = !b.parked && b.dwell > 0 && Math.abs(b.speed || 0) < TAKE_MAX_SPEED.bus;
    if (!atStop && !b.parked) return;
    if (Number.isFinite(player.y) && Number.isFinite(body.y) && Math.abs(player.y - body.y) > 3) return;
    const d = distanceToBox(body.halfW, body.halfL, body.x, body.z, Math.atan2(body.sin, body.cos), player.x, player.z);
    if (d <= radius && d < bestD) { best = { bus: b, index: i }; bestD = d; }
  });
  return best ? { ...best, distance: bestD } : null;
}

/**
 * Where a vehicle taken at (x, z) facing `yaw` stands clear (`isClear(x, z)`): there, or the nearest spot beside it, left
 * first (the lane runs right of the road's middle, so that is towards the road), within `reach` metres. A bus in service
 * passes through the corner of a house on a narrow bend (the Sertig's terminus); the player's bus is solid and would be
 * wedged. Returns { x, z } or null when nothing nearby is clear.
 */
export function clearSpotBeside(x, z, yaw, isClear, { step = 0.5, reach = 4 } = {}) {
  if (isClear(x, z)) return { x, z };
  const lx = Math.cos(yaw), lz = -Math.sin(yaw);
  for (let off = step; off <= reach + 1e-9; off += step) {
    for (const side of [1, -1]) {
      const px = x + lx * off * side, pz = z + lz * off * side;
      if (isClear(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

// --- The cars of the car parks (js/parking.js) ------------------------------------------------------------------------
/** A bay's identity: the same whichever cell build lays it out (bays are deterministic) */
export const bayKey = (x, z) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
/** A bay gets its car back only while the player is this far away (m), not to pop up under their nose */
export const BAY_RETURN_DISTANCE = 40;

/**
 * The parked cars now built, in a spatial hash, and the bays whose car is in use. Cars ({ key, kind, x, y, z, heading, half,
 * halfWidth }) come and go with the cells of js/world-stream.js; the taken bays outlive them, so a rebuilt cell knows.
 */
export function createLotRegistry({ cell = 16 } = {}) {
  const grid = new Map(), byKey = new Map(), taken = new Set();
  const gridKey = (i, j) => (i + 32768) * 65536 + (j + 32768);
  const cellOf = (car) => gridKey(Math.floor(car.x / cell), Math.floor(car.z / cell));
  return {
    add(car) {
      byKey.set(car.key, car);
      const k = cellOf(car);
      const list = grid.get(k);
      if (list) list.push(car); else grid.set(k, [car]);
    },
    remove(car) {
      if (byKey.get(car.key) === car) byKey.delete(car.key);
      const k = cellOf(car), list = grid.get(k);
      const i = list ? list.indexOf(car) : -1;
      if (i < 0) return;
      list.splice(i, 1);
      if (!list.length) grid.delete(k);
    },
    get: (key) => byKey.get(key) || null,
    isTaken: (key) => taken.has(key),
    take(key) { taken.add(key); },
    give(key) { taken.delete(key); },
    get size() { return byKey.size; },
    /** The nearest parked car within `radius` of the pedestrian (to its outline) and 3 m of height: { car, distance } or null */
    find(player, { radius = TAKE_RADIUS.car } = {}) {
      const reach = radius + 3.5; // (+ the longest car's half length: its centre may lie in the next cell)
      const i0 = Math.floor((player.x - reach) / cell), i1 = Math.floor((player.x + reach) / cell);
      const j0 = Math.floor((player.z - reach) / cell), j1 = Math.floor((player.z + reach) / cell);
      let best = null, bestD = Infinity;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const list = grid.get(gridKey(i, j));
        if (!list) continue;
        for (const car of list) {
          if (taken.has(car.key)) continue;
          if (Number.isFinite(player.y) && Number.isFinite(car.y) && Math.abs(player.y - car.y) > 3) continue;
          const d = distanceToBox(car.halfWidth, car.half, car.x, car.z, car.heading, player.x, player.z);
          if (d <= radius && d < bestD) { best = car; bestD = d; }
        }
      }
      return best ? { car: best, distance: bestD } : null;
    }
  };
}

/**
 * The traffic car lent to a parked car of this body type: a plain one (no patrol car or taxi, not the player's), one
 * waiting in the pool if any, else the one farthest from (px, pz). null if the pool has none left.
 */
export function pickPoolCar(cars, bodyType, px, pz) {
  let best = null, bestD = -1;
  for (const v of cars || []) {
    if (v.bodyType !== bodyType || v.bus || v.bike || v.isPolice || v.isTaxi || !inService(v)) continue;
    if (!v.edge) return v;
    const d = Math.hypot(v.x - px, v.z - pz);
    if (d > bestD) { best = v; bestD = d; }
  }
  return best;
}
/** v stands in for the parked car of bay `key`: it wears its paint and is held by the player */
export function borrowVehicle(v, { key, paint }) {
  v.lotBay = key;
  v.ownPaint = v.paint;
  v.paint = [...paint];
  return holdVehicle(v);
}
/** v goes back to being itself: its own paint again. Returns the bay it stood in for, or null */
export function endBorrow(v) {
  const key = v.lotBay || null;
  if (key) { v.paint = v.ownPaint; v.lotBay = v.ownPaint = null; }
  return key;
}
/**
 * May the parked car come back to its bay ({ x, z })? Not while the player is near, nor with something standing in it
 * (`others`: vehicles, with a `position` or x and z).
 */
export function bayIsClear(bay, player, others = [], { playerDistance = BAY_RETURN_DISTANCE, gap = 3.5 } = {}) {
  if (player && Math.hypot(bay.x - player.x, bay.z - player.z) < playerDistance) return false;
  for (const o of others) {
    const p = o.position || o;
    if (Math.hypot(bay.x - p.x, bay.z - p.z) < gap) return false;
  }
  return true;
}

/** Should a vehicle left at (x, z) go back into service, the player being at (px, pz)? */
export const shouldRelease = (left, px, pz, distance = RELEASE_DISTANCE) => Math.hypot(left.x - px, left.z - pz) > distance;

/**
 * May the player take vehicles now? Not during a mission, unless the mission (or its current objective) says so
 * (`allowTakeover: true`); never in its intro or after its end.
 */
export function missionAllowsTakeover(run) {
  if (!run) return true;
  if (run.phase === 'intro' || run.phase === 'done' || run.phase === 'failed' || run.phase === 'aborted') return false;
  const objective = run.def?.objectives?.[run.index];
  return !!(objective?.allowTakeover ?? run.def?.allowTakeover);
}
