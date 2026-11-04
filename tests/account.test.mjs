import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SUPABASE_SDK, LOGIN_PROVIDERS } from '../js/account-config.js';
import { hasStoredSession, safeReturnPath, callbackUrl, isConfigured, SESSION_KEY } from '../js/account.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('index.html');

test('the account is off until both the URL and the key are set', () => {
  assert.equal(isConfigured('', ''), false);
  assert.equal(isConfigured('https://x.supabase.co', ''), false);
  assert.equal(isConfigured('', 'key'), false);
  assert.equal(isConfigured('https://x.supabase.co', 'key'), true);
});

test('a session is recognised without the SDK, and a sign-in under way is not one', () => {
  const storage = (entries) => ({ getItem: (k) => entries[k] ?? null });
  assert.equal(hasStoredSession(storage({})), false);
  assert.equal(hasStoredSession(storage({ [`${SESSION_KEY}-code-verifier`]: 'v' })), false);
  assert.equal(hasStoredSession(storage({ [SESSION_KEY]: '{}' })), true);
  assert.equal(hasStoredSession({ getItem() { throw new Error('storage off'); } }), false);
});

test('the login returns only to a path on this site', () => {
  assert.equal(safeReturnPath('/?memhud=1'), '/?memhud=1');
  for (const bad of ['https://evil.test/', '//evil.test/', '/\\evil.test', 'javascript:alert(1)', '', null, undefined]) {
    assert.equal(safeReturnPath(bad), '/', String(bad));
  }
});

test('the callback lies beside the game, also under a sub-path', () => {
  assert.equal(callbackUrl('https://davos.tschopp.cloud/?mission=list'), 'https://davos.tschopp.cloud/auth/callback.html');
  assert.equal(callbackUrl('https://example.test/game/'), 'https://example.test/game/auth/callback.html');
});

test('the SDK is pinned and stays out of a guest\'s start', () => {
  assert.match(SUPABASE_SDK, /@supabase\/supabase-js@\d+\.\d+\.\d+\/\+esm$/);
  assert.doesNotMatch(html, /supabase/i);
  for (const module of ['account', 'account-ui', 'account-config']) assert.ok(!html.includes(`href="./js/${module}.js"`), `${module} is not preloaded`);
  assert.doesNotMatch(read('js/main.js'), /^import .*account/m, 'js/main.js loads the account on demand only');
  assert.doesNotMatch(read('js/account.js'), /from ['"]https?:/, 'the SDK is not a static import');
});

test('the login page is deployed, and its code never reaches the cache', () => {
  assert.match(read('.github/workflows/pages.yml'), /cp -R .*\bauth\b.* _site\//);
  const sw = read('sw.js');
  assert.ok(sw.indexOf("'auth/'") > 0 && sw.indexOf("'auth/'") < sw.indexOf('event.respondWith(fetch(request)'), 'auth/ goes by before the caching');
});

test('every provider has a label to show, and the texts are in both languages', () => {
  const i18n = read('js/i18n.js');
  const texts = [...LOGIN_PROVIDERS.map((p) => p.label), 'Account', 'Sign out', 'Finish the mission first.', 'Opening the sign-in…',
    'The sign-in is not reachable right now. You can keep playing.', 'Signing out failed. Please try again.'];
  for (const text of texts) assert.ok(i18n.includes(`['${text}',`), text);
  assert.match(i18n, /\.language-switch, \.player-name/, 'player names are not translated');
});
