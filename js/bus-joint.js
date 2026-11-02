// js/bus-joint.js
// The articulated Citaro G of the VBD (js/vbd.js): the geometry and kinematics of its joint. Pure functions (no
// three.js), shared by the game and the tests.
//
// - The two cars are cut from the 12 m Citaro model with clean planar cuts (clipTriangles: every triangle crossing the
//   cut is clipped, not kept or dropped whole), each cut closed by an end wall in the livery with a dark frame round it.
// - The rear car hangs on the turntable at the middle of the gap behind the front car (the hinge, fixed to the front
//   car); its yaw follows the route through its axle (along a route: solveTrailerAxle; driven by the player: the
//   trailer's equation, trailerYaw), never bent by more than MAX_BEND.
// - The bellows (an accordion of FOLDS ribs round the body's rounded-rectangle cross-section) are spanned between the
//   two cars' end walls every frame: each rib ring stands across a quadratic curve from the front wall through the
//   hinge to the rear wall, so in a bend the folds close up on the inside and open on the outside, without gaps.
//
// World frame: heading h = atan2(dx, dz) (forward (sin h, cos h)); a model's local +x lies at (cos h, -sin h).

/** Most the rear car turns against the front car (rad): ~34° (the inner edges of the end walls would meet beyond ~40°) */
export const MAX_BEND = 0.6;
/** The bellows' ribs */
export const FOLDS = 9;

/**
 * Clips non-indexed triangles (position, normal: 3 floats a vertex; part: 1 float a vertex) to the half-space
 * sign * (z - cut) >= 0: triangles inside are kept, those crossing the plane are cut along it (the new vertices
 * interpolated), those outside dropped. Returns { position, normal, part } as Float32Arrays.
 */
export function clipTriangles(position, normal, part, cut, sign = 1) {
  const P = [], N = [], R = [];
  const d = (i) => sign * (position[i * 3 + 2] - cut);
  const vert = (i) => ({ p: [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]], n: [normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]], r: part[i], d: d(i) });
  const lerp = (a, b) => {
    const t = a.d / (a.d - b.d);
    const n = [0, 1, 2].map((k) => a.n[k] + (b.n[k] - a.n[k]) * t);
    const l = Math.hypot(...n) || 1;
    const p = [0, 1, 2].map((k) => a.p[k] + (b.p[k] - a.p[k]) * t);
    p[2] = cut; // (exactly on the plane)
    return { p, n: n.map((v) => v / l), r: t < 0.5 ? a.r : b.r, d: 0 };
  };
  const emit = (v) => { P.push(...v.p); N.push(...v.n); R.push(v.r); };
  const count = position.length / 3;
  for (let t = 0; t + 2 < count; t += 3) {
    const tri = [vert(t), vert(t + 1), vert(t + 2)];
    if (tri.every((v) => v.d >= 0)) { tri.forEach(emit); continue; }
    if (tri.every((v) => v.d <= 0)) continue;
    // Sutherland–Hodgman against the one plane, then a fan
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      if (a.d >= 0) poly.push(a);
      if ((a.d >= 0) !== (b.d >= 0) && a.d !== b.d) poly.push(lerp(a, b));
    }
    for (let k = 1; k + 1 < poly.length; k++) { emit(poly[0]); emit(poly[k]); emit(poly[k + 1]); }
  }
  return { position: new Float32Array(P), normal: new Float32Array(N), part: new Float32Array(R) };
}

/**
 * A closed rounded rectangle in the (x, y) plane, counter-clockwise seen from +z: half width `halfW`, from `y0` to `y1`,
 * the top corners rounded by `rTop`, the bottom ones by `rBottom`, `perCorner` points on each corner arc.
 * Returns [[x, y], ...] (not repeating the first point).
 */
