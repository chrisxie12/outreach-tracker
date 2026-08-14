/* Tiny synchronous test framework for the QA harness. */
"use strict";

let suites = [];
let current = null;

function suite(name, fn) {
  suites.push({ name, fn });
}

function test(name, fn) {
  if (!current) throw new Error("test() called outside a suite");
  current.tests.push({ name, fn });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || "not equal") + " — expected " + JSON.stringify(expected) + " got " + JSON.stringify(actual));
  }
}

function approx(actual, expected, tol, msg) {
  if (typeof actual !== "number" || Math.abs(actual - expected) > (tol || 1e-9)) {
    throw new Error((msg || "not approx") + " — expected " + expected + " got " + JSON.stringify(actual));
  }
}

function ok(cond, msg) { assert(!!cond, msg || "expected truthy"); }

function isNull(v, msg) { assert(v === null || v === undefined, (msg || "expected null/undefined") + " got " + JSON.stringify(v)); }

function notNull(v, msg) { assert(v !== null && v !== undefined, (msg || "expected a value") + " got " + JSON.stringify(v)); }

/* Render a page and scan the produced HTML for numeric/undefined garbage. */
function assertCleanHTML(html, label) {
  const bad = [];
  if (/NaN/.test(html)) bad.push("NaN");
  if (/undefined/.test(html)) bad.push("undefined");
  if (/Infinity/.test(html)) bad.push("Infinity");
  if (/null/.test(html)) bad.push("null");
  assert(bad.length === 0, (label || "HTML") + " contains forbidden tokens: " + bad.join(", ") + " — first 200 chars: " + String(html).slice(0, 200));
}

async function runAll() {
  let pass = 0, fail = 0;
  const failures = [];
  for (const s of suites) {
    current = { name: s.name, tests: [] };
    try { await s.fn(); } catch (e) { failures.push({ suite: s.name, test: "(suite setup)", err: e }); fail++; }
    for (const t of current.tests) {
      try { await t.fn(); pass++; }
      catch (e) { fail++; failures.push({ suite: s.name, test: t.name, err: e }); }
    }
    current = null;
  }
  return { pass, fail, failures };
}

module.exports = { suite, test, assert, eq, approx, ok, isNull, notNull, assertCleanHTML, runAll };