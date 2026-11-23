import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  QUIZ, QUIZ_PERIOD, QUIZ_MAX_SCORE, QUIZ_QUESTIONS, QUIZ_BOTS, QUIZ_MISSIONS, GIGI_MISSION, GIGI, getQuestion, halfOf, pickQuestions, parseGuess, formatNumber,
  scoreGuess, botGuess, tableSeats, createRound, phaseAt, roundPhase, roundLength, lockGuess, mergeGuesses, hasGuessed, guessOf, cutWaiting, endGuessing, questionResult,
  tableStandings, gigiLine, quizTexts, seededRandom, seenQuestions, noteQuestions, quizHandoff, questionText
} from '../js/missions-data-quiz.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';

// (js/missions-data-quiz.js is the pure part of Gigi's guessing round; the card, the lobby and the wire are checked on their source,
// the session against a wire of its own below)
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const solo = (seed, startAt = 0) => createRound({ seed, qids: pickQuestions(seed), startAt, seats: tableSeats([{ id: 'me', name: 'Me' }], { solo: true }), solo: true });
const at = (round, q, phase, into = 0) => round.startAt - round.skip + QUIZ.leadMs + q * QUIZ_PERIOD + (phase === 'ask' ? 0 : phase === 'guess' ? QUIZ.askMs : QUIZ.askMs + QUIZ.guessMs) + into;

test('the questions: ids, whole answers, a text, a tolerance', () => {
  assert.ok(QUIZ_QUESTIONS.length >= 30);
  const ids = new Set();
  for (const q of QUIZ_QUESTIONS) {
    assert.match(q.id, /^[a-z-]+$/);
    assert.ok(!ids.has(q.id), `${q.id} once`);
    ids.add(q.id);
    assert.ok(['world', 'davos', 'absurd'].includes(q.kind), q.id);
    assert.ok(['height', 'distance', 'count', 'year', 'size'].includes(q.topic), q.id);
    assert.ok(Number.isInteger(q.answer) && q.answer > 0, `${q.id}: a whole number`);
    assert.ok(q.text.length > 20 && q.text.endsWith('?'), q.id);
    assert.ok(halfOf(q) >= 1, q.id);
    assert.equal(!!q.year, q.topic === 'year', `${q.id}: years are shown as years`);
    assert.equal(getQuestion(q.id), q);
  }
  for (const kind of ['world', 'davos', 'absurd']) assert.ok(QUIZ_QUESTIONS.filter((q) => q.kind === kind).length >= 5, kind);
  assert.equal(getQuestion('nope'), null);
});

