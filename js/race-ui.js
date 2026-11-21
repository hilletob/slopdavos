import { dialogHead } from './missions.js';
import { makeCode, cleanCode, codeFits, guestId, displayName, MAX_PLAYERS } from './race-protocol.js';
import { RaceSession } from './race-session.js';

// js/race-ui.js
// The lobby of a race (js/race-session.js): opened from a mission's intro ("Race together": a new room with a code of its
// own) or by a link ?race=<CODE> (joining that room). The code large, the link to copy, the player's name (a guest types
// one, a signed-in player's leaderboard name is proposed), who is in the room, and for the host the "Start the race"
// button. The lobby goes away when the race starts; the session lives on with the run (js/missions.js hooks.race) and
// the ?race= parameter stays in the URL until the player leaves, so that a reload comes back to the room.

const OVERLAY_ID = 'race-overlay';
export const NAME_KEY = 'slopdavos-race-name';
export const RACE_PARAM = 'race';
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };

/** The link to the room: this page with only ?race=<CODE> (`param`: another kind of room, js/quiz-ui.js ?quiz=) */
export function raceLink(code, href = location.href, param = RACE_PARAM) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(param, code);
  return url.href;
}

/** ?race=<CODE> in the URL, or taken out of it (the other parameters stay) */
export function setRaceParam(code, param = RACE_PARAM) {
  try {
    const params = new URLSearchParams(location.search);
    if (code) params.set(param, code); else params.delete(param);
    const s = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${s ? `?${s}` : ''}${location.hash}`);
  } catch { /* (sandboxed) */ }
}

/** Who this player is in the room: a signed-in player by their account and leaderboard name, a guest by a random id and the name kept on this device */
async function identity(signedIn) {
  let id = null, name = '', fromProfile = false;
  if (signedIn) {
    try { const { currentUser } = await import('./account.js'); id = (await currentUser())?.id || null; } catch { /* (the SDK is out of reach: a guest then) */ }
    try { const { myName } = await import('./leaderboard.js'); name = String(await myName() || ''); fromProfile = !!name; } catch { /* */ }
  }
  if (!id) id = guestId(globalThis.sessionStorage);
  if (!name) { try { name = localStorage.getItem(NAME_KEY) || ''; } catch { /* */ } }
  return { id, name: displayName(name, id), fromProfile };
}

export const closeRaceLobby = () => document.getElementById(OVERLAY_ID)?.remove();

// What a race's lobby says and makes; another kind of room (js/quiz-ui.js: Gigi's table) hands openRoomLobby its own
const RACE_KIND = {
  param: RACE_PARAM,
  maxPlayers: MAX_PLAYERS,
  tag: 'race',
  makeSession: (o) => new RaceSession(o),
  texts: {
    invalid: 'That race code is not valid. Ask for the link again.',
    codeLabel: 'Race code',
    nameLabel: 'Your name in the race',
    about: 'Everyone drives the same course at the same time. The others ride along as ghosts: no collisions. The clock starts for all with the countdown; the best time wins.',
    start: 'Start the race',
    waiting: 'Waiting for the host to start the race.',
    joining: 'You are joining this race.',
    share: 'Share the code or the link. Up to four riders.',
    tooMany: (n) => `More than ${n} riders: the ghosts may stutter.`,
    error: 'The race could not be started here.',
    unreachable: 'The race server is not reachable right now. Try again in a moment.'
  }
};

/**
 * @param {object} o
 * @param {object} o.manager js/missions-manager.js MissionManager
 * @param {object} o.def the mission to race (with `race`)
 * @param {string|null} [o.code] a room to join (a link); none: a new room
 * @param {(id: string) => object|null} [o.getMission]
 * @param {boolean} [o.signedIn]
 */
export const openRaceLobby = (o) => openRoomLobby(RACE_KIND, o);

/**
 * The lobby of a room of the `kind`: { param (the URL's parameter), maxPlayers, tag, makeSession({ code, me, def,
 * manager, getMission }) -> a session like js/race-session.js' (on(), join(), host, isHost, hostMember, players, me,
 * status, setName(), leave(), its start by `start()` or startRace(); it says 'racing' when the game begins), texts,
 * note?(session) -> a line under the code (the room's state) }.
 */
export async function openRoomLobby(kind, { manager, def, code = null, getMission = () => null, signedIn = false }) {
  const T = kind.texts;
  closeRaceLobby();
  const joining = !!code;
  code = joining ? cleanCode(code) : makeCode();
  const overlay = el('div', 'mission-overlay race-overlay');
  overlay.id = OVERLAY_ID;
  const panel = el('div', 'panel mission-dialog race-dialog');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  let session = null;
  let closed = false;
  const close = () => { if (closed) return; closed = true; document.removeEventListener('keydown', onKey, true); overlay.remove(); };
  const leave = () => { session?.leave(); close(); setRaceParam(null, kind.param); };
  const onKey = (e) => {
    if (!overlay.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
    if (e.key === 'Escape') { e.stopPropagation(); leave(); }
  };
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) leave(); });
  const title = el('h2', 'mission-dialog-title', def.title);
  const head = dialogHead('Multiplayer', def.title, leave);
  head.querySelector('.mission-dialog-title')?.replaceWith(title);
  panel.append(head);
  overlay.append(panel);
  document.body.append(overlay);

  if (!codeFits(code)) {
    panel.append(el('p', 'mission-dialog-text', T.invalid));
    const back = el('button', 'mission-btn mission-btn-secondary', 'Back to the game');
    back.type = 'button';
    back.addEventListener('click', leave);
    panel.append(back);
    return overlay;
  }

  // The code and the link
  const codeBox = el('div', 'race-code');
  codeBox.setAttribute('aria-label', T.codeLabel);
  for (const ch of code) codeBox.append(el('span', 'race-code-char player-name', ch));
  const linkRow = el('div', 'race-link');
  const link = el('input', 'race-link-field player-name');
  Object.assign(link, { type: 'text', readOnly: true, value: raceLink(code, location.href, kind.param) });
  link.addEventListener('focus', () => link.select());
  const copy = el('button', 'mission-btn mission-btn-secondary', 'Copy link');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(link.value); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy link'; }, 1800); } catch { link.focus(); link.select(); }
  });
  linkRow.append(link, copy);
  const status = el('p', 'mission-dialog-note', 'Connecting…');

  // The name
  const nameForm = el('form', 'race-name-form');
  const nameLabel = el('label', 'pop-sub', T.nameLabel);
  const nameInput = el('input', 'player-name race-name-field');
  Object.assign(nameInput, { type: 'text', maxLength: 20, autocomplete: 'nickname', spellcheck: false, disabled: true });
  nameInput.setAttribute('autocapitalize', 'words');
  nameLabel.append(nameInput);
  nameForm.append(nameLabel);
  nameForm.addEventListener('submit', (e) => { e.preventDefault(); nameInput.blur(); });
  nameInput.addEventListener('change', () => {
    if (!session) return;
    const name = displayName(nameInput.value, session.me.id);
    nameInput.value = name;
    try { localStorage.setItem(NAME_KEY, name); } catch { /* */ }
    session.setName(name);
  });

  const members = el('ol', 'race-members');
  members.setAttribute('aria-label', 'Players');
  const about = el('p', 'mission-dialog-text', T.about);
  const row = el('div', 'mission-dialog-buttons');
  const start = el('button', 'mission-btn', T.start);
  start.type = 'button';
  start.hidden = true;
  start.addEventListener('click', () => { start.disabled = true; if (session?.start) session.start(); else session?.startRace(); });
  const waiting = el('p', 'mission-dialog-note race-waiting', T.waiting);
  waiting.hidden = true;
  const leaveButton = el('button', 'mission-btn mission-btn-secondary', 'Leave');
  leaveButton.type = 'button';
  leaveButton.addEventListener('click', leave);
  row.append(start, leaveButton);
  // Another room's code (a kind with `texts.joinOther`: who opened a room of their own but was given a code sits down there instead)
  let joinForm = null;
  if (T.joinOther && !joining) {
    joinForm = el('form', 'race-link race-join');
    const field = el('input', 'race-link-field player-name');
    Object.assign(field, { type: 'text', maxLength: 12, autocomplete: 'off', spellcheck: false, placeholder: T.codeLabel });
    field.setAttribute('autocapitalize', 'characters');
    field.setAttribute('aria-label', T.joinOther);
    field.style.textTransform = 'uppercase';
    const go = el('button', 'mission-btn mission-btn-secondary', T.join);
    go.type = 'submit';
    joinForm.append(field, go);
    joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      // (a pasted link works too: its code is taken)
      let typed = field.value;
      try { typed = new URL(typed).searchParams.get(kind.param) || typed; } catch { /* (a bare code) */ }
      const other = cleanCode(typed);
      if (!codeFits(other) || other === code) { field.value = ''; field.placeholder = T.invalidShort || T.codeLabel; field.focus(); return; }
      session?.leave();
      close();
      openRoomLobby(kind, { manager, def, code: other, getMission, signedIn });
    });
  }
  panel.append(el('p', 'mission-dialog-text', joining ? T.joining : T.share), codeBox, linkRow, status, nameForm, el('h3', 'mission-board-title', 'Players'), members, waiting, about, ...(joinForm ? [el('p', 'mission-dialog-note', T.joinOther), joinForm] : []), row);
  setRaceParam(code, kind.param);

  const render = () => {
    if (!session) return;
    const host = session.host;
    // (the host's mission, should the link be to another race than the one opened here)
    const hostDef = session.hostMember?.mission ? getMission(session.hostMember.mission) : null;
    if (hostDef && hostDef !== session.def && !session.isHost) { session.def = hostDef; title.textContent = hostDef.title; }
    members.replaceChildren(...[...session.players.values()].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)).map((p) => {
      const li = el('li', `race-row${p.id === session.me.id ? ' is-me' : ''}`);
      li.style.setProperty('--c', p.colour || '#fff');
      li.append(el('span', 'race-dot'), el('span', 'race-name player-name', p.name));
      if (p.id === host) li.append(el('span', 'race-tag', 'Host'));
      if (p.id === session.me.id) li.append(el('span', 'race-tag', 'You'));
      return li;
    }));
    const n = session.players.size;
    start.hidden = !session.isHost;
    start.disabled = false;
    start.textContent = n > 1 ? T.start : (T.startAlone || 'Start alone');
    waiting.hidden = session.isHost;
    status.textContent = session.status && session.status !== 'SUBSCRIBED' ? 'The connection dropped. Trying again…' : n > kind.maxPlayers ? T.tooMany(kind.maxPlayers) : kind.note?.(session) || '';
    status.hidden = !status.textContent;
  };

  const me = await identity(signedIn);
  if (closed) return overlay;
  nameInput.value = me.name;
  nameInput.disabled = false;
  session = kind.makeSession({ code, me, def, manager, getMission });
  session.on((what) => {
    if (what === 'members' || what === 'status') render();
    else if (what === 'racing') close();
    else if (what === 'left') { close(); setRaceParam(null, kind.param); }
    else if (what === 'error') { status.textContent = T.error; status.hidden = false; }
  });
  try {
    await session.join();
    render();
  } catch (error) {
    console.warn(`[${kind.tag}] join`, error);
    status.textContent = T.unreachable;
    status.hidden = false;
  }
  return overlay;
}
