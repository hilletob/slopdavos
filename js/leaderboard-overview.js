import { MISSIONS, formatTime, scoreText } from './missions-data.js';
import { FREE_FLIGHT_BOARD, freeFlightText } from './missions-data-paraglide.js';
import { fetchBoard, fetchPoints } from './leaderboard.js';
import { el, boardList, compareText, listKind, pointsGap } from './leaderboard-ui.js';

// js/leaderboard-overview.js
// All the leaderboards, the second tab of the missions' dialog (js/missions.js): the overall list of the missions' points
// (from the cloud saves) and every mission's list (times, or scores for a mission judged by points), each with the top
// and the lines around the player. A select picks the list: there is one for every mission.

const LAST_KEY = 'slopdavos-leaderboard-last'; // (the list picked last time, a convenience only)

/** The lists: the overall points first, then every mission in the game's order, by time and by points */
export function overviewTabs(missions = MISSIONS) {
  const ranked = missions.filter((m) => m.board);
  return [
    { id: 'points', group: 'Overall', label: 'Mission points', title: 'Mission points' },
    ...ranked.filter((m) => !m.scoreMode).map((m) => ({ id: m.board, group: 'By time', label: m.title, title: m.title, def: m })),
    ...ranked.filter((m) => m.scoreMode).map((m) => ({ id: m.board, group: 'By points', label: m.title, title: m.title, def: m })),
    { id: FREE_FLIGHT_BOARD, group: 'Free play', label: 'Longest free flight', title: 'Longest free flight', free: true }
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

// The free flight's list (js/paraglide-free.js): the furthest distance from the launch, the time in the air beside it
const FREE_FLIGHT = {
  load: () => fetchBoard(FREE_FLIGHT_BOARD),
  value: (r) => -r.score,
  gap: (m) => freeFlightText(m),
  show: (r) => `${freeFlightText(r.score)} · ${formatTime(r.total_ms)}`,
  empty: 'No flights yet. Be the first.',
  hint: 'The furthest a paraglider got from where it took off, with the time in the air. Only a soft landing counts. With the licence: P on a slope.'
};

const remembered = () => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } };
const remember = (id) => { try { localStorage.setItem(LAST_KEY, id); } catch { /* */ } };

/** Renders the lists into `container` (the leaderboards tab of the missions' dialog, js/missions.js). `signedIn`: whether
 *  there is a player to place, `start`: the list to show first (else the one picked last time) */
export function renderLeaderboards(container, { signedIn = false, start = null } = {}) {
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
    const kind = tab.free ? FREE_FLIGHT : tab.def ? listOf(tab.def) : POINTS;
    body.replaceChildren(el('h3', 'mission-board-title', tab.title), el('p', 'mission-dialog-note', 'Loading the leaderboard…'));
    let rows;
    try { rows = await kind.load(); } catch { rows = null; }
    if (ticket !== shown || !body.isConnected) return; // (another list was picked meanwhile, or the dialog is gone)
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

  container.replaceChildren(picker, body);
  const first = start || remembered();
  show(tabs.find((t) => t.id === first) || tabs[0]);
  return { show: (id) => show(tabs.find((t) => t.id === id) || tabs[0]) };
}
