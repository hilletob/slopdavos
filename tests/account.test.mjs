import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SUPABASE_SDK, LOGIN_PROVIDERS } from '../js/account-config.js';
import { hasStoredSession, safeReturnPath, callbackUrl, isConfigured, SESSION_KEY } from '../js/account.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('play.html');

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
    assert.equal(safeReturnPath(bad), '/play.html', String(bad));
  }
});

test('the callback lies beside the game, also under a sub-path', () => {
  assert.equal(callbackUrl('https://davos.tschopp.cloud/?mission=list'), 'https://davos.tschopp.cloud/auth/callback.html');
  assert.equal(callbackUrl('https://example.test/game/'), 'https://example.test/game/auth/callback.html');
});

test('the SDK is pinned and stays out of a guest\'s start', () => {
  assert.match(SUPABASE_SDK, /@supabase\/supabase-js@\d+\.\d+\.\d+\/\+esm$/);
  assert.doesNotMatch(html, /supabase/i);
  for (const module of ['account', 'account-ui', 'account-config', 'account-sync', 'account-merge', 'leaderboard', 'leaderboard-ui', 'leaderboard-overview', 'account-email', 'start-choice', 'guest-gate']) assert.ok(!html.includes(`href="./js/${module}.js"`), `${module} is not preloaded`);
  assert.doesNotMatch(read('js/main.js'), /^import .*account/m, 'js/main.js loads the account on demand only');
  assert.doesNotMatch(read('js/account.js'), /from ['"]https?:/, 'the SDK is not a static import');
});

test('the login page is deployed, and its code never reaches the cache', () => {
  assert.match(read('.github/workflows/pages.yml'), /cp -R .*\bprivacy\.html\b.*\bauth\b.* _site\//);
  const sw = read('sw.js');
  assert.ok(sw.indexOf("'auth/'") > 0 && sw.indexOf("'auth/'") < sw.indexOf('event.respondWith(fetch(request)'), 'auth/ goes by before the caching');
});

test('every provider has a label to show, and the texts are in both languages', () => {
  const i18n = read('js/i18n.js');
  const texts = [...LOGIN_PROVIDERS.map((p) => p.label), 'Account', 'Sign out', 'Finish the mission first.', 'Opening the sign-in…', 'Saved to your account.', 'Delete account', 'Privacy',
    'The sign-in is not reachable right now. You can keep playing.', 'Signing out failed. Please try again.'];
  for (const text of texts) assert.ok(i18n.includes(`['${text}',`), text);
  assert.match(i18n, /\.language-switch, \.player-name/, 'player names are not translated');
});

test('the login replaces the page and gives the GPU back first, and the page after it takes a breath', () => {
  const account = read('js/account.js'), ui = read('js/account-ui.js'), main = read('js/main.js');
  assert.match(account, /beforeLeave\?\.\(\);[^]*?location\.replace\(data\.url\)/, 'replaced, not stacked: no page cache');
  assert.doesNotMatch(account, /location\.assign/);
  assert.match(ui, /signIn\(id, \{ beforeLeave: leaving \}\)/);
  assert.match(main, /leaving: leavePage/);
  assert.match(main, /const leavePage = \(breath = MOVE_BREATH\) => \{\s*renderer\.setAnimationLoop\(null\);[^]*?device\?\.destroy[^]*?MOVING_KEY, String\(breath\)/);
  assert.match(main, /if \(QUALITY\.oneFrameInFlight && queue\?\.onSubmittedWorkDone\) \{[^]*?if \(busy && t - busySince < STUCK_MS\) return;[^]*?queue\.onSubmittedWorkDone\(\)\.then/, 'one frame in flight on the mobile profile: a tick while the GPU is busy is skipped');
  assert.match(main, /GPU silent after the app came back/, 'a GPU that stays silent after the app comes back reloads the page');
  assert.match(read('js/quality.js'), /oneFrameInFlight: true/);
  assert.match(main, /const reloadAfterGone = \(\) => \{ leavePage\(GONE_BREATH\);/, 'a reload after the GPU is gone leaves the same way, with a longer breath');
  assert.equal((main.match(/reload: reloadAfterGone/g) || []).length, 3, 'all three device-lost paths (lost, gone in a frame, silent after resume)');
  assert.doesNotMatch(main, /reload: \(\) => window\.location\.reload\(\)/, 'no reload after a lost device without leaving first');
});

test('a first visit is asked only from js/start.js, under the key the choice is kept in, and loads nothing for anyone else', () => {
  const start = read('js/start.js');
  assert.match(start, /await import\('\.\/start-choice\.js'\)/);
  assert.doesNotMatch(start, /^import /m);
  assert.match(read('js/start-choice.js'), /CHOICE_KEY = 'slopdavos-start-choice'/);
  for (const key of ['slopdavos-start-choice', 'slopdavos-progress', 'slopdavos-player-state']) assert.ok(start.includes(`'${key}'`), key);
});
