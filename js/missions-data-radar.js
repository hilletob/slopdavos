// js/missions-data-radar.js
// The police speed check with the laser (pure definitions and logic; js/missions-radar.js is the runtime: the traffic,
// the tripod, the laser's view and display). No three.js and no DOM in here: tests/missions-radar.test.mjs drives the
// check with synthetic cars.
//
// The Kantonspolizei Graubünden measures on the Talstrasse between Davos Platz and Davos Dorf (OSM w127415531): the
// one-way, two-lane main road north-east through the meadows below the Hohe Promenade, 50 km/h (OSM has no maxspeed
// here; the general limit in town), straight for 350 m from the bend at the Madrisaweg (LV95 ~2783106/1186318) to the
// Dischmakreuzung (~2783144/1186329 … 2783144/1186671). The patrol drives there from the Talstrasse below the
// Kongresszentrum, parks on the verge east of the road (between the kerb and the RhB's track), sets the laser up on
// its tripod facing the oncoming cars, measures them as they come (a lock of 0.6 s on a car 30-300 m off: the reading
// in km/h, the cosine of the angle in it, cut to whole km/h), stops a driver over the limit plus the tolerance with
// the stop sign (the "Kelle": the car pulls over 25 m past the laser) and walks to the car to hand out the fine of the
// Ordnungsbussenverordnung (in town: 1-5 km/h CHF 40, 6-10 CHF 120, 11-15 CHF 250, from 16 km/h a report to the
// prosecutor instead). The laser's tolerance up to 100 km/h: 3 km/h.
//
// The runtime hands the check its frame as ctx.radar (js/missions-radar.js radarCheck.update, before def.update):
//   { eye: { x, z } (the laser), aim (rad, the world heading the laser points at), laserOn (looking through it),
//     player: { x, z, mode }, cars: [{ id, x, z, tx, tz, speed }] (the traffic's cars on the stretch; id: the vehicle),
//     input: { measure (pressed this frame), stop (the stop sign raised), fine (null | 0 let go | 1-4 the fine) } }

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
/** German for the texts with numbers in them (js/i18n.js translates whole strings only): the page's language */
const de = () => /^de\b/.test(globalThis.document?.documentElement?.lang || '');

// --- The road ----------------------------------------------------------------------------------------------------------
// The Talstrasse's axis from below the Hotel Concordia's corner (w531784374) round the bend onto the straight
// (w127415531), over the Dischmakreuzung and on towards Davos Dorf (w317013395): the stretch whose cars the check sees
export const RADAR_ROAD = [494.2, -613, 524.3, -646.6, 539.7, -666.9, 555.5, -692.3, 583, -744.9, 596.3, -777, 601.8, -796.1, 606.4, -817.9, 626.3, -1003.4, 644.3, -1170.9,
  647.9, -1204.5, 652.1, -1223.6, 656.8, -1240.5, 664.9, -1260.2, 671.5, -1274.3, 681.3, -1290.2, 705.1, -1319.8];
const SEGS = (() => {
  const out = [];
  let s = 0;
  for (let i = 2; i < RADAR_ROAD.length; i += 2) {
    const ax = RADAR_ROAD[i - 2], az = RADAR_ROAD[i - 1], bx = RADAR_ROAD[i], bz = RADAR_ROAD[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    out.push({ ax, az, dx: (bx - ax) / L, dz: (bz - az) / L, L, s });
    s += L;
  }
  return out;
})();
export const ROAD_LENGTH = SEGS.reduce((a, g) => a + g.L, 0);

/** Where (x, z) lies along the road: s (m from its start), lat (m to the right of the axis; the cars drive towards
 *  growing s), the direction there and the distance off the axis */
export function roadFrame(x, z) {
  let best = null, bd = Infinity;
  for (const g of SEGS) {
    const t = clamp((x - g.ax) * g.dx + (z - g.az) * g.dz, 0, g.L);
    const px = g.ax + g.dx * t, pz = g.az + g.dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; best = { s: g.s + t, lat: (x - px) * -g.dz + (z - pz) * g.dx, dx: g.dx, dz: g.dz, off: d }; }
  }
  return best;
}

