// js/missions-data-parsenn.js
// In the cab of the Parsennbahn (js/missions-data.js spreads PARSENN_MISSIONS into MISSIONS; js/missions-parsenn.js has
// its runtime: the cab, the tunnels and the stations, the camera, the control desk's HUD, the keys and the sounds). No
// three.js and no DOM in here (tests/missions-parsenn.test.mjs drives the car with synthetic frames over the real line).
//
// The real thing: the Parsennbahn climbs from Davos Dorf (1560 m) to the Weissfluhjoch (2663 m) in two sections, a
// funicular each, changing at Höhenweg (2219 m). Below, two trains of two coupled cars (1.9 km, 10 m/s), above one
// long car each (2.2 km, 6.2 m/s); the two trains of a section hang on the two ends of one rope, so one climbs while
// the other comes down, and half-way they pass each other on the loop (the Ausweiche). The machinist (Maschinist)
// rides in the cab at the front of the climbing car and drives the winch from his desk: the speed lever (the drive
// keeps the speed it is set to), the service brake, the emergency brake, the doors, the horn.
//
// The mission: the first train of the day. At Davos Dorf the passengers board, the machinist closes the doors and
// leaves on the minute, keeps to the limits (out of the station, through the loop and the tunnel, into the station)
// and stops with the front at the board at Höhenweg, to the centimetre; opens the doors, changes to the upper car,
// and does it again to the Weissfluhjoch. Points by section: the departure on time (40) and the horn before it (10),
// the arrival on time (100) and at the board (100), and the ride (50: no hard braking, the people stand). Over a
// limit costs points by the second. A time-lapse (×4) spares the long straight stretches.
//
// The line's coordinate is the drive's s: the climbing train's valley end from the bottom of its run (js/bergbahnen.js
// shuttle: 0 at the valley station, runLen at the top, its front then 0.3 m short of the track's end: the stop board).

import { BERGBAHNEN } from './bergbahnen-data.js';
import { msg } from './messages.js';
import { dueText, overLimitText } from './missions-data-fun.js';
import { funicularTrack } from './funicular-track.js';

export const PARSENN_ID = 'parsenn-maschinist';
export const PARSENN_SCORE_MODE = 'points';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
export const fmtClock = (s) => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const fmtSigned = (s) => `${s >= 0 ? '+' : '−'}${Math.abs(Math.round(s))} s`;
/** A stop's error: "+12 cm", "−1.3 m" (> 0: past the board) */
export const fmtError = (e) => (Math.abs(e) < 1 ? `${e >= 0 ? '+' : '−'}${Math.abs(Math.round(e * 100))} cm` : `${e >= 0 ? '+' : '−'}${Math.abs(e).toFixed(1)} m`);

// --- The desk and the timetable ----------------------------------------------------------------------------------------
export const PB = {
  notch: 0.05, // the lever's step (5 % of the line's top speed)
  leverRate: 0.6, // per second while a lever key is held
  driveAccel: 0.45, driveDecel: 0.6, // m/s²: the winch's regulated acceleration and slowing to the lever's speed
  brake: 0.9, // m/s²: the service brake (hard enough, still fine for standing passengers)
  emergency: 2.4, // m/s²: the emergency brake (the rope's grip and the rail brakes: everyone stumbles)
  jerk: 1.2, // m/s³: how fast the drive's and the service brake's pull may change
  hard: 1.0, // m/s²: slowing harder than this throws the standing passengers
  tolerance: 2, // km/h over a limit before it counts
  window: 12, // m short of the board where the car counts as in the station (the doors open)
  overrun: 1.0, // m past the board: the limit switch trips the emergency brake
  buffer: 2.5, // m past the board: the buffer stop
  boarding: 12, // s the passengers take to board
  alight: 8, // s to get off
  fade: 2.5, // s of the change at Höhenweg (to the upper car)
  firstDeparture: 20, // s: the first train leaves Davos Dorf at 0:20 on the run's clock
  change: 45, // s from the arrival at Höhenweg to the upper departure (timetable)
  margin: 1.08, reserve: 10, // the timetable: the fastest run × margin + reserve s, to 5 s
  hornBefore: 30, // s: a horn this long before leaving counts
  timelapse: 4, // × the time in the time-lapse
  timelapseClear: 150 // m to the next lower limit or the board: the time-lapse ends there
};

