import { seededRandom } from './missions-data-local.js';
import { walkInto } from './missions-data-gastro.js';

// js/missions-data-bars.js
// Two evenings and mornings in Davos Platz (js/missions-data.js spreads BARS_MISSIONS into MISSIONS; js/missions-bars.js
// has their runtime). Like the other data modules: no three.js and no DOM in here, so that tests/missions-bars.test.mjs
// drives the games with synthetic frames.
//
//  - nageln-tijuana: the Tijuana Bar, Talstrasse 15 (davos.ch, graubuenden.ch; the address point from the
//    Gebäudeadressverzeichnis, not in the OSM cache): rock'n'roll, beer and shots. Nageln ("Hammerschlagen") is the Alpine
//    bar game: everyone's nail started in a tree stump, one swing per turn with the narrow wedge end of the hammer, first
//    to drive it flush wins. That the Tijuana has a stump is our invention. By points.
//  - barista-kafi-klatsch: the Kaffeeklatsch am Platz, Promenade 38 (OSM n1126920425, js/shops-data.js hangs its sign
//    there; "Kafi Klatsch" in the mission). There is a second Kaffeeklatsch at Promenade 72. One station after the other
//    with one button each; the regulars gossip, and a regular's second visit is only "the usual". By points.
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz) (0: +z, south).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const triangle = (t, period) => { const p = (t / period) % 2; return p < 1 ? p : 2 - p; };
const gaussian = (rand) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// =====================================================================================================================
// 1. Nageln in the Tijuana Bar
// =====================================================================================================================
// (the door on the Talstrasse side of the house's footprint, next to the address point E 2781965, N 1185177)
export const TIJUANA = { door: { x: -530.2, z: 325.2, r: 2.4 }, start: { x: -522.2, z: 339.1 } };

export const NAGELN = {
  games: 3,
  nail: 7, // cm of nail standing out of the stump: four of the best strokes
  maxDrive: 1.9, // cm: the best stroke
  bentDrive: 0.5, // a stroke on a bent nail straightens it and drives this share
  maxRounds: 14, // then the deepest nail takes the game
  // the swing: the hammer sways over the nail (aim), then comes up (power)
  aimPeriod: 1.0, // s one way, in the first game …
  powerPeriod: 0.8,
  faster: 0.87, // … times this per game (the beers)
  aimGlance: 0.34, // |off the head's middle| (0-1): beyond this a glancing blow …
  aimMiss: 0.62, // … and beyond this the hammer hits the wood
  perfectAim: 0.11,
  sweet: [0.66, 0.86], // the power that goes straight
  over: 0.94, // from here on the nail mostly bends
  bend: { clean: 0.015, hard: 0.2, over: 0.75, glance: 0.3, glancePower: 0.4 },
  glanceDrive: 0.45,
  // time on the stump (s)
  call: 1.5, windup: 0.75, after: 0.75, gameEnd: 3,
  points: { win: 300, par: 7, underPar: 30, runnerUp: 80, perfect: 15, allGames: 200 }
};

/** The bar crowd: `aim` the spread off the nail's head (gauge units), `power` the swing's middle, `spread` around it */
export const NAGELN_RIVALS = {
  mirko: { name: 'Mirko', aim: 0.24, power: 0.78, spread: 0.14, female: false, hairRoll: 0.03 }, // the barman, sampled the stock
  hans: { name: 'Big Hans', aim: 0.17, power: 0.91, spread: 0.08, female: false, hairRoll: 0.95 }, // snowcat driver, all muscle
  flurin: { name: 'Flurin', aim: 0.15, power: 0.77, spread: 0.1, female: false, hairRoll: 0.08 }, // a carpenter, knows nails
  seraina: { name: 'Seraina', aim: 0.1, power: 0.76, spread: 0.06, female: true, hairRoll: 0.05 } // ski instructor, ice cold
};
export const NAGELN_LINEUPS = [['mirko', 'hans', 'flurin'], ['hans', 'flurin', 'seraina'], ['mirko', 'hans', 'flurin', 'seraina']];

