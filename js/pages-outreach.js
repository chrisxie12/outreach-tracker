/* VISION 61 CRM — Outreach, Follow-ups, Tasks */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  /* ═══ Outreach ═══ */
  function renderOutreach() {
    const el = document.getElementById("content");
    const all = [];
    S().leadRows().forEach((r) => {
      const os = S().outreachFor(r.lead.id);
      os.forEach((o) => all.push({ o, lead: r.lead, business: r.business }));
    });
    all.sort((a, b) => (b.o.contactedAt || 0) - (a.o.contactedAt || 0));
    const byChannel = {};
    all.forEach((x) => { byChannel[x.o.channel] = (byChannel[x.o.channel] || 0) + 1; });

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Outreach</div>' +
      '<h1 class="page-title">Outreach</h1><p class="page-sub">' + all.length + " interactions across " + S().db.leads.length + " leads</p></div>" +
      '<div class="page-actions"><button class="btn" data-cmd="addLead">' + I.plus + " Add Lead</button></div></div>" +
      '<div class="grid-2-1"><div class="panel"><div class="panel-head"><div class="panel-title">' + I.send + ' Outreach history</div></div><div class="panel-body">' +
      (all.length ? '<div class="table-wrap" style="border:none"><table class="data" style="min-width:720px"><thead><tr><th>Date</th><th>Business</th><th>Channel</th><th>Status</th><th>Message / response</th></tr></thead><tbody>' +
        all.map((x) => "<tr><td style='white-space:nowrap'><span class='cell-sub'>" + U().formatDateTime(x.o.contactedAt) + "</span></td>" +
          "<td><div class='b-name'><a href='#/leads/" + x.lead.id + "'>" + U().escapeHtml(x.business.name) + "</a></div><div class='b-cat'>" + U().escapeHtml(x.business.category || "") + "</div></td>" +
          "<td><span class='tag'>" + U().escapeHtml(x.o.channel) + "</span></td>" +
          "<td>" + UI.badge(S().contactStatusOf(x.o.status).label, S().contactStatusOf(x.o.status).color, true) + "</td>" +
          "<td style='max-width:340px'><span class='cell-sub' style='display:block;max-height:60px;overflow:hidden;text-overflow:ellipsis;white-space:normal'>" + U().escapeHtml(x.o.message || x.o.notes || "") + "</span></td></tr>").join("") +
        "</tbody></table></div>" : UI.emptyState("send", "No outreach logged yet.", "Log your first WhatsApp message, call or email to start tracking responses.", '<button class="btn btn-primary" data-cmd="addLead">' + I.plus + " Add a lead to reach out to</button>")) +
      "</div></div>" +
      '<div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.layers + ' By channel</div></div><div class="panel-body"><div class="stack">' +
      Object.entries(byChannel).sort((a, b) => b[1] - a[1]).map(([ch, n]) => {
        const max = Math.max(1, ...Object.values(byChannel));
        return '<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span>' + U().escapeHtml(ch) + '</span><b>' + n + "</b></div><div class='progress'><i style='width:" + Math.round((n / max) * 100) + "%;background:var(--accent)'></i></div></div>";
      }).join("") + "</div></div></div>" +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.zap + ' Quick send</div></div><div class="panel-body">' +
      '<div style="font-size:12.5px;color:var(--text-3);margin-bottom:12px">Open a lead to send the one-tap WhatsApp outreach message.</div>' +
      '<button class="btn block" data-cmd="addLead">' + I.plus + ' Start outreach</button></div></div>' +
      "</div></div>";
    UI.bind(el);
  }

  /* ═══ Follow-ups ═══ */
  function renderFollowups() {
    const el = document.getElementById("content");
    const now = U().todayStart();
    const weekEnd = now + 7 * 86400000;
    const pending = S().db.followups.filter((f) => f.status === "pending").sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
    const groups = {
      OVERDUE: pending.filter((f) => (f.dueDate || 0) < now),
      TODAY: pending.filter((f) => U().dayStart(f.dueDate) === now),
      TOMORROW: pending.filter((f) => U().dayStart(f.dueDate) === now + 86400000),
      "THIS WEEK": pending.filter((f) => f.dueDate && U().dayStart(f.dueDate) > now + 86400000 && f.dueDate <= weekEnd),
    };
    const total = pending.length;

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Outreach</div>' +
      '<h1 class="page-title">Follow-ups</h1><p class="page-sub">' + total + " pending follow-up" + (total === 1 ? "" : "s") + (groups.OVERDUE.length ? " · " + groups.OVERDUE.length + " overdue" : "") + "</p></div></div>" +
      (total ? Object.entries(groups).map(([label, items]) =>
        '<div class="panel" style="margin-bottom:16px"><div class="panel-head"><div class="panel-title">' + I.calendar + label + ' <span class="tag" style="margin-left:6px">' + items.length + "</span></div></div>" +
        '<div class="panel-body"><div class="stack">' + items.map((f) => {
          const lead = S().byId("leads", f.leadId);
          const biz = lead ? S().businessOf(lead) : null;
          const lastOut = S().outreachFor(f.leadId)[0];
          const isOverdue = (f.dueDate || 0) < now;
          return '<div class="row-card" style="border-left:3px solid ' + (isOverdue ? "var(--danger)" : f.dueDate < now + 86400000 ? "var(--warn)" : "var(--ok)") + '">' +
            '<div style="flex:1;min-width:0"><div class="rc-title">' + U().escapeHtml(f.title) +
            '<span class="badge" style="background:' + UI.hexA(f.priority === "high" ? "#e5484d" : f.priority === "medium" ? "#e0a53e" : "#8a8a90", .13) + ';color:' + (f.priority === "high" ? "#e5484d" : f.priority === "medium" ? "#e0a53e" : "#8a8a90") + '">' + f.priority + "</span></div>" +
            '<div class="rc-sub">' + (biz ? '<a href="#/leads/' + lead.id + '">' + U().escapeHtml(biz.name) + "</a>" : "Lead removed") +
            (lastOut ? " · last: " + U().escapeHtml(lastOut.channel) + " " + U().relativeTime(lastOut.contactedAt) : "") +
            (f.notes ? " · " + U().escapeHtml(f.notes) : "") + "</div>" +
            '<div style="margin-top:6px"><span class="kb-due ' + (isOverdue ? "overdue" : "") + '">' + I.clock + " " + U().formatDate(f.dueDate) + " (" + U().relativeDue(f.dueDate) + ")</span></div></div>" +
            '<div class="rc-actions">' +
            (biz ? '<a class="btn btn-sm" href="#/leads/' + lead.id + '">' + I.eye + " Open</a>" : "") +
            '<button class="btn btn-sm btn-primary" data-cmd="completeFollowup:' + f.id + '">' + I.check + " Complete</button>" +
            '<button class="btn btn-sm" data-cmd="reschedFollowup:' + f.id + '">' + I.refresh + " Reschedule</button>" +
            "</div></div>";
        }).join("") + "</div></div></div>"
      ).join("") : UI.emptyState("calendar", "You're all caught up.", "No follow-ups pending. Schedule a follow-up from any lead to stay on top of outreach.")) ;
    UI.bind(el);
  }

  /* ═══ Tasks ═══ */
  function renderTasks() {
    const el = document.getElementById("content");
    const tasks = S().db.tasks.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const open = tasks.filter((t) => t.status !== "done");
    const done = tasks.filter((t) => t.status === "done");
    const dueNow = open.filter((t) => t.dueDate && t.dueDate < U().todayStart()).length;

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Outreach</div>' +
      '<h1 class="page-title">Tasks</h1><p class="page-sub">' + open.length + " open · " + done.length + " completed" + (dueNow ? " · " + dueNow + " overdue" : "") + "</p></div></div>" +
      '<div class="tabs"><button class="active" data-tab="open">Open (' + open.length + ")</button><button data-tab='done'>Completed (" + done.length + ")</button></div>" +
      '<div class="stack" data-tasklist="open">' + (open.length ? open.map(taskCard).join("") : UI.emptyState("checkSquare", "No open tasks.", "Everything's done — or add a task from a lead's page.")) + "</div>" +
      '<div class="stack hidden" data-tasklist="done">' + (done.length ? done.map(taskCard).join("") : UI.emptyState("checkSquare", "Nothing completed yet.")) + "</div>";
    UI.bind(el);
    const head = el.querySelector(".tabs");
    if (head) head.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      el.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
      el.querySelectorAll("[data-tasklist]").forEach((l) => l.classList.toggle("hidden", l.dataset.tasklist !== b.dataset.tab));
    });
  }

  function taskCard(t) {
    const lead = S().byId("leads", t.leadId);
    const biz = lead ? S().businessOf(lead) : null;
    const prio = { high: ["#e5484d"], medium: ["#e0a53e"], low: ["#8a8a90"] }[t.priority] || ["#8a8a90"];
    return '<div class="row-card" style="border-left:3px solid ' + prio[0] + '">' +
      '<div style="flex:1;min-width:0"><div class="rc-title">' + U().escapeHtml(t.title) +
      '<span class="badge" style="background:' + UI.hexA(prio[0], .13) + ';color:' + prio[0] + '">' + t.priority + "</span></div>" +
      '<div class="rc-sub">' + (biz ? '<a href="#/leads/' + lead.id + '">' + U().escapeHtml(biz.name) + "</a>" : "No lead") +
      (t.dueDate ? " · " + I.clock + " <span class='" + (t.dueDate < U().todayStart() ? "kb-due overdue" : "") + "'>" + U().formatDate(t.dueDate) + "</span>" : "") + "</div></div>" +
      '<div class="rc-actions">' +
      (t.status === "done"
        ? '<button class="btn btn-sm btn-ghost" data-cmd="reopenTask:' + t.id + '">' + I.refresh + " Reopen</button>"
        : '<button class="btn btn-sm btn-primary" data-cmd="completeTask:' + t.id + '">' + I.check + " Complete</button>") +
      '<button class="icon-btn" data-cmd="delTask:' + t.id + '">' + I.trash + "</button></div></div>";
  }

  V61.Pages.outreach = renderOutreach;
  V61.Pages.followups = renderFollowups;
  V61.Pages.tasks = renderTasks;
})();