// js/start.js
// The page's entry. A signed-in player's save comes from the cloud first, because the game reads its state from localStorage
// while its modules load. A guest goes straight on (nothing else is loaded for one), and a slow or missing network costs at
// most PULL_LIMIT: the game then starts from this device's save. A first visit is asked how to play (js/start-choice.js):
// signed in from here, the city is built only once. A link with switches (?mission=...) goes straight to what it points at.
const SESSION_KEY = 'slopdavos-session'; // (js/account.js; a static import here would load it for every guest)
const PULL_LIMIT = 1500; // ms

let signedIn = false, firstVisit = false;
try {
  signedIn = !!localStorage.getItem(SESSION_KEY);
  // (the keys of js/start-choice.js and js/account-merge.js: someone with a save has been here before)
  firstVisit = !signedIn && !location.search && !['slopdavos-start-choice', 'slopdavos-progress', 'slopdavos-player-state'].some((key) => localStorage.getItem(key));
} catch { /* storage may be off */ }

if (firstVisit) {
  try {
    const { askHowToPlay } = await import('./start-choice.js');
    await askHowToPlay();
  } catch (error) {
    console.warn('[account] the start choice could not be shown', error);
  }
}

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
