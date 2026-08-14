/* QA Phase 6 — AI Assistant (gateway + frontend integration + security)
   Requirements covered:
   - AI is an OPTIONAL enhancement: deterministic outreach must keep working
     with zero AI configuration, and the AI service must fail safe.
   - No secret (GROQ_API_KEY / Authorization / provider endpoint) ever reaches
     the frontend bundle or localStorage.
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
const { freshApp, KEY, ROOT } = require("./harness");

const GW = "https://vision61-gw.test";

function configureAI(app, opts) {
  const S = app.V61.Store;
  S.db.settings.aiConfig = Object.assign({ provider: "groq", enabled: true, gatewayUrl: GW, model: "openai/gpt-oss-20b" }, opts || {});
  S.save();
  return app;
}

function okRes(content, model) {
  return { ok: true, status: 200, json: async () => ({ ok: true, content, model: model || "openai/gpt-oss-20b" }) };
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
async function callWorker(kind, opts) {
  opts = opts || {};
  const worker = loadWorker();
  const url = "https://gw.test" + (kind ? "/v1/" + kind : "/v1/status");
  let req;
  if (opts.bodyRaw !== undefined) {
    req = new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: opts.bodyRaw });
  } else if (kind) {
    req = new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: opts.body || validCtx() }) });
  } else {
    req = new Request(url, { method: opts.method || "GET", headers: opts.origin ? { Origin: opts.origin } : {} });
  }
  return worker.fetch(req, opts.env || {});
}
function withGroq(stub, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = stub;
  return Promise.resolve().then(fn).finally(() => { globalThis.fetch = prev; });
}

suite("AI — Cloudflare Worker gateway", () => {
  test("GET /v1/status reports not configured when key missing", async () => {
    const res = await callWorker(null, { env: {} });
    eq(res.status, 200);
    const d = await res.json();
    eq(d.configured, false);
    eq(d.provider, "groq");
    eq(d.model, "openai/gpt-oss-20b");
  });

  test("GET /v1/status reports configured when secret present", async () => {
    const res = await callWorker(null, { env: { GROQ_API_KEY: "sk-gateway-test" } });
    const d = await res.json();
    eq(d.configured, true);
  });

  test("POST without server secret returns 503 not_configured", async () => {
    const res = await callWorker("analyze", { env: {} });
    eq(res.status, 503);
    const d = await res.json();
    eq(d.error, "not_configured");
    ok(/deterministic/.test(d.message));
  });

  test("malformed JSON body returns 400 invalid_request", async () => {
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x" }, bodyRaw: "not-json{{" });
    eq(res.status, 400);
    eq((await res.json()).error, "invalid_request");
  });

  test("missing business context returns 400", async () => {
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x" }, body: {} });
    eq(res.status, 400);
    eq((await res.json()).error, "invalid_request");
  });

  test("unknown endpoint returns 404", async () => {
    const res = await callWorker("bogus", { env: { GROQ_API_KEY: "sk-x" } });
    eq(res.status, 404);
    eq((await res.json()).error, "not_found");
  });

  test("unsupported outreach channel returns 400", async () => {
    const res = await callWorker("outreach", { env: { GROQ_API_KEY: "sk-x" }, body: validCtx({ channel: "SnailMail" }) });
    eq(res.status, 400);
  });

  test("Groq 401 → 502 auth_failed without leaking the key", async () => {
    await withGroq(async () => groqRes(401, {}), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-secret-xyz" } });
      eq(res.status, 502);
      const d = await res.json();
      eq(d.error, "auth_failed");
      ok(!JSON.stringify(d).includes("sk-secret-xyz"), "secret leaked in response");
    });
  });

  test("Groq 429 → 429 rate_limited", async () => {
    await withGroq(async () => groqRes(429, {}), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x" } });
      eq(res.status, 429);
      eq((await res.json()).error, "rate_limited");
    });
  });

  test("Groq 500 → 502 provider_error", async () => {
    await withGroq(async () => groqRes(500, {}), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x" } });
      eq(res.status, 502);
      eq((await res.json()).error, "provider_error");
    });
  });

  test("upstream network failure → 502 upstream_unreachable", async () => {
    await withGroq(async () => { throw new TypeError("connect ECONNREFUSED"); }, async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x" } });
      eq(res.status, 502);
      eq((await res.json()).error, "upstream_unreachable");
    });
  });

  test("Groq non-JSON body → 502 malformed_response", async () => {
    await withGroq(async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("bad"); } }), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x" } });
      eq(res.status, 502);
      eq((await res.json()).error, "malformed_response");
    });
  });

  test("Groq empty content → 502 empty_response", async () => {
    await withGroq(async () => groqRes(200, { choices: [{ message: { content: "" } }] }), async () => {
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x" } });
      eq(res.status, 502);
      eq((await res.json()).error, "empty_response");
    });
  });

  test("successful response returns content + model; key used only server-side", async () => {
    let captured = null;
    await withGroq(async (url, opts) => { captured = { url, opts }; return groqRes(200, { choices: [{ message: { content: "Hello Ama" } }] }); }, async () => {
      const res = await callWorker("outreach", { env: { GROQ_API_KEY: "sk-gateway-key" }, body: validCtx() });
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
      const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x", GROQ_MODEL: "llama-3.1-70b" } });
      const d = await res.json();
      eq(d.model, "llama-3.1-70b");
      eq(JSON.parse(captured.body).model, "llama-3.1-70b");
    });
  });

  test("oversized body rejected with 400", async () => {
    const big = "x".repeat(20 * 1024);
    const res = await callWorker("analyze", { env: { GROQ_API_KEY: "sk-x" }, body: { business: { name: big } } });
    eq(res.status, 400);
    eq((await res.json()).error, "invalid_request");
  });

  test("OPTIONS preflight returns 204 with CORS headers", async () => {
    const res = await callWorker(null, { method: "OPTIONS", origin: "https://chrisxie12.github.io" });
    eq(res.status, 204);
    eq(res.headers.get("Access-Control-Allow-Origin"), "https://chrisxie12.github.io");
  });

  test("ALLOWED_ORIGIN env echoed in CORS when no Origin header", async () => {
    const res = await callWorker(null, { env: { ALLOWED_ORIGIN: "https://example.com" } });
    eq(res.status, 200);
    eq(res.headers.get("Access-Control-Allow-Origin"), "https://example.com");
  });
});

/* ────────────────────── Frontend service integration ────────────────────── */
suite("AI — frontend service", () => {
  test("ai.js loads and exposes V61.AI", () => {
    const app = freshApp();
    const A = app.V61.AI;
    notNull(A);
    eq(A.DEFAULT_MODEL, "openai/gpt-oss-20b");
    for (const fn of ["analyzeLead", "generateOutreach", "generateFollowup", "explainAudit", "status", "present"]) {
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

  test("configured gateway → successful analysis posts only verified context", async () => {
    const app = freshApp();
    configureAI(app);
    const calls = [];
    app.window.fetch = async (url, opts) => { calls.push({ url, opts }); return okRes("AI summary"); };
    const res = await app.V61.AI.analyzeLead(makeLead(app));
    eq(res.ok, true);
    eq(res.content, "AI summary");
    eq(res.model, "openai/gpt-oss-20b");
    eq(calls.length, 1);
    eq(calls[0].url, GW + "/v1/analyze");
    const ctx = JSON.parse(calls[0].opts.body).context;
    eq(ctx.business.name, "Ama's Kitchen");
    ok(typeof ctx.audit === "object");
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
    app.window.fetch = async (url, opts) => { calls.push({ url, opts }); return okRes("hello"); };
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
    app.window.fetch = async (url, opts) => { calls.push({ url, opts }); return okRes("follow-up"); };
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
    app.window.fetch = async (url, opts) => { calls.push({ url, opts }); return okRes("f"); };
    await app.V61.AI.generateFollowup(row.lead.id);
    const ctx = JSON.parse(calls[0].opts.body).context;
    isNull(ctx.previousOutreach);
  });

  test("V61_AI_GATEWAY_URL fallback is used when settings have no URL", async () => {
    const app = freshApp();
    app.window.V61_AI_GATEWAY_URL = "https://fallback-gw.test";
    configureAI(app, { gatewayUrl: "" });
    let called = "";
    app.window.fetch = async (url) => { called = String(url); return okRes("m"); };
    await app.V61.AI.analyzeLead(makeLead(app));
    eq(called, "https://fallback-gw.test/v1/analyze");
  });

  test("AI draft modal opens: AI Draft badge, readonly textarea, no send button", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = async () => okRes("Draft message body");
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
    const row = makeLead(app);
    const before = JSON.stringify(app.V61.Store.db);
    const res = await app.V61.AI.analyzeLead(row);
    eq(res.ok, false);
    eq(res.error, "network");
    isNull(app.V61.AI.present("lead analysis", res));
    eq(JSON.stringify(app.V61.Store.db), before, "AI failure must not mutate CRM data");
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
    eq(gen.ai.provider, "");
  });

  test("AI output is never sent automatically — CRM unchanged after AI calls", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = async () => okRes("draft");
    const row = makeLead(app);
    const before = JSON.stringify(app.V61.Store.db);
    await app.V61.AI.generateOutreach(row, { channel: "WhatsApp" });
    await app.V61.AI.generateFollowup(row.lead.id);
    eq(JSON.stringify(app.V61.Store.db), before, "AI must not write outreach/stage/anything");
  });

  test("status() → connected when gateway reports configured", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ configured: true, provider: "groq", model: "openai/gpt-oss-20b" }) });
    const st = await app.V61.AI.status();
    eq(st.status, "connected");
  });

  test("status() → rate_limited on 429 from gateway", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    const st = await app.V61.AI.status();
    eq(st.status, "rate_limited");
  });

  test("V61.Cmd aiAnalyze / aiFollowup / aiExplain are wired to the draft modal", async () => {
    const app = freshApp();
    configureAI(app);
    const row = makeLead(app);
    app.V61.AI.analyzeLead = () => Promise.resolve({ ok: true, content: "ANALYZE OUTPUT", model: "m" });
    app.V61.AI.generateFollowup = () => Promise.resolve({ ok: true, content: "FOLLOWUP OUTPUT", model: "m" });
    app.V61.AI.explainAudit = () => Promise.resolve({ ok: true, content: "EXPLAIN OUTPUT", model: "m" });
    const root = app.window.document.getElementById("modalRoot");
    app.V61.Cmd.aiAnalyze(row.lead.id);
    await new Promise((r) => setTimeout(r, 5));
    ok(root.innerHTML.includes("ANALYZE OUTPUT"), "aiAnalyze did not open draft");
    app.V61.Cmd.aiFollowup(row.lead.id);
    await new Promise((r) => setTimeout(r, 5));
    ok(root.innerHTML.includes("FOLLOWUP OUTPUT"), "aiFollowup did not open draft");
    app.V61.Cmd.aiExplain(row.lead.id);
    await new Promise((r) => setTimeout(r, 5));
    ok(root.innerHTML.includes("EXPLAIN OUTPUT"), "aiExplain did not open draft");
  });
});

