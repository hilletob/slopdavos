// js/missions-data-outdoor.js
// Two afternoons outdoors (js/missions-data.js spreads OUTDOOR_MISSIONS into MISSIONS; js/missions-outdoor.js has their
// runtime: the props, the input, the camera and the HUD). Like js/missions-data.js: no three.js and no DOM in here, so
// that tests/missions-outdoor.test.mjs plays both games on plain objects.
//
//  - seilpark-faerich: the rope park "Adventure Park Färich" (OSM w1386979568, alt_name Seilpark Färich) at the mouth of
//    the Flüela valley above Davos Dorf. On foot in the trees: platforms on real swissTLM3D tree sites, joined by a
//    wobbly bridge, a balance beam, a tyre traverse, a wilder bridge and a zipline. Judged by time; a forgotten carabiner
//    and a fall cost time, so a clean run is what earns gold. (Which obstacle hangs where is invented: only the park's
//    outline, the hut and the trees are real.)
//  - seehofseeli-hockey: pond hockey on the Seehof Seeli (OSM w37389726, natural=water) in Davos Dorf at dusk: 3 on 3
//    against the locals, boots and jackets for goal posts, first to five or three minutes. Judged by the goal lead.
//    The skating itself is js/missions-data-ice.js's hockey skater (js/missions-ice.js `skates`).
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z, south).
import { seededRandom } from './missions-data-ice.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const fmtClock = (s) => { const v = Math.max(0, Math.ceil(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };

// =====================================================================================================================
// 1. The rope park
// =====================================================================================================================
// The stations stand on swissTLM3D single trees (js/tlm-trees-data.js) inside the park's OSM outline; h: the deck's height
// over the ground. The `kind` is the crossing leaving that station (the last one's: the zipline to ROPE.landing).
export const ROPE_STATIONS = [
  { x: 1921, z: -1735, h: 5, kind: 'bridge', title: 'Wobbly bridge' },
  { x: 1918, z: -1721, h: 6, kind: 'beam', title: 'Balance beam' },
  { x: 1932, z: -1712, h: 7, kind: 'tyres', title: 'Tyre traverse' },
  { x: 1946, z: -1715, h: 8, kind: 'wild', title: 'The wild bridge' },
  { x: 1959, z: -1712, h: 9.5, kind: 'zip', title: 'Zipline finale' }
];
/**
 * How a crossing moves the walker. The lean θ (±1 falls) obeys θ'' = k·θ + force(t) + control·steer − damping·θ': the
 * further over, the harder it pulls; `force` is the crossing swinging under the feet, which walking excites.
 */
export const ROPE_KINDS = {
  bridge: { speed: 2.7, k: 1.5, force: 1.25, omega: 2.2 },
  beam: { speed: 2.3, k: 2.7, force: 0.55, omega: 1.3 },
  tyres: { speed: 2.5, k: 1.9, force: 0.25, omega: 2.0, kick: 1.5, step: 1.9 }, // (each tyre lands with a shove, left and right in turn)
  wild: { speed: 2.7, k: 1.9, force: 2.0, omega: 2.9 }
};
export const ROPE = {
  deckR: 1.4, // m: a deck's radius (the crossings leave from its edge)
  ladderR: 2.4, // m: at the ladder's foot this close, the climb begins
  climb: 1.8, // m/s up the ladder
  walk: 2.2, // m/s across a deck
  control: 5.2, // rad/s²: what A/D can do against the lean
  damping: 1.4,
  scoldMs: 8000, // a forgotten carabiner
  fallMs: 5000, // a fall (and the time hanging in the harness on top)
  crashMs: 3000, // into the mattress too fast
  dangleS: 2.6, // s of comic dangling before the guide winches you back
  backM: 1.5, // m back along the crossing you are set down
  graceS: 1.0, // s after the winch before the crossing swings again
  zip: { accel: 3.4, drag: 0.021, brake: 8.5, minSpeed: 1.6, softSpeed: 6, deck: 0.6, hang: 2.4, cableOverDeck: 3.0, brakeZone: 14 },
  landing: { x: 1992, z: -1706 },
  start: { x: 1904, z: -1734 }, // (below the hut; the skate bowl's pin stands in the same park, further east)
  medals: { gold: 46000, silver: 65000, bronze: 100000 }
};
const dirOf = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz); return { x: dx / L, z: dz / L, L }; };
/** The next point after station i (the next station, the zipline's landing) */
const nextOf = (i) => (i + 1 < ROPE_STATIONS.length ? ROPE_STATIONS[i + 1] : ROPE.landing);
/** Each station's way across: `in` where you arrive on the deck, `out` where the crossing leaves it, `dir` along the
 *  crossing, `len` of the crossing from edge to edge */