const NAGELN_LINES = {
  good: ['Hopp!', 'That one went in.', 'Right on the head.', 'Clean!'],
  bad: ['Ouch. Next round is on you.', 'Who taught you that?', 'The stump is winning.', 'That nail looks sad.'],
  win: ['Flush! Your round, everyone else.', 'Down it goes. Prost!', 'And that is how it is done!'],
  youGood: ['Not bad for a tourist!', 'Hoi! Look at that one!', 'Beginner’s luck!', 'Now you are scaring us.'],
  youBad: ['Ha! The wrong end of the evening.', 'Try the nail next time.', 'Another beer, that will help.', 'That stump has seen better.'],
  youWin: ['Flush! Give that one a beer!', 'Lucky swing! One more game!', 'Prost, champion!'],
  idle: ['Turn the music up!', 'Who is buying?', 'Rock’n’roll, not Ländler!', 'Nachos for table two!', 'This stump is older than the Parsenn.', 'One more, then home. Really.', 'Did you see the snow up on the Jakobshorn?']
};

const startingOrder = (g) => (g.gameNo - 1) % g.players.length;

function startNagelnGame(g) {
  g.gameNo++;
  const you = { id: 'you', name: 'You', you: true, left: NAGELN.nail, bent: false, strokes: 0 };
  g.players = [you, ...NAGELN_LINEUPS[g.gameNo - 1].map((id) => ({ id, name: NAGELN_RIVALS[id].name, you: false, left: NAGELN.nail, bent: false, strokes: 0 }))];
  g.turn = startingOrder(g);
  g.round = 1;
  g.step = 'call';
  g.stepT = 0;
  g.winner = null;
  g.swing = null;
}

export function createNageln(seed = 23) {
  const g = {
    rand: seededRandom(seed), t: 0, gameNo: 0, players: [], turn: 0, round: 1, step: 'call', stepT: 0, aim: 0.5, power: 0,
    wins: 0, strokes: 0, perfects: 0, bents: 0, misses: 0, score: 0, log: [], winner: null, swing: null, swingSeq: 0,
    last: null, seq: 0, chats: [], chatSeq: 0, cheer: 0, nextIdle: 6, done: false
  };
  startNagelnGame(g);
  return g;
}

/** The swing's speed in this game: the pendulum's periods */
export const nagelnPeriods = (gameNo) => {
  const k = Math.pow(NAGELN.faster, gameNo - 1);
  return { aim: NAGELN.aimPeriod * k, power: NAGELN.powerPeriod * k };
};

/**
 * One stroke on a nail { left, bent }, the same rules for everyone: `aim` and `power` on the gauge (0-1). Returns
 * { kind: 'perfect' | 'hit' | 'glance' | 'straighten' | 'bent' | 'miss', drive (cm) }; leaves the nail alone.
 */
export function nagelStroke(rand, nail, aim, power) {
  const N = NAGELN, B = N.bend;
  const off = Math.abs(aim - 0.5) * 2;
  if (off > N.aimMiss) return { kind: 'miss', drive: 0 };
  const glancing = off > N.aimGlance;
  const inSweet = power >= N.sweet[0] && power <= N.sweet[1];
  const bendChance = power >= N.over ? B.over : glancing ? B.glance + B.glancePower * power : power > N.sweet[1] ? B.hard : B.clean;
  if (rand() < bendChance) return { kind: 'bent', drive: 0 };
  const powerShare = power >= N.sweet[0] ? 1 : Math.pow(power / N.sweet[0], 1.2);
  const aimShare = 1 - 0.3 * Math.min(1, off / N.aimGlance);
  let drive = N.maxDrive * powerShare * aimShare;
  if (glancing) drive *= N.glanceDrive;
  if (nail.bent) return { kind: 'straighten', drive: drive * N.bentDrive };
  if (glancing) return { kind: 'glance', drive };
  return { kind: off <= N.perfectAim && inSweet ? 'perfect' : 'hit', drive };
}

/** A line of chat: the runtime drains g.chats by `seq` (a frame can hold two) */
function pushChat(g, who, text) {
  g.chatSeq++;
  g.chats.push({ who, text, seq: g.chatSeq });
  if (g.chats.length > 6) g.chats.shift();
}
const nagelSay = (g, who, list) => pushChat(g, who, pick(g.rand, list));
function nagelPop(g, text, points, good) { g.seq++; g.last = { text, points: Math.round(points), good, seq: g.seq }; }
/** Someone from the lineup who isn't `id`, or nobody when you are alone with them (never) */
function otherRival(g, id) { return pick(g.rand, g.players.filter((p) => !p.you && p.id !== id)).id; }

