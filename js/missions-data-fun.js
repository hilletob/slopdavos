// js/missions-data-fun.js
// The "fun" missions (js/missions-data.js spreads FUN_MISSIONS into MISSIONS; js/missions-fun.js has their runtime:
// the interiors, the mini games' input, camera, sound and HUD). Like js/missions-data.js: no three.js and no DOM in
// here, so that tests/missions-fun.test.mjs drives the games' logic with synthetic frames. (Nothing is imported from
// js/missions-data.js: it imports this module, and a cycle would leave FUN_MISSIONS undefined there.)
//
//  - headbang-box: a headbang contest in the BOX Davos (Bahnhofstrasse 19, Davos Dorf), at night. A rhythm game on a
//    synthetic metal beat at 140 BPM: a tap on the beat nods the player's head; perfect / good / miss, a combo, 60 s.
//  - apres-bolgenschanze: the same game at the Bolgenschanze (the nightclub on the Skistrasse, Davos Platz), an après-ski
//    party on a winter evening: a DJ's house track at 126 BPM with off-beats to hit, a crowd in ski jackets that jumps.
//  - foosball-la-onda: table football in the Bar La Onda (Davos Platz). 2D physics in the table: the ball, four rods a
//    team with their men, the cushions and the goals, an AI opponent; first to 5 goals.
//  - gondola-tetris: the Jakobshornbahn's big cabin at the valley station (Davos Platz), packed like Tetris: the
//    passengers and their gear come in at the door as pieces, the player slides, turns and drops them; 100 s.
//  - rhb-driver: drive the RhB from Davos Wolfgang to Davos Platz to the timetable: on time, at the stop board, within
//    the speed limits, the doors open 20 s at every stop.
// All of them are scored by points (scoreMode: 'points', js/missions-progress.js): def.score(state) is the run's score
// and def.medals the lowest score for each medal.

export const FUN_SCORE_MODE = 'points';

// --- Small helpers (pure) --------------------------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
const fmtClock = (s) => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const fmtSigned = (s) => `${s >= 0 ? '+' : '−'}${Math.abs(Math.round(s))} s`;

/** A small seeded random generator (mulberry32): the same run of numbers for the same seed */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The "walk to the door" step every indoor mission starts with */
function walkTo(spot, title, label) {
  return {
    id: 'enter',
    title,
    check(ctx) {
      const d = Math.hypot(ctx.x - spot.x, ctx.z - spot.z);
      return { done: d < spot.r, progress: null, text: `${fmtDist(d)} to ${label}`, target: { ...spot, style: 'plain' }, hint: null };
    }
  };
}

// =====================================================================================================================
// 1. Headbang contest: the rhythm game
// =====================================================================================================================
export const HEADBANG = {
  bpm: 140,
  countIn: 4, // beats before the first note (the drummer's sticks)
  perfect: 0.05, // s either side of the beat
  good: 0.12,
  points: { perfect: 250, good: 150 },
  comboStep: 6, // every 6 hits in a row one more ×, up to ×5
  maxMultiplier: 5,
  tail: 1.6 // s after the last note until the song ends
};
export const BEAT_S = 60 / HEADBANG.bpm;

// The song by bars of four beats: [bars, beats of the bar that carry a note (1-based, x.5 the off-beat)]
export const HEADBANG_SONG = [
  { name: 'Intro riff', bars: 4, beats: [1, 3] },
  { name: 'Verse', bars: 8, beats: [1, 2, 3, 4] },
  { name: 'Break', bars: 4, beats: [1, 2.5, 3, 4] },
  { name: 'Chorus', bars: 8, beats: [1, 2, 3, 4] },
  { name: 'Breakdown', bars: 4, beats: [1, 3] },
  { name: 'Finale', bars: 5, beats: [1, 2, 3, 4] }
];

/** The notes: [{ t (s from the song's start), beat (from 0), section }] */
export function headbangChart(song = HEADBANG_SONG, { bpm = HEADBANG.bpm, countIn = HEADBANG.countIn } = {}) {
  const beat = 60 / bpm;
  const notes = [];
  let bar = 0;
  for (const part of song) {
    for (let b = 0; b < part.bars; b++, bar++) {
      for (const k of part.beats) {
        const at = countIn + bar * 4 + (k - 1);
        notes.push({ t: at * beat, beat: at, section: part.name });
      }
    }
  }
  return notes;
}

export const headbangMultiplier = (combo) => Math.min(HEADBANG.maxMultiplier, 1 + Math.floor(combo / HEADBANG.comboStep));

/** A song ready to play: its tempo, its notes, how long it runs, what it can score */
export function createRhythm(song, { bpm = HEADBANG.bpm, countIn = HEADBANG.countIn, tail = HEADBANG.tail } = {}) {
  const chart = headbangChart(song, { bpm, countIn });
  return { song, bpm, beat: 60 / bpm, countIn, tail, chart, length: chart[chart.length - 1].t + tail, max: headbangMaxScore(chart) };
}

/** The song's section at a beat (from 0): its name, 'count' before the first note, 'end' after the last bar */
export function rhythmSection(rhythm, beat) {
  let b = beat - rhythm.countIn;
  if (b < 0) return 'count';
  for (const part of rhythm.song) { if (b < part.bars * 4) return part.name; b -= part.bars * 4; }
  return 'end';
}

export const HEADBANG_RHYTHM = createRhythm(HEADBANG_SONG);
export const HEADBANG_CHART = HEADBANG_RHYTHM.chart;
export const HEADBANG_LENGTH = HEADBANG_RHYTHM.length; // ≈ 60 s

/** A fresh contest */
export function createHeadbang(rhythm = HEADBANG_RHYTHM) {
  const { chart, length } = rhythm;
  return {
    chart, length, next: 0, judged: new Uint8Array(chart.length), // 0 open, 1 perfect, 2 good, 3 miss
    score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, stray: 0, last: null, lastAt: -1e9, t: 0, done: false
  };
}

/** Grades a tap `offset` s off its beat: 'perfect' | 'good' | null (out of the window) */
export function gradeOffset(offset) {
  const a = Math.abs(offset);
  return a <= HEADBANG.perfect ? 'perfect' : a <= HEADBANG.good ? 'good' : null;
}

/** A tap at song time t: judged against the nearest open note within the good window */
export function headbangTap(game, t) {
  const { chart, judged } = game;
  let best = -1, bestD = Infinity;
  for (let i = game.next; i < chart.length && chart[i].t <= t + HEADBANG.good; i++) {
    if (judged[i]) continue;
    const d = Math.abs(chart[i].t - t);
    if (d < bestD) { bestD = d; best = i; }
  }
  const grade = best >= 0 ? gradeOffset(t - chart[best].t) : null;
  game.lastAt = t;
  if (!grade) {
    // a bang off the beat: the combo is gone (no points lost)
    game.stray++;
    game.combo = 0;
    game.last = { grade: 'off', offset: null, t };
    return game.last;
  }
  judged[best] = grade === 'perfect' ? 1 : 2;
  game[grade]++;
  game.combo++;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  const gained = HEADBANG.points[grade] * headbangMultiplier(game.combo - 1);
  game.score += gained;
  game.last = { grade, offset: t - chart[best].t, t, gained, note: best };
  return game.last;
}

