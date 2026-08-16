/* VISION 61 CRM — Groq AI Gateway (Cloudflare Worker)
   Server-side AI assistance for the static GitHub Pages frontend.

   Security model:
   - GROQ_API_KEY and V61_SHARED_SECRET are read ONLY from env (Worker secrets).
     Neither is ever returned to the browser, written to logs, or embedded in a
     response. The browser only ever receives a short-lived, origin-bound
     session token issued by /v1/session.
   - Every request must come from the approved origin (ALLOWED_ORIGIN, default
     https://chrisxie12.github.io). Non-matching Origins are rejected with 403
     and CORS is pinned to that origin (never echoed).
   - Every status check and AI request must present a valid
     `Authorization: Bearer <token>` session token. Tokens are HMAC-SHA256
     signed with V61_SHARED_SECRET, expire after 15 minutes, and are bound to
     the request origin — so a captured token cannot be replayed after expiry
     or from another origin. V61_SHARED_SECRET itself never leaves the Worker.
   - Request validation: method, content-type, body size, shape.
   - Errors are structured JSON; provider errors / stack traces are never
     forwarded to the client.

   Endpoints:
     POST /v1/session           → { ok, token, expiresAt, provider, model }
     GET  /v1/status            → { configured, provider, model }   (auth)
     POST /v1/analyze           → { ok, content }   (auth)
     POST /v1/outreach          → { ok, content }   (auth, context.channel)
     POST /v1/followup          → { ok, content }   (auth)
     POST /v1/explain           → { ok, content }   (auth)
     POST /v1/extract           → { ok, fields }    (auth, context.url)

   /v1/extract fetches the business's real website SERVER-SIDE (no browser
   CORS limits), strips it to readable text, and hands that text to Groq for
   strict extraction. Only http(s) URLs are allowed; the fetch has a hard
   timeout, a size cap, and never follows internal/loopback hosts. The page
   text is the ONLY input the model sees — it may not invent facts that are
   not present on the page.

   The worker only ever POSTs a concise prompt (system + context JSON) to
   Groq. It never receives or stores full CRM state.
*/

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const DEFAULT_ALLOWED_ORIGIN = "https://chrisxie12.github.io";
const SESSION_TTL_MS = 15 * 60 * 1000;   // 15 minutes
const TOKEN_VERSION = 1;
const MAX_BODY_BYTES = 16 * 1024;        // 16 KB request cap
const MAX_OUTPUT_TOKENS = 600;           // cost control for free tier
const VALID_KINDS = new Set(["analyze", "outreach", "followup", "explain", "extract"]);
const VALID_CHANNELS = new Set(["WhatsApp", "Email", "Instagram", "LinkedIn"]);
/* /v1/extract resource guards — keep the outbound fetch bounded and safe. */
const EXTRACT_TIMEOUT_MS = 10000;        // hard fetch timeout
const MAX_EXTRACT_BYTES = 250 * 1024;    // cap on downloaded page bytes
const MAX_EXTRACT_TEXT = 6000;           // chars of cleaned text sent to Groq
const MAX_EXTRACT_TOKENS = 900;          // room for a structured JSON answer

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
  extract: `You are a careful data-extraction assistant for a sales CRM.
You are given the business name, its website URL, and the REAL text content of that website page (plus the page title).
Extract ONLY facts that literally appear in the provided text. NEVER invent, infer, guess, or assume anything — if a detail is not present in the text, leave that field empty ("" or []). Do not make up phone numbers, emails, hours, prices, or links.
Return STRICT JSON only — no markdown, no code fences, no commentary — with EXACTLY these keys:
{"services":[""],"products":[""],"hours":"","phone":"","email":"","whatsapp":"","instagram":"","facebook":"","tiktok":"","booking":false,"ordering":false,"address":"","description":"","menu":[{"name":"","price":""}]}
Rules:
- services / products: short phrases copied from the text describing what the business offers.
- hours: exactly as written in the text (e.g. "Mon-Fri 8am-5pm"). Empty if none.
- phone / email / whatsapp: exact contact values present in the text. whatsapp only if an actual WhatsApp / wa.me link or number is present.
- instagram / facebook / tiktok: full profile URLs only when a link to that platform appears in the text.
- booking: true ONLY if the text mentions booking, appointment, reservation, or a book-now action.
- ordering: true ONLY if the text mentions ordering, delivery, or order-online.
- address: only if the physical address appears in the text.
- description: one or two concise sentences summarizing the business, using only facts from the text.
- menu: item names (with price if stated) when the page shows a menu or price list. Empty array if none.
If the provided text is empty or is an error/placeholder page, return {"error":"no_text"}.`,
};

