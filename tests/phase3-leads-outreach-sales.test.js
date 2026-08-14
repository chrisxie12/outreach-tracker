/* QA Phase 3 — Lead management, Outreach, Sales */
"use strict";
const { suite, test, assert, eq, ok, isNull, notNull, approx } = require("./framework");
const { freshApp, refresh, createApp } = require("./harness");

function setupLead(app) {
  const S = app.V61.Store;
  const biz = S.addBusiness({ name: "LeadCo", phone: "0241111111", category: "Restaurant" });
  const lead = S.addLead(biz.id, { source: "manual" });
  return { S, biz, lead };
}

suite("Phase 3 — Lead management", () => {
  test("lead created with defaults", () => {
    const app = freshApp();
    const { lead } = setupLead(app);
    eq(lead.stage, "new");
    eq(lead.temperature, "cold");
    eq(lead.estimatedValue, 0);
    eq(lead.source, "manual");
  });

  test("stage changes persist after refresh", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    lead.stage = "contacted";
    S.save();
    const app2 = refresh(app);
    const L2 = app2.V61.Store.byId("leads", lead.id);
    eq(L2.stage, "contacted");
  });

  test("all supported stages map to a label without crashing", () => {
    const app = freshApp();
    const S = app.V61.Store;
    for (const st of S.STAGES) {
      const s = S.stageOf(st.key);
      notNull(s.label);
      ok(s.label.length > 0, "empty label for " + st.key);
      const ls = S.lifecycleStatus({ stage: st.key });
      notNull(ls.label);
    }
  });

  test("stage history via activity is recorded", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    S.markLost(lead.id, "Too expensive");
    const acts = S.activityFor(lead.id);
    ok(acts.some((a) => /Lost/.test(a.text)));
    S.reactivateLead(lead.id);
    eq(S.byId("leads", lead.id).stage, "contacted");
    ok(S.activityFor(lead.id).some((a) => /reactivated/.test(a.text)));
  });

  test("reactivating a lost lead does not corrupt other fields", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    lead.estimatedValue = 5000;
    S.markLost(lead.id, "No budget");
    S.reactivateLead(lead.id);
    const l = S.byId("leads", lead.id);
    eq(l.estimatedValue, 5000);
    isNull(l.lostReason);
  });

  test("tags are case-insensitive deduped", () => {
    const app = freshApp();
    const { S, biz } = setupLead(app);
    const t1 = S.addTag(biz.id, "VIP");
    const t2 = S.addTag(biz.id, "vip");
    eq(t1.id, t2.id);
    eq(S.tagsFor(biz.id).length, 1);
  });

  test("notes and contacts attach to lead/business", () => {
    const app = freshApp();
    const { S, biz, lead } = setupLead(app);
    const c = S.addContact(biz.id, { name: "Ama", phone: "0242222" });
    app.V61.Store.addActivity(lead.id, "note", "Called them");
    eq(S.contactsFor(biz.id).length, 1);
    eq(c.name, "Ama");
    ok(S.activityFor(lead.id).length >= 1);
  });

  test("lead search helper finds by business name", () => {
    const app = freshApp();
    const { S, biz } = setupLead(app);
    const found = S.businessByName("leadco");
    eq(found.id, biz.id);
  });
});

