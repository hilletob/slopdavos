import { fetchBoard } from './leaderboard.js';
import { el } from './dom.js';
import { msg } from './messages.js';

// js/leaderboard-ui.js
// A list in a mission's intro and end dialog, and the lists of the overview (js/leaderboard-overview.js). textContent only,
// and .player-name keeps js/i18n.js off the players' names.

/** A gap between two times: seconds below a minute, else mm:ss.d */
export const timeGap = (ms, format) => (ms < 60000 ? `${(Math.max(0, ms) / 1000).toFixed(1)} s` : format(ms));

/** A gap in points */
export const pointsGap = (n) => `${Math.max(0, Math.round(n))} points`;

/** How a list's lines are shown and compared: by time, or by score (`score(v)` writes one with its unit) */
export function listKind({ format, score = null }) {
  if (score) return { value: (r) => -r.score, gap: (n) => score(n), show: (r) => score(r.score) };
  return { value: (r) => r.total_ms, gap: (ms) => timeGap(ms, format), show: (r) => format(r.total_ms) };
}

/** How the player stands against the others, in one line (null: the player is not on the list). `value(row)`: the line's
 *  time or points, `gap(n)`: a difference written out */
export function compareText(rows, { value, gap }) {
  const me = rows.find((r) => r.is_me);
  if (!me) return null;
  const at = (place) => rows.find((r) => r.place === place);
  const players = me.players;
  if (me.place === 1) {
    const second = at(2);
    return second ? `You lead by ${gap(Math.abs(value(second) - value(me)))} over place 2` : 'You lead';
  }
  const parts = [`Place ${me.place} of ${players}`];
  const above = at(me.place - 1);
  if (above) parts.push(`${gap(Math.abs(value(me) - value(above)))} behind place ${above.place}`);
  const first = at(1);
  if (first && me.place > 2) parts.push(`${gap(Math.abs(value(me) - value(first)))} behind the leader`);
  return parts.join(' · ');
}

/** The lines of a list (a gap in the places: …) */
export function boardList(rows, show) {
  const list = el('ol', 'mission-board-list');
  let last = 0;
  for (const row of rows) {
    if (row.place > last + 1) list.append(el('li', 'mission-board-gap', '…'));
    last = row.place;
    const li = el('li', row.is_me ? 'is-me' : null);
    li.dataset.place = String(row.place); // (css/style.css: the first three in the medals' colours)
    li.append(el('span', 'mission-board-place', String(row.place)), el('span', 'mission-board-name player-name', row.name), el('span', 'mission-board-time', show(row)));
    list.append(li);
  }
  return list;
}

/** "Rank 3 of 17" (with its German, js/messages.js) */
export const rankText = (rank, players) => msg('Rank {rank} of {players}', 'Rang {rank} von {players}', { rank, players });

/** What the end dialog says about the run (no result: the backend could not be reached, or the run was refused) */
function runNote(result, signedIn) {
  if (!signedIn) return 'Sign in from the account menu to join the leaderboard.';
  if (result?.accepted) return rankText(result.rank, result.players);
  return 'This run was not counted. Your result stays on this device.';
}

/** Fills `node`. `score`: writes a score (a list of scores), `submission`: the run just finished (the end dialog),
 *  `signedIn`: whether there is a player to place */
export async function showBoard(node, board, { format, score = null, submission = null, ended = false, signedIn = true }) {
  const status = el('p', 'mission-dialog-note', 'Loading the leaderboard…');
  node.replaceChildren(el('h3', 'mission-board-title', 'Leaderboard'), status);
  const result = ended && signedIn ? await submission?.catch(() => null) : null;
  const notes = ended ? [el('p', `mission-board-note${result?.accepted ? ' is-ranked' : ''}`, runNote(result, signedIn))] : [];
  let rows;
  try {
    rows = await fetchBoard(board);
  } catch {
    status.textContent = 'The leaderboard is not reachable right now.';
    status.before(...notes);
    return;
  }
  status.remove();
  node.append(...notes);
  if (!rows.length) { node.append(el('p', 'mission-dialog-note', score ? 'No scores yet. Be the first.' : 'No times yet. Be the first.')); return; }
  const kind = listKind({ format, score });
  const compare = !ended && compareText(rows, kind);
  if (compare) node.append(el('p', 'mission-board-note is-ranked', compare));
  node.append(boardList(rows, kind.show));
}
