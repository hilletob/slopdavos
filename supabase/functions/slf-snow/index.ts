// supabase/functions/slf-snow/index.ts
// Today's snow on the Weissfluhjoch for the snow profile mission (js/slf-live.js asks, js/missions-data-expert.js
// snowpackFromSlf builds the pit from it): the SLF's station WFJ2, its measuring field 5WJ0 and the avalanche bulletin for
// Davos, boiled down by reduce.js to a few hundred bytes.
//
// Why a function and not the browser: the measurement API sends no CORS header, and the SLF asks that its services, not
// sized for direct client traffic, are not overloaded. So every player's request ends here, and the SLF sees at most one
// round of three requests per half hour and instance: the answer is kept in memory for 30 minutes (one fetch at a time,
// the others wait for it) and goes out with a Cache-Control of what is left of that, so the browser and any cache on the
// way keep it as well. When the SLF is out of reach, the last good answer is served for up to six hours.
//
// Public data, no player behind it: deployed with `supabase functions deploy slf-snow --no-verify-jwt`, and called with a
// plain GET (no key, no preflight). Answers 200 with the JSON of reduceSlf (each part null when its source failed), 503
// when nothing at all came back and nothing is kept. The data are the SLF's under CC BY 4.0: the game links www.slf.ch.

import { FIELD, hasData, reduceSlf, STATION } from "./reduce.js";

const ORIGINS = [/^https:\/\/davos\.tschopp\.cloud$/, /^http:\/\/(localhost|127\.0\.0\.1|[a-z0-9-]+\.localhost)(:\d+)?$/];
const API = "https://measurement-api.slf.ch/public/api";
const SOURCES = {
  records: `${API}/imis/station/${STATION}/measurements?period_in_days=7`, // (the API offers 1, 3 or 7 days: 7 for the week's warmest)
  plot: `${API}/study-plot/station/${FIELD}/measurements?period_in_days=7`,
  caaml: "https://aws.slf.ch/api/bulletin/caaml/en/json",
};
const TTL = 30 * 60 * 1000; // ms an answer is kept
const PARTIAL_TTL = 5 * 60 * 1000; // ms, when a source failed: asked again sooner
const STALE = 6 * 60 * 60 * 1000; // ms the last good answer stands in when the SLF is out of reach
const TIMEOUT = 8000; // ms per source (the browser waits 10 s, js/slf-live.js)

const cors = (request: Request): Record<string, string> => {
  const origin = request.headers.get("origin") || "";
  return {
    ...(ORIGINS.some((o) => o.test(origin)) ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-max-age": "86400",
    vary: "origin",
  };
};

type Kept = { at: number; ttl: number; body: string };
let kept: Kept | null = null;
let pending: Promise<Kept | null> | null = null;

async function load(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`${response.status} ${url}`); }
  return await response.json();
}

async function refresh(): Promise<Kept | null> {
  const names = Object.keys(SOURCES) as (keyof typeof SOURCES)[];
  const settled = await Promise.allSettled(names.map((name) => load(SOURCES[name])));
  const input: Record<string, unknown> = {};
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") input[names[i]] = s.value;
    else console.warn(`slf-snow: ${names[i]}: ${s.reason}`);
  });
  const now = Date.now();
  const live = reduceSlf(input, now);
  if (!hasData(live)) return null;
  const whole = settled.every((s) => s.status === "fulfilled") && live.hs != null && live.bulletin != null;
  return { at: now, ttl: whole ? TTL : PARTIAL_TTL, body: JSON.stringify(live) };
}

async function current(): Promise<Kept | null> {
  if (kept && Date.now() - kept.at < kept.ttl) return kept;
  pending ||= refresh().then((fresh) => {
    if (fresh) kept = fresh;
    return fresh ?? (kept && Date.now() - kept.at < STALE ? kept : null);
  }).catch(() => (kept && Date.now() - kept.at < STALE ? kept : null)).finally(() => { pending = null; });
  return await pending;
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  const headers = { ...cors(request), "content-type": "application/json" };
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "method" }), { status: 405, headers });
  const answer = await current();
  if (!answer) {
    return new Response(JSON.stringify({ error: "slf" }), { status: 503, headers: { ...headers, "cache-control": "public, max-age=120" } });
  }
  const left = Math.max(60, Math.round((answer.at + answer.ttl - Date.now()) / 1000));
  return new Response(answer.body, { status: 200, headers: { ...headers, "cache-control": `public, max-age=${left}, s-maxage=${left}` } });
}

Deno.serve(handle);
