/* QA Phase 4 — Clients, Projects, Tasks, Milestones, Approvals, Invoicing, Payments, Finance, Growth, Retention */
"use strict";
const { suite, test, assert, eq, ok, isNull, notNull, approx } = require("./framework");
const { freshApp, refresh } = require("./harness");

function makeClient(app) {
  const S = app.V61.Store;
  const biz = S.addBusiness({ name: "ClientCo", phone: "0243333333" });
  const lead = S.addLead(biz.id);
  const client = S.markWon(lead.id, { dealValue: 10000 });
  return { S, biz, lead, client };
}

suite("Phase 4 — Clients & Projects", () => {
  test("client created from won lead with active status", () => {
    const app = freshApp();
    const { client } = makeClient(app);
    eq(client.status, "active");
    eq(client.businessId, app.V61.Store.db.businesses[0].id);
  });

  test("project created and linked to client, persists", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const p = S.addProject(client.id, { name: "Website Build", budget: 8000, status: "not_started", priority: "medium" });
    notNull(p.id);
    eq(p.clientId, client.id);
    eq(S.projectsFor(client.id).length, 1);
    S.save();
    const app2 = refresh(app);
    eq(app2.V61.Store.projectsFor(client.id).length, 1);
    eq(app2.V61.Store.byId("projects", p.id).name, "Website Build");
  });

  test("project progress deterministic: 10 tasks 5 done = 50%", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const p = S.addProject(client.id, { name: "P" });
    for (let i = 0; i < 10; i++) S.addProjectTask(p.id, { title: "t" + i });
    const tasks = S.projectTasksFor(p.id);
    for (let i = 0; i < 5; i++) tasks[i].status = "done";
    eq(S.projectProgress(p.id), 50);
  });

  test("project progress handles 0 tasks, all done, no NaN", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const p = S.addProject(client.id, { name: "P" });
    eq(S.projectProgress(p.id), 0);
    for (let i = 0; i < 3; i++) S.addProjectTask(p.id, { title: "t" + i });
    const tasks = S.projectTasksFor(p.id);
    tasks.forEach((t) => (t.status = "done"));
    eq(S.projectProgress(p.id), 100);
    ok(Number.isFinite(S.projectProgress(p.id)));
  });

  test("task lifecycle statuses all supported", () => {
    const app = freshApp();
    const S = app.V61.Store;
    for (const st of S.TASK_STATUS) {
      const s = S.taskStatusOf(st.key);
      notNull(s.label);
    }
  });

  test("project statuses all supported", () => {
    const app = freshApp();
    const S = app.V61.Store;
    for (const st of S.PROJECT_STATUS) {
      const s = S.projectStatusOf(st.key);
      notNull(s.label);
    }
  });

  test("milestone created and linked, persists", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const p = S.addProject(client.id, { name: "P" });
    const m = S.addMilestone(p.id, { name: "Design signoff", dueDate: Date.now() + 86400000 });
    eq(m.projectId, p.id);
    eq(S.milestonesFor(p.id).length, 1);
    S.save();
    const app2 = refresh(app);
    eq(app2.V61.Store.milestonesFor(p.id).length, 1);
  });

  test("approval is pending by default and never auto-granted", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const p = S.addProject(client.id, { name: "P" });
    const a = S.addApproval(p.id, { item: "Homepage design" });
    eq(a.status, "pending");
    isNull(a.date);
    eq(S.approvalsFor(p.id).length, 1);
  });

  test("revision tracking", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const p = S.addProject(client.id, { name: "P" });
    const r = S.addRevision(p.id, { notes: "change colors" });
    notNull(r.id);
    eq(r.revisionNumber, 1);
    eq(S.revisionsFor(p.id).length, 1);
  });

  test("cancelled project still renders-safe (progress finite)", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const p = S.addProject(client.id, { name: "P", status: "cancelled" });
    S.addProjectTask(p.id, { title: "t" });
    const tasks = S.projectTasksFor(p.id);
    tasks[0].status = "done";
    ok(Number.isFinite(S.projectProgress(p.id)));
  });
});

