/* QA Phase 4 — Service Catalog, Proposals, Invoices, Pricing integrity.
   Exercises the service catalog system: creation/editing/deactivation,
   proposal building from the catalog, price snapshots, custom quotes,
   service→invoice linkage, empty-catalog fallbacks, and invalid-price
   hardening (no NaN/Infinity/negative totals). */
"use strict";
const { suite, test, assert, eq, ok, isNull, notNull, approx, assertCleanHTML } = require("./framework");
const { freshApp, refresh } = require("./harness");

function addSvc(S, overrides) {
  const svc = Object.assign({ id: "svc-" + (S.db.services.length + 1), name: "Website Build", description: "", price: 5000, deliveryDays: 14, active: true }, overrides || {});
  S.db.services.push(svc);
  return svc;
}

function normalizeNameForTest(name) {
  return String(name || "").trim().toLowerCase();
}

function setupLead(app) {
  const S = app.V61.Store;
  const biz = S.addBusiness({ name: "Prospect Co" });
  const lead = S.addLead(biz.id);
  return { S, biz, lead };
}

/* Drive a modal: set input value then click the save button. */
function fillModal(app, values, saveSel) {
  const w = app.window;
  const m = w.document.querySelector(".modal-overlay");
  notNull(m, "expected an open modal");
  for (const [sel, val] of Object.entries(values)) {
    const el = m.querySelector(sel);
    if (el) { el.value = val; el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); }
  }
  const btn = m.querySelector(saveSel || "[data-save]");
  notNull(btn, "expected a save button");
  btn.dispatchEvent(new w.Event("click", { bubbles: true }));
}

suite("Phase 4 — Service catalog", () => {
  test("renderServices: active count, starting price from active services, no NaN", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { price: 5000 });
    addSvc(S, { name: "SEO", price: 2000 });
    addSvc(S, { name: "Retired", price: 100, active: false });
    S.save();
    app.V61.Pages.services();
    const html = app.window.document.getElementById("content").innerHTML;
    assertCleanHTML(html, "services");
    ok(html.indexOf("2 active services") >= 0, "active count uses active only");
    ok(html.indexOf("starting from GH₵ 2000") >= 0, "starting price ignores inactive + finds min of active");
  });

  test("renderServices: empty catalog shows empty state and no crash", () => {
    const app = freshApp();
    app.V61.Pages.services();
    const html = app.window.document.getElementById("content").innerHTML;
    assertCleanHTML(html, "services empty");
    ok(html.indexOf("0 active services") >= 0, "shows zero active");
    ok(html.indexOf("No services yet") >= 0, "empty state present");
  });

  test("renderServices: inactive services dimmed but listed", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { price: 5000 });
    addSvc(S, { name: "Retired", price: 100, active: false });
    app.V61.Pages.services();
    const html = app.window.document.getElementById("content").innerHTML;
    ok(html.indexOf("Retired") >= 0, "inactive service still listed");
    ok(html.indexOf("Inactive") >= 0, "inactive badge rendered");
    assertCleanHTML(html, "services mixed");
  });

  test("addService modal creates an active service with clamped price", () => {
    const app = freshApp();
    const S = app.V61.Store;
    app.V61.Cmd.addService();
    fillModal(app, { "#s-name": "Social Media", "#s-price": "1500", "#s-days": "21" });
    eq(S.db.services.length, 1);
    const s = S.db.services[0];
    eq(s.name, "Social Media");
    eq(s.price, 1500);
    eq(s.deliveryDays, 21);
    eq(s.active, true);
  });

  test("editService updates fields and negative price is clamped to 0", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { price: 5000 });
    app.V61.Cmd.editService(S.db.services[0].id);
    fillModal(app, { "#s-name": "Renamed", "#s-price": "-50", "#s-days": "7" });
    const s = S.db.services[0];
    eq(s.name, "Renamed");
    eq(s.price, 0, "negative price clamped to 0");
    eq(s.deliveryDays, 7);
  });

  test("toggleService flips active and excludes from active count", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { price: 5000 });
    app.V61.Cmd.toggleService(S.db.services[0].id);
    eq(S.db.services[0].active, false);
    app.V61.Pages.services();
    const html = app.window.document.getElementById("content").innerHTML;
    ok(html.indexOf("0 active services") >= 0, "inactive service not counted");
  });

  test("delService removes service from catalog", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { price: 5000 });
    app.V61.Cmd.delService(S.db.services[0].id);
    const w = app.window;
    const m = w.document.querySelector(".modal-overlay");
    notNull(m, "confirm dialog opened");
    m.querySelector("[data-ok]").dispatchEvent(new w.Event("click", { bubbles: true }));
    eq(S.db.services.length, 0);
  });
});

