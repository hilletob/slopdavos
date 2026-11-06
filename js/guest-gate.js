import { LOGIN_PROVIDERS } from './account-config.js';
import { signIn, enabledProviders } from './account.js';
import { emailSignIn } from './account-email.js';

// js/guest-gate.js
// A guest plays GUEST_LIMIT_MS without an account; then the game stops and asks for a sign-in, with no way past it (js/account-ui.js
// starts this for a guest only). The time is kept on the device, so a reload does not give it back. A running mission is
// let finish first. Signed out again later, the time is long gone: the question comes at once.

export const GUEST_TIME_KEY = 'slopdavos-guest-ms';
export const GUEST_LIMIT_MS = 120000;
const TICK = 1000; // ms
const MAX_STEP = 2000; // ms counted for one tick at most (a sleeping device, a throttled tab)

/** The guest's time on this device, counted only while the page is seen */
export function createGuestClock(storage = globalThis.localStorage, limit = GUEST_LIMIT_MS) {
  let ms = 0;
  try { ms = Math.max(0, Number(storage?.getItem(GUEST_TIME_KEY)) || 0); } catch { /* (storage off: it counts from 0 per page) */ }
  return {
    get ms() { return ms; },
    get over() { return ms >= limit; },
    add(step) {
      ms += Math.min(Math.max(Number(step) || 0, 0), MAX_STEP);
      try { storage?.setItem(GUEST_TIME_KEY, String(Math.round(ms))); } catch { /* */ }
      return ms >= limit;
    }
  };
}

/** @param {object} o
 *  @param {() => boolean} o.missionActive the question waits for a running mission's end
 *  @param {() => void} o.pause stops the game behind the question (it is never resumed: a sign-in loads the page anew)
 *  @param {() => void} o.save keeps the player and the clock before the page is left for the login
 *  @param {() => void} [o.leaving] gives the GPU back as the page is left
 *  @param {() => void} o.signedIn signed in with an email code: the game starts again with the account
 *  @returns {{ stop: () => void }} */
export function startGuestGate({ missionActive, pause, save, leaving, signedIn }) {
  const clock = createGuestClock();
  let last = performance.now();
  let timer = 0;
  const check = () => {
    const now = performance.now();
    if (document.visibilityState === 'visible') clock.add(now - last);
    last = now;
    if (clock.over && !missionActive()) { stop(); show(); }
  };
  const stop = () => { clearInterval(timer); timer = 0; };
  const show = () => {
    try { save(); } catch { /* */ }
    try { pause(); } catch { /* */ }
    openGate({ save, leaving, signedIn });
  };
  timer = setInterval(check, TICK);
  check();
  return { stop };
}

function openGate({ leaving, signedIn }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'panel guest-gate';
  dialog.setAttribute('aria-labelledby', 'guest-gate-title');
  const title = document.createElement('h2');
  title.id = 'guest-gate-title';
  title.textContent = 'Please sign in';
  const text = document.createElement('p');
  text.textContent = 'To keep playing, sign in. Your game goes on where you are, on all your devices.';
  const status = document.createElement('p');
  status.className = 'guest-gate-status';
  status.hidden = true;
  const say = (message) => { status.textContent = message; status.hidden = !message; };
  const buttons = LOGIN_PROVIDERS.map(({ id, label }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `guest-gate-provider is-${id}`;
    b.dataset.provider = id;
    b.hidden = true; // (until the backend says it is on)
    b.textContent = label;
    b.addEventListener('click', async () => {
      say('Opening the sign-in…');
      try {
        await signIn(id, { beforeLeave: leaving });
      } catch {
        say('The sign-in is not reachable right now. Please try again.');
      }
    });
    return b;
  });
  // (a provider not switched on in the backend yet is not offered)
  enabledProviders().then((on) => { for (const b of buttons) b.hidden = !on.includes(b.dataset.provider); });
  const email = emailSignIn({ say, signedIn });
  const or = document.createElement('p');
  or.className = 'guest-gate-or';
  or.textContent = 'or';
  const privacy = document.createElement('a');
  privacy.href = './privacy.html';
  privacy.textContent = 'Privacy';
  dialog.append(title, text, ...buttons, or, email, status, privacy);
  dialog.addEventListener('cancel', (e) => e.preventDefault()); // (Escape does not close it)
  document.body.append(dialog);
  dialog.showModal();
}