/** The point s m along the road, lat m to the right of its axis, with the road's direction there */
export function roadPoint(s, lat = 0) {
  let g = SEGS[SEGS.length - 1];
  for (const c of SEGS) if (s <= c.s + c.L) { g = c; break; }
  const t = clamp(s - g.s, 0, g.L);
  return { x: g.ax + g.dx * t - g.dz * lat, z: g.az + g.dz * t + g.dx * lat, dx: g.dx, dz: g.dz };
}

const STRAIGHT_S = SEGS[7].s; // (606.4, -817.9): the bend's end, where the straight begins
export const RADAR = {
  limit: 50, // km/h
  tolerance: 3, // km/h: a laser up to 100 km/h
  rangeMin: 30, rangeMax: 300, // m
  lockAngle: 4 * Math.PI / 180, // the cone round the crosshair the laser locks onto a car in
  lockTime: 0.6, // s on the car for a reading
  shownTime: 4, // s the reading stays on the display
  length: 240, // s of measuring
  overtime: 40, // s more to finish a stop under way when the time is up
  siteS: STRAIGHT_S + 200, // the laser: 200 m down the straight, 155 m before the Dischmakreuzung
  laserLat: 5.0, // m right of the axis: on the verge between the kerb (the road 6.5 m wide) and the RhB's ballast (its track 8.5 m off)
  stopAhead: 25, // m past the laser the stopped car pulls in
  stopLat: 2.2, // m right of the axis: at the kerb
  stopRange: [12, 200], // m from the laser: a car the stop sign can be shown to
  maxDecel: 7, // m/s²: a car that would have to brake harder drives past
  fineReach: 5, // m from the stopped car to talk to the driver
  lost: 2, // s a stopped car may be out of sight before it counts as gone
  points: { stop: 50, stopWrong: -60, stopBlind: -80, fine: 60, fineWrong: -30, fineInnocent: -60, letGoInnocent: 20 },
  // the traffic: of the cars that come, these drive too fast (true km/h; a speeder at least every `every` s)
  speeders: [58, 66, 61, 71, 63, 77, 68, 59, 74, 64],
  borderline: [52, 53, 51, 54],
  every: 13,
  medals: { gold: 650, silver: 460, bronze: 320 } // (tests/missions-radar.test.mjs: a clean bot officer 770-880 over five streams)
};
// The fines (Ordnungsbussenverordnung, Anhang 1 Ziff. 303.1: in town), by the km/h over the limit after the tolerance
export const FINES = [
  { key: 1, max: 5, label: 'CHF 40', de: 'CHF 40', range: '1-5 km/h' },
  { key: 2, max: 10, label: 'CHF 120', de: 'CHF 120', range: '6-10 km/h' },
  { key: 3, max: 15, label: 'CHF 250', de: 'CHF 250', range: '11-15 km/h' },
  { key: 4, max: Infinity, label: 'Report', de: 'Anzeige', range: '16+ km/h' }
];

