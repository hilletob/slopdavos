const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const source = readFileSync(join(__dirname, '../js/touch-controls.js'), 'utf8');

function element(attributes = {}) {
  const listeners = new Map();
  const classes = new Set();
  const captures = new Set();
  const styles = new Map();
  return {
    hidden: false,
    textContent: '',
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }
    },
    style: { setProperty: (name, value) => styles.set(name, value), getPropertyValue: (name) => styles.get(name) },
    getAttribute: (name) => attributes[name],
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, options = {}) {
      const event = { pointerId: 1, pointerType: 'touch', button: 0, clientX: 64, clientY: 64, preventDefault() {}, stopPropagation() {}, ...options };
      for (const listener of listeners.get(type) || []) listener(event);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 128, height: 128 }),
    setPointerCapture: (id) => captures.add(id),
    hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture(id) {
      if (captures.delete(id)) this.dispatch('lostpointercapture', { pointerId: id });
    }
  };
}

function row() {
  const r = element();
  r.children = [];
  r.append = (...kids) => { for (const k of kids) { const i = r.children.indexOf(k); if (i >= 0) r.children.splice(i, 1); r.children.push(k); k.parentNode = r; } };
  r.insertBefore = (k, ref) => { const i = r.children.indexOf(k); if (i >= 0) r.children.splice(i, 1); const j = r.children.indexOf(ref); r.children.splice(j < 0 ? r.children.length : j, 0, k); k.parentNode = r; };
  return r;
}

