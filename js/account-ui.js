import { LOGIN_PROVIDERS } from './account-config.js';
import { isConfigured, signIn, signOut, deleteAccount, currentUser } from './account.js';

// js/account-ui.js
// The account button in the toolbar and its popover (index.html). Started after the first frame by js/main.js.

/** @param {object} o
 *  @param {() => void} o.save keeps the player and the clock before the page is left for the login
 *  @param {() => boolean} o.missionActive a running mission would be lost: no login then
 *  @param {object} o.progress the missions' progress store (js/missions-progress.js) */
export async function startAccount({ save, missionActive, progress }) {
  const button = document.getElementById('btn-account');
  const list = document.getElementById('account-items');
  const status = document.getElementById('account-status');
  const popover = document.getElementById('account-popover');
  if (!isConfigured() || !button || !list || !status || !popover) return;

  let sync = null;
  let syncState = '';
  const say = (text) => { status.textContent = text; status.hidden = !text; };
  const SYNC_TEXT = { saved: 'Saved to your account.', failed: 'Not saved online right now. Your game stays on this device.' };
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

  const renderGuest = () => {
    button.setAttribute('aria-pressed', 'false');
    list.replaceChildren(...LOGIN_PROVIDERS.map(({ id, label }) => item(label, async () => {
      if (missionActive()) { say('Finish the mission first.'); return; }
      say('Opening the sign-in…');
      try {
        save();
        await signIn(id);
      } catch {
        say('The sign-in is not reachable right now. You can keep playing.');
      }
    })));
  };

  const leave = () => { sync?.stop(); sync = null; syncState = ''; renderGuest(); };

  const renderUser = (user) => {
    button.setAttribute('aria-pressed', 'true');
    const who = document.createElement('div');
    who.className = 'pop-sub account-who player-name';
    who.textContent = user.email || '';
    let confirming = false;
    list.replaceChildren(who, item('Sign out', async () => {
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
    }));
  };

  say('');
  renderGuest();
  popover.addEventListener('beforetoggle', (e) => { if (e.newState === 'open') say(SYNC_TEXT[syncState] || ''); });
  button.hidden = false;

  // (a stored session loads the SDK; failing that the game goes on, and the guest's view is what shows)
  try {
    const user = await currentUser();
    if (!user) return;
    renderUser(user);
    const { startSync } = await import('./account-sync.js');
    sync = await startSync({ save, missionActive, progress, onStatus: (state) => {
      syncState = state;
      if (popover.matches(':popover-open')) say(SYNC_TEXT[state]);
    } });
  } catch { /* offline or the backend is down */ }
}
