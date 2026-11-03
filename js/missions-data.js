import { DAVOS_DATA } from './davos-geodata.js';
import { SKI_PISTES } from './ski-pistes-data.js';
import { SNOW_MISSIONS } from './missions-data-snow.js'; // the slalom, the big air, the mountain bike race
import { FUN_MISSIONS } from './missions-data-fun.js'; // the BOX, La Onda, the Carjöl lift, the RhB driver
import { GOLF_MISSIONS } from './missions-data-golf.js'; // three holes at the Golf Club Davos
import { ICE_MISSIONS } from './missions-data-ice.js'; // speed skating, the penalty shoot-out, curling
import { SLEDGE_MISSIONS } from './missions-data-sledge.js'; // the horn sledge race at the Rinerhorn
import { MINE_MISSIONS } from './missions-data-mine.js'; // ore in the Silberberg mine
import { LOCAL_MISSIONS } from './missions-data-local.js'; // beer run, Gipfeli, raclette, ibex, squirrels, tennis, slide, Kirchner
import { WORK_MISSIONS } from './missions-data-work.js'; // snow shovel, snow blower, lawn mowing, refuse round, Alpenrosen, mushrooms
import { RESORT_MISSIONS } from './missions-data-resort.js'; // the Hauptertäli T-bar, waxing at Hofmänner, the Jakobshorn car park
import { GASTRO_MISSIONS } from './missions-data-gastro.js'; // Flämmli in the Rot Liechtli, Pizza Heaven
import { OUTDOOR_MISSIONS } from './missions-data-outdoor.js'; // the rope park in the Färich, hockey on the Seehofseeli
import { BARS_MISSIONS } from './missions-data-bars.js'; // Nageln in the Tijuana Bar, Barista at the Kafi Klatsch
import { SPORT_MISSIONS } from './missions-data-sport.js'; // Davos Nordic, minigolf at the Waldhuus, darts at The Green Wildman, the Schüssla
import { EXPERT_MISSIONS } from './missions-data-expert.js'; // the eye test at Meerkämper Optik, the snow profile for the SLF
import { WEF_MISSIONS } from './missions-data-wef.js'; // the WEF week: the motorcade's escort, the march
import { RURAL_MISSIONS } from './missions-data-rural.js'; // the quad from Heldstab, green waste to the biogas plant

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
//     summary(state): extra lines for the finish panel,
//     medals: { gold, silver, bronze } (ms: the slowest time for each medal; js/missions-progress.js turns the best
//       medal into points), colour / icon: the mission's pin in the world and on the map (js/missions-world.js),
//     pin: { x, z } where the pin stands when it is not the start (default: `start`) }
// (the medal limits: gold = bonusMs, the time a clean run makes; silver ~ +35-50 %, a run with a detour or a retry;
// bronze ~ double, any run that gets there. Estimated from the legs: the Rega's 2 x 2.6 km / 2 x 6.4 km at the H145's
// ~60 m/s (the scripted test flights), the patrol car's ~7 km at ~80 km/h, the 1.9 km Loipe at the snowcat's pace with
// a few turns, four shells with the launcher's reload and flight time)
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
const lightHint = (ctx) => (ctx.night && !ctx.highBeam ? 'Turn on the searchlight [L]' : null);
const headingTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);

// ====================================================================================================================
// Mission 1: the Dischma Loipe
// The "Dischmatal Warm-Up" (OSM w1034080622), 1.9 km of classic and skating track from the mouth of the Dischma valley
// up to the Dischmabach's first bend: ~5 min flat out with the tiller down, 8-10 min with a few turns
const DISCHMA_LOIPE = { ids: ['w1034080622'], namePattern: /Dischma/i, xMin: 700 };
const DISCHMA_TARGET = 0.9;
const dischmaLoipe = () => findLoipe(DISCHMA_LOIPE);
const tillerHint = (ctx) => (ctx.tillerRaised || ctx.tillerLift > 0.03 ? 'Lower the tiller [F]' : null);

