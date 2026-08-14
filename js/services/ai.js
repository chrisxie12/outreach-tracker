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

  /* ── Fetch with timeout; returns structured result, never throws ── */
  async function callGateway(kind, context) {
    const c = aiConfig();
    if (!isConfigured()) {
      return { ok: false, error: "not_configured", message: "AI unavailable — deterministic outreach remains active.", provider: c.provider };
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    let res;
    try {
      res = await fetch(gatewayBase() + "/v1/" + kind, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      return { ok: false, error: "network", message: "AI is temporarily unavailable. Deterministic outreach tools remain available.", provider: c.provider };
    }
    if (timer) clearTimeout(timer);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.ok && data && data.ok && typeof data.content === "string" && data.content.trim()) {
      return { ok: true, content: data.content.trim(), model: data.model || c.model };
    }
    const status = res.status;
    const safeMessage = (data && data.message) || "AI is temporarily unavailable. Deterministic outreach tools remain available.";
    return { ok: false, error: (data && data.error) || "gateway_error", message: safeMessage, status, provider: c.provider };
  }

  /* Gateway connection status (explicit user action only). */
  async function status() {
    const c = aiConfig();
    if (!isConfigured()) return { status: "not_configured", provider: c.provider, model: c.model };
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    try {
      const res = await fetch(gatewayBase() + "/v1/status", { signal: ctrl ? ctrl.signal : undefined });
      if (timer) clearTimeout(timer);
      if (res.status === 429) return { status: "rate_limited", provider: c.provider, model: c.model };
      if (!res.ok) return { status: "error", provider: c.provider, model: c.model };
      const d = await res.json().catch(() => null);
      if (d && d.configured) return { status: "connected", provider: d.provider || c.provider, model: d.model || c.model };
      return { status: "error", provider: c.provider, model: c.model };
    } catch (e) {
      if (timer) clearTimeout(timer);
      return { status: "error", provider: c.provider, model: c.model };
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

  V61.AI = {
    aiConfig, isConfigured, status, DEFAULT_MODEL, TIMEOUT_MS,
    analyzeLead, generateOutreach, generateFollowup, explainAudit,
    draftModal, present,
  };
})();