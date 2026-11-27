import { msg } from './messages.js';
// js/missions-data-samd.js
// The long break on the roof of the SAMD (js/missions-data.js spreads SAMD_MISSIONS into MISSIONS; js/missions-samd.js
// has its runtime: the view over the parapet, the reticle on the yard, the gob in flight, the walkers below, their
// splats and shouts, the HUD). Its definition and the pure logic behind it, three.js-free like the other packages
// (tests/missions-samd.test.mjs drops gobs into the wind, leads the walkers, fills the suspicion and plays a bot).
//
//   samd-dach  All year, a school morning. The SAMD, the Schweizerische Alpine Mittelschule Davos on the Guggerbachstrasse
//              in Davos Platz: a private Gymnasium with boarding houses, pupils from all over Switzerland and abroad.
//              Its main building (OSM w1390001415, "SAMD Hauptgebäude (Gebäude A)") has a flat roof; to its north the
//              yard runs across to the Aula (w225913310), the drive comes in from the Schulstrasse, and the morning's
//              long break fills it. Two boarders, Gian (from the Prättigau, the quiet one with the aim) and Mätti (from
//              Zürich, the mouth), slip up the stairs and through the roof hatch and lie at the parapet. Gian spits: the
//              reticle on the yard is where a gob lands in still air; holding hocks a bigger one (slower out of the
//              mouth, more points, it drifts less), letting go drops it. It falls two seconds from the 20 m roof, the
//              walkers walk on meanwhile (lead them) and the wind carries it (the arrow). A hit: a comic splat and a shout up at the
//              roof; a run of hits multiplies the points. The dog, the Chindsgi kid from the Kindergarten Guggerbach
//              round the corner and the Hausmutter of the boarding house cost points. Every hit makes the yard look up:
//              the suspicion rises, faster while the hit ones are still staring at the roof; duck behind the parapet
//              and it calms down. Full, and the Hausmeister comes up the hatch: the break ends there (−150 for the
//              detention). Otherwise the bell ends it after two and a half minutes.
//
// The frame (js/davos-frame.js: x = E − 2782500, z = 1185500 − N): the yard is laid out along the main building's north
// facade (its segment from (−526.9, 76.2) to (−514.7, 81.1)): u along the facade towards the east-north-east, v out from
// it over the yard. The roof is the west half of the six-storey block as js/samd.js builds it (js/samd-data.js
// SAMD.roof): the boys lie at its edge, 20 m over the yard.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
const fmtClock = (s) => { const n = Math.max(0, Math.ceil(s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
export const SAMD_ID = 'samd-dach';

/** The yard's frame: the origin on the facade under the boys, U along it, V out over the yard */
const FACADE = { ax: -526.9, az: 76.2, bx: -514.7, bz: 81.1 };
const FL = Math.hypot(FACADE.bx - FACADE.ax, FACADE.bz - FACADE.az);
export const ROOF = {
  x: (FACADE.ax + FACADE.bx) / 2, z: (FACADE.az + FACADE.bz) / 2, // (the facade segment's middle)
  U: { x: (FACADE.bx - FACADE.ax) / FL, z: (FACADE.bz - FACADE.az) / FL }, V: { x: (FACADE.bz - FACADE.az) / FL, z: -(FACADE.bx - FACADE.ax) / FL },
  height: 20.1, // m: the roof's edge (js/samd-data.js SAMD.roof.top, y 9.4) over the yard's ground at the facade (y −10.7)
  eyeBack: -0.3, eyeUp: 0.55, // m: the eye over the roof, lying at its edge with the head out over the yard (behind the edge the roof itself
  // fills the view down: at 0.6 m back everything steeper than 42° is roof, and the yard's middle lies 48° down)
  duckDown: 0.45 // m: ducked, the head drops behind the parapet (and the eyes go up to the sky)
};
/** A point of the yard's frame in the world */
export const yardToWorld = (u, v) => ({ x: ROOF.x + ROOF.U.x * u + ROOF.V.x * v, z: ROOF.z + ROOF.U.z * u + ROOF.V.z * v });
/** A world point in the yard's frame */
export const worldToYard = (x, z) => { const dx = x - ROOF.x, dz = z - ROOF.z; return { u: dx * ROOF.U.x + dz * ROOF.U.z, v: dx * ROOF.V.x + dz * ROOF.V.z }; };
/** The eye at the roof's edge: over the facade's middle, the head out over the yard (ground: the yard's ground there) */
export function eyeAt(groundAt, ducked = false) {
  const p = yardToWorld(0, -ROOF.eyeBack);
  return { x: p.x, y: groundAt(ROOF.x, ROOF.z) + ROOF.height + ROOF.eyeUp - (ducked ? ROOF.duckDown : 0), z: p.z };
}

// The walk to the hatch: from the end of the Guggerbachstrasse across the yard to the side door by the drive
export const START = { x: -551.5, z: 57.5, heading: 0.9 };
export const DOOR = { x: -531.2, z: 72.6, r: 2.2 };

export const SPIT = {
  breakS: 150, // s: the long break, bell to bell
  g: 9.81,
  hockS: 1.1, // s held to a full hock
  chokeS: 3.2, // s held: it goes down the wrong way (a coughing fit: lost, and the yard hears it)
  chokeSus: 0.12,
  reloadS: 0.7, // s after a spit before the next one is collected
  down: { quick: 3.6, full: 0.3 }, // m/s out of the mouth, downwards: a quick spit to a full hock
  vMax: 10, // m/s across: further out the gob is lobbed (longer in the air)
  drift: { quick: 0.62, full: 0.26 }, // 1/s: how much of the wind's speed a second it takes on (a small gob more)
  hitR: { quick: 0.36, full: 0.6 }, // m round the walker's shoulders that a falling gob catches
  nearR: 1.6, // m: a splat this close to someone is a near miss (they look round)
  range: { uMin: -30, uMax: 30, vMin: 4, vMax: 32 }, // the yard the reticle may go to
  maxGobs: 3,
  comboStep: 0.25, comboMax: 3,
  sus: { decay: 0.03, duckDecay: 0.14, stare: 0.045, near: 0.03, warn: 0.7 }, // per s, and per staring walker per s
  caughtPenalty: 150,
  reactS: 2.6, // s a hit walker stands and shouts up
  stareS: 5.5 // s they keep looking up at the roof after it
};

/** The people (and the dog) of the yard: points (negative: hands off), suspicion a hit adds, speed, height and girth */
export const ROLES = {
  pupil: { label: 'Pupil', points: 10, sus: 0.1, speed: [1.15, 1.5], height: 1.72, r: 0.26, paths: ['street', 'yard', 'aula'], lines: ['Hey! Who was that?!', 'Gross, it\'s in my hair!', 'Not funny, guys!'] },
  teacher: { label: 'Teacher', points: 25, sus: 0.18, speed: [0.95, 1.1], height: 1.76, r: 0.28, paths: ['aula', 'drive', 'yard'], lines: ['My coffee! Who did that?', 'I\'ll find out who you are!'] },
  rektor: { label: 'Rektor', points: 60, sus: 0.3, speed: [0.85, 0.9], height: 1.8, r: 0.3, paths: ['aula'], lines: ['Unheard of! To my office, at once!', 'Hey, you clown!'] },
  tourist: { label: 'Tourist', points: 20, sus: 0.07, speed: [0.75, 0.95], height: 1.74, r: 0.28, paths: ['far', 'yard'], lines: ['Is it raining? The sun is out!', 'Disgusting! And on holiday!'] },
  cyclist: { label: 'Cyclist', points: 40, sus: 0.12, speed: [5.2, 6.2], height: 1.9, r: 0.45, paths: ['bike'], lines: ['Whoa, what was that?!'] },
  dog: { label: 'Bläss, the caretaker\'s dog', points: -30, sus: 0.22, speed: [1.6, 2.1], height: 0.6, r: 0.35, paths: ['street', 'yard', 'far'], lines: ['Woof! Woof!'], forbidden: true },
  toddler: { label: 'Chindsgi kid', points: -50, sus: 0.2, speed: [0.6, 0.75], height: 1.0, r: 0.2, paths: ['far', 'yard'], lines: ['Waaah! Mummy!'], forbidden: true },
  hausmutter: { label: 'Hausmutter', points: -40, sus: 0.25, speed: [0.9, 1.0], height: 1.66, r: 0.3, paths: ['street', 'drive'], lines: ['Just you wait! No cake on Sunday!'], forbidden: true }
};
const ROLE_WEIGHTS = [['pupil', 46], ['teacher', 12], ['tourist', 11], ['cyclist', 8], ['dog', 8], ['toddler', 7], ['hausmutter', 6]];
/** The Rektor crosses the yard three times a break (s after the bell) */
export const REKTOR_AT = [18, 66, 112];
/** Mätti's lines at the parapet */
export const SIDEKICK = {
  hit: ['Bull\'s eye!', 'Right on the head!', 'Ha, look at him!'],
  combo: ['Unstoppable!', 'Gian, you\'re a legend!'],
  rektor: ['THE REKTOR! Legendary!'],
  forbidden: ['Not the dog, man!', 'Not the little ones!', 'Are you crazy? No cake now!'],
  miss: ['Missed.', 'Lead them, Gian!', 'Mind the wind!'],
  warn: ['Footsteps on the stairs! Duck!'],
  choke: ['Swallowed it? Gross!']
};

/** The walkers' ways across the yard, in the yard's frame ([u, v] corners) */
export const PATHS = {
  street: [[-26, 15], [26, 16.5]], // (along the drive under the facade's trees)
  yard: [[26, 22], [4, 24], [-26, 21]], // (across the open yard in the sun)
  aula: [[-16, 13.5], [-6, 20], [8, 28.5]], // (the side door to the Aula)
  drive: [[-18, 13], [-12, 20], [-24, 29]], // (the drive out to the Schulstrasse)
  bike: [[-34, 16], [-5, 17], [32, 15]], // (the bike along the drive)
  far: [[-24, 27.5], [0, 29], [24, 27]] // (the far side, by the Aula)
};

/** A small seeded random source (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
/** The gob's make-up for a hock of `c` (0 a quick spit .. 1 a full hock) */
export const gobOf = (c) => ({ down: lerp(SPIT.down.quick, SPIT.down.full, c), drift: lerp(SPIT.drift.quick, SPIT.drift.full, c), hitR: lerp(SPIT.hitR.quick, SPIT.hitR.full, c), size: 1 + c });

/** The wind at time t (s): a slow swing of the direction round the day's and gusts; { x, z } m/s and its speed */
export function windAt(w, t) {
  const speed = Math.max(0, w.base + w.gust * Math.sin(t * 0.37 + w.ph) * Math.sin(t * 0.11 + 1.3 * w.ph));
  const dir = w.dir + 0.5 * Math.sin(t * 0.05 + w.ph);
  return { x: Math.sin(dir) * speed, z: Math.cos(dir) * speed, speed, dir };
}

/** A gob leaving the mouth at `eye` for the still-air landing point `aim` ({ x, y, z }): in still air it comes down
 *  there; further out than vMax allows it is lobbed (a longer flight). Hock `c` 0..1 */
export function launchGob(eye, aim, c = 0) {
  const k = gobOf(c), g = SPIT.g;
  const dx = aim.x - eye.x, dz = aim.z - eye.z, dist = Math.hypot(dx, dz), h = eye.y - aim.y;
  let T = (-k.down + Math.sqrt(k.down * k.down + 2 * g * Math.max(0.1, h))) / g, vy = -k.down;
  if (dist / T > SPIT.vMax) { T = dist / SPIT.vMax; vy = (0.5 * g * T * T - h) / T; }
  return { x: eye.x, y: eye.y, z: eye.z, vx: dx / T, vy, vz: dz / T, c, ...k, t: 0, T, aim: { x: aim.x, z: aim.z } };
}

/** One step of a gob: gravity, the wind's pull across; true when it has reached the ground (lying there) */
export function stepGob(gob, dt, wind, groundAt) {
  gob.t += dt;
  gob.vx += gob.drift * wind.x * dt;
  gob.vz += gob.drift * wind.z * dt;
  gob.vy -= SPIT.g * dt;
  gob.px = gob.x; gob.py = gob.y; gob.pz = gob.z;
  gob.x += gob.vx * dt; gob.y += gob.vy * dt; gob.z += gob.vz * dt;
  const g = groundAt(gob.x, gob.z);
  if (gob.y <= g) { gob.y = g; return true; }
  return false;
}

/** Where a gob spat now comes down with a steady wind: { x, z, t } */
export function predictGob(eye, aim, c, wind, groundAt, dt = 1 / 120) {
  const gob = launchGob(eye, aim, c);
  while (!stepGob(gob, dt, wind, groundAt) && gob.t < 10);
  return { x: gob.x, z: gob.z, t: gob.t };
}

/** The reticle kept on the yard */
export function clampAim(x, z) {
  const { uMin, uMax, vMin, vMax } = SPIT.range;
  const y = worldToYard(x, z);
  return yardToWorld(clamp(y.u, uMin, uMax), clamp(y.v, vMin, vMax));
}

// --- The walkers --------------------------------------------------------------------------------------------------------
function pathWorld(name, reverse) {
  const pts = PATHS[name].map(([u, v]) => yardToWorld(u, v));
  if (reverse) pts.reverse();
  let s = 0;
  const out = pts.map((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); return { ...p, s }; });
  return out;
}
/** The point at arc length s of a path, and its heading (yaw: atan2(dx, dz)) */
export function pathPoint(path, s) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (s <= b.s || i === path.length - 1) {
      const L = b.s - a.s || 1, t = clamp((s - a.s) / L, 0, 1);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z) };
    }
  }
  return { x: path[0].x, z: path[0].z, heading: 0 };
}

