/* QA Phase 6 — AI Assistant (gateway + frontend integration + security)
   Requirements covered:
   - AI is an OPTIONAL enhancement: deterministic outreach must keep working
     with zero AI configuration, and the AI service must fail safe.
   - No secret VALUE (GROQ_API_KEY / V61_SHARED_SECRET / provider endpoint)
     ever reaches the frontend bundle, HTML, or localStorage. The browser only
     ever holds a short-lived, origin-bound session token in memory.
   - Session tokens are issued by POST /v1/session, must be sent as
     `Authorization: Bearer <token>` on /v1/status and AI endpoints, and are
     rejected when missing, tampered, expired, or minted for another origin.
   - Every request must come from the approved origin
     (https://chrisxie12.github.io); anything else is rejected with 403 and
     CORS is pinned (never echoed).
   - Only a small verified context object is sent per request — never the full
     CRM database or unrelated records.
   - AI never runs on page load / navigation and never sends anything
     automatically; output is always a human-reviewed draft.
   The Cloudflare Worker gateway is loaded directly in Node (its `export default`
   is transformed to module.exports) and exercised against a stubbed Groq API. */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { suite, test, assert, eq, ok, isNull, notNull, assertCleanHTML } = require("./framework");
const { freshApp, settle, KEY, ROOT } = require("./harness");

const GW = "https://vision61-gw.test";
const PROD_ORIGIN = "https://chrisxie12.github.io";
const SHARED_SECRET = "test-shared-secret";

function configureAI(app, opts) {
  const S = app.V61.Store;
  S.db.settings.aiConfig = Object.assign({ provider: "groq", enabled: true, gatewayUrl: GW, model: "openai/gpt-oss-20b" }, opts || {});
  S.save();
  return app;
}

function okRes(content, model) {
  return { ok: true, status: 200, json: async () => ({ ok: true, content, model: model || "openai/gpt-oss-20b" }) };
}

/* Frontend fetch stub: routes /v1/session to a token response, everything else
   to `respond`. Mirrors the real gateway flow. */
function sessionRes(token) {
  return { ok: true, status: 200, json: async () => ({ ok: true, token: token || "test-token-abc", expiresAt: Date.now() + 900000 }) };
}
function gwFetch(respond) {
  return async (url, opts) => {
    if (String(url).includes("/v1/session")) return sessionRes();
    if (typeof respond === "function") return respond(url, opts);
    return respond;
  };
}

/* AI must never touch CRM records. Compare only the collections AI could
   theoretically affect (never the whole db — the app's init() re-seeds the
   default services catalog, which is unrelated to AI). */
function snapshotDb(S) {
  return JSON.stringify({
    businesses: S.db.businesses, leads: S.db.leads, outreach: S.db.outreach,
    followups: S.db.followups, invoices: S.db.invoices, payments: S.db.payments,
    proposals: S.db.proposals, activity: S.db.activity,
  });
}

function makeLead(app) {
  const S = app.V61.Store;
  const biz = S.addBusiness({ name: "Ama's Kitchen", phone: "0241111111", category: "Restaurant", city: "Accra" });
  const lead = S.addLead(biz.id, { source: "manual" });
  return S.leadRows().find((r) => r.lead.id === lead.id);
}

/* ────────────────────────── Worker gateway tests ────────────────────────── */
const WORKER_SRC = path.join(ROOT, "worker", "src", "index.js");
let workerCache = null;
function loadWorker() {
  if (workerCache) return workerCache;
  const tmp = path.join(os.tmpdir(), "v61-ai-worker-" + process.pid + ".cjs");
  let src = fs.readFileSync(WORKER_SRC, "utf8");
  src = src.replace(/export\s+default/, "module.exports =");
  src = src.replace(/export\s+class\s+(\w+)/, "class $1");
  fs.writeFileSync(tmp, src);
  workerCache = require(tmp);
  return workerCache;
}
function groqRes(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}
function validCtx(over) {
  return Object.assign({ business: { name: "Ama's Kitchen", category: "Restaurant" }, channel: "WhatsApp" }, over || {});
}

/* Independent re-implementation of the worker's token format so tests mint
   their own tokens: base64url(payload) + "." + hex(HMAC-SHA256(secret, b64)). */