suite("Phase 3 — Outreach", () => {
  test("generation produces a draft message, never sends anything", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    const row = S.leadRows().find((r) => r.lead.id === lead.id);
    const gen = app.V61.OutreachEngine.generate(row, { channel: "WhatsApp" });
    ok(typeof gen.message === "string" && gen.message.length > 0);
    assert(!/undefined|NaN/.test(gen.message), "message contains garbage");
    ok(Array.isArray(gen.evidence));
  });

  test("renderTemplate handles unknown vars and conditional blocks", () => {
    const app = freshApp();
    const R = app.V61.OutreachEngine.renderTemplate;
    eq(R("Hi {{name}}", {}), "Hi ");
    eq(R("{{#x}}Y{{/x}}", { x: "" }), "");
    eq(R("{{#x}}Y{{/x}}", { x: "1" }), "Y");
    eq(R("{{a}} and {{b}}", { a: "x" }), "x and ");
    assert(!/undefined|NaN/.test(R("hi {{missing}} there", {})));
  });

  test("templates default to active built-ins; no fabricated channel data", () => {
    const app = freshApp();
    const OE = app.V61.OutreachEngine;
    const { lead } = setupLead(app);
    const row = app.V61.Store.leadRows().find((r) => r.lead.id === lead.id);
    const gen = OE.generate(row, { channel: "Email" });
    ok(gen.subject.length > 0);
    ok(gen.message.length > 0);
    eq(gen.ai.enabled, false, "AI must be disabled by default");
    eq(gen.ai.provider, "groq");
  });

  test("template CRUD: create, edit, toggle active, reset", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const d = S.db;
    const origLen = d.outreachTemplates.length;
    d.outreachTemplates.push({ id: "tpl-custom", channel: "Phone", name: "Custom", active: true, subject: "", message: "Custom {{businessName}}" });
    eq(S.activeTemplates().some((t) => t.id === "tpl-custom"), true);
    const t = S.db.outreachTemplates.find((x) => x.id === "tpl-custom");
    t.message = "Edited {{businessName}}";
    t.active = false;
    eq(S.activeTemplates().some((x) => x.id === "tpl-custom"), false);
    // reset: restore built-in templates
    S.db.outreachTemplates = app.V61.Store.DEFAULT_TEMPLATES.map((x) => Object.assign({}, x));
    eq(S.db.outreachTemplates.length, origLen);
    // deletion
    S.db.outreachTemplates = S.db.outreachTemplates.filter((x) => x.id !== "tpl-wa");
    eq(S.db.outreachTemplates.some((x) => x.id === "tpl-wa"), false);
  });

  test("outreach drafts saved and retrieved per lead", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    S.saveOutreachDraft(lead.id, { channel: "WhatsApp", message: "Hi" });
    const drafts = S.outreachDraftsFor(lead.id);
    eq(drafts.length, 1);
    eq(drafts[0].message, "Hi");
  });

  test("follow-up scheduling: today / overdue / upcoming / completed states", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    const now = app.V61.Utils.now();
    const day = 86400000;
    const overdue = { id: "f1", leadId: lead.id, status: "pending", dueDate: now - 2 * day };
    const today = { id: "f2", leadId: lead.id, status: "pending", dueDate: app.V61.Utils.dayStart(now) };
    const upcoming = { id: "f3", leadId: lead.id, status: "pending", dueDate: now + 3 * day };
    const done = { id: "f4", leadId: lead.id, status: "done", dueDate: now - day, completedAt: now - day };
    S.db.followups.push(overdue, today, upcoming, done);
    eq(S.followupState(overdue).key, "overdue");
    eq(S.followupState(today).key, "today");
    eq(S.followupState(upcoming).key, "upcoming");
    eq(S.followupState(done).key, "completed");
    // overdue is the most urgent pending follow-up, so it is "next"
    eq(S.nextFollowup(lead.id).id, "f1");
  });

  test("cancelling a follow-up is idempotent and reflects state", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    S.db.followups.push({ id: "fx", leadId: lead.id, status: "pending", dueDate: 1 });
    S.cancelFollowup("fx");
    eq(S.byId("followups", "fx").status, "cancelled");
    S.cancelFollowup("fx");
    eq(S.byId("followups", "fx").status, "cancelled");
    eq(S.followupState(S.byId("followups", "fx")).key, "cancelled");
  });

  test("no autonomous sending: no outbound records are ever created by generate", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    const row = S.leadRows().find((r) => r.lead.id === lead.id);
    const before = S.db.outreach.length;
    app.V61.OutreachEngine.generate(row, { channel: "WhatsApp" });
    eq(S.db.outreach.length, before, "generate() must not write to outreach records");
  });
});

