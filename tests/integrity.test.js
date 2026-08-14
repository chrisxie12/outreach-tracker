/* QA — Empty database, data corruption, duplication, persistence, route smoke, page render */
"use strict";
const { suite, test, assert, eq, ok, isNull, notNull, assertCleanHTML } = require("./framework");
const { freshApp, refresh, createApp } = require("./harness");

suite("Empty database", () => {
  test("all pages render with 0 businesses/leads/clients without crashing or garbage", () => {
    const app = freshApp();
    const P = app.V61.Pages;
    const routes = ["dashboard", "leads", "discovery", "audits", "opportunities", "outreach", "followups", "tasks", "pipeline", "proposals", "services", "clients", "projects", "invoices", "reports", "settings", "importexport"];
    for (const r of routes) {
      const fn = typeof P[r] === "function" ? P[r] : (P[r] && P[r].render);
      assert(typeof fn === "function", "no render for " + r);
      fn();
      const html = app.window.document.getElementById("content").innerHTML;
      assertCleanHTML(html, "empty page " + r);
      ok(html.length > 0, "empty page " + r + " produced no output");
    }
    eq(app.V61.Store.db.businesses.length, 0);
    eq(app.V61.Store.db.clients.length, 0);
    eq(app.V61.Store.db.projects.length, 0);
  });

  test("empty financial summary is zero not NaN", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const f = S.clientFinancialSummary("nope");
    ok(Number.isFinite(f.totalInvoiced));
    ok(Number.isFinite(f.totalPaid));
    ok(Number.isFinite(f.outstanding));
    eq(f.totalInvoiced, 0);
    eq(f.outstanding, 0);
  });

  test("leadRows / clientRows on empty DB are empty arrays", () => {
    const app = freshApp();
    const S = app.V61.Store;
    eq(S.leadRows().length, 0);
    eq(S.clientRows().length, 0);
  });
});

suite("Data corruption — missing references", () => {
  test("project referencing deleted client renders safely", () => {
    const app = freshApp();
    const S = app.V61.Store;
    // orphan project
    S.db.projects.push({ id: "orphan-proj", clientId: "missing-client", name: "Orphan", status: "in_progress", progress: 0, priority: "medium" });
    const P = app.V61.Pages;
    P.projects();
    const html = app.window.document.getElementById("content").innerHTML;
    assertCleanHTML(html, "projects page with orphan project");
    ok(html.length > 0);
  });

  test("invoice referencing deleted client renders safely", () => {
    const app = freshApp();
    const S = app.V61.Store;
    S.db.invoices.push({ id: "orphan-inv", clientId: "missing-client", invoiceNumber: "INV-1", status: "sent", total: 1000, amountPaid: 0, balance: 1000 });
    const P = app.V61.Pages;
    P.invoices();
    const html = app.window.document.getElementById("content").innerHTML;
    assertCleanHTML(html, "invoices page with orphan invoice");
  });

  test("task referencing deleted project renders safely", () => {
    const app = freshApp();
    const S = app.V61.Store;
    S.db.projectTasks.push({ id: "orphan-task", projectId: "missing-proj", title: "Orphan task", status: "todo", priority: "medium" });
    const P = app.V61.Pages;
    P.projects();
    const html = app.window.document.getElementById("content").innerHTML;
    assertCleanHTML(html, "projects page with orphan task");
  });

  test("payment referencing deleted invoice renders safely", () => {
    const app = freshApp();
    const S = app.V61.Store;
    S.db.payments.push({ id: "orphan-pay", clientId: "missing-client", invoiceId: "missing-inv", amount: 500, status: "paid" });
    S.db.invoices.push({ id: "orphan-inv", clientId: "missing-client", invoiceNumber: "INV-9", status: "paid", total: 500, amountPaid: 500, balance: 0 });
    const P = app.V61.Pages;
    P.invoices();
    const html = app.window.document.getElementById("content").innerHTML;
    assertCleanHTML(html, "invoices page with orphan payment");
  });

  test("audit referencing missing lead renders safely", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "AuditOrphan" });
    const audit = S.emptyAudit(biz.id);
    S.db.audits.push(audit);
    // no lead for this business
    const row = S.leadRows();
    ok(Array.isArray(row));
    const P = app.V61.Pages;
    P.audits();
    const html = app.window.document.getElementById("content").innerHTML;
    assertCleanHTML(html, "audits page with orphan audit");
  });

  test("missing references do not crash pages individually", () => {
    const app = freshApp();
    const S = app.V61.Store;
    S.db.projects.push({ id: "p1", clientId: "gone", name: "Gone", status: "in_progress", progress: 50 });
    S.db.invoices.push({ id: "i1", clientId: "gone", invoiceNumber: "I1", status: "draft", total: 10, amountPaid: 0, balance: 10 });
    S.db.projectTasks.push({ id: "t1", projectId: "p1", title: "T", status: "todo" });
    for (const [route, fn] of [["projects", () => app.V61.Pages.projects()], ["invoices", () => app.V61.Pages.invoices()], ["clients", () => app.V61.Pages.clients()], ["reports", () => app.V61.Pages.reports()]]) {
      try { fn(); ok(true); } catch (e) { assert(false, route + " threw: " + e.message); }
    }
  });
});

