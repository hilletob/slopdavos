// tools/markings-rails.mjs — the RhB's track bed in the traced paint (tools/markings-layer.mjs): in the photo the rails
// and the concrete sleepers are bright bars side by side, which the tracer takes for paint and tools/markings-bays.mjs
// for the separators of a row of bays (car parks on the tracks at the stations). Paint lying on the ballast (js/trams.js:
// 2.8 m wide over each mapped track) is dropped, and so are rows of bays reaching onto it.
import { DAVOS_DATA } from '../js/davos-geodata.js';

const HALF = 1.6; // m either side of a track: the ballast's half width and a little of the shoulder

const segs = [];
for (const r of DAVOS_DATA.railways || []) {
  if (r.tunnel) continue;
  const p = r.pts;
  for (let i = 2; i < p.length; i += 2) segs.push([p[i - 2], p[i - 1], p[i], p[i + 1]]);
}

/** Distance (m) from (x, z) to the nearest track above ground, at most `cap` (the search's reach) */
export function trackDistance(x, z, cap = 20) {
  let best = cap;
  for (const [ax, az, bx, bz] of segs) {
    if (x < Math.min(ax, bx) - best || x > Math.max(ax, bx) + best || z < Math.min(az, bz) - best || z > Math.max(az, bz) + best) continue;
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx - x, az + t * dz - z));
  }
  return best;
}

/** Whether every point of a flat [x, z, …] list lies on the track bed (a level crossing's paint reaches beyond it) */
export function onTrackBed(flat, half = HALF) {
  for (let i = 0; i < flat.length; i += 2) if (trackDistance(flat[i], flat[i + 1]) > half) return false;
  return flat.length > 0;
}

/** Whether a row of bays (tools/markings-bays.mjs) reaches onto the track bed: a bay's middle within half its width of the ballast */
export const rowOnTracks = (row) => row.bays.some((b) => trackDistance(b.x, b.z) < HALF + b.w / 2);
