// js/missions-data-heliblast.js
// Avalanche control from the helicopter (js/missions-data.js spreads HELIBLAST_MISSIONS into MISSIONS; js/missions-heliblast.js
// has its runtime: the charge in flight with its burning fuse, the aim ring, the blasts and the avalanches, the key).
// No three.js and no DOM in here (tests/missions-heliblast.test.mjs drops the charges and flies a bot over the real terrain).
//
// The story: a morning in January after 60 cm of fresh snow. Before the lifts open, the avalanche services of the Davos
// Klosters Mountains release the slopes above the pistes on purpose, as they do every winter: where a launcher cannot
// reach, from a helicopter, the blaster at the open door throwing hand charges (a few kilos of explosive with a fuse)
// onto the release zones, the pistes below still closed. The player flies: from the Spital's pad up to the Jakobshorn,
// then across the valley to the Parsenn below the Weissfluhjoch. Over each zone the helicopter hovers 15-45 m over the
// snow, G throws the charge (it falls with the helicopter's own speed, so a moving drop lands off), the fuse burns for
// six seconds — time to pull away — and in the zone the slab breaks and runs. A charge outside the zone is a miss
// (+10 s); a blast within 22 m of the helicopter ends the flight; caught low in the path of a running slab, the powder
// cloud costs 20 s. Eight charges for four zones.
//
// The zones (js/davos-frame.js: x = E − 2782500, z = 1185500 − N, y = height − 1558): open slopes above the tree line,
// 35-41° on average over their 24 m radius (js/terrain.js, the 8 m grid), each above a run that stays closed until it has
// gone: the Jakobshorn's north flank above the Jakobshorn Nord run (OSM piste w-ids in js/ski-pistes-data.js), its east
// flank above the Teufi, the Dorftälli below the Weissfluhjoch above the Parsenn's Standard run, and the Weissfluh's
// east flank below the summit. The Jakobshornbahn's top station (js/bergbahnen-data.js) lies 120 m from the first, the
// Parsennbahn's on the Weissfluhjoch 800 m from the third.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
export const HELIBLAST_ID = 'lawinen-heli';

export const HB = {
  charges: 8,
  fuse: 6, // s from the throw to the detonation
  aglMin: 15, aglMax: 45, // m over the snow: the blaster throws only in this window
  dangerR: 22, // m: a detonation this close to the helicopter ends the flight
  missPenaltyMs: 10000,
  cloudPenaltyMs: 20000,
  releaseS: 6, // s the slab runs: low in its path the powder cloud catches the helicopter
  cloudAgl: 50, // m over the snow: higher than this the cloud passes under
  settleS: 4, // s after the release before the next zone is called
  pathLength: 360, pathStep: 10, // m: the avalanche's path down the fall line, measured in steps
  pathMargin: 14, // m either side of the zone's width
  near: 300, // m: from here on the zone's instructions are the drop's
  door: { side: 1.3, up: 0.9, toss: 2.5 }, // m right of the cabin's axis and over the skids; m/s the throw out of the door
  g: 9.81,
  drag: 0.05 // 1/s: the charge is heavy, the air hardly slows it
};

/** The release zones, in their order */
export const ZONES = [
  { id: 'jakobshorn-nord', name: 'Jakobshorn, north flank', area: 'Jakobshorn', x: 1600, z: 2430, r: 24 },
  { id: 'jakobshorn-teufi', name: 'Jakobshorn, east flank above the Teufi', area: 'Jakobshorn', x: 1780, z: 2470, r: 24 },
  { id: 'dorftaelli', name: 'Dorftälli below the Weissfluhjoch', area: 'Parsenn', x: -1790, z: -3310, r: 24 },
  { id: 'weissfluh-ost', name: 'Weissfluh, east flank', area: 'Parsenn', x: -2450, z: -4040, r: 24 }
];
/** The Rega pad on the Spital's roof (js/helipad.js HELIPAD) and the pin on the drive below it, east of the Rega's two
 *  (and 30 m and more from the plaster room's, js/missions-data-care.js) */
export const START = { x: -1139, z: 924.5, heading: 1.07 };
export const PIN = { x: -1104, z: 880 };

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** The compass direction of a vector in the world frame (north is −z) */
export const compass = (dx, dz) => COMPASS[(Math.round((Math.atan2(dx, -dz) / (2 * Math.PI)) * 8) + 8) % 8];

