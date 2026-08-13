/* VISION 61 CRM — Services, Proposals, Clients, Payments */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  const PROP_STATUS = [
    { key: "draft", label: "Draft", color: "#8a8a90" },
    { key: "sent", label: "Sent", color: "#335fa8" },
    { key: "viewed", label: "Viewed", color: "#e0a53e" },
    { key: "accepted", label: "Accepted", color: "#3f9d5f" },
    { key: "rejected", label: "Rejected", color: "#e5484d" },
    { key: "expired", label: "Expired", color: "#6d6d75" },
  ];
  const propStatus = (k) => PROP_STATUS.find((s) => s.key === k) || PROP_STATUS[0];

  /* ═══ SERVICES ═══ */
  function renderServices() {
    const el = document.getElementById("content");
    const svcs = S().db.services;
    const active = svcs.filter((s) => s.active);
    const minPrice = svcs.length ? Math.min(...svcs.map((s) => s.price)) : 0;
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Business</div>' +
      '<h1 class="page-title">Services</h1><p class="page-sub">' + active.length + " active service" + (active.length === 1 ? "" : "s") + (svcs.length ? " · starting from GH₵ " + minPrice : "") + "</p></div>" +
      '<div class="page-actions"><button class="btn btn-primary" data-cmd="addService">' + I.plus + " Add Service</button></div></div>" +
      (svcs.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">' +
      svcs.map((s) =>
        '<div class="card" style="display:flex;flex-direction:column;gap:8px;' + (s.active ? "" : "opacity:.55") + '">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px"><div style="font-weight:700;font-size:14.5px">' + U().escapeHtml(s.name) + "</div>" +
        UI.badge(s.active ? "Active" : "Inactive", s.active ? "#3f9d5f" : "#8a8a90", true) + "</div>" +
        '<p style="font-size:12.5px;color:var(--text-3);line-height:1.55;flex:1">' + U().escapeHtml(s.description || "") + "</p>" +
        '<div style="display:flex;align-items:center;gap:12px;font-size:12.5px;color:var(--text-2)"><b style="font-size:15px;color:var(--text)">' + U().formatMoney(s.price) + '</b><span>' + I.clock + " ~" + s.deliveryDays + " days</span>" +
        '<div style="margin-left:auto;display:flex;gap:4px"><button class="icon-btn" data-cmd="editService:' + s.id + '">' + I.pencil + '</button><button class="icon-btn" data-cmd="toggleService:' + s.id + '">' + (s.active ? I.eye : I.refresh) + '</button><button class="icon-btn" data-cmd="delService:' + s.id + '">' + I.trash + "</button></div></div></div>"
      ).join("") + "</div>" : UI.emptyState("package", "No services yet.", "Add your service offerings so you can build proposals from your catalog.", '<button class="btn btn-primary" data-cmd="addService">' + I.plus + " Add Service</button>"));
    UI.bind(el);
  }

  function serviceModal(existing) {
    const m = UI.openModal({ title: existing ? "Edit Service" : "Add Service", icon: I.package });
    m.setBody(
      '<div class="field"><label>Service name *</label><input class="input" id="s-name" value="' + U().escapeHtml(existing ? existing.name : "") + '" placeholder="e.g. Social Media Management"></div>' +
      '<div class="field"><label>Description</label><textarea class="textarea" id="s-desc" rows="3">' + U().escapeHtml(existing ? existing.description : "") + "</textarea></div>" +
      '<div class="field-row"><div class="field"><label>Starting price (GH₵)</label><input class="input" id="s-price" type="number" min="0" value="' + (existing ? existing.price : "") + '"></div>' +
      '<div class="field"><label>Delivery (days)</label><input class="input" id="s-days" type="number" min="1" value="' + (existing ? existing.deliveryDays : 14) + '"></div></div>'
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const name = m.body.querySelector("#s-name").value.trim();
      if (!name) return;
      const data = { name, description: m.body.querySelector("#s-desc").value.trim(), price: Number(m.body.querySelector("#s-price").value) || 0, deliveryDays: Number(m.body.querySelector("#s-days").value) || 14 };
      if (existing) Object.assign(existing, data);
      else S().db.services.push(Object.assign({ id: U().uid("svc"), active: true }, data));
      S().save(); m.close(); V61.Toast.success(existing ? "Service updated" : "Service added"); renderServices();
    });
  }

  /* ═══ PROPOSALS ═══ */
  function renderProposals() {
    const el = document.getElementById("content");
    const props = S().db.proposals.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const byLead = (p) => { const l = S().byId("leads", p.leadId); return l ? S().businessOf(l) : null; };
    const value = props.filter((p) => p.status === "accepted").reduce((s, p) => s + (p.total || 0), 0);
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Sales</div>' +
      '<h1 class="page-title">Proposals</h1><p class="page-sub">' + props.length + " proposals · " + U().formatMoney(value) + " accepted</p></div></div>" +
      (props.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Proposal</th><th>Client</th><th>Status</th><th>Total</th><th>Valid until</th><th>Created</th><th></th></tr></thead><tbody>' +
        props.map((p) => {
          const biz = byLead(p);
          return "<tr><td><div class='b-name'>" + U().escapeHtml(p.title || "Proposal") + "</div><div class='b-cat'>" + p.items.length + " line item" + (p.items.length === 1 ? "" : "s") + "</div></td>" +
            "<td>" + (biz ? '<div class="b-name"><a href="#/proposals/' + p.id + '">' + U().escapeHtml(biz.name) + "</a></div>" : "—") + "</td>" +
            "<td>" + UI.badge(propStatus(p.status).label, propStatus(p.status).color, true) + "</td>" +
            "<td><b>" + U().formatMoney(p.total) + "</b></td>" +
            "<td><span class='cell-sub'>" + (p.validUntil ? U().formatDate(p.validUntil) : "—") + "</span></td>" +
            "<td><span class='cell-sub'>" + U().relativeTime(p.createdAt) + "</span></td>" +
            '<td><a class="btn btn-sm btn-ghost" href="#/proposals/' + p.id + '">' + I.eye + " View</a></td></tr>";
        }).join("") + "</tbody></table></div>" :
        UI.emptyState("fileText", "No proposals yet.", "Create a proposal from any qualified lead to turn interest into revenue.")) ;
    UI.bind(el);
  }

  function createProposal(leadId, prefillName, manualItem) {
    const lead = S().byId("leads", leadId);
    if (!lead) { V61.Toast.error("Lead not found"); return; }
    const biz = S().businessOf(lead);
    const svcs = S().db.services.filter((s) => s.active);
    const pre = prefillName ? svcs.find((s) => s.name.toLowerCase() === String(prefillName).toLowerCase()) : null;
    let items;
    if (pre) items = [{ serviceId: pre.id, name: pre.name, qty: 1, price: pre.price }];
    else if (manualItem && manualItem.name) items = [{ serviceId: null, name: manualItem.name, qty: 1, price: Number(manualItem.price) || 0 }];
    else items = svcs.length ? svcs.slice(0, 3).map((s) => ({ serviceId: s.id, name: s.name, qty: 1, price: s.price })) : [{ serviceId: null, name: "", qty: 1, price: 0 }];
    let subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    let discount = 0;

    const m = UI.openModal({ title: "Create Proposal — " + (biz ? biz.name : ""), icon: I.fileText, size: "modal-xl" });

    function itemPrice(row) {
      const sel = row.querySelector("select");
      if (sel) { const svc = svcs.find((x) => x.id === sel.value); return svc ? svc.price : 0; }
      return Number(row.querySelector(".p-price").value) || 0;
    }

    function totals() {
      const qs = m.body.querySelectorAll(".prop-item-row");
      let sub = 0;
      qs.forEach((row) => {
        const q = Number(row.querySelector(".p-qty").value) || 1;
        const price = itemPrice(row);
        sub += price * q;
        row.querySelector(".line-total").textContent = U().formatMoney(price * q);
      });
      subtotal = sub;
      discount = Number(m.body.querySelector("#p-discount").value) || 0;
      const total = Math.max(0, subtotal - discount);
      m.body.querySelector("#p-subtotal").textContent = U().formatMoney(subtotal);
      m.body.querySelector("#p-total").textContent = U().formatMoney(total);
      return total;
    }

    function itemHtml(i) {
      if (i.serviceId && svcs.some((s) => s.id === i.serviceId)) {
        return '<div class="prop-item-row"><select class="select grow">' +
          svcs.map((s) => '<option value="' + s.id + '"' + (s.id === i.serviceId ? " selected" : "") + ">" + U().escapeHtml(s.name) + " (" + U().formatMoney(s.price) + ")</option>").join("") +
          '</select><input class="input p-qty" type="number" min="1" value="' + i.qty + '"><span class="line-total">' + U().formatMoney(i.price * i.qty) + '</span>' +
          '<button class="icon-btn" data-del-item>' + I.trash + "</button></div>";
      }
      return '<div class="prop-item-row"><input class="input p-name grow" placeholder="Service or deliverable" value="' + U().escapeHtml(i.name || "") + '">' +
        '<input class="input p-price" type="number" min="0" placeholder="Price (GH₵)" value="' + (i.price || "") + '">' +
        '<input class="input p-qty" type="number" min="1" value="' + i.qty + '"><span class="line-total">' + U().formatMoney(i.price * i.qty) + '</span>' +
        '<button class="icon-btn" data-del-item>' + I.trash + "</button></div>";
    }

    m.setBody(
      '<div class="field"><label>Proposal title</label><input class="input" id="p-title" value="' + U().escapeHtml(biz.name + " — " + (prefillName || "Website & Digital Growth")) + '"></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 8px"><b style="font-size:13px">' + (svcs.length ? "Services" : "Line items") + '</b><button class="btn btn-sm" data-add-item>' + I.plus + " Add " + (svcs.length ? "service" : "item") + "</button></div>" +
      (!svcs.length ? '<p style="font-size:12px;color:var(--text-3);margin-bottom:8px">No services in your catalog yet — add line items manually, or add services from the Services page first.</p>' : "") +
      '<div class="stack" id="prop-items">' + items.map(itemHtml).join("") + "</div>" +
      '<div class="field-row" style="margin-top:12px"><div class="field"><label>Discount (GH₵)</label><input class="input" id="p-discount" type="number" min="0" value="0"></div>' +
      '<div class="field"><label>Valid until</label><input class="input" id="p-valid" type="date" value="' + new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) + '"></div></div>' +
      '<div class="field"><label>Deliverables & timeline</label><textarea class="textarea" id="p-deliverables" rows="2" placeholder="e.g. Design mockups in week 1, site live in 14 days"></textarea></div>' +
      '<div class="field"><label>Payment terms</label><input class="input" id="p-terms" value="50% deposit to start, balance on delivery"></div>' +
      '<div class="totals"><div class="row-t"><span style="color:var(--text-3)">Subtotal</span><span id="p-subtotal">' + U().formatMoney(subtotal) + "</span></div>" +
      '<div class="row-t"><span style="color:var(--text-3)">Discount</span><span style="color:var(--danger)">-' + U().formatMoney(0) + "</span></div>" +
      '<div class="row-t grand"><span>Total</span><b id="p-total">' + U().formatMoney(subtotal) + "</b></div></div>"
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>' + I.fileText + " Create Proposal</button>");

    m.body.querySelector("[data-add-item]").addEventListener("click", () => {
      const first = svcs.find((s) => s.active);
      const item = first ? { serviceId: first.id, qty: 1, price: first.price } : { serviceId: null, name: "", qty: 1, price: 0 };
      m.body.querySelector("#prop-items").insertAdjacentHTML("beforeend", itemHtml(item));
      bindItems(); totals();
    });
    function bindItems() {
      m.body.querySelectorAll("[data-del-item]").forEach((b) => b.addEventListener("click", () => { b.closest(".prop-item-row").remove(); totals(); }));
      m.body.querySelectorAll(".prop-item-row select, .prop-item-row .input").forEach((x) => x.addEventListener("change", totals));
      m.body.querySelectorAll(".prop-item-row .p-price, .prop-item-row .p-qty").forEach((x) => x.addEventListener("input", totals));
    }
    bindItems();
    m.body.querySelector("#p-discount").addEventListener("input", totals);
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const title = m.body.querySelector("#p-title").value.trim() || "Proposal";
      const lineItems = [];
      m.body.querySelectorAll(".prop-item-row").forEach((row) => {
        const sel = row.querySelector("select");
        const qty = Number(row.querySelector(".p-qty").value) || 1;
        if (sel) {
          const svc = svcs.find((x) => x.id === sel.value);
          if (svc) lineItems.push({ serviceId: svc.id, name: svc.name, qty, price: svc.price });
        } else {
          const name = row.querySelector(".p-name").value.trim();
          const price = Number(row.querySelector(".p-price").value) || 0;
          if (name) lineItems.push({ serviceId: null, name, qty, price });
        }
      });
      if (!lineItems.length) { V61.Toast.error("Add at least one line item"); return; }
      const total = Math.max(0, subtotal - discount);
      const p = { id: U().uid("p"), leadId: lead.id, title, status: "draft", items: lineItems, subtotal, discount, total,
        deliverables: m.body.querySelector("#p-deliverables").value.trim(), paymentTerms: m.body.querySelector("#p-terms").value.trim(),
        validUntil: m.body.querySelector("#p-valid").value ? new Date(m.body.querySelector("#p-valid").value + "T09:00:00").getTime() : null,
        createdAt: U().now() };
      S().db.proposals.push(p);
      lead.updatedAt = U().now();
      S().addActivity(lead.id, "proposal", "Proposal created (" + U().formatMoney(total) + ").");
      S().save(); m.close(); V61.Toast.success("Proposal created");
      V61.App.nav("#/proposals/" + p.id);
    });
  }

  function proposalDetail(id) {
    const p = S().byId("proposals", id);
    if (!p) { V61.App.nav("#/proposals"); return; }
    const lead = S().byId("leads", p.leadId);
    const biz = lead ? S().businessOf(lead) : null;
    const el = document.getElementById("content");
    el.innerHTML =
      '<a href="#/proposals" class="btn btn-ghost" style="margin-bottom:14px">' + I.chevronL + " Back to proposals</a>" +
      '<div class="panel" style="max-width:760px"><div class="panel-head"><div style="display:flex;flex-direction:column;gap:6px"><div class="panel-title">' + U().escapeHtml(p.title) + "</div>" +
      '<div style="font-size:12.5px;color:var(--text-3)">' + (biz ? U().escapeHtml(biz.name) + " · " + U().escapeHtml([biz.city, biz.phone].filter(Boolean).join(" · ")) : "") + "</div></div>" +
      '<div style="display:flex;gap:8px;align-items:center">' + UI.badge(propStatus(p.status).label, propStatus(p.status).color, true) +
      '<select class="select" style="width:130px" data-status="' + p.id + '">' + PROP_STATUS.map((s) => '<option value="' + s.key + '"' + (p.status === s.key ? " selected" : "") + ">" + s.label + "</option>").join("") + "</select></div></div>" +
      '<div class="panel-body">' +
      '<table class="data" style="min-width:0"><thead><tr><th>Service</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>' +
      p.items.map((i) => "<tr><td>" + U().escapeHtml(i.name) + "</td><td>" + i.qty + "</td><td>" + U().formatMoney(i.price) + "</td><td><b>" + U().formatMoney(i.price * i.qty) + "</b></td></tr>").join("") +
      "</tbody></table>" +
      '<div class="totals"><div class="row-t"><span style="color:var(--text-3)">Subtotal</span><span>' + U().formatMoney(p.subtotal) + "</span></div>" +
      '<div class="row-t"><span style="color:var(--text-3)">Discount</span><span style="color:var(--danger)">-' + U().formatMoney(p.discount) + "</span></div>" +
      '<div class="row-t grand"><span>Total</span><b>' + U().formatMoney(p.total) + "</b></div></div>" +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px;font-size:12.5px;color:var(--text-2)">' +
      '<div><b style="color:var(--text)">Deliverables & timeline</b><br>' + U().escapeHtml(p.deliverables || "—") + "</div>" +
      '<div><b style="color:var(--text)">Payment terms</b><br>' + U().escapeHtml(p.paymentTerms || "—") + "<br><br><b style='color:var(--text)'>Valid until</b><br>" + (p.validUntil ? U().formatDate(p.validUntil) : "—") + "</div></div>" +
      (lead ? '<div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-sm" href="#/leads/' + lead.id + '">' + I.eye + " Open lead</a>" +
        (p.status === "draft" ? '<button class="btn btn-sm btn-primary" data-cmd="markProposalSent:' + p.id + '">' + I.send + " Mark as Sent</button>" : "") +
        '<button class="btn btn-sm btn-primary" data-cmd="acceptProposal:' + p.id + '">' + I.check + " Mark accepted</button>" +
        '<button class="btn btn-sm btn-danger" data-cmd="rejectProposal:' + p.id + '">Mark rejected</button></div>' +
        '<p style="font-size:12px;color:var(--text-3);margin-top:8px">Use "Mark as Sent" only after you have explicitly confirmed the proposal with the client — the lead moves to the Proposal Sent stage only then.</p>' : "") +
      "</div></div>";
    UI.bind(el);
    const sel = el.querySelector("[data-status]");
    if (sel) sel.addEventListener("change", (e) => {
      const st = e.target.value;
      if (st === "accepted" && lead && lead.stage !== "won") { lead.stage = "won"; lead.wonAt = U().now(); S().ensureClient(lead); }
      S().addActivity(p.leadId, "proposal", "Proposal marked " + propStatus(st).label + ".");
      S().save(); V61.Toast.success("Proposal status: " + propStatus(st).label); V61.App.renderRoute();
    });
  }

  /* ═══ CLIENTS ═══ */
  function renderClients() {
    const el = document.getElementById("content");
    const rows = S().clientRows();
    const rev = rows.reduce((s, r) => s + r.paid, 0);
    const out = rows.reduce((s, r) => s + r.outstanding, 0);
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Sales</div>' +
      '<h1 class="page-title">Clients</h1><p class="page-sub">' + rows.length + " clients · " + U().formatMoney(rev) + " collected · " + U().formatMoney(out) + " outstanding</p></div></div>" +
      '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">' +
      '<div class="kpi accent"><div class="k-label">' + I.dollar + ' Won revenue</div><div class="k-value">' + U().formatMoney(S().wonRevenue()) + "</div></div>" +
      '<div class="kpi"><div class="k-label">' + I.credit + ' Collected</div><div class="k-value">' + U().formatMoney(rev) + "</div></div>" +
      '<div class="kpi"><div class="k-label">' + I.alert + ' Outstanding</div><div class="k-value">' + U().formatMoney(out) + "</div></div>" +
      '<div class="kpi"><div class="k-label">' + I.refresh + ' Monthly recurring</div><div class="k-value">' + U().formatMoney(S().mrr()) + "</div></div></div>" +
      (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Client</th><th>Location</th><th>Status</th><th>Services</th><th>Paid</th><th>Outstanding</th><th>Client since</th><th></th></tr></thead><tbody>' +
        rows.map((r) => {
          const b = r.business || {};
          return "<tr><td><div class='biz-cell'><div style='width:32px;height:32px;border-radius:9px;background:" + UI.hexA(U().avatarColor(b.name || "?"), .15) + ";color:" + U().avatarColor(b.name) + ";display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px'>" + U().initials(b.name) + "</div><div><div class='b-name'><a href='#/clients/" + r.client.id + "'>" + U().escapeHtml(b.name) + "</a></div><div class='b-cat'>" + U().escapeHtml(b.category || "") + "</div></div></div></td>" +
            "<td><span class='cell-sub'>" + U().escapeHtml(b.city || "—") + "</span></td>" +
            "<td>" + UI.badge(r.client.status, r.client.status === "active" ? "#3f9d5f" : "#8a8a90", true) + "</td>" +
            "<td><span class='cell-sub'>" + (r.client.services || []).length + " active</span></td>" +
            "<td><b style='color:var(--ok)'>" + U().formatMoney(r.paid) + "</b></td>" +
            "<td><b " + (r.outstanding ? "style='color:var(--danger)'" : "style='color:var(--text-3)'") + ">" + U().formatMoney(r.outstanding) + "</b></td>" +
            "<td><span class='cell-sub'>" + U().relativeTime(r.client.createdAt) + "</span></td>" +
            '<td><a class="btn btn-sm btn-ghost" href="#/clients/' + r.client.id + '">' + I.eye + " Open</a></td></tr>";
        }).join("") + "</tbody></table></div>" :
        UI.emptyState("briefcase", "No clients yet.", "When a lead reaches the Won stage it's automatically converted into a client.")) ;
    UI.bind(el);
  }

  function clientDetail(id) {
    const c = S().byId("clients", id);
    if (!c) { V61.App.nav("#/clients"); return; }
    const biz = S().businessOf({ businessId: c.businessId });
    const payments = S().paymentsFor(c.id);
    const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0);
    const outstanding = payments.filter((p) => p.status === "pending").reduce((s, p) => s + (p.amount || 0), 0);
    const svcNames = (c.services || []).map((s) => { const svc = S().byId("services", s.serviceId); return svc ? svc.name : s.serviceId; });
    const lead = c.leadId ? S().byId("leads", c.leadId) : null;
    const tasks = lead ? S().tasksFor(lead.id).filter((t) => t.status !== "done") : [];
    const el = document.getElementById("content");

    el.innerHTML =
      '<a href="#/clients" class="btn btn-ghost" style="margin-bottom:14px">' + I.chevronL + " Back to clients</a>" +
      '<div class="panel" style="padding:22px"><div class="ld-head">' +
      '<div class="avatar big" style="background:' + UI.hexA(U().avatarColor(biz.name), .15) + ';color:' + U().avatarColor(biz.name) + '">' + U().initials(biz.name) + "</div>" +
      '<div style="flex:1"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h1 class="ld-title">' + U().escapeHtml(biz.name) + "</h1>" + UI.badge(c.status, c.status === "active" ? "#3f9d5f" : "#8a8a90", true) + "</div>" +
      '<div class="ld-sub">' + U().escapeHtml([biz.category, biz.city].filter(Boolean).join(" • ") || "Client") + ' · Client since ' + U().formatDate(c.createdAt) + "</div>" +
      '<div class="ld-actions" style="margin-top:12px">' + UI.contactLinks(biz) + (lead ? '<a class="mini-btn" href="#/leads/' + lead.id + '">' + I.eye + " Source lead</a>" : "") + "</div></div></div></div>" +

      '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));margin-top:18px">' +
      '<div class="kpi accent"><div class="k-label">' + I.dollar + ' Collected</div><div class="k-value">' + U().formatMoney(paid) + "</div></div>" +
      '<div class="kpi"><div class="k-label">' + I.alert + ' Outstanding</div><div class="k-value">' + U().formatMoney(outstanding) + "</div></div>" +
      '<div class="kpi"><div class="k-label">' + I.package + ' Active services</div><div class="k-value">' + (c.services || []).length + "</div></div>" +
      '<div class="kpi"><div class="k-label">' + I.checkSquare + ' Open tasks</div><div class="k-value">' + tasks.length + "</div></div></div>" +

      '<div class="grid-2-1"><div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.package + ' Services & projects</div>' + '<button class="btn btn-sm" data-cmd="addClientService:' + c.id + '">' + I.plus + " Add service</button></div>" +
      '<div class="panel-body"><div class="stack">' + (c.services && c.services.length ? c.services.map((s) => {
        const svc = S().byId("services", s.serviceId);
        const nm = svc ? svc.name : s.serviceId;
        const st = s.status === "done" ? { label: "Completed", color: "#3f9d5f" } : s.status === "in_progress" ? { label: "In progress", color: "#e0a53e" } : { label: "Planned", color: "#8a8a90" };
        return '<div class="row-card" style="padding:12px 14px"><div class="rc-main"><div class="rc-title" style="font-size:13.5px">' + U().escapeHtml(nm) + "</div><div class='rc-sub'>Started " + (s.startDate ? U().formatDate(s.startDate) : "—") + "</div></div>" + UI.badge(st.label, st.color, true) +
          '<div class="rc-actions"><button class="icon-btn" data-cmd="toggleClientService:' + c.id + ":" + s.serviceId + '" title="Toggle status">' + I.refresh + "</button></div></div>";
      }).join("") : UI.emptyState("package", "No services yet.", "Add the services this client has purchased.")) + "</div></div></div>" +

      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.credit + " Payments" + '<span class="sub">' + payments.length + "</span></div><button class='btn btn-sm' data-cmd='addPayment:" + c.id + "'>" + I.plus + " Record payment</button></div>" +
      '<div class="panel-body">' + (payments.length ? '<div class="table-wrap" style="border:none"><table class="data" style="min-width:480px"><thead><tr><th>Date</th><th>Reference</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>' +
        payments.map((p) => "<tr><td><span class='cell-sub'>" + U().formatDate(p.date) + "</span></td><td>" + U().escapeHtml(p.reference || "—") + "</td><td><b>" + U().formatMoney(p.amount) + "</b></td>" +
          "<td>" + UI.badge(p.status === "paid" ? "Paid" : "Pending", p.status === "paid" ? "#3f9d5f" : "#e0a53e", true) + "</td>" +
          '<td><button class="icon-btn" data-cmd="delPayment:' + p.id + '">' + I.trash + "</button></td></tr>").join("") +
        "</tbody></table></div>" : UI.emptyState("credit", "No payments recorded.")) + "</div></div>" +
      "</div>" +

      '<div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.briefcase + ' Business info</div></div><div class="panel-body"><div class="info-grid">' +
      infoItem("Phone", biz.phone ? '<a href="tel:' + U().phoneDigits(biz.phone) + '">' + U().escapeHtml(biz.phone) + "</a>" : "") +
      infoItem("Email", biz.email ? '<a href="mailto:' + U().escapeHtml(biz.email) + '">' + U().escapeHtml(biz.email) + "</a>" : "") +
      infoItem("Website", biz.website ? U().urlify(biz.website, biz.website) : "") +
      infoItem("Address", biz.address) + infoItem("Category", biz.category) +
      "</div></div></div>" +
      (tasks.length ? '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.checkSquare + ' Open tasks</div></div><div class="panel-body"><div class="stack">' +
        tasks.map((t) => '<div style="display:flex;align-items:center;gap:10px;font-size:13px;padding:8px 0;border-bottom:1px dashed var(--border)">' + (t.dueDate ? '<span class="kb-due ' + (t.dueDate < U().todayStart() ? "overdue" : "") + '">' + I.clock + U().relativeDue(t.dueDate) + "</span>" : I.clock) + '<span style="flex:1">' + U().escapeHtml(t.title) + "</span></div>").join("") +
        "</div></div></div>" : "") +
      "</div></div>";
    UI.bind(el);
  }

  function infoItem(label, valueHtml) {
    return '<div class="info-item"><div class="i-label">' + U().escapeHtml(label) + '</div><div class="i-value">' + (valueHtml || '<span style="color:var(--text-3)">—</span>') + "</div></div>";
  }

  /* payment + client service helpers */
  function addPayment(clientId) {
    const m = UI.openModal({ title: "Record Payment", icon: I.credit });
    m.setBody('<div class="field"><label>Amount (GH₵)</label><input class="input" id="pay-amount" type="number" min="0"></div>' +
      '<div class="field-row"><div class="field"><label>Date</label><input class="input" id="pay-date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
      '<div class="field"><label>Type</label><select class="select" id="pay-kind"><option value="project">Project</option><option value="mrr">Monthly retainer</option></select></div></div>' +
      '<div class="field-row"><div class="field"><label>Status</label><select class="select" id="pay-status"><option value="paid">Paid</option><option value="pending">Pending</option></select></div>' +
      '<div class="field"><label>Reference</label><input class="input" id="pay-ref" placeholder="Invoice #..."></div></div>');
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const amt = Number(m.body.querySelector("#pay-amount").value);
      if (!amt) { V61.Toast.error("Enter an amount"); return; }
      const dv = m.body.querySelector("#pay-date").value;
      S().db.payments.push({ id: U().uid("pay"), clientId, amount: amt, status: m.body.querySelector("#pay-status").value, kind: m.body.querySelector("#pay-kind").value, date: dv ? new Date(dv + "T12:00:00").getTime() : U().now(), reference: m.body.querySelector("#pay-ref").value.trim() });
      S().save(); m.close(); V61.Toast.success("Payment recorded"); V61.App.renderRoute();
    });
  }
  function addClientService(clientId) {
    const c = S().byId("clients", clientId);
    if (!S().db.services.length) { V61.Toast.error("Add services to your catalog first"); return; }
    const m = UI.openModal({ title: "Add Service to Client", icon: I.package });
    m.setBody('<div class="field"><label>Service</label><select class="select" id="cs-svc">' + S().db.services.map((s) => '<option value="' + s.id + '">' + U().escapeHtml(s.name) + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Status</label><select class="select" id="cs-status"><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="done">Completed</option></select></div>');
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Add</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const svcId = m.body.querySelector("#cs-svc").value;
      if ((c.services || []).some((s) => s.serviceId === svcId)) { V61.Toast.error("Already added"); return; }
      c.services = c.services || [];
      c.services.push({ serviceId: svcId, status: m.body.querySelector("#cs-status").value, startDate: U().now() });
      S().save(); m.close(); V61.Toast.success("Service added"); V61.App.renderRoute();
    });
  }
  function toggleClientService(arg) {
    const [clientId, svcId] = arg.split(":");
    const c = S().byId("clients", clientId);
    const s = (c.services || []).find((x) => x.serviceId === svcId);
    if (!s) return;
    s.status = s.status === "done" ? "in_progress" : s.status === "in_progress" ? "planned" : "done";
    S().save(); V61.Toast.success("Service status updated"); V61.App.renderRoute();
  }

  V61.Cmd = V61.Cmd || {};
  Object.assign(V61.Cmd, {
    addService: () => serviceModal(null), editService: (id) => serviceModal(S().byId("services", id)),
    toggleService: (id) => { const s = S().byId("services", id); if (s) { s.active = !s.active; S().save(); renderServices(); } },
    delService: (id) => UI.confirmDialog("Delete service?", "This removes it from the services list.", () => { S().db.services = S().db.services.filter((x) => x.id !== id); S().save(); renderServices(); }),
    createProposal, acceptProposal: (id) => { const p = S().byId("proposals", id); if (p) { p.status = "accepted"; const l = S().byId("leads", p.leadId); if (l && l.stage !== "won") { l.stage = "won"; l.wonAt = U().now(); S().ensureClient(l); } S().addActivity(p.leadId, "proposal", "Proposal accepted."); S().save(); V61.Toast.success("Proposal accepted"); V61.App.renderRoute(); } },
    markProposalSent: (id) => { const p = S().byId("proposals", id); if (p) { p.status = "sent"; const l = S().byId("leads", p.leadId); if (l && l.stage !== "won" && l.stage !== "lost" && l.stage !== "proposal" && l.stage !== "negotiation") l.stage = "proposal"; S().addActivity(p.leadId, "proposal", "Proposal marked as sent."); S().save(); V61.Toast.success("Proposal marked as sent"); V61.App.renderRoute(); } },
    rejectProposal: (id) => { const p = S().byId("proposals", id); if (p) { p.status = "rejected"; S().addActivity(p.leadId, "proposal", "Proposal rejected."); S().save(); V61.Toast.success("Proposal marked rejected"); V61.App.renderRoute(); } },
    addPayment, addClientService, toggleClientService,
    delPayment: (id) => { S().db.payments = S().db.payments.filter((x) => x.id !== id); S().save(); V61.Toast.success("Payment deleted"); V61.App.renderRoute(); },
  });

  V61.Pages.services = renderServices;
  V61.Pages.proposals = renderProposals;
  V61.Pages.clients = renderClients;
  V61.Pages.sales = { renderProposals, createProposal, proposalDetail, renderServices, renderClients, clientDetail };
})();