const site = roadPoint(RADAR.siteS, 0);
export const AIM_HEADING = Math.atan2(-site.dx, -site.dz); // up the road, at the oncoming cars
export const LASER_SPOT = { ...roadPoint(RADAR.siteS, RADAR.laserLat), r: 1.6 };
export const TRIPOD = { x: LASER_SPOT.x - site.dx * 0.7, z: LASER_SPOT.z - site.dz * 0.7, heading: AIM_HEADING }; // (a step ahead of the officer)
export const STOP_S = RADAR.siteS + RADAR.stopAhead;
export const STOP_POINT = roadPoint(STOP_S, RADAR.stopLat);
// The patrol car's place: on the same verge 12 m past the laser, behind the officer, between the kerb and the RhB's
// track (the west side rises steeply to the Hohe Promenade)
export const PATROL_BAY = { ...roadPoint(RADAR.siteS + 12, 5.3), r: 3.2 };
// The start: the Talstrasse below the Kongresszentrum, in its right lane towards Davos Dorf (w531784374)
const START_SEG = { ax: 314.4, az: -512.2, bx: 434.4, bz: -564.7 };
export const RADAR_START = (() => {
  const L = Math.hypot(START_SEG.bx - START_SEG.ax, START_SEG.bz - START_SEG.az), dx = (START_SEG.bx - START_SEG.ax) / L, dz = (START_SEG.bz - START_SEG.az) / L;
  return { x: +(START_SEG.ax + dx * 50 - dz * 1.6).toFixed(1), z: +(START_SEG.az + dz * 50 + dx * 1.6).toFixed(1), heading: +Math.atan2(dx, dz).toFixed(4) };
})();

// --- The reading -------------------------------------------------------------------------------------------------------
/** The speed (m/s) at which the car closes on the laser at (ex, ez): its velocity along the line of sight (the cosine
 *  of the angle the laser sees it at is in it; negative: it drives away) */
export function radialSpeed(car, ex, ez) {
  const rx = ex - car.x, rz = ez - car.z, d = Math.hypot(rx, rz) || 1;
  return (car.tx * rx + car.tz * rz) * car.speed / d;
}
/** The display's km/h: cut to whole km/h, never rounded up */
export const readingKmh = (ms) => Math.floor(ms * 3.6 + 1e-9);
/** The km/h over the limit once the tolerance is off (≤ 0: no offence) */
export const excessOf = (kmh) => kmh - RADAR.tolerance - RADAR.limit;
/** The fine for an excess: 1-4 (FINES[k - 1]), 0 for none */
export function fineFor(excess) {
  if (!(excess >= 1)) return 0;
  return FINES.find((f) => excess <= f.max).key;
}

/** The car nearest the crosshair (within the lock cone), with its distance and how far off the crosshair it is */
export function laserTarget(cars, eye, aim, cone = RADAR.lockAngle) {
  let best = null;
  for (const c of cars) {
    const dx = c.x - eye.x, dz = c.z - eye.z, d = Math.hypot(dx, dz);
    if (d < 3) continue;
    const off = Math.abs(wrap(Math.atan2(dx, dz) - aim));
    // (a little slack for the near car: it covers more of the view)
    const allow = cone + Math.atan2(1.0, d);
    if (off <= allow && (!best || off < best.off)) best = { car: c, d, off };
  }
  return best;
}

// --- The traffic's drivers ---------------------------------------------------------------------------------------------
/** A newly seen car's driver: { kmh } to drive at (a speeder, or one just at the limit), or null (the traffic's own
 *  pace, 36-49 km/h). A speeder at least every RADAR.every s, else ~ one in four */
export function chooseDriver(check, rand = Math.random) {
  const r = rand();
  const due = check.t - check.lastSpeeder >= RADAR.every;
  if (due || r < 0.25) {
    check.lastSpeeder = check.t;
    const kmh = RADAR.speeders[check.speederIndex++ % RADAR.speeders.length];
    return { kmh, kind: 'speeder' };
  }
  if (r < 0.4) return { kmh: RADAR.borderline[check.borderIndex++ % RADAR.borderline.length], kind: 'borderline' };
  return null;
}