test('the answers counted in the game are the game\'s data', async () => {
  const { DAVOS_DATA: D } = await import('../js/davos-geodata.js');
  const { BERGBAHNEN: B } = await import('../js/bergbahnen-data.js');
  const { SHOPS_DATA } = await import('../js/shops-data.js');
  const { SKI_PISTES } = await import('../js/ski-pistes-data.js');
  const { TLM_TREES } = await import('../js/tlm-trees-data.js');
  const { GWR } = await import('../js/gwr-data.js');
  const { NAMES } = await import('../js/names-data.js');
  const { PARKING_DATA } = await import('../js/parking-data.js');
  const { VBD_DATA } = await import('../js/vbd-data.js');
  const kind = (k) => SHOPS_DATA.filter((s) => s.kind === k).length;
  const lineLength = (pts) => { let l = 0; for (let i = 2; i < pts.length; i += 2) l += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); return l; };
  const funicular = (label) => B.funiculars.find((f) => f.label.startsWith(label));
  const rise = (r) => { const st = r.supports.filter((s) => s.kind === 'station'); return st.at(-1).ground - st[0].ground; };
  const lake = D.water.find((w) => w.name === 'Davosersee').ring;
  let lakeArea = 0, lakeNear = Infinity;
  for (let i = 0; i < lake.length; i += 2) { const j = (i + 2) % lake.length; lakeArea += lake[i] * lake[j + 1] - lake[j] * lake[i + 1]; lakeNear = Math.min(lakeNear, Math.hypot(lake[i] - QUIZ.table.x, lake[i + 1] - QUIZ.table.z)); }
  lakeArea = Math.abs(lakeArea / 2);
  const promenade = D.roads.filter((r) => r.name === 'Promenade').reduce((a, r) => a + lineLength(r.pts), 0);
  const jakobshorn = B.ropeways.filter((r) => r.name.startsWith('Jakobshornbahn')).reduce((a, r) => a + rise(r), 0);
  const joch = NAMES.names.find((n) => n[0] === 'Weissfluhjoch');
  const want = {
    buildings: D.meta.counts.buildings, trees: TLM_TREES.trees.length, restaurants: kind('restaurant'), hotels: kind('hotel'), bars: kind('bar'), fountains: D.meta.counts.fountains,
    'piste-km': Math.round(SKI_PISTES.runs.reduce((a, r) => a + (r.len || 0), 0) / 1000), 'piste-count': SKI_PISTES.runs.length,
    'loipen-km': Math.round(D.loipen.reduce((a, l) => a + lineLength(l.pts), 0) / 1000),
    'schatzalp-length': funicular('Schatzalpbahn').length, 'schatzalp-rise': funicular('Schatzalpbahn').rise,
    'parsenn-capacity': funicular('Parsennbahn (Davos Dorf').capacity, 'parsenn-rise': funicular('Parsennbahn (Davos Dorf').rise,
    'jakobshorn-rise': Math.round(jakobshorn), lifts: B.ropeways.length,
    'oldest-house': Math.min(...GWR.y.filter((y) => y > 0)), floors: Math.max(...GWR.f.filter((f) => f > 0)),
    'kongress-area': D.landmarks.Kongresszentrum.area, 'stadium-area': D.landmarks['Eisstadion Davos'].area,
    'bus-lines': VBD_DATA.lines.length, 'map-names': NAMES.names.length, 'highest-peak': Math.max(...NAMES.names.map((n) => n[3])),
    flueela: NAMES.names.find((n) => n[0] === 'Flüelapass')[3], 'car-parks': PARKING_DATA.length,
    'lake-distance': Math.round(lakeNear), 'joch-distance': Math.round(Math.hypot(joch[1] - QUIZ.table.x, joch[2] - QUIZ.table.z)),
    // (worked out from the others)
    zambonis: Math.round(promenade / 4), 'kafi-glasses': Math.round(jakobshorn) * 10, 'stadiums-in-lake': Math.round(lakeArea / D.landmarks['Eisstadion Davos'].area),
    'tree-hugs': Math.round((TLM_TREES.trees.length * 10) / 86400), 'parsenn-day': funicular('Parsennbahn (Davos Dorf').capacity * 8
  };
  for (const q of QUIZ_QUESTIONS.filter((x) => x.kind === 'world')) assert.ok(q.id in want, `${q.id} is checked against the data`);
  for (const [id, value] of Object.entries(want)) assert.equal(getQuestion(id).answer, value, id);
});

test('a guess is typed with any thousands separator and shown as the language writes it', () => {
  for (const text of ['12500', "12'500", '12’500', '12,500', '12.500', '12 500', ' 12 500 ']) assert.equal(parseGuess(text), 12500, text);
  assert.equal(parseGuess('0'), 0);
  assert.equal(parseGuess('1923'), 1923);
  for (const text of ['', ' ', 'abc', '-5', '12e3', '1/2', '1234567890123']) assert.equal(parseGuess(text), null, JSON.stringify(text));
  assert.equal(formatNumber(12500, 'de'), '12’500');
  assert.equal(formatNumber(12500, 'en'), '12,500');
  assert.equal(formatNumber(1234567, 'de'), '1’234’567');
  assert.equal(formatNumber(999, 'en'), '999');
  assert.equal(formatNumber(1923, 'de', { year: true }), '1923');
  assert.equal(formatNumber(null, 'de'), '–');
});

test('the points: all on the spot, half at the tolerance, less the further off, none without a guess', () => {
  for (const q of QUIZ_QUESTIONS) {
    assert.equal(scoreGuess(q, q.answer), QUIZ.points);
    assert.equal(scoreGuess(q, q.answer + halfOf(q)), QUIZ.points / 2);
    assert.equal(scoreGuess(q, q.answer - halfOf(q)), QUIZ.points / 2);
    assert.ok(scoreGuess(q, q.answer + 2 * halfOf(q)) < scoreGuess(q, q.answer + halfOf(q)));
    assert.equal(scoreGuess(q, null), 0);
    assert.equal(scoreGuess(q, NaN), 0);
  }
  assert.equal(QUIZ_MAX_SCORE, 4000);
  assert.equal(scoreGuess(getQuestion('spengler-cup'), 1938), 500, 'a year: fifteen years off is half');
});