function endNagelnGame(g, winner) {
  const P = NAGELN.points, you = g.players[0];
  g.winner = winner;
  g.step = 'gameEnd';
  g.stepT = 0;
  let pts = 0;
  if (winner === you) {
    g.wins++;
    pts = P.win + Math.max(0, P.par - you.strokes) * P.underPar;
    nagelPop(g, 'You drove it flush!', pts, true);
    nagelSay(g, otherRival(g, 'you'), NAGELN_LINES.youWin);
    g.cheer++;
  } else {
    const better = g.players.filter((p) => p.left < you.left).length;
    if (better === 1) pts = P.runnerUp;
    nagelPop(g, `${winner.name} wins this one`, pts, false);
    nagelSay(g, winner.id, NAGELN_LINES.win);
    g.cheer++;
  }
  g.score += pts;
  g.log.push({ game: g.gameNo, winner: winner.id, won: winner === you, strokes: you.strokes, points: Math.round(pts) });
}

function nextNagelnTurn(g) {
  g.turn = (g.turn + 1) % g.players.length;
  if (g.turn === startingOrder(g)) {
    g.round++;
    if (g.round > NAGELN.maxRounds) {
      endNagelnGame(g, g.players.reduce((best, p) => (p.left < best.left ? p : best)));
      return;
    }
  }
  g.step = g.players[g.turn].you ? 'aim' : 'windup';
  g.stepT = 0;
}

/** Whoever is at the nail strikes: the same stroke rules for you and them */
function nagelStrike(g, player, aim, power) {
  const res = nagelStroke(g.rand, player, aim, power);
  player.strokes++;
  g.swingSeq++;
  g.swing = { who: player.id, kind: res.kind, seq: g.swingSeq, aim, power };
  if (res.kind === 'bent') player.bent = true;
  else if (res.kind !== 'miss') { player.bent = false; player.left = Math.max(0, player.left - res.drive); }
  if (player.left <= 0.06) player.left = 0;
  const you = player.you, P = NAGELN.points;
  if (you) {
    g.strokes++;
    if (res.kind === 'perfect') { g.perfects++; g.score += P.perfect; nagelPop(g, 'Right on the head!', P.perfect, true); g.cheer++; if (g.rand() < 0.6) nagelSay(g, otherRival(g, 'you'), NAGELN_LINES.youGood); }
    else if (res.kind === 'hit') nagelPop(g, `In by ${res.drive.toFixed(1)} cm`, 0, true);
    else if (res.kind === 'glance') nagelPop(g, 'A glancing blow', 0, false);
    else if (res.kind === 'straighten') nagelPop(g, 'Straightened it again', 0, true);
    else if (res.kind === 'bent') { g.bents++; nagelPop(g, 'Bent the nail: turn lost', 0, false); nagelSay(g, otherRival(g, 'you'), NAGELN_LINES.youBad); }
    else { g.misses++; nagelPop(g, 'Into the wood: turn lost', 0, false); if (g.rand() < 0.6) nagelSay(g, otherRival(g, 'you'), NAGELN_LINES.youBad); }
  } else if (res.kind === 'perfect' || (res.kind === 'hit' && g.rand() < 0.3)) nagelSay(g, player.id, NAGELN_LINES.good);
  else if ((res.kind === 'bent' || res.kind === 'miss') && g.rand() < 0.7) nagelSay(g, player.id, NAGELN_LINES.bad);
  if (player.left === 0) { endNagelnGame(g, player); return res; }
  g.step = 'after';
  g.stepT = 0;
  return res;
}

export function nagelnStep(g, dt) {
  if (g.done || dt <= 0) return g;
  const N = NAGELN;
  g.t += dt;
  g.stepT += dt;
  if (g.t >= g.nextIdle) { g.nextIdle = g.t + 7 + g.rand() * 5; if (g.step !== 'gameEnd') pushChat(g, 'crowd', pick(g.rand, NAGELN_LINES.idle)); }
  if (g.step === 'call') {
    if (g.stepT >= N.call) { g.step = g.players[g.turn].you ? 'aim' : 'windup'; g.stepT = 0; }
  } else if (g.step === 'windup') {
    if (g.stepT >= N.windup) {
      const p = g.players[g.turn], skill = NAGELN_RIVALS[p.id];
      nagelStrike(g, p, clamp(0.5 + gaussian(g.rand) * skill.aim, 0, 1), clamp(skill.power + gaussian(g.rand) * skill.spread, 0, 1));
    }
  } else if (g.step === 'after') {
    if (g.stepT >= N.after) nextNagelnTurn(g);
  } else if (g.step === 'gameEnd' && g.stepT >= N.gameEnd) {
    if (g.gameNo >= N.games) {
      if (g.wins >= N.games) { g.score += N.points.allGames; nagelPop(g, 'King of the stump!', N.points.allGames, true); }
      g.done = true;
    } else startNagelnGame(g);
  }
  return g;
}