let nextId = 1;
/** A walker of `role` on one of its paths (or `pathName`), at its start */
export function createWalker(role, rand, { pathName = null, reverse = null, s = 0 } = {}) {
  const R = ROLES[role];
  const name = pathName || R.paths[Math.floor(rand() * R.paths.length)];
  const path = pathWorld(name, reverse ?? rand() < 0.5);
  const w = {
    id: nextId++, role, pathName: name, path, length: path.at(-1).s, s, speed: lerp(R.speed[0], R.speed[1], rand()),
    x: 0, z: 0, heading: 0, state: 'walk', stopAt: -1, stopT: 0, reactT: 0, stareT: 0, hit: false, line: null, seed: rand()
  };
  // (the tourists stop for a photo, the Rektor for a word: once, somewhere in the middle)
  if (role === 'tourist' || role === 'rektor') w.stopAt = w.length * lerp(0.35, 0.6, rand());
  const p = pathPoint(path, s);
  w.x = p.x; w.z = p.z; w.heading = p.heading;
  return w;
}

function stepWalker(w, dt, eye) {
  if (w.state === 'react') {
    w.reactT -= dt;
    w.heading = Math.atan2(eye.x - w.x, eye.z - w.z); // (facing the school, shouting up)
    if (w.reactT <= 0) { w.state = 'walk'; w.speed *= w.role === 'cyclist' ? 1 : 1.7; }
    w.stareT = Math.max(0, w.stareT - dt);
    return;
  }
  w.stareT = Math.max(0, w.stareT - dt);
  if (w.state === 'stop') { w.stopT -= dt; if (w.stopT <= 0) w.state = 'walk'; return; }
  w.s += w.speed * dt;
  if (w.stopAt >= 0 && w.s >= w.stopAt) { w.stopAt = -1; w.state = 'stop'; w.stopT = w.role === 'rektor' ? 4 : 3; }
  if (w.s >= w.length) { w.state = 'gone'; return; }
  const p = pathPoint(w.path, w.s);
  w.x = p.x; w.z = p.z; w.heading = p.heading;
}

