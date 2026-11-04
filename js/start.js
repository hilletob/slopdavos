// js/start.js
// The page's entry. A signed-in player's save comes from the cloud first, because the game reads its state from localStorage
// while its modules load. A guest goes straight on (nothing else is loaded for one), and a slow or missing network costs at
// most PULL_LIMIT: the game then starts from this device's save.
const SESSION_KEY = 'slopdavos-session'; // (js/account.js; a static import here would load it for every guest)
const PULL_LIMIT = 1500; // ms

let signedIn = false;
try { signedIn = !!localStorage.getItem(SESSION_KEY); } catch { /* storage may be off */ }

if (signedIn) {
  const late = new AbortController();
  try {
    await Promise.race([
      import('./account-sync.js').then(({ pullBeforeStart }) => pullBeforeStart(late.signal)),
      new Promise((resolve) => setTimeout(resolve, PULL_LIMIT))
    ]);
  } catch (error) {
    console.warn('[account] the cloud save could not be loaded', error);
  }
  late.abort();
}

await import('./main.js');