/** What the gauge shows: { label, button, value (null: no gauge), lo, hi } */
export function nagelnGauge(g) {
  const per = nagelnPeriods(g.gameNo), N = NAGELN;
  if (g.step === 'aim') return { label: 'Aim: stop the hammer over the nail', button: 'Aim', value: triangle(g.stepT, per.aim), lo: 0.5 - N.aimGlance / 2, hi: 0.5 + N.aimGlance / 2 };
  if (g.step === 'power') return { label: 'Power: strike in the green', button: 'Strike', value: triangle(g.stepT, per.power), lo: N.sweet[0], hi: N.sweet[1] };
  if (g.step === 'windup' || g.step === 'after') { const p = g.players[g.turn]; return { label: p.you ? 'Your stroke' : `${p.name} swings …`, button: null, value: null, lo: 0, hi: 0 }; }
  if (g.step === 'call') return { label: `Game ${g.gameNo} of ${N.games}: nails ready`, button: null, value: null, lo: 0, hi: 0 };
  return { label: g.winner ? `${g.winner.you ? 'You win' : `${g.winner.name} wins`} game ${g.gameNo}` : '', button: null, value: null, lo: 0, hi: 0 };
}

/** The one button: aims, then strikes. Returns 'aim' | 'strike' | null */
export function nagelnPress(g) {
  if (g.done) return null;
  if (g.step === 'aim') { g.aim = nagelnGauge(g).value; g.step = 'power'; g.stepT = 0; return 'aim'; }
  if (g.step === 'power') { g.power = nagelnGauge(g).value; nagelStrike(g, g.players[g.turn], g.aim, g.power); return 'strike'; }
  return null;
}
export const nagelnScore = (g) => (g ? Math.max(0, Math.round(g.score)) : 0);

export const NAGELN_MISSION = {
  id: 'nageln-tijuana',
  title: 'Nageln in the Tijuana Bar',
  intro: 'Rock’n’roll in the Tijuana Bar on the Talstrasse, and tonight the stump comes out. Nageln is the Alpine bar game: everyone’s nail started in a tree stump, one swing per turn with the narrow wedge end of the hammer, and the first to drive it flush wins. Walk in, then three games against the bar crowd. One button (Space, Enter or a tap): stop the hammer over your nail, then strike when the power is in the green. Too hard or off the head and the nail bends, a miss goes into the wood; both cost you the turn. Wins and few strokes pay.',
  mode: 'person',
  season: null,
  time: 'evening',
  features: ['nageln'],
  scoreMode: true,
  // (calibrated on the bots in tests/missions-bars.test.mjs: a steady hand gold, a fair one silver, a shaky one bronze)
  medals: { gold: 1050, silver: 500, bronze: 150 },
  colour: '#c8553d',
  icon: 'hammer',
  finish: 'The stump goes back in the corner, the hammer behind the bar. Your nail stays in the wood.',
  interior: { door: TIJUANA.door },
  start: { ...TIJUANA.start, heading: Math.atan2(TIJUANA.door.x - TIJUANA.start.x, TIJUANA.door.z - TIJUANA.start.z) },
  pin: { x: TIJUANA.door.x, z: TIJUANA.door.z },
  props: [],
  createState() { return { game: null, inside: false }; },
  score: (state) => nagelnScore(state.game),
  summary(state) {
    const g = state.game;
    if (!g) return [];
    const lines = [`${g.wins} of ${NAGELN.games} games won · ${g.strokes} strokes · ${g.perfects} perfect · ${g.bents} bent · ${g.misses} missed`];
    if (g.log.length) lines.push(g.log.map((l) => `${l.won ? '✓' : '✗'} ${l.strokes}`).join(' · '));
    return lines;
  },
  objectives: [
    walkInto(TIJUANA.door, 'Go into the Tijuana Bar', 'the Tijuana Bar'),
    {
      id: 'nageln',
      title: `${NAGELN.games} games of Nageln`,
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'Finding a place at the stump …', target: null, hint: null };
        return { done: g.done, progress: g.log.length / NAGELN.games, text: `Game ${g.gameNo} of ${NAGELN.games} · ${g.wins} won · ${g.strokes} strokes · ${nagelnScore(g)} pts`, target: null, hint: 'Space or the button' };
      }
    }
  ]
};

