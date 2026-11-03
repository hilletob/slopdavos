// How a VBD bus (js/vbd.js) drives its line from stop to stop. Pure functions (no three.js), so the stepping can be
// tested on its own (tests/bus-stopping.test.mjs). A bus's `s` is its front's distance along the route; `served` the s of
// the last stop it dealt with; `dwell` the seconds it still stands with its doors open (js/hijack.js: only then can the
// player take it).

export const MAX_SPEED = 12.5, ACCEL = 1.0, BRAKE = 1.6, DWELL = [12, 22];
// A bus has arrived within ARRIVE_GAP metres of its stop (or of the route's end), slower than ARRIVE_SPEED: braking
// along brakingSpeed() it gets there at about 0.6 m/s, and with `dt` capped at 0.1 s at less than 0.9. Pushed OVERSHOOT
// metres past a stop it has missed it; a stop within TERMINUS_REACH of where a bus enters a route is the terminus, the
// one its layover is spent at.
export const ARRIVE_GAP = 0.1, ARRIVE_SPEED = 0.9, OVERSHOOT = 3, TERMINUS_REACH = 25;

/** The fastest a bus may go `d` metres before a point it has to stop at */
export const brakingSpeed = (d) => Math.sqrt(2 * BRAKE * Math.max(0, d));

/** The stop a bus at `s` drives to: the first of `stops` (in driving order) neither served nor already left behind */
export function nextStop(stops, s, served) {
  for (const st of stops) if (st.s > served && st.s >= s - OVERSHOOT) return st;
  return null;
}

/**
 * One step of a bus on `route` ({ len, stops }), not while the player has it: stand out the dwell, or brake for the
 * next stop and the route's end, and for whatever else `limits(b, limit)` says (it returns `limit`, lowered), and arrive.
 * Returns 'dwell', 'drive', 'stop' (just arrived, the doors open) or 'end' (at the route's end: the caller puts it on
 * its next route with enterRoute(), or tries again after setting a dwell).
 */
export function stepBus(b, route, dt, limits = null, rand = Math.random) {
  if (b.dwell > 0) { b.dwell -= dt; return 'dwell'; }
  const stop = nextStop(route.stops, b.s, b.served);
  let limit = Math.min(MAX_SPEED, brakingSpeed(route.len - b.s));
  if (stop) limit = Math.min(limit, brakingSpeed(stop.s - b.s));
  if (limits) limit = limits(b, limit);
  b.speed = b.speed < limit ? Math.min(limit, b.speed + ACCEL * dt) : Math.max(limit, b.speed - BRAKE * 2 * dt);
  b.s += b.speed * dt;
  // (a stop at the very end of a route can lie a few centimetres past it: the data is rounded)
  if (stop && b.s >= Math.min(stop.s, route.len) - ARRIVE_GAP && b.speed <= ARRIVE_SPEED) {
    b.served = stop.s; b.speed = 0;
    b.dwell = DWELL[0] + rand() * (DWELL[1] - DWELL[0]);
    return 'stop';
  }
  if (b.s >= route.len || (b.s >= route.len - ARRIVE_GAP && b.speed <= ARRIVE_SPEED)) {
    b.speed = 0;
    return 'end';
  }
  return 'drive';
}

/**
 * A bus enters `route` with its front at `entry` (its tail at the route's start), for the layover at the terminus: the
 * stops there count as served.
 */
export function enterRoute(b, route, entry) {
  b.route = route; b.s = entry; b.speed = 0; b.dwell = DWELL[1];
  b.served = -1;
  for (const st of route.stops) if (st.s <= entry + TERMINUS_REACH) b.served = st.s;
}

/**
 * The gap from a bus's nose (at `s` on its route, `sample(s)` → { x, z, dx, dz }) to the tail of the body `o` ({ x, z,
 * y, sin, cos, halfW, halfL }) of another bus going its way in its lane within `reach` metres, or Infinity. A body whose
 * front is not ahead of the nose does not count, so of two buses only the rear one ever waits for the other.
 */
export function gapToBody(sample, s, o, reach, y = undefined) {
  if (o.y !== undefined && y !== undefined && Math.abs(o.y - y) > 4) return Infinity;
  for (let d = 0; d <= reach; d += 4) {
    const p = sample(s + d);
    const rx = p.x - o.x, rz = p.z - o.z, along = rx * o.sin + rz * o.cos;
    if (d === 0 && along >= o.halfL) return Infinity;
    if (p.dx * o.sin + p.dz * o.cos < 0.7) continue; // (crossing or oncoming)
    if (Math.abs(along) < o.halfL && Math.abs(rx * o.cos - rz * o.sin) < o.halfW + 0.6) return Math.max(0, d - (along + o.halfL));
  }
  return Infinity;
}

/** Does the body `o` stand on the place of a bus centred at (x, z), halfL long, halfW wide? (Roughly: in o's own axes) */
export function bodyInTheWay(x, z, halfL, halfW, o) {
  const rx = x - o.x, rz = z - o.z;
  return Math.abs(rx * o.sin + rz * o.cos) < o.halfL + halfL + 1 && Math.abs(rx * o.cos - rz * o.sin) < o.halfW + halfW + 0.5;
}