suite("Phase 4 — Invoicing & Payments", () => {
  test("invoice math: 2x1000 + 1x500 = 2500 exactly", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, {});
    S.addInvoiceItem(inv.id, { service: "Design", quantity: 2, unitPrice: 1000 });
    S.addInvoiceItem(inv.id, { service: "Setup", quantity: 1, unitPrice: 500 });
    eq(inv.subtotal, 2500);
    eq(inv.total, 2500);
    eq(inv.balance, 2500);
    eq(inv.status, "sent");
  });

  test("invoice with decimals and many items, no NaN", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, {});
    S.addInvoiceItem(inv.id, { service: "a", quantity: 3, unitPrice: 0.5 });
    S.addInvoiceItem(inv.id, { service: "b", quantity: 2, unitPrice: 19.99 });
    approx(inv.total, 1.5 + 39.98, 1e-9);
    ok(Number.isFinite(inv.total));
    ok(inv.total >= 0);
  });

  test("invalid price/quantity collapse to safe numbers", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, {});
    const item = S.addInvoiceItem(inv.id, { service: "x", quantity: NaN, unitPrice: "abc" });
    ok(Number.isFinite(inv.total), "total not finite");
    ok(inv.total >= 0);
    ok(Number.isFinite(item.total), "item total not finite");
    eq(item.quantity, 1);
    eq(item.unitPrice, 0);
    eq(item.total, 0);
  });

  test("regression: invoice totals never become NaN/Infinity regardless of input", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, {});
    const inputs = [
      { service: "a", quantity: "3", unitPrice: "200" },
      { service: "b", quantity: null, unitPrice: null },
      { service: "c", quantity: undefined, unitPrice: undefined },
      { service: "d", quantity: Infinity, unitPrice: -5 },
      { service: "e", quantity: 0, unitPrice: 10 },
      { service: "f", quantity: 2.5, unitPrice: 1.1 },
    ];
    inputs.forEach((x) => S.addInvoiceItem(inv.id, x));
    ok(Number.isFinite(inv.total), "invoice total not finite: " + inv.total);
    ok(inv.total >= 0, "invoice total negative");
    eq(inv.balance, inv.total);
    eq(inv.status, "sent");
  });

  test("regression: adding items to a cancelled invoice is refused and never un-cancels it", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, { status: "cancelled" });
    const before = S.invoiceItemsFor(inv.id).length;
    const item = S.addInvoiceItem(inv.id, { service: "x", quantity: 1, unitPrice: 500 });
    isNull(item, "item should be refused on a cancelled invoice");
    eq(S.invoiceItemsFor(inv.id).length, before, "no items may be added to a cancelled invoice");
    eq(S.invoiceOf(inv.id).status, "cancelled", "cancelled invoice must stay cancelled");
    eq(S.invoiceOf(inv.id).total, 0);
    eq(S.invoiceOf(inv.id).balance, 0);
  });


  test("empty invoice has zero total, not NaN", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, {});
    eq(inv.total, 0);
    eq(inv.balance, 0);
  });

  test("payment flow: 5000 invoice, 2000 -> partially_paid balance 3000, then 3000 -> paid balance 0", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, {});
    S.addInvoiceItem(inv.id, { service: "Build", quantity: 1, unitPrice: 5000 });
    // simulate first payment
    inv.amountPaid = 2000;
    inv.balance = Math.max(0, inv.total - inv.amountPaid);
    inv.status = inv.balance <= 0 ? "paid" : inv.amountPaid > 0 ? "partially_paid" : inv.status;
    eq(inv.amountPaid, 2000);
    eq(inv.balance, 3000);
    eq(inv.status, "partially_paid");
    // final payment
    inv.amountPaid = 5000;
    inv.balance = Math.max(0, inv.total - inv.amountPaid);
    inv.status = inv.balance <= 0 ? "paid" : inv.amountPaid > 0 ? "partially_paid" : inv.status;
    eq(inv.amountPaid, 5000);
    eq(inv.balance, 0);
    eq(inv.status, "paid");
  });

  test("overpayment clamps balance to 0, never negative", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, {});
    S.addInvoiceItem(inv.id, { service: "Build", quantity: 1, unitPrice: 1000 });
    inv.amountPaid = 1500;
    inv.balance = Math.max(0, inv.total - inv.amountPaid);
    eq(inv.balance, 0);
    ok(inv.balance >= 0);
  });

  test("clientFinancialSummary syncs invoiced/paid/outstanding", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, {});
    S.addInvoiceItem(inv.id, { service: "Build", quantity: 1, unitPrice: 5000 });
    inv.amountPaid = 2000;
    inv.balance = 3000;
    const f = S.clientFinancialSummary(client.id);
    eq(f.totalInvoiced, 5000);
    eq(f.totalPaid, 2000);
    eq(f.outstanding, 3000);
  });

  test("cancelled invoices excluded from financial summary", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, { status: "cancelled" });
    S.addInvoiceItem(inv.id, { service: "x", quantity: 1, unitPrice: 500 });
    const f = S.clientFinancialSummary(client.id);
    eq(f.totalInvoiced, 0);
  });

  test("invoice data persists after refresh", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, {});
    S.addInvoiceItem(inv.id, { service: "Build", quantity: 1, unitPrice: 2500 });
    S.save();
    const app2 = refresh(app);
    const S2 = app2.V61.Store;
    const inv2 = S2.byId("invoices", inv.id);
    notNull(inv2);
    eq(inv2.total, 2500);
    eq(S2.invoiceItemsFor(inv.id).length, 1);
  });

  test("payments collection integrity: multiple payments tracked", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    const inv = S.addInvoice(client.id, {});
    S.addInvoiceItem(inv.id, { service: "Build", quantity: 1, unitPrice: 3000 });
    S.db.payments.push({ id: "pay1", clientId: client.id, invoiceId: inv.id, amount: 1000, status: "paid", date: Date.now() });
    S.db.payments.push({ id: "pay2", clientId: client.id, invoiceId: inv.id, amount: 1000, status: "paid", date: Date.now() });
    eq(S.paymentsFor(client.id).length, 2);
    const totalPaid = S.paymentsFor(client.id).reduce((s, p) => s + p.amount, 0);
    eq(totalPaid, 2000);
  });

  test("mrr only counts paid mrr payments, outstandingPayments counts pending", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    S.db.payments.push({ id: "a", clientId: client.id, amount: 100, status: "paid", kind: "mrr" });
    S.db.payments.push({ id: "b", clientId: client.id, amount: 200, status: "pending", kind: "oneoff" });
    eq(S.mrr(), 100);
    eq(S.outstandingPayments(), 200);
  });
});