/** Song time t: the notes gone by unplayed are missed; the song's end ends the contest */
export function headbangAdvance(game, t) {
  game.t = t;
  const { chart, judged } = game;
  while (game.next < chart.length && chart[game.next].t < t - HEADBANG.good) {
    if (!judged[game.next]) {
      judged[game.next] = 3;
      game.miss++;
      game.combo = 0;
      game.last = { grade: 'miss', offset: null, t };
    }
    game.next++;
  }
  if (t >= game.length) game.done = true;
  return game;
}

/** The best score the chart allows (every note perfect) */
export function headbangMaxScore(chart = HEADBANG_CHART) {
  let s = 0;
  for (let i = 0; i < chart.length; i++) s += HEADBANG.points.perfect * headbangMultiplier(i);
  return s;
}
export const HEADBANG_MAX = HEADBANG_RHYTHM.max;
const roundTo = (v, step) => Math.round(v / step) * step;

// The medals by the share of the song's maximum. A streak breaks with every miss and the multiplier starts over, so the
// score grows far faster than the hit rate: in a simulation (90 % of the notes hit, a 60 ms spread) a decent player makes
// about 25 % of the maximum, a good one (96 %, 45 ms) about 54 %, a casual one (75 %, 80 ms) about 13 %. Those three are
// the medals' players: silver, gold and bronze.
export const RHYTHM_MEDAL_SHARE = { gold: 0.5, silver: 0.2, bronze: 0.1 };
export const rhythmMedals = (max) => ({ gold: roundTo(max * RHYTHM_MEDAL_SHARE.gold, 500), silver: roundTo(max * RHYTHM_MEDAL_SHARE.silver, 500), bronze: roundTo(max * RHYTHM_MEDAL_SHARE.bronze, 500) });

/** A rhythm-game mission at a music venue (`venue`: js/missions-fun.js VENUES has its room, act, crowd and dance): the walk
 *  to `door`, then the song `rhythm`. `action` is the button's word, `tuning` the line before the first note */
function rhythmMission({ door, doorTitle, doorLabel, stepTitle, tuning, action, ...def }) {
  return {
    mode: 'person',
    features: ['headbang'],
    scoreMode: FUN_SCORE_MODE,
    medals: rhythmMedals(def.rhythm.max),
    interior: { door, facing: def.start.heading },
    props: [],
    createState() { return { game: null, inside: false }; },
    score: (state) => state.game?.score ?? 0,
    summary(state) {
      const g = state.game;
      if (!g) return [];
      return [`${g.perfect} perfect · ${g.good} good · ${g.miss} missed · best streak ${g.maxCombo}`];
    },
    objectives: [
      walkTo(door, doorTitle, doorLabel),
      {
        id: 'bang',
        title: stepTitle,
        allowModes: ['person'],
        check(ctx, state) {
          const g = state.game;
          if (!g) return { done: false, progress: 0, text: tuning, target: null, hint: `Space / tap ${action} on the beat` };
          const left = Math.max(0, g.length - g.t);
          return {
            done: g.done,
            progress: Math.min(1, g.t / g.length),
            text: `${g.score.toLocaleString('en-US')} pts · streak ${g.combo} · ×${headbangMultiplier(g.combo)} · ${fmtClock(left)}`,
            target: null,
            hint: `Space / J / K or ${action} on the beat`
          };
        }
      }
    ],
    ...def
  };
}

export const BOX_DOOR = { x: 996.9, z: -1834.6, r: 2.2 }; // the BOX Davos, Bahnhofstrasse 19: its door on the north side

export const HEADBANG_MISSION = rhythmMission({
  id: 'headbang-box',
  title: 'Headbang contest at the BOX',
  intro: 'Metal night at the BOX Davos on the Bahnhofstrasse in Davos Dorf. Go in and bang your head to the band: hit Space (or tap BANG) right on the beat. Perfect hits score more, a streak multiplies your points up to ×5, the crowd goes wild. One song, 60 seconds.',
  venue: 'box',
  season: null, // all year round
  time: 'midnight',
  colour: '#d33cff',
  icon: 'music',
  finish: 'The band throws you a pick: what a neck!',
  start: { x: 988, z: -1835.5, heading: Math.PI / 2 }, // (in the lane north of the building, walking east to the door; outside every footprint)
  rhythm: HEADBANG_RHYTHM,
  door: BOX_DOOR,
  doorTitle: 'Go into the BOX',
  doorLabel: 'the BOX',
  stepTitle: 'Headbang on the beat',
  tuning: 'The band is tuning up …',
  action: 'BANG'
});

// --- Après-ski at the Bolgenschanze: the DJ's track, the same game ------------------------------------------------------
// Off-beats to hit after the groove ("tss" between the kicks), a breakdown to breathe in, the snare roll, the drop with a
// double note in every bar. Beats as in HEADBANG_SONG.
export const BOLGEN_SONG = [
  { name: 'Intro', bars: 4, beats: [1, 3] },
  { name: 'Groove', bars: 6, beats: [1, 2, 3, 4] },
  { name: 'Off-beats', bars: 4, beats: [1.5, 2.5, 3.5, 4.5] },
  { name: 'Breakdown', bars: 4, beats: [1, 3] },
  { name: 'Build-up', bars: 2, beats: [1, 2, 3, 4] },
  { name: 'Drop', bars: 8, beats: [1, 2, 2.5, 3, 4] },
  { name: 'Outro', bars: 3, beats: [1, 2, 3, 4] }
];
export const BOLGEN_RHYTHM = createRhythm(BOLGEN_SONG, { bpm: 126 });

// OSM n321757376 "Bolgenschanze" (amenity=nightclub) lies inside the building on the Skistrasse; the door on its east wall
export const BOLGEN_DOOR = { x: -338.4, z: 273, r: 2.2 };

export const BOLGEN_MISSION = rhythmMission({
  id: 'apres-bolgenschanze',
  title: 'Après-ski at the Bolgenschanze',
  intro: 'Last run done, boots still on: the après-ski party at the Bolgenschanze on the Skistrasse in Davos Platz. Go in and jump with the crowd: hit Space (or tap JUMP) right on the beat, and when the DJ goes to the off-beats, between the kicks. Perfect hits score more, a streak multiplies your points up to ×5. One track, 60 seconds.',
  venue: 'bolgen',
  season: 'winter',
  time: 'evening',
  colour: '#ff8a1f',
  icon: 'discoball',
  finish: 'The DJ hands you the mic and the whole hut sings: legend of the Schanze!',
  start: { x: -333, z: 275, heading: -1.93 }, // (on the Skistrasse, the door ahead)
  rhythm: BOLGEN_RHYTHM,
  door: BOLGEN_DOOR,
  doorTitle: 'Go into the Bolgenschanze',
  doorLabel: 'the Bolgenschanze',
  stepTitle: 'Jump on the beat',
  tuning: 'The DJ is lining up the track …',
  action: 'JUMP'
});

