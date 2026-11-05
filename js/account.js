import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SDK } from './account-config.js';
import { OWNER_KEY, ownedByOther, clearLocalSave } from './account-merge.js';

// js/account.js
// The session of the optional player account (Supabase Auth, signed in by a full page redirect with PKCE: a popup is not
// dependable in the installed fullscreen app). The SDK is loaded on demand, so a guest's start stays as it was.
// auth/callback.html finishes the redirect, on a page of its own so that the city is built only once.

export const SESSION_KEY = 'slopdavos-session';
export const RETURN_KEY = 'slopdavos-login-return';

export const isConfigured = (url = SUPABASE_URL, key = SUPABASE_KEY) => !!url && !!key;

/** Whether a session is stored: answered without the SDK (a sign-in under way keeps only its `-code-verifier` key) */
export function hasStoredSession(storage = globalThis.localStorage) {
  try { return !!storage?.getItem(SESSION_KEY); } catch { return false; }
}

/** Where the login comes back to. Only a path on this site: the value is read back from storage after a redirect */
export function safeReturnPath(value, fallback = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}

export const callbackUrl = (base = document.baseURI) => new URL('auth/callback.html', base).href;

let client = null;
export function getClient() {
  client ||= import(SUPABASE_SDK).then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      flowType: 'pkce',
      storageKey: SESSION_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false // (auth/callback.html does it, the game's URL never carries a code)
    }
  })).catch((error) => { client = null; throw error; }); // (a failed download may work the next time)
  return client;
}

/**
 * Off to the provider: the page is left. Rejects when that could not be started (offline, backend down); `beforeLeave`
 * is called once leaving is certain, right before (js/main.js gives the GPU back). The page is replaced, not stacked:
 * a page left behind in the history stays in Safari's page cache with all its memory, and the game loading again on
 * the way back, beside it, was more than an iPhone's GPU process is allowed.
 */
export async function signIn(provider, { beforeLeave } = {}) {
  const supabase = await getClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider, options: { redirectTo: callbackUrl(), skipBrowserRedirect: true }
  });
  if (error) throw error;
  try { localStorage.setItem(RETURN_KEY, location.pathname + location.search); } catch { /* (back to the start page then) */ }
  try { beforeLeave?.(); } catch { /* (the navigation frees it anyway) */ }
  location.replace(data.url);
}

/** A plausible email address: the server decides, this only spares a request it would refuse */
export const emailFits = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim()) && String(email).trim().length <= 254;

/** A code that can be typed in: digits only, as many as Supabase sends (6 by default, up to 10) */
export const cleanCode = (code) => String(code ?? '').replace(/\D/g, '');
export const codeFits = (code) => /^\d{6,10}$/.test(cleanCode(code));

/**
 * Signing in without a provider: a one-time code goes to the email address (a new address becomes a new account), and is
 * typed in here. No redirect, so the installed app stays where it is. Rejects with the error's `status` (429: too many).
 * Needs the dashboard's email template "Magic Link" to show the code ({{ .Token }}), not only the link.
 */
export async function sendEmailCode(email) {
  const supabase = await getClient();
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw error;
}

/** The code becomes the session. Rejects for a wrong or expired code */
export async function verifyEmailCode(email, code) {
  const supabase = await getClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: cleanCode(code), type: 'email' });
  if (error) throw error;
}

/** auth/callback.html: the code from the URL becomes the session. Answers the path to return to */
export async function finishSignIn(code) {
  const supabase = await getClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  let back = null;
  try { back = localStorage.getItem(RETURN_KEY); localStorage.removeItem(RETURN_KEY); } catch { /* */ }
  return safeReturnPath(back);
}

/** The signed-in user { id, email }, or null (no SDK is loaded when no session is stored) */
export async function currentUser() {
  if (!hasStoredSession()) return null;
  const supabase = await getClient();
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/** auth/callback.html: this device holds the save of another account */
export async function ownerConflict() {
  const user = await currentUser();
  return !!user && ownedByOther(localStorage, user.id);
}

/** auth/callback.html: the other account's save leaves this device (it stays in that account), this account's comes at the start */
export async function takeOverDevice() {
  const user = await currentUser();
  if (!user) return;
  clearLocalSave(localStorage);
  localStorage.setItem(OWNER_KEY, user.id);
}

/** Deletes the account and its cloud save. This device keeps its game, as a guest's */
export async function deleteAccount() {
  const supabase = await getClient();
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
  try { localStorage.removeItem(OWNER_KEY); } catch { /* */ }
}

/** Ends the session on this device. Works with the backend down too: only the local tokens go */
export async function signOut() {
  const supabase = await getClient();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}