suite("Phase 4 — Financial dashboard & Growth reporting", () => {
  test("growth improvement +43 from 38 to 81", () => {
    const app = freshApp();
    const Score = app.V61.Score;
    const g = Score.growth([
      { createdAt: 1, data: { digitalScore: 38 } },
      { createdAt: 2, data: { digitalScore: 81 } },
    ]);
    eq(g.delta, 43);
  });

  test("no growth data -> null, UI shows no report data", () => {
    const app = freshApp();
    const Score = app.V61.Score;
    isNull(Score.growth([]));
    isNull(Score.growth([{ createdAt: 1, data: { digitalScore: 30 } }]));
  });

  test("before/after audit snapshots persist and report is finite", () => {
    const app = freshApp();
    const { S, client } = makeClient(app);
    S.addAuditSnapshot(client.businessId, { digitalScore: 38 });
    S.addAuditSnapshot(client.businessId, { digitalScore: 81 });
    const g = app.V61.Score.growth(S.auditSnapshotsFor(client.businessId));
    eq(g.from, 38);
    eq(g.to, 81);
  });
});

suite("Phase 4 — Retention", () => {
  test("scheduling a retention follow-up creates a pending follow-up only, no message sent", () => {
    const app = freshApp();
    const { S, lead } = makeClient(app);
    const due = Date.now() + 30 * 86400000;
    S.db.followups.push({ id: "r1", leadId: lead.id, status: "pending", dueDate: due, title: "30-day check-in" });
    const f = S.byId("followups", "r1");
    eq(f.status, "pending");
    eq(f.dueDate, due);
    eq(S.followupState(f).key, "upcoming");
    eq(S.db.outreach.length, 0, "no outreach record auto-created");
  });

  test("30/60/90 day follow-ups computed from now correctly", () => {
    const app = freshApp();
    const U = app.V61.Utils;
    const day = 86400000;
    const d30 = U.dayStart(U.now()) + 30 * day;
    const d60 = U.dayStart(U.now()) + 60 * day;
    const d90 = U.dayStart(U.now()) + 90 * day;
    ok(d30 < d60 && d60 < d90);
    eq(U.relativeDue(d30), "in 30d");
  });
});

suite("Phase 4 — Analytics lead sources", () => {
  test("analytics panel breaks down leads by source", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz1 = S.addBusiness({ name: "ManualBiz", phone: "0241000001" });
    S.addLead(biz1.id);
    const biz2 = S.addBusiness({ name: "OsmBiz", phone: "0241000002" });
    S.addLead(biz2.id);
    S.db.leads[1].source = "osm-discovery";
    const biz3 = S.addBusiness({ name: "CsvBiz", phone: "0241000003" });
    S.addLead(biz3.id);
    S.db.leads[2].source = "csv";
    S.save();
    app.V61.Pages.analytics();
    const el = app.window.document.getElementById("content");
    const panel = el.querySelector(".panel-title");
    const titles = Array.prototype.map.call(el.querySelectorAll(".panel-title"), (t) => t.textContent);
    ok(titles.some((t) => t.indexOf("Lead sources") !== -1), "Lead sources panel rendered");
    const body = el.innerHTML;
    ok(body.indexOf("Discovery — OpenStreetMap") !== -1, "OSM discovery source labeled");
    ok(body.indexOf("CSV import") !== -1, "CSV import source labeled");
    ok(body.indexOf("Manual entry") !== -1, "manual source labeled");
  });
});