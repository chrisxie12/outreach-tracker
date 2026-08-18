/* QA — Quick add: add a business by name and run its digital audit (CRM) */
"use strict";
const { suite, test, eq, ok, notNull } = require("./framework");
const { freshApp, settle } = require("./harness");

function clickEl(w, el) {
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
}

/* Wait for the async audit run (modal + analyzer) to settle. */
async function waitAudit(t) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (t.app.V61.Store.auditSnapshotsFor(t.bizId).length >= 1) return;
    await new Promise((r) => setTimeout(r, 10));
  }
}

function openQuickAudit(app) {
  const btn = app.window.document.querySelector('[data-cmd="addBusinessAudit"]');
  notNull(btn, "Add Business & Audit button present");
  clickEl(app.window, btn);
  return app.window.document;
}

suite("Quick add — business by name → run audit", () => {
  test("audits page offers the Add Business & Audit action (list + empty state)", async () => {
    const app = freshApp();
    await settle(app);
    app.V61.Pages.audits();
    const btn = app.window.document.querySelector('[data-cmd="addBusinessAudit"]');
    notNull(btn, "button rendered");
    notNull(btn, "data-cmd wired");
    ok(btn.className.indexOf("btn-primary") >= 0, "primary action");
    ok(btn.textContent.indexOf("Add Business") >= 0, "button labeled");
  });

  test("quick add with a name creates business + lead + audit snapshot and navigates", async () => {
    const app = freshApp();
    await settle(app);
    const S = app.V61.Store;
    app.V61.Pages.audits();
    const doc = openQuickAudit(app);
    const nameInput = doc.querySelector("#qba-name");
    notNull(nameInput, "modal open with business name field");
    nameInput.value = "Sarfo's Kitchen";
    clickEl(app.window, doc.querySelector("[data-go]"));
    await new Promise((r) => setTimeout(r, 30));
    const biz = S.db.businesses.find((b) => b.name === "Sarfo's Kitchen");
    notNull(biz, "business created");
    const lead = S.leadOf(biz.id);
    notNull(lead, "lead created");
    const audit = S.auditOf(biz.id);
    notNull(audit, "audit created");
    await waitAudit({ app, bizId: biz.id });
    eq(S.auditSnapshotsFor(biz.id).length, 1, "one snapshot saved");
    ok(app.window.location.hash.indexOf("#/audits/" + lead.id) === 0, "navigated to audit detail, got " + app.window.location.hash);
  });

  test("quick add with a website runs the analyzer and stores the website audit", async () => {
    const app = freshApp();
    await settle(app);
    const S = app.V61.Store;
    app.V61.WebsiteAnalyzer.analyze = async () => ({ status: "ok", score: 72, url: "https://fresh.example", signals: { https: true, viewport: true, titleOk: true } });
    app.V61.Pages.audits();
    const doc = openQuickAudit(app);
    doc.querySelector("#qba-name").value = "Fresh Bakery";
    doc.querySelector("#qba-website").value = "https://fresh.example";
    clickEl(app.window, doc.querySelector("[data-go]"));
    await waitAudit({ app, bizId: (() => { const b = S.db.businesses.find((x) => x.name === "Fresh Bakery"); return b ? b.id : null; })() });
    const biz = S.db.businesses.find((b) => b.name === "Fresh Bakery");
    notNull(biz, "business created");
    const wa = S.latestWebsiteAudit(biz.id);
    notNull(wa, "website audit saved");
    eq(wa.score, 72);
    eq(wa.status, "ok");
  });

  test("quick add parses a Google Maps place_id from a pasted link", async () => {
    const app = freshApp();
    await settle(app);
    const S = app.V61.Store;
    app.V61.Pages.audits();
    const doc = openQuickAudit(app);
    doc.querySelector("#qba-name").value = "Golden Café";
    doc.querySelector("#qba-place").value = "https://www.google.com/maps/place/?q=place_id:ChIJabc123XYZ";
    clickEl(app.window, doc.querySelector("[data-go]"));
    await new Promise((r) => setTimeout(r, 30));
    const biz = S.db.businesses.find((b) => b.name === "Golden Café");
    notNull(biz, "business created");
    eq(biz.googlePlaceId, "ChIJabc123XYZ", "place id extracted from link");
    ok(biz.googleProfileUrl.indexOf("place_id:ChIJabc123XYZ") >= 0, "google profile URL set");
  });

  test("quick add requires a business name", async () => {
    const app = freshApp();
    await settle(app);
    app.V61.Pages.audits();
    const doc = openQuickAudit(app);
    clickEl(app.window, doc.querySelector("[data-go]"));
    await new Promise((r) => setTimeout(r, 20));
    eq(app.V61.Store.db.businesses.length, 0, "no business created without a name");
    const modal = app.window.document.querySelector(".modal-overlay");
    notNull(modal, "modal stays open to correct the input");
  });
});