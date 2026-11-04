import { LOGIN_PROVIDERS } from './account-config.js';
import { isConfigured, signIn, signOut, currentUser } from './account.js';

// js/account-ui.js
// The account button in the toolbar and its popover (index.html). Started after the first frame by js/main.js.

/** @param {object} o
 *  @param {() => void} o.save keeps the player and the clock before the page is left for the login
 *  @param {() => boolean} o.missionActive a running mission would be lost: no login then */
export async function startAccount({ save, missionActive }) {
  const button = document.getElementById('btn-account');
  const list = document.getElementById('account-items');
  const status = document.getElementById('account-status');
  const popover = document.getElementById('account-popover');
  if (!isConfigured() || !button || !list || !status || !popover) return;

  const say = (text) => { status.textContent = text; status.hidden = !text; };
  const item = (label, onClick) => {
    const b = document.createElement('button');
    b.className = 'pop-item';
    b.type = 'button';
    const name = document.createElement('span');
    name.className = 'pop-name';
    name.textContent = label;
    b.append(name);
    b.addEventListener('click', onClick);
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

  const renderUser = (user) => {
    button.setAttribute('aria-pressed', 'true');
    const who = document.createElement('div');
    who.className = 'pop-sub account-who player-name';
    who.textContent = user.email || '';
    list.replaceChildren(who, item('Sign out', async () => {
      try {
        await signOut();
        say('');
        renderGuest();
      } catch {
        say('Signing out failed. Please try again.');
      }
    }));
  };

  say('');
  renderGuest();
  popover.addEventListener('beforetoggle', (e) => { if (e.newState === 'open') say(''); });
  button.hidden = false;

  // (a stored session loads the SDK; failing that the game goes on, and the guest's view is what shows)
  try {
    const user = await currentUser();
    if (user) renderUser(user);
  } catch { /* offline or the backend is down */ }
}
