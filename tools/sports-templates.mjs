// tools/sports-templates.mjs — the regulation markings of a sports ground, laid into the rectangle or stadium fitted to the
// aerial photo (tools/trace-ground.mjs, tools/ground-sports.py): athletics lanes, football (FIFA), basketball (FIBA),
// tennis (ITF), volleyball (FIVB), handball (IHF). Lines in the format of js/vector-ground.js:
// { c: 'w' | 'y' | 'b' | 'r', w: width in m, pts: [x, z, …] } (a closed polyline repeats its first point) or
// { c, w, arc: [cx, cz, r, a0, a1] } (world angles from +x towards +z, a0 < a1).
// The frame of a fit { cx, cz, heading, l, w }: u along the long side, heading = atan2(ux, uz) (as js/parking-data.js
// bays), v across it; the template works in (u, v) metres from the centre.

export const LANE_W = 1.22;

export function frame({ cx, cz, heading }) {
  const ux = Math.sin(heading), uz = Math.cos(heading), vx = Math.cos(heading), vz = -Math.sin(heading);
  const pt = (u, v) => [cx + u * ux + v * vx, cz + u * uz + v * vz];
  return {
    /** A polyline from (u, v) pairs */
    line(c, w, uv, closed = false) {
      const pts = [];
      for (const [u, v] of uv) pts.push(...pt(u, v));
      if (closed) pts.push(pts[0], pts[1]);
      return { c, w, pts };
    },
    /** An arc about (cu, cv) of local angles [t0, t1] (t from +u towards +v) */
    arc(c, w, cu, cv, r, t0, t1) {
      // local direction (cos t, sin t) maps to the world angle π/2 − heading − t: the sense reverses
      const [x, z] = pt(cu, cv);
      const a0 = Math.PI / 2 - heading - t1, a1 = Math.PI / 2 - heading - t0;
      return { c, w, arc: [x, z, r, a0, a1] };
    },
    pt
  };
}

/**
 * The lane lines of a 400 m track: a stadium of straights L along u and bends of radius R about (±L/2, 0).
 * The kerb (inner edge) at R, lane lines at R + k·1.22 (k = 1 … lanes), the finish line across the lanes at the end of
 * the home straight (v on `finishSide`).
 */
export function trackLines({ cx, cz, heading, L, R, lanes, laneW = LANE_W, finishSide = -1 }) {
  const f = frame({ cx, cz, heading }), out = [];
  for (let k = 0; k <= lanes; k++) {
    const r = R + k * laneW, w = 0.05;
    out.push(f.line('w', w, [[-L / 2, r], [L / 2, r]]));
    out.push(f.line('w', w, [[-L / 2, -r], [L / 2, -r]]));
    out.push(f.arc('w', w, L / 2, 0, r, -Math.PI / 2, Math.PI / 2));
    out.push(f.arc('w', w, -L / 2, 0, r, Math.PI / 2, (3 * Math.PI) / 2));
  }
  out.push(f.line('w', 0.05, [[L / 2, finishSide * R], [L / 2, finishSide * (R + lanes * laneW)]]));
  return out;
}

/** Lane 1's measured length (0.30 m out from the kerb) */
export const trackLength = ({ L, R }) => 2 * L + 2 * Math.PI * (R + 0.3);

/** Football: the FIFA markings in a pitch of l × w (junior: a small pitch's markings, approximate) */
export function fifaLines(rect, { junior = false, c = 'w' } = {}) {
  const f = frame(rect), { l, w } = rect, hl = l / 2, hw = w / 2, lw = junior ? 0.08 : 0.12, out = [];
  const circle = junior ? Math.min(6, hw * 0.4) : 9.15;
  const pa = junior ? { d: Math.min(13, l * 0.2), w: Math.min(29, w * 0.6) } : { d: 16.5, w: 40.32 };
  const ga = junior ? { d: Math.min(4, pa.d * 0.4), w: Math.min(13, w * 0.3) } : { d: 5.5, w: 18.32 };
  const spot = junior ? Math.min(9, pa.d * 0.7) : 11;
  out.push(f.line(c, lw, [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]], true));
  out.push(f.line(c, lw, [[0, -hw], [0, hw]]));
  out.push(f.arc(c, lw, 0, 0, circle, 0, 2 * Math.PI));
  out.push(f.arc(c, lw, 0, 0, 0.06, 0, 2 * Math.PI)); // centre spot
  for (const s of [1, -1]) {
    const g = s * hl, i = (d) => s * (hl - d);
    out.push(f.line(c, lw, [[g, -pa.w / 2], [i(pa.d), -pa.w / 2], [i(pa.d), pa.w / 2], [g, pa.w / 2]]));
    out.push(f.line(c, lw, [[g, -ga.w / 2], [i(ga.d), -ga.w / 2], [i(ga.d), ga.w / 2], [g, ga.w / 2]]));
    out.push(f.arc(c, lw, i(spot), 0, 0.06, 0, 2 * Math.PI)); // penalty spot
    // the penalty arc: the part of the circle about the spot outside the area
    const gap = pa.d - spot;
    if (circle > gap) {
      const a = Math.acos(gap / circle);
      out.push(s > 0 ? f.arc(c, lw, i(spot), 0, circle, Math.PI - a, Math.PI + a) : f.arc(c, lw, i(spot), 0, circle, -a, a));
    }
    if (!junior) {
      // corner arcs r 1, inside the pitch
      out.push(s > 0 ? f.arc(c, lw, hl, hw, 1, Math.PI, 1.5 * Math.PI) : f.arc(c, lw, -hl, hw, 1, 1.5 * Math.PI, 2 * Math.PI));
      out.push(s > 0 ? f.arc(c, lw, hl, -hw, 1, 0.5 * Math.PI, Math.PI) : f.arc(c, lw, -hl, -hw, 1, 0, 0.5 * Math.PI));
    }
  }
  return out;
}

