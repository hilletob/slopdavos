// Surveyed tunnel centrelines and a continuous grade between their two portals.
// The surface model measures the mountain above the tunnel, so it cannot supply the road or rail height inside.

// The road tunnels between Davos, Monstein (its Hauptstrasse) and Wiesen, and the Seegalerie of the Prättigauerstrasse
// along the Davosersee (unnamed in OSM: tools/build-davos-geodata.mjs names it). (The other mapped road tunnels stay
// out of the drivable network, as before.) Used by the data tool, the street list and the terrain.
const DRIVABLE_TUNNELS = new Set(['Landwassertunnel', 'Landwasserstrasse', 'Hauptstrasse', 'Seegalerie']);
export const isDrivableTunnel = (name) => DRIVABLE_TUNNELS.has(name);
// The galleries among them: open on the valley side under a roof (js/tunnels.js)
export const isGallery = (name) => name === 'Seegalerie';

export function tunnelProfile(record, groundHeight, halfWidth) {
  const pts = record.pts;
  const cumulative = [0];
  for (let i = 2; i < pts.length; i += 2) cumulative.push(cumulative.at(-1) + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
  const length = cumulative.at(-1);
  const start = groundHeight(pts[0], pts[1]), end = groundHeight(pts.at(-2), pts.at(-1));
  const at = (distance) => {
    const s = Math.max(0, Math.min(length, distance));
    let k = 0;
    while (k < cumulative.length - 2 && cumulative[k + 1] < s) k++;
    const t = (s - cumulative[k]) / Math.max(1e-9, cumulative[k + 1] - cumulative[k]);
    const i = k * 2, dx = pts[i + 2] - pts[i], dz = pts[i + 3] - pts[i + 1], d = Math.hypot(dx, dz) || 1;
    return { x: pts[i] + dx * t, z: pts[i + 1] + dz * t, y: start + (end - start) * s / length, dx: dx / d, dz: dz / d, s };
  };
  // The nearest point of the centreline within `margin`. `strict`: not past the two ends (a point on the open road
  // outside a mouth is not in the tunnel).
  const project = (x, z, margin = halfWidth, strict = false) => {
    let best = null;
    const last = cumulative.length - 2;
    for (let k = 0; k <= last; k++) {
      const i = k * 2, ax = pts[i], az = pts[i + 1], dx = pts[i + 2] - ax, dz = pts[i + 3] - az;
      const raw = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
      if (strict && ((k === 0 && raw < 0) || (k === last && raw > 1))) continue;
      const t = Math.max(0, Math.min(1, raw));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d > margin || (best && d >= best.distance)) continue;
      const s = cumulative[k] + (cumulative[k + 1] - cumulative[k]) * t;
      best = { x: ax + dx * t, z: az + dz * t, y: start + (end - start) * s / length, distance: d, s };
    }
    return best;
  };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
    minZ = Math.min(minZ, pts[i + 1]); maxZ = Math.max(maxZ, pts[i + 1]);
  }
  return { id: record.id, name: record.name, width: halfWidth * 2, pts, cumulative, length, start, end, at, project, minX, maxX, minZ, maxZ };
}

/**
 * The stretches of a tunnel the mountain does not roof: wherever the ground over its width lies below the roof plus
 * `cover`. These become open cuts between retaining walls, with the mouth where the ground has risen over the roof.
 * Returns [{ from, to }] in distance along the tunnel, gaps under `merge` metres closed.
 */
export function openRuns(profile, groundHeight, roof, { cover = 1.5, step = 2, merge = 8 } = {}) {
  const half = profile.width / 2, runs = [];
  const open = (s) => {
    const p = profile.at(s);
    for (const side of [-half, 0, half]) if (groundHeight(p.x - p.dz * side, p.z + p.dx * side) < p.y + roof + cover) return true;
    return false;
  };
  const n = Math.max(1, Math.ceil(profile.length / step));
  let from = null;
  for (let i = 0; i <= n; i++) {
    const s = profile.length * i / n;
    if (open(s)) {
      if (from === null) from = s;
      if (i === n) runs.push({ from, to: s });
    } else if (from !== null) { runs.push({ from, to: s }); from = null; }
  }
  const merged = [];
  for (const r of runs) {
    if (merged.length && r.from - merged.at(-1).to < merge) merged.at(-1).to = r.to;
    else merged.push({ ...r });
  }
  return merged;
}

/** Rectangles covering a tunnel's open runs, one per straight piece: the terrain is cut along them (terrain-grid.js cutTriangles) */
export function runRects(profile, runs, half) {
  const rects = [], c = profile.cumulative;
  for (const { from, to } of runs) {
    const stops = [from, ...c.filter((s) => s > from && s < to), to];
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = profile.at(stops[i]), b = profile.at(stops[i + 1]);
      // (a touch longer than the piece, so that no sliver stays at a bend or in the mouth)
      const d = Math.hypot(b.x - a.x, b.z - a.z) || 1, ex = (b.x - a.x) / d * 0.3, ez = (b.z - a.z) / d * 0.3;
      rects.push({ ax: a.x - ex, az: a.z - ez, bx: b.x + ex, bz: b.z + ez, half });
    }
  }
  return rects;
}