// --- The break ----------------------------------------------------------------------------------------------------------
export function createBreak(seed = 1) {
  const rand = rng(seed);
  const st = {
    rand, t: 0, onRoof: false, over: false, bell: false, caught: false,
    wind: { base: 0.8 + rand() * 1.6, gust: 0.4 + rand() * 1.0, dir: rand() * Math.PI * 2, ph: rand() * 6 },
    windNow: { x: 0, z: 0, speed: 0, dir: 0 },
    walkers: [], spawnT: 0, rektors: 0, gobs: [],
    mouth: 'ready', hockT: 0, reloadT: 0, ducked: false,
    suspicion: 0, warned: false,
    points: 0, combo: 0, maxCombo: 0, spits: 0, hits: 0, misses: 0, forbidden: 0, rektorHits: 0, chokes: 0,
    note: null, noteT: 0, events: []
  };
  // (the yard is already busy when the boys look over)
  for (let i = 0; i < 6; i++) { const w = spawnOne(st); w.s = w.length * (0.1 + 0.8 * rand()); const p = pathPoint(w.path, w.s); w.x = p.x; w.z = p.z; w.heading = p.heading; }
  st.windNow = windAt(st.wind, 0);
  return st;
}
function pickRole(rand) {
  let r = rand() * ROLE_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  for (const [role, w] of ROLE_WEIGHTS) { if ((r -= w) < 0) return role; }
  return 'pupil';
}
function spawnOne(st, role = pickRole(st.rand), opts) {
  const w = createWalker(role, st.rand, opts);
  st.walkers.push(w);
  return w;
}
const say = (st, text, s = 2.5) => { st.note = text; st.noteT = s; };
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];
/** The multiplier of the n-th hit in a row */
export const comboMult = (n) => Math.min(SPIT.comboMax, 1 + SPIT.comboStep * Math.max(0, n - 1));