/** The two sections, by their lines in js/bergbahnen-data.js */
export const SECTIONS = [
  { id: 'lower', lineId: 'Parsennbahn|2200', from: 'Davos Dorf', to: 'Höhenweg', passengers: 46, side: 1 },
  { id: 'upper', lineId: 'Parsennbahn|1160', from: 'Höhenweg', to: 'Weissfluhjoch', passengers: 34, side: 1 }
];

/** A section's line: { pathLen, trainLength, runLen, vmax (m/s), tunnels: [[from, to]] (m along the track) }; the track
 *  as js/bergbahnen.js lays it (js/funicular-track.js: the eased plan and the smooth grade line), the tunnels OSM's */
export function lineProfile(section) {
  const f = BERGBAHNEN.funiculars.find((l) => l.id === section.lineId);
  if (!f) return null;
  const p = funicularTrack(f)[0];
  let len = 0, start = null;
  const tunnels = [];
  for (let i = 0; i < p.length; i++) {
    if (i) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y, p[i].z - p[i - 1].z);
    const t = p[i].tunnel;
    if (t && start === null) start = len;
    if (!t && start !== null) { tunnels.push([start, len]); start = null; }
  }
  if (start !== null) tunnels.push([start, len]);
  const cars = f.cars || 1, trainLength = cars * f.carLength + (cars - 1) * 0.5;
  return { pathLen: len, trainLength, runLen: len - trainLength - 0.6, vmax: f.speed, tunnels };
}

/**
 * The section's speed limits: [{ from, to (drive s), kmh, name }], the slowest first. A limit on the track holds from
 * the moment the front reaches it until the rear has left it (the train's s: its valley end, the front trainLength
 * + 0.3 m above). The passing loop is half-way (±95 m, as js/bergbahnen.js swings the tracks apart).
 */
export function speedLimits(profile, section) {
  const { pathLen, trainLength: L, runLen, vmax } = profile;
  const top = Math.round(vmax * 3.6);
  const upper = section.id === 'upper';
  const out = [];
  const track = (a, b, kmh, name) => { if (kmh < top) out.push({ from: Math.max(0, a - 0.3 - L), to: Math.min(runLen + PB.buffer, b - 0.3), kmh, name }); };
  out.push({ from: 0, to: 40, kmh: upper ? 12 : 15, name: 'Leaving the station' });
  track(pathLen / 2 - 95, pathLen / 2 + 95, upper ? 15 : 25, 'Passing loop');
  // the tunnels out on the line (not the stations' own: the station limits cover those)
  for (const [a, b] of profile.tunnels) if (a > 60 && b < pathLen - 60) track(a, b, upper ? 18 : 30, 'Tunnel');
  if (upper) { const t = profile.tunnels.find(([, b]) => b >= pathLen - 1); if (t) track(t[0], pathLen, 15, 'Tunnel to the station'); }
  out.push({ from: runLen - 150, to: runLen + PB.buffer, kmh: upper ? 15 : 20, name: 'Into the station' });
  out.push({ from: runLen - 30, to: runLen + PB.buffer, kmh: 8, name: 'Platform' });
  return out.sort((a, b) => a.kmh - b.kmh);
}

/** The limit (km/h) at s: the slowest section over it, else the line's top speed */
export function limitAt(limits, s, topKmh) {
  let v = topKmh;
  for (const l of limits) if (s >= l.from && s <= l.to && l.kmh < v) v = l.kmh;
  return v;
}

/** The next lower limit ahead of s (within `range` m): { from, kmh, name } or null */
export function nextLimit(limits, s, topKmh, range = 2000) {
  const now = limitAt(limits, s, topKmh);
  let best = null;
  for (const l of limits) if (l.from > s && l.from - s < range && l.kmh < now && (!best || l.from < best.from)) best = l;
  return best;
}

/** The fastest run (s) from rest at 0 to rest at runLen under the limits, at the drive's acceleration and slowing */
export function runTime(limits, runLen, topKmh, { accel = PB.driveAccel, brake = PB.driveDecel } = {}) {
  const step = 2, n = Math.max(1, Math.ceil(runLen / step)), ds = runLen / n;
  const v = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) v[i] = limitAt(limits, i * ds, topKmh) / 3.6;
  v[0] = 0; v[n] = 0;
  // (a limit holds from where it starts: the slowing has to be done before it)
  for (let i = 1; i <= n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * accel * ds));
  for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * brake * ds));
  let t = 0;
  for (let i = 1; i <= n; i++) t += ds / Math.max(0.3, (v[i] + v[i - 1]) / 2);
  return t;
}