function b64url(str) {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function mintTestToken(secret, origin, over) {
  const payload = b64url(JSON.stringify(Object.assign({ v: 1, iat: Date.now(), exp: Date.now() + 900000, origin }, over || {})));
  return payload + "." + await hmacHex(secret, payload);
}

async function callWorker(kind, opts) {
  opts = opts || {};
  const worker = loadWorker();
  const url = "https://gw.test" + (kind ? "/v1/" + kind : "/v1/status");
  const env = opts.env || {};
  const allowed = (env.ALLOWED_ORIGIN && String(env.ALLOWED_ORIGIN).trim()) || PROD_ORIGIN;
  const headers = { "Content-Type": "application/json" };
  const origin = opts.origin !== undefined ? opts.origin : (opts.noOrigin ? null : allowed);
  if (origin) headers.Origin = origin;
  if (opts.token !== null) {
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    else if (env.V61_SHARED_SECRET && opts.auth !== false) headers.Authorization = "Bearer " + await mintTestToken(env.V61_SHARED_SECRET, origin || allowed, opts.tokenOver);
  }
  let req;
  if (opts.bodyRaw !== undefined) {
    req = new Request(url, { method: "POST", headers, body: opts.bodyRaw });
  } else if (kind === "session") {
    req = new Request(url, { method: "POST", headers, body: JSON.stringify({ origin: (opts.body && opts.body.origin) || origin || allowed }) });
  } else if (kind) {
    req = new Request(url, { method: "POST", headers, body: JSON.stringify({ context: opts.body || validCtx() }) });
  } else {
    req = new Request(url, { method: opts.method || "GET", headers });
  }
  return worker.fetch(req, env);
}
function withGroq(stub, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = stub;
  return Promise.resolve().then(fn).finally(() => { globalThis.fetch = prev; });
}

suite("AI — Cloudflare Worker gateway", () => {
  test("GET /v1/status without a session token returns 401", async () => {
    const res = await callWorker(null, { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }, token: null });
    eq(res.status, 401);
    const d = await res.json();
    eq(d.error, "unauthorized");
    eq(d.code, "missing_token");
  });

  test("GET /v1/status reports not configured when key missing", async () => {
    const res = await callWorker(null, { env: { V61_SHARED_SECRET: SHARED_SECRET } });
    eq(res.status, 200);
    const d = await res.json();
    eq(d.configured, false);
    eq(d.provider, "groq");
    eq(d.model, "openai/gpt-oss-20b");
  });

  test("GET /v1/status reports configured when secret present", async () => {
    const res = await callWorker(null, { env: { GROQ_API_KEY: "sk-gateway-test", V61_SHARED_SECRET: SHARED_SECRET } });
    eq(res.status, 200);
    const d = await res.json();
    eq(d.configured, true);
  });

  test("POST /v1/session issues a short-lived token bound to the origin", async () => {
    const res = await callWorker("session", { env: { V61_SHARED_SECRET: SHARED_SECRET } });
    eq(res.status, 200);
    const d = await res.json();
    eq(d.ok, true);
    ok(typeof d.token === "string" && d.token.indexOf(".") > 0, "token must be payload.signature");
    ok(d.expiresAt > Date.now() + 899000 && d.expiresAt <= Date.now() + 901000, "token must expire ~15 minutes from now");
    eq(d.provider, "groq");
    eq(d.model, "openai/gpt-oss-20b");
  });

  test("POST /v1/session rejects a wrong origin with 403", async () => {
    const res = await callWorker("session", { env: { V61_SHARED_SECRET: SHARED_SECRET }, origin: "https://evil.example", body: { origin: "https://evil.example" } });
    eq(res.status, 403);
    eq((await res.json()).error, "forbidden_origin");
  });

  test("POST /v1/session accepts a body-only origin when no Origin header is sent", async () => {
    const res = await callWorker("session", { env: { V61_SHARED_SECRET: SHARED_SECRET }, noOrigin: true, body: { origin: PROD_ORIGIN } });
    eq(res.status, 200);
    eq((await res.json()).ok, true);
  });

  test("POST /v1/session fails closed when shared secret is missing", async () => {
    const res = await callWorker("session", { env: { GROQ_API_KEY: "sk-x" } });
    eq(res.status, 503);
    eq((await res.json()).error, "not_configured");
  });

  test("AI endpoint rejects a request from a disallowed origin with 403", async () => {
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }, origin: "https://other-site.com" });
    eq(res.status, 403);
    eq((await res.json()).error, "forbidden_origin");
  });

  test("AI endpoint rejects a tampered token", async () => {
    const good = await mintTestToken(SHARED_SECRET, PROD_ORIGIN);
    const bad = good.slice(0, -2) + (good.endsWith("00") ? "ff" : "00");
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }, token: bad });
    eq(res.status, 401);
    eq((await res.json()).code, "invalid_signature");
  });

  test("AI endpoint rejects an expired token", async () => {
    const token = await mintTestToken(SHARED_SECRET, PROD_ORIGIN, { exp: Date.now() - 1000 });
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }, token });
    eq(res.status, 401);
    eq((await res.json()).code, "expired_token");
  });

  test("AI endpoint rejects a token signed for another origin", async () => {
    const token = await mintTestToken(SHARED_SECRET, "https://evil.example");
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }, token });
    eq(res.status, 401);
    eq((await res.json()).code, "origin_mismatch");
  });

  test("AI endpoint rejects a token signed with a different secret", async () => {
    const token = await mintTestToken("wrong-secret", PROD_ORIGIN);
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }, token });
    eq(res.status, 401);
    eq((await res.json()).code, "invalid_signature");
  });

  test("valid token is accepted and reaches the provider", async () => {
    await withGroq(async () => groqRes(429, {}), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET } });
      eq(res.status, 429);
      eq((await res.json()).error, "rate_limited");
    });
  });

  test("OPTIONS preflight for the approved origin returns 204 with pinned CORS", async () => {
    const res = await callWorker(null, { method: "OPTIONS", origin: PROD_ORIGIN });
    eq(res.status, 204);
    eq(res.headers.get("Access-Control-Allow-Origin"), PROD_ORIGIN);
    eq(res.headers.get("Access-Control-Allow-Methods"), "GET, POST, PUT, OPTIONS");
    ok((res.headers.get("Access-Control-Allow-Headers") || "").includes("Authorization"), "CORS must permit the Authorization header");
    ok((res.headers.get("Access-Control-Allow-Headers") || "").includes("Content-Type"), "CORS must permit Content-Type");
  });

  test("OPTIONS from a disallowed origin is rejected with 403", async () => {
    const res = await callWorker(null, { method: "OPTIONS", origin: "https://evil.example" });
    eq(res.status, 403);
  });

  test("POST without server secret returns 503 not_configured", async () => {
    const res = await callWorker("analyze", { env: { V61_SHARED_SECRET: SHARED_SECRET } });
    eq(res.status, 503);
    const d = await res.json();
    eq(d.error, "not_configured");
    ok(/deterministic/i.test(d.message));
  });

  test("malformed JSON body returns 400 invalid_request", async () => {
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }, bodyRaw: "not-json{{" });
    eq(res.status, 400);
    eq((await res.json()).error, "invalid_request");
  });

  test("missing business context returns 400", async () => {
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }, body: {} });
    eq(res.status, 400);
    eq((await res.json()).error, "invalid_request");
  });

  test("unknown endpoint returns 404", async () => {
    const res = await callWorker("bogus", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET } });
    eq(res.status, 404);
    eq((await res.json()).error, "not_found");
  });

  test("unsupported outreach channel returns 400", async () => {
    const res = await callWorker("outreach", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }, body: validCtx({ channel: "SnailMail" }) });
    eq(res.status, 400);
  });

  test("Groq 401 → 502 auth_failed without leaking the key", async () => {
    await withGroq(async () => groqRes(401, {}), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-secret-xyz", V61_SHARED_SECRET: SHARED_SECRET } });
      eq(res.status, 502);
      const d = await res.json();
      eq(d.error, "auth_failed");
      ok(!JSON.stringify(d).includes("sk-secret-xyz"), "secret leaked in response");
    });
  });

  test("Groq 429 → 429 rate_limited", async () => {
    await withGroq(async () => groqRes(429, {}), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET } });
      eq(res.status, 429);
      eq((await res.json()).error, "rate_limited");
    });
  });

  test("Groq 500 → 502 provider_error", async () => {
    await withGroq(async () => groqRes(500, {}), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET } });
      eq(res.status, 502);
      eq((await res.json()).error, "provider_error");
    });
  });

  test("upstream network failure → 502 upstream_unreachable", async () => {
    await withGroq(async () => { throw new TypeError("connect ECONNREFUSED"); }, async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET } });
      eq(res.status, 502);
      eq((await res.json()).error, "upstream_unreachable");
    });
  });

  test("Groq non-JSON body → 502 malformed_response", async () => {
    await withGroq(async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("bad"); } }), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET } });
      eq(res.status, 502);
      eq((await res.json()).error, "malformed_response");
    });
  });

  test("Groq empty content → 502 empty_response", async () => {
    await withGroq(async () => groqRes(200, { choices: [{ message: { content: "" } }] }), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET } });
      eq(res.status, 502);
      eq((await res.json()).error, "empty_response");
    });
  });

  test("successful response returns content + model; key used only server-side", async () => {
    let captured = null;
    await withGroq(async (url, opts) => { captured = { url, opts }; return groqRes(200, { choices: [{ message: { content: "Hello Ama" } }] }); }, async () => {
      const res = await callWorker("outreach", { env: { GROQ_API_KEY: "sk-gateway-key", V61_SHARED_SECRET: SHARED_SECRET }, body: validCtx() });
      eq(res.status, 200);
      const d = await res.json();
      eq(d.ok, true);
      eq(d.content, "Hello Ama");
      eq(d.model, "openai/gpt-oss-20b");
      notNull(captured);
      eq(captured.opts.headers.Authorization, "Bearer sk-gateway-key");
      const payload = JSON.parse(captured.opts.body);
      eq(payload.model, "openai/gpt-oss-20b");
      eq(payload.messages.length, 2);
      ok(payload.messages[0].role === "system" && payload.messages[1].role === "user");
      ok(String(captured.url).includes("chat/completions"), "worker must call the provider endpoint, not the frontend");
    });
  });

  test("GROQ_MODEL overrides the default model", async () => {
    let captured = null;
    await withGroq(async (url, opts) => { captured = opts; return groqRes(200, { choices: [{ message: { content: "ok" } }] }); }, async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET, GROQ_MODEL: "llama-3.1-70b" } });
      const d = await res.json();
      eq(d.model, "llama-3.1-70b");
      eq(JSON.parse(captured.body).model, "llama-3.1-70b");
    });
  });

  test("oversized body rejected with 400", async () => {
    const big = "x".repeat(20 * 1024);
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }, body: { business: { name: big } } });
    eq(res.status, 400);
    eq((await res.json()).error, "invalid_request");
  });
});