export const DISCHMA_MISSION = {
  id: 'dischma-loipe',
  title: 'Groom the Dischma trail',
  intro: 'The night shift is calling: the cross-country trail in the Dischma valley needs fresh corduroy. Drive the snowcat along the track with the tiller lowered (F) until 90 % of the trail is groomed.',
  mode: 'snowcat',
  season: 'winter',
  time: 'golden',
  bonusMs: 6 * 60 * 1000,
  medals: { gold: 6 * 60000, silver: 9 * 60000, bronze: 12 * 60000 },
  colour: '#ff8a3d',
  icon: 'snowcat',
  finish: 'Trail groomed: the corduroy is down, the cross-country skiers can come.',
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
      title: 'Lower the tiller and get on the trail',
      check(ctx, state) {
        const first = state.samples[0] || null;
        return { done: doneFraction(state.samples) > 0, progress: null, text: 'The tiller has to be down for the track to count.', target: first ? { x: first.x, z: first.z } : null, hint: tillerHint(ctx) };
      }
    },
    {
      id: 'groom',
      title: `Groom ${Math.round(DISCHMA_TARGET * 100)} % of the trail`,
      check(ctx, state) {
        const frac = doneFraction(state.samples);
        const next = nearestUndone(state.samples, ctx.x, ctx.z);
        const text = `Trail ${Math.round(frac * 100)} % groomed · ${formatDistance(frac * state.length)} of ${formatDistance(state.length)}`;
        return { done: frac >= DISCHMA_TARGET, progress: Math.min(1, frac / DISCHMA_TARGET), text, target: next ? { x: next.x, z: next.z } : null, hint: tillerHint(ctx) };
      }
    }
  ]
};

// ====================================================================================================================
// Mission 2: the Rega rescue on the Jakobshorn
// The Rega pad on the roof of the Spital Davos (js/helipad.js HELIPAD; js/missions.js takes the built pad's position)
export const SPITAL_PAD = { x: -1139, z: 924.5, r: 7 };
// The Rega missions' pins: on the Spital's drive off the Promenade, below the pad (14.5 m up on the roof), one each
const REGA_PIN = { x: -1140, z: 890 };
const TOEFF_PIN = { x: -1122, z: 886 };
// The injured skier: on the Jakobshorn Standard (OSM w29262638, run 8) above the Ischalp middle station
const PATIENT_RUN = { id: 'w29262638', t: 0.26 };
const PATIENT_FALLBACK = { x: 786, z: 2490 };
const HOVER_SECONDS = 5, LAND_SECONDS = 3;
const patientPosition = () => { const p = pointOnRun(PATIENT_RUN.id, PATIENT_RUN.t); return p ? { x: p.x, z: p.z } : { ...PATIENT_FALLBACK }; };

/** The last leg every Rega mission shares: back to the Spital and down on the pad */
const padLanding = (pad, idle = LAND_SECONDS) => ({
  id: 'return',
  title: 'Return to the Spital and land',
  check(ctx, state) {
    const d = dist2d(ctx, pad);
    const down = d < pad.r && ctx.agl < 1 && Math.abs(ctx.speed) < 0.6 && Math.abs(ctx.verticalSpeed) < 0.6;
    state.land = down ? (state.land || 0) + ctx.dt : 0;
    const text = down ? `Landed … ${Math.ceil(idle - state.land)} s` : d < 40 ? 'Set down on the pad (H), hold steady' : `${formatDistance(d)} to the Spital Rega pad`;
    return { done: state.land >= idle, progress: Math.min(1, state.land / idle), text, target: { ...pad, style: 'pad' }, hint: lightHint(ctx) };
  }
});

