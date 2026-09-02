/* VISION 61 CRM — Email Settings page */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  function render() {
    const el = document.getElementById("content");
    const cfg = S().db.settings.emailConfig || {};
    const aiCfg = S().db.settings.aiConfig || {};
    const totalEmails = (S().db.emailLogs || []).length;
    const sentEmails = (S().db.emailLogs || []).filter((l) => ["sent", "delivered", "opened", "clicked", "replied"].includes(l.status)).length;

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">System</div>' +
      '<h1 class="page-title">Email Settings</h1><p class="page-sub">Configure email sending for autonomous outreach campaigns.</p></div></div>' +
      '<div class="grid-2">' +
      /* Email Provider */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.mail + ' Email Provider</div></div><div class="panel-body">' +
      '<div class="field"><label>Provider</label><select class="input" id="em-provider"><option value="resend"' + (cfg.provider === "resend" ? " selected" : "") + '>Resend (Recommended)</option><option value="smtp"' + (cfg.provider === "smtp" ? " selected" : "") + '>Custom SMTP</option><option value="none"' + (!cfg.provider || cfg.provider === "none" ? " selected" : "") + '>Not configured</option></select></div>' +
      '<div class="field"><label>API Key</label><input class="input" id="em-apikey" type="password" placeholder="re_..." value="' + U().escapeHtml(cfg.apiKey || "") + '"><div style="font-size:11px;color:var(--text-3);margin-top:4px">Get your API key from <a href="https://resend.com/api-keys" target="_blank" rel="noopener">resend.com</a></div></div>' +
      '<div class="field"><label>From name</label><input class="input" id="em-fromname" placeholder="Christian" value="' + U().escapeHtml(cfg.fromName || "") + '"></div>' +
      '<div class="field"><label>From email</label><input class="input" id="em-fromemail" placeholder="hello@vision61studios.online" value="' + U().escapeHtml(cfg.fromEmail || "") + '"><div style="font-size:11px;color:var(--text-3);margin-top:4px">Must be from your verified domain</div></div>' +
      '<div class="field"><label>Domain</label><input class="input" id="em-domain" placeholder="vision61studios.online" value="' + U().escapeHtml(cfg.domain || "") + '"></div>' +
      '<div class="field"><label>Daily send limit</label><input class="input" id="em-limit" type="number" min="1" max="100" value="' + (cfg.dailyLimit || 50) + '"></div>' +
      '<div class="field"><label><input type="checkbox" id="em-warmup"' + (cfg.warmupComplete ? " checked" : "") + '> Domain warmup complete</label>' +
      '<div style="font-size:11px;color:var(--text-3);margin-top:4px">Check this once your domain has been warmed up (typically 2-4 weeks of gradual sending).</div></div>' +
      '</div></div>' +
      /* AI Configuration */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.zap + ' AI Configuration</div></div><div class="panel-body">' +
      '<div class="field"><label><input type="checkbox" id="ai-enabled"' + (aiCfg.enabled ? " checked" : "") + '> Enable AI email generation</label>' +
      '<div style="font-size:11px;color:var(--text-3);margin-top:4px">When enabled, emails are personalized per-prospect using AI. When disabled, template-based emails are used.</div></div>' +
      '<div class="field"><label>AI Provider</label><select class="input" id="ai-provider"><option value="groq"' + (aiCfg.provider === "groq" ? " selected" : "") + '>Groq</option></select></div>' +
      '<div class="field"><label>Gateway URL</label><input class="input" id="ai-gateway" value="' + U().escapeHtml(aiCfg.gatewayUrl || "") + '"></div>' +
      '<div class="field"><label>Model</label><input class="input" id="ai-model" value="' + U().escapeHtml(aiCfg.model || "") + '"></div>' +
      '</div></div>' +
      /* Sending Stats */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.gavel + ' Sending Stats</div></div><div class="panel-body">' +
      '<div class="stat-strip">' +
      '<div class="ss"><span class="ss-label">Total logged</span><span class="ss-value">' + totalEmails + '</span></div>' +
      '<div class="ss acc"><span class="ss-label">Sent</span><span class="ss-value">' + sentEmails + '</span></div>' +
      '</div>' +
      '<div style="margin-top:12px;padding:12px;background:var(--bg-2);border-radius:8px;font-size:12.5px;color:var(--text-3);line-height:1.7">' +
      '<b style="color:var(--text-2)">Domain Setup Checklist:</b><br>' +
      '1. Add your domain to Resend and verify it<br>' +
      '2. Add SPF, DKIM, and DMARC DNS records<br>' +
      '3. Set up a warmup period (2-4 weeks)<br>' +
      '4. Start with low daily limits (10-20/day)<br>' +
      '5. Gradually increase to your target limit<br>' +
      '<a href="https://resend.com/docs/dashboard/domains" target="_blank" rel="noopener" style="color:var(--accent)">Resend Domain Setup Guide</a>' +
      '</div></div></div>' +
      /* Webhook Info */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.clipboard + ' Webhook Configuration</div></div><div class="panel-body">' +
      '<div style="font-size:13px;color:var(--text-2);margin-bottom:8px">To track opens, clicks, and replies, configure these webhook URLs in your Resend dashboard:</div>' +
      '<div class="field"><label>Webhook URL</label><input class="input" readonly value="' + U().escapeHtml(window.location.origin + '/worker/v1/replies/webhook') + '"></div>' +
      '<div style="font-size:11px;color:var(--text-3);margin-top:4px">Resend will POST email events to this URL. Configure it under Settings > Webhooks in your Resend dashboard.</div>' +
      '</div></div>' +
      /* Test Email */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.send + ' Test Email</div></div><div class="panel-body">' +
      '<div style="font-size:13px;color:var(--text-2);margin-bottom:8px">Send a test email to verify your configuration works.</div>' +
      '<div class="field"><label>Test recipient</label><input class="input" id="test-email" type="email" placeholder="test@example.com"></div>' +
      '<button class="btn btn-primary" id="send-test">' + I.send + ' Send Test Email</button>' +
      '</div></div>' +
      '</div>' +
      '<div style="margin-top:16px"><button class="btn btn-primary" data-save>' + I.check + ' Save Settings</button></div>';

    UI.bind(el);
    el.querySelector("[data-save]").addEventListener("click", save);
    el.querySelector("#send-test").addEventListener("click", sendTest);
  }

  function save() {
    const el = document.getElementById("content");
    const emailConfig = {
      provider: el.querySelector("#em-provider").value,
      apiKey: el.querySelector("#em-apikey").value.trim(),
      fromName: el.querySelector("#em-fromname").value.trim(),
      fromEmail: el.querySelector("#em-fromemail").value.trim(),
      domain: el.querySelector("#em-domain").value.trim(),
      dailyLimit: parseInt(el.querySelector("#em-limit").value, 10) || 50,
      warmupComplete: el.querySelector("#em-warmup").checked,
    };
    const aiConfig = {
      enabled: el.querySelector("#ai-enabled").checked,
      provider: el.querySelector("#ai-provider").value,
      gatewayUrl: el.querySelector("#ai-gateway").value.trim(),
      model: el.querySelector("#ai-model").value.trim(),
    };

    S().db.settings.emailConfig = emailConfig;
    S().db.settings.aiConfig = aiConfig;
    S().save();
    V61.Toast.success("Settings saved");
  }

  async function sendTest() {
    const el = document.getElementById("content");
    const to = el.querySelector("#test-email").value.trim();
    if (!to) { V61.Toast.error("Enter a test email address"); return; }

    const cfg = S().db.settings.emailConfig || {};
    if (!cfg.apiKey) { V61.Toast.error("Resend API key not configured"); return; }

    const ES = V61.EmailSender;
    if (!ES) { V61.Toast.error("Email sender not available"); return; }

    V61.Toast.info("Sending test email...");
    const result = await ES.sendTestEmail(to);
    if (result.ok && result.sent > 0) {
      V61.Toast.success("Test email sent to " + to);
    } else {
      V61.Toast.error((result.results && result.results[0] && result.results[0].error) || result.message || "Failed to send test email");
    }
  }

  V61.Pages.emailSettings = render;
})();
