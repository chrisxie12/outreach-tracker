/* QA runner — executes all suites and prints the summary. */
"use strict";
const { runAll } = require("./framework");

require("./sanity.test.js");
require("./phase1-discovery.test.js");
require("./phase2-audit.test.js");
require("./phase3-leads-outreach-sales.test.js");
require("./phase4-finance.test.js");
require("./e2e.test.js");
require("./integrity.test.js");
require("./phase5-mobile-console.test.js");

const results = runAll();

const bySuite = {};
for (const f of results.failures) {
  bySuite[f.suite] = bySuite[f.suite] || [];
  bySuite[f.suite].push(f);
}

console.log("=".repeat(60));
console.log("VISION 61 CRM QA — AUTOMATED SUITE RESULTS");
console.log("=".repeat(60));
console.log("TOTAL PASS: " + results.pass);
console.log("TOTAL FAIL: " + results.fail);
console.log("");
if (results.fail) {
  for (const [suiteName, fails] of Object.entries(bySuite)) {
    console.log("── " + suiteName);
    for (const f of fails) {
      console.log("  FAIL: " + f.test);
      console.log("    " + (f.err && f.err.message ? f.err.message.split("\n")[0] : f.err));
    }
  }
  console.log("");
}
console.log("RESULT: " + (results.fail ? "FAIL" : "ALL PASS"));
process.exit(results.fail ? 1 : 0);