test('three questions a round: by the seed, none seen before, of three kinds', () => {
  for (let seed = 1; seed < 200; seed++) {
    const ids = pickQuestions(seed);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    assert.deepEqual(pickQuestions(seed), ids, 'the same on every client');
    assert.equal(new Set(ids.map((id) => getQuestion(id).kind)).size, 3, 'one of each kind');
  }
  const seen = QUIZ_QUESTIONS.slice(0, 30).map((q) => q.id);
  for (let seed = 1; seed < 50; seed++) for (const id of pickQuestions(seed, seen)) assert.ok(!seen.includes(id));
  assert.equal(pickQuestions(7, QUIZ_QUESTIONS.map((q) => q.id)).length, 3, 'through the deck: from the top again');
  // (the device remembers what it has had)
  const kept = new Map();
  const storage = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) };
  noteQuestions(['trees', 'wef'], storage);
  noteQuestions(['wef', 'bars'], storage);
  assert.deepEqual(seenQuestions(storage), ['trees', 'wef', 'bars']);
  assert.deepEqual(seenQuestions({ getItem: () => '{broken' }), []);
});

test('the round\'s clock: a lead, then for each question the asking, the guessing and the reveal', () => {
  assert.deepEqual(phaseAt(0), { phase: 'lead', q: 0, left: QUIZ.leadMs, t: 0 });
  assert.equal(phaseAt(QUIZ.leadMs).phase, 'ask');
  assert.deepEqual(phaseAt(QUIZ.leadMs + QUIZ.askMs + 5000), { phase: 'guess', q: 0, left: QUIZ.guessMs - 5000, t: 5000 });
  assert.equal(phaseAt(QUIZ.leadMs + QUIZ.askMs + QUIZ.guessMs).phase, 'reveal');
  assert.equal(phaseAt(QUIZ.leadMs + QUIZ_PERIOD).q, 1);
  assert.equal(phaseAt(QUIZ.leadMs + 2 * QUIZ_PERIOD + QUIZ.askMs + 1).phase, 'guess');
  assert.equal(phaseAt(roundLength() - 1).phase, 'reveal');
  assert.equal(phaseAt(roundLength()).phase, 'done');
  assert.ok(roundLength() < 110000, 'a round fits well into a guest\'s five minutes');
});

test('the regulars guess the same on every client, each in their way', () => {
  const [hitsch, buenzli, seraina, chad] = QUIZ_BOTS;
  const mean = (bot, pick) => { let sum = 0, n = 0; for (let seed = 1; seed <= 400; seed++) for (const q of QUIZ_QUESTIONS.filter(pick)) { sum += (botGuess(bot, q, seed).value - q.answer) / halfOf(q); n++; } return sum / n; };
  for (const bot of QUIZ_BOTS) {
    for (const q of QUIZ_QUESTIONS) {
      const a = botGuess(bot, q, 77), b = botGuess(bot, q, 77);
      assert.deepEqual(a, b);
      assert.ok(Number.isInteger(a.value) && a.value >= 1, `${bot.id} ${q.id}`);
      assert.ok(a.at >= 2000 && a.at <= 13000, 'in well before the time is up');
    }
  }
  const all = () => true, count = (q) => q.topic === 'count' && q.answer > 100;
  assert.ok(mean(hitsch, count) > 0.6, 'the old ski instructor guesses high');
  assert.ok(mean(buenzli, count) < -0.6, 'the guest from the lowlands guesses low');
  const off = (bot, pick) => { let sum = 0, n = 0; for (let seed = 1; seed <= 400; seed++) for (const q of QUIZ_QUESTIONS.filter(pick)) { sum += Math.abs(botGuess(bot, q, seed).value - q.answer) / halfOf(q); n++; } return sum / n; };
  assert.ok(off(seraina, (q) => q.topic === 'height' || q.topic === 'distance') < 0.4, 'the pilot knows heights and distances');
  assert.ok(off(seraina, (q) => q.topic === 'count') > 0.8, 'and guesses at the rest');
  for (const q of QUIZ_QUESTIONS.filter((x) => x.year)) assert.equal(botGuess(chad, q, 5).value % 10, 0, 'the consultant says a round decade');
  assert.ok(all());
});