/** The timetable: [{ depart, arrive }] a section, on the run's clock (s), to 5 s */
export function timetable(lines) {
  const out = [];
  let depart = PB.firstDeparture;
  lines.forEach((line, k) => {
    const run = runTime(line.limits, line.runLen, line.topKmh);
    const arrive = Math.round((depart + run * PB.margin + PB.reserve) / 5) * 5;
    out.push({ depart, arrive });
    depart = arrive + PB.change;
  });
  return out;
}

/** The two sections ready to drive: profile, limits, top speed */
export function parsennLines(sections = SECTIONS) {
  return sections.map((section) => {
    const profile = lineProfile(section);
    return { section, ...profile, topKmh: Math.round(profile.vmax * 3.6), limits: speedLimits(profile, section) };
  });
}

// --- Scores ----------------------------------------------------------------------------------------------------------
/** The departure's points: on time (40: from the minute to 15 s late; none before it), the horn before it (10) */
export function departureScore({ late, horn }) {
  const depart = late < 0 ? 0 : late <= 15 ? 40 : Math.max(0, Math.round(40 - (late - 15)));
  return { depart, horn: horn ? 10 : 0 };
}
/** The arrival's points: on time (100 within 10 s, 2 a second beyond), at the board (100 within 10 cm, 0 at 2.1 m) */
export function arrivalScore({ delay, error, buffer = false }) {
  const late = Math.abs(delay);
  const punctual = late <= 10 ? 100 : Math.max(0, Math.round(100 - (late - 10) * 2));
  const e = Math.abs(error);
  const precise = buffer ? 0 : e <= 0.1 ? 100 : Math.max(0, Math.round(100 - (e - 0.1) * 50));
  return { punctual, precise };
}
/** The ride's points: 50, less 15 a second of hard slowing and 25 an emergency brake */
export const comfortScore = ({ hardS, emergencies }) => Math.max(0, Math.round(50 - hardS * 15 - emergencies * 25));

// --- The drive ---------------------------------------------------------------------------------------------------------
const freshLeg = () => ({ departT: null, horn: false, hardS: 0, emergencies: 0, overrun: false, buffer: false, arrival: null });

/** A drive over both sections (lines: parsennLines()) */
export function createDrive(lines = parsennLines()) {
  return {
    lines, timetable: timetable(lines), k: 0, phase: 'boarding', // boarding | ready | run | halt | alight | change | done
    t: 0, s: 0, v: 0, a: 0, lever: 0, brake: false, emergency: false, doors: 'open', timelapse: false,
    boardT: 0, alightT: 0, changeT: 0, hornT: -1e9, aboard: 0,
    legs: [freshLeg()], results: [], overspeed: 0, overspeedPenalty: 0, maxOver: 0, done: false, events: []
  };
}

export const driveLine = (d) => d.lines[Math.min(d.k, d.lines.length - 1)];
export const driveLimit = (d) => limitAt(driveLine(d).limits, d.s, driveLine(d).topKmh);
/** m from the front to the board (> 0: short of it) */
export const toBoard = (d) => driveLine(d).runLen - d.s;
const doorsOpen = (d) => d.phase === 'boarding' || d.phase === 'alight';

/** The lever one notch up (+1) or down (−1); returns whether it moved */
export function leverStep(d, dir) {
  if (d.done) return false;
  const before = d.lever;
  d.lever = clamp(Math.round((d.lever + dir * PB.notch) / PB.notch) * PB.notch, 0, 1);
  if (d.lever > 0 && doorsOpen(d)) d.events.push({ type: 'interlock' });
  return d.lever !== before;
}