export const ROPE_LEGS = ROPE_STATIONS.map((s, i) => {
  const d = dirOf(s, nextOf(i));
  const from = i ? dirOf(ROPE_STATIONS[i - 1], s) : null;
  const toStart = dirOf(s, ROPE.start);
  const inn = from ? { x: s.x - from.x * ROPE.deckR, z: s.z - from.z * ROPE.deckR } : { x: s.x + toStart.x * ROPE.deckR, z: s.z + toStart.z * ROPE.deckR };
  const isZip = s.kind === 'zip';
  return { ...s, dir: d, in: inn, out: { x: s.x + d.x * ROPE.deckR, z: s.z + d.z * ROPE.deckR }, len: d.L - (isZip ? ROPE.deckR : 2 * ROPE.deckR) };
});
/** The ladder's foot: on the first tree, on the side the player comes from */
export const ROPE_LADDER = (() => {
  const s = ROPE_STATIONS[0], d = dirOf(s, ROPE.start);
  return { x: s.x + d.x * (ROPE.deckR + 0.5), z: s.z + d.z * (ROPE.deckR + 0.5), heading: Math.atan2(-d.x, -d.z) };
})();
export const ROPE_START_HEADING = Math.atan2(ROPE_LADDER.x - ROPE.start.x, ROPE_LADDER.z - ROPE.start.z);
// The guide's lines when a carabiner is forgotten (German in js/i18n.js)
export const ROPE_SCOLDS = [
  'The guide: Carabiners! BOTH of them!  +8 s',
  'The guide: Do you want to explain that to your mother? Clip in!  +8 s',
  'The guide: Two carabiners. It is not a suggestion.  +8 s'
];

export function createRopeGame(seed = 5) {
  return { stage: 'ground', st: 0, q: 0, s: 0, h: 0, clips: 0, sway: 0, swayV: 0, t: 0, phase: seededRandom(seed)() * 6, tyre: 0, kickSide: 1, grace: 0, dangle: 0, zipV: 0, cleared: 0, penaltyMs: 0, falls: 0, forgot: 0, crash: false, block: 0, events: [] };
}
export const ropeClean = (g) => g.falls === 0 && g.forgot === 0 && !g.crash;
/** Whether the player is up in the trees (the driver and the camera are the mission's own) */
export const ropeAloft = (g) => g.stage !== 'ground' && g.stage !== 'done';

/** One step of the balance on a crossing; returns the speed along it */
export function stepBalance(g, K, forward, steer, dt) {
  const v = clamp(forward, 0, 1) * K.speed * (1 - 0.45 * Math.min(1, Math.abs(g.sway)));
  g.t += dt;
  const excite = g.grace > 0 ? 0 : 0.35 + 0.65 * (v / K.speed);
  const force = K.force * Math.sin(K.omega * g.t + g.phase) * excite;
  const a = K.k * g.sway + force + ROPE.control * clamp(steer, -1, 1) - ROPE.damping * g.swayV;
  g.swayV += a * dt;
  g.sway += g.swayV * dt;
  g.grace = Math.max(0, g.grace - dt);
  return v;
}

/**
 * One step of the course. `inp`: { forward, back (0-1), steer (-1..1, positive: to the left), clip (the key went down this
 * frame), x, z (the walker on the ground) }. Events land in g.events: clip, scold, fall, winch, arrive, top, zip, soft, crash.
 */
export function stepRope(g, dt, inp) {
  const forward = +inp.forward || 0;
  if (g.stage === 'ground') {
    if (Math.hypot(inp.x - ROPE_LADDER.x, inp.z - ROPE_LADDER.z) <= ROPE.ladderR) { g.stage = 'climb'; g.h = 0; g.cleared = 1; }
    return g;
  }
  if (g.stage === 'climb') {
    g.h += forward * ROPE.climb * dt;
    if (g.h >= ROPE_STATIONS[0].h) { g.stage = 'deck'; g.st = 0; g.q = 0; g.clips = 0; g.cleared = 2; g.events.push({ kind: 'top' }); }
    return g;
  }
  if (g.stage === 'deck') {
    const leg = ROPE_LEGS[g.st];
    if (inp.clip && g.clips < 2) { g.clips++; g.events.push({ kind: 'clip', n: g.clips }); }
    g.block = Math.max(0, g.block - dt);
    const L = Math.max(0.3, Math.hypot(leg.out.x - leg.in.x, leg.out.z - leg.in.z));
    if (g.block <= 0) g.q = clamp(g.q + (forward - 0.6 * (+inp.back || 0)) * ROPE.walk * dt / L, 0, 1);
    if (g.q >= 1) {
      if (g.clips < 2) {
        // out on the edge without both: the guide's whistle, back onto the deck
        g.forgot++;
        g.penaltyMs += ROPE.scoldMs;
        g.q = 0.35;
        g.block = 0.9;
        g.events.push({ kind: 'scold', line: ROPE_SCOLDS[(g.forgot - 1) % ROPE_SCOLDS.length] });
      } else if (leg.kind === 'zip') {
        g.stage = 'zip'; g.s = 0; g.zipV = ROPE.zip.minSpeed; g.events.push({ kind: 'zip' });
      } else {
        g.stage = 'cross'; g.s = 0; g.sway = 0; g.swayV = 0; g.tyre = 0; g.grace = 0.3;
      }
    }
    return g;
  }
  if (g.stage === 'cross') {
    const leg = ROPE_LEGS[g.st], K = ROPE_KINDS[leg.kind];
    const v = stepBalance(g, K, forward, +inp.steer || 0, dt);
    g.s += (v - 0.5 * K.speed * (+inp.back || 0)) * dt;
    g.s = Math.max(0, g.s);
    if (K.kick) {
      const n = Math.floor(g.s / K.step);
      if (n > g.tyre) { g.tyre = n; g.kickSide = -g.kickSide; g.swayV += g.kickSide * K.kick; }
    }
    if (Math.abs(g.sway) >= 1) {
      g.stage = 'dangle'; g.dangle = 0; g.falls++; g.penaltyMs += ROPE.fallMs;
      g.events.push({ kind: 'fall', side: Math.sign(g.sway) });
      return g;
    }
    if (g.s >= leg.len) {
      g.st++; g.stage = 'deck'; g.q = 0; g.clips = 0; g.sway = 0; g.swayV = 0; g.cleared = 2 + g.st;
      g.events.push({ kind: 'arrive', st: g.st });
    }
    return g;
  }
  if (g.stage === 'dangle') {
    g.dangle += dt;
    if (g.dangle >= ROPE.dangleS) {
      g.stage = 'cross'; g.s = Math.max(0, g.s - ROPE.backM); g.sway = 0; g.swayV = 0; g.grace = ROPE.graceS;
      g.tyre = Math.floor(g.s / (ROPE_KINDS[ROPE_LEGS[g.st].kind].step || 1));
      g.events.push({ kind: 'winch' });
    }
    return g;
  }
  if (g.stage === 'zip') {
    const Z = ROPE.zip, leg = ROPE_LEGS[g.st];
    g.zipV += (Z.accel - Z.drag * g.zipV * g.zipV - Z.brake * (+inp.back || 0)) * dt;
    g.zipV = Math.max(Z.minSpeed, g.zipV);
    g.s += g.zipV * dt;
    if (g.s >= leg.len) {
      g.stage = 'done'; g.cleared = 3 + g.st;
      if (g.zipV > Z.softSpeed) { g.crash = true; g.penaltyMs += ROPE.crashMs; g.events.push({ kind: 'crash' }); } else g.events.push({ kind: 'soft' });
    }
  }
  return g;
}