test('a round alone: the guess counts once and in time, the regulars are in by their moment, the waiting is cut', () => {
  const round = solo(123, 1000);
  assert.equal(round.seats.length, 5);
  assert.equal(round.seats[0].id, 'me');
  assert.deepEqual(round.seats.slice(1).map((s) => s.id), QUIZ_BOTS.map((b) => b.id));
  const q0 = round.questions[0];
  assert.equal(roundPhase(round, 1000).phase, 'lead');
  assert.equal(lockGuess(round, 'me', 0, q0.answer, 1000 + 10), false, 'not before the question');
  assert.equal(lockGuess(round, 'me', 1, 5, at(round, 0, 'guess', 100)), false, 'not another question\'s');
  assert.equal(lockGuess(round, 'nobody', 0, 5, at(round, 0, 'guess', 100)), false);
  // the regulars come in one by one
  const hitsch = round.seats[1], play = round.botPlays.get(hitsch.id)[0];
  assert.equal(hasGuessed(round, hitsch, 0, play.at - 1), false);
  assert.equal(hasGuessed(round, hitsch, 0, play.at), true);
  assert.equal(hasGuessed(round, round.seats[0], 0, 5000), false);
  const now = at(round, 0, 'guess', 1500);
  assert.equal(lockGuess(round, 'me', 0, q0.answer, now), true);
  assert.equal(lockGuess(round, 'me', 0, 1, now), false, 'the first guess counts');
  assert.equal(hasGuessed(round, round.seats[0], 0, 1500), true);
  assert.equal(guessOf(round, round.seats[0], 0), q0.answer);
  // a lone player is not kept waiting: the reveal comes once the regulars are in
  const cut = cutWaiting(round, now);
  assert.ok(cut > 5000, 'most of the guessing time is cut');
  const soon = roundPhase(round, now);
  assert.equal(soon.phase, 'guess');
  assert.ok(soon.left >= 1200 && soon.left <= 1500);
  for (const seat of round.seats) assert.equal(hasGuessed(round, seat, 0, QUIZ.guessMs - 1), true, 'everyone is in before the reveal');
  // (those who were still thinking come in one after the other from where the clock stands now, not all at once)
  const later = round.seats.filter((s) => s.bot).map((s) => round.botPlays.get(s.id)[0].at).filter((t) => t > 1500).sort((x, y) => x - y);
  assert.ok(later.length >= 2, 'regulars were still thinking');
  assert.ok(later[0] > soon.t, `the first comes after the cut: ${later[0]} > ${soon.t}`);
  assert.equal(new Set(later).size, later.length, 'each at a moment of their own');
  assert.equal(roundPhase(round, now + soon.left).phase, 'reveal');
  // the reveal: the closest first, the player's on the spot
  const rows = questionResult(round, 0);
  assert.equal(rows[0].id, 'me');
  assert.equal(rows[0].points, QUIZ.points);
  assert.deepEqual(rows.map((r) => r.place), [1, 2, 3, 4, 5]);
  assert.equal(lockGuess(round, 'me', 0, 3, now + soon.left + 10), false, 'too late');
  // no guess on the other two: only the first question's points, the third would have counted double
  const table = tableStandings(round);
  assert.equal(table.find((r) => r.id === 'me').points, QUIZ.points);
  const last = round.questions[2];
  round.guesses.get('me')[2] = last.answer;
  assert.equal(tableStandings(round).find((r) => r.id === 'me').points, 3 * QUIZ.points);
  assert.equal(tableStandings(round, 1).find((r) => r.id === 'me').points, QUIZ.points, 'the standing after the first question');
});

test('a table with players: the regulars fill it up to four seats, the others\' guesses come over the wire, nothing is cut', () => {
  assert.equal(tableSeats([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]).length, 4);
  assert.equal(tableSeats(Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))).filter((s) => s.bot).length, 0);
  assert.equal(tableSeats(Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))).length, QUIZ.maxPlayers);
  const round = createRound({ seed: 9, qids: pickQuestions(9), startAt: 0, seats: tableSeats([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]), solo: false });
  const now = at(round, 0, 'guess', 3000);
  assert.equal(lockGuess(round, 'a', 0, 100, now), true);
  assert.equal(cutWaiting(round, now), 0, 'everyone\'s clock runs the same');
  assert.equal(mergeGuesses(round, 'b', [250, null, null]), true);
  assert.equal(mergeGuesses(round, 'b', [999, null, null]), false, 'a guess once in stays');
  assert.equal(mergeGuesses(round, 'b', [250, 40, 'x']), true);
  assert.deepEqual(round.guesses.get('b'), [250, 40, null]);
  assert.equal(mergeGuesses(round, 'stranger', [1, 2, 3]), false);
  assert.equal(mergeGuesses(round, 'b', 'nonsense'), false);
  assert.equal(mergeGuesses(round, 'b', [null, null, -4]), false);
  const rows = tableStandings(round);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.place), [1, 2, 3, 4]);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].points >= rows[i].points);
});