// =====================================================================================================================
// 2. Table football: the physics in the table (metres; x along the table, the player's goal at -x; y across)
// =====================================================================================================================
export const FOOSBALL = {
  length: 1.2, width: 0.68, goal: 0.2, ball: 0.017, man: 0.014,
  restitution: 0.78, // the cushions
  manRestitution: 0.55,
  friction: 0.32, // 1/s, the rolling ball's loss
  kickSpeed: 2.6, // m/s the ball leaves a kicking man
  kickTime: 0.22, // s the foot sweeps through
  kickCooldown: 0.26,
  // the foot's sweep (m): what lies this far behind / in front of the rod and across from a man is kicked, touching or
  // not — a real foot swings through a few centimetres of field, not a point
  sweepBack: 0.022, sweepFront: 0.055, sweepSide: 0.016,
  trap: 0.9, // m/s: a slower ball meets the player's man and stays at its foot (a ball under control;
  // a table may say otherwise: the small one's quicker game traps less)
  trapRestitution: 0.08,
  aiSweep: 0.5, // La Onda's sweep, a share of the player's
  aim: 0.7, // how much a shot bends towards the middle of the goal (the rest: where it met the foot, the rod's slide)
  rodSpeed: 1.8, // m/s the player's rod slides
  aiSpeed: 0.72,
  aiReaction: 0.12, // s
  goalsToWin: 5,
  serveDelay: 1.1,
  timeScale: 0.6 // the table runs at this share of real time (real speeds were too fast to play)
};
// The rods from the player's goal: x, team ('p' the player, 'a' the AI), men, their spacing
export const FOOSBALL_RODS = [
  { x: -0.525, team: 'p', role: 'Goalie', men: 1, spacing: 0 },
  { x: -0.375, team: 'p', role: 'Defence', men: 2, spacing: 0.24 },
  { x: -0.225, team: 'a', role: 'Attack', men: 3, spacing: 0.2 },
  { x: -0.075, team: 'p', role: 'Midfield', men: 5, spacing: 0.12 },
  { x: 0.075, team: 'a', role: 'Midfield', men: 5, spacing: 0.12 },
  { x: 0.225, team: 'p', role: 'Attack', men: 3, spacing: 0.2 },
  { x: 0.375, team: 'a', role: 'Defence', men: 2, spacing: 0.24 },
  { x: 0.525, team: 'a', role: 'Goalie', men: 1, spacing: 0 }
];
export const PLAYER_RODS = FOOSBALL_RODS.map((r, i) => (r.team === 'p' ? i : -1)).filter((i) => i >= 0); // [0, 1, 3, 5]

/**
 * The tables: the big one (eight rods) and the small one beside it (two rods a team: a goal rod of two men, an attack
 * of three; a shorter, narrower field, a quicker game).
 */
export const FOOSBALL_TABLES = {
  big: { id: 'big', length: FOOSBALL.length, width: FOOSBALL.width, goal: FOOSBALL.goal, rods: FOOSBALL_RODS },
  mini: {
    id: 'mini', length: 0.78, width: 0.46, goal: 0.16, trap: 0.75,
    rods: [
      { x: -0.3, team: 'p', role: 'Defence', men: 2, spacing: 0.17 },
      { x: -0.1, team: 'a', role: 'Attack', men: 3, spacing: 0.14 },
      { x: 0.1, team: 'p', role: 'Attack', men: 3, spacing: 0.14 },
      { x: 0.3, team: 'a', role: 'Defence', men: 2, spacing: 0.17 }
    ]
  }
};
const tableOf = (game) => game?.table || FOOSBALL_TABLES.big;

/** How far a rod slides either way: its outer men stay off the cushions (the goalie in front of its goal) */
export function rodRange(rod, T = FOOSBALL_TABLES.big) {
  if (rod.men === 1) return T.goal / 2 + 0.02;
  return T.width / 2 - FOOSBALL.man - 0.008 - ((rod.men - 1) / 2) * rod.spacing;
}
/** The y of man k of a rod at offset `off` */
export const manY = (rod, off, k) => off + (k - (rod.men - 1) / 2) * rod.spacing;

export function createFoosball(seed = 7, table = FOOSBALL_TABLES.big) {
  const playerRods = table.rods.map((r, i) => (r.team === 'p' ? i : -1)).filter((i) => i >= 0);
  return {
    table, playerRods,
    rods: table.rods.map((r) => ({ ...r, off: 0, vy: 0, kick: 0, cooldown: 0, range: rodRange(r, table), aiTarget: 0, aiDelay: 0 })),
    ball: { x: 0, y: 0, vx: 0, vy: 0, live: false },
    score: { p: 0, a: 0 }, t: 0, serveIn: 0.6, serveSide: 1, slow: 0, active: playerRods[Math.min(2, playerRods.length - 1)], lastGoal: null,
    goals: [], done: false, winner: null, kicks: 0, rand: seededRandom(seed), events: []
  };
}

/** Puts the ball in play from the side of the midfield (as a real table's serving hole) */
export function foosballServe(game, side = game.serveSide) {
  const r = game.rand;
  game.ball = { x: (r() - 0.5) * 0.04, y: side * (tableOf(game).width / 2 - 0.03), vx: (r() - 0.5) * 0.3, vy: -side * (0.55 + r() * 0.3), live: true };
  game.serveSide = -side;
  game.slow = 0;
  game.events.push({ type: 'serve' });
}

