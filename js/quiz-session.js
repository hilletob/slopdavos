import { electHost, offsetFromPings, releaseTime, displayName } from './race-protocol.js';
import { joinRoom } from './race-net.js';
import { QUIZ, quizHandoff, pickQuestions, seenQuestions, noteQuestions, tableSeats, createRound, lockGuess, mergeGuesses, roundPhase, getQuestion, endGuessing } from './missions-data-quiz.js';

// js/quiz-session.js
// Gigi's table with other players (js/missions-data-quiz.js has the game, js/missions-quiz.js shows it, js/quiz-ui.js the
// lobby): a room like a race's (js/race-session.js), on the channel `quiz:<CODE>`. The presence says who sits at the
// table, the host is whoever joined first, the clocks are matched to the host's by ping/pong.
//  - `start { from, at, seed, qids, ids }`: the host's "Start the round". The three questions and the seed are the
//    host's choice, `at` the moment on its clock the round begins, `ids` who sits at the table (the first ten). From
//    there the whole round runs by the clock on every client: nothing more is needed from the host, and if it leaves
//    the round goes on to its end.
//  - `guess { id, r, g: [v0, v1, v2] }`: a player's guesses of the round `r` (its seed) so far, sent when one is locked
//    in, again a moment later and once more as the guessing time ends (a broadcast may be lost). The others show at once that the player has
//    guessed; the number itself only at the reveal. Every client works the points out for itself.
//  - `cut { from, r, q, at }`: the host's "everyone has guessed": once every player still in the room has locked a
//    guess for question `q`, its guessing time ends at `at` (the host's clock, a moment ahead) instead of running out.
//    Every client cuts the same out of its schedule (endGuessing), so the clocks stay together. Sent twice.
// Only ids, seeds and numbers go over the wire, never a text: each client shows the round in its own language.
// The session lives from the lobby over as many rounds as the host starts to the moment the player leaves; a round is
// a run of the mission (js/missions.js), which takes the session as its table through quizHandoff.

export const QUIZ_EVENTS = ['ping', 'pong', 'start', 'guess', 'cut'];
export const SEAT_COLOURS = ['#3fd6ff', '#ffb347', '#7ee787', '#ff7eb6', '#c3a6ff', '#ffe066', '#5eead4', '#fb923c', '#a3e635', '#f472b6'];
const PING_SAMPLES = 6, PING_GAP_MS = 350;
const RESEND_MS = 1500;
const CUT_REST_MS = 1500; // what is left of the guessing time once everyone has guessed
const START_DELAY_MS = 1500; // from the host's click to the round's start, on its clock (the message's way and the run's set-up)

export class QuizSession {
  /**
   * @param {object} o
   * @param {string} o.code the room's code
   * @param {{ id: string, name: string }} o.me this player
   * @param {object} o.def the mission (js/missions-data-quiz.js GIGI_MISSION)
   * @param {object} o.manager js/missions-manager.js MissionManager
   */
  constructor({ code, me, def, manager }) {
    this.code = code;
    this.me = { id: me.id, name: displayName(me.name, me.id) };
    this.def = def;
    this.manager = manager;
    this.members = [];
    this.players = new Map(); // id -> { id, name, joinedAt, colour }
    this.listeners = new Set();
    this.net = null;
    this.hostId = null;
    this.offset = 0; // ms the host's clock is ahead of this one
    this.pings = [];
    this.round = null; // js/missions-data-quiz.js createRound
    this.run = null;
    this.restarting = false;
    this.left = false;
    this.phase = 'lobby'; // lobby | playing | left
    this.status = '';
    this.solo = false;
  }

  /** fn(what, session): 'members', 'status', 'racing' (a round begins), 'guess', 'watching', 'left', 'error' */
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { for (const fn of this.listeners) { try { fn(what, this); } catch (error) { console.warn('[quiz] listener', error); } } }

