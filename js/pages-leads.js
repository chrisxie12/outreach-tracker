/* VISION 61 CRM — Leads: list (table/kanban/grid), filters, bulk ops, lead detail */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  const state = { view: "table", query: "", cat: "all", loc: "all", stage: "all", contact: "all", temp: "all", sort: "newest", selected: new Set(), tempDrop: null };

  function catList() { return [...new Set(S().db.businesses.map((b) => b.category).filter(Boolean))].sort(); }
  function locList() { return [...new Set(S().db.businesses.map((b) => b.city).filter(Boolean))].sort(); }

  function filteredRows() {
    let rows = S().leadRows();
    const q = state.query.toLowerCase();
    if (q) rows = rows.filter((r) => {
      const b = r.business || {};
      return [b.name, b.category, b.city, b.address, b.phone, b.email, r.lead.notes, b.notes].filter(Boolean).some((f) => String(f).toLowerCase().includes(q));
    });
    if (state.cat !== "all") rows = rows.filter((r) => (r.business && r.business.category) === state.cat);
    if (state.loc !== "all") rows = rows.filter((r) => (r.business && r.business.city) === state.loc);
    if (state.stage !== "all") rows = rows.filter((r) => r.lead.stage === state.stage);
    if (state.temp !== "all") rows = rows.filter((r) => (r.temperature || S().temperatureFor(r.leadScore)) === state.temp);
    if (state.contact !== "all") rows = rows.filter((r) => {
      const c = r.lead.stage;
      if (state.contact === "contacted") return !["new", "researching", "lost"].includes(c);
      if (state.contact === "not_contacted") return ["new", "researching"].includes(c);
      return true;
    });
    const key = { newest: (r) => -r.lead.createdAt, name: (r) => (r.business && r.business.name || "").toLowerCase(), score: (r) => -r.leadScore, value: (r) => -(r.lead.estimatedValue || 0) }[state.sort];
    return rows.slice().sort((a, b) => (key(a) < key(b) ? -1 : 1));
  }

  function filtersActive() {
    return state.query || state.cat !== "all" || state.loc !== "all" || state.stage !== "all" || state.temp !== "all" || state.contact !== "all";
  }

  /* ── Lead form modal ── */
  function openLeadForm(existing) {
    const b = existing ? S().byId("businesses", existing.businessId) : null;
    const m = UI.openModal({ title: existing ? "Edit Lead" : "Add Lead", icon: existing ? I.pencil : I.plus, size: "lg" });
    const cats = catList().map((c) => '<option' + (b && b.category === c ? " selected" : "") + ">" + U().escapeHtml(c) + "</option>").join("");
    m.setBody(
      '<div class="field"><label>Business name *</label><input class="input" id="f-name" value="' + U().escapeHtml(b ? b.name : "") + '" placeholder="e.g. Business name"></div>' +
      '<div class="field-row"><div class="field"><label>Category</label><input class="input" id="f-cat" list="cat-list" value="' + U().escapeHtml(b ? b.category : "") + '" placeholder="e.g. Restaurant"><datalist id="cat-list">' + cats + "</datalist></div>" +
      '<div class="field"><label>City / Area</label><input class="input" id="f-city" value="' + U().escapeHtml(b ? b.city : "") + '" placeholder="e.g. Osu, Accra"></div></div>' +
      '<div class="field"><label>Address</label><input class="input" id="f-address" value="' + U().escapeHtml(b ? b.address : "") + '"></div>' +
      '<div class="field-row"><div class="field"><label>Phone</label><input class="input" id="f-phone" value="' + U().escapeHtml(b ? b.phone : "") + '" placeholder="+233 ..."></div>' +
      '<div class="field"><label>WhatsApp</label><input class="input" id="f-wa" value="' + U().escapeHtml(b ? b.whatsapp : "") + '"></div></div>' +
      '<div class="field-row"><div class="field"><label>Email</label><input class="input" id="f-email" value="' + U().escapeHtml(b ? b.email : "") + '"></div>' +
      '<div class="field"><label>Website</label><input class="input" id="f-website" value="' + U().escapeHtml(b ? b.website : "") + '"></div></div>' +
      '<div class="field-row"><div class="field"><label>Instagram URL</label><input class="input" id="f-ig" value="' + U().escapeHtml(b ? b.instagramUrl : "") + '"></div>' +
      '<div class="field"><label>Facebook URL</label><input class="input" id="f-fb" value="' + U().escapeHtml(b ? b.facebookUrl : "") + '"></div></div>' +
      '<div class="field-row"><div class="field"><label>Stage</label><select class="select" id="f-stage">' + S().STAGES.map((s) => '<option value="' + s.key + '"' + (existing && existing.stage === s.key ? " selected" : "") + ">" + s.label + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Estimated deal value (GH₵)</label><input class="input" id="f-value" type="number" min="0" value="' + (existing ? existing.estimatedValue || "" : "") + '"></div></div>' +
      '<div class="field"><label>Notes</label><textarea class="textarea" id="f-notes" rows="3">' + U().escapeHtml(b ? b.notes : "") + "</textarea></div>"
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>' + (existing ? "Save Changes" : "Add Lead") + "</button>");
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const name = m.body.querySelector("#f-name").value.trim();
      if (!name) { V61.Toast.error("Business name is required"); return; }
      const data = {
        name, category: m.body.querySelector("#f-cat").value.trim(), city: m.body.querySelector("#f-city").value.trim(),
        address: m.body.querySelector("#f-address").value.trim(), phone: m.body.querySelector("#f-phone").value.trim(),
        whatsapp: m.body.querySelector("#f-wa").value.trim() || m.body.querySelector("#f-phone").value.trim(),
        email: m.body.querySelector("#f-email").value.trim(), website: m.body.querySelector("#f-website").value.trim(),
        instagramUrl: m.body.querySelector("#f-ig").value.trim(), facebookUrl: m.body.querySelector("#f-fb").value.trim(),
      };
      if (existing) {
        Object.assign(S().byId("businesses", existing.businessId), data, { updatedAt: U().now() });
        existing.stage = m.body.querySelector("#f-stage").value;
        if (existing.stage === "won") { existing.wonAt = existing.wonAt || U().now(); S().ensureClient(existing); }
        existing.estimatedValue = Number(m.body.querySelector("#f-value").value) || 0;
        existing.notes = m.body.querySelector("#f-notes").value.trim();
        S().addActivity(existing.id, "note", "Lead details updated.");
        S().save(); V61.Toast.success("Lead updated");
      } else {
        const biz = S().addBusiness(data);
        const lead = S().addLead(biz.id, { stage: m.body.querySelector("#f-stage").value, estimatedValue: Number(m.body.querySelector("#f-value").value) || 0, notes: m.body.querySelector("#f-notes").value.trim(), source: "manual" });
        S().save(); V61.Toast.success("Lead added");
        m.close();
        V61.App.nav("#/leads/" + lead.id);
        return;
      }
      m.close();
      render();
    });
  }

  /* ── List header + filters ── */
  function stageStrip() {
    const rows = S().leadRows();
    const chips = S().STAGES.map((s) => {
      const n = rows.filter((r) => r.lead.stage === s.key).length;
      return '<button class="chip' + (state.stage === s.key ? " active" : "") + '" data-stagechip="' + s.key + '"><span class="c-dot" style="background:' + s.color + '"></span>' + s.label + ' <span class="c-n">' + n + "</span></button>";
    }).join("");
    return '<div class="panel" style="margin-bottom:16px"><div class="chip-strip">' +
      '<button class="chip' + (state.stage === "all" ? " active" : "") + '" data-stagechip="all"><span class="c-n">All</span></button>' + chips +
      "</div></div>";
  }

  function filterBar() {
    const total = S().db.leads.length;
    const sel = state.selected.size;
    return '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Prospecting</div>' +
      '<h1 class="page-title">Leads</h1><p class="page-sub">' + total + " prospect" + (total === 1 ? "" : "s") + " in your pipeline" + (sel ? " · " + sel + " selected" : "") + "</p></div>" +
      '<div class="page-actions">' +
      (sel ? '<button class="btn" data-cmd="bulkStatus">' + I.filter + " Set stage</button><button class='btn btn-danger' data-cmd='bulkDelete'>" + I.trash + " Delete (" + sel + ")</button>" : "") +
      '<button class="btn" data-cmd="exportLeads">' + I.download + " Export</button>" +
      '<button class="btn btn-primary" data-cmd="addLead">' + I.plus + ' Add Lead</button></div></div>' +
      '<div class="panel" style="margin-bottom:16px"><div class="filterbar">' +
      '<div class="search-wrap" style="position:relative;flex:1;min-width:180px">' +
      '<span style="position:absolute;left:11px;top:9px;color:var(--text-3)">' + I.search + '</span>' +
      '<input class="input" id="lead-search" style="padding-left:34px" placeholder="Search businesses, contacts, notes..."></div>' +
      '<select class="select" id="flt-cat"><option value="all">All categories</option>' + catList().map((c) => '<option' + (state.cat === c ? " selected" : "") + ">" + U().escapeHtml(c) + "</option>").join("") + "</select>" +
      '<select class="select" id="flt-loc"><option value="all">All locations</option>' + locList().map((c) => '<option' + (state.loc === c ? " selected" : "") + ">" + U().escapeHtml(c) + "</option>").join("") + "</select>" +
      '<select class="select" id="flt-stage"><option value="all">All stages</option>' + S().STAGES.map((s) => '<option value="' + s.key + '"' + (state.stage === s.key ? " selected" : "") + ">" + s.label + "</option>").join("") + "</select>" +
      '<select class="select" id="flt-temp"><option value="all">Any temperature</option>' + S().TEMPERATURES.map((t) => '<option value="' + t.key + '"' + (state.temp === t.key ? " selected" : "") + ">" + t.label + "</option>").join("") + "</select>" +
      '<select class="select" id="flt-contact"><option value="all">Any contact</option><option value="contacted" ' + (state.contact === "contacted" ? "selected" : "") + '>Contacted</option><option value="not_contacted" ' + (state.contact === "not_contacted" ? "selected" : "") + '>Not contacted</option></select>' +
      '<select class="select" id="flt-sort"><option value="newest" ' + (state.sort === "newest" ? "selected" : "") + '>Newest first</option><option value="name" ' + (state.sort === "name" ? "selected" : "") + '>Name</option><option value="score" ' + (state.sort === "score" ? "selected" : "") + '>Lead score</option><option value="value" ' + (state.sort === "value" ? "selected" : "") + '>Deal value</option></select>' +
      (filtersActive() ? '<button class="btn btn-ghost btn-sm" id="clear-filters" title="Clear filters">' + I.x + " Clear</button>" : "") +
      '<div class="seg"><button data-v="table" class="' + (state.view === "table" ? "active" : "") + '">' + I.table + "</button><button data-v='grid' class='" + (state.view === "grid" ? "active" : "") + "'>" + I.grid + '</button><button data-v="kanban" class="' + (state.view === "kanban" ? "active" : "") + '">' + I.columns + "</button></div>" +
      "</div></div>";
  }

  /* ── Table view ── */
  function bizCell(r) {
    const b = r.business || {};
    const temp = r.temperature || S().temperatureFor(r.leadScore);
    return '<td><div class="biz-cell"><label class="checkbox"><input type="checkbox" data-sel="' + r.lead.id + '" ' + (state.selected.has(r.lead.id) ? "checked" : "") + '></label>' +
      '<div style="width:32px;height:32px;border-radius:9px;background:' + UI.hexA(U().avatarColor(b.name || "?"), .15) + ';color:' + U().avatarColor(b.name) + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0">' + U().initials(b.name) + "</div>" +
      '<div><div class="b-name"><a href="#/leads/' + r.lead.id + '" data-nav-link>' + U().escapeHtml(b.name || "Untitled") + '</a></div><div class="b-cat">' + U().escapeHtml(b.category || "") + "</div></div></div></td>";
  }
  function assetsHtml(b) {
    const wa = b.whatsapp || b.phone;
    const items = [
      [b.website, I.globe, "Website"], [b.googleProfileUrl, I.mapPin, "Google profile"], [b.instagramUrl, I.instagram, "Instagram"], [wa, I.whatsapp, "WhatsApp"], [b.facebookUrl, I.facebook, "Facebook"],
    ];
    return '<span class="asset-icons" style="display:inline-flex;gap:5px">' + items.map(([v, ic, t]) =>
      v ? '<span title="' + t + '" style="color:var(--ok);display:inline-flex">' + ic + "</span>" : '<span title="No ' + t + '" style="color:var(--text-3);opacity:.28;display:inline-flex">' + ic + "</span>"
    ).join("") + "</span>";
  }
  function tableHtml(rows) {
    if (!rows.length) return UI.emptyState("users", "Your pipeline is empty.", "Start by adding your first business prospect.", '<button class="btn btn-primary" data-cmd="addLead">' + I.plus + " Add Lead</button>");
    const b = (r) => r.business || {};
    return '<div class="table-wrap"><table class="data"><thead><tr>' +
      "<th></th><th>Business</th><th>Category</th><th>Location</th><th>Digital</th><th>Lead</th><th>Assets</th><th>Stage</th><th>Last contact</th><th>Next follow-up</th><th>Deal value</th><th></th>" +
      "</tr></thead><tbody>" + rows.map((r) => {
        const fu = S().nextFollowup(r.lead.id);
        const bz = b(r);
        return "<tr data-row='" + r.lead.id + "'>" + bizCell(r) +
          "<td><span class='cell-sub'>" + U().escapeHtml(bz.category || "—") + "</span></td>" +
          "<td><span class='cell-sub'>" + U().escapeHtml(bz.city || "—") + "</span></td>" +
          '<td><span class="mini-score cold" style="font-size:11px">' + r.digitalScore + "</span></td>" +
          '<td>' + UI.miniScore(r.leadScore) + " " + UI.tempBadge(r.temperature || S().temperatureFor(r.leadScore)) + "</td>" +
          "<td>" + assetsHtml(bz) + "</td>" +
          '<td>' + UI.stageBadge(r.lead.stage) + "</td>" +
          '<td><span class="cell-sub">' + (r.lead.lastContacted ? U().relativeTime(r.lead.lastContacted) : "—") + "</span></td>" +
          '<td>' + (fu ? '<span class="kb-due ' + (fu.dueDate < U().todayStart() ? "overdue" : "") + '">' + I.clock + U().relativeDue(fu.dueDate) + "</span>" : '<span class="cell-sub">—</span>') + "</td>" +
          '<td><span style="font-weight:700;font-variant-numeric:tabular-nums">' + U().formatMoney(r.lead.estimatedValue) + "</span></td>" +
          '<td><button class="icon-btn" data-rowmenu="' + r.lead.id + '" title="Actions">' + I.moreH + "</button></td>" +
          "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  /* ── Grid view ── */
  function gridHtml(rows) {
    if (!rows.length) return UI.emptyState("users", "No leads match these filters.", "Adjust your search or filters to see more prospects.");
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">' + rows.map((r) => {
      const b = r.business || {};
      const fu = S().nextFollowup(r.lead.id);
      const wa = b.whatsapp || b.phone;
      return '<div class="card" style="cursor:pointer" data-open="' + r.lead.id + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="display:flex;gap:10px;align-items:center">' +
        '<div style="width:40px;height:40px;border-radius:10px;background:' + UI.hexA(U().avatarColor(b.name || "?"), .15) + ';color:' + U().avatarColor(b.name) + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px">' + U().initials(b.name) + "</div>" +
        '<div><div style="font-weight:650;font-size:13.5px">' + U().escapeHtml(b.name) + '</div><div style="font-size:11.5px;color:var(--text-3)">' + U().escapeHtml([b.category, b.city].filter(Boolean).join(" • ")) + "</div></div></div>" +
        UI.miniScore(r.leadScore) + "</div>" +
        '<div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap">' + UI.stageBadge(r.lead.stage) + UI.tempBadge(r.temperature || S().temperatureFor(r.leadScore)) +
        '<span class="tag" style="margin-left:auto">Digital ' + r.digitalScore + "</span></div>" +
        '<div style="display:flex;gap:10px;margin-top:11px;font-size:12px;color:var(--text-2)"><span style="display:inline-flex;align-items:center;gap:4px">' + I.dollar + U().formatMoney(r.lead.estimatedValue) + "</span>" +
        (fu ? '<span style="display:inline-flex;align-items:center;gap:4px" class="' + (fu.dueDate < U().todayStart() ? "kb-due overdue" : "") + '">' + I.clock + U().relativeDue(fu.dueDate) + "</span>" : "") + "</div>" +
        (wa ? '<div style="margin-top:11px"><a class="mini-btn" target="_blank" rel="noopener" href="' + U().waLink(wa) + '">' + I.whatsapp + " WhatsApp</a></div>" : "") +
        "</div>";
    }).join("") + "</div>";
  }

  /* ── Kanban view (compact) ── */
  function kanbanHtml(rows) {
    if (!rows.length) return UI.emptyState("users", "No leads match these filters.", "Adjust your search or filters to see more prospects.");
    const total = rows.length;
    return '<div class="kanban">' + S().STAGES.map((s) => {
      const col = rows.filter((r) => r.lead.stage === s.key);
      const sum = col.reduce((t, r) => t + (r.lead.estimatedValue || 0), 0);
      return '<div class="kb-col' + (s.key === "won" ? " win-col" : s.key === "lost" ? " lose-col" : "") + '" data-stage="' + s.key + '"><div class="kb-col-head"><span class="kb-col-title"><span class="badge-dot" style="background:' + s.color + '"></span>' + s.label + "</span><span class='kb-count'>" + col.length + "</span>" +
        (sum ? '<span class="kb-col-value">' + U().formatCompact(sum) + "</span>" : "") + "</div>" +
        '<div class="kb-col-body">' + (col.length ? col.map((r) => {
          const b = r.business || {};
          const fu = S().nextFollowup(r.lead.id);
          const wa = b.whatsapp || b.phone;
          return '<div class="kb-card" data-drag="' + r.lead.id + '" data-drag-stage="' + r.lead.stage + '" data-open="' + r.lead.id + '">' +
            '<div class="kb-top"><div><div class="kb-name">' + U().escapeHtml(b.name) + '</div><div class="kb-cat">' + U().escapeHtml([b.category, b.city].filter(Boolean).join(" • ")) + "</div></div>" +
            '<span style="display:flex;gap:4px;align-items:center">' + UI.miniScore(r.leadScore) +
            '<button class="icon-btn kb-move" data-move="' + r.lead.id + '" title="Move to stage">' + I.moreH + "</button></span></div>" +
            '<div class="kb-meta"><span class="kb-value">' + U().formatMoney(r.lead.estimatedValue) + "</span>" +
            (fu ? '<span class="kb-due ' + (fu.dueDate < U().todayStart() ? "overdue" : "") + '">' + I.clock + U().relativeDue(fu.dueDate) + "</span>" : "") +
            (wa ? '<a class="mini-btn" style="padding:1px 7px;margin-left:auto" target="_blank" rel="noopener" href="' + U().waLink(wa) + '">' + I.whatsapp + "</a>" : "") +
            "</div></div>";
        }).join("") : '<div class="kb-empty">Drop leads here</div>') + "</div>" +
        '<div class="kb-col-foot"><span>Total</span><b>' + U().formatMoney(sum) + "</b></div></div>";
    }).join("") + "</div>";
  }

  function bindList() {
    const el = document.getElementById("content");
    const q = el.querySelector("#lead-search");
    if (q) q.addEventListener("input", U().debounce((e) => { state.query = e.target.value; render(); }, 180));
    ["flt-cat", "flt-loc", "flt-stage", "flt-contact", "flt-sort", "flt-temp"].forEach((id) => {
      const s = el.querySelector("#" + id);
      if (s) s.addEventListener("change", (e) => {
        const k = id.replace("flt-", "");
        state[k] = e.target.value; render();
      });
    });
    el.querySelectorAll("[data-stagechip]").forEach((c) => c.addEventListener("click", () => {
      state.stage = c.dataset.stagechip; render();
    }));
    const clear = el.querySelector("#clear-filters");
    if (clear) clear.addEventListener("click", () => {
      state.query = ""; state.cat = "all"; state.loc = "all"; state.stage = "all"; state.temp = "all"; state.contact = "all";
      render();
    });
    el.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.v; render(); }));
    el.querySelectorAll("[data-sel]").forEach((cb) => cb.addEventListener("change", (e) => {
      e.stopPropagation();
      const id = cb.dataset.sel;
      if (cb.checked) state.selected.add(id); else state.selected.delete(id);
      const tr = cb.closest("tr"); if (tr) tr.classList.toggle("selected", cb.checked);
      const head = el.querySelector(".page-sub");
      if (head && state.selected.size) head.textContent = S().db.leads.length + " prospects · " + state.selected.size + " selected";
    }));
    el.querySelectorAll("[data-open]").forEach((c) => c.addEventListener("click", (e) => {
      if (e.target.closest("a") || e.target.closest("input") || e.target.closest("button")) return;
      V61.App.nav("#/leads/" + c.dataset.open);
    }));
    el.querySelectorAll("[data-row]").forEach((tr) => tr.addEventListener("click", (e) => {
      if (e.target.closest("a") || e.target.closest("input") || e.target.closest("select") || e.target.closest("button")) return;
      V61.App.nav("#/leads/" + tr.dataset.row);
    }));
    el.querySelectorAll("[data-rowmenu]").forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const lead = S().byId("leads", btn.dataset.rowmenu);
      const biz = lead ? S().businessOf(lead) : null;
      const wa = biz ? (biz.whatsapp || biz.phone) : "";
      V61.UI.menuPop(btn, [
        { text: "Open lead", icon: I.eye, action: () => V61.App.nav("#/leads/" + btn.dataset.rowmenu) },
        (wa ? { text: "WhatsApp", icon: I.whatsapp, action: () => window.open(U().waLink(wa, S().buildMessage(biz.name, biz.category))) } : null),
        (biz && biz.phone ? { text: "Call", icon: I.phone, action: () => window.location.href = "tel:" + U().phoneDigits(biz.phone) } : null),
        { text: "Digital audit", icon: I.scan, action: () => V61.Cmd.openAudit(btn.dataset.rowmenu) },
        { text: "Create proposal", icon: I.fileText, action: () => V61.Cmd.createProposal(btn.dataset.rowmenu) },
        { sep: true },
        { text: "Edit lead", icon: I.pencil, action: () => openLeadForm(lead) },
        { text: "Delete", icon: I.trash, danger: true, action: () => deleteLead(btn.dataset.rowmenu) },
      ].filter(Boolean));
    }));
    // kanban drag-drop (pointer events, touch-friendly)
    el.querySelectorAll(".kb-card").forEach((card) => {
      card.addEventListener("pointerdown", (e) => {
        if (e.target.closest("a") || e.target.closest("button")) return;
        startKanbanDrag(card, e);
      });
    });
    el.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      V61.UI.menuPop(b, S().STAGES.filter((s) => s.key !== b.closest(".kb-col").dataset.stage).map((s) => ({
        text: "Move to " + s.label, icon: I.chevronR, action: () => moveKanbanLead(b.dataset.move, s.key),
      })));
    }));
  }

  function moveKanbanLead(id, toStage) {
    const lead = S().byId("leads", id);
    if (!lead || lead.stage === toStage) return;
    lead.stage = toStage; lead.updatedAt = U().now();
    if (toStage === "won") { lead.wonAt = U().now(); S().ensureClient(lead); }
    S().addActivity(lead.id, "stage", "Lead moved to " + S().stageOf(toStage).label + ".");
    S().save(); V61.Toast.success("Lead moved to " + S().stageOf(toStage).label);
    render();
  }

  function startKanbanDrag(card, e) {
    const kanban = card.closest(".kanban");
    if (!kanban) return;
    const wasTouch = e.pointerType === "touch";
    const startX = e.clientX, startY = e.clientY;
    let started = false, moved = 0;

    function onMove(ev) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      moved = Math.max(moved, Math.abs(dx), Math.abs(dy));
      if (!started && moved > 6) { started = true; begin(); }
      if (started) {
        ev.preventDefault();
        ghost.style.left = ev.clientX + "px";
        ghost.style.top = ev.clientY + "px";
        const col = columnAt(ev.clientX, ev.clientY);
        kanban.querySelectorAll(".kb-col").forEach((c) => c.classList.toggle("drag-over", c === col));
      }
    }
    function onUp(ev) {
      if (!started) { cleanup(); return; }
      const col = columnAt(ev.clientX, ev.clientY);
      if (col && col.dataset.stage !== card.dataset.dragStage) moveKanbanLead(card.dataset.drag, col.dataset.stage);
      cleanup();
    }
    function columnAt(x, y) {
      const els = kanban.querySelectorAll(".kb-col");
      for (const c of els) { const r = c.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return c; }
      return null;
    }
    function begin() {
      card.classList.add("dragging");
      ghost = document.createElement("div");
      ghost.className = "kb-ghost";
      ghost.textContent = card.querySelector(".kb-name") ? card.querySelector(".kb-name").textContent.trim() : "Lead";
      ghost.style.left = startX + "px";
      ghost.style.top = startY + "px";
      document.body.appendChild(ghost);
      card.setPointerCapture && card.setPointerCapture(e.pointerId);
    }
    function cleanup() {
      card.classList.remove("dragging");
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      kanban.querySelectorAll(".kb-col").forEach((c) => c.classList.remove("drag-over"));
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerup", onUp);
      card.removeEventListener("pointercancel", onUp);
    }
    let ghost = null;
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", onUp);
    card.addEventListener("pointercancel", onUp);
    if (wasTouch) { card.style.touchAction = "none"; }
  }

  function render() {
    const el = document.getElementById("content");
    const rows = filteredRows();
    el.innerHTML = filterBar() + stageStrip() + (state.view === "table" ? tableHtml(rows) : state.view === "grid" ? gridHtml(rows) : kanbanHtml(rows));
    UI.bind(el);
    bindList();
  }

  /* ── Bulk actions ── */
  function bulkStatusModal() {
    const m = UI.openModal({ title: "Set stage for " + state.selected.size + " lead(s)", icon: I.filter });
    m.setBody('<div class="field"><label>New stage</label><select class="select" id="bulk-stage">' + S().STAGES.map((s) => '<option value="' + s.key + '">' + s.label + "</option>").join("") + "</select></div>");
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-go>Update</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.body.querySelector("[data-go]").addEventListener("click", () => {
      const stage = m.body.querySelector("#bulk-stage").value;
      state.selected.forEach((id) => { const l = S().byId("leads", id); if (l) { l.stage = stage; l.updatedAt = U().now(); if (stage === "won") { l.wonAt = U().now(); S().ensureClient(l); } } });
      S().save(); state.selected.clear(); m.close(); V61.Toast.success("Stage updated"); render();
    });
  }
  function bulkDelete() {
    UI.confirmDialog("Delete " + state.selected.size + " lead(s)?", "This removes the leads and their businesses. Follow-ups, notes and activity will remain in the record.", () => {
      state.selected.forEach((id) => {
        const l = S().byId("leads", id);
        if (l) { S().db.leads = S().db.leads.filter((x) => x.id !== id); S().db.businesses = S().db.businesses.filter((x) => x.id !== l.businessId); }
      });
      state.selected.clear(); S().save(); V61.Toast.success("Leads deleted"); render();
    });
  }

  /* ═══════════ LEAD DETAIL ═══════════ */
  function openLead(id) {
    const lead = S().byId("leads", id);
    if (!lead) { V61.App.nav("#/leads"); return; }
    const biz = S().businessOf(lead);
    const audit = S().auditOf(lead.businessId);
    const dScore = S().digitalScore(audit);
    const lScore = lead.scoreOverride != null ? U().clamp(Math.round(lead.scoreOverride), 1, 100) : S().leadScore(lead, biz, audit);
    const temp = lead.temperature || S().temperatureFor(lScore);
    const opps = S().opportunities(audit, biz);
    const el = document.getElementById("content");
    const band = S().scoreBand(lScore);
    const dband = S().scoreBand(dScore);
    const breakdown = S().auditBreakdown(audit);
    const contacts = S().contactsFor(biz.id);
    const activity = S().activityFor(lead.id);
    const tasks = S().tasksFor(lead.id);
    const outreach = S().outreachFor(lead.id);
    const followups = S().followupsFor(lead.id);
    const proposals = S().proposalsFor(lead.id);
    const wa = biz.whatsapp || biz.phone;

    el.innerHTML =
      '<a href="#/leads" class="btn btn-ghost" style="margin-bottom:14px">' + I.chevronL + " Back to leads</a>" +
      '<div class="panel" style="padding:22px"><div class="ld-head">' +
      '<div class="avatar big" style="background:' + UI.hexA(U().avatarColor(biz.name), .15) + ';color:' + U().avatarColor(biz.name) + '">' + U().initials(biz.name) + "</div>" +
      '<div style="flex:1;min-width:220px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h1 class="ld-title">' + U().escapeHtml(biz.name) + "</h1>" + UI.stageBadge(lead.stage) + UI.tempBadge(temp) + "</div>" +
      '<div class="ld-sub">' + U().escapeHtml([biz.category, biz.city, biz.region].filter(Boolean).join(" • ") || "No category") + "</div>" +
      '<div class="ld-actions" style="margin-top:12px">' +
      (wa ? '<a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="' + U().waLink(wa, S().buildMessage(biz.name, biz.category)) + '">' + I.whatsapp + " WhatsApp</a>" : "") +
      (biz.phone ? '<a class="btn btn-sm" href="tel:' + U().phoneDigits(biz.phone) + '">' + I.phone + " Call</a>" : "") +
      (biz.email ? '<a class="btn btn-sm" href="mailto:' + U().escapeHtml(biz.email) + '">' + I.mail + " Email</a>" : "") +
      '<button class="btn btn-sm" data-cmd="addTask:' + lead.id + '">' + I.checkSquare + " Add Task</button>" +
      '<button class="btn btn-sm" data-cmd="addNote:' + lead.id + '">' + I.pencil + " Add Note</button>" +
      '<button class="btn btn-sm" data-cmd="addFollowup:' + lead.id + '">' + I.calendar + " Follow-up</button>" +
      '<button class="btn btn-sm" data-cmd="addOutreach:' + lead.id + '">' + I.send + " Log Outreach</button>" +
      '<button class="btn btn-sm btn-primary" data-cmd="createProposal:' + lead.id + '">' + I.fileText + " Create Proposal</button>" +
      "</div></div>" +
      '<div style="display:flex;gap:8px;align-items:center">' +
      '<button class="btn btn-ghost btn-sm" data-cmd="editLead:' + lead.id + '">' + I.pencil + " Edit</button>" +
      '<button class="btn btn-danger btn-sm" data-cmd="deleteLead:' + lead.id + '">' + I.trash + " Delete</button></div></div></div>" +

      '<div class="ld-grid">' +
      '<div style="display:flex;flex-direction:column;gap:18px">' +

      /* business info */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.briefcase + " Business Information</div><button class='btn btn-sm btn-ghost' data-cmd='editLead:" + lead.id + "'>" + I.pencil + " Edit</button></div><div class='panel-body'><div class='info-grid'>" +
      infoItem("Category", biz.category) + infoItem("Address", biz.address) + infoItem("City", biz.city) +
      infoItem("Phone", biz.phone ? '<a href="tel:' + U().phoneDigits(biz.phone) + '">' + U().escapeHtml(biz.phone) + "</a>" : "") +
      infoItem("WhatsApp", biz.whatsapp ? '<a target="_blank" rel="noopener" href="' + U().waLink(biz.whatsapp) + '">' + U().escapeHtml(biz.whatsapp) + "</a>" : "") +
      infoItem("Email", biz.email ? '<a href="mailto:' + U().escapeHtml(biz.email) + '">' + U().escapeHtml(biz.email) + "</a>" : "") +
      infoItem("Website", biz.website ? '<a target="_blank" rel="noopener" href="' + (/^https?:\/\//i.test(biz.website) ? biz.website : "https://" + biz.website) + '">' + U().escapeHtml(biz.website) + "</a>" : "") +
      infoItem("Google Profile", biz.googleProfileUrl ? '<a target="_blank" rel="noopener" href="' + biz.googleProfileUrl + '">View profile</a>' : "") +
      infoItem("Instagram", biz.instagramUrl ? '<a target="_blank" rel="noopener" href="' + biz.instagramUrl + '">@' + U().escapeHtml(biz.instagramUrl.replace(/https?:\/\/(www\.)?instagram\.com\//i, "")) + "</a>" : "") +
      infoItem("Facebook", biz.facebookUrl ? '<a target="_blank" rel="noopener" href="' + biz.facebookUrl + '">View page</a>' : "") +
      infoItem("TikTok", biz.tiktokUrl ? '<a target="_blank" rel="noopener" href="' + biz.tiktokUrl + '">View profile</a>' : "") +
      infoItem("LinkedIn", biz.linkedinUrl ? '<a target="_blank" rel="noopener" href="' + biz.linkedinUrl + '">View profile</a>' : "") +
      "</div>" + (biz.notes ? '<div style="margin-top:12px;padding:11px 13px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;font-size:12.5px;color:var(--text-2)"><b style="color:var(--text)">Notes:</b> ' + U().escapeHtml(biz.notes) + "</div>" : "") +
      "</div></div>" +

      /* digital score */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.scan + " Digital Presence Audit" + (audit ? '<span class="sub">Updated ' + U().relativeTime(audit.updatedAt || audit.createdAt) + "</span>" : "") + "</div>" +
      '<button class="btn btn-sm" data-cmd="openAudit:' + lead.id + '">' + (audit ? I.pencil + " Edit Audit" : I.plus + " Run Audit") + "</button></div>" +
      '<div class="panel-body"><div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap">' +
      UI.scoreRing(dScore, "Digital") +
      '<div style="flex:1;min-width:220px"><div style="font-weight:700;font-size:15px">Digital Presence Score</div>' +
      '<span class="score-band" style="background:' + UI.hexA(dband.color, .14) + ';color:' + dband.color + '">' + dband.label + "</span>" +
      "<p style='font-size:12.5px;color:var(--text-3);margin-top:6px'>Scores 0–100 across website, Google profile, social media, branding, conversion and SEO.</p></div></div>" +
      '<div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px 18px">' + breakdown.map((b) =>
        '<div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:var(--text-2);font-weight:600">' + b.label + "</span><span style='font-weight:700'>" + b.score + "/" + b.max + "</span></div>" + UI.scoreBar(b.score) + "</div>"
      ).join("") + "</div>" +
      (!audit ? '<div style="margin-top:16px;text-align:center;color:var(--text-3);font-size:12.5px">No audit yet — run one to unlock the Digital Score and opportunities.</div>' : "") +
      "</div></div>" +

      /* lead score */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.zap + " Lead Score" + "</div></div><div class='panel-body'><div style='display:flex;gap:22px;align-items:center;flex-wrap:wrap'>" +
      UI.scoreRing(lScore, temp === "hot" ? "Hot" : temp === "warm" ? "Warm" : "Cold") +
      '<div style="flex:1;min-width:220px"><div style="font-weight:700;font-size:15px">' + lScore + " / 100 — " + (temp === "hot" ? "HIGH PRIORITY" : temp === "warm" ? "Warm prospect" : "Cold prospect") + "</div>" +
      UI.badge(band.label, band.color, true) +
      '<p style="font-size:12.5px;color:var(--text-3);margin-top:6px">Estimated value: <b style="color:var(--text)">' + U().formatMoney(lead.estimatedValue) + "</b> · Source: " + U().escapeHtml(lead.source || "manual") + "</p></div></div>" +
      '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn btn-sm" data-cmd="overrideScore:' + lead.id + '">' + I.settings + " Override score</button>" +
      '<select class="select" style="width:130px" data-temp="' + lead.id + '">' + S().TEMPERATURES.map((t) => '<option value="' + t.key + '"' + (temp === t.key ? " selected" : "") + ">" + t.label + "</option>").join("") + "</select></div>" +
      "</div></div>" +

      /* contacts */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.users + " Contacts" + '<span class="sub">' + contacts.length + "</span></div><button class='btn btn-sm' data-cmd='addContact:" + lead.id + "'>" + I.plus + " Add Contact</button></div>" +
      '<div class="panel-body"><div class="stack">' + (contacts.length ? contacts.map((c) =>
        '<div class="contact-card"><div class="avatar">' + U().initials(c.name) + "</div><div style='flex:1'><div class='c-name'>" + U().escapeHtml(c.name) + '</div><div class="c-role">' + U().escapeHtml(c.role || "Contact") + "</div>" +
        '<div class="c-links">' + UI.contactLinks(c) + '</div></div><button class="icon-btn" data-cmd="delContact:' + c.id + '">' + I.trash + "</button></div>"
      ).join("") : UI.emptyState("users", "No contacts yet.", "Add a contact so you always know who to reach at this business.")) + "</div></div></div>" +

      /* activity timeline */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.clock + " Activity Timeline" + "</div><button class='btn btn-sm' data-cmd='addNote:" + lead.id + "'>" + I.plus + " Add Note</button></div>" +
      '<div class="panel-body"><div class="timeline">' + (activity.length ? activity.map((a, i) => {
        const isToday = U().dayStart(a.createdAt) === U().todayStart();
        const isY = U().dayStart(a.createdAt) === U().todayStart() - 86400000;
        const when = isToday ? "Today — " + U().formatTime(a.createdAt) : isY ? "Yesterday — " + U().formatTime(a.createdAt) : U().formatDateTime(a.createdAt);
        const icons = { lead: I.plus, note: I.pencil, stage: I.filter, outreach: I.send, followup: I.calendar, task: I.checkSquare, contact: I.users, proposal: I.fileText, system: I.bell };
        return '<div class="tl-item' + (a.type === "note" ? " muted" : "") + '"><div class="tl-time">' + (icons[a.type] || I.clock) + when + '</div><div class="tl-text">' + U().escapeHtml(a.text) + "</div></div>";
      }).join("") : '<div style="color:var(--text-3);font-size:12.5px">No activity recorded yet.</div>') + "</div></div></div>" +

      '</div>' +

      /* right column */
      '<div class="sticky-col" style="display:flex;flex-direction:column;gap:18px">' +

      nextStepCallout(lead, followups, tasks, wa, biz) +

      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.lightbulb + " Opportunities" + '<span class="sub">' + opps.length + "</span></div></div>" +
      '<div class="panel-body"><div class="stack">' + (opps.length ? opps.map((o) =>
        '<div class="opp-item"><div class="o-icon">' + (I[o.icon] || I.zap) + '</div><div><h5>' + U().escapeHtml(o.title) + '</h5><p>' + U().escapeHtml(o.desc) + "</p></div></div>"
      ).join("") : '<div style="font-size:12.5px;color:var(--text-3)">No major opportunities detected — this business has a solid digital presence.</div>') +
      "</div>" + (opps.length ? '<p style="margin-top:14px;font-size:12.5px;color:var(--text-2);line-height:1.6;border-left:3px solid var(--accent);padding-left:10px"><b>Summary:</b> ' + U().escapeHtml(S().opportunitySummary(opps, biz)) + "</p>" : "") + "</div></div>" +

      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.send + " Outreach" + '<span class="sub">' + outreach.length + "</span></div><button class='btn btn-sm' data-cmd='addOutreach:" + lead.id + "'>" + I.plus + " Log</button></div>" +
      '<div class="panel-body"><div class="timeline">' + (outreach.length ? outreach.map((o) => {
        const cs = S().contactStatusOf(o.status);
        return '<div class="tl-item"><div class="tl-time">' + I.send + U().formatDateTime(o.contactedAt) + "</div><div class='tl-text'><span class='tl-strong'>" + U().escapeHtml(o.channel) + "</span> — " + UI.badge(cs.label, cs.color, true) + "</div>" +
        (o.message ? '<div class="tl-note">' + U().escapeHtml(o.message) + "</div>" : "") +
        (o.notes ? '<div style="font-size:12px;color:var(--text-2);margin-top:4px">' + U().escapeHtml(o.notes) + "</div>" : "") + "</div>";
      }).join("") : '<div style="font-size:12.5px;color:var(--text-3)">No outreach logged yet.</div>') + "</div></div></div>" +

      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.calendar + " Follow-ups" + '<span class="sub">' + followups.filter((f) => f.status === "pending").length + " pending</span></div><button class='btn btn-sm' data-cmd='addFollowup:" + lead.id + "'>" + I.plus + " Add</button></div>" +
      '<div class="panel-body"><div class="stack">' + (followups.length ? followups.map((f) =>
        '<div class="row-card" style="padding:11px 13px"><div class="rc-main"><div class="rc-title" style="font-size:13px">' + U().escapeHtml(f.title) + '</div><div class="rc-sub">' + I.clock + '<span class="' + (f.dueDate < U().todayStart() ? "kb-due overdue" : "") + '">' + U().formatDate(f.dueDate) + " (" + U().relativeDue(f.dueDate) + ")</span> · " + UI.badge(f.priority, f.priority === "high" ? "#e5484d" : f.priority === "medium" ? "#e0a53e" : "#8a8a90") + "</div></div>" +
        '<div class="rc-actions"><button class="icon-btn" data-cmd="completeFollowup:' + f.id + '" title="Complete">' + I.check + "</button><button class='icon-btn' data-cmd='reschedFollowup:" + f.id + "' title='Reschedule'>" + I.refresh + "</button><button class='icon-btn' data-cmd='delFollowup:" + f.id + "'>" + I.trash + "</button></div></div>"
      ).join("") : '<div style="font-size:12.5px;color:var(--text-3)">No follow-ups scheduled.</div>') + "</div></div></div>" +

      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.checkSquare + " Tasks" + '<span class="sub">' + tasks.filter((t) => t.status !== "done").length + " open</span></div><button class='btn btn-sm' data-cmd='addTask:" + lead.id + "'>" + I.plus + " Add</button></div>" +
      '<div class="panel-body"><div class="stack">' + (tasks.length ? tasks.map((t) =>
        '<div class="row-card" style="padding:11px 13px"><div class="rc-main"><div class="rc-title" style="font-size:13px' + (t.status === "done" ? ";text-decoration:line-through;color:var(--text-3)" : "") + '">' + U().escapeHtml(t.title) + '</div><div class="rc-sub">' + (t.dueDate ? I.clock + " " + U().formatDate(t.dueDate) : "No due date") + ' · ' + UI.badge(t.status === "done" ? "done" : t.priority, t.priority === "high" ? "#e5484d" : t.priority === "medium" ? "#e0a53e" : "#8a8a90") + "</div></div>" +
        '<div class="rc-actions">' + (t.status === "done" ? '<button class="icon-btn" data-cmd="reopenTask:' + t.id + '" title="Reopen">' + I.refresh + "</button>" : '<button class="icon-btn" data-cmd="completeTask:' + t.id + '" title="Complete">' + I.check + "</button>") +
        "<button class='icon-btn' data-cmd='delTask:" + t.id + "'>" + I.trash + "</button></div></div>"
      ).join("") : '<div style="font-size:12.5px;color:var(--text-3)">No tasks yet.</div>') + "</div></div></div>" +

      (proposals.length ? '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.fileText + " Proposals" + '<span class="sub">' + proposals.length + "</span></div></div><div class='panel-body'><div class='stack'>" +
        proposals.map((p) => '<div class="row-card" style="padding:11px 13px"><div class="rc-main"><div class="rc-title" style="font-size:13px">' + U().escapeHtml(p.title || "Proposal") + '</div><div class="rc-sub">' + U().formatMoney(p.total) + " · " + UI.badge(p.status, p.status === "accepted" ? "#3f9d5f" : p.status === "rejected" ? "#e5484d" : p.status === "draft" ? "#8a8a90" : "#e0a53e") + "</div></div>" +
        '<div class="rc-actions"><a class="btn btn-sm btn-ghost" href="#/proposals/' + p.id + '">' + I.eye + ' View</a></div></div>').join("") + "</div></div></div>" : "") +

      "</div></div>";

    UI.bind(el);
    const t = el.querySelector("[data-temp]");
    if (t) t.addEventListener("change", () => { lead.temperature = t.value; S().save(); V61.Toast.success("Temperature set to " + S().tempOf(t.value).label); });
  }

  function infoItem(label, valueHtml) {
    return '<div class="info-item"><div class="i-label">' + U().escapeHtml(label) + '</div><div class="i-value">' + (valueHtml || '<span style="color:var(--text-3)">—</span>') + "</div></div>";
  }

  function nextStepCallout(lead, followups, tasks, wa, biz) {
    const next = followups.filter((f) => f.status === "pending").sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0))[0] || null;
    const nextT = tasks.filter((t) => t.status !== "done").sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0))[0] || null;
    let title = "", sub = "", actions = "";
    if (next) {
      title = next.title;
      sub = (next.dueDate ? U().relativeDue(next.dueDate) + " — " : "") + (next.notes || (next.priority ? "Priority: " + next.priority : ""));
      actions = '<button class="btn btn-sm btn-primary" data-cmd="completeFollowup:' + next.id + '">' + I.check + " Complete</button>";
      if (wa) actions += '<a class="btn btn-sm" target="_blank" rel="noopener" href="' + U().waLink(wa, S().buildMessage(biz.name, biz.category)) + '">' + I.whatsapp + " Message</a>";
    } else if (nextT) {
      title = nextT.title;
      sub = nextT.dueDate ? U().relativeDue(nextT.dueDate) + " — task due" : "Open task";
      actions = '<button class="btn btn-sm btn-primary" data-cmd="completeTask:' + nextT.id + '">' + I.check + " Complete</button>";
    } else if (wa) {
      title = "No next step scheduled";
      sub = "Start outreach — a warm message is the fastest way to move this lead forward.";
      actions = '<a class="btn btn-sm btn-primary" target="_blank" rel="noopener" href="' + U().waLink(wa, S().buildMessage(biz.name, biz.category)) + '">' + I.whatsapp + " WhatsApp</a>" +
        '<button class="btn btn-sm" data-cmd="addFollowup:' + lead.id + '">' + I.calendar + " Schedule follow-up</button>";
    } else {
      title = "No next step scheduled";
      sub = "Schedule a follow-up or log outreach to keep this lead moving.";
      actions = '<button class="btn btn-sm btn-primary" data-cmd="addFollowup:' + lead.id + '">' + I.calendar + " Schedule follow-up</button>";
    }
    return '<div class="callout"><div class="c-ic">' + I.rocket + '</div><div class="c-main"><div class="c-label">Next step</div>' +
      '<div class="c-title">' + U().escapeHtml(title) + '</div><div class="c-sub">' + U().escapeHtml(sub) + "</div>" +
      '<div class="c-actions">' + actions + "</div></div></div>";
  }

  /* ── Sub-actions (task/note/followup/outreach/contact modals) ── */
  function addNote(leadId) {
    const m = UI.openModal({ title: "Add Note", icon: I.pencil });
    m.setBody('<div class="field"><label>Note</label><textarea class="textarea" id="note-txt" rows="4" placeholder="Write a note about this lead..."></textarea></div>');
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save Note</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const txt = m.body.querySelector("#note-txt").value.trim();
      if (!txt) return;
      S().db.notes.push({ id: U().uid("n"), leadId, content: txt, createdAt: U().now() });
      S().addActivity(leadId, "note", "Note added: " + txt);
      S().save(); m.close(); V61.Toast.success("Note added"); refreshCurrent();
    });
  }
  function addTask(leadId) {
    const m = UI.openModal({ title: "Add Task", icon: I.checkSquare });
    m.setBody('<div class="field"><label>Task</label><input class="input" id="t-title" placeholder="e.g. Call restaurant owner"></div>' +
      '<div class="field-row"><div class="field"><label>Due date</label><input class="input" id="t-due" type="date"></div>' +
      '<div class="field"><label>Priority</label><select class="select" id="t-pri"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></div></div>');
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Add Task</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const title = m.body.querySelector("#t-title").value.trim();
      if (!title) return;
      const due = m.body.querySelector("#t-due").value;
      S().db.tasks.push({ id: U().uid("t"), leadId, title, dueDate: due ? new Date(due + "T09:00:00").getTime() : null, priority: m.body.querySelector("#t-pri").value, status: "todo" });
      S().addActivity(leadId, "task", "Task created: " + title);
      S().save(); m.close(); V61.Toast.success("Task added"); refreshCurrent();
    });
  }
  function addFollowup(leadId) {
    const m = UI.openModal({ title: "Schedule Follow-up", icon: I.calendar });
    m.setBody('<div class="field"><label>Reason / next action</label><input class="input" id="f-title" placeholder="e.g. Send pricing options"></div>' +
      '<div class="field-row"><div class="field"><label>Due date</label><input class="input" id="f-due" type="date"></div>' +
      '<div class="field"><label>Priority</label><select class="select" id="f-pri"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></div></div>' +
      '<div class="field"><label>Notes</label><textarea class="textarea" id="f-notes" rows="2"></textarea></div>');
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Schedule</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const title = m.body.querySelector("#f-title").value.trim() || "Follow up";
      const due = m.body.querySelector("#f-due").value;
      S().db.followups.push({ id: U().uid("f"), leadId, title, dueDate: due ? new Date(due + "T09:00:00").getTime() : null, priority: m.body.querySelector("#f-pri").value, status: "pending", notes: m.body.querySelector("#f-notes").value.trim() });
      S().addActivity(leadId, "followup", "Follow-up scheduled: " + title);
      S().save(); m.close(); V61.Toast.success("Follow-up scheduled"); refreshCurrent();
    });
  }
  function addOutreach(leadId) {
    const lead = S().byId("leads", leadId); const biz = S().businessOf(lead) || {};
    const m = UI.openModal({ title: "Log Outreach", icon: I.send, size: "lg" });
    m.setBody('<div class="field-row"><div class="field"><label>Channel</label><select class="select" id="o-channel">' + S().CHANNELS.map((c) => "<option>" + c + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Status</label><select class="select" id="o-status">' + S().CONTACT_STATUS.map((s) => '<option value="' + s.key + '">' + s.label + "</option>").join("") + "</select></div></div>" +
      '<div class="field-row"><div class="field"><label>Date & time</label><input class="input" id="o-date" type="datetime-local"></div>' +
      '<div class="field"><label>&nbsp;</label><div style="display:flex;gap:8px;align-items:center"><button class="btn btn-sm" id="o-prefill" type="button">' + I.rocket + " Use outreach message</button></div></div></div>" +
      '<div class="field"><label>Message</label><textarea class="textarea" id="o-message" rows="4"></textarea></div>' +
      '<div class="field"><label>Response / notes</label><textarea class="textarea" id="o-notes" rows="2"></textarea></div>');
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>');
    const pre = m.body.querySelector("#o-prefill");
    if (pre) pre.addEventListener("click", () => { m.body.querySelector("#o-message").value = S().buildMessage(biz.name, biz.category); });
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const channel = m.body.querySelector("#o-channel").value;
      const status = m.body.querySelector("#o-status").value;
      const dv = m.body.querySelector("#o-date").value;
      const when = dv ? new Date(dv).getTime() : U().now();
      S().db.outreach.push({ id: U().uid("o"), leadId, channel, status, message: m.body.querySelector("#o-message").value.trim(), notes: m.body.querySelector("#o-notes").value.trim(), contactedAt: when });
      lead.lastContacted = when; lead.updatedAt = U().now();
      if (["not_interested", "lost"].includes(status)) lead.stage = "lost";
      S().addActivity(leadId, "outreach", channel + " outreach logged (" + S().contactStatusOf(status).label + ").");
      S().save(); m.close(); V61.Toast.success("Outreach logged"); refreshCurrent();
    });
  }
  function addContact(leadId) {
    const lead = S().byId("leads", leadId);
    const m = UI.openModal({ title: "Add Contact", icon: I.users });
    m.setBody('<div class="field"><label>Name *</label><input class="input" id="c-name" placeholder="e.g. Contact name"></div>' +
      '<div class="field"><label>Role</label><input class="input" id="c-role" placeholder="e.g. Owner, Manager"></div>' +
      '<div class="field-row"><div class="field"><label>Phone</label><input class="input" id="c-phone"></div><div class="field"><label>WhatsApp</label><input class="input" id="c-wa"></div></div>' +
      '<div class="field"><label>Email</label><input class="input" id="c-email"></div>');
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Add Contact</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const name = m.body.querySelector("#c-name").value.trim();
      if (!name) return;
      S().addContact(lead.businessId, { name, role: m.body.querySelector("#c-role").value.trim(), phone: m.body.querySelector("#c-phone").value.trim(), whatsapp: m.body.querySelector("#c-wa").value.trim() || m.body.querySelector("#c-phone").value.trim(), email: m.body.querySelector("#c-email").value.trim() });
      S().addActivity(lead.id, "contact", "Contact added: " + name);
      S().save(); m.close(); V61.Toast.success("Contact added"); refreshCurrent();
    });
  }
  function overrideScore(leadId) {
    const lead = S().byId("leads", leadId);
    const m = UI.openModal({ title: "Override Lead Score", icon: I.settings });
    m.setBody('<div class="field"><label>Manual score (0–100)</label><input class="input" id="os" type="number" min="1" max="100" value="' + (lead.scoreOverride != null ? lead.scoreOverride : "") + '"></div>' +
      '<p style="font-size:12px;color:var(--text-3)">Leave empty to use the automatic score.</p>');
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const v = m.body.querySelector("#os").value;
      lead.scoreOverride = v === "" ? null : U().clamp(parseInt(v, 10), 1, 100);
      S().save(); m.close(); V61.Toast.success("Score updated"); refreshCurrent();
    });
  }
  function completeFollowup(fid) { const f = S().byId("followups", fid); if (f) { f.status = "done"; f.completedAt = U().now(); S().save(); V61.Toast.success("Follow-up completed"); refreshCurrent(); } }
  function reschedFollowup(fid) {
    const f = S().byId("followups", fid);
    const m = UI.openModal({ title: "Reschedule Follow-up", icon: I.calendar });
    m.setBody('<div class="field"><label>New due date</label><input class="input" id="r-due" type="date" value="' + (f.dueDate ? new Date(f.dueDate).toISOString().slice(0, 10) : "") + '"></div>');
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Reschedule</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const due = m.body.querySelector("#r-due").value;
      f.dueDate = due ? new Date(due + "T09:00:00").getTime() : f.dueDate;
      S().save(); m.close(); V61.Toast.success("Follow-up rescheduled"); refreshCurrent();
    });
  }
  function completeTask(tid) { const t = S().byId("tasks", tid); if (t) { t.status = "done"; S().save(); V61.Toast.success("Task completed"); refreshCurrent(); } }
  function reopenTask(tid) { const t = S().byId("tasks", tid); if (t) { t.status = "todo"; S().save(); refreshCurrent(); } }
  function delTask(tid) { const t = S().byId("tasks", tid); if (t) { S().db.tasks = S().db.tasks.filter((x) => x.id !== tid); S().save(); V61.Toast.success("Task deleted"); refreshCurrent(); } }
  function delFollowup(fid) { const f = S().byId("followups", fid); if (f) { S().db.followups = S().db.followups.filter((x) => x.id !== fid); S().save(); V61.Toast.success("Follow-up deleted"); refreshCurrent(); } }
  function delContact(cid) { const c = S().byId("contacts", cid); if (c) { S().db.contacts = S().db.contacts.filter((x) => x.id !== cid); S().save(); V61.Toast.success("Contact removed"); refreshCurrent(); } }
  function deleteLead(leadId) {
    UI.confirmDialog("Delete this lead?", "This removes the lead and its business record.", () => {
      const l = S().byId("leads", leadId);
      if (l) { S().db.leads = S().db.leads.filter((x) => x.id !== leadId); S().db.businesses = S().db.businesses.filter((x) => x.id !== l.businessId); S().save(); }
      V61.Toast.success("Lead deleted"); V61.App.nav("#/leads");
    });
  }
  function refreshCurrent() { const hash = location.hash; if (hash && V61.App) V61.App.renderRoute(); }

  function editLead(leadId) { const l = S().byId("leads", leadId); if (l) openLeadForm(l); }

  /* ── Commands exposed to global ── */
  V61.Cmd = V61.Cmd || {};
  Object.assign(V61.Cmd, {
    addLead: () => openLeadForm(null),
    editLead,
    deleteLead,
    exportLeads: () => S().exportLeadsCSV(),
    bulkStatus: () => bulkStatusModal(),
    bulkDelete: () => bulkDelete(),
    addTask, addNote, addFollowup, addOutreach, addContact,
    completeFollowup, reschedFollowup, delFollowup, completeTask, reopenTask, delTask, delContact,
    overrideScore,
    createProposal: (leadId) => { V61.Pages.sales.createProposal(leadId); },
    openAudit: (leadId) => V61.Pages.audit.openAudit(leadId),
  });

  V61.Pages.leads = { render, openLead, openLeadForm };
  V61.Leads = { state, openLeadForm, filteredRows };
})();