/** The player's rod nearest the ball from behind (the one that can play it on), or the goalie */
export function autoRod(game) {
  const bx = game.ball.x, own = game.playerRods || PLAYER_RODS;
  let best = own[0], bd = Infinity;
  for (const i of own) {
    const d = bx - game.rods[i].x;
    if (d < -0.045) continue; // the ball is behind this rod
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Starts a kick on rod i (when it is not still recovering from the last) */
export function foosballKick(game, i) {
  const rod = game.rods[i];
  if (rod.cooldown > 0) return false;
  rod.kick = FOOSBALL.kickTime;
  rod.cooldown = FOOSBALL.kickCooldown;
  if (rod.team === 'p') game.kicks++;
  return true;
}

// The AI: each of its rods tracks where the ball will cross it, and kicks when the ball is at its feet
function aiControl(game, dt) {
  const b = game.ball;
  for (const rod of game.rods) {
    if (rod.team !== 'a') continue;
    rod.aiDelay -= dt;
    if (rod.aiDelay <= 0) {
      rod.aiDelay = FOOSBALL.aiReaction;
      // where the ball crosses the rod (straight on, the cushions ignored), a little error
      const tx = Math.abs(b.vx) > 0.05 ? clamp((rod.x - b.x) / b.vx, 0, 0.35) : 0;
      const W = tableOf(game).width / 2;
      let y = clamp(b.y + b.vy * tx, -W, W) + (game.rand() - 0.5) * 0.03;
      // the man that gets there with the least sliding
      let target = 0, bd = Infinity;
      for (let k = 0; k < rod.men; k++) {
        const want = clamp(y - manY(rod, 0, k), -rod.range, rod.range);
        const d = Math.abs(want - rod.off) + Math.abs(y - manY(rod, want, k)) * 4;
        if (d < bd) { bd = d; target = want; }
      }
      rod.aiTarget = target;
    }
    const dy = rod.aiTarget - rod.off;
    const v = clamp(dy / Math.max(dt, 1e-3), -FOOSBALL.aiSpeed, FOOSBALL.aiSpeed);
    rod.vy = v;
    // kick when the ball lies at a man's feet, in front of the rod (towards the player's goal) or under it
    const dx = b.x - rod.x;
    if (b.live && dx < 0.03 && dx > -0.05) {
      for (let k = 0; k < rod.men; k++) if (Math.abs(manY(rod, rod.off, k) - b.y) < 0.03) { foosballKick(game, game.rods.indexOf(rod)); break; }
    }
  }
}

/**
 * One step of the table (dt s): `input` the player's { rod (index | null: automatic), move (-1..1, keys), target (an
 * offset to slide to, pointer; overrides move), kick (bool) }. Returns the events of the step ('goal', 'kick', 'hit',
 * 'cushion', 'serve').
 */
export function foosballStep(game, dt, input = {}) {
  game.events = [];
  if (game.done) return game.events;
  game.t += dt;
  // the player's rod
  const own = game.playerRods || PLAYER_RODS;
  game.active = Number.isInteger(input.rod) && own.includes(input.rod) ? input.rod : autoRod(game);
  for (const i of own) game.rods[i].vy = 0;
  const mine = game.rods[game.active];
  if (Number.isFinite(input.target)) mine.vy = clamp((clamp(input.target, -mine.range, mine.range) - mine.off) / Math.max(dt, 1e-3), -FOOSBALL.rodSpeed * 1.6, FOOSBALL.rodSpeed * 1.6);
  else if (input.move) mine.vy = clamp(input.move, -1, 1) * FOOSBALL.rodSpeed;
  if (input.kick && foosballKick(game, game.active)) game.events.push({ type: 'kick', rod: game.active });
  aiControl(game, dt);
  for (const rod of game.rods) {
    rod.off = clamp(rod.off + rod.vy * dt, -rod.range, rod.range);
    rod.kick = Math.max(0, rod.kick - dt);
    rod.cooldown = Math.max(0, rod.cooldown - dt);
  }
  // the ball, in sub-steps short enough not to pass through a man
  const b = game.ball;
  if (!b.live) {
    game.serveIn -= dt;
    if (game.serveIn <= 0) foosballServe(game);
    return game.events;
  }
  const speed = Math.hypot(b.vx, b.vy);
  const n = Math.max(1, Math.ceil((speed * dt) / 0.004));
  const h = dt / n;
  const T = tableOf(game);
  const L = T.length / 2, W = T.width / 2, R = FOOSBALL.ball, G = T.goal / 2;
  for (let s = 0; s < n && b.live; s++) {
    b.x += b.vx * h;
    b.y += b.vy * h;
    // cushions (the long sides)
    if (b.y > W - R) { b.y = W - R; b.vy = -Math.abs(b.vy) * FOOSBALL.restitution; game.events.push({ type: 'cushion' }); }
    if (b.y < -W + R) { b.y = -W + R; b.vy = Math.abs(b.vy) * FOOSBALL.restitution; game.events.push({ type: 'cushion' }); }
    // the ends: a goal through the mouth, the end cushion beside it
    if (Math.abs(b.x) > L - R) {
      if (Math.abs(b.y) < G - R * 0.3) {
        if (Math.abs(b.x) > L + R) {
          const team = b.x > 0 ? 'p' : 'a';
          game.score[team]++;
          game.goals.push({ team, t: game.t });
          game.lastGoal = { team, t: game.t };
          game.events.push({ type: 'goal', team });
          b.live = false; b.vx = b.vy = 0;
          game.serveIn = FOOSBALL.serveDelay;
          game.serveSide = team === 'p' ? 1 : -1;
          if (game.score[team] >= FOOSBALL.goalsToWin) { game.done = true; game.winner = team; }
          break;
        }
      } else {
        b.x = Math.sign(b.x) * (L - R);
        b.vx = -b.vx * FOOSBALL.restitution;
        game.events.push({ type: 'cushion' });
      }
    }
    // the men
    for (let i = 0; i < game.rods.length; i++) {
      const rod = game.rods[i];
      const dx = b.x - rod.x;
      const dir = rod.team === 'p' ? 1 : -1;
      // a swinging foot: the ball anywhere in its sweep is kicked, touching or not (La Onda's regulars swing a
      // narrower sweep: they have their reflexes)
      if (rod.kick > 0) {
        const fwd = dx * dir, sw = rod.team === 'p' ? 1 : FOOSBALL.aiSweep;
        if (fwd > -FOOSBALL.sweepBack * sw && fwd < FOOSBALL.sweepFront * sw) {
          let hit = -1, hd = Infinity;
          for (let k = 0; k < rod.men; k++) { const d = Math.abs(b.y - manY(rod, rod.off, k)); if (d < R + FOOSBALL.man + FOOSBALL.sweepSide * sw && d < hd) { hd = d; hit = k; } }
          if (hit >= 0) {
            const my = manY(rod, rod.off, hit);
            const v = FOOSBALL.kickSpeed * (0.85 + 0.3 * (rod.kick / FOOSBALL.kickTime));
            // towards the other goal: bent towards its middle, off by where it met the foot and by the rod's slide
            const reachX = (R + FOOSBALL.man) * dir;
            b.x = rod.x + reachX;
            const toGoal = L * dir - b.x;
            const aimVy = (-b.y / Math.max(0.05, Math.abs(toGoal))) * v;
            const side = clamp((b.y - my) / (R + FOOSBALL.man), -1, 1);
            b.vx = dir * v * 0.95;
            b.vy = clamp(aimVy * FOOSBALL.aim + side * v * 0.22 + rod.vy * 0.45, -v * 0.6, v * 0.6);
            rod.kick = 0;
            game.events.push({ type: 'hit', rod: i, kick: true, team: rod.team });
            continue;
          }
        }
      }
      if (Math.abs(dx) > R + FOOSBALL.man + 0.01) continue;
      for (let k = 0; k < rod.men; k++) {
        const my = manY(rod, rod.off, k), dy = b.y - my;
        const d = Math.hypot(dx, dy), reach = R + FOOSBALL.man;
        if (d >= reach) continue;
        const nx = d > 1e-6 ? dx / d : dir, ny = d > 1e-6 ? dy / d : 0;
        b.x = rod.x + nx * reach;
        b.y = my + ny * reach;
        // a bounce off the man, which moves across with its rod; the player's men stop a slow ball at their feet
        const rvx = b.vx, rvy = b.vy - rod.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          // (the rod in the player's hands: the others are only held)
          const e = i === game.active && Math.hypot(rvx, rvy) < (T.trap ?? FOOSBALL.trap) ? FOOSBALL.trapRestitution : FOOSBALL.manRestitution;
          b.vx = rvx - (1 + e) * vn * nx;
          b.vy = rvy - (1 + e) * vn * ny + rod.vy;
          if (e === FOOSBALL.trapRestitution) { b.vx *= 0.4; b.vy = rod.vy + (b.vy - rod.vy) * 0.4; }
          game.events.push({ type: 'hit', rod: i, kick: false, team: rod.team });
        }
      }
    }
  }
  if (b.live) {
    const k = Math.exp(-FOOSBALL.friction * dt);
    b.vx *= k; b.vy *= k;
    // a dead ball (stopped out of every man's reach): served again
    game.slow = Math.hypot(b.vx, b.vy) < 0.035 ? game.slow + dt : 0;
    if (game.slow > 2.2) {
      const reach = game.rods.some((rod) => Math.abs(b.x - rod.x) < 0.05 && Array.from({ length: rod.men }, (_, k) => manY(rod, rod.off, k)).some((y) => Math.abs(y - b.y) < 0.05));
      if (!reach || game.slow > 5) { b.live = false; game.serveIn = 0.5; game.events.push({ type: 'dead' }); }
    }
  }
  return game.events;
}

/** The score of a finished match: 100 a goal of difference, up to 120 for a quick win (none for a defeat) */
export function foosballScore(game) {
  if (game.winner !== 'p') return 0;
  const diff = game.score.p - game.score.a;
  const quick = Math.max(0, Math.round((240 - game.t) / 2));
  return diff * 100 + Math.min(120, quick);
}

export const ONDA_DOOR = { x: -488.4, z: -306.5, r: 2.2 }; // the Bar La Onda: its door to the Obere Strasse

export const FOOSBALL_MISSION = {
  id: 'foosball-la-onda',
  title: 'Table football at La Onda',
  intro: 'The regulars at the Bar La Onda in Davos Platz challenge you to a game of table football (Töggeli). You play red from the left: W / S or the mouse slide the rod nearest the ball (1-4 pick a rod, Q back to automatic), Space or a click shoots — when the bar under your rod turns green, the ball is at a foot. A slow ball stops at your man\'s foot: aim, then shoot. On a phone: drag on the table, tap SHOOT. First to five goals wins.',
  mode: 'person',
  season: null,
  time: 'evening',
  features: ['foosball'],
  scoreMode: FUN_SCORE_MODE,
  medals: { gold: 450, silver: 300, bronze: 100 },
  colour: '#ff8a2b',
  icon: 'foosball',
  finish: 'The regulars buy you a drink. Next round is on them.',
  interior: { door: ONDA_DOOR, facing: -2.74 },
  start: { x: -486.6, z: -302.6, heading: -2.74 },
  props: [],
  createState() { return { game: null, inside: false }; },
  score: (state) => (state.game ? foosballScore(state.game) : 0),
  summary(state) {
    const g = state.game;
    if (!g) return [];
    return [`Final score ${g.score.p} : ${g.score.a} after ${fmtClock(g.t)} · ${g.kicks} shots`];
  },
  objectives: [
    walkTo(ONDA_DOOR, 'Go into the Bar La Onda', 'La Onda'),
    {
      id: 'match',
      title: 'Win the match (first to 5)',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'Chalking the handles …', target: null, hint: null };
        const fail = g.done && g.winner === 'a' ? `La Onda's regulars won ${g.score.a} : ${g.score.p}. Rematch?` : null;
        return {
          done: g.done && g.winner === 'p', fail,
          progress: Math.max(g.score.p, g.score.a) / FOOSBALL.goalsToWin,
          text: `You ${g.score.p} : ${g.score.a} La Onda · ${fmtClock(g.t)} · ${g.rods[g.active].role}`,
          target: null,
          hint: 'W/S or mouse: slide · Space/click: shoot · 1-4: rod, Q: auto'
        };
      }
    }
  ]
};