function harness({ coarse = true, mode = 'person', actions = null } = {}) {
  const window = element();
  const document = { ...element(), body: element(), hidden: false };
  document.createElement = () => {
    const e = element();
    e.children = [];
    e.dataset = {};
    e.append = (...kids) => { e.children.push(...kids); if (!e.firstChild) e.firstChild = kids[0]; };
    e.remove = () => { const p = e.parentNode; if (p) { const i = p.children.indexOf(e); if (i >= 0) p.children.splice(i, 1); } };
    return e;
  };
  const media = { ...element(), matches: coarse };
  window.matchMedia = () => media;
  const root = element();
  const stick = element();
  const knob = element();
  const buttons = Object.fromEntries(['up', 'down'].map((action) => [action, element({ 'data-touch-action': action })]));
  const labels = Object.fromEntries(Object.keys(buttons).map((action) => [action, element()]));
  const rows = { primary: row(), extra: row() };
  rows.primary.append(buttons.up, buttons.down);
  root.querySelectorAll = () => Object.values(buttons);
  root.querySelector = (selector) => labels[selector.match(/"(.*?)"/)[1]];
  document.getElementById = (id) => ({ 'touch-controls': root, 'touch-stick': stick, 'touch-stick-knob': knob, 'touch-primary': rows.primary, 'touch-extra': rows.extra })[id];
  const input = Object.fromEntries(['forward', 'backward', 'left', 'right', 'up', 'down'].map((action) => [action, 0]));
  const controller = {
    activeMode: mode,
    setTouchInput(action, value) { input[action] = value; },
    clearTouchInput() { for (const action of Object.keys(input)) input[action] = 0; }
  };
  const { TouchControls } = loadModule(source, { globals: { window, document } });
  const controls = new TouchControls(controller, { actions });
  return { controls, window, document, media, root, stick, knob, buttons, labels, input, rows };
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} should be close to ${expected}`);
}

test('stick preserves analog strength and normalizes diagonal input with a radial deadzone', () => {
  const { stick, knob, input } = harness();
  stick.dispatch('pointerdown');
  stick.dispatch('pointermove', { clientX: 70 });
  assert.equal(input.right, 0, 'small motions stay in the deadzone');
  stick.dispatch('pointermove', { clientX: 86 });
  near(input.right, (0.5 - 0.15) / 0.85);
  assert.equal(input.left, 0);
  assert.equal(input.forward, 0);
  stick.dispatch('pointermove', { clientX: 164, clientY: -36 });
  near(input.right, Math.SQRT1_2);
  near(input.forward, Math.SQRT1_2);
  near(Math.hypot(input.right, input.forward), 1);
  near(Math.hypot(parseFloat(knob.style.getPropertyValue('--stick-x')), parseFloat(knob.style.getPropertyValue('--stick-y'))), 44);
  assert.equal(stick.hasPointerCapture(1), true);
});

test('stick and multiple held button pointers release independently', () => {
  const { stick, buttons, input } = harness({ mode: 'helicopter' });
  stick.dispatch('pointerdown', { clientY: 20 });
  buttons.up.dispatch('pointerdown', { pointerId: 2 });
  buttons.up.dispatch('pointerdown', { pointerId: 3 });
  buttons.down.dispatch('pointerdown', { pointerId: 4 });
  assert.equal(input.forward, 1);
  assert.equal(input.up, 1);
  assert.equal(input.down, 1);
  stick.dispatch('pointermove', { pointerId: 5, clientY: 108 });
  assert.equal(input.forward, 1, 'an unrelated camera pointer cannot move the stick');
  buttons.up.dispatch('pointerup', { pointerId: 2 });
  assert.equal(input.up, 1, 'the second ascend pointer remains held');
  assert.equal(buttons.up.getAttribute('aria-pressed'), 'true');
  stick.dispatch('pointerup');
  assert.equal(input.forward, 0);
  assert.equal(input.up, 1);
  assert.equal(input.down, 1);
  buttons.up.dispatch('pointerup', { pointerId: 3 });
  assert.equal(input.up, 0);
  assert.equal(buttons.up.classList.contains('is-pressed'), false);
  assert.equal(buttons.up.getAttribute('aria-pressed'), 'false');
  assert.equal(input.down, 1);
});

for (const type of ['pointercancel', 'lostpointercapture']) {
  test(`${type} clears only the affected pointer and its feedback`, () => {
    const { stick, knob, buttons, input } = harness();
    stick.dispatch('pointerdown', { clientX: 20 });
    buttons.up.dispatch('pointerdown', { pointerId: 2 });
    stick.dispatch(type);
    assert.equal(input.left, 0);
    assert.equal(input.up, 1);
    assert.equal(stick.classList.contains('is-pressed'), false);
    assert.equal(knob.style.getPropertyValue('--stick-x'), '0px');
    buttons.up.dispatch(type, { pointerId: 2 });
    assert.equal(input.up, 0);
    assert.equal(buttons.up.getAttribute('aria-pressed'), 'false');
  });
}

test('mode changes clear touches and expose the relevant actions', () => {
  const { controls, stick, buttons, labels, input } = harness();
  assert.equal(labels.up.textContent, 'Jump');
  assert.equal(buttons.up.hidden, false);
  assert.equal(buttons.down.hidden, true);
  stick.dispatch('pointerdown', { clientY: 20 });
  buttons.up.dispatch('pointerdown', { pointerId: 2 });
  controls.setMode('helicopter');
  assert.equal(Object.values(input).some(Boolean), false);
  assert.equal(stick.hasPointerCapture(1), false);
  assert.equal(buttons.up.hasPointerCapture(2), false);
  assert.equal(labels.up.textContent, 'Ascend');
  assert.equal(buttons.up.hidden, false);
  assert.equal(buttons.down.hidden, false);
  controls.setMode('car');
  assert.equal(buttons.up.hidden, true);
  assert.equal(buttons.down.hidden, true);
  buttons.up.dispatch('pointerdown', { pointerId: 3 });
  assert.equal(input.up, 0, 'hidden actions cannot receive input');
  controls.setMode('cargobike');
  assert.equal(buttons.up.hidden, true);
  assert.equal(buttons.down.hidden, true);
  controls.setMode('cyclist');
  assert.equal(buttons.up.hidden, true);
  assert.equal(buttons.down.hidden, true);
});

test('disabling controls clears held input and blocks new input until enabled', () => {
  const { controls, root, stick, buttons, input } = harness();
  stick.dispatch('pointerdown', { clientY: 20 });
  buttons.up.dispatch('pointerdown', { pointerId: 2 });
  controls.setEnabled(false);
  assert.equal(root.hidden, true);
  assert.equal(Object.values(input).some(Boolean), false);
  stick.dispatch('pointerdown', { clientY: 20 });
  buttons.up.dispatch('pointerdown', { pointerId: 3 });
  assert.equal(Object.values(input).some(Boolean), false);
  controls.setEnabled(true);
  assert.equal(root.hidden, false);
  stick.dispatch('pointerdown', { clientY: 20 });
  assert.equal(input.forward, 1);
});

for (const interruption of ['blur', 'hidden', 'resize']) {
  test(`${interruption} resets all held input and pointer captures`, () => {
    const { window, document, stick, buttons, input } = harness();
    stick.dispatch('pointerdown', { clientY: 20 });
    buttons.up.dispatch('pointerdown', { pointerId: 2 });
    if (interruption === 'hidden') {
      document.hidden = true;
      document.dispatch('visibilitychange');
    } else {
      window.dispatch(interruption);
    }
    assert.equal(Object.values(input).some(Boolean), false);
    assert.equal(stick.hasPointerCapture(1), false);
    assert.equal(buttons.up.hasPointerCapture(2), false);
  });
}

test('desktop controls stay hidden until a coarse pointer or first touch is available', () => {
  const { document, media, root, stick, input } = harness({ coarse: false });
  assert.equal(root.hidden, true);
  assert.equal(document.body.classList.contains('touch-enabled'), false);
  media.matches = true;
  media.dispatch('change');
  assert.equal(root.hidden, false);
  stick.dispatch('pointerdown', { clientY: 20 });
  media.matches = false;
  media.dispatch('change');
  assert.equal(root.hidden, true);
  assert.equal(input.forward, 0, 'losing availability clears active controls');
  document.dispatch('pointerdown', { pointerType: 'mouse' });
  assert.equal(root.hidden, true);
  document.dispatch('pointerdown', { pointerType: 'touch' });
  assert.equal(root.hidden, false);
  assert.equal(document.body.classList.contains('touch-enabled'), true);
});

test('availability callback runs after visibility updates and only on an actual change', () => {
  const { controls, document, media, root } = harness({ coarse: false });
  assert.equal(controls.onAvailabilityChange, null);
  const changes = [];
  controls.onAvailabilityChange = (available) => {
    changes.push(available);
    assert.equal(document.body.classList.contains('touch-enabled'), available);
    assert.equal(root.hidden, !available);
  };
  media.dispatch('change');
  assert.deepEqual(changes, []);
  media.matches = true;
  media.dispatch('change');
  media.dispatch('change');
  assert.deepEqual(changes, [true]);
  media.matches = false;
  media.dispatch('change');
  document.dispatch('pointerdown', { pointerType: 'touch' });
  document.dispatch('pointerdown', { pointerType: 'touch' });
  assert.deepEqual(changes, [true, false, true]);
});

test('the tap button (the GTA mode\'s get in / out): first among the actions, fires once on release, hidden until labelled', () => {
  const { ActionRegistry } = loadModule(readFileSync(join(__dirname, '../js/actions.js'), 'utf8'), {});
  const registry = new ActionRegistry();
  const { controls, rows } = harness({ actions: registry });
  let taps = 0;
  const button = controls.addTapButton({ className: 'touch-use', label: 'Get in', icon: '↗', onTap: () => taps++ });
  assert.equal(button.hidden, true);
  button.dispatch('pointerdown');
  button.dispatch('pointerup');
  assert.equal(taps, 0, 'hidden: no tap');
  controls.setTapButton(button, 'Get out', '↙');
  assert.equal(button.hidden, false);
  assert.equal(button.getAttribute('aria-label'), 'Get out');
  assert.equal(rows.primary.children[0], button, 'under the left thumb, before the hold buttons');
  button.dispatch('pointerdown');
  assert.equal(taps, 0, 'not on the press');
  button.dispatch('pointerup');
  assert.equal(taps, 1, 'once, on the release');
  button.dispatch('pointerdown');
  button.dispatch('pointercancel');
  assert.equal(taps, 1, 'a cancelled touch does nothing');
  controls.setTapButton(button, null);
  assert.equal(button.hidden, true);
});

test('the register\'s actions become buttons: a hold held, a toggle switched on the press, a tap on the release; a relabelled jump', () => {
  const { ActionRegistry } = loadModule(readFileSync(join(__dirname, '../js/actions.js'), 'utf8'), {});
  const registry = new ActionRegistry();
  let beam = false;
  const log = [];
  registry.layer('vehicle', [
    { id: 'up', kind: 'hold', input: 'up', label: 'Jump', keys: ['Space'], keyboard: false },
    { id: 'highBeam', kind: 'toggle', label: 'High beam', keys: ['KeyL'], icon: 'i-beam', state: () => beam, run: () => { beam = !beam; } },
    { id: 'horn', label: 'Horn', keys: ['KeyB'], icon: 'i-horn', run: () => log.push('horn') },
    { id: 'shovel', kind: 'hold', primary: true, label: 'Shovel', run: (on) => log.push(`shovel:${on}`) }
  ]);
  const { rows, buttons, labels } = harness({ actions: registry });
  assert.equal(labels.up.textContent, 'Jump');
  assert.equal(buttons.up.hidden, false);
  assert.deepEqual(rows.extra.children.map((b) => b.getAttribute('data-action')), ['highBeam', 'horn']);
  assert.deepEqual(rows.primary.children.map((b) => b.getAttribute('data-action') || b.getAttribute('data-touch-action')), ['up', 'down', 'shovel'], 'after the fixed buttons');
  const [beamBtn, hornBtn] = rows.extra.children;
  assert.equal(beamBtn.getAttribute('data-on'), 'false');
  beamBtn.dispatch('pointerdown');
  assert.equal(beam, true, 'a toggle switches on the press');
  assert.equal(beamBtn.getAttribute('data-on'), 'true');
  beamBtn.dispatch('pointerup');
  hornBtn.dispatch('pointerdown');
  assert.deepEqual(log, []);
  hornBtn.dispatch('pointerup');
  assert.deepEqual(log, ['horn']);
  const shovel = rows.primary.children[2];
  shovel.dispatch('pointerdown', { pointerId: 7 });
  assert.deepEqual(log, ['horn', 'shovel:true']);
  shovel.dispatch('pointercancel', { pointerId: 7 });
  assert.deepEqual(log, ['horn', 'shovel:true', 'shovel:false']);
  registry.relabel('up', 'Swing');
  assert.equal(labels.up.textContent, 'Swing');
  assert.equal(buttons.up.getAttribute('aria-label'), 'Swing');
  registry.relabel('up', null);
  assert.equal(buttons.up.hidden, true);
  registry.relabel('down', 'Lower');
  assert.equal(buttons.down.hidden, false, 'shown although the mode has no descend');
  assert.equal(labels.down.textContent, 'Lower');
  registry.relabel('up');
  registry.relabel('down');
  assert.equal(labels.up.textContent, 'Jump');
  assert.equal(buttons.down.hidden, true);
});

test('a stick whose finger never reported its release lets go when the touches say so, or a new finger takes over', () => {
  const { controls, document, stick, knob, input } = harness();
  stick.contains = (target) => target === stick || target === knob;
  stick.dispatch('pointerdown', { pointerId: 1, clientY: 20 });
  assert.equal(input.forward, 1);
  // a camera finger comes and goes, the stick's thumb still down: it stays held
  document.dispatch('touchend', { touches: [{ target: knob }] });
  assert.equal(input.forward, 1, 'still held while its finger is down');
  // the thumb's pointerup never comes, only the touch list shows it gone
  document.dispatch('touchend', { touches: [{ target: {} }] });
  assert.equal(input.forward, 0, 'released');
  assert.equal(controls.stickPointer, null);
  // and with no touch event either: the next finger on the stick is not ignored
  stick.dispatch('pointerdown', { pointerId: 2, clientY: 20 });
  assert.equal(input.forward, 1);
  stick.dispatch('pointerdown', { pointerId: 3, clientY: 108 });
  assert.equal(controls.stickPointer, 3);
  assert.equal(input.forward, 0);
  assert.equal(input.backward, 1, 'the new finger steers');
});

test('a held button lets go when no finger is on it any more', () => {
  const { document, buttons, input } = harness({ mode: 'helicopter' });
  buttons.up.contains = (target) => target === buttons.up;
  buttons.up.dispatch('pointerdown', { pointerId: 2 });
  assert.equal(input.up, 1);
  document.dispatch('touchcancel', { touches: [] });
  assert.equal(input.up, 0);
  assert.equal(buttons.up.getAttribute('aria-pressed'), 'false');
});
