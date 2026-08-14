"use strict";
const { suite, test, assert, eq, ok, isNull, notNull, assertCleanHTML, runAll } = require("./framework");
const { freshApp, refresh, createApp, KEY } = require("./harness");

suite("Harness sanity", () => {
  test("fresh app loads store with empty collections", () => {
    const app = freshApp();
    const S = app.V61.Store;
    notNull(S.db, "db loaded");
    eq(S.db.businesses.length, 0);
    eq(S.db.leads.length, 0);
    ok(Array.isArray(S.db.followups), "followups defaulted");
    ok(Array.isArray(S.db.projectTasks), "projectTasks defaulted");
    ok(Array.isArray(S.db.invoices), "invoices defaulted");
  });

  test("no eval errors on load", () => {
    const app = freshApp();
    const errs = app.getErrors();
    assert(errs.length === 0, "errors: " + errs.join("; "));
  });

  test("addBusiness + addLead work", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Test Cafe", phone: "0241234567" });
    const lead = S.addLead(biz.id, { source: "manual" });
    notNull(biz.id);
    eq(lead.businessId, biz.id);
    eq(S.db.businesses.length, 1);
    eq(S.db.leads.length, 1);
  });
});

if (require.main === module) {
  const results = runAll();
  console.log(JSON.stringify({ pass: results.pass, fail: results.fail, failures: results.failures }, null, 2));
  process.exit(results.fail ? 1 : 0);
}