// =====================================================================================================================
// 3. The Jakobshornbahn's cabin, loaded like Tetris
// =====================================================================================================================
// The cabin's floor as a grid: columns across (c, 0 = left as the camera sees it), rows from the front wall (r = 0) to
// the door (r = rows - 1). The passengers come in at the door as pieces (a person with their gear: a pair, a skier
// with skis, a family with a pram, ...) and slide towards the front wall; the player moves and turns them, and drops
// them. The cabin leaves when the next piece no longer fits, or when the player sends it; full rows earn a bonus, holes
// (an empty cell with someone in front of it towards the door) cost.
export const GONDOLA = {
  cols: 8, rows: 6,
  seconds: 100,
  tick: 0.85, // s a piece takes to slide one row (faster with every cabin)
  minTick: 0.4,
  depart: 4, // s the cabin takes to leave and the next to come in
  points: { person: 6, dog: 3, row: 20, hole: 6, fill90: 80, fill75: 40, fill60: 15, half: 100, empty: 20 }
};

// The pieces: cells [c, r] (r towards the door), the persons on them (cells' indices), their gear (prop, cells)
export const GONDOLA_PIECES = {
  single: { label: 'Skier', cells: [[0, 0]], people: [0], props: [], colour: '#3fd6ff' },
  dog: { label: 'Dog', cells: [[0, 0]], people: [], props: [{ type: 'dog', cells: [0] }], colour: '#c8a165' },
  pair: { label: 'Couple', cells: [[0, 0], [1, 0]], people: [0, 1], props: [], colour: '#ff6fae' },
  skier: { label: 'Skier with skis', cells: [[0, 0], [0, 1], [0, 2]], people: [1], props: [{ type: 'skis', cells: [0, 1, 2] }], colour: '#ffd23f' },
  board: { label: 'Snowboarder', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], people: [0], props: [{ type: 'board', cells: [1, 3] }, { type: 'bag', cells: [2] }], colour: '#7dff8a' },
  family: { label: 'Family with pram', cells: [[0, 0], [0, 1], [0, 2], [1, 0]], people: [0, 1, 2], kids: [2], props: [{ type: 'pram', cells: [3] }], colour: '#ff8a2b' },
  group: { label: 'Group', cells: [[0, 0], [1, 0], [2, 0], [1, 1]], people: [0, 1, 2, 3], props: [], colour: '#b47dff' },
  luggage: { label: 'Tourists with luggage', cells: [[0, 0], [1, 0], [1, 1], [2, 1]], people: [0, 2], props: [{ type: 'case', cells: [1] }, { type: 'case', cells: [3] }], colour: '#ff5b5b' }
};
export const GONDOLA_KINDS = Object.keys(GONDOLA_PIECES);

/** A piece's cells turned `rot` quarter turns (clockwise as seen from above), moved back to c, r >= 0 */
export function rotateCells(cells, rot = 0) {
  let out = cells.map(([c, r]) => [c, r]);
  for (let k = 0; k < ((rot % 4) + 4) % 4; k++) out = out.map(([c, r]) => [r, -c]);
  const minC = Math.min(...out.map((p) => p[0])), minR = Math.min(...out.map((p) => p[1]));
  return out.map(([c, r]) => [c - minC, r - minR]);
}

/** The grid cells a piece covers: [[c, r], ...] (in the order of its definition's cells) */
export function pieceCells(piece) {
  return rotateCells(GONDOLA_PIECES[piece.kind].cells, piece.rot).map(([c, r]) => [piece.c + c, piece.r + r]);
}

/** Whether the cells lie in the cabin and on free floor */
export function canPlace(game, cells) {
  const { cols, rows } = GONDOLA;
  for (const [c, r] of cells) if (c < 0 || c >= cols || r < 0 || r >= rows || game.grid[r * cols + c]) return false;
  return true;
}

export function createGondola(seed = 13) {
  const game = {
    rand: seededRandom(seed), bag: [], grid: new Int16Array(GONDOLA.cols * GONDOLA.rows), placed: [], nextId: 1,
    piece: null, next: null, t: 0, fall: 0, cabin: 1, cabins: [], departing: 0, done: false, events: []
  };
  game.next = drawKind(game);
  gondolaSpawn(game);
  return game;
}
// The next kind out of a shuffled bag of all eight (each comes once in eight)
function drawKind(game) {
  if (!game.bag.length) {
    game.bag = GONDOLA_KINDS.slice();
    for (let i = game.bag.length - 1; i > 0; i--) { const j = Math.floor(game.rand() * (i + 1)); [game.bag[i], game.bag[j]] = [game.bag[j], game.bag[i]]; }
  }
  return game.bag.pop();
}

