/* VISION 61 CRM — Outreach: workspace, follow-ups, tasks, activities, meetings */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  const OE = () => V61.OutreachEngine;

  const TYPE_ICONS = { Call: I.phone, WhatsApp: I.whatsapp, Email: I.mail, Instagram: I.instagram, Facebook: I.facebook, SMS: I.send, Meeting: I.video, Proposal: I.fileText, "Follow-up": I.calendar, Note: I.pencil, Other: I.clock };

  function toLocalInput(ts) {
    const d = new Date(ts || U().now());
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function parseLocalInput(v) { return v ? new Date(v).getTime() : U().now(); }
  function dueAt(offsetDays) { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(9, 0, 0, 0); return d.getTime(); }

  const outcomeStatus = (outcome) => {
    const o = String(outcome || "");
    if (o === "Interested") return "interested";
    if (o === "Meeting requested") return "meeting_booked";
    if (o === "Not interested" || o === "Already has provider" || o === "Wrong contact") return "not_interested";
    if (o === "Asked for pricing" || o === "Asked for portfolio" || o === "Asked to call later") return "replied";
    return "contacted";
  };

  /* Advance stage only for confirmed positive signals (Part 17: no auto-assumption). */
  function advanceStage(lead, outcome, type) {
    if (!lead || ["won", "lost"].includes(lead.stage)) return false;
    const order = { new: 0, researching: 0, contacted: 1, responded: 2, qualified: 3, meeting: 4, proposal: 5, negotiation: 6 };
    let target = lead.stage;
    if (String(outcome || "") === "Interested" && (order[lead.stage] || 0) < 3) target = "qualified";
    if ((String(outcome || "") === "Meeting requested" || String(type || "") === "Meeting") && (order[lead.stage] || 0) < 4) target = "meeting";
    if (target !== lead.stage) { lead.stage = target; lead.updatedAt = U().now(); return true; }
    return false;
  }

  /* ── Shared modal bits: quick follow-up scheduling (Part 9) ── */
  function quickScheduleBody(existing) {
    const chips = [["today", "Today"], ["1", "Tomorrow"], ["3", "In 3 days"], ["7", "In 7 days"]];
    const chipsHtml = chips.map(([v, l]) => '<button class="btn btn-sm" data-qchip="' + v + '" type="button">' + l + "</button>").join("");
    return '<div class="field"><label>Schedule a follow-up</label>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + chipsHtml +
      '<input class="input" id="q-custom" type="date" style="width:auto"></div></div>' +
      '<div class="field"><label>Follow-up note (optional)</label><input class="input" id="q-note" placeholder="e.g. Send pricing options"></div>' +
      (existing ? '<p style="font-size:12px;color:var(--warn);margin-top:4px">This lead already has a pending follow-up. Scheduling again adds a new one — nothing is overwritten.</p>' : "");
  }
  function bindQuickChips(scope) {
    scope.querySelectorAll("[data-qchip]").forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.qchip;
      const dt = v === "today" ? new Date() : v === "1" ? new Date(Date.now() + 86400000) : new Date(Date.now() + Number(v) * 86400000);
      dt.setHours(9, 0, 0, 0);
      const custom = scope.querySelector("#q-custom");
      if (custom) custom.value = dt.toISOString().slice(0, 10);
      scope.querySelectorAll("[data-qchip]").forEach((x) => x.classList.toggle("btn-primary", x === b));
    }));
  }
  function dueFromScope(scope) {
    const custom = scope.querySelector("#q-custom");
    if (custom && custom.value) return new Date(custom.value + "T09:00:00").getTime();
    return null;
  }
  function scheduleFromScope(leadId, scope, titlePrefix) {
    const due = dueFromScope(scope);
    if (!due) return null;
    const note = (scope.querySelector("#q-note") && scope.querySelector("#q-note").value.trim()) || "";
    S().db.followups.push({ id: U().uid("f"), leadId, title: (note || titlePrefix + " follow-up"), dueDate: due, priority: "medium", status: "pending", notes: note });
    S().addActivity(leadId, "followup", "Follow-up scheduled: " + (note || titlePrefix + " follow-up"));
    return due;
  }

  /* ── Timeline events (Part 5) ── */
  function timelineEvents(leadId) {
    const events = [];
    S().outreachFor(leadId).forEach((o) => {
      const cs = S().contactStatusOf(o.status);
      events.push({ ts: o.contactedAt || 0, kind: "outreach", icon: TYPE_ICONS[o.activityType] || I.send, title: (o.activityType || o.channel || "Outreach"), status: cs, manual: o.manual ? true : false, message: o.message || "", notes: o.notes || "", outcome: o.outcome || "", id: o.id });
    });
    S().meetingsFor(leadId).forEach((m) => {
      events.push({ ts: m.date || 0, kind: "meeting", icon: I.video, title: "Meeting — " + (m.type || "Other"), status: null, manual: true, message: m.notes || "", notes: m.nextAction ? "Next: " + m.nextAction : "", id: m.id });
    });
    S().followupsFor(leadId).forEach((f) => {
      const st = S().followupState(f);
      events.push({ ts: f.dueDate || f.completedAt || 0, kind: "followup", icon: I.calendar, title: "Follow-up" + (f.title && f.title !== "Follow up" ? " — " + f.title : ""), status: st, manual: true, message: f.notes || "", id: f.id });
    });
    S().proposalsFor(leadId).forEach((p) => {
      events.push({ ts: p.createdAt || 0, kind: "proposal", icon: I.fileText, title: "Proposal created — " + (p.title || "Proposal"), status: null, manual: false, message: U().formatMoney(p.total), id: p.id });
    });
    S().notesFor(leadId).forEach((n) => {
      events.push({ ts: n.createdAt || 0, kind: "note", icon: I.pencil, title: "Note", status: null, manual: true, message: n.content || "", id: n.id });
    });
    return events.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  function timelineHtml(events) {
    if (!events.length) return '<div style="font-size:12.5px;color:var(--text-3)">No outreach activity yet.</div>';
    return '<div class="timeline">' + events.map((e) => {
      const when = e.ts ? U().formatDateTime(e.ts) : "";
      const badgeHtml = e.status && e.status.label ? UI.badge(e.status.label, e.status.color, true) : "";
      const manual = e.manual ? '<span class="tag" style="margin-left:4px">Manually recorded</span>' : "";
      return '<div class="tl-item' + (e.kind === "note" ? " muted" : "") + '"><div class="tl-time">' + (e.icon || I.clock) + when + manual + '</div>' +
        '<div class="tl-text"><span class="tl-strong">' + U().escapeHtml(e.title) + "</span> " + badgeHtml + "</div>" +
        (e.message ? '<div class="tl-note">' + U().escapeHtml(e.message) + "</div>" : "") +
        (e.notes ? '<div style="font-size:12px;color:var(--text-2);margin-top:4px">' + U().escapeHtml(e.notes) + "</div>" : "") + "</div>";
    }).join("") + "</div>";
  }

  /* ── Outreach workspace (Part 2) ── */
  function renderOutreach() {
    const el = document.getElementById("content");
    const all = [];
    S().leadRows().forEach((r) => {
      S().outreachFor(r.lead.id).forEach((o) => all.push({ o, lead: r.lead, business: r.business }));
    });
    all.sort((a, b) => (b.o.contactedAt || 0) - (a.o.contactedAt || 0));
    const byChannel = {};
    all.forEach((x) => { byChannel[x.o.channel || x.o.activityType || "Other"] = (byChannel[x.o.channel || x.o.activityType || "Other"] || 0) + 1; });
    const overdue = S().db.followups.filter((f) => f.status === "pending" && (f.dueDate || 0) < U().todayStart()).length;
    const today = S().db.followups.filter((f) => f.status === "pending" && U().dayStart(f.dueDate) === U().todayStart()).length;

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Outreach</div>' +
      '<h1 class="page-title">Outreach workspace</h1><p class="page-sub">' + all.length + " interaction" + (all.length === 1 ? "" : "s") + " across " + S().db.leads.length + " leads" + (overdue ? " · " + overdue + " overdue" : "") + (today ? " · " + today + " due today" : "") + "</p></div>" +
      '<div class="page-actions">' +
      '<button class="btn" data-cmd="pickLeadOutreach">' + I.send + " Log outreach</button>" +
      '<button class="btn" data-cmd="pickLeadFollowup">' + I.calendar + " Schedule follow-up</button>" +
      '<button class="btn btn-primary" data-cmd="addLead">' + I.plus + " Add Lead</button></div></div>" +
      (overdue || today ? '<div class="callout" style="margin-bottom:16px"><div class="c-ic">' + I.alert + '</div><div class="c-main"><div class="c-label">Follow-ups due now</div><div class="c-title">' + (overdue + today) + ' follow-up' + (overdue + today > 1 ? "s" : "") + ' need attention</div><div class="c-sub">' + (overdue ? overdue + " overdue · " : "") + (today ? today + " due today" : "") + '</div></div><div class="c-actions"><a class="btn btn-sm btn-primary" href="#/followups">' + I.eye + " Open follow-ups</a></div></div>" : "") +
      '<div class="grid-2-1"><div class="panel"><div class="panel-head"><div class="panel-title">' + I.send + ' Outreach history</div></div><div class="panel-body">' +
      (all.length ? '<div class="table-wrap" style="border:none"><table class="data" style="min-width:760px"><thead><tr><th>Date</th><th>Business</th><th>Channel</th><th>Status</th><th>Outcome</th><th>Message / response</th></tr></thead><tbody>' +
        all.map((x) => {
          const cs = S().contactStatusOf(x.o.status);
          return "<tr><td style='white-space:nowrap'><span class='cell-sub'>" + U().formatDateTime(x.o.contactedAt) + "</span>" +
            (x.o.manual ? "<div><span class='tag'>Manually recorded</span></div>" : "") + "</td>" +
            "<td><div class='b-name'><a href='#/leads/" + x.lead.id + "'>" + U().escapeHtml(x.business.name) + "</a></div><div class='b-cat'>" + U().escapeHtml(x.business.category || "") + "</div></td>" +
            "<td><span class='tag'>" + U().escapeHtml(x.o.activityType || x.o.channel || "Other") + "</span></td>" +
            "<td>" + UI.badge(cs.label, cs.color, true) + "</td>" +
            "<td><span class='cell-sub'>" + (x.o.outcome ? U().escapeHtml(x.o.outcome) : "—") + "</span></td>" +
            "<td style='max-width:300px'><span class='cell-sub' style='display:block;max-height:60px;overflow:hidden;text-overflow:ellipsis;white-space:normal'>" + U().escapeHtml(x.o.message || x.o.notes || "") + "</span></td></tr>";
        }).join("") + "</tbody></table></div>" : UI.emptyState("send", "No outreach activity yet.", "Log your first WhatsApp message, call or email to start tracking responses.", '<button class="btn btn-primary" data-cmd="pickLeadOutreach">' + I.send + " Log outreach</button>")) +
      "</div></div>" +
      '<div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.layers + ' By channel</div></div><div class="panel-body"><div class="stack">' +
      (Object.keys(byChannel).length ? Object.entries(byChannel).sort((a, b) => b[1] - a[1]).map(([ch, n]) => {
        const max = Math.max(1, ...Object.values(byChannel));
        return '<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span>' + U().escapeHtml(ch) + '</span><b>' + n + "</b></div><div class='progress'><i style='width:" + Math.round((n / max) * 100) + "%;background:var(--accent)'></i></div></div>";
      }).join("") : '<div style="font-size:12.5px;color:var(--text-3)">No channels yet.</div>') + "</div></div></div>" +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.rocket + ' Quick actions</div></div><div class="panel-body">' +
      '<div class="stack"><button class="btn block" data-cmd="pickLeadOutreach">' + I.send + " Log an outreach activity</button>" +
      '<button class="btn block" data-cmd="pickLeadFollowup">' + I.calendar + " Schedule a follow-up</button>" +
      '<button class="btn block" data-cmd="pickLeadDraft">' + I.pencil + " Generate an outreach message</button></div></div></div>" +
      "</div></div>";
    UI.bind(el);
  }

  /* ── Follow-ups queue (Part 8) ── */
  function renderFollowups() {
    const el = document.getElementById("content");
    const now = U().todayStart();
    const all = S().db.followups.slice().sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
    const group = (f) => {
      if (f.status === "done") return "completed";
      if (f.status === "cancelled") return "cancelled";
      if ((f.dueDate || 0) < now) return "overdue";
      if (U().dayStart(f.dueDate) === now) return "today";
      return "upcoming";
    };
    const tabs = [["today", "Due today"], ["overdue", "Overdue"], ["upcoming", "Upcoming"], ["completed", "Completed"]];
    let active = "today";
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Outreach</div>' +
      '<h1 class="page-title">Follow-ups</h1><p class="page-sub">' + all.filter((f) => f.status === "pending").length + " pending follow-ups</p></div></div>" +
      '<div class="tabs">' + tabs.map(([k, l]) => '<button class="' + (active === k ? "active" : "") + '" data-ftab="' + k + '">' + l + ' <span class="tag">' + all.filter((f) => group(f) === k).length + "</span></button>").join("") + "</div>" +
      '<div data-flist></div>';
    function renderList() {
      const list = el.querySelector("[data-flist]");
      const items = all.filter((f) => group(f) === active);
      if (!items.length) {
        list.innerHTML = UI.emptyState("calendar", active === "completed" ? "Nothing completed yet." : active === "overdue" ? "Nothing overdue — great." : "You're all caught up.", active === "today" ? "No follow-ups due today. Schedule one from any lead to stay on top of outreach." : "Schedule a follow-up from any lead to stay on top of outreach.");
        return;
      }
      list.innerHTML = '<div class="stack">' + items.map((f) => {
        const lead = S().byId("leads", f.leadId);
        const row = lead ? S().leadRows().find((r) => r.lead.id === lead.id) : null;
        const biz = row ? row.business : null;
        const st = S().followupState(f);
        const last = S().lastInteractionFor(f.leadId);
        return '<div class="row-card" style="border-left:3px solid ' + st.color + '"><div style="flex:1;min-width:0">' +
          '<div class="rc-title">' + U().escapeHtml(f.title) + UI.badge(st.label, st.color, true) + "</div>" +
          '<div class="rc-sub">' + (biz ? '<a href="#/leads/' + lead.id + '">' + U().escapeHtml(biz.name) + "</a>" : "Lead removed") +
          " · contact: " + U().escapeHtml(S().contactNameFor(f.leadId)) +
          (row ? " · lead score <b>" + row.leadScore + "</b>" : "") +
          (last ? " · last interaction " + U().relativeTime(last) : "") + "</div>" +
          (f.notes ? '<div style="margin-top:4px;font-size:12px;color:var(--text-2)">' + U().escapeHtml(f.notes) + "</div>" : "") +
          '<div style="margin-top:6px"><span class="kb-due ' + (st.key === "overdue" ? "overdue" : "") + '">' + I.clock + " " + U().formatDate(f.dueDate) + " (" + U().relativeDue(f.dueDate) + ")</span></div></div>" +
          '<div class="rc-actions">' +
          (biz ? '<a class="btn btn-sm" href="#/leads/' + lead.id + '">' + I.eye + " Open lead</a>" : "") +
          (f.status === "pending" ? '<button class="btn btn-sm btn-primary" data-cmd="completeFollowup:' + f.id + '">' + I.check + " Complete</button>" : "") +
          (f.status === "pending" ? '<button class="btn btn-sm" data-cmd="reschedFollowup:' + f.id + '">' + I.refresh + " Reschedule</button>" : "") +
          (biz ? '<button class="btn btn-sm" data-cmd="addActivityLog:' + lead.id + '">' + I.send + " Add activity</button>" : "") +
          (f.status === "pending" ? '<button class="icon-btn" data-cmd="cancelFollowup:' + f.id + '" title="Cancel">' + I.x + "</button>" : "") +
          '<button class="icon-btn" data-cmd="delFollowup:' + f.id + '">' + I.trash + "</button></div></div>";
      }).join("") + "</div>";
      UI.bind(list);
    }
    renderList();
    el.querySelectorAll("[data-ftab]").forEach((b) => b.addEventListener("click", () => {
      active = b.dataset.ftab;
      el.querySelectorAll("[data-ftab]").forEach((x) => x.classList.toggle("active", x === b));
      renderList();
    }));
  }

  /* ── Tasks (unchanged) ── */
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

  /* ── Lead picker for workspace actions ── */
  function pickLead(title, action) {
    const rows = S().leadRows().sort((a, b) => b.leadScore - a.leadScore);
    const m = UI.openModal({ title: title, icon: I.search, size: "lg" });
    m.setBody('<div class="field"><input class="input" id="pick-q" placeholder="Search businesses..."></div><div class="stack" id="pick-list">' +
      (rows.length ? rows.slice(0, 40).map((r) => {
        const b = r.business || {};
        return '<div class="row-card" style="cursor:pointer" data-pick="' + r.lead.id + '"><div style="flex:1;min-width:0"><div class="rc-title">' + U().escapeHtml(b.name) + '</div><div class="rc-sub">' + U().escapeHtml([b.category, b.city].filter(Boolean).join(" • ") || "No category") + " · lead score " + r.leadScore + "</div></div>" + UI.miniScore(r.leadScore) + "</div>";
      }).join("") : UI.emptyState("users", "No leads yet.", "Add a lead first.")) + "</div>");
    m.setFoot('<button class="btn" data-cancel>Cancel</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    const q = m.body.querySelector("#pick-q");
    if (q) q.addEventListener("input", U().debounce(() => {
      const t = q.value.toLowerCase();
      const list = m.body.querySelector("#pick-list");
      const filt = rows.filter((r) => { const b = r.business || {}; return [b.name, b.category, b.city].filter(Boolean).some((f) => String(f).toLowerCase().includes(t)); }).slice(0, 40);
      list.innerHTML = filt.length ? filt.map((r) => {
        const b = r.business || {};
        return '<div class="row-card" style="cursor:pointer" data-pick="' + r.lead.id + '"><div style="flex:1;min-width:0"><div class="rc-title">' + U().escapeHtml(b.name) + '</div><div class="rc-sub">' + U().escapeHtml([b.category, b.city].filter(Boolean).join(" • ") || "No category") + " · lead score " + r.leadScore + "</div></div>" + UI.miniScore(r.leadScore) + "</div>";
      }).join("") : '<div style="color:var(--text-3);font-size:13px;padding:14px 0">No matches.</div>';
      m.body.querySelectorAll("[data-pick]").forEach((x) => x.addEventListener("click", () => { action(x.dataset.pick); m.close(); }));
    }, 150));
    m.body.querySelectorAll("[data-pick]").forEach((x) => x.addEventListener("click", () => { action(x.dataset.pick); m.close(); }));
  }

  /* ── Add Activity modal (Part 6) ── */
  function addActivityLog(leadId) {
    const lead = S().byId("leads", leadId);
    if (!lead) return;
    const biz = S().businessOf(lead);
    const hasPending = S().followupsFor(leadId).some((f) => f.status === "pending");
    const outcomes = S().db.settings.responseOutcomes || [];
    const m = UI.openModal({ title: "Add Activity — " + (biz ? biz.name : ""), icon: I.send, size: "lg" });
    m.setBody(
      '<div class="field-row"><div class="field"><label>Activity type</label><select class="select" id="a-type">' + S().ACTIVITY_TYPES.map((t) => "<option>" + t + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Date & time</label><input class="input" id="a-date" type="datetime-local" value="' + toLocalInput(U().now()) + '"></div></div>' +
      '<div class="field"><label>Outcome</label><select class="select" id="a-outcome"><option value="">—</option>' + outcomes.map((o) => "<option>" + U().escapeHtml(o) + "</option>").join("") + "</select>" +
      '<div class="hint">Interested moves the lead to the Interested stage; Meeting requested moves it to Meeting.</div></div>' +
      '<div class="field"><label>Message / response</label><textarea class="textarea" id="a-message" rows="3"></textarea></div>' +
      '<div class="field"><label>Notes</label><textarea class="textarea" id="a-notes" rows="2"></textarea></div>' +
      '<div class="panel" style="padding:12px;margin-top:6px">' + quickScheduleBody(hasPending) + "</div>"
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>' + I.check + " Save Activity</button>");
    bindQuickChips(m.body);
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const type = m.body.querySelector("#a-type").value;
      const when = parseLocalInput(m.body.querySelector("#a-date").value);
      const outcome = m.body.querySelector("#a-outcome").value;
      const message = m.body.querySelector("#a-message").value.trim();
      const notes = m.body.querySelector("#a-notes").value.trim();
      const status = outcomeStatus(outcome);
      S().db.outreach.push({ id: U().uid("o"), leadId, channel: type, activityType: type, status, outcome: outcome || "", message, notes, contactedAt: when, manual: true });
      lead.lastContacted = when; lead.updatedAt = U().now();
      if (type === "Meeting") {
        S().addMeeting(leadId, { date: when, type: m.body.querySelector("#a-type").options[0] ? "Phone" : "Other", notes: notes || message, outcome: outcome || "", nextAction: "" });
        if (lead.stage === "qualified") { lead.stage = "meeting"; }
      }
      if (type === "Note") { S().db.notes.push({ id: U().uid("n"), leadId, content: notes || message, createdAt: when }); }
      const moved = advanceStage(lead, outcome, type);
      scheduleFromScope(leadId, m.body, type + " follow-up");
      S().addActivity(leadId, "outreach", type + " activity logged (" + S().contactStatusOf(status).label + (outcome ? " — " + outcome : "") + ").");
      S().save(); m.close(); V61.Toast.success("Activity saved");
      refresh();
    });
  }

  /* ── Mark as Contacted (Part 16) ── */
  function markContacted(leadId) {
    const lead = S().byId("leads", leadId);
    if (!lead) return;
    const biz = S().businessOf(lead);
    const m = UI.openModal({ title: "Mark as Contacted — " + (biz ? biz.name : ""), icon: I.send });
    m.setBody(
      '<div class="field"><label>Channel</label><select class="select" id="mc-channel">' + S().CHANNELS.map((c) => "<option>" + c + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Date & time</label><input class="input" id="mc-date" type="datetime-local" value="' + toLocalInput(U().now()) + '"></div>' +
      '<div class="field"><label>Message sent / notes</label><textarea class="textarea" id="mc-notes" rows="3"></textarea></div>' +
      '<div class="panel" style="padding:12px">' + quickScheduleBody(S().followupsFor(leadId).some((f) => f.status === "pending")) + "</div>"
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>' + I.check + " Mark Contacted</button>");
    bindQuickChips(m.body);
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const channel = m.body.querySelector("#mc-channel").value;
      const when = parseLocalInput(m.body.querySelector("#mc-date").value);
      const notes = m.body.querySelector("#mc-notes").value.trim();
      S().db.outreach.push({ id: U().uid("o"), leadId, channel, activityType: channel, status: "contacted", outcome: "", message: notes, notes, contactedAt: when, manual: true });
      lead.lastContacted = when; lead.updatedAt = U().now();
      if (["new", "researching"].includes(lead.stage)) lead.stage = "contacted";
      scheduleFromScope(leadId, m.body, "Contact follow-up");
      S().addActivity(leadId, "outreach", "Marked as contacted via " + channel + ".");
      S().save(); m.close(); V61.Toast.success("Lead marked as contacted");
      refresh();
    });
  }

  /* ── Outreach draft generator (Parts 11–15, 38) ── */
  function generateOutreach(leadId) {
    const lead = S().byId("leads", leadId);
    if (!lead) return;
    const row = S().leadRows().find((r) => r.lead.id === leadId);
    const biz = S().businessOf(lead);
    const m = UI.openModal({ title: "Generate Outreach — " + (biz ? biz.name : ""), icon: I.rocket, size: "modal-xl" });
    const channels = ["WhatsApp", "Email", "Instagram", "LinkedIn"];
    let current = OE().generate(row, { channel: "WhatsApp" });

    function setDraft(g) {
      current = g;
      const subj = m.body.querySelector("#g-subject");
      if (subj) subj.value = g.subject || "";
      m.body.querySelector("#g-message").value = g.message;
      const ev = m.body.querySelector("#g-evidence");
      const evLines = g.evidence && g.evidence.length ? g.evidence.map((e) => "✓ " + e).join("\n") : "Run a digital audit to unlock evidence-based messaging.";
      ev.textContent = evLines;
      const ai = m.body.querySelector("#g-ai");
      if (ai) ai.innerHTML = g.ai && g.ai.enabled ? '<span style="color:var(--ok)">AI generation configured (' + U().escapeHtml(g.ai.label) + ")</span>" : '<span style="color:var(--text-3)">AI generation not configured — using deterministic template based on real CRM data.</span>';
      m.body.querySelector("#g-tplname").textContent = g.templateName;
      m.body.querySelector("#g-tpl").value = g.templateName;
    }

    m.setBody(
      '<div class="field-row"><div class="field"><label>Channel</label><select class="select" id="g-channel">' + channels.map((c) => "<option>" + c + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Template</label><select class="select" id="g-tpl"></select></div></div>' +
      '<div class="field"><label>Subject (email only)</label><input class="input" id="g-subject"></div>' +
      '<div class="field"><label>Draft message</label><textarea class="textarea" id="g-message" rows="7"></textarea>' +
      '<div style="font-size:12px;color:var(--text-3);margin-top:4px">Review before sending — copy it into WhatsApp, email or DM and send it yourself. Nothing is sent automatically.</div></div>' +
      '<div class="panel" style="padding:12px;margin-top:8px"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:12px">MESSAGE BASED ON</b><span id="g-tplname" style="font-size:11px;color:var(--text-3)"></span></div>' +
      '<pre id="g-evidence" style="white-space:pre-wrap;font-family:inherit;font-size:12px;color:var(--text-2);margin-top:6px;line-height:1.5"></pre>' +
      '<div id="g-ai" style="font-size:11.5px;margin-top:6px"></div></div>'
    );
    m.setFoot(
      '<button class="btn" data-cancel>Cancel</button>' +
      '<button class="btn" data-use-template>Use template</button>' +
      '<button class="btn" data-regenerate>' + I.refresh + " Regenerate</button>" +
      '<button class="btn" data-save-draft>' + I.download + " Save Draft</button>" +
      '<button class="btn" data-copy>' + I.copy + " Copy</button>" +
      '<button class="btn btn-primary" data-send-draft>' + I.check + " Mark as contacted with this</button>"
    );

    const chSel = m.body.querySelector("#g-channel");
    const tplSel = m.body.querySelector("#g-tpl");
    function refreshTemplates() {
      const tpls = S().activeTemplates().filter((t) => t.channel === chSel.value);
      const built = S().DEFAULT_TEMPLATES.filter((t) => t.channel === chSel.value);
      const merged = (tpls.length ? tpls : built);
      tplSel.innerHTML = merged.map((t) => '<option value="' + t.id + '">' + U().escapeHtml(t.name) + "</option>").join("");
      const g = OE().generate(row, { channel: chSel.value, templateId: merged[0] ? merged[0].id : null });
      setDraft(g);
    }
    refreshTemplates();
    chSel.addEventListener("change", refreshTemplates);
    tplSel.addEventListener("change", () => { const g = OE().generate(row, { channel: chSel.value, templateId: tplSel.value }); setDraft(g); });
    m.body.querySelector("[data-regenerate]").addEventListener("click", () => { const g = OE().generate(row, { channel: chSel.value, templateId: tplSel.value }); setDraft(g); });
    m.body.querySelector("[data-use-template]").addEventListener("click", refreshTemplates);
    m.body.querySelector("[data-copy]").addEventListener("click", async () => {
      const ok = await U().copyText(m.body.querySelector("#g-message").value);
      V61.Toast.success(ok ? "Draft copied" : "Could not copy");
    });
    m.body.querySelector("[data-save-draft]").addEventListener("click", () => {
      S().saveOutreachDraft(leadId, { channel: chSel.value, subject: m.body.querySelector("#g-subject").value.trim(), message: m.body.querySelector("#g-message").value, evidence: current.evidence });
      S().save(); V61.Toast.success("Draft saved");
    });
    m.body.querySelector("[data-send-draft]").addEventListener("click", () => {
      const when = U().now();
      const status = outcomeStatus("");
      S().db.outreach.push({ id: U().uid("o"), leadId, channel: chSel.value, activityType: chSel.value, status, outcome: "", message: m.body.querySelector("#g-message").value, notes: "Sent via " + chSel.value, contactedAt: when, manual: true, draft: true });
      lead.lastContacted = when; lead.updatedAt = U().now();
      if (["new", "researching"].includes(lead.stage)) lead.stage = "contacted";
      S().addActivity(leadId, "outreach", chSel.value + " outreach sent (generated draft).");
      S().save(); m.close(); V61.Toast.success("Outreach logged — lead marked contacted");
      refresh();
    });
    m.q("[data-cancel]").addEventListener("click", () => m.close());
  }

  /* ── Log meeting (Part 18) ── */
  function logMeeting(leadId) {
    const lead = S().byId("leads", leadId);
    if (!lead) return;
    const biz = S().businessOf(lead);
    const m = UI.openModal({ title: "Log Meeting — " + (biz ? biz.name : ""), icon: I.video });
    m.setBody(
      '<div class="field-row"><div class="field"><label>Date & time</label><input class="input" id="mt-date" type="datetime-local" value="' + toLocalInput(U().now()) + '"></div>' +
      '<div class="field"><label>Type</label><select class="select" id="mt-type">' + S().MEETING_TYPES.map((t) => "<option>" + t + "</option>").join("") + "</select></div></div>" +
      '<div class="field"><label>Notes</label><textarea class="textarea" id="mt-notes" rows="3"></textarea></div>' +
      '<div class="field"><label>Outcome</label><select class="select" id="mt-outcome"><option value="">—</option>' + (S().db.settings.responseOutcomes || []).map((o) => "<option>" + U().escapeHtml(o) + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Next action</label><input class="input" id="mt-next" placeholder="e.g. Send proposal, call back Friday"></div>'
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>' + I.check + " Save Meeting</button>");
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const date = parseLocalInput(m.body.querySelector("#mt-date").value);
      const type = m.body.querySelector("#mt-type").value;
      const notes = m.body.querySelector("#mt-notes").value.trim();
      const outcome = m.body.querySelector("#mt-outcome").value;
      const nextAction = m.body.querySelector("#mt-next").value.trim();
      S().addMeeting(leadId, { date, type, notes, outcome, nextAction });
      S().db.outreach.push({ id: U().uid("o"), leadId, channel: type, activityType: "Meeting", status: outcomeStatus(outcome), outcome, message: notes, notes: nextAction ? "Next: " + nextAction : "", contactedAt: date, manual: true });
      lead.lastContacted = date; lead.updatedAt = U().now();
      const moved = advanceStage(lead, outcome, "Meeting");
      if (nextAction) S().db.followups.push({ id: U().uid("f"), leadId, title: nextAction, dueDate: dueAt(3), priority: "medium", status: "pending", notes: "" });
      S().addActivity(leadId, "outreach", "Meeting logged (" + type + ").");
      S().save(); m.close(); V61.Toast.success("Meeting saved");
      refresh();
    });
  }

  /* ── Quick follow-up (Part 9) ── */
  function quickFollowup(leadId) {
    const lead = S().byId("leads", leadId);
    if (!lead) return;
    const biz = S().businessOf(lead);
    const pending = S().followupsFor(leadId).filter((f) => f.status === "pending");
    const m = UI.openModal({ title: "Schedule Follow-up — " + (biz ? biz.name : ""), icon: I.calendar });
    m.setBody(
      (pending.length ? '<div class="panel" style="padding:12px;margin-bottom:10px"><b style="font-size:12px">Existing pending follow-ups</b><div class="stack" style="margin-top:6px">' +
        pending.map((f) => '<div style="font-size:12.5px;display:flex;justify-content:space-between;gap:8px"><span>' + U().escapeHtml(f.title) + '</span><span class="kb-due ' + (f.dueDate < U().todayStart() ? "overdue" : "") + '">' + U().formatDate(f.dueDate) + "</span></div>").join("") +
        '</div><p style="font-size:11.5px;color:var(--text-3);margin-top:6px">Scheduling below adds a new follow-up — existing ones are never overwritten silently.</p></div>' : "") +
      '<div class="field"><label>Reason / next action</label><input class="input" id="f-title" placeholder="e.g. Send pricing options"></div>' +
      '<div class="field"><label>Due date</label><input class="input" id="f-due" type="date"></div>' +
      '<div class="field"><label>Quick schedule</label><div style="display:flex;gap:6px;flex-wrap:wrap">' +
      ['<button class="btn btn-sm" data-qchip="0" type="button">Today</button>', '<button class="btn btn-sm" data-qchip="1" type="button">Tomorrow</button>', '<button class="btn btn-sm" data-qchip="3" type="button">In 3 days</button>', '<button class="btn btn-sm" data-qchip="7" type="button">In 7 days</button>'].join("") + "</div></div>" +
      '<div class="field-row"><div class="field"><label>Priority</label><select class="select" id="f-pri"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></div>' +
      '<div class="field"><label>Notes</label><input class="input" id="f-notes"></div></div>'
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Schedule</button>');
    m.body.querySelectorAll("[data-qchip]").forEach((b) => b.addEventListener("click", () => {
      const dt = new Date(Date.now() + Number(b.dataset.qchip) * 86400000);
      dt.setHours(9, 0, 0, 0);
      m.body.querySelector("#f-due").value = dt.toISOString().slice(0, 10);
      m.body.querySelectorAll("[data-qchip]").forEach((x) => x.classList.toggle("btn-primary", x === b));
    }));
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const title = m.body.querySelector("#f-title").value.trim() || "Follow up";
      const due = m.body.querySelector("#f-due").value;
      S().db.followups.push({ id: U().uid("f"), leadId, title, dueDate: due ? new Date(due + "T09:00:00").getTime() : null, priority: m.body.querySelector("#f-pri").value, status: "pending", notes: m.body.querySelector("#f-notes").value.trim() });
      S().addActivity(leadId, "followup", "Follow-up scheduled: " + title);
      S().save(); m.close(); V61.Toast.success("Follow-up scheduled");
      refresh();
    });
  }

  function refresh() { if (V61.App) V61.App.renderRoute(); }

  /* ── Commands ── */
  V61.Cmd = V61.Cmd || {};
  Object.assign(V61.Cmd, {
    pickLeadOutreach: () => pickLead("Log outreach for which lead?", (id) => addActivityLog(id)),
    pickLeadFollowup: () => pickLead("Schedule follow-up for which lead?", (id) => quickFollowup(id)),
    pickLeadDraft: () => pickLead("Generate outreach for which lead?", (id) => generateOutreach(id)),
    addActivityLog,
    markContacted,
    generateOutreach,
    logMeeting,
    quickFollowup,
    cancelFollowup: (id) => { S().cancelFollowup(id); S().save(); V61.Toast.success("Follow-up cancelled"); refresh(); },
    reactivate: (id) => { S().reactivateLead(id); S().save(); V61.Toast.success("Lead reactivated"); refresh(); },
  });

  V61.Pages.outreach = renderOutreach;
  V61.Pages.followups = renderFollowups;
  V61.Pages.tasks = renderTasks;
  V61.Pages.outreach._internal = { timelineEvents, timelineHtml, markContacted, generateOutreach, addActivityLog };
})();