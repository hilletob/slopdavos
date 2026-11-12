// supabase/functions/mission-text/index.ts
// A mission's briefing and its closing words, written for one player by Claude (js/personal-text.js) from the mission's
// own text, the player's history, this visit and the notes the writer keeps about them. The one place the Anthropic key
// lives: `supabase secrets set ANTHROPIC_API_KEY=...`, never in the repo or the browser.
//
// A request passes only with a signed-in player's token: it is handed on to ai_take() (supabase/migrations/*_ai_usage.sql),
// where the database checks it, counts the call against the day's allowance and answers what may be told about the
// player. Deployed with `supabase functions deploy mission-text --no-verify-jwt`: the check is the database's, so it holds
// for whatever kind of key the project signs its tokens with.
//
// Answers { text } (200), with an empty text when the model's answer cannot be shown (a refusal, or a text that lost a
// key or a number of the original); 401 without a valid session, 429 { reason } over the allowance, 5xx when the model
// is out of reach. In all those cases the game keeps the mission's own text.

import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { ANSWER_SCHEMA, buildPrompt, cleanRequest, MODEL, readAnswer } from "./prompt.js";

const ORIGINS = [/^https:\/\/davos\.tschopp\.cloud$/, /^http:\/\/(localhost|127\.0\.0\.1|[a-z0-9-]+\.localhost)(:\d+)?$/];
const MODEL_TIMEOUT = 12000; // ms (the browser waits 15 s, js/personal-text.js)

const cors = (request: Request): Record<string, string> => {
  const origin = request.headers.get("origin") || "";
  return {
    ...(ORIGINS.some((o) => o.test(origin)) ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "origin",
  };
};

const anthropic = new Anthropic({ timeout: MODEL_TIMEOUT, maxRetries: 0 }); // (ANTHROPIC_API_KEY from the secrets)

/** A function of the database, called with the player's own token (it is the database that checks it) */
function rpc(request: Request, authorization: string, name: string, args: unknown = {}) {
  const apikey = request.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey, authorization, "content-type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000),
  });
}

/** The day's allowance, the player's facts and the writer's notes about them */
async function take(request: Request, authorization: string) {
  const response = await rpc(request, authorization, "ai_take");
  if (response.status === 401 || response.status === 403) return { status: 401 as const };
  // (ai_take() raises 'not signed in' for a token without a player: PostgREST answers 400 with that message)
  if (!response.ok) return { status: (await response.text()).includes("not signed in") ? 401 as const : 502 as const };
  return { status: 200 as const, save: await response.json() };
}

async function handle(request: Request): Promise<Response> {
  const headers = { ...cors(request), "content-type": "application/json" };
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== "POST") return answer(405, { error: "method" });
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer \S+$/.test(authorization)) return answer(401, { error: "sign-in" });

  let body: unknown = null;
  try { body = JSON.parse((await request.text()).slice(0, 12000)); } catch { /* (refused below) */ }
  const wanted = cleanRequest(body);
  if (!wanted) return answer(400, { error: "request" });

  let taken;
  try { taken = await take(request, authorization); } catch { return answer(502, { error: "database" }); }
  if (taken.status === 401) return answer(401, { error: "sign-in" });
  if (taken.status !== 200) return answer(502, { error: "database" });
  if (!taken.save?.allowed) return answer(429, { error: "allowance", reason: taken.save?.reason || "quota" });

  const prompt = buildPrompt(wanted, taken.save);
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000, // (the model's thinking counts in; the text and the notes are some 700 tokens)
      output_config: { effort: "low", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    // (a refusal or a cut-off answer: nothing fit to show)
    if (message.stop_reason !== "end_turn") return answer(200, { text: "" });
    const raw = message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
    const written = readAnswer(raw, wanted);
    if (written.missing.length) console.warn(`mission-text: ${wanted.mission} ${wanted.moment} ${wanted.lang}: the answer lacks ${written.missing.join(", ")}`);
    // (the notes for the next text: kept even when this text is not shown; a failure costs only the memory)
    if (written.notes !== null && written.notes !== taken.save.notes) {
      await rpc(request, authorization, "ai_note", { new_notes: written.notes }).then((r) => r.body?.cancel()).catch(() => {});
    }
    return answer(200, { text: written.text });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return answer(503, { error: "busy" });
    if (error instanceof Anthropic.AuthenticationError) { console.error("mission-text: the Anthropic key is refused"); return answer(502, { error: "model" }); }
    if (error instanceof Anthropic.APIError) { console.error("mission-text:", error.status, error.message); return answer(502, { error: "model" }); }
    console.error("mission-text:", error);
    return answer(502, { error: "model" });
  }
}

Deno.serve(handle);
