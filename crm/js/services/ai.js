/* VISION 61 CRM — service: AI
   Optional Groq-powered assistance layer for the static frontend.

   Security contract:
   - The Groq API key is NEVER present in this file or any frontend bundle.
     It lives only server-side as a Cloudflare Worker secret.
   - The frontend talks exclusively to a configurable AI gateway URL
     (settings.aiConfig.gatewayUrl). It never calls the provider endpoint directly.
   - Only a small, verified context object is sent per request — never the
     full localStorage database, never unrelated CRM records, never payments
     or credentials.
   - AI is an optional enhancement. Every call is gated on an explicit user
     action (button click). Nothing runs on page load / navigation.
   - All AI output is a DRAFT requiring human review. Nothing is ever sent
     automatically; no lead stage / invoice / payment is modified by AI.

   Provider-specific code is isolated here. Pages only call V61.AI.* */
window.V61 = window.V61 || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  const DEFAULT_MODEL = "openai/gpt-oss-20b";
  const TIMEOUT_MS = 25000;
  /* Short-lived session tokens issued by the gateway. Held in memory only —
     never localStorage/sessionStorage/IndexedDB/HTML. Expiry matches the
     worker's 15-minute session TTL. */
  const SESSION_TTL_MS = 15 * 60 * 1000;
  let _token = null;
  let _tokenExp = 0;

  function clearSession() { _token = null; _tokenExp = 0; }

  /* ── Config (from settings; gateway URL is user-editable, not the key) ── */
  function aiConfig() {
    const c = (S().db.settings && S().db.settings.aiConfig) || {};
    const envUrl = (typeof window !== "undefined" && window.V61_AI_GATEWAY_URL) || "";
    return {
      provider: c.provider || "groq",
      enabled: !!c.enabled,
      gatewayUrl: (c.gatewayUrl || envUrl || "").trim(),
      model: c.model || DEFAULT_MODEL,
    };
  }

  function isConfigured() {
    const c = aiConfig();
    return !!(c.enabled && c.provider && c.gatewayUrl);
  }

  function gatewayBase() {
    const c = aiConfig();
    return c.gatewayUrl.replace(/\/+$/, "");
  }

  /* The browser's own origin. The gateway only accepts the approved CRM origin,
     so this must always be the real page origin — never a stored value. */
  function requestOrigin() {
    try {
      if (typeof window !== "undefined" && window.location && window.location.origin) return window.location.origin;
    } catch (e) {}
    return "";
  }

  /* Obtain a session token (reusing the in-memory copy while still fresh).
     Returns { token } or { token: null, code } — never throws. The token is
     only ever kept in this closure, never persisted. */
  async function acquireSession() {
    const c = aiConfig();
    if (!isConfigured()) return { token: null, code: "not_configured" };
    const now = Date.now();
    if (_token && _tokenExp - now > 30000) return { token: _token, code: "ok" };
    let res;
    try {
      res = await fetch(gatewayBase() + "/v1/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: requestOrigin() }),
      });
    } catch (e) {
      clearSession();
      return { token: null, code: "network" };
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.ok && data && data.ok && typeof data.token === "string" && data.token) {
      _token = data.token;
      _tokenExp = (typeof data.expiresAt === "number" && data.expiresAt) || (now + SESSION_TTL_MS);
      return { token: _token, code: "ok" };
    }
    clearSession();
    return { token: null, code: (res.status === 401 || res.status === 403) ? "unauthorized" : "gateway_error", status: res.status };
  }

  /* ── Small verified context builders (only fields actually present) ── */
  function businessFacts(b) {
    if (!b) return null;
    const o = {};
    if (b.name) o.name = b.name;
    if (b.category) o.category = b.category;
    if (b.city) o.area = b.city;
    return o;
  }

  function auditFacts(row) {
    const a = row && row.audit;
    const out = {};
    if (!a) return out;
    const w = a.website || {}, g = a.google || {};
    if (typeof w.exists === "boolean") out.websiteExists = w.exists;
    if (typeof g.rating === "number" && Number.isFinite(g.rating) && g.rating >= 0) out.googleRating = g.rating;
    if (typeof g.reviews === "number" && Number.isFinite(g.reviews) && g.reviews >= 0) out.googleReviewCount = g.reviews;
    if (w.exists === false) out.noWebsite = true;
    if (g.exists === false) out.noGoogleProfile = true;
    if (w.exists === true && w.mobile === false) out.notMobileFriendly = true;
    if (w.exists === true && w.whatsapp === false) out.noWhatsappCta = true;
    return out;
  }

  function websiteAuditFacts(row) {
    try {
      const wa = S().latestWebsiteAudit(row.lead.businessId);
      if (!wa) return null;
      const o = { status: wa.status || "", score: typeof wa.score === "number" ? wa.score : null };
      if (wa.url) o.url = wa.url;
      return o;
    } catch (e) { return null; }
  }

  function opportunitiesFacts(row) {
    try {
      const rec = V61.OpportunityEngine && V61.OpportunityEngine.recommended(row);
      return (rec || []).map((o) => ({ service: o.service, reason: o.reason || "" })).slice(0, 6);
    } catch (e) { return []; }
  }

  function leadFacts(lead) {
    if (!lead) return null;
    const o = {};
    if (lead.stage) o.stage = lead.stage;
    if (lead.temperature) o.temperature = lead.temperature;
    return o;
  }

  function serviceFacts(row) {
    try {
      const names = S().recommendedServicesFor(row.lead.id);
      return (S().db.services || []).filter((svc) => svc.active && names.indexOf(svc.name) >= 0)
        .map((svc) => ({ name: svc.name, price: typeof svc.price === "number" ? svc.price : null }));
    } catch (e) { return []; }
  }

  function contactFacts(lead) {
    const name = S().contactNameFor(lead.id);
    return name && name !== "Unknown contact" ? name : "";
  }

  function previousOutreachFacts(leadId) {
    try {
      const o = S().outreachFor(leadId);
      const last = o && o.length ? o[0] : null;
      if (!last) return null;
      const f = {};
      if (last.channel) f.channel = last.channel;
      if (last.message) f.message = last.message;
      if (last.status) f.status = last.status;
      if (last.contactedAt) f.contactedAt = last.contactedAt;
      return f;
    } catch (e) { return null; }
  }

  /* ── Fetch with timeout + bearer token; returns structured result, never throws ── */
  async function callGateway(kind, context, retried) {
    const c = aiConfig();
    if (!isConfigured()) {
      return { ok: false, error: "not_configured", message: "AI unavailable — deterministic outreach remains active.", provider: c.provider };
    }
    const s = await acquireSession();
    if (!s.token) {
      if (s.code === "network") return { ok: false, error: "network", message: "AI is temporarily unavailable. Deterministic outreach tools remain available.", provider: c.provider };
      if (s.code === "not_configured") return { ok: false, error: "not_configured", message: "AI unavailable — deterministic outreach remains active.", provider: c.provider };
      return { ok: false, error: "unauthorized", message: "AI gateway session unavailable — deterministic outreach remains active.", provider: c.provider };
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    let res;
    try {
      res = await fetch(gatewayBase() + "/v1/" + kind, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.token },
        body: JSON.stringify({ context }),
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      return { ok: false, error: "network", message: "AI is temporarily unavailable. Deterministic outreach tools remain available.", provider: c.provider };
    }
    if (timer) clearTimeout(timer);
    if (res.status === 401 && !retried) {
      clearSession();
      return callGateway(kind, context, true);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.ok && data && data.ok && typeof data.content === "string" && data.content.trim()) {
      const out = { ok: true, content: data.content.trim(), model: data.model || c.model };
      if (data.fields !== undefined && data.fields !== null) out.fields = data.fields;
      if (data.source) out.source = data.source;
      if (data.url) out.url = data.url;
      if (data.title) out.title = data.title;
      return out;
    }
    const status = res.status;
    const safeMessage = (data && data.message) || "AI is temporarily unavailable. Deterministic outreach tools remain available.";
    return { ok: false, error: (data && data.error) || "gateway_error", message: safeMessage, status, provider: c.provider };
  }

  /* Gateway connection status (explicit user action only). */
  async function status() {
    const c = aiConfig();
    if (!isConfigured()) {
      return { status: "not_configured", provider: c.provider, model: c.model, detail: "Enable AI assistance and set a gateway URL in Settings." };
    }
    const s = await acquireSession();
    if (!s.token) {
      if (s.code === "network") return { status: "error", provider: c.provider, model: c.model, detail: "Could not reach the gateway — check your connection or ad blocker." };
      if (s.code === "unauthorized") return { status: "unauthorized", provider: c.provider, model: c.model, detail: "The gateway rejected this origin — open the CRM from https://chrisxie12.github.io." };
      if (s.code === "gateway_error") return { status: "error", provider: c.provider, model: c.model, detail: "Gateway returned status " + (s.status || "unknown") + "." };
      return { status: "not_configured", provider: c.provider, model: c.model, detail: "AI is not configured yet." };
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    try {
      const res = await fetch(gatewayBase() + "/v1/status", {
        headers: { "Authorization": "Bearer " + s.token },
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (timer) clearTimeout(timer);
      if (res.status === 401) { clearSession(); return { status: "unauthorized", provider: c.provider, model: c.model, detail: "Session was rejected — press Check connection again." }; }
      if (res.status === 429) return { status: "rate_limited", provider: c.provider, model: c.model, detail: "The gateway is rate-limited — try again in a moment." };
      if (res.status === 403) return { status: "unauthorized", provider: c.provider, model: c.model, detail: "The gateway rejected this origin — open the CRM from https://chrisxie12.github.io." };
      if (!res.ok) return { status: "error", provider: c.provider, model: c.model, detail: "Gateway returned status " + res.status + "." };
      const d = await res.json().catch(() => null);
      if (d && d.configured) return { status: "connected", provider: d.provider || c.provider, model: d.model || c.model, detail: "Gateway connected." };
      return { status: "error", provider: c.provider, model: c.model, detail: "Gateway reports it is not configured." };
    } catch (e) {
      if (timer) clearTimeout(timer);
      return { status: "error", provider: c.provider, model: c.model, detail: "Could not reach the gateway — check your connection or ad blocker." };
    }
  }

  /* ── The four AI capabilities ── */
  function analyzeLead(row) {
    return callGateway("analyze", {
      business: businessFacts(row && row.business),
      audit: auditFacts(row),
      website: websiteAuditFacts(row),
      opportunities: opportunitiesFacts(row),
      lead: leadFacts(row && row.lead),
    });
  }

  function generateOutreach(row, opts) {
    const channel = (opts && opts.channel) || "WhatsApp";
    return callGateway("outreach", {
      business: businessFacts(row && row.business),
      contact: contactFacts(row && row.lead),
      audit: auditFacts(row),
      website: websiteAuditFacts(row),
      opportunities: opportunitiesFacts(row),
      services: serviceFacts(row),
      channel,
    });
  }

  function generateFollowup(leadId) {
    const row = S().leadRows().find((r) => r.lead.id === leadId);
    const lead = row && row.lead;
    const notes = lead && lead.notes ? lead.notes : "";
    return callGateway("followup", {
      business: businessFacts(row && row.business),
      contact: lead ? contactFacts(lead) : "",
      audit: row ? auditFacts(row) : {},
      opportunities: row ? opportunitiesFacts(row) : [],
      lead: leadFacts(lead),
      previousOutreach: lead ? previousOutreachFacts(lead.id) : null,
      notes: notes || null,
    });
  }

  function explainAudit(row) {
    return callGateway("explain", {
      business: businessFacts(row && row.business),
      audit: auditFacts(row),
      website: websiteAuditFacts(row),
      opportunities: opportunitiesFacts(row),
      lead: leadFacts(row && row.lead),
    });
  }

  /* Read the business's real website (fetched server-side by the gateway) and
     extract structured facts. Grounded: only what the page actually shows. */
  function extractWebsiteInfo(biz, url) {
    const target = (url && String(url).trim()) || (biz && biz.website) || "";
    if (!target) {
      return Promise.resolve({ ok: false, error: "no_url", message: "Enter the business website address first." });
    }
    return callGateway("extract", { business: businessFacts(biz), url: target });
  }

  /* ── Shared AI draft modal: preview → edit → copy. Never "Sent". ── */
  function draftModal(title, content, extra) {
    const m = UI.openModal({ title: title, icon: I.lightbulb, size: "lg" });
    const bodyNote = (extra && extra.note) || "AI-generated draft — review and edit before using.";
    m.setBody(
      '<div class="ai-draft"><div class="ai-draft-head"><span class="badge" style="background:rgba(224,165,62,.16);color:#e0a53e">' + I.lightbulb + ' AI Draft</span>' +
      '<span style="font-size:11.5px;color:var(--text-3)">' + U().escapeHtml(bodyNote) + "</span></div>" +
      '<textarea class="textarea" id="ai-draft-text" rows="12" readonly></textarea></div>'
    );
    m.q("#ai-draft-text").value = content || "";
    m.setFoot(
      '<button class="btn" data-cancel>' + I.x + " Close</button>" +
      '<button class="btn" data-ai-edit>' + I.pencil + " Edit</button>" +
      '<button class="btn btn-primary" data-ai-copy>' + I.copy + " Copy</button>"
    );
    const ta = m.q("#ai-draft-text");
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-ai-edit]").addEventListener("click", () => { ta.readOnly = !ta.readOnly; if (!ta.readOnly) ta.focus(); });
    m.q("[data-ai-copy]").addEventListener("click", async () => {
      const ok = await U().copyText(ta.value);
      V61.Toast.success(ok ? "Draft copied" : "Could not copy");
    });
    return m;
  }

  /* Result → toast error or open the draft modal. Returns the modal or null. */
  function present(kindLabel, result, modalTitle) {
    if (result.ok) return draftModal(modalTitle, result.content, { note: "AI-generated " + kindLabel + " draft — requires human review." });
    const msg = result.message || "AI is temporarily unavailable. Deterministic outreach tools remain available.";
    V61.Toast.error(msg);
    return null;
  }

  /* ── AI Website Extract modal ──
     Reads the business website via the gateway and shows the extracted facts.
     Everything shown is sourced from the real page; nothing is invented.
     From a saved lead (leadId provided) the result can be saved to the
     business record, clearly labelled "Detected from website". */
  function arr(v) { return Array.isArray(v) ? v : []; }

  function fieldsHtml(f) {
    const esc = (v) => U().escapeHtml(String(v));
    const rows = [];
    const add = (label, value) => { if (value) rows.push({ label: label, value: value }); };
    if (f.description) add("About", esc(f.description));
    const svcs = arr(f.services).map(esc).join(", ");
    if (svcs) add("Services", svcs);
    const prods = arr(f.products).map(esc).join(", ");
    if (prods) add("Products", prods);
    if (f.hours) add("Hours", esc(f.hours));
    if (f.phone) add("Phone", esc(f.phone));
    if (f.email) add("Email", esc(f.email));
    if (f.whatsapp) add("WhatsApp", esc(f.whatsapp));
    if (f.instagram) add("Instagram", esc(f.instagram));
    if (f.facebook) add("Facebook", esc(f.facebook));
    if (f.tiktok) add("TikTok", esc(f.tiktok));
    if (f.address) add("Address", esc(f.address));
    const flags = [];
    if (f.booking) flags.push("Booking / appointments");
    if (f.ordering) flags.push("Online ordering");
    if (flags.length) add("Capabilities", flags.join(", "));
    const menu = arr(f.menu).map((m) => esc(m.name) + (m.price ? " — " + esc(m.price) : "")).join(", ");
    if (menu) add("Menu", menu);
    if (!rows.length) {
      return '<div style="margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:10px;color:var(--text-3);font-size:13px">Nothing new was found on the page beyond the basics already known.</div>';
    }
    return '<div style="margin-top:14px;display:flex;flex-direction:column;gap:7px">' +
      rows.map((r) =>
        '<div style="display:flex;gap:10px;font-size:13px"><div style="flex:0 0 110px;color:var(--text-3);font-weight:600">' + r.label + "</div><div style='flex:1;color:var(--text-2)'>" + r.value + "</div></div>"
      ).join("") + "</div>";
  }

  function summaryText(f, url) {
    const lines = [];
    if (f.description) lines.push(f.description);
    const svcs = arr(f.services); if (svcs.length) lines.push("Services: " + svcs.join(", "));
    const prods = arr(f.products); if (prods.length) lines.push("Products: " + prods.join(", "));
    if (f.hours) lines.push("Hours: " + f.hours);
    if (f.phone) lines.push("Phone: " + f.phone);
    if (f.email) lines.push("Email: " + f.email);
    if (f.whatsapp) lines.push("WhatsApp: " + f.whatsapp);
    if (f.instagram) lines.push("Instagram: " + f.instagram);
    if (f.facebook) lines.push("Facebook: " + f.facebook);
    if (f.tiktok) lines.push("TikTok: " + f.tiktok);
    if (f.address) lines.push("Address: " + f.address);
    const flags = [];
    if (f.booking) flags.push("booking/appointments");
    if (f.ordering) flags.push("online ordering");
    if (flags.length) lines.push("Capabilities: " + flags.join(", "));
    const menu = arr(f.menu).map((m) => m.name + (m.price ? " — " + m.price : "")).join(", ");
    if (menu) lines.push("Menu: " + menu);
    return (url ? "From " + url + "\n" : "") + lines.join("\n");
  }

  function extractModal(biz, leadId) {
    const m = UI.openModal({ title: "AI Website Extract", icon: I.globe, size: "lg" });
    m.setBody(
      '<div class="ai-draft"><div class="ai-draft-head"><span class="badge" style="background:rgba(224,165,62,.16);color:#e0a53e">' + I.lightbulb + ' AI Extract</span>' +
      '<span style="font-size:11.5px;color:var(--text-3)">Reads the business website and pulls out the important details. Only facts found on the real page are extracted — nothing is invented.</span></div>' +
      '<div class="field" style="margin-top:12px"><label>Business</label><input class="input" id="x-biz" value="' + U().escapeHtml((biz && biz.name) || "") + '" readonly></div>' +
      '<div class="field"><label>Website URL</label><input class="input" id="x-url" placeholder="https://example.com" value="' + U().escapeHtml((biz && biz.website) || "") + '"></div>' +
      '<div id="x-status" style="font-size:12.5px;color:var(--text-3);margin-top:10px;min-height:18px"></div>' +
      '<div id="x-result"></div></div>'
    );
    m.setFoot('<button class="btn" data-cancel>' + I.x + " Close</button>" +
      '<button class="btn btn-primary" data-extract>' + I.scan + " Extract</button>");
    const cancel = () => m.close();
    m.q("[data-cancel]").addEventListener("click", cancel);
    m.q("[data-extract]").addEventListener("click", () => runExtract(m, biz, leadId));
    return m;
  }

  function runExtract(m, biz, leadId) {
    const url = m.q("#x-url").value.trim();
    const statusEl = m.q("#x-status");
    const resultEl = m.q("#x-result");
    const btn = m.q("[data-extract]");
    if (!url) { statusEl.innerHTML = '<span style="color:var(--danger,#e5484d)">Enter the business website address first.</span>'; return; }
    btn.disabled = true;
    btn.textContent = "Extracting…";
    statusEl.innerHTML = '<span style="color:var(--text-2)">Reading ' + U().escapeHtml(url) + "…</span>";
    resultEl.innerHTML = "";
    extractWebsiteInfo(biz, url).then((res) => {
      btn.disabled = false;
      btn.textContent = "Extract again";
      if (!res.ok) {
        const hint = res.error === "no_url" ? "" : " Make sure the address is correct, or try a different page (e.g. the services or contact page).";
        statusEl.innerHTML = '<span style="color:var(--danger,#e5484d)">' + U().escapeHtml(res.message || "Could not extract this website.") + U().escapeHtml(hint) + "</span>";
        return;
      }
      const fields = res.fields && typeof res.fields === "object" && !res.fields.error ? res.fields : null;
      statusEl.innerHTML = '<span style="color:var(--success,#2d9e57)">Detected from ' + U().escapeHtml(res.url || url) + " — review before using.</span>";
      if (fields) {
        resultEl.innerHTML = fieldsHtml(fields);
        m.setFoot(
          '<button class="btn" data-cancel>' + I.x + " Close</button>" +
          '<button class="btn" data-xcopy>' + I.copy + " Copy summary</button>" +
          (leadId ? '<button class="btn btn-primary" data-xsave>' + I.check + " Save to business</button>" : "")
        );
        m.q("[data-cancel]").addEventListener("click", () => m.close());
        m.q("[data-xcopy]").addEventListener("click", async () => {
          const ok = await U().copyText(summaryText(fields, res.url || url));
          V61.Toast.success(ok ? "Summary copied" : "Could not copy");
        });
        if (leadId) m.q("[data-xsave]").addEventListener("click", () => saveEnrich(leadId, res, url, m));
      } else if (res.content) {
        resultEl.innerHTML = '<div class="field" style="margin-top:12px"><label>Extracted text (could not be structured)</label><textarea class="textarea" id="x-raw" rows="10" readonly></textarea></div>';
        m.q("#x-raw").value = res.content;
        m.setFoot('<button class="btn" data-cancel>' + I.x + " Close</button>" +
          '<button class="btn" data-xcopy>' + I.copy + " Copy</button>");
        m.q("[data-cancel]").addEventListener("click", () => m.close());
        m.q("[data-xcopy]").addEventListener("click", async () => {
          const ok = await U().copyText(res.content);
          V61.Toast.success(ok ? "Copied" : "Could not copy");
        });
      }
    }).catch(() => {
      btn.disabled = false;
      btn.textContent = "Extract";
      statusEl.innerHTML = '<span style="color:var(--danger,#e5484d)">Something went wrong. Try again.</span>';
    });
  }

  /* Persist the extraction to the business record, clearly labelled as
     detected from the website. Only ever a note — never auto-sent. */
  function saveEnrich(leadId, res, url, m) {
    const lead = S().byId("leads", leadId);
    if (!lead) { V61.Toast.error("Lead not found"); return; }
    const biz = S().businessOf(lead);
    if (!biz) { V61.Toast.error("Business record not found"); return; }
    biz.enrich = { at: U().now(), source: "detected", url: res.url || url, title: res.title || "", fields: res.fields || {} };
    S().save();
    S().addActivity(leadId, "note", "AI extracted business info from the website (" + (res.url || url) + ").");
    m.close();
    V61.Toast.success("Saved to business record");
    if (V61.Pages && V61.Pages.leads && V61.Pages.leads.openLead) V61.Pages.leads.openLead(leadId);
  }

  V61.AI = {
    aiConfig, isConfigured, status, DEFAULT_MODEL, TIMEOUT_MS,
    analyzeLead, generateOutreach, generateFollowup, explainAudit,
    extractWebsiteInfo, extractModal,
    draftModal, present,
  };
})();