/** Space / the button held: Gian collects a gob (false: not now) */
export function startHock(st) {
  if (st.over || !st.onRoof || st.ducked || st.mouth !== 'ready' || st.gobs.length >= SPIT.maxGobs) return false;
  st.mouth = 'hocking'; st.hockT = 0;
  return true;
}
/** The hock so far, 0..1 */
export const hockLevel = (st) => (st.mouth === 'hocking' ? clamp(st.hockT / SPIT.hockS, 0, 1) : 0);
/** Let go: the gob drops towards the reticle `aim` ({ x, z }); the eye from eyeAt */
export function releaseHock(st, aim, groundAt) {
  if (st.mouth !== 'hocking') return null;
  const c = hockLevel(st);
  st.mouth = 'reload'; st.reloadT = SPIT.reloadS;
  const eye = eyeAt(groundAt);
  const a = clampAim(aim.x, aim.z);
  const gob = launchGob(eye, { x: a.x, y: groundAt(a.x, a.z), z: a.z }, c);
  st.gobs.push(gob);
  st.spits++;
  st.events.push({ kind: 'spit', c });
  return gob;
}
/** C / the button held: down behind the parapet (a hock in the mouth is lost) */
export function setDuck(st, on) {
  st.ducked = !!on && !st.over;
  if (st.ducked && st.mouth === 'hocking') { st.mouth = 'reload'; st.reloadT = SPIT.reloadS; }
}

