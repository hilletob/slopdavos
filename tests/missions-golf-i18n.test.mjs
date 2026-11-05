import assert from 'node:assert/strict';
import test from 'node:test';

// tests/missions-golf-i18n.test.mjs — the golf mission's HUD texts in German (js/i18n.js: the pairs and golfDe), with the
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
const { GOLF_MISSION, shotReport, createBall, strike, simulateBall, windAgainstAim } = await import('../js/missions-data-golf.js');

test('the golf HUD speaks German: the card, the plan, the steps, the wind, the report and the tips', () => {
  assert.equal(getLanguage(), 'de');
  assert.match(t(GOLF_MISSION.intro), /^Drei Löcher im Golf Club Davos .*rote Fahne.*grüne Linie.*Ring auf der Fahne/);
  const cases = {
    'Hole 14 · Par 3 · 115 m · Stroke 1 · Total E': 'Loch 14 · Par 3 · 115 m · Schlag 1 · Total E',
    'Hole 15 · Par 4': 'Loch 15 · Par 4',
    'Stroke 2 · 23 m to the pin · Rough': 'Schlag 2 · 23 m zur Fahne · Rough',
    'Stroke 1 · 115 m to the pin · Tee': 'Schlag 1 · 115 m zur Fahne · Abschlag',
    'Pin 108 m': 'Fahne 108 m',
    '7 Iron: full swing 134 m': 'Eisen 7: voller Schwung 134 m',
    'Putter: full stroke 12 m': 'Putter: voller Putt 12 m',
    'the pin needs 85 %': 'zur Fahne braucht es 85 %',
    'wind −7 m': 'Wind −7 m',
    'Rough −14 %': 'Rough −14 %',
    'Carry 118 m, rolled 7 m': 'Flug 118 m, gerollt 7 m',
    'Early: hook, 11 m left': 'Zu früh: Hook, 11 m nach links',
    'Late: slice, 9 m right': 'Zu spät: Slice, 9 m nach rechts',
    'Wind: 4 m shorter, 2 m right': 'Wind: 4 m kürzer, 2 m rechts',
    'Pin: 10 m long, 5 m right': 'Fahne: 10 m zu lang, 5 m rechts',
    'Tip: 100 % power, the pin needed 85 % (the red mark)': 'Tipp: 100 % Kraft, zur Fahne hätte es 85 % gebraucht (die rote Marke)',
    '7 Iron 85% · Perfect strike': 'Eisen 7 85 % · Perfekt getroffen',
    '118 m · Fairway': '118 m · Fairway',
    'Green · 6 m to the pin': 'Grün · 6 m zur Fahne',
    'Birdie: 2 on a par 3 · bonus +20': 'Birdie: 2 auf Par 3 · Bonus +20',
    'Tapped in: Par': 'Eingelocht: Par',
    'Start the swing': 'Schwung beginnen',
    'Swing': 'Schwung',
    'headwind from the left': 'Gegenwind von links'
  };
  for (const [en, de] of Object.entries(cases)) assert.equal(t(en), de, en);
  // every line a real report writes has its German
  const b = createBall(0, 0, 0, 'tee');
  strike(b, { club: 'iron7', power: 1, heading: 0, accuracy: 0.7 });
  const env = { heightAt: () => 0, surfaceAt: () => 'fairway', wind: { x: -4, z: -3 } };
  simulateBall(b, env);
  const rep = shotReport({ from: { x: 0, z: 0 }, heading: 0, club: 'iron7', power: 1, accuracy: 0.7, lie: 'tee', wind: env.wind, carry: b.carry, end: { x: b.x, z: b.z }, state: b.state, pin: { x: 0, z: 110 }, need: 0.8 }, env);
  for (const line of [...rep.lines, rep.tip, windAgainstAim(env.wind, 0).words]) assert.notEqual(t(line), line, line);
});