/* ────────────────────── Frontend service integration ────────────────────── */
suite("AI — frontend service", () => {
  test("ai.js loads and exposes V61.AI", () => {
    const app = freshApp();
    const A = app.V61.AI;
    notNull(A);
    eq(A.DEFAULT_MODEL, "openai/gpt-oss-20b");
    for (const fn of ["analyzeLead", "generateOutreach", "generateFollowup", "explainAudit", "extractWebsiteInfo", "extractModal", "status", "present"]) {
      ok(typeof A[fn] === "function", "V61.AI." + fn + " missing");
    }
  });

  test("not configured → not_configured result and zero network calls", async () => {
    const app = freshApp();
    let calls = 0;
    app.window.fetch = async () => { calls++; throw new Error("should not fetch"); };
    const res = await app.V61.AI.analyzeLead(makeLead(app));
    eq(res.ok, false);
    eq(res.error, "not_configured");
    ok(/deterministic/.test(res.message));
    eq(calls, 0);
  });

  test("configured gateway → session then authenticated analysis posts only verified context", async () => {
    const app = freshApp();
    configureAI(app);
    const calls = [];
    app.window.fetch = gwFetch((url, opts) => { calls.push({ url, opts }); return okRes("AI summary"); });
    const res = await app.V61.AI.analyzeLead(makeLead(app));
    eq(res.ok, true);
    eq(res.content, "AI summary");
    eq(res.model, "openai/gpt-oss-20b");
    eq(calls.length, 1);
    eq(calls[0].url, GW + "/v1/analyze");
    eq(calls[0].opts.headers.Authorization, "Bearer test-token-abc");
    const ctx = JSON.parse(calls[0].opts.body).context;
    eq(ctx.business.name, "Ama's Kitchen");
    ok(typeof ctx.audit === "object");
  });

  test("session request carries the browser origin; token reused in memory", async () => {
    const app = freshApp();
    configureAI(app);
    const S = app.V61.Store;
    const row = makeLead(app);
    S.save();
    const log = [];
    app.window.fetch = async (url, opts) => {
      log.push({ url: String(url), opts });
      if (String(url).includes("/v1/session")) return sessionRes("mem-token-xyz");
      return okRes("analyzed");
    };
    const res = await app.V61.AI.analyzeLead(row);
    eq(res.ok, true);
    const sessionCall = log.find((c) => c.url.includes("/v1/session"));
    const aiCall = log.find((c) => c.url.includes("/v1/analyze"));
    notNull(sessionCall);
    notNull(aiCall);
    eq(sessionCall.url, GW + "/v1/session");
    eq(JSON.parse(sessionCall.opts.body).origin, "http://localhost");
    eq(aiCall.opts.headers.Authorization, "Bearer mem-token-xyz");
    /* Second call reuses the in-memory token — no second session fetch. */
    log.length = 0;
    await app.V61.AI.generateOutreach(row, { channel: "WhatsApp" });
    eq(log.length, 1, "token must be reused from memory, not re-fetched");
    eq(log[0].url.includes("/v1/outreach"), true);
    eq(log[0].opts.headers.Authorization, "Bearer mem-token-xyz");
  });

  test("only verified facts sent — unrelated CRM data never leaves the client", async () => {
    const app = freshApp();
    configureAI(app);
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Ama's Kitchen", category: "Restaurant", city: "Accra" });
    const lead = S.addLead(biz.id, {});
    const audit = S.emptyAudit(biz.id);
    audit.website = { exists: true, mobile: false, whatsapp: true };
    audit.google = { exists: true, rating: 4.3, reviews: 22 };
    S.db.audits.push(audit);
    const biz2 = S.addBusiness({ name: "Evil Corp", category: "Bank" });
    const lead2 = S.addLead(biz2.id, {});
    S.db.invoices = (S.db.invoices || []).concat([{ businessId: biz2.id, amount: 900000, status: "paid" }]);
    S.db.payments = (S.db.payments || []).concat([{ businessId: biz2.id, amount: 900000 }]);
    S.db.proposals = (S.db.proposals || []).concat([{ leadId: lead2.id, total: 900000 }]);
    S.db.services = (S.db.services || []).concat([{ name: "Website", price: 500, active: true }]);
    S.save();
    const calls = [];
    app.window.fetch = gwFetch((url, opts) => { calls.push({ url, opts }); return okRes("hello"); });
    const row = S.leadRows().find((r) => r.lead.id === lead.id);
    await app.V61.AI.generateOutreach(row, { channel: "WhatsApp" });
    eq(calls.length, 1);
    const body = calls[0].opts.body;
    const ctx = JSON.parse(body).context;
    eq(ctx.channel, "WhatsApp");
    eq(ctx.business.name, "Ama's Kitchen");
    eq(ctx.audit.googleRating, 4.3);
    eq(ctx.audit.googleReviewCount, 22);
    eq(ctx.audit.notMobileFriendly, true);
    ok(!body.includes("Evil Corp"), "unrelated business leaked");
    ok(!body.includes("900000"), "financial data leaked");
    ok(!body.includes("invoices"), "invoices leaked");
    ok(!body.includes("payments"), "payments leaked");
    const allowed = ["business", "contact", "audit", "website", "opportunities", "services", "channel"];
    for (const k of Object.keys(ctx)) ok(allowed.includes(k), "unexpected context key: " + k);
  });

  test("follow-up request includes previous outreach facts and notes", async () => {
    const app = freshApp();
    configureAI(app);
    const S = app.V61.Store;
    const row = makeLead(app);
    S.db.outreach.push({ id: "o1", leadId: row.lead.id, channel: "WhatsApp", message: "First hello", status: "no_response", contactedAt: Date.now() });
    row.lead.notes = "Owner travels a lot in June.";
    S.save();
    const calls = [];
    app.window.fetch = gwFetch((url, opts) => { calls.push({ url, opts }); return okRes("follow-up"); });
    await app.V61.AI.generateFollowup(row.lead.id);
    eq(calls.length, 1);
    eq(calls[0].url, GW + "/v1/followup");
    const ctx = JSON.parse(calls[0].opts.body).context;
    notNull(ctx.previousOutreach);
    eq(ctx.previousOutreach.channel, "WhatsApp");
    eq(ctx.previousOutreach.status, "no_response");
    eq(ctx.notes, "Owner travels a lot in June.");
  });

  test("follow-up without prior outreach sends previousOutreach null", async () => {
    const app = freshApp();
    configureAI(app);
    const row = makeLead(app);
    const calls = [];
    app.window.fetch = gwFetch((url, opts) => { calls.push({ url, opts }); return okRes("f"); });
    await app.V61.AI.generateFollowup(row.lead.id);
    const ctx = JSON.parse(calls[0].opts.body).context;
    isNull(ctx.previousOutreach);
  });

  test("V61_AI_GATEWAY_URL fallback is used when settings have no URL", async () => {
    const app = freshApp();
    app.window.V61_AI_GATEWAY_URL = "https://fallback-gw.test";
    configureAI(app, { gatewayUrl: "" });
    let called = "";
    app.window.fetch = gwFetch((url) => { called = String(url); return okRes("m"); });
    await app.V61.AI.analyzeLead(makeLead(app));
    eq(called, "https://fallback-gw.test/v1/analyze");
  });

  test("AI draft modal opens: AI Draft badge, readonly textarea, no send button", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = gwFetch(() => okRes("Draft message body"));
    const res = await app.V61.AI.generateOutreach(makeLead(app), { channel: "WhatsApp" });
    const m = app.V61.AI.present("outreach message", res, "AI Outreach Draft");
    notNull(m);
    const root = app.window.document.getElementById("modalRoot").innerHTML;
    ok(root.includes("AI Draft"), "missing AI Draft badge");
    ok(root.includes("AI-generated outreach message draft"), "missing review note");
    ok(!/Mark as contacted|Sent/i.test(root), "draft modal must never offer to send");
    const ta = m.q("#ai-draft-text");
    eq(ta.readOnly, true);
    eq(ta.value, "Draft message body");
  });

  test("AI failure shows toast, leaves DB unchanged, and CRM still renders", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = async () => { throw new TypeError("Failed to fetch"); };
    const S = app.V61.Store;
    const row = makeLead(app);
    S.save();
    const before = snapshotDb(S);
    const res = await app.V61.AI.analyzeLead(row);
    eq(res.ok, false);
    eq(res.error, "network");
    isNull(app.V61.AI.present("lead analysis", res));
    eq(snapshotDb(S), before, "AI failure must not mutate CRM data");
    const toast = app.window.document.getElementById("toastRoot").innerHTML;
    ok(/unavailable|deterministic/i.test(toast), "error toast shown");
    app.V61.Pages.leads.render();
    assertCleanHTML(app.window.document.getElementById("content").innerHTML, "leads after AI failure");
  });

  test("no AI request fires on page load or navigation, even when configured", async () => {
    const app = freshApp();
    configureAI(app);
    makeLead(app);
    const calls = [];
    app.window.fetch = async (url) => { calls.push(String(url)); return okRes("x"); };
    const P = app.V61.Pages;
    const renders = [P.dashboard, P.leads.render, P.discovery, P.audits, P.opportunities, P.outreach, P.followups, P.tasks, P.pipeline, P.proposals, P.services, P.clients, P.projects, P.invoices, P.analytics, P.reports, P.settings, P.importexport];
    renders.forEach((fn) => { try { fn(); } catch (e) {} });
    P.leads.openLead(app.V61.Store.db.leads[0].id);
    ok(calls.length === 0, "page loads fired " + calls.length + " fetch call(s)");
  });

  test("deterministic outreach still works with zero AI configuration", () => {
    const app = freshApp();
    const gen = app.V61.OutreachEngine.generate(makeLead(app), { channel: "WhatsApp" });
    ok(gen.message.length > 0, "deterministic message empty");
    eq(gen.ai.enabled, false);
    eq(gen.ai.provider, "groq");
  });

  test("AI output is never sent automatically — CRM unchanged after AI calls", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = gwFetch(() => okRes("draft"));
    const S = app.V61.Store;
    const row = makeLead(app);
    S.save();
    const before = snapshotDb(S);
    await app.V61.AI.generateOutreach(row, { channel: "WhatsApp" });
    await app.V61.AI.generateFollowup(row.lead.id);
    eq(snapshotDb(S), before, "AI must not write outreach/stage/anything");
  });

  test("status() → connected when gateway reports configured", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = gwFetch(() => ({ ok: true, status: 200, json: async () => ({ configured: true, provider: "groq", model: "openai/gpt-oss-20b" }) }));
    const st = await app.V61.AI.status();
    eq(st.status, "connected");
  });

  test("status() → rate_limited on 429 from gateway", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = gwFetch(() => ({ ok: false, status: 429, json: async () => ({}) }));
    const st = await app.V61.AI.status();
    eq(st.status, "rate_limited");
  });

  test("status() → unauthorized when session issuance is rejected", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = async (url) => {
      if (String(url).includes("/v1/session")) return { ok: false, status: 403, json: async () => ({ ok: false, error: "forbidden_origin" }) };
      return { ok: false, status: 401, json: async () => ({}) };
    };
    const st = await app.V61.AI.status();
    eq(st.status, "unauthorized");
  });

  test("status() surfaces the reason for a network failure", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = async () => { throw new TypeError("Failed to fetch"); };
    const st = await app.V61.AI.status();
    eq(st.status, "error");
    ok(/gateway/i.test(st.detail || ""), "detail explains the failure");
  });

  test("status() detail identifies an origin rejection", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
    const st = await app.V61.AI.status();
    eq(st.status, "unauthorized");
    ok(/origin/i.test(st.detail || ""), "detail mentions the origin");
  });

  test("status() detail surfaces a gateway error status", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const st = await app.V61.AI.status();
    eq(st.status, "error");
    ok(/500/.test(st.detail || ""), "detail includes the HTTP status");
  });

  test("V61.Cmd aiAnalyze / aiFollowup / aiExplain are wired to the draft modal", async () => {
    const app = freshApp();
    configureAI(app);
    const row = makeLead(app);
    app.V61.Store.save();
    app.V61.AI.analyzeLead = () => Promise.resolve({ ok: true, content: "ANALYZE OUTPUT", model: "m" });
    app.V61.AI.generateFollowup = () => Promise.resolve({ ok: true, content: "FOLLOWUP OUTPUT", model: "m" });
    app.V61.AI.explainAudit = () => Promise.resolve({ ok: true, content: "EXPLAIN OUTPUT", model: "m" });
    const doc = app.window.document;
    const modalRootEl = doc.getElementById("modalRoot");
    const textarea = () => doc.querySelector("#modalRoot #ai-draft-text");
    app.V61.Cmd.aiAnalyze(row.lead.id);
    await new Promise((r) => setTimeout(r, 5));
    eq(textarea().value, "ANALYZE OUTPUT", "aiAnalyze did not open draft");
    modalRootEl.innerHTML = "";
    app.V61.Cmd.aiFollowup(row.lead.id);
    await new Promise((r) => setTimeout(r, 5));
    eq(textarea().value, "FOLLOWUP OUTPUT", "aiFollowup did not open draft");
    modalRootEl.innerHTML = "";
    app.V61.Cmd.aiExplain(row.lead.id);
    await new Promise((r) => setTimeout(r, 5));
    eq(textarea().value, "EXPLAIN OUTPUT", "aiExplain did not open draft");
  });
});

