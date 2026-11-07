import { isTypingInField } from './city-config.js';
import { PAD_SLOTS } from './actions.js';

const DEAD_ZONE = 0.15;
const BUTTON_COUNT = 17;

function axis(value) {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function stick(pad, offset) {
  const x = axis(pad.axes?.[offset]), y = axis(pad.axes?.[offset + 1]);
  const distance = Math.hypot(x, y);
  const strength = Math.max(0, (Math.min(distance, 1) - DEAD_ZONE) / (1 - DEAD_ZONE));
  return distance ? { x: x / distance * strength, y: y / distance * strength } : { x: 0, y: 0 };
}

function buttonValue(pad, index) {
  const button = pad.buttons?.[index];
  return Number.isFinite(button?.value) ? Math.max(0, Math.min(1, button.value)) : button?.pressed ? 1 : 0;
}

function buttons(pad) {
  return Array.from({ length: BUTTON_COUNT }, (_, i) => Boolean(pad.buttons?.[i]?.pressed) || buttonValue(pad, i) > 0.5);
}

class GamepadControls {
  constructor(controllerManager, cameraSystem, callbacks = {}) {
    this.controller = controllerManager;
    this.camera = cameraSystem;
    this.callbacks = callbacks;
    this.actions = callbacks.actions || null; // (js/actions.js: the actions with a gamepad slot, `pad`)
    this.connected = false;
    this.enabled = true;
    this.padIndex = null;
    this.padId = null;
    this.previousButtons = [];
    this.suppressedButtons = [];
    this.syncButtons = true;
    this.revision = 0;
    this.focused = typeof document.hasFocus !== 'function' || document.hasFocus();

    window.addEventListener('blur', () => {
      this.focused = false;
      this.reset();
    });
    window.addEventListener('focus', () => {
      this.focused = true;
      this.reset();
    });
    document.addEventListener('visibilitychange', () => this.reset());
  }

  readPad() {
    // Some browsers expose the API but reject it through Permissions Policy.
    try {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
      const pads = navigator.getGamepads();
      let first = null;
      for (let i = 0; i < (pads?.length || 0); i++) {
        const pad = pads[i];
        if (!pad?.connected || pad.mapping !== 'standard') continue;
        if (pad.index === this.padIndex && pad.id === this.padId) return pad;
        if (!first) first = pad;
      }
      return first;
    } catch {
      return null;
    }
  }

  reset() {
    this.revision++;
    this.controller.clearGamepadInput();
    this.actions?.releaseAll();
    const pad = this.readPad();
    if (pad && pad.index === this.padIndex && pad.id === this.padId) {
      this.previousButtons = buttons(pad);
      this.suppressedButtons = this.previousButtons.slice();
      this.syncButtons = false;
    } else {
      this.syncButtons = true;
    }
  }

  setEnabled(enabled) {
    enabled = Boolean(enabled);
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.reset();
  }

  update(dt) {
    const pad = this.readPad();
    const connected = Boolean(pad);
    const changedPad = pad ? pad.index !== this.padIndex || pad.id !== this.padId : this.connected;
    if (changedPad) {
      this.controller.clearGamepadInput();
      this.padIndex = pad ? pad.index : null;
      this.padId = pad ? pad.id : null;
      this.syncButtons = true;
    }
    this.connected = connected;
    if (!pad) return;

    const pressed = buttons(pad);
    if (this.syncButtons) {
      // Connecting, switching pads, or resetting must not turn a held button into a fresh action.
      this.previousButtons = pressed.slice();
      this.suppressedButtons = pressed.slice();
      this.syncButtons = false;
    }
    for (let i = 0; i < BUTTON_COUNT; i++) if (!pressed[i]) this.suppressedButtons[i] = false;
    const edge = (i) => pressed[i] && !this.previousButtons[i] && !this.suppressedButtons[i];
    const held = (i) => pressed[i] && !this.suppressedButtons[i];
    // Capture edges before callbacks: changing mode or opening the map may synchronously call reset().
    const toggleMap = edge(9), closeMap = edge(1);
    const cycleCamera = edge(3), recenter = edge(11);
    // the register's actions: X / Square gets in or out (js/gta.js), d-pad left the wing (js/paraglide-free.js), B the
    // high beam, L3 the horn, d-pad right a groomer's tiller or a mission's extra; a mission's hold on A while the jump
    // button is hidden
    const slotted = [];
    if (this.actions) {
      for (const a of this.actions.list()) {
        if (a.kind === 'hint' || a.input || !a.pad || this.actions.hidden(a.id)) continue;
        const i = PAD_SLOTS[a.pad];
        if (i == null || i === 1 && !this.enabled) continue;
        slotted.push([a, a.kind === 'hold' ? held(i) : edge(i)]);
      }
    }
    this.previousButtons = pressed;

    const target = document.activeElement;
    const typing = isTypingInField({ target }) || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
    if (!this.focused || document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus()) || typing) {
      this.suppressedButtons = pressed.slice();
      this.controller.clearGamepadInput();
      return;
    }

    const revision = this.revision;
    if (toggleMap) {
      this.controller.clearGamepadInput();
      this.callbacks.onToggleMap?.();
      return;
    }
    if (!this.enabled) {
      this.controller.clearGamepadInput();
      for (let i = 0; i < BUTTON_COUNT; i++) if (i !== 1 && i !== 9) this.suppressedButtons[i] = pressed[i];
      if (closeMap) this.callbacks.onCloseMap?.();
      return;
    }
    if (cycleCamera) this.callbacks.onCycleCamera?.(1);
    if (revision !== this.revision) return;
    for (const [a, on] of slotted) {
      if (a.kind === 'hold') this.actions.hold(a, on);
      else if (on) this.actions.press(a);
      if (revision !== this.revision) return;
    }
    if (recenter) this.camera.resetOrbit();

    const movement = stick(pad, 0), look = stick(pad, 2);
    const mode = this.controller.activeMode;
    let drive = -movement.y;
    let vertical = 0;
    if (mode === 'car' || mode === 'cyclist' || mode === 'cargobike' || mode === 'snowcat' || mode === 'rhb') {
      drive = Math.max(0, drive, buttonValue(pad, 7)) - Math.max(0, -drive, buttonValue(pad, 6));
    } else if (mode === 'helicopter') {
      vertical = buttonValue(pad, 7) - buttonValue(pad, 6);
    }
    // the bird's-eye camera: the left stick points where to go on the screen (js/controllers.js setStickDirection); with
    // the stick let go, the triggers still drive (and back up) straight on
    const reach = Math.min(1, Math.hypot(movement.x, movement.y));
    const pointing = this.controller.directionalSteering && reach > 0.2;
    this.controller.setStickDirection?.('gamepad', pointing ? movement.x : null, movement.y, reach);
    if (!pointing) {
      const turn = this.controller.directionalSteering ? 0 : movement.x;
      if (this.controller.directionalSteering) drive = buttonValue(pad, 7) - buttonValue(pad, 6);
      this.controller.setGamepadInput('forward', Math.max(0, drive));
      this.controller.setGamepadInput('backward', Math.max(0, -drive));
      this.controller.setGamepadInput('left', Math.max(0, -turn));
      this.controller.setGamepadInput('right', Math.max(0, turn));
    }
    const jump = mode === 'person' && !this.actions?.hidden('up'); // (a mission's hold has A while the jump is hidden)
    this.controller.setGamepadInput('up', jump ? Number(Boolean(held(0))) : Math.max(0, vertical));
    this.controller.setGamepadInput('down', Math.max(0, -vertical));
    const zoom = Number(Boolean(held(13))) - Number(Boolean(held(12)));
    this.camera.applyGamepadInput(look.x, look.y, zoom, Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0);
  }
}

export { GamepadControls };
