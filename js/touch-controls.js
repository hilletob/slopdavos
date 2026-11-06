// Touch input stays separate from the keyboard, so releasing a finger never releases a held key.
//
// The stick sits under the right thumb; the buttons under the left one, in two rows (index.html #touch-controls):
// the big primary row (getting in, jump / ascend / descend, a mission's Fire or Shovel) and the small extra row of
// icons (the horn, the indicators, the high beam, a groomer's tiller, a crane's hook). Which buttons there are comes
// from the register of actions (js/actions.js): every action with a touch face is drawn here, holds held, taps tapped,
// toggles switched, and the register's labels (a mission's "Swing" for the jump) are followed. The two fixed buttons
// `up` and `down` feed the controllers' inputs straight (an analog hold like the stick); the others call the register.
const DEAD_ZONE = 0.15;
const MAX_RADIUS = 44;
const MODES = ['person', 'car', 'cyclist', 'cargobike', 'helicopter', 'snowcat', 'rhb'];
const FIXED_LABELS = (mode) => ({ up: mode === 'helicopter' ? 'Ascend' : 'Jump', down: 'Descend' });

class TouchControls {
  constructor(controllerManager, { actions = null } = {}) {
    this.controller = controllerManager;
    this.actions = actions;
    this.root = document.getElementById('touch-controls');
    this.stick = document.getElementById('touch-stick');
    this.knob = document.getElementById('touch-stick-knob');
    this.rows = { primary: document.getElementById('touch-primary') || null, extra: document.getElementById('touch-extra') || null };
    this.buttons = this.root ? [...this.root.querySelectorAll('[data-touch-action]')] : [];
    this.buttonPointers = new Map();
    this.dynamic = new Map(); // action id → { button, action, pointer, label?, glyph? } (the register's buttons)
    this.stickPointer = null;
    this.enabled = true;
    this.available = false;
    this.touchSeen = false;
    this.onAvailabilityChange = null;
    this.media = window.matchMedia('(any-pointer: coarse)');

    if (!this.root || !this.stick || !this.knob) return;

    // iOS Safari starts a text selection or the callout on a long press / drag over the page, even with
    // user-select: none; only the form fields keep theirs
    const inField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    document.addEventListener('selectstart', (e) => { if (!inField(e.target)) e.preventDefault(); });
    document.addEventListener('contextmenu', (e) => { if (!inField(e.target) && this.media.matches) e.preventDefault(); });

    this.stick.addEventListener('pointerdown', (event) => {
      if (!this.canInteract() || event.button !== 0 || this.buttonPointers.has(event.pointerId)) return;
      event.preventDefault();
      event.stopPropagation();
      // A new finger on the stick while it counts as held: the old finger's release never came, so the new one takes over
      if (this.stickPointer !== null) this.releaseStick(this.stickPointer);
      const rect = this.stick.getBoundingClientRect();
      this.stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.stickRadius = Math.min(MAX_RADIUS, Math.min(rect.width, rect.height) / 2) || MAX_RADIUS;
      this.stickPointer = event.pointerId;
      this.stick.setPointerCapture(event.pointerId);
      this.stick.classList.add('is-pressed');
      this.moveStick(event);
    });
    this.stick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickPointer) return;
      event.preventDefault();
      event.stopPropagation();
      this.moveStick(event);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.stick.addEventListener(type, (event) => this.releaseStick(event.pointerId));
    }

    for (const button of this.buttons) {
      const action = button.getAttribute('data-touch-action');
      button.addEventListener('pointerdown', (event) => {
        if (!this.canInteract() || button.hidden || event.button !== 0 || this.buttonPointers.has(event.pointerId) || event.pointerId === this.stickPointer) return;
        event.preventDefault();
        event.stopPropagation();
        this.buttonPointers.set(event.pointerId, { button, action });
        button.setPointerCapture(event.pointerId);
        this.updateButton(button, action);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(type, (event) => this.releaseButton(event.pointerId));
      }
    }

    // iOS can lose a pointer's pointerup when a second finger moves the camera at the same time, which left the stick (or a
    // button) held where it was. The touch events still say which fingers are down, so they settle what is held.
    for (const type of ['touchend', 'touchcancel']) {
      document.addEventListener(type, (event) => this.releaseLiftedFingers(event.touches), { capture: true, passive: true });
    }
    this.media.addEventListener('change', () => this.updateAvailability());
    // Hybrid devices can report a fine pointer until their first touch. Capture runs before the control handlers.
    document.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' || this.touchSeen) return;
      this.touchSeen = true;
      this.updateAvailability();
    }, { capture: true, passive: true });
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('resize', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });

    this.actions?.subscribe(() => this.render());
    this.setMode(controllerManager.activeMode || 'car');
    this.updateAvailability();
  }

  canInteract() {
    return this.enabled && this.available && !document.hidden;
  }

  updateAvailability() {
    const available = this.media.matches || this.touchSeen;
    const changed = available !== this.available;
    if (changed) this.reset();
    this.available = available;
    document.body.classList.toggle('touch-enabled', available);
    this.root.hidden = !this.enabled || !available;
    if (changed && typeof this.onAvailabilityChange === 'function') this.onAvailabilityChange(available);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.reset();
    if (this.root) this.root.hidden = !this.enabled || !this.available;
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    this.reset();
    if (!this.root) return;
    this.mode = mode;
    this.render();
  }

  // --- The buttons from the register --------------------------------------------------------------------------------

  /** The fixed buttons' labels and the register's buttons, as things stand now */
  render() {
    if (!this.root) return;
    const A = this.actions;
    const fixed = FIXED_LABELS(this.mode);
    for (const button of this.buttons) {
      const action = button.getAttribute('data-touch-action');
      let label, hidden;
      if (A) {
        // (the fixed buttons are described in the register with `input`: the person's jump, the helicopter's ascend and
        // descend; a mission may relabel one, or show one the mode has not: relabel(id, label))
        const a = A.find(action), o = A.override(action);
        hidden = o === null || (!a && o === undefined);
        label = o ?? (a ? A.label(a) : fixed[action]);
      } else {
        hidden = (action === 'up' && this.mode !== 'person' && this.mode !== 'helicopter') || (action === 'down' && this.mode !== 'helicopter');
        label = fixed[action];
      }
      if (hidden && !button.hidden) this.releaseButtonsOf(button);
      button.hidden = hidden;
      if (button.getAttribute('data-label') !== label) {
        button.setAttribute('data-label', label);
        button.setAttribute('aria-label', label);
        const text = this.root.querySelector(`[data-touch-label="${action}"]`);
        if (text) text.textContent = label;
      }
    }
    if (!A) return;
    const wanted = new Map();
    for (const a of A.list()) {
      if (a.kind === 'hint' || a.input || A.hidden(a.id)) continue;
      const face = typeof a.touch === 'function' ? a.touch() : a.touch !== false;
      if (face) wanted.set(a.id, a);
    }
    for (const [id, entry] of this.dynamic) {
      const a = wanted.get(id);
      if (!a && !entry.keep) { this.dropButton(entry); this.dynamic.delete(id); continue; }
      if (!a) { entry.button.hidden = true; if (entry.pointer !== null) this.releaseDynamic(entry, false); continue; }
      entry.action = a;
    }
    const order = { primary: { before: [], after: [] }, extra: [] };
    for (const [id, a] of wanted) {
      let entry = this.dynamic.get(id);
      if (!entry) { entry = this.makeButton(a); this.dynamic.set(id, entry); }
      entry.action = a;
      const b = entry.button;
      b.hidden = false;
      b.classList.toggle('is-primary', !!a.primary);
      b.classList.toggle('is-extra', !a.primary);
      b.classList.toggle('is-held', a.kind === 'hold' && A.held(a));
      if (a.kind === 'toggle') b.setAttribute('data-on', String(!!a.state?.())); else b.removeAttribute?.('data-on');
      const label = a.touchLabel ?? A.label(a); // (a short face for a long hint: "Hook" for "Hook on / let go")
      if (b.getAttribute('data-label') !== label) {
        b.setAttribute('data-label', label);
        b.setAttribute('aria-label', label);
        entry.text.textContent = label;
      }
      const glyph = entry.glyph ?? a.glyph;
      if (!a.icon && glyph != null && entry.face.textContent !== glyph) entry.face.textContent = glyph;
      if (a.primary) (a.order < 0 ? order.primary.before : order.primary.after).push(b); else order.extra.push(b);
    }
    const rows = this.rows;
    if (rows.primary) {
      const first = this.buttons[0] || null;
      for (const b of order.primary.before) if (b.nextSibling !== first || b.parentNode !== rows.primary) rows.primary.insertBefore(b, first);
      for (const b of order.primary.after) rows.primary.append(b);
    }
    if (rows.extra) for (const b of order.extra) rows.extra.append(b);
    if (rows.extra) rows.extra.hidden = !order.extra.length;
  }

  makeButton(a) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-action ${a.className || ''}`.trim();
    button.setAttribute('data-action', a.id);
    const face = document.createElement('span');
    face.className = 'touch-face';
    face.setAttribute('aria-hidden', 'true');
    if (a.icon) face.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${a.icon}"/></svg>`;
    else face.textContent = a.glyph ?? '•';
    const text = document.createElement('span');
    text.className = 'touch-label';
    button.append(face, text);
    const entry = { button, action: a, pointer: null, face, text, keep: false };
    button.addEventListener('pointerdown', (event) => {
      if (!this.canInteract() || button.hidden || event.button !== 0 || entry.pointer !== null || event.pointerId === this.stickPointer) return;
      event.preventDefault();
      event.stopPropagation();
      entry.pointer = event.pointerId;
      button.setPointerCapture(event.pointerId);
      button.classList.add('is-pressed');
      const k = entry.action.kind;
      if (k === 'hold') this.actions.hold(entry.action, true);
      else if (k === 'toggle') this.actions.press(entry.action);
    });
    button.addEventListener('pointerup', (event) => this.releaseDynamic(entry, true, event.pointerId));
    for (const type of ['pointercancel', 'lostpointercapture']) button.addEventListener(type, (event) => this.releaseDynamic(entry, false, event.pointerId));
    // (a mouse click on a hybrid device, or the keyboard's Enter on the focused button)
    button.addEventListener('click', (event) => { if (event.detail === 0 && !button.hidden && entry.action.kind === 'tap') this.actions.press(entry.action); });
    return entry;
  }

  releaseDynamic(entry, fire, pointerId = entry.pointer) {
    if (entry.pointer === null || pointerId !== entry.pointer) return;
    entry.pointer = null;
    this.releaseCapture(entry.button, pointerId);
    entry.button.classList.remove('is-pressed');
    const a = entry.action;
    if (a.kind === 'hold') this.actions.hold(a, false);
    else if (a.kind === 'tap' && fire && !entry.button.hidden && this.canInteract()) this.actions.press(a);
  }

  dropButton(entry) {
    if (entry.pointer !== null) this.releaseDynamic(entry, false);
    entry.button.remove();
  }

  // A button that acts once per tap, kept by its maker: the GTA mode's "Get in / Get out" (js/gta.js) and the free
  // flight's "Fly / Pack up" (js/paraglide-free.js). It sits first in the primary row, under the left thumb; hidden
  // until shown with setTapButton(button, label, glyph). Returns the button element (null without the register).
  addTapButton({ className = '', label = '', icon = '', onTap = () => {} } = {}) {
    if (!this.actions || !this.rows.primary) return null;
    const id = className || `tap-${this.dynamic.size}`;
    const entry = this.makeButton({ id, kind: 'tap', className, glyph: icon, label });
    entry.keep = true;
    entry.label = null;
    entry.glyph = icon;
    entry.button.hidden = true;
    this.dynamic.set(id, entry);
    this.actions.layer(`touch:${id}`, [{ id, kind: 'tap', primary: true, order: -1, hint: false, label: () => entry.label || label, glyph: icon, when: () => !!entry.label, run: () => onTap() }]);
    return entry.button;
  }

  // Shows the tap button with `label` (and `glyph`), or hides it (label null)
  setTapButton(button, label, glyph = null) {
    const entry = button && this.dynamic.get(button.getAttribute('data-action'));
    if (!entry) return;
    const next = label || null;
    const nextGlyph = glyph != null ? glyph : entry.glyph;
    if (entry.label === next && entry.glyph === nextGlyph) return;
    entry.label = next;
    entry.glyph = nextGlyph;
    this.actions.notify();
  }

  // --- The stick and the fixed buttons -----------------------------------------------------------------------------

  moveStick(event) {
    const dx = event.clientX - this.stickCenter.x;
    const dy = event.clientY - this.stickCenter.y;
    const distance = Math.hypot(dx, dy);
    const reach = Math.min(distance / this.stickRadius, 1);
    const strength = Math.max(0, (reach - DEAD_ZONE) / (1 - DEAD_ZONE));
    const x = distance ? dx / distance : 0;
    const y = distance ? dy / distance : 0;
    this.knob.style.setProperty('--stick-x', `${x * reach * this.stickRadius}px`);
    this.knob.style.setProperty('--stick-y', `${y * reach * this.stickRadius}px`);
    this.controller.setTouchInput('left', Math.max(0, -x * strength));
    this.controller.setTouchInput('right', Math.max(0, x * strength));
    this.controller.setTouchInput('forward', Math.max(0, -y * strength));
    this.controller.setTouchInput('backward', Math.max(0, y * strength));
  }

  releaseCapture(element, pointerId) {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  }

  releaseStick(pointerId) {
    if (pointerId !== this.stickPointer || this.stickPointer === null) return;
    this.stickPointer = null;
    this.releaseCapture(this.stick, pointerId);
    this.stick.classList.remove('is-pressed');
    this.knob.style.setProperty('--stick-x', '0px');
    this.knob.style.setProperty('--stick-y', '0px');
    for (const action of ['forward', 'backward', 'left', 'right']) this.controller.setTouchInput(action, 0);
  }

  updateButton(button, action) {
    const held = [...this.buttonPointers.values()];
    const pressed = held.some((pointer) => pointer.button === button);
    button.classList.toggle('is-pressed', pressed);
    button.setAttribute('aria-pressed', String(pressed));
    this.controller.setTouchInput(action, held.some((pointer) => pointer.action === action) ? 1 : 0);
  }

  releaseButton(pointerId) {
    const pointer = this.buttonPointers.get(pointerId);
    if (!pointer) return;
    this.buttonPointers.delete(pointerId);
    this.releaseCapture(pointer.button, pointerId);
    this.updateButton(pointer.button, pointer.action);
  }

  releaseButtonsOf(button) {
    for (const [pointerId, pointer] of [...this.buttonPointers]) if (pointer.button === button) this.releaseButton(pointerId);
  }

  // Lets go of whatever no finger in `touches` (the touches still down) started on
  releaseLiftedFingers(touches) {
    const heldOn = (element) => { for (let i = 0; i < touches.length; i++) if (element.contains(touches[i].target)) return true; return false; };
    if (this.stickPointer !== null && !heldOn(this.stick)) this.releaseStick(this.stickPointer);
    for (const [pointerId, { button }] of [...this.buttonPointers]) if (!heldOn(button)) this.releaseButton(pointerId);
    for (const entry of this.dynamic.values()) if (entry.pointer !== null && !heldOn(entry.button)) this.releaseDynamic(entry, false);
  }

  reset() {
    this.releaseStick(this.stickPointer);
    for (const pointerId of this.buttonPointers.keys()) this.releaseButton(pointerId);
    for (const button of this.buttons) {
      button.classList.remove('is-pressed');
      button.setAttribute('aria-pressed', 'false');
    }
    for (const entry of this.dynamic.values()) if (entry.pointer !== null) this.releaseDynamic(entry, false);
    this.controller.clearTouchInput();
  }
}

export { TouchControls };
