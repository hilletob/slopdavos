import { SUPABASE_URL } from './account-config.js';

// js/slf-live.js
// Today's snow on the Weissfluhjoch from the SLF, for the snow profile mission (js/missions-expert.js asks when the mission
// starts; js/missions-data-expert.js snowpackFromSlf builds the pit from it). The SLF's own services are not for direct
// client traffic and the measurement API sends no CORS header, so the game asks its function supabase/functions/slf-snow,
// which keeps the answer for half an hour. A plain GET without a key (no preflight; the function is public), and kept here
// too for the visit: the mission played again asks no second time within the half hour.
//
// Never in the way: null after 10 s, offline, without a backend or for anything but a usable answer, and the mission
// digs its training profile instead.

const TIMEOUT = 10000; // ms (the function gives each SLF source 8 s)
const KEEP = 30 * 60 * 1000; // ms
let kept = null; // { at, promise }

/** The live data (the JSON of supabase/functions/slf-snow/reduce.js reduceSlf) or null */
export function loadSlfSnow({ fetcher = globalThis.fetch, url = SUPABASE_URL && `${SUPABASE_URL}/functions/v1/slf-snow`, now = Date.now(), timeout = TIMEOUT } = {}) {
  if (!url || typeof fetcher !== 'function') return Promise.resolve(null);
  if (kept && now - kept.at < KEEP) return kept.promise;
  const promise = (async () => {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(timeout) });
      if (!response.ok) return null;
      const live = await response.json();
      return live && typeof live === 'object' && live.source === 'SLF' ? live : null;
    } catch { return null; }
  })();
  kept = { at: now, promise };
  // (a failed answer is not kept: the next start asks again)
  promise.then((live) => { if (!live && kept?.promise === promise) kept = null; });
  return promise;
}

/** Forgets the kept answer (tests) */
export function forgetSlfSnow() { kept = null; }
