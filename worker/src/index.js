/* VISION 61 CRM — Groq AI Gateway (Cloudflare Worker)
   Server-side AI assistance for the static GitHub Pages frontend.

   Security rules:
   - GROQ_API_KEY is read ONLY from env (Workers secret). It is never returned
     to the browser, never written to logs, never embedded in a response.
   - Every request is validated (method, content-type, body size, shape).
   - Errors are returned as structured JSON; raw provider errors / stack
     traces are never forwarded to the client.
   - CORS is restricted to the configured allowed origin.

   Endpoints:
     GET  /v1/status            → { configured, provider, model }
     POST /v1/analyze           → { ok, content }
     POST /v1/outreach          → { ok, content }   (context.channel)
     POST /v1/followup          → { ok, content }
     POST /v1/explain           → { ok, content }

   The worker only ever POSTs a concise prompt (system + context JSON) to
   Groq. It never receives or stores full CRM state.
*/

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const MAX_BODY_BYTES = 16 * 1024;       // 16 KB request cap
const MAX_OUTPUT_TOKENS = 600;          // cost control for free tier
const VALID_KINDS = new Set(["analyze", "outreach", "followup", "explain"]);
const VALID_CHANNELS = new Set(["WhatsApp", "Email", "Instagram", "LinkedIn"]);

const PROMPTS = {
  analyze: `You are an analytical assistant for Vision 61 Studios (a digital marketing agency in Ghana).
Analyze the verified business/audit/opportunity context in JSON below.
Strictly distinguish VERIFIED FACTS from your own INFERENCE/RECOMMENDATION — label each accordingly.
NEVER invent: phone numbers, email addresses, reviews, ratings, services, revenue, employee counts, business history, social accounts, or website features.
Output: (1) Opportunity summary, (2) Strongest opportunities, (3) Recommended approach, (4) Suggested next action.
Keep it concise, professional, and specific to the facts provided.`,
  outreach: `You are a real human outreach specialist at Vision 61 Studios (a digital marketing agency in Ghana).
Write a concise ${"{{CHANNEL}}"} outreach message to the business described in the JSON context below.
Rules:
- Sound like a real person from Vision 61 Studios — warm, plain, credible. No corporate filler.
- Use ONLY facts present in the context. Never invent observations, compliments, business problems, prices, reviews, or contact details.
- If the context has no website, do not claim one exists. If no contact name, do not invent one.
- Keep it short (under 120 words). No more than one or two emojis, ideally none.
- Avoid: "Dear valued customer", "We are a leading...", exaggerated claims, spammy language.
- Do not fabricate a reason for contacting the business.
Output format:
SUBJECT: <subject line if applicable, else "n/a">
MESSAGE:
<message body>
PERSONALIZATION: <one line noting which verified facts were used>`,
  followup: `You are a real human outreach specialist at Vision 61 Studios (a digital marketing agency in Ghana).
Write a concise follow-up message to the business described in the JSON context below.
Rules:
- Only use facts present in the context (previous outreach, response status, notes, audit facts).
- If the context contains NO previous outreach, do NOT pretend there was any — open freshly and politely.
- Keep it short (under 100 words). Professional, human, non-pushy.
- Avoid: "Dear valued customer", corporate filler, exaggerated claims, spammy language, excessive emojis.
Output format:
CHANNEL: <suggested channel>
MESSAGE:
<message body>
PERSONALIZATION: <one line noting which verified facts were used>`,
  explain: `You are an assistant that translates a technical digital audit into clear business language for a business owner in Ghana.
You are given verified audit facts in JSON.
Do NOT invent audit facts and do NOT change any score — scores shown are authoritative.
Output: (1) What is working, (2) What needs attention, (3) Why it matters, (4) Recommended next steps.
Keep it plain, encouraging, and concise.`,
};

function corsHeaders(origin) {
  const allowed = origin && origin.trim().length ? origin.trim() : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(origin)),
  });
}