/** The charge leaving the right-hand door: the cabin's velocity (forward speed along the heading, the climb) and the
 *  blaster's toss sideways. `heli`: { x, y, z, heading, speed, verticalSpeed } (y at the skids) */
export function throwCharge(heli) {
  const sx = Math.sin(heli.heading), cz = Math.cos(heli.heading), rx = -cz, rz = sx; // (forward, and to its right)
  const v = heli.speed || 0;
  return {
    x: heli.x + rx * HB.door.side, y: heli.y + HB.door.up, z: heli.z + rz * HB.door.side,
    vx: sx * v + rx * HB.door.toss, vy: heli.verticalSpeed || 0, vz: cz * v + rz * HB.door.toss,
    fuse: HB.fuse, landed: false, t: 0
  };
}

/** One step of a charge: it falls under gravity, comes to rest in the snow, the fuse burns; true once it goes off */
export function stepCharge(c, dt, groundAt) {
  c.t += dt;
  c.fuse -= dt;
  if (!c.landed) {
    c.vy -= HB.g * dt;
    const f = Math.max(0, 1 - HB.drag * dt);
    c.vx *= f; c.vz *= f;
    const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt, nz = c.z + c.vz * dt;
    const g = groundAt(nx, nz);
    if (ny <= g) { c.x = nx; c.z = nz; c.y = g; c.landed = true; c.vx = c.vy = c.vz = 0; } else { c.x = nx; c.y = ny; c.z = nz; }
  }
  return c.fuse <= 0;
}

/** Where a charge thrown now comes down: { x, y, z, t }, or null (not within `maxT` s) */
export function predictLanding(heli, groundAt, { dt = 0.05, maxT = 12 } = {}) {
  const c = throwCharge(heli);
  c.fuse = Infinity;
  while (c.t < maxT) { stepCharge(c, dt, groundAt); if (c.landed) return { x: c.x, y: c.y, z: c.z, t: c.t }; }
  return null;
}

/** The avalanche's path from the zone down the fall line: a flat polyline [x0, z0, x1, z1, ...], ending in the run-out */
export function fallLine(zone, groundAt, { length = HB.pathLength, step = HB.pathStep } = {}) {
  const pts = [zone.x, zone.z], d = 4;
  let x = zone.x, z = zone.z, L = 0;
  while (L < length) {
    const gx = (groundAt(x + d, z) - groundAt(x - d, z)) / (2 * d), gz = (groundAt(x, z + d) - groundAt(x, z - d)) / (2 * d);
    const h = Math.hypot(gx, gz);
    if (h < 1e-6 || (h < 0.08 && L > 60)) break; // (flatter than ~5°: the run-out)
    x -= (gx / h) * step; z -= (gz / h) * step; L += step;
    pts.push(x, z);
  }
  return pts;
}

/** Whether (x, z) lies in the path: within the zone's radius and the margin of the fall line */
export function inPath(path, zone, x, z) {
  const w = zone.r + HB.pathMargin, w2 = w * w;
  for (let i = 2; i < path.length; i += 2) {
    const ax = path[i - 2], az = path[i - 1], dx = path[i] - ax, dz = path[i + 1] - az, L2 = dx * dx + dz * dz;
    const t = L2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1) : 0;
    const qx = ax + dx * t - x, qz = az + dz * t - z;
    if (qx * qx + qz * qz <= w2) return true;
  }
  return path.length === 2 && Math.hypot(x - path[0], z - path[1]) <= w;
}

export function createBlastState(zones = ZONES) {
  return {
    charges: HB.charges, thrown: 0, hits: 0, misses: 0, cloudHits: 0, penaltyMs: 0,
    charge: null, aim: null, released: zones.map(() => null), paths: zones.map(() => null), clouded: zones.map(() => false),
    note: null, noteT: 0, failed: null, events: []
  };
}

/** Why the blaster will not throw now, or null: 'live' (a charge is burning), 'empty', 'low', 'high', 'done' */
export function dropRefusal(state, heli, zones = ZONES) {
  if (state.failed || state.hits >= zones.length) return 'done';
  if (state.charge) return 'live';
  if (state.charges <= 0) return 'empty';
  if (heli.agl < HB.aglMin) return 'low';
  if (heli.agl > HB.aglMax) return 'high';
  return null;
}
const REFUSAL = {
  live: 'One at a time: the charge is still burning',
  empty: 'No charges left',
  low: `Too low to throw: climb above ${HB.aglMin} m`,
  high: `Too high to aim: sink below ${HB.aglMax} m`
};

