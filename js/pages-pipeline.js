/* VISION 61 CRM — Pipeline kanban */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  function pipelineValue() {
    let v = 0;
    S().db.leads.forEach((l) => { if (!["won", "lost"].includes(l.stage)) v += l.estimatedValue || 0; });
    return v;
  }
  function stageValue(stageKey) {
    return S().db.leads.filter((l) => l.stage === stageKey).reduce((s, l) => s + (l.estimatedValue || 0), 0);
  }

  function render() {
    const el = document.getElementById("content");
    const rows = S().leadRows();
    const total = rows.length;
    const won = rows.filter((r) => r.lead.stage === "won").length;
    const active = rows.filter((r) => !["won", "lost"].includes(r.lead.stage)).length;
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Sales</div>' +
      '<h1 class="page-title">Pipeline</h1><p class="page-sub">' + active + " active deals · " + won + " won · " + U().formatMoney(pipelineValue()) + " in play</p></div>" +
      '<div class="page-actions"><button class="btn" data-cmd="addLead">' + I.plus + " Add Lead</button></div></div>" +
      '<div class="kanban" id="pipeline-kanban">' + S().STAGES.map((s) => {
        const col = rows.filter((r) => r.lead.stage === s.key);
        const w = s.key === "won" || s.key === "lost" ? "50%" : "10%";
        const sum = stageValue(s.key);
        return '<div class="kb-col" data-stage="' + s.key + '"><div class="kb-col-head">' +
          '<span class="kb-col-title"><span class="badge-dot" style="background:' + s.color + '"></span>' + s.label + "</span>" +
          '<span class="kb-count">' + col.length + "</span></div>" +
          '<div class="progress" style="margin:0 13px 4px"><i style="width:' + Math.round((col.length / Math.max(1, total)) * 100) + '%;background:' + s.color + '"></i></div>' +
          '<div class="kb-col-body">' + col.map((r) => {
            const b = r.business || {};
            const fu = S().nextFollowup(r.lead.id);
            const wa = b.whatsapp || b.phone;
            return '<div class="kb-card" draggable="true" data-drag="' + r.lead.id + '" data-open="' + r.lead.id + '">' +
              '<div class="kb-top"><div><div class="kb-name"><a href="#/leads/' + r.lead.id + '" style="color:inherit">' + U().escapeHtml(b.name) + "</a></div>" +
              '<div class="kb-cat">' + U().escapeHtml([b.category, b.city].filter(Boolean).join(" • ")) + "</div></div>" +
              '<span style="display:flex;gap:4px;align-items:center">' + UI.miniScore(r.leadScore) + "</span></div>" +
              '<div class="kb-meta"><span class="kb-value">' + U().formatMoney(r.lead.estimatedValue) + "</span>" +
              (fu ? '<span class="kb-due ' + (fu.dueDate < U().todayStart() ? "overdue" : "") + '">' + I.clock + U().relativeDue(fu.dueDate) + "</span>" : "") +
              (wa ? '<a class="mini-btn" style="padding:1px 7px" target="_blank" rel="noopener" href="' + U().waLink(wa) + '">' + I.whatsapp + "</a>" : "") +
              "</div></div>";
          }).join("") + '</div><div style="padding:9px 13px;border-top:1px solid var(--border);font-size:11.5px;color:var(--text-3);font-weight:600">' + U().formatMoney(sum) + "</div></div>";
      }).join("") + "</div>";
    UI.bind(el);
    bindDrag();
    el.querySelectorAll(".kb-card[data-open]").forEach((c) => c.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      V61.App.nav("#/leads/" + c.dataset.open);
    }));
  }

  function bindDrag() {
    const kanban = document.getElementById("pipeline-kanban");
    if (!kanban) return;
    kanban.querySelectorAll(".kb-card[draggable]").forEach((card) => {
      card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", card.dataset.drag); card.classList.add("dragging"); });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
    });
    kanban.querySelectorAll(".kb-col").forEach((col) => {
      col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
      col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
      col.addEventListener("drop", (e) => {
        e.preventDefault(); col.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/plain");
        const lead = S().byId("leads", id);
        if (!lead || lead.stage === col.dataset.stage) return;
        const from = lead.stage;
        lead.stage = col.dataset.stage; lead.updatedAt = U().now();
        if (col.dataset.stage === "won") { lead.wonAt = U().now(); if (!S().clientOf(lead.businessId)) convertToClient(lead); }
        if (col.dataset.stage === "lost" && lead.wonAt) delete lead.wonAt;
        S().addActivity(lead.id, "stage", "Lead moved from " + S().stageOf(from).label + " to " + S().stageOf(col.dataset.stage).label + ".");
        S().save(); V61.Toast.success("Lead moved to " + S().stageOf(col.dataset.stage).label);
        V61.App.renderRoute();
      });
    });
  }

  function convertToClient(lead) {
    S().ensureClient(lead);
  }

  V61.Pages.pipeline = render;
})();