// --- The commuters ----------------------------------------------------------------------------------------------------
// The town's traffic is thin out here between the meadows (js/traffic.js spaces its cars wider where few buildings stand):
// the check brings its own stream along the stretch, two lanes of cars that come into it at the far end of the bend,
// out of the laser's range, and leave it past the Dischmakreuzung behind the officer. Each keeps its lane and its pace
// (the Intelligent Driver Model, as js/traffic.js drives: it follows the car ahead, the traffic's own cars and the
// player on the road among them), a fast one changes to the free lane to overtake; the stopped one pulls in at the kerb.
export const STREAM = {
  lanes: [-1.6, 1.6], // m right of the axis: the left and the right lane
  every: [3.2, 6.5], // s between two cars
  normal: [37, 49], // km/h: the traffic's own pace
  a: 2.0, b: 3.0, T: 1.2, s0: 2.5, // the driver (js/traffic.js CAR_DRIVER)
  half: 2.3, // m: half a car's length
  look: 90, // m a driver looks ahead
  laneRate: 1.2, // m/s sideways into the other lane
  kinds: ['sedan', 'hatch', 'suv', 'sedan', 'hatch', 'van']
};

/** A seeded random (deterministic for the tests) */
export function seeded(seed = 1) {
  let r = Math.max(1, Math.floor(seed * 2654435761) % 2147483647);
  return () => ((r = (r * 16807) % 2147483647) / 2147483647);
}

export function createStream(seed = 1) {
  const rand = seeded(seed);
  return { rand, cars: [], next: rand() * 2, pending: undefined, count: 0, t: 0 };
}

/** One frame of the stream: new cars at the start of the stretch, the IDM along it, the stopped car (check.stop)
 *  braking to the kerb and standing, the ones past the end gone. `others`: [{ s, lat, speed }] (the traffic's cars, the
 *  player) the stream's drivers brake for */
export function stepStream(stream, check, dt, others = []) {
  const S = STREAM, rand = stream.rand;
  stream.t += dt;
  // new cars, out of sight at the stretch's start: the steady ones keep right, a fast one takes the left lane
  if (stream.t >= stream.next) {
    const d = stream.pending !== undefined ? stream.pending : (check ? chooseDriver(check, rand) : null);
    const lane = d?.kind === 'speeder' ? 0 : 1;
    const blocked = stream.cars.some((c) => c.lane === lane && c.s < 35) || others.some((o) => Math.abs(o.lat - S.lanes[lane]) < 1.8 && o.s < 35);
    if (blocked) stream.pending = d; // (it waits its turn)
    else {
      stream.pending = undefined;
      stream.next = stream.t + S.every[0] + rand() * (S.every[1] - S.every[0]);
      const kmh = d ? d.kmh : S.normal[0] + rand() * (S.normal[1] - S.normal[0]);
      const v0 = kmh / 3.6;
      stream.cars.push({ id: `c${++stream.count}`, s: 4, lat: S.lanes[lane], lane, v0, speed: v0 * 0.95, kind: d?.kind || 'normal', body: S.kinds[Math.floor(rand() * S.kinds.length)], paint: Math.floor(rand() * 1e6), held: false, acc: 0, x: 0, z: 0, tx: 0, tz: 1 });
    }
  }
  const stopId = check?.stop?.id;
  const all = stream.cars;
  const leaderOf = (c, lat) => {
    let gap = Infinity, speed = 0;
    for (const o of all) { if (o === c || Math.abs(o.lat - lat) > 1.8 || o.s <= c.s) continue; const g = o.s - c.s - 2 * S.half; if (g < gap) { gap = g; speed = o.speed; } }
    for (const o of others) { if (Math.abs(o.lat - lat) > 1.8 || o.s <= c.s) continue; const g = o.s - c.s - S.half - (o.half ?? S.half); if (g < gap) { gap = g; speed = o.speed; } }
    return { gap, speed };
  };
  for (const c of all) {
    const stopping = stopId === c.id;
    if (stopping) c.held = true;
    const L = leaderOf(c, c.lat);
    let acc = S.a * (1 - (c.speed / c.v0) ** 4);
    if (L.gap < S.look) {
      const want = S.s0 + Math.max(0, c.speed * S.T + (c.speed * (c.speed - L.speed)) / (2 * Math.sqrt(S.a * S.b)));
      acc -= S.a * (want / Math.max(L.gap, 0.1)) ** 2;
    }
    let v = Math.max(0, c.speed + Math.max(-9, acc) * dt);
    if (stopping) {
      v = check.stop.phase === 'stopped' || STOP_S - c.s < 0.6 ? 0 : Math.min(v, brakeSpeed(check.stop, c.s));
      c.lat += clamp(RADAR.stopLat - c.lat, -S.laneRate * dt, S.laneRate * dt);
    } else {
      if (c.held) { c.held = false; c.v0 = Math.min(c.v0, (S.normal[1] - 2) / 3.6); c.lane = 1; } // (back into traffic, calmer)
      // a fast one blocked: to the other lane if it is free; a steady one back to the right when it can
      const other = 1 - c.lane;
      const freeLane = (k, back, ahead) => !all.some((o) => o !== c && o.lane === k && o.s > c.s - back && o.s < c.s + ahead) && !others.some((o) => Math.abs(o.lat - S.lanes[k]) < 1.8 && o.s > c.s - back && o.s < c.s + ahead);
      if (Math.abs(c.lat - S.lanes[c.lane]) < 0.2) {
        if (L.gap < 45 && L.speed < c.v0 - 2 && freeLane(other, 18, 45)) c.lane = other;
        else if (c.lane === 0 && c.kind !== 'speeder' && freeLane(1, 15, 40)) c.lane = 1;
      }
      c.lat += clamp(S.lanes[c.lane] - c.lat, -S.laneRate * dt, S.laneRate * dt);
    }
    c.acc = (v - c.speed) / Math.max(dt, 1e-6);
    c.speed = v;
    c.s += v * dt;
    const p = roadPoint(c.s, c.lat);
    c.x = p.x; c.z = p.z; c.tx = p.dx; c.tz = p.dz;
  }
  for (let i = all.length - 1; i >= 0; i--) if (all[i].s >= ROAD_LENGTH - 2 && all[i].id !== stopId) all.splice(i, 1);
  return stream;
}

