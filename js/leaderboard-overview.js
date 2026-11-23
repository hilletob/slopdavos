import { MISSIONS, formatTime, scoreText } from './missions-data.js';
import { FREE_FLIGHT_BOARD, freeFlightText } from './missions-data-paraglide.js';
import { fetchBoard, fetchPoints } from './leaderboard.js';
import { el } from './dom.js';
import { boardList, compareText, listKind, pointsGap } from './leaderboard-ui.js';
import { KEYS } from './storage-keys.js';

// js/leaderboard-overview.js
// All the leaderboards, the second tab of the missions' dialog (js/missions.js): the overall list of the missions' points
// (from the cloud saves) and every mission's list (times, or scores for a mission judged by points), each with the top
// and the lines around the player. One list at a time; "All leaderboards" leads to the lists to choose from, with a search.

const LAST_KEY = KEYS.leaderboardLast; // (the list picked last time, a convenience only)

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

const fold = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Renders the lists into `container` (the leaderboards tab of the missions' dialog, js/missions.js): one list at a time,
 *  with "All leaderboards" back to the lists to choose from (a search over them, a row a list with the mission's icon).
 *  `signedIn`: whether there is a player to place, `start`: the list to show first (else the one picked last time, else
 *  the missions' points), `icon(def)`: a mission's icon as a node, `onStart(def)`: starts the mission of a list,
 *  `translate`: a title in the page's language (for the search) */
export function renderLeaderboards(container, { signedIn = false, start = null, icon = null, onStart = null, translate = (v) => v } = {}) {
  const tabs = overviewTabs();
  let shown = 0;
  const glyph = (tab) => {
    if (tab.def && icon) return icon(tab.def);
    return el('span', 'leaderboard-glyph', tab.free ? '➶' : '★');
  };

  // --- The lists to choose from ---------------------------------------------------------------------------------------
  const chooser = () => {
    shown++;
    const search = el('input', 'mission-search');
    search.type = 'search'; search.placeholder = 'Search leaderboards'; search.setAttribute('aria-label', 'Search leaderboards');
    search.autocomplete = 'off'; search.spellcheck = false;
    const list = el('ul', 'mission-list leaderboard-lists');
    const none = el('p', 'mission-dialog-note', 'No leaderboard found');
    const sections = [];
    for (const group of [...new Set(tabs.map((t) => t.group))]) {
      const head = el('li', 'mission-list-head', group);
      list.append(head);
      const rows = tabs.filter((t) => t.group === group).map((tab) => {
        const li = el('li');
        const b = el('button', 'mission-row leaderboard-row');
        b.type = 'button';
        const body = el('span', 'mission-row-body');
        body.append(el('span', 'mission-link', tab.title));
        b.append(glyph(tab), body, el('span', 'leaderboard-row-go', '›'));
        b.addEventListener('click', () => show(tab));
        li.append(b);
        list.append(li);
        return { li, text: fold(`${tab.title} ${translate(tab.title)} ${tab.id}`) };
      });
      sections.push({ head, rows });
    }
    const filter = () => {
      const words = fold(search.value).split(/\s+/).filter(Boolean);
      let any = 0;
      for (const s of sections) {
        let n = 0;
        for (const r of s.rows) { const hit = words.every((w) => r.text.includes(w)); r.li.hidden = !hit; if (hit) n++; }
        s.head.hidden = !n;
        any += n;
      }
      none.hidden = any > 0;
    };
    search.addEventListener('input', filter);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); list.querySelector('li:not([hidden]) .leaderboard-row')?.click(); } });
    filter();
    container.replaceChildren(search, list, none);
    if (globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches) search.focus({ preventScroll: true });
  };

  // --- One list -------------------------------------------------------------------------------------------------------
  const show = async (tab) => {
    const ticket = ++shown;
    remember(tab.id);
    const kind = tab.free ? FREE_FLIGHT : tab.def ? listOf(tab.def) : POINTS;
    const back = el('button', 'leaderboard-back', 'All leaderboards');
    back.type = 'button';
    back.addEventListener('click', chooser);
    const head = el('div', 'leaderboard-head');
    const titles = el('div', 'mission-row-body');
    titles.append(el('h3', 'mission-board-title', tab.title), el('p', 'mission-board-note', kind.hint));
    head.append(glyph(tab), titles);
    if (tab.def && onStart) {
      const go = el('button', 'mission-row-btn mission-row-go', 'Teleport');
      go.type = 'button';
      go.addEventListener('click', () => onStart(tab.def));
      head.append(go);
    }
    const body = el('div', 'mission-board leaderboard-body');
    body.setAttribute('aria-live', 'polite');
    body.append(el('p', 'mission-dialog-note', 'Loading the leaderboard…'));
    container.replaceChildren(back, head, body);
    let rows;
    try { rows = await kind.load(); } catch { rows = null; }
    if (ticket !== shown || !body.isConnected) return; // (another list was picked meanwhile, or the dialog is gone)
    const parts = [];
    if (!rows) parts.push(el('p', 'mission-dialog-note', 'The leaderboard is not reachable right now.'));
    else {
      const compare = compareText(rows, kind);
      if (compare) parts.push(el('p', 'mission-board-note is-ranked', compare));
      else parts.push(el('p', 'mission-board-note', signedIn ? 'You are not on this list yet.' : 'Sign in from the account menu to appear here and compare yourself.'));
      parts.push(rows.length ? boardList(rows, kind.show) : el('p', 'mission-dialog-note', kind.empty));
    }
    body.replaceChildren(...parts);
  };

  const first = start || remembered();
  show(tabs.find((t) => t.id === first) || tabs[0]);
  return { show: (id) => show(tabs.find((t) => t.id === id) || tabs[0]) };
}