export const REGA_MISSION = {
  id: 'rega-rettung',
  title: 'Fly the casualty to the Spital',
  intro: 'A skier lies injured on the Jakobshorn Standard run above the Ischalp. Fly the Rega out there, hover low over the casualty or land beside them until they are on board, then bring them back to the helipad of the Spital.',
  mode: 'helicopter',
  season: 'winter',
  time: 'golden',
  nightTime: 'midnight',
  bonusMs: 3 * 60 * 1000,
  medals: { gold: 3 * 60000, silver: 4 * 60000, bronze: 6 * 60000 },
  colour: '#ff3b3b',
  icon: 'rega',
  pin: REGA_PIN,
  finish: 'Patient handed over: the Spital team takes it from here.',
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
      title: 'Fly to the casualty',
      check(ctx, state) {
        const d = dist2d(ctx, state.patient);
        return { done: d < 60 && ctx.agl < 60, progress: null, text: `${formatDistance(d)} to the accident site`, target: state.patient, hint: lightHint(ctx) };
      }
    },
    {
      id: 'pickup',
      title: 'Pick up the patient',
      check(ctx, state) {
        const d = dist2d(ctx, state.patient);
        const close = d < 8 && ctx.agl < 3 && Math.abs(ctx.speed) < 2.5 && Math.abs(ctx.verticalSpeed) < 1.5 && !lightHint(ctx);
        state.hover = close ? state.hover + ctx.dt : 0;
        const text = close ? `Rescue under way … ${Math.ceil(HOVER_SECONDS - state.hover)} s` : d < 8 ? 'Lower: under 3 m above the snow, hold steady' : `${formatDistance(d)} · hover low over the casualty (< 3 m) or land`;
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
  title: 'Avalanche blasting',
  intro: 'After the fresh snow, the slope below the Salezer Horn has to be triggered before the road below can reopen. You stand on the shoulder opposite with the avalanche launcher: drag to turn and raise the tube (drag up: steeper), the white ring shows the predicted impact, fire with Space or a click. Twelve rounds for four zones.',
  mode: 'person',
  season: 'winter',
  time: 'golden',
  features: ['shooter'],
  bonusMs: 2 * 60 * 1000,
  medals: { gold: 2 * 60000, silver: 3 * 60000, bronze: 4.5 * 60000 },
  colour: '#ffc21a',
  icon: 'blast',
  finish: 'Slope released: all four zones have slid, the road can reopen.',
  ammo: LAWINEN_AMMO,
  zones: lawinenZones(),
  get start() { return { x: LAWINEN_VIEW.x, z: LAWINEN_VIEW.z, heading: headingTo(LAWINEN_VIEW, LAWINEN_SLOPE) }; },
  props: [],
  createState() { return { shots: 0, hits: 0, misses: 0, ammo: LAWINEN_AMMO, inFlight: false }; },
  update(ctx, state) { if (ctx.shooter) Object.assign(state, ctx.shooter); },
  summary(state) { return [`${state.shots} ${state.shots === 1 ? 'shot' : 'shots'} · ${state.hits} ${state.hits === 1 ? 'hit' : 'hits'} · ${state.misses} missed`]; },
  objectives: lawinenZones().map((zone, i, all) => ({
    id: `zone${i + 1}`,
    title: `Trigger zone ${i + 1} of ${all.length}`,
    check(ctx, state) {
      const done = state.hits > i;
      const fail = !done && state.ammo <= 0 && !state.inFlight ? 'Out of ammo' : null;
      const d = dist2d(ctx, zone);
      return { done, progress: null, text: `${formatDistance(d)} · ${state.ammo} ${state.ammo === 1 ? 'round' : 'rounds'} left${state.misses ? ` · ${state.misses} missed` : ''}`, target: { ...zone, style: 'hazard' }, hint: state.inFlight ? 'Shell in flight …' : null, fail };
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
  title: 'Motorbike crash on the pass road',
  intro: 'Alert: motorbike crash on the Flüelapassstrasse above Davos Dorf, the cantonal police are closing off the site. Fly out, land on the marked meadow beside the road, treat the patient and bring them to the Spital.',
  mode: 'helicopter',
  season: 'summer', // (a motorbike crash on the pass: a summer mission)
  time: 'golden',
  nightTime: 'midnight',
  bonusMs: 7 * 60 * 1000,
  medals: { gold: 7 * 60000, silver: 9.5 * 60000, bronze: 13 * 60000 },
  colour: '#ff4f8b',
  icon: 'rega',
  pin: TOEFF_PIN,
  finish: 'Patient at the Spital: the rider is in good hands.',
  pad: SPITAL_PAD,
  features: ['trafficBlock'],
  get start() { return { x: this.pad.x, z: this.pad.z, heading: 1.3, onGround: true }; },
  props: [...toeffScene('treat'), { id: 'police', type: 'policeCar', ...TOEFF_POLICE, blueLight: true, block: true }],
  createState() { return { landed: 0, treat: 0, land: 0 }; },
  update() {},
  objectives: [
    {
      id: 'approach',
      title: 'Fly to the accident site',
      check(ctx) {
        const d = dist2d(ctx, TOEFF_SITE);
        return { done: d < 150 && ctx.agl < 120, progress: null, text: `${formatDistance(d)} to the Flüelapassstrasse`, target: TOEFF_SITE, hint: lightHint(ctx) };
      }
    },
    {
      id: 'land',
      title: 'Land beside the road',
      check(ctx, state) {
        const d = dist2d(ctx, TOEFF_LANDING);
        const down = d < TOEFF_LANDING.r && ctx.agl < 1 && Math.abs(ctx.speed) < 0.6 && Math.abs(ctx.verticalSpeed) < 0.6;
        state.landed = down ? state.landed + ctx.dt : 0;
        const text = down ? 'Touched down …' : d < TOEFF_LANDING.r ? 'Set down: zero speed, steady' : `${formatDistance(d)} to the landing zone (meadow south of the road)`;
        return { done: state.landed >= LANDED_SECONDS, progress: Math.min(1, state.landed / LANDED_SECONDS), text, target: { ...TOEFF_LANDING, style: 'pad' }, hint: lightHint(ctx) };
      }
    },
    {
      id: 'treat',
      title: 'Treat the patient',
      check(ctx, state) {
        const down = dist2d(ctx, TOEFF_LANDING) < TOEFF_LANDING.r + 3 && ctx.agl < 1.5 && Math.abs(ctx.speed) < 1;
        state.treat = down ? state.treat + ctx.dt : 0;
        const text = down ? `Treating the patient … ${Math.ceil(TREAT_SECONDS - state.treat)} s` : 'Stay on the ground: the crew is with the patient';
        return { done: state.treat >= TREAT_SECONDS, progress: Math.min(1, state.treat / TREAT_SECONDS), text, target: { ...TOEFF_LANDING, style: 'pad' }, hint: null };
      }
    },
    padLanding(SPITAL_PAD)
  ]
};

const blueHint = (ctx) => (ctx.blueLight ? null : 'Turn on the blue lights [K]');

export const TOEFF_POLIZEI_MISSION = {
  id: 'toeff-unfall-polizei',
  title: 'Police: motorbike crash on the Flüela road',
  intro: 'Dispatch to patrol Davos: motorbike crash on the Flüelapassstrasse above the Tschuggen, one person injured. Drive there with blue lights (K), park across the road before the crash site, then on foot (1) set cones 50 m before and after the site and guide the Rega in.',
  mode: 'car',
  season: 'summer', // (a motorbike crash on the pass: a summer mission)
  time: 'golden',
  nightTime: 'midnight',
  features: ['policeCar', 'regaScript'],
  bonusMs: 9 * 60 * 1000,
  medals: { gold: 9 * 60000, silver: 12 * 60000, bronze: 16 * 60000 },
  colour: '#3f8bff',
  icon: 'police',
  finish: 'Call complete: the Rega has taken over the patient, the road is secured.',
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
      title: 'Drive to the accident site',
      check(ctx) {
        const d = dist2d(ctx, TOEFF_SITE);
        return { done: d < 120, progress: null, text: `${formatDistance(d)} to the accident site · Flüelapassstrasse`, target: TOEFF_SITE, hint: blueHint(ctx) };
      }
    },
    {
      id: 'secure',
      title: 'Secure the accident site',
      check(ctx, state) {
        const inside = inZone(TOEFF_SECURE, ctx.x, ctx.z) && Math.abs(ctx.speed) < 0.3 && ctx.blueLight;
        state.secure = inside ? state.secure + ctx.dt : 0;
        const text = inside ? `Vehicle in position … ${Math.ceil(3 - state.secure)} s` : 'Park across the marked zone, blue lights on, zero speed';
        return { done: state.secure >= 3, progress: Math.min(1, state.secure / 3), text, target: { ...TOEFF_SECURE, style: 'hazard' }, hint: blueHint(ctx) };
      }
    },
    ...TOEFF_CONES.map((cone, i) => ({
      id: `cone${i + 1}`,
      title: i === 0 ? 'Place a cone downhill (50 m before the site)' : 'Place a cone uphill (50 m past the site)',
      allowModes: ['car', 'person'],
      check(ctx, state) {
        const onFoot = ctx.mode === 'person';
        const here = onFoot && inZone(cone, ctx.x, ctx.z) && Math.abs(ctx.speed) < 0.3;
        state.cones[i] = here ? state.cones[i] + ctx.dt : 0;
        const done = state.cones[i] >= 2;
        if (done) state.conesDone = i + 1;
        const text = !onFoot ? 'Get out: key 1 (on foot)' : here ? `Placing the cone … ${Math.ceil(2 - state.cones[i])} s` : `${formatDistance(dist2d(ctx, cone))} to the marker, stand there for 2 s`;
        return { done, progress: Math.min(1, state.cones[i] / 2), text, target: { ...cone, style: 'hazard' }, hint: onFoot ? null : 'On foot [1]' };
      }
    })),
    {
      id: 'rega',
      title: 'Guide the Rega in and wait',
      allowModes: ['car', 'person'],
      check(ctx, state) {
        const phase = state.rega;
        const text = phase === 'none' || phase === 'inbound' ? 'The Rega is inbound: keep the landing zone clear' : phase === 'landed' ? 'The Rega is taking over the patient …' : phase === 'departing' ? 'The Rega is lifting off' : 'The Rega has left';
        return { done: phase === 'gone', progress: null, text, target: { ...TOEFF_LANDING, style: 'pad' }, hint: null };
      }
    }
  ]
};

export const MISSIONS = [DISCHMA_MISSION, REGA_MISSION, LAWINEN_MISSION, TOEFF_MISSION, TOEFF_POLIZEI_MISSION, ...FUN_MISSIONS, ...SNOW_MISSIONS, ...ICE_MISSIONS, ...SLEDGE_MISSIONS, ...GOLF_MISSIONS, ...LOCAL_MISSIONS, ...MINE_MISSIONS, ...WORK_MISSIONS, ...SPORT_MISSIONS, ...RESORT_MISSIONS, ...GASTRO_MISSIONS, ...OUTDOOR_MISSIONS, ...BARS_MISSIONS, ...EXPERT_MISSIONS, ...WEF_MISSIONS, ...RURAL_MISSIONS];
export const getMission = (id) => MISSIONS.find((m) => m.id === id) || null;
