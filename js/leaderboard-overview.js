import { MISSIONS, formatTime, scoreText } from './missions-data.js';
import { fetchBoard, fetchPoints } from './leaderboard.js';
import { el, boardList, compareText, listKind, pointsGap } from './leaderboard-ui.js';

// js/leaderboard-overview.js
// All the leaderboards in one dialog, opened from the account menu or the mission list: the overall list of the missions'
// points (from the cloud saves) and every mission's list (times, or scores for a mission judged by points), each with the
// top and the lines around the player. A select picks the list: there is one for every mission.

const OVERLAY_ID = 'leaderboard-overlay';
const LAST_KEY = 'slopdavos-leaderboard-last'; // (the list picked last time, a convenience only)

/** The lists: the overall points first, then every mission in the game's order, by time and by points */
export function overviewTabs(missions = MISSIONS) {
  const ranked = missions.filter((m) => m.board);
  return [
    { id: 'points', group: 'Overall', label: 'Mission points', title: 'Mission points' },
    ...ranked.filter((m) => !m.scoreMode).map((m) => ({ id: m.board, group: 'By time', label: m.title, title: m.title, def: m })),
    ...ranked.filter((m) => m.scoreMode).map((m) => ({ id: m.board, group: 'By points', label: m.title, title: m.title, def: m }))
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
const listOf = (def) => {
  const score = def.scoreMode ? (v) => scoreText(def, v) : null;
  return {
    ...listKind({ format: formatTime, score }),
    load: () => fetchBoard(def.board),
    empty: score ? 'No scores yet. Be the first.' : 'No times yet. Be the first.',
    hint: score ? 'The best score of every player, by day. The faster run wins a tie.' : 'The best time of every player, by day.'
  };
};

const remembered = () => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } };
const remember = (id) => { try { localStorage.setItem(LAST_KEY, id); } catch { /* */ } };

export const closeLeaderboards = () => document.getElementById(OVERLAY_ID)?.remove();

/** Opens the dialog. `signedIn`: whether there is a player to place, `start`: the list to show first */
export function openLeaderboards({ signedIn = false, start = null } = {}) {
  closeLeaderboards();
  const overlay = el('div', 'mission-overlay leaderboard-overlay');
  overlay.id = OVERLAY_ID;
  const panel = el('div', 'panel mission-dialog leaderboard-dialog');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Leaderboards');
  const tabs = overviewTabs();

  const picker = el('label', 'leaderboard-pick');
  const select = el('select', 'leaderboard-select');
  const groups = new Map();
  for (const tab of tabs) {
    if (!groups.has(tab.group)) {
      const g = el('optgroup');
      g.label = tab.group;
      import('./i18n.js').then(({ t }) => { g.label = t(tab.group); }).catch(() => {}); // (an attribute the page's observer leaves alone)
      groups.set(tab.group, g);
      select.append(g);
    }
    const o = el('option', null, tab.label);
    o.value = tab.id;
    groups.get(tab.group).append(o);
  }
  picker.append(el('span', null, 'List'), select);

  const body = el('div', 'mission-board leaderboard-body');
  body.setAttribute('aria-live', 'polite');
  let shown = 0;

  const show = async (tab) => {
    const ticket = ++shown;
    select.value = tab.id;
    remember(tab.id);
    const kind = tab.def ? listOf(tab.def) : POINTS;
    body.replaceChildren(el('h3', 'mission-board-title', tab.title), el('p', 'mission-dialog-note', 'Loading the leaderboard…'));
    let rows;
    try { rows = await kind.load(); } catch { rows = null; }
    if (ticket !== shown) return; // (another list was picked meanwhile)
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
  select.addEventListener('change', () => show(tabs.find((t) => t.id === select.value) || tabs[0]));

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

  panel.append(el('div', 'mission-kicker', 'Leaderboards'), el('h2', 'mission-dialog-title', 'How you compare'), picker, body, close);
  overlay.append(panel);
  document.body.append(overlay);
  const first = start || remembered();
  show(tabs.find((t) => t.id === first) || tabs[0]);
  close.focus({ preventScroll: true });
  return overlay;
}