/** G: the blaster throws a charge (true), or says why not (state.note) */
export function requestDrop(state, heli, zones = ZONES) {
  const why = dropRefusal(state, heli, zones);
  if (why) { if (REFUSAL[why]) { state.note = REFUSAL[why]; state.noteT = 2.5; } state.events.push({ kind: 'refused', why }); return false; }
  state.charge = throwCharge(heli);
  state.charges--; state.thrown++;
  state.note = null;
  state.events.push({ kind: 'throw', x: state.charge.x, y: state.charge.y, z: state.charge.z });
  return true;
}

/** One frame: the charge falls and burns, goes off (a hit releases the zone, its path laid down the fall line), the
 *  running slabs' powder clouds, the aim ring's point, the failure. `heli`: { x, y, z, heading, speed, verticalSpeed,
 *  agl }; the events for the runtime pile up in state.events */
export function stepBlast(state, heli, dt, groundAt, zones = ZONES) {
  if (state.noteT > 0 && (state.noteT -= dt) <= 0) state.note = null;
  const c = state.charge;
  if (c && stepCharge(c, dt, groundAt)) {
    state.charge = null;
    const d = Math.hypot(c.x - heli.x, c.y - heli.y, c.z - heli.z);
    const i = state.hits, zone = zones[i];
    const off = zone ? Math.hypot(c.x - zone.x, c.z - zone.z) : Infinity;
    const hit = off <= (zone?.r ?? 0);
    state.events.push({ kind: 'blast', x: c.x, y: c.y, z: c.z, d, hit, zone: hit ? i : -1, off });
    if (d < HB.dangerR) state.failed = 'The charge went off right under the helicopter. The crew is shaken, the flight is over.';
    if (hit) {
      state.hits++;
      state.released[i] = 0;
      state.paths[i] = fallLine(zone, groundAt);
      state.note = null;
    } else {
      state.misses++;
      state.penaltyMs += HB.missPenaltyMs;
      state.note = `Missed by ${Math.round(off - (zone?.r ?? 0))} m: +10 s`;
      state.noteT = 4;
    }
  }
  for (let i = 0; i < zones.length; i++) {
    if (state.released[i] == null) continue;
    state.released[i] += dt;
    if (state.released[i] < HB.releaseS && !state.clouded[i] && heli.agl < HB.cloudAgl && inPath(state.paths[i], zones[i], heli.x, heli.z)) {
      state.clouded[i] = true;
      state.cloudHits++;
      state.penaltyMs += HB.cloudPenaltyMs;
      state.note = 'Caught in the powder cloud: +20 s';
      state.noteT = 4;
      state.events.push({ kind: 'cloud', zone: i });
    }
  }
  state.aim = state.charge || state.hits >= zones.length ? null : predictLanding(heli, groundAt);
  if (state.aim) { const z = zones[state.hits]; state.aim.inZone = Math.hypot(state.aim.x - z.x, state.aim.z - z.z) <= z.r; }
  if (!state.failed && state.charges <= 0 && !state.charge && state.hits < zones.length) state.failed = 'Out of charges: the slopes stay closed today.';
}

/** The helicopter of the frame, as stepBlast wants it */
export const heliOf = (ctx) => ({ x: ctx.x, y: ctx.y, z: ctx.z, heading: ctx.heading, speed: ctx.speed, verticalSpeed: ctx.verticalSpeed, agl: ctx.agl });

const chargesText = (n) => `${n} ${n === 1 ? 'charge' : 'charges'} left`;