// --- The check -----------------------------------------------------------------------------------------------------------
export function createCheck() {
  return {
    t: 0, over: false, score: 0,
    readings: new Map(), // car id → { kmh, excess, t }
    laser: { phase: 'idle', target: null, lock: 0, kmh: null, dist: null, error: null, shown: 0, carId: null },
    stop: null, // { id, phase: 'braking' | 'stopped', decel, kmh (null: not measured), excess, t, unseen, atCar }
    lastSpeeder: -RADAR.every * 0.6, speederIndex: 0, borderIndex: 0,
    counts: { readings: 0, offenders: 0, stops: 0, wrongStops: 0, fines: 0, rightFines: 0, wrongFines: 0, missed: 0 },
    msg: null, // { text, points, t }
    log: []
  };
}

function award(check, points, text) {
  check.score += points;
  check.msg = { text, points, t: check.t };
  check.log.push({ t: check.t, points, text });
}

/** How fast the stopped car may still go `s` along the road: braking evenly to the stop point */
export function brakeSpeed(stop, s) {
  return Math.sqrt(2 * stop.decel * Math.max(0, STOP_S - s));
}

function startMeasure(check, r) {
  const L = check.laser;
  const hit = laserTarget(r.cars, r.eye, r.aim);
  L.phase = 'error'; L.shown = 0; L.kmh = null; L.target = null; L.lock = 0;
  if (!hit) { L.error = 'NO TARGET'; L.dist = null; return; }
  L.dist = hit.d;
  if (hit.d < RADAR.rangeMin || hit.d > RADAR.rangeMax) { L.error = 'RANGE'; return; }
  L.phase = 'lock'; L.error = null; L.target = hit.car.id;
}