test('the medals: careful guessing takes gold, the regulars about bronze to silver, wild guessing nothing', () => {
  const medals = GIGI_MISSION.medals;
  const play = (seed, guess) => {
    const round = solo(seed);
    const random = seededRandom(seed * 7919);
    round.questions.forEach((q, i) => { round.guesses.get('me')[i] = Math.max(0, Math.round(guess(q, random))); });
    return tableStandings(round);
  };
  const N = 600;
  const tally = (guess) => { const t = { gold: 0, silver: 0, bronze: 0, none: 0, won: 0, last: 0, bots: 0 }; for (let s = 1; s <= N; s++) { const rows = play(s, guess); const me = rows.find((r) => r.id === 'me'); t[medalFor(me.points, medals, 'points') || 'none']++; if (me.place === 1) t.won++; if (me.place === rows.length) t.last++; t.bots += rows.filter((r) => r.bot).reduce((a, r) => a + r.points, 0) / 4 / N; } return t; };
  const g = () => 0; // (filled below)
  const noise = (random) => Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(2 * Math.PI * random());
  const careful = tally((q, random) => q.answer + noise(random) * 0.35 * halfOf(q));
  const casual = tally((q, random) => q.answer + noise(random) * 1.1 * halfOf(q));
  const wild = tally((q, random) => (q.year ? 1500 + random() * 500 : q.answer * Math.pow(10, random() * 2 - 1)));
  assert.ok(careful.gold / N > 0.7, `careful: gold ${careful.gold}`);
  assert.ok(careful.won / N > 0.5, `careful: won ${careful.won}`);
  assert.ok(casual.gold / N < 0.25 && (casual.silver + casual.gold + casual.bronze) / N > 0.6, `casual: ${JSON.stringify(casual)}`);
  assert.ok(wild.gold / N < 0.02 && wild.none / N > 0.55, `wild: ${JSON.stringify(wild)}`);
  assert.ok(wild.last / N > 0.5, 'wild guessing pays the round');
  assert.ok(careful.bots > medals.bronze && careful.bots < medals.gold, `the regulars' average ${careful.bots}`);
  assert.ok(medals.gold > medals.silver && medals.silver > medals.bronze && medals.gold < QUIZ_MAX_SCORE);
  assert.equal(g(), 0);
});

test('Gigi says the same line at every seat', () => {
  for (const kind of ['welcome', 'best', 'mid', 'worst', 'none', 'arosa', 'won', 'placed', 'pays']) {
    const line = gigiLine(kind, 4711, 1);
    assert.ok(GIGI[kind].includes(line), kind);
    assert.equal(gigiLine(kind, 4711, 1), line);
  }
  assert.equal(GIGI.ask.length, QUIZ.questions);
  assert.equal(gigiLine('nope', 1), '');
  assert.ok(new Set(Array.from({ length: 40 }, (_, s) => gigiLine('arosa', s))).size > 1, 'not always the same one');
});

test('the mission is registered: its pin apart from the others, by points, with a table for players', () => {
  assert.equal(QUIZ_MISSIONS.length, 1);
  assert.equal(getMission('gigi-schaetzt'), GIGI_MISSION);
  assert.equal(GIGI_MISSION.board, 'gigi-schaetzt-1');
  assert.equal(GIGI_MISSION.quiz, true);
  assert.equal(GIGI_MISSION.scoreMode, 'points');
  assert.equal(GIGI_MISSION.score(GIGI_MISSION.createState()), 0);
  assert.deepEqual(GIGI_MISSION.summary(GIGI_MISSION.createState()), []);
  assert.equal(GIGI_MISSION.summary({ game: { done: true, place: 5, seats: 5, pays: true } })[1], 'You pay the round');
  const s = GIGI_MISSION.start;
  for (const m of MISSIONS) {
    if (m === GIGI_MISSION) continue;
    const p = m.pin || m.start;
    if (Number.isFinite(p?.x)) assert.ok(Math.hypot(p.x - s.x, p.z - s.z) > 30, `the pin is apart from ${m.id}`);
  }
  const walk = Math.hypot(s.x - QUIZ.table.x, s.z - QUIZ.table.z);
  assert.ok(walk > QUIZ.table.r + 2 && walk < 20, 'a few steps to the table');
  // the steps: to the table (or seated by the session), then the round
  const [table, round] = GIGI_MISSION.objectives;
  const frame = { mode: 'person', x: s.x, z: s.z };
  assert.equal(table.check(frame, { seated: false }).done, false);
  assert.equal(table.check(frame, { seated: true }).done, true, 'with other players the round starts seated');
  assert.equal(table.check({ mode: 'person', x: QUIZ.table.x + 1, z: QUIZ.table.z }, { seated: false }).done, true);
  assert.equal(round.check(frame, { game: null }).done, false);
  assert.equal(round.check(frame, { game: { done: true, progress: 1, text: 'Question 3 of 3' } }).done, true);
});

