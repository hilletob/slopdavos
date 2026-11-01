import { DAVOS_DATA } from './davos-geodata.js';
import { SKI_PISTES } from './ski-pistes-data.js';

// js/missions-data.js
// The missions (js/missions.js runs them): their definitions and the pure progress logic. No three.js and no DOM in
// here, so that tests/missions.test.mjs can drive the missions with synthetic frames.
//
// A mission:
//   { id, title, intro, mode, season ('winter' | 'summer' | null), time (js/lighting.js preset id), nightTime (with
//     &night=1), start: { x, z, heading, onGround } (world frame; the helicopter starts set down when onGround),
//     allowModes: the modes the player may switch to without aborting (default: only `mode`),
//     features: ['shooter' | 'policeCar' | 'regaScript' | 'trafficBlock'] (runtime extras in js/missions.js),
//     props: [{ id, type, x, z, heading?, hideAfter: <objective id>, showAfter: <objective id> }] (js/missions-props.js),
//     createState(): the mission's scratch state,
//     update(ctx, state): per frame, before the objectives are checked,
//     objectives: [{ id, title, allowModes?, check(ctx, state) -> { done, progress (0-1 or null), text,
//                    target { x, z, r?, style? } | null, hint (string | null), fail (string | null) } }],
//     bonusMs: a time to beat for the bonus note on the finish panel, finish: the finish message,
//     summary(state): extra lines for the finish panel }
//
// `ctx` is the frame as js/missions.js assembles it from the controllers:
//   { mode, x, y, z, heading, speed, verticalSpeed, agl (m over the surface under the player), tillerRaised, tillerLift,
//     segs: { array: Float32Array [ax, az, bx, bz, s, pass], count }, highBeam, blueLight, night, dt (s),
//     t (ms since the clock started, 0 before), shooter: { shots, hits, misses, ammo, inFlight }, rega: { phase } }

export const SAMPLE_STEP = 10; // m between two samples of a Loipe
export const GROOM_RADIUS = 2.5; // m: a sample counts as groomed with a tiller pass this close
export const BEST_TIMES_KEY = 'slopdavos-mission-best';
export const GRAVITY = 9.81;

// --- Geometry helpers ------------------------------------------------------------------------------------------------
/** The length (m) of a flat polyline [x0, z0, x1, z1, ...] */
export function polylineLength(pts) {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}

/** The polyline sampled every `step` m: [{ x, z, s (arc length), done: false }], its last point always included */
export function samplePolyline(pts, step = SAMPLE_STEP) {
  const out = [];
  if (pts.length < 4) return out;
  let s = 0, next = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    while (next <= s + L) {
      const t = (next - s) / L;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, s: next, done: false });
      next += step;
    }
    s += L;
  }
  const lx = pts[pts.length - 2], lz = pts[pts.length - 1];
  const last = out[out.length - 1];
  if (!last || Math.hypot(last.x - lx, last.z - lz) > step * 0.5) out.push({ x: lx, z: lz, s, done: false });
  return out;
}

/** Squared distance of (px, pz) from the segment a-b */
export function segmentDistanceSq(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return qx * qx + qz * qz;
}

/** Marks the samples within `radius` of the groom map's segments [from, to) as done; returns how many were newly done.
 *  (`segs` is the groom map's Float32Array of 6 floats a segment: ax, az, bx, bz, s, pass) */
export function markGroomed(samples, segs, from, to, radius = GROOM_RADIUS) {
  let marked = 0;
  const r2 = radius * radius, reach = radius + 0.01;
  for (let k = from; k < to; k++) {
    const o = k * 6;
    const ax = segs[o], az = segs[o + 1], bx = segs[o + 2], bz = segs[o + 3];
    const minX = Math.min(ax, bx) - reach, maxX = Math.max(ax, bx) + reach;
    const minZ = Math.min(az, bz) - reach, maxZ = Math.max(az, bz) + reach;
    for (const p of samples) {
      if (p.done || p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) continue;
      if (segmentDistanceSq(p.x, p.z, ax, az, bx, bz) <= r2) { p.done = true; marked++; }
    }
  }
  return marked;
}

export const doneFraction = (samples) => (samples.length ? samples.filter((p) => p.done).length / samples.length : 0);

