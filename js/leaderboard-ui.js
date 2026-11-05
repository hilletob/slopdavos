import { fetchBoard } from './leaderboard.js';

// js/leaderboard-ui.js
// A list in a mission's intro and end dialog. textContent only, and .player-name keeps js/i18n.js off the players' names.

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };

/** What the end dialog says about the run (no result: the backend could not be reached, or the run was refused) */
function runNote(result, signedIn) {
  if (!signedIn) return 'Sign in from the account menu to join the leaderboard.';
  if (result?.accepted) return `Rank ${result.rank} of ${result.players}`;
  return 'This run was not counted. Your result stays on this device.';
}

/** Fills `node`. `submission`: the run just finished (the end dialog), `signedIn`: whether there is a player to place */
export async function showBoard(node, board, { format, submission = null, ended = false, signedIn = true }) {
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
  if (!rows.length) { node.append(el('p', 'mission-dialog-note', 'No times yet. Be the first.')); return; }
  const list = el('ol', 'mission-board-list');
  let last = 0;
  for (const row of rows) {
    if (row.place > last + 1) list.append(el('li', 'mission-board-gap', '…'));
    last = row.place;
    const li = el('li', row.is_me ? 'is-me' : null);
    li.append(el('span', 'mission-board-place', String(row.place)), el('span', 'mission-board-name player-name', row.name), el('span', 'mission-board-time', format(row.total_ms)));
    list.append(li);
  }
  node.append(list);
}
