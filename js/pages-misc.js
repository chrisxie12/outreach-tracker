/* VISION 61 CRM — Analytics, Reports, Settings, Import/Export */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  function monthBoundary(offset) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(1); d.setMonth(d.getMonth() + (offset || 0));
    const next = new Date(d); next.setMonth(next.getMonth() + 1);
    return { start: d.getTime(), end: next.getTime() };
  }
  const inRange = (ts, r) => ts && ts >= r.start && ts < r.end;

  function leadCounts() {
    const rows = S().leadRows();
    const contacted = rows.filter((r) => r.lead.lastContacted || S().outreachFor(r.lead.id).length || !["new", "researching", "lost"].includes(r.lead.stage)).length;
    const responded = rows.filter((r) => S().outreachFor(r.lead.id).some((o) => ["replied", "interested", "meeting_booked", "proposal_requested"].includes(o.status)) || ["responded", "qualified", "meeting", "proposal", "negotiation", "won"].includes(r.lead.stage)).length;
    const qualified = rows.filter((r) => ["qualified", "meeting", "proposal", "negotiation", "won"].includes(r.lead.stage)).length;
    const won = rows.filter((r) => r.lead.stage === "won").length;
    const props = S().db.proposals.length;
    return { total: rows.length, contacted, responded, qualified, won, props };
  }

  /* ═══ ANALYTICS ═══ */
  function renderAnalytics() {
    const el = document.getElementById("content");
    const c = leadCounts();
    const thisM = monthBoundary(0), lastM = monthBoundary(-1);
    const addedThis = S().db.leads.filter((l) => inRange(l.createdAt, thisM)).length;
    const addedLast = S().db.leads.filter((l) => inRange(l.createdAt, lastM)).length;
    const contactedThis = S().db.leads.filter((l) => inRange(l.lastContacted, thisM)).length;
    const contactedLast = S().db.leads.filter((l) => inRange(l.lastContacted, lastM)).length;
    const wonThis = S().db.clients.filter((cl) => inRange(cl.createdAt, thisM)).length;
    const wonLast = S().db.clients.filter((cl) => inRange(cl.createdAt, lastM)).length;
    const delta = (a, b) => { if (!b) return a ? "+100%" : "—"; const v = Math.round(((a - b) / b) * 100); return (v >= 0 ? "+" : "") + v + "%"; };

    const months = [], now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString(undefined, { month: "short" }), start: d.getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() });
    }

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Business</div>' +
      '<h1 class="page-title">Analytics</h1><p class="page-sub">Outreach performance and conversion metrics</p></div></div>' +

      '<div class="metric-row" style="margin-bottom:18px">' +
      metric("Leads added", addedThis, delta(addedThis, addedLast) + " vs last month") +
      metric("Leads contacted", contactedThis, delta(contactedThis, contactedLast) + " vs last month") +
      metric("Deals won", wonThis, delta(wonThis, wonLast) + " vs last month", true) +
      metric("Outreach rate", U().pct(c.contacted, c.total) + "%", c.contacted + " of " + c.total) +
      metric("Response rate", U().pct(c.responded, Math.max(1, c.contacted)) + "%", c.responded + " replies") +
      metric("Conversion rate", U().pct(c.won, Math.max(1, c.qualified)) + "%", c.won + " of " + c.qualified) +
      metric("Close rate", U().pct(c.won, Math.max(1, c.props)) + "%", c.won + " of " + c.props + " proposals") +
      metric("Pipeline value", U().formatMoney(S().pipelineValue()), S().db.leads.length + " active deals", true) +
      "</div>" +

      '<div class="chart-grid">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.trending + ' Activity (last 6 months)</div></div><div class="panel-body">' +
      '<div class="legend"><span><span class="sw" style="background:#8a8a90"></span>Added</span><span><span class="sw" style="background:#ed4217"></span>Contacted</span><span><span class="sw" style="background:#3f9d5f"></span>Won</span></div>' +
      '<div class="bar-chart">' + months.map((mo) => {
        const added = S().db.leads.filter((l) => inRange(l.createdAt, mo)).length;
        const contacted = S().db.leads.filter((l) => inRange(l.lastContacted, mo)).length;
        const won = S().db.clients.filter((cl) => inRange(cl.createdAt, mo)).length;
        const max = Math.max(1, added, contacted, won);
        return '<div class="bar-col"><div class="bar-stack">' +
          (added ? '<div class="bar-seg" style="height:' + Math.round(added / max * 100) + '%;background:#8a8a90;opacity:.9"></div>' : "") +
          (contacted ? '<div class="bar-seg" style="height:' + Math.round(contacted / max * 100) + '%;background:#ed4217;opacity:.85"></div>' : "") +
          (won ? '<div class="bar-seg" style="height:' + Math.round(won / max * 100) + '%;background:#3f9d5f"></div>' : "") +
          (!added && !contacted && !won ? '<div class="bar-seg inactive" style="height:4px"></div>' : "") +
          '</div><span class="bar-x">' + mo.label + "</span></div>";
      }).join("") + "</div></div></div>" +

      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.zap + ' Funnel</div></div><div class="panel-body">' +
      '<div class="funnel">' + [["Leads", c.total, "#8a8a90"], ["Contacted", c.contacted, "#ed4217"], ["Responded", c.responded, "#335fa8"], ["Qualified", c.qualified, "#e0a53e"], ["Won", c.won, "#3f9d5f"]].map(([l, n, col]) =>
        '<div class="funnel-row"><span class="funnel-label">' + l + '</span><div class="funnel-bar"><div class="funnel-fill" style="width:' + Math.round(n / Math.max(1, c.total) * 100) + '%;background:' + col + '">' + n + "</div></div></div>"
      ).join("") + "</div></div></div></div>" +

      '<div class="panel" style="margin-top:18px"><div class="panel-head"><div class="panel-title">' + I.pie + ' Pipeline distribution</div></div><div class="panel-body"><div class="stack">' +
      S().STAGES.map((s) => {
        const n = S().db.leads.filter((l) => l.stage === s.key).length;
        const max = Math.max(1, S().db.leads.length);
        return '<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span style="display:inline-flex;align-items:center;gap:6px"><span class="badge-dot" style="background:' + s.color + '"></span>' + s.label + '</span><b>' + n + "</b></div><div class='progress'><i style='width:" + Math.round(n / max * 100) + "%;background:" + s.color + "'></i></div></div>";
      }).join("") + "</div></div></div>";
    UI.bind(el);
  }

  function metric(label, value, sub, acc) {
    return '<div class="metric' + (acc ? " acc" : "") + '"><div class="m-label">' + U().escapeHtml(label) + '</div><div class="m-value">' + value + '</div><div class="m-sub">' + U().escapeHtml(sub || "") + "</div></div>";
  }

  /* ═══ REPORTS ═══ */
  function renderReports() {
    const el = document.getElementById("content");
    const rows = S().leadRows();
    const c = leadCounts();
    const byStage = {};
    let pipeline = 0;
    rows.forEach((r) => {
      byStage[r.lead.stage] = byStage[r.lead.stage] || { count: 0, value: 0 };
      byStage[r.lead.stage].count++;
      byStage[r.lead.stage].value += r.lead.estimatedValue || 0;
      if (!["won", "lost"].includes(r.lead.stage)) pipeline += r.lead.estimatedValue || 0;
    });
    const byCat = {};
    rows.forEach((r) => { const k = (r.business && r.business.category) || "Other"; byCat[k] = (byCat[k] || 0) + 1; });
    const hot = rows.filter((r) => r.leadScore >= 80).length;
    const warm = rows.filter((r) => r.leadScore >= 60 && r.leadScore < 80).length;
    const cold = rows.filter((r) => r.leadScore < 60).length;

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Business</div>' +
      '<h1 class="page-title">Reports</h1><p class="page-sub">Snapshot of your pipeline and portfolio</p></div>' +
      '<div class="page-actions"><button class="btn" data-cmd="exportLeads">' + I.download + ' Export leads CSV</button><button class="btn" data-cmd="exportClients">' + I.download + " Export clients CSV</button></div></div>" +
      '<div class="grid-2">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.columns + ' Pipeline by stage</div></div><div class="panel-body">' +
      S().STAGES.map((s) => {
        const d = byStage[s.key] || { count: 0, value: 0 };
        return '<div class="stat-block"><span style="display:inline-flex;align-items:center;gap:7px"><span class="badge-dot" style="background:' + s.color + '"></span>' + s.label + '</span><span><span style="font-weight:700">' + d.count + '</span> · ' + U().formatMoney(d.value) + "</span></div>";
      }).join("") +
      '<div class="stat-block"><b>Pipeline value</b><b style="color:var(--accent)">' + U().formatMoney(pipeline) + "</b></div></div></div>" +
      '<div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.zap + ' Lead quality</div></div><div class="panel-body"><div class="stack">' +
      [["Hot", hot, "#ed4217"], ["Warm", warm, "#e0a53e"], ["Cold", cold, "#8a8a90"]].map(([l, n, col]) => {
        const max = Math.max(1, rows.length);
        return '<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span style="color:' + col + ';font-weight:700">' + l + '</span><b>' + n + "</b></div><div class='progress'><i style='width:" + Math.round(n / max * 100) + "%;background:" + col + "'></i></div></div>";
      }).join("") + "</div></div></div>" +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.pie + ' By category</div></div><div class="panel-body">' +
      Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
        const max = Math.max(1, rows.length);
        return '<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span>' + U().escapeHtml(k) + '</span><b>' + n + "</b></div><div class='progress'><i style='width:" + Math.round(n / max * 100) + "%'></i></div></div>";
      }).join("") + "</div></div></div></div>" +

      '<div class="panel" style="margin-top:18px"><div class="panel-head"><div class="panel-title">' + I.trophy + ' Summary</div></div><div class="panel-body"><div class="grid-2-1" style="gap:24px"><div>' +
      '<div class="stat-block"><span>Total leads</span><b>' + c.total + "</b></div>" +
      '<div class="stat-block"><span>Outreach rate</span><b>' + U().pct(c.contacted, c.total) + "%</b></div>" +
      '<div class="stat-block"><span>Response rate</span><b>' + U().pct(c.responded, Math.max(1, c.contacted)) + "%</b></div>" +
      '<div class="stat-block"><span>Conversion rate</span><b>' + U().pct(c.won, Math.max(1, c.qualified)) + "%</b></div>" +
      '<div class="stat-block"><span>Close rate</span><b>' + U().pct(c.won, Math.max(1, c.props)) + "%</b></div>" +
      '<div class="stat-block"><span>Revenue won</span><b style="color:var(--ok)">' + U().formatMoney(S().wonRevenue()) + "</b></div>" +
      '<div class="stat-block"><span>Outstanding payments</span><b style="color:var(--danger)">' + U().formatMoney(S().outstandingPayments()) + "</b></div></div>" +
      '<p style="font-size:13px;color:var(--text-3);line-height:1.8">Vision 61 CRM is tracking <b style="color:var(--text)">' + c.total + "</b> prospects from discovery to close. " +
      "Focus on your <b style='color:var(--accent)'>" + hot + " hot leads</b> and the <b style='color:var(--danger)'>" + S().db.followups.filter((f) => f.status === "pending" && f.dueDate < U().todayStart()).length + "</b> overdue follow-ups first.</p></div></div></div>";
    UI.bind(el);
  }

  /* ═══ IMPORT / EXPORT ═══ */
  function renderImportExport() {
    const el = document.getElementById("content");
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">System</div>' +
      '<h1 class="page-title">Import / Export</h1><p class="page-sub">Move your data in and out of Vision 61 CRM</p></div></div>' +
      '<div class="grid-2">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.upload + ' Import leads</div></div><div class="panel-body">' +
      '<p style="font-size:12.5px;color:var(--text-3);margin-bottom:12px">Import a CSV of businesses. Headers are matched by name — see Lead Discovery for the full field list.</p>' +
      '<input type="file" accept=".csv,text/csv" id="imp-file" style="display:none">' +
      '<button class="btn block" data-open-imp>' + I.upload + " Choose CSV file</button></div></div>" +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.download + ' Export data</div></div><div class="panel-body">' +
      '<div class="stack"><button class="btn" data-cmd="exportLeads">' + I.download + " Export leads (CSV)</button>" +
      '<button class="btn" data-cmd="exportClients">' + I.download + " Export clients (CSV)</button>" +
      '<button class="btn" data-cmd="exportBackup">' + I.download + ' Export full backup (JSON)</button></div></div></div></div>';
    UI.bind(el);
    const input = el.querySelector("#imp-file");
    const open = el.querySelector("[data-open-imp]");
    if (open) open.addEventListener("click", () => input && input.click());
    if (input) input.addEventListener("change", async () => {
      if (!input.files || !input.files[0]) return;
      const text = await U().readFile(input.files[0]);
      S().importCSV(text);
      input.value = "";
    });
  }

  /* ═══ SETTINGS ═══ */
  function renderSettings() {
    const el = document.getElementById("content");
    const s = S().db.settings;
    const leadCount = S().db.leads.length;
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">System</div>' +
      '<h1 class="page-title">Settings</h1><p class="page-sub">Profile, appearance and data management</p></div></div>' +
      '<div class="grid-2-1"><div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.users + ' Profile</div></div><div class="panel-body">' +
      '<div class="field-row"><div class="field"><label>Your name</label><input class="input" id="set-name" value="' + U().escapeHtml(s.profileName || "") + '"></div>' +
      '<div class="field"><label>Company</label><input class="input" id="set-company" value="' + U().escapeHtml(s.company || "") + '"></div></div>' +
      '<button class="btn btn-primary" id="save-profile">' + I.check + " Save profile</button></div></div>" +

      '<div class="panel"><div class="panel-head"><div class="panel-title">' + (V61.App.theme === "dark" ? I.moon : I.sun) + ' Appearance</div></div><div class="panel-body">' +
      '<div class="seg"><button data-theme-btn="dark" class="' + (V61.App.theme !== "light" ? "active" : "") + '">' + I.moon + " Dark</button><button data-theme-btn='light' class='" + (V61.App.theme === "light" ? "active" : "") + "'>" + I.sun + " Light</button></div>" +
      '<p style="font-size:12px;color:var(--text-3);margin-top:10px">Your choice is saved and used everywhere.</p></div></div>' +

      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.wrench + ' Data</div></div><div class="panel-body">' +
      '<div class="danger-zone">' +
      '<div style="font-weight:700;margin-bottom:6px">Reset sample data</div>' +
      '<p style="font-size:12.5px;color:var(--text-3);margin-bottom:12px">Remove all ' + leadCount + ' sample leads, clients, proposals and activity, and start with a clean database.</p>' +
      '<div style="display:flex;gap:8px"><button class="btn btn-danger" id="clear-data">' + I.trash + " Clear all data</button></div></div></div></div>" +
      "</div>" +

      '<div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.heart + ' About</div></div><div class="panel-body">' +
      '<div style="font-size:13px;color:var(--text-2);line-height:1.8">' +
      '<b style="color:var(--text)">Vision 61 CRM</b> — the internal operating system for Vision 61 Studios.<br>' +
      'Lead discovery → digital audit → outreach → proposal → close → manage.<br><br>' +
      '<span style="font-size:11.5px;color:var(--text-3)">Data is stored locally in your browser (localStorage). Version 1.0 · Built for Vision 61 Studios</span></div></div></div>' +
      "</div></div>";

    const saveBtn = el.querySelector("#save-profile");
    if (saveBtn) saveBtn.addEventListener("click", () => {
      s.profileName = el.querySelector("#set-name").value.trim() || "Christian";
      s.company = el.querySelector("#set-company").value.trim() || "Vision 61 Studios";
      S().save(); V61.Toast.success("Profile saved"); V61.App.renderShell();
    });
    el.querySelectorAll("[data-theme-btn]").forEach((b) => b.addEventListener("click", () => { V61.App.setTheme(b.dataset.themeBtn); renderSettings(); }));
    const clear = el.querySelector("#clear-data");
    if (clear) clear.addEventListener("click", () => {
      UI.confirmDialog("Clear all data?", "This permanently removes every lead, client, proposal and payment from this browser.", () => {
        localStorage.removeItem(S().KEY);
        S().load(); V61.Toast.success("Database cleared — sample data restored"); V61.App.nav("#/dashboard");
      });
    });
  }

  V61.Cmd = V61.Cmd || {};
  Object.assign(V61.Cmd, {
    exportClients: () => S().exportClientsCSV(),
    exportBackup: () => U().download("vision61-crm-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(S().db, null, 2), "application/json"),
  });

  V61.Pages.analytics = renderAnalytics;
  V61.Pages.reports = renderReports;
  V61.Pages.importexport = renderImportExport;
  V61.Pages.settings = renderSettings;
})();