// =====================================================================================================================
// 2. Barista at the Kafi Klatsch
// =====================================================================================================================
// (the door on the Promenade side of the house's footprint, by the OSM node with the hanging sign)
export const KAFI = { door: { x: -693.6, z: 319.5, r: 2.4 }, start: { x: -687.0, z: 305.0 } };

export const STATIONS = ['grind', 'tamp', 'pull', 'steam', 'pour', 'serve'];
export const STATION_INFO = {
  grind: { button: 'Grind', label: 'Grind: stop at the right dose' },
  tamp: { button: 'Tamp', label: 'Tamp: press in the green' },
  pull: { button: 'Pull', label: 'Pull the shot: stop in the green' },
  steam: { button: 'Steam', label: 'Steam the milk: stop in the green' },
  pour: { button: 'Pour', label: 'Pour: tip the jug in the green' },
  serve: { button: 'Serve', label: 'Serve it!' }
};
const NO_MILK = ['grind', 'tamp', 'pull', 'serve'], MILK = ['grind', 'tamp', 'pull', 'steam', 'pour', 'serve'];
/** `pull`: the shot's window on its gauge (a crème runs long, an espresso short); `steam`: the milk's window in °C */
export const DRINKS = [
  { id: 'espresso', name: 'Espresso', stations: NO_MILK, pull: [0.3, 0.46], steam: null },
  { id: 'creme', name: 'Café crème', stations: NO_MILK, pull: [0.64, 0.82], steam: null },
  { id: 'schale', name: 'Schale', stations: MILK, pull: [0.38, 0.56], steam: [66, 72] },
  { id: 'macchiato', name: 'Latte Macchiato', stations: MILK, pull: [0.34, 0.5], steam: [58, 64] },
  { id: 'cappuccino', name: 'Cappuccino', stations: MILK, pull: [0.38, 0.54], steam: [62, 68] }
];
export const drinkById = (id) => DRINKS.find((d) => d.id === id);

export const BARISTA = {
  gap: 5.6, // s between two guests at first …
  gapEnd: 4.4, // … and at the end of the rush
  patience: 20, // s a guest waits
  lead: 0.4, // s before a station's gauge starts (the hand gets there)
  periods: { grind: 1.15, tamp: 0.85, pull: 1.6, steam: 1.7, pour: 0.9 }, // s of the gauge's way across
  windows: { grind: [0.56, 0.78], tamp: [0.4, 0.62], pour: [0.39, 0.61] },
  tempRange: [20, 85], // °C from cold milk to a burnt jug
  near: 0.07, // how far outside a window still counts a little
  nearShare: 0.25,
  points: { order: 40, quality: 80, tip: 30, flawless: 25, usual: 50, wrongUsual: -20, lost: -30 }
};

export const REGULARS = {
  arduser: { name: 'Frau Ardüser', drink: 'schale', female: true, hairRoll: 0.9, seat: { x: -2.35, z: -1.55, yaw: 1.3 }, first: 'A Schale, dear, like every morning. Remember that!' },
  buol: { name: 'Herr Buol', drink: 'creme', female: false, hairRoll: 0.9, seat: { x: 2.35, z: -1.3, yaw: -1.5 }, first: 'Café crème, young one. Always the same, you will see.' },
  luzi: { name: 'Luzi', drink: 'cappuccino', female: true, hairRoll: 0.03, seat: { x: 2.1, z: -2.3, yaw: 0.4 }, first: 'Cappuccino! You’ll know it next time, right?' }
};
export const TABLE_FOLK = {
  margrith: { name: 'Margrith', female: true, hairRoll: 0.8, seat: { x: -2.75, z: -2.35, yaw: 0.9 } }
};

/** The rush's guests in order: `regular`'s second visit asks for "the usual" (the drink comes from the first) */
export const RUSH = [
  { drink: 'espresso' },
  { regular: 'arduser' },
  { drink: 'cappuccino' },
  { regular: 'buol' },
  { drink: 'macchiato' },
  { regular: 'luzi' },
  { drink: 'espresso' },
  { regular: 'arduser', usual: true },
  { drink: 'creme' },
  { regular: 'buol', usual: true },
  { drink: 'macchiato' },
  { regular: 'luzi', usual: true }
].map((guest, i, all) => ({
  ...guest,
  id: i,
  drink: guest.drink || REGULARS[guest.regular].drink,
  arriveT: 1 + Array.from({ length: i }, (_, k) => BARISTA.gap + ((BARISTA.gapEnd - BARISTA.gap) * k) / Math.max(1, all.length - 2)).reduce((a, b) => a + b, 0)
}));