/** The next piece comes in at the door (the top rows, as near the middle as it fits, turned if need be); false when
 *  it fits nowhere at the door: the cabin is full */
export function gondolaSpawn(game) {
  const kind = game.next;
  let piece = null, bestD = Infinity;
  for (let rot = 0; rot < 4; rot++) {
    const shape = rotateCells(GONDOLA_PIECES[kind].cells, rot);
    const w = Math.max(...shape.map((p) => p[0])) + 1, h = Math.max(...shape.map((p) => p[1])) + 1;
    const mid = Math.floor((GONDOLA.cols - w) / 2);
    for (let c = 0; c + w <= GONDOLA.cols; c++) {
      const cand = { id: game.nextId, kind, rot, c, r: GONDOLA.rows - h };
      const d = Math.abs(c - mid) + rot * 0.5;
      if (d < bestD && canPlace(game, pieceCells(cand))) { bestD = d; piece = cand; }
    }
  }
  if (!piece) { game.piece = null; return false; }
  game.nextId++;
  game.piece = piece;
  game.next = drawKind(game);
  game.fall = 0;
  return true;
}

/** Moves the piece dc columns (false: blocked) */
export function gondolaMove(game, dc) {
  const p = game.piece;
  if (!p || game.departing) return false;
  const moved = { ...p, c: p.c + dc };
  if (!canPlace(game, pieceCells(moved))) return false;
  p.c = moved.c;
  return true;
}

/** Turns the piece a quarter (clockwise), nudged sideways or back towards the door if it would hit something */
export function gondolaRotate(game) {
  const p = game.piece;
  if (!p || game.departing) return false;
  for (const [dc, dr] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, 1], [-1, 1], [1, 1]]) {
    const turned = { ...p, rot: (p.rot + 1) % 4, c: p.c + dc, r: p.r + dr };
    if (canPlace(game, pieceCells(turned))) { Object.assign(p, turned); return true; }
  }
  return false;
}

/** Slides the piece one row towards the front; at the front (or on someone) it stays there: locked */
export function gondolaFall(game) {
  const p = game.piece;
  if (!p) return false;
  const moved = { ...p, r: p.r - 1 };
  if (canPlace(game, pieceCells(moved))) { p.r = moved.r; return true; }
  gondolaLock(game);
  return false;
}

/** Drops the piece all the way (S / Space) */
export function gondolaDrop(game) {
  if (!game.piece || game.departing) return 0;
  let n = 0;
  while (game.piece && gondolaFall(game)) n++;
  return n;
}

/** The piece stays where it is; the next comes in (or, if it does not fit, the cabin leaves) */
export function gondolaLock(game) {
  const p = game.piece;
  if (!p) return;
  for (const [c, r] of pieceCells(p)) game.grid[r * GONDOLA.cols + c] = p.id;
  game.placed.push({ ...p, cells: pieceCells(p) });
  game.piece = null;
  game.events.push({ type: 'lock', id: p.id, kind: p.kind });
  if (!gondolaSpawn(game)) gondolaDepart(game, 'full');
}

/** A cabin's load: { persons, dogs, cells, fill, rows (full rows), holes, points } */
export function gondolaCabinScore(grid, placed) {
  const { cols, rows, points: P } = GONDOLA;
  let persons = 0, dogs = 0, cells = 0, full = 0, holes = 0;
  for (const p of placed) { persons += GONDOLA_PIECES[p.kind].people.length; if (p.kind === 'dog') dogs++; }
  for (let r = 0; r < rows; r++) {
    let n = 0;
    for (let c = 0; c < cols; c++) if (grid[r * cols + c]) n++;
    cells += n;
    if (n === cols) full++;
  }
  // holes: empty floor with someone between it and the door (no one can get there any more)
  for (let c = 0; c < cols; c++) {
    let covered = false;
    for (let r = rows - 1; r >= 0; r--) {
      if (grid[r * cols + c]) covered = true;
      else if (covered) holes++;
    }
  }
  const fill = cells / (cols * rows);
  // (a cabin sent up half empty costs: the queue waits for the next)
  let pts = persons * P.person + dogs * P.dog + full * P.row - holes * P.hole + (fill >= 0.9 ? P.fill90 : fill >= 0.75 ? P.fill75 : fill >= 0.6 ? P.fill60 : 0) - Math.max(0, 0.5 - fill) * P.half;
  pts = Math.round(pts);
  if (!placed.length) pts = -P.empty;
  return { persons, dogs, cells, fill, rows: full, holes, points: pts };
}

/** The cabin leaves with its load (scored); the next one comes in empty after GONDOLA.depart s */
export function gondolaDepart(game, reason = 'sent') {
  if (game.departing) return null;
  const result = { ...gondolaCabinScore(game.grid, game.placed), cabin: game.cabin, reason, t: game.t };
  if (reason === 'time') result.points = Math.max(0, result.points); // (the shift's end sends the last cabin as it is: no penalty)
  game.cabins.push(result);
  game.events.push({ type: 'depart', ...result });
  game.departing = GONDOLA.depart;
  game.piece = null;
  return result;
}

/** The clock: the piece slides on, a departed cabin is replaced, the shift ends (the last cabin leaves with its load) */
export function gondolaStep(game, dt) {
  game.events = [];
  if (game.done) { game.departing = Math.max(0, game.departing - dt); return game; } // (the last cabin still leaving)
  game.t += dt;
  if (game.departing) {
    game.departing = Math.max(0, game.departing - dt);
    if (!game.departing) {
      game.grid.fill(0);
      game.placed = [];
      game.cabin++;
      game.events.push({ type: 'arrive', cabin: game.cabin });
      if (game.t < GONDOLA.seconds) gondolaSpawn(game);
    }
  } else if (game.piece) {
    game.fall += dt;
    const tick = Math.max(GONDOLA.minTick, GONDOLA.tick * Math.pow(0.88, game.cabin - 1));
    while (game.fall >= tick && game.piece) { game.fall -= tick; gondolaFall(game); }
  }
  if (game.t >= GONDOLA.seconds && !game.done) {
    if (!game.departing && game.placed.length) gondolaDepart(game, 'time');
    game.piece = null;
    game.done = true;
  }
  return game;
}

export const gondolaPersons = (game) => game.cabins.reduce((a, c) => a + c.persons, 0);
export const gondolaScore = (game) => Math.max(0, game.cabins.reduce((a, c) => a + c.points, 0));

export const JAKOBSHORN_STATION = { x: -544.3, z: 456.5 }; // js/bergbahnen-data.js "Jakobshornbahn Sektion 1"
export const JAKOBSHORN_GATE = { x: -536.6, z: 470.6, r: 2.5 }; // the way in from the Brämabüelstrasse

