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
      '<div class="k-label">' + (I[icon] || I.plus) + U().escapeHtml(label) + "</div>" +
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

    const cards = [
      kpi("Total Leads", U().formatCompact(total), pctDelta(createdThis, createdLast), createdThis >= createdLast ? "up" : "down", "this month", "users"),
      kpi("New Leads", U().formatCompact(createdThis), pctDelta(createdThis, createdLast), createdThis >= createdLast ? "up" : "down", "vs last month", "zap"),
      kpi("Contacted", U().formatCompact(contacted), pctDelta(contactedThis, contactedLast), contactedThis >= contactedLast ? "up" : "down", "this month", "send"),
      kpi("Follow-ups Due", due, null, "flat", overdue ? overdue + " overdue" : "all on time", "calendar", overdue ? true : false),
      kpi("Qualified", U().formatCompact(qualified), null, "flat", "active deals", "star"),
      kpi("Proposals Sent", U().formatCompact(proposalsSent), null, "flat", "awaiting decisions", "fileText"),
      kpi("Won", U().formatCompact(won), pctDelta(wonThis, wonLast), wonThis >= wonLast ? "up" : "down", "this month", "trophy"),
      kpi("Revenue Pipeline", U().formatMoney(pipelineVal), null, "flat", rows.length + " deals", "dollar", true),
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

  function actionsHtml() {
    return '<div class="page-actions">' +
      '<button class="btn" data-cmd="go:#/discovery">' + I.scan + " Find Businesses</button>" +
      '<button class="btn btn-primary" data-cmd="addLead">' + I.plus + " Add Lead</button>" +
      "</div>";
  }

  function welcome() {
    const name = (S().db.settings.profileName || "there").split(" ")[0];
    const rows = S().leadRows();
    const dueToday = S().db.followups.filter((f) => f.status === "pending" && U().dayStart(f.dueDate) === U().todayStart()).length;
    const hot = rows.filter((r) => r.leadScore >= 80 && !["won", "lost"].includes(r.lead.stage)).length;
    const subtitle = dueToday ? "You have " + dueToday + " follow-up" + (dueToday > 1 ? "s" : "") + " due today." + (hot ? " And " + hot + " hot lead" + (hot > 1 ? "s" : "") + " ready for outreach." : "") : "Here's what's happening with your outreach today.";
    return '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Vision 61 Studios</div>' +
      '<h1 class="page-title">' + U().greeting() + ", " + U().escapeHtml(name) + ".</h1>" +
      '<p class="page-sub">' + U().escapeHtml(subtitle) + "</p></div>" + actionsHtml() + "</div>";
  }

  function render() {
    const el = document.getElementById("content");
    el.innerHTML =
      welcome() +
      buildKpis() +
      '<div class="chart-grid">' +
      '<div class="panel chart-wrap"><div class="panel-head"><div class="panel-title">' + I.pie + "Outreach Performance" + '<span class="sub">Last 6 months</span></div></div><div class="panel-body">' + monthlyBars() + "</div></div>" +
      '<div class="panel chart-wrap"><div class="panel-head"><div class="panel-title">' + I.trending + "Sales Funnel" + '<span class="sub">All time</span></div></div><div class="panel-body">' + funnel() + "</div></div>" +
      "</div>" +
      '<div style="margin-top:18px">' + metrics() + "</div>";
    UI.bind(el);
  }

  V61.Pages.dashboard = render;
})();