/* ────────────────────────── Security guarantees ────────────────────────── */
suite("AI — security", () => {
  test("no secret VALUE or provider endpoint in the frontend source", () => {
    const files = [];
    files.push(path.join(ROOT, "crm", "index.html"));
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js")) files.push(p);
      }
    })(path.join(ROOT, "crm", "js"));
    const forbidden = ["GROQ_API_KEY", "sk-", "V61_SHARED_SECRET", "api.groq.com"];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      for (const tok of forbidden) ok(!text.includes(tok), f + " contains forbidden token: " + tok);
    }
  });

  test("no credentials or session token in localStorage after an AI call", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = gwFetch(() => okRes("x"));
    await app.V61.AI.analyzeLead(makeLead(app));
    const stored = app.window.localStorage.getItem(KEY);
    ok(!stored.includes("GROQ_API_KEY"));
    ok(!stored.includes("sk-"));
    ok(!stored.includes("V61_SHARED_SECRET"));
    ok(!stored.includes("test-token-abc"));
    const c = app.V61.Store.db.settings.aiConfig;
    eq(c.provider, "groq");
    ok(!("key" in c) && !("apiKey" in c) && !("secret" in c), "aiConfig stores no key fields");
    ok(!("token" in c) && !("session" in c), "aiConfig stores no session token");
  });

  test("session token is not exposed on the public V61.AI API", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = gwFetch(() => okRes("x"));
    await app.V61.AI.analyzeLead(makeLead(app));
    const A = app.V61.AI;
    ok(!("token" in A) && !("_token" in A), "token must live only in module scope");
    ok(typeof A.getToken !== "function" && typeof A.readSession !== "function", "no token accessor exposed");
  });

  test("Google Places config stays a separate settings field with no AI coupling", () => {
    const app = freshApp();
    app.V61.Store.db.settings.discoveryProvider = "google";
    app.V61.Pages.settings();
    const el = app.window.document.getElementById("content");
    notNull(el.querySelector("#set-gkey"), "Google Maps/Places key field missing");
    notNull(el.querySelector("#set-ai-url"), "AI gateway URL field missing");
    const cfg = app.V61.Store.db.settings;
    ok(!("ai" in (cfg.googleMapsApiKey || {})), "Google key field must never hold AI config");
    ok(!("googleMapsApiKey" in (cfg.aiConfig || {})), "Google key must never live inside aiConfig");
  });
});