suite("Phase 4 — Proposals from catalog", () => {
  test("createProposal prefills a matching catalog service and snapshots its price", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    addSvc(S, { name: "Website Development", price: 5000 });
    const propCount = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id, "Website Development");
    fillModal(app, {});
    eq(S.db.proposals.length, propCount + 1);
    const p = S.db.proposals[propCount];
    eq(p.items.length, 1);
    eq(p.items[0].serviceId, S.db.services[0].id);
    eq(p.items[0].price, 5000, "price snapshot at creation");
    eq(p.total, 5000);
  });

  test("catalog price change does not mutate an existing proposal", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    addSvc(S, { name: "Website Development", price: 5000 });
    const before = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id, "Website Development");
    fillModal(app, {});
    const p = S.db.proposals[before];
    S.db.services[0].price = 9000;
    S.save();
    eq(p.items[0].price, 5000, "existing proposal keeps original price");
    eq(p.total, 5000);
  });

  test("seeded catalog price change does not mutate an existing proposal (scenario 6)", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    S.seedOfficialCatalog();
    const before = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id, "Website Development");
    fillModal(app, {});
    const p = S.db.proposals[before];
    eq(p.items[0].price, 3500, "price snapshot at creation");
    const wd = S.db.services.find((s) => s.name === "Website Development");
    wd.price = 9999;
    S.save();
    eq(p.items[0].price, 3500, "existing proposal keeps original price after catalog change");
    eq(p.total, 3500);
  });

  test("createProposal with a custom quote (manual item) when service has no catalog match", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    const before = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id, null, { name: "Custom Bundle", price: 3500 });
    fillModal(app, {});
    const p = S.db.proposals[before];
    eq(p.items.length, 1);
    eq(p.items[0].serviceId, null);
    eq(p.items[0].name, "Custom Bundle");
    eq(p.items[0].price, 3500);
  });

  test("createProposal with empty catalog still allows manual line items", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    eq(S.db.services.length, 0);
    const before = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id);
    fillModal(app, { ".p-name": "Manual Deliverable", ".p-price": "1200" });
    eq(S.db.proposals.length, before + 1);
    const p = S.db.proposals[before];
    eq(p.items.length, 1);
    eq(p.items[0].name, "Manual Deliverable");
    eq(p.items[0].price, 1200);
    eq(p.total, 1200);
  });

  test("createProposal refuses to save with zero line items", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    const before = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id);
    fillModal(app, {});
    eq(S.db.proposals.length, before, "no proposal created without items");
  });

  test("multiple services produce correct totals with no NaN/Infinity", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    addSvc(S, { name: "Design", price: 1000 });
    addSvc(S, { name: "Build", price: 1500 });
    addSvc(S, { name: "SEO", price: 750 });
    const before = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id);
    fillModal(app, {});
    const p = S.db.proposals[before];
    ok(Number.isFinite(p.total));
    approx(p.total, 3250, 1e-9);
    approx(p.subtotal, 3250, 1e-9);
    eq(p.items.length, 3);
  });

  test("proposal total never negative (discount capped at 0)", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    addSvc(S, { name: "Build", price: 1500 });
    const before = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id);
    fillModal(app, { "#p-discount": "5000" });
    const p = S.db.proposals[before];
    ok(Number.isFinite(p.total));
    ok(p.total >= 0, "total not negative");
    eq(p.total, 0);
  });

  test("renderProposals survives a proposal with missing items", () => {
    const app = freshApp();
    const { S, lead } = setupLead(app);
    S.db.proposals.push({ id: "noitems", leadId: lead.id, title: "Legacy", total: 100, status: "draft" });
    app.V61.Pages.proposals();
    const html = app.window.document.getElementById("content").innerHTML;
    assertCleanHTML(html, "proposals legacy");
    ok(html.indexOf("Legacy") >= 0, "proposal still rendered");
    ok(html.indexOf("line item") >= 0, "count falls back to 0");
  });
});