/**
 * Where the walker is aloft: { x, y (feet), z, heading, cable (the safety cable's height there) }. `decks`: the decks'
 * heights (world y, one a station), `landY` the ground at the landing, `groundY` at the ladder's foot.
 */
export function ropePose(g, decks, landY, groundY) {
  const CABLE = 2.0;
  if (g.stage === 'climb') {
    return { x: ROPE_LADDER.x, y: groundY + g.h, z: ROPE_LADDER.z, heading: ROPE_LADDER.heading, cable: groundY + g.h + CABLE };
  }
  const leg = ROPE_LEGS[Math.min(g.st, ROPE_LEGS.length - 1)];
  if (g.stage === 'deck') {
    const dx = leg.out.x - leg.in.x, dz = leg.out.z - leg.in.z;
    const y = decks[g.st];
    return { x: leg.in.x + dx * g.q, y, z: leg.in.z + dz * g.q, heading: Math.hypot(dx, dz) > 0.2 ? Math.atan2(dx, dz) : Math.atan2(leg.dir.x, leg.dir.z), cable: y + CABLE };
  }
  const heading = Math.atan2(leg.dir.x, leg.dir.z);
  if (leg.kind === 'zip') {
    const Z = ROPE.zip, f = clamp(g.s / leg.len, 0, 1);
    const cable = decks[g.st] + Z.cableOverDeck + (landY + Z.hang + 0.2 - decks[g.st] - Z.cableOverDeck) * f;
    return { x: leg.out.x + leg.dir.x * g.s, y: cable - Z.hang, z: leg.out.z + leg.dir.z * g.s, heading, cable };
  }
  const f = clamp(g.s / leg.len, 0, 1);
  const y = decks[g.st] + (decks[g.st + 1] - decks[g.st]) * f;
  return { x: leg.out.x + leg.dir.x * g.s, y, z: leg.out.z + leg.dir.z * g.s, heading, cable: y + CABLE };
}

function deckText(g) {
  if (g.block > 0) return 'Clip both carabiners first!';
  if (g.clips < 2) return `Clip your carabiners: Space (${g.clips}/2)`;
  return ROPE_LEGS[g.st].kind === 'zip' ? 'Clipped: W, step off the deck' : 'Clipped: W, out onto the crossing';
}
const crossingObjective = (leg, i) => ({
  id: `crossing${i + 1}`,
  title: leg.title,
  check(ctx, g) {
    const done = g.cleared > 2 + i;
    if (g.stage === 'deck') return { done, progress: g.clips / 2, text: deckText(g), target: null, hint: 'Space: clip · W: walk' };
    if (g.stage === 'dangle') return { done, progress: null, text: 'Dangling in your harness: the guide winches you back', target: null, hint: null };
    return { done, progress: leg.len ? clamp(g.s / leg.len, 0, 1) : null, text: `${Math.max(0, Math.ceil(leg.len - g.s))} m to the next deck`, target: null, hint: 'A/D: lean against the sway · W: walk on' };
  }
});
const zipLeg = ROPE_LEGS[ROPE_LEGS.length - 1];