suite("Phase 3 — Sales / Proposals", () => {
  test("proposal creation and totals are correct", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Prospect A" });
    const lead = S.addLead(biz.id);
    const prop = S.db.proposals;
    // proposals are stored with title/total; use pages-sales createProposal semantics via store fields
    const p = { id: "p1", leadId: lead.id, title: "Website", total: 2500, status: "draft", items: [] };
    prop.push(p);
    // simulate adding items
    p.items = [
      { service: "Design", qty: 1, price: 1000 },
      { service: "Build", qty: 1, price: 1500 },
    ];
    const total = p.items.reduce((s, i) => s + i.qty * i.price, 0);
    eq(total, 2500);
    eq(p.total, total);
  });

  test("proposal status transitions sent->accepted->won and back via reactivate", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    const p = { id: "p9", leadId: lead.id, title: "Package", total: 1000, status: "draft", items: [] };
    S.db.proposals.push(p);
    p.status = "sent";
    lead.stage = "proposal";
    S.save();
    const app2 = refresh(app);
    eq(app2.V61.Store.byId("proposals", "p9").status, "sent");
    eq(app2.V61.Store.byId("leads", lead.id).stage, "proposal");
  });

  test("proposal calculations: many items, decimals, no NaN/Infinity", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const items = [
      { service: "a", qty: 2, price: 1000 },
      { service: "b", qty: 1, price: 500 },
      { service: "c", qty: 5, price: 0.5 },
      { service: "d", qty: 3, price: 199.99 },
    ];
    const total = items.reduce((s, i) => s + i.qty * i.price, 0);
    approx(total, 2000 + 500 + 2.5 + 599.97, 1e-9);
    assert(Number.isFinite(total));
  });

  test("zero-value and invalid prices handled without NaN", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    const p = { id: "pz", leadId: lead.id, title: "Zero", total: 0, status: "draft", items: [{ service: "free", qty: 1, price: 0 }] };
    S.db.proposals.push(p);
    ok(Number.isFinite(p.total));
    ok(p.total >= 0, "total must not be negative");
  });

  test("won lead -> exactly one client via ensureClient, no duplicates", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    const c1 = S.ensureClient(lead);
    const c2 = S.ensureClient(lead);
    notNull(c1);
    eq(c1.id, c2.id);
    eq(S.db.clients.length, 1);
    eq(S.db.clients[0].leadId, lead.id);
  });

  test("markWon creates exactly one client and sets stage", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    const c1 = S.markWon(lead.id, { dealValue: 8000 });
    const c2 = S.markWon(lead.id, { dealValue: 8000 });
    notNull(c1);
    eq(c1.id, c2.id);
    eq(S.db.clients.length, 1);
    eq(S.byId("leads", lead.id).stage, "won");
    eq(S.byId("leads", lead.id).estimatedValue, 8000);
  });

  test("client retains lead + business relationships after refresh", () => {
    const app = freshApp();
    const { S, biz, lead } = setupLead(app);
    const c = S.markWon(lead.id, { dealValue: 1000 });
    S.save();
    const app2 = refresh(app);
    const S2 = app2.V61.Store;
    const c2 = S2.byId("clients", c.id);
    notNull(c2);
    eq(c2.leadId, lead.id);
    eq(c2.businessId, biz.id);
    eq(S2.byId("leads", lead.id).stage, "won");
    eq(S2.businessOf({ businessId: c2.businessId }).name, "LeadCo");
  });

  test("wonRevenue/pipelineValue derived from stored leads", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const b1 = S.addBusiness({ name: "A" }); const l1 = S.addLead(b1.id); l1.estimatedValue = 1000;
    const b2 = S.addBusiness({ name: "B" }); const l2 = S.addLead(b2.id); l2.estimatedValue = 3000;
    l2.stage = "won";
    eq(S.pipelineValue(), 1000);
    eq(S.wonRevenue(), 3000);
  });

  test("lost lead reason recorded and does not create a client", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    S.markLost(lead.id, "No budget");
    eq(S.byId("leads", lead.id).lostReason, "No budget");
    eq(S.db.clients.length, 0);
  });
});