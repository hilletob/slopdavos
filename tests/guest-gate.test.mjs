import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
globalThis.localStorage ??= memory();
const { createGuestClock, GUEST_TIME_KEY, GUEST_LIMIT_MS } = await import('../js/guest-gate.js');
const { enabledProviders } = await import('../js/account.js');
const { LOGIN_PROVIDERS } = await import('../js/account-config.js');

test('a guest plays two minutes, and a reload does not give them back', () => {
  assert.equal(GUEST_LIMIT_MS, 120000);
  const storage = memory();
  const clock = createGuestClock(storage);
  for (let i = 0; i < 119; i++) assert.equal(clock.add(1000), false);
  assert.equal(clock.add(1000), true);
  assert.equal(storage.getItem(GUEST_TIME_KEY), '120000');
  assert.equal(createGuestClock(storage).over, true, 'the time stays on the device');
});

test('a long gap counts as two seconds at most, nonsense as nothing', () => {
  const clock = createGuestClock(memory());
  clock.add(60000); clock.add(-5); clock.add(NaN); clock.add('x');
  assert.equal(clock.ms, 2000);
  const odd = memory(); odd.setItem(GUEST_TIME_KEY, 'garbage');
  assert.equal(createGuestClock(odd).ms, 0);
});

test('Apple is offered, and only the providers the backend switched on are shown', async () => {
  assert.ok(LOGIN_PROVIDERS.some((p) => p.id === 'apple'));
  assert.ok(LOGIN_PROVIDERS.some((p) => p.id === 'google'));
  const on = await enabledProviders(LOGIN_PROVIDERS, async () => ({ ok: true, json: async () => ({ external: { google: true, apple: false } }) }));
  assert.deepEqual(on, ['google']);
});

test('the gate cannot be closed and stops the game', () => {
  const src = readFileSync(new URL('../js/guest-gate.js', import.meta.url), 'utf8');
  assert.match(src, /addEventListener\('cancel', \(e\) => e\.preventDefault\(\)\)/);
  assert.match(src, /showModal\(\)/);
  assert.match(readFileSync(new URL('../js/main.js', import.meta.url), 'utf8'), /pause: \(\) => \{ renderer\.setAnimationLoop\(null\)/);
});