/** The step of zone i: there, hover in the window, throw, away from the path; done a few seconds after the release */
function zoneObjective(zone, i) {
  return {
    id: zone.id,
    title: `Zone ${i + 1}: ${zone.name}`,
    check(ctx, state) {
      const age = state.released[i];
      const target = { x: zone.x, z: zone.z, r: zone.r, style: 'hazard' };
      const fail = state.failed;
      if (age != null) {
        const inside = state.paths[i] && inPath(state.paths[i], zone, ctx.x, ctx.z) && ctx.agl < HB.cloudAgl;
        return { done: age >= HB.settleS, fail, progress: Math.min(1, age / HB.settleS), text: `The slope is going · ${chargesText(state.charges)}`, target: null, hint: state.note || (inside ? 'Away from the avalanche path!' : 'Watch it run') };
      }
      const c = state.charge;
      if (c) {
        const close = Math.hypot(c.x - ctx.x, c.y - ctx.y, c.z - ctx.z) < HB.dangerR + 15;
        return { done: false, fail, progress: Math.max(0, c.fuse) / HB.fuse, text: `Charge away · fuse ${Math.max(0, Math.ceil(c.fuse))} s · ${chargesText(state.charges)}`, target, hint: close ? 'Pull up and away from the charge!' : 'Hold off: it goes any second' };
      }
      const dx = zone.x - ctx.x, dz = zone.z - ctx.z, d = Math.hypot(dx, dz);
      if (d > HB.near) {
        return { done: false, fail, progress: null, text: `${fmtDist(d)} ${compass(dx, dz)} · ${zone.name}`, target, hint: state.note || (i === 0 && d > 1500 ? 'Fly to the yellow ring on the Jakobshorn' : i === 2 && d > 1500 ? 'Across the valley to the Parsenn, below the Weissfluhjoch' : null) };
      }
      const agl = Math.round(ctx.agl);
      const hint = state.note
        || (ctx.agl < HB.aglMin ? `Too low: climb above ${HB.aglMin} m` : ctx.agl > HB.aglMax ? `Sink to ${HB.aglMax} m over the snow` : state.aim?.inZone ? 'Drop the charge now' : 'Over the ring: the white mark shows where it lands');
      return { done: false, fail, progress: null, text: `Hover ${HB.aglMin}–${HB.aglMax} m over the slope · now ${agl} m · ${chargesText(state.charges)}`, target, hint };
    }
  };
}

export const HELIBLAST_MISSION = {
  id: HELIBLAST_ID,
  title: 'Avalanche blasting from the helicopter',
  intro: 'January, seven in the morning, 60 cm of fresh snow overnight. The pistes stay closed until the slopes above them have been released. The blaster of the avalanche service sits at the open door, the charges in a box at his feet. Fly him to the four zones: two on the Jakobshorn, two on the Parsenn below the Weissfluhjoch. Over each yellow ring hover 15 to 45 m above the snow, as still as you can: a charge falls with the helicopter\'s speed, the white mark shows where it will land. G (or the button) throws it, then pull away: the fuse burns for six seconds. Do not hang low in the path when the slab goes. Eight charges for four zones; a miss costs 10 s.',
  mode: 'helicopter',
  season: 'winter',
  time: 'golden', // (the low sun of the early morning, when the services blast: js/mission-windows.js opens it at either golden hour)
  features: ['heliBlast'],
  props: [],
  colour: '#ff9f1a',
  icon: 'dynamite',
  pin: PIN,
  // (a clean flight: 3.1 km up to the Jakobshorn, 0.2 km to the Teufi, 6.8 km across to the Dorftälli, 1 km to the
  // Weissfluh, at the H145's ~60 m/s with the climb, and ~25 s at each zone for the hover, the fuse and the release:
  // 3:40 for the bot of tests/missions-heliblast.test.mjs, which hovers dead still at once; gold leaves a player's hover
  // its 50 s. Silver for a miss or two and a detour, bronze for any flight that gets there)
  bonusMs: 270000,
  medals: { gold: 270000, silver: 360000, bronze: 510000 },
  finish: 'All four zones have run. The patrol skis the debris, the ropes come down, and at half past eight the first gondola of the day leaves for the Jakobshorn.',
  start: { x: START.x, z: START.z, heading: START.heading, onGround: true },
  createState() { return createBlastState(); },
  update() {},
  summary(state) {
    const pen = state.penaltyMs ? `+${Math.round(state.penaltyMs / 1000)} s` : 'no penalties';
    return [`${state.thrown} ${state.thrown === 1 ? 'charge' : 'charges'} thrown · ${state.hits} ${state.hits === 1 ? 'zone' : 'zones'} released · ${state.misses} missed · ${state.cloudHits} in the powder cloud (${pen})`];
  },
  objectives: ZONES.map(zoneObjective)
};

export const HELIBLAST_MISSIONS = [HELIBLAST_MISSION];
