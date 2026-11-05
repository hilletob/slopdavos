import './i18n.js';
import { LOGIN_PROVIDERS } from './account-config.js';
import { isConfigured, signIn } from './account.js';
import { emailSignIn } from './account-email.js';

// js/start-choice.js
// The question on a first visit: sign in, or play as a guest (js/start.js holds the game back until it is answered). Signing
// in here costs no second build of the city. The sign-in's SDK is loaded only on the click.

export const CHOICE_KEY = 'slopdavos-start-choice';

/** Resolves when the player goes on as a guest. Signing in leaves the page, so then it never does */
export function askHowToPlay() {
  const loader = document.querySelector('#loading-overlay .loader');
  if (!isConfigured() || !loader) return Promise.resolve();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'start-choice';
    const text = document.createElement('p');
    text.textContent = 'Sign in to keep your game on all your devices and join the leaderboards.';
    const button = (label, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    };
    const status = document.createElement('p');
    status.className = 'start-choice-status';
    status.hidden = true;
    const say = (message) => { status.textContent = message; status.hidden = false; };
    const signInButtons = LOGIN_PROVIDERS.map(({ id, label }) => button(label, async () => {
      say('Opening the sign-in…');
      try {
        await signIn(id);
      } catch {
        say('The sign-in is not reachable right now. You can keep playing.');
      }
    }));
    const goOn = (choice) => {
      try { localStorage.setItem(CHOICE_KEY, choice); } catch { /* (asked again next time) */ }
      loader.classList.remove('is-asking');
      box.remove();
      resolve();
    };
    const guest = button('Play as a guest', () => goOn('guest'));
    // (signed in with an email code, the page stays: the game is built now, and js/account-ui.js finds the session)
    const email = emailSignIn({ say: (message) => { status.textContent = message; status.hidden = !message; }, signedIn: () => goOn('account') });
    const or = document.createElement('p');
    or.className = 'start-choice-or';
    or.textContent = 'or';
    const privacy = document.createElement('a');
    privacy.href = './privacy.html';
    privacy.textContent = 'Privacy';
    box.append(text, ...signInButtons, email, or, guest, status, privacy);
    loader.classList.add('is-asking');
    loader.append(box);
  });
}