function badRequest(message, origin) {
  return json({ ok: false, error: "invalid_request", message }, 400, origin);
}

/* Try to read a JSON body with size + parse guards. */
async function readJson(request, origin) {
  const raw = await request.arrayBuffer();
  if (!raw || raw.byteLength > MAX_BODY_BYTES) {
    return { error: badRequest("Request body too large.", origin) };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    return { error: badRequest("Malformed JSON body.", origin) };
  }
  return { parsed };
}

/* Validate the small verified-context object the frontend sends. */
function validateContext(kind, ctx) {
  if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) return "Context must be an object.";
  if (typeof ctx.business !== "object" || ctx.business === null) return "Missing business context.";
  if (!ctx.business.name || typeof ctx.business.name !== "string") return "Missing business name.";
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || env.ALLOWED_ORIGIN || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "GET" && url.pathname === "/v1/status") {
      const configured = !!(env.GROQ_API_KEY && env.GROQ_API_KEY.trim());
      return json({ configured, provider: "groq", model: env.GROQ_MODEL || DEFAULT_MODEL }, 200, origin);
    }

    if (request.method !== "POST") return badRequest("Method not allowed.", origin);
    const parts = url.pathname.split("/").filter(Boolean); // e.g. ["v1","analyze"]
    const kind = parts[1];
    if (parts.length !== 2 || parts[0] !== "v1" || !VALID_KINDS.has(kind)) {
      return json({ ok: false, error: "not_found", message: "Unknown endpoint." }, 404, origin);
    }

    if (!env.GROQ_API_KEY || !env.GROQ_API_KEY.trim()) {
      return json({ ok: false, error: "not_configured", message: "AI gateway is not configured. Deterministic outreach tools remain available." }, 503, origin);
    }

    const ctype = (request.headers.get("Content-Type") || "").toLowerCase();
    if (!ctype.includes("application/json")) return badRequest("Content-Type must be application/json.", origin);

    const { parsed, error } = await readJson(request, origin);
    if (error) return error;

    const ctx = parsed.context;
    const validationErr = validateContext(kind, ctx);
    if (validationErr) return badRequest(validationErr, origin);
    if (kind === "outreach" && ctx.channel && !VALID_CHANNELS.has(ctx.channel)) {
      return badRequest("Unsupported outreach channel.", origin);
    }

    let system = PROMPTS[kind];
    if (kind === "outreach") system = system.replace("{{CHANNEL}}", ctx.channel || "WhatsApp");
    const user = JSON.stringify({ context: ctx });

    const model = env.GROQ_MODEL || DEFAULT_MODEL;
    const groqPayload = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      max_tokens: MAX_OUTPUT_TOKENS,
    };

    let res;
    try {
      res = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + env.GROQ_API_KEY,
        },
        body: JSON.stringify(groqPayload),
      });
    } catch (e) {
      return json({ ok: false, error: "upstream_unreachable", message: "AI is temporarily unavailable. Deterministic outreach tools remain available." }, 502, origin);
    }

    if (res.status === 401 || res.status === 403) {
      return json({ ok: false, error: "auth_failed", message: "AI provider rejected the gateway credentials. Deterministic tools remain available." }, 502, origin);
    }
    if (res.status === 429) {
      return json({ ok: false, error: "rate_limited", message: "AI is rate-limited right now. Deterministic outreach tools remain available." }, 429, origin);
    }
    if (res.status >= 500) {
      return json({ ok: false, error: "provider_error", message: "AI provider is having issues. Deterministic outreach tools remain available." }, 502, origin);
    }

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      return json({ ok: false, error: "malformed_response", message: "AI returned an unreadable response. Deterministic tools remain available." }, 502, origin);
    }

    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content || typeof content !== "string") {
      return json({ ok: false, error: "empty_response", message: "AI returned an empty response. Deterministic tools remain available." }, 502, origin);
    }

    return json({ ok: true, content, model }, 200, origin);
  },
};