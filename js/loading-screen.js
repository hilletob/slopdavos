import { QUALITY } from './quality.js';
import { KEYS } from './storage-keys.js';
import { msg } from './messages.js';

// js/loading-screen.js
// The loading screen while the town is built (play.html #loading-overlay): its line of what is going on, its bar, the
// notes on the last start that went wrong, and its leaving once the first frame is on screen.

const LOAD_TIME_KEY = KEYS.loadTime;

/**
 * `previous`: the last start's breadcrumbs when it never got to its first frame (js/main.js boot); `gpuLog`: the last
 * start's GPU trouble (js/gpu-diagnostics.js previousGpuLog); `skip`: the systems this start leaves out (?qset=skip:...)
 */
export function createLoadingScreen({ previous = null, gpuLog = null, skip = '' } = {}) {
  const overlay = document.getElementById('loading-overlay');
  const status = document.getElementById('loading-status');
  const track = overlay ? overlay.querySelector('.loader-track') : null;
  const fill = document.getElementById('loading-progress');
  // The loading bar fills by the clock, over the time the last start took on this device (css/style.css is-timed: an
  // animation on the compositor, the main thread paints nothing while it builds the town), and the first frame fills it
  const started = performance.now();
  if (track) {
    let last = NaN;
    try { last = Number(localStorage.getItem(LOAD_TIME_KEY)); } catch { /* (storage off: the default) */ }
    const expected = last >= 3000 && last <= 600000 ? last : (QUALITY.mobile ? 80000 : 45000);
    track.style.setProperty('--load-time', `${Math.round(expected)}ms`);
    track.classList.remove('is-indeterminate');
    track.classList.add('is-timed');
  }
  const say = (text) => { if (status) status.textContent = text; };
  const note = (css, text) => {
    const p = document.createElement('p');
    p.style.cssText = css;
    p.textContent = text;
    (status?.parentElement || overlay).appendChild(p);
    return p;
  };
  say('Getting the city ready…');
  if (overlay) {
    // The last start never got to its first frame: say where it stopped (and what went wrong, if anything was caught)
    if (previous) {
      note('margin-top:12px;font-size:12px;opacity:.75;max-width:90vw;word-break:break-word',
        msg('Previous launch stopped at: {where}', 'Letzter Start abgebrochen bei: {where}',
          { where: previous.stage + (previous.errors?.length ? ` · ${previous.errors.join(' | ')}` : '') })).className = 'loader-crash-note';
      console.warn('[boot] the previous start stopped at', previous);
    }
    // The last start's GPU trouble, also when it came after the first frame: the last shader module made and the first
    // errors
    if (gpuLog?.errors?.length || gpuLog?.lost) {
      const last = gpuLog.last?.at(-1);
      note('margin-top:8px;font-size:11px;opacity:.7;max-width:90vw;word-break:break-word',
        (last
          ? msg('GPU: {errors} · last shader #{shader}', 'GPU: {errors} · letzter Shader #{shader}', { errors: gpuLog.errors.slice(0, 2).join(' | '), shader: `${last.n} ${last.label} ${last.length} B #${last.hash}` })
          : `GPU: ${gpuLog.errors.slice(0, 2).join(' | ')}`)).className = 'loader-crash-note';
      console.warn('[gpu] the previous start:', gpuLog);
    }
    // This start leaves systems out
    if (skip) note('margin-top:8px;font-size:12px;opacity:.8', `skip: ${skip}`);
  }
  return {
    /** The line under the bar (for the shader warm-up, js/shader-warmup.js) */
    status,
    say,
    progress(p) {
      if (!fill) return;
      if (track) track.classList.remove('is-indeterminate', 'is-timed');
      fill.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
    },
    /** The town is on screen: the screen fades out (then lets go of its picture and stops its animations), and how long
     *  this start took is kept: the next one's bar runs by it */
    done() {
      if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => { if (overlay.classList.contains('hidden')) overlay.classList.add('is-gone'); }, 900);
      }
      try { localStorage.setItem(LOAD_TIME_KEY, String(Math.round(performance.now() - started))); } catch { /* (storage off) */ }
    }
  };
}
