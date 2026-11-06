import { currentStats, totals, TRAVEL_KINDS } from './play-stats.js';

// js/play-stats-ui.js
// The player's own statistics (js/play-stats.js) in a dialog, opened from the account menu: the play time and the ways of
// travel, each with its time, its distance and a bar. All devices of a signed-in player together.

const OVERLAY_ID = 'play-stats-overlay';
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };

/** A duration: "45 s", "12 min", "3 h 05 min" */
export function durationText(ms) {
  const s = Math.round(Math.max(0, ms) / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** A distance: "350 m", "4.2 km", "128 km" */
export function distanceText(m) {
  const metres = Math.max(0, Math.round(m));
  if (metres < 1000) return `${metres} m`;
  return metres < 100000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 1000)} km`;
}

/** The lines of the dialog: [{ kind, label, time, distance, share (0..1 of the longest) }] (no time: left out) */
export function travelLines(sum) {
  const top = sum.modes[0]?.ms || 1;
  return sum.modes.filter((m) => m.ms >= 1000).map((m) => ({
    kind: m.kind, label: TRAVEL_KINDS[m.kind] || m.kind, time: durationText(m.ms), distance: distanceText(m.m), share: m.ms / top
  }));
}

export const closePlayStats = () => document.getElementById(OVERLAY_ID)?.remove();

export function openPlayStats({ signedIn = false } = {}) {
  closePlayStats();
  const sum = totals(currentStats());
  const overlay = el('div', 'mission-overlay play-stats-overlay');
  overlay.id = OVERLAY_ID;
  const panel = el('div', 'panel mission-dialog play-stats-dialog');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Your statistics');

  const facts = el('dl', 'play-stats-facts');
  const fact = (label, value) => facts.append(el('dt', null, label), el('dd', null, value));
  fact('Play time', durationText(sum.playMs));
  fact('Sessions', String(sum.sessions));
  if (sum.devices > 1) fact('Devices', String(sum.devices));

  const lines = travelLines(sum);
  const list = el('ol', 'play-stats-travel');
  for (const line of lines) {
    const li = el('li');
    const bar = el('span', 'play-stats-bar');
    bar.style.setProperty('--share', `${Math.max(2, Math.round(line.share * 100))}%`);
    li.append(el('span', 'play-stats-kind', line.label), el('span', 'play-stats-num', line.time), el('span', 'play-stats-num', line.distance), bar);
    list.append(li);
  }

  const close = el('button', 'mission-btn mission-btn-secondary', 'Close');
  close.type = 'button';
  const onKey = (e) => {
    if (!overlay.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
    if (e.key === 'Escape') { e.stopPropagation(); done(); }
  };
  const done = () => { document.removeEventListener('keydown', onKey, true); overlay.remove(); };
  close.addEventListener('click', done);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) done(); });
  document.addEventListener('keydown', onKey, true);

  panel.append(
    el('div', 'mission-kicker', 'Statistics'),
    el('h2', 'mission-dialog-title', 'How you play'),
    facts,
    el('h3', 'mission-board-title', 'How you get about'),
    lines.length ? list : el('p', 'mission-dialog-note', 'Nothing yet: get going.'),
    el('p', 'mission-board-note', signedIn ? 'All your devices together. Only time with you at the game counts.' : 'This device only. Sign in to keep it with your account. Only time with you at the game counts.'),
    close
  );
  overlay.append(panel);
  document.body.append(overlay);
  close.focus({ preventScroll: true });
  return overlay;
}