suite("Phase 4 — Service → invoice linkage", () => {
  test("invoice items carry the catalog service name and correct totals", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { name: "Website Development", price: 5000 });
    const biz = S.addBusiness({ name: "Client Co" });
    const lead = S.addLead(biz.id);
    const client = S.markWon(lead.id, {});
    const inv = S.addInvoice(client.id, {});
    S.addInvoiceItem(inv.id, { service: "Website Development", quantity: 1, unitPrice: 5000 });
    const items = S.invoiceItemsFor(inv.id);
    eq(items.length, 1);
    eq(items[0].service, "Website Development");
    eq(inv.subtotal, 5000);
    eq(inv.total, 5000);
    eq(inv.balance, 5000);
  });

  test("service linked at proposal also flows into invoice with no NaN", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { name: "Website Development", price: 5000 });
    addSvc(S, { name: "Google Business Profile", price: 1500 });
    const biz = S.addBusiness({ name: "Client Co" });
    const lead = S.addLead(biz.id);
    const client = S.markWon(lead.id, {});
    const inv = S.addInvoice(client.id, {});
    S.addInvoiceItem(inv.id, { service: "Website Development", quantity: 1, unitPrice: 5000 });
    S.addInvoiceItem(inv.id, { service: "Google Business Profile", quantity: 1, unitPrice: 1500 });
    approx(inv.total, 6500, 1e-9);
    ok(Number.isFinite(inv.total));
    ok(Number.isFinite(inv.balance));
  });

  test("addInvoiceItem rejects invalid prices (no NaN/Infinity/negative)", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Client Co" });
    const lead = S.addLead(biz.id);
    const client = S.markWon(lead.id, {});
    const inv = S.addInvoice(client.id, {});
    const bad = [
      { service: "a", quantity: NaN, unitPrice: "abc" },
      { service: "b", quantity: -1, unitPrice: -100 },
      { service: "c", quantity: Infinity, unitPrice: Infinity },
      { service: "d", quantity: null, unitPrice: null },
    ];
    bad.forEach((x) => S.addInvoiceItem(inv.id, x));
    const items = S.invoiceItemsFor(inv.id);
    items.forEach((it) => {
      ok(Number.isFinite(it.quantity), "quantity finite for " + it.service);
      ok(Number.isFinite(it.unitPrice), "unitPrice finite for " + it.service);
      ok(it.quantity >= 0, "quantity non-negative for " + it.service);
      ok(it.unitPrice >= 0, "unitPrice non-negative for " + it.service);
    });
    ok(Number.isFinite(inv.total));
    ok(Number.isFinite(inv.balance));
    ok(inv.total >= 0);
  });
});

