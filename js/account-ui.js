import { LOGIN_PROVIDERS } from './account-config.js';
import { isConfigured, signIn, signOut, deleteAccount, currentUser, enabledProviders } from './account.js';
import { emailSignIn } from './account-email.js';

// js/account-ui.js
// The account button in the toolbar and its popover (index.html). Started after the first frame by js/main.js.

/** @param {object} o
 *  @param {() => void} o.save keeps the player and the clock before the page is left for the login
 *  @param {() => void} [o.leaving] gives the GPU back as the page is left for the login (the game is over then)
 *  @param {() => boolean} o.missionActive a running mission would be lost: no login then
 *  @param {() => void} o.pause stops the game when a guest's free time is up (js/guest-gate.js)
 *  @param {object} o.progress the missions' progress store (js/missions-progress.js) */
export async function startAccount({ save, leaving, missionActive, pause, progress }) {
  const button = document.getElementById('btn-account');
  const list = document.getElementById('account-items');
  const status = document.getElementById('account-status');
  const popover = document.getElementById('account-popover');
  if (!isConfigured() || !button || !list || !status || !popover) return;

  let sync = null;
  let syncState = '';
  let loadName = null;
  let gate = null;
  /** A guest's free time runs (js/guest-gate.js); for a signed-in player it does not */
  const guard = (on) => {
    if (!on) { gate?.stop(); gate = null; return; }
    if (gate) return;
    gate = { stop: () => {} };
    import('./guest-gate.js')
      .then(({ startGuestGate }) => { if (gate) gate = startGuestGate({ missionActive, pause, save, leaving, signedIn: restartSignedIn }); })
      .catch((error) => console.warn('[account] the guest limit could not be started', error));
  };
  const say = (text) => { status.textContent = text; status.hidden = !text; };
  const SYNC_TEXT = { saved: 'Saved to your account.', failed: 'Not saved online right now. Your game stays on this device.' };
  /** The player's statistics (js/play-stats-ui.js), for a guest too */
  const statsItem = (signedIn) => item('Your statistics', async () => {
    popover.hidePopover?.();
    try {
      const { openPlayStats } = await import('./play-stats-ui.js');
      openPlayStats({ signedIn });
    } catch { /* (the module could not be loaded: nothing to show) */ }
  });
  const item = (label, onClick) => {
    const b = document.createElement('button');
    b.className = 'pop-item';
    b.type = 'button';
    const name = document.createElement('span');
    name.className = 'pop-name';
    name.textContent = label;
    b.append(name);
    b.addEventListener('click', () => onClick(name));
    return b;
  };

  // (the leaderboards are the second tab of the missions' dialog: no entry here)
  /** Signed in with an email code: the game starts again with the account, like after the Google sign-in */
  const restartSignedIn = () => {
    try { save(); } catch { /* */ }
    try { leaving?.(); } catch { /* */ }
    location.replace(location.pathname + location.search);
  };

  const tagged = (provider, b) => { b.dataset.provider = provider; b.hidden = true; return b; };
  const renderGuest = () => {
    button.setAttribute('aria-pressed', 'false'); // (the toolbar's button says "Sign in", css/style.css)
    button.classList.remove('icon-only');
    button.title = 'Sign in';
    const email = emailSignIn({
      say,
      signedIn: restartSignedIn,
      allowed: () => { if (missionActive()) { say('Finish the mission first.'); return false; } return true; },
      buttonClass: 'pop-item'
    });
    list.replaceChildren(...LOGIN_PROVIDERS.map(({ id, label }) => tagged(id, item(label, async () => {
      if (missionActive()) { say('Finish the mission first.'); return; }
      say('Opening the sign-in…');
      try {
        save();
        await signIn(id, { beforeLeave: leaving });
      } catch {
        say('The sign-in is not reachable right now. You can keep playing.');
      }
    }))), email, statsItem(false));
  };

  const leave = () => { sync?.stop(); sync = null; syncState = ''; loadName = null; renderGuest(); guard(true); };

  /** The public name on the leaderboards, fetched when the menu opens */
  const nameForm = () => {
    const form = document.createElement('form');
    form.className = 'account-name';
    const label = document.createElement('label');
    label.className = 'pop-sub';
    label.textContent = 'Name on the leaderboards';
    const input = document.createElement('input');
    input.className = 'player-name';
    Object.assign(input, { type: 'text', maxLength: 20, autocomplete: 'off', spellcheck: false, disabled: true });
    input.setAttribute('autocapitalize', 'off');
    label.append(input);
    const saveName = document.createElement('button');
    saveName.className = 'pop-item account-name-save';
    saveName.type = 'submit';
    saveName.textContent = 'Save name';
    saveName.disabled = true;
    form.append(label, saveName);
    loadName = async () => {
      if (!input.disabled) return;
      try {
        const { myName } = await import('./leaderboard.js');
        input.value = await myName();
        input.disabled = saveName.disabled = false;
      } catch { /* (the leaderboards are out of reach: no name to change now) */ }
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const { setName, nameFits } = await import('./leaderboard.js');
        const answer = nameFits(input.value) ? await setName(input.value) : { error: 'invalid' };
        if (answer.name) input.value = answer.name;
        say(answer.name ? 'Name saved.' : answer.error === 'taken' ? 'That name is taken.' : 'Use 3 to 20 letters, digits, spaces, - or _. Some words are not allowed.');
      } catch {
        say('The name could not be saved. Please try again.');
      }
    });
    return form;
  };

  const renderUser = (user) => {
    button.setAttribute('aria-pressed', 'true'); // (the icon alone)
    button.classList.add('icon-only');
    button.title = 'Account';
    const who = document.createElement('div');
    who.className = 'pop-sub account-who player-name';
    who.textContent = user.email || '';
    let confirming = false;
    list.replaceChildren(who, nameForm(), item('Sign out', async () => {
      try {
        await sync?.flush().catch(() => {});
        await signOut();
        say('');
        leave();
      } catch {
        say('Signing out failed. Please try again.');
      }
    }), item('Delete account', async (name) => {
      if (!confirming) { confirming = true; name.textContent = 'Delete the account and its cloud save for good'; return; }
      try {
        await deleteAccount();
        leave();
        say('The account is deleted. Your game stays on this device.');
      } catch {
        say('Deleting failed. Please try again.');
      }
    }), statsItem(true));
  };

  say('');
  renderGuest();
  popover.addEventListener('beforetoggle', (e) => {
    if (e.newState !== 'open') return;
    say(SYNC_TEXT[syncState] || '');
    loadName?.();
    // (a provider not switched on in the backend yet is not offered; asked only once the menu opens)
    if (list.querySelector('[data-provider]')) enabledProviders().then((on) => {
      for (const b of list.querySelectorAll('[data-provider]')) b.hidden = !on.includes(b.dataset.provider);
    });
  });
  button.hidden = false;

  // (a stored session loads the SDK; failing that the game goes on, and the guest's view is what shows)
  try {
    const user = await currentUser();
    if (!user) { guard(true); return; }
    renderUser(user);
    const { startSync } = await import('./account-sync.js');
    sync = await startSync({ save, missionActive, progress, onStatus: (state) => {
      syncState = state;
      if (popover.matches(':popover-open')) say(SYNC_TEXT[state]);
    } });
    // (a setting the account keeps, e.g. the player's figure, js/player-figure.js: saved at once)
    addEventListener('slopdavos:save-now', () => { sync?.flush().catch(() => {}); });
  } catch { /* offline or the backend is down (with a session stored: the player is not stopped as a guest) */ }
}