/** The nearest sample not yet done to (x, z), or null */
export function nearestUndone(samples, x, z) {
  let best = null, bd = Infinity;
  for (const p of samples) {
    if (p.done) continue;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** The target's bearing relative to the player's heading, in rad, -π..π; positive = to the player's left
 *  (world frame: heading 0 looks along +z, heading π/2 along +x, as the controllers move the player) */
export function relativeBearing(x, z, heading, tx, tz) {
  let a = Math.atan2(tx - x, tz - z) - heading;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** mm:ss.d */
export function formatTime(ms) {
  const t = Math.max(0, ms || 0);
  const m = Math.floor(t / 60000), s = Math.floor((t % 60000) / 1000), d = Math.floor((t % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
}

export const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);

/** A shot from `origin` with velocity `v` under gravity, stepped until it meets the ground (`groundAt(x, z)`):
 *  { x, y, z, t } of the impact, or null when nothing is hit within `maxT` s */
export function simulateShot(origin, v, groundAt, { dt = 0.05, maxT = 30, g = GRAVITY } = {}) {
  let { x, y, z } = origin, vx = v.x, vy = v.y, vz = v.z;
  for (let t = 0; t < maxT; t += dt) {
    const nx = x + vx * dt, ny = y + vy * dt - 0.5 * g * dt * dt, nz = z + vz * dt;
    vy -= g * dt;
    const ground = groundAt(nx, nz);
    if (ny <= ground) {
      // the impact on the segment: where the height over the ground crosses zero
      const h0 = y - groundAt(x, z), h1 = ny - ground;
      const f = h0 - h1 > 1e-6 ? Math.max(0, Math.min(1, h0 / (h0 - h1))) : 1;
      return { x: x + (nx - x) * f, y: ground, z: z + (nz - z) * f, t: t + dt * f };
    }
    x = nx; y = ny; z = nz;
  }
  return null;
}

export const inZone = (zone, x, z) => Math.hypot(zone.x - x, zone.z - z) <= zone.r;

// --- Best times (localStorage, one map { [mission id @ variant]: ms }) ---------------------------------------------
export const bestTimeKey = (missionId, variant = null) => (variant ? `${missionId}@${variant}` : missionId);

export function readBestTimes(storage) {
  try { return JSON.parse(storage?.getItem(BEST_TIMES_KEY) || '{}') || {}; } catch { return {}; }
}

/** Records `ms` for the key if it beats the stored time; returns { best, previous, improved } */
export function recordBestTime(storage, key, ms) {
  const all = readBestTimes(storage);
  const previous = Number.isFinite(all[key]) ? all[key] : null;
  const improved = previous === null || ms < previous;
  if (improved) {
    all[key] = ms;
    try { storage?.setItem(BEST_TIMES_KEY, JSON.stringify(all)); } catch { /* storage may be off */ }
  }
  return { best: improved ? ms : previous, previous, improved };
}

// --- The data behind the missions ---------------------------------------------------------------------------------
/** The Loipe (DAVOS_DATA.loipen) with one of the ids, else the longest whose name matches `namePattern` within the
 *  given x range, else null. Returns { id, name, pts (flat), length } */
export function findLoipe({ ids = [], namePattern = null, xMin = -Infinity, xMax = Infinity } = {}, loipen = DAVOS_DATA.loipen) {
  const wrap = (l) => ({ id: l.id, name: l.name, pts: l.pts, length: polylineLength(l.pts) });
  for (const id of ids) {
    const l = loipen.find((c) => c.id === id);
    if (l && l.pts.length >= 4) return wrap(l);
  }
  let best = null;
  for (const l of loipen) {
    if (l.pts.length < 4) continue;
    if (namePattern && !namePattern.test(l.name || '')) continue;
    let inRange = true;
    for (let i = 0; i < l.pts.length; i += 2) if (l.pts[i] < xMin || l.pts[i] > xMax) { inRange = false; break; }
    if (!inRange) continue;
    const w = wrap(l);
    if (!best || w.length > best.length) best = w;
  }
  return best;
}

/** The point at fraction `t` (0-1 of its length) along the ski run with the given id (SKI_PISTES.runs), or null */
export function pointOnRun(id, t, runs = SKI_PISTES.runs) {
  const run = runs.find((r) => r.id === id);
  if (!run) return null;
  const pts = run.pts, total = polylineLength(pts);
  const target = Math.max(0, Math.min(1, t)) * total;
  let s = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const L = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (s + L >= target || i === pts.length - 2) {
      const f = L > 0 ? Math.min(1, (target - s) / L) : 0;
      return { x: pts[i - 2] + (pts[i] - pts[i - 2]) * f, z: pts[i - 1] + (pts[i + 1] - pts[i - 1]) * f, name: run.name, ref: run.ref };
    }
    s += L;
  }
  return null;
}

const dist2d = (ctx, p) => Math.hypot(ctx.x - p.x, ctx.z - p.z);
const lightHint = (ctx) => (ctx.night && !ctx.highBeam ? 'Suchscheinwerfer einschalten [L]' : null);
const headingTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);

// ====================================================================================================================
// Mission 1: the Dischma Loipe
// The "Dischmatal Warm-Up" (OSM w1034080622), 1.9 km of classic and skating track from the mouth of the Dischma valley
// up to the Dischmabach's first bend: ~5 min flat out with the tiller down, 8-10 min with a few turns
const DISCHMA_LOIPE = { ids: ['w1034080622'], namePattern: /Dischma/i, xMin: 700 };
const DISCHMA_TARGET = 0.9;
const dischmaLoipe = () => findLoipe(DISCHMA_LOIPE);
const tillerHint = (ctx) => (ctx.tillerRaised || ctx.tillerLift > 0.03 ? 'Fräse absenken [F]' : null);

export const DISCHMA_MISSION = {
  id: 'dischma-loipe',
  title: 'Dischma-Loipe präparieren',
  intro: 'Die Nachtschicht ruft: Die Loipe im Dischmatal braucht frischen Cord. Fahre mit dem Pistenfahrzeug die Spur ab, die Fräse abgesenkt (F), bis 90 % der Loipe präpariert sind.',
  mode: 'snowcat',
  season: 'winter',
  time: 'golden',
  bonusMs: 6 * 60 * 1000,
  finish: 'Loipe präpariert: Der Cord liegt, die Langläufer können kommen.',
  get start() {
    const l = dischmaLoipe();
    if (!l) return { x: 1584, z: -151, heading: 0.9 };
    const [x, z, nx, nz] = l.pts;
    const heading = Math.atan2(nx - x, nz - z); // lined up with the track, 6 m before its first point
    return { x: x - Math.sin(heading) * 6, z: z - Math.cos(heading) * 6, heading };
  },
  props: [],
  createState() {
    const l = dischmaLoipe();
    const samples = samplePolyline(l ? l.pts : [], SAMPLE_STEP);
    return { loipe: l, samples, length: l ? l.length : 0, segCount: 0 };
  },
  update(ctx, state) {
    const { array, count } = ctx.segs || { array: null, count: 0 };
    if (!array) return;
    // Only the segments stamped since the last frame (the groom map drops its oldest quarter when full: start over then)
    if (count < state.segCount) state.segCount = 0;
    if (count > state.segCount) {
      markGroomed(state.samples, array, state.segCount, count, GROOM_RADIUS);
      state.segCount = count;
    }
  },
  objectives: [
    {
      id: 'start',
      title: 'Fräse absenken und auf die Loipe',
      check(ctx, state) {
        const first = state.samples[0] || null;
        return { done: doneFraction(state.samples) > 0, progress: null, text: 'Die Fräse muss unten sein, damit die Spur zählt.', target: first ? { x: first.x, z: first.z } : null, hint: tillerHint(ctx) };
      }
    },
    {
      id: 'groom',
      title: `Loipe zu ${Math.round(DISCHMA_TARGET * 100)} % präparieren`,
      check(ctx, state) {
        const frac = doneFraction(state.samples);
        const next = nearestUndone(state.samples, ctx.x, ctx.z);
        const text = `Loipe ${Math.round(frac * 100)} % präpariert · ${formatDistance(frac * state.length)} von ${formatDistance(state.length)}`;
        return { done: frac >= DISCHMA_TARGET, progress: Math.min(1, frac / DISCHMA_TARGET), text, target: next ? { x: next.x, z: next.z } : null, hint: tillerHint(ctx) };
      }
    }
  ]
};

// ====================================================================================================================
// Mission 2: the Rega rescue on the Jakobshorn
// The Rega pad on the roof of the Spital Davos (js/helipad.js HELIPAD; js/missions.js takes the built pad's position)
export const SPITAL_PAD = { x: -1139, z: 924.5, r: 7 };
// The injured skier: on the Jakobshorn Standard (OSM w29262638, run 8) above the Ischalp middle station
const PATIENT_RUN = { id: 'w29262638', t: 0.26 };
const PATIENT_FALLBACK = { x: 786, z: 2490 };
const HOVER_SECONDS = 5, LAND_SECONDS = 3;
const patientPosition = () => { const p = pointOnRun(PATIENT_RUN.id, PATIENT_RUN.t); return p ? { x: p.x, z: p.z } : { ...PATIENT_FALLBACK }; };

/** The last leg every Rega mission shares: back to the Spital and down on the pad */
const padLanding = (pad, idle = LAND_SECONDS) => ({
  id: 'return',
  title: 'Zurück zum Spital und landen',
  check(ctx, state) {
    const d = dist2d(ctx, pad);
    const down = d < pad.r && ctx.agl < 1 && Math.abs(ctx.speed) < 0.6 && Math.abs(ctx.verticalSpeed) < 0.6;
    state.land = down ? (state.land || 0) + ctx.dt : 0;
    const text = down ? `Gelandet … ${Math.ceil(idle - state.land)} s` : d < 40 ? 'Auf dem Pad aufsetzen (H), ruhig halten' : `${formatDistance(d)} zum Rega-Landeplatz Spital`;
    return { done: state.land >= idle, progress: Math.min(1, state.land / idle), text, target: { ...pad, style: 'pad' }, hint: lightHint(ctx) };
  }
});

export const REGA_MISSION = {
  id: 'rega-rettung',
  title: 'Verletzte Person ins Spital fliegen',
  intro: 'Ein Skifahrer liegt verletzt auf der Jakobshorn-Standard oberhalb der Ischalp. Flieg mit der Rega hin, schwebe tief über der Person oder lande daneben, bis sie an Bord ist, und bring sie zurück auf den Landeplatz des Spitals.',
  mode: 'helicopter',
  season: 'winter',
  time: 'golden',
  nightTime: 'midnight',
  bonusMs: 3 * 60 * 1000,
  finish: 'Patient übergeben: Das Spital-Team übernimmt.',
  pad: SPITAL_PAD,
  get start() { return { x: this.pad.x, z: this.pad.z, heading: -2.0, onGround: true }; },
  get props() {
    const p = patientPosition();
    return [
      { id: 'patient', type: 'patient', x: p.x, z: p.z, heading: 0.6, hideAfter: 'pickup' },
      { id: 'helper', type: 'helper', x: p.x + 2.2, z: p.z - 1.6, face: { x: p.x, z: p.z } }
    ];
  },
  createState() { return { patient: patientPosition(), hover: 0, land: 0 }; },
  update() {},
  objectives: [
    {
      id: 'approach',
      title: 'Zur verletzten Person fliegen',
      check(ctx, state) {
        const d = dist2d(ctx, state.patient);
        return { done: d < 60 && ctx.agl < 60, progress: null, text: `${formatDistance(d)} zur Unfallstelle`, target: state.patient, hint: lightHint(ctx) };
      }
    },
    {
      id: 'pickup',
      title: 'Patient aufnehmen',
      check(ctx, state) {
        const d = dist2d(ctx, state.patient);
        const close = d < 8 && ctx.agl < 3 && Math.abs(ctx.speed) < 2.5 && Math.abs(ctx.verticalSpeed) < 1.5 && !lightHint(ctx);
        state.hover = close ? state.hover + ctx.dt : 0;
        const text = close ? `Bergung läuft … ${Math.ceil(HOVER_SECONDS - state.hover)} s` : d < 8 ? 'Tiefer: unter 3 m über dem Schnee, ruhig halten' : `${formatDistance(d)} · tief über der Person schweben (< 3 m) oder landen`;
        return { done: state.hover >= HOVER_SECONDS, progress: Math.min(1, state.hover / HOVER_SECONDS), text, target: { ...state.patient, r: 8 }, hint: lightHint(ctx) };
      }
    },
    padLanding(SPITAL_PAD)
  ]
};

// ====================================================================================================================
// Mission 3: avalanche control
// The viewpoint: a shoulder on the Strela side above Davos Dorf (1970 m, LV95 ~2781900/1187100), looking across at
// the south-east flank below the Salezer Horn (above the tree line: the slope whose avalanche reached Davos Dorf in
// 1968). Four zones across its face, 380-430 m off and 160-250 m higher, 39-48° steep, each in clear sight of the
// viewpoint (checked against the terrain grid, js/terrain.js groundHeight)
const LAWINEN_VIEW = { x: -600, z: -1600 };
const LAWINEN_SLOPE = { x: -850, z: -1900 };
const LAWINEN_AMMO = 12;
export const LAUNCHER = { speed: 150, reloadS: 2.5 }; // m/s muzzle velocity, seconds between two shots
const lawinenZones = () => [
  { x: -753, z: -1980, r: 20 },
  { x: -818, z: -1923, r: 18 },
  { x: -909, z: -1899, r: 18 },
  { x: -922, z: -1802, r: 16 }
];

export const LAWINEN_MISSION = {
  id: 'lawinen-sprengen',
  title: 'Lawinen sprengen',
  intro: 'Nach dem Neuschnee muss der Hang unter dem Salezer Horn künstlich ausgelöst werden, bevor die Strasse unten wieder öffnet. Du stehst mit dem Lawinen-Sprengrohr auf der Schulter gegenüber: Ziehen dreht und hebt das Rohr (nach oben ziehen: steiler), der weisse Ring zeigt den berechneten Einschlag, Schuss mit Leertaste oder Klick. Zwölf Schuss für vier Zonen.',
  mode: 'person',
  season: 'winter',
  time: 'golden',
  features: ['shooter'],
  bonusMs: 2 * 60 * 1000,
  finish: 'Hang ausgelöst: Alle vier Zonen sind abgegangen, die Strasse kann öffnen.',
  ammo: LAWINEN_AMMO,
  zones: lawinenZones(),
  get start() { return { x: LAWINEN_VIEW.x, z: LAWINEN_VIEW.z, heading: headingTo(LAWINEN_VIEW, LAWINEN_SLOPE) }; },
  props: [],
  createState() { return { shots: 0, hits: 0, misses: 0, ammo: LAWINEN_AMMO, inFlight: false }; },
  update(ctx, state) { if (ctx.shooter) Object.assign(state, ctx.shooter); },
  summary(state) { return [`${state.shots} Schuss · ${state.hits} Treffer · ${state.misses} daneben`]; },
  objectives: lawinenZones().map((zone, i, all) => ({
    id: `zone${i + 1}`,
    title: `Zone ${i + 1} von ${all.length} auslösen`,
    check(ctx, state) {
      const done = state.hits > i;
      const fail = !done && state.ammo <= 0 && !state.inFlight ? 'Munition verschossen' : null;
      const d = dist2d(ctx, zone);
      return { done, progress: null, text: `${formatDistance(d)} · ${state.ammo} Schuss übrig${state.misses ? ` · ${state.misses} daneben` : ''}`, target: { ...zone, style: 'hazard' }, hint: state.inFlight ? 'Geschoss unterwegs …' : null, fail };
    }
  }))
};

// ====================================================================================================================
// Mission 4 & 5: the motorbike accident on the Flüelapassstrasse
// The bend of the Flüelapassstrasse (OSM w186141612) at 1794 m above the Tschuggen (LV95 ~2787490/1186390), 6.4 km
// up the valley from the Spital: the road runs ESE-WNW there, open meadow on its south side for the helicopter.
const TOEFF_ROAD_HEADING = -1.94; // rad, the road's direction towards Davos (dx = sin, dz = cos)
export const TOEFF_SITE = { x: 4990, z: -888, heading: TOEFF_ROAD_HEADING };
// (the landing zone: the meadow south of the road, 70 m up the pass from the bike, < 10° over its 12 m radius, no tree
// within 25 m: js/tlm-trees-data.js; the car park of the Tschuggen lift lies on the north side)
const TOEFF_LANDING = { x: 5058, z: -856, r: 12 };
// Along the road: towards Davos is `heading`, uphill the other way
const alongRoad = (d, side = 0) => ({ x: TOEFF_SITE.x + Math.sin(TOEFF_ROAD_HEADING) * d + Math.cos(TOEFF_ROAD_HEADING) * side, z: TOEFF_SITE.z + Math.cos(TOEFF_ROAD_HEADING) * d - Math.sin(TOEFF_ROAD_HEADING) * side });
const TOEFF_POLICE = { ...alongRoad(-16), heading: TOEFF_ROAD_HEADING + Math.PI / 2 }; // across the road, uphill of the bike
const TOEFF_SECURE = { ...alongRoad(38), r: 7 }; // where the patrol car blocks the road on the Davos side
const TOEFF_CONES = [{ ...alongRoad(52, 2.5), r: 3.5 }, { ...alongRoad(-50, -2.5), r: 3.5 }];
const TREAT_SECONDS = 8, LANDED_SECONDS = 2;
const toeffScene = (hidePatientAfter) => [
  { id: 'bike', type: 'motorbike', x: TOEFF_SITE.x, z: TOEFF_SITE.z, heading: TOEFF_ROAD_HEADING + 1.2 },
  { id: 'patient', type: 'patient', ...alongRoad(3.5, -2.2), heading: TOEFF_ROAD_HEADING + 0.4, hideAfter: hidePatientAfter }
];

export const TOEFF_MISSION = {
  id: 'toeff-unfall',
  title: 'Töffunfall auf der Passstrasse',
  intro: 'Alarm: Motorradunfall auf der Flüelapassstrasse oberhalb von Davos Dorf, die Kapo sperrt die Stelle ab. Flieg hin, lande auf der markierten Wiese neben der Strasse, versorge den Patienten und bring ihn ins Spital.',
  mode: 'helicopter',
  season: 'winter',
  time: 'golden',
  nightTime: 'midnight',
  bonusMs: 7 * 60 * 1000,
  finish: 'Patient im Spital: Der Töfffahrer ist versorgt.',
  pad: SPITAL_PAD,
  features: ['trafficBlock'],
  get start() { return { x: this.pad.x, z: this.pad.z, heading: 1.3, onGround: true }; },
  props: [...toeffScene('treat'), { id: 'police', type: 'policeCar', ...TOEFF_POLICE, blueLight: true, block: true }],
  createState() { return { landed: 0, treat: 0, land: 0 }; },
  update() {},
  objectives: [
    {
      id: 'approach',
      title: 'Zur Unfallstelle fliegen',
      check(ctx) {
        const d = dist2d(ctx, TOEFF_SITE);
        return { done: d < 150 && ctx.agl < 120, progress: null, text: `${formatDistance(d)} zur Flüelapassstrasse`, target: TOEFF_SITE, hint: lightHint(ctx) };
      }
    },
    {
      id: 'land',
      title: 'Neben der Strasse landen',
      check(ctx, state) {
        const d = dist2d(ctx, TOEFF_LANDING);
        const down = d < TOEFF_LANDING.r && ctx.agl < 1 && Math.abs(ctx.speed) < 0.6 && Math.abs(ctx.verticalSpeed) < 0.6;
        state.landed = down ? state.landed + ctx.dt : 0;
        const text = down ? 'Aufgesetzt …' : d < TOEFF_LANDING.r ? 'Absetzen: Tempo null, ruhig' : `${formatDistance(d)} zur Landezone (Wiese südlich der Strasse)`;
        return { done: state.landed >= LANDED_SECONDS, progress: Math.min(1, state.landed / LANDED_SECONDS), text, target: { ...TOEFF_LANDING, style: 'pad' }, hint: lightHint(ctx) };
      }
    },
    {
      id: 'treat',
      title: 'Patient wird versorgt',
      check(ctx, state) {
        const down = dist2d(ctx, TOEFF_LANDING) < TOEFF_LANDING.r + 3 && ctx.agl < 1.5 && Math.abs(ctx.speed) < 1;
        state.treat = down ? state.treat + ctx.dt : 0;
        const text = down ? `Patient wird versorgt … ${Math.ceil(TREAT_SECONDS - state.treat)} s` : 'Am Boden bleiben: die Crew ist beim Patienten';
        return { done: state.treat >= TREAT_SECONDS, progress: Math.min(1, state.treat / TREAT_SECONDS), text, target: { ...TOEFF_LANDING, style: 'pad' }, hint: null };
      }
    },
    padLanding(SPITAL_PAD)
  ]
};

const blueHint = (ctx) => (ctx.blueLight ? null : 'Blaulicht einschalten [K]');

export const TOEFF_POLIZEI_MISSION = {
  id: 'toeff-unfall-polizei',
  title: 'Kapo: Töffunfall Flüelastrasse',
  intro: 'Einsatzzentrale an Patrouille Davos: Töffunfall auf der Flüelapassstrasse oberhalb der Tschuggen, Person verletzt. Mit Blaulicht (K) hinfahren, die Stelle vor dem Unfall quer absichern, dann zu Fuss (1) die Pylonen 50 m vor und hinter der Unfallstelle setzen und die Rega einweisen.',
  mode: 'car',
  season: 'winter',
  time: 'golden',
  nightTime: 'midnight',
  features: ['policeCar', 'regaScript'],
  bonusMs: 9 * 60 * 1000,
  finish: 'Einsatz beendet: Die Rega hat den Patienten übernommen, die Strasse ist gesichert.',
  landing: TOEFF_LANDING,
  // The Polizeiposten Davos: OSM has no amenity=police in the frame, so the patrol starts on the Promenade in Davos Platz
  // (js/city-config.js TELEPORT_LOCATIONS.promenade; js/missions.js fills x, z, heading from it)
  start: { teleport: 'promenade', x: -600, z: 60, heading: 0.9 },
  props: [...toeffScene('rega'), ...TOEFF_CONES.map((c, i) => ({ id: `cone${i + 1}`, type: 'cone', x: c.x, z: c.z, heading: TOEFF_ROAD_HEADING, showAfter: `cone${i + 1}` }))],
  createState() { return { secure: 0, cones: [0, 0], conesDone: 0, rega: 'none' }; },
  update(ctx, state) { if (ctx.rega) state.rega = ctx.rega.phase; },
  objectives: [
    {
      id: 'drive',
      title: 'Zum Unfallort fahren',
      check(ctx) {
        const d = dist2d(ctx, TOEFF_SITE);
        return { done: d < 120, progress: null, text: `${formatDistance(d)} bis zur Unfallstelle · Flüelapassstrasse`, target: TOEFF_SITE, hint: blueHint(ctx) };
      }
    },
    {
      id: 'secure',
      title: 'Unfallstelle absichern',
      check(ctx, state) {
        const inside = inZone(TOEFF_SECURE, ctx.x, ctx.z) && Math.abs(ctx.speed) < 0.3 && ctx.blueLight;
        state.secure = inside ? state.secure + ctx.dt : 0;
        const text = inside ? `Fahrzeug steht … ${Math.ceil(3 - state.secure)} s` : 'Quer in die markierte Zone stellen, Blaulicht an, Tempo null';
        return { done: state.secure >= 3, progress: Math.min(1, state.secure / 3), text, target: { ...TOEFF_SECURE, style: 'hazard' }, hint: blueHint(ctx) };
      }
    },
    ...TOEFF_CONES.map((cone, i) => ({
      id: `cone${i + 1}`,
      title: i === 0 ? 'Pylone talseitig setzen (50 m vor der Stelle)' : 'Pylone bergseitig setzen (50 m hinter der Stelle)',
      allowModes: ['car', 'person'],
      check(ctx, state) {
        const onFoot = ctx.mode === 'person';
        const here = onFoot && inZone(cone, ctx.x, ctx.z) && Math.abs(ctx.speed) < 0.3;
        state.cones[i] = here ? state.cones[i] + ctx.dt : 0;
        const done = state.cones[i] >= 2;
        if (done) state.conesDone = i + 1;
        const text = !onFoot ? 'Aussteigen: Taste 1 (zu Fuss)' : here ? `Pylone wird gesetzt … ${Math.ceil(2 - state.cones[i])} s` : `${formatDistance(dist2d(ctx, cone))} zur Markierung, dort 2 s stehen bleiben`;
        return { done, progress: Math.min(1, state.cones[i] / 2), text, target: { ...cone, style: 'hazard' }, hint: onFoot ? null : 'Zu Fuss [1]' };
      }
    })),
    {
      id: 'rega',
      title: 'Rega einweisen und warten',
      allowModes: ['car', 'person'],
      check(ctx, state) {
        const phase = state.rega;
        const text = phase === 'none' || phase === 'inbound' ? 'Die Rega ist im Anflug: Landezone frei halten' : phase === 'landed' ? 'Die Rega übernimmt den Patienten …' : phase === 'departing' ? 'Die Rega hebt ab' : 'Die Rega ist weg';
        return { done: phase === 'gone', progress: null, text, target: { ...TOEFF_LANDING, style: 'pad' }, hint: null };
      }
    }
  ]
};

export const MISSIONS = [DISCHMA_MISSION, REGA_MISSION, LAWINEN_MISSION, TOEFF_MISSION, TOEFF_POLIZEI_MISSION];
export const getMission = (id) => MISSIONS.find((m) => m.id === id) || null;
