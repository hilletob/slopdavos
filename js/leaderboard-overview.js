import { MISSIONS, formatTime } from './missions-data.js';
import { fetchBoard, fetchPoints } from './leaderboard.js';
import { el, boardList, compareText, timeGap, pointsGap } from './leaderboard-ui.js';

// js/leaderboard-overview.js
// All the leaderboards in one dialog, opened from the account menu or the mission list: the overall list of the missions'
// points (from the cloud saves) and every mission's list of times, each with the top and the lines around the player.

const OVERLAY_ID = 'leaderboard-overlay';

/** The tabs: the overall points first, then every ranked mission */
export function overviewTabs(missions = MISSIONS) {
  return [
    { id: 'points', label: 'Overall', title: 'Mission points' },
    ...missions.filter((m) => m.board).map((m) => ({ id: m.board, label: m.title, title: m.title }))
  ];
}

const POINTS = {
  load: () => fetchPoints(),
  value: (r) => r.points,
  gap: pointsGap,
  show: (r) => `${r.points} pts`,
  empty: 'No points on the list yet.',
  hint: 'The points of your missions, from your cloud save. Every medal counts.'
};
const timesOf = (board) => ({
  load: () => fetchBoard(board),
  value: (r) => r.total_ms,
  gap: (ms) => timeGap(ms, formatTime),
  show: (r) => formatTime(r.total_ms),
  empty: 'No times yet. Be the first.',
  hint: 'The best time of every player, by day.'
});

export const closeLeaderboards = () => document.getElementById(OVERLAY_ID)?.remove();

/** Opens the dialog. `signedIn`: whether there is a player to place */
export function openLeaderboards({ signedIn = false, start = 'points' } = {}) {
  closeLeaderboards();
  const overlay = el('div', 'mission-overlay leaderboard-overlay');
  overlay.id = OVERLAY_ID;
  const panel = el('div', 'panel mission-dialog leaderboard-dialog');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Leaderboards');
  const tabs = overviewTabs();
  const bar = el('div', 'leaderboard-tabs');
  bar.setAttribute('role', 'tablist');
  const body = el('div', 'mission-board leaderboard-body');
  body.setAttribute('aria-live', 'polite');
  let shown = 0;

  const show = async (tab) => {
    const ticket = ++shown;
    for (const b of bar.children) b.setAttribute('aria-selected', String(b.dataset.tab === tab.id));
    const kind = tab.id === 'points' ? POINTS : timesOf(tab.id);
    body.replaceChildren(el('h3', 'mission-board-title', tab.title), el('p', 'mission-dialog-note', 'Loading the leaderboard…'));
    let rows;
    try { rows = await kind.load(); } catch { rows = null; }
    if (ticket !== shown) return; // (another tab was picked meanwhile)
    const parts = [el('h3', 'mission-board-title', tab.title), el('p', 'mission-board-note', kind.hint)];
    if (!rows) parts.push(el('p', 'mission-dialog-note', 'The leaderboard is not reachable right now.'));
    else {
      const compare = compareText(rows, kind);
      if (compare) parts.push(el('p', 'mission-board-note is-ranked', compare));
      else parts.push(el('p', 'mission-board-note', signedIn ? 'You are not on this list yet.' : 'Sign in from the account menu to appear here and compare yourself.'));
      parts.push(rows.length ? boardList(rows, kind.show) : el('p', 'mission-dialog-note', kind.empty));
    }
    body.replaceChildren(...parts);
  };

  for (const tab of tabs) {
    const b = el('button', 'leaderboard-tab', tab.label);
    b.type = 'button';
    b.dataset.tab = tab.id;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => show(tab));
    bar.append(b);
  }

  const close = el('button', 'mission-btn mission-btn-secondary', 'Close');
  close.type = 'button';
  const onKey = (e) => {
    if (!overlay.isConnected) { document.removeEventListener('keydown', onKey, true); return; } // (closed from outside)
    if (e.key === 'Escape') { e.stopPropagation(); done(); }
  };
  const done = () => { document.removeEventListener('keydown', onKey, true); overlay.remove(); };
  close.addEventListener('click', done);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) done(); });
  document.addEventListener('keydown', onKey, true);

  panel.append(el('div', 'mission-kicker', 'Leaderboards'), el('h2', 'mission-dialog-title', 'How you compare'), bar, body, close);
  overlay.append(panel);
  document.body.append(overlay);
  show(tabs.find((t) => t.id === start) || tabs[0]);
  close.focus({ preventScroll: true });
  return overlay;
}
