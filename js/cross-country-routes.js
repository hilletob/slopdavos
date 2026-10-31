// The cross-country skiers' traffic on the Loipen (js/cross-country.js draws and animates them): which lane of a
// trail each style uses, where a skier is along it, how fast they go, and keeping them from running into each other.
// Pure logic without three.js (tests/cross-country.test.mjs).
//
// Lanes follow the grooming that js/loipen.js draws (its LAYOUT: offsets across the centre line, positive to the right
// of the trail's drawing direction): skiers keep right, so each direction has its own lane. Classic skiers run in the
// right-hand classic track (on a classic+skating trail the tracks lie along the edges), skaters in their half of the
// skating lane (on a classic+skating trail the middle).

export const CLASSIC = 'classic';
export const SKATE = 'skate';

// Techniques (cross-country.js poses them)
export const TECH = { DIAGONAL: 0, DOUBLE_POLE: 1, TUCK: 2, V2: 3, V2_ALT: 4 };

/** The layout of a grooming (js/loipen.js LAYOUT); unknown values ('classic;skating') are groomed for both */
export const loipeLayout = (layouts, grooming) => layouts[grooming] || layouts['classic+skating'];

/** The lanes of a trail with this layout: { style, dir (+1 along the drawn line, -1 against it), offset (m) } */
export function skiLanes(layout) {
  const lanes = [];
  if (layout.tracks && layout.tracks.length) {
    const t = Math.max(...layout.tracks.map(Math.abs));
    lanes.push({ style: CLASSIC, dir: 1, offset: t }, { style: CLASSIC, dir: -1, offset: -t });
  }
  if (layout.skate) {
    const [a, b] = layout.skate, mid = (a + b) / 2;
    lanes.push({ style: SKATE, dir: 1, offset: (mid + b) / 2 }, { style: SKATE, dir: -1, offset: (a + mid) / 2 });
  }
  return lanes;
}

const laneOf = (trail, style, dir) => trail.lanes.find((l) => l.style === style && l.dir === dir);

/**
 * The trail network: each trail's polyline with its cumulative lengths, lanes and the trails meeting its ends.
 * `trails`: DAVOS_DATA.loipen ({ pts: [x, z, ...], grooming }), `layouts`: loipen.js LAYOUT.
 */
export function createSkiNetwork(trails, layouts, { minLength = 40, joinDistance = 6 } = {}) {
  const list = [];
  for (const t of trails) {
    const n = t.pts.length / 2;
    if (n < 2) continue;
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(t.pts[i * 2] - t.pts[i * 2 - 2], t.pts[i * 2 + 1] - t.pts[i * 2 - 1]);
    const length = cum[n - 1];
    if (length < minLength) continue;
    const lanes = skiLanes(loipeLayout(layouts, t.grooming));
    if (!lanes.length) continue;
    list.push({ index: list.length, id: t.id, name: t.name, grooming: t.grooming, pts: t.pts, cum, length, lanes, ends: [[], []] });
  }
  // Trails meeting at their ends (to ski on along the next one)
  const endPoint = (tr, e) => (e ? [tr.pts[tr.pts.length - 2], tr.pts[tr.pts.length - 1]] : [tr.pts[0], tr.pts[1]]);
  for (const a of list) for (let ea = 0; ea < 2; ea++) {
    const [ax, az] = endPoint(a, ea);
    for (const b of list) for (let eb = 0; eb < 2; eb++) {
      if (a === b && ea === eb) continue;
      const [bx, bz] = endPoint(b, eb);
      if (Math.hypot(ax - bx, az - bz) <= joinDistance) a.ends[ea].push({ trail: b, end: eb });
    }
  }
  return { trails: list };
}

/** Centre line point and (unit) direction at arc length s, the direction smoothed over ±`smooth` m around corners */
export function trailPoint(trail, s, out = {}, smooth = 2.5) {
  const at = (d, o) => {
    const c = trail.cum, p = trail.pts;
    d = Math.max(0, Math.min(trail.length, d));
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
    const L = c[hi] - c[lo] || 1, t = (d - c[lo]) / L;
    o.x = p[lo * 2] + (p[hi * 2] - p[lo * 2]) * t;
    o.z = p[lo * 2 + 1] + (p[hi * 2 + 1] - p[lo * 2 + 1]) * t;
    return o;
  };
  at(s, out);
  const a = at(s - smooth, { x: 0, z: 0 }), b = at(s + smooth, { x: 0, z: 0 });
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  out.dx = (b.x - a.x) / L;
  out.dz = (b.z - a.z) / L;
  return out;
}

/** World position of a skier: the trail point plus the lane offset (to the right of the drawn direction) */
export function skierPosition(sk, out = {}) {
  trailPoint(sk.trail, sk.s, out);
  // right of the drawing direction: n = (-dz, dx)
  const offset = sk.offset + (sk.dodge || 0) * sk.dir;
  out.x += -out.dz * offset;
  out.z += out.dx * offset;
  out.hx = out.dx * sk.dir; // heading
  out.hz = out.dz * sk.dir;
  return out;
}

