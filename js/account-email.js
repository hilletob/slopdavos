import { emailFits, codeFits, sendEmailCode, verifyEmailCode, ownerConflict, takeOverDevice, signOut } from './account.js';

// js/account-email.js
// Signing in with an email address and a one-time code (js/account.js), for the first-visit question (js/start-choice.js)
// and the account menu (js/account-ui.js). Three steps in one small form: the address, the code, and, when this device
// holds another account's save, the same question as auth/callback.html.

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };

/** @param {object} o
 *  @param {(text: string) => void} o.say shows a status line ('' hides it)
 *  @param {() => void} o.signedIn called once the session is stored and this device's save is settled
 *  @param {() => boolean} [o.allowed] false holds the sign-in back (a running mission), `o.say` tells why
 *  @param {string} [o.buttonClass] the class of the form's buttons */
export function emailSignIn({ say, signedIn, allowed = () => true, buttonClass = '' }) {
  const form = el('form', 'account-email');
  form.noValidate = true;
  let email = '';
  let busy = false;

  const button = (label, type = 'submit') => {
    const b = el('button', `account-email-btn ${buttonClass}`.trim(), label);
    b.type = type;
    return b;
  };
  const field = (label, attrs) => {
    const wrap = el('label', 'account-email-field');
    const input = el('input', 'player-name');
    Object.assign(input, { spellcheck: false, required: true, ...attrs });
    input.setAttribute('autocapitalize', 'off');
    wrap.append(el('span', null, label), input);
    return { wrap, input };
  };

  const askEmail = () => {
    const { wrap, input } = field('Sign in with email', { type: 'email', autocomplete: 'email', inputMode: 'email', maxLength: 254, value: email });
    form.replaceChildren(wrap, button('Send code'));
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      if (!allowed()) return;
      if (!emailFits(input.value)) { say('Please enter a valid email address.'); return; }
      busy = true;
      email = input.value.trim();
      say('Sending the code…');
      try {
        await sendEmailCode(email);
        say('');
        askCode();
      } catch (error) {
        say(error?.status === 429 ? 'Too many codes asked for. Please wait a few minutes and try again.' : 'The code could not be sent. Please try again.');
      } finally { busy = false; }
    };
  };

  const askCode = () => {
    const sent = el('p', 'account-email-sent');
    sent.append(el('span', null, 'We sent a code to '), el('span', 'player-name', email), el('span', null, '. It can take a minute.'));
    const { wrap, input } = field('Code from the email', { type: 'text', autocomplete: 'one-time-code', inputMode: 'numeric', maxLength: 12 });
    const other = button('Use another email', 'button');
    other.classList.add('is-quiet');
    other.addEventListener('click', () => { say(''); askEmail(); });
    form.replaceChildren(sent, wrap, button('Sign in'), other);
    input.focus({ preventScroll: true });
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      if (!allowed()) return;
      if (!codeFits(input.value)) { say('The code has 6 digits or more.'); return; }
      busy = true;
      say('Signing in…');
      try {
        await verifyEmailCode(email, input.value);
      } catch {
        busy = false;
        say('That code is wrong or has expired.');
        return;
      }
      try {
        if (await ownerConflict()) { busy = false; say(''); askOwner(); return; }
      } catch { /* (no answer: the device's save stays, the sync merges nothing it does not own) */ }
      signedIn();
    };
  };

  // (the save on this device is another account's: the two are not mixed, and nothing goes without asking)
  const askOwner = () => {
    const takeOver = button('Continue with this account (the other save leaves this device)', 'button');
    const cancel = button('Cancel and sign out', 'button');
    takeOver.addEventListener('click', async () => { await takeOverDevice(); signedIn(); });
    cancel.addEventListener('click', async () => {
      try { await signOut(); } catch { /* */ }
      email = '';
      askEmail();
    });
    form.onsubmit = (e) => e.preventDefault();
    form.replaceChildren(el('p', 'account-email-sent', 'This device holds the save of another account.'), takeOver, cancel);
  };

  askEmail();
  return form;
}
