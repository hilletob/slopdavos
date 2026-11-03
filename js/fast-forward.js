import { fastForwardTarget, seasonAt, dayOf, formatClock } from './game-clock.js';
import { setLocalizedText } from './i18n.js';

// js/fast-forward.js
// Vorspulen: the top bar's menu (next morning, next evening, next season) and the missions' "Wait until then". A short fade
// to black, the clock jumps behind it (with whatever a change of season has to build), and back. Not during a mission,
// whose clock stands still.

const FADE_MS = 240;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export function buildFastForward({ clock, apply, button, popover, closePopovers }) {
  const veil = document.createElement('div');
  veil.id = 'clock-veil';
  veil.className = 'clock-veil';
  veil.hidden = true;
  const line = document.createElement('div');
  line.className = 'clock-veil-line';
  veil.append(line);
  document.body.append(veil);

  let running = false;
  /** Runs `fn` with the screen black (what it builds may take a while); `text` on the black */
  async function behindVeil(fn, text = '') {
    if (running) return false;
    running = true;
    setLocalizedText(line, text);
    veil.hidden = false;
    void veil.offsetWidth; // (the transition starts from the transparent state)
    veil.classList.add('is-on');
    await wait(FADE_MS);
    await nextFrames(); // (the black is on screen before the work holds up the main thread)
    try { fn(); } catch (error) { console.warn('[fast-forward]', error); }
    await nextFrames(); // (... and the frames of the new time are drawn before it lifts)
    veil.classList.remove('is-on');
    await wait(FADE_MS);
    veil.hidden = true;
    running = false;
    return true;
  }

  /** To the time `total`; `done` runs behind the veil, right after the jump */
  function go(total, done = null) {
    if (clock.held) return Promise.resolve(false);
    const target = Math.max(total, clock.total);
    const days = dayOf(target) - dayOf(clock.total);
    return behindVeil(() => {
      clock.jumpTo(target);
      clock.takeJump();
      apply(true);
      done?.();
    }, days > 0 ? `Day ${dayOf(target) + 1} · ${seasonAt(target) === 'winter' ? 'Winter' : 'Summer'} · ${formatClock(target)}` : formatClock(target));
  }

  // The menu: what "next season" means right now, and no fast-forward while a mission holds the clock
  const seasonName = popover?.querySelector('[data-ff-season]');
  const seasonSub = popover?.querySelector('[data-ff-season-sub]');
  popover?.addEventListener('beforetoggle', (e) => {
    if (e.newState !== 'open') return;
    for (const kind of ['morning', 'evening']) {
      const sub = popover.querySelector(`[data-ff="${kind}"] .pop-sub`);
      if (sub) sub.textContent = formatClock(fastForwardTarget(kind, clock.total));
    }
    const target = fastForwardTarget('season', clock.total);
    if (seasonName) setLocalizedText(seasonName, seasonAt(target) === 'winter' ? 'To the winter' : 'To the summer');
    const days = dayOf(target) - dayOf(clock.total);
    if (seasonSub) setLocalizedText(seasonSub, `${days <= 1 ? 'Tomorrow' : `In ${days} days`} · ${formatClock(target)}`);
  });
  popover?.querySelectorAll('[data-ff]').forEach((item) => item.addEventListener('click', () => {
    closePopovers();
    go(fastForwardTarget(item.dataset.ff, clock.total));
  }));

  return {
    go,
    behindVeil,
    get running() { return running; },
    /** The button goes grey while a mission holds the clock (a few times a second is plenty) */
    update() {
      if (button && button.disabled !== clock.held) button.disabled = clock.held;
    }
  };
}
