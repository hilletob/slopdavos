// Small, lazily connected sidewalk tracks. Junctions only connect points on the same curb island;
// crossing the roadway is a separate, signal-controlled track owned by traffic.js.
function createPedestrianRoutes({ walkable, onSidewalk }, blockAt) {
  const sidewalks = new Map(), crossings = new Map(), junctions = new Map(), connections = new WeakMap();
  const point = (track, end) => ({ x: track.ax + track.ux * track.len * end, z: track.az + track.uz * track.len * end });
  const segment = (a, b, extra = {}) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    return { ax: a.x, az: a.z, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len,
      len, node: null, side: 0, line: 0, ...extra };
  };

  function clear(a, b, block = null) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    let x = a.x, z = a.z;
    for (let i = 0; i <= steps; i++) {
      const nx = a.x + (b.x - a.x) * i / steps, nz = a.z + (b.z - a.z) * i / steps;
      if (!walkable(Math.min(x, nx) - 0.4, Math.max(x, nx) + 0.4, Math.min(z, nz) - 0.4, Math.max(z, nz) + 0.4)) return false;
      if (block && blockAt(nx, nz) !== block) return false;
      x = nx; z = nz;
    }
    return true;
  }

  function along(e) {
    if (sidewalks.has(e)) return sidewalks.get(e);
    const result = [];
    sidewalks.set(e, result);
    if (e.tunnel) return result; // (no sidewalks through a road tunnel: they would be laid on the mountain above it)
    // Two walking lines on each side leave room for people to pass or stop together.
    // Along a raised sidewalk (e.walk: its widths [left, right], js/road-network.js) both lines lie on it, and a street
    // with one on one side only is walked there.
    for (const sign of [-1, 1]) {
      const walk = e.walk && e.walk[sign > 0 ? 1 : 0];
      if (e.walk && !walk) continue;
      for (const inset of walk ? [0.12 + walk * 0.33, 0.12 + walk * 0.75] : [1.7, 2.8]) {
        const off = sign * (e.half + inset);
        const start = { x: e.sx + e.rx * off, z: e.sz + e.rz * off };
        // (a raised sidewalk's rounded corner, js/street-corners.js, may take the line's first or last metres: it
        // begins and ends where the sidewalk does)
        let t0 = 0, t1 = e.len;
        const on = (t) => blockAt(start.x + e.dx * t, start.z + e.dz * t);
        if (walk) {
          while (t0 < 4 && t0 < t1 - 1 && !on(t0)) t0 += 0.5;
          while (t1 > e.len - 4 && t1 > t0 + 1 && !on(t1)) t1 -= 0.5;
        }
        const a = { x: start.x + e.dx * t0, z: start.z + e.dz * t0 };
        const b = { x: start.x + e.dx * t1, z: start.z + e.dz * t1 };
        const block = blockAt(a.x, a.z);
        if (!block || blockAt(b.x, b.z) !== block || !clear(a, b, block)) continue;
        if (!e.general && (!onSidewalk(a.x, a.z) || !onSidewalk(b.x, b.z))) continue;
        result.push(segment(a, b, { edge: e, from: e.from, to: e.to, block }));
      }
    }
    return result;
  }

  function across(n) {
    if (crossings.has(n)) return crossings.get(n);
    const result = [];
    crossings.set(n, result);
    if (!n.signal) return result;
    for (let side = 0; side < 4; side++) {
      const road = n.road[side];
      if (!road) continue;
      const avenue = side >= 2, sign = side % 2 === 0 ? 1 : -1;
      for (const line of avenue ? [sign * 0.75] : [-0.75, 0.75]) {
        const a = { x: avenue ? road.x0 - road.half - 2 : n.x + sign * (n.hx + 1.25) + line,
          z: avenue ? n.z + sign * (n.hz + 1.25) + line : road.z0 - road.half - 2 };
        const len = road.half * 2 + 4;
        const b = { x: a.x + (avenue ? len : 0), z: a.z + (avenue ? 0 : len) };
        if (!onSidewalk(a.x, a.z) || !onSidewalk(b.x, b.z) || !clear(a, b)) continue;
        result.push(segment(a, b, { node: n, side, line, from: n, to: n }));
      }
    }
    return result;
  }

  function ports(n) {
    if (junctions.has(n)) return junctions.get(n);
    const result = [], seen = new Set();
    junctions.set(n, result);
    for (const e of [...n.in, ...n.out]) {
      if (seen.has(e)) continue;
      seen.add(e);
      for (const track of along(e)) result.push({ track, end: e.from === n ? 0 : 1 });
    }
    for (const track of across(n)) result.push({ track, end: 0 }, { track, end: 1 });
    return result;
  }

  // Stay in the sidewalk band even where angled building colliders are deliberately omitted from the road graph.
  function cornerClear(a, b, block) {
    if (!clear(a, b, block)) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
      let distance = Infinity;
      for (let j = 0, k = block.poly.length - 1; j < block.poly.length; k = j++) {
        const p = block.poly[j], q = block.poly[k], dx = q.x - p.x, dz = q.z - p.z;
        const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz || 1)));
        distance = Math.min(distance, Math.hypot(x - p.x - dx * t, z - p.z - dz * t));
      }
      if (distance > 4) return false;
    }
    return true;
  }

  function links(track, dir) {
    let ends = connections.get(track);
    if (!ends) connections.set(track, ends = []);
    const end = dir > 0 ? 1 : 0;
    if (ends[end]) return ends[end];
    const result = ends[end] = [];
    const n = end ? track.to : track.from;
    if (!n) return result;
    const a = point(track, end), block = blockAt(a.x, a.z);
    if (!block) return result;
    for (const port of ports(n)) {
      const next = port.track, nextDir = port.end ? -1 : 1;
      if (next === track) continue;
      const b = point(next, port.end), distance = Math.hypot(b.x - a.x, b.z - a.z);
      if (distance > 32 || blockAt(b.x, b.z) !== block) continue;
      const path = [];
      if (distance > 0.01) {
        if (cornerClear(a, b, block)) {
          path.push({ track: segment(a, b), dir: 1 });
        } else {
          // Meeting the two offset sidewalk lines rounds the curb instead of cutting diagonally through a lot.
          const ax = track.ux * dir, az = track.uz * dir, bx = next.ux * nextDir, bz = next.uz * nextDir;
          const cross = ax * bz - az * bx;
          if (Math.abs(cross) < 0.2) continue;
          const t = ((b.x - a.x) * bz - (b.z - a.z) * bx) / cross;
          const c = { x: a.x + ax * t, z: a.z + az * t };
          if (t < 0 || t > 20 || (b.x - c.x) * bx + (b.z - c.z) * bz < 0 || Math.hypot(b.x - c.x, b.z - c.z) > 20) continue;
          // round the corner where the curb is rounded (js/street-corners.js) and the lines' meeting point lies on the
          // asphalt: a curve from one line into the other, in four straight pieces
          let way = [a, c, b];
          if (!cornerClear(a, c, block) || !cornerClear(c, b, block)) {
            way = [a];
            for (let k = 1; k <= 4; k++) {
              const u = k / 4, v = 1 - u;
              way.push({ x: v * v * a.x + 2 * u * v * c.x + u * u * b.x, z: v * v * a.z + 2 * u * v * c.z + u * u * b.z });
            }
            if (way.some((p, k) => k && !cornerClear(way[k - 1], p, block))) continue;
          }
          for (let k = 1; k < way.length; k++) {
            if (Math.hypot(way[k].x - way[k - 1].x, way[k].z - way[k - 1].z) > 0.01) path.push({ track: segment(way[k - 1], way[k]), dir: 1 });
          }
        }
      }
      path.push({ track: next, dir: nextDir });
      result.push(path);
    }
    return result;
  }

  // `avoid(path)` may rule out paths (e.g. towards a crosswalk with a long queue); null if none is left.
  function next(track, dir, goalX, goalZ, avoid = null) {
    let best = null, bestScore = -Infinity;
    const a = point(track, dir > 0 ? 1 : 0);
    const gx = goalX - a.x, gz = goalZ - a.z, distance = Math.hypot(gx, gz) || 1;
    for (const path of links(track, dir)) {
      if (avoid && avoid(path)) continue;
      const last = path[path.length - 1], target = last.track;
      const ux = target.ux * last.dir, uz = target.uz * last.dir;
      const back = ux * track.ux * dir + uz * track.uz * dir < -0.8;
      const score = (ux * gx + uz * gz) / distance + Math.random() * 0.7 - (back ? 2 : 0);
      if (score > bestScore) { best = path; bestScore = score; }
    }
    return best;
  }

  // Is the sidewalk this line belongs to more than a tiny pocket? Short road stubs can leave a few metres of
  // sidewalk linked only to themselves; people placed there would walk round it for ever.
  const ROOMY = 20; // m of connected walking lines
  const roomyLines = new WeakMap();
  function roomy(track) {
    if (roomyLines.has(track)) return roomyLines.get(track);
    const seen = new Set([track]), open = [track];
    let length = 0;
    while (open.length && length < ROOMY) {
      const t = open.pop();
      if (t.edge) length += t.len;
      for (const dir of [1, -1]) {
        for (const path of links(t, dir)) {
          const next = path[path.length - 1].track;
          if (!seen.has(next)) { seen.add(next); open.push(next); }
        }
      }
    }
    const result = length >= ROOMY;
    // Every line reached from a pocket is in the same pocket; lines of a large sidewalk only know about themselves.
    if (result) roomyLines.set(track, true); else for (const t of seen) roomyLines.set(t, false);
    return result;
  }

  function canDodge(p, offset) {
    const block = blockAt(p.x, p.z);
    const target = { x: p.ax + p.ux * p.t + p.uz * offset, z: p.az + p.uz * p.t - p.ux * offset };
    return !!block && onSidewalk(target.x, target.z) && cornerClear(p, target, block);
  }

  return { along, across, next, roomy, canDodge };
}

export { createPedestrianRoutes };