/** The doors' key: closes them once everyone is aboard, opens them at a standstill in the station (the arrival) */
export function toggleDoors(d) {
  if (d.done || d.phase === 'change') return false;
  if (d.phase === 'boarding') {
    if (d.boardT < PB.boarding) { d.events.push({ type: 'boarding' }); return false; }
    d.phase = 'ready'; d.doors = 'closed';
    d.events.push({ type: 'doors', open: false });
    return true;
  }
  if (d.phase === 'alight') return false;
  if (d.v > 0.01) { d.events.push({ type: 'moving' }); return false; }
  if (d.phase === 'ready') { d.phase = 'boarding'; d.doors = 'open'; d.events.push({ type: 'doors', open: true }); return true; }
  // at the top: only in the station (within PB.window of the board, or past it)
  if (toBoard(d) > PB.window) { d.events.push({ type: 'not-here' }); return false; }
  const leg = d.legs[d.k], tt = d.timetable[d.k];
  const error = -toBoard(d);
  const arr = arrivalScore({ delay: d.t - tt.arrive, error, buffer: leg.buffer });
  leg.arrival = { t: d.t, delay: d.t - tt.arrive, error, ...arr };
  const dep = departureScore({ late: (leg.departT ?? tt.depart) - tt.depart, horn: leg.horn });
  const comfort = comfortScore(leg);
  const r = { from: driveLine(d).section.from, to: driveLine(d).section.to, departLate: leg.departT - tt.depart, delay: leg.arrival.delay, error, ...dep, ...arr, comfort, emergencies: leg.emergencies, buffer: leg.buffer };
  r.total = r.depart + r.horn + r.punctual + r.precise + r.comfort;
  d.results.push(r);
  d.phase = 'alight'; d.doors = 'open'; d.alightT = 0; d.lever = 0; d.timelapse = false;
  d.events.push({ type: 'doors', open: true }, { type: 'arrived', result: r });
  return true;
}

/** The horn (counts for the departure within PB.hornBefore s of it) */
export function soundHorn(d) { d.hornT = d.t; d.events.push({ type: 'horn' }); return true; }

/** The emergency brake: on until the car stands, the lever back to 0 */
export function emergencyBrake(d) {
  if (d.done || d.emergency || d.v <= 0.01) return false;
  d.emergency = true; d.lever = 0; d.timelapse = false;
  d.legs[d.k].emergencies++;
  d.events.push({ type: 'emergency' });
  return true;
}

/** Whether the time-lapse may run now: on the line, no brake, at speed, the next lower limit and the board far ahead */
export function timelapseAllowed(d) {
  if (d.phase !== 'run' || d.brake || d.emergency || d.v < 0.5) return false;
  const line = driveLine(d), next = nextLimit(line.limits, d.s, line.topKmh);
  const clear = PB.timelapseClear + (d.v * d.v) / (2 * PB.driveDecel);
  if (next && next.from - d.s < clear) return false;
  return toBoard(d) > clear;
}
export function setTimelapse(d, on) {
  if (on && !timelapseAllowed(d)) { d.events.push({ type: 'timelapse-no' }); d.timelapse = false; return false; }
  d.timelapse = !!on;
  return true;
}

/**
 * A frame of the drive: dt (s, real), brake (the service brake held). Moves the car by the winch's regulated
 * acceleration to the lever's speed (jerk-limited), or the brakes; the doors' interlock, the passengers, the limit
 * switch and the buffer, the overspeed, the departure, the stations' halts and the change at Höhenweg. Its events (and
 * the keys') pile up in d.events until the caller takes them.
 */
