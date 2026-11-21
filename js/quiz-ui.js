import { openRoomLobby, setRaceParam } from './race-ui.js';
import { QuizSession } from './quiz-session.js';
import { QUIZ } from './missions-data-quiz.js';

// js/quiz-ui.js
// The lobby of Gigi's table with other players (js/quiz-session.js): the race's lobby (js/race-ui.js openRoomLobby) with
// the table's words, opened from the mission's briefing ("Play together": a new table with a code of its own) or by a
// link ?quiz=<CODE>. Loaded on demand, like the race's.

export const QUIZ_PARAM = 'quiz';

const QUIZ_KIND = {
  param: QUIZ_PARAM,
  maxPlayers: QUIZ.maxPlayers,
  tag: 'quiz',
  makeSession: (o) => new QuizSession(o),
  // (someone who comes while a round is on, or to a full table, waits here for the next one)
  note: (session) => (session.hostMember?.phase === 'playing' && session.phase !== 'playing' ? 'A round is on at this table. You are in for the next one.' : ''),
  texts: {
    invalid: 'That table code is not valid. Ask for the link again.',
    codeLabel: 'Table code',
    nameLabel: 'Your name at the table',
    about: 'Gigi asks three questions. Everyone types a number at the same time; you see who has guessed, but the numbers stay hidden until Gigi reads the answer out. The closer, the more points; the last question counts double. Regulars fill the empty seats.',
    start: 'Start the round',
    startAlone: 'Start with the regulars',
    waiting: 'Waiting for the host to start the round.',
    joining: 'You are joining this table.',
    share: 'Share the code or the link. Up to ten players at the table.',
    tooMany: (n) => `More than ${n} at the table: the first ${n} play, the others the next round.`,
    error: 'The round could not be started here.',
    unreachable: 'The table is not reachable right now. Try again in a moment.'
  }
};

/** The lobby for the mission `def` (js/missions-data-quiz.js GIGI_MISSION): a new table, or the one of the `code` */
export const openQuizLobby = (o) => openRoomLobby(QUIZ_KIND, o);
export const clearQuizParam = () => setRaceParam(null, QUIZ_PARAM);
