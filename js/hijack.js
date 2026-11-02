// js/hijack.js
// The GTA mode (js/gta.js): taking over the vehicles on the road. The player on foot steps up to a car of the street
// traffic (js/traffic.js) that stands or crawls (at a signal, in a queue), to a VBD bus standing at a stop with its doors
// open (js/vbd.js), or to a bike standing at a signal, and takes it: the driver gets out and walks off, the vehicle
// leaves its system (its pool slot is held, not freed: no gap, no new vehicle in its place) and the player drives it on the
// player car's physics (js/controllers.js updateCar, with the vehicle's size, mass and handling). Got out of, it stands
// where the player left it (parked in its own system, drawn with its own instances, solid) until the player is
// RELEASE_DISTANCE away; then it goes back into service.
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