/** Basketball: FIBA (28 × 15; interior markings at their regulation sizes from the baselines of the fitted court) */
export function fibaLines(rect, { c = 'w' } = {}) {
  const f = frame(rect), { l, w } = rect, hl = l / 2, hw = w / 2, lw = 0.05, out = [];
  out.push(f.line(c, lw, [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]], true));
  out.push(f.line(c, lw, [[0, -hw], [0, hw]]));
  out.push(f.arc(c, lw, 0, 0, 1.8, 0, 2 * Math.PI));
  const side = Math.min(6.6, hw - 0.9), r3 = 6.75;
  for (const s of [1, -1]) {
    const g = s * hl, i = (d) => s * (hl - d);
    out.push(f.line(c, lw, [[g, -2.45], [i(5.8), -2.45], [i(5.8), 2.45], [g, 2.45]])); // the key
    out.push(s > 0 ? f.arc(c, lw, i(5.8), 0, 1.8, 0.5 * Math.PI, 1.5 * Math.PI) : f.arc(c, lw, i(5.8), 0, 1.8, -0.5 * Math.PI, 0.5 * Math.PI));
    const basket = i(1.575), du = Math.sqrt(r3 * r3 - side * side), phi = Math.asin(side / r3);
    for (const v of [side, -side]) out.push(f.line(c, lw, [[g, v], [basket - s * du, v]]));
    out.push(s > 0 ? f.arc(c, lw, basket, 0, r3, Math.PI - phi, Math.PI + phi) : f.arc(c, lw, basket, 0, r3, -phi, phi));
  }
  return out;
}

/** Tennis: ITF (23.77 × 10.97 doubles, 8.23 singles, service lines 6.40 from the net) */
export function itfLines(rect, { c = 'w', doubles = true } = {}) {
  const f = frame(rect), { l, w } = rect, hl = l / 2, hw = w / 2, out = [];
  const hs = doubles ? Math.min(4.115, hw - 0.5) : hw, sl = Math.min(6.4, hl - 3);
  out.push(f.line(c, 0.05, [[-hl, -hw], [hl, -hw]]));
  out.push(f.line(c, 0.05, [[-hl, hw], [hl, hw]]));
  for (const s of [1, -1]) {
    out.push(f.line(c, 0.1, [[s * hl, -hw], [s * hl, hw]])); // baseline
    out.push(f.line(c, 0.05, [[s * sl, -hs], [s * sl, hs]])); // service line
    out.push(f.line(c, 0.05, [[s * hl, 0], [s * (hl - 0.1), 0]])); // centre mark
  }
  if (doubles) for (const v of [hs, -hs]) out.push(f.line(c, 0.05, [[-hl, v], [hl, v]]));
  out.push(f.line(c, 0.05, [[-sl, 0], [sl, 0]])); // centre service line
  return out;
}

/** Volleyball: FIVB (18 × 9, attack lines 3 m from the centre line) */
export function fivbLines(rect, { c = 'w' } = {}) {
  const f = frame(rect), { l, w } = rect, hl = l / 2, hw = w / 2, lw = 0.05;
  return [
    f.line(c, lw, [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]], true),
    f.line(c, lw, [[0, -hw], [0, hw]]),
    f.line(c, lw, [[3, -hw], [3, hw]]),
    f.line(c, lw, [[-3, -hw], [-3, hw]])
  ];
}

/** Handball: IHF (40 × 20; the 6 m goal area: quarter circles about the posts of the 3 m goal joined by a straight) */
export function handballLines(rect, { c = 'w' } = {}) {
  const f = frame(rect), { l, w } = rect, hl = l / 2, hw = w / 2, lw = 0.05, out = [];
  out.push(f.line(c, lw, [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]], true));
  out.push(f.line(c, lw, [[0, -hw], [0, hw]]));
  for (const s of [1, -1]) {
    const g = s * hl, r = Math.min(6, hw - 1);
    out.push(f.line(c, lw, [[g - s * r, -1.5], [g - s * r, 1.5]]));
    out.push(s > 0 ? f.arc(c, lw, g, 1.5, r, 0.5 * Math.PI, Math.PI) : f.arc(c, lw, g, 1.5, r, 0, 0.5 * Math.PI));
    out.push(s > 0 ? f.arc(c, lw, g, -1.5, r, Math.PI, 1.5 * Math.PI) : f.arc(c, lw, g, -1.5, r, 1.5 * Math.PI, 2 * Math.PI));
  }
  return out;
}

/** The regulation sizes the court finder (tools/ground-sports.py) tests against: [l, w, tolerance] */
export const COURTS = {
  football: { l: [85, 106], w: [45, 70] },
  junior: { l: [35, 75], w: [25, 50] },
  basketball: { l: [24, 28.5], w: [13, 15.5] },
  tennis: { l: [23.37, 24.17], w: [10.57, 11.37] },
  volleyball: { l: [17.6, 18.4], w: [8.6, 9.4] },
  handball: { l: [30, 42], w: [15, 22] } // (school and multi-sport courts: smaller than the IHF's 40 × 20)
};

export const TEMPLATES = { football: fifaLines, junior: (r, o) => fifaLines(r, { ...o, junior: true }), basketball: fibaLines, tennis: itfLines, volleyball: fivbLines, handball: handballLines };