function stepLaser(check, r, dt) {
  const L = check.laser;
  if (r.input?.measure && r.laserOn && L.phase !== 'lock') startMeasure(check, r);
  if (L.phase === 'lock') {
    const car = r.cars.find((c) => c.id === L.target);
    const d = car ? Math.hypot(car.x - r.eye.x, car.z - r.eye.z) : Infinity;
    if (!car || d < RADAR.rangeMin || d > RADAR.rangeMax) { L.phase = 'error'; L.error = car ? 'RANGE' : 'LOST'; L.target = null; L.shown = 0; return; }
    L.dist = d;
    L.lock += dt;
    if (L.lock >= RADAR.lockTime) {
      const v = radialSpeed(car, r.eye.x, r.eye.z);
      if (v <= 0.3) { L.phase = 'error'; L.error = 'RECEDING'; L.target = null; L.shown = 0; return; }
      const kmh = readingKmh(v), excess = excessOf(kmh);
      L.phase = 'shown'; L.kmh = kmh; L.shown = 0; L.carId = car.id; L.target = null;
      const prev = check.readings.get(car.id);
      check.readings.set(car.id, { kmh, excess, t: check.t });
      check.counts.readings++;
      // (no points for a reading itself: the display says nothing about the offence, the officer judges)
      if (excess >= 1 && !(prev?.excess >= 1)) check.counts.offenders++;
    }
  } else if (L.phase === 'shown' || L.phase === 'error') {
    L.shown += dt;
    if (L.shown > RADAR.shownTime) { L.phase = 'idle'; L.error = null; }
  }
}

/** The stop sign: the car it is shown to (the one just measured if it is still coming, else the nearest coming), or a
 *  reason why none stops */
export function stopCandidate(check, r) {
  const ok = [];
  for (const c of r.cars) {
    const f = roadFrame(c.x, c.z);
    const d = Math.hypot(c.x - r.eye.x, c.z - r.eye.z);
    if (f.off > 7 || f.s > RADAR.siteS - 4 || d < RADAR.stopRange[0] || d > RADAR.stopRange[1] || c.speed < 0.5) continue;
    ok.push({ car: c, s: f.s, d });
  }
  if (!ok.length) return null;
  const last = ok.find((o) => o.car.id === check.laser.carId);
  return last || ok.reduce((a, b) => (b.d < a.d ? b : a));
}

function raiseStopSign(check, r) {
  if (check.stop) { check.msg = { text: de() ? 'Erst den angehaltenen Wagen erledigen' : 'Deal with the stopped car first', points: 0, t: check.t }; return; }
  const c = stopCandidate(check, r);
  if (!c) { check.msg = { text: de() ? 'Kein Wagen in Reichweite der Kelle' : 'No car in reach of the stop sign', points: 0, t: check.t }; return; }
  const room = STOP_S - c.s, v = c.car.speed;
  const decel = (v * v) / (2 * Math.max(room, 0.1));
  if (room < 15 || decel > RADAR.maxDecel) {
    check.msg = { text: de() ? 'Zu spät: Der Wagen kann nicht mehr anhalten' : 'Too late: the car cannot stop in time', points: 0, t: check.t };
    return;
  }
  const reading = check.readings.get(c.car.id) || null;
  check.stop = { id: c.car.id, phase: 'braking', decel: Math.max(decel, 1.2), kmh: reading?.kmh ?? null, excess: reading?.excess ?? null, t: 0, unseen: 0, atCar: false };
  check.counts.stops++;
  const P = RADAR.points;
  if (!reading) { check.counts.wrongStops++; award(check, P.stopBlind, de() ? 'Ohne Messung angehalten' : 'Stopped without a reading'); }
  else if (reading.excess < 1) { check.counts.wrongStops++; award(check, P.stopWrong, de() ? `Innerhalb der Toleranz angehalten (${reading.kmh} km/h)` : `Stopped within the tolerance (${reading.kmh} km/h)`); }
  else award(check, P.stop, de() ? `Raser angehalten: ${reading.kmh} km/h` : `Speeder stopped: ${reading.kmh} km/h`);
}

