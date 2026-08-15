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
    const lost = rows.filter((r) => r.lead.stage === "lost").length;
    const active = rows.filter((r) => !["won", "lost"].includes(r.lead.stage)).length;
    const activeVal = pipelineValue();
    const wonVal = S().wonRevenue();
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Sales</div>' +
      '<h1 class="page-title">Pipeline</h1><p class="page-sub">' + active + " active deals · " + won + " won · " + lost + " lost</p></div>" +
      '<div class="page-actions"><button class="btn" data-cmd="addLead">' + I.plus + " Add Lead</button></div></div>" +
      '<div class="stat-strip">' +
      '<div class="ss"><span class="ss-label">Active deals</span><span class="ss-value">' + active + "</span></div>" +
      '<div class="ss acc"><span class="ss-label">Pipeline value</span><span class="ss-value">' + U().formatCompact(activeVal) + "</span></div>" +
      '<div class="ss ok"><span class="ss-label">Won</span><span class="ss-value">' + won + "</span></div>" +
      '<div class="ss"><span class="ss-label">Won value</span><span class="ss-value">' + U().formatCompact(wonVal) + "</span></div>" +
      '<div class="ss bad"><span class="ss-label">Lost</span><span class="ss-value">' + lost + "</span></div>" +
      '<div class="ss"><span class="ss-label">Avg deal</span><span class="ss-value">' + U().formatCompact(Math.round(activeVal / Math.max(1, active))) + "</span></div>" +
      "</div>" +
      '<div class="kanban" id="pipeline-kanban">' + S().STAGES.map((s) => {
        const col = rows.filter((r) => r.lead.stage === s.key);
        const sum = stageValue(s.key);
        return '<div class="kb-col' + (s.key === "won" ? " win-col" : s.key === "lost" ? " lose-col" : "") + '" data-stage="' + s.key + '"><div class="kb-col-head">' +
          '<span class="kb-col-title"><span class="badge-dot" style="background:' + s.color + '"></span>' + s.label + "</span>" +
          '<span class="kb-count">' + col.length + "</span>" +
          (sum ? '<span class="kb-col-value">' + U().formatCompact(sum) + "</span>" : "") + "</div>" +
          '<div class="progress" style="margin:0 13px 4px"><i style="width:' + Math.round((col.length / Math.max(1, total)) * 100) + '%;background:' + s.color + '"></i></div>' +
          '<div class="kb-col-body">' + (col.length ? col.map((r) => {
            const b = r.business || {};
            const fu = S().nextFollowup(r.lead.id);
            const wa = b.whatsapp || b.phone;
            return '<div class="kb-card" data-drag="' + r.lead.id + '" data-drag-stage="' + r.lead.stage + '" data-open="' + r.lead.id + '">' +
              '<div class="kb-top"><div><div class="kb-name"><a href="#/leads/' + r.lead.id + '" style="color:inherit">' + U().escapeHtml(b.name) + "</a></div>" +
              '<div class="kb-cat">' + U().escapeHtml([b.category, b.city].filter(Boolean).join(" • ")) + "</div></div>" +
              '<span style="display:flex;gap:4px;align-items:center">' + UI.miniScore(r.leadScore) +
              '<button class="icon-btn kb-move" data-move="' + r.lead.id + '" title="Move to stage">' + I.moreH + "</button></span></div>" +
              '<div class="kb-meta"><span class="kb-value">' + U().formatMoney(r.lead.estimatedValue) + "</span>" +
              (fu ? '<span class="kb-due ' + (fu.dueDate < U().todayStart() ? "overdue" : "") + '">' + I.clock + U().relativeDue(fu.dueDate) + "</span>" : "") +
              (wa ? '<a class="mini-btn" style="padding:1px 7px;margin-left:auto" target="_blank" rel="noopener" href="' + U().waLink(wa) + '">' + I.whatsapp + "</a>" : "") +
              "</div></div>";
          }).join("") : '<div class="kb-empty">Drop leads here</div>') + "</div>" +
          '<div class="kb-col-foot"><span>Total</span><b>' + U().formatMoney(sum) + "</b></div></div>";
      }).join("") + "</div>";
    UI.bind(el);
    bindDrag();
    el.querySelectorAll(".kb-card[data-open]").forEach((c) => c.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      V61.App.nav("#/leads/" + c.dataset.open);
    }));
  }

  function moveLead(id, toStage) {
    const lead = S().byId("leads", id);
    if (!lead || lead.stage === toStage) return;
    const from = lead.stage;
    lead.stage = toStage; lead.updatedAt = U().now();
    if (toStage === "won") { lead.wonAt = U().now(); if (!S().clientOf(lead.businessId)) convertToClient(lead); }
    if (toStage === "lost" && lead.wonAt) delete lead.wonAt;
    S().addActivity(lead.id, "stage", "Lead moved from " + S().stageOf(from).label + " to " + S().stageOf(toStage).label + ".");
    S().save(); V61.Toast.success("Lead moved to " + S().stageOf(toStage).label);
    V61.App.renderRoute();
  }

  function bindDrag() {
    const kanban = document.getElementById("pipeline-kanban");
    if (!kanban) return;
    kanban.querySelectorAll(".kb-card").forEach((card) => {
      card.addEventListener("pointerdown", (e) => {
        if (e.target.closest("a") || e.target.closest("button")) return;
        startDrag(card, e);
      });
    });
    kanban.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      V61.UI.menuPop(b, S().STAGES.filter((s) => s.key !== b.closest(".kb-col").dataset.stage).map((s) => ({
        text: "Move to " + s.label, icon: I.chevronR, action: () => moveLead(b.dataset.move, s.key),
      })));
    }));
  }

  function startDrag(card, e) {
    const kanban = document.getElementById("pipeline-kanban");
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
      if (col && col.dataset.stage !== card.dataset.dragStage) moveLead(card.dataset.drag, col.dataset.stage);
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

  function convertToClient(lead) {
    S().ensureClient(lead);
  }

  V61.Pages.pipeline = render;
})();