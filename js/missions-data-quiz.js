// js/missions-data-quiz.js
// "Gigi's guessing round": the après-ski table under the umbrella bar beside Bolgen Plaza, at the foot of the Jakobshorn.
// Gigi, a ski instructor from Arosa, asks three questions with a number for an answer; everyone at the table types a
// guess, hidden until he reads the answer out. The closer, the more points; the third question counts double; the last
// one at the table pays the round. Alone the table is filled with four regulars (QUIZ_BOTS), with other players
// (js/quiz-session.js, a room like a race's) the regulars fill it up to four seats.
// Like js/missions-data.js: no three.js, no DOM and no network in here (js/missions-quiz.js has the table, Gigi and the
// overlay), so that tests/quiz.test.mjs drives a round on its own. Nothing is imported from js/missions-data.js.
//
// Many languages at one table: over the wire go question ids, a seed and numbers, never a text. The questions, Gigi's
// lines and the regulars' roles are written in English here and translated on each client (js/i18n.js); which line
// Gigi says comes from the seed, so everyone hears the same one in their own language.
// The world frame is js/davos-frame.js: x = E − 2782500, z = 1185500 − N; heading = atan2(dx, dz).

export const QUIZ = {
  // (free ground east of the Skistrasse, 17 m off it, 24 m from Bolgen Plaza's wall, 52 m from the bike race's pin)
  table: { x: -490, z: 566, r: 3.4 },
  start: { x: -488, z: 575.5, heading: Math.atan2(-2, -9.5) },
  gigi: { x: -491.6, z: 564.4 },
  questions: 3,
  weights: [1, 1, 2], // (the last question counts double: the table stays open to the end)
  points: 1000, // a question's most
  leadMs: 4500, // from the start to the first question (Gigi's welcome)
  askMs: 3500, // Gigi reads the question out
  guessMs: 20000, // the guesses
  revealMs: 11500, // the guesses on the line, a roll, the answer and the points, the table's standing moving
  minSeats: 4, // (with players: the regulars fill the table up to this)
  maxPlayers: 10
};
export const QUIZ_PERIOD = QUIZ.askMs + QUIZ.guessMs + QUIZ.revealMs;
export const QUIZ_MAX_SCORE = QUIZ.weights.reduce((a, w) => a + w * QUIZ.points, 0);

/** The table a run is started for (js/quiz-session.js sets it round manager.start(), js/missions-quiz.js takes it at set-up): the manager knows nothing of it */
export const quizHandoff = { table: null };

const SEEN_KEY = 'slopdavos-quiz-seen';
/** The questions this device has had (ids, the newest last), so that the next round brings others */
export function seenQuestions(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage?.getItem(SEEN_KEY) || '[]'); return Array.isArray(v) ? v.filter((id) => typeof id === 'string') : []; } catch { return []; }
}
export function noteQuestions(ids, storage = globalThis.localStorage) {
  try { storage?.setItem(SEEN_KEY, JSON.stringify([...seenQuestions(storage).filter((id) => !ids.includes(id)), ...ids].slice(-30))); } catch { /* (no storage) */ }
}

