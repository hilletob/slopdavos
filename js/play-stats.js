// js/play-stats.js
// How long the player plays and how they get about: the time and the distance of every way of travel (on foot, by car,
// bus, train, on skis, under a paraglider …). Counted on every device, for a guest too; a signed-in player's counts go
// with the cloud save (js/account-sync.js, supabase/migrations/*_play_stats.sql) and are shown in the account menu
// (js/play-stats-ui.js).
// The counts are kept per device: a device only ever adds to its own line, so two devices merge without counting twice
// (each line: the one with more play time wins). Time counts only while the player is there: an input in the last
// IDLE_MS, or the player moving (a ride on the train counts).

export const STATS_KEY = 'slopdavos-stats';
const VERSION = 1;
const IDLE_MS = 120000;
const SAVE_EVERY = 15000; // ms
const MOVING = 0.3; // m/s: slower is standing still
const JUMP = 150; // m in one frame: a teleport or a change of player, not travel
export const MAX_DEVICES = 16;

/** The ways of travel, in the order they are listed; the labels are the English source of js/i18n.js */
export const TRAVEL_KINDS = {
  walk: 'On foot', car: 'Car', bus: 'Bus', bike: 'Bike', cargobike: 'Cargo bike', helicopter: 'Helicopter',
  snowcat: 'Snowcat', 'train-driver': 'Train, driving', 'train-passenger': 'Train, riding along',
  ski: 'Skis', snowboard: 'Snowboard', 'xc-ski': 'Cross-country skis', sledge: 'Sledge', toboggan: 'Summer toboggan',
  skates: 'Skates', skateboard: 'Skateboard', snowshoe: 'Snowshoes', paraglider: 'Paraglider', waterslide: 'Water slide',
  climbing: 'Rope park', crane: 'Crane', quad: 'Quad', 'snow-blower': 'Snow blower', mower: 'Ride-on mower',
  'garbage-truck': 'Garbage truck', truck: 'Truck'
};

// (a mission's vehicle, missions-data*.js `vehicle`, and the missions on foot that move the player some other way)
const MISSION_VEHICLES = { blower: 'snow-blower', mower: 'mower', garbage: 'garbage-truck', quad: 'quad', bioTruck: 'truck' };
const MISSION_TRAVEL = {
  'ski-slalom': 'ski', 'big-air': 'ski', 'davos-nordic': 'xc-ski', 'horn-sledge-rinerhorn': 'sledge',
  'sommerrodelbahn-schatzalp': 'toboggan', 'speed-skating': 'skates', 'hockey-penalty': 'skates', 'seehofseeli-hockey': 'skates',
  'skate-bowl': 'skateboard', 'snowshoe-junkerboden': 'snowshoe', 'paraglider-rinerhorn': 'paraglider',
  'waterslide-race': 'waterslide', 'seilpark-faerich': 'climbing', 'derby-crane': 'crane'
};
const MODES = { person: 'walk', car: 'car', cyclist: 'bike', cargobike: 'cargobike', helicopter: 'helicopter', snowcat: 'snowcat' };

/** The way of travel now. `mode`: the controllers' active mode, `passenger`: riding along on a train, `body`: what the
 *  player's car wears (js/gta-takeover.js), `mission`: the running mission's definition, `rider`: its snow rider's kind */
export function travelKind({ mode, passenger = false, body = null, mission = null, rider = null }) {
  if (mode === 'rhb') return passenger ? 'train-passenger' : 'train-driver';
  if (mission?.vehicle && mode === 'car') return MISSION_VEHICLES[mission.vehicle] || 'car';
  if (mode === 'person' && mission) {
    if (rider === 'board') return 'snowboard';
    if (rider === 'sledge') return 'sledge';
    return MISSION_TRAVEL[mission.id] || 'walk';
  }
  if (mode === 'car' && body?.kind === 'bus') return 'bus';
  return MODES[mode] || 'walk';
}

