// js/storage-keys.js
// Every key the game keeps in the browser's storage, with what it holds and whether the account's cloud save carries it.
// The modules take their key from here instead of writing the string again, so that a key added somewhere cannot be
// forgotten by the cloud save without a word (tests/storage-keys.test.mjs finds every 'slopdavos-…' string in js/).
// No imports: anything may load it. Two places keep their strings on purpose: js/start.js, which imports nothing (a
// guest's start loads no other module), and js/missions.js's session key (tests/leaderboard.test.mjs); the pages
// index.html and auth/callback.html read the language and the landing's season in inline scripts.
//
// `cloud`, what js/account-merge.js and js/account-sync.js do with the key:
//   'world.<name>'  a part of the world, the field <name> of the save's `world`: the newer world wins as a whole
//   'progress', 'bestTimes'  merged entry by entry; 'worldAt' when the world was saved; 'stats' a column of its own
//   null  stays on this device (and stays when the save on it is forgotten, js/account-merge.js clearLocalSave)
// `session`: kept in sessionStorage (this tab only), not in localStorage.

export const STORAGE = {
  // --- the cloud save (the order of the world's parts is the order they are read and written in)
  playerState: { key: 'slopdavos-player-state', cloud: 'world.player', what: 'every player entity\'s place and heading and the mode played (js/main.js SAVE_VERSION)' },
  gta: { key: 'slopdavos-gta', cloud: 'world.gta', what: 'the parked vehicles, when each was left, the taken car or bus (js/gta.js); none: a first visit' },
  clock: { key: 'slopdavos-clock', cloud: 'world.clock', what: 'the game clock\'s minutes since the first day (js/game-clock.js)' },
  figure: { key: 'slopdavos-figure', cloud: 'world.figure', what: 'the chosen figure\'s id, as JSON (js/player-figure.js)' },
  character: { key: 'slopdavos-character', cloud: 'world.character', what: 'what the player says about themselves, as JSON (js/player-character.js)' },
  worldAt: { key: 'slopdavos-world-at', cloud: 'worldAt', what: 'when the world went to the cloud last, ms (js/account-sync.js)' },
  progress: { key: 'slopdavos-progress', cloud: 'progress', what: 'the missions\' medals, runs and best scores, the licences (js/missions-progress.js)' },
  bestTimes: { key: 'slopdavos-mission-best', cloud: 'bestTimes', what: 'the best time per mission and variant, ms (js/missions-data.js)' },
  stats: { key: 'slopdavos-stats', cloud: 'stats', what: 'the play statistics: time, distance, devices (js/play-stats.js)' },
  // --- the account
  session: { key: 'slopdavos-session', cloud: null, what: 'the Supabase session (its SDK writes it, and `-code-verifier` during a sign-in; js/account.js)' },
  owner: { key: 'slopdavos-account-owner', cloud: null, what: 'the account the save on this device belongs to (js/account-merge.js)' },
  loginReturn: { key: 'slopdavos-login-return', cloud: null, what: 'the page a sign-in comes back to (js/account.js)' },
  startChoice: { key: 'slopdavos-start-choice', cloud: null, what: 'how a first visit chose to play: as a guest or signed in (js/start-choice.js)' },
  guestTime: { key: 'slopdavos-guest-ms', cloud: null, what: 'a guest\'s time played on this device, ms (js/guest-gate.js)' },
  aiText: { key: 'slopdavos-ai-text', cloud: null, what: '\'off\': the personal texts switched off (js/personal-text.js)' },
  aiTexts: { key: 'slopdavos-ai-texts', cloud: null, session: true, what: 'the personal texts written in this tab (js/personal-text.js)' },
  // --- settings of the device
  language: { key: 'slopdavos-language', cloud: null, what: '\'de\' or \'en\' (js/i18n.js, also index.html, auth/callback.html, js/heatmap-page.js)' },
  sound: { key: 'nyc-sound', cloud: null, what: '\'off\': the sound muted (js/audio-system.js)' },
  radio: { key: 'davos-radio', cloud: null, what: 'the car radio\'s station id (js/car-radio.js)' },
  radioOff: { key: 'davos-radio-off', cloud: null, what: '\'1\': the car radio switched off (js/car-radio.js)' },
  live: { key: 'slopdavos-live', cloud: null, what: '\'off\': not shown on the live map (js/live-beacon.js)' },
  landingSeason: { key: 'slopdavos-landing-season', cloud: null, what: 'the landing page\'s season, \'winter\' or \'summer\' (index.html)' },
  // --- kept on this device only
  gallery: { key: 'slopdavos-kirchner-gallery', cloud: null, what: 'the Kirchner mission\'s last paintings (js/missions-local.js; too big for the cloud)' },
  quizSeen: { key: 'slopdavos-quiz-seen', cloud: null, what: 'the quiz questions this device has had (js/missions-data-quiz.js)' },
  freeFlightBest: { key: 'slopdavos-free-flight-best', cloud: null, what: 'the longest free paraglider flight, m (js/paraglide-free.js)' },
  leaderboardLast: { key: 'slopdavos-leaderboard-last', cloud: null, what: 'the leaderboard picked last (js/leaderboard-overview.js)' },
  raceName: { key: 'slopdavos-race-name', cloud: null, what: 'a guest\'s name in a race (js/race-ui.js)' },
  raceGuest: { key: 'slopdavos-race-guest', cloud: null, session: true, what: 'a guest\'s id in a race, for the tab (js/race-protocol.js)' },
  // --- diagnostics
  loadTime: { key: 'slopdavos-load-ms', cloud: null, what: 'how long the last start took, ms (js/loading-screen.js)' },
  boot: { key: 'slopdavos-boot', cloud: null, what: 'the start\'s stage and errors, until the first frame (js/main.js)' },
  moving: { key: 'slopdavos-moving', cloud: null, session: true, what: 'the breath a page leaving asked the next one for, ms (js/main.js)' },
  frameError: { key: 'slopdavos-frame-error', cloud: null, what: 'the last error in a frame (js/frame-guard.js)' },
  gpuLostAt: { key: 'slopdavos-gpu-lost-at', cloud: null, what: 'when the GPU device was lost last (js/frame-guard.js)' },
  gpuLog: { key: 'slopdavos-gpu', cloud: null, what: 'the last start\'s shader modules and GPU errors (js/gpu-diagnostics.js)' },
  lastWgsl: { key: 'slopdavos-last-wgsl', cloud: null, what: 'the last shader\'s code, on request (js/gpu-diagnostics.js)' },
  memHud: { key: 'slopdavos-memhud', cloud: null, what: 'the memory HUD\'s last line (js/mem-hud.js)' }
};

/** The keys by name: KEYS.playerState is 'slopdavos-player-state' */
export const KEYS = Object.freeze(Object.fromEntries(Object.entries(STORAGE).map(([name, e]) => [name, e.key])));

/** The keys the cloud save carries (`cloud` not null) */
export const CLOUD_KEYS = Object.freeze(Object.values(STORAGE).filter((e) => e.cloud).map((e) => e.key));

/** The world's parts by their field in the save: { player: 'slopdavos-player-state', gta: …, clock: …, figure: …, character: … } */
export const WORLD_KEYS = Object.freeze(Object.fromEntries(Object.values(STORAGE)
  .filter((e) => e.cloud?.startsWith('world.')).map((e) => [e.cloud.slice('world.'.length), e.key])));

/** The value kept as JSON under `key`, or `fallback` when there is none, it is no JSON or the storage is off */
export function readJson(key, fallback = null, storage = null) {
  try { return JSON.parse((storage ?? globalThis.localStorage).getItem(key)) ?? fallback; } catch { return fallback; }
}

/** Keeps `value` as JSON under `key`; false when the storage is full or off */
export function writeJson(key, value, storage = null) {
  try { (storage ?? globalThis.localStorage).setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