suite("Phase 4 — Opportunity → proposal bridge", () => {
  test("addToProposal falls back to a manual line item when no active catalog match", () => {
    const app = freshApp();
    const { S, biz, lead } = setupLead(app);
    S.upsertAudit(biz.id, { website: { exists: false }, google: { exists: false } });
    const recs = app.V61.OpportunityEngine.recommended({ lead, business: biz, audit: S.auditOf(biz.id) });
    ok(recs.length > 0, "opportunity engine produced recommendations");
    const first = recs[0].service;
    const hasMatch = S.db.services.some((s) => s.active && s.name.toLowerCase() === String(first).toLowerCase());
    ok(!hasMatch, "no catalog service matches the recommendation name (empty catalog)");
    const before = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id, null, { name: first, price: 0 });
    fillModal(app, {});
    eq(S.db.proposals.length, before + 1, "manual proposal draft created from recommendation");
    const p = S.db.proposals[before];
    eq(p.items[0].name, first);
  });

  test("addToProposal uses catalog price when a name matches", () => {
    const app = freshApp();
    const { S, biz, lead } = setupLead(app);
    S.upsertAudit(biz.id, { website: { exists: false }, google: { exists: false } });
    const rec = app.V61.OpportunityEngine.recommended({ lead, business: biz, audit: S.auditOf(biz.id) })[0];
    addSvc(S, { name: rec.service, price: 4200 });
    const before = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id, rec.service);
    fillModal(app, {});
    const p = S.db.proposals[before];
    eq(p.items[0].serviceId, S.db.services[0].id);
    eq(p.items[0].price, 4200);
  });
});

