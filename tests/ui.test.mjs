import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The HUD's shape (index.html, css/style.css): one toolbar in three groups, the menu for what is set once in a while,
// one dialog shell for the missions, the leaderboards and the credits

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
const toolbar = html.match(/<div id="hud-toolbar"[^]*?<\/div>\s*<\/div>/)[0];
const menu = html.match(/<div id="menu-popover"[^]*?\n  <\/div>/)[0];

test('the brand carries no repository link; the code\'s origin stays in the credits', () => {
  assert.doesNotMatch(html, /repo-link/);
  const credits = html.match(/<dialog id="credits-dialog"[^]*?<\/dialog>/)[0];
  const outside = html.replace(credits, '');
  assert.doesNotMatch(outside, /github\.com/);
  assert.match(credits, /github\.com\/colorfield\/slop-zurich/);
  assert.doesNotMatch(i18n, /GitHub/);
  assert.doesNotMatch(css, /repo-link/);
});

test('the toolbar: the clock opens the fast-forward, then missions, teleport, map, then account, menu and clean view', () => {
  const ids = [...toolbar.matchAll(/<button id="([\w-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['btn-fastforward', 'btn-missions', 'btn-teleport', 'btn-open-map', 'btn-account', 'btn-menu', 'btn-toggle-hud']);
  assert.match(toolbar, /id="btn-fastforward" class="tool-btn hud-clock"[^>]*popovertarget="ff-popover"/);
  assert.match(toolbar, /id="hud-clock-time"/);
  assert.match(toolbar, /id="btn-missions"[^>]*\bhidden\b/, 'shown by js/missions-world.js, with the points');
  assert.match(toolbar, /id="hud-points"/);
  assert.match(toolbar, /id="btn-account"[^>]*>\s*<svg[^>]*><use href="#i-user"\/><\/svg><span class="tool-label">Sign in<\/span>/);
  assert.doesNotMatch(toolbar, /language-switch|btn-sound/, 'the language and the sound live in the menu');
  assert.equal((toolbar.match(/toolbar-divider/g) || []).length, 2);
});

test('the menu holds the language, the sound, the clean view, the credits and the privacy', () => {
  assert.match(menu, /popover data-side="below"/);
  assert.match(menu, /class="language-switch"[^]*id="lang-de"[^]*id="lang-en"/);
  assert.match(menu, /id="btn-sound" class="pop-item"[^>]*aria-pressed="true"/);
  assert.match(menu, /id="sound-state"/);
  assert.match(menu, /id="btn-hud-menu" class="pop-item"/);
  assert.match(menu, /id="btn-credits-menu" class="pop-item"/);
  assert.match(menu, /href="\.\/privacy\.html"/);
  for (const text of ['Menu', 'Language', 'Sound', 'On', 'Off', 'Clean view', 'About', 'Missions: points and medals', 'Game time: fast-forward']) {
    assert.match(i18n, new RegExp(`\\['${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', '`), `${text} has its German`);
  }
});

test('one dialog shell: the credits share the missions\' dialog, with the head and the ×', () => {
  assert.match(html, /<dialog id="credits-dialog" class="panel mission-dialog credits-dialog"/);
  assert.match(html, /class="mission-dialog-head">\s*<div>\s*<div class="mission-kicker">Slop Davos<\/div>\s*<h2 id="credits-title" class="mission-dialog-title">/);
  assert.match(html, /<button class="dialog-close" type="submit"[^>]*><svg class="icon"[^>]*><use href="#i-close"\/>/);
  assert.doesNotMatch(css, /credits-close|credits-head|\.mission-score \{|leaderboard-overlay/);
  assert.match(css, /\.mission-dialog-head \{/);
  assert.match(css, /\.dialog-tab\[aria-selected="true"\]/);
});

test('the telemetry under the brand shows with ?stats=1 only', () => {
  assert.match(css, /\.brand-subtitle \{\s*display: none;/);
  assert.match(css, /body\.show-stats \.brand-subtitle \{ display: block; \}/);
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /stats=\(1\|true\)[^\n]*show-stats/);
});

test('the missions\' list has the leaderboards as its second tab; nothing opens a second overlay', () => {
  const missions = readFileSync(new URL('../js/missions.js', import.meta.url), 'utf8');
  const overview = readFileSync(new URL('../js/leaderboard-overview.js', import.meta.url), 'utf8');
  const account = readFileSync(new URL('../js/account-ui.js', import.meta.url), 'utf8');
  assert.match(missions, /\['missions', 'Missions'\], \['boards', 'Leaderboards'\]/);
  assert.match(missions, /renderLeaderboards\(boardsPane/);
  assert.match(overview, /export function renderLeaderboards\(container/);
  assert.doesNotMatch(overview, /openLeaderboards|leaderboard-overlay/);
  assert.doesNotMatch(account, /Leaderboards|leaderboard-overview/);
  const world = readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8');
  assert.match(world, /getElementById\('btn-missions'\)/);
  assert.doesNotMatch(world, /'panel mission-score'/);
});

test('one register of actions (js/actions.js): the keys, the key bar, the touch rows and the gamepad read it', () => {
  const read = (f) => readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
  const main = read('main.js'), controllers = read('controllers.js'), gta = read('gta.js'), touch = read('touch-controls.js'), pad = read('gamepad-controls.js');
  assert.match(main, /import \{ actions, bindKeyboard \} from '\.\/actions\.js'/);
  assert.match(main, /actions\.layer\('vehicle'/);
  for (const id of ['horn', 'indicatorLeft', 'indicatorRight', 'hazard', 'highBeam', 'beacon', 'tiller']) assert.match(main, new RegExp(`id: '${id}'`), `${id} is an action`);
  assert.doesNotMatch(main, /'Shift'\], 'Boost'|'Shift'\], 'Sprint'|is-boosting/, 'no key without a function');
  assert.doesNotMatch(controllers, /'KeyL'|'KeyK'|'KeyX'|toggleIndicator\(side\)\s*;?\s*\}\s*\n\s*\/\/ L/, 'the controller keeps the movement only');
  assert.match(gta, /actions\?\.layer\('gta'/);
  assert.doesNotMatch(gta, /addEventListener\('keydown'/);
  assert.match(touch, /this\.actions\?\.subscribe\(\(\) => this\.render\(\)\)/);
  assert.match(pad, /PAD_SLOTS\[a\.pad\]/);
  // the two rows under the left thumb; nothing of the missions' own red or blue buttons is left
  assert.match(html, /<div id="touch-extra" class="touch-row touch-extra" hidden><\/div>\s*<div id="touch-primary" class="touch-row touch-primary">/);
  for (const icon of ['i-beam', 'i-horn', 'i-ind-left', 'i-ind-right', 'i-hazard', 'i-beacon', 'i-tiller', 'i-chute', 'i-hook', 'i-fire', 'i-shovel', 'i-hand', 'i-swap', 'i-radio']) assert.match(html, new RegExp(`<symbol id="${icon}"`), icon);
  assert.doesNotMatch(css, /mission-fire|touch-tap-label/);
  assert.match(css, /\.touch-action\[data-on="true"\]/);
  assert.match(css, /\.hint\.is-on kbd/);
  assert.doesNotMatch(css, /mode-switch|mode-btn/, 'the mode bar of the old game is gone: the vehicles are taken by getting in');
  assert.match(css, /body\.touch-enabled #hud-active-camera \{ display: none; \}/, 'the camera cluster: three buttons on a phone');
  assert.match(css, /#touch-controls \{\n  position: fixed;[^}]*bottom: max\(var\(--edge\), env\(safe-area-inset-bottom\)\);/, 'the touch controls sit at the bottom');
  for (const f of ['missions.js', 'missions-work.js', 'missions-wef.js', 'missions-snow.js', 'missions-rural.js']) assert.doesNotMatch(read(f), /mission-fire|'wf-pad'\)|craneKeyBar/, f);
  const missions = read('missions.js');
  assert.match(missions, /^\s+actions\(list, \{ replace = \(\) => this\.ownControls \} = \{\}\) \{/m);
  assert.match(missions, /^\s+hints\(list\)/m);
  assert.match(missions, /^\s+button\(id, label\)/m);
  // the missions' key legends are hints of the register, not text of their own
  for (const f of ['missions-care.js', 'missions-ice.js', 'missions-golf.js', 'missions-outdoor.js', 'missions-paraglide.js', 'missions-sport.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /-keys'/, `${f}: no legend of its own`);
    assert.match(src, /run\.hints\(/, `${f}: hints in the bar`);
    assert.doesNotMatch(src, /\+ 200px\)/, `${f}: clears the touch controls by --touch-clear`);
  }
  for (const text of ['Hazard lights', 'Chute', 'Climb across', 'Left', 'Right', 'walk', 'steer', 'flare', 'overview']) {
    assert.match(i18n, new RegExp(`\\['${text}', '`), `${text} has its German`);
  }
});
