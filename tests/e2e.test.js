/* QA End-to-End — full isolated workflow test (no production data touched) */
"use strict";
const { suite, test, assert, eq, ok, isNull, notNull, approx } = require("./framework");
const { freshApp, refresh } = require("./harness");

suite("End-to-End workflow", () => {
  test("DISCOVER -> LEAD -> AUDIT -> OUTREACH -> PROPOSAL -> WON -> CLIENT -> PROJECT -> TASKS -> APPROVAL -> INVOICE -> PAYMENTS -> REPORT -> RETENTION", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const U = app.V61.Utils;

    // 1. DISCOVER
    const place = { placeId: "Gx-E2E-1", name: "E2E Restaurant", category: "Restaurant", phone: "024E2E1", website: "https://e2e.example", rating: 4.2, reviews: 8, lat: 5.5, lng: -0.1 };
    const { business, lead, created } = S.addDiscoveredBusiness(place);
    ok(created);

    // 2. AUDIT
    const audit = S.emptyAudit(business.id);
    audit.website = { exists: false };
    audit.google = { exists: true, reviews: true };
    audit.conversion = { whatsapp: false };
    S.upsertAudit(business.id, { website: { exists: false }, google: { exists: true, reviews: true }, conversion: { whatsapp: false } });
    const dScore = S.digitalScore(audit);
    ok(Number.isFinite(dScore));
    S.addAuditSnapshot(business.id, { digitalScore: dScore });

    // 3. OPPORTUNITIES
    const opps = S.opportunities(audit, business);
    ok(opps.length > 0, "opportunities detected");
    const recommended = app.V61.OpportunityEngine.recommended({ lead, business, audit });
    ok(recommended.length > 0, "recommended services");

    // 4. OUTREACH (draft only)
    const row = S.leadRows().find((r) => r.lead.id === lead.id);
    const msg = app.V61.OutreachEngine.generate(row, { channel: "WhatsApp" });
    ok(msg.message.length > 0);
    eq(S.db.outreach.length, 0, "nothing sent");

    // 5. PROPOSAL
    const prop = { id: "e2e-prop", leadId: lead.id, title: "Website + GBO", total: 6500, status: "draft", items: [{ service: "Website", qty: 1, price: 5000 }, { service: "GBO", qty: 1, price: 1500 }] };
    S.db.proposals.push(prop);
    eq(prop.total, 6500);
    prop.status = "sent";
    lead.stage = "proposal";

    // 6. WON -> CLIENT (exactly one)
    const client = S.markWon(lead.id, { dealValue: 6500 });
    notNull(client);
    eq(S.db.clients.filter((c) => c.businessId === business.id).length, 1);
    eq(S.byId("leads", lead.id).stage, "won");
    eq(S.byId("leads", lead.id).estimatedValue, 6500);

    // 7. PROJECT + TASKS
    const project = S.addProject(client.id, { name: "Website Build", budget: 6500, status: "not_started" });
    for (let i = 0; i < 10; i++) S.addProjectTask(project.id, { title: "Task " + i });
    const tasks = S.projectTasksFor(project.id);
    eq(tasks.length, 10);
    eq(S.projectProgress(project.id), 0);
    for (let i = 0; i < 6; i++) tasks[i].status = "done";
    eq(S.projectProgress(project.id), 60);

    // 8. APPROVAL (pending, never auto-granted)
    const approval = S.addApproval(project.id, { item: "Homepage" });
    eq(approval.status, "pending");
    isNull(approval.date);

    // 9. INVOICE
    const inv = S.addInvoice(client.id, { status: "sent" });
    S.addInvoiceItem(inv.id, { service: "Website Build", quantity: 1, unitPrice: 5000 });
    S.addInvoiceItem(inv.id, { service: "Google Optimization", quantity: 1, unitPrice: 1500 });
    eq(inv.total, 6500);
    eq(inv.balance, 6500);

    // 10. PARTIAL + FINAL PAYMENT
    inv.amountPaid = 2500;
    inv.balance = Math.max(0, inv.total - inv.amountPaid);
    inv.status = inv.balance <= 0 ? "paid" : inv.amountPaid > 0 ? "partially_paid" : inv.status;
    S.db.payments.push({ id: "e2e-pay1", clientId: client.id, invoiceId: inv.id, amount: 2500, status: "paid" });
    eq(inv.balance, 4000);
    eq(inv.status, "partially_paid");

    inv.amountPaid = 6500;
    inv.balance = Math.max(0, inv.total - inv.amountPaid);
    inv.status = inv.balance <= 0 ? "paid" : inv.amountPaid > 0 ? "partially_paid" : inv.status;
    S.db.payments.push({ id: "e2e-pay2", clientId: client.id, invoiceId: inv.id, amount: 4000, status: "paid" });
    eq(inv.balance, 0);
    eq(inv.status, "paid");

    // 11. GROWTH REPORT
    S.addAuditSnapshot(business.id, { digitalScore: 75 });
    const g = app.V61.Score.growth(S.auditSnapshotsFor(business.id));
    notNull(g);
    ok(g.delta > 0);

    // 12. RETENTION FOLLOW-UP
    S.db.followups.push({ id: "e2e-fu", leadId: lead.id, status: "pending", dueDate: Date.now() + 90 * 86400000, title: "90-day check-in" });
    eq(S.db.outreach.length, 0, "still nothing auto-sent");

    // 13. FINANCIAL SYNC
    const fin = S.clientFinancialSummary(client.id);
    eq(fin.totalInvoiced, 6500);
    eq(fin.totalPaid, 6500);
    eq(fin.outstanding, 0);

    // 14. PERSISTENCE: full refresh, every relationship survives
    S.save();
    const app2 = refresh(app);
    const S2 = app2.V61.Store;
    const lead2 = S2.byId("leads", lead.id);
    eq(lead2.stage, "won");
    const client2 = S2.clientOf(business.id);
    notNull(client2);
    eq(client2.leadId, lead.id);
    eq(S2.projectsFor(client2.id).length, 1);
    eq(S2.projectTasksFor(project.id).length, 10);
    eq(S2.projectProgress(project.id), 60);
    eq(S2.approvalsFor(project.id).length, 1);
    eq(S2.approvalsFor(project.id)[0].status, "pending");
    const inv2 = S2.byId("invoices", inv.id);
    eq(inv2.total, 6500);
    eq(inv2.balance, 0);
    eq(inv2.status, "paid");
    eq(S2.paymentsFor(client2.id).length, 2);
    eq(S2.auditSnapshotsFor(business.id).length, 2);
    eq(S2.followupsFor(lead.id).length, 1);
    eq(S2.byId("proposals", "e2e-prop").status, "sent");
  });
});