export const GONDOLA_MISSION = {
  id: 'gondola-tetris',
  title: 'Pack the Jakobshorn cabin',
  intro: 'Rush hour at the valley station of the Jakobshornbahn in Davos Platz. Pack the big cabin like Tetris: skiers with their skis, snowboarders, families with prams, couples, a dog slide in from the door. ←/→ (A/D) move, ↑/W turn, S or Space drop, E or Enter sends the cabin. Full rows earn a bonus, holes cost. On a phone: swipe to move, tap to turn, swipe down to drop. 100 seconds.',
  mode: 'person',
  season: null, // all year round
  time: 'morning',
  features: ['gondola'],
  scoreMode: FUN_SCORE_MODE,
  medals: { gold: 1300, silver: 850, bronze: 450 },
  colour: '#2fb3ff',
  icon: 'gondola',
  finish: 'Rush hour over: the queue is gone, the cabins went up packed.',
  interior: { door: JAKOBSHORN_GATE },
  start: { x: -530.2, z: 477.4, heading: Math.PI + 0.5 },
  props: [],
  createState() { return { game: null }; },
  score: (state) => (state.game ? gondolaScore(state.game) : 0),
  summary(state) {
    const g = state.game;
    if (!g) return [];
    const rows = g.cabins.reduce((a, c) => a + c.rows, 0), holes = g.cabins.reduce((a, c) => a + c.holes, 0);
    const fill = g.cabins.length ? Math.round((100 * g.cabins.reduce((a, c) => a + c.fill, 0)) / g.cabins.length) : 0;
    return [`${gondolaPersons(g)} passengers in ${g.cabins.length} cabins · ${fill} % full on average · ${rows} full rows · ${holes} holes`];
  },
  objectives: [
    walkTo(JAKOBSHORN_GATE, 'Go to the Jakobshornbahn', 'the valley station'),
    {
      id: 'load',
      title: 'Pack the cabins (100 s)',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'The cabin comes in …', target: null, hint: null };
        const now = gondolaCabinScore(g.grid, g.placed);
        return {
          done: g.done && !g.departing,
          progress: Math.min(1, g.t / GONDOLA.seconds),
          text: `${gondolaScore(g)} pts · ${gondolaPersons(g)} up · cabin ${g.cabin} ${Math.round(now.fill * 100)} % · ${fmtClock(GONDOLA.seconds - g.t)}`,
          target: null,
          hint: '←/→ move · ↑ turn · Space drop · E send the cabin'
        };
      }
    }
  ]
};

// =====================================================================================================================
// 4. The RhB driver: the timetable, the speed limits, the stops
// =====================================================================================================================
export const RHB_DRIVE = {
  from: 'Davos Wolfgang',
  stops: ['Davos Dorf', 'Davos Kongress/Eisstadion', 'Davos Platz'],
  accel: 0.5, brake: 0.8, // m/s² the timetable assumes (the train does 0.6 and 1.2)
  margin: 1.12, reserve: 10, // the timetable: the fastest run × margin + reserve s
  dwell: 20, // s the doors stay open
  window: 25, // m either side of the stop board where a halt counts
  tolerance: 3, // km/h over the limit before it counts
  maxKmh: 60
};

/** The line's speed limits southbound from Wolfgang: [{ from, to (route s, m), kmh, name }], from the stops' s */
export function rhbSpeedSections(stops) {
  const by = Object.fromEntries(stops.map((s) => [s.name, s.s]));
  const w = by['Davos Wolfgang'], d = by['Davos Dorf'], k = by['Davos Kongress/Eisstadion'], p = by['Davos Platz'];
  const out = [];
  const add = (from, to, kmh, name) => { if (Number.isFinite(from) && Number.isFinite(to) && to > from) out.push({ from, to, kmh, name }); };
  add(w - 200, w + 250, 40, 'Wolfgang station');
  add(w + 1300, w + 2000, 45, 'Davosersee bends');
  add(d - 300, d + 120, 40, 'Davos Dorf station');
  add(d + 120, p - 300, 50, 'Through the town');
  add(k - 150, k + 80, 40, 'Kongress/Eisstadion halt');
  add(p - 300, p + 150, 40, 'Davos Platz station');
  // (the inner sections win: sorted by speed, the slowest first)
  return out.sort((a, b) => a.kmh - b.kmh);
}

/** The limit (km/h) at route s: the slowest section over s, else the line's 60 km/h */
export function rhbLimitAt(sections, s) {
  let v = RHB_DRIVE.maxKmh;
  for (const sec of sections) if (s >= sec.from && s <= sec.to && sec.kmh < v) v = sec.kmh;
  return v;
}

/** The fastest run (s) from rest at `from` to rest at `to` under the limits, at the timetable's acceleration and
 *  braking (forward and backward passes over a 2 m grid) */
export function rhbRunTime(sections, from, to, { accel = RHB_DRIVE.accel, brake = RHB_DRIVE.brake } = {}) {
  const step = 2, n = Math.max(1, Math.ceil((to - from) / step));
  const v = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) v[i] = rhbLimitAt(sections, from + (i * (to - from)) / n) / 3.6;
  v[0] = 0; v[n] = 0;
  const ds = (to - from) / n;
  for (let i = 1; i <= n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * accel * ds));
  for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * brake * ds));
  let t = 0;
  for (let i = 1; i <= n; i++) t += ds / Math.max(0.3, (v[i] + v[i - 1]) / 2);
  return t;
}

/** The timetable: [{ name, s, arrive, depart }] (s from the departure at the first stop), times rounded to 5 s */
export function rhbTimetable(stops, sections = rhbSpeedSections(stops)) {
  const out = [];
  let t = 0;
  for (let i = 1; i < stops.length; i++) {
    const run = rhbRunTime(sections, stops[i - 1].s, stops[i].s);
    const arrive = Math.round((t + run * RHB_DRIVE.margin + RHB_DRIVE.reserve) / 5) * 5;
    const last = i === stops.length - 1;
    out.push({ name: stops[i].name, s: stops[i].s, arrive, depart: last ? null : arrive + RHB_DRIVE.dwell + 10 });
    t = last ? arrive : arrive + RHB_DRIVE.dwell + 10;
  }
  return out;
}

/** A stop's points: punctuality (100: within 10 s), stopping at the board (100: within 1 m), the doors (50: 20 s) */
export function rhbStopScore({ delay, error, dwell, last = false }) {
  const late = Math.abs(delay);
  const punctual = late <= 10 ? 100 : Math.max(0, Math.round(100 - (late - 10) * 2)); // (none a minute off)
  const e = Math.abs(error);
  const precise = e <= 1 ? 100 : Math.max(0, Math.round(100 - (e - 1) * 8)); // (none 13.5 m off)
  const doors = last ? 50 : Math.round(50 * Math.min(1, dwell / RHB_DRIVE.dwell));
  return { punctual, precise, doors, total: punctual + precise + doors };
}

/** A drive: the stops ahead with their timetable and how they went */
export function createRhbDrive(stops, sections = rhbSpeedSections(stops)) {
  return {
    sections, timetable: rhbTimetable(stops, sections), index: 0, phase: 'run', // run | halt | done
    halt: null, results: [], overspeed: 0, overspeedPenalty: 0, maxOver: 0, t: 0, s: stops[0]?.s ?? 0, speed: 0, done: false, events: []
  };
}

/**
 * A frame of the drive: { t (s since the departure), s (route s of the train's front), speed (m/s), dt }. Steps the
 * stop at hand: a halt within RHB_DRIVE.window of its board counts (arrival, error), the doors' time while it stands,
 * the departure ends it; running past the window misses it. Over the limit costs points by the second.
 */