// Personal pace on the flat (m/s): classic 3.2-5, skating 4.3-6.5
const basePace = (style, r) => (style === CLASSIC ? 3.2 + 1.8 * r : 4.3 + 2.2 * r);

/** Speed for the slope (grade: rise per metre in the direction of travel): slower uphill, faster downhill (tucked) */
export function paceOnGrade(base, grade) {
  if (grade >= 0) return Math.max(1.5, base * (1 - 5 * grade));
  return Math.min(10, base + -grade * 30);
}

/** The technique for the style and slope (with the skier's own preference on the flat) */
export function chooseTechnique(sk, grade) {
  if (sk.style === CLASSIC) {
    if (grade < -0.06) return TECH.TUCK;
    if (grade > 0.025) return TECH.DIAGONAL;
    // On the flat: double poling for the strong, diagonal stride with an occasional burst of double poling for others
    return sk.prefer < 0.45 || sk.burst > 0 ? TECH.DOUBLE_POLE : TECH.DIAGONAL;
  }
  if (grade < -0.05) return TECH.TUCK;
  if (grade > 0.05) return TECH.V2_ALT; // 2:1 uphill
  return sk.prefer < 0.55 ? TECH.V2 : TECH.V2_ALT; // 1:1 or 2:1
}

/** A skier on a lane at arc length s */
export function placeSkier(sk, trail, s, lane) {
  sk.trail = trail;
  sk.s = s;
  sk.dir = lane.dir;
  sk.style = lane.style;
  sk.offset = sk.laneOffset = lane.offset;
  sk.base = basePace(sk.style, sk.r);
  sk.v = sk.base;
  sk.target = sk.base;
  sk.tech = sk.style === CLASSIC ? TECH.DIAGONAL : TECH.V2;
  sk.active = true;
  return sk;
}

/** A new skier record; `rand` a 0..1 random source */
export function createSkier(id, rand) {
  return { id, r: rand(), prefer: rand(), burst: 0, burstTimer: 4 + rand() * 20, active: false, trail: null, s: 0, dir: 1, style: CLASSIC,
    offset: 0, laneOffset: 0, base: 4, v: 0, target: 0, tech: TECH.DIAGONAL, grade: 0 };
}

// At a trail's end: on along a trail that meets it (with a lane for the style), else turn round
function trailEnd(sk, end, rand) {
  const options = sk.trail.ends[end].filter((o) => laneOf(o.trail, sk.style, o.end === 0 ? 1 : -1));
  if (options.length) {
    const o = options[Math.floor(rand() * options.length)];
    const dir = o.end === 0 ? 1 : -1;
    const lane = laneOf(o.trail, sk.style, dir);
    const over = Math.abs(end ? sk.s - sk.trail.length : sk.s);
    // (the offset is across the new trail's drawing direction: keep the skier where it is, to the right of its travel)
    sk.offset = sk.offset * sk.dir * dir;
    sk.trail = o.trail;
    sk.dir = dir;
    sk.s = o.end === 0 ? over : o.trail.length - over;
    sk.laneOffset = lane.offset;
    return;
  }
  const lane = laneOf(sk.trail, sk.style, -sk.dir);
  if (!lane) { sk.active = false; return; }
  // (stops, turns round and sets off again)
  sk.dir = -sk.dir;
  sk.s = end ? sk.trail.length - 0.01 : 0.01;
  sk.v = 0;
  sk.laneOffset = lane.offset;
}

/** Moves a skier dt seconds along (speed easing towards `target`, the lane offset easing towards its lane) */
export function advanceSkier(sk, dt, rand = Math.random) {
  const accel = sk.target > sk.v ? 0.8 : 6;
  sk.v += Math.max(-accel * dt, Math.min(accel * dt, sk.target - sk.v));
  sk.s += sk.dir * sk.v * dt;
  const d = sk.hold ? 0 : sk.laneOffset - sk.offset;
  sk.offset += Math.max(-0.8 * dt, Math.min(0.8 * dt, d));
  const dodge = (sk.dodging ? 0.5 : 0) - (sk.dodge || 0);
  sk.dodge = (sk.dodge || 0) + Math.max(-0.6 * dt, Math.min(0.6 * dt, dodge));
  if (sk.s > sk.trail.length) trailEnd(sk, 1, rand);
  else if (sk.s < 0) trailEnd(sk, 0, rand);
  if (sk.burstTimer !== undefined) {
    sk.burstTimer -= dt;
    if (sk.burstTimer < 0) {
      if (sk.burst > 0) { sk.burst = 0; sk.burstTimer = 10 + rand() * 25; } else { sk.burst = 1; sk.burstTimer = 3 + rand() * 5; }
    }
  }
}

/**
 * Keeps the skiers from running into each other: one following another in its lane slows to its speed with a gap,
 * and whoever finds someone in their path (a skier crossing over to its lane after a junction or turning round) stops
 * short; the one crossing over keeps moving sideways meanwhile, clearing the way. The lanes either way lie further
 * apart than `clearance`, so oncoming skiers pass. `positions[i]` from skierPosition(). Caps each skier's `target`.
 */
