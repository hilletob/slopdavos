// A coarse spatial hash of the street traffic (cars, bikes) and the pedestrians on crosswalks, rebuilt once a frame by
// traffic.js, for vehicles outside the lane graph (the VBD buses, js/vbd.js) to find what is in their way without
// scanning every vehicle. Entries are plain objects { x, z, y, fx, fz, half, halfWidth, speed, kind, ref }:
// a box `half` long and `halfWidth` wide either side of (x, z), heading (fx, fz) at `speed` (round without a heading).

const CELL = 16;
const key = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);

export function createObstacleGrid() {
  const cells = new Map(), used = [];
  const pool = [];
  let count = 0;

  function clear() {
    for (const list of used) list.length = 0;
    used.length = 0;
    count = 0;
  }

  // Add an obstacle (copied into a pooled entry); returns the entry
  function add(x, z, y, fx, fz, half, halfWidth, speed, kind, ref) {
    const o = pool[count] || (pool[count] = {});
    count++;
    o.x = x; o.z = z; o.y = y; o.fx = fx; o.fz = fz; o.half = half; o.halfWidth = halfWidth; o.speed = speed; o.kind = kind; o.ref = ref;
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    let list = cells.get(k);
    if (!list) cells.set(k, (list = []));
    if (!list.length) used.push(list);
    list.push(o);
    return o;
  }

  // The nearest obstacle in the corridor `halfWidth` either side of the ray from (x, z) along the unit (dx, dz), up to
  // `range` metres: its gap (from (x, z) to its near end along the ray, 0 if it reaches back past (x, z)), or Infinity.
  // Oncoming obstacles (heading against the ray) count only well inside the corridor (head-on in its way, or cutting
  // deep into it): those in their own lane beside it (a one-way street driven against in the bus lane) are left out.
  // `out` (optional) receives { gap, speed (its speed along the ray), own (its own speed), kind, ref, dot (heading · ray) }.
  // Obstacles more than 4 m above or below `y` (bridges) are ignored; `skip(o)` can leave out more; `back`: how far behind (x, z) an
  // obstacle's centre may lie and still count (its body reaching forward into the corridor).
  function nearestAhead(x, z, dx, dz, range, halfWidth, y = undefined, out = null, skip = null, back = 0) {
    let best = Infinity;
    const reach = range + 12;
    const x0 = Math.floor((Math.min(x, x + dx * range) - 12) / CELL), x1 = Math.floor((Math.max(x, x + dx * range) + 12) / CELL);
    const z0 = Math.floor((Math.min(z, z + dz * range) - 12) / CELL), z1 = Math.floor((Math.max(z, z + dz * range) + 12) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = cells.get(key(ix, iz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          const ox = o.x - x, oz = o.z - z;
          if (Math.abs(ox) > reach || Math.abs(oz) > reach) continue;
          if (y !== undefined && o.y !== undefined && Math.abs(o.y - y) > 4) continue;
          const dot = o.fx * dx + o.fz * dz;
          const oncoming = o.kind !== 'ped' && dot < -0.5;
          const along = ox * dx + oz * dz;
          if (along < -back) continue;
          // its extent along and across the ray (without a heading (0, 0): round, `half` in radius)
          const cross = Math.abs(o.fx * dz - o.fz * dx), round = !o.fx && !o.fz;
          const ext = round ? o.half : o.half * Math.abs(dot) + o.halfWidth * cross;
          const side = round ? o.half : o.half * cross + o.halfWidth * Math.abs(dot);
          const lateral = Math.abs(ox * dz - oz * dx);
          if (lateral > halfWidth + (oncoming ? 0.6 : 1) * side) continue;
          const gap = Math.max(0, along - ext);
          if (gap >= range || gap >= best) continue;
          if (skip && skip(o)) continue;
          best = gap;
          if (out) { out.gap = gap; out.speed = Math.max(0, (o.speed || 0) * dot); out.kind = o.kind; out.ref = o.ref; out.dot = dot; out.own = o.speed || 0; }
        }
      }
    }
    return best;
  }

  return { clear, add, nearestAhead, get count() { return count; } };
}