/* ────────────────────────── Security guarantees ────────────────────────── */
suite("AI — security", () => {
  test("no secret or provider endpoint in the frontend source", () => {
    const files = [];
    files.push(path.join(ROOT, "index.html"));
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js")) files.push(p);
      }
    })(path.join(ROOT, "js"));
    const forbidden = ["GROQ_API_KEY", "sk-", "Authorization", "Bearer ", "api.groq.com"];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      for (const tok of forbidden) ok(!text.includes(tok), f + " contains forbidden token: " + tok);
    }
  });

  test("no credentials in localStorage after an AI call", async () => {
    const app = freshApp();
    configureAI(app);
    app.window.fetch = async () => okRes("x");
    await app.V61.AI.analyzeLead(makeLead(app));
    const stored = app.window.localStorage.getItem(KEY);
    ok(!stored.includes("GROQ_API_KEY"));
    ok(!stored.includes("sk-"));
    ok(!stored.includes("Authorization"));
    const c = app.V61.Store.db.settings.aiConfig;
    eq(c.provider, "groq");
    ok(!("key" in c) && !("apiKey" in c) && !("secret" in c), "aiConfig stores no key fields");
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
    ok(h.includes("Check connection"), "missing check button");
    ok(h.includes("set-ai-url"), "missing gateway URL input");
    ok(h.includes("never placed in the browser"), "missing security copy");
    ok(h.includes("AI unavailable — deterministic outreach remains active."), "missing fallback notice");
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

  test("Check connection button reports Connected after a successful status call", async () => {
    const app = freshApp();
    app.V61.Pages.settings();
    const el = app.window.document.getElementById("content");
    el.querySelector("#set-ai-url").value = GW;
    el.querySelector("#set-ai-enable").checked = true;
    app.window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ configured: true, provider: "groq", model: "openai/gpt-oss-20b" }) });
    el.querySelector("#ai-check").click();
    await new Promise((r) => setTimeout(r, 5));
    ok(el.querySelector("#ai-status").innerHTML.includes("Connected"), "status chip did not update");
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