suite("Phase 4 — Official launch catalog (seed)", () => {
  test("seedOfficialCatalog creates exactly the 12 official services, all active, numeric prices", () => {
    const app = freshApp();
    const S = app.V61.Store;
    eq(S.db.services.length, 0, "empty before seeding");
    const created = S.seedOfficialCatalog();
    eq(created, 12);
    eq(S.db.services.length, 12);
    const names = S.db.services.map((s) => s.name).sort();
    eq(names.join("|"),
      "Basic Brand Identity|Business Email Setup|E-commerce Website|Google Business Profile Optimization|Google Business Profile Setup|Landing Page Development|Local SEO Setup|Logo Design|SEO Setup & Optimization|Social Media Setup|Website Development|Website Redesign");
    S.db.services.forEach((s) => {
      ok(s.active === true, s.name + " active");
      eq(typeof s.price, "number", s.name + " numeric price");
      ok(Number.isFinite(s.price), s.name + " finite price");
      ok(String(s.price).indexOf("GH₵") === -1, s.name + " price has no GH₵ string");
      ok(s.price >= 0, s.name + " non-negative price");
      ok(s.deliveryDays >= 1, s.name + " delivery days set");
    });
    const byName = (n) => S.db.services.find((s) => s.name === n);
    eq(byName("Website Development").price, 3500);
    eq(byName("E-commerce Website").price, 10000);
    eq(byName("Business Email Setup").price, 400);
    eq(byName("Business Email Setup").deliveryDays, 1);
    eq(byName("E-commerce Website").deliveryDays, 30);
  });

  test("seeding is idempotent (no duplicates on second run)", () => {
    const app = freshApp();
    const S = app.V61.Store;
    S.seedOfficialCatalog();
    eq(S.db.services.length, 12);
    const second = S.seedOfficialCatalog();
    eq(second, 0);
    eq(S.db.services.length, 12, "no duplicates after re-seed");
  });

  test("repeated reloads create no duplicates and keep 12 services (scenario 2)", () => {
    const app = freshApp();
    const S = app.V61.Store;
    eq(S.seedOfficialCatalog(), 12, "first boot seeds the catalog");
    for (let i = 0; i < 5; i++) {
      const created = S.seedOfficialCatalog();
      eq(created, 0, "reload " + i + " creates nothing new");
    }
    eq(S.db.services.length, 12, "exactly 12 after 5 reloads");
    const uniq = new Set(S.db.services.map((s) => s.id)).size;
    eq(uniq, 12, "all ids unique");
  });

  test("seed preserves legitimate user-created services", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { name: "Video Ad Edit", price: 900 });
    S.seedOfficialCatalog();
    eq(S.db.services.length, 13);
    ok(S.db.services.some((s) => s.name === "Video Ad Edit"), "user service preserved");
  });

  test("seed does NOT overwrite an existing same-named service (user edits preserved)", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { name: "Website Development", price: 9000, description: "my custom description", deliveryDays: 40, active: false });
    S.seedOfficialCatalog();
    const wd = S.db.services.find((s) => s.name === "Website Development");
    eq(wd.price, 9000, "user price preserved");
    eq(wd.description, "my custom description", "user description preserved");
    eq(wd.deliveryDays, 40, "user delivery days preserved");
    eq(wd.active, false, "user deactivation preserved");
    eq(S.db.services.length, 12, "no duplicate created");
  });

  test("seed matches by exact normalized name but leaves the existing record untouched", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { name: "  logo design ", price: 111 });
    S.seedOfficialCatalog();
    const ld = S.db.services.find((s) => normalizeNameForTest(s.name) === "logo design");
    notNull(ld, "matched the existing service");
    eq(ld.price, 111, "existing user record untouched");
    eq(S.db.services.length, 12, "no duplicate 'Logo Design' created");
    eq(S.db.services.filter((s) => normalizeNameForTest(s.name) === "logo design").length, 1, "exactly one logo service");
  });

  test("seed does NOT reactivate an intentionally deactivated official service", () => {
    const app = freshApp();
    const S = app.V61.Store;
    S.seedOfficialCatalog();
    const lg = S.db.services.find((s) => s.name === "Logo Design");
    lg.active = false;
    S.save();
    const again = S.seedOfficialCatalog();
    eq(again, 0, "no new services created");
    eq(lg.active, false, "stays deactivated after re-seed");
  });

  test("seed leaves unrelated CRM records untouched (clients, projects, invoices, payments)", () => {
    const app = freshApp();
    const S = app.V61.Store;
    S.seedOfficialCatalog();
    S.db.clients.push({ id: "cli-test", name: "Client One" });
    S.db.projects.push({ id: "prj-test", clientId: "cli-test", name: "Website Build", status: "active", tasks: [] });
    S.db.invoices.push({ id: "inv-test", clientId: "cli-test", projectId: "prj-test", number: "INV-001", items: [{ service: "Website Development", qty: 1, unitPrice: 3500 }], total: 3500, balance: 3500, status: "draft" });
    S.db.payments.push({ id: "pay-test", invoiceId: "inv-test", amount: 0, method: "cash", date: "2026-01-01" });
    const snap = JSON.stringify(S.db);
    S.seedOfficialCatalog();
    eq(JSON.stringify(S.db), snap, "no unrelated records changed");
  });

  test("seed adds missing official services to partial/corrupted data without destroying valid ones", () => {
    const app = freshApp();
    const S = app.V61.Store;
    addSvc(S, { name: "Website Development", price: 3500 });
    addSvc(S, { name: "My Custom", price: 700 });
    S.seedOfficialCatalog();
    eq(S.db.services.length, 13, "1 existing official + 1 custom + 11 missing = 13");
    eq(S.db.services.filter((s) => s.name === "My Custom").length, 1, "custom preserved");
    eq(S.db.services.filter((s) => s.name === "Website Development").length, 1, "existing official not duplicated");
    eq(S.db.services.filter((s) => s.name === "Logo Design").length, 1, "missing official added");
  });

  test("official catalog is only populated through seedOfficialCatalog, not via load() alone", () => {
    const app = freshApp();
    const S = app.V61.Store;
    eq(S.db.services.length, 0, "load()/freshApp alone does not seed");
    const created = S.seedOfficialCatalog();
    eq(created, 12, "explicit seed call populates");
    eq(S.db.services.length, 12);
  });

  test("seeded catalog renders on Services page with no NaN/undefined", () => {
    const app = freshApp();
    const S = app.V61.Store;
    S.seedOfficialCatalog();
    S.save();
    app.V61.Pages.services();
    const html = app.window.document.getElementById("content").innerHTML;
    assertCleanHTML(html, "services seeded");
    ok(html.indexOf("12 active services") >= 0, "shows 12 active");
    ok(html.indexOf("starting from GH₵ 400") >= 0, "min price = cheapest official service");
    ok(html.indexOf("Website Development") >= 0, "lists official service");
  });

  test("empty catalog behavior remains intact before seeding", () => {
    const app = freshApp();
    const S = app.V61.Store;
    eq(S.db.services.length, 0);
    app.V61.Pages.services();
    const html = app.window.document.getElementById("content").innerHTML;
    assertCleanHTML(html, "services empty");
    ok(html.indexOf("No services yet") >= 0, "empty state still renders");
  });
});

