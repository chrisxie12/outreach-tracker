/* VISION 61 CRM — service: EmailGenerator
   AI-powered per-prospect personalized email generation.
   Uses the existing Groq AI gateway for generation.
   Falls back to template-based generation when AI is unavailable. */
window.V61 = window.V61 || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;

  const SYSTEM_PROMPT = `You are a sales outreach specialist at Vision 61 Studios, a digital marketing agency in Accra, Ghana.
Write a short, personalized cold email to a business owner.

Rules:
- Sound like a real person — warm, plain, credible. No corporate filler.
- Use ONLY facts present in the prospect context. Never invent observations, compliments, business problems, prices, reviews, or contact details.
- Keep it under 120 words. No more than one emoji, ideally none.
- Subject line should be specific to their business, not generic.
- Opening line must reference something real about their business (name, location, category).
- One clear CTA: reply to this email or book a call.
- Signature: {{senderName}}, Vision 61 Studios

Output format — STRICT JSON only, no markdown:
{"subject":"<subject>","body":"<body>"}`;

  function prospectContext(row, icp) {
    const b = row.business || {};
    const a = row.audit || {};
    const opps = (V61.OpportunityEngine ? V61.OpportunityEngine.forRow(row) : []);
    return {
      businessName: b.name || "Unknown",
      category: b.category || "",
      city: b.city || "",
      address: b.address || "",
      hasWebsite: !!b.website,
      website: b.website || "",
      hasGoogleProfile: !!b.googlePlaceId,
      googleReviews: b.placeReviews || 0,
      googleRating: b.placeRating || 0,
      hasWhatsApp: !!(b.whatsapp || b.phone),
      hasEmail: !!b.email,
      digitalScore: row.digitalScore || 0,
      leadScore: row.leadScore || 0,
      opportunities: opps.slice(0, 3).map((o) => o.title),
      recommendedServices: (V61.OpportunityEngine ? V61.OpportunityEngine.recommended(row) : []).slice(0, 2).map((o) => o.service),
      senderName: (S().db.settings.profileName || "Christian").trim(),
      senderCompany: (S().db.settings.company || "Vision 61 Studios").trim(),
    };
  }

  /* Generate a single personalized email via AI. */
  async function generateEmail(row, icp, channel) {
    const cfg = (S().db.settings && S().db.settings.aiConfig) || {};
    if (!cfg.enabled || !cfg.provider) {
      return generateFromTemplate(row, channel);
    }

    try {
      const result = await V61.AI.generateOutreach(row, { channel: channel || "Email" });
      if (result && result.ok && result.content) {
        // Parse the AI response for subject and body
        const parsed = extractJson(result.content);
        if (parsed && parsed.subject && parsed.body) {
          return { subject: parsed.subject, body: parsed.body, source: "ai" };
        }
        // If JSON parsing fails, try to extract from text
        const lines = result.content.split("\n");
        let subject = "", body = "";
        for (const line of lines) {
          if (line.toUpperCase().startsWith("SUBJECT:")) {
            subject = line.slice(8).trim();
          } else if (line.toUpperCase().startsWith("MESSAGE:")) {
            body = lines.slice(lines.indexOf(line) + 1).join("\n").trim();
          }
        }
        if (subject && body) return { subject, body, source: "ai" };
      }
    } catch (e) {
      // Fall through to template
    }

    return generateFromTemplate(row, channel);
  }

  /* Generate multiple emails in batch. */
  async function generateBatch(rows, icp, channel, onProgress) {
    const results = [];
    for (let i = 0; i < rows.length; i++) {
      if (onProgress) onProgress({ step: i + 1, total: rows.length });
      const email = await generateEmail(rows[i], icp, channel);
      results.push({ row: rows[i], email });
      // Small delay to avoid rate limits
      if (i < rows.length - 1) await new Promise((r) => setTimeout(r, 500));
    }
    return results;
  }

  /* Template-based fallback. */
  function generateFromTemplate(row, channel) {
    const b = (row.business || {});
    const contactName = S().contactNameFor(row.lead.id);
    const senderName = (S().db.settings.profileName || "Christian").trim();
    const opps = (V61.OpportunityEngine ? V61.OpportunityEngine.forRow(row) : []);
    const opp = opps[0];

    let subject = "Quick question about " + (b.name || "your business");
    let body = "Hi " + contactName + ",\n\n";

    body += "I came across " + (b.name || "your business");
    if (b.city) body += " in " + b.city;
    body += " and wanted to reach out.\n\n";

    if (opp) {
      body += "I noticed " + (opp.desc || "there's an opportunity to grow your online presence").toLowerCase().replace(/\.$/, "") + ".\n\n";
    } else if (!b.website) {
      body += "I noticed you don't have a website yet — that's actually a big opportunity to capture more customers online.\n\n";
    } else {
      body += "We help businesses like yours get more customers through better websites, Google Business Profile, and social media.\n\n";
    }

    body += "Would you be open to a quick 10-minute call this week? I can also share a free digital audit of your current online presence.\n\n";
    body += "Best,\n" + senderName + "\nVision 61 Studios";

    return { subject, body, source: "template" };
  }

  /* Robust JSON extraction from AI response. */
  function extractJson(content) {
    if (typeof content !== "string") return null;
    let c = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(c.slice(start, end + 1)); } catch (e) { return null; }
  }

  /* Build email log entries for a batch of generated emails. */
  function createEmailLogs(campaignId, emails, stepId) {
    const logs = [];
    emails.forEach((item) => {
      const b = item.row.business || {};
      const log = S().addEmailLog({
        campaignId,
        leadId: item.row.lead.id,
        businessId: b.id,
        sequenceStepId: stepId || null,
        variant: item.email.variant || "A",
        to: b.email || "",
        from: S().db.settings.emailConfig.fromEmail || "",
        subject: item.email.subject,
        body: item.email.body,
        status: "queued",
      });
      logs.push(log);
    });
    return logs;
  }

  V61.EmailGenerator = {
    generateEmail, generateBatch, generateFromTemplate, createEmailLogs, prospectContext,
  };
})();