function hitWalker(st, w, gob) {
  const R = ROLES[w.role];
  w.hit = true; w.state = 'react'; w.reactT = SPIT.reactS; w.stareT = SPIT.stareS;
  w.line = pick(st.rand, R.lines);
  let points;
  if (R.forbidden) {
    points = R.points;
    st.combo = 0; st.forbidden++;
    say(st, pick(st.rand, w.role === 'dog' ? [SIDEKICK.forbidden[0]] : w.role === 'toddler' ? [SIDEKICK.forbidden[1]] : [SIDEKICK.forbidden[2]]));
  } else {
    st.combo++; st.hits++;
    st.maxCombo = Math.max(st.maxCombo, st.combo);
    points = Math.round(R.points * gob.size * comboMult(st.combo));
    if (w.role === 'rektor') { st.rektorHits++; say(st, SIDEKICK.rektor[0]); } else say(st, pick(st.rand, st.combo >= 4 ? SIDEKICK.combo : SIDEKICK.hit));
  }
  st.points += points;
  // (bigger gobs are noticed more; ducked already when it lands, the yard looks up at an empty parapet: half)
  st.suspicion = Math.min(1.2, st.suspicion + R.sus * (1 + 0.35 * gob.c) * (st.ducked ? 0.5 : 1));
  st.events.push({ kind: 'hit', id: w.id, role: w.role, points, line: w.line, x: gob.x, y: gob.y, z: gob.z, combo: st.combo });
}

/** One frame of the break: the wind, the walkers (and new ones), the gobs falling (hits, splats), the hock, the
 *  suspicion, the bell. Events for the runtime pile up in st.events */
