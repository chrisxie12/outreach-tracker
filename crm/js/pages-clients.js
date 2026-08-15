/* VISION 61 CRM — Clients: list, detail, management */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  /* ── CLIENT LIST ── */
  function renderClients() {
    const el = document.getElementById("content");
    const rows = S().clientRows();

    // Financial overview
    const wonRev = S().wonRevenue();
    const collected = rows.reduce((s, r) => s + r.paid, 0);
    const outstanding = rows.reduce((s, r) => s + r.outstanding, 0);
    const mrr = S().mrr();

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Operations</div>' +
      '<h1 class="page-title">Clients</h1><p class="page-sub">' + rows.length + " clients · " + U().formatMoney(collected) + " collected</p></div></div>" +

      '<div class="kpi-grid">' +
      '<div class="kpi accent"><div class="k-label">' + I.briefcase + ' Total Project Value</div><div class="k-value">' + U().formatMoney(rows.reduce((s, r) => s + r.totalProjectValue, 0)) + '</div></div>' +
      '<div class="kpi"><div class="k-label">' + I.credit + ' Collected</div><div class="k-value">' + U().formatMoney(collected) + '</div></div>' +
      '<div class="kpi"><div class="k-label">' + I.alert + ' Outstanding</div><div class="k-value" style="color:var(--danger)">' + U().formatMoney(outstanding) + '</div></div>' +
      '<div class="kpi"><div class="k-label">' + I.refresh + ' Active Projects</div><div class="k-value">' + rows.reduce((s, r) => s + r.activeProjects, 0) + '</div></div>' +
      '</div>' +

      (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Client</th><th>Business</th><th>Active Projects</th><th>Outstanding</th><th>Status</th><th>Last Activity</th><th>Client Since</th><th></th></tr></thead><tbody>' +
        rows.map((r) => {
          const b = r.business || {};
          const c = r.client;
          const lastAct = S().activityFor(c.leadId || "").find(a => a.type !== 'system');
          return "<tr>" +
            "<td><div class='biz-cell'><div style='width:32px;height:32px;border-radius:9px;background:" + UI.hexA(U().avatarColor(b.name || "?"), .15) + ";color:" + U().avatarColor(b.name) + ";display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px'>" + U().initials(b.name) + "</div>" +
            "<div><div class='b-name'><a href='#/clients/" + c.id + "'>" + U().escapeHtml(b.name) + "</a></div><div class='b-cat'>" + U().escapeHtml(b.category || "") + "</div></div></div></td>" +
            "<td><span class='cell-sub'>" + U().escapeHtml(b.city || "—") + "</span></td>" +
            "<td><b style='font-size:14px'>" + r.activeProjects + "</b></td>" +
            "<td><b " + (r.outstanding > 0 ? "style='color:var(--danger)'" : "style='color:var(--text-3)'") + ">" + U().formatMoney(r.outstanding) + "</b></td>" +
            "<td>" + UI.badge(c.status.toUpperCase(), c.status === "active" ? "#3f9d5f" : "#8a8a90", true) + "</td>" +
            "<td><span class='cell-sub'>" + (lastAct ? U().relativeTime(lastAct.createdAt) : "—") + "</span></td>" +
            "<td><span class='cell-sub'>" + U().formatDate(c.createdAt) + "</span></td>" +
            '<td><a class="btn btn-sm btn-ghost" href="#/clients/' + c.id + '">' + I.eye + " View</a></td></tr>";
        }).join("") + "</tbody></table></div>" :
        UI.emptyState("briefcase", "No clients yet.", "Leads are converted to clients when marked as WON.")) ;
    UI.bind(el);
  }

  /* ── CLIENT DETAIL ── */
  function renderClientDetail(id) {
    const c = S().clientById(id);
    if (!c) { V61.App.nav("#/clients"); return; }
    const biz = S().businessOf({ businessId: c.businessId });
    const financials = S().clientFinancialSummary(c.id);
    const projects = S().projectsFor(c.id);
    const invoices = S().invoicesFor(c.id);
    const lead = c.leadId ? S().byId("leads", c.leadId) : null;
    const activities = S().activityFor(c.leadId || "");
    const tasks = S().db.projectTasks.filter(t => projects.some(p => p.id === t.projectId) && t.status !== 'done');

    const el = document.getElementById("content");

    el.innerHTML =
      '<a href="#/clients" class="btn btn-ghost" style="margin-bottom:14px">' + I.chevronL + " Back to clients</a>" +

      '<div class="panel" style="padding:22px;border-left:4px solid var(--accent)">' +
        '<div class="ld-head">' +
          '<div class="avatar big" style="background:' + UI.hexA(U().avatarColor(biz.name), .15) + ';color:' + U().avatarColor(biz.name) + '">' + U().initials(biz.name) + "</div>" +
          '<div style="flex:1">' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h1 class="ld-title">' + U().escapeHtml(biz.name) + "</h1>" + UI.badge(c.status.toUpperCase(), c.status === "active" ? "#3f9d5f" : "#8a8a90", true) + "</div>" +
            '<div class="ld-sub">' + U().escapeHtml([biz.category, biz.city].filter(Boolean).join(" • ") || "Client") + ' · Client since ' + U().formatDate(c.createdAt) + "</div>" +
            '<div class="ld-actions" style="margin-top:12px">' +
              UI.contactLinks(biz) +
              (lead ? '<a class="mini-btn" href="#/leads/' + lead.id + '">' + I.eye + " Source Lead</a>" : "") +
              '<button class="mini-btn" data-cmd="startProject:' + c.id + '">' + I.plus + " Start Project</button>" +
            "</div>" +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="kpi-grid" style="margin-top:18px">' +
        '<div class="kpi accent"><div class="k-label">' + I.briefcase + ' Project Value</div><div class="k-value">' + U().formatMoney(financials.totalProjectValue) + "</div></div>" +
        '<div class="kpi"><div class="k-label">' + I.dollar + ' Paid</div><div class="k-value">' + U().formatMoney(financials.totalPaid) + "</div></div>" +
        '<div class="kpi"><div class="k-label">' + I.alert + ' Outstanding</div><div class="k-value" style="color:var(--danger)">' + U().formatMoney(financials.outstanding) + "</div></div>" +
        '<div class="kpi"><div class="k-label">' + I.checkSquare + ' Open Tasks</div><div class="k-value">' + tasks.length + "</div></div>" +
      '</div>' +

      '<div class="tabs" style="margin-top:24px">' +
        '<button class="active" data-tab="overview">Overview</button>' +
        '<button data-tab="projects">Projects (' + projects.length + ')</button>' +
        '<button data-tab="invoices">Invoices (' + invoices.length + ')</button>' +
        '<button data-tab="activity">Activity</button>' +
      '</div>' +

      '<div id="client-tab-content" style="margin-top:18px">' +
        renderOverviewTab(biz, c, projects, tasks) +
      '</div>';

    UI.bind(el);

    el.querySelectorAll(".tabs button").forEach(btn => {
      btn.addEventListener("click", () => {
        el.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;
        const container = document.getElementById("client-tab-content");
        if (tab === "overview") container.innerHTML = renderOverviewTab(biz, c, projects, tasks);
        else if (tab === "projects") container.innerHTML = renderProjectsTab(projects);
        else if (tab === "invoices") container.innerHTML = renderInvoicesTab(invoices, financials);
        else if (tab === "activity") container.innerHTML = renderActivityTab(activities);
        UI.bind(container);
      });
    });
  }

  function renderOverviewTab(biz, c, projects, tasks) {
    return '<div class="grid-2-1">' +
      '<div style="display:flex;flex-direction:column;gap:18px">' +
        '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.briefcase + ' Contact Info</div></div>' +
        '<div class="panel-body"><div class="info-grid">' +
          infoItem("Phone", biz.phone ? '<a href="tel:' + U().phoneDigits(biz.phone) + '">' + U().escapeHtml(biz.phone) + "</a>" : "—") +
          infoItem("Email", biz.email ? '<a href="mailto:' + U().escapeHtml(biz.email) + '">' + U().escapeHtml(biz.email) + "</a>" : "—") +
          infoItem("Website", biz.website ? U().urlify(biz.website, biz.website) : "—") +
          infoItem("Address", biz.address || "—") +
        '</div></div></div>' +

        '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.users + ' Contacts</div><button class="btn btn-sm" data-cmd="addClientContact:' + c.id + '">' + I.plus + ' Add</button></div>' +
        '<div class="panel-body">' +
          (S().db.clientContacts.filter(cc => cc.clientId === c.id).length ?
            '<div class="stack">' + S().db.clientContacts.filter(cc => cc.clientId === c.id).map(cc =>
              '<div class="row-card" style="padding:10px"><div><b>' + U().escapeHtml(cc.name) + '</b><div class="rc-sub">' + U().escapeHtml(cc.role || "Contact") + ' · ' + U().escapeHtml(cc.email || cc.phone || "") + '</div></div></div>'
            ).join("") + '</div>' : '<div class="cell-sub">No additional contacts recorded.</div>') +
        '</div></div>' +
      '</div>' +

      '<div style="display:flex;flex-direction:column;gap:18px">' +
        '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.checkSquare + ' Recent Tasks</div></div>' +
        '<div class="panel-body">' +
          (tasks.length ? '<div class="stack">' + tasks.slice(0, 5).map(t =>
            '<div style="font-size:13px;padding:8px 0;border-bottom:1px dashed var(--border);display:flex;justify-content:space-between">' +
              '<span>' + U().escapeHtml(t.title) + '</span>' +
              (t.dueDate ? '<span class="kb-due ' + (t.dueDate < U().todayStart() ? 'overdue' : '') + '">' + U().formatDate(t.dueDate) + '</span>' : '') +
            '</div>'
          ).join("") + '</div>' : '<div class="cell-sub">No open tasks.</div>') +
        '</div></div>' +
      '</div>' +
    '</div>';
  }

  function renderProjectsTab(projects) {
    return '<div class="panel"><div class="panel-head"><div class="panel-title">Active Projects</div></div>' +
      '<div class="panel-body">' +
        (projects.length ? '<div class="stack">' + projects.map(p => {
          const st = S().projectStatusOf(p.status);
          return '<div class="row-card" style="padding:14px">' +
            '<div style="flex:1"><b><a href="#/projects/' + p.id + '">' + U().escapeHtml(p.name) + '</a></b>' +
            '<div class="rc-sub">Started ' + U().formatDate(p.createdAt) + ' · ' + U().formatMoney(p.budget) + '</div></div>' +
            '<div style="text-align:right"><div style="margin-bottom:4px">' + UI.badge(st.label, st.color, true) + '</div>' +
            '<div style="font-size:12px;font-weight:700">' + p.progress + '%</div></div>' +
            '</div>';
        }).join("") + '</div>' : UI.emptyState("briefcase", "No projects yet.")) +
      '</div></div>';
  }

  function renderInvoicesTab(invoices, financials) {
    return '<div class="panel"><div class="panel-head"><div class="panel-title">Invoices</div></div>' +
      '<div class="panel-body">' +
        (invoices.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Invoice</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>' +
          invoices.map(inv => {
            const st = S().invoiceStatusOf(inv.status);
            return '<tr>' +
              '<td><b>#' + inv.invoiceNumber + '</b></td>' +
              '<td>' + U().formatDate(inv.issueDate) + '</td>' +
              '<td>' + U().formatMoney(inv.total) + '</td>' +
              '<td>' + U().formatMoney(inv.amountPaid) + '</td>' +
              '<td><b ' + (inv.balance > 0 ? 'style="color:var(--danger)"' : '') + '>' + U().formatMoney(inv.balance) + '</b></td>' +
              '<td>' + UI.badge(st.label, st.color, true) + '</td>' +
              '<td><button class="btn btn-sm btn-ghost" data-cmd="viewInvoice:' + inv.id + '">' + I.eye + ' View</button></td>' +
            '</tr>';
          }).join("") + '</tbody></table></div>' : UI.emptyState("credit", "No invoices found.")) +
      '</div></div>';
  }

  function renderActivityTab(activities) {
    return '<div class="panel"><div class="panel-head"><div class="panel-title">Timeline</div></div>' +
      '<div class="panel-body"><div class="timeline">' +
        (activities.length ? activities.map(a =>
          '<div class="tl-item"><div class="tl-dot"></div><div class="tl-content">' +
          '<div class="tl-time">' + U().relativeTime(a.createdAt) + '</div>' +
          '<div class="tl-title">' + U().escapeHtml(a.text) + '</div>' +
          '</div></div>'
        ).join("") : '<div class="cell-sub">No activity recorded yet.</div>') +
      '</div></div></div>';
  }

  function infoItem(label, val) {
    return '<div><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;font-weight:700;margin-bottom:3px">' + label + '</div><div style="font-size:13.5px">' + val + '</div></div>';
  }

  V61.Pages.clients = renderClients;
  V61.Pages.clientDetail = renderClientDetail;
})();