export const SEILPARK_MISSION = {
  id: 'seilpark-faerich',
  title: 'Rope park in the Färich',
  intro: `The Adventure Park Färich, in the trees at the mouth of the Flüela valley. Up the ladder, then from deck to deck: a wobbly bridge, a balance beam, a tyre traverse, a wilder bridge and the zipline. On every deck clip BOTH carabiners with Space (the Clip button) before you step off: forget it and the guide whistles you back, +${ROPE.scoldMs / 1000} s. On a crossing W walks and A/D lean against the sway. Fall and you only dangle in your harness, comically and unharmed, for +${ROPE.fallMs / 1000} s. On the zipline brake with S before the mattress. A clean run earns the gold.`,
  mode: 'person',
  season: 'summer',
  time: 'golden',
  features: ['ropePark'],
  medals: ROPE.medals,
  bonusMs: ROPE.medals.gold,
  colour: '#3f9d4a',
  icon: 'ropes',
  finish: 'Harness off, helmet off, the knees still a little soft.',
  start: { x: ROPE.start.x, z: ROPE.start.z, heading: ROPE_START_HEADING },
  props: [],
  createState() { return createRopeGame(Math.floor(Math.random() * 1e9)); },
  update() {},
  summary(g) {
    return [ropeClean(g) ? 'A clean run: no fall, no carabiner forgotten' : `${g.falls} ${g.falls === 1 ? 'fall' : 'falls'} · ${g.forgot} forgotten · ${g.crash ? 'mattress at full speed' : 'soft landing'}`];
  },
  objectives: [
    {
      id: 'ladder',
      title: 'Walk to the first tree',
      check(ctx, g) {
        const d = Math.hypot(ctx.x - ROPE_LADDER.x, ctx.z - ROPE_LADDER.z);
        return { done: g.cleared >= 1, progress: null, text: `${Math.round(d)} m to the ladder`, target: { x: ROPE_LADDER.x, z: ROPE_LADDER.z, r: ROPE.ladderR }, hint: null };
      }
    },
    {
      id: 'climb',
      title: 'Up the ladder',
      check(ctx, g) {
        return { done: g.cleared >= 2, progress: clamp(g.h / ROPE_STATIONS[0].h, 0, 1), text: 'Hold W to climb', target: null, hint: null };
      }
    },
    ...ROPE_LEGS.slice(0, -1).map(crossingObjective),
    {
      id: 'zipline',
      title: zipLeg.title,
      check(ctx, g) {
        const done = g.stage === 'done';
        if (g.stage === 'deck') return { done, progress: g.clips / 2, text: deckText(g), target: null, hint: 'Space: clip · W: walk' };
        const left = zipLeg.len - g.s;
        const braking = left < ROPE.zip.brakeZone;
        return { done, progress: clamp(g.s / zipLeg.len, 0, 1), text: `${Math.round(g.zipV * 3.6)} km/h · ${Math.max(0, Math.ceil(left))} m`, target: null, hint: braking ? 'S: brake now!' : 'S: brake before the mattress' };
      }
    }
  ]
};

// =====================================================================================================================
// 2. Pond hockey on the Seehof Seeli
// =====================================================================================================================
// The pond's outline as OSM has it (w37389726, the same ring as DAVOS_DATA.water "Seehof Seeli"; tests compare them)
export const POND_RING = [696.5, -1420.3, 697.1, -1416.8, 703.8, -1412.9, 710.8, -1406.7, 727, -1392.6, 730.7, -1389.8, 734.1, -1389.8, 736.7, -1391.3, 739.4, -1395.6, 743.4, -1399.4, 746.2, -1401, 750.1, -1405, 754.5, -1411.4, 756.2, -1415.7, 756.8, -1421.8, 754.8, -1427.5, 747.8, -1430.5, 740.5, -1433.6, 733.4, -1439.8, 728.3, -1444.9, 724.5, -1447.7, 720.3, -1448.4, 717.9, -1448.1, 716.5, -1447.4, 714.9, -1444.3, 713.9, -1443.5, 711.9, -1442.6, 709.3, -1443, 708.3, -1441.6, 706.8, -1439.8, 706, -1438.8, 707.1, -1437.6, 707.5, -1435.9, 706.6, -1433.7, 700.6, -1426];
export const POND = {
  centre: { x: 727, z: -1419 },
  goalW: 705, // the home goal's line (x): the team of the player defends it
  goalE: 749, // the goal the player attacks
  goalZ: -1419,
  postHalf: 1.0, // half the mouth between the boots
  firstTo: 5,
  clockS: 180,
  capS: 300, // (sudden death has to end some time)
  faceoffS: 1.6,
  goalS: 2.4,
  shotSpeed: 15,
  passSpeed: 10.5,
  friction: 1.5,
  pickupSlow: 1.15, // m: a loose puck slower than fastPuck is picked up this close
  pickupFast: 0.42,
  fastPuck: 7,
  bank: 1.0, // m the players and the puck stay inside the ring
  carry: 0.85,
  aiSpeed: [5.05, 4.75], // m/s: the player's mates, the locals (the player's skater reaches ~5.6)
  carrySlow: 0.85,
  spread: [0.75, 0.95], // m off the goal's middle a shot of theirs may aim
  stealRate: [0.55, 0.65], // /s a defender in reach takes the puck
  stealReach: 1.35,
  stealImmune: 0.9, // s after a takeaway
  humanStealReach: 2.0,
  humanStealChance: 0.75,
  humanStealCooldown: 0.6,
  medals: { gold: 3, silver: 2, bronze: 1 },
  start: { x: 712, z: -1419 },
  pin: { x: 691, z: -1421 },
  spot: { x: 727, z: -1419, r: 3.2 }
};

