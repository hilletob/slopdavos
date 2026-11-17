import { AIR_OBSTACLES } from './air-obstacles-data.js';

// The registered air navigation obstacles of Davos (js/air-obstacles-data.js: the BAZL's register) as geometry on the
// game's terrain, and what flies into them: the overhead power lines' masts and conductors, the material and transport
// cables across the side valleys and the single aerial masts. No three.js here: js/air-obstacles.js draws it,
// js/controllers.js asks airObstacleContact() for the helicopter.
//
// - masts: { x, z, base (the ground), top, h (m above the ground), kind, radius }
// - wires: { kind, pts: Float32Array [x, y, z, ...] along the sagging conductor, mid: whether it is the span's middle
//   conductor (the one the contact test follows), half: m to the outer conductors }

export const KIND = { power: 0, cable: 1, pole: 2 };
const SAG = [0.025, 0.035]; // of the span's length: power lines, cables
const CELL = 400;

let field = null;

/** A lattice pylon carries the line from this height on; below it is a wooden pole */
export const PYLON_FROM = 20;
/** Half the width over the outer conductors of a mast `h` m high */
export const armHalf = (h) => (h >= PYLON_FROM ? Math.max(3, h * 0.16) : 0.9);

function build(groundHeight) {
  const masts = AIR_OBSTACLES.masts.map(([x, z, top, agl, kind]) => {
    const base = groundHeight(x, z);
    // (the register's height above ground, on the game's terrain; an anchor without one is a short post)
    const h = agl > 1.5 ? agl : kind === KIND.pole ? Math.max(8, top - base) : 3;
    return { x, z, base, h, top: base + h, kind, radius: kind === KIND.pole ? 0.5 : kind === KIND.power ? (h >= PYLON_FROM ? Math.max(1.2, h * 0.09) : 0.2) : 0.15 };
  });
  const mastAt = (x, z, kind) => masts.find((m) => m.kind === kind && Math.abs(m.x - x) < 1.5 && Math.abs(m.z - z) < 1.5);
  const wires = [];
  for (const [x0, z0, t0, x1, z1, t1, kind] of AIR_OBSTACLES.spans) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1) continue;
    const a = mastAt(x0, z0, kind), b = mastAt(x1, z1, kind);
    const y0 = a ? a.top : Math.max(t0, groundHeight(x0, z0) + 2), y1 = b ? b.top : Math.max(t1, groundHeight(x1, z1) + 2);
    const n = Math.max(4, Math.min(28, Math.ceil(len / 22)));
    // The sag, less where the ground comes close under the span (never nearer than 4 m)
    let sag = len * SAG[kind === KIND.power ? 0 : 1];
    for (let i = 1; i < n; i++) {
      const t = i / n, shape = 4 * t * (1 - t);
      const clear = y0 + (y1 - y0) * t - (groundHeight(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t) + 4);
      sag = Math.min(sag, Math.max(0, clear) / shape);
    }
    const ux = (z1 - z0) / len, uz = -(x1 - x0) / len; // (across the span)
    const half = kind === KIND.power ? (armHalf(a ? a.h : 12) + armHalf(b ? b.h : 12)) / 2 : 0;
    const tall = kind === KIND.power && half > 2;
    // power: the earth wire over the middle, a conductor at each end of the crossarm (lower on a pylon); cable: one
    const lines = kind === KIND.power ? [[0, 0, true], [-half, tall ? -0.16 : -0.05, false], [half, tall ? -0.16 : -0.05, false]] : [[0, 0, true]];
    for (const [off, drop, mid] of lines) {
      const pts = new Float32Array((n + 1) * 3);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const dy = drop * ((a ? a.h : 12) * (1 - t) + (b ? b.h : 12) * t);
        pts[i * 3] = x0 + (x1 - x0) * t + ux * off;
        pts[i * 3 + 1] = y0 + (y1 - y0) * t + dy - sag * 4 * t * (1 - t);
        pts[i * 3 + 2] = z0 + (z1 - z0) * t + uz * off;
      }
      wires.push({ kind, pts, mid, half, len });
    }
  }
  // The contact test's grid: the masts and the middle conductors' segments per 400 m cell
  const cells = new Map();
  const put = (x, z, item) => { const k = Math.floor(x / CELL) * 65536 + Math.floor(z / CELL); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(item); };
  for (const m of masts) put(m.x, m.z, m);
  for (const w of wires) {
    if (!w.mid) continue;
    for (let i = 0; i + 3 < w.pts.length; i += 3) {
      const seg = { wire: w, i };
      const ax = w.pts[i], az = w.pts[i + 2], bx = w.pts[i + 3], bz = w.pts[i + 5];
      const keys = new Set([[ax, az], [bx, bz], [(ax + bx) / 2, (az + bz) / 2]].map(([x, z]) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`));
      for (const k of keys) { const [cx, cz] = k.split(',').map(Number); put(cx * CELL + 1, cz * CELL + 1, seg); }
    }
  }
  return { masts, wires, cells };
}

/** The obstacles on the terrain (`groundHeight(x, z)`): built once */
export function airObstacleField(groundHeight) {
  return field || (field = build(groundHeight));
}

const hit = { kind: '', x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, depth: 0 };

/**
 * What a body of `radius` m at (x, y, z) touches: null, or { kind: 'mast' | 'wire', x, y, z (the point on the
 * obstacle), nx, ny, nz (from it towards the body), depth (m to move the body out along the normal) }. One reused
 * object: copy what is kept. The deepest contact wins.
 */
export function airObstacleContact(groundHeight, x, y, z, radius) {
  const f = airObstacleField(groundHeight);
  let best = 0;
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let ix = cx - 1; ix <= cx + 1; ix++) {
    for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const items = f.cells.get(ix * 65536 + iz);
      if (!items) continue;
      for (const it of items) {
        if (it.wire) {
          const p = it.wire.pts, i = it.i;
          const ax = p[i], ay = p[i + 1], az = p[i + 2], dx = p[i + 3] - ax, dy = p[i + 4] - ay, dz = p[i + 5] - az;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz || 1e-9)));
          const qx = ax + dx * t, qy = ay + dy * t, qz = az + dz * t;
          // (the conductors beside the middle one: the same test, flattened across the span)
          let ex = x - qx, ey = y - qy, ez = z - qz;
          if (it.wire.half > 0) {
            const L = Math.hypot(dx, dz) || 1, ux = dz / L, uz = -dx / L;
            const side = ex * ux + ez * uz, over = Math.max(-it.wire.half, Math.min(it.wire.half, side));
            ex -= ux * over; ez -= uz * over;
          }
          const d = Math.hypot(ex, ey, ez), depth = radius - d;
          if (depth > best) {
            best = depth;
            const inv = d > 1e-6 ? 1 / d : 0;
            hit.kind = 'wire'; hit.x = x - ex; hit.y = y - ey; hit.z = z - ez;
            hit.nx = ex * inv; hit.ny = d > 1e-6 ? ey * inv : 1; hit.nz = ez * inv; hit.depth = depth;
          }
        } else {
          if (y > it.top + radius || y < it.base - radius) continue;
          const ex = x - it.x, ez = z - it.z, d = Math.hypot(ex, ez), depth = radius + it.radius - d;
          if (depth > best) {
            best = depth;
            const inv = d > 1e-6 ? 1 / d : 0;
            hit.kind = 'mast'; hit.x = it.x; hit.y = Math.min(y, it.top); hit.z = it.z;
            hit.nx = d > 1e-6 ? ex * inv : 1; hit.ny = 0; hit.nz = ez * inv; hit.depth = depth;
          }
        }
      }
    }
  }
  return best > 0 ? hit : null;
}
