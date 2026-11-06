// js/actions.js
// One register for everything the player does besides moving and steering: the van's horn and indicators, the high
// beam, the groomer's beacon and tiller, getting in and out (js/gta.js), the wing (js/paraglide-free.js) and whatever
// a mission adds (a crane's hook, a blower's chute, the escort's blue light). An action is described once, with its
// key, how it is used (a tap, a hold, a switch), its icon and its gamepad slot; the keyboard (bindKeyboard below), the
// key hints at the bottom (js/main.js renderHints), the touch buttons (js/touch-controls.js) and the gamepad
// (js/gamepad-controls.js) all read the same list.
//
// The actions come in layers (the vehicle's, the GTA mode's, a mission's): the layers above are listed after the ones
// below, and a layer that `replace`s hides those under it (a crane's cab, a mission whose own controls are in charge).
// Each layer is removed with the function `layer()` returns. Movement hints that are no action at all (W/S Walk) are
// entries of kind 'hint': they appear in the key bar and nowhere else.
//
// An action:
//   { id, label (text or () => text), kind: 'tap' | 'hold' | 'toggle' | 'hint',
//     keys: ['KeyL'] (the KeyboardEvent codes; keyboard: false lists them in the bar only: a mission's own capture
//     listener handles them), kbd: ['L'] (what the bar shows; derived from keys when left out),
//     icon: 'i-beam' (a symbol of index.html's sprite) or glyph: '↗' (a character), touchLabel or () => touchLabel (a shorter face for
//     the touch button), pad: 'a' | 'b' | 'x' | 'l3' |
//     'left' | 'right' (the gamepad's button), primary: true (the big touch row; the small row otherwise),
//     touch: false (no touch button; or a function saying when), hint: false (not in the bar),
//     when: () => bool (available now), state: () => bool (a toggle's on/off), run(arg) (a tap: the key code or
//     nothing; a hold: true on press, false on release; a toggle: nothing; returns false to say it did nothing, so a
//     key goes on to the next action) }

const KEY_NAMES = { Space: 'Space', Enter: 'Enter', Escape: 'Esc', ShiftLeft: 'Shift', ShiftRight: 'Shift', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab' };
/** What the bar shows for a KeyboardEvent code: 'KeyL' → 'L', 'Digit1' → '1', 'Space' → 'Space' */
export function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  const m = /^(?:Key|Digit|Numpad)(\w)$/.exec(code);
  return m ? m[1] : code;
}

/** The standard gamepad's button indices of the slots an action may name */
export const PAD_SLOTS = { a: 0, b: 1, x: 2, y: 3, l3: 10, up: 12, down: 13, left: 14, right: 15 };

const call = (v) => (typeof v === 'function' ? v() : v);
const typing = (e) => { const t = e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };

export class ActionRegistry {
  constructor() {
    this._layers = [];
    this._listeners = new Set();
    this._labels = new Map(); // id → label override (null: hidden): relabel(), the missions' "Swing", "Lift"
    this._held = new Set();
  }

  /** Adds a layer of actions (bottom to top: by `rank`, then in the order added; the missions' layers rank above the
   *  game's whenever they come); returns what removes it again */
  layer(name, actions, { replace = false, rank = 0 } = {}) {
    const layer = { name, actions: actions.map((a) => ({ kind: 'tap', ...a })), replace, rank };
    let i = this._layers.length;
    while (i > 0 && this._layers[i - 1].rank > rank) i--;
    this._layers.splice(i, 0, layer);
    this.notify();
    return () => {
      const i = this._layers.indexOf(layer);
      if (i < 0) return;
      for (const a of layer.actions) if (this._held.has(a)) this.hold(a, false);
      this._layers.splice(i, 1);
      this.notify();
    };
  }

  /** The actions available now, the lowest layer first; a replacing layer hides those under it */
  list() {
    let start = 0;
    for (let i = this._layers.length - 1; i >= 0; i--) if (call(this._layers[i].replace)) { start = i; break; }
    const out = [];
    for (let i = start; i < this._layers.length; i++) for (const a of this._layers[i].actions) if (!a.when || a.when()) out.push(a);
    return out;
  }

  /** The topmost available action with this id, or null */
  find(id) {
    const list = this.list();
    for (let i = list.length - 1; i >= 0; i--) if (list[i].id === id) return list[i];
    return null;
  }

  /** The action's label now (a mission may have relabelled it) */
  label(action) {
    const o = this._labels.get(action.id);
    return o !== undefined && o !== null ? o : call(action.label) || '';
  }
  /** Another label for the action `id` (the missions: the jump button as "Swing"); null hides it, undefined restores it */
  relabel(id, label) {
    if (label === undefined) this._labels.delete(id); else this._labels.set(id, label);
    this.notify();
  }
  /** Whether relabel() hid the action `id` */
  hidden(id) { return this._labels.get(id) === null; }
  /** relabel()'s label for `id`: a string, null (hidden) or undefined (none) */
  override(id) { return this._labels.get(id); }

  /** What the key bar shows: [{ kbd: ['L'], label, on, action }] in the list's order */
  hints() {
    const out = [];
    for (const a of this.list()) {
      if (a.hint === false || this.hidden(a.id)) continue;
      const kbd = a.kbd ? call(a.kbd) : (a.keys || []).map(keyName);
      if (!kbd.length) continue;
      out.push({ kbd, label: this.label(a), on: a.kind === 'toggle' ? !!a.state?.() : false, action: a });
    }
    return out;
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  notify() { for (const fn of [...this._listeners]) fn(this); }

  /** A tap or a toggle, from a button or a gamepad; `arg`: what run() gets (a key code from the keyboard) */
  press(action, arg = undefined) {
    const a = typeof action === 'string' ? this.find(action) : action;
    if (!a || a.kind === 'hint' || a.kind === 'hold') return false;
    const r = a.run?.(arg);
    this.notify();
    return r !== false;
  }

  /** A hold pressed (on) or let go; nothing happens twice */
  hold(action, on) {
    const a = typeof action === 'string' ? this.find(action) : action;
    if (!a || a.kind !== 'hold') return false;
    if (on === this._held.has(a)) return true;
    if (on) this._held.add(a); else this._held.delete(a);
    a.run?.(on);
    this.notify();
    return true;
  }
  held(action) { return this._held.has(action); }
  /** Every hold let go (the window lost its focus) */
  releaseAll() { for (const a of [...this._held]) this.hold(a, false); }

  /** A keyboard event: the action bound to its code runs; true when one took it */
  key(e, isDown) {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return false;
    const list = this.list();
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (a.kind === 'hint' || a.keyboard === false || !a.keys?.includes(e.code) || this.hidden(a.id)) continue;
      if (a.kind === 'hold') {
        if (isDown && e.repeat) return true;
        this.hold(a, isDown);
        return true;
      }
      if (!isDown || e.repeat) return true;
      if (this.press(a, e.code)) return true;
    }
    return false;
  }
}

/** The keyboard for the register: keydown and keyup on the window (after the missions' capture listeners, which
 *  swallow what is theirs); `blocked()` says when nothing runs (the map or a dialog open) */
export function bindKeyboard(registry, { target = globalThis.window, blocked = () => false } = {}) {
  if (!target?.addEventListener) return;
  const on = (isDown) => (e) => {
    if (blocked()) return;
    if (registry.key(e, isDown)) e.preventDefault();
  };
  target.addEventListener('keydown', on(true));
  target.addEventListener('keyup', on(false));
  target.addEventListener('blur', () => registry.releaseAll());
}

/** The one register of the game */
export const actions = new ActionRegistry();