/** The officer's decision at the car: 0 lets the driver go, 1-4 the fine */
function decide(check, k) {
  const st = check.stop, right = st.excess == null ? 0 : fineFor(st.excess), P = RADAR.points;
  const name = (key) => (de() ? FINES[key - 1].de : FINES[key - 1].label);
  if (right === 0) {
    if (k === 0) award(check, P.letGoInnocent, de() ? 'Richtig: keine Übertretung, gute Fahrt' : 'Right: no offence, the driver goes on');
    else { check.counts.wrongFines++; award(check, P.fineInnocent, de() ? 'Busse ohne Übertretung' : 'A fine without an offence'); }
  } else if (k === right) {
    check.counts.fines++; check.counts.rightFines++;
    award(check, P.fine, de() ? `Richtig: ${name(k)} für ${st.excess} km/h zu schnell` : `Right: ${name(k)} for ${st.excess} km/h over`);
  } else if (k === 0) {
    check.counts.missed++;
    award(check, 0, de() ? 'Raser laufen gelassen' : 'Speeder let go');
  } else {
    check.counts.fines++; check.counts.wrongFines++;
    award(check, P.fineWrong, de() ? `Falsche Busse: ${st.excess} km/h zu schnell wären ${name(right)}` : `Wrong fine: ${st.excess} km/h over is ${name(right)}`);
  }
  check.stop = null;
}

function stepStop(check, r, dt) {
  const st = check.stop;
  if (!st) return;
  st.t += dt;
  const car = r.cars.find((c) => c.id === st.id);
  if (!car) {
    st.unseen += dt;
    if (st.unseen > RADAR.lost) { check.stop = null; check.msg = { text: de() ? 'Der Wagen ist weg' : 'The car is gone', points: 0, t: check.t }; }
    return;
  }
  st.unseen = 0;
  const f = roadFrame(car.x, car.z);
  if (st.phase === 'braking' && (car.speed < 0.3 || f.s >= STOP_S - 0.5)) st.phase = 'stopped';
  st.atCar = st.phase === 'stopped' && r.player?.mode === 'person' && Math.hypot(r.player.x - car.x, r.player.z - car.z) <= RADAR.fineReach;
  if (st.atCar && r.input?.fine != null) decide(check, r.input.fine);
}

/** One frame of the check (ctx.radar `r`) */
export function stepCheck(check, r, dt) {
  if (check.over) return check;
  check.t += dt;
  if (r) {
    stepLaser(check, r, dt);
    if (r.input?.stop) raiseStopSign(check, r);
    stepStop(check, r, dt);
  }
  if (check.t >= RADAR.length && (!check.stop || check.t >= RADAR.length + RADAR.overtime)) {
    check.over = true;
    check.stop = null;
  }
  return check;
}

// --- The mission -------------------------------------------------------------------------------------------------------
const RADAR_PARK_S = 1.5, RADAR_SETUP_S = 3;