test('the table\'s modules load on demand only, the game\'s start knows nothing of them', () => {
  const html = read('play.html');
  for (const module of ['quiz-session', 'quiz-ui']) assert.ok(!html.includes(`href="./js/${module}.js"`), `${module} is not preloaded`);
  for (const module of ['missions-data-quiz', 'missions-quiz']) assert.ok(html.includes(`href="./js/${module}.js"`), `${module} is preloaded with the other missions`);
  const missions = read('js/missions.js');
  assert.doesNotMatch(missions, /^import .*quiz-(session|ui)/m, 'js/missions.js loads the lobby on demand');
  assert.match(missions, /import\('\.\/quiz-ui\.js'\)/);
  assert.match(missions, /get\('quiz'\)/, 'a link ?quiz=<CODE> opens the table');
  assert.match(missions, /'Play together'/);
  const feature = read('js/missions-quiz.js');
  assert.doesNotMatch(feature, /^import .*(quiz-session|race-net|account)/m, 'the mission itself needs no network');
  assert.match(feature, /inputMode: 'numeric'/, 'a number pad on a phone');
  assert.match(feature, /'gq player-name'/, 'the card translates itself: names stay as typed');
  assert.match(read('js/quiz-session.js'), /joinRoom\(`quiz:\$\{this\.code\}`/);
  assert.doesNotMatch(read('js/main.js'), /quiz-/, 'nothing of the table in the game\'s start');
  assert.equal(quizHandoff.table, null);
});

// --- the session, on a wire of its own ----------------------------------------------------------------------------------
test('two players at a table: the host starts, both get the same round, a guess shows at the other seat at once', async (t) => {
  let QuizSession;
  try { ({ QuizSession } = await import('../js/quiz-session.js')); } catch (error) { t.skip(`js/quiz-session.js does not load outside a browser: ${error.message}`); return; }
  const kept = new Map();
  globalThis.localStorage ??= { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)) };
  const sessions = [];
  const started = [];
  const make = (id, joinedAt) => {
    const manager = { start: (missionId) => { const run = { id: missionId, start() { started.push(id); } }; return run; } };
    const s = new QuizSession({ code: 'ABCD', me: { id, name: `Player ${id}` }, def: GIGI_MISSION, manager });
    s.net = { send: (event, payload) => { for (const o of sessions) if (o !== s) o.onEvent(event, JSON.parse(JSON.stringify(payload))); }, track() {}, leave: async () => {} };
    s.joinedAt = joinedAt;
    sessions.push(s);
    return s;
  };
  const a = make('aaa', 1), b = make('bbb', 2);
  const members = [{ id: 'aaa', name: 'Anna', joinedAt: 1 }, { id: 'bbb', name: 'Beat', joinedAt: 2 }];
  a.onPresence(members); b.onPresence(members);
  assert.equal(a.isHost, true);
  assert.equal(b.isHost, false);
  b.start();
  assert.equal(b.round, null, 'only the host starts a round');
  a.start();
  assert.deepEqual(started.sort(), ['aaa', 'bbb']);
  assert.equal(quizHandoff.table, null, 'the hand-over is taken back');
  assert.deepEqual(b.round.qids, a.round.qids);
  assert.equal(b.round.seed, a.round.seed);
  assert.deepEqual(b.round.seats.map((s) => s.id), a.round.seats.map((s) => s.id));
  assert.deepEqual(a.round.seats.map((s) => s.name).slice(0, 2), ['Anna', 'Beat']);
  assert.equal(a.round.seats.length, 4, 'two regulars fill the table');
  assert.equal(a.seated && b.seated, true);
  // a guess: not before the question, then once; the other seat sees it is in
  assert.equal(b.guess(0, 500), false);
  const now = Date.now;
  try {
    const fixed = at(a.round, 0, 'guess', 2000); // (a moment on the clock, whatever is cut out of the round later)
    Date.now = () => fixed;
    let told = 0;
    a.on((what) => { if (what === 'guess') told++; });
    assert.equal(b.guess(0, 500), true);
    assert.equal(told, 1);
    assert.equal(hasGuessed(a.round, a.round.seats[1], 0, 2000), true, 'the host sees that the other has guessed');
    assert.equal(hasGuessed(a.round, a.round.seats[0], 0, 2000), false);
    assert.equal(b.guess(0, 700), false);
    b.sendGuesses(); // (once more: nothing changes)
    assert.equal(told, 1);
    // the host guesses too: everyone is in, the countdown is not waited for, on both clocks the same
    assert.ok(Math.abs(roundPhase(b.round, Date.now()).left - (QUIZ.guessMs - 2000)) < 2);
    assert.equal(a.guess(0, 400), true);
    for (const s of [a, b]) {
      const p = roundPhase(s.round, Date.now());
      assert.equal(p.phase, 'guess');
      assert.ok(Math.abs(p.left - 1500) < 2, `a moment is left: ${p.left}`);
      for (const seat of s.round.seats) assert.equal(hasGuessed(s.round, seat, 0, QUIZ.guessMs - 1), true, 'the regulars are in before the reveal');
    }
    assert.equal(a.round.skip, b.round.skip);
    assert.equal(endGuessing(a.round, 0, Date.now()), 0, 'once a question');
    assert.equal(roundPhase(a.round, Date.now() + 1502).phase, 'reveal');
    // a guess of another round is not taken
    a.onEvent('guess', { id: 'bbb', r: a.round.seed + 1, g: [1, 2, 3] });
    assert.deepEqual(a.round.guesses.get('bbb'), [500, null, null]);
    // a start that is not the host's is not taken
    const seed = a.round.seed;
    a.onEvent('start', { from: 'bbb', at: 1, seed: 5, qids: pickQuestions(5), ids: ['aaa', 'bbb'] });
    assert.equal(a.round.seed, seed);
  } finally { Date.now = now; }
  // the host leaves: the other one is the host now and starts the next round
  b.onPresence([members[1]]);
  assert.equal(b.isHost, true);
  assert.deepEqual(b.round.seats.map((s) => s.id).slice(0, 2), ['aaa', 'bbb'], 'who left keeps their seat to the end of the round');
  b.start();
  assert.deepEqual(b.round.seats.filter((s) => !s.bot).map((s) => s.id), ['bbb']);
  // leaving
  let left = 0;
  b.on((what) => { if (what === 'left') left++; });
  b.detach(b.run);
  assert.equal(left, 1);
  assert.equal(b.left, true);
});