export function roundedRectProfile(halfW, y0, y1, rTop = 0.3, rBottom = 0.1, perCorner = 5) {
  const pts = [];
  const arc = (cx, cy, r, a0) => {
    for (let k = 0; k <= perCorner; k++) {
      const a = a0 + (k / perCorner) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  arc(halfW - rBottom, y0 + rBottom, rBottom, -Math.PI / 2); // bottom right
  arc(halfW - rTop, y1 - rTop, rTop, 0); // top right
  arc(-halfW + rTop, y1 - rTop, rTop, Math.PI / 2); // top left
  arc(-halfW + rBottom, y0 + rBottom, rBottom, Math.PI); // bottom left
  return pts;
}

/** Outward normal (x, y) of a closed profile at point k (from its neighbours) */
function profileNormal(profile, k) {
  const a = profile[(k - 1 + profile.length) % profile.length], b = profile[(k + 1) % profile.length];
  const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
  return [ty / l, -tx / l]; // (counter-clockwise: the right of the tangent is outside)
}

/** The rib rings of the bellows: 2 * folds + 1 rings, alternately out (a crest) and in (a valley) */
export const bellowsRingCount = (folds = FOLDS) => 2 * folds + 1;

/**
 * Vertex positions (x, y, z per vertex, ring by ring, `profile.length` vertices a ring) of the bellows spanned between
 * the front car's end wall (at local z = +gap/2, facing back) and the rear car's (turned by `bend` rad against the
 * front car, gap/2 behind the hinge at the origin). Each ring stands across the quadratic curve front wall -> hinge ->
 * rear wall at its parameter; crests stand `depth` out of the profile, valleys `depth` * 0.4 in. Writes into `out`.
 */
export function bellowsPositions(bend, gap, profile, { folds = FOLDS, depth = 0.05, out = null } = {}) {
  const rings = bellowsRingCount(folds), n = profile.length;
  out ??= new Float32Array(rings * n * 3);
  const h = gap / 2;
  // A = (0, h) on the front wall; B = -(sin bend, cos bend) * h on the rear wall; the control point the hinge (0, 0)
  const bx = -Math.sin(bend) * h, bz = -Math.cos(bend) * h;
  let o = 0;
  for (let r = 0; r < rings; r++) {
    const t = r / (rings - 1), u = 1 - t;
    const cx = t * t * bx, cz = u * u * h + t * t * bz;
    // forward along the curve: -(dP/dt) = 2u A - 2t B
    let fx = -2 * t * bx, fz = 2 * u * h - 2 * t * bz;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const ax = fz, az = -fx; // the ring's local +x
    const off = r === 0 || r === rings - 1 ? 0 : r % 2 ? depth : -depth * 0.4;
    for (let k = 0; k < n; k++) {
      const [px, py] = profile[k];
      const [nx, ny] = profileNormal(profile, k);
      const x = px + nx * off, y = py + ny * off;
      out[o++] = cx + ax * x;
      out[o++] = y;
      out[o++] = cz + az * x;
    }
  }
  return out;
}

/** Triangle indices joining the bellows' rings (quads between neighbouring rings, round the closed profile) */
export function bellowsIndex(rings, n) {
  const idx = [];
  for (let r = 0; r + 1 < rings; r++) {
    for (let k = 0; k < n; k++) {
      const a = r * n + k, b = r * n + ((k + 1) % n), c = a + n, d = b + n;
      idx.push(a, c, b, b, c, d);
    }
  }
  return idx;
}

/** Wraps an angle to [-pi, pi] */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The rear car's yaw after `dt` s, the front car (yaw `frontYaw`) moving at `speed` m/s (negative: reversing) with the
 * hinge on it: the trailer turns towards the front car at speed / arm (`arm`: hinge to the rear car's axle, m), the bend
 * held within `maxBend`.
 */
export function trailerYaw(rearYaw, frontYaw, speed, dt, arm, maxBend = MAX_BEND) {
  let bend = wrapAngle(frontYaw - rearYaw);
  bend -= Math.sin(bend) * (speed / Math.max(0.5, arm)) * dt;
  bend = Math.max(-maxBend, Math.min(maxBend, bend));
  return frontYaw - bend;
}

/**
 * Along a route: the distance s (behind `sHinge`) of the rear car's axle, the point at s being `arm` m (straight line)
 * from the hinge `hinge` ({ x, z }); `pointAt(s)` gives { x, z } on the route. (The chord is never longer than the arc,
 * so the axle lies between sHinge - arm and sHinge - 2 arm; bisection.)
 */
export function solveTrailerAxle(pointAt, sHinge, hinge, arm) {
  const dist = (s) => { const p = pointAt(s); return Math.hypot(p.x - hinge.x, p.z - hinge.z); };
  let lo = sHinge - arm, hi = sHinge - 2 * arm; // (lo: chord <= arm; hi: beyond it, on any sensible bend)
  if (dist(hi) < arm) return hi;
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    if (dist(mid) < arm) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