/* ── Origin / CORS ── */
function allowedOrigin(env) {
  return (env.ALLOWED_ORIGIN && String(env.ALLOWED_ORIGIN).trim()) || DEFAULT_ALLOWED_ORIGIN;
}

function corsHeaders(allowed) {
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Credentials": "false",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, status, allowed) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(allowed)),
  });
}

function badRequest(message, allowed) {
  return json({ ok: false, error: "invalid_request", message }, 400, allowed);
}

/* ── base64url helpers (payloads are ASCII JSON) ── */
function b64urlEncode(str) {
  const b = typeof btoa === "function" ? btoa(str) : Buffer.from(str, "utf8").toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("utf8");
}

/* HMAC-SHA256 (hex) via WebCrypto. */
async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Stateless short-lived session token: base64url(payload) + "." + hex(HMAC). */
async function mintToken(secret, origin) {
  const iat = Date.now();
  const exp = iat + SESSION_TTL_MS;
  const payload = b64urlEncode(JSON.stringify({ v: TOKEN_VERSION, iat, exp, origin }));
  const sig = await hmacHex(secret, payload);
  return { token: payload + "." + sig, expiresAt: exp };
}

async function verifyToken(secret, token, origin) {
  if (!token || typeof token !== "string") return { error: "missing_token" };
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { error: "malformed_token" };
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected;
  try { expected = await hmacHex(secret || "", payloadB64); } catch (e) { return { error: "invalid_signature" }; }
  if (!timingSafeEqual(sig, expected)) return { error: "invalid_signature" };
  let payload = null;
  try { payload = JSON.parse(b64urlDecode(payloadB64)); } catch (e) { return { error: "malformed_token" }; }
  if (!payload || payload.v !== TOKEN_VERSION) return { error: "unsupported_token" };
  if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return { error: "expired_token" };
  if (typeof payload.origin !== "string" || payload.origin !== origin) return { error: "origin_mismatch" };
  return { ok: true, payload };
}

/* Require a valid Bearer session token bound to the request origin. */
async function authenticate(request, env, origin, allowed) {
  const header = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/.exec(header);
  if (!m) {
    return { ok: false, res: json({ ok: false, error: "unauthorized", code: "missing_token", message: "A session token is required. Deterministic outreach tools remain available." }, 401, allowed) };
  }
  const verdict = await verifyToken(env.V61_SHARED_SECRET, m[1], origin);
  if (!verdict.ok) {
    return { ok: false, res: json({ ok: false, error: "unauthorized", code: verdict.error, message: "Session token invalid or expired. Deterministic outreach tools remain available." }, 401, allowed) };
  }
  return { ok: true };
}

/* Try to read a JSON body with size + parse guards. */
async function readJson(request, allowed) {
  const raw = await request.arrayBuffer();
  if (!raw || raw.byteLength > MAX_BODY_BYTES) {
    return { error: badRequest("Request body too large.", allowed) };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    return { error: badRequest("Malformed JSON body.", allowed) };
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

/* ── /v1/extract helpers ───────────────────────────────────────────────── */

/* Never fetch internal / loopback hosts (cheap SSRF guard for a personal,
   origin-authenticated gateway). */
function isBlockedHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const p = h.split(".").map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) ||
        (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 169 && p[1] === 254)) return true;
  }
  return false;
}

/* Read a Response body up to a byte cap (truncates rather than fails on huge
   pages — we only need the beginning of the HTML). */
async function readBoundedText(res, cap) {
  const reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
  if (!reader) {
    const t = await res.text().catch(() => "");
    return t.slice(0, cap);
  }
  const decoder = new TextDecoder();
  let text = "";
  while (text.length < cap) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value || new Uint8Array(0), { stream: true });
  }
  if (typeof reader.cancel === "function") reader.cancel().catch(() => {});
  return text.slice(0, cap);
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/* Strip scripts/styles/markup from an HTML page and collapse it to readable
   text. Returns { title, text }. Plain-text payloads pass through. */