/** "Klatsch": the tables' gossip, harmless and invented */
export const GOSSIP = [
  ['arduser', 'Have you heard? The Hoffmanns’ dog got the Landammann’s sausage again.'],
  ['margrith', 'And she wore skis to the church bazaar. In June!'],
  ['buol', 'They say the new Landwasser bridge has been painted twice. Twice!'],
  ['luzi', 'My cousin says the WEF left a whole crate of pens behind.'],
  ['margrith', 'The baker has a new girlfriend from Klosters. From Klosters!'],
  ['arduser', 'The Rüeblitorte was smaller last week. I measured it.'],
  ['buol', 'I knew that ski instructor when he was afraid of the T-bar.'],
  ['luzi', 'Someone has been nailing in the Tijuana again. The whole Talstrasse heard it.'],
  ['margrith', 'The postman reads the postcards. Everyone knows.'],
  ['arduser', 'Don’t tell anyone, but the Föhn is coming on Thursday.']
];

const hitShare = (v, lo, hi) => {
  if (v < lo || v > hi) return null;
  const c = (lo + hi) / 2, h = (hi - lo) / 2;
  return 0.5 + 0.5 * (1 - Math.abs(v - c) / h);
};
const tempToGauge = (c) => (c - BARISTA.tempRange[0]) / (BARISTA.tempRange[1] - BARISTA.tempRange[0]);
export const gaugeToTemp = (v) => BARISTA.tempRange[0] + v * (BARISTA.tempRange[1] - BARISTA.tempRange[0]);

export function createBarista(seed = 31) {
  return {
    rand: seededRandom(seed), t: 0, arrived: 0, queue: [], work: null, step: 'wait', stepT: 0, value: 0,
    served: 0, lost: 0, perfectOrders: 0, usuals: 0, asked: 0, wrongUsual: 0, qualitySum: 0, score: 0, log: [],
    last: null, seq: 0, chats: [], chatSeq: 0, gossipI: 0, nextGossip: 3.5, done: false
  };
}

const baristaPop = (g, text, points, good) => { g.seq++; g.last = { text, points: Math.round(points), good, seq: g.seq }; };
const baristaSay = pushChat;
const orderLine = (guest) => (guest.usual ? 'The usual, please!' : guest.regular ? REGULARS[guest.regular].first : `${drinkById(guest.drink).name}, please!`);
const guestWho = (guest) => guest.regular || `guest${guest.id}`;

/** Starts on the guest at the head of the queue: picking a regular's usual, or the first station */
function nextOrder(g) {
  g.work = null;
  const guest = g.queue[0];
  if (!guest) { g.step = 'wait'; g.value = 0; return; }
  g.work = { guest, station: 0, shares: [], picking: !!guest.usual, known: false, bonus: !!guest.usual };
  baristaSay(g, guestWho(guest), orderLine(guest));
  if (g.work.picking) { g.step = 'pick'; g.stepT = 0; g.value = 0; } else toStation(g, 0);
}
function toStation(g, i) {
  const drink = drinkById(g.work.guest.drink);
  g.work.station = i;
  g.step = drink.stations[i];
  g.stepT = 0;
  g.value = 0;
}
function advanceStation(g, share) {
  g.work.shares.push(share);
  toStation(g, g.work.station + 1);
}

/** The window of the station at work: { lo, hi }, gauge units */
export function baristaWindow(step, drink) {
  const B = BARISTA;
  if (step === 'pull') return { lo: drink.pull[0], hi: drink.pull[1] };
  if (step === 'steam') return { lo: tempToGauge(drink.steam[0]), hi: tempToGauge(drink.steam[1]) };
  const w = B.windows[step];
  return w ? { lo: w[0], hi: w[1] } : { lo: 0, hi: 0 };
}