export function stepBreak(st, dt, groundAt) {
  if (st.noteT > 0 && (st.noteT -= dt) <= 0) st.note = null;
  const eye = eyeAt(groundAt);
  const live = st.onRoof && !st.over;
  if (live) st.t += dt;
  st.windNow = windAt(st.wind, st.t);
  // the walkers
  for (const w of st.walkers) stepWalker(w, dt, eye);
  st.walkers = st.walkers.filter((w) => w.state !== 'gone');
  if (!st.over) {
    st.spawnT -= dt;
    const busy = st.walkers.filter((w) => w.role !== 'cyclist').length;
    if (st.spawnT <= 0 && busy < 9) { spawnOne(st); st.spawnT = 1.6 + st.rand() * 2.4; }
    if (live && st.rektors < REKTOR_AT.length && st.t >= REKTOR_AT[st.rektors]) { spawnOne(st, 'rektor', { pathName: 'aula', reverse: st.rektors % 2 === 1 }); st.rektors++; st.events.push({ kind: 'rektor' }); }
  }
  // the gobs
  for (let i = st.gobs.length - 1; i >= 0; i--) {
    const gob = st.gobs[i];
    let done = false;
    for (let k = 0; k < 4 && !done; k++) {
      const landed = stepGob(gob, dt / 4, st.windNow, groundAt);
      for (const w of st.walkers) {
        if (w.hit) continue;
        const R = ROLES[w.role], gy = groundAt(w.x, w.z);
        if (gob.y > gy + R.height + 0.05 || Math.hypot(gob.x - w.x, gob.z - w.z) > R.r + gob.hitR) continue;
        hitWalker(st, w, gob); done = true; break;
      }
      if (!done && landed) {
        done = true;
        st.misses++;
        const near = st.walkers.find((w) => !w.hit && Math.hypot(gob.x - w.x, gob.z - w.z) < SPIT.nearR);
        if (near) { near.stareT = Math.max(near.stareT, 2); st.suspicion = Math.min(1.2, st.suspicion + SPIT.sus.near); }
        if (st.combo >= 2 || st.rand() < 0.3) say(st, pick(st.rand, SIDEKICK.miss), 1.8);
        st.combo = 0;
        st.events.push({ kind: 'splat', x: gob.x, y: gob.y, z: gob.z, near: near ? near.id : null });
      }
    }
    if (done) st.gobs.splice(i, 1);
  }
  if (!live) return;
  // the hock
  if (st.mouth === 'hocking') {
    st.hockT += dt;
    if (st.hockT >= SPIT.chokeS) {
      st.mouth = 'reload'; st.reloadT = SPIT.reloadS * 2; st.chokes++;
      st.suspicion = Math.min(1.2, st.suspicion + SPIT.chokeSus);
      say(st, SIDEKICK.choke[0]);
      st.events.push({ kind: 'choke' });
    }
  } else if (st.mouth === 'reload' && (st.reloadT -= dt) <= 0) st.mouth = 'ready';
  // the suspicion: the staring ones see the boys unless they are down; it ebbs, faster ducked
  const staring = st.walkers.filter((w) => w.stareT > 0).length;
  st.suspicion += (st.ducked ? -SPIT.sus.duckDecay : staring * SPIT.sus.stare - SPIT.sus.decay) * dt;
  st.suspicion = clamp(st.suspicion, 0, 1.2);
  if (st.suspicion >= SPIT.sus.warn && !st.warned) { st.warned = true; say(st, SIDEKICK.warn[0], 3); st.events.push({ kind: 'warn' }); }
  if (st.suspicion < SPIT.sus.warn - 0.2) st.warned = false;
  if (st.suspicion >= 1) { st.over = true; st.caught = true; st.mouth = 'ready'; st.events.push({ kind: 'caught' }); return; }
  if (st.t >= SPIT.breakS) { st.over = true; st.bell = true; st.events.push({ kind: 'bell' }); }
}

/** The break's score: the points, less the detention when the Hausmeister caught them */
export const breakScore = (st) => Math.max(0, Math.round(st.points - (st.caught ? SPIT.caughtPenalty : 0)));