export const RADAR_MISSION = {
  id: 'radar-talstrasse',
  title: 'Police: speed check on the Talstrasse',
  intro: 'The Kantonspolizei Graubünden is checking speeds on the Talstrasse between Davos Platz and Davos Dorf: 50 km/h. Drive the patrol car to the verge, get out (F) and set up the laser on its tripod. Looking through it (Q), aim at an oncoming car (drag or A/D) and measure with Space: 30 to 300 m away, the laser needs a moment on the car. Over 53 km/h (the tolerance is 3 km/h) is an offence: raise the stop sign (E) while the car is still coming, walk to it and hand out the right fine (1-4): 1-5 km/h over CHF 40, 6-10 CHF 120, 11-15 CHF 250, 16 and more a report. Let a driver within the tolerance go (0). Four minutes.',
  mode: 'car',
  season: null, // (all year: the laser works in the snow too)
  time: 'midday',
  features: ['policeCar', 'radarCheck'],
  allowModes: ['car', 'person'],
  scoreMode: true,
  medals: RADAR.medals,
  colour: '#3f8bff',
  icon: 'radar',
  finish: 'End of the check: the laser is packed, the readings go to the Kantonspolizei in Chur.',
  start: RADAR_START,
  pin: { x: RADAR_START.x, z: RADAR_START.z },
  props: [],
  createState() { return { check: createCheck(), park: 0, setup: 0 }; },
  update(ctx, state) {
    // (the check runs while its step is on: js/missions-radar.js hands the frame over as ctx.radar)
    if (ctx.radarStep === 'check') stepCheck(state.check, ctx.radar || null, ctx.dt);
  },
  score: (state) => Math.round(state.check?.score ?? 0),
  summary(state) {
    const c = state.check?.counts;
    if (!c) return [];
    return de()
      ? [`${c.readings} Messungen · ${c.offenders} Raser gemessen · ${c.stops} angehalten (${c.wrongStops} zu Unrecht) · ${c.rightFines} von ${c.fines} Bussen richtig`]
      : [`${c.readings} readings · ${c.offenders} speeders measured · ${c.stops} stopped (${c.wrongStops} wrongly) · ${c.rightFines} of ${c.fines} fines right`];
  },
  objectives: [
    {
      id: 'drive',
      title: 'Drive to the speed check on the Talstrasse',
      check(ctx, state) {
        const here = Math.hypot(ctx.x - PATROL_BAY.x, ctx.z - PATROL_BAY.z) <= PATROL_BAY.r && Math.abs(ctx.speed || 0) < 0.5 && ctx.mode === 'car';
        state.park = here ? state.park + ctx.dt : 0;
        return { done: state.park >= RADAR_PARK_S, progress: here ? Math.min(1, state.park / RADAR_PARK_S) : null, text: here ? 'Parked on the verge …' : 'Park on the verge beside the Talstrasse', target: { x: PATROL_BAY.x, z: PATROL_BAY.z, r: PATROL_BAY.r }, hint: null };
      }
    },
    {
      id: 'setup',
      title: 'Set up the laser on its tripod',
      check(ctx, state) {
        const onFoot = ctx.mode === 'person';
        const here = onFoot && Math.hypot(ctx.x - LASER_SPOT.x, ctx.z - LASER_SPOT.z) <= LASER_SPOT.r && Math.abs(ctx.speed || 0) < 0.6;
        state.setup = here ? state.setup + ctx.dt : 0;
        const text = !onFoot ? 'Get out: F' : here ? 'Setting up the laser …' : 'Walk to the marked spot beside the road';
        return { done: state.setup >= RADAR_SETUP_S, progress: here ? Math.min(1, state.setup / RADAR_SETUP_S) : null, text, target: { x: LASER_SPOT.x, z: LASER_SPOT.z, r: LASER_SPOT.r, style: 'hazard' }, hint: null };
      }
    },
    {
      id: 'check',
      title: 'Measure the oncoming cars, stop the speeders',
      check(ctx, state) {
        const c = state.check;
        const st = c.stop;
        const text = st?.atCar ? 'At the car: choose the fine (1-4) or let the driver go (0)'
          : st?.phase === 'stopped' ? 'Walk to the stopped car'
          : st ? 'The car is pulling over …'
          : c.t >= RADAR.length ? 'Time is up'
          : 'Measure with the laser (Q), stop speeders with the stop sign (E)';
        const target = st?.phase === 'stopped' && !st.atCar ? { x: STOP_POINT.x, z: STOP_POINT.z, r: 4, style: 'hazard' } : null;
        return { done: c.over, progress: Math.min(1, c.t / RADAR.length), text, target, hint: null };
      }
    }
  ]
};

export const RADAR_MISSIONS = [RADAR_MISSION];