export function rhbDriveStep(drive, { t, s, speed, dt }) {
  drive.events = [];
  if (drive.done) return drive;
  drive.t = t; drive.s = s; drive.speed = speed;
  const limit = rhbLimitAt(drive.sections, s);
  const over = speed * 3.6 - limit;
  if (over > RHB_DRIVE.tolerance) {
    drive.overspeed += dt;
    drive.overspeedPenalty = Math.min(250, drive.overspeedPenalty + dt * (3 + over * 0.5));
    drive.maxOver = Math.max(drive.maxOver, over);
  }
  const stop = drive.timetable[drive.index];
  if (!stop) { drive.done = true; return drive; }
  const last = drive.index === drive.timetable.length - 1;
  const error = s - stop.s; // > 0: past the board
  if (drive.phase === 'run') {
    if (speed < 0.05 && Math.abs(error) <= RHB_DRIVE.window) {
      drive.phase = 'halt';
      drive.halt = { arrive: t, error, dwell: 0 };
      drive.events.push({ type: 'halt', name: stop.name, error, delay: t - stop.arrive });
    } else if (error > RHB_DRIVE.window) {
      drive.results.push({ name: stop.name, missed: true, delay: null, error, dwell: 0, punctual: 0, precise: 0, doors: 0, total: 0 });
      drive.events.push({ type: 'missed', name: stop.name });
      drive.index++;
      if (drive.index >= drive.timetable.length) drive.done = true;
    }
  } else if (drive.phase === 'halt') {
    const h = drive.halt;
    if (speed < 0.05) h.dwell += dt;
    const leaving = speed > 0.3;
    if (leaving || (last && h.dwell >= 3)) {
      const score = rhbStopScore({ delay: h.arrive - stop.arrive, error: h.error, dwell: h.dwell, last });
      drive.results.push({ name: stop.name, missed: false, delay: h.arrive - stop.arrive, error: h.error, dwell: h.dwell, ...score });
      drive.events.push({ type: 'depart', name: stop.name, early: !last && h.dwell < RHB_DRIVE.dwell });
      drive.index++;
      drive.phase = 'run';
      drive.halt = null;
      if (drive.index >= drive.timetable.length) drive.done = true;
    }
  }
  return drive;
}

export function rhbDriveScore(drive) {
  const sum = drive.results.reduce((a, r) => a + r.total, 0);
  return Math.max(0, Math.round(sum - drive.overspeedPenalty));
}

export const WOLFGANG = { x: 1818.3, z: -4077.8 };

/** One objective a stop of the drive */
function rhbStopObjective(name, i) {
  return {
    id: `stop${i + 1}`,
    title: `Stop at ${name}`,
    allowModes: ['rhb'],
    check(ctx, state) {
      const d = state.drive;
      if (!d) return { done: false, progress: null, text: `Next stop ${name}`, target: null, hint: 'W: throttle · S: brake' };
      const stop = d.timetable[i];
      const result = d.results[i];
      if (result) return { done: true, progress: 1, text: result.missed ? `Missed ${name}` : `${name}: ${result.total} pts`, target: null, hint: null };
      const togo = stop.s - d.s;
      const limit = rhbLimitAt(d.sections, d.s);
      const delay = d.t - stop.arrive;
      let text;
      if (d.phase === 'halt' && d.index === i) {
        const left = Math.max(0, RHB_DRIVE.dwell - d.halt.dwell);
        text = left > 0 ? `${name} · doors open ${Math.ceil(left)} s · departure ${fmtClock(stop.depart ?? stop.arrive)}` : `${name} · doors closed, depart at ${fmtClock(stop.depart ?? stop.arrive)}`;
      } else {
        text = `${name} in ${fmtDist(Math.abs(togo))}${togo < 0 ? ' (past the board)' : ''} · due ${fmtClock(stop.arrive)} (${fmtSigned(delay)}) · ${Math.round(d.speed * 3.6)}/${limit} km/h`;
      }
      return { done: false, progress: null, text, target: ctx.stopTarget || null, hint: d.speed * 3.6 > limit + RHB_DRIVE.tolerance ? `Too fast: limit ${limit} km/h` : null };
    }
  };
}

export const RHB_MISSION = {
  id: 'rhb-driver',
  title: 'RhB driver: Wolfgang – Davos Platz',
  intro: 'Take the Capricorn from Davos Wolfgang down to Davos Platz, stopping at Davos Dorf and Kongress/Eisstadion on the way. Keep to the timetable, stop with the front at the board (the marker), keep the doors open 20 s and respect the speed limits. W is the throttle, S the brake.',
  mode: 'rhb',
  season: null,
  time: 'golden',
  features: ['rhbDriver'],
  scoreMode: FUN_SCORE_MODE,
  medals: { gold: 600, silver: 450, bronze: 280 },
  colour: '#e2001a',
  icon: 'train',
  finish: 'Davos Platz, end of the run. Nicely driven!',
  start: { x: WOLFGANG.x, z: WOLFGANG.z, heading: Math.PI },
  props: [],
  createState() { return { drive: null }; },
  score: (state) => (state.drive ? rhbDriveScore(state.drive) : 0),
  summary(state) {
    const d = state.drive;
    if (!d) return [];
    const lines = d.results.map((r) => (r.missed ? `${r.name}: missed` : `${r.name}: ${fmtSigned(r.delay)} · ${r.error >= 0 ? '+' : '−'}${Math.abs(r.error).toFixed(1)} m · doors ${Math.round(r.dwell)} s → ${r.total} pts`));
    if (d.overspeed > 0) lines.push(`Over the limit ${Math.round(d.overspeed)} s (up to +${Math.round(d.maxOver)} km/h): −${Math.round(d.overspeedPenalty)} pts`);
    return lines;
  },
  objectives: RHB_DRIVE.stops.map(rhbStopObjective)
};

// The small table beside the big one: two rods a team (a goal rod of two men, an attack of three), the same regulars
export const FOOSBALL_MINI_MISSION = {
  ...FOOSBALL_MISSION,
  id: 'foosball-la-onda-mini',
  title: 'The small table at La Onda',
  intro: 'Beside the big table at the Bar La Onda stands a small one: two rods a side, a defence of two and an attack of three, a short field and a quick game. You play red from the left: W / S or the mouse slide your rod (1-2 pick one, Q back to automatic), Space or a click shoots when the bar under your rod turns green. First to five goals wins.',
  table: 'mini',
  // (its own pin: 20 m along the Obere Strasse from the big table's, the same door)
  start: { x: FOOSBALL_MISSION.start.x + 18.4, z: FOOSBALL_MISSION.start.z - 7.8, heading: -2.0 },
  medals: { gold: 450, silver: 300, bronze: 100 },
  colour: '#ffb02e',
  finish: 'Fast hands on the small table: the regulars want a rematch on the big one.',
  objectives: [
    FOOSBALL_MISSION.objectives[0],
    { ...FOOSBALL_MISSION.objectives[1], check(ctx, state) { const v = FOOSBALL_MISSION.objectives[1].check(ctx, state); return { ...v, hint: v.hint && 'W/S or mouse: slide · Space/click: shoot · 1-2: rod, Q: auto' }; } }
  ]
};

export const FUN_MISSIONS = [HEADBANG_MISSION, FOOSBALL_MISSION, GONDOLA_MISSION, RHB_MISSION, BOLGEN_MISSION, FOOSBALL_MINI_MISSION];