test('a table that holds together: a lost cut comes with the host\'s guesses, another version does not start, a leave during the join lets the wire go', async (t) => {
  let QuizSession, QUIZ_PROTOCOL;
  try { ({ QuizSession, QUIZ_PROTOCOL } = await import('../js/quiz-session.js')); } catch (error) { t.skip(`js/quiz-session.js does not load outside a browser: ${error.message}`); return; }
  const kept = new Map();
  globalThis.localStorage ??= { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)) };
  const sessions = [];
  const lost = new Set(); // the events that do not arrive
  const tracked = [];
  const make = (id) => {
    const manager = { start: (missionId) => ({ id: missionId, start() {} }) };
    const s = new QuizSession({ code: 'ABCD', me: { id, name: id }, def: GIGI_MISSION, manager });
    s.net = { send: (event, payload) => { if (lost.has(event)) return; for (const o of sessions) if (o !== s) o.onEvent(event, JSON.parse(JSON.stringify(payload))); }, track: (o) => tracked.push([id, o]), leave: async () => {} };
    sessions.push(s);
    return s;
  };
  const a = make('aaa'), b = make('bbb');
  const members = [{ id: 'aaa', name: 'Anna', joinedAt: 1 }, { id: 'bbb', name: 'Beat', joinedAt: 2 }];
  a.onPresence(members); b.onPresence(members);
  // a start of another version is not taken, and says so
  let errors = 0;
  b.on((what) => { if (what === 'error') errors++; });
  b.onEvent('start', { from: 'aaa', at: Date.now(), seed: 5, qids: pickQuestions(5), ids: ['aaa', 'bbb'] });
  assert.equal(b.round, null);
  assert.equal(errors, 1);
  a.start();
  assert.equal(b.round.seed, a.round.seed, `the wire's version ${QUIZ_PROTOCOL} rides in the start`);
  const now = Date.now;
  try {
    const fixed = at(a.round, 0, 'guess', 2000);
    Date.now = () => fixed;
    assert.equal(b.guess(0, 500), true);
    lost.add('cut');
    assert.equal(a.guess(0, 400), true); // (everyone is in: the host cuts, but b hears nothing of it)
    assert.ok(a.round.skip > 0);
    assert.equal(b.round.skip, 0, 'the cut was lost');
    a.sendGuesses(); // (the host's guesses once more, as at the reveal: the cut rides along)
    assert.equal(b.round.skip, a.round.skip, 'the clocks are together again');
    // or by the presence: someone back from a lost connection is told again
    b.round.skip = 0; b.round.cuts = [];
    lost.clear();
    a.onPresence(members);
    assert.equal(b.round.skip, a.round.skip);
    // between two rounds the presence says so again
    assert.equal(a.phase, 'playing');
    a.rest();
    assert.equal(a.phase, 'playing', 'not while the round is on');
    Date.now = () => fixed + 10 * 60 * 1000;
    a.rest(); a.rest();
    assert.equal(a.phase, 'lobby');
    assert.deepEqual(tracked.filter(([id, o]) => id === 'aaa' && o.phase === 'lobby').length, 1);
  } finally { Date.now = now; }
  for (const s of sessions) s.left = true; // (no more of the timers' messages)
  // R is no restart of one's own at a table with others, and a pasted link is cut to no wrong code
  assert.match(read('js/missions-quiz.js'), /noRestart: \(run\) => !!run\._gq\?\.session/);
  assert.match(read('js/missions.js'), /f\.noRestart\?\.\(this\)/);
  assert.doesNotMatch(read('js/race-ui.js'), /maxLength: 12/);
  assert.match(read('js/quiz-session.js'), /if \(this\.left\) \{ net\?\.leave\(\); return this; \}/);
  assert.match(read('js/race-session.js'), /if \(this\.left\) \{ net\?\.leave\(\); return this; \}/);
});