/* ────────────────────────── Settings page UI ────────────────────────── */
suite("AI — settings panel", () => {
  test("unconfigured settings render AI Assistant panel with security copy and fallback notice", () => {
    const app = freshApp();
    app.V61.Pages.settings();
    const h = app.window.document.getElementById("content").innerHTML;
    ok(h.includes("AI Assistant"), "missing AI panel");
    ok(h.includes("Groq"), "missing provider");
    ok(h.includes("Vision 61 AI Gateway"), "missing gateway label");
    ok(h.includes("Check connection"), "missing check button");
    ok(h.includes("set-ai-url"), "missing gateway URL input");
    ok(h.includes("never stored in this CRM or sent to the browser"), "missing security notice");
    ok(h.includes("AI unavailable — deterministic outreach remains active."), "missing fallback notice");
    ok(h.includes("AI outreach drafts"), "missing capability list");
    assertCleanHTML(h, "settings");
  });

  test("configured settings hide the fallback notice and show Configured badge", () => {
    const app = freshApp();
    configureAI(app);
    app.V61.Pages.settings();
    const h = app.window.document.getElementById("content").innerHTML;
    ok(!h.includes("AI unavailable"), "fallback notice should be hidden when configured");
    ok(h.includes("Configured"), "missing Configured badge");
  });

  test("Save AI settings persists provider, enabled and gateway URL", () => {
    const app = freshApp();
    app.V61.Pages.settings();
    const el = app.window.document.getElementById("content");
    el.querySelector("#set-ai-url").value = GW;
    el.querySelector("#set-ai-enable").checked = true;
    el.querySelector("#save-ai").click();
    const c = app.V61.Store.db.settings.aiConfig;
    eq(c.provider, "groq");
    eq(c.enabled, true);
    eq(c.gatewayUrl, GW);
  });

  test("Check connection button invokes the gateway status check", async () => {
    const app = freshApp();
    app.V61.Pages.settings();
    const el = app.window.document.getElementById("content");
    el.querySelector("#set-ai-url").value = GW;
    el.querySelector("#set-ai-enable").checked = true;
    let statusCalls = 0;
    const origStatus = app.V61.AI.status;
    app.V61.AI.status = async () => { statusCalls++; return origStatus(); };
    app.window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ configured: true, provider: "groq", model: "openai/gpt-oss-20b" }) });
    el.querySelector("#ai-check").click();
    await new Promise((r) => setTimeout(r, 5));
    eq(statusCalls, 1, "Check connection must call V61.AI.status()");
  });

  test("lead page shows AI Analyze and AI Follow-up buttons", () => {
    const app = freshApp();
    const row = makeLead(app);
    app.V61.Pages.leads.openLead(row.lead.id);
    const h = app.window.document.getElementById("content").innerHTML;
    ok(h.includes("AI Analyze"), "missing AI Analyze button");
    ok(h.includes("AI Follow-up"), "missing AI Follow-up button");
    assertCleanHTML(h, "lead detail");
  });

  test("audit detail shows Explain with AI button", () => {
    const app = freshApp();
    const row = makeLead(app);
    app.V61.Pages.auditDetail(row.lead.id);
    const h = app.window.document.getElementById("content").innerHTML;
    ok(h.includes("Explain with AI"), "missing Explain with AI button");
    assertCleanHTML(h, "audit detail");
  });

  test("outreach generator modal offers Generate with AI", () => {
    const app = freshApp();
    const row = makeLead(app);
    app.V61.Pages.outreach._internal.generateOutreach(row.lead.id);
    const root = app.window.document.getElementById("modalRoot").innerHTML;
    ok(root.includes("Generate with AI"), "missing Generate with AI button");
  });
});