/** What the gauge shows: { step, label, button, value (null: no gauge), lo, hi, temp (°C when steaming) } */
export function baristaGauge(g) {
  if (g.step === 'wait') return { step: g.step, label: 'Wiping the counter …', button: null, value: null, lo: 0, hi: 0, temp: null };
  if (g.step === 'pick') return { step: g.step, label: 'The usual: which was it?', button: null, value: null, lo: 0, hi: 0, temp: null };
  const info = STATION_INFO[g.step];
  if (g.step === 'serve') return { step: g.step, label: info.label, button: info.button, value: null, lo: 0, hi: 0, temp: null };
  const drink = drinkById(g.work.guest.drink), w = baristaWindow(g.step, drink);
  const swing = g.step === 'tamp' || g.step === 'pour';
  const value = swing ? triangle(Math.max(0, g.stepT - BARISTA.lead), BARISTA.periods[g.step]) : g.value;
  return { step: g.step, label: info.label, button: info.button, value, lo: w.lo, hi: w.hi, temp: g.step === 'steam' ? Math.round(gaugeToTemp(value)) : null };
}

/** The guest leaves unserved */
function guestLeaves(g, guest) {
  g.queue.splice(g.queue.indexOf(guest), 1);
  g.lost++;
  g.score += BARISTA.points.lost;
  g.log.push({ guest: guest.id, drink: guest.drink, lost: true, points: BARISTA.points.lost });
  baristaPop(g, 'Gone: they got tired of waiting', BARISTA.points.lost, false);
  baristaSay(g, guestWho(guest), 'I’ll get a coffee at the Bahnhof then!');
}

export function baristaStep(g, dt) {
  if (g.done || dt <= 0) return g;
  const B = BARISTA;
  g.t += dt;
  g.stepT += dt;
  while (g.arrived < RUSH.length && g.t >= RUSH[g.arrived].arriveT) {
    g.queue.push({ ...RUSH[g.arrived], left: B.patience });
    g.arrived++;
  }
  let frontChanged = false;
  for (const guest of [...g.queue]) {
    guest.left -= dt;
    if (guest.left <= 0) {
      if (g.queue[0] === guest) frontChanged = true;
      guestLeaves(g, guest);
    }
  }
  if (frontChanged || (!g.work && g.queue.length)) nextOrder(g);
  if (g.t >= g.nextGossip) {
    g.nextGossip = g.t + 5.5 + g.rand() * 3;
    const [who, text] = GOSSIP[g.gossipI % GOSSIP.length];
    g.gossipI++;
    baristaSay(g, who, text);
  }
  if (g.work && ['grind', 'pull', 'steam'].includes(g.step) && g.stepT > B.lead) {
    g.value += dt / B.periods[g.step];
    if (g.value >= 1) {
      const text = g.step === 'pull' ? 'The cup overflows!' : g.step === 'steam' ? 'Burnt milk!' : 'Far too much coffee!';
      baristaPop(g, text, 0, false);
      advanceStation(g, 0);
    }
  }
  if (g.arrived >= RUSH.length && !g.queue.length) g.done = true;
  return g;
}

function serve(g) {
  const B = BARISTA, P = B.points, w = g.work, guest = w.guest;
  const quality = w.shares.reduce((a, b) => a + b, 0) / w.shares.length;
  const flawless = w.shares.every((s) => s > 0.75);
  let pts = P.order + P.quality * quality + P.tip * (guest.left / B.patience);
  if (flawless) { pts += P.flawless; g.perfectOrders++; }
  if (w.bonus) { pts += P.usual; g.usuals++; }
  g.score += pts;
  g.served++;
  g.qualitySum += quality;
  g.log.push({ guest: guest.id, drink: guest.drink, quality, points: Math.round(pts) });
  const name = drinkById(guest.drink).name;
  baristaPop(g, w.bonus ? 'The usual, remembered!' : quality > 0.7 ? `A fine ${name}` : quality > 0.35 ? `${name}: it will do` : `${name}: nobody says a word`, pts, quality > 0.35);
  if (w.bonus) baristaSay(g, guestWho(guest), 'You remembered! Merci vilmal.');
  else if (quality > 0.7) baristaSay(g, guestWho(guest), pick(g.rand, ['Merci vilmal!', 'Now that is coffee.', 'Exactly how it should be.']));
  else if (quality < 0.35) baristaSay(g, guestWho(guest), pick(g.rand, ['Hm. Is the machine new?', 'I have had worse. In Chur.', 'Well. It is warm.']));
  g.queue.shift();
  nextOrder(g);
}

/** The station's button (`station`: the one pressed, null: whichever is at work, the Space key). True when it did
 *  something; pressing another station than the one at work does nothing */