const count = (v) => (Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), 1e15) : 0);
const newDevice = () => {
  const bytes = new Uint8Array(8);
  globalThis.crypto?.getRandomValues?.(bytes);
  return [...bytes].map((b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4);
};

/** One device's line, tidied (anything odd counts as nothing) */
export function cleanLine(line) {
  const modes = {};
  for (const [kind, m] of Object.entries(line?.modes && typeof line.modes === 'object' ? line.modes : {})) {
    if (!/^[a-z-]{1,24}$/.test(kind) || !m || typeof m !== 'object') continue;
    const ms = count(m.ms), metres = count(m.m);
    if (ms || metres) modes[kind] = { ms, m: metres };
  }
  return { at: count(line?.at), playMs: count(line?.playMs), sessions: count(line?.sessions), modes };
}

/** The lines of two saves together: per device the one with more play time (the newer one) */
export function mergeDevices(a, b) {
  const out = {};
  for (const source of [a, b]) {
    for (const [id, line] of Object.entries(source && typeof source === 'object' ? source : {})) {
      if (!/^[a-z0-9]{8,32}$/.test(id)) continue;
      const clean = cleanLine(line);
      if (!out[id] || clean.playMs > out[id].playMs || (clean.playMs === out[id].playMs && clean.at > out[id].at)) out[id] = clean;
    }
  }
  // (the devices played on last, at most MAX_DEVICES)
  return Object.fromEntries(Object.entries(out).sort(([, x], [, y]) => y.at - x.at).slice(0, MAX_DEVICES));
}

export function readStats(storage = localStorage) {
  try {
    const s = JSON.parse(storage.getItem(STATS_KEY));
    if (s?.v === VERSION && typeof s.device === 'string' && /^[a-z0-9]{8,32}$/.test(s.device)) return { v: VERSION, device: s.device, devices: mergeDevices(s.devices, null) };
  } catch { /* */ }
  return null;
}

export function writeStats(stats, storage = localStorage) {
  try { storage.setItem(STATS_KEY, JSON.stringify(stats)); } catch { /* (storage full or off: counted again next time) */ }
}

/** All devices together: play time, sessions, and the ways of travel by time (most first) */
export function totals(stats) {
  const sum = { playMs: 0, sessions: 0, devices: 0, modes: {} };
  for (const line of Object.values(stats?.devices || {})) {
    sum.playMs += line.playMs;
    sum.sessions += line.sessions;
    sum.devices += 1;
    for (const [kind, m] of Object.entries(line.modes)) {
      const t = (sum.modes[kind] ??= { kind, ms: 0, m: 0 });
      t.ms += m.ms;
      t.m += m.m;
    }
  }
  return { ...sum, modes: Object.values(sum.modes).sort((x, y) => y.ms - x.ms) };
}

/**
 * The counting while the game runs (js/main.js: `tick` every frame).
 * @param {object} [o]
 * @param {Storage} [o.storage]
 * @param {() => number} [o.now]
 */
let running = null; // (the counting of this page, for currentStats)

/** The counts now, all devices: fresh from the running game, else from storage */
export const currentStats = (storage = localStorage) => running?.current() ?? readStats(storage);

export function createPlayStats({ storage = localStorage, now = Date.now, target = globalThis } = {}) {
  let stats = readStats(storage) || { v: VERSION, device: newDevice(), devices: {} };
  let device = stats.device;
  let line = cleanLine(stats.devices[device]);
  line.sessions += 1;
  let lastInput = now();
  let last = null; // (the player's position last frame, and its way of travel)
  let unsaved = 0;
  let written = false; // (this page has stored its counts once)

  /** Into storage: only this device's line, beside what the cloud brought for the others */
  const save = () => {
    unsaved = 0;
    const stored = readStats(storage);
    // (the save was cleared, js/account-merge.js clearLocalSave: another account took the device over; these counts were
    // not its own)
    if (stored && stored.device !== device) { device = stored.device; line = cleanLine(stored.devices[device]); }
    if (!stored && written) { device = newDevice(); line = cleanLine(null); }
    const others = { ...(stored && stored.device === device ? stored.devices : {}) };
    const kept = cleanLine(others[device]);
    delete others[device];
    if (kept.playMs > line.playMs) line = kept; // (a fuller count of this device came back from the cloud)
    line.at = now();
    stats = { v: VERSION, device, devices: mergeDevices({ ...others, [device]: line }, null) };
    writeStats(stats, storage);
    written = true;
  };

  const input = () => { lastInput = now(); };
  for (const type of ['keydown', 'pointerdown', 'wheel', 'touchstart']) target.addEventListener?.(type, input, { passive: true, capture: true });
  const leave = () => save();
  target.addEventListener?.('pagehide', leave);
  target.document?.addEventListener?.('visibilitychange', () => { if (target.document.hidden) save(); });
  save();

  return (running = {
    /** `dt`: the frame's wall time in s, `kind`: travelKind(), `position`: the player's {x, y, z} */
    tick(dt, kind, position) {
      if (!(dt > 0) || !position) return;
      let metres = 0;
      if (last && last.kind === kind) {
        const d = Math.hypot(position.x - last.x, (position.y || 0) - last.y, position.z - last.z);
        if (d < JUMP) metres = d;
      }
      last = { kind, x: position.x, y: position.y || 0, z: position.z };
      const moving = metres / dt > MOVING;
      if (!moving && now() - lastInput > IDLE_MS) return; // (away from the game)
      const ms = dt * 1000;
      line.playMs += ms;
      const m = (line.modes[kind] ??= { ms: 0, m: 0 });
      m.ms += ms;
      m.m += metres;
      if ((unsaved += ms) >= SAVE_EVERY) save();
    },
    save,
    /** The counts now, all devices (js/play-stats-ui.js) */
    current() { save(); return stats; }
  });
}