export const SAMD_MISSION = {
  id: SAMD_ID,
  title: 'From the roof of the SAMD',
  intro: 'A school morning at the SAMD, the Schweizerische Alpine Mittelschule on the Guggerbachstrasse. Gian and Mätti, two boarders with nothing better to do, slip up to the flat roof for the long break. Walk to the side door by the drive, then lie at the parapet: the yard below is full. Move the reticle with the mouse, a drag or W/A/S/D; hold the button or Space to hock (bigger: more points, slower out of the mouth), let go to drop it. It falls for two seconds: lead the walkers and mind the wind (the arrow). The Rektor scores most, the cyclist is fast. Hands off the dog, the Chindsgi kid and the Hausmutter. Every hit makes the yard look up: hold C to duck until it calms down, or the Hausmeister comes up the hatch. The bell rings after 2:30.',
  mode: 'person',
  season: null,
  time: 'morning', // (the long break, mid-morning: js/mission-windows.js opens it from dawn until an hour before noon)
  features: ['samdRoof'],
  scoreMode: true,
  scoreUnit: 'pts',
  // (the bot of tests/missions-samd.test.mjs, perfect lead and wind, full hocks, ducking when the yard stares, makes
  // 1000-1600; gold leaves a player room for the misses, silver and bronze any decent break)
  medals: { gold: 900, silver: 550, bronze: 250 },
  colour: '#7fbf3f',
  icon: 'spit',
  finish: 'Down the stairs before anyone asks questions. Five minutes later Gian and Mätti sit in the maths lesson as if nothing had happened, a little out of breath.',
  start: { x: START.x, z: START.z, heading: START.heading },
  pin: { x: START.x, z: START.z },
  props: [],
  createState() { return { brk: createBreak((Math.random() * 1e9) | 0) }; },
  score: (state) => (state.brk ? breakScore(state.brk) : 0),
  summary(state) {
    const b = state.brk;
    if (!b) return [];
    const lines = [msg('{g} {gobs} · {h} {hits} · best run ×{r} · the Rektor {k}× · {f} off limits', '{g} Rotzer · {h} Treffer · beste Serie ×{r} · der Rektor {k}× · {f}-mal tabu',
      { g: b.spits, gobs: b.spits === 1 ? 'gob' : 'gobs', h: b.hits, hits: b.hits === 1 ? 'hit' : 'hits', r: b.maxCombo, k: b.rektorHits, f: b.forbidden })];
    if (b.caught) lines.push(msg('Caught by the Hausmeister: −{n} for the detention', 'Vom Hausmeister erwischt: −{n} fürs Nachsitzen', { n: SPIT.caughtPenalty }));
    return lines;
  },
  objectives: [
    {
      id: 'sneak',
      title: 'Sneak to the side door',
      check(ctx) {
        const d = Math.hypot(ctx.x - DOOR.x, ctx.z - DOOR.z);
        return { done: d < DOOR.r, progress: null, text: msg('{d} to the side door of the SAMD', '{d} bis zur Seitentür der SAMD', { d: fmtDist(d) }), target: { ...DOOR, style: 'plain' }, hint: 'Up the stairs and through the roof hatch' };
      }
    },
    {
      id: 'break',
      title: 'The long break',
      allowModes: ['person'],
      check(ctx, state) {
        const b = state.brk;
        if (!b) return { done: false, progress: 0, text: 'Up on the roof …', target: null, hint: null };
        const left = SPIT.breakS - b.t;
        const text = b.combo >= 2
          ? msg('{p} pts · {left} left · combo ×{c}', '{p} Pkt. · noch {left} · Kombo ×{c}', { p: b.points, left: fmtClock(left), c: comboMult(b.combo).toFixed(2).replace(/0$/, '') })
          : msg('{p} pts · {left} left', '{p} Pkt. · noch {left}', { p: b.points, left: fmtClock(left) });
        const hint = (b.ducked ? 'Ducked: let the yard calm down' : b.suspicion >= SPIT.sus.warn ? 'They are looking up: duck (C)!' : b.mouth === 'hocking' ? 'Let go to drop it' : 'Hold to hock, let go to drop: lead them');
        return { done: b.over, progress: clamp(b.t / SPIT.breakS, 0, 1), text, target: null, hint };
      }
    }
  ]
};

export const SAMD_MISSIONS = [SAMD_MISSION];
