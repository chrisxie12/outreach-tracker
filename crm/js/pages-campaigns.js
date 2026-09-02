/* VISION 61 CRM — Campaigns: list + builder + detail */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;
  const CE = () => V61.CampaignEngine;

  /* ── Campaign List ── */
  function renderList() {
    const el = document.getElementById("content");
    const campaigns = S().db.campaigns || [];
    const rows = campaigns.map((c) => {
      const stats = S().campaignStats(c.id);
      const seq = S().sequenceById(c.sequenceId);
      return { campaign: c, stats, sequence: seq };
    });

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Outreach</div>' +
      '<h1 class="page-title">Campaigns</h1><p class="page-sub">Autonomous outreach campaigns with ICP targeting and multi-step sequences.</p></div>' +
      '<div class="page-actions"><button class="btn btn-primary" data-new-campaign>' + I.plus + " New Campaign</button></div></div>" +
      (rows.length ?
        '<div class="table-wrap"><table class="table"><thead><tr><th>Campaign</th><th>Status</th><th>Sequence</th><th>Sent</th><th>Opened</th><th>Replies</th><th>Reply Rate</th><th></th></tr></thead><tbody>' +
        rows.map((r) => {
          const cs = S().campaignStatusOf(r.campaign.status);
          return '<tr data-open="' + r.campaign.id + '" style="cursor:pointer">' +
            '<td><div style="font-weight:600">' + U().escapeHtml(r.campaign.name) + '</div><div style="font-size:12px;color:var(--text-3)">' + U().escapeHtml(r.campaign.description || "").slice(0, 60) + '</div></td>' +
            '<td><span class="badge" style="background:' + cs.color + '22;color:' + cs.color + '">' + cs.label + '</span></td>' +
            '<td>' + (r.sequence ? U().escapeHtml(r.sequence.name) : '<span style="color:var(--text-3)">None</span>') + '</td>' +
            '<td>' + r.stats.sent + '</td>' +
            '<td>' + r.stats.opened + ' <span style="color:var(--text-3)">(' + r.stats.openRate + '%)</span></td>' +
            '<td>' + r.stats.replies + '</td>' +
            '<td><span style="color:' + (r.stats.replyRate >= 10 ? '#3f9d5f' : r.stats.replyRate >= 5 ? '#e0a53e' : 'var(--text-3)') + '">' + r.stats.replyRate + '%</span></td>' +
            '<td><button class="icon-btn" data-menu="' + r.campaign.id + '">' + I.moreH + '</button></td></tr>';
        }).join("") +
        '</tbody></table></div>' :
        '<div class="empty"><div style="font-size:40px;margin-bottom:12px">' + I.send + '</div><div style="font-size:16px;font-weight:600;margin-bottom:6px">No campaigns yet</div><div style="font-size:13px;color:var(--text-3);margin-bottom:16px">Create your first outreach campaign to start automating your prospecting.</div><button class="btn btn-primary" data-new-campaign>' + I.plus + ' Create Campaign</button></div>');

    UI.bind(el);
    el.querySelectorAll("[data-new-campaign]").forEach((b) => b.addEventListener("click", () => renderBuilder()));
    el.querySelectorAll("tr[data-open]").forEach((tr) => tr.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      renderDetail(tr.dataset.open);
    }));
  }

  /* ── Campaign Builder ── */
  function renderBuilder(editId) {
    const el = document.getElementById("content");
    const campaign = editId ? S().campaignById(editId) : null;
    const sequences = S().db.sequences || [];
    const icp = campaign ? CE().normalizeICP(campaign.icp) : CE().EMPTY_ICP;

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">' +
      (editId ? 'Edit' : 'New') + ' Campaign</div>' +
      '<h1 class="page-title">' + (editId ? 'Edit Campaign' : 'Create Campaign') + '</h1></div>' +
      '<div class="page-actions"><button class="btn" data-back>' + I.chevronL + ' Back</button></div></div>' +
      '<div class="grid-2"><div class="panel"><div class="panel-head"><div class="panel-title">' + I.send + ' Campaign Details</div></div><div class="panel-body">' +
      '<div class="field"><label>Campaign name</label><input class="input" id="cmp-name" placeholder="e.g. Restaurants in Accra" value="' + U().escapeHtml(campaign ? campaign.name : "") + '"></div>' +
      '<div class="field"><label>Description</label><input class="input" id="cmp-desc" placeholder="Optional description" value="' + U().escapeHtml(campaign ? campaign.description : "") + '"></div>' +
      '<div class="field"><label>Sequence</label><select class="input" id="cmp-seq"><option value="">Select a sequence...</option>' +
      sequences.map((s) => '<option value="' + s.id + '"' + (campaign && campaign.sequenceId === s.id ? ' selected' : '') + '>' + U().escapeHtml(s.name) + ' (' + S().stepsForSequence(s.id).filter((x) => x.type === 'email').length + ' emails)</option>').join("") +
      '</select></div>' +
      '<div class="field"><label>Daily send limit</label><input class="input" id="cmp-limit" type="number" min="1" max="100" value="' + (campaign ? campaign.dailyLimit : 50) + '"></div>' +
      '</div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.search + ' Ideal Customer Profile (ICP)</div></div><div class="panel-body">' +
      '<div class="field"><label>Categories</label><input class="input" id="icp-cats" placeholder="e.g. restaurant, salon, clinic" value="' + U().escapeHtml((icp.categories || []).join(", ")) + '"><div style="font-size:11px;color:var(--text-3);margin-top:4px">Comma-separated. Leave empty for any category.</div></div>' +
      '<div class="field"><label>Locations</label><input class="input" id="icp-locs" placeholder="e.g. Accra, Kumasi" value="' + U().escapeHtml((icp.locations || []).join(", ")) + '"><div style="font-size:11px;color:var(--text-3);margin-top:4px">Comma-separated. Leave empty for any location.</div></div>' +
      '<div class="grid-2">' +
      '<div class="field"><label>Min digital score</label><input class="input" id="icp-minscore" type="number" min="0" max="100" value="' + (icp.minScore || 0) + '"></div>' +
      '<div class="field"><label>Max digital score</label><input class="input" id="icp-maxscore" type="number" min="0" max="100" value="' + (icp.maxScore != null ? icp.maxScore : 100) + '"></div></div>' +
      '<div class="grid-2">' +
      '<div class="field"><label>Min lead score</label><input class="input" id="icp-minlead" type="number" min="0" max="100" value="' + (icp.minLeadScore || 0) + '"></div>' +
      '<div class="field"><label>Min reviews</label><input class="input" id="icp-minrev" type="number" min="0" value="' + (icp.minReviews || 0) + '"></div></div>' +
      '<div class="field"><label>Website filter</label><select class="input" id="icp-website"><option value="">Any</option><option value="true"' + (icp.hasWebsite === true ? ' selected' : '') + '>No website (opportunity)</option><option value="false"' + (icp.hasWebsite === false ? ' selected' : '') + '>Has website</option></select></div>' +
      '<div class="field"><label>Keywords</label><input class="input" id="icp-keywords" placeholder="e.g. food, catering, events" value="' + U().escapeHtml((icp.keywords || []).join(", ")) + '"><div style="font-size:11px;color:var(--text-3);margin-top:4px">Comma-separated. Match against business name/description.</div></div>' +
      '</div></div></div>' +
      '<div style="display:flex;gap:10px;margin-top:16px"><button class="btn btn-primary" data-save>' + I.check + ' ' + (editId ? 'Update' : 'Create') + ' Campaign</button>' +
      (editId ? '<button class="btn" data-delete style="color:var(--danger)">' + I.trash + ' Delete</button>' : '') + '</div>';

    UI.bind(el);
    el.querySelector("[data-back]").addEventListener("click", () => renderList());
    el.querySelector("[data-save]").addEventListener("click", () => saveCampaign(editId));

    if (editId) {
      el.querySelector("[data-delete]").addEventListener("click", () => {
        if (confirm("Delete this campaign? This cannot be undone.")) {
          S().deleteCampaign(editId);
          V61.Toast.success("Campaign deleted");
          renderList();
        }
      });
    }
  }

  function saveCampaign(editId) {
    const el = document.getElementById("content");
    const name = el.querySelector("#cmp-name").value.trim();
    const description = el.querySelector("#cmp-desc").value.trim();
    const sequenceId = el.querySelector("#cmp-seq").value;
    const dailyLimit = parseInt(el.querySelector("#cmp-limit").value, 10) || 50;

    const icp = {
      categories: el.querySelector("#icp-cats").value.split(",").map((s) => s.trim()).filter(Boolean),
      locations: el.querySelector("#icp-locs").value.split(",").map((s) => s.trim()).filter(Boolean),
      minScore: parseInt(el.querySelector("#icp-minscore").value, 10) || 0,
      maxScore: parseInt(el.querySelector("#icp-maxscore").value, 10) || 100,
      minLeadScore: parseInt(el.querySelector("#icp-minlead").value, 10) || 0,
      minReviews: parseInt(el.querySelector("#icp-minrev").value, 10) || 0,
      hasWebsite: el.querySelector("#icp-website").value === "" ? null : el.querySelector("#icp-website").value === "true",
      keywords: el.querySelector("#icp-keywords").value.split(",").map((s) => s.trim()).filter(Boolean),
    };

    if (!name) { V61.Toast.error("Campaign name is required"); return; }
    if (!sequenceId) { V61.Toast.error("Please select a sequence"); return; }

    const data = { name, description, sequenceId, dailyLimit, icp };

    if (editId) {
      S().updateCampaign(editId, data);
      V61.Toast.success("Campaign updated");
    } else {
      const c = S().addCampaign(data);
      V61.Toast.success("Campaign created");
      renderDetail(c.id);
      return;
    }
    renderList();
  }

  /* ── Campaign Detail ── */
  function renderDetail(id) {
    const el = document.getElementById("content");
    const campaign = S().campaignById(id);
    if (!campaign) { renderList(); return; }

    const stats = S().campaignStats(id);
    const sequence = S().sequenceById(campaign.sequenceId);
    const cs = S().campaignStatusOf(campaign.status);
    const prospects = S().prospectListsForCampaign(id);
    const totalProspects = prospects.reduce((s, pl) => s + (pl.prospects ? pl.prospects.length : 0), 0);
    const emailLogs = S().emailLogsForCampaign(id);
    const recentLogs = emailLogs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20);

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Campaign</div>' +
      '<h1 class="page-title">' + U().escapeHtml(campaign.name) + '</h1>' +
      '<p class="page-sub"><span class="badge" style="background:' + cs.color + '22;color:' + cs.color + '">' + cs.label + '</span> ' +
      (sequence ? ' · Sequence: ' + U().escapeHtml(sequence.name) : '') + '</p></div>' +
      '<div class="page-actions"><button class="btn" data-edit>' + I.settings + ' Edit</button> ' +
      '<button class="btn btn-primary" data-discover>' + I.scan + ' Discover Prospects</button> ' +
      '<button class="btn" data-generate>' + I.mail + ' Generate Emails</button> ' +
      '<button class="btn" data-send style="color:#3f9d5f">' + I.send + ' Send Emails</button> ' +
      (campaign.status === 'draft' ? '<button class="btn" data-start style="color:#3f9d5f">' + I.zap + ' Start Campaign</button>' : '') +
      (campaign.status === 'running' ? '<button class="btn" data-pause style="color:#e0a53e">' + I.x + ' Pause</button>' : '') +
      '</div></div>' +
      '<div class="stat-strip">' +
      '<div class="ss"><span class="ss-label">Prospects</span><span class="ss-value">' + totalProspects + '</span></div>' +
      '<div class="ss acc"><span class="ss-label">Sent</span><span class="ss-value">' + stats.sent + '</span></div>' +
      '<div class="ss"><span class="ss-label">Delivered</span><span class="ss-value">' + stats.delivered + '</span></div>' +
      '<div class="ss ok"><span class="ss-label">Opened</span><span class="ss-value">' + stats.opened + ' (' + stats.openRate + '%)</span></div>' +
      '<div class="ss"><span class="ss-label">Clicked</span><span class="ss-value">' + stats.clicked + ' (' + stats.clickRate + '%)</span></div>' +
      '<div class="ss" style="color:#c084fc"><span class="ss-label">Replies</span><span class="ss-value">' + stats.replies + ' (' + stats.replyRate + '%)</span></div>' +
      '<div class="ss bad"><span class="ss-label">Bounced</span><span class="ss-value">' + stats.bounced + '</span></div>' +
      '<div class="ss"><span class="ss-label">Cost/Lead</span><span class="ss-value">' + U().formatMoney(stats.costPerLead) + '</span></div>' +
      '</div>' +
      '<div class="grid-2"><div class="panel"><div class="panel-head"><div class="panel-title">' + I.send + ' Recent Activity</div></div><div class="panel-body">' +
      (recentLogs.length ?
        '<div style="max-height:400px;overflow-y:auto">' + recentLogs.map((log) => {
          const status = S().emailLogStatusOf(log.status);
          return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
            '<span class="badge-dot" style="background:' + status.color + '"></span>' +
            '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + U().escapeHtml(log.subject || '(no subject)') + '</div>' +
            '<div style="font-size:11px;color:var(--text-3)">' + U().escapeHtml(log.to || '') + ' · ' + status.label + '</div></div>' +
            '<div style="font-size:11px;color:var(--text-3)">' + U().timeAgo(log.createdAt) + '</div></div>';
        }).join("") + '</div>' :
        '<div class="empty" style="padding:20px"><div style="color:var(--text-3)">No emails sent yet. Generate emails and start the campaign.</div></div>') +
      '</div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.users + ' Prospect Lists</div></div><div class="panel-body">' +
      (prospects.length ?
        prospects.map((pl) => '<div style="padding:8px 0;border-bottom:1px solid var(--border)">' +
          '<div style="font-weight:600">' + U().escapeHtml(pl.name) + '</div>' +
          '<div style="font-size:12px;color:var(--text-3)">' + (pl.prospects ? pl.prospects.length : 0) + ' prospects</div></div>').join("") :
        '<div class="empty" style="padding:20px"><div style="color:var(--text-3)">No prospects yet. Run discovery to find matching businesses.</div></div>') +
      '</div></div></div>';

    UI.bind(el);
    el.querySelector("[data-edit]").addEventListener("click", () => renderBuilder(id));
    el.querySelector("[data-discover]").addEventListener("click", () => runDiscovery(id));
    el.querySelector("[data-generate]").addEventListener("click", () => generateEmails(id));
    el.querySelector("[data-send]").addEventListener("click", () => sendEmails(id));

    const startBtn = el.querySelector("[data-start]");
    if (startBtn) startBtn.addEventListener("click", () => {
      S().updateCampaign(id, { status: "running", startedAt: U().now() });
      V61.Toast.success("Campaign started!");
      renderDetail(id);
    });
    const pauseBtn = el.querySelector("[data-pause]");
    if (pauseBtn) pauseBtn.addEventListener("click", () => {
      S().updateCampaign(id, { status: "paused" });
      V61.Toast.success("Campaign paused");
      renderDetail(id);
    });
  }

  async function runDiscovery(campaignId) {
    const BD = V61.BatchDiscovery;
    if (!BD) { V61.Toast.error("Batch discovery not available"); return; }
    V61.Toast.info("Starting discovery...");
    const result = await BD.runBatch(campaignId, (p) => {
      V61.Toast.info("Searching... step " + p.step + "/" + p.total);
    });
    V61.Toast.success("Discovery complete: " + result.added + " prospects found, " + result.skipped + " skipped");
    renderDetail(campaignId);
  }

  async function generateEmails(campaignId) {
    const campaign = S().campaignById(campaignId);
    if (!campaign) return;
    const prospects = S().prospectListsForCampaign(campaignId);
    if (!prospects.length || !prospects[0].prospects.length) {
      V61.Toast.error("No prospects to generate emails for. Run discovery first.");
      return;
    }
    const EG = V61.EmailGenerator;
    if (!EG) { V61.Toast.error("Email generator not available"); return; }

    V61.Toast.info("Generating personalized emails...");
    const rows = prospects[0].prospects.map((p) => {
      const row = S().leadRows().find((r) => r.lead.id === p.leadId);
      return row;
    }).filter(Boolean);

    const emails = await EG.generateBatch(rows, campaign.icp, "Email", (p) => {
      V61.Toast.info("Generating... " + p.step + "/" + p.total);
    });

    const steps = S().stepsForSequence(campaign.sequenceId);
    const firstEmailStep = steps.find((s) => s.type === "email");
    const logs = EG.createEmailLogs(campaignId, emails, firstEmailStep ? firstEmailStep.id : null);

    S().updateCampaign(campaignId, { sentCount: logs.length });
    V61.Toast.success(logs.length + " emails generated and queued");
    renderDetail(campaignId);
  }

  async function sendEmails(campaignId) {
    const campaign = S().campaignById(campaignId);
    if (!campaign) return;

    const cfg = S().db.settings.emailConfig || {};
    if (!cfg.apiKey) {
      V61.Toast.error("Resend API key not configured. Go to Email Settings.");
      V61.App.nav("#/emailSettings");
      return;
    }

    const logs = S().emailLogsForCampaign(campaignId);
    const queued = logs.filter((l) => l.status === "queued" && l.to);
    if (!queued.length) {
      V61.Toast.error("No queued emails to send. Generate emails first.");
      return;
    }

    if (!confirm("Send " + queued.length + " emails? This will use your Resend quota.")) return;

    const ES = V61.EmailSender;
    if (!ES) { V61.Toast.error("Email sender not available"); return; }

    V61.Toast.info("Sending emails...");
    const result = await ES.sendCampaign(campaignId, (p) => {
      V61.Toast.info("Sent " + p.sent + "/" + p.total + "...");
    });

    if (result.ok) {
      V61.Toast.success("Sent " + result.sent + " emails" + (result.failed ? ", " + result.failed + " failed" : ""));
    } else {
      V61.Toast.error(result.message || "Failed to send emails");
    }
    renderDetail(campaignId);
  }

  V61.Pages.campaigns = renderList;
  V61.Pages.campaignBuilder = renderBuilder;
  V61.Pages.campaignDetail = renderDetail;
})();
