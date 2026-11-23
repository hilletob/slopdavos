import { heatGroup } from './heat-trail.js';
import { KEYS } from './storage-keys.js';

// js/live-beacon.js
// The player as a dot on the public live map (heatmap.html): every few seconds the place and the group of the way of
// travel go out as a broadcast on the Realtime channel LIVE_TOPIC. No name and no account: the id is a random one of
// this page load. Nothing is stored, a dot is gone a few seconds after its last message. A plain request to Realtime's
// broadcast endpoint, so the game loads no SDK and holds no socket for it; the backend's address (js/account-config.js)
// comes with the first message, not with the start (a guest's start stays as it was). Switched off in the menu ("Live
// map"), kept in LIVE_KEY.

export const LIVE_TOPIC = 'live:davos';
export const LIVE_EVENT = 'pos';
export const LIVE_KEY = KEYS.live;
const MOVING_EVERY = 2000; // ms
const STANDING_EVERY = 6000; // ms
const MOVED = 2; // m since the last message: under way

export const liveEnabled = (storage = localStorage) => {
  try { return storage.getItem(LIVE_KEY) !== 'off'; } catch { return true; }
};
export const setLiveEnabled = (on, storage = localStorage) => {
  try { if (on) storage.removeItem(LIVE_KEY); else storage.setItem(LIVE_KEY, 'off'); } catch { /* (not kept then) */ }
};

const newId = () => {
  const bytes = new Uint8Array(6);
  globalThis.crypto?.getRandomValues?.(bytes);
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
};

export function createLiveBeacon({ storage = localStorage, now = Date.now, request = globalThis.fetch?.bind(globalThis), target = globalThis, url = null, key = null } = {}) {
  const id = newId();
  let sentAt = -Infinity, sent = null, shown = false;
  const hidden = () => !!target.document?.hidden;

  let backend = url && key ? { url, key } : null, loading = null;
  const send = (payload, keepalive = false) => {
    if (!request) return;
    if (!backend) { // (the first message waits for the address; the ones meanwhile are dropped)
      loading ??= import('./account-config.js').then((c) => { backend = { url: c.SUPABASE_URL, key: c.SUPABASE_KEY }; send(payload, keepalive); }, () => {});
      return;
    }
    if (!backend.url || !backend.key) return;
    try {
      Promise.resolve(request(`${backend.url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        keepalive,
        headers: { apikey: backend.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic: LIVE_TOPIC, event: LIVE_EVENT, payload }] })
      })).catch(() => {});
    } catch { /* (a lost message is replaced by the next one) */ }
  };
  /** The dot off the map at once (the page goes, or the player switched it off) */
  const leave = () => {
    if (!shown) return;
    shown = false;
    sent = null;
    send({ id, off: 1 }, true);
  };
  target.addEventListener?.('pagehide', leave);
  target.document?.addEventListener?.('visibilitychange', () => { if (hidden()) leave(); });

  return {
    id,
    /** Every frame: `kind` the way of travel (travelKind()), `position` the player's { x, z } */
    tick(kind, position) {
      if (!position || hidden()) return;
      if (!liveEnabled(storage)) { leave(); return; }
      const t = now();
      const moved = !sent || Math.hypot(position.x - sent.x, position.z - sent.z) > MOVED;
      if (t - sentAt < (moved ? MOVING_EVERY : STANDING_EVERY)) return;
      sentAt = t;
      sent = { x: position.x, z: position.z };
      shown = true;
      send({ id, x: Math.round(position.x), z: Math.round(position.z), k: heatGroup(kind) });
    },
    leave
  };
}
