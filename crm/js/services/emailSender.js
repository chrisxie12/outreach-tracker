/* VISION 61 CRM — service: EmailSender
   Sends emails via the Cloudflare Worker → Resend API.
   Handles batching, rate limiting, and email log updates. */
window.V61 = window.V61 || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const Sess = V61.Session;

  const BATCH_SIZE = 5;
  const BATCH_DELAY = 2000; // ms between batches

  /* Send a batch of emails through the worker gateway. */
  async function sendBatch(emails) {
    const cfg = S().db.settings.emailConfig || {};
    if (!cfg.apiKey) {
      return { ok: false, error: "not_configured", message: "Resend API key not configured. Go to Email Settings." };
    }

    const s = await Sess.acquireSession();
    if (!s.token) {
      return { ok: false, error: "session_error", message: "Could not establish session." };
    }

    const gatewayBase = Sess.gatewayBase();
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;

    try {
      const res = await fetch(gatewayBase + "/v1/send-emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + s.token,
        },
        body: JSON.stringify({
          emails: emails.map((e) => ({
            to: e.to,
            from: e.from,
            subject: e.subject,
            body: e.body,
            campaignId: e.campaignId || null,
            leadId: e.leadId || null,
            emailLogId: e.emailLogId || null,
          })),
          fromName: cfg.fromName || "Christian",
          fromEmail: cfg.fromEmail || "hello@vision61studios.online",
        }),
        signal: ctrl ? ctrl.signal : undefined,
      });

      if (timer) clearTimeout(timer);

      if (res.status === 401) {
        Sess.clearSession();
        return { ok: false, error: "unauthorized", message: "Session expired. Try again." };
      }

      const data = await res.json().catch(() => null);
      if (!data) {
        return { ok: false, error: "parse_error", message: "Invalid response from gateway." };
      }

      return data;
    } catch (e) {
      if (timer) clearTimeout(timer);
      return { ok: false, error: "network", message: "Could not reach gateway." };
    }
  }

  /* Send all queued emails for a campaign. */
  async function sendCampaign(campaignId, onProgress) {
    const campaign = S().campaignById(campaignId);
    if (!campaign) return { ok: false, error: "not_found" };

    const logs = S().emailLogsForCampaign(campaignId);
    const queued = logs.filter((l) => l.status === "queued" && l.to);
    if (!queued.length) return { ok: true, sent: 0, message: "No queued emails to send." };

    const cfg = S().db.settings.emailConfig || {};
    const dailyLimit = cfg.dailyLimit || 50;
    const sentToday = logs.filter((l) => {
      if (!l.sentAt) return false;
      const sentDate = new Date(l.sentAt).toDateString();
      return sentDate === new Date().toDateString() && ["sent", "delivered", "opened", "clicked", "replied"].includes(l.status);
    }).length;

    const remaining = Math.max(0, dailyLimit - sentToday);
    const toSend = queued.slice(0, Math.min(remaining, queued.length));

    let sent = 0, failed = 0;

    // Send in batches
    for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
      const batch = toSend.slice(i, i + BATCH_SIZE);
      if (onProgress) onProgress({ sent, total: toSend.length, batch: Math.floor(i / BATCH_SIZE) + 1 });

      const result = await sendBatch(batch.map((log) => ({
        to: log.to,
        subject: log.subject,
        body: log.body,
        campaignId: log.campaignId,
        leadId: log.leadId,
        emailLogId: log.id,
      })));

      if (result.ok && result.results) {
        result.results.forEach((r, idx) => {
          const log = batch[idx];
          if (r.status === "sent") {
            S().updateEmailLog(log.id, { status: "sent", providerId: r.id, sentAt: U().now() });
            sent++;
          } else {
            S().updateEmailLog(log.id, { status: "failed" });
            failed++;
          }
        });
      } else {
        // Mark all as failed
        batch.forEach((log) => S().updateEmailLog(log.id, { status: "failed" }));
        failed += batch.length;
      }

      // Delay between batches
      if (i + BATCH_SIZE < toSend.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Update campaign stats
    S().updateCampaign(campaignId, {
      sentCount: (campaign.sentCount || 0) + sent,
      updatedAt: U().now(),
    });

    S().save();
    return { ok: true, sent, failed, total: toSend.length };
  }

  /* Send a single test email. */
  async function sendTestEmail(to, subject, body) {
    return sendBatch([{
      to,
      subject: subject || "Test email from Vision 61 CRM",
      body: body || "This is a test email from your Vision 61 CRM autonomous outreach system.",
    }]);
  }

  V61.EmailSender = {
    sendBatch, sendCampaign, sendTestEmail, BATCH_SIZE, BATCH_DELAY,
  };
})();