export function driveStep(d, { dt, brake = false }) {
  if (d.done) return d;
  if (d.timelapse && !timelapseAllowed(d)) { d.timelapse = false; d.events.push({ type: 'timelapse-off' }); }
  const k = d.timelapse ? PB.timelapse : 1;
  dt *= k;
  d.t += dt;
  d.brake = !!brake;
  const line = driveLine(d), leg = d.legs[d.k];
  if (d.phase === 'boarding') {
    d.boardT += dt;
    d.aboard = Math.min(line.section.passengers, Math.floor((d.boardT / PB.boarding) * line.section.passengers));
  }
  if (d.phase === 'alight') {
    d.alightT += dt;
    d.aboard = Math.max(0, Math.round(line.section.passengers * (1 - d.alightT / PB.alight)));
    if (d.alightT >= PB.alight) {
      if (d.k >= d.lines.length - 1) { d.phase = 'done'; d.done = true; d.events.push({ type: 'done' }); }
      else { d.phase = 'change'; d.changeT = 0; d.events.push({ type: 'change' }); }
    }
    return d;
  }
  if (d.phase === 'change') {
    d.changeT += dt;
    if (d.changeT >= PB.fade) {
      d.k++; d.legs.push(freshLeg());
      Object.assign(d, { phase: 'boarding', s: 0, v: 0, a: 0, lever: 0, doors: 'open', boardT: 0, aboard: 0, emergency: false });
      d.events.push({ type: 'section', k: d.k });
    }
    return d;
  }
  // the car: the doors open hold it
  if (doorsOpen(d)) { d.v = 0; d.a = 0; return d; }
  const target = d.lever * line.vmax;
  let aCmd;
  if (d.emergency) aCmd = -PB.emergency;
  else if (brake) aCmd = -PB.brake;
  else if (target > d.v + 0.005) aCmd = Math.min(PB.driveAccel, (target - d.v) * 1.2 + 0.04);
  else if (target < d.v - 0.005) aCmd = -Math.min(PB.driveDecel, (d.v - target) * 1.2 + 0.08);
  else { aCmd = 0; d.v = target; }
  if (d.emergency) d.a = aCmd;
  else d.a += clamp(aCmd - d.a, -PB.jerk * dt, PB.jerk * dt);
  // (the regulation does not overshoot the lever's speed)
  const v0 = d.v;
  d.v += d.a * dt;
  if (!d.emergency && !brake && ((v0 <= target && d.v > target) || (v0 >= target && d.v < target && d.a < 0 && target > 0))) { d.v = target; d.a = 0; }
  if (d.v <= 0) { d.v = 0; if (d.a < 0) d.a = 0; if (d.emergency) d.emergency = false; }
  d.s += ((v0 + d.v) / 2) * dt;
  if (d.a < -PB.hard) leg.hardS += dt;
  // the limit switch past the board, the buffer
  const past = -toBoard(d);
  if (past > PB.overrun && !leg.overrun) { leg.overrun = true; if (!d.emergency && d.v > 0.01) { d.emergency = true; leg.emergencies++; } d.lever = 0; d.events.push({ type: 'overrun' }); }
  if (past >= PB.buffer) { d.s = line.runLen + PB.buffer; if (d.v > 0.05) { leg.buffer = true; d.events.push({ type: 'buffer' }); } d.v = 0; d.a = 0; d.emergency = false; d.lever = 0; }
  // over the limit
  const over = d.v * 3.6 - limitAt(line.limits, d.s, line.topKmh);
  if (over > PB.tolerance) {
    d.overspeed += dt;
    d.overspeedPenalty = Math.min(250, d.overspeedPenalty + dt * (3 + over * 0.5));
    d.maxOver = Math.max(d.maxOver, over);
  }
  // the departure, the halt in the station
  if (d.phase === 'ready' && d.s > 0.5) {
    leg.departT = d.t;
    leg.horn = d.t - d.hornT <= PB.hornBefore;
    d.phase = 'run';
    d.events.push({ type: 'depart', late: d.t - d.timetable[d.k].depart, horn: leg.horn });
  }
  if (d.phase === 'run' && d.v === 0 && toBoard(d) <= PB.window) { d.phase = 'halt'; d.events.push({ type: 'halt', error: -toBoard(d) }); }
  else if (d.phase === 'halt' && d.v > 0) d.phase = 'run';
  return d;
}

export function driveScore(d) {
  const sum = d.results.reduce((a, r) => a + r.total, 0);
  return Math.max(0, Math.round(sum - d.overspeedPenalty));
}

// --- The mission -------------------------------------------------------------------------------------------------------
// The valley station in Davos Dorf: the start on the forecourt below the track's lower end (js/bergbahnen-data.js
// 644.6, -1436.9), the pin on it
export const VALLEY = { x: 652, z: -1428 };

/** What a section's step says, in each phase */
function sectionText(d, k) {
  const line = d.lines[k], name = line.section.to, tt = d.timetable[k];
  if (d.k < k || d.phase === 'change') return { text: `Change to the upper car at Höhenweg`, hint: null };
  if (d.phase === 'boarding') {
    const left = Math.max(0, Math.ceil(PB.boarding - d.boardT));
    return { text: msg('{from} · boarding {n}/{of} · departure {at}', '{from} · Einsteigen {n}/{of} · Abfahrt {at}', { from: line.section.from, n: d.aboard, of: line.section.passengers, at: fmtClock(tt.depart) }), hint: left > 0 ? 'The passengers are boarding' : 'F: close the doors' };
  }
  if (d.phase === 'ready') {
    const wait = tt.depart - d.t;
    return { text: wait > 0 ? msg('Doors closed · departure {at} (in {s} s)', 'Türen zu · Abfahrt {at} (in {s} s)', { at: fmtClock(tt.depart), s: Math.ceil(wait) }) : msg('Doors closed · departure {at}', 'Türen zu · Abfahrt {at}', { at: fmtClock(tt.depart) }), hint: wait > 0 ? 'B: the horn before you leave' : 'W: lever up, off you go' };
  }
  const limit = driveLimit(d), kmh = Math.round(d.v * 3.6), togo = toBoard(d);
  if (d.phase === 'halt') return { text: msg('{name} · {e} from the board', '{name} · {e} von der Tafel', { name, e: fmtError(-togo) }), hint: Math.abs(togo) > 0.1 && togo > 0 ? 'Creep on (W) or open the doors (F)' : 'F: open the doors' };
  if (d.phase === 'alight') return { text: msg('{name} · the passengers get off', '{name} · Die Fahrgäste steigen aus', { name }), hint: null };
  const hint = kmh > limit + PB.tolerance ? msg('Too fast: limit {v} km/h', 'Zu schnell: Limit {v} km/h', { v: limit }) : togo < 40 ? 'Stop with the front at the yellow line' : togo < 160 ? 'Slow down for the station' : d.timelapse ? 'Time-lapse ×4 · T: back to normal' : null;
  return { text: dueText(name, fmtDist(togo), false, fmtClock(tt.arrive), fmtSigned(d.t - tt.arrive), kmh, limit), hint };
}