function cleanHtmlText(raw, ctype) {
  let s = String(raw || "");
  const htmlish = !ctype || /html|xhtml/.test(ctype) || /\<\/?[a-z][^>]*>/i.test(s);
  if (!htmlish) return { title: "", text: s.replace(/\s+/g, " ").trim() };
  let title = "";
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(s);
  if (t) title = stripTags(t[1]);
  const meta = /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["']/i.exec(s);
  const desc = meta ? stripTags(meta[1]) : "";
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/");
  s = s.replace(/\s+/g, " ").trim();
  return { title, text: (title ? title + ". " : "") + (desc ? desc + " " : "") + s };
}

/* Robustly pull a JSON object out of an LLM response (tolerates stray
   prose / fences). Returns null when nothing parseable is present. */
function extractJson(content) {
  if (typeof content !== "string") return null;
  let c = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
  const start = c.indexOf("{");
  const end = c.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(c.slice(start, end + 1)); } catch (e) { return null; }
}

/* The /v1/extract flow: fetch the real page, clean it, then extract facts
   from the text via Groq. Never lets the model see anything but the page. */
async function handleExtract(ctx, env, allowed, model) {
  const rawUrl = typeof ctx.url === "string" ? ctx.url.trim() : "";
  if (!rawUrl) return badRequest("A website URL is required.", allowed);
  let target;
  try { target = new URL(rawUrl); } catch (e) { return badRequest("Invalid website URL.", allowed); }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return badRequest("Only http/https website URLs are supported.", allowed);
  }
  if (isBlockedHost(target.hostname)) {
    return badRequest("This website address is not allowed.", allowed);
  }

  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), EXTRACT_TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(target.toString(), {
      redirect: "follow",
      signal: ctrl ? ctrl.signal : undefined,
      headers: { "User-Agent": "Vision61CRM/1.0 (+https://chrisxie12.github.io/outreach-tracker/crm/)" },
    });
  } catch (e) {
    if (timer) clearTimeout(timer);
    return json({ ok: false, error: "fetch_failed", message: "Could not reach the website — it may be down or blocking automated requests." }, 502, allowed);
  }
  if (timer) clearTimeout(timer);

  if (!res.ok) {
    return json({ ok: false, error: "fetch_failed", message: "The website did not respond (HTTP " + res.status + ")." }, 502, allowed);
  }
  const ctype = (res.headers.get("Content-Type") || "").toLowerCase();
  const page = await readBoundedText(res, MAX_EXTRACT_BYTES);
  const cleaned = cleanHtmlText(page, ctype);
  if (!cleaned.text || cleaned.text.length < 30) {
    return json({ ok: false, error: "no_content", message: "No readable content found — this site may be a JavaScript app that a plain reader cannot parse." }, 422, allowed);
  }

  const user = JSON.stringify({ business: ctx.business, url: target.toString(), title: cleaned.title || "", pageText: cleaned.text.slice(0, MAX_EXTRACT_TEXT) });
  const groqPayload = {
    model,
    messages: [
      { role: "system", content: PROMPTS.extract },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: MAX_EXTRACT_TOKENS,
  };

  let gres;
  try {
    gres = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.GROQ_API_KEY },
      body: JSON.stringify(groqPayload),
    });
  } catch (e) {
    return json({ ok: false, error: "upstream_unreachable", message: "AI is temporarily unavailable. Deterministic tools remain available." }, 502, allowed);
  }

  if (gres.status === 401 || gres.status === 403) {
    return json({ ok: false, error: "auth_failed", message: "AI provider rejected the gateway credentials. Deterministic tools remain available." }, 502, allowed);
  }
  if (gres.status === 429) {
    return json({ ok: false, error: "rate_limited", message: "AI is rate-limited right now. Deterministic tools remain available." }, 429, allowed);
  }
  if (gres.status >= 500) {
    return json({ ok: false, error: "provider_error", message: "AI provider is having issues. Deterministic tools remain available." }, 502, allowed);
  }

  let gdata = null;
  try { gdata = await gres.json(); } catch (e) {
    return json({ ok: false, error: "malformed_response", message: "AI returned an unreadable response. Deterministic tools remain available." }, 502, allowed);
  }
  const content = gdata && gdata.choices && gdata.choices[0] && gdata.choices[0].message && gdata.choices[0].message.content;
  if (!content || typeof content !== "string") {
    return json({ ok: false, error: "empty_response", message: "AI returned an empty response. Deterministic tools remain available." }, 502, allowed);
  }

  const fields = extractJson(content);
  return json({ ok: true, kind: "extract", source: "detected", url: target.toString(), title: cleaned.title || "", content, fields, model }, 200, allowed);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = allowedOrigin(env);

    if (request.method === "OPTIONS") {
      const origin = (request.headers.get("Origin") || "").trim();
      if (origin && origin !== allowed) {
        return json({ ok: false, error: "forbidden_origin", message: "Origin not permitted." }, 403, allowed);
      }
      return new Response(null, { status: 204, headers: corsHeaders(allowed) });
    }

    /* Mint a short-lived, origin-bound session token for the browser. */
    if (url.pathname === "/v1/session") {
      if (request.method !== "POST") return badRequest("Method not allowed.", allowed);
      const { parsed, error } = await readJson(request, allowed);
      if (error) return error;
      const origin = (request.headers.get("Origin") || (parsed && parsed.origin) || "").trim();
      if (origin !== allowed) {
        return json({ ok: false, error: "forbidden_origin", message: "Origin not permitted." }, 403, allowed);
      }
      if (!env.V61_SHARED_SECRET || !env.V61_SHARED_SECRET.trim()) {
        return json({ ok: false, error: "not_configured", message: "AI gateway is not configured. Deterministic outreach tools remain available." }, 503, allowed);
      }
      const { token, expiresAt } = await mintToken(env.V61_SHARED_SECRET, origin);
      return json({ ok: true, token, expiresAt, provider: "groq", model: env.GROQ_MODEL || DEFAULT_MODEL }, 200, allowed);
    }

    /* Everything else must come from a browser Origin that matches the approved site. */
    const origin = (request.headers.get("Origin") || "").trim();
    if (origin !== allowed) {
      return json({ ok: false, error: "forbidden_origin", message: "Requests must come from the approved CRM origin." }, 403, allowed);
    }

    if (request.method === "GET" && url.pathname === "/v1/status") {
      const auth = await authenticate(request, env, origin, allowed);
      if (!auth.ok) return auth.res;
      const configured = !!(env.GROQ_API_KEY && env.GROQ_API_KEY.trim());
      return json({ configured, provider: "groq", model: env.GROQ_MODEL || DEFAULT_MODEL }, 200, allowed);
    }

    if (request.method !== "POST") return badRequest("Method not allowed.", allowed);
    const parts = url.pathname.split("/").filter(Boolean); // e.g. ["v1","analyze"]
    const kind = parts[1];
    if (parts.length !== 2 || parts[0] !== "v1" || !VALID_KINDS.has(kind)) {
      return json({ ok: false, error: "not_found", message: "Unknown endpoint." }, 404, allowed);
    }

    const auth = await authenticate(request, env, origin, allowed);
    if (!auth.ok) return auth.res;

    if (!env.GROQ_API_KEY || !env.GROQ_API_KEY.trim()) {
      return json({ ok: false, error: "not_configured", message: "AI gateway is not configured. Deterministic outreach tools remain available." }, 503, allowed);
    }

    const ctype = (request.headers.get("Content-Type") || "").toLowerCase();
    if (!ctype.includes("application/json")) return badRequest("Content-Type must be application/json.", allowed);

    const { parsed, error } = await readJson(request, allowed);
    if (error) return error;

    const ctx = parsed.context;
    const validationErr = validateContext(kind, ctx);
    if (validationErr) return badRequest(validationErr, allowed);
    if (kind === "outreach" && ctx.channel && !VALID_CHANNELS.has(ctx.channel)) {
      return badRequest("Unsupported outreach channel.", allowed);
    }
    if (kind === "extract") {
      return handleExtract(ctx, env, allowed, env.GROQ_MODEL || DEFAULT_MODEL);
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
      return json({ ok: false, error: "upstream_unreachable", message: "AI is temporarily unavailable. Deterministic outreach tools remain available." }, 502, allowed);
    }

    if (res.status === 401 || res.status === 403) {
      return json({ ok: false, error: "auth_failed", message: "AI provider rejected the gateway credentials. Deterministic tools remain available." }, 502, allowed);
    }
    if (res.status === 429) {
      return json({ ok: false, error: "rate_limited", message: "AI is rate-limited right now. Deterministic outreach tools remain available." }, 429, allowed);
    }
    if (res.status >= 500) {
      return json({ ok: false, error: "provider_error", message: "AI provider is having issues. Deterministic outreach tools remain available." }, 502, allowed);
    }

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      return json({ ok: false, error: "malformed_response", message: "AI returned an unreadable response. Deterministic tools remain available." }, 502, allowed);
    }

    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content || typeof content !== "string") {
      return json({ ok: false, error: "empty_response", message: "AI returned an empty response. Deterministic tools remain available." }, 502, allowed);
    }

    return json({ ok: true, content, model }, 200, allowed);
  },
};