/* ─────────────────────── AI website extraction ─────────────────────── */
suite("AI — website extract (worker)", () => {
  const HTML = '<!doctype html><html><head><title>Ama&apos;s Kitchen</title><meta name="description" content="Restaurant in Osu, Accra"></head>' +
    '<body><h1>Ama&apos;s Kitchen</h1><p>We serve jollof, banku and grilled tilapia. Open Mon-Fri 9am-8pm, Sat 10am-6pm.</p>' +
    '<p>Call 0201599949 or email hello@amaskitchen.example. Book a table online.</p></body></html>';
  const FIELDS = { services: ["Jollof", "Banku", "Grilled tilapia"], hours: "Mon-Fri 9am-8pm, Sat 10am-6pm", phone: "0201599949", email: "hello@amaskitchen.example", booking: true, description: "Restaurant in Osu, Accra serving local dishes." };
  function extractEnv() { return { GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET }; }
  function pageRes(html) {
    return new Response(html || HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  function groqExtractStub(capture) {
    return async (url, opts) => {
      if (String(url).includes("amaskitchen.example")) return pageRes();
      if (String(url).includes("chat/completions")) {
        if (capture) capture(JSON.parse(opts.body));
        return groqRes(200, { choices: [{ message: { content: JSON.stringify(FIELDS) } }] });
      }
      throw new Error("unexpected fetch: " + url);
    };
  }

  test("/v1/extract fetches the site server-side and returns structured fields", async () => {
    let groqBody = null;
    await withGroq(groqExtractStub((b) => { groqBody = b; }), async () => {
      const res = await callWorker("extract", { env: extractEnv(), body: { business: { name: "Ama's Kitchen", category: "Restaurant" }, url: "https://www.amaskitchen.example" } });
      eq(res.status, 200);
      const d = await res.json();
      eq(d.ok, true);
      eq(d.kind, "extract");
      eq(d.source, "detected");
      eq(d.url, "https://www.amaskitchen.example/");
      eq(d.fields.phone, "0201599949");
      eq(d.fields.booking, true);
      eq(d.fields.hours, "Mon-Fri 9am-8pm, Sat 10am-6pm");
      ok(Array.isArray(d.fields.services) && d.fields.services.length === 3, "services array expected");
    });
    notNull(groqBody);
    /* The model only ever sees the REAL page text + business context. */
    const user = JSON.parse(groqBody.messages[1].content);
    ok(user.pageText.includes("jollof"), "page text not sent to the model");
    ok(user.pageText.includes("0201599949"), "page text truncated or missing");
    eq(user.url, "https://www.amaskitchen.example/");
    const sys = groqBody.messages[0].content;
    ok(/STRICT JSON/i.test(sys), "extract prompt must demand strict JSON");
    ok(/NEVER invent/i.test(sys), "extract prompt must forbid invention");
    ok(groqBody.max_tokens <= 900, "extract must stay within the token budget");
  });

  test("/v1/extract requires a website URL", async () => {
    const res = await callWorker("extract", { env: extractEnv(), body: { business: { name: "Ama's Kitchen" } } });
    eq(res.status, 400);
    eq((await res.json()).error, "invalid_request");
  });

  test("/v1/extract rejects non-http(s) URLs", async () => {
    const res = await callWorker("extract", { env: extractEnv(), body: { business: { name: "Ama's Kitchen" }, url: "file:///etc/passwd" } });
    eq(res.status, 400);
    eq((await res.json()).error, "invalid_request");
  });

  test("/v1/extract rejects loopback / internal hosts", async () => {
    for (const u of ["http://localhost:8080/admin", "http://127.0.0.1/secret", "http://10.0.0.8/x", "http://192.168.1.1/x"]) {
      const res = await callWorker("extract", { env: extractEnv(), body: { business: { name: "X" }, url: u } });
      eq(res.status, 400, "must reject " + u);
      eq((await res.json()).error, "invalid_request");
    }
  });

  test("/v1/extract fails honestly when the site is unreachable", async () => {
    await withGroq(async () => { throw new TypeError("fetch failed"); }, async () => {
      const res = await callWorker("extract", { env: extractEnv(), body: { business: { name: "Ama's Kitchen" }, url: "https://www.amaskitchen.example" } });
      eq(res.status, 502);
      eq((await res.json()).error, "fetch_failed");
    });
  });

  test("/v1/extract reports the HTTP status when the site returns an error", async () => {
    await withGroq(async (url) => {
      if (String(url).includes("amaskitchen.example")) return new Response("gone", { status: 404 });
      return groqRes(200, { choices: [{ message: { content: "{}" } }] });
    }, async () => {
      const res = await callWorker("extract", { env: extractEnv(), body: { business: { name: "Ama's Kitchen" }, url: "https://www.amaskitchen.example" } });
      eq(res.status, 502);
      ok(/404/.test((await res.json()).message), "message should include the HTTP status");
    });
  });

  test("/v1/extract refuses to call Groq when the page has no readable content", async () => {
    let groqCalls = 0;
    await withGroq(async (url) => {
      if (String(url).includes("amaskitchen.example")) return pageRes("<html><head></head><body><script>location.replace('/x')</script></body></html>");
      groqCalls++;
      return groqRes(200, { choices: [{ message: { content: "{}" } }] });
    }, async () => {
      const res = await callWorker("extract", { env: extractEnv(), body: { business: { name: "Ama's Kitchen" }, url: "https://www.amaskitchen.example" } });
      eq(res.status, 422);
      eq((await res.json()).error, "no_content");
      eq(groqCalls, 0, "Groq must never be called without real page text");
    });
  });

  test("/v1/extract still needs a valid session token", async () => {
    const res = await callWorker("extract", { env: extractEnv(), token: null, body: { business: { name: "Ama's Kitchen" }, url: "https://www.amaskitchen.example" } });
    eq(res.status, 401);
    eq((await res.json()).code, "missing_token");
  });
});

suite("AI — website extract (frontend)", () => {
  const FIELDS = { services: ["Websites", "Branding"], hours: "Mon-Fri 9am-5pm", phone: "0201599949", booking: true, description: "Digital agency in Accra." };
  function gwOk(url, opts) {
    if (String(url).includes("/v1/session")) return sessionRes("tok-extract");
    return { ok: true, status: 200, json: async () => ({ ok: true, content: JSON.stringify(FIELDS), fields: FIELDS, source: "detected", url: "https://www.example.com", model: "m" }) };
  }

  test("extractWebsiteInfo posts business + url to /v1/extract and returns fields", async () => {
    const app = freshApp();
    configureAI(app);
    const calls = [];
    app.window.fetch = gwFetch((url, opts) => { calls.push({ url, opts }); return gwOk(url, opts); });
    const biz = { name: "Example Studio", category: "Digital agency", website: "https://www.example.com" };
    const res = await app.V61.AI.extractWebsiteInfo(biz, null);
    eq(res.ok, true);
    eq(res.fields.phone, "0201599949");
    eq(res.source, "detected");
    eq(calls.length, 1);
    eq(calls[0].url, GW + "/v1/extract");
    const ctx = JSON.parse(calls[0].opts.body).context;
    eq(ctx.business.name, "Example Studio");
    eq(ctx.url, "https://www.example.com");
  });

  test("extractWebsiteInfo with no URL fails closed with zero network calls", async () => {
    const app = freshApp();
    configureAI(app);
    let calls = 0;
    app.window.fetch = async () => { calls++; throw new Error("should not fetch"); };
    const res = await app.V61.AI.extractWebsiteInfo({ name: "No Site" }, "");
    eq(res.ok, false);
    eq(res.error, "no_url");
    eq(calls, 0);
  });

  test("extractWebsiteInfo honours the not-configured fail-safe", async () => {
    const app = freshApp();
    const res = await app.V61.AI.extractWebsiteInfo({ name: "X", website: "https://x.example" }, null);
    eq(res.ok, false);
    eq(res.error, "not_configured");
  });

  test("discovery results expose an AI Extract button (no fetch on render)", async () => {
    const app = freshApp();
    await settle(app);
    const S = app.V61.Store;
    S.db.settings.discoveryProvider = "osm";
    S.save();
    const calls = [];
    app.window.fetch = async () => { calls.push(1); return { ok: true, status: 200, json: async () => ({}) }; };
    app.V61.Discovery.search = () => Promise.resolve([{ name: "Ama's Kitchen", category: "Restaurant", address: "Osu, Accra", website: "https://amaskitchen.example", osmId: "osm-1" }]);
    app.V61.Pages.discovery();
    const el = app.window.document.getElementById("content");
    const cat = el.querySelector("#discovery-cat"); cat.value = "restaurants";
    const loc = el.querySelector("#discovery-loc"); loc.value = "Osu";
    el.querySelector("#discovery-go").dispatchEvent(new app.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 10));
    const h = el.querySelector("#discovery-results").innerHTML;
    ok(h.includes("AI Extract"), "missing AI Extract button on discovery result");
    ok(h.includes("Add to CRM"), "missing Add to CRM button");
    assertCleanHTML(h, "discovery results");
    eq(calls.length, 0, "rendering discovery must not trigger network calls");
  });

  test("lead detail shows AI Extract website button and Website Intelligence panel", () => {
    const app = freshApp();
    const row = makeLead(app);
    app.V61.Pages.leads.openLead(row.lead.id);
    const h = app.window.document.getElementById("content").innerHTML;
    ok(h.includes("AI Extract website"), "missing AI Extract website button");
    ok(h.includes("Website Intelligence"), "missing Website Intelligence panel");
    ok(h.includes("grounded only in what the site actually shows"), "missing honesty copy");
    assertCleanHTML(h, "lead detail with website intelligence");
  });

  test("AI Extract modal runs, shows extracted facts, and saves to the business", async () => {
    const app = freshApp();
    configureAI(app);
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Example Studio", category: "Digital agency", website: "https://www.example.com" });
    const lead = S.addLead(biz.id, { source: "manual" });
    S.save();
    app.window.fetch = gwOk;
    app.V61.Cmd.aiExtract(lead.id);
    const root = () => app.window.document.getElementById("modalRoot");
    ok(root().innerHTML.includes("AI Website Extract"), "modal did not open");
    eq(app.window.document.querySelector("#modalRoot #x-url").value, "https://www.example.com");
    app.window.document.querySelector("#modalRoot [data-extract]").click();
    await new Promise((r) => setTimeout(r, 10));
    const html = root().innerHTML;
    ok(html.includes("Digital agency in Accra."), "extracted description not shown");
    ok(html.includes("Websites, Branding"), "extracted services not shown");
    ok(html.includes("Save to business"), "Save button missing");
    ok(/Detected from/.test(html), "missing source label");
    app.window.document.querySelector("#modalRoot [data-xsave]").click();
    await new Promise((r) => setTimeout(r, 10));
    const saved = S.businessOf(lead);
    ok(saved.enrich && saved.enrich.source === "detected", "enrich not saved to business record");
    eq(saved.enrich.fields.phone, "0201599949");
    const act = S.activityFor(lead.id);
    ok(act.some((a) => /AI extracted business info/.test(a.text)), "activity log entry missing");
    const h = app.window.document.getElementById("content").innerHTML;
    ok(h.includes("Detected from website"), "enrich badge missing after re-render");
    ok(h.includes("Websites, Branding"), "enrich panel not rendered on lead detail");
    ok(h.includes("Re-run"), "re-run action missing");
    assertCleanHTML(h, "lead detail after save");
  });

  test("AI Extract failure keeps the modal open with an honest error and no writes", async () => {
    const app = freshApp();
    configureAI(app);
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Example Studio", website: "https://www.example.com" });
    const lead = S.addLead(biz.id, {});
    S.save();
    const before = snapshotDb(S);
    app.window.fetch = async (url) => {
      if (String(url).includes("/v1/session")) return sessionRes("t");
      return { ok: false, status: 502, json: async () => ({ ok: false, error: "fetch_failed", message: "The website did not respond (HTTP 404)." }) };
    };
    app.V61.Cmd.aiExtract(lead.id);
    app.window.document.querySelector("#modalRoot [data-extract]").click();
    await new Promise((r) => setTimeout(r, 10));
    const html = app.window.document.getElementById("modalRoot").innerHTML;
    ok(/HTTP 404/.test(html), "honest error not shown");
    ok(html.includes("Extract again"), "modal should stay open for retry");
    eq(snapshotDb(S), before, "failed extraction must not mutate CRM data");
    ok(!S.businessOf(lead).enrich, "no enrich record on failure");
  });
});