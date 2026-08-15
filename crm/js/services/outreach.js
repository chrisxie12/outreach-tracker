/* VISION 61 CRM — service: OutreachEngine
   Deterministic outreach message builder.
   - Uses ONLY real CRM facts (business, contact, audit, scores, opportunities).
   - Never fabricates facts. Missing data renders gracefully ("Unknown" / "").
   - No AI provider is configured by default: a clearly disabled AI option is
     exposed in settings; generation is always template-based until configured.
   Supports {{variable}} and {{#variable}}...{{/variable}} conditional blocks. */
window.V61 = window.V61 || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;

  const FALLBACK = {
    WhatsApp: "Hi {{contactName}}! I'm {{senderName}} from Vision 61 Studios. I came across {{businessName}} and noticed there's room to grow its digital presence. We help local businesses get found online — websites, Google Business Profile, WhatsApp and social media. Would you be open to a quick chat? I can also share a free digital audit of your current online presence. No pressure at all — thanks!",
    Email: { subject: "A free digital audit for {{businessName}}", message: "Hi {{contactName}},\n\nI'm {{senderName}} from Vision 61 Studios. I came across {{businessName}} and our team spotted a few ways it could get more customers online.\n\nWe help local businesses with websites, Google Business Profile, WhatsApp and social media. I'd love to share a free, no-obligation digital audit of {{businessName}}'s current online presence.\n\nWould you be open to a quick call or WhatsApp chat this week?\n\nThanks,\n{{senderName}}\nVision 61 Studios" },
    Instagram: "Hi {{contactName}}! Saw {{businessName}} and loved what you're doing. We help local businesses get found online — websites, Google and WhatsApp. Would you be open to a quick chat? No pressure at all.",
    LinkedIn: "Hi {{contactName}},\n\nI came across {{businessName}} and noticed some great potential to grow its digital presence online. Vision 61 Studios helps local businesses like yours with websites, Google Business Profile and WhatsApp.\n\nWould you be open to a short call to explore how we could help? Happy to share a free digital audit.\n\nBest regards,\n{{senderName}}",
  };

  /* Render {{var}} and {{#var}}...{{/var}}. Unknown vars → "" (never "undefined"/"null"). */
  function renderTemplate(tpl, vars) {
    if (!tpl) return "";
    let out = String(tpl);
    out = out.replace(/\{\{#([A-Za-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (m, key, inner) => {
      const v = vars[key];
      const truthy = v != null && String(v).trim() !== "";
      return truthy ? renderTemplate(inner, vars) : "";
    });
    out = out.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (m, key) => {
      const v = vars[key];
      return v == null ? "" : String(v);
    });
    return out;
  }

  function websiteScoreText(row) {
    try {
      const wa = S().latestWebsiteAudit(row.lead.businessId);
      if (wa && wa.score != null) return String(wa.score) + "/100";
      if (row.business && row.business.website) return "not analysed";
    } catch (e) {}
    return "not analysed";
  }

  /* Build the variable map from real CRM data only. */
  function variablesFor(row) {
    const b = row.business || {};
    const opps = (V61.OpportunityEngine ? V61.OpportunityEngine.forRow(row) : []);
    const rec = (V61.OpportunityEngine ? V61.OpportunityEngine.recommended(row) : []);
    const location = [b.city, b.address].filter(Boolean).join(", ");
    const digital = row.audit ? String(row.digitalScore) : "not audited";
    return {
      businessName: b.name || "this business",
      contactName: S().contactNameFor(row.lead.id),
      location,
      category: b.category || "",
      digitalScore: digital,
      leadScore: String(row.leadScore),
      websiteScore: websiteScoreText(row),
      opportunities: opps.length ? String(opps.length) + " opportunity" + (opps.length === 1 ? "" : "s") + " detected" : "no major opportunities detected",
      recommendedServices: rec.map((o) => o.service).join(", ") || "digital growth services",
      senderName: (S().db.settings.profileName || "Christian").trim(),
      senderCompany: (S().db.settings.company || "Vision 61 Studios").trim(),
    };
  }

  /* "MESSAGE BASED ON:" evidence lines — only real detected/recorded facts. */
  function evidenceLines(row) {
    const b = row.business || {};
    const a = row.audit || {};
    const w = a.website || {}, g = a.google || {}, c = a.conversion || {};
    const wa = S().latestWebsiteAudit(row.lead.businessId);
    const lines = [];
    if (!b.website && w.exists !== true && !(wa && wa.status === "ok")) lines.push("No website detected");
    if (b.googlePlaceId || g.exists) {
      lines.push("Google profile exists");
      if (b.placeReviews != null && typeof b.placeReviews === "number") lines.push(b.placeReviews + " review" + (b.placeReviews === 1 ? "" : "s") + " on Google");
    }
    if (!(b.whatsapp || b.phone) && c.whatsapp !== true && !(wa && wa.signals && wa.signals.whatsapp)) lines.push("No WhatsApp CTA detected");
    if (b.website && (w.modern || (wa && wa.status === "ok")) && !(w.mobile === false)) lines.push("Website exists");
    const opps = (V61.OpportunityEngine ? V61.OpportunityEngine.recommended(row) : []);
    opps.slice(0, 4).forEach((o) => {
      if (o.evidence && lines.indexOf(o.evidence) === -1) lines.push(o.evidence);
    });
    return lines;
  }

  function aiStatus() {
    const cfg = (S().db.settings && S().db.settings.aiConfig) || {};
    return { enabled: !!(cfg.enabled && cfg.provider), provider: cfg.provider || "", label: cfg.provider || "No AI provider configured" };
  }

  /* Choose a template for the channel: user's active templates first, then built-ins. */
  function templateFor(channel) {
    const user = S().activeTemplates().filter((t) => t.channel === channel);
    if (user.length) return user[0];
    const builtin = S().DEFAULT_TEMPLATES.find((t) => t.channel === channel);
    if (builtin) return builtin;
    return null;
  }

  /* Deterministic generation. Returns { channel, subject, message, templateName, evidence } */
  function generate(row, opts) {
    const channel = (opts && opts.channel) || "WhatsApp";
    const vars = variablesFor(row);
    const tpl = (opts && opts.templateId)
      ? S().db.outreachTemplates.find((t) => t.id === opts.templateId) || null
      : templateFor(channel);
    let subject = "", message = "";
    if (tpl) {
      subject = renderTemplate(tpl.subject || "", vars);
      message = renderTemplate(tpl.message || "", vars).trim();
    }
    if (!message) {
      const fb = FALLBACK[channel];
      if (fb && typeof fb === "object") { subject = renderTemplate(fb.subject, vars); message = renderTemplate(fb.message, vars).trim(); }
      else if (fb) message = renderTemplate(fb, vars).trim();
      else message = renderTemplate(FALLBACK.WhatsApp, vars).trim();
    }
    return {
      channel,
      subject,
      message,
      templateName: tpl ? tpl.name : ("Default " + channel + " message"),
      evidence: evidenceLines(row),
      ai: aiStatus(),
    };
  }

  V61.OutreachEngine = { renderTemplate, variablesFor, evidenceLines, generate, templateFor, aiStatus, FALLBACK };
})();