/** A small seeded random generator (mulberry32, as js/missions-data-local.js) */
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
/** One seed out of several numbers and strings (the round's seed, the question, the seat) */
export function mixSeed(...parts) {
  let h = 2166136261;
  for (const part of parts) for (const ch of String(part)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const gauss = (random) => {
  const u = Math.max(1e-9, random()), v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// =====================================================================================================================
// The questions
// =====================================================================================================================
// { id, kind, topic, text, unit, answer, tol?, half?, year? }
//  - kind: 'world' (counted or measured in the game's data: tests/quiz.test.mjs checks each against its module),
//    'davos' (the real Davos, the source beside it), 'absurd' (worked out from the others).
//  - topic: 'height' | 'distance' | 'count' | 'year' | 'size' (the Rega pilot is sharp on heights and distances).
//  - answer: a whole number (no decimal separator to read two ways).
//  - how far off still scores half the points: `half` (in the answer's unit, the years) or `tol` × answer (default 0.25;
//    0.5 where nobody can know).
//  - year: shown without a thousands separator.
export const QUIZ_QUESTIONS = [
  // --- counted and measured in the game -----------------------------------------------------------------------------
  { id: 'buildings', kind: 'world', topic: 'count', text: 'How many buildings stand in this valley, every barn and garage counted?', unit: 'buildings', answer: 5897, tol: 0.4 },
  { id: 'trees', kind: 'world', topic: 'count', text: 'How many single trees stand on the map of this valley, the forests not counted?', unit: 'trees', answer: 60161, tol: 0.5 },
  { id: 'restaurants', kind: 'world', topic: 'count', text: 'How many restaurants does Davos have?', unit: 'restaurants', answer: 79, tol: 0.3 },
  { id: 'hotels', kind: 'world', topic: 'count', text: 'How many hotels does Davos have?', unit: 'hotels', answer: 52, tol: 0.3 },
  { id: 'bars', kind: 'world', topic: 'count', text: 'How many bars does Davos have, the pubs and this umbrella not counted?', unit: 'bars', answer: 11, tol: 0.35 },
  { id: 'fountains', kind: 'world', topic: 'count', text: 'How many fountains splash in Davos?', unit: 'fountains', answer: 15, tol: 0.35 },
  { id: 'piste-km', kind: 'world', topic: 'distance', text: 'All the ski runs around Davos laid end to end: how many kilometres?', unit: 'km', answer: 91 },
  { id: 'piste-count', kind: 'world', topic: 'count', text: 'How many ski runs are marked around Davos?', unit: 'runs', answer: 168, tol: 0.35 },
  { id: 'loipen-km', kind: 'world', topic: 'distance', text: 'How many kilometres of cross-country tracks are groomed in the valley?', unit: 'km', answer: 52 },
  { id: 'schatzalp-length', kind: 'world', topic: 'distance', text: 'How many metres of track has the Schatzalpbahn, from Davos Platz to the top?', unit: 'm', answer: 714 },
  { id: 'schatzalp-rise', kind: 'world', topic: 'height', text: 'How many metres does the Schatzalpbahn climb?', unit: 'm', answer: 292 },
  { id: 'parsenn-capacity', kind: 'world', topic: 'count', text: 'How many people an hour does the Parsennbahn carry from Davos Dorf up to the Höhenweg?', unit: 'people an hour', answer: 2200, tol: 0.35 },
  { id: 'parsenn-rise', kind: 'world', topic: 'height', text: 'How many metres does the Parsennbahn climb from Davos Dorf to the Höhenweg?', unit: 'm', answer: 657 },
  { id: 'jakobshorn-rise', kind: 'world', topic: 'height', text: 'The two sections of the Jakobshornbahn right behind me: how many metres do they climb together?', unit: 'm', answer: 1030 },
  { id: 'lifts', kind: 'world', topic: 'count', text: 'How many cable cars, chairlifts and drag lifts run around Davos, the funiculars not counted?', unit: 'lifts', answer: 33, tol: 0.3 },
  { id: 'oldest-house', kind: 'world', topic: 'year', text: 'In which year was the oldest building still standing in Davos built?', unit: '', answer: 1280, half: 120, year: true },
  { id: 'floors', kind: 'world', topic: 'count', text: 'How many floors has the tallest house in Davos?', unit: 'floors', answer: 11, tol: 0.3 },
  { id: 'kongress-area', kind: 'world', topic: 'size', text: 'How many square metres of ground does the Kongresszentrum cover?', unit: 'm²', answer: 6475, tol: 0.4 },
  { id: 'stadium-area', kind: 'world', topic: 'size', text: 'How many square metres of ground does the Eisstadion cover?', unit: 'm²', answer: 5683, tol: 0.4 },
  { id: 'bus-lines', kind: 'world', topic: 'count', text: 'How many bus lines does the Verkehrsbetrieb Davos run?', unit: 'lines', answer: 6, tol: 0.35 },
  { id: 'map-names', kind: 'world', topic: 'count', text: 'Peaks, huts, streams, meadows: how many names are written on the map around Davos?', unit: 'names', answer: 1631, tol: 0.5 },
  { id: 'highest-peak', kind: 'world', topic: 'height', text: 'How high is the highest peak on the map of this game, the Piz Vadret?', unit: 'm above sea level', answer: 3228, half: 250 },
  { id: 'flueela', kind: 'world', topic: 'height', text: 'How high is the Flüelapass?', unit: 'm above sea level', answer: 2383, half: 250 },
  { id: 'car-parks', kind: 'world', topic: 'count', text: 'How many car parks are there in the valley, from the big ones down to the yard behind the hotel?', unit: 'car parks', answer: 144, tol: 0.4 },
  { id: 'lake-distance', kind: 'world', topic: 'distance', text: 'As the crow flies from this table to the shore of the Davosersee: how many metres?', unit: 'm', answer: 3221 },
  { id: 'joch-distance', kind: 'world', topic: 'distance', text: 'As the crow flies from this table up to the Weissfluhjoch: how many metres?', unit: 'm', answer: 4879 },
  // --- the real Davos ---------------------------------------------------------------------------------------------
  // (the permanent resident population: 10 648 in 2021 by the BFS' STATPOP, in the commune's Wohnraumstrategie 2023; about 10 700 since)
  { id: 'population', kind: 'davos', topic: 'count', text: 'How many people live in Davos all year round?', unit: 'people', answer: 10700 },
  // (the first tournament: December 1923, won by the Oxford University Ice Hockey Club)
  { id: 'spengler-cup', kind: 'davos', topic: 'year', text: 'In which year was the first Spengler Cup played?', unit: '', answer: 1923, half: 15, year: true },
  // (the HC Davos, record champion: 31 Swiss championships from 1926 to 2015)
  { id: 'hcd-titles', kind: 'davos', topic: 'count', text: 'How many times has the HC Davos been Swiss champion?', unit: 'titles', answer: 31, tol: 0.3 },
  // (swisstopo: 2590 m)
  { id: 'jakobshorn', kind: 'davos', topic: 'height', text: 'How high is the summit of the Jakobshorn above us?', unit: 'm above sea level', answer: 2590, half: 250 },
  // (the first European Management Symposium, the later World Economic Forum: Davos, January 1971)
  { id: 'wef', kind: 'davos', topic: 'year', text: 'In which year did the gentlemen of the WEF meet in Davos for the first time?', unit: '', answer: 1971, half: 10, year: true },
  // (Thomas Mann, Der Zauberberg: S. Fischer, November 1924)
  { id: 'zauberberg', kind: 'davos', topic: 'year', text: 'In which year did Thomas Mann publish "The Magic Mountain"?', unit: '', answer: 1924, half: 15, year: true },
  // (the Wiesener Viadukt of the Rhaetian Railway, 1909: 88.9 m above the Landwasser, 210 m long)
  { id: 'wiesen-viaduct', kind: 'davos', topic: 'height', text: 'How many metres above the Landwasser does the train cross the Wiesen viaduct?', unit: 'm', answer: 89 },
  // --- worked out, Gigi's way -------------------------------------------------------------------------------------
  // (the Promenade: 3704 m in the game's roads; ÷ 4 m)
  { id: 'zambonis', kind: 'absurd', topic: 'count', text: 'A Zamboni is 4 metres long. How many fit nose to tail on the Promenade, from one end to the other?', unit: 'Zambonis', answer: 926, tol: 0.35 },
  // (the Jakobshornbahn's 1030 m ÷ 0.1 m)
  { id: 'kafi-glasses', kind: 'absurd', topic: 'count', text: 'A Kafi Lutz glass is 10 centimetres tall. How many do you stack from the valley station to the top of the Jakobshornbahn?', unit: 'glasses', answer: 10300, tol: 0.35 },
  // (the lake's 574 285 m² ÷ the Eisstadion's 5683 m²)
  { id: 'stadiums-in-lake', kind: 'absurd', topic: 'count', text: 'How many times does the Eisstadion fit onto the Davosersee?', unit: 'times', answer: 101, tol: 0.4 },
  // (60 161 trees × 10 s ÷ 86 400 s)
  { id: 'tree-hugs', kind: 'absurd', topic: 'count', text: 'Gigi hugs every single tree of the valley for ten seconds, day and night. How many days until he is through?', unit: 'days', answer: 7, tol: 0.4 },
  // (2200 people an hour × 8 h)
  { id: 'parsenn-day', kind: 'absurd', topic: 'count', text: 'The Parsennbahn runs full for eight hours. How many skiers has it carried up from Davos Dorf by the evening?', unit: 'skiers', answer: 17600, tol: 0.35 }
];
const BY_ID = new Map(QUIZ_QUESTIONS.map((q) => [q.id, q]));
export const getQuestion = (id) => BY_ID.get(id) || null;
/** How far off a guess still scores half the points */
export const halfOf = (q) => (Number.isFinite(q.half) ? q.half : Math.max(1, q.answer * (q.tol ?? 0.25)));

/**
 * Three questions for a round, by the seed: none of `seen` (ids, the newest last) while enough others are left, and no
 * two of a kind where the pool allows it.
 */
export function pickQuestions(seed, seen = [], count = QUIZ.questions) {
  const random = seededRandom(mixSeed(seed, 'pick'));
  const skip = new Set(seen);
  let pool = QUIZ_QUESTIONS.filter((q) => !skip.has(q.id));
  if (pool.length < count) pool = QUIZ_QUESTIONS.slice(); // (through the whole deck: from the top again)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const picked = [];
  for (const q of pool) { if (picked.length < count && !picked.some((p) => p.kind === q.kind)) picked.push(q); }
  for (const q of pool) { if (picked.length < count && !picked.includes(q)) picked.push(q); }
  return picked.map((q) => q.id);
}

// =====================================================================================================================
// The numbers: typed and shown
// =====================================================================================================================
/** What was typed, as a whole number ≥ 0, or null: digits with ' ’ . , or spaces between the thousands ("12'500", "12,500", "12 500") */
export function parseGuess(text) {
  const s = String(text ?? '').trim().replace(/[\s'’‘`.,_  ]/g, '');
  if (!/^\d{1,12}$/.test(s)) return null;
  return Number(s);
}
/** A number as the language writes it: 12'500 in German (Swiss), 12,500 in English; a year as it is */
export function formatNumber(n, lang = 'en', { year = false } = {}) {
  if (!Number.isFinite(n)) return '–';
  const s = String(Math.round(n));
  if (year) return s;
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'de' ? '’' : ',');
}

// =====================================================================================================================
// The points
// =====================================================================================================================
/** A guess' points on a question: all of them on the spot, half of them `halfOf(q)` away, a quarter twice as far … */
export function scoreGuess(q, guess) {
  if (!q || !Number.isFinite(guess)) return 0;
  const err = Math.abs(guess - q.answer);
  return Math.round(QUIZ.points * Math.pow(2, -err / halfOf(q)));
}

// =====================================================================================================================
// The regulars (the computer's players)
// =====================================================================================================================
// A regular's guess is the answer plus (bias + noise × spread) × halfOf(question), rounded the way people say numbers.
// `sharp`: the topics they know (sharpSpread there, no bias); `figures`: how many significant figures they say.
export const QUIZ_BOTS = [
  { id: 'bot-hitsch', name: 'Hitsch', role: 'ski instructor, Davos, since 1974', colour: '#ff7a59', bias: 1.0, spread: 0.75, figures: 2 },
  { id: 'bot-buenzli', name: 'Herr Bünzli', role: 'spa guest from the lowlands', colour: '#7bc8ff', bias: -1.0, spread: 0.75, figures: 2 },
  { id: 'bot-seraina', name: 'Seraina', role: 'Rega pilot', colour: '#ff5f7e', bias: 0, spread: 1.35, sharp: ['height', 'distance'], sharpSpread: 0.22, figures: 3 },
  { id: 'bot-chad', name: 'Chad', role: 'WEF consultant', colour: '#b9a4ff', bias: 0.3, spread: 1.25, figures: 1 }
];
const roundFigures = (v, figures) => {
  if (v < 10) return Math.round(v);
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) + 1 - figures));
  return Math.round(v / mag) * mag;
};
/** A regular's guess on a question and when in the guessing time they lock it in: { value, at (ms) }; the same on every client */
export function botGuess(bot, q, seed) {
  const random = seededRandom(mixSeed(seed, q.id, bot.id));
  const sharp = bot.sharp?.includes(q.topic);
  const off = (sharp ? 0 : bot.bias) + gauss(random) * (sharp ? bot.sharpSpread : bot.spread);
  let value = q.answer + off * halfOf(q);
  if (q.year) value = bot.figures === 1 ? Math.round(value / 10) * 10 : Math.round(value);
  else value = roundFigures(Math.max(1, value), bot.figures);
  value = Math.max(q.year ? 1000 : 1, value);
  const at = 2500 + Math.floor(random() * 10500); // (all in by 13 s: a lone player who is quick is not kept waiting)
  return { value, at };
}

// =====================================================================================================================
// A round
// =====================================================================================================================
/** The seats of a round: the players in the order they joined, then regulars up to QUIZ.minSeats (all four when alone) */
export function tableSeats(players, { solo = false } = {}) {
  const humans = (players || []).slice(0, QUIZ.maxPlayers).map((p) => ({ id: p.id, name: p.name, colour: p.colour || '#fff', bot: null }));
  const bots = solo ? QUIZ_BOTS.length : Math.max(0, QUIZ.minSeats - humans.length);
  return [...humans, ...QUIZ_BOTS.slice(0, bots).map((b) => ({ id: b.id, name: b.name, role: b.role, colour: b.colour, bot: b }))];
}

/**
 * A round of three questions: { seed, qids, questions, startAt (ms, this clock: the first question's lead begins),
 * skip (ms cut out of the waiting, a lone player's round only), solo, seats, guesses: Map(id -> [v0, v1, v2]) }.
 */
export function createRound({ seed, qids, startAt, seats, solo = false }) {
  const questions = (qids || []).map(getQuestion).filter(Boolean);
  const round = { seed, qids: questions.map((q) => q.id), questions, startAt, skip: 0, solo, seats: seats.slice(), guesses: new Map(), botPlays: new Map() };
  for (const seat of round.seats) {
    round.guesses.set(seat.id, questions.map(() => null));
    if (seat.bot) round.botPlays.set(seat.id, questions.map((q) => botGuess(seat.bot, q, seed)));
  }
  return round;
}

/**
 * Where a round stands `elapsed` ms after its start: { phase: 'lead' | 'ask' | 'guess' | 'reveal' | 'done', q (the
 * question's index), left (ms of the phase), t (ms into the guessing time, 0 before it) }.
 */
export function phaseAt(elapsed, count = QUIZ.questions) {
  const e = elapsed - QUIZ.leadMs;
  if (e < 0) return { phase: 'lead', q: 0, left: -e, t: 0 };
  const q = Math.floor(e / QUIZ_PERIOD);
  if (q >= count) return { phase: 'done', q: count - 1, left: 0, t: QUIZ.guessMs };
  const t = e - q * QUIZ_PERIOD;
  if (t < QUIZ.askMs) return { phase: 'ask', q, left: QUIZ.askMs - t, t: 0 };
  if (t < QUIZ.askMs + QUIZ.guessMs) return { phase: 'guess', q, left: QUIZ.askMs + QUIZ.guessMs - t, t: t - QUIZ.askMs };
  return { phase: 'reveal', q, left: QUIZ_PERIOD - t, t: QUIZ.guessMs };
}
export const roundPhase = (round, now) => phaseAt(now - round.startAt + round.skip, round.questions.length);
/** How long a whole round takes (ms), nothing cut */
export const roundLength = (count = QUIZ.questions) => QUIZ.leadMs + count * QUIZ_PERIOD;

/** A seat's guess on question `qi` is in: kept while the question is asked or guessed (the first one counts) */
export function lockGuess(round, id, qi, value, now = null) {
  const g = round.guesses.get(id);
  if (!g || qi < 0 || qi >= g.length || g[qi] !== null || !Number.isFinite(value) || value < 0) return false;
  if (now !== null) { const p = roundPhase(round, now); if (p.q !== qi || (p.phase !== 'ask' && p.phase !== 'guess')) return false; }
  g[qi] = Math.round(value);
  return true;
}
/** Another player's guesses as they came over the wire ([v0, v1, v2], null: none yet): only what is new is taken */
export function mergeGuesses(round, id, values) {
  const g = round.guesses.get(id);
  if (!g || !Array.isArray(values)) return false;
  let changed = false;
  for (let i = 0; i < g.length; i++) {
    const v = values[i];
    if (g[i] === null && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e13) { g[i] = Math.round(v); changed = true; }
  }
  return changed;
}

/** Whether the seat has its guess for question `qi` in, `t` ms into the guessing time (a regular: at its moment) */
export function hasGuessed(round, seat, qi, t) {
  if (seat.bot) return t >= (round.botPlays.get(seat.id)?.[qi]?.at ?? Infinity);
  return round.guesses.get(seat.id)?.[qi] != null;
}
/** A seat's guess for question `qi` as it counts at the reveal (a regular's is always there) */
export function guessOf(round, seat, qi) {
  if (seat.bot) return round.botPlays.get(seat.id)?.[qi]?.value ?? null;
  return round.guesses.get(seat.id)?.[qi] ?? null;
}

/**
 * A lone player has guessed: the regulars who are still thinking come in one after the other within a second, and the
 * rest of the guessing time is cut down to 1.5 s. Returns the ms cut. With other players see endGuessing: everyone's
 * clock has to run the same.
 */
export function cutWaiting(round, now) {
  if (!round.solo) return 0;
  const p = roundPhase(round, now);
  if (p.phase !== 'guess' && p.phase !== 'ask') return 0;
  const left = p.phase === 'ask' ? p.left + QUIZ.guessMs : p.left; // (to the end of the guessing time)
  const t = p.phase === 'ask' ? 0 : p.t;
  const cut = Math.floor(left - 1500);
  if (cut <= 0) return 0;
  // (their moments are counted from where the clock stands after the cut, 1.5 s before the end, or they would all be
  // past at once)
  const after = QUIZ.guessMs - 1500;
  let late = 0;
  for (const seat of round.seats) {
    if (!seat.bot) continue;
    const play = round.botPlays.get(seat.id)[p.q];
    if (play.at > t) play.at = after + 300 + 220 * late++;
  }
  // (while the question is still being read out, the reading is what is left of it: the guessing time shrinks to the rest)
  round.skip += cut;
  return cut;
}

/**
 * A table with other players: everyone has guessed question `qi`, so its guessing time ends at `endAt` (this clock)
 * instead of running out (js/quiz-session.js: the host says when, every client cuts the same). Once a question; the
 * regulars still thinking come in before it. Returns the ms cut.
 */
export function endGuessing(round, qi, endAt) {
  round.cuts ??= [];
  if (!Number.isInteger(qi) || qi < 0 || qi >= round.questions.length || round.cuts[qi] || !Number.isFinite(endAt)) return 0;
  const end = round.startAt - round.skip + QUIZ.leadMs + qi * QUIZ_PERIOD + QUIZ.askMs + QUIZ.guessMs; // (as it stands)
  const cut = Math.floor(end - Math.max(endAt, end - QUIZ.askMs - QUIZ.guessMs));
  if (cut <= 0) return 0;
  round.cuts[qi] = cut;
  let late = 0;
  for (const seat of round.seats) {
    if (!seat.bot) continue;
    const play = round.botPlays.get(seat.id)[qi];
    play.at = Math.min(play.at, QUIZ.guessMs - 1300 + 250 * late++);
  }
  round.skip += cut;
  return cut;
}

/**
 * Question `qi` read out: every seat's guess, how far off and the points, the closest first:
 * [{ id, name, colour, bot, guess (null: none), err, points, place }].
 */
export function questionResult(round, qi) {
  const q = round.questions[qi];
  const rows = round.seats.map((seat) => {
    const guess = guessOf(round, seat, qi);
    return { id: seat.id, name: seat.name, role: seat.role, colour: seat.colour, bot: !!seat.bot, guess, err: guess === null ? Infinity : Math.abs(guess - q.answer), points: scoreGuess(q, guess) * QUIZ.weights[qi] };
  });
  rows.sort((a, b) => a.err - b.err || a.bot - b.bot || String(a.id).localeCompare(String(b.id))); // (a tie: the players before the regulars)
  rows.forEach((r, i) => { r.place = i + 1; });
  return rows;
}

/** The table's standing after `upTo` questions: [{ id, name, colour, bot, points, place }], the most points first */
export function tableStandings(round, upTo = round.questions.length) {
  const rows = round.seats.map((seat) => {
    let points = 0;
    for (let qi = 0; qi < Math.min(upTo, round.questions.length); qi++) points += scoreGuess(round.questions[qi], guessOf(round, seat, qi)) * QUIZ.weights[qi];
    return { id: seat.id, name: seat.name, role: seat.role, colour: seat.colour, bot: !!seat.bot, points };
  });
  rows.sort((a, b) => b.points - a.points || a.bot - b.bot || String(a.id).localeCompare(String(b.id)));
  rows.forEach((r, i) => { r.place = i + 1; });
  return rows;
}

// =====================================================================================================================
// Gigi
// =====================================================================================================================
// What he says, by the moment; which line of a moment comes from the round's seed (the same at every seat). Written in
// English, the German with Graubünden in it is js/i18n.js'.
export const GIGI = {
  name: 'Gigi',
  role: 'ski instructor from Arosa',
  welcome: [
    'Sit down, sit down! I am Gigi, from Arosa. Three questions, and whoever is furthest off pays the round.',
    'Ah, fresh faces at my table! Three questions about your own valley. The worst guess buys the Kafi Lutz.',
    'Gigi from Arosa, enchanted. Let us see whether the people of Davos know their Davos. Three questions!'
  ],
  ask: ['First question, an easy one to warm up:', 'Second question, now it counts:', 'Last question, it counts double:'],
  // (how the player at this seat did on the question)
  best: [
    'Bravo! Nobody at this table was closer. Are you sure you are not from Arosa?',
    'Closest of all. I am almost impressed.',
    'That one sits. You have been counting on the chairlift, haven’t you?'
  ],
  mid: [
    'Not bad, not good. Like the snow in Davos in March.',
    'In the middle of the field. A guess one can show in public.',
    'Close enough for a second Kafi Lutz, not for the first prize.'
  ],
  worst: [
    'Oh dear. Did you leave your glasses at home?',
    'Furthest off of all! Start counting your money.',
    'That was a guess from the fog. In Arosa even the cows guess better.'
  ],
  none: [
    'No answer at all? In Arosa we at least say a number.',
    'Too slow! The chairlift does not wait either.'
  ],
  // (after the answer, whatever it was)
  arosa: [
    'In Arosa, by the way, it would be twice as many.',
    'Not bad for Davos. In Arosa we do that before breakfast.',
    'A fine number. Ours in Arosa is finer, but a fine number.',
    'You see: one learns something at Gigi’s table.'
  ],
  // (the round is over: the player won, sits in the middle, pays)
  won: [
    'You win the round. Come over to Arosa some time, we need people like you.',
    'First at Gigi’s table! The Kafi Lutz is on the others.'
  ],
  placed: [
    'Not first, not last: you drink for free, but without glory.',
    'A solid middle. Next round you take the lead.'
  ],
  pays: [
    'Last! You pay the round. Kafi Lutz for everyone, and a big one for Gigi.',
    'The bill goes to you. Do not worry, in Arosa it would be dearer.'
  ]
};
/** Gigi's line for a moment (a key of GIGI with a list), by the seed and what else tells the moments apart */
export function gigiLine(kind, seed, ...more) {
  const lines = GIGI[kind];
  if (!Array.isArray(lines) || !lines.length) return '';
  return lines[mixSeed(seed, kind, ...more) % lines.length];
}
/** Every text of the game that a client shows: the questions, their units, Gigi's lines, the regulars' roles (tests: each has a German pair) */
export function quizTexts() {
  const out = new Set();
  for (const q of QUIZ_QUESTIONS) { out.add(q.text); if (q.unit) out.add(q.unit); }
  for (const [key, v] of Object.entries(GIGI)) if (key !== 'name') for (const line of [].concat(v)) out.add(line);
  for (const b of QUIZ_BOTS) out.add(b.role);
  return [...out];
}

// =====================================================================================================================
// The mission
// =====================================================================================================================
const fmtDist = (m) => `${Math.max(0, Math.round(m))} m`;

export const GIGI_MISSION = {
  id: 'gigi-schaetzt',
  title: 'Gigi’s guessing round',
  intro: 'Après-ski under the umbrella bar at the foot of the Jakobshorn. Gigi, a ski instructor from Arosa, holds court at the regulars’ table and claims the people of Davos do not know their own valley. He asks three questions, everyone types a number, hidden until he reads the answer out. The closer, the more points; the third question counts double; whoever is last pays the round. Play against the regulars, or bring up to ten players to the table.',
  mode: 'person',
  season: null,
  time: 'golden',
  features: ['quiz'],
  quiz: true, // (js/missions.js: "Play together" in the briefing, the table of a link ?quiz=<CODE>)
  scoreMode: 'points',
  medals: { gold: 2800, silver: 2000, bronze: 1200 },
  colour: '#f5c542',
  icon: 'umbrella',
  finish: 'Gigi raises his glass: "Viva!" The umbrella bar hums on.',
  start: { ...QUIZ.start },
  props: [],
  createState() { return { seated: false, game: null }; },
  score: (state) => state.game?.score ?? 0,
  summary(state) {
    const g = state.game;
    if (!g?.done) return [];
    return [`Place ${g.place} of ${g.seats} at the table`, g.pays ? 'You pay the round' : g.place === 1 ? 'The round is on the others' : 'Someone else pays the round'];
  },
  objectives: [
    {
      id: 'table',
      title: 'Step up to Gigi’s table',
      allowModes: ['person'],
      check(ctx, state) {
        const d = Math.hypot(ctx.x - QUIZ.table.x, ctx.z - QUIZ.table.z);
        return { done: !!state.seated || (ctx.mode === 'person' && d < QUIZ.table.r), progress: null, text: `${fmtDist(d)} to Gigi’s table`, target: { ...QUIZ.table, style: 'plain' }, hint: null };
      }
    },
    {
      id: 'round',
      title: 'Guess three numbers',
      allowModes: ['person'],
      check(ctx, state) {
        const g = state.game;
        if (!g) return { done: false, progress: 0, text: 'Gigi takes a sip', target: null, hint: null };
        return { done: !!g.done, progress: g.progress ?? 0, text: g.text || 'Gigi takes a sip', target: null, hint: g.hint || null };
      }
    }
  ]
};

export const QUIZ_MISSIONS = [GIGI_MISSION];