export function baristaAction(g, station = null) {
  if (g.done || !g.work || g.step === 'pick' || g.step === 'wait') return false;
  if (station && station !== g.step) return false;
  if (g.step === 'serve') { serve(g); return true; }
  const v = baristaGauge(g), B = BARISTA;
  const share = hitShare(v.value, v.lo, v.hi);
  let got = share;
  if (share === null) {
    got = v.value >= v.lo - B.near && v.value <= v.hi + B.near ? B.nearShare : 0;
    baristaPop(g, got ? 'Nearly' : v.value < v.lo ? 'Too early' : 'Too late', 0, false);
  } else if (share > 0.85) baristaPop(g, 'Spot on', 0, true);
  advanceStation(g, got);
  return true;
}

/** A regular's usual: their drink from memory, or 'ask' (no bonus). Returns 'right' | 'wrong' | 'ask' | null */
export function baristaPick(g, id) {
  if (g.done || g.step !== 'pick' || !g.work) return null;
  const guest = g.work.guest;
  if (id === 'ask') {
    g.work.bonus = false;
    g.asked++;
    g.work.picking = false;
    baristaSay(g, guestWho(guest), `${drinkById(guest.drink).name}! After all these years.`);
    toStation(g, 0);
    return 'ask';
  }
  if (id !== guest.drink) {
    g.work.bonus = false;
    g.wrongUsual++;
    g.score += BARISTA.points.wrongUsual;
    baristaPop(g, 'Wrong: that is not the usual', BARISTA.points.wrongUsual, false);
    baristaSay(g, guestWho(guest), 'No no no. Not that one.');
    return 'wrong';
  }
  g.work.picking = false;
  toStation(g, 0);
  return 'right';
}
export const baristaScore = (g) => (g ? Math.max(0, Math.round(g.score)) : 0);

export const BARISTA_MISSION = {
  id: 'barista-kafi-klatsch',
  title: 'Barista at the Kafi Klatsch',
  intro: 'Morning rush at the Kafi Klatsch on the Promenade (the sign says Kaffeeklatsch). Go in and get behind the counter: Café crème, Schale, Espresso, Latte Macchiato, Cappuccino, guest after guest. One button for each station, and only the one at work counts (the buttons, keys 1-6 or just Space): grind, tamp, pull the shot, steam the milk to the right heat, pour, serve, each time stopping in the green. Serve before the guest gives up. And listen: the regulars tell you their order once. The next time it is only “the usual”, and remembering it pays.',
  mode: 'person',
  season: null,
  time: 'morning',
  features: ['barista'],
  scoreMode: true,
  // (calibrated on the bots in tests/missions-bars.test.mjs: a steady hand gold, a fair one silver, a shaky one bronze)
  medals: { gold: 1800, silver: 1350, bronze: 800 },
  colour: '#8a5a33',
  icon: 'coffee',
  finish: 'The rush is over, the milk jug in the sink. By noon all of Davos knows how you did.',
  interior: { door: KAFI.door },
  start: { ...KAFI.start, heading: Math.atan2(KAFI.door.x - KAFI.start.x, KAFI.door.z - KAFI.start.z) },
  pin: { x: KAFI.door.x, z: KAFI.door.z },
  props: [],
  createState() { return { game: null, inside: false }; },
  score: (state) => baristaScore(state.game),
  summary(state) {
    const g = state.game;
    if (!g) return [];
    const quality = g.served ? Math.round((g.qualitySum / g.served) * 100) : 0;
    return [
      `${g.served} of ${RUSH.length} orders served · quality ${quality} % · ${g.perfectOrders} flawless · ${g.lost} walked out`,
      `Usuals remembered: ${g.usuals} of 3`
    ];
  },
  objectives: [
    walkInto(KAFI.door, 'Go into the Kafi Klatsch', 'the Kafi Klatsch'),
    {
      id: 'barista',
      title: 'Get through the morning rush',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'Tying on the apron …', target: null, hint: null };
        return { done: g.done, progress: (g.served + g.lost) / RUSH.length, text: `Order ${Math.min(g.served + g.lost + 1, RUSH.length)} of ${RUSH.length} · ${baristaScore(g)} pts · ${g.lost} walked out`, target: null, hint: 'Space or the buttons' };
      }
    }
  ]
};

export const BARS_MISSIONS = [NAGELN_MISSION, BARISTA_MISSION];
