// js/frame-guard.js
// What keeps a fault from freezing the game without a word. An exception in a frame's update otherwise repeats every frame:
// the page's frame loop goes on, nothing is drawn and the picture stands still. The guard reports it, keeps it for the next
// start (localStorage), and the frame is drawn all the same. A GPU device the browser took away can't come back in the page,
// so the player is saved and the page reloads, once in a while: if it happens again at once, a message offers the reload.
// The DOM and the storage come in as arguments (tests/frame-guard.test.mjs).

export const FRAME_ERROR_KEY = 'slopdavos-frame-error';
export const LOST_KEY = 'slopdavos-gpu-lost-at';
export const SHOW_AFTER = 30; // failed frames in a row before the player is told
export const RELOAD_GAP = 120000; // ms: no second automatic reload within this

const describe = (err) => [err?.message || String(err), ...String(err?.stack || '').split('\n').slice(0, 4).map((l) => l.trim().replace(/https?:\/\/[^/]+\//, ''))]
  .filter((l, i, all) => l && all.indexOf(l) === i).join(' < ').slice(0, 600);

export function createFrameGuard({ storage = null, notify = () => {} } = {}) {
  let inRow = 0, told = false, last = null;
  return {
    get lastError() { return last; },
    get failing() { return inRow; },
    /** Runs one frame: `frame` the whole frame, `draw` the drawing alone, for when the frame failed before it */
    run(frame, draw, now) {
      try {
        frame(now);
        inRow = 0;
      } catch (err) {
        inRow++;
        const text = describe(err);
        if (text !== last) {
          last = text;
          console.error('[frame]', err);
          try { storage?.setItem(FRAME_ERROR_KEY, `${new Date().toISOString().slice(0, 19)} ${text}`); } catch { /* storage may be off */ }
        }
        if (inRow >= SHOW_AFTER && !told) { told = true; notify(text); }
        try { draw(); } catch { /* the same fault in the drawing: the error above says it */ }
      }
    }
  };
}

/** A lost device: `save` and `reload`, or `notify` when the last reload for this reason was just now. Destroying it ourselves isn't a loss */
export function watchDeviceLost(device, { storage = null, save = () => {}, reload = () => {}, notify = () => {}, now = () => Date.now() } = {}) {
  return device?.lost?.then?.((info) => {
    if (info?.reason === 'destroyed') return 'destroyed';
    const text = `GPU device lost: ${info?.reason || ''} ${info?.message || ''}`.trim();
    let before = 0;
    try { before = +storage?.getItem(LOST_KEY) || 0; storage?.setItem(FRAME_ERROR_KEY, `${new Date(now()).toISOString().slice(0, 19)} ${text}`); } catch { /* */ }
    if (now() - before < RELOAD_GAP) { notify(text); return 'notified'; }
    try { storage?.setItem(LOST_KEY, String(now())); } catch { /* */ }
    save();
    reload();
    return 'reloaded';
  });
}

/** The message on screen, with the text to pass on and a reload button */
export function showFault(text, label = 'Neu laden') {
  if (document.getElementById('frame-fault')) return;
  const box = document.createElement('div');
  box.id = 'frame-fault';
  box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:100000;padding:10px 12px;border-radius:10px;background:rgba(120,20,20,.94);color:#fff;font:12px/1.35 ui-monospace,Menlo,monospace;overflow-wrap:anywhere;max-height:40vh;overflow:auto;';
  const message = document.createElement('div');
  message.textContent = text;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = 'margin-top:8px;padding:8px 14px;border:0;border-radius:8px;background:#fff;color:#111;font:600 14px system-ui,sans-serif;';
  button.addEventListener('click', () => window.location.reload());
  box.append(message, button);
  document.body.append(box);
}
