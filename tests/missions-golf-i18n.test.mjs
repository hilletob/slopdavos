import assert from 'node:assert/strict';
import test from 'node:test';

// tests/missions-golf-i18n.test.mjs — the golf mission's HUD texts in German (js/i18n.js's pairs; the moving texts made
// with msg() by js/missions-data-golf.js GOLF_TEXT and the round's functions), with the
// same browser stand-ins as tests/i18n.test.mjs (German from the browser's language)
const saved = new Map();
globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
globalThis.document = {
  readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
  body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
  querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
};
Object.defineProperty(globalThis, 'navigator', { value: { language: 'de-CH' }, configurable: true });
globalThis.localStorage = { getItem(key) { return saved.get(key) ?? null; }, setItem(key, value) { saved.set(key, value); } };
globalThis.window = { dispatchEvent() {} };

const { getLanguage, t } = await import('../js/i18n.js');
const { GOLF_MISSION, GOLF_TEXT, shotReport, createBall, strike, simulateBall, windAgainstAim, createRound, endShot } = await import('../js/missions-data-golf.js');
// a text made by the mission: its English, then its German
const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de, en); };

test('the golf HUD speaks German: the card, the plan, the steps, the wind, the report and the tips', () => {
  assert.equal(getLanguage(), 'de');
  assert.match(t(GOLF_MISSION.intro), /^Drei Löcher im Golf Club Davos .*rote Fahne.*grüne Linie.*Ring auf der Fahne/);
  const cases = {
    'Start the swing': 'Schwung beginnen',
    'Swing': 'Schwung',
    'headwind from the left': 'Gegenwind von links'
  };
  for (const [en, de] of Object.entries(cases)) assert.equal(t(en), de, en);
  // the steps' titles, made as the module loads (a pattern of js/i18n.js)
  assert.equal(GOLF_MISSION.objectives[1].title, 'Hole 15 · Par 4');
  assert.equal(t(GOLF_MISSION.objectives[1].title), 'Loch 15 · Par 4');
  // the card, the plan and what is said (js/missions-golf.js makes them with GOLF_TEXT)
  const h14 = { name: 'Hole 14', ref: 14, par: 3, length: 115.3 };
  says(GOLF_TEXT.card(h14, 1, 'E'), 'Hole 14 · Par 3 · 115 m · Stroke 1 · Total E', 'Loch 14 · Par 3 · 115 m · Schlag 1 · Total E');
  says(GOLF_TEXT.hole(h14), 'Hole 14 · Par 3 · 115 m', 'Loch 14 · Par 3 · 115 m');
  says(GOLF_TEXT.pin(108), 'Pin 108 m', 'Fahne 108 m');
  says(GOLF_TEXT.full('7 Iron', false, 134), '7 Iron: full swing 134 m', 'Eisen 7: voller Schwung 134 m');
  says(GOLF_TEXT.full('Putter', true, 12), 'Putter: full stroke 12 m', 'Putter: voller Putt 12 m');
  says(GOLF_TEXT.needs(85), 'the pin needs 85 %', 'zur Fahne braucht es 85 %');
  says(GOLF_TEXT.wind(-7), 'wind −7 m', 'Wind −7 m');
  says(GOLF_TEXT.wind(3), 'wind +3 m', 'Wind +3 m');
  says(GOLF_TEXT.lieLoss('Rough', 14), 'Rough −14 %', 'Rough −14 %');
  says(GOLF_TEXT.lieLoss('Bunker', 40), 'Bunker −40 %', 'Bunker −40 %');
  says(GOLF_TEXT.strike('7 Iron', 85, 'Perfect strike'), '7 Iron 85% · Perfect strike', 'Eisen 7 85 % · Perfekt getroffen');
  says(GOLF_TEXT.strike(null, 60, 'Slight fade'), '60% · Slight fade', '60 % · Leichter Fade');
  says(GOLF_TEXT.landed(118, 'Fairway'), '118 m · Fairway', '118 m · Fairway');
  says(GOLF_TEXT.landed(64, 'Green'), '64 m · Green', '64 m · Grün');
  says(GOLF_TEXT.holed({ name: 'Birdie', strokes: 2, par: 3, bonus: 20 }), 'Birdie: 2 on a par 3 · bonus +20', 'Birdie: 2 auf Par 3 · Bonus +20');
  says(GOLF_TEXT.holed({ name: 'Double bogey', strokes: 6, par: 4, bonus: 0 }), 'Double bogey: 6 on a par 4', 'Doppel-Bogey: 6 auf Par 4');
  says(GOLF_TEXT.clubKey('3 Wood', 2), '3 Wood (2)', 'Holz 3 (2)');
  // the steps' lines and the round's own texts, from a round set up for them
  const state = GOLF_MISSION.createState(), r = state.round, pin = r.holes[0].pin, step = GOLF_MISSION.objectives[0];
  r.strokes = 1; r.ball = { x: pin.x + 23, z: pin.z, lie: 'rough' };
  says(step.check({}, state).text, 'Stroke 2 · 23 m to the pin · Rough', 'Schlag 2 · 23 m zur Fahne · Rough');
  r.strokes = 0; r.ball = { x: pin.x + 115, z: pin.z, lie: 'tee' };
  says(step.check({}, state).text, 'Stroke 1 · 115 m to the pin · Tee', 'Schlag 1 · 115 m zur Fahne · Abschlag');
  const rest = createRound();
  const restPin = rest.holes[0].pin;
  says(endShot(rest, { state: 'rest', x: restPin.x + 6, z: restPin.z, lie: 'green' }).text, 'Green · 6 m to the pin', 'Grün · 6 m zur Fahne');
  const tap = createRound();
  tap.strokes = tap.holes[0].par - 1;
  says(endShot(tap, { state: 'rest', x: tap.holes[0].pin.x + 0.2, z: tap.holes[0].pin.z, lie: 'green' }).text, 'Tapped in: Par', 'Eingelocht: Par');
  const done = { round: { results: [{ ref: 14, strokes: 3, par: 3, name: 'Par' }, { ref: 15, strokes: 5, par: 4, name: 'Bogey' }] } };
  says(GOLF_MISSION.summary(done)[0], '8 strokes, par 7: +1', '8 Schläge, Par 7: +1');
  // the report: its lines as the patterns' German had them
  const report = (over) => shotReport({ from: { x: 0, z: 0 }, heading: 0, club: 'iron7', power: 1, accuracy: 0, lie: 'tee', wind: null, carry: { x: 0, z: 118 }, end: { x: 0, z: 125 }, state: 'rest', pin: { x: 0, z: 110 }, need: 0.85, ...over }, { heightAt: () => 0, surfaceAt: () => 'fairway' });
  const calm = report({});
  says(calm.lines[0], 'Carry 118 m, rolled 7 m', 'Flug 118 m, gerollt 7 m');
  says(calm.tip, 'Tip: 100 % power, the pin needed 85 % (the red mark)', 'Tipp: 100 % Kraft, zur Fahne hätte es 85 % gebraucht (die rote Marke)');
  const pinLine = calm.lines.find((l) => l.startsWith('Pin: '));
  says(pinLine, 'Pin: 15 m long', 'Fahne: 15 m zu lang');
  const wet = report({ state: 'water' });
  says(wet.lines[0], 'Carry 118 m', 'Flug 118 m');
  const hooked = report({ accuracy: 0.9, carry: { x: -11, z: 118 }, end: { x: -11, z: 118 } });
  const hook = hooked.lines.find((l) => l.startsWith('Early'));
  assert.match(hook, /^Early: hook, \d+ m left$/);
  assert.equal(t(hook), hook.replace(/^Early: hook, (\d+) m left$/, 'Zu früh: Hook, $1 m nach links'));
  const sliced = report({ accuracy: -0.9, carry: { x: 9, z: 118 }, end: { x: 9, z: 118 } });
  const slice = sliced.lines.find((l) => l.startsWith('Late'));
  assert.match(slice, /^Late: slice, \d+ m right$/);
  assert.equal(t(slice), slice.replace(/^Late: slice, (\d+) m right$/, 'Zu spät: Slice, $1 m nach rechts'));
  const windy = report({ wind: { x: 4, z: -3 } });
  const wind = windy.lines.find((l) => l.startsWith('Wind: '));
  assert.match(wind, /^Wind: \d+ m (further|shorter)(, \d+ m (left|right))?$/);
  const ways = { further: 'weiter', shorter: 'kürzer', left: 'links', right: 'rechts' };
  assert.equal(t(wind), wind.replace(/^Wind: /, 'Wind: ').replace(/(\d+) m (further|shorter|left|right)/g, (_, m, w) => `${m} m ${ways[w]}`));
  // every line a real report writes has its German
  const b = createBall(0, 0, 0, 'tee');
  strike(b, { club: 'iron7', power: 1, heading: 0, accuracy: 0.7 });
  const env = { heightAt: () => 0, surfaceAt: () => 'fairway', wind: { x: -4, z: -3 } };
  simulateBall(b, env);
  const rep = shotReport({ from: { x: 0, z: 0 }, heading: 0, club: 'iron7', power: 1, accuracy: 0.7, lie: 'tee', wind: env.wind, carry: b.carry, end: { x: b.x, z: b.z }, state: b.state, pin: { x: 0, z: 110 }, need: 0.8 }, env);
  for (const line of [...rep.lines, rep.tip, windAgainstAim(env.wind, 0).words]) assert.notEqual(t(line), line, line);
});