export function inPond(x, z, ring = POND_RING) {
  let inside = false;
  for (let i = 0, n = ring.length / 2, j = n - 1; i < n; j = i++) {
    const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}
/** The nearest point on the ring and the way into the pond from it */
function nearestOnRing(x, z, ring = POND_RING) {
  let best = null, bd = Infinity;
  for (let i = 0, n = ring.length / 2, j = n - 1; i < n; j = i++) {
    const ax = ring[j * 2], az = ring[j * 2 + 1], bx = ring[i * 2], bz = ring[i * 2 + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1) : 0;
    const qx = ax + dx * t, qz = az + dz * t, d = (qx - x) ** 2 + (qz - z) ** 2;
    if (d < bd) { bd = d; best = { x: qx, z: qz, d: Math.sqrt(d) }; }
  }
  return best;
}
/** Keeps p { x, z } inside the snow bank, `margin` m in from the ring. Returns the way back in { nx, nz } when it hit, else null */
export function containPond(p, margin = POND.bank) {
  const inside = inPond(p.x, p.z);
  const q = nearestOnRing(p.x, p.z);
  if (inside && q.d >= margin) return null;
  // (in from the ring: towards the pond's middle at the concave corners too, where a normal would point out again)
  let nx = inside ? p.x - q.x : q.x - p.x, nz = inside ? p.z - q.z : q.z - p.z;
  let L = Math.hypot(nx, nz);
  if (L < 1e-4) { nx = POND.centre.x - p.x; nz = POND.centre.z - p.z; L = Math.hypot(nx, nz); }
  nx /= L; nz /= L;
  p.x = q.x + nx * margin; p.z = q.z + nz * margin;
  if (!inPond(p.x, p.z)) {
    const cx = POND.centre.x - q.x, cz = POND.centre.z - q.z, c = Math.hypot(cx, cz);
    nx = cx / c; nz = cz / c; p.x = q.x + nx * margin; p.z = q.z + nz * margin;
  }
  return { nx, nz };
}
/** The bank round the pond: outside points at `off` m from the ring (spectators, lanterns) */
export function pondBankPoints(off, every = 3, ring = POND_RING) {
  const out = [];
  const n = ring.length / 2;
  for (let i = 0; i < n; i += every) {
    const x = ring[i * 2], z = ring[i * 2 + 1];
    const dx = x - POND.centre.x, dz = z - POND.centre.z, L = Math.hypot(dx, dz);
    const px = x + (dx / L) * off, pz = z + (dz / L) * off;
    out.push({ x: Math.round(px * 10) / 10, z: Math.round(pz * 10) / 10, yaw: Math.atan2(-dx, -dz) });
  }
  return out;
}
export const POND_POSTS = [POND.goalW, POND.goalE].flatMap((x) => [-1, 1].map((s) => ({ x, z: POND.goalZ + s * POND.postHalf })));

const FACEOFF_SPOTS = [
  { x: 725.5, z: -1419 }, { x: 716, z: -1408 }, { x: 709.5, z: -1419 }, // the player's team, defending the west end
  { x: 728.5, z: -1419 }, { x: 738, z: -1430 }, { x: 744.5, z: -1419 } // the locals
];

export function createPondGame(seed = 3) {
  const players = FACEOFF_SPOTS.map((s, i) => ({ i, team: i < 3 ? 0 : 1, x: s.x, z: s.z, heading: i < 3 ? Math.PI / 2 : -Math.PI / 2, speed: 0, immune: 0, gait: i * 1.3 }));
  return {
    rand: seededRandom(seed), players, puck: { x: POND.centre.x, z: POND.centre.z, vx: 0, vz: 0, holder: -1, owner: -1, ownerT: 0, passTo: -1 },
    phase: 'wait', t: 0, clock: 0, us: 0, them: 0, myGoals: 0, sudden: false, shots: 0, cooldown: 0, hold: 0, events: []
  };
}

/** Into the face-off: everyone to their spots, the puck on the centre spot (the human's skater is moved by the runtime on the event) */
function toFaceoff(g) {
  g.phase = 'faceoff'; g.t = 0;
  for (const p of g.players) {
    const s = FACEOFF_SPOTS[p.i];
    p.x = s.x; p.z = s.z; p.speed = 0; p.heading = p.team ? -Math.PI / 2 : Math.PI / 2; p.immune = 0;
  }
  Object.assign(g.puck, { x: POND.centre.x, z: POND.centre.z, vx: 0, vz: 0, holder: -1, owner: -1, ownerT: 0, passTo: -1 });
  g.events.push({ kind: 'faceoff', x: FACEOFF_SPOTS[0].x, z: FACEOFF_SPOTS[0].z, heading: Math.PI / 2 });
}
export function startPondGame(g) { if (g.phase === 'wait') toFaceoff(g); return g; }
export const pondScore = (g) => Math.max(0, g.us - g.them);
export const pondWon = (g) => g.us > g.them;

function release(g, holderIndex, heading, speed, passTo = -1) {
  const pk = g.puck;
  pk.holder = -1; pk.owner = holderIndex; pk.ownerT = 0.35; pk.passTo = passTo;
  pk.vx = Math.sin(heading) * speed; pk.vz = Math.cos(heading) * speed;
  g.hold = 0;
}
function knockLoose(g, victim) {
  const pk = g.puck, a = g.rand() * Math.PI * 2;
  pk.holder = -1; pk.owner = victim.i; pk.ownerT = 0.45; pk.passTo = -1;
  pk.vx = Math.sin(a) * 3.5; pk.vz = Math.cos(a) * 3.5;
  victim.immune = 0;
}
function shotBy(g, p, aimZ) {
  const goalX = p.team ? POND.goalW : POND.goalE;
  release(g, p.i, Math.atan2(goalX - p.x, aimZ - p.z), POND.shotSpeed);
  g.shots++;
  g.events.push({ kind: 'shot', team: p.team });
}
function passBy(g, p, to) {
  const m = g.players[to];
  const lead = 0.35;
  release(g, p.i, Math.atan2(m.x + Math.sin(m.heading) * m.speed * lead - p.x, m.z + Math.cos(m.heading) * m.speed * lead - p.z), POND.passSpeed, to);
  g.events.push({ kind: 'pass', team: p.team });
}
function moveAi(g, p, tx, tz, v, dt) {
  const d = Math.hypot(tx - p.x, tz - p.z);
  const want = d < 0.4 ? 0 : Math.min(v, d * 2.2);
  p.speed += clamp(want - p.speed, -8 * dt, 5 * dt);
  if (d > 0.1) p.heading = wrapAngle(p.heading + clamp(wrapAngle(Math.atan2(tx - p.x, tz - p.z) - p.heading), -4 * dt, 4 * dt));
  p.x += Math.sin(p.heading) * p.speed * dt;
  p.z += Math.cos(p.heading) * p.speed * dt;
  p.gait += p.speed * dt * 1.15;
  containPond(p);
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** The goal keeper's spot: on the line from the puck to the middle of his goal, just out from the boots */
function keeperSpot(team, pk) {
  const gx = team ? POND.goalE : POND.goalW, dir = team ? -1 : 1;
  const dx = pk.x - gx, dz = pk.z - POND.goalZ, L = Math.max(1, Math.hypot(dx, dz));
  return { x: gx + dir * Math.max(0.8, 1.6 * Math.abs(dx) / L), z: POND.goalZ + (dz / L) * 1.6 };
}

function stepAi(g, dt, pressCall) {
  const P = POND, pk = g.puck, pl = g.players;
  const holder = pk.holder >= 0 ? pl[pk.holder] : null;
  for (const team of [0, 1]) {
    const mates = pl.filter((p) => p.team === team && p.i !== 0);
    const keeper = team ? pl[5] : pl[2];
    const field = mates.filter((p) => p !== keeper);
    const v = P.aiSpeed[team];
    const foes = pl.filter((p) => p.team !== team);
    // the chaser: the field player nearest the puck (the keeper too once it lies near his goal and nobody else is closer)
    let chaser = field.slice().sort((a, b) => dist(a, pk) - dist(b, pk))[0];
    if (dist(keeper, pk) < 6 && dist(keeper, pk) < dist(chaser, pk) && !(holder && holder.team === team)) chaser = keeper;
    const own = holder && holder.team === team;
    for (const p of mates) {
      if (holder === p) {
        // with the puck: at the goal, round whoever stands in the way; shoot from close, pass under pressure
        const goalX = team ? P.goalW : P.goalE;
        const near = foes.slice().sort((a, b) => dist(a, p) - dist(b, p))[0];
        g.hold += dt;
        const toGoal = Math.hypot(goalX - p.x, P.goalZ - p.z);
        let tz = P.goalZ;
        if (near && dist(near, p) < 4) tz += (p.z >= near.z ? 1 : -1) * 3;
        moveAi(g, p, goalX, tz, v * P.carrySlow, dt);
        const mate = mates.find((m) => m !== p && m !== keeper) || (team === 0 ? pl[0] : null);
        const friend = team === 0 && g.rand() < 0.5 ? pl[0] : mate;
        if (toGoal < 10.5 && g.hold > 0.45) {
          shotBy(g, p, P.goalZ + (g.rand() * 2 - 1) * P.spread[team]);
        } else if (pressCall && team === 0) {
          passBy(g, p, 0);
        } else if (friend && friend !== p && near && dist(near, p) < 2.6 && g.hold > 0.3 && g.rand() < 1.3 * dt) {
          passBy(g, p, friend.i);
        }
        continue;
      }
      if (p === chaser && !own) {
        moveAi(g, p, pk.x, pk.z, v, dt);
        // the takeaway
        if (holder && holder.team !== team && dist(p, holder) < P.stealReach && holder.immune <= 0 && g.rand() < P.stealRate[team] * dt) {
          knockLoose(g, holder);
          p.immune = P.stealImmune;
          g.events.push({ kind: 'steal', team });
        }
        continue;
      }
      if (p === keeper) {
        const s = keeperSpot(team, pk);
        moveAi(g, p, s.x, s.z, v, dt);
        continue;
      }
      // the other field player: open, ahead of the puck, on the far side from it
      const dir = team ? -1 : 1;
      const tx = clamp(pk.x + dir * 7, 709, 745), tz = P.goalZ + (pk.z > P.goalZ ? -7 : 7);
      moveAi(g, p, tx, tz, v * 0.9, dt);
    }
  }
  // (nobody skates through anybody: the AI players are pushed apart)
  for (let a = 1; a < pl.length; a++) for (let b = 0; b < a; b++) {
    const A = pl[a], B = pl[b];
    const d = dist(A, B);
    if (d > 0.01 && d < 0.95) {
      const k = (0.95 - d) / d;
      A.x += (A.x - B.x) * k * 0.5; A.z += (A.z - B.z) * k * 0.5;
      if (b !== 0) { B.x += (B.x - A.x) * k * 0.5; B.z += (B.z - A.z) * k * 0.5; }
    }
  }
}

function scoreGoal(g, team, scorer) {
  if (team === 0) { g.us++; if (scorer === 0) g.myGoals++; } else g.them++;
  g.phase = 'goal'; g.t = 0;
  g.puck.vx *= 0.1; g.puck.vz *= 0.1; g.puck.holder = -1;
  g.events.push({ kind: 'goal', team, scorer });
}
function stepPuck(g, dt) {
  const P = POND, pk = g.puck, pl = g.players;
  pk.ownerT = Math.max(0, pk.ownerT - dt);
  if (pk.holder >= 0) {
    const h = pl[pk.holder];
    const c = Math.sin(h.heading), s = Math.cos(h.heading);
    pk.x = h.x + c * P.carry + s * 0.25; pk.z = h.z + s * P.carry - c * 0.25;
    pk.vx = pk.vz = 0;
    return;
  }
  const steps = 3, h = dt / steps;
  for (let k = 0; k < steps; k++) {
    const nx = pk.x + pk.vx * h, nz = pk.z + pk.vz * h;
    if (Math.abs(nz - P.goalZ) <= P.postHalf) {
      if (pk.x < P.goalE && nx >= P.goalE) { pk.x = nx; pk.z = nz; return scoreGoal(g, 0, pk.owner); }
      if (pk.x > P.goalW && nx <= P.goalW) { pk.x = nx; pk.z = nz; return scoreGoal(g, 1, pk.owner); }
    }
    pk.x = nx; pk.z = nz;
    const hit = containPond(pk, 0.5);
    if (hit) {
      // into the snow bank: most of the puck's speed stays in the snow
      const vn = pk.vx * hit.nx + pk.vz * hit.nz;
      if (vn < 0) { pk.vx -= 1.4 * vn * hit.nx; pk.vz -= 1.4 * vn * hit.nz; pk.vx *= 0.55; pk.vz *= 0.55; }
    }
  }
  const sp = Math.hypot(pk.vx, pk.vz);
  if (sp > 0) { const n = Math.max(0, sp - P.friction * dt) / sp; pk.vx *= n; pk.vz *= n; }
  // who gets it: anyone close to a slow puck; a fast one only the other team's body in its way, or whoever it was passed to
  const fast = sp > P.fastPuck;
  let best = null, bd = Infinity;
  for (const p of pl) {
    if (p.i === pk.owner && pk.ownerT > 0) continue;
    const ownerTeam = pk.owner >= 0 ? pl[pk.owner].team : -1;
    if (fast && p.team === ownerTeam && p.i !== pk.passTo) continue;
    const r = fast && p.i !== pk.passTo ? P.pickupFast : P.pickupSlow;
    const d = dist(p, pk);
    if (d < r && d < bd) { bd = d; best = p; }
  }
  if (best) {
    if (fast && best.team !== (pk.owner >= 0 ? pl[pk.owner].team : -1)) g.events.push({ kind: 'block', team: best.team });
    pk.holder = best.i; pk.owner = best.i; pk.passTo = -1; pk.vx = pk.vz = 0; g.hold = 0;
    best.immune = Math.max(best.immune, 0.35);
  }
}

/**
 * One step of the game. `inp`: { x, z, heading, speed (the human's skater), aim (world heading he looks along), press (the
 * key went down this frame) }. Events land in g.events: faceoff, drop, shot, pass, steal, block, goal, over.
 */
export function stepPond(g, dt, inp) {
  const P = POND, pk = g.puck, me = g.players[0];
  me.x = inp.x; me.z = inp.z; me.heading = inp.heading; me.speed = inp.speed || 0;
  g.cooldown = Math.max(0, g.cooldown - dt);
  for (const p of g.players) p.immune = Math.max(0, p.immune - dt);
  if (g.phase === 'wait' || g.phase === 'done') return g;
  g.t += dt;
  if (g.phase === 'faceoff') {
    if (g.t >= P.faceoffS) { g.phase = 'play'; g.t = 0; g.events.push({ kind: 'drop' }); }
    return g;
  }
  if (g.phase === 'goal') {
    stepPuck(g, dt);
    if (g.t >= P.goalS) {
      const over = g.us >= P.firstTo || g.them >= P.firstTo || (g.sudden && g.us !== g.them);
      if (over) { g.phase = 'done'; g.events.push({ kind: 'over' }); } else toFaceoff(g);
    }
    return g;
  }
  // --- play
  g.clock += dt;
  if (g.clock >= P.clockS && !g.sudden) {
    if (g.us !== g.them) { g.phase = 'done'; g.events.push({ kind: 'over' }); return g; }
    g.sudden = true;
    g.events.push({ kind: 'sudden' });
  }
  if (g.clock >= P.capS) { g.phase = 'done'; g.events.push({ kind: 'over' }); return g; }
  let call = false;
  if (inp.press) {
    if (pk.holder === 0) {
      // the puck goes where you look: at a mate you look at it is a pass; anything else a shot
      const toGoal = Math.atan2(P.goalE - me.x, P.goalZ - me.z);
      const goalCone = Math.abs(wrapAngle(inp.aim - toGoal)) < 0.5;
      let mate = null, md = 0.45;
      for (const i of [1, 2]) {
        const m = g.players[i], a = Math.abs(wrapAngle(Math.atan2(m.x - me.x, m.z - me.z) - inp.aim));
        if (a < md) { md = a; mate = m; }
      }
      if (mate && !goalCone) passBy(g, me, mate.i);
      else { release(g, 0, inp.aim, P.shotSpeed); g.shots++; g.events.push({ kind: 'shot', team: 0 }); }
    } else if (pk.holder > 0 && g.players[pk.holder].team === 0) {
      call = true;
    } else if (pk.holder > 0 && g.cooldown <= 0) {
      const h = g.players[pk.holder];
      g.cooldown = P.humanStealCooldown;
      if (dist(me, h) < P.humanStealReach && g.rand() < P.humanStealChance) {
        knockLoose(g, h);
        me.immune = P.stealImmune;
        g.events.push({ kind: 'steal', team: 0, human: true });
      } else g.events.push({ kind: 'poke' });
    }
  }
  stepAi(g, dt, call);
  stepPuck(g, dt);
  return g;
}

/** Tiny HUD line (the score, the clock) */
export function pondLine(g) {
  const clock = g.sudden ? 'next goal wins' : fmtClock(POND.clockS - g.clock);
  return `You ${g.us} : ${g.them} Locals · ${clock}`;
}

export const POND_MISSION = {
  id: 'seehofseeli-hockey',
  title: 'Hockey on the Seehofseeli',
  intro: `Dusk on the Seehof Seeli, the little pond by the Hotel Seehof in Davos Dorf. The locals are short of a player: three on three, boots and jackets for goal posts, no goalies, first to ${POND.firstTo} or ${POND.clockS / 60} minutes. Skate with W, A/D and S. Space with the puck shoots where you look, or passes if you are looking at a mate. Space without it pokes at the carrier, or calls for the pass from a mate who has it. You attack the east goal. The bigger the lead at the end, the better the medal.`,
  mode: 'person',
  season: 'winter',
  time: 'twilight',
  features: ['skates', 'pondHockey'],
  skates: { params: 'hockey', ice: 'pond' },
  scoreMode: true,
  score: (state) => pondScore(state.game),
  scoreUnit: 'goals ahead',
  medals: POND.medals,
  colour: '#2a6be0',
  icon: 'hockey',
  pin: POND.pin,
  finish: 'Boots back on, jackets back on, and somebody knows a Glühwein at the Seehof.',
  start: { x: POND.start.x, z: POND.start.z, heading: Math.atan2(POND.spot.x - POND.start.x, POND.spot.z - POND.start.z) },
  props: [],
  createState() { return { game: createPondGame(Math.floor(Math.random() * 1e9)) }; },
  update() {},
  summary(state) {
    const g = state.game;
    return [`${pondWon(g) ? 'Won' : g.us === g.them ? 'Drawn' : 'Lost'} ${g.us} : ${g.them} · your goals: ${g.myGoals}`];
  },
  objectives: [
    {
      id: 'spot',
      title: 'Skate to the centre spot',
      check(ctx) {
        const d = Math.hypot(ctx.x - POND.spot.x, ctx.z - POND.spot.z);
        return { done: d <= POND.spot.r, progress: null, text: `${Math.round(d)} m to the face-off`, target: { ...POND.spot, style: 'plain' }, hint: null };
      }
    },
    {
      id: 'game',
      title: `First to ${POND.firstTo}`,
      check(ctx, state) {
        const g = state.game;
        const hint = g.puck.holder === 0 ? 'Space: shoot or pass' : g.puck.holder > 0 && g.players[g.puck.holder].team === 0 ? 'Space: call for the puck' : g.puck.holder > 0 ? 'Space: poke check' : 'Get to the puck';
        return { done: g.phase === 'done', progress: null, text: pondLine(g), target: null, hint };
      }
    }
  ]
};

export const OUTDOOR_MISSIONS = [SEILPARK_MISSION, POND_MISSION];