  async join() {
    this.net = await joinRoom(`quiz:${this.code}`, QUIZ_EVENTS, { id: this.me.id, name: this.me.name, mission: this.def.id, phase: 'lobby' }, {
      onPresence: (members) => this.onPresence(members),
      onEvent: (event, payload) => this.onEvent(event, payload),
      onStatus: (status) => { this.status = status; this.emit('status'); }
    }, 'quiz');
    this.onPresence(this.net.members());
    this.measureOffset(); // (the first presence may have come before the wire stood: the host is known, the offset not yet)
    return this;
  }

  get host() { return electHost(this.members); }
  get isHost() { return this.host === this.me.id; }
  get hostMember() { return this.members.find((m) => m.id === this.host) || null; }
  /** Whether this player has a seat in the round that is on */
  get seated() { return !!this.round?.guesses.has(this.me.id); }

  /** The name the others see (the lobby's field) */
  setName(name) {
    this.me.name = displayName(name, this.me.id);
    const p = this.players.get(this.me.id);
    if (p) p.name = this.me.name;
    this.net?.track({ name: this.me.name });
    this.renameSeats();
  }

  // --- The room --------------------------------------------------------------------------------------------------------
  /** The players in the order they came (the seats' order, the same on every client) */
  ordered() { return [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)); }

  onPresence(members) {
    if (this.left) return;
    this.members = members;
    const present = new Set();
    for (const m of members) {
      present.add(m.id);
      const name = displayName(m.name, m.id);
      const p = this.players.get(m.id);
      if (!p) this.players.set(m.id, { id: m.id, name, joinedAt: m.joinedAt || 0, colour: '' });
      else p.name = name;
    }
    for (const id of [...this.players.keys()]) if (!present.has(id)) this.players.delete(id);
    this.ordered().forEach((p, i) => { p.colour = SEAT_COLOURS[i % SEAT_COLOURS.length]; });
    this.renameSeats();
    this.maybeCut(); // (the one everybody waited for has left)
    const host = this.host;
    if (host !== this.hostId) { this.hostId = host; this.measureOffset(); }
    this.emit('members');
  }

  /** (a name changed in the lobby or at the table: the round's seats follow; who left keeps their seat and guesses) */
  renameSeats() {
    if (!this.round) return;
    for (const seat of this.round.seats) { const p = this.players.get(seat.id); if (p && !seat.bot) seat.name = p.name; }
  }

  /** A few pings to the host; the median of the answers is the offset (nothing to do for the host itself) */
  measureOffset() {
    this.pings = [];
    this.offset = 0;
    if (this.isHost || !this.net) return;
    let n = 0;
    const tick = () => {
      if (this.left || this.isHost || !this.net || n >= PING_SAMPLES) return;
      n++;
      this.net.send('ping', { from: this.me.id, sent: Date.now() });
      setTimeout(tick, PING_GAP_MS);
    };
    tick();
  }

  onEvent(event, p) {
    if (this.left || !p || typeof p !== 'object') return;
    switch (event) {
      case 'ping':
        if (this.isHost && p.from) this.net?.send('pong', { to: p.from, sent: p.sent, hostNow: Date.now() });
        break;
      case 'pong':
        if (p.to === this.me.id) { this.pings.push({ sent: p.sent, received: Date.now(), hostNow: p.hostNow }); this.offset = offsetFromPings(this.pings); }
        break;
      case 'start':
        if (p.from === this.host && Number.isFinite(p.at) && Number.isFinite(p.seed) && Array.isArray(p.qids) && Array.isArray(p.ids)) this.onStart(p.at, p.seed, p.qids, p.ids);
        break;
      case 'guess':
        if (this.round && p.r === this.round.seed && typeof p.id === 'string' && p.id !== this.me.id && mergeGuesses(this.round, p.id, p.g)) { this.emit('guess'); this.maybeCut(); }
        break;
      case 'cut':
        if (this.round && p.r === this.round.seed && p.from === this.host && p.from !== this.me.id && endGuessing(this.round, p.q, releaseTime(p.at, this.offset))) this.emit('guess');
        break;
      default:
    }
  }

  // --- A round ---------------------------------------------------------------------------------------------------------
  /** The host's button (the lobby's "Start the round", the end dialog's "Another round"): the questions, the seed, the moment */
  start() {
    if (!this.net || this.left || !this.isHost) return;
    const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    const qids = pickQuestions(seed, seenQuestions());
    const ids = this.ordered().slice(0, QUIZ.maxPlayers).map((p) => p.id);
    const at = Date.now() + START_DELAY_MS;
    this.net.send('start', { from: this.me.id, at, seed, qids, ids });
    this.onStart(at, seed, qids, ids);
  }

  onStart(at, seed, qids, ids) {
    if (qids.length !== QUIZ.questions || !qids.every((id) => typeof id === 'string' && getQuestion(id))) { this.emit('error'); return; } // (another version's questions)
    const players = ids.map((id) => this.players.get(id) || { id, name: displayName('', id), colour: '#fff' });
    this.round = createRound({ seed, qids, startAt: releaseTime(at, this.offset), seats: tableSeats(players), solo: false });
    noteQuestions(qids);
    if (!this.seated) { this.emit('watching'); return; } // (the table was full: the next round)
    this.phase = 'playing';
    this.restarting = true; // (the run before, if any, is torn down by the manager: not a leave)
    let run = null;
    quizHandoff.table = this; // (js/missions-quiz.js takes it as the run's table)
    try { run = this.manager.start(this.def.id); } finally { this.restarting = false; quizHandoff.table = null; }
    if (!run) { this.emit('error'); return; }
    this.run = run;
    run.start(); // (no briefing: the table is waiting)
    this.net?.track({ phase: 'playing' });
    this.emit('racing');
  }

  /** This player's guess for question `qi`, told to the others; false when it does not count (too late, one is in already) */
  guess(qi, value) {
    if (!this.round || !lockGuess(this.round, this.me.id, qi, value, Date.now())) return false;
    this.sendGuesses();
    this.maybeCut();
    setTimeout(() => { if (!this.left) this.sendGuesses(); }, RESEND_MS); // (a broadcast is not acknowledged: the others' tick should not hang on one message)
    return true;
  }
  /** The host: every player still in the room has guessed the question that is on, so nobody waits for the clock */
  maybeCut() {
    const round = this.round;
    if (!round || !this.net || this.left || !this.isHost) return;
    const now = Date.now(), p = roundPhase(round, now);
    if ((p.phase !== 'guess' && p.phase !== 'ask') || round.cuts?.[p.q]) return;
    if ((p.phase === 'ask' ? p.left + QUIZ.guessMs : p.left) < CUT_REST_MS + 1000) return;
    const here = round.seats.filter((seat) => !seat.bot && this.players.has(seat.id)); // (who left does not hold the table up)
    if (!here.length || !here.every((seat) => round.guesses.get(seat.id)?.[p.q] != null)) return;
    const cut = { from: this.me.id, r: round.seed, q: p.q, at: now + CUT_REST_MS };
    this.net.send('cut', cut);
    setTimeout(() => { if (!this.left && this.round === round) this.net?.send('cut', cut); }, 500);
    endGuessing(round, p.q, cut.at);
    this.emit('guess');
  }
  /** (once more as the guessing time ends, js/missions-quiz.js: a broadcast may have been lost) */
  sendGuesses() {
    const g = this.round?.guesses.get(this.me.id);
    if (g && g.some((v) => v !== null)) this.net?.send('guess', { id: this.me.id, r: this.round.seed, g });
  }
  /** The round is through its last reveal */
  get over() { return !this.round || roundPhase(this.round, Date.now()).phase === 'done'; }

  /** js/missions-quiz.js teardown: the run is gone. Unless the next round is just starting, this is the leave */
  detach(run) {
    if (run !== this.run) return;
    this.run = null;
    if (!this.restarting) this.leave();
  }

  async leave() {
    if (this.left) return;
    this.left = true;
    this.phase = 'left';
    const net = this.net;
    this.net = null;
    this.emit('left');
    await net?.leave();
  }
}