export function keepApart(skiers, positions, { minGap = 3.5, headway = 0.7, clearance = 1.0 } = {}) {
  const n = skiers.length;
  const changing = (s) => Math.abs(s.laneOffset - s.offset) > 0.05;
  for (const s of skiers) s.hold = s.dodging = false;
  for (let i = 0; i < n; i++) {
    const a = skiers[i], pa = positions[i];
    if (!a.active) continue;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = skiers[j], pb = positions[j];
      if (!b.active) continue;
      const rx = pb.x - pa.x, rz = pb.z - pa.z;
      const dist = Math.hypot(rx, rz);
      const sameWay = pa.hx * pb.hx + pa.hz * pb.hz > 0.3;
      const reach = minGap + headway * (a.v + (sameWay ? 0 : b.v)) + 2;
      if (dist > reach) continue;
      const ahead = rx * pa.hx + rz * pa.hz; // b's distance ahead of a
      const right = rz * pa.hx - rx * pa.hz; // ...and to its right
      // Crossing over to its lane: wait for the skier alongside on that side to pass
      if (changing(a) && Math.abs(ahead) < 2.5 && Math.abs(right) < 2 && right * (a.laneOffset - a.offset) * a.dir > 0) a.hold = true;
      // Paths crossing (at a junction, or a skier crossing over): if they would meet within 3 s, the higher id waits
      if ((a.trail !== b.trail || changing(a) || changing(b)) && a.id > b.id) {
        const rvx = pb.hx * b.v - pa.hx * a.v, rvz = pb.hz * b.v - pa.hz * a.v;
        const rv2 = rvx * rvx + rvz * rvz;
        const tca = rv2 > 1e-6 ? Math.max(0, Math.min(3, -(rx * rvx + rz * rvz) / rv2)) : 0;
        if (tca > 0 && Math.hypot(rx + rvx * tca, rz + rvz * tca) < 1.2) a.target = 0;
      }
      // Meeting head-on on overlapping trails: both step aside to their right
      if (!sameWay && pa.hx * pb.hx + pa.hz * pb.hz < -0.7 && ahead > 0 && ahead < 12 && Math.abs(right) < 1.4) a.dodging = true;
      if (ahead <= 0) continue;
      // (the lane being crossed into counts as in the way)
      if (Math.abs(right) > clearance + (changing(a) || changing(b) ? 0.8 : 0)) continue;
      const gap = ahead - minGap;
      const follow = sameWay ? Math.max(0, b.v * Math.min(1, ahead / (minGap + headway * b.v))) : 0;
      const cap = gap <= 0 ? 0 : Math.max(follow, gap / headway) * (sameWay ? 1 : 0.5);
      a.target = Math.max(0, Math.min(a.target, sameWay ? Math.min(cap, b.v + gap * 0.6) : cap));
    }
  }
}

// --- Spawning near the camera --------------------------------------------------------------------------------------------
/** The stretches of trail within `radius` of (x, z): [{ trail, s0, s1 }] and their total length */
export function nearbyStretches(net, x, z, radius) {
  const out = [];
  let total = 0;
  const r2 = radius * radius;
  for (const t of net.trails) {
    const p = t.pts;
    let start = -1;
    for (let i = 0; i < t.cum.length; i++) {
      const dx = p[i * 2] - x, dz = p[i * 2 + 1] - z;
      const inside = dx * dx + dz * dz <= r2;
      if (inside && start < 0) start = i;
      if ((!inside || i === t.cum.length - 1) && start >= 0) {
        const end = inside ? i : i - 1;
        if (end > start) { out.push({ trail: t, s0: t.cum[start], s1: t.cum[end] }); total += t.cum[end] - t.cum[start]; }
        start = -1;
      }
    }
  }
  return { stretches: out, total };
}

/**
 * Puts skier `sk` somewhere on the stretches (weighted by length), on a random lane of its trail, at least
 * `spacing` m from every other skier and at least `minDistance` m from (cx, cz). Returns false if no place was found.
 */
export function spawnSkier(sk, near, skiers, rand, { cx = 0, cz = 0, minDistance = 0, spacing = 25, tries = 12 } = {}) {
  if (!near.total) return false;
  const p = {};
  for (let k = 0; k < tries; k++) {
    let pick = rand() * near.total, st = near.stretches[0];
    for (const s of near.stretches) { st = s; pick -= s.s1 - s.s0; if (pick <= 0) break; }
    const s = st.s0 + rand() * (st.s1 - st.s0);
    const lane = st.trail.lanes[Math.floor(rand() * st.trail.lanes.length)];
    placeSkier(sk, st.trail, Math.max(1, Math.min(st.trail.length - 1, s)), lane);
    skierPosition(sk, p);
    if (Math.hypot(p.x - cx, p.z - cz) < minDistance) continue;
    let free = true;
    for (const o of skiers) {
      if (o === sk || !o.active) continue;
      const q = skierPosition(o, {});
      if (Math.hypot(q.x - p.x, q.z - p.z) < spacing) { free = false; break; }
    }
    if (free) return true;
  }
  sk.active = false;
  return false;
}
