import { setLocalizedText } from './i18n.js';
import { FIGURES, applyFigure, chosenFigure, rememberFigure } from './player-figure.js';

// js/hud-dialogs.js
// The menus and dialogs of the toolbar that need nothing of the game but the player (js/main.js sets them up once):
// the popovers placed against their controls, the figure and character dialog, the data & credits dialog, and the
// focus taken off a clicked HUD button.

/** A click on a modal dialog's backdrop (outside its box) closes it */
function closeOnBackdrop(dialog) {
  dialog?.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
}

/** The popovers; gives back closePopovers() */
export function setupPopovers() {
  // Popovers (native [popover]: light dismiss & Esc for free) open against the control that toggles them: data-anchor
  // names the element they sit above / below, data-align the one whose right edge they line up with
  const popovers = document.querySelectorAll('.popover[popover]');
  const supportsPopover = typeof HTMLElement.prototype.togglePopover === 'function';
  const closePopovers = () => {
    if (!supportsPopover) return;
    popovers.forEach((pop) => {
      if (pop.matches(':popover-open')) pop.hidePopover();
    });
  };
  popovers.forEach((pop) => {
    const invoker = document.querySelector(`[popovertarget="${pop.id}"]`);
    pop.addEventListener('beforetoggle', (e) => {
      const open = e.newState === 'open';
      if (invoker) invoker.classList.toggle('is-open', open);
      if (!open) return;
      const anchor = document.getElementById(pop.dataset.anchor) || invoker;
      const align = document.getElementById(pop.dataset.align) || invoker;
      if (!anchor || !align) return;
      const r = anchor.getBoundingClientRect();
      const spaceAbove = Math.max(0, r.top - 20);
      const spaceBelow = Math.max(0, window.innerHeight - r.bottom - 20);
      let above = pop.dataset.side === 'above';
      // The camera control moves to the top on touch screens; open toward the available space.
      if ((above ? spaceAbove : spaceBelow) < 160) above = spaceAbove > spaceBelow;
      pop.style.right = `${Math.max(8, window.innerWidth - align.getBoundingClientRect().right)}px`;
      if (above) {
        pop.style.top = 'auto';
        pop.style.bottom = `${window.innerHeight - r.top + 8}px`;
        pop.style.maxHeight = `${spaceAbove}px`;
      } else {
        pop.style.bottom = 'auto';
        pop.style.top = `${r.bottom + 8}px`;
        pop.style.maxHeight = `${spaceBelow}px`;
      }
    });
  });
  return closePopovers;
}

/** The figure dialog (a choice of six, kept in this browser) and the character in the player's own words */
export function setupFigureMenu({ controllerManager, closePopovers }) {
  // The player's figure (js/player-figure.js): a choice of six in the menu, kept in this browser
  const figureDialog = document.getElementById('figure-dialog');
  const figureGrid = document.getElementById('figure-grid');
  const figureState = document.getElementById('figure-state');
  const showFigure = (id) => {
    const figure = FIGURES.find((f) => f.id === id);
    if (figureState) setLocalizedText(figureState, figure?.label || '');
    figureGrid?.querySelectorAll('.figure-option').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.figure === id)));
  };
  for (const figure of FIGURES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'figure-option';
    button.dataset.figure = figure.id;
    button.setAttribute('role', 'radio');
    const img = document.createElement('img');
    img.src = `./assets/figures/${figure.id}.webp`;
    img.alt = '';
    img.loading = 'lazy';
    const label = document.createElement('span');
    setLocalizedText(label, figure.label);
    button.append(img, label);
    button.addEventListener('click', () => {
      rememberFigure(figure.id);
      showFigure(figure.id);
      window.dispatchEvent(new CustomEvent('slopdavos:save-now')); // (signed in: into the cloud save now, js/account-ui.js)
      controllerManager.figure = applyFigure(controllerManager, figure.id).catch((e) => console.warn('[player-figure]', e));
      figureDialog.close();
    });
    figureGrid?.append(button);
  }
  showFigure(chosenFigure());
  // The player's character in their own words (js/player-character.js, loaded with the dialog): kept as it is typed
  const characterField = document.getElementById('figure-character');
  const characterState = document.getElementById('figure-character-state');
  let characterStore = null;
  const loadCharacter = () => (characterStore ||= import('./player-character.js').then((c) => { characterField.value = c.readCharacter(); return c; }));
  characterField?.addEventListener('input', () => { if (characterState) setLocalizedText(characterState, ''); });
  characterField?.addEventListener('change', () => loadCharacter().then((c) => {
    characterField.value = c.rememberCharacter(characterField.value);
    if (characterState) setLocalizedText(characterState, 'Saved.');
    window.dispatchEvent(new CustomEvent('slopdavos:save-now')); // (signed in: into the cloud save now)
  }).catch(() => {}));
  characterField?.addEventListener('keydown', (e) => e.stopPropagation()); // (typing here drives nothing in the game)
  document.getElementById('btn-figure-menu')?.addEventListener('click', () => { closePopovers(); if (characterField) loadCharacter().catch(() => {}); figureDialog.showModal(); });
  closeOnBackdrop(figureDialog);
}

/** Data & credits */
export function setupCredits({ closePopovers }) {
  // Data & credits: a native modal <dialog> (Esc and the × close it; so does a click on the backdrop), opened from the
  // attribution line at the bottom and from the menu
  const creditsDialog = document.getElementById('credits-dialog');
  document.getElementById('btn-credits')?.addEventListener('click', () => creditsDialog.showModal());
  document.getElementById('btn-credits-menu')?.addEventListener('click', () => { closePopovers(); creditsDialog.showModal(); });
  closeOnBackdrop(creditsDialog);
}

/** A mouse click mustn't leave the focus on a HUD button, or Space (jump / ascend) and Enter would press it again */
export function blurClickedButtons() {
  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (btn && e.detail > 0) btn.blur();
  });
}