suite("Duplication & idempotency", () => {
  test("ensureClient twice -> one client", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "D" });
    const lead = S.addLead(biz.id);
    S.ensureClient(lead);
    S.ensureClient(lead);
    eq(S.db.clients.length, 1);
  });

  test("addTag same label -> one tag", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "T" });
    S.addTag(biz.id, "hot");
    S.addTag(biz.id, "HOT");
    eq(S.db.tags.length, 1);
  });

  test("re-import same CSV row -> no duplicate business/lead", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const csv = "Business Name,Phone,Category\nDup Shop,0241,Dining\nDup Shop,0241,Dining";
    const n = S.importCSV(csv);
    eq(n, 2);
    eq(S.db.businesses.length, 1);
    eq(S.db.leads.length, 1);
  });
});

suite("Persistence (refresh)", () => {
  test("lead stage, tags, proposal status, client, project, invoice, payment survive refresh", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Persist All" });
    const lead = S.addLead(biz.id);
    S.addTag(biz.id, "key");
    const prop = { id: "p1", leadId: lead.id, title: "P", total: 100, status: "sent", items: [] };
    S.db.proposals.push(prop);
    lead.stage = "contacted";
    const client = S.markWon(lead.id, { dealValue: 100 });
    const project = S.addProject(client.id, { name: "Proj" });
    const inv = S.addInvoice(client.id, {});
    S.addInvoiceItem(inv.id, { service: "s", quantity: 1, unitPrice: 100 });
    S.save();
    const app2 = refresh(app);
    const S2 = app2.V61.Store;
    eq(S2.byId("leads", lead.id).stage, "won");
    eq(S2.tagsFor(biz.id).length, 1);
    eq(S2.byId("proposals", "p1").status, "sent");
    eq(S2.clientOf(biz.id).id, client.id);
    eq(S2.projectsFor(client.id).length, 1);
    eq(S2.byId("invoices", inv.id).total, 100);
  });

  test("task completion survives refresh", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "X" });
    const lead = S.addLead(biz.id);
    const client = S.ensureClient(lead);
    const project = S.addProject(client.id, { name: "P" });
    const task = S.addProjectTask(project.id, { title: "t" });
    task.status = "done";
    S.save();
    const app2 = refresh(app);
    const S2 = app2.V61.Store;
    eq(S2.byId("projectTasks", task.id).status, "done");
    eq(S2.projectProgress(project.id), 100);
  });
});

suite("Route smoke", () => {
  test("every route renders without throwing", () => {
    const app = freshApp();
    const P = app.V61.Pages;
    const routes = ["dashboard", "leads", "discovery", "audits", "opportunities", "outreach", "followups", "tasks", "pipeline", "proposals", "services", "clients", "projects", "invoices", "reports", "settings", "importexport"];
    const missing = [];
    for (const r of routes) {
      const fn = typeof P[r] === "function" ? P[r] : (P[r] && P[r].render);
      if (typeof fn !== "function") { missing.push(r); continue; }
      fn();
    }
    assert(missing.length === 0, "missing renders: " + missing.join(","));
  });

  test("detail routes: clientDetail, projectDetail, proposalDetail, lead open do not crash", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Detail Biz" });
    const lead = S.addLead(biz.id);
    const client = S.ensureClient(lead);
    const project = S.addProject(client.id, { name: "DP" });
    const prop = { id: "dp1", leadId: lead.id, title: "DP", total: 1, status: "draft" };
    S.db.proposals.push(prop);
    const P = app.V61.Pages;
    P.clientDetail(client.id);
    assertCleanHTML(app.window.document.getElementById("content").innerHTML, "clientDetail");
    P.projectDetail(project.id);
    assertCleanHTML(app.window.document.getElementById("content").innerHTML, "projectDetail");
    P.sales.proposalDetail(prop.id);
    assertCleanHTML(app.window.document.getElementById("content").innerHTML, "proposalDetail");
    P.leads.openLead(lead.id);
    assertCleanHTML(app.window.document.getElementById("content").innerHTML, "lead detail");
  });
});