suite("Phase 4 — OpportunityEngine → official catalog mapping", () => {
  function recNamesFor(app, biz, lead, auditPatch) {
    const S = app.V61.Store;
    S.upsertAudit(biz.id, auditPatch);
    const audit = S.auditOf(biz.id);
    return app.V61.OpportunityEngine.recommended({ lead, business: biz, audit }).map((o) => o.service);
  }

  test("weak website maps to Website Redesign (not Website Improvement)", () => {
    const app = freshApp();
    const { S, biz, lead } = setupLead(app);
    const names = recNamesFor(app, biz, lead, { website: { exists: true } });
    ok(names.indexOf("Website Redesign") >= 0, "recommends Website Redesign, got " + names.join(","));
    ok(names.indexOf("Website Improvement") === -1, "old name gone");
  });

  test("local search weaknesses map to Local SEO Setup (not Local SEO)", () => {
    const app = freshApp();
    const { S, biz, lead } = setupLead(app);
    const names = recNamesFor(app, biz, lead, { seo: { maps: false } });
    ok(names.indexOf("Local SEO Setup") >= 0, "recommends Local SEO Setup, got " + names.join(","));
    ok(names.indexOf("Local SEO") === -1, "old name gone");
  });

  test("missing social profiles map to Social Media Setup (not Social Media Management)", () => {
    const app = freshApp();
    const { S, biz, lead } = setupLead(app);
    const names = recNamesFor(app, biz, lead, {});
    ok(names.indexOf("Social Media Setup") >= 0, "recommends Social Media Setup, got " + names.join(","));
    ok(names.indexOf("Social Media Management") === -1, "old name gone");
  });

  test("every mapped recommendation matches an active catalog service after seeding", () => {
    const app = freshApp();
    const { S, biz, lead } = setupLead(app);
    S.seedOfficialCatalog();
    S.upsertAudit(biz.id, { website: { exists: true }, seo: { maps: false } });
    const audit = S.auditOf(biz.id);
    const names = app.V61.OpportunityEngine.recommended({ lead, business: biz, audit }).map((o) => o.service);
    ok(names.length > 0, "got recommendations");
    names.forEach((n) => {
      const match = S.db.services.some((s) => s.active && s.name.toLowerCase() === n.toLowerCase());
      if (["Website Redesign", "Local SEO Setup", "Social Media Setup", "Website Development", "Google Business Profile Setup", "Google Business Profile Optimization"].indexOf(n) >= 0) {
        ok(match, n + " maps to an active catalog service");
      }
    });
  });

  test("recommendation with a catalog match flows into proposal at catalog price", () => {
    const app = freshApp();
    const { S, biz, lead } = setupLead(app);
    S.seedOfficialCatalog();
    S.upsertAudit(biz.id, { website: { exists: true } });
    const rec = app.V61.OpportunityEngine.recommended({ lead, business: biz, audit: S.auditOf(biz.id) })
      .find((o) => o.service === "Website Redesign");
    notNull(rec, "Website Redesign recommended");
    const before = S.db.proposals.length;
    app.V61.Pages.sales.createProposal(lead.id, rec.service);
    fillModal(app, {});
    const p = S.db.proposals[before];
    eq(p.items.length, 1);
    eq(p.items[0].name, "Website Redesign");
    eq(p.items[0].price, 2500, "official catalog price used");
    const svc = S.db.services.find((s) => s.name === "Website Redesign");
    eq(p.items[0].serviceId, svc.id);
  });
});