function sectionObjective(k) {
  const to = SECTIONS[k].to;
  return {
    id: SECTIONS[k].id,
    title: k === 0 ? 'Up to Höhenweg' : 'Up to the Weissfluhjoch',
    allowModes: ['person'],
    check(ctx, state) {
      const d = state.drive;
      if (!d) return { done: false, progress: null, text: `Drive to ${to}`, target: null, hint: null };
      const r = d.results[k];
      if (r && (k < SECTIONS.length - 1 || d.done)) return { done: true, progress: 1, text: msg('{to}: {p} pts', '{to}: {p} Pkt.', { to, p: r.total }), target: null, hint: null };
      const v = sectionText(d, k);
      const line = d.lines[k];
      return { done: false, progress: d.k === k ? clamp(d.s / line.runLen, 0, 1) : null, text: v.text, target: null, hint: v.hint };
    }
  };
}

export const PARSENN_MISSION = {
  id: PARSENN_ID,
  title: 'Machinist on the Parsennbahn',
  intro: 'The first train of the day up the Parsennbahn, and you are the machinist in the cab at the front of the car. At Davos Dorf the passengers board: close the doors (F), sound the horn (B) and leave on the minute. The lever (W/S) sets the speed the winch holds, Space is the service brake, X the emergency brake. Keep to the limits out of the station, through the tunnel and the passing loop, where the other car comes down, and stop with the front at the yellow line at Höhenweg, to the centimetre. Open the doors, change to the upper car and do it again up to the Weissfluhjoch. The people stand: brake gently. T runs the long stretches in time-lapse.',
  mode: 'person',
  season: null,
  time: 'midday',
  features: ['parsennCab'],
  scoreMode: PARSENN_SCORE_MODE,
  // (a clean run of both sections is worth 600: gold for two stops within ~25 cm, on time and gentle; silver for a
  // late departure or a stop a metre off; bronze for any run that gets up there without much over the limits)
  medals: { gold: 520, silver: 400, bronze: 250 },
  colour: '#d3202a',
  icon: 'funicular',
  pin: VALLEY,
  finish: 'Weissfluhjoch, 2663 m. The doors open onto the snow, the first skiers clatter out, and the car waits for the next run down.',
  start: { x: VALLEY.x, z: VALLEY.z, heading: -2.4 },
  props: [],
  createState() { return { drive: null }; },
  score: (state) => (state.drive ? driveScore(state.drive) : 0),
  summary(state) {
    const d = state.drive;
    if (!d) return [];
    const lines = d.results.map((r) => msg('{a} – {b}: departure {dep}{horn} · arrival {arr} · {e} · ride {ride}/50 → {p} pts',
      (p) => `${p.a} – ${p.b}: Abfahrt ${p.dep}${p.horn ? ' (Hornsignal)' : ''} · Ankunft ${p.arr} · ${p.e} · Fahrt ${p.ride}/50 → ${p.p} Pkt.`,
      { a: r.from, b: r.to, dep: fmtSigned(r.departLate), horn: r.horn ? ' (horn)' : '', arr: fmtSigned(r.delay), e: fmtError(r.error), ride: r.comfort, p: r.total }));
    if (d.overspeed > 0) lines.push(overLimitText(d));
    return lines;
  },
  objectives: SECTIONS.map((_, k) => sectionObjective(k))
};

export const PARSENN_MISSIONS = [PARSENN_MISSION];