// --- the languages ------------------------------------------------------------------------------------------------------
test('every text of the round has its German: the questions, the units, Gigi, the regulars, the card, the lobby', async () => {
  const saved = new Map([['slopdavos-language', 'de']]);
  globalThis.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter ??= { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document ??= {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  if (!globalThis.navigator?.language) Object.defineProperty(globalThis, 'navigator', { value: { language: 'de-CH' }, configurable: true });
  const before = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) };
  globalThis.window ??= { dispatchEvent() {} };
  const { t, setLanguage, getLanguage } = await import('../js/i18n.js');
  setLanguage('de');
  assert.equal(getLanguage(), 'de');
  const same = new Set(['km', 'm', 'm²', 'Zambonis']); // (the same in both languages)
  const source = [read('js/missions-quiz.js'), read('js/quiz-ui.js')].join('\n');
  const texts = [
    ...quizTexts(), GIGI_MISSION.title, GIGI_MISSION.intro, GIGI_MISSION.finish, ...GIGI_MISSION.objectives.map((o) => o.title),
    'Gigi takes a sip', 'Type a number and press Enter', 'You pay the round', 'The round is on the others', 'Someone else pays the round',
    'The host starts the next round.', 'More than 10 at the table: the first 10 play, the others the next round.', 'Play together', 'You', 'pts', '2310 pts',
    // (every text the card and the lobby hand to t() or to the page)
    ...[...source.matchAll(/tr\('((?:[^'\\]|\\.)+)'\)/g)].map((m) => m[1]),
    ...[...source.matchAll(/(?:invalid|invalidShort|joinOther|join|codeLabel|nameLabel|about|start|startAlone|waiting|joining|share|error|unreachable): '((?:[^'\\]|\\.)+)'/g)].map((m) => m[1]),
    'A round is on at this table. You are in for the next one.', 'The table', 'pays the round', 'Another round', 'Leave the table', 'your guess', 'lock it in'
  ];
  assert.ok(new Set(texts).size > 110, `${new Set(texts).size} texts`);
  for (const text of new Set(texts)) {
    if (same.has(text)) continue;
    const de = t(text);
    assert.notEqual(de, text, `no German for: ${text}`);
    assert.doesNotMatch(de, /ß/, `Swiss spelling: ${de}`);
  }
  assert.equal(t('Question {n} of {m}'), 'Frage {n} von {m}');
  // (the running texts are made with msg(), js/messages.js: made by the mission, then translated)
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de, en); };
  says(questionText(2, 3), 'Question 2 of 3', 'Frage 2 von 3');
  const T = QUIZ.table, near = { mode: 'person', x: T.x + 8, z: T.z, y: 0, t: 0, dt: 0.1 };
  says(GIGI_MISSION.objectives[0].check(near, GIGI_MISSION.createState()).text, '8 m to Gigi’s table', '8 m bis zu Gigis Tisch');
  says(GIGI_MISSION.summary({ game: { done: true, place: 2, seats: 5, pays: false } })[0], 'Place 2 of 5 at the table', 'Platz 2 von 5 am Tisch');
  assert.match(t(GIGI_MISSION.intro), /^Après-Ski unter der Schirmbar/);
  // (the placeholders survive the translation)
  for (const text of new Set(texts)) for (const hole of text.match(/\{\w+\}/g) || []) assert.ok(t(text).includes(hole), `${text}: ${hole}`);
  setLanguage('en');
  assert.equal(t(GIGI_MISSION.title), GIGI_MISSION.title);
  globalThis.localStorage = before;
});
