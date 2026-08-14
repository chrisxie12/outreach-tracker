/* VISION 61 CRM — Invoices & Payments: billing, recording, financial tracking */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  /* ── INVOICE LIST ── */
  function renderInvoices() {
    const el = document.getElementById("content");
    const invs = S().db.invoices.slice().sort((a, b) => (b.issueDate || 0) - (a.issueDate || 0));

    const totalOut = invs.reduce((s, inv) => s + (inv.status !== 'cancelled' ? inv.balance : 0), 0);
    const overdue = invs.filter(inv => inv.status === 'overdue').length;

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Finance</div>' +
      '<h1 class="page-title">Invoices</h1><p class="page-sub">' + invs.length + " invoices · " + U().formatMoney(totalOut) + " total outstanding</p></div>" +
      '<div class="page-actions"><button class="btn btn-primary" data-cmd="addInvoiceModal">' + I.plus + " Create Invoice</button></div></div>" +

      '<div class="kpi-grid">' +
        '<div class="kpi accent"><div class="k-label">Total Outstanding</div><div class="k-value">' + U().formatMoney(totalOut) + '</div></div>' +
        '<div class="kpi"><div class="k-label">Overdue</div><div class="k-value" style="color:var(--danger)">' + overdue + '</div></div>' +
        '<div class="kpi"><div class="k-label">Paid (This Month)</div><div class="k-value">' + U().formatMoney(calculatePaidThisMonth()) + '</div></div>' +
        '<div class="kpi"><div class="k-label">Unpaid Count</div><div class="k-value">' + invs.filter(i => i.balance > 0).length + '</div></div>' +
      '</div>' +

      (invs.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Invoice #</th><th>Client</th><th>Issue Date</th><th>Due Date</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>' +
        invs.map((inv) => {
          const cl = S().clientById(inv.clientId);
          const biz = cl ? S().clientBusiness(inv.clientId) : null;
          const st = S().invoiceStatusOf(inv.status);
          return "<tr>" +
            "<td><b>#" + inv.invoiceNumber + "</b></td>" +
            "<td><div class='b-name'><a href='#/clients/" + (cl ? cl.id : "") + "'>" + U().escapeHtml(biz ? biz.name : "Deleted client") + "</a></div></td>" +
            "<td><span class='cell-sub'>" + U().formatDate(inv.issueDate) + "</span></td>" +
            "<td><span class='cell-sub " + (inv.status === 'overdue' ? 'overdue' : '') + "'>" + U().formatDate(inv.dueDate) + "</span></td>" +
            "<td><b>" + U().formatMoney(inv.total) + "</b></td>" +
            "<td><b " + (inv.balance > 0 ? "style='color:var(--danger)'" : "") + ">" + U().formatMoney(inv.balance) + "</b></td>" +
            "<td>" + UI.badge(st.label, st.color, true) + "</td>" +
            '<td><div style="display:flex;gap:4px"><button class="btn btn-sm btn-ghost" data-cmd="viewInvoice:' + inv.id + '">' + I.eye + ' View</button>' +
            (inv.balance > 0 ? '<button class="btn btn-sm btn-primary" data-cmd="recordPaymentModal:' + inv.id + '">' + I.credit + ' Pay</button>' : '') + '</div></td></tr>';
        }).join("") + "</tbody></table></div>" : UI.emptyState("credit", "No invoices yet.", "Create an invoice to bill your clients.", '<button class="btn btn-primary" data-cmd="addInvoiceModal">' + I.plus + " Create Invoice</button>"));
    UI.bind(el);
  }

  function calculatePaidThisMonth() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return S().db.payments.filter(p => p.status === 'paid' && p.date >= start).reduce((s, p) => s + (p.amount || 0), 0);
  }

  /* ── MODALS ── */
  function addInvoiceModal(clientId, projectId) {
    const clients = S().db.clients;
    const projects = S().db.projects.filter(p => !clientId || p.clientId === clientId);
    const m = UI.openModal({ title: "Create Invoice", icon: I.plus, size: "lg" });

    m.setBody(
      '<div class="field"><label>Select Client *</label><select class="select" id="inv-client">' +
        clients.map(c => {
          const b = S().businessOf({ businessId: c.businessId });
          return '<option value="' + c.id + '" ' + (clientId === c.id ? 'selected' : '') + '>' + U().escapeHtml(b.name) + '</option>';
        }).join("") +
      '</select></div>' +
      '<div class="field"><label>Select Project (Optional)</label><select class="select" id="inv-project"><option value="">Manual Invoice</option>' +
        projects.map(p => '<option value="' + p.id + '" ' + (projectId === p.id ? 'selected' : '') + '>' + U().escapeHtml(p.name) + '</option>').join("") +
      '</select></div>' +
      '<div class="field-row"><div class="field"><label>Due Date</label><input class="input" type="date" id="inv-due" value="' + new Date(Date.now() + 7*86400000).toISOString().split('T')[0] + '"></div>' +
      '<div class="field"><label>Invoice #</label><input class="input" id="inv-num" value="' + U().uid("INV-").toUpperCase() + '"></div></div>' +
      '<div class="field"><label>Notes</label><textarea class="textarea" id="inv-notes" rows="2"></textarea></div>'
    );

    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Create Draft</button>');

    m.q("[data-save]").addEventListener("click", () => {
      const cid = m.body.querySelector("#inv-client").value;
      if (!cid) return;

      const inv = S().addInvoice(cid, {
        projectId: m.body.querySelector("#inv-project").value || null,
        invoiceNumber: m.body.querySelector("#inv-num").value,
        dueDate: new Date(m.body.querySelector("#inv-due").value + "T09:00:00").getTime(),
        notes: m.body.querySelector("#inv-notes").value.trim()
      });

      m.close();
      V61.Toast.success("Invoice draft created");
      V61.App.renderRoute(); // In a real app we'd open the item editor
    });
    m.q("[data-cancel]").addEventListener("click", () => m.close());
  }

  function recordPaymentModal(invoiceId) {
    const inv = S().invoiceOf(invoiceId);
    if (!inv) return;
    const cl = S().clientById(inv.clientId);
    const biz = cl ? S().clientBusiness(inv.clientId) : null;

    const m = UI.openModal({ title: "Record Payment — #" + inv.invoiceNumber, icon: I.credit });
    m.setBody(
      '<div style="margin-bottom:16px"><div style="font-size:12px;color:var(--text-3)">Outstanding Balance</div><div style="font-size:24px;font-weight:800;color:var(--danger)">' + U().formatMoney(inv.balance) + '</div></div>' +
      '<div class="field"><label>Payment Amount (GH₵) *</label><input class="input" type="number" id="pay-amount" value="' + inv.balance + '" step="0.01"></div>' +
      '<div class="field-row"><div class="field"><label>Payment Date</label><input class="input" type="date" id="pay-date" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
      '<div class="field"><label>Method</label><select class="select" id="pay-method"><option>Mobile Money</option><option>Bank Transfer</option><option>Cash</option><option>Card</option></select></div></div>' +
      '<div class="field"><label>Reference / Transaction ID</label><input class="input" id="pay-ref" placeholder="e.g. TXN123456789"></div>'
    );

    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Record Payment</button>');

    m.q("[data-save]").addEventListener("click", () => {
      const amt = Number(m.body.querySelector("#pay-amount").value);
      if (!amt || amt <= 0) { V61.Toast.error("Invalid amount"); return; }

      // Update Invoice
      inv.amountPaid = (inv.amountPaid || 0) + amt;
      inv.balance = Math.max(0, inv.total - inv.amountPaid);
      inv.status = inv.balance <= 0 ? "paid" : "partially_paid";
      inv.updatedAt = U().now();

      // Add Payment record
      S().db.payments.push({
        id: U().uid("pay"),
        clientId: inv.clientId,
        invoiceId: inv.id,
        amount: amt,
        date: new Date(m.body.querySelector("#pay-date").value + "T12:00:00").getTime(),
        method: m.body.querySelector("#pay-method").value,
        reference: m.body.querySelector("#pay-ref").value.trim(),
        status: "paid",
        createdAt: U().now()
      });

      S().save();
      m.close();
      V61.Toast.success("Payment recorded");
      V61.App.renderRoute();
    });
    m.q("[data-cancel]").addEventListener("click", () => m.close());
  }

  /* ── COMMANDS ── */
  V61.Cmd = V61.Cmd || {};
  Object.assign(V61.Cmd, {
    addInvoiceModal,
    recordPaymentModal,
    viewInvoice: (id) => V61.Toast.info("Invoice viewing would open PDF or detail view here.")
  });

  V61.Pages.invoices = renderInvoices;
})();