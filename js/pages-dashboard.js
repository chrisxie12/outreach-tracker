/* VISION 61 CRM — Dashboard */
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

  function inRange(ts, r) { return ts && ts >= r.start && ts < r.end; }

  function contactedLeads() {
    return S().leadRows().filter((r) => r.lead.lastContacted || S().outreachFor(r.lead.id).length || !["new", "researching", "lost"].includes(r.lead.stage));
  }
  function respondedLeads() {
    return S().leadRows().filter((r) => S().outreachFor(r.lead.id).some((o) => ["replied", "interested", "meeting_booked", "proposal_requested"].includes(o.status)) || ["responded", "qualified", "meeting", "proposal", "negotiation", "won"].includes(r.lead.stage));
  }

  function kpi(label, value, delta, deltaDir, sub, icon, accent) {
    const dArrow = deltaDir === "up" ? I.trending : deltaDir === "down" ? I.arrowDown : "";
    return '<div class="kpi' + (accent ? " accent" : "") + '">' +
      '<div class="k-label">' + U().escapeHtml(label) + "</div>" +
      '<div class="k-ic">' + (I[icon] || I.plus) + "</div>" +
      '<div class="k-value">' + value + "</div>" +
      (delta != null
        ? '<span class="k-delta ' + deltaDir + '">' + dArrow + (delta >= 0 ? "+" : "") + delta + '%<span class="k-comp">' + U().escapeHtml(sub || "vs last month") + "</span></span>"
        : sub ? '<div style="font-size:12px;color:var(--text-3);margin-top:5px">' + U().escapeHtml(sub) + "</div>" : "") +
      "</div>";
  }

  function pctDelta(cur, prev) {
    if (!prev) return cur ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  }

  function buildKpis() {
    const now = U().now();
    const thisM = monthBoundary(0), lastM = monthBoundary(-1);
    const rows = S().leadRows();
    const total = rows.length;
    const createdThis = rows.filter((r) => inRange(r.lead.createdAt, thisM)).length;
    const createdLast = rows.filter((r) => inRange(r.lead.createdAt, lastM)).length;
    const contacted = contactedLeads().length;
    const contactedThis = contactedLeads().filter((r) => inRange(r.lead.lastContacted, thisM)).length;
    const contactedLast = contactedLeads().filter((r) => inRange(r.lead.lastContacted, lastM)).length;
    const due = S().db.followups.filter((f) => f.status === "pending" && (f.dueDate || 0) <= now).length;
    const overdue = S().db.followups.filter((f) => f.status === "pending" && (f.dueDate || 0) < U().todayStart()).length;
    const qualified = rows.filter((r) => ["qualified", "meeting", "proposal", "negotiation"].includes(r.lead.stage)).length;
    const proposalsSent = S().db.proposals.filter((p) => ["sent", "viewed", "accepted", "rejected"].includes(p.status)).length;
    const won = rows.filter((r) => r.lead.stage === "won").length;
    const wonThis = rows.filter((r) => r.lead.stage === "won" && inRange(r.lead.wonAt || r.lead.updatedAt, thisM)).length;
    const wonLast = rows.filter((r) => r.lead.stage === "won" && inRange(r.lead.wonAt || r.lead.updatedAt, lastM)).length;
    const pipelineVal = S().pipelineValue();
    const collected = S().clientRows().reduce((s, r) => s + r.paid, 0);
    const outstanding = S().clientRows().reduce((s, r) => s + r.outstanding, 0);

    const cards = [
      kpi("Total Leads", U().formatCompact(total), pctDelta(createdThis, createdLast), createdThis >= createdLast ? "up" : "down", "this month", "users"),
      kpi("Active Projects", S().db.projects.filter(p => !["completed", "cancelled"].includes(p.status)).length, null, "flat", "in delivery", "briefcase"),
      kpi("Won Deals", U().formatCompact(won), pctDelta(wonThis, wonLast), wonThis >= wonLast ? "up" : "down", "this month", "trophy"),
      kpi("Revenue Collected", U().formatMoney(collected), null, "flat", "actual cash", "credit", true),
      kpi("Follow-ups Due", due, null, "flat", overdue ? overdue + " overdue" : "all on time", "calendar", overdue ? true : false),
      kpi("Open Tasks", S().db.projectTasks.filter(t => t.status !== 'done').length, null, "flat", "to complete", "checkSquare"),
      kpi("Outstanding", U().formatMoney(outstanding), null, "flat", "to collect", "alert", outstanding > 0),
      kpi("Pipeline Value", U().formatMoney(pipelineVal), null, "flat", rows.length + " prospects", "dollar"),
    ];
    return '<div class="kpi-grid">' + cards.join("") + "</div>";
  }

  function funnel() {
    const rows = S().leadRows();
    const total = rows.length;
    const contacted = contactedLeads().length;
    const responded = respondedLeads().length;
    const meeting = rows.filter((r) => ["meeting", "proposal", "negotiation", "won"].includes(r.lead.stage)).length;
    const proposal = rows.filter((r) => ["proposal", "negotiation", "won"].includes(r.lead.stage)).length;
    const won = rows.filter((r) => r.lead.stage === "won").length;
    const steps = [["Leads added", total, "#8a8a90"], ["Contacted", contacted, "#ed4217"], ["Responded", responded, "#335fa8"], ["Meetings", meeting, "#6b51b5"], ["Proposals", proposal, "#0e7490"], ["Won", won, "#3f9d5f"]];
    const max = Math.max(1, total);
    return '<div class="funnel">' + steps.map(([label, n, color]) =>
      '<div class="funnel-row"><span class="funnel-label">' + label + "</span>" +
      '<div class="funnel-bar"><div class="funnel-fill" style="width:' + Math.round((n / max) * 100) + "%;background:" + color + '">' + n + "</div></div></div>"
    ).join("") + "</div>";
  }

  function monthlyBars() {
    const months = [], now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString(undefined, { month: "short" }), start: d.getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() });
    }
    const max = Math.max(1, ...months.map((m) => Math.max(
      S().db.leads.filter((l) => inRange(l.createdAt, m)).length,
      S().db.leads.filter((l) => inRange(l.lastContacted, m)).length,
      S().db.clients.filter((c) => inRange(c.createdAt, m)).length
    )));
    return '<div class="legend"><span><span class="sw" style="background:#8a8a90"></span>Added</span><span><span class="sw" style="background:#ed4217"></span>Contacted</span><span><span class="sw" style="background:#3f9d5f"></span>Won</span></div>' +
      '<div class="bar-chart">' + months.map((m) => {
        const added = S().db.leads.filter((l) => inRange(l.createdAt, m)).length;
        const contacted = S().db.leads.filter((l) => inRange(l.lastContacted, m)).length;
        const won = S().db.clients.filter((c) => inRange(c.createdAt, m)).length;
        const h = (v) => (v / max) * 100;
        const stack = [];
        if (added) stack.push('<div class="bar-seg" style="height:' + h(added) + '%;background:#8a8a90;opacity:.9"></div>');
        if (contacted) stack.push('<div class="bar-seg" style="height:' + h(contacted) + '%;background:#ed4217;opacity:.85"></div>');
        if (won) stack.push('<div class="bar-seg" style="height:' + h(won) + '%;background:#3f9d5f"></div>');
        return '<div class="bar-col"><div class="bar-stack">' + (stack.join("") || '<div class="bar-seg inactive" style="height:4px"></div>') + '</div><span class="bar-x">' + m.label + "</span></div>";
      }).join("") + "</div>";
  }

  function metrics() {
    const rows = S().leadRows();
    const total = rows.length;
    const contacted = contactedLeads().length;
    const responded = respondedLeads().length;
    const qualified = rows.filter((r) => ["qualified", "meeting", "proposal", "negotiation", "won"].includes(r.lead.stage)).length;
    const won = rows.filter((r) => r.lead.stage === "won").length;
    const proposals = S().db.proposals.length;
    const m = (label, val, sub, acc) => '<div class="metric' + (acc ? " acc" : "") + '"><div class="m-label">' + label + '</div><div class="m-value">' + val + "</div>" + (sub ? '<div class="m-sub">' + sub + "</div>" : "") + "</div>";
    return '<div class="metric-row">' +
      m("Outreach Rate", U().pct(contacted, total) + "%", contacted + " of " + total + " leads contacted") +
      m("Response Rate", U().pct(responded, Math.max(1, contacted)) + "%", responded + " of " + contacted + " replied") +
      m("Conversion Rate", U().pct(won, Math.max(1, qualified)) + "%", won + " of " + qualified + " qualified won") +
      m("Close Rate", U().pct(won, Math.max(1, proposals)) + "%", won + " of " + proposals + " proposals closed", true) +
      "</div>";
  }

  function welcome() {
    const name = (S().db.settings.profileName || "there").split(" ")[0];
    const rows = S().leadRows();
    const dueToday = S().db.followups.filter((f) => f.status === "pending" && U().dayStart(f.dueDate) === U().todayStart()).length;
    const dueOverdue = S().db.followups.filter((f) => f.status === "pending" && (f.dueDate || 0) < U().todayStart()).length;
    const hot = rows.filter((r) => r.leadScore >= 80 && !["won", "lost"].includes(r.lead.stage)).length;
    const won = rows.filter((r) => r.lead.stage === "won").length;
    const pipelineVal = S().pipelineValue();
    const subtitle = dueToday || dueOverdue
      ? "You have " + (dueToday + dueOverdue) + " follow-up" + (dueToday + dueOverdue > 1 ? "s" : "") + " due now" + (hot ? " and " + hot + " hot lead" + (hot > 1 ? "s" : "") + " ready for outreach." : ".")
      : "Here's what's happening with your outreach today.";
    return '<div class="hero">' +
      '<div style="position:relative;z-index:1;flex:1;min-width:260px">' +
      '<div class="h-eyebrow">Vision 61 Studios</div>' +
      '<h1>' + U().greeting() + ", " + U().escapeHtml(name) + ".</h1>" +
      '<p>' + U().escapeHtml(subtitle) + "</p>" +
      '<div class="h-stat"><span>' + I.trophy + " <b>" + won + "</b> won</span><span style='width:1px;height:16px;background:var(--border-2)'></span>" +
      '<span>' + I.zap + " <b>" + hot + "</b> hot</span><span style='width:1px;height:16px;background:var(--border-2)'></span>" +
      '<span>' + I.dollar + " <b>" + U().formatMoney(pipelineVal) + "</b> pipeline</span></div></div>" +
      '<div class="h-actions">' +
      '<button class="btn" data-cmd="go:#/discovery">' + I.scan + " Find Businesses</button>" +
      '<button class="btn btn-primary" data-cmd="addLead">' + I.plus + " Add Lead</button>" +
      "</div></div>";
  }

  function hotLeadsPanel() {
    const rows = S().leadRows().filter((r) => r.leadScore >= 70 && !["won", "lost"].includes(r.lead.stage)).sort((a, b) => b.leadScore - a.leadScore).slice(0, 5);
    return '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.zap + " Hot leads to contact" + '<span class="sub">' + rows.length + "</span></div></div>" +
      '<div class="panel-body"><div class="stack">' + (rows.length ? rows.map((r) => {
        const b = r.business || {};
        const wa = b.whatsapp || b.phone;
        return '<div class="row-card" style="padding:11px 13px"><div class="rc-main"><div class="rc-title" style="font-size:13px"><a href="#/leads/' + r.lead.id + '" style="color:inherit">' + U().escapeHtml(b.name) + "</a></div>" +
          '<div class="rc-sub">' + U().escapeHtml([b.category, b.city].filter(Boolean).join(" • ")) + ' · <b style="color:var(--accent)">' + U().formatMoney(r.lead.estimatedValue) + "</b></div></div>" +
          '<div class="rc-actions">' + UI.miniScore(r.leadScore) +
          (wa ? '<a class="btn btn-sm" target="_blank" rel="noopener" href="' + U().waLink(wa, S().buildMessage(b.name, b.category)) + '">' + I.whatsapp + "</a>" : "") + "</div></div>";
      }).join("") : '<div style="font-size:12.5px;color:var(--text-3)">No hot leads right now.</div>') + "</div></div></div>";
  }

  /* ── Phase 2 intelligence KPIs ── */
  function intelKpis() {
    const rows = S().leadRows();
    const audited = S().db.audits.length;
    const discovered = S().db.businesses.filter((b) => b.googlePlaceId || b.discoveryQuery || (b.source === "google-discovery")).length;
    const high = rows.filter((r) => S().isHighOpportunity(r)).length;
    const avg = (arr) => { const a = arr.filter((x) => x != null); return a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0; };
    const avgD = avg(rows.map((r) => r.digitalScore));
    const avgL = avg(rows.map((r) => r.leadScore));
    let web = 0, google = 0, conv = 0;
    rows.forEach((r) => { (V61.OpportunityEngine ? V61.OpportunityEngine.forRow(r) : []).forEach((o) => { if (/website/i.test(o.service)) web++; if (o.category === "Google") google++; if (o.category === "Conversion") conv++; }); });
    const card = (label, value, sub, icon, accent) => '<div class="kpi' + (accent ? " accent" : "") + '"><div class="k-label">' + U().escapeHtml(label) + '</div><div class="k-ic">' + (I[icon] || I.plus) + '</div><div class="k-value">' + value + '</div><div style="font-size:12px;color:var(--text-3);margin-top:5px">' + U().escapeHtml(sub || "") + "</div></div>";
    return '<div class="kpi-grid" style="margin-top:18px">' +
      card("Businesses Discovered", U().formatCompact(discovered), "from Google Places", "scan") +
      card("Audited", audited, "of " + rows.length + " leads", "clipboard") +
      card("High Opportunities", '<span style="color:var(--accent)">' + U().formatCompact(high) + "</span>", high ? "ready to prospect" : "none right now", "zap", true) +
      card("Avg Digital Score", avgD + "", "across audited leads", "pie") +
      card("Avg Lead Score", avgL + "", "across all leads", "trending") +
      card("Website Opps", web, "need a site or improvement", "globe") +
      card("Google Opps", google, "profile gaps", "mapPin") +
      card("Conversion Opps", conv, "WhatsApp / booking / forms", "whatsapp") +
      "</div>";
  }

  function highOppPanel() {
    const rows = S().leadRows().filter((r) => S().isHighOpportunity(r)).sort((a, b) => b.leadScore - a.leadScore).slice(0, 5);
    return '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.zap + " High opportunities" + '<span class="sub">' + rows.length + "</span></div>" +
      '<a class="btn btn-sm btn-ghost" href="#/audits">' + I.eye + " All</a></div>" +
      '<div class="panel-body"><div class="stack">' + (rows.length ? rows.map((r) => {
        const b = r.business || {};
        const opps = (V61.OpportunityEngine ? V61.OpportunityEngine.forRow(r) : []);
        return '<div class="row-card" style="padding:11px 13px"><div class="rc-main"><div class="rc-title" style="font-size:13px"><a href="#/audits/' + r.lead.id + '" style="color:inherit">' + U().escapeHtml(b.name) + "</a></div>" +
          '<div class="rc-sub">' + U().escapeHtml([b.category, b.city].filter(Boolean).join(" • ")) + " · " + opps.length + " opportunity" + (opps.length === 1 ? "" : "s") + "</div></div>" +
          '<div class="rc-actions">' + UI.miniScore(r.leadScore) + (opps.length ? '<span style="color:var(--accent);font-size:12px;font-weight:700">' + opps[0].service + "</span>" : "") + "</div></div>";
      }).join("") : '<div style="font-size:12.5px;color:var(--text-3)">No high-opportunity prospects right now. Discover or add businesses to find them.</div>') + "</div></div></div>";
  }

  function duePanel() {
    const pending = S().db.followups.filter((f) => f.status === "pending").sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0)).slice(0, 5);
    return '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.calendar + " Follow-ups due" + '<span class="sub">' + pending.length + "</span></div>" +
      '<a class="btn btn-sm btn-ghost" href="#/followups">' + I.eye + " All</a></div>" +
      '<div class="panel-body"><div class="stack">' + (pending.length ? pending.map((f) => {
        const lead = S().byId("leads", f.leadId);
        const biz = lead ? S().businessOf(lead) : null;
        const over = (f.dueDate || 0) < U().todayStart();
        return '<div class="assoc-row"><div style="flex-shrink:0;width:30px;height:30px;border-radius:8px;background:' + (over ? "var(--danger)" : "var(--accent-soft)") + ';color:' + (over ? "#fff" : "var(--accent)") + ';display:flex;align-items:center;justify-content:center">' + I.calendar + '</div>' +
          '<div class="a-main"><div class="a-title">' + U().escapeHtml(f.title) + '</div><div class="a-sub">' + (biz ? U().escapeHtml(biz.name) + " · " : "") + U().relativeDue(f.dueDate) + "</div></div>" +
          '<a class="btn btn-sm btn-ghost" href="#/leads/' + f.leadId + '">' + I.chevronR + "</a></div>";
      }).join("") : '<div style="font-size:12.5px;color:var(--text-3)">No follow-ups due.</div>') + "</div></div></div>";
  }

  function activityPanel() {
    const act = S().db.activity.slice(0, 6);
    const icons = { lead: I.plus, note: I.pencil, stage: I.filter, outreach: I.send, followup: I.calendar, task: I.checkSquare, contact: I.users, proposal: I.fileText, system: I.bell };
    return '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.clock + " Recent activity" + "</div></div>" +
      '<div class="panel-body"><div class="timeline">' + (act.length ? act.map((a) => {
        const lead = a.leadId ? S().byId("leads", a.leadId) : null;
        const biz = lead ? S().businessOf(lead) : null;
        return '<div class="tl-item' + (a.type === "note" ? " muted" : "") + '"><div class="tl-time">' + (icons[a.type] || I.clock) + U().relativeTime(a.createdAt) + "</div>" +
          '<div class="tl-text">' + U().escapeHtml(a.text) + (biz ? ' <a href="#/leads/' + lead.id + '" class="tl-strong">' + U().escapeHtml(biz.name) + "</a>" : "") + "</div></div>";
      }).join("") : '<div style="font-size:12.5px;color:var(--text-3)">No activity yet.</div>') + "</div></div></div>";
  }

  /* ── Phase 3: TODAY sales workspace ── */
  function todayWorkspace() {
    const now = U().now();
    const todayStart = U().todayStart();
    const tomorrow = todayStart + 86400e3;
    const dueToday = S().db.followups.filter((f) => f.status === "pending" && U().dayStart(f.dueDate) === todayStart);
    const overdue = S().db.followups.filter((f) => f.status === "pending" && (f.dueDate || 0) < todayStart);
    const meetingsToday = S().db.meetings.filter((m) => (m.date || 0) >= todayStart && (m.date || 0) < tomorrow && m.status !== "done");
    const toContact = S().leadRows().filter((r) => ["new", "researching"].includes(r.lead.stage));
    const awaiting = S().db.proposals.filter((p) => ["sent", "viewed"].includes(p.status));
    const due = dueToday.length + overdue.length;

    const cell = (icon, count, label, sub, route, accent) =>
      '<a class="td-cell' + (accent ? " accent" : "") + '" href="' + route + '"><span class="td-ic">' + (I[icon] || I.plus) + '</span>' +
      '<span class="td-num">' + count + "</span><span class='td-label'>" + U().escapeHtml(label) + '</span>' +
      (sub ? '<span class="td-sub">' + U().escapeHtml(sub) + "</span>" : "") + "</a>";

    const rows = [dueToday, overdue, ...meetingsToday].sort((a, b) => (a.dueDate || a.date || 0) - (b.dueDate || b.date || 0)).slice(0, 4);
    return '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.sun + " Today" + '<span class="sub">' + U().formatDate(now) + '</span></div>' +
      (rows.length ? '<a class="btn btn-sm btn-ghost" href="#/followups">' + I.calendar + " Open queue</a>" : "") + "</div>" +
      '<div class="panel-body"><div class="td-grid">' +
      cell("calendar", due, "Follow-ups due", (dueToday.length ? dueToday.length + " today" : "") + (dueToday.length && overdue.length ? " · " : "") + (overdue.length ? overdue.length + " overdue" : (due ? "" : "none")), "#/followups", !!due) +
      cell("video", meetingsToday.length, "Meetings today", meetingsToday.length ? "scheduled" : "none", meetingsToday.length ? "#/outreach" : "#/outreach", !!meetingsToday.length) +
      cell("send", toContact.length, "Leads to contact", "new & researching", "#/leads", !!toContact.length) +
      cell("fileText", awaiting.length, "Proposals pending", awaiting.length ? "awaiting decision" : "none", "#/proposals", !!awaiting.length) +
      "</div>" +
      (rows.length ? '<div class="td-list">' + rows.map((f) => {
        const lead = S().byId("leads", f.leadId);
        const biz = lead ? S().businessOf(lead) : null;
        const isMeeting = f.type !== undefined;
        const over = !isMeeting && (f.dueDate || 0) < todayStart;
        return '<a class="td-item" href="#/leads/' + f.leadId + '"><span class="td-dot" style="background:' + (isMeeting ? "#6b51b5" : over ? "#e5484d" : "#e0a53e") + '"></span>' +
          '<span class="td-main">' + U().escapeHtml(f.title || (f.type || "Meeting")) + '</span>' +
          '<span class="td-who">' + (biz ? U().escapeHtml(biz.name) : "") + "</span>" +
          '<span class="td-when">' + U().relativeDue(f.dueDate || f.date) + "</span></a>";
      }).join("") + "</div>" : "") + "</div></div>";
  }

  /* ── Phase 4 Operations ── */
  function attentionToday() {
    const today = U().todayStart();
    const tasks = S().db.projectTasks.filter(t => t.status !== 'done');
    const overdue = tasks.filter(t => t.dueDate && t.dueDate < today);
    const dueToday = tasks.filter(t => t.dueDate && U().dayStart(t.dueDate) === today);
    const invOverdue = S().db.invoices.filter(i => i.status === 'overdue');

    if (!overdue.length && !dueToday.length && !invOverdue.length) return "";

    return '<div class="panel" style="border-left:4px solid var(--danger)">' +
      '<div class="panel-head"><div class="panel-title" style="color:var(--danger)">' + I.alert + ' Needs Attention Today</div></div>' +
      '<div class="panel-body">' +
        '<div class="stack">' +
          overdue.map(t => attentionRow(t, "Overdue Task", "var(--danger)")).join("") +
          dueToday.map(t => attentionRow(t, "Due Today", "var(--warning)")).join("") +
          invOverdue.map(i => attentionRow({ ...i, title: "Invoice #" + i.invoiceNumber, id: i.id, projectId: i.projectId }, "Overdue Invoice", "var(--danger)", "#/invoices")).join("") +
        '</div>' +
      '</div></div>';
  }

  function attentionRow(item, label, color, customRoute) {
    const p = item.projectId ? S().projectOf(item.projectId) : null;
    const cl = p ? S().clientById(p.clientId) : (item.clientId ? S().clientById(item.clientId) : null);
    const biz = cl ? S().businessOf({ businessId: cl.businessId }) : null;
    const route = customRoute || (p ? "#/projects/" + p.id : "#/dashboard");

    return '<a href="' + route + '" class="row-card" style="padding:10px;text-decoration:none;color:inherit">' +
      '<div style="flex:1"><b>' + U().escapeHtml(item.title || "") + '</b>' +
      '<div class="rc-sub">' + (biz ? U().escapeHtml(biz.name) + " · " : "") + label + '</div></div>' +
      '<span style="color:' + color + ';font-size:12px;font-weight:700">' + (item.dueDate ? U().relativeDue(item.dueDate) : "OVERDUE") + '</span>' +
    '</a>';
  }

  function activeProjectsPanel() {
    const projs = S().db.projects.filter(p => !["completed", "cancelled"].includes(p.status)).slice(0, 5);
    return '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.briefcase + " Active projects" + '<span class="sub">' + projs.length + "</span></div>" +
      '<a class="btn btn-sm btn-ghost" href="#/projects">' + I.eye + " All</a></div>" +
      '<div class="panel-body"><div class="stack">' + (projs.length ? projs.map((p) => {
        const cl = S().clientById(p.clientId);
        const biz = S().businessOf({ businessId: cl.businessId });
        return '<div class="row-card" style="padding:11px 13px"><div class="rc-main"><div class="rc-title" style="font-size:13px"><a href="#/projects/' + p.id + '" style="color:inherit">' + U().escapeHtml(p.name) + "</a></div>" +
          '<div class="rc-sub">' + U().escapeHtml(biz.name) + ' · ' + p.progress + "% completed</div></div>" +
          '<div class="rc-actions"><div class="score-bar" style="width:60px;height:6px"><i style="width:' + p.progress + '%"></i></div></div></div>';
      }).join("") : '<div style="font-size:12.5px;color:var(--text-3)">No active projects.</div>') + "</div></div></div>";
  }

  function render() {
    const el = document.getElementById("content");
    el.innerHTML =
      welcome() +
      attentionToday() +
      todayWorkspace() +
      buildKpis() +
      intelKpis() +
      '<div class="dash-grid">' +
      '<div style="display:flex;flex-direction:column;gap:18px">' +
      activeProjectsPanel() +
      '<div class="panel chart-wrap"><div class="panel-head"><div class="panel-title">' + I.pie + "Outreach Performance" + '<span class="sub">Last 6 months</span></div></div><div class="panel-body">' + monthlyBars() + "</div></div>" +
      '<div class="panel chart-wrap"><div class="panel-head"><div class="panel-title">' + I.trending + "Sales Funnel" + '<span class="sub">All time</span></div></div><div class="panel-body">' + funnel() + "</div></div>" +
      "</div>" +
      '<div style="display:flex;flex-direction:column;gap:18px">' + hotLeadsPanel() + highOppPanel() + duePanel() + activityPanel() + "</div>" +
      "</div>" +
      '<div style="margin-top:18px">' + metrics() + "</div>";
    UI.bind(el);
  }

  V61.